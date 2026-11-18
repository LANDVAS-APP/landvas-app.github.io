-- 📱 Outside: three things only a phone in your hand out in the real world can do (the apps' "Outside" hub).
--
-- 🤜 Bump — two friends (or party mates) knock their phones together. Both phones feel the knock at the same instant;
--    the server pairs the two knocks by time (±1.5 s) and place (both on real GPS, within the "right here" band of
--    Meet nearby: 150 m). No Bluetooth, no contact lists: only people you're already friends or partied with, and never
--    anyone blocked/hidden/banned. A bump lets you hand your friend a gift of Ink on the spot — moved from you to them,
--    never made (capped, a few a day, accounts a few days old, so alts gain nothing). Four or more of one party bumping
--    at once (a meetup pile-up) gives the whole party a Golden Hour (once per party per day).
-- 🪢 The Lasso walk — walk a closed loop on real GPS: the land inside is your Footprint for 24 hours. Claims anywhere
--    inside skip the walk-up rule (like a Rift), your party sees your ink line on the map, and the biggest loop of the
--    week tops a leaderboard. The walk is checked: walking pace (no cars), a closed loop, a size cap, a recent fix of
--    yours at the end of it, a few a day.
-- 🌠 The real sky calendar — real meteor showers (peak ±1 day), real full moons (from the Moon's real cycle), and real
--    ISS passes over where your explorer is (an ephemeris the scheduled job scripts/iss-track.mjs fills from public
--    orbit data; the pass maths runs here, so no location leaves the game). A shower doubles the sky treasures in
--    Explorer's Eyes; a full moon makes Genie wishes moon wishes (double); an ISS pass overhead drops a supply capsule
--    you can catch while it's up.
-- Switches and numbers: game_config 'outside' (Admin → Live control → Settings).

insert into public.game_config (key, value, description) values ('outside', jsonb_build_object(
  'bump', jsonb_build_object('enabled', true, 'window_s', 1.5, 'band_m', 150, 'gift_min', 10, 'gift_max', 200, 'gifts_per_day', 3,
    'received_per_day', 3, 'min_age_days', 3, 'crowd', 4, 'crowd_uses', 3, 'crowd_mult', 2, 'crowd_hours', 1),
  'lasso', jsonb_build_object('enabled', true, 'max_kmh', 9, 'max_burst_kmh', 30, 'close_m', 40, 'min_len_m', 300, 'min_area_m2', 2000,
    'max_area_m2', 2000000, 'min_minutes', 3, 'max_minutes', 180, 'per_day', 3, 'hours', 24, 'end_m', 250),
  'sky', jsonb_build_object('enabled', true, 'shower_per_window', 6, 'shower_cap_mult', 2, 'moon_wish_mult', 2,
    'iss_min_elev', 10, 'capsule_ink_min', 20, 'capsule_ink_max', 60, 'capsule_luck_pct', 15, 'capsule_ticket_pct', 2)),
  'Outside (the apps): Bump (gifts, party pile-up), the Lasso walk (Footprints) and the real sky calendar (showers, full moons, ISS)')
on conflict (key) do nothing;

create or replace function private.outside_cfg(p_part text) returns jsonb language sql stable as $$
  select coalesce(private.cfg('outside') -> p_part, '{}'::jsonb)
$$;
create or replace function private.outside_n(p_part text, p_key text, p_def numeric) returns numeric language sql stable as $$
  select coalesce((private.outside_cfg(p_part) ->> p_key)::numeric, p_def)
$$;
create or replace function private.outside_on(p_part text) returns boolean language sql stable as $$
  select coalesce((private.outside_cfg(p_part) ->> 'enabled')::boolean, true)
$$;

/** the cell's middle, as [lng, lat] (mirrors cellCenter in src/shared/grid.ts) */
create or replace function private.cell_mid(p_gx int, p_gy int) returns float8[] language sql immutable as $$
  select array[private.lng_of(p_gx + 0.5), private.lat_of(p_gy + 0.5)]
$$;

/** where this player really is right now (a fresh real GPS fix), or null */
create or replace function private.gps_here(p_uid uuid) returns float8[] language plpgsql stable as $$
begin
  return (select array[e.gps_lng, e.gps_lat] from public.explorers e
           where e.player_id = p_uid and e.mode = 'gps' and e.gps_lng is not null and e.gps_at > now() - interval '5 minutes' limit 1);
end $$;

/** friends, or in the same party */
create or replace function private.close_to(p_a uuid, p_b uuid) returns boolean language sql stable as $$
  select private.friend_state(p_a, p_b) = 'friends' or p_b = any (private.party_mates(p_a))
$$;

-- ================================================================================================================
-- 🤜 Bump
-- ================================================================================================================
create table if not exists public.bump_knocks (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  at timestamptz not null default clock_timestamp(),
  lng float8 not null, lat float8 not null,
  strength real,
  pair_id bigint,
  with_id uuid references public.players (id) on delete set null);
create index if not exists bump_knocks_at on public.bump_knocks (at);
create index if not exists bump_knocks_player on public.bump_knocks (player_id, at desc);
create index if not exists bump_knocks_with on public.bump_knocks (with_id);
alter table public.bump_knocks enable row level security;
revoke all on public.bump_knocks from anon, authenticated;

create table if not exists public.bump_gifts (
  id bigint generated always as identity primary key,
  pair_id bigint not null,
  from_id uuid not null references public.players (id) on delete cascade,
  to_id uuid not null references public.players (id) on delete cascade,
  ink int not null check (ink > 0),
  at timestamptz not null default now(),
  unique (pair_id, from_id));
create index if not exists bump_gifts_from on public.bump_gifts (from_id, at desc);
create index if not exists bump_gifts_to on public.bump_gifts (to_id, at desc);
alter table public.bump_gifts enable row level security;
revoke all on public.bump_gifts from anon, authenticated;

create table if not exists public.bump_crowds (
  group_id uuid not null,
  day date not null,
  at timestamptz not null default now(),
  players uuid[] not null,
  primary key (group_id, day));
alter table public.bump_crowds enable row level security;
revoke all on public.bump_crowds from anon, authenticated;

/** someone, as the bump screen shows them */
create or replace function private.bump_who(p_id uuid) returns jsonb language plpgsql stable as $$
begin
  return (select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'accent_color', p.accent_color, 'explorer_style', p.explorer_style,
                                    'avatar_seed', p.avatar_seed, 'avatar_style', p.avatar_style, 'avatar_path', p.avatar_path)
            from public.profiles p where p.id = p_id limit 1);
end $$;

/** Pair this knock with a friend's knock at the same moment and place (if it isn't paired yet); a party pile-up of
 *  `crowd` or more gives the party a Golden Hour (once a day). What the bump screen shows. */
create or replace function private.bump_match(p_id bigint) returns jsonb language plpgsql as $$
declare k public.bump_knocks; o public.bump_knocks; v_w interval := make_interval(secs => private.outside_n('bump', 'window_s', 1.5));
  v_band float8 := private.outside_n('bump', 'band_m', 150); v_g uuid; v_crowd uuid[]; v_golden boolean := false; v_need int := private.outside_n('bump', 'crowd', 4)::int;
begin
  select * into k from public.bump_knocks where id = p_id for update;
  if not found then return jsonb_build_object('gone', true); end if;
  if k.pair_id is null then
    select * into o from public.bump_knocks x
     where x.id <> k.id and x.player_id <> k.player_id and x.pair_id is null
       and x.at between k.at - v_w and k.at + v_w
       and private.haversine_m(k.lng, k.lat, x.lng, x.lat) <= v_band
       and private.close_to(k.player_id, x.player_id)
       and private.visible_to(x.player_id, k.player_id) and private.visible_to(k.player_id, x.player_id)
     order by abs(extract(epoch from x.at - k.at)), x.id
     limit 1 for update skip locked;
    if found then
      update public.bump_knocks set pair_id = least(k.id, o.id), with_id = o.player_id where id = k.id returning * into k;
      update public.bump_knocks set pair_id = least(k.id, o.id), with_id = k.player_id where id = o.id;
    end if;
  end if;
  -- a pile-up: everyone of your party who knocked here, now
  select m.group_id into v_g from public.travel_group_members m where m.player_id = k.player_id limit 1;
  if v_g is not null then
    select array_agg(distinct x.player_id) into v_crowd from public.bump_knocks x
      join public.travel_group_members m on m.player_id = x.player_id and m.group_id = v_g
     where x.at between k.at - v_w * 2 and k.at + v_w * 2 and private.haversine_m(k.lng, k.lat, x.lng, x.lat) <= v_band;
    if coalesce(array_length(v_crowd, 1), 0) >= v_need then
      insert into public.bump_crowds (group_id, day, players) values (v_g, private.day_start(now())::date, v_crowd) on conflict do nothing;
      if found then
        insert into public.enchant_buffs (player_id, kind, mult, uses, expires_at, data)
        select m.player_id, 'golden_hour', private.outside_n('bump', 'crowd_mult', 2), private.outside_n('bump', 'crowd_uses', 3)::int,
               now() + make_interval(hours => private.outside_n('bump', 'crowd_hours', 1)::int), jsonb_build_object('from', 'bump_crowd')
          from public.travel_group_members m where m.group_id = v_g;
        v_golden := true;
      end if;
    end if;
  end if;
  if k.pair_id is null then
    return jsonb_build_object('id', k.id, 'matched', false, 'crowd', coalesce(array_length(v_crowd, 1), 0), 'golden', v_golden);
  end if;
  return jsonb_build_object('id', k.id, 'matched', true, 'pair', k.pair_id, 'with', private.bump_who(k.with_id),
    'crowd', coalesce(array_length(v_crowd, 1), 0), 'golden', v_golden,
    'can_gift', not exists (select 1 from public.bump_gifts g where g.pair_id = k.pair_id and g.from_id = k.player_id));
end $$;

/** A knock: the phone felt a bump. You must be out on real GPS (the server reads where from your explorer). */
create or replace function public.bump_knock(p_strength real default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_here float8[] := private.gps_here(v_uid); v_id bigint;
begin
  if not private.outside_on('bump') then raise exception 'feature_off' using errcode = 'P0001'; end if;
  perform private.rate_limit('bump_knock', 30, 60);
  if v_here is null then raise exception 'gps_required' using errcode = 'P0001'; end if;
  -- (one knock is one bump: a phone that rattles on the table only counts once a second)
  if exists (select 1 from public.bump_knocks where player_id = v_uid and at > clock_timestamp() - interval '1 second') then
    select id into v_id from public.bump_knocks where player_id = v_uid order by at desc limit 1;
    return private.bump_match(v_id);
  end if;
  insert into public.bump_knocks (player_id, lng, lat, strength) values (v_uid, v_here[1], v_here[2], p_strength) returning id into v_id;
  delete from public.bump_knocks where at < now() - interval '2 days';
  return private.bump_match(v_id);
end $$;

/** Ask again (the friend's knock may have landed a moment after yours). */
create or replace function public.bump_check(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if not exists (select 1 from public.bump_knocks where id = p_id and player_id = v_uid and at > now() - interval '1 minute') then
    return jsonb_build_object('gone', true);
  end if;
  return private.bump_match(p_id);
end $$;

/** Hand a friend you just bumped some of your Ink — moved, never made. */
create or replace function public.bump_gift(p_pair bigint, p_ink int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); k public.bump_knocks; v_to uuid;
  v_min int := private.outside_n('bump', 'gift_min', 10)::int; v_max int := private.outside_n('bump', 'gift_max', 200)::int;
  v_age interval := make_interval(days => private.outside_n('bump', 'min_age_days', 3)::int);
begin
  perform private.rate_limit('bump_gift', 10, 600);
  select * into k from public.bump_knocks where pair_id = p_pair and player_id = v_uid and at > now() - interval '10 minutes' order by at desc limit 1;
  if not found or k.with_id is null then raise exception 'bump_gone' using errcode = 'P0001'; end if;
  v_to := k.with_id;
  if p_ink is null or p_ink < v_min or p_ink > v_max then raise exception 'gift_amount' using errcode = 'P0001', detail = v_min || '-' || v_max; end if;
  if exists (select 1 from public.players where id in (v_uid, v_to) and created_at > now() - v_age) then raise exception 'bump_too_new' using errcode = 'P0001'; end if;
  if (select count(*) from public.bump_gifts where from_id = v_uid and at >= private.day_start(now())) >= private.outside_n('bump', 'gifts_per_day', 3) then
    raise exception 'gifts_today' using errcode = 'P0001';
  end if;
  if (select count(*) from public.bump_gifts where to_id = v_to and at >= private.day_start(now())) >= private.outside_n('bump', 'received_per_day', 3) then
    raise exception 'they_got_enough' using errcode = 'P0001';
  end if;
  insert into public.bump_gifts (pair_id, from_id, to_id, ink) values (p_pair, v_uid, v_to, p_ink) on conflict do nothing;
  if not found then raise exception 'gift_sent' using errcode = 'P0001'; end if;
  perform private.ledger_apply(v_uid, 'ink', -p_ink, 'bump_gift_sent', 'bump', p_pair::text, 'bump:' || p_pair || ':' || v_uid || ':out', v_uid);
  perform private.ledger_apply(v_to, 'ink', p_ink, 'bump_gift', 'bump', p_pair::text, 'bump:' || p_pair || ':' || v_uid || ':in', v_uid);
  return jsonb_build_object('ink', p_ink, 'to', private.bump_who(v_to), 'balances', private.balances(v_uid));
end $$;

/** your bumps: today's gifts, who you've bumped lately */
create or replace function public.bump_mine() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return jsonb_build_object('enabled', private.outside_on('bump'), 'gps', private.gps_here(v_uid) is not null,
    'bumps', (select count(distinct pair_id) from public.bump_knocks where player_id = v_uid and pair_id is not null),
    'gifts_today', (select count(*) from public.bump_gifts where from_id = v_uid and at >= private.day_start(now())),
    'gifts_per_day', private.outside_n('bump', 'gifts_per_day', 3), 'gift_min', private.outside_n('bump', 'gift_min', 10), 'gift_max', private.outside_n('bump', 'gift_max', 200),
    'crowd', private.outside_n('bump', 'crowd', 4),
    'recent', coalesce((select jsonb_agg(x.j order by x.at desc) from (
        select distinct on (k.with_id) k.with_id, k.at, private.bump_who(k.with_id) || jsonb_build_object('at', k.at) j
          from public.bump_knocks k where k.player_id = v_uid and k.with_id is not null order by k.with_id, k.at desc) x), '[]'::jsonb));
end $$;

-- ================================================================================================================
-- 🪢 The Lasso walk
-- ================================================================================================================
create table if not exists public.lasso_loops (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  area_m2 float8 not null, length_m float8 not null, minutes float8 not null, points int not null, top_kmh float8,
  ring jsonb not null,
  min_lng float8 not null, min_lat float8 not null, max_lng float8 not null, max_lat float8 not null);
create index if not exists lasso_loops_player on public.lasso_loops (player_id, created_at desc);
create index if not exists lasso_loops_live on public.lasso_loops (expires_at);
create index if not exists lasso_loops_week on public.lasso_loops (created_at, area_m2 desc);
alter table public.lasso_loops enable row level security;
revoke all on public.lasso_loops from anon, authenticated;

/** is the point inside the ring ([[lng, lat], …]) — the even-odd rule */
create or replace function private.in_ring(p_lng float8, p_lat float8, p_ring jsonb) returns boolean language plpgsql immutable as $$
declare n int := jsonb_array_length(p_ring); i int; j int; xi float8; yi float8; xj float8; yj float8; v_in boolean := false;
begin
  if n < 3 then return false; end if;
  j := n - 1;
  for i in 0 .. n - 1 loop
    xi := (p_ring -> i ->> 0)::float8; yi := (p_ring -> i ->> 1)::float8;
    xj := (p_ring -> j ->> 0)::float8; yj := (p_ring -> j ->> 1)::float8;
    if ((yi > p_lat) <> (yj > p_lat)) and (p_lng < (xj - xi) * (p_lat - yi) / nullif(yj - yi, 0) + xi) then v_in := not v_in; end if;
    j := i;
  end loop;
  return v_in;
end $$;

/** a Footprint of yours covers this cell right now */
create or replace function private.lasso_ok(p_uid uuid, p_gx int, p_gy int) returns boolean language plpgsql stable as $$
declare c float8[] := private.cell_mid(p_gx, p_gy); r record;
begin
  if p_uid is null then return false; end if;
  for r in select ring from public.lasso_loops
            where player_id = p_uid and expires_at > now() and c[1] between min_lng and max_lng and c[2] between min_lat and max_lat loop
    if private.in_ring(c[1], c[2], r.ring) then return true; end if;
  end loop;
  return false;
end $$;

/** A walked loop: [[lng, lat, t_ms, accuracy_m], …] in walking order, the last point back near the first. Checked, then
 *  it becomes your Footprint for the next 24 hours (the last one goes). */
create or replace function public.lasso_submit(p_track jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_here float8[] := private.gps_here(v_uid);
  n int; i int; a jsonb; b jsonb; d float8; dt float8; v_len float8 := 0; v_top float8 := 0; v_fast int := 0;
  v_t0 float8; v_t1 float8; v_mins float8; v_lat0 float8; v_k float8; v_area float8 := 0; v_ring jsonb := '[]'::jsonb; v_step int;
  v_minlng float8 := 999; v_minlat float8 := 999; v_maxlng float8 := -999; v_maxlat float8 := -999; x float8; y float8; v_id bigint; v_rank int;
  v_max_kmh float8 := private.outside_n('lasso', 'max_kmh', 9); v_burst float8 := private.outside_n('lasso', 'max_burst_kmh', 30);
begin
  if not private.outside_on('lasso') then raise exception 'feature_off' using errcode = 'P0001'; end if;
  perform private.rate_limit('lasso_submit', 10, 3600);
  if v_here is null then raise exception 'gps_required' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_track) <> 'array' then raise exception 'lasso_bad' using errcode = 'P0001'; end if;
  n := jsonb_array_length(p_track);
  if n < 12 or n > 6000 then raise exception 'lasso_bad' using errcode = 'P0001', detail = 'points'; end if;
  if (select count(*) from public.lasso_loops where player_id = v_uid and created_at >= private.day_start(now())) >= private.outside_n('lasso', 'per_day', 3) then
    raise exception 'lasso_today' using errcode = 'P0001';
  end if;
  v_t0 := (p_track -> 0 ->> 2)::float8; v_t1 := (p_track -> (n - 1) ->> 2)::float8;
  v_mins := (v_t1 - v_t0) / 60000.0;
  if v_mins < private.outside_n('lasso', 'min_minutes', 3) then raise exception 'lasso_short' using errcode = 'P0001'; end if;
  if v_mins > private.outside_n('lasso', 'max_minutes', 180) then raise exception 'lasso_long' using errcode = 'P0001'; end if;
  if abs(v_t1 / 1000.0 - extract(epoch from now())) > 600 then raise exception 'lasso_stale' using errcode = 'P0001'; end if;
  -- walking pace, all the way round (a few GPS jumps are forgiven; a car isn't)
  for i in 1 .. n - 1 loop
    a := p_track -> (i - 1); b := p_track -> i;
    dt := ((b ->> 2)::float8 - (a ->> 2)::float8) / 1000.0;
    if dt <= 0 then raise exception 'lasso_bad' using errcode = 'P0001', detail = 'time'; end if;
    d := private.haversine_m((a ->> 0)::float8, (a ->> 1)::float8, (b ->> 0)::float8, (b ->> 1)::float8);
    v_len := v_len + d;
    if dt >= 3 then v_top := greatest(v_top, d / dt * 3.6); end if;
    if d > 25 and d / dt * 3.6 > v_burst then v_fast := v_fast + 1; end if;
  end loop;
  if v_fast > greatest(2, n / 50) then raise exception 'lasso_fast' using errcode = 'P0001'; end if;
  if v_len / 1000.0 / (v_mins / 60.0) > v_max_kmh then raise exception 'lasso_fast' using errcode = 'P0001'; end if;
  if v_len < private.outside_n('lasso', 'min_len_m', 300) then raise exception 'lasso_short' using errcode = 'P0001'; end if;
  if private.haversine_m((p_track -> 0 ->> 0)::float8, (p_track -> 0 ->> 1)::float8, (p_track -> (n - 1) ->> 0)::float8, (p_track -> (n - 1) ->> 1)::float8)
       > private.outside_n('lasso', 'close_m', 40) then raise exception 'lasso_open' using errcode = 'P0001'; end if;
  -- it ends where you really are
  if private.haversine_m((p_track -> (n - 1) ->> 0)::float8, (p_track -> (n - 1) ->> 1)::float8, v_here[1], v_here[2]) > private.outside_n('lasso', 'end_m', 250) then
    raise exception 'lasso_elsewhere' using errcode = 'P0001';
  end if;
  -- the area inside (flat-earth near the loop: fine for a walk), and the ring kept (at most ~240 points)
  v_lat0 := (p_track -> 0 ->> 1)::float8; v_k := 111320.0 * cos(radians(v_lat0));
  for i in 0 .. n - 1 loop
    a := p_track -> i; b := p_track -> ((i + 1) % n);
    v_area := v_area + ((a ->> 0)::float8 * v_k) * ((b ->> 1)::float8 * 111320.0) - ((b ->> 0)::float8 * v_k) * ((a ->> 1)::float8 * 111320.0);
  end loop;
  v_area := abs(v_area) / 2;
  if v_area < private.outside_n('lasso', 'min_area_m2', 2000) then raise exception 'lasso_small' using errcode = 'P0001'; end if;
  if v_area > private.outside_n('lasso', 'max_area_m2', 2000000) then raise exception 'lasso_big' using errcode = 'P0001'; end if;
  v_step := greatest(1, ceil(n / 240.0)::int);
  for i in 0 .. n - 1 by v_step loop
    x := round(((p_track -> i ->> 0)::float8)::numeric, 6); y := round(((p_track -> i ->> 1)::float8)::numeric, 6);
    v_ring := v_ring || jsonb_build_array(jsonb_build_array(x, y));
    v_minlng := least(v_minlng, x); v_maxlng := greatest(v_maxlng, x); v_minlat := least(v_minlat, y); v_maxlat := greatest(v_maxlat, y);
  end loop;
  update public.lasso_loops set expires_at = now() where player_id = v_uid and expires_at > now();
  insert into public.lasso_loops (player_id, expires_at, area_m2, length_m, minutes, points, top_kmh, ring, min_lng, min_lat, max_lng, max_lat)
  values (v_uid, now() + make_interval(hours => private.outside_n('lasso', 'hours', 24)::int), v_area, v_len, v_mins, n, v_top, v_ring, v_minlng, v_minlat, v_maxlng, v_maxlat)
  returning id into v_id;
  select count(*) + 1 into v_rank from (
    select player_id, max(area_m2) a from public.lasso_loops where created_at >= date_trunc('week', now()) group by player_id) w
   where w.a > v_area and w.player_id <> v_uid;
  return jsonb_build_object('id', v_id, 'area_m2', round(v_area::numeric), 'length_m', round(v_len::numeric), 'minutes', round(v_mins::numeric, 1),
    'expires_at', now() + make_interval(hours => private.outside_n('lasso', 'hours', 24)::int), 'rank', v_rank);
end $$;

/** your Footprint and your party's (for the map), and this week's biggest loops */
create or replace function public.lasso_view() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_mates uuid[] := private.party_mates(v_uid);
begin
  return jsonb_build_object('enabled', private.outside_on('lasso'), 'gps', private.gps_here(v_uid) is not null,
    'cfg', jsonb_build_object('max_kmh', private.outside_n('lasso', 'max_kmh', 9), 'close_m', private.outside_n('lasso', 'close_m', 40),
      'min_len_m', private.outside_n('lasso', 'min_len_m', 300), 'min_area_m2', private.outside_n('lasso', 'min_area_m2', 2000),
      'max_area_m2', private.outside_n('lasso', 'max_area_m2', 2000000), 'min_minutes', private.outside_n('lasso', 'min_minutes', 3),
      'per_day', private.outside_n('lasso', 'per_day', 3), 'hours', private.outside_n('lasso', 'hours', 24)),
    'today', (select count(*) from public.lasso_loops where player_id = v_uid and created_at >= private.day_start(now())),
    'loops', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'mine', l.player_id = v_uid, 'who', private.bump_who(l.player_id),
        'ring', l.ring, 'area_m2', round(l.area_m2::numeric), 'expires_at', l.expires_at) order by l.player_id = v_uid desc, l.created_at desc)
      from public.lasso_loops l where l.expires_at > now() and (l.player_id = v_uid or (l.player_id = any (v_mates) and private.visible_to(l.player_id, v_uid)))), '[]'::jsonb),
    'board', coalesce((select jsonb_agg(x.j order by x.a desc) from (
        select private.bump_who(w.player_id) || jsonb_build_object('area_m2', round(w.a::numeric), 'me', w.player_id = v_uid) j, w.a
          from (select player_id, max(area_m2) a from public.lasso_loops where created_at >= date_trunc('week', now()) group by player_id) w
         where private.visible_to(w.player_id, v_uid) order by w.a desc limit 20) x), '[]'::jsonb));
