-- Open play: anyone playing LANDVAS is someone you can play with.
--  * Every party is public (in the lobbies) unless its leader makes it private — new ones start public, and the ones
--    that exist now open up.
--  * Anyone online is joinable: join a player who isn't in a party and a party forms around them (they lead it, and
--    they hear about it). Going private — your party, or yourself when you're on your own — stops that.
--  * Looking for players: every game waiting for more people right now — a table at someone's house, an arcade
--    match, a Live Arena lobby — in one list, one tap to go there and sit down.
--  * Following someone: when you join a player (or a game they're waiting in), you land in the same arcade room,
--    arena room or house room as them.
--  * At home: your friends and party see you're at home (or at someone's), and can come straight in.

-- ---- public by default -------------------------------------------------------------------------------------------
update public.travel_groups set visibility = 'public' where visibility = 'private';

-- "joinable": anyone can join you when you're on your own (on unless you go private)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.privacy_keys()'::regprocedure);
  n := replace(d, '''party_invites'']', '''party_invites'', ''joinable'']');
  if n = d then raise exception 'open_play: privacy_keys anchor not found'; end if;
  execute n;
end $$;

alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant', 'leviathan', 'power',
  'party_invite', 'party_join'));

create or replace function public.travel_group_create() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.party_new(v_uid, null, 'public', 'hangout');
  return public.travel_group();
end $$;

create or replace function public.party_create(p_name text default null, p_visibility text default 'public', p_activity text default 'hangout') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.party_new(v_uid, p_name, coalesce(p_visibility, 'public'), p_activity);
  -- a private party means "don't join me"
  update public.profiles set privacy = privacy || jsonb_build_object('joinable', coalesce(p_visibility, 'public') = 'public') where id = v_uid;
  return public.travel_group();
end $$;

-- inviting with no party starts a public one
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.party_invite_player(uuid,uuid)'::regprocedure);
  n := replace(d, 'v_g := private.party_new(p_uid, null, ''private'', ''hangout'');', 'v_g := private.party_new(p_uid, null, ''public'', ''hangout'');');
  if n = d then raise exception 'open_play: party_invite_player anchor not found'; end if;
  execute n;
end $$;

-- the leader's public / private is also whether people can join them
create or replace function private.party_vis_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles set privacy = privacy || jsonb_build_object('joinable', new.visibility = 'public') where id = new.leader_id;
  return null;
end $$;
drop trigger if exists travel_groups_vis on public.travel_groups;
create trigger travel_groups_vis after update of visibility on public.travel_groups for each row
  when (old.visibility is distinct from new.visibility) execute function private.party_vis_trg();

-- ---- following someone into a room -------------------------------------------------------------------------------
create table if not exists private.follows (
  player_id uuid primary key references public.players (id) on delete cascade,
  target_id uuid not null references public.players (id) on delete cascade,
  until timestamptz not null
);
create index if not exists follows_target_idx on private.follows (target_id);

/** who you're following right now (for a couple of minutes after you tap Join on them) */
create or replace function private.followee(p_uid uuid) returns uuid language sql stable as $$
  select target_id from private.follows where player_id = p_uid and until > now()
$$;

