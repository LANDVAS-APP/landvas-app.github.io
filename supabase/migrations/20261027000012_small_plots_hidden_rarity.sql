-- LANDVAS v0.4: house-sized plots and hidden rarity.
--   * The grid moves from Web Mercator zoom 16 (~460-610 m plots) to zoom 22:
--     about 9.5 m at the equator and ~7 m at 40°N — roughly the 30 ft parcels
--     players know from Atlas Earth, so a house is covered by 6-8 plots.
--     gx = floor((lng + 180) / 360 * 2^22), gy likewise (4,194,304 cells a side).
--   * Art tiles: 256 px per plot at zoom 22, pyramid down to zoom 14.
--   * Claim reach is 6 plots (~40-55 m) so GPS jitter doesn't matter.
--   * Rarity of unclaimed plots is secret: it comes from a server-side salt
--     (never shipped to clients), is not returned for unowned plots, and does
--     not affect the price. Claiming reveals it.
-- What happens to plots claimed on the old grid is handled in the next migration.

-- ---- constraints -------------------------------------------------------------
alter table public.world_plots drop constraint if exists world_plots_gx_check;
alter table public.world_plots drop constraint if exists world_plots_gy_check;
alter table public.world_plots add constraint world_plots_gx_check check (gx between 0 and 4194303);
alter table public.world_plots add constraint world_plots_gy_check check (gy between 0 and 4194303);
alter table public.art_tiles drop constraint if exists art_tiles_z_check;
alter table public.art_tiles add constraint art_tiles_z_check check (z between 0 and 22);

-- ---- grid helpers (mirror src/shared/grid.ts) ------------------------------------
create or replace function private.lng_of(p_ugx double precision) returns double precision
language sql immutable as $$
  select (((p_ugx / 4194304.0 * 360.0 - 180.0) + 540.0)::numeric % 360.0 - 180.0)::double precision
$$;

create or replace function private.lat_of(p_gy double precision) returns double precision
language sql immutable as $$ select degrees(atan(sinh(pi() * (1 - 2 * p_gy / 4194304.0)))) $$;

create or replace function private.cells_adjacent(a_gx int, a_gy int, b_gx int, b_gy int) returns boolean
language sql immutable parallel safe as $$
  select (a_gy = b_gy and (abs(a_gx - b_gx) = 1 or abs(a_gx - b_gx) = 4194303))
      or (a_gx = b_gx and abs(a_gy - b_gy) = 1)
$$;

create or replace function private.neighbors(p_gx int, p_gy int)
returns table (gx int, gy int, dir text)
language sql immutable as $$
  select (p_gx + 1) % 4194304, p_gy, 'e'
  union all select (p_gx + 4194303) % 4194304, p_gy, 'w'
  union all select p_gx, p_gy - 1, 'n' where p_gy > 0
  union all select p_gx, p_gy + 1, 's' where p_gy < 4194303
$$;

create or replace function private.cells_unwrap(p_cells jsonb) returns jsonb
language plpgsql immutable as $$
declare v_min int; v_max int; v_wrap boolean;
begin
  select min((c ->> 0)::int), max((c ->> 0)::int) into v_min, v_max from jsonb_array_elements(p_cells) c;
  v_wrap := (v_max - v_min) > 2097152;
  return (
    select jsonb_build_object(
      'cells', jsonb_agg(jsonb_build_array(u.ugx, u.gy) order by u.gy, u.ugx),
      'min_gx', min(u.ugx), 'max_gx', max(u.ugx), 'min_gy', min(u.gy), 'max_gy', max(u.gy),
      'wrapped', v_wrap)
    from (
      select case when v_wrap and (c ->> 0)::int > 2097151 then (c ->> 0)::int - 4194304 else (c ->> 0)::int end as ugx,
             (c ->> 1)::int as gy
      from jsonb_array_elements(p_cells) c
    ) u
  );
end $$;

create or replace function private.lng_to_gx(p_lng float8) returns int
language sql immutable parallel safe as $$
  select least(4194303, greatest(0, floor((p_lng + 180) / 360 * 4194304)))::int
$$;

create or replace function private.lat_to_gy(p_lat float8) returns int
language sql immutable parallel safe as $$
  select least(4194303, greatest(0, floor((1 - ln(tan(radians(p_lat)) + 1 / cos(radians(p_lat))) / pi()) / 2 * 4194304)))::int
$$;

create or replace function private.cell_distance(a_gx int, a_gy int, b_gx int, b_gy int) returns int
language sql immutable parallel safe as $$
  select greatest(least(abs(a_gx - b_gx), 4194304 - abs(a_gx - b_gx)), abs(a_gy - b_gy))
$$;

