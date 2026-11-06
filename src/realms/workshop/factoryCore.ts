// The workshop factory's rules, the same steps as the server's private.rfac_solve: every piece points one way (belts
// carry items on, machines push what they make out the front); flows settle cell by cell; a machine makes as much
// as its scarcest input allows (up to its rate); a belt carries at most belt_cap a minute; crates collect.
export type Piece = { name: string; emoji: string; kind: 'belt' | 'source' | 'machine' | 'dock'; out?: string; rate?: number; in?: Record<string, number>; cost: number; level: number };
export type FactoryCfg = { size_by_level: [number, number][]; cap_hours: number; belt_cap: number; pieces: Record<string, Piece> };
export type Cell = { t: string; d: number };
export type Grid = Record<string, Cell>;
export type Solve = { income: Record<string, number>; cells: Record<string, { out: Record<string, number>; status: 'ok' | 'starved' | 'spilling' }> };
export type FactoryCore = {
  grid: Grid; owned: Record<string, number>; rates: Record<string, number>; pending: Record<string, number>; collected_at: string; shipped: Record<string, number>;
  size: number; solve: Solve; cfg: FactoryCfg; server_time: string;
};

export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const key = (x: number, y: number) => `${x},${y}`;
export const parse = (k: string) => k.split(',').map(Number) as [number, number];
export const next = (k: string, d: number) => { const [x, y] = parse(k); return key(x + DX[d], y + DY[d]); };
const add = (a: Record<string, number>, b: Record<string, number> | undefined, k = 1) => { const o = { ...a }; for (const [n, v] of Object.entries(b ?? {})) o[n] = (o[n] ?? 0) + v * k; for (const n of Object.keys(o)) if (o[n] <= 1e-6) delete o[n]; return o; };

export function solve(grid: Grid, cfg: FactoryCfg): Solve {
  const keys = Object.keys(grid).sort(), pc = cfg.pieces;
  if (!keys.length) return { income: {}, cells: {} };
  const feeds: Record<string, string[]> = {};
  for (const k of keys) { const p = pc[grid[k].t]; if (!p || p.kind === 'dock') continue; const n = next(k, grid[k].d); if (grid[n]) (feeds[n] ??= []).push(k); }
  let outs: Record<string, Record<string, number>> = {}; const ins: Record<string, Record<string, number>> = {};
  for (let it = 1; it <= keys.length + 2; it++) {
    const nouts: typeof outs = {};
    for (const k of keys) {
      const p = pc[grid[k].t]; if (!p) continue;
      let vin: Record<string, number> = {};
      for (const n of feeds[k] ?? []) vin = add(vin, outs[n]);
      if (it === keys.length + 2) ins[k] = vin;
      let vout: Record<string, number> = {};
      if (p.kind === 'source') vout = { [p.out!]: p.rate! };
      else if (p.kind === 'belt') { const tot = Object.values(vin).reduce((s, v) => s + v, 0); vout = tot > cfg.belt_cap ? add({}, vin, cfg.belt_cap / tot) : vin; }
      else if (p.kind === 'machine') { let r = p.rate!; for (const [n, v] of Object.entries(p.in ?? {})) r = Math.min(r, (vin[n] ?? 0) / v); vout = r > 1e-6 ? { [p.out!]: r } : {}; }
      nouts[k] = vout;
    }
    outs = nouts;
  }
  let income: Record<string, number> = {}; const cells: Solve['cells'] = {};
  for (const k of keys) {
    const p = pc[grid[k].t]; if (!p) continue;
    if (p.kind === 'dock') income = add(income, ins[k]);
    const o = outs[k] ?? {}, any = Object.keys(o).length > 0;
    cells[k] = { out: o, status: p.kind === 'machine' && !any ? 'starved' : p.kind !== 'dock' && any && !grid[next(k, grid[k].d)] ? 'spilling' : 'ok' };
  }
  return { income: Object.fromEntries(Object.entries(income).map(([k, v]) => [k, Math.round(v * 1e4) / 1e4])), cells };
}
export const countPieces = (g: Grid) => { const o: Record<string, number> = {}; for (const c of Object.values(g)) o[c.t] = (o[c.t] ?? 0) + 1; return o; };
