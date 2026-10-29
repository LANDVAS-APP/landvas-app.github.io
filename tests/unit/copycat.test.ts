// Copy Cat: the example is generated deterministically; a perfect copy beats a sloppy one,
// fill works the same on the board and in the validator, and a blank canvas scores nothing.
import { describe, expect, it } from 'vitest';
import { copyFill, generateCopycat, validateBoard, validatePvp, pvpRoundSeed } from '../../src/shared/pvp';

describe('Copy Cat', () => {
  it('scores a perfect copy 1000 and a blank one 0', () => {
    const L = generateCopycat(42);
    expect(L.target.some((c) => c !== 0)).toBe(true);
    let t = 100;
    const perfect = L.target.map((c, i) => ({ t: (t += 50), i, c })).filter((p) => p.c !== 0);
    expect(validateBoard('copycat', 42, { paints: perfect, done_t: t + 100 }).score).toBe(1000);
    expect(validateBoard('copycat', 42, { paints: [], done_t: 900 }).score).toBe(0);
    const sloppy = perfect.filter((_, k) => k % 3);
    const s = validateBoard('copycat', 42, { paints: sloppy, done_t: t + 100 }).score;
    expect(s).toBeGreaterThan(300);
    expect(s).toBeLessThan(1000);
  });
  it('replays fills and rejects colours outside the palette', () => {
    const L = generateCopycat(7);
    const filled = copyFill(new Array(L.n * L.n).fill(0), L.n, 0, L.colors[1]);
    expect(filled.every((c) => c === L.colors[1])).toBe(true);
    expect(validateBoard('copycat', 7, { paints: [{ t: 100, i: 0, c: L.colors[1], f: 1 }], done_t: 500 }).valid).toBe(true);
    expect(validateBoard('copycat', 7, { paints: [{ t: 100, i: 0, c: 99 }], done_t: 500 }).valid).toBe(false);
  });
  it('plays as a multi-round PvP match', () => {
    const boards = [0, 1, 2].map((r) => {
      const L = generateCopycat(pvpRoundSeed(99, r));
      let t = 100;
      return { t0: r * 80_000, log: { paints: L.target.map((c, i) => ({ t: (t += 40), i, c })).filter((p) => p.c !== 0), done_t: t + 50 } };
    });
    const v = validatePvp('copycat', 99, 3, { boards });
    expect(v.valid).toBe(true);
    expect(v.rounds.every((r) => r.score === 1000)).toBe(true);
  });
});
