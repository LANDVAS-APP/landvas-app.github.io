// v0.6.2 The Crystal Mine's dig: the server and the app agree on every tile; digs must touch a tunnel and cost
// energy (which refills); loot, finds, depth Ink, tools, dynamite and geodes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';
import { mineHash, mineTile, mineHp, digCost, type MineCfg } from '../../src/realms/mine/tiles';

const db = new TestDb();
let uid: string, other: string, realm: string, seed: number, cfg: MineCfg;
const W = 9;

beforeAll(async () => {
  await db.init({ ungated: true });
  uid = await db.newPlayer('miner_one'); other = await db.newPlayer('miner_two');
  const owner = (await db.sql(`select id from players where id = $1`, [uid]))[0].id;
  const g = (await db.sql(`insert into canvas_groups (owner_id, kind, plot_count) values ($1, 'mine', 1) returning id`, [owner]).catch(() => null))?.[0]?.id ?? null;
  realm = (await db.sql(`insert into realms (owner_id, group_id, kind, seed) values ($1, $2, 'mine', 424242) on conflict (group_id, kind) do update set seed = excluded.seed returning id`, [uid, g]))[0].id;
  seed = 424242;
  cfg = (await db.sql(`select value from game_config where key = 'realm_mine'`))[0].value;
});
afterAll(() => db.close());

describe('Crystal Mine dig', () => {
  it('the app and the server agree on every tile', async () => {
    const rows = await db.sql(`select x, y, private.rmine_hash($1, x, y) h, private.rmine_tile($1, x, y, private.rmine_cfg()) k, private.rmine_hp(y, private.rmine_tile($1, x, y, private.rmine_cfg()), private.rmine_cfg()) hp
      from generate_series(0, 8) x, (select unnest(array[0, 3, 11, 25, 47, 66, 88, 104, 133, 160, 222, 399]) y) ys`, [seed]);
    for (const r of rows) {
      expect(mineHash(seed, r.x, r.y)).toBe(Number(r.h));
      expect(mineTile(seed, r.x, r.y, cfg)).toBe(r.k);
      expect(mineHp(r.y, r.k, cfg)).toBe(r.hp);
    }
  });

  it('digs must touch a tunnel (or the surface), cost energy, and pay out', async () => {
    await expectError(db.rpc(other, 'mine_dig', { p_id: realm, p_cells: [4] }), 'not_owner');
    // a tile 3 down with nothing dug above it is skipped
    const skip = await db.rpc(uid, 'mine_dig', { p_id: realm, p_cells: [3 * W + 4] });
    expect(skip.dug).toEqual([]);
    const col = [0, 1, 2, 3, 4, 5].map((y) => y * W + 4);
    const e0 = (await db.rpc(uid, 'mine_get', { p_id: realm })).mine_core.energy;
    const r = await db.rpc(uid, 'mine_dig', { p_id: realm, p_cells: col });
    expect(r.dug).toEqual(col);
    const want = col.reduce((s, i) => s + digCost(Math.floor(i / W), mineTile(seed, i % W, Math.floor(i / W), cfg), cfg, 0), 0);
    expect(Math.round(e0 - r.mine.energy)).toBe(want);
    expect(r.mine.deepest).toBe(5);
    expect(r.xp).toBeGreaterThan(0);
  });

  it('stops when energy runs out, and it refills over time', async () => {
    await db.sql(`update realm_mines set energy = 1, energy_at = now() where realm_id = $1`, [realm]);
    const deeper = Array.from({ length: 20 }, (_, k) => (6 + k) * W + 4);
    const r = await db.rpc(uid, 'mine_dig', { p_id: realm, p_cells: deeper });
    expect(r.dug.length).toBeLessThan(5);
    await db.sql(`update realm_mines set energy_at = now() - interval '10 hours' where realm_id = $1`, [realm]);
    expect((await db.rpc(uid, 'mine_get', { p_id: realm })).mine_core.energy).toBe(40);
  });

  it('every 10 metres down pays Ink; finds land in the book', async () => {
    const before = Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
    await db.sql(`update realm_mines set energy = 999, tools = '{"tank": 10}'::jsonb, energy_at = now() where realm_id = $1`, [realm]);
    await db.sql(`update game_config set value = jsonb_set(value, '{energy,base}', '2000') where key = 'realm_mine'`);
    await db.sql(`update realm_mines set energy = 2000 where realm_id = $1`, [realm]);
    const deep = await db.sql(`select deepest from realm_mines where realm_id = $1`, [realm]);
    const start = deep[0].deepest + 1;
    const cells = Array.from({ length: 30 }, (_, k) => (start + k) * W + 4);
    const r = await db.rpc(uid, 'mine_dig', { p_id: realm, p_cells: cells });
    expect(r.mine.deepest).toBeGreaterThanOrEqual(20);
    expect(r.ink).toBeGreaterThanOrEqual(2);
    const after = Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
    expect(after - before).toBeGreaterThanOrEqual(r.ink);
  });

  it('tools cost gold; dynamite blasts 3x3; geodes crack', async () => {
    await db.sql(`update realm_players set wallet = '{}'::jsonb where player_id = $1 and kind = 'mine'`, [uid]);
    await expectError(db.rpc(uid, 'mine_tool', { p_id: realm, p_tool: 'pick' }), 'not_enough');
    await db.sql(`update realm_players set wallet = jsonb_build_object('gold', 5000, 'geode', 2) where player_id = $1 and kind = 'mine'`, [uid]);
    const t = await db.rpc(uid, 'mine_tool', { p_id: realm, p_tool: 'pick' });
    expect(t.mine.tools.pick).toBe(1);
    expect(t.me.wallet.gold).toBe(5000 - 60);
    const d0 = t.mine.dynamite;
    const b = await db.rpc(uid, 'mine_dig', { p_id: realm, p_cells: [], p_blast: 2 * W + 3 });
    expect(b.mine.dynamite).toBe(d0 - 1);
    expect(b.dug.length).toBeGreaterThanOrEqual(6);
    await expectError(db.rpc(uid, 'mine_dig', { p_id: realm, p_cells: [], p_blast: 300 * W + 1 }), 'mine_not_reachable');
    const c = await db.rpc(uid, 'mine_crack', { p_id: realm });
    expect(c.loot.crystal).toBeGreaterThanOrEqual(2);
    expect(c.me.wallet.geode).toBe(1);
    const dy = await db.rpc(uid, 'mine_buy_dynamite', { p_id: realm, p_n: 2 });
    expect(dy.mine.dynamite).toBe(d0 + 1);
  });
});