-- ---- secret rarity ----------------------------------------------------------------
create table if not exists private.secrets (key text primary key, value bigint not null);
revoke all on table private.secrets from public;
insert into private.secrets (key, value)
values ('rarity_salt_a', 1000 + floor(random() * 900000000)::bigint), ('rarity_salt_b', 1000 + floor(random() * 900000000)::bigint)
on conflict (key) do nothing;

create or replace function private.plot_rarity_for(p_gx int, p_gy int) returns text
language plpgsql stable as $$
declare
  v_total int; v_roll bigint; v_acc int := 0; r record;
  v_a bigint := coalesce((select value from private.secrets where key = 'rarity_salt_a'), 40503);
  v_b bigint := coalesce((select value from private.secrets where key = 'rarity_salt_b'), 977);
begin
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return 'common'; end if;
  v_roll := private.mix(p_gx + v_a, p_gy * 3 + v_b) % v_total;
  for r in select id, weight from public.plot_rarities where weight > 0 order by sort, id loop
    v_acc := v_acc + r.weight;
    if v_roll < v_acc then return r.id; end if;
  end loop;
  return 'common';
end $$;

-- the price never depends on (or reveals) the hidden rarity
create or replace function private.acquire_cost(p_uid uuid, p_gx int, p_gy int) returns jsonb
language plpgsql stable as $$
declare
  v_cfg jsonb := private.cfg('economy') -> 'acquire';
  v_owned int; v_type text; v_tm numeric; v_cost numeric;
begin
  select count(*) into v_owned from public.world_plots where owner_id = p_uid;
  select plot_type into v_type from public.world_plots where gx = p_gx and gy = p_gy;
  v_type := coalesce(v_type, private.plot_type_for(p_gx, p_gy));
  select acquire_multiplier into v_tm from public.plot_types where id = v_type;
  v_cost := coalesce((v_cfg ->> 'base_ink')::numeric, 100)
            * power(coalesce((v_cfg ->> 'growth')::numeric, 1), greatest(v_owned - 1, 0))
            * coalesce(v_tm, 1);
  v_cost := least(round(v_cost), coalesce((v_cfg ->> 'max_ink')::numeric, 1000000));
  return jsonb_build_object('ink', v_cost::bigint, 'owned', v_owned, 'plot_type', v_type);
end $$;

-- ---- density pyramid for zoomed-out views ------------------------------------------
create or replace function private.density_bump(p_gx int, p_gy int, p_delta int) returns void
language plpgsql as $$
declare v_z int;
begin
  foreach v_z in array array[5, 7, 9, 11, 13, 15, 17] loop
    insert into public.world_density (z, x, y, owned)
    values (v_z, p_gx >> (22 - v_z), p_gy >> (22 - v_z), greatest(p_delta, 0))
    on conflict (z, x, y) do update set owned = greatest(public.world_density.owned + p_delta, 0);
  end loop;
end $$;

-- ---- claiming ------------------------------------------------------------------------
create or replace function private.take_plot(p_uid uuid, p_gx int, p_gy int, p_method text, p_cost jsonb)
returns jsonb
language plpgsql as $$
declare v_type text; v_rarity text; v_group uuid;
begin
  if p_gx is null or p_gy is null or p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  v_type := private.plot_type_for(p_gx, p_gy);
  v_rarity := private.plot_rarity_for(p_gx, p_gy);
  insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at)
  values (p_gx, p_gy, v_type, v_rarity, p_uid, now())
  on conflict (gx, gy) do nothing;
  if not found then
    update public.world_plots
       set owner_id = p_uid, claimed_at = now(), level = 1,
           art_publication_id = null, art_rev = null, updated_at = now()
     where gx = p_gx and gy = p_gy and owner_id is null and not locked
    returning plot_type, rarity into v_type, v_rarity;
    if not found then
      raise exception 'plot_unavailable' using errcode = 'P0001';
    end if;
  end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)
  values (p_gx, p_gy, p_uid, p_method, coalesce(p_cost, '{}'::jsonb));
  v_group := private.create_group_with_cells(p_uid, jsonb_build_array(jsonb_build_array(p_gx, p_gy)),
                                             private.empty_manifest(), null, 'initial');
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  return jsonb_build_object('gx', p_gx, 'gy', p_gy, 'plot_type', v_type, 'rarity', v_rarity, 'group_id', v_group,
                            'usd_per_second', private.plot_rent_rate(v_rarity, 1),
                            'rarity_info', (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity));
end $$;