end $$;

-- the walk-up rule: a Footprint of yours counts like standing there (alongside a Rift)
CREATE OR REPLACE FUNCTION private.require_in_reach(p_uid uuid, p_gx integer, p_gy integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
AS $function$
declare c record; v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 1); v_d int;
begin
  if not private.flag('location_gated_claims') then return; end if;
  -- 🌐 a Rift of yours: claim around it as if you were standing there
  if private.rx_rift_ok(p_uid, p_gx, p_gy) then return; end if;
  -- 🪢 inside your Footprint (a Lasso walk's loop): the same
  if private.lasso_ok(p_uid, p_gx, p_gy) then return; end if;
  select * into c from private.explorer_now(p_uid);
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  v_d := private.cell_distance(c.gx, c.gy, p_gx, p_gy);
  if v_d > v_reach then
    raise exception 'out_of_reach' using errcode = 'P0001', detail = v_d::text;
  end if;
end $function$;

-- and the plot sheet knows it too (so its Claim button shows inside your Footprint)
select private.fn_patch('public.plot_details(integer,integer)',
  $a$'in_reach', not private.flag('location_gated_claims') or private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy) <= v_reach));$a$,
  $b$'in_reach', not private.flag('location_gated_claims') or private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy) <= v_reach or private.lasso_ok(v_uid, p_gx, p_gy), 'footprint', private.lasso_ok(v_uid, p_gx, p_gy)));$b$);
