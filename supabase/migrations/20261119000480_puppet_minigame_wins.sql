-- 🎭 The Puppeteer brings in that minigame's wins.
--
-- The owner (Nov 17, 2026): "puppeteer doesn't give any ink per string or minigame win and doesn't say it in the live
-- feed either. make it so the puppet brings in that specific minigame's wins. so if it's played on a ultra plot the ink
-- multiplier applies."
--
--   · A level the puppet clears now pays as a win of that plot's minigame: the same sum a cleared level pays you by
--     hand (private.minigame_win_ink, the formula in svc_finish_minigame): the level's Ink and each round's Ink, × the
--     plot's level and rarity (an ultra's Ink multiplier on your own plots, as by hand), × a live boost on the game,
--     × the game's and everyone's Ink multipliers. Then the Puppeteer's cut (75%, all of it at ★5; ×3/×5 Grand Show) and
--     its own level and star bonus.
--   · It's paid as minigame Ink (reason 'minigame', ref 'puppet_run'): the same Ink Flow as your wins, and the Earning
--     switches for that minigame (minigame:<id>), for minigames, and for the Puppeteer (ench:puppeteer / ench:shard)
--     all apply. A puppet's win never uses up your own daily paid wins, and one-shot buffs (Golden Hour…) are left
--     for your own play.
--   · The live feed: "@you's 🎭 puppet cleared Paint Pop level 12 · +840 Ink" (like a win by hand: at most one minigame
--     line every 3 minutes each, and the privacy setting for minigames hides it).
--   · Each curtain call keeps what the win was worth and what multiplied it; when the Ink is paused right now (an
--     Earning switch, or the player's Ink held), it says so instead of a silent +0.
-- Settings, as before: game_config 'enchantments' → puppeteer.auto_pay (0.75), pay_x, level_pay_x, star_pay.

/** what a cleared level of a minigame pays its player on a plot, before Ink Flow: the formula in svc_finish_minigame
 *  (level Ink + each cleared round's Ink, × plot level and rarity on their own plot, × a live boost, × the game's and
 *  everyone's Ink multipliers; the Earning switches for those multipliers apply). Performance bonuses, the daily paid
 *  wins and enchantments' one-shot buffs belong to play by hand and aren't in it. */
create or replace function private.minigame_win_ink(p_uid uuid, p_game text, p_level int, p_cleared int, p_rounds int, p_gx int, p_gy int) returns jsonb
language plpgsql stable as $$
declare v_cfg jsonb := private.cfg('minigames'); v_game jsonb; v_tab jsonb; v_pl int; v_rm numeric; v_rarity text; v_mult numeric; v_boost numeric := 1;
  v_lvl numeric := 0; v_rnd numeric := 0; v_x numeric; k int;
begin
  v_game := coalesce(v_cfg -> 'games' -> p_game, '{}'::jsonb);
  v_tab := v_game -> 'level_ink';
  if coalesce(p_cleared, 0) >= greatest(coalesce(p_rounds, 1), 1) and jsonb_typeof(v_tab) = 'array' and jsonb_array_length(v_tab) > 0 then
    v_lvl := greatest(coalesce((v_tab ->> (least(greatest(p_level, 1), jsonb_array_length(v_tab)) - 1))::numeric, 0), 0);
  end if;
  if jsonb_typeof(v_game -> 'round_ink') = 'array' then
    for k in 1 .. least(greatest(coalesce(p_cleared, 0), 0), 10) loop v_rnd := v_rnd + greatest(coalesce((v_game -> 'round_ink' ->> (k - 1))::numeric, 0), 0); end loop;
  end if;
  select coalesce(wp.level, 1), coalesce(r.ink_reward_multiplier, 1), wp.rarity into v_pl, v_rm, v_rarity
    from public.world_plots wp left join public.plot_rarities r on r.id = wp.rarity where wp.gx = p_gx and wp.gy = p_gy and wp.owner_id = p_uid;
  if private.earn_any_off() then
    if private.earn_off(array['mult:rarity', 'mult:rarity:' || coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy), '')]) then v_rm := 1; end if;
    if private.earn_off(array['mult:plot_level']) then v_pl := 1; end if;
  end if;
  v_mult := (1 + coalesce((v_game ->> 'plot_level_bonus')::numeric, (v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_pl, 1) - 1)) * coalesce(v_rm, 1);
  if v_game ? 'boost' and coalesce((v_game -> 'boost' ->> 'multiplier')::numeric, 1) > 1
     and (v_game -> 'boost' ->> 'ends_at' is null or (v_game -> 'boost' ->> 'ends_at')::timestamptz > now()) then
    v_boost := least((v_game -> 'boost' ->> 'multiplier')::numeric, 50);
  end if;
  if private.earn_any_off() and private.earn_off(array['mult:boost']) then v_boost := 1; end if;
  v_x := v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0) * greatest(coalesce((v_game ->> 'ink_multiplier')::numeric, 1), 0) * v_boost;
  return jsonb_build_object('ink', floor((v_lvl + v_rnd) * v_x), 'level_ink', floor(v_lvl * v_x), 'round_ink', floor(v_rnd * v_x),
    'multiplier', round(v_x, 3), 'rarity', coalesce(v_rm, 1), 'rarity_id', v_rarity, 'plot_level', coalesce(v_pl, 1), 'boost', v_boost);
