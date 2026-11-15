// ✍️ The Glyphcaster's 24 glyphs as shapes, and a small recogniser for a drawing (after the $1 unistroke recogniser:
// resample, square up, centre, then compare point by point — both ways round, and turned a little). The phone grades
// the shape; the server caps what any drawing can do, so a faked one can never beat a perfect real one.
export type Pt = { x: number; y: number };

const line = (pts: [number, number][], n = 12): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n; k++) { const t = k / n; out.push({ x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t }); }
  out.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] });
  return out;
};
const curve = (f: (t: number) => [number, number], n = 72): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const [x, y] = f(i / n); return { x, y }; });
const star = (k: number, r1: number, r2: number) => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= k * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / k, r = i % 2 ? r2 : r1; pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]); }
  return line(pts, 6);
};
const TAU = Math.PI * 2;

export const GLYPH_SHAPES: Record<string, Pt[]> = {
  spiral: curve((t) => [0.5 + Math.cos(t * TAU * 2.25) * 0.45 * t, 0.5 + Math.sin(t * TAU * 2.25) * 0.45 * t]),
  star: line([[0.5, 0.05], [0.78, 0.92], [0.05, 0.38], [0.95, 0.38], [0.22, 0.92], [0.5, 0.05]], 10),
  triangle: line([[0.5, 0.08], [0.92, 0.88], [0.08, 0.88], [0.5, 0.08]], 14),
  bolt: line([[0.62, 0.02], [0.28, 0.52], [0.66, 0.5], [0.34, 0.98]], 14),
  leaf: [...curve((t) => [0.5 + Math.sin(t * Math.PI) * 0.36, 0.95 - t * 0.9], 30), ...curve((t) => [0.5 - Math.sin(t * Math.PI) * 0.36, 0.05 + t * 0.9], 30)],
  key: [...curve((t) => [0.3 + Math.cos(t * TAU) * 0.2, 0.3 + Math.sin(t * TAU) * 0.2], 40), ...line([[0.44, 0.44], [0.92, 0.92], [0.78, 0.92], [0.78, 0.78]], 10)],
  wave: curve((t) => [0.05 + t * 0.9, 0.5 + Math.sin(t * TAU * 2) * 0.32]),
  eye: [...curve((t) => [0.05 + t * 0.9, 0.5 - Math.sin(t * Math.PI) * 0.3], 36), ...curve((t) => [0.95 - t * 0.9, 0.5 + Math.sin(t * Math.PI) * 0.3], 36)],
  circle: curve((t) => [0.5 + Math.cos(-Math.PI / 2 + t * TAU) * 0.45, 0.5 + Math.sin(-Math.PI / 2 + t * TAU) * 0.45]),
  cross: line([[0.5, 0.05], [0.5, 0.95], [0.5, 0.5], [0.05, 0.5], [0.95, 0.5]], 12),
  heart: curve((t) => { const a = Math.PI - t * TAU; return [0.5 + 0.028 * 16 * Math.pow(Math.sin(a), 3), 0.46 - 0.028 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]; }),
  moon: [...curve((t) => [0.55 + Math.cos(-Math.PI / 2 - t * Math.PI) * 0.42, 0.5 + Math.sin(-Math.PI / 2 - t * Math.PI) * 0.45], 40), ...curve((t) => [0.38 + Math.cos(Math.PI / 2 + t * Math.PI) * -0.22, 0.95 - t * 0.9], 30)],
  sun: star(8, 0.46, 0.3),
  crown: line([[0.08, 0.85], [0.08, 0.28], [0.3, 0.6], [0.5, 0.15], [0.7, 0.6], [0.92, 0.28], [0.92, 0.85], [0.08, 0.85]], 8),
  arrow: line([[0.08, 0.92], [0.92, 0.08], [0.55, 0.1], [0.92, 0.08], [0.9, 0.45]], 12),
  hourglass: line([[0.2, 0.08], [0.8, 0.08], [0.2, 0.92], [0.8, 0.92], [0.2, 0.08]], 12),
  flame: curve((t) => { const a = t * TAU; return [0.5 + Math.sin(a) * 0.32 * (1 - t * 0.3), 0.62 + Math.cos(a) * 0.3 - Math.pow(Math.sin(a / 2), 6) * 0.55]; }),
  anchor: [...curve((t) => [0.5 + Math.cos(Math.PI - t * Math.PI) * 0.36, 0.62 + Math.sin(Math.PI - t * Math.PI) * -0.0 + Math.sin(t * Math.PI) * 0.3], 30), ...line([[0.86, 0.62], [0.5, 0.92], [0.5, 0.08]], 14)],
  infinity: curve((t) => { const a = t * TAU; const d = 1 + Math.sin(a) ** 2; return [0.5 + (0.45 * Math.cos(a)) / d, 0.5 + (0.45 * Math.sin(a) * Math.cos(a)) / d]; }),
  twin: [...curve((t) => [0.3 + Math.cos(t * TAU * 1.5) * 0.25 * (1 - t), 0.5 + Math.sin(t * TAU * 1.5) * 0.25 * (1 - t)], 36), ...curve((t) => [0.7 - Math.cos(t * TAU * 1.5) * 0.25 * t, 0.5 - Math.sin(t * TAU * 1.5) * 0.25 * t], 36)],
  rune: line([[0.3, 0.95], [0.3, 0.05], [0.72, 0.28], [0.3, 0.5], [0.76, 0.95]], 12),
  phoenix: line([[0.06, 0.2], [0.5, 0.65], [0.94, 0.2], [0.5, 0.42], [0.5, 0.96]], 12),
  void: [...curve((t) => [0.5 + Math.cos(t * TAU) * 0.44, 0.5 + Math.sin(t * TAU) * 0.44], 60), ...line([[0.94, 0.5], [0.5, 0.5]], 10)],
  omega: [...line([[0.1, 0.9], [0.34, 0.9]], 6), ...curve((t) => { const a = Math.PI * 0.6 - t * Math.PI * 2.2; return [0.5 + Math.cos(a) * 0.32, 0.5 - Math.sin(a) * 0.36]; }, 50), ...line([[0.66, 0.9], [0.9, 0.9]], 6)],
};

