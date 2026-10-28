// PatternShift (Mosaic plots): slide rows and columns of geometric tiles until
// the board matches the target mosaic.
//
// Mechanics: a move shifts one row left/right or one column up/down by one
// cell, wrapping around. Boards are created by scrambling the solved mosaic
// with random moves, so every board is solvable; the generator also verifies
// that replaying the inverse scramble restores the target.
import { levelSeed, mulberry32, type Rng } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export const TILE_COLORS = ['#FF4D6D', '#FFB23F', '#FFE14D', '#22C7B5', '#34C3FF', '#7B5CFF', '#FF4FD8', '#F5F4EF'];
export const TILE_SHAPES = ['square', 'circle', 'diamond', 'triangle', 'ring', 'cross'] as const;
export type Tile = { c: number; s: number }; // colour index, shape index
export type PSMove = { t: number; k: 'r' | 'c'; i: number; d: 1 | -1 };
export type PatternShiftLevel = { level: number; n: number; target: Tile[]; board: Tile[]; par: number; maxMoves: number; scramble: Omit<PSMove, 't'>[] };
export type PatternShiftLog = { moves: PSMove[]; done_t: number };

const same = (a: Tile[], b: Tile[]) => a.every((t, i) => t.c === b[i].c && t.s === b[i].s);

export function applyMove(board: Tile[], n: number, m: Omit<PSMove, 't'>): Tile[] {
  const out = board.slice();
  if (m.k === 'r') {
    for (let x = 0; x < n; x++) out[m.i * n + ((x + m.d + n) % n)] = board[m.i * n + x];
  } else {
    for (let y = 0; y < n; y++) out[((y + m.d + n) % n) * n + m.i] = board[y * n + m.i];
  }
  return out;
}

function mosaic(rng: Rng, n: number, colors: number, shapes: number): Tile[] {
  const palette = rng.shuffle([...TILE_COLORS.keys()]).slice(0, colors);
  const shapeSet = rng.shuffle([...TILE_SHAPES.keys()]).slice(0, shapes);
  const style = rng.int(0, 4);
  const tiles: Tile[] = [];
  const c = (v: number) => palette[((v % colors) + colors) % colors];
  const s = (v: number) => shapeSet[((v % shapes) + shapes) % shapes];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const ring = Math.min(x, y, n - 1 - x, n - 1 - y);
      const diag = Math.abs(x - y);
      switch (style) {
        case 0: tiles.push({ c: c(ring), s: s(ring + (x + y) % 2) }); break; // concentric
        case 1: tiles.push({ c: c(x + y), s: s(y) }); break; // diagonal stripes
        case 2: tiles.push({ c: c(Math.floor(x / Math.ceil(n / 2)) + 2 * Math.floor(y / Math.ceil(n / 2))), s: s(x * y) }); break; // quadrants
        case 3: tiles.push({ c: c(diag), s: s(x + 2 * y) }); break; // chevrons
        default: tiles.push({ c: c(x * 2 + y), s: s((x + y) % 3) }); break; // weave
      }
    }
  return tiles;
}

export function generatePatternShift(seed: number, levelNo: number): PatternShiftLevel {
  const rng = mulberry32(levelSeed(seed, levelNo, GAME_SALT.patternshift));
  const n = levelNo <= 3 ? 3 : levelNo <= 10 ? 4 : levelNo <= 20 ? 5 : 6;
  const colors = Math.min(3 + Math.floor(levelNo / 6), 6);
  const shapes = Math.min(2 + Math.floor(levelNo / 8), 5);
  const target = mosaic(rng, n, colors, shapes);
  const steps = Math.min(2 + Math.floor(levelNo * 0.8), n * n * 2);
  for (let attempt = 0; attempt < 50; attempt++) {
    let board = target.slice();
    const scramble: Omit<PSMove, 't'>[] = [];
    let last: Omit<PSMove, 't'> | null = null;
    while (scramble.length < steps) {
      const m: Omit<PSMove, 't'> = { k: rng.chance(0.5) ? 'r' : 'c', i: rng.int(0, n - 1), d: rng.chance(0.5) ? 1 : -1 };
      if (last && last.k === m.k && last.i === m.i && last.d === -m.d) continue; // no immediate undo
      board = applyMove(board, n, m);
      scramble.push(m);
      last = m;
    }
    if (same(board, target)) continue;
    // solvability self-check: inverse scramble restores the target
    let check = board.slice();
    for (const m of [...scramble].reverse()) check = applyMove(check, n, { k: m.k, i: m.i, d: (-m.d) as 1 | -1 });
    if (!same(check, target)) continue;
    return { level: levelNo, n, target, board, par: steps, maxMoves: steps * 6 + 40, scramble };
  }
  throw new Error('patternshift_generation_failed');
}

export function validatePatternShift(seed: number, levelNo: number, log: PatternShiftLog): ValidationResult {
  const level = generatePatternShift(seed, levelNo);
  if (!log || !Array.isArray(log.moves) || log.moves.length > level.maxMoves) return invalid('bad_moves');
  const bad = checkTimes([...log.moves.map((m) => m.t), log.done_t]);
  if (bad) return invalid(bad);
  let board = level.board;
  for (const m of log.moves) {
    if ((m.k !== 'r' && m.k !== 'c') || !Number.isInteger(m.i) || m.i < 0 || m.i >= level.n || (m.d !== 1 && m.d !== -1)) return invalid('illegal_move');
    board = applyMove(board, level.n, m);
  }
  const solved = same(board, level.target);
  const correct = board.filter((t, i) => t.c === level.target[i].c && t.s === level.target[i].s).length;
  const flags: string[] = [];
  if (log.moves.length >= 6) {
    const gaps = log.moves.slice(1).map((m, k) => m.t - log.moves[k].t);
    if (gaps.reduce((s, g) => s + g, 0) / gaps.length < 60) flags.push('superhuman_speed');
  }
  if (!solved) {
    return { valid: true, passed: false, score: Math.round((correct / board.length) * 100), stars: 0, quality: Math.round((correct / board.length) * 50),
      summary: { moves: log.moves.length, par: level.par, correct, tiles: board.length }, flags, suspicious: false, min_duration_ms: log.done_t };
  }
  const moves = log.moves.length;
  const efficiency = clamp01(level.par / Math.max(moves, 1));
  const speed = clamp01(1 - log.done_t / (level.par * 9000 + 20000));
  const score = Math.round(400 + levelNo * 25 + efficiency * 450 + speed * 200);
  const stars = moves <= level.par ? 3 : moves <= level.par * 2 ? 2 : 1;
  return { valid: true, passed: true, score, stars, quality: Math.round(efficiency * 100), summary: { moves, par: level.par, ms: log.done_t },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}
