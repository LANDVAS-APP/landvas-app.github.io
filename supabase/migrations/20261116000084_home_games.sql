-- House party games: board and party games played live by the people in a home (the home's room of up to 10).
-- Anyone in the room opens a table for a game; others join from the invite; the host starts it. The host's device
-- runs the game and streams it to everyone over the home's live channel; at the end it reports the places and the
-- server pays a few arcade tickets (more for a bigger party, capped per day, never Ink).
-- A record player or jukebox in a home plays music for everyone; its record is saved with the home's style.

create table if not exists public.home_games (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.players (id) on delete cascade,
  shard int not null default 0,
  game text not null,
  host_id uuid not null references public.players (id) on delete cascade,
  seed int not null default floor(random() * 2147483646)::int,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'done', 'cancelled')),
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  settled_at timestamptz
);
create index if not exists home_games_room_idx on public.home_games (home_id, shard, status, created_at desc);
create table if not exists public.home_game_players (
  game_id uuid not null references public.home_games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  slot int, place int, tickets int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index if not exists home_game_players_player_idx on public.home_game_players (player_id, joined_at desc);
create table if not exists public.home_game_days (
  player_id uuid not null references public.players (id) on delete cascade,
  day timestamptz not null, tickets int not null default 0,
  primary key (player_id, day)
);
alter table public.home_games enable row level security;
alter table public.home_game_players enable row level security;
alter table public.home_game_days enable row level security;
revoke all on public.home_games, public.home_game_players, public.home_game_days from anon, authenticated;

update public.game_config set value = value || '{"games": {
  "lobby_minutes": 4, "countdown_seconds": 3, "min_seconds": 20, "daily_tickets": 120, "party_boost": 0.1,
  "place_tickets": [15, 9, 6, 4, 3, 2, 2, 2],
  "list": {
    "fourrow":  {"name": "Four in a Row", "min": 2, "max": 2},
    "checkers": {"name": "Checkers", "min": 2, "max": 2},
    "dots":     {"name": "Dots & Boxes", "min": 2, "max": 4},
    "ladders":  {"name": "Ladders & Slides", "min": 2, "max": 6},
    "doodle":   {"name": "Doodle Guess", "min": 3, "max": 8},
    "rush":     {"name": "Colour Rush", "min": 2, "max": 8}
  }
}}'::jsonb where key = 'home';

-- the record (style.music) and the extra furniture: a games table and a guestbook stand
update public.game_config set value = jsonb_set(value, '{items}', (value -> 'items') || '{
  "game_table": {"price": {}, "mount": "floor"}, "card_table": {"price": {"ink": 4}, "mount": "floor"}, "guestbook": {"price": {}, "mount": "floor"}, "record_player": {"price": {}, "mount": "floor"}
}'::jsonb) where key = 'home';

create or replace function private.home_check_style(p_style jsonb) returns jsonb language plpgsql stable as $$
declare s jsonb := private.home_cfg() -> 'styles'; v jsonb := '{}'::jsonb; k text;
begin
  if p_style is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p_style) <> 'object' then raise exception 'invalid_style' using errcode = 'P0001'; end if;
  foreach k in array array['wall', 'floor', 'view', 'mood'] loop
    if p_style ? k then
      if not (s -> k) ? (p_style ->> k) then raise exception 'invalid_style' using errcode = 'P0001'; end if;
      v := v || jsonb_build_object(k, p_style ->> k);
    end if;
  end loop;
  foreach k in array array['wall_color', 'floor_color', 'trim'] loop
    if p_style ? k then
      if (p_style ->> k) !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'invalid_style' using errcode = 'P0001'; end if;
      v := v || jsonb_build_object(k, upper(p_style ->> k));
    end if;
  end loop;
  -- the record on the record player (a track id, or "off")
  if p_style ? 'music' then
    if coalesce(p_style ->> 'music', '') !~ '^[a-z0-9_-]{1,24}$' then raise exception 'invalid_style' using errcode = 'P0001'; end if;
    v := v || jsonb_build_object('music', p_style ->> 'music');
  end if;
  return v;
end $$;

create or replace function private.hg_cfg() returns jsonb language sql stable as $$ select coalesce(private.home_cfg() -> 'games', '{}'::jsonb) $$;

create or replace function private.hg_json(p_game uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'game', g.game, 'status', g.status, 'host', g.host_id, 'home', g.home_id,
    'seed', case when g.status <> 'lobby' then g.seed end, 'result', g.result,
    'created_at', g.created_at, 'started_at', g.started_at, 'server_time', now(),
    'players', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('slot', p.slot, 'place', p.place, 'tickets', p.tickets)
                  order by p.slot nulls last, p.joined_at), '[]'::jsonb) from public.home_game_players p where p.game_id = g.id))
  from public.home_games g where g.id = p_game
$$;

-- you, in this home's room right now
create or replace function private.hg_here(p_uid uuid, p_home uuid) returns public.home_presence language sql stable as $$
  select * from public.home_presence where player_id = p_uid and host_id = p_home
     and seen_at > now() - make_interval(secs => coalesce((private.home_cfg() ->> 'stale_seconds')::int, 12))
