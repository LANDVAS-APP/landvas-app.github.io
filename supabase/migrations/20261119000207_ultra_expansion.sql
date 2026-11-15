-- The Ultra Expansion: nine new ultras that change the land around them, Ultra Fusions, and the Primordials — a tier
-- above every ultra (each about 1 in 3 million, as many as get rolled), with powers over the land around them.
--
--   New ultras (their own one-in-thousands roll, ordinary ultra rent; what they do is their worth):
--     Volcano 🌋 · World Tree 🌳 · Phantom 👻 · Wanderer 🦄 · Lodestone 🧲 · Leyline ⚡ · Glacier 🧊 · Mycelium 🍄 · Hive 🐝
--   Fusions (two ultras of yours become one; the other plot goes back to the world):
--     Eclipse 🌗 · Eternal Flame 🕯️ · Constellation ✨ · Kaleidoscope 🎆 · Krakatoa 🏝️ · Elder Tree 🌲 · Shooting Star 💫
--     Doppelgänger 👥 · Compass Rose 🧭 — and any three ultras together become a random Primordial
--   Primordials (rolled on their own parts-per-billion roll, ppb):
--     Heart of the World · Throne of Ink · Serpent's Egg · World's Eye · Void Gate · First Light · Fallen Star ·
--     Genesis Well · Chrysalis · Hourglass of Ages · Sunspot · Eleven-Eleven · The Loom · Upside Down · Midas Hand ·
--     Chain Reaction · Transmuter · Doubling Cube · Rift
-- The new ultras' effects (lava, roots, beams, trails, mushrooms, bees, frost) are drawn on their owner's map only.
-- Primordials show on everyone's map, and the moment one is rolled a shockwave crosses every map.

-- ---- the rarity table learns tiers and a parts-per-billion roll -------------------------------------------------------
alter table public.plot_rarities add column if not exists tier text;
alter table public.plot_rarities add column if not exists ppb int not null default 0;
alter table public.plot_rarities drop constraint if exists plot_rarities_ppb_check;
alter table public.plot_rarities add constraint plot_rarities_ppb_check check (ppb >= 0);
update public.plot_rarities set tier = 'ultra' where (ppm > 0 or id like 'crown%') and tier is null;

insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort, ppm, emoji, ability, tier) values
  ('volcano',    'Volcano',    0, 0.0000000140, 3.0, 1, '#F97316', '#FED7AA', 31, 150, '🌋', 'Erupts once a day: lava runs over the empty spots around it and cools into obsidian that only you can claim for an hour — each one rolls a tier higher (up to Mythic).', 'ultra'),
  ('world_tree', 'World Tree', 0, 0.0000000140, 3.0, 1, '#22C55E', '#BBF7D0', 32, 150, '🌳', 'Its roots grow toward your other plots, one a day (up to 6 within 2 km). The tree and every plot its roots reach pay 10% more in minigames.', 'ultra'),
  ('phantom',    'Phantom',    0, 0.0000000150, 3.1, 1, '#A5B4FC', '#EEF2FF', 33, 120, '👻', 'Looks like a Common to everyone but you. Each night it whispers what one empty spot nearby would roll — claim it within a day and that is exactly what you get.', 'ultra'),
  ('wanderer',   'Wanderer',   0, 0.0000000150, 3.1, 1, '#F0ABFC', '#FAE8FF', 34, 120, '🦄', 'Gallops to a new spot nearby once a day, drawing and all. The rainbow trail it leaves rolls a tier higher for you for an hour.', 'ultra'),
  ('lodestone',  'Lodestone',  0, 0.0000000140, 3.0, 1, '#EF4444', '#FECACA', 35, 150, '🧲', 'Pulls in what''s loose: your Seeking chests bury beside it, it gathers Ink every day for you to collect, and it drags 25% more loot out of a fallen Leviathan.', 'ultra'),
  ('leyline',    'Leyline',    0, 0.0000000150, 3.2, 1, '#38BDF8', '#E0F2FE', 36, 100, '⚡', 'Fires a beam of light from it to your farthest plot (up to 500 km). Every empty spot under the beam rolls a tier higher for you.', 'ultra'),
  ('glacier',    'Glacier',    0, 0.0000000140, 3.0, 1, '#67E8F9', '#ECFEFF', 37, 150, '🧊', 'Freezes the land around it (about 75 m), yours and your neighbours'': the Leviathan can''t trample it, Parasites can''t latch on, pranks and storm scorches bounce off.', 'ultra'),
  ('mycelium',   'Mycelium',   0, 0.0000000140, 3.0, 1, '#A3E635', '#ECFCCB', 38, 150, '🍄', 'Glowing mushrooms creep onto the empty spots around it, one more every day (up to 12). Claim a mushroom spot and it rolls a tier higher.', 'ultra'),
  ('hive',       'Hive',       0, 0.0000000140, 3.0, 1, '#FACC15', '#FEF9C3', 39, 150, '🐝', 'Every day its bees pollinate up to 5 of your neighbours'' plots (their minigames pay 10% more for a day) and bring you back honey: 5 Ink a flower.', 'ultra')
on conflict (id) do update set name = excluded.name, usd_per_second = excluded.usd_per_second, ink_reward_multiplier = excluded.ink_reward_multiplier,
  color = excluded.color, glow = excluded.glow, sort = excluded.sort, ppm = excluded.ppm, emoji = excluded.emoji, ability = excluded.ability, tier = excluded.tier;

insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort, ppm, emoji, ability, tier) values
  ('eclipse',       'Eclipse',       0, 0.0000000120, 3.5, 1, '#6D28D9', '#FDE68A', 41, 0, '🌗', 'Fused from a Solar and a Lunar: the sun and the moon at once — ×4.5 rent day and night.', 'fusion'),
  ('eternal_flame', 'Eternal Flame', 0, 0.0000000200, 3.8, 1, '#FB923C', '#FFF7ED', 42, 0, '🕯️', 'Fused from a Phoenix and an Ancient: its streak never burns to ashes (×3 at the least), and it grows +3% a day like an Ancient on top.', 'fusion'),
  ('constellation', 'Constellation', 0, 0.0000000140, 3.8, 1, '#F9A8D4', '#FFFFFF', 43, 0, '✨', 'Two Geminis made one: it earns like a whole pair on its own — ×26, forever.', 'fusion'),
  ('kaleidoscope',  'Kaleidoscope',  0, 0.0000000150, 3.8, 1, '#F43F5E', '#A5F3FC', 44, 0, '🎆', 'A secret fusion of a Chaos and a Mirror: it re-rolls like a Chaos and copies your best plot like a Mirror — both at once.', 'fusion'),
  ('krakatoa',      'Krakatoa',      0, 0.0000000150, 3.6, 1, '#EA580C', '#5EEAD4', 45, 0, '🏝️', 'Fused from a Volcano and a Kraken: it drags in its neighbours'' rent like a Kraken and erupts twice as wide, twice a day.', 'fusion'),
  ('elder_tree',    'Elder Tree',    0, 0.0000000200, 3.6, 1, '#15803D', '#D9F99D', 46, 0, '🌲', 'Fused from a World Tree and an Ancient: roots twice as far (4 km) to twice as many plots (12), and it grows +3% a day like an Ancient.', 'fusion'),
  ('shooting_star', 'Shooting Star', 0, 0.0000000150, 3.6, 1, '#C084FC', '#E0F2FE', 47, 0, '💫', 'Fused from a Wanderer and a Comet: it gallops ten times as far every day and leaves a trail twice as long — ×2.3 rent.', 'fusion'),
  ('doppelganger',  'Doppelgänger',  0, 0.0000000150, 3.6, 1, '#94A3B8', '#F1F5F9', 48, 0, '👥', 'A secret fusion of a Phantom and a Mirror: it shows the world any rarity you choose, whispers like a Phantom, and copies your best plot''s rent.', 'fusion'),
  ('compass_rose',  'Compass Rose',  0, 0.0000000150, 3.6, 1, '#E11D48', '#BAE6FD', 49, 0, '🧭', 'Fused from a Lodestone and a Leyline: beams of light to up to 8 of your plots at once, and every Lodestone pull — ×2.2 rent.', 'fusion')
on conflict (id) do update set name = excluded.name, usd_per_second = excluded.usd_per_second, ink_reward_multiplier = excluded.ink_reward_multiplier,
  color = excluded.color, glow = excluded.glow, sort = excluded.sort, ppm = excluded.ppm, emoji = excluded.emoji, ability = excluded.ability, tier = excluded.tier;

insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort, ppm, ppb, emoji, ability, tier) values
  ('heart_world',   'Heart of the World', 0, 0.0000008, 6, 1, '#E11D48', '#FFE4E6', 51, 0, 330, '🌍', 'Once a week its holder gives every player with land within 5 km a free Golden Hour — a gift from them.', 'primordial'),
  ('throne_ink',    'Throne of Ink',      0, 0.0000008, 6, 1, '#7C3AED', '#FDE68A', 52, 0, 330, '📜', 'Once a week its holder sets a rule for the land within 5 km: minigames pay more, shinies come 3× as often, ultras roll twice as often, or peace (nothing can be trampled, pranked or scorched).', 'primordial'),
  ('serpent_egg',   'Serpent''s Egg',     0, 0.0000008, 6, 1, '#059669', '#A7F3D0', 53, 0, 330, '🐉', 'The Leviathan answers to it: once a week its holder calls the Leviathan toward it, their land is never trampled, and they take 50% more of its loot.', 'primordial'),
  ('world_eye',     'World''s Eye',       0, 0.0000008, 6, 1, '#0EA5E9', '#E0F2FE', 54, 0, 330, '👁️', 'Sees what''s hidden: every Phantom within 5 km shows its true face to its holder, and once a day it gazes at the empty land around it and marks every spot that would roll Epic or better.', 'primordial'),
  ('void_gate',     'Void Gate',          0, 0.0000008, 6, 1, '#4C1D95', '#C4B5FD', 55, 0, 330, '🌑', 'Opens every evening (8 pm to midnight there). Anyone with land within 5 km can step through once a night for a free Rare-or-better roll; its holder is paid for every traveller.', 'primordial'),
  ('first_light',   'First Light',        0, 0.0000008, 6, 1, '#F59E0B', '#FFFBEB', 56, 0, 330, '🌅', 'Its holder''s drawing on it greets every player with land within 5 km when they open the game.', 'primordial'),
  ('fallen_star',   'Fallen Star',        0, 0.0000008, 6, 1, '#FDE047', '#FFFFFF', 57, 0, 330, '⭐', 'Once a week its holder calls down a shower of shooting stars over the land around it: anyone can catch them for Ink, Luck or a Golden Hour.', 'primordial'),
  ('genesis_well',  'Genesis Well',       0, 0.0000008, 6, 1, '#10B981', '#FEF08A', 58, 0, 330, '🌀', 'Once a month new land rises beside it: 25 glowing spots for two days where anyone''s claims roll ultras 3× as often.', 'primordial'),
  ('chrysalis',     'Chrysalis',          0, 0.0000008, 6, 1, '#A78BFA', '#FCE7F3', 59, 0, 330, '🦋', 'A cocoon for 30 days — then it hatches into a random Primordial. Nobody knows which, not even you.', 'primordial'),
  ('hourglass',     'Hourglass of Ages',  0, 0.0000008, 6, 1, '#D97706', '#FEF3C7', 60, 0, 330, '⏳', 'Time runs twice as fast for every enchantment its holder has within 5 km.', 'primordial'),
  ('sunspot',       'Sunspot',            0, 0.0000008, 6, 1, '#FB923C', '#FFEDD5', 61, 0, 330, '🔆', 'Your own Hot Zone: once a day place it anywhere in the world (1 km across). Only your claims inside it get the Hot Zone''s rolls — the better of two, ultras ×5, shinies ×2.', 'primordial'),
  ('eleven',        'Eleven-Eleven',      0, 0.0000008, 6, 1, '#F472B6', '#FDF2F8', 62, 0, 330, '🌠', 'At 11:11 — morning and night, in your own time zone — you have that one minute to make a wish: Ink, Luck, a Golden Hour or a roll ticket. Wish every time and the 11th in a row brings a Legendary-or-better roll.', 'primordial'),
  ('loom',          'The Loom',           0, 0.0000008, 6, 1, '#EC4899', '#FCE7F3', 63, 0, 330, '🧵', 'Weaves a second thread into every claim you make: every plot you claim is rolled twice, and you keep the better.', 'primordial'),
  ('upside_down',   'Upside Down',        0, 0.0000008, 6, 1, '#14B8A6', '#CCFBF1', 64, 0, 330, '🙃', 'Once a week, flip the rarity table for an hour: for you, Mythic becomes the most common roll and Common the rarest — and ultras come 10× as often.', 'primordial'),
  ('midas',         'Midas Hand',         0, 0.0000008, 6, 1, '#EAB308', '#FEF9C3', 65, 0, 330, '🖐️', 'Everything you touch turns to gold: every minigame you win on one of your plots has a 1 in 25 chance to turn that plot a tier higher (up to Mythic).', 'primordial'),
  ('chain',         'Chain Reaction',     0, 0.0000008, 6, 1, '#F43F5E', '#FFE4E6', 66, 0, 330, '⛓️', 'Every plot you claim has a 30% chance to set off a chain: the empty spot beside it is claimed for you, free — and it can chain again, up to 5 links.', 'primordial'),
  ('transmuter',    'Transmuter',         0, 0.0000008, 6, 1, '#8B5CF6', '#DDD6FE', 67, 0, 330, '⚗️', 'Once a day, melt 5 of your plots of one rarity into one plot of the next tier up (up to Mythic).', 'primordial'),
  ('doubling_cube', 'Doubling Cube',      0, 0.0000008, 6, 1, '#0F172A', '#FDE047', 68, 0, 330, '🎰', 'Once a day, double or nothing: roll one of your plots — heads it goes a tier up, tails a tier down (Common to Legendary).', 'primordial'),
  ('rift',          'Rift',               0, 0.0000008, 6, 1, '#6366F1', '#E0E7FF', 69, 0, 330, '🌐', 'Once a day, tear a rift anywhere in the world: for 24 hours you can claim plots around it as if you were standing there.', 'primordial')
on conflict (id) do update set name = excluded.name, usd_per_second = excluded.usd_per_second, ink_reward_multiplier = excluded.ink_reward_multiplier,
  color = excluded.color, glow = excluded.glow, sort = excluded.sort, ppm = excluded.ppm, ppb = excluded.ppb, emoji = excluded.emoji, ability = excluded.ability, tier = excluded.tier;

-- the feed learns a new line: a Primordial came into the world
alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest', 'ipo', 'arcade',
                  'luck', 'crown', 'flight', 'estate', 'moderation', 'enchant', 'leviathan', 'primordial'));

-- …and the alerts one: what your powers did (data.sub says which)
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant', 'leviathan', 'power'));

-- (who owns plots of a rarity: the heartbeat looks the new ones up by rarity)
create index if not exists world_plots_owned_rarity_idx on public.world_plots (rarity) where owner_id is not null;

-- ---- the powers: one row per plot of a rarity that does something -----------------------------------------------------
create table if not exists public.rarity_powers (
  gx int not null,
  gy int not null,
  owner_id uuid not null references public.players(id) on delete cascade,
  rarity text not null,
  state jsonb not null default '{}'::jsonb,
  since timestamptz not null default now(),
  next_at timestamptz,          -- its next daily deed (eruption, root, whisper, gallop, …)
  tick_at timestamptz,          -- the Hourglass: when it last ran time on
  updated_at timestamptz not null default now(),
  primary key (gx, gy)
);
create index if not exists rarity_powers_owner_idx on public.rarity_powers (owner_id);
create index if not exists rarity_powers_kind_idx on public.rarity_powers (rarity, gx, gy);
create index if not exists rarity_powers_due_idx on public.rarity_powers (next_at) where next_at is not null;
alter table public.rarity_powers enable row level security;
revoke all on public.rarity_powers from anon, authenticated;

