-- The Guide, part 3: the plot-rarity Ink bonus players really got on minigame wins (last 14 days), for everyone and for
-- the top players (the players with the most Ink earned by playing). Totals and averages only, never who.

create or replace function private.guide_rarity_stats() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_since timestamptz := now() - interval '14 days'; v jsonb;
begin
  with r as (
    select mr.player_id, mr.ink, coalesce((mr.breakdown ->> 'rarity')::numeric, 1) rm, coalesce((mr.breakdown ->> 'plot_level')::numeric, 1) pl
    from public.minigame_rewards mr where mr.created_at >= v_since and mr.ink > 0),
  earned as (select player_id, sum(delta) ink from public.resource_ledger
             where resource = 'ink' and delta > 0 and created_at >= v_since and private.guide_play_reason(reason) group by 1),
  cut as (select percentile_cont(0.9) within group (order by ink) c from earned),
  top as (select e.player_id from earned e, cut where e.ink >= cut.c),
  agg as (select (r.player_id in (select player_id from top)) is_top, r.* from r)
  select jsonb_build_object(
    'all', (select jsonb_build_object('wins', count(*), 'avg_mult', round(avg(rm), 3), 'avg_plot_level', round(avg(pl), 2)) from agg),
    'top', (select jsonb_build_object('wins', count(*), 'avg_mult', round(avg(rm), 3), 'avg_plot_level', round(avg(pl), 2), 'players', (select count(*) from top)) from agg where is_top),
    'by_mult', (select coalesce(jsonb_agg(jsonb_build_object('mult', rm, 'wins', n) order by rm), '[]'::jsonb) from (select rm, count(*) n from agg group by 1) x)
  ) into v;
  return v;
end $$;

create or replace function public.game_guide() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_stats jsonb; v_at timestamptz; v_ultra numeric;
begin
  select data, at into v_stats, v_at from private.guide_cache where id = 1;
  if v_stats is null or v_at < now() - interval '15 minutes' or not (v_stats ? 'player_days') or not (v_stats ? 'minigame_rarity') then
    v_stats := private.guide_stats() || jsonb_build_object('minigame_rarity', private.guide_rarity_stats()); v_at := now();
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

revoke all on function private.guide_rarity_stats() from public, anon, authenticated;
revoke all on function public.game_guide() from public;
grant execute on function public.game_guide() to anon, authenticated;
