-- Enchantments, part 7: the last three of the twenty.
--
--  🎭 Puppeteer   tie a string to anyone else's plot (within 5 km of your explorer or your plots) and play its minigame.
--                 A string comes back every hour; they bank (2, 3 at level 5, 4 at level 10). The run pays like your own
--                 games (graded by the server, paced by Ink Flow); the owner gets a tip and a note. You climb your own
--                 levels on their plot, so the owner loses nothing. Trait: Strings (+15% Ink; once a day a reward is
--                 played twice by a puppet).
--  🃏 Fated Deck  once a day, three cards lie face down: flip one of the 22 major cards. Upright or reversed (a twist),
--                 each shapes your day — Ink, Luck, wins that pay double, enchantments that glow, a Leviathan you hit
--                 harder, a plot reborn as another kind, a ticket. Every card goes into your deck; gilded ones are rare;
--                 all 22 bring an Epic+ ticket. Trait: Fated (1 in 10 rewards draws a card: ×2 to ×5).
--  ✍️ Glyphcaster trace a glyph with your finger to cast it (the neater, the stronger — within a cap). Mana refills
--                 through the day. 24 glyphs, 4 of them secret; you start with 3 and find the rest as you cast and study.
--                 The Spellbook shows every one you've found: its shape, what it does, its cost, your best, its mastery.
--                 Trait: Inscribed (every 4th reward is inscribed: ×1.75).

alter table public.enchantments drop constraint if exists enchantments_kind_check;
alter table public.enchantments add constraint enchantments_kind_check
  check (kind in ('goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
                  'ouroboros', 'homunculus', 'stormcoil', 'spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph'));
update public.game_config set value = jsonb_set(value, '{weights}', '{"puppeteer": 1, "deck": 1, "glyph": 1}'::jsonb || coalesce(value -> 'weights', '{}'::jsonb))
 where key = 'enchantments';
alter table public.minigame_sessions add column if not exists puppet_id uuid;

create or replace function private.ench_hatchable() returns text[] language sql immutable as $$
  select array['spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph']
$$;

-- ---- 🎭 Puppeteer ---------------------------------------------------------------------------------------------------------
create or replace function private.pup_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t);
  v_max int := 2 + case when e.level >= 5 then 1 else 0 end + case when e.level >= 10 then 1 else 0 end;
  v_per numeric := private.ench_n('puppeteer', 'recharge_m', 60) * 60 * case when e.stars >= 1 then 0.5 else 1 end;
  v_n int := coalesce((s ->> 'strings')::int, v_max); v_at numeric := coalesce((s ->> 'string_at')::numeric, v_now); v_gain int;
begin
  if v_n < v_max then
    v_gain := floor(greatest(0, v_now - v_at) / v_per)::int;
    if v_gain > 0 then v_n := least(v_max, v_n + v_gain); v_at := v_at + v_gain * v_per; end if;
  end if;
  if v_n >= v_max then v_n := least(v_n, v_max); v_at := v_now; end if;
  return jsonb_build_object('strings', v_n, 'max', v_max, 'string_at', v_at, 'recharge_s', round(v_per),
    'next_in', case when v_n < v_max then greatest(0, round(v_at + v_per - v_now)) end,
    'range_m', case when e.stars >= 2 then null else private.ench_n('puppeteer', 'range_m', 5000) end,
    'grand_ready', e.stars >= 3 and coalesce(s ->> 'grand_day', '') <> private.today()::text);
end $$;

-- can this plot be played on strings? (null = yes)
create or replace function private.pup_why_not(e public.enchantments, p public.world_plots) returns text language plpgsql stable as $$
declare g jsonb;
begin
  if p.gx is null or p.owner_id is null then return 'not_found'; end if;
  if p.owner_id = e.owner_id then return 'your_own_plot'; end if;
  if p.locked or p.folded_at is not null then return 'plot_unavailable'; end if;
  if exists (select 1 from public.player_blocks where (blocker_id = p.owner_id and blocked_id = e.owner_id) or (blocker_id = e.owner_id and blocked_id = p.owner_id)) then return 'blocked'; end if;
  if not exists (select 1 from public.plot_types t where t.id = p.plot_type and t.minigame is not null) then return 'no_minigame'; end if;
  g := private.pup_eval(e, private.ench_now(e));
  if g ->> 'range_m' is not null and not private.spy_in_range(e.owner_id, p.gx, p.gy, (g ->> 'range_m')::numeric) then return 'out_of_range'; end if;
  return null;
end $$;

-- start a run on someone else's plot: a string is used, a real session made (finished like any other)
create or replace function public.puppet_start(p_id uuid, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.enchantments; p public.world_plots; g jsonb; v_why text; v_game text; v_game_cfg jsonb;
  v_highest int; v_max int; v_rounds int; v_seed bigint; v_expires timestamptz; v_id uuid; v_cfg jsonb := private.cfg('minigames'); v_grand boolean := false;
begin
  perform private.rate_limit('minigame_start', 180, 3600);
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null or e.owner_id is distinct from v_uid or e.status <> 'active' or e.kind <> 'puppeteer' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  g := private.pup_eval(e, private.ench_now(e));
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  v_why := private.pup_why_not(e, p);
  if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
  if (g ->> 'strings')::int < 1 then raise exception 'no_strings' using errcode = 'P0001'; end if;
  select minigame into v_game from public.plot_types where id = p.plot_type;
  v_game_cfg := coalesce(v_cfg -> 'games' -> v_game, '{}'::jsonb);
  if not coalesce((v_game_cfg ->> 'enabled')::boolean, false) then raise exception 'minigame_unavailable' using errcode = 'P0001'; end if;
  -- your own climb on their plot
  select coalesce(max(highest_level), 0) into v_highest from public.plot_game_progress where gx = p_gx and gy = p_gy and player_id = v_uid;
  v_max := greatest(1, least(coalesce((v_game_cfg ->> 'max_level')::int, (v_cfg ->> 'max_level')::int, 60), 500));
  if v_highest >= v_max then raise exception 'plot_maxed' using errcode = 'P0001'; end if;
  v_rounds := greatest(1, least(coalesce((v_game_cfg ->> 'rounds')::int, 5), 10));
  update public.minigame_sessions set status = 'abandoned', finished_at = now() where player_id = v_uid and game = v_game and status = 'active';
  v_seed := floor(random() * 2147483646)::bigint + 1;
  v_expires := now() + make_interval(mins => coalesce((v_cfg ->> 'session_minutes')::int, 20) + v_rounds * 2);
  insert into public.minigame_sessions (player_id, game, level, seed, gx, gy, expires_at, rounds, puppet_id)
  values (v_uid, v_game, v_highest + 1, v_seed, p_gx, p_gy, v_expires, v_rounds, e.id)
  returning id into v_id;
  -- ★3 Grand Show: once a day, a run pays ×3
  if (g ->> 'grand_ready')::boolean then
    v_grand := true;
    insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, uses, data, expires_at)
    values (v_uid, 'grand_show', p_gx, p_gy, e.id, 3, 1, jsonb_build_object('session', v_id), v_expires + interval '5 minutes');
  end if;
  update public.enchantments set state = state || jsonb_build_object('strings', (g ->> 'strings')::int - 1, 'string_at', (g ->> 'string_at')::numeric)
                                               || case when v_grand then jsonb_build_object('grand_day', private.today()::text) else '{}'::jsonb end,
         updated_at = now()
   where id = e.id;
  perform private.ench_event(e.id, 'strung', jsonb_build_object('gx', p_gx, 'gy', p_gy, 'game', v_game, 'owner', (select username from public.profiles where id = p.owner_id), 'grand', v_grand));
  return jsonb_build_object('session_id', v_id, 'game', v_game, 'level', v_highest + 1, 'seed', v_seed, 'rounds', v_rounds,
                            'plot_level', p.level, 'plot_highest_level', v_highest, 'max_level', v_max,
                            'started_at', now(), 'expires_at', v_expires, 'server_time', now(),
                            'puppet', jsonb_build_object('id', e.id, 'owner', private.profile_json(p.owner_id), 'rarity', p.rarity, 'name', p.name, 'grand', v_grand));
end $$;

-- a puppet run is finished: the owner is tipped, the Puppeteer paid, the show remembered
create or replace function private.puppet_done(p_session uuid, p_ink int, p_passed boolean, p_score int) returns void language plpgsql as $$
declare s public.minigame_sessions; e public.enchantments; v_owner uuid; v_tip int; v_rep jsonb;
begin
  select * into s from public.minigame_sessions where id = p_session;
  select * into e from public.enchantments where id = s.puppet_id and status = 'active';
  if s.id is null or e.id is null then return; end if;
  select owner_id into v_owner from public.world_plots where gx = s.gx and gy = s.gy;
  if v_owner is not null and v_owner <> s.player_id then
    v_tip := greatest(2, round(coalesce(p_ink, 0) * 0.1))::int;
    perform private.grant_ink_paced(v_owner, v_tip, 'enchantment', 'puppet_tip', e.id::text, null);
    perform private.notify(v_owner, 'enchant', s.player_id, jsonb_build_object('sub', 'puppet_played', 'kind', 'puppeteer', 'gx', s.gx, 'gy', s.gy, 'ink', v_tip, 'game', s.game, 'passed', p_passed));
  end if;
  v_rep := coalesce(e.stats -> 'repertoire', '{}'::jsonb);
  v_rep := v_rep || jsonb_build_object(s.game, greatest(coalesce((v_rep ->> s.game)::int, 0), coalesce(p_score, 0)));
  update public.enchantments set stats = stats || jsonb_build_object('repertoire', v_rep, 'shows', coalesce((stats ->> 'shows')::int, 0) + 1,
                                                                      'wins', coalesce((stats ->> 'wins')::int, 0) + case when p_passed then 1 else 0 end)
   where id = e.id;
  if p_passed then perform private.ench_pay(e.id, 8 + round(coalesce(p_ink, 0) * 0.25), 'a puppet show on @' || coalesce((select username from public.profiles where id = v_owner), 'someone') || '’s plot'); end if;
  perform private.ench_event(e.id, 'show', jsonb_build_object('game', s.game, 'level', s.level, 'passed', p_passed, 'score', p_score, 'ink', p_ink, 'tip', v_tip));
end $$;

create or replace function private.ench_act_puppeteer(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
begin
  -- the strings are pulled from the game screen (public.puppet_start)
  raise exception 'invalid_action' using errcode = 'P0001';
end $$;

create or replace function private.ench_view_puppeteer(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.pup_eval(e, t); c record; v_near jsonb; v_cx int; v_cy int; v_cells int; v_shows jsonb;
begin
  select * into c from private.explorer_now(e.owner_id);
  v_cx := coalesce(c.gx, e.gx); v_cy := coalesce(c.gy, e.gy);
  v_cells := ceil(coalesce((g ->> 'range_m')::numeric, 5000) / 3)::int;
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_near from (
    select jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'plot_type', w.plot_type, 'name', w.name, 'owner_name', pr.username,
             'game', t2.minigame, 'm', round(private.ench_cell_m(v_cx, v_cy, w.gx, w.gy))) j
      from public.world_plots w join public.plot_types t2 on t2.id = w.plot_type left join public.profiles pr on pr.id = w.owner_id
     where w.owner_id is not null and w.owner_id <> e.owner_id and not w.locked and w.folded_at is null and t2.minigame is not null
       and w.gx between v_cx - v_cells and v_cx + v_cells and w.gy between v_cy - v_cells and v_cy + v_cells
       and not exists (select 1 from public.player_blocks b where (b.blocker_id = w.owner_id and b.blocked_id = e.owner_id) or (b.blocker_id = e.owner_id and b.blocked_id = w.owner_id))
     order by (w.gx - v_cx) * (w.gx - v_cx) + (w.gy - v_cy) * (w.gy - v_cy) limit 60) x;
  select coalesce(jsonb_agg(ev.data || jsonb_build_object('at', ev.created_at) order by ev.id desc), '[]'::jsonb) into v_shows from (
    select * from public.enchant_events where enchant_id = e.id and kind = 'show' order by id desc limit 8) ev;
  return g || jsonb_build_object('nearby', v_near, 'repertoire', coalesce(e.stats -> 'repertoire', '{}'::jsonb), 'shows', v_shows,
    'shows_total', coalesce((e.stats ->> 'shows')::int, 0), 'wins_total', coalesce((e.stats ->> 'wins')::int, 0),
    'explorer', case when c.gx is not null then jsonb_build_array(c.gx, c.gy) end,
    'attention', case when (g ->> 'strings')::int > 0 then 'A string is ready — play someone’s plot' end);
end $$;

-- ---- 🃏 Fated Deck --------------------------------------------------------------------------------------------------------
-- the 22 cards: what each does upright and reversed (the twist)
create or replace function private.deck_cards() returns jsonb language sql immutable as $$
  select '[
    {"id": "fool", "n": 0, "name": "The Fool", "w": 1, "up": [{"t": "ink", "v": 40}, {"t": "luck", "v": 5}], "rev": [{"t": "coin", "v": 150}]},
    {"id": "magician", "n": 1, "name": "The Magician", "w": 1, "up": [{"t": "wins", "m": 2, "u": 3}], "rev": [{"t": "wins", "m": 1.5, "u": 5}]},
    {"id": "priestess", "n": 2, "name": "The High Priestess", "w": 1, "up": [{"t": "eluck", "v": 1}], "rev": [{"t": "luck", "v": 12}]},
    {"id": "empress", "n": 3, "name": "The Empress", "w": 1, "up": [{"t": "glow", "m": 1.25, "h": 8}], "rev": [{"t": "glow", "m": 1.5, "h": 2}]},
    {"id": "emperor", "n": 4, "name": "The Emperor", "w": 1, "up": [{"t": "ink", "v": 80}], "rev": [{"t": "ink", "v": 30}, {"t": "luck", "v": 8}]},
    {"id": "hierophant", "n": 5, "name": "The Hierophant", "w": 1, "up": [{"t": "luck", "v": 10}], "rev": [{"t": "eluck", "v": 1}, {"t": "glow", "m": 0.9, "h": 4}]},
    {"id": "lovers", "n": 6, "name": "The Lovers", "w": 1, "up": [{"t": "ink", "v": 50}, {"t": "luck", "v": 5}], "rev": [{"t": "coin", "v": 120}, {"t": "luck", "v": 3}]},
    {"id": "chariot", "n": 7, "name": "The Chariot", "w": 1, "up": [{"t": "wins", "m": 1.5, "u": 6}], "rev": [{"t": "wins", "m": 2, "u": 2}]},
    {"id": "strength", "n": 8, "name": "Strength", "w": 1, "up": [{"t": "lev", "m": 2, "h": 24}], "rev": [{"t": "lev", "m": 3, "h": 2}]},
    {"id": "hermit", "n": 9, "name": "The Hermit", "w": 1, "up": [{"t": "luck", "v": 15}], "rev": [{"t": "ink", "v": 60}]},
    {"id": "wheel", "n": 10, "name": "Wheel of Fortune", "w": 1, "up": [{"t": "luck", "v": 20}], "rev": [{"t": "coinluck", "v": 40, "lo": 5}]},
    {"id": "justice", "n": 11, "name": "Justice", "w": 1, "up": [{"t": "plots", "v": 10, "cap": 120}], "rev": [{"t": "plots", "v": 5, "cap": 60}, {"t": "luck", "v": 5}]},
    {"id": "hanged", "n": 12, "name": "The Hanged One", "w": 1, "up": [{"t": "glow", "m": 1.4, "h": 4}], "rev": [{"t": "glow", "m": 1.15, "h": 12}]},
    {"id": "rebirth", "n": 13, "name": "Rebirth", "w": 1, "up": [{"t": "rebirth", "v": 1}], "rev": [{"t": "rebirth", "v": 1}, {"t": "luck", "v": 5}]},
    {"id": "temperance", "n": 14, "name": "Temperance", "w": 1, "up": [{"t": "wins", "m": 1.3, "u": 10}], "rev": [{"t": "ink", "v": 70}]},
    {"id": "devil", "n": 15, "name": "The Devil", "w": 1, "up": [{"t": "glow", "m": 1.6, "h": 3}, {"t": "luck", "v": -10}], "rev": [{"t": "luck", "v": 25}, {"t": "glow", "m": 0.85, "h": 4}]},
    {"id": "tower", "n": 16, "name": "The Tower", "w": 1, "up": [{"t": "lev", "m": 3, "h": 24}], "rev": [{"t": "lev", "m": 5, "h": 1}]},
    {"id": "star", "n": 17, "name": "The Star", "w": 1, "up": [{"t": "luck", "v": 15}], "rev": [{"t": "eluck", "v": 2}]},
    {"id": "moon", "n": 18, "name": "The Moon", "w": 1, "up": [{"t": "ticket", "r": "rare"}], "rev": [{"t": "cointicket", "r": "epic", "p": 0.25, "lo": 6}]},
    {"id": "sun", "n": 19, "name": "The Sun", "w": 1, "up": [{"t": "glow", "m": 1.25, "h": 24}], "rev": [{"t": "glow", "m": 1.5, "h": 6}]},
    {"id": "judgement", "n": 20, "name": "Judgement", "w": 1, "up": [{"t": "ink", "v": 100}], "rev": [{"t": "wins", "m": 2, "u": 5}]},
    {"id": "world", "n": 21, "name": "The World", "w": 0.5, "up": [{"t": "ticket", "r": "rare"}, {"t": "ink", "v": 60}], "rev": [{"t": "cointicket", "r": "epic", "p": 0.3, "lo": 100}]}
  ]'::jsonb
