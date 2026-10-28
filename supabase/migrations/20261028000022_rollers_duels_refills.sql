-- v0.10
--  * Prism plots play the new Roller Mural instead of HueFlow
--  * Duels: head-to-head skill games where both players stake Ink and the winner takes the pot
--    (off until the operator switches them on in the admin hub)
--  * the joystick tank can be refilled with Ink (rewarded ads arrive with an ad network)

-- ===== 1. Roller Mural replaces HueFlow ==========================================
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass as tbl from pg_constraint
           where contype = 'c' and conrelid in ('public.plot_types'::regclass, 'public.minigame_sessions'::regclass)
             and pg_get_constraintdef(oid) like '%hueflow%' loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
-- finish any HueFlow run that's still open, then move Prism plots to the new game
update public.minigame_sessions set status = 'expired', finished_at = now() where game = 'hueflow' and status = 'active';
update public.plot_types set minigame = 'rollermural', minigame_name = 'Roller Mural', tagline = 'Peel the mural apart, stroke by stroke'
 where id = 'prism';
alter table public.plot_types add constraint plot_types_minigame_check
  check (minigame in ('tracecraft', 'colorburst', 'patternshift', 'lightlines', 'memorymural', 'sculptor', 'rollermural', 'mirrorline'));
alter table public.minigame_sessions add constraint minigame_sessions_game_check
  check (game in ('tracecraft', 'colorburst', 'patternshift', 'lightlines', 'memorymural', 'sculptor', 'hueflow', 'rollermural', 'mirrorline'));
update public.plot_game_progress set game = 'rollermural', highest_level = 0, best_score = 0, updated_at = now() where game = 'hueflow';
-- the game's settings carry over to Roller Mural (and its level table restarts at the same rates)
update public.game_config
   set value = jsonb_set(value, '{games}', ((value -> 'games') - 'hueflow')
         || jsonb_build_object('rollermural', coalesce(value -> 'games' -> 'hueflow', '{"enabled": true, "rounds": 5}'::jsonb) - 'boost'), true)
 where key = 'minigames' and value -> 'games' ? 'hueflow';

-- ===== 2. Ink that duels may move =================================================
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
    end if;
  end loop;
end $$;

-- ===== 3. Duels ===================================================================
insert into public.game_config (key, value, description) values ('duels', '{
  "enabled": false, "min_stake": 10, "max_stake": 500, "fee_pct": 0, "daily_limit": 20,
  "play_seconds": 150, "open_hours": 24,
  "games": {"turfwars": true, "paletteclash": true, "forgery": true, "pixelrecall": true}
}', 'Duels: both players stake Ink on the same skill challenge; the higher server-checked score takes the pot (minus fee_pct). Off until enabled.')
on conflict (key) do nothing;

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('turfwars', 'paletteclash', 'forgery', 'pixelrecall')),
  seed bigint not null,
  stake int not null check (stake > 0),
  status text not null default 'challenger_playing' check (status in ('challenger_playing', 'open', 'opponent_playing', 'done', 'cancelled', 'expired')),
  challenger_id uuid not null references public.players(id) on delete cascade,
  opponent_id uuid references public.players(id) on delete set null,
  invited_id uuid references public.players(id) on delete set null,
  winner_id uuid references public.players(id) on delete set null,
  payout int not null default 0,
  fee int not null default 0,
  created_at timestamptz not null default now(),
  open_until timestamptz,
  finished_at timestamptz
);
create index if not exists duels_open on public.duels (status, created_at desc) where status = 'open';
create index if not exists duels_challenger on public.duels (challenger_id, created_at desc);
create index if not exists duels_opponent on public.duels (opponent_id, created_at desc);
alter table public.duels enable row level security;
revoke all on public.duels from anon, authenticated;

