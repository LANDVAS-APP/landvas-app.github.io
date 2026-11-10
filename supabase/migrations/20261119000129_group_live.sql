-- v1.0.0 Travelling together, live.
--  * Your travel group moves live on the map, as their own explorers: positions stream over a private realtime
--    channel just for the group (its name is secret, and changes whenever someone leaves or is removed). Only
--    members away travelling ever send — never anyone at home, never anyone heading home.
--  * Group games, right where you are (around the station or airport you arrived at):
--      Balloon Rush — balloons fill the streets around the leader; pop the most in 2 minutes.
--      Flag Race — a flag goes up half a kilometre away; first one there wins.
--  * Group photos: everyone together at a stop → a group photo for everyone's passport.

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.grant(uuid,jsonb,text,text,text,text)'::regprocedure);
  n := replace(d, '''travel'', ''finds'') then', '''travel'', ''finds'', ''group_game'') then');
  if n = d then raise exception 'group_live: grant anchor not found'; end if;
  execute n;
end $$;

insert into public.game_config (key, value) values ('group_games', $cfg${
  "balloons": {"count": 22, "radius_m": 320, "min_m": 40, "seconds": 120, "reach_m": 45, "ink_each": 1, "ink_cap": 12, "winner_ink": 5},
  "race": {"min_m": 350, "max_m": 650, "seconds": 300, "reach_m": 30, "winner_ink": 10},
  "countdown_s": 5, "photo_m": 250
}$cfg$::jsonb) on conflict (key) do update set value = excluded.value;
create or replace function private.gg_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('group_games'), '{}'::jsonb) $$;

-- ---- the group's private live channel ---------------------------------------------------------------------------
alter table public.travel_groups add column if not exists channel_key text not null default md5(gen_random_uuid()::text || clock_timestamp()::text);
create or replace function private.group_rekey(p_group uuid) returns void language sql as $$
  update public.travel_groups set channel_key = md5(gen_random_uuid()::text || clock_timestamp()::text) where id = p_group
$$;
-- leaving, or being removed, changes the channel: whoever left can't keep listening
create or replace function private.group_leave(p_uid uuid) returns void language plpgsql as $$
declare g public.travel_groups%rowtype; v_next uuid;
begin
  select * into g from public.travel_groups where id = private.my_group(p_uid) for update;
  if not found then return; end if;
  delete from public.travel_group_members where group_id = g.id and player_id = p_uid;
  if g.leader_id = p_uid then
    select player_id into v_next from public.travel_group_members where group_id = g.id order by joined_at limit 1;
    if v_next is null then delete from public.travel_groups where id = g.id; return;
    else update public.travel_groups set leader_id = v_next where id = g.id; end if;
  end if;
  perform private.group_rekey(g.id);
end $$;
create or replace function public.travel_group_kick(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid);
begin
  if v_g is null or not exists (select 1 from public.travel_groups where id = v_g and leader_id = v_uid) then raise exception 'not_group_leader' using errcode = 'P0001'; end if;
  if p_player = v_uid then raise exception 'not_group_leader' using errcode = 'P0001'; end if;
  delete from public.travel_group_members where group_id = v_g and player_id = p_player;
  perform private.group_rekey(v_g);
  return public.travel_group();
end $$;

-- ---- group games ------------------------------------------------------------------------------------------------
create table if not exists public.group_games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups (id) on delete cascade,
  kind text not null check (kind in ('balloons', 'race')),
  started_by uuid not null references public.players (id) on delete cascade,
  lng float8 not null, lat float8 not null,
  items jsonb not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  winner uuid references public.players (id) on delete set null,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists group_games_group on public.group_games (group_id, created_at desc);