$$;

-- the room's games: open tables, and the one you're in (or just finished)
create or replace function private.hg_room(p_uid uuid, p_home uuid, p_shard int) returns jsonb language plpgsql as $$
declare v_mine uuid; v_lobby interval := make_interval(mins => coalesce((private.hg_cfg() ->> 'lobby_minutes')::int, 4));
begin
  update public.home_games set status = 'cancelled' where home_id = p_home and status = 'lobby' and created_at < now() - v_lobby;
  -- games nobody finished in an hour are closed
  update public.home_games set status = 'cancelled' where home_id = p_home and status = 'playing' and started_at < now() - interval '1 hour';
  select gp.game_id into v_mine from public.home_game_players gp join public.home_games g on g.id = gp.game_id
   where gp.player_id = p_uid and g.home_id = p_home and (g.status in ('lobby', 'playing') or g.settled_at > now() - interval '2 minutes')
   order by gp.joined_at desc limit 1;
  return jsonb_build_object(
    'tables', (select coalesce(jsonb_agg(private.hg_json(g.id) order by g.created_at desc), '[]'::jsonb) from public.home_games g
               where g.home_id = p_home and g.shard = p_shard and g.status = 'lobby' and private.visible_to(g.host_id, p_uid)),
    'game', case when v_mine is not null then private.hg_json(v_mine) end);
end $$;

-- home_live, now with the room's games
create or replace function public.home_live(p_host uuid, p_x real default null, p_z real default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); c jsonb := private.home_cfg();
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  me public.home_presence%rowtype; v_shard int; v_new boolean := false;
begin
  perform private.rate_limit('home_live', 9000, 3600);
  if not exists (select 1 from public.profiles where id = p_host) or not private.visible_to(p_host, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('home-live:' || p_host));
  select * into me from public.home_presence where player_id = v_uid;
  if found and me.host_id = p_host and me.seen_at > now() - v_stale then v_shard := me.shard;
  else
    v_new := true;
    if v_uid = p_host then v_shard := 0;
    else
      select shard into v_shard from public.home_presence
       where host_id = p_host and seen_at > now() - v_stale and player_id <> v_uid
       group by shard having count(*) < v_max order by bool_or(player_id = p_host) desc, count(*) desc, shard limit 1;
      if v_shard is null then
        select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
         where not exists (select 1 from public.home_presence where host_id = p_host and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
      end if;
    end if;
  end if;
  insert into public.home_presence (player_id, host_id, shard, x, z, joined_at, seen_at)
  values (v_uid, p_host, v_shard, greatest(-7, least(7, coalesce(p_x, 0))), greatest(-6, least(6, coalesce(p_z, 4.6))), now(), now())
  on conflict (player_id) do update set host_id = excluded.host_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else home_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else home_presence.z end),
    joined_at = case when v_new then now() else home_presence.joined_at end, seen_at = now();
  return jsonb_build_object('shard', v_shard, 'joined', v_new, 'room_size', v_max, 'channel', 'home:' || p_host || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z,
                  'explorer_style', (select explorer_style from public.profiles where id = p.player_id)) order by p.joined_at), '[]'::jsonb)
                from public.home_presence p
                where p.host_id = p_host and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_home', (select count(*) from public.home_presence where host_id = p_host and seen_at > now() - v_stale))
    || private.hg_room(v_uid, p_host, v_shard);
end $$;

create or replace function public.home_leave() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.home_presence where player_id = v_uid;
  delete from public.home_game_players gp using public.home_games g where gp.game_id = g.id and g.status = 'lobby' and gp.player_id = v_uid;
  update public.home_games set status = 'cancelled' where host_id = v_uid and status = 'lobby';
end $$;

create or replace function public.home_game_create(p_home uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); me public.home_presence%rowtype; v_id uuid;
begin
  perform private.rate_limit('home_game', 240, 3600);
  if private.hg_cfg() -> 'list' -> p_game is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  me := private.hg_here(v_uid, p_home);
  if me.player_id is null then raise exception 'not_in_home' using errcode = 'P0001'; end if;
  -- one table at a time: leave any other lobby
  delete from public.home_game_players gp using public.home_games g where gp.game_id = g.id and g.status = 'lobby' and gp.player_id = v_uid;
  update public.home_games set status = 'cancelled' where host_id = v_uid and status = 'lobby';
  insert into public.home_games (home_id, shard, game, host_id) values (p_home, me.shard, p_game, v_uid) returning id into v_id;
  insert into public.home_game_players (game_id, player_id) values (v_id, v_uid);
  return private.hg_json(v_id);
end $$;

