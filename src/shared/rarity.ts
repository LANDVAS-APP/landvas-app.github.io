// Plot rarities, fixed per cell on the server (private.plot_rarity_for, salted with a secret so nobody can predict
// them) and revealed when a plot is claimed. Six on the usual table (Common … Mythic, with Uncommon), and six ultra
// rarities on their own one-in-thousands roll, each with its own way of earning (see `ability`).

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'solar' | 'lunar' | 'comet' | 'ancient' | 'prismatic' | 'genesis' | 'chaos' | 'phoenix' | 'crown' | 'kraken' | 'gemini' | 'mirror' | 'singularity' | 'crown_state' | 'crown_country' | 'enchanted'
  | NewUltraId | FusionId | PrimordialId;

// ---- the Ultra Expansion: nine ultras that change the land around them, the fusions, and the Primordials ---------------
export const NEW_ULTRAS = ['volcano', 'world_tree', 'phantom', 'wanderer', 'lodestone', 'leyline', 'glacier', 'mycelium', 'hive'] as const;
export const FUSIONS = ['eclipse', 'eternal_flame', 'constellation', 'kaleidoscope', 'krakatoa', 'elder_tree', 'shooting_star', 'doppelganger', 'compass_rose'] as const;
export const PRIMORDIALS = ['heart_world', 'throne_ink', 'serpent_egg', 'world_eye', 'void_gate', 'first_light', 'fallen_star', 'genesis_well', 'chrysalis',
  'hourglass', 'sunspot', 'eleven', 'loom', 'upside_down', 'midas', 'chain', 'transmuter', 'doubling_cube', 'rift'] as const;
export type NewUltraId = (typeof NEW_ULTRAS)[number];
export type FusionId = (typeof FUSIONS)[number];
export type PrimordialId = (typeof PRIMORDIALS)[number];
export const isPrimordial = (r: string | null | undefined): r is PrimordialId => !!r && (PRIMORDIALS as readonly string[]).includes(r);
export const isFusion = (r: string | null | undefined): r is FusionId => !!r && (FUSIONS as readonly string[]).includes(r);
/** a rarity whose plot carries a power (the new ultras, the fusions that work with one, every Primordial) */
export const hasPower = (r: string | null | undefined) => !!r && ((NEW_ULTRAS as readonly string[]).includes(r) || ['krakatoa', 'elder_tree', 'shooting_star', 'doppelganger', 'compass_rose'].includes(r) || isPrimordial(r));


export type RarityInfo = {
  id: RarityId;
  name: string;
  weight: number;
  usd_per_second: number;
  ink_reward_multiplier: number;
  price_multiplier: number;
  color: string;
  glow: string;
  sort: number;
  /** ultra rarities: parts per million (their own roll) */
  ppm?: number;
  emoji?: string | null;
  /** what an ultra rarity does with the rent it earns */
  ability?: string | null;
  /** 'ultra', 'fusion' or 'primordial' (null for the everyday table) */
  tier?: 'ultra' | 'fusion' | 'primordial' | null;
  /** Primordials: parts per billion (their own roll) */
  ppb?: number;
};

