-- v0.34 Huge worlds: plots the size of Earth's (8 m across at the equator), so every world has
-- millions of them, more the bigger it is. Each world's grid has N rows of latitude (between ±72°)
-- and 2.5N columns, so plots are square at the equator; the globe's radius follows from N.
-- Existing plots (and their game rounds) move to the matching spot on the bigger grid. A world's
-- plots are now fetched by area (the bit of the globe around you), and from afar as sector counts.

-- the old grid (size rows, 2 x size columns), for moving plots across
create temporary table _old_grid as
  select k world, (v ->> 'size')::int rows_, 2 * (v ->> 'size')::int cols_ from jsonb_each((select value -> 'worlds' from public.game_config where key = 'planets')) w(k, v);

update public.game_config set value = value || jsonb_build_object('plot_m', 8, 'lat_max', 72, 'worlds', (value -> 'worlds')
  || jsonb_build_object(
    'moon',    (value -> 'worlds' -> 'moon')    || '{"size": 1000}',
    'mercury', (value -> 'worlds' -> 'mercury') || '{"size": 900}',
    'venus',   (value -> 'worlds' -> 'venus')   || '{"size": 1400}',
    'mars',    (value -> 'worlds' -> 'mars')    || '{"size": 1100}',
    'jupiter', (value -> 'worlds' -> 'jupiter') || '{"size": 3000}',
    'saturn',  (value -> 'worlds' -> 'saturn')  || '{"size": 2600}',
    'uranus',  (value -> 'worlds' -> 'uranus')  || '{"size": 1800}',
    'neptune', (value -> 'worlds' -> 'neptune') || '{"size": 1800}',
    'pluto',   (value -> 'worlds' -> 'pluto')   || '{"size": 700}',
    'exo',     (value -> 'worlds' -> 'exo')     || '{"size": 900}'))
 where key = 'planets';

create or replace function private.planet_rows(p_world text) returns int language sql stable as $$
  select coalesce((private.planet_cfg() -> 'worlds' -> private.planet_key(p_world) ->> 'size')::int, 1000)
$$;
create or replace function private.planet_cols(p_world text) returns int language sql stable as $$
  select round(private.planet_rows(p_world) * 360.0 / (2 * coalesce((private.planet_cfg() ->> 'lat_max')::numeric, 72)))::int
$$;
/** Globe radius in metres: N rows of plot_m metres span 2 x lat_max degrees. */
create or replace function private.planet_radius(p_world text) returns float8 language sql stable as $$
  select private.planet_rows(p_world) * coalesce((private.planet_cfg() ->> 'plot_m')::float8, 8) * 180.0
         / (2 * coalesce((private.planet_cfg() ->> 'lat_max')::float8, 72) * pi())
$$;

-- move existing plots and game rounds to the same spot on the bigger grid
update public.planet_plots p set gx = floor((p.gx + 0.5) * private.planet_cols(p.world)::numeric / o.cols_)::int,
                                 gy = floor((p.gy + 0.5) * private.planet_rows(p.world)::numeric / o.rows_)::int
  from _old_grid o where o.world = private.planet_key(p.world);
update public.planet_games p set gx = floor((p.gx + 0.5) * private.planet_cols(p.world)::numeric / o.cols_)::int,
                                 gy = floor((p.gy + 0.5) * private.planet_rows(p.world)::numeric / o.rows_)::int
  from _old_grid o where o.world = private.planet_key(p.world);
drop table _old_grid;

create index if not exists planet_plots_area_idx on public.planet_plots (world, gy, gx);

create or replace function private.planet_plot_json(p public.planet_plots, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'name', p.name, 'mine', p.owner_id = p_viewer, 'rarity', p.rarity,
    'owner', (select jsonb_build_object('username', pr.username, 'accent', pr.accent_color) from public.profiles pr where pr.id = p.owner_id))
$$;

/** The claimed plots in an area of the grid (columns wrap round the globe). */
create or replace function public.planet_plots_near(p_world text, p_gx0 int, p_gx1 int, p_gy0 int, p_gy1 int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_cols int := private.planet_cols(p_world);
begin
  if not private.planet_open(v_uid, p_world) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  if p_gy1 - p_gy0 > 400 or p_gx1 - p_gx0 > 400 then raise exception 'area_too_big' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(private.planet_plot_json(p, v_uid)), '[]'::jsonb) from (
    select * from public.planet_plots p
    where p.world = p_world and p.gy between p_gy0 and p_gy1
      and (case when p_gx0 < 0 then p.gx >= p_gx0 + v_cols or p.gx <= p_gx1
                when p_gx1 >= v_cols then p.gx >= p_gx0 or p.gx <= p_gx1 - v_cols
                else p.gx between p_gx0 and p_gx1 end)
    limit 4000) p);
