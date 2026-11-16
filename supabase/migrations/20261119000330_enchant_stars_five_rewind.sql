-- Enchantments, part 12: ★4 and ★5 for all twenty, and the Clockwork's Rewind.
--
-- ⭐ Stars now go to five. ★4 takes three more copies (7 in all), ★5 five more (12 in all); every star is still +10% Ink.
--    A ★3 copy brings 4, a ★4 brings 7, a ★5 brings 12. Titles: Comet-Crowned (★4), Ascendant (★5). Forty new powers,
--    each wired into its kind below (the patches stop the migration if an anchor is missing).
--
-- ⏪ Rewind (every Clockwork): the last 12 hours of what went wrong — a fox bite on an egg in the nest, a curse Pandora let
--    out, a Crucible strike that failed, a card that came up reversed, a glyph that fizzled, a Size Ray backfire, a storm's
--    scorch, the Leviathan's trample — on a timeline. Rewind one and it never happened: the bite never bit, the curse
--    lifts (Luck and Enchanted Luck it took come back), the Heat or the mana comes back, the scorch and the trample wash
--    off. It costs stored time: 30 minutes + 10 for every hour back. Once a day (twice from level 5).
--    And once a week: rewind a plot roll — any plot you claimed in the last 10 minutes rolls again (the new roll stands).
--    ★4 Deep Time: 48 hours back at half the cost, 3 a day. ★5 Paradox: a rewound roll keeps the better of the two
--    timelines, twice a week.

-- ---- stars to five ----------------------------------------------------------------------------------------------------
alter table public.enchantments drop constraint if exists enchantments_stars_check;
alter table public.enchantments add constraint enchantments_stars_check check (stars between 0 and 5 and star_fill >= 0);

create or replace function private.ench_star_need(p_star integer) returns integer language sql immutable as $$
  select case p_star when 1 then 1 when 2 then 1 when 3 then 2 when 4 then 3 when 5 then 5 end
$$;

select private.fn_patch('private.ench_star_view(public.enchantments)', $a$'star_need', case when e.stars < 3 then$a$, $b$'star_need', case when e.stars < 5 then$b$);

select private.fn_patch('public.enchant_merge(uuid, uuid)', 'v_stars >= 3', 'v_stars >= 5', true);
select private.fn_patch('public.enchant_merge(uuid, uuid)', 'v_stars < 3', 'v_stars < 5', true);
select private.fn_patch('public.enchant_merge(uuid, uuid)', $a$'need', case when v_stars < 5 then$a$, $b$'need', case when v_stars < 5 then$b$);
select private.fn_patch('public.enchant_merge(uuid, uuid)', '-- (past ★3 the leftover copies become Essence)', '-- (past ★5 the leftover copies become Essence)');
select private.fn_patch('public.enchant_merge(uuid, uuid)', '(★1 = 1, ★2 = 2, ★3 = 4)', '(★1 = 1, ★2 = 2, ★3 = 4, ★4 = 7, ★5 = 12)');
-- the Ascendant moment: a ★5 is news
select private.fn_patch('public.enchant_merge(uuid, uuid)',
  $a$  if v_up then
    insert into public.feed_events$a$,
  $b$  if v_up and v_stars >= 4 then
    perform private.notify(v_uid, 'enchant', null, jsonb_build_object('sub', 'ascended', 'kind', e.kind, 'serial', e.serial, 'stars', v_stars));
  end if;
  if v_up then
    insert into public.feed_events$b$);

-- (a star can earn a badge)
select private.fn_patch('public.enchant_merge(uuid, uuid)',
  $a$    'balances', private.balances(v_uid));$a$, $b$    'balances', private.balances(v_uid), 'achievements', private.ench_badges(v_uid));$b$);

select private.fn_patch('private.ench_titles(public.enchantments)',
  $a$case when e.stars >= 3 then 'Supernova' end,$a$,
  $b$case when e.stars >= 3 then 'Supernova' end, case when e.stars >= 4 then 'Comet-Crowned' end, case when e.stars >= 5 then 'Ascendant' end,$b$);

-- a Mirror Shard's reflections carry stars: ★1 at ★3, ★2 at ★4, ★3 at ★5
select private.fn_patch('private.ench_reflected(public.enchantments, timestamp with time zone)',
  'x.stars := case when e.stars >= 3 then 1 else 0 end;',
  'x.stars := case when e.stars >= 5 then 3 when e.stars >= 4 then 2 when e.stars >= 3 then 1 else 0 end;');

-- ---- the hundred powers --------------------------------------------------------------------------------------------------
create or replace function private.ench_star_powers(p_kind text) returns jsonb language sql immutable as $$
  select case p_kind
    when 'goose' then '[{"name": "Gilded Nest", "emoji": "✨", "text": "Platinum eggs come twice as often (6%)."},
                        {"name": "Fox Hunter", "emoji": "🦊", "text": "Chasing off a fox pays 15 Ink and 3 Luck."},
                        {"name": "Gosling", "emoji": "🐣", "text": "Every 5th egg hatches a gosling: a Rare-or-better roll ticket."},
                        {"name": "Watch Goose", "emoji": "🪿", "text": "Half the foxes that slip past you, the goose scares off itself."},
                        {"name": "Golden Age", "emoji": "🌕", "text": "Eggs grow 50% bigger, and every Platinum egg brings an Enchanted Luck."}]'
    when 'genie' then '[{"name": "Fourth Wish", "emoji": "🪔", "text": "Holds 4 wishes."},
                        {"name": "Gift of Wishes", "emoji": "🎁", "text": "Once a day, spend a wish on a friend: they get 30 Ink and you get 10."},
                        {"name": "Master’s Boon", "emoji": "👑", "text": "Once a week, a free Epic-or-better roll ticket."},
                        {"name": "Fifth Wish", "emoji": "💫", "text": "Holds 5 wishes, and they come back in 6 hours, not 8."},
                        {"name": "Djinn Unbound", "emoji": "🌪️", "text": "The Forbidden Wish can’t twist: a twist is granted instead."}]'
    when 'map' then '[{"name": "Long Arm", "emoji": "🧭", "text": "Pick up pieces from 400 m away and dig from 250 m."},
                      {"name": "Quick Ink", "emoji": "✒️", "text": "A new map is ready in 5 hours, not 10."},
                      {"name": "Mother Lode", "emoji": "💎", "text": "Every chest holds an Epic+ ticket, and Legendary odds triple."},
                      {"name": "Hoard", "emoji": "🪙", "text": "Chests pay double Ink and always hold a glyph page."},
                      {"name": "El Dorado", "emoji": "🏛️", "text": "Every 5th chest is El Dorado: a Mythic ticket, and the next map is ready at once."}]'
    when 'parasite' then '[{"name": "Quick Jaws", "emoji": "🦷", "text": "Feeds in 14 hours, not 20."},
                           {"name": "Fast Evolver", "emoji": "🧬", "text": "Evolves after 2 and 6 meals, not 3 and 10."},
                           {"name": "Queen", "emoji": "👑", "text": "Every meal is 50% bigger."},
                           {"name": "Leech Lord", "emoji": "🩸", "text": "Feeds in 10 hours, and never rests between meals."},
                           {"name": "Apex", "emoji": "🦈", "text": "Meals pay double again — and a Symbiote’s host gets twice its share."}]'
    when 'pandora' then '[{"name": "Lighter Lid", "emoji": "🗝️", "text": "Hope comes after 6 evils, not 7."},
                          {"name": "Gilded Gifts", "emoji": "🎁", "text": "Ink gifts from the box are doubled."},
                          {"name": "Greater Hope", "emoji": "🌈", "text": "Hope pays double and brings a Mythic ticket."},
                          {"name": "Hope Springs", "emoji": "🌱", "text": "Hope comes after 5 evils."},
                          {"name": "Blessings", "emoji": "😇", "text": "A third of the evils that escape turn into their blessings: no curse, and 15 Luck."}]'
    when 'clockwork' then '[{"name": "Mainspring", "emoji": "🌀", "text": "20 turns a day, and it holds 6 hours of charge."},
                            {"name": "Fine Gears", "emoji": "⚙️", "text": "Fast-forward gives 1.5× the time, and freezing costs half."},
                            {"name": "Toll of Hours", "emoji": "🔔", "text": "Once a day, ring it: every other enchantment you own jumps 30 minutes ahead."},
                            {"name": "Deep Time", "emoji": "⏳", "text": "Rewind reaches 48 hours back at half the cost, 3 times a day."},
                            {"name": "Paradox", "emoji": "♾️", "text": "A rewound roll keeps the better of the two timelines — and a roll can be rewound twice a week."}]'
    when 'sizeray' then '[{"name": "Fourth Cell", "emoji": "🔋", "text": "Holds 4 shots."},
                          {"name": "Long Burn", "emoji": "⏳", "text": "Sizes on your own plots last twice as long."},
                          {"name": "Titan Beam", "emoji": "🗿", "text": "A PERFECT or GREAT grow on your plot makes it ×3."},
                          {"name": "Megaray", "emoji": "🗼", "text": "A PERFECT grow on your own plot is a MEGA: 1,000× on the map, and ×4."},
                          {"name": "Overcharge", "emoji": "⚡", "text": "Shots come back in 4 hours, and a PERFECT shot gives its charge back."}]'
    when 'shard' then '[{"name": "Long Gaze", "emoji": "👀", "text": "Reflections last 36 hours, not 24."},
                        {"name": "Quicksilver", "emoji": "🪩", "text": "Gaze again after 12 hours, not 20."},
                        {"name": "Perfect Mirror", "emoji": "🪞", "text": "Its reflections shine with ★1 of the kind they show."},
                        {"name": "Hall of Mirrors", "emoji": "🏛️", "text": "Five reflections to choose from, and they carry ★2."},
                        {"name": "Looking-Glass Soul", "emoji": "🌌", "text": "Reflections carry ★3 and last 48 hours."}]'
    when 'wormhole' then '[{"name": "Quick Spiral", "emoji": "🌀", "text": "Opens again after 16 hours, not 24."},
                           {"name": "Steady Throat", "emoji": "🕳️", "text": "Every wormhole stays open 6 hours longer."},
                           {"name": "Third Mouth", "emoji": "🔺", "text": "Three-mouthed wormholes at any level, and chests come out double."},
                           {"name": "Gravity Well", "emoji": "🧲", "text": "What comes through lingers 10 minutes, not 5, and stars bring 15 Luck."},
                           {"name": "Singularity", "emoji": "⚫", "text": "Every wormhole is perfectly stable and stays open 48 hours."}]'
    when 'oracle' then '[{"name": "Longer Sight", "emoji": "🃏", "text": "One more card in every prophecy."},
                         {"name": "Fate-Bender", "emoji": "✍️", "text": "One more rewrite per prophecy."},
                         {"name": "Third Eye", "emoji": "👁️", "text": "Holds one more gaze."},
                         {"name": "Clear Sight", "emoji": "🔮", "text": "Gazes come back in 16 hours, and a burned roll draws twice and keeps the better."},
                         {"name": "Weaver of Fates", "emoji": "🕸️", "text": "Once a week, weave a roll card into an Enchanted roll."}]'
    when 'splice' then '[{"name": "Spare Coil", "emoji": "⚗️", "text": "Holds one more charge."},
                         {"name": "Long Graft", "emoji": "🧷", "text": "Every splice lasts 50% longer."},
                         {"name": "Quaternion", "emoji": "✳️", "text": "Splice four at once: a Quad (3 charges)."},
                         {"name": "Quick Coil", "emoji": "🌀", "text": "Charges come back twice as fast."},
                         {"name": "Eternal Bond", "emoji": "♾️", "text": "Splices never wear off — until you make the next one."}]'
    when 'sun' then '[{"name": "Corona", "emoji": "🌞", "text": "Its zone is 50% wider."},
                      {"name": "Long Day", "emoji": "🌅", "text": "A sun burns 12 hours, not 6."},
                      {"name": "Binary Star", "emoji": "✨", "text": "Two suns at once — and two a day."},
                      {"name": "Solar Wind", "emoji": "🌬️", "text": "White-hot never burns fuel faster, and your party claims at your full boost."},
                      {"name": "Supernova", "emoji": "💥", "text": "A sun that burns out white-hot goes supernova: 15 minutes at ×6 over twice the ground."}]'
    when 'rod' then '[{"name": "Supple Fork", "emoji": "🌿", "text": "Full depth comes 15% sooner."},
                      {"name": "Deep Well", "emoji": "💧", "text": "Retuning keeps half of how deep it was."},
                      {"name": "Divining Walk", "emoji": "🚶", "text": "Once a day it walks the map near you and twitches over a spot that would read as its target."},
                      {"name": "Forked Rod", "emoji": "🔱", "text": "Two targets at once."},
                      {"name": "Lodestar", "emoji": "🌟", "text": "Tuning stops making rolls harder, depth grows twice as fast, and it can seek any Primordial."}]'
    when 'stormcoil' then '[{"name": "Twin Storms", "emoji": "⛈️", "text": "One more storm a day."},
                            {"name": "Ball Lightning", "emoji": "🔮", "text": "Every bolt you catch pays double."},
                            {"name": "Eye of the Storm", "emoji": "🌪️", "text": "Missed bolts never scorch, and Aberrations strike twice as often."},
                            {"name": "Superstorm", "emoji": "🌩️", "text": "Storms bring 30 bolts and last 4 minutes."},
                            {"name": "Thunder God", "emoji": "🔱", "text": "Every bolt you catch over your own plot charges it ×1.25 for an hour."}]'
    when 'spyglass' then '[{"name": "Wide Lens", "emoji": "🔭", "text": "Holds 4 looks, and they come back faster."},
                           {"name": "Long Glass", "emoji": "🌄", "text": "Looks reach 3 km instead of 1 km."},
                           {"name": "Second Sight", "emoji": "👁️", "text": "Once a day, take a second reading of a sighted plot and keep the better one."},
                           {"name": "Panorama", "emoji": "🖼️", "text": "A look reads the plot and every free plot around it."},
                           {"name": "Eagle Eye", "emoji": "🦅", "text": "Looks reach 10 km, and Second Sight works twice a day."}]'
    when 'origami' then '[{"name": "Deep Pocket", "emoji": "👝", "text": "Holds 3 folded plots."},
                          {"name": "Paper Crane", "emoji": "🕊️", "text": "Unfold up to 50 km from your explorer."},
                          {"name": "Living Fold", "emoji": "✨", "text": "Fold an enchanted plot, creature and all."},
                          {"name": "Thousand Cranes", "emoji": "🦢", "text": "Unfold anywhere on Earth, and folds come back twice as fast."},
                          {"name": "Grand Fold", "emoji": "🏯", "text": "Unfolding pays triple, and a carried plot’s powers reach twice as far."}]'
    when 'crucible' then '[{"name": "Great Bellows", "emoji": "🌬️", "text": "+25% Heat from every melt."},
                           {"name": "Master Smith", "emoji": "🔨", "text": "A free rune on every strike."},
                           {"name": "Masterwork", "emoji": "⚒️", "text": "Once a week, a forged plot jumps two tiers."},
                           {"name": "Tempered", "emoji": "🛡️", "text": "A failed strike keeps all its Heat (a Fury strike keeps half)."},
                           {"name": "Starforge", "emoji": "🌠", "text": "The first strike each day can’t fail."}]'
    when 'puppeteer' then '[{"name": "Second String", "emoji": "🧵", "text": "Strings come back twice as fast (2 an hour)."},
                            {"name": "Long Strings", "emoji": "🌍", "text": "Pull strings on plots anywhere on Earth."},
                            {"name": "Grand Show", "emoji": "🎪", "text": "Once a day, a puppet run pays ×3."},
                            {"name": "Troupe", "emoji": "🎭", "text": "Two more strings, and two puppets perform at once."},
                            {"name": "Opening Night", "emoji": "🌟", "text": "The Grand Show pays ×5, and puppet wins pay in full."}]'
    when 'deck' then '[{"name": "Fourth Card", "emoji": "🃏", "text": "A fourth face-down card to choose from."},
                       {"name": "Hold", "emoji": "✋", "text": "Keep a turned card in your hand and play it later."},
                       {"name": "Fate’s Favourite", "emoji": "🌟", "text": "Once a day, turn a reversed card upright."},
                       {"name": "Lucky Draw", "emoji": "🍀", "text": "Foils come three times as often, and cards come up reversed half as often."},
                       {"name": "Major Arcana", "emoji": "🌞", "text": "One more card a day, and a spread’s chain climbs to ×2."}]'
    when 'glyph' then '[{"name": "Deeper Well", "emoji": "💧", "text": "+2 mana."},
                        {"name": "Chain Cast", "emoji": "⛓️", "text": "Cast two glyphs at once, 50% stronger."},
                        {"name": "Archmage", "emoji": "🧙", "text": "Once a day, a glyph casts at full strength however you draw it."},
                        {"name": "Steady Hand", "emoji": "✋", "text": "No more fizzles, and mana comes back in 2 hours, not 3."},
                        {"name": "Triple Cast", "emoji": "🔯", "text": "Cast three glyphs at once, at double strength."}]'
    else '[]' end::jsonb