/** Defaults identical to the seed migration (used until world_config loads). */
export const DEFAULT_RARITIES: RarityInfo[] = [
  { id: 'common', name: 'Common', weight: 350, usd_per_second: 0.0000000011, ink_reward_multiplier: 1, price_multiplier: 1, color: '#3DDC97', glow: '#A6FFD6', sort: 1 },
  { id: 'uncommon', name: 'Uncommon', weight: 150, usd_per_second: 0.0000000013, ink_reward_multiplier: 1.07, price_multiplier: 1, color: '#2DD4BF', glow: '#B2F5EA', sort: 2 },
  { id: 'rare', name: 'Rare', weight: 300, usd_per_second: 0.0000000016, ink_reward_multiplier: 1.15, price_multiplier: 1, color: '#2FB8FF', glow: '#B3E5FF', sort: 3 },
  { id: 'epic', name: 'Epic', weight: 140, usd_per_second: 0.0000000022, ink_reward_multiplier: 1.35, price_multiplier: 1, color: '#A45CFF', glow: '#DABDFF', sort: 4 },
  { id: 'legendary', name: 'Legendary', weight: 50, usd_per_second: 0.0000000044, ink_reward_multiplier: 1.7, price_multiplier: 1, color: '#FFB31F', glow: '#FFE3A1', sort: 5 },
  { id: 'mythic', name: 'Mythic', weight: 10, usd_per_second: 0.0000000088, ink_reward_multiplier: 2.25, price_multiplier: 1, color: '#FF3D9A', glow: '#FFC4E1', sort: 6 },
  { id: 'solar', name: 'Solar', weight: 0, ppm: 400, emoji: '☀️', ability: 'Earns ×3 rent while the sun is up where it really is on Earth.', usd_per_second: 0.000000012, ink_reward_multiplier: 2.5, price_multiplier: 1, color: '#FF9F1C', glow: '#FFE08A', sort: 7 },
  { id: 'lunar', name: 'Lunar', weight: 0, ppm: 400, emoji: '🌙', ability: 'Earns ×3 rent while it’s night where it really is on Earth.', usd_per_second: 0.000000012, ink_reward_multiplier: 2.5, price_multiplier: 1, color: '#8FA8FF', glow: '#E1E8FF', sort: 8 },
  { id: 'comet', name: 'Comet', weight: 0, ppm: 200, emoji: '☄️', ability: 'Once a day its comet passes: ×30 rent for a whole hour.', usd_per_second: 0.000000015, ink_reward_multiplier: 2.8, price_multiplier: 1, color: '#22E3FF', glow: '#C9F8FF', sort: 9 },
  { id: 'ancient', name: 'Ancient', weight: 0, ppm: 100, emoji: '🏛️', ability: 'Grows +3% rent for every day you own it, up to ×6.', usd_per_second: 0.00000002, ink_reward_multiplier: 3, price_multiplier: 1, color: '#C9A66B', glow: '#F1E2BF', sort: 10 },
  { id: 'prismatic', name: 'Prismatic', weight: 0, ppm: 10, emoji: '🌈', ability: 'Every plot you own earns +5% more (stacks, up to +50%).', usd_per_second: 0.00000003, ink_reward_multiplier: 3.5, price_multiplier: 1, color: '#FF7AE0', glow: '#FFFFFF', sort: 11 },
  { id: 'genesis', name: 'Genesis', weight: 0, ppm: 2, emoji: '🌌', ability: 'One in half a million. Every plot you own earns +25% more.', usd_per_second: 0.0000003, ink_reward_multiplier: 5, price_multiplier: 1, color: '#FFFFFF', glow: '#FFD6FF', sort: 12 },
  { id: 'chaos', name: 'Chaos', weight: 0, ppm: 300, emoji: '🎲', ability: 'Its rent multiplier re-rolls every day: anywhere from ×0 to ×20.', usd_per_second: 0.00000001, ink_reward_multiplier: 2.8, price_multiplier: 1, color: '#FF2E63', glow: '#FFE14D', sort: 13 },
  { id: 'phoenix', name: 'Phoenix', weight: 0, ppm: 300, emoji: '🔥', ability: 'Grows with your daily streak: +10% rent for every day in a row you check in — all the way to a 365-day streak (×37.5). Miss a day and it falls to ashes.', usd_per_second: 0.000000012, ink_reward_multiplier: 3, price_multiplier: 1, color: '#FF5A1F', glow: '#FFD166', sort: 14 },
  { id: 'crown', name: 'City Crown', weight: 0, ppm: 0, emoji: '👑', ability: 'One per city. Its holder picks a share of the city: 1% of all the Ink every other player with land there earns, or 1% of all their rent. Locked for a month once picked.', usd_per_second: 0.00000005, ink_reward_multiplier: 4, price_multiplier: 1, color: '#FFD23F', glow: '#FFF4B8', sort: 15 },
  { id: 'kraken', name: 'Kraken', weight: 0, ppm: 200, emoji: '🐙', ability: 'Lurks under the map and drags in the rent around it: +75% for every other player’s plot within about 200 m, up to ×20.', usd_per_second: 0.000000015, ink_reward_multiplier: 3.2, price_multiplier: 1, color: '#0EA5A4', glow: '#99F6E4', sort: 23 },
  { id: 'gemini', name: 'Gemini', weight: 0, ppm: 250, emoji: '♊', ability: 'Comes alive in pairs: on its own an ordinary ultra, but own two Gemini plots and each earns ×12.', usd_per_second: 0.000000014, ink_reward_multiplier: 3, price_multiplier: 1, color: '#F472B6', glow: '#FBCFE8', sort: 24 },
  { id: 'mirror', name: 'Mirror', weight: 0, ppm: 100, emoji: '🪞', ability: 'Copies the rent of your best other plot — pair it with an ultra and it earns like one.', usd_per_second: 0.000000015, ink_reward_multiplier: 3.2, price_multiplier: 1, color: '#7DD3FC', glow: '#F0F9FF', sort: 19 },
  { id: 'singularity', name: 'Singularity', weight: 0, ppm: 1, emoji: '🕳️', ability: 'One in a million. Bends everything around it: every plot you own earns double.', usd_per_second: 0.000001, ink_reward_multiplier: 8, price_multiplier: 1, color: '#B4FF39', glow: '#F2FFD6', sort: 20 },
  { id: 'crown_state', name: 'State Crown', weight: 0, ppm: 0, emoji: '👑', ability: 'One per state or province. Its holder picks a share of the state: 1% of all the Ink every other player with land there earns, or 1% of all their rent. Locked for a month once picked.', usd_per_second: 0.0000002, ink_reward_multiplier: 6, price_multiplier: 1, color: '#C084FC', glow: '#F5D0FE', sort: 21 },
  { id: 'enchanted', name: 'Enchanted', weight: 0, ppm: 0, emoji: '✨', ability: 'An enchantment lives here instead of a rarity — open the Grimoire to wield it.', usd_per_second: 0.0000000011, ink_reward_multiplier: 1.2, price_multiplier: 1, color: '#B26BFF', glow: '#F0DBFF', sort: 30 },
  { id: 'crown_country', name: 'Country Crown', weight: 0, ppm: 0, emoji: '👑', ability: 'One per country. Its holder picks a share of the country: 1% of all the Ink every other player with land there earns, or 1% of all their rent. Locked for a month once picked.', usd_per_second: 0.0000008, ink_reward_multiplier: 10, price_multiplier: 1, color: '#F43F5E', glow: '#FFE4E6', sort: 22 },
];

