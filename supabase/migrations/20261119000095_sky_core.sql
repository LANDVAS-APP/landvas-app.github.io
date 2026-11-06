-- v0.6.3 Sky Island becomes its own game: an island of hexagonal sky-chunks floating above the clouds that you
-- grow chunk by chunk and build on.
--   * Buildings: Cloud Catcher (fluff), Bird Nest (feathers), Wind Turbine (wind), Rainbow Prism (rainbow drops),
--     Sun Mirror (sunstone), Moon Bell (moon pearls), and Sky Gardens that help everything next to them.
--     Each fills up over time (up to a few hours' worth); tap to harvest. Same-kind neighbours help each other.
--   * Weather: changes every 15 minutes (worked out from the island's seed and the clock, here and in the app).
--     Harvest a building while its weather's on and you get double.
--   * Balloon orders: hot-air balloons dock wanting things; deliver for starlight, XP and a little Ink.

insert into public.game_config (key, value, description) values ('realm_sky', $cfg${
  "start": [[0,0],[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]],
  "radius_by_level": [[1, 2], [8, 3], [16, 4], [26, 5]],
  "expand": { "cost": 40, "growth": 1.3 },
  "cap_hours": 4,
  "neighbour_bonus": 0.15, "garden_bonus": 0.1, "weather_mult": 2,
  "upgrade": { "max": 5, "rate_per_level": 0.5, "cost_mult": 1.6 },
  "buildings": {
    "catcher": { "name": "Cloud Catcher", "emoji": "☁️", "makes": "fluff",     "per_hour": 30, "cost": 15,   "level": 1,  "weather": "cloudy" },
    "nest":    { "name": "Bird Nest",     "emoji": "🪺", "makes": "feather",   "per_hour": 14, "cost": 60,   "level": 3,  "weather": "migration" },
    "turbine": { "name": "Wind Turbine",  "emoji": "🌬️", "makes": "wind",      "per_hour": 8,  "cost": 180,  "level": 6,  "weather": "breezy" },
    "prism":   { "name": "Rainbow Prism", "emoji": "🌈", "makes": "rainbow",   "per_hour": 4,  "cost": 500,  "level": 10, "weather": "rainbow" },
    "mirror":  { "name": "Sun Mirror",    "emoji": "🪞", "makes": "sunstone",  "per_hour": 2,  "cost": 1400, "level": 15, "weather": "clear" },
    "bell":    { "name": "Moon Bell",     "emoji": "🔔", "makes": "moonpearl", "per_hour": 0.8,"cost": 4000, "level": 22, "weather": "night" },
    "garden":  { "name": "Sky Garden",    "emoji": "🌷", "makes": null,        "per_hour": 0,  "cost": 50,   "level": 2,  "weather": null }
  },
  "weathers": [
    { "id": "cloudy",    "name": "Cloudy",          "emoji": "☁️" },
    { "id": "migration", "name": "Bird migration",  "emoji": "🐦" },
    { "id": "breezy",    "name": "Breezy",          "emoji": "🌬️" },
    { "id": "rainbow",   "name": "Rainbow showers", "emoji": "🌈" },
    { "id": "clear",     "name": "Clear skies",     "emoji": "☀️" },
    { "id": "night",     "name": "Starry night",    "emoji": "🌙" }
  ],
  "weather_minutes": 15,
  "orders": { "slots": 3, "wait_minutes": 4, "reroll_minutes": 20, "value_mult": 1.7, "xp_mult": 0.4 }
}$cfg$::jsonb, 'Sky Island: hex chunks, buildings, weather, balloon orders')
on conflict (key) do nothing;

create table if not exists public.realm_skies (
  realm_id uuid primary key references public.realms (id) on delete cascade,
  tiles jsonb not null default '{}'::jsonb,      -- "q,r" -> {b, lv, at}
  orders jsonb not null default '[]'::jsonb,     -- [{id, needs, reward, xp, ink, ready_at}]
  deliveries int not null default 0,
  rerolled_at timestamptz
);
alter table public.realm_skies enable row level security;
revoke all on public.realm_skies from anon, authenticated;

create or replace function private.rsky_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('realm_sky'), '{}'::jsonb) $$;
/** the weather in block n (15-minute blocks since 1970), the same as the app works it out */
create or replace function private.rsky_weather_at(p_seed int, p_block bigint) returns int language plpgsql immutable as $$
declare h bigint := ((p_seed::bigint % 2147483647) + (p_block % 1000000) * 7919 + 4242) % 2147483647;
begin
  h := (h * 48271) % 2147483647; h := (h * 48271) % 2147483647; h := (h * 48271) % 2147483647;
  return (h % 6)::int;
end $$;
create or replace function private.rsky_weather(p_seed int) returns jsonb language plpgsql stable as $$
declare c jsonb := private.rsky_cfg(); m int := coalesce((c ->> 'weather_minutes')::int, 15); v_block bigint := floor(extract(epoch from now()) / (m * 60))::bigint;
begin
  return jsonb_build_object('now', c -> 'weathers' -> private.rsky_weather_at(p_seed, v_block), 'next', c -> 'weathers' -> private.rsky_weather_at(p_seed, v_block + 1),
    'ends_at', to_timestamp((v_block + 1) * m * 60));
end $$;
create or replace function private.rsky_neighbours(p_key text) returns text[] language sql immutable as $$
  select array(select (split_part(p_key, ',', 1)::int + d[1]) || ',' || (split_part(p_key, ',', 2)::int + d[2])
               from (select array[1,0] d union all select array[-1,0] union all select array[0,1] union all select array[0,-1] union all select array[1,-1] union all select array[-1,1]) x)
$$;
create or replace function private.rsky_dist(p_key text) returns int language sql immutable as $$
  select (abs(q) + abs(r) + abs(q + r)) / 2 from (select split_part(p_key, ',', 1)::int q, split_part(p_key, ',', 2)::int r) s
$$;
create or replace function private.rsky_radius(p_level int) returns int language sql stable as $$
  select coalesce(max((e ->> 1)::int), 2) from jsonb_array_elements(private.rsky_cfg() -> 'radius_by_level') e where p_level >= (e ->> 0)::int
$$;
/** what a tile has made so far (not counting the weather bonus) */
create or replace function private.rsky_stored(p_tiles jsonb, p_key text, p_prod numeric) returns numeric language plpgsql stable as $$
declare c jsonb := private.rsky_cfg(); t jsonb := p_tiles -> p_key; b jsonb; v_h numeric; v_mult numeric := 1; n text;
begin
  if t is null or t ->> 'b' is null then return 0; end if;
  b := c -> 'buildings' -> (t ->> 'b');
  if b ->> 'makes' is null then return 0; end if;
  v_h := least((c ->> 'cap_hours')::numeric, extract(epoch from now() - (t ->> 'at')::timestamptz) / 3600);
  foreach n in array private.rsky_neighbours(p_key) loop
    if p_tiles -> n ->> 'b' = t ->> 'b' then v_mult := v_mult + (c ->> 'neighbour_bonus')::numeric; end if;
    if p_tiles -> n ->> 'b' = 'garden' then v_mult := v_mult + (c ->> 'garden_bonus')::numeric; end if;
  end loop;
  return greatest(0, (b ->> 'per_hour')::numeric * (1 + (c -> 'upgrade' ->> 'rate_per_level')::numeric * (coalesce((t ->> 'lv')::int, 1) - 1)) * v_mult * (1 + p_prod) * v_h);
end $$;
create or replace function private.rsky_row(p_realm uuid) returns public.realm_skies language plpgsql as $$
declare s public.realm_skies%rowtype; c jsonb := private.rsky_cfg(); e jsonb; v_tiles jsonb := '{}'::jsonb;
begin
  select * into s from public.realm_skies where realm_id = p_realm for update;
  if found then return s; end if;
  for e in select x from jsonb_array_elements(c -> 'start') x loop v_tiles := v_tiles || jsonb_build_object((e ->> 0) || ',' || (e ->> 1), jsonb_build_object()); end loop;
  v_tiles := jsonb_set(v_tiles, array['0,0'], jsonb_build_object('b', 'catcher', 'lv', 1, 'at', now()));
  insert into public.realm_skies (realm_id, tiles) values (p_realm, v_tiles) on conflict do nothing;
  select * into s from public.realm_skies where realm_id = p_realm for update;
  return s;
end $$;
/** a new balloon order sized to the island's level */
create or replace function private.rsky_order(p_kind_lv int, p_ready timestamptz) returns jsonb language plpgsql volatile as $$
declare c jsonb := private.rsky_cfg(); rc jsonb := private.rlm_cfg('sky'); v_res text[]; v_needs jsonb := '{}'::jsonb; v_val numeric := 0; k text; n int; i int;
begin
  select array_agg(key order by random()) into v_res from jsonb_each(rc -> 'resources')
   where value ->> 'sell' is not null and coalesce((value ->> 'level')::int, 1) <= p_kind_lv and not coalesce((value ->> 'made')::boolean, false);
  if v_res is null then v_res := array['fluff']; end if;
  for i in 1 .. least(array_length(v_res, 1), 1 + floor(random() * 3)::int) loop
    k := v_res[i]; n := greatest(1, round((6 + random() * 14 + p_kind_lv * 1.5) / greatest(1, (rc -> 'resources' -> k ->> 'sell')::numeric) ^ 0.6))::int;
    v_needs := v_needs || jsonb_build_object(k, n); v_val := v_val + n * (rc -> 'resources' -> k ->> 'sell')::numeric;
  end loop;
  return jsonb_build_object('id', substr(md5(random()::text), 1, 8), 'needs', v_needs, 'reward', ceil(v_val * (c -> 'orders' ->> 'value_mult')::numeric),
    'xp', ceil(v_val * (c -> 'orders' ->> 'xp_mult')::numeric) + 5, 'ink', case when v_val > 120 then 2 else 1 end, 'ready_at', p_ready,
    'balloon', (array['🎈','🎈','🪂','🛸'])[1 + floor(random() * 4)::int]);
end $$;
create or replace function private.rsky_fill_orders(p_realm uuid, p_lv int) returns void language plpgsql as $$
declare s public.realm_skies%rowtype := private.rsky_row(p_realm); c jsonb := private.rsky_cfg(); v_n int;
begin
  v_n := jsonb_array_length(s.orders);
  while v_n < (c -> 'orders' ->> 'slots')::int loop s.orders := s.orders || jsonb_build_array(private.rsky_order(p_lv, now())); v_n := v_n + 1; end loop;
  update public.realm_skies set orders = s.orders where realm_id = p_realm;
end $$;
create or replace function private.rsky_json(p_realm uuid) returns jsonb language plpgsql as $$
declare r public.realms%rowtype; s public.realm_skies%rowtype; c jsonb := private.rsky_cfg(); k text; v_stored jsonb := '{}'::jsonb; v_prod numeric; v_lv int; v_n int; v_costs jsonb := '{}'::jsonb; b text;
begin
  select * into r from public.realms where id = p_realm;
  v_lv := private.rlm_lv(r.xp);
  perform private.rsky_fill_orders(p_realm, v_lv);
  s := private.rsky_row(p_realm);
  v_prod := private.rlm_eff('sky', r.upgrades, 'prod_mult');
  for k in select jsonb_object_keys(s.tiles) loop v_stored := v_stored || jsonb_build_object(k, round(private.rsky_stored(s.tiles, k, v_prod), 2)); end loop;
  select count(*) into v_n from jsonb_object_keys(s.tiles);
  for b in select jsonb_object_keys(c -> 'buildings') loop v_costs := v_costs || jsonb_build_object(b, (c -> 'buildings' -> b ->> 'cost')::int); end loop;
  return jsonb_build_object('tiles', s.tiles, 'stored', v_stored, 'orders', s.orders, 'deliveries', s.deliveries, 'weather', private.rsky_weather(r.seed),
    'radius', private.rsky_radius(v_lv), 'expand_cost', round((c -> 'expand' ->> 'cost')::numeric * power((c -> 'expand' ->> 'growth')::numeric, greatest(0, v_n - 7))),
    'reroll_ready', s.rerolled_at is null or s.rerolled_at < now() - make_interval(mins => (c -> 'orders' ->> 'reroll_minutes')::int),
    'prod_mult', v_prod, 'cfg', c, 'server_time', now());
end $$;
create or replace function private.rsky_owned(p_id uuid) returns public.realms language plpgsql as $$
declare r public.realms%rowtype := private.rlm_owned(p_id, private.require_active_player());
begin
  if r.kind <> 'sky' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return r;
end $$;
create or replace function private.rsky_spend(p_uid uuid, p_cost int) returns void language plpgsql as $$
begin
  perform private.rlm_player(p_uid, 'sky');
  if not private.jcovers((select wallet from public.realm_players where player_id = p_uid and kind = 'sky'), jsonb_build_object('starlight', p_cost)) then raise exception 'not_enough' using errcode = 'P0001'; end if;
  update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('starlight', p_cost), -1) where player_id = p_uid and kind = 'sky';
