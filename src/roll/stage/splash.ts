// The ink hitting the canvas, as shapes: a pool that bursts out, splatters flung round it, tendrils running out to
// them, and blooms that soak across until the whole canvas is ink. Made from a seed, so the roll on screen (SVG) and
// its clip (canvas) splash exactly the same way. All in the card's 100×100 space.
import { rng } from './math';

/** one blob of ink: it grows from nothing to scale `s` (round cx, cy) over `d` s, after `dl` s */
export type InkShape = { d: string; cx: number; cy: number; s: number; dur: number; dl: number };
export type InkTendril = { d: string; w: number; dl: number; cx: number; cy: number; qx: number; qy: number; x: number; y: number };
export type InkSplashData = { cx: number; cy: number; shapes: InkShape[]; tendrils: InkTendril[] };

/** a smooth closed blob through n random points round (cx, cy) */
export function blobPath(rnd: () => number, cx: number, cy: number, r: number, n = 12, wob = 0.35) {
  const pts = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + rnd() * 0.3, rr = r * (1 - wob / 2 + rnd() * wob); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

const made = new Map<number, InkSplashData>();
/** a roll's splash (the flood under it is a plain circle: r 76 round the middle, grows over 0.5 s after 0.3 s) */
export function inkSplash(seed: number): InkSplashData {
  let sp = made.get(seed);
  if (sp) return sp;
  const rnd = rng(seed);
  const cx = 44 + rnd() * 12, cy = 44 + rnd() * 12;
  const splats = Array.from({ length: 8 + Math.floor(rnd() * 4) }, () => { const a = rnd() * Math.PI * 2, dist = 20 + rnd() * 26; return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: 3 + rnd() * 9, d: 0.08 + rnd() * 0.22 }; });
  const blooms = Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2 + rnd(), dist = 18 + rnd() * 18; return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: 10 + rnd() * 8, d: 0.16 + rnd() * 0.2 }; });
  const main = blobPath(rnd, cx, cy, 20, 14, 0.4);
  const sps = splats.map((p) => ({ d: blobPath(rnd, p.x, p.y, p.r, 8, 0.5), cx: p.x, cy: p.y, s: 1.25, dur: 0.32, dl: p.d }));
  const tendrils = splats.slice(0, 6).map((p) => {
    const qx = (cx + p.x) / 2 + (rnd() - 0.5) * 10, qy = (cy + p.y) / 2 + (rnd() - 0.5) * 10;
    return { d: `M${cx} ${cy} Q${qx} ${qy} ${p.x} ${p.y}`, w: 2 + rnd() * 3, dl: p.d * 0.6, cx, cy, qx, qy, x: p.x, y: p.y };
  });
  const bls = blooms.map((p) => ({ d: blobPath(rnd, p.x, p.y, p.r, 10, 0.45), cx: p.x, cy: p.y, s: 2.6, dur: 0.55, dl: p.d }));
  sp = { cx, cy, shapes: [...sps, ...bls, { d: main, cx, cy, s: 3.6, dur: 0.7, dl: 0 }], tendrils };
  made.set(seed, sp);
  if (made.size > 40) made.delete(made.keys().next().value!);
  return sp;
}
