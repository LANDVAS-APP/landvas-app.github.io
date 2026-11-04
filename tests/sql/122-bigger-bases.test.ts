// v0.43 Merge your neighbouring plots into one bigger base; anyone can look round a base they come across.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let mo: string, ned: string;
const own = (uid: string, gx: number, gy: number) => db.sql(`insert into planet_plots (world, gx, gy, owner_id) values ('moon', $1, $2, $3)`, [gx, gy, uid]);
const pad = (id: string, x: number, y: number) => ({ id, k: 'pad', x, y, r: 0, c: '#F2F5FB' });

beforeAll(async () => {
  await db.init({ ungated: true });
  mo = await db.newPlayer('mo_merger'); ned = await db.newPlayer('ned_nosy');
  await db.giveInk(mo, 3000);
  for (const p of [mo, ned]) await db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', 'moon')`, [p]);
  for (const [gx, gy] of [[100, 200], [101, 200], [100, 201], [101, 201], [102, 200]]) await own(mo, gx, gy);
  await own(ned, 103, 200);
  await db.sql(`insert into planet_items (player_id, item, qty) values ($1, 'stone', 1000), ($1, 'iron', 100)`, [mo]);
});
afterAll(() => db.close());

describe('Bigger bases', () => {
  it('needs every plot under it to be yours', async () => {
    await expectError(db.rpc(mo, 'planet_base_save', { p_world: 'moon', p_gx: 101, p_gy: 200, p_layout: [], p_rev: 0, p_w: 3, p_h: 1 }), 'not_owner'); // 103 is Ned's
    await expectError(db.rpc(mo, 'planet_base_save', { p_world: 'moon', p_gx: 100, p_gy: 200, p_layout: [], p_rev: 0, p_w: 5, p_h: 1 }), 'base_too_big');
  });

  it('a 2 x 2 base is 16 x 16 m and holds 4x the modules', async () => {
    // a landing pad (6 x 6 m) right across the middle — impossible on one plot
    const r = await db.rpc(mo, 'planet_base_save', { p_world: 'moon', p_gx: 100, p_gy: 200, p_layout: [pad('p1', 8, 8), pad('p2', 3, 13)], p_rev: 0, p_w: 2, p_h: 2 });
    expect(r).toMatchObject({ w: 2, h: 2, rev: 1 });
    await expectError(db.rpc(mo, 'planet_base_save', { p_world: 'moon', p_gx: 100, p_gy: 200, p_layout: [pad('p1', 8, 14)], p_rev: 1, p_w: 2, p_h: 2 }), 'invalid_layout'); // off the top
    const near = await db.rpc(ned, 'planet_plots_near', { p_world: 'moon', p_gx0: 98, p_gx1: 104, p_gy0: 198, p_gy1: 203 });
    const list = near.plots ?? near;
    expect(list.find((p: any) => p.gx === 100 && p.gy === 200).base).toMatchObject({ w: 2, h: 2 });
    expect(list.find((p: any) => p.gx === 101 && p.gy === 201).in_base).toEqual([100, 200]);
    expect(list.find((p: any) => p.gx === 102 && p.gy === 200).in_base).toBeNull();
  });

  it('a plot inside the big base can’t get its own base', async () => {
    await expectError(db.rpc(mo, 'planet_base_save', { p_world: 'moon', p_gx: 101, p_gy: 200, p_layout: [], p_rev: 0, p_w: 2, p_h: 1 }), 'plot_has_base');
  });

  it('visitors can look round, and the owner hears about it', async () => {
    const v = await db.rpc(ned, 'planet_base_view', { p_world: 'moon', p_gx: 100, p_gy: 200 });
    expect(v).toMatchObject({ w: 2, h: 2, modules: 2, mine: false, owner: { username: 'mo_merger' } });
    expect(v.catalog.modules.pad.emoji).toBeTruthy();
    const alerts = (await db.rpc(mo, 'my_alerts', { p_limit: 10 })).items;
    expect(alerts[0]).toMatchObject({ kind: 'base_visit', actor: { username: 'ned_nosy' } });
    await expectError(db.rpc(ned, 'planet_base_view', { p_world: 'moon', p_gx: 1, p_gy: 1 }), 'not_found');
  });
});