$$;
create or replace function private.deck_card(p_id text) returns jsonb language sql immutable as $$
  select c from jsonb_array_elements(private.deck_cards()) c where c ->> 'id' = p_id
$$;
create or replace function private.deck_pick() returns text language plpgsql volatile as $$
declare v_tot numeric; v_r numeric; v_acc numeric := 0; c jsonb;
begin
  select sum((x ->> 'w')::numeric) into v_tot from jsonb_array_elements(private.deck_cards()) x;
  v_r := random() * v_tot;
  for c in select x from jsonb_array_elements(private.deck_cards()) x loop
    v_acc := v_acc + (c ->> 'w')::numeric;
    if v_r < v_acc then return c ->> 'id'; end if;
  end loop;
  return 'fool';
end $$;

-- a card comes true: each of its effects, for real
create or replace function private.deck_apply(e public.enchantments, p_card text, p_up boolean, p_foil boolean) returns jsonb language plpgsql as $$
declare c jsonb := private.deck_card(p_card); x jsonb; v_out jsonb := '[]'::jsonb; v_pay jsonb; v_n int; v_lk jsonb; v_ok boolean; v_f numeric := case when p_foil then 1.5 else 1 end;
begin
  for x in select y from jsonb_array_elements(c -> case when p_up then 'up' else 'rev' end) y loop
    case x ->> 't'
      when 'ink' then
        v_pay := private.ench_pay(e.id, (x ->> 'v')::numeric * v_f, c ->> 'name' || case when p_up then '' else ' (reversed)' end);
        v_out := v_out || jsonb_build_object('t', 'ink', 'v', v_pay -> 'paid', 'pay', v_pay);
      when 'coin' then
        v_ok := random() < 0.5;
        if v_ok then v_pay := private.ench_pay(e.id, (x ->> 'v')::numeric * v_f, c ->> 'name' || ' (reversed): the coin came up'); end if;
        v_out := v_out || jsonb_build_object('t', 'coin', 'won', v_ok, 'v', coalesce(v_pay -> 'paid', '0'::jsonb), 'pay', v_pay);
      when 'plots' then
        select count(*) into v_n from public.world_plots where owner_id = e.owner_id;
        v_pay := private.ench_pay(e.id, least((x ->> 'cap')::numeric, v_n * (x ->> 'v')::numeric) * v_f, c ->> 'name' || ': ' || v_n || ' plots');
        v_out := v_out || jsonb_build_object('t', 'ink', 'v', v_pay -> 'paid', 'pay', v_pay);
      when 'luck' then
        if (x ->> 'v')::int >= 0 then v_lk := private.ench_give_luck(e.owner_id, ceil((x ->> 'v')::numeric * v_f)::int, 0);
        else update public.player_luck set luck = greatest(0, luck + (x ->> 'v')::int), updated_at = now() where player_id = e.owner_id; end if;
        v_out := v_out || jsonb_build_object('t', 'luck', 'v', case when (x ->> 'v')::int >= 0 then ceil((x ->> 'v')::numeric * v_f) else (x ->> 'v')::int end);
      when 'coinluck' then
        v_ok := random() < 0.5;
        v_lk := private.ench_give_luck(e.owner_id, case when v_ok then (x ->> 'v')::int else (x ->> 'lo')::int end, 0);
        v_out := v_out || jsonb_build_object('t', 'luck', 'won', v_ok, 'v', case when v_ok then (x ->> 'v')::int else (x ->> 'lo')::int end);
      when 'eluck' then
        v_lk := private.ench_give_luck(e.owner_id, 0, (x ->> 'v')::int);
        v_out := v_out || jsonb_build_object('t', 'eluck', 'v', (x ->> 'v')::int);
      when 'wins' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, uses, data, expires_at)
        values (e.owner_id, 'golden_hour', e.id, (x ->> 'm')::numeric, (x ->> 'u')::int, jsonb_build_object('by', 'deck', 'card', p_card), now() + interval '24 hours');
        v_out := v_out || jsonb_build_object('t', 'wins', 'm', (x ->> 'm')::numeric, 'u', (x ->> 'u')::int);
      when 'glow' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'glow', e.id, (x ->> 'm')::numeric, jsonb_build_object('by', 'deck', 'card', p_card, 'name', c ->> 'name'), now() + make_interval(hours => (x ->> 'h')::int));
        v_out := v_out || jsonb_build_object('t', 'glow', 'm', (x ->> 'm')::numeric, 'h', (x ->> 'h')::int);
      when 'lev' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'fate_tower', e.id, (x ->> 'm')::numeric, jsonb_build_object('card', p_card), now() + make_interval(hours => (x ->> 'h')::int));
        v_out := v_out || jsonb_build_object('t', 'lev', 'm', (x ->> 'm')::numeric, 'h', (x ->> 'h')::int);
      when 'ticket' then
        perform private.ench_ticket(e.owner_id, x ->> 'r', 'deck');
        v_out := v_out || jsonb_build_object('t', 'ticket', 'r', x ->> 'r');
      when 'cointicket' then
        v_ok := random() < (x ->> 'p')::numeric;
        if v_ok then perform private.ench_ticket(e.owner_id, x ->> 'r', 'deck');
        else v_pay := private.ench_pay(e.id, (x ->> 'lo')::numeric, c ->> 'name' || ' (reversed)'); end if;
        v_out := v_out || jsonb_build_object('t', 'ticket', 'r', x ->> 'r', 'won', v_ok, 'pay', v_pay);
      when 'rebirth' then
        update public.enchantments set state = state || jsonb_build_object('rebirth', coalesce((state ->> 'rebirth')::int, 0) + (x ->> 'v')::int) where id = e.id;
        v_out := v_out || jsonb_build_object('t', 'rebirth', 'v', (x ->> 'v')::int);
      else null;
    end case;
  end loop;
  return v_out;
end $$;

create or replace function private.deck_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_day text := private.today()::text; v_new boolean := coalesce(s ->> 'day', '') <> v_day;
  v_picks int := 1 + case when e.level >= 4 then 1 else 0 end; v_week text := to_char(now(), 'IYYY-IW');
begin
  return jsonb_build_object('day', v_day, 'cards', 3 + case when e.stars >= 1 then 1 else 0 end,
    'picks', v_picks, 'picked', case when v_new then 0 else coalesce((s ->> 'picked')::int, 0) end,
    'flipped', case when v_new then '[]'::jsonb else coalesce(s -> 'flipped', '[]'::jsonb) end,
    'grand_ready', e.level >= 8 and coalesce(s ->> 'grand_week', '') <> v_week,
    'pending', case when jsonb_typeof(s -> 'pending') = 'object' then s -> 'pending' end,
    'hand', case when jsonb_typeof(s -> 'hand') = 'object' then s -> 'hand' end,
    'right_ready', e.stars >= 3 and coalesce(s ->> 'right_day', '') <> v_day,
    'rebirth', coalesce((s ->> 'rebirth')::int, 0), 'hold_ready', e.stars >= 2);
end $$;

create or replace function private.ench_act_deck(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.deck_eval(e, t); r jsonb; v_card text; v_up boolean; v_foil boolean; v_i int; v_cards jsonb; v_eff jsonb; v_pend jsonb;
  v_grand boolean := false; v_left int; p public.world_plots; v_n int; v_all boolean;
begin
  if coalesce(s ->> 'day', '') <> (g ->> 'day') then
    s := s || jsonb_build_object('day', g ->> 'day', 'picked', 0, 'flipped', '[]'::jsonb);
  end if;
  case p_action
    when 'flip' then
      if jsonb_typeof(s -> 'pending') = 'object' then raise exception 'card_waiting' using errcode = 'P0001'; end if;
      v_i := (a ->> 'i')::int;
      if v_i is null or v_i < 0 or v_i >= (g ->> 'cards')::int then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      if exists (select 1 from jsonb_array_elements(coalesce(s -> 'flipped', '[]'::jsonb)) f where (f ->> 'i')::int = v_i) then raise exception 'already_flipped' using errcode = 'P0001'; end if;
      v_left := (g ->> 'picks')::int - coalesce((s ->> 'picked')::int, 0);
      -- level 8: once a week, the Grand Spread turns every card
      if v_left < 1 and (g ->> 'grand_ready')::boolean and coalesce((a ->> 'grand')::boolean, false) then v_grand := true; v_left := 1; end if;
      if v_left < 1 then raise exception 'already_today' using errcode = 'P0001'; end if;
      v_card := private.deck_pick(); v_up := random() >= private.ench_n('deck', 'reversed', 0.3); v_foil := random() < private.ench_n('deck', 'foil', 0.08);
      v_pend := jsonb_build_object('i', v_i, 'card', v_card, 'up', v_up, 'foil', v_foil);
      s := s || jsonb_build_object('pending', v_pend, 'picked', coalesce((s ->> 'picked')::int, 0) + case when v_grand then 0 else 1 end,
                                   'flipped', coalesce(s -> 'flipped', '[]'::jsonb) || jsonb_build_array(v_pend))
             || case when v_grand then jsonb_build_object('grand_week', to_char(now(), 'IYYY-IW')) else '{}'::jsonb end;
      -- into the collection
      v_cards := coalesce(e.stats -> 'cards', '{}'::jsonb);
      v_cards := v_cards || jsonb_build_object(v_card, coalesce((v_cards ->> v_card)::int, 0) + 1);
      update public.enchantments set stats = stats || jsonb_build_object('cards', v_cards, 'draws', coalesce((stats ->> 'draws')::int, 0) + 1,
                                                                          'foils', coalesce((stats ->> 'foils')::int, 0) + case when v_foil then 1 else 0 end) where id = e.id;
      perform private.ench_xp(e.id, 1);
      -- all 22: the Arcana is complete
      select count(*) = 22 into v_all from jsonb_object_keys(v_cards);
      if v_all and not coalesce((e.stats ->> 'complete')::boolean, false) then
        perform private.ench_ticket(e.owner_id, 'epic', 'deck_complete');
        update public.enchantments set stats = stats || '{"complete": true}'::jsonb where id = e.id;
      end if;
      r := jsonb_build_object('card', private.deck_card(v_card), 'up', v_up, 'foil', v_foil, 'i', v_i, 'grand', v_grand,
                              'complete', v_all and not coalesce((e.stats ->> 'complete')::boolean, false), 'new', coalesce((e.stats -> 'cards' ->> v_card)::int, 0) = 0);
    when 'accept' then
      -- what the turned card does: now, held for later (★2), or turned upright first (★3, once a day)
      v_pend := s -> 'pending';
      if jsonb_typeof(v_pend) <> 'object' then raise exception 'no_card' using errcode = 'P0001'; end if;
      if coalesce((a ->> 'upright')::boolean, false) and not (v_pend ->> 'up')::boolean then
        if not (g ->> 'right_ready')::boolean then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;
        v_pend := v_pend || '{"up": true, "righted": true}'::jsonb;
        s := s || jsonb_build_object('right_day', g ->> 'day');
      end if;
      if coalesce((a ->> 'hold')::boolean, false) then
        if e.stars < 2 then raise exception 'stars_locked' using errcode = 'P0001', detail = '2'; end if;
        if jsonb_typeof(s -> 'hand') = 'object' then raise exception 'hand_full' using errcode = 'P0001'; end if;
        s := s || jsonb_build_object('pending', null, 'hand', v_pend);
        r := jsonb_build_object('held', v_pend);
      else
        update public.enchantments set state = s where id = e.id;
        v_eff := private.deck_apply(e, v_pend ->> 'card', (v_pend ->> 'up')::boolean, (v_pend ->> 'foil')::boolean);
        s := (select state from public.enchantments where id = e.id) || jsonb_build_object('pending', null);
        perform private.ench_event(e.id, 'fate', jsonb_build_object('card', v_pend ->> 'card', 'up', (v_pend ->> 'up')::boolean, 'foil', (v_pend ->> 'foil')::boolean, 'effects', v_eff));
        r := jsonb_build_object('card', private.deck_card(v_pend ->> 'card'), 'up', (v_pend ->> 'up')::boolean, 'foil', (v_pend ->> 'foil')::boolean, 'effects', v_eff,
                                'righted', coalesce((v_pend ->> 'righted')::boolean, false), 'pay', (select x -> 'pay' from jsonb_array_elements(v_eff) x where x ? 'pay' and x -> 'pay' is not null and x -> 'pay' <> 'null'::jsonb limit 1));
      end if;
    when 'play' then
      -- the held card
      v_pend := s -> 'hand';
      if jsonb_typeof(v_pend) <> 'object' then raise exception 'no_card' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('hand', null);
      update public.enchantments set state = s where id = e.id;
      v_eff := private.deck_apply(e, v_pend ->> 'card', (v_pend ->> 'up')::boolean, (v_pend ->> 'foil')::boolean);
      s := (select state from public.enchantments where id = e.id);
      perform private.ench_event(e.id, 'fate', jsonb_build_object('card', v_pend ->> 'card', 'up', (v_pend ->> 'up')::boolean, 'held', true, 'effects', v_eff));
      r := jsonb_build_object('card', private.deck_card(v_pend ->> 'card'), 'up', (v_pend ->> 'up')::boolean, 'foil', (v_pend ->> 'foil')::boolean, 'effects', v_eff,
                              'pay', (select x -> 'pay' from jsonb_array_elements(v_eff) x where x -> 'pay' is not null and x -> 'pay' <> 'null'::jsonb limit 1));
    when 'rebirth' then
      -- Rebirth: one of your plots becomes another kind (its minigame changes)
      if coalesce((s ->> 'rebirth')::int, 0) < 1 then raise exception 'no_card' using errcode = 'P0001'; end if;
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
      if p.owner_id is distinct from e.owner_id or p.locked or p.rarity like 'crown%' then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      if (a ->> 'type') is null or not exists (select 1 from public.plot_types where id = a ->> 'type' and weight > 0) or a ->> 'type' = p.plot_type then raise exception 'bad_type' using errcode = 'P0001'; end if;
      update public.world_plots set plot_type = a ->> 'type', updated_at = now() where gx = p.gx and gy = p.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
      s := s || jsonb_build_object('rebirth', (s ->> 'rebirth')::int - 1);
      perform private.ench_event(e.id, 'reborn', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'from', p.plot_type, 'to', a ->> 'type'));
      r := jsonb_build_object('reborn', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'from', p.plot_type, 'to', a ->> 'type'));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_deck(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.deck_eval(e, t); v_left int := (g ->> 'picks')::int - (g ->> 'picked')::int;
begin
  return g || jsonb_build_object('deck', private.deck_cards(), 'collection', coalesce(e.stats -> 'cards', '{}'::jsonb),
    'draws', coalesce((e.stats ->> 'draws')::int, 0), 'foils', coalesce((e.stats ->> 'foils')::int, 0), 'complete', coalesce((e.stats ->> 'complete')::boolean, false),
    'reversed_pct', private.ench_n('deck', 'reversed', 0.3),
    'glows', coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'mult', b.mult, 'until', b.expires_at, 'card', b.data ->> 'card', 'uses', b.uses))
                         from public.enchant_buffs b where b.enchant_id = e.id and b.expires_at > now() and (b.uses is null or b.uses > 0)), '[]'::jsonb),
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'minigame', minigame_name) order by sort), '[]'::jsonb) from public.plot_types where weight > 0),
    'attention', case when jsonb_typeof(e.state -> 'pending') = 'object' then 'A card is waiting for you'
                      when v_left > 0 then 'The cards are dealt — turn one over'
                      when (g ->> 'rebirth')::int > 0 then 'Rebirth is in your hand' end);
