-- The Guide, part 2: what grinders really make. Adds to the measured stats (still totals and percentiles only, never
-- who): how much a player makes in a day (median up to the best day), the top days with their hours and sources,
-- grinders' averages, every Ink source's rate per hour while it's being played, plots claimed per day, and the real
-- average rent of owned plots. Also sends the arcade, business, realm and other game settings the page explains.

create or replace function private.guide_stats() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_since timestamptz := now() - interval '14 days'; v jsonb;
begin
  with e as (
    select player_id, created_at, delta, reason from public.resource_ledger
    where resource = 'ink' and delta > 0 and created_at >= v_since and private.guide_play_reason(reason)),
  ph as (select player_id, date_trunc('hour', created_at) h, sum(delta) ink from e group by 1, 2),
  pd as (select player_id, date_trunc('day', created_at) d, sum(delta) ink, count(*) n, count(distinct date_trunc('hour', created_at)) hours,
                extract(epoch from max(created_at) - min(created_at)) / 3600.0 span_h from e group by 1, 2),
  pp as (select player_id, count(*) hours, sum(ink) ink from ph group by 1),
  sh as (select reason, player_id, date_trunc('hour', created_at) h, sum(delta) ink, count(*) n from e group by 1, 2, 3),
  own as (select owner_id, count(*) n from public.world_plots where owner_id is not null group by 1),
  cl as (select owner_id, date_trunc('day', claimed_at) d, count(*) n from public.world_plots where owner_id is not null and claimed_at >= v_since group by 1, 2),
  ms as (select play_ms, passed from public.minigame_sessions where started_at >= v_since and finished_at is not null and play_ms between 3000 and 1800000),
  p90 as (select percentile_cont(0.9) within group (order by ink) c from pd),
  grind as (select * from pd where hours >= 3),
  topd as (select pd.* from pd, p90 where pd.ink >= p90.c)
  select jsonb_build_object(
    'days', 14,
    'players', (select count(*) from pp),
    'active_hours', (select coalesce(sum(hours), 0) from pp),
    'ink', (select coalesce(sum(ink), 0) from pp),
    'ink_per_active_hour', (select round(sum(ink)::numeric / nullif(sum(hours), 0), 1) from pp),
    'ink_per_active_hour_median', (select round(percentile_cont(0.5) within group (order by ink::numeric / hours)::numeric, 1) from pp),
    'ink_per_active_hour_p90', (select round(percentile_cont(0.9) within group (order by ink::numeric / hours)::numeric, 1) from pp),
    'ink_per_active_day_median', (select round(percentile_cont(0.5) within group (order by ink)::numeric, 1) from pd),
    'ink_per_active_day_p90', (select round(percentile_cont(0.9) within group (order by ink)::numeric, 1) from pd),
    'hours_per_active_day_avg', (select round(avg(hours), 2) from pd),
    'player_days', (select jsonb_build_object('count', count(*),
        'p50', round(percentile_cont(0.5) within group (order by ink)::numeric), 'p75', round(percentile_cont(0.75) within group (order by ink)::numeric),
        'p90', round(percentile_cont(0.9) within group (order by ink)::numeric), 'p95', round(percentile_cont(0.95) within group (order by ink)::numeric),
        'p99', round(percentile_cont(0.99) within group (order by ink)::numeric), 'max', max(ink),
        'hours_p50', percentile_cont(0.5) within group (order by hours), 'hours_p75', percentile_cont(0.75) within group (order by hours),
        'ge_1000', count(*) filter (where ink >= 1000), 'ge_3000', count(*) filter (where ink >= 3000),
        'ge_5000', count(*) filter (where ink >= 5000), 'ge_8000', count(*) filter (where ink >= 8000)) from pd),
    'top_days', (select coalesce(jsonb_agg(x order by (x ->> 'ink')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('ink', t.ink, 'hours', t.hours, 'span_hours', round(t.span_h::numeric, 1), 'rewards', t.n,
          'sources', (select coalesce(jsonb_object_agg(reason, s), '{}'::jsonb) from (select reason, sum(delta) s from e
                       where e.player_id = t.player_id and date_trunc('day', e.created_at) = t.d group by 1 order by 2 desc limit 4) y)) x
        from (select * from pd order by ink desc limit 10) t) z),
    'grinders', (select jsonb_build_object('days', count(*), 'avg_ink', round(avg(ink)), 'avg_hours', round(avg(hours), 1),
        'ink_per_active_hour', round(sum(ink)::numeric / nullif(sum(hours), 0), 1), 'p50', round(percentile_cont(0.5) within group (order by ink)::numeric),
        'p90', round(percentile_cont(0.9) within group (order by ink)::numeric)) from grind),
    'top10pct', (select jsonb_build_object('days', count(*), 'avg_ink', round(avg(ink)), 'avg_hours', round(avg(hours), 1),
        'ink_per_active_hour', round(sum(ink)::numeric / nullif(sum(hours), 0), 1)) from topd),
    'by_source', (select coalesce(jsonb_object_agg(reason, jsonb_build_object('ink', ink, 'times', n, 'players', players, 'avg', round(ink::numeric / n, 1),
                     'per_hour', per_hour, 'p90_hour', p90_hour, 'max_hour', max_hour)), '{}'::jsonb)
                  from (select reason, sum(ink) ink, sum(n) n, count(distinct player_id) players, round(avg(ink), 1) per_hour,
                               round(percentile_cont(0.9) within group (order by ink)::numeric) p90_hour, max(ink) max_hour from sh group by 1) s),
    'top_days_sources', (select coalesce(jsonb_object_agg(reason, s), '{}'::jsonb) from (
        select e.reason, sum(e.delta) s from e join topd t on t.player_id = e.player_id and date_trunc('day', e.created_at) = t.d group by 1) y),
    'plots', jsonb_build_object('owners', (select count(*) from own), 'avg', (select round(avg(n), 1) from own),
                                'median', (select percentile_cont(0.5) within group (order by n) from own),
                                'p90', (select percentile_cont(0.9) within group (order by n) from own), 'max', (select max(n) from own),
                                'total', (select coalesce(sum(n), 0) from own),
                                'avg_usd_per_second', (select avg(r.usd_per_second * case when p.shiny then coalesce((private.cfg('shiny') ->> 'rent_mult')::numeric, 5) else 1 end)
                                                       from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.owner_id is not null)),
    'claims_per_day', (select jsonb_build_object('player_days', count(*), 'avg', round(avg(n), 1), 'p50', percentile_cont(0.5) within group (order by n),
                              'p90', percentile_cont(0.9) within group (order by n), 'max', max(n)) from cl),
    'minigames', jsonb_build_object('plays', (select count(*) from ms), 'win_rate', (select round(avg(passed::int)::numeric, 3) from ms),
                                    'median_seconds', (select round((percentile_cont(0.5) within group (order by play_ms) / 1000.0)::numeric, 1) from ms))
  ) into v;
  return v;
end $$;

-- the game settings the guide explains (a trimmed copy of each: no big catalogues)
create or replace function private.guide_config() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(g.key, case g.key
           when 'hot_zones' then g.value - 'cities'
           when 'quick_buy' then g.value - 'cities'
           when 'arcade' then jsonb_build_object(
               'daily_cap', g.value -> 'daily_cap', 'hot', g.value -> 'hot', 'upgrade', g.value -> 'upgrade', 'owner_share', g.value -> 'owner_share',
               'daily_bonus', g.value -> 'daily_bonus',
               'arena', jsonb_build_object('rewards', g.value -> 'arena' -> 'rewards', 'daily_ink_cap', g.value -> 'arena' -> 'daily_ink_cap'),
               'games', (select coalesce(jsonb_object_agg(k, jsonb_build_object('name', v ->> 'name', 'emoji', v ->> 'emoji', 'max_ink', v -> 'max_ink',
                           'points_per_ink', v -> 'points_per_ink', 'per_second', v -> 'per_second', 'min_seconds', v -> 'min_seconds', 'level', v -> 'level', 'cost', v -> 'cost')), '{}'::jsonb)
                         from jsonb_each(coalesce(g.value -> 'games', '{}'::jsonb)) as t(k, v)),
               'carnival', (select coalesce(jsonb_object_agg(k, jsonb_build_object('name', v ->> 'name', 'emoji', v ->> 'emoji', 'max_ink', v -> 'max_ink',
                           'points_per_ink', v -> 'points_per_ink', 'per_second', v -> 'per_second', 'seconds', v -> 'seconds')), '{}'::jsonb)
                         from jsonb_each(coalesce(g.value -> 'carnival' -> 'games', '{}'::jsonb)) as t(k, v)))
           when 'farm' then jsonb_build_object('crops', g.value -> 'crops')
           when 'realms' then (g.value - 'kinds') || jsonb_build_object('games', (select coalesce(jsonb_agg(jsonb_build_object('realm', k ->> 'name', 'emoji', k ->> 'emoji',
                           'name', gv ->> 'name', 'max_ink', gv -> 'max_ink', 'points_per_ink', gv -> 'points_per_ink', 'per_second', gv -> 'per_second')), '[]'::jsonb)
                         from jsonb_each(coalesce(g.value -> 'kinds', '{}'::jsonb)) as kk(id, k), jsonb_each(coalesce(k -> 'games', '{}'::jsonb)) as gg(gid, gv)))
           when 'business' then jsonb_build_object('daily_cap', g.value -> 'daily_cap', 'games', g.value -> 'games', 'golden', g.value -> 'golden',
                                                   'dividend', g.value -> 'dividend', 'ipo_ink', g.value -> 'ipo_ink', 'milestone_ink', g.value -> 'milestone_ink')
           else g.value end), '{}'::jsonb)
  from public.game_config g
  where g.key in ('economy', 'rent', 'shiny', 'daily_streak', 'minigames', 'pvp', 'inkborn', 'planets', 'space', 'earn', 'creative', 'referrals', 'luck',
                  'hot_zones', 'arcade', 'farm', 'rarity_abilities', 'quick_buy', 'plot_switch', 'ads', 'residential', 'realms', 'business', 'group_games', 'clan_keep')
