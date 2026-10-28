// PvP minigames: identical boards for both players, server-replayed scoring in rounds.
import { describe, expect, it } from 'vitest';
import { decide, generateClash, generateForgery, generateRecall, generateTurf, pvpRoundSeed, solveTurf, validateBoard, validatePvp } from '../../src/shared/pvp';

const S = 987654;
describe('PvP boards', () => {
  it('Turf Wars: a legal route scores its land value; jumping away is illegal', () => {
    const L = generateTurf(S);
    let t = 0;
    const taps = solveTurf(L).map((i) => ({ t: (t += 400), i }));
    const r = validateBoard('turfwars', S, { taps, done_t: t + 100 });
    expect(r.valid && r.score > 0).toBe(true);
    expect(r.quality).toBe(100); // the reference route is the 100% mark
    expect(validateBoard('turfwars', S, { taps: [{ t: 100, i: 0 }], done_t: 200 }).reason).toBe('not_adjacent');
    expect(generateTurf(S)).toEqual(L); // same seed, same board
  });
  it('Palette Clash: the right pairs are exact', () => {
    const L = generateClash(S);
    let t = 0;
    const r = validateBoard('paletteclash', S, { picks: L.targets.map((x) => ({ t: (t += 900), a: x.a, b: x.b })), done_t: t + 50 });
    expect(r.score).toBe(800);
    expect(r.quality).toBe(100);
    expect((r.summary as any).exact).toBe(8);
  });
  it('Spot the Forgery: finds score, misses cost', () => {
    const L = generateForgery(S);
    expect(L.changed.every((i) => L.original[i] !== L.forgery[i])).toBe(true);
    let t = 0;
    expect(validateBoard('forgery', S, { taps: L.changed.map((i) => ({ t: (t += 700), i })), done_t: t }).score).toBe(600);
    const wrong = [...Array(100).keys()].find((i) => !L.changed.includes(i))!;
    expect(validateBoard('forgery', S, { taps: [{ t: 100, i: wrong }], done_t: 200 }).score).toBe(0);
  });
  it('Pixel Recall: a perfect repaint beats a blank one; no painting during the preview', () => {
    const L = generateRecall(S);
    let t = L.previewMs + 200;
    const perfect = validateBoard('pixelrecall', S, { paints: L.target.map((c, i) => ({ t: (t += 120), i, c })).filter((p) => p.c !== 0), done_t: t });
    expect(perfect.score).toBeGreaterThan(0);
    expect(validateBoard('pixelrecall', S, { paints: [], done_t: 5000 }).score).toBe(0);
    expect(validateBoard('pixelrecall', S, { paints: [{ t: 100, i: 0, c: L.colors[1] }], done_t: 5000 }).reason).toBe('painted_during_preview');
  });
});

describe('PvP matches', () => {
  const forgeryRun = (seed: number, rounds: number, found = 6) => ({
    boards: Array.from({ length: rounds }, (_, r) => {
      const L = generateForgery(pvpRoundSeed(seed, r));
      let t = 0;
      return { t0: r * 20000, log: { taps: L.changed.slice(0, found).map((i) => ({ t: (t += 600), i })), done_t: t + 100 } };
    }),
  });
  it('replays every round on its own board, with a quality per round', () => {
    const v = validatePvp('forgery', S, 3, forgeryRun(S, 3));
    expect(v.valid).toBe(true);
    expect(v.rounds).toHaveLength(3);
    expect(v.rounds.every((r) => r.quality === 100)).toBe(true);
    expect(v.avg_quality).toBe(100);
    const half = validatePvp('forgery', S, 3, forgeryRun(S, 3, 3));
    expect(half.avg_quality).toBe(50);
    // every round is a different board
    expect(generateForgery(pvpRoundSeed(S, 0)).changed).not.toEqual(generateForgery(pvpRoundSeed(S, 1)).changed);
  });
  it('rejects a wrong round count and overlapping rounds', () => {
    expect(validatePvp('forgery', S, 3, forgeryRun(S, 2)).reason).toBe('round_count_mismatch');
    const log = forgeryRun(S, 3);
    log.boards[1].t0 = 0;
    expect(validatePvp('forgery', S, 3, log).reason).toBe('overlapping_rounds');
  });
  it('rounds go to the higher score, then the faster round; the match to more rounds won', () => {
    const r = (score: number, time_ms = 1000) => ({ score, time_ms, quality: 50, summary: {} });
    expect(decide([r(5), r(1), r(5)], [r(4), r(9), r(4)])).toMatchObject({ wa: 2, wb: 1, winner: 'a' });
    expect(decide([r(5, 900)], [r(5, 1000)])).toMatchObject({ per: ['a'], winner: 'a' });
    expect(decide([r(5)], [r(5)])).toMatchObject({ per: ['tie'], winner: 'draw' });
  });
});
