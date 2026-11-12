-- Event rolls are real rolls: posted on the live feed and counted everywhere, and a Crown stays one per kingdom.
--  * A granted pull is posted like any other claim (and a Crown gets its Crown post), and Luck picks from a granted
--    Luck claim are posted too.
--  * A granted Crown (City, State or Country) only lands inside a kingdom whose Crown of that tier is still free — one
--    City Crown per city, one State Crown per state, one Country Crown per country, for everyone, events included. If
--    the due claim isn't in a free kingdom the grant waits for the next one that is (other grants still land). Quick
--    rolls (Simple mode) steer a due Crown grant into the nearest free kingdom so it is never stuck.
--  * A State Crown needs a city that is in a state (cities without one can't hold one, so a state is never shared).
--  * Crowns already granted outside any kingdom, or into one that was already held, are moved to the nearest free
--    kingdom of their tier (the earliest holder keeps the contested one), so they show on Royalty and count; the Crowns
--    granted this past week get their feed posts.

-- ---- is this plot's kingdom free for a Crown of this tier? (locks that kingdom for the rest of the transaction) -------
create or replace function private.crown_kingdom_free(p_tier text, p_gx int, p_gy int) returns boolean language plpgsql as $$
declare v_city jsonb := private.city_at(p_gx, p_gy);
begin
  if v_city is null then return false; end if;
  if p_tier = 'crown_country' then
    perform pg_advisory_xact_lock(hashtext('crown_country:' || coalesce(v_city ->> 'country', '')));
    return not private.crown_country_held(v_city ->> 'country');
  elsif p_tier = 'crown_state' then
    if v_city ->> 'state' is null then return false; end if;
    perform pg_advisory_xact_lock(hashtext('crown_state:' || coalesce(v_city ->> 'country', '') || '/' || coalesce(v_city ->> 'state', '')));
    return not private.crown_state_held(v_city ->> 'country', v_city ->> 'state');
  elsif p_tier = 'crown' then
    perform pg_advisory_xact_lock(hashtext('crown:' || coalesce(v_city ->> 'id', '')));
    return not private.crown_held(v_city ->> 'id');
  end if;
  return true;
end $$;

/** the city nearest to (gx, gy) whose kingdom of this tier has no Crown (ignoring one plot, when moving it) */
create or replace function private.nearest_free_kingdom(p_tier text, p_gx int, p_gy int, p_skip_gx int default null, p_skip_gy int default null)
returns public.world_cities language sql stable as $$
  select c.* from public.world_cities c
   where case p_tier
           when 'crown' then not exists (select 1 from public.world_plots p where p.rarity = 'crown' and p.owner_id is not null and p.city_id = c.id
                                           and (p.gx, p.gy) is distinct from (p_skip_gx, p_skip_gy))
           when 'crown_state' then c.state is not null and not exists (
                  select 1 from public.world_plots p join public.world_cities k on k.id = p.city_id
                   where p.rarity = 'crown_state' and p.owner_id is not null and k.country = c.country and k.state = c.state
                     and (p.gx, p.gy) is distinct from (p_skip_gx, p_skip_gy))
           else not exists (
                  select 1 from public.world_plots p join public.world_cities k on k.id = p.city_id
                   where p.rarity = 'crown_country' and p.owner_id is not null and k.country = c.country
                     and (p.gx, p.gy) is distinct from (p_skip_gx, p_skip_gy))
         end
   order by (c.gx - p_gx)::numeric ^ 2 + (c.gy - p_gy)::numeric ^ 2, c.id
   limit 1
$$;

-- ---- claim-mode event rolls: a Crown waits for a claim in a free kingdom ----------------------------------------------
create or replace function private.take_granted_roll(p_uid uuid, p_gx int, p_gy int) returns private.granted_rolls language plpgsql security definer set search_path = public, pg_temp as $$
declare g private.granted_rolls; v_n int := private.roll_count(p_uid) + 1;
begin
  for g in select * from private.granted_rolls where player_id = p_uid and mode = 'claim' and used_at is null and cancelled_at is null and at_roll <= v_n
            order by at_roll, id for update skip locked loop
    continue when g.rarity like 'crown%' and not private.crown_kingdom_free(g.rarity, p_gx, p_gy);
    update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
    perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'roll', v_n, 'mode', 'claim'));
    return g;
  end loop;
  return null;
end $$;

-- ---- Luck-mode event rolls: a Crown waits too ------------------------------------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.luck_roll(uuid,integer,integer,text)'::regprocedure);
  n := replace(d, $a$   order by id limit 1 for update skip locked;
  if g.id is not null then$a$, $a$   and (rarity not like 'crown%' or private.crown_kingdom_free(rarity, p_gx, p_gy))
   order by id limit 1 for update skip locked;
  if g.id is not null then$a$);
  if n = d then raise exception 'unique crowns: luck_roll anchor not found'; end if;
  execute n;
