-- Ink integrity.
--  1. Minigames: Ink (the level's Ink, every round's Ink and every performance bonus) is paid only when the whole level is
--     cleared — every round. Losing a round on purpose to replay an easy level for its round Ink now pays nothing (XP
--     only), and a failed run no longer uses up one of the day's Ink-paying runs.
--  2. Arcade: solo runs pay at most the cabinet's max Ink per run (Endless runs were uncapped), and arcade Ink has a
--     daily cap (it had none).
--  3. Group games (balloons / race): a daily Ink cap — a two-account group could start 30 games an hour.
--  4. Ink pacing (hidden): Ink from grindable sources is scaled by a smooth, invisible factor — full rate for a normal
--     day, then gently less the more a player earns that day or the faster they earn this hour, and less again for
--     bot-like play (active most hours of the day, or perfectly regular timing). Amounts are rounded at random so there
--     are no visible steps, and every screen shows what was actually paid. Fixed rewards (daily streak, wheel, referrals,
--     ads, clans, duels/stamp sales, conversions) are never scaled. Tunable in game_config 'ink_pacing'.

-- ---- 1. minigames: Ink only for a full clear -------------------------------------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.svc_finish_minigame(uuid,jsonb)'::regprocedure);
  -- (a test database built without the round/bonus migrations has an older finish: nothing to change there)
  if position('v_bonus_res' in d) = 0 then return; end if;
  -- a pass needs every round
  n := replace(d, $a$  v_cleared := case when v_valid then least(greatest(coalesce((p_result ->> 'rounds_passed')::int, case when v_passed then v_total else 0 end), 0), v_total) else 0 end;$a$,
                  $a$  v_cleared := case when v_valid then least(greatest(coalesce((p_result ->> 'rounds_passed')::int, case when v_passed then v_total else 0 end), 0), v_total) else 0 end;
  -- a level is only beaten (and only pays Ink) when every round is cleared
  if v_passed and v_cleared < v_total then v_passed := false; v_stars := 0; end if;$a$);
  -- only full clears pay, and only they use up a paid run
  n := replace(n, $a$    if v_cleared > 0 and v_today < v_limit then$a$, $a$    if v_passed and v_today < v_limit then$a$);
  n := replace(n, $a$    elsif v_cleared > 0 then
      v_practice := true;$a$, $a$    elsif v_passed then
      v_practice := true;$a$);
  n := replace(n, $a$      v_ink := floor(((case when v_passed then greatest(coalesce(v_per_round, 0), 0) else 0 end) + greatest(v_bonus, 0) + v_perf) * v_ink_mult);$a$,
                  $a$      v_ink := floor((greatest(coalesce(v_per_round, 0), 0) + greatest(v_bonus, 0) + v_perf) * v_ink_mult);
      -- hidden pacing: what's shown is what's paid
      v_ink := private.ink_pace(v_s.player_id, v_ink, 'minigame');$a$);
  -- the breakdown shows the parts of what was really paid
  n := replace(n, $a$    v_breakdown := jsonb_build_object($a$, $a$    if v_ink > 0 and private.ink_pace_factor() < 1 then
      v_ink_mult := v_ink_mult * private.ink_pace_factor();
    end if;
    v_breakdown := jsonb_build_object($a$);
  n := replace(n, $a$      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);$a$,
                  $a$      perform set_config('landvas.ink_paced', '1', true);
      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);
      perform set_config('landvas.ink_paced', '', true);$a$);
  -- the breakdown and the result: nothing for a failed run
  n := replace(n, $a$      'round_ink', case when v_practice then 0 else floor(greatest(v_bonus, 0) * v_ink_mult) end,
      'bonus_ink', case when v_practice then 0 else floor(v_perf * v_ink_mult) end,
      'bonuses', case when v_practice then '[]'::jsonb else coalesce(v_bonus_res -> 'hits', '[]'::jsonb) end,$a$,
                  $a$      'round_ink', case when v_practice or not v_passed then 0 else floor(greatest(v_bonus, 0) * v_ink_mult) end,
      'bonus_ink', case when v_practice or not v_passed then 0 else floor(v_perf * v_ink_mult) end,
      'bonuses', case when v_practice or not v_passed then '[]'::jsonb else coalesce(v_bonus_res -> 'hits', '[]'::jsonb) end,$a$);
  n := replace(n, $a$'round_ink', floor(v_bonus * coalesce(v_ink_mult, 1)),$a$, $a$'round_ink', case when v_ink > 0 then floor(v_bonus * coalesce(v_ink_mult, 1)) else 0 end,$a$);
  n := replace(n, $a$'bonus_ink', floor(v_perf * coalesce(v_ink_mult, 1)), 'bonuses', coalesce(v_bonus_res -> 'hits', '[]'::jsonb),$a$,
                  $a$'bonus_ink', case when v_ink > 0 then floor(v_perf * coalesce(v_ink_mult, 1)) else 0 end, 'bonuses', case when v_ink > 0 then coalesce(v_bonus_res -> 'hits', '[]'::jsonb) else '[]'::jsonb end,$a$);
  if position('if v_passed and v_cleared < v_total' in n) = 0 or position('if v_passed and v_today < v_limit then' in n) = 0
     or position('elsif v_passed then' in n) = 0 or position($a$private.ink_pace(v_s.player_id, v_ink, 'minigame')$a$ in n) = 0
     or position('ink_pace_factor() < 1' in n) = 0 or position($a$set_config('landvas.ink_paced', '1', true)$a$ in n) = 0
     or position('case when v_practice or not v_passed then 0' in n) = 0 or position($a$'round_ink', case when v_ink > 0$a$ in n) = 0 or position($a$'bonus_ink', case when v_ink > 0$a$ in n) = 0 then
    raise exception 'ink integrity: svc_finish_minigame anchors not found';
  end if;
  -- (ink_pace is defined below; plpgsql resolves it at run time)
  execute n;
