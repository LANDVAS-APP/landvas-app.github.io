-- Luck you choose to spend, and event rolls that land anywhere.
--  * Players choose when to use Luck: arm 1–5 rerolls (20 Luck each) for their next claim, or keep saving. More rerolls
--    also roll ultras likelier. After the claim it's disarmed again. (Players already holding Luck start armed with it
--    all, as before.)
--  * Event rolls (owner only) come in two kinds:
--      claim — lands on a chosen upcoming claim (next, 10th…), anywhere: no free-kingdom rule for Crowns any more;
--      luck  — lands inside the player's next Luck claim: on a chosen roll of the rerolls (1–6), or on every roll.

alter table public.player_luck add column if not exists armed int not null default 0 check (armed between 0 and 20);
update public.player_luck set armed = least(floor(luck / 20.0)::int, 5) where luck >= 20 and armed = 0;

alter table private.granted_rolls add column if not exists mode text not null default 'claim' check (mode in ('claim', 'luck'));
alter table private.granted_rolls add column if not exists slot int check (slot between 1 and 20);

create or replace function private.luck_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'enabled', coalesce((c ->> 'enabled')::boolean, true),
    'luck', coalesce(l.luck, 0), 'max', coalesce((c ->> 'max')::int, 100),
    'per_roll', greatest(coalesce((c ->> 'points_per_roll')::int, 20), 1),
    'max_rerolls', coalesce((c ->> 'max_rolls')::int, 6) - 1,
    'can_reroll', least(floor(coalesce(l.luck, 0)::numeric / greatest(coalesce((c ->> 'points_per_roll')::numeric, 20), 1))::int, coalesce((c ->> 'max_rolls')::int, 6) - 1),
    'armed', coalesce(l.armed, 0),
    -- what the next claim will really use
    'rolls', 1 + least(coalesce(l.armed, 0), floor(coalesce(l.luck, 0)::numeric / greatest(coalesce((c ->> 'points_per_roll')::numeric, 20), 1))::int,
                       coalesce((c ->> 'max_rolls')::int, 6) - 1),
    'ultra_x', 1 + least(coalesce(l.armed, 0), floor(coalesce(l.luck, 0)::numeric / greatest(coalesce((c ->> 'points_per_roll')::numeric, 20), 1))::int)
                   * greatest(coalesce((c ->> 'points_per_roll')::numeric, 20), 1) / greatest(coalesce((c ->> 'points_per_ultra_x')::numeric, 10), 1),
    'plot', c -> 'plot',
    'ink_per_point', coalesce((c ->> 'ink_per_point')::int, 50),
    'ink_left_today', greatest(coalesce((c ->> 'ink_daily_max')::int, 30) - case when l.ink_day = private.game_day(now()) then l.ink_points else 0 end, 0),
    'sacrificed', coalesce(l.sacrificed, 0), 'lucky_rolls', coalesce(l.lucky_rolls, 0))
  from (select private.cfg('luck') c) x left join public.player_luck l on l.player_id = p_uid
$$;

