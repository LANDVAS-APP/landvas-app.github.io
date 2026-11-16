-- Fixes from players' reports (Nov 2026), and the server side of their suggestions.
--
-- Bugs
--  • "resource ledger idem idx … already exists" on a planet quest's Claim and on a digging-energy refill: their
--    one-time keys were built from the game day's *date*, which isn't unique once the reset hour or time zone moves
--    (and depends on the connection's time zone). Keys now use the exact start of the game day — and so do the farm
--    chores and the arcade's daily bonus, which built theirs the same way.
--  • "Keeper level undefined!" after an Inkborn expedition: the expedition's news carried "levelled up" without the level.
--  • Farm chore "Water 4 growing beds" was impossible with sprinklers (they water new plantings first): a bed the
--    sprinklers water counts as watered for the chore too.
--  • A full chicken coop could show "Collect -1": collecting used the rounded time per egg, so the next egg's clock
--    started a moment in the future. Collecting uses the exact time now, and ready is never below 0.
--  • PvP "5 rivals are waiting" but no match: rivals you played in the last day can't be matched again (the rematch
--    cooldown), yet the count included them. It now counts only rivals you can play (and says how many others wait).
--  • A planet's storm timer stuck at 0:00 after the storm passed: the next storm is now the one reported.
--  • "Paint on your plot" never ticked: the very first save of a canvas didn't count its painting time, and nothing
--    told players it needs a few minutes of painting a day. The first save counts now, the bar is 2 minutes, and the
--    task shows the minutes painted so far.
-- Suggestions
--  • Landlord estates: today's checklist done? all set for the 1st? (shown in My Plots)
--  • Optional notifications: my_timers() — when digging energy is full, crops are ready, buildings are full, an
--    expedition is back, a free refill returns, the daily reset, rent day…
--  • Hot Zone: a little about the city (state, country, population, plots and Crown there) for the trivia card.

-- ---- one-time keys: the exact start of the game day -----------------------------------------------------------------
create or replace function private.day_key(p_ts timestamptz) returns text language sql immutable as $$
  select to_char(p_ts at time zone 'UTC', 'YYYYMMDD"T"HH24MI')
$$;
revoke all on function private.day_key(timestamptz) from public, anon, authenticated;

select private.fn_patch('public.planet_quest_claim(text,text)', 'v_day::date ||', 'private.day_key(v_day) ||', true);
select private.fn_patch('public.planet_dig_refill(text,text,integer,integer)', 'v_day::date ||', 'private.day_key(v_day) ||', true);
select private.fn_patch('public.farm_chore_claim(text)', 'v_day::date ||', 'private.day_key(v_day) ||', true);
select private.fn_patch('public.arcade_daily()', 'v_day::date ||', 'private.day_key(v_day) ||', true);

-- ---- Keeper: the expedition's level-up says which level ----------------------------------------------------------
select private.fn_patch('public.keeper_expedition_claim(uuid)',
  $a$'level_up', v_add -> 'level_up');$a$,
  $a$'level_up', v_add -> 'level_up', 'level', v_add -> 'level', 'level_glimmer', v_add -> 'level_glimmer');$a$);

