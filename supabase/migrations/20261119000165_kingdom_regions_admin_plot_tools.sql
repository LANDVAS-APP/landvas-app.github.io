-- Kingdoms count everyone who lives there, and the owner can swap a player's plots.
--  * A plot belongs to a state and country even outside a city's circle: its region is the city it's in, or else the
--    nearest city (within ~500 km). State and Country Crowns now count every other landholder in their whole state or
--    country — e.g. players in Provo or Ogden count for a Utah State Crown, not only those inside Salt Lake City. City
--    Crowns still count only the city itself.
--  * Owner tools on a player: list their plots, take one away (a Crown frees its kingdom; the spot goes back to a plain
--    roll), change a plot's rarity / shine in place, or give them a plot of any rarity (Crowns go to the nearest free
--    kingdom) — for prizes or to make up for a problem. Everything is in the audit log; Crown changes stay one per
--    kingdom.

alter table public.world_plots add column if not exists region_city_id int;
create index if not exists world_plots_region on public.world_plots (region_city_id) where owner_id is not null;

/** the city a cell is in, or else the nearest city within ~500 km (60,000 cells) — its state and country are the cell's */
create or replace function private.region_city_at(p_gx int, p_gy int) returns int language sql stable as $$
  select coalesce((private.city_at(p_gx, p_gy) ->> 'id')::int, (
    select c.id from public.world_cities c
     where c.gx between p_gx - 60000 and p_gx + 60000 and c.gy between p_gy - 60000 and p_gy + 60000
     order by (c.gx - p_gx)::numeric ^ 2 + (c.gy - p_gy)::numeric ^ 2, c.id limit 1))
$$;

create or replace function private.set_plot_city() returns trigger language plpgsql as $$
begin
  if new.city_id is null then new.city_id := (private.city_at(new.gx, new.gy) ->> 'id')::int; end if;
  if new.owner_id is not null and new.region_city_id is null then new.region_city_id := coalesce(new.city_id, private.region_city_at(new.gx, new.gy)); end if;
  return new;
end $$;

-- backfill every owned plot: plots inside a city take that city; the rest are looked up once per 512-cell block
update public.world_plots set region_city_id = city_id where owner_id is not null and region_city_id is null and city_id is not null;
with b as (select distinct gx / 512 bx, gy / 512 by from public.world_plots where owner_id is not null and region_city_id is null),
     r as (select bx, by, private.region_city_at(bx * 512 + 256, by * 512 + 256) rc from b)
update public.world_plots p set region_city_id = r.rc from r
 where p.owner_id is not null and p.region_city_id is null and p.gx / 512 = r.bx and p.gy / 512 = r.by and r.rc is not null;

/** other players with land in this Crown's kingdom: the city (City Crown), or the whole state / country */
create or replace function private.kingdom_rivals(p_tier text, p_city int, p_holder uuid) returns int language sql stable as $$
  select case p_tier
    when 'crown' then (select count(distinct p.owner_id)::int from public.world_plots p
                        where p.city_id = p_city and p.owner_id is not null and p.owner_id <> p_holder)
    when 'crown_state' then (select count(distinct p.owner_id)::int from public.world_cities k
                              join public.world_cities c on c.country = k.country and c.state = k.state
                              join public.world_plots p on p.region_city_id = c.id
                             where k.id = p_city and k.state is not null and p.owner_id is not null and p.owner_id <> p_holder)
    else (select count(distinct p.owner_id)::int from public.world_cities k
            join public.world_cities c on c.country = k.country
            join public.world_plots p on p.region_city_id = c.id
           where k.id = p_city and p.owner_id is not null and p.owner_id <> p_holder)
  end
$$;

-- ---- a free cell inside the nearest free kingdom of a tier ------------------------------------------------------------
create or replace function private.free_kingdom_cell(p_tier text, p_ax int, p_ay int) returns int[] language plpgsql as $$
declare c public.world_cities; v_x int; v_y int; v_c jsonb; i int; v_r int;
begin
  c := private.nearest_free_kingdom(p_tier, p_ax, p_ay);
  if c.id is null then return null; end if;
  v_r := greatest((c.radius * 0.5)::int, 1);
  for i in 1 .. 200 loop
    v_x := c.gx + floor((random() * 2 - 1) * v_r)::int; v_y := c.gy + floor((random() * 2 - 1) * v_r)::int;
    continue when v_x not between 0 and 4194303 or v_y not between 0 and 4194303;
    continue when exists (select 1 from public.world_plots where gx = v_x and gy = v_y and (owner_id is not null or locked));
    v_c := private.city_at(v_x, v_y);
    continue when v_c is null;
    continue when p_tier = 'crown' and (v_c ->> 'id')::int <> c.id;
    continue when p_tier = 'crown_state' and ((v_c ->> 'country') is distinct from c.country or (v_c ->> 'state') is distinct from c.state);
    continue when p_tier = 'crown_country' and (v_c ->> 'country') is distinct from c.country;
    return array[v_x, v_y];
  end loop;
  return null;
