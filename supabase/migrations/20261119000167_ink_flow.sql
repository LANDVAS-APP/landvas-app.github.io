-- Ink Flow: uncapped Ink with a hidden, self-balancing rate built around one daily number.
--
-- The owner sets a daily Ink target T (what a dedicated player should earn in a day) and can uncap Ink for everyone:
-- every per-system daily cap (minigame paid runs, arcade, realms, business, farm and its market, space, planets,
-- Inkborn, the arena, group games, home games, map finds) is lifted, and Ink Flow alone keeps the economy sustainable.
--
-- Every paced payout is scaled by a hidden rate built from five parts, all derived from T:
--   momentum  — a session starts a little low and warms up with each activity (×0.8 → ×1.15), cooling when idle
--   heat      — Ink paid recently (decays with a ~45-minute half-life): heavy bursts slow down, a short break restores it
--   load      — Ink paid over the last many hours (~8-hour half-life): a long grind settles to a sustainable trickle
--   source    — Ink from the same activity recently: switching activities feels fresher than repeating one
--   day       — past ~1.2×T paid today the rate falls steeply
-- plus the existing bot signals (earning in most hours of the day, machine-regular timing). However low the rate, an
-- activity worth 4+ Ink still pays at least 1 Ink — until a player passes ~1.5×T in a day, when even that becomes
-- occasional. Payouts get a little random jitter and random rounding, so there are no visible steps, and every screen
-- shows exactly what was paid. Simulated: a 3-hour player earns ≈T, a 10-hour grinder ≈1.5T, a non-stop bot < 1.8T.
-- Fixed rewards (daily streak, wheel, referrals, ads, clans, duels, stamp sales, conversions) are never paced.

alter table private.ink_pacing add column if not exists heat numeric not null default 0;
alter table private.ink_pacing add column if not exists load numeric not null default 0;
alter table private.ink_pacing add column if not exists mom numeric not null default 0;
alter table private.ink_pacing add column if not exists src jsonb not null default '{}'::jsonb;
alter table private.ink_pacing add column if not exists rate numeric not null default 1;  -- the hidden rate right now (for the owner)

update public.game_config set value = jsonb_build_object(
  'enabled', coalesce((value ->> 'enabled')::boolean, true),
  'uncapped', false,
  'daily_target', 1500,
  'paced', value -> 'paced',
  -- shape (multiples of the daily target) and timing; the defaults are the simulated ones
  'heat_share', 0.30, 'load_share', 0.9, 'source_share', 0.35, 'day_share', 1.2, 'day_max_share', 1.5,
  'heat_half_min', 45, 'load_half_h', 8, 'momentum_half_min', 20, 'ramp_start', 0.8, 'ramp_peak', 1.15, 'jitter', 0.04,
  'floor_ink', 1, 'floor_min_raw', 4,
  'bot_hours', coalesce((value ->> 'bot_hours')::int, 18), 'bot_regular_cv', coalesce((value ->> 'bot_regular_cv')::numeric, 0.06),
  'bot_min_events', coalesce((value ->> 'bot_min_events')::int, 40), 'bot_factor', coalesce((value ->> 'bot_factor')::numeric, 0.6))
where key = 'ink_pacing';

/** Ink is uncapped for everyone (Ink Flow alone keeps it sustainable) */
create or replace function private.ink_uncapped() returns boolean language sql stable as $$
  select coalesce((private.cfg('ink_pacing') ->> 'uncapped')::boolean, false) and coalesce((private.cfg('ink_pacing') ->> 'enabled')::boolean, true)
$$;

/** the Ink Flow rate for one payout: returns the Ink to really pay */
create or replace function private.ink_pace(p_uid uuid, p_amount int, p_reason text) returns int language plpgsql as $$
declare c jsonb := coalesce(private.cfg('ink_pacing'), '{}'::jsonb); s private.ink_pacing; v_day timestamptz := private.day_start(now());
  t numeric := greatest(coalesce((c ->> 'daily_target')::numeric, 1500), 50);
  v_dt numeric; v_gap numeric; v_src text := coalesce(p_reason, 'other'); v_sh numeric; v_st numeric; v_hr int; v_bot boolean := false;
  f_heat numeric; f_load numeric; f_src numeric; f_day numeric; f_ramp numeric; v_m numeric; v_x numeric; v_pay int; v_fp numeric;
  v_peak numeric := greatest(coalesce((c ->> 'ramp_peak')::numeric, 1.15), 0.1);
  v_dmax numeric;