$$;

-- ---- 🪿 Golden Goose: ★4 Watch Goose, ★5 Golden Age -------------------------------------------------------------------
select private.fn_patch('private.goose_eval(public.enchantments, timestamp with time zone)',
  $a$v_dodge numeric := coalesce((s ->> 'dodge')::numeric, 0);$a$,
  $b$v_dodge numeric := greatest(coalesce((s ->> 'dodge')::numeric, 0), case when e.stars >= 4 then 0.5 else 0 end);$b$);
select private.fn_patch('private.goose_eval(public.enchantments, timestamp with time zone)',
  $a$v_max numeric := private.ench_n('goose', 'max', 140);$a$,
  $b$v_max numeric := private.ench_n('goose', 'max', 140) * case when e.stars >= 5 then 1.5 else 1 end;$b$);
select private.fn_patch('private.ench_act_goose(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      if (g ->> 'platinum')::boolean then perform private.ench_stat(e.id, 'platinum'); end if;$a$,
  $b$      if (g ->> 'platinum')::boolean then perform private.ench_stat(e.id, 'platinum'); end if;
      -- ★5 Golden Age: a Platinum egg brings an Enchanted Luck
      if (g ->> 'platinum')::boolean and e.stars >= 5 then perform private.ench_give_luck(e.owner_id, 0, 1); end if;
      -- ★4 Watch Goose: the foxes it scared off by itself
      if exists (select 1 from jsonb_array_elements(g -> 'visits') x where x ->> 'state' = 'dodged') then
        perform private.ench_stat(e.id, 'scared', (select count(*)::int from jsonb_array_elements(g -> 'visits') x where x ->> 'state' = 'dodged'));
      end if;$b$);

select private.fn_patch('private.ench_view_goose(public.enchantments, timestamp with time zone)',
  $a$'max', private.ench_n('goose', 'max', 140), 'min', 6)$a$, $b$'max', private.ench_n('goose', 'max', 140) * case when e.stars >= 5 then 1.5 else 1 end, 'min', 6, 'watch', e.stars >= 4)$b$);

-- ---- 🧞 Genie: ★4 Fifth Wish, ★5 Djinn Unbound -------------------------------------------------------------------------
select private.fn_patch('private.genie_eval(public.enchantments, timestamp with time zone)',
  $a$v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600; v_max int := 3 + case when e.stars >= 1 then 1 else 0 end;$a$,
  $b$v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600 * case when e.stars >= 4 then 0.75 else 1 end; v_max int := 3 + case when e.stars >= 4 then 2 when e.stars >= 1 then 1 else 0 end;$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600;$a$,
  $b$v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600 * case when e.stars >= 4 then 0.75 else 1 end;$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$        if private.ench_dodge(e.id) then v_out := 'granted'; s := s || jsonb_build_object('wishes', 7);$a$,
  $b$        if e.stars >= 5 then v_out := 'granted'; s := s || jsonb_build_object('wishes', 7); perform private.ench_stat(e.id, 'unbound');
        elsif private.ench_dodge(e.id) then v_out := 'granted'; s := s || jsonb_build_object('wishes', 7);$b$);

-- ---- 🗺️ Treasure Map: ★4 Hoard, ★5 El Dorado -------------------------------------------------------------------------
select private.fn_patch('private.ench_act_map(public.enchantments, text, jsonb, timestamp with time zone)',
  'x public.enchantments; v jsonb;', 'x public.enchantments; v jsonb; v_dorado boolean := false; v_tk3 uuid;');
select private.fn_patch('private.ench_act_map(public.enchantments, text, jsonb, timestamp with time zone)',
  'v_ink := 120 + floor(random() * 201);', 'v_ink := (120 + floor(random() * 201)) * case when e.stars >= 4 then 2 else 1 end;');
select private.fn_patch('private.ench_act_map(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$perform private.glyph_drop(e.owner_id, 'treasure', 0.25);$a$,
  $b$perform private.glyph_drop(e.owner_id, 'treasure', case when e.stars >= 4 then 1 else 0.25 end);
        -- ★5 El Dorado: every 5th chest
        if e.stars >= 5 and mod(coalesce((s ->> 'maps')::int, 0) + 1, 5) = 0 then
          v_dorado := true; v_tk3 := private.ench_ticket(e.owner_id, 'mythic', 'el_dorado');
          perform private.ench_stat(e.id, 'eldorado');
          insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'el_dorado', 'kind', 'map', 'serial', e.serial));
        end if;$b$);
select private.fn_patch('private.ench_act_map(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$'next_at', v_now + private.ench_n('map', 'cooldown_h', 10) * 3600 * case when e.stars >= 2 then 0.5 else 1 end, 'maps'$a$,
  $b$'next_at', case when v_dorado then v_now else v_now + private.ench_n('map', 'cooldown_h', 10) * 3600 * case when e.stars >= 2 then 0.5 else 1 end end, 'maps'$b$);
select private.fn_patch('private.ench_act_map(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$'ticket', case when v_tk2 is not null then 'legendary' when v_tk is not null then 'epic' end);$a$,
  $b$'ticket', case when v_tk3 is not null then 'mythic' when v_tk2 is not null then 'legendary' when v_tk is not null then 'epic' end, 'eldorado', v_dorado);$b$);