end $$;

-- ---- take_plot: no more quiet claims; every Crown is checked against its kingdom (event ones were checked above) ------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, $a$  -- event rolls stay quiet: nothing on the live feed for this claim
  perform set_config('landvas.quiet_claim', case when v_granted then '1' else '' end, true);$a$,
                  $a$  -- event rolls are posted on the live feed like any other claim
  perform set_config('landvas.quiet_claim', '', true);$a$);
  n := replace(n, $a$if not v_granted and private.crown_country_held(private.city_at(p_gx, p_gy) ->> 'country') then$a$,
                  $a$if private.city_at(p_gx, p_gy) is null or private.crown_country_held(private.city_at(p_gx, p_gy) ->> 'country') then$a$);
  n := replace(n, $a$if not v_granted and private.crown_state_held(private.city_at(p_gx, p_gy) ->> 'country', private.city_at(p_gx, p_gy) ->> 'state') then$a$,
                  $a$if private.city_at(p_gx, p_gy) ->> 'state' is null or private.crown_state_held(private.city_at(p_gx, p_gy) ->> 'country', private.city_at(p_gx, p_gy) ->> 'state') then$a$);
  n := replace(n, $a$if not v_granted and private.crown_held(private.city_at(p_gx, p_gy) ->> 'id') then$a$,
                  $a$if private.city_at(p_gx, p_gy) is null or private.crown_held(private.city_at(p_gx, p_gy) ->> 'id') then$a$);
  if position($a$set_config('landvas.quiet_claim', '', true)$a$ in n) = 0 or position('not v_granted and' in n) > 0
     or position($a$private.city_at(p_gx, p_gy) ->> 'state' is null or private.crown_state_held$a$ in n) = 0 then
    raise exception 'unique crowns: take_plot anchors not found';
  end if;
  execute n;
end $$;

-- a natural State Crown only rolls in a city that is in a state
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.plot_rarity_for(integer,integer)'::regprocedure);
  n := replace(d, $a$       and not private.crown_state_held(v_city ->> 'country', v_city ->> 'state') then$a$,
                  $a$       and v_city ->> 'state' is not null and not private.crown_state_held(v_city ->> 'country', v_city ->> 'state') then$a$);
  if n = d then raise exception 'unique crowns: plot_rarity_for anchor not found'; end if;
  execute n;
end $$;

-- ---- Luck picks: posted for event claims too; a Crown pick must still be free, and gets its Crown post ----------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.luck_pick(integer,integer,integer)'::regprocedure);
  n := replace(d, $a$  if not exists (select 1 from private.granted_rolls where player_id = v_uid and used_gx = p_gx and used_gy = p_gy and used_at > l.created_at - interval '1 minute') then
    insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'pick', 'rarity', v_r, 'of', v_n));
  end if;$a$, $a$  insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'pick', 'rarity', v_r, 'of', v_n));
  if v_r like 'crown%' then
    insert into public.feed_events (kind, player_id, data)
    select 'crown', v_uid, jsonb_build_object('tier', v_r, 'place', case v_r when 'crown' then k.name when 'crown_state' then k.state else k.country_name end, 'country', k.country)
      from public.world_plots p join public.world_cities k on k.id = p.city_id where p.gx = p_gx and p.gy = p_gy;
  end if;$a$);
  n := replace(n, $a$  perform private.rent_settle(v_uid);$a$, $a$  if v_r like 'crown%' and v_r is distinct from (select rarity from public.world_plots where gx = p_gx and gy = p_gy)
     and not private.crown_kingdom_free(v_r, p_gx, p_gy) then
    raise exception 'crown_taken' using errcode = 'P0001';
  end if;
  perform private.rent_settle(v_uid);$a$);
  if position('crown_taken' in n) = 0 or position('granted_rolls' in n) > 0 then raise exception 'unique crowns: luck_pick anchors not found'; end if;
  execute n;
end $$;

