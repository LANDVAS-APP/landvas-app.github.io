// Sky Island's rules shared with the server: the weather (from the island's seed and the clock, exactly as
// private.rsky_weather_at), hex maths, and what a building has made so far (for the counters between refreshes).
export type SkyBuilding = { name: string; emoji: string; makes: string | null; per_hour: number; cost: number; level: number; weather: string | null };
export type SkyWeather = { id: string; name: string; emoji: string };
export type SkyCfg = {
  cap_hours: number; neighbour_bonus: number; garden_bonus: number; weather_mult: number; weather_minutes: number;
  upgrade: { max: number; rate_per_level: number; cost_mult: number };
  buildings: Record<string, SkyBuilding>; weathers: SkyWeather[];
  orders: { slots: number; wait_minutes: number; reroll_minutes: number };
};
export type SkyTile = { b?: string; lv?: number; at?: string };
export type SkyOrder = { id: string; needs: Record<string, number>; reward: number; xp: number; ink: number; ready_at: string; balloon: string };
export type SkyCore = {
  tiles: Record<string, SkyTile>; stored: Record<string, number>; orders: SkyOrder[]; deliveries: number;
  weather: { now: SkyWeather; next: SkyWeather; ends_at: string }; radius: number; expand_cost: number; reroll_ready: boolean;
  prod_mult: number; cfg: SkyCfg; server_time: string;
};

const P = 2147483647;
export function weatherAt(seed: number, block: number) {
  let h = ((seed % P) + (block % 1000000) * 7919 + 4242) % P;
  for (let i = 0; i < 3; i++) h = (h * 48271) % P;
  return h % 6;
}
export const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
export const key = (q: number, r: number) => `${q},${r}`;
export const parse = (k: string) => k.split(',').map(Number) as [number, number];
export const dist = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
export const neighbours = (k: string) => { const [q, r] = parse(k); return DIRS.map(([dq, dr]) => key(q + dq, r + dr)); };
/** hex centre in the world (pointy-top, size 1) */
export const hexXZ = (q: number, r: number, size = 1) => ({ x: size * Math.sqrt(3) * (q + r / 2), z: size * 1.5 * r });

export function storedNow(core: SkyCore, k: string, nowMs: number) {
  const t = core.tiles[k]; if (!t?.b || !t.at) return 0;
  const b = core.cfg.buildings[t.b]; if (!b?.makes) return 0;
  const h = Math.min(core.cfg.cap_hours, (nowMs - Date.parse(t.at)) / 3600000);
  let mult = 1;
  for (const n of neighbours(k)) { const o = core.tiles[n]?.b; if (o === t.b) mult += core.cfg.neighbour_bonus; if (o === 'garden') mult += core.cfg.garden_bonus; }
  return Math.max(0, b.per_hour * (1 + core.cfg.upgrade.rate_per_level * ((t.lv ?? 1) - 1)) * mult * (1 + core.prod_mult) * h);
}
export function frontier(core: SkyCore) {
  const out = new Set<string>();
  for (const k of Object.keys(core.tiles)) for (const n of neighbours(k)) { const [q, r] = parse(n); if (!core.tiles[n] && dist(q, r) <= core.radius) out.add(n); }
  return [...out];
}
