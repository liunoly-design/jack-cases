import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import {encryptKey,decryptKey,keyStorageReady,keyHash} from './key-security.js';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrateDatabase } from './migrations.js';
fs.mkdirSync(path.dirname(config.database), { recursive: true });
export const sqlite = new Database(config.database);
sqlite.pragma('secure_delete = ON');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
migrateDatabase(sqlite);
if(keyStorageReady){
  let migrated=false;
  // Validate every existing envelope before migrating anything. A wrong key never destroys data.
  sqlite.transaction(()=>{
    const rows=sqlite.prepare('SELECT id,hash,secret_value,secret_encrypted FROM api_keys').all() as {id:string;hash:string;secret_value:string|null;secret_encrypted:string|null}[];
    for(const row of rows){
      const secret=row.secret_encrypted?decryptKey(row.secret_encrypted,row.id):row.secret_value;
      if(secret&&keyHash(secret)!==row.hash)throw Error('API Key storage integrity check failed');
      if(row.secret_value){sqlite.prepare('UPDATE api_keys SET secret_encrypted=?,secret_value=NULL WHERE id=?').run(row.secret_encrypted??encryptKey(row.secret_value,row.id),row.id);migrated=true;}
    }
  })();
  if(migrated)sqlite.pragma('wal_checkpoint(TRUNCATE)');
}

export const db = drizzle(sqlite, { schema });
