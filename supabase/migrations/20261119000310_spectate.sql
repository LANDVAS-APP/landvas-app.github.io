-- Watching: anyone can watch someone play — a minigame, an arcade cabinet, a party game, their farm or realm, a
-- drawing — unless they switch it off ("Let people watch me play", on by default like the rest of privacy).
--  * What's on their screen goes straight from their game to the watchers over a realtime channel, and only while
--    someone's watching. The channel's name is a secret key the server hands out only to people allowed to watch
--    (online, watching on, not blocked either way). The key changes when they switch watching off or block someone,
--    so nobody keeps it.
--  * Never the map (where they really are), settings or chats: only game and play screens are ever sent, and the game
--    shows "👀 N watching" while anyone is.

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.privacy_keys()'::regprocedure);
  n := replace(d, '''on_map'']', '''on_map'', ''spectate'']');
  if n = d then raise exception 'spectate: privacy_keys anchor not found'; end if;
  execute n;
end $$;

insert into public.game_config (key, value) values ('watch', '{"enabled": true, "fps": 2, "max_kb": 180}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.watch_keys (
  player_id uuid primary key references public.players (id) on delete cascade,
  key uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table public.watch_keys enable row level security;
revoke all on public.watch_keys from anon, authenticated;

/** the kinds of thing someone can be watched doing (never the map, settings, chats…) */
create or replace function private.watch_kinds() returns text[] language sql immutable as $$
  select array['game', 'arcade', 'place', 'home', 'create', 'sanctuary', 'inkborn', 'playdate', 'dig']
$$;

/** can people watch them right now? (online, doing something watchable, watching on) */
create or replace function private.watchable(p_uid uuid) returns boolean language sql stable as $$
  select coalesce((private.cfg('watch') ->> 'enabled')::boolean, true) and private.shows(p_uid, 'spectate')
     and exists (select 1 from public.player_activity a where a.player_id = p_uid
                   and a.at > now() - make_interval(mins => coalesce((private.party_cfg() ->> 'online_minutes')::int, 3))
                   and a.kind = any (private.watch_kinds()))
$$;

create or replace function private.watch_key(p_uid uuid) returns uuid language plpgsql volatile as $$
declare k uuid;
begin
  insert into public.watch_keys (player_id) values (p_uid) on conflict (player_id) do nothing;
  select key into k from public.watch_keys where player_id = p_uid;
  return k;
end $$;

/** your own channel (your game listens on it for watchers, and sends to it while anyone's watching) */
create or replace function public.watch_me() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := coalesce(private.cfg('watch'), '{}'::jsonb);
begin
  perform private.rate_limit('watch_me', 600, 3600);
  return jsonb_build_object('on', coalesce((c ->> 'enabled')::boolean, true) and private.shows(v_uid, 'spectate'),
    'channel', 'watch:' || private.watch_key(v_uid),
    'fps', least(greatest(coalesce((c ->> 'fps')::numeric, 2), 0.5), 4), 'max_kb', least(greatest(coalesce((c ->> 'max_kb')::int, 180), 40), 240));
end $$;

/** start (or keep) watching someone: who they are, what they're up to, and the way in while they can be watched */
create or replace function public.watch_start(p_username text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_id uuid; v_ok boolean;
begin
  perform private.rate_limit('watch_start', 600, 3600);
  select id into v_id from public.profiles where lower(username) = lower(p_username);
  if v_id is null or v_id = v_uid or not private.visible_to(v_id, v_uid) or not private.visible_to(v_uid, v_id)
     or not exists (select 1 from public.players where id = v_id and status = 'active') then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not coalesce((private.cfg('watch') ->> 'enabled')::boolean, true) or not private.shows(v_id, 'spectate') then
    raise exception 'not_watchable' using errcode = 'P0001';
  end if;
  v_ok := private.is_online(v_id);
  return private.profile_json(v_id) || jsonb_build_object('now', private.whereabouts(v_id),
    'friend', private.friend_state(v_uid, v_id) = 'friends',
    'in_party', private.my_group(v_uid) is not null and private.my_group(v_id) = private.my_group(v_uid),
    'channel', case when v_ok then 'watch:' || private.watch_key(v_id) end);
end $$;

/** who's playing something you could watch right now (friends first) */
create or replace function public.watchable_players() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('watchable_players', 600, 3600);
  if not coalesce((private.cfg('watch') ->> 'enabled')::boolean, true) then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(x.j order by x.friend desc, x.at desc), '[]'::jsonb) from (
    select private.profile_json(a.player_id) || jsonb_build_object('online', true, 'now', private.whereabouts(a.player_id),
             'friend', private.friend_state(v_uid, a.player_id) = 'friends') j,
           private.friend_state(v_uid, a.player_id) = 'friends' friend, a.at
      from public.player_activity a join public.players pl on pl.id = a.player_id
     where a.at > now() - make_interval(mins => coalesce((private.party_cfg() ->> 'online_minutes')::int, 3))
       and a.kind = any (private.watch_kinds())
       and a.player_id <> v_uid and pl.status = 'active'
       and private.shows(a.player_id, 'spectate') and private.shows(a.player_id, 'online')
       and private.visible_to(a.player_id, v_uid) and private.visible_to(v_uid, a.player_id)
     order by a.at desc limit 24) x);
end $$;

-- wherever someone's shown with what they're up to, say whether they can be watched
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.whereabouts(uuid)'::regprocedure);
  n := replace(d, $a$    'room', case when s.location$a$, $b$    'watch', private.watchable(p_uid),
    'room', case when s.location$b$);
  if n = d then raise exception 'spectate: whereabouts anchor not found'; end if;
  execute n;
end $$;

-- the key changes when they switch watching off, or block someone — so nobody keeps watching with an old one
create or replace function private.watch_rekey_privacy_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce((new.privacy ->> 'spectate')::boolean, true) = false and coalesce((old.privacy ->> 'spectate')::boolean, true) then
    update public.watch_keys set key = gen_random_uuid(), updated_at = now() where player_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists profiles_watch_rekey on public.profiles;
create trigger profiles_watch_rekey after update of privacy on public.profiles for each row execute function private.watch_rekey_privacy_trg();

create or replace function private.watch_rekey_block_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.watch_keys set key = gen_random_uuid(), updated_at = now() where player_id = new.blocker_id;
  return null;
end $$;
drop trigger if exists player_blocks_watch_rekey on public.player_blocks;
create trigger player_blocks_watch_rekey after insert on public.player_blocks for each row execute function private.watch_rekey_block_trg();

do $$ declare f text; begin
  foreach f in array array['public.watch_me()', 'public.watch_start(text)', 'public.watchable_players()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
