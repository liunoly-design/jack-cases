import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
// The fixture uses Node SQLite to avoid better-sqlite3 cleanup crashes on Node 24 Linux.
// The HTTP API subprocess continues to exercise the production better-sqlite3 driver.
import {DatabaseSync as Database} from 'node:sqlite';

// Real HTTP/auth/transaction regression; never opens an application database.
test('user management hierarchy', {timeout:30000}, async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'jack-admin-hierarchy-'));
  const reservation=net.createServer().listen(0,'127.0.0.1');
  await once(reservation,'listening');
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const database=path.join(dir,'test.db');
  const child=spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{
    env:{...process.env,PORT:String(port),DATABASE_URL:database,STORAGE_DIR:path.join(dir,'uploads')},stdio:['ignore','pipe','pipe']
  });
  let output='';child.stderr.on('data',c=>{output+=c;});
  let sql;
  t.after(async()=>{const exited=once(child,'exit');child.kill();await exited;sql?.close();rmSync(dir,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error(output)));});
  sql=new Database(database);
  const roles=['student','reviewer','admin','super_admin'];
  const reset=()=>{
    sql.exec('DELETE FROM audit_logs; DELETE FROM api_keys; DELETE FROM users;');
    for(const [id,role] of [...roles.map(role=>[role,role]),['peer-admin','admin'],['peer-super','super_admin']]){
      sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,`${id}@example.test`,'unused',role,'active',1);
      sql.prepare('INSERT INTO api_keys(id,user_id,name,prefix,hash,created_at) VALUES(?,?,?,?,?,?)').run(id,id,'test',id,createHash('sha256').update(id).digest('hex'),1);
    }
  };
  const snapshot=()=>sql.prepare('SELECT * FROM users ORDER BY id').all();
  const audits=()=>sql.prepare('SELECT * FROM audit_logs').all();
  const patch=async(actor,target,data)=>{
    const response=await fetch(`http://127.0.0.1:${port}/api/users/${target}`,{method:'PATCH',headers:{Authorization:`Bearer ${actor}`,'Content-Type':'application/json'},body:JSON.stringify(data)});
    return {status:response.status,body:await response.json()};
  };
  const rejected=async(actor,target,data,status)=>{
    const before=snapshot(),beforeAudit=audits();
    assert.equal((await patch(actor,target,data)).status,status);
    assert.deepEqual(snapshot(),before,'rejected request must preserve every user');
    assert.deepEqual(audits(),beforeAudit,'rejected request must not write success audit');
  };
  for(const actor of roles)for(const target of roles){
    await t.test(`${actor} disabling ${target}`,async()=>{
      reset();
      const allowed=actor==='super_admin'&&target!=='super_admin'||actor==='admin'&&['student','reviewer'].includes(target);
      if(!allowed){await rejected(actor,target,{status:'disabled'},['admin','super_admin'].includes(actor)&&actor===target?400:403);return;}
      assert.equal((await patch(actor,target,{status:'disabled'})).status,200);
      assert.equal(sql.prepare('SELECT status FROM users WHERE id=?').get(target).status,'disabled');
      assert.equal(audits().length,1);
      assert.equal(audits()[0].resource_id,target);
    });
  }
  await t.test('admin cannot enable peers or super admins, or change any role',async()=>{
    reset();
    for(const target of ['peer-admin','peer-super']){
      await rejected('admin',target,{status:'disabled'},403);
      sql.prepare("UPDATE users SET status='disabled' WHERE id=?").run(target);
      await rejected('admin',target,{status:'active'},403);
      await rejected('admin',target,{role:'student',status:'disabled'},403);
    }
    for(const role of ['student','reviewer','admin'])await rejected('admin','student',{role},403);
    await rejected('admin','admin',{status:'disabled'},400);
  });
  await t.test('normal lower-role disable and enable',async()=>{
    reset();
    for(const target of ['student','reviewer'])for(const status of ['disabled','active'])assert.equal((await patch('admin',target,{status})).status,200);
    assert.equal(audits().length,4);
  });
  await t.test('super admin manages peers and lower roles but cannot grant super admin',async()=>{
    reset();
    assert.equal((await patch('super_admin','peer-super',{status:'disabled',role:'admin'})).status,200);
    assert.equal((await patch('super_admin','peer-super',{status:'active'})).status,200);
    for(const role of ['reviewer','admin','student'])assert.equal((await patch('super_admin','student',{role})).status,200);
    await rejected('super_admin','student',{role:'super_admin'},400);
    await rejected('super_admin','super_admin',{role:'admin'},409);
    assert.equal(audits().length,5);
  });
  await t.test('last active super admin cannot lose access',async()=>{
    reset();sql.prepare("UPDATE users SET status='disabled' WHERE id='peer-super'").run();
    await rejected('super_admin','super_admin',{status:'disabled'},409);
    await rejected('super_admin','super_admin',{role:'admin'},409);
    await rejected('super_admin','super_admin',{role:'student',status:'disabled'},409);
    assert.equal((await patch('super_admin','peer-super',{status:'active'})).status,200);
    await rejected('super_admin','super_admin',{status:'disabled'},400);
  });
  await t.test('concurrent super admins cannot disable each other and remove all access',async()=>{
    reset();
    const responses=await Promise.all([
      patch('super_admin','peer-super',{status:'disabled'}),
      patch('peer-super','super_admin',{status:'disabled'})
    ]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM users WHERE role='super_admin' AND status='active'").get().n,1);
    assert.equal(audits().length,1);
  });
  await t.test('unknown targets return 404 without audit',async()=>{
    reset();for(const actor of ['admin','super_admin'])await rejected(actor,'missing',{status:'disabled'},404);
  });
  await t.test('audit failure rolls back the user change',async()=>{
    reset();sql.exec("CREATE TRIGGER fail_user_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try{await rejected('admin','student',{status:'disabled'},500);}finally{sql.exec('DROP TRIGGER fail_user_audit');}
  });
});
