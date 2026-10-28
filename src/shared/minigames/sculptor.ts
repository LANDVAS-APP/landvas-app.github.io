// Sculptor (Clay plots): a lump of clay is a ring of handles around its centre.
// Drag the handles in and out (neighbours follow a little, like real clay) until
// the sculpture matches the target silhouette. Scored by overlap (IoU).
import { levelSeed, mulberry32, type Rng } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

export type SculptorLevel = { level: number; v: number; name: string; target: number[]; start: number[]; falloff: number[]; timeLimitMs: number; threshold: number };
export type SculptMove = { t: number; v: number; r: number };
export type SculptorLog = { moves: SculptMove[]; done_t: number };

const TAU = Math.PI * 2;
export const R_MIN = 0.12, R_MAX = 1;

type Family = { name: string; min: number; f: (a: number, rng: Rng) => (t: number) => number };
const FAMILIES: Family[] = [
  { name: 'Egg', min: 1, f: (a) => (t) => 0.62 + 0.14 * Math.cos(t - a) },
  { name: 'Bean', min: 1, f: (a) => (t) => 0.6 + 0.18 * Math.cos(2 * (t - a)) },
  { name: 'Clover', min: 3, f: (a) => (t) => 0.58 + 0.24 * Math.cos(3 * (t - a)) },
  { name: 'Heart', min: 4, f: () => (t) => { const s = Math.sin(t), c = Math.cos(t); return 0.42 + 0.3 * Math.abs(c) ** 0.8 * (s < 0 ? 1.05 : 0.6) + 0.18 * (s > 0 ? s : 0); } },
  { name: 'Star', min: 6, f: (a) => (t) => 0.5 + 0.33 * Math.cos(5 * (t - a)) ** 3 },
  { name: 'Flower', min: 8, f: (a) => (t) => 0.62 + 0.24 * Math.abs(Math.cos(3 * (t - a))) - 0.08 },
  { name: 'Face', min: 10, f: () => (t) => { const s = Math.sin(t), c = Math.cos(t); const ears = 0.16 * Math.exp(-((Math.abs(c) - 0.98) ** 2) * 60); const chin = s > 0 ? -0.06 * s : 0.04 * -s; return 0.66 + ears + chin; } },
  { name: 'Crown', min: 12, f: (a) => (t) => 0.55 + (Math.sin(t) < 0 ? 0.25 * Math.abs(Math.cos(2.5 * (t - a))) : 0.05) },
  { name: 'Shell', min: 14, f: (a) => (t) => 0.45 + 0.3 * (((t - a) % TAU + TAU) % TAU) / TAU },
];

export function generateSculptor(seed: number, level: number): SculptorLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.sculptor));
  const v = Math.min(28, 12 + level);
  const pool = FAMILIES.filter((f) => f.min <= level);
  const fam = rng.pick(pool);
  const fn = fam.f(rng.next() * TAU, rng);
  const raw = Array.from({ length: v }, (_, i) => fn((i / v) * TAU));
  const lo = Math.min(...raw), hi = Math.max(...raw);
  const target = raw.map((x) => Math.round((0.3 + ((x - lo) / Math.max(hi - lo, 1e-6)) * 0.58) * 1000) / 1000);
  return {
    level, v, name: fam.name, target,
    start: new Array(v).fill(0.6),
    falloff: level <= 6 ? [1, 0.55, 0.22] : level <= 14 ? [1, 0.45, 0.12] : [1, 0.35],
    timeLimitMs: Math.max(30000, 60000 - level * 800),
    threshold: Math.min(0.93, 0.8 + level * 0.005),
  };
}

/** Pull handle v to radius r; neighbours follow by the falloff. Deterministic. */
export function sculpt(radii: number[], falloff: number[], v: number, r: number): number[] {
  const out = radii.slice();
  const n = radii.length;
  const d = r - radii[v];
  for (let k = -(falloff.length - 1); k < falloff.length; k++) {
    const j = (((v + k) % n) + n) % n;
    out[j] = Math.round(Math.max(R_MIN, Math.min(R_MAX, out[j] + d * falloff[Math.abs(k)])) * 1000) / 1000;
  }
  out[v] = Math.round(Math.max(R_MIN, Math.min(R_MAX, r)) * 1000) / 1000;
  return out;
}

export function polygon(radii: number[]): [number, number][] {
  return radii.map((r, i) => {
    const a = (i / radii.length) * TAU - Math.PI / 2;
    return [0.5 + 0.48 * r * Math.cos(a), 0.5 + 0.48 * r * Math.sin(a)];
  });
}

function inside(poly: [number, number][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Overlap of two sculptures on a 72x72 raster (intersection over union). */
export function iou(a: number[], b: number[]) {
  const pa = polygon(a), pb = polygon(b);
  let inter = 0, union = 0;
  const N = 72;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = (x + 0.5) / N, py = (y + 0.5) / N;
    const ia = inside(pa, px, py), ib = inside(pb, px, py);
    if (ia && ib) inter++;
    if (ia || ib) union++;
  }
  return union ? inter / union : 0;
}

export function validateSculptor(seed: number, levelNo: number, log: SculptorLog): ValidationResult {
  const L = generateSculptor(seed, levelNo);
  if (!log || !Array.isArray(log.moves) || log.moves.length > 800) return invalid('bad_moves');
  const bad = checkTimes([...log.moves.map((m) => m.t), log.done_t]);
  if (bad) return invalid(bad);
  let radii = L.start;
  for (const m of log.moves) {
    if (!Number.isInteger(m.v) || m.v < 0 || m.v >= L.v || typeof m.r !== 'number' || !Number.isFinite(m.r)) return invalid('illegal_move');
    radii = sculpt(radii, L.falloff, m.v, m.r);
  }
  const match = iou(radii, L.target);
  const inTime = log.done_t <= L.timeLimitMs + 1500;
  const flags: string[] = [];
  if (log.moves.length >= 12) {
    const gaps = log.moves.slice(1).map((m, k) => m.t - log.moves[k].t);
    if (gaps.reduce((s, g) => s + g, 0) / gaps.length < 12) flags.push('superhuman_speed');
  }
  const passed = inTime && match >= L.threshold;
  const speed = clamp01(1 - log.done_t / L.timeLimitMs);
  const score = Math.round(match * 600 + (passed ? 150 + speed * 150 + levelNo * 15 : 0));
  const stars = !passed ? 0 : match >= 0.96 ? 3 : match >= (L.threshold + 0.96) / 2 ? 2 : 1;
  return { valid: true, passed, score, stars: stars as 0 | 1 | 2 | 3, quality: Math.round(match * 100), summary: { match: Math.round(match * 100), shape: L.name },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}
