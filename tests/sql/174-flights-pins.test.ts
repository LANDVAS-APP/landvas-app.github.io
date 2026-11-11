// v1.3: fly anywhere (a pin, or the Hot Zone) — 2 trips a day in all, refills for 100 Ink — and the Hot Zone roll at
// 150 Ink.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let u: string;
const SLC = { lng: -111.891, lat: 40.7608 };
const ink = (n: number) => db.sql(`select private.ledger_apply($1, 'ink', $2, 'admin_adjust', 'test', 'test', $3)`, [u, n, `t:fly:${Math.random()}`]);
const bal = async () => Number((await db.sql(`select coalesce(sum(delta), 0) b from resource_ledger where player_id = $1 and resource = 'ink'`, [u]))[0].b);
const land = () => db.sql(`update travel_trips set arrives_at = now() - interval '1 second' where player_id = $1 and not arrived;
  update explorers set fixed_at = fixed_at - interval '3 hours' where player_id = $1`.replace(/\$1/g, `'${u}'`));

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 1 });
  u = await db.newPlayer('pia_pilot');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  await db.rpc(u, 'claim_starter_plot', { p_gx: 3_330_000, p_gy: 2_230_000 });
});
afterAll(() => db.close());

describe('pin flights', () => {
  it('fly anywhere without a Plane plot, and land right on the pin', async () => {
    const st = await db.rpc(u, 'travel_fly_to', { p_lng: 2.3488, p_lat: 48.8534, p_name: 'Paris' });
    expect(st.trip).toMatchObject({ mode: 'plane', pin: true, to: { kind: 'pin', name: 'Paris' } });
    await land();
    const s2 = await db.rpc(u, 'travel_status');
    expect(s2.arrival).toMatchObject({ pin: true, stop: { name: 'Paris' } });
    expect(s2.explorer.lng).toBeCloseTo(2.3488, 4); expect(s2.explorer.lat).toBeCloseTo(48.8534, 4);
  });
  it('once there you can steer around the pin', async () => {
    await db.sql(`update explorers set joy_bucket_m = 1000, joy_at = now() - interval '1 hour' where player_id = $1`, [u]);
    const r = await db.rpc(u, 'joystick_step', { p_lng: 2.3489, p_lat: 48.8534 });
    expect(r.moved_m).toBeGreaterThan(0);
  });
  it('2 trips a day in all; then refill 2 more for 100 Ink', async () => {
    await db.rpc(u, 'travel_fly_to', { p_lng: 12.5, p_lat: 41.9, p_name: 'Rome' });
    await land(); await db.rpc(u, 'travel_status');
    await expectError(db.rpc(u, 'travel_fly_to', { p_lng: 13.4, p_lat: 52.5 }), 'no_trips_left');
    await expectError(db.rpc(u, 'travel_refill'), 'insufficient_funds');
    await ink(500);
    const before = await bal();
    const r = await db.rpc(u, 'travel_refill');
    expect(r).toMatchObject({ left: 2, cost: 100 });
    expect(await bal()).toBe(before - 100);
    const st = await db.rpc(u, 'travel_fly_to', { p_lng: 13.4, p_lat: 52.5 });
    expect(st.trip.to.name).toBe('Your pin');
  });
  it('a rewarded ad refills trips too (once ads are on)', async () => {
    await db.sql(`update feature_flags set enabled = true where key = 'rewarded_ads'`);
    const r = await db.rpc({ role: 'service_role' }, 'svc_ad_reward', { p_player_id: u, p_reward: 'travel_refill', p_network: 'admob', p_transaction_id: 'tx-fly-1' });
    expect(r.ok).toBe(true);
    expect(Number((await db.sql(`select refills from travel_refills where player_id = $1`, [u]))[0].refills)).toBe(2);
  });
});

describe('the Hot Zone roll', () => {
  it('costs 150 Ink, and says so', async () => {
    const z = await db.rpc(u, 'hot_zone_today');
    expect(z.roll_ink).toBe(150);
    await ink(1000);
    const before = await bal();
    const r = await db.rpc(u, 'quick_buy_plot', { p_idempotency_key: 'hot-150-xxxxxxxxxxxx', p_hot: true });
    expect(r.cost.ink).toBe(150);
    expect(await bal()).toBe(before - 150);
  });
});
