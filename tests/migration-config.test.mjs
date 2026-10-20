import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// Keep native better-sqlite3 in the API/migration/maintenance subprocesses.
// Node's fixture driver avoids the legacy addon's Node 24 Linux cleanup crash.
import {DatabaseSync as Database} from 'node:sqlite';

const root = path.resolve('.');
const tsx = path.join(root, 'node_modules/tsx/dist/cli.mjs');
const migrationCount = JSON.parse(fs.readFileSync('apps/api/drizzle/meta/_journal.json', 'utf8')).entries.length;
const fixture = fs.readFileSync('tests/fixtures/legacy-bootstrap.sql', 'utf8');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jack-migration-'));
function run(args, env, cwd = root) {
  const result = spawnSync(process.execPath, [tsx, ...args], { cwd, env: { ...process.env, SESSION_SECRET: 'test-only-stable-key-'.repeat(3), ...env }, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}
function setup(t) {
  const dir = temp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { DATABASE_URL: path.join(dir, 'app.db'), STORAGE_DIR: path.join(dir, 'uploads') };
  fs.mkdirSync(env.STORAGE_DIR);
  return { dir, env };
}
function migrate(env) { return run(['apps/api/src/migrate.ts'], env); }
function populate(db, uploads) {
  db.exec(`INSERT INTO users VALUES('u','u@example.test','hash','student','active',1);
    INSERT INTO requirements(id,user_id,title,content,created_at) VALUES('r','u','legacy','private body',2);
    INSERT INTO media VALUES('m','u','m.webp','image/webp',7,'private',2);
    INSERT INTO requirement_media VALUES('r','m',0);
    INSERT INTO reviews VALUES('review','r','u','approve','audit trail',3);
    INSERT INTO audit_logs VALUES('a','u','review','requirement','r',3);
    INSERT INTO cases(id,requirement_id,title,summary,created_at) VALUES('c','r','case','summary',3);
    INSERT INTO case_media VALUES('c','m',0);
    INSERT INTO case_prompts VALUES('p','c','build','prompt',1);
    INSERT INTO sessions VALUES('session','u',9999999999);
    INSERT INTO api_keys(id,user_id,name,prefix,hash,created_at) VALUES('k','u','key','wk_','hash',3);`);
  fs.writeFileSync(path.join(uploads, 'm.webp'), 'fixture');
}
function rows(db) {
  return ['users', 'requirements', 'media', 'requirement_media', 'reviews', 'audit_logs', 'cases', 'case_media', 'case_prompts', 'sessions', 'api_keys', 'files', 'requirement_files', 'case_files'].map(table => db.prepare(`SELECT * FROM ${table}`).all());
}

test('fresh baseline, repeat migration, and root/workspace runtime config agree', t => {
  const { env } = setup(t);
  assert.equal(migrate(env).status, 0);
  assert.equal(run(['src/migrate.ts'], env, path.join(root, 'apps/api')).status, 0);
  const db = new Database(env.DATABASE_URL); t.after(() => db.close());
  assert.equal(db.prepare('SELECT count(*) n FROM __drizzle_migrations').get().n, migrationCount);
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='tags'").get().n, 1);
  const code = `import {config} from '${root}/apps/api/src/config.ts'; console.log(JSON.stringify(config));`;
  const rootConfig = run(['-e', code], env), workspaceConfig = run(['-e', code], env, path.join(root, 'apps/api'));
  assert.equal(rootConfig.status, 0); assert.equal(rootConfig.output, workspaceConfig.output);
});

test('populated legacy migration preserves records and PR #10 extensions; later migration executes once', t => {
  const { dir, env } = setup(t);
  const db = new Database(env.DATABASE_URL); t.after(() => db.close());
  db.exec(fixture); populate(db, env.STORAGE_DIR);
  db.exec(`ALTER TABLE requirements ADD COLUMN requirement_code TEXT;
    ALTER TABLE requirements ADD COLUMN content_version TEXT NOT NULL DEFAULT 'v1.0';
    ALTER TABLE cases ADD COLUMN public_content TEXT;
    ALTER TABLE cases ADD COLUMN requirement_code TEXT;
    ALTER TABLE cases ADD COLUMN content_version TEXT NOT NULL DEFAULT 'v1.0';
    CREATE UNIQUE INDEX requirements_code_unique ON requirements(requirement_code);
    CREATE TABLE files(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),storage_key TEXT NOT NULL,name TEXT NOT NULL,purpose TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE requirement_files(requirement_id TEXT NOT NULL REFERENCES requirements(id),file_id TEXT NOT NULL REFERENCES files(id),PRIMARY KEY(requirement_id,file_id));
    CREATE TABLE case_files(case_id TEXT NOT NULL REFERENCES cases(id),file_id TEXT NOT NULL REFERENCES files(id),approved INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(case_id,file_id));
    INSERT INTO files VALUES('f','u','attachment.bin','attachment','brief','text/plain',18,1);
    INSERT INTO requirement_files VALUES('r','f'); INSERT INTO case_files VALUES('c','f',1);
    UPDATE cases SET public_content='approved body',requirement_code='MED-REQ-0001';
    UPDATE requirements SET requirement_code='MED-REQ-0001';
    ALTER TABLE requirements ADD COLUMN cover_media_id TEXT;
    ALTER TABLE cases ADD COLUMN cover_media_id TEXT;
    UPDATE requirements SET cover_media_id='m';
    UPDATE cases SET cover_media_id='m';
    ALTER TABLE users ADD COLUMN future_marker TEXT;
    UPDATE users SET future_marker='keep me';
    CREATE TABLE future_records(id TEXT PRIMARY KEY,payload TEXT);
    INSERT INTO future_records VALUES('future','unknown data');`);
  fs.writeFileSync(path.join(env.STORAGE_DIR, 'attachment.bin'), 'private attachment');
  assert.equal(migrate(env).status, 0);
  const after = rows(db);
  assert.equal(db.prepare('SELECT payload FROM future_records').get().payload,'unknown data');
  assert.equal(db.prepare('SELECT future_marker FROM users').get().future_marker,'keep me');
  assert.equal(after[1][0].cover_media_id, 'm');
  assert.equal(db.prepare('SELECT cover_media_id FROM cases').get().cover_media_id, 'm');
  assert.equal(after[1][0].content, 'private body'); assert.equal(after[1][0].requirement_code, 'MED-REQ-0001');
  assert.equal(after[1][0].implementation_status, 'pending');
  assert.equal(db.prepare('SELECT * FROM files').all().length, 1);
  assert.equal(db.prepare('SELECT * FROM requirement_files').all().length, 1);
  assert.equal(db.prepare('SELECT approved FROM case_files').get().approved, 1);
  assert.equal(db.prepare('SELECT public_content FROM cases').get().public_content, 'approved body');
  assert.equal(migrate(env).status, 0); assert.deepEqual(rows(db), after);
  const folder = path.join(dir, 'migrations'); fs.cpSync(path.join(root, 'apps/api/drizzle'), folder, { recursive: true });
  const journalFile = path.join(folder, 'meta/_journal.json'); const journal = JSON.parse(fs.readFileSync(journalFile));
  const tag=String(journal.entries.length).padStart(4,'0')+'_future';
  journal.entries.push({ idx: journal.entries.length, version: '6', when: journal.entries.at(-1).when + 1, tag, breakpoints: true });
  fs.writeFileSync(journalFile, JSON.stringify(journal)); fs.writeFileSync(path.join(folder, tag+'.sql'), 'ALTER TABLE users ADD COLUMN future_note TEXT;');
  const code = `import Database from 'better-sqlite3'; import {migrateDatabase} from './apps/api/src/migrations.ts'; const db=new Database(process.env.DATABASE_URL); migrateDatabase(db,${JSON.stringify(folder)}); migrateDatabase(db,${JSON.stringify(folder)}); db.close();`;
  const later = run(['-e', code], env); assert.equal(later.status, 0, later.output);
  assert.equal(db.prepare('SELECT count(*) n FROM __drizzle_migrations').get().n, migrationCount+1);
  assert.ok(db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'future_note'));
  assert.deepEqual(rows(db).slice(1), after.slice(1));
});

test('unknown incomplete legacy schema rolls back adoption rather than rebuild', t => {
  const { env } = setup(t); const db = new Database(env.DATABASE_URL); t.after(() => db.close());
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT); INSERT INTO users VALUES('u','preserve');");
  const result = migrate(env); assert.notEqual(result.status, 0); assert.match(result.output, /Unsupported legacy/);
  assert.equal(db.prepare('SELECT email FROM users').get().email, 'preserve');
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='__drizzle_migrations'").get().n, 0);
});