end $$;
revoke all on function private.minigame_win_ink(uuid, text, int, int, int, int, int) from public, anon, authenticated;

-- the old helper now asks the same question (kept for anything that still calls it)
create or replace function private.pup_level_ink(p_game text, p_level int, p_rounds int, p_gx int, p_gy int, p_uid uuid) returns numeric language sql stable as $$
  select (private.minigame_win_ink(p_uid, p_game, p_level, p_rounds, p_rounds, p_gx, p_gy) ->> 'ink')::numeric
$$;

-- ---- the Earning switches know a puppet's win: its minigame, and the enchantment that played it ----------------------
select private.fn_patch('private.earn_keys(text,text,text)',
  $a$    elsif p_reason = 'minigame' and p_ref_type = 'home_game' then$a$,
  $b$    elsif p_reason = 'minigame' and p_ref_type = 'puppet_run' and private.is_uuid(p_ref_id) then
      select pr.game, e.kind into v_game, v_kind from public.puppet_runs pr left join public.enchantments e on e.id = pr.enchant_id where pr.id = p_ref_id::uuid;
      if v_game is not null then k := k || ('minigame:' || v_game); end if;
      if v_kind is not null then k := k || ('ench:' || v_kind); end if;
    elsif p_reason = 'minigame' and p_ref_type = 'home_game' then$b$);

-- ---- the curtain falls ------------------------------------------------------------------------------------------------
create or replace function private.pup_run_finish(p_run uuid) returns jsonb language plpgsql as $$
declare r public.puppet_runs; e public.enchantments; v_ink numeric := 0; v_paid int := 0; v_tip int; v_owner uuid; v_rep jsonb; v_res jsonb; v_x numeric;
  v_win jsonb; v_stars int; v_held text; v_passed boolean; v_name text;
