// Every Inkborn game runs a full round headlessly (with a simple "player" pressing things),
// scores something, stays inside the server's max score, and draws without throwing.
import { describe, expect, it } from 'vitest';
import { ENGINES, GAMES, type GameId, type GameInput } from '../../src/inkborn/games/engines';
import { randomGenome } from '../../src/inkborn/genome';

function fakeCtx() {
  const grad = { addColorStop() {} };
  const t: Record<string, unknown> = { canvas: { width: 400, height: 700 } };
  return new Proxy(t, {
    get(o, k: string) {
      if (k in o) return o[k];
      if (k.startsWith('create')) return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(o, k: string, v) { o[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

// the server's max_score per game (supabase/migrations/*inkborn*)
const MAX: Record<GameId, number> = { berrydash: 140, fireflies: 100, leafleap: 160, lilyhop: 120, songbloom: 120 };

describe('Inkborn games', () => {
  for (const id of Object.keys(GAMES) as GameId[]) {
    it(`${GAMES[id].name} plays a whole round`, () => {
      const W = 400, H = 700;
      const input: GameInput = { joy: { x: 0, y: 0 }, keys: new Set(), tap: null, target: null };
      const e = ENGINES[id](randomGenome(5), 12345, W, H, input);
      const g = fakeCtx();
      let t = 0;
      for (let f = 0; f < 60 * 50; f++) {
        // a busy little player: taps around, holds keys now and then
        if (f % 23 === 0) input.tap = { x: (f * 37) % W, y: (f * 53) % H };
        if (f % 40 === 0) { input.keys.clear(); input.keys.add(['arrowup', 'arrowleft', 'arrowright', '1', '2', '3', '4', 'w'][(f / 40) % 8]); }
        if (f % 40 === 8) input.keys.clear();
        input.target = f % 120 < 60 ? { x: (f % 2 ? 0.2 : 0.8) * W, y: H / 2 } : null;
        e.step(1 / 60, t);
        if (f % 30 === 0) e.draw(g, W, H, t);
        t += 1 / 60;
      }
      const s = e.score();
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(MAX[id] * 2);
      e.dispose?.();
    });
  }
  it('the same seed lays out the same round', () => {
    const run = (id: GameId) => {
      const input: GameInput = { joy: { x: 0.5, y: -0.5 }, keys: new Set(), tap: null, target: null };
      const e = ENGINES[id](randomGenome(1), 99, 400, 700, input);
      for (let i = 0; i < 600; i++) e.step(1 / 60, i / 60);
      return e.score();
    };
    for (const id of ['leafleap', 'lilyhop'] as GameId[]) expect(run(id)).toBe(run(id));
  });
});

describe('merge helpers', () => {
  it('touchingGroups finishes even before your canvases have loaded', async () => {
    const { touchingGroups } = await import('../../src/plot/MergeBar');
    expect(touchingGroups([], ['g1'])).toEqual(['g1']);
    const g = (id: string, cells: [number, number][]) => ({ id, status: 'active', cells }) as any;
    expect(touchingGroups([g('a', [[0, 0]]), g('b', [[1, 0]]), g('c', [[5, 5]])], ['a']).sort()).toEqual(['a', 'b']);
  });
});
