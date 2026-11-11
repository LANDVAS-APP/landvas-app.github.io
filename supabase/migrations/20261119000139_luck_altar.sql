-- The Altar of Luck: sacrifice to make your next roll better.
--   * Luck goes from 0 to 100. Sacrifice a Base plot (the rarer it is, the more Luck it gives) or offer Ink
--     (50 Ink a point, up to 30 points a day from Ink).
--   * Your next claim spends all of it: the plot rolls extra times and keeps the best — one extra roll per 20 Luck
--     (best of 6 at 100) — and every ultra is likelier: ×(1 + Luck/10), so ×11 at 100.
--   * Crowns can't be bought with Luck (they're one per kingdom); a lucky roll never makes a plot worse.

insert into public.game_config (key, value, description) values ('luck', '{
  "enabled": true, "max": 100,
  "plot": {"common": 3, "uncommon": 5, "rare": 8, "epic": 15, "legendary": 30, "mythic": 60, "ultra": 100},
  "ink_per_point": 50, "ink_daily_max": 30,
  "points_per_roll": 20, "points_per_ultra_x": 10
}', 'The Altar of Luck: how much Luck a sacrificed plot or Ink gives, and what Luck does to the next claim.')
on conflict (key) do update set value = excluded.value;

create table if not exists public.player_luck (
  player_id uuid primary key references public.players (id) on delete cascade,
  luck int not null default 0 check (luck between 0 and 1000),
  ink_day date, ink_points int not null default 0,
  sacrificed int not null default 0,
  lucky_rolls int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.player_luck enable row level security;
revoke all on public.player_luck from anon, authenticated;

/** how good a rarity is, for "keep the best": the everyday ones by their order, ultras above them (rarer = better) */
create or replace function private.plot_rarity_rank(p_id text) returns numeric language sql stable as $$
  select case when r.id like 'crown%' then 1e9 when coalesce(r.ppm, 0) > 0 then 1000 + 1000000.0 / r.ppm else r.sort end
  from public.plot_rarities r where r.id = p_id
$$;

/** spend a player's Luck on a claim: extra rolls, likelier ultras; returns the (possibly) better rarity */
create or replace function private.luck_apply(p_uid uuid, p_rarity text) returns text language plpgsql as $$
declare c jsonb := private.cfg('luck'); v_luck int; v_best text := p_rarity; v_total int; v_try text; r record; i int; v_x numeric;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) or p_rarity like 'crown%' then return p_rarity; end if;
  select luck into v_luck from public.player_luck where player_id = p_uid for update;
  if coalesce(v_luck, 0) <= 0 then return p_rarity; end if;
  update public.player_luck set luck = 0, lucky_rolls = lucky_rolls + 1, updated_at = now() where player_id = p_uid;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  -- extra rolls on the everyday table
  for i in 1 .. floor(v_luck::numeric / greatest(coalesce((c ->> 'points_per_roll')::numeric, 20), 1))::int loop
    v_try := private.rarity_pick(floor(random() * v_total)::int);
    if private.plot_rarity_rank(v_try) > private.plot_rarity_rank(v_best) then v_best := v_try; end if;
  end loop;
  -- likelier ultras (each on its own roll, like the cell's)
  v_x := v_luck::numeric / greatest(coalesce((c ->> 'points_per_ultra_x')::numeric, 10), 1);
  for r in select id, ppm from public.plot_rarities where ppm > 0 order by ppm loop
    if random() * 1000000 < r.ppm * v_x and private.plot_rarity_rank(r.id) > private.plot_rarity_rank(v_best) then v_best := r.id; end if;
  end loop;
  return v_best;
end $$;

-- the claim spends your Luck (a lucky roll can change a cell's rarity, even one claimed before)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, 'declare v_type text; v_rarity text; v_group uuid;', 'declare v_type text; v_rarity text; v_group uuid; v_lucky text;');
  n := replace(n, $a$  v_rarity := private.plot_rarity_for(p_gx, p_gy);
$a$, $a$  v_rarity := private.plot_rarity_for(p_gx, p_gy);
  if p_method in ('acquire', 'starter') then
    v_lucky := private.luck_apply(p_uid, coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_rarity));
    if v_lucky is distinct from coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_rarity) then v_rarity := v_lucky; else v_lucky := null; end if;
  end if;
$a$);
  n := replace(n, $a$       set owner_id = p_uid, claimed_at = now(), level = 1,$a$, $a$       set owner_id = p_uid, claimed_at = now(), level = 1, rarity = coalesce(v_lucky, rarity),$a$);
  n := replace(n, $a$return jsonb_build_object('gx', p_gx,$a$, $a$return jsonb_build_object('lucky', v_lucky is not null, 'gx', p_gx,$a$);
  if position('luck_apply' in n) = 0 or position('coalesce(v_lucky, rarity)' in n) = 0 or position('''lucky''' in n) = 0 then
    raise exception 'luck: take_plot anchors not found';
  end if;
  execute n;
end $$;

-- ---- the altar -----------------------------------------------------------------------------------------------------------
create or replace function private.luck_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'enabled', coalesce((c ->> 'enabled')::boolean, true),
    'luck', coalesce(l.luck, 0), 'max', coalesce((c ->> 'max')::int, 100),
    'rolls', 1 + floor(coalesce(l.luck, 0)::numeric / greatest(coalesce((c ->> 'points_per_roll')::numeric, 20), 1))::int,
    'ultra_x', 1 + coalesce(l.luck, 0)::numeric / greatest(coalesce((c ->> 'points_per_ultra_x')::numeric, 10), 1),
    'plot', c -> 'plot',
    'ink_per_point', coalesce((c ->> 'ink_per_point')::int, 50),
    'ink_left_today', greatest(coalesce((c ->> 'ink_daily_max')::int, 30) - case when l.ink_day = private.game_day(now()) then l.ink_points else 0 end, 0),
    'sacrificed', coalesce(l.sacrificed, 0), 'lucky_rolls', coalesce(l.lucky_rolls, 0))
  from (select private.cfg('luck') c) x left join public.player_luck l on l.player_id = p_uid
$$;

create or replace function public.luck_status() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return private.luck_json(v_uid) || jsonb_build_object('plots', coalesce((
    select jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'shiny', p.shiny, 'name', g.name,
             'luck', least(coalesce((private.cfg('luck') -> 'plot' ->> case when coalesce(r.ppm, 0) > 0 then 'ultra' else p.rarity end)::int, 1), 1000))
           order by r.sort, p.claimed_at)
    from public.world_plots p join public.plot_rarities r on r.id = p.rarity
    join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
    join public.canvas_groups g on g.id = m.group_id
    where p.owner_id = v_uid and g.kind = 'base' and g.plot_count = 1 and g.status = 'active' and not p.locked and p.rarity not like 'crown%'), '[]'::jsonb));
