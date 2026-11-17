-- 🐉 The Leviathan: back to the deep (and back again, stronger) — and a health you choose.
--
--  · SEND IT BACK TO THE OCEAN: the one that's out dives into the nearest sea and waits there ('submerged'). Nothing about
--    the fight is lost: everyone's damage, bombs and move cooldowns are kept, and it pays no loot yet.
--  · BRING IT BACK: the same Leviathan (same number, same fighters) rises again — stronger (+ a strength step), with more
--    health. From a sea near the players, or the one it dove into. It comes back by itself when its timer runs out (if the
--    owner set one) or on the weekly schedule (instead of a brand-new one).
--  · ITS HEALTH: game_config.leviathan.hp_mode —
--      'players' (as before: active players × health each, at least the least health),
--      'fixed'   (hp_fixed),
--      'enchant' (scales with the enchantments out and the players about, so it lasts about last_hours hours: everything
--                 they could throw at it in that time — every move at the start and again each cooldown, every bomb banked
--                 and every bomb that comes back — × how hard they really fight: learned from the last fight (fight_auto)
--                 or fight_pct).
--    All × its strength. The owner can also set the health of the one that's out (a set amount, or "lasts N more hours at
--    the pace it's being hit now").
--  · LOOT doesn't grow with a bigger health bar: the Ink pool stays what the old per-player health would give (loot_hp).

alter table public.leviathans drop constraint if exists leviathans_status_check;
alter table public.leviathans add constraint leviathans_status_check
  check (status in ('warning', 'walking', 'enraged', 'fleeing', 'fallen', 'escaped', 'ended', 'submerged'));
create index if not exists leviathans_submerged on public.leviathans (spawned_at desc) where status = 'submerged';

-- new ones scale with the enchantments out, to last about 9 hours
update public.game_config set value = value || jsonb_build_object('hp_mode', 'enchant', 'last_hours', 9, 'fight_pct', 40, 'fight_auto', true)
 where key = 'leviathan' and not value ? 'hp_mode';

-- ---- its health -------------------------------------------------------------------------------------------------------
/** everything everyone could throw at it in so many hours (every move at the start and again each cooldown, every bomb
    banked and every bomb that comes back) */
create or replace function private.lev_full(p_es numeric, p_n numeric, p_cd numeric, p_bmax numeric, p_regen numeric, p_h numeric) returns numeric
language sql immutable as $$
  select p_es * (1 + p_h / greatest(p_cd, 0.25)) + p_n * 100 * (p_bmax + p_h * 3600 / greatest(p_regen, 1))
$$;

