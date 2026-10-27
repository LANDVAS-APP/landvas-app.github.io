// Plot rarities: five tiers fixed per cell by a deterministic hash, so the map
// can color every plot before anyone claims it. Mirrors private.plot_rarity_for
// in supabase/migrations/20261026000002_core_functions.sql exactly.
import { mix } from './grid';

export type RarityId = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

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
};

/** Defaults identical to the seed migration (used until world_config loads). */
export const DEFAULT_RARITIES: RarityInfo[] = [
  { id: 'common', name: 'Common', weight: 500, usd_per_second: 0.0000000011, ink_reward_multiplier: 1, price_multiplier: 1, color: '#3DDC97', glow: '#A6FFD6', sort: 1 },
  { id: 'rare', name: 'Rare', weight: 300, usd_per_second: 0.0000000016, ink_reward_multiplier: 1.15, price_multiplier: 1, color: '#2FB8FF', glow: '#B3E5FF', sort: 2 },
  { id: 'epic', name: 'Epic', weight: 140, usd_per_second: 0.0000000022, ink_reward_multiplier: 1.35, price_multiplier: 1, color: '#A45CFF', glow: '#DABDFF', sort: 3 },
  { id: 'legendary', name: 'Legendary', weight: 50, usd_per_second: 0.0000000044, ink_reward_multiplier: 1.7, price_multiplier: 1, color: '#FFB31F', glow: '#FFE3A1', sort: 4 },
  { id: 'mythic', name: 'Mythic', weight: 10, usd_per_second: 0.0000000088, ink_reward_multiplier: 2.25, price_multiplier: 1, color: '#FF3D9A', glow: '#FFC4E1', sort: 5 },
];

export const RARITY_ORDER: RarityId[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

let table: RarityInfo[] = DEFAULT_RARITIES;
let byId = new Map<RarityId, RarityInfo>(DEFAULT_RARITIES.map((r) => [r.id, r]));

/** Install the server's rarity table (weights, rates, colors). */
export function setRarities(list: RarityInfo[] | undefined | null) {
  if (!list?.length) return;
  table = [...list]
    .map((r) => ({ ...r, weight: Number(r.weight), usd_per_second: Number(r.usd_per_second), ink_reward_multiplier: Number(r.ink_reward_multiplier), price_multiplier: Number(r.price_multiplier), sort: Number(r.sort) }))
    .sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : 1));
  byId = new Map(table.map((r) => [r.id, r]));
}

export function rarities() {
  return table;
}

export function rarityInfo(id: RarityId | string | null | undefined): RarityInfo {
  return byId.get(id as RarityId) ?? table[0];
}

/** Deterministic rarity of a cell. */
export function rarityFor(gx: number, gy: number, list: RarityInfo[] = table): RarityId {
  let total = 0;
  for (const r of list) if (r.weight > 0) total += r.weight;
  if (total === 0) return 'common';
  const roll = mix(gx + 40503, gy * 3 + 977) % total;
  let acc = 0;
  for (const r of list) {
    if (r.weight <= 0) continue;
    acc += r.weight;
    if (roll < acc) return r.id;
  }
  return 'common';
}

/** Rent of one plot in USD/second (1% per level above 1 by default). */
export function plotRent(rarity: RarityId | string, level = 1, levelBonus = 0.01) {
  return rarityInfo(rarity).usd_per_second * (1 + levelBonus * (Math.max(level, 1) - 1));
}
