// LAND GRAB live: loops claim land, crossing an opponent's wet trail cuts them, teammates share land, co-op clears maps.
import { describe, expect, it } from 'vitest';
import { landgrab, type LG } from '../../src/arcade/live/landgrab';
import type { ArenaMode, Inp, LP } from '../../src/arcade/live/kit';

const players = (n: number, mode: ArenaMode): LP[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, slot: i, team: mode === 'teams' ? i % 2 : null, name: `P${i}`, color: '#fff' }));
const STILL: Inp = { x: 0, y: 0, b: false };
const dir = (d: 'r' | 'l' | 'u' | 'd'): Inp => ({ x: d === 'r' ? 1 : d === 'l' ? -1 : 0, y: d === 'd' ? 1 : d === 'u' ? -1 : 0, b: false });
const own = (w: LG, o: number) => [...w.g].filter((c) => c === String(o)).length;
/** steer one player along a path of moves (one cell each), everyone else still */
function walk(w: LG, id: string, moves: string, others: Record<string, Inp> = {}) {
  for (const m of moves) {
    const p = w.ps[id], x0 = p.x, y0 = p.y;
    for (let k = 0; k < 60 && p.x === x0 && p.y === y0; k++) landgrab.step(w, { ...others, [id]: dir(m as 'r') }, 1 / 30);
  }
  for (let k = 0; k < 10; k++) landgrab.step(w, { ...others, [id]: STILL }, 1 / 30);
}

describe('LAND GRAB live', () => {
  it('a loop off your land and back claims what it closed off', () => {
    const w = landgrab.init(players(2, 'ffa'), 3, 'ffa');
    w.sm = []; // (no smudges for this one)
    const before = own(w, 0);
    expect(before).toBe(9);
    walk(w, 'p0', 'rrrrddddllll' + 'u');
    expect(own(w, 0)).toBeGreaterThan(before + 12);
    expect(w.ps.p0.trail).toHaveLength(0);
  });

  it('crossing someone’s wet trail cuts them (their trail dries up, they’re back where they stepped off)', () => {
    const w = landgrab.init(players(2, 'duel'), 5, 'duel');
    w.sm = [];
    const b = w.ps.p1;
    for (const p of Object.values(w.ps)) p.inv = 0;
    walk(w, 'p1', 'uuuuuuuuuu');
    expect(b.trail.length).toBeGreaterThan(5);
    const cell = b.trail[3], cx = cell % w.gw, cy = Math.floor(cell / w.gw);
    // p0 walks into that trail cell
    const a = w.ps.p0;
    a.inv = 0; b.inv = 0;
    const path = `${'r'.repeat(Math.max(0, cx - a.x))}${'d'.repeat(Math.max(0, cy - a.y))}`;
    walk(w, 'p0', path, { p1: STILL });
    expect(b.trail).toHaveLength(0);
    expect(a.cuts).toBe(1);
  });

  it('2v2: teammates share their land', () => {
    const w = landgrab.init(players(4, 'teams'), 9, 'teams');
    expect(w.ps.p0.own).toBe(w.ps.p2.own);
    expect(w.ps.p1.own).toBe(w.ps.p3.own);
    expect(own(w, 0)).toBe(18);
  });

  it('co-op: one land; closing off 70% together clears the map and opens the next', () => {
    const w = landgrab.init(players(2, 'coop'), 4, 'coop');
    w.sm = [];
    // fake most of the map being yours, then one small loop finishes it
    for (let i = 0; i < w.land!.length; i++) if (Math.floor(i / w.gw) < 22) w.land![i] = 0;
    landgrab.step(w, { p0: STILL, p1: STILL }, 1 / 30);
    expect(w.map).toBe(2);
    expect(w.cleared).toBe(1);
  });

  it('the snapshot leaves out the host-only arrays and stays small', () => {
    const w = landgrab.init(players(4, 'ffa'), 2, 'ffa');
    const s = landgrab.snap!(w) as Record<string, unknown>;
    expect(s).not.toHaveProperty('land');
    expect(s).not.toHaveProperty('tr');
    expect(JSON.stringify(s).length).toBeLessThan(3000);
  });
});
