// Read-only: where the heaviest players' calls spend their time. Times stable (read-only) helpers with EXPLAIN ANALYZE
// for the busiest players, picked inside each query: no ids, names or data are printed — only timings and row counts.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) process.exit(0);
const api = `https://api.supabase.com/v1/projects/${ref}`;
async function query(sql) {
  try {
    const res = await fetch(`${api}/database/query`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    if (!res.ok) return [{ error: `HTTP ${res.status}: ${text.slice(0, 300)}` }];
    return JSON.parse(text);
  } catch (e) { return [{ error: String(e).slice(0, 200) }]; }
}
const out = (title, rows) => console.log(`REPORT ${title} ${JSON.stringify(rows)}`);
const timed = async (label, sql) => {
  const r = await query(`explain (analyze, buffers, format json) ${sql}`);
  const plan = r?.[0]?.['QUERY PLAN']?.[0];
  return { label, ms: plan ? Math.round(plan['Execution Time'] * 10) / 10 : null, hit: plan?.Plan?.['Shared Hit Blocks'] ?? null, rows: plan?.Plan?.['Actual Rows'] ?? null, error: plan ? undefined : JSON.stringify(r).slice(0, 240) };
};
const as = (who) => `(select set_config('request.jwt.claims', json_build_object('sub', (${who}), 'role', 'authenticated')::text, true)) _c`;
const topPlots = `select owner_id from public.world_plots where owner_id is not null group by 1 order by count(*) desc limit 1`;
const topLedger = `select player_id from public.resource_ledger where created_at > now() - interval '1 day' group by 1 order by count(*) desc limit 1`;
const topEnch = `select owner_id from public.enchantments where status = 'active' and owner_id is not null group by 1 order by count(*) desc limit 1`;
const topGroups = `select owner_id from public.canvas_groups where status = 'active' group by 1 order by count(*) desc limit 1`;
const anyActive = `select id from public.players where last_active_at > now() - interval '1 day' order by last_active_at desc limit 1`;
out('ledger_per_player_day', await query(`select count(*) n from public.resource_ledger where created_at > now() - interval '1 day' group by player_id order by n desc limit 12`));
out('ledger_reasons_day', await query(`select reason, count(*) n from public.resource_ledger where created_at > now() - interval '1 day' group by 1 order by 2 desc limit 25`));
out('plots_per_player', await query(`select count(*) n from public.world_plots where owner_id is not null group by owner_id order by n desc limit 12`));
out('groups_per_player', await query(`select count(*) n from public.canvas_groups where status = 'active' group by owner_id order by n desc limit 8`));
out('ench_per_player', await query(`select count(*) n from public.enchantments where status = 'active' group by owner_id order by n desc limit 8`));
out('client_errors_day', await query(`select left(message, 120) message, coalesce(left(context ->> 'path', 40), '') path, count(*) n from private.client_errors where created_at > now() - interval '1 day' group by 1, 2 order by 3 desc limit 25`));
out('config_sizes', await query(`select key, pg_column_size(value) stored, length(value::text) txt, pg_column_compression(value) comp from public.game_config order by 2 desc limit 8`));
out('helpers', [
  await timed('cfg realms x100', `select sum(length(private.cfg('realms') ->> 'enabled')) from generate_series(1, 100)`),
  await timed('cfg rent x100', `select sum(length(coalesce(private.cfg('rent') ->> 'enabled', 'x'))) from generate_series(1, 100)`),
  await timed('rent_json top plots', `select private.rent_json((${topPlots}))`),
  await timed('rent_json top ledger', `select private.rent_json((${topLedger}))`),
  await timed('rent_rate top plots', `select private.rent_rate((${topPlots}))`),
  await timed('explorer_json top ledger', `select private.explorer_json((${topLedger}))`),
  await timed('explorer_json top plots', `select private.explorer_json((${topPlots}))`),
  await timed('joystick ledger scan top ledger', `select count(*) from public.resource_ledger l where l.player_id = (${topLedger}) and l.reason = 'joystick_refill' and l.created_at >= private.day_start(now())`),
  await timed('ledger today top ledger (all reasons)', `select count(*) from public.resource_ledger l where l.player_id = (${topLedger}) and l.created_at >= private.day_start(now())`),
  await timed('balances top ledger', `select private.balances((${topLedger}))`),
  await timed('profile_json', `select private.profile_json((${topLedger}))`),
  await timed('my_plots top plots', `select public.my_plots() from ${as(topPlots)}`),
  await timed('my_groups top groups', `select public.my_groups() from ${as(topGroups)}`),
  await timed('group_json all groups of top', `select count(private.group_json(g.id)) from public.canvas_groups g where g.owner_id = (${topGroups}) and g.status = 'active'`),
  await timed('ench_view all of top', `select count(private.ench_view(e.id)) from public.enchantments e where e.owner_id = (${topEnch}) and e.status = 'active'`),
  await timed('ench_partners all of top', `select count(private.ench_partners(e.id)) from public.enchantments e where e.owner_id = (${topEnch}) and e.status = 'active'`),
  await timed('ench_kind_view all of top', `select count(private.ench_kind_view(e, private.ench_now(e))) from public.enchantments e where e.owner_id = (${topEnch}) and e.status = 'active'`),
  await timed('trait_view all of top', `select count(private.trait_view(e)) from public.enchantments e where e.owner_id = (${topEnch}) and e.status = 'active'`),
  await timed('ench_star_view all of top', `select count(private.ench_star_view(e)) from public.enchantments e where e.owner_id = (${topEnch}) and e.status = 'active'`),
  await timed('seek_chest_list all of top', `select count(private.seek_chest_list(e.owner_id, e.id)) from public.enchantments e where e.owner_id = (${topEnch}) and e.status = 'active'`),
  await timed('hot_zone_today', `select public.hot_zone_today()`),
  await timed('enchant_map world', `select public.enchant_map(0, 0, 4194303, 4194303)`),
  await timed('my_earnings_today top ledger', `select public.my_earnings_today() from ${as(topLedger)}`),
  await timed('my_friends top ledger', `select public.my_friends() from ${as(topLedger)}`),
  await timed('my_minigame_records top ledger', `select public.my_minigame_records() from ${as(topLedger)}`),
  await timed('plot_details busy', `select public.plot_details(p.gx, p.gy) from (select gx, gy from public.world_plots where owner_id = (${topPlots}) limit 1) p, ${as(anyActive)}`),
]);
// per-kind view cost: the slowest enchantment kinds
out('ench_kinds', await query(`select kind, count(*) n from public.enchantments where status = 'active' group by 1 order by 2 desc`));
out('splices', await query(`select count(*) total, count(*) filter (where ends_at > now()) live from public.enchant_splices`));