const X = (id: RarityId, name: string, emoji: string, color: string, glow: string, sort: number, tier: 'ultra' | 'fusion' | 'primordial', usd: number, ink: number, odds: number, ability: string): RarityInfo =>
  ({ id, name, emoji, color, glow, sort, tier, weight: 0, usd_per_second: usd, ink_reward_multiplier: ink, price_multiplier: 1, ability,
     ppm: tier === 'ultra' ? odds : 0, ppb: tier === 'primordial' ? odds : 0 });
DEFAULT_RARITIES.push(
  X('volcano', 'Volcano', '🌋', '#F97316', '#FED7AA', 31, 'ultra', 1.4e-8, 3, 150, 'Erupts once a day: obsidian only you can claim for an hour, each a tier higher.'),
  X('world_tree', 'World Tree', '🌳', '#22C55E', '#BBF7D0', 32, 'ultra', 1.4e-8, 3, 150, 'Roots grow toward your other plots; they pay 10% more in minigames.'),
  X('phantom', 'Phantom', '👻', '#A5B4FC', '#EEF2FF', 33, 'ultra', 1.5e-8, 3.1, 120, 'A Common to everyone but you; each night it whispers a reading.'),
  X('wanderer', 'Wanderer', '🦄', '#F0ABFC', '#FAE8FF', 34, 'ultra', 1.5e-8, 3.1, 120, 'Gallops to a new spot every day and leaves a rainbow trail.'),
  X('lodestone', 'Lodestone', '🧲', '#EF4444', '#FECACA', 35, 'ultra', 1.4e-8, 3, 150, 'Pulls in chests, gathers Ink, drags out more Leviathan loot.'),
  X('leyline', 'Leyline', '⚡', '#38BDF8', '#E0F2FE', 36, 'ultra', 1.5e-8, 3.2, 100, 'A beam to your farthest plot; spots under it roll a tier higher.'),
  X('glacier', 'Glacier', '🧊', '#67E8F9', '#ECFEFF', 37, 'ultra', 1.4e-8, 3, 150, 'Freezes the land around it: nothing tramples, latches or pranks it.'),
  X('mycelium', 'Mycelium', '🍄', '#A3E635', '#ECFCCB', 38, 'ultra', 1.4e-8, 3, 150, 'Mushrooms creep onto nearby spots; they roll a tier higher.'),
  X('hive', 'Hive', '🐝', '#FACC15', '#FEF9C3', 39, 'ultra', 1.4e-8, 3, 150, 'Bees pollinate your neighbours and bring you honey.'),
  X('eclipse', 'Eclipse', '🌗', '#6D28D9', '#FDE68A', 41, 'fusion', 1.2e-8, 3.5, 0, 'Solar + Lunar: ×4.5 rent day and night.'),
  X('eternal_flame', 'Eternal Flame', '🕯️', '#FB923C', '#FFF7ED', 42, 'fusion', 2e-8, 3.8, 0, 'Phoenix + Ancient: a streak that never burns out, growing every day.'),
  X('constellation', 'Constellation', '✨', '#F9A8D4', '#FFFFFF', 43, 'fusion', 1.4e-8, 3.8, 0, 'Two Geminis made one: ×26, forever.'),
  X('kaleidoscope', 'Kaleidoscope', '🎆', '#F43F5E', '#A5F3FC', 44, 'fusion', 1.5e-8, 3.8, 0, 'A secret fusion: Chaos and Mirror at once.'),
  X('krakatoa', 'Krakatoa', '🏝️', '#EA580C', '#5EEAD4', 45, 'fusion', 1.5e-8, 3.6, 0, 'Volcano + Kraken: erupts twice as wide, twice a day.'),
  X('elder_tree', 'Elder Tree', '🌲', '#15803D', '#D9F99D', 46, 'fusion', 2e-8, 3.6, 0, 'World Tree + Ancient: roots twice as far, to twice as many plots.'),
  X('shooting_star', 'Shooting Star', '💫', '#C084FC', '#E0F2FE', 47, 'fusion', 1.5e-8, 3.6, 0, 'Wanderer + Comet: gallops ten times as far.'),
  X('doppelganger', 'Doppelgänger', '👥', '#94A3B8', '#F1F5F9', 48, 'fusion', 1.5e-8, 3.6, 0, 'A secret fusion: it shows the world any rarity you choose.'),
  X('compass_rose', 'Compass Rose', '🧭', '#E11D48', '#BAE6FD', 49, 'fusion', 1.5e-8, 3.6, 0, 'Lodestone + Leyline: beams to up to 8 of your plots.'),
  X('heart_world', 'Heart of the World', '🌍', '#E11D48', '#FFE4E6', 51, 'primordial', 8e-7, 6, 330, 'A weekly Golden Hour for everyone with land within 5 km.'),
  X('throne_ink', 'Throne of Ink', '📜', '#7C3AED', '#FDE68A', 52, 'primordial', 8e-7, 6, 330, 'Sets a weekly rule for the land within 5 km.'),
  X('serpent_egg', 'Serpent’s Egg', '🐉', '#059669', '#A7F3D0', 53, 'primordial', 8e-7, 6, 330, 'Calls the Leviathan; your land is never trampled; more loot.'),
  X('world_eye', 'World’s Eye', '👁️', '#0EA5E9', '#E0F2FE', 54, 'primordial', 8e-7, 6, 330, 'Sees every Phantom nearby, and the best empty land around it.'),
  X('void_gate', 'Void Gate', '🌑', '#4C1D95', '#C4B5FD', 55, 'primordial', 8e-7, 6, 330, 'Opens every evening: a free roll for anyone nearby who steps through.'),
  X('first_light', 'First Light', '🌅', '#F59E0B', '#FFFBEB', 56, 'primordial', 8e-7, 6, 330, 'Your drawing greets every player within 5 km when they open the game.'),
  X('fallen_star', 'Fallen Star', '⭐', '#FDE047', '#FFFFFF', 57, 'primordial', 8e-7, 6, 330, 'A weekly shower of shooting stars anyone can catch.'),
  X('genesis_well', 'Genesis Well', '🌀', '#10B981', '#FEF08A', 58, 'primordial', 8e-7, 6, 330, 'Monthly new land where ultras come 3× as often.'),
  X('chrysalis', 'Chrysalis', '🦋', '#A78BFA', '#FCE7F3', 59, 'primordial', 8e-7, 6, 330, 'Hatches into a random Primordial after 30 days.'),
  X('hourglass', 'Hourglass of Ages', '⏳', '#D97706', '#FEF3C7', 60, 'primordial', 8e-7, 6, 330, 'Your enchantments within 5 km run twice as fast.'),
  X('sunspot', 'Sunspot', '🔆', '#FB923C', '#FFEDD5', 61, 'primordial', 8e-7, 6, 330, 'Your own Hot Zone, placed anywhere once a day.'),
  X('eleven', 'Eleven-Eleven', '🌠', '#F472B6', '#FDF2F8', 62, 'primordial', 8e-7, 6, 330, 'A wish at 11:11, morning and night, in your own time zone.'),
  X('loom', 'The Loom', '🧵', '#EC4899', '#FCE7F3', 63, 'primordial', 8e-7, 6, 330, 'Every claim is rolled twice; you keep the better.'),
  X('upside_down', 'Upside Down', '🙃', '#14B8A6', '#CCFBF1', 64, 'primordial', 8e-7, 6, 330, 'Flips the rarity table for an hour a week.'),
  X('midas', 'Midas Hand', '🖐️', '#EAB308', '#FEF9C3', 65, 'primordial', 8e-7, 6, 330, 'Wins can turn your plots a tier higher.'),
  X('chain', 'Chain Reaction', '⛓️', '#F43F5E', '#FFE4E6', 66, 'primordial', 8e-7, 6, 330, 'Claims can chain into free spots beside them.'),
  X('transmuter', 'Transmuter', '⚗️', '#8B5CF6', '#DDD6FE', 67, 'primordial', 8e-7, 6, 330, 'Five plots of a rarity into one of the next tier.'),
  X('doubling_cube', 'Doubling Cube', '🎰', '#0F172A', '#FDE047', 68, 'primordial', 8e-7, 6, 330, 'Double or nothing on a plot, once a day.'),
  X('rift', 'Rift', '🌐', '#6366F1', '#E0E7FF', 69, 'primordial', 8e-7, 6, 330, 'Claim around a rift anywhere in the world, as if you were there.'),
);