-- ---- public reads ----------------------------------------------------------------------
create or replace function public.world_config() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'grid', jsonb_build_object('level', 22, 'size', 4194304, 'plot_px', 256, 'art_min_zoom', 14, 'art_max_zoom', 22),
    'plot_types', (select jsonb_agg(to_jsonb(t) order by t.sort, t.id) from public.plot_types t),
    'rarities', (select jsonb_agg(to_jsonb(r) order by r.sort, r.id) from public.plot_rarities r),
    'economy', private.cfg('economy'),
    'rent', private.cfg('rent'),
    'explorer', private.cfg('explorer'),
    'limits', private.cfg('limits'),
    'shop', private.cfg('shop'),
    'legal', private.cfg('legal'),
    'minigames', private.cfg('minigames'),
    'flags', (select coalesce(jsonb_object_agg(key, jsonb_build_object('enabled', enabled, 'config', config)), '{}'::jsonb)
              from public.feature_flags where is_public),
    'server_time', now())
$$;

-- rows: [gx, gy, type, level, is_mine, group_id, has_art, username, accent, rarity, name] (owned plots only)
create or replace function public.plots_in_bbox(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if p_max_gx < p_min_gx or p_max_gy < p_min_gy or p_max_gx - p_min_gx > 1024 or p_max_gy - p_min_gy > 1024 then
    raise exception 'bbox_too_large' using errcode = 'P0001';
  end if;
  p_min_gy := greatest(p_min_gy, 0);
  p_max_gy := least(p_max_gy, 4194303);
  with ranges as (
    select greatest(p_min_gx, 0) as x0, least(p_max_gx, 4194303) as x1 where p_max_gx >= 0 and p_min_gx <= 4194303
    union all select p_min_gx + 4194304, 4194303 where p_min_gx < 0
    union all select 0, p_max_gx - 4194304 where p_max_gx > 4194303
  ), blocks as (
    select distinct by_, bx_
    from ranges r, generate_series(r.x0 >> 6, r.x1 >> 6) bx_, generate_series(p_min_gy >> 6, p_max_gy >> 6) by_
  )
  select coalesce(jsonb_agg(jsonb_build_array(p.gx, p.gy, p.plot_type, p.level, p.owner_id = v_uid, m.group_id,
                                               p.art_rev is not null, pr.username, pr.accent_color, p.rarity, p.name)), '[]'::jsonb)
    into v_res
  from blocks b
  join public.world_plots p on p.by = b.by_ and p.bx = b.bx_
  left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
  left join public.profiles pr on pr.id = p.owner_id
  where p.owner_id is not null
    and p.gy between p_min_gy and p_max_gy
    and exists (select 1 from ranges r where p.gx between r.x0 and r.x1);
  return v_res;
end $$;

-- Everything the plot panel needs. Unclaimed plots show their type only:
-- rarity and rent are revealed when the plot is claimed.
create or replace function public.plot_details(p_gx int, p_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_plot public.world_plots%rowtype;
  v_type text;
  v_rarity text;
  v_group uuid;
  v_res jsonb;
  v_is_mine boolean := false;
  v_starter boolean := false;
  v_owned boolean;
  v_ex record;
  v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 6);
  v_level int;
begin
  if p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  select * into v_plot from public.world_plots where gx = p_gx and gy = p_gy;
  v_owned := v_plot.owner_id is not null;
  v_type := coalesce(v_plot.plot_type, private.plot_type_for(p_gx, p_gy));
  v_rarity := case when v_owned then v_plot.rarity end;
  v_level := coalesce(v_plot.level, 1);
  v_is_mine := v_uid is not null and v_plot.owner_id = v_uid;
  if v_uid is not null then
    select not starter_plot_claimed into v_starter from public.players where id = v_uid;
  end if;
  select group_id into v_group from public.canvas_group_members where gx = p_gx and gy = p_gy;

  v_res := jsonb_build_object(
    'gx', p_gx, 'gy', p_gy,
    'center', jsonb_build_object('lng', private.lng_of(p_gx + 0.5), 'lat', private.lat_of(p_gy + 0.5)),
    'name', case when v_owned then v_plot.name end,
    'plot_type', v_type,
    'type_info', (select to_jsonb(t) from public.plot_types t where t.id = v_type),
    'rarity', v_rarity,
    'rarity_info', case when v_owned then (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity) end,
    'rarity_hidden', not v_owned,
    'rent', case when v_owned then jsonb_build_object(
      'usd_per_second', private.plot_rent_rate(v_rarity, v_level),
      'boost_multiplier', coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20)) end,
    'owned', v_owned,
    'is_mine', v_is_mine,
    'owner', case when v_owned then private.profile_json(v_plot.owner_id) end,
    'level', v_level,
    'claimed_at', v_plot.claimed_at,
    'locked', coalesce(v_plot.locked, false),
    'art', (select jsonb_build_object('publication_id', a.id, 'title', a.title, 'published_at', a.published_at,
                                      'plot_count', a.plot_count, 'artist', private.profile_json(a.owner_id),
                                      'appreciation_count', a.appreciation_count)
            from public.artwork_publications a where a.id = v_plot.art_publication_id),
    'neighbors', (
      select jsonb_agg(jsonb_build_object(
        'gx', n.gx, 'gy', n.gy, 'dir', n.dir,
        'plot_type', coalesce(w.plot_type, private.plot_type_for(n.gx, n.gy)),
        'rarity', case when w.owner_id is not null then w.rarity end,
        'owned', w.owner_id is not null,
        'is_mine', v_uid is not null and w.owner_id = v_uid,
        'owner_username', (select username from public.profiles where id = w.owner_id),
        'group_id', m.group_id,
        'same_group', v_group is not null and m.group_id = v_group) order by n.dir)
      from private.neighbors(p_gx, p_gy) n
      left join public.world_plots w on w.gx = n.gx and w.gy = n.gy
      left join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy)
  );

  -- reach from the viewer's own explorer (never reveals anyone else's position)
  if v_uid is not null then
    select * into v_ex from private.explorer_now(v_uid);
    if found then
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', true, 'distance', private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy), 'max', v_reach,
        'in_reach', not private.flag('location_gated_claims') or private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy) <= v_reach));
    else
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', false, 'distance', null, 'max', v_reach, 'in_reach', not private.flag('location_gated_claims')));
    end if;
  end if;

  if v_is_mine then
    v_res := v_res || jsonb_build_object(
      'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'plot_count', g.plot_count, 'project_id', g.project_id,
                                          'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy)
                from public.canvas_groups g where g.id = v_group),
      'connections', (
        select coalesce(jsonb_agg(distinct jsonb_build_object('group_id', g.id, 'name', g.name, 'plot_count', g.plot_count)), '[]'::jsonb)
        from public.canvas_group_members me
        join private.neighbors(me.gx, me.gy) n on true
        join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy and m.group_id <> v_group
        join public.canvas_groups g on g.id = m.group_id and g.owner_id = v_uid and g.status = 'active'
        where me.group_id = v_group));
  elsif not v_owned then
    v_res := v_res || jsonb_build_object(
      'acquire', case when v_uid is not null and exists (select 1 from public.players where id = v_uid)
                      then private.acquire_cost(v_uid, p_gx, p_gy) || jsonb_build_object('starter_available', coalesce(v_starter, false))
                      else jsonb_build_object('starter_available', true) end,
      'available', not coalesce(v_plot.locked, false));
  end if;
  return v_res;