-- ---- 🦠 Parasite: ★4 Leech Lord, ★5 Apex ---------------------------------------------------------------------------------
select private.fn_patch('private.ench_act_parasite(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$* 3600 * case when e.stars >= 1 then 0.7 else 1 end;$a$, $b$* 3600 * case when e.stars >= 4 then 0.5 when e.stars >= 1 then 0.7 else 1 end;$b$);
select private.fn_patch('private.ench_view_parasite(public.enchantments, timestamp with time zone)',
  $a$* 3600 * case when e.stars >= 1 then 0.7 else 1 end;$a$, $b$* 3600 * case when e.stars >= 4 then 0.5 when e.stars >= 1 then 0.7 else 1 end;$b$);
select private.fn_patch('private.ench_act_parasite(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$* case when e.stars >= 3 then 1.5 else 1 end, 'fed on @'$a$, $b$* case when e.stars >= 5 then 3 when e.stars >= 3 then 1.5 else 1 end, 'fed on @'$b$);
select private.fn_patch('private.ench_act_parasite(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$* case when (h ->> 'welcomed')::boolean then 0.75 else 0.5 end)::int;$a$,
  $b$* least(1, case when (h ->> 'welcomed')::boolean then 0.75 else 0.5 end * case when e.stars >= 5 then 2 else 1 end))::int;$b$);
select private.fn_patch('private.ench_act_parasite(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$'stage', v_new, 'rest_until', v_now + 3600);$a$, $b$'stage', v_new, 'rest_until', v_now + case when e.stars >= 4 then 0 else 3600 end);$b$);

-- ---- 🏺 Pandora's Box: ★4 Hope Springs, ★5 Blessings -------------------------------------------------------------------
select private.fn_patch('private.ench_act_pandora(public.enchantments, text, jsonb, timestamp with time zone)',
  'case when e.stars >= 1 then 6 else 7 end', 'case when e.stars >= 4 then 5 when e.stars >= 1 then 6 else 7 end');
select private.fn_patch('private.ench_view_pandora(public.enchantments, timestamp with time zone)',
  'case when e.stars >= 1 then 6 else 7 end', 'case when e.stars >= 4 then 5 when e.stars >= 1 then 6 else 7 end');
select private.fn_patch('private.ench_act_pandora(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$        v_c := private.pandora_curse(e, sl ->> 'evil');$a$,
  $b$        if e.stars >= 5 and random() < private.ench_n('pandora', 'blessing', 0.3333) then
          -- ★5: it turns into its blessing on the way out
          v_lk := private.ench_give_luck(e.owner_id, 15, 0);
          v_c := jsonb_build_object('evil', sl ->> 'evil', 'dodged', false, 'blessed', true, 'luck', 15);
          perform private.ench_stat(e.id, 'blessings');
        else
          v_c := private.pandora_curse(e, sl ->> 'evil');
        end if;$b$);
select private.fn_patch('private.ench_act_pandora(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$if sl ->> 'evil' = 'sorrow' and not (v_c ->> 'dodged')::boolean then$a$,
  $b$if sl ->> 'evil' = 'sorrow' and not (v_c ->> 'dodged')::boolean and not coalesce((v_c ->> 'blessed')::boolean, false) then$b$);
-- (Despair says how much Enchanted Luck it took, so a Rewind can give it back)
select private.fn_patch('private.pandora_curse(public.enchantments, text)',
  'declare v_dodge boolean := private.ench_dodge(e.id);', 'declare v_dodge boolean := private.ench_dodge(e.id); v_lost int;');
select private.fn_patch('private.pandora_curse(public.enchantments, text)',
  $a$when 'despair' then update public.player_luck set enchant = 0 where player_id = e.owner_id;$a$,
  $b$when 'despair' then select enchant into v_lost from public.player_luck where player_id = e.owner_id; update public.player_luck set enchant = 0 where player_id = e.owner_id;$b$);
select private.fn_patch('private.pandora_curse(public.enchantments, text)',
  $a$return jsonb_build_object('evil', p_evil, 'dodged', false);$a$,
  $b$return jsonb_build_object('evil', p_evil, 'dodged', false) || case when v_lost is not null then jsonb_build_object('lost', v_lost) else '{}'::jsonb end;$b$);

-- ---- 📡 Size Ray: ★4 Megaray, ★5 Overcharge -------------------------------------------------------------------------------
select private.fn_patch('private.ray_eval(public.enchantments, timestamp with time zone)',
  $a$v_rech numeric := private.ench_n('sizeray', 'recharge_h', 8) * 3600;$a$, $b$v_rech numeric := private.ench_n('sizeray', 'recharge_h', 8) * 3600 * case when e.stars >= 5 then 0.5 else 1 end;$b$);
select private.fn_patch('private.ench_act_sizeray(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_rech numeric := private.ench_n('sizeray', 'recharge_h', 8) * 3600;$a$, $b$v_rech numeric := private.ench_n('sizeray', 'recharge_h', 8) * 3600 * case when e.stars >= 5 then 0.5 else 1 end;$b$);
select private.fn_patch('private.ench_act_sizeray(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$if not private.ench_keep_charge(e.id) then s := s || jsonb_build_object('shots', v_c - 1); end if;$a$,
  $b$if not private.ench_keep_charge(e.id) and not (e.stars >= 5 and v_acc >= 0.95) then s := s || jsonb_build_object('shots', v_c - 1); end if;$b$);
select private.fn_patch('private.ench_act_sizeray(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_m := case when v_prank then 1 when v_back then 1.2 when e.stars >= 3 and v_grade in ('PERFECT', 'GREAT') then 3$a$,
  $b$v_m := case when v_prank then 1 when v_back then 1.2 when e.stars >= 4 and v_grade = 'PERFECT' then 4 when e.stars >= 3 and v_grade in ('PERFECT', 'GREAT') then 3$b$);
select private.fn_patch('private.ench_act_sizeray(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$jsonb_build_object('scale', 100, 'grade', v_grade, 'tips', 0)$a$,
  $b$jsonb_build_object('scale', case when not v_prank and not v_back and e.stars >= 4 and v_grade = 'PERFECT' then 1000 else 100 end, 'grade', v_grade, 'tips', 0,
                                       'mega', not v_prank and not v_back and e.stars >= 4 and v_grade = 'PERFECT')$b$);
select private.fn_patch('private.ench_act_sizeray(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$          perform private.ench_stat(e.id, case when v_mode = 'grow' then 'grown' else 'shrunk' end);$a$,
  $b$          perform private.ench_stat(e.id, case when v_mode = 'grow' then 'grown' else 'shrunk' end);
          if v_mode = 'grow' and not v_prank and not v_back and e.stars >= 4 and v_grade = 'PERFECT' then
            perform private.ench_stat(e.id, 'megas');
            insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', v_gx - 502, v_gy - 502, v_gx + 502, v_gy + 502);
            insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'mega', 'kind', 'sizeray', 'serial', e.serial, 'gx', v_gx, 'gy', v_gy));
          end if;$b$);
select private.fn_patch('private.ench_act_sizeray(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$'giant', case when v_mode = 'grow' then v_m end,$a$,
  $b$'giant', case when v_mode = 'grow' then v_m end, 'mega', v_mode = 'grow' and not v_prank and not v_back and e.stars >= 4 and v_grade = 'PERFECT',$b$);
select private.fn_patch('private.ench_act_sizeray(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$r := r || jsonb_build_object('accuracy', v_acc, 'grade', v_grade);$a$,
  $b$r := r || jsonb_build_object('accuracy', v_acc, 'grade', v_grade, 'refunded', e.stars >= 5 and v_acc >= 0.95);$b$);
select private.fn_patch('private.ench_view_sizeray(public.enchantments, timestamp with time zone)',
  $a$'grade', b.data ->> 'grade',$a$,
  $b$'grade', b.data ->> 'grade', 'scale', coalesce((b.data ->> 'scale')::numeric, case when b.kind = 'plot_giant' then 100 else 0.01 end),$b$);
select private.fn_patch('public.enchant_world()',
  $a$'by_name', b.data ->> 'by_name'))$a$,
  $b$'by_name', b.data ->> 'by_name', 'scale', coalesce((b.data ->> 'scale')::numeric, 100)))$b$);

-- ---- 🪞 Mirror Shard: ★4 Hall of Mirrors, ★5 Looking-Glass Soul ------------------------------------------------------------
select private.fn_patch('private.ench_act_shard(public.enchantments, text, jsonb, timestamp with time zone)',
  'order by random() limit 3) o;', 'order by random() limit case when e.stars >= 4 then 5 else 3 end) o;');
select private.fn_patch('private.ench_act_shard(public.enchantments, text, jsonb, timestamp with time zone)',
  'while jsonb_array_length(v_o) < 3 loop', 'while jsonb_array_length(v_o) < (case when e.stars >= 4 then 5 else 3 end) loop');
select private.fn_patch('private.ench_act_shard(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$* 3600 * case when e.stars >= 1 then 1.5 else 1 end, 'from', v_now)$a$,
  $b$* 3600 * case when e.stars >= 5 then 2 when e.stars >= 1 then 1.5 else 1 end, 'from', v_now)$b$);

-- ---- 🌀 Wormhole: ★4 Gravity Well, ★5 Singularity ------------------------------------------------------------------------
select private.fn_patch('private.ench_act_wormhole(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_now > (v_d ->> 'at')::numeric + 300$a$, $b$v_now > (v_d ->> 'at')::numeric + (case when e.stars >= 4 then 600 else 300 end)$b$);
select private.fn_patch('private.ench_act_wormhole(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$when 'star' then v_lk := private.ench_give_luck(e.owner_id, 5, 0);$a$,
  $b$when 'star' then v_lk := private.ench_give_luck(e.owner_id, case when e.stars >= 4 then 15 else 5 end, 0);$b$);
select private.fn_patch('private.ench_act_wormhole(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$'luck', case when v_lk is not null then 5 end);$a$, $b$'luck', case when v_lk is not null then case when e.stars >= 4 then 15 else 5 end end);$b$);
select private.fn_patch('private.ench_act_wormhole(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      v_hrs := round(6 + 12 * v_score + case when e.stars >= 2 then 6 else 0 end, 1);$a$,
  $b$      if e.stars >= 5 then v_score := 1; perform private.ench_stat(e.id, 'singularities'); end if;
      v_hrs := case when e.stars >= 5 then 48 else round(6 + 12 * v_score + case when e.stars >= 2 then 6 else 0 end, 1) end;$b$);
select private.fn_patch('private.ench_view_wormhole(public.enchantments, timestamp with time zone)',
  $a$(v_d ->> 'at')::numeric + 300$a$, $b$(v_d ->> 'at')::numeric + (case when e.stars >= 4 then 600 else 300 end)$b$, true);

-- ---- 👁️ Oracle Eye: ★4 Clear Sight, ★5 Weaver of Fates --------------------------------------------------------------------
select private.fn_patch('private.oracle_eval(public.enchantments, timestamp with time zone)',
  $a$v_rech numeric := private.ench_n('oracle', 'recharge_h', 24) * 3600;$a$, $b$v_rech numeric := private.ench_n('oracle', 'recharge_h', 24) * 3600 * case when e.stars >= 4 then 2.0 / 3 else 1 end;$b$);
select private.fn_patch('private.oracle_eval(public.enchantments, timestamp with time zone)',
  $a$'unlocks', jsonb_build_object('roll', 1, 'reward', 3, 'pandora', 5, 'egg', 5));$a$,
  $b$'unlocks', jsonb_build_object('roll', 1, 'reward', 3, 'pandora', 5, 'egg', 5),
    'weave_ready', e.stars >= 5 and coalesce(s ->> 'weave_week', '') <> to_char(now(), 'IYYY-IW'), 'double_burn', e.stars >= 4);$b$);