-- spots a power leaves on the land: obsidian (Volcano), a trail (Wanderer), mushrooms (Mycelium) — for their owner only;
-- glints (World's Eye, its holder only); shooting stars and new land (Fallen Star, Genesis Well — for everyone)
create table if not exists public.rarity_spots (
  id bigserial primary key,
  kind text not null check (kind in ('obsidian', 'trail', 'mushroom', 'glint', 'star', 'genesis')),
  gx int not null,
  gy int not null,
  owner_id uuid references public.players(id) on delete cascade,   -- null: for everyone
  src_gx int,
  src_gy int,
  bump int not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists rarity_spots_cell_idx on public.rarity_spots (gx, gy);
create index if not exists rarity_spots_owner_idx on public.rarity_spots (owner_id, kind);
create index if not exists rarity_spots_src_idx on public.rarity_spots (src_gx, src_gy);
create index if not exists rarity_spots_exp_idx on public.rarity_spots (expires_at);
alter table public.rarity_spots enable row level security;
revoke all on public.rarity_spots from anon, authenticated;

-- the moments a Primordial is rolled (or hatched, or fused): a shockwave on every map
create table if not exists public.rarity_moments (
  id bigserial primary key,
  kind text not null default 'primordial',
  gx int not null,
  gy int not null,
  rarity text not null,
  player_id uuid references public.players(id) on delete set null,
  how text,
  place text,
  created_at timestamptz not null default now()
);
create index if not exists rarity_moments_at_idx on public.rarity_moments (created_at desc);
create index if not exists rarity_moments_player_idx on public.rarity_moments (player_id);
alter table public.rarity_moments enable row level security;
revoke all on public.rarity_moments from anon, authenticated;

-- once-a-night / once-a-shower visits (the Void Gate's travellers, the Heart's gifts)
create table if not exists public.rarity_visits (
  gx int not null,
  gy int not null,
  player_id uuid not null references public.players(id) on delete cascade,
  day text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (gx, gy, player_id, day, kind)
);
create index if not exists rarity_visits_player_idx on public.rarity_visits (player_id);
alter table public.rarity_visits enable row level security;
revoke all on public.rarity_visits from anon, authenticated;

-- the fusions a player has made (secret recipes show in their book once made)
create table if not exists public.player_fusions (
  player_id uuid not null references public.players(id) on delete cascade,
  fusion text not null,
  n int not null default 1,
  first_at timestamptz not null default now(),
  primary key (player_id, fusion)
);
alter table public.player_fusions enable row level security;
revoke all on public.player_fusions from anon, authenticated;

-- ---- settings (Admin → Game settings → rarity_powers) --------------------------------------------------------------------
insert into public.game_config (key, value, description) values ('rarity_powers', $cfg${
  "area_m": 5000,
  "volcano": {"spots": 4, "minutes": 60, "min": 3, "max": 14},
  "world_tree": {"km": 2, "max": 6, "mult": 1.1},
  "phantom": {"min": 4, "max": 60},
  "wanderer": {"min": 4, "max": 15, "trail": 5, "minutes": 60},
  "lodestone": {"ink_day": 20, "cap_days": 3, "loot_pct": 25},
  "leyline": {"km": 500, "cells": 1},
  "glacier": {"cells": 8},
  "mycelium": {"max": 12, "days": 7},
  "hive": {"n": 5, "cells": 30, "honey": 5, "mult": 1.1},
  "heart_world": {"uses": 3, "mult": 2, "cap": 1000},
  "throne_ink": {"minigames": 1.15, "shiny": 3, "ultras": 2},
  "serpent_egg": {"loot_pct": 50},
  "world_eye": {"cells": 15},
  "void_gate": {"open_h": 20, "len_h": 4, "epic": 0.1, "tip": 5, "tip_cap": 100},
  "fallen_star": {"n": 30, "minutes": 20, "m": 2000, "tip": 2, "tip_cap": 60, "ink": 10, "luck": 3},
  "genesis_well": {"n": 25, "hours": 48, "ultra_x": 3},
  "chrysalis": {"days": 30},
  "hourglass": {"x": 2},
  "sunspot": {"m": 1000},
  "eleven": {"tz_days": 7, "ink": 111, "luck": 11, "streak": 11},
  "upside_down": {"minutes": 60, "ultra_x": 10},
  "midas": {"one_in": 25},
  "chain": {"pct": 30, "max": 5},
  "rift": {"m": 150, "hours": 24},
  "clock_shift_s": 0,
  "fusions": [
    {"a": "lunar", "b": "solar", "to": "eclipse"},
    {"a": "ancient", "b": "phoenix", "to": "eternal_flame"},
    {"a": "gemini", "b": "gemini", "to": "constellation"},
    {"a": "chaos", "b": "mirror", "to": "kaleidoscope", "secret": true},
    {"a": "kraken", "b": "volcano", "to": "krakatoa"},
    {"a": "ancient", "b": "world_tree", "to": "elder_tree"},
    {"a": "comet", "b": "wanderer", "to": "shooting_star"},
    {"a": "mirror", "b": "phantom", "to": "doppelganger", "secret": true},
    {"a": "leyline", "b": "lodestone", "to": "compass_rose"}
  ],
  "fuse_per_day": 10
}$cfg$::jsonb, 'The Ultra Expansion: what the new ultras, the fusions and the Primordials do (rarity_powers)')
on conflict (key) do update set value = excluded.value, description = excluded.description;

-- ---- badges: one for every new rarity, and a few for the tier ----------------------------------------------------------
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort)
select 'rar_' || r.id,
       case r.tier when 'primordial' then 'Primordial: ' || r.name when 'fusion' then 'Fused: ' || r.name else r.name end,
       case r.tier when 'primordial' then 'Own the Primordial ' || r.name || '.' when 'fusion' then 'Make a ' || r.name || ' fusion.' else 'Own a ' || r.name || ' plot.' end,
       'rarity:' || r.id, 'rarity', 'rar_' || r.id, 1,
       case r.tier when 'primordial' then '{"pigments": 400, "gallery_tokens": 25}'::jsonb when 'fusion' then '{"pigments": 90, "gallery_tokens": 6}'::jsonb else '{"pigments": 50, "gallery_tokens": 4}'::jsonb end,
       200 + r.sort
  from public.plot_rarities r where r.tier in ('fusion', 'primordial') or r.id in ('volcano', 'world_tree', 'phantom', 'wanderer', 'lodestone', 'leyline', 'glacier', 'mycelium', 'hive')
on conflict (key) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, metric = excluded.metric, threshold = excluded.threshold, is_active = true;
-- ---- the Ultra Expansion: helpers, rolls, rent, and the powers' engine ------------------------------------------------
alter table public.plot_ownership drop constraint if exists plot_ownership_method_check;
alter table public.plot_ownership add constraint plot_ownership_method_check check (method in ('starter', 'acquire', 'admin_grant', 'purchase', 'unfold', 'chain', 'wander', 'fusion'));

create or replace function private.rx_cfg() returns jsonb language sql stable as $$
  select coalesce(private.cfg('rarity_powers'), '{}'::jsonb)
$$;
create or replace function private.rx_n(p_k text, p_s text, p_d numeric) returns numeric language sql stable as $$
  select coalesce((private.rx_cfg() -> p_k ->> p_s)::numeric, p_d)
$$;
create or replace function private.rx_area_m() returns numeric language sql stable as $$
  select coalesce((private.rx_cfg() ->> 'area_m')::numeric, 5000)
$$;
-- the server's clock for the 11:11 wishes (an admin can shift it, e.g. to try it out)
create or replace function private.rx_now() returns timestamptz language sql stable as $$
  select now() + make_interval(secs => coalesce((private.rx_cfg() ->> 'clock_shift_s')::double precision, 0))
$$;
-- metres across one plot on this row of the map, and how many plots make a distance there
create or replace function private.rx_cell_m(p_gy int) returns numeric language sql immutable as $$
  select (40075016.686 * cos(atan(sinh(pi() * (1 - 2 * (p_gy + 0.5) / 4194304.0)))) / 4194304.0)::numeric
$$;
create or replace function private.rx_cells(p_m numeric, p_gy int) returns int language sql immutable as $$
  select greatest(1, least(2000000, ceil(p_m / greatest(private.rx_cell_m(p_gy), 0.01))))::int
$$;
create or replace function private.rx_m(p_ax int, p_ay int, p_bx int, p_by int) returns numeric language sql stable as $$
  select private.ench_cell_m(p_ax, p_ay, p_bx, p_by)::numeric
$$;

create or replace function private.rx_primordials() returns text[] language sql immutable as $$
  select array['heart_world', 'throne_ink', 'serpent_egg', 'world_eye', 'void_gate', 'first_light', 'fallen_star', 'genesis_well', 'chrysalis',
               'hourglass', 'sunspot', 'eleven', 'loom', 'upside_down', 'midas', 'chain', 'transmuter', 'doubling_cube', 'rift']
$$;
create or replace function private.rx_is_primordial(p_id text) returns boolean language sql immutable as $$
  select p_id = any (private.rx_primordials())
$$;
create or replace function private.rx_fusions() returns text[] language sql immutable as $$
  select array['eclipse', 'eternal_flame', 'constellation', 'kaleidoscope', 'krakatoa', 'elder_tree', 'shooting_star', 'doppelganger', 'compass_rose']
$$;
create or replace function private.rx_new_ultras() returns text[] language sql immutable as $$
  select array['volcano', 'world_tree', 'phantom', 'wanderer', 'lodestone', 'leyline', 'glacier', 'mycelium', 'hive']
$$;
-- every rarity whose plot carries a power row
create or replace function private.rx_power_ids() returns text[] language sql immutable as $$
  select private.rx_new_ultras() || array['krakatoa', 'elder_tree', 'shooting_star', 'doppelganger', 'compass_rose'] || private.rx_primordials()
$$;
-- the power a rarity works with (a fusion works with its parent's)
create or replace function private.rx_family(p_id text) returns text language sql immutable as $$
  select case p_id when 'krakatoa' then 'volcano' when 'elder_tree' then 'world_tree' when 'shooting_star' then 'wanderer'
                   when 'doppelganger' then 'phantom' when 'compass_rose' then 'compass' else p_id end
$$;

-- the everyday ladder: up, down, and the better of two rolls
create or replace function private.rx_ladder() returns text[] language sql immutable as $$
  select array['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']
$$;
create or replace function private.rx_up(p text, p_n int default 1) returns text language sql immutable as $$
  select case when array_position(private.rx_ladder(), p) is null then p
              else (private.rx_ladder())[least(array_position(private.rx_ladder(), p) + p_n, 6)] end
$$;
create or replace function private.rx_down(p text) returns text language sql immutable as $$
  select case when array_position(private.rx_ladder(), p) is null then p
              else (private.rx_ladder())[greatest(array_position(private.rx_ladder(), p) - 1, 1)] end
$$;
create or replace function private.plot_rarity_rank(p_id text) returns numeric language sql stable as $$
  select case when r.tier = 'primordial' then 2000000000 + r.sort when r.id like 'crown%' then 1e9
              when r.tier = 'fusion' then 300000 + r.sort
              when coalesce(r.ppm, 0) > 0 then 1000 + 1000000.0 / r.ppm else r.sort end
  from public.plot_rarities r where r.id = p_id
$$;
create or replace function private.rx_best(p_a text, p_b text) returns text language sql stable as $$
  select case when p_b is null then p_a when p_a is null then p_b
              when private.plot_rarity_rank(p_b) > private.plot_rarity_rank(p_a) then p_b else p_a end
$$;
create or replace function private.spy_rank(p_rarity text) returns numeric language sql stable as $$
  select case when p_rarity = 'enchanted' then 4.5 when private.rx_is_primordial(p_rarity) then 9000 when p_rarity like 'crown%' then 5000
              else coalesce((select case when ppm > 0 then 7 + 1000.0 / greatest(ppm, 1) else sort end from public.plot_rarities where id = p_rarity), 0) end
$$;
-- a Primordial picked by its odds (for a hatching Chrysalis, a triple fusion), never the one in p_not
create or replace function private.rx_pick_primordial(p_not text default null) returns text language sql volatile as $$
  select r.id from public.plot_rarities r where r.ppb > 0 and r.id is distinct from p_not order by -ln(1 - random()) / r.ppb limit 1
$$;

-- ---- rolls ---------------------------------------------------------------------------------------------------------------
-- the everyday table turned upside down: the rarest tier is the most common
create or replace function private.rx_pick_flipped(p_roll bigint) returns text language plpgsql stable as $$
declare v_ids text[]; v_w int[]; v_total int := 0; v_acc int := 0; i int; n int; r record;
begin
  for r in select id, weight from public.plot_rarities where weight > 0 order by sort, id loop
    v_ids := v_ids || r.id; v_w := v_w || r.weight; v_total := v_total + r.weight;
  end loop;
  n := coalesce(array_length(v_ids, 1), 0);
  if n = 0 or v_total = 0 then return 'common'; end if;
  for i in 1 .. n loop
    v_acc := v_acc + v_w[n + 1 - i];
    if abs(p_roll) % v_total < v_acc then return v_ids[i]; end if;
  end loop;
  return v_ids[n];
end $$;

-- a second, salted roll of a cell (the Loom's other thread, a Sunspot's hot roll, an Upside Down hour): its own
-- Primordial roll, its own ultra roll (×p_um), then the everyday table (the better of two if hot, flipped if p_flip)
create or replace function private.rx_roll(p_gx int, p_gy int, p_salt text, p_um numeric, p_hot boolean, p_flip boolean default false)
returns text language plpgsql stable as $$
declare v_total int; r record; v_acc numeric := 0; v_a text; v_b text;
  v_p bigint := abs(private.cell_roll(p_salt || ':prim', p_gx, p_gy)) % 1000000000;
  v_u bigint := abs(private.cell_roll(p_salt || ':ultra', p_gx, p_gy)) % 1000000;
begin
  for r in select id, ppb from public.plot_rarities where ppb > 0 order by ppb, sort loop
    v_acc := v_acc + r.ppb * p_um;
    if v_p < v_acc then return r.id; end if;
  end loop;
  v_acc := 0;
  for r in select id, ppm from public.plot_rarities where ppm > 0 and id not like 'crown%' order by ppm, sort loop
    v_acc := v_acc + r.ppm * p_um;
    if v_u < v_acc then return r.id; end if;
  end loop;
  if p_flip then return private.rx_pick_flipped(abs(private.cell_roll(p_salt || ':flip', p_gx, p_gy))); end if;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return 'common'; end if;
  v_a := private.rarity_pick(abs(private.cell_roll(p_salt || ':r', p_gx, p_gy)) % v_total);
  if p_hot then
    v_b := private.rarity_pick(abs(private.cell_roll(p_salt || ':h', p_gx, p_gy)) % v_total);
    if (select sort from public.plot_rarities where id = v_b) > (select sort from public.plot_rarities where id = v_a) then v_a := v_b; end if;
  end if;
  return v_a;
end $$;

-- a Throne's decree over a spot
create or replace function private.rx_rule_at(p_gx int, p_gy int, p_rule text) returns boolean language sql stable as $$
  select exists (
    select 1 from public.rarity_powers x, (select private.rx_cells(private.rx_area_m(), p_gy) r) k
     where x.rarity = 'throne_ink' and x.state ->> 'rule' = p_rule and (x.state ->> 'rule_until')::timestamptz > now()
       and x.gx between p_gx - k.r and p_gx + k.r and x.gy between p_gy - k.r and p_gy + k.r
       and private.rx_m(x.gx, x.gy, p_gx, p_gy) <= private.rx_area_m())
$$;
-- how much likelier ultras (and Primordials) are on a spot right now: new land from a Genesis Well, a Throne's decree
create or replace function private.rx_cell_um(p_gx int, p_gy int) returns numeric language sql stable as $$
  select (case when exists (select 1 from public.rarity_spots s where s.kind = 'genesis' and s.gx = p_gx and s.gy = p_gy and s.expires_at > now())
               then private.rx_n('genesis_well', 'ultra_x', 3) else 1 end)
       * (case when private.rx_rule_at(p_gx, p_gy, 'ultras') then private.rx_n('throne_ink', 'ultras', 2) else 1 end)
$$;

-- a cell's own roll: a Primordial (parts per billion) first, then a Crown, then the ultras, then the everyday table
create or replace function private.plot_rarity_for(p_gx integer, p_gy integer) returns text language plpgsql stable as $function$
declare v_total int; r record; v_hot boolean := private.in_hot_zone(p_gx, p_gy);
  v_um numeric := (case when v_hot then coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5) else 1 end) * private.rx_cell_um(p_gx, p_gy);
  v_u bigint := abs(private.cell_roll('ultra', p_gx, p_gy)) % 1000000; v_uacc numeric := 0; v_a text; v_b text; v_city jsonb;
  v_p bigint := abs(private.cell_roll('primordial', p_gx, p_gy)) % 1000000000; v_pacc numeric := 0;
begin
  -- a Primordial: rarer than any ultra, as many as get rolled
  for r in select id, ppb from public.plot_rarities where ppb > 0 order by ppb, sort loop
    v_pacc := v_pacc + r.ppb * v_um;
    if v_p < v_pacc then return r.id; end if;
  end loop;
  -- the Crown: only inside a city, and only while that city has none (checked again when it's claimed)
  v_city := private.city_at(p_gx, p_gy);
  if v_city is not null then
    if abs(private.cell_roll('crown_country', p_gx, p_gy)) % 1000000
         < coalesce((private.cfg('rarity_abilities') -> 'crown_country' ->> 'ppm')::numeric, 5) * v_um
       and not private.crown_country_held(v_city ->> 'country') then
      return 'crown_country';
    end if;
    if abs(private.cell_roll('crown_state', p_gx, p_gy)) % 1000000
         < coalesce((private.cfg('rarity_abilities') -> 'crown_state' ->> 'ppm')::numeric, 50) * v_um
       and v_city ->> 'state' is not null and not private.crown_state_held(v_city ->> 'country', v_city ->> 'state') then
      return 'crown_state';
    end if;
  end if;
  if v_city is not null and abs(private.cell_roll('crown', p_gx, p_gy)) % 1000000
       < coalesce((private.cfg('rarity_abilities') -> 'crown' ->> 'ppm')::numeric, 1000) * v_um
     and not private.crown_held(v_city ->> 'id') then
    return 'crown';
  end if;
  for r in select id, ppm from public.plot_rarities where ppm > 0 order by ppm, sort loop
    v_uacc := v_uacc + r.ppm * v_um;
    if v_u < v_uacc then return r.id; end if;
  end loop;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return 'common'; end if;
  v_a := private.rarity_pick(private.cell_roll('rarity', p_gx, p_gy) % v_total);
  if not v_hot then return v_a; end if;
  v_b := private.rarity_pick(abs(private.cell_roll('hot' || private.today()::text, p_gx, p_gy)) % v_total);
  return case when (select sort from public.plot_rarities where id = v_b) > (select sort from public.plot_rarities where id = v_a) then v_b else v_a end;
end $function$;

-- ---- rent: the fusions' multipliers --------------------------------------------------------------------------------------
-- an Ancient's growth, for the fusions that inherit it
create or replace function private.rx_age_mult(p public.world_plots) returns numeric language sql stable as $$
  select least(1 + coalesce((private.cfg('rarity_abilities') -> 'ancient' ->> 'per_day')::numeric, 0.03)
               * floor(extract(epoch from now() - coalesce(p.claimed_at, now())) / 86400), coalesce((private.cfg('rarity_abilities') -> 'ancient' ->> 'max')::numeric, 6))
$$;
create or replace function private.plot_rate(p public.world_plots, p_base numeric) returns numeric language sql stable as $function$
  select p_base * (1 + coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) * (greatest(coalesce(p.level, 1), 1) - 1))
    * case when p.shiny then coalesce((private.cfg('shiny') ->> 'rent_mult')::numeric, 5) else 1 end
    * case when p.rarity = 'ancient' then private.rx_age_mult(p) else 1 end
$function$;
create or replace function private.plot_day_mult(p public.world_plots, p_day date) returns numeric language sql stable as $function$
  select case p.rarity
    when 'chaos' then private.chaos_mult(p.gx, p.gy, p_day)
    when 'phoenix' then private.phoenix_mult(p.owner_id, p_day)
    when 'kraken' then private.kraken_mult(p)
    when 'gemini' then private.gemini_mult(p)
    when 'mirror' then private.mirror_mult(p)
    -- the fusions
    when 'eclipse' then 4.5
    when 'eternal_flame' then greatest(private.phoenix_mult(p.owner_id, p_day), 3) + private.rx_age_mult(p) - 1
    when 'constellation' then 26
    when 'kaleidoscope' then private.chaos_mult(p.gx, p.gy, p_day) + private.mirror_mult(p)
    when 'krakatoa' then private.kraken_mult(p) + 1
    when 'elder_tree' then private.rx_age_mult(p) + 1
    when 'shooting_star' then 2.3
    when 'doppelganger' then private.mirror_mult(p) + 1
    when 'compass_rose' then 2.2
    else 1 end
$function$;
create or replace function private.day_rarities() returns text[] language sql immutable as $$
  select array['chaos', 'phoenix', 'dragon', 'kraken', 'gemini', 'mirror', 'eclipse', 'eternal_flame', 'constellation', 'kaleidoscope', 'krakatoa',
               'elder_tree', 'shooting_star', 'doppelganger', 'compass_rose']
$$;

-- ---- what a plot's power does to the rest of the game ----------------------------------------------------------------------
-- minigames: a Hive's pollen, a World Tree's roots, a Throne's decree
create or replace function private.rx_game_mult(p_uid uuid, p_gx int, p_gy int) returns numeric language plpgsql stable as $$
declare m numeric := 1;
begin
  if exists (select 1 from public.enchant_buffs b where b.player_id = p_uid and b.kind = 'pollinated' and b.gx = p_gx and b.gy = p_gy and b.expires_at > now()) then
    m := m * private.rx_n('hive', 'mult', 1.1);
  end if;
  if exists (select 1 from public.rarity_powers x where x.owner_id = p_uid and x.rarity in ('world_tree', 'elder_tree')
              and ((x.gx = p_gx and x.gy = p_gy) or coalesce(x.state -> 'roots', '[]'::jsonb) @> jsonb_build_array(jsonb_build_array(p_gx, p_gy)))) then
    m := m * private.rx_n('world_tree', 'mult', 1.1);
  end if;
  if private.rx_rule_at(p_gx, p_gy, 'minigames') then m := m * private.rx_n('throne_ink', 'minigames', 1.15); end if;
  return m;
end $$;

-- frozen land: within a Glacier's reach, or under a Throne's peace
create or replace function private.rx_frozen_at(p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.rarity_powers x, (select private.rx_n('glacier', 'cells', 8)::int r) k
                  where x.rarity = 'glacier' and x.gx between p_gx - k.r and p_gx + k.r and x.gy between p_gy - k.r and p_gy + k.r)
      or private.rx_rule_at(p_gx, p_gy, 'peace')
$$;
create or replace function private.cru_anchored(p_gx int, p_gy int) returns boolean language sql stable as $function$
  select exists (select 1 from public.crucible_artifacts a where a.gx = p_gx and a.gy = p_gy and a.kind = 'anchor')
      or exists (select 1 from public.enchant_buffs b where b.kind = 'ward' and b.gx = p_gx and b.gy = p_gy and b.expires_at > now())
      or private.ench_tempered_at(p_gx, p_gy)
      or private.rx_frozen_at(p_gx, p_gy)
$function$;
create or replace function private.lev_safe(p_uid uuid, p_gx integer, p_gy integer) returns boolean language sql stable as $function$
  select exists (select 1 from public.enchant_buffs b where b.player_id = p_uid and b.kind = 'paper_shield' and b.expires_at > now())
      or private.cru_anchored(p_gx, p_gy)
      or exists (select 1 from public.rarity_powers x where x.owner_id = p_uid and x.rarity = 'serpent_egg')
$function$;

-- 👁️ a World's Eye sees every Phantom within its reach
create or replace function private.rx_eye_sees(p_uid uuid, p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.rarity_powers x where x.owner_id = p_uid and x.rarity = 'world_eye'
                  and private.rx_m(x.gx, x.gy, p_gx, p_gy) <= private.rx_area_m())
$$;
-- 👻 what the rest of the world sees on a plot: a Phantom is a Common to everyone but its owner (and a World's Eye);
-- a Doppelgänger shows whatever its owner chose
create or replace function private.rx_seen(p_rarity text, p_owner uuid, p_gx int, p_gy int) returns text language plpgsql stable as $$
declare v_viewer uuid;
begin
  if p_rarity is null or p_rarity not in ('phantom', 'doppelganger') then return p_rarity; end if;
  v_viewer := auth.uid();
  if v_viewer is not null and (v_viewer = p_owner or private.rx_eye_sees(v_viewer, p_gx, p_gy)) then return p_rarity; end if;
  if p_rarity = 'doppelganger' then
    return coalesce((select x.state ->> 'disguise' from public.rarity_powers x where x.gx = p_gx and x.gy = p_gy), 'common');
  end if;
  return 'common';
end $$;

-- ---- the powers' rows ----------------------------------------------------------------------------------------------------
create or replace function private.rx_init(p_rarity text) returns jsonb language sql volatile as $$
  select case p_rarity
    when 'chrysalis' then jsonb_build_object('hatch_at', now() + make_interval(days => private.rx_n('chrysalis', 'days', 30)::int))
    when 'lodestone' then jsonb_build_object('lode_at', extract(epoch from now()))
    when 'compass_rose' then jsonb_build_object('lode_at', extract(epoch from now()))
    else '{}'::jsonb end
$$;
-- when a fresh power does its first deed
create or replace function private.rx_first_wait(p_rarity text) returns interval language sql volatile as $$
  select case private.rx_family(p_rarity)
    when 'volcano' then interval '5 minutes' + random() * interval '30 minutes'
    when 'wanderer' then interval '6 hours'
    when 'chrysalis' then make_interval(days => private.rx_n('chrysalis', 'days', 30)::int)
    when 'world_tree' then interval '1 minute'
    when 'phantom' then interval '1 minute'
    when 'leyline' then interval '1 minute'
    when 'compass' then interval '1 minute'
    when 'mycelium' then interval '1 minute'
    when 'hive' then interval '1 minute'
    else null end
$$;
-- what a power did (its page lists the last dozen)
create or replace function private.rx_log(p_gx int, p_gy int, p_kind text, p_data jsonb) returns void language sql as $$
  update public.rarity_powers
     set state = jsonb_set(state, '{log}', coalesce((select jsonb_agg(v) from (
           select v from jsonb_array_elements(jsonb_build_array(p_data || jsonb_build_object('k', p_kind, 'at', now())) || coalesce(state -> 'log', '[]'::jsonb))
             with ordinality t(v, o) where o <= 12 order by o) s), '[]'::jsonb)),
         updated_at = now()
   where gx = p_gx and gy = p_gy
$$;

-- the row that goes with a plot: made when the plot first has its power, started afresh when the plot changes hands or rarity
create or replace function private.rx_sync(p_gx int, p_gy int) returns public.rarity_powers language plpgsql as $$
declare p public.world_plots; x public.rarity_powers;
begin
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  select * into x from public.rarity_powers where gx = p_gx and gy = p_gy for update;
  if p.owner_id is null or not (p.rarity = any (private.rx_power_ids())) then
    if x.gx is not null then
      delete from public.rarity_powers where gx = p_gx and gy = p_gy;
      delete from public.rarity_spots where src_gx = p_gx and src_gy = p_gy and kind in ('obsidian', 'trail', 'mushroom', 'glint');
    end if;
    return null;
  end if;
  if x.gx is null or x.owner_id <> p.owner_id or x.rarity <> p.rarity then
    if x.gx is not null then
      delete from public.rarity_powers where gx = p_gx and gy = p_gy;
      delete from public.rarity_spots where src_gx = p_gx and src_gy = p_gy and kind in ('obsidian', 'trail', 'mushroom', 'glint') and owner_id is distinct from p.owner_id;
    end if;
    insert into public.rarity_powers (gx, gy, owner_id, rarity, state, since, next_at, tick_at)
    values (p_gx, p_gy, p.owner_id, p.rarity, private.rx_init(p.rarity), now(), now() + private.rx_first_wait(p.rarity), now())
    returning * into x;
  end if;
  return x;
end $$;

create or replace function private.rx_has(p_uid uuid, p_rarity text) returns boolean language sql stable as $$
  select exists (select 1 from public.world_plots where rarity = p_rarity and owner_id = p_uid)
$$;
create or replace function private.rx_note(p_uid uuid, p_kind text, p_actor uuid, p_data jsonb) returns void language plpgsql as $$
begin
  perform private.notify(p_uid, 'power', p_actor, p_data || jsonb_build_object('sub', replace(p_kind, 'rx_', '')));
exception when others then null;
end $$;
-- a little Luck, straight in (capped like every Luck)
create or replace function private.rx_luck(p_uid uuid, p_pts int) returns void language sql as $$
  insert into public.player_luck (player_id) values (p_uid) on conflict (player_id) do nothing;
  update public.player_luck set luck = least(luck + p_pts, coalesce((private.cfg('luck') ->> 'max')::int, 100)), updated_at = now() where player_id = p_uid;
$$;
create or replace function private.rx_golden(p_uid uuid, p_data jsonb) returns void language sql as $$
  insert into public.enchant_buffs (player_id, kind, mult, uses, data, expires_at)
  values (p_uid, 'golden_hour', private.rx_n('heart_world', 'mult', 2), private.rx_n('heart_world', 'uses', 3)::int, p_data, now() + interval '24 hours');
$$;
create or replace function private.rx_ink(p_uid uuid, p_n int, p_ref text, p_idem text) returns int language sql as $$
  select case when p_n > 0 then private.grant_ink_paced(p_uid, p_n, 'enchantment', 'rarity_power', p_ref, p_idem) else 0 end
$$;

-- a plot of yours back to the world (like a melt: its own roll, its canvas dissolved)
create or replace function private.rx_release(p public.world_plots, p_reason text) returns void language plpgsql as $$
declare g public.canvas_groups;
begin
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy for update of gr;
  if g.id is not null then
    delete from public.canvas_group_members where group_id = g.id;
    update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = g.id;
    if g.project_id is not null then update public.artwork_projects set status = 'archived', updated_at = now() where id = g.project_id; end if;
  end if;
  update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null,
         rarity = private.plot_rarity_for(p.gx, p.gy), plot_type = private.plot_type_for(p.gx, p.gy), updated_at = now()
   where gx = p.gx and gy = p.gy;
  update public.plot_ownership set released_at = now(), release_reason = p_reason where gx = p.gx and gy = p.gy and released_at is null;
  insert into public.plot_art_history (gx, gy, publication_id, rev) values (p.gx, p.gy, null, null);
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
  perform private.enqueue_job('clear_cells', jsonb_build_object('cells', jsonb_build_array(jsonb_build_array(p.gx, p.gy))));
end $$;
-- why a plot can't go into a fusion or a transmutation
create or replace function private.rx_why_not(p_uid uuid, p public.world_plots) returns text language plpgsql stable as $$
declare g public.canvas_groups; v_m text;
begin
  if p.gx is null or p.owner_id is distinct from p_uid then return 'not_your_plot'; end if;
  if p.locked then return 'plot_locked'; end if;
  if p.folded_at is not null then return 'plot_folded'; end if;
  if p.rarity = 'enchanted' then return 'enchanted'; end if;
  select method into v_m from public.plot_ownership where gx = p.gx and gy = p.gy and released_at is null order by id desc limit 1;
  if v_m = 'starter' then return 'starter_plot'; end if;
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy;
  if g.id is not null and (g.plot_count <> 1 or g.status <> 'active') then return 'merged'; end if;
  return null;
end $$;
-- a plot of yours changes rarity in place (Midas, the Transmuter, the Doubling Cube, a fusion, a hatching)
create or replace function private.rx_set_rarity(p_uid uuid, p_gx int, p_gy int, p_rarity text, p_how text) returns void language plpgsql as $$
begin
  perform private.rent_settle(p_uid);
  perform set_config('landvas.rx_how', p_how, true);
  update public.world_plots set rarity = p_rarity, updated_at = now() where gx = p_gx and gy = p_gy and owner_id = p_uid;
  perform set_config('landvas.rx_how', '', true);
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
end $$;

-- ---- the daily deeds ---------------------------------------------------------------------------------------------------------
-- 🌋 an eruption: obsidian on the empty land around it, for its owner only
create or replace function private.rx_erupt(x public.rarity_powers) returns jsonb language plpgsql as $$
declare k numeric := case when x.rarity = 'krakatoa' then 2 else 1 end; i int; c int[]; v jsonb := '[]'::jsonb;
  n int := (private.rx_n('volcano', 'spots', 4) * case when x.rarity = 'krakatoa' then 1.5 else 1 end)::int;
begin
  for i in 1 .. n loop
    c := private.ench_free_cell(x.gx, x.gy, private.rx_n('volcano', 'min', 3)::int, (private.rx_n('volcano', 'max', 14) * k)::int);
    continue when exists (select 1 from public.world_plots w where w.gx = c[1] and w.gy = c[2] and (w.owner_id is not null or w.locked));
    continue when exists (select 1 from public.rarity_spots s where s.gx = c[1] and s.gy = c[2] and s.owner_id = x.owner_id and s.kind = 'obsidian');
    insert into public.rarity_spots (kind, gx, gy, owner_id, src_gx, src_gy, bump, expires_at)
    values ('obsidian', c[1], c[2], x.owner_id, x.gx, x.gy, 1, now() + make_interval(mins => private.rx_n('volcano', 'minutes', 60)::int));
    v := v || jsonb_build_array(jsonb_build_array(c[1], c[2]));
  end loop;
  update public.rarity_powers set state = state || jsonb_build_object('erupted_at', now(), 'lava', v, 'eruptions', coalesce((state ->> 'eruptions')::int, 0) + 1) where gx = x.gx and gy = x.gy;
  perform private.rx_log(x.gx, x.gy, 'erupted', jsonb_build_object('n', jsonb_array_length(v)));
  perform private.rx_note(x.owner_id, 'rx_erupted', null, jsonb_build_object('gx', x.gx, 'gy', x.gy, 'n', jsonb_array_length(v), 'rarity', x.rarity));
  return v;
end $$;

-- 🌳 a new root, to the nearest plot of yours it doesn't reach yet
create or replace function private.rx_grow(x public.rarity_powers) returns jsonb language plpgsql as $$
declare k int := case when x.rarity = 'elder_tree' then 2 else 1 end; v_roots jsonb; v_max int; r int; t record;
begin
  -- roots to plots that are no longer yours wither
  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_roots from jsonb_array_elements(coalesce(x.state -> 'roots', '[]'::jsonb)) c
   where exists (select 1 from public.world_plots w where w.gx = (c ->> 0)::int and w.gy = (c ->> 1)::int and w.owner_id = x.owner_id);
  v_max := private.rx_n('world_tree', 'max', 6)::int * k;
  r := private.rx_cells(private.rx_n('world_tree', 'km', 2) * 1000 * k, x.gy);
  if jsonb_array_length(v_roots) < v_max then
    select w.gx, w.gy into t from public.world_plots w
     where w.owner_id = x.owner_id and (w.gx, w.gy) <> (x.gx, x.gy) and w.gx between x.gx - r and x.gx + r and w.gy between x.gy - r and x.gy + r
       and not (v_roots @> jsonb_build_array(jsonb_build_array(w.gx, w.gy)))
     order by (w.gx - x.gx)::numeric ^ 2 + (w.gy - x.gy)::numeric ^ 2 limit 1;
    if t.gx is not null then
      v_roots := v_roots || jsonb_build_array(jsonb_build_array(t.gx, t.gy));
      perform private.rx_log(x.gx, x.gy, 'rooted', jsonb_build_object('gx', t.gx, 'gy', t.gy, 'n', jsonb_array_length(v_roots)));
      perform private.rx_note(x.owner_id, 'rx_rooted', null, jsonb_build_object('gx', x.gx, 'gy', x.gy, 'to', jsonb_build_array(t.gx, t.gy), 'n', jsonb_array_length(v_roots), 'rarity', x.rarity));
    end if;
  end if;
  update public.rarity_powers set state = state || jsonb_build_object('roots', v_roots) where gx = x.gx and gy = x.gy;
  return v_roots;
end $$;

-- 👻 a whisper: a private reading of one empty spot nearby (claim it within a day and that's exactly what you get)
create or replace function private.rx_whisper(x public.rarity_powers) returns jsonb language plpgsql as $$
declare c int[]; s jsonb; i int;
begin
  for i in 1 .. 6 loop
    c := private.ench_free_cell(x.gx, x.gy, private.rx_n('phantom', 'min', 4)::int, private.rx_n('phantom', 'max', 60)::int);
    continue when exists (select 1 from public.world_plots w where w.gx = c[1] and w.gy = c[2] and (w.owner_id is not null or w.locked or w.rarity like 'crown%' or w.rarity = 'enchanted'));
    s := private.spy_roll(c[1], c[2]);
    exit when s ->> 'rarity' <> 'enchanted' and s ->> 'rarity' not like 'crown%';
    s := null;
  end loop;
  if s is null then return null; end if;
  insert into private.spy_sightings (player_id, enchant_id, gx, gy, rarity, kind, hot, expires_at)
  values (x.owner_id, null, c[1], c[2], s ->> 'rarity', null, private.in_hot_zone(c[1], c[2]), now() + interval '24 hours');
  perform private.fairplay(x.owner_id, 'rx_whisper', c[1], c[2], jsonb_build_object('rarity', s ->> 'rarity', 'from', jsonb_build_array(x.gx, x.gy)));
  update public.rarity_powers set state = state || jsonb_build_object('whisper', jsonb_build_object('gx', c[1], 'gy', c[2], 'rarity', s ->> 'rarity', 'at', now())) where gx = x.gx and gy = x.gy;
  perform private.rx_log(x.gx, x.gy, 'whispered', jsonb_build_object('gx', c[1], 'gy', c[2], 'rarity', s ->> 'rarity'));
  perform private.rx_note(x.owner_id, 'rx_whisper', null, jsonb_build_object('gx', c[1], 'gy', c[2], 'rarity', s ->> 'rarity', 'from', jsonb_build_array(x.gx, x.gy)));
  return s;
end $$;

-- 🦄 a gallop: the plot moves to a free spot nearby (drawing and all) and leaves a rainbow trail for its owner
create or replace function private.rx_gallop(x public.rarity_powers) returns jsonb language plpgsql as $$
declare p public.world_plots; c int[]; e public.enchantments; v jsonb; i int; n int; ox int := x.gx; oy int := x.gy; k int := case when x.rarity = 'shooting_star' then 10 else 1 end;
  tx int; ty int; v_trail jsonb := '[]'::jsonb;
begin
  select * into p from public.world_plots where gx = x.gx and gy = x.gy for update;
  if p.owner_id is distinct from x.owner_id or p.locked or p.folded_at is not null
     or exists (select 1 from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id
                 where m.gx = p.gx and m.gy = p.gy and (gr.plot_count > 1 or gr.status <> 'active')) then
    update public.rarity_powers set next_at = now() + interval '24 hours', state = state || jsonb_build_object('tethered', true) where gx = x.gx and gy = x.gy;
    return null;
  end if;
  c := private.ench_free_cell(x.gx, x.gy, private.rx_n('wanderer', 'min', 4)::int * k, private.rx_n('wanderer', 'max', 15)::int * k);
  if exists (select 1 from public.world_plots w where w.gx = c[1] and w.gy = c[2] and (w.owner_id is not null or w.locked or w.rarity like 'crown%' or w.rarity = 'enchanted')) then
    update public.rarity_powers set next_at = now() + interval '2 hours' where gx = x.gx and gy = x.gy;
    return null;
  end if;
  e.owner_id := x.owner_id;
  perform set_config('landvas.rx_quiet', '1', true);
  perform set_config('landvas.move_why', 'galloped away (Wanderer)', true);
  perform set_config('landvas.move_method', 'wander', true);
  v := private.ori_move(e, p, c[1], c[2]);
  perform set_config('landvas.rx_quiet', '', true);
  perform set_config('landvas.move_why', '', true);
  perform set_config('landvas.move_method', '', true);
  delete from public.enchant_buffs where kind = 'crease' and gx = c[1] and gy = c[2] and enchant_id is null;
  -- its power comes along
  delete from public.rarity_powers where gx = c[1] and gy = c[2];
  update public.rarity_powers set gx = c[1], gy = c[2], updated_at = now() where gx = ox and gy = oy;
  -- the rainbow trail, between where it was and where it is
  n := private.rx_n('wanderer', 'trail', 5)::int * case when k > 1 then 2 else 1 end;
  for i in 1 .. n loop
    tx := ox + round((c[1] - ox) * i::numeric / (n + 1))::int; ty := oy + round((c[2] - oy) * i::numeric / (n + 1))::int;
    continue when exists (select 1 from public.world_plots w where w.gx = tx and w.gy = ty and (w.owner_id is not null or w.locked));
    insert into public.rarity_spots (kind, gx, gy, owner_id, src_gx, src_gy, bump, expires_at)
    values ('trail', tx, ty, x.owner_id, c[1], c[2], 1, now() + make_interval(mins => private.rx_n('wanderer', 'minutes', 60)::int));
    v_trail := v_trail || jsonb_build_array(jsonb_build_array(tx, ty));
  end loop;
  update public.rarity_powers set next_at = now() + interval '22 hours' + random() * interval '4 hours',
         state = (state - 'tethered') || jsonb_build_object('from', jsonb_build_array(ox, oy), 'galloped_at', now(), 'trail', v_trail, 'gallops', coalesce((state ->> 'gallops')::int, 0) + 1)
   where gx = c[1] and gy = c[2];
  perform private.rx_log(c[1], c[2], 'galloped', jsonb_build_object('from', jsonb_build_array(ox, oy), 'to', jsonb_build_array(c[1], c[2]), 'km', v -> 'km'));
  perform private.rx_note(x.owner_id, 'rx_galloped', null, jsonb_build_object('from', jsonb_build_array(ox, oy), 'gx', c[1], 'gy', c[2], 'rarity', x.rarity));
  return v;
end $$;

-- ⚡ the beams: to the farthest plot of yours (a Compass Rose: to up to 8)
create or replace function private.rx_aim(x public.rarity_powers) returns jsonb language plpgsql as $$
declare r int := private.rx_cells(private.rx_n('leyline', 'km', 500) * 1000, x.gy); v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_array(t.gx, t.gy)), '[]'::jsonb) into v from (
    select w.gx, w.gy from public.world_plots w
     where w.owner_id = x.owner_id and (w.gx, w.gy) <> (x.gx, x.gy) and w.gx between x.gx - r and x.gx + r and w.gy between x.gy - r and x.gy + r
     order by (w.gx - x.gx)::numeric ^ 2 + (w.gy - x.gy)::numeric ^ 2 desc
     limit case when x.rarity = 'compass_rose' then 8 else 1 end) t;
  update public.rarity_powers set state = state || jsonb_build_object('beams', v, 'aimed_at', now()) where gx = x.gx and gy = x.gy;
  if jsonb_array_length(v) > 0 then perform private.rx_log(x.gx, x.gy, 'beamed', jsonb_build_object('n', jsonb_array_length(v))); end if;
  return v;
end $$;
-- is a spot under one of your beams?
create or replace function private.rx_on_beam(p_uid uuid, p_gx int, p_gy int) returns boolean language plpgsql stable as $$
declare x record; b jsonb; ax numeric; ay numeric; bx numeric; by_ numeric; t numeric; d numeric; w numeric := private.rx_n('leyline', 'cells', 1);
begin
  for x in select gx, gy, state from public.rarity_powers where owner_id = p_uid and rarity in ('leyline', 'compass_rose') loop
    for b in select v from jsonb_array_elements(coalesce(x.state -> 'beams', '[]'::jsonb)) v loop
      ax := x.gx; ay := x.gy; bx := (b ->> 0)::numeric; by_ := (b ->> 1)::numeric;
      if (bx - ax) ^ 2 + (by_ - ay) ^ 2 = 0 then continue; end if;
      t := greatest(0, least(1, ((p_gx - ax) * (bx - ax) + (p_gy - ay) * (by_ - ay)) / ((bx - ax) ^ 2 + (by_ - ay) ^ 2)));
      d := sqrt((p_gx - (ax + t * (bx - ax))) ^ 2 + (p_gy - (ay + t * (by_ - ay))) ^ 2);
      if d <= w then return true; end if;
    end loop;
  end loop;
  return false;
end $$;

-- 🍄 one more mushroom (and the rest keep growing while it's yours)
create or replace function private.rx_spread(x public.rarity_powers) returns int language plpgsql as $$
declare n int; c record; v_days int := private.rx_n('mycelium', 'days', 7)::int; i int; tx int; ty int; a record;
begin
  update public.rarity_spots set expires_at = now() + make_interval(days => v_days)
   where kind = 'mushroom' and src_gx = x.gx and src_gy = x.gy and owner_id = x.owner_id;
  select count(*) into n from public.rarity_spots where kind = 'mushroom' and src_gx = x.gx and src_gy = x.gy and owner_id = x.owner_id;
  if n >= private.rx_n('mycelium', 'max', 12) then return n; end if;
  for i in 1 .. 12 loop
    -- from the Mycelium itself or a mushroom it already has, one step out
    select gx, gy into a from (select x.gx gx, x.gy gy union all select s.gx, s.gy from public.rarity_spots s where s.kind = 'mushroom' and s.src_gx = x.gx and s.src_gy = x.gy and s.owner_id = x.owner_id) q
     order by random() limit 1;
    tx := (a.gx + (floor(random() * 5) - 2)::int + 4194304) % 4194304; ty := least(greatest(a.gy + (floor(random() * 5) - 2)::int, 0), 4194303);
    continue when (tx, ty) = (x.gx, x.gy);
    continue when exists (select 1 from public.world_plots w where w.gx = tx and w.gy = ty and (w.owner_id is not null or w.locked));
    continue when exists (select 1 from public.rarity_spots s where s.gx = tx and s.gy = ty and s.kind = 'mushroom' and s.owner_id = x.owner_id);
    insert into public.rarity_spots (kind, gx, gy, owner_id, src_gx, src_gy, bump, expires_at)
    values ('mushroom', tx, ty, x.owner_id, x.gx, x.gy, 1, now() + make_interval(days => v_days));
    perform private.rx_log(x.gx, x.gy, 'sprouted', jsonb_build_object('gx', tx, 'gy', ty, 'n', n + 1));
    return n + 1;
  end loop;
  return n;
end $$;

-- 🐝 the bees go out: neighbours' plots pollinated (their minigames pay more for a day), honey for the owner
create or replace function private.rx_pollinate(x public.rarity_powers) returns int language plpgsql as $$
declare r int := private.rx_n('hive', 'cells', 30)::int; t record; n int := 0; v jsonb := '[]'::jsonb; v_paid int;
begin
  for t in select w.gx, w.gy, w.owner_id from public.world_plots w join public.players pl on pl.id = w.owner_id
            where w.owner_id is not null and w.owner_id <> x.owner_id and pl.status = 'active'
              and w.gx between x.gx - r and x.gx + r and w.gy between x.gy - r and x.gy + r
              and not exists (select 1 from public.enchant_buffs b where b.kind = 'pollinated' and b.gx = w.gx and b.gy = w.gy and b.expires_at > now())
            order by random() limit private.rx_n('hive', 'n', 5)::int loop
    insert into public.enchant_buffs (player_id, kind, gx, gy, mult, data, expires_at)
    values (t.owner_id, 'pollinated', t.gx, t.gy, private.rx_n('hive', 'mult', 1.1), jsonb_build_object('from', x.owner_id, 'hive', jsonb_build_array(x.gx, x.gy)), now() + interval '24 hours');
    perform private.rx_note(t.owner_id, 'rx_pollinated', x.owner_id, jsonb_build_object('gx', t.gx, 'gy', t.gy, 'hive', jsonb_build_array(x.gx, x.gy)));
    v := v || jsonb_build_array(jsonb_build_array(t.gx, t.gy));
    n := n + 1;
  end loop;
  v_paid := private.rx_ink(x.owner_id, n * private.rx_n('hive', 'honey', 5)::int, x.gx || '_' || x.gy, 'hive:' || x.gx || ':' || x.gy || ':' || private.today());
  update public.rarity_powers set state = state || jsonb_build_object('bees', v, 'bees_at', now(), 'flowers', coalesce((state ->> 'flowers')::int, 0) + n,
         'honey', coalesce((state ->> 'honey')::int, 0) + coalesce(v_paid, 0)) where gx = x.gx and gy = x.gy;
  perform private.rx_log(x.gx, x.gy, 'pollinated', jsonb_build_object('n', n, 'ink', coalesce(v_paid, 0)));
  return n;
end $$;

-- 🦋 a Chrysalis hatches into a random Primordial
create or replace function private.rx_hatch(x public.rarity_powers) returns text language plpgsql as $$
declare v text;
begin
  if coalesce((x.state ->> 'hatch_at')::timestamptz, now()) > now() then
    update public.rarity_powers set next_at = (x.state ->> 'hatch_at')::timestamptz where gx = x.gx and gy = x.gy;
    return null;
  end if;
  if not exists (select 1 from public.world_plots where gx = x.gx and gy = x.gy and owner_id = x.owner_id and rarity = 'chrysalis') then return null; end if;
  v := private.rx_pick_primordial('chrysalis');
  perform private.rx_set_rarity(x.owner_id, x.gx, x.gy, v, 'hatched');
  perform private.rx_note(x.owner_id, 'rx_hatched', null, jsonb_build_object('gx', x.gx, 'gy', x.gy, 'rarity', v));
  perform private.rx_sync(x.gx, x.gy);
  return v;
end $$;

-- ⏳ the Hourglass runs its holder's nearby enchantments on (at twice the speed of time)
create or replace function private.rx_hourglass(x public.rarity_powers) returns void language plpgsql as $$
declare s numeric := least(greatest(extract(epoch from now() - coalesce(x.tick_at, now())), 0), 900) * (private.rx_n('hourglass', 'x', 2) - 1);
  r int := private.rx_cells(private.rx_area_m(), x.gy);
begin
  if s > 0 then
    update public.enchantments e set clock_skip = coalesce(e.clock_skip, 0) + s
     where e.owner_id = x.owner_id and e.status = 'active' and e.gx between x.gx - r and x.gx + r and e.gy between x.gy - r and x.gy + r
       and private.rx_m(x.gx, x.gy, e.gx, e.gy) <= private.rx_area_m();
  end if;
  update public.rarity_powers set tick_at = now(), state = state || jsonb_build_object('gained_s', round(coalesce((state ->> 'gained_s')::numeric, 0) + s)) where gx = x.gx and gy = x.gy;
end $$;

create or replace function private.rx_daily(x public.rarity_powers) returns void language plpgsql as $$
declare f text := private.rx_family(x.rarity); v_next interval := interval '24 hours';
begin
  if f = 'volcano' then
    perform private.rx_erupt(x);
    v_next := case when x.rarity = 'krakatoa' then interval '11 hours' + random() * interval '2 hours' else interval '22 hours' + random() * interval '4 hours' end;
  elsif f = 'world_tree' then perform private.rx_grow(x);
  elsif f = 'phantom' then perform private.rx_whisper(x);
  elsif f = 'wanderer' then perform private.rx_gallop(x); return;
  elsif f in ('leyline', 'compass') then perform private.rx_aim(x);
  elsif f = 'mycelium' then perform private.rx_spread(x);
  elsif f = 'hive' then perform private.rx_pollinate(x);
  elsif f = 'chrysalis' then perform private.rx_hatch(x); return;
  else v_next := null;
  end if;
  update public.rarity_powers set next_at = case when v_next is null then null else now() + v_next end, updated_at = now() where gx = x.gx and gy = x.gy;
end $$;

-- the heartbeat (every two minutes, with the enchantments' own)
create or replace function private.rx_tick() returns void language plpgsql as $$
declare x public.rarity_powers; r record;
begin
  insert into public.rarity_powers (gx, gy, owner_id, rarity, state, since, next_at, tick_at)
  select p.gx, p.gy, p.owner_id, p.rarity, private.rx_init(p.rarity), now(), now() + private.rx_first_wait(p.rarity), now()
    from public.world_plots p
   where p.owner_id is not null and p.rarity = any (private.rx_power_ids())
     and not exists (select 1 from public.rarity_powers q where q.gx = p.gx and q.gy = p.gy)
   limit 500
  on conflict (gx, gy) do nothing;
  for r in select q.gx, q.gy from public.rarity_powers q left join public.world_plots p on p.gx = q.gx and p.gy = q.gy
            where p.owner_id is distinct from q.owner_id or p.rarity is distinct from q.rarity limit 300 loop
    perform private.rx_sync(r.gx, r.gy);
  end loop;
  for x in select * from public.rarity_powers where next_at <= now() order by next_at limit 120 for update skip locked loop
    begin
      perform private.rx_daily(x);
    exception when others then
      update public.rarity_powers set next_at = now() + interval '1 hour' where gx = x.gx and gy = x.gy;
    end;
  end loop;
  for x in select distinct on (owner_id) * from public.rarity_powers where rarity = 'hourglass' order by owner_id, since loop
    perform private.rx_hourglass(x);
  end loop;
  delete from public.rarity_spots where expires_at < now() - interval '5 minutes';
end $$;

-- ---- claims: what the powers do to a roll -------------------------------------------------------------------------------------
-- obsidian, a rainbow trail, a mushroom (used up), or a beam: a tier higher
create or replace function private.rx_claim_bump(p_uid uuid, p_gx int, p_gy int) returns int language plpgsql as $$
declare b int := 0; s record;
begin
  for s in delete from public.rarity_spots where gx = p_gx and gy = p_gy and kind in ('obsidian', 'trail', 'mushroom') and owner_id = p_uid and expires_at > now()
           returning bump, kind loop
    b := greatest(b, s.bump);
    perform private.fairplay(p_uid, 'rx_' || s.kind, p_gx, p_gy, '{}'::jsonb);
  end loop;
  if b = 0 and private.rx_on_beam(p_uid, p_gx, p_gy) then b := 1; end if;
  return b;
end $$;
create or replace function private.rx_in_sunspot(p_uid uuid, p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.rarity_powers x where x.owner_id = p_uid and x.rarity = 'sunspot' and jsonb_typeof(x.state -> 'zone') = 'object'
                  and private.rx_m((x.state -> 'zone' ->> 'gx')::int, (x.state -> 'zone' ->> 'gy')::int, p_gx, p_gy) <= private.rx_n('sunspot', 'm', 1000))
$$;
create or replace function private.rx_flip_on(p_uid uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.rarity_powers x where x.owner_id = p_uid and x.rarity = 'upside_down' and (x.state ->> 'flip_until')::timestamptz > now())
$$;
create or replace function private.rx_rift_ok(p_uid uuid, p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.rarity_powers x where x.owner_id = p_uid and x.rarity = 'rift' and (x.state -> 'rift' ->> 'until')::timestamptz > now()
                  and private.rx_m((x.state -> 'rift' ->> 'gx')::int, (x.state -> 'rift' ->> 'gy')::int, p_gx, p_gy) <= private.rx_n('rift', 'm', 150))
$$;
-- shinier: a Sunspot (×2), a Throne's decree (×3)
create or replace function private.rx_shiny_x(p_uid uuid, p_gx int, p_gy int) returns numeric language sql stable as $$
  select (case when p_uid is not null and private.rx_in_sunspot(p_uid, p_gx, p_gy) and not private.in_hot_zone(p_gx, p_gy) then coalesce((private.cfg('hot_zones') ->> 'shiny_mult')::numeric, 2) else 1 end)
       * (case when private.rx_rule_at(p_gx, p_gy, 'shiny') then private.rx_n('throne_ink', 'shiny', 3) else 1 end)
$$;
-- the special rolls a claim gets from your Primordials: Upside Down (the whole table flipped), a Sunspot (the Hot
-- Zone's roll) and the Loom (a second thread) — the better is kept
create or replace function private.rx_claim_roll(p_uid uuid, p_gx int, p_gy int, p_rarity text) returns text language plpgsql as $$
declare v text := p_rarity; v_alt text;
begin
  if p_rarity like 'crown%' or p_rarity = 'enchanted' then return p_rarity; end if;
  if private.rx_flip_on(p_uid) then
    v_alt := private.rx_roll(p_gx, p_gy, 'flip' || p_uid || to_char(now(), 'YYYYMMDDHH24'), private.rx_n('upside_down', 'ultra_x', 10), false, true);
    v := private.rx_best(v, v_alt);
    perform private.fairplay(p_uid, 'rx_flip_claim', p_gx, p_gy, jsonb_build_object('rolled', v_alt));
  end if;
  if private.rx_in_sunspot(p_uid, p_gx, p_gy) and not private.in_hot_zone(p_gx, p_gy) then
    v_alt := private.rx_roll(p_gx, p_gy, 'sun' || private.today()::text, coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5), true);
    v := private.rx_best(v, v_alt);
  end if;
  if private.rx_has(p_uid, 'loom') then
    v_alt := private.rx_roll(p_gx, p_gy, 'loom' || p_uid, 1, false);
    v := private.rx_best(v, v_alt);
  end if;
  return v;
end $$;

-- ⛓️ after a claim: the chain reaction (free spots beside it, up to 5 links)
create or replace function private.rx_chain(p_uid uuid, p_gx int, p_gy int) returns jsonb language plpgsql as $$
declare v jsonb := '[]'::jsonb; cx int := p_gx; cy int := p_gy; i int := 0; d int[]; nx int; ny int; ok boolean; r jsonb;
begin
  if not private.rx_has(p_uid, 'chain') or coalesce(current_setting('landvas.rx_chain', true), '') = '1' then return v; end if;
  perform set_config('landvas.rx_chain', '1', true);
  while i < private.rx_n('chain', 'max', 5) and random() * 100 < private.rx_n('chain', 'pct', 30) loop
    if (select count(*) from public.world_plots where owner_id = p_uid) >= coalesce((private.cfg('limits') ->> 'max_plots_per_player')::int, 2500) then exit; end if;
    ok := false;
    foreach d slice 1 in array (select array_agg(a order by random()) from (values (array[1, 0]), (array[-1, 0]), (array[0, 1]), (array[0, -1]), (array[1, 1]), (array[-1, -1]), (array[1, -1]), (array[-1, 1])) t(a)) loop
      nx := (cx + d[1] + 4194304) % 4194304; ny := cy + d[2];
      continue when ny < 0 or ny > 4194303;
      continue when exists (select 1 from public.world_plots w where w.gx = nx and w.gy = ny and (w.owner_id is not null or w.locked or w.rarity like 'crown%' or w.rarity = 'enchanted'));
      ok := true; exit;
    end loop;
    exit when not ok;
    begin
      r := private.take_plot(p_uid, nx, ny, 'chain', jsonb_build_object('chain', jsonb_build_array(p_gx, p_gy)));
    exception when others then exit;
    end;
    v := v || jsonb_build_array(jsonb_build_object('gx', nx, 'gy', ny, 'rarity', r ->> 'rarity', 'plot_type', r ->> 'plot_type'));
    cx := nx; cy := ny; i := i + 1;
  end loop;
  perform set_config('landvas.rx_chain', '', true);
  if jsonb_array_length(v) > 0 then
    update public.rarity_powers set state = state || jsonb_build_object('links', coalesce((state ->> 'links')::int, 0) + jsonb_array_length(v), 'last', v, 'last_at', now())
     where owner_id = p_uid and rarity = 'chain';
    perform private.fairplay(p_uid, 'rx_chain', p_gx, p_gy, jsonb_build_object('links', v));
  end if;
  return v;
end $$;

-- 🖐️ after a win: Midas turns the plot a tier higher, 1 time in 25
create or replace function private.rx_after_win(p_uid uuid, p_gx int, p_gy int) returns text language plpgsql as $$
declare p public.world_plots; v text;
begin
  if p_gx is null or not private.rx_has(p_uid, 'midas') then return null; end if;
  if random() >= 1 / greatest(private.rx_n('midas', 'one_in', 25), 1) then return null; end if;
  select * into p from public.world_plots where gx = p_gx and gy = p_gy and owner_id = p_uid for update;
  if p.gx is null or coalesce(array_position(private.rx_ladder(), p.rarity), 6) >= 6 then return null; end if;
  v := private.rx_up(p.rarity);
  perform private.rx_set_rarity(p_uid, p_gx, p_gy, v, 'midas');
  update public.rarity_powers set state = state || jsonb_build_object('golds', coalesce((state ->> 'golds')::int, 0) + 1, 'last', jsonb_build_object('gx', p_gx, 'gy', p_gy, 'from', p.rarity, 'to', v, 'at', now()))
   where owner_id = p_uid and rarity = 'midas';
  perform private.fairplay(p_uid, 'rx_midas', p_gx, p_gy, jsonb_build_object('from', p.rarity, 'to', v));
  perform private.rx_note(p_uid, 'rx_midas', null, jsonb_build_object('gx', p_gx, 'gy', p_gy, 'from', p.rarity, 'rarity', v));
  return v;
end $$;

-- 🧲 where your Seeking chests bury (beside your Lodestone, if you have one) and the Leviathan's extra loot
create or replace function private.rx_lode_cell(p_uid uuid) returns int[] language plpgsql as $$
declare x record;
begin
  select gx, gy into x from public.rarity_powers where owner_id = p_uid and rarity in ('lodestone', 'compass_rose') order by since limit 1;
  if x.gx is null then return null; end if;
  return private.ench_free_cell(x.gx, x.gy, 1, 3);
end $$;
create or replace function private.rx_loot_pct(p_uid uuid) returns numeric language sql stable as $$
  select (case when exists (select 1 from public.rarity_powers where owner_id = p_uid and rarity in ('lodestone', 'compass_rose')) then private.rx_n('lodestone', 'loot_pct', 25) else 0 end)
       + (case when exists (select 1 from public.rarity_powers where owner_id = p_uid and rarity = 'serpent_egg') then private.rx_n('serpent_egg', 'loot_pct', 50) else 0 end)
$$;
-- the Lodestone's gathered Ink (20 a day, up to 3 days' worth)
create or replace function private.rx_lode_ink(x public.rarity_powers) returns int language sql stable as $$
  select least(floor(greatest(extract(epoch from now()) - coalesce((x.state ->> 'lode_at')::numeric, extract(epoch from x.since)), 0) / 86400 * private.rx_n('lodestone', 'ink_day', 20)),
               private.rx_n('lodestone', 'ink_day', 20) * private.rx_n('lodestone', 'cap_days', 3))::int
$$;

-- 🌠 the 11:11 window in a time zone: its key ('2026-11-15am'), or null when it isn't 11:11 there
create or replace function private.rx_eleven_key(p_tz text, p_at timestamptz default null) returns text language sql stable as $$
  select case when to_char(t, 'HH24:MI') in ('11:11', '23:11') then to_char(t, 'YYYY-MM-DD') || case when extract(hour from t) = 11 then 'am' else 'pm' end end
  from (select (coalesce(p_at, private.rx_now())) at time zone p_tz as t) x
$$;
-- the next 11:11 there (as a moment in time)
create or replace function private.rx_eleven_next(p_tz text, p_after timestamptz default null) returns timestamptz language sql stable as $$
  select min(c) from (
    select ((d + time '11:11') at time zone p_tz) c from (select date_trunc('day', coalesce(p_after, private.rx_now()) at time zone p_tz) + i * interval '1 day' d from generate_series(0, 1) i) a
    union all
    select ((d + time '23:11') at time zone p_tz) from (select date_trunc('day', coalesce(p_after, private.rx_now()) at time zone p_tz) + i * interval '1 day' d from generate_series(0, 1) i) b) q
  where c + interval '1 minute' > coalesce(p_after, private.rx_now())
$$;

-- the moment a Primordial comes into the world: a shockwave on every map, a line on the feed
create or replace function private.rx_moment_trg() returns trigger language plpgsql as $$
declare v_how text; v_place text;
begin
  if new.owner_id is null or not private.rx_is_primordial(new.rarity) then return null; end if;
  if tg_op = 'UPDATE' and old.rarity is not distinct from new.rarity and old.owner_id is not null then return null; end if;
  if coalesce(current_setting('landvas.rx_quiet', true), '') = '1' then return null; end if;
  v_how := coalesce(nullif(current_setting('landvas.rx_how', true), ''), 'rolled');
  v_place := private.city_at(new.gx, new.gy) ->> 'name';
  insert into public.rarity_moments (kind, gx, gy, rarity, player_id, how, place) values ('primordial', new.gx, new.gy, new.rarity, new.owner_id, v_how, v_place);
  insert into public.feed_events (kind, player_id, data) values ('primordial', new.owner_id, jsonb_build_object('rarity', new.rarity, 'how', v_how, 'place', v_place));
  return null;
end $$;
drop trigger if exists world_plots_rx_moment on public.world_plots;
create trigger world_plots_rx_moment after insert or update of rarity, owner_id on public.world_plots
  for each row execute function private.rx_moment_trg();

-- the explorer and Inkborn set that comes with a rarity: the nine new ultras each have one, every Primordial shares one
create or replace function private.ultra_set_id(p_rarity text) returns text language sql immutable as $$
  select case p_rarity when 'crown' then 'xcity' when 'crown_state' then 'xstate' when 'crown_country' then 'xcountry'
    else case when p_rarity in ('solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'genesis', 'singularity',
                                'volcano', 'world_tree', 'phantom', 'wanderer', 'lodestone', 'leyline', 'glacier', 'mycelium', 'hive')
      then 'x' || p_rarity
      when private.rx_is_primordial(p_rarity) then 'xprimordial' end end
$$;
-- ---- the Ultra Expansion woven into what already exists -----------------------------------------------------------

CREATE OR REPLACE FUNCTION private.take_plot(p_uid uuid, p_gx integer, p_gy integer, p_method text, p_cost jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_type text; v_rarity text; v_group uuid; v_lucky text; v_grant private.granted_rolls; v_base text; v_lg text; v_granted boolean := false; v_gt text; v_ench text; v_ench_row public.enchantments; v_fate jsonb; v_sight jsonb; v_rx boolean := false; v_rx_r text; v_bump int; v_chain jsonb;
begin
  if p_gx is null or p_gy is null or p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  v_type := private.plot_type_for(p_gx, p_gy);
  v_rarity := private.plot_rarity_for(p_gx, p_gy);
  v_base := coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_rarity);
  perform set_config('landvas.luck_grant', '', true);
  -- an event roll for this claim, if one is due: it is the claim's own roll
  if p_method in ('acquire', 'starter', 'purchase') then
    v_grant := private.take_granted_roll(p_uid, p_gx, p_gy);
    if v_grant.id is not null then v_rarity := v_grant.rarity; v_base := v_grant.rarity; end if;
  end if;
  -- 🔭 a Spyglass sighting: the reading you saw is this claim's roll (never over a Crown or a sleeping enchantment)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_sight := private.spy_take(p_uid, p_gx, p_gy);
    if v_sight is not null then
      if v_sight ->> 'rarity' = 'enchanted' then v_ench := v_sight ->> 'kind'; v_rarity := 'enchanted'; v_base := 'enchanted';
      else v_rarity := v_sight ->> 'rarity'; v_base := v_rarity; end if;
    end if;
  end if;
  -- the Oracle's prophecy, if one is waiting
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%' and v_sight is null
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_fate := private.oracle_take(p_uid, 'roll');
    if v_fate is not null and v_fate ->> 'rarity' <> 'enchanted' then v_rarity := v_fate ->> 'rarity'; v_base := v_rarity; end if;
  end if;
  -- 2% of rolls are Enchanted (never an event roll, never a Crown, never a plot that already holds a sleeping one)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted')
     and (v_fate is null or v_fate ->> 'rarity' = 'enchanted') and v_sight is null then
    v_ench := case when v_fate is not null then v_fate ->> 'kind' else private.ench_roll(p_uid) end;
    if v_ench is not null then v_rarity := 'enchanted'; v_base := 'enchanted'; end if;
  end if;
  if p_method in ('acquire', 'starter') and v_base <> 'enchanted' then
    perform set_config('landvas.base_type', coalesce(v_grant.plot_type, (select plot_type from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_type), true);
    v_lucky := private.luck_roll(p_uid, p_gx, p_gy, v_base);
    if v_lucky is distinct from v_base then v_rarity := v_lucky; else v_lucky := null; end if;
  end if;
  -- 🌌 the Primordials and the new ultras: Upside Down, a Sunspot, the Loom; then obsidian, a rainbow trail, a mushroom or a beam
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_sight is null and v_fate is null
     and v_rarity <> 'enchanted' and v_rarity not like 'crown%' then
    v_rx_r := private.rx_claim_roll(p_uid, p_gx, p_gy, v_rarity);
    if v_rx_r is distinct from v_rarity then v_rarity := v_rx_r; v_rx := true; end if;
    v_bump := private.rx_claim_bump(p_uid, p_gx, p_gy);
    if v_bump > 0 and array_position(private.rx_ladder(), v_rarity) is not null and v_rarity <> 'mythic' then
      v_rarity := private.rx_up(v_rarity, v_bump); v_rx := true;
    end if;
  end if;
  v_lg := nullif(current_setting('landvas.luck_grant', true), '');
  v_granted := (v_grant.id is not null and v_rarity = v_grant.rarity) or (v_lg is not null and split_part(v_lg, ':', 1) = v_rarity);
  if v_granted then
    v_gt := case when v_grant.id is not null and v_rarity = v_grant.rarity then v_grant.plot_type else nullif(split_part(v_lg, ':', 3), '') end;
    if v_gt is not null then v_type := v_gt; end if;
  end if;
  -- event rolls are posted on the live feed like any other claim
  perform set_config('landvas.quiet_claim', '', true);
  if v_rarity = 'crown_country' then
    perform pg_advisory_xact_lock(hashtext('crown_country:' || coalesce(private.city_at(p_gx, p_gy) ->> 'country', '')));
    if private.city_at(p_gx, p_gy) is null or private.crown_country_held(private.city_at(p_gx, p_gy) ->> 'country') then v_rarity := 'mythic'; end if;
  elsif v_rarity = 'crown_state' then
    perform pg_advisory_xact_lock(hashtext('crown_state:' || coalesce(private.city_at(p_gx, p_gy) ->> 'country', '') || '/' || coalesce(private.city_at(p_gx, p_gy) ->> 'state', '')));
    if private.city_at(p_gx, p_gy) ->> 'state' is null or private.crown_state_held(private.city_at(p_gx, p_gy) ->> 'country', private.city_at(p_gx, p_gy) ->> 'state') then v_rarity := 'mythic'; end if;
  end if;
  if v_rarity = 'crown' then
    perform pg_advisory_xact_lock(hashtext('crown:' || coalesce(private.city_at(p_gx, p_gy) ->> 'id', '')));
    if private.city_at(p_gx, p_gy) is null or private.crown_held(private.city_at(p_gx, p_gy) ->> 'id') then v_rarity := 'mythic'; end if;
  end if;
  insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at)
  values (p_gx, p_gy, v_type, v_rarity, p_uid, now())
  on conflict (gx, gy) do nothing;
  if not found then
    update public.world_plots
       set owner_id = p_uid, claimed_at = now(), level = 1, plot_type = coalesce(v_gt, plot_type), rarity = case when v_granted or v_lucky is not null or v_grant.id is not null or v_ench is not null or v_fate is not null or v_sight is not null or v_rx then v_rarity else rarity end,
           art_publication_id = null, art_rev = null, updated_at = now()
     where gx = p_gx and gy = p_gy and owner_id is null and not locked
    returning plot_type, rarity into v_type, v_rarity;
    if not found then
      raise exception 'plot_unavailable' using errcode = 'P0001';
    end if;
  end if;
  if v_granted and ((v_grant.id is not null and v_grant.shiny and v_rarity = v_grant.rarity) or (v_lg like '%:t' and split_part(v_lg, ':', 1) = v_rarity)) then update public.world_plots set shiny = true where gx = p_gx and gy = p_gy; end if;
  if p_method in ('acquire', 'starter') then
    update public.world_plots p set plot_type = coalesce(l.types ->> l.best, p.plot_type), shiny = coalesce((l.shinies ->> l.best)::boolean, p.shiny)
      from public.luck_choices l
     where p.gx = p_gx and p.gy = p_gy and l.player_id = p_uid and l.gx = p_gx and l.gy = p_gy and l.picked is null and l.created_at = now() and l.types is not null
    returning p.plot_type into v_type;
    v_type := coalesce(v_type, (select plot_type from public.world_plots where gx = p_gx and gy = p_gy));
  end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)
  values (p_gx, p_gy, p_uid, p_method, coalesce(p_cost, '{}'::jsonb));
  perform private.spy_claimed(p_uid, p_gx, p_gy);
  -- 🌀 new land from a Genesis Well is used up by the claim
  delete from public.rarity_spots where kind = 'genesis' and gx = p_gx and gy = p_gy;
  -- ⛓️ Chain Reaction: free spots beside it
  if p_method in ('acquire', 'starter', 'purchase') then v_chain := private.rx_chain(p_uid, p_gx, p_gy); end if;
  if v_ench is not null then v_ench_row := private.ench_create(v_ench, p_uid, p_gx, p_gy); end if;
  if v_sight is not null then perform private.spy_paid(v_sight, p_uid); end if;
  -- ✍️ a rare plot can hide a glyph
  if (select sort from public.plot_rarities where id = v_rarity) >= (select sort from public.plot_rarities where id = 'rare') and v_rarity not like 'crown%' then
    perform private.glyph_drop(p_uid, 'plot', case when v_rarity = 'rare' then 0.08 else 0.15 end);
  end if;
  v_group := private.create_group_with_cells(p_uid, jsonb_build_array(jsonb_build_array(p_gx, p_gy)),
                                             private.empty_manifest(), null, 'initial');
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  return jsonb_build_object('lucky', v_lucky is not null, 'choices', (select options from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
    'choice_types', (select types from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
    'choice_shiny', (select shinies from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'), 'gx', p_gx, 'gy', p_gy, 'plot_type', v_type, 'rarity', v_rarity, 'group_id', v_group, 'foretold', v_fate is not null, 'sighted', v_sight is not null, 'enchant', private.ench_brief((select id from public.enchantments where gx = p_gx and gy = p_gy and status = 'active' and v_rarity = 'enchanted')),
                            'usd_per_second', (select private.plot_rate(p, r.usd_per_second) from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.gx = p_gx and p.gy = p_gy),
                            'shiny', (select shiny from public.world_plots where gx = p_gx and gy = p_gy), 'hot_zone', private.in_hot_zone(p_gx, p_gy),
                            'chained', v_chain, 'rarity_info', (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity),
                            'type_info', (select to_jsonb(t) from public.plot_types t where t.id = v_type));
end $function$;

CREATE OR REPLACE FUNCTION private.luck_roll(p_uid uuid, p_gx integer, p_gy integer, p_rarity text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare c jsonb := private.cfg('luck'); v_luck int; v_arm int; v_n int; v_used int; v_total int; v_opts jsonb := jsonb_build_array(p_rarity);
  v_types jsonb; v_shiny jsonb; v_best int; v_try text; r record; i int; v_x numeric; v_per int; g private.granted_rolls; v_idx int; v_bt text;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) or p_rarity like 'crown%' then return p_rarity; end if;
  select luck, armed into v_luck, v_arm from public.player_luck where player_id = p_uid for update;
  v_per := greatest(coalesce((c ->> 'points_per_roll')::int, 20), 1);
  v_n := least(floor(coalesce(v_luck, 0)::numeric / v_per)::int, coalesce((c ->> 'max_rolls')::int, 6) - 1, coalesce(v_arm, 0));
  if v_n < 1 then return p_rarity; end if;
  v_used := v_n * v_per;
  update public.player_luck set luck = luck - v_used, armed = 0, lucky_rolls = lucky_rolls + 1, updated_at = now() where player_id = p_uid;
  -- the plot's own roll: its own type (or an event roll's), and a shiny chance like any claim
  v_bt := coalesce(nullif(current_setting('landvas.base_type', true), ''), (select plot_type from public.world_plots where gx = p_gx and gy = p_gy), private.plot_type_for(p_gx, p_gy));
  v_types := jsonb_build_array(v_bt);
  v_shiny := jsonb_build_array(private.roll_shiny_at(p_gx, p_gy));
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  v_x := 1 + v_used::numeric / greatest(coalesce((c ->> 'points_per_ultra_x')::numeric, 10), 1);
  for i in 1 .. v_n loop
    v_try := private.rarity_pick(floor(random() * v_total)::int);
    for r in select id, ppm::numeric * 1000 as ppb from public.plot_rarities where ppm > 0 union all select id, ppb::numeric from public.plot_rarities where ppb > 0 order by 2 loop
      if random() * 1000000000 < r.ppb * v_x then v_try := r.id; exit; end if;
    end loop;
    v_opts := v_opts || jsonb_build_array(v_try);
    v_types := v_types || jsonb_build_array(private.roll_plot_type());
    v_shiny := v_shiny || jsonb_build_array(private.roll_shiny_at(p_gx, p_gy));
  end loop;
  -- an event roll waiting for this player's Luck claim
  select * into g from private.granted_rolls where player_id = p_uid and mode = 'luck' and used_at is null and cancelled_at is null
   and (rarity not like 'crown%' or private.crown_kingdom_free(rarity, p_gx, p_gy))
   order by id limit 1 for update skip locked;
  if g.id is not null then
    for i in 0 .. jsonb_array_length(v_opts) - 1 loop
      if g.slot is null or i = least(g.slot, jsonb_array_length(v_opts)) - 1 then
        v_opts := jsonb_set(v_opts, array[i::text], to_jsonb(g.rarity));
        if g.plot_type is not null then v_types := jsonb_set(v_types, array[i::text], to_jsonb(g.plot_type)); end if;
        if g.shiny then v_shiny := jsonb_set(v_shiny, array[i::text], 'true'::jsonb); end if;
      end if;
    end loop;
    update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
    perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'mode', 'luck', 'slot', g.slot));
    perform set_config('landvas.luck_grant', g.rarity || ':' || case when g.shiny then 't' else 'f' end || ':' || coalesce(g.plot_type, ''), true);
  end if;
  -- the best: rarest, then shiny, then the earliest
  select (o.ord - 1)::int into v_best from jsonb_array_elements_text(v_opts) with ordinality o(r, ord)
   order by private.plot_rarity_rank(o.r) desc, (v_shiny ->> (o.ord - 1)::int)::boolean desc, o.ord limit 1;
  insert into public.luck_choices (player_id, gx, gy, options, types, shinies, best) values (p_uid, p_gx, p_gy, v_opts, v_types, v_shiny, v_best)
  on conflict (player_id, gx, gy) do update set options = excluded.options, types = excluded.types, shinies = excluded.shinies, best = excluded.best, picked = null, created_at = now();
  return v_opts ->> v_best;
end $function$;

CREATE OR REPLACE FUNCTION private.spy_roll(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_hot boolean := private.in_hot_zone(p_gx, p_gy); c jsonb := private.ench_cfg();
  v_um numeric := case when v_hot then coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5) else 1 end;
  v_u numeric := random() * 1000000; v_acc numeric := 0; r record; v_total int; v_a text; v_b text;
begin
  -- a Crown, once in a great while (only while that cell's crown is free)
  if random() * 1000000 < private.ench_n('spyglass', 'crown_ppm', 40) * (case when v_hot then 3 else 1 end) then
    v_a := private.crown_free_at(p_gx, p_gy);
    if v_a is not null then return jsonb_build_object('rarity', v_a); end if;
  end if;
  if coalesce((c ->> 'enabled')::boolean, true) and random() * 100 < coalesce((c ->> 'base_pct')::numeric, 2) then
    return jsonb_build_object('rarity', 'enchanted', 'kind', private.ench_pick_kind());
  end if;
  for r in select id, ppb from public.plot_rarities where ppb > 0 order by ppb, sort loop
    if random() * 1000000000 < r.ppb * v_um then return jsonb_build_object('rarity', r.id); end if;
  end loop;
  for r in select id, ppm from public.plot_rarities where ppm > 0 and id not like 'crown%' order by ppm, sort loop
    v_acc := v_acc + r.ppm * v_um;
    if v_u < v_acc then return jsonb_build_object('rarity', r.id); end if;
  end loop;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return jsonb_build_object('rarity', 'common'); end if;
  v_a := private.rarity_pick(floor(random() * v_total)::int);
  if v_hot then
    v_b := private.rarity_pick(floor(random() * v_total)::int);
    if (select sort from public.plot_rarities where id = v_b) > (select sort from public.plot_rarities where id = v_a) then v_a := v_b; end if;
  end if;
  return jsonb_build_object('rarity', v_a);
end $function$;

CREATE OR REPLACE FUNCTION public.plot_blocks(p_blocks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 64 then
    raise exception 'too_many_blocks' using errcode = 'P0001';
  end if;
  with req as (
    select distinct (b ->> 0)::int as bx, (b ->> 1)::int as by
    from jsonb_array_elements(p_blocks) b
    where (b ->> 0)::int between 0 and 65535 and (b ->> 1)::int between 0 and 65535
  )
  select coalesce(jsonb_object_agg(r.bx || '_' || r.by, coalesce(rows, '[]'::jsonb)), '{}'::jsonb) into v_res
  from req r
  left join lateral (
    select jsonb_agg(jsonb_build_array(p.gx, p.gy, p.plot_type, p.level, p.owner_id = v_uid, m.group_id,
                                       p.art_rev is not null, pr.username, pr.accent_color, case when p.rarity in ('phantom', 'doppelganger') then private.rx_seen(p.rarity, p.owner_id, p.gx, p.gy) else p.rarity end, p.name, coalesce(g.kind, 'canvas'), p.shiny)) as rows
    from public.world_plots p
    left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
    left join public.canvas_groups g on g.id = m.group_id
    left join public.profiles pr on pr.id = p.owner_id
    where p.bx = r.bx and p.by = r.by and p.owner_id is not null
  ) x on true;
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.plots_in_bbox(p_min_gx integer, p_min_gy integer, p_max_gx integer, p_max_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if p_max_gx < p_min_gx or p_max_gy < p_min_gy or p_max_gx - p_min_gx > 1024 or p_max_gy - p_min_gy > 1024 then
    raise exception 'bbox_too_large' using errcode = 'P0001';
  end if;
  p_min_gy := greatest(p_min_gy, 0);
  p_max_gy := least(p_max_gy, 4194303);
  with ranges as (
    select greatest(p_min_gx, 0) as x0, least(p_max_gx, 4194303) as x1 where p_max_gx >= 0 and p_min_gx <= 4194303
    union all select p_min_gx + 4194304, 4194303 where p_min_gx < 0
    union all select 0, p_max_gx - 4194304 where p_max_gx > 4194303
  ), blocks as (
    select distinct by_, bx_
    from ranges r, generate_series(r.x0 >> 6, r.x1 >> 6) bx_, generate_series(p_min_gy >> 6, p_max_gy >> 6) by_
  )
  select coalesce(jsonb_agg(jsonb_build_array(p.gx, p.gy, p.plot_type, p.level, p.owner_id = v_uid, m.group_id,
                                               p.art_rev is not null, pr.username, pr.accent_color, case when p.rarity in ('phantom', 'doppelganger') then private.rx_seen(p.rarity, p.owner_id, p.gx, p.gy) else p.rarity end, p.name)), '[]'::jsonb)
    into v_res
  from blocks b
  join public.world_plots p on p.by = b.by_ and p.bx = b.bx_
  left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
  left join public.profiles pr on pr.id = p.owner_id
  where p.owner_id is not null
    and p.gy between p_min_gy and p_max_gy
    and exists (select 1 from ranges r where p.gx between r.x0 and r.x1);
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.plot_details(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_plot public.world_plots%rowtype;
  v_type text;
  v_rarity text;
  v_group uuid;
  v_res jsonb;
  v_is_mine boolean := false;
  v_starter boolean := false;
  v_owned boolean;
  v_ex record;
  v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 6);
  v_level int;
begin
  if p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  select * into v_plot from public.world_plots where gx = p_gx and gy = p_gy;
  v_owned := v_plot.owner_id is not null;
  v_type := case when v_owned then v_plot.plot_type end;
  v_rarity := case when v_owned then private.rx_seen(v_plot.rarity, v_plot.owner_id, p_gx, p_gy) end;
  v_level := coalesce(v_plot.level, 1);
  v_is_mine := v_uid is not null and v_plot.owner_id = v_uid;
  if v_uid is not null then
    select not starter_plot_claimed into v_starter from public.players where id = v_uid;
  end if;
  select group_id into v_group from public.canvas_group_members where gx = p_gx and gy = p_gy;

  v_res := jsonb_build_object(
    'gx', p_gx, 'gy', p_gy,
    'center', jsonb_build_object('lng', private.lng_of(p_gx + 0.5), 'lat', private.lat_of(p_gy + 0.5)),
    'name', case when v_owned then v_plot.name end,
    'plot_type', v_type,
    'type_info', case when v_owned then (select to_jsonb(t) from public.plot_types t where t.id = v_type) end,
    'rarity', v_rarity,
    'rarity_info', case when v_owned then (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity) end,
    'mystery', not v_owned,
    'rarity_hidden', not v_owned,
    'rent', case when v_owned then jsonb_build_object(
      'usd_per_second', private.plot_rent_rate(v_rarity, v_level),
      'boost_multiplier', coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20)) end,
    'owned', v_owned,
    'is_mine', v_is_mine,
    'owner', case when v_owned then private.profile_json(v_plot.owner_id) end,
    'level', v_level,
    'claimed_at', v_plot.claimed_at,
    'locked', coalesce(v_plot.locked, false),
    'art', (select jsonb_build_object('publication_id', a.id, 'title', a.title, 'published_at', a.published_at,
                                      'plot_count', a.plot_count, 'artist', private.profile_json(a.owner_id),
                                      'appreciation_count', a.appreciation_count)
            from public.artwork_publications a where a.id = v_plot.art_publication_id),
    'neighbors', (
      select jsonb_agg(jsonb_build_object(
        'gx', n.gx, 'gy', n.gy, 'dir', n.dir,
        'plot_type', case when w.owner_id is not null then w.plot_type end,
        'rarity', case when w.owner_id is not null then private.rx_seen(w.rarity, w.owner_id, w.gx, w.gy) end,
        'owned', w.owner_id is not null,
        'is_mine', v_uid is not null and w.owner_id = v_uid,
        'owner_username', (select username from public.profiles where id = w.owner_id),
        'group_id', m.group_id,
        'same_group', v_group is not null and m.group_id = v_group) order by n.dir)
      from private.neighbors(p_gx, p_gy) n
      left join public.world_plots w on w.gx = n.gx and w.gy = n.gy
      left join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy)
  );

  -- reach from the viewer's own explorer (never reveals anyone else's position)
  if v_uid is not null then
    select * into v_ex from private.explorer_now(v_uid);
    if found then
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', true, 'distance', private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy), 'max', v_reach,
        'in_reach', not private.flag('location_gated_claims') or private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy) <= v_reach));
    else
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', false, 'distance', null, 'max', v_reach, 'in_reach', not private.flag('location_gated_claims')));
    end if;
  end if;

  if v_is_mine then
    v_res := v_res || jsonb_build_object(
      'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'plot_count', g.plot_count, 'project_id', g.project_id,
                                          'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy)
                from public.canvas_groups g where g.id = v_group),
      'connections', (
        select coalesce(jsonb_agg(distinct jsonb_build_object('group_id', g.id, 'name', g.name, 'plot_count', g.plot_count)), '[]'::jsonb)
        from public.canvas_group_members me
        join private.neighbors(me.gx, me.gy) n on true
        join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy and m.group_id <> v_group
        join public.canvas_groups g on g.id = m.group_id and g.owner_id = v_uid and g.status = 'active'
        where me.group_id = v_group));
  elsif not v_owned then
    v_res := v_res || jsonb_build_object(
      'acquire', case when v_uid is not null and exists (select 1 from public.players where id = v_uid)
                      then private.acquire_cost(v_uid, p_gx, p_gy) || jsonb_build_object('starter_available', coalesce(v_starter, false))
                      else jsonb_build_object('starter_available', true) end,
      'available', not coalesce(v_plot.locked, false));
  end if;
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.player_land(p_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_p public.profiles%rowtype;
begin
  select * into v_p from public.profiles where lower(username) = lower(p_username);
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (v_uid is not null and v_p.id = v_uid) and not private.has_role(v_uid, array['moderator', 'support'])
     and not private.visible_to(v_p.id, v_uid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'player', private.profile_json(v_p.id),
    'total_plots', (select count(*) from public.world_plots where owner_id = v_p.id),
    'usd_per_second', (select coalesce(sum(private.plot_rent_rate(private.rx_seen(rarity, owner_id, gx, gy), level)), 0) from public.world_plots where owner_id = v_p.id),
    'rarity_counts', (select coalesce(jsonb_object_agg(rarity, n), '{}'::jsonb) from (
                        select private.rx_seen(rarity, owner_id, gx, gy) as rarity, count(*) as n from public.world_plots where owner_id = v_p.id group by 1) s),
    'type_counts', (select coalesce(jsonb_object_agg(plot_type, n), '{}'::jsonb) from (
                      select plot_type, count(*) as n from public.world_plots where owner_id = v_p.id group by plot_type) s),
    -- cells: [dx, dy, rarity, type, level, has_art, name]
    'canvases', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'plot_count', g.plot_count,
          'width', g.max_gx - g.min_gx + 1, 'height', g.max_gy - g.min_gy + 1,
          'cells', (select coalesce(jsonb_agg(jsonb_build_array(
                       (((m.gx - g.min_gx) % 4194304) + 4194304) % 4194304, m.gy - g.min_gy,
                       case when p.rarity in ('phantom', 'doppelganger') then private.rx_seen(p.rarity, p.owner_id, p.gx, p.gy) else p.rarity end, p.plot_type, p.level, p.art_rev is not null, p.name) order by m.gy, m.gx), '[]'::jsonb)
                    from public.canvas_group_members m join public.world_plots p on p.gx = m.gx and p.gy = m.gy
                    where m.group_id = g.id),
          'art', (select private.artwork_card(a, v_uid) from public.artwork_publications a
                  where a.group_id = g.id and a.status = 'published' order by a.published_at desc limit 1))
          order by g.plot_count desc, g.created_at), '[]'::jsonb)
        from (select * from public.canvas_groups where owner_id = v_p.id and status = 'active'
              order by plot_count desc, created_at limit 300) g));