begin
  select * into r from public.puppet_runs where id = p_run for update;
  if r.id is null or r.finished_at is not null then return null; end if;
  select * into e from public.enchantments where id = r.enchant_id;
  select owner_id into v_owner from public.world_plots where gx = r.gx and gy = r.gy;
  v_passed := coalesce((r.plan ->> 'passed')::boolean, false);
  if e.id is not null and e.status = 'active' and v_passed then
    v_stars := coalesce((r.plan ->> 'stars')::int, e.stars, 0);
    -- what this level pays as a win of this plot's minigame (an ultra's multiplier and all, on your own plots)
    v_win := private.minigame_win_ink(e.owner_id, r.game, r.level, r.rounds, r.rounds, r.gx, r.gy);
    -- the puppet's cut, the Grand Show, and the Puppeteer's own level and stars
    v_x := case when v_stars >= 5 then 1 else private.ench_n('puppeteer', 'auto_pay', 0.75) end
         * case when r.grand then case when v_stars >= 5 then 5 else 3 end else 1 end
         * greatest(private.ench_n('puppeteer', 'pay_x', 1), 0)
         * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * private.ench_n('puppeteer', 'level_pay_x', 1) * greatest(coalesce(e.level, 1) - 1, 0))
         * (1 + private.ench_n('puppeteer', 'star_pay', 0.1) * v_stars);
    v_ink := floor(coalesce((v_win ->> 'ink')::numeric, 0) * v_x);
    if v_ink > 0 then
      -- paid as that minigame's Ink: Ink Flow and the Earning switches as for a win by hand
      if private.ink_mode(e.owner_id) = 'off' then v_held := 'ink_held';
      elsif private.earn_any_off() and private.earn_hit(private.earn_keys('minigame', 'puppet_run', r.id::text)) is not null then v_held := 'paused';
      end if;
      v_paid := private.grant_ink_paced(e.owner_id, least(v_ink, 2147483647)::int, 'minigame', 'puppet_run', r.id::text, 'puppet:' || r.id::text);
      if v_paid > 0 then perform private.ench_stat(e.id, 'ink', v_paid); perform private.ench_xp(e.id, 1); end if;
    end if;
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
    -- the live feed, like a win by hand (at most one minigame line every few minutes each; privacy hides it)
    if v_paid > 0 and not exists (select 1 from public.feed_events f where f.player_id = e.owner_id and f.kind = 'minigame' and f.created_at > now() - interval '3 minutes') then
      insert into public.feed_events (kind, player_id, data)
      values ('minigame', e.owner_id, jsonb_build_object('game', r.game, 'level', r.level, 'stars', 0, 'puppet', true, 'ink', v_paid,
        'rarity', case when coalesce((v_win ->> 'rarity')::numeric, 1) > 1 then v_win ->> 'rarity_id' end,
        'owner', case when not r.own then (select username from public.profiles where id = v_owner) end));
    end if;
  end if;
  -- someone else's plot: they're tipped (and told, at most once an hour)
  if e.id is not null and v_owner is not null and v_owner <> r.player_id then
    v_tip := greatest(2, round(coalesce(nullif(v_paid, 0), v_ink) * 0.1))::int;
    if v_passed then perform private.grant_ink_paced(v_owner, v_tip, 'enchantment', 'puppet_tip', e.id::text, null); else v_tip := null; end if;
    if not exists (select 1 from public.player_notifications n where n.player_id = v_owner and n.data ->> 'sub' = 'puppet_auto' and n.created_at > now() - interval '1 hour') then
      perform private.notify(v_owner, 'enchant', r.player_id, jsonb_build_object('sub', 'puppet_auto', 'kind', 'puppeteer', 'gx', r.gx, 'gy', r.gy, 'game', r.game,
        'level', r.level, 'passed', v_passed, 'ink', v_tip));
    end if;
  end if;
  if e.id is not null then
    v_rep := coalesce(e.stats -> 'repertoire', '{}'::jsonb);
    v_rep := v_rep || jsonb_build_object(r.game, greatest(coalesce((v_rep ->> r.game)::int, 0), coalesce((r.plan ->> 'score')::int, 0)));
    update public.enchantments set stats = stats || jsonb_build_object('repertoire', v_rep, 'shows', coalesce((stats ->> 'shows')::int, 0) + 1,
        'wins', coalesce((stats ->> 'wins')::int, 0) + case when v_passed then 1 else 0 end,
        'auto_levels', coalesce((stats ->> 'auto_levels')::int, 0) + case when v_passed then 1 else 0 end,
        'auto_ink', coalesce((stats ->> 'auto_ink')::numeric, 0) + v_paid,
        'best_auto', greatest(coalesce((stats ->> 'best_auto')::int, 0), case when v_passed then r.level else 0 end)) where id = e.id;
    if v_passed then perform private.ench_xp(e.id, 1); end if;
    v_name := case when not r.own then (select username from public.profiles where id = v_owner) end;
    perform private.ench_event(e.id, 'auto_show', jsonb_build_object('game', r.game, 'level', r.level, 'passed', v_passed,
      'rounds', r.rounds, 'cleared', (r.plan ->> 'rounds_passed')::int, 'ink', v_paid, 'win', v_win -> 'ink', 'mult', v_win -> 'multiplier',
      'rarity', v_win -> 'rarity', 'held', v_held, 'tip', v_tip, 'own', r.own, 'grand', r.grand, 'owner', v_name));
  end if;
  v_res := jsonb_build_object('passed', v_passed, 'cleared', (r.plan ->> 'rounds_passed')::int, 'rounds', r.rounds, 'level', r.level,
                              'ink', v_paid, 'tip', v_tip, 'grand', r.grand,
                              'win', coalesce((v_win ->> 'ink')::numeric, 0), 'mult', v_win -> 'multiplier', 'rarity', v_win -> 'rarity',
                              'rarity_id', v_win ->> 'rarity_id', 'held', v_held);
  update public.puppet_runs set finished_at = now(), result = v_res where id = r.id;
  return v_res;
end $$;
