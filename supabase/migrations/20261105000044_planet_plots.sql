-- v0.27 Planet plots: every world (a globe: `size` rows of latitude, twice as many columns of longitude) in the solar system has its own map of plots that anyone who
-- lands there can buy with Ink — shared, so everyone sees who owns what — and your settled
-- home world has a map of its own that only you can build on. Each world's plots come with two
-- minigames of their own that earn Ink (a few rewarded rounds per plot a day, under a daily cap).

insert into public.game_config (key, value, description) values ('planets', '{
  "enabled": true,
  "daily_cap": 200,
  "rounds_per_plot": 3,
  "price_step": 5,
  "worlds": {
    "moon":    {"size": 24, "plot_ink": 30, "games": ["moonlander", "rockrun"]},
    "mercury": {"size": 18, "plot_ink": 35, "games": ["sunflare", "craterleap"]},
    "venus":   {"size": 20, "plot_ink": 35, "games": ["cloudhop", "acidrain"]},
    "mars":    {"size": 28, "plot_ink": 40, "games": ["duststorm", "olympus"]},
    "jupiter": {"size": 20, "plot_ink": 55, "games": ["stormcatch", "moonsong"]},
    "saturn":  {"size": 20, "plot_ink": 55, "games": ["ringrun", "ringecho"]},
    "uranus":  {"size": 16, "plot_ink": 70, "games": ["icefloe", "aurora"]},
    "neptune": {"size": 16, "plot_ink": 70, "games": ["windrider", "deepdive"]},
    "pluto":   {"size": 12, "plot_ink": 80, "games": ["hearthop", "cometcatch"]},
    "exo":     {"size": 12, "plot_ink": 20, "games": ["aliengarden", "starecho"]}
  },
  "games": {
    "moonlander":  {"seconds": 50, "max_score": 120, "points_per_ink": 5, "max_ink": 25},
    "rockrun":     {"seconds": 45, "max_score": 150, "points_per_ink": 6, "max_ink": 25},
    "sunflare":    {"seconds": 45, "max_score": 150, "points_per_ink": 6, "max_ink": 25},
    "craterleap":  {"seconds": 50, "max_score": 160, "points_per_ink": 6, "max_ink": 25},
    "cloudhop":    {"seconds": 50, "max_score": 160, "points_per_ink": 6, "max_ink": 25},
    "acidrain":    {"seconds": 45, "max_score": 140, "points_per_ink": 5, "max_ink": 25},
    "duststorm":   {"seconds": 45, "max_score": 120, "points_per_ink": 5, "max_ink": 25},
    "olympus":     {"seconds": 50, "max_score": 120, "points_per_ink": 5, "max_ink": 25},
    "stormcatch":  {"seconds": 40, "max_score": 100, "points_per_ink": 4, "max_ink": 25},
    "moonsong":    {"seconds": 50, "max_score": 120, "points_per_ink": 5, "max_ink": 25},
    "ringrun":     {"seconds": 45, "max_score": 150, "points_per_ink": 6, "max_ink": 25},
    "ringecho":    {"seconds": 50, "max_score": 120, "points_per_ink": 5, "max_ink": 25},
    "icefloe":     {"seconds": 45, "max_score": 120, "points_per_ink": 5, "max_ink": 25},
    "aurora":      {"seconds": 40, "max_score": 100, "points_per_ink": 4, "max_ink": 25},
    "windrider":   {"seconds": 50, "max_score": 160, "points_per_ink": 6, "max_ink": 25},
    "deepdive":    {"seconds": 45, "max_score": 140, "points_per_ink": 5, "max_ink": 25},
    "hearthop":    {"seconds": 45, "max_score": 120, "points_per_ink": 5, "max_ink": 25},
    "cometcatch":  {"seconds": 40, "max_score": 100, "points_per_ink": 4, "max_ink": 25},
    "aliengarden": {"seconds": 45, "max_score": 140, "points_per_ink": 5, "max_ink": 25},
    "starecho":    {"seconds": 50, "max_score": 120, "points_per_ink": 5, "max_ink": 25}
  }
}', 'Planet plots: map size and plot price (Ink, plus price_step for each plot you already own there) per world, the two minigames on each world''s plots, rewarded rounds per plot a day and the daily planet Ink cap.')
on conflict (key) do nothing;