end $$;

/** From afar: how many plots are claimed in each sector (a square of `p_size` x `p_size` plots). */
create or replace function public.planet_sectors(p_world text, p_size int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_s int := greatest(8, coalesce(p_size, 32));
begin
  if not private.planet_open(v_uid, p_world) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_array(sx, sy, n, mine)), '[]'::jsonb) from (
    select p.gx / v_s sx, p.gy / v_s sy, count(*)::int n, bool_or(p.owner_id = v_uid) mine
    from public.planet_plots p where p.world = p_world group by 1, 2 order by 3 desc limit 3000) x);
end $$;

create or replace function public.planet_map(p_world text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); w jsonb; s public.space_pilots%rowtype;
begin
  if not private.planet_open(v_uid, p_world) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  w := private.planet_cfg() -> 'worlds' -> private.planet_key(p_world);
  select * into s from public.space_pilots where player_id = v_uid;
  return jsonb_build_object(
    'world', p_world, 'rows', private.planet_rows(p_world), 'cols', private.planet_cols(p_world), 'radius', private.planet_radius(p_world), 'games', w -> 'games',
    'bonus_game', private.planet_cfg() -> 'bonus' ->> private.planet_key(p_world),
    'rarities', private.planet_cfg() -> 'rarities', 'bonus_from', coalesce((private.planet_cfg() ->> 'bonus_from')::int, 2),
    'luck', coalesce((private.planet_cfg() -> 'luck' ->> private.planet_key(p_world))::numeric, 0),
    'price', private.planet_price(v_uid, p_world),
    'landed', s.player_id is not null and s.location = p_world and s.dest is null,
    'plots', (select coalesce(jsonb_agg(private.planet_plot_json(p, v_uid) order by p.claimed_at), '[]'::jsonb) from public.planet_plots p where p.world = p_world and p.owner_id = v_uid),
    'claimed', (select count(*) from public.planet_plots where world = p_world),
    'pilots', (select coalesce(jsonb_agg(private.profile_json(x.player_id)), '[]'::jsonb) from (
                select player_id from public.space_pilots where location = p_world and dest is null and private.visible_to(player_id, v_uid)
                order by updated_at desc limit 24) x),
    'ink_today', case when s.planet_ink_day is distinct from private.day_start(now()) then 0 else coalesce(s.planet_ink_today, 0) end,
    'daily_cap', coalesce((private.planet_cfg() ->> 'daily_cap')::int, 200));
end $$;