create table if not exists public.duel_runs (
  duel_id uuid not null references public.duels(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  role text not null check (role in ('challenger', 'opponent')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int,
  time_ms int,
  valid boolean,
  summary jsonb,
  primary key (duel_id, player_id)
);
alter table public.duel_runs enable row level security;
revoke all on public.duel_runs from anon, authenticated;

create or replace function private.duel_pay(d public.duels) returns public.duels
language plpgsql as $$
declare c public.duel_runs%rowtype; o public.duel_runs%rowtype; v_pot int; v_fee int; v_winner uuid;
begin
  select * into c from public.duel_runs where duel_id = d.id and role = 'challenger';
  select * into o from public.duel_runs where duel_id = d.id and role = 'opponent';
  v_pot := d.stake * 2;
  if coalesce(c.score, 0) > coalesce(o.score, 0) then v_winner := c.player_id;
  elsif coalesce(o.score, 0) > coalesce(c.score, 0) then v_winner := o.player_id;
  elsif coalesce(c.time_ms, 1e9) < coalesce(o.time_ms, 1e9) then v_winner := c.player_id;
  elsif coalesce(o.time_ms, 1e9) < coalesce(c.time_ms, 1e9) then v_winner := o.player_id;
  end if;
  if v_winner is null then
    -- a dead heat: both get their stake back
    perform private.grant(c.player_id, jsonb_build_object('ink', d.stake), 'duel_refund', 'duel', d.id::text, 'duel:' || d.id || ':refund:c');
    perform private.grant(o.player_id, jsonb_build_object('ink', d.stake), 'duel_refund', 'duel', d.id::text, 'duel:' || d.id || ':refund:o');
    update public.duels set status = 'done', finished_at = now(), payout = 0, fee = 0 where id = d.id returning * into d;
  else
    v_fee := floor(v_pot * least(greatest(coalesce((private.cfg('duels') ->> 'fee_pct')::numeric, 0), 0), 50) / 100);
    perform private.grant(v_winner, jsonb_build_object('ink', v_pot - v_fee), 'duel_win', 'duel', d.id::text, 'duel:' || d.id || ':win');
    update public.duels set status = 'done', finished_at = now(), winner_id = v_winner, payout = v_pot - v_fee, fee = v_fee where id = d.id returning * into d;
  end if;
  return d;
end $$;

-- Close out anything that ran out of time: unfinished runs score 0, unaccepted duels refund.
create or replace function private.duel_sweep() returns void
language plpgsql as $$
declare v_cfg jsonb := private.cfg('duels'); v_play interval; d public.duels%rowtype;
begin
  v_play := make_interval(secs => coalesce((v_cfg ->> 'play_seconds')::int, 150) + 30);
  update public.duel_runs r set finished_at = now(), score = 0, time_ms = 0, valid = false, summary = '{"timed_out": true}'
   where r.finished_at is null and r.started_at < now() - v_play;
  for d in select * from public.duels where status = 'challenger_playing'
           and exists (select 1 from public.duel_runs r where r.duel_id = duels.id and r.role = 'challenger' and r.finished_at is not null) for update skip locked loop
    update public.duels set status = 'open', open_until = now() + make_interval(hours => coalesce((v_cfg ->> 'open_hours')::int, 24)) where id = d.id;
  end loop;
  for d in select * from public.duels where status = 'opponent_playing'
           and exists (select 1 from public.duel_runs r where r.duel_id = duels.id and r.role = 'opponent' and r.finished_at is not null) for update skip locked loop
    perform private.duel_pay(d);
  end loop;
  for d in select * from public.duels where status = 'open' and open_until < now() for update skip locked loop
    perform private.grant(d.challenger_id, jsonb_build_object('ink', d.stake), 'duel_refund', 'duel', d.id::text, 'duel:' || d.id || ':refund:c');
    update public.duels set status = 'expired', finished_at = now() where id = d.id;
  end loop;
end $$;

create or replace function private.duel_json(d public.duels, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', d.id, 'game', d.game, 'stake', d.stake, 'status', d.status, 'created_at', d.created_at, 'open_until', d.open_until,
    'finished_at', d.finished_at, 'payout', d.payout, 'fee', d.fee,
    'challenger', private.profile_json(d.challenger_id),
    'opponent', case when d.opponent_id is not null then private.profile_json(d.opponent_id) end,
    'invited', case when d.invited_id is not null then private.profile_json(d.invited_id) end,
    'mine', p_viewer in (d.challenger_id, d.opponent_id),
    'result', case when d.status = 'done' and p_viewer in (d.challenger_id, d.opponent_id) then
                case when d.winner_id is null then 'draw' when d.winner_id = p_viewer then 'won' else 'lost' end end,
    -- scores stay hidden until both have played, so nobody plays knowing the number to beat
    'runs', case when d.status = 'done' then (select jsonb_agg(jsonb_build_object('role', r.role, 'score', r.score, 'time_ms', r.time_ms, 'summary', r.summary)) from public.duel_runs r where r.duel_id = d.id)
                 else (select jsonb_agg(jsonb_build_object('role', r.role, 'score', r.score, 'time_ms', r.time_ms, 'summary', r.summary)) from public.duel_runs r where r.duel_id = d.id and r.player_id = p_viewer) end)
$$;

create or replace function private.duel_start_json(d public.duels, r public.duel_runs) returns jsonb
language sql stable as $$
  select jsonb_build_object('duel_id', d.id, 'game', d.game, 'seed', d.seed, 'stake', d.stake, 'role', r.role,
    'started_at', r.started_at, 'expires_at', r.started_at + make_interval(secs => coalesce((private.cfg('duels') ->> 'play_seconds')::int, 150)),
    'server_time', now(), 'balances', private.balances(r.player_id))
$$;

create or replace function public.duel_create(p_game text, p_stake int, p_invite text default null, p_idempotency_key text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cfg jsonb := private.cfg('duels'); v_prev jsonb;
  v_invited uuid; d public.duels%rowtype; r public.duel_runs%rowtype; v_res jsonb;
begin
  perform private.duel_sweep();
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then raise exception 'duels_disabled' using errcode = 'P0001'; end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'duel_create');
  if v_prev is not null then return v_prev; end if;
  if p_game not in ('turfwars', 'paletteclash', 'forgery', 'pixelrecall') or not coalesce((v_cfg -> 'games' ->> p_game)::boolean, true) then
    raise exception 'invalid_game' using errcode = 'P0001';
  end if;
  if p_stake is null or p_stake < coalesce((v_cfg ->> 'min_stake')::int, 10) or p_stake > coalesce((v_cfg ->> 'max_stake')::int, 500) then
    raise exception 'invalid_stake' using errcode = 'P0001';
  end if;
  if (select count(*) from public.duels where challenger_id = v_uid and created_at >= private.day_start(now())) >= coalesce((v_cfg ->> 'daily_limit')::int, 20) then
    raise exception 'duel_limit_reached' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.duels where challenger_id = v_uid and status = 'challenger_playing') then
    raise exception 'duel_in_progress' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_invite, '')), '') is not null then
    select id into v_invited from public.profiles where lower(username) = lower(btrim(p_invite));
    if v_invited is null or v_invited = v_uid then raise exception 'player_not_found' using errcode = 'P0001'; end if;
  end if;
  insert into public.duels (game, seed, stake, challenger_id, invited_id)
  values (p_game, floor(random() * 2147483646 + 1)::bigint, p_stake, v_uid, v_invited) returning * into d;
  perform private.charge(v_uid, jsonb_build_object('ink', p_stake), 'duel_stake', 'duel', d.id::text, 'duel:' || d.id || ':stake:c');
  insert into public.duel_runs (duel_id, player_id, role) values (d.id, v_uid, 'challenger') returning * into r;
  v_res := private.duel_start_json(d, r);
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

