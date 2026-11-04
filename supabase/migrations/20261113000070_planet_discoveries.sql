-- v0.52 Planets come alive: weather, hidden aliens, and places to discover.
--   * Weather: every world has its own storms (dust storms on Mars, solar storms on the Moon, blizzards on the
--     ice worlds, ion storms on the gas giants, acid rain on Venus…). A storm rolls in every half hour or so and
--     lasts a few minutes, and it scatters storm shards round the landing site: grab them for rare materials
--     and a little Ink (everyone gets their own)
--   * Hidden aliens: each world has its own species, hiding near the landing site (new hiding places every day).
--     Get close and they peek out; find them for your alien codex. Some are rare, one is legendary
--   * Places to discover: craters, crashed probes, ancient monoliths, crystal geodes, ruins, geysers, fossils and
--     ice caves, spread round each world (always in the same places). Investigate each one once for a find
-- Everything is checked against where you actually are (your live position), like meteorites.

insert into public.game_config (key, value, description) values ('discover', '{
  "enabled": true,
  "weather": {
    "every_minutes": 30, "minutes": 8, "shards": 10, "radius_m": 220, "reach_m": 22, "ink": [2, 5],
    "kinds": {
      "dust":     {"name": "Dust storm",   "emoji": "🌪️", "item": "dust",    "rare": "crystal"},
      "solar":    {"name": "Solar storm",  "emoji": "☀️", "item": "crystal", "rare": "plasma"},
      "blizzard": {"name": "Blizzard",     "emoji": "❄️", "item": "ice",     "rare": "gem"},
      "ion":      {"name": "Ion storm",    "emoji": "⚡", "item": "copper",  "rare": "plasma"},
      "acid":     {"name": "Acid rain",    "emoji": "🌧️", "item": "iron",    "rare": "titanium"},
      "ash":      {"name": "Ash storm",    "emoji": "🌋", "item": "stone",   "rare": "core"}
    },
    "worlds": {"moon": "solar", "mercury": "solar", "venus": "acid", "mars": "dust", "jupiter": "ion", "saturn": "ion", "uranus": "blizzard", "neptune": "blizzard", "pluto": "blizzard"}
  },
  "aliens": {
    "per_day": 12, "radius_m": 420, "reach_m": 14, "species_per_world": 3,
    "species": [
      {"id": "blorp",     "name": "Blorp",          "emoji": "👾", "rarity": "common",    "ink": 2},
      {"id": "zibble",    "name": "Zibble",         "emoji": "👽", "rarity": "common",    "ink": 2},
      {"id": "glimmerbug","name": "Glimmerbug",     "emoji": "🪲", "rarity": "common",    "ink": 2},
      {"id": "moonmoth",  "name": "Moon moth",      "emoji": "🦋", "rarity": "common",    "ink": 2},
      {"id": "rockling",  "name": "Rockling",       "emoji": "🪨", "rarity": "common",    "ink": 2},
      {"id": "jellyfloat","name": "Jellyfloat",     "emoji": "🪼", "rarity": "uncommon",  "ink": 4},
      {"id": "snorkel",   "name": "Snorkelhorn",    "emoji": "🦄", "rarity": "uncommon",  "ink": 4},
      {"id": "cryptid",   "name": "Dune cryptid",   "emoji": "🦎", "rarity": "uncommon",  "ink": 4},
      {"id": "orbie",     "name": "Orbie",          "emoji": "🔮", "rarity": "uncommon",  "ink": 4},
      {"id": "tentaclo",  "name": "Tentaclo",       "emoji": "🐙", "rarity": "rare",      "ink": 8},
      {"id": "starfox",   "name": "Star fox",       "emoji": "🦊", "rarity": "rare",      "ink": 8},
      {"id": "voidcat",   "name": "Void cat",       "emoji": "🐈‍⬛", "rarity": "rare",      "ink": 8},
      {"id": "elder",     "name": "The Elder",      "emoji": "🛸", "rarity": "legendary", "ink": 25}
    ],
    "chance": {"common": 0.62, "uncommon": 0.26, "rare": 0.1, "legendary": 0.02}
  },
  "pois": {
    "count": 40, "near": 8, "near_m": 260, "radius_m": 1800, "reach_m": 10,
    "kinds": {
      "crater":   {"name": "Impact crater",  "emoji": "🕳️", "weight": 30, "ink": 3,  "items": {"stone": [3, 8], "iron": [0, 3]}},
      "probe":    {"name": "Crashed probe",  "emoji": "🛰️", "weight": 12, "ink": 6,  "items": {"copper": [2, 5], "titanium": [0, 2]}},
      "monolith": {"name": "Ancient monolith","emoji": "🗿", "weight": 6,  "ink": 12, "items": {"gem": [1, 2]}},
      "geode":    {"name": "Crystal geode",  "emoji": "💎", "weight": 14, "ink": 5,  "items": {"crystal": [3, 7]}},
      "ruins":    {"name": "Alien ruins",    "emoji": "🏛️", "weight": 8,  "ink": 10, "items": {"titanium": [1, 3], "gem": [0, 1]}},
      "geyser":   {"name": "Geyser",         "emoji": "⛲", "weight": 12, "ink": 4,  "items": {"ice": [4, 8]}},
      "fossil":   {"name": "Fossil",         "emoji": "🦴", "weight": 10, "ink": 7,  "items": {"stone": [2, 4], "gem": [0, 1]}},
      "cave":     {"name": "Ice cave",       "emoji": "🧊", "weight": 8,  "ink": 6,  "items": {"ice": [3, 6], "crystal": [1, 3]}}
    }
  }
}', 'Planet discoveries: weather (storms by world, how often, the shards they scatter), hidden aliens (species, rarity, how many hide a day) and places to discover (how many, what each gives).')
on conflict (key) do nothing;