/** how hard players really fought the last one (a fight of 30 min – 24 h): what they did / what they could have done */
create or replace function private.lev_observed(p_es numeric, p_n numeric, p_cd numeric, p_bmax numeric, p_regen numeric) returns jsonb
language plpgsql stable as $$
declare l public.leviathans; v_dmg numeric; v_h numeric; c jsonb; v_full numeric;
begin
  select * into l from public.leviathans where status in ('fallen', 'escaped') and ended_at > now() - interval '60 days'
     and ended_at between rise_at + interval '30 minutes' and rise_at + interval '24 hours'
   order by ended_at desc limit 1;
  if l.id is null then return null; end if;
  select coalesce(sum(dmg), 0) - coalesce((l.data ->> 'dmg_before_rise')::numeric, 0) into v_dmg from public.leviathan_players where lev_id = l.id;
  if v_dmg <= 0 then return null; end if;
  v_h := extract(epoch from l.ended_at - l.rise_at) / 3600;
  -- (what was out when it rose, if it was kept; else what's out now)
  c := l.data -> 'hp_calc';
  v_full := private.lev_full(coalesce((c ->> 'ench_move_sum')::numeric, p_es), coalesce((c ->> 'players')::numeric, p_n),
                             coalesce((c ->> 'cd_h')::numeric, p_cd), coalesce((c ->> 'bombs_max')::numeric, p_bmax), coalesce((c ->> 'bomb_regen_s')::numeric, p_regen), v_h);
  return jsonb_build_object('gen', l.gen, 'status', l.status, 'hours', round(v_h, 2), 'dmg', round(v_dmg), 'dph', round(v_dmg / v_h),
                            'eng', round(least(1, v_dmg / greatest(v_full, 1)), 4), 'hp_max', l.hp_max);
end $$;

/** a new Leviathan's health (before its strength), by the owner's setting — and the numbers behind it */
create or replace function private.lev_hp_calc(p_cfg jsonb default null) returns jsonb language plpgsql stable as $$
declare c jsonb := coalesce(p_cfg, private.lev_cfg()); v_n int; v_es numeric; v_ec int; v_cd numeric; v_bmax numeric; v_regen numeric; v_h numeric;
  v_min numeric; v_players numeric; v_full numeric; v_obs jsonb; v_auto boolean; v_eng numeric; v_ench numeric; v_mode text := coalesce(c ->> 'hp_mode', 'players'); v_hp numeric;
begin
  select count(*) into v_n from public.players where status = 'active' and last_active_at > now() - interval '7 days';
  -- every enchantment out (with players about) and its move's damage on average
  select coalesce(sum((2500 + 400 * e.level) * (((x.m ->> 1)::numeric + (x.m ->> 2)::numeric) / 2)), 0), count(*) into v_es, v_ec
    from public.enchantments e join public.players p on p.id = e.owner_id cross join lateral (select private.lev_move(e.kind) m) x
   where e.status = 'active' and p.status = 'active' and p.last_active_at > now() - interval '7 days' and x.m is not null;
  v_cd := greatest(coalesce((c ->> 'move_cd_h')::numeric, 3), 0.25);
  v_bmax := coalesce((c ->> 'bombs_max')::numeric, 60);
  v_regen := greatest(coalesce((c ->> 'bomb_regen_s')::numeric, 60), 1);
  v_h := least(greatest(coalesce((c ->> 'last_hours')::numeric, 9), 0.5), 240);
  v_min := coalesce((c ->> 'hp_min')::numeric, 60000);
  v_players := greatest(v_min, v_n * coalesce((c ->> 'hp_per_player')::numeric, 2500));
  v_full := private.lev_full(v_es, v_n, v_cd, v_bmax, v_regen, v_h);
  v_obs := private.lev_observed(v_es, v_n, v_cd, v_bmax, v_regen);
  v_auto := coalesce((c ->> 'fight_auto')::boolean, true) and v_obs is not null;
  v_eng := least(greatest(case when v_auto then (v_obs ->> 'eng')::numeric else coalesce((c ->> 'fight_pct')::numeric, 40) / 100 end, 0.02), 1);
  v_ench := greatest(v_min, round(v_full * v_eng));
  v_hp := case v_mode when 'fixed' then greatest(coalesce((c ->> 'hp_fixed')::numeric, v_players), 1) when 'enchant' then v_ench else v_players end;
  return jsonb_build_object('mode', v_mode, 'hp', round(v_hp), 'hp_players', round(v_players), 'hp_enchant', round(v_ench), 'hp_fixed', c -> 'hp_fixed',
    'players', v_n, 'enchantments', v_ec, 'ench_move_sum', round(v_es), 'cd_h', v_cd, 'bombs_max', v_bmax, 'bomb_regen_s', v_regen, 'hp_min', v_min,
    'hours', v_h, 'full', round(v_full), 'engage', round(v_eng, 4), 'engage_from', case when v_auto then 'last' else 'setting' end, 'last', v_obs);
end $$;

/** how fast the one that's out is being hit now (the last 3 hours of the fight), and when it falls at that pace */
create or replace function private.lev_pace(l public.leviathans) returns jsonb language plpgsql stable as $$
declare v_from timestamptz := greatest(now() - interval '3 hours', l.rise_at); v_sum numeric; v_n int; v_first timestamptz; v_span numeric; v_dph numeric; c jsonb;
begin
  if l.id is null or l.status = 'warning' then return null; end if;
  select coalesce(sum(dmg), 0), count(*), min(created_at) into v_sum, v_n, v_first from public.leviathan_hits
   where lev_id = l.id and created_at >= v_from and move not in ('heal', 'dive', 'return');
  -- (the feed keeps its last 400 hits: past that, the pace is over the time those cover)
  v_span := greatest(extract(epoch from now() - case when v_n >= 400 then v_first else v_from end) / 3600, 1.0 / 6);
  if v_sum > 0 then v_dph := v_sum / v_span;
  else
    -- nobody's hit it lately: what everyone could do in an hour, × how hard they fight
    c := private.lev_hp_calc(null);
    v_dph := ((c ->> 'ench_move_sum')::numeric / (c ->> 'cd_h')::numeric + (c ->> 'players')::numeric * 100 * 3600 / (c ->> 'bomb_regen_s')::numeric) * (c ->> 'engage')::numeric;
  end if;
  return jsonb_build_object('dph', round(v_dph), 'measured', v_sum > 0, 'over_h', round(v_span, 2), 'eta_h', case when v_dph > 0 then round(l.hp / v_dph, 2) end);
end $$;

-- a new one: its health by the owner's setting (the loot pool stays what the old per-player health gives)
create or replace function private.lev_spawn(p_warn_min numeric default null) returns public.leviathans language plpgsql as $$
declare r jsonb; l public.leviathans; v_last public.leviathans; v_str numeric := 1; v_hp bigint; v_warn numeric := coalesce(p_warn_min, private.lev_n('warn_min', 60)); v_km numeric; u record;
  v_calc jsonb;
begin
  select * into v_last from public.leviathans order by spawned_at desc limit 1;
  if v_last.id is not null and v_last.status = 'escaped' then v_str := v_last.strength + private.lev_n('strength_step', 0.5); end if;
  r := private.lev_route();
  v_km := private.lev_path_km(r -> 'path');
  v_calc := private.lev_hp_calc(null);
  v_hp := round((v_calc ->> 'hp')::numeric * v_str);
  insert into public.leviathans (gen, status, strength, hp_max, hp, path, path_km, speed_kmh, walk_at, rise_at, origin, exit_sea, place, data)
  values (coalesce(v_last.gen, 0) + 1, 'warning', v_str, v_hp, v_hp, r -> 'path', v_km, greatest(v_km / greatest(private.lev_n('walk_hours', 48), 1), 5) * private.lev_n('speed_mult', 1),
          now() + make_interval(mins => v_warn::int), now() + make_interval(mins => v_warn::int), r ->> 'sea', r ->> 'exit', r ->> 'sea',
          jsonb_build_object('cities', r -> 'cities', 'hp_calc', v_calc - 'last', 'loot_hp', least(v_hp, round((v_calc ->> 'hp_players')::numeric * v_str))))
  returning * into l;
  update public.leviathans set base_kmh = speed_kmh where id = l.id returning * into l;
  perform private.lev_feed(null, jsonb_build_object('sub', 'warning', 'where', l.origin, 'gen', l.gen, 'rise_at', l.rise_at, 'strength', l.strength));
  -- everyone is told
  for u in select id from public.players where status = 'active' and last_active_at > now() - interval '30 days' loop
    perform private.notify(u.id, 'leviathan', null, jsonb_build_object('sub', 'warning', 'where', l.origin, 'rise_at', l.rise_at, 'gen', l.gen, 'strength', l.strength));
  end loop;
  return l;
end $$;

-- the Ink pool is the loot health's, not the (maybe much bigger) health bar's
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.lev_loot(public.leviathans,boolean)'::regprocedure);
  n := replace(d, $a$v_pool numeric := l.hp_max / greatest(private.lev_n('loot_pool_div', 100), 1);$a$,
                  $a$v_pool numeric := least(l.hp_max, coalesce((l.data ->> 'loot_hp')::numeric, l.hp_max)) / greatest(private.lev_n('loot_pool_div', 100), 1);$a$);
  if n = d then raise exception 'leviathan deep: loot pool anchor not found'; end if;
  execute n;
end $$;

-- ---- back to the deep, and back again -----------------------------------------------------------------------------------
/** it dives into the nearest sea and waits there: the fight is kept as it is (no loot yet) */
create or replace function private.lev_submerge(p_id uuid, p_args jsonb) returns public.leviathans language plpgsql as $$
declare l public.leviathans; p jsonb; v_sea jsonb; v_h numeric := least(greatest(coalesce((p_args ->> 'return_h')::numeric, 0), 0), 24 * 60); u record; v_dove jsonb;
begin
  select * into l from public.leviathans where id = p_id and status in ('warning', 'walking', 'enraged', 'fleeing') for update;
  if l.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  p := private.lev_pos(l, now());
  v_sea := private.lev_nearest_sea((p ->> 'lng')::float8, (p ->> 'lat')::float8);
  v_dove := jsonb_build_object('sea', v_sea ->> 'name', 'pt', v_sea -> 'pt', 'at', now(), 'from', l.place, 'status', l.status);
  update public.leviathans set status = 'submerged', place = v_sea ->> 'name', exit_sea = v_sea ->> 'name', rampage_until = null, tiny_until = null, hidden_until = null, roar_at = now(),
         data = (data - 'target' - 'targets' - 'retreat' - 'cruise_kmh' - 'next_power_at' - 'return_at' - 'return_step' - 'return_from')
                || jsonb_build_object('dove', v_dove)
                || case when v_h > 0 then jsonb_build_object('return_at', now() + make_interval(secs => (v_h * 3600)::double precision)) else '{}'::jsonb end
                || case when (p_args ->> 'step') is not null then jsonb_build_object('return_step', least(greatest((p_args ->> 'step')::numeric, 0), 10)) else '{}'::jsonb end
                || case when p_args ->> 'from' in ('same', 'players') then jsonb_build_object('return_from', p_args ->> 'from') else '{}'::jsonb end
   where id = l.id returning * into l;
  insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, null, 'dive', 'Dove back into the sea — it will be back, stronger', '🌊', 0);
  for u in select player_id from public.leviathan_players where lev_id = l.id and dmg > 0 loop
    perform private.notify(u.player_id, 'leviathan', null, jsonb_build_object('sub', 'submerged', 'gen', l.gen, 'sea', v_sea ->> 'name', 'return_at', l.data -> 'return_at'));
  end loop;
  return l;