select private.fn_patch('private.ench_act_oracle(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_rech numeric := private.ench_n('oracle', 'recharge_h', 24) * 3600;$a$, $b$v_rech numeric := private.ench_n('oracle', 'recharge_h', 24) * 3600 * case when e.stars >= 4 then 2.0 / 3 else 1 end;$b$);
-- ★4: a burned roll draws twice and keeps the better
select private.fn_patch('private.ench_act_oracle(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$          when 'roll' then v_card := private.oracle_draw_roll();
            update private.oracle_fates$a$,
  $b$          when 'roll' then v_card := private.oracle_draw_roll();
            if e.stars >= 4 then
              v_tmp := private.oracle_draw_roll();
              if private.spy_rank(v_tmp ->> 'rarity') > private.spy_rank(v_card ->> 'rarity') then v_card := v_tmp; end if;
            end if;
            update private.oracle_fates$b$);
-- ★5: once a week, weave a roll card into an Enchanted roll
select private.fn_patch('private.ench_act_oracle(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$    when 'foretell' then$a$,
  $b$    when 'weave' then
      if e.stars < 5 then raise exception 'stars_locked' using errcode = 'P0001', detail = '5'; end if;
      if coalesce(s ->> 'weave_week', '') = to_char(now(), 'IYYY-IW') then raise exception 'too_soon' using errcode = 'P0001'; end if;
      v_cards := s -> 'cards';
      if jsonb_typeof(v_cards) <> 'object' or v_cards ->> 'what' <> 'roll' then raise exception 'no_prophecy' using errcode = 'P0001'; end if;
      v_cards := private.oracle_cards(e) -> 'list';
      v_i := (a ->> 'i')::int;
      if v_i is null or v_i < 0 or v_i >= jsonb_array_length(v_cards) or coalesce((v_cards -> v_i ->> 'done')::boolean, true) then raise exception 'bad_card' using errcode = 'P0001'; end if;
      if v_cards -> v_i ->> 'rarity' = 'enchanted' then raise exception 'already_enchanted' using errcode = 'P0001'; end if;
      v_card := jsonb_build_object('rarity', 'enchanted', 'kind', private.ench_pick_kind());
      update private.oracle_fates set outcome = v_card where id = (v_cards -> v_i ->> 'fate')::bigint and player_id = e.owner_id;
      s := jsonb_set(s, array['cards', 'list', v_i::text], jsonb_build_object('fate', v_cards -> v_i -> 'fate') || v_card || jsonb_build_object('woven', true));
      s := s || jsonb_build_object('weave_week', to_char(now(), 'IYYY-IW'));
      perform private.ench_stat(e.id, 'weaves');
      perform private.ench_xp(e.id, 3);
      perform private.ench_event(e.id, 'woven', jsonb_build_object('kind', v_card ->> 'kind', 'i', v_i));
      r := jsonb_build_object('cards', s -> 'cards', 'woven', v_card);
    when 'foretell' then$b$);

-- ---- 🧪 Splice: ★4 Quick Coil, ★5 Eternal Bond ----------------------------------------------------------------------------
select private.fn_patch('private.splice_eval(public.enchantments, timestamp with time zone)',
  $a$v_rech numeric := (lab ->> 'recharge_h')::numeric * 3600;$a$, $b$v_rech numeric := (lab ->> 'recharge_h')::numeric * 3600 * case when e.stars >= 4 then 0.5 else 1 end;$b$);
select private.fn_patch('private.splice_eval(public.enchantments, timestamp with time zone)',
  $a$'recharge_h', lab -> 'recharge_h',$a$, $b$'recharge_h', (lab ->> 'recharge_h')::numeric * case when e.stars >= 4 then 0.5 else 1 end, 'eternal', e.stars >= 5,$b$);
-- ★5: the splice running holds until the next one is made — making one ends it
select private.fn_patch('private.ench_act_splice(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      if exists (select 1 from public.enchant_splices zs where zs.splice_id = e.id and (zs.ends_at > now())) then raise exception 'splice_active' using errcode = 'P0001'; end if;$a$,
  $b$      if e.stars >= 5 and v_mode <> 'friend' then
        update public.enchant_splices zs set ends_at = now() where zs.splice_id = e.id and zs.ends_at > now() and coalesce((zs.data ->> 'eternal')::boolean, false);
      end if;
      if exists (select 1 from public.enchant_splices zs where zs.splice_id = e.id and (zs.ends_at > now())) then raise exception 'splice_active' using errcode = 'P0001'; end if;$b$);
select private.fn_patch('private.ench_act_splice(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$               * case when e.stars >= 2 then 1.5 else 1 end;$a$,
  $b$               * case when e.stars >= 2 then 1.5 else 1 end;
      -- (♾️ a hundred years is forever enough)
      if e.stars >= 5 and v_mode <> 'friend' then v_hrs := 876000; end if;$b$);
create or replace function private.splice_mark_eternal() returns trigger language plpgsql as $$
begin
  if new.ends_at > now() + interval '50 years' and not coalesce((new.data ->> 'eternal')::boolean, false) then
    new.data := coalesce(new.data, '{}'::jsonb) || jsonb_build_object('eternal', true);
  end if;
  return new;
end $$;
drop trigger if exists enchant_splices_eternal on public.enchant_splices;
create trigger enchant_splices_eternal before insert on public.enchant_splices for each row execute function private.splice_mark_eternal();
select private.fn_patch('private.ench_act_splice(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      r := r || jsonb_build_object('ends_at', now() + make_interval(secs => (v_hrs * 3600)::double precision), 'hours', v_hrs);$a$,
  $b$      if v_hrs >= 876000 then perform private.ench_stat(e.id, 'eternal'); end if;
      r := r || jsonb_build_object('ends_at', now() + make_interval(secs => (v_hrs * 3600)::double precision), 'hours', v_hrs, 'eternal', v_hrs >= 876000);$b$);

-- ---- ☀️ Pocket Sun: ★4 Solar Wind, ★5 Supernova --------------------------------------------------------------------------
create or replace function private.sun_zone(z jsonb, p_ep numeric) returns jsonb language plpgsql stable as $$
declare v_h0 numeric; v_dt numeric; v_heat numeric; v_tier text; v_used numeric; v_w numeric; v_left numeric; v_r numeric; v_until numeric; v_white numeric;
  v_steady boolean; v_fuel numeric; v_nova numeric; v_hout numeric; v_len numeric := private.ench_n('sun', 'nova_s', 900);
begin
  if z is null or jsonb_typeof(z) <> 'object' then return null; end if;
  v_steady := coalesce((z ->> 'steady')::boolean, false);
  v_h0 := coalesce((z ->> 'heat')::numeric, 30);
  v_dt := greatest(0, p_ep - coalesce((z ->> 'heat_at')::numeric, p_ep));
  v_heat := case when v_h0 <= 30 then v_h0 else greatest(30, v_h0 - 6 * v_dt / 3600) end;
  -- white-hot for the first (heat − 90) / 6 hours of the stretch (★4 Solar Wind: no faster for it)
  v_w := case when v_h0 >= 90 and not v_steady then least(v_dt, (v_h0 - 90) / 6 * 3600) else 0 end;
  v_used := 2 * v_w + (v_dt - v_w);
  v_fuel := coalesce((z ->> 'fuel')::numeric, 0);
  v_left := v_fuel - v_used;
  -- ★5 Supernova: a sun whose fuel runs out while it's white-hot blows up for a quarter of an hour
  if coalesce((z ->> 'nova')::boolean, false) and v_left <= 0 and not coalesce((z ->> 'out')::boolean, false) then
    v_nova := (z ->> 'nova_from')::numeric;
    if v_nova is null and v_steady then
      v_hout := case when v_h0 <= 30 then v_h0 else greatest(30, v_h0 - 6 * v_fuel / 3600) end;
      if v_hout >= 90 then v_nova := coalesce((z ->> 'heat_at')::numeric, p_ep) + v_fuel; end if;
    end if;
    if v_nova is not null and p_ep < v_nova + v_len then
      return z || jsonb_build_object('heat_now', 100, 'tier', 'nova', 'r_m', round(coalesce((z ->> 'r0')::numeric, 150) * 2),
        'mult', private.ench_n('sun', 'nova_x', 6), 'left_s', 0, 'until', round(v_nova + v_len), 'alive', true, 'nova_from', v_nova,
        'flare', coalesce((z ->> 'flare_until')::numeric, 0) > p_ep);
    end if;
  end if;
  v_tier := case when v_heat >= 90 then 'white' when v_heat >= 50 then 'hot' else 'warm' end;
  v_r := coalesce((z ->> 'r0')::numeric, 150) * case v_tier when 'white' then 0.5 when 'hot' then 0.75 else 1 end;
  v_white := case when v_heat >= 90 and not v_steady then (v_heat - 90) / 6 * 3600 else 0 end;
  v_until := case when v_left <= 0 then p_ep when v_left <= 2 * v_white then p_ep + v_left / 2 else p_ep + v_white + (v_left - 2 * v_white) end;
  return z || jsonb_build_object('heat_now', round(v_heat, 1), 'tier', v_tier, 'r_m', round(v_r),
    'mult', case v_tier when 'white' then private.ench_n('sun', 'white_x', 4) when 'hot' then private.ench_n('sun', 'hot_x', 3) else private.ench_n('sun', 'warm_x', 2) end,
    'left_s', round(greatest(v_left, 0)), 'until', round(v_until), 'alive', v_left > 0 and not coalesce((z ->> 'out')::boolean, false),
    'flare', coalesce((z ->> 'flare_until')::numeric, 0) > p_ep);
end $$;
-- (settling keeps a supernova's start, so it isn't started again)
create or replace function private.sun_settle(p_zones jsonb, p_ep numeric) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg((zz - 'heat_now' - 'tier' - 'r_m' - 'mult' - 'left_s' - 'until' - 'alive' - 'flare')
           || jsonb_build_object('heat', zz -> 'heat_now', 'heat_at', p_ep, 'fuel', zz -> 'left_s', 'fuel_at', p_ep)), '[]'::jsonb)
    from (select private.sun_zone(z, p_ep) zz from jsonb_array_elements(coalesce(p_zones, '[]'::jsonb)) z) x
   where (zz ->> 'alive')::boolean
$$;
select private.fn_patch('private.ench_act_sun(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$'party', coalesce((a ->> 'party')::boolean, false), 'spots', v_spots, 'claims', 0, 'warm_at', v_ep);$a$,
  $b$'party', coalesce((a ->> 'party')::boolean, false), 'spots', v_spots, 'claims', 0, 'warm_at', v_ep,
             'steady', e.stars >= 4, 'full_party', e.stars >= 4, 'nova', e.stars >= 5);$b$);
-- (a supernova can't be stoked: it's already everything it can be)
select private.fn_patch('private.ench_act_sun(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      z := zs -> v_idx;
      v_n := least(greatest(coalesce((a ->> 'n')::int, 1), 1), 6);$a$,
  $b$      z := zs -> v_idx;
      if (z ->> 'nova_from') is not null then raise exception 'sun_nova' using errcode = 'P0001'; end if;
      v_n := least(greatest(coalesce((a ->> 'n')::int, 1), 1), 6);$b$);
