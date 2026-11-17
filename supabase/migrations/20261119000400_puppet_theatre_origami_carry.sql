-- Enchantments, part 13: the Puppeteer's theatre (it plays the games itself, live) and the Origami Pocket's carry.
--
-- 🎭 The Puppeteer plays. Put plots on its playlist — yours or anyone's in reach (25 km, 100 km from level 5, anywhere
--    at ★2) — and start the show: the puppet clears their minigame levels by itself, one run per string, and you can
--    watch every run live (the real game, played on strings). Its skill sets how far it gets: a little better every
--    level and star, a little worse every game level. Encore keeps it climbing one plot; otherwise it moves down the
--    playlist. A cleared level pays 75% of what it pays you (all of it at ★5), as the Puppeteer's Ink; your own plots
--    climb their own levels, anyone else's climb the puppet's own ladder there (theirs never move — they get a tip).
--    It plays on when the app is closed (the heartbeat finishes the runs and starts the next while strings last),
--    and stops by itself a day after you were last around. Playlist: 3 plots (5 at level 10). ★3 Grand Show: the
--    day's first three acts are free and pay ×3 (★5 ×5). ★4 Troupe: two puppets perform at once.
--
-- 🦢 The Origami Pocket carries. A plot folded in your pocket goes where you go: on real GPS, its powers work from where
--    you stand — a Kraken's rent counts the neighbours around you, a Glacier freezes around you, a Throne rules around
--    you, a Leyline beams from you, a Lodestone draws to you, a Volcano erupts, a World Tree roots, a Mycelium spreads
--    and a Hive pollinates around you; an enchanted plot's creature works from where you stand. (No GPS for 15 minutes —
--    an hour at ★3 — and they rest where they were folded.) Any plot can be folded, enchanted ones from the start;
--    ★5 folds a whole merged canvas, drawing and all, and unfolds it somewhere new.

-- ---- 🎭 the theatre ----------------------------------------------------------------------------------------------------
create table if not exists public.puppet_runs (
  id uuid primary key default gen_random_uuid(),
  enchant_id uuid not null references public.enchantments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  slot int not null default 0 check (slot between 0 and 1),
  gx int not null, gy int not null,
  game text not null,
  level int not null check (level >= 1),
  rounds int not null check (rounds between 1 and 10),
  own boolean not null default false,
  grand boolean not null default false,
  seed bigint not null,
  plan jsonb not null,
  started_at timestamptz not null default now(),
  due_at timestamptz not null,
  finished_at timestamptz,
  result jsonb
);
create index if not exists puppet_runs_enchant on public.puppet_runs (enchant_id, started_at desc);
create index if not exists puppet_runs_player on public.puppet_runs (player_id, started_at desc);
create index if not exists puppet_runs_due on public.puppet_runs (due_at) where finished_at is null;
alter table public.puppet_runs enable row level security;
revoke all on public.puppet_runs from anon, authenticated;

/** how far the strings reach (null: anywhere) */
select private.fn_patch('private.pup_eval(public.enchantments, timestamp with time zone)',
  $a$'range_m', case when e.stars >= 2 then null else private.ench_n('puppeteer', 'range_m', 5000) * private.ench_reach(e.id) end,$a$,
  $b$'range_m', case when e.stars >= 2 then null else private.ench_n('puppeteer', 'show_range_m', 25000) * case when e.level >= 5 then 4 else 1 end * private.ench_reach(e.id) end,
    'playlist_max', case when e.level >= 10 then 5 else 3 end, 'slots', case when e.stars >= 4 then 2 else 1 end, 'pay_pct', case when e.stars >= 5 then 100 else 75 end,$b$);

/** can the puppet play this plot by itself? (yours anywhere; anyone else's in reach) */
create or replace function private.pup_why_auto(e public.enchantments, p public.world_plots) returns text language plpgsql stable as $$
declare g jsonb;
begin
  if p.gx is null or p.owner_id is null then return 'not_found'; end if;
  if p.locked or p.folded_at is not null then return 'puppet_plot_resting'; end if;
  if not exists (select 1 from public.plot_types t where t.id = p.plot_type and t.minigame is not null) then return 'no_minigame'; end if;
  if p.owner_id = e.owner_id then return null; end if;
  if exists (select 1 from public.player_blocks where (blocker_id = p.owner_id and blocked_id = e.owner_id) or (blocker_id = e.owner_id and blocked_id = p.owner_id)) then return 'blocked'; end if;
  g := private.pup_eval(e, private.ench_now(e));
  if g ->> 'range_m' is not null and not private.spy_in_range(e.owner_id, p.gx, p.gy, (g ->> 'range_m')::numeric) then return 'out_of_range'; end if;
  return null;
end $$;

/** a plot as the theatre lists it: whose, what game, the level it'd play next, how far — and why it can't, if it can't */
create or replace function private.pup_plot_json(e public.enchantments, p_gx int, p_gy int) returns jsonb language plpgsql stable as $$
declare p public.world_plots; c record; v_why text;
begin
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  v_why := private.pup_why_auto(e, p);
  if p.gx is null then return jsonb_build_object('gx', p_gx, 'gy', p_gy, 'why', v_why); end if;
  select * into c from private.explorer_now(e.owner_id);
  return jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'name', p.name, 'own', p.owner_id = e.owner_id,
    'owner_name', (select username from public.profiles where id = p.owner_id), 'game', (select minigame from public.plot_types where id = p.plot_type),
    'next', case when v_why is null or v_why = 'out_of_range' then private.pup_next_level(e, p) end,
    'm', case when c.gx is not null then round(private.ench_cell_m(c.gx, c.gy, p.gx, p.gy)) end, 'why', v_why);
end $$;

/** the level the puppet plays next on a plot (null: every level is beaten) */
create or replace function private.pup_next_level(e public.enchantments, p public.world_plots) returns int language plpgsql stable as $$
declare v_cfg jsonb := private.cfg('minigames'); v_game text; v_max int; v_h int;
begin
  select minigame into v_game from public.plot_types where id = p.plot_type;
  v_max := greatest(1, least(coalesce((v_cfg -> 'games' -> v_game ->> 'max_level')::int, (v_cfg ->> 'max_level')::int, 60), 500));
  if p.owner_id = e.owner_id then
    select coalesce(max(highest_level), 0) into v_h from public.plot_game_progress where gx = p.gx and gy = p.gy and player_id = e.owner_id;
  else
    v_h := coalesce((e.stats -> 'ladder' ->> (p.gx || ':' || p.gy))::int, 0);
  end if;
  return case when v_h >= v_max then null else v_h + 1 end;
end $$;

/** what a cleared level pays you on this plot (its level Ink and round Ink, your plot's rarity and level when it's yours) */
create or replace function private.pup_level_ink(p_game text, p_level int, p_rounds int, p_gx int, p_gy int, p_uid uuid) returns numeric language plpgsql stable as $$
declare v_cfg jsonb := private.cfg('minigames'); v_game jsonb; v_tab jsonb; v_per numeric := 0; v_bonus numeric := 0; v_pl int; v_rm numeric; v_mult numeric; v_boost numeric := 1; k int;
begin
  v_game := coalesce(v_cfg -> 'games' -> p_game, '{}'::jsonb);
  v_tab := v_game -> 'level_ink';
  if jsonb_typeof(v_tab) = 'array' and jsonb_array_length(v_tab) > 0 then v_per := coalesce((v_tab ->> (least(p_level, jsonb_array_length(v_tab)) - 1))::numeric, 0); end if;
  if jsonb_typeof(v_game -> 'round_ink') = 'array' then
    for k in 1 .. p_rounds loop v_bonus := v_bonus + coalesce((v_game -> 'round_ink' ->> (k - 1))::numeric, 0); end loop;
  end if;
  select coalesce(wp.level, 1), coalesce(r.ink_reward_multiplier, 1) into v_pl, v_rm
    from public.world_plots wp left join public.plot_rarities r on r.id = wp.rarity where wp.gx = p_gx and wp.gy = p_gy and wp.owner_id = p_uid;
  v_mult := (1 + coalesce((v_game ->> 'plot_level_bonus')::numeric, (v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_pl, 1) - 1)) * coalesce(v_rm, 1);
  if v_game ? 'boost' and coalesce((v_game -> 'boost' ->> 'multiplier')::numeric, 1) > 1
     and (v_game -> 'boost' ->> 'ends_at' is null or (v_game -> 'boost' ->> 'ends_at')::timestamptz > now()) then
    v_boost := least((v_game -> 'boost' ->> 'multiplier')::numeric, 50);
  end if;
  return greatest(0, (v_per + v_bonus) * v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0) * greatest(coalesce((v_game ->> 'ink_multiplier')::numeric, 1), 0) * v_boost);