create or replace function public.duel_accept(p_duel_id uuid, p_idempotency_key text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_cfg jsonb := private.cfg('duels'); v_prev jsonb; d public.duels%rowtype; r public.duel_runs%rowtype; v_res jsonb;
begin
  perform private.duel_sweep();
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then raise exception 'duels_disabled' using errcode = 'P0001'; end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'duel_accept');
  if v_prev is not null then return v_prev; end if;
  select * into d from public.duels where id = p_duel_id for update;
  if not found or d.status <> 'open' or (d.invited_id is not null and d.invited_id <> v_uid) then raise exception 'duel_unavailable' using errcode = 'P0001'; end if;
  if d.challenger_id = v_uid then raise exception 'own_duel' using errcode = 'P0001'; end if;
  if exists (select 1 from public.duels x where x.opponent_id = v_uid and x.status = 'opponent_playing') then
    raise exception 'duel_in_progress' using errcode = 'P0001';
  end if;
  perform private.charge(v_uid, jsonb_build_object('ink', d.stake), 'duel_stake', 'duel', d.id::text, 'duel:' || d.id || ':stake:o');
  update public.duels set opponent_id = v_uid, status = 'opponent_playing' where id = d.id returning * into d;
  insert into public.duel_runs (duel_id, player_id, role) values (d.id, v_uid, 'opponent') returning * into r;
  v_res := private.duel_start_json(d, r);
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