begin
  if p_amount is null or p_amount <= 0 or p_uid is null then return coalesce(p_amount, 0); end if;
  if not coalesce((c ->> 'enabled')::boolean, true) or not coalesce(c -> 'paced', '[]'::jsonb) ? p_reason then return p_amount; end if;
  insert into private.ink_pacing (player_id, day) values (p_uid, v_day) on conflict do nothing;
  select * into s from private.ink_pacing where player_id = p_uid for update;
  if s.day is distinct from v_day then s.day := v_day; s.earned := 0; s.paid := 0; s.hours := 0; s.events := 0; end if;
  v_dt := greatest(extract(epoch from now() - coalesce(s.last_at, now())), 0);
  -- everything cools with time
  s.heat := s.heat * power(2, -v_dt / (greatest(coalesce((c ->> 'heat_half_min')::numeric, 45), 1) * 60));
  s.load := s.load * power(2, -v_dt / (greatest(coalesce((c ->> 'load_half_h')::numeric, 8), 0.1) * 3600));
  s.mom := s.mom * power(2, -v_dt / (greatest(coalesce((c ->> 'momentum_half_min')::numeric, 20), 1) * 60));
  v_sh := coalesce((s.src -> v_src ->> 0)::numeric, 0); v_st := coalesce((s.src -> v_src ->> 1)::numeric, extract(epoch from now()));
  v_sh := v_sh * power(2, -greatest(extract(epoch from now()) - v_st, 0) / (greatest(coalesce((c ->> 'heat_half_min')::numeric, 45), 1) * 60));
  -- timing regularity (bot signal)
  if s.last_at is not null and v_dt > 0 then
    v_gap := least(v_dt, 3600);
    if s.gap_mean is null then s.gap_mean := v_gap; s.gap_var := 0;
    else s.gap_var := 0.9 * (coalesce(s.gap_var, 0) + 0.1 * (v_gap - s.gap_mean) ^ 2); s.gap_mean := 0.9 * s.gap_mean + 0.1 * v_gap; end if;
  end if;
  v_hr := extract(hour from now() - v_day)::int;
  s.hours := s.hours | (1 << least(greatest(v_hr, 0), 30));
  v_bot := length(replace(s.hours::bit(31)::text, '0', '')) >= coalesce((c ->> 'bot_hours')::int, 18)
           or (s.events >= coalesce((c ->> 'bot_min_events')::int, 40) and coalesce(s.gap_mean, 0) > 0
               and sqrt(greatest(coalesce(s.gap_var, 0), 0)) / s.gap_mean < coalesce((c ->> 'bot_regular_cv')::numeric, 0.06));
  -- the five parts
  f_ramp := coalesce((c ->> 'ramp_start')::numeric, 0.8) + (v_peak - coalesce((c ->> 'ramp_start')::numeric, 0.8)) * least(greatest(s.mom, 0), 1);
  f_heat := 1 / (1 + power(s.heat / (t * greatest(coalesce((c ->> 'heat_share')::numeric, 0.30), 0.01)), 2));
  f_load := 1 / (1 + power(s.load / (t * greatest(coalesce((c ->> 'load_share')::numeric, 0.9), 0.01)), 3));
  f_src := sqrt(1 / (1 + power(v_sh / (t * greatest(coalesce((c ->> 'source_share')::numeric, 0.35), 0.01)), 2)));
  f_day := 1 / (1 + power(s.paid / (t * greatest(coalesce((c ->> 'day_share')::numeric, 1.2), 0.01)), 6));
  v_m := least(f_ramp * f_heat * f_load * f_src * f_day * case when v_bot then least(greatest(coalesce((c ->> 'bot_factor')::numeric, 0.6), 0), 1) else 1 end, v_peak);
  -- a little jitter and random rounding: no visible steps
  v_x := p_amount * v_m * (1 + (random() * 2 - 1) * least(greatest(coalesce((c ->> 'jitter')::numeric, 0.04), 0), 0.25));
  v_pay := floor(v_x)::int + case when random() < v_x - floor(v_x) then 1 else 0 end;
  -- however slow, a real activity still pays a little — until the day is far past the target
  if v_pay < 1 and p_amount >= coalesce((c ->> 'floor_min_raw')::int, 4) then
    v_dmax := t * greatest(coalesce((c ->> 'day_max_share')::numeric, 1.5), 0.1);
    v_fp := case when s.paid < v_dmax then 1 else greatest(0.05, 0.5 * power(v_dmax / greatest(s.paid, 1), 4)) end * case when v_bot then 0.5 else 1 end;
    v_pay := case when random() < v_fp then greatest(coalesce((c ->> 'floor_ink')::int, 1), 0) else 0 end;
  end if;
  v_pay := least(greatest(v_pay, 0), ceil(p_amount * v_peak)::int);
  update private.ink_pacing set day = s.day, earned = s.earned + p_amount, paid = s.paid + v_pay, hours = s.hours, events = s.events + 1,
         gap_mean = s.gap_mean, gap_var = s.gap_var, last_at = now(), heat = s.heat + v_pay, load = s.load + v_pay,
         mom = s.mom + (1 - least(greatest(s.mom, 0), 1)) * 0.15,
         src = s.src || jsonb_build_object(v_src, jsonb_build_array(round(v_sh + v_pay, 3), extract(epoch from now()))),
         pace = v_m, factor = round(v_pay::numeric / p_amount, 4), rate = round(v_m, 4), updated_at = now()
   where player_id = p_uid;
  perform set_config('landvas.ink_pace_factor', (v_pay::numeric / p_amount)::text, true);
  perform set_config('landvas.ink_pace_cut', (private.ink_pace_cut() + (p_amount - v_pay))::text, true);
  return v_pay;
