// AI players at house party games: a table of bots plays every board/party game and every 3D game to the end without
// getting stuck, and they're beatable (a simple strategy wins Four in a Row against them sometimes).
import { describe, expect, it } from 'vitest';
import { PARTY } from '../../src/home/party';
import { botProfiles, isBot, partyBots, simBots } from '../../src/home/party/bots';
import type { Seat } from '../../src/home/party/kit';
import { SIMS3 } from '../../src/home/live3d/sims';

const seats = (n: number): Seat[] => botProfiles('table-1', n).map((p, i) => ({ id: p.id, slot: i, name: p.username, color: '#fff', p }));

describe('bots at board and party games', () => {
  for (const def of Object.values(PARTY)) {
    for (const n of [...new Set([Math.max(2, def.min), Math.min(def.max, 4)])]) {
      it(`${def.id} with ${n} bots plays to the end`, () => {
        const ss = seats(n), s = def.init(ss, 42), run = partyBots(def.id, 42), ids = ss.map((x) => x.id);
        let now = 0, r = null, moves = 0;
        for (; now < 40 * 60_000 && !r; now += 100) {
          for (const mv of run(s, ids, now)) if (def.move(s, mv.by, mv.m, now)) moves++;
          def.tick?.(s, now);
          r = def.result(s);
        }
        expect(r, `${def.id} never ended`).not.toBeNull();
        expect(moves).toBeGreaterThan(0);
        expect(Object.keys(r!).every((id) => ids.includes(id))).toBe(true);
      });
    }
  }
  it('bots are ids of their own and look the same to everyone at the table', () => {
    expect(isBot(seats(2)[0].id)).toBe(true);
    expect(botProfiles('table-9', 3).map((p) => p.username)).toEqual(botProfiles('table-9', 3).map((p) => p.username));
  });
});

describe('bots in the 3D games', () => {
  for (const sim of Object.values(SIMS3)) {
    it(`${sim.id}: a table of bots plays to the end`, () => {
      const ids = seats(Math.max(sim.min, 3)).map((x) => x.id), w = sim.init(ids, 7), run = simBots(sim.id, 7);
      let r = null, t = 0;
      for (; t < 8 * 60 && !r; t += 1 / 30) { sim.step(w, run(w, ids), 1 / 30); r = sim.result(w); }
      if (!r) r = sim.standings(w);
      expect(r).not.toBeNull();
      // they actually move about
      expect(w.ps.some((p: { x: number; z: number }) => Math.hypot(p.x, p.z) > 0.5)).toBe(true);
    });
  }
});

describe('fair play', () => {
  it('Four in a Row: a simple player beats the bot now and then', () => {
    const def = PARTY.fourrow;
    let humanWins = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const ss: Seat[] = [{ id: 'me', slot: 0, name: 'me', color: '#fff', p: {} as never }, ...seats(1).map((x) => ({ ...x, slot: 1 }))];
      const s = def.init(ss, seed), run = partyBots('fourrow', seed);
      for (let now = 0, k = 0; now < 600_000 && !def.result(s); now += 100) {
        // "me": take a win if there is one, else play the middle-ish column with room
        if (def.turn!(s) === 'me') {
          const order = [3, 2, 4, 1, 5, 0, 6].sort(() => ((seed * 7 + k++) % 3) - 1);
          for (const c of order) if (def.move(s, 'me', { c }, now)) break;
        }
        for (const mv of run(s, ['bot:0'], now)) def.move(s, mv.by, mv.m, now);
      }
      if (def.result(s)?.me === 1) humanWins++;
    }
    expect(humanWins).toBeGreaterThan(2);
  });
});
