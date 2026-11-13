-- 🐉 The Leviathan: a live world boss that walks the real map.
--
-- Once a week (Saturday 17:00 UTC by default) the map shakes and everyone is told: "Something is rising off the coast of
-- Oregon." An hour later a colossal ink beast climbs out of a real sea and walks inland through real cities for about
-- 48 hours — the same creature, in the same place, for every player at once. Its position is a pure function of time along
-- its path, so every screen moves it smoothly with no live connection; the server is the judge of where it is.
--
--  · plots it passes are trampled with ink for a couple of hours: their minigames pay 40% less until someone scrubs it off
--    (scrubbing pays). Nothing is lost for good.
--  · anyone can fight it from anywhere: ink bombs (a bank of 60, one back a minute) and each enchantment's own move every
--    3 hours — the Size Ray shrinks it (everyone hits ×1.5 for 10 min), Clockwork freezes it, the Oracle foretells its weak
--    spot (×1.25), the Goose throws an Egg Bomb, Pandora lets an evil out on it…
--  · one shared health bar and a live feed. At half health it's ENRAGED and turns on the biggest plots (a Size Ray giant in
--    its way stops it for 20 minutes and lands a blow); at 10% it runs for the sea — a race.
--  · if it falls, its bones stay on the map where it died, for good, and everyone who hit it gets loot by contribution.
--    If it escapes, it comes back stronger next week.

insert into public.game_config (key, value) values ('leviathan', jsonb_build_object(
  'enabled', true, 'weekday', 6, 'hour_utc', 17, 'every_days', 7, 'warn_min', 60, 'walk_hours', 48,
  'hp_per_player', 2500, 'hp_min', 60000, 'strength_step', 0.5,
  'bombs_max', 60, 'bomb_regen_s', 60, 'move_cd_h', 3,
  'trample_km', 1.2, 'trample_hours', 2, 'block_km', 3, 'block_min', 20,
  'loot_base', 25, 'loot_pool_div', 100, 'loot_cap', 1500))
on conflict (key) do nothing;

-- Leviathan Ink is a reason Ink can come from (paced like the rest)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.grant(uuid,jsonb,text,text,text,text)'::regprocedure);
  n := replace(d, $a$'group_game', 'enchantment') then$a$, $a$'group_game', 'enchantment', 'leviathan') then$a$);
  if n = d then raise exception 'leviathan: grant anchor not found'; end if;
  execute n;
end $$;
update public.game_config set value = jsonb_set(value, '{paced}', coalesce(value -> 'paced', '[]'::jsonb) || '["leviathan"]'::jsonb)
 where key = 'ink_pacing' and not coalesce(value -> 'paced', '[]'::jsonb) ? 'leviathan';

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest', 'ipo', 'arcade',
                  'luck', 'crown', 'flight', 'estate', 'moderation', 'enchant', 'leviathan'));
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant', 'leviathan'));

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.feed_activities()'::regprocedure);
  n := replace(d, $a$('feed_games', 'arcade_level'), ('feed_games', 'arcade_install'),$a$, $a$('feed_games', 'arcade_level'), ('feed_games', 'arcade_install'), ('feed_games', 'leviathan'),$a$);
  if n = d then raise exception 'leviathan: feed_activities anchor not found'; end if;
  execute n;
  d := pg_get_functiondef('private.feed_group(text)'::regprocedure);
  n := replace(d, $a$when p_kind in ('minigame', 'pvp', 'arcade', 'sketch', 'challenge', 'level') then 'feed_games'$a$, $a$when p_kind in ('minigame', 'pvp', 'arcade', 'sketch', 'challenge', 'level', 'leviathan') then 'feed_games'$a$);
  if n = d then raise exception 'leviathan: feed_group anchor not found'; end if;
  execute n;
end $$;

-- ---- tables -----------------------------------------------------------------------------------------------------------
create table if not exists public.leviathans (
  id uuid primary key default gen_random_uuid(),
  gen int not null,
  status text not null check (status in ('warning', 'walking', 'enraged', 'fleeing', 'fallen', 'escaped', 'ended')),
  strength numeric not null default 1,
  hp_max bigint not null, hp bigint not null,
  path jsonb not null, path_km numeric not null, speed_kmh numeric not null,
  walk_s numeric not null default 0, walk_at timestamptz not null, pause_until timestamptz,
  rise_at timestamptz not null, spawned_at timestamptz not null default now(), ended_at timestamptz,
  origin text, exit_sea text, place text,
  trail jsonb not null default '[]'::jsonb, trampled_km numeric not null default 0,
  shrunk_until timestamptz, foretold_until timestamptz, blocked jsonb not null default '[]'::jsonb,
  last_tick timestamptz, roar_at timestamptz, data jsonb not null default '{}'::jsonb);
create index if not exists leviathans_status on public.leviathans (status, spawned_at desc);
alter table public.leviathans enable row level security;
revoke all on public.leviathans from anon, authenticated;