end $$;

/** how long the puppet takes over one round of a game (seconds): its strings play at the pace the game's own solver
 *  plays on the stage, so the curtain call lands as the act ends on screen */
create or replace function private.pup_round_s(p_game text, p_level int) returns numeric language sql immutable as $$
  select (case p_game
    when 'blocksplash' then 5.0 + 0.01 * least(p_level, 30)
    when 'colorburst' then 2.0 + 0.02 * least(p_level, 30)
    when 'tracecraft' then 2.5 + 0.02 * least(p_level, 30)
    when 'lightlines' then 2.0 + 0.17 * least(p_level, 30)
    when 'rollermural' then 2.8 + 0.05 * least(p_level, 30)
    when 'mirrorline' then 1.6 + 0.17 * least(p_level, 30)
    when 'paintpop' then 9.8
    when 'memorymural' then 7.8 + 0.02 * least(p_level, 30)
    else 6 end)::numeric
$$;

/** how a run will go: round by round, the puppet's skill against the level (decided when the curtain rises) */
create or replace function private.pup_plan(e public.enchantments, p_level int, p_rounds int, p_game text default null) returns jsonb language plpgsql volatile as $$
declare p numeric := least(0.985, greatest(0.55, private.ench_n('puppeteer', 'skill', 0.97) - 0.006 * (p_level - 1) + 0.004 * least(e.level, 10) + 0.01 * least(e.stars, 5)));
  n int := 0; q jsonb := '[]'::jsonb; secs jsonb := '[]'::jsonb; k int; v_ok boolean; v_s numeric := private.pup_round_s(p_game, p_level);
begin
  for k in 1 .. p_rounds loop
    secs := secs || to_jsonb(round((v_s * (0.95 + random() * 0.15))::numeric, 1));
    v_ok := random() < p;
    if not v_ok then exit; end if;
    n := n + 1; q := q || to_jsonb(68 + floor(random() * 33)::int);
  end loop;
  return jsonb_build_object('p', round(p, 3), 'rounds_passed', n, 'passed', n = p_rounds, 'quality', q, 'secs', secs,
    'score', n * 200 + coalesce((select sum(x::int) from jsonb_array_elements_text(q) x), 0),
    'stars', case when n < p_rounds then 0 when (select avg(x::int) from jsonb_array_elements_text(q) x) >= 90 then 3
                  when (select avg(x::int) from jsonb_array_elements_text(q) x) >= 80 then 2 else 1 end);
end $$;

/** the curtain rises on a plot: a string (unless it's a Grand Show act), a level, a plan */
create or replace function private.pup_run_start(e public.enchantments, p_gx int, p_gy int, p_slot int) returns public.puppet_runs language plpgsql as $$
declare p public.world_plots; g jsonb := private.pup_eval(e, private.ench_now(e)); v_why text; v_game text; v_lvl int; v_rounds int; v_cfg jsonb := private.cfg('minigames');
  v_plan jsonb; v_grand boolean := false; v_md jsonb := g -> 'medley'; v_day text := private.today()::text; v_patch jsonb := '{}'::jsonb; r public.puppet_runs; v_secs numeric;
begin
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  v_why := private.pup_why_auto(e, p);
  if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
  v_lvl := private.pup_next_level(e, p);
  if v_lvl is null then raise exception 'all_levels_beaten' using errcode = 'P0001'; end if;
  -- ★3 Grand Show: the day's first three acts are free and pay ×3 (×5 at ★5)
  if v_md is not null and jsonb_typeof(v_md) = 'object' and coalesce((v_md ->> 'left')::int, 0) > 0 then
    v_grand := true; v_patch := jsonb_build_object('medley', v_md || jsonb_build_object('left', (v_md ->> 'left')::int - 1));
  elsif (g ->> 'grand_ready')::boolean then
    v_grand := true; v_patch := jsonb_build_object('grand_day', v_day, 'medley', jsonb_build_object('day', v_day, 'left', 2, 'plots', jsonb_build_array(jsonb_build_array(p_gx, p_gy))));
  end if;
  if not v_grand then
    if (g ->> 'strings')::int < 1 then raise exception 'no_strings' using errcode = 'P0001'; end if;
    v_patch := v_patch || jsonb_build_object('strings', (g ->> 'strings')::int - 1, 'string_at', (g ->> 'string_at')::numeric);
  end if;
  select minigame into v_game from public.plot_types where id = p.plot_type;
  v_rounds := greatest(1, least(coalesce((v_cfg -> 'games' -> v_game ->> 'rounds')::int, 5), 10));
  v_plan := private.pup_plan(e, v_lvl, v_rounds, v_game);
  select coalesce(sum(x::numeric), 0) into v_secs from jsonb_array_elements_text(v_plan -> 'secs') x;
  update public.enchantments set state = state || v_patch, updated_at = now() where id = e.id;
  insert into public.puppet_runs (enchant_id, player_id, slot, gx, gy, game, level, rounds, own, grand, seed, plan, due_at)
  values (e.id, e.owner_id, p_slot, p_gx, p_gy, v_game, v_lvl, v_rounds, p.owner_id = e.owner_id, v_grand, floor(random() * 2147483646)::bigint + 1, v_plan,
          now() + make_interval(secs => (v_secs + 3)::double precision))
  returning * into r;
  return r;
end $$;

/** the curtain falls: what it cleared pays, the plot's ladder climbs, the owner is tipped */
create or replace function private.pup_run_finish(p_run uuid) returns jsonb language plpgsql as $$
declare r public.puppet_runs; e public.enchantments; v_ink numeric := 0; v_pay jsonb; v_tip int; v_owner uuid; v_rep jsonb; v_res jsonb; v_x numeric;
begin
  select * into r from public.puppet_runs where id = p_run for update;
  if r.id is null or r.finished_at is not null then return null; end if;
  select * into e from public.enchantments where id = r.enchant_id;
  select owner_id into v_owner from public.world_plots where gx = r.gx and gy = r.gy;
  if e.id is not null and e.status = 'active' and (r.plan ->> 'passed')::boolean then
    v_x := case when e.stars >= 5 then 1 else private.ench_n('puppeteer', 'auto_pay', 0.75) end * case when r.grand then case when e.stars >= 5 then 5 else 3 end else 1 end;
    v_ink := floor(private.pup_level_ink(r.game, r.level, r.rounds, r.gx, r.gy, e.owner_id) * v_x);
    if v_ink > 0 then v_pay := private.ench_pay(e.id, v_ink, 'the puppet cleared level ' || r.level || case when r.own then ' on your plot' else ' on @' || coalesce((select username from public.profiles where id = v_owner), 'someone') || '’s plot' end); end if;
    -- the plot climbs: yours for real, anyone else's on the puppet's own ladder
    if r.own and v_owner = e.owner_id then
      insert into public.plot_game_progress (gx, gy, player_id, game, highest_level, best_score, plays, wins, updated_at)
      values (r.gx, r.gy, e.owner_id, r.game, r.level, coalesce((r.plan ->> 'score')::int, 0), 1, 1, now())
      on conflict (gx, gy, player_id) do update set game = excluded.game, highest_level = greatest(public.plot_game_progress.highest_level, excluded.highest_level),
        best_score = greatest(public.plot_game_progress.best_score, excluded.best_score), plays = public.plot_game_progress.plays + 1,
        wins = public.plot_game_progress.wins + 1, updated_at = now();
    elsif not r.own then
      update public.enchantments set stats = jsonb_set(stats, '{ladder}', coalesce(stats -> 'ladder', '{}'::jsonb)
             || jsonb_build_object(r.gx || ':' || r.gy, greatest(coalesce((stats -> 'ladder' ->> (r.gx || ':' || r.gy))::int, 0), r.level))) where id = e.id;
    end if;
  end if;
  -- someone else's plot: they're tipped (and told, at most once an hour)
  if e.id is not null and v_owner is not null and v_owner <> r.player_id then
    v_tip := greatest(2, round(coalesce((v_pay ->> 'paid')::numeric, v_ink) * 0.1))::int;
    if (r.plan ->> 'passed')::boolean then perform private.grant_ink_paced(v_owner, v_tip, 'enchantment', 'puppet_tip', e.id::text, null); else v_tip := null; end if;
    if not exists (select 1 from public.player_notifications n where n.player_id = v_owner and n.data ->> 'sub' = 'puppet_auto' and n.created_at > now() - interval '1 hour') then
      perform private.notify(v_owner, 'enchant', r.player_id, jsonb_build_object('sub', 'puppet_auto', 'kind', 'puppeteer', 'gx', r.gx, 'gy', r.gy, 'game', r.game,
        'level', r.level, 'passed', (r.plan ->> 'passed')::boolean, 'ink', v_tip));
    end if;
  end if;
  if e.id is not null then
    v_rep := coalesce(e.stats -> 'repertoire', '{}'::jsonb);
    v_rep := v_rep || jsonb_build_object(r.game, greatest(coalesce((v_rep ->> r.game)::int, 0), coalesce((r.plan ->> 'score')::int, 0)));
    update public.enchantments set stats = stats || jsonb_build_object('repertoire', v_rep, 'shows', coalesce((stats ->> 'shows')::int, 0) + 1,
        'wins', coalesce((stats ->> 'wins')::int, 0) + case when (r.plan ->> 'passed')::boolean then 1 else 0 end,
        'auto_levels', coalesce((stats ->> 'auto_levels')::int, 0) + case when (r.plan ->> 'passed')::boolean then 1 else 0 end,
        'auto_ink', coalesce((stats ->> 'auto_ink')::numeric, 0) + coalesce((v_pay ->> 'paid')::numeric, 0),
        'best_auto', greatest(coalesce((stats ->> 'best_auto')::int, 0), case when (r.plan ->> 'passed')::boolean then r.level else 0 end)) where id = e.id;
    if (r.plan ->> 'passed')::boolean then perform private.ench_xp(e.id, 1); end if;
    perform private.ench_event(e.id, 'auto_show', jsonb_build_object('game', r.game, 'level', r.level, 'passed', (r.plan ->> 'passed')::boolean,
      'rounds', r.rounds, 'cleared', (r.plan ->> 'rounds_passed')::int, 'ink', v_pay -> 'paid', 'tip', v_tip, 'own', r.own, 'grand', r.grand,
      'owner', case when not r.own then (select username from public.profiles where id = v_owner) end));
  end if;
  v_res := jsonb_build_object('passed', (r.plan ->> 'passed')::boolean, 'cleared', (r.plan ->> 'rounds_passed')::int, 'rounds', r.rounds, 'level', r.level,
                              'ink', coalesce((v_pay ->> 'paid')::numeric, 0), 'tip', v_tip, 'grand', r.grand);
  update public.puppet_runs set finished_at = now(), result = v_res where id = r.id;
  return v_res;
