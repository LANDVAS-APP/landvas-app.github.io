-- 🎭 The Puppeteer, by itself, ten levels a string.
--
-- The owner: "the puppet still isn't playing the minigames automatically — it's still me playing them by hand. Make
-- each string play through 10 levels, and let me stack up to 10 strings."
--
--   · Every string is a run of ten: once a string is pulled, the puppet plays level after level on that plot by itself
--     until it has cleared 10 (or tangled 3 times — a string snaps). Each cleared level pays, climbs and tips as before.
--     A string that's still going when the show stops is kept, and carries on when the show starts again; if its plot
--     leaves the playlist (or runs out of levels), the rest of the string goes to the next plot down the playlist.
--   · Strings stack to 10 (one comes back every hour, every half hour at ★1).
--   · ★3 Grand Show: the day's first string is free, and the day's first three levels pay ×3 (×5 at ★5).
--     ★4 Troupe: two puppets perform at once, each on its own string.
--   · A Mirror Shard reflecting a Puppeteer runs a show too (its puppeteer state lives in the shard's state.r; while the
--     show ticks, the shard's row holds it — the same way every reflection acts since 430).
--   · Playing someone's plot by hand on the game screen is gone from the Puppeteer's page: the puppet plays.
-- Every number is a setting: game_config 'enchantments' → puppeteer.{strings_max, levels_per_string, tangles_per_string}.

-- ---- strings: up to 10, and what a string is worth -----------------------------------------------------------------
select private.fn_patch('private.pup_eval(public.enchantments,timestamptz)',
  $a$  v_max int := 2 + case when e.level >= 5 then 1 else 0 end + case when e.level >= 10 then 1 else 0 end + case when e.stars >= 4 then 2 else 0 end;$a$,
  $b$  v_max int := greatest(1, private.ench_n('puppeteer', 'strings_max', 10)::int);$b$);
select private.fn_patch('private.pup_eval(public.enchantments,timestamptz)',
  $a$'pay_pct', case when e.stars >= 5 then 100 else 75 end,$a$,
  $b$'pay_pct', case when e.stars >= 5 then 100 else 75 end,
    'per_string', greatest(1, private.ench_n('puppeteer', 'levels_per_string', 10)::int), 'snaps_at', greatest(1, private.ench_n('puppeteer', 'tangles_per_string', 3)::int),$b$);

-- ---- an act: the next level of a plot (a new string spends one; the rest of a string doesn't) -------------------------
drop function if exists private.pup_run_start(public.enchantments, int, int, int);
create or replace function private.pup_run_start(e public.enchantments, p_gx int, p_gy int, p_slot int, p_new_string boolean) returns public.puppet_runs language plpgsql as $$
declare p public.world_plots; g jsonb := private.pup_eval(e, private.ench_now(e)); v_why text; v_game text; v_lvl int; v_rounds int; v_cfg jsonb := private.cfg('minigames');
  v_plan jsonb; v_grand boolean := false; v_free boolean := false; v_md jsonb := g -> 'medley'; v_day text := private.today()::text; v_patch jsonb := '{}'::jsonb;
  r public.puppet_runs; v_secs numeric;
begin
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  v_why := private.pup_why_auto(e, p);
  if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
  v_lvl := private.pup_next_level(e, p);
  if v_lvl is null then raise exception 'all_levels_beaten' using errcode = 'P0001'; end if;
  -- ★3 Grand Show: the day's first string is free, and the day's first three levels pay ×3 (×5 at ★5)
  if (g ->> 'grand_ready')::boolean then
    v_grand := true; v_free := true;
    v_patch := jsonb_build_object('grand_day', v_day, 'medley', jsonb_build_object('day', v_day, 'left', 2));
  elsif v_md is not null and jsonb_typeof(v_md) = 'object' and coalesce((v_md ->> 'left')::int, 0) > 0 then
    v_grand := true; v_patch := jsonb_build_object('medley', v_md || jsonb_build_object('left', (v_md ->> 'left')::int - 1));
  end if;
  if p_new_string and not v_free then
    if (g ->> 'strings')::int < 1 then raise exception 'no_strings' using errcode = 'P0001'; end if;
    v_patch := v_patch || jsonb_build_object('strings', (g ->> 'strings')::int - 1, 'string_at', (g ->> 'string_at')::numeric);
  end if;
  select minigame into v_game from public.plot_types where id = p.plot_type;
  v_rounds := greatest(1, least(coalesce((v_cfg -> 'games' -> v_game ->> 'rounds')::int, 5), 10));
  -- (the stars it plays with travel with the act: a reflection's are the reflection's)
  v_plan := private.pup_plan(e, v_lvl, v_rounds, v_game) || jsonb_build_object('stars', e.stars, 'new_string', p_new_string);
  select coalesce(sum(x::numeric), 0) into v_secs from jsonb_array_elements_text(v_plan -> 'secs') x;
  update public.enchantments set state = state || v_patch, updated_at = now() where id = e.id;
  insert into public.puppet_runs (enchant_id, player_id, slot, gx, gy, game, level, rounds, own, grand, seed, plan, due_at)
  values (e.id, e.owner_id, p_slot, p_gx, p_gy, v_game, v_lvl, v_rounds, p.owner_id = e.owner_id, v_grand, floor(random() * 2147483646)::bigint + 1, v_plan,
          now() + make_interval(secs => (v_secs + 3)::double precision))
  returning * into r;
  return r;
end $$;

-- (an act pays by the stars it was played with)
select private.fn_patch('private.pup_run_finish(uuid)',
  $a$v_x := case when e.stars >= 5 then 1 else private.ench_n('puppeteer', 'auto_pay', 0.75) end * case when r.grand then case when e.stars >= 5 then 5 else 3 end else 1 end;$a$,
  $b$v_x := case when coalesce((r.plan ->> 'stars')::int, e.stars) >= 5 then 1 else private.ench_n('puppeteer', 'auto_pay', 0.75) end
         * case when r.grand then case when coalesce((r.plan ->> 'stars')::int, e.stars) >= 5 then 5 else 3 end else 1 end;$b$);

-- ---- the show: strings of ten, slot by slot ------------------------------------------------------------------------
/** the show's work for one Puppeteer whose puppeteer state is on its row right now (p_stars: a reflection's stars) */
create or replace function private.pup_show_tick_in(p_enchant uuid, p_stars int default null) returns jsonb language plpgsql as $$
declare e public.enchantments; r public.puppet_runs; sh jsonb; g jsonb; v_plots jsonb; v_n int; v_slots int; s int; v_cur jsonb; v_strs jsonb; v_str jsonb;
  v_last public.puppet_runs; v_run public.puppet_runs; v_busy jsonb; v_try int; v_pos int; v_idx int; v_tgt jsonb; v_started int := 0; v_done int := 0; v_wait text;
  v_per int; v_snap int; v_new boolean;
begin
  select * into e from public.enchantments where id = p_enchant for update;
  if e.id is null then return null; end if;
  for r in select * from public.puppet_runs where enchant_id = e.id and finished_at is null and due_at <= now() order by due_at loop
    perform private.pup_run_finish(r.id); v_done := v_done + 1;
  end loop;
  select * into e from public.enchantments where id = p_enchant;
  e.stars := coalesce(p_stars, e.stars);
  sh := e.state -> 'show';
  if e.status <> 'active' or jsonb_typeof(sh) <> 'object' or not coalesce((sh ->> 'on')::boolean, false) then return jsonb_build_object('finished', v_done, 'started', 0); end if;
  -- (the show stops by itself a day after you were last around; a string in hand is kept for next time)
  if exists (select 1 from public.players where id = e.owner_id and coalesce(last_active_at, now()) < now() - interval '24 hours') then
    update public.enchantments set state = jsonb_set(state, '{show,on}', 'false'::jsonb) || jsonb_build_object('show_end', 'away') where id = e.id;
    perform private.ench_event(e.id, 'show_off', jsonb_build_object('why', 'away'));
    return jsonb_build_object('finished', v_done, 'started', 0, 'stopped', 'away');
  end if;
  v_plots := coalesce(sh -> 'plots', '[]'::jsonb); v_n := jsonb_array_length(v_plots);
  if v_n = 0 then return jsonb_build_object('finished', v_done, 'started', 0); end if;
  g := private.pup_eval(e, private.ench_now(e));
  v_per := (g ->> 'per_string')::int; v_snap := (g ->> 'snaps_at')::int;
  v_slots := least(case when e.stars >= 4 then 2 else 1 end, v_n);
  v_cur := coalesce(sh -> 'cursor', '[0, 1]'::jsonb);
  v_strs := jsonb_build_array(coalesce(sh -> 'str' -> 0, 'null'::jsonb), coalesce(sh -> 'str' -> 1, 'null'::jsonb));
  for s in 0 .. v_slots - 1 loop
    continue when exists (select 1 from public.puppet_runs where enchant_id = e.id and slot = s and finished_at is null);
    v_str := case when jsonb_typeof(v_strs -> s) = 'object' then v_strs -> s end;
    -- the act that just ended on this string counts: a level cleared, or a tangle
    if v_str is not null and v_str ->> 'run' is not null and not coalesce((v_str ->> 'counted')::boolean, false) then
      select * into v_last from public.puppet_runs where id = (v_str ->> 'run')::uuid;
      if v_last.id is null or v_last.finished_at is not null then
        v_str := v_str || jsonb_build_object('counted', true,
          'clears', coalesce((v_str ->> 'clears')::int, 0) + case when coalesce((v_last.result ->> 'passed')::boolean, false) then 1 else 0 end,
          'tangles', coalesce((v_str ->> 'tangles')::int, 0) + case when v_last.id is not null and not coalesce((v_last.result ->> 'passed')::boolean, false) then 1 else 0 end);
      end if;
    end if;
    -- a string is spent at ten levels cleared (or snaps at three tangles)
    if v_str is not null and (coalesce((v_str ->> 'clears')::int, 0) >= v_per or coalesce((v_str ->> 'tangles')::int, 0) >= v_snap) then
      perform private.ench_stat(e.id, 'strings_played');
      perform private.ench_event(e.id, 'string_done', jsonb_build_object('clears', (v_str ->> 'clears')::int, 'tangles', (v_str ->> 'tangles')::int,
        'gx', v_str -> 'gx', 'gy', v_str -> 'gy', 'snapped', coalesce((v_str ->> 'clears')::int, 0) < v_per));
      v_str := null;
    end if;
    select coalesce(jsonb_agg(jsonb_build_array(gx, gy)), '[]'::jsonb) into v_busy from public.puppet_runs where enchant_id = e.id and finished_at is null;
    v_new := v_str is null;
    -- where the act goes: a string stays on its plot; a new one stays on the last plot with encore, else the next one
    v_pos := coalesce((v_cur ->> s)::int, s) % v_n;
    if v_str is not null then
      v_idx := null;
      select i - 1 into v_idx from jsonb_array_elements(v_plots) with ordinality q(x, i) where x = jsonb_build_array(v_str -> 'gx', v_str -> 'gy') limit 1;
      if v_idx is not null then v_pos := v_idx; end if;
    elsif not coalesce((sh ->> 'encore')::boolean, true) and exists (select 1 from public.puppet_runs where enchant_id = e.id and slot = s) then
      v_pos := (v_pos + 1) % v_n;
    end if;
    v_wait := null;
    for v_try in 0 .. v_n - 1 loop
      v_tgt := v_plots -> ((v_pos + v_try) % v_n);
      continue when v_busy @> jsonb_build_array(v_tgt);
      begin
        v_run := private.pup_run_start(e, (v_tgt ->> 0)::int, (v_tgt ->> 1)::int, s, v_new);
        v_cur := jsonb_set(v_cur, array[s::text], to_jsonb((v_pos + v_try) % v_n));
        v_str := case when v_new then jsonb_build_object('clears', 0, 'tangles', 0, 'n', 1)
                      else v_str || jsonb_build_object('n', coalesce((v_str ->> 'n')::int, 0) + 1) end
                 || jsonb_build_object('gx', v_tgt -> 0, 'gy', v_tgt -> 1, 'run', v_run.id, 'counted', false);
        if v_new then perform private.ench_event(e.id, 'string_on', jsonb_build_object('gx', v_tgt -> 0, 'gy', v_tgt -> 1, 'game', v_run.game, 'level', v_run.level)); end if;
        v_started := v_started + 1;
        select * into e from public.enchantments where id = p_enchant;
        e.stars := coalesce(p_stars, e.stars);
        exit;
      exception when others then
        v_wait := sqlerrm;
        exit when sqlerrm = 'no_strings';
      end;
    end loop;
    v_strs := jsonb_set(v_strs, array[s::text], coalesce(v_str, 'null'::jsonb));
  end loop;
  update public.enchantments set state = jsonb_set(state, '{show}', (state -> 'show') || jsonb_build_object('cursor', v_cur, 'str', v_strs,
      'waiting', case when v_started = 0 and not exists (select 1 from public.puppet_runs where enchant_id = e.id and finished_at is null) then v_wait end))
   where id = e.id;
  return jsonb_build_object('finished', v_done, 'started', v_started, 'waiting', v_wait);
end $$;

/** the show's work for a Puppeteer — or a Mirror Shard reflecting one (its state.r is held on the row meanwhile) */
create or replace function private.pup_show_tick(p_enchant uuid) returns jsonb language plpgsql as $$
declare e public.enchantments; x public.enchantments; v jsonb;
begin
  select * into e from public.enchantments where id = p_enchant and kind in ('puppeteer', 'shard') for update;
  if e.id is null then return null; end if;
  if e.kind = 'puppeteer' or jsonb_typeof(e.state -> 'reflect') <> 'object' then
    -- (a Puppeteer; or a shard whose reflection is already acting on its row — enchant_act holds it there)
    return private.pup_show_tick_in(e.id);
  end if;
  x := private.ench_reflected(e, private.ench_now(e));
  if x.id is null or x.kind <> 'puppeteer' then
    -- (the reflection is over or changed: what was on stage still takes its bow)
    for v in select private.pup_run_finish(r.id) from public.puppet_runs r where r.enchant_id = e.id and r.finished_at is null and r.due_at <= now() loop end loop;
    return jsonb_build_object('finished', 0, 'started', 0);
  end if;
  update public.enchantments set state = coalesce(e.state -> 'r', '{}'::jsonb) where id = e.id;
  v := private.pup_show_tick_in(e.id, x.stars);
  update public.enchantments set state = e.state || jsonb_build_object('r', state) where id = e.id;
  return v;
end $$;

-- the heartbeat: shows on Puppeteers and on Shards reflecting one
create or replace function private.pup_tick_all() returns void language plpgsql as $$
declare x record;
begin
  for x in (select distinct enchant_id id from public.puppet_runs where finished_at is null and due_at <= now() limit 300)
           union (select e.id from public.enchantments e where e.kind = 'puppeteer' and e.status = 'active' and coalesce((e.state -> 'show' ->> 'on')::boolean, false)
                    and not exists (select 1 from public.puppet_runs r where r.enchant_id = e.id and r.finished_at is null) limit 300)
           union (select e.id from public.enchantments e where e.kind = 'shard' and e.status = 'active' and e.state -> 'reflect' ->> 'kind' = 'puppeteer'
                    and coalesce((e.state -> 'r' -> 'show' ->> 'on')::boolean, false)
                    and not exists (select 1 from public.puppet_runs r where r.enchant_id = e.id and r.finished_at is null) limit 100) loop
    begin perform private.pup_show_tick(x.id); exception when others then raise warning 'pup_show_tick %: %', x.id, sqlerrm; end;
  end loop;
end $$;

-- the little stage that follows you: shows on your Puppeteers and your reflections of one
create or replace function public.puppet_live() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); x record;
begin
  perform private.rate_limit('puppet_live', 1200, 3600);
  for x in select distinct r.enchant_id from public.puppet_runs r where r.player_id = v_uid and r.finished_at is null and r.due_at <= now() loop
    perform private.pup_show_tick(x.enchant_id);
  end loop;
  return jsonb_build_object('server_now', extract(epoch from clock_timestamp()),
    'shows', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'serial', e.serial, 'nickname', e.nickname, 'on', coalesce((q.sh ->> 'on')::boolean, false),
        'waiting', q.sh ->> 'waiting', 'str', q.sh -> 'str',
        'runs', coalesce((select jsonb_agg(private.pup_run_json(r) order by r.slot) from public.puppet_runs r where r.enchant_id = e.id and r.finished_at is null), '[]'::jsonb),
        'calls', coalesce((select jsonb_agg(private.pup_run_json(r) order by r.finished_at desc) from (select * from public.puppet_runs where enchant_id = e.id
                            and finished_at > now() - interval '3 minutes' order by finished_at desc limit 4) r), '[]'::jsonb)))
      from public.enchantments e
      cross join lateral (select case when e.kind = 'puppeteer' then e.state -> 'show' else e.state -> 'r' -> 'show' end sh) q
     where e.owner_id = v_uid and e.status = 'active'
       and (e.kind = 'puppeteer' or (e.kind = 'shard' and e.state -> 'reflect' ->> 'kind' = 'puppeteer'))
       and (coalesce((q.sh ->> 'on')::boolean, false) or exists (select 1 from public.puppet_runs r where r.enchant_id = e.id and (r.finished_at is null or r.finished_at > now() - interval '3 minutes')))), '[]'::jsonb));
