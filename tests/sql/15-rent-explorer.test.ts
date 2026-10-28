// USD rent accrual, the 20x boost, and the location rules for claiming.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError, cellCenter } from '../helpers/db';
import { liveRent } from '../../src/shared/rent';

const db = new TestDb();
let p: string;
const HOME = { gx: 793500, gy: 1576200 }; // Salt Lake City on the zoom-22 grid (~7 m plots)
afterAll(() => db.close());

const RATES: Record<string, number> = { common: 1.1e-9, rare: 1.6e-9, epic: 2.2e-9, legendary: 4.4e-9, mythic: 8.8e-9 };

async function rate(uid: string) {
  const rows = await db.sql(`select p.rarity from world_plots p where p.owner_id = $1`, [uid]);
  return rows.reduce((s: number, r: any) => s + RATES[r.rarity], 0);
}

describe('USD rent and boost', () => {
  beforeAll(async () => {
    await db.init();
    p = await db.newPlayer('renter');
    await db.placeAt(p, HOME.gx, HOME.gy);
    await db.rpc(p, 'claim_starter_plot', { p_gx: HOME.gx, p_gy: HOME.gy });
    await db.giveInk(p, 300);
    await db.rpc(p, 'acquire_plot', { p_gx: HOME.gx + 1, p_gy: HOME.gy, p_idempotency_key: 'rent-acq-0001' });
  });

  it('publishes the Atlas Earth / TerraMine rate ladder plus Mythic', async () => {
    const r = await db.sql(`select id, usd_per_second::float8 as v, weight from plot_rarities order by sort`);
    expect(r.map((x: any) => x.id)).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic']);
    for (const x of r) expect(x.v).toBeCloseTo(RATES[x.id], 20);
    expect(r.reduce((s: number, x: any) => s + x.weight, 0)).toBe(1000);
  });

  it('accrues rent per second from server time at the summed rarity rates', async () => {
    await db.sql(`update rent_accounts set settled_at = now() - interval '1 hour', balance_usd = 0, boost_until = null where player_id = $1`, [p]);
    const st = await db.rpc(p, 'rent_state');
    const expected = (await rate(p)) * 3600;
    expect(Number(st.rate_usd_per_second)).toBeCloseTo(await rate(p), 18);
    expect(Number(st.balance_usd)).toBeGreaterThan(expected * 0.999);
    expect(Number(st.balance_usd)).toBeLessThan(expected * 1.01);
    const led = await db.sql(`select kind, amount_usd::float8 a from rent_ledger where player_id = $1 order by id desc limit 1`, [p]);
    expect(led[0].kind).toBe('rent');
    expect(led[0].a).toBeCloseTo(Number(st.balance_usd), 12);
  });

  it('settling twice never pays the same second twice', async () => {
    const a = await db.rpc(p, 'rent_state');
    const b = await db.rpc(p, 'rent_state');
    const delta = Number(b.balance_usd) - Number(a.balance_usd);
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThan((await rate(p)) * 5); // only the few ms in between
  });

  it('the boost multiplies rent 20x only inside the boost window', async () => {
    // 600 s since settlement, of which the first 300 s were boosted
    await db.sql(`update rent_accounts set settled_at = now() - interval '600 seconds', boost_until = now() - interval '300 seconds', balance_usd = 0 where player_id = $1`, [p]);
    const st = await db.rpc(p, 'rent_state');
    const expected = (await rate(p)) * (300 + 20 * 300);
    expect(Number(st.balance_usd)).toBeGreaterThan(expected * 0.999);
    expect(Number(st.balance_usd)).toBeLessThan(expected * 1.005);
  });

  it('each press adds 30 minutes, limited to the free presses per day', async () => {
    await db.sql(`update rent_accounts set boost_until = null, boosts_used = 0, boost_day = null where player_id = $1`, [p]);
    const b1 = await db.rpc(p, 'activate_boost', { p_idempotency_key: 'boost-press-01' });
    expect(b1.boost.active).toBe(true);
    expect(b1.boost.remaining_seconds).toBeGreaterThan(1795);
    expect(b1.boost.remaining_seconds).toBeLessThanOrEqual(1800);
    expect(b1.boost.left_today).toBe(5);
    const replay = await db.rpc(p, 'activate_boost', { p_idempotency_key: 'boost-press-01' });
    expect(replay.replayed).toBe(true);
    for (let i = 2; i <= 6; i++) await db.rpc(p, 'activate_boost', { p_idempotency_key: `boost-press-0${i}` });
    const st = await db.rpc(p, 'rent_state');
    expect(st.boost.remaining_seconds).toBeGreaterThan(6 * 1800 - 10);
    expect(st.boost.left_today).toBe(0);
    await expectError(db.rpc(p, 'activate_boost', { p_idempotency_key: 'boost-press-07' }), 'boost_daily_limit');
  });

  it('boost time stacks up to the 8 hour cap', async () => {
    await db.sql(`update rent_accounts set boost_until = now() + interval '7 hours 50 minutes', boosts_used = 0 where player_id = $1`, [p]);
    const r = await db.rpc(p, 'activate_boost', { p_idempotency_key: 'boost-cap-0001' });
    expect(r.boost.remaining_seconds).toBeLessThanOrEqual(8 * 3600);
    expect(r.boost.remaining_seconds).toBeGreaterThan(8 * 3600 - 10);
    await expectError(db.rpc(p, 'activate_boost', { p_idempotency_key: 'boost-cap-0002' }), 'boost_capped');
  });

  it('rent stops accruing after 30 days without a visit', async () => {
    await db.sql(`update rent_accounts set settled_at = now() - interval '40 days', balance_usd = 0, boost_until = null where player_id = $1`, [p]);
    const st = await db.rpc(p, 'rent_state');
    const max = (await rate(p)) * 30 * 86400;
    expect(Number(st.balance_usd)).toBeCloseTo(max, 12);
  });

  it('changing ownership settles first so seconds are paid at the rate in force', async () => {
    await db.sql(`update rent_accounts set settled_at = now() - interval '100 seconds', balance_usd = 0, boost_until = null where player_id = $1`, [p]);
    const before = await rate(p);
    await db.giveInk(p, 100);
    await db.rpc(p, 'acquire_plot', { p_gx: HOME.gx, p_gy: HOME.gy + 1, p_idempotency_key: 'rent-acq-0002' });
    const bal = Number((await db.sql(`select balance_usd::float8 b from rent_accounts where player_id = $1`, [p]))[0].b);
    expect(bal).toBeGreaterThan(before * 99.9);
    expect(bal).toBeLessThan(before * 101);
  });

  it('cash-out is unavailable until the gated flag is enabled with a legal sign-off', async () => {
    const s = await db.rpc(p, 'cashout_status');
    expect(s.enabled).toBe(false);
    expect(s.message).toMatch(/isn.t available yet/);
    await expectError(db.rpc(p, 'request_cashout', { p_method: 'paypal', p_destination: 'me@example.test', p_idempotency_key: 'cash-0000001' }), 'feature_disabled');
  });

  it('with cash-out enabled, a request holds funds and an operator pays or rejects it', async () => {
    await db.sql(`update feature_flags set enabled = true, config = config || '{"legal_signoff": "test"}' where key = 'cashout'`);
    await db.sql(`update rent_accounts set balance_usd = 7.123456, settled_at = now() where player_id = $1`, [p]);
    const r = await db.rpc(p, 'request_cashout', { p_method: 'paypal', p_destination: 'renter@example.test', p_idempotency_key: 'cash-0000002' });
    expect(Number(r.amount_usd)).toBeCloseTo(7.12, 6);
    const acct = (await db.sql(`select balance_usd::float8 b, held_usd::float8 h from rent_accounts where player_id = $1`, [p]))[0];
    expect(acct.h).toBeCloseTo(7.12, 6);
    expect(acct.b).toBeLessThan(0.01);
    await expectError(db.rpc(p, 'request_cashout', { p_method: 'paypal', p_destination: 'renter@example.test', p_idempotency_key: 'cash-0000003' }), 'cashout_pending');
    await expectError(db.rpc(p, 'admin_cashout_queue', {}), 'forbidden');
    const op = await db.newPlayer('treasurer');
    await db.sql(`insert into admin_roles (player_id, role) values ($1, 'payouts')`, [op]);
    const q = await db.rpc(op, 'admin_cashout_queue', {});
    expect(q).toHaveLength(1);
    await expectError(db.rpc(op, 'admin_decide_cashout', { p_request_id: q[0].id, p_decision: 'paid' }), 'provider_ref_required');
    await db.rpc(op, 'admin_decide_cashout', { p_request_id: q[0].id, p_decision: 'paid', p_provider_ref: 'PAYPAL-TXN-123' });
    const after = (await db.sql(`select held_usd::float8 h, paid_usd::float8 pd from rent_accounts where player_id = $1`, [p]))[0];
    expect(after.h).toBe(0);
    expect(after.pd).toBeCloseTo(7.12, 6);
    const audit = await db.sql(`select count(*)::int n from audit_logs where action = 'cashout.paid'`);
    expect(audit[0].n).toBe(1);
  });
});

