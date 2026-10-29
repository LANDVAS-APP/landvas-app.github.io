// Craft score: a 0-100 read of how much craft went into a published artwork, from
// the picture alone. It rewards what makes art rich: a real palette (several colours
// that each fill real shapes), shading (lighter and darker tones of a colour), many
// distinct shapes, colours that meet each other, and filled areas rather than bare
// strokes. Antialiased edges (the greys around a black stroke on white) don't count
// as colours, so squiggles, scribbles, straight lines, flat fills and random noise
// all score low. (The server also weighs how long the piece took; that isn't shown.)
import type { RGBA } from './art';

export type Craft = {
  score: number; // 0-100
  coverage: number; // share of the canvas painted, 0-100
  colors: number; // distinct colours that each fill real shapes
  shading: number; // tonal range within colours, 0-100
  detail: number; // distinct shapes, 0-100
  noise: number; // how much of it is scattered single pixels, 0-100
  tips: string[];
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const MAX = 192; // analyse at a fixed scale so results don't depend on canvas size

/** Nearest-neighbour rescale to a fixed size (keeps hard edges; doesn't invent new blends). */
function normalize(img: RGBA): RGBA {
  const { width: w, height: h } = img;
  const k = Math.max(w, h) / MAX;
  if (Math.abs(k - 1) < 0.01) return img;
  const W = Math.max(1, Math.round(w / k)), H = Math.max(1, Math.round(h / k));
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.floor((y + 0.5) * k));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) * k));
      const s = (sy * w + sx) * 4, d = (y * W + x) * 4;
      out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3];
    }
  }
  return { width: W, height: H, data: out };
}

const empty = (tips: string[] = []): Craft => ({ score: 0, coverage: 0, colors: 0, shading: 0, detail: 0, noise: 0, tips });

