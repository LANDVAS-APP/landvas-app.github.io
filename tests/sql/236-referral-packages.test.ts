// Referral packages: the base invite pays 500 Ink and nothing else. Real friends (who've earned Ink by playing on 3
// different days) climb tiers; at Tiers I–III the player picks one of four bonuses, the final tier is the Grand
// Package plus a boost of their choosing, and the picks stack — every real friend pays all unlocked tiers' picks
// added together. Staff can switch every share of friends' Ink off live.
// (The tiers here are 1, 2, 3 and 4 real friends so a handful of players climbs them all.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let inv: string, admin: string;
const f: string[] = [];
const reasons = async (u: string): Promise<Record<string, number>> => (await db.sql(`select reason, sum(delta)::int n from resource_ledger where player_id = $1 and resource = 'ink' and delta > 0 group by 1`, [u]))
  .reduce((o: Record<string, number>, r: any) => ({ ...o, [r.reason]: r.n }), {});
const luck = async (u: string) => (await db.sql(`select luck, enchant from player_luck where player_id = $1`, [u]))[0] ?? { luck: 0, enchant: 0 };
const cfg = async () => (await db.sql(`select value from game_config where key = 'referrals'`))[0].value;
const setCfg = async (v: any) => db.sql(`update game_config set value = $1 where key = 'referrals'`, [v]);
const share = async (friend: string) => Number((await db.sql(`select share_ink from referrals where referee_id = $1`, [friend]))[0].share_ink);
const row = async (friend: string) => (await db.sql(`select real_at is not null real, bonus_status, bonus from referrals where referee_id = $1`, [friend]))[0];
/** the friend joins with the inviter's code and counts (signup is the qualify step here) */
const join = async (friend: string) => { await db.rpc(friend, 'redeem_referral', { p_code: 'REF_BOSS' }); };
/** the friend earns Ink by playing, on a day some days ago */
const playDay = (friend: string, daysAgo: number, n = 100) => db.sql(
  `insert into resource_ledger (player_id, resource, delta, balance_after, reason, created_at) values ($1, 'ink', $2, $2, 'minigame', now() - make_interval(days => $3))`, [friend, n, daysAgo]);
const earnNow = (friend: string, n: number) => db.sql(`select private.grant($1, jsonb_build_object('ink', $2::int), 'minigame', null, null, null)`, [friend, n]);
/** two earlier days of play, then today's: the friend is real */
const playThreeDays = async (friend: string, today = 100) => {
  await playDay(friend, 2); await playDay(friend, 1);
  await db.sql(`update referrals set real_checked = null where referee_id = $1`, [friend]);
  await earnNow(friend, today);
};
const pick = (tier: number, p: string) => db.rpc(inv, 'referral_pick', { p_tier: tier, p_pick: p });