/** choose how many rerolls your next claim uses (0 = save your Luck) */
create or replace function public.luck_arm(p_rerolls int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.cfg('luck'); v_max int := coalesce((c ->> 'max_rolls')::int, 6) - 1;
begin
  perform private.rate_limit('luck_arm', 300, 3600);
  if p_rerolls is null or p_rerolls < 0 or p_rerolls > v_max then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  insert into public.player_luck (player_id) values (v_uid) on conflict (player_id) do nothing;
  update public.player_luck set armed = p_rerolls, updated_at = now() where player_id = v_uid;
  return private.luck_json(v_uid);
end $$;
revoke all on function public.luck_arm(int) from public, anon;
grant execute on function public.luck_arm(int) to authenticated;

/** spend the Luck you armed on this claim: one extra roll per 20 Luck; ultras likelier the more you spend; an event
    roll waiting for a Luck claim goes into the rolls. The best is kept until you choose. */
create or replace function private.luck_roll(p_uid uuid, p_gx int, p_gy int, p_rarity text) returns text language plpgsql as $$
declare c jsonb := private.cfg('luck'); v_luck int; v_arm int; v_n int; v_used int; v_total int; v_opts jsonb := jsonb_build_array(p_rarity);
  v_best text; v_try text; r record; i int; v_x numeric; v_per int; g private.granted_rolls; v_idx int;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) or p_rarity like 'crown%' then return p_rarity; end if;
  select luck, armed into v_luck, v_arm from public.player_luck where player_id = p_uid for update;
  v_per := greatest(coalesce((c ->> 'points_per_roll')::int, 20), 1);
  v_n := least(floor(coalesce(v_luck, 0)::numeric / v_per)::int, coalesce((c ->> 'max_rolls')::int, 6) - 1, coalesce(v_arm, 0));
  if v_n < 1 then return p_rarity; end if;
  v_used := v_n * v_per;
  update public.player_luck set luck = luck - v_used, armed = 0, lucky_rolls = lucky_rolls + 1, updated_at = now() where player_id = p_uid;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  v_x := 1 + v_used::numeric / greatest(coalesce((c ->> 'points_per_ultra_x')::numeric, 10), 1);
  for i in 1 .. v_n loop
    v_try := private.rarity_pick(floor(random() * v_total)::int);
    for r in select id, ppm from public.plot_rarities where ppm > 0 order by ppm loop
      if random() * 1000000 < r.ppm * v_x then v_try := r.id; exit; end if;
    end loop;
    v_opts := v_opts || jsonb_build_array(v_try);
  end loop;
  -- an event roll waiting for this player's Luck claim
  select * into g from private.granted_rolls where player_id = p_uid and mode = 'luck' and used_at is null and cancelled_at is null
   order by id limit 1 for update skip locked;
  if g.id is not null then
    if g.slot is null then
      select jsonb_agg(to_jsonb(g.rarity)) into v_opts from generate_series(0, jsonb_array_length(v_opts) - 1);
    else
      v_idx := least(g.slot, jsonb_array_length(v_opts)) - 1;
      v_opts := jsonb_set(v_opts, array[v_idx::text], to_jsonb(g.rarity));
    end if;
    update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
    perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'mode', 'luck', 'slot', g.slot));
    perform set_config('landvas.luck_grant', g.rarity || ':' || case when g.shiny then 't' else 'f' end, true);
  end if;
  select o into v_best from jsonb_array_elements_text(v_opts) o order by private.plot_rarity_rank(o) desc limit 1;
  insert into public.luck_choices (player_id, gx, gy, options) values (p_uid, p_gx, p_gy, v_opts)
  on conflict (player_id, gx, gy) do update set options = excluded.options, picked = null, created_at = now();
  return v_best;
end $$;

/** the claim-mode event roll due on this claim, if any (used up here) — anywhere, Crowns included */
create or replace function private.take_granted_roll(p_uid uuid, p_gx int, p_gy int) returns private.granted_rolls language plpgsql security definer set search_path = public, pg_temp as $$
declare g private.granted_rolls; v_n int := private.roll_count(p_uid) + 1;
begin
  select * into g from private.granted_rolls where player_id = p_uid and mode = 'claim' and used_at is null and cancelled_at is null and at_roll <= v_n
   order by at_roll, id limit 1 for update skip locked;
  if g.id is null then return null; end if;
  update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
  perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'roll', v_n, 'mode', 'claim'));
  return g;
end $$;