-- ---- Farm: sprinklers count for the watering chore; collecting never runs ahead ----------------------------------
select private.fn_patch('public.farm_plant(uuid,integer,text)',
  '  perform private.farm_chore_bump(v_uid, ''plant'', 1);',
  '  perform private.farm_chore_bump(v_uid, ''plant'', 1);
  -- a bed the sprinklers water counts as watered (with every bed sprinkled there''d be nothing left to water by hand)
  if v_water then perform private.farm_chore_bump(v_uid, ''water'', 1); end if;');

create or replace function private.farm_building_json(p_uid uuid, p_key text) returns jsonb language sql stable as $$
  with b as (select private.farm_cfg() -> 'buildings' -> p_key c, (select buildings -> p_key from public.farm_progress where player_id = p_uid) s),
  e as (select b.*, case when b.c ->> 'item' is null or b.s is null then null
                         else (b.c ->> 'minutes')::numeric / (1 + 0.25 * (coalesce((b.s ->> 'lvl')::int, 1) - 1)) end every from b)
  select jsonb_build_object('key', p_key, 'lvl', coalesce((e.s ->> 'lvl')::int, 0),
    'ready', case when e.s is null or e.c ->> 'item' is null then 0 else greatest(0, least(
        coalesce((e.c ->> 'cap')::int, 4) * coalesce((e.s ->> 'lvl')::int, 1),
        floor(extract(epoch from now() - (e.s ->> 'at')::timestamptz) / 60 / e.every)))::int end,
    'every_min', round(e.every, 1),
    'every_exact', e.every,
    'cap', case when e.c ->> 'item' is null then null else coalesce((e.c ->> 'cap')::int, 4) * greatest(1, coalesce((e.s ->> 'lvl')::int, 1)) end,
    'full_at', case when e.every is null then null else (e.s ->> 'at')::timestamptz + make_interval(secs => e.every * 60 * coalesce((e.c ->> 'cap')::int, 4) * greatest(1, coalesce((e.s ->> 'lvl')::int, 1))) end,
    'since', e.s ->> 'at')
  from e
$$;
select private.fn_patch('public.farm_collect(text)',
  $a$v_every := (s ->> 'every_min')::numeric;$a$,
  $a$v_every := coalesce((s ->> 'every_exact')::numeric, (s ->> 'every_min')::numeric);$a$);
-- coops that already ran ahead: back to now
update public.farm_progress f set buildings = (
  select jsonb_object_agg(k, case when v ? 'at' and (v ->> 'at')::timestamptz > now() then jsonb_set(v, '{at}', to_jsonb(now())) else v end)
    from jsonb_each(f.buildings) e(k, v))
 where exists (select 1 from jsonb_each(f.buildings) e(k, v) where jsonb_typeof(v) = 'object' and v ? 'at' and (v ->> 'at')::timestamptz > now());

-- ---- PvP: count only rivals you can actually be matched with ------------------------------------------------------
do $do$
begin
  -- (only where PvP exists)
  if to_regprocedure('public.pvp_lobby()') is not null then
    perform private.fn_patch('public.pvp_lobby()',
  $a$'waiting', (select count(*) from public.pvp_matches x where x.status = 'waiting' and x.game = k and x.created_by is distinct from v_uid and x.open_until > now()))), '{}'::jsonb)$a$,
  $a$'waiting', (select count(*) from public.pvp_matches x where x.status = 'waiting' and x.game = k and x.created_by is distinct from v_uid and x.open_until > now()
                           and (v_uid is null or not exists (
                             select 1 from public.pvp_runs mine join public.pvp_runs theirs on theirs.match_id = mine.match_id and theirs.player_id = x.created_by
                              where mine.player_id = v_uid and mine.started_at > now() - make_interval(secs => coalesce((v_cfg ->> 'rematch_cooldown_hours')::numeric, 24) * 3600)))),
                         'waiting_all', (select count(*) from public.pvp_matches x where x.status = 'waiting' and x.game = k and x.created_by is distinct from v_uid and x.open_until > now()))), '{}'::jsonb)$a$);
  end if;
end $do$;

-- ---- planets: once a storm has passed, the next one is the one to wait for ------------------------------------------
create or replace function private.weather_now(p_world text) returns jsonb language sql stable as $$
  with w as (select private.disc_cfg() -> 'weather' c),
  t as (select (coalesce((c ->> 'every_minutes')::int, 30) * 60) every, (coalesce((c ->> 'minutes')::int, 8) * 60) len, c from w),
  win0 as (select floor(extract(epoch from now()) / every)::bigint n0, every, len, c from t),
  -- this window's storm, unless it has already blown over: then the next window's
  win as (select case when extract(epoch from now()) > n0 * every + floor(private.h01(p_world || ':storm:' || n0) * (every - len)) + len then n0 + 1 else n0 end n,
                 every, len, c from win0)
  select jsonb_build_object('win', n, 'kind', private.weather_kind(p_world),
    'starts', to_timestamp(n * every + floor(private.h01(p_world || ':storm:' || n) * (every - len))),
    'ends', to_timestamp(n * every + floor(private.h01(p_world || ':storm:' || n) * (every - len)) + len),
    'next', to_timestamp((n + 1) * every + floor(private.h01(p_world || ':storm:' || (n + 1)) * (every - len))))
  from win
$$;

-- ---- painting time: the first save of a canvas counts too; a 2-minute bar; progress for the task --------------------
select private.fn_patch('private.version_effort_trg()',
  $a$  if v_delta > 0 then
    insert into public.painting_days$a$,
  $a$  -- a canvas's very first save (nothing before it) counts the painting it reports
  if pv.id is null and new.kind = 'save' then
    v_delta := greatest(least(coalesce((new.manifest ->> 'active_ms')::bigint, 0), 300000), 0);
  end if;
  if v_delta > 0 then
    insert into public.painting_days$a$);