create index if not exists group_games_by on public.group_games (started_by);
create index if not exists group_games_winner on public.group_games (winner);
create table if not exists public.group_game_hits (
  game_id uuid not null references public.group_games (id) on delete cascade,
  item int not null,
  player_id uuid not null references public.players (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (game_id, item)
);
create index if not exists group_game_hits_player on public.group_game_hits (player_id);
alter table public.group_games enable row level security;
alter table public.group_game_hits enable row level security;
revoke all on public.group_games, public.group_game_hits from anon, authenticated;

/** a point d metres from (lng, lat) on bearing b (degrees) */
create or replace function private.offset_ll(p_lng float8, p_lat float8, p_d float8, p_b float8) returns float8[] language sql immutable as $$
  select array[p_lng + p_d * sin(radians(p_b)) / (111320 * cos(radians(p_lat))), p_lat + p_d * cos(radians(p_b)) / 110574]
$$;

/** a game is over: its rewards are paid once */
create or replace function private.group_game_settle(p_game uuid) returns void language plpgsql as $$
declare g public.group_games%rowtype; c jsonb; r record; v_win uuid; v_ties int;
begin
  select * into g from public.group_games where id = p_game for update;
  if not found or g.settled or (g.ends_at > now() and g.winner is null) then return; end if;
  c := private.gg_cfg() -> g.kind;
  if g.kind = 'balloons' then
    for r in select player_id, count(*)::int n from public.group_game_hits where game_id = g.id group by player_id loop
      perform private.grant(r.player_id, jsonb_build_object('ink', least(r.n * coalesce((c ->> 'ink_each')::int, 1), coalesce((c ->> 'ink_cap')::int, 12))),
        'group_game', 'group_game', g.id::text, 'gg:' || g.id || ':' || r.player_id);
    end loop;
    with sc as (select player_id, count(*)::int n from public.group_game_hits where game_id = g.id group by player_id)
    select (select player_id from sc order by n desc limit 1), (select count(*)::int from sc where n = (select max(n) from sc)) into v_win, v_ties;
    -- one clear winner gets the bonus (a tie is just a tie)
    if v_ties <> 1 then v_win := null; end if;
  else
    v_win := g.winner;
  end if;
  if v_win is not null then
    perform private.grant(v_win, jsonb_build_object('ink', coalesce((c ->> 'winner_ink')::int, 5)), 'group_game', 'group_game', g.id::text, 'gg:' || g.id || ':win');
  end if;
  update public.group_games set settled = true, winner = v_win, ends_at = least(ends_at, now()) where id = g.id;
end $$;

create or replace function private.group_game_json(p_game uuid, p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', g.id, 'kind', g.kind, 'lng', g.lng, 'lat', g.lat, 'starts_at', g.starts_at, 'ends_at', g.ends_at,
    'over', g.settled or g.ends_at <= now() or g.winner is not null, 'winner', case when g.winner is null then null else private.profile_json(g.winner) end,
    'started_by', (select username from public.profiles where id = g.started_by),
    'items', (select jsonb_agg(it || jsonb_build_object('i', o - 1, 'by', (select username from public.profiles p join public.group_game_hits h on h.player_id = p.id where h.game_id = g.id and h.item = o - 1)) order by o)
               from jsonb_array_elements(g.items) with ordinality as e(it, o)),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'id', p.id, 'n', s.n, 'me', p.id = p_uid) order by s.n desc, p.username), '[]'::jsonb)
                 from (select player_id, count(*)::int n from public.group_game_hits where game_id = g.id group by player_id) s join public.profiles p on p.id = s.player_id))
  from public.group_games g where g.id = p_game
$$;

/** the group's game: under way, or the last one (for a little while) */
create or replace function public.group_game_status() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid); v_id uuid;
begin
  if v_g is null then return null; end if;
  select id into v_id from public.group_games where group_id = v_g and created_at > now() - interval '15 minutes' order by created_at desc limit 1;
  if v_id is null then return null; end if;
  perform private.group_game_settle(v_id);
  return private.group_game_json(v_id, v_uid);
end $$;

/** start a game right where you are (you need to be away travelling, standing at your stop) */
create or replace function public.group_game_start(p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid); e public.explorers%rowtype; c record;
  cfg jsonb := private.gg_cfg(); k jsonb := private.gg_cfg() -> p_kind; v_items jsonb := '[]'::jsonb; v_id uuid; i int; v_d float8; v_p float8[];
