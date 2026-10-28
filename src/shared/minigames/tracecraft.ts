// TraceCraft (Graphite plots): trace progressively harder paths in one stroke.
// Scoring = line accuracy (distance to the guide), completion (how much of the
// guide was covered) and movement quality (no wobble, sensible path length).
import { levelSeed, mulberry32, type Rng } from './rng';
import { GAME_SALT, checkTimes, clamp01, invalid, roundsToPass, type ValidationResult } from './types';

export type Pt = [number, number]; // normalised 0..1 canvas coordinates
export type TraceShape = { name: string; points: Pt[]; closed: boolean };
export type TraceCraftLevel = { level: number; shapes: TraceShape[]; tolerance: number };
export type TraceStroke = { points: [number, number, number][] }; // x, y, t(ms since session start)
export type TraceCraftLog = { strokes: TraceStroke[] };

const TAU = Math.PI * 2;

function transform(pts: Pt[], rng: Rng, jitterRot = true): Pt[] {
  const rot = jitterRot ? (rng.next() - 0.5) * 0.8 : 0;
  const sc = 0.82 + rng.next() * 0.12;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  return pts.map(([x, y]) => {
    const dx = x - 0.5, dy = y - 0.5;
    return [0.5 + (dx * cos - dy * sin) * sc, 0.5 + (dx * sin + dy * cos) * sc] as Pt;
  });
}

function sample(f: (u: number) => Pt, n = 160): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}

const SHAPES: { name: string; min: number; closed: boolean; make: (rng: Rng) => Pt[] }[] = [
  { name: 'Horizon line', min: 1, closed: false, make: () => [[0.12, 0.5], [0.88, 0.5]] },
  { name: 'Arc', min: 1, closed: false, make: () => sample((u) => [0.5 + 0.38 * Math.cos(Math.PI + u * Math.PI), 0.62 + 0.38 * Math.sin(Math.PI + u * Math.PI)]) },
  { name: 'Circle', min: 2, closed: true, make: () => sample((u) => [0.5 + 0.36 * Math.cos(u * TAU), 0.5 + 0.36 * Math.sin(u * TAU)]) },
  { name: 'Square', min: 2, closed: true, make: () => [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]] },
  { name: 'Triangle', min: 3, closed: true, make: () => [[0.5, 0.15], [0.85, 0.8], [0.15, 0.8], [0.5, 0.15]] },
  { name: 'Zigzag', min: 4, closed: false, make: (r) => { const k = r.int(3, 5); return Array.from({ length: k * 2 + 1 }, (_, i) => [0.12 + (0.76 * i) / (k * 2), i % 2 ? 0.32 : 0.68] as Pt); } },
  { name: 'Wave', min: 5, closed: false, make: (r) => { const f = r.int(2, 3); return sample((u) => [0.1 + 0.8 * u, 0.5 + 0.22 * Math.sin(u * TAU * f)]); } },
  { name: 'Spiral', min: 7, closed: false, make: () => sample((u) => { const a = u * TAU * 2.5; const rr = 0.04 + 0.36 * u; return [0.5 + rr * Math.cos(a), 0.5 + rr * Math.sin(a)]; }, 220) },
  { name: 'Star', min: 8, closed: true, make: (r) => { const k = r.int(5, 6); return Array.from({ length: k * 2 + 1 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / k; const rr = i % 2 ? 0.16 : 0.4; return [0.5 + rr * Math.cos(a), 0.5 + rr * Math.sin(a)] as Pt; }); } },
  { name: 'Heart', min: 9, closed: true, make: () => sample((u) => { const t = u * TAU; return [0.5 + 0.024 * 16 * Math.pow(Math.sin(t), 3), 0.47 - 0.024 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; }, 200) },
  { name: 'Infinity', min: 11, closed: true, make: () => sample((u) => { const t = u * TAU; const d = 1 + Math.sin(t) ** 2; return [0.5 + (0.38 * Math.cos(t)) / d, 0.5 + (0.38 * Math.sin(t) * Math.cos(t)) / d]; }, 220) },
  { name: 'Rose', min: 13, closed: true, make: (r) => { const k = r.pick([3, 5]); return sample((u) => { const t = u * Math.PI * (k % 2 ? 1 : 2); const rr = 0.38 * Math.cos(k * t); return [0.5 + rr * Math.cos(t), 0.5 + rr * Math.sin(t)]; }, 260); } },
  { name: 'Lissajous', min: 15, closed: true, make: (r) => { const a = r.pick([1, 2, 3]); const b = a + r.pick([1, 2]); return sample((u) => [0.5 + 0.38 * Math.sin(a * u * TAU + Math.PI / 2), 0.5 + 0.38 * Math.sin(b * u * TAU)], 280); } },
];

export function generateTraceCraft(seed: number, levelNo: number, rounds = 3): TraceCraftLevel {
  const rng = mulberry32(levelSeed(seed, levelNo, GAME_SALT.tracecraft));
  const pool = SHAPES.filter((s) => s.min <= levelNo);
  const recent = pool.slice(-4);
  const shapes: TraceShape[] = [];
  for (let k = 0; k < rounds; k++) {
    const def = k >= 2 && levelNo > 2 ? rng.pick(recent) : rng.pick(pool);
    shapes.push({ name: def.name, closed: def.closed, points: transform(def.make(rng), rng, levelNo > 2) });
  }
  return { level: levelNo, shapes, tolerance: Math.max(0.026, 0.06 - levelNo * 0.0012) };
}

// ---- geometry ---------------------------------------------------------------