test('explicit env load, relative root paths, legacy collision refusal and stable secret', t => {
  const { dir, env } = setup(t); const fakeRoot = path.join(dir, 'project');
  fs.mkdirSync(path.join(fakeRoot, 'apps/api/storage'), { recursive: true });
  fs.writeFileSync(path.join(fakeRoot, 'apps/api/storage/jack-case.db'), 'untouched');
  const code = `import {resolvePaths,sessionSecret} from './apps/api/src/config.ts';
    import assert from 'node:assert/strict';
    assert.equal(resolvePaths('/nonexistent-checkout',{}).database,'/nonexistent-checkout/storage/jack-case.db');
    assert.throws(()=>resolvePaths(${JSON.stringify(fakeRoot)},{}),/legacy workspace path/);
    assert.equal(resolvePaths(${JSON.stringify(fakeRoot)},{DATABASE_URL:${JSON.stringify(env.DATABASE_URL)},STORAGE_DIR:${JSON.stringify(env.STORAGE_DIR)}}).database,process.env.DATABASE_URL);
    console.log(sessionSecret());`;
  const first = run(['-e', code], { ...env, SESSION_SECRET: undefined, NODE_ENV: 'development' });
  const second = run(['-e', code], { ...env, SESSION_SECRET: undefined, NODE_ENV: 'development' });
  assert.equal(first.status, 0, first.output); assert.equal(first.output, second.output);
  const envFile = path.join(dir, 'runtime.env'); fs.writeFileSync(envFile, `DATABASE_URL=${env.DATABASE_URL}\nSTORAGE_DIR=${env.STORAGE_DIR}\nSESSION_SECRET=${'stable'.repeat(8)}\n`);
  const readConfig = `import {config,sessionSecret} from '${root}/apps/api/src/config.ts'; console.log(config.database,sessionSecret());`;
  const envOnly = { JACK_CASE_ENV_FILE: envFile, DATABASE_URL: undefined, STORAGE_DIR: undefined, SESSION_SECRET: undefined };
  const a = run(['-e', readConfig], envOnly), b = run(['-e', readConfig], envOnly, path.join(root, 'apps/api'));
  assert.equal(a.status, 0, a.output); assert.equal(a.output, b.output); assert.match(a.output, /stable/);
  const invalid = run(['apps/api/src/server.ts'], { ...env, DATABASE_URL: path.join(dir, 'must-not-exist.db'), NODE_ENV: 'production', SESSION_SECRET: undefined });
  assert.notEqual(invalid.status, 0); assert.match(invalid.output, /requires SESSION_SECRET/); assert.ok(!fs.existsSync(path.join(dir, 'must-not-exist.db')));
});