/** about to go where someone is: land in their room */
create or replace function public.place_follow(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('place_follow', 240, 3600);
  if p_player is null or p_player = v_uid or not private.visible_to(p_player, v_uid) or not private.visible_to(v_uid, p_player) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  insert into private.follows (player_id, target_id, until) values (v_uid, p_player, now() + interval '3 minutes')
  on conflict (player_id) do update set target_id = excluded.target_id, until = excluded.until;
  return jsonb_build_object('ok', true);
end $$;

-- arcade, arena and house rooms: the one with the player you're following, then the one with your party
do $$
declare d text; n text; a text := '     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;';
  arc text := '                           group by p.shard order by count(*) desc, p.shard limit 1), v_shard);';
begin
  -- arcade (already prefers the party): the player you followed comes first
  d := pg_get_functiondef('public.arcade_live(uuid,real,real,text)'::regprocedure);
  n := replace(d, arc, arc || chr(10) || $x$    v_shard := coalesce((select p.shard from public.arcade_presence p
                           where p.player_id = private.followee(v_uid) and p.arcade_id = p_arcade and p.seen_at > now() - v_stale
                             and (select count(*) from public.arcade_presence q where q.arcade_id = p_arcade and q.shard = p.shard
                                    and q.seen_at > now() - v_stale and q.player_id <> v_uid) < v_max), v_shard);$x$);
  if n = d then raise exception 'open_play: arcade_live anchor not found'; end if;
  execute n;
  -- the Live Arena
  d := pg_get_functiondef('public.arena_live(real,real,text,uuid)'::regprocedure);
  n := replace(d, a, a || chr(10) || $x$    v_shard := coalesce((select p.shard from public.arena_presence p
                           where (p.player_id = private.followee(v_uid) or p.player_id in (select m.player_id from public.travel_group_members m where m.group_id = private.my_group(v_uid)))
                             and p.player_id <> v_uid and p.seen_at > now() - v_stale
                             and (select count(*) from public.arena_presence q where q.shard = p.shard and q.seen_at > now() - v_stale and q.player_id <> v_uid) < v_max
                           order by (p.player_id = private.followee(v_uid)) desc, p.shard limit 1), v_shard);$x$);
  if n = d then raise exception 'open_play: arena_live anchor not found'; end if;
  execute n;
  -- homes (and clan halls)
  d := pg_get_functiondef('public.home_live(uuid,real,real,integer)'::regprocedure);
  a := '       group by shard having count(*) < v_max order by bool_or(player_id = p_host) desc, count(*) desc, shard limit 1;';
  n := replace(d, a, a || chr(10) || $x$    v_shard := coalesce((select p.shard from public.home_presence p
                           where p.host_id = p_host and (p.player_id = private.followee(v_uid) or p.player_id in (select m.player_id from public.travel_group_members m where m.group_id = private.my_group(v_uid)))
                             and p.player_id <> v_uid and p.seen_at > now() - v_stale
                             and (select count(*) from public.home_presence q where q.host_id = p_host and q.shard = p.shard and q.seen_at > now() - v_stale and q.player_id <> v_uid) < v_max
                           order by (p.player_id = private.followee(v_uid)) desc, p.shard limit 1), v_shard);$x$);
  if n = d then raise exception 'open_play: home_live anchor not found'; end if;
  execute n;
end $$;

-- ---- join anyone online ------------------------------------------------------------------------------------------
/** join a player: their party if they're in a public one, or — on their own — a party forms around them */
create or replace function public.party_join_player(p_player uuid, p_switch boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_tg uuid; g public.travel_groups%rowtype; v_mine uuid := private.my_group(v_uid); v_new uuid;
begin
  perform private.rate_limit('travel_group', 60, 3600);
  if p_player is null or p_player = v_uid then raise exception 'cannot_invite_self' using errcode = 'P0001'; end if;
  if not private.visible_to(p_player, v_uid) or not private.visible_to(v_uid, p_player)
     or not exists (select 1 from public.players where id = p_player and status = 'active') then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  v_tg := private.my_group(p_player);
  if v_tg is not null then
    if v_tg = v_mine then return public.travel_group(); end if;
    select * into g from public.travel_groups where id = v_tg;
    if g.visibility <> 'public' and not exists (select 1 from public.travel_group_invites where group_id = g.id and player_id = v_uid) then
      raise exception 'party_private' using errcode = 'P0001';
    end if;
    if v_mine is not null then
      if not coalesce(p_switch, false) then raise exception 'already_in_group' using errcode = 'P0001'; end if;
      perform private.group_leave(v_uid);
    end if;
    perform private.group_join(v_uid, v_tg);
    return public.travel_group();
  end if;
  -- on their own: they have to be around, and open to it
  if not private.shows(p_player, 'joinable') then raise exception 'party_private' using errcode = 'P0001'; end if;
  if not private.is_online(p_player) then raise exception 'player_offline' using errcode = 'P0001'; end if;
  if v_mine is not null then
    if not coalesce(p_switch, false) then raise exception 'already_in_group' using errcode = 'P0001'; end if;
    perform private.group_leave(v_uid);
  end if;
  v_new := private.party_new(p_player, null, 'public', 'hangout');
  perform private.group_join(v_uid, v_new);
  perform private.notify(p_player, 'party_join', v_uid, jsonb_build_object('group_id', v_new));
  return public.travel_group();
end $$;

-- ---- "at home" is somewhere you can be (and be joined) ---------------------------------------------------------------
create or replace function public.set_activity(p_kind text, p_detail jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('set_activity', 600, 3600);
  if p_kind not in ('map', 'planet', 'dig', 'space', 'game', 'inkborn', 'sanctuary', 'playdate', 'create', 'gallery', 'social', 'other', 'arcade', 'party', 'home') then
    raise exception 'invalid_activity' using errcode = 'P0001';
  end if;
  if octet_length(coalesce(p_detail, '{}'::jsonb)::text) > 400 then raise exception 'invalid_activity' using errcode = 'P0001'; end if;
  insert into public.player_activity (player_id, kind, detail, at) values (v_uid, p_kind, coalesce(p_detail, '{}'::jsonb), now())
  on conflict (player_id) do update set kind = excluded.kind, detail = excluded.detail, at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---- looking for players ---------------------------------------------------------------------------------------
/** every game waiting for more people right now that you could join: house tables, arcade matches, arena lobbies */
create or replace function private.lfg_items(p_uid uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
    -- a table at someone's house
    select jsonb_build_object('kind', 'home', 'id', g.id, 'game', g.game,
             'title', coalesce(private.hg_cfg() -> 'list' -> g.game ->> 'name', g.game), 'emoji', private.hg_cfg() -> 'list' -> g.game ->> 'emoji',
             'host', private.profile_json(g.host_id), 'players', (select count(*) from public.home_game_players p where p.game_id = g.id),
             'max', coalesce((private.hg_cfg() -> 'list' -> g.game ->> 'max')::int, 4),
             'where', (select username from public.profiles where id = g.home_id) || '''s home',
             'route', '/u/' || (select username from public.profiles where id = g.home_id) || '/home', 'at', g.created_at) j, g.created_at at
      from public.home_games g
     where g.status = 'lobby' and g.created_at > now() - interval '20 minutes'
       and exists (select 1 from public.home_presence hp where hp.player_id = g.host_id and hp.host_id = g.home_id
                     and hp.seen_at > now() - make_interval(secs => coalesce((private.home_cfg() ->> 'stale_seconds')::int, 12)))
       and not exists (select 1 from public.home_game_players p where p.game_id = g.id and p.player_id = p_uid)
       and (select count(*) from public.home_game_players p where p.game_id = g.id) < coalesce((private.hg_cfg() -> 'list' -> g.game ->> 'max')::int, 4)
       and private.visible_to(g.host_id, p_uid) and private.visible_to(p_uid, g.host_id)
    union all
    -- an arcade match
    select jsonb_build_object('kind', 'arcade', 'id', m.id, 'game', m.game, 'mode', m.mode,
             'title', coalesce(private.arc_cfg() -> 'games' -> m.game ->> 'name', m.game), 'emoji', private.arc_cfg() -> 'games' -> m.game ->> 'emoji',
             'host', private.profile_json(m.host_id), 'players', (select count(*) from public.arcade_match_players p where p.match_id = m.id),
             'max', coalesce((private.cfg('arcade') -> 'match' ->> 'max_players')::int, 4),
             'where', coalesce((select nullif(nullif(btrim(cg.name), ''), 'Untitled canvas') from public.arcades a join public.canvas_groups cg on cg.id = a.group_id where a.id = m.arcade_id),
                               (select pr.username || '''s arcade' from public.arcades a join public.profiles pr on pr.id = a.owner_id where a.id = m.arcade_id)),
             'route', '/arcade/' || m.arcade_id, 'at', m.created_at) j, m.created_at at
      from public.arcade_matches m
     where m.status = 'lobby' and m.created_at > now() - interval '20 minutes'
       and exists (select 1 from public.arcade_presence ap where ap.player_id = m.host_id and ap.arcade_id = m.arcade_id
                     and ap.seen_at > now() - make_interval(secs => coalesce((private.cfg('arcade') -> 'live' ->> 'stale_seconds')::int, 12)))
       and not exists (select 1 from public.arcade_match_players p where p.match_id = m.id and p.player_id = p_uid)
       and (select count(*) from public.arcade_match_players p where p.match_id = m.id) < coalesce((private.cfg('arcade') -> 'match' ->> 'max_players')::int, 4)
       and private.visible_to(m.host_id, p_uid) and private.visible_to(p_uid, m.host_id)
    union all
    -- the Live Arena (through the host's arcade's portal)
    select jsonb_build_object('kind', 'arena', 'id', m.id, 'game', m.game, 'mode', m.mode,
             'title', coalesce(private.arena_cfg() -> 'games' -> m.game ->> 'name', m.game), 'emoji', private.arena_cfg() -> 'games' -> m.game ->> 'emoji',
             'host', private.profile_json(m.host_id), 'players', (select count(*) from public.arena_match_players p where p.match_id = m.id),
             'max', upper(private.arena_need(m.mode)) - 1, 'where', 'the Live Arena',
             'route', '/arcade/' || ap.from_arcade || '?room=arena', 'at', m.created_at) j, m.created_at at
      from public.arena_matches m join public.arena_presence ap on ap.player_id = m.host_id
     where m.status = 'lobby' and m.created_at > now() - interval '20 minutes' and ap.from_arcade is not null
       and ap.seen_at > now() - make_interval(secs => coalesce((private.arena_cfg() ->> 'stale_seconds')::int, 12))
       and not exists (select 1 from public.arena_match_players p where p.match_id = m.id and p.player_id = p_uid)
       and (select count(*) from public.arena_match_players p where p.match_id = m.id) < upper(private.arena_need(m.mode)) - 1
       and private.visible_to(m.host_id, p_uid) and private.visible_to(p_uid, m.host_id)
    order by 2 desc limit 40) x
$$;

create or replace function public.lfg_list() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('lfg_list', 1200, 3600);
  return jsonb_build_object('items', private.lfg_items(v_uid));
end $$;

/** everyone online on their own who's open to being joined (with where they are) */
create or replace function private.joinable_players(p_uid uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x.j order by x.friend desc, x.at desc), '[]'::jsonb) from (
    select private.profile_json(a.player_id) || jsonb_build_object('online', true, 'now', private.whereabouts(a.player_id),
             'friend', private.friend_state(p_uid, a.player_id) = 'friends') j,
           private.friend_state(p_uid, a.player_id) = 'friends' friend, a.at
      from public.player_activity a join public.players pl on pl.id = a.player_id
     where a.at > now() - make_interval(mins => coalesce((private.party_cfg() ->> 'online_minutes')::int, 3))
       and a.player_id <> p_uid and pl.status = 'active'
       and private.my_group(a.player_id) is null
       and private.shows(a.player_id, 'joinable') and private.shows(a.player_id, 'online')
       and private.visible_to(a.player_id, p_uid) and private.visible_to(p_uid, a.player_id)
     order by a.at desc limit 40) x
$$;

-- the lobbies now also carry who's waiting for players and who's on their own to team up with
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.party_lobbies(text)'::regprocedure);
  n := replace(d, $a$    'mine', v_mine, 'max', v_max,$a$, $b$    'mine', v_mine, 'max', v_max, 'lfg', private.lfg_items(v_uid), 'players', private.joinable_players(v_uid),
    'joinable', private.shows(v_uid, 'joinable'),$b$);
  if n = d then raise exception 'open_play: party_lobbies anchor not found'; end if;
  execute n;
end $$;

-- ---- grants ---------------------------------------------------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array['private.followee(uuid)', 'private.lfg_items(uuid)', 'private.joinable_players(uuid)', 'private.party_vis_trg()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.place_follow(uuid)', 'public.party_join_player(uuid, boolean)', 'public.lfg_list()', 'public.set_activity(text, jsonb)',
    'public.travel_group_create()', 'public.party_create(text, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on private.follows from public, anon, authenticated;
