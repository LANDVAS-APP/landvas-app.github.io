// LightLines (Lumina plots): rotate mirrors to route coloured beams into matching targets.
//
// Mechanics
//  * Grid of W×H cells. Emitters sit on cells and fire a beam in one direction.
//  * Mirrors are '/' or '\'. Tapping a rotatable mirror toggles it. Fixed mirrors
//    (marked) cannot be rotated. Blocks absorb beams.
//  * A target is lit when a beam of its colour enters it. Beams stop at targets,
//    blocks, emitters and the grid edge; beams pass straight through each other.
//  * Solved when every target is lit by its own colour.
// Levels are built backwards from a solution path, then mirrors are scrambled,
// so every generated puzzle is solvable by construction.
import { levelSeed, mulberry32 } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export type Dir = 0 | 1 | 2 | 3; // 0 = east, 1 = south, 2 = west, 3 = north
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export type BeamColor = 'r' | 'g' | 'b';
export const BEAM_HEX: Record<BeamColor, string> = { r: '#FF3D9A', g: '#7CFF4F', b: '#22E3FF' };

export type LLCell =
  | { k: 'empty' }
  | { k: 'block' }
  | { k: 'mirror'; m: '/' | '\\'; fixed: boolean }
  | { k: 'emitter'; c: BeamColor; d: Dir }
  | { k: 'target'; c: BeamColor };

export type LightLinesLevel = {
  level: number;
  w: number;
  h: number;
  cells: LLCell[]; // initial (scrambled) state, row-major
  solution: ('/' | '\\' | null)[]; // orientation per cell for path mirrors
  par: number; // minimum toggles needed
  parTimeMs: number;
};
export type LightLinesLog = { moves: { t: number; i: number }[]; done_t: number };

const reflect = (d: Dir, m: '/' | '\\'): Dir => {
  // '/' : east<->north, west<->south ; '\' : east<->south, west<->north
  if (m === '/') return ([3, 2, 1, 0] as Dir[])[d];
  return ([1, 0, 3, 2] as Dir[])[d];
};
const mirrorFor = (inDir: Dir, outDir: Dir): '/' | '\\' => (reflect(inDir, '/') === outDir ? '/' : '\\');

