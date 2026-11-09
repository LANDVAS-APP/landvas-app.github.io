-- v0.7.5 Planet check-ins stop re-sending what the phone already has.
--
-- planet_live was the main server's biggest call by total time: every check-in rebuilt the full profile and companion
-- of everyone in your group. The phone now says which members it already has (p_known), and those come back as just
-- their position; newcomers come in full. Phones still on the old app don't send it and get everything, as before.
drop function if exists public.planet_live(text, jsonb, jsonb, real);
create or replace function public.planet_live(p_world text, p_d jsonb default null, p_face jsonb default null, p_hop real default 0, p_known jsonb default null) returns jsonb
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
  select * into me from public.planet_presence where player_id = v_uid;
  if found and me.world = p_world and me.seen_at > now() - v_stale then
    v_shard := me.shard;
  else
    v_new := true;
    -- only joining needs the world's lock (two arrivals can't both take a group's last spot)
    perform pg_advisory_xact_lock(hashtext('planet-live:' || p_world));
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
  if v_new and p_world not like 'exo:%' and not exists (select 1 from public.feed_events where kind = 'exploring' and player_id = v_uid and data ->> 'world' = p_world and created_at > now() - interval '30 minutes') then
    insert into public.feed_events (kind, player_id, data) values ('exploring', v_uid, jsonb_build_object('world', p_world, 'shard', v_shard));
  end if;
  insert into public.planet_presence (player_id, world, shard, d, face, hop, joined_at, seen_at)
  values (v_uid, p_world, v_shard, coalesce(v_d, array[0, 0, 1]::float8[]), coalesce(v_face, array[0, 1, 0]::float8[]), greatest(0, least(50, coalesce(p_hop, 0))), now(), now() + private.presence_lease())
  on conflict (player_id) do update set world = excluded.world, shard = excluded.shard,
    d = coalesce(v_d, case when v_new then excluded.d else planet_presence.d end),
    face = coalesce(v_face, planet_presence.face), hop = excluded.hop,
    joined_at = case when v_new then now() else planet_presence.joined_at end, seen_at = now() + private.presence_lease();
  return jsonb_build_object(
    'world', p_world, 'shard', v_shard, 'joined', v_new, 'spawn', v_spawn, 'group_size', v_max,
    'channel', 'planet:' || p_world || ':' || v_shard,
    -- members the phone already has (p_known) come back as just where they are; everyone else in full
    'members', (select coalesce(jsonb_agg(case when coalesce(p_known, '[]'::jsonb) ? p.player_id::text
                  then jsonb_build_object('id', p.player_id, 'd', to_jsonb(p.d), 'face', to_jsonb(p.face), 'hop', p.hop, 'known', true)
                  else private.profile_json(p.player_id) || jsonb_build_object('d', to_jsonb(p.d), 'face', to_jsonb(p.face), 'hop', p.hop,
                  'companion', private.companion_json(p.player_id)) end order by p.joined_at), '[]'::jsonb)
                from public.planet_presence p
                where p.world = p_world and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'on_world', (select count(*) from public.planet_presence where world = p_world and seen_at > now() - v_stale));
end $$;

revoke all on function public.planet_live(text, jsonb, jsonb, real, jsonb) from public, anon;
grant execute on function public.planet_live(text, jsonb, jsonb, real, jsonb) to authenticated, service_role;