select private.fn_patch('public.plot_details(integer,integer)',
  $a$'explorer', false, 'distance', null, 'max', v_reach, 'in_reach', not private.flag('location_gated_claims')));$a$,
  $b$'explorer', false, 'distance', null, 'max', v_reach, 'in_reach', not private.flag('location_gated_claims') or private.lasso_ok(v_uid, p_gx, p_gy), 'footprint', private.lasso_ok(v_uid, p_gx, p_gy)));$b$);

-- ================================================================================================================
-- 🌠 The real sky calendar
-- ================================================================================================================
create table if not exists public.sky_showers (
  id text primary key,
  name text not null,
  month int not null check (month between 1 and 12),
  day int not null check (day between 1 and 31),
  zhr int not null,
  radiant text not null default '');
alter table public.sky_showers enable row level security;
revoke all on public.sky_showers from anon, authenticated;
-- the major annual showers and their usual peak (the IMO calendar's dates; real peaks drift by a day year to year,
-- so a shower counts from the day before its peak to the day after)
insert into public.sky_showers (id, name, month, day, zhr, radiant) values
  ('quadrantids', 'Quadrantids', 1, 3, 110, 'Boötes'),
  ('lyrids', 'Lyrids', 4, 22, 18, 'Lyra'),
  ('eta_aquariids', 'Eta Aquariids', 5, 6, 50, 'Aquarius'),
  ('perseids', 'Perseids', 8, 12, 100, 'Perseus'),
  ('draconids', 'Draconids', 10, 8, 10, 'Draco'),
  ('orionids', 'Orionids', 10, 21, 20, 'Orion'),
  ('leonids', 'Leonids', 11, 17, 15, 'Leo'),
  ('geminids', 'Geminids', 12, 14, 150, 'Gemini'),
  ('ursids', 'Ursids', 12, 22, 10, 'Ursa Minor')
