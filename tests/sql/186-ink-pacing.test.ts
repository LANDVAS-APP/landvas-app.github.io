// Ink Flow: uncapped Ink with a hidden, self-balancing rate built around the owner's daily target — an option; off is classic Ink.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let owner: string, p: string, q: string, r: string;
const A = { gx: 2_200_000, gy: 1_600_000 };
const bal = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const paced = async (uid: string, amount: number, reason = 'farm') => Number((await db.sql(`select private.grant_ink_paced($1, $2, $3, 'test', gen_random_uuid()::text, null) v`, [uid, amount, reason]))[0].v);
const state = (uid: string, s: Record<string, unknown>) => db.sql(`update private.ink_pacing set day = private.day_start(now()), earned = 0, paid = $2, heat = $3, load = $4, mom = $5, hours = $6, events = 0, gap_mean = null, gap_var = null,
    src = '{}'::jsonb, last_at = $7 where player_id = $1`, [uid, s.paid ?? 0, s.heat ?? 0, s.load ?? 0, s.mom ?? 0, s.hours ?? 0, s.last_at ?? null]);
const reset = async (uid: string, s: Record<string, unknown> = {}) => {
  await db.sql(`insert into private.ink_pacing (player_id, day) values ($1, private.day_start(now())) on conflict do nothing`, [uid]);
  await state(uid, s);
};
const sum = async (uid: string, n: number, amount: number, reason = 'farm') => { let t = 0; for (let i = 0; i < n; i++) t += await paced(uid, amount, reason); return t; };

beforeAll(async () => {
  await db.init({ ungated: true, inkPacing: true });
  owner = await db.newPlayer('flow_owner'); p = await db.newPlayer('flow_pat'); q = await db.newPlayer('flow_quinn'); r = await db.newPlayer('flow_rae');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
});
afterAll(() => db.close());