$$;

create or replace function public.game_guide() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_stats jsonb; v_at timestamptz; v_ultra numeric;
begin
  select data, at into v_stats, v_at from private.guide_cache where id = 1;
  if v_stats is null or v_at < now() - interval '15 minutes' or not (v_stats ? 'player_days') then
    v_stats := private.guide_stats(); v_at := now();
    insert into private.guide_cache (id, at, data) values (1, v_at, v_stats)
    on conflict (id) do update set at = excluded.at, data = excluded.data;
  end if;
  select coalesce(sum(ppm), 0) into v_ultra from public.plot_rarities where coalesce(ppm, 0) > 0;
  return jsonb_build_object(
    'updated_at', now(), 'stats_at', v_at, 'stats', v_stats, 'config', private.guide_config(),
    'rarities', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'usd_per_second', r.usd_per_second, 'ink_mult', r.ink_reward_multiplier,
                   'emoji', r.emoji, 'ability', r.ability, 'color', r.color, 'ultra', coalesce(r.ppm, 0) > 0, 'price_mult', r.price_multiplier,
                   'chance', case when coalesce(r.ppm, 0) > 0 then r.ppm / 1e6
                                  when r.weight > 0 then (r.weight::numeric / nullif((select sum(weight) from public.plot_rarities where weight > 0), 0)) * (1 - v_ultra / 1e6)
                                  else 0 end) order by r.sort), '[]'::jsonb)
                 from public.plot_rarities r));
end $$;

revoke all on function private.guide_stats() from public, anon, authenticated;
revoke all on function private.guide_config() from public, anon, authenticated;
revoke all on function public.game_guide() from public;
grant execute on function public.game_guide() to anon, authenticated;
