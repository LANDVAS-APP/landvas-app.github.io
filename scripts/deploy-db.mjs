// Apply pending SQL migrations to the hosted Supabase project through the
// Supabase Management API (needs only SUPABASE_ACCESS_TOKEN; no DB password).
// Each migration runs in one transaction and is recorded in landvas_meta.migrations.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required');
  process.exit(1);
}

// the Management API sometimes times out reaching the database (HTTP 5xx, e.g. 544): wait and try again.
// A migration can also collide with players' own queries on a live database: a deadlock (40P01), or a lock it
// couldn't get within lock_timeout (55P03). Its transaction rolled back whole, so it's safe to run again.
const LOCKED = /40P01|deadlock detected|55P03|lock timeout/i;
async function query(sql, tries = 5) {
  for (let i = 1; ; i++) {
    try { return await queryOnce(sql); }
    catch (e) {
      const msg = String(e.message), locked = LOCKED.test(msg);
      if (i >= (locked ? 8 : tries) || !(locked || /^HTTP 5\d\d/.test(msg))) throw e;
      const wait = locked ? 3 + i * 4 : i * 15;
      console.log(`  (${locked ? 'busy with live queries: ' : ''}${msg.slice(0, 120)} — retrying in ${wait}s)`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}
async function queryOnce(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 2000)}`);
  try { return JSON.parse(text); } catch { return text; }
}

await query(`create schema if not exists landvas_meta;
  create table if not exists landvas_meta.migrations (name text primary key, applied_at timestamptz not null default now());
  revoke all on schema landvas_meta from public;`);
const applied = new Set((await query('select name from landvas_meta.migrations')).map((r) => r.name));
const dir = path.join(ROOT, 'supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let n = 0;
for (const f of files) {
  if (applied.has(f)) continue;
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  process.stdout.write(`applying ${f} … `);
  // (a lock it waits for holds up every player's query behind it on that table: give up after a few seconds and
  // try again, instead of stalling the game or waiting into a deadlock)
  await query(`begin;\nset local lock_timeout = '6s';\n${sql}\n;insert into landvas_meta.migrations (name) values ('${f.replace(/'/g, "''")}');\ncommit;`);
  console.log('ok');
  n++;
}
console.log(n ? `${n} migration(s) applied` : 'database is up to date');
