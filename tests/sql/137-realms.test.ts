// v0.6 Realm plot types (Crystal Mine, Sky Island, Inventor's Workshop, Restaurant, Dungeon): one engine with
// resources, producers, upgrades, recipes, a market, finds, levels that open new zones, minigames, visitors, Ink.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, vi: string, groupId: string, mineId: string;
const A = { gx: 3_410_000, gy: 2_110_000 };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const age = (session: string, secs: number) => db.sql(`update realm_runs set started_at = now() - make_interval(secs => $2) where id = $1`, [session, secs]);
const play = async (uid: string, id: string, game: string, score: number, secs = 60) => {
  const s = await db.rpc(uid, 'realm_start', { p_id: id, p_game: game });
  await age(s.session, secs);
  return db.rpc(uid, 'realm_finish', { p_session: s.session, p_score: score });
};
const wallet = async (uid: string, kind: string) => (await db.sql(`select wallet from realm_players where player_id = $1 and kind = $2`, [uid, kind]))[0]?.wallet ?? {};

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('realm_owner'); vi = await db.newPlayer('realm_visitor');
  await db.giveInk(ow, 200);
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  groupId = (await db.rpc(ow, 'my_groups'))[0].id;
});
afterAll(() => db.close());

describe('Realm plot types', () => {
  it('all five are plot types, each with six zones, producers, upgrades, recipes, finds and a game', async () => {
    const cfg = (await db.sql(`select value from game_config where key = 'realms'`))[0].value;
    expect(Object.keys(cfg.kinds).sort()).toEqual(['diner', 'dungeon', 'mine', 'sky', 'workshop']);
    for (const k of Object.values(cfg.kinds) as any[]) {
      expect(k.zones.length).toBe(6);
      expect(Object.keys(k.producers).length).toBe(6);
      expect(Object.keys(k.upgrades).length).toBe(4);
      expect(Object.keys(k.recipes).length).toBe(6);
      expect(Object.keys(k.finds).length).toBe(12);
      expect(Object.keys(k.games).length).toBeGreaterThanOrEqual(1);
      // every recipe's ingredients and every drop are real resources
      for (const r of Object.values(k.recipes) as any[]) for (const i of Object.keys(r.in)) expect(k.resources[i]).toBeDefined();
      for (const g of Object.values(k.games) as any[]) for (const d of g.drops) expect(k.resources[d.res]).toBeDefined();
    }
  });

  it('a plot becomes a Crystal Mine', async () => {
    const g = await db.rpc(ow, 'set_group_kind', { p_group_id: groupId, p_kind: 'mine' });
    expect(g.kind).toBe('mine');
    mineId = g.realm_id;
    const v = await db.rpc(ow, 'realm_get', { p_id: mineId });
    expect(v).toMatchObject({ kind: 'mine', mine: true, level: { level: 1 } });
    expect(v.cfg.name).toBe('Crystal Mine');
    expect(await db.rpc(null, 'realm_for_plot', { p_gx: A.gx, p_gy: A.gy })).toMatchObject({ realm_id: mineId, kind: 'mine', level: 1 });
    // can't paint on it
    expect((await db.sql(`select kind from canvas_groups where id = $1`, [groupId]))[0].kind).toBe('mine');
  });

  it('digging pays ore (only from zones you’ve reached), XP, a little Ink, and checks the speed', async () => {
    const s = await db.rpc(ow, 'realm_start', { p_id: mineId, p_game: 'dig' });
    await expectError(db.rpc(ow, 'realm_finish', { p_session: s.session, p_score: 500 }), 'game_too_fast');
    const before = await ink(ow);
    const r = await play(ow, mineId, 'dig', 600);
    expect(r.score).toBe(600);
    expect(r.loot.stone).toBe(180);
    expect(r.loot.copper).toBeUndefined(); // copper caves open at level 3
    expect(r.paid).toBeGreaterThanOrEqual(8);
    // (plus the Ink for the levels it went up)
    expect((await ink(ow)) - before).toBe(r.paid + (r.level_up ? (r.level_up - 1) * 3 : 0));
    // the score can't beat what the time allows
    const capped = (await play(ow, mineId, 'dig', 5000, 20)).score;
    expect(capped).toBeGreaterThanOrEqual(800); expect(capped).toBeLessThan(805);
    await expectError(db.rpc(ow, 'realm_start', { p_id: mineId, p_game: 'glide' }), 'invalid_game');
  });

  it('levels open new zones (and pay Ink)', async () => {
    await db.sql(`update realms set xp = 2000 where id = $1`, [mineId]);
    const v = await db.rpc(ow, 'realm_get', { p_id: mineId });
    expect(v.level.level).toBeGreaterThanOrEqual(6);
    const r = await play(ow, mineId, 'dig', 500);
    expect(r.loot.copper).toBe(60); expect(r.loot.iron).toBe(25);
  });

  it('the market sells resources for gold; producers make resources while you’re away', async () => {
    const s = await db.rpc(ow, 'realm_sell', { p_kind: 'mine', p_res: 'stone', p_n: 100 });
    expect(s).toMatchObject({ sold: 100, got: 100 });
    await expectError(db.rpc(ow, 'realm_sell', { p_kind: 'mine', p_res: 'gold', p_n: 1 }), 'invalid_item');
    const b = await db.rpc(ow, 'realm_buy', { p_id: mineId, p_type: 'producers', p_item: 'miner' });
    expect(b.view.producers.miner).toBe(1);
    expect(b.view.rates.stone).toBe(1.5);
    // an hour later…
    await db.sql(`update realms set collected_at = now() - interval '1 hour' where id = $1`, [mineId]);
    const w0 = (await wallet(ow, 'mine')).stone ?? 0;
    const c = await db.rpc(ow, 'realm_collect', { p_id: mineId });
    expect(Math.round(c.got.stone)).toBe(90);
    expect(Math.round((await wallet(ow, 'mine')).stone - w0)).toBe(90);
    // …but only up to the while-away limit (8 hours to start with)
    await db.sql(`update realms set collected_at = now() - interval '3 days' where id = $1`, [mineId]);
    expect(Math.round((await db.rpc(ow, 'realm_collect', { p_id: mineId })).got.stone)).toBe(720);
    await expectError(db.rpc(vi, 'realm_collect', { p_id: mineId }), 'not_owner');
  });

  it('upgrades, recipes and costs', async () => {
    await db.sql(`update realm_players set wallet = wallet || '{"gold": 5000, "copper": 50}'::jsonb where player_id = $1 and kind = 'mine'`, [ow]);
    const v = await db.rpc(ow, 'realm_buy', { p_id: mineId, p_type: 'upgrades', p_item: 'pick' });
    expect(v.view.upgrades.pick).toBe(1); expect(v.view.effects.game_mult).toBe(0.15);
    expect(v.view.costs.upgrades.pick.gold).toBe(100);
    const r = await play(ow, mineId, 'dig', 400);
    expect(r.loot.stone).toBe(Math.floor(400 * 0.3 * 1.15));
    const m = await db.rpc(ow, 'realm_make', { p_id: mineId, p_recipe: 'copperbar', p_n: 3 });
    expect(m.made.copperbar).toBe(3); expect(m.first).toBe(true);
    expect((await wallet(ow, 'mine')).copper).toBe(35 + 0 + (r.loot.copper ?? 0));
    await expectError(db.rpc(ow, 'realm_make', { p_id: mineId, p_recipe: 'crown', p_n: 1 }), 'level_too_low');
    await expectError(db.rpc(ow, 'realm_make', { p_id: mineId, p_recipe: 'copperbar', p_n: 100 }), 'not_enough');
    await expectError(db.rpc(ow, 'realm_buy', { p_id: mineId, p_type: 'producers', p_item: 'laser' }), 'level_too_low');
  });

  it('rare finds turn up as you play, into the collection book', async () => {
    const count = async () => Object.values((await db.rpc(ow, 'realm_get', { p_id: mineId })).me.finds).reduce((a: number, b: any) => a + b, 0);
    const before = await count();
    let finds = 0;
    for (let i = 0; i < 6; i++) finds += (await play(ow, mineId, 'dig', 1500)).finds.length;
    expect(finds).toBeGreaterThan(0);
    expect((await count()) - before).toBe(finds);
  });

  it('visitors can play; the owner gets a cut', async () => {
    const before = (await wallet(ow, 'mine')).stone;
    const r = await play(vi, mineId, 'dig', 1000);
    expect(r.loot.stone).toBe(Math.floor(1000 * 0.3 * 1.15));
    expect((await wallet(ow, 'mine')).stone - before).toBe(Math.ceil(r.loot.stone * 0.1));
    await expectError(db.rpc(vi, 'realm_buy', { p_id: mineId, p_type: 'upgrades', p_item: 'pick' }), 'not_owner');
    await expectError(db.rpc(vi, 'realm_daily', { p_kind: 'mine' }), 'not_found');
  });

  it('a daily bonus, once a day', async () => {
    const d = await db.rpc(ow, 'realm_daily', { p_kind: 'mine' });
    expect(d).toMatchObject({ amount: 30, streak: 1 });
    await expectError(db.rpc(ow, 'realm_daily', { p_kind: 'mine' }), 'already_done');
  });

  it('switching to another type keeps the mine’s progress for later', async () => {
    const g = await db.rpc(ow, 'set_group_kind', { p_group_id: groupId, p_kind: 'dungeon' });
    expect(g.kind).toBe('dungeon'); expect(g.realm_id).not.toBe(mineId);
    const d = await db.rpc(ow, 'realm_get', { p_id: g.realm_id });
    expect(d).toMatchObject({ kind: 'dungeon', level: { level: 1 } });
    expect((await play(ow, g.realm_id, 'delve', 300)).loot.bone).toBe(90);
    const back = await db.rpc(ow, 'set_group_kind', { p_group_id: groupId, p_kind: 'mine' });
    expect(back.realm_id).toBe(mineId);
    expect((await db.rpc(ow, 'realm_get', { p_id: mineId })).level.level).toBeGreaterThanOrEqual(6);
  });

  it('they show up as doors at home', async () => {
    const un = (await db.sql(`select username from profiles where id = $1`, [ow]))[0].username;
    const h = await db.rpc(ow, 'home_get', { p_username: un });
    expect(h.doors.mine.count).toBe(1); expect(h.doors.dungeon.count).toBe(0);
    expect(h.careers.realms.mine).toBeGreaterThanOrEqual(6);
    await db.rpc(ow, 'home_doors', { p_doors: { mine: 'friends' } });
  });
});