end $$;
grant execute on function public.puppet_live() to authenticated;

-- ---- the Puppeteer's actions: reflections too; a new playlist keeps the string in hand ------------------------------
select private.fn_patch('private.ench_act_puppeteer(public.enchantments,text,jsonb,timestamptz)',
  $a$  if (select kind from public.enchantments where id = e.id) <> 'puppeteer' then raise exception 'mirror_cannot' using errcode = 'P0001'; end if;
$a$, '');
select private.fn_patch('private.ench_act_puppeteer(public.enchantments,text,jsonb,timestamptz)',
  $a$        'cursor', '[0, 1]'::jsonb, 'since', extract(epoch from now()))) where id = e.id;$a$,
  $b$        'cursor', coalesce(state -> 'show' -> 'cursor', '[0, 1]'::jsonb), 'str', coalesce(state -> 'show' -> 'str', '[null, null]'::jsonb),
        'since', coalesce((state -> 'show' ->> 'since')::numeric, extract(epoch from now())))) where id = e.id;$b$);
select private.fn_patch('private.ench_act_puppeteer(public.enchantments,text,jsonb,timestamptz)',
  $a$      v_tick := private.pup_show_tick(e.id);$a$, $b$      v_tick := private.pup_show_tick_in(e.id, e.stars);$b$);