create table if not exists public.planet_plots (
  world text not null,
  gx int not null,
  gy int not null,
  owner_id uuid not null references public.players (id) on delete cascade,
  name text check (name is null or char_length(name) between 1 and 32),
  claimed_at timestamptz not null default now(),
  primary key (world, gx, gy)
);
create index if not exists planet_plots_owner_idx on public.planet_plots (owner_id);
alter table public.planet_plots enable row level security;
revoke all on public.planet_plots from anon, authenticated;

create table if not exists public.planet_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  world text not null, gx int not null, gy int not null,
  game text not null, seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score int, ink int, rewarded boolean not null default true
);
create index if not exists planet_games_plot_idx on public.planet_games (world, gx, gy, started_at desc);
alter table public.planet_games enable row level security;
revoke all on public.planet_games from anon, authenticated;

alter table public.space_pilots add column if not exists planet_ink_day timestamptz, add column if not exists planet_ink_today int not null default 0;

create or replace function private.planet_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('planets'), '{}'::jsonb) $$;
/** 'moon' -> 'moon'; 'exo:123' -> 'exo' */
create or replace function private.planet_key(p_world text) returns text language sql immutable as $$ select case when p_world like 'exo:%' then 'exo' else p_world end $$;

/** May this player see (and, landed, build on) this world's map? Solar worlds: everyone; a far-off world: only its settler. */
create or replace function private.planet_open(p_uid uuid, p_world text) returns boolean
language sql stable as $$
  select case when p_world like 'exo:%' then exists (select 1 from public.space_pilots where player_id = p_uid and 'exo:' || home_seed = p_world)
    else (private.planet_cfg() -> 'worlds') ? p_world end
$$;

create or replace function private.planet_price(p_uid uuid, p_world text) returns int
language sql stable as $$
  select coalesce((private.planet_cfg() -> 'worlds' -> private.planet_key(p_world) ->> 'plot_ink')::int, 40)
       + coalesce((private.planet_cfg() ->> 'price_step')::int, 5) * (select count(*)::int from public.planet_plots where owner_id = p_uid and world = p_world)
$$;

/** A world's map: its size, every claimed plot (with its owner), who's there right now, and what a plot costs you. */
create or replace function public.planet_map(p_world text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); w jsonb; s public.space_pilots%rowtype;
begin
  if not private.planet_open(v_uid, p_world) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  w := private.planet_cfg() -> 'worlds' -> private.planet_key(p_world);
  select * into s from public.space_pilots where player_id = v_uid;
  return jsonb_build_object(
    'world', p_world, 'rows', coalesce((w ->> 'size')::int, 16), 'cols', 2 * coalesce((w ->> 'size')::int, 16), 'games', w -> 'games',
    'price', private.planet_price(v_uid, p_world),
    'landed', s.player_id is not null and s.location = p_world and s.dest is null,
    'plots', (select coalesce(jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'name', p.name, 'mine', p.owner_id = v_uid,
                'owner', jsonb_build_object('username', pr.username, 'accent', pr.accent_color)) order by p.claimed_at), '[]'::jsonb)
              from public.planet_plots p join public.profiles pr on pr.id = p.owner_id where p.world = p_world),
    'pilots', (select coalesce(jsonb_agg(private.profile_json(x.player_id)), '[]'::jsonb) from (
                select player_id from public.space_pilots where location = p_world and dest is null and private.visible_to(player_id, v_uid)
                order by updated_at desc limit 24) x),
    'ink_today', case when s.planet_ink_day is distinct from private.day_start(now()) then 0 else coalesce(s.planet_ink_today, 0) end,
    'daily_cap', coalesce((private.planet_cfg() ->> 'daily_cap')::int, 200));
end $$;

/** Buy a plot on the world you've landed on. */
create or replace function public.planet_claim(p_world text, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; v_size int; v_price int;
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
  insert into public.planet_plots (world, gx, gy, owner_id) values (p_world, p_gx, p_gy, v_uid);
  return public.planet_map(p_world) || jsonb_build_object('claimed', jsonb_build_array(p_gx, p_gy), 'paid', v_price);
end $$;

create or replace function public.planet_rename(p_world text, p_gx int, p_gy int, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_name text := private.clean_plot_name(p_name);
begin
  update public.planet_plots set name = v_name where world = p_world and gx = p_gx and gy = p_gy and owner_id = v_uid;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true);
end $$;

/** Every planet plot you own, across all worlds. */
create or replace function public.my_planet_plots() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('world', world, 'gx', gx, 'gy', gy, 'name', name, 'claimed_at', claimed_at) order by claimed_at), '[]'::jsonb)
  from public.planet_plots where owner_id = auth.uid()
