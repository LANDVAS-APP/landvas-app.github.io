import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let alice: string;
let bob: string;

// Salt Lake City-ish plot (z16 tile)
const SLC = { gx: 12400, gy: 24800 };

describe('accounts and ownership', () => {
  beforeAll(async () => {
    await db.init();
    alice = await db.newPlayer('alice');
    bob = await db.newPlayer('bob');
  });
  afterAll(() => db.close());

  it('requires terms acceptance and a valid unique username', async () => {
    const u = await db.createUser('carol@example.test');
    await expectError(db.rpc(u, 'complete_onboarding', { p_username: 'carol', p_accept_terms_version: 'old' }), 'terms_required');
    const terms = (await db.sql(`select value->>'terms_version' v from game_config where key='legal'`))[0].v;
    await expectError(db.rpc(u, 'complete_onboarding', { p_username: 'a!', p_accept_terms_version: terms }), 'invalid_username');
    await expectError(db.rpc(u, 'complete_onboarding', { p_username: 'ALICE', p_accept_terms_version: terms }), 'username_taken');
    await expectError(db.rpc(u, 'complete_onboarding', { p_username: 'admin', p_accept_terms_version: terms }), 'username_reserved');
    const st = await db.rpc(u, 'complete_onboarding', { p_username: 'carol', p_accept_terms_version: terms });
    expect(st.onboarded).toBe(true);
    expect(st.balances.ink).toBe(0);
  });

  it('anonymous callers cannot write', async () => {
    await expectError(db.rpc(null, 'claim_starter_plot', { p_gx: 1, p_gy: 1 }), 'permission denied');
  });

  it('claims need an explorer nearby', async () => {
    await expectError(db.rpc(alice, 'claim_starter_plot', { p_gx: SLC.gx, p_gy: SLC.gy }), 'explorer_required');
    await db.placeAt(alice, SLC.gx + 9, SLC.gy);
    await expectError(db.rpc(alice, 'claim_starter_plot', { p_gx: SLC.gx, p_gy: SLC.gy }), 'out_of_reach');
    const d = await db.rpc(alice, 'plot_details', { p_gx: SLC.gx, p_gy: SLC.gy });
    expect(d.reach).toMatchObject({ explorer: true, distance: 9, max: 6, in_reach: false });
  });

  it('claims a free starter plot exactly once; no Ink is handed out', async () => {
    await db.placeAt(alice, SLC.gx, SLC.gy);
    const r = await db.rpc(alice, 'claim_starter_plot', { p_gx: SLC.gx, p_gy: SLC.gy });
    expect(r.gx).toBe(SLC.gx);
    expect(r.group_id).toBeTruthy();
    expect(['common', 'rare', 'epic', 'legendary', 'mythic']).toContain(r.rarity);
    expect(r.balances.ink).toBe(0); // Ink only comes from minigame wins
    expect(r.balances.pigments).toBe(5);
    expect(r.achievements.map((a: any) => a.key)).toContain('first_plot');
    await expectError(db.rpc(alice, 'claim_starter_plot', { p_gx: SLC.gx + 1, p_gy: SLC.gy }), 'starter_already_claimed');
  });

  it('a claimed plot cannot be claimed by someone else', async () => {
    await db.placeAt(bob, SLC.gx, SLC.gy);
    await expectError(db.rpc(bob, 'claim_starter_plot', { p_gx: SLC.gx, p_gy: SLC.gy }), 'plot_unavailable');
    const st = await db.rpc(bob, 'my_state');
    expect(st.player.starter_plot_claimed).toBe(false); // failed claim rolled back completely
  });

  it('plot details show owner, rarity, rent and a flat Ink price', async () => {
    const d = await db.rpc(bob, 'plot_details', { p_gx: SLC.gx, p_gy: SLC.gy });
    expect(d.owned).toBe(true);
    expect(d.owner.username).toBe('alice');
    expect(d.is_mine).toBe(false);
    expect(Number(d.rent.usd_per_second)).toBeGreaterThan(0);
    expect(Number(d.rent.boost_multiplier)).toBe(20);
    const n = await db.rpc(alice, 'plot_details', { p_gx: SLC.gx + 1, p_gy: SLC.gy });
    const far = await db.rpc(alice, 'plot_details', { p_gx: SLC.gx + 50, p_gy: SLC.gy });
    expect(n.owned).toBe(false);
    expect(Number(n.acquire.ink)).toBe(100);
    expect(Number(far.acquire.ink)).toBe(100);
    expect(n.reach.in_reach).toBe(true);
    expect(far.reach.in_reach).toBe(false);
  });

  it('rarity is deterministic per plot and matches the configured odds', async () => {
    const rows = await db.sql(`
      select private.plot_rarity_for(gx, gy) as r, count(*)::int as n
      from generate_series(20000, 20099) gx, generate_series(30000, 30099) gy group by 1`);
    const total = rows.reduce((s: number, r: any) => s + r.n, 0);
    const share = Object.fromEntries(rows.map((r: any) => [r.r, r.n / total]));
    expect(share.common).toBeGreaterThan(0.46);
    expect(share.common).toBeLessThan(0.54);
    expect(share.rare).toBeGreaterThan(0.27);
    expect(share.rare).toBeLessThan(0.33);
    expect(share.epic).toBeGreaterThan(0.12);
    expect(share.epic).toBeLessThan(0.16);
    expect(share.legendary).toBeGreaterThan(0.04);
    expect(share.legendary).toBeLessThan(0.06);
    expect(share.mythic).toBeGreaterThan(0.006);
    expect(share.mythic).toBeLessThan(0.014);
    const again = await db.sql(`select private.plot_rarity_for(12345, 23456) a, private.plot_rarity_for(12345, 23456) b`);
    expect(again[0].a).toBe(again[0].b);
  });

  it('buys a nearby plot with Ink, idempotently', async () => {
    await expectError(db.rpc(alice, 'acquire_plot', { p_gx: SLC.gx + 1, p_gy: SLC.gy, p_idempotency_key: 'acq-broke-0001' }), 'insufficient_funds');
    await db.giveInk(alice, 250);
    const key = 'acq-test-key-0001';
    const r1 = await db.rpc(alice, 'acquire_plot', { p_gx: SLC.gx + 1, p_gy: SLC.gy, p_idempotency_key: key });
    const r2 = await db.rpc(alice, 'acquire_plot', { p_gx: SLC.gx + 1, p_gy: SLC.gy, p_idempotency_key: key });
    expect(r2.replayed).toBe(true);
    expect(r2.group_id).toBe(r1.group_id);
    const ledger = await db.sql(`select count(*)::int n from resource_ledger where player_id = $1 and reason = 'acquire_plot' and resource = 'ink'`, [alice]);
    expect(ledger[0].n).toBe(1);
    expect(r1.balances.ink).toBe(150);
    expect(Number(r1.rent.rate_usd_per_second)).toBeGreaterThan(0);
    await expectError(db.rpc(alice, 'acquire_plot', { p_gx: SLC.gx + 8, p_gy: SLC.gy, p_idempotency_key: 'acq-far-00001' }), 'out_of_reach');
  });

  it('rejects purchases the player cannot afford without side effects', async () => {
    await db.placeAt(bob, 30000, 30000);
    await db.rpc(bob, 'claim_starter_plot', { p_gx: 30000, p_gy: 30000 });
    await db.giveInk(bob, 3);
    await expectError(db.rpc(bob, 'acquire_plot', { p_gx: 30001, p_gy: 30000, p_idempotency_key: 'bob-acq-000001' }), 'insufficient_funds');
    const owned = await db.sql(`select count(*)::int n from world_plots where gx = 30001 and gy = 30000 and owner_id is not null`);
    expect(owned[0].n).toBe(0);
  });

  it('two players racing for the same plot: exactly one wins', async () => {
    const c1 = await db.connect();
    const c2 = await db.connect();
    const p1 = await db.newPlayer('racer1');
    const p2 = await db.newPlayer('racer2');
    await db.placeAt(p1, 40000, 20000);
    await db.placeAt(p2, 40000, 20001);
    const target = { p_gx: 40000, p_gy: 20000 };
    const results = await Promise.allSettled([
      db.rpc(p1, 'claim_starter_plot', target, c1),
      db.rpc(p2, 'claim_starter_plot', target, c2),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String(failed[0].reason.message)).toContain('plot_unavailable');
    const rows = await db.sql(`select count(*)::int n from plot_ownership where gx = 40000 and gy = 20000 and released_at is null`);
    expect(rows[0].n).toBe(1);
  });

  it('many concurrent acquisitions of one plot never double-sell', async () => {
    const players: string[] = [];
    for (let i = 0; i < 6; i++) {
      const p = await db.newPlayer(`swarm${i}`);
      await db.placeAt(p, 50100, 10101); // within reach of both the starter cell and the target
      await db.rpc(p, 'claim_starter_plot', { p_gx: 50099 + (i % 3), p_gy: 10101 + Math.floor(i / 3) });
      await db.giveInk(p, 200);
      players.push(p);
    }
    const conns = await Promise.all(players.map(() => db.connect()));
    const results = await Promise.allSettled(
      players.map((p, i) => db.rpc(p, 'acquire_plot', { p_gx: 50100, p_gy: 10100, p_idempotency_key: `swarm-key-${i}-xyz` }, conns[i])),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    // losers were not charged
    const charged = await db.sql(`select count(*)::int n from resource_ledger where reason = 'acquire_plot' and resource = 'ink' and ref_id = '50100_10100'`);
    expect(charged[0].n).toBe(1);
  });

  it('Ink can only be granted by minigame wins', async () => {
    await expectError(db.sql(`select private.grant($1, '{"ink": 10}'::jsonb, 'event_reward', null, null, null)`, [alice]), 'ink_minigame_only');
    await expectError(db.sql(`select private.grant($1, '{"ink": 10}'::jsonb, 'achievement', null, null, null)`, [alice]), 'ink_minigame_only');
    await db.sql(`select private.grant($1, '{"pigments": 1}'::jsonb, 'event_reward', null, null, null)`, [alice]);
    const inkAch = await db.sql(`select count(*)::int n from achievements where reward ? 'ink'`);
    expect(inkAch[0].n).toBe(0);
    const eco = (await db.sql(`select value from game_config where key = 'economy'`))[0].value;
    expect(eco.starter_bonus.ink).toBeUndefined();
    expect(eco.publish_reward.ink).toBeUndefined();
  });

  it('level-ups cost Ink + Pigments and add 1% rent per level', async () => {
    await db.sql(`update resource_balances set amount = 5000 where player_id = $1 and resource in ('ink','pigments')`, [alice]);
    const before = await db.rpc(alice, 'plot_details', { p_gx: SLC.gx, p_gy: SLC.gy });
    const r = await db.rpc(alice, 'upgrade_plot', { p_gx: SLC.gx, p_gy: SLC.gy, p_idempotency_key: 'upgrade-0000001' });
    expect(r.plot.level).toBe(2);
    expect(Number(r.plot.rent.usd_per_second)).toBeCloseTo(Number(before.rent.usd_per_second) * 1.01, 18);
    expect(Number(r.balances.ink)).toBe(5000 - 150);
    await expectError(db.rpc(bob, 'upgrade_plot', { p_gx: SLC.gx, p_gy: SLC.gy, p_idempotency_key: 'upgrade-bob-001' }), 'not_owner');
  });

  it("players can read their own balance but never another player's", async () => {
    await db.admin.query('begin');
    await db.admin.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: bob, role: 'authenticated' })]);
    await db.admin.query('set local role authenticated');
    const rows = (await db.admin.query('select player_id from resource_balances')).rows;
    const explorers = (await db.admin.query('select player_id from explorers')).rows;
    const rent = (await db.admin.query('select player_id from rent_accounts')).rows;
    await db.admin.query('rollback');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => r.player_id === bob)).toBe(true);
    expect(explorers.every((r: any) => r.player_id === bob)).toBe(true); // nobody sees anyone else's location
    expect(rent.every((r: any) => r.player_id === bob)).toBe(true);
  });

  it('API roles cannot write tables directly', async () => {
    await db.admin.query('begin');
    await db.admin.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: bob, role: 'authenticated' })]);
    await db.admin.query('set local role authenticated');
    await expect(db.admin.query(`update resource_balances set amount = 999999 where player_id = '${bob}'`)).rejects.toThrow(/permission denied/);
    await db.admin.query('rollback');
    await db.admin.query('begin');
    await db.admin.query('set local role authenticated');
    await expect(db.admin.query(`update rent_accounts set balance_usd = 1000 where player_id = '${bob}'`)).rejects.toThrow(/permission denied/);
    await db.admin.query('rollback');
    await db.admin.query('begin');
    await db.admin.query('set local role authenticated');
    await expect(db.admin.query(`insert into world_plots (gx, gy, plot_type, rarity) values (1,1,'graphite','mythic')`)).rejects.toThrow(/permission denied/);
    await db.admin.query('rollback');
  });

  it('service functions are not callable by players', async () => {
    await expectError(db.rpc(alice, 'svc_claim_job', { p_worker: 'evil' }), 'permission denied');
    await expectError(db.rpc(alice, 'svc_finish_minigame', { p_session_id: '00000000-0000-0000-0000-000000000000', p_result: {} }), 'permission denied');
  });

  it('admin functions are forbidden to regular players', async () => {
    await expectError(db.rpc(alice, 'admin_overview'), 'forbidden');
    await expectError(db.rpc(alice, 'admin_adjust_balance', { p_player_id: alice, p_resource: 'ink', p_delta: 100000, p_reason: 'cheat' }), 'forbidden');
    await expectError(db.rpc(alice, 'admin_adjust_rent', { p_player_id: alice, p_delta_usd: 50, p_reason: 'cheat' }), 'forbidden');
    await expectError(db.rpc(alice, 'admin_set_role', { p_player_id: alice, p_role: 'admin', p_on: true }), 'forbidden');
    await expectError(db.rpc(alice, 'dev_grant_self_admin'), 'forbidden');
  });

  it('antimeridian plots are neighbours and within reach', async () => {
    const p = await db.newPlayer('wrapper');
    await db.placeAt(p, 4194303, 30000);
    await db.rpc(p, 'claim_starter_plot', { p_gx: 4194303, p_gy: 30000 });
    const d = await db.rpc(p, 'plot_details', { p_gx: 0, p_gy: 30000 });
    expect(d.reach.in_reach).toBe(true);
    const n = d.neighbors.find((x: any) => x.dir === 'w');
    expect(n.gx).toBe(4194303);
    expect(n.is_mine).toBe(true);
  });

  it('viewport query returns owned plots (with rarity) including across the antimeridian', async () => {
    const rows = await db.rpc(null, 'plots_in_bbox', { p_min_gx: -10, p_min_gy: 29990, p_max_gx: 10, p_max_gy: 30010 });
    const hit = rows.find((r: any[]) => r[0] === 4194303 && r[1] === 30000);
    expect(hit).toBeTruthy();
    expect(['common', 'rare', 'epic', 'legendary', 'mythic']).toContain(hit[9]);
    await expectError(db.rpc(null, 'plots_in_bbox', { p_min_gx: 0, p_min_gy: 0, p_max_gx: 5000, p_max_gy: 5000 }), 'bbox_too_large');
  });

  it('density aggregates follow ownership', async () => {
    const d = await db.rpc(null, 'density_in_bbox', { p_z: 5, p_x0: 0, p_y0: 0, p_x1: 31, p_y1: 31 });
    const total = d.reduce((s: number, r: number[]) => s + r[2], 0);
    const owned = await db.sql(`select count(*)::int n from world_plots where owner_id is not null`);
    expect(total).toBe(owned[0].n);
  });
});
