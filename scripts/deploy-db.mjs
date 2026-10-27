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

async function query(sql) {
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
  await query(`begin;\n${sql}\n;insert into landvas_meta.migrations (name) values ('${f.replace(/'/g, "''")}');\ncommit;`);
  console.log('ok');
  n++;
}
console.log(n ? `${n} migration(s) applied` : 'database is up to date');