on conflict (id) do update set name = excluded.name, month = excluded.month, day = excluded.day, zhr = excluded.zhr, radiant = excluded.radiant;

/** the shower on now (peak ±1 day, UTC), or null */
create or replace function private.sky_shower(p_at timestamptz default now()) returns public.sky_showers language plpgsql stable as $$
declare r public.sky_showers; v_y int := extract(year from p_at at time zone 'utc')::int;
begin
  select s.* into r from public.sky_showers s
   cross join lateral unnest(array[v_y - 1, v_y, v_y + 1]) yy(y)
   where abs(extract(epoch from (p_at at time zone 'utc') - make_timestamp(yy.y, s.month, s.day, 12, 0, 0))) <= 36 * 3600
   order by s.zhr desc limit 1;
  return r;
end $$;

/** the Moon's age in its cycle, 0..1 (0 new, 0.5 full): from a real new moon and the mean synodic month */
create or replace function private.moon_phase(p_at timestamptz default now()) returns float8 language sql immutable as $$
  select (((extract(epoch from p_at) - extract(epoch from timestamptz '2000-01-06 18:14:00+00')) / 86400.0 / 29.530588853)
          - floor((extract(epoch from p_at) - extract(epoch from timestamptz '2000-01-06 18:14:00+00')) / 86400.0 / 29.530588853))::float8
