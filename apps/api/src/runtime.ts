import { sessionSecret } from './config.js';
// Evaluate before importing/opening db.ts so invalid production secrets fail early.
export const signingSecret = sessionSecret();