end $$;

/** the show goes on: finish what's due, raise the curtain on the next act in every free slot */
create or replace function private.pup_show_tick(p_enchant uuid) returns jsonb language plpgsql as $$
declare e public.enchantments; r public.puppet_runs; sh jsonb; v_plots jsonb; v_n int; v_slots int; s int; v_cur jsonb; v_try int; v_pos int; v_tgt jsonb; v_last public.puppet_runs;
  v_started int := 0; v_done int := 0; v_wait text; v_busy jsonb;
begin
  select * into e from public.enchantments where id = p_enchant and kind = 'puppeteer' for update;
  if e.id is null then return null; end if;
  for r in select * from public.puppet_runs where enchant_id = e.id and finished_at is null and due_at <= now() order by due_at loop
    perform private.pup_run_finish(r.id); v_done := v_done + 1;
  end loop;
  select * into e from public.enchantments where id = p_enchant;
  sh := e.state -> 'show';
  if e.status <> 'active' or jsonb_typeof(sh) <> 'object' or not coalesce((sh ->> 'on')::boolean, false) then return jsonb_build_object('finished', v_done, 'started', 0); end if;
  -- (the show stops by itself a day after you were last around)
  if exists (select 1 from public.players where id = e.owner_id and coalesce(last_active_at, now()) < now() - interval '24 hours') then
    update public.enchantments set state = jsonb_set(state, '{show,on}', 'false'::jsonb) || jsonb_build_object('show_end', 'away') where id = e.id;
    perform private.ench_event(e.id, 'show_off', jsonb_build_object('why', 'away'));
    return jsonb_build_object('finished', v_done, 'started', 0, 'stopped', 'away');
  end if;
  v_plots := coalesce(sh -> 'plots', '[]'::jsonb); v_n := jsonb_array_length(v_plots);
  if v_n = 0 then return jsonb_build_object('finished', v_done, 'started', 0); end if;
  v_slots := least(case when e.stars >= 4 then 2 else 1 end, v_n);
  v_cur := coalesce(sh -> 'cursor', '[0, 1]'::jsonb);
  for s in 0 .. v_slots - 1 loop
    continue when exists (select 1 from public.puppet_runs where enchant_id = e.id and slot = s and finished_at is null);
    select coalesce(jsonb_agg(jsonb_build_array(gx, gy)), '[]'::jsonb) into v_busy from public.puppet_runs where enchant_id = e.id and finished_at is null;
    select * into v_last from public.puppet_runs where enchant_id = e.id and slot = s order by started_at desc limit 1;
    v_pos := coalesce((v_cur ->> s)::int, s) % v_n;
    -- an encore after a cleared level stays on the same plot; otherwise the next one down the playlist
    if not (coalesce((sh ->> 'encore')::boolean, true) and v_last.id is not null and coalesce((v_last.result ->> 'passed')::boolean, false)
            and v_last.gx = (v_plots -> v_pos ->> 0)::int and v_last.gy = (v_plots -> v_pos ->> 1)::int) and v_last.id is not null then
      v_pos := (v_pos + 1) % v_n;
    end if;
    v_wait := null;
    for v_try in 0 .. v_n - 1 loop
      v_tgt := v_plots -> ((v_pos + v_try) % v_n);
      continue when v_busy @> jsonb_build_array(v_tgt);
      begin
        perform private.pup_run_start(e, (v_tgt ->> 0)::int, (v_tgt ->> 1)::int, s);
        v_cur := jsonb_set(v_cur, array[s::text], to_jsonb((v_pos + v_try) % v_n));
        v_started := v_started + 1;
        select * into e from public.enchantments where id = p_enchant;
        exit;
      exception when others then
        v_wait := sqlerrm;
        exit when sqlerrm = 'no_strings';
      end;
    end loop;
  end loop;
  update public.enchantments set state = jsonb_set(state, '{show}', (state -> 'show') || jsonb_build_object('cursor', v_cur, 'waiting', case when v_started = 0 then v_wait end))
   where id = e.id;
  return jsonb_build_object('finished', v_done, 'started', v_started, 'waiting', v_wait);
end $$;

/** a run as the theatre shows it */
create or replace function private.pup_run_json(r public.puppet_runs) returns jsonb language sql stable as $$
  select jsonb_build_object('id', r.id, 'slot', r.slot, 'gx', r.gx, 'gy', r.gy, 'game', r.game, 'level', r.level, 'rounds', r.rounds, 'own', r.own, 'grand', r.grand,
    'seed', r.seed, 'started_at', extract(epoch from r.started_at), 'due_at', extract(epoch from r.due_at), 'finished', r.finished_at is not null,
    'cleared', (r.plan ->> 'rounds_passed')::int, 'passed', (r.plan ->> 'passed')::boolean, 'secs', r.plan -> 'secs', 'result', r.result,
    'name', w.name, 'rarity', w.rarity, 'owner_name', case when not r.own then pr.username end)
  from (select 1) x left join public.world_plots w on w.gx = r.gx and w.gy = r.gy left join public.profiles pr on pr.id = w.owner_id
$$;

