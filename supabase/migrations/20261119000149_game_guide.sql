-- The Guide: one call that returns every live rate in the game (rarities, rent, boosts, plot price, every Ink source
-- and its caps) plus real averages measured from what players actually earned over the last 14 days. The guide page
-- reads it, so any change to a rate or the config shows up there on its own. Stats are cached for 15 minutes.

create table if not exists private.guide_cache (id int primary key, at timestamptz not null, data jsonb not null);

-- Ink earned by playing (not invites, conversions, refunds or admin grants), for the earning stats
create index if not exists resource_ledger_ink_earned_idx on public.resource_ledger (created_at) where resource = 'ink' and delta > 0;

create or replace function private.guide_play_reason(p_reason text) returns boolean language sql immutable as $$
  select p_reason is not null and p_reason not in ('referral', 'referral_share', 'referral_welcome', 'usd_conversion', 'convert', 'starter_bonus',
                                                    'duel', 'duel_refund', 'acquire_plot', 'upgrade', 'event_reward', 'event', 'all')
     and p_reason not like 'admin%' and p_reason not like '%refund%' and p_reason not like '%credit%'
$$;

/** real averages from the last 14 days */
create or replace function private.guide_stats() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_since timestamptz := now() - interval '14 days'; v jsonb;
begin
  with e as (
    select player_id, created_at, delta, reason from public.resource_ledger
    where resource = 'ink' and delta > 0 and created_at >= v_since and private.guide_play_reason(reason)),
  ph as (select player_id, date_trunc('hour', created_at) h, sum(delta) ink from e group by 1, 2),
  pd as (select player_id, date_trunc('day', created_at) d, sum(delta) ink, count(distinct date_trunc('hour', created_at)) hours from e group by 1, 2),
  pp as (select player_id, count(*) hours, sum(ink) ink from ph group by 1),
  own as (select owner_id, count(*) n from public.world_plots where owner_id is not null group by 1),
  ms as (select play_ms, passed from public.minigame_sessions where started_at >= v_since and finished_at is not null and play_ms between 3000 and 1800000)
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
    'by_source', (select coalesce(jsonb_object_agg(reason, jsonb_build_object('ink', ink, 'times', n, 'players', players, 'avg', round(ink::numeric / n, 1)) order by ink desc), '{}'::jsonb)
                  from (select reason, sum(delta) ink, count(*) n, count(distinct player_id) players from e group by 1) s),
    'plots', jsonb_build_object('owners', (select count(*) from own), 'avg', (select round(avg(n), 1) from own),
                                'median', (select percentile_cont(0.5) within group (order by n) from own), 'total', (select coalesce(sum(n), 0) from own)),
    'minigames', jsonb_build_object('plays', (select count(*) from ms), 'win_rate', (select round(avg(passed::int)::numeric, 3) from ms),
                                    'median_seconds', (select round((percentile_cont(0.5) within group (order by play_ms) / 1000.0)::numeric, 1) from ms))
  ) into v;
  return v;
end $$;

/** every live rate + the measured averages (cached 15 min) */
create or replace function public.game_guide() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare c public.game_config; v_stats jsonb; v_at timestamptz; v_cfg jsonb; v_ultra numeric;
begin
  select data, at into v_stats, v_at from private.guide_cache where id = 1;
  if v_stats is null or v_at < now() - interval '15 minutes' then
    v_stats := private.guide_stats(); v_at := now();
    insert into private.guide_cache (id, at, data) values (1, v_at, v_stats)
    on conflict (id) do update set at = excluded.at, data = excluded.data;
  end if;
  select coalesce(sum(ppm), 0) into v_ultra from public.plot_rarities where coalesce(ppm, 0) > 0;
  select jsonb_object_agg(g.key, case g.key
           when 'hot_zones' then g.value - 'cities'
           when 'quick_buy' then g.value - 'cities'
           when 'arcade' then jsonb_build_object('arena', jsonb_build_object('rewards', g.value -> 'arena' -> 'rewards', 'daily_ink_cap', g.value -> 'arena' -> 'daily_ink_cap'),
                                                 'hot', g.value -> 'hot')
           when 'farm' then jsonb_build_object('crops', g.value -> 'crops')
           else g.value end)
    into v_cfg
  from public.game_config g
  where g.key in ('economy', 'rent', 'shiny', 'daily_streak', 'minigames', 'pvp', 'inkborn', 'planets', 'space', 'earn', 'creative', 'referrals', 'luck',
                  'hot_zones', 'arcade', 'farm', 'rarity_abilities', 'quick_buy', 'plot_switch', 'ads', 'residential');
  return jsonb_build_object(
    'updated_at', now(), 'stats_at', v_at, 'stats', v_stats, 'config', coalesce(v_cfg, '{}'::jsonb),
    'rarities', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'usd_per_second', r.usd_per_second, 'ink_mult', r.ink_reward_multiplier,
                   'emoji', r.emoji, 'ability', r.ability, 'color', r.color, 'ultra', coalesce(r.ppm, 0) > 0, 'price_mult', r.price_multiplier,
                   -- the chance a claim rolls it: ultras by their own ppm, the rest share what's left by weight (Crowns roll only in their place)
                   'chance', case when coalesce(r.ppm, 0) > 0 then r.ppm / 1e6
                                  when r.weight > 0 then (r.weight::numeric / nullif((select sum(weight) from public.plot_rarities where weight > 0), 0)) * (1 - v_ultra / 1e6)
                                  else 0 end) order by r.sort), '[]'::jsonb)
                 from public.plot_rarities r));
end $$;

revoke all on function public.game_guide() from public;
grant execute on function public.game_guide() to anon, authenticated;
revoke all on function private.guide_stats() from public, anon, authenticated;
revoke all on function private.guide_play_reason(text) from public, anon, authenticated;