create table if not exists public.planet_finds (
  player_id uuid not null references public.players (id) on delete cascade,
  world text not null,
  kind text not null check (kind in ('shard', 'alien', 'poi')),
  ref text not null,
  at timestamptz not null default now(),
  primary key (player_id, world, kind, ref)
);
alter table public.planet_finds enable row level security;
revoke all on public.planet_finds from anon, authenticated;

create table if not exists public.alien_codex (
  player_id uuid not null references public.players (id) on delete cascade,
  species text not null,
  n int not null default 0,
  first_world text, first_at timestamptz not null default now(),
  primary key (player_id, species)
);
alter table public.alien_codex enable row level security;
revoke all on public.alien_codex from anon, authenticated;

create or replace function private.disc_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('discover'), '{}'::jsonb) $$;

/** A spot on the globe (unit vector), from p_min to p_max metres from the landing site, from a hash key. */
create or replace function private.near_landing(p_world text, p_key text, p_min float8, p_max float8) returns float8[]
language plpgsql stable as $$
declare v_r float8 := private.planet_radius(p_world);
  sx float8 := cos(radians(4)) * sin(radians(6)); sy float8 := sin(radians(4)); sz float8 := cos(radians(4)) * cos(radians(6));
  e1x float8; e1z float8; l float8; e2x float8; e2y float8; e2z float8; dist float8; a float8; th float8;
begin
  l := sqrt(sz * sz + sx * sx); e1x := sz / l; e1z := -sx / l;
  e2x := sy * e1z; e2y := sz * e1x - sx * e1z; e2z := -sy * e1x;
  dist := p_min + (p_max - p_min) * sqrt(private.h01(p_key || ':r'));
  a := 2 * pi() * private.h01(p_key || ':a');
  th := dist / v_r;
  return array[sx * cos(th) + (e1x * cos(a) + e2x * sin(a)) * sin(th), sy * cos(th) + (e2y * sin(a)) * sin(th), sz * cos(th) + (e1z * cos(a) + e2z * sin(a)) * sin(th)];
end $$;

create or replace function private.weather_kind(p_world text) returns text language sql stable as $$
  select coalesce(private.disc_cfg() -> 'weather' -> 'worlds' ->> p_world,
    (array['dust', 'solar', 'blizzard', 'ion', 'acid', 'ash'])[1 + floor(private.h01('weather:' || p_world) * 6)::int])
