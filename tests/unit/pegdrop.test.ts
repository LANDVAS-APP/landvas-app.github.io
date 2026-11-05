// Peg Drop can't be farmed: wherever you aim (even right at an edge), chips spread across the slots and every
// aim point averages about the same.
import { describe, expect, it } from 'vitest';
import { DROP_MAX, DROP_MIN, PEG_SLOTS, clampAim, pegLayout, simulateDrop } from '../../src/arcade/pegdrop';
import { rng } from '../../src/arcade/games';

describe('Peg Drop', () => {
  const pegs = pegLayout();
  const r = rng(424242);
  const N = 1500;
  const stats = (aim: number) => {
    const h = Array(9).fill(0);
    for (let i = 0; i < N; i++) h[simulateDrop(aim, r, pegs)]++;
    return { top: Math.max(...h) / N, ev: h.reduce((s, n, k) => s + n * PEG_SLOTS[k], 0) / N, slots: h.filter((n) => n / N > 0.03).length };
  };
  it('you can only drop from the middle of the board', () => {
    expect(clampAim(0)).toBe(DROP_MIN);
    expect(clampAim(1)).toBe(DROP_MAX);
    expect(DROP_MIN).toBeGreaterThan(0.2);
    expect(DROP_MAX).toBeLessThan(0.8);
  });
  it('no aim point is a sure thing, and none pays much more than any other', () => {
    const all = [0, DROP_MIN, 0.4, 0.5, 0.6, DROP_MAX, 1].map(stats);
    for (const s of all) {
      expect(s.top).toBeLessThan(0.3);     // never more than ~30% in any one slot
      expect(s.slots).toBeGreaterThanOrEqual(5); // spread over at least five slots
    }
    const evs = all.map((s) => s.ev);
    expect(Math.max(...evs) / Math.min(...evs)).toBeLessThan(1.25);
    expect(Math.max(...evs)).toBeLessThan(45);
  }, 240_000); // ~10k simulated drops: slow on small machines
});