end $$;

-- ---- ✍️ Glyphcaster -------------------------------------------------------------------------------------------------------
-- the 24 glyphs (20 to find, 4 secret); a: needs a target ('plot' or 'enchant')
create or replace function private.glyph_book() returns jsonb language sql immutable as $$
  select '[
    {"id": "spiral", "name": "Vortex", "cost": 1, "fx": [{"t": "ink", "v": 25}], "text": "Pulls loose Ink to you: 25 Ink.", "start": true},
    {"id": "star", "name": "Wish", "cost": 1, "fx": [{"t": "luck", "v": 5}], "text": "+5 Luck.", "start": true},
    {"id": "triangle", "name": "Ward", "cost": 2, "a": "plot", "fx": [{"t": "ward", "h": 3}], "text": "Shields a plot of yours from Parasites and pranks for 3 hours.", "start": true},
    {"id": "bolt", "name": "Thunder", "cost": 2, "fx": [{"t": "bolt", "m": 2, "min": 15}], "text": "For 15 minutes your Leviathan hits deal ×2 (×3 drawn perfectly)."},
    {"id": "leaf", "name": "Growth", "cost": 1, "a": "plot", "fx": [{"t": "leaf", "m": 1.3}], "text": "A plot’s next minigame win pays +30%."},
    {"id": "key", "name": "Unlock", "cost": 2, "a": "enchant", "fx": [{"t": "key", "s": 3600}], "text": "Cuts an hour off one of your enchantments’ waits."},
    {"id": "wave", "name": "Cleanse", "cost": 2, "fx": [{"t": "cleanse"}], "text": "Washes away every curse on you."},
    {"id": "eye", "name": "Insight", "cost": 1, "a": "enchant", "fx": [{"t": "xp", "v": 3}], "text": "Teaches one of your enchantments: +3 XP."},
    {"id": "circle", "name": "Seal", "cost": 2, "fx": [{"t": "glow", "m": 1.2, "h": 2}], "text": "Your enchantments pay +20% for 2 hours."},
    {"id": "cross", "name": "Mend", "cost": 1, "fx": [{"t": "ink", "v": 15}, {"t": "luck", "v": 2}], "text": "15 Ink and 2 Luck."},
    {"id": "heart", "name": "Kindle", "cost": 2, "fx": [{"t": "wins", "m": 1.5, "u": 2}], "text": "Your next 2 minigame wins pay ×1.5."},
    {"id": "moon", "name": "Dream", "cost": 2, "fx": [{"t": "eluck", "v": 1}], "text": "+1 Enchanted Luck."},
    {"id": "sun", "name": "Radiance", "cost": 3, "fx": [{"t": "glow", "m": 1.3, "h": 4}], "text": "Your enchantments pay +30% for 4 hours."},
    {"id": "crown", "name": "Regal", "cost": 3, "fx": [{"t": "ink", "v": 90}], "text": "90 Ink."},
    {"id": "arrow", "name": "Swift", "cost": 1, "a": "enchant", "fx": [{"t": "key", "s": 1800}], "text": "Cuts half an hour off one of your enchantments’ waits."},
    {"id": "hourglass", "name": "Linger", "cost": 2, "a": "plot", "fx": [{"t": "ward", "h": 8}], "text": "Shields a plot for 8 hours."},
    {"id": "flame", "name": "Ignite", "cost": 2, "fx": [{"t": "wins", "m": 2, "u": 1}], "text": "Your next minigame win pays ×2."},
    {"id": "anchor", "name": "Steady", "cost": 1, "fx": [{"t": "luck", "v": 8}], "text": "+8 Luck (drawn steady)."},
    {"id": "infinity", "name": "Endless", "cost": 3, "fx": [{"t": "wins", "m": 1.25, "u": 8}], "text": "Your next 8 minigame wins pay ×1.25."},
    {"id": "twin", "name": "Double Vortex", "cost": 2, "fx": [{"t": "ink", "v": 60}], "text": "60 Ink."},
    {"id": "rune", "name": "Elder Rune", "cost": 4, "secret": true, "fx": [{"t": "ticket", "r": "rare"}], "text": "A Rare-or-better roll ticket."},
    {"id": "phoenix", "name": "Rebirth Sigil", "cost": 4, "secret": true, "fx": [{"t": "eluck", "v": 3}], "text": "+3 Enchanted Luck."},
    {"id": "void", "name": "The Void", "cost": 3, "secret": true, "fx": [{"t": "glow", "m": 1.5, "h": 2}], "text": "Your enchantments pay +50% for 2 hours."},
    {"id": "omega", "name": "Omega", "cost": 5, "secret": true, "fx": [{"t": "ticket", "r": "epic"}], "text": "An Epic-or-better roll ticket."}
  ]'::jsonb
$$;
create or replace function private.glyph_def(p_id text) returns jsonb language sql immutable as $$
  select g from jsonb_array_elements(private.glyph_book()) g where g ->> 'id' = p_id
$$;
create or replace function private.glyph_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_max int := 5 + case when e.stars >= 1 then 2 else 0 end;
  v_per numeric := private.ench_n('glyph', 'recharge_h', 3) * 3600;
  v_n int := coalesce((s ->> 'mana')::int, v_max); v_at numeric := coalesce((s ->> 'mana_at')::numeric, v_now); v_gain int;
begin
  if v_n < v_max then
    v_gain := floor(greatest(0, v_now - v_at) / v_per)::int;
    if v_gain > 0 then v_n := least(v_max, v_n + v_gain); v_at := v_at + v_gain * v_per; end if;
  end if;
  if v_n >= v_max then v_n := least(v_n, v_max); v_at := v_now; end if;
  return jsonb_build_object('mana', v_n, 'max', v_max, 'mana_at', v_at, 'recharge_s', round(v_per),
    'next_in', case when v_n < v_max then greatest(0, round(v_at + v_per - v_now)) end,
    'known', coalesce(s -> 'known', '["spiral", "star", "triangle"]'::jsonb),
    'study_ready', coalesce(s ->> 'study_day', '') <> private.today()::text,
    'arch_ready', e.stars >= 3 and coalesce(s ->> 'arch_day', '') <> private.today()::text, 'chain', e.stars >= 2);
end $$;

-- one glyph comes true at a strength (0.6 at the worst drawing, 1 at the best)
create or replace function private.glyph_apply(e public.enchantments, p_g jsonb, p_pow numeric, a jsonb) returns jsonb language plpgsql as $$
declare x jsonb; v_out jsonb := '[]'::jsonb; v_pay jsonb; v_lk jsonb; p public.world_plots; o public.enchantments; v_n int;
begin
  for x in select y from jsonb_array_elements(p_g -> 'fx') y loop
    case x ->> 't'
      when 'ink' then
        v_pay := private.ench_pay(e.id, (x ->> 'v')::numeric * p_pow, 'cast ' || (p_g ->> 'name'));
        v_out := v_out || jsonb_build_object('t', 'ink', 'v', v_pay -> 'paid', 'pay', v_pay);
      when 'luck' then
        v_n := greatest(1, round((x ->> 'v')::numeric * p_pow))::int;
        v_lk := private.ench_give_luck(e.owner_id, v_n, 0);
        v_out := v_out || jsonb_build_object('t', 'luck', 'v', v_n);
      when 'eluck' then
        v_lk := private.ench_give_luck(e.owner_id, 0, (x ->> 'v')::int);
        v_out := v_out || jsonb_build_object('t', 'eluck', 'v', (x ->> 'v')::int);
      when 'ward' then
        select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
        if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
        insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'ward', p.gx, p.gy, e.id, 1, jsonb_build_object('glyph', p_g ->> 'id'), now() + make_interval(mins => round((x ->> 'h')::numeric * 60 * p_pow)::int));
        v_out := v_out || jsonb_build_object('t', 'ward', 'gx', p.gx, 'gy', p.gy, 'min', round((x ->> 'h')::numeric * 60 * p_pow));
      when 'leaf' then
        select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
        if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
        insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, uses, data, expires_at)
        values (e.owner_id, 'glyph_leaf', p.gx, p.gy, e.id, 1 + ((x ->> 'm')::numeric - 1) * p_pow, 1, '{}'::jsonb, now() + interval '24 hours');
        v_out := v_out || jsonb_build_object('t', 'leaf', 'gx', p.gx, 'gy', p.gy, 'm', round(1 + ((x ->> 'm')::numeric - 1) * p_pow, 2));
      when 'bolt' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'glyph_bolt', e.id, case when p_pow >= 0.999 then 3 else (x ->> 'm')::numeric end, '{}'::jsonb, now() + make_interval(mins => (x ->> 'min')::int));
        v_out := v_out || jsonb_build_object('t', 'bolt', 'm', case when p_pow >= 0.999 then 3 else (x ->> 'm')::numeric end, 'min', (x ->> 'min')::int);
      when 'key' then
        select * into o from public.enchantments where id = (a ->> 'target')::uuid and owner_id = e.owner_id and status = 'active';
        if o.id is null or o.id = e.id then raise exception 'bad_target' using errcode = 'P0001'; end if;
        update public.enchantments set clock_skip = clock_skip + round((x ->> 's')::numeric * p_pow) where id = o.id;
        v_out := v_out || jsonb_build_object('t', 'key', 'target', o.id, 's', round((x ->> 's')::numeric * p_pow));
      when 'xp' then
        select * into o from public.enchantments where id = (a ->> 'target')::uuid and owner_id = e.owner_id and status = 'active';
        if o.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
        perform private.ench_xp(o.id, greatest(1, round((x ->> 'v')::numeric * p_pow))::int);
        v_out := v_out || jsonb_build_object('t', 'xp', 'target', o.id, 'v', greatest(1, round((x ->> 'v')::numeric * p_pow)));
      when 'glow' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'glow', e.id, 1 + ((x ->> 'm')::numeric - 1) * p_pow, jsonb_build_object('by', 'glyph', 'name', p_g ->> 'name'), now() + make_interval(hours => (x ->> 'h')::int));
        v_out := v_out || jsonb_build_object('t', 'glow', 'm', round(1 + ((x ->> 'm')::numeric - 1) * p_pow, 2), 'h', (x ->> 'h')::int);
      when 'wins' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, uses, data, expires_at)
        values (e.owner_id, 'golden_hour', e.id, 1 + ((x ->> 'm')::numeric - 1) * p_pow, (x ->> 'u')::int, jsonb_build_object('by', 'glyph'), now() + interval '24 hours');
        v_out := v_out || jsonb_build_object('t', 'wins', 'm', round(1 + ((x ->> 'm')::numeric - 1) * p_pow, 2), 'u', (x ->> 'u')::int);
      when 'cleanse' then
        with d as (delete from public.enchant_buffs where player_id = e.owner_id and kind like 'curse_%' returning 1) select count(*) into v_n from d;
        v_out := v_out || jsonb_build_object('t', 'cleanse', 'v', v_n);
      when 'ticket' then
        perform private.ench_ticket(e.owner_id, x ->> 'r', 'glyph');
        v_out := v_out || jsonb_build_object('t', 'ticket', 'r', x ->> 'r');
      else null;
    end case;
  end loop;
  return v_out;
end $$;

-- a page flutters out of the book: a glyph you didn't know (secrets only once the twenty are found)
create or replace function private.glyph_find(p_known jsonb, p_secret boolean) returns text language sql volatile as $$
  select g ->> 'id' from jsonb_array_elements(private.glyph_book()) g
   where not (p_known ? (g ->> 'id')) and (coalesce((g ->> 'secret')::boolean, false) = p_secret)
   order by random() limit 1
$$;