$$;
/** This half-hour's storm: when it starts and ends (it starts somewhere in the first part of the window). */
create or replace function private.weather_now(p_world text) returns jsonb language sql stable as $$
  with w as (select private.disc_cfg() -> 'weather' c),
  t as (select (coalesce((c ->> 'every_minutes')::int, 30) * 60) every, (coalesce((c ->> 'minutes')::int, 8) * 60) len, c from w),
  win as (select floor(extract(epoch from now()) / every)::bigint n, every, len, c from t)
  select jsonb_build_object('win', n, 'kind', private.weather_kind(p_world),
    'starts', to_timestamp(n * every + floor(private.h01(p_world || ':storm:' || n) * (every - len))),
    'ends', to_timestamp(n * every + floor(private.h01(p_world || ':storm:' || n) * (every - len)) + len),
    'next', to_timestamp((n + 1) * every + floor(private.h01(p_world || ':storm:' || (n + 1)) * (every - len))))
  from win
$$;

create or replace function private.alien_species(p_world text, p_day date, p_i int) returns jsonb language plpgsql stable as $$
declare a jsonb := private.disc_cfg() -> 'aliens'; v_roll float8 := private.h01('alien:' || p_world || ':' || p_day || ':' || p_i || ':rar'); v_rar text; v_pool jsonb;
begin
  v_rar := case when v_roll < coalesce((a -> 'chance' ->> 'legendary')::float8, 0.02) then 'legendary'
                when v_roll < coalesce((a -> 'chance' ->> 'legendary')::float8, 0.02) + coalesce((a -> 'chance' ->> 'rare')::float8, 0.1) then 'rare'
                when v_roll < 1 - coalesce((a -> 'chance' ->> 'common')::float8, 0.62) then 'uncommon' else 'common' end;
  -- each world has its own few species of each rarity (the legendary one turns up anywhere)
  select coalesce(jsonb_agg(s order by private.h01('species:' || p_world || ':' || (s ->> 'id'))), '[]'::jsonb) into v_pool
    from jsonb_array_elements(a -> 'species') s where s ->> 'rarity' = v_rar;
  if jsonb_array_length(v_pool) = 0 then return a -> 'species' -> 0; end if;
  v_pool := (select jsonb_agg(x) from (select x from jsonb_array_elements(v_pool) x limit greatest(1, coalesce((a ->> 'species_per_world')::int, 3))) y);
  return v_pool -> floor(private.h01('alien:' || p_world || ':' || p_day || ':' || p_i || ':sp') * jsonb_array_length(v_pool))::int;
end $$;

create or replace function private.poi_kind(p_world text, p_i int) returns text language sql stable as $$
  with k as (select key, (value ->> 'weight')::float8 w, sum((value ->> 'weight')::float8) over (order by key) cum, sum((value ->> 'weight')::float8) over () tot
             from jsonb_each(private.disc_cfg() -> 'pois' -> 'kinds'))
  select key from k where cum / tot >= private.h01('poi:' || p_world || ':' || p_i || ':k') order by cum limit 1
$$;
create or replace function private.poi_point(p_world text, p_i int) returns float8[] language sql stable as $$
  with p as (select private.disc_cfg() -> 'pois' c)
  select case when p_i < coalesce((c ->> 'near')::int, 8)
    then private.near_landing(p_world, 'poi:' || p_world || ':' || p_i, 40, coalesce((c ->> 'near_m')::float8, 260))
    else private.near_landing(p_world, 'poi:' || p_world || ':' || p_i, coalesce((c ->> 'near_m')::float8, 260), coalesce((c ->> 'radius_m')::float8, 1800)) end
  from p
$$;