function pathLength(p: Pt[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
}

export function resample(p: Pt[], n: number): Pt[] {
  if (p.length === 0) return [];
  if (p.length === 1) return Array.from({ length: n }, () => p[0]);
  const total = pathLength(p);
  if (total === 0) return Array.from({ length: n }, () => p[0]);
  const step = total / (n - 1);
  const out: Pt[] = [p[0]];
  let acc = 0;
  let i = 1;
  let prev = p[0];
  while (out.length < n && i < p.length) {
    const d = Math.hypot(p[i][0] - prev[0], p[i][1] - prev[1]);
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const q: Pt = [prev[0] + t * (p[i][0] - prev[0]), prev[1] + t * (p[i][1] - prev[1])];
      out.push(q);
      prev = q;
      acc = 0;
    } else {
      acc += d;
      prev = p[i];
      i++;
    }
  }
  while (out.length < n) out.push(p[p.length - 1]);
  return out;
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function distToPath(p: Pt, path: Pt[]): number {
  let m = Infinity;
  for (let i = 1; i < path.length; i++) m = Math.min(m, distToSeg(p, path[i - 1], path[i]));
  return path.length === 1 ? Math.hypot(p[0] - path[0][0], p[1] - path[0][1]) : m;
}

function wobble(p: Pt[]): number {
  // mean absolute turning angle between successive segments
  let s = 0, n = 0;
  for (let i = 2; i < p.length; i++) {
    const a1 = Math.atan2(p[i - 1][1] - p[i - 2][1], p[i - 1][0] - p[i - 2][0]);
    const a2 = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = TAU - d;
    s += d; n++;
  }
  return n ? s / n : 0;
}

export function scoreStroke(shape: TraceShape, tolerance: number, raw: Pt[]) {
  if (raw.length < 2) return { accuracy: 0, coverage: 0, quality: 0, score: 0, passed: false, lenRatio: 0 };
  const guide = resample(shape.points, 200);
  const drawn = resample(raw, 200);
  const meanDist = drawn.reduce((s, q) => s + distToPath(q, guide), 0) / drawn.length;
  const accuracy = clamp01(1 - meanDist / (tolerance * 1.6));
  const covered = guide.filter((q) => distToPath(q, drawn) <= tolerance * 1.25).length / guide.length;
  const lenRatio = pathLength(raw) / Math.max(pathLength(shape.points), 1e-6);
  const lenScore = clamp01(1 - Math.abs(lenRatio - 1) * 1.4);
  // measured at a coarse resolution so natural hand tremor is not punished
  const excessWobble = Math.max(0, wobble(resample(raw, 64)) - wobble(resample(shape.points, 64)));
  const smooth = clamp01(1 - excessWobble * 2);
  const quality = 0.5 * lenScore + 0.5 * smooth;
  const score = Math.round(1000 * (0.5 * accuracy + 0.35 * covered + 0.15 * quality));
  const passed = accuracy >= 0.55 && covered >= 0.75 && lenRatio >= 0.6 && lenRatio <= 1.9;
  return { accuracy, coverage: covered, quality, score, passed, lenRatio };
}

export function validateTraceCraft(seed: number, levelNo: number, log: TraceCraftLog, rounds = 3): ValidationResult {
  const level = generateTraceCraft(seed, levelNo, rounds);
  if (!log || !Array.isArray(log.strokes) || log.strokes.length !== level.shapes.length) return invalid('stroke_count_mismatch');
  const times: number[] = [];
  for (const s of log.strokes) {
    if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > 4000) return invalid('bad_stroke');
    for (const p of s.points) {
      if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) return invalid('bad_point');
      if (p[0] < -0.2 || p[0] > 1.2 || p[1] < -0.2 || p[1] > 1.2) return invalid('point_out_of_bounds');
      times.push(p[2]);
    }
  }
  const bad = checkTimes(times);
  if (bad) return invalid(bad);
  const flags: string[] = [];
  let total = 0;
  let passedShapes = 0;
  const per: Record<string, number | string | boolean>[] = [];
  level.shapes.forEach((shape, i) => {
    const pts = log.strokes[i].points.map((p) => [p[0], p[1]] as Pt);
    const r = scoreStroke(shape, level.tolerance, pts);
    const pts3 = log.strokes[i].points;
    const ms = pts3[pts3.length - 1][2] - pts3[0][2];
    const speed = pathLength(pts) / Math.max(ms / 1000, 0.001); // canvas widths per second
    if (speed > 4.5) flags.push('superhuman_speed');
    if (pts3.length > 20) {
      const dts = pts3.slice(1).map((p, k) => p[2] - pts3[k][2]);
      const mean = dts.reduce((s, d) => s + d, 0) / dts.length;
      const sd = Math.sqrt(dts.reduce((s, d) => s + (d - mean) ** 2, 0) / dts.length);
      if (r.accuracy > 0.985 && sd < 0.05 * mean) flags.push('robotic_input');
    }
    if (r.passed) passedShapes++;
    total += r.score;
    per.push({ shape: shape.name, score: r.score, accuracy: Math.round(r.accuracy * 100), coverage: Math.round(r.coverage * 100), quality: Math.round(r.quality * 100), passed: r.passed });
  });
  const passed = passedShapes >= roundsToPass(level.shapes.length);
  const avg = total / level.shapes.length;
  const stars = !passed ? 0 : avg >= 850 && passedShapes === level.shapes.length ? 3 : avg >= 700 ? 2 : 1;
  return {
    valid: true, passed, score: total + (passed ? levelNo * 15 : 0), stars: stars as 0 | 1 | 2 | 3,
    summary: { shapes: per, passed_shapes: passedShapes },
    flags: [...new Set(flags)], suspicious: flags.length > 0, min_duration_ms: times.length ? times[times.length - 1] : 0,
  };
}