-- the Puppeteer's actions: the show (the manual pull still happens on the game screen)
create or replace function private.ench_act_puppeteer(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb; g jsonb := private.pup_eval(e, t); v_plots jsonb := '[]'::jsonb; pc jsonb; p public.world_plots; v_why text; r jsonb; v_tick jsonb;
begin
  if (select kind from public.enchantments where id = e.id) <> 'puppeteer' then raise exception 'mirror_cannot' using errcode = 'P0001'; end if;
  case p_action
    when 'show' then
      for pc in select x from jsonb_array_elements(coalesce(a -> 'plots', '[]'::jsonb)) x loop
        select * into p from public.world_plots where gx = (pc ->> 0)::int and gy = (pc ->> 1)::int;
        v_why := private.pup_why_auto(e, p);
        if v_why is not null then raise exception '%', v_why using errcode = 'P0001', detail = coalesce(p.gx || ',' || p.gy, ''); end if;
        if not v_plots @> jsonb_build_array(jsonb_build_array(p.gx, p.gy)) then v_plots := v_plots || jsonb_build_array(jsonb_build_array(p.gx, p.gy)); end if;
      end loop;
      if jsonb_array_length(v_plots) = 0 then raise exception 'no_plots' using errcode = 'P0001'; end if;
      if jsonb_array_length(v_plots) > (g ->> 'playlist_max')::int then raise exception 'playlist_full' using errcode = 'P0001', detail = g ->> 'playlist_max'; end if;
      update public.enchantments set state = (state - 'show_end') || jsonb_build_object('show', jsonb_build_object('on', true, 'plots', v_plots, 'encore', coalesce((a ->> 'encore')::boolean, true),
        'cursor', '[0, 1]'::jsonb, 'since', extract(epoch from now()))) where id = e.id;
      perform private.ench_stat(e.id, 'shows_started');
      perform private.ench_event(e.id, 'show_on', jsonb_build_object('n', jsonb_array_length(v_plots), 'encore', coalesce((a ->> 'encore')::boolean, true)));
      v_tick := private.pup_show_tick(e.id);
      r := jsonb_build_object('show', true, 'plots', v_plots, 'tick', v_tick);
    when 'stop' then
      update public.enchantments set state = jsonb_set(state, '{show,on}', 'false'::jsonb) || jsonb_build_object('show_end', 'stopped') where id = e.id and jsonb_typeof(state -> 'show') = 'object';
      if found then perform private.ench_event(e.id, 'show_off', '{}'::jsonb); end if;
      r := jsonb_build_object('stopped', true);
    when 'encore' then
      update public.enchantments set state = jsonb_set(state, '{show,encore}', to_jsonb(coalesce((a ->> 'on')::boolean, true))) where id = e.id and jsonb_typeof(state -> 'show') = 'object';
      r := jsonb_build_object('encore', coalesce((a ->> 'on')::boolean, true));
    when 'tick' then
      r := private.pup_show_tick(e.id);
    when 'peek' then
      -- (a plot picked on the map: can the puppet play it, and what's on it)
      r := private.pup_plot_json(e, (a ->> 'gx')::int, (a ->> 'gy')::int);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  select state into s from public.enchantments where id = e.id;
  return jsonb_build_object('state', s, 'result', r);
end $$;

-- the page: the show, the runs on stage, the last curtain calls, and your own plots it could play
select private.fn_patch('private.ench_view_puppeteer(public.enchantments, timestamp with time zone)',
  $a$  return g || jsonb_build_object('nearby', v_near,$a$,
  $b$  return g || jsonb_build_object('show', case when jsonb_typeof(e.state -> 'show') = 'object' then e.state -> 'show' end, 'show_end', e.state -> 'show_end',
    'runs', coalesce((select jsonb_agg(private.pup_run_json(r) order by r.slot) from public.puppet_runs r where r.enchant_id = e.id and r.finished_at is null), '[]'::jsonb),
    'curtain_calls', coalesce((select jsonb_agg(private.pup_run_json(r) order by r.finished_at desc) from (select * from public.puppet_runs where enchant_id = e.id and finished_at is not null
                                order by finished_at desc limit 10) r), '[]'::jsonb),
    'own_plots', coalesce((select jsonb_agg(q.j) from (
                             select jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'plot_type', w.plot_type, 'name', w.name, 'game', t2.minigame,
                                      'next', private.pup_next_level(e, w)) j
                               from public.world_plots w join public.plot_types t2 on t2.id = w.plot_type
                              where w.owner_id = e.owner_id and not w.locked and w.folded_at is null and t2.minigame is not null
                              order by w.claimed_at desc limit 60) q), '[]'::jsonb),
    'playlist', coalesce((select jsonb_agg(private.pup_plot_json(e, (x ->> 0)::int, (x ->> 1)::int))
                            from jsonb_array_elements(case when jsonb_typeof(e.state -> 'show' -> 'plots') = 'array' then e.state -> 'show' -> 'plots' else '[]'::jsonb end) x), '[]'::jsonb),
    'auto_levels', coalesce((e.stats ->> 'auto_levels')::int, 0), 'auto_ink', coalesce((e.stats ->> 'auto_ink')::numeric, 0), 'server_now', extract(epoch from clock_timestamp()),
    'nearby', v_near,$b$);
select private.fn_patch('private.ench_view_puppeteer(public.enchantments, timestamp with time zone)',
  $a$'attention', case when (g ->> 'strings')::int > 0 then 'A string is ready — play someone’s plot' end);$a$,
  $b$'attention', case when coalesce((e.state -> 'show' ->> 'on')::boolean, false) then '🎭 The show is on' when (g ->> 'strings')::int > 0 then 'A string is ready — start a show' end);$b$);
-- (the list of plots it can reach: as far as the strings go)
select private.fn_patch('private.ench_view_puppeteer(public.enchantments, timestamp with time zone)',
  $a$v_cells := ceil(coalesce((g ->> 'range_m')::numeric, 5000) / 3)::int;$a$, $b$v_cells := least(40000, ceil(coalesce((g ->> 'range_m')::numeric, 25000) / 3)::int);$b$);

/** every show you have running, for the little stage that follows you round the app (and a nudge to the shows) */
create or replace function public.puppet_live() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); x record;
begin
  perform private.rate_limit('puppet_live', 1200, 3600);
  for x in select distinct r.enchant_id from public.puppet_runs r where r.player_id = v_uid and r.finished_at is null and r.due_at <= now() loop
    perform private.pup_show_tick(x.enchant_id);
  end loop;
  return jsonb_build_object('server_now', extract(epoch from clock_timestamp()),
    'shows', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'serial', e.serial, 'nickname', e.nickname, 'on', coalesce((e.state -> 'show' ->> 'on')::boolean, false),
        'waiting', e.state -> 'show' ->> 'waiting',
        'runs', coalesce((select jsonb_agg(private.pup_run_json(r) order by r.slot) from public.puppet_runs r where r.enchant_id = e.id and r.finished_at is null), '[]'::jsonb),
        'calls', coalesce((select jsonb_agg(private.pup_run_json(r) order by r.finished_at desc) from (select * from public.puppet_runs where enchant_id = e.id
                            and finished_at > now() - interval '3 minutes' order by finished_at desc limit 4) r), '[]'::jsonb)))
      from public.enchantments e where e.owner_id = v_uid and e.kind = 'puppeteer' and e.status = 'active'
        and (coalesce((e.state -> 'show' ->> 'on')::boolean, false) or exists (select 1 from public.puppet_runs r where r.enchant_id = e.id and (r.finished_at is null or r.finished_at > now() - interval '3 minutes')))), '[]'::jsonb));
end $$;
do $$ begin
  execute 'revoke all on function public.puppet_live() from public, anon';
  execute 'grant execute on function public.puppet_live() to authenticated, service_role';
end $$;

/** the heartbeat keeps the shows going while nobody's watching */
create or replace function private.pup_tick_all() returns void language plpgsql as $$
declare x record;
begin
  for x in (select distinct enchant_id id from public.puppet_runs where finished_at is null and due_at <= now() limit 300)
           union (select e.id from public.enchantments e where e.kind = 'puppeteer' and e.status = 'active' and coalesce((e.state -> 'show' ->> 'on')::boolean, false)
                    and not exists (select 1 from public.puppet_runs r where r.enchant_id = e.id and r.finished_at is null) limit 300) loop
    begin perform private.pup_show_tick(x.id); exception when others then raise warning 'pup_show_tick %: %', x.id, sqlerrm; end;
  end loop;
end $$;
select private.fn_patch('private.wonders_tick()',
  $a$  begin perform private.sun_nova_tick(); exception when others then raise warning 'sun_nova_tick: %', sqlerrm; end;$a$,
  $b$  begin perform private.sun_nova_tick(); exception when others then raise warning 'sun_nova_tick: %', sqlerrm; end;
  begin perform private.pup_tick_all(); exception when others then raise warning 'pup_tick_all: %', sqlerrm; end;$b$);

-- ---- 🦢 carried: a folded plot's powers work from where you stand ------------------------------------------------------
/** where a folded plot is being carried right now (its owner's live GPS fix), or null */
create or replace function private.carry_cell(p_gx int, p_gy int) returns int[] language sql stable as $$
  select array[private.lng_to_gx(x.gps_lng), private.lat_to_gy(x.gps_lat)]
    from public.world_plots w
    join public.enchantments o on o.id = w.folded_by and o.status = 'active'
    join public.explorers x on x.player_id = w.owner_id
   where w.gx = p_gx and w.gy = p_gy and w.folded_at is not null and w.owner_id is not null
     and x.mode = 'gps' and x.gps_lng is not null and x.gps_lat is not null
     and x.gps_at > now() - case when o.stars >= 3 then interval '60 minutes' else interval '15 minutes' end
   limit 1
$$;
/** the carried powers of these kinds (where each one is right now) */
create or replace function private.carried_powers(p_rarities text[]) returns table (gx int, gy int, at_gx int, at_gy int, owner_id uuid, rarity text, state jsonb)
language sql stable as $$
  select x.gx, x.gy, c.cc[1], c.cc[2], x.owner_id, x.rarity, x.state
    from public.rarity_powers x
    join public.world_plots w on w.gx = x.gx and w.gy = x.gy and w.folded_at is not null
    cross join lateral (select private.carry_cell(x.gx, x.gy) cc) c
   where x.rarity = any (p_rarities) and c.cc is not null