end $$;

/** the same one rises again — stronger: a strength step more, and health to match (never less than it had, grown by the
    same step); from a sea near the players, or the one it dove into */
create or replace function private.lev_resurface(p_id uuid, p_args jsonb) returns public.leviathans language plpgsql as $$
declare l public.leviathans; v_str numeric; v_step numeric; r jsonb; v_path jsonb; v_km numeric; v_calc jsonb; v_hp numeric; v_now_hp numeric; v_warn numeric;
  v_dove jsonb; v_kmh numeric; v_sea text; v_exit text; u record; v_dmg numeric; v_cities jsonb;
begin
  if exists (select 1 from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing')) then raise exception 'leviathan_active' using errcode = 'P0001'; end if;
  select * into l from public.leviathans where (p_id is null or id = p_id) and status = 'submerged' order by spawned_at desc limit 1 for update;
  if l.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_step := least(greatest(coalesce((p_args ->> 'step')::numeric, (l.data ->> 'return_step')::numeric, private.lev_n('strength_step', 0.5)), 0), 10);
  v_str := round(l.strength + v_step, 2);
  v_warn := least(greatest(coalesce((p_args ->> 'warn_min')::numeric, private.lev_n('warn_min', 60)), 0), 1440);
  v_dove := l.data -> 'dove';
  -- where it comes back from
  if coalesce(p_args ->> 'from', l.data ->> 'return_from', 'players') = 'same' and v_dove is not null then
    r := private.lev_roam(v_dove -> 'pt');
    if r is not null then v_path := jsonb_build_array(v_dove -> 'pt') || (r -> 'path'); v_sea := v_dove ->> 'sea'; v_exit := r ->> 'exit'; end if;
  end if;
  if v_path is null then r := private.lev_route(); v_path := r -> 'path'; v_sea := r ->> 'sea'; v_exit := r ->> 'exit'; v_cities := r -> 'cities'; end if;
  v_km := private.lev_path_km(v_path);
  v_kmh := greatest(v_km / greatest(private.lev_n('walk_hours', 48), 1), 5) * private.lev_n('speed_mult', 1);
  -- its health: an exact amount, or what a new one would have at this strength — never less than it had, grown by the step
  v_calc := private.lev_hp_calc(null);
  if nullif(p_args ->> 'hp', '') is not null then v_hp := least(greatest((p_args ->> 'hp')::numeric, 1), 1e12);
  else v_hp := greatest(round((v_calc ->> 'hp')::numeric * v_str), round(l.hp_max * v_str / greatest(l.strength, 0.1)));
  end if;
  -- full health, or keep its wounds (the same share of its health left)
  v_now_hp := case when coalesce((p_args ->> 'heal')::boolean, true) then v_hp else greatest(1, round(v_hp * l.hp / greatest(l.hp_max, 1))) end;
  select coalesce(sum(dmg), 0) into v_dmg from public.leviathan_players where lev_id = l.id;
  update public.leviathans set status = 'warning', strength = v_str, hp_max = v_hp::bigint, hp = v_now_hp::bigint,
         path = v_path, path_km = v_km, speed_kmh = v_kmh, base_kmh = v_kmh, walk_s = 0, walk_at = now() + make_interval(mins => v_warn::int), pause_until = null,
         rise_at = now() + make_interval(mins => v_warn::int), ended_at = null, origin = v_sea, exit_sea = v_exit, place = v_sea,
         trail = '[]'::jsonb, trampled_km = 0, blocked = '[]'::jsonb, hidden_trail = null, last_tick = null, roar_at = now(),
         shrunk_until = null, foretold_until = null, weakspot_until = null, sunburst_until = null, divined_until = null, tiny_until = null, hidden_until = null, rampage_until = null,
         data = (data - 'target' - 'targets' - 'retreat' - 'cruise_kmh' - 'next_power_at' - 'return_at' - 'return_step' - 'return_from' - 'fallen_at')
                || jsonb_build_object('returns', coalesce((data ->> 'returns')::int, 0) + 1, 'returned_at', now(), 'dmg_before_rise', v_dmg, 'hp_calc', v_calc - 'last',
                                      'loot_hp', least(v_hp, greatest(round((v_calc ->> 'hp_players')::numeric * v_str), round(coalesce((data ->> 'loot_hp')::numeric, hp_max) * v_str / greatest(strength, 0.1)))),
                                      'cities', coalesce(v_cities, data -> 'cities'))
   where id = l.id returning * into l;
  insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, null, 'return', 'Came back from the deep — ×' || v_str || ' stronger', '🌊', 0);
  -- everyone is told
  for u in select id from public.players where status = 'active' and last_active_at > now() - interval '30 days' loop
    perform private.notify(u.id, 'leviathan', null, jsonb_build_object('sub', 'warning', 'back', true, 'where', l.origin, 'rise_at', l.rise_at, 'gen', l.gen, 'strength', l.strength));
  end loop;
  return l;
