import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import Database from 'better-sqlite3';

// Use a private ephemeral database/upload directory and an OS-assigned port, never the dev database.
test('server pagination, whole-dataset filters, batching and scope isolation',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'jack-pagination-'));
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{env:{...process.env,PORT:String(port),DATABASE_URL:join(folder,'test.db'),STORAGE_DIR:join(folder,'uploads'),SESSION_SECRET:'pagination-test-only'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',x=>{logs+=x;});child.stderr.on('data',x=>{logs+=x;});
 let db;
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}db?.close();rmSync(folder,{recursive:true,force:true});});
 for(let i=0;i<200;i++){if(logs.includes('jack-case API'))break;if(child.exitCode!==null)throw Error(logs);await new Promise(resolve=>setTimeout(resolve,50));}
 assert.ok(logs.includes('jack-case API'),logs);
 db=new Database(join(folder,'test.db'));
 const insertUser=db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)');
 const insertKey=db.prepare('INSERT INTO api_keys(id,user_id,name,prefix,hash,created_at) VALUES(?,?,?,?,?,?)');
 for(const [user,role] of [['alice','student'],['bob','student'],['admin','admin']]){insertUser.run(user,user+'@example.test','unused',role,0);insertKey.run(user,user,'test','test',createHash('sha256').update(user).digest('hex'),0);}
 const insertReq=db.prepare('INSERT INTO requirements(id,user_id,title,content,created_at,category_id,industry,difficulty,implementation_status,share_consent) VALUES(?,?,?,?,?,?,?,?,?,?)');
 const insertCase=db.prepare('INSERT INTO cases(id,title,summary,status,created_at,category_id,industry,difficulty,implementation_status) VALUES(?,?,?,?,?,?,?,?,?)');
 const insertMedia=db.prepare('INSERT INTO media(id,owner_id,storage_key,mime_type,size,created_at) VALUES(?,?,?,?,?,?)');
 db.transaction(()=>{
  db.prepare('INSERT INTO categories(id,name,slug,parent_id) VALUES(?,?,?,?)').run('root','根分类','root',null);
  db.prepare('INSERT INTO categories(id,name,slug,parent_id) VALUES(?,?,?,?)').run('child','子分类','child','root');
  db.prepare('INSERT INTO categories(id,name,slug,parent_id) VALUES(?,?,?,?)').run('grandchild','孙分类','grandchild','child');
  db.prepare('INSERT INTO tags(id,name,slug) VALUES(?,?,?)').run('rare-tag','稀有标签','rare-tag');
  for(let i=0;i<205;i++){
   const old=i===0,category=old?'grandchild':null,industry=old?'医药、物流':'其他';
   insertReq.run('r'+i,'alice',old?'历史需求':'需求 '+i,old?'业务分类：历史分类\n历史问题目标':'普通业务需求',i,category,industry,old?'hard':'easy',old?'verified':'pending',old?1:0);
   insertCase.run('c'+i,old?'历史标题':'案例 '+i,old?'独特简介':'普通案例简介','published',i,category,industry,old?'hard':'easy',old?'verified':'pending');
   insertMedia.run('m'+i,'alice','unused.webp','image/webp',100,i);
   db.prepare('INSERT INTO files(id,owner_id,storage_key,name,purpose,mime_type,size,created_at) VALUES(?,?,?,?,?,?,?,?)').run('f'+i,'alice','unused.md',old?'历史资料.md':'资料 '+i+'.md',old?'agent':'reference','text/markdown',100,i);
   db.prepare('INSERT INTO requirement_files(requirement_id,file_id) VALUES(?,?)').run('r'+i,'f'+i);
   db.prepare('INSERT INTO requirement_media(requirement_id,media_id,sort_order) VALUES(?,?,?)').run('r'+i,'m'+i,0);
   db.prepare('INSERT INTO requirement_tags(requirement_id,tag_id) VALUES(?,?)').run('r'+i,'rare-tag');
   db.prepare('INSERT INTO case_tags(case_id,tag_id) VALUES(?,?)').run('c'+i,'rare-tag');
  }
  db.prepare('INSERT INTO files(id,owner_id,storage_key,name,purpose,mime_type,size,created_at) VALUES(?,?,?,?,?,?,?,?)').run('bob-file','bob','private.md','机密资料.md','other','text/markdown',100,300);
  insertReq.run('bob-only','bob','机密需求','不可泄露的内容',300,null,'保密行业','easy','pending',0);
  insertCase.run('draft','秘密草稿','未公开的案例','draft',400,null,'秘密行业','easy','pending');
  // Equal timestamps exercise the stable ID tiebreaker across multiple pages.
  for(let i=0;i<205;i++)insertUser.run('extra'+String(i).padStart(3,'0'),'extra'+i+'@example.test','unused','student',1);
 })();
 const get=async(url,user='admin',status=200)=>{const response=await fetch(`http://127.0.0.1:${port}/api${url}`,{headers:{Authorization:`Bearer ${user}`}});const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;};
 await t.test('legacy Agent arrays and explicit envelopes, last pages for all four lists',async()=>{
  for(const [url,total,lastId] of [['/cases',205,'c0'],['/requirements?scope=mine',0,null],['/media',205,'m0'],['/users',208,null]]){
   const joiner=url.includes('?')?'&':'?';const legacy=await get(url);assert.ok(Array.isArray(legacy));
   const first=await get(url+joiner+'page=1&pageSize=100');assert.equal(first.total,total);assert.equal(first.pageSize,100);assert.equal(first.page,1);
   if(total){const last=await get(url+joiner+'page=3&pageSize=100');assert.equal(last.items.length,total-200);assert.equal(last.total,total);if(lastId)assert.equal(last.items.at(-1).id,lastId);}
  }
  const mine=await get('/requirements?page=11&pageSize=20','alice');assert.equal(mine.total,205);assert.equal(mine.items.length,5);assert.equal(mine.items.at(-1).id,'r0');assert.equal(mine.items.at(-1).images[0].id,'m0');assert.equal(mine.items.at(-1).tags[0].id,'rare-tag');assert.equal(mine.items.at(-1).files[0].id,'f0');
  const defaults=await get('/cases?pageSize=1');assert.equal(defaults.page,1);assert.equal(defaults.items.length,1);assert.equal((await get('/cases?page=1')).pageSize,20);
 });
 await t.test('all filters run before pagination, include deep subcategories and industry search',async()=>{
  for(const q of ['历史标题','独特简介','医药']){const result=await get('/cases?page=1&q='+encodeURIComponent(q),'alice');assert.equal(result.total,1);assert.equal(result.items[0].id,'c0');}
  const query='page=1&categoryId=root&industry=医药&difficulty=hard&implementationStatus=verified&tagIds=rare-tag&q=独特';
  const result=await get('/cases?'+query,'alice');assert.equal(result.total,1);assert.equal(result.items[0].tags[0].id,'rare-tag');
  assert.equal((await get('/cases?'+query+'&status=draft','alice')).total,0);
  const req=await get('/requirements?scope=all&page=1&q=历史&category=孙分类&industry=物流&consent=authorized&status=submitted&tagIds=rare-tag');assert.equal(req.total,1);assert.equal(req.items[0].id,'r0');
  const facets=await get('/requirements/facets?scope=all');assert.equal(facets.total,206);assert.ok(facets.industries.includes('医药'));assert.equal(facets.categories.find(x=>x.name==='孙分类').total,1);assert.equal(facets.withoutTags,1);
  const catalog=await get('/cases/facets','alice');assert.equal(catalog.total,205);assert.ok(catalog.industries.includes('医药'));assert.ok(!catalog.industries.includes('秘密行业'));
  // Legacy embedded categories and literal SQL wildcard characters retain browser filter semantics.
  db.prepare("UPDATE requirements SET category_id=NULL WHERE id='r0'").run();assert.equal((await get('/requirements?page=1&category=历史分类','alice')).total,1);
  assert.equal((await get('/cases?page=1&q=%25','alice')).total,0);
 });
 await t.test('count and pages use the same authorized scope',async()=>{
  const bob=await get('/requirements?page=1&pageSize=100','bob');assert.equal(bob.total,1);assert.deepEqual(bob.items.map(x=>x.id),['bob-only']);
  assert.equal((await get('/requirements?page=2&pageSize=100','bob')).items.length,0);
  assert.equal((await get('/requirements?page=1&q=历史','bob')).total,0);
  assert.equal((await get('/requirements/facets','bob')).total,1);
  assert.equal((await get('/requirements?scope=all&page=1')).total,206);
  for(const url of ['/requirements?scope=all&page=2','/requirements/facets?scope=all','/cases?scope=all&page=2','/cases/facets?scope=all','/media?page=2','/users?page=2'])await get(url,'bob',403);
 });
 await t.test('strict query validation for every list and invalid scopes/filters',async()=>{
  for(const url of ['/cases','/requirements','/media','/users','/files'])for(const q of ['page=0','page=-1','page=1.5','page=1e2','page=abc','page=','page=1000001','page=1&page=2','pageSize=101','pageSize=0','pageSize=','sort=unknown','pageSize=2&pageSize=3','unexpected=1'])await get(url+'?'+q,'admin',400);
  for(const q of ['scope=bad','difficulty=extreme','implementationStatus=bad','tagIds=a,a','tagIds=','status=unknown'])await get('/cases?page=1&'+q,'admin',400);
  for(const q of ['scope=bad','consent=maybe','status=unknown'])await get('/requirements?page=1&'+q,'admin',400);
 });
 await t.test('stable sort and SQL statistics include all records',async()=>{
  const seen=[];for(let page=1;page<=3;page++){const result=await get('/users?page='+page+'&pageSize=100');seen.push(...result.items.map(x=>x.id));assert.equal(result.total,208);assert.ok(result.items.every(x=>!('passwordHash' in x)));}assert.equal(new Set(seen).size,208);
  assert.equal((await get('/cases?page=1&sort=oldest','alice')).items[0].id,'c0');
  const stats=await get('/stats');assert.equal(stats.requirements,206);assert.equal(stats.cases,206);assert.equal(stats.users,208);assert.equal(stats.pending,206);
 });
 await t.test('user safety summary counts super admins beyond the current page',async()=>{
  db.prepare("UPDATE users SET role='super_admin' WHERE id IN ('extra000','extra001')").run();
  const first=await get('/users?page=1&pageSize=100');assert.equal(first.items.filter(x=>x.role==='super_admin').length,0);
  assert.equal((await get('/users/facets')).activeSupers,2);
  db.prepare("UPDATE users SET status='disabled' WHERE id='extra001'").run();
  assert.equal((await get('/users/facets')).activeSupers,1);
  await get('/users/facets','bob',403);await get('/users/facets?unexpected=1','admin',400);
 });

 await t.test('files paginate all owned uploads with literal search and purpose filters',async()=>{
  const legacy=await get('/files','alice');assert.ok(Array.isArray(legacy));assert.equal(legacy.length,200);
  const last=await get('/files?page=11&pageSize=20','alice');assert.equal(last.total,205);assert.equal(last.items.length,5);assert.equal(last.items.at(-1).id,'f0');assert.equal(last.items.at(-1).url,'/api/files/f0/download');
  const found=await get('/files?page=1&q='+encodeURIComponent('历史')+'&purpose=agent','alice');assert.equal(found.total,1);assert.equal(found.items[0].id,'f0');
  assert.equal((await get('/files?page=1&q='+encodeURIComponent('历史'),'bob')).total,0);
  const bob=await get('/files?page=1','bob');assert.equal(bob.total,1);assert.equal(bob.items[0].id,'bob-file');
  assert.equal((await get('/files?scope=all&page=1')).total,206);assert.equal((await get('/files?scope=all&page=3&pageSize=100')).items.length,6);
  await get('/files?scope=all&page=2','alice',403);await get('/files?scope=unknown','alice',400);await get('/files?purpose=unknown&page=1','alice',400);
 });

});
