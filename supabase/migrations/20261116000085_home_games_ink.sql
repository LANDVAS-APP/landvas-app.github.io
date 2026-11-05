-- House games pay Ink instead of tickets: by place, more for a bigger party, up to 100 Ink a day per player.
-- Only accounts at least a day old that own land are paid (the same rule as room check-ins), so spare accounts
-- can't be used to farm it.
alter table public.home_game_players add column if not exists ink int not null default 0;
alter table public.home_game_days add column if not exists ink int not null default 0;

update public.game_config set value = jsonb_set(value, '{games}', (value -> 'games') - 'daily_tickets' - 'place_tickets' || '{
  "place_ink": [10, 6, 4, 3, 2, 2, 2, 2], "daily_ink": 100, "min_account_hours": 24
}'::jsonb) where key = 'home';

create or replace function private.hg_json(p_game uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'game', g.game, 'status', g.status, 'host', g.host_id, 'home', g.home_id,
    'seed', case when g.status <> 'lobby' then g.seed end, 'result', g.result,
    'created_at', g.created_at, 'started_at', g.started_at, 'server_time', now(),
    'players', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('slot', p.slot, 'place', p.place, 'ink', p.ink)
                  order by p.slot nulls last, p.joined_at), '[]'::jsonb) from public.home_game_players p where p.game_id = g.id))
  from public.home_games g where g.id = p_game
$$;

create or replace function public.home_game_report(p_game uuid, p_places jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.home_games%rowtype; c jsonb := private.hg_cfg();
  v_n int; v_boost numeric; r record; v_place int; v_ink int; v_day timestamptz := private.day_start(now()); v_got int;
  v_cap int := coalesce((c ->> 'daily_ink')::int, 100);
begin
  select * into g from public.home_games where id = p_game for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if g.status = 'done' then return private.hg_json(g.id); end if;
  if g.status <> 'playing' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if g.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  if g.started_at > now() - make_interval(secs => coalesce((c ->> 'min_seconds')::int, 20)) then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  if p_places is null or jsonb_typeof(p_places) <> 'object' then raise exception 'invalid_result' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.home_game_players where game_id = g.id;
  v_boost := 1 + coalesce((c ->> 'party_boost')::numeric, 0.1) * (v_n - 1);
  for r in select player_id from public.home_game_players where game_id = g.id loop
    v_place := (p_places ->> r.player_id::text)::int;
    if v_place is null or v_place < 1 or v_place > v_n then raise exception 'invalid_result' using errcode = 'P0001'; end if;
  end loop;
  for r in select player_id from public.home_game_players where game_id = g.id loop
    v_place := (p_places ->> r.player_id::text)::int;
    v_ink := 0;
    if private.old_enough(r.player_id, coalesce((c ->> 'min_account_hours')::numeric, 24)) and exists (select 1 from public.world_plots where owner_id = r.player_id) then
      v_ink := floor(coalesce((c -> 'place_ink' ->> least(v_place, 8) - 1)::int, 2) * v_boost)::int;
      insert into public.home_game_days (player_id, day) values (r.player_id, v_day) on conflict do nothing;
      select ink into v_got from public.home_game_days where player_id = r.player_id and day = v_day for update;
      v_ink := greatest(0, least(v_ink, v_cap - v_got));
      if v_ink > 0 then
        update public.home_game_days set ink = ink + v_ink where player_id = r.player_id and day = v_day;
        perform private.grant(r.player_id, jsonb_build_object('ink', v_ink), 'minigame', 'home_game', g.id::text, 'home-game:' || g.id || ':' || r.player_id);
      end if;
    end if;
    update public.home_game_players set place = v_place, ink = v_ink where game_id = g.id and player_id = r.player_id;
  end loop;
  update public.home_games set status = 'done', settled_at = now(), result = jsonb_build_object('places', p_places, 'players', v_n, 'boost', v_boost) where id = g.id;
  return private.hg_json(g.id);
end $$;

do $$ declare f text; begin
  execute 'revoke all on function private.hg_json(uuid) from public, anon, authenticated';
  foreach f in array array['public.home_game_report(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