update public.game_config set value = jsonb_set(value, '{streak,min_minutes}', '2'::jsonb)
 where key = 'creative' and coalesce((value -> 'streak' ->> 'min_minutes')::numeric, 5) > 2;

create or replace function public.my_streak() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s jsonb := private.creative('streak'); v_days int; v_ms bigint; v_need numeric;
begin
  v_days := private.paint_streak(v_uid);
  v_need := coalesce((s ->> 'min_minutes')::numeric, 2);
  select effort_ms into v_ms from public.painting_days where player_id = v_uid and day = private.day_start(now());
  return jsonb_build_object('enabled', coalesce((s ->> 'enabled')::boolean, false), 'days', v_days, 'today', coalesce(v_ms, 0) >= floor(v_need * 60000),
    'minutes_today', round(coalesce(v_ms, 0) / 60000.0, 1), 'need_minutes', v_need,
    'bonus_pct', private.streak_pct(v_uid), 'step_pct', coalesce((s ->> 'step_pct')::numeric, 5), 'max_pct', coalesce((s ->> 'max_pct')::numeric, 50),
    'resets_at', private.day_start(now()) + interval '1 day');
end $$;

-- ---- Landlord estates at a glance (My Plots) ----------------------------------------------------------------------
create or replace function public.my_landlord_status() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'group_id', g.id, 'name', g.name, 'houses', g.plot_count,
      'ready', coalesce((e ->> 'eligible')::boolean, false), 'rent_day', coalesce((e ->> 'rent_day')::boolean, false), 'next_rent_day', e -> 'next_rent_day',
      'inspected_today', coalesce((e -> 'tasks' -> 'inspect' ->> 'today')::boolean, false),
      'today_done', coalesce((e ->> 'eligible')::boolean, false) or (
            coalesce((e -> 'tasks' -> 'inspect' ->> 'today')::boolean, false)
        and (coalesce((e -> 'tasks' -> 'garden' ->> 'today')::boolean, false) or coalesce((e -> 'tasks' -> 'garden' ->> 'done')::int, 0) >= coalesce((e -> 'tasks' -> 'garden' ->> 'need')::int, 0))
        and (coalesce((e -> 'tasks' -> 'requests' ->> 'left_today')::int, 0) = 0 or coalesce((e -> 'tasks' -> 'requests' ->> 'done')::int, 0) >= coalesce((e -> 'tasks' -> 'requests' ->> 'need')::int, 0))
        and (coalesce((e -> 'tasks' -> 'repairs' ->> 'done')::int, 0) >= coalesce((e -> 'tasks' -> 'repairs' ->> 'need')::int, 0)
             or not exists (select 1 from jsonb_array_elements(coalesce(e -> 'spots', '[]'::jsonb)) s where not coalesce((s ->> 'fixed')::boolean, false)))),
      'tasks', e -> 'tasks') order by g.name), '[]'::jsonb)
    from public.canvas_groups g cross join lateral private.estate_json(g.id) e
    where g.owner_id = v_uid and g.kind = 'landlord' and g.status = 'active');
end $$;

-- ---- timers for optional notifications --------------------------------------------------------------------------
/** what's coming up for you, for the reminders you switched on: [{kind, key, at, title, body, to}] (only future times) */
create or replace function public.my_timers() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); out jsonb := '[]'::jsonb; m public.planet_miners; e jsonb; v_at timestamptz; v_n int; r record;
  v_day timestamptz := private.day_start(now()); v_max numeric; v_regen numeric; v_farm text;
