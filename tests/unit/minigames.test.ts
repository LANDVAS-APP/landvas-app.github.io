import { describe, it, expect } from 'vitest';
import { generateColorBurst, validateColorBurst, type ColorBurstLog } from '../../src/shared/minigames/colorburst';
import { generateLightLines, traceBeams, validateLightLines, type LightLinesLog } from '../../src/shared/minigames/lightlines';
import { POP_BOMB, Spawner, applySwap, generatePaintPop, legalMoves, solvePaintPop, validatePaintPop, type PaintPopLog } from '../../src/shared/minigames/paintpop';
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

function playPaintPop(seed: number, level: number, gap = 900): PaintPopLog {
  let t = 0;
  const moves = solvePaintPop(seed, level).map((m) => ({ t: (t += gap), ...m }));
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
        if (level <= 20) expect(validatePaintPop(seed, level, playPaintPop(seed, level)).passed).toBe(true);
        else expect(validatePaintPop(seed, level, playPaintPop(seed, level)).valid).toBe(true);
        expect(validateTraceCraft(seed, level, traceShapes(seed, level)).passed).toBe(true);
      });
    }
  }
});

describe('difficulty scales', () => {
  it('boards grow and tolerances shrink with level', () => {
    expect(generateLightLines(5, 30).w).toBeGreaterThan(generateLightLines(5, 1).w);
    expect(generatePaintPop(5, 25).n).toBeGreaterThan(generatePaintPop(5, 1).n);
    expect(generatePaintPop(5, 25).quota.filter(Boolean).length).toBeGreaterThan(generatePaintPop(5, 1).quota.filter(Boolean).length);
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
    const pp = playPaintPop(1, 3);
    expect(validatePaintPop(1, 3, { moves: [pp.moves[1], pp.moves[0]], done_t: pp.done_t }).valid).toBe(false); // out of order
    expect(validatePaintPop(1, 3, { moves: [{ t: 10, a: 0, b: 30 }], done_t: 60 }).reason).toBe('illegal_move'); // not neighbours
    const cb = solveColorBurst(7, 3);
    cb.rounds[0].actions.push({ t: cb.rounds[0].submit_t, a: 'add', p: 999 });
    expect(validateColorBurst(7, 3, cb).valid).toBe(false);
  });
  it('a sloppy trace fails, a careful one passes', () => {
    expect(validateTraceCraft(9, 4, traceShapes(9, 4, 0.12)).passed).toBe(false);
    expect(validateTraceCraft(9, 4, traceShapes(9, 4, 0.004)).passed).toBe(true);
  });
  it('superhuman input is flagged for review', () => {
    const fast = playPaintPop(3, 4, 10);
    const r = validatePaintPop(3, 4, fast);
    expect(r.passed).toBe(true);
    expect(r.suspicious).toBe(true);
  });
  it('reports the duration it claims so the server can compare with its clock', () => {
    const log = playPaintPop(3, 4);
    expect(validatePaintPop(3, 4, log).min_duration_ms).toBe(log.done_t);
  });
  it('garbage input never throws', () => {
    for (const g of ['tracecraft', 'colorburst', 'paintpop', 'lightlines'] as const) {
      for (const junk of [null, {}, { moves: 'x' }, { strokes: [{ points: [[1, 2]] }] }, { rounds: [{}] }]) {
        expect(validateMinigame(g, 1, 1, junk).valid).toBe(false);
      }
    }
  });
});

describe('Paint Pop', () => {
  it('the same moves always give the same board (new blobs come from the seed)', () => {
    const L = generatePaintPop(77, 8);
    const play = () => {
      const sp = new Spawner(L.spawnSeed, L.k);
      let b = L.start;
      for (const m of solvePaintPop(77, 8).slice(0, 5)) b = applySwap(b, m.a, m.b, sp)!.board;
      return b;
    };
    expect(play()).toEqual(play());
  });
  it('no board starts with a match, and there is always a move', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      const L = generatePaintPop(s, 10);
      expect(legalMoves(L.start).length).toBeGreaterThan(0);
      // a swap that makes no line is refused
      const sp = new Spawner(L.spawnSeed, L.k);
      const bad = [...Array(L.n * L.n - 1).keys()].find((i) => i % L.n < L.n - 1 && !legalMoves(L.start).some(([a, b]) => a === i && b === i + 1));
      if (bad !== undefined) expect(applySwap(L.start, bad, bad + 1, sp)).toBeNull();
    }
  });
  it('five in a row makes a colour bomb that pops a whole colour', () => {
    const n = 7, k = 4;
    const color = Array.from({ length: n * n }, (_, i) => ((i % n) + Math.floor(i / n) * 2 + 1) % k);
    // row 3: 0 0 X 0 0 with a 0 above the gap → swapping it down makes five 0s
    const row = 3 * n;
    [0, 1, 3, 4].forEach((x) => (color[row + x] = 0));
    color[row + 2] = 1; color[row - n + 2] = 0;
    const b = { n, k, color, power: new Array(n * n).fill(0) };
    const r = applySwap(b, row - n + 2, row + 2, new Spawner(1, k))!;
    expect(r.steps[0].made.some((m) => m.power === POP_BOMB)).toBe(true);
  });
});
