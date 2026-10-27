// USD rent accrual, the 20x boost, and the location rules for claiming.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError, cellCenter } from '../helpers/db';
import { rarityFor } from '../../src/shared/rarity';
import { liveRent } from '../../src/shared/rent';

const db = new TestDb();
let p: string;
const HOME = { gx: 20000, gy: 25000 };
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

  it('manual travel moves at the configured speed and gates claims until arrival', async () => {
    const t = await db.newPlayer('traveller');
    const start = cellCenter(HOME.gx + 300, HOME.gy);
    await db.rpc(t, 'travel_to', { p_lng: start.lng, p_lat: start.lat });
    const dest = cellCenter(HOME.gx + 310, HOME.gy);
    const trip = await db.rpc(t, 'travel_to', { p_lng: dest.lng, p_lat: dest.lat });
    expect(trip.traveling).toBe(true);
    await expectError(db.rpc(t, 'claim_starter_plot', { p_gx: HOME.gx + 310, p_gy: HOME.gy }), 'out_of_reach');
    // halfway there
    const secs = Number((await db.sql(`select extract(epoch from (($1::jsonb ->> 'arrives_at')::timestamptz - fixed_at)) s from explorers where player_id = $2`, [JSON.stringify(trip), t]))[0].s);
    expect(secs).toBeGreaterThan(60); // ~10 plots at 20 km/h takes minutes, not seconds
    await db.sql(`update explorers set fixed_at = now() - make_interval(secs => $2::float8 / 2) where player_id = $1`, [t, secs]);
    const mid = await db.rpc(t, 'my_explorer');
    expect(mid.gx).toBeGreaterThanOrEqual(HOME.gx + 304);
    expect(mid.gx).toBeLessThanOrEqual(HOME.gx + 306);
    await db.sql(`update explorers set fixed_at = now() - make_interval(secs => $2::float8 + 1) where player_id = $1`, [t, secs]);
    const there = await db.rpc(t, 'my_explorer');
    expect(there.traveling).toBe(false);
    expect(there.gx).toBe(HOME.gx + 310);
    await db.rpc(t, 'claim_starter_plot', { p_gx: HOME.gx + 310, p_gy: HOME.gy });
  });

  it('an instant jump is allowed once per cooldown', async () => {
    const j = await db.newPlayer('jumper');
    const a = cellCenter(1000, 1000);
    await db.rpc(j, 'travel_to', { p_lng: a.lng, p_lat: a.lat });
    const b = cellCenter(60000, 40000);
    const r = await db.rpc(j, 'travel_to', { p_lng: b.lng, p_lat: b.lat, p_jump: true });
    expect(r).toMatchObject({ jumped: true, gx: 60000, gy: 40000 });
    await expectError(db.rpc(j, 'travel_to', { p_lng: a.lng, p_lat: a.lat, p_jump: true }), 'jump_cooldown');
  });

  it("plot details only ever use the viewer's own position", async () => {
    // the traveller now owns this plot and stands on it; the renter is ~310 plots away
    const d = await db.rpc(p, 'plot_details', { p_gx: HOME.gx + 310, p_gy: HOME.gy });
    expect(d.owner.username).toBe('traveller');
    expect(d.reach.distance).toBe(310);
    expect(JSON.stringify(d)).not.toMatch(/explorer"?:\s*\{|"mode"|"dest"/);
  });
});

describe('minigames are the only Ink faucet', () => {
  let g: string;
  let game: string;
  const PLOT = { gx: HOME.gx + 500, gy: HOME.gy };
  const win = async (score = 400) => {
    const sess = await db.rpc(g, 'start_minigame', { p_game: game, p_level: 1, p_gx: PLOT.gx, p_gy: PLOT.gy });
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
  it('rarityFor() in TypeScript matches SQL for random cells', async () => {
    const cells = Array.from({ length: 3000 }, (_, i) => [(i * 7919 + 13) % 65536, (i * 104729 + 7) % 65536]);
    const rows = await db.sql(`select (c->>0)::int gx, (c->>1)::int gy, private.plot_rarity_for((c->>0)::int, (c->>1)::int) r from jsonb_array_elements($1::jsonb) c`, [JSON.stringify(cells)]);
    for (const r of rows) expect(rarityFor(r.gx, r.gy)).toBe(r.r);
  });

  it('liveRent() reproduces the server live balance', async () => {
    await db.sql(`update rent_accounts set settled_at = now() - interval '900 seconds', boost_until = now() - interval '100 seconds', balance_usd = 0.5 where player_id = $1`, [p]);
    const st = (await db.rpc(p, 'my_state')).rent; // my_state settles only when > 1h stale, so this is unsettled
    const client = liveRent(st, new Date(st.server_time).getTime());
    expect(Math.abs(client - Number(st.live_usd))).toBeLessThan(1e-10); // JS dates carry ms, Postgres µs
  });
});

