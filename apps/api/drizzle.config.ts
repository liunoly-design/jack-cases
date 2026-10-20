import { defineConfig } from 'drizzle-kit';
import path from 'node:path';
import { config, projectRoot } from './src/config.js';
export default defineConfig({schema:path.relative(process.cwd(),path.join(projectRoot,'apps/api/src/schema.ts')),out:path.relative(process.cwd(),path.join(projectRoot,'apps/api/drizzle')),dialect:'sqlite',dbCredentials:{url:config.database}});