end $$;

-- ---- 4. hidden pacing ------------------------------------------------------------------------------------------------
insert into public.game_config (key, value) values ('ink_pacing', jsonb_build_object(
  'enabled', true,
  'day_soft', 1200,      -- Ink a player earns at full rate each day (from grindable sources)
  'day_half', 1200,      -- … then the rate halves by this much more (smoothly, never a step)
  'hour_soft', 450,      -- Ink in a rolling hour at full rate
  'hour_half', 450,      -- … then halves by this much more
  'floor', 0.2,          -- never below this share
  'bot_hours', 18,       -- earning in this many different hours of one day looks automated
  'bot_regular_cv', 0.06,-- gaps between payouts this regular (coefficient of variation) look automated
  'bot_min_events', 40,  -- … judged after this many payouts
  'bot_factor', 0.6,     -- automated-looking play pays this share
  'paced', jsonb_build_array('minigame', 'arcade', 'realm', 'farm', 'business', 'space', 'inkborn', 'group_game', 'travel', 'finds',
                             'sketch', 'doodle', 'duet', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'pvp')))
on conflict (key) do nothing;

create table if not exists private.ink_pacing (
  player_id uuid primary key references public.players (id) on delete cascade,
  day timestamptz not null,
  earned numeric not null default 0,   -- raw Ink earned today (before pacing)
  paid numeric not null default 0,     -- Ink actually paid today
  pace numeric not null default 0,     -- rolling hour (exponentially decayed)
  hours int not null default 0,        -- bit per hour of the day with earnings
  events int not null default 0,       -- payouts today
  gap_mean numeric, gap_var numeric,   -- payout timing (EWMA)
  last_at timestamptz,
  factor numeric not null default 1,   -- last factor applied (for the operator)
  updated_at timestamptz not null default now());
alter table private.ink_pacing enable row level security;
revoke all on private.ink_pacing from public, anon, authenticated;

/** the factor of the last paced payout in this transaction (1 = full rate) */
create or replace function private.ink_pace_factor() returns numeric language sql stable as $$
  select coalesce(nullif(current_setting('landvas.ink_pace_factor', true), '')::numeric, 1)