create or replace function public.home_game_join(p_game uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.home_games%rowtype; me public.home_presence%rowtype; v_n int;
begin
  perform private.rate_limit('home_game', 240, 3600);
  select * into g from public.home_games where id = p_game for update;
  if not found or g.status <> 'lobby' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  me := private.hg_here(v_uid, g.home_id);
  if me.player_id is null or me.shard <> g.shard then raise exception 'not_in_home' using errcode = 'P0001'; end if;
  if exists (select 1 from public.home_game_players where game_id = g.id and player_id = v_uid) then return private.hg_json(g.id); end if;
  select count(*) into v_n from public.home_game_players where game_id = g.id;
  if v_n >= (private.hg_cfg() -> 'list' -> g.game ->> 'max')::int then raise exception 'match_full' using errcode = 'P0001'; end if;
  delete from public.home_game_players gp using public.home_games x where gp.game_id = x.id and x.status = 'lobby' and gp.player_id = v_uid;
  update public.home_games set status = 'cancelled' where host_id = v_uid and status = 'lobby';
  insert into public.home_game_players (game_id, player_id) values (g.id, v_uid);
  return private.hg_json(g.id);
end $$;

create or replace function public.home_game_leave(p_game uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.home_games%rowtype;
begin
  select * into g from public.home_games where id = p_game;
  if not found or g.status <> 'lobby' then return; end if;
  if g.host_id = v_uid then update public.home_games set status = 'cancelled' where id = g.id;
  else delete from public.home_game_players where game_id = g.id and player_id = v_uid; end if;
end $$;

create or replace function public.home_game_start(p_game uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.home_games%rowtype; v_n int;
begin
  select * into g from public.home_games where id = p_game for update;
  if not found or g.status <> 'lobby' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if g.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.home_game_players where game_id = g.id;
  if v_n < (private.hg_cfg() -> 'list' -> g.game ->> 'min')::int then raise exception 'need_players' using errcode = 'P0001'; end if;
  -- seats in the order people sat down
  update public.home_game_players gp set slot = s.n - 1
    from (select player_id, row_number() over (order by (player_id = g.host_id) desc, joined_at) n from public.home_game_players where game_id = g.id) s
   where gp.game_id = g.id and gp.player_id = s.player_id;
  update public.home_games set status = 'playing', started_at = now() + make_interval(secs => coalesce((private.hg_cfg() ->> 'countdown_seconds')::int, 3)) where id = g.id;
  return private.hg_json(g.id);
end $$;

-- the host reports places (1 = won; ties allowed); everyone gets a few tickets, more in a bigger party, capped per day
create or replace function public.home_game_report(p_game uuid, p_places jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.home_games%rowtype; c jsonb := private.hg_cfg();
  v_n int; v_boost numeric; r record; v_place int; v_tix int; v_day timestamptz := private.day_start(now()); v_got int; v_cap int := coalesce((c ->> 'daily_tickets')::int, 120);
begin
  select * into g from public.home_games where id = p_game for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if g.status = 'done' then return private.hg_json(g.id); end if;
  if g.status <> 'playing' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if g.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  if g.started_at > now() - make_interval(secs => coalesce((c ->> 'min_seconds')::int, 20)) then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  if p_places is null or jsonb_typeof(p_places) <> 'object' then raise exception 'invalid_result' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.home_game_players where game_id = g.id;
  v_boost := 1 + coalesce((c ->> 'party_boost')::numeric, 0.1) * (v_n - 1);
  for r in select player_id from public.home_game_players where game_id = g.id loop
    v_place := (p_places ->> r.player_id::text)::int;
    if v_place is null or v_place < 1 or v_place > v_n then raise exception 'invalid_result' using errcode = 'P0001'; end if;
    v_tix := floor(coalesce((c -> 'place_tickets' ->> least(v_place, 8) - 1)::int, 2) * v_boost)::int;
    insert into public.home_game_days (player_id, day) values (r.player_id, v_day) on conflict do nothing;
    select tickets into v_got from public.home_game_days where player_id = r.player_id and day = v_day for update;
    v_tix := greatest(0, least(v_tix, v_cap - v_got));
    update public.home_game_days set tickets = tickets + v_tix where player_id = r.player_id and day = v_day;
    if v_tix > 0 then
      perform private.arc_player(r.player_id);
      update public.arcade_players set tickets = tickets + v_tix, lifetime = lifetime + v_tix where player_id = r.player_id;
    end if;
    update public.home_game_players set place = v_place, tickets = v_tix where game_id = g.id and player_id = r.player_id;
  end loop;
  update public.home_games set status = 'done', settled_at = now(), result = jsonb_build_object('places', p_places, 'players', v_n, 'boost', v_boost) where id = g.id;
  return private.hg_json(g.id);
end $$;

create or replace function public.home_game_get(p_game uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if not exists (select 1 from public.home_game_players where game_id = p_game and player_id = v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return private.hg_json(p_game);
end $$;

do $$ declare f text; begin
  foreach f in array array['private.hg_cfg()', 'private.hg_json(uuid)', 'private.hg_here(uuid, uuid)', 'private.hg_room(uuid, uuid, int)', 'private.home_check_style(jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.home_live(uuid, real, real)', 'public.home_leave()', 'public.home_game_create(uuid, text)', 'public.home_game_join(uuid)',
    'public.home_game_leave(uuid)', 'public.home_game_start(uuid)', 'public.home_game_report(uuid, jsonb)', 'public.home_game_get(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