end $function$;

CREATE OR REPLACE FUNCTION private.feed_claim_trg()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_rarity text; v_type text; v_shiny boolean; v_city int; k public.world_cities;
begin
  if new.method in ('starter', 'acquire', 'purchase') and coalesce(current_setting('landvas.quiet_claim', true), '') <> '1' then
    select rarity, plot_type, shiny, city_id into v_rarity, v_type, v_shiny, v_city from public.world_plots where gx = new.gx and gy = new.gy;
    insert into public.feed_events (kind, player_id, data)
    values ('claim', new.player_id, jsonb_build_object('rarity', case when v_rarity in ('phantom', 'doppelganger') then 'common' else v_rarity end, 'plot_type', v_type, 'starter', new.method = 'starter', 'shiny', coalesce(v_shiny, false)));
    if v_rarity like 'crown%' and v_city is not null then
      select * into k from public.world_cities where id = v_city;
      insert into public.feed_events (kind, player_id, data)
      values ('crown', new.player_id, jsonb_build_object('tier', v_rarity,
              'place', case v_rarity when 'crown' then k.name when 'crown_state' then k.state else k.country_name end, 'country', k.country));
    end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.my_ultras()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  d date := private.game_day(now());
  c jsonb := private.cfg('rarity_abilities');
  s public.daily_streaks;
  per numeric := coalesce((c -> 'phoenix' ->> 'per_day')::numeric, 0.1);
  maxd int := coalesce((c -> 'phoenix' ->> 'max_days')::int, 365);
  lit boolean;
  plots jsonb;
  h numeric := extract(epoch from (now() - date_trunc('day', now() at time zone 'UTC' ) at time zone 'UTC')) / 3600.0;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into s from public.daily_streaks where player_id = uid;
  -- the streak still counts until a whole day is missed
  lit := s.last_day is not null and s.last_day >= d - 1 and s.streak > 0;

  select coalesce(jsonb_agg(x order by x ->> 'sort', x ->> 'rarity', (x ->> 'mult')::numeric desc), '[]'::jsonb) into plots from (
    select jsonb_build_object(
      'gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'level', p.level, 'name', p.name,
      'sort', lpad(r.sort::text, 3, '0'),
      'ability', r.ability,
      'daily', p.rarity = any(private.day_rarities()),
      'mult', case when p.rarity = any(private.day_rarities()) then round(private.plot_day_mult(p, d), 2) end,
      'window', case when p.rarity in ('solar', 'lunar', 'comet') then w.win end
    ) x
    from public.world_plots p
    join public.plot_rarities r on r.id = p.rarity
    left join lateral (
      select jsonb_build_object('start', st, 'len', ln,
        'mult', case p.rarity when 'comet' then coalesce((c -> 'comet' ->> 'mult')::numeric, 30) else coalesce((c -> p.rarity ->> 'mult')::numeric, 3) end,
        'open', ((h - st + 48) % 24) < ln) win
      from (select round((case p.rarity
          when 'solar' then 6 - ((p.gx + 0.5) / 4194304.0 * 360 - 180) / 15
          when 'lunar' then 18 - ((p.gx + 0.5) / 4194304.0 * 360 - 180) / 15
          else (abs(private.cell_roll('comet', p.gx, p.gy)) % 96) / 4.0 end + 48)::numeric % 24 * 4) / 4 st,
        case p.rarity when 'comet' then coalesce((c -> 'comet' ->> 'hours')::numeric, 1) else 12 end ln) q
    ) w on true
    where p.owner_id = uid
      and (p.rarity in ('solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity')
           or exists (select 1 from public.plot_rarities rr where rr.id = p.rarity and rr.tier in ('ultra', 'fusion', 'primordial')))
  ) t;

  return jsonb_build_object(
    'day', d,
    'resets_at', private.day_start(now()) + interval '1 day',
    'streak', coalesce(s.streak, 0),
    'checked_in', coalesce(s.last_day >= d, false),
    'phoenix', jsonb_build_object(
      'per_day', per, 'max_days', maxd,
      'now', case when lit then round(1 + per * least(s.streak, maxd), 2) else 1 end,
      -- what checking in today makes it (the same if you already have)
      'next', case when coalesce(s.last_day >= d, false) then round(1 + per * least(s.streak, maxd), 2)
                   when lit then round(1 + per * least(s.streak + 1, maxd), 2)
                   else round(1 + per, 2) end),
    'chaos_values', coalesce(c -> 'chaos' -> 'values', '[1]'::jsonb),
    'plots', plots);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_ultra_scan(p_q text DEFAULT NULL::text, p_min integer DEFAULT 1, p_sort text DEFAULT 'boosted'::text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']); v_q text := lower(trim(coalesce(p_q, '')));
  v_bm numeric := coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20);
  v_free numeric := least(coalesce((private.cfg('rent') -> 'boost' ->> 'free_per_day')::numeric, 6) * coalesce((private.cfg('rent') -> 'boost' ->> 'minutes_per_boost')::numeric, 30) * 60, 86400);