select private.fn_patch('private.ench_act_puppeteer(public.enchantments,text,jsonb,timestamptz)',
  $a$      r := private.pup_show_tick(e.id);$a$, $b$      r := private.pup_show_tick_in(e.id, e.stars);$b$);
-- (a Shard reflecting a Puppeteer: its actions go through)
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$      when 'sun' then private.ench_act_sun(x, p_action, a, t) end;$a$,
  $b$      when 'sun' then private.ench_act_sun(x, p_action, a, t) when 'puppeteer' then private.ench_act_puppeteer(x, p_action, a, t) end;$b$);

-- ---- the words -------------------------------------------------------------------------------------------------------
select private.fn_patch('private.ench_star_powers(text)',
  $a${"name": "Grand Show", "emoji": "🎪", "text": "Once a day, a three-act medley: three free acts that pay ×3 (in a show, the day’s first three)."}$a$,
  $b${"name": "Grand Show", "emoji": "🎪", "text": "Once a day, a Grand Show: the day’s first string is free, and its first three levels pay ×3."}$b$);
select private.fn_patch('private.ench_star_powers(text)',
  $a${"name": "Troupe", "emoji": "🎭", "text": "Two more strings, and two puppets perform at once in a show."}$a$,
  $b${"name": "Troupe", "emoji": "🎭", "text": "Two puppets perform at once, each on its own string."}$b$);
select private.fn_patch('private.ench_star_powers(text)',
  $a${"name": "Second String", "emoji": "🧵", "text": "Strings come back twice as fast (2 an hour)."}$a$,
  $b${"name": "Second String", "emoji": "🧵", "text": "Strings come back twice as fast (one every half hour)."}$b$);

-- ---- everyone's strings: the new cap, topped up once ----------------------------------------------------------------
-- (every Puppeteer is given a full ten to start the new strings with)
update public.enchantments set state = state || jsonb_build_object('strings', 10, 'string_at', extract(epoch from now())), updated_at = now()
 where kind = 'puppeteer' and status = 'active';
