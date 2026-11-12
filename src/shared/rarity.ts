// Plot rarities, fixed per cell on the server (private.plot_rarity_for, salted with a secret so nobody can predict
// them) and revealed when a plot is claimed. Six on the usual table (Common … Mythic, with Uncommon), and six ultra
// rarities on their own one-in-thousands roll, each with its own way of earning (see `ability`).

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'solar' | 'lunar' | 'comet' | 'ancient' | 'prismatic' | 'genesis' | 'chaos' | 'phoenix' | 'crown' | 'kraken' | 'gemini' | 'mirror' | 'singularity' | 'crown_state' | 'crown_country' | 'enchanted';

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
  { id: 'crown', name: 'City Crown', weight: 0, ppm: 0, emoji: '👑', ability: 'One per city. Its holder earns ×1.5 on all their rent — at full strength once 5 other players own land in the city.', usd_per_second: 0.00000005, ink_reward_multiplier: 4, price_multiplier: 1, color: '#FFD23F', glow: '#FFF4B8', sort: 15 },
  { id: 'kraken', name: 'Kraken', weight: 0, ppm: 200, emoji: '🐙', ability: 'Lurks under the map and drags in the rent around it: +75% for every other player’s plot within about 200 m, up to ×20.', usd_per_second: 0.000000015, ink_reward_multiplier: 3.2, price_multiplier: 1, color: '#0EA5A4', glow: '#99F6E4', sort: 23 },
  { id: 'gemini', name: 'Gemini', weight: 0, ppm: 250, emoji: '♊', ability: 'Comes alive in pairs: on its own an ordinary ultra, but own two Gemini plots and each earns ×12.', usd_per_second: 0.000000014, ink_reward_multiplier: 3, price_multiplier: 1, color: '#F472B6', glow: '#FBCFE8', sort: 24 },
  { id: 'mirror', name: 'Mirror', weight: 0, ppm: 100, emoji: '🪞', ability: 'Copies the rent of your best other plot — pair it with an ultra and it earns like one.', usd_per_second: 0.000000015, ink_reward_multiplier: 3.2, price_multiplier: 1, color: '#7DD3FC', glow: '#F0F9FF', sort: 19 },
  { id: 'singularity', name: 'Singularity', weight: 0, ppm: 1, emoji: '🕳️', ability: 'One in a million. Bends everything around it: every plot you own earns double.', usd_per_second: 0.000001, ink_reward_multiplier: 8, price_multiplier: 1, color: '#B4FF39', glow: '#F2FFD6', sort: 20 },
  { id: 'crown_state', name: 'State Crown', weight: 0, ppm: 0, emoji: '👑', ability: 'One per state or province. Its holder earns ×5 on all their rent — at full strength once 25 other players own land in the state.', usd_per_second: 0.0000002, ink_reward_multiplier: 6, price_multiplier: 1, color: '#C084FC', glow: '#F5D0FE', sort: 21 },
  { id: 'enchanted', name: 'Enchanted', weight: 0, ppm: 0, emoji: '✨', ability: 'An enchantment lives here instead of a rarity — open the Grimoire to wield it.', usd_per_second: 0.0000000011, ink_reward_multiplier: 1.2, price_multiplier: 1, color: '#B26BFF', glow: '#F0DBFF', sort: 30 },
  { id: 'crown_country', name: 'Country Crown', weight: 0, ppm: 0, emoji: '👑', ability: 'One per country. Its holder earns ×10 on all their rent — at full strength once 100 other players own land in the country.', usd_per_second: 0.0000008, ink_reward_multiplier: 10, price_multiplier: 1, color: '#F43F5E', glow: '#FFE4E6', sort: 22 },
];

export const RARITY_ORDER: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity'];
export const ULTRA: RarityId[] = ['solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity'];
/** the three Crowns: one per city, state and country */
export const CROWNS: RarityId[] = ['crown', 'crown_state', 'crown_country'];
export const isUltra = (r: string | null | undefined) => ULTRA.includes(r as RarityId);
/** How "big" a rarity is for visuals (0 Common/Uncommon · 1 Rare · 2 Epic · 3 Legendary · 4 Mythic · 5 the ultras). */
export function rarityTier(r: string | null | undefined) {
  return ({ common: 0, uncommon: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 } as Record<string, number>)[r ?? 'common'] ?? (isUltra(r) ? 5 : 0);
}
/** "35%" / "1 in 2,500" */
export function rarityOdds(r: RarityId | string) {
  const i = rarityInfo(r);
  if (i.id === 'crown') return '1 per city';
  if (i.id === 'crown_state') return '1 per state';
  if (i.id === 'crown_country') return '1 per country';
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
    .map((r) => ({ ...r, weight: Number(r.weight), usd_per_second: Number(r.usd_per_second), ink_reward_multiplier: Number(r.ink_reward_multiplier), price_multiplier: Number(r.price_multiplier), sort: Number(r.sort), ppm: Number(r.ppm ?? 0) }))
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
