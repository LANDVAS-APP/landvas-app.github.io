-- v0.30 Cosmic rarities, bonus games and meteor showers.
--  * Every planet plot rolls a cosmic rarity when it's claimed — Stardust up to the mythic
--    Singularity — and the further out the world, the luckier the roll. Rarer plots multiply the Ink
--    their games pay, and from Nebula up they unlock their world's bonus game.
--  * Meteor showers: every few minutes a shower of meteorites lands round each world's landing site.
--    Everyone on the world sees the same ones; the first explorer to reach one claims it.

update public.game_config set value = value || jsonb_build_object(
  'rarities', '[
    {"id": "dust",        "name": "Stardust",    "weight": 52,  "mult": 1.0,  "color": "#C9CCD6"},
    {"id": "comet",       "name": "Comet",       "weight": 26,  "mult": 1.15, "color": "#7FE3FF"},
    {"id": "nebula",      "name": "Nebula",      "weight": 13,  "mult": 1.3,  "color": "#B69CFF"},
    {"id": "pulsar",      "name": "Pulsar",      "weight": 6,   "mult": 1.5,  "color": "#4FD18B"},
    {"id": "supernova",   "name": "Supernova",   "weight": 2.5, "mult": 1.75, "color": "#FFB13D"},
    {"id": "singularity", "name": "Singularity", "weight": 0.5, "mult": 2.25, "color": "#FF3D9A"}
  ]'::jsonb,
  'bonus_from', 2,
  'luck', '{"moon": 0, "mercury": 0.1, "venus": 0.1, "mars": 0.15, "jupiter": 0.3, "saturn": 0.3, "uranus": 0.45, "neptune": 0.45, "pluto": 0.6, "exo": 0.5}'::jsonb,
  'bonus', '{"moon": "regolith", "mercury": "solarstack", "venus": "cloudcity", "mars": "redminer", "jupiter": "slingshot", "saturn": "ringsling",
             "uranus": "iceminer", "neptune": "trenchsling", "pluto": "heartstack", "exo": "alienore"}'::jsonb,
  'meteors', '{"every_minutes": 10, "count": 8, "radius_m": 160, "reach_m": 22, "ink_min": 3, "ink_max": 8, "golden_chance": 0.12, "golden_ink": 20}'::jsonb,
  'games', (value -> 'games') || '{
    "regolith":    {"seconds": 45, "max_score": 160, "points_per_ink": 6, "max_ink": 30},
    "solarstack":  {"seconds": 50, "max_score": 120, "points_per_ink": 4, "max_ink": 30},
    "cloudcity":   {"seconds": 50, "max_score": 120, "points_per_ink": 4, "max_ink": 30},
    "redminer":    {"seconds": 45, "max_score": 160, "points_per_ink": 6, "max_ink": 30},
    "slingshot":   {"seconds": 50, "max_score": 150, "points_per_ink": 5, "max_ink": 30},
    "ringsling":   {"seconds": 50, "max_score": 150, "points_per_ink": 5, "max_ink": 30},
    "iceminer":    {"seconds": 45, "max_score": 160, "points_per_ink": 6, "max_ink": 30},
    "trenchsling": {"seconds": 50, "max_score": 150, "points_per_ink": 5, "max_ink": 30},
    "heartstack":  {"seconds": 50, "max_score": 120, "points_per_ink": 4, "max_ink": 30},
    "alienore":    {"seconds": 45, "max_score": 160, "points_per_ink": 6, "max_ink": 30}
  }'::jsonb)
 where key = 'planets';

alter table public.planet_plots add column if not exists rarity text not null default 'dust';

create table if not exists public.planet_meteors (
  world text not null, win bigint not null, idx int not null,
  player_id uuid not null references public.players (id) on delete cascade,
  ink int not null, taken_at timestamptz not null default now(),
  primary key (world, win, idx)
);
alter table public.planet_meteors enable row level security;
revoke all on public.planet_meteors from anon, authenticated;

