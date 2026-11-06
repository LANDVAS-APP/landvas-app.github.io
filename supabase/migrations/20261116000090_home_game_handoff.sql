-- House games keep going when the host drops out. The host's device pings while it runs the game; if the pings stop
-- (phone locked, tab closed, connection gone), another player in the game can take over as host from where it left
-- off and report the places (and the Ink) at the end as usual.
alter table public.home_games add column if not exists host_seen_at timestamptz;

-- the host: "still here" (returns who the host is now, so a host that was away finds out it's been replaced)
create or replace function public.home_game_ping(p_game uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.home_games%rowtype;
begin
  select * into g from public.home_games where id = p_game;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if g.host_id = v_uid and g.status = 'playing' then update public.home_games set host_seen_at = now() where id = g.id; end if;
  return jsonb_build_object('host', g.host_id, 'status', g.status);
end $$;

-- a player takes over a game whose host has gone quiet
create or replace function public.home_game_takeover(p_game uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.home_games%rowtype;
  v_quiet int := coalesce((private.hg_cfg() ->> 'host_quiet_seconds')::int, 6);
begin
  select * into g from public.home_games where id = p_game for update;
  if not found or not exists (select 1 from public.home_game_players where game_id = g.id and player_id = v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if g.status <> 'playing' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if g.host_id = v_uid then return private.hg_json(g.id); end if;
  if coalesce(g.host_seen_at, g.started_at) > now() - make_interval(secs => v_quiet) then raise exception 'host_here' using errcode = 'P0001'; end if;
  update public.home_games set host_id = v_uid, host_seen_at = now() where id = g.id;
  return private.hg_json(g.id);
end $$;

do $$ declare f text; begin
  foreach f in array array['public.home_game_ping(uuid)', 'public.home_game_takeover(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
