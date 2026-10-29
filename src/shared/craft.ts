// Craft score: a 0-100 read of how much craft went into a published artwork, from
// the picture alone. It rewards what makes pixel art rich: a real palette (several
// colours that each cover a meaningful area), shading (a range of light and dark),
// detail (shapes and edges) and coverage. Random-pixel noise and flat single-colour
// fills score low, so the bonus can't be farmed with junk.
import type { RGBA } from './art';

export type Craft = {
  score: number; // 0-100
  coverage: number; // share of the canvas painted, 0-100
  colors: number; // distinct colours that each cover a real area
  shading: number; // light/dark range, 0-100
  detail: number; // shapes and edges, 0-100
  noise: number; // how much of it is scattered single pixels, 0-100
  tips: string[];
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function analyzeCraft(img: RGBA): Craft {
  const { width: w, height: h, data: d } = img;
  const n = w * h;
  if (!n) return { score: 0, coverage: 0, colors: 0, shading: 0, detail: 0, noise: 0, tips: [] };
  // colour of every pixel (quantised to 4 bits per channel) and whether it's paint or paper
  const q = new Int32Array(n);
  const lum = new Float32Array(n);
  const painted = new Uint8Array(n);
  let paintN = 0;
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    const ink = a >= 32 && 765 - (r + g + b) > 24;
    painted[p] = ink ? 1 : 0;
    if (ink) paintN++;
    q[p] = ink ? ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4) : -1;
    lum[p] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  const coverage = paintN / n;
  if (paintN < n * 0.01) return { score: 0, coverage: Math.round(coverage * 100), colors: 0, shading: 0, detail: 0, noise: 0, tips: ['Paint more of your canvas.'] };

  // palette: colours covering at least 0.6% of the paint (blends along edges don't count)
  const count = new Map<number, number>();
  for (let p = 0; p < n; p++) if (q[p] >= 0) count.set(q[p], (count.get(q[p]) ?? 0) + 1);
  const major = [...count.entries()].filter(([, c]) => c >= paintN * 0.006).sort((x, y) => y[1] - x[1]);
  // merge near-identical shades so dithering one colour isn't "more colours"
  const kept: number[] = [];
  for (const [c] of major) {
    const r = c >> 8, g = (c >> 4) & 15, b = c & 15;
    if (!kept.some((k) => Math.abs((k >> 8) - r) + Math.abs(((k >> 4) & 15) - g) + Math.abs((k & 15) - b) <= 2)) kept.push(c);
  }
  const colors = kept.length;

  // shading: the spread of light and dark across the paint
  let m = 0;
  for (let p = 0; p < n; p++) if (painted[p]) m += lum[p];
  m /= paintN;
  let v = 0;
  for (let p = 0; p < n; p++) if (painted[p]) v += (lum[p] - m) ** 2;
  const sd = Math.sqrt(v / paintN);

  // detail and noise: edges between neighbours, and pixels unlike all four neighbours
  let pairs = 0, edges = 0, lonely = 0, inner = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (x + 1 < w && (painted[p] || painted[p + 1])) { pairs++; if (q[p] !== q[p + 1]) edges++; }
    if (y + 1 < h && (painted[p] || painted[p + w])) { pairs++; if (q[p] !== q[p + w]) edges++; }
    if (painted[p] && x > 0 && y > 0 && x < w - 1 && y < h - 1) {
      inner++;
      const c = q[p];
      if (c !== q[p - 1] && c !== q[p + 1] && c !== q[p - w] && c !== q[p + w]) lonely++;
    }
  }
  const edge = pairs ? edges / pairs : 0;
  const noise = inner ? lonely / inner : 0;

  const cov = clamp01(coverage / 0.55);
  const pal = clamp01((colors - 1) / 7);
  const shade = clamp01(sd / 0.22);
  // edges only count as detail on a canvas that has some paint on it (one thin line is not detail)
  const det = clamp01(edge / 0.09) * clamp01(coverage / 0.25);
  // scattered single pixels (noise) and wall-to-wall edges pull the score down hard
  const penalty = (noise > 0.22 ? clamp01(1 - (noise - 0.22) / 0.25) * 0.85 + 0.15 : 1) * (edge > 0.55 ? clamp01(1 - (edge - 0.55) / 0.3) * 0.7 + 0.3 : 1);
  const score = Math.round(100 * (0.2 * cov + 0.32 * pal + 0.2 * shade + 0.28 * det) * penalty);

  const tips: string[] = [];
  if (colors < 4) tips.push('Use more colours — each one should cover a real area.');
  if (shade < 0.5) tips.push('Add shading: lighter and darker versions of your colours give depth.');
  if (det < 0.5) tips.push('Add detail: outlines, highlights and smaller shapes.');
  if (cov < 0.6) tips.push('Fill more of the canvas — backgrounds count.');
  if (penalty < 0.8) tips.push('Scattered single pixels read as noise. Group pixels into shapes.');
  return { score, coverage: Math.round(coverage * 100), colors, shading: Math.round(shade * 100), detail: Math.round(det * 100), noise: Math.round(noise * 100), tips };
}