create or replace function private.rarity_rank(p_id text) returns int language sql stable as $$
  select coalesce((select (o - 1)::int from jsonb_array_elements(private.planet_cfg() -> 'rarities') with ordinality r(v, o) where v ->> 'id' = p_id), 0)
$$;
create or replace function private.rarity_mult(p_id text) returns numeric language sql stable as $$
  select coalesce((select (v ->> 'mult')::numeric from jsonb_array_elements(private.planet_cfg() -> 'rarities') v where v ->> 'id' = p_id), 1)
$$;
/** Roll a cosmic rarity: rarer tiers get more likely the luckier (further out) the world is. */
create or replace function private.roll_cosmic(p_world text) returns text language plpgsql volatile as $$
declare v_luck numeric := coalesce((private.planet_cfg() -> 'luck' ->> private.planet_key(p_world))::numeric, 0);
  r record; v_total numeric := 0; v_pick numeric; v_acc numeric := 0;
begin
  for r in select v ->> 'id' id, (v ->> 'weight')::numeric * (1 + v_luck * (o - 1)) w from jsonb_array_elements(private.planet_cfg() -> 'rarities') with ordinality x(v, o) loop
    v_total := v_total + r.w;
  end loop;
  v_pick := random() * v_total;
  for r in select v ->> 'id' id, (v ->> 'weight')::numeric * (1 + v_luck * (o - 1)) w from jsonb_array_elements(private.planet_cfg() -> 'rarities') with ordinality x(v, o) loop
    v_acc := v_acc + r.w;
    if v_pick < v_acc then return r.id; end if;
  end loop;
  return 'dust';
end $$;
/** A world's games for a plot of this rarity: its two, plus the bonus game from Nebula up. */
create or replace function private.plot_games(p_world text, p_rarity text) returns jsonb language sql stable as $$
  select (private.planet_cfg() -> 'worlds' -> private.planet_key(p_world) -> 'games')
      || case when private.rarity_rank(p_rarity) >= coalesce((private.planet_cfg() ->> 'bonus_from')::int, 2)
              then jsonb_build_array(private.planet_cfg() -> 'bonus' ->> private.planet_key(p_world)) else '[]'::jsonb end
$$;

create or replace function public.planet_map(p_world text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); w jsonb; s public.space_pilots%rowtype;
begin
  if not private.planet_open(v_uid, p_world) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  w := private.planet_cfg() -> 'worlds' -> private.planet_key(p_world);
  select * into s from public.space_pilots where player_id = v_uid;
  return jsonb_build_object(
    'world', p_world, 'rows', coalesce((w ->> 'size')::int, 16), 'cols', 2 * coalesce((w ->> 'size')::int, 16), 'games', w -> 'games',
    'bonus_game', private.planet_cfg() -> 'bonus' ->> private.planet_key(p_world),
    'rarities', private.planet_cfg() -> 'rarities', 'bonus_from', coalesce((private.planet_cfg() ->> 'bonus_from')::int, 2),
    'luck', coalesce((private.planet_cfg() -> 'luck' ->> private.planet_key(p_world))::numeric, 0),
    'price', private.planet_price(v_uid, p_world),
    'landed', s.player_id is not null and s.location = p_world and s.dest is null,
    'plots', (select coalesce(jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'name', p.name, 'mine', p.owner_id = v_uid, 'rarity', p.rarity,
                'owner', jsonb_build_object('username', pr.username, 'accent', pr.accent_color)) order by p.claimed_at), '[]'::jsonb)
              from public.planet_plots p join public.profiles pr on pr.id = p.owner_id where p.world = p_world),
    'pilots', (select coalesce(jsonb_agg(private.profile_json(x.player_id)), '[]'::jsonb) from (
                select player_id from public.space_pilots where location = p_world and dest is null and private.visible_to(player_id, v_uid)
                order by updated_at desc limit 24) x),
    'ink_today', case when s.planet_ink_day is distinct from private.day_start(now()) then 0 else coalesce(s.planet_ink_today, 0) end,
    'daily_cap', coalesce((private.planet_cfg() ->> 'daily_cap')::int, 200));
