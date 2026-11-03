-- v0.32 Companions and visiting sanctuaries.
--  * Star one of your Inkborn as your companion: it roams with you wherever it can — beside your
--    explorer on the map, on the planets (the explorers in your live group see it too), and into any
--    sanctuary you visit.
--  * The sanctuary directory: find anyone's sanctuary from the Inkborn area — search by name, or
--    browse the liveliest, the newest, and your friends'.

alter table public.inkborn_keepers add column if not exists companion_id uuid references public.inkborn (id) on delete set null;

/** A player's companion, small enough to send round a live group: {id, name, genome}. */
create or replace function private.companion_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'genome', c.genome)
  from public.inkborn_keepers k join public.inkborn c on c.id = k.companion_id and c.owner_id = p_uid
  where k.owner_id = p_uid
$$;

create or replace function public.inkborn_set_companion(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if p_id is not null and not exists (select 1 from public.inkborn where id = p_id and owner_id = v_uid) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  insert into public.inkborn_keepers (owner_id, companion_id) values (v_uid, p_id)
  on conflict (owner_id) do update set companion_id = excluded.companion_id;
  return jsonb_build_object('companion', private.companion_json(v_uid));
end $$;

create or replace function public.my_sanctuaries() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_starter uuid;
begin
  v_starter := private.starter_habitat(v_uid);
  return jsonb_build_object(
    'habitats', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'kind', h.kind, 'group_id', h.group_id, 'plots', private.habitat_plots(h),
                   'capacity', private.habitat_capacity(h), 'creatures', (select count(*) from public.inkborn c where c.habitat_id = h.id),
                   'name', case when h.kind = 'starter' then 'Starter sanctuary' else (select name from public.canvas_groups where id = h.group_id) end)
                   order by h.kind desc, h.created_at), '[]'::jsonb)
                 from public.habitats h left join public.canvas_groups g on g.id = h.group_id
                 where h.owner_id = v_uid and (h.kind = 'starter' or (g.kind = 'habitat' and g.status = 'active'))),
    'creatures', (select coalesce(jsonb_agg(private.inkborn_json(c, v_uid) order by c.created_at), '[]'::jsonb) from public.inkborn c where c.owner_id = v_uid),
    'starter_id', v_starter,
    'companion_id', (select companion_id from public.inkborn_keepers where owner_id = v_uid),
    'max_creatures', coalesce((private.ink_cfg() ->> 'max_creatures')::int, 60),
    'ai_portraits', coalesce((private.ink_cfg() ->> 'ai_portraits')::boolean, false));
end $$;

/** Everyone's sanctuaries (with at least one creature): search by name; sort 'lively' | 'new' | 'friends'. */
create or replace function public.sanctuary_directory(p_query text default null, p_sort text default 'lively', p_limit int default 24, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_q text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 60); v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  return jsonb_build_object('items', (select coalesce(jsonb_agg(x.j order by x.rk), '[]'::jsonb) from (
    select row_number() over (order by
             case when p_sort = 'new' then extract(epoch from h.created_at) else 0 end desc,
             case when p_sort = 'friends' then extract(epoch from pl.last_active_at) else 0 end desc,
             n.cnt desc, pl.last_active_at desc) rk,
           jsonb_build_object('id', h.id, 'kind', h.kind, 'plots', private.habitat_plots(h), 'creatures', n.cnt, 'capacity', private.habitat_capacity(h),
             'name', case when h.kind = 'starter' then 'Starter sanctuary' else coalesce((select name from public.canvas_groups where id = h.group_id), 'Habitat') end,
             'owner', private.profile_json(h.owner_id), 'friend', private.friend_state(v_uid, h.owner_id) = 'friends', 'active_at', pl.last_active_at,
             'preview', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'genome', c.genome) order by c.bond desc), '[]'::jsonb)
                         from (select * from public.inkborn c where c.habitat_id = h.id order by c.bond desc limit 3) c)) j
    from public.habitats h
    join public.players pl on pl.id = h.owner_id
    join public.profiles pr on pr.id = h.owner_id
    join lateral (select count(*)::int cnt from public.inkborn c where c.habitat_id = h.id) n on true
    left join public.canvas_groups g on g.id = h.group_id
    where h.owner_id <> v_uid and n.cnt > 0 and private.visible_to(h.owner_id, v_uid)
      and (h.kind = 'starter' or (g.kind = 'habitat' and g.status = 'active'))
      and (p_sort <> 'friends' or private.friend_state(v_uid, h.owner_id) = 'friends')
      and (v_q is null or lower(pr.username) like '%' || v_q || '%' or lower(coalesce(pr.display_name, '')) like '%' || v_q || '%' or lower(coalesce(g.name, '')) like '%' || v_q || '%')
    order by 1 limit v_limit offset v_off) x));
end $$;

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
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('d', to_jsonb(p.d), 'face', to_jsonb(p.face), 'hop', p.hop,
                  'companion', private.companion_json(p.player_id)) order by p.joined_at), '[]'::jsonb)
                from public.planet_presence p
                where p.world = p_world and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'on_world', (select count(*) from public.planet_presence where world = p_world and seen_at > now() - v_stale));
end $$;

do $$
declare f text;
begin
  execute 'revoke all on function private.companion_json(uuid) from public';
  foreach f in array array['public.inkborn_set_companion(uuid)', 'public.sanctuary_directory(text, text, int, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
