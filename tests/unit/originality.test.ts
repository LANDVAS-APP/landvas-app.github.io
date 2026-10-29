// Originality: repeats (moved, resized, mirrored, recoloured, touched up) read as the same
// picture; genuinely different pictures don't.
import { describe, expect, it } from 'vitest';
import { fingerprint, mostSimilar, similarity } from '../../src/shared/originality';

function img(W: number, H: number, fn: (x: number, y: number) => [number, number, number] | null) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...(fn(x, y) ?? [255, 255, 255]), 255], (y * W + x) * 4);
  return { width: W, height: H, data };
}
// a smiley: yellow face, dark eyes and mouth
const smiley = (ox: number, oy: number, r: number, face: [number, number, number] = [255, 210, 40]) => (x: number, y: number): [number, number, number] | null => {
  const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
  if (d > r) return null;
  if (Math.hypot(dx + r * 0.35, dy + r * 0.3) < r * 0.12 || Math.hypot(dx - r * 0.35, dy + r * 0.3) < r * 0.12) return [30, 30, 40];
  if (dy > r * 0.25 && dy < r * 0.45 && Math.abs(dx) < r * 0.5) return [160, 40, 40];
  return face;
};
const house = (x: number, y: number): [number, number, number] | null => {
  if (y > 30 && y < 60 && x > 15 && x < 50) return x > 28 && x < 36 && y > 45 ? [90, 50, 20] : [200, 80, 60];
  if (y <= 30 && y > 12 && Math.abs(x - 32) < 30 - y) return [80, 40, 120];
  if (y >= 60) return [40, 150, 60];
  return null;
};

describe('originality', () => {
  const a = fingerprint(img(64, 64, smiley(32, 32, 20)));
  it('the same picture moved, resized or mirrored is a repeat', () => {
    expect(similarity(a, a)).toBeGreaterThan(0.99);
    expect(similarity(a, fingerprint(img(128, 64, smiley(90, 30, 24))))).toBeGreaterThan(0.85); // moved + bigger + wider canvas
    expect(similarity(a, fingerprint(img(64, 64, (x, y) => smiley(32, 32, 20)(63 - x, y))))).toBeGreaterThan(0.95); // mirrored
  });
  it('a recolour still reads as a repeat (but less)', () => {
    const blue = similarity(a, fingerprint(img(64, 64, smiley(32, 32, 20, [40, 120, 255]))));
    expect(blue).toBeGreaterThan(0.7);
    expect(blue).toBeLessThan(0.99);
  });
  it('a different picture is not', () => {
    expect(similarity(a, fingerprint(img(64, 64, house)))).toBeLessThan(0.6);
  });
  it('finds the closest earlier piece; blank canvases never match', () => {
    const refs = [{ id: 'h', title: 'House', fp: fingerprint(img(64, 64, house)), own: true }, { id: 's', title: 'Smile', fp: a, own: true }];
    expect(mostSimilar(fingerprint(img(64, 64, smiley(30, 34, 18))), refs)?.id).toBe('s');
    expect(similarity(fingerprint(img(32, 32, () => null)), a)).toBe(0);
  });
});