begin
  perform private.rate_limit('group_game', 30, 3600);
  if p_kind not in ('balloons', 'race') then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  if v_g is null then raise exception 'not_in_group' using errcode = 'P0001'; end if;
  if (select count(*) from public.travel_group_members where group_id = v_g) < 2 then raise exception 'group_too_small' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = v_uid;
  if not found or e.mode <> 'travel' then raise exception 'travel_first' using errcode = 'P0001'; end if;
  select * into c from private.explorer_now(v_uid);
  if c.traveling then raise exception 'on_the_way' using errcode = 'P0001'; end if;
  if exists (select 1 from public.group_games where group_id = v_g and not settled and ends_at > now() and winner is null) then raise exception 'game_on' using errcode = 'P0001'; end if;
  if p_kind = 'balloons' then
    for i in 1..coalesce((k ->> 'count')::int, 22) loop
      -- spread evenly over the area (not bunched in the middle)
      v_d := coalesce((k ->> 'min_m')::float8, 40) + sqrt(random()) * (coalesce((k ->> 'radius_m')::float8, 320) - coalesce((k ->> 'min_m')::float8, 40));
      v_p := private.offset_ll(c.lng, c.lat, v_d, random() * 360);
      v_items := v_items || jsonb_build_array(jsonb_build_object('lng', v_p[1], 'lat', v_p[2], 'c', (array['#FF4F7B', '#FFB020', '#22C3FF', '#8B5CFF', '#2FD27A'])[1 + floor(random() * 5)::int]));
    end loop;
  else
    v_d := coalesce((k ->> 'min_m')::float8, 350) + random() * (coalesce((k ->> 'max_m')::float8, 650) - coalesce((k ->> 'min_m')::float8, 350));
    v_p := private.offset_ll(c.lng, c.lat, v_d, random() * 360);
    v_items := jsonb_build_array(jsonb_build_object('lng', v_p[1], 'lat', v_p[2], 'c', '#FF4F7B'));
  end if;
  insert into public.group_games (group_id, kind, started_by, lng, lat, items, starts_at, ends_at)
  values (v_g, p_kind, v_uid, c.lng, c.lat, v_items, now() + make_interval(secs => coalesce((cfg ->> 'countdown_s')::int, 5)),
          now() + make_interval(secs => coalesce((cfg ->> 'countdown_s')::int, 5) + coalesce((k ->> 'seconds')::int, 120)))
  returning id into v_id;
  return private.group_game_json(v_id, v_uid);
end $$;

/** pop a balloon, or reach the flag (you have to be right there) */
create or replace function public.group_game_hit(p_game uuid, p_item int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.group_games%rowtype; it jsonb; c record; v_d float8; k jsonb;
begin
  perform private.rate_limit('group_game_hit', 900, 3600);
  select * into g from public.group_games where id = p_game for update;
  if not found or g.group_id is distinct from private.my_group(v_uid) then raise exception 'game_not_found' using errcode = 'P0001'; end if;
  if now() < g.starts_at then raise exception 'game_not_started' using errcode = 'P0001'; end if;
  -- too late: the game's over (it says so, and the rewards are paid)
  if g.settled or g.ends_at <= now() or g.winner is not null then
    perform private.group_game_settle(g.id);
    return private.group_game_json(g.id, v_uid) || jsonb_build_object('late', true);
  end if;
  it := g.items -> p_item;
  if it is null then raise exception 'game_not_found' using errcode = 'P0001'; end if;
  k := private.gg_cfg() -> g.kind;
  select * into c from private.explorer_now(v_uid);
  v_d := private.haversine_m(c.lng, c.lat, (it ->> 'lng')::float8, (it ->> 'lat')::float8);
  if c.lng is null or v_d > coalesce((k ->> 'reach_m')::float8, 40) then raise exception 'find_too_far' using errcode = 'P0001', detail = round(coalesce(v_d, 0))::text; end if;
  insert into public.group_game_hits (game_id, item, player_id) values (g.id, p_item, v_uid) on conflict do nothing;
  if not found then raise exception 'already_popped' using errcode = 'P0001'; end if;
  -- the race is won; the balloons are all gone: game over
  if g.kind = 'race' then
    update public.group_games set winner = v_uid, ends_at = now() where id = g.id;
    perform private.group_game_settle(g.id);
  elsif (select count(*) from public.group_game_hits where game_id = g.id) >= jsonb_array_length(g.items) then
    update public.group_games set ends_at = now() where id = g.id;
    perform private.group_game_settle(g.id);
  end if;
  return private.group_game_json(g.id, v_uid);
end $$;

-- ---- group photos -------------------------------------------------------------------------------------------------
create table if not exists public.travel_group_photos (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.travel_groups (id) on delete set null,
  stop_id text references public.travel_stops (id),
  members uuid[] not null,
  taken_by uuid not null references public.players (id) on delete cascade,
  taken_at timestamptz not null default now()
);
create index if not exists travel_group_photos_group on public.travel_group_photos (group_id);
create index if not exists travel_group_photos_by on public.travel_group_photos (taken_by);
create index if not exists travel_group_photos_stop on public.travel_group_photos (stop_id);
create index if not exists travel_group_photos_members on public.travel_group_photos using gin (members);
alter table public.travel_group_photos enable row level security;
revoke all on public.travel_group_photos from anon, authenticated;

create or replace function private.photo_json(p public.travel_group_photos) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'taken_at', p.taken_at,
    'stop', (select private.stop_json(s) from public.travel_stops s where s.id = p.stop_id),
    'members', (select coalesce(jsonb_agg(private.profile_json(m) order by m = p.taken_by desc), '[]'::jsonb) from unnest(p.members) m))