$$;

-- 🐙 a Kraken counts the neighbours around where it is
create or replace function private.kraken_mult(p public.world_plots) returns numeric language sql stable as $$
  select least(1 + coalesce((c ->> 'per_neighbour')::numeric, 0.75) * (
      select count(*) from public.world_plots q
       where q.gx between ctr[1] - r and ctr[1] + r and q.gy between ctr[2] - r and ctr[2] + r
         and q.owner_id is not null and q.owner_id <> p.owner_id),
    coalesce((c ->> 'max')::numeric, 20))
  from (select private.cfg('rarity_abilities') -> 'kraken' c, coalesce((private.cfg('rarity_abilities') -> 'kraken' ->> 'cells')::int, 21) r,
               coalesce(private.carry_cell(p.gx, p.gy), array[p.gx, p.gy]) ctr) x
$$;
-- 🌀 Chaos rolls its day where it is
select private.fn_patch('private.plot_day_mult(public.world_plots, date)',
  'private.chaos_mult(p.gx, p.gy, p_day)', 'private.chaos_mult(coalesce((private.carry_cell(p.gx, p.gy))[1], p.gx), coalesce((private.carry_cell(p.gx, p.gy))[2], p.gy), p_day)', true);
-- 🧊 a Glacier freezes around where it is
create or replace function private.rx_frozen_at(p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.rarity_powers x, (select private.rx_n('glacier', 'cells', 8)::int r) k
                  where x.rarity = 'glacier' and x.gx between p_gx - k.r and p_gx + k.r and x.gy between p_gy - k.r and p_gy + k.r
                    and private.carry_cell(x.gx, x.gy) is null)
      or exists (select 1 from private.carried_powers(array['glacier']) c, (select private.rx_n('glacier', 'cells', 8)::int r) k
                  where c.at_gx between p_gx - k.r and p_gx + k.r and c.at_gy between p_gy - k.r and p_gy + k.r)
      or private.rx_rule_at(p_gx, p_gy, 'peace')
$$;
-- 👑 a Throne rules around where it is
create or replace function private.rx_rule_at(p_gx int, p_gy int, p_rule text) returns boolean language sql stable as $$
  select exists (
    select 1 from public.rarity_powers x, (select private.rx_cells(private.rx_area_m(), p_gy) r) k
     where x.rarity = 'throne_ink' and x.state ->> 'rule' = p_rule and (x.state ->> 'rule_until')::timestamptz > now()
       and x.gx between p_gx - k.r and p_gx + k.r and x.gy between p_gy - k.r and p_gy + k.r
       and private.rx_m(x.gx, x.gy, p_gx, p_gy) <= private.rx_area_m() and private.carry_cell(x.gx, x.gy) is null)
  or exists (
    select 1 from private.carried_powers(array['throne_ink']) c
     where c.state ->> 'rule' = p_rule and (c.state ->> 'rule_until')::timestamptz > now() and private.rx_m(c.at_gx, c.at_gy, p_gx, p_gy) <= private.rx_area_m())
$$;
-- ⚡ a Leyline beams from where it is; 🧲 a Lodestone draws to where it is
select private.fn_patch('private.rx_on_beam(uuid, integer, integer)',
  $a$for x in select gx, gy, state from public.rarity_powers where owner_id = p_uid and rarity in ('leyline', 'compass_rose') loop$a$,
  $b$for x in select coalesce((private.carry_cell(q.gx, q.gy))[1], q.gx) gx, coalesce((private.carry_cell(q.gx, q.gy))[2], q.gy) gy, q.state
             from public.rarity_powers q where q.owner_id = p_uid and q.rarity in ('leyline', 'compass_rose') loop$b$);
select private.fn_patch('private.rx_lode_cell(uuid)',
  $a$select gx, gy into x from public.rarity_powers where owner_id = p_uid and rarity in ('lodestone', 'compass_rose') order by since limit 1;$a$,
  $b$select coalesce((private.carry_cell(q.gx, q.gy))[1], q.gx) gx, coalesce((private.carry_cell(q.gx, q.gy))[2], q.gy) gy into x
    from public.rarity_powers q where q.owner_id = p_uid and q.rarity in ('lodestone', 'compass_rose') order by q.since limit 1;$b$);
-- 🌋 🌳 🍄 🐝 the daily ones act around where they are
select private.fn_patch('private.rx_erupt(public.rarity_powers)',
  $a$c := private.ench_free_cell(x.gx, x.gy,$a$,
  $b$c := private.ench_free_cell(coalesce((private.carry_cell(x.gx, x.gy))[1], x.gx), coalesce((private.carry_cell(x.gx, x.gy))[2], x.gy),$b$);
select private.fn_patch('private.rx_grow(public.rarity_powers)',
  'v_roots jsonb; v_max int; r int; t record;', 'v_roots jsonb; v_max int; r int; t record; cc int[] := coalesce(private.carry_cell(x.gx, x.gy), array[x.gx, x.gy]);');
select private.fn_patch('private.rx_grow(public.rarity_powers)',
  $a$w.gx between x.gx - r and x.gx + r and w.gy between x.gy - r and x.gy + r$a$, $b$w.gx between cc[1] - r and cc[1] + r and w.gy between cc[2] - r and cc[2] + r$b$);
select private.fn_patch('private.rx_grow(public.rarity_powers)',
  $a$order by (w.gx - x.gx)::numeric ^ 2 + (w.gy - x.gy)::numeric ^ 2 limit 1;$a$, $b$order by (w.gx - cc[1])::numeric ^ 2 + (w.gy - cc[2])::numeric ^ 2 limit 1;$b$);
select private.fn_patch('private.rx_aim(public.rarity_powers)',
  'v jsonb;', 'v jsonb; cc int[] := coalesce(private.carry_cell(x.gx, x.gy), array[x.gx, x.gy]);');
select private.fn_patch('private.rx_aim(public.rarity_powers)',
  $a$w.gx between x.gx - r and x.gx + r and w.gy between x.gy - r and x.gy + r$a$, $b$w.gx between cc[1] - r and cc[1] + r and w.gy between cc[2] - r and cc[2] + r$b$);
select private.fn_patch('private.rx_aim(public.rarity_powers)',
  $a$order by (w.gx - x.gx)::numeric ^ 2 + (w.gy - x.gy)::numeric ^ 2 desc$a$, $b$order by (w.gx - cc[1])::numeric ^ 2 + (w.gy - cc[2])::numeric ^ 2 desc$b$);
select private.fn_patch('private.rx_pollinate(public.rarity_powers)',
  'v_paid int;', 'v_paid int; cc int[] := coalesce(private.carry_cell(x.gx, x.gy), array[x.gx, x.gy]);');
select private.fn_patch('private.rx_pollinate(public.rarity_powers)',
  $a$and w.gx between x.gx - r and x.gx + r and w.gy between x.gy - r and x.gy + r$a$, $b$and w.gx between cc[1] - r and cc[1] + r and w.gy between cc[2] - r and cc[2] + r$b$);
select private.fn_patch('private.rx_spread(public.rarity_powers)',
  'tx int; ty int; a record;', 'tx int; ty int; a record; cc int[] := coalesce(private.carry_cell(x.gx, x.gy), array[x.gx, x.gy]);');
select private.fn_patch('private.rx_spread(public.rarity_powers)',
  'select gx, gy into a from (select x.gx gx, x.gy gy union all', 'select gx, gy into a from (select cc[1] gx, cc[2] gy union all');

-- 🔮 an enchanted plot in your pocket: its creature works from where you stand
select private.fn_patch('private.ench_kind_view(public.enchantments, timestamp with time zone)',
  $a$begin
  return case e.kind$a$,
  $b$declare v_carry int[] := private.carry_cell(e.gx, e.gy); v jsonb;
begin
  if v_carry is not null then e.gx := v_carry[1]; e.gy := v_carry[2]; end if;
  v := case e.kind$b$);
select private.fn_patch('private.ench_kind_view(public.enchantments, timestamp with time zone)',
  $a$then 'The shard shows new reflections' end)
  end;
end$a$,
  $b$then 'The shard shows new reflections' end)
  end;
  return v || case when v_carry is not null then jsonb_build_object('carried_at', to_jsonb(v_carry)) else '{}'::jsonb end;
end$b$);
select private.fn_patch('public.enchant_act(uuid, text, jsonb)',
  $a$  t := private.ench_now(e);
  if p_action = 'rename' then$a$,
  $b$  t := private.ench_now(e);
  -- (carried in an Origami Pocket: it acts from where you stand)
  if p_action not in ('rename', 'separate') and private.carry_cell(e.gx, e.gy) is not null then
    declare v_cc int[] := private.carry_cell(e.gx, e.gy);
    begin e.gx := v_cc[1]; e.gy := v_cc[2]; end;
  end if;
  if p_action = 'rename' then$b$);

