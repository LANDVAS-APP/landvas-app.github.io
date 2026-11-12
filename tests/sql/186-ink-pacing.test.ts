// Hidden Ink pacing: full rate for a normal day, smoothly less for heavy grinding, fast earning or bot-like play;
// fixed rewards are never touched; every screen shows what was really paid.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let owner: string, p: string, q: string;
const A = { gx: 2_200_000, gy: 1_600_000 };
const bal = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const paced = async (uid: string, amount: number, reason = 'farm') => Number((await db.sql(`select private.grant_ink_paced($1, $2, $3, 'test', gen_random_uuid()::text, null) v`, [uid, amount, reason]))[0].v);
const setDay = (uid: string, earned: number, hours = 0) => db.sql(`insert into private.ink_pacing (player_id, day, earned, hours) values ($1, private.day_start(now()), $2, $3)
  on conflict (player_id) do update set day = private.day_start(now()), earned = $2, pace = 0, hours = $3, events = 0, gap_mean = null, gap_var = null, last_at = null`, [uid, earned, hours]);

beforeAll(async () => {
  await db.init({ ungated: true, inkPacing: true });
  owner = await db.newPlayer('pace_owner'); p = await db.newPlayer('pace_pat'); q = await db.newPlayer('pace_quinn');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
});
afterAll(() => db.close());

describe('Ink pacing', () => {
  it('a normal day pays in full, exactly', async () => {
    const b = await bal(p);
    expect(await paced(p, 40)).toBe(40);
    expect(await bal(p)).toBe(b + 40);
  });
  it('a heavy grinding day pays smoothly less — and the balance moves by exactly what is reported', async () => {
    await setDay(p, 3600);
    const b = await bal(p);
    let got = 0;
    for (let i = 0; i < 20; i++) got += await paced(p, 20);
    // around a third of 400 at ~3,600 earned (1 / (1 + 2400/1200)); never below the floor (20%)
    expect(got).toBeGreaterThan(400 * 0.2); expect(got).toBeLessThan(400 * 0.5);
    expect(await bal(p)).toBe(b + got);
  });
  it('earning very fast within an hour slows it too', async () => {
    await setDay(q, 0);
    await db.sql(`update private.ink_pacing set pace = 1800, last_at = now() where player_id = $1`, [q]);
    const got = await paced(q, 100);
    expect(got).toBeLessThan(60);
  });
  it('bot-like play (earning in most hours of the day) pays less', async () => {
    await setDay(q, 0, (1 << 20) - 1);
    let got = 0;
    for (let i = 0; i < 10; i++) got += await paced(q, 10);
    expect(got).toBeGreaterThan(40); expect(got).toBeLessThan(80);
  });
  it('fixed rewards are never paced', async () => {
    await setDay(p, 100000);
    const b = await bal(p);
    await db.sql(`select private.grant($1, '{"ink": 25}'::jsonb, 'daily_streak', 'test', 'x', null)`, [p]);
    await db.sql(`select private.grant($1, '{"ink": 30}'::jsonb, 'wheel', 'test', 'y', null)`, [p]);
    expect(await bal(p)).toBe(b + 55);
  });
  it('the referrer’s share follows what was really paid; turning pacing off restores full rate', async () => {
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { enabled: false } });
    expect(await paced(p, 50)).toBe(50);
    await db.rpc(owner, 'admin_set_ink_pacing', { p_config: { enabled: true } });
    const v = await db.rpc(owner, 'admin_ink_pacing', {});
    expect(v.config.enabled).toBe(true);
    expect(v.today.find((r: any) => r.player.id === p).factor).toBeLessThan(1);
    await expect(db.rpc(p, 'admin_ink_pacing', {})).rejects.toThrow(/forbidden|admin/);
  });
  it('a paced minigame win shows exactly what landed in the balance', async () => {
    await db.rpc(p, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
    await db.sql(`update world_plots set plot_type = 'clay', rarity = 'common', level = 1 where gx = $1 and gy = $2`, [A.gx, A.gy]);
    await setDay(p, 6000);
    const b = await bal(p);
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 1, p_gx: A.gx, p_gy: A.gy });
    const r = await db.rpc({ role: 'service_role' }, 'svc_finish_minigame', { p_session_id: s.session_id,
      p_result: { valid: true, passed: true, score: 400, stars: 3, flags: [], suspicious: false, min_duration_ms: 0, rounds_passed: s.rounds, rounds_total: s.rounds } });
    expect(r.passed).toBe(true);
    expect(await bal(p)).toBe(b + r.rewards.ink);
  });
});