-- take_plot: the event roll first (it becomes the claim's own roll), then Luck's rerolls; granted Crowns aren't
-- turned into Mythics when that kingdom's Crown is already held
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, 'v_lucky text; v_grant private.granted_rolls;', 'v_lucky text; v_grant private.granted_rolls; v_base text; v_lg text; v_granted boolean := false;');
  n := replace(n, $a$  if p_method in ('acquire', 'starter') then
    v_lucky := private.luck_roll(p_uid, p_gx, p_gy, coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_rarity));
    if v_lucky is distinct from coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_rarity) then v_rarity := v_lucky; else v_lucky := null; end if;
  end if;
  -- a granted roll for this player, if one is due (an event prize)
  if p_method in ('acquire', 'starter', 'purchase') then
    v_grant := private.take_granted_roll(p_uid, p_gx, p_gy);
    if v_grant.id is not null then v_rarity := v_grant.rarity; v_lucky := null; end if;
  end if;$a$, $a$  v_base := coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_rarity);
  perform set_config('landvas.luck_grant', '', true);
  -- an event roll for this claim, if one is due: it is the claim's own roll
  if p_method in ('acquire', 'starter', 'purchase') then
    v_grant := private.take_granted_roll(p_uid, p_gx, p_gy);
    if v_grant.id is not null then v_rarity := v_grant.rarity; v_base := v_grant.rarity; end if;
  end if;
  if p_method in ('acquire', 'starter') then
    v_lucky := private.luck_roll(p_uid, p_gx, p_gy, v_base);
    if v_lucky is distinct from v_base then v_rarity := v_lucky; else v_lucky := null; end if;
  end if;
  v_lg := nullif(current_setting('landvas.luck_grant', true), '');
  v_granted := (v_grant.id is not null and v_rarity = v_grant.rarity) or (v_lg is not null and split_part(v_lg, ':', 1) = v_rarity);$a$);
  n := replace(n, $a$    if private.crown_country_held(private.city_at(p_gx, p_gy) ->> 'country') then v_rarity := 'mythic'; end if;$a$,
                  $a$    if not v_granted and private.crown_country_held(private.city_at(p_gx, p_gy) ->> 'country') then v_rarity := 'mythic'; end if;$a$);
  n := replace(n, $a$    if private.crown_state_held(private.city_at(p_gx, p_gy) ->> 'country', private.city_at(p_gx, p_gy) ->> 'state') then v_rarity := 'mythic'; end if;$a$,
                  $a$    if not v_granted and private.crown_state_held(private.city_at(p_gx, p_gy) ->> 'country', private.city_at(p_gx, p_gy) ->> 'state') then v_rarity := 'mythic'; end if;$a$);
  n := replace(n, $a$    if private.crown_held(private.city_at(p_gx, p_gy) ->> 'id') then v_rarity := 'mythic'; end if;$a$,
                  $a$    if not v_granted and private.crown_held(private.city_at(p_gx, p_gy) ->> 'id') then v_rarity := 'mythic'; end if;$a$);
  n := replace(n, 'rarity = coalesce(v_grant.rarity, v_lucky, rarity),', 'rarity = case when v_granted or v_lucky is not null or v_grant.id is not null then v_rarity else rarity end,');
  n := replace(n, $a$  if v_grant.id is not null and v_grant.shiny then update$a$,
                  $a$  if v_granted and ((v_grant.id is not null and v_grant.shiny and v_rarity = v_grant.rarity) or (v_lg like '%:t' and split_part(v_lg, ':', 1) = v_rarity)) then update$a$);
  if position('v_base := coalesce' in n) = 0 or position('not v_granted and private.crown_held' in n) = 0 or position('not v_granted and private.crown_state_held' in n) = 0
     or position('not v_granted and private.crown_country_held' in n) = 0 or position('when v_granted or v_lucky' in n) = 0 or position($a$v_lg like '%:t'$a$ in n) = 0 then
    raise exception 'event rolls: take_plot anchors not found';
  end if;
  execute n;
end $$;

-- ---- admin -------------------------------------------------------------------------------------------------------
drop function if exists public.admin_grant_roll(uuid, text, integer, integer, boolean, text);
create or replace function public.admin_grant_roll(p_player uuid, p_rarity text, p_after int default 1, p_count int default 1, p_shiny boolean default false,
  p_note text default null, p_mode text default 'claim', p_slot int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); v_base int; i int;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_rarities where id = p_rarity) then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
  if coalesce(p_mode, 'claim') not in ('claim', 'luck') then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  if p_after is null or p_after not between 1 and 100000 or p_count is null or p_count not between 1 and 1000 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_slot is not null and p_slot not between 1 and 6 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  v_base := private.roll_count(p_player);
  for i in 0 .. p_count - 1 loop
    insert into private.granted_rolls (player_id, rarity, shiny, at_roll, note, created_by, mode, slot)
    values (p_player, p_rarity, coalesce(p_shiny, false), case when p_mode = 'luck' then 0 else v_base + p_after + i end, left(p_note, 300), v_uid, coalesce(p_mode, 'claim'),
            case when p_mode = 'luck' then p_slot end);
  end loop;
  perform private.audit('rolls.grant', 'player', p_player::text, jsonb_build_object('rarity', p_rarity, 'after', p_after, 'count', p_count, 'shiny', p_shiny, 'note', p_note,
    'mode', coalesce(p_mode, 'claim'), 'slot', p_slot));
  return public.admin_roll_grants(p_player);
end $$;

create or replace function public.admin_roll_grants(p_player uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']);
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'player', private.profile_json(g.player_id), 'rarity', g.rarity, 'shiny', g.shiny, 'at_roll', g.at_roll,
            'mode', g.mode, 'slot', g.slot,
            'rolls_now', private.roll_count(g.player_id), 'in', case when g.mode = 'claim' then greatest(g.at_roll - private.roll_count(g.player_id), 1) end,
            'note', g.note, 'created_at', g.created_at,
            'by', (select username from public.profiles where id = g.created_by), 'used_at', g.used_at, 'cancelled_at', g.cancelled_at)
          order by g.used_at is not null or g.cancelled_at is not null, g.mode, g.at_roll, g.id), '[]'::jsonb)
    from (select * from private.granted_rolls where (p_player is null or player_id = p_player)
          order by (used_at is null and cancelled_at is null) desc, created_at desc limit 200) g);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_grant_roll(uuid, text, integer, integer, boolean, text, text, integer)', 'public.admin_roll_grants(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.take_granted_roll(uuid, integer, integer)', 'private.luck_roll(uuid, integer, integer, text)', 'private.luck_json(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