/** an SVG path for a shape (in a 100 × 100 box) */
export const glyphPath = (id: string) => (GLYPH_SHAPES[id] ?? []).map((p, i) => `${i ? 'L' : 'M'}${(p.x * 100).toFixed(1)} ${(p.y * 100).toFixed(1)}`).join(' ');

// ---- the recogniser ------------------------------------------------------------------------------------------------------
const M = 64;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function pathLen(p: Pt[]) { let d = 0; for (let i = 1; i < p.length; i++) d += dist(p[i - 1], p[i]); return d; }
function resample(src: Pt[], n = M): Pt[] {
  const pts = src.map((p) => ({ ...p }));
  const I = pathLen(pts) / (n - 1);
  if (!(I > 0)) return Array.from({ length: n }, () => ({ ...pts[0] }));
  let D = 0; const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (D + d >= I) {
      const q = { x: pts[i - 1].x + ((I - D) / d) * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + ((I - D) / d) * (pts[i].y - pts[i - 1].y) };
      out.push(q); pts.splice(i, 0, q); D = 0;
    } else D += d;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}
function normalise(p: Pt[]): Pt[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of p) { minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y); }
  const s = Math.max(maxX - minX, maxY - minY) || 1;
  const sc = p.map((q) => ({ x: (q.x - minX) / s, y: (q.y - minY) / s }));
  const cx = sc.reduce((a, q) => a + q.x, 0) / sc.length, cy = sc.reduce((a, q) => a + q.y, 0) / sc.length;
  return sc.map((q) => ({ x: q.x - cx, y: q.y - cy }));
}
const rotate = (p: Pt[], a: number) => { const c = Math.cos(a), s = Math.sin(a); return p.map((q) => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c })); };
const avgDist = (a: Pt[], b: Pt[]) => { let d = 0; for (let i = 0; i < a.length; i++) d += dist(a[i], b[i]); return d / a.length; };
const TEMPLATES = new Map(Object.entries(GLYPH_SHAPES).map(([id, pts]) => [id, normalise(resample(pts))]));

/** which of these glyphs a drawing is, and how well it was drawn (score 0..1; accuracy 0..1 is what the server gets) */
export function recognise(drawing: Pt[], among: string[]): { id: string; score: number; accuracy: number } | null {
  if (drawing.length < 8 || pathLen(drawing) < 40) return null;
  const cand = normalise(resample(drawing)), back = normalise(resample([...drawing].reverse()));
  let best: { id: string; score: number } | null = null;
  for (const id of among) {
    const t = TEMPLATES.get(id);
    if (!t) continue;
    let d = Infinity;
    for (const a of [-0.3, -0.15, 0, 0.15, 0.3]) for (const c of [cand, back]) d = Math.min(d, avgDist(rotate(c, a), t));
    const score = Math.max(0, 1 - d / 0.42);
    if (!best || score > best.score) best = { id, score };
  }
  if (!best || best.score < 0.5) return null;
  return { ...best, accuracy: Math.max(0, Math.min(1, (best.score - 0.5) / 0.38)) };
}
