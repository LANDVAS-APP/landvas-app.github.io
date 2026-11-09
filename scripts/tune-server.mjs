// Keeps the database server's memory in check (Micro compute: 1 GB). Run by every deploy; only touches the project
// when its settings differ, so a normal deploy changes nothing.
//
// Never restarts the database. The 256 MB cache (shared_buffers) is left alone: the whole database fits in it, which
// is why almost no read touches the disk. What's trimmed instead:
//  - the API pool, capped at 8 connections: each connection keeps its own copy of every game function it has run
//    (up to ~10 MB after a while), and Supabase's default left 18 of them open all day. Calls take ~40 ms, so 8
//    connections serve far more requests a second than the game makes.
//  - logical_decoding_work_mem 64 MB -> 8 MB: memory Realtime's change reader may hold; the game sends it almost
//    nothing (its live updates are broadcasts, not table changes).
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) { console.log('tune: no access'); process.exit(0); }
const POOL = 8;
const WANT = { logical_decoding_work_mem: '8MB' }; // (settings that apply without a restart only)
const api = async (method, path, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
};
try {
  const pg = await api('GET', '/config/database/postgres');
  const diff = Object.entries(WANT).filter(([k, v]) => String(pg[k] ?? '') !== v);
  if (diff.length) {
    await api('PUT', '/config/database/postgres', { ...pg, ...WANT, restart_database: false });
    console.log(`tune: database settings updated without a restart (${diff.map(([k, v]) => `${k}=${v}`).join(', ')})`);
  } else console.log('tune: database settings already right');
} catch (e) { console.log(`::warning::tune: database settings not changed: ${String(e).slice(0, 300)}`); }
try {
  const rest = await api('GET', '/postgrest');
  if (rest.db_pool == null || rest.db_pool > POOL) { await api('PATCH', '/postgrest', { db_pool: POOL }); console.log(`tune: API pool ${rest.db_pool ?? 'default'} -> ${POOL}`); }
  else console.log(`tune: API pool already ${rest.db_pool}`);
} catch (e) { console.log(`::warning::tune: API pool not changed: ${String(e).slice(0, 300)}`); }
