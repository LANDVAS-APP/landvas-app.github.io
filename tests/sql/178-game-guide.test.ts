// The Guide: every live rate plus real averages from what players earned. Changing a rate shows on the page by itself.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let a: string, b: string;
beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  a = await db.newPlayer('guide_gail'); b = await db.newPlayer('guide_gus');
  // two hours of play for a, one for b; an invite bonus and a conversion that must not count as "earned by playing"
  await db.sql(`insert into resource_ledger (player_id, resource, delta, balance_after, reason, created_at) values
    ($1, 'ink', 60, 0, 'minigame', now() - interval '3 hours'), ($1, 'ink', 40, 0, 'farm', now() - interval '3 hours'),
    ($1, 'ink', 100, 0, 'minigame', now() - interval '1 hour'),
    ($2, 'ink', 50, 0, 'pvp', now() - interval '2 hours'),
    ($1, 'ink', 500, 0, 'referral', now() - interval '1 hour'), ($2, 'ink', 300, 0, 'usd_conversion', now()),
    ($2, 'ink', 999, 0, 'minigame', now() - interval '30 days')`, [a, b]);
});
afterAll(() => db.close());

describe('game guide', () => {
  it('works signed out, with live rates for every rarity', async () => {
    const g = await db.rpc(null, 'game_guide');
    const common = g.rarities.find((r: any) => r.id === 'common');
    expect(Number(common.usd_per_second)).toBeGreaterThan(0);
    const total = g.rarities.reduce((s: number, r: any) => s + Number(r.chance), 0);
    expect(total).toBeGreaterThan(0.999); expect(total).toBeLessThan(1.001);
    expect(g.config.economy.acquire.base_ink).toBeGreaterThan(0);
    expect(g.config.rent.boost.multiplier).toBeGreaterThan(0);
    expect(g.config.minigames.games).toBeTruthy();
    expect(g.config.hot_zones.cities).toBeUndefined();
  });
  it('measures Ink per hour of play from the last 14 days, without invites or conversions', async () => {
    const s = (await db.rpc(a, 'game_guide')).stats;
    expect(s.players).toBe(2); expect(Number(s.active_hours)).toBe(3);
    expect(Number(s.ink)).toBe(250);
    expect(Number(s.ink_per_active_hour)).toBeCloseTo(83.3, 1);
    expect(s.by_source.minigame.ink).toBe(160); expect(s.by_source.referral).toBeUndefined();
  });
  it('a rate change shows up straight away (only the stats are cached)', async () => {
    await db.sql(`update plot_rarities set usd_per_second = 0.000000002 where id = 'common'`);
    await db.sql(`update game_config set value = jsonb_set(value, '{acquire,base_ink}', '90') where key = 'economy'`);
    const g = await db.rpc(b, 'game_guide');
    expect(Number(g.rarities.find((r: any) => r.id === 'common').usd_per_second)).toBe(0.000000002);
    expect(g.config.economy.acquire.base_ink).toBe(90);
  });
});