create or replace function private.ench_act_glyph(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.glyph_eval(e, t); r jsonb; v_ids jsonb; v_id text; d jsonb; v_cost int := 0; v_acc numeric; v_pow numeric;
  v_out jsonb := '[]'::jsonb; v_known jsonb := (g -> 'known'); v_mast jsonb := coalesce(e.state -> 'mastery', '{}'::jsonb); v_best jsonb := coalesce(e.state -> 'best', '{}'::jsonb);
  v_found text; v_arch boolean := false; v_n int; v_chain boolean;
begin
  case p_action
    when 'cast' then
      -- {glyph, accuracy} or, ★2 Chain Cast, {glyphs: [a, b], accuracy}
      v_ids := case when jsonb_typeof(a -> 'glyphs') = 'array' then a -> 'glyphs' else jsonb_build_array(a ->> 'glyph') end;
      v_chain := jsonb_array_length(v_ids) = 2;
      if jsonb_array_length(v_ids) not between 1 and 2 then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      if v_chain and e.stars < 2 then raise exception 'stars_locked' using errcode = 'P0001', detail = '2'; end if;
      for v_id in select jsonb_array_elements_text(v_ids) loop
        d := private.glyph_def(v_id);
        if d is null or not (v_known ? v_id) then raise exception 'unknown_glyph' using errcode = 'P0001'; end if;
        v_cost := v_cost + greatest(1, (d ->> 'cost')::int - case when coalesce((v_mast ->> v_id)::int, 0) >= 10 then 1 else 0 end);
      end loop;
      if (g ->> 'mana')::int < v_cost then raise exception 'no_mana' using errcode = 'P0001'; end if;
      -- how neatly it was drawn (the phone grades the shape; the server caps what it can do)
      v_acc := least(1, greatest(0, coalesce((a ->> 'accuracy')::numeric, 0)));
      if coalesce((a ->> 'arch')::boolean, false) then
        if not (g ->> 'arch_ready')::boolean then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;
        v_arch := true; v_acc := 1; s := s || jsonb_build_object('arch_day', private.today()::text);
      end if;
      if v_acc < 0.35 then
        -- a scrawl: the mana fizzles
        s := s || jsonb_build_object('mana', (g ->> 'mana')::int - 1, 'mana_at', (g ->> 'mana_at')::numeric);
        perform private.ench_event(e.id, 'fizzled', jsonb_build_object('glyphs', v_ids, 'accuracy', v_acc));
        return jsonb_build_object('state', s, 'result', jsonb_build_object('fizzled', true, 'accuracy', v_acc));
      end if;
      v_pow := (0.6 + 0.4 * v_acc) * case when v_chain then 1.5 else 1 end;
      s := s || jsonb_build_object('mana', (g ->> 'mana')::int - v_cost, 'mana_at', (g ->> 'mana_at')::numeric);
      update public.enchantments set state = s where id = e.id;
      for v_id in select jsonb_array_elements_text(v_ids) loop
        v_out := v_out || private.glyph_apply(e, private.glyph_def(v_id), v_pow, a);
        v_mast := v_mast || jsonb_build_object(v_id, coalesce((v_mast ->> v_id)::int, 0) + 1);
        v_best := v_best || jsonb_build_object(v_id, greatest(coalesce((v_best ->> v_id)::numeric, 0), round(v_acc, 3)));
      end loop;
      s := (select state from public.enchantments where id = e.id) || jsonb_build_object('mastery', v_mast, 'best', v_best);
      -- sometimes a page flutters out
      if random() < private.ench_n('glyph', 'find', 0.15) then
        v_found := private.glyph_find(v_known, false);
        if v_found is null and random() < 0.2 then v_found := private.glyph_find(v_known, true); end if;
        if v_found is not null then s := s || jsonb_build_object('known', v_known || to_jsonb(v_found)); end if;
      end if;
      perform private.ench_stat(e.id, 'casts');
      perform private.ench_xp(e.id, v_cost);
      perform private.ench_event(e.id, 'cast', jsonb_build_object('glyphs', v_ids, 'accuracy', v_acc, 'effects', v_out, 'found', v_found, 'arch', v_arch));
      r := jsonb_build_object('glyphs', v_ids, 'accuracy', v_acc, 'power', round(v_pow, 2), 'effects', v_out, 'found', case when v_found is not null then private.glyph_def(v_found) end,
                              'chain', v_chain, 'arch', v_arch, 'cost', v_cost,
                              'pay', (select x -> 'pay' from jsonb_array_elements(v_out) x where x -> 'pay' is not null and x -> 'pay' <> 'null'::jsonb limit 1));
    when 'study' then
      -- once a day: turn the pages — a hint, and sometimes a glyph
      if not (g ->> 'study_ready')::boolean then raise exception 'already_today' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('study_day', private.today()::text);
      if random() < private.ench_n('glyph', 'study', 0.35) then
        v_found := private.glyph_find(v_known, false);
        if v_found is null then v_found := private.glyph_find(v_known, true); end if;
        if v_found is not null then s := s || jsonb_build_object('known', v_known || to_jsonb(v_found)); end if;
      end if;
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'studied', jsonb_build_object('found', v_found));
      r := jsonb_build_object('found', case when v_found is not null then private.glyph_def(v_found) end,
                              'hint', (select g2 ->> 'text' from jsonb_array_elements(private.glyph_book()) g2 where not (coalesce(s -> 'known', v_known) ? (g2 ->> 'id')) and not coalesce((g2 ->> 'secret')::boolean, false) order by random() limit 1));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_glyph(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.glyph_eval(e, t);
begin
  return g || jsonb_build_object('book', private.glyph_book(), 'mastery', coalesce(e.state -> 'mastery', '{}'::jsonb), 'best', coalesce(e.state -> 'best', '{}'::jsonb),
    'casts', coalesce((e.stats ->> 'casts')::int, 0),
    'attention', case when (g ->> 'study_ready')::boolean then 'The Spellbook has new pages to study' when (g ->> 'mana')::int >= (g ->> 'max')::int then 'Your mana is full — cast a glyph' end);
end $$;

-- ---- the rest: glows, the Tower, a bolt, a ward, a leaf, a grand show ---------------------------------------------------
create or replace function private.lev_player_mult(p_uid uuid) returns numeric language sql stable as $$
  select private.crucible_bell(p_uid)
       * coalesce((select max(mult) from public.enchant_buffs where player_id = p_uid and kind = 'fate_tower' and expires_at > now()), 1)
       * coalesce((select max(mult) from public.enchant_buffs where player_id = p_uid and kind = 'glyph_bolt' and expires_at > now()), 1)
$$;
-- an anchored plot — or one warded by a glyph — can't be pranked or latched onto
create or replace function private.cru_anchored(p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.crucible_artifacts a where a.gx = p_gx and a.gy = p_gy and a.kind = 'anchor')
      or exists (select 1 from public.enchant_buffs b where b.kind = 'ward' and b.gx = p_gx and b.gy = p_gy and b.expires_at > now())
$$;
create or replace function private.ench_hybrids() returns jsonb language sql immutable as $$
  select '{"genie+goose": ["Wishing Goose", false], "goose+map": ["Treasure Goose", false], "goose+parasite": ["Leech Goose", false], "goose+pandora": ["Cursed Goose", false], "clockwork+goose": ["Clockwork Goose", false], "goose+sizeray": ["Giant Goose", true], "goose+shard": ["Mirror Goose", false], "genie+map": ["Cartographer Djinn", false], "genie+parasite": ["Possessing Djinn", false], "genie+pandora": ["Forbidden Djinn", true], "clockwork+genie": ["Hourglass Djinn", false], "genie+sizeray": ["Colossal Djinn", false], "genie+shard": ["Mirror Djinn", false], "map+parasite": ["Blight Map", false], "map+pandora": ["Map of Woe", false], "clockwork+map": ["Chronomap", false], "map+sizeray": ["Atlas Map", false], "map+shard": ["Looking-Glass Map", true], "pandora+parasite": ["Plague Bearer", false], "clockwork+parasite": ["Tick", false], "parasite+sizeray": ["Behemoth Worm", false], "parasite+shard": ["Doppel-Leech", false], "clockwork+pandora": ["Doomsday Clock", true], "pandora+sizeray": ["Titan’s Box", false], "pandora+shard": ["Box of Mirrors", false], "clockwork+sizeray": ["Grandfather Clock", false], "clockwork+shard": ["Reverse Clock", false], "shard+sizeray": ["Funhouse Mirror", true], "goose+wormhole": ["Warp Goose", false], "genie+wormhole": ["Djinn of Doors", false], "map+wormhole": ["Shortcut Map", true], "parasite+wormhole": ["Burrow Worm", false], "pandora+wormhole": ["Box of Elsewhere", false], "clockwork+wormhole": ["Time Tunnel", true], "sizeray+wormhole": ["Spacefold Ray", false], "shard+wormhole": ["Glass Gate", false], "oracle+wormhole": ["Eye of the Rift", false], "goose+oracle": ["Augur Goose", false], "genie+oracle": ["Djinn of Fate", true], "map+oracle": ["Seer’s Map", false], "oracle+parasite": ["Mind Leech", false], "oracle+pandora": ["Pandora’s Prophecy", true], "clockwork+oracle": ["Clock of Ages", false], "oracle+sizeray": ["Far-Sight Ray", false], "oracle+shard": ["Scrying Glass", false], "goose+ouroboros": ["Eternal Egg", false], "genie+ouroboros": ["Undying Djinn", false], "map+ouroboros": ["Map of Return", false], "ouroboros+parasite": ["Tail-Eater Worm", false], "ouroboros+pandora": ["Box Without End", false], "clockwork+ouroboros": ["Infinity Clock", true], "ouroboros+sizeray": ["Coil Titan", false], "ouroboros+shard": ["Endless Mirror", true], "ouroboros+wormhole": ["Möbius Gate", false], "oracle+ouroboros": ["Eye of Eternity", false], "goose+homunculus": ["Golem Hen", false], "genie+homunculus": ["Flask Djinn", true], "homunculus+map": ["Patchwork Atlas", false], "homunculus+parasite": ["Flesh-Weaver", true], "homunculus+pandora": ["Box of Limbs", false], "clockwork+homunculus": ["Clockwork Golem", false], "homunculus+sizeray": ["Titan-Born", false], "homunculus+shard": ["Glass Golem", false], "homunculus+wormhole": ["Walker Between", false], "homunculus+oracle": ["Many-Eyed Child", false], "goose+stormcoil": ["Thunder Goose", false], "genie+stormcoil": ["Storm Djinn", false], "map+stormcoil": ["Map of Storms", false], "parasite+stormcoil": ["Galvanic Leech", false], "pandora+stormcoil": ["Box of Thunder", false], "clockwork+stormcoil": ["Dynamo Clock", false], "sizeray+stormcoil": ["Plasma Ray", false], "shard+stormcoil": ["Fulgurite", false], "stormcoil+wormhole": ["Storm Gate", false], "oracle+stormcoil": ["Eye of the Storm", true], "homunculus+ouroboros": ["Undying Child", false], "homunculus+stormcoil": ["Galvanized Golem", true], "ouroboros+stormcoil": ["Storm Serpent", false], "clockwork+spyglass": ["Chronoscope", false], "genie+spyglass": ["Djinn’s Eye", false], "goose+spyglass": ["Lookout Goose", false], "homunculus+spyglass": ["Watcher-Child", false], "map+spyglass": ["Pirate’s Glass", true], "oracle+spyglass": ["Seer’s Scope", false], "ouroboros+spyglass": ["Endless Horizon", false], "pandora+spyglass": ["Peeking Box", false], "parasite+spyglass": ["Stalker Worm", false], "shard+spyglass": ["Periscope", false], "sizeray+spyglass": ["Telescopic Ray", true], "spyglass+stormcoil": ["Storm Watcher", false], "spyglass+wormhole": ["Far Glass", false], "clockwork+origami": ["Paper Clock", false], "genie+origami": ["Paper Lamp", false], "goose+origami": ["Thousand-Crane Goose", false], "homunculus+origami": ["Paper Golem", false], "map+origami": ["Folded Atlas", true], "oracle+origami": ["Fortune Teller", true], "origami+ouroboros": ["Möbius Crane", false], "origami+pandora": ["Paper Box", false], "origami+parasite": ["Paper Wasp", false], "origami+shard": ["Mirror Fold", false], "origami+sizeray": ["Pop-Up Titan", false], "origami+spyglass": ["Paper Telescope", false], "origami+stormcoil": ["Kite of Storms", true], "origami+wormhole": ["Paper Portal", true], "clockwork+crucible": ["Forged Gears", false], "crucible+genie": ["Brass Lamp", false], "crucible+goose": ["Gilded Forge", true], "crucible+homunculus": ["Iron Golem", true], "crucible+map": ["Smelter’s Map", false], "crucible+oracle": ["Molten Eye", false], "crucible+origami": ["Tempered Fold", false], "crucible+ouroboros": ["Ring of Fire", false], "crucible+pandora": ["Furnace of Woes", false], "crucible+parasite": ["Slag Worm", false], "crucible+shard": ["Glassblower", true], "crucible+sizeray": ["Titan’s Anvil", false], "crucible+spyglass": ["Brass Spyglass", false], "crucible+stormcoil": ["Thunder Forge", true], "crucible+wormhole": ["Lava Gate", false], "clockwork+puppeteer": ["Automaton", true], "crucible+puppeteer": ["Iron Marionette", false], "genie+puppeteer": ["Djinn on Strings", false], "goose+puppeteer": ["Puppet Goose", false], "homunculus+puppeteer": ["Marionette", true], "map+puppeteer": ["Puppet’s Path", false], "oracle+puppeteer": ["Fate’s Hand", false], "origami+puppeteer": ["Paper Puppet", false], "ouroboros+puppeteer": ["Endless Show", false], "pandora+puppeteer": ["Jack-in-the-Box", true], "parasite+puppeteer": ["Mind Worm", false], "puppeteer+shard": ["Mirror Dancer", false], "puppeteer+sizeray": ["Giant Puppet", false], "puppeteer+spyglass": ["Stage Glass", false], "puppeteer+stormcoil": ["Galvanic Puppet", false], "puppeteer+wormhole": ["Strings Across", false], "clockwork+deck": ["Hour of Fate", false], "crucible+deck": ["Forged Fortune", false], "deck+genie": ["Djinn’s Gamble", false], "deck+goose": ["Fortune Goose", false], "deck+homunculus": ["Card-Child", false], "deck+map": ["Fortune’s Map", false], "deck+oracle": ["Book of Fates", true], "deck+origami": ["House of Cards", true], "deck+ouroboros": ["Endless Deal", false], "deck+pandora": ["Wild Card", false], "deck+parasite": ["Card Leech", false], "deck+puppeteer": ["Card Trick", false], "deck+shard": ["Mirror Hand", false], "deck+sizeray": ["Giant’s Hand", false], "deck+spyglass": ["Fortune Glass", false], "deck+stormcoil": ["Storm Card", false], "deck+wormhole": ["Card From Nowhere", false], "clockwork+glyph": ["Rune Clock", false], "crucible+glyph": ["Rune Forge", true], "deck+glyph": ["Tarot Sigil", false], "genie+glyph": ["Lamp Script", false], "glyph+goose": ["Rune Goose", false], "glyph+homunculus": ["Inked Child", false], "glyph+map": ["Rune Map", false], "glyph+oracle": ["Eye of Runes", false], "glyph+origami": ["Folded Script", false], "glyph+ouroboros": ["Endless Rune", false], "glyph+pandora": ["Sealed Box", true], "glyph+parasite": ["Ink Worm", false], "glyph+puppeteer": ["Spell Strings", false], "glyph+shard": ["Mirror Script", false], "glyph+sizeray": ["Giant Script", false], "glyph+spyglass": ["Rune Glass", false], "glyph+stormcoil": ["Thunder Script", true], "glyph+wormhole": ["Gate Rune", false]}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.ench_kinds()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['goose', 'genie', 'map', 'parasite', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
               'ouroboros', 'homunculus', 'stormcoil', 'spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph']
$function$;