$$;
/** a full moon now (within a day either side of it) */
create or replace function private.sky_full_moon(p_at timestamptz default now()) returns boolean language sql stable as $$
  select private.outside_on('sky') and abs(private.moon_phase(p_at) - 0.5) * 29.530588853 <= 1.0
$$;
/** the next full moon after this moment */
create or replace function private.next_full_moon(p_at timestamptz default now()) returns timestamptz language sql immutable as $$
  select p_at + make_interval(secs => (((0.5 - private.moon_phase(p_at)) + 1)::numeric % 1)::float8 * 29.530588853 * 86400)
$$;

-- the ISS: where it is over the ground, every 30 s for the next ~2 days (scripts/iss-track.mjs, from public orbit data)
create table if not exists public.sky_iss (
  at timestamptz primary key,
  lat float8 not null, lng float8 not null, alt_km float8 not null);
alter table public.sky_iss enable row level security;
revoke all on public.sky_iss from anon, authenticated;

create table if not exists public.sky_capsules (
  player_id uuid not null references public.players (id) on delete cascade,
  pass_at timestamptz not null,
  at timestamptz not null default now(),
  reward jsonb not null default '{}'::jsonb,
  primary key (player_id, pass_at));
alter table public.sky_capsules enable row level security;
revoke all on public.sky_capsules from anon, authenticated;

