// ✨ Skywright's geometry and galaxy: every star has one id and one place; every star is a ball of plots that tiles
// exactly (12 Keystones with five neighbours, the rest with six); the cube-sphere sky tiles round-trip.
import { describe, it, expect } from 'vitest';
import { TIERS, GALAXY_SIZE, tileCount, tileMax, starId, decodeId, tierOf, genStar, tileStars, cubeDir, dirToCube, tierForFov, tierFade, CLASSES, starCode, tilesInCone } from '../../src/stars/galaxy';
import { cellCount, latticeId, cellCenter, cellAt, patch, isKeystone, shellRadius, dirToUv, uvToDir } from '../../src/stars/goldberg';

const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);

describe('the galaxy', () => {
  it('has about 86 billion stars, plus the real ones', () => {
    expect(GALAXY_SIZE).toBeGreaterThan(80e9);
    expect(GALAXY_SIZE).toBeLessThan(100e9);
    expect(CLASSES.reduce((a, c) => a + c.weight, 0)).toBe(100_000);
  });

  it('a star’s id says where it is (tier, cube face, tile, index), and back', () => {
    for (const [t, f, i, j, k] of [[1, 0, 0, 0, 0], [2, 5, 255, 255, 9], [3, 3, 2047, 1, 7], [4, 2, 16383, 16383, 3], [5, 5, 131071, 131071, 1]]) {
      const id = starId(t, f, i, j, k);
      expect(Number.isSafeInteger(id)).toBe(true);
      expect(decodeId(id)).toEqual({ id, tier: t, face: f, i, j, k });
      expect(tierOf(id)).toBe(t);
    }
    expect(tierOf(32349)).toBe(0); // Sirius: its Hipparcos number
    expect(starCode(starId(3, 1, 2, 3, 4))).toMatch(/^LV-[0-9A-Z]+$/);
  });

  it('tiles hold no more than their most, and a star is the same every time it’s made', () => {
    for (let t = 1; t <= 5; t++) for (let n = 0; n < 200; n++) {
      const c = tileCount(t, n % 6, (n * 31) % TIERS[t].n, (n * 97) % TIERS[t].n);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(tileMax(t));
    }
    const a = tileStars(3, 2, 100, 200), b = tileStars(3, 2, 100, 200);
    expect(a).toEqual(b);
    for (const s of a) {
      expect(len(s.dir)).toBeCloseTo(1, 9);
      expect(s.ly).toBeGreaterThanOrEqual(TIERS[3].ly[0]);
      expect(s.ly).toBeLessThanOrEqual(TIERS[3].ly[1]);
      expect(s.cells).toBe(10 * s.m * s.m + 2);
      // (and it lies in its own tile)
      const q = dirToCube(s.dir);
      expect(q.face).toBe(2);
      expect(Math.floor(q.s * TIERS[3].n)).toBe(100);
      expect(Math.floor(q.t * TIERS[3].n)).toBe(200);
    }
    expect(genStar(3, 2, 100, 200, tileCount(3, 2, 100, 200))).toBeNull();
    expect(genStar(3, 6, 0, 0, 0)).toBeNull();
  });

  it('the sky’s cube faces round-trip', () => {
    for (let f = 0; f < 6; f++) for (const [s, t] of [[0.1, 0.2], [0.5, 0.5], [0.93, 0.07]]) {
      const d = cubeDir(f, s, t);
      const q = dirToCube(d);
      expect(q.face).toBe(f);
      expect(q.s).toBeCloseTo(s, 9);
      expect(q.t).toBeCloseTo(t, 9);
    }
  });

  it('the telescope’s tiers come in as you zoom', () => {
    expect(tierForFov(60)).toBe(0);
    expect(tierForFov(20)).toBe(1);
    expect(tierForFov(5)).toBe(2);
    expect(tierForFov(1)).toBe(3);
    expect(tierForFov(0.1)).toBe(4);
    expect(tierForFov(0.02)).toBe(5);
    expect(tierFade(2, 7)).toBe(0);
    expect(tierFade(2, 3)).toBe(1);
    // (a view's tiles: at the width a tier comes in, about a thousand of its tiles — a couple of thousand stars — and
    // never more than the cap, however wide the view)
    const tl = tilesInCone(4, [1, 0, 0], 0.09 * Math.PI / 180);
    expect(tl.length).toBeGreaterThan(300);
    expect(tl.length).toBeLessThanOrEqual(2500);
    expect(tilesInCone(5, [0, 0, 1], 0.5).length).toBeLessThanOrEqual(2500);
    expect(new Set(tl.map((x) => x.join(':'))).size).toBe(tl.length);
  });
});

describe('a star’s shell of plots (a Goldberg ball)', () => {
  for (const m of [1, 2, 3, 5, 10]) {
    it(`m = ${m}: ${cellCount(m)} plots, every id once, 12 Keystones with five neighbours`, () => {
      const cells = patch(m, [0, 0, 1]);
      expect(cells.length).toBe(cellCount(m));
      const ids = new Set(cells.map((c) => c.id));
      expect(ids.size).toBe(cellCount(m));
      expect(Math.min(...ids)).toBe(0);
      expect(Math.max(...ids)).toBe(cellCount(m) - 1);
      for (const c of cells) {
        expect(c.keystone).toBe(isKeystone(c.id));
        expect(c.nbrs.length).toBe(c.keystone ? 5 : 6);
        expect(c.corners.length).toBe(c.keystone ? 5 : 6);
        expect(cellAt(m, c.c)).toBe(c.id);
        expect(len(cellCenter(m, c.id))).toBeCloseTo(1, 9);
      }
      // (neighbours are mutual)
      const by = new Map(cells.map((c) => [c.id, c]));
      for (const c of cells) for (const n of c.nbrs) expect(by.get(n)!.nbrs).toContain(c.id);
    });
  }

  it('a big star: the cells near you only (a patch), the same ids as the whole ball', () => {
    const m = 100;
    const near = patch(m, [0, 0, 1], 0.05);
    expect(near.length).toBeGreaterThan(10);
    expect(near.length).toBeLessThan(cellCount(m) / 50);
    for (const c of near) expect(cellAt(m, c.c)).toBe(c.id);
    expect(latticeId(m, 0, 0, 0)).toBeLessThan(12);
    expect(shellRadius(10)).toBeGreaterThan(shellRadius(5));
  });

  it('the painting’s flat map and the ball agree', () => {
    for (const d0 of [[0, 0, 1], [0.3, -0.4, 0.866], [-1, 0, 0]] as [number, number, number][]) {
      const d = d0.map((x) => x / len(d0)) as [number, number, number];
      const [u, v] = dirToUv(d);
      const b = uvToDir(u, v);
      for (let i = 0; i < 3; i++) expect(b[i]).toBeCloseTo(d[i] / len(d), 5);
    }
  });
});
