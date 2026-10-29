// Produce a human-paced winning move log for any minigame level (tests only).
import { roundSeed } from '../../src/shared/minigames/boards';
import { generateColorBurst } from '../../src/shared/minigames/colorburst';
import { generateRollerMural, solveRoller } from '../../src/shared/minigames/rollermural';
import { generateLightLines } from '../../src/shared/minigames/lightlines';
import { generateMemoryMural } from '../../src/shared/minigames/memorymural';
import { generateMirrorline } from '../../src/shared/minigames/mirrorline';
import { solvePaintPop } from '../../src/shared/minigames/paintpop';
import { generateSculptor, sculpt } from '../../src/shared/minigames/sculptor';
import { generateTraceCraft, resample } from '../../src/shared/minigames/tracecraft';

function board(game: string, seed: number, level: number): { done_t: number } & Record<string, unknown> {
  let t = 0;
  if (game === 'lightlines') {
    const L = generateLightLines(seed, level);
    const moves = L.cells.map((c, i) => ({ c, i })).filter(({ c, i }) => c.k === 'mirror' && L.solution[i] && c.m !== L.solution[i]).map(({ i }) => ({ t: (t += 500), i }));
    return { moves, done_t: t + 100 };
  }
  if (game === 'paintpop') {
    return { moves: solvePaintPop(seed, level).map((m) => ({ t: (t += 600), ...m })), done_t: t + 100 };
  }
  if (game === 'memorymural') {
    const L = generateMemoryMural(seed, level);
    t = L.previewMs + 300;
    return { paints: L.target.map((c, i) => ({ t: (t += 110), i, c })), done_t: t + 100 };
  }
  if (game === 'mirrorline') {
    const L = generateMirrorline(seed, level);
    return { paints: L.target.map((c, i) => ({ c, i })).filter(({ i }) => !L.given[i]).map(({ c, i }) => ({ t: (t += 110), i, c })), done_t: t + 100 };
  }
  if (game === 'rollermural') {
    const L = generateRollerMural(seed, level);
    return { strokes: solveRoller(L.n, L.base, L.target).map((x) => ({ ...x, t: (t += 300) })), done_t: t + 100 };
  }
  if (game === 'sculptor') {
    const L = generateSculptor(seed, level);
    let r = L.start;
    const moves: { t: number; v: number; r: number }[] = [];
    for (let pass = 0; pass < 6; pass++) for (let v = 0; v < L.v; v++) { r = sculpt(r, L.falloff, v, L.target[v]); moves.push({ t: (t += 45 + ((v * 7) % 13)), v, r: L.target[v] }); }
    return { moves, done_t: t + 100 };
  }
  throw new Error(`no board solver for ${game}`);
}

export function solveMinigame(game: string, seed: number, level: number, rounds: number | null): unknown {
  let t = 0;
  if (game === 'tracecraft') {
    const L = generateTraceCraft(seed, level, rounds ?? 3);
    // human-like: slightly irregular timing and a little tremor (perfectly regular input is flagged as robotic)
    return { strokes: L.shapes.map((s) => ({ points: resample(s.points, 100).map(([x, y], k) => [x + Math.sin(k * 1.7) * 0.002, y + Math.cos(k * 2.3) * 0.002, (t += 12 + ((k * 7) % 11))]) })) };
  }
  if (game === 'colorburst') {
    const L = generateColorBurst(seed, level, rounds ?? undefined);
    return { rounds: L.rounds.map((r) => { const actions = r.recipe.flatMap((n, p) => Array.from({ length: n }, () => ({ t: (t += 250), a: 'add', p }))); return { actions, submit_t: (t += 400) }; }) };
  }
  if (rounds == null) return board(game, seed, level);
  let t0 = 0;
  return { boards: Array.from({ length: rounds }, (_, r) => { const log = board(game, roundSeed(seed, r), level); const b = { t0, log }; t0 += log.done_t + 300; return b; }) };
}