-- ---- 🦢 the Origami Pocket ---------------------------------------------------------------------------------------------
-- any plot of yours folds (enchanted ones from the start); ★5 folds a whole merged canvas
create or replace function private.ori_why_not(e public.enchantments, p public.world_plots) returns text language plpgsql stable as $$
declare g public.canvas_groups;
begin
  if p.owner_id is distinct from e.owner_id then return 'not_your_plot'; end if;
  if p.folded_at is not null then return 'already_folded'; end if;
  if p.locked then return 'plot_locked'; end if;
  if p.rarity like 'crown%' then return 'crown'; end if;
  if p.gx = e.gx and p.gy = e.gy then return 'own_plot'; end if;
  if p.rarity = 'enchanted' and exists (select 1 from public.enchantments x where x.gx = p.gx and x.gy = p.gy and x.status = 'active'
                                          and (private.ench_spliced(x.id) or (x.kind = 'stormcoil' and jsonb_typeof(x.state -> 'storm') = 'object'
                                               and not coalesce((x.state -> 'storm' ->> 'settled')::boolean, false)))) then return 'enchant_busy'; end if;
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy;
  if g.id is not null and g.status <> 'active' then return 'merged'; end if;
  if g.id is not null and g.plot_count > 1 then
    if e.stars < 5 then return 'merged'; end if;
    -- ★5 Grand Fold: every plot of the canvas comes along, so every one must be free to
    if exists (select 1 from public.canvas_group_members m join public.world_plots w on w.gx = m.gx and w.gy = m.gy
                where m.group_id = g.id and (w.owner_id is distinct from e.owner_id or w.locked or w.folded_at is not null or w.rarity like 'crown%'
                                             or w.rarity = 'enchanted' or (w.gx = e.gx and w.gy = e.gy))) then return 'merged_busy'; end if;
  end if;
  return null;
end $$;

/** what's in the pocket counts by canvas (a merged canvas folds as one) */
select private.fn_patch('private.ori_eval(public.enchantments, timestamp with time zone)',
  $a$'pocket', (select count(*) from public.world_plots where folded_by = e.id and owner_id = e.owner_id),$a$,
  $b$'pocket', (select count(distinct coalesce(m.group_id::text, w.gx || ':' || w.gy)) from public.world_plots w left join public.canvas_group_members m on m.gx = w.gx and m.gy = w.gy
                where w.folded_by = e.id and w.owner_id = e.owner_id),
    'grand', e.stars >= 5, 'carry_grace_m', case when e.stars >= 3 then 60 else 15 end,$b$);

/** fold one plot: what was stuck to it falls off */
create or replace function private.ori_fold_cell(e public.enchantments, p_gx int, p_gy int) returns void language plpgsql as $$
declare sp record;
begin
  for sp in select id from public.enchantments x where x.kind = 'parasite' and x.status = 'active' and (x.state -> 'host' ->> 'gx')::int = p_gx and (x.state -> 'host' ->> 'gy')::int = p_gy loop
    update public.enchantments set state = state || jsonb_build_object('host', null, 'rest_until', private.ench_ep(now()) + 3600) where id = sp.id;
  end loop;
  delete from public.enchant_buffs where gx = p_gx and gy = p_gy and kind in ('plot_giant', 'plot_tiny', 'scorch', 'crease');
  update public.enchant_splices set ends_at = now() where mode = 'plot' and plot_gx = p_gx and plot_gy = p_gy and ends_at > now();
  update public.world_plots set folded_at = now(), folded_by = e.id, updated_at = now() where gx = p_gx and gy = p_gy;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
end $$;

-- the fold: a merged canvas (★5) folds whole
select private.fn_patch('private.ench_act_origami(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      -- what was stuck to it falls off: a Parasite, a size, a scorch; a splice into it ends
      for sp in select id from public.enchantments x where x.kind = 'parasite' and x.status = 'active' and (x.state -> 'host' ->> 'gx')::int = p.gx and (x.state -> 'host' ->> 'gy')::int = p.gy loop
        update public.enchantments set state = state || jsonb_build_object('host', null, 'rest_until', private.ench_ep(now()) + 3600) where id = sp.id;
      end loop;
      delete from public.enchant_buffs where gx = p.gx and gy = p.gy and kind in ('plot_giant', 'plot_tiny', 'scorch', 'crease');
      update public.enchant_splices set ends_at = now() where mode = 'plot' and plot_gx = p.gx and plot_gy = p.gy and ends_at > now();
      update public.world_plots set folded_at = now(), folded_by = e.id, updated_at = now() where gx = p.gx and gy = p.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);$a$,
  $b$      -- what was stuck to it falls off: a Parasite, a size, a scorch; a splice into it ends (every plot of a merged canvas)
      for sp in select m.gx, m.gy from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id and gr.plot_count > 1
                 where m.group_id = (select group_id from public.canvas_group_members where gx = p.gx and gy = p.gy) loop
        perform private.ori_fold_cell(e, sp.gx, sp.gy);
      end loop;
      if (select folded_at from public.world_plots where gx = p.gx and gy = p.gy) is null then perform private.ori_fold_cell(e, p.gx, p.gy); end if;$b$);

/** the canvas of a folded plot, when it's a merged one (its members and the offset each has from the one picked) */
create or replace function private.ori_group_of(p_gx int, p_gy int) returns public.canvas_groups language sql stable as $$
  select gr.* from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id and gr.plot_count > 1 and gr.status = 'active'
   where m.gx = p_gx and m.gy = p_gy limit 1
$$;

/** a project's tiles move with its cells */
create or replace function private.ori_move_project_cells(p_project uuid, p_dx int, p_dy int, p_cells jsonb) returns void language plpgsql as $$
declare pr public.artwork_projects; v public.artwork_versions; v_man jsonb; v_id uuid; v_map jsonb := '{}'::jsonb; c jsonb;
begin
  select * into pr from public.artwork_projects where id = p_project for update;
  if pr.id is null or pr.current_version_id is null then return; end if;
  select * into v from public.artwork_versions where id = pr.current_version_id;
  if v.id is null then return; end if;
  for c in select x from jsonb_array_elements(p_cells) x loop
    v_map := v_map || jsonb_build_object(private.cell_key((c ->> 0)::int, (c ->> 1)::int), private.cell_key((c ->> 0)::int + p_dx, (c ->> 1)::int + p_dy));
  end loop;
  v_man := v.manifest;
  if jsonb_typeof(v.manifest -> 'layers') = 'array' then
    v_man := jsonb_set(v.manifest, '{layers}', coalesce((
      select jsonb_agg(case when jsonb_typeof(l -> 'tiles') = 'object'
                            then jsonb_set(l, '{tiles}', coalesce((select jsonb_object_agg(coalesce(v_map ->> tk, tk), tv) from jsonb_each(l -> 'tiles') tt(tk, tv)), '{}'::jsonb))
                            else l end order by ord)
        from jsonb_array_elements(v.manifest -> 'layers') with ordinality x(l, ord)), '[]'::jsonb));
  end if;
  insert into public.artwork_versions (project_id, owner_id, version_no, parent_version_id, kind, manifest, cells, layer_count, tile_count, note)
  values (pr.id, pr.owner_id, (select coalesce(max(version_no), 0) + 1 from public.artwork_versions where project_id = pr.id), v.id, 'save', v_man,
          (select jsonb_agg(jsonb_build_array((x ->> 0)::int + p_dx, (x ->> 1)::int + p_dy)) from jsonb_array_elements(p_cells) x), v.layer_count, v.tile_count,
          'Unfolded somewhere new by an Origami Pocket (the whole canvas)')
  returning id into v_id;
  update public.artwork_projects set current_version_id = v_id, version_count = version_count + 1, updated_at = now() where id = pr.id;
end $$;