export const RARITY_ORDER: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity', ...NEW_ULTRAS, ...FUSIONS, ...PRIMORDIALS];
/** what the roll's reel spins through: everything that can be rolled (not the fusions, which are only made) */
export const ROLL_ORDER: RarityId[] = RARITY_ORDER.filter((r) => !(FUSIONS as readonly string[]).includes(r));
export const ULTRA: RarityId[] = ['solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity', ...NEW_ULTRAS, ...FUSIONS, ...PRIMORDIALS];
/** the three Crowns: one per city, state and country */
export const CROWNS: RarityId[] = ['crown', 'crown_state', 'crown_country'];
export const isUltra = (r: string | null | undefined) => ULTRA.includes(r as RarityId);
/** How "big" a rarity is for visuals (0 Common/Uncommon · 1 Rare · 2 Epic · 3 Legendary · 4 Mythic · 5 the ultras · 6 the Primordials). */
export function rarityTier(r: string | null | undefined) {
  return ({ common: 0, uncommon: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 } as Record<string, number>)[r ?? 'common'] ?? (isPrimordial(r) ? 6 : isUltra(r) ? 5 : 0);
}
/** "35%" / "1 in 2,500" */
export function rarityOdds(r: RarityId | string) {
  const i = rarityInfo(r);
  if (i.id === 'crown') return '1 per city';
  if (i.id === 'crown_state') return '1 per state';
  if (i.id === 'crown_country') return '1 per country';
  if (i.ppb) return `1 in ${Math.round(1_000_000_000 / i.ppb).toLocaleString()}`;
  if (i.tier === 'fusion' || isFusion(i.id)) return 'Fusion only';
  if (i.ppm) return `1 in ${Math.round(1_000_000 / i.ppm).toLocaleString()}`;
  const total = table.reduce((s, x) => s + (Number(x.weight) || 0), 0) || 1000;
  const pct = (i.weight / total) * 100;
  return pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}

let table: RarityInfo[] = DEFAULT_RARITIES;
let byId = new Map<RarityId, RarityInfo>(DEFAULT_RARITIES.map((r) => [r.id, r]));

/** Install the server's rarity table (weights, rates, colors). */
export function setRarities(list: RarityInfo[] | undefined | null) {
  if (!list?.length) return;
  table = [...list]
    .map((r) => ({ ...r, weight: Number(r.weight), usd_per_second: Number(r.usd_per_second), ink_reward_multiplier: Number(r.ink_reward_multiplier), price_multiplier: Number(r.price_multiplier), sort: Number(r.sort), ppm: Number(r.ppm ?? 0), ppb: Number(r.ppb ?? 0) }))
    .sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : 1));
  byId = new Map(table.map((r) => [r.id, r]));
}

export function rarities() {
  return table;
}

export function rarityInfo(id: RarityId | string | null | undefined): RarityInfo {
  return byId.get(id as RarityId) ?? table[0];
}

/** Rent of one plot in USD/second (1% per level above 1 by default). */
export function plotRent(rarity: RarityId | string, level = 1, levelBonus = 0.01) {
  return rarityInfo(rarity).usd_per_second * (1 + levelBonus * (Math.max(level, 1) - 1));
}