begin
  -- ⛏️ digging energy full
  begin
    select * into m from public.planet_miners where player_id = v_uid;
    if found then
      e := private.mine_cfg() -> 'energy';
      v_max := coalesce((e ->> 'max')::numeric, 600); v_regen := greatest(coalesce((e ->> 'regen_per_minute')::numeric, 2), 0.001);
      if m.energy < v_max - 0.5 then
        v_at := m.energy_at + make_interval(secs => (v_max - m.energy) / v_regen * 60);
        out := out || jsonb_build_array(jsonb_build_object('kind', 'dig_energy', 'key', 'dig-energy', 'at', v_at, 'title', '⚡ Digging energy is full',
          'body', 'Your pickaxe is rested — ' || v_max::int || ' energy ready to dig.', 'to', '/space'));
      end if;
      if m.refill_day = v_day and m.free_refills > 0 then
        out := out || jsonb_build_array(jsonb_build_object('kind', 'dig_refill', 'key', 'dig-refill', 'at', v_day + interval '1 day', 'title', '☕ Free coffee break is back',
          'body', 'A free digging-energy refill is waiting.', 'to', '/space'));
      end if;
    end if;
  exception when others then null; end;
  -- 🌾 crops ready, and buildings full
  begin
    select min(b.ready_at), count(*) into v_at, v_n from public.farm_beds b join public.farms f on f.id = b.farm_id where f.owner_id = v_uid and b.ready_at > now();
    select '/farm/' || f.id into v_farm from public.farms f where f.owner_id = v_uid and f.group_id is not null
     order by (select min(b.ready_at) from public.farm_beds b where b.farm_id = f.id and b.ready_at > now()) nulls last, f.created_at limit 1;
    v_farm := coalesce(v_farm, '/plots');
    if v_at is not null then
      out := out || jsonb_build_array(jsonb_build_object('kind', 'farm_crops', 'key', 'farm-crops', 'at', v_at, 'title', '🌾 Crops are ready',
        'body', 'Your next crop is ready to harvest' || case when v_n > 1 then ' (' || v_n || ' growing)' else '' end || '.', 'to', v_farm));
    end if;
    select max(b.ready_at) into v_at from public.farm_beds b join public.farms f on f.id = b.farm_id where f.owner_id = v_uid and b.ready_at > now();
    if v_at is not null and v_n > 1 then
      out := out || jsonb_build_array(jsonb_build_object('kind', 'farm_all', 'key', 'farm-all', 'at', v_at, 'title', '🧺 Every crop is ready',
        'body', 'All ' || v_n || ' growing beds are ready to harvest.', 'to', v_farm));
    end if;
    for r in select k from jsonb_object_keys(coalesce((select buildings from public.farm_progress where player_id = v_uid), '{}'::jsonb)) k loop
      e := private.farm_building_json(v_uid, r.k);
      if (e ->> 'full_at') is not null and (e ->> 'full_at')::timestamptz > now() and coalesce((e ->> 'lvl')::int, 0) > 0 then
        out := out || jsonb_build_array(jsonb_build_object('kind', 'farm_building', 'key', 'farm-b-' || r.k, 'at', e ->> 'full_at',
          'title', '🐔 A farm building is full', 'body', 'Your ' || replace(r.k, '_', ' ') || ' is full — collect before it stops making more.', 'to', v_farm));
      end if;
    end loop;
  exception when others then null; end;
  -- 🐾 Inkborn: expeditions home, jobs done
  begin
    for r in select x.id, x.ends_at, x.region from public.keeper_expeditions x where x.owner_id = v_uid and x.claimed_at is null and x.ends_at > now() order by x.ends_at limit 5 loop
      out := out || jsonb_build_array(jsonb_build_object('kind', 'expedition', 'key', 'exp-' || r.id, 'at', r.ends_at, 'title', '🧭 Your expedition is home',
        'body', 'Welcome them back for the haul.', 'to', '/inkborn/keeper'));
    end loop;
    select min(job_until), count(*) into v_at, v_n from public.inkborn where owner_id = v_uid and job is not null and job <> 'expedition' and job_until > now();
    if v_at is not null then
      out := out || jsonb_build_array(jsonb_build_object('kind', 'inkborn_job', 'key', 'inkborn-job', 'at', v_at, 'title', '🎒 An Inkborn finished its job',
        'body', 'They brought things home' || case when v_n > 1 then ' (' || v_n || ' out working)' else '' end || '.', 'to', '/inkborn'));
    end if;
  exception when others then null; end;
  -- 🌅 the daily reset (streak, wheel, chores, quests, a new Hot Zone)
  out := out || jsonb_build_array(jsonb_build_object('kind', 'daily_reset', 'key', 'daily-reset', 'at', v_day + interval '1 day', 'title', '🌅 A new day in LANDVAS',
    'body', 'Daily rewards, chores, quests and a new Hot Zone are ready.', 'to', '/world'));
  -- 🏘️ Landlord: rent day (the 1st, UTC), and the day before it
  if exists (select 1 from public.canvas_groups where owner_id = v_uid and kind = 'landlord' and status = 'active') then
    v_at := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
    out := out || jsonb_build_array(jsonb_build_object('kind', 'rent_day', 'key', 'rent-day', 'at', v_at, 'title', '💵 It’s rent day!',
      'body', 'Estates with their checklist done earn ' || coalesce((private.cfg('residential') ->> 'landlord_mult')::numeric, 50) || '× rent all day.', 'to', '/plots'));
    out := out || jsonb_build_array(jsonb_build_object('kind', 'rent_day', 'key', 'rent-eve', 'at', v_at - interval '1 day', 'title', '🏘️ Rent day is tomorrow',
      'body', 'Finish your estates’ checklists today to earn the big rent.', 'to', '/plots'));
  end if;
  -- (only what's still to come, soonest first)
  return (select coalesce(jsonb_agg(t order by (t ->> 'at')::timestamptz), '[]'::jsonb) from jsonb_array_elements(out) t where (t ->> 'at')::timestamptz > now());
end $$;

-- ---- Hot Zone: a little about the city ---------------------------------------------------------------------------
select private.fn_patch('public.hot_zone_today()',
  $a$'ultra_mult', coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5),$a$,
  $a$'about', (select jsonb_build_object('pop', k.pop, 'state', k.state, 'country', k.country, 'country_name', k.country_name,
                      'plots', (select count(*) from public.world_plots p where p.city_id = k.id and p.owner_id is not null),
                      'crown_holder', (select pr.username from public.world_plots p join public.profiles pr on pr.id = p.owner_id where p.city_id = k.id and p.rarity = 'crown' limit 1),
                      'pop_rank', (select count(*) + 1 from public.world_cities k2 where k2.country = k.country and k2.pop > k.pop))
               from public.world_cities k where k.id::text = private.hot_zone(private.today()) ->> 'id'),
    'ultra_mult', coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5),$a$);

