// The map loads owned plots in fixed 64x64 blocks (plot_blocks), drawn as image tiles.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let a: string, b: string;
const HOME = { gx: 793500, gy: 1576200 };
const key = (gx: number, gy: number) => `${gx >> 6}_${gy >> 6}`;
afterAll(() => db.close());

describe('plot_blocks', () => {
  beforeAll(async () => {
    await db.init();
    a = await db.newPlayer('blocka');
    b = await db.newPlayer('blockb');
    await db.placeAt(a, HOME.gx, HOME.gy);
    await db.rpc(a, 'claim_starter_plot', { p_gx: HOME.gx, p_gy: HOME.gy });
    await db.placeAt(b, HOME.gx + 3, HOME.gy);
    await db.rpc(b, 'claim_starter_plot', { p_gx: HOME.gx + 3, p_gy: HOME.gy });
  });

  it('returns the same rows as plots_in_bbox, grouped by block, with "mine" from the caller', async () => {
    const k = key(HOME.gx, HOME.gy);
    const blocks = await db.rpc(a, 'plot_blocks', { p_blocks: [[HOME.gx >> 6, HOME.gy >> 6], [(HOME.gx >> 6) + 5, HOME.gy >> 6]] });
    expect(Object.keys(blocks).sort()).toEqual([k, `${(HOME.gx >> 6) + 5}_${HOME.gy >> 6}`].sort());
    expect(blocks[`${(HOME.gx >> 6) + 5}_${HOME.gy >> 6}`]).toEqual([]);
    const x0 = (HOME.gx >> 6) << 6, y0 = (HOME.gy >> 6) << 6;
    const bbox = await db.rpc(a, 'plots_in_bbox', { p_min_gx: x0, p_min_gy: y0, p_max_gx: x0 + 63, p_max_gy: y0 + 63 });
    const sort = (r: any[]) => [...r].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    expect(sort(blocks[k])).toEqual(sort(bbox));
    const mine = blocks[k].find((r: any) => r[0] === HOME.gx);
    const theirs = blocks[k].find((r: any) => r[0] === HOME.gx + 3);
    expect(mine[4]).toBe(true);
    expect(theirs[4]).toBe(false);
    // rarity of a claimed plot is public; unclaimed plots never appear
    expect(blocks[k].every((r: any) => r[9])).toBe(true);
    expect(blocks[k].length).toBe(2);
  });

  it('works for signed-out visitors and caps the request size', async () => {
    const anon = await db.rpc(null, 'plot_blocks', { p_blocks: [[HOME.gx >> 6, HOME.gy >> 6]] });
    expect(anon[key(HOME.gx, HOME.gy)].every((r: any) => r[4] === null)).toBe(true);
    await expectError(db.rpc(a, 'plot_blocks', { p_blocks: Array.from({ length: 65 }, (_, i) => [i, 0]) }), 'too_many_blocks');
    const out = await db.rpc(a, 'plot_blocks', { p_blocks: [[-1, 0], [70000, 3]] });
    expect(out).toEqual({});
  });
});