create table if not exists public.leviathan_players (
  lev_id uuid not null references public.leviathans (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  dmg bigint not null default 0, hits int not null default 0,
  bombs numeric not null default 60, bombs_at timestamptz not null default now(),
  moves jsonb not null default '{}'::jsonb, loot jsonb, loot_seen boolean not null default false,
  primary key (lev_id, player_id));
create index if not exists leviathan_players_dmg on public.leviathan_players (lev_id, dmg desc);
create index if not exists leviathan_players_player on public.leviathan_players (player_id);
alter table public.leviathan_players enable row level security;
revoke all on public.leviathan_players from anon, authenticated;

create table if not exists public.leviathan_hits (
  id bigint generated always as identity primary key,
  lev_id uuid not null references public.leviathans (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  move text not null, label text not null, emoji text not null default '💣', dmg int not null, created_at timestamptz not null default now());
create index if not exists leviathan_hits_by on public.leviathan_hits (lev_id, id desc);
create index if not exists leviathan_hits_player on public.leviathan_hits (player_id);
alter table public.leviathan_hits enable row level security;
revoke all on public.leviathan_hits from anon, authenticated;

create table if not exists public.leviathan_trampled (
  lev_id uuid not null references public.leviathans (id) on delete cascade,
  gx int not null, gy int not null, owner_id uuid references public.players (id) on delete cascade,
  at timestamptz not null default now(), until timestamptz not null, scrubbed_by uuid references public.players (id) on delete set null, scrubbed_at timestamptz,
  primary key (lev_id, gx, gy));
create index if not exists leviathan_trampled_cell on public.leviathan_trampled (gx, gy, until);
create index if not exists leviathan_trampled_owner on public.leviathan_trampled (owner_id);
create index if not exists leviathan_trampled_scrubber on public.leviathan_trampled (scrubbed_by);
alter table public.leviathan_trampled enable row level security;
revoke all on public.leviathan_trampled from anon, authenticated;

create table if not exists public.leviathan_bones (
  id bigint generated always as identity primary key,
  lev_id uuid not null references public.leviathans (id) on delete cascade,
  gen int not null, lng double precision not null, lat double precision not null, fallen_at timestamptz not null default now(),
  place text, players int not null default 0, top_name text, hp_max bigint);
create index if not exists leviathan_bones_lev on public.leviathan_bones (lev_id);
alter table public.leviathan_bones enable row level security;
revoke all on public.leviathan_bones from anon, authenticated;

-- ---- geography --------------------------------------------------------------------------------------------------------
/** real seas it can rise from (and flee to): a point just offshore, and how to say it */
create or replace function private.lev_seas() returns table (name text, lng double precision, lat double precision) language sql immutable as $$
  values ('off the coast of Oregon', -125.2, 44.6), ('off the coast of Northern California', -124.4, 38.6), ('off the coast of Southern California', -119.2, 33.4),
         ('off the coast of Washington', -125.4, 47.6), ('in the Gulf of Mexico, off Texas', -95.0, 28.2), ('in the Gulf of Mexico, off Louisiana', -90.5, 28.6),
         ('off the coast of Florida', -79.6, 27.2), ('off the Florida Gulf Coast', -83.5, 27.6), ('off the coast of the Carolinas', -76.2, 34.0),
         ('off the coast of New Jersey', -73.6, 39.6), ('off the coast of Massachusetts', -69.6, 42.0), ('off the coast of British Columbia', -127.0, 49.5),
         ('off Nova Scotia', -63.0, 43.6), ('off the Pacific coast of Mexico', -106.0, 20.0), ('off the coast of Rio de Janeiro', -43.2, -23.4),
         ('in the Río de la Plata, off Buenos Aires', -57.0, -35.2), ('in the North Sea, off England', 2.2, 53.0), ('in the Irish Sea', -5.2, 53.6),
         ('in the Bay of Biscay', -3.5, 45.5), ('off the coast of Portugal', -9.9, 39.0), ('in the Mediterranean, off Italy', 12.0, 40.5),
         ('in the Aegean Sea', 25.0, 38.5), ('in the Baltic Sea', 18.5, 56.5), ('off the coast of Nigeria', 3.8, 5.8), ('off the Cape of Good Hope', 18.2, -34.6),
         ('off the coast of Kenya', 40.5, -3.8), ('in the Arabian Sea, off Mumbai', 72.2, 18.8), ('in the Bay of Bengal', 88.5, 20.5),
         ('off the coast of Japan', 139.9, 34.6), ('off the coast of Korea', 129.6, 35.0), ('in the South China Sea, off Hong Kong', 114.3, 22.0),
         ('off the coast of the Philippines', 120.5, 14.4), ('in the Java Sea, off Jakarta', 106.8, -5.8), ('off the coast of Sydney', 151.6, -33.9),
         ('off the coast of Perth', 115.4, -32.0), ('off the coast of New Zealand', 175.0, -36.5)
$$;

create or replace function private.lev_km(p_a jsonb, p_b jsonb) returns double precision language sql immutable as $$
  select private.haversine_m((p_a ->> 0)::float8, (p_a ->> 1)::float8, (p_b ->> 0)::float8, (p_b ->> 1)::float8) / 1000
$$;
create or replace function private.lev_path_km(p_path jsonb) returns numeric language sql immutable as $$
  select coalesce(sum(private.lev_km(p_path -> (i - 1), p_path -> i)), 0)::numeric from generate_series(1, jsonb_array_length(p_path) - 1) i
$$;
/** the cell under a point */
create or replace function private.lev_cell(p_lng double precision, p_lat double precision) returns int[] language sql immutable as $$
  select array[least(4194303, greatest(0, floor((p_lng + 180) / 360 * 4194304)::int)),
               least(4194303, greatest(0, floor((1 - ln(tan(radians(p_lat)) + 1 / cos(radians(p_lat))) / pi()) / 2 * 4194304)::int))]
$$;
create or replace function private.lev_city_pt(c public.world_cities) returns jsonb language sql immutable as $$
  select jsonb_build_array(round(private.lng_of(c.gx + 0.5)::numeric, 5), round(private.lat_of(c.gy + 0.5)::numeric, 5))
$$;
/** a name for where it is now: the nearest city, or the open sea */
create or replace function private.lev_place(p_lng double precision, p_lat double precision) returns text language sql stable as $$
  select coalesce((select case when d < 30 then 'in ' else 'near ' end || x.name || coalesce(', ' || x.state, '')
                     from (select c.name, c.state, private.haversine_m(p_lng, p_lat, private.lng_of(c.gx + 0.5), private.lat_of(c.gy + 0.5)) / 1000 d
                             from public.world_cities c
                            where private.lat_of(c.gy + 0.5) between p_lat - 1.5 and p_lat + 1.5) x
                    where x.d < 120 order by x.d limit 1), 'over open country')
$$;

/** where it is at a moment: {lng, lat, km, heading, done} — walking time stops while it's paused */
create or replace function private.lev_pos(l public.leviathans, t timestamptz) returns jsonb language plpgsql stable as $$
declare v_res timestamptz := greatest(l.walk_at, coalesce(l.pause_until, l.walk_at)); v_prog numeric; v_km numeric; v_acc numeric := 0; v_seg numeric; i int; a jsonb; b jsonb; f numeric;
  n int := jsonb_array_length(l.path);
begin
  v_prog := l.walk_s + greatest(0, extract(epoch from t - v_res));
  v_km := v_prog / 3600 * l.speed_kmh;
  for i in 0 .. n - 2 loop
    a := l.path -> i; b := l.path -> (i + 1);
    v_seg := private.lev_km(a, b);
    if v_acc + v_seg >= v_km then
      f := case when v_seg > 0 then (v_km - v_acc) / v_seg else 0 end;
      return jsonb_build_object('lng', round(((a ->> 0)::numeric + ((b ->> 0)::numeric - (a ->> 0)::numeric) * f), 5),
                                'lat', round(((a ->> 1)::numeric + ((b ->> 1)::numeric - (a ->> 1)::numeric) * f), 5),
                                'km', round(v_km, 2), 'seg', i, 'heading', degrees(atan2((b ->> 0)::float8 - (a ->> 0)::float8, (b ->> 1)::float8 - (a ->> 1)::float8)),
                                'done', false, 'paused', t < v_res);
    end if;
    v_acc := v_acc + v_seg;
  end loop;
  return jsonb_build_object('lng', (l.path -> (n - 1) ->> 0)::numeric, 'lat', (l.path -> (n - 1) ->> 1)::numeric, 'km', round(v_acc, 2), 'seg', n - 2, 'heading', 0, 'done', true, 'paused', false);
end $$;

/** fold the walk so far into walk_s (before a pause or a new path) */
create or replace function private.lev_fold(p_id uuid) returns public.leviathans language plpgsql as $$
declare l public.leviathans; v_res timestamptz;
begin
  select * into l from public.leviathans where id = p_id;
  v_res := greatest(l.walk_at, coalesce(l.pause_until, l.walk_at));
  if now() > v_res then
    update public.leviathans set walk_s = walk_s + extract(epoch from now() - v_res), walk_at = now() where id = p_id returning * into l;
  end if;
  return l;
end $$;
create or replace function private.lev_pause(p_id uuid, p_secs numeric) returns void language plpgsql as $$
declare l public.leviathans;
begin
  l := private.lev_fold(p_id);
  -- (pauses stack, but never more than 30 minutes ahead)
  update public.leviathans set pause_until = least(now() + interval '30 minutes', greatest(coalesce(pause_until, now()), now()) + make_interval(secs => p_secs::double precision)) where id = p_id;
end $$;
/** turn it: a new path from where it stands now */
create or replace function private.lev_turn(p_id uuid, p_to jsonb, p_speed_mult numeric, p_status text) returns public.leviathans language plpgsql as $$
declare l public.leviathans; p jsonb; v_path jsonb;
begin
  l := private.lev_fold(p_id);
  p := private.lev_pos(l, now());
  v_path := jsonb_build_array(jsonb_build_array(p -> 'lng', p -> 'lat')) || p_to;
  update public.leviathans set path = v_path, path_km = private.lev_path_km(v_path), speed_kmh = speed_kmh * p_speed_mult, walk_s = 0, walk_at = now(),
                               trampled_km = 0, status = p_status, roar_at = now()
   where id = p_id returning * into l;
  return l;
end $$;
create or replace function private.lev_nearest_sea(p_lng double precision, p_lat double precision, p_not text default null) returns jsonb language sql stable as $$
  select jsonb_build_object('name', s.name, 'pt', jsonb_build_array(s.lng, s.lat))
  from private.lev_seas() s where p_not is null or s.name <> p_not
  order by private.haversine_m(p_lng, p_lat, s.lng, s.lat) limit 1
$$;

/** a route: offshore → a real coastal city → inland through real cities (towards players) → back to the nearest sea */
create or replace function private.lev_route() returns jsonb language plpgsql volatile as $$
declare v_homes jsonb; s record; v_w numeric; v_tot numeric := 0; v_pick numeric; v_cands jsonb := '[]'::jsonb; c public.world_cities; v_cur jsonb; v_prev jsonb;
  v_path jsonb; v_seen int[] := '{}'; i int; v_next record; v_start jsonb; v_exit jsonb; v_names text[] := '{}';
begin
  -- one home spot per active player
  select coalesce(jsonb_agg(jsonb_build_array(private.lng_of(w.gx + 0.5), private.lat_of(w.gy + 0.5))), '[]'::jsonb) into v_homes
    from (select distinct on (wp.owner_id) wp.gx, wp.gy from public.world_plots wp join public.players p on p.id = wp.owner_id
           where p.status = 'active' and p.last_active_at > now() - interval '14 days' order by wp.owner_id, wp.claimed_at limit 3000) w;
  -- a sea near players (weighted), else anywhere
  for s in select x.name, x.lng, x.lat, (select count(*) from jsonb_array_elements(v_homes) h
                                         where private.haversine_m(x.lng, x.lat, (h ->> 0)::float8, (h ->> 1)::float8) < 2500000) n from private.lev_seas() x loop
    v_w := power(s.n, 1.5) + 0.05;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('name', s.name, 'pt', jsonb_build_array(s.lng, s.lat), 'w', v_w));
    v_tot := v_tot + v_w;
  end loop;
  v_pick := random() * v_tot; v_tot := 0;
  for i in 0 .. jsonb_array_length(v_cands) - 1 loop
    v_tot := v_tot + (v_cands -> i ->> 'w')::numeric;
    if v_pick <= v_tot then v_start := v_cands -> i; exit; end if;
  end loop;
  v_start := coalesce(v_start, v_cands -> 0);
  v_path := jsonb_build_array(v_start -> 'pt');
  v_prev := v_start -> 'pt';
  -- landfall: the biggest city close to that sea
  select * into c from public.world_cities x
   where private.haversine_m((v_prev ->> 0)::float8, (v_prev ->> 1)::float8, private.lng_of(x.gx + 0.5), private.lat_of(x.gy + 0.5)) < 450000
   order by x.pop desc limit 1;
  if c.id is null then
    select * into c from public.world_cities x order by private.haversine_m((v_prev ->> 0)::float8, (v_prev ->> 1)::float8, private.lng_of(x.gx + 0.5), private.lat_of(x.gy + 0.5)) limit 1;
  end if;
  v_cur := private.lev_city_pt(c); v_path := v_path || jsonb_build_array(v_cur); v_seen := v_seen || c.id; v_names := v_names || c.name;
  -- inland: city to city, never doubling back, drawn to big cities and to players
  for i in 1 .. 7 loop
    select x.id, x.name, jsonb_build_array(round(private.lng_of(x.gx + 0.5)::numeric, 5), round(private.lat_of(x.gy + 0.5)::numeric, 5)) pt into v_next from (
      select w.*, private.haversine_m((v_cur ->> 0)::float8, (v_cur ->> 1)::float8, private.lng_of(w.gx + 0.5), private.lat_of(w.gy + 0.5)) / 1000 d,
             cos(radians(degrees(atan2(private.lng_of(w.gx + 0.5) - (v_cur ->> 0)::float8, private.lat_of(w.gy + 0.5) - (v_cur ->> 1)::float8))
                         - degrees(atan2((v_cur ->> 0)::float8 - (v_prev ->> 0)::float8, (v_cur ->> 1)::float8 - (v_prev ->> 1)::float8)))) dir
        from public.world_cities w
       where w.pop >= 80000 and not w.id = any(v_seen)
         and private.lat_of(w.gy + 0.5) between (v_cur ->> 1)::float8 - 5 and (v_cur ->> 1)::float8 + 5) x
     where x.d between 120 and 480 and x.dir > 0.2
     order by ln(x.pop) + 1.6 * ln(1 + (select count(*) from jsonb_array_elements(v_homes) h
                                         where private.haversine_m(private.lng_of(x.gx + 0.5), private.lat_of(x.gy + 0.5), (h ->> 0)::float8, (h ->> 1)::float8) < 300000)) + random() * 1.5 desc
     limit 1;
    exit when v_next.id is null;
    v_prev := v_cur; v_cur := v_next.pt;
    v_path := v_path || jsonb_build_array(v_cur); v_seen := v_seen || v_next.id; v_names := v_names || v_next.name;
  end loop;
  -- and back to the sea (another one, if there's one close enough)
  v_exit := private.lev_nearest_sea((v_cur ->> 0)::float8, (v_cur ->> 1)::float8, v_start ->> 'name');
  if v_exit is null or private.lev_km(v_cur, v_exit -> 'pt') > 2500 then v_exit := v_start; end if;
  v_path := v_path || jsonb_build_array(v_exit -> 'pt');
  return jsonb_build_object('path', v_path, 'sea', v_start ->> 'name', 'exit', v_exit ->> 'name', 'cities', to_jsonb(v_names));
end $$;

/** the live feed is about players: a Leviathan moment is posted under the player who made it (none: not posted) */
create or replace function private.lev_feed(p_player uuid, p_data jsonb) returns void language sql as $$
  insert into public.feed_events (kind, player_id, data) select 'leviathan', p_player, p_data where p_player is not null
$$;

create or replace function private.lev_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('leviathan'), '{}'::jsonb) $$;
create or replace function private.lev_n(p_key text, p_def numeric) returns numeric language sql stable as $$ select coalesce((private.lev_cfg() ->> p_key)::numeric, p_def) $$;

/** when the next one rises (by the schedule) */
create or replace function private.lev_next_at() returns timestamptz language plpgsql stable as $$
declare v_last timestamptz; v_from timestamptz; v_day int := private.lev_n('weekday', 6)::int; v_hour int := private.lev_n('hour_utc', 17)::int; t timestamptz; i int;
begin
  select max(spawned_at) into v_last from public.leviathans;
  v_from := greatest(now(), coalesce(v_last + make_interval(days => greatest(1, private.lev_n('every_days', 7)::int) - 1), now()));
  for i in 0 .. 14 loop
    t := date_trunc('day', v_from at time zone 'UTC') at time zone 'UTC' + make_interval(days => i, hours => v_hour) - make_interval(mins => private.lev_n('warn_min', 60)::int);
    if extract(dow from (t + make_interval(mins => private.lev_n('warn_min', 60)::int)) at time zone 'UTC') = v_day and t >= v_from - interval '1 minute'
       and (v_last is null or t > v_last + interval '1 day') then return t; end if;
  end loop;
  return v_from + interval '7 days';
end $$;

/** a new Leviathan: the warning goes out now, it rises after the warning */
create or replace function private.lev_spawn(p_warn_min numeric default null) returns public.leviathans language plpgsql as $$
declare r jsonb; l public.leviathans; v_last public.leviathans; v_str numeric := 1; v_n int; v_hp bigint; v_warn numeric := coalesce(p_warn_min, private.lev_n('warn_min', 60)); v_km numeric; u record;
begin
  select * into v_last from public.leviathans order by spawned_at desc limit 1;
  if v_last.id is not null and v_last.status = 'escaped' then v_str := v_last.strength + private.lev_n('strength_step', 0.5); end if;
  r := private.lev_route();
  v_km := private.lev_path_km(r -> 'path');
  select count(*) into v_n from public.players where status = 'active' and last_active_at > now() - interval '7 days';
  v_hp := round(greatest(private.lev_n('hp_min', 60000), v_n * private.lev_n('hp_per_player', 2500)) * v_str);
  insert into public.leviathans (gen, status, strength, hp_max, hp, path, path_km, speed_kmh, walk_at, rise_at, origin, exit_sea, place, data)
  values (coalesce(v_last.gen, 0) + 1, 'warning', v_str, v_hp, v_hp, r -> 'path', v_km, greatest(v_km / greatest(private.lev_n('walk_hours', 48), 1), 5),
          now() + make_interval(mins => v_warn::int), now() + make_interval(mins => v_warn::int), r ->> 'sea', r ->> 'exit', r ->> 'sea',
          jsonb_build_object('cities', r -> 'cities'))
  returning * into l;
  perform private.lev_feed(null, jsonb_build_object('sub', 'warning', 'where', l.origin, 'gen', l.gen, 'rise_at', l.rise_at, 'strength', l.strength));
  -- everyone is told
  for u in select id from public.players where status = 'active' and last_active_at > now() - interval '30 days' loop
    perform private.notify(u.id, 'leviathan', null, jsonb_build_object('sub', 'warning', 'where', l.origin, 'rise_at', l.rise_at, 'gen', l.gen, 'strength', l.strength));
  end loop;
  return l;
end $$;

/** loot for everyone who fought it */
create or replace function private.lev_loot(l public.leviathans, p_fell boolean) returns void language plpgsql as $$
declare v_tot numeric; v_pool numeric := l.hp_max / greatest(private.lev_n('loot_pool_div', 100), 1); p record; v_ink int; v_paid int; v_top int; v_loot jsonb; v_lk jsonb; v_tk uuid; v_n int;
begin
  select coalesce(sum(dmg), 0), count(*) into v_tot, v_n from public.leviathan_players where lev_id = l.id and dmg > 0;
  v_top := greatest(1, ceil(v_n * 0.1)::int);
  for p in select lp.*, row_number() over (order by lp.dmg desc) rk from public.leviathan_players lp where lp.lev_id = l.id and lp.dmg > 0 loop
    v_tk := null;
    if p_fell then
      v_ink := least(private.lev_n('loot_cap', 1500), private.lev_n('loot_base', 25) + round(v_pool * p.dmg / greatest(v_tot, 1)))::int;
      v_loot := jsonb_build_object('fell', true, 'rank', p.rk, 'share', round(p.dmg * 100.0 / greatest(v_tot, 1), 2));
      if p.dmg >= v_tot * 0.01 then v_lk := private.ench_give_luck(p.player_id, 0, 1); v_loot := v_loot || jsonb_build_object('enchant', 1); end if;
      if p.rk = 1 then v_tk := private.ench_ticket(p.player_id, 'legendary', 'leviathan'); v_loot := v_loot || jsonb_build_object('ticket', 'legendary');
      elsif p.rk <= v_top then v_tk := private.ench_ticket(p.player_id, 'epic', 'leviathan'); v_loot := v_loot || jsonb_build_object('ticket', 'epic'); end if;
    else
      v_ink := 10;
      v_loot := jsonb_build_object('fell', false, 'rank', p.rk, 'share', round(p.dmg * 100.0 / greatest(v_tot, 1), 2));
    end if;
    v_paid := private.grant_ink_paced(p.player_id, v_ink, 'leviathan', 'leviathan', l.id::text, 'lev:' || l.id || ':' || p.player_id);
    v_loot := v_loot || jsonb_build_object('ink', v_paid);
    update public.leviathan_players set loot = v_loot where lev_id = l.id and player_id = p.player_id;
    perform private.notify(p.player_id, 'leviathan', null, jsonb_build_object('sub', case when p_fell then 'fallen' else 'escaped' end, 'gen', l.gen) || v_loot);
  end loop;
end $$;

create or replace function private.lev_fall(p_id uuid) returns void language plpgsql as $$
declare l public.leviathans; p jsonb; v_top text; v_n int;
begin
  select * into l from public.leviathans where id = p_id for update;
  if l.status not in ('walking', 'enraged', 'fleeing') then return; end if;
  p := private.lev_pos(l, now());
  select pr.username into v_top from public.leviathan_players lp join public.profiles pr on pr.id = lp.player_id where lp.lev_id = l.id order by lp.dmg desc limit 1;
  select count(*) into v_n from public.leviathan_players where lev_id = l.id and dmg > 0;
  update public.leviathans set status = 'fallen', ended_at = now(), hp = 0, place = private.lev_place((p ->> 'lng')::float8, (p ->> 'lat')::float8),
                               data = data || jsonb_build_object('fallen_at', p) where id = l.id returning * into l;
  insert into public.leviathan_bones (lev_id, gen, lng, lat, place, players, top_name, hp_max)
  values (l.id, l.gen, (p ->> 'lng')::float8, (p ->> 'lat')::float8, l.place, v_n, v_top, l.hp_max);
  perform private.lev_feed((select lp.player_id from public.leviathan_players lp where lp.lev_id = l.id order by lp.dmg desc limit 1), jsonb_build_object('sub', 'fallen', 'gen', l.gen, 'place', l.place, 'players', v_n, 'top', v_top));
  perform private.lev_loot(l, true);
end $$;

create or replace function private.lev_escape(p_id uuid) returns void language plpgsql as $$
declare l public.leviathans;
begin
  select * into l from public.leviathans where id = p_id for update;
  if l.status not in ('walking', 'enraged', 'fleeing') then return; end if;
  update public.leviathans set status = 'escaped', ended_at = now() where id = l.id returning * into l;
  perform private.lev_feed(null, jsonb_build_object('sub', 'escaped', 'gen', l.gen, 'sea', l.exit_sea, 'hp', l.hp, 'hp_max', l.hp_max));
  perform private.lev_loot(l, false);
end $$;

/** the heartbeat (every minute by pg_cron, and on demand): rise, trample, be blocked by giants, reach the sea */
create or replace function private.leviathan_tick() returns jsonb language plpgsql as $$
declare l public.leviathans; p jsonb; v_from numeric; v_to numeric; v_step numeric := 1.5; k numeric; v_pt jsonb; v_r numeric := private.lev_n('trample_km', 1.2);
  v_cm numeric; v_dc int; v_c int[]; v_new int := 0; v_n int; g record; v_dmg bigint; f numeric; i int; a jsonb; b jsonb; v_acc numeric; v_seg numeric; x record;
begin
  if not pg_try_advisory_xact_lock(hashtext('landvas_leviathan_tick')) then return jsonb_build_object('busy', true); end if;
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  if l.id is null then
    if coalesce((private.lev_cfg() ->> 'enabled')::boolean, true) and now() >= private.lev_next_at() then
      l := private.lev_spawn(null);
      return jsonb_build_object('spawned', l.id);
    end if;
    return jsonb_build_object('idle', true);
  end if;
  if l.status = 'warning' then
    if now() < l.rise_at then update public.leviathans set last_tick = now() where id = l.id; return jsonb_build_object('warning', true); end if;
    update public.leviathans set status = 'walking', roar_at = now() where id = l.id returning * into l;
    perform private.lev_feed(null, jsonb_build_object('sub', 'risen', 'where', l.origin, 'gen', l.gen));
  end if;
  p := private.lev_pos(l, now());
  -- trample the plots along the way since the last beat (a sample every 1.5 km, up to 200 a beat)
  v_from := l.trampled_km; v_to := (p ->> 'km')::numeric;
  if v_to > v_from + 0.2 then
    k := v_from; i := 0;
    while k <= v_to and i < 200 loop
      -- the point k km along the current leg
      v_acc := 0; v_pt := null;
      for x in select o - 1 j from generate_series(1, jsonb_array_length(l.path) - 1) o loop
        a := l.path -> x.j; b := l.path -> (x.j + 1); v_seg := private.lev_km(a, b);
        if v_acc + v_seg >= k then f := case when v_seg > 0 then (k - v_acc) / v_seg else 0 end;
          v_pt := jsonb_build_array((a ->> 0)::numeric + ((b ->> 0)::numeric - (a ->> 0)::numeric) * f, (a ->> 1)::numeric + ((b ->> 1)::numeric - (a ->> 1)::numeric) * f); exit; end if;
        v_acc := v_acc + v_seg;
      end loop;
      exit when v_pt is null;
      v_cm := 40075016.7 / 4194304 * cos(radians((v_pt ->> 1)::float8));
      v_dc := ceil(v_r * 1000 / greatest(v_cm, 0.5))::int;
      v_c := private.lev_cell((v_pt ->> 0)::float8, (v_pt ->> 1)::float8);
      with ins as (
        insert into public.leviathan_trampled (lev_id, gx, gy, owner_id, until)
        select l.id, w.gx, w.gy, w.owner_id, now() + make_interval(hours => private.lev_n('trample_hours', 2)::int)
          from public.world_plots w
         where w.owner_id is not null and w.gx between v_c[1] - v_dc and v_c[1] + v_dc and w.gy between v_c[2] - v_dc and v_c[2] + v_dc
           and ((w.gx - v_c[1]) ^ 2 + (w.gy - v_c[2]) ^ 2) <= v_dc ^ 2
         limit 400
        on conflict (lev_id, gx, gy) do nothing returning owner_id)
      select count(*) into v_n from ins;
      v_new := v_new + v_n;
      k := k + v_step; i := i + 1;
    end loop;
    if v_new > 0 then
      for x in select distinct t.owner_id from public.leviathan_trampled t where t.lev_id = l.id and t.at > now() - interval '5 seconds'
                and not exists (select 1 from public.player_notifications n where n.player_id = t.owner_id and n.kind = 'leviathan' and n.data ->> 'sub' = 'trampled' and n.data ->> 'gen' = l.gen::text) loop
        perform private.notify(x.owner_id, 'leviathan', null, jsonb_build_object('sub', 'trampled', 'gen', l.gen, 'place', private.lev_place((p ->> 'lng')::float8, (p ->> 'lat')::float8)));
      end loop;
    end if;
    update public.leviathans set trampled_km = least(v_to, k) where id = l.id;
  end if;
  -- a giant plot in its way stops it (once each), and lands a blow
  for g in select b.gx, b.gy, b.player_id, pr.username from public.enchant_buffs b join public.profiles pr on pr.id = b.player_id
            where b.kind = 'plot_giant' and b.expires_at > now() and not l.blocked @> jsonb_build_array(jsonb_build_array(b.gx, b.gy))
              and not coalesce((b.data ->> 'prank')::boolean, false) -- (a prank giant is only for show: it can't stop a Leviathan)
              and private.haversine_m((p ->> 'lng')::float8, (p ->> 'lat')::float8, private.lng_of(b.gx + 0.5), private.lat_of(b.gy + 0.5)) < private.lev_n('block_km', 3) * 1000
            limit 3 loop
    v_dmg := greatest(2000, round(l.hp_max * 0.02));
    perform private.lev_pause(l.id, private.lev_n('block_min', 20) * 60);
    update public.leviathans set blocked = blocked || jsonb_build_array(jsonb_build_array(g.gx, g.gy)), hp = greatest(1, hp - v_dmg) where id = l.id;
    insert into public.leviathan_players (lev_id, player_id, dmg, hits) values (l.id, g.player_id, v_dmg, 1)
    on conflict (lev_id, player_id) do update set dmg = public.leviathan_players.dmg + v_dmg, hits = public.leviathan_players.hits + 1;
    insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, g.player_id, 'giant', 'a giant plot stood in its way', '📡', v_dmg);
    perform private.notify(g.player_id, 'leviathan', null, jsonb_build_object('sub', 'blocked', 'gen', l.gen, 'dmg', v_dmg));
  end loop;
  select * into l from public.leviathans where id = l.id;
  p := private.lev_pos(l, now());
  -- the ink trail (a point every few km)
  if jsonb_array_length(l.trail) = 0 or private.lev_km(l.trail -> (jsonb_array_length(l.trail) - 1), jsonb_build_array(p -> 'lng', p -> 'lat')) > 3 then
    update public.leviathans set trail = case when jsonb_array_length(trail) >= 600 then (trail - 0) else trail end || jsonb_build_array(jsonb_build_array(p -> 'lng', p -> 'lat')) where id = l.id;
  end if;
  update public.leviathans set place = private.lev_place((p ->> 'lng')::float8, (p ->> 'lat')::float8), last_tick = now() where id = l.id;
  -- the end of the road is the sea
  if (p ->> 'done')::boolean then perform private.lev_escape(l.id); return jsonb_build_object('escaped', l.id); end if;
  return jsonb_build_object('tick', l.id, 'pos', p, 'trampled', v_new);
end $$;

/** at half health it's enraged and turns on the biggest plots near it; at 10% it runs for the sea */
create or replace function private.lev_phase(p_id uuid) returns void language plpgsql as $$
declare l public.leviathans; p jsonb; t record; v_sea jsonb; v_to jsonb;
begin
  select * into l from public.leviathans where id = p_id;
  p := private.lev_pos(l, now());
  if l.status in ('walking', 'enraged') and l.hp <= l.hp_max * 0.1 then
    v_sea := private.lev_nearest_sea((p ->> 'lng')::float8, (p ->> 'lat')::float8);
    l := private.lev_turn(l.id, jsonb_build_array(v_sea -> 'pt'), 1.6, 'fleeing');
    update public.leviathans set exit_sea = v_sea ->> 'name' where id = l.id;
    perform private.lev_feed(null, jsonb_build_object('sub', 'fleeing', 'gen', l.gen, 'sea', v_sea ->> 'name'));
  elsif l.status = 'walking' and l.hp <= l.hp_max * 0.5 then
    -- a giant first, else the rarest plots around
    select b.gx, b.gy, pr.username, true giant into t from public.enchant_buffs b join public.profiles pr on pr.id = b.player_id
     where b.kind = 'plot_giant' and b.expires_at > now() and not coalesce((b.data ->> 'prank')::boolean, false)
       and private.haversine_m((p ->> 'lng')::float8, (p ->> 'lat')::float8, private.lng_of(b.gx + 0.5), private.lat_of(b.gy + 0.5)) < 1500000
     order by private.haversine_m((p ->> 'lng')::float8, (p ->> 'lat')::float8, private.lng_of(b.gx + 0.5), private.lat_of(b.gy + 0.5)) limit 1;
    if t.gx is null then
      select w.gx, w.gy, pr.username, false giant into t from public.world_plots w join public.plot_rarities r on r.id = w.rarity join public.profiles pr on pr.id = w.owner_id
       where w.owner_id is not null
         and w.gx between (private.lev_cell((p ->> 'lng')::float8, (p ->> 'lat')::float8))[1] - 90000 and (private.lev_cell((p ->> 'lng')::float8, (p ->> 'lat')::float8))[1] + 90000
         and w.gy between (private.lev_cell((p ->> 'lng')::float8, (p ->> 'lat')::float8))[2] - 90000 and (private.lev_cell((p ->> 'lng')::float8, (p ->> 'lat')::float8))[2] + 90000
       order by r.sort desc, random() limit 1;
    end if;
    if t.gx is not null then
      v_to := jsonb_build_array(round(private.lng_of(t.gx + 0.5)::numeric, 5), round(private.lat_of(t.gy + 0.5)::numeric, 5));
      v_sea := private.lev_nearest_sea((v_to ->> 0)::float8, (v_to ->> 1)::float8);
      l := private.lev_turn(l.id, jsonb_build_array(v_to, v_sea -> 'pt'), 1.25, 'enraged');
      update public.leviathans set exit_sea = v_sea ->> 'name', data = data || jsonb_build_object('target', jsonb_build_object('gx', t.gx, 'gy', t.gy, 'owner_name', t.username, 'giant', t.giant)) where id = l.id;
    else
      update public.leviathans set status = 'enraged', roar_at = now() where id = l.id;
    end if;
    perform private.lev_feed(null, jsonb_build_object('sub', 'enraged', 'gen', l.gen, 'target', t.username, 'giant', coalesce(t.giant, false)));
  end if;
end $$;

-- ---- the fight ----------------------------------------------------------------------------------------------------------
/** what each enchantment does to it: [move name, damage factor (lo, hi), effect] */
create or replace function private.lev_move(p_kind text) returns jsonb language sql immutable as $$
  select (('{"goose": ["Egg Bomb", 1.0, 1.0, null], "genie": ["Wish of Ruin", 0.4, 2.4, null], "map": ["Buried Cannon", 1.1, 1.1, null],
            "parasite": ["Leech", 1.0, 1.0, null], "cuckoo": ["Decoy Egg", 0.6, 0.6, "decoy"], "pandora": ["Unleash an Evil", 0.5, 2.0, null],
            "splice": ["Chimera Strike", 1.3, 1.3, null], "clockwork": ["Freeze Time", 0.4, 0.4, "freeze"], "sizeray": ["Shrink Ray", 0.4, 0.4, "shrink"],
            "shard": ["Reflect the Roar", 1.2, 1.2, null], "wormhole": ["Pull Through", 0.6, 0.6, "pull"], "oracle": ["Foretell the Weak Spot", 0.4, 0.4, "foretell"]}'::jsonb) -> p_kind)
$$;
create or replace function private.lev_mult(l public.leviathans) returns numeric language sql stable as $$
  select (case when l.shrunk_until > now() then 1.5 else 1 end) * (case when l.foretold_until > now() then 1.25 else 1 end)
$$;

create or replace function public.leviathan_hit(p_move text, p_n int default 1, p_enchant uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); l public.leviathans; lp public.leviathan_players; v_bank numeric; v_n int; v_dmg bigint := 0; i int; e public.enchantments;
  m jsonb; v_lab text; v_emoji text := '💣'; v_cd numeric := private.lev_n('move_cd_h', 3) * 3600; v_eff text; v_before bigint; v_name text; v_p jsonb;
begin
  perform private.rate_limit('leviathan_hit', 1500, 3600);
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  if l.id is null then raise exception 'no_leviathan' using errcode = 'P0001'; end if;
  if l.status = 'warning' then raise exception 'not_risen' using errcode = 'P0001'; end if;
  insert into public.leviathan_players (lev_id, player_id, bombs, bombs_at) values (l.id, v_uid, private.lev_n('bombs_max', 60), now()) on conflict do nothing;
  select * into lp from public.leviathan_players where lev_id = l.id and player_id = v_uid for update;
  if p_move = 'bomb' then
    v_bank := least(private.lev_n('bombs_max', 60), lp.bombs + extract(epoch from now() - lp.bombs_at) / greatest(private.lev_n('bomb_regen_s', 60), 1));
    v_n := least(greatest(coalesce(p_n, 1), 1), 10, floor(v_bank)::int);
    if v_n < 1 then raise exception 'no_bombs' using errcode = 'P0001'; end if;
    for i in 1 .. v_n loop v_dmg := v_dmg + 80 + floor(random() * 41)::int; end loop;
    v_dmg := round(v_dmg * private.lev_mult(l));
    update public.leviathan_players set bombs = v_bank - v_n, bombs_at = now() where lev_id = l.id and player_id = v_uid;
    v_lab := case when v_n = 1 then 'an ink bomb' else v_n || ' ink bombs' end;
  elsif p_move = 'enchant' then
    select * into e from public.enchantments where id = p_enchant and owner_id = v_uid and status = 'active';
    if e.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
    if coalesce((lp.moves ->> e.id::text)::numeric, 0) + v_cd > extract(epoch from now()) then raise exception 'too_soon' using errcode = 'P0001'; end if;
    m := private.lev_move(e.kind);
    v_dmg := round((2500 + 400 * e.level) * ((m ->> 1)::numeric + random() * ((m ->> 2)::numeric - (m ->> 1)::numeric)) * private.lev_mult(l));
    v_eff := m ->> 3;
    case v_eff
      when 'freeze' then perform private.lev_pause(l.id, 600);
      when 'decoy' then perform private.lev_pause(l.id, 300);
      when 'pull' then perform private.lev_pause(l.id, 300);
      when 'shrink' then update public.leviathans set shrunk_until = greatest(coalesce(shrunk_until, now()), now()) + interval '10 minutes' where id = l.id;
      when 'foretell' then update public.leviathans set foretold_until = greatest(coalesce(foretold_until, now()), now()) + interval '10 minutes' where id = l.id;
      else null;
    end case;
    update public.leviathan_players set moves = moves || jsonb_build_object(e.id::text, extract(epoch from now())) where lev_id = l.id and player_id = v_uid;
    v_p := private.ench_partner(e.id);
    v_name := coalesce(v_p ->> 'hybrid', e.nickname, (private.ench_info(e.kind) ->> 'name'));
    v_lab := v_name || ' · ' || (m ->> 0);
    v_emoji := private.ench_info(e.kind) ->> 'emoji';
    perform private.ench_xp(e.id, 1);
    perform private.ench_event(e.id, 'leviathan', jsonb_build_object('move', m ->> 0, 'dmg', v_dmg));
  else raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  select * into l from public.leviathans where id = l.id for update;
  v_before := l.hp;
  v_dmg := least(v_dmg, l.hp);
  update public.leviathans set hp = hp - v_dmg where id = l.id returning * into l;
  update public.leviathan_players set dmg = dmg + v_dmg, hits = hits + 1 where lev_id = l.id and player_id = v_uid;
  insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, v_uid, p_move, v_lab, v_emoji, v_dmg);
  -- (the feed keeps its last 400 hits)
  if random() < 0.02 then delete from public.leviathan_hits where lev_id = l.id and id < (select id from public.leviathan_hits where lev_id = l.id order by id desc offset 400 limit 1); end if;
  if l.hp <= 0 then perform private.lev_fall(l.id);
  elsif (v_before > l.hp_max * 0.5 and l.hp <= l.hp_max * 0.5) or (v_before > l.hp_max * 0.1 and l.hp <= l.hp_max * 0.1) then perform private.lev_phase(l.id);
  end if;
  return jsonb_build_object('dmg', v_dmg, 'effect', v_eff, 'label', v_lab, 'fell', l.hp <= 0) || public.leviathan_state(false);
end $$;

/** scrub the ink off a trampled plot (yours pays more; a neighbour's pays them a thank-you) */
create or replace function public.leviathan_scrub(p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); t public.leviathan_trampled; v_ink int;
begin
  perform private.rate_limit('leviathan_scrub', 200, 3600);
  select * into t from public.leviathan_trampled where gx = p_gx and gy = p_gy and until > now() and scrubbed_at is null order by at desc limit 1 for update;
  if t.lev_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.leviathan_trampled set scrubbed_by = v_uid, scrubbed_at = now() where lev_id = t.lev_id and gx = p_gx and gy = p_gy;
  v_ink := private.grant_ink_paced(v_uid, case when t.owner_id = v_uid then 12 else 6 end, 'leviathan', 'scrub', p_gx || ':' || p_gy, 'scrub:' || t.lev_id || ':' || p_gx || ':' || p_gy);
  if t.owner_id <> v_uid then
    perform private.grant_ink_paced(t.owner_id, 3, 'leviathan', 'scrubbed', p_gx || ':' || p_gy, 'scrubbed:' || t.lev_id || ':' || p_gx || ':' || p_gy);
    perform private.notify(t.owner_id, 'leviathan', v_uid, jsonb_build_object('sub', 'scrubbed', 'gx', p_gx, 'gy', p_gy));
  end if;
  return jsonb_build_object('scrubbed', true, 'ink', v_ink, 'balances', private.balances(v_uid));
end $$;

-- trampled plots' minigames pay 40% less until they're scrubbed
create or replace function private.ench_plot_mult_extra(p_uid uuid, p_gx int, p_gy int) returns numeric language sql stable as $$
  select case when exists (select 1 from public.leviathan_trampled where gx = p_gx and gy = p_gy and until > now() and scrubbed_at is null) then 0.6 else 1 end::numeric
$$;

/** everything a screen needs: where it is (the path to move it along), its health, the feed, the top fighters, you */
create or replace function public.leviathan_state(p_tick boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); l public.leviathans; v_last public.leviathans; lp public.leviathan_players; v_me jsonb; v_moves jsonb; v_bank numeric;
begin
  -- the heartbeat also beats when people look (no more than every 30 s)
  if p_tick then
    select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
    if (l.id is not null and (l.last_tick is null or l.last_tick < now() - interval '30 seconds')) or (l.id is null and now() >= private.lev_next_at()) then
      perform private.leviathan_tick();
    end if;
  end if;
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  select * into v_last from public.leviathans where status in ('fallen', 'escaped') order by ended_at desc nulls last limit 1;
  if v_uid is not null and l.id is not null then
    select * into lp from public.leviathan_players where lev_id = l.id and player_id = v_uid;
    v_bank := least(private.lev_n('bombs_max', 60), coalesce(lp.bombs, private.lev_n('bombs_max', 60)) + case when lp.lev_id is null then 0 else extract(epoch from now() - lp.bombs_at) / greatest(private.lev_n('bomb_regen_s', 60), 1) end);
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'serial', e.serial, 'level', e.level, 'sigil', e.sigil,
             'name', coalesce(private.ench_partner(e.id) ->> 'hybrid', e.nickname, (private.ench_info(e.kind) ->> 'name') || ' #' || e.serial),
             'move', private.lev_move(e.kind) ->> 0, 'effect', private.lev_move(e.kind) ->> 3,
             'dmg', round((2500 + 400 * e.level) * ((private.lev_move(e.kind) ->> 1)::numeric + (private.lev_move(e.kind) ->> 2)::numeric) / 2),
             'ready_in', greatest(0, round(coalesce((lp.moves ->> e.id::text)::numeric, 0) + private.lev_n('move_cd_h', 3) * 3600 - extract(epoch from now()))))
             order by e.born_at), '[]'::jsonb)
      into v_moves from public.enchantments e where e.owner_id = v_uid and e.status = 'active';
    v_me := jsonb_build_object('dmg', coalesce(lp.dmg, 0), 'hits', coalesce(lp.hits, 0), 'bombs', floor(v_bank), 'bombs_max', private.lev_n('bombs_max', 60),
      'bomb_regen_s', private.lev_n('bomb_regen_s', 60), 'next_bomb_in', case when v_bank < private.lev_n('bombs_max', 60) then round((1 - (v_bank - floor(v_bank))) * private.lev_n('bomb_regen_s', 60)) end,
      'moves', v_moves,
      'rank', case when coalesce(lp.dmg, 0) > 0 then (select count(*) + 1 from public.leviathan_players x where x.lev_id = l.id and x.dmg > lp.dmg) end,
      'trampled', (select count(*) from public.leviathan_trampled t where t.lev_id = l.id and t.owner_id = v_uid and t.until > now() and t.scrubbed_at is null));
  end if;
  return jsonb_build_object(
    'server_time', now(),
    'lev', case when l.id is not null then jsonb_build_object('id', l.id, 'gen', l.gen, 'status', l.status, 'strength', l.strength, 'hp', l.hp, 'hp_max', l.hp_max,
             'path', l.path, 'path_km', l.path_km, 'speed_kmh', l.speed_kmh, 'walk_s', l.walk_s, 'walk_at', l.walk_at, 'pause_until', l.pause_until,
             'rise_at', l.rise_at, 'spawned_at', l.spawned_at, 'origin', l.origin, 'exit_sea', l.exit_sea, 'place', l.place, 'trail', l.trail,
             'shrunk_until', l.shrunk_until, 'foretold_until', l.foretold_until, 'roar_at', l.roar_at, 'target', l.data -> 'target', 'cities', l.data -> 'cities',
             'pos', private.lev_pos(l, now()), 'fighters', (select count(*) from public.leviathan_players where lev_id = l.id and dmg > 0)) end,
    'feed', case when l.id is not null then coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', pr.username, 'label', h.label, 'emoji', h.emoji, 'dmg', h.dmg, 'at', h.created_at, 'move', h.move) order by h.id desc)
             from (select * from public.leviathan_hits where lev_id = l.id order by id desc limit 25) h left join public.profiles pr on pr.id = h.player_id), '[]'::jsonb) end,
    'top', case when l.id is not null then coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(x.player_id), 'dmg', x.dmg, 'me', x.player_id = v_uid) order by x.dmg desc)
             from (select * from public.leviathan_players where lev_id = l.id and dmg > 0 order by dmg desc limit 10) x), '[]'::jsonb) end,
    'me', v_me,
    'last', case when v_last.id is not null then jsonb_build_object('id', v_last.id, 'gen', v_last.gen, 'status', v_last.status, 'ended_at', v_last.ended_at, 'place', v_last.place,
             'hp', v_last.hp, 'hp_max', v_last.hp_max, 'strength', v_last.strength, 'exit_sea', v_last.exit_sea,
             'fighters', (select count(*) from public.leviathan_players where lev_id = v_last.id and dmg > 0),
             'top', (select jsonb_agg(jsonb_build_object('player', private.profile_json(x.player_id), 'dmg', x.dmg) order by x.dmg desc)
                      from (select * from public.leviathan_players where lev_id = v_last.id and dmg > 0 order by dmg desc limit 3) x),
             'loot', (select jsonb_build_object('loot', loot, 'seen', loot_seen, 'dmg', dmg) from public.leviathan_players where lev_id = v_last.id and player_id = v_uid)) end,
    'next_at', case when l.id is null and coalesce((private.lev_cfg() ->> 'enabled')::boolean, true) then private.lev_next_at() end,
    'bones', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'gen', b.gen, 'lng', b.lng, 'lat', b.lat, 'at', b.fallen_at, 'place', b.place, 'players', b.players, 'top', b.top_name) order by b.id)
             from (select * from public.leviathan_bones order by id desc limit 100) b), '[]'::jsonb));
