// Tells the database where to send "look again" pushes (game_config.push): the project's address and its public
// (publishable) key, both taken from .env.production, where they're already public by design. Run by the deploy.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.production', 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF;
if (!url || !key || !token || !ref) { console.log('push config: nothing to set'); process.exit(0); }
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `insert into public.game_config (key, value, description) values ('push', jsonb_build_object('url', ${lit(url)}, 'key', ${lit(key)}), 'Where "look again" pushes go (set by the deploy).')
  on conflict (key) do update set value = excluded.value`;
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(30000),
});
console.log(res.ok ? 'push config set' : `::warning::push config not set: HTTP ${res.status}`);
