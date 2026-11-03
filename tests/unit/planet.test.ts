import { describe, it, expect } from 'vitest';
import { LAT_MAX, cellAt, cellBounds, cellCenterDir, colsFor, dirOf, latLonOf, radiusFor } from '../../src/space/planetGrid';
import { PLANET_GAMES, makePlanetEngine } from '../../src/space/planetGames';
import type { GameInput } from '../../src/inkborn/games/engines';

describe('planet grid', () => {
  it('round-trips every cell centre and keeps the poles wild', () => {
    const rows = 12;
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < colsFor(rows); gx++) expect(cellAt(cellCenterDir({ gx, gy }, rows), rows)).toEqual({ gx, gy });
    // big worlds: plots are 8 m across at the equator, and the far corner still round-trips
    const big = 1000, R = radiusFor(big), eq = cellBounds({ gx: 0, gy: 499 }, big);
    expect(((eq.lat1 - eq.lat0) * Math.PI / 180) * R).toBeCloseTo(8, 5);
    expect(((eq.lon1 - eq.lon0) * Math.PI / 180) * R).toBeCloseTo(8, 5);
    expect(cellAt(cellCenterDir({ gx: colsFor(big) - 1, gy: big - 1 }, big), big)).toEqual({ gx: colsFor(big) - 1, gy: big - 1 });
    expect(cellAt(dirOf(LAT_MAX + 1, 20), rows)).toBeNull();
    expect(cellAt(dirOf(-89, 20), rows)).toBeNull();
    const b = cellBounds({ gx: 0, gy: 0 }, rows);
    expect(b.lat0).toBe(-LAT_MAX); expect(b.lon0).toBe(-180);
    const ll = latLonOf(dirOf(33, -120));
    expect(ll.lat).toBeCloseTo(33); expect(ll.lon).toBeCloseTo(-120);
  });
});

describe('planet games', () => {
  it('every world has exactly two games and every game runs', () => {
    const per: Record<string, number> = {};
    const bonus: Record<string, number> = {};
    for (const g of Object.values(PLANET_GAMES)) if (g.bonus) bonus[g.world] = (bonus[g.world] ?? 0) + 1; else per[g.world] = (per[g.world] ?? 0) + 1;
    expect(Object.values(per).every((n) => n === 2)).toBe(true);
    expect(Object.values(bonus).every((n) => n === 1)).toBe(true);
    expect(Object.keys(bonus)).toHaveLength(10);
    expect(Object.keys(per)).toHaveLength(10);
    for (const id of Object.keys(PLANET_GAMES)) {
      const input: GameInput = { joy: { x: 0, y: 0 }, keys: new Set(), tap: null, target: null };
      const e = makePlanetEngine(id, '#8B5CFF', 42)(7, 400, 700, input);
      for (let i = 0; i < 600; i++) { if (i % 20 === 0) input.tap = { x: 60 + (i * 7) % 280, y: 300 + (i * 13) % 350 }; input.target = i % 40 < 15 ? { x: 150, y: 700 } : null; e.step(1 / 30, i / 30); }
      expect(Number.isFinite(e.score())).toBe(true);
      expect(e.score()).toBeGreaterThanOrEqual(0);
    }
  });
});