end $$;

/** you've seen how the last one ended (its loot screen) */
create or replace function public.leviathan_seen(p_lev uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.leviathan_players set loot_seen = true where lev_id = p_lev and player_id = auth.uid()
$$;

/** trampled plots in a map area (the ink splats to scrub) */
create or replace function public.leviathan_map(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_agg(jsonb_build_object('gx', t.gx, 'gy', t.gy, 'until', t.until, 'mine', t.owner_id = auth.uid()))
    from (select * from public.leviathan_trampled where until > now() and scrubbed_at is null and gx between p_min_gx and p_max_gx and gy between p_min_gy and p_max_gy limit 1500) t), '[]'::jsonb)
  where p_max_gx - p_min_gx <= 20000 and p_max_gy - p_min_gy <= 20000
$$;

/** the owner's controls: summon one now (with a warning of so many minutes), or send it back to the sea */
create or replace function public.admin_leviathan(p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); l public.leviathans;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  case p_action
    when 'summon' then
      if exists (select 1 from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing')) then raise exception 'leviathan_active' using errcode = 'P0001'; end if;
      l := private.lev_spawn(least(greatest(coalesce((p_args ->> 'warn_min')::numeric, 60), 0), 1440));
      perform private.audit('leviathan.summon', 'leviathan', l.id::text, jsonb_build_object('warn_min', p_args -> 'warn_min', 'origin', l.origin));
    when 'dismiss' then
      update public.leviathans set status = 'ended', ended_at = now() where status in ('warning', 'walking', 'enraged', 'fleeing') returning * into l;
      if l.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      perform private.audit('leviathan.dismiss', 'leviathan', l.id::text, '{}'::jsonb);
    when 'status' then null;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return public.leviathan_state(false) || jsonb_build_object('cfg', private.lev_cfg(), 'history', (select jsonb_agg(jsonb_build_object('gen', gen, 'status', status, 'origin', origin, 'spawned_at', spawned_at,
    'ended_at', ended_at, 'hp', hp, 'hp_max', hp_max, 'strength', strength, 'fighters', (select count(*) from public.leviathan_players p where p.lev_id = x.id and p.dmg > 0)) order by spawned_at desc)
    from (select * from public.leviathans order by spawned_at desc limit 12) x));
end $$;

-- the owner's Leviathan settings are checked before they're saved
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_config_set(text,jsonb)'::regprocedure);
  n := replace(d, $a$  if p_key = 'rent' then$a$, $a$  if p_key = 'leviathan' and (
       jsonb_typeof(coalesce(p_value -> 'enabled', 'true'::jsonb)) <> 'boolean'
    or coalesce((p_value ->> 'weekday')::numeric, 6) not between 0 and 6
    or coalesce((p_value ->> 'hour_utc')::numeric, 17) not between 0 and 23
    or coalesce((p_value ->> 'every_days')::numeric, 7) not between 1 and 60
    or coalesce((p_value ->> 'warn_min')::numeric, 60) not between 0 and 1440
    or coalesce((p_value ->> 'walk_hours')::numeric, 48) not between 1 and 240
    or coalesce((p_value ->> 'hp_per_player')::numeric, 2500) not between 1 and 10000000
    or coalesce((p_value ->> 'hp_min')::numeric, 60000) not between 1 and 1000000000
    or coalesce((p_value ->> 'bombs_max')::numeric, 60) not between 1 and 1000
    or coalesce((p_value ->> 'move_cd_h')::numeric, 3) not between 0 and 72
    or coalesce((p_value ->> 'loot_cap')::numeric, 1500) not between 0 and 1000000) then
    raise exception 'invalid_leviathan_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' then$a$);
  if position('invalid_leviathan_config' in n) = 0 then raise exception 'leviathan: admin_config_set anchor not found'; end if;
  execute n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.leviathan_hit(text, integer, uuid)', 'public.leviathan_scrub(integer, integer)', 'public.leviathan_seen(uuid)',
                           'public.admin_leviathan(text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.leviathan_state(boolean)', 'public.leviathan_map(integer, integer, integer, integer)'] loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- the heartbeat runs every minute where pg_cron is available (Supabase); elsewhere it beats when someone looks
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'landvas-leviathan';
      perform cron.schedule('landvas-leviathan', '* * * * *', 'select private.leviathan_tick()');
    exception when others then
      raise notice 'pg_cron not available here (%): the Leviathan beats on demand', sqlerrm;
    end;
  end if;
end $$;
