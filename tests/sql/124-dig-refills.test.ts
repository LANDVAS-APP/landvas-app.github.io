// v0.45 Digging energy: bigger, faster to refill, and topped up with a free daily refill, Ink or rations.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let rie: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const drain = () => db.sql(`update planet_miners set energy = 10, energy_at = now() where player_id = $1`, [rie]);

beforeAll(async () => {
  await db.init({ ungated: true });
  rie = await db.newPlayer('rie_refill');
  await db.giveInk(rie, 200);
});
afterAll(() => db.close());

describe('dig refills', () => {
  it('starts with 600 energy, refilling 6 a minute', async () => {
    const s = await db.rpc(rie, 'planet_dig_state', { p_world: 'moon' });
    expect(s).toMatchObject({ energy: 600, energy_max: 600, regen_per_minute: 6, refills: { free_left: 1, ink_left: 6 } });
    await expectError(db.rpc(rie, 'planet_dig_refill', { p_kind: 'free' }), 'energy_full');
  });

  it('a free refill a day fills you right up', async () => {
    await drain();
    const r = await db.rpc(rie, 'planet_dig_refill', { p_kind: 'free' });
    expect(r).toMatchObject({ energy: 600, refilled: 'free', refills: { free_left: 0 } });
    await drain();
    await expectError(db.rpc(rie, 'planet_dig_refill', { p_kind: 'free' }), 'refill_used');
  });

  it('Ink refills: 15 Ink for 250 energy, 6 a day', async () => {
    const before = await ink(rie);
    const r = await db.rpc(rie, 'planet_dig_refill', { p_kind: 'ink' });
    expect(r).toMatchObject({ energy: 260, refills: { ink_left: 5 } });
    expect(await ink(rie)).toBe(before - 15);
  });

  it('rations from ice and moondust, any time', async () => {
    await expectError(db.rpc(rie, 'planet_dig_refill', { p_kind: 'ration' }), 'not_enough_materials');
    await db.sql(`insert into planet_items (player_id, item, qty) values ($1, 'ice', 10), ($1, 'dust', 20)`, [rie]);
    const r = await db.rpc(rie, 'planet_dig_refill', { p_kind: 'ration' });
    expect(r).toMatchObject({ energy: 340, items: { ice: 6, dust: 12 } });
    await expectError(db.rpc(rie, 'planet_dig_refill', { p_kind: 'snack' }), 'invalid_refill');
  });

  it('a new day brings the refills back', async () => {
    await db.sql(`update planet_miners set refill_day = now() - interval '2 days', energy = 10 where player_id = $1`, [rie]);
    expect((await db.rpc(rie, 'planet_dig_refill', { p_kind: 'free' })).refills).toMatchObject({ free_left: 0, ink_left: 6 });
  });
});