begin
  if p_sort not in ('boosted', 'ultras', 'crowns', 'plots') then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  return (
    with u as (
      select w.owner_id, count(*) filter (where (coalesce(r.ppm, 0) > 0 or r.tier in ('fusion', 'primordial')))::int ultras, count(*) filter (where w.rarity like 'crown%')::int crowns,
             count(*) filter (where (coalesce(r.ppm, 0) > 0 or r.tier in ('fusion', 'primordial')) and w.shiny)::int shiny_ultras
        from public.world_plots w join public.plot_rarities r on r.id = w.rarity
       where w.owner_id is not null and ((coalesce(r.ppm, 0) > 0 or r.tier in ('fusion', 'primordial')) or w.rarity like 'crown%')
       group by w.owner_id having count(*) >= greatest(coalesce(p_min, 1), 1)
    ), q as (
      select u.*, pr.username, au.email, private.rent_rate(u.owner_id) rate, (select count(*) from public.world_plots where owner_id = u.owner_id)::int plots
        from u join public.profiles pr on pr.id = u.owner_id left join auth.users au on au.id = u.owner_id
       where v_q = '' or lower(pr.username) like '%' || v_q || '%' or lower(coalesce(au.email, '')) like '%' || v_q || '%'
    )
    select jsonb_build_object('boost_mult', v_bm, 'free_boost_seconds', v_free,
      'totals', (select jsonb_build_object('players', count(*), 'ultras', coalesce(sum(ultras), 0), 'crowns', coalesce(sum(crowns), 0),
                   'day', coalesce(sum(rate), 0) * 86400, 'day_boosted', coalesce(sum(rate), 0) * v_bm * 86400) from q),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(z.owner_id), 'email', z.email, 'ultras', z.ultras, 'crowns', z.crowns,
                  'shiny_ultras', z.shiny_ultras, 'plots', z.plots, 'rate', z.rate, 'day', z.rate * 86400, 'day_free_boosts', z.rate * (86400 + (v_bm - 1) * v_free),
                  'day_boosted', z.rate * v_bm * 86400,
                  'by_rarity', (select coalesce(jsonb_agg(jsonb_build_object('rarity', y.rarity, 'n', y.n) order by y.sort), '[]'::jsonb) from (
                                  select w.rarity, min(r.sort) sort, count(*)::int n from public.world_plots w join public.plot_rarities r on r.id = w.rarity
                                   where w.owner_id = z.owner_id and ((coalesce(r.ppm, 0) > 0 or r.tier in ('fusion', 'primordial')) or w.rarity like 'crown%') group by w.rarity) y),
                  'egg_loop', case when exists (select 1 from public.player_luck pl where pl.player_id = z.owner_id and pl.sacrificed > 0)
                                   then (private.egg_loop_stats(z.owner_id) ->> 'excess')::int else 0 end)
                  order by z.ord desc, z.rate desc)
                from (select q.*, case p_sort when 'ultras' then q.ultras when 'crowns' then q.crowns when 'plots' then q.plots else q.rate * 1e12 end ord
                        from q order by ord desc, q.rate desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) z), '[]'::jsonb))
  );
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
  return m * private.ench_plot_mult_extra(p_uid, p_gx, p_gy) * private.rx_game_mult(p_uid, p_gx, p_gy);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_pay(p_id uuid, p_base numeric, p_what text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare e public.enchantments; p jsonb; v numeric := greatest(coalesce(p_base, 0), 0); v_mods jsonb := '[]'::jsonb; v_paid int := 0; v_extra int := 0;
  k int; b record; v_echo boolean := false; v_gift int; v_to uuid; v_x numeric; v_spread numeric := 0; v_xp int := 1; v_ab text; v_lk jsonb;
  v_cell int[]; v_chests int := 0; v_open int; v_cap int := coalesce((private.ench_cfg() ->> 'seek_chest_cap')::int, 25);
  v_chest_ink int := coalesce((private.ench_cfg() ->> 'seek_chest_ink')::int, 50); v_gene text; v_card text; v_fx jsonb;
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
            v_cell := coalesce(private.rx_lode_cell(e.owner_id), private.ench_free_cell(e.gx, e.gy, 2, 7));
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
      -- (Farsight, Folded, Strings and Inscribed work on the map, on its clock, on its chores and through its rune — not on Ink)
      when 'farsight' then null;
      when 'folded' then null;
      when 'strings' then null;
      when 'fated' then
        -- 🃏 a card is drawn, and it comes true
        if coalesce(current_setting('landvas.fated', true), '') <> '1' and random() < (array[0.1, 0.18, 0.25])[k] then
          v_card := (select c ->> 'id' from jsonb_array_elements(private.deck_cards()) c where c ->> 'id' <> 'rebirth' order by random() * (c ->> 'w')::numeric desc limit 1);
          perform set_config('landvas.fated', '1', true);
          v_fx := private.deck_apply(e, v_card, true, false);
          perform set_config('landvas.fated', '', true);
          update public.enchantments set stats = stats || jsonb_build_object('fated_n', coalesce((stats ->> 'fated_n')::int, 0) + 1,
                   'fated_last', jsonb_build_object('card', v_card, 'name', private.deck_card(v_card) ->> 'name', 'fx', private.deck_fx_text(v_fx), 'at', now())) where id = p_id;
          v_mods := v_mods || jsonb_build_object('label', 'Fated: ' || (private.deck_card(v_card) ->> 'name') || ' came true — ' || private.deck_fx_text(v_fx), 'emoji', '🃏', 'card', v_card);
        end if;
      when 'inscribed' then null;
      -- (Tempo shows its worth on clocks; borrowed by Patchwork it pays a little)
      when 'tempo' then
        if (p ->> 'gene') = 'patchwork' then v := v * 1.15; v_mods := v_mods || jsonb_build_object('label', 'Tempo +15%', 'emoji', '⚙️'); end if;
      -- Wishing keeps a charge where there are charges; anywhere else it pays
      when 'wish' then
        if e.kind not in ('genie', 'sizeray', 'oracle') then
          v := v * (1 + 0.25 * k); v_mods := v_mods || jsonb_build_object('label', 'Wishing +' || (25 * k) || '%', 'emoji', '🧞');
        end if;
      -- Trickster dodges bad luck where there is bad luck; anywhere else it pays
      -- (Tempered dodges bad luck where there is bad luck, and tempers its plot — never Ink)
      when 'trick' then null;
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

CREATE OR REPLACE FUNCTION private.lev_loot(l leviathans, p_fell boolean)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare v_tot numeric; v_pool numeric := l.hp_max / greatest(private.lev_n('loot_pool_div', 100), 1); p record; v_ink int; v_paid int; v_top int; v_loot jsonb; v_lk jsonb; v_tk uuid; v_n int;
begin
  select coalesce(sum(dmg), 0), count(*) into v_tot, v_n from public.leviathan_players where lev_id = l.id and dmg > 0;
  v_top := greatest(1, ceil(v_n * 0.1)::int);
  for p in select lp.*, row_number() over (order by lp.dmg desc) rk from public.leviathan_players lp where lp.lev_id = l.id and lp.dmg > 0 loop
    v_tk := null;
    if p_fell then
      v_ink := least(private.lev_n('loot_cap', 1500), private.lev_n('loot_base', 25) + round(v_pool * p.dmg / greatest(v_tot, 1)))::int;
      -- 🧲 a Lodestone drags out more, a Serpent's Egg more again
      v_ink := round(v_ink * (1 + private.rx_loot_pct(p.player_id) / 100))::int;
      v_loot := jsonb_build_object('fell', true, 'rank', p.rk, 'share', round(p.dmg * 100.0 / greatest(v_tot, 1), 2));
      if p.dmg >= v_tot * 0.01 then v_lk := private.ench_give_luck(p.player_id, 0, 1); v_loot := v_loot || jsonb_build_object('enchant', 1); end if;
      if p.dmg >= v_tot * 0.01 and private.glyph_drop(p.player_id, 'leviathan', 0.35) is not null then v_loot := v_loot || jsonb_build_object('glyph', true); end if;
      if p.rk = 1 then v_tk := private.ench_ticket(p.player_id, 'legendary', 'leviathan'); v_loot := v_loot || jsonb_build_object('ticket', 'legendary');
      elsif p.rk <= v_top then v_tk := private.ench_ticket(p.player_id, 'epic', 'leviathan'); v_loot := v_loot || jsonb_build_object('ticket', 'epic'); end if;
    else
      v_ink := 10;
      v_loot := jsonb_build_object('fell', false, 'rank', p.rk, 'share', round(p.dmg * 100.0 / greatest(v_tot, 1), 2));
    end if;
    v_paid := private.grant_ink_paced(p.player_id, v_ink, 'leviathan', 'leviathan', l.id::text, 'lev:' || l.id || ':' || p.player_id);
    v_loot := v_loot || jsonb_build_object('ink', v_paid);
    update public.leviathan_players set loot = v_loot where lev_id = l.id and player_id = p.player_id;
    perform private.notify(p.player_id, 'leviathan', null, jsonb_build_object('sub', case when p_fell then 'fallen' else 'escaped' end, 'gen', l.gen) || v_loot);
  end loop;
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
  if v_s.gx is not null and v_s.puppet_id is null then
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
  -- ✍️ a glyph can turn up in a won run
  if v_valid and v_passed then perform private.glyph_drop(v_s.player_id, 'minigame', 0.05); end if;
  -- 🖐️ Midas Hand: a win on one of your plots may turn it to gold
  if v_valid and v_passed and v_s.puppet_id is null then perform private.rx_after_win(v_s.player_id, v_s.gx, v_s.gy); end if;
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

CREATE OR REPLACE FUNCTION private.roll_shiny()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare c jsonb := private.cfg('shiny'); v_n numeric := greatest(coalesce((c ->> 'one_in')::numeric, 1000), 1);
begin
  -- a fresh claim (not a transfer of an owned plot) rolls for shiny
  if new.owner_id is not null and (tg_op = 'INSERT' or old.owner_id is null) and coalesce((c ->> 'enabled')::boolean, true) then
    if private.in_hot_zone(new.gx, new.gy) then v_n := v_n / coalesce((private.cfg('hot_zones') ->> 'shiny_mult')::numeric, 2); end if;
    v_n := v_n / greatest(private.rx_shiny_x(new.owner_id, new.gx, new.gy), 1);
    new.shiny := random() < 1 / v_n;
  elsif new.owner_id is null then new.shiny := false;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.roll_shiny_at(p_gx integer, p_gy integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare c jsonb := private.cfg('shiny'); v_n numeric := greatest(coalesce((c ->> 'one_in')::numeric, 1000), 1);
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then return false; end if;
  if private.in_hot_zone(p_gx, p_gy) then v_n := v_n / coalesce((private.cfg('hot_zones') ->> 'shiny_mult')::numeric, 2); end if;
  v_n := v_n / greatest(private.rx_shiny_x(null, p_gx, p_gy), 1);
  return random() < 1 / v_n;
end $function$;

CREATE OR REPLACE FUNCTION private.require_in_reach(p_uid uuid, p_gx integer, p_gy integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
AS $function$
declare c record; v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 1); v_d int;
begin
  if not private.flag('location_gated_claims') then return; end if;
  -- 🌐 a Rift of yours: claim around it as if you were standing there
  if private.rx_rift_ok(p_uid, p_gx, p_gy) then return; end if;
  select * into c from private.explorer_now(p_uid);
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  v_d := private.cell_distance(c.gx, c.gy, p_gx, p_gy);
  if v_d > v_reach then
    raise exception 'out_of_reach' using errcode = 'P0001', detail = v_d::text;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION private.wonders_tick()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare r record;
begin
  -- the Ultra Expansion's powers (their own errors never stop the rest)
  begin perform private.rx_tick(); exception when others then raise warning 'rx_tick: %', sqlerrm; end;
  for r in select id from public.enchantments where kind = 'ouroboros' and jsonb_typeof(state -> 'coil') = 'object' limit 2000 loop
    perform private.ouro_settle(r.id);
  end loop;
  for r in select id from public.enchantments where kind = 'stormcoil' and jsonb_typeof(state -> 'storm') = 'object' and not coalesce((state -> 'storm' ->> 'settled')::boolean, false)
             and (state -> 'storm' ->> 'until')::numeric + 3 < extract(epoch from now()) limit 500 loop
    perform private.storm_settle(r.id);
  end loop;
  for r in
    select x.id from public.enchantments x
     where x.status = 'active' and x.id in (
             select s.a from public.enchant_splices s join public.enchantments o on o.id = s.b
              where s.started_at <= now() and s.ends_at > now() and o.kind in ('puppeteer', 'spyglass')
             union
             select s.b from public.enchant_splices s join public.enchantments o on o.id = s.a
              where s.b is not null and s.mode <> 'graft' and s.started_at <= now() and s.ends_at > now() and o.kind in ('puppeteer', 'spyglass'))
       and (coalesce(x.stats ->> 'strings_day', '') <> private.today()::text or coalesce(x.stats ->> 'far_day', '') <> private.today()::text)
     limit 3000 loop
    perform private.trait_daily(r.id);
  end loop;
  perform private.endless_renew(null);
end $function$;

CREATE OR REPLACE FUNCTION private.ori_move(e enchantments, p world_plots, p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare w public.world_plots; v_y text; v_yt text; g public.canvas_groups; v_km numeric; v_ench uuid; v_moved boolean := false;
begin
  if p.rarity = 'enchanted' and exists (select 1 from public.enchantments where gx = p_gx and gy = p_gy) then raise exception 'plot_taken' using errcode = 'P0001'; end if;
  perform private.rent_settle(e.owner_id);
  select * into w from public.world_plots where gx = p_gx and gy = p_gy for update;
  -- what the old cell takes on: the new cell's own roll (a released row keeps its own)
  if w.gx is not null then v_y := w.rarity; v_yt := w.plot_type;
  else v_y := private.cell_ladder_rarity(p_gx, p_gy); v_yt := private.plot_type_for(p_gx, p_gy); end if;
  if v_y like 'crown%' or v_y = 'enchanted' then v_y := private.cell_ladder_rarity(p_gx, p_gy); end if;
  -- a living fold carries its enchantment along
  if p.rarity = 'enchanted' then
    select id into v_ench from public.enchantments where gx = p.gx and gy = p.gy and status <> 'gone';
    update public.enchant_buffs set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy and enchant_id = v_ench;
    update public.enchantments set gx = p_gx, gy = p_gy, updated_at = now() where id = v_ench;
  end if;
  -- the new cell
  if w.gx is not null then
    update public.world_plots set owner_id = e.owner_id, claimed_at = p.claimed_at, level = p.level, plot_type = p.plot_type, rarity = p.rarity,
           art_publication_id = null, art_rev = null, folded_at = null, folded_by = null, updated_at = now()
     where gx = p_gx and gy = p_gy;
  else
    insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at, level)
    values (p_gx, p_gy, p.plot_type, p.rarity, e.owner_id, p.claimed_at, p.level);
  end if;
  update public.world_plots set shiny = p.shiny, name = p.name where gx = p_gx and gy = p_gy;
  -- what belongs to it comes too
  delete from public.plot_game_progress where gx = p_gx and gy = p_gy;
  update public.plot_game_progress set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  delete from public.crucible_inlays where gx = p_gx and gy = p_gy;
  delete from public.crucible_monuments where gx = p_gx and gy = p_gy;
  update public.crucible_inlays set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  update public.crucible_monuments set gx = p_gx, gy = p_gy, updated_at = now() where gx = p.gx and gy = p.gy;
  update public.crucible_artifacts set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  -- the old cell goes back to the world
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy for update of gr;
  if g.id is not null and g.plot_count <= 1 and g.status = 'active' then
    -- its drawing comes too: the canvas (and the Studio project on it) moves to the new cell, and the published tile follows
    v_moved := true;
    delete from public.canvas_group_members where gx = p_gx and gy = p_gy and group_id <> g.id;
    update public.canvas_group_members set gx = p_gx, gy = p_gy where group_id = g.id;
    update public.canvas_groups set min_gx = p_gx, max_gx = p_gx, min_gy = p_gy, max_gy = p_gy, updated_at = now() where id = g.id;
    if g.project_id is not null then perform private.ori_move_project(g.project_id, p.gx, p.gy, p_gx, p_gy); end if;
    if p.art_publication_id is not null then
      update public.world_plots set art_publication_id = p.art_publication_id, art_rev = null where gx = p_gx and gy = p_gy;
      if p.art_rev is not null then
        perform private.enqueue_job('move_art', jsonb_build_object('from', jsonb_build_array(p.gx, p.gy), 'to', jsonb_build_array(p_gx, p_gy), 'rev', p.art_rev, 'publication_id', p.art_publication_id));
      end if;
    end if;
  elsif g.id is not null then
    delete from public.canvas_group_members where group_id = g.id;
    update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = g.id;
    if g.project_id is not null then update public.artwork_projects set status = 'archived', updated_at = now() where id = g.project_id; end if;
  end if;
  update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null, rarity = v_y, plot_type = coalesce(v_yt, plot_type),
         folded_at = null, folded_by = null, updated_at = now()
   where gx = p.gx and gy = p.gy;
  update public.plot_ownership set released_at = now(), release_reason = coalesce(nullif(current_setting('landvas.move_why', true), ''), 'folded away (Origami Pocket)') where gx = p.gx and gy = p.gy and released_at is null;
  insert into public.plot_ownership (gx, gy, player_id, method, cost) values (p_gx, p_gy, e.owner_id, coalesce(nullif(current_setting('landvas.move_method', true), ''), 'unfold'), jsonb_build_object('from', jsonb_build_array(p.gx, p.gy)));
  if not v_moved then perform private.create_group_with_cells(e.owner_id, jsonb_build_array(jsonb_build_array(p_gx, p_gy)), private.empty_manifest(), null, 'initial'); end if;
  insert into public.plot_art_history (gx, gy, publication_id, rev) values (p.gx, p.gy, null, null);
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy), ('ownership', p_gx, p_gy, p_gx, p_gy);
  perform private.enqueue_job('clear_cells', jsonb_build_object('cells', jsonb_build_array(jsonb_build_array(p.gx, p.gy))));
  perform private.spy_claimed(e.owner_id, p_gx, p_gy);
  -- a fresh crease: its minigames pay more for a day
  insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
  values (e.owner_id, 'crease', p_gx, p_gy, e.id, 1.25, jsonb_build_object('from', jsonb_build_array(p.gx, p.gy)), now() + interval '24 hours');
  v_km := round((private.ench_cell_m(p.gx, p.gy, p_gx, p_gy) / 1000)::numeric, 1);
  perform private.fairplay(e.owner_id, 'unfold', p_gx, p_gy, jsonb_build_object('from', jsonb_build_array(p.gx, p.gy), 'rarity', p.rarity, 'left', v_y, 'km', v_km));
  return jsonb_build_object('from', jsonb_build_array(p.gx, p.gy), 'to', jsonb_build_array(p_gx, p_gy), 'km', v_km, 'rarity', p.rarity, 'left', v_y, 'enchant', v_ench, 'drawing', v_moved and p.art_publication_id is not null);
end $function$;

CREATE OR REPLACE FUNCTION private.profile_showcase(p_uid uuid, p_viewer uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'badge', (select showcase_badge from public.profiles where id = p_uid),
    'rarest', (select jsonb_build_object('rarity', rarity, 'count', n, 'shiny', sh, 'since', since) from (
                 select rarity, count(*) n, count(*) filter (where shiny) sh, min(claimed_at) since from public.world_plots
                 where owner_id = p_uid group by rarity order by private.rarity_rareness(rarity) desc limit 1) r),
    'crowns', case when p_uid = p_viewer or private.shows(p_uid, 'royalty') then (
                 select coalesce(jsonb_agg(jsonb_build_object('tier', p.rarity, 'shiny', p.shiny, 'since', p.claimed_at, 'country', k.country,
                   'kingdom', case p.rarity when 'crown' then k.name when 'crown_state' then coalesce(k.state, coalesce(k.country_name, k.country)) else coalesce(k.country_name, k.country) end)
                   order by private.rarity_rareness(p.rarity) desc, p.claimed_at), '[]'::jsonb)
                 from public.world_plots p join public.world_cities k on k.id = p.city_id
                 where p.owner_id = p_uid and p.rarity in ('crown', 'crown_state', 'crown_country')) else '[]'::jsonb end,
    'ultra_sets', (select coalesce(jsonb_agg(r order by private.rarity_rareness(r)), '[]'::jsonb) from unnest(array['solar', 'lunar', 'comet', 'chaos', 'phoenix',
                     'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity',
                     'volcano', 'world_tree', 'phantom', 'wanderer', 'lodestone', 'leyline', 'glacier', 'mycelium', 'hive', 'heart_world']) r
                   where exists (select 1 from public.player_unlocks u where u.player_id = p_uid and u.unlock_key = 'explorer.hat.' || private.ultra_set_id(r))))
$function$;

CREATE OR REPLACE FUNCTION private.feed_activities()
 RETURNS TABLE(grp text, id text)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  values
    ('feed_account', 'join'), ('feed_account', 'referral'),
    ('feed_claims', 'claim'), ('feed_claims', 'shiny'), ('feed_claims', 'crown'), ('feed_claims', 'planet_plot'), ('feed_claims', 'core'), ('feed_claims', 'enchant'), ('feed_claims', 'primordial'),
    ('feed_badges', 'achievement'),
    ('feed_games', 'minigame'), ('feed_games', 'pvp'), ('feed_games', 'challenge'), ('feed_games', 'sketch'), ('feed_games', 'level'),
    ('feed_games', 'arcade_playing'), ('feed_games', 'arcade_record'), ('feed_games', 'arcade_prize'), ('feed_games', 'arcade_cosmetic'),
    ('feed_games', 'arcade_level'), ('feed_games', 'arcade_install'), ('feed_games', 'leviathan'),
    ('feed_art', 'publish'), ('feed_art', 'featured'), ('feed_art', 'duet'), ('feed_art', 'stamp'),
    ('feed_luck', 'luck_ink'), ('feed_luck', 'luck_inkborn'), ('feed_luck', 'luck_egg'), ('feed_luck', 'luck_plot'), ('feed_luck', 'luck_pick'), ('feed_luck', 'luck_enchant'),
    ('feed_travel', 'flight'), ('feed_travel', 'exploring'), ('feed_travel', 'settle'),
    ('feed_places', 'harvest'), ('feed_places', 'estate'), ('feed_places', 'ipo'), ('feed_places', 'base'), ('feed_places', 'dig'), ('feed_places', 'playdate')
$function$;

CREATE OR REPLACE FUNCTION private.feed_group(p_kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_kind in ('join', 'referral') then 'feed_account'
    when p_kind in ('claim', 'crown', 'planet_plot', 'core', 'enchant', 'primordial') then 'feed_claims'
    when p_kind = 'achievement' then 'feed_badges'
    when p_kind in ('minigame', 'pvp', 'arcade', 'sketch', 'challenge', 'level', 'leviathan') then 'feed_games'
    when p_kind in ('publish', 'featured', 'duet', 'stamp') then 'feed_art'
    when p_kind = 'luck' then 'feed_luck'
    when p_kind in ('flight', 'exploring', 'settle') then 'feed_travel'
    when p_kind in ('harvest', 'ipo', 'estate', 'dig', 'base', 'playdate') then 'feed_places'
    else null end
$function$;

-- ---- what players see and do -------------------------------------------------------------------------------------------------
create or replace function private.rx_name(p_uid uuid) returns text language sql stable as $$
  select username from public.profiles where id = p_uid
$$;
create or replace function private.rx_week() returns text language sql stable as $$ select to_char(now(), 'IYYY-IW') $$;
create or replace function private.rx_month() returns text language sql stable as $$ select to_char(now(), 'YYYY-MM') $$;
-- the hour of day at a plot by the sun (its longitude), for the Void Gate's evening
create or replace function private.rx_solar_h(p_gx int) returns numeric language sql stable as $$
  select ((extract(epoch from now()) / 3600.0 + private.lng_of(p_gx + 0.5) / 15.0)::numeric % 24 + 24) % 24
$$;
create or replace function private.rx_gate_open(p_gx int) returns boolean language sql stable as $$
  select ((private.rx_solar_h(p_gx) - private.rx_n('void_gate', 'open_h', 20)) % 24 + 24) % 24 < private.rx_n('void_gate', 'len_h', 4)
$$;
-- the evening a Void Gate's travellers belong to
create or replace function private.rx_gate_night(p_gx int) returns text language sql stable as $$
  select to_char(now() + make_interval(secs => (private.lng_of(p_gx + 0.5) / 15.0 * 3600 - 6 * 3600)::double precision), 'YYYY-MM-DD')
$$;
-- does a player have land within a Primordial's reach?
create or replace function private.rx_near(p_uid uuid, p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.world_plots w, (select private.rx_cells(private.rx_area_m(), p_gy) r) k
                  where w.owner_id = p_uid and w.gx between p_gx - k.r and p_gx + k.r and w.gy between p_gy - k.r and p_gy + k.r
                    and private.rx_m(w.gx, w.gy, p_gx, p_gy) <= private.rx_area_m())
$$;
-- everyone (active) with land within a Primordial's reach
create or replace function private.rx_neighbours(p_gx int, p_gy int, p_cap int) returns table (player_id uuid) language sql stable as $$
  select distinct w.owner_id from public.world_plots w join public.players pl on pl.id = w.owner_id, (select private.rx_cells(private.rx_area_m(), p_gy) r) k
   where w.owner_id is not null and pl.status = 'active' and w.gx between p_gx - k.r and p_gx + k.r and w.gy between p_gy - k.r and p_gy + k.r
     and private.rx_m(w.gx, w.gy, p_gx, p_gy) <= private.rx_area_m()
   limit p_cap
$$;

-- one power, as its owner (everything) or anyone else (what's public) sees it
create or replace function private.rx_view(p_gx int, p_gy int, p_uid uuid) returns jsonb language plpgsql stable as $$
declare x public.rarity_powers; r public.plot_rarities; f text; s jsonb; v jsonb; mine boolean; a jsonb := '[]'::jsonb; k text;
  v_lev public.leviathans; e jsonb; t text; n int; ready boolean;
begin
  select * into x from public.rarity_powers where gx = p_gx and gy = p_gy;
  if x.gx is null then return null; end if;
  select * into r from public.plot_rarities where id = x.rarity;
  f := private.rx_family(x.rarity); s := x.state; mine := p_uid is not null and p_uid = x.owner_id;
  -- a Phantom keeps its secret from everyone else
  if not mine and x.rarity in ('phantom', 'doppelganger') and not private.rx_eye_sees(p_uid, p_gx, p_gy) then return null; end if;
  v := jsonb_build_object('gx', x.gx, 'gy', x.gy, 'rarity', x.rarity, 'tier', r.tier, 'family', f, 'name', r.name, 'emoji', r.emoji, 'color', r.color, 'glow', r.glow,
         'ability', r.ability, 'mine', mine, 'owner_name', private.rx_name(x.owner_id), 'since', x.since,
         'next_in', case when mine and x.next_at is not null then greatest(0, round(extract(epoch from x.next_at - now()))) end,
         'log', case when mine then coalesce(s -> 'log', '[]'::jsonb) end, 'area_m', private.rx_area_m());
  if f = 'volcano' and mine then
    v := v || jsonb_build_object('lava', (select coalesce(jsonb_agg(jsonb_build_array(gx, gy)), '[]'::jsonb) from public.rarity_spots where kind = 'obsidian' and src_gx = x.gx and src_gy = x.gy and owner_id = x.owner_id and expires_at > now()),
                                 'lava_in', (select greatest(0, round(extract(epoch from max(expires_at) - now()))) from public.rarity_spots where kind = 'obsidian' and src_gx = x.gx and src_gy = x.gy and expires_at > now()),
                                 'eruptions', coalesce((s ->> 'eruptions')::int, 0));
  elsif f = 'world_tree' and mine then
    v := v || jsonb_build_object('roots', coalesce(s -> 'roots', '[]'::jsonb), 'max', private.rx_n('world_tree', 'max', 6)::int * case when x.rarity = 'elder_tree' then 2 else 1 end,
                                 'km', private.rx_n('world_tree', 'km', 2) * case when x.rarity = 'elder_tree' then 2 else 1 end);
  elsif f = 'phantom' and mine then
    v := v || jsonb_build_object('whisper', s -> 'whisper', 'disguise', case when x.rarity = 'doppelganger' then coalesce(s ->> 'disguise', 'common') end);
    if x.rarity = 'doppelganger' then a := a || jsonb_build_object('id', 'disguise', 'label', 'Choose its disguise', 'ready', true, 'needs', 'rarity'); end if;
  elsif f = 'wanderer' and mine then
    v := v || jsonb_build_object('from', s -> 'from', 'trail', (select coalesce(jsonb_agg(jsonb_build_array(gx, gy)), '[]'::jsonb) from public.rarity_spots where kind = 'trail' and src_gx = x.gx and src_gy = x.gy and owner_id = x.owner_id and expires_at > now()),
                                 'tethered', coalesce((s ->> 'tethered')::boolean, false), 'gallops', coalesce((s ->> 'gallops')::int, 0));
  elsif f = 'mycelium' and mine then
    v := v || jsonb_build_object('mushrooms', (select coalesce(jsonb_agg(jsonb_build_array(gx, gy)), '[]'::jsonb) from public.rarity_spots where kind = 'mushroom' and src_gx = x.gx and src_gy = x.gy and owner_id = x.owner_id and expires_at > now()),
                                 'max', private.rx_n('mycelium', 'max', 12)::int);
  elsif f = 'hive' and mine then
    v := v || jsonb_build_object('bees', coalesce(s -> 'bees', '[]'::jsonb), 'flowers', coalesce((s ->> 'flowers')::int, 0), 'honey', coalesce((s ->> 'honey')::int, 0));
  elsif f = 'glacier' then
    v := v || jsonb_build_object('cells', private.rx_n('glacier', 'cells', 8)::int);
  end if;
  if f in ('lodestone', 'compass') and mine then
    n := private.rx_lode_ink(x);
    v := v || jsonb_build_object('ink', n, 'ink_cap', (private.rx_n('lodestone', 'ink_day', 20) * private.rx_n('lodestone', 'cap_days', 3))::int, 'collected', coalesce((s ->> 'collected')::int, 0));
    a := a || jsonb_build_object('id', 'collect', 'label', 'Collect ' || n || ' Ink', 'ready', n > 0, 'why', case when n <= 0 then 'gathering' end);
  end if;
  if f in ('leyline', 'compass') and mine then v := v || jsonb_build_object('beams', coalesce(s -> 'beams', '[]'::jsonb)); end if;

  -- ---- the Primordials ----
  if x.rarity = 'heart_world' and mine then
    ready := coalesce(s ->> 'gift_week', '') <> private.rx_week();
    a := a || jsonb_build_object('id', 'gift', 'label', 'Give everyone nearby a Golden Hour', 'ready', ready, 'why', case when not ready then 'next_week' end);
    v := v || jsonb_build_object('gifts', coalesce((s ->> 'gifts')::int, 0), 'last_gift', s -> 'last_gift');
  elsif x.rarity = 'throne_ink' then
    v := v || jsonb_build_object('rule', case when (s ->> 'rule_until')::timestamptz > now() then s ->> 'rule' end, 'rule_until', case when (s ->> 'rule_until')::timestamptz > now() then s ->> 'rule_until' end);
    if mine then
      ready := coalesce(s ->> 'decree_week', '') <> private.rx_week();
      a := a || jsonb_build_object('id', 'decree', 'label', 'Set this week''s rule', 'ready', ready, 'needs', 'rule', 'why', case when not ready then 'next_week' end);
    end if;
  elsif x.rarity = 'serpent_egg' and mine then
    select * into v_lev from public.leviathans where status in ('walking', 'enraged') order by spawned_at desc limit 1;
    ready := coalesce(s ->> 'call_week', '') <> private.rx_week();
    a := a || jsonb_build_object('id', 'call', 'label', 'Call the Leviathan', 'ready', ready and v_lev.id is not null, 'why', case when not ready then 'next_week' when v_lev.id is null then 'no_leviathan' end);
    v := v || jsonb_build_object('leviathan_out', v_lev.id is not null, 'loot_pct', private.rx_n('serpent_egg', 'loot_pct', 50));
  elsif x.rarity = 'world_eye' and mine then
    ready := coalesce(s ->> 'gaze_day', '') <> private.today()::text;
    a := a || jsonb_build_object('id', 'gaze', 'label', 'Gaze at the land around it', 'ready', ready, 'why', case when not ready then 'tomorrow' end);
    v := v || jsonb_build_object('glints', (select coalesce(jsonb_agg(jsonb_build_object('gx', gx, 'gy', gy, 'rarity', data ->> 'rarity')), '[]'::jsonb) from public.rarity_spots where kind = 'glint' and owner_id = x.owner_id and src_gx = x.gx and src_gy = x.gy and expires_at > now()),
                                 'phantoms', (select count(*) from public.rarity_powers q where q.rarity in ('phantom', 'doppelganger') and q.owner_id <> x.owner_id and private.rx_m(q.gx, q.gy, x.gx, x.gy) <= private.rx_area_m()));
  elsif x.rarity = 'void_gate' then
    t := private.rx_gate_night(x.gx);
    v := v || jsonb_build_object('open', private.rx_gate_open(x.gx), 'opens_in', round(((private.rx_n('void_gate', 'open_h', 20) - private.rx_solar_h(x.gx)) % 24 + 24) % 24 * 3600),
                                 'travellers', (select count(*) from public.rarity_visits where gx = x.gx and gy = x.gy and day = t and kind = 'step'),
                                 'stepped', p_uid is not null and exists (select 1 from public.rarity_visits where gx = x.gx and gy = x.gy and day = t and kind = 'step' and player_id = p_uid),
                                 'near', p_uid is not null and private.rx_near(p_uid, x.gx, x.gy));
    a := a || jsonb_build_object('id', 'step', 'label', 'Step through the gate', 'ready', private.rx_gate_open(x.gx) and p_uid is not null and private.rx_near(p_uid, x.gx, x.gy)
                                 and not exists (select 1 from public.rarity_visits where gx = x.gx and gy = x.gy and day = t and kind = 'step' and player_id = p_uid),
                                 'why', case when not private.rx_gate_open(x.gx) then 'closed' when p_uid is null or not private.rx_near(p_uid, x.gx, x.gy) then 'too_far' end, 'visitor', true);
  elsif x.rarity = 'first_light' then
    v := v || jsonb_build_object('art_path', (select a2.thumb_path from public.world_plots w join public.artwork_publications a2 on a2.id = w.art_publication_id where w.gx = x.gx and w.gy = x.gy));
  elsif x.rarity = 'fallen_star' then
    v := v || jsonb_build_object('stars', (select count(*) from public.rarity_spots where kind = 'star' and src_gx = x.gx and src_gy = x.gy and expires_at > now()),
                                 'shower_until', case when (s -> 'shower' ->> 'until')::timestamptz > now() then s -> 'shower' ->> 'until' end, 'caught', coalesce((s ->> 'caught')::int, 0));
    if mine then
      ready := coalesce(s ->> 'shower_week', '') <> private.rx_week();
      a := a || jsonb_build_object('id', 'shower', 'label', 'Call down the shooting stars', 'ready', ready, 'why', case when not ready then 'next_week' end);
    end if;
  elsif x.rarity = 'genesis_well' then
    v := v || jsonb_build_object('land', (select count(*) from public.rarity_spots where kind = 'genesis' and src_gx = x.gx and src_gy = x.gy and expires_at > now()),
                                 'land_until', (select max(expires_at) from public.rarity_spots where kind = 'genesis' and src_gx = x.gx and src_gy = x.gy and expires_at > now()));
    if mine then
      ready := coalesce(s ->> 'rise_month', '') <> private.rx_month();
      a := a || jsonb_build_object('id', 'rise', 'label', 'Raise new land', 'ready', ready, 'why', case when not ready then 'next_month' end);
    end if;
  elsif x.rarity = 'chrysalis' then
    v := v || jsonb_build_object('hatch_in', greatest(0, round(extract(epoch from coalesce((s ->> 'hatch_at')::timestamptz, now()) - now()))));
  elsif x.rarity = 'hourglass' and mine then
    v := v || jsonb_build_object('gained_s', coalesce((s ->> 'gained_s')::numeric, 0),
             'enchantments', (select count(*) from public.enchantments e where e.owner_id = x.owner_id and e.status = 'active' and private.rx_m(x.gx, x.gy, e.gx, e.gy) <= private.rx_area_m()));
  elsif x.rarity = 'sunspot' and mine then
    ready := coalesce(s ->> 'place_day', '') <> private.today()::text;
    a := a || jsonb_build_object('id', 'place', 'label', case when s ? 'zone' then 'Move your Sunspot' else 'Place your Sunspot' end, 'ready', ready, 'needs', 'spot', 'why', case when not ready then 'tomorrow' end);
    v := v || jsonb_build_object('zone', s -> 'zone', 'm', private.rx_n('sunspot', 'm', 1000));
  elsif x.rarity = 'rift' and mine then
    ready := coalesce(s ->> 'open_day', '') <> private.today()::text;
    a := a || jsonb_build_object('id', 'open', 'label', 'Tear a rift', 'ready', ready, 'needs', 'spot', 'why', case when not ready then 'tomorrow' end);
    v := v || jsonb_build_object('rift', case when (s -> 'rift' ->> 'until')::timestamptz > now() then s -> 'rift' end, 'm', private.rx_n('rift', 'm', 150));
  elsif x.rarity = 'upside_down' and mine then
    ready := coalesce(s ->> 'flip_week', '') <> private.rx_week();
    a := a || jsonb_build_object('id', 'flip', 'label', 'Flip the table for an hour', 'ready', ready, 'why', case when not ready then 'next_week' end);
    v := v || jsonb_build_object('flip_until', case when (s ->> 'flip_until')::timestamptz > now() then s ->> 'flip_until' end);
  elsif x.rarity = 'transmuter' and mine then
    ready := coalesce(s ->> 'day', '') <> private.today()::text;
    a := a || jsonb_build_object('id', 'transmute', 'label', 'Transmute 5 plots', 'ready', ready, 'needs', 'cells5', 'why', case when not ready then 'tomorrow' end);
    v := v || jsonb_build_object('last', s -> 'last');
  elsif x.rarity = 'doubling_cube' and mine then
    ready := coalesce(s ->> 'day', '') <> private.today()::text;
    a := a || jsonb_build_object('id', 'roll', 'label', 'Double or nothing', 'ready', ready, 'needs', 'plot', 'why', case when not ready then 'tomorrow' end);
    v := v || jsonb_build_object('last', s -> 'last');
  elsif x.rarity in ('midas', 'chain') and mine then
    v := v || jsonb_build_object('golds', coalesce((s ->> 'golds')::int, 0), 'links', coalesce((s ->> 'links')::int, 0), 'last', s -> 'last');
  elsif x.rarity = 'eleven' and mine then
    e := coalesce(s -> 'eleven', '{}'::jsonb);
    k := case when e ? 'tz' then private.rx_eleven_key(e ->> 'tz') end;
    v := v || jsonb_build_object('tz', e ->> 'tz', 'tz_locked_in', case when e ? 'tz_at' then greatest(0, round(extract(epoch from (e ->> 'tz_at')::timestamptz + make_interval(days => private.rx_n('eleven', 'tz_days', 7)::int) - now()))) end,
             'open', k is not null, 'wished', k is not null and e ->> 'last_key' = k, 'streak', coalesce((e ->> 'streak')::int, 0), 'wishes', coalesce((e ->> 'wishes')::int, 0),
             'next_at', case when e ? 'tz' then private.rx_eleven_next(e ->> 'tz', case when k is not null and e ->> 'last_key' = k then private.rx_now() + interval '61 seconds' end) end, 'server_now', private.rx_now(), 'last', e -> 'last',
             'ink', private.rx_n('eleven', 'ink', 111)::int, 'luck', private.rx_n('eleven', 'luck', 11)::int);
    a := a || jsonb_build_object('id', 'tz', 'label', 'Set your time zone', 'ready', true, 'needs', 'tz')
           || jsonb_build_object('id', 'wish', 'label', 'Make a wish', 'ready', k is not null and coalesce(e ->> 'last_key', '') <> k, 'needs', 'wish',
                                 'why', case when not (e ? 'tz') then 'no_tz' when k is null then 'not_1111' when e ->> 'last_key' = k then 'already_wished' end);
  end if;
  return v || jsonb_build_object('actions', a);
end $$;

create or replace function public.rarity_power(p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); x public.rarity_powers;
begin
  x := private.rx_sync(p_gx, p_gy);
  if x.gx is null then return null; end if;
  return private.rx_view(p_gx, p_gy, v_uid);
end $$;

create or replace function public.rarity_act(p_gx int, p_gy int, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); x public.rarity_powers; f text; s jsonb; r jsonb := '{}'::jsonb; t record; n int := 0; c int[];
  v_k text; v_n int; v_lev public.leviathans; v_cells jsonb; p public.world_plots; q public.world_plots; v_to text; v_r text; i int; e jsonb; v_prev text; v_streak int;
  v_tz text; v_paid int; v_key text; cx int; cy int; v_min text;
begin
  perform private.rate_limit('rarity_act', 240, 3600);
  x := private.rx_sync(p_gx, p_gy);
  if x.gx is null then raise exception 'no_power' using errcode = 'P0001'; end if;
  f := private.rx_family(x.rarity); s := x.state;

  -- 🌑 anyone with land nearby steps through an open Void Gate, once an evening
  if p_action = 'step' then
    if x.rarity <> 'void_gate' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if not private.rx_gate_open(x.gx) then raise exception 'gate_closed' using errcode = 'P0001'; end if;
    if not private.rx_near(v_uid, x.gx, x.gy) then raise exception 'too_far' using errcode = 'P0001'; end if;
    v_k := private.rx_gate_night(x.gx);
    insert into public.rarity_visits (gx, gy, player_id, day, kind) values (x.gx, x.gy, v_uid, v_k, 'step') on conflict do nothing;
    if not found then raise exception 'already_today' using errcode = 'P0001'; end if;
    v_min := case when random() < private.rx_n('void_gate', 'epic', 0.1) then 'epic' else 'rare' end;
    perform private.ench_ticket(v_uid, v_min, 'void_gate');
    select count(*) into n from public.rarity_visits where gx = x.gx and gy = x.gy and day = v_k and kind = 'step';
    if x.owner_id <> v_uid and n * private.rx_n('void_gate', 'tip', 5) <= private.rx_n('void_gate', 'tip_cap', 100) then
      perform private.rx_ink(x.owner_id, private.rx_n('void_gate', 'tip', 5)::int, x.gx || '_' || x.gy, 'gate:' || x.gx || ':' || x.gy || ':' || v_k || ':' || v_uid);
    end if;
    if n = 1 and x.owner_id <> v_uid then perform private.rx_note(x.owner_id, 'rx_traveller', v_uid, jsonb_build_object('gx', x.gx, 'gy', x.gy)); end if;
    perform private.fairplay(v_uid, 'rx_gate', x.gx, x.gy, jsonb_build_object('ticket', v_min));
    return jsonb_build_object('result', jsonb_build_object('ticket', v_min), 'view', private.rx_view(x.gx, x.gy, v_uid));
  end if;

  if x.owner_id <> v_uid then raise exception 'not_your_plot' using errcode = 'P0001'; end if;

  if p_action = 'collect' and f in ('lodestone', 'compass') then
    n := private.rx_lode_ink(x);
    if n <= 0 then raise exception 'nothing_yet' using errcode = 'P0001'; end if;
    v_paid := private.rx_ink(v_uid, n, x.gx || '_' || x.gy, 'lode:' || x.gx || ':' || x.gy || ':' || floor(extract(epoch from now())));
    update public.rarity_powers set state = state || jsonb_build_object('lode_at', extract(epoch from now()), 'collected', coalesce((state ->> 'collected')::int, 0) + coalesce(v_paid, n)) where gx = x.gx and gy = x.gy;
    perform private.rx_log(x.gx, x.gy, 'collected', jsonb_build_object('ink', coalesce(v_paid, n)));
    r := jsonb_build_object('ink', coalesce(v_paid, n));

  elsif p_action = 'disguise' and x.rarity = 'doppelganger' then
    v_r := p_args ->> 'rarity';
    if not exists (select 1 from public.plot_rarities where id = v_r and (weight > 0 or (ppm > 0 and id not like 'crown%'))) then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
    update public.rarity_powers set state = state || jsonb_build_object('disguise', v_r) where gx = x.gx and gy = x.gy;
    insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', x.gx, x.gy, x.gx, x.gy);
    r := jsonb_build_object('disguise', v_r);

  elsif p_action = 'gift' and x.rarity = 'heart_world' then
    if s ->> 'gift_week' = private.rx_week() then raise exception 'already_this_week' using errcode = 'P0001'; end if;
    for t in select player_id from private.rx_neighbours(x.gx, x.gy, private.rx_n('heart_world', 'cap', 1000)::int) loop
      insert into public.rarity_visits (gx, gy, player_id, day, kind) values (x.gx, x.gy, t.player_id, private.rx_week(), 'gift') on conflict do nothing;
      continue when not found;
      perform private.rx_golden(t.player_id, jsonb_build_object('heart', jsonb_build_array(x.gx, x.gy), 'from', v_uid));
      perform private.rx_note(t.player_id, 'rx_gift', v_uid, jsonb_build_object('gx', x.gx, 'gy', x.gy));
      n := n + 1;
    end loop;
    if not exists (select 1 from public.rarity_visits where gx = x.gx and gy = x.gy and player_id = v_uid and day = private.rx_week() and kind = 'gift') then
      perform private.rx_golden(v_uid, jsonb_build_object('heart', jsonb_build_array(x.gx, x.gy), 'from', v_uid));
    end if;
    update public.rarity_powers set state = state || jsonb_build_object('gift_week', private.rx_week(), 'gifts', coalesce((state ->> 'gifts')::int, 0) + n, 'last_gift', jsonb_build_object('n', n, 'at', now()))
     where gx = x.gx and gy = x.gy;
    perform private.rx_log(x.gx, x.gy, 'gifted', jsonb_build_object('n', n));
    perform private.fairplay(v_uid, 'rx_gift', x.gx, x.gy, jsonb_build_object('n', n));
    r := jsonb_build_object('players', n);

  elsif p_action = 'decree' and x.rarity = 'throne_ink' then
    if s ->> 'decree_week' = private.rx_week() then raise exception 'already_this_week' using errcode = 'P0001'; end if;
    v_r := p_args ->> 'rule';
    if v_r is null or v_r not in ('minigames', 'shiny', 'ultras', 'peace') then raise exception 'invalid_rule' using errcode = 'P0001'; end if;
    update public.rarity_powers set state = state || jsonb_build_object('decree_week', private.rx_week(), 'rule', v_r, 'rule_until', now() + interval '7 days')
     where gx = x.gx and gy = x.gy;
    for t in select player_id from private.rx_neighbours(x.gx, x.gy, 300) loop
      perform private.rx_note(t.player_id, 'rx_decree', v_uid, jsonb_build_object('gx', x.gx, 'gy', x.gy, 'rule', v_r));
    end loop;
    perform private.rx_log(x.gx, x.gy, 'decreed', jsonb_build_object('rule', v_r));
    perform private.fairplay(v_uid, 'rx_decree', x.gx, x.gy, jsonb_build_object('rule', v_r));
    r := jsonb_build_object('rule', v_r);

  elsif p_action = 'call' and x.rarity = 'serpent_egg' then
    if s ->> 'call_week' = private.rx_week() then raise exception 'already_this_week' using errcode = 'P0001'; end if;
    select * into v_lev from public.leviathans where status in ('walking', 'enraged') order by spawned_at desc limit 1 for update;
    if v_lev.id is null then raise exception 'no_leviathan' using errcode = 'P0001'; end if;
    v_lev := private.lev_go(v_lev.id, jsonb_build_array(jsonb_build_array(round(private.lng_of(x.gx + 0.5)::numeric, 5), round(private.lat_of(x.gy + 0.5)::numeric, 5))), 1);
    update public.leviathans set data = (data - 'retreat') || jsonb_build_object('target', jsonb_build_object('gx', x.gx, 'gy', x.gy, 'owner_name', private.rx_name(v_uid), 'serpent', true))
     where id = v_lev.id;
    update public.rarity_powers set state = state || jsonb_build_object('call_week', private.rx_week(), 'called_at', now()) where gx = x.gx and gy = x.gy;
    perform private.rx_log(x.gx, x.gy, 'called', '{}'::jsonb);
    r := jsonb_build_object('called', true);

  elsif p_action = 'gaze' and x.rarity = 'world_eye' then
    if s ->> 'gaze_day' = private.today()::text then raise exception 'already_today' using errcode = 'P0001'; end if;
    v_n := private.rx_n('world_eye', 'cells', 12)::int;
    delete from public.rarity_spots where kind = 'glint' and owner_id = v_uid and src_gx = x.gx and src_gy = x.gy;
    for cx in x.gx - v_n .. x.gx + v_n loop
      for cy in greatest(x.gy - v_n, 0) .. least(x.gy + v_n, 4194303) loop
        select * into q from public.world_plots where gx = cx and gy = cy;
        continue when q.owner_id is not null or coalesce(q.locked, false);
        v_r := coalesce(q.rarity, private.plot_rarity_for(cx, cy));
        continue when v_r like 'crown%' or v_r = 'enchanted' or private.plot_rarity_rank(v_r) < private.plot_rarity_rank('epic');
        insert into public.rarity_spots (kind, gx, gy, owner_id, src_gx, src_gy, data, expires_at)
        values ('glint', cx, cy, v_uid, x.gx, x.gy, jsonb_build_object('rarity', v_r), now() + interval '24 hours');
        n := n + 1;
        exit when n >= 40;
      end loop;
      exit when n >= 40;
    end loop;
    update public.rarity_powers set state = state || jsonb_build_object('gaze_day', private.today()::text) where gx = x.gx and gy = x.gy;
    perform private.rx_log(x.gx, x.gy, 'gazed', jsonb_build_object('n', n));
    perform private.fairplay(v_uid, 'rx_gaze', x.gx, x.gy, jsonb_build_object('n', n));
    r := jsonb_build_object('glints', n);

  elsif p_action = 'shower' and x.rarity = 'fallen_star' then
    if s ->> 'shower_week' = private.rx_week() then raise exception 'already_this_week' using errcode = 'P0001'; end if;
    v_k := x.gx || ':' || x.gy || ':' || private.rx_week();
    for i in 1 .. private.rx_n('fallen_star', 'n', 30)::int loop
      c := private.ench_free_cell(x.gx, x.gy, 2, private.rx_cells(private.rx_n('fallen_star', 'm', 2000), x.gy));
      insert into public.rarity_spots (kind, gx, gy, owner_id, src_gx, src_gy, data, expires_at)
      values ('star', c[1], c[2], null, x.gx, x.gy, jsonb_build_object('shower', v_k), now() + make_interval(mins => private.rx_n('fallen_star', 'minutes', 20)::int));
      n := n + 1;
    end loop;
    update public.rarity_powers set state = state || jsonb_build_object('shower_week', private.rx_week(), 'shower', jsonb_build_object('key', v_k, 'until', now() + make_interval(mins => private.rx_n('fallen_star', 'minutes', 20)::int)))
     where gx = x.gx and gy = x.gy;
    for t in select player_id from private.rx_neighbours(x.gx, x.gy, 300) loop
      perform private.rx_note(t.player_id, 'rx_stars', v_uid, jsonb_build_object('gx', x.gx, 'gy', x.gy, 'n', n));
    end loop;
    perform private.rx_log(x.gx, x.gy, 'showered', jsonb_build_object('n', n));
    r := jsonb_build_object('stars', n);

  elsif p_action = 'rise' and x.rarity = 'genesis_well' then
    if s ->> 'rise_month' = private.rx_month() then raise exception 'already_month' using errcode = 'P0001'; end if;
    c := private.ench_free_cell(x.gx, x.gy, 3, 12);
    for i in 1 .. 200 loop
      exit when n >= private.rx_n('genesis_well', 'n', 25);
      cx := (c[1] + (floor(random() * 7) - 3)::int + 4194304) % 4194304; cy := least(greatest(c[2] + (floor(random() * 7) - 3)::int, 0), 4194303);
      continue when exists (select 1 from public.world_plots w where w.gx = cx and w.gy = cy and (w.owner_id is not null or w.locked));
      continue when exists (select 1 from public.rarity_spots s2 where s2.gx = cx and s2.gy = cy and s2.kind = 'genesis' and s2.expires_at > now());
      insert into public.rarity_spots (kind, gx, gy, owner_id, src_gx, src_gy, data, expires_at)
      values ('genesis', cx, cy, null, x.gx, x.gy, '{}'::jsonb, now() + make_interval(hours => private.rx_n('genesis_well', 'hours', 48)::int));
      n := n + 1;
    end loop;
    update public.rarity_powers set state = state || jsonb_build_object('rise_month', private.rx_month(), 'rose_at', now()) where gx = x.gx and gy = x.gy;
    for t in select player_id from private.rx_neighbours(x.gx, x.gy, 300) loop
      perform private.rx_note(t.player_id, 'rx_genesis', v_uid, jsonb_build_object('gx', c[1], 'gy', c[2], 'n', n));
    end loop;
    perform private.rx_log(x.gx, x.gy, 'rose', jsonb_build_object('n', n));
    r := jsonb_build_object('spots', n, 'gx', c[1], 'gy', c[2]);

  elsif p_action in ('place', 'open') and x.rarity in ('sunspot', 'rift') then
    if (x.rarity = 'sunspot') <> (p_action = 'place') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    cx := (p_args ->> 'gx')::int; cy := (p_args ->> 'gy')::int;
    if cx is null or cy is null or cx not between 0 and 4194303 or cy not between 0 and 4194303 then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
    if x.rarity = 'sunspot' then
      if s ->> 'place_day' = private.today()::text then raise exception 'already_today' using errcode = 'P0001'; end if;
      update public.rarity_powers set state = state || jsonb_build_object('place_day', private.today()::text, 'zone', jsonb_build_object('gx', cx, 'gy', cy, 'at', now()))
       where gx = x.gx and gy = x.gy;
      perform private.rx_log(x.gx, x.gy, 'placed', jsonb_build_object('gx', cx, 'gy', cy));
      r := jsonb_build_object('zone', jsonb_build_object('gx', cx, 'gy', cy));
    else
      if s ->> 'open_day' = private.today()::text then raise exception 'already_today' using errcode = 'P0001'; end if;
      update public.rarity_powers set state = state || jsonb_build_object('open_day', private.today()::text,
             'rift', jsonb_build_object('gx', cx, 'gy', cy, 'until', now() + make_interval(hours => private.rx_n('rift', 'hours', 24)::int)))
       where gx = x.gx and gy = x.gy;
      perform private.rx_log(x.gx, x.gy, 'tore', jsonb_build_object('gx', cx, 'gy', cy));
      r := jsonb_build_object('rift', jsonb_build_object('gx', cx, 'gy', cy));
    end if;
    perform private.fairplay(v_uid, 'rx_' || p_action, cx, cy, jsonb_build_object('from', jsonb_build_array(x.gx, x.gy)));

  elsif p_action = 'flip' and x.rarity = 'upside_down' then
    if s ->> 'flip_week' = private.rx_week() then raise exception 'already_this_week' using errcode = 'P0001'; end if;
    update public.rarity_powers set state = state || jsonb_build_object('flip_week', private.rx_week(), 'flip_until', now() + make_interval(mins => private.rx_n('upside_down', 'minutes', 60)::int))
     where gx = x.gx and gy = x.gy;
    perform private.rx_log(x.gx, x.gy, 'flipped', '{}'::jsonb);
    perform private.fairplay(v_uid, 'rx_flip', x.gx, x.gy, '{}'::jsonb);
    r := jsonb_build_object('until', now() + make_interval(mins => private.rx_n('upside_down', 'minutes', 60)::int));

  elsif p_action = 'transmute' and x.rarity = 'transmuter' then
    if s ->> 'day' = private.today()::text then raise exception 'already_today' using errcode = 'P0001'; end if;
    v_cells := p_args -> 'cells';
    if jsonb_typeof(v_cells) <> 'array' or jsonb_array_length(v_cells) <> 5 then raise exception 'pick_five' using errcode = 'P0001'; end if;
    if (select count(distinct (c2 ->> 0) || ':' || (c2 ->> 1)) from jsonb_array_elements(v_cells) c2) <> 5 then raise exception 'pick_five' using errcode = 'P0001'; end if;
    perform private.rent_settle(v_uid);
    for i in 0 .. 4 loop
      select * into q from public.world_plots where gx = (v_cells -> i ->> 0)::int and gy = (v_cells -> i ->> 1)::int for update;
      v_r := private.rx_why_not(v_uid, q);
      if v_r is not null then raise exception '%', v_r using errcode = 'P0001'; end if;
      if i = 0 then p := q; v_to := q.rarity; end if;
      if q.rarity <> v_to then raise exception 'same_rarity' using errcode = 'P0001'; end if;
    end loop;
    if array_position(private.rx_ladder(), v_to) is null or v_to = 'mythic' then raise exception 'cannot_transmute' using errcode = 'P0001'; end if;
    for i in 1 .. 4 loop
      select * into q from public.world_plots where gx = (v_cells -> i ->> 0)::int and gy = (v_cells -> i ->> 1)::int;
      perform private.rx_release(q, 'transmuted (Transmuter)');
    end loop;
    v_r := private.rx_up(v_to);
    perform private.rx_set_rarity(v_uid, p.gx, p.gy, v_r, 'transmuted');
    update public.rarity_powers set state = state || jsonb_build_object('day', private.today()::text, 'last', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'from', v_to, 'to', v_r, 'at', now()))
     where gx = x.gx and gy = x.gy;
    perform private.rx_log(x.gx, x.gy, 'transmuted', jsonb_build_object('from', v_to, 'to', v_r));
    perform private.fairplay(v_uid, 'rx_transmute', p.gx, p.gy, jsonb_build_object('from', v_to, 'to', v_r, 'cells', v_cells));
    r := jsonb_build_object('gx', p.gx, 'gy', p.gy, 'from', v_to, 'rarity', v_r);

  elsif p_action = 'roll' and x.rarity = 'doubling_cube' then
    if s ->> 'day' = private.today()::text then raise exception 'already_today' using errcode = 'P0001'; end if;
    select * into q from public.world_plots where gx = (p_args ->> 'gx')::int and gy = (p_args ->> 'gy')::int for update;
    v_r := private.rx_why_not(v_uid, q);
    if v_r is not null then raise exception '%', v_r using errcode = 'P0001'; end if;
    if array_position(private.rx_ladder(), q.rarity) is null or q.rarity = 'mythic' then raise exception 'cannot_roll' using errcode = 'P0001'; end if;
    v_to := case when random() < 0.5 then private.rx_up(q.rarity) else private.rx_down(q.rarity) end;
    if v_to <> q.rarity then perform private.rx_set_rarity(v_uid, q.gx, q.gy, v_to, 'cube'); end if;
    update public.rarity_powers set state = state || jsonb_build_object('day', private.today()::text, 'last', jsonb_build_object('gx', q.gx, 'gy', q.gy, 'from', q.rarity, 'to', v_to, 'up', private.plot_rarity_rank(v_to) > private.plot_rarity_rank(q.rarity), 'at', now()))
     where gx = x.gx and gy = x.gy;
    perform private.rx_log(x.gx, x.gy, 'rolled', jsonb_build_object('from', q.rarity, 'to', v_to));
    perform private.fairplay(v_uid, 'rx_cube', q.gx, q.gy, jsonb_build_object('from', q.rarity, 'to', v_to));
    r := jsonb_build_object('gx', q.gx, 'gy', q.gy, 'from', q.rarity, 'rarity', v_to, 'up', private.plot_rarity_rank(v_to) > private.plot_rarity_rank(q.rarity));

  elsif p_action = 'tz' and x.rarity = 'eleven' then
    v_tz := p_args ->> 'tz';
    if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'invalid_tz' using errcode = 'P0001'; end if;
    e := coalesce(s -> 'eleven', '{}'::jsonb);
    if e ? 'tz' and e ->> 'tz' <> v_tz and (e ->> 'tz_at')::timestamptz > now() - make_interval(days => private.rx_n('eleven', 'tz_days', 7)::int) then
      raise exception 'tz_locked' using errcode = 'P0001';
    end if;
    if not (e ? 'tz') or e ->> 'tz' <> v_tz then
      e := e || jsonb_build_object('tz', v_tz, 'tz_at', now());
      update public.rarity_powers set state = state || jsonb_build_object('eleven', e) where gx = x.gx and gy = x.gy;
      perform private.fairplay(v_uid, 'rx_tz', x.gx, x.gy, jsonb_build_object('tz', v_tz));
    end if;
    r := jsonb_build_object('tz', v_tz);

  elsif p_action = 'wish' and x.rarity = 'eleven' then
    e := coalesce(s -> 'eleven', '{}'::jsonb);
    if not (e ? 'tz') then raise exception 'no_tz' using errcode = 'P0001'; end if;
    v_key := private.rx_eleven_key(e ->> 'tz');
    if v_key is null then raise exception 'not_1111' using errcode = 'P0001'; end if;
    if e ->> 'last_key' = v_key then raise exception 'already_wished' using errcode = 'P0001'; end if;
    v_prev := private.rx_eleven_key(e ->> 'tz', private.rx_now() - interval '12 hours');
    v_streak := case when v_prev is not null and e ->> 'last_key' = v_prev then coalesce((e ->> 'streak')::int, 0) + 1 else 1 end;
    v_r := p_args ->> 'pick';
    if v_r = 'ink' then
      v_paid := private.rx_ink(v_uid, private.rx_n('eleven', 'ink', 111)::int + 11 * least(v_streak - 1, 20), x.gx || '_' || x.gy, 'wish:' || x.gx || ':' || x.gy || ':' || v_key);
      r := jsonb_build_object('ink', v_paid);
    elsif v_r = 'luck' then
      perform private.rx_luck(v_uid, private.rx_n('eleven', 'luck', 11)::int);
      r := jsonb_build_object('luck', private.rx_n('eleven', 'luck', 11)::int);
    elsif v_r = 'golden' then
      perform private.rx_golden(v_uid, jsonb_build_object('eleven', true));
      r := jsonb_build_object('golden', true);
    elsif v_r = 'ticket' then
      v_min := case when random() < 0.11 then 'legendary' else 'epic' end;
      perform private.ench_ticket(v_uid, v_min, 'eleven');
      r := jsonb_build_object('ticket', v_min);
    else raise exception 'invalid_wish' using errcode = 'P0001';
    end if;
    if v_streak % greatest(private.rx_n('eleven', 'streak', 11)::int, 1) = 0 then
      perform private.ench_ticket(v_uid, 'legendary', 'eleven_streak');
      r := r || jsonb_build_object('streak_ticket', 'legendary');
    end if;
    e := e || jsonb_build_object('last_key', v_key, 'streak', v_streak, 'wishes', coalesce((e ->> 'wishes')::int, 0) + 1, 'last', jsonb_build_object('pick', v_r, 'at', now(), 'key', v_key));
    update public.rarity_powers set state = state || jsonb_build_object('eleven', e) where gx = x.gx and gy = x.gy;
    perform private.rx_log(x.gx, x.gy, 'wished', jsonb_build_object('pick', v_r, 'streak', v_streak));
    perform private.fairplay(v_uid, 'rx_wish', x.gx, x.gy, jsonb_build_object('pick', v_r, 'key', v_key, 'tz', e ->> 'tz'));
    r := r || jsonb_build_object('streak', v_streak, 'pick', v_r);

  else
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  return jsonb_build_object('result', r, 'view', private.rx_view(x.gx, x.gy, v_uid));
end $$;

-- ⭐ catch a shooting star (anyone)
create or replace function public.rarity_catch(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.rarity_spots; x public.rarity_powers; n int; v jsonb; r numeric := random();
begin
  perform private.rate_limit('rarity_catch', 120, 600);
  delete from public.rarity_spots where id = p_id and kind = 'star' and expires_at > now() returning * into s;
  if s.id is null then raise exception 'gone' using errcode = 'P0001'; end if;
  select count(*) into n from public.rarity_visits where gx = s.src_gx and gy = s.src_gy and player_id = v_uid and kind = 'star' and day like (s.data ->> 'shower') || '%';
  if n >= 10 then raise exception 'caught_enough' using errcode = 'P0001'; end if;
  insert into public.rarity_visits (gx, gy, player_id, day, kind) values (s.src_gx, s.src_gy, v_uid, (s.data ->> 'shower') || ':' || s.id, 'star');
  if r < 0.7 then
    v := jsonb_build_object('ink', private.rx_ink(v_uid, private.rx_n('fallen_star', 'ink', 10)::int, s.src_gx || '_' || s.src_gy, 'star:' || s.id));
  elsif r < 0.95 then
    perform private.rx_luck(v_uid, private.rx_n('fallen_star', 'luck', 3)::int);
    v := jsonb_build_object('luck', private.rx_n('fallen_star', 'luck', 3)::int);
  else
    perform private.rx_golden(v_uid, jsonb_build_object('star', true));
    v := jsonb_build_object('golden', true);
  end if;
  select * into x from public.rarity_powers where gx = s.src_gx and gy = s.src_gy;
  if x.gx is not null then
    update public.rarity_powers set state = state || jsonb_build_object('caught', coalesce((state ->> 'caught')::int, 0) + 1) where gx = x.gx and gy = x.gy;
    select count(*) into n from public.rarity_visits where gx = x.gx and gy = x.gy and kind = 'star' and day like (s.data ->> 'shower') || '%';
    if x.owner_id <> v_uid and n * private.rx_n('fallen_star', 'tip', 2) <= private.rx_n('fallen_star', 'tip_cap', 60) then
      perform private.rx_ink(x.owner_id, private.rx_n('fallen_star', 'tip', 2)::int, x.gx || '_' || x.gy, 'startip:' || s.id);
    end if;
  end if;
  return v;
end $$;

-- your powers at a glance (badges, the 11:11 banner)
create or replace function public.my_powers() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(private.rx_view(x.gx, x.gy, v_uid) order by r.sort desc, x.since), '[]'::jsonb) into v
    from public.rarity_powers x join public.plot_rarities r on r.id = x.rarity where x.owner_id = v_uid;
  return v;
end $$;

-- what the map shows: your own powers' marks (yours only), and what the Primordials put out for everyone
create or replace function public.rarity_map(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_mine jsonb := '[]'::jsonb; v_spots jsonb; v_world jsonb;
begin
  if p_max_gx - p_min_gx > 200000 or p_max_gy - p_min_gy > 200000 then return jsonb_build_object('mine', '[]'::jsonb, 'spots', '[]'::jsonb, 'stars', '[]'::jsonb, 'genesis', '[]'::jsonb); end if;
  if v_uid is not null then
    select coalesce(jsonb_agg(jsonb_build_object('gx', x.gx, 'gy', x.gy, 'rarity', x.rarity, 'family', private.rx_family(x.rarity),
             'roots', x.state -> 'roots', 'beams', x.state -> 'beams', 'bees', case when (x.state ->> 'bees_at')::timestamptz > now() - interval '24 hours' then x.state -> 'bees' end,
             'zone', x.state -> 'zone', 'rift', case when (x.state -> 'rift' ->> 'until')::timestamptz > now() then x.state -> 'rift' end,
             'from', case when (x.state ->> 'galloped_at')::timestamptz > now() - interval '1 hour' then x.state -> 'from' end,
             'cells', case when x.rarity = 'glacier' then private.rx_n('glacier', 'cells', 8)::int end,
             'area_m', case when r.tier = 'primordial' then private.rx_area_m() end, 'm', case x.rarity when 'sunspot' then private.rx_n('sunspot', 'm', 1000) when 'rift' then private.rx_n('rift', 'm', 150) end,
             'flip_until', case when (x.state ->> 'flip_until')::timestamptz > now() then x.state ->> 'flip_until' end)), '[]'::jsonb) into v_mine
      from public.rarity_powers x join public.plot_rarities r on r.id = x.rarity where x.owner_id = v_uid;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'gx', s.gx, 'gy', s.gy, 'rarity', s.data ->> 'rarity',
             'in', greatest(0, round(extract(epoch from s.expires_at - now()))))), '[]'::jsonb) into v_spots
      from public.rarity_spots s where s.owner_id = v_uid and s.expires_at > now() and s.kind in ('obsidian', 'trail', 'mushroom', 'glint')
       and s.gx between p_min_gx and p_max_gx and s.gy between p_min_gy and p_max_gy;
  end if;
  select jsonb_build_object(
    'stars', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'gx', s.gx, 'gy', s.gy, 'in', greatest(0, round(extract(epoch from s.expires_at - now())))))
                        from public.rarity_spots s where s.kind = 'star' and s.expires_at > now() and s.gx between p_min_gx and p_max_gx and s.gy between p_min_gy and p_max_gy), '[]'::jsonb),
    'genesis', coalesce((select jsonb_agg(jsonb_build_array(s.gx, s.gy))
                        from public.rarity_spots s where s.kind = 'genesis' and s.expires_at > now() and s.gx between p_min_gx and p_max_gx and s.gy between p_min_gy and p_max_gy), '[]'::jsonb)) into v_world;
  return jsonb_build_object('mine', v_mine, 'spots', coalesce(v_spots, '[]'::jsonb)) || v_world;
