import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  GRID_SIZE, adjacent, cellBounds, cellCenter, lngLatToCell, mix, neighbors, plotTypeFor, tileOfCell, unwrapCells, cellsOfTile,
} from '../../src/shared/grid';
import { canvasLayout, components, isConnected, outlineEdges } from '../../src/shared/fusion';
import { TestDb } from '../helpers/db';

describe('grid', () => {
  it('maps coordinates to stable z16 cells', () => {
    const slc = lngLatToCell(-111.891, 40.7608);
    expect(slc).toEqual({ gx: 12398, gy: 24628 });
    // the same point always maps to the same cell, independent of "zoom"
    const c = cellCenter(slc.gx, slc.gy);
    expect(lngLatToCell(c[0], c[1])).toEqual(slc);
    const b = cellBounds(slc.gx, slc.gy);
    expect(b.west).toBeLessThan(-111.891);
    expect(b.east).toBeGreaterThan(-111.891);
    expect(b.north).toBeGreaterThan(40.7608);
    expect(b.south).toBeLessThan(40.7608);
  });

  it('handles the poles, the antimeridian and invalid longitudes', () => {
    expect(lngLatToCell(180, 0).gx).toBe(0);
    expect(lngLatToCell(-180, 0).gx).toBe(0);
    expect(lngLatToCell(179.9999, 0).gx).toBe(GRID_SIZE - 1);
    expect(lngLatToCell(540, 0)).toEqual(lngLatToCell(180, 0));
    expect(lngLatToCell(0, 89.9).gy).toBe(0);
    expect(lngLatToCell(0, -89.9).gy).toBe(GRID_SIZE - 1);
  });

  it('adjacency is cardinal only and wraps across the antimeridian', () => {
    expect(adjacent({ gx: 5, gy: 5 }, { gx: 6, gy: 5 })).toBe(true);
    expect(adjacent({ gx: 5, gy: 5 }, { gx: 5, gy: 4 })).toBe(true);
    expect(adjacent({ gx: 5, gy: 5 }, { gx: 6, gy: 6 })).toBe(false);
    expect(adjacent({ gx: 0, gy: 9 }, { gx: GRID_SIZE - 1, gy: 9 })).toBe(true);
    expect(adjacent({ gx: 3, gy: 0 }, { gx: 3, gy: GRID_SIZE - 1 })).toBe(false);
    expect(neighbors(0, 0).map((n) => n.dir).sort()).toEqual(['e', 's', 'w']);
  });

  it('tile math is consistent with plot cells', () => {
    const t = tileOfCell(12399, 24672, 10);
    const r = cellsOfTile(10, t.x, t.y);
    expect(12399).toBeGreaterThanOrEqual(r.minGx);
    expect(12399).toBeLessThanOrEqual(r.maxGx);
    expect(r.maxGx - r.minGx + 1).toBe(64);
  });

  it('hash stays exact (no floating point overflow)', () => {
    expect(mix(65535, 65535 + 7)).toBeLessThan(2147483647);
    expect(Number.isInteger(mix(65535, 65542))).toBe(true);
  });
});

describe('plot types match the database exactly', () => {
  const db = new TestDb();
  beforeAll(() => db.init());
  afterAll(() => db.close());
  it('agrees on 3000 sample cells', async () => {
    const cells: [number, number][] = [];
    for (let i = 0; i < 3000; i++) cells.push([(i * 7919) % GRID_SIZE, (i * 104729 + 13) % GRID_SIZE]);
    cells.push([0, 0], [65535, 65535], [65535, 0]);
    const rows = await db.sql<{ gx: number; gy: number; t: string }>(
      `select (c->>0)::int gx, (c->>1)::int gy, private.plot_type_for((c->>0)::int, (c->>1)::int) t from jsonb_array_elements($1::jsonb) c`,
      [JSON.stringify(cells)],
    );
    for (const r of rows) expect(plotTypeFor(r.gx, r.gy)).toBe(r.t);
    const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r.t] = (m[r.t] ?? 0) + 1), m), {});
    expect(Object.keys(counts).sort()).toEqual(['graphite', 'lumina', 'mosaic', 'pigment']);
  });
});

describe('Canvas Fusion geometry', () => {
  it('finds components and connectivity', () => {
    expect(isConnected([[0, 0], [1, 0], [1, 1]])).toBe(true);
    expect(isConnected([[0, 0], [1, 1]])).toBe(false);
    const comps = components([[0, 0], [1, 0], [5, 5], [5, 6], [5, 7]]);
    expect(comps.map((c) => c.length)).toEqual([3, 2]);
    expect(isConnected([[GRID_SIZE - 1, 3], [0, 3]])).toBe(true);
  });

  it('lays out irregular canvases with absolute alignment', () => {
    const L = canvasLayout([[10, 10], [11, 10], [10, 11]]);
    expect([L.cols, L.rows, L.width, L.height]).toEqual([2, 2, 512, 512]);
    expect(L.byKey.get('11_10')).toEqual({ col: 1, row: 0, x: 256, y: 0 });
    // expanding to the west shifts the origin but each cell keeps its own key
    const E = canvasLayout([[9, 10], [10, 10], [11, 10], [10, 11]]);
    expect(E.byKey.get('11_10')!.col - E.byKey.get('10_10')!.col).toBe(1);
  });

  it('unwraps canvases across the antimeridian', () => {
    const u = unwrapCells([[GRID_SIZE - 1, 3], [0, 3]]);
    expect([u.minGx, u.maxGx, u.width]).toEqual([-1, 0, 2]);
    const L = canvasLayout([[GRID_SIZE - 1, 3], [0, 3]]);
    expect(L.byKey.get(`${GRID_SIZE - 1}_3`)!.col).toBe(0);
    expect(L.byKey.get('0_3')!.col).toBe(1);
  });

  it('outlines only exterior edges', () => {
    expect(outlineEdges([[0, 0]])).toHaveLength(4);
    expect(outlineEdges([[0, 0], [1, 0]])).toHaveLength(6);
    expect(outlineEdges([[0, 0], [1, 0], [0, 1], [1, 1]])).toHaveLength(8);
  });
});
