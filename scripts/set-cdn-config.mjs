// After the CDN worker is deployed: switch the app over to it (game_config 'cdn') only once it really works —
// (pictures go through it only when staff also set "pictures": true — on Cloudflare's free Workers plan, 100K requests a
// day, they'd use up the day's allowance; turn it on with Workers Paid)
// /health answers and a world snapshot comes back fresh. Otherwise the switch is turned off, and every copy of the
// game keeps asking the database as before. (A first deploy can take a few minutes while Cloudflare sets up the
// address and its certificate, so this waits up to ~4 minutes.) Run by the deploy.
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF || 'ojxqarpmreekylwotbdb';
const url = (process.env.CDN_URL || 'https://cdn.landvas.app').replace(/\/$/, '');
const waitS = Number(process.env.CDN_WAIT_S || 240);
if (!token) { console.log('cdn config: no database token, nothing to set'); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function check() {
  try {
    const h = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
    if (!h.ok) return `health ${h.status}`;
    const s = await fetch(`${url}/w/leviathan.json`, { signal: AbortSignal.timeout(15000) });
    if (!s.ok) return `snapshot ${s.status}`;
    const j = await s.json();
    const age = Date.now() - Date.parse(j?.built_at ?? '');
    if (!(age < 120_000)) return `snapshot too old (${Math.round(age / 1000)} s)`;
    return null;
  } catch (e) {
    return String(e?.message ?? e);
  }
}

let problem = 'not checked';
for (const t0 = Date.now(); Date.now() - t0 < waitS * 1000; await sleep(15_000)) {
  problem = await check();
  if (!problem) break;
  console.log(`cdn not ready yet: ${problem}`);
}
const value = problem ? { enabled: false, url, problem, checked_at: new Date().toISOString() } : { enabled: true, url, problem: null, checked_at: new Date().toISOString() };
// (merged into what's there: staff's 'pictures' switch — pictures through the CDN too — is kept as it was)
const sql = `insert into public.game_config (key, value, description) values ('cdn', '${JSON.stringify(value).replace(/'/g, "''")}'::jsonb, 'The CDN the app reads world snapshots and pictures from (set by the deploy).')
  on conflict (key) do update set value = public.game_config.value || excluded.value`;
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(30000),
});
if (!res.ok) { console.log(`::warning::cdn config not saved: HTTP ${res.status}`); process.exit(0); }
console.log(problem ? `::warning::CDN at ${url} isn't answering right (${problem}) — the app keeps using the database` : `CDN on: ${url}`);