$$;

/** everyone in the group who's here with you (away, at the same stop) poses for a group photo */
create or replace function public.travel_group_photo() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid); c record; v_here uuid[]; e public.explorers%rowtype; s public.travel_stops; p public.travel_group_photos;
begin
  perform private.rate_limit('group_photo', 20, 3600);
  if v_g is null then raise exception 'not_in_group' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = v_uid;
  if not found or e.mode <> 'travel' then raise exception 'travel_first' using errcode = 'P0001'; end if;
  select * into c from private.explorer_now(v_uid);
  if c.traveling then raise exception 'on_the_way' using errcode = 'P0001'; end if;
  select array_agg(m.player_id order by m.player_id = v_uid desc, m.joined_at) into v_here
    from public.travel_group_members m join public.explorers x on x.player_id = m.player_id cross join lateral private.explorer_now(m.player_id) n
   where m.group_id = v_g and x.mode = 'travel' and not n.traveling
     and private.haversine_m(c.lng, c.lat, n.lng, n.lat) <= coalesce((private.gg_cfg() ->> 'photo_m')::float8, 250);
  if coalesce(array_length(v_here, 1), 0) < 2 then raise exception 'nobody_here' using errcode = 'P0001'; end if;
  s := private.travel_here(e);
  insert into public.travel_group_photos (group_id, stop_id, members, taken_by) values (v_g, s.id, v_here, v_uid) returning * into p;
  return private.photo_json(p);
end $$;

/** your group photos (from any group you were in) */
create or replace function public.travel_group_photos() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(private.photo_json(p) order by p.taken_at desc) from (select * from public.travel_group_photos where v_uid = any (members) order by taken_at desc limit 60) p), '[]'::jsonb);
end $$;

-- travel_group carries the private channel (members only), and the game under way
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.travel_group()'::regprocedure);
  n := replace(d, '''id'', g.id, ''code'', g.code,', '''id'', g.id, ''code'', g.code, ''channel'', ''tg-'' || g.channel_key,'
    || ' ''game'', (select jsonb_build_object(''id'', x.id, ''kind'', x.kind, ''ends_at'', x.ends_at) from public.group_games x where x.group_id = g.id and not x.settled and x.ends_at > now() and x.winner is null order by x.created_at desc limit 1),');
  if n = d then raise exception 'group_live: travel_group anchor not found'; end if;
  execute n;
end $$;

do $$ declare f text; begin
  foreach f in array array['private.gg_cfg()', 'private.group_rekey(uuid)', 'private.offset_ll(double precision, double precision, double precision, double precision)',
    'private.group_game_settle(uuid)', 'private.group_game_json(uuid, uuid)', 'private.photo_json(public.travel_group_photos)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.group_game_status()', 'public.group_game_start(text)', 'public.group_game_hit(uuid, integer)',
    'public.travel_group_photo()', 'public.travel_group_photos()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