/** Everything to discover on a world right now, and what you've already found. */
create or replace function public.planet_discoveries(p_world text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.disc_cfg(); wn jsonb := private.weather_now(p_world); v_day date := (private.day_start(now()))::date;
  v_active boolean; v_kind text := wn ->> 'kind';
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then return jsonb_build_object('enabled', false); end if;
  v_active := now() between (wn ->> 'starts')::timestamptz and (wn ->> 'ends')::timestamptz;
  return jsonb_build_object('enabled', true, 'server_time', now(),
    'weather', jsonb_build_object('kind', v_kind, 'name', c -> 'weather' -> 'kinds' -> v_kind ->> 'name', 'emoji', c -> 'weather' -> 'kinds' -> v_kind ->> 'emoji',
      'active', v_active, 'starts', wn -> 'starts', 'ends', wn -> 'ends', 'next', wn -> 'next', 'win', wn -> 'win',
      'shards', case when v_active then (select jsonb_agg(jsonb_build_object('i', i, 'd', private.near_landing(p_world, 'shard:' || p_world || ':' || (wn ->> 'win') || ':' || i, 15, coalesce((c -> 'weather' ->> 'radius_m')::float8, 220)),
          'rare', private.h01('shard:' || p_world || ':' || (wn ->> 'win') || ':' || i || ':rare') < 0.2,
          'taken', exists (select 1 from public.planet_finds f where f.player_id = v_uid and f.world = p_world and f.kind = 'shard' and f.ref = (wn ->> 'win') || ':' || i)))
        from generate_series(0, coalesce((c -> 'weather' ->> 'shards')::int, 10) - 1) i) else '[]'::jsonb end),
    'aliens', (select jsonb_agg(jsonb_build_object('i', i, 'd', private.near_landing(p_world, 'alien:' || p_world || ':' || v_day || ':' || i, 25, coalesce((c -> 'aliens' ->> 'radius_m')::float8, 420)),
        'species', private.alien_species(p_world, v_day, i),
        'found', exists (select 1 from public.planet_finds f where f.player_id = v_uid and f.world = p_world and f.kind = 'alien' and f.ref = v_day || ':' || i)))
      from generate_series(0, coalesce((c -> 'aliens' ->> 'per_day')::int, 12) - 1) i),
    'pois', (select jsonb_agg(jsonb_build_object('i', i, 'd', private.poi_point(p_world, i), 'kind', private.poi_kind(p_world, i),
        'found', exists (select 1 from public.planet_finds f where f.player_id = v_uid and f.world = p_world and f.kind = 'poi' and f.ref = i::text)))
      from generate_series(0, coalesce((c -> 'pois' ->> 'count')::int, 40) - 1) i),
    'codex', coalesce((select jsonb_object_agg(species, n) from public.alien_codex where player_id = v_uid), '{}'::jsonb),
    'species', c -> 'aliens' -> 'species', 'poi_kinds', c -> 'pois' -> 'kinds', 'weather_kinds', c -> 'weather' -> 'kinds');
end $$;

/** Grab a storm shard, find an alien or investigate a place: only when you're right there. */
create or replace function public.planet_find(p_world text, p_kind text, p_idx int, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.disc_cfg(); s public.space_pilots%rowtype; v_r float8 := private.planet_radius(p_world);
  v_here float8[]; v_at float8[]; v_reach float8; v_dist float8; v_ref text; v_ink int := 0; v_paid int := 0; v_items jsonb := '{}'::jsonb; v_sp jsonb; v_pk text; k record;
  wn jsonb; v_day date := (private.day_start(now()))::date; v_rare boolean; v_new_species boolean := false; v_wk text;
begin
  perform private.rate_limit('planet_find', 400, 3600);
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  if p_kind = 'shard' then
    wn := private.weather_now(p_world);
    if not (now() between (wn ->> 'starts')::timestamptz and (wn ->> 'ends')::timestamptz + interval '20 seconds') or p_idx < 0 or p_idx >= coalesce((c -> 'weather' ->> 'shards')::int, 10) then
      raise exception 'storm_over' using errcode = 'P0001';
    end if;
    v_ref := (wn ->> 'win') || ':' || p_idx;
    v_at := private.near_landing(p_world, 'shard:' || p_world || ':' || v_ref, 15, coalesce((c -> 'weather' ->> 'radius_m')::float8, 220));
    v_reach := coalesce((c -> 'weather' ->> 'reach_m')::float8, 22);
  elsif p_kind = 'alien' then
    if p_idx < 0 or p_idx >= coalesce((c -> 'aliens' ->> 'per_day')::int, 12) then raise exception 'not_found' using errcode = 'P0001'; end if;
    v_ref := v_day || ':' || p_idx;
    v_at := private.near_landing(p_world, 'alien:' || p_world || ':' || v_ref, 25, coalesce((c -> 'aliens' ->> 'radius_m')::float8, 420));
    v_reach := coalesce((c -> 'aliens' ->> 'reach_m')::float8, 14);
  elsif p_kind = 'poi' then
    if p_idx < 0 or p_idx >= coalesce((c -> 'pois' ->> 'count')::int, 40) then raise exception 'not_found' using errcode = 'P0001'; end if;
    v_ref := p_idx::text;
    v_at := private.poi_point(p_world, p_idx);
    v_reach := coalesce((c -> 'pois' ->> 'reach_m')::float8, 10);
  else raise exception 'not_found' using errcode = 'P0001'; end if;
  -- where you are: what you report now if it agrees with your last heartbeat, else the heartbeat
  select d into v_here from public.planet_presence where player_id = v_uid and world = p_world and seen_at > now() - interval '30 seconds';
  if v_here is null then raise exception 'too_far' using errcode = 'P0001'; end if;
  if private.unit3(p_d) is not null and acos(least(1, greatest(-1, v_here[1] * (private.unit3(p_d))[1] + v_here[2] * (private.unit3(p_d))[2] + v_here[3] * (private.unit3(p_d))[3]))) * v_r < 40 then
    v_here := private.unit3(p_d);
  end if;
  v_dist := acos(least(1, greatest(-1, v_here[1] * v_at[1] + v_here[2] * v_at[2] + v_here[3] * v_at[3]))) * v_r;
  if v_dist > v_reach then raise exception 'too_far' using errcode = 'P0001', detail = round(v_dist)::text; end if;
  insert into public.planet_finds (player_id, world, kind, ref) values (v_uid, p_world, p_kind, v_ref) on conflict do nothing;
  if not found then raise exception 'already_found' using errcode = 'P0001'; end if;
  -- what it gives
  if p_kind = 'shard' then
    v_wk := private.weather_kind(p_world);
    v_rare := private.h01('shard:' || p_world || ':' || v_ref || ':rare') < 0.2;
    v_items := jsonb_build_object(case when v_rare then c -> 'weather' -> 'kinds' -> v_wk ->> 'rare' else c -> 'weather' -> 'kinds' -> v_wk ->> 'item' end, case when v_rare then 2 else 4 end);
    v_ink := coalesce((c -> 'weather' -> 'ink' ->> 0)::int, 2) + floor(private.h01('shard:' || v_ref || ':i') * (coalesce((c -> 'weather' -> 'ink' ->> 1)::int, 5) - coalesce((c -> 'weather' -> 'ink' ->> 0)::int, 2) + 1))::int;
  elsif p_kind = 'alien' then
    v_sp := private.alien_species(p_world, v_day, p_idx);
    v_ink := coalesce((v_sp ->> 'ink')::int, 2);
    insert into public.alien_codex (player_id, species, n, first_world) values (v_uid, v_sp ->> 'id', 1, p_world)
      on conflict (player_id, species) do update set n = alien_codex.n + 1;
    v_new_species := (select n from public.alien_codex where player_id = v_uid and species = v_sp ->> 'id') = 1;
    if v_new_species then v_ink := v_ink * 3; end if;
  else
    v_pk := private.poi_kind(p_world, p_idx);
    v_ink := coalesce((c -> 'pois' -> 'kinds' -> v_pk ->> 'ink')::int, 3);
    for k in select key, value from jsonb_each(c -> 'pois' -> 'kinds' -> v_pk -> 'items') loop
      v_items := v_items || jsonb_build_object(k.key, (k.value ->> 0)::int + floor(private.h01('poi:' || p_world || ':' || p_idx || ':' || k.key || ':' || v_uid) * ((k.value ->> 1)::int - (k.value ->> 0)::int + 1))::int);
    end loop;
  end if;
  for k in select key, value::int n from jsonb_each_text(v_items) loop
    if k.n > 0 then insert into public.planet_items (player_id, item, qty) values (v_uid, k.key, k.n) on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty; end if;
  end loop;
  v_paid := private.planet_pay_world(v_uid, p_world, v_ink, p_world || ':' || p_kind || ':' || v_ref, 'find:' || p_world || ':' || p_kind || ':' || v_ref || ':' || v_uid);
  return jsonb_build_object('kind', p_kind, 'idx', p_idx, 'paid', v_paid, 'earned', v_ink, 'items', v_items, 'species', v_sp, 'new_species', v_new_species, 'poi', v_pk,
    'balances', private.balances(v_uid), 'inventory', private.items_json(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.disc_cfg()', 'private.near_landing(text, text, float8, float8)', 'private.weather_kind(text)', 'private.weather_now(text)',
    'private.alien_species(text, date, int)', 'private.poi_kind(text, int)', 'private.poi_point(text, int)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.planet_discoveries(text)', 'public.planet_find(text, text, int, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
