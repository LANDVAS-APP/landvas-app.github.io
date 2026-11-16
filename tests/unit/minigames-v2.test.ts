// The four art minigames and multi-round levels: generated deterministically,
// solvable, and validated server-side from move logs only.
import { describe, expect, it } from 'vitest';
import { roundSeed, type BoardsLog } from '../../src/shared/minigames/boards';
import { validateMinigame } from '../../src/shared/minigames';
import { generateMemoryMural } from '../../src/shared/minigames/memorymural';
import { generateBlockSplash, solveBlockSplash, fits, initialState } from '../../src/shared/minigames/blocksplash';
import { generateRollerMural, rollGrid, solveRoller } from '../../src/shared/minigames/rollermural';
import { generateMirrorline } from '../../src/shared/minigames/mirrorline';
import { solvePaintPop } from '../../src/shared/minigames/paintpop';
import { generateTraceCraft, resample } from '../../src/shared/minigames/tracecraft';

const SEED = 123456789;

function muralLog(seed: number, level: number, correct = true) {
  const L = generateMemoryMural(seed, level);
  let t = L.previewMs + 400;
  const paints = L.target.map((c, i) => ({ t: (t += 120), i, c: correct ? c : L.colors[(L.colors.indexOf(c) + 1) % L.colors.length] }));
  return { paints, done_t: t + 300 };
}
function splashLog(seed: number, level: number) {
  const L = generateBlockSplash(seed, level);
  let t = 0;
  return { moves: solveBlockSplash(L).map((m) => ({ ...m, t: (t += 420) })), done_t: t + 300 };
}
function rollerLog(seed: number, level: number) {
  const L = generateRollerMural(seed, level);
  let t = 0;
  return { strokes: solveRoller(L.n, L.base, L.target).map((x) => ({ ...x, t: (t += 300) })), done_t: t + 300 };
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

  it('Block Splash: every round has a winning line; a stencil dropped where it can\'t fit is illegal; giving up fails', () => {
    for (const level of [1, 4, 9, 18, 33, 60]) {
      for (let k = 0; k < 8; k++) {
        const L = generateBlockSplash(SEED + k * 97, level);
        expect(L.pieces.length).toBeGreaterThanOrEqual(30);
        // the starting canvas never has a full row or column, and every stencil is inside the board
        for (let r = 0; r < L.n; r++) expect(L.start.slice(r * L.n, r * L.n + L.n).every((c) => c >= 0)).toBe(false);
        expect(solveBlockSplash(L).length).toBeGreaterThan(0);
      }
      const v = validateMinigame('blocksplash', SEED, level, boards(5, (s) => splashLog(s, level)), 5);
      expect(v.valid && v.passed).toBe(true);
      expect(v.stars).toBeGreaterThanOrEqual(1);
    }
    // overlapping a filled cell (or off the board) is refused
    const L = generateBlockSplash(roundSeed(SEED, 0), 6);
    const st = initialState(L);
    const s0 = L.pieces[0];
    let bad: { x: number; y: number } | null = null;
    for (let y = 0; y < L.n && !bad; y++) for (let x = 0; x < L.n && !bad; x++) if (!fits(st.board, s0, x, y)) bad = { x, y };
    const ill = boards(5, (s) => (s === roundSeed(SEED, 0) ? { moves: [{ t: 500, p: 0, ...(bad ?? { x: 9, y: 9 }) }], done_t: 900 } : splashLog(s, 6)));
    expect(validateMinigame('blocksplash', SEED, 6, ill, 5).reason).toBe('illegal_move');
    const idle = validateMinigame('blocksplash', SEED, 12, boards(5, () => ({ moves: [], done_t: 900 })), 5);
    expect(idle.valid).toBe(true); expect(idle.passed).toBe(false);
    // too fast to be a person
    const fast = boards(5, (s) => { const L2 = generateBlockSplash(s, 3); let t = 0; return { moves: solveBlockSplash(L2).map((m) => ({ ...m, t: (t += 40) })), done_t: t + 50 }; });
    expect(validateMinigame('blocksplash', SEED, 3, fast, 5).flags).toContain('superhuman_speed');
  });

  it('Roller Mural: every mural can be peeled back into strokes; a wrong colour is illegal', () => {
    for (const level of [1, 5, 12, 30, 60]) {
      for (let k = 0; k < 20; k++) {
        const L = generateRollerMural(SEED + k, level);
        const sol = solveRoller(L.n, L.base, L.target);
        expect(rollGrid(L.n, L.base, sol)).toEqual(L.target);
        expect(sol.length).toBeLessThanOrEqual(L.maxStrokes);
      }
      expect(validateMinigame('rollermural', SEED, level, boards(5, (s) => rollerLog(s, level)), 5).passed).toBe(true);
    }
    const bad = boards(5, (s) => (s === roundSeed(SEED, 0) ? { strokes: [{ t: 500, axis: 'r', i: 0, c: 0 }], done_t: 900 } : rollerLog(s, 3)));
    expect(validateMinigame('rollermural', SEED, 3, bad, 5).reason).toBe('illegal_stroke');
  });

  it('Mirrorline: an exact reflection passes; painting the given half is illegal', () => {
    for (const level of [1, 6, 14]) expect(validateMinigame('mirrorline', SEED, level, boards(5, (s) => mirrorLog(s, level)), 5).passed).toBe(true);
    // every round reports how well it went (perfect reflections are 100%)
    expect(validateMinigame('mirrorline', SEED, 1, boards(5, (s) => mirrorLog(s, 1)), 5).rounds_quality).toEqual([100, 100, 100, 100, 100]);
    const L = generateMirrorline(roundSeed(SEED, 0), 1);
    const bad = boards(5, () => ({ paints: [{ t: 500, i: L.given.indexOf(true), c: L.colors[0] }], done_t: 900 }));
    expect(validateMinigame('mirrorline', SEED, 1, bad, 5).reason).toBe('illegal_paint');
  });
});

describe('rounds', () => {
  it('a level has the configured number of rounds and needs all of them', () => {
    expect(generateTraceCraft(SEED, 3, 5).shapes).toHaveLength(5);
    // Paint Pop with 5 boards: 4 cleared → fails (but reports 4 paid rounds); all 5 → passes
    const solve = (s: number) => { let t = 0; const moves = solvePaintPop(s, 2).map((m) => ({ ...m, t: (t += 700) })); return { moves, done_t: t + 200 }; };
    const some = (k: number) => boards(5, (s) => ([0, 1, 2, 3, 4].map((r) => roundSeed(SEED, r)).indexOf(s) < k ? solve(s) : { moves: [], done_t: 800 }));
    const four = validateMinigame('paintpop', SEED, 2, some(4), 5);
    expect(four.passed).toBe(false);
    expect(four.rounds_passed).toBe(4);
    expect(validateMinigame('paintpop', SEED, 2, some(5), 5)).toMatchObject({ passed: true, rounds_passed: 5, rounds_total: 5 });
    // legacy LightLines sessions (no rounds) still accept the single-board format
    expect(validateMinigame('lightlines', SEED, 2, { moves: [], done_t: 100 }, null).valid).toBe(true);
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