/** how high something at (lat, lng, alt_km) stands over the horizon from the ground at (o_lng, o_lat), degrees */
create or replace function private.elev_deg(o_lng float8, o_lat float8, s_lng float8, s_lat float8, s_alt_km float8) returns float8 language sql immutable as $$
  select degrees(atan2(cos(g) - 6371.0 / (6371.0 + s_alt_km), sin(g)))
    from (select private.haversine_m(o_lng, o_lat, s_lng, s_lat) / 6371008.8 g) x
$$;

/** where the sky is read from: your real fix, or your explorer in the game (it never leaves the server) */
create or replace function private.sky_where(p_uid uuid) returns float8[] language plpgsql stable as $$
declare v float8[] := private.gps_here(p_uid); c record;
begin
  if v is not null then return v; end if;
  select * into c from private.explorer_now(p_uid);
  if found and c.gx is not null then return private.cell_mid(c.gx, c.gy); end if;
  return null;
end $$;

/** the ISS passes over (lng, lat) from p_from for p_hours: rise, top and set, and how high it gets */
create or replace function private.iss_passes(p_lng float8, p_lat float8, p_from timestamptz, p_hours int) returns jsonb language plpgsql stable as $$
begin
  return (with e as (
    select s.at, private.elev_deg(p_lng, p_lat, s.lng, s.lat, s.alt_km) el from public.sky_iss s
     where s.at between p_from - interval '30 minutes' and p_from + make_interval(hours => p_hours)
       -- (cheap first cut: within ~2,500 km of the point)
       and abs(s.lat - p_lat) < 23),
  up as (select at, el, (el >= private.outside_n('sky', 'iss_min_elev', 10)) vis from e),
  g as (select at, el, vis, sum(case when vis then 0 else 1 end) over (order by at) grp from up),
  p as (select min(at) rise, max(at) fall, max(el) top from g where vis group by grp)
  select coalesce(jsonb_agg(jsonb_build_object('rise', rise, 'set', fall + interval '30 seconds', 'max_elev', round(top::numeric, 1)) order by rise), '[]'::jsonb)
    from p where fall + interval '30 seconds' >= p_from);
end $$;

