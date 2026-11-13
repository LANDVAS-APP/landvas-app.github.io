// Small, pure helpers for the roll stage: easing, springs (the same curves framer-motion uses, solved exactly so a
// frame can be drawn for any moment in time), CSS cubic-béziers, a seeded random and colour maths.

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x: number) => clamp(x, 0, 1);
export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
export const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
export const easeOutBack = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
export const smooth = (x: number) => { const y = clamp01(x); return y * y * (3 - 2 * y); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mod = (n: number, m: number) => ((n % m) + m) % m;

/** a damped spring from 0 to 1 (mass 1, framer-motion's stiffness/damping), `t` in seconds; it overshoots like the real one */
export function spring(t: number, stiffness: number, damping: number) {
  if (t <= 0) return 0;
  const w = Math.sqrt(stiffness), z = damping / (2 * w);
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w * t) * (1 + w * t);
}

/** a CSS cubic-bezier(x1, y1, x2, y2) timing function */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
    t = clamp01(t);
    return sy(t);
  };
}
export const inkEase = bezier(0.1, 0.85, 0.2, 1);
export const easeOut = bezier(0, 0, 0.58, 1);

/** evenly spaced keyframes, eased linearly between them (`x` 0…1) */
export function frames(x: number, values: number[]) {
  if (x <= 0) return values[0];
  if (x >= 1) return values[values.length - 1];
  const f = x * (values.length - 1), i = Math.floor(f);
  return lerp(values[i], values[i + 1], f - i);
}
/** keyframes at given offsets (`stops` ascending 0…1) */
export function framesAt(x: number, stops: number[], values: number[], ease: (x: number) => number = (v) => v) {
  if (x <= stops[0]) return values[0];
  for (let i = 1; i < stops.length; i++) if (x <= stops[i]) return lerp(values[i - 1], values[i], ease((x - stops[i - 1]) / (stops[i] - stops[i - 1] || 1)));
  return values[values.length - 1];
}

/** a fast seeded random (mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (a: number, b: number) => (Math.imul((a >>> 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x7f4a7c15, 1597334677)) >>> 0;
export const newSeed = () => (Math.random() * 4294967296) >>> 0;

// ---- colour ----
function parse(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
export const rgba = (hex: string, a: number) => { const [r, g, b] = parse(hex); return `rgba(${r},${g},${b},${clamp01(a)})`; };
export const mix = (a: string, b: string, t: number) => { const x = parse(a), y = parse(b); return toHex(lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)); };
export const shade = (hex: string, amt: number) => (amt >= 0 ? mix(hex, '#ffffff', amt) : mix(hex, '#000000', -amt));