test('WAL backup/restore keeps relations/files, rejects unauthorized targets and preserves target recovery backup', t => {
  const { dir, env } = setup(t); assert.equal(migrate(env).status, 0);
  const db = new Database(env.DATABASE_URL); t.after(() => { if (db.isOpen) db.close(); });
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;'); populate(db, env.STORAGE_DIR);
  db.exec(`INSERT INTO files VALUES('f','u','file.txt','File','brief','text/plain',7,1);
    INSERT INTO requirement_files VALUES('r','f'); INSERT INTO case_files VALUES('c','f',1);`);
  fs.writeFileSync(path.join(env.STORAGE_DIR,'file.txt'),'content');
  const before = rows(db); const destination = path.join(dir, 'snapshot');
  const backup = run(['apps/api/src/maintenance.ts', 'backup', '--to', destination, '--maintenance'], env);
  assert.equal(backup.status, 0, backup.output); assert.ok(fs.existsSync(env.DATABASE_URL + '-wal'));
  assert.notEqual(run(['apps/api/src/maintenance.ts','backup','--to',destination,'--maintenance'],env).status,0);
  // Stop source writer before restoring, as required by the maintenance contract.
  db.close();
  const target = { DATABASE_URL: path.join(dir, 'target.db'), STORAGE_DIR: path.join(dir, 'target-uploads') };
  fs.mkdirSync(target.STORAGE_DIR); assert.equal(migrate(target).status, 0);
  const targetDb = new Database(target.DATABASE_URL); populate(targetDb, target.STORAGE_DIR);
  targetDb.prepare("UPDATE requirements SET content='target original'").run(); targetDb.close();
  const restoreArgs = ['apps/api/src/maintenance.ts','restore','--from',destination];
  assert.notEqual(run(restoreArgs,target).status, 0);
  assert.notEqual(run([...restoreArgs,'--maintenance','--confirm-target',env.DATABASE_URL],target).status, 0);
  let check = new Database(target.DATABASE_URL); assert.equal(check.prepare('SELECT content FROM requirements').get().content, 'target original'); check.close();
  const restored = run([...restoreArgs,'--maintenance','--confirm-target',target.DATABASE_URL],target);
  assert.equal(restored.status, 0, restored.output);
  check = new Database(target.DATABASE_URL); assert.deepEqual(rows(check), before); check.close();
  assert.equal(fs.readFileSync(path.join(target.STORAGE_DIR,'m.webp'),'utf8'),'fixture');
  assert.equal(fs.readFileSync(path.join(target.STORAGE_DIR,'file.txt'),'utf8'),'content');
  const recovery = fs.readdirSync(dir).find(n => n.startsWith('target.db.before-restore-')); assert.ok(recovery);
  check = new Database(path.join(dir,recovery,'database.sqlite')); assert.equal(check.prepare('SELECT content FROM requirements').get().content, 'target original'); check.close();
  assert.equal(fs.readFileSync(path.join(dir,recovery,'uploads/m.webp'),'utf8'),'fixture');
  const unauthorized = path.join(dir,'outside.db'), link = path.join(dir,'dangling-link.db');
  fs.symlinkSync(unauthorized,link);
  const linkResult=run([...restoreArgs,'--maintenance','--confirm-target',link],{...target,DATABASE_URL:link});
  assert.notEqual(linkResult.status,0); assert.match(linkResult.output,/Symlink refused/); assert.ok(!fs.existsSync(unauthorized));
  fs.rmSync(path.join(destination,'uploads/m.webp'));
  assert.notEqual(run([...restoreArgs,'--maintenance','--confirm-target',target.DATABASE_URL],target).status,0);
  check = new Database(target.DATABASE_URL); assert.deepEqual(rows(check), before); check.close();
});