create or replace function public.planet_claim(p_world text, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; v_price int; v_rarity text;
begin
  perform private.rate_limit('planet_claim', 120, 3600);
  if not coalesce((private.planet_cfg() ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if not private.planet_open(v_uid, p_world) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  if p_gx < 0 or p_gy < 0 or p_gx >= private.planet_cols(p_world) or p_gy >= private.planet_rows(p_world) then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('planet:' || p_world || ':' || p_gx || ':' || p_gy));
  if exists (select 1 from public.planet_plots where world = p_world and gx = p_gx and gy = p_gy) then raise exception 'plot_unavailable' using errcode = 'P0001'; end if;
  v_price := private.planet_price(v_uid, p_world);
  perform private.charge(v_uid, jsonb_build_object('ink', v_price), 'planet_plot', 'planet', p_world || ':' || p_gx || ':' || p_gy, 'planet-plot:' || p_world || ':' || p_gx || ':' || p_gy);
  v_rarity := private.roll_cosmic(p_world);
  insert into public.planet_plots (world, gx, gy, owner_id, rarity) values (p_world, p_gx, p_gy, v_uid, v_rarity);
  return public.planet_map(p_world) || jsonb_build_object('claimed', jsonb_build_array(p_gx, p_gy), 'paid', v_price, 'rarity', v_rarity,
    'games_unlocked', private.plot_games(p_world, v_rarity));
end $$;

create or replace function private.meteor_list(p_world text, p_win bigint) returns table (idx int, d float8[], golden boolean)
language plpgsql stable as $$
declare m jsonb := private.planet_cfg() -> 'meteors';
  v_r float8 := private.planet_radius(p_world);  -- globe radius in metres (matches the client)
  sx float8 := cos(radians(4)) * sin(radians(6)); sy float8 := sin(radians(4)); sz float8 := cos(radians(4)) * cos(radians(6));
  e1x float8; e1z float8; l float8; e2x float8; e2y float8; e2z float8;
  i int; dist float8; a float8; th float8; ux float8; uy float8; uz float8; k text;
begin
  l := sqrt(sz * sz + sx * sx); e1x := sz / l; e1z := -sx / l;          -- east  = up x s
  e2x := sy * e1z; e2y := sz * e1x - sx * e1z; e2z := -sy * e1x;        -- north = s x east
  for i in 0 .. coalesce((m ->> 'count')::int, 8) - 1 loop
    k := p_world || ':' || p_win || ':' || i;
    dist := 12 + (coalesce((m ->> 'radius_m')::float8, 160) - 12) * sqrt(private.h01(k || ':r'));
    a := 2 * pi() * private.h01(k || ':a');
    th := dist / v_r;
    ux := sx * cos(th) + (e1x * cos(a) + e2x * sin(a)) * sin(th);
    uy := sy * cos(th) + (e2y * sin(a)) * sin(th);
    uz := sz * cos(th) + (e1z * cos(a) + e2z * sin(a)) * sin(th);
    idx := i; d := array[ux, uy, uz]; golden := private.h01(k || ':g') < coalesce((m ->> 'golden_chance')::float8, 0.12);
    return next;
  end loop;
end $$;

create or replace function public.planet_meteor_grab(p_world text, p_idx int, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m jsonb := private.planet_cfg() -> 'meteors'; s public.space_pilots%rowtype;
  v_every int := coalesce((m ->> 'every_minutes')::int, 10) * 60; v_win bigint := floor(extract(epoch from now()) / v_every);
  v_r float8 := private.planet_radius(p_world);
  met record; v_here float8[]; v_dist float8; v_ink int; v_paid int;
begin
  perform private.rate_limit('planet_meteor', 300, 3600);
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  select * into met from private.meteor_list(p_world, v_win) where idx = p_idx;
  if not found then raise exception 'meteor_gone' using errcode = 'P0001'; end if;
  -- where you are: what you report now if it agrees with your last heartbeat, else the heartbeat
  select d into v_here from public.planet_presence where player_id = v_uid and world = p_world and seen_at > now() - interval '30 seconds';
  if v_here is null then raise exception 'too_far' using errcode = 'P0001'; end if;
  if private.unit3(p_d) is not null and acos(least(1, greatest(-1, v_here[1] * (private.unit3(p_d))[1] + v_here[2] * (private.unit3(p_d))[2] + v_here[3] * (private.unit3(p_d))[3]))) * v_r < 40 then
    v_here := private.unit3(p_d);
  end if;
  v_dist := acos(least(1, greatest(-1, v_here[1] * met.d[1] + v_here[2] * met.d[2] + v_here[3] * met.d[3]))) * v_r;
  if v_dist > coalesce((m ->> 'reach_m')::int, 22) then raise exception 'too_far' using errcode = 'P0001', detail = round(v_dist)::text; end if;
  v_ink := case when met.golden then coalesce((m ->> 'golden_ink')::int, 20)
           else coalesce((m ->> 'ink_min')::int, 3) + floor(private.h01(p_world || ':' || v_win || ':' || p_idx || ':i') * (coalesce((m ->> 'ink_max')::int, 8) - coalesce((m ->> 'ink_min')::int, 3) + 1))::int end;
  insert into public.planet_meteors (world, win, idx, player_id, ink) values (p_world, v_win, p_idx, v_uid, 0) on conflict do nothing;
  if not found then raise exception 'meteor_taken' using errcode = 'P0001'; end if;
  v_paid := private.planet_pay(v_uid, v_ink, p_world || ':' || v_win || ':' || p_idx, 'meteor:' || p_world || ':' || v_win || ':' || p_idx);
  update public.planet_meteors set ink = v_paid where world = p_world and win = v_win and idx = p_idx;
  return jsonb_build_object('paid', v_paid, 'earned', v_ink, 'golden', met.golden, 'capped', v_paid < v_ink, 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.planet_rows(text)', 'private.planet_cols(text)', 'private.planet_radius(text)', 'private.planet_plot_json(public.planet_plots, uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.planet_plots_near(text, int, int, int, int)', 'public.planet_sectors(text, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
