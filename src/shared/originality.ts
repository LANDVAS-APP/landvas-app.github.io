// Originality: a small fingerprint of an artwork's shapes and colours, so a new piece
// can be compared with what the artist (and others) already published. Repeating the
// same picture — moved, resized, mirrored, recoloured or barely touched up — scores as
// very similar, so it earns little; something genuinely new earns the full bonus.
import type { RGBA } from './art';

const N = 16; // fingerprint grid
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Fingerprint: the painted area cropped and squared, averaged into 16×16 cells (RGB + coverage). */
export function fingerprint(img: RGBA): string {
  const { width: w, height: h, data: d } = img;
  const ink = (i: number) => d[i + 3] >= 32 && 765 - (d[i] + d[i + 1] + d[i + 2]) > 24;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink((y * w + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const out = new Uint8Array(N * N * 4);
  if (x1 < 0) return toB64(out);
  // square the crop around its centre so a drawing keeps its proportions
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  const sx = cx - side / 2, sy = cy - side / 2;
  const sum = new Float64Array(N * N * 4);
  for (let y = Math.max(0, Math.floor(sy)); y < Math.min(h, Math.ceil(sy + side)); y++) {
    for (let x = Math.max(0, Math.floor(sx)); x < Math.min(w, Math.ceil(sx + side)); x++) {
      const gx = Math.min(N - 1, Math.floor(((x - sx) / side) * N)), gy = Math.min(N - 1, Math.floor(((y - sy) / side) * N));
      const c = (gy * N + gx) * 4, i = (y * w + x) * 4;
      sum[c + 3] += 1;
      if (ink(i)) { sum[c] += d[i]; sum[c + 1] += d[i + 1]; sum[c + 2] += d[i + 2]; out[c + 3]++; }
    }
  }
  for (let c = 0; c < N * N; c++) {
    const painted = out[c * 4 + 3], all = sum[c * 4 + 3] || 1;
    out[c * 4 + 3] = Math.round((painted / all) * 255);
    if (painted) for (let k = 0; k < 3; k++) out[c * 4 + k] = Math.round(sum[c * 4 + k] / painted);
  }
  return toB64(out);
}

type Cells = { rgb: Float32Array; m: Uint8Array; lum: Float32Array };
function decode(fp: string, mirror = false): Cells | null {
  const b = fromB64(fp);
  if (b.length !== N * N * 4) return null;
  const rgb = new Float32Array(N * N * 3), m = new Uint8Array(N * N), lum = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const src = (y * N + (mirror ? N - 1 - x : x)) * 4, c = y * N + x;
    m[c] = b[src + 3] >= 77 ? 1 : 0; // a cell counts as painted at 30% coverage
    for (let k = 0; k < 3; k++) rgb[c * 3 + k] = b[src + k];
    lum[c] = m[c] ? (0.2126 * b[src] + 0.7152 * b[src + 1] + 0.0722 * b[src + 2]) / 255 : 1;
  }
  return { rgb, m, lum };
}

function edges(c: Cells) {
  const e = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if ((x + 1 < N && Math.abs(c.lum[i] - c.lum[i + 1]) > 0.12) || (y + 1 < N && Math.abs(c.lum[i] - c.lum[i + N]) > 0.12)) e[i] = 1;
  }
  return e;
}
const iou = (a: Uint8Array, b: Uint8Array) => {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) { if (a[k] || b[k]) u++; if (a[k] && b[k]) i++; }
  return u ? i / u : 1;
};

function compare(a: Cells, b: Cells) {
  // colour: painted cells must line up and match in colour
  let n = 0, s = 0;
  for (let k = 0; k < N * N; k++) {
    if (!a.m[k] && !b.m[k]) continue;
    n++;
    if (a.m[k] && b.m[k]) {
      const dist = Math.hypot(a.rgb[k * 3] - b.rgb[k * 3], a.rgb[k * 3 + 1] - b.rgb[k * 3 + 1], a.rgb[k * 3 + 2] - b.rgb[k * 3 + 2]);
      s += clamp01(1 - dist / 160);
    }
  }
  const color = n ? s / n : 1;
  // structure: the same silhouette and the same edges, whatever the colours (catches recolours)
  const struct = 0.5 * iou(a.m, b.m) + 0.5 * iou(edges(a), edges(b));
  return Math.max(color, 0.92 * struct);
}

/** 0 (nothing alike) … 1 (the same picture). Mirrored copies count as the same picture. */
export function similarity(fa: string, fb: string): number {
  const a = decode(fa), b = decode(fb), bm = decode(fb, true);
  if (!a || !b || !bm) return 0;
  if (!a.m.some(Boolean) || !b.m.some(Boolean)) return 0;
  return Math.round(Math.max(compare(a, b), compare(a, bm)) * 1000) / 1000;
}

export type SimilarRef = { id: string; title: string; fp: string; own: boolean };
/** The most similar earlier piece, if any. */
export function mostSimilar(fp: string, refs: SimilarRef[]): { sim: number; id: string; title: string; own: boolean } | null {
  let best: { sim: number; id: string; title: string; own: boolean } | null = null;
  for (const r of refs) {
    if (!r.fp) continue;
    const sim = similarity(fp, r.fp);
    if (!best || sim > best.sim) best = { sim, id: r.id, title: r.title, own: r.own };
  }
  return best;
}

function toB64(u: Uint8Array) {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
function fromB64(s: string) {
  try {
    const b = atob(s);
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  } catch {
    return new Uint8Array(0);
  }
}
