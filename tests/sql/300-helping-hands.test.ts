// Helping hands: visitors water the owner's growing crops (a few a day at each farm, a little Ink for the helper, the
// owner hears who helped); being at a place is an activity others can follow you into.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, vi: string, farm: string;
const ink = async (u: string) => Number((await db.rpc(u, 'my_state')).balances.ink);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('hh_owner'); vi = await db.newPlayer('hh_helper');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [vi]);
  await db.rpc(ow, 'claim_starter_plot', { p_gx: 3_430_000, p_gy: 2_130_000 });
  const g = (await db.rpc(ow, 'my_groups'))[0].id;
  farm = (await db.rpc(ow, 'set_group_kind', { p_group_id: g, p_kind: 'farm' })).farm_id;
  // the owner plants a row
  const crop = Object.keys((await db.rpc(ow, 'farm_get', { p_id: farm })).config.crops)[0];
  for (let i = 0; i < 4; i++) await db.sql(`insert into farm_beds (farm_id, idx, crop, ready_at) values ($1, $2, $3, now() + interval '1 hour')`, [farm, i, crop]);
});
afterAll(() => db.close());

describe('helping on someone else’s farm', () => {
  it('a visitor waters a growing crop: it grows faster, they get a little Ink, the owner hears', async () => {
    const before = (await db.sql(`select ready_at from farm_beds where farm_id = $1 and idx = 0`, [farm]))[0].ready_at;
    const ink0 = await ink(vi);
    await db.rpc(vi, 'farm_get', { p_id: farm }); // walking in already says "looking round your farm"
    expect(await db.rpc(vi, 'farm_helps_left', { p_farm: farm })).toBe(8);
    const r = await db.rpc(vi, 'farm_help', { p_farm: farm, p_bed: 0 });
    expect(r).toMatchObject({ helped: true, helps_left: 7, ink: 1 });
    const after = (await db.sql(`select ready_at, watered from farm_beds where farm_id = $1 and idx = 0`, [farm]))[0];
    expect(after.watered).toBe(true);
    expect(new Date(after.ready_at).getTime()).toBeLessThan(new Date(before).getTime());
    expect(await ink(vi)).toBe(ink0 + 1);
    // …and that alert becomes "helped water your crops" rather than a second ping
    expect(await db.sql(`select data ->> 'help' h from player_notifications where player_id = $1 and kind = 'visit'`, [ow])).toEqual([{ h: 'true' }]);
  });

  it('only growing, thirsty crops — and not your own farm (you water those yourself)', async () => {
    await expectError(db.rpc(vi, 'farm_help', { p_farm: farm, p_bed: 0 }), 'nothing_to_do');
    await expectError(db.rpc(vi, 'farm_help', { p_farm: farm, p_bed: 40 }), 'nothing_to_do');
    await expectError(db.rpc(ow, 'farm_help', { p_farm: farm, p_bed: 1 }), 'own_farm');
  });

  it('a few a day at each farm', async () => {
    await db.sql(`update farm_helps set n = 8 where helper_id = $1 and farm_id = $2`, [vi, farm]);
    await expectError(db.rpc(vi, 'farm_help', { p_farm: farm, p_bed: 1 }), 'already_done');
    expect(await db.rpc(vi, 'farm_helps_left', { p_farm: farm })).toBe(0);
  });
});

describe('being at a place', () => {
  it('is an activity others can follow you into', async () => {
    await db.rpc(ow, 'set_activity', { p_kind: 'place', p_detail: { what: 'farm', route: `/farm/${farm}` } });
    expect((await db.sql(`select kind from player_activity where player_id = $1`, [ow]))[0].kind).toBe('place');
  });
});