create or replace function public.duel_cancel(p_duel_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); d public.duels%rowtype;
begin
  perform private.duel_sweep();
  select * into d from public.duels where id = p_duel_id for update;
  if not found or d.challenger_id <> v_uid or d.status <> 'open' then raise exception 'duel_unavailable' using errcode = 'P0001'; end if;
  perform private.grant(v_uid, jsonb_build_object('ink', d.stake), 'duel_refund', 'duel', d.id::text, 'duel:' || d.id || ':refund:c');
  update public.duels set status = 'cancelled', finished_at = now() where id = d.id returning * into d;
  return private.duel_json(d, v_uid) || jsonb_build_object('balances', private.balances(v_uid));
end $$;

create or replace function public.duels_lobby() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  perform private.duel_sweep();
  return jsonb_build_object(
    'config', (select jsonb_build_object('enabled', coalesce((v ->> 'enabled')::boolean, false), 'min_stake', v -> 'min_stake', 'max_stake', v -> 'max_stake',
                       'fee_pct', v -> 'fee_pct', 'daily_limit', v -> 'daily_limit', 'play_seconds', v -> 'play_seconds', 'games', v -> 'games')
               from (select private.cfg('duels') v) c),
    'open', (select coalesce(jsonb_agg(private.duel_json(d, v_uid) order by (d.invited_id = v_uid) desc nulls last, d.created_at desc), '[]'::jsonb)
             from (select * from public.duels where status = 'open' and challenger_id is distinct from v_uid
                   and (invited_id is null or invited_id = v_uid) and private.visible_to(challenger_id, v_uid)
                   order by created_at desc limit 50) d),
    'mine', case when v_uid is null then '[]'::jsonb else (select coalesce(jsonb_agg(private.duel_json(d, v_uid) order by d.created_at desc), '[]'::jsonb)
             from (select * from public.duels where challenger_id = v_uid or opponent_id = v_uid order by created_at desc limit 40) d) end,
    'record', case when v_uid is null then null else (select jsonb_build_object(
               'won', count(*) filter (where winner_id = v_uid),
               'lost', count(*) filter (where status = 'done' and winner_id is not null and winner_id <> v_uid),
               'draws', count(*) filter (where status = 'done' and winner_id is null),
               'net_ink', coalesce(sum(case when winner_id = v_uid then payout - stake when status = 'done' and winner_id is not null then -stake else 0 end), 0))
             from public.duels where status = 'done' and (challenger_id = v_uid or opponent_id = v_uid)) end);
end $$;