CREATE OR REPLACE FUNCTION private.ench_info(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_kind
    when 'goose' then '{"name": "Golden Goose", "emoji": "🪿", "gene": "golden", "gene_name": "Golden"}'
    when 'genie' then '{"name": "Genie", "emoji": "🧞", "gene": "wish", "gene_name": "Wishing"}'
    when 'map' then '{"name": "Treasure Map", "emoji": "🗺️", "gene": "seek", "gene_name": "Seeking"}'
    when 'parasite' then '{"name": "Parasite", "emoji": "🦠", "gene": "spread", "gene_name": "Spreading"}'
    when 'cuckoo' then '{"name": "Cuckoo Egg", "emoji": "🥚", "gene": null, "gene_name": null}'
    when 'pandora' then '{"name": "Pandora’s Box", "emoji": "🏺", "gene": "chaos", "gene_name": "Chaos"}'
    when 'splice' then '{"name": "Splice", "emoji": "🧪", "gene": null, "gene_name": null}'
    when 'clockwork' then '{"name": "Clockwork", "emoji": "⚙️", "gene": "tempo", "gene_name": "Tempo"}'
    when 'sizeray' then '{"name": "Size Ray", "emoji": "📡", "gene": "grow", "gene_name": "Giant"}'
    when 'shard' then '{"name": "Mirror Shard", "emoji": "🪞", "gene": "echo", "gene_name": "Echo"}'
    when 'wormhole' then '{"name": "Wormhole", "emoji": "🌀", "gene": "linked", "gene_name": "Linked"}'
    when 'oracle' then '{"name": "Oracle Eye", "emoji": "👁️", "gene": "foresight", "gene_name": "Foresight"}'
    when 'ouroboros' then '{"name": "Ouroboros", "emoji": "🐍", "gene": "endless", "gene_name": "Endless"}'
    when 'homunculus' then '{"name": "Homunculus", "emoji": "🧫", "gene": "patchwork", "gene_name": "Patchwork"}'
    when 'stormcoil' then '{"name": "Storm Coil", "emoji": "⚡", "gene": "charged", "gene_name": "Charged"}'
    when 'spyglass' then '{"name": "Spyglass", "emoji": "🔭", "gene": "farsight", "gene_name": "Farsight"}'
    when 'origami' then '{"name": "Origami Pocket", "emoji": "🦢", "gene": "folded", "gene_name": "Folded"}'
    when 'crucible' then '{"name": "Crucible", "emoji": "🔥", "gene": "trick", "gene_name": "Tempered"}'
    when 'puppeteer' then '{"name": "Puppeteer", "emoji": "🎭", "gene": "strings", "gene_name": "Strings"}'
    when 'deck' then '{"name": "Fated Deck", "emoji": "🃏", "gene": "fated", "gene_name": "Fated"}'
    when 'glyph' then '{"name": "Glyphcaster", "emoji": "✍️", "gene": "inscribed", "gene_name": "Inscribed"}'
  end::jsonb
$function$;

CREATE OR REPLACE FUNCTION private.ench_init(p_kind text, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select case p_kind
    when 'goose' then jsonb_build_object('egg_at', private.ench_ep(t), 'polish', 0, 'chased', '[]'::jsonb, 'eggs', 0, 'streak', 0)
    when 'genie' then jsonb_build_object('wishes', 1, 'charge_at', private.ench_ep(t))
    when 'map' then jsonb_build_object('pieces', '[]'::jsonb, 'next_at', 0)
    when 'parasite' then jsonb_build_object('stage', 0, 'feeds', 0)
    when 'pandora' then jsonb_build_object('evils', '[]'::jsonb, 'cycle', 0)
    when 'splice' then jsonb_build_object('charges', 1, 'charge_at', private.ench_ep(t), 'codex', '[]'::jsonb, 'bonus', 0)
    when 'clockwork' then jsonb_build_object('charge', 30, 'tick_at', private.ench_ep(t))
    when 'sizeray' then jsonb_build_object('shots', 1, 'shot_at', private.ench_ep(t))
    when 'shard' then jsonb_build_object('cracks', 0, 'options', '[]'::jsonb)
    when 'wormhole' then jsonb_build_object('next_open_at', 0)
    when 'oracle' then jsonb_build_object('charges', 1, 'charge_at', private.ench_ep(t))
    when 'ouroboros' then jsonb_build_object('coil', null)
    when 'homunculus' then jsonb_build_object('parts', '[]'::jsonb, 'gen', 1)
    when 'stormcoil' then jsonb_build_object('charge', 30)
    when 'spyglass' then jsonb_build_object('looks', 3, 'look_at', private.ench_ep(t))
    when 'origami' then jsonb_build_object('folds', 1, 'fold_at', private.ench_ep(t))
    when 'crucible' then jsonb_build_object('heat', 0, 'metal', '{}'::jsonb, 'runes', '{}'::jsonb)
    when 'puppeteer' then jsonb_build_object('strings', 2, 'string_at', private.ench_ep(t))
    when 'deck' then jsonb_build_object('picked', 0)
    when 'glyph' then jsonb_build_object('mana', 5, 'mana_at', private.ench_ep(t), 'known', '["spiral", "star", "triangle"]'::jsonb)
    else '{}'::jsonb end
$function$;

CREATE OR REPLACE FUNCTION private.ench_kind_view(e enchantments, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  return case e.kind
    when 'goose' then private.ench_view_goose(e, t) when 'genie' then private.ench_view_genie(e, t) when 'map' then private.ench_view_map(e, t)
    when 'parasite' then private.ench_view_parasite(e, t) when 'cuckoo' then jsonb_build_object('egg', true, 'choices', to_jsonb(private.ench_hatchable()), 'attention', 'Your Cuckoo left an egg — choose what hatches') when 'pandora' then private.ench_view_pandora(e, t)
    when 'splice' then private.ench_view_splice(e, t) when 'clockwork' then private.ench_view_clockwork(e, t) when 'sizeray' then private.ench_view_sizeray(e, t)
    when 'wormhole' then private.ench_view_wormhole(e, t) when 'oracle' then private.ench_view_oracle(e, t)
    when 'ouroboros' then private.ench_view_ouroboros(e, t) when 'homunculus' then private.ench_view_homunculus(e, t) when 'stormcoil' then private.ench_view_stormcoil(e, t)
    when 'spyglass' then private.ench_view_spyglass(e, t) when 'origami' then private.ench_view_origami(e, t) when 'crucible' then private.ench_view_crucible(e, t)
    when 'puppeteer' then private.ench_view_puppeteer(e, t) when 'deck' then private.ench_view_deck(e, t) when 'glyph' then private.ench_view_glyph(e, t)
    when 'shard' then jsonb_build_object('cracks', coalesce((e.state ->> 'cracks')::int, 0), 'options', coalesce(e.state -> 'options', '[]'::jsonb),
      'reflect', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > private.ench_ep(t) then e.state -> 'reflect' end,
      'gaze_in', greatest(0, round(coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 * case when e.stars >= 2 then 0.6 else 1 end - private.ench_ep(t))),
      'attention', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) <= private.ench_ep(t)
                         and (jsonb_array_length(coalesce(e.state -> 'options', '[]'::jsonb)) > 0 or coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 * case when e.stars >= 2 then 0.6 else 1 end <= private.ench_ep(t))
                        then 'The shard shows new reflections' end)
  end;
end $function$;

CREATE OR REPLACE FUNCTION public.enchant_act(p_id uuid, p_action text, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); e public.enchantments; t timestamptz; x public.enchantments; v jsonb; a jsonb := coalesce(p_args, '{}'::jsonb); sp record;
  v_kind text; v_spark uuid;
begin
  perform private.rate_limit('enchant_act', 1500, 3600);
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null or e.owner_id is distinct from v_uid or e.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform private.ench_settle(e.id);
  select * into e from public.enchantments where id = p_id;
  t := private.ench_now(e);
  if p_action = 'rename' then
    update public.enchantments set nickname = nullif(left(trim(coalesce(a ->> 'name', '')), 24), ''), updated_at = now() where id = e.id;
    perform private.ench_event(e.id, 'named', jsonb_build_object('name', nullif(left(trim(coalesce(a ->> 'name', '')), 24), '')));
    return private.ench_view(e.id);
  end if;
  -- any enchantment can step out of a splice early (yours, or one a friend spliced you into)
  if p_action = 'separate' then
    for sp in select * from public.enchant_splices zs where (zs.a = e.id or zs.b = e.id) and zs.ends_at > now() loop
      update public.enchant_splices zs set ends_at = now() where zs.grp is not distinct from sp.grp and (sp.grp is not null or zs.id = sp.id) and zs.ends_at > now();
      if sp.mode = 'graft' then update public.enchantments set frozen_until = least(frozen_until, now()) where id = sp.b and frozen_until > now(); end if;
    end loop;
    if not found then raise exception 'no_splice' using errcode = 'P0001'; end if;
    perform private.ench_settle(e.id);
    return private.ench_view(e.id) || jsonb_build_object('result', jsonb_build_object('separated', true), 'balances', private.balances(v_uid));
  end if;
  x := private.ench_reflected(e, t);
  if x.id is not null and p_action not in ('gaze', 'step', 'release') then
    v_kind := x.kind;
    v := case x.kind
      when 'goose' then private.ench_act_goose(x, p_action, a, t) when 'genie' then private.ench_act_genie(x, p_action, a, t) when 'map' then private.ench_act_map(x, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(x, p_action, a, t) when 'spyglass' then private.ench_act_spyglass(x, p_action, a, t) when 'deck' then private.ench_act_deck(x, p_action, a, t) when 'glyph' then private.ench_act_glyph(x, p_action, a, t) when 'pandora' then private.ench_act_pandora(x, p_action, a, t)
      when 'clockwork' then private.ench_act_clockwork(x, p_action, a, t) when 'sizeray' then private.ench_act_sizeray(x, p_action, a, t) end;
    if v is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    update public.enchantments set state = state || jsonb_build_object('r', v -> 'state'), updated_at = now() where id = e.id;
  else
    v_kind := e.kind;
    v := case e.kind
      when 'goose' then private.ench_act_goose(e, p_action, a, t) when 'genie' then private.ench_act_genie(e, p_action, a, t) when 'map' then private.ench_act_map(e, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(e, p_action, a, t) when 'cuckoo' then private.ench_act_egg(e, p_action, a, t) when 'pandora' then private.ench_act_pandora(e, p_action, a, t)
      when 'splice' then private.ench_act_splice(e, p_action, a, t) when 'clockwork' then private.ench_act_clockwork(e, p_action, a, t)
      when 'sizeray' then private.ench_act_sizeray(e, p_action, a, t) when 'shard' then private.ench_act_shard(e, p_action, a, t)
      when 'wormhole' then private.ench_act_wormhole(e, p_action, a, t) when 'oracle' then private.ench_act_oracle(e, p_action, a, t)
      when 'ouroboros' then private.ench_act_ouroboros(e, p_action, a, t) when 'homunculus' then private.ench_act_homunculus(e, p_action, a, t)
      when 'stormcoil' then private.ench_act_stormcoil(e, p_action, a, t)
      when 'spyglass' then private.ench_act_spyglass(e, p_action, a, t) when 'origami' then private.ench_act_origami(e, p_action, a, t)
      when 'crucible' then private.ench_act_crucible(e, p_action, a, t)
      when 'puppeteer' then private.ench_act_puppeteer(e, p_action, a, t) when 'deck' then private.ench_act_deck(e, p_action, a, t)
      when 'glyph' then private.ench_act_glyph(e, p_action, a, t) end;
    -- (an act can rewrite other rows of this enchantment's state — the Oracle fixes a goose's eggs — so only keys the act returns are replaced)
    update public.enchantments set state = v -> 'state', updated_at = now() where id = e.id;
  end if;
  -- 🪿 a golden egg sometimes carries a spark for your Splice (a Platinum egg always does)
  if v_kind = 'goose' and p_action = 'collect' and v -> 'result' ? 'egg' then
    if coalesce((v -> 'result' -> 'egg' ->> 'platinum')::boolean, false) or random() < private.ench_n('splice', 'goose_spark', 0.2) then
      v_spark := private.splice_spark(v_uid, 'goose');
      if v_spark is not null then v := jsonb_set(v, '{result,spark}', 'true'::jsonb); end if;
    end if;
  end if;
  select * into e from public.enchantments where id = p_id;
  if private.ench_titles(e) <> e.titles then
    perform private.ench_event(e.id, 'title', jsonb_build_object('titles', to_jsonb(array(select unnest(private.ench_titles(e)) except select unnest(e.titles)))));
    update public.enchantments set titles = private.ench_titles(e) where id = e.id;
  end if;
  return private.ench_view(e.id) || jsonb_build_object('result', v -> 'result', 'balances', private.balances(v_uid));
end $function$;

CREATE OR REPLACE FUNCTION private.ench_word(p_kind text, p_part text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select ('{"goose": ["Golden", "Hen"], "genie": ["Wishing", "Djinn"], "map": ["Treasure", "Atlas"], "parasite": ["Hungering", "Worm"],
           "pandora": ["Cursed", "Box"], "clockwork": ["Ticking", "Engine"], "sizeray": ["Giant", "Titan"],
           "shard": ["Mirrored", "Glass"], "wormhole": ["Warped", "Gate"], "oracle": ["All-Seeing", "Eye"], "splice": ["Spliced", "Chimera"],
           "ouroboros": ["Endless", "Serpent"], "homunculus": ["Patchwork", "Golem"], "stormcoil": ["Charged", "Storm"],
           "spyglass": ["Far-Seeing", "Spyglass"], "origami": ["Folded", "Crane"], "crucible": ["Molten", "Anvil"],
           "puppeteer": ["Strung", "Marionette"], "deck": ["Fated", "Card"], "glyph": ["Runic", "Glyph"]}'::jsonb
          -> p_kind ->> case when p_part = 'adj' then 0 else 1 end)
$function$;

CREATE OR REPLACE FUNCTION private.ench_titles(e enchantments)
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  select array_remove(array[
    case when e.level >= 5 then 'Awakened' end, case when e.level >= 10 then 'Ascended' end,
    case when e.stars >= 1 then 'Starlit' end, case when e.stars >= 2 then 'Starforged' end, case when e.stars >= 3 then 'Supernova' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'foxes')::int, 0) >= 10 then 'Fox-Bane' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'eggs')::int, 0) >= 25 then 'Golden Hen' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'best_streak')::int, 0) >= 7 then 'Unbroken' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'platinum')::int, 0) >= 1 then 'Platinum' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'forbidden')::int, 0) >= 1 then 'Forbidden' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'wishes')::int, 0) >= 30 then 'Wishmaster' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'freed')::int, 0) >= 1 then 'Liberator' end,
    case when e.kind = 'map' and coalesce((e.stats ->> 'maps')::int, 0) >= 5 then 'Cartographer' end,
    case when e.kind = 'map' and coalesce((e.stats ->> 'pieces')::int, 0) >= 40 then 'Pathfinder' end,
    case when e.kind = 'parasite' and coalesce((e.state ->> 'stage')::int, 0) >= 2 then 'Symbiote' end,
    case when e.kind = 'parasite' and coalesce((e.stats ->> 'feeds')::int, 0) >= 25 then 'Devourer' end,
    case when e.kind = 'pandora' and coalesce((e.stats ->> 'hope')::int, 0) >= 1 then 'Hope-Bringer' end,
    case when e.kind = 'splice' and coalesce((e.stats ->> 'splices')::int, 0) >= 10 then 'Mad Scientist' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 36 then 'Chimera Codex' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 55 then 'Grand Codex' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= private.ench_hybrid_count() then 'Codex Complete' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'aberrations', '[]'::jsonb)) >= 1 then 'Aberrant' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'trinities', '[]'::jsonb)) >= 3 then 'Trinitarian' end,
    case when e.kind = 'clockwork' and coalesce((e.stats ->> 'winds')::int, 0) >= 100 then 'Timekeeper' end,
    case when e.kind = 'clockwork' and coalesce((e.stats ->> 'freezes')::int, 0) >= 10 then 'Stopwatch' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'perfects')::int, 0) >= 10 then 'Sharpshooter' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'fired')::int, 0) >= 50 then 'Big Bang' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'grown')::int, 0) >= 10 then 'Colossus' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'shrunk')::int, 0) >= 10 then 'Ant-Maker' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'pranks')::int, 0) >= 10 then 'Prankster' end,
    case when e.kind = 'shard' and coalesce((e.stats ->> 'shatters')::int, 0) >= 1 then 'Seven Years' end,
    case when e.kind = 'shard' and coalesce((e.stats ->> 'reflections')::int, 0) >= 20 then 'Many Faces' end,
    case when e.kind = 'wormhole' and coalesce((e.stats ->> 'opens')::int, 0) >= 5 then 'Gatekeeper' end,
    case when e.kind = 'wormhole' and coalesce((e.stats ->> 'far_km')::numeric, 0) >= 1000 then 'Worldwalker' end,
    case when e.kind = 'wormhole' and e.level >= 10 then 'Constellation' end,
    case when e.kind = 'oracle' and coalesce((e.stats ->> 'fulfilled')::int, 0) >= 10 then 'Seer' end,
    case when e.kind = 'oracle' and coalesce((e.stats ->> 'rewrites')::int, 0) >= 10 then 'Fate-Weaver' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'circles')::int, 0) >= 1 then 'Eternal' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'clean')::int, 0) >= 10 then 'Tail-Catcher' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'bites')::int, 0) >= 3 then 'Snakeskin' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'wakes')::int, 0) >= 1 then 'Alchemist' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'hearts')::int, 0) >= 3 then 'Generations' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'max_parts')::int, 0) >= 7 then 'Many Limbs' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'storms')::int, 0) >= 10 then 'Stormcaller' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'bolts')::int, 0) >= 50 then 'Lightning Hands' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'aberrations')::int, 0) >= 1 then 'Galvanist' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'looks')::int, 0) >= 50 then 'Eagle-Eye' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'claimed')::int, 0) >= 10 then 'Prospector' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'grand')::int, 0) >= 1 then 'Far-Seer' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'unfolds')::int, 0) >= 10 then 'Paper Crane' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'unfolds')::int, 0) >= 100 then 'Thousand Cranes' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'far_km')::numeric, 0) >= 100 then 'Far-Folder' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'melts')::int, 0) >= 25 then 'Smelter' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'wins')::int, 0) >= 5 then 'Forgemaster' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'monument_tier')::int, 0) >= 3 then 'Monument Maker' end,
    case when e.kind = 'puppeteer' and coalesce((e.stats ->> 'shows')::int, 0) >= 10 then 'Marionettist' end,
    case when e.kind = 'puppeteer' and coalesce((e.stats ->> 'wins')::int, 0) >= 50 then 'Grand Puppeteer' end,
    case when e.kind = 'puppeteer' and (select count(*) from jsonb_object_keys(coalesce(e.stats -> 'repertoire', '{}'::jsonb))) >= 6 then 'Repertoire' end,
    case when e.kind = 'deck' and coalesce((e.stats ->> 'draws')::int, 0) >= 30 then 'Card Sharp' end,
    case when e.kind = 'deck' and coalesce((e.stats ->> 'foils')::int, 0) >= 3 then 'Gilded Hand' end,
    case when e.kind = 'deck' and coalesce((e.stats ->> 'complete')::boolean, false) then 'Arcana Complete' end,
    case when e.kind = 'glyph' and coalesce((e.stats ->> 'casts')::int, 0) >= 25 then 'Scribe' end,
    case when e.kind = 'glyph' and jsonb_array_length(coalesce(e.state -> 'known', '[]'::jsonb)) >= 20 then 'Spellwright' end,
    case when e.kind = 'glyph' and coalesce(e.state -> 'known', '[]'::jsonb) ?| array['rune', 'phoenix', 'void', 'omega'] then 'Keeper of Secrets' end], null)
