-- Granted rolls (event prizes): the owner can line up a specific rarity for a player on a chosen upcoming roll — the next
-- one, the 10th from now, the 100th — and for several rolls in a row. Nobody else's odds change. Crown grants wait for a
-- claim inside a kingdom whose Crown is still free. Every grant, delivery and cancellation is in the audit log.

create table if not exists private.granted_rolls (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  rarity text not null references public.plot_rarities (id),
  shiny boolean not null default false,
  at_roll int not null,                -- deliver on the player's claim number at_roll (or the first qualifying one after)
  note text, created_by uuid references public.players (id) on delete set null, created_at timestamptz not null default now(),
  used_at timestamptz, used_gx int, used_gy int, cancelled_at timestamptz);
create index if not exists granted_rolls_pending on private.granted_rolls (player_id, at_roll) where used_at is null and cancelled_at is null;
create index if not exists granted_rolls_creator on private.granted_rolls (created_by) where created_by is not null;
create index if not exists granted_rolls_rarity on private.granted_rolls (rarity);

/** how many plots a player has claimed by rolling (their roll count) */
create or replace function private.roll_count(p_uid uuid) returns int language sql stable as $$
  select count(*)::int from public.plot_ownership where player_id = p_uid and method in ('starter', 'acquire', 'purchase')
$$;

/** the grant due on this claim, if any (used up here) */
create or replace function private.take_granted_roll(p_uid uuid, p_gx int, p_gy int) returns private.granted_rolls language plpgsql security definer set search_path = public, pg_temp as $$
declare g private.granted_rolls; v_n int := private.roll_count(p_uid) + 1; v_city jsonb;
begin
  for g in select * from private.granted_rolls where player_id = p_uid and used_at is null and cancelled_at is null and at_roll <= v_n order by at_roll, id for update skip locked loop
    if g.rarity like 'crown%' then
      v_city := private.city_at(p_gx, p_gy);
      continue when v_city is null;
      continue when g.rarity = 'crown' and private.crown_held(v_city ->> 'id');
      continue when g.rarity = 'crown_state' and private.crown_state_held(v_city ->> 'country', v_city ->> 'state');
      continue when g.rarity = 'crown_country' and private.crown_country_held(v_city ->> 'country');
    end if;
    update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
    perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'roll', v_n));
    return g;
  end loop;
  return null;
end $$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, 'declare v_type text; v_rarity text; v_group uuid; v_lucky text;', 'declare v_type text; v_rarity text; v_group uuid; v_lucky text; v_grant private.granted_rolls;');
  n := replace(n, $a$  if v_rarity = 'crown_country' then
    perform pg_advisory_xact_lock(hashtext('crown_country:'$a$, $a$  -- a granted roll for this player, if one is due (an event prize)
  if p_method in ('acquire', 'starter', 'purchase') then
    v_grant := private.take_granted_roll(p_uid, p_gx, p_gy);
    if v_grant.id is not null then v_rarity := v_grant.rarity; v_lucky := null; end if;
  end if;
  if v_rarity = 'crown_country' then
    perform pg_advisory_xact_lock(hashtext('crown_country:'$a$);
  n := replace(n, 'rarity = coalesce(v_lucky, rarity),', 'rarity = coalesce(v_grant.rarity, v_lucky, rarity),');
  if position('take_granted_roll' in n) = 0 or position('coalesce(v_grant.rarity' in n) = 0 then raise exception 'granted rolls: take_plot anchors not found'; end if;
  execute n;
end $$;
-- a granted Shiny sticks too
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, $a$  insert into public.plot_ownership (gx, gy, player_id, method, cost)$a$, $a$  if v_grant.id is not null and v_grant.shiny then update public.world_plots set shiny = true where gx = p_gx and gy = p_gy; end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)$a$);
  if n = d then raise exception 'granted rolls: shiny anchor not found'; end if;
  execute n;
end $$;

-- ---- admin ----------------------------------------------------------------------------------------------------------
create or replace function public.admin_grant_roll(p_player uuid, p_rarity text, p_after int default 1, p_count int default 1, p_shiny boolean default false, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); v_base int; i int;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_rarities where id = p_rarity) then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
  if p_after is null or p_after not between 1 and 100000 or p_count is null or p_count not between 1 and 1000 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  -- "in N rolls": counted from the rolls they have made so far
  v_base := private.roll_count(p_player);
  for i in 0 .. p_count - 1 loop
    insert into private.granted_rolls (player_id, rarity, shiny, at_roll, note, created_by) values (p_player, p_rarity, coalesce(p_shiny, false), v_base + p_after + i, left(p_note, 300), v_uid);
  end loop;
  perform private.audit('rolls.grant', 'player', p_player::text, jsonb_build_object('rarity', p_rarity, 'after', p_after, 'count', p_count, 'shiny', p_shiny, 'note', p_note));
  return public.admin_roll_grants(p_player);
end $$;

create or replace function public.admin_roll_grants(p_player uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']);
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'player', private.profile_json(g.player_id), 'rarity', g.rarity, 'shiny', g.shiny, 'at_roll', g.at_roll,
            'rolls_now', private.roll_count(g.player_id), 'in', greatest(g.at_roll - private.roll_count(g.player_id), 1), 'note', g.note, 'created_at', g.created_at,
            'by', (select username from public.profiles where id = g.created_by), 'used_at', g.used_at, 'cancelled_at', g.cancelled_at)
          order by g.used_at is not null or g.cancelled_at is not null, g.at_roll, g.id), '[]'::jsonb)
    from (select * from private.granted_rolls where (p_player is null or player_id = p_player)
          order by (used_at is null and cancelled_at is null) desc, created_at desc limit 200) g);
end $$;

create or replace function public.admin_cancel_roll_grant(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); g private.granted_rolls;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update private.granted_rolls set cancelled_at = now() where id = p_id and used_at is null and cancelled_at is null returning * into g;
  if g.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('rolls.grant_cancelled', 'player', g.player_id::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity));
  return public.admin_roll_grants(g.player_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_grant_roll(uuid, text, integer, integer, boolean, text)', 'public.admin_roll_grants(uuid)', 'public.admin_cancel_roll_grant(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.roll_count(uuid)', 'private.take_granted_roll(uuid, integer, integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
