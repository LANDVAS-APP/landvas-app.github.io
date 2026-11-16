-- LAND GRAB, live: the Founder's Code's cabinet as a Live Arena game for 2-4 players at once — free for all, 1v1, 2v2
-- (teams share their land) or co-op (one land against the smudges, map after map). It plays through the arena (the
-- host's device runs it and streams it; the server pays places / teams / co-op maps like any arena game), but it stays
-- a secret: only players who found the Founder's Code can open, see or join a LAND GRAB lobby. Its settings live with
-- the secret (private.arcade_secrets 'founder' → live), not in game_config.

update private.arcade_secrets set cfg = cfg || '{"live": {"enabled": true, "modes": ["ffa", "teams", "duel", "coop"]}}'::jsonb
 where id = 'founder' and not (cfg ? 'live');

/** LAND GRAB as an arena game, for someone who found it (else null) */
create or replace function private.lg_live(p_uid uuid) returns jsonb language sql stable as $$
  select case when private.secret_found(p_uid, 'founder') and coalesce((private.secret_cfg('founder') -> 'live' ->> 'enabled')::boolean, true)
    then jsonb_build_object('name', 'LAND GRAB', 'emoji', '🟩', 'modes', coalesce(private.secret_cfg('founder') -> 'live' -> 'modes', '["ffa", "teams", "duel", "coop"]'::jsonb)) end
$$;

do $$
declare d text; n text;
begin
  -- opening a lobby
  d := pg_get_functiondef('public.arena_create(text, text)'::regprocedure);
  n := replace(d, $a$g jsonb := private.arena_cfg() -> 'games' -> p_game;$a$,
                  $b$g jsonb := coalesce(private.arena_cfg() -> 'games' -> p_game, case when p_game = 'landgrab' then private.lg_live(v_uid) end);$b$);
  if n = d then raise exception 'landgrab_live: arena_create anchor not found'; end if;
  execute n;

  -- joining one
  d := pg_get_functiondef('public.arena_join(uuid)'::regprocedure);
  n := replace(d, $a$if not found or m.status <> 'lobby' or not private.visible_to(m.host_id, v_uid) then raise exception 'match_closed' using errcode = 'P0001'; end if;$a$,
                  $b$if not found or m.status <> 'lobby' or not private.visible_to(m.host_id, v_uid) then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if m.game = 'landgrab' and private.lg_live(v_uid) is null then raise exception 'match_closed' using errcode = 'P0001'; end if;$b$);
  if n = d then raise exception 'landgrab_live: arena_join anchor not found'; end if;
  execute n;

  -- seeing its lobbies in the arena
  d := pg_get_functiondef('public.arena_live(real, real, text, uuid)'::regprocedure);
  n := replace(d, $a$from public.arena_matches m where m.shard = v_shard and m.status = 'lobby' and private.visible_to(m.host_id, v_uid)),$a$,
                  $b$from public.arena_matches m where m.shard = v_shard and m.status = 'lobby' and private.visible_to(m.host_id, v_uid)
                  and (m.game <> 'landgrab' or private.lg_live(v_uid) is not null)),$b$);
  if n = d then raise exception 'landgrab_live: arena_live anchor not found'; end if;
  execute n;

  -- and in "Looking for players"
  d := pg_get_functiondef('private.lfg_items(uuid)'::regprocedure);
  n := replace(d, $a$'title', coalesce(private.arena_cfg() -> 'games' -> m.game ->> 'name', m.game), 'emoji', private.arena_cfg() -> 'games' -> m.game ->> 'emoji',$a$,
                  $b$'title', coalesce(private.arena_cfg() -> 'games' -> m.game ->> 'name', case when m.game = 'landgrab' then 'LAND GRAB' end, m.game),
             'emoji', coalesce(private.arena_cfg() -> 'games' -> m.game ->> 'emoji', case when m.game = 'landgrab' then '🟩' end),$b$);
  n := replace(n, $a$     where m.status = 'lobby' and m.created_at > now() - interval '20 minutes' and ap.from_arcade is not null$a$,
                  $b$     where m.status = 'lobby' and m.created_at > now() - interval '20 minutes' and ap.from_arcade is not null
       and (m.game <> 'landgrab' or private.lg_live(p_uid) is not null)$b$);
  if n = d or position('LAND GRAB' in n) = 0 or position('private.lg_live(p_uid)' in n) = 0 then raise exception 'landgrab_live: lfg_items anchors not found'; end if;
  execute n;
end $$;

revoke all on function private.lg_live(uuid) from public, anon, authenticated;
