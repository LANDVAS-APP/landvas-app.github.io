-- 📡 Meet nearby: LANDVAS players out walking with GPS for real can see that other players are out walking near them —
-- a name and roughly how far — so two players a street apart can know it and say hi (and wave).
--
-- Safety first, by design:
--  * off unless you turn it on, and turning it on means confirming you're 18 or over;
--  * both of you must have it on, and both be on GPS for real right now (a fresh fix);
--  * blocked either way, hidden or banned: never;
--  * never a spot and never a direction: only a rough distance band (right here / a short walk / nearby / in the area);
--  * a wave is the only thing you can send, at most one per person every 10 minutes, and only to someone who could
--    see you too.
-- Players exploring the game without GPS (the joystick, a trip) whose explorer is near you show too, as explorers in the
-- game — how far their explorer is — under the map's own rules (never near their real home, never if they hid).

create table if not exists public.meet_nearby (
  player_id uuid primary key references public.players(id) on delete cascade,
  enabled boolean not null default false,
  adult_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.meet_nearby enable row level security;
revoke all on public.meet_nearby from anon, authenticated;

create table if not exists public.meet_waves (
  from_id uuid not null references public.players(id) on delete cascade,
  to_id uuid not null references public.players(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists meet_waves_pair on public.meet_waves (from_id, to_id, at desc);
create index if not exists meet_waves_to on public.meet_waves (to_id);
alter table public.meet_waves enable row level security;
revoke all on public.meet_waves from anon, authenticated;

-- (a wave lands in their notifications)
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant', 'leviathan', 'power',
  'party_invite', 'party_join', 'chat_reply', 'meet_wave'));

/** the feature's settings (game_config 'meet_nearby': enabled, radius_m, fresh_minutes) */
create or replace function private.meet_cfg() returns jsonb language sql stable as $$
  select coalesce(private.cfg('meet_nearby'), '{}'::jsonb)
$$;
/** this player has it on (and has said they're 18 or over) */
create or replace function private.meet_on(p_uid uuid) returns boolean language sql stable as $$
  select coalesce((select m.enabled and m.adult_at is not null from public.meet_nearby m where m.player_id = p_uid), false)
$$;
/** out on GPS for real, right now: a real fix in the last few minutes */
create or replace function private.on_gps_now(p_uid uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.explorers e where e.player_id = p_uid and e.mode = 'gps' and e.gps_lng is not null
                   and e.gps_at > now() - make_interval(mins => coalesce((private.meet_cfg() ->> 'fresh_minutes')::int, 10)))
$$;
/** a distance, only ever as a rough band */
create or replace function private.meet_band(p_m float8) returns text language sql immutable as $$
  select case when p_m < 150 then 'here' when p_m < 500 then 'walk' when p_m < 1500 then 'near' else 'area' end
$$;

create or replace function public.meet_settings() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.meet_nearby;
begin
  select * into m from public.meet_nearby where player_id = v_uid;
  return jsonb_build_object('available', coalesce((private.meet_cfg() ->> 'enabled')::boolean, true),
    'enabled', coalesce(m.enabled, false), 'adult', m.adult_at is not null, 'on_gps', private.on_gps_now(v_uid));
end $$;

/** turn it on (saying you're 18 or over, the first time) or off */
create or replace function public.meet_set(p_enabled boolean, p_adult boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_adult timestamptz;
begin
  select adult_at into v_adult from public.meet_nearby where player_id = v_uid;
  if coalesce(p_enabled, false) and v_adult is null and not coalesce(p_adult, false) then
    raise exception 'adult_required' using errcode = 'P0001';
  end if;
  insert into public.meet_nearby (player_id, enabled, adult_at, updated_at)
  values (v_uid, coalesce(p_enabled, false), case when coalesce(p_adult, false) then now() end, now())
  on conflict (player_id) do update set enabled = excluded.enabled,
    adult_at = coalesce(public.meet_nearby.adult_at, excluded.adult_at), updated_at = now();
  return public.meet_settings();
end $$;

/** the players near you: on GPS for real (both of you opted in), and explorers out in the game near you */
create or replace function public.meet_nearby() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.meet_cfg(); me public.explorers;
  v_r float8 := least(coalesce((c ->> 'radius_m')::float8, 4000), 10000);
  v_fresh interval := make_interval(mins => coalesce((c ->> 'fresh_minutes')::int, 10));
  v_dlat float8; v_dlng float8; v_gps jsonb; v_game jsonb;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then return jsonb_build_object('available', false, 'items', '[]'::jsonb); end if;
  if not private.meet_on(v_uid) then return jsonb_build_object('available', true, 'enabled', false, 'items', '[]'::jsonb); end if;
  if not private.on_gps_now(v_uid) then return jsonb_build_object('available', true, 'enabled', true, 'on_gps', false, 'items', '[]'::jsonb); end if;
  select * into me from public.explorers where player_id = v_uid;
  v_dlat := v_r / 111320.0;
  v_dlng := v_r / (111320.0 * greatest(cos(radians(least(abs(me.gps_lat), 85))), 0.05));

  -- out on GPS for real, near your real spot: a name and a band, nothing else
  select coalesce(jsonb_agg(x.j order by x.d), '[]'::jsonb) into v_gps from (
    select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'accent_color', p.accent_color,
             'explorer_style', p.explorer_style, 'how', 'gps', 'band', private.meet_band(dd.d),
             'waved_me', exists (select 1 from public.meet_waves w where w.from_id = o.player_id and w.to_id = v_uid and w.at > now() - interval '30 minutes')) j,
           dd.d
      from public.explorers o
      join public.profiles p on p.id = o.player_id
      cross join lateral (select private.haversine_m(me.gps_lng, me.gps_lat, o.gps_lng, o.gps_lat) d) dd
     where o.player_id <> v_uid and o.mode = 'gps' and o.gps_lng is not null and o.gps_at > now() - v_fresh
       and o.gps_lat between me.gps_lat - v_dlat and me.gps_lat + v_dlat
       and o.gps_lng between me.gps_lng - v_dlng and me.gps_lng + v_dlng
       and dd.d < v_r
       and private.meet_on(o.player_id)
       and private.visible_to(o.player_id, v_uid) and private.visible_to(v_uid, o.player_id)
     order by dd.d limit 20) x;

  -- explorers out in the game (no GPS) whose explorer is near you — the map's own rules decide who may show
  select coalesce(jsonb_agg(x.j order by x.d), '[]'::jsonb) into v_game from (
    select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'accent_color', p.accent_color,
             'explorer_style', p.explorer_style, 'how', 'game', 'band', private.meet_band(private.haversine_m(me.gps_lng, me.gps_lat, (f.j ->> 'lng')::float8, (f.j ->> 'lat')::float8)),
             'vehicle', f.j ->> 'vehicle', 'traveling', coalesce((f.j ->> 'traveling')::boolean, false)) j,
           private.haversine_m(me.gps_lng, me.gps_lat, (f.j ->> 'lng')::float8, (f.j ->> 'lat')::float8) d
      from public.explorers o
      join public.profiles p on p.id = o.player_id
      cross join lateral (select private.findable_json(o.player_id, v_uid) j) f
     where o.player_id <> v_uid and o.mode in ('manual', 'travel')
       and o.lat between me.gps_lat - v_dlat * 1.5 and me.gps_lat + v_dlat * 1.5
       and o.lng between me.gps_lng - v_dlng * 1.5 and me.gps_lng + v_dlng * 1.5
       and f.j is not null
       and private.haversine_m(me.gps_lng, me.gps_lat, (f.j ->> 'lng')::float8, (f.j ->> 'lat')::float8) < v_r
     order by 2 limit 20) x;

  return jsonb_build_object('available', true, 'enabled', true, 'on_gps', true, 'items', v_gps || v_game);
