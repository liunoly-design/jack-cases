import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import fs from 'node:fs'; import path from 'node:path';
const file=process.env.DATABASE_URL??'./storage/jack-case.db';
fs.mkdirSync(path.dirname(file),{recursive:true});
export const sqlite=new Database(file);
sqlite.pragma('journal_mode = WAL');sqlite.pragma('foreign_keys = ON');
// Bootstrap schema for first-run zero-command startup. Drizzle remains the only query layer.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',status TEXT NOT NULL DEFAULT 'active',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,prefix TEXT NOT NULL,hash TEXT NOT NULL UNIQUE,revoked_at INTEGER,last_used_at INTEGER,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requirements(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,content TEXT NOT NULL,category_id TEXT,share_consent INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'submitted',created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS requirements_owner_idx ON requirements(user_id);
CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,requirement_id TEXT REFERENCES requirements(id),title TEXT NOT NULL,summary TEXT NOT NULL,category_id TEXT,status TEXT NOT NULL DEFAULT 'draft',published_at INTEGER,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS case_prompts(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),type TEXT NOT NULL,content TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),storage_key TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'private',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requirement_media(requirement_id TEXT NOT NULL REFERENCES requirements(id),media_id TEXT NOT NULL REFERENCES media(id),sort_order INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(requirement_id,media_id));
CREATE TABLE IF NOT EXISTS case_media(case_id TEXT NOT NULL REFERENCES cases(id),media_id TEXT NOT NULL REFERENCES media(id),sort_order INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(case_id,media_id));
CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,parent_id TEXT,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,requirement_id TEXT NOT NULL REFERENCES requirements(id),reviewer_id TEXT NOT NULL REFERENCES users(id),decision TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,resource_type TEXT NOT NULL,resource_id TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS case_events(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),user_id TEXT,type TEXT NOT NULL,created_at INTEGER NOT NULL);
`);
// Idempotent additive migration for existing SQLite installations. Preserve all prior records.
const extraColumns:Record<string,string>={
  industry:'TEXT',department:'TEXT',difficulty:'TEXT',
  implementation_status:"TEXT NOT NULL DEFAULT 'pending'",expected_outcome:'TEXT'
};
for(const table of ['requirements','cases']){
  const existing=new Set((sqlite.pragma('table_info('+table+')') as {name:string}[]).map(col=>col.name));
  for(const [name,definition] of Object.entries(extraColumns)){
    if(table==='cases'&&name==='expected_outcome')continue;
    if(!existing.has(name))sqlite.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+definition);
  }
}
sqlite.exec(`
CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,slug TEXT NOT NULL UNIQUE,"group" TEXT NOT NULL DEFAULT 'general',color TEXT NOT NULL DEFAULT 'orange',active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS requirement_tags(requirement_id TEXT NOT NULL REFERENCES requirements(id),tag_id TEXT NOT NULL REFERENCES tags(id),PRIMARY KEY(requirement_id,tag_id));
CREATE TABLE IF NOT EXISTS case_tags(case_id TEXT NOT NULL REFERENCES cases(id),tag_id TEXT NOT NULL REFERENCES tags(id),PRIMARY KEY(case_id,tag_id));
CREATE INDEX IF NOT EXISTS requirement_tags_tag_idx ON requirement_tags(tag_id);
CREATE INDEX IF NOT EXISTS case_tags_tag_idx ON case_tags(tag_id);
`);
export const db=drizzle(sqlite,{schema});