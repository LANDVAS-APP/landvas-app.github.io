-- v0.9.8 Travellers: see other players' train rides and flights on the map (and in a list) while you travel.
-- Privacy: trips home are never shown; hidden, banned and blocked players aren't either; a train that sets off from
-- someone's home station shows only from its first stop on the way (so it doesn't give away where they live); and
-- anyone can stop sharing their trips.

alter table public.travel_trips add column if not exists from_home boolean not null default false;
create table if not exists public.travel_prefs (
  player_id uuid primary key references public.players (id) on delete cascade,
  share boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.travel_prefs enable row level security;
revoke all on public.travel_prefs from anon, authenticated;
create index if not exists travel_trips_recent on public.travel_trips (departs_at desc) where mode in ('train', 'plane');

-- a trip from where you live (not from a stop you travelled to) is marked as such
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.travel_depart(text,text)'::regprocedure);
  n := replace(d, '  insert into public.travel_trips (player_id, mode, from_stop, to_stop, stops, km, arrives_at)' || chr(10) ||
                  '  values (v_uid, p_mode, p -> ''from'' ->> ''id'', p -> ''to'' ->> ''id'', p -> ''stops'', (p ->> ''km'')::numeric, now() + make_interval(secs => (p ->> ''seconds'')::int))',
                  '  insert into public.travel_trips (player_id, mode, from_stop, to_stop, stops, km, arrives_at, from_home)' || chr(10) ||
                  '  values (v_uid, p_mode, p -> ''from'' ->> ''id'', p -> ''to'' ->> ''id'', p -> ''stops'', (p ->> ''km'')::numeric, now() + make_interval(secs => (p ->> ''seconds'')::int), e.mode <> ''travel'')');
  if n = d then raise exception 'travel_traffic: travel_depart anchor not found'; end if;
  execute n;
end $$;

/** other travellers' rides and flights: under way, or in the last few hours */
create or replace function public.travel_traffic() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  select coalesce(jsonb_agg(x.j order by x.done, x.departs_at desc), '[]'::jsonb) into v_out from (
    select t.arrived or t.arrives_at <= now() as done, t.departs_at,
      private.profile_json(t.player_id) || jsonb_build_object(
        'trip', t.id, 'mode', t.mode, 'km', t.km, 'arrived', t.arrived or t.arrives_at <= now(),
        'to', jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code, 'country', b.country, 'lng', b.lng, 'lat', b.lat),
        -- a train from home shows from its first stop on the way: its home station stays private
        'from', case when t.from_home and t.mode = 'train' then null
                     else jsonb_build_object('id', a.id, 'name', a.name, 'code', a.code, 'country', a.country, 'lng', a.lng, 'lat', a.lat) end,
        'stops', t.stops,
        -- the part shown runs from `starts_at` (the first stop, for a hidden start) to `arrives_at`
        'starts_at', case when t.from_home and t.mode = 'train' and jsonb_array_length(t.stops) > 0
                          then t.departs_at + (t.arrives_at - t.departs_at) * (t.stops -> 0 ->> 't')::float8 else t.departs_at end,
        'arrives_at', t.arrives_at) as j
    from public.travel_trips t
    join public.travel_stops b on b.id = t.to_stop
    left join public.travel_stops a on a.id = t.from_stop
    where t.mode in ('train', 'plane') and t.departs_at > now() - interval '6 hours'
      and t.player_id is distinct from v_uid
      and private.visible_to(t.player_id, v_uid)
      and coalesce((select p.share from public.travel_prefs p where p.player_id = t.player_id), true)
      -- a train from home with no stop on the way would show nothing but its destination
      and not (t.from_home and t.mode = 'train' and jsonb_array_length(t.stops) = 0)
    order by t.departs_at desc
    limit 50
  ) x;
  return v_out;
end $$;

create or replace function public.travel_share(p_share boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  insert into public.travel_prefs (player_id, share) values (v_uid, coalesce(p_share, true))
  on conflict (player_id) do update set share = excluded.share, updated_at = now();
  return jsonb_build_object('share', coalesce(p_share, true));
end $$;

-- travel_status says whether you share your trips
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.travel_status()'::regprocedure);
  n := replace(d, '''explorer'', private.explorer_json(v_uid));',
    '''share'', coalesce((select share from public.travel_prefs where player_id = v_uid), true), ''explorer'', private.explorer_json(v_uid));');
  if n = d then raise exception 'travel_traffic: travel_status anchor not found'; end if;
  execute n;
end $$;

-- an arrival waits to be shown: whatever notices it first (a GPS report, the joystick, the map), the next look at
-- travel_status still brings the welcome card and the stamp
alter table public.travel_trips add column if not exists arrival jsonb;
alter table public.travel_trips add column if not exists arrival_seen boolean not null default false;
create index if not exists travel_trips_unseen on public.travel_trips (player_id) where arrival is not null and not arrival_seen;
do $$
declare d text; n text; x text;
begin
  d := pg_get_functiondef('private.travel_settle(uuid)'::regprocedure);
  n := replace(d, '    return jsonb_build_object(''home'', true);',
    '    update public.travel_trips set arrival = jsonb_build_object(''home'', true) where id = t.id;' || chr(10) || '    return jsonb_build_object(''home'', true);');
  x := 'jsonb_build_object(''stop'', private.stop_json(s), ''new_stamp'', v_new, ''new_country'', v_country, ''ink'', v_ink, ''mode'', t.mode)';
  n := replace(n, '  return ' || x || ';', '  update public.travel_trips set arrival = ' || x || ' where id = t.id;' || chr(10) || '  return ' || x || ';');
  if (length(n) - length(replace(n, 'set arrival =', ''))) / length('set arrival =') <> 2 then raise exception 'travel_traffic: travel_settle anchors not found'; end if;
  execute n;
  d := pg_get_functiondef('public.travel_status()'::regprocedure);
  n := replace(d, '  v_arr := private.travel_settle(v_uid);',
    '  perform private.travel_settle(v_uid);' || chr(10) ||
    '  select arrival into v_arr from public.travel_trips where player_id = v_uid and arrival is not null and not arrival_seen order by arrives_at desc limit 1;' || chr(10) ||
    '  update public.travel_trips set arrival_seen = true where player_id = v_uid and arrival is not null and not arrival_seen;');
  if n = d then raise exception 'travel_traffic: travel_status anchor not found'; end if;
  execute n;
end $$;

revoke all on function public.travel_traffic() from public, anon;
grant execute on function public.travel_traffic() to authenticated;
revoke all on function public.travel_share(boolean) from public, anon;
grant execute on function public.travel_share(boolean) to authenticated;
