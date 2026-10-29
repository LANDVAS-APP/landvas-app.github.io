// The craft score rewards real palettes, shading and detail, and isn't fooled by noise.
import { describe, expect, it } from 'vitest';
import { analyzeCraft } from '../../src/shared/craft';
import { mulberry32 } from '../../src/shared/minigames/rng';

const W = 64;
function img(fn: (x: number, y: number) => [number, number, number] | null) {
  const data = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const c = fn(x, y) ?? [255, 255, 255];
    data.set([...c, 255], (y * W + x) * 4);
  }
  return { width: W, height: W, data };
}
const flat = img(() => [220, 40, 60]);
const doodle = img((x, y) => (Math.abs(x - y) < 3 ? [20, 20, 30] : null));
const rng = mulberry32(5);
const noise = img(() => [rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)]);
// a little scene: a shaded sky, a sun, hills with shading, outlines and a tree
const scene = img((x, y) => {
  const sun = (x - 46) ** 2 + (y - 14) ** 2;
  if (sun < 30) return sun < 12 ? [255, 236, 120] : [255, 196, 60];
  if (sun < 38) return [180, 110, 30];
  const hill = 40 + Math.round(6 * Math.sin(x / 7));
  if (x > 10 && x < 16 && y > hill - 18 && y < hill) return [90, 55, 30];
  if ((x - 13) ** 2 + (y - (hill - 22)) ** 2 < 36) return y < hill - 23 ? [70, 170, 80] : [40, 120, 55];
  if (y === hill) return [20, 60, 30];
  if (y > hill) return y > hill + 12 ? [30, 100, 45] : [60, 150, 70];
  const t = y / hill;
  return t < 0.33 ? [70, 120, 220] : t < 0.66 ? [110, 160, 235] : [170, 205, 245];
});

describe('craft score', () => {
  it('ranks a shaded, detailed scene well above flat fills, doodles and noise', () => {
    const s = analyzeCraft(scene), f = analyzeCraft(flat), d = analyzeCraft(doodle), z = analyzeCraft(noise);
    expect(s.score).toBeGreaterThan(60);
    expect(s.colors).toBeGreaterThanOrEqual(8);
    expect(f.score).toBeLessThan(30);
    expect(d.score).toBeLessThan(30);
    expect(z.score).toBeLessThan(30); // random pixels aren't craft
    expect(z.noise).toBeGreaterThan(50);
    expect(f.tips.length).toBeGreaterThan(0);
  });
  it('an empty canvas scores nothing', () => {
    expect(analyzeCraft(img(() => null)).score).toBe(0);
  });
});