end $$;

-- ---- uncapped: every per-system daily cap steps aside --------------------------------------------------------------
do $$
declare f text; d text; n text;
begin
  -- pay helpers: after the capped amount is worked out, uncapped pays the whole amount
  foreach f in array array['private.rlm_pay(uuid,text,integer,text,text)', 'private.biz_pay(uuid,integer,text,text)', 'private.farm_pay(uuid,integer,text,text)',
                           'private.space_pay(uuid,integer,text,text,text,boolean)', 'private.planet_pay(uuid,integer,text,text)',
                           'private.inkborn_pay(uuid,integer,text,text,text)', 'private.gg_pay(uuid,integer,text,text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    n := regexp_replace(d, $r$(\n  v_pay := [^;]*least\([^;]*;)$r$, E'\\1\n  if private.ink_uncapped() then v_pay := p_amount; end if;');
    if n = d then raise exception 'ink flow: % not patched', f; end if;
    execute n;
  end loop;
  d := pg_get_functiondef('private.arc_pay(uuid,integer,text,text)'::regprocedure);
  n := replace(d, $a$  if coalesce((private.arc_cfg() ->> 'daily_ink_cap')::int, 150) > 0 then$a$, $a$  if not private.ink_uncapped() and coalesce((private.arc_cfg() ->> 'daily_ink_cap')::int, 150) > 0 then$a$);
  if n = d then raise exception 'ink flow: arc_pay not patched'; end if;
  execute n;
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'arena_ink' and pronamespace = 'private'::regnamespace;
  n := replace(d, $a$  v_give := greatest(0, least(p_amount, v_cap - v_had));$a$, $a$  v_give := greatest(0, least(p_amount, v_cap - v_had));
  if private.ink_uncapped() then v_give := greatest(p_amount, 0); end if;$a$);
  if n = d then raise exception 'ink flow: arena_ink not patched'; end if;
  execute n;
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'home_game_report' and pronamespace = 'public'::regnamespace;
  n := replace(d, $a$      v_ink := greatest(0, least(v_ink, v_cap - v_got));$a$, $a$      if not private.ink_uncapped() then v_ink := greatest(0, least(v_ink, v_cap - v_got)); end if;$a$);
  if n = d then raise exception 'ink flow: home_game_report not patched'; end if;
  execute n;
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'map_find_claim' and pronamespace = 'public'::regnamespace;
  n := replace(d, $a$  v_ink := least((v ->> 'ink')::int, greatest(0, coalesce((f ->> 'ink_daily_cap')::int, 40) - v_today));$a$,
                  $a$  v_ink := least((v ->> 'ink')::int, greatest(0, coalesce((f ->> 'ink_daily_cap')::int, 40) - v_today));
  if private.ink_uncapped() then v_ink := (v ->> 'ink')::int; end if;$a$);
  if n = d then raise exception 'ink flow: map_find_claim not patched'; end if;
  execute n;
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'farm_sell' and pronamespace = 'public'::regnamespace;
  n := replace(d, $a$  v_ink_cap_left := greatest(0, coalesce((cfg ->> 'daily_cap')::int, 120) - private.farm_ink_today(v_uid));$a$,
                  $a$  v_ink_cap_left := greatest(0, coalesce((cfg ->> 'daily_cap')::int, 120) - private.farm_ink_today(v_uid));
  if private.ink_uncapped() then v_ink_cap_left := 2147483647; end if;$a$);
  if n = d then raise exception 'ink flow: farm_sell not patched'; end if;
  execute n;
  -- minigames: no limit on paid runs
  d := pg_get_functiondef('public.svc_finish_minigame(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$v_unlimited := not coalesce((v_cfg ->> 'limit_paid_runs')::boolean, true);$a$, $a$v_unlimited := private.ink_uncapped() or not coalesce((v_cfg ->> 'limit_paid_runs')::boolean, true);$a$);
  if n = d then raise exception 'ink flow: svc_finish_minigame not patched'; end if;
  execute n;
  -- the client knows (to drop the "X/cap today" lines)
  d := pg_get_functiondef('public.world_config()'::regprocedure);
  n := replace(d, $a$    'minigames', private.cfg('minigames'),$a$,
                  $a$    'minigames', case when private.ink_uncapped() then private.cfg('minigames') || '{"limit_paid_runs": false}'::jsonb else private.cfg('minigames') end,
    'ink_uncapped', private.ink_uncapped(),$a$);
  if n = d then raise exception 'ink flow: world_config not patched'; end if;
  execute n;
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'game_guide' and pronamespace = 'public'::regnamespace;
  n := replace(d, $a$'config', private.guide_config(),$a$, $a$'config', private.guide_config() || jsonb_build_object('ink_uncapped', private.ink_uncapped()),$a$);
  if n = d then raise exception 'ink flow: game_guide not patched'; end if;
  execute n;
end $$;

-- ---- the owner's controls --------------------------------------------------------------------------------------------
create or replace function public.admin_ink_pacing() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_day timestamptz := private.day_start(now());
begin
  return jsonb_build_object('config', private.cfg('ink_pacing'),
    'totals', (select jsonb_build_object('players', count(*), 'earned', round(coalesce(sum(earned), 0)), 'paid', round(coalesce(sum(paid), 0)),
                 'over_target', count(*) filter (where paid > coalesce((private.cfg('ink_pacing') ->> 'daily_target')::numeric, 1500)))
               from private.ink_pacing where day = v_day),
    'today', coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(p.player_id), 'earned', round(p.earned), 'paid', round(p.paid),
                         'rate', p.rate, 'hours', length(replace(p.hours::bit(31)::text, '0', '')), 'events', p.events, 'last_at', p.last_at)
                       order by p.paid desc)
                       from (select * from private.ink_pacing where day = v_day order by paid desc limit 50) p), '[]'::jsonb));