$function$;

CREATE OR REPLACE FUNCTION private.ench_star_powers(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_kind
    when 'goose' then '[{"name": "Gilded Nest", "emoji": "✨", "text": "Platinum eggs come twice as often (6%)."},
                        {"name": "Fox Hunter", "emoji": "🦊", "text": "Chasing off a fox pays 15 Ink and 3 Luck."},
                        {"name": "Gosling", "emoji": "🐣", "text": "Every 5th egg hatches a gosling: a Rare-or-better roll ticket."}]'
    when 'genie' then '[{"name": "Fourth Wish", "emoji": "🪔", "text": "Holds 4 wishes."},
                        {"name": "Gift of Wishes", "emoji": "🎁", "text": "Once a day, spend a wish on a friend: they get 30 Ink and you get 10."},
                        {"name": "Master’s Boon", "emoji": "👑", "text": "Once a week, a free Epic-or-better roll ticket."}]'
    when 'map' then '[{"name": "Long Arm", "emoji": "🧭", "text": "Pick up pieces from 400 m away and dig from 250 m."},
                      {"name": "Quick Ink", "emoji": "✒️", "text": "A new map is ready in 5 hours, not 10."},
                      {"name": "Mother Lode", "emoji": "💎", "text": "Every chest holds an Epic+ ticket, and Legendary odds triple."}]'
    when 'parasite' then '[{"name": "Quick Jaws", "emoji": "🦷", "text": "Feeds in 14 hours, not 20."},
                           {"name": "Fast Evolver", "emoji": "🧬", "text": "Evolves after 2 and 6 meals, not 3 and 10."},
                           {"name": "Queen", "emoji": "👑", "text": "Every meal is 50% bigger."}]'
    when 'pandora' then '[{"name": "Lighter Lid", "emoji": "🗝️", "text": "Hope comes after 6 evils, not 7."},
                          {"name": "Gilded Gifts", "emoji": "🎁", "text": "Ink gifts from the box are doubled."},
                          {"name": "Greater Hope", "emoji": "🌈", "text": "Hope pays double and brings a Mythic ticket."}]'
    when 'clockwork' then '[{"name": "Mainspring", "emoji": "🌀", "text": "20 turns a day, and it holds 6 hours of charge."},
                            {"name": "Fine Gears", "emoji": "⚙️", "text": "Fast-forward gives 1.5× the time, and freezing costs half."},
                            {"name": "Toll of Hours", "emoji": "🔔", "text": "Once a day, ring it: every other enchantment you own jumps 30 minutes ahead."}]'
    when 'sizeray' then '[{"name": "Fourth Cell", "emoji": "🔋", "text": "Holds 4 shots."},
                          {"name": "Long Burn", "emoji": "⏳", "text": "Sizes on your own plots last twice as long."},
                          {"name": "Titan Beam", "emoji": "🗿", "text": "A PERFECT or GREAT grow on your plot makes it ×3."}]'
    when 'shard' then '[{"name": "Long Gaze", "emoji": "👀", "text": "Reflections last 36 hours, not 24."},
                        {"name": "Quicksilver", "emoji": "🪩", "text": "Gaze again after 12 hours, not 20."},
                        {"name": "Perfect Mirror", "emoji": "🪞", "text": "Its reflections shine with ★1 of the kind they show."}]'
    when 'wormhole' then '[{"name": "Quick Spiral", "emoji": "🌀", "text": "Opens again after 16 hours, not 24."},
                           {"name": "Steady Throat", "emoji": "🕳️", "text": "Every wormhole stays open 6 hours longer."},
                           {"name": "Third Mouth", "emoji": "🔺", "text": "Three-mouthed wormholes at any level, and chests come out double."}]'
    when 'oracle' then '[{"name": "Longer Sight", "emoji": "🃏", "text": "One more card in every prophecy."},
                         {"name": "Fate-Bender", "emoji": "✍️", "text": "One more rewrite per prophecy."},
                         {"name": "Third Eye", "emoji": "👁️", "text": "Holds one more gaze."}]'
    when 'splice' then '[{"name": "Spare Coil", "emoji": "⚗️", "text": "Holds one more charge."},
                         {"name": "Long Graft", "emoji": "🧷", "text": "Every splice lasts 50% longer."},
                         {"name": "Quaternion", "emoji": "✳️", "text": "Splice four at once: a Quad (3 charges)."}]'
    when 'ouroboros' then '[{"name": "Thick Scales", "emoji": "🛡️", "text": "Every loop is 25% less likely to bite."},
                            {"name": "Shed Skin", "emoji": "🐍", "text": "A bite takes only half the bank: the rest is paid."},
                            {"name": "World Serpent", "emoji": "🌍", "text": "Every loop banks double Ink."}]'
    when 'homunculus' then '[{"name": "Quickening", "emoji": "⚡", "text": "Wakes with one part fewer."},
                             {"name": "Long Life", "emoji": "🕯️", "text": "Walks 10 days, not 7, and can be led 3 times a day."},
                             {"name": "Philosopher’s Heart", "emoji": "❤️‍🔥", "text": "Its heart pays double and brings one more Enchanted Luck."}]'
    when 'stormcoil' then '[{"name": "Twin Storms", "emoji": "⛈️", "text": "One more storm a day."},
                            {"name": "Ball Lightning", "emoji": "🔮", "text": "Every bolt you catch pays double."},
                            {"name": "Eye of the Storm", "emoji": "🌪️", "text": "Missed bolts never scorch, and Aberrations strike twice as often."}]'
    when 'spyglass' then '[{"name": "Wide Lens", "emoji": "🔭", "text": "Holds 4 looks, and they come back faster."},
                           {"name": "Long Glass", "emoji": "🌄", "text": "Looks reach 3 km instead of 1 km."},
                           {"name": "Second Sight", "emoji": "👁️", "text": "Once a day, take a second reading of a sighted plot and keep the better one."}]'
    when 'origami' then '[{"name": "Deep Pocket", "emoji": "👝", "text": "Holds 3 folded plots."},
                          {"name": "Paper Crane", "emoji": "🕊️", "text": "Unfold up to 50 km from your explorer."},
                          {"name": "Living Fold", "emoji": "✨", "text": "Fold an enchanted plot, creature and all."}]'
    when 'crucible' then '[{"name": "Great Bellows", "emoji": "🌬️", "text": "+25% Heat from every melt."},
                           {"name": "Master Smith", "emoji": "🔨", "text": "A free rune on every strike."},
                           {"name": "Masterwork", "emoji": "⚒️", "text": "Once a week, a forged plot jumps two tiers."}]'
    when 'puppeteer' then '[{"name": "Second String", "emoji": "🧵", "text": "Strings come back twice as fast (2 an hour)."},
                            {"name": "Long Strings", "emoji": "🌍", "text": "Pull strings on plots anywhere on Earth."},
                            {"name": "Grand Show", "emoji": "🎪", "text": "Once a day, a puppet run pays ×3."}]'
    when 'deck' then '[{"name": "Fourth Card", "emoji": "🃏", "text": "A fourth face-down card to choose from."},
                       {"name": "Hold", "emoji": "✋", "text": "Keep a turned card in your hand and play it later."},
                       {"name": "Fate’s Favourite", "emoji": "🌟", "text": "Once a day, turn a reversed card upright."}]'
    when 'glyph' then '[{"name": "Deeper Well", "emoji": "💧", "text": "+2 mana."},
                        {"name": "Chain Cast", "emoji": "⛓️", "text": "Cast two glyphs at once, 50% stronger."},
                        {"name": "Archmage", "emoji": "🧙", "text": "Once a day, a glyph casts at full strength however you draw it."}]'
    else '[]' end::jsonb
$function$;

