-- v1.2 Parties: one party for everything, and lobbies to find new people.
--  * A party is its own thing now. Anyone can start one (no Travel plot needed). Up to 10 players, with a name,
--    Public or Private, and what you're up to (hanging out, travelling, the arcade, minigames, space, art, exploring).
--  * Public parties are lobbies. The lobby list shows only live parties (somebody in them is online right now), the
--    busiest first: most people online, then most people in the party.
--  * Party chat goes wherever the party goes: on the map (and while travelling together), in arcades, on the Party page.
--    "X joined" / "X left" lines show up in it too.
--  * Arcade chat: everyone in the same arcade room can talk. When you walk into an arcade your party is in, you join
--    their room.
--  * Invites: any player who's online, any friend (an alert pings their phone), or a link anyone can open, even
--    somebody who hasn't signed up yet. The link brings them into LANDVAS and into the party, and counts as your invite.
--  * Privacy: you choose whether players who aren't your friends see you in "Online now", and whether anyone can
--    invite you to a party or only friends can.
--  * Travelling together works as before: when the party leader boards a train or plane, the party rides along.
-- The party is still stored in travel_groups (so trips, group games and group photos keep working untouched).

insert into public.game_config (key, value) values ('party', $cfg${
  "max": 10, "online_minutes": 3, "invite_hours": 24, "chat_days": 7, "arcade_chat_days": 2, "lobby_limit": 50,
  "activities": ["hangout", "travel", "arcade", "games", "space", "art", "explore"]
}$cfg$::jsonb) on conflict (key) do update set value = excluded.value;
create or replace function private.party_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('party'), '{}'::jsonb) $$;
create or replace function private.party_max() returns int language sql stable as $$
  select greatest(2, least(50, coalesce((private.party_cfg() ->> 'max')::int, (private.explore_cfg() ->> 'group_max')::int, 10)))
$$;

-- ---- the party itself ---------------------------------------------------------------------------------------------
alter table public.travel_groups add column if not exists name text;
alter table public.travel_groups add column if not exists visibility text not null default 'private';
alter table public.travel_groups add column if not exists activity text not null default 'hangout';
alter table public.travel_groups add column if not exists note text;
alter table public.travel_groups add column if not exists active_at timestamptz not null default now();
alter table public.travel_groups drop constraint if exists travel_groups_visibility_check;
alter table public.travel_groups add constraint travel_groups_visibility_check check (visibility in ('private', 'public'));
create index if not exists travel_groups_public_idx on public.travel_groups (active_at desc) where visibility = 'public';

/** a party's name: the one it was given, else "@leader's party" */
create or replace function private.party_name(g public.travel_groups) returns text language sql stable as $$
  select coalesce(nullif(g.name, ''), (select username from public.profiles where id = g.leader_id) || '''s party')
$$;

/** online right now: the app is open on a screen (it says what it's on every minute or so) */
create or replace function private.is_online(p_uid uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.player_activity a where a.player_id = p_uid
                   and a.at > now() - make_interval(mins => coalesce((private.party_cfg() ->> 'online_minutes')::int, 3)))
$$;
create index if not exists player_activity_at_idx on public.player_activity (at desc);

-- two new privacy switches (on by default, like everything else)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.privacy_keys()'::regprocedure);
  n := replace(d, '''royalty'']', '''royalty'', ''online'', ''party_invites'']');
  if n = d then raise exception 'parties: privacy_keys anchor not found'; end if;
  execute n;
end $$;

-- party invites ping the phone like any other alert
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant', 'leviathan', 'power',
  'party_invite'));

