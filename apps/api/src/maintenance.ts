import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

function absolute(value: string | undefined, flag: string) {
  if (!value || !path.isAbsolute(value)) throw new Error(`${flag} requires an absolute path`);
  return path.normalize(value);
}
function noLinks(file: string) {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Symlink refused: ${file}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
function treeSafe(dir: string) {
  noLinks(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) treeSafe(file);
    else if (!entry.isFile()) throw new Error(`Non-regular upload refused: ${file}`);
  }
}
function canonical(file: string): string {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  const parent = path.dirname(file);
  return path.join(canonical(parent), path.basename(file));
}
function disjoint(a: string, b: string) {
  a = canonical(a); b = canonical(b);
  if (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep)) throw new Error('Backup/source/database/uploads paths must not overlap');
}
function verify(database: string, uploads: string) {
  noLinks(database); treeSafe(uploads);
  const db = new Database(database, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('quick_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Database integrity check failed');
    const media = ['media', 'files'].flatMap(table => {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return [];
      return db.prepare(`SELECT storage_key FROM ${table}`).all() as { storage_key: string }[];
    });
    for (const { storage_key: key } of media) {
      if (!key || path.basename(key) !== key || !fs.statSync(path.join(uploads, key)).isFile()) throw new Error('Missing or unsafe media file');
    }
  } finally { db.close(); }
}
async function copyDatabase(source: string, destination: string) {
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try { await db.backup(destination); } finally { db.close(); }
  fs.chmodSync(destination, 0o600);
}
async function backup(destination: string) {
  noLinks(destination); disjoint(destination, config.database); disjoint(destination, config.uploads);
  verify(config.database, config.uploads);
  fs.mkdirSync(destination, { mode: 0o700 }); // exclusive: never overwrite a backup
  try {
    await copyDatabase(config.database, path.join(destination, 'database.sqlite'));
    fs.cpSync(config.uploads, path.join(destination, 'uploads'), { recursive: true, errorOnExist: true, force: false });
    verify(path.join(destination, 'database.sqlite'), path.join(destination, 'uploads'));
    fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), database: config.database, uploads: config.uploads }, null, 2), { mode: 0o600, flag: 'wx' });
  } catch (error) { fs.rmSync(destination, { recursive: true, force: true }); throw error; }
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--to', '--from', '--confirm-target', '--maintenance'].includes(flag) || flags.has(flag)) throw new Error(`Unknown/duplicate argument: ${flag}`);
    flags.set(flag, flag === '--maintenance' ? 'yes' : args[++i]);
  }
  if (!flags.has('--maintenance')) throw new Error('Stop API and all writers first; pass --maintenance to attest exclusive access (including uploads).');
  noLinks(config.database); noLinks(config.uploads); disjoint(config.database, config.uploads);
  if (action === 'backup') {
    if (flags.has('--from') || flags.has('--confirm-target')) throw new Error('Invalid backup arguments');
    const destination = absolute(flags.get('--to'), '--to');
    await backup(destination); console.log(`Backup verified: ${destination}`); return;
  }
  if (action !== 'restore' || flags.has('--to')) throw new Error('Use backup --to or restore --from --confirm-target');
  if (flags.get('--confirm-target') !== config.database) throw new Error(`Restore requires --confirm-target ${config.database}; no changes made.`);
  const source = absolute(flags.get('--from'), '--from');
  noLinks(source); disjoint(source, config.database); disjoint(source, config.uploads);
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1) throw new Error('Unsupported backup version');
  const sourceDb = path.join(source, 'database.sqlite'), sourceUploads = path.join(source, 'uploads');
  verify(sourceDb, sourceUploads);
  const hadDatabase = fs.existsSync(config.database), hadUploads = fs.existsSync(config.uploads);
  if (hadDatabase !== hadUploads) throw new Error('Incomplete target pair; inspect database/uploads before restore.');
  const previous = `${config.database}.before-restore-${Date.now()}`;
  if (hadDatabase) { await backup(previous); console.log(`Target recovery backup: ${previous}`); }
  fs.mkdirSync(path.dirname(config.database), { recursive: true });
  fs.mkdirSync(path.dirname(config.uploads), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(config.uploads), '.restore-'));
  try {
    fs.cpSync(sourceUploads, path.join(staging, 'uploads'), { recursive: true });
    // SQLite online backup writes through SQLite, including an existing WAL target.
    await copyDatabase(sourceDb, config.database);
    if (hadUploads) fs.renameSync(config.uploads, path.join(staging, 'previous'));
    fs.renameSync(path.join(staging, 'uploads'), config.uploads);
    verify(config.database, config.uploads);
  } catch (error) {
    if (hadDatabase) await copyDatabase(path.join(previous, 'database.sqlite'), config.database);
    else for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.database + suffix, { force: true });
    if (fs.existsSync(path.join(staging, 'previous'))) {
      fs.rmSync(config.uploads, { recursive: true, force: true });
      fs.renameSync(path.join(staging, 'previous'), config.uploads);
    } else if (!hadUploads) fs.rmSync(config.uploads, { recursive: true, force: true });
    throw error;
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  console.log(`Restore verified: ${config.database}. Session/config secrets must be restored separately.`);
}
main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