CREATE OR REPLACE FUNCTION private.lev_move(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (('{"goose": ["Egg Bomb", 1.0, 1.0, null], "genie": ["Wish of Ruin", 0.4, 2.4, null], "map": ["Buried Cannon", 1.1, 1.1, null],
            "parasite": ["Leech", 1.0, 1.0, null], "pandora": ["Unleash an Evil", 0.5, 2.0, null],
            "splice": ["Chimera Strike", 1.3, 1.3, null], "clockwork": ["Freeze Time", 0.4, 0.4, "freeze"], "sizeray": ["Shrink Ray", 0.4, 0.4, "shrink"],
            "shard": ["Reflect the Roar", 1.2, 1.2, null], "wormhole": ["Pull Through", 0.6, 0.6, "pull"], "oracle": ["Foretell the Weak Spot", 0.4, 0.4, "foretell"],
            "ouroboros": ["Constrict", 0.8, 1.6, null], "homunculus": ["Patchwork Punch", 0.5, 2.0, null], "stormcoil": ["Lightning Strike", 1.0, 1.8, null],
            "spyglass": ["Spot the Weak Spot", 0.4, 0.4, "foretell"], "origami": ["Paper Shield", 0.6, 0.6, "decoy"], "crucible": ["Molten Pour", 1.1, 2.1, null],
            "puppeteer": ["Tangle the Strings", 0.5, 0.5, "pull"], "deck": ["The Tower", 0.2, 5.0, null], "glyph": ["Thunder Glyph", 0.8, 2.2, null]}'::jsonb) -> p_kind)
$function$;

CREATE OR REPLACE FUNCTION private.ench_pay(p_id uuid, p_base numeric, p_what text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare e public.enchantments; p jsonb; v numeric := greatest(coalesce(p_base, 0), 0); v_mods jsonb := '[]'::jsonb; v_paid int := 0; v_extra int := 0;
  k int; b record; v_echo boolean := false; v_gift int; v_to uuid; v_x numeric; v_spread numeric := 0; v_xp int := 1; v_ab text; v_lk jsonb;
  v_cell int[]; v_chests int := 0; v_open int; v_cap int := coalesce((private.ench_cfg() ->> 'seek_chest_cap')::int, 25);
  v_chest_ink int := coalesce((private.ench_cfg() ->> 'seek_chest_ink')::int, 50); v_gene text;
begin
  select * into e from public.enchantments where id = p_id;
  if e.owner_id is null or v <= 0 then return jsonb_build_object('paid', 0, 'base', 0, 'mods', '[]'::jsonb, 'chests', 0); end if;
  if e.level > 1 then
    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * (e.level - 1));
    v_mods := v_mods || jsonb_build_object('label', 'Level ' || e.level, 'emoji', '⭐');
  end if;
  if coalesce(e.stars, 0) > 0 then
    v := v * (1 + 0.1 * e.stars);
    v_mods := v_mods || jsonb_build_object('label', repeat('★', e.stars) || ' +' || (10 * e.stars) || '%', 'emoji', '🌟');
  end if;
  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop
    k := least(greatest(coalesce((p ->> 'strength')::int, 1), 1), 3);
    v_gene := p ->> 'gene';
    -- 🧫 Patchwork: this reward borrows a Trait from one of the Homunculus's parts
    if v_gene = 'patchwork' then
      v_gene := private.homu_borrow((p ->> 'id')::uuid);
      v_mods := v_mods || jsonb_build_object('label', 'Patchwork borrowed ' || coalesce(
        (select private.ench_info(kk) ->> 'gene_name' from unnest(private.ench_kinds()) kk where private.ench_info(kk) ->> 'gene' = v_gene limit 1), 'a stitch'), 'emoji', '🧫');
    end if;
    case v_gene
      when 'golden' then v := v * (1 + 0.5 * k); v_mods := v_mods || jsonb_build_object('label', 'Golden ×' || (1 + 0.5 * k)::text, 'emoji', '🪿');
      when 'grow' then v := v * (1 + k); v_mods := v_mods || jsonb_build_object('label', 'Giant ×' || (1 + k)::text, 'emoji', '📡');
      when 'chaos' then
        v_x := (array[0.5, 0.75, 1.0])[k] + random() * (array[2.0, 2.75, 3.0])[k];
        v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Chaos ×' || round(v_x, 2), 'emoji', '🏺');
      when 'seek' then
        if random() < 0.25 * k then
          select count(*) into v_open from public.seek_chests where player_id = e.owner_id and dug_at is null and expires_at > now();
          if v_open < v_cap then
            -- a real chest, buried right by its plot: dig it up from the Grimoire or the map
            v_cell := private.ench_free_cell(e.gx, e.gy, 2, 7);
            insert into public.seek_chests (player_id, enchant_id, source_id, finder_kind, gx, gy, ink)
            values (e.owner_id, e.id, case when p ->> 'id' is not null then (p ->> 'id')::uuid end, e.kind, v_cell[1], v_cell[2], v_chest_ink);
            v_chests := v_chests + 1;
            v_mods := v_mods || jsonb_build_object('label', 'Seeking: a chest buried by its plot — dig it up!', 'emoji', '🧰');
          else
            v_extra := v_extra + v_chest_ink;
            v_mods := v_mods || jsonb_build_object('label', 'Seeking: a chest +' || v_chest_ink || ' (paid now — ' || v_cap || ' are waiting)', 'emoji', '🧰');
          end if;
        end if;
      when 'spread' then
        v := v * (1 + 0.15 * k); v_spread := greatest(v_spread, 0.1 * k);
        v_mods := v_mods || jsonb_build_object('label', 'Spreading +' || (15 * k) || '%', 'emoji', '🦠');
      when 'echo' then
        if random() < (array[0.35, 0.6, 0.8])[k] then v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Echo! Paid twice', 'emoji', '🪞'); end if;
      when 'linked' then v := v * (1 + 0.4 * k); v_mods := v_mods || jsonb_build_object('label', 'Linked: a second plot +' || (40 * k) || '%', 'emoji', '🌀');
      when 'foresight' then v := v * (1 + 0.2 * k); v_mods := v_mods || jsonb_build_object('label', 'Foresight +' || (20 * k) || '%', 'emoji', '👁️');
      when 'endless' then v := v * (1 + 0.1 * k); v_mods := v_mods || jsonb_build_object('label', 'Endless +' || (10 * k) || '%', 'emoji', '🐍');
      when 'charged' then v := v * (1 + 0.25 * k); v_mods := v_mods || jsonb_build_object('label', 'Charged +' || (25 * k) || '%', 'emoji', '⚡');
      when 'farsight' then v := v * (1 + 0.15 * k); v_mods := v_mods || jsonb_build_object('label', 'Farsight +' || (15 * k) || '%', 'emoji', '🔭');
      when 'folded' then v := v * (1 + 0.1 * k); v_mods := v_mods || jsonb_build_object('label', 'Folded +' || (10 * k) || '%', 'emoji', '🦢');
      when 'strings' then
        v := v * (1 + 0.15 * k); v_mods := v_mods || jsonb_build_object('label', 'Strings +' || (15 * k) || '%', 'emoji', '🎭');
        -- once a day a puppet plays the reward again
        if coalesce(e.stats ->> 'strings_day', '') <> private.today()::text then
          v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Strings: a puppet played it twice', 'emoji', '🎭');
          update public.enchantments set stats = stats || jsonb_build_object('strings_day', private.today()::text) where id = p_id;
          e.stats := e.stats || jsonb_build_object('strings_day', private.today()::text);
        end if;
      when 'fated' then
        if random() < (array[0.1, 0.18, 0.25])[k] then
          v_x := (array[2, 2, 3, 5])[1 + floor(random() * 4)::int];
          v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Fated: ' || (select c ->> 'name' from jsonb_array_elements(private.deck_cards()) c order by random() limit 1) || ' ×' || v_x, 'emoji', '🃏');
        end if;
      when 'inscribed' then
        update public.enchantments set stats = stats || jsonb_build_object('ins_n', coalesce((stats ->> 'ins_n')::int, 0) + 1) where id = p_id returning stats into e.stats;
        if (e.stats ->> 'ins_n')::int % 4 = 0 then
          v := v * (array[1.75, 2.5, 3])[k]; v_mods := v_mods || jsonb_build_object('label', 'Inscribed ×' || (array[1.75, 2.5, 3])[k], 'emoji', '✍️');
        end if;
      -- (Tempo shows its worth on clocks; borrowed by Patchwork it pays a little)
      when 'tempo' then
        if (p ->> 'gene') = 'patchwork' then v := v * 1.15; v_mods := v_mods || jsonb_build_object('label', 'Tempo +15%', 'emoji', '⚙️'); end if;
      -- Wishing keeps a charge where there are charges; anywhere else it pays
      when 'wish' then
        if e.kind not in ('genie', 'sizeray', 'oracle') then
          v := v * (1 + 0.25 * k); v_mods := v_mods || jsonb_build_object('label', 'Wishing +' || (25 * k) || '%', 'emoji', '🧞');
        end if;
      -- Trickster dodges bad luck where there is bad luck; anywhere else it pays
      when 'trick' then
        if e.kind not in ('goose', 'genie', 'pandora', 'ouroboros', 'stormcoil') then
          v := v * (1 + 0.2 * k); v_mods := v_mods || jsonb_build_object('label', 'Tempered +' || (20 * k) || '%', 'emoji', '🔥');
        end if;
      -- what a plot lends
      when 'inspired' then v := v * 1.2; v_mods := v_mods || jsonb_build_object('label', 'Inspired by your canvas +20%', 'emoji', '🎨');
      when 'wild' then v := v * 1.1; v_xp := v_xp + 1; v_mods := v_mods || jsonb_build_object('label', 'Wild +10% · double XP', 'emoji', '🐾');
      when 'fertile' then v := v * 1.25; v_mods := v_mods || jsonb_build_object('label', 'Fertile farm +25%', 'emoji', '🌾');
      when 'invested' then v_extra := v_extra + 10; v_mods := v_mods || jsonb_build_object('label', 'Invested +10', 'emoji', '💼');
      when 'streak' then
        if random() < 0.2 then v := v * 2; v_mods := v_mods || jsonb_build_object('label', 'Arcade streak ×2', 'emoji', '🕹️'); end if;
      when 'homely' then v := v * 1.15; v_mods := v_mods || jsonb_build_object('label', 'At home +15%', 'emoji', '🏡');
      else null;
    end case;
    -- an Aberration's secret
    v_ab := p ->> 'aberration';
    if v_ab is not null then
      case v_ab
        when 'The Hollow King' then v_xp := v_xp + 2; v_mods := v_mods || jsonb_build_object('label', 'The Hollow King: triple XP', 'emoji', '👑');
        when 'Glitchwing' then if random() < 0.1 then v_lk := private.ench_give_luck(e.owner_id, 0, 1); v_mods := v_mods || jsonb_build_object('label', 'Glitchwing: +1 Enchanted Luck', 'emoji', '🦋'); end if;
        when 'Many-Mouth' then v_lk := private.ench_give_luck(e.owner_id, 3, 0); v_mods := v_mods || jsonb_build_object('label', 'Many-Mouth: +3 Luck', 'emoji', '👄');
        when 'The Unwritten' then v_extra := v_extra + 25; v_mods := v_mods || jsonb_build_object('label', 'The Unwritten +25', 'emoji', '📜');
        when 'Starspawn' then if random() < 0.2 then v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Starspawn: paid twice', 'emoji', '🌟'); end if;
        when 'Ninefold' then v := v * 1.5; v_mods := v_mods || jsonb_build_object('label', 'Ninefold ×1.5', 'emoji', '🐍');
        else null;
      end case;
    end if;
  end loop;
  -- a grown reward (Size Ray) or an overcharge (a Storm Coil's bolt) is used up here
  for b in delete from public.enchant_buffs where id = (select id from public.enchant_buffs where enchant_id = p_id and kind = 'next_reward' and expires_at > now() order by id limit 1) returning mult, data loop
    v := v * b.mult;
    v_mods := v_mods || case when b.data ->> 'by' = 'storm' then jsonb_build_object('label', 'Overcharged ×' || round(b.mult, 2), 'emoji', '⚡')
                             else jsonb_build_object('label', 'Size-rayed ×' || round(b.mult, 2), 'emoji', '📡') end;
  end loop;
  -- ✨ a glow (a card, a glyph): your enchantments pay more for a while
  select exp(sum(ln(greatest(mult, 0.01)))) into v_x from public.enchant_buffs where player_id = e.owner_id and kind = 'glow' and expires_at > now();
  if v_x is not null and v_x <> 1 then v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Glow ×' || round(v_x, 2), 'emoji', '✨'); end if;
  -- ⚒️ a full set of the Crucible's artifacts
  if private.cru_set(e.owner_id) then v := v * 1.05; v_mods := v_mods || jsonb_build_object('label', 'Smith’s Set +5%', 'emoji', '⚒️'); end if;
  -- Pandora's Plague
  if exists (select 1 from public.enchant_buffs where player_id = e.owner_id and kind = 'curse_plague' and expires_at > now()) then
    v := v * 0.7; v_mods := v_mods || jsonb_build_object('label', 'Plague ×0.7', 'emoji', '🦠');
  end if;
  v := round(v) + v_extra;
  if v_echo then v := v * 2; end if;
  v_paid := private.grant_ink_paced(e.owner_id, v::int, 'enchantment', 'enchantment', p_id::text, null);
  -- Spreading: a spore of it lands on a random player
  if v_spread > 0 and v_paid > 0 then
    v_gift := greatest(1, round(v_paid * v_spread))::int;
    select id into v_to from public.players where id <> e.owner_id and status = 'active' and last_active_at > now() - interval '7 days' order by random() limit 1;
    if v_to is not null then
      perform private.grant_ink_paced(v_to, v_gift, 'enchantment', 'enchantment', p_id::text, null);
      perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'spore', 'ink', v_gift, 'kind', e.kind));
    end if;
  end if;
  perform private.ench_stat(p_id, 'ink', v_paid);
  perform private.ench_xp(p_id, v_xp);
  perform private.ench_event(p_id, 'paid', jsonb_build_object('what', p_what, 'ink', v_paid, 'base', round(p_base), 'mods', v_mods, 'chests', v_chests));
  return jsonb_build_object('paid', v_paid, 'base', round(p_base), 'mods', v_mods, 'chests', v_chests);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_minigame_mult(p_uid uuid, p_gx integer, p_gy integer)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
declare m numeric := 1; b record; v_sz jsonb; w record; sp record; v_g text; v_f jsonb;
begin
  v_sz := private.plot_size(p_gx, p_gy);
  if v_sz is not null and (v_sz ->> 'owner')::uuid = p_uid then
    m := m * case when v_sz ->> 'mode' = 'grow' then (v_sz ->> 'mult')::numeric else coalesce((v_sz ->> 'mult')::numeric, 0.7) end;
  end if;
  for b in update public.enchant_buffs set uses = uses - 1 where id = (select id from public.enchant_buffs where player_id = p_uid and kind = 'golden_hour' and expires_at > now() and uses > 0 order by id limit 1) returning mult loop
    m := m * b.mult;
  end loop;
  for b in update public.enchant_buffs set uses = uses - 1 where id = (select id from public.enchant_buffs where player_id = p_uid and kind = 'curse_strife' and expires_at > now() and uses > 0 order by id limit 1) returning mult loop
    m := m * b.mult;
  end loop;
  delete from public.enchant_buffs where player_id = p_uid and uses is not null and uses <= 0;
  -- a Wormhole: either end pays 30% more
  for w in select e.id from public.enchantments e where e.kind = 'wormhole' and e.status = 'active' and e.owner_id = p_uid
             and coalesce((e.state -> 'open' ->> 'until')::numeric, 0) > extract(epoch from now())
             and ((e.gx = p_gx and e.gy = p_gy) or ((e.state -> 'open' ->> 'gx2')::int = p_gx and (e.state -> 'open' ->> 'gy2')::int = p_gy)
                  or ((e.state -> 'open' ->> 'gx3')::int = p_gx and (e.state -> 'open' ->> 'gy3')::int = p_gy)) limit 1 loop
    m := m * 1.3;
    perform private.ench_stat(w.id, 'echoes');
  end loop;
  -- a plot spliced with an enchantment wears its trait
  for sp in select s.*, e.kind ek, e.id eid from public.enchant_splices s join public.enchantments e on e.id = s.a
             where s.mode = 'plot' and s.ends_at > now() and s.player_id = p_uid
               and ((s.plot_gx = p_gx and s.plot_gy = p_gy)
                    or exists (select 1 from public.canvas_group_members m1 join public.canvas_group_members m2 on m2.group_id = m1.group_id
                                where m1.gx = s.plot_gx and m1.gy = s.plot_gy and m2.gx = p_gx and m2.gy = p_gy)) limit 2 loop
    v_g := private.ench_info(sp.ek) ->> 'gene';
    if v_g = 'patchwork' then v_g := private.homu_borrow(sp.eid); end if;
    m := m * case v_g when 'golden' then 1.5 when 'grow' then 2 when 'chaos' then 0.5 + random() * 2 when 'seek' then case when random() < 0.25 then 1.5 else 1 end
                      when 'spread' then 1.15 when 'echo' then case when random() < 0.35 then 2 else 1 end when 'wish' then 1.25 when 'trick' then 1.2
                      when 'tempo' then 1.3 when 'linked' then 1.4 when 'foresight' then 1.2 when 'endless' then 1.1 when 'charged' then 1.25 when 'farsight' then 1.15 when 'folded' then 1.1 when 'strings' then 1.15 when 'fated' then case when random() < 0.1 then 2 else 1 end
                      when 'inscribed' then 1.1 when 'homely' then 1.15 else 1 end;
  end loop;
  -- a Glyphcaster's Growth, a Puppeteer's Grand Show: this plot's next win
  for b in update public.enchant_buffs set uses = uses - 1 where id = (select id from public.enchant_buffs where player_id = p_uid and kind in ('glyph_leaf', 'grand_show')
             and gx = p_gx and gy = p_gy and expires_at > now() and uses > 0 order by id limit 1) returning mult loop
    m := m * b.mult;
  end loop;
  -- the Crucible's inlay and lantern, and the Origami's fresh crease
  m := m * private.forge_plot_mult(p_uid, p_gx, p_gy);
  -- the Oracle's fortune for this win
  v_f := private.oracle_take(p_uid, 'reward');
  if v_f is not null then m := m * coalesce((v_f ->> 'mult')::numeric, 1); end if;
  return m * private.ench_plot_mult_extra(p_uid, p_gx, p_gy);
end $function$;

CREATE OR REPLACE FUNCTION public.svc_finish_minigame(p_session_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
  v_held boolean := false; v_record jsonb; v_best_before int; v_rarity_mult numeric := 1; v_limit int; v_practice boolean := false;
  v_game jsonb; v_plot_record jsonb; v_cleared int := 0; v_total int := 1; v_per_round numeric; v_boost numeric := 1; v_table jsonb; v_bonus numeric := 0; v_mask jsonb; v_unlimited boolean;
  v_quality jsonb; v_bonus_res jsonb := jsonb_build_object('ink', 0, 'hits', '[]'::jsonb); v_perf numeric := 0; v_breakdown jsonb;
begin
  select * into v_s from public.minigame_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  if v_s.status <> 'active' then raise exception 'session_closed' using errcode = 'P0001', detail = v_s.status; end if;
  if now() > v_s.expires_at + interval '1 minute' then
    update public.minigame_sessions set status = 'expired', finished_at = now() where id = p_session_id;
    return jsonb_build_object('status', 'expired', 'passed', false, 'score', 0);
  end if;
  v_rw := v_cfg -> 'rewards';
  v_game := coalesce(v_cfg -> 'games' -> v_s.game, '{}'::jsonb);
  v_elapsed := extract(epoch from (now() - v_s.started_at)) * 1000;
  select coalesce(array_agg(f), '{}') into v_flags from jsonb_array_elements_text(coalesce(p_result -> 'flags', '[]'::jsonb)) f;
  v_valid := coalesce((p_result ->> 'valid')::boolean, false);
  if coalesce((p_result ->> 'min_duration_ms')::numeric, 0) > v_elapsed + 2000 then
    v_valid := false;
    v_flags := array_append(v_flags, 'faster_than_server_clock');
  end if;
  v_passed := v_valid and coalesce((p_result ->> 'passed')::boolean, false);
  v_score := case when v_valid then greatest(0, least(coalesce((p_result ->> 'score')::int, 0), 100000)) else 0 end;
  v_stars := case when v_passed then greatest(0, least(coalesce((p_result ->> 'stars')::int, 0), 3)) else 0 end;
  -- each cleared round pays its share of the level's Ink; clearing them all beats the level
  v_total := greatest(coalesce((p_result ->> 'rounds_total')::int, v_s.rounds, 1), 1);
  v_cleared := case when v_valid then least(greatest(coalesce((p_result ->> 'rounds_passed')::int, case when v_passed then v_total else 0 end), 0), v_total) else 0 end;
  -- a level is only beaten (and only pays Ink) when every round is cleared
  if v_passed and v_cleared < v_total then v_passed := false; v_stars := 0; end if;

  -- how well each round went (0-100), for bonus rules and the operator's stats
  v_quality := case when v_valid and jsonb_typeof(p_result -> 'rounds_quality') = 'array' then p_result -> 'rounds_quality' else '[]'::jsonb end;

  select best_score into v_best_before from public.minigame_records where player_id = v_s.player_id and game = v_s.game;
  update public.minigame_sessions
     set status = case when v_valid then 'validated' else 'rejected' end,
         finished_at = now(), score = v_score, passed = v_passed, stars = v_stars,
         summary = p_result -> 'summary', flags = v_flags, quality = v_quality,
         play_ms = case when v_valid then least(greatest(coalesce((p_result ->> 'min_duration_ms')::numeric, 0), 0), v_elapsed + 2000)::int end,
         review_status = case when v_valid and coalesce((p_result ->> 'suspicious')::boolean, false) then 'flagged' else 'none' end
   where id = p_session_id;

  insert into public.minigame_records (player_id, game, highest_level, best_score, total_score, plays, wins, last_played_at)
  values (v_s.player_id, v_s.game, case when v_passed then v_s.level else 0 end, v_score, v_score, 1,
          case when v_passed then 1 else 0 end, now())
  on conflict (player_id, game) do update set
    highest_level = greatest(public.minigame_records.highest_level, case when v_passed then v_s.level else 0 end),
    best_score = greatest(public.minigame_records.best_score, v_score),
    total_score = public.minigame_records.total_score + v_score,
    plays = public.minigame_records.plays + 1,
    wins = public.minigame_records.wins + case when v_passed then 1 else 0 end,
    last_played_at = now()
  returning jsonb_build_object('highest_level', highest_level, 'best_score', best_score, 'plays', plays, 'wins', wins) into v_record;

  -- every plot keeps its own level progress for its game (a new owner starts fresh)
  if v_s.gx is not null then
    insert into public.plot_game_progress (gx, gy, player_id, game, highest_level, best_score, plays, wins, updated_at)
    values (v_s.gx, v_s.gy, v_s.player_id, v_s.game, case when v_passed then v_s.level else 0 end, v_score, 1, case when v_passed then 1 else 0 end, now())
    on conflict (gx, gy, player_id) do update set
      game = excluded.game,
      highest_level = greatest(public.plot_game_progress.highest_level, excluded.highest_level),
      best_score = greatest(public.plot_game_progress.best_score, excluded.best_score),
      plays = public.plot_game_progress.plays + 1,
      wins = public.plot_game_progress.wins + excluded.wins,
      updated_at = now()
    returning jsonb_build_object('highest_level', highest_level, 'best_score', best_score, 'plays', plays, 'wins', wins) into v_plot_record;
  end if;

  if v_valid then
    select coalesce(wp.level, 1), coalesce(r.ink_reward_multiplier, 1) into v_plot_level, v_rarity_mult
    from public.world_plots wp left join public.plot_rarities r on r.id = wp.rarity
    where wp.gx = v_s.gx and wp.gy = v_s.gy and wp.owner_id = v_s.player_id;
    select count(*) into v_today from public.minigame_rewards mr join public.minigame_sessions ms on ms.id = mr.session_id
    where mr.player_id = v_s.player_id and ms.game = v_s.game and mr.ink > 0 and mr.created_at >= private.day_start(now());
    -- the operator can switch the daily cap on paid runs off entirely
    v_unlimited := private.ink_uncapped() or not coalesce((v_cfg ->> 'limit_paid_runs')::boolean, true);
    v_limit := case when v_unlimited then 2147483647 else coalesce((v_cfg ->> 'daily_rewarded_wins_per_game')::int, 6) end;
    v_mult := (1 + coalesce((v_game ->> 'plot_level_bonus')::numeric, (v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_plot_level, 1) - 1)) * coalesce(v_rarity_mult, 1);
    -- a live boost on this game multiplies its Ink until it ends
    if v_game ? 'boost' and coalesce((v_game -> 'boost' ->> 'multiplier')::numeric, 1) > 1
       and (v_game -> 'boost' ->> 'ends_at' is null or (v_game -> 'boost' ->> 'ends_at')::timestamptz > now()) then
      v_boost := least((v_game -> 'boost' ->> 'multiplier')::numeric, 50);
    end if;
    v_ink_mult := v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0)
                         * greatest(coalesce((v_cfg -> 'games' -> v_s.game ->> 'ink_multiplier')::numeric, 1), 0) * v_boost;
    -- level_ink[level] pays once, for completing the level (every round cleared);
    -- round_ink[round] pays for each round cleared, by its position (round 1, round 2, …)
    v_table := v_game -> 'level_ink';
    v_per_round := case when jsonb_typeof(v_table) = 'array' and jsonb_array_length(v_table) > 0
      then (v_table ->> (least(v_s.level, jsonb_array_length(v_table)) - 1))::numeric else 0 end;  -- (level-complete Ink)
    if v_passed and v_today < v_limit then
      v_mask := p_result -> 'rounds_mask';
      if jsonb_typeof(v_game -> 'round_ink') = 'array' then
        select coalesce(sum(coalesce((v_game -> 'round_ink' ->> (k - 1))::numeric, 0)), 0) into v_bonus
        from generate_series(1, v_total) k
        where case when jsonb_typeof(v_mask) = 'array' then coalesce((v_mask ->> (k - 1))::boolean, false) else k <= v_cleared end;
      end if;
      -- performance bonuses: tiers per round, every round above X%, N rounds above X%, average above X%
      v_bonus_res := private.bonus_ink(v_game -> 'bonuses', v_quality, v_mask, v_total, v_passed);
      v_perf := greatest(coalesce((v_bonus_res ->> 'ink')::numeric, 0), 0);
      v_ink := floor((greatest(coalesce(v_per_round, 0), 0) + greatest(v_bonus, 0) + v_perf) * v_ink_mult);
      -- hidden pacing: what's shown is what's paid
      v_ink := floor(v_ink * private.ench_minigame_mult(v_s.player_id, v_s.gx, v_s.gy))::int;
      v_ink := private.ink_pace(v_s.player_id, v_ink, 'minigame');
      if v_passed then
        v_bp := floor(((v_rw ->> 'brush_points_base')::numeric + (v_rw ->> 'brush_points_per_star')::numeric * v_stars) * least(v_mult, 1.5));
        v_pig := case when v_stars >= 3 then floor((v_rw ->> 'pigments_on_three_stars')::numeric * least(v_mult, 1.5)) else 0 end;
      else
        v_bp := (v_rw ->> 'fail_brush_points')::int;
      end if;
    elsif v_passed then
      v_practice := true;
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    else
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    end if;
    v_held := coalesce((p_result ->> 'suspicious')::boolean, false);
    if v_ink > 0 and private.ink_pace_factor() < 1 then
      v_ink_mult := v_ink_mult * private.ink_pace_factor();
    end if;
    v_breakdown := jsonb_build_object(
      'level_ink', case when v_passed and v_cleared > 0 and not v_practice then floor(greatest(coalesce(v_per_round, 0), 0) * v_ink_mult) else 0 end,
      'round_ink', case when v_practice or not v_passed then 0 else floor(greatest(v_bonus, 0) * v_ink_mult) end,
      'bonus_ink', case when v_practice or not v_passed then 0 else floor(v_perf * v_ink_mult) end,
      'bonuses', case when v_practice or not v_passed then '[]'::jsonb else coalesce(v_bonus_res -> 'hits', '[]'::jsonb) end,
      'multiplier', round(coalesce(v_ink_mult, 0), 3), 'rarity', coalesce(v_rarity_mult, 1), 'plot_level', coalesce(v_plot_level, 1), 'boost', v_boost,
      'capped', v_practice, 'rounds_cleared', v_cleared, 'rounds', v_total);
    insert into public.minigame_rewards (session_id, player_id, ink, pigments, brush_points, multiplier, held, breakdown)
    values (p_session_id, v_s.player_id, v_ink, v_pig, v_bp, round(v_ink_mult, 3), v_held, v_breakdown);
    if v_held then
      insert into public.moderation_cases (kind, priority, session_id, subject_player_id, reason, details)
      values ('score_review', 2, p_session_id, v_s.player_id, 'suspicious_minigame_result',
              jsonb_build_object('flags', v_flags, 'score', v_score, 'game', v_s.game, 'level', v_s.level));
    else
      perform set_config('landvas.ink_paced', '1', true);
      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);
      perform set_config('landvas.ink_paced', '', true);
      if v_ink > 0 then perform private.referral_qualify(v_s.player_id, 'first_win'); end if;
      -- the live feed: a cleared level (at most one minigame event per player every few minutes)
      if v_passed and not exists (select 1 from public.feed_events f where f.player_id = v_s.player_id and f.kind = 'minigame'
                                  and f.created_at > now() - interval '3 minutes') then
        insert into public.feed_events (kind, player_id, data)
        values ('minigame', v_s.player_id, jsonb_build_object('game', v_s.game, 'level', v_s.level, 'stars', v_stars));
      end if;
    end if;
  end if;

  -- 🎭 a puppet run: the owner is tipped, the Puppeteer paid
  if v_s.puppet_id is not null and v_valid then perform private.puppet_done(v_s.id, v_ink, v_passed, v_score); end if;
  return jsonb_build_object(
    'status', case when v_valid then 'validated' else 'rejected' end,
    'valid', v_valid, 'passed', v_passed, 'score', v_score, 'stars', v_stars, 'flags', to_jsonb(v_flags),
    'new_best', v_score > coalesce(v_best_before, 0),
    'rewards', jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp, 'held', v_held,
                                  'multiplier', round(coalesce(v_ink_mult, 0), 3), 'practice', v_practice,
                                  'rounds_cleared', v_cleared, 'rounds', v_total, 'level_ink', case when v_passed then floor(coalesce(v_per_round, 0) * v_ink_mult) else 0 end, 'boost', v_boost,
                                  'rewarded_left', case when v_unlimited then null else greatest(coalesce(v_limit, 0) - coalesce(v_today, 0) - case when v_ink > 0 then 1 else 0 end, 0) end,
                                  'unlimited', coalesce(v_unlimited, false), 'round_ink', case when v_ink > 0 then floor(v_bonus * coalesce(v_ink_mult, 1)) else 0 end,
                                  'bonus_ink', case when v_ink > 0 then floor(v_perf * coalesce(v_ink_mult, 1)) else 0 end, 'bonuses', case when v_ink > 0 then coalesce(v_bonus_res -> 'hits', '[]'::jsonb) else '[]'::jsonb end,
                                  'quality', v_quality,
                                  'resets_at', private.day_start(now()) + interval '1 day'),
    'record', v_record,
    'plot_record', v_plot_record,
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $function$;

