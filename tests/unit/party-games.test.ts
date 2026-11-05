// House party games: each one plays to a finish with legal moves, refuses illegal ones, and hands out valid places.
import { describe, expect, it } from 'vitest';
import { ckLegal, dec } from '../../src/home/party/games';
import { enc } from '../../src/home/party/kit';
import { PARTY } from '../../src/home/party/index';
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

  it('Scribble Chain: every chain gets written, drawn and guessed, then votes decide', () => {
    for (const n of [3, 4, 6]) {
      const { res, ids, s } = play('chain', n, n, (s, ids, r) => {
        if (s.phase === 'vote') { const voter = ids.find((id) => !s.votes[id]); if (!voter) return null; const key = s.chains.flatMap((ch: any[], ci: number) => ch.map((l: any, k: number) => ({ l, key: `${ci}:${k}` }))).find((x: any) => x.l.d && x.l.by !== voter)?.key; return key ? [voter, { k: 'vote', c: key }] : null; } // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!['write', 'draw', 'guess'].includes(s.phase) || r() < 0.3) return null;
        const who = ids[Math.floor(r() * ids.length)];
        return [who, s.phase === 'draw' ? { k: 'draw', d: [{ c: '#000000', w: 6, p: [1, 2, 300, 400, 900, 900] }] } : { k: 'text', t: 'a cat on a skateboard' }];
      });
      validPlaces(res, ids);
      expect(s.chains.every((ch: unknown[]) => ch.length === s.steps)).toBe(true);
      expect(s.steps % 2).toBe(1); // ends on a guess
      // what goes over the wire mid-game drops old drawings
    }
    const def = PARTY.chain, t = def.init(seats(5), 3);
    for (const id of t.ids) def.move(t, id, { k: 'text', t: 'hello there' }, 100);
    expect(t.phase).toBe('draw');
    expect(def.move(t, 'p0', { k: 'text', t: 'no' }, 200)).toBe(false);
  });
  it('Word Spy: one spy, clues in turn, votes catch (or miss) them', () => {
    const def = PARTY.spy, s = def.init(seats(4), 8);
    const spyId = dec(s.spy);
    expect(dec(s.wz)).not.toBe(dec(s.sz));
    expect(def.move(s, s.ids[(s.turn + 1) % 4], { k: 'clue', t: 'x' }, 10)).toBe(false); // not your turn
    expect(def.move(s, s.ids[s.turn], { k: 'clue', t: s.ids[s.turn] === spyId ? dec(s.sz) : dec(s.wz) }, 10)).toBe(false); // not the word itself
    while (s.phase === 'clue') def.move(s, s.ids[s.turn], { k: 'clue', t: 'thing' }, 20);
    expect(s.clues.length).toBe(8); // two laps for four players
    for (const id of s.ids) def.move(s, id, { k: 'vote', who: id === spyId ? s.ids.find((x: string) => x !== spyId) : spyId }, 30);
    expect(s.caught).toBe(true);
    expect(s.pts[spyId]).toBe(0);
    for (const id of s.ids.filter((x: string) => x !== spyId)) expect(s.pts[id]).toBe(3);
    const { res, ids } = play('spy', 6, 2, (s, ids, r) => (s.phase === 'clue' ? [ids[s.turn], { k: 'clue', t: 'hmm' }] : s.phase === 'vote' ? [ids[Math.floor(r() * 6)], { k: 'vote', who: ids[Math.floor(r() * 6)] }] : null));
    validPlaces(res, ids);
  });
  it('Same Brain: matching answers score for each match', () => {
    const def = PARTY.samebrain, s = def.init(seats(4), 1);
    def.move(s, 'p0', { k: 'say', t: 'Pepperoni' }, 10); def.move(s, 'p1', { k: 'say', t: 'pepperonis!' }, 10);
    def.move(s, 'p2', { k: 'say', t: 'pepperoni' }, 10); def.move(s, 'p3', { k: 'say', t: 'pineapple' }, 10);
    expect(s.phase).toBe('reveal');
    expect(s.pts).toEqual({ p0: 2, p1: 2, p2: 2, p3: 0 });
    const { res, ids } = play('samebrain', 5, 3, (s, ids, r) => (s.phase === 'answer' ? [ids[Math.floor(r() * 5)], { k: 'say', t: ['cheese', 'ham', 'olives'][Math.floor(r() * 3)] }] : null));
    validPlaces(res, ids);
  });
  it('Bluff Buffet: the truth is in the options, fooling people pays', () => {
    const def = PARTY.bluff, s = def.init(seats(3), 5);
    const truth = (globalThis as any).__noop ?? null; void truth; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(def.move(s, 'p0', { k: 'lie', t: 'spoons' }, 10)).toBe(true);
    def.move(s, 'p1', { k: 'lie', t: 'forks' }, 10); def.move(s, 'p2', { k: 'lie', t: 'ladles' }, 10);
    expect(s.phase).toBe('pick');
    expect(s.opts.length).toBeGreaterThanOrEqual(4);
    const fork = s.opts.findIndex((o: any) => dec(o.t) === 'forks'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const spoon = s.opts.findIndex((o: any) => dec(o.t) === 'spoons'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(def.move(s, 'p1', { k: 'pick', o: fork }, 20)).toBe(false); // not your own
    def.move(s, 'p0', { k: 'pick', o: fork }, 20); def.move(s, 'p1', { k: 'pick', o: spoon }, 20);
    const real = s.opts.findIndex((o: any) => !o.by.length && ['spoon', 'banana', 'seven', 'pickles', 'Tuesday', 'a wizard'].indexOf(dec(o.t)) < 0); // eslint-disable-line @typescript-eslint/no-explicit-any
    def.move(s, 'p2', { k: 'pick', o: real }, 20);
    expect(s.pts).toEqual({ p0: 2, p1: 2, p2: 3 });
    void enc;
    const { res, ids } = play('bluff', 4, 6, (s, ids, r) => (s.phase === 'write' ? [ids[Math.floor(r() * 4)], { k: 'lie', t: `fake${Math.floor(r() * 3)}` }] : s.phase === 'pick' ? [ids[Math.floor(r() * 4)], { k: 'pick', o: Math.floor(r() * s.opts.length) }] : null));
    validPlaces(res, ids);
  });
});