-- ---- quick rolls (Simple mode): a due Crown grant is rolled in the nearest free kingdom -------------------------------
create or replace function private.granted_crown_cell(p_uid uuid) returns int[] language plpgsql as $$
declare g private.granted_rolls; v_ax int; v_ay int; c public.world_cities; v_x int; v_y int; v_c jsonb; i int; v_r int;
begin
  select * into g from private.granted_rolls where player_id = p_uid and mode = 'claim' and used_at is null and cancelled_at is null
     and at_roll <= private.roll_count(p_uid) + 1 order by at_roll, id limit 1;
  if g.id is null or g.rarity not like 'crown%' then return null; end if;
  select gx, gy into v_ax, v_ay from public.world_plots where owner_id = p_uid order by claimed_at desc limit 1;
  if v_ax is null then
    v_c := (coalesce(private.cfg('quick_buy'), '{}'::jsonb) -> 'cities') -> 0;
    v_ax := coalesce((v_c ->> 0)::int, 793527); v_ay := coalesce((v_c ->> 1)::int, 1576239);
  end if;
  c := private.nearest_free_kingdom(g.rarity, v_ax, v_ay);
  if c.id is null then return null; end if;
  v_r := greatest((c.radius * 0.5)::int, 1);
  for i in 1 .. 200 loop
    v_x := c.gx + floor((random() * 2 - 1) * v_r)::int; v_y := c.gy + floor((random() * 2 - 1) * v_r)::int;
    continue when v_x not between 0 and 4194303 or v_y not between 0 and 4194303;
    continue when exists (select 1 from public.world_plots where gx = v_x and gy = v_y and (owner_id is not null or locked));
    v_c := private.city_at(v_x, v_y);
    continue when v_c is null;
    continue when g.rarity = 'crown' and (v_c ->> 'id')::int <> c.id;
    continue when g.rarity = 'crown_state' and ((v_c ->> 'country') is distinct from c.country or (v_c ->> 'state') is distinct from c.state);
    continue when g.rarity = 'crown_country' and (v_c ->> 'country') is distinct from c.country;
    return array[v_x, v_y];
  end loop;
  return null;
end $$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.quick_buy_plot(text,uuid,boolean)'::regprocedure);
  n := replace(d, $a$  v_cell := private.quick_buy_cell(v_uid, coalesce(p_hot, false), v_min);$a$,
                  $a$  v_cell := coalesce(private.granted_crown_cell(v_uid), private.quick_buy_cell(v_uid, coalesce(p_hot, false), v_min));$a$);
  if n = d then raise exception 'unique crowns: quick_buy_plot anchor not found'; end if;
  execute n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.crown_kingdom_free(text, integer, integer)', 'private.nearest_free_kingdom(text, integer, integer, integer, integer)',
                           'private.granted_crown_cell(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---- repair Crowns that landed outside a kingdom or in a held one ------------------------------------------------------
do $$
declare p record; c public.world_cities; v_bad boolean;
begin
  for p in select w.gx, w.gy, w.rarity, w.city_id, w.owner_id, w.claimed_at from public.world_plots w
            where w.rarity in ('crown', 'crown_state', 'crown_country') and w.owner_id is not null order by w.claimed_at, w.gx, w.gy loop
    select k.* into c from public.world_cities k where k.id = p.city_id;
    v_bad := c.id is null or (p.rarity = 'crown_state' and c.state is null);
    if not v_bad then
      -- held by someone who got it first?
      v_bad := exists (
        select 1 from public.world_plots o join public.world_cities k on k.id = o.city_id
         where o.rarity = p.rarity and o.owner_id is not null and (o.gx, o.gy) <> (p.gx, p.gy)
           and (o.claimed_at, o.gx, o.gy) < (p.claimed_at, p.gx, p.gy)
           and case p.rarity when 'crown' then k.id = c.id
                             when 'crown_state' then k.country = c.country and k.state = c.state
                             else k.country = c.country end);
    end if;
    continue when not v_bad;
    c := private.nearest_free_kingdom(p.rarity, p.gx, p.gy, p.gx, p.gy);
    if c.id is null then
      update public.world_plots set rarity = 'mythic', updated_at = now() where gx = p.gx and gy = p.gy;
      perform private.audit('crowns.repaired', 'player', p.owner_id::text, jsonb_build_object('gx', p.gx, 'gy', p.gy, 'tier', p.rarity, 'to', 'mythic'));
    else
      update public.world_plots set city_id = c.id, updated_at = now() where gx = p.gx and gy = p.gy;
      perform private.audit('crowns.repaired', 'player', p.owner_id::text, jsonb_build_object('gx', p.gx, 'gy', p.gy, 'tier', p.rarity, 'from_city', p.city_id, 'to_city', c.id));
    end if;
  end loop;
end $$;

-- the Crowns granted this past week never got their feed posts: post them now
insert into public.feed_events (kind, player_id, data)
select 'crown', g.player_id, jsonb_build_object('tier', w.rarity, 'place', case w.rarity when 'crown' then k.name when 'crown_state' then k.state else k.country_name end, 'country', k.country)
  from private.granted_rolls g
  join public.world_plots w on w.gx = g.used_gx and w.gy = g.used_gy and w.owner_id = g.player_id and w.rarity = g.rarity
  join public.world_cities k on k.id = w.city_id
 where g.used_at > now() - interval '7 days' and g.rarity like 'crown%'
   and not exists (select 1 from public.feed_events f where f.kind = 'crown' and f.player_id = g.player_id and f.created_at >= g.used_at - interval '1 minute'
                     and f.data ->> 'tier' = w.rarity);