end $$;

/** where a player "lives": their explorer, else their newest plot, else the quick-roll start */
create or replace function private.player_anchor(p_uid uuid) returns int[] language plpgsql as $$
declare v_ax int; v_ay int; v_c jsonb;
begin
  select gx, gy into v_ax, v_ay from public.world_plots where owner_id = p_uid order by claimed_at desc limit 1;
  if v_ax is null then
    v_c := (coalesce(private.cfg('quick_buy'), '{}'::jsonb) -> 'cities') -> 0;
    v_ax := coalesce((v_c ->> 0)::int, 793527); v_ay := coalesce((v_c ->> 1)::int, 1576239);
  end if;
  return array[v_ax, v_ay];
end $$;

create or replace function private.granted_crown_cell(p_uid uuid) returns int[] language plpgsql as $$
declare g private.granted_rolls; a int[];
begin
  select * into g from private.granted_rolls where player_id = p_uid and mode = 'claim' and used_at is null and cancelled_at is null
     and at_roll <= private.roll_count(p_uid) + 1 order by at_roll, id limit 1;
  if g.id is null or g.rarity not like 'crown%' then return null; end if;
  a := private.player_anchor(p_uid);
  return private.free_kingdom_cell(g.rarity, a[1], a[2]);
end $$;

/** the Crown post for a plot (feed) */
create or replace function private.post_crown(p_uid uuid, p_gx int, p_gy int) returns void language sql as $$
  insert into public.feed_events (kind, player_id, data)
  select 'crown', p_uid, jsonb_build_object('tier', p.rarity, 'place', case p.rarity when 'crown' then k.name when 'crown_state' then k.state else k.country_name end, 'country', k.country)
    from public.world_plots p join public.world_cities k on k.id = p.city_id
   where p.gx = p_gx and p.gy = p_gy and p.rarity like 'crown%'
$$;

-- ---- owner tools -----------------------------------------------------------------------------------------------------
create or replace function public.admin_player_plots(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']);
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(x.j order by x.rk desc, x.claimed_at desc), '[]'::jsonb) from (
    select private.plot_rarity_rank(p.rarity) rk, p.claimed_at,
           jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'shiny', p.shiny, 'plot_type', p.plot_type, 'claimed_at', p.claimed_at,
             'kingdom', case when p.rarity like 'crown%' then (select case p.rarity when 'crown' then k.name when 'crown_state' then k.state else k.country_name end
                                                               from public.world_cities k where k.id = p.city_id) end,
             'place', (select concat_ws(', ', case when p.city_id = k.id then k.name end, k.state, coalesce(k.country_name, k.country)) from public.world_cities k where k.id = coalesce(p.city_id, p.region_city_id)),
             'merged', (select g.plot_count > 1 from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id where m.gx = p.gx and m.gy = p.gy)) j
      from public.world_plots p where p.owner_id = p_player
     order by private.plot_rarity_rank(p.rarity) desc, p.claimed_at desc limit 300) x);
end $$;

/** take a plot away from its owner (a Crown frees its kingdom; the spot goes back to a plain roll) */
create or replace function public.admin_take_plot(p_gx int, p_gy int, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); p public.world_plots; v_r text;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  if p.owner_id is null then raise exception 'not_owned' using errcode = 'P0001'; end if;
  perform public.admin_release_plot(p_gx, p_gy, p_reason);
  v_r := private.plot_rarity_for(p_gx, p_gy);
  if v_r like 'crown%' then v_r := 'common'; end if;
  update public.world_plots set rarity = v_r, shiny = false, updated_at = now() where gx = p_gx and gy = p_gy and owner_id is null;
  delete from public.luck_choices where gx = p_gx and gy = p_gy;
  perform private.audit('plot.taken', 'player', p.owner_id::text, jsonb_build_object('gx', p_gx, 'gy', p_gy, 'rarity', p.rarity, 'shiny', p.shiny, 'reason', p_reason));
  return public.admin_player_plots(p.owner_id);
end $$;