select private.fn_patch('private.sun_for_claim(uuid, integer, integer)',
  $a$if r.owner_id <> p_uid then v_m := 1 + (v_m - 1) / 2; end if;$a$,
  $b$if r.owner_id <> p_uid and not coalesce((r.z ->> 'full_party')::boolean, false) then v_m := 1 + (v_m - 1) / 2; end if;$b$);
-- (a supernova in orbit warms minigames ×2)
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%private.ench_n(''sun'', ''orbit_white'', 1.5)%' loop
    perform private.fn_patch(f::text, $a$case r.z ->> 'tier' when 'white' then private.ench_n('sun', 'orbit_white', 1.5)$a$,
                                      $b$case r.z ->> 'tier' when 'nova' then private.ench_n('sun', 'orbit_nova', 2) when 'white' then private.ench_n('sun', 'orbit_white', 1.5)$b$);
  end loop;
end $$;
select private.fn_patch('public.enchant_map2(integer, integer, integer, integer)',
  $a$'tier', x.z -> 'tier', 'heat', x.z -> 'heat_now',$a$, $b$'tier', x.z -> 'tier', 'mult', x.z -> 'mult', 'heat', x.z -> 'heat_now',$b$);
-- the heartbeat sees a supernova happen (once each)
create or replace function private.sun_nova_tick() returns void language plpgsql as $$
declare e record; zs jsonb; z jsonb; v_ep numeric := extract(epoch from now()); v_i int; v_new boolean;
begin
  for e in select id, owner_id, serial, state from public.enchantments
            where kind = 'sun' and status = 'active' and state -> 'zones' @> '[{"nova": true}]'::jsonb for update skip locked loop
    zs := e.state -> 'zones'; v_new := false;
    for v_i in 0 .. jsonb_array_length(zs) - 1 loop
      z := private.sun_zone(zs -> v_i, v_ep);
      if z ->> 'tier' = 'nova' and not coalesce((zs -> v_i ->> 'nova_seen')::boolean, false) then
        zs := jsonb_set(zs, array[v_i::text], (zs -> v_i) || jsonb_build_object('nova_seen', true, 'nova_from', (z ->> 'nova_from')::numeric));
        v_new := true;
        perform private.ench_stat(e.id, 'novas');
        perform private.ench_event(e.id, 'nova', jsonb_build_object('i', zs -> v_i -> 'i', 'gx', z -> 'gx', 'gy', z -> 'gy', 'r', z -> 'r_m'));
        perform private.notify(e.owner_id, 'enchant', null, jsonb_build_object('sub', 'sun_nova', 'kind', 'sun', 'gx', z -> 'gx', 'gy', z -> 'gy'));
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'supernova', 'kind', 'sun', 'serial', e.serial));
      end if;
    end loop;
    if v_new then update public.enchantments set state = state || jsonb_build_object('zones', zs), updated_at = now() where id = e.id; end if;
  end loop;
end $$;
select private.fn_patch('private.wonders_tick()',
  $a$  begin perform private.sun_warm_tick(); exception when others then raise warning 'sun_warm_tick: %', sqlerrm; end;$a$,
  $b$  begin perform private.sun_warm_tick(); exception when others then raise warning 'sun_warm_tick: %', sqlerrm; end;
  begin perform private.sun_nova_tick(); exception when others then raise warning 'sun_nova_tick: %', sqlerrm; end;$b$);

-- ---- ⚡ Storm Coil: ★4 Superstorm, ★5 Thunder God ------------------------------------------------------------------------
select private.fn_patch('private.ench_act_stormcoil(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_n := private.ench_n('stormcoil', 'bolts', 18)::int; v_len := private.ench_n('stormcoil', 'secs', 180);$a$,
  $b$v_n := (private.ench_n('stormcoil', 'bolts', 18) * case when e.stars >= 4 then 30.0 / 18 else 1 end)::int;
      v_len := private.ench_n('stormcoil', 'secs', 180) * case when e.stars >= 4 then 4.0 / 3 else 1 end;$b$);
select private.fn_patch('private.ench_act_stormcoil(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$        v_ink := case when bolt ->> 'kind' = 'stray' then 8 else 12 end;
        v_out := jsonb_build_object('what', 'ink');$a$,
  $b$        v_ink := case when bolt ->> 'kind' = 'stray' then 8 else 12 end;
        v_out := jsonb_build_object('what', 'ink');
        -- ★5 Thunder God: the bolt you caught charges your plot
        if e.stars >= 5 and bolt ->> 'kind' = 'ink' and exists (select 1 from public.world_plots where gx = (bolt ->> 'gx')::int and gy = (bolt ->> 'gy')::int and owner_id = e.owner_id) then
          if not exists (select 1 from public.enchant_buffs where player_id = e.owner_id and kind = 'static' and gx = (bolt ->> 'gx')::int and gy = (bolt ->> 'gy')::int and expires_at > now()) then
            insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
            values (e.owner_id, 'static', (bolt ->> 'gx')::int, (bolt ->> 'gy')::int, e.id, 1.25, jsonb_build_object('by', 'thunder'), now() + interval '1 hour');
          else
            update public.enchant_buffs set expires_at = now() + interval '1 hour' where player_id = e.owner_id and kind = 'static' and gx = (bolt ->> 'gx')::int and gy = (bolt ->> 'gy')::int and expires_at > now();
          end if;
          perform private.ench_stat(e.id, 'thunder');
          v_out := v_out || jsonb_build_object('charged', true);
        end if;$b$);

-- ---- 🔭 Spyglass: ★4 Panorama, ★5 Eagle Eye -------------------------------------------------------------------------------
select private.fn_patch('private.spy_eval(public.enchantments, timestamp with time zone)',
  $a$* case when e.stars >= 2 then 3 else 1 end * private.ench_reach(e.id),$a$,
  $b$* case when e.stars >= 5 then 10 when e.stars >= 2 then 3 else 1 end * private.ench_reach(e.id), 'panorama', e.stars >= 4,$b$);
select private.fn_patch('private.ench_act_spyglass(public.enchantments, text, jsonb, timestamp with time zone)',
  'v_sg private.spy_sightings; v_day text := private.today()::text; v_better boolean;',
  'v_sg private.spy_sightings; v_day text := private.today()::text; v_better boolean; v_pan jsonb := ''[]''::jsonb; v_dx int; v_dy int; v_r2 jsonb; v_id2 bigint;');
select private.fn_patch('private.ench_act_spyglass(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      r := jsonb_build_object('sighting', private.spy_json(v_id));$a$,
  $b$      -- ★4 Panorama: every free plot around it is read in the same look
      if e.stars >= 4 then
        for v_dx in -1 .. 1 loop
          for v_dy in -1 .. 1 loop
            continue when v_dx = 0 and v_dy = 0;
            continue when exists (select 1 from public.world_plots where gx = v_gx + v_dx and gy = v_gy + v_dy and (owner_id is not null or coalesce(locked, false)));
            continue when exists (select 1 from private.spy_sightings where player_id = e.owner_id and gx = v_gx + v_dx and gy = v_gy + v_dy and used_at is null and refunded_at is null and expires_at > now());
            continue when not private.spy_in_range(e.owner_id, v_gx + v_dx, v_gy + v_dy, (g ->> 'range_m')::numeric);
            v_r2 := private.spy_roll(v_gx + v_dx, v_gy + v_dy);
            insert into private.spy_sightings (player_id, enchant_id, gx, gy, rarity, kind, hot, expires_at)
            values (e.owner_id, e.id, v_gx + v_dx, v_gy + v_dy, v_r2 ->> 'rarity', v_r2 ->> 'kind', private.in_hot_zone(v_gx + v_dx, v_gy + v_dy),
                    now() + make_interval(hours => (g ->> 'keep_h')::int))
            returning id into v_id2;
            if private.spy_rank(v_r2 ->> 'rarity') >= 5 then perform private.ench_stat(e.id, 'grand'); end if;
            v_pan := v_pan || jsonb_build_array(private.spy_json(v_id2));
          end loop;
        end loop;
        if jsonb_array_length(v_pan) > 0 then
          perform private.ench_stat(e.id, 'panoramas');
          perform private.fairplay(e.owner_id, 'spy_panorama', v_gx, v_gy, jsonb_build_object('enchant', e.id, 'n', jsonb_array_length(v_pan)));
        end if;
      end if;
      r := jsonb_build_object('sighting', private.spy_json(v_id), 'panorama', v_pan);$b$);
select private.fn_patch('private.ench_act_spyglass(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$if s ->> 'second_day' = v_day then raise exception 'already_today' using errcode = 'P0001'; end if;$a$,
  $b$if s ->> 'second_day' = v_day and (e.stars < 5 or coalesce((s ->> 'second_n')::int, 1) >= 2) then raise exception 'already_today' using errcode = 'P0001'; end if;$b$);
select private.fn_patch('private.ench_act_spyglass(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$s := s || jsonb_build_object('second_day', v_day);$a$,
  $b$s := s || jsonb_build_object('second_day', v_day, 'second_n', case when s ->> 'second_day' = v_day then coalesce((s ->> 'second_n')::int, 1) + 1 else 1 end);$b$);
select private.fn_patch('private.ench_view_spyglass(public.enchantments, timestamp with time zone)',
  $a$'second_ready', e.stars >= 3 and coalesce(e.state ->> 'second_day', '') <> private.today()::text,$a$,
  $b$'second_ready', e.stars >= 3 and (coalesce(e.state ->> 'second_day', '') <> private.today()::text or (e.stars >= 5 and coalesce((e.state ->> 'second_n')::int, 1) < 2)),$b$);

-- ---- 📜 Origami Pocket: ★4 Thousand Cranes, ★5 Grand Fold (its carry reach comes with carrying) ---------------------------
select private.fn_patch('private.ori_eval(public.enchantments, timestamp with time zone)',
  $a$v_per numeric := private.ench_n('origami', 'recharge_h', 24) * 3600 / v_max;$a$,
  $b$v_per numeric := private.ench_n('origami', 'recharge_h', 24) * 3600 / v_max * case when e.stars >= 4 then 0.5 else 1 end;$b$);
select private.fn_patch('private.ori_eval(public.enchantments, timestamp with time zone)',
  $a$'far_m', case when e.stars >= 2 then$a$, $b$'far_m', case when e.stars >= 4 then 40100000 when e.stars >= 2 then$b$);
select private.fn_patch('private.ori_can_land(uuid, public.enchantments, integer, integer)',
  $a$  if e.stars >= 2 and private.ench_cell_m$a$, $b$  if e.stars >= 4 then return null; end if;
  if e.stars >= 2 and private.ench_cell_m$b$);