do $$
declare f text;
begin
  foreach f in array array['public.my_landlord_status()', 'public.my_timers()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---- Arcade: "all games open" was about the land's size; say how many cabinets are actually unlocked too ------------
select private.fn_patch('public.place_access(text,uuid)',
  $a$  return private.place_access_json(pl.kind, pl.group_id);$a$,
  $a$  -- an arcade's cabinets are unlocked one by one with tickets: say how many are, beside what the land allows
  if p_kind = 'arcade' then
    return private.place_access_json(pl.kind, pl.group_id) || jsonb_build_object('unlocked',
      (select count(*) from public.arcades a, jsonb_object_keys(a.machines) k where a.id = p_id and k = any (private.place_games(pl.kind))));
  end if;
  return private.place_access_json(pl.kind, pl.group_id);$a$);

-- ---- Arcades: a canvas that splits keeps its cabinets ------------------------------------------------------------
-- Detaching plots from the middle of a merged arcade splits what's left into parts ("… (part)"). The parts came back
-- as plain plots, and making one an arcade again gave it a brand-new arcade with every cabinet locked — while its
-- plot card said "All 16 games open" (that's what the land allows). Parts of an arcade now stay arcades and keep the
-- cabinets (and decor) unlocked; the arcade's level and history stay with the biggest part.
select private.fn_patch('public.detach_plots(uuid,jsonb)',
  $a$  perform private.refresh_group(p_group_id);$a$,
  $a$  -- the parts of an arcade stay arcades, with every cabinet and decor it had unlocked
  if private.kind_family(v_group.kind) = 'arcade' then
    for v_cell in select to_jsonb(x) from unnest(v_new) x loop
      if (select name from public.canvas_groups where id = (v_cell #>> '{}')::uuid) like '% (part)' then
        update public.canvas_groups set kind = 'arcade' where id = (v_cell #>> '{}')::uuid;
        perform private.ensure_kind_row((v_cell #>> '{}')::uuid, v_uid, 'arcade');
        update public.arcades a set machines = private.jmax(a.machines, o.machines), decor_owned = private.junion(a.decor_owned, o.decor_owned)
          from public.arcades o where a.group_id = (v_cell #>> '{}')::uuid and o.group_id = p_group_id;
      end if;
    end loop;
  end if;
  perform private.refresh_group(p_group_id);$a$);

-- and the arcades that already lost theirs that way get them back: a "… (part)" arcade takes the cabinets its
-- player unlocked in the arcade it split from (matched by name)
update public.arcades pa set machines = private.jmax(pa.machines, oa.machines), decor_owned = private.junion(pa.decor_owned, oa.decor_owned)
  from public.canvas_groups pg, public.canvas_groups og, public.arcades oa
 where pa.group_id = pg.id and pg.status = 'active' and pg.name like '% (part)'
   and og.owner_id = pg.owner_id and og.id <> pg.id and og.name = left(pg.name, length(pg.name) - 7)
   and oa.group_id = og.id and oa.owner_id = pa.owner_id and oa.machines <> '{}'::jsonb;