/** change an owned plot's rarity / shine in place (a Crown only where its kingdom is free) */
create or replace function public.admin_set_plot_rarity(p_gx int, p_gy int, p_rarity text, p_shiny boolean, p_reason text, p_post boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); p public.world_plots;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_rarities where id = p_rarity) then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
  select * into p from public.world_plots where gx = p_gx and gy = p_gy for update;
  if p.owner_id is null then raise exception 'not_owned' using errcode = 'P0001'; end if;
  if p_rarity like 'crown%' and p_rarity is distinct from p.rarity and not private.crown_kingdom_free(p_rarity, p_gx, p_gy) then
    raise exception 'crown_taken' using errcode = 'P0001';
  end if;
  perform private.rent_settle(p.owner_id);
  update public.world_plots set rarity = p_rarity, shiny = coalesce(p_shiny, shiny), updated_at = now() where gx = p_gx and gy = p_gy;
  delete from public.luck_choices where gx = p_gx and gy = p_gy and picked is null;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  if coalesce(p_post, true) and p_rarity like 'crown%' and p_rarity is distinct from p.rarity then perform private.post_crown(p.owner_id, p_gx, p_gy); end if;
  perform private.audit('plot.rarity_set', 'player', p.owner_id::text, jsonb_build_object('gx', p_gx, 'gy', p_gy, 'from', p.rarity, 'to', p_rarity, 'shiny', p_shiny, 'reason', p_reason));
  return public.admin_player_plots(p.owner_id);
end $$;

/** give a player a new plot of a chosen rarity near where they play (a Crown: in the nearest free kingdom) */
create or replace function public.admin_give_plot(p_player uuid, p_rarity text, p_shiny boolean default false, p_plot_type text default null,
  p_reason text default null, p_post boolean default true, p_near_gx int default null, p_near_gy int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); a int[]; v_cell int[]; v_res jsonb; i int;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_rarities where id = p_rarity) then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
  if p_plot_type is not null and not exists (select 1 from public.plot_types where id = p_plot_type) then raise exception 'invalid_plot_type' using errcode = 'P0001'; end if;
  a := case when p_near_gx is not null and p_near_gy is not null then array[p_near_gx, p_near_gy] else private.player_anchor(p_player) end;
  if p_rarity like 'crown%' then
    v_cell := private.free_kingdom_cell(p_rarity, a[1], a[2]);
    if v_cell is null or not private.crown_kingdom_free(p_rarity, v_cell[1], v_cell[2]) then raise exception 'crown_taken' using errcode = 'P0001'; end if;
  else
    for i in 1 .. 400 loop  -- a free spot near there
      v_cell := array[(a[1] + floor((random() * 2 - 1) * least(20 + i * 5, 2000))::int + 4194304) % 4194304,
                      least(greatest(a[2] + floor((random() * 2 - 1) * least(20 + i * 5, 2000))::int, 0), 4194303)];
      exit when not exists (select 1 from public.world_plots where gx = v_cell[1] and gy = v_cell[2] and (owner_id is not null or locked));
      v_cell := null;
    end loop;
    if v_cell is null then raise exception 'no_free_plot' using errcode = 'P0001'; end if;
  end if;
  perform private.rent_settle(p_player);
  v_res := private.take_plot(p_player, v_cell[1], v_cell[2], 'admin_grant', jsonb_build_object('reason', left(p_reason, 300)));
  update public.world_plots set rarity = p_rarity, shiny = coalesce(p_shiny, false), plot_type = coalesce(p_plot_type, plot_type), updated_at = now()
   where gx = v_cell[1] and gy = v_cell[2];
  if coalesce(p_post, true) then
    insert into public.feed_events (kind, player_id, data)
    select 'claim', p_player, jsonb_build_object('rarity', p.rarity, 'plot_type', p.plot_type, 'starter', false, 'shiny', p.shiny)
      from public.world_plots p where p.gx = v_cell[1] and p.gy = v_cell[2];
    perform private.post_crown(p_player, v_cell[1], v_cell[2]);
  end if;
  perform private.audit('plot.given', 'player', p_player::text, jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2], 'rarity', p_rarity, 'shiny', p_shiny, 'plot_type', p_plot_type, 'reason', p_reason));
  return jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2], 'rarity', p_rarity, 'plots', public.admin_player_plots(p_player));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_player_plots(uuid)', 'public.admin_take_plot(integer, integer, text)',
                           'public.admin_set_plot_rarity(integer, integer, text, boolean, text, boolean)',
                           'public.admin_give_plot(uuid, text, boolean, text, text, boolean, integer, integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.region_city_at(integer, integer)', 'private.free_kingdom_cell(text, integer, integer)', 'private.player_anchor(uuid)',
                           'private.post_crown(uuid, integer, integer)', 'private.granted_crown_cell(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
