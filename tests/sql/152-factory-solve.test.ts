// v0.7.5 The workshop solver stops once flows settle: it must give exactly what the full (cells + 2)-pass version
// gives, on every layout. The old version is loaded as private.rfac_solve_ref and compared on random layouts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let pieces: string[] = [];
const rnd = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

beforeAll(async () => {
  await db.init({ ungated: true });
  await db.sql(fs.readFileSync(path.join(__dirname, 'fixtures/rfac_solve_ref.sql'), 'utf8'));
  pieces = Object.keys((await db.sql(`select private.rfac_cfg() -> 'pieces' p`))[0].p);
});
afterAll(() => db.close());

const layout = (r: () => number, w: number, h: number, fill: number) => {
  const g: Record<string, { t: string; d: number }> = {};
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (r() < fill) g[`${x},${y}`] = { t: pieces[Math.floor(r() * pieces.length)], d: Math.floor(r() * 4) };
  return g;
};
const both = async (g: object) => (await db.sql(`select private.rfac_solve($1::jsonb) a, private.rfac_solve_ref($1::jsonb) b`, [JSON.stringify(g)]))[0];

describe('Workshop solver', () => {
  it('gives the same answer as the full version on 200 random layouts', async () => {
    const r = rnd(7);
    for (let i = 0; i < 200; i++) {
      const g = layout(r, 2 + Math.floor(r() * 9), 2 + Math.floor(r() * 9), 0.3 + r() * 0.7);
      const { a, b } = await both(g);
      expect(a).toEqual(b);
    }
  });

  it('the same on a long belt chain and on a loop (one that may never settle)', async () => {
    const belt = pieces.find((p) => /belt/.test(p)) ?? pieces[0];
    const src = pieces.find((p) => /mine|source|drill|well|ore/.test(p)) ?? pieces[0];
    const chain: Record<string, { t: string; d: number }> = { '0,0': { t: src, d: 1 } };
    for (let x = 1; x < 40; x++) chain[`${x},0`] = { t: belt, d: 1 };
    const loop = { '0,0': { t: belt, d: 1 }, '1,0': { t: belt, d: 2 }, '1,1': { t: belt, d: 3 }, '0,1': { t: belt, d: 0 }, '2,0': { t: src, d: 3 } };
    for (const g of [chain, loop]) { const { a, b } = await both(g); expect(a).toEqual(b); }
  });

  it('a big settled layout takes a fraction of the passes', async () => {
    const g = layout(rnd(99), 12, 12, 1);
    const t = async (fn: string) => { const t0 = Date.now(); await db.sql(`select private.${fn}($1::jsonb)`, [JSON.stringify(g)]); return Date.now() - t0; };
    const full = await t('rfac_solve_ref'), fast = await t('rfac_solve');
    expect(fast).toBeLessThan(full);
  });
});