-- the validator (Edge Function / worker) reads the run it is checking
create or replace function public.svc_duel_run(p_duel_id uuid, p_player_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('duel_id', d.id, 'game', d.game, 'seed', d.seed, 'role', r.role, 'started_at', r.started_at,
                            'finished', r.finished_at is not null, 'status', d.status)
  from public.duels d join public.duel_runs r on r.duel_id = d.id
  where d.id = p_duel_id and r.player_id = p_player_id
$$;

create or replace function public.svc_duel_finish(p_duel_id uuid, p_player_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.duels%rowtype; r public.duel_runs%rowtype; v_cfg jsonb := private.cfg('duels');
  v_elapsed numeric; v_valid boolean; v_score int; v_time int;
begin
  select * into d from public.duels where id = p_duel_id for update;
  select * into r from public.duel_runs where duel_id = p_duel_id and player_id = p_player_id for update;
  if not found then raise exception 'duel_unavailable' using errcode = 'P0001'; end if;
  if r.finished_at is not null then raise exception 'run_finished' using errcode = 'P0001'; end if;
  v_elapsed := extract(epoch from (now() - r.started_at)) * 1000;
  v_valid := coalesce((p_result ->> 'valid')::boolean, false)
             and coalesce((p_result ->> 'time_ms')::numeric, 0) <= v_elapsed + 2000
             and v_elapsed <= (coalesce((v_cfg ->> 'play_seconds')::int, 150) + 20) * 1000;
  v_score := case when v_valid then greatest(0, least(coalesce((p_result ->> 'score')::int, 0), 100000)) else 0 end;
  v_time := case when v_valid then greatest(0, coalesce((p_result ->> 'time_ms')::int, 0)) else 0 end;
  update public.duel_runs set finished_at = now(), score = v_score, time_ms = v_time, valid = v_valid,
         summary = coalesce(p_result -> 'summary', '{}'::jsonb)
   where duel_id = p_duel_id and player_id = p_player_id;
  if r.role = 'challenger' and d.status = 'challenger_playing' then
    update public.duels set status = 'open', open_until = now() + make_interval(hours => coalesce((v_cfg ->> 'open_hours')::int, 24))
     where id = d.id returning * into d;
  elsif r.role = 'opponent' and d.status = 'opponent_playing' then
    d := private.duel_pay(d);
  end if;
  return private.duel_json(d, p_player_id) || jsonb_build_object('valid', v_valid, 'score', v_score, 'time_ms', v_time, 'balances', private.balances(p_player_id));
end $$;

create or replace function public.admin_duels() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy', 'moderator']);
begin
  return jsonb_build_object(
    'today', (select jsonb_build_object('duels', count(*), 'done', count(*) filter (where status = 'done'),
                                        'ink_staked', coalesce(sum(stake * case when opponent_id is null then 1 else 2 end), 0),
                                        'fees', coalesce(sum(fee), 0))
              from public.duels where created_at >= private.day_start(now())),
    'recent', (select coalesce(jsonb_agg(private.duel_json(d, null) order by d.created_at desc), '[]'::jsonb)
               from (select * from public.duels order by created_at desc limit 30) d));
end $$;

-- ===== 4. Refill the joystick with Ink ===========================================
update public.game_config
   set value = jsonb_set(value, '{joystick}', coalesce(value -> 'joystick', '{}'::jsonb)
                 || jsonb_build_object('refill_ink', coalesce((value -> 'joystick' ->> 'refill_ink')::int, 50),
                                       'ink_refills_per_day', coalesce((value -> 'joystick' ->> 'ink_refills_per_day')::int, 3)), true)
 where key = 'explorer';

create or replace function private.joystick_json(e public.explorers) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'enabled', coalesce((j ->> 'enabled')::boolean, true),
    'seconds_left', round((case when coalesce((j ->> 'daily_refill')::boolean, true)
                                     and (e.joy_day is null or e.joy_day < private.day_start(now()))
                                then greatest(e.joy_seconds, coalesce((j ->> 'tank_seconds')::real, 60))
                                else e.joy_seconds end)::numeric, 2),
    'tank_seconds', coalesce((j ->> 'tank_seconds')::real, 60),
    'speed_kmh', coalesce((j ->> 'speed_kmh')::real, 40),
    'daily_refill', coalesce((j ->> 'daily_refill')::boolean, true),
    'next_refill_at', private.day_start(now()) + interval '1 day',
    'ads_enabled', private.flag('rewarded_ads'),
    'refill_ink', coalesce((j ->> 'refill_ink')::int, 50),
    'ink_refills_left', greatest(coalesce((j ->> 'ink_refills_per_day')::int, 3) - (
        select count(*) from public.resource_ledger l where l.player_id = e.player_id and l.reason = 'joystick_refill'
          and l.created_at >= private.day_start(now())), 0))
  from (select coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb) as j) s
$$;

create or replace function public.refill_joystick_with_ink(p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_prev jsonb; e public.explorers%rowtype;
  j jsonb := coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb); v_cost int; v_res jsonb;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'joystick_refill');
  if v_prev is not null then return v_prev; end if;
  v_cost := greatest(coalesce((j ->> 'refill_ink')::int, 50), 0);
  select * into e from public.explorers where player_id = v_uid for update;
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  if (private.joystick_json(e) ->> 'ink_refills_left')::int <= 0 then raise exception 'refill_limit_reached' using errcode = 'P0001'; end if;
  if (private.joystick_json(e) ->> 'seconds_left')::numeric >= coalesce((j ->> 'tank_seconds')::numeric, 60) then
    raise exception 'tank_full' using errcode = 'P0001';
  end if;
  if v_cost > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'joystick_refill', 'explorer', v_uid::text, p_idempotency_key); end if;
  update public.explorers set joy_seconds = coalesce((j ->> 'tank_seconds')::real, 60), joy_day = private.day_start(now()), updated_at = now()
   where player_id = v_uid;
  v_res := private.explorer_json(v_uid) || jsonb_build_object('balances', private.balances(v_uid), 'cost', v_cost);
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- ===== 5. Grants ==================================================================
do $$
declare f text;
begin
  foreach f in array array['private.duel_pay(public.duels)', 'private.duel_sweep()', 'private.duel_json(public.duels, uuid)',
                           'private.duel_start_json(public.duels, public.duel_runs)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.duel_create(text, int, text, text)', 'public.duel_accept(uuid, text)', 'public.duel_cancel(uuid)',
                           'public.duels_lobby()', 'public.admin_duels()', 'public.refill_joystick_with_ink(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.svc_duel_run(uuid, uuid)', 'public.svc_duel_finish(uuid, uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
