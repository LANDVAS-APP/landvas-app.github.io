// The restaurant's shapes (the server's private.rdin_* works these out; the app just plays the shift).
export type Dish = { name: string; emoji: string; station: string; seconds: number; price: number; in: Record<string, number>; level: number };
export type StationCfg = { name: string; emoji: string; level: number; cost: number[]; speed_cost: number };
export type DinerCfg = {
  shift_seconds: number; patience: number; burn_seconds: number; tray: number; special_mult: number; ink_per_tips: number;
  crew_tips_per_hour: number; crew_cap_hours: number;
  tables: { start: number; max: number; cost: number[] };
  decor: { names: string[]; cost: number[]; tip_bonus: number; patience_bonus: number };
  crew: { names: string[]; cost: number[] };
  stations: Record<string, StationCfg>; speed_max: number; speed_step: number;
  dishes: Record<string, Dish>; pantry: Record<string, number>; pantry_free: Record<string, number>;
};
export type DinerCore = {
  stations: Record<string, { n: number; speed: number }>; tables: number; decor: number; crew: number; crew_at: string; crew_pending: number;
  shifts: number; served: number; best_tips: number; pantry_ready: boolean; menu: string[]; patience: number; cfg: DinerCfg; server_time: string;
};
export type Customer = { i: number; at: number; order: string[]; look: number };
export type Shift = { id: string; menu: string[]; customers: Customer[]; special: string; seconds: number; patience: number; secs: Record<string, number> };
export type ShiftResult = { served: number; customers: number; tips: number; stars: number; used: Record<string, number>; ink: number; best: boolean };

export const STATION_ORDER = ['coffee', 'griddle', 'oven', 'blender', 'stove'];
/** the counter's slots, left to right: every station you own (up to two of each) */
export function slots(st: DinerCore['stations']) {
  const out: { kind: string; n: number }[] = [];
  for (const k of STATION_ORDER) for (let n = 0; n < (st[k]?.n ?? 0); n++) out.push({ kind: k, n });
  return out;
}
/** the tip a table pays (the same sum the server does): more for speed, decor bonus, the dish of the day double */
export function tipFor(order: string[], waitMs: number, patienceS: number, decor: number, cfg: DinerCfg, special: string) {
  const base = order.reduce((s, d) => s + cfg.dishes[d].price * (d === special ? cfg.special_mult : 1), 0);
  return base * (1 + 0.5 * Math.max(0, 1 - waitMs / (patienceS * 1000))) * (1 + decor * cfg.decor.tip_bonus);
}