$$;

/** Ink cut by pacing so far in this transaction (so screens show what was really paid) */
create or replace function private.ink_pace_cut() returns int language sql stable as $$
  select coalesce(nullif(current_setting('landvas.ink_pace_cut', true), '')::int, 0)
$$;

/** pace a payout: returns the Ink to really pay (same as asked at full rate) */
create or replace function private.ink_pace(p_uid uuid, p_amount int, p_reason text) returns int language plpgsql as $$
declare c jsonb := coalesce(private.cfg('ink_pacing'), '{}'::jsonb); s private.ink_pacing; v_day timestamptz := private.day_start(now());
  v_dt numeric; v_gap numeric; v_mid numeric; f_day numeric; f_hour numeric; f_bot numeric := 1; v_f numeric; v_x numeric; v_pay int;
  v_floor numeric := least(greatest(coalesce((c ->> 'floor')::numeric, 0.2), 0), 1); v_hr int;
begin
  if p_amount is null or p_amount <= 0 or p_uid is null then return coalesce(p_amount, 0); end if;
  if not coalesce((c ->> 'enabled')::boolean, true) or not coalesce(c -> 'paced', '[]'::jsonb) ? p_reason then return p_amount; end if;
  insert into private.ink_pacing (player_id, day) values (p_uid, v_day) on conflict do nothing;
  select * into s from private.ink_pacing where player_id = p_uid for update;
  if s.day is distinct from v_day then s.day := v_day; s.earned := 0; s.paid := 0; s.hours := 0; s.events := 0; end if;
  -- the rolling hour decays continuously
  v_dt := greatest(extract(epoch from now() - coalesce(s.last_at, now())), 0);
  s.pace := coalesce(s.pace, 0) * exp(-v_dt / 3600.0);
  -- timing regularity (gaps between payouts)
  if s.last_at is not null and v_dt > 0 then
    v_gap := least(v_dt, 3600);
    if s.gap_mean is null then s.gap_mean := v_gap; s.gap_var := 0;
    else
      s.gap_var := 0.9 * (coalesce(s.gap_var, 0) + 0.1 * (v_gap - s.gap_mean) ^ 2);
      s.gap_mean := 0.9 * s.gap_mean + 0.1 * v_gap;
    end if;
  end if;
  -- smooth factors, judged at the middle of this payout
  v_mid := s.earned + p_amount / 2.0;
  f_day := case when v_mid <= coalesce((c ->> 'day_soft')::numeric, 1200) then 1
                else 1 / (1 + (v_mid - coalesce((c ->> 'day_soft')::numeric, 1200)) / greatest(coalesce((c ->> 'day_half')::numeric, 1200), 1)) end;
  v_mid := s.pace + p_amount / 2.0;
  f_hour := case when v_mid <= coalesce((c ->> 'hour_soft')::numeric, 450) then 1
                 else 1 / (1 + (v_mid - coalesce((c ->> 'hour_soft')::numeric, 450)) / greatest(coalesce((c ->> 'hour_half')::numeric, 450), 1)) end;
  v_hr := extract(hour from now() - v_day)::int;
  s.hours := s.hours | (1 << least(greatest(v_hr, 0), 30));
  if length(replace(s.hours::bit(31)::text, '0', '')) >= coalesce((c ->> 'bot_hours')::int, 18)
     or (s.events >= coalesce((c ->> 'bot_min_events')::int, 40) and s.gap_mean > 0
         and sqrt(greatest(s.gap_var, 0)) / s.gap_mean < coalesce((c ->> 'bot_regular_cv')::numeric, 0.06)) then
    f_bot := least(greatest(coalesce((c ->> 'bot_factor')::numeric, 0.6), 0), 1);
  end if;
  v_f := greatest(least(f_day * f_hour * f_bot, 1), v_floor);
  -- random rounding: no visible steps
  v_x := p_amount * v_f;
  v_pay := case when v_f >= 1 then p_amount else floor(v_x)::int + case when random() < v_x - floor(v_x) then 1 else 0 end end;
  update private.ink_pacing set day = s.day, earned = s.earned + p_amount, paid = s.paid + v_pay, pace = s.pace + p_amount, hours = s.hours,
         events = s.events + 1, gap_mean = s.gap_mean, gap_var = s.gap_var, last_at = now(), factor = round(v_f, 4), updated_at = now()
   where player_id = p_uid;
  perform set_config('landvas.ink_pace_factor', v_f::text, true);
  perform set_config('landvas.ink_pace_cut', (private.ink_pace_cut() + (p_amount - v_pay))::text, true);
  return v_pay;