/** ★5 Grand Fold: a whole merged canvas lands somewhere new, every plot keeping its place in it */
create or replace function private.ori_move_group(e public.enchantments, g public.canvas_groups, p_dx int, p_dy int) returns jsonb language plpgsql as $$
declare c record; w public.world_plots; v_y text; v_yt text; v_cells jsonb := '[]'::jsonb; v_n int := 0; v_km numeric; v_ench uuid;
begin
  perform private.rent_settle(e.owner_id);
  for c in select p.* from public.canvas_group_members m join public.world_plots p on p.gx = m.gx and p.gy = m.gy where m.group_id = g.id order by p.gx, p.gy loop
    select * into w from public.world_plots where gx = c.gx + p_dx and gy = c.gy + p_dy for update;
    if w.gx is not null then v_y := w.rarity; v_yt := w.plot_type; else v_y := private.cell_ladder_rarity(c.gx + p_dx, c.gy + p_dy); v_yt := private.plot_type_for(c.gx + p_dx, c.gy + p_dy); end if;
    if v_y like 'crown%' or v_y = 'enchanted' then v_y := private.cell_ladder_rarity(c.gx + p_dx, c.gy + p_dy); end if;
    if w.gx is not null then
      update public.world_plots set owner_id = e.owner_id, claimed_at = c.claimed_at, level = c.level, plot_type = c.plot_type, rarity = c.rarity,
             art_publication_id = c.art_publication_id, art_rev = null, folded_at = null, folded_by = null, updated_at = now()
       where gx = c.gx + p_dx and gy = c.gy + p_dy;
    else
      insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at, level, art_publication_id)
      values (c.gx + p_dx, c.gy + p_dy, c.plot_type, c.rarity, e.owner_id, c.claimed_at, c.level, c.art_publication_id);
    end if;
    update public.world_plots set shiny = c.shiny, name = c.name where gx = c.gx + p_dx and gy = c.gy + p_dy;
    delete from public.plot_game_progress where gx = c.gx + p_dx and gy = c.gy + p_dy;
    update public.plot_game_progress set gx = c.gx + p_dx, gy = c.gy + p_dy where gx = c.gx and gy = c.gy;
    delete from public.crucible_inlays where gx = c.gx + p_dx and gy = c.gy + p_dy;
    delete from public.crucible_monuments where gx = c.gx + p_dx and gy = c.gy + p_dy;
    update public.crucible_inlays set gx = c.gx + p_dx, gy = c.gy + p_dy where gx = c.gx and gy = c.gy;
    update public.crucible_monuments set gx = c.gx + p_dx, gy = c.gy + p_dy, updated_at = now() where gx = c.gx and gy = c.gy;
    update public.crucible_artifacts set gx = c.gx + p_dx, gy = c.gy + p_dy where gx = c.gx and gy = c.gy;
    if c.art_publication_id is not null and c.art_rev is not null then
      perform private.enqueue_job('move_art', jsonb_build_object('from', jsonb_build_array(c.gx, c.gy), 'to', jsonb_build_array(c.gx + p_dx, c.gy + p_dy), 'rev', c.art_rev, 'publication_id', c.art_publication_id));
    end if;
    update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null, rarity = v_y, plot_type = coalesce(v_yt, plot_type),
           folded_at = null, folded_by = null, updated_at = now()
     where gx = c.gx and gy = c.gy;
    update public.plot_ownership set released_at = now(), release_reason = 'folded away (Origami Pocket, the whole canvas)' where gx = c.gx and gy = c.gy and released_at is null;
    insert into public.plot_ownership (gx, gy, player_id, method, cost) values (c.gx + p_dx, c.gy + p_dy, e.owner_id, 'unfold', jsonb_build_object('from', jsonb_build_array(c.gx, c.gy), 'canvas', g.id));
    insert into public.plot_art_history (gx, gy, publication_id, rev) values (c.gx, c.gy, null, null);
    perform private.spy_claimed(e.owner_id, c.gx + p_dx, c.gy + p_dy);
    v_cells := v_cells || jsonb_build_array(jsonb_build_array(c.gx, c.gy));
    v_n := v_n + 1;
  end loop;
  update public.canvas_group_members set gx = gx + p_dx, gy = gy + p_dy where group_id = g.id;
  update public.canvas_groups set min_gx = min_gx + p_dx, max_gx = max_gx + p_dx, min_gy = min_gy + p_dy, max_gy = max_gy + p_dy, updated_at = now() where id = g.id;
  if g.project_id is not null then perform private.ori_move_project_cells(g.project_id, p_dx, p_dy, v_cells); end if;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', g.min_gx, g.min_gy, g.max_gx, g.max_gy),
    ('ownership', g.min_gx + p_dx, g.min_gy + p_dy, g.max_gx + p_dx, g.max_gy + p_dy);
  perform private.enqueue_job('clear_cells', jsonb_build_object('cells', v_cells));
  insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
  select e.owner_id, 'crease', (x ->> 0)::int + p_dx, (x ->> 1)::int + p_dy, e.id, 1.25, jsonb_build_object('from', x, 'canvas', g.id), now() + interval '24 hours' from jsonb_array_elements(v_cells) x;
  v_km := round((private.ench_cell_m(g.min_gx, g.min_gy, g.min_gx + p_dx, g.min_gy + p_dy) / 1000)::numeric, 1);
  perform private.fairplay(e.owner_id, 'unfold_canvas', g.min_gx + p_dx, g.min_gy + p_dy, jsonb_build_object('from', jsonb_build_array(g.min_gx, g.min_gy), 'plots', v_n, 'km', v_km, 'canvas', g.id));
  return jsonb_build_object('from', jsonb_build_array(g.min_gx, g.min_gy), 'to', jsonb_build_array(g.min_gx + p_dx, g.min_gy + p_dy), 'km', v_km, 'plots', v_n, 'canvas', true,
                            'rarity', (select rarity from public.world_plots where gx = g.min_gx + p_dx and gy = g.min_gy + p_dy), 'drawing', g.project_id is not null);
end $$;

-- unfolding a merged canvas: every plot lands at its place in it (all must be free); smoothing puts them all back
select private.fn_patch('private.ench_act_origami(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      perform pg_advisory_xact_lock(hashtext('cell:' || (a ->> 'to_gx') || ':' || (a ->> 'to_gy')));
      v_mv := private.ori_move(e, p, (a ->> 'to_gx')::int, (a ->> 'to_gy')::int);$a$,
  $b$      perform pg_advisory_xact_lock(hashtext('cell:' || (a ->> 'to_gx') || ':' || (a ->> 'to_gy')));
      if (private.ori_group_of(p.gx, p.gy)).id is not null then
        declare gg public.canvas_groups := private.ori_group_of(p.gx, p.gy); v_dx int := (a ->> 'to_gx')::int - p.gx; v_dy int := (a ->> 'to_gy')::int - p.gy; mc record;
        begin
          if exists (select 1 from public.canvas_group_members m join public.world_plots w on w.gx = m.gx and w.gy = m.gy where m.group_id = gg.id and w.folded_by is distinct from e.id) then
            raise exception 'not_folded' using errcode = 'P0001'; end if;
          for mc in select m.gx, m.gy from public.canvas_group_members m where m.group_id = gg.id loop
            if private.ori_can_land(e.owner_id, e, mc.gx + v_dx, mc.gy + v_dy) is not null and not (mc.gx = p.gx and mc.gy = p.gy) then
              -- (only the picked plot has to be in reach; the rest just has to be free)
              if exists (select 1 from public.world_plots w where w.gx = mc.gx + v_dx and w.gy = mc.gy + v_dy and (w.owner_id is not null or w.locked))
                 or exists (select 1 from public.enchantments x where x.gx = mc.gx + v_dx and x.gy = mc.gy + v_dy and x.status <> 'gone') then
                raise exception 'canvas_blocked' using errcode = 'P0001'; end if;
            end if;
          end loop;
          v_mv := private.ori_move_group(e, gg, v_dx, v_dy);
          perform private.ench_stat(e.id, 'grand_folds');
        end;
      else
        v_mv := private.ori_move(e, p, (a ->> 'to_gx')::int, (a ->> 'to_gy')::int);
      end if;$b$);
select private.fn_patch('private.ench_act_origami(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      update public.world_plots set folded_at = null, folded_by = null, updated_at = now() where gx = p.gx and gy = p.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
      perform private.ench_event(e.id, 'smoothed', jsonb_build_object('gx', p.gx, 'gy', p.gy));$a$,
  $b$      update public.world_plots set folded_at = null, folded_by = null, updated_at = now()
       where folded_by = e.id and ((gx = p.gx and gy = p.gy) or (gx, gy) in (select m.gx, m.gy from public.canvas_group_members m where m.group_id = (private.ori_group_of(p.gx, p.gy)).id));
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx - 64, p.gy - 64, p.gx + 64, p.gy + 64);
      perform private.ench_event(e.id, 'smoothed', jsonb_build_object('gx', p.gx, 'gy', p.gy));$b$);