end $$;

create or replace function public.planet_claim(p_world text, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; v_size int; v_price int; v_rarity text;
begin
  perform private.rate_limit('planet_claim', 120, 3600);
  if not coalesce((private.planet_cfg() ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if not private.planet_open(v_uid, p_world) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  v_size := coalesce((private.planet_cfg() -> 'worlds' -> private.planet_key(p_world) ->> 'size')::int, 16);
  if p_gx < 0 or p_gy < 0 or p_gx >= 2 * v_size or p_gy >= v_size then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('planet:' || p_world || ':' || p_gx || ':' || p_gy));
  if exists (select 1 from public.planet_plots where world = p_world and gx = p_gx and gy = p_gy) then raise exception 'plot_unavailable' using errcode = 'P0001'; end if;
  v_price := private.planet_price(v_uid, p_world);
  perform private.charge(v_uid, jsonb_build_object('ink', v_price), 'planet_plot', 'planet', p_world || ':' || p_gx || ':' || p_gy, 'planet-plot:' || p_world || ':' || p_gx || ':' || p_gy);
  v_rarity := private.roll_cosmic(p_world);
  insert into public.planet_plots (world, gx, gy, owner_id, rarity) values (p_world, p_gx, p_gy, v_uid, v_rarity);
  return public.planet_map(p_world) || jsonb_build_object('claimed', jsonb_build_array(p_gx, p_gy), 'paid', v_price, 'rarity', v_rarity,
    'games_unlocked', private.plot_games(p_world, v_rarity));
end $$;

create or replace function public.my_planet_plots() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('world', world, 'gx', gx, 'gy', gy, 'name', name, 'rarity', rarity, 'claimed_at', claimed_at,
           'games', private.plot_games(world, rarity)) order by claimed_at), '[]'::jsonb)
  from public.planet_plots where owner_id = auth.uid()
$$;

create or replace function public.planet_game_start(p_world text, p_gx int, p_gy int, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g jsonb; v public.planet_games%rowtype; v_done int; v_max int := coalesce((private.planet_cfg() ->> 'rounds_per_plot')::int, 3);
  v_rarity text;
begin
  perform private.rate_limit('planet_game', 120, 3600);
  select rarity into v_rarity from public.planet_plots where world = p_world and gx = p_gx and gy = p_gy and owner_id = v_uid;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not (private.plot_games(p_world, v_rarity) ? p_game) then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  g := private.planet_cfg() -> 'games' -> p_game;
  select count(*) into v_done from public.planet_games
   where world = p_world and gx = p_gx and gy = p_gy and owner_id = v_uid and rewarded and started_at >= private.day_start(now());
  insert into public.planet_games (owner_id, world, gx, gy, game, seed, rewarded)
  values (v_uid, p_world, p_gx, p_gy, p_game, floor(random() * 2147483647)::int, v_done < v_max) returning * into v;
  perform private.space_pilot(v_uid);
  return jsonb_build_object('session', v.id, 'seed', v.seed, 'game', p_game, 'seconds', coalesce((g ->> 'seconds')::int, 45),
    'rewarded', v.rewarded, 'rounds_left', greatest(0, v_max - v_done - case when v.rewarded then 1 else 0 end),
    'rarity', v_rarity, 'mult', private.rarity_mult(v_rarity));
end $$;

create or replace function public.planet_game_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v public.planet_games%rowtype; g jsonb; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0;
  v_mult numeric := 1;
begin
  select * into v from public.planet_games where id = p_session for update;
  if not found or v.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if v.finished_at is not null then return jsonb_build_object('score', v.score, 'paid', v.ink, 'repeat', true); end if;
  g := private.planet_cfg() -> 'games' -> v.game;
  v_secs := extract(epoch from (now() - v.started_at));
  if v_secs < coalesce((g ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 100)));
  select private.rarity_mult(rarity) into v_mult from public.planet_plots where world = v.world and gx = v.gx and gy = v.gy and owner_id = v_uid;
  v_mult := coalesce(v_mult, 1);
  if v.rewarded and v_secs <= 1800 then
    v_ink := floor(least(coalesce((g ->> 'max_ink')::int, 25), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 5)))) * v_mult)::int;
    v_paid := private.planet_pay(v_uid, v_ink, v.id::text, 'pgame:' || v.id);
  end if;
  update public.planet_games set finished_at = now(), score = v_score, ink = v_paid where id = v.id;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'rewarded', v.rewarded, 'mult', v_mult, 'balances', private.balances(v_uid),
    'best', (select max(score) from public.planet_games where owner_id = v_uid and game = v.game and finished_at is not null));