beforeAll(async () => {
  await db.init({ ungated: true });
  admin = await db.newPlayer('ref_admin');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'economy') on conflict do nothing`, [admin]);
  inv = await db.newPlayer('ref_boss');
  for (const n of ['amy', 'ben', 'cal', 'dee', 'eve', 'fay']) f.push(await db.newPlayer(`ref_${n}`));
  const v = await cfg();
  await setCfg({ ...v, qualify: 'signup', packages: { ...v.packages, tiers: v.packages.tiers.map((t: any, i: number) => ({ ...t, n: i + 1 })) } });
  await db.sql(`insert into player_luck (player_id, luck) values ($1, 10) on conflict (player_id) do update set luck = 10, enchant = 0`, [inv]);
});
afterAll(() => db.close());

describe('the base invite', () => {
  it('pays 500 Ink and nothing else — no share of the friend’s Ink', async () => {
    const r0 = await db.rpc(inv, 'my_referrals');
    expect(r0.reward_ink).toBe(500);
    expect(r0.share.enabled).toBe(false);
    expect(r0.perks).toMatchObject({ enabled: true, tier: 0, real: 0, bonus_after_days: 3, share_enabled: true, max_share_pct: 40, default_pick: 'golden', stack: null });
    expect(r0.perks.options.map((p: any) => p.id)).toEqual(['golden', 'tycoon', 'royalties', 'fortune']);
    expect(r0.perks.boosts.map((p: any) => p.id)).toEqual(['ink', 'share', 'luck', 'rolls']);
    await join(f[0]);
    await earnNow(f[0], 5000);
    expect(await reasons(inv)).toEqual({ referral: 500 });
    expect((await db.rpc(inv, 'my_referrals')).recent[0]).toMatchObject({ status: 'rewarded', reward_ink: 500, real: false, bonus_status: 'none' });
  });
});

describe('picking', () => {
  it('each tier takes one of its options; the final tier takes a boost', async () => {
    await expectError(pick(1, 'nope'), 'unknown_package');
    await expectError(pick(9, 'golden'), 'unknown_tier');
    await expectError(pick(4, 'golden'), 'unknown_package');
    await expectError(pick(1, 'rolls'), 'unknown_package');
    const r = await pick(1, 'tycoon');
    expect(r.perks.picks).toMatchObject([{ tier: 1, pick: 'tycoon' }]);
    await pick(2, 'royalties');  // (planned ahead, before the tier unlocks)
  });
  it('a pick is locked for 30 days, then it can change', async () => {
    await expectError(pick(1, 'fortune'), 'package_locked');
    await pick(1, 'tycoon');  // (the same pick again is fine)
    await db.sql(`update referral_picks set chosen_at = now() - interval '31 days' where player_id = $1 and tier = 1`, [inv]);
    expect((await pick(1, 'fortune')).perks.picks[0].pick).toBe('fortune');
    await db.sql(`update referral_picks set pick = 'tycoon', chosen_at = now() - interval '31 days' where player_id = $1 and tier = 1`, [inv]);
  });
});

describe('climbing and stacking', () => {
  it('Tier I: a friend who has played on 3 days is real and pays the Tier I pick (Ink Tycoon: 1,000 Ink)', async () => {
    await playThreeDays(f[0]);
    expect((await reasons(inv)).referral_bonus).toBe(1000);
    expect(await row(f[0])).toMatchObject({ real: true, bonus_status: 'paid', bonus: { tier: 1, ink: 1000, parts: [{ tier: 1, pick: 'tycoon' }] } });
    const r = await db.rpc(inv, 'my_referrals');
    expect(r.perks).toMatchObject({ tier: 1, real: 1, stack: { tier: 1, ink: 1000, share_pct: 0 } });
    expect(r.stats).toMatchObject({ bonus_ink: 1000, real: 1 });
    // paid once
    await earnNow(f[0], 100);
    expect((await reasons(inv)).referral_bonus).toBe(1000);
  });
  it('a friend who hasn’t played on enough days doesn’t climb or pay', async () => {
    await join(f[1]);
    await playDay(f[1], 1);
    await earnNow(f[1], 100);
    expect(await row(f[1])).toMatchObject({ real: false, bonus_status: 'none' });
    expect((await db.rpc(inv, 'my_referrals')).perks.tier).toBe(1);
  });
  it('Tier II stacks on Tier I: 1,000 Ink + 10% of each friend’s Ink (Royalties)', async () => {
    await playDay(f[1], 2);
    await db.sql(`update referrals set real_checked = null where referee_id = $1`, [f[1]]);
    const s0 = (await reasons(inv)).referral_share ?? 0;
    await earnNow(f[1], 1000);  // (the day that makes them real is shared too)
    expect((await reasons(inv)).referral_bonus).toBe(2000);
    expect(await share(f[1])).toBe(100);
    expect(await row(f[1])).toMatchObject({ bonus: { tier: 2, ink: 1000, parts: [{ tier: 1, pick: 'tycoon' }, { tier: 2, pick: 'royalties' }] } });
    // the stack's share covers every friend, the first one too
    await earnNow(f[0], 1000);
    expect(await share(f[0])).toBe(100);
    expect((await reasons(inv)).referral_share).toBe(s0 + 200);
    expect((await db.rpc(inv, 'my_referrals')).share).toMatchObject({ enabled: true, pct: 10, cap_ink: 6000, days: 90, tier: 2 });
  });
  it('Tier III with nothing picked pays Golden Circle, on top: Ink, a bigger share, Luck refilled, Enchanted Luck', async () => {
    await join(f[2]);
    await playThreeDays(f[2]);
    expect((await reasons(inv)).referral_bonus).toBe(2000 + 1000 + 1200);
    expect(await row(f[2])).toMatchObject({ bonus: { tier: 3, ink: 2200, luck_refill: true, enchanted_luck: 2, parts: [{ pick: 'tycoon' }, { pick: 'royalties' }, { tier: 3, pick: 'golden' }] } });
    expect(await luck(inv)).toMatchObject({ luck: 100, enchant: 2 });
    expect((await db.rpc(inv, 'my_referrals')).share).toMatchObject({ pct: 15, cap_ink: 9000, days: 90 });
  });
  it('the Grand Package: everything, plus the boost they picked (a Legendary roll)', async () => {
    await pick(4, 'rolls');
    await join(f[3]);
    await playThreeDays(f[3]);
    const r = await row(f[3]);
    expect(r).toMatchObject({ bonus_status: 'paid', bonus: { tier: 4, ink: 1000 + 1200 + 3000, enchanted_luck: 4, luck_refill: true } });
    expect(r.bonus.tickets.sort()).toEqual(['epic', 'legendary']);
    expect(r.bonus.parts[3]).toMatchObject({ tier: 4, pick: 'rolls', grand: true });
    const t = await db.sql(`select min_rarity, count(*)::int n from roll_tickets where player_id = $1 and source = 'referral' and used_at is null group by 1 order by 1`, [inv]);
    expect(t).toEqual([{ min_rarity: 'epic', n: 1 }, { min_rarity: 'legendary', n: 1 }]);
    const m = await db.rpc(inv, 'my_referrals');
    expect(m.perks).toMatchObject({ tier: 4, real: 4 });
    expect(m.share).toMatchObject({ pct: 23, cap_ink: 19000, days: 120 });
  });
  it('the share stops at its cap, after its days, and only counts Ink a friend earns by playing', async () => {
    await earnNow(f[1], 200000);
    expect(await share(f[1])).toBe(19000);
    const s = await share(f[0]);
    await db.sql(`select private.grant($1, '{"ink": 5000}'::jsonb, 'referral_bonus', null, null, null)`, [f[0]]);
    expect(await share(f[0])).toBe(s);
    await db.sql(`update referrals set qualified_at = now() - interval '121 days' where referee_id = $1`, [f[0]]);
    await earnNow(f[0], 10000);
    expect(await share(f[0])).toBe(s);
    await db.sql(`update referrals set qualified_at = now() where referee_id = $1`, [f[0]]);
  });
});

describe('staff controls', () => {
  it('the share is capped at the max share (staff can lower it)', async () => {
    const v = await cfg();
    await db.rpc(admin, 'admin_config_set', { p_key: 'referrals', p_value: { ...v, packages: { ...v.packages, max_share_pct: 20 } } });
    expect((await db.rpc(inv, 'my_referrals')).share.pct).toBe(20);
    await db.rpc(admin, 'admin_config_set', { p_key: 'referrals', p_value: v });
  });
  it('one switch turns every share of friends’ Ink off (and back on), live', async () => {
    const v = await cfg();
    await expectError(db.rpc(inv, 'admin_config_set', { p_key: 'referrals', p_value: { ...v, packages: { ...v.packages, share_enabled: false } } }), 'forbidden');
    await db.rpc(admin, 'admin_config_set', { p_key: 'referrals', p_value: { ...v, packages: { ...v.packages, share_enabled: false } } });
    const s0 = await share(f[2]);
    await earnNow(f[2], 1000);
    expect(await share(f[2])).toBe(s0);
    const m = await db.rpc(inv, 'my_referrals');
    expect(m.share.enabled).toBe(false);
    expect(m.perks.share_enabled).toBe(false);
    await db.rpc(admin, 'admin_config_set', { p_key: 'referrals', p_value: v });
    await earnNow(f[2], 1000);
    expect(await share(f[2])).toBe(s0 + 230);
  });
  it('a nonsense package setting is refused', async () => {
    const v = await cfg();
    const bad = (packages: any) => expectError(db.rpc(admin, 'admin_config_set', { p_key: 'referrals', p_value: { ...v, packages: { ...v.packages, ...packages } } }), 'invalid_referral_config');
    await bad({ options: v.packages.options.map((o: any) => ({ ...o, tiers: o.tiers.slice(0, 2) })) });      // a bundle per tier before the last
    await bad({ options: [{ ...v.packages.options[0], tiers: [{ share_pct: 400 }, {}, {}] }] });
    await bad({ grand: { tickets: [{ min: 'nope', n: 1 }] } });
    await bad({ tiers: [{ n: 5 }, { n: 3 }, { n: 10 }, { n: 20 }] });                                       // rising
    await bad({ default_pick: 'nope' });
    await bad({ boosts: [{ id: 'x', name: 'Bad', add: {} }] });
    await bad({ max_share_pct: 150 });
  });
  it('the Earning switch: a friend who becomes real still climbs, and pays nothing', async () => {
    await join(f[4]);
    const b0 = (await reasons(inv)).referral_bonus;
    await db.rpc(admin, 'admin_earn_switch', { p_key: 'reason:referral_bonus', p_off: true, p_note: 'test' });
    await playThreeDays(f[4]);
    await db.rpc(admin, 'admin_earn_switch', { p_key: 'reason:referral_bonus', p_off: false, p_note: 'test' });
    expect(await row(f[4])).toMatchObject({ real: true, bonus_status: 'void' });
    expect((await reasons(inv)).referral_bonus).toBe(b0);
    expect((await db.rpc(inv, 'my_referrals')).perks.real).toBe(5);
  });
  it('a player whose own Ink earning is off gets no bonus Ink (it’s counted as held)', async () => {
    await db.sql(`insert into private.player_ink_modes (player_id, mode) values ($1, 'off')`, [inv]);
    await join(f[5]);
    const b0 = (await reasons(inv)).referral_bonus;
    await playThreeDays(f[5]);
    expect((await reasons(inv)).referral_bonus).toBe(b0);
    expect(Number((await db.sql(`select held from private.player_ink_modes where player_id = $1`, [inv]))[0].held)).toBe(500 + 5200 + 23); // (the invite, the stacked bonus and 23% of their 100 Ink)
    await db.sql(`delete from private.player_ink_modes where player_id = $1`, [inv]);
  });
  it('with packages switched off, no picks and no stack', async () => {
    const v = await cfg();
    await db.rpc(admin, 'admin_config_set', { p_key: 'referrals', p_value: { ...v, packages: { ...v.packages, enabled: false } } });
    await expectError(pick(3, 'fortune'), 'referral_packages_off');
    expect((await db.rpc(inv, 'my_referrals')).perks.stack).toBeNull();
    await db.rpc(admin, 'admin_config_set', { p_key: 'referrals', p_value: v });
  });
});
