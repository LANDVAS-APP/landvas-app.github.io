// HueFlow (Prism plots): a smooth colour gradient has been shuffled. Swap tiles
// to restore it; tiles with a dot are pinned in place as guides.
import { hsvToRgb, rgbToHex } from '../color';
import { levelSeed, mulberry32 } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export type HueFlowLevel = { level: number; w: number; h: number; colors: string[]; locked: boolean[]; board: number[]; par: number; maxSwaps: number; parTimeMs: number };
export type HueSwap = { t: number; a: number; b: number };
export type HueFlowLog = { swaps: HueSwap[]; done_t: number };

export function generateHueFlow(seed: number, level: number): HueFlowLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.hueflow));
  const w = Math.min(7, 4 + Math.floor((level - 1) / 6));
  const h = Math.min(9, 5 + Math.floor((level - 1) / 4));
  const h0 = rng.next() * 360;
  const spread = Math.max(70, 160 - level * 3);
  const corners = [0, 1, 2, 3].map((k) => {
    const hue = (h0 + [0, spread * 0.5, spread, spread * 1.5][k] + rng.next() * 20) % 360;
    return hsvToRgb(hue, 0.45 + rng.next() * 0.4, 0.55 + rng.next() * 0.4);
  });
  const colors: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = y / (h - 1);
    const c = [0, 1, 2].map((ch) => Math.round(
      corners[0][ch] * (1 - u) * (1 - v) + corners[1][ch] * u * (1 - v) + corners[2][ch] * (1 - u) * v + corners[3][ch] * u * v)) as [number, number, number];
    colors.push(rgbToHex(c));
  }
  // pinned guides: the corners always, plus a sprinkle that thins out with level
  const locked = colors.map((_, i) => {
    const x = i % w, y = Math.floor(i / w);
    const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
    return corner || ((x + y) % 2 === 0 && rng.chance(Math.max(0.05, 0.4 - level * 0.02)));
  });
  const free = colors.map((_, i) => i).filter((i) => !locked[i]);
  const shuffled = rng.shuffle(free.slice());
  const board = colors.map((_, i) => i);
  free.forEach((pos, k) => { board[pos] = shuffled[k]; });
  // minimum swaps = misplaced tiles - cycles
  const seen = new Set<number>();
  let par = 0;
  for (const i of free) {
    if (seen.has(i) || board[i] === i) continue;
    let len = 0, j = i;
    while (!seen.has(j)) { seen.add(j); j = board[j]; len++; }
    par += len - 1;
  }
  return { level, w, h, colors, locked, board, par, maxSwaps: free.length * 4 + 10, parTimeMs: 6000 + free.length * 1800 };
}

export function applySwap(board: number[], locked: boolean[], a: number, b: number): number[] | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0 || a >= board.length || b >= board.length || locked[a] || locked[b]) return null;
  const out = board.slice();
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

export function validateHueFlow(seed: number, levelNo: number, log: HueFlowLog): ValidationResult {
  const L = generateHueFlow(seed, levelNo);
  if (!log || !Array.isArray(log.swaps) || log.swaps.length > L.maxSwaps) return invalid('bad_swaps');
  const bad = checkTimes([...log.swaps.map((s) => s.t), log.done_t]);
  if (bad) return invalid(bad);
  let board = L.board;
  for (const s of log.swaps) {
    const next = applySwap(board, L.locked, s.a, s.b);
    if (!next) return invalid('illegal_swap');
    board = next;
  }
  const correct = board.filter((v, i) => v === i).length;
  const solved = correct === board.length;
  const flags: string[] = [];
  if (log.swaps.length >= 6) {
    const gaps = log.swaps.slice(1).map((s, k) => s.t - log.swaps[k].t);
    if (gaps.reduce((s, g) => s + g, 0) / gaps.length < 90) flags.push('superhuman_speed');
  }
  if (!solved) return { valid: true, passed: false, score: Math.round((correct / board.length) * 200), stars: 0,
    summary: { correct, tiles: board.length, swaps: log.swaps.length }, flags, suspicious: false, min_duration_ms: log.done_t };
  const swaps = log.swaps.length;
  const efficiency = clamp01(L.par / Math.max(swaps, 1));
  const speed = clamp01(1 - log.done_t / (L.parTimeMs * 3));
  const score = Math.round(400 + levelNo * 25 + efficiency * 400 + speed * 200);
  const stars = swaps <= L.par ? 3 : swaps <= L.par * 1.6 + 2 ? 2 : 1;
  return { valid: true, passed: true, score, stars, summary: { swaps, par: L.par, ms: log.done_t }, flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}