test('pre-medical populated legacy gets medical tables/fields and stable code backfill', t => {
  const { env } = setup(t);
  const db = new Database(env.DATABASE_URL); t.after(() => db.close());
  db.exec(fixture); populate(db, env.STORAGE_DIR);
  db.exec("INSERT INTO requirements(id,user_id,title,content,created_at) VALUES('r2','u','second','body',4),('r3','u','third','body',5)");
  let result = migrate(env); assert.equal(result.status,0,result.output);
  assert.equal(db.prepare('SELECT requirement_code FROM requirements').get().requirement_code,'MED-REQ-0001');
  assert.equal(db.prepare('SELECT content FROM requirements').get().content,'private body');
  assert.equal(db.prepare('SELECT content_version FROM requirements').get().content_version,'v1.0');
  assert.deepEqual(db.prepare('SELECT requirement_code FROM requirements ORDER BY created_at').all().map(r=>r.requirement_code),['MED-REQ-0001','MED-REQ-0002','MED-REQ-0003']);
  assert.equal(db.prepare('SELECT public_content FROM cases').get().public_content,null);
  assert.deepEqual(db.prepare('SELECT * FROM files').all(),[]);
  const after=rows(db); result=migrate(env); assert.equal(result.status,0,result.output); assert.deepEqual(rows(db),after);
});

