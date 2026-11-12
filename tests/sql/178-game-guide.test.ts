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
  it('grinders: a day’s Ink by percentile, the top days (no names), and each source’s rate per hour', async () => {
    // a grinding day: 8,000 Ink over 4 hours, mostly arcade
    await db.sql(`insert into resource_ledger (player_id, resource, delta, balance_after, reason, created_at)
      select $1, 'ink', 500, 0, case when i % 4 = 0 then 'minigame' else 'arcade' end, private.day_start(now()) - interval '1 day' + interval '2 hours' + (i % 4) * interval '1 hour' + interval '1 minute'
      from generate_series(1, 16) i`, [b]);
    await db.sql(`delete from private.guide_cache`);
    const s = (await db.rpc(null, 'game_guide')).stats;
    expect(Number(s.player_days.max)).toBeGreaterThanOrEqual(8000);
    expect(s.player_days.ge_8000).toBeGreaterThanOrEqual(1);
    const top = s.top_days[0];
    expect(Number(top.ink)).toBeGreaterThanOrEqual(8000); expect(top.player_id).toBeUndefined();
    expect(Number(top.sources.arcade)).toBe(6000);
    expect(s.grinders.days).toBeGreaterThanOrEqual(1);
    expect(Number(s.by_source.arcade.per_hour)).toBeGreaterThan(0);
    expect(JSON.stringify(s)).not.toContain(b);
    const c = (await db.rpc(null, 'game_guide')).config;
    expect(c.arcade.games).toBeTruthy(); expect(c.realms.kinds).toBeUndefined(); expect(Array.isArray(c.realms.games)).toBe(true);
  });
  it('measures the plot-rarity Ink bonus players really got on minigame wins, for everyone and the top players', async () => {
    const mk = async (uid: string, rm: number, ink: number) => {
      const sid = (await db.sql(`insert into minigame_sessions (player_id, game, level, seed, gx, gy, status, expires_at) values ($1, 'tracecraft', 1, 1, 1, 1, 'validated', now() + interval '1 hour') returning id`, [uid]))[0].id;
      await db.sql(`insert into minigame_rewards (session_id, player_id, ink, breakdown) values ($1, $2, $3, jsonb_build_object('rarity', $4::numeric, 'plot_level', 1))`, [sid, uid, ink, rm]);
    };
    await mk(b, 2.25, 13); await mk(b, 1.7, 10); await mk(a, 1, 6);
    await db.sql(`delete from private.guide_cache`);
    const r = (await db.rpc(null, 'game_guide')).stats.minigame_rarity;
    expect(r.all.wins).toBe(3);
    expect(Number(r.all.avg_mult)).toBeCloseTo((2.25 + 1.7 + 1) / 3, 2);
    expect(Number(r.top.avg_mult)).toBeCloseTo((2.25 + 1.7) / 2, 2); // b earned the most
  });
  it('a rate change shows up straight away (only the stats are cached)', async () => {
    await db.sql(`update plot_rarities set usd_per_second = 0.000000002 where id = 'common'`);
    await db.sql(`update game_config set value = jsonb_set(value, '{acquire,base_ink}', '90') where key = 'economy'`);
    const g = await db.rpc(b, 'game_guide');
    expect(Number(g.rarities.find((r: any) => r.id === 'common').usd_per_second)).toBe(0.000000002);
    expect(g.config.economy.acquire.base_ink).toBe(90);
  });
});
