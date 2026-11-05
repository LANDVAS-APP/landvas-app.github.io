// House party games: each one plays to a finish with legal moves, refuses illegal ones, and hands out valid places.
import { describe, expect, it } from 'vitest';
import { PARTY, ckLegal, dec } from '../../src/home/party/games';
import { rng, type Seat } from '../../src/home/party/kit';

const seats = (n: number): Seat[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, slot: i, name: `P${i}`, color: '#fff', p: {} as never }));
function play(id: string, n: number, seed: number, mover: (s: any, ids: string[], r: () => number, now: number) => [string, unknown] | null, maxMs = 30 * 60_000) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const def = PARTY[id], ss = seats(n), s = def.init(ss, seed), r = rng(seed * 7 + 1);
  let now = 0, res = null;
  while (!(res = def.result(s)) && now < maxMs) {
    now += 250;
    def.tick?.(s, now);
    const mv = mover(s, ss.map((x) => x.id), r, now);
    if (mv) def.move(s, mv[0], mv[1], now);
    JSON.stringify(def.view ? def.view(s) : s);
  }
  return { res, now, s, ids: ss.map((x) => x.id) };
}
const validPlaces = (res: Record<string, number> | null, ids: string[]) => {
  expect(res).not.toBeNull();
  expect(Object.keys(res!).sort()).toEqual([...ids].sort());
  expect(Object.values(res!)).toContain(1);
  for (const v of Object.values(res!)) expect(v).toBeGreaterThanOrEqual(1);
};

describe('house party games', () => {
  it('Four in a Row: alternate turns, refuse full columns, someone wins (or it fills up)', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { res, ids } = play('fourrow', 2, seed, (s, ids, r) => [ids[s.turn], { c: Math.floor(r() * 7) }]);
      validPlaces(res, ids);
    }
    const def = PARTY.fourrow, s = def.init(seats(2), 1);
    expect(def.move(s, 'p1', { c: 0 }, 0)).toBe(false); // not your turn
    for (let i = 0; i < 6; i++) def.move(s, s.ids[s.turn], { c: 0 }, 0);
    expect(def.move(s, s.ids[s.turn], { c: 0 }, 0)).toBe(false); // full
  });
  it('Checkers: only legal moves, jumps are forced, the game ends', () => {
    for (const seed of [1, 5, 9]) {
      const { res, ids } = play('checkers', 2, seed, (s, ids, r) => { const l = ckLegal(s); if (!l.length) return null; const m = l[Math.floor(r() * l.length)]; return [ids[s.turn], { from: m.from, to: m.to }]; });
      validPlaces(res, ids);
    }
    const def = PARTY.checkers, s = def.init(seats(2), 1);
    expect(def.move(s, 'p0', { from: 40, to: 24 }, 0)).toBe(false);
  });
  it('Dots & Boxes: 2 and 4 players, boxes all claimed, idle turns play themselves', () => {
    for (const n of [2, 3, 4]) {
      const { res, ids, s } = play('dots', n, n, (s, ids, r) => { if (r() < 0.2) return null; const free = s.h.map((x: number, i: number) => (x < 0 ? ['h', i] : null)).concat(s.v.map((x: number, i: number) => (x < 0 ? ['v', i] : null))).filter(Boolean); const f = free[Math.floor(r() * free.length)]; return f ? [ids[s.turn], { k: f[0], i: f[1] }] : null; });
      validPlaces(res, ids);
      expect(s.pts.reduce((a: number, b: number) => a + b, 0)).toBe(s.n * s.n);
    }
  });
  it('Ladders & Slides: someone lands on 100', () => {
    for (const n of [2, 6]) { const { res, ids, s } = play('ladders', n, n * 3, (s, ids) => [ids[s.turn], { roll: true }]); validPlaces(res, ids); expect(s.pos).toContain(100); }
  });
  it('Doodle Guess: the artist draws, right guesses score, every player draws once', () => {
    const { res, ids, s } = play('doodle', 4, 11, (s, ids, r) => {
      if (s.phase !== 'draw') return null;
      const drawer = ids[s.drawer];
      if (r() < 0.3) return [drawer, { k: 'pts', sid: `a${s.round}`, c: '#000000', w: 6, p: [r() * 1000, r() * 1000, r() * 1000, r() * 1000] }];
      const g = ids.filter((x) => x !== drawer)[Math.floor(r() * 3)];
      return [g, { k: 'guess', t: r() < 0.15 ? dec(s.wz) : 'nope' }];
    });
    validPlaces(res, ids);
    expect(s.round).toBe(4);
    expect(Object.values(s.pts).some((v: any) => v > 0)).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
    // the artist can't guess, and guesses aren't drawing
    const def = PARTY.doodle, t = def.init(seats(3), 2);
    expect(def.move(t, 'p0', { k: 'guess', t: dec(t.wz) }, 5000)).toBe(false);
    expect(def.move(t, 'p1', { k: 'clear' }, 5000)).toBe(false);
  });
  it('Colour Rush: one answer each a round, first right answer scores most', () => {
    const def = PARTY.rush, s = def.init(seats(3), 4);
    def.tick!(s, 5000);
    const right = s.ask === 'ink' ? s.ink : s.word, wrong = s.choices.find((c: number) => c !== right);
    expect(def.move(s, 'p0', { k: 'tap', r: s.round, c: right }, 5100)).toBe(true);
    expect(def.move(s, 'p0', { k: 'tap', r: s.round, c: right }, 5150)).toBe(false);
    def.move(s, 'p1', { k: 'tap', r: s.round, c: right }, 5200);
    def.move(s, 'p2', { k: 'tap', r: s.round, c: wrong }, 5300);
    expect(s.pts).toEqual({ p0: 3, p1: 1, p2: 0 });
    const { res, ids } = play('rush', 5, 9, (s, ids, r) => (s.phase === 'ask' ? [ids[Math.floor(r() * ids.length)], { k: 'tap', r: s.round, c: s.choices[Math.floor(r() * 4)] }] : null));
    validPlaces(res, ids);
  });
});