/** tonight's sky where you are: the shower, the Moon, the ISS passes (and a capsule if it's overhead now) */
create or replace function public.sky_now() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); w float8[] := private.sky_where(v_uid); sh public.sky_showers; v_passes jsonb := '[]'::jsonb;
  v_now jsonb; v_next jsonb; v_cap jsonb := null; ph float8 := private.moon_phase(now());
begin
  if not private.outside_on('sky') then return jsonb_build_object('enabled', false); end if;
  sh := private.sky_shower(now());
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'zhr', s.zhr, 'radiant', s.radiant,
      'peak', make_timestamp(x.y, s.month, s.day, 12, 0, 0) at time zone 'utc') order by x.peak), '[]'::jsonb)
    into v_next
    from public.sky_showers s
    cross join lateral (select y, make_timestamp(y, s.month, s.day, 12, 0, 0) at time zone 'utc' peak
                          from unnest(array[extract(year from now())::int, extract(year from now())::int + 1]) y) x
   where x.peak > now() - interval '36 hours' and x.peak < now() + interval '200 days';
  if w is not null then
    v_passes := private.iss_passes(w[1], w[2], now(), 36);
    select p into v_now from jsonb_array_elements(v_passes) p where (p ->> 'rise')::timestamptz <= now() and (p ->> 'set')::timestamptz > now() limit 1;
    if v_now is not null then
      v_cap := jsonb_build_object('pass', v_now ->> 'rise', 'until', v_now ->> 'set',
        'caught', exists (select 1 from public.sky_capsules c where c.player_id = v_uid and c.pass_at = (v_now ->> 'rise')::timestamptz));
    end if;
  end if;
  return jsonb_build_object('enabled', true, 'server_now', now(),
    'shower', case when sh.id is not null then jsonb_build_object('id', sh.id, 'name', sh.name, 'zhr', sh.zhr, 'radiant', sh.radiant) end,
    'showers', v_next,
    'moon', jsonb_build_object('phase', round(ph::numeric, 4), 'full', private.sky_full_moon(now()), 'next_full', private.next_full_moon(now()),
      'wish_mult', private.outside_n('sky', 'moon_wish_mult', 2)),
    'where', w is not null, 'iss_data', exists (select 1 from public.sky_iss where at > now()),
    'passes', v_passes, 'capsule', v_cap,
    'eyes', jsonb_build_object('per_window', case when sh.id is not null then private.outside_n('sky', 'shower_per_window', 6) end,
      'cap_mult', case when sh.id is not null then private.outside_n('sky', 'shower_cap_mult', 2) end));
end $$;

/** catch the ISS's supply capsule: only while the station is up over where you are (once a pass) */
create or replace function public.sky_capsule_catch() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); w float8[] := private.sky_where(v_uid); s public.sky_iss; v_el float8; v_pass timestamptz;
  v_tp numeric := private.outside_n('sky', 'capsule_ticket_pct', 2); v_lp numeric := private.outside_n('sky', 'capsule_luck_pct', 15);
  v_lo int := private.outside_n('sky', 'capsule_ink_min', 20)::int; v_hi int := private.outside_n('sky', 'capsule_ink_max', 60)::int; r numeric := random() * 100; v jsonb; n int;
begin
  if not private.outside_on('sky') then raise exception 'feature_off' using errcode = 'P0001'; end if;
  perform private.rate_limit('sky_capsule', 10, 600);
  if w is null then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  select * into s from public.sky_iss where at <= now() order by at desc limit 1;
  if not found or s.at < now() - interval '2 minutes' then raise exception 'not_overhead' using errcode = 'P0001'; end if;
  v_el := private.elev_deg(w[1], w[2], s.lng, s.lat, s.alt_km);
  if v_el < private.outside_n('sky', 'iss_min_elev', 10) then raise exception 'not_overhead' using errcode = 'P0001'; end if;
  select (p ->> 'rise')::timestamptz into v_pass from jsonb_array_elements(private.iss_passes(w[1], w[2], now() - interval '20 minutes', 1)) p
   where (p ->> 'rise')::timestamptz <= now() and (p ->> 'set')::timestamptz > now() limit 1;
  if v_pass is null then raise exception 'not_overhead' using errcode = 'P0001'; end if;
  insert into public.sky_capsules (player_id, pass_at) values (v_uid, v_pass) on conflict do nothing;
  if not found then raise exception 'caught_already' using errcode = 'P0001'; end if;
  if r < v_tp and exists (select 1 from public.plot_rarities where id = 'rare') then
    perform private.ench_ticket(v_uid, 'rare', 'iss_capsule'); v := jsonb_build_object('ticket', 'rare');
  elsif r < v_tp + v_lp then
    perform private.rx_luck(v_uid, 5); v := jsonb_build_object('luck', 5);
  else
    n := v_lo + floor(random() * (greatest(v_hi, v_lo) - v_lo + 1))::int;
    n := private.grant_ink_paced(v_uid, n, 'finds', 'iss_capsule', v_pass::text, 'iss:' || v_uid || ':' || extract(epoch from v_pass)::bigint);
    v := jsonb_build_object('ink', n);
  end if;
  update public.sky_capsules set reward = v where player_id = v_uid and pass_at = v_pass;
  return v || jsonb_build_object('elev', round(v_el::numeric, 1), 'balances', private.balances(v_uid));
end $$;

-- a shower doubles the sky treasures in Explorer's Eyes (more each window, a bigger daily cap)
select private.fn_patch('public.eyes_sky()',
  $a$  v_per int := least(6, greatest(0, coalesce((s ->> 'per_window')::int, 3)));$a$,
  $b$  v_per int := least(6, greatest(0, case when private.outside_on('sky') and (private.sky_shower(now())).id is not null then private.outside_n('sky', 'shower_per_window', 6)::int else coalesce((s ->> 'per_window')::int, 3) end));$b$);