end $$;

/** wave at a player near you (they get a notification); only someone who could see you too, once per 10 minutes */
create or replace function public.meet_wave(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.explorers; b public.explorers; v_d float8;
  v_r float8 := least(coalesce((private.meet_cfg() ->> 'radius_m')::float8, 4000), 10000);
begin
  if p_player is null or p_player = v_uid then raise exception 'invalid_player' using errcode = 'P0001'; end if;
  if not (private.meet_on(v_uid) and private.meet_on(p_player) and private.on_gps_now(v_uid) and private.on_gps_now(p_player)
          and private.visible_to(p_player, v_uid) and private.visible_to(v_uid, p_player)) then
    raise exception 'not_nearby' using errcode = 'P0001';
  end if;
  select * into a from public.explorers where player_id = v_uid;
  select * into b from public.explorers where player_id = p_player;
  v_d := private.haversine_m(a.gps_lng, a.gps_lat, b.gps_lng, b.gps_lat);
  if v_d >= v_r then raise exception 'not_nearby' using errcode = 'P0001'; end if;
  if exists (select 1 from public.meet_waves where from_id = v_uid and to_id = p_player and at > now() - interval '10 minutes') then
    return jsonb_build_object('ok', true, 'again', true);
  end if;
  insert into public.meet_waves (from_id, to_id) values (v_uid, p_player);
  delete from public.meet_waves where at < now() - interval '1 day';
  perform private.notify(p_player, 'meet_wave', v_uid, jsonb_build_object('band', private.meet_band(v_d)));
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.meet_cfg()', 'private.meet_on(uuid)', 'private.on_gps_now(uuid)', 'private.meet_band(double precision)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.meet_settings()', 'public.meet_set(boolean, boolean)', 'public.meet_nearby()', 'public.meet_wave(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