end $$;

/** the one waiting under the sea (for every screen) */
create or replace function private.lev_deep(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', l.id, 'gen', l.gen, 'strength', l.strength, 'hp', l.hp, 'hp_max', l.hp_max, 'sea', l.data -> 'dove' ->> 'sea',
           'dove_at', l.data -> 'dove' -> 'at', 'return_at', l.data -> 'return_at', 'returns', coalesce((l.data ->> 'returns')::int, 0),
           'next_strength', round(l.strength + least(greatest(coalesce((l.data ->> 'return_step')::numeric, private.lev_n('strength_step', 0.5)), 0), 10), 2),
           'fighters', (select count(*) from public.leviathan_players x where x.lev_id = l.id and x.dmg > 0),
           'my_dmg', (select x.dmg from public.leviathan_players x where x.lev_id = l.id and x.player_id = p_uid))
    from public.leviathans l where l.status = 'submerged' order by l.spawned_at desc limit 1
$$;

-- the heartbeat: one under the sea comes back (stronger) when its time is up, or on the weekly schedule — instead of a new one
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.leviathan_tick()'::regprocedure);
  n := replace(d, $a$  if l.id is null then
    if coalesce((private.lev_cfg() ->> 'enabled')::boolean, true) and now() >= private.lev_next_at() then$a$,
                  $a$  if l.id is null then
    select * into l from public.leviathans where status = 'submerged' order by spawned_at desc limit 1 for update;
    if l.id is not null and ((l.data ->> 'return_at')::timestamptz <= now()
                             or (coalesce((private.lev_cfg() ->> 'enabled')::boolean, true) and now() >= private.lev_next_at())) then
      l := private.lev_resurface(l.id, '{}'::jsonb);
      return jsonb_build_object('returned', l.id);
    end if;
    if coalesce((private.lev_cfg() ->> 'enabled')::boolean, true) and now() >= private.lev_next_at() then$a$);
  if n = d then raise exception 'leviathan deep: tick anchor not found'; end if;
  execute n;
  -- the weekly schedule counts from when it last came (or came back)
  d := pg_get_functiondef('private.lev_next_at()'::regprocedure);
  n := replace(d, $a$select max(spawned_at) into v_last from public.leviathans;$a$,
                  $a$select max(greatest(spawned_at, coalesce((data ->> 'returned_at')::timestamptz, spawned_at))) into v_last from public.leviathans;$a$);
  if n = d then raise exception 'leviathan deep: next_at anchor not found'; end if;
  execute n;
  -- what screens see: how many times it has come back, and the one waiting under the sea
  d := pg_get_functiondef('private.lev_state(uuid,boolean)'::regprocedure);
  n := replace(d, $a$'pos', case when v_hide then$a$, $a$'returns', coalesce((l.data ->> 'returns')::int, 0), 'pos', case when v_hide then$a$);
  if n = d then raise exception 'leviathan deep: state returns anchor not found'; end if;
  d := n;
  n := replace(d, $a$'next_at', case when l.id is null$a$, $a$'deep', case when l.id is null then private.lev_deep(v_uid) end,
    'next_at', case when l.id is null$a$);
  if n = d then raise exception 'leviathan deep: state deep anchor not found'; end if;
  execute n;