end $$;

-- admins see the explorer only to within ~2.4 km (2^8 plots) — never a precise position
create or replace function public.admin_player_detail(p_player_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']); e public.explorers%rowtype;
begin
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = p_player_id;
  return jsonb_build_object(
    'player', (select to_jsonb(p) from public.players p where p.id = p_player_id),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_player_id),
    'email', (select email from auth.users where id = p_player_id),
    'balances', private.balances(p_player_id),
    'rent', private.rent_json(p_player_id),
    'explorer', (select jsonb_build_object('mode', x.mode, 'gx', x.gx >> 8 << 8, 'gy', x.gy >> 8 << 8, 'traveling', x.traveling)
                 from private.explorer_now(p_player_id) x),
    'joystick', case when e.player_id is not null then private.joystick_json(e) end,
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = p_player_id),
    'plots', (select count(*) from public.world_plots where owner_id = p_player_id),
    'groups', (select count(*) from public.canvas_groups where owner_id = p_player_id and status = 'active'),
    'ledger', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc), '[]'::jsonb) from (
                 select * from public.resource_ledger where player_id = p_player_id order by id desc limit 40) l),
    'publications', (select coalesce(jsonb_agg(private.publication_json(a) order by a.created_at desc), '[]'::jsonb)
                     from public.artwork_publications a where a.owner_id = p_player_id and a.status <> 'cancelled'),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) - 'seed' order by s.started_at desc), '[]'::jsonb) from (
                   select * from public.minigame_sessions where player_id = p_player_id order by started_at desc limit 30) s),
    'security_events', (select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'details', s.details, 'created_at', s.created_at)
                                                   order by s.id desc), '[]'::jsonb) from (
                          select * from private.security_events where player_id = p_player_id order by id desc limit 30) s),
    'cases', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.moderation_cases c
              where c.subject_player_id = p_player_id or c.reporter_id = p_player_id));
end $$;

-- claim reach now counts small plots: 6 plots ≈ 40-55 m
update public.game_config set value = jsonb_set(value, '{claim_reach}', '6'::jsonb)
 where key = 'explorer' and coalesce((value ->> 'claim_reach')::int, 1) < 6;