select private.fn_patch('private.ench_act_origami(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_pay := private.ench_pay(e.id, 20 + least(40, floor((v_mv ->> 'km')::numeric)),$a$,
  $b$v_pay := private.ench_pay(e.id, (20 + least(40, floor((v_mv ->> 'km')::numeric))) * case when e.stars >= 5 then 3 else 1 end,$b$);

-- ---- ⚒️ Crucible: ★4 Tempered, ★5 Starforge --------------------------------------------------------------------------------
select private.fn_patch('private.ench_act_crucible(public.enchantments, text, jsonb, timestamp with time zone)',
  'v_mult numeric := case when e.stars >= 1 then 1.25 else 1 end; k text; v numeric;',
  'v_mult numeric := case when e.stars >= 1 then 1.25 else 1 end; k text; v numeric; v_starf boolean := false;');
select private.fn_patch('private.ench_act_crucible(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      v_ok := private.divine(e.id, 'strike', random() < v_p, v_p);$a$,
  $b$      v_ok := private.divine(e.id, 'strike', random() < v_p, v_p);
      -- ★5 Starforge: the day's first strike can't fail
      if e.stars >= 5 and coalesce(s ->> 'forge_day', '') <> private.today()::text then
        if not v_ok then v_ok := true; v_starf := true; perform private.ench_stat(e.id, 'starforged'); end if;
        s := s || jsonb_build_object('forge_day', private.today()::text);
      end if;$b$);
select private.fn_patch('private.ench_act_crucible(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_keep := case when v_rune = 'fury' then 0 when v_rune = 'steady' then 0.75 else 0.5 end;$a$,
  $b$v_keep := case when e.stars >= 4 then case when v_rune = 'fury' then 0.5 else 1 end when v_rune = 'fury' then 0 when v_rune = 'steady' then 0.75 else 0.5 end;$b$);
select private.fn_patch('private.ench_act_crucible(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$'rune', v_rune, 'heat', v_heat, 'master', v_master));$a$,
  $b$'rune', v_rune, 'heat', v_heat, 'master', v_master, 'kept', v_keep, 'starforged', v_starf));$b$);