end $$;

-- ---- meteor showers ----------------------------------------------------------------------------
create or replace function private.h01(p text) returns float8 language sql immutable as $$
  select ('x' || substr(md5(p), 1, 8))::bit(32)::bigint / 4294967295.0
$$;
/** The meteorites of one shower: where they land (round the landing site) and which are golden. */
create or replace function private.meteor_list(p_world text, p_win bigint) returns table (idx int, d float8[], golden boolean)
language plpgsql stable as $$
declare m jsonb := private.planet_cfg() -> 'meteors';
  v_rows int := coalesce((private.planet_cfg() -> 'worlds' -> private.planet_key(p_world) ->> 'size')::int, 16);
  v_r float8 := v_rows * 4;  -- globe radius in metres (matches the client)
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

create or replace function public.planet_meteors(p_world text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m jsonb := private.planet_cfg() -> 'meteors';
  v_every int := coalesce((m ->> 'every_minutes')::int, 10) * 60; v_win bigint := floor(extract(epoch from now()) / v_every);
begin
  if not private.planet_open(v_uid, p_world) and p_world not like 'exo:%' then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  return jsonb_build_object('win', v_win, 'started_at', to_timestamp(v_win * v_every), 'ends_at', to_timestamp((v_win + 1) * v_every), 'reach_m', coalesce((m ->> 'reach_m')::int, 22),
    'meteors', (select coalesce(jsonb_agg(jsonb_build_object('i', l.idx, 'd', to_jsonb(l.d), 'golden', l.golden,
                  'taken', t.player_id is not null, 'mine', t.player_id = v_uid, 'by', (select username from public.profiles where id = t.player_id)) order by l.idx), '[]'::jsonb)
                from private.meteor_list(p_world, v_win) l left join public.planet_meteors t on t.world = p_world and t.win = v_win and t.idx = l.idx));
end $$;

/** Grab a meteorite: you have to be standing right by it (your live position), and be first. */
create or replace function public.planet_meteor_grab(p_world text, p_idx int, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m jsonb := private.planet_cfg() -> 'meteors'; s public.space_pilots%rowtype;
  v_every int := coalesce((m ->> 'every_minutes')::int, 10) * 60; v_win bigint := floor(extract(epoch from now()) / v_every);
  v_rows int := coalesce((private.planet_cfg() -> 'worlds' -> private.planet_key(p_world) ->> 'size')::int, 16);
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
  if private.unit3(p_d) is not null and acos(least(1, greatest(-1, v_here[1] * (private.unit3(p_d))[1] + v_here[2] * (private.unit3(p_d))[2] + v_here[3] * (private.unit3(p_d))[3]))) * v_rows * 4 < 40 then
    v_here := private.unit3(p_d);
  end if;
  v_dist := acos(least(1, greatest(-1, v_here[1] * met.d[1] + v_here[2] * met.d[2] + v_here[3] * met.d[3]))) * v_rows * 4;
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
  foreach f in array array['private.rarity_rank(text)', 'private.rarity_mult(text)', 'private.roll_cosmic(text)', 'private.plot_games(text, text)', 'private.h01(text)', 'private.meteor_list(text, bigint)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.planet_meteors(text)', 'public.planet_meteor_grab(text, int, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
