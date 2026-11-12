// Ultra sets: rolling an ultra unlocks its explorer + Inkborn set for good; it can't be bought. Profiles show it off.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let owner: string, kai: string, viv: string;
const O = { gx: 3_400_000, gy: 2_300_000 };
let k = 0;
const claim = (uid: string, x: number) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy, p_idempotency_key: `us-${++k}-00000000` });
const unlocks = async (uid: string) => (await db.sql(`select unlock_key from player_unlocks where player_id = $1`, [uid])).map((r: any) => r.unlock_key);

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('owner_ona'); kai = await db.newPlayer('kraken_kai'); viv = await db.newPlayer('viewer_viv');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [kai]); await db.giveInk(kai, 100_000);
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
});
afterAll(() => db.close());

describe('ultra sets', () => {
  it('rolling a Kraken unlocks all nine pieces, with an alert', async () => {
    expect((await unlocks(kai)).filter((u) => u.endsWith('.xkraken'))).toEqual([]);
    await db.rpc(owner, 'admin_grant_roll', { p_player: kai, p_rarity: 'kraken', p_after: 1 });
    expect((await claim(kai, 0)).rarity).toBe('kraken');
    const got = (await unlocks(kai)).filter((u) => u.endsWith('.xkraken')).sort();
    expect(got).toEqual(['explorer.aura.xkraken', 'explorer.hat.xkraken', 'explorer.hold.xkraken', 'explorer.outfit.xkraken', 'explorer.trail.xkraken',
      'inkborn.waura.xkraken', 'inkborn.wface.xkraken', 'inkborn.whead.xkraken', 'inkborn.wneck.xkraken']);
    const n = await db.sql(`select data from player_notifications where player_id = $1 and kind = 'ultra_set'`, [kai]);
    expect(n.length).toBe(1); expect(n[0].data.rarity).toBe('kraken');
  });
  it('they can be worn, but never bought', async () => {
    await db.rpc(kai, 'equip_explorer', { p_style: { hat: 'xkraken', outfit: 'xkraken', hold: 'xkraken', aura: 'xkraken', trail: 'xkraken' } });
    expect((await db.sql(`select explorer_style s from profiles where id = $1`, [kai]))[0].s.hat).toBe('xkraken');
    await expect(db.rpc(viv, 'equip_explorer', { p_style: { hat: 'xsolar' } })).rejects.toThrow(/not_owned/);
    await db.giveInk(viv, 1_000_000);
    await expect(db.rpc(viv, 'purchase_unlock', { p_key: 'explorer.hat.xsolar', p_idempotency_key: 'buy-xsolar-0000' })).rejects.toThrow(/ultra_only/);
  });
  it('the set stays even after the plot is gone', async () => {
    await db.sql(`update world_plots set owner_id = null, claimed_at = null where owner_id = $1 and rarity = 'kraken'`, [kai]);
    expect((await unlocks(kai)).filter((u) => u.endsWith('.xkraken')).length).toBe(9);
  });
});

describe('showcase profiles', () => {
  it('shows the rarest rarity, the chosen badge, Crowns and ultra sets', async () => {
    await db.rpc(owner, 'admin_grant_roll', { p_player: kai, p_rarity: 'mythic', p_after: 1 });
    await claim(kai, 1);
    const c = (await db.sql(`select id, gx, gy from world_cities order by pop desc limit 1`))[0];
    await db.rpc(owner, 'admin_grant_roll', { p_player: kai, p_rarity: 'crown', p_after: 1 });
    expect((await db.rpc(kai, 'acquire_plot', { p_gx: c.gx, p_gy: c.gy, p_idempotency_key: 'us-crown-000000' })).rarity).toBe('crown');
    const p = await db.rpc(viv, 'profile_by_username', { p_username: 'kraken_kai' });
    expect(p.showcase.rarest.rarity).toBe('crown');
    expect(p.showcase.crowns.length).toBe(1); expect(p.showcase.crowns[0].kingdom).toBeTruthy();
    expect(p.showcase.ultra_sets).toEqual(['kraken', 'crown']);
    const badges = p.achievements;
    expect(badges.length).toBeGreaterThan(0); expect(badges[0].category).toBeTruthy();
    await expect(db.rpc(kai, 'set_showcase_badge', { p_key: 'no_such_badge' })).rejects.toThrow(/not_owned/);
    await db.rpc(kai, 'set_showcase_badge', { p_key: badges[0].key });
    expect((await db.rpc(viv, 'profile_by_username', { p_username: 'kraken_kai' })).showcase.badge).toBe(badges[0].key);
  });
  it('Crowns hide when royalty is private', async () => {
    await db.rpc(kai, 'set_privacy', { p_patch: { royalty: false } });
    expect((await db.rpc(viv, 'profile_by_username', { p_username: 'kraken_kai' })).showcase.crowns).toEqual([]);
    expect((await db.rpc(kai, 'profile_by_username', { p_username: 'kraken_kai' })).showcase.crowns.length).toBe(1);
  });
});