end $$;
create or replace function private.rsky_out(p_realm uuid, p_uid uuid, p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select p_extra || jsonb_build_object('sky', private.rsky_json(p_realm), 'me', private.rlm_me(p_uid, 'sky'), 'level', private.rlm_level((select xp from public.realms where id = p_realm)))
$$;

create or replace function public.sky_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_id;
  if not found or r.kind <> 'sky' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return public.realm_get(p_id) || jsonb_build_object('sky_core', private.rsky_json(r.id));
end $$;

/** add a chunk of sky-island next to the island (within the radius your level allows) */
create or replace function public.sky_expand(p_id uuid, p_q int, p_r int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rsky_owned(p_id); s public.realm_skies%rowtype := private.rsky_row(p_id); c jsonb := private.rsky_cfg(); k text := p_q || ',' || p_r; v_n int; v_cost int;
begin
  perform private.rate_limit('sky_act', 1200, 3600);
  if s.tiles ? k then raise exception 'sky_taken' using errcode = 'P0001'; end if;
  if not exists (select 1 from unnest(private.rsky_neighbours(k)) n where s.tiles ? n) then raise exception 'sky_not_touching' using errcode = 'P0001'; end if;
  if private.rsky_dist(k) > private.rsky_radius(private.rlm_lv(r.xp)) then raise exception 'level_too_low' using errcode = 'P0001'; end if;
  select count(*) into v_n from jsonb_object_keys(s.tiles);
  v_cost := round((c -> 'expand' ->> 'cost')::numeric * power((c -> 'expand' ->> 'growth')::numeric, greatest(0, v_n - 7)));
  perform private.rsky_spend(r.owner_id, v_cost);
  update public.realm_skies set tiles = tiles || jsonb_build_object(k, jsonb_build_object()) where realm_id = r.id;
  return private.rsky_out(r.id, r.owner_id, jsonb_build_object('level_up', private.rlm_xp(r.id, 10 + v_n)));
end $$;

create or replace function public.sky_build(p_id uuid, p_q int, p_r int, p_b text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rsky_owned(p_id); s public.realm_skies%rowtype := private.rsky_row(p_id); c jsonb := private.rsky_cfg(); k text := p_q || ',' || p_r; b jsonb := c -> 'buildings' -> p_b;
begin
  perform private.rate_limit('sky_act', 1200, 3600);
  if b is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (s.tiles ? k) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.tiles -> k ->> 'b' is not null then raise exception 'sky_taken' using errcode = 'P0001'; end if;
  if private.rlm_lv(r.xp) < (b ->> 'level')::int then raise exception 'level_too_low' using errcode = 'P0001'; end if;
  perform private.rsky_spend(r.owner_id, (b ->> 'cost')::int);
  update public.realm_skies set tiles = jsonb_set(tiles, array[k], jsonb_build_object('b', p_b, 'lv', 1, 'at', now())) where realm_id = r.id;
  return private.rsky_out(r.id, r.owner_id, jsonb_build_object('level_up', private.rlm_xp(r.id, 15 + (b ->> 'cost')::int / 20)));
end $$;

create or replace function public.sky_upgrade(p_id uuid, p_q int, p_r int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rsky_owned(p_id); s public.realm_skies%rowtype := private.rsky_row(p_id); c jsonb := private.rsky_cfg(); k text := p_q || ',' || p_r; t jsonb; v_lv int; v_cost int; v_got numeric;
begin
  perform private.rate_limit('sky_act', 1200, 3600);
  t := s.tiles -> k; if t is null or t ->> 'b' is null or (c -> 'buildings' -> (t ->> 'b') ->> 'makes') is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_lv := coalesce((t ->> 'lv')::int, 1);
  if v_lv >= (c -> 'upgrade' ->> 'max')::int then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := round((c -> 'buildings' -> (t ->> 'b') ->> 'cost')::numeric * power((c -> 'upgrade' ->> 'cost_mult')::numeric, v_lv));
  perform private.rsky_spend(r.owner_id, v_cost);
  -- harvest what it's made first, at the old rate
  v_got := floor(private.rsky_stored(s.tiles, k, private.rlm_eff('sky', r.upgrades, 'prod_mult')));
  if v_got > 0 then update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object(c -> 'buildings' -> (t ->> 'b') ->> 'makes', v_got)), lifetime = private.jadd(lifetime, jsonb_build_object(c -> 'buildings' -> (t ->> 'b') ->> 'makes', v_got)) where player_id = r.owner_id and kind = 'sky'; end if;
  update public.realm_skies set tiles = jsonb_set(tiles, array[k], t || jsonb_build_object('lv', v_lv + 1, 'at', now())) where realm_id = r.id;
  return private.rsky_out(r.id, r.owner_id, jsonb_build_object('level_up', private.rlm_xp(r.id, 20 * v_lv)));
end $$;

create or replace function public.sky_clear(p_id uuid, p_q int, p_r int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rsky_owned(p_id); k text := p_q || ',' || p_r;
begin
  perform private.rate_limit('sky_act', 1200, 3600);
  update public.realm_skies set tiles = jsonb_set(tiles, array[k], jsonb_build_object()) where realm_id = r.id and tiles ? k;
  return private.rsky_out(r.id, r.owner_id);
end $$;

/** harvest some tiles (or all, if none given): what they've made, doubled for the ones whose weather it is */
create or replace function public.sky_harvest(p_id uuid, p_keys jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rsky_owned(p_id); s public.realm_skies%rowtype := private.rsky_row(p_id); c jsonb := private.rsky_cfg();
  k text; t jsonb; v_amt numeric; v_loot jsonb := '{}'::jsonb; v_w text := private.rsky_weather(r.seed) -> 'now' ->> 'id'; v_prod numeric := private.rlm_eff('sky', r.upgrades, 'prod_mult');
  v_tiles jsonb := s.tiles; v_got jsonb := '{}'::jsonb; v_boost jsonb := '[]'::jsonb; v_xp numeric := 0; v_whole int;
begin
  perform private.rate_limit('sky_act', 1200, 3600);
  for k in select unnest(coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(p_keys) = 'array' then p_keys end) x), array(select jsonb_object_keys(s.tiles)))) loop
    t := s.tiles -> k; if t is null or t ->> 'b' is null then continue; end if;
    v_amt := private.rsky_stored(s.tiles, k, v_prod);
    if v_amt < 1 then continue; end if;
    if (c -> 'buildings' -> (t ->> 'b') ->> 'weather') = v_w then v_amt := v_amt * (c ->> 'weather_mult')::numeric; v_boost := v_boost || to_jsonb(k); end if;
    v_whole := floor(v_amt)::int;
    v_loot := private.jadd(v_loot, jsonb_build_object(c -> 'buildings' -> (t ->> 'b') ->> 'makes', v_whole));
    v_got := v_got || jsonb_build_object(k, v_whole);
    v_xp := v_xp + v_whole * greatest(0.2, ln(1 + coalesce((private.rlm_cfg('sky') -> 'resources' -> (c -> 'buildings' -> (t ->> 'b') ->> 'makes') ->> 'sell')::numeric, 1)));
    v_tiles := jsonb_set(v_tiles, array[k], t || jsonb_build_object('at', now()));
  end loop;
  update public.realm_skies set tiles = v_tiles where realm_id = r.id;
  perform private.rlm_player(r.owner_id, 'sky');
  update public.realm_players set wallet = private.jadd(wallet, v_loot), lifetime = private.jadd(lifetime, v_loot) where player_id = r.owner_id and kind = 'sky';
  return private.rsky_out(r.id, r.owner_id, jsonb_build_object('loot', v_loot, 'got', v_got, 'boosted', v_boost, 'level_up', private.rlm_xp(r.id, ceil(v_xp)::bigint)));
end $$;

create or replace function public.sky_deliver(p_id uuid, p_order text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rsky_owned(p_id); s public.realm_skies%rowtype := private.rsky_row(p_id); c jsonb := private.rsky_cfg(); o jsonb; v_rest jsonb := '[]'::jsonb; e jsonb; v_ink int; p public.realm_players%rowtype;
begin
  perform private.rate_limit('sky_act', 1200, 3600);
  for e in select x from jsonb_array_elements(s.orders) x loop if e ->> 'id' = p_order then o := e; else v_rest := v_rest || jsonb_build_array(e); end if; end loop;
  if o is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if (o ->> 'ready_at')::timestamptz > now() then raise exception 'sky_balloon_coming' using errcode = 'P0001'; end if;
  p := private.rlm_player(r.owner_id, 'sky');
  if not private.jcovers(p.wallet, o -> 'needs') then raise exception 'not_enough' using errcode = 'P0001'; end if;
  update public.realm_players set wallet = private.jadd(private.jadd(wallet, o -> 'needs', -1), jsonb_build_object('starlight', (o ->> 'reward')::int)) where player_id = r.owner_id and kind = 'sky';
  v_rest := v_rest || jsonb_build_array(private.rsky_order(private.rlm_lv(r.xp), now() + make_interval(mins => (c -> 'orders' ->> 'wait_minutes')::int)));
  update public.realm_skies set orders = v_rest, deliveries = deliveries + 1 where realm_id = r.id;
  v_ink := private.rlm_pay(r.owner_id, 'sky', (o ->> 'ink')::int, r.id::text, 'sky-order:' || r.id || ':' || (o ->> 'id'));
  return private.rsky_out(r.id, r.owner_id, jsonb_build_object('reward', (o ->> 'reward')::int, 'ink', v_ink, 'level_up', private.rlm_xp(r.id, (o ->> 'xp')::int)));
end $$;

/** send a balloon away for a different order (once in a while) */
create or replace function public.sky_reroll(p_id uuid, p_order text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rsky_owned(p_id); s public.realm_skies%rowtype := private.rsky_row(p_id); c jsonb := private.rsky_cfg(); v_new jsonb := '[]'::jsonb; e jsonb; v_hit boolean := false;
begin
  perform private.rate_limit('sky_act', 1200, 3600);
  if s.rerolled_at is not null and s.rerolled_at > now() - make_interval(mins => (c -> 'orders' ->> 'reroll_minutes')::int) then raise exception 'sky_reroll_wait' using errcode = 'P0001'; end if;
  for e in select x from jsonb_array_elements(s.orders) x loop
    if e ->> 'id' = p_order then v_hit := true; v_new := v_new || jsonb_build_array(private.rsky_order(private.rlm_lv(r.xp), now())); else v_new := v_new || jsonb_build_array(e); end if;
  end loop;
  if not v_hit then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.realm_skies set orders = v_new, rerolled_at = now() where realm_id = r.id;
  return private.rsky_out(r.id, r.owner_id);
end $$;

-- a second minigame for the sky: Kite Flyer
update public.game_config set value = jsonb_set(value, '{kinds,sky,games,kite}',
  (value -> 'kinds' -> 'sky' -> 'games' -> 'glide') || jsonb_build_object('name', 'Kite Flyer', 'emoji', '🪁', 'blurb', 'Keep your kite in the wind: steer through the gusts, collect feathers and stars, don’t tangle in the storm.', 'level', 3))
 where key = 'realms' and value -> 'kinds' -> 'sky' -> 'games' ? 'glide' and not (value -> 'kinds' -> 'sky' -> 'games' ? 'kite');

do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'private' and p.proname like 'rsky\_%') or (n.nspname = 'public' and p.proname like 'sky\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if f.nspname = 'public' then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
