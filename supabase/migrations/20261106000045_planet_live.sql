-- v0.28 Live worlds: explorers on the same world walk together in real time. Everyone on a world is
-- put in a live group of at most 10 (the fullest group with room first, so newcomers land next to
-- someone who's there right now; 20 explorers make two groups of 10). Each client sends a heartbeat
-- with where it is; the server answers with the group's members and their last positions (movement
-- in between is streamed client-to-client on a realtime channel where available). And the Moon is
-- much bigger now — lots more plots.

update public.game_config
   set value = jsonb_set(jsonb_set(value, '{worlds,moon,size}', '60'), '{live}', coalesce(value -> 'live', '{"group_size": 10, "stale_seconds": 15}'))
 where key = 'planets';

create table if not exists public.planet_presence (
  player_id uuid primary key references public.players (id) on delete cascade,
  world text not null,
  shard int not null,
  d float8[] not null,          -- where you are on the globe (unit vector)
  face float8[] not null,       -- which way you're facing
  hop real not null default 0,  -- how high you are mid-jump
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists planet_presence_world_idx on public.planet_presence (world, shard, seen_at desc);
alter table public.planet_presence enable row level security;
revoke all on public.planet_presence from anon, authenticated;

create or replace function private.unit3(p jsonb) returns float8[] language plpgsql immutable as $$
declare x float8; y float8; z float8; l float8;
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 3 then return null; end if;
  begin x := (p ->> 0)::float8; y := (p ->> 1)::float8; z := (p ->> 2)::float8; exception when others then return null; end;
  l := sqrt(x * x + y * y + z * z);
  if l is null or l < 1e-6 or l = 'Infinity'::float8 or l = 'NaN'::float8 then return null; end if;
  return array[x / l, y / l, z / l];
end $$;

/** Heartbeat on a world: keeps (or finds) your live group, stores where you are, returns the group. */
create or replace function public.planet_live(p_world text, p_d jsonb default null, p_face jsonb default null, p_hop real default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  s public.space_pilots%rowtype;
  v_cfg jsonb := coalesce(private.planet_cfg() -> 'live', '{}'::jsonb);
  v_max int := coalesce((v_cfg ->> 'group_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((v_cfg ->> 'stale_seconds')::int, 15));
  me public.planet_presence%rowtype;
  v_shard int; v_new boolean := false; v_d float8[] := private.unit3(p_d); v_face float8[] := private.unit3(p_face);
  v_spawn jsonb;
begin
  perform private.rate_limit('planet_live', 9000, 3600);
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  if not private.planet_open(v_uid, p_world) and p_world not like 'exo:%' then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('planet-live:' || p_world));
  select * into me from public.planet_presence where player_id = v_uid;
  if found and me.world = p_world and me.seen_at > now() - v_stale then
    v_shard := me.shard;
  else
    v_new := true;
    -- the fullest live group that still has room; else the first free group number
    select shard into v_shard from public.planet_presence
     where world = p_world and seen_at > now() - v_stale and player_id <> v_uid
     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;
    if v_shard is null then
      select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
       where not exists (select 1 from public.planet_presence where world = p_world and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
    end if;
    -- land right next to someone who's here
    select jsonb_build_object('d', to_jsonb(p.d), 'player', p.player_id) into v_spawn from public.planet_presence p
     where p.world = p_world and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid
     order by p.seen_at desc limit 1;
  end if;
  insert into public.planet_presence (player_id, world, shard, d, face, hop, joined_at, seen_at)
  values (v_uid, p_world, v_shard, coalesce(v_d, array[0, 0, 1]::float8[]), coalesce(v_face, array[0, 1, 0]::float8[]), greatest(0, least(50, coalesce(p_hop, 0))), now(), now())
  on conflict (player_id) do update set world = excluded.world, shard = excluded.shard,
    d = coalesce(v_d, case when v_new then excluded.d else planet_presence.d end),
    face = coalesce(v_face, planet_presence.face), hop = excluded.hop,
    joined_at = case when v_new then now() else planet_presence.joined_at end, seen_at = now();
  return jsonb_build_object(
    'world', p_world, 'shard', v_shard, 'joined', v_new, 'spawn', v_spawn, 'group_size', v_max,
    'channel', 'planet:' || p_world || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('d', to_jsonb(p.d), 'face', to_jsonb(p.face), 'hop', p.hop) order by p.joined_at), '[]'::jsonb)
                from public.planet_presence p
                where p.world = p_world and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'on_world', (select count(*) from public.planet_presence where world = p_world and seen_at > now() - v_stale));
end $$;

create or replace function public.planet_leave() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.planet_presence where player_id = private.require_active_player();
  return jsonb_build_object('ok', true);
end $$;

-- the world map's explorer list is everyone live there now
create or replace function private.planet_here(p_world text, p_viewer uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(private.profile_json(x.player_id)), '[]'::jsonb) from (
    select player_id from public.planet_presence
     where world = p_world and seen_at > now() - interval '30 seconds' and private.visible_to(player_id, p_viewer)
     order by seen_at desc limit 50) x
$$;

do $$
declare f text;
begin
  execute 'revoke all on function private.unit3(jsonb) from public';
  execute 'revoke all on function private.planet_here(text, uuid) from public';
  foreach f in array array['public.planet_live(text, jsonb, jsonb, real)', 'public.planet_leave()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
