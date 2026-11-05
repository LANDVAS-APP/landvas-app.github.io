import { describe, expect, it } from 'vitest';
import { LIVE_DEFS } from '../../src/arcade/live/games';
import { ARENA_GAMES, MODE_INFO, type ArenaMode, type Inp, type LP } from '../../src/arcade/live/kit';

const players = (n: number, mode: ArenaMode): LP[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, slot: i, team: mode === 'teams' ? i % 2 : null, name: `P${i}`, color: '#fff' }));
function run(game: string, mode: ArenaMode, n: number, seed: number, bot: (id: string, t: number, k: number) => Inp) {
  const def = LIVE_DEFS[game], ps = players(n, mode), w = def.init(ps, seed, mode);
  let t = 0, r = null, maxSnap = 0;
  for (let k = 0; k < 30 * 60 * 12 && !r; k++) {
    const inputs = Object.fromEntries(ps.map((p) => [p.id, bot(p.id, t, k)]));
    def.step(w, inputs, 1 / 30); t += 1 / 30;
    if (k % 3 === 0) maxSnap = Math.max(maxSnap, JSON.stringify(def.snap ? def.snap(w) : w).length);
    r = def.result(w);
  }
  return { r, t, maxSnap, ps };
}
const wander = (id: string, t: number, k: number) => { const s = +id.slice(1) + 1; return { x: Math.sin(t * 0.7 * s + s), y: Math.cos(t * 0.9 * s), b: k % (50 + s * 7) === 0 }; };

describe('live arena games', () => {
  for (const [game, info] of Object.entries(ARENA_GAMES)) for (const mode of info.modes) {
    const sizes = [...new Set([MODE_INFO[mode].need[0], MODE_INFO[mode].need[1]])];
    for (const n of sizes) it(`${game} ${mode} x${n} finishes with a valid result`, () => {
      for (const seed of [1, 7, 99]) {
        const { r, t, maxSnap, ps } = run(game, mode, n, seed, wander);
        expect(r, `${game} ${mode} seed ${seed} never ended`).not.toBeNull();
        expect(t).toBeLessThan(15 * 60);
        expect(maxSnap).toBeLessThan(6000); // snapshots stay small (they go out 10x a second)
        if (mode === 'teams') expect([0, 1, null]).toContain(r!.winner);
        else if (mode === 'coop') expect(r!.waves).toBeGreaterThanOrEqual(0);
        else { const pl = Object.values(r!.places!); expect(Object.keys(r!.places!).sort()).toEqual(ps.map((p) => p.id).sort()); expect(pl).toContain(1); for (const v of pl) expect(v).toBeLessThanOrEqual(n); }
      }
    });
  }
  it('everyone sitting still still ends a bumper round', () => {
    const { r } = run('bumper', 'duel', 2, 3, () => ({ x: 0, y: 0, b: false }));
    expect(r).not.toBeNull();
  });
  it('the same seed and inputs give the same game', () => {
    const a = run('meteor', 'coop', 3, 5, wander), b = run('meteor', 'coop', 3, 5, wander);
    expect(a.r).toEqual(b.r); expect(a.t).toBeCloseTo(b.t);
  });
});