export function generateLightLines(seed: number, levelNo: number): LightLinesLevel {
  const rng = mulberry32(levelSeed(seed, levelNo, GAME_SALT.lightlines));
  const size = levelNo <= 3 ? 5 : levelNo <= 8 ? 6 : levelNo <= 15 ? 7 : levelNo <= 25 ? 8 : 9;
  const beams = levelNo <= 4 ? 1 : levelNo <= 12 ? 2 : 3;
  const minTurns = Math.min(1 + Math.floor(levelNo / 4), 6);
  for (let attempt = 0; attempt < 400; attempt++) {
    const w = size, h = size;
    const cells: LLCell[] = Array.from({ length: w * h }, () => ({ k: 'empty' }) as LLCell);
    const used = new Set<number>();
    const solution: ('/' | '\\' | null)[] = new Array(w * h).fill(null);
    const colors: BeamColor[] = (['r', 'g', 'b'] as BeamColor[]).slice(0, beams);
    let ok = true;
    for (const color of colors) {
      // emitter on a border cell, aiming inward
      let placed = false;
      for (let tries = 0; tries < 60 && !placed; tries++) {
        const side = rng.int(0, 3);
        const t = rng.int(1, size - 2);
        const [ex, ey, d] = side === 0 ? [0, t, 0] : side === 1 ? [w - 1, t, 2] : side === 2 ? [t, 0, 1] : [t, h - 1, 3];
        const ei = ey * w + ex;
        if (used.has(ei)) continue;
        // walk
        const path: { i: number; turnTo?: Dir; inDir: Dir }[] = [];
        let x = ex + DX[d], y = ey + DY[d], dir = d as Dir, turns = 0;
        const local = new Set<number>([ei]);
        const targetLen = rng.int(4 + levelNo / 3, 7 + levelNo / 2);
        let steps = 0;
        let good = false;
        while (x >= 0 && y >= 0 && x < w && y < h) {
          const i = y * w + x;
          if (used.has(i) || local.has(i)) break;
          local.add(i);
          steps++;
          const canEnd = steps >= 3 && turns >= Math.min(minTurns, 1 + steps / 3);
          if (canEnd && (steps >= targetLen || rng.chance(0.08))) {
            path.push({ i, inDir: dir });
            good = true;
            break;
          }
          const wantTurn = rng.chance(0.38 + 0.02 * Math.min(levelNo, 15)) || turns < minTurns && steps > 2 && rng.chance(0.5);
          if (wantTurn) {
            const nd = (rng.chance(0.5) ? (dir + 1) % 4 : (dir + 3) % 4) as Dir;
            const nx = x + DX[nd], ny = y + DY[nd];
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && !used.has(ny * w + nx) && !local.has(ny * w + nx)) {
              path.push({ i, turnTo: nd, inDir: dir });
              dir = nd;
              turns++;
              x = nx; y = ny;
              continue;
            }
          }
          path.push({ i, inDir: dir });
          x += DX[dir]; y += DY[dir];
        }
        if (!good || turns < Math.min(minTurns, 4)) continue;
        // commit
        cells[ei] = { k: 'emitter', c: color, d: d as Dir };
        used.add(ei);
        path.forEach((p, idx) => {
          used.add(p.i);
          if (idx === path.length - 1) cells[p.i] = { k: 'target', c: color };
          else if (p.turnTo !== undefined) {
            const m = mirrorFor(p.inDir, p.turnTo);
            solution[p.i] = m;
            cells[p.i] = { k: 'mirror', m, fixed: false };
          }
        });
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (!ok) continue;
    // fixed mirrors (correct) for visual complexity at higher levels
    const pathMirrors = solution.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    if (levelNo >= 10) {
      for (const i of pathMirrors) if (rng.chance(0.2)) (cells[i] as any).fixed = true;
    }
    // decoys and blocks on unused cells
    const free = cells.map((c, i) => (c.k === 'empty' && !used.has(i) ? i : -1)).filter((i) => i >= 0);
    rng.shuffle(free);
    const decoys = Math.min(free.length, Math.floor(levelNo / 2) + 1);
    const blocks = Math.min(free.length - decoys, Math.floor(levelNo / 4));
    for (let k = 0; k < decoys; k++) cells[free[k]] = { k: 'mirror', m: rng.chance(0.5) ? '/' : '\\', fixed: false };
    for (let k = decoys; k < decoys + blocks; k++) cells[free[k]] = { k: 'block' };
    // scramble rotatable path mirrors
    const rot = pathMirrors.filter((i) => !(cells[i] as any).fixed);
    if (rot.length === 0) continue;
    let wrong = 0;
    for (const i of rot) {
      if (rng.chance(0.65)) {
        (cells[i] as any).m = solution[i] === '/' ? '\\' : '/';
        wrong++;
      }
    }
    if (wrong === 0) {
      const i = rot[0];
      (cells[i] as any).m = solution[i] === '/' ? '\\' : '/';
      wrong = 1;
    }
    const level: LightLinesLevel = { level: levelNo, w, h, cells, solution, par: wrong, parTimeMs: 12000 + pathMirrors.length * 3500 };
    if (traceBeams(level.w, level.h, level.cells).solved) continue; // never hand out a solved board
    return level;
  }
  throw new Error('lightlines_generation_failed');
}

export type BeamSegment = { color: BeamColor; points: [number, number][] };

/** Simulate all beams. Returns segments for rendering and the lit status of every target. */
export function traceBeams(w: number, h: number, cells: LLCell[]) {
  const segments: BeamSegment[] = [];
  const lit = new Map<number, Set<BeamColor>>();
  cells.forEach((c, i) => {
    if (c.k !== 'emitter') return;
    let x = i % w, y = Math.floor(i / w), d = c.d;
    const pts: [number, number][] = [[x + 0.5, y + 0.5]];
    const seen = new Set<string>();
    for (let step = 0; step < w * h * 4; step++) {
      x += DX[d]; y += DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h) {
        pts.push([x + 0.5 - DX[d] * 0.5, y + 0.5 - DY[d] * 0.5]);
        break;
      }
      const j = y * w + x;
      const key = `${j}:${d}`;
      if (seen.has(key)) break;
      seen.add(key);
      const cell = cells[j];
      if (cell.k === 'mirror') {
        pts.push([x + 0.5, y + 0.5]);
        d = reflect(d, cell.m);
      } else if (cell.k === 'target') {
        pts.push([x + 0.5, y + 0.5]);
        if (!lit.has(j)) lit.set(j, new Set());
        lit.get(j)!.add(c.c);
        break;
      } else if (cell.k === 'block' || cell.k === 'emitter') {
        pts.push([x + 0.5 - DX[d] * 0.5, y + 0.5 - DY[d] * 0.5]);
        break;
      }
    }
    segments.push({ color: c.c, points: pts });
  });
  let solved = true;
  let targets = 0;
  let litTargets = 0;
  cells.forEach((c, i) => {
    if (c.k !== 'target') return;
    targets++;
    if (lit.get(i)?.has(c.c)) litTargets++;
    else solved = false;
  });
  return { segments, lit, solved: solved && targets > 0, targets, litTargets };
}

export function applyToggle(cells: LLCell[], i: number): boolean {
  const c = cells[i];
  if (!c || c.k !== 'mirror' || c.fixed) return false;
  c.m = c.m === '/' ? '\\' : '/';
  return true;
}

export function validateLightLines(seed: number, levelNo: number, log: LightLinesLog): ValidationResult {
  const level = generateLightLines(seed, levelNo);
  if (!log || !Array.isArray(log.moves) || log.moves.length > 500) return invalid('bad_moves');
  const bad = checkTimes([...log.moves.map((m) => m.t), log.done_t]);
  if (bad) return invalid(bad);
  const cells = level.cells.map((c) => ({ ...c })) as LLCell[];
  for (const m of log.moves) if (!Number.isInteger(m.i) || !applyToggle(cells, m.i)) return invalid('illegal_move');
  const res = traceBeams(level.w, level.h, cells);
  const moves = log.moves.length;
  const flags: string[] = [];
  if (moves >= 6) {
    const gaps = log.moves.slice(1).map((m, k) => m.t - log.moves[k].t);
    if (gaps.reduce((s, g) => s + g, 0) / gaps.length < 70) flags.push('superhuman_speed');
  }
  if (!res.solved) {
    return { valid: true, passed: false, score: Math.round((res.litTargets / Math.max(1, res.targets)) * 100), stars: 0, quality: Math.round((res.litTargets / Math.max(1, res.targets)) * 50),
      summary: { moves, par: level.par, lit: res.litTargets, targets: res.targets }, flags, suspicious: false, min_duration_ms: log.done_t };
  }
  const efficiency = clamp01(level.par / Math.max(moves, level.par));
  const speed = clamp01(1 - log.done_t / (level.parTimeMs * 3));
  const score = Math.round(400 + levelNo * 25 + efficiency * 400 + speed * 200);
  const stars = moves <= level.par + 1 ? 3 : moves <= level.par * 2 + 2 ? 2 : 1;
  return { valid: true, passed: true, score, stars, quality: Math.round(clamp01((level.par + 1) / Math.max(moves, 1)) * 100), summary: { moves, par: level.par, ms: log.done_t, targets: res.targets },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}