end $$;

-- every Primordial in the world, for the map (they are few)
create or replace function public.primordials_world() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('plots', coalesce((
    select jsonb_agg(jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'owner_name', pr.username, 'mine', w.owner_id = auth.uid(),
             'open', case when w.rarity = 'void_gate' then private.rx_gate_open(w.gx) end) order by w.claimed_at)
      from public.world_plots w join public.plot_rarities r on r.id = w.rarity left join public.profiles pr on pr.id = w.owner_id
     where w.owner_id is not null and r.tier = 'primordial' and w.rarity = any (private.rx_primordials())), '[]'::jsonb),
    'last', coalesce((select max(id) from public.rarity_moments), 0))
$$;

-- the shockwaves: Primordials that came into the world since you last looked (the last quarter of an hour)
create or replace function public.rarity_moments(p_since bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('moments', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'gx', m.gx, 'gy', m.gy, 'rarity', m.rarity, 'how', m.how, 'place', m.place,
             'owner_name', pr.username, 'mine', m.player_id = auth.uid(), 'ago', round(extract(epoch from now() - m.created_at))) order by m.id)
      from (select * from public.rarity_moments where id > coalesce(p_since, 0) and created_at > now() - interval '15 minutes' order by id desc limit 10) m
      left join public.profiles pr on pr.id = m.player_id), '[]'::jsonb),
    'last', coalesce((select max(id) from public.rarity_moments), 0))
