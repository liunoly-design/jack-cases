import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';

// Both src/ and compiled dist/ live three levels below the checkout root.
export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const envFile = process.env.JACK_CASE_ENV_FILE;
if (envFile && !path.isAbsolute(envFile)) throw new Error('JACK_CASE_ENV_FILE must be an absolute path');
const loaded = dotenv.config({ path: envFile ?? path.join(projectRoot, '.env') });
if (loaded.error && (envFile || (loaded.error as NodeJS.ErrnoException).code !== 'ENOENT')) throw loaded.error;

export function resolvePaths(root: string, env: NodeJS.ProcessEnv) {
  const resolve = (key: string, fallback: string) => {
    const value = env[key] ?? fallback;
    if (!value.trim()) throw new Error(`${key} must not be empty`);
    if (value.startsWith('file:') || value.includes('://')) throw new Error(`${key} must be a filesystem path, not a URL`);
    const resolved = path.resolve(root, value);
    const legacy = path.resolve(root, 'apps/api', value);
    if (!path.isAbsolute(value) && resolved !== legacy && fs.existsSync(legacy)) {
      throw new Error(`${key}: legacy workspace path exists: ${legacy}. Refusing to switch to ${resolved}. Set ${key} to the intended absolute path, or follow ops/DATABASE.md to back up and restore explicitly.`);
    }
    return resolved;
  };
  return { database: resolve('DATABASE_URL', './storage/jack-case.db'), uploads: resolve('STORAGE_DIR', './storage/uploads') };
}
export const config = resolvePaths(projectRoot, process.env);

export function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (value !== undefined) {
    if (value.length < 32 || value === 'replace-with-long-random-string') throw new Error('Set SESSION_SECRET to a stable random value of at least 32 characters (openssl rand -hex 32).');
    return value;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Production requires SESSION_SECRET in the environment or root .env (openssl rand -hex 32).');
  const file = path.join(path.dirname(config.database), '.session-secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const saved = fs.readFileSync(file, 'utf8').trim();
  if (saved.length < 32) throw new Error(`Invalid persisted session key: ${file}. Restore the key or set SESSION_SECRET.`);
  return saved;
}
