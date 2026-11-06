// v0.6.5 The workshop factory: the server and the app work layouts out the same; pieces are bought then placed;
// a layout's real output builds up over time and is collected (with XP and Ink).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';
import { solve, type FactoryCfg, type Grid } from '../../src/realms/workshop/factoryCore';

const db = new TestDb();
let uid: string, other: string, realm: string, cfg: FactoryCfg;
const wallet = async () => (await db.sql(`select wallet from realm_players where player_id = $1 and kind = 'workshop'`, [uid]))[0]?.wallet ?? {};
const close = (a: Record<string, number>, b: Record<string, number>) => { expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort()); for (const k of Object.keys(a)) expect(Number(a[k])).toBeCloseTo(Number(b[k]), 3); };

beforeAll(async () => {
  await db.init({ ungated: true });
  uid = await db.newPlayer('maker_one'); other = await db.newPlayer('maker_two');
  realm = (await db.sql(`insert into realms (owner_id, kind) values ($1, 'workshop') returning id`, [uid]))[0].id;
  cfg = (await db.sql(`select value from game_config where key = 'realm_factory'`))[0].value;
});
afterAll(() => db.close());

const layouts: Grid[] = [
  // magnet -> belt -> press -> belt -> crate
  { '0,0': { t: 'magnet', d: 1 }, '1,0': { t: 'belt', d: 1 }, '2,0': { t: 'press', d: 1 }, '3,0': { t: 'belt', d: 1 }, '4,0': { t: 'dock', d: 1 } },
  // two magnets merging into one belt, a press that's short of scrap, a spilling belt, a starved coiler
  { '0,0': { t: 'magnet', d: 2 }, '0,1': { t: 'belt', d: 1 }, '0,2': { t: 'magnet', d: 0 }, '1,1': { t: 'press', d: 2 }, '1,2': { t: 'belt', d: 2 }, '1,3': { t: 'dock', d: 0 },
    '3,3': { t: 'magnet', d: 1 }, '4,3': { t: 'belt', d: 1 }, '5,0': { t: 'coiler', d: 2 }, '5,1': { t: 'dock', d: 0 } },
  // a loop that goes nowhere
  { '0,0': { t: 'belt', d: 1 }, '1,0': { t: 'belt', d: 2 }, '1,1': { t: 'belt', d: 3 }, '0,1': { t: 'belt', d: 0 } },
];

describe('Workshop factory', () => {
  it('the app and the server work layouts out the same', async () => {
    for (const g of layouts) {
      const s = (await db.sql(`select private.rfac_solve($1::jsonb) s`, [JSON.stringify(g)]))[0].s;
      const t = solve(g, cfg);
      close(s.income, t.income);
      for (const k of Object.keys(g)) { expect(s.cells[k].status).toBe(t.cells[k].status); close(s.cells[k].out, t.cells[k].out); }
    }
    const one = solve(layouts[0], cfg);
    expect(one.income).toEqual({ gear: 3 });
    const two = solve(layouts[1], cfg);
    expect(two.income.gear).toBe(3);
    expect(two.cells['5,0'].status).toBe('starved');
    expect(two.cells['4,3'].status).toBe('spilling');
  });

  it('starts with a little magnet-to-crate line; buying pieces costs sparks', async () => {
    const g = await db.rpc(uid, 'factory_get', { p_id: realm });
    expect(g.factory_core.rates).toEqual({ scrap: 6 });
    expect(g.factory_core.size).toBe(6);
    await expectError(db.rpc(other, 'factory_buy', { p_id: realm, p_piece: 'belt' }), 'not_owner');
    await expectError(db.rpc(uid, 'factory_buy', { p_id: realm, p_piece: 'belt' }), 'not_enough');
    await db.sql(`insert into realm_players (player_id, kind, wallet) values ($1, 'workshop', '{"sparks": 500}') on conflict (player_id, kind) do update set wallet = excluded.wallet`, [uid]);
    const b = await db.rpc(uid, 'factory_buy', { p_id: realm, p_piece: 'belt', p_n: 4 });
    expect(b.factory.owned.belt).toBe(10);
    expect((await wallet()).sparks).toBe(480);
    await expectError(db.rpc(uid, 'factory_buy', { p_id: realm, p_piece: 'coiler' }), 'level_too_low');
  });

  it('saving checks the layout and the pieces you own; output builds up and is collected', async () => {
    await expectError(db.rpc(uid, 'factory_save', { p_id: realm, p_grid: { '9,9': { t: 'belt', d: 1 } } }), 'invalid_layout');
    await expectError(db.rpc(uid, 'factory_save', { p_id: realm, p_grid: { '0,0': { t: 'magnet', d: 1 }, '1,0': { t: 'magnet', d: 1 } } }), 'factory_not_enough_pieces');
    const s = await db.rpc(uid, 'factory_save', { p_id: realm, p_grid: layouts[0] });
    expect(s.factory.rates).toEqual({ gear: 3 });
    await db.sql(`update realm_factories set collected_at = now() - interval '10 minutes' where realm_id = $1`, [realm]);
    const w0 = await wallet();
    const c = await db.rpc(uid, 'factory_collect', { p_id: realm });
    expect(c.got.gear).toBe(30);
    expect((await wallet()).gear - (w0.gear ?? 0)).toBe(30);
    // capped at a few hours away
    await db.sql(`update realm_factories set collected_at = now() - interval '3 days' where realm_id = $1`, [realm]);
    expect((await db.rpc(uid, 'factory_collect', { p_id: realm })).got.gear).toBe(3 * 60 * 6);
  });
});
