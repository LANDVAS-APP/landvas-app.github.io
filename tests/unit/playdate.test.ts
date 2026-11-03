import { describe, it, expect } from 'vitest';
import { picnicParty } from '../../src/inkborn/games/playdate';
import { cleanGenome } from '../../src/inkborn/genome';
import type { GameInput } from '../../src/inkborn/games/engines';

describe('Picnic Party', () => {
  it('a good team scores, and enough for an egg', () => {
    const input: GameInput = { joy: { x: 0, y: 0 }, keys: new Set(), tap: null, target: null };
    const g = cleanGenome({ body: 'round' } as never);
    const e = picnicParty(7, 400, 700, input, g, g);
    for (let i = 0; i < 45 * 30; i++) {
      input.target = { x: 100 + ((i * 37) % 200), y: 200 + ((i * 53) % 400) };
      e.step(1 / 30, i / 30);
    }
    expect(Number.isFinite(e.score())).toBe(true);
    expect(e.score()).toBeGreaterThan(20);
  });
});