select private.fn_patch('private.ench_act_crucible(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$'masterwork', v_master,$a$, $b$'masterwork', v_master, 'starforged', v_starf,$b$);
select private.fn_patch('private.ench_view_crucible(public.enchantments, timestamp with time zone)',
  $a$return jsonb_build_object($a$,
  $b$return jsonb_build_object('starforge_ready', e.stars >= 5 and coalesce(e.state ->> 'forge_day', '') <> private.today()::text, 'tempered', e.stars >= 4,$b$);

-- ---- 🎭 Puppeteer: ★4 Troupe, ★5 Opening Night ------------------------------------------------------------------------------
select private.fn_patch('private.pup_eval(public.enchantments, timestamp with time zone)',
  $a$v_max int := 2 + case when e.level >= 5 then 1 else 0 end + case when e.level >= 10 then 1 else 0 end;$a$,
  $b$v_max int := 2 + case when e.level >= 5 then 1 else 0 end + case when e.level >= 10 then 1 else 0 end + case when e.stars >= 4 then 2 else 0 end;$b$);
select private.fn_patch('public.puppet_start(uuid, integer, integer)',
  $a$values (v_uid, 'grand_show', p_gx, p_gy, e.id, 3, 1,$a$, $b$values (v_uid, 'grand_show', p_gx, p_gy, e.id, case when e.stars >= 5 then 5 else 3 end, 1,$b$);

-- ---- 🃏 Deck of Fates: ★4 Lucky Draw, ★5 Major Arcana ----------------------------------------------------------------------
select private.fn_patch('private.ench_act_deck(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$v_up := random() >= private.ench_n('deck', 'reversed', 0.3); v_foil := random() < private.ench_n('deck', 'foil', 0.08);$a$,
  $b$v_up := random() >= private.ench_n('deck', 'reversed', 0.3) * case when e.stars >= 4 then 0.5 else 1 end;
      v_foil := random() < private.ench_n('deck', 'foil', 0.08) * case when e.stars >= 4 then 3 else 1 end;$b$);
select private.fn_patch('private.ench_act_deck(public.enchantments, text, jsonb, timestamp with time zone)',
  '1 + 0.25 * least(v_chain, 2)', '1 + 0.25 * least(v_chain, case when e.stars >= 5 then 4 else 2 end)', true);
select private.fn_patch('private.deck_eval(public.enchantments, timestamp with time zone)',
  '1 + 0.25 * least(v_chain, 2)', '1 + 0.25 * least(v_chain, case when e.stars >= 5 then 4 else 2 end)', true);
select private.fn_patch('private.deck_eval(public.enchantments, timestamp with time zone)',
  $a$'picks', case when v_spread then 3 else 1 end,$a$, $b$'picks', case when v_spread then 3 else 1 end + case when e.stars >= 5 then 1 else 0 end,$b$);

-- ---- ✍️ Glyphcaster: ★4 Steady Hand, ★5 Triple Cast -------------------------------------------------------------------------
select private.fn_patch('private.glyph_eval(public.enchantments, timestamp with time zone)',
  $a$v_per numeric := private.ench_n('glyph', 'recharge_h', 3) * 3600;$a$, $b$v_per numeric := private.ench_n('glyph', 'recharge_h', 3) * 3600 * case when e.stars >= 4 then 2.0 / 3 else 1 end;$b$);
select private.fn_patch('private.glyph_eval(public.enchantments, timestamp with time zone)',
  $a$'chain', e.stars >= 2);$a$, $b$'chain', e.stars >= 2, 'triple', e.stars >= 5, 'steady', e.stars >= 4);$b$);
select private.fn_patch('private.ench_act_glyph(public.enchantments, text, jsonb, timestamp with time zone)',
  'v_chain := jsonb_array_length(v_ids) = 2;', 'v_chain := jsonb_array_length(v_ids) >= 2;');
select private.fn_patch('private.ench_act_glyph(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$if jsonb_array_length(v_ids) not between 1 and 2 then$a$, $b$if jsonb_array_length(v_ids) not between 1 and (case when e.stars >= 5 then 3 else 2 end) then$b$);
select private.fn_patch('private.ench_act_glyph(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$      if v_acc < 0.35 then
        -- a scrawl: the mana fizzles$a$,
  $b$      -- ★4 Steady Hand: a scrawl still casts, at its weakest
      if v_acc < 0.35 and e.stars >= 4 then v_acc := 0.35; end if;
      if v_acc < 0.35 then
        -- a scrawl: the mana fizzles$b$);
select private.fn_patch('private.ench_act_glyph(public.enchantments, text, jsonb, timestamp with time zone)',
  'v_pow := (0.6 + 0.4 * v_acc) * case when v_chain then 1.5 else 1 end;',
  'v_pow := (0.6 + 0.4 * v_acc) * case when jsonb_array_length(v_ids) = 3 then 2 when v_chain then 1.5 else 1 end;
      if jsonb_array_length(v_ids) = 3 then perform private.ench_stat(e.id, ''triples''); end if;');

-- ---- ⚙️ Clockwork: the Rewind ---------------------------------------------------------------------------------------------
/** how far back it reaches, how often, and what it costs */
create or replace function private.clock_rw(e public.enchantments) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'back_h', case when e.stars >= 4 then private.ench_n('clockwork', 'rewind_deep_h', 48) else private.ench_n('clockwork', 'rewind_h', 12) end,
    'per_day', case when e.stars >= 4 then 3 when e.level >= 5 then 2 else 1 end,
    'used', case when e.state ->> 'rw_day' = private.today()::text then coalesce((e.state ->> 'rw_n')::int, 0) else 0 end,
    'half', e.stars >= 4,
    'roll_per_week', case when e.stars >= 5 then 2 else 1 end,
    'roll_used', case when e.state ->> 'roll_week' = to_char(now(), 'IYYY-IW') then coalesce((e.state ->> 'roll_n')::int, 0) else 0 end,
    'roll_cost', case when e.stars >= 4 then 30 else 60 end, 'roll_window_m', 10, 'paradox', e.stars >= 5)
$$;
/** a moment's price in stored minutes: 30, and 10 for every hour back (half at ★4) */
create or replace function private.clock_cost(p_age numeric, p_half boolean) returns int language sql immutable as $$
  select ceil((30 + 10 * ceil(greatest(coalesce(p_age, 0), 1) / 3600.0)) * case when p_half then 0.5 else 1 end)::int
$$;
create or replace function private.clock_evil_text(p_evil text) returns text[] language sql immutable as $$
  select case p_evil
    when 'plague' then array['Plague got out of the box', 'Your enchantments pay 30% less for 6 hours']
    when 'greed' then array['Greed got out of the box', 'Your Ink comes slower for 2 hours']
    when 'strife' then array['Strife got out of the box', 'Your next minigame win pays half']
    when 'envy' then array['Envy got out of the box', 'It took 15 Luck']
    when 'despair' then array['Despair got out of the box', 'It drained your Enchanted Luck']
    when 'toil' then array['Toil got out of the box', 'Your other enchantments fell 2 hours behind']
    when 'sorrow' then array['Sorrow got out of the box', 'The box stays shut an extra day']
    else array['Something got out of the box', ''] end
$$;

/** what went wrong in the reach of the Rewind, newest first — only what can still be undone */
create or replace function private.clock_timeline(e public.enchantments) returns jsonb language plpgsql stable as $$
declare rw jsonb := private.clock_rw(e); v_back numeric; v_from timestamptz; v_half boolean; o jsonb := '[]'::jsonb; g public.enchantments; ge jsonb; vis jsonb;
  ev record; b record; v_age numeric; v_ev text; v_lost numeric; v_glow boolean; v_n int; v_t text[]; v_now numeric := extract(epoch from now()); v_ep numeric;
begin
  v_back := (rw ->> 'back_h')::numeric * 3600;
  v_from := now() - make_interval(secs => v_back::double precision);
  v_half := (rw ->> 'half')::boolean;
  -- 🦊 a fox bite on an egg still in the nest
  for g in select * from public.enchantments where owner_id = e.owner_id and status = 'active' and kind = 'goose' loop
    ge := private.goose_eval(g, private.ench_now(g));
    v_ep := private.ench_ep(private.ench_now(g));
    for vis in select x from jsonb_array_elements(coalesce(ge -> 'visits', '[]'::jsonb)) x where x ->> 'state' = 'bit' loop
      v_age := greatest(0, v_ep - ((vis ->> 'at')::numeric + 1500));
      continue when v_age > v_back;
      o := o || jsonb_build_array(jsonb_build_object('id', 'fox:' || g.id || ':' || (vis ->> 'k'), 'type', 'fox', 'k', (vis ->> 'k')::int, 'target', g.id, 'kind', 'goose',
             'serial', g.serial, 'at', round(v_now - v_age), 'ago', round(v_age), 'cost', private.clock_cost(v_age, v_half), 'emoji', '🦊',
             'title', 'A fox bit the egg in the nest', 'detail', 'It took 35% of the egg — rewound, it never bit'));
    end loop;
  end loop;
  -- 😈 🔥 🃏 ✍️ what the chronicles say went wrong
  for ev in select ev0.id, ev0.kind ek, ev0.data, ev0.created_at, ev0.enchant_id, x.kind xk, x.serial xs, x.state xstate, x.clock_skip, x.frozen_at, x.frozen_until
              from public.enchant_events ev0 join public.enchantments x on x.id = ev0.enchant_id
             where x.owner_id = e.owner_id and x.status = 'active' and ev0.created_at >= v_from
               and ev0.kind in ('evil', 'struck', 'fate', 'fizzled') and not coalesce((ev0.data ->> 'rewound')::boolean, false)
             order by ev0.id desc limit 300 loop
    v_age := extract(epoch from now() - ev.created_at);
    if ev.ek = 'evil' and ev.xk = 'pandora' and not coalesce((ev.data ->> 'dodged')::boolean, false) and not coalesce((ev.data ->> 'blessed')::boolean, false) then
      v_ev := ev.data ->> 'evil';
      continue when not (
        (v_ev in ('plague', 'greed', 'strife') and exists (select 1 from public.enchant_buffs bf where bf.player_id = e.owner_id and bf.kind = 'curse_' || v_ev and bf.enchant_id = ev.enchant_id
            and bf.expires_at > now() and coalesce(bf.uses, 1) > 0 and bf.created_at between ev.created_at - interval '5 seconds' and ev.created_at + interval '5 seconds'))
        or v_ev in ('envy', 'toil')
        or (v_ev = 'despair' and coalesce((ev.data ->> 'lost')::int, 0) > 0)
        or (v_ev = 'sorrow' and coalesce((ev.xstate ->> 'locked_until')::numeric, 0) > v_now + ev.clock_skip));
      v_t := private.clock_evil_text(v_ev);
      o := o || jsonb_build_array(jsonb_build_object('id', 'ev:' || ev.id, 'type', 'curse', 'ev', ev.id, 'evil', v_ev, 'target', ev.enchant_id, 'kind', 'pandora', 'serial', ev.xs,
             'at', round(v_now - v_age), 'ago', round(v_age), 'cost', private.clock_cost(v_age, v_half), 'emoji', '😈', 'title', v_t[1], 'detail', v_t[2]));
    elsif ev.ek = 'struck' and ev.xk = 'crucible' and not coalesce((ev.data ->> 'ok')::boolean, true) then
      v_lost := round(coalesce((ev.data ->> 'heat')::numeric, 0)
                      * (1 - coalesce((ev.data ->> 'kept')::numeric, case ev.data ->> 'rune' when 'fury' then 0 when 'steady' then 0.75 else 0.5 end)), 2);
      continue when v_lost <= 0;
      o := o || jsonb_build_array(jsonb_build_object('id', 'ev:' || ev.id, 'type', 'strike', 'ev', ev.id, 'lost', v_lost, 'target', ev.enchant_id, 'kind', 'crucible', 'serial', ev.xs,
             'at', round(v_now - v_age), 'ago', round(v_age), 'cost', private.clock_cost(v_age, v_half), 'emoji', '🔥',
             'title', 'A strike failed' || coalesce(' (' || (ev.data ->> 'from') || ')', ''), 'detail', round(v_lost) || ' Heat was lost — it comes back'));
    elsif ev.ek = 'fate' and ev.xk = 'deck' and not coalesce((ev.data ->> 'up')::boolean, true) then
      select coalesce(sum(-(x ->> 'v')::int) filter (where x ->> 't' = 'luck' and (x ->> 'v')::int < 0), 0) into v_lost
        from jsonb_array_elements(coalesce(ev.data -> 'effects', '[]'::jsonb)) x;
      v_glow := exists (select 1 from public.enchant_buffs bf where bf.player_id = e.owner_id and bf.kind = 'glow' and bf.enchant_id = ev.enchant_id and bf.mult < 1
                          and bf.expires_at > now() and bf.created_at between ev.created_at - interval '5 seconds' and ev.created_at + interval '5 seconds');
      continue when v_lost <= 0 and not v_glow;
      o := o || jsonb_build_array(jsonb_build_object('id', 'ev:' || ev.id, 'type', 'reversed', 'ev', ev.id, 'lost', v_lost, 'glow', v_glow, 'target', ev.enchant_id, 'kind', 'deck', 'serial', ev.xs,
             'card', ev.data ->> 'card', 'at', round(v_now - v_age), 'ago', round(v_age), 'cost', private.clock_cost(v_age, v_half), 'emoji', '🃏',
             'title', coalesce(private.deck_card(ev.data ->> 'card') ->> 'name', 'A card') || ' came up reversed',
             'detail', concat_ws(' and ', case when v_lost > 0 then 'it took ' || v_lost || ' Luck' end, case when v_glow then 'it dimmed your plots' end)));
    elsif ev.ek = 'fizzled' and ev.xk = 'glyph' then
      o := o || jsonb_build_array(jsonb_build_object('id', 'ev:' || ev.id, 'type', 'fizzle', 'ev', ev.id, 'target', ev.enchant_id, 'kind', 'glyph', 'serial', ev.xs,
             'at', round(v_now - v_age), 'ago', round(v_age), 'cost', private.clock_cost(v_age, v_half), 'emoji', '💨',
             'title', 'A glyph fizzled', 'detail', 'Its mana comes back'));
    end if;
  end loop;
  -- 📡 a Size Ray backfire shrank your plot
  for b in select bf.id, bf.gx, bf.gy, bf.created_at, bf.enchant_id, w.name from public.enchant_buffs bf left join public.world_plots w on w.gx = bf.gx and w.gy = bf.gy
            where bf.player_id = e.owner_id and bf.kind = 'plot_tiny' and bf.expires_at > now() and bf.created_at >= v_from
              and bf.data ->> 'grade' = 'MISS' and not coalesce((bf.data ->> 'prank')::boolean, false) loop
    v_age := extract(epoch from now() - b.created_at);
    o := o || jsonb_build_array(jsonb_build_object('id', 'buff:' || b.id, 'type', 'backfire', 'buff', b.id, 'gx', b.gx, 'gy', b.gy, 'target', b.enchant_id, 'kind', 'sizeray',
           'at', round(v_now - v_age), 'ago', round(v_age), 'cost', private.clock_cost(v_age, v_half), 'emoji', '📡',
           'title', 'The Size Ray backfired', 'detail', coalesce(b.name, 'Your plot') || ' shrank 100× — and the shot comes back'));
  end loop;
  -- ⚡ a storm's scorches
  for b in select date_trunc('minute', bf.created_at) m, count(*)::int n, min(bf.gx) gx, min(bf.gy) gy from public.enchant_buffs bf
            where bf.player_id = e.owner_id and bf.kind = 'scorch' and bf.expires_at > now() and bf.created_at >= v_from group by 1 loop
    v_age := extract(epoch from now() - b.m);
    o := o || jsonb_build_array(jsonb_build_object('id', 'scorch:' || extract(epoch from b.m)::bigint, 'type', 'scorch', 'm', extract(epoch from b.m)::bigint, 'n', b.n, 'gx', b.gx, 'gy', b.gy, 'kind', 'stormcoil',
           'at', round(v_now - v_age), 'ago', round(v_age), 'cost', private.clock_cost(v_age, v_half), 'emoji', '⚡',
           'title', 'A storm scorched ' || b.n || ' plot' || case when b.n = 1 then '' else 's' end, 'detail', 'Scorched plots earn 20% less for an hour'));
  end loop;
  -- 🐉 the Leviathan trampled your plots
  for b in select t.lev_id, date_trunc('minute', t.at) m, count(*)::int n, min(t.gx) gx, min(t.gy) gy from public.leviathan_trampled t
            where t.owner_id = e.owner_id and t.until > now() and t.scrubbed_at is null and t.at >= v_from group by 1, 2 loop
    v_age := extract(epoch from now() - b.m);
    o := o || jsonb_build_array(jsonb_build_object('id', 'trample:' || b.lev_id || ':' || extract(epoch from b.m)::bigint, 'type', 'trample', 'lev', b.lev_id, 'm', extract(epoch from b.m)::bigint,
           'n', b.n, 'gx', b.gx, 'gy', b.gy, 'kind', 'leviathan', 'at', round(v_now - v_age), 'ago', round(v_age), 'cost', private.clock_cost(v_age, v_half), 'emoji', '🐉',
           'title', 'The Leviathan trampled ' || b.n || ' plot' || case when b.n = 1 then '' else 's' end, 'detail', 'Trampled plots earn 40% less until they’re scrubbed'));
  end loop;
  return coalesce((select jsonb_agg(m order by (m ->> 'at')::numeric desc) from jsonb_array_elements(o) m), '[]'::jsonb);
end $$;

/** the plots it can roll again: claimed by you in the last 10 minutes, not enchanted, not a Crown, not rolled again already */
create or replace function private.clock_rolls(e public.enchantments) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'name', w.name, 'shiny', w.shiny, 'claimed_at', w.claimed_at,
                                               'left_s', greatest(0, round(600 - extract(epoch from now() - w.claimed_at)))) order by w.claimed_at desc), '[]'::jsonb)
    from (select * from public.world_plots w0
           where w0.owner_id = e.owner_id and w0.claimed_at > now() - interval '10 minutes' and w0.rarity <> 'enchanted' and w0.rarity not like 'crown%'
             and w0.folded_at is null and not coalesce(w0.locked, false)
             and not coalesce(e.state -> 'rr', '[]'::jsonb) ? (w0.gx || ':' || w0.gy)
             and exists (select 1 from public.plot_ownership o where o.gx = w0.gx and o.gy = w0.gy and o.player_id = e.owner_id and o.released_at is null
                           and o.method in ('acquire', 'starter', 'purchase'))
           order by w0.claimed_at desc limit 8) w
$$;

/** undo one moment */
create or replace function private.clock_undo(e public.enchantments, m jsonb) returns jsonb language plpgsql as $$
declare x public.enchantments; ev public.enchant_events; g jsonb; v_n int; v_lost int; v_out jsonb := '{}'::jsonb;
begin
  case m ->> 'type'
    when 'fox' then
      select * into x from public.enchantments where id = (m ->> 'target')::uuid for update;
      update public.enchantments set state = jsonb_set(state, '{chased}', coalesce(state -> 'chased', '[]'::jsonb) || to_jsonb((m ->> 'k')::int)) where id = x.id;
      perform private.ench_event(x.id, 'unbitten', jsonb_build_object('k', (m ->> 'k')::int));
      v_out := jsonb_build_object('fox', 'never bit');
    when 'backfire' then
      update public.enchant_buffs set expires_at = now() where id = (m ->> 'buff')::bigint and player_id = e.owner_id;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', (m ->> 'gx')::int - 52, (m ->> 'gy')::int - 52, (m ->> 'gx')::int + 52, (m ->> 'gy')::int + 52);
      -- the shot comes back
      select * into x from public.enchantments where id = (m ->> 'target')::uuid and kind = 'sizeray' and status = 'active' and owner_id = e.owner_id for update;
      if x.id is not null then
        g := private.ray_eval(x, private.ench_now(x));
        if (g ->> 'shots')::int < (g ->> 'max')::int then
          update public.enchantments set state = state || jsonb_build_object('shots', coalesce((state ->> 'shots')::int, 0) + 1) where id = x.id;
          v_out := jsonb_build_object('shot', true);
        end if;
      end if;
    when 'scorch' then
      update public.enchant_buffs set expires_at = now()
       where player_id = e.owner_id and kind = 'scorch' and expires_at > now() and extract(epoch from date_trunc('minute', created_at))::bigint = (m ->> 'm')::bigint;
      get diagnostics v_n = row_count;
      v_out := jsonb_build_object('washed', v_n);
    when 'trample' then
      update public.leviathan_trampled set scrubbed_by = e.owner_id, scrubbed_at = now()
       where owner_id = e.owner_id and lev_id = (m ->> 'lev')::uuid and scrubbed_at is null and until > now() and extract(epoch from date_trunc('minute', at))::bigint = (m ->> 'm')::bigint;
      get diagnostics v_n = row_count;
      v_out := jsonb_build_object('scrubbed', v_n);
    else
      select * into ev from public.enchant_events where id = (m ->> 'ev')::bigint;
      select * into x from public.enchantments where id = ev.enchant_id and owner_id = e.owner_id for update;
      if x.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      case m ->> 'type'
        when 'curse' then
          case ev.data ->> 'evil'
            when 'plague', 'greed', 'strife' then
              update public.enchant_buffs set expires_at = now() where player_id = e.owner_id and kind = 'curse_' || (ev.data ->> 'evil') and enchant_id = x.id and expires_at > now()
                 and created_at between ev.created_at - interval '5 seconds' and ev.created_at + interval '5 seconds';
            when 'envy' then perform private.ench_give_luck(e.owner_id, 15, 0); v_out := jsonb_build_object('luck', 15);
            when 'despair' then perform private.ench_give_luck(e.owner_id, 0, (ev.data ->> 'lost')::int); v_out := jsonb_build_object('enchant', (ev.data ->> 'lost')::int);
            when 'toil' then
              update public.enchantments set clock_skip = clock_skip + 7200 where owner_id = e.owner_id and status = 'active' and id <> x.id and born_at < ev.created_at;
            when 'sorrow' then update public.enchantments set state = state || jsonb_build_object('locked_until', 0) where id = x.id;
            else null;
          end case;
        when 'strike' then
          update public.enchantments set state = state || jsonb_build_object('heat', round(coalesce((state ->> 'heat')::numeric, 0) + (m ->> 'lost')::numeric, 2)) where id = x.id;
          v_out := jsonb_build_object('heat', (m ->> 'lost')::numeric);
        when 'reversed' then
          v_lost := coalesce((m ->> 'lost')::numeric, 0)::int;
          if v_lost > 0 then perform private.ench_give_luck(e.owner_id, v_lost, 0); end if;
          update public.enchant_buffs set expires_at = now() where player_id = e.owner_id and kind = 'glow' and enchant_id = x.id and mult < 1 and expires_at > now()
             and created_at between ev.created_at - interval '5 seconds' and ev.created_at + interval '5 seconds';
          v_out := jsonb_build_object('luck', v_lost);
        when 'fizzle' then
          g := private.glyph_eval(x, private.ench_now(x));
          update public.enchantments set state = state || jsonb_build_object('mana', least((g ->> 'max')::int, (g ->> 'mana')::int + 1), 'mana_at', (g ->> 'mana_at')::numeric) where id = x.id;
          v_out := jsonb_build_object('mana', 1);
        else raise exception 'not_found' using errcode = 'P0001';
      end case;
      update public.enchant_events set data = data || jsonb_build_object('rewound', true, 'rewound_at', now()) where id = ev.id;
      perform private.ench_event(x.id, 'unhappened', jsonb_build_object('what', m ->> 'type', 'title', m ->> 'title'));
  end case;
  return v_out;
end $$;

-- the view: the timeline and the rolls it can take back
create or replace function private.ench_view_clockwork(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.clock_eval(e, t); rw jsonb := private.clock_rw(e); tl jsonb := private.clock_timeline(e);
begin
  return g || jsonb_build_object('rewind', rw, 'timeline', tl, 'rolls', private.clock_rolls(e),
    'attention', case when (g ->> 'turns_left')::int > 0 then 'The key can be wound'
                      when jsonb_array_length(tl) > 0 and (rw ->> 'used')::int < (rw ->> 'per_day')::int then 'Something can be rewound' end);
end $$;

select private.fn_patch('private.ench_act_clockwork(public.enchantments, text, jsonb, timestamp with time zone)',
  'v_day text := to_char(now() at time zone ''UTC'', ''YYYY-MM-DD''); v_n int; v_m numeric; v_h numeric; v_pay jsonb;',
  'v_day text := to_char(now() at time zone ''UTC'', ''YYYY-MM-DD''); v_n int; v_m numeric; v_h numeric; v_pay jsonb;
  rw jsonb; mo jsonb; v_undo jsonb; w public.world_plots; v_new jsonb; v_kept boolean; v_ench public.enchantments; v_rr jsonb;');
select private.fn_patch('private.ench_act_clockwork(public.enchantments, text, jsonb, timestamp with time zone)',
  $a$    when 'unfreeze' then$a$,
  $b$    when 'rewind' then
      -- ⏪ take one bad moment back
      rw := private.clock_rw(e);
      if (rw ->> 'used')::int >= (rw ->> 'per_day')::int then raise exception 'already_today' using errcode = 'P0001'; end if;
      select m into mo from jsonb_array_elements(private.clock_timeline(e)) m where m ->> 'id' = a ->> 'id';
      if mo is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      if v_ch < (mo ->> 'cost')::numeric then raise exception 'not_enough_charge' using errcode = 'P0001'; end if;
      v_undo := private.clock_undo(e, mo);
      s := s || jsonb_build_object('charge', v_ch - (mo ->> 'cost')::numeric, 'rw_day', private.today()::text, 'rw_n', (rw ->> 'used')::int + 1,
                                   'last_rw', jsonb_build_object('type', mo ->> 'type', 'title', mo ->> 'title', 'at', extract(epoch from now())));
      perform private.ench_stat(e.id, 'rewinds');
      update public.enchantments set stats = stats || jsonb_build_object('rewound_min', greatest(coalesce((stats ->> 'rewound_min')::numeric, 0), round((mo ->> 'ago')::numeric / 60))) where id = e.id;
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'rewound', jsonb_build_object('type', mo ->> 'type', 'title', mo ->> 'title', 'ago', mo -> 'ago', 'cost', mo -> 'cost'));
      r := jsonb_build_object('rewound', mo, 'undo', v_undo, 'cost', mo -> 'cost', 'charge', s -> 'charge');
    when 'rewind_roll' then
      -- ⏪ a plot you just claimed rolls again (★5 Paradox: the better timeline stands)
      rw := private.clock_rw(e);
      if (rw ->> 'roll_used')::int >= (rw ->> 'roll_per_week')::int then raise exception 'too_soon' using errcode = 'P0001'; end if;
      if not exists (select 1 from jsonb_array_elements(private.clock_rolls(e)) q where (q ->> 'gx')::int = (a ->> 'gx')::int and (q ->> 'gy')::int = (a ->> 'gy')::int) then
        raise exception 'not_found' using errcode = 'P0001'; end if;
      if v_ch < (rw ->> 'roll_cost')::numeric then raise exception 'not_enough_charge' using errcode = 'P0001'; end if;
      select * into w from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and owner_id = e.owner_id for update;
      v_new := private.oracle_draw_roll();
      v_kept := (rw ->> 'paradox')::boolean and private.spy_rank(w.rarity) >= private.spy_rank(v_new ->> 'rarity');
      if not v_kept then
        perform private.rent_settle(e.owner_id);
        update public.world_plots set rarity = v_new ->> 'rarity', updated_at = now() where gx = w.gx and gy = w.gy;
        if v_new ->> 'rarity' = 'enchanted' then
          v_ench := private.ench_create(v_new ->> 'kind', e.owner_id, w.gx, w.gy);
          v_new := v_new || jsonb_build_object('enchant', jsonb_build_object('id', v_ench.id, 'kind', v_ench.kind, 'serial', v_ench.serial));
        end if;
        insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', w.gx, w.gy, w.gx, w.gy);
      end if;
      v_rr := coalesce(s -> 'rr', '[]'::jsonb) || to_jsonb(w.gx || ':' || w.gy);
      if jsonb_array_length(v_rr) > 20 then v_rr := (select jsonb_agg(z.rr) from (select q.rr from jsonb_array_elements(v_rr) with ordinality q(rr, o) order by q.o desc limit 20) z); end if;
      s := s || jsonb_build_object('charge', v_ch - (rw ->> 'roll_cost')::numeric, 'roll_week', to_char(now(), 'IYYY-IW'), 'roll_n', (rw ->> 'roll_used')::int + 1, 'rr', v_rr);
      perform private.ench_stat(e.id, 'rewound_rolls');
      if (rw ->> 'paradox')::boolean then perform private.ench_stat(e.id, 'paradoxes'); end if;
      perform private.ench_xp(e.id, 3);
      perform private.fairplay(e.owner_id, 'clock_reroll', w.gx, w.gy, jsonb_build_object('enchant', e.id, 'was', w.rarity, 'drew', v_new ->> 'rarity', 'kept', v_kept));
      perform private.ench_event(e.id, 'rerolled', jsonb_build_object('gx', w.gx, 'gy', w.gy, 'was', w.rarity, 'drew', v_new ->> 'rarity', 'kind', v_new ->> 'kind', 'kept', v_kept));
      if not v_kept and (v_new ->> 'rarity' = 'enchanted' or private.spy_rank(v_new ->> 'rarity') > private.spy_rank('mythic')) then
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'rerolled', 'kind', 'clockwork', 'serial', e.serial, 'rarity', v_new ->> 'rarity', 'ench', v_new ->> 'kind'));
      end if;
      r := jsonb_build_object('was', w.rarity, 'drew', v_new, 'kept_old', v_kept, 'rarity', case when v_kept then w.rarity else v_new ->> 'rarity' end,
                              'paradox', (rw ->> 'paradox')::boolean, 'gx', w.gx, 'gy', w.gy, 'charge', s -> 'charge');
    when 'unfreeze' then$b$);

