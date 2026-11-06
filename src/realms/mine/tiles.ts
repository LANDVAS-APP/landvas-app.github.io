// What's in every tile of a Crystal Mine, worked out from the mine's seed exactly as the server does
// (private.mine_hash / mine_tile / mine_hp), so the app can draw the rock and the server can check every dig.
export type MineCfg = {
  width: number; max_depth: number;
  energy: { base: number; per_tank: number; regen_per_min: number; regen_per_level: number };
  layers: { from: number; id: string; name: string; base: string; hp: number }[];
  specials: { k: string; from: number; w: number }[];
  tiles: Record<string, { hp: number; loot: Record<string, [number, number]>; burn?: number }>;
  tools: Record<string, { name: string; emoji: string; blurb: string; max: number; cost: number; growth: number }>;
  dynamite: { cost: number; max: number };
  geode: { crystal: [number, number]; gem_chance: number; find_chance: number; xp: number };
  depth_ink: { every: number; ink: number };
};
export type MineCore = {
  energy: number; energy_max: number; rate: number; deepest: number; dug: number[]; tools: Record<string, number>;
  tool_costs: Record<string, number | null>; dynamite: number; dug_count: number; cfg: MineCfg;
};

const P = 2147483647;
export function mineHash(seed: number, x: number, y: number) {
  let h = ((seed % P) + x * 92821 + y * 68917 + 12345) % P;
  for (let i = 0; i < 3; i++) h = (h * 48271) % P;
  return h;
}
export function mineTile(seed: number, x: number, y: number, c: MineCfg) {
  const r = mineHash(seed, x, y) % 10000;
  let acc = 0;
  for (const s of c.specials) if (y >= s.from) { acc += s.w; if (r < acc) return s.k; }
  let base = 'dirt';
  for (const l of c.layers) if (y >= l.from) base = l.base;
  return base;
}
const BASES = new Set(['dirt', 'stone', 'deep', 'cave_rock', 'magma', 'ruin', 'cave', 'lava']);
export function layerAt(y: number, c: MineCfg) { let l = c.layers[0]; for (const x of c.layers) if (y >= x.from) l = x; return l; }
export function mineHp(y: number, kind: string, c: MineCfg) {
  const own = c.tiles[kind]?.hp ?? 1;
  return Math.max(0, own + (BASES.has(kind) ? 0 : layerAt(y, c).hp));
}
/** energy a tile costs to dig with this pickaxe */
export function digCost(y: number, kind: string, c: MineCfg, pick: number) {
  const hp = mineHp(y, kind, c);
  return (hp === 0 ? 0 : Math.max(1, hp - Math.floor(pick / 2))) + (kind === 'lava' ? (c.tiles.lava?.burn ?? 3) : 0);
}
export const TILE_INFO: Record<string, { name: string; emoji?: string; color: string; speck?: string; glow?: string }> = {
  dirt: { name: 'Dirt', color: '#7A5434', speck: '#5E3F25' },
  stone: { name: 'Stone', color: '#7D7A76', speck: '#5F5C58' },
  deep: { name: 'Deep rock', color: '#4F4C5C', speck: '#3C3948' },
  cave_rock: { name: 'Cavern rock', color: '#3E3A5E', speck: '#5C4FA0' },
  magma: { name: 'Magma rock', color: '#4A2A22', speck: '#9A3A1A' },
  ruin: { name: 'Ruin stone', color: '#6A6450', speck: '#C9A85A' },
  cave: { name: 'Cave', color: '#000000' },
  copper: { name: 'Copper ore', emoji: '🟠', color: '#7D7A76', speck: '#D9822B' },
  iron: { name: 'Iron ore', emoji: '⚫', color: '#6E6A66', speck: '#C9B9A9' },
  silver: { name: 'Silver ore', emoji: '⚪', color: '#55525E', speck: '#E8EEF6' },
  crystal: { name: 'Crystal', emoji: '🔮', color: '#3E3A5E', speck: '#C59BFF', glow: '#B57BFF' },
  gem: { name: 'Rare gem', emoji: '💎', color: '#3E3A5E', speck: '#5FE3FF', glow: '#5FE3FF' },
  geode: { name: 'Geode', emoji: '🪨', color: '#8C7A9A', speck: '#E3C9FF' },
  fossil: { name: 'Fossil', emoji: '🦴', color: '#9A8A6A', speck: '#F4EEDF' },
  chest: { name: 'Buried chest', emoji: '🧰', color: '#7A5434', speck: '#E8B83E', glow: '#FFD23F' },
  lava: { name: 'Lava pocket', emoji: '🔥', color: '#C2410C', speck: '#FFB13D', glow: '#FF6A1F' },
  relic: { name: 'Ancient relic', emoji: '🏺', color: '#6A6450', speck: '#FFD98A', glow: '#FFD98A' },
};
