import { config } from './config.js';
import { sqlite } from './db.js';
console.log(`Migrations complete: ${config.database}`);
sqlite.close();