select private.fn_patch('public.eyes_sky()',
  $a$  v_cap int := greatest(0, coalesce((s ->> 'daily_cap')::int, 12));$a$,
  $b$  v_cap int := greatest(0, coalesce((s ->> 'daily_cap')::int, 12) * case when private.outside_on('sky') and (private.sky_shower(now())).id is not null then private.outside_n('sky', 'shower_cap_mult', 2)::int else 1 end);$b$);
select private.fn_patch('public.eyes_catch(bigint,integer)',
  $a$  v_cap int := greatest(0, coalesce((s ->> 'daily_cap')::int, 12));
  v_per int := least(6, greatest(0, coalesce((s ->> 'per_window')::int, 3)));$a$,
  $b$  v_cap int := greatest(0, coalesce((s ->> 'daily_cap')::int, 12) * case when private.outside_on('sky') and (private.sky_shower(now())).id is not null then private.outside_n('sky', 'shower_cap_mult', 2)::int else 1 end);
  v_per int := least(6, greatest(0, case when private.outside_on('sky') and (private.sky_shower(now())).id is not null then private.outside_n('sky', 'shower_per_window', 6)::int else coalesce((s ->> 'per_window')::int, 3) end));$b$);

-- a full moon: Genie wishes are moon wishes (double) — anchored on today's text (20261119000415 made the amounts settings)
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_kept boolean := false; v_lk jsonb; v_out text;$a$,
  $b$v_kept boolean := false; v_lk jsonb; v_out text; v_moon numeric := case when private.sky_full_moon(t) then private.outside_n('sky', 'moon_wish_mult', 2) else 1 end;$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$+ floor(random() * (greatest(private.ench_n('genie', 'wish_ink_max', 90) - private.ench_n('genie', 'wish_ink_min', 40), 0) + 1)))::numeric, 'wish: Ink');$a$,
  $b$+ floor(random() * (greatest(private.ench_n('genie', 'wish_ink_max', 90) - private.ench_n('genie', 'wish_ink_min', 40), 0) + 1)))::numeric * v_moon, case when v_moon > 1 then 'moon wish: Ink' else 'wish: Ink' end);$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_lk := private.ench_give_luck(e.owner_id, private.ench_n('genie', 'wish_luck', 15)::int, 0); r := jsonb_build_object('wish', 'luck', 'luck', private.ench_n('genie', 'wish_luck', 15)::int, 'now', v_lk);$a$,
  $b$v_lk := private.ench_give_luck(e.owner_id, (private.ench_n('genie', 'wish_luck', 15) * v_moon)::int, 0); r := jsonb_build_object('wish', 'luck', 'luck', (private.ench_n('genie', 'wish_luck', 15) * v_moon)::int, 'now', v_lk);$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_lk := private.ench_give_luck(e.owner_id, 0, private.ench_n('genie', 'wish_enchant', 1)::int); r := jsonb_build_object('wish', 'enchant', 'enchant', private.ench_n('genie', 'wish_enchant', 1)::int, 'now', v_lk);$a$,
  $b$v_lk := private.ench_give_luck(e.owner_id, 0, (private.ench_n('genie', 'wish_enchant', 1) * v_moon)::int); r := jsonb_build_object('wish', 'enchant', 'enchant', (private.ench_n('genie', 'wish_enchant', 1) * v_moon)::int, 'now', v_lk);$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$values (e.owner_id, 'golden_hour', e.id, private.ench_n('genie', 'golden_x', 2), private.ench_n('genie', 'golden_uses', 3)::int,$a$,
  $b$values (e.owner_id, 'golden_hour', e.id, private.ench_n('genie', 'golden_x', 2), (private.ench_n('genie', 'golden_uses', 3) * v_moon)::int,$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$r := jsonb_build_object('wish', 'golden', 'mult', private.ench_n('genie', 'golden_x', 2), 'uses', private.ench_n('genie', 'golden_uses', 3)::int);$a$,
  $b$r := jsonb_build_object('wish', 'golden', 'mult', private.ench_n('genie', 'golden_x', 2), 'uses', (private.ench_n('genie', 'golden_uses', 3) * v_moon)::int);$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$      r := r || jsonb_build_object('kept', v_kept);$a$,
  $b$      r := r || jsonb_build_object('kept', v_kept, 'moon', v_moon > 1);$b$);

-- ================================================================================================================
revoke all on function public.bump_knock(real) from public, anon;
revoke all on function public.bump_check(bigint) from public, anon;
revoke all on function public.bump_gift(bigint, int) from public, anon;
revoke all on function public.bump_mine() from public, anon;
revoke all on function public.lasso_submit(jsonb) from public, anon;
revoke all on function public.lasso_view() from public, anon;
revoke all on function public.sky_now() from public, anon;
revoke all on function public.sky_capsule_catch() from public, anon;
grant execute on function public.bump_knock(real) to authenticated;
grant execute on function public.bump_check(bigint) to authenticated;
grant execute on function public.bump_gift(bigint, int) to authenticated;
grant execute on function public.bump_mine() to authenticated;
grant execute on function public.lasso_submit(jsonb) to authenticated;
grant execute on function public.lasso_view() to authenticated;
grant execute on function public.sky_now() to authenticated;
grant execute on function public.sky_capsule_catch() to authenticated;
revoke all on function private.bump_match(bigint) from public;
revoke all on function private.lasso_ok(uuid, int, int) from public;
revoke all on function private.in_ring(float8, float8, jsonb) from public;
revoke all on function private.iss_passes(float8, float8, timestamptz, int) from public;
