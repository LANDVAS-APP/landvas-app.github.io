// Mirrorline (Glass plots): half of a pixel design is painted — complete the
// reflection across the mirror line. Later levels mirror both ways (quarters).
import { levelSeed, mulberry32 } from './rng';
import { MURAL_COLORS, muralPattern, paintGrid, type PaintAction } from './memorymural';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export { MURAL_COLORS as MIRROR_COLORS };
export type MirrorMode = 'vertical' | 'horizontal' | 'quad';
export type MirrorlineLevel = { level: number; n: number; mode: MirrorMode; colors: number[]; target: number[]; given: boolean[]; start: number[]; timeLimitMs: number; threshold: number };
export type MirrorlineLog = { paints: PaintAction[]; done_t: number };

export function generateMirrorline(seed: number, level: number): MirrorlineLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.mirrorline));
  const n = Math.min(10, 6 + 2 * Math.floor((level - 1) / 6));
  const mode: MirrorMode = level <= 4 ? 'vertical' : level <= 9 ? rng.pick(['vertical', 'horizontal'] as const) : rng.pick(['vertical', 'horizontal', 'quad'] as const);
  const k = Math.min(MURAL_COLORS.length - 1, 3 + Math.floor((level - 1) / 4));
  const colors = [0, ...rng.shuffle(MURAL_COLORS.map((_, i) => i).slice(1)).slice(0, k - 1)];
  const half = muralPattern(rng, n, colors, false);
  const h = n / 2;
  const src = (x: number, y: number) => {
    const sx = mode !== 'horizontal' && x >= h ? n - 1 - x : x;
    const sy = mode !== 'vertical' && y >= h ? n - 1 - y : y;
    return half[sy * n + sx];
  };
  const target: number[] = [];
  const given: boolean[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    target.push(src(x, y));
    given.push((mode === 'horizontal' || x < h) && (mode === 'vertical' || y < h));
  }
  const start = target.map((c, i) => (given[i] ? c : colors[0]));
  return { level, n, mode, colors, target, given, start, timeLimitMs: 25000 + n * n * 350 - level * 300, threshold: Math.min(0.95, 0.8 + level * 0.004) };
}

export function validateMirrorline(seed: number, levelNo: number, log: MirrorlineLog): ValidationResult {
  const L = generateMirrorline(seed, levelNo);
  if (!log || !Array.isArray(log.paints) || log.paints.length > 2000) return invalid('bad_paints');
  const bad = checkTimes([...log.paints.map((p) => p.t), log.done_t]);
  if (bad) return invalid(bad);
  const grid = paintGrid(L.n, L.colors, L.start, log.paints, (i) => !L.given[i]);
  if (!grid) return invalid('illegal_paint');
  // only cells that matter: painted in the target or by the player (blank can't pass)
  const open = L.given.map((g, i) => (!g && (L.target[i] !== L.colors[0] || grid[i] !== L.colors[0]) ? i : -1)).filter((i) => i >= 0);
  const correct = open.filter((i) => grid[i] === L.target[i]).length;
  const accuracy = correct / Math.max(1, open.length);
  const inTime = log.done_t <= Math.max(10000, L.timeLimitMs) + 1500;
  const flags: string[] = [];
  if (log.paints.length >= 10) {
    const gaps = log.paints.slice(1).map((p, k) => p.t - log.paints[k].t);
    if (gaps.reduce((s, g) => s + g, 0) / gaps.length < 35) flags.push('superhuman_speed');
  }
  const passed = inTime && accuracy >= L.threshold;
  const speed = clamp01(1 - log.done_t / Math.max(10000, L.timeLimitMs));
  const score = Math.round(accuracy * 600 + (passed ? 150 + speed * 150 + levelNo * 15 : 0));
  const stars = !passed ? 0 : accuracy === 1 && speed > 0.35 ? 3 : accuracy === 1 ? 2 : 1;
  return { valid: true, passed, score, stars: stars as 0 | 1 | 2 | 3, quality: Math.round(accuracy * 100), summary: { accuracy: Math.round(accuracy * 100), mode: L.mode },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}