$$;

/** Planet Ink: one daily cap across every planet plot's games. */
create or replace function private.planet_pay(p_uid uuid, p_amount int, p_ref text, p_idem text) returns int
language plpgsql as $$
declare s public.space_pilots%rowtype; v_day timestamptz := private.day_start(now()); v_cap int := coalesce((private.planet_cfg() ->> 'daily_cap')::int, 200); v_pay int;
begin
  if p_amount <= 0 then return 0; end if;
  select * into s from public.space_pilots where player_id = p_uid for update;
  if s.planet_ink_day is distinct from v_day then s.planet_ink_today := 0; end if;
  v_pay := least(p_amount, greatest(0, v_cap - s.planet_ink_today));
  update public.space_pilots set planet_ink_day = v_day, planet_ink_today = s.planet_ink_today + v_pay where player_id = p_uid;
  if v_pay > 0 then perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'space', 'planet_game', p_ref, p_idem); end if;
  return v_pay;
end $$;

/** Play one of your planet plot's two games. The first few rounds a day on each plot pay Ink. */
create or replace function public.planet_game_start(p_world text, p_gx int, p_gy int, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g jsonb; v public.planet_games%rowtype; v_done int; v_max int := coalesce((private.planet_cfg() ->> 'rounds_per_plot')::int, 3);
begin
  perform private.rate_limit('planet_game', 120, 3600);
  if not exists (select 1 from public.planet_plots where world = p_world and gx = p_gx and gy = p_gy and owner_id = v_uid) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not ((private.planet_cfg() -> 'worlds' -> private.planet_key(p_world) -> 'games') ? p_game) then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  g := private.planet_cfg() -> 'games' -> p_game;
  select count(*) into v_done from public.planet_games
   where world = p_world and gx = p_gx and gy = p_gy and owner_id = v_uid and rewarded and started_at >= private.day_start(now());
  insert into public.planet_games (owner_id, world, gx, gy, game, seed, rewarded)
  values (v_uid, p_world, p_gx, p_gy, p_game, floor(random() * 2147483647)::int, v_done < v_max) returning * into v;
  perform private.space_pilot(v_uid);
  return jsonb_build_object('session', v.id, 'seed', v.seed, 'game', p_game, 'seconds', coalesce((g ->> 'seconds')::int, 45),
    'rewarded', v.rewarded, 'rounds_left', greatest(0, v_max - v_done - case when v.rewarded then 1 else 0 end));
end $$;

create or replace function public.planet_game_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v public.planet_games%rowtype; g jsonb; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0;
begin
  select * into v from public.planet_games where id = p_session for update;
  if not found or v.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if v.finished_at is not null then return jsonb_build_object('score', v.score, 'paid', v.ink, 'repeat', true); end if;
  g := private.planet_cfg() -> 'games' -> v.game;
  v_secs := extract(epoch from (now() - v.started_at));
  if v_secs < coalesce((g ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 100)));
  if v.rewarded and v_secs <= 1800 then
    v_ink := least(coalesce((g ->> 'max_ink')::int, 25), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 5))))::int;
    v_paid := private.planet_pay(v_uid, v_ink, v.id::text, 'pgame:' || v.id);
  end if;
  update public.planet_games set finished_at = now(), score = v_score, ink = v_paid where id = v.id;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'rewarded', v.rewarded, 'balances', private.balances(v_uid),
    'best', (select max(score) from public.planet_games where owner_id = v_uid and game = v.game and finished_at is not null));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.planet_cfg()', 'private.planet_key(text)', 'private.planet_open(uuid, text)', 'private.planet_price(uuid, text)', 'private.planet_pay(uuid, int, text, text)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.planet_map(text)', 'public.planet_claim(text, int, int)', 'public.planet_rename(text, int, int, text)', 'public.my_planet_plots()',
    'public.planet_game_start(text, int, int, text)', 'public.planet_game_finish(uuid, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
