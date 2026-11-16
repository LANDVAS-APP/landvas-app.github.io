// Your places carry their own level (an arcade's, a realm's) in my_groups, so the map's Worlds button can pick your
// best place of each kind.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ow: string;
const A = { gx: 3_320_000, gy: 2_020_000 };

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('lv_owner');
  await db.giveInk(ow, 100000);
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
});
afterAll(() => db.close());

const mine = async () => (await db.rpc(ow, 'my_groups')) as { id: string; kind: string; place_level: number | null; arcade_id?: string; realm_id?: string }[];

describe('place levels', () => {
  it('a plain plot has none; an arcade has its own level, and it rises with its xp', async () => {
    const [g] = await mine();
    expect(g.place_level).toBeNull();
    const a = await db.rpc(ow, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' });
    expect((await mine())[0].place_level).toBe(1);
    await db.sql(`update arcades set xp = 50000 where id = $1`, [a.arcade_id]);
    const lv = (await mine())[0].place_level!;
    expect(lv).toBeGreaterThan(5);
    expect(lv).toBe((await db.rpc(ow, 'arcade_get', { p_id: a.arcade_id })).level.level);
  });
  it('a realm has its own level too', async () => {
    const [g] = await mine();
    const r = await db.rpc(ow, 'set_group_kind', { p_group_id: g.id, p_kind: 'mine' });
    expect(r.realm_id).toBeTruthy();
    expect((await mine())[0].place_level).toBe(1);
    await db.sql(`update realms set xp = 20000 where id = $1`, [r.realm_id]);
    expect((await mine())[0].place_level).toBeGreaterThan(5);
  });
});
