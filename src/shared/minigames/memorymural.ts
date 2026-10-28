// Memory Mural (Fresco plots): a small pixel painting is shown for a few seconds,
// then hidden — repaint it from memory on a blank grid.
import { levelSeed, mulberry32, type Rng } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export const MURAL_COLORS = ['#F5F4EF', '#FF4D6D', '#FFB23F', '#FFE14D', '#3DDC97', '#34C3FF', '#7B5CFF', '#FF4FD8', '#23232A'];

export type MemoryMuralLevel = { level: number; n: number; colors: number[]; target: number[]; previewMs: number; timeLimitMs: number; threshold: number };
export type PaintAction = { t: number; i: number; c: number };
export type MemoryMuralLog = { paints: PaintAction[]; done_t: number };

/** Pictures with some structure (mirrored blobs and stripes) are easier to remember than noise. */
export function muralPattern(rng: Rng, n: number, colors: number[], symmetric: boolean): number[] {
  // retry (deterministically) until the picture has enough paint to be worth remembering
  for (let attempt = 0; ; attempt++) {
    const g = muralOnce(rng, n, colors, symmetric);
    if (attempt >= 8 || g.filter((c) => c !== colors[0]).length >= n) return g;
  }
}

function muralOnce(rng: Rng, n: number, colors: number[], symmetric: boolean): number[] {
  const g = new Array(n * n).fill(colors[0]);
  const strokes = Math.max(2, Math.round(n * 0.9));
  for (let s = 0; s < strokes; s++) {
    const c = colors[1 + rng.int(0, colors.length - 2)];
    let x = rng.int(0, n - 1), y = rng.int(0, n - 1);
    const len = rng.int(2, n);
    for (let k = 0; k < len; k++) {
      g[y * n + x] = c;
      if (rng.chance(0.5)) x = Math.max(0, Math.min(n - 1, x + (rng.chance(0.5) ? 1 : -1)));
      else y = Math.max(0, Math.min(n - 1, y + (rng.chance(0.5) ? 1 : -1)));
    }
  }
  if (symmetric) for (let y = 0; y < n; y++) for (let x = 0; x < n / 2; x++) g[y * n + (n - 1 - x)] = g[y * n + x];
  return g;
}

export function generateMemoryMural(seed: number, level: number): MemoryMuralLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.memorymural));
  const n = Math.min(8, 4 + Math.floor((level - 1) / 5));
  const k = Math.min(MURAL_COLORS.length - 1, 3 + Math.floor((level - 1) / 4));
  const colors = [0, ...rng.shuffle(MURAL_COLORS.map((_, i) => i).slice(1)).slice(0, k - 1)];
  const target = muralPattern(rng, n, colors, level <= 12 || rng.chance(0.5));
  return {
    level, n, colors, target,
    previewMs: Math.max(2200, 5200 - level * 90) + n * n * 35,
    timeLimitMs: 30000 + n * n * 400,
    threshold: Math.min(0.9, 0.7 + level * 0.004),
  };
}

export function paintGrid(n: number, colors: number[], start: number[], paints: PaintAction[], editable?: (i: number) => boolean): number[] | null {
  const g = start.slice();
  for (const p of paints) {
    if (!Number.isInteger(p.i) || p.i < 0 || p.i >= n * n || !colors.includes(p.c)) return null;
    if (editable && !editable(p.i)) return null;
    g[p.i] = p.c;
  }
  return g;
}

export function validateMemoryMural(seed: number, levelNo: number, log: MemoryMuralLog): ValidationResult {
  const L = generateMemoryMural(seed, levelNo);
  if (!log || !Array.isArray(log.paints) || log.paints.length > 1500) return invalid('bad_paints');
  const bad = checkTimes([...log.paints.map((p) => p.t), log.done_t]);
  if (bad) return invalid(bad);
  // painting starts only once the picture is hidden: that's the game
  if (log.paints.some((p) => p.t < L.previewMs - 150)) return invalid('painted_during_preview');
  const grid = paintGrid(L.n, L.colors, new Array(L.n * L.n).fill(L.colors[0]), log.paints);
  if (!grid) return invalid('illegal_paint');
  // score only the cells that matter (painted in the target or by the player),
  // so leaving the canvas blank can't ride on the empty background
  const bg = L.colors[0];
  const rel = grid.map((c, i) => (c !== bg || L.target[i] !== bg ? i : -1)).filter((i) => i >= 0);
  const correct = rel.filter((i) => grid[i] === L.target[i]).length;
  const accuracy = rel.length ? correct / rel.length : 1;
  const used = Math.max(0, log.done_t - L.previewMs);
  const inTime = used <= L.timeLimitMs + 1500;
  const flags: string[] = [];
  if (log.paints.length >= 10) {
    const gaps = log.paints.slice(1).map((p, k) => p.t - log.paints[k].t);
    if (gaps.reduce((s, g) => s + g, 0) / gaps.length < 35) flags.push('superhuman_speed');
  }
  const passed = inTime && accuracy >= L.threshold;
  const speed = clamp01(1 - used / L.timeLimitMs);
  const score = Math.round(accuracy * 600 + (passed ? 150 + speed * 150 + levelNo * 15 : 0));
  const stars = !passed ? 0 : accuracy === 1 ? 3 : accuracy >= (1 + L.threshold) / 2 ? 2 : 1;
  return { valid: true, passed, score, stars: stars as 0 | 1 | 2 | 3, quality: Math.round(accuracy * 100), summary: { accuracy: Math.round(accuracy * 100), correct, cells: rel.length },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}
