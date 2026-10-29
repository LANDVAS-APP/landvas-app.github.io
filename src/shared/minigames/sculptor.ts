// Sculptor (Clay plots): a party-game face-stretcher. A cartoon face is shown in a frame;
// its clay copy below has been squashed and stretched out of shape. Grab any part of the
// clay face — an eye, the nose, the chin, an ear — and pull it back where it belongs. The
// clay is elastic: nearby features get dragged along a little, more so on later levels.
// Scored by how close every feature ends up to the portrait.
import { levelSeed, mulberry32, type Rng } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, type ValidationResult } from './types';

/** Feature points of a face, in board units (0..1). */
export const FEATURES = ['top', 'templeL', 'templeR', 'cheekL', 'cheekR', 'chin', 'eyeL', 'eyeR', 'browL', 'browR', 'nose', 'mouthL', 'mouthR', 'lip', 'earL', 'earR'] as const;
export const K = FEATURES.length;
export type Pt = [number, number];
export type Look = { skin: string; shade: string; hair: string; hairStyle: number; eyes: string; name: string };
export type SculptorLevel = { level: number; v: number; name: string; target: Pt[]; start: Pt[]; weights: number[][]; look: Look; ghost: boolean; timeLimitMs: number; threshold: number };
export type SculptMove = { t: number; v: number; x: number; y: number };
export type SculptorLog = { moves: SculptMove[]; done_t: number };

const SKINS: [string, string][] = [['#F6C9A8', '#D9987A'], ['#E8B08A', '#C27D5A'], ['#C98B62', '#9C6342'], ['#8D5A3B', '#6A3F27'], ['#FFD9B8', '#E5A986'], ['#A8E6CF', '#6FBF9E'], ['#C7B8FF', '#9A86E8']];
const HAIR = ['#2B1B12', '#5A3A22', '#C9772F', '#F2D16B', '#E5E5EA', '#FF4D6D', '#34C3FF', '#7B5CFF'];
const EYES = ['#3B2A1E', '#2E6BD6', '#2F8F5B', '#6B4A2B', '#23232A'];
const NAMES = ['Bram', 'Juno', 'Pip', 'Odessa', 'Mott', 'Lulu', 'Rex', 'Tilly', 'Gus', 'Wren', 'Ziggy', 'Noor', 'Basil', 'Coco', 'Hank', 'Ivy'];
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clampPt = (x: number) => r3(Math.max(0.03, Math.min(0.97, x)));

function face(rng: Rng): Pt[] {
  const w = 0.25 + rng.next() * 0.06; // half head width
  const top = 0.15 + rng.next() * 0.05, chin = 0.83 + rng.next() * 0.06;
  const eyeY = 0.43 + rng.next() * 0.05, eyeX = 0.1 + rng.next() * 0.04;
  const noseY = eyeY + 0.12 + rng.next() * 0.04;
  const mouthY = noseY + 0.1 + rng.next() * 0.04, mouthW = 0.08 + rng.next() * 0.05;
  return [
    [0.5, top], [0.5 - w, 0.36], [0.5 + w, 0.36], [0.5 - w * 0.88, 0.64], [0.5 + w * 0.88, 0.64], [0.5, chin],
    [0.5 - eyeX, eyeY], [0.5 + eyeX, eyeY], [0.5 - eyeX - 0.01, eyeY - 0.08], [0.5 + eyeX + 0.01, eyeY - 0.08],
    [0.5, noseY], [0.5 - mouthW, mouthY], [0.5 + mouthW, mouthY], [0.5, mouthY + 0.035 + rng.next() * 0.02],
    [0.5 - w - 0.035, 0.5], [0.5 + w + 0.035, 0.5],
  ].map(([x, y]) => [r3(x), r3(y)] as Pt);
}

export function generateSculptor(seed: number, level: number): SculptorLevel {
  const rng = mulberry32(levelSeed(seed, level, GAME_SALT.sculptor));
  const target = face(rng);
  const [skin, shade] = rng.pick(SKINS);
  const look: Look = { skin, shade, hair: rng.pick(HAIR), hairStyle: rng.int(0, 3), eyes: rng.pick(EYES), name: rng.pick(NAMES) };
  // elasticity: how much a pull drags the features around it (none at first, more later)
  const sigma = level <= 3 ? 0 : Math.min(0.2, 0.06 + level * 0.008);
  const weights = target.map((a, i) => target.map((b, j) => (i === j ? 1 : sigma ? r3(Math.exp(-((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) / (sigma * sigma)) * 0.55) : 0)));
  // scramble: every feature is pushed off its spot, harder on later levels
  const amp = Math.min(0.2, 0.08 + level * 0.006);
  const start = target.map(([x, y]) => {
    const a = rng.next() * Math.PI * 2, d = amp * (0.45 + rng.next() * 0.55);
    return [clampPt(x + Math.cos(a) * d), clampPt(y + Math.sin(a) * d)] as Pt;
  });
  return {
    level, v: K, name: look.name, target, start, weights, look,
    ghost: level <= 5,
    timeLimitMs: Math.max(20000, 36000 - level * 600),
    threshold: Math.min(0.9, 0.78 + level * 0.005),
  };
}

/** Pull feature v to (x, y); nearby features follow by their elastic weight. Deterministic. */
export function sculpt(pts: Pt[], weights: number[][], v: number, x: number, y: number): Pt[] {
  const dx = clampPt(x) - pts[v][0], dy = clampPt(y) - pts[v][1];
  return pts.map(([px, py], j) => {
    const w = weights[v][j];
    return w ? [clampPt(px + dx * w), clampPt(py + dy * w)] as Pt : [px, py] as Pt;
  });
}

/** 0 (scrambled) … 1 (the portrait exactly). */
export function closeness(pts: Pt[], target: Pt[]) {
  let e = 0;
  for (let i = 0; i < target.length; i++) e += Math.hypot(pts[i][0] - target[i][0], pts[i][1] - target[i][1]);
  return clamp01(1 - e / target.length / 0.1);
}

export function validateSculptor(seed: number, levelNo: number, log: SculptorLog): ValidationResult {
  const L = generateSculptor(seed, levelNo);
  if (!log || !Array.isArray(log.moves) || log.moves.length > 1500) return invalid('bad_moves');
  const bad = checkTimes([...log.moves.map((m) => m.t), log.done_t]);
  if (bad) return invalid(bad);
  let pts = L.start;
  for (const m of log.moves) {
    if (!Number.isInteger(m.v) || m.v < 0 || m.v >= L.v || ![m.x, m.y].every((n) => typeof n === 'number' && Number.isFinite(n))) return invalid('illegal_move');
    pts = sculpt(pts, L.weights, m.v, m.x, m.y);
  }
  const match = closeness(pts, L.target);
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
  return { valid: true, passed, score, stars: stars as 0 | 1 | 2 | 3, quality: Math.round(match * 100), summary: { match: Math.round(match * 100), face: L.name },
    flags, suspicious: flags.length > 0, min_duration_ms: log.done_t };
}