-- the arcade is somewhere you can be (friends and party mates see "in an arcade", and can follow you in)
create or replace function public.set_activity(p_kind text, p_detail jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('set_activity', 600, 3600);
  if p_kind not in ('map', 'planet', 'dig', 'space', 'game', 'inkborn', 'sanctuary', 'playdate', 'create', 'gallery', 'social', 'other', 'arcade', 'party') then
    raise exception 'invalid_activity' using errcode = 'P0001';
  end if;
  if octet_length(coalesce(p_detail, '{}'::jsonb)::text) > 400 then raise exception 'invalid_activity' using errcode = 'P0001'; end if;
  insert into public.player_activity (player_id, kind, detail, at) values (v_uid, p_kind, coalesce(p_detail, '{}'::jsonb), now())
  on conflict (player_id) do update set kind = excluded.kind, detail = excluded.detail, at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---- changes reach every member's phone straight away ("look again" pushes, nothing more) --------------------------
create or replace function private.party_push(p_group uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push((select coalesce(array_agg('u:' || pl.push_token), '{}') from public.travel_group_members m join public.players pl on pl.id = m.player_id
                         where m.group_id = p_group), 'party');
exception when others then null; -- a push is only a hint
end $$;

-- the chat (members only; "joined" and "left" lines come from the server)
create table if not exists public.party_chat (
  id bigserial primary key,
  group_id uuid not null references public.travel_groups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null default 'chat' check (kind in ('chat', 'join', 'leave')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists party_chat_group_idx on public.party_chat (group_id, id desc);
create index if not exists party_chat_player_idx on public.party_chat (player_id);
alter table public.party_chat enable row level security;
revoke all on public.party_chat from anon, authenticated;

create or replace function private.party_members_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- (whoever starts a party doesn't "join" it)
    if not exists (select 1 from public.travel_groups where id = new.group_id and leader_id = new.player_id) then
      insert into public.party_chat (group_id, player_id, kind, body) values (new.group_id, new.player_id, 'join', 'joined the party');
    end if;
    update public.travel_groups set active_at = now() where id = new.group_id;
    perform private.party_push(new.group_id);
  else
    if exists (select 1 from public.travel_groups where id = old.group_id) then
      insert into public.party_chat (group_id, player_id, kind, body) values (old.group_id, old.player_id, 'leave', 'left the party');
      perform private.party_push(old.group_id);
    end if;
    perform private.push_player(old.player_id, 'party');
  end if;
  return null;
end $$;
drop trigger if exists travel_group_members_party on public.travel_group_members;
create trigger travel_group_members_party after insert or delete on public.travel_group_members for each row execute function private.party_members_trg();

create or replace function private.party_settings_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.party_push(new.id);
  return null;
end $$;
drop trigger if exists travel_groups_party on public.travel_groups;
create trigger travel_groups_party after update of name, visibility, activity, note, leader_id on public.travel_groups
  for each row execute function private.party_settings_trg();

create or replace function private.party_invite_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push_player(new.player_id, 'party');
  return null;
end $$;
drop trigger if exists travel_group_invites_party on public.travel_group_invites;
create trigger travel_group_invites_party after insert on public.travel_group_invites for each row execute function private.party_invite_trg();

-- ---- what the game reads: your party (members online, what they're up to, the chat topic) and your invites ----------
-- the old reader becomes the base; the public one adds the party's own things on top
alter function public.travel_group() set schema private;
alter function private.travel_group() rename to party_base;
revoke all on function private.party_base() from public, anon, authenticated;

create or replace function public.travel_group() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); r jsonb := private.party_base(); g public.travel_groups%rowtype;
  v_hours int := coalesce((private.party_cfg() ->> 'invite_hours')::int, 24);
begin
  select * into g from public.travel_groups where id = private.my_group(v_uid);
  if g.id is not null then
    r := jsonb_set(r, '{group}', (r -> 'group') || jsonb_build_object(
      'name', private.party_name(g), 'custom_name', g.name, 'visibility', g.visibility, 'activity', g.activity, 'note', g.note,
      'max', private.party_max(), 'created_at', g.created_at,
      -- where party chat is nudged (secret, and new whenever someone leaves)
      'chat', 'ptc:' || g.channel_key,
      -- your own invite code goes on the link, so a new player who joins with it counts as your invite
      'ref', private.ensure_referral_code(v_uid),
      'online', (select count(*) from public.travel_group_members m where m.group_id = g.id and private.is_online(m.player_id)),
      'members', (select coalesce(jsonb_agg(m || jsonb_build_object(
                     'online', (m ->> 'me')::boolean or private.is_online((m ->> 'id')::uuid),
                     'now', case when (m ->> 'me')::boolean then null else private.whereabouts((m ->> 'id')::uuid) end) order by o), '[]'::jsonb)
                  from jsonb_array_elements(r -> 'group' -> 'members') with ordinality as e(m, o))));
  end if;
  -- invites: the party's name and what it's up to; old ones (and ones from people you've blocked) drop off
  r := r || jsonb_build_object('invites', (select coalesce(jsonb_agg(jsonb_build_object(
           'group_id', i.group_id, 'by', private.profile_json(i.invited_by), 'at', i.created_at,
           'size', (select count(*) from public.travel_group_members x where x.group_id = i.group_id),
           'name', private.party_name(t), 'activity', t.activity, 'visibility', t.visibility) order by i.created_at desc), '[]'::jsonb)
         from public.travel_group_invites i join public.travel_groups t on t.id = i.group_id
         where i.player_id = v_uid and i.created_at > now() - make_interval(hours => v_hours) and private.visible_to(i.invited_by, v_uid)));
  return r;
end $$;

-- joining: the party's size limit, and room for a few more joining at once
create or replace function private.group_join(p_uid uuid, p_group uuid) returns void language plpgsql as $$
begin
  if private.my_group(p_uid) is not null then raise exception 'already_in_group' using errcode = 'P0001'; end if;
  perform 1 from public.travel_groups where id = p_group for update;
  if not found then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  if (select count(*) from public.travel_group_members where group_id = p_group) >= private.party_max() then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  insert into public.travel_group_members (group_id, player_id) values (p_group, p_uid);
  delete from public.travel_group_invites where player_id = p_uid;
end $$;

/** a new party, led by p_uid */
create or replace function private.party_new(p_uid uuid, p_name text, p_visibility text, p_activity text) returns uuid language plpgsql as $$
declare v_id uuid; v_code text;
begin
  perform private.rate_limit('travel_group', 60, 3600);
  if private.my_group(p_uid) is not null then raise exception 'already_in_group' using errcode = 'P0001'; end if;
  if coalesce(p_visibility, 'private') not in ('private', 'public') then raise exception 'invalid_party_visibility' using errcode = 'P0001'; end if;
  if not (coalesce(p_activity, 'hangout') in (select jsonb_array_elements_text(private.party_cfg() -> 'activities'))) then
    raise exception 'invalid_party_activity' using errcode = 'P0001';
  end if;
  loop
    v_code := upper(translate(substr(md5(gen_random_uuid()::text), 1, 6), '0o1il', 'XYZWK'));
    exit when not exists (select 1 from public.travel_groups where code = v_code);
  end loop;
  insert into public.travel_groups (leader_id, code, name, visibility, activity)
  values (p_uid, v_code, private.clan_text(p_name, 0, 28, 'invalid_party_name'), coalesce(p_visibility, 'private'), coalesce(p_activity, 'hangout'))
  returning id into v_id;
  insert into public.travel_group_members (group_id, player_id) values (v_id, p_uid);
  return v_id;
end $$;

/** start a party (anyone can now — no Travel plot needed) */
create or replace function public.travel_group_create() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.party_new(v_uid, null, 'private', 'hangout');
  return public.travel_group();
end $$;

create or replace function public.party_create(p_name text default null, p_visibility text default 'private', p_activity text default 'hangout') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.party_new(v_uid, p_name, p_visibility, p_activity);
  return public.travel_group();
end $$;

/** the leader names the party, opens it to everyone (a lobby) or keeps it private, and says what it's up to */
create or replace function public.party_update(p_name text default null, p_visibility text default null, p_activity text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.travel_groups%rowtype;
begin
  perform private.rate_limit('party_update', 120, 3600);
  select * into g from public.travel_groups where id = private.my_group(v_uid) for update;
  if not found then raise exception 'not_in_group' using errcode = 'P0001'; end if;
  if g.leader_id <> v_uid then raise exception 'not_group_leader' using errcode = 'P0001'; end if;
  if p_visibility is not null and p_visibility not in ('private', 'public') then raise exception 'invalid_party_visibility' using errcode = 'P0001'; end if;
  if p_activity is not null and not (p_activity in (select jsonb_array_elements_text(private.party_cfg() -> 'activities'))) then
    raise exception 'invalid_party_activity' using errcode = 'P0001';
  end if;
  update public.travel_groups set
    name = case when p_name is null then name else private.clan_text(p_name, 0, 28, 'invalid_party_name') end,
    visibility = coalesce(p_visibility, visibility),
    activity = coalesce(p_activity, activity),
    note = case when p_note is null then note else private.clan_text(p_note, 0, 80, 'invalid_party_note') end,
    active_at = now()
  where id = g.id;
  return public.travel_group();
end $$;

/** the leader hands the lead to someone else */
create or replace function public.party_promote(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid);
begin
  if v_g is null or not exists (select 1 from public.travel_groups where id = v_g and leader_id = v_uid) then raise exception 'not_group_leader' using errcode = 'P0001'; end if;
  if p_player = v_uid or not exists (select 1 from public.travel_group_members where group_id = v_g and player_id = p_player) then
    raise exception 'not_in_group' using errcode = 'P0001';
  end if;
  update public.travel_groups set leader_id = p_player where id = v_g;
  return public.travel_group();
end $$;

/** join a party by its code (or its link). With p_switch, leave the party you're in first. */
create or replace function public.party_join_code(p_code text, p_switch boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid; v_mine uuid := private.my_group(v_uid);
begin
  perform private.rate_limit('travel_group', 60, 3600);
  select id into v_g from public.travel_groups where code = upper(btrim(coalesce(p_code, '')))
    and private.visible_to(leader_id, v_uid);
  if v_g is null then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  if v_mine = v_g then return public.travel_group(); end if;
  if v_mine is not null and coalesce(p_switch, false) then perform private.group_leave(v_uid); end if;
  perform private.group_join(v_uid, v_g);
  return public.travel_group();
end $$;

/** jump into a public lobby */
create or replace function public.party_join_public(p_group uuid, p_switch boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.travel_groups%rowtype; v_mine uuid := private.my_group(v_uid);
begin
  perform private.rate_limit('travel_group', 60, 3600);
  select * into g from public.travel_groups where id = p_group;
  if not found or not private.visible_to(g.leader_id, v_uid) then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  if g.visibility <> 'public' and not exists (select 1 from public.travel_group_invites where group_id = g.id and player_id = v_uid) then
    raise exception 'party_private' using errcode = 'P0001';
  end if;
  if v_mine = g.id then return public.travel_group(); end if;
  if v_mine is not null and coalesce(p_switch, false) then perform private.group_leave(v_uid); end if;
  perform private.group_join(v_uid, g.id);
  return public.travel_group();
end $$;

/** accept an invite (with p_switch, leave your party for theirs) */
create or replace function public.party_accept(p_group uuid, p_switch boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  if not exists (select 1 from public.travel_group_invites where group_id = p_group and player_id = v_uid
                   and created_at > now() - make_interval(hours => coalesce((private.party_cfg() ->> 'invite_hours')::int, 24))) then
    raise exception 'group_not_found' using errcode = 'P0001';
  end if;
  if private.my_group(v_uid) = p_group then return public.travel_group(); end if;
  if private.my_group(v_uid) is not null and coalesce(p_switch, false) then perform private.group_leave(v_uid); end if;
  perform private.group_join(v_uid, p_group);
  return public.travel_group();
end $$;
create or replace function public.travel_group_accept(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.party_accept(p_group, false);
end $$;

/** invite someone (anyone in the party can). Not in a party yet? One starts for you. */
create or replace function private.party_invite_player(p_uid uuid, p_to uuid) returns void language plpgsql as $$
declare v_g uuid := private.my_group(p_uid); g public.travel_groups%rowtype;
begin
  perform private.rate_limit('travel_invite', 60, 3600);
  if p_to is null or not private.visible_to(p_to, p_uid) or not private.visible_to(p_uid, p_to)
     or not exists (select 1 from public.players where id = p_to and status = 'active') then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if p_to = p_uid then raise exception 'cannot_invite_self' using errcode = 'P0001'; end if;
  -- some players only take invites from friends
  if not private.shows(p_to, 'party_invites') and private.friend_state(p_uid, p_to) <> 'friends' then
    raise exception 'party_invites_friends_only' using errcode = 'P0001';
  end if;
  if v_g is null then v_g := private.party_new(p_uid, null, 'private', 'hangout'); end if;
  select * into g from public.travel_groups where id = v_g;
  if exists (select 1 from public.travel_group_members where group_id = v_g and player_id = p_to) then raise exception 'already_in_group' using errcode = 'P0001'; end if;
  if (select count(*) from public.travel_group_members where group_id = v_g) >= private.party_max() then raise exception 'group_full' using errcode = 'P0001'; end if;
  -- a second invite to the same person just brings the first one back to the top (no second alert within the hour)
  if exists (select 1 from public.travel_group_invites where group_id = v_g and player_id = p_to and created_at > now() - interval '1 hour') then
    update public.travel_group_invites set created_at = now(), invited_by = p_uid where group_id = v_g and player_id = p_to;
    return;
  end if;
  insert into public.travel_group_invites (group_id, player_id, invited_by) values (v_g, p_to, p_uid)
  on conflict (group_id, player_id) do update set created_at = now(), invited_by = excluded.invited_by;
  perform private.notify(p_to, 'party_invite', p_uid, jsonb_build_object('group_id', v_g, 'name', private.party_name(g), 'activity', g.activity));
end $$;

create or replace function public.party_invite(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.party_invite_player(v_uid, p_player);
  return public.travel_group();
end $$;

create or replace function public.travel_group_invite(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_to uuid;
begin
  select id into v_to from public.profiles where lower(username) = lower(btrim(ltrim(coalesce(p_username, ''), '@'))) and private.visible_to(id, v_uid);
  if v_to is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if v_to = v_uid or exists (select 1 from public.travel_group_members where group_id = private.my_group(v_uid) and player_id = v_to) then
    raise exception 'already_in_group' using errcode = 'P0001';
  end if;
  perform private.party_invite_player(v_uid, v_to);
  return public.travel_group();
end $$;

/** take back an invite */
create or replace function public.party_uninvite(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.travel_group_invites where group_id = private.my_group(v_uid) and player_id = p_player;
  return public.travel_group();
end $$;

-- ---- who you can invite: friends (online first), everyone online right now, or a name -------------------------------
create or replace function public.party_invite_targets(p_query text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid);
  v_q text := lower(btrim(ltrim(coalesce(p_query, ''), '@')));
begin
  perform private.rate_limit('party_targets', 900, 3600);
  return jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(x.j order by x.online desc, x.at desc nulls last, x.username), '[]'::jsonb) from (
        select private.profile_json(f.id) || jsonb_build_object('online', private.is_online(f.id), 'now', private.whereabouts(f.id),
                 'in_party', exists (select 1 from public.travel_group_members m where m.group_id = v_g and m.player_id = f.id),
                 'invited', exists (select 1 from public.travel_group_invites i where i.group_id = v_g and i.player_id = f.id),
                 'friend', true) j,
               private.is_online(f.id) online, (select a.at from public.player_activity a where a.player_id = f.id) at, p.username
        from (select case when requester_id = v_uid then addressee_id else requester_id end id from public.friendships
              where status = 'accepted' and (requester_id = v_uid or addressee_id = v_uid)) f
        join public.profiles p on p.id = f.id join public.players pl on pl.id = f.id
        where pl.status = 'active' and private.visible_to(f.id, v_uid) and private.visible_to(v_uid, f.id)
          and (v_q = '' or lower(p.username) like v_q || '%')) x),
    -- everyone else who's on right now (who let themselves be seen)
    'online', (select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
        select private.profile_json(a.player_id) || jsonb_build_object('online', true,
                 'in_party', exists (select 1 from public.travel_group_members m where m.group_id = v_g and m.player_id = a.player_id),
                 'invited', exists (select 1 from public.travel_group_invites i where i.group_id = v_g and i.player_id = a.player_id),
                 'busy', exists (select 1 from public.travel_group_members m where m.player_id = a.player_id),
                 'friend', false,
                 'friends_only', not private.shows(a.player_id, 'party_invites')) j, a.at
        from public.player_activity a join public.profiles p on p.id = a.player_id join public.players pl on pl.id = a.player_id
        where a.at > now() - make_interval(mins => coalesce((private.party_cfg() ->> 'online_minutes')::int, 3))
          and a.player_id <> v_uid and pl.status = 'active'
          and private.shows(a.player_id, 'online')
          and private.visible_to(a.player_id, v_uid) and private.visible_to(v_uid, a.player_id)
          and private.friend_state(v_uid, a.player_id) <> 'friends'
          and (v_q = '' or lower(p.username) like v_q || '%')
        order by a.at desc limit 60) x),
    -- a name typed in: anyone by that name (online or not)
    'search', case when char_length(v_q) < 2 then '[]'::jsonb else (select coalesce(jsonb_agg(x.j order by x.exact desc, x.username), '[]'::jsonb) from (
        select private.profile_json(p.id) || jsonb_build_object('online', private.is_online(p.id) and (private.shows(p.id, 'online') or private.friend_state(v_uid, p.id) = 'friends'),
                 'in_party', exists (select 1 from public.travel_group_members m where m.group_id = v_g and m.player_id = p.id),
                 'invited', exists (select 1 from public.travel_group_invites i where i.group_id = v_g and i.player_id = p.id),
                 'friend', private.friend_state(v_uid, p.id) = 'friends',
                 'friends_only', not private.shows(p.id, 'party_invites')) j,
               lower(p.username) = v_q exact, p.username
        from public.profiles p join public.players pl on pl.id = p.id
        where lower(p.username) like v_q || '%' and p.id <> v_uid and pl.status = 'active'
          and private.visible_to(p.id, v_uid) and private.visible_to(v_uid, p.id)
        order by lower(p.username) = v_q desc, p.username limit 12) x) end,
    'online_count', (select count(*) from public.player_activity a
                      where a.at > now() - make_interval(mins => coalesce((private.party_cfg() ->> 'online_minutes')::int, 3))));
end $$;

-- ---- the lobbies: live public parties, busiest first -------------------------------------------------------------
create or replace function public.party_lobbies(p_activity text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_mine uuid := private.my_group(v_uid); v_max int := private.party_max();
begin
  perform private.rate_limit('party_lobbies', 900, 3600);
  return jsonb_build_object(
    'mine', v_mine, 'max', v_max,
    'lobbies', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', private.party_name(t), 'activity', t.activity, 'note', t.note, 'created_at', t.created_at,
        'leader', private.profile_json(t.leader_id), 'size', x.size, 'online', x.online, 'max', v_max, 'full', x.size >= v_max,
        'mine', x.id = v_mine,
        'friends', (select count(*) from public.travel_group_members m join public.friendships f
                      on f.status = 'accepted' and ((f.requester_id = v_uid and f.addressee_id = m.player_id) or (f.addressee_id = v_uid and f.requester_id = m.player_id))
                    where m.group_id = x.id),
        'members', (select coalesce(jsonb_agg(private.profile_json(m.player_id) || jsonb_build_object('online', private.is_online(m.player_id), 'leader', m.player_id = t.leader_id)
                      order by m.player_id <> t.leader_id, private.is_online(m.player_id) desc, m.joined_at), '[]'::jsonb)
                    from public.travel_group_members m where m.group_id = x.id))
        order by x.online desc, x.size desc, x.active_at desc), '[]'::jsonb)
      from (select y.* from (
              select g.id, g.active_at,
                     (select count(*) from public.travel_group_members m where m.group_id = g.id) size,
                     (select count(*) from public.travel_group_members m where m.group_id = g.id and private.is_online(m.player_id)) online
              from public.travel_groups g
              where g.visibility = 'public' and (p_activity is null or g.activity = p_activity)
                and private.visible_to(g.leader_id, v_uid) and private.visible_to(v_uid, g.leader_id)) y
            where y.online > 0 or y.id = v_mine
            order by y.online desc, y.size desc, y.active_at desc
            limit coalesce((private.party_cfg() ->> 'lobby_limit')::int, 50)) x
      join public.travel_groups t on t.id = x.id),
    'online_count', (select count(*) from public.player_activity a
                      where a.at > now() - make_interval(mins => coalesce((private.party_cfg() ->> 'online_minutes')::int, 3))));
end $$;

/** what an invite link shows before you join (open to anyone, signed in or not) */
create or replace function public.party_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g public.travel_groups%rowtype; v_uid uuid := auth.uid();
begin
  select * into g from public.travel_groups where code = upper(btrim(coalesce(p_code, '')));
  if not found or not private.visible_to(g.leader_id, v_uid) then return null; end if;
  return jsonb_build_object('code', g.code, 'name', private.party_name(g), 'activity', g.activity, 'note', g.note, 'visibility', g.visibility,
    'leader', private.profile_json(g.leader_id), 'max', private.party_max(),
    'size', (select count(*) from public.travel_group_members m where m.group_id = g.id),
    'online', (select count(*) from public.travel_group_members m where m.group_id = g.id and private.is_online(m.player_id)),
    'members', (select coalesce(jsonb_agg(private.profile_json(m.player_id) order by m.player_id <> g.leader_id, m.joined_at), '[]'::jsonb)
                from (select * from public.travel_group_members where group_id = g.id order by joined_at limit 10) m),
    'mine', v_uid is not null and exists (select 1 from public.travel_group_members m where m.group_id = g.id and m.player_id = v_uid));
end $$;

-- ---- party chat -----------------------------------------------------------------------------------------------------
create or replace function private.party_chat_json(m public.party_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'kind', m.kind, 'player', private.profile_json(m.player_id))
$$;

create or replace function public.party_chat_send(p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_g uuid := private.my_group(v_uid); v_muted timestamptz; v_body text; r public.party_chat%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  if v_g is null then raise exception 'not_in_group' using errcode = 'P0001'; end if;
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  perform private.rate_limit('party_chat_burst', 1, 1);
  perform private.rate_limit('party_chat', 20, 60);
  perform private.rate_limit('party_chat_hour', 400, 3600);
  v_body := private.chat_clean(p_body);
  if char_length(v_body) > 200 then raise exception 'chat_too_long' using errcode = 'P0001'; end if;
  insert into public.party_chat (group_id, player_id, body) values (v_g, v_uid, v_body) returning * into r;
  update public.travel_groups set active_at = now() where id = v_g and active_at < now() - interval '1 minute';
  delete from public.party_chat where group_id = v_g and created_at < now() - make_interval(days => coalesce((private.party_cfg() ->> 'chat_days')::int, 7));
  return private.party_chat_json(r);
end $$;

/** the party's chat since you joined it (and where it's nudged) */
create or replace function public.party_chat_list(p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.travel_group_members%rowtype; g public.travel_groups%rowtype;
begin
  perform private.rate_limit('party_chat_list', 3000, 3600);
  select * into m from public.travel_group_members where player_id = v_uid;
  if not found then return jsonb_build_object('items', '[]'::jsonb, 'topic', null, 'party', null); end if;
  select * into g from public.travel_groups where id = m.group_id;
  return jsonb_build_object('party', g.id, 'topic', 'ptc:' || g.channel_key, 'items', (select coalesce(jsonb_agg(private.party_chat_json(c) order by c.id), '[]'::jsonb)
    from (select * from public.party_chat c where c.group_id = g.id and c.id > coalesce(p_after, 0) and c.created_at >= m.joined_at
           and private.visible_to(c.player_id, v_uid) order by c.id desc limit 60) c));
end $$;

create or replace function private.push_party_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array['ptc:' || (select channel_key from public.travel_groups where id = new.group_id)], 'chat');
  return null;
end $$;
drop trigger if exists party_chat_push on public.party_chat;
create trigger party_chat_push after insert on public.party_chat for each row execute function private.push_party_chat_trg();

-- ---- arcade chat: everyone in the same arcade room ----------------------------------------------------------------
create table if not exists public.arcade_chat (
  id bigserial primary key,
  arcade_id uuid not null references public.arcades (id) on delete cascade,
  shard int not null default 0,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists arcade_chat_room_idx on public.arcade_chat (arcade_id, shard, id desc);
create index if not exists arcade_chat_player_idx on public.arcade_chat (player_id);
alter table public.arcade_chat enable row level security;
revoke all on public.arcade_chat from anon, authenticated;

create or replace function private.arcade_chat_json(m public.arcade_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'kind', 'chat', 'player', private.profile_json(m.player_id))
$$;
/** the room you're in, in this arcade (null if you're not there right now) */
create or replace function private.arcade_room(p_uid uuid, p_arcade uuid) returns int language sql stable as $$
  select shard from public.arcade_presence where player_id = p_uid and arcade_id = p_arcade
     and seen_at > now() - make_interval(secs => coalesce((private.cfg('arcade') -> 'live' ->> 'stale_seconds')::int, 12))
$$;

create or replace function public.arcade_chat_send(p_arcade uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_shard int := private.arcade_room(v_uid, p_arcade); v_muted timestamptz; v_body text; r public.arcade_chat%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  if v_shard is null then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  perform private.rate_limit('arcade_chat_burst', 1, 1);
  perform private.rate_limit('arcade_chat', 20, 60);
  perform private.rate_limit('arcade_chat_hour', 400, 3600);
  v_body := private.chat_clean(p_body);
  if char_length(v_body) > 200 then raise exception 'chat_too_long' using errcode = 'P0001'; end if;
  insert into public.arcade_chat (arcade_id, shard, player_id, body) values (p_arcade, v_shard, v_uid, v_body) returning * into r;
  delete from public.arcade_chat where arcade_id = p_arcade and created_at < now() - make_interval(days => coalesce((private.party_cfg() ->> 'arcade_chat_days')::int, 2));
  return private.arcade_chat_json(r);
end $$;

create or replace function public.arcade_chat_list(p_arcade uuid, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_shard int := private.arcade_room(v_uid, p_arcade);
begin
  perform private.rate_limit('arcade_chat_list', 3000, 3600);
  if v_shard is null then return jsonb_build_object('items', '[]'::jsonb, 'shard', null, 'topic', null); end if;
  return jsonb_build_object('shard', v_shard, 'topic', 'ac:' || p_arcade || ':' || v_shard,
    'items', (select coalesce(jsonb_agg(private.arcade_chat_json(c) order by c.id), '[]'::jsonb)
      from (select * from public.arcade_chat c where c.arcade_id = p_arcade and c.shard = v_shard and c.id > coalesce(p_after, 0)
              and c.created_at > now() - interval '2 hours' and private.visible_to(c.player_id, v_uid) order by c.id desc limit 50) c));
end $$;

create or replace function private.push_arcade_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array['ac:' || new.arcade_id || ':' || new.shard], 'chat');
  return null;
end $$;
drop trigger if exists arcade_chat_push on public.arcade_chat;
create trigger arcade_chat_push after insert on public.arcade_chat for each row execute function private.push_arcade_chat_trg();

-- walking into an arcade your party is in puts you in their room (when it has space)
do $$
declare d text; n text; a text := '     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;';
begin
  d := pg_get_functiondef('public.arcade_live(uuid,real,real,text)'::regprocedure);
  n := replace(d, a, a || chr(10) || $x$    -- your party is here: into their room, if it has space
    v_shard := coalesce((select p.shard from public.arcade_presence p join public.travel_group_members gm on gm.player_id = p.player_id
                           where gm.group_id = private.my_group(v_uid) and p.player_id <> v_uid and p.arcade_id = p_arcade and p.seen_at > now() - v_stale
                             and (select count(*) from public.arcade_presence q where q.arcade_id = p_arcade and q.shard = p.shard
                                    and q.seen_at > now() - v_stale and q.player_id <> v_uid) < v_max
                           group by p.shard order by count(*) desc, p.shard limit 1), v_shard);$x$);
  if n = d then raise exception 'parties: arcade_live anchor not found'; end if;
  execute n;
end $$;

-- ---- grants -----------------------------------------------------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array['private.party_cfg()', 'private.party_max()', 'private.party_name(public.travel_groups)', 'private.is_online(uuid)',
    'private.party_push(uuid)', 'private.party_members_trg()', 'private.party_settings_trg()', 'private.party_invite_trg()',
    'private.party_new(uuid, text, text, text)', 'private.party_invite_player(uuid, uuid)', 'private.party_chat_json(public.party_chat)',
    'private.push_party_chat_trg()', 'private.arcade_chat_json(public.arcade_chat)', 'private.arcade_room(uuid, uuid)', 'private.push_arcade_chat_trg()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.travel_group()', 'public.travel_group_create()', 'public.travel_group_accept(uuid)', 'public.travel_group_invite(text)',
    'public.party_create(text, text, text)', 'public.party_update(text, text, text, text)', 'public.party_promote(uuid)',
    'public.party_join_code(text, boolean)', 'public.party_join_public(uuid, boolean)', 'public.party_accept(uuid, boolean)',
    'public.party_invite(uuid)', 'public.party_uninvite(uuid)', 'public.party_invite_targets(text)', 'public.party_lobbies(text)',
    'public.party_chat_send(text)', 'public.party_chat_list(bigint)', 'public.arcade_chat_send(uuid, text)', 'public.arcade_chat_list(uuid, bigint)',
    'public.set_activity(text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke all on function public.party_preview(text) from public;
  grant execute on function public.party_preview(text) to anon, authenticated;
end $$;
