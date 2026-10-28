// The four art minigames and multi-round levels: generated deterministically,
// solvable, and validated server-side from move logs only.
import { describe, expect, it } from 'vitest';
import { roundSeed, type BoardsLog } from '../../src/shared/minigames/boards';
import { validateMinigame } from '../../src/shared/minigames';
import { generateMemoryMural } from '../../src/shared/minigames/memorymural';
import { generateSculptor, iou, sculpt } from '../../src/shared/minigames/sculptor';
import { generateHueFlow } from '../../src/shared/minigames/hueflow';
import { generateMirrorline } from '../../src/shared/minigames/mirrorline';
import { generatePatternShift } from '../../src/shared/minigames/patternshift';
import { generateTraceCraft, resample } from '../../src/shared/minigames/tracecraft';

const SEED = 123456789;

function muralLog(seed: number, level: number, correct = true) {
  const L = generateMemoryMural(seed, level);
  let t = L.previewMs + 400;
  const paints = L.target.map((c, i) => ({ t: (t += 120), i, c: correct ? c : L.colors[(L.colors.indexOf(c) + 1) % L.colors.length] }));
  return { paints, done_t: t + 300 };
}
function sculptLog(seed: number, level: number) {
  const L = generateSculptor(seed, level);
  let r = L.start, t = 0;
  const moves: { t: number; v: number; r: number }[] = [];
  for (let pass = 0; pass < 6; pass++) for (let v = 0; v < L.v; v++) { r = sculpt(r, L.falloff, v, L.target[v]); moves.push({ t: (t += 60), v, r: L.target[v] }); }
  return { log: { moves, done_t: t + 200 }, match: iou(r, L.target) };
}
function hueLog(seed: number, level: number) {
  const L = generateHueFlow(seed, level);
  const b = L.board.slice();
  const swaps: { t: number; a: number; b: number }[] = [];
  let t = 0;
  for (let i = 0; i < b.length; i++) {
    while (b[i] !== i) { const j = b.indexOf(i); swaps.push({ t: (t += 400), a: i, b: j }); [b[i], b[j]] = [b[j], b[i]]; }
  }
  return { swaps, done_t: t + 300, par: L.par };
}
function mirrorLog(seed: number, level: number) {
  const L = generateMirrorline(seed, level);
  let t = 0;
  const paints = L.target.map((c, i) => ({ c, i })).filter(({ i }) => !L.given[i]).map(({ c, i }) => ({ t: (t += 110), i, c }));
  return { paints, done_t: t + 200 };
}
const boards = (rounds: number, make: (seed: number) => unknown): BoardsLog => {
  let t0 = 0;
  return { boards: Array.from({ length: rounds }, (_, r) => { const log = make(roundSeed(SEED, r)) as any; const b = { t0, log }; t0 += (log.done_t ?? 0) + 500; return b; }) };
};