$$;

-- the tier: every Primordial, its odds, how many the world has (and you)
create or replace function public.primordial_tier() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tier_one_in', round(1000000000.0 / greatest((select sum(ppb) from public.plot_rarities where ppb > 0), 1)),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'emoji', r.emoji, 'color', r.color, 'glow', r.glow, 'ability', r.ability,
               'one_in', case when r.ppb > 0 then round(1000000000.0 / r.ppb) end,
               'world', (select count(*) from public.world_plots w where w.rarity = r.id and w.owner_id is not null),
               'mine', (select count(*) from public.world_plots w where w.rarity = r.id and w.owner_id = auth.uid())) order by r.sort)
       from public.plot_rarities r where r.tier = 'primordial'), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('rarity', m.rarity, 'how', m.how, 'place', m.place, 'owner_name', pr.username, 'at', m.created_at) order by m.id desc)
       from (select * from public.rarity_moments order by id desc limit 12) m left join public.profiles pr on pr.id = m.player_id), '[]'::jsonb))
$$;

-- the fusion book: every recipe (a secret one only once you've made it), and your ultras that could go in
create or replace function public.fusion_book() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return jsonb_build_object(
    'recipes', coalesce((select jsonb_agg(case when coalesce((f ->> 'secret')::boolean, false) and not exists (select 1 from public.player_fusions pf where pf.player_id = v_uid and pf.fusion = f ->> 'to')
                                 then jsonb_build_object('secret', true, 'to', null)
                                 else jsonb_build_object('a', f ->> 'a', 'b', f ->> 'b', 'to', f ->> 'to', 'secret', coalesce((f ->> 'secret')::boolean, false),
                                        'name', r.name, 'emoji', r.emoji, 'color', r.color, 'glow', r.glow, 'ability', r.ability,
                                        'made', coalesce((select n from public.player_fusions pf where pf.player_id = v_uid and pf.fusion = f ->> 'to'), 0)) end order by r.sort)
       from jsonb_array_elements(private.rx_cfg() -> 'fusions') f join public.plot_rarities r on r.id = f ->> 'to'), '[]'::jsonb),
    'ultras', coalesce((select jsonb_agg(jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'name', w.name, 'plot_type', w.plot_type, 'shiny', w.shiny,
               'why', private.rx_why_not(v_uid, w)) order by r.sort, w.claimed_at)
       from public.world_plots w join public.plot_rarities r on r.id = w.rarity
      where v_uid is not null and w.owner_id = v_uid and r.tier = 'ultra' and w.rarity not like 'crown%'), '[]'::jsonb),
    'per_day', coalesce((private.rx_cfg() ->> 'fuse_per_day')::int, 10));
