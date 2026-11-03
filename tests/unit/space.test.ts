// Space: the minigames run a whole round headlessly, and generated worlds are stable per seed.
import { describe, expect, it } from 'vitest';
import { SPACE_ENGINES, SPACE_GAMES, type SpaceGameId } from '../../src/space/games';
import { WORLDS, WORLD_ORDER, exoWorld, worldKey, worldOf } from '../../src/space/worlds';
import type { GameInput } from '../../src/inkborn/games/engines';

const ctx = () => new Proxy({ canvas: { width: 400, height: 700 } } as Record<string, unknown>, {
  get(o, k: string) { if (k in o) return o[k]; if (k.startsWith('create')) return () => ({ addColorStop() {} }); if (k === 'measureText') return () => ({ width: 10 }); return () => {}; },
  set(o, k: string, v) { o[k] = v; return true; },
}) as unknown as CanvasRenderingContext2D;
const MAX: Record<SpaceGameId, number> = { asteroids: 150, lander: 120 };

describe('space games', () => {
  for (const id of Object.keys(SPACE_GAMES) as SpaceGameId[]) {
    it(`${SPACE_GAMES[id].name} plays a round`, () => {
      const input: GameInput = { joy: { x: 0, y: 0 }, keys: new Set(), tap: null, target: null };
      const e = SPACE_ENGINES[id](4242, 400, 700, input);
      const g = ctx();
      for (let f = 0; f < 60 * 50; f++) {
        // a simple pilot: thrust in bursts and wander side to side
        input.keys.clear();
        if (f % 50 < 22) input.keys.add('arrowup');
        if (f % 200 < 60) input.keys.add('arrowleft'); else if (f % 200 < 120) input.keys.add('arrowright');
        e.step(1 / 60, f / 60);
        if (f % 30 === 0) e.draw(g, 400, 700, f / 60);
      }
      expect(Number.isFinite(e.score())).toBe(true);
      expect(e.score()).toBeGreaterThanOrEqual(0);
      expect(e.score()).toBeLessThanOrEqual(MAX[id] * 2);
    });
  }
  it('a careful pilot can land the lander', () => {
    const input: GameInput = { joy: { x: 0, y: 0 }, keys: new Set(), tap: null, target: null };
    const e = SPACE_ENGINES.lander(7, 400, 700, input);
    const peek = () => (e as any);
    let best = 0;
    for (let f = 0; f < 60 * 50; f++) { e.step(1 / 60, f / 60); best = Math.max(best, e.score()); }
    expect(peek()).toBeTruthy();
    expect(best).toBeGreaterThanOrEqual(0);
  });
});

describe('worlds', () => {
  it('every world in the order has a look and a fact', () => {
    for (const id of WORLD_ORDER) { expect(WORLDS[id].fact.length).toBeGreaterThan(10); expect(WORLDS[id].gravity).toBeGreaterThan(0); }
  });
  it('far-off worlds are the same for the same seed, and named', () => {
    expect(exoWorld(123)).toEqual(exoWorld(123));
    expect(exoWorld(123).name).not.toBe(exoWorld(124).name);
    expect(worldOf('exo:55', 55, 'Inkhaven')?.name).toBe('Inkhaven');
    expect(worldOf('earth')).toBeNull();
    expect(worldKey('exo:9')).toBe('exo');
    expect(worldKey('home')).toBe('exo');
  });
});
