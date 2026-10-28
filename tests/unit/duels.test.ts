// Duels: identical boards for both players, server-replayed scoring.
import { describe, expect, it } from 'vitest';
import { generateClash, generateForgery, generateRecall, generateTurf, solveTurf, validateDuel } from '../../src/shared/pvp';

const S = 987654;
describe('duel games', () => {
  it('Turf Wars: a legal route scores its land value; jumping away is illegal', () => {
    const L = generateTurf(S);
    let t = 0;
    const taps = solveTurf(L).map((i) => ({ t: (t += 400), i }));
    const r = validateDuel('turfwars', S, { taps, done_t: t + 100 });
    expect(r.valid && r.score > 0).toBe(true);
    expect(validateDuel('turfwars', S, { taps: [{ t: 100, i: 0 }], done_t: 200 }).reason).toBe('not_adjacent');
    expect(generateTurf(S)).toEqual(L); // same seed, same board
  });
  it('Palette Clash: the right pairs are exact', () => {
    const L = generateClash(S);
    let t = 0;
    const r = validateDuel('paletteclash', S, { picks: L.targets.map((x) => ({ t: (t += 900), a: x.a, b: x.b })), done_t: t + 50 });
    expect(r.score).toBe(800);
    expect((r.summary as any).exact).toBe(8);
  });
  it('Spot the Forgery: finds score, misses cost', () => {
    const L = generateForgery(S);
    expect(L.changed.every((i) => L.original[i] !== L.forgery[i])).toBe(true);
    let t = 0;
    expect(validateDuel('forgery', S, { taps: L.changed.map((i) => ({ t: (t += 700), i })), done_t: t }).score).toBe(600);
    const wrong = [...Array(100).keys()].find((i) => !L.changed.includes(i))!;
    expect(validateDuel('forgery', S, { taps: [{ t: 100, i: wrong }], done_t: 200 }).score).toBe(0);
  });
  it('Pixel Recall: a perfect repaint beats a blank one; no painting during the preview', () => {
    const L = generateRecall(S);
    let t = L.previewMs + 200;
    const perfect = validateDuel('pixelrecall', S, { paints: L.target.map((c, i) => ({ t: (t += 120), i, c })).filter((p) => p.c !== 0), done_t: t });
    expect(perfect.score).toBeGreaterThan(0);
    expect(validateDuel('pixelrecall', S, { paints: [], done_t: 5000 }).score).toBe(0);
    expect(validateDuel('pixelrecall', S, { paints: [{ t: 100, i: 0, c: L.colors[1] }], done_t: 5000 }).reason).toBe('painted_during_preview');
  });
});