describe('Ink Flow', () => {
  it('a session starts a little low and warms up', async () => {
    await reset(p);
    const first = await paced(p, 100);
    expect(first).toBeGreaterThanOrEqual(74); expect(first).toBeLessThanOrEqual(86); // ×0.8 ± jitter
    await sum(p, 8, 10);
    const warm = await paced(p, 100);
    expect(warm).toBeGreaterThan(first);
  });
  it('a heavy burst slows down — and a short break brings it back', async () => {
    await reset(q, { heat: 900, mom: 1 });  // 900 Ink just now (target 1,500)
    const hot = await sum(q, 5, 20);
    await reset(q, { heat: 900, mom: 1, last_at: new Date(Date.now() - 2 * 3600_000).toISOString() });  // …two hours ago
    const rested = await sum(q, 5, 20);
    expect(hot).toBeLessThan(40); expect(rested).toBeGreaterThan(hot * 2);
  });
  it('however slow, an activity still pays 1 Ink', async () => {
    await reset(q, { heat: 20000, load: 20000, mom: 1 });
    for (let i = 0; i < 5; i++) expect(await paced(q, 10)).toBe(1);
  });
  it('far past the target in a day, even that 1 Ink only comes now and then', async () => {
    await reset(q, { heat: 20000, load: 20000, paid: 6000, mom: 1 });
    const got = await sum(q, 40, 10);
    expect(got).toBeLessThan(20);
  });
  it('the balance moves by exactly what is paid', async () => {
    await reset(r);
    const b = await bal(r);
    const got = await sum(r, 10, 15);
    expect(await bal(r)).toBe(b + got);
  });
  it('fixed rewards are never paced', async () => {
    await reset(r, { heat: 50000, load: 50000, paid: 50000 });
    const b = await bal(r);
    await db.sql(`select private.grant($1, '{"ink": 25}'::jsonb, 'daily_streak', 'test', 'x', null)`, [r]);
    await db.sql(`select private.grant($1, '{"ink": 30}'::jsonb, 'wheel', 'test', 'y', null)`, [r]);
    expect(await bal(r)).toBe(b + 55);
  });
  it('bot-like play (earning in most hours of the day) pays less', async () => {
    await reset(p, { mom: 1 }); const normal = await sum(p, 20, 10);
    await reset(p, { mom: 1, hours: (1 << 20) - 1 }); const bot = await sum(p, 20, 10);
    expect(bot).toBeLessThan(normal * 0.8);
  });
  it('the daily target sets the scale: a bigger target lets the same burst through', async () => {
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { daily_target: 1500 } });
    await reset(q, { heat: 600, mom: 1 }); const small = await sum(q, 10, 20);
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { daily_target: 6000 } });
    await reset(q, { heat: 600, mom: 1 }); const big = await sum(q, 10, 20);
    expect(big).toBeGreaterThan(small * 1.3);
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { daily_target: 1500 } });
  });
  it('uncap: every system cap steps aside (Ink Flow is forced on), and minigame paid runs are unlimited', async () => {
    await expect(db.rpc(p, 'admin_set_ink_pacing', { p_config: { uncapped: true } })).rejects.toThrow(/forbidden|admin/);
    await expect(db.rpc(owner, 'admin_set_ink_pacing', { p_config: { daily_target: 1 } })).rejects.toThrow(/invalid_config/);
    // capped: farm Ink at its daily cap pays nothing
    await db.sql(`insert into farm_ink_days (player_id, day, ink) values ($1, private.day_start(now()), 100000) on conflict (player_id, day) do update set ink = 100000`, [r]);
    await reset(r);
    expect(Number((await db.sql(`select private.farm_pay($1, 30, 'x', null) v`, [r]))[0].v)).toBe(0);
    const v = await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { uncapped: true, enabled: false } });
    expect(v.config.uncapped).toBe(true); expect(v.config.enabled).toBe(true);
    expect(Number((await db.sql(`select private.farm_pay($1, 30, 'x', null) v`, [r]))[0].v)).toBeGreaterThan(0);
    const w = await db.rpc(null, 'world_config');
    expect(w.ink_uncapped).toBe(true); expect(w.minigames.limit_paid_runs).toBe(false);
    expect(v.today.some((x: any) => x.player.id === r)).toBe(true);
  });
  it('a paced minigame win shows exactly what landed in the balance (uncapped: no paid-run limit)', async () => {
    await db.rpc(p, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
    await db.sql(`update world_plots set plot_type = 'clay', rarity = 'common', level = 1 where gx = $1 and gy = $2`, [A.gx, A.gy]);
    await reset(p, { heat: 400 });
    const b = await bal(p);
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 1, p_gx: A.gx, p_gy: A.gy });
    const res = await db.rpc({ role: 'service_role' }, 'svc_finish_minigame', { p_session_id: s.session_id,
      p_result: { valid: true, passed: true, score: 400, stars: 3, flags: [], suspicious: false, min_duration_ms: 0, rounds_passed: s.rounds, rounds_total: s.rounds } });
    expect(res.passed).toBe(true); expect(res.rewards.unlimited).toBe(true); expect(res.rewards.rewarded_left).toBeNull();
    expect(await bal(p)).toBe(b + res.rewards.ink);
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { uncapped: false } });
    expect((await db.rpc(null, 'world_config')).ink_uncapped).toBe(false);
  });
  it('switching Ink Flow off is classic Ink: it also brings the daily caps back, and every payout is paid in full', async () => {
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { uncapped: true } });
    const v = await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { enabled: false } });
    expect(v.config.enabled).toBe(false); expect(v.config.uncapped).toBe(false);
    expect((await db.rpc(null, 'world_config')).ink_uncapped).toBe(false);
    // even a player the hidden rate would slow to a trickle gets the whole amount
    await reset(q, { heat: 20000, load: 20000, paid: 6000, mom: 0, hours: (1 << 20) - 1 });
    const b = await bal(q);
    for (let i = 0; i < 10; i++) expect(await paced(q, 25)).toBe(25);
    expect(await bal(q)).toBe(b + 250);
  });
  it('classic Ink: group games have no daily cap (with Ink Flow on they do)', async () => {
    await db.sql(`insert into group_game_ink_days (player_id, day, ink) values ($1, private.day_start(now()), 500) on conflict (player_id, day) do update set ink = 500`, [r]);
    expect(Number((await db.sql(`select private.gg_pay($1, 12, 'g1', null) v`, [r]))[0].v)).toBe(12);
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { enabled: true } });
    expect(Number((await db.sql(`select private.gg_pay($1, 12, 'g2', null) v`, [r]))[0].v)).toBe(0);
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { enabled: false } });
  });
  it('classic Ink: a Pandora’s Greed curse still slows the cursed player’s Ink', async () => {
    await db.sql(`insert into enchant_buffs (player_id, kind, mult, expires_at) values ($1, 'curse_greed', 0.75, now() + interval '1 hour')`, [p]);
    const got = await sum(p, 20, 20);
    expect(got).toBeGreaterThan(250); expect(got).toBeLessThan(350);  // ≈ 300 of 400
    await db.sql(`delete from enchant_buffs where player_id = $1 and kind = 'curse_greed'`, [p]);
    expect(await paced(p, 20)).toBe(20);
  });
});
