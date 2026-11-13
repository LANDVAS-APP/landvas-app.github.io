// Fast travel: pay Ink to arrive right now — 1 Ink a minute left (5–60), and you land where the trip was going.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let u: string;
const SLC = { lng: -111.891, lat: 40.7608 };
const ink = (n: number) => db.sql(`select private.ledger_apply($1, 'ink', $2, 'admin_adjust', 'test', 'test', $3)`, [u, n, `t:fast:${Math.random()}`]);
const bal = async () => Number((await db.sql(`select coalesce(sum(delta), 0) b from resource_ledger where player_id = $1 and resource = 'ink'`, [u]))[0].b);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 1 });
  u = await db.newPlayer('fay_fast');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
});
afterAll(() => db.close());

describe('fast travel', () => {
  it('nothing to skip when you are not travelling', async () => {
    const st = await db.rpc(u, 'travel_status');
    expect(st.fast_ink).toBeNull();
    await expectError(db.rpc(u, 'travel_fast'), 'no_trip');
  });
  it('a flight says what arriving now costs, and paying lands you there', async () => {
    await db.rpc(u, 'travel_fly_to', { p_lng: 2.3488, p_lat: 48.8534, p_name: 'Paris' });
    const st = await db.rpc(u, 'travel_status');
    expect(st.trip.arrived).toBe(false);
    expect(st.fast_ink).toBeGreaterThanOrEqual(5);
    expect(st.fast_ink).toBeLessThanOrEqual(60);
    await expectError(db.rpc(u, 'travel_fast'), 'insufficient_funds');
    await ink(500);
    const before = await bal();
    const r = await db.rpc(u, 'travel_fast');
    expect(r.fast_cost).toBe(st.fast_ink);
    expect(await bal()).toBe(before - st.fast_ink);
    expect(r.arrival).toMatchObject({ pin: true });
    expect(r.trip == null || r.trip.arrived).toBe(true);
    expect(r.fast_ink).toBeNull();
    expect(r.explorer.lng).toBeCloseTo(2.3488, 3);
  });
  it('the trip home can be skipped too', async () => {
    const home = await db.rpc(u, 'travel_home').catch(() => null);
    expect(home).toBeTruthy();
    const st = await db.rpc(u, 'travel_status');
    expect(st.trip && !st.trip.arrived && st.fast_ink >= 5).toBe(true);
    await db.rpc(u, 'travel_fast');
    const after = await db.rpc(u, 'travel_status');
    expect(after.away).toBe(false);
  });
});