-- ---- a few more badges for the new powers ---------------------------------------------------------------------------------
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort, is_secret) values
  ('gs_watch', 'Watch Goose', 'Your goose scares off 10 foxes all by itself (★4).', '🪿', 'enchant', 'ench.goose.scared', 10, '{"luck": 15}', 824, false),
  ('mp_dorado', 'El Dorado', 'Dig up the city of gold (★5).', '🏛️', 'enchant', 'ench.map.eldorado', 1, '{"luck": 30, "enchanted_luck": 1}', 825, true),
  ('or_weave', 'Fate Weaver', 'Weave a fate into an Enchanted roll (★5).', '🕸️', 'enchant', 'ench.oracle.weaves', 1, '{"luck": 25, "enchanted_luck": 1}', 826, false),
  ('cr_starforge', 'Starforged', 'A strike that would have failed, held by the stars (★5).', '🌠', 'enchant', 'ench.crucible.starforged', 1, '{"luck": 25}', 827, true),
  ('gl_triple', 'Triple Cast', 'Cast three glyphs at once (★5).', '🔯', 'enchant', 'ench.glyph.triples', 1, '{"luck": 25}', 828, false),
  ('sc_thunder', 'Thunder God', 'Charge 10 of your plots with bolts you caught (★5).', '🔱', 'enchant', 'ench.stormcoil.thunder', 10, '{"luck": 25}', 829, false),
  ('sy_panorama', 'Panorama', 'Read a whole neighbourhood in one look (★4).', '🖼️', 'enchant', 'ench.spyglass.panoramas', 1, '{"luck": 12}', 830, false),
  ('wh_singular', 'Singularity', 'Open a perfectly stable wormhole (★5).', '⚫', 'enchant', 'ench.wormhole.singularities', 1, '{"luck": 25}', 831, false),
  ('ge_unbound', 'Djinn Unbound', 'Make a Forbidden Wish that can’t twist (★5).', '🌪️', 'enchant', 'ench.genie.unbound', 1, '{"luck": 25}', 832, false),
  ('cw_deep', 'Deep Time', 'Rewind something from more than a day ago (★4).', '🕰️', 'enchant', 'ench.clockwork.rewound_min', 1440, '{"luck": 20}', 833, false)
on conflict (key) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, category = excluded.category,
  metric = excluded.metric, threshold = excluded.threshold, reward = excluded.reward, sort = excluded.sort, is_secret = excluded.is_secret;