describe('art minigames', () => {
  it('Memory Mural: repainting from memory passes; painting while the picture is shown is refused', () => {
    for (const level of [1, 7, 20]) {
      const v = validateMinigame('memorymural', SEED, level, boards(5, (s) => muralLog(s, level)), 5);
      expect(v.valid && v.passed).toBe(true);
      expect(v.stars).toBe(3);
    }
    const wrong = validateMinigame('memorymural', SEED, 3, boards(5, (s) => muralLog(s, 3, false)), 5);
    expect(wrong.valid).toBe(true);
    expect(wrong.passed).toBe(false);
    const cheat = boards(5, (s) => { const l = muralLog(s, 1); l.paints[0].t = 10; return l; });
    expect(validateMinigame('memorymural', SEED, 1, cheat, 5).reason).toBe('painted_during_preview');
  });

  it('Sculptor: pulling the clay to the target outline passes', () => {
    for (const level of [1, 8, 18]) {
      const one = sculptLog(roundSeed(SEED, 0), level);
      expect(one.match).toBeGreaterThan(0.95);
      const v = validateMinigame('sculptor', SEED, level, boards(5, (s) => sculptLog(s, level).log), 5);
      expect(v.valid && v.passed).toBe(true);
    }
    const idle = validateMinigame('sculptor', SEED, 12, boards(5, () => ({ moves: [], done_t: 900 })), 5);
    expect(idle.passed).toBe(false);
  });

  it('HueFlow: restoring the gradient passes, swapping a pinned tile is illegal', () => {
    const v = validateMinigame('hueflow', SEED, 4, boards(5, (s) => hueLog(s, 4)), 5);
    expect(v.valid && v.passed).toBe(true);
    const L = generateHueFlow(roundSeed(SEED, 0), 4);
    const pinned = L.locked.indexOf(true), free = L.locked.indexOf(false);
    const bad = boards(5, (s) => (s === roundSeed(SEED, 0) ? { swaps: [{ t: 500, a: pinned, b: free }], done_t: 900 } : hueLog(s, 4)));
    expect(validateMinigame('hueflow', SEED, 4, bad, 5).reason).toBe('illegal_swap');
  });

  it('Mirrorline: an exact reflection passes; painting the given half is illegal', () => {
    for (const level of [1, 6, 14]) expect(validateMinigame('mirrorline', SEED, level, boards(5, (s) => mirrorLog(s, level)), 5).passed).toBe(true);
    const L = generateMirrorline(roundSeed(SEED, 0), 1);
    const bad = boards(5, () => ({ paints: [{ t: 500, i: L.given.indexOf(true), c: L.colors[0] }], done_t: 900 }));
    expect(validateMinigame('mirrorline', SEED, 1, bad, 5).reason).toBe('illegal_paint');
  });
});

describe('rounds', () => {
  it('a level has the configured number of rounds and needs 60% of them', () => {
    expect(generateTraceCraft(SEED, 3, 5).shapes).toHaveLength(5);
    // PatternShift with 5 boards, solving only 2 → fails; solving 3 → passes
    const solve = (s: number) => { const L = generatePatternShift(s, 2); let t = 0; return { moves: [...L.scramble].reverse().map((m) => ({ ...m, d: -m.d as 1 | -1, t: (t += 500) })), done_t: t + 200 }; };
    const some = (k: number) => boards(5, (s) => ([0, 1, 2, 3, 4].map((r) => roundSeed(SEED, r)).indexOf(s) < k ? solve(s) : { moves: [], done_t: 800 }));
    expect(validateMinigame('patternshift', SEED, 2, some(2), 5).passed).toBe(false);
    expect(validateMinigame('patternshift', SEED, 2, some(3), 5).passed).toBe(true);
    // legacy sessions (no rounds) still accept the single-board format
    expect(validateMinigame('patternshift', SEED, 2, solve(SEED), null).passed).toBe(true);
    void resample;
  });

  it('rounds can’t overlap in time', () => {
    const log = boards(5, (s) => mirrorLog(s, 1));
    log.boards[2].t0 = log.boards[1].t0;
    expect(validateMinigame('mirrorline', SEED, 1, log, 5).reason).toBe('overlapping_rounds');
  });
});

describe('blank canvases never pass', () => {
  it('memory mural and mirrorline reject an untouched board', async () => {
    const { validateMemoryMural, generateMemoryMural } = await import('../../src/shared/minigames/memorymural');
    const { validateMirrorline } = await import('../../src/shared/minigames/mirrorline');
    for (let seed = 1; seed < 40; seed++) for (const lv of [1, 10, 30]) {
      const L = generateMemoryMural(seed, lv);
      expect(validateMemoryMural(seed, lv, { paints: [], done_t: L.previewMs + 2000 }).passed).toBe(false);
      expect(validateMirrorline(seed, lv, { paints: [], done_t: 3000 }).passed).toBe(false);
    }
  });
});