export function analyzeCraft(input: RGBA): Craft {
  const img = normalize(input);
  const { width: w, height: h, data: d } = img;
  const n = w * h;
  if (!n) return empty();
  // flatten onto white (as published), quantise, and mark paint vs paper
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  const q = new Int32Array(n), painted = new Uint8Array(n);
  let paintN = 0;
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const a = d[i + 3] / 255;
    const r = d[i] * a + 255 * (1 - a), g = d[i + 1] * a + 255 * (1 - a), b = d[i + 2] * a + 255 * (1 - a);
    R[p] = r; G[p] = g; B[p] = b;
    const ink = 765 - (r + g + b) > 24;
    painted[p] = ink ? 1 : 0;
    if (ink) paintN++;
    q[p] = ink ? ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4) : -1;
  }
  const coverage = paintN / n;
  if (paintN < n * 0.01) return { ...empty(['Paint more of your canvas.']), coverage: Math.round(coverage * 100) };

  // "solid" pixels: all four neighbours are the same colour. Antialiased ramps and
  // brush edges are never solid, so they can't pose as extra colours or shading.
  const solid = new Uint8Array(n);
  let solidN = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x, c = q[p];
    if (c < 0) continue;
    if (q[p - 1] === c && q[p + 1] === c && q[p - w] === c && q[p + w] === c) { solid[p] = 1; solidN++; }
  }

  // palette: colours of the solid areas that each cover a real share; near-identical shades merge
  const count = new Map<number, number>();
  for (let p = 0; p < n; p++) if (solid[p]) count.set(q[p], (count.get(q[p]) ?? 0) + 1);
  const minShare = Math.max(6, solidN * 0.005);
  const major = [...count.entries()].filter(([, c]) => c >= minShare).sort((x, y) => y[1] - x[1]);
  const rgbOf = (c: number) => [((c >> 8) << 4) + 8, (((c >> 4) & 15) << 4) + 8, ((c & 15) << 4) + 8];
  const kept: { c: number; rgb: number[]; area: number }[] = [];
  const family = new Map<number, number>(); // quantised colour -> palette index
  for (const [c, a] of major) {
    const rgb = rgbOf(c);
    const k = kept.findIndex((x) => Math.hypot(x.rgb[0] - rgb[0], x.rgb[1] - rgb[1], x.rgb[2] - rgb[2]) < 20);
    if (k >= 0) { kept[k].area += a; family.set(c, k); } else { family.set(c, kept.length); kept.push({ c, rgb, area: a }); }
  }
  const colors = kept.length;

  // shading: pairs of palette colours with the same hue but a clearly different lightness
  const hsl = kept.map(({ rgb: [r, g, b] }) => {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, dd = mx - mn;
    let hue = 0;
    if (dd > 0.0001) {
      if (mx === r / 255) hue = ((g - b) / 255 / dd) % 6; else if (mx === g / 255) hue = (b - r) / 255 / dd + 2; else hue = (r - g) / 255 / dd + 4;
      hue = (hue * 60 + 360) % 360;
    }
    const s = dd < 0.0001 ? 0 : dd / (1 - Math.abs(2 * l - 1));
    return { hue, s, l };
  });
  let ramps = 0;
  for (let i = 0; i < hsl.length; i++) for (let j = i + 1; j < hsl.length; j++) {
    const a = hsl[i], b = hsl[j];
    const grey = a.s < 0.12 && b.s < 0.12;
    const dh = Math.min(Math.abs(a.hue - b.hue), 360 - Math.abs(a.hue - b.hue));
    if ((grey || (a.s >= 0.12 && b.s >= 0.12 && dh < 28)) && Math.abs(a.l - b.l) > 0.08) ramps++;
  }
  const hues = new Set(hsl.map((x) => (x.s < 0.12 ? -1 : Math.round(x.hue / 30) % 12))).size;

  // shapes: connected areas of one palette colour (solid pixels) big enough to see
  const label = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  let regions = 0;
  const minRegion = Math.max(8, n * 0.0015);
  for (let p = 0; p < n; p++) {
    if (!solid[p] || label[p] >= 0) continue;
    const f = family.get(q[p]);
    if (f === undefined) continue;
    let size = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    label[p] = regions;
    stack.push(p);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % w, y = (c - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const nb of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w]) {
        if (nb < 0 || nb >= n || !solid[nb] || label[nb] >= 0 || family.get(q[nb]) !== f) continue;
        label[nb] = regions;
        stack.push(nb);
      }
    }
    // a shape fills a fair part of its box; a squiggle or a long line snakes through an empty one
    const box = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (size >= minRegion && (size / box >= 0.3 || box < n * 0.01)) regions++;
  }

  // colours that meet: which palette colours sit next to each other (across a thin blend)
  const pairs = new Set<number>();
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const p = y * w + x;
    if (!solid[p]) continue;
    const a = family.get(q[p]);
    if (a === undefined) continue;
    for (const [dx, dy] of [[3, 0], [0, 3], [3, 3], [-3, 3]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= w || yy >= h) continue;
      const o = yy * w + xx;
      if (!solid[o]) continue;
      const b = family.get(q[o]);
      if (b === undefined || b === a) continue;
      pairs.add(Math.min(a, b) * 64 + Math.max(a, b));
    }
  }

  // mass: how much of the paint is filled area rather than bare strokes (lines, squiggles)
  // (a pixel is in a filled area when the 11×11 square around it is all paint)
  const S = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) S[(y + 1) * (w + 1) + x + 1] = painted[y * w + x] + S[y * (w + 1) + x + 1] + S[(y + 1) * (w + 1) + x] - S[y * (w + 1) + x];
  const rr = 5;
  let massN = 0;
  for (let y = rr; y < h - rr; y++) for (let x = rr; x < w - rr; x++) {
    if (!painted[y * w + x]) continue;
    const a = S[(y - rr) * (w + 1) + x - rr], b = S[(y - rr) * (w + 1) + x + rr + 1], c = S[(y + rr + 1) * (w + 1) + x - rr], e = S[(y + rr + 1) * (w + 1) + x + rr + 1];
    if (e - b - c + a === (2 * rr + 1) ** 2) massN++;
  }
  const mass = massN / paintN;

  // noise: painted pixels unlike all four neighbours (random pixels, spray)
  let lonely = 0, inner = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (!painted[p]) continue;
    inner++;
    const c = q[p];
    const near = (o: number) => q[o] >= 0 && Math.abs(R[o] - R[p]) + Math.abs(G[o] - G[p]) + Math.abs(B[o] - B[p]) < 60;
    if (c !== q[p - 1] && c !== q[p + 1] && c !== q[p - w] && c !== q[p + w] && !near(p - 1) && !near(p + 1) && !near(p - w) && !near(p + w)) lonely++;
  }
  const noise = inner ? lonely / inner : 0;

  const cov = clamp01(coverage / 0.6);
  const pal = clamp01((colors - 1) / 9) * clamp01((hues - 1) / 3 + 0.4);
  const shade = clamp01(ramps / 5);
  const det = clamp01((regions - 1) / 14);
  const adj = clamp01(pairs.size / 9);
  const filled = clamp01(mass / 0.55);
  let raw = 0.14 * cov + 0.24 * pal + 0.2 * shade + 0.26 * det + 0.16 * adj;
  // bare strokes (lines, squiggles, outlines with nothing filled) earn little
  raw *= 0.35 + 0.65 * filled;
  // scattered single pixels pull the score down hard
  if (noise > 0.12) raw *= clamp01(1 - (noise - 0.12) / 0.2) * 0.85 + 0.15;
  let score = Math.round(100 * raw);
  // one or two colours, or a couple of shapes, is never high craft
  if (colors <= 1) score = Math.min(score, 10);
  else if (colors === 2) score = Math.min(score, 25);
  if (regions < 4) score = Math.min(score, 20);

  const tips: string[] = [];
  if (colors < 4) tips.push('Use more colours — and fill real shapes with them, not just lines.');
  if (shade < 0.5) tips.push('Add shading: a lighter and a darker tone of each colour gives depth.');
  if (det < 0.5) tips.push('Build the picture from more shapes: a subject, a background, details.');
  if (filled < 0.6) tips.push('Fill your shapes in — lines and squiggles on their own earn little.');
  if (adj < 0.5 && colors >= 3) tips.push('Let your colours meet: shapes that touch read as one picture.');
  if (cov < 0.6) tips.push('Fill more of the canvas — backgrounds count.');
  if (noise > 0.2) tips.push('Scattered single pixels read as noise. Group pixels into shapes.');
  return { score, coverage: Math.round(coverage * 100), colors, shading: Math.round(shade * 100), detail: Math.round(det * 100), noise: Math.round(noise * 100), tips };
}