end $$;

-- grant paces every paced source that wasn't paced already (referrers' shares follow what was really paid)
create or replace function private."grant"(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record; v_amt bigint;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      v_amt := r.amount;
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'daily_streak', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward', 'space', 'farm', 'business', 'arcade', 'realm', 'clan', 'travel', 'finds', 'group_game') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      if r.key = 'ink' and coalesce(current_setting('landvas.ink_paced', true), '') <> '1' then
        v_amt := private.ink_pace(p_player, v_amt::int, p_reason);
        continue when v_amt <= 0;
      end if;
      perform private.ledger_apply(p_player, r.key, v_amt, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' and p_reason <> 'ad_reward' then perform private.referral_share(p_player, v_amt, p_reason); end if;
      if r.key = 'ink' and p_reason not in ('clan', 'ad_reward', 'referral', 'referral_welcome', 'usd_conversion', 'duel_refund') then
        perform private.clan_credit(p_player, private.clan_cat(p_reason, p_ref_type), v_amt);
      end if;
    end if;
  end loop;
end $$;

/** pay paced Ink and say what was really paid (used by the per-system pay helpers) */
create or replace function private.grant_ink_paced(p_uid uuid, p_amount int, p_reason text, p_ref_type text, p_ref_id text, p_idem text) returns int language plpgsql as $$
declare v int;
begin
  v := private.ink_pace(p_uid, p_amount, p_reason);
  if v > 0 then
    perform set_config('landvas.ink_paced', '1', true);
    perform private.grant(p_uid, jsonb_build_object('ink', v), p_reason, p_ref_type, p_ref_id, p_idem);
    perform set_config('landvas.ink_paced', '', true);
  end if;
  return v;
end $$;

-- the per-system pay helpers return what was really paid
do $$
declare f text; d text; n text; m text[];
begin
  foreach f in array array['private.rlm_pay(uuid,text,integer,text,text)', 'private.biz_pay(uuid,integer,text,text)', 'private.farm_pay(uuid,integer,text,text)',
                           'private.space_pay(uuid,integer,text,text,text,boolean)', 'private.planet_pay(uuid,integer,text,text)',
                           'private.inkborn_pay(uuid,integer,text,text,text)', 'private.arc_pay(uuid,integer,text,text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    m := regexp_match(d, $r$perform private\.grant\(p_uid, jsonb_build_object\('ink', (v_pay|p_amount)\), ('[a-z_]+'), $r$);
    if m is null then raise exception 'ink pacing: % anchor not found', f; end if;
    n := regexp_replace(d, $r$perform private\.grant\(p_uid, jsonb_build_object\('ink', (v_pay|p_amount)\), ('[a-z_]+'), ([^;]*)\);$r$,
                        '\1 := private.grant_ink_paced(p_uid, \1, \2, \3);');
    if n = d then raise exception 'ink pacing: % not patched', f; end if;
    execute n;
  end loop;
end $$;

-- screens show what was really paid ("earned" never looks larger than "paid" because of pacing)
do $$
declare f text; d text; n text;
begin
  foreach f in array array['public.biz_game_finish', 'public.farm_game_finish', 'public.inkborn_game_finish', 'public.planet_game_finish',
                           'public.inkborn_job_claim', 'public.inkborn_playdate_finish', 'public.space_game_finish', 'public.planet_meteor_grab', 'public.space_collect'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.oid = (select oid from pg_proc where proname = split_part(f, '.', 2) and pronamespace = 'public'::regnamespace limit 1);
    n := replace(d, $a$'capped', v_paid < v_ink$a$, $a$'capped', v_paid + private.ink_pace_cut() < v_ink$a$);
    n := replace(n, $a$'earned', v_ink,$a$, $a$'earned', greatest(v_ink - private.ink_pace_cut(), 0),$a$);
    if n = d then raise exception 'ink pacing: % not patched', f; end if;
    execute n;
  end loop;
  d := pg_get_functiondef('public.habitat_collect(uuid)'::regprocedure);
  n := replace(d, $a$'capped', v_paid < (st ->> 'ready')::int$a$, $a$'capped', v_paid + private.ink_pace_cut() < (st ->> 'ready')::int$a$);
  if n = d then raise exception 'ink pacing: habitat_collect not patched'; end if;
  execute n;
end $$;

-- map finds pay through grant: say what was really paid
do $$
declare d text; n text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'map_find_claim' and pronamespace = 'public'::regnamespace;
  n := replace(d, $a$return jsonb_build_object('id', p_id, 'kind', v ->> 'kind', 'ink', v_ink,$a$, $a$return jsonb_build_object('id', p_id, 'kind', v ->> 'kind', 'ink', greatest(v_ink - private.ink_pace_cut(), 0),$a$);
  if n = d then raise exception 'ink pacing: map_find_claim not patched'; end if;
  execute n;
end $$;

-- ---- 2. arcade: max Ink per run, and a daily cap -------------------------------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.arcade_finish(uuid,integer)'::regprocedure);
  n := replace(d, $a$    v_paid := private.arc_pay(v_uid, floor(v_inkf)::int, 'arcade:' || s.id, 'arcade-play:' || s.id);$a$,
                  $a$    -- one run pays at most the cabinet's max (Endless included)
    v_inkf := least(v_inkf, p.ink_frac + coalesce((g ->> 'max_ink')::numeric, 10));
    v_paid := private.arc_pay(v_uid, floor(v_inkf)::int, 'arcade:' || s.id, 'arcade-play:' || s.id);$a$);
  if n = d then raise exception 'ink integrity: arcade_finish anchor not found'; end if;
  execute n;
  d := pg_get_functiondef('private.arc_pay(uuid,integer,text,text)'::regprocedure);
  n := replace(d, $a$  insert into public.arcade_ink_days (player_id, day) values (p_uid, private.day_start(now())) on conflict do nothing;$a$,
                  $a$  insert into public.arcade_ink_days (player_id, day) values (p_uid, private.day_start(now())) on conflict do nothing;
  -- a daily cap on arcade Ink (0 = none)
  if coalesce((private.arc_cfg() ->> 'daily_ink_cap')::int, 150) > 0 then
    p_amount := least(p_amount, greatest(0, coalesce((private.arc_cfg() ->> 'daily_ink_cap')::int, 150)
                  - coalesce((select ink from public.arcade_ink_days where player_id = p_uid and day = private.day_start(now()) for update), 0)));
    if p_amount <= 0 then return 0; end if;
  end if;$a$);
  if n = d then raise exception 'ink integrity: arc_pay anchor not found'; end if;
  execute n;
end $$;

-- ---- 3. group games: a daily cap ------------------------------------------------------------------------------------
create table if not exists public.group_game_ink_days (player_id uuid not null references public.players (id) on delete cascade, day timestamptz not null,
  ink int not null default 0, primary key (player_id, day));
alter table public.group_game_ink_days enable row level security;
revoke all on public.group_game_ink_days from anon, authenticated;

create or replace function private.gg_pay(p_uid uuid, p_amount int, p_ref text, p_idem text) returns int language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); v_had int; v_pay int; v_cap int := coalesce((private.gg_cfg() ->> 'daily_ink_cap')::int, 60);
begin
  if coalesce(p_amount, 0) <= 0 then return 0; end if;
  insert into public.group_game_ink_days (player_id, day) values (p_uid, v_day) on conflict do nothing;
  select ink into v_had from public.group_game_ink_days where player_id = p_uid and day = v_day for update;
  v_pay := case when v_cap > 0 then least(p_amount, greatest(0, v_cap - v_had)) else p_amount end;
  if v_pay > 0 then
    update public.group_game_ink_days set ink = ink + v_pay where player_id = p_uid and day = v_day;
    v_pay := private.grant_ink_paced(p_uid, v_pay, 'group_game', 'group_game', p_ref, p_idem);
  end if;
  return v_pay;
end $$;
revoke all on function private.gg_pay(uuid, integer, text, text) from public, anon, authenticated;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.group_game_settle(uuid)'::regprocedure);
  n := replace(d, $a$      perform private.grant(r.player_id, jsonb_build_object('ink', least(r.n * coalesce((c ->> 'ink_each')::int, 1), coalesce((c ->> 'ink_cap')::int, 12))),
        'group_game', 'group_game', g.id::text, 'gg:' || g.id || ':' || r.player_id);$a$,
                  $a$      perform private.gg_pay(r.player_id, least(r.n * coalesce((c ->> 'ink_each')::int, 1), coalesce((c ->> 'ink_cap')::int, 12)), g.id::text, 'gg:' || g.id || ':' || r.player_id);$a$);
  n := replace(n, $a$    perform private.grant(v_win, jsonb_build_object('ink', coalesce((c ->> 'winner_ink')::int, 5)), 'group_game', 'group_game', g.id::text, 'gg:' || g.id || ':win');$a$,
                  $a$    perform private.gg_pay(v_win, coalesce((c ->> 'winner_ink')::int, 5), g.id::text, 'gg:' || g.id || ':win');$a$);
  if position('private.grant(' in n) > 0 then raise exception 'ink integrity: group_game_settle not patched'; end if;
  execute n;
end $$;

-- ---- the operator's view -------------------------------------------------------------------------------------------
create or replace function public.admin_ink_pacing() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']);
begin
  return jsonb_build_object('config', private.cfg('ink_pacing'),
    'today', coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(p.player_id), 'earned', round(p.earned), 'paid', round(p.paid),
                         'factor', p.factor, 'hours', length(replace(p.hours::bit(31)::text, '0', '')), 'events', p.events, 'last_at', p.last_at)
                       order by p.earned - p.paid desc, p.earned desc)
                       from (select * from private.ink_pacing where day = private.day_start(now()) order by earned - paid desc, earned desc limit 50) p), '[]'::jsonb));
end $$;
create or replace function public.admin_set_ink_pacing(p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); v jsonb;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  v := coalesce(private.cfg('ink_pacing'), '{}'::jsonb)
       || jsonb_strip_nulls(jsonb_build_object(
            'enabled', (p_config ->> 'enabled')::boolean,
            'day_soft', greatest((p_config ->> 'day_soft')::numeric, 0), 'day_half', greatest((p_config ->> 'day_half')::numeric, 1),
            'hour_soft', greatest((p_config ->> 'hour_soft')::numeric, 0), 'hour_half', greatest((p_config ->> 'hour_half')::numeric, 1),
            'floor', least(greatest((p_config ->> 'floor')::numeric, 0), 1), 'bot_factor', least(greatest((p_config ->> 'bot_factor')::numeric, 0), 1),
            'bot_hours', least(greatest((p_config ->> 'bot_hours')::int, 1), 24)));
  update public.game_config set value = v where key = 'ink_pacing';
  perform private.audit('config.ink_pacing', 'config', 'ink_pacing', p_config);
  return public.admin_ink_pacing();
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_ink_pacing()', 'public.admin_set_ink_pacing(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.ink_pace(uuid, integer, text)', 'private.ink_pace_factor()', 'private.ink_pace_cut()',
                           'private.grant_ink_paced(uuid, integer, text, text, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
