-- House party games with bots: every game at a house can be played on your own (or short of players) with AI players
-- filling the empty seats. The host's device plays the bots (they think and react like people, and they're tuned to
-- lose a fair share); the server only knows how many bots sat down, so it can start a table that's short of people,
-- let a real person take a bot's seat, and pay fairly: bots never add to the party bonus, and a game with bots pays
-- half the Ink (bot_ink) — practice, not a farm.

alter table public.home_games add column if not exists bots int not null default 0;
alter table public.home_games drop constraint if exists home_games_bots_check;
alter table public.home_games add constraint home_games_bots_check check (bots between 0 and 7);
update public.game_config set value = jsonb_set(value, '{games,bot_ink}', '0.5'::jsonb, true) where key = 'home' and not ((value -> 'games') ? 'bot_ink');

/** The host sets how many bots sit at the table (only into empty seats). */
create or replace function public.home_game_bots(p_game uuid, p_n int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.home_games%rowtype; v_n int; v_max int;
begin
  perform private.rate_limit('home_game', 240, 3600);
  select * into g from public.home_games where id = p_game for update;
  if not found or g.status <> 'lobby' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if g.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.home_game_players where game_id = g.id;
  v_max := coalesce((private.hg_cfg() -> 'list' -> g.game ->> 'max')::int, 8);
  update public.home_games set bots = greatest(0, least(coalesce(p_n, 0), v_max - v_n, 7)) where id = g.id;
  return private.hg_json(g.id);
end $$;

do $$
declare d text; n text;
begin
  -- the table: how many bots
  d := pg_get_functiondef('private.hg_json(uuid)'::regprocedure);
  n := replace(d, $a$'created_at', g.created_at, 'started_at', g.started_at, 'server_time', now(),$a$,
                  $b$'created_at', g.created_at, 'started_at', g.started_at, 'server_time', now(), 'bots', g.bots,$b$);
  if n = d then raise exception 'house_bots: hg_json anchor not found'; end if;
  execute n;

  -- a full table with a bot at it: a person takes the bot's seat
  d := pg_get_functiondef('public.home_game_join(uuid)'::regprocedure);
  n := replace(d, $a$  if v_n >= (private.hg_cfg() -> 'list' -> g.game ->> 'max')::int then raise exception 'match_full' using errcode = 'P0001'; end if;$a$,
                  $b$  if v_n >= (private.hg_cfg() -> 'list' -> g.game ->> 'max')::int then raise exception 'match_full' using errcode = 'P0001'; end if;
  if v_n + g.bots >= (private.hg_cfg() -> 'list' -> g.game ->> 'max')::int then update public.home_games set bots = greatest(0, bots - 1) where id = g.id; end if;$b$);
  if n = d then raise exception 'house_bots: home_game_join anchor not found'; end if;
  execute n;

  -- starting: people and bots together make the numbers
  d := pg_get_functiondef('public.home_game_start(uuid)'::regprocedure);
  n := replace(d, $a$  if v_n < (private.hg_cfg() -> 'list' -> g.game ->> 'min')::int then raise exception 'need_players' using errcode = 'P0001'; end if;$a$,
                  $b$  if v_n + g.bots < (private.hg_cfg() -> 'list' -> g.game ->> 'min')::int then raise exception 'need_players' using errcode = 'P0001'; end if;$b$);
  if n = d then raise exception 'house_bots: home_game_start anchor not found'; end if;
  execute n;

  -- the result: places count the bots too; bots don't add to the party bonus; a game with bots pays half the Ink
  d := pg_get_functiondef('public.home_game_report(uuid, jsonb)'::regprocedure);
  n := replace(d, $a$if v_place is null or v_place < 1 or v_place > v_n then raise exception 'invalid_result' using errcode = 'P0001'; end if;$a$,
                  $b$if v_place is null or v_place < 1 or v_place > v_n + g.bots then raise exception 'invalid_result' using errcode = 'P0001'; end if;$b$);
  n := replace(n, $a$      v_ink := floor(coalesce((c -> 'place_ink' ->> least(v_place, 8) - 1)::int, 2) * v_boost)::int;$a$,
                  $b$      v_ink := floor(coalesce((c -> 'place_ink' ->> least(v_place, 8) - 1)::int, 2) * v_boost)::int;
      if g.bots > 0 then v_ink := floor(v_ink * coalesce((c ->> 'bot_ink')::numeric, 0.5))::int; end if;$b$);
  n := replace(n, $a$result = jsonb_build_object('places', p_places, 'players', v_n, 'boost', v_boost)$a$,
                  $b$result = jsonb_build_object('places', p_places, 'players', v_n, 'bots', g.bots, 'boost', v_boost)$b$);
  if n = d or position('v_n + g.bots' in n) = 0 or position('bot_ink' in n) = 0 or position('''bots'', g.bots' in n) = 0 then raise exception 'house_bots: home_game_report anchors not found'; end if;
  execute n;
end $$;

revoke all on function public.home_game_bots(uuid, int) from public, anon;
grant execute on function public.home_game_bots(uuid, int) to authenticated, service_role;
