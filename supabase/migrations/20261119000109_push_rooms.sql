-- v0.7.4 Room screens hear about changes instead of checking in fast.
--
-- While any lobby was open in an arcade, arena or home, everyone in that room checked in every 5 seconds just in
-- case it changed. Now the database nudges the room's own live channel (the one positions already travel on) when a
-- match, a table or who's in them changes, and only players actually in a match keep checking often. The PvP lobby
-- and a room's visitors/guestbook are nudged the same way instead of being re-read every 15-20 seconds.
--
-- Room channels already understand {"t":"nudge"} (phones send it to each other after changing a lobby), so these
-- are the same message, now also sent by the server for changes no phone announced (a round timing out, a lobby
-- closing, a match started from another screen).

-- ── arcades ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.push_arcade_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if tg_table_name = 'arcade_matches' then
    perform private.push(array['arcade:' || coalesce(new.arcade_id, old.arcade_id) || ':' || coalesce(new.shard, old.shard)], 'nudge');
  else
    select m.arcade_id, m.shard into r from public.arcade_matches m where m.id = coalesce(new.match_id, old.match_id);
    if found then perform private.push(array['arcade:' || r.arcade_id || ':' || r.shard], 'nudge'); end if;
  end if;
  return null;
end $$;
drop trigger if exists arcade_matches_push on public.arcade_matches;
create trigger arcade_matches_push after insert or update or delete on public.arcade_matches for each row execute function private.push_arcade_trg();
drop trigger if exists arcade_match_players_push on public.arcade_match_players;
create trigger arcade_match_players_push after insert or delete on public.arcade_match_players for each row execute function private.push_arcade_trg();

-- ── arenas ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.push_arena_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_shard int;
begin
  if tg_table_name = 'arena_matches' then v_shard := coalesce(new.shard, old.shard);
  else select m.shard into v_shard from public.arena_matches m where m.id = coalesce(new.match_id, old.match_id); end if;
  if v_shard is not null then perform private.push(array['arena:' || v_shard], 'nudge'); end if;
  return null;
end $$;
drop trigger if exists arena_matches_push on public.arena_matches;
create trigger arena_matches_push after insert or update or delete on public.arena_matches for each row execute function private.push_arena_trg();
drop trigger if exists arena_match_players_push on public.arena_match_players;
create trigger arena_match_players_push after insert or delete on public.arena_match_players for each row execute function private.push_arena_trg();

-- ── home and clan-hall game tables ──────────────────────────────────────────────────────────────────────────────
create or replace function private.push_home_game_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if tg_table_name = 'home_games' then
    -- the host's "still here" stamp changes every check-in: not a change anyone needs to hear about
    if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.started_at is not distinct from old.started_at
       and new.settled_at is not distinct from old.settled_at and new.result is not distinct from old.result then return null; end if;
    perform private.push(array['home:' || coalesce(new.home_id, old.home_id) || ':' || coalesce(new.shard, old.shard)], 'nudge');
  else
    select g.home_id, g.shard into r from public.home_games g where g.id = coalesce(new.game_id, old.game_id);
    if found then perform private.push(array['home:' || r.home_id || ':' || r.shard], 'nudge'); end if;
  end if;
  return null;
end $$;
drop trigger if exists home_games_push on public.home_games;
create trigger home_games_push after insert or update or delete on public.home_games for each row execute function private.push_home_game_trg();
drop trigger if exists home_game_players_push on public.home_game_players;
create trigger home_game_players_push after insert or delete on public.home_game_players for each row execute function private.push_home_game_trg();

-- ── the PvP lobby (open challenges are everyone's: at most one nudge every 3 seconds) ──────────────────────────
create or replace function private.push_pvp_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push_gated('pvp', 'pvp', interval '3 seconds');
  return null;
end $$;
-- (only where the PvP tables exist: a build can come up without them and add them later)
do $$
begin
  if to_regclass('public.pvp_matches') is not null then
    execute 'drop trigger if exists pvp_matches_push on public.pvp_matches';
    execute 'create trigger pvp_matches_push after insert or update on public.pvp_matches for each statement execute function private.push_pvp_trg()';
  end if;
  if to_regclass('public.pvp_runs') is not null then
    execute 'drop trigger if exists pvp_runs_push on public.pvp_runs';
    execute 'create trigger pvp_runs_push after insert or update on public.pvp_runs for each statement execute function private.push_pvp_trg()';
  end if;
end $$;

-- ── a room's visitors, check-ins and guestbook ──────────────────────────────────────────────────────────────────
create or replace function private.push_room_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push_gated('rv:' || coalesce(new.host_id, old.host_id), 'room', interval '2 seconds');
  return null;
end $$;
drop trigger if exists room_visits_push on public.room_visits;
create trigger room_visits_push after insert or update on public.room_visits for each row execute function private.push_room_trg();
drop trigger if exists room_checkins_push on public.room_checkins;
create trigger room_checkins_push after insert on public.room_checkins for each row execute function private.push_room_trg();
drop trigger if exists room_notes_push on public.room_notes;
create trigger room_notes_push after insert or update on public.room_notes for each row execute function private.push_room_trg();