end $$;

-- two of your ultras become a fusion; any three become a random Primordial. The first plot keeps everything (its
-- drawing, its name, its level); the others go back to the world.
create or replace function public.ultra_fuse(p_cells jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); n int; i int; p public.world_plots; q public.world_plots; v_ids text[] := '{}'; v_to text; v_why text; f jsonb; v_rel jsonb := '[]'::jsonb;
begin
  perform private.rate_limit('ultra_fuse', coalesce((private.rx_cfg() ->> 'fuse_per_day')::int, 10), 86400);
  if jsonb_typeof(p_cells) <> 'array' then raise exception 'pick_two_or_three' using errcode = 'P0001'; end if;
  n := jsonb_array_length(p_cells);
  if n not in (2, 3) then raise exception 'pick_two_or_three' using errcode = 'P0001'; end if;
  if (select count(distinct (c ->> 0) || ':' || (c ->> 1)) from jsonb_array_elements(p_cells) c) <> n then raise exception 'pick_two_or_three' using errcode = 'P0001'; end if;
  for i in 0 .. n - 1 loop
    select * into q from public.world_plots where gx = (p_cells -> i ->> 0)::int and gy = (p_cells -> i ->> 1)::int for update;
    v_why := private.rx_why_not(v_uid, q);
    if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
    if not exists (select 1 from public.plot_rarities r where r.id = q.rarity and r.tier = 'ultra') or q.rarity like 'crown%' then raise exception 'not_an_ultra' using errcode = 'P0001'; end if;
    if i = 0 then p := q; end if;
    v_ids := v_ids || q.rarity;
  end loop;
  if n = 2 then
    select x into f from jsonb_array_elements(private.rx_cfg() -> 'fusions') x
     where (x ->> 'a', x ->> 'b') = (least(v_ids[1], v_ids[2]), greatest(v_ids[1], v_ids[2])) limit 1;
    if f is null then raise exception 'no_recipe' using errcode = 'P0001'; end if;
    v_to := f ->> 'to';
  else
    v_to := private.rx_pick_primordial(null);
  end if;
  perform private.rent_settle(v_uid);
  for i in 1 .. n - 1 loop
    select * into q from public.world_plots where gx = (p_cells -> i ->> 0)::int and gy = (p_cells -> i ->> 1)::int;
    perform private.rx_release(q, 'fused into ' || (select name from public.plot_rarities where id = v_to));
    v_rel := v_rel || jsonb_build_array(jsonb_build_array(q.gx, q.gy));
  end loop;
  perform private.rx_set_rarity(v_uid, p.gx, p.gy, v_to, 'fused');
  if n = 2 then
    insert into public.player_fusions (player_id, fusion) values (v_uid, v_to) on conflict (player_id, fusion) do update set n = public.player_fusions.n + 1;
  end if;
  perform private.rx_sync(p.gx, p.gy);
  perform private.fairplay(v_uid, 'rx_fuse', p.gx, p.gy, jsonb_build_object('from', to_jsonb(v_ids), 'to', v_to, 'released', v_rel));
  return jsonb_build_object('rarity', v_to, 'gx', p.gx, 'gy', p.gy, 'released', v_rel, 'triple', n = 3,
                            'rarity_info', (select to_jsonb(r) from public.plot_rarities r where r.id = v_to), 'rent', private.rent_json(v_uid),
                            'achievements', private.evaluate_achievements(v_uid));
end $$;

-- 🌅 the First Light over your land, if there is one
create or replace function public.first_light_for_me() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select (select jsonb_build_object('gx', x.gx, 'gy', x.gy, 'owner_name', pr.username, 'name', w.name, 'art_path', a.thumb_path, 'mine', x.owner_id = auth.uid())
            from public.rarity_powers x join public.world_plots w on w.gx = x.gx and w.gy = x.gy
            join public.artwork_publications a on a.id = w.art_publication_id left join public.profiles pr on pr.id = x.owner_id
           where x.rarity = 'first_light' and auth.uid() is not null and (x.owner_id = auth.uid() or private.rx_near(auth.uid(), x.gx, x.gy))
           order by x.owner_id = auth.uid() desc, x.since limit 1)
$$;

do $$
declare f text;
begin
  foreach f in array array['public.rarity_power(integer, integer)', 'public.rarity_act(integer, integer, text, jsonb)', 'public.rarity_catch(bigint)',
                           'public.my_powers()', 'public.rarity_map(integer, integer, integer, integer)', 'public.primordials_world()',
                           'public.rarity_moments(bigint)', 'public.primordial_tier()', 'public.fusion_book()', 'public.ultra_fuse(jsonb)', 'public.first_light_for_me()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