test('null legacy code retains explicit Markdown ID and reserves it before automatic numbering', t => {
  const { env } = setup(t); const db=new Database(env.DATABASE_URL); t.after(()=>db.close());
  db.exec(fixture); populate(db,env.STORAGE_DIR);
  db.prepare('UPDATE requirements SET content=?').run('# 医疗参考\n\n**需求ID**：MED-REQ-0004\n原始正文');
  db.exec("INSERT INTO requirements(id,user_id,title,content,created_at) VALUES('other','u','automatic','body',1)");
  const result=migrate(env); assert.equal(result.status,0,result.output);
  assert.equal(db.prepare("SELECT requirement_code FROM requirements WHERE id='r'").get().requirement_code,'MED-REQ-0004');
  assert.equal(db.prepare("SELECT requirement_code FROM requirements WHERE id='other'").get().requirement_code,'MED-REQ-0005');
  assert.equal(db.prepare("SELECT content FROM requirements WHERE id='r'").get().content,'# 医疗参考\n\n**需求ID**：MED-REQ-0004\n原始正文');
  assert.equal(migrate(env).status,0);
});

test('existing non-null codes remain authoritative; explicit duplicate/conflict reports rows without changing codes', t => {
  const { env }=setup(t); const db=new Database(env.DATABASE_URL); t.after(()=>db.close());
  db.exec(fixture); populate(db,env.STORAGE_DIR);
  db.exec("ALTER TABLE requirements ADD COLUMN requirement_code TEXT; UPDATE requirements SET requirement_code='MED-REQ-0004',content='需求ID：MED-REQ-0099'; INSERT INTO requirements(id,user_id,title,content,created_at) VALUES('conflict','u','conflict','需求ID：MED-REQ-0004',2)");
  const failed=migrate(env); assert.notEqual(failed.status,0); assert.match(failed.output,/code conflict MED-REQ-0004/); assert.match(failed.output,/conflict/);
  assert.equal(db.prepare("SELECT requirement_code FROM requirements WHERE id='r'").get().requirement_code,'MED-REQ-0004');
  assert.equal(db.prepare("SELECT requirement_code FROM requirements WHERE id='conflict'").get().requirement_code,null);
  db.prepare("UPDATE requirements SET content='需求ID：MED-REQ-0010' WHERE id='conflict'").run();
  const result=migrate(env); assert.equal(result.status,0,result.output);
  assert.equal(db.prepare("SELECT requirement_code FROM requirements WHERE id='r'").get().requirement_code,'MED-REQ-0004');
  assert.equal(db.prepare("SELECT requirement_code FROM requirements WHERE id='conflict'").get().requirement_code,'MED-REQ-0010');
});

test('duplicate or ambiguous explicit body IDs fail adoption with an actionable report', t => {
  for (const ambiguous of [false,true]) {
    const {env}=setup(t);const db=new Database(env.DATABASE_URL);t.after(()=>db.close());
    db.exec(fixture);populate(db,env.STORAGE_DIR);
    db.prepare('UPDATE requirements SET content=?').run(ambiguous?'需求ID：MED-REQ-0004\n需求编号：MED-REQ-0005':'需求ID：MED-REQ-0004');
    if(!ambiguous)db.exec("INSERT INTO requirements(id,user_id,title,content,created_at) VALUES('duplicate','u','duplicate','需求ID：MED-REQ-0004',3)");
    const before=db.prepare('SELECT * FROM requirements').all();const result=migrate(env);
    assert.notEqual(result.status,0);assert.match(result.output,ambiguous?/Ambiguous requirement codes/:/code conflict MED-REQ-0004/);
    assert.deepEqual(db.prepare('SELECT * FROM requirements').all(),before);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='__drizzle_migrations'").get().n,0);
  }
});