end $$;

/** sacrifice one of your Base plots (alone in its group) for Luck: the plot goes back to the world */
create or replace function public.luck_sacrifice_plot(p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.cfg('luck'); p public.world_plots; g public.canvas_groups;
  v_pts int; v_proj uuid; v_count int;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  perform private.rate_limit('luck_sacrifice', 120, 3600);
  select * into p from public.world_plots where gx = p_gx and gy = p_gy for update;
  if not found or p.owner_id is distinct from v_uid then raise exception 'not_owned' using errcode = 'P0001'; end if;
  if p.locked or p.rarity like 'crown%' then raise exception 'cannot_sacrifice' using errcode = 'P0001'; end if;
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p_gx and m.gy = p_gy for update of gr;
  if not found or g.kind <> 'base' or g.plot_count <> 1 or g.status <> 'active' then raise exception 'only_single_base_plots' using errcode = 'P0001'; end if;
  select count(*) into v_count from public.world_plots where owner_id = v_uid;
  if v_count <= 1 then raise exception 'last_plot' using errcode = 'P0001'; end if;
  v_pts := coalesce((c -> 'plot' ->> case when coalesce((select ppm from public.plot_rarities where id = p.rarity), 0) > 0 then 'ultra' else p.rarity end)::int, 1);
  perform private.rent_settle(v_uid);  -- rent up to now
  delete from public.canvas_group_members where group_id = g.id;
  update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = g.id;
  if g.project_id is not null then update public.artwork_projects set status = 'archived', updated_at = now() where id = g.project_id; end if;
  update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null, updated_at = now()
   where gx = p_gx and gy = p_gy;
  update public.plot_ownership set released_at = now(), release_reason = 'sacrificed for luck' where gx = p_gx and gy = p_gy and released_at is null;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  insert into public.player_luck (player_id) values (v_uid) on conflict (player_id) do nothing;
  update public.player_luck set luck = least(luck + v_pts, coalesce((c ->> 'max')::int, 100)), sacrificed = sacrificed + 1, updated_at = now() where player_id = v_uid;
  return private.luck_json(v_uid) || jsonb_build_object('gained', v_pts, 'rarity', p.rarity);
end $$;

/** offer Ink for Luck */
create or replace function public.luck_offer_ink(p_points int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.cfg('luck'); l public.player_luck; v_day date := private.game_day(now());
  v_left int; v_cost int; v_max int := coalesce((c ->> 'max')::int, 100);
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if p_points is null or p_points < 1 or p_points > 100 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  insert into public.player_luck (player_id) values (v_uid) on conflict (player_id) do nothing;
  select * into l from public.player_luck where player_id = v_uid for update;
  v_left := coalesce((c ->> 'ink_daily_max')::int, 30) - case when l.ink_day = v_day then l.ink_points else 0 end;
  if p_points > v_left then raise exception 'luck_ink_daily_limit' using errcode = 'P0001'; end if;
  if l.luck + p_points > v_max then raise exception 'luck_full' using errcode = 'P0001'; end if;
  v_cost := p_points * coalesce((c ->> 'ink_per_point')::int, 50);
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'luck', 'luck', 'ink', 'luck:' || v_uid || ':' || gen_random_uuid());
  update public.player_luck set luck = luck + p_points, ink_points = case when ink_day = v_day then ink_points else 0 end + p_points, ink_day = v_day, updated_at = now()
   where player_id = v_uid;
  return private.luck_json(v_uid) || jsonb_build_object('gained', p_points, 'cost', v_cost, 'balances', private.balances(v_uid));
end $$;

revoke all on function public.luck_status() from public, anon;
revoke all on function public.luck_sacrifice_plot(integer, integer) from public, anon;
revoke all on function public.luck_offer_ink(integer) from public, anon;
grant execute on function public.luck_status() to authenticated;
grant execute on function public.luck_sacrifice_plot(integer, integer) to authenticated;
grant execute on function public.luck_offer_ink(integer) to authenticated;
do $$
declare f text;
begin
  foreach f in array array['private.plot_rarity_rank(text)', 'private.luck_apply(uuid, text)', 'private.luck_json(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
