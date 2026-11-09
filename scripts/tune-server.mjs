// Fits the database into the temporary (free-tier) server's 0.5 GB of memory. Run by the deploy; only touches the
// project when its settings differ, so a normal deploy changes nothing (and never restarts anything).
//  - shared_buffers 224 MB -> 128 MB: the whole database is ~32 MB, so 128 MB still holds all of it in memory, and
//    the ~96 MB freed keeps the machine out of swap (swapping is what drains the Disk IO budget).
//  - logical_decoding_work_mem 64 MB -> 8 MB: the memory Realtime's change reader may hold; we send it almost nothing.
//  - PostgREST pool 5 connections: each one keeps a copy of every game function it has run (tens of MB after a
//    while); five are plenty for this machine's single shared CPU.
// Changing shared_buffers restarts the database once (a few seconds).
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.production', 'utf8');
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF;
if (!/^VITE_TEMP_SERVER=1/m.test(env)) { console.log('tune: not the temporary server, leaving its settings alone'); process.exit(0); }
if (!token || !ref) { console.log('tune: no access'); process.exit(0); }
const api = async (method, path, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
};
const WANT = { shared_buffers: '128MB', logical_decoding_work_mem: '8MB' };
try {
  const pg = await api('GET', '/config/database/postgres');
  const diff = Object.entries(WANT).filter(([k, v]) => String(pg[k] ?? '') !== v);
  if (diff.length) {
    await api('PUT', '/config/database/postgres', { ...pg, ...WANT, restart_database: diff.some(([k]) => k === 'shared_buffers') });
    console.log(`tune: database memory settings updated (${diff.map(([k, v]) => `${k}=${v}`).join(', ')})`);
  } else console.log('tune: database memory settings already right');
} catch (e) { console.log(`::warning::tune: database settings not changed: ${String(e).slice(0, 300)}`); }
try {
  const rest = await api('GET', '/postgrest');
  if (rest.db_pool == null || rest.db_pool > 5) { await api('PATCH', '/postgrest', { db_pool: 5 }); console.log(`tune: API pool ${rest.db_pool ?? 'default'} -> 5`); }
  else console.log(`tune: API pool already ${rest.db_pool}`);
} catch (e) { console.log(`::warning::tune: API pool not changed: ${String(e).slice(0, 300)}`); }
