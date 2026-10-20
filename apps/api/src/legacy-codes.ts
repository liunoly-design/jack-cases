import type Database from 'better-sqlite3';

// Only used by 0001. Existing non-null codes are never inferred or rewritten.
export function legacyCodePlan(sqlite: Database.Database) {
  const rows = sqlite.prepare('SELECT id,content,requirement_code FROM requirements ORDER BY created_at,id').all() as {id:string;content:string;requirement_code:string|null}[];
  const owners = new Map<string, string>();
  const planned = new Map<string, string>();
  function reserve(code: string, id: string) {
    const owner = owners.get(code);
    if (owner && owner !== id) throw new Error(`Requirement code conflict ${code}: rows ${owner}, ${id}. Inspect a backup, resolve requirement_code explicitly, then rerun db:migrate. No body or existing code was rewritten.`);
    owners.set(code, id);
  }
  for (const row of rows) if (row.requirement_code !== null) reserve(row.requirement_code, row.id);
  for (const row of rows) {
    if (row.requirement_code !== null) continue;
    const plain = row.content.replace(/[*_`]/g, '');
    const matches = [...plain.matchAll(/^\s*(?:#{1,6}\s*)?(?:[-+]\s*)?(?:需求\s*(?:ID|编号)|业务编号)\s*[:：]\s*(MED-REQ-\d+)\b/gim)].map(m => m[1].toUpperCase());
    const codes = [...new Set(matches)];
    if (codes.length > 1) throw new Error(`Ambiguous requirement codes in row ${row.id}: ${codes.join(', ')}. Resolve requirement_code explicitly, then rerun db:migrate.`);
    if (codes[0]) { reserve(codes[0], row.id); planned.set(row.id, codes[0]); }
  }
  const numbers = [...owners.keys()].filter(c => /^MED-REQ-\d+$/.test(c)).map(c => Number(c.slice(8)));
  let next = numbers.reduce((max, value) => Math.max(max, value), 0) + 1;
  if (!Number.isSafeInteger(next)) throw new Error('Requirement code counter exceeds safe range; resolve numbering before migration.');
  for (const row of rows) if (row.requirement_code === null && !planned.has(row.id)) {
    const code = 'MED-REQ-' + String(next++).padStart(4, '0');
    reserve(code, row.id); planned.set(row.id, code);
  }
  return planned;
}