end $$;

create or replace function public.leviathan_state(p_tick boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.leviathans;
begin
  -- the heartbeat also beats when people look (no more than every 30 s)
  if p_tick then
    select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
    if (l.id is not null and (l.last_tick is null or l.last_tick < now() - interval '30 seconds'))
       or (l.id is null and (now() >= private.lev_next_at()
                             or exists (select 1 from public.leviathans x where x.status = 'submerged' and (x.data ->> 'return_at')::timestamptz <= now()))) then
      perform private.leviathan_tick();
    end if;
  end if;
  return private.lev_state(auth.uid(), false);
end $$;

-- ---- the owner's controls ----------------------------------------------------------------------------------------------
create or replace function public.admin_leviathan(p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); l public.leviathans; p jsonb; a jsonb; v_pts jsonb; v_kmh numeric; v_min numeric; v_mult numeric; v_sea jsonb;
  v_heal bigint; u record; v_live boolean; v_max numeric; v_hp numeric; v_pace jsonb; v_frac numeric;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  v_live := l.id is not null;
  if p_action not in ('summon', 'status', 'resurface', 'dismiss') and not v_live then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_action in ('speed', 'target', 'rampage', 'retreat', 'stay', 'tiny', 'hide') and l.status = 'warning' then raise exception 'not_risen' using errcode = 'P0001'; end if;
  if v_live then p := private.lev_pos(l, now()); end if;
  case p_action
    when 'summon' then
      if v_live then raise exception 'leviathan_active' using errcode = 'P0001'; end if;
      l := private.lev_spawn(least(greatest(coalesce((p_args ->> 'warn_min')::numeric, 60), 0), 1440));
      perform private.audit('leviathan.summon', 'leviathan', l.id::text, jsonb_build_object('warn_min', p_args -> 'warn_min', 'origin', l.origin));
    when 'dismiss' then
      -- (with none out: the one waiting under the sea goes for good)
      if not v_live then select * into l from public.leviathans where status = 'submerged' order by spawned_at desc limit 1 for update; end if;
      if l.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      update public.leviathans set status = 'ended', ended_at = now() where id = l.id returning * into l;
      perform private.audit('leviathan.dismiss', 'leviathan', l.id::text, '{}'::jsonb);
    when 'submerge' then
      l := private.lev_submerge(l.id, p_args);
      perform private.audit('leviathan.submerge', 'leviathan', l.id::text, p_args);
    when 'resurface' then
      if v_live then raise exception 'leviathan_active' using errcode = 'P0001'; end if;
      l := private.lev_resurface(null, p_args);
      perform private.audit('leviathan.resurface', 'leviathan', l.id::text, p_args || jsonb_build_object('strength', l.strength, 'hp_max', l.hp_max));
    when 'set_hp' then
      -- a set amount (keeping its wounds, or full) — or "lasts N more hours at the pace it's being hit now" (keeping its wounds)
      v_frac := least(greatest(l.hp::numeric / greatest(l.hp_max, 1), 0.05), 1);
      if p_args ->> 'mode' = 'hours' then
        v_pace := private.lev_pace(l);
        if v_pace is null then raise exception 'not_risen' using errcode = 'P0001'; end if;
        v_hp := greatest(1, round((v_pace ->> 'dph')::numeric * least(greatest(coalesce((p_args ->> 'hours')::numeric, 9), 0.25), 240)));
        v_max := round(v_hp / v_frac);
      else
        v_max := (p_args ->> 'hp')::numeric;
        if v_max is null or v_max < 1 or v_max > 1e12 then raise exception 'invalid_hp' using errcode = 'P0001'; end if;
        v_hp := case when coalesce((p_args ->> 'keep')::boolean, true) then greatest(1, round(v_max * l.hp / greatest(l.hp_max, 1))) else v_max end;
      end if;
      v_max := least(greatest(v_max, v_hp, 1), 1e12); v_hp := least(v_hp, v_max);
      v_heal := round(v_hp - l.hp)::bigint;
      update public.leviathans set hp_max = v_max::bigint, hp = v_hp::bigint, roar_at = now(),
             data = data || jsonb_build_object('loot_hp', least(v_max, coalesce((data ->> 'loot_hp')::numeric, hp_max)))
       where id = l.id returning * into l;
      if v_heal > 0 then insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, null, 'heal', 'Drew strength from the deep', '🌊', v_heal); end if;
      perform private.audit('leviathan.set_hp', 'leviathan', l.id::text, p_args || jsonb_build_object('hp', v_hp, 'hp_max', v_max));
    when 'speed' then
      -- km/h, or × its normal pace
      v_kmh := coalesce((p_args ->> 'kmh')::numeric, private.lev_base(l) * (p_args ->> 'mult')::numeric);
      if v_kmh is null or v_kmh < 1 or v_kmh > 5000 then raise exception 'invalid_speed' using errcode = 'P0001'; end if;
      if l.rampage_until > now() then
        -- (on a rampage: this is the pace it goes back to afterwards)
        update public.leviathans set data = data || jsonb_build_object('cruise_kmh', v_kmh) where id = l.id;
      else
        l := private.lev_set_speed(l.id, v_kmh);
      end if;
      perform private.audit('leviathan.speed', 'leviathan', l.id::text, jsonb_build_object('kmh', v_kmh));
    when 'heal' then
      v_heal := least(l.hp_max - l.hp, round(l.hp_max * least(greatest(coalesce((p_args ->> 'pct')::numeric, 10), 1), 100) / 100))::bigint;
      update public.leviathans set hp = hp + v_heal, roar_at = now() where id = l.id returning * into l;
      if v_heal > 0 then insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, null, 'heal', 'It drank the sea and healed', '🌊', v_heal); end if;
      perform private.audit('leviathan.heal', 'leviathan', l.id::text, jsonb_build_object('hp', v_heal));
    when 'retreat' then
      -- back to the sea, and away (no more roaming)
      v_sea := private.lev_nearest_sea((p ->> 'lng')::float8, (p ->> 'lat')::float8);
      if l.rampage_until > now() then l := private.lev_set_speed(l.id, coalesce((l.data ->> 'cruise_kmh')::numeric, private.lev_base(l))); end if;
      update public.leviathans set rampage_until = null, data = data - 'cruise_kmh' - 'target' - 'targets' || jsonb_build_object('retreat', true) where id = l.id;
      l := private.lev_turn(l.id, jsonb_build_array(v_sea -> 'pt'), 1.6, 'fleeing');
      update public.leviathans set exit_sea = v_sea ->> 'name' where id = l.id returning * into l;
      perform private.lev_feed(null, jsonb_build_object('sub', 'fleeing', 'gen', l.gen, 'sea', v_sea ->> 'name'));
      perform private.audit('leviathan.retreat', 'leviathan', l.id::text, jsonb_build_object('sea', v_sea ->> 'name'));
    when 'stay' then
      -- it changes its mind: back inland
      update public.leviathans set data = data - 'retreat' where id = l.id returning * into l;
      if l.status = 'fleeing' then
        a := private.lev_roam(jsonb_build_array(p -> 'lng', p -> 'lat'));
        if a is not null then
          l := private.lev_turn(l.id, a -> 'path', 1, case when l.hp <= l.hp_max * 0.5 then 'enraged' else 'walking' end);
          update public.leviathans set exit_sea = a ->> 'exit' where id = l.id returning * into l;
        end if;
      end if;
      perform private.audit('leviathan.stay', 'leviathan', l.id::text, '{}'::jsonb);
    when 'roam' then
      update public.leviathans set data = data || jsonb_build_object('roam', coalesce((p_args ->> 'on')::boolean, true)) where id = l.id returning * into l;
      perform private.audit('leviathan.roam', 'leviathan', l.id::text, jsonb_build_object('on', p_args -> 'on'));
    when 'target', 'rampage' then
      a := private.lev_aim(p_args, p);
      v_pts := a -> 'pts';
      if p_action = 'rampage' and jsonb_array_length(v_pts) = 0 then v_pts := private.lev_busy_spots(p, 5); end if;
      if jsonb_array_length(v_pts) = 0 then raise exception 'no_targets' using errcode = 'P0001'; end if;
      update public.leviathans set data = data - 'retreat' where id = l.id;
      if p_action = 'rampage' then
        v_min := least(greatest(coalesce((p_args ->> 'minutes')::numeric, 20), 1), 240);
        v_mult := least(greatest(coalesce((p_args ->> 'mult')::numeric, 8), 1.5), 50);
        -- (the pace to come back to: the one it had before this rampage)
        update public.leviathans set data = data || jsonb_build_object('cruise_kmh', coalesce((data ->> 'cruise_kmh')::numeric, speed_kmh)) where id = l.id;
        l := private.lev_go(l.id, v_pts, 1);
        l := private.lev_set_speed(l.id, least(greatest(private.lev_base(l) * v_mult, l.speed_kmh * 1.5), 5000));
        update public.leviathans set rampage_until = now() + make_interval(secs => (v_min * 60)::double precision) where id = l.id returning * into l;
      else
        l := private.lev_go(l.id, v_pts, 1);
      end if;
      update public.leviathans set data = data || jsonb_build_object('targets', v_pts, 'target',
               case when a ->> 'name' is not null then jsonb_build_object('owner_name', a ->> 'name', 'player', true)
                    when jsonb_array_length(coalesce(p_args -> 'plots', '[]'::jsonb)) > 0 then jsonb_build_object('gx', (p_args -> 'plots' -> 0 ->> 0)::int, 'gy', (p_args -> 'plots' -> 0 ->> 1)::int,
                         'owner_name', (select pr.username from public.world_plots w join public.profiles pr on pr.id = w.owner_id where w.gx = (p_args -> 'plots' -> 0 ->> 0)::int and w.gy = (p_args -> 'plots' -> 0 ->> 1)::int))
                    else null end)
       where id = l.id returning * into l;
      -- the players it's coming for are told
      for u in select distinct x.owner_id from (
                 select (a ->> 'player')::uuid owner_id
                 union all select w.owner_id from jsonb_array_elements(coalesce(p_args -> 'plots', '[]'::jsonb)) as c(v) join public.world_plots w on w.gx = (c.v ->> 0)::int and w.gy = (c.v ->> 1)::int) x
               where x.owner_id is not null limit 20 loop
        perform private.notify(u.owner_id, 'leviathan', null, jsonb_build_object('sub', 'coming', 'gen', l.gen, 'rampage', p_action = 'rampage', 'place', l.place));
      end loop;
      perform private.audit('leviathan.' || p_action, 'leviathan', l.id::text, p_args);
    when 'tiny', 'hide' then
      v_min := least(greatest(coalesce((p_args ->> 'minutes')::numeric, 20), 0), 1440);
      l := private.lev_power(l.id, case p_action when 'tiny' then 'tiny' else 'hidden' end, v_min);
      perform private.audit('leviathan.' || p_action, 'leviathan', l.id::text, jsonb_build_object('minutes', v_min));
    when 'status' then null;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  return private.lev_state(v_uid, true) || jsonb_build_object('cfg', private.lev_cfg(), 'hp_calc', private.lev_hp_calc(null), 'deep', private.lev_deep(v_uid),
    'pace', case when l.id is not null then private.lev_pace(l) end,
    'history', (select jsonb_agg(jsonb_build_object('gen', gen, 'status', status, 'origin', origin, 'spawned_at', spawned_at,
    'ended_at', ended_at, 'hp', hp, 'hp_max', hp_max, 'strength', strength, 'returns', coalesce((data ->> 'returns')::int, 0),
    'fighters', (select count(*) from public.leviathan_players p where p.lev_id = x.id and p.dmg > 0)) order by spawned_at desc)
    from (select * from public.leviathans order by spawned_at desc limit 12) x));
end $$;

-- the new settings are checked before they're saved
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_config_set(text,jsonb)'::regprocedure);
  n := replace(d, $a$    or coalesce((p_value ->> 'trample_hours')::numeric, 2) not between 0.1 and 72) then$a$,
                  $a$    or coalesce((p_value ->> 'trample_hours')::numeric, 2) not between 0.1 and 72
    or coalesce(p_value ->> 'hp_mode', 'players') not in ('players', 'fixed', 'enchant')
    or coalesce((p_value ->> 'hp_fixed')::numeric, 60000) not between 1 and 1000000000000
    or coalesce((p_value ->> 'last_hours')::numeric, 9) not between 0.5 and 240
    or coalesce((p_value ->> 'fight_pct')::numeric, 40) not between 2 and 100
    or jsonb_typeof(coalesce(p_value -> 'fight_auto', 'true'::jsonb)) <> 'boolean') then$a$);
  if n = d then raise exception 'leviathan deep: admin_config_set anchor not found'; end if;
  execute n;
end $$;
