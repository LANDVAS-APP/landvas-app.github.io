// v0.6.6 The restaurant: the server deals a shift's customers and checks what's reported served (no sooner than the
// dishes can cook, no later than the table's patience, once each, with the ingredients you have); upgrades cost tips;
// the night crew fills the tip jar; the pantry sells ingredients and gives a free delivery a day.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let uid: string, other: string, realm: string;
const wallet = async () => (await db.sql(`select wallet from realm_players where player_id = $1 and kind = 'diner'`, [uid]))[0]?.wallet ?? {};
const setWallet = (w: object) => db.sql(`insert into realm_players (player_id, kind, wallet) values ($1, 'diner', $2::jsonb) on conflict (player_id, kind) do update set wallet = excluded.wallet`, [uid, JSON.stringify(w)]);

beforeAll(async () => {
  await db.init({ ungated: true });
  uid = await db.newPlayer('cook_one'); other = await db.newPlayer('cook_two');
  realm = (await db.sql(`insert into realms (owner_id, kind) values ($1, 'diner') returning id`, [uid]))[0].id;
});
afterAll(() => db.close());

describe('Restaurant', () => {
  it('starts with a coffee machine, a griddle and two tables; the menu follows your level and stations', async () => {
    const g = await db.rpc(uid, 'diner_get', { p_id: realm });
    expect(g.diner_core.tables).toBe(2);
    expect(g.diner_core.menu).toEqual(['coffee', 'toast']);
    await expectError(db.rpc(other, 'diner_open', { p_id: realm }), 'not_owner');
  });

  it('a shift: served tables pay tips (checked against cooking time, patience and ingredients)', async () => {
    await setWallet({ flour: 3 });
    const o = await db.rpc(uid, 'diner_open', { p_id: realm });
    const cs = o.shift.customers as { i: number; at: number; order: string[] }[];
    expect(cs.length).toBeGreaterThan(5);
    expect(o.shift.menu).toEqual(['coffee', 'toast']);
    expect(o.shift.special).toMatch(/coffee|toast/);
    // pretend the shift has run its course
    await db.sql(`update realm_diner_shifts set started_at = now() - interval '3 minutes' where id = $1`, [o.shift.id]);
    const served = [
      { i: 0, at: cs[0].at + 100 },                // too quick: nothing cooks that fast
      { i: 1, at: cs[1].at + 4000 },               // fine
      { i: 1, at: cs[1].at + 5000 },               // the same table twice
      { i: 2, at: cs[2].at + 60000 },             // they'd long gone
      { i: 3, at: cs[3].at + 6000 },
      { i: 4, at: cs[4].at + 6000 },
      { i: 5, at: cs[5].at + 6000 },
    ];
    const need = (i: number) => cs[i].order.filter((d) => d === 'toast').length;
    const c = await db.rpc(uid, 'diner_close', { p_id: realm, p_shift: o.shift.id, p_served: served });
    // tables 1,3,4,5 are valid; each toast needs a flour and there are only 3
    let flour = 3, ok = 0;
    for (const i of [1, 3, 4, 5]) { if (need(i) <= flour) { flour -= need(i); ok++; } }
    expect(c.result.served).toBe(ok);
    expect(c.result.tips).toBeGreaterThan(0);
    const w = await wallet();
    expect(w.flour ?? 0).toBe(flour);
    expect(w.tips).toBe(c.result.tips);
    await expectError(db.rpc(uid, 'diner_close', { p_id: realm, p_shift: o.shift.id, p_served: [] }), 'already_claimed');
  });

  it('can’t report tables served later than the shift has been open', async () => {
    const o = await db.rpc(uid, 'diner_open', { p_id: realm });
    const cs = o.shift.customers;
    await expectError(db.rpc(uid, 'diner_close', { p_id: realm, p_shift: o.shift.id, p_served: [{ i: 5, at: cs[5].at + 5000 }] }), 'invalid_input');
  });

  it('upgrades cost tips; the night crew fills the tip jar; the pantry', async () => {
    await setWallet({ tips: 1000 });
    await expectError(db.rpc(uid, 'diner_buy', { p_id: realm, p_what: 'station', p_arg: 'oven' }), 'level_too_low');
    let b = await db.rpc(uid, 'diner_buy', { p_id: realm, p_what: 'table' });
    expect(b.diner.tables).toBe(3);
    b = await db.rpc(uid, 'diner_buy', { p_id: realm, p_what: 'speed', p_arg: 'griddle' });
    expect(b.diner.stations.griddle.speed).toBe(1);
    b = await db.rpc(uid, 'diner_buy', { p_id: realm, p_what: 'crew' });
    expect(b.diner.crew).toBe(1);
    expect((await wallet()).tips).toBe(1000 - 120 - 120 - 400);
    await db.sql(`update realm_diners set crew_at = now() - interval '2 hours' where realm_id = $1`, [realm]);
    const j = await db.rpc(uid, 'diner_jar', { p_id: realm });
    expect(j.got.tips).toBe(80);
    const p = await db.rpc(uid, 'diner_pantry', { p_id: realm, p_items: { flour: 10 } });
    expect(p.me.wallet.flour).toBe(10);
    await expectError(db.rpc(uid, 'diner_pantry', { p_id: realm, p_items: { truffle: 1 } }), 'level_too_low');
    const f = await db.rpc(uid, 'diner_pantry', { p_id: realm, p_items: { _free: true } });
    expect(f.me.wallet.flour).toBe(30);
    await expectError(db.rpc(uid, 'diner_pantry', { p_id: realm, p_items: { _free: true } }), 'already_claimed');
  });
});
