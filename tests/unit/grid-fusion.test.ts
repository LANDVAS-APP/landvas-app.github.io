import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  GRID_SIZE, adjacent, cellBounds, cellCenter, lngLatToCell, mix, neighbors, tileOfCell, unwrapCells, cellsOfTile,
} from '../../src/shared/grid';
import { canvasLayout, components, isConnected, outlineEdges } from '../../src/shared/fusion';
import { TestDb } from '../helpers/db';

const SLC = { gx: 793527, gy: 1576239 };

describe('grid', () => {
  it('maps coordinates to stable z22 cells (house-sized plots)', () => {
    const slc = lngLatToCell(-111.891, 40.7608);
    expect(slc).toEqual({ gx: SLC.gx, gy: SLC.gy });
    // ~7.2 m at Salt Lake City's latitude: a house takes 6-8 plots
    const w = cellBounds(slc.gx, slc.gy);
    const metres = (w.east - w.west) * 111320 * Math.cos((40.7608 * Math.PI) / 180);
    expect(metres).toBeGreaterThan(6.5);
    expect(metres).toBeLessThan(8);
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
    expect(lngLatToCell(179.99999, 0).gx).toBe(GRID_SIZE - 1);
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
    const t = tileOfCell(SLC.gx, SLC.gy, 16);
    const r = cellsOfTile(16, t.x, t.y);
    expect(SLC.gx).toBeGreaterThanOrEqual(r.minGx);
    expect(SLC.gx).toBeLessThanOrEqual(r.maxGx);
    expect(r.maxGx - r.minGx + 1).toBe(64);
  });

  it('hash stays exact (no floating point overflow)', () => {
    expect(mix(65535, 65535 + 7)).toBeLessThan(2147483647);
    expect(Number.isInteger(mix(65535, 65542))).toBe(true);
  });
});

describe('plot types and rarities are secret', () => {
  const db = new TestDb();
  beforeAll(() => db.init());
  afterAll(() => db.close());
  // the formula the map used before types were salted: knowing it must not predict anything
  const unsalted = (gx: number, gy: number) => {
    const ids = ['graphite', 'pigment', 'mosaic', 'lumina'];
    const weights = [30, 30, 20, 20];
    if (mix(gx, gy) % 100 < 22) return ids[mix(gx, gy + 7) % ids.length];
    let roll = mix(gx >> 3, gy >> 3) % 100;
    for (let i = 0; i < ids.length; i++) { if (roll < weights[i]) return ids[i]; roll -= weights[i]; }
    return ids[0];
  };
  it('the server decides with salts the client does not know', async () => {
    const cells: [number, number][] = [];
    for (let i = 0; i < 3000; i++) cells.push([(i * 7919) % GRID_SIZE, (i * 104729 + 13) % GRID_SIZE]);
    const rows = await db.sql<{ gx: number; gy: number; t: string; r: string }>(
      `select (c->>0)::int gx, (c->>1)::int gy, private.plot_type_for((c->>0)::int, (c->>1)::int) t,
              private.plot_rarity_for((c->>0)::int, (c->>1)::int) r from jsonb_array_elements($1::jsonb) c`,
      [JSON.stringify(cells)],
    );
    const matches = rows.filter((r) => unsalted(r.gx, r.gy) === r.t).length;
    // chance agreement for four weighted types is about 26%; a leaked formula would agree on every cell
    expect(matches / rows.length).toBeLessThan(0.45);
    const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r.t] = (m[r.t] ?? 0) + 1), m), {});
    expect(Object.keys(counts).sort()).toEqual(['clay', 'fresco', 'glass', 'graphite', 'lumina', 'mosaic', 'pigment', 'prism']);
    expect(new Set(rows.map((r) => r.r)).size).toBe(5);
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
