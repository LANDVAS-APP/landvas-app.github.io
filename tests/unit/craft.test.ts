// The craft score rewards real palettes, shading and shapes, and isn't fooled by noise,
// squiggles, straight lines or the antialiased greys around a stroke.
import { describe, expect, it } from 'vitest';
import { analyzeCraft } from '../../src/shared/craft';
import { mulberry32 } from '../../src/shared/minigames/rng';

type C = [number, number, number];
function img(W: number, fn: (x: number, y: number) => C | null) {
  const data = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const c = fn(x, y) ?? [255, 255, 255];
    data.set([...c, 255], (y * W + x) * 4);
  }
  return { width: W, height: W, data };
}
/** Box-filter downscale, like the publish preview (adds antialiased blends everywhere). */
function shrink(src: ReturnType<typeof img>, W: number) {
  const k = src.width / W, data = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const s = [0, 0, 0]; let m = 0;
    for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) {
      const i = (yy * src.width + xx) * 4; s[0] += src.data[i]; s[1] += src.data[i + 1]; s[2] += src.data[i + 2]; m++;
    }
    data.set([s[0] / m, s[1] / m, s[2] / m, 255], (y * W + x) * 4);
  }
  return { width: W, height: W, data };
}
/** A soft round brush stroke along a path, blended over what's there. */
function strokes(W: number, paths: { pts: [number, number][]; r: number; c: C; soft?: number }[]) {
  const base = img(W, () => null);
  for (const { pts, r, c, soft = 0.45 } of paths) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const cx = x0 + ((x1 - x0) * s) / steps, cy = y0 + ((y1 - y0) * s) / steps;
        for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(W, cy + r); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, cx + r); x++) {
          const dd = Math.hypot(x - cx, y - cy) / r;
          if (dd >= 1) continue;
          const a = dd < 1 - soft ? 1 : (1 - dd) / soft;
          const j = (y * W + x) * 4;
          for (let k = 0; k < 3; k++) base.data[j + k] = Math.min(base.data[j + k], base.data[j + k] * (1 - a) + c[k] * a);
        }
      }
    }
  }
  return base;
}
const squigglePath = (W: number, rng: ReturnType<typeof mulberry32>, n = 40) => {
  const pts: [number, number][] = [];
  let x = W / 2, y = W / 2;
  for (let i = 0; i < n; i++) { x = Math.max(20, Math.min(W - 20, x + rng.int(-90, 90))); y = Math.max(20, Math.min(W - 20, y + rng.int(-90, 90))); pts.push([x, y]); }
  return pts;
};

// a little scene: a shaded sky, a sun, hills with shading, outlines and a tree
const sceneAt = (W: number) => img(W, (X, Y) => {
  const x = (X / W) * 64, y = (Y / W) * 64;
  const sun = (x - 46) ** 2 + (y - 14) ** 2;
  if (sun < 30) return sun < 12 ? [255, 236, 120] : [255, 196, 60];
  if (sun < 38) return [180, 110, 30];
  const hill = 40 + Math.round(6 * Math.sin(x / 7));
  if (x > 10 && x < 16 && y > hill - 18 && y < hill) return x < 13 ? [110, 70, 40] : [90, 55, 30];
  if ((x - 13) ** 2 + (y - (hill - 22)) ** 2 < 36) return y < hill - 23 ? [70, 170, 80] : [40, 120, 55];
  if (Math.abs(y - hill) < 0.6) return [20, 60, 30];
  if (y > hill) return y > hill + 12 ? [30, 100, 45] : [60, 150, 70];
  if ((x - 30) ** 2 / 30 + (y - 10) ** 2 / 6 < 1) return y < 10 ? [250, 250, 252] : [215, 222, 235];
  const t = y / hill;
  return t < 0.33 ? [70, 120, 220] : t < 0.66 ? [110, 160, 235] : [170, 205, 245];
});

describe('craft score', () => {
  it('ranks a shaded, detailed scene well above flat fills and noise', () => {
    const s = analyzeCraft(sceneAt(64)), big = analyzeCraft(shrink(sceneAt(720), 360));
    const flat = analyzeCraft(img(64, () => [220, 40, 60]));
    const rng = mulberry32(5);
    const noise = analyzeCraft(img(64, () => [rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)]));
    expect(s.score).toBeGreaterThan(60);
    expect(big.score).toBeGreaterThan(60);
    expect(s.colors).toBeGreaterThanOrEqual(8);
    expect(flat.score).toBeLessThan(15);
    expect(noise.score).toBeLessThan(15); // random pixels aren't craft
    expect(flat.tips.length).toBeGreaterThan(0);
  });

  it('a big black squiggle scores low, even with soft antialiased edges', () => {
    const rng = mulberry32(9);
    const sq = shrink(strokes(720, [{ pts: squigglePath(720, rng), r: 26, c: [10, 10, 12] }]), 360);
    const c = analyzeCraft(sq);
    expect(c.colors).toBeLessThanOrEqual(1);
    expect(c.score).toBeLessThanOrEqual(10);
  });

  it('colourful squiggles and straight lines score low', () => {
    const rng = mulberry32(3);
    const hues: C[] = [[230, 40, 60], [40, 120, 230], [250, 200, 40], [40, 180, 90], [160, 60, 200], [250, 130, 30], [20, 20, 20]];
    const scribble = shrink(strokes(720, hues.map((c) => ({ pts: squigglePath(720, rng, 14), r: 14, c }))), 360);
    const lines = shrink(strokes(720, hues.map((c, i) => ({ pts: [[40, 60 + i * 95], [680, 60 + i * 95]] as [number, number][], r: 9, c, soft: 0.1 }))), 360);
    const doodle = analyzeCraft(img(64, (x, y) => (Math.abs(x - y) < 3 ? [20, 20, 30] : null)));
    expect(analyzeCraft(scribble).score).toBeLessThan(35);
    expect(analyzeCraft(lines).score).toBeLessThan(25);
    expect(doodle.score).toBeLessThan(15);
  });

  it('an empty canvas scores nothing', () => {
    expect(analyzeCraft(img(64, () => null)).score).toBe(0);
  });
});