describe('explorer location rules', () => {
  let e: string;
  beforeAll(async () => {
    e = await db.newPlayer('walker');
  });

  it('the first GPS fix places the explorer; nearby fixes move it', async () => {
    const a = cellCenter(HOME.gx + 100, HOME.gy);
    const r = await db.rpc(e, 'report_position', { p_lng: a.lng, p_lat: a.lat, p_accuracy_m: 12 });
    expect(r).toMatchObject({ mode: 'gps', gx: HOME.gx + 100, gy: HOME.gy, accepted: true, placed: true });
    await db.sql(`update explorers set fixed_at = now() - interval '60 seconds' where player_id = $1`, [e]);
    const b = cellCenter(HOME.gx + 101, HOME.gy);
    const r2 = await db.rpc(e, 'report_position', { p_lng: b.lng, p_lat: b.lat, p_accuracy_m: 12 });
    expect(r2.gx).toBe(HOME.gx + 101);
  });

  it('a teleport is accepted once per cooldown (a flight), then refused', async () => {
    const far = { lng: 2.3522, lat: 48.8566 }; // Paris
    const r = await db.rpc(e, 'report_position', { p_lng: far.lng, p_lat: far.lat, p_accuracy_m: 20 });
    expect(r.reanchored).toBe(true);
    const tokyo = await db.rpc(e, 'report_position', { p_lng: 139.6917, p_lat: 35.6895, p_accuracy_m: 20 });
    expect(tokyo).toMatchObject({ accepted: false, rejected: 'position_jump' });
    expect(tokyo.wait_seconds).toBeGreaterThan(3600 * 5);
    expect(tokyo.lng).toBeCloseTo(far.lng, 6); // position unchanged
    const ev = await db.sql(`select kind from private.security_events where player_id = $1 order by id`, [e]);
    expect(ev.map((x: any) => x.kind)).toEqual(['gps_reanchor', 'gps_jump_rejected']);
  });

  it('explorers follow GPS only: no travel, no jumps, no hand placement', async () => {
    const t = await db.newPlayer('traveller');
    const start = cellCenter(HOME.gx + 300, HOME.gy);
    await expectError(db.rpc(t, 'travel_to', { p_lng: start.lng, p_lat: start.lat }), 'gps_required');
    expect(await db.rpc(t, 'my_explorer')).toBeNull();
    await expectError(db.rpc(t, 'claim_starter_plot', { p_gx: HOME.gx + 400, p_gy: HOME.gy }), 'explorer_required');
    // a real GPS fix places the explorer; it can claim there
    const there = cellCenter(HOME.gx + 400, HOME.gy);
    await db.rpc(t, 'report_position', { p_lng: there.lng, p_lat: there.lat, p_accuracy_m: 10 });
    const b = cellCenter(60000, 40000);
    await expectError(db.rpc(t, 'travel_to', { p_lng: b.lng, p_lat: b.lat, p_jump: true }), 'gps_required');
    expect((await db.rpc(t, 'my_explorer')).gx).toBe(HOME.gx + 400);
    await db.rpc(t, 'claim_starter_plot', { p_gx: HOME.gx + 400, p_gy: HOME.gy });
  });

  it("plot details only ever use the viewer's own position", async () => {
    // the traveller now owns this plot and stands on it; the renter is ~400 plots away
    const d = await db.rpc(p, 'plot_details', { p_gx: HOME.gx + 400, p_gy: HOME.gy });
    expect(d.owner.username).toBe('traveller');
    expect(d.reach.distance).toBe(400);
    expect(JSON.stringify(d)).not.toMatch(/explorer"?:\s*\{|"mode"|"dest"/);
  });
});

describe('minigames are the only Ink faucet', () => {
  let g: string;
  let game: string;
  const PLOT = { gx: HOME.gx + 500, gy: HOME.gy };
  const win = async (score = 400) => {
    const sess = await db.rpc(g, 'start_minigame', { p_game: game, p_level: await db.nextLevel(g, PLOT.gx, PLOT.gy), p_gx: PLOT.gx, p_gy: PLOT.gy });
    return db.rpc({ role: 'service_role' }, 'svc_finish_minigame', {
      p_session_id: sess.session_id,
      p_result: { valid: true, passed: true, score, stars: 3, flags: [], suspicious: false, min_duration_ms: 0 },
    });
  };
  beforeAll(async () => {
    g = await db.newPlayer('gamer2');
    await db.placeAt(g, PLOT.gx, PLOT.gy);
    await db.rpc(g, 'claim_starter_plot', { p_gx: PLOT.gx, p_gy: PLOT.gy });
    game = (await db.rpc(g, 'plot_details', { p_gx: PLOT.gx, p_gy: PLOT.gy })).type_info.minigame;
  });

  it('pays more Ink on rarer plots', async () => {
    await db.sql(`update world_plots set rarity = 'common' where gx = $1 and gy = $2`, [PLOT.gx, PLOT.gy]);
    const common = await win();
    await db.sql(`update world_plots set rarity = 'mythic' where gx = $1 and gy = $2`, [PLOT.gx, PLOT.gy]);
    const mythic = await win();
    expect(common.rewards.ink).toBeGreaterThan(0);
    expect(mythic.rewards.ink).toBeGreaterThanOrEqual(Math.floor(common.rewards.ink * 2.25) - 1);
  });

  it('only the first 6 wins per game per day pay Ink; later wins are practice', async () => {
    let last: any;
    for (let i = 0; i < 4; i++) last = await win();
    expect(last.rewards.ink).toBeGreaterThan(0);
    expect(last.rewards.rewarded_left).toBe(0);
    const practice = await win();
    expect(practice.rewards.ink).toBe(0);
    expect(practice.rewards.practice).toBe(true);
    const rec = await db.rpc(g, 'my_minigame_records');
    expect(rec.rewarded_today[game]).toBe(6);
    expect(rec.daily_rewarded_wins_per_game).toBe(6);
    const inkSources = await db.sql(`select distinct reason from resource_ledger where player_id = $1 and resource = 'ink' and delta > 0`, [g]);
    expect(inkSources.map((r: any) => r.reason)).toEqual(['minigame']);
  });
});

describe('client mirrors of server math', () => {
  it('unclaimed rarity is secret: salted on the server, never returned, still distributed by weight', async () => {
    const salts = await db.sql(`select count(*)::int n from private.secrets where key like 'rarity_salt_%'`);
    expect(salts[0].n).toBe(2);
    const d = await db.rpc(null, 'plot_details', { p_gx: 3000123, p_gy: 1500456 });
    expect(d.rarity).toBeNull();
    expect(d.rarity_info).toBeNull();
    expect(d.rent).toBeNull();
    expect(d.rarity_hidden).toBe(true);
    expect(JSON.stringify(d.acquire ?? {})).not.toMatch(/rarity/);
    const rows = await db.sql(`select private.plot_rarity_for(i * 7919 + 13, i * 104729 % 4000000 + 7) r, count(*)::int n
                               from generate_series(1, 20000) i group by 1`);
    const share = Object.fromEntries(rows.map((r: any) => [r.r, r.n / 20000]));
    expect(share.common).toBeGreaterThan(0.45);
    expect(share.common).toBeLessThan(0.55);
    expect(share.mythic).toBeGreaterThan(0.005);
    expect(share.mythic).toBeLessThan(0.02);
  });

  it('liveRent() reproduces the server live balance', async () => {
    await db.sql(`update rent_accounts set settled_at = now() - interval '900 seconds', boost_until = now() - interval '100 seconds', balance_usd = 0.5 where player_id = $1`, [p]);
    const st = (await db.rpc(p, 'my_state')).rent; // my_state settles only when > 1h stale, so this is unsettled
    const client = liveRent(st, new Date(st.server_time).getTime());
    expect(Math.abs(client - Number(st.live_usd))).toBeLessThan(1e-10); // JS dates carry ms, Postgres µs
  });
});