-- the pocket on the page: what's being carried, where, and what it's doing there
create or replace function private.ori_carry_json(e public.enchantments) returns jsonb language plpgsql stable as $$
declare c int[]; v jsonb := '[]'::jsonb; p public.world_plots; x record; v_live boolean;
begin
  select * into x from public.explorers where player_id = e.owner_id;
  v_live := x.mode = 'gps' and x.gps_at > now() - case when e.stars >= 3 then interval '60 minutes' else interval '15 minutes' end;
  for p in select w.* from public.world_plots w where w.folded_by = e.id and w.owner_id = e.owner_id order by w.folded_at loop
    c := private.carry_cell(p.gx, p.gy);
    v := v || jsonb_build_array(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'at', to_jsonb(c),
      'power', case when p.rarity in ('kraken', 'krakatoa') then jsonb_build_object('what', 'kraken', 'x', private.kraken_mult(p))
                    when exists (select 1 from public.rarity_powers r where r.gx = p.gx and r.gy = p.gy) then jsonb_build_object('what', (select rarity from public.rarity_powers r where r.gx = p.gx and r.gy = p.gy))
                    when p.rarity = 'enchanted' then jsonb_build_object('what', 'enchanted', 'kind', (select kind from public.enchantments k where k.gx = p.gx and k.gy = p.gy and k.status = 'active'))
                    when p.rarity = 'chaos' then jsonb_build_object('what', 'chaos', 'x', private.plot_day_mult(p, private.today())) end));
  end loop;
  return jsonb_build_object('live', coalesce(v_live, false), 'gps_at', x.gps_at, 'mode', x.mode, 'plots', v,
    'km', round(coalesce((e.stats ->> 'carry_km')::numeric, 0), 2), 'grace_m', case when e.stars >= 3 then 60 else 15 end);
end $$;
select private.fn_patch('private.ench_view_origami(public.enchantments, timestamp with time zone)',
  $a$  return g || jsonb_build_object('pocket_plots', v_pocket, 'plots', v_plots,$a$,
  $b$  return g || jsonb_build_object('pocket_plots', v_pocket, 'plots', v_plots, 'carry', private.ori_carry_json(e),
    'groups', coalesce((select jsonb_object_agg(m.gx || ':' || m.gy, jsonb_build_object('id', gr.id, 'n', gr.plot_count, 'w', gr.max_gx - gr.min_gx + 1, 'h', gr.max_gy - gr.min_gy + 1,
                                                    'dx', m.gx - gr.min_gx, 'dy', m.gy - gr.min_gy))
                         from public.world_plots w join public.canvas_group_members m on m.gx = w.gx and m.gy = w.gy join public.canvas_groups gr on gr.id = m.group_id and gr.plot_count > 1
                        where w.owner_id = e.owner_id and (w.folded_by = e.id or e.stars >= 5)), '{}'::jsonb),$b$);

/** on the move: carried plots go the distance with you (real GPS only) */
create or replace function private.ori_carry_moved(p_uid uuid, p_lng0 float8, p_lat0 float8, p_lng1 float8, p_lat1 float8) returns void language plpgsql as $$
declare d numeric; o record; v_kraken boolean;
begin
  if p_lng0 is null or p_lat0 is null then return; end if;
  d := private.haversine_m(p_lng0, p_lat0, p_lng1, p_lat1);
  if d < 3 or d > 3000 then return; end if;
  for o in select e.id, e.stats from public.enchantments e where e.owner_id = p_uid and e.kind = 'origami' and e.status = 'active'
              and exists (select 1 from public.world_plots w where w.folded_by = e.id and w.owner_id = p_uid) loop
    v_kraken := exists (select 1 from public.world_plots w where w.folded_by = o.id and w.owner_id = p_uid and w.rarity in ('kraken', 'krakatoa'));
    update public.enchantments set stats = stats || jsonb_build_object('carry_km', round(coalesce((stats ->> 'carry_km')::numeric, 0) + d / 1000, 3))
           || case when v_kraken then jsonb_build_object('kraken_carry', 1) else '{}'::jsonb end where id = o.id;
    -- (a note for fair play every kilometre carried)
    if floor((coalesce((o.stats ->> 'carry_km')::numeric, 0) + d / 1000)) > floor(coalesce((o.stats ->> 'carry_km')::numeric, 0)) then
      perform private.fairplay(p_uid, 'carry', private.lng_to_gx(p_lng1), private.lat_to_gy(p_lat1),
        jsonb_build_object('enchant', o.id, 'km', round(coalesce((o.stats ->> 'carry_km')::numeric, 0) + d / 1000, 1),
                           'plots', (select jsonb_agg(jsonb_build_array(w.gx, w.gy, w.rarity)) from public.world_plots w where w.folded_by = o.id)));
      perform private.ench_event(o.id, 'carried', jsonb_build_object('km', floor(coalesce((o.stats ->> 'carry_km')::numeric, 0) + d / 1000)::int));
    end if;
  end loop;
end $$;
select private.fn_patch('public.report_position(double precision, double precision, double precision)',
  $a$   where player_id = v_uid;
  return private.explorer_json(v_uid) || jsonb_build_object('accepted', true, 'snapped', e.mode <> 'gps');$a$,
  $b$   where player_id = v_uid;
  -- 🦢 what's folded in your pocket came along
  if e.mode = 'gps' then perform private.ori_carry_moved(v_uid, e.lng, e.lat, p_lng, p_lat); end if;
  return private.explorer_json(v_uid) || jsonb_build_object('accepted', true, 'snapped', e.mode <> 'gps');$b$);

-- the map: your carried plots ride along with your explorer
select private.fn_patch('public.enchant_map2(integer, integer, integer, integer)',
  $a$    'suns', v_suns,$a$,
  $b$    'suns', v_suns,
    'carried', case when v_uid is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'at', to_jsonb(private.carry_cell(w.gx, w.gy)),
                   'kind', (select kind from public.enchantments k where k.gx = w.gx and k.gy = w.gy and k.status = 'active' and w.rarity = 'enchanted')))
                   from public.world_plots w where w.owner_id = v_uid and w.folded_at is not null and private.carry_cell(w.gx, w.gy) is not null), '[]'::jsonb) end,$b$);

-- ---- the star powers that changed --------------------------------------------------------------------------------------
select private.fn_patch('private.ench_star_powers(text)',
  $a${"name": "Living Fold", "emoji": "✨", "text": "Fold an enchanted plot, creature and all."}$a$,
  $b${"name": "Long Carry", "emoji": "🎒", "text": "A carried plot keeps working for an hour after your last GPS fix, not 15 minutes."}$b$);
select private.fn_patch('private.ench_star_powers(text)',
  $a${"name": "Grand Fold", "emoji": "🏯", "text": "Unfolding pays triple, and a carried plot’s powers reach twice as far."}$a$,
  $b${"name": "Grand Fold", "emoji": "🏯", "text": "Fold a whole merged canvas — drawing and all — and unfolding pays triple."}$b$);
select private.fn_patch('private.ench_star_powers(text)',
  $a${"name": "Grand Show", "emoji": "🎪", "text": "Once a day, a puppet run pays ×3."}$a$,
  $b${"name": "Grand Show", "emoji": "🎪", "text": "Once a day, a three-act medley: three free acts that pay ×3 (in a show, the day’s first three)."}$b$);
select private.fn_patch('private.ench_star_powers(text)',
  $a${"name": "Troupe", "emoji": "🎭", "text": "Two more strings, and two puppets perform at once."}$a$,
  $b${"name": "Troupe", "emoji": "🎭", "text": "Two more strings, and two puppets perform at once in a show."}$b$);
select private.fn_patch('private.ench_star_powers(text)',
  $a${"name": "Opening Night", "emoji": "🌟", "text": "The Grand Show pays ×5, and puppet wins pay in full."}$a$,
  $b${"name": "Opening Night", "emoji": "🌟", "text": "The Grand Show pays ×5, and levels the puppet clears by itself pay in full (not 75%)."}$b$);

-- ---- badges -------------------------------------------------------------------------------------------------------------
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort, is_secret) values
  ('pp_auto_25', 'Marionette Master', 'Your puppet clears 25 levels by itself.', '🎎', 'enchant', 'ench.puppeteer.auto_levels', 25, '{"luck": 10}', 834, false),
  ('og_grand', 'Grand Fold', 'Fold a whole merged canvas and unfold it somewhere new (★5).', '🏯', 'enchant', 'ench.origami.grand_folds', 1, '{"luck": 30, "enchanted_luck": 1}', 835, true),
  ('og_carry_100', 'Paper Pilgrim', 'Carry folded plots 100 km.', '🧭', 'enchant', 'ench.origami.carry_km', 100, '{"luck": 30, "enchanted_luck": 1}', 836, false)
on conflict (key) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, category = excluded.category,
  metric = excluded.metric, threshold = excluded.threshold, reward = excluded.reward, sort = excluded.sort, is_secret = excluded.is_secret;
