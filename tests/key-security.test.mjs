import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import Database from 'better-sqlite3';
const digest=s=>createHash('sha256').update(s).digest('hex');
const defaultScopes=['requirements:read','requirements:write','cases:read','taxonomy:read','media:read','media:write'];
async function harness(t){
 const dir=mkdtempSync(path.join(tmpdir(),'jack-key-security-'));
 const reserve=net.createServer().listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const database=path.join(dir,'test.db'),master=randomBytes(32).toString('hex');let child,sql;
 async function stop(){if(child&&child.exitCode===null){const end=once(child,'exit');child.kill();await end;}child=null;sql?.close();sql=null;}
 async function start(overrides={}){
  let output='';child=spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATABASE_URL:database,STORAGE_DIR:path.join(dir,'uploads'),SESSION_SECRET:'isolated-test-session-secret',API_KEY_ENCRYPTION_KEY:master,TRUSTED_PROXY_IPS:'',...overrides},stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',c=>{output+=c;});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error(output)));});
  sql=new Database(overrides.DATABASE_URL??database);return sql;
 }
 const request=async(route,{token,cookie,headers={},method='GET',body}={})=>{
  const response=await fetch(`http://127.0.0.1:${port}/api${route}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  return {status:response.status,body:await response.json(),retry:response.headers.get('retry-after'),cache:response.headers.get('cache-control'),cookie:response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};
 };
 t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
 await start();return {dir,database,master,start,stop,request,get sql(){return sql;}};
}
test('scoped encrypted keys, ownership, expiry, revocation and session-only management', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;
 const signup=await call('/auth/register',{method:'POST',body:{email:'owner@example.test',password:'test-password'}});
 assert.equal(signup.status,201);const cookie=signup.cookie,original=signup.body.apiKey,userId=signup.body.user.id;
 const row=h.sql.prepare('SELECT * FROM api_keys').get();assert.equal(row.secret_value,null);assert.ok(row.secret_encrypted.startsWith('v1.'));assert.ok(!row.secret_encrypted.includes(original));assert.deepEqual(JSON.parse(row.scopes),defaultScopes);assert.ok(row.expires_at>Date.now()/1000);
 const listed=await call('/keys',{cookie});assert.equal(listed.body[0].secretValue,original);assert.equal(listed.cache,'no-store');assert.equal(listed.body[0].secretEncrypted,undefined);
 for(const [route,method,body] of [['/keys','GET'],['/keys/rotate','POST',{}],['/keys/taxonomy','POST',{}],['/keys/'+row.id,'DELETE']])assert.equal((await call(route,{token:original,cookie,method,body})).status,403);
 assert.equal((await call('/requirements',{token:original})).status,200);
 assert.equal((await call('/requirements',{token:original,method:'POST',body:{title:'Scoped requirement',content:'Private owner requirement'}})).status,201);
 for(const route of ['/users','/requirements?scope=all','/cases?scope=all','/audit-logs','/stats','/admin/skill'])assert.equal((await call(route,{token:original})).status,403);
 assert.equal((await call('/cases',{token:original})).status,200);
 assert.equal((await call('/categories',{token:original,method:'POST',body:{name:'Denied',slug:'denied'}})).status,403);
 assert.equal((await call('/keys/rotate',{cookie,method:'POST',body:{scopes:['users:write']}})).status,400);
 assert.equal((await call('/keys/rotate',{cookie,method:'POST',body:{expiresInDays:91}})).status,400);
 assert.equal((await call('/keys/taxonomy',{cookie,method:'POST',body:{}})).status,403);
 assert.equal((await call('/keys/rotate',{cookie,method:'POST',body:{scopes:['taxonomy:write']}})).status,403);
 h.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(userId);
 h.sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('other','other@example.test','unused','student','active',1);
 h.sql.prepare('INSERT INTO requirements(id,user_id,title,content,created_at) VALUES(?,?,?,?,?)').run('private','other','Other requirement','Other private content',1);
 h.sql.prepare('INSERT INTO cases(id,title,summary,created_at) VALUES(?,?,?,?)').run('draft','Private draft','Private draft case',1);
 // A scoped key of an admin must not inherit resource-manager bypasses.
 for(const route of ['/requirements/private','/cases/draft']){
  assert.equal((await call(route,{token:original})).status,404);assert.equal((await call(route,{cookie})).status,200);
 }
 assert.equal((await call('/requirements/private',{token:original,method:'PATCH',body:{title:'Denied edit'}})).status,404);
 const taxonomy=await call('/keys/taxonomy',{cookie,method:'POST',body:{expiresInDays:7}});assert.equal(taxonomy.status,201);
 const taxKey=taxonomy.body.apiKey;assert.deepEqual(taxonomy.body.scopes,['taxonomy:read','taxonomy:write']);
 assert.equal((await call('/categories',{token:taxKey,method:'POST',body:{name:'Allowed',slug:'allowed'}})).status,201);
 assert.equal((await call('/tags?scope=all',{token:taxKey})).status,200);
 for(const route of ['/users','/keys','/requirements','/cases'])assert.equal((await call(route,{token:taxKey})).status,403);
 assert.equal((await call('/users/other',{token:taxKey,method:'PATCH',body:{status:'disabled'}})).status,403);
 const again=await call('/keys/taxonomy',{cookie,method:'POST',body:{}});assert.equal(again.status,201);assert.equal((await call('/me',{token:taxKey})).status,401);assert.equal((await call('/me',{token:original})).status,200);
 const rotated=await call('/keys/rotate',{cookie,method:'POST',body:{scopes:['requirements:read'],expiresInDays:1}});assert.equal(rotated.status,201);const limited=rotated.body.apiKey;
 for(const token of [original,again.body.apiKey])assert.equal((await call('/me',{token})).status,401);
 assert.equal((await call('/requirements',{token:limited})).status,200);assert.equal((await call('/requirements',{token:limited,method:'POST',body:{title:'No write',content:'No write allowed'}})).status,403);
 const limitedRow=h.sql.prepare('SELECT * FROM api_keys WHERE hash=?').get(digest(limited));
 await h.stop();await h.start();assert.equal((await call('/keys',{cookie})).body.find(k=>k.id===limitedRow.id).secretValue,limited,'stable master/session survives restart');
 h.sql.prepare('UPDATE api_keys SET expires_at=? WHERE id=?').run(Math.floor(Date.now()/1000),limitedRow.id);assert.equal((await call('/me',{token:limited})).status,401);
 const fresh=await call('/keys/rotate',{cookie,method:'POST',body:{}});assert.equal(fresh.status,201);
 const freshRow=h.sql.prepare('SELECT id FROM api_keys WHERE hash=?').get(digest(fresh.body.apiKey));
 assert.equal((await call('/keys/'+freshRow.id,{cookie,method:'DELETE'})).status,200);assert.equal((await call('/me',{token:fresh.body.apiKey})).status,401);
});
test('legacy plaintext migration, hash-only compatibility, missing/wrong master and restored backup', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;
 const signup=await call('/auth/register',{method:'POST',body:{email:'legacy@example.test',password:'test-password'}}),cookie=signup.cookie;
 const legacy='legacy-'+randomBytes(32).toString('hex'),hashOnly='hash-only-'+randomBytes(32).toString('hex');
 h.sql.prepare('INSERT INTO api_keys(id,user_id,name,prefix,hash,secret_value,created_at) VALUES(?,?,?,?,?,?,?)').run('legacy',signup.body.user.id,'Legacy','legacy',digest(legacy),legacy,1);
 h.sql.prepare('INSERT INTO api_keys(id,user_id,name,prefix,hash,created_at) VALUES(?,?,?,?,?,?)').run('hash-only',signup.body.user.id,'Hash only','old',digest(hashOnly),1);
 await h.stop();await h.start({API_KEY_ENCRYPTION_KEY:''});
 for(const token of [legacy,hashOnly,signup.body.apiKey])assert.equal((await call('/me',{token})).status,200);
 const hidden=await call('/keys',{cookie});assert.ok(hidden.body.every(k=>k.secretValue===null));assert.equal(hidden.body.find(k=>k.id==='legacy').legacy,true);
 assert.equal((await call('/keys',{token:legacy})).status,403);
 assert.equal((await call('/keys/rotate',{cookie,method:'POST',body:{}})).status,503);assert.equal((await call('/me',{token:legacy})).status,200,'failed rotation never revokes old keys');
 assert.equal(h.sql.prepare("SELECT secret_value FROM api_keys WHERE id='legacy'").get().secret_value,legacy,'missing config leaves data untouched for migration');
 await h.stop();await h.start();
 const migrated=h.sql.prepare("SELECT * FROM api_keys WHERE id='legacy'").get();assert.equal(migrated.secret_value,null);assert.ok(migrated.secret_encrypted);assert.equal(migrated.scopes,null);assert.equal(migrated.expires_at,null);
 const readable=(await call('/keys',{cookie})).body;assert.equal(readable.find(k=>k.id==='legacy').secretValue,legacy);assert.equal(readable.find(k=>k.id==='hash-only').secretValue,null);
 for(const token of [legacy,hashOnly])assert.equal((await call('/requirements',{token})).status,200);
 h.sql.pragma('wal_checkpoint(TRUNCATE)');
 for(const file of [h.database,h.database+'-wal'])if(existsSync(file))assert.ok(!readFileSync(file).includes(Buffer.from(legacy)),'live migrated DB and WAL do not retain plaintext');
 const backup=path.join(h.dir,'backup.db');await h.sql.backup(backup);
 await h.stop();await assert.rejects(h.start({API_KEY_ENCRYPTION_KEY:randomBytes(32).toString('hex')}),/decryption failed/);
 await h.stop();await h.start();assert.equal((await call('/keys',{cookie})).body.find(k=>k.id==='legacy').secretValue,legacy);
 await h.stop();await h.start({DATABASE_URL:backup});assert.equal((await call('/keys',{cookie})).body.find(k=>k.id==='legacy').secretValue,legacy,'backup restored with stable master');
 const rotation=await call('/keys/rotate',{cookie,method:'POST',body:{}});assert.equal(rotation.status,201);
 for(const token of [legacy,hashOnly])assert.equal((await call('/me',{token})).status,401);
});
test('auth limits count success/failure and ignore forged forwarding headers by default', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;
 const signup=await call('/auth/register',{method:'POST',body:{email:'login@example.test',password:'test-password'}});assert.equal(signup.status,201);
 for(const body of [{email:'missing@example.test',password:'test-password'},{email:'login@example.test',password:'wrong-password'}]){
  const response=await call('/auth/login',{method:'POST',body});assert.equal(response.status,401);assert.deepEqual(response.body,{error:'Invalid credentials'});
 }
 h.sql.prepare("UPDATE users SET status='disabled'").run();assert.equal((await call('/auth/login',{method:'POST',body:{email:'login@example.test',password:'test-password'}})).status,401);h.sql.prepare("UPDATE users SET status='active'").run();
 // Disabled + wrong attempts above count toward the same email bucket.
 for(let i=0;i<8;i++)assert.equal((await call('/auth/login',{method:'POST',body:{email:'login@example.test',password:'test-password'}})).status,200);
 const blocked=await call('/auth/login',{method:'POST',body:{email:'login@example.test',password:'test-password'}});assert.equal(blocked.status,429);assert.ok(Number(blocked.retry)>0);
 await h.stop();await h.start();
 for(let i=0;i<20;i++)assert.equal((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${i+1}`},body:{email:`missing${i}@example.test`,password:'test-password'}})).status,401);
 const ipBlocked=await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.99'},body:{email:'new@example.test',password:'test-password'}});assert.equal(ipBlocked.status,429);assert.ok(Number(ipBlocked.retry)>0);
 await h.stop();await h.start();
 for(let i=0;i<5;i++)assert.equal((await call('/auth/register',{method:'POST',body:{email:'login@example.test',password:'test-password'}})).status,409);
 const registerBlocked=await call('/auth/register',{method:'POST',body:{email:'new@example.test',password:'test-password'}});assert.equal(registerBlocked.status,429);assert.ok(Number(registerBlocked.retry)>0);
});
test('only explicit trusted proxy peers can supply client IP; rightmost untrusted hop wins', {timeout:60000},async t=>{
 const h=await harness(t),call=h.request;await h.stop();await h.start({TRUSTED_PROXY_IPS:'127.0.0.1'});
 // A proxy appended real address to attacker-supplied left-side values: varying the left side cannot bypass limits.
 for(let i=0;i<20;i++)assert.equal((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${i+1}, 198.51.100.10`},body:{email:`unknown${i}@example.test`,password:'test-password'}})).status,401);
 assert.equal((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':'192.0.2.100, 198.51.100.10'},body:{email:'another@example.test',password:'test-password'}})).status,429);
 assert.equal((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.11'},body:{email:'another@example.test',password:'test-password'}})).status,401,'different actual proxy client has separate IP bucket');
});