CREATE OR REPLACE FUNCTION private.ench_act_shard(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); r jsonb; v_o jsonb; v_pick jsonb; v_cracks int; v_lk jsonb; v_shat boolean := false;
begin
  case p_action
    when 'gaze' then
      if coalesce((s -> 'reflect' ->> 'until')::numeric, 0) > v_now then raise exception 'reflecting' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 * (case when e.stars >= 2 then 0.6 else 1 end) > v_now and jsonb_array_length(coalesce(s -> 'options', '[]'::jsonb)) = 0 then
        raise exception 'too_soon' using errcode = 'P0001'; end if;
      if jsonb_array_length(coalesce(s -> 'options', '[]'::jsonb)) = 0 then
        -- three other players' enchantments (one per kind), else dreams of kinds
        select coalesce(jsonb_agg(o.j), '[]'::jsonb) into v_o from (
          select jsonb_build_object('kind', x.kind, 'id', x.id, 'serial', x.serial, 'owner', x.owner_id, 'owner_name', pr.username, 'level', x.level) j
            from (select distinct on (kind) * from public.enchantments where status = 'active' and owner_id is not null and owner_id <> e.owner_id
                   and kind not in ('splice', 'shard', 'wormhole', 'oracle', 'ouroboros', 'homunculus', 'stormcoil', 'origami', 'crucible', 'cuckoo', 'puppeteer') order by kind, random()) x join public.profiles pr on pr.id = x.owner_id
           order by random() limit 3) o;
        while jsonb_array_length(v_o) < 3 loop
          v_o := v_o || jsonb_build_array(jsonb_build_object('kind', (array['goose', 'genie', 'map', 'parasite', 'spyglass', 'pandora', 'clockwork', 'sizeray'])[1 + floor(random() * 8)::int], 'dream', true));
        end loop;
        s := s || jsonb_build_object('options', v_o, 'gazed_at', v_now);
      end if;
      r := jsonb_build_object('options', s -> 'options');
    when 'step' then
      v_pick := s -> 'options' -> ((a ->> 'i')::int);
      if v_pick is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      v_cracks := coalesce((s ->> 'cracks')::int, 0) + 1;
      s := s || jsonb_build_object('reflect', v_pick || jsonb_build_object('until', v_now + private.ench_n('shard', 'hours', 24) * 3600 * case when e.stars >= 1 then 1.5 else 1 end, 'from', v_now),
                                   'r', private.ench_init(v_pick ->> 'kind', t), 'options', '[]'::jsonb, 'cracks', v_cracks);
      if v_pick ->> 'owner' is not null then
        perform private.grant_ink_paced((v_pick ->> 'owner')::uuid, 3, 'enchantment', 'mirror_tip', e.id::text, null);
        perform private.notify((v_pick ->> 'owner')::uuid, 'enchant', e.owner_id, jsonb_build_object('sub', 'mirror_seen', 'kind', v_pick ->> 'kind', 'ink', 3));
      end if;
      perform private.ench_stat(e.id, 'reflections');
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'reflect', jsonb_build_object('kind', v_pick ->> 'kind', 'owner', v_pick ->> 'owner_name'));
      if v_cracks >= 7 then
        v_shat := true; v_lk := private.ench_give_luck(e.owner_id, 20, 1);
        s := s || jsonb_build_object('cracks', 0);
        perform private.ench_stat(e.id, 'shatters');
        perform private.ench_event(e.id, 'shatter', '{}'::jsonb);
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'shatter', 'kind', 'shard', 'serial', e.serial));
      end if;
      r := jsonb_build_object('reflect', s -> 'reflect', 'shattered', v_shat);
    when 'release' then
      if coalesce((s -> 'reflect' ->> 'until')::numeric, 0) <= v_now then raise exception 'not_reflecting' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('reflect', null, 'r', null);
      r := jsonb_build_object('released', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

