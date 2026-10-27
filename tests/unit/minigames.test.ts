import { describe, it, expect } from 'vitest';
import { generateColorBurst, validateColorBurst, type ColorBurstLog } from '../../src/shared/minigames/colorburst';
import { generateLightLines, traceBeams, validateLightLines, type LightLinesLog } from '../../src/shared/minigames/lightlines';
import { applyMove, generatePatternShift, validatePatternShift, type PatternShiftLog } from '../../src/shared/minigames/patternshift';
import { generateTraceCraft, resample, validateTraceCraft, type TraceCraftLog } from '../../src/shared/minigames/tracecraft';
import { validateMinigame } from '../../src/shared/minigames';

const SEEDS = [1, 42, 99991, 123456789, 2147483000];

function solveColorBurst(seed: number, level: number, delayMs = 900): ColorBurstLog {
  const L = generateColorBurst(seed, level);
  let t = 0;
  return {
    rounds: L.rounds.map((r) => {
      const actions = r.recipe.flatMap((n, p) => Array.from({ length: n }, () => ({ t: (t += 300), a: 'add' as const, p })));
      t += delayMs;
      return { actions, submit_t: t };
    }),
  };
}

function solveLightLines(seed: number, level: number): LightLinesLog {
  const L = generateLightLines(seed, level);
  let t = 0;
  const moves = L.cells
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.k === 'mirror' && L.solution[i] && c.m !== L.solution[i])
    .map(({ i }) => ({ t: (t += 600), i }));
  return { moves, done_t: t + 200 };
}

function solvePatternShift(seed: number, level: number): PatternShiftLog {
  const L = generatePatternShift(seed, level);
  let t = 0;
  const moves = [...L.scramble].reverse().map((m) => ({ t: (t += 700), k: m.k, i: m.i, d: (-m.d) as 1 | -1 }));
  return { moves, done_t: t + 100 };
}

function traceShapes(seed: number, level: number, wobble = 0): TraceCraftLog {
  const L = generateTraceCraft(seed, level);
  let t = 0;
  return {
    strokes: L.shapes.map((s) => {
      const pts = resample(s.points, 120);
      return { points: pts.map(([x, y], k) => [x + (k % 2 ? wobble : -wobble), y, (t += 16 + (k % 3))] as [number, number, number]) };
    }),
  };
}

describe('level generation is deterministic and solvable across levels', () => {
  for (const level of [1, 2, 5, 9, 14, 20, 30, 45, 60]) {
    for (const seed of SEEDS) {
      it(`level ${level} seed ${seed}`, () => {
        expect(generateColorBurst(seed, level)).toEqual(generateColorBurst(seed, level));
        expect(validateColorBurst(seed, level, solveColorBurst(seed, level)).passed).toBe(true);
        const ll = generateLightLines(seed, level);
        expect(traceBeams(ll.w, ll.h, ll.cells).solved).toBe(false); // never handed out solved
        expect(validateLightLines(seed, level, solveLightLines(seed, level)).passed).toBe(true);
        expect(validatePatternShift(seed, level, solvePatternShift(seed, level)).passed).toBe(true);
        expect(validateTraceCraft(seed, level, traceShapes(seed, level)).passed).toBe(true);
      });
    }
  }
});

describe('difficulty scales', () => {
  it('boards grow and tolerances shrink with level', () => {
    expect(generateLightLines(5, 30).w).toBeGreaterThan(generateLightLines(5, 1).w);
    expect(generatePatternShift(5, 25).n).toBeGreaterThan(generatePatternShift(5, 1).n);
    expect(generatePatternShift(5, 25).par).toBeGreaterThan(generatePatternShift(5, 1).par);
    expect(generateTraceCraft(5, 30).tolerance).toBeLessThan(generateTraceCraft(5, 1).tolerance);
    expect(generateColorBurst(5, 20).threshold).toBeLessThan(generateColorBurst(5, 1).threshold);
    expect(generateColorBurst(5, 20).pigments.length).toBeGreaterThan(generateColorBurst(5, 1).pigments.length);
  });
});

describe('forged results are rejected', () => {
  it('a log for a different seed does not solve the level', () => {
    const forged = solveLightLines(42, 6);
    const r = validateLightLines(43, 6, forged);
    expect(r.passed).toBe(false);
  });
  it('illegal moves and broken timestamps are invalid', () => {
    expect(validateLightLines(1, 3, { moves: [{ t: 10, i: 99999 }], done_t: 20 }).valid).toBe(false);
    expect(validatePatternShift(1, 3, { moves: [{ t: 50, k: 'r', i: 0, d: 1 }, { t: 10, k: 'r', i: 0, d: -1 }], done_t: 60 }).valid).toBe(false);
    const cb = solveColorBurst(7, 3);
    cb.rounds[0].actions.push({ t: cb.rounds[0].submit_t, a: 'add', p: 999 });
    expect(validateColorBurst(7, 3, cb).valid).toBe(false);
  });
  it('a sloppy trace fails, a careful one passes', () => {
    expect(validateTraceCraft(9, 4, traceShapes(9, 4, 0.12)).passed).toBe(false);
    expect(validateTraceCraft(9, 4, traceShapes(9, 4, 0.004)).passed).toBe(true);
  });
  it('superhuman input is flagged for review', () => {
    const fast = solvePatternShift(3, 12);
    fast.moves.forEach((m, k) => (m.t = k * 10));
    fast.done_t = fast.moves.length * 10;
    const r = validatePatternShift(3, 12, fast);
    expect(r.passed).toBe(true);
    expect(r.suspicious).toBe(true);
  });
  it('reports the duration it claims so the server can compare with its clock', () => {
    const log = solvePatternShift(3, 4);
    expect(validatePatternShift(3, 4, log).min_duration_ms).toBe(log.done_t);
  });
  it('garbage input never throws', () => {
    for (const g of ['tracecraft', 'colorburst', 'patternshift', 'lightlines'] as const) {
      for (const junk of [null, {}, { moves: 'x' }, { strokes: [{ points: [[1, 2]] }] }, { rounds: [{}] }]) {
        expect(validateMinigame(g, 1, 1, junk).valid).toBe(false);
      }
    }
  });
});

describe('PatternShift moves', () => {
  it('row and column shifts wrap and invert', () => {
    const L = generatePatternShift(77, 8);
    const once = applyMove(L.board, L.n, { k: 'c', i: 1, d: 1 });
    expect(applyMove(once, L.n, { k: 'c', i: 1, d: -1 })).toEqual(L.board);
    let b = L.board;
    for (let k = 0; k < L.n; k++) b = applyMove(b, L.n, { k: 'r', i: 0, d: 1 });
    expect(b).toEqual(L.board);
  });
});