end $$;

create or replace function public.admin_set_ink_pacing(p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); v jsonb; k text; v_num numeric;
  nums jsonb := '{"daily_target": [50, 10000000], "heat_share": [0.01, 10], "load_share": [0.01, 20], "source_share": [0.01, 20], "day_share": [0.05, 20],
                  "day_max_share": [0.1, 50], "heat_half_min": [1, 1440], "load_half_h": [0.1, 72], "momentum_half_min": [1, 1440], "ramp_start": [0.05, 2],
                  "ramp_peak": [0.1, 3], "jitter": [0, 0.25], "floor_ink": [0, 100], "floor_min_raw": [0, 1000], "bot_hours": [1, 24], "bot_factor": [0, 1]}'::jsonb;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'invalid_config' using errcode = 'P0001'; end if;
  v := coalesce(private.cfg('ink_pacing'), '{}'::jsonb);
  for k in select jsonb_object_keys(p_config) loop
    if k in ('enabled', 'uncapped') then
      v := v || jsonb_build_object(k, (p_config ->> k)::boolean);
    elsif nums ? k then
      v_num := (p_config ->> k)::numeric;
      if v_num is null or v_num < (nums -> k ->> 0)::numeric or v_num > (nums -> k ->> 1)::numeric then raise exception 'invalid_config' using errcode = 'P0001', detail = k; end if;
      v := v || jsonb_build_object(k, v_num);
    end if;
  end loop;
  -- uncapped Ink only ever runs with Ink Flow on
  if coalesce((v ->> 'uncapped')::boolean, false) then v := v || '{"enabled": true}'::jsonb; end if;
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
  execute 'revoke all on function private.ink_uncapped() from public, anon, authenticated';
  execute 'revoke all on function private.ink_pace(uuid, integer, text) from public, anon, authenticated';
end $$;
