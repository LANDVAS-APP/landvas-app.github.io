// The Jetpack: the fastest joystick ride, after the Car.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let u: string;
const SLC = { lng: -111.891, lat: 40.7608 };
const ink = (n: number) => db.sql(`select private.ledger_apply($1, 'ink', $2, 'admin_adjust', 'test', 'test', $3)`, [u, n, `t:jet:${Math.random()}`]);

beforeAll(async () => {
  await db.init({ ungated: true });
  u = await db.newPlayer('jet_jo');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  await db.rpc(u, 'claim_starter_plot', { p_gx: 3_330_000, p_gy: 2_230_000 });
});
afterAll(() => db.close());

describe('the Jetpack', () => {
  it('needs a Car first, costs 4000 Ink, and flies at 150 km/h', async () => {
    await ink(8000);
    await expectError(db.rpc(u, 'vehicle_buy', { p_kind: 'jet' }), 'needs_car_first');
    await db.rpc(u, 'vehicle_buy', { p_kind: 'bike' });
    await db.rpc(u, 'vehicle_buy', { p_kind: 'car' });
    const j = await db.rpc(u, 'vehicle_buy', { p_kind: 'jet' });
    expect(j.cost).toBe(4000);
    expect(j.vehicle).toMatchObject({ current: 'jet', speed_kmh: 150, range_m: 15000, fuel: true });
    expect(j.vehicle.all.map((v: any) => v.id)).toEqual(['walk', 'bike', 'car', 'jet']);
    await db.sql(`update explorers set joy_bucket_m = 100000, joy_at = now() - interval '1 hour' where player_id = $1`, [u]);
    const r = await db.rpc(u, 'joystick_step', { p_lng: SLC.lng + 0.05, p_lat: SLC.lat });
    // the burst: 4 s at 150 km/h ≈ 167 m
    expect(r.moved_m).toBeGreaterThan(150);
    expect(r.moved_m).toBeLessThan(200);
    await db.rpc(u, 'vehicle_use', { p_kind: 'walk' });
    const back = await db.rpc(u, 'vehicle_use', { p_kind: 'jet' });
    expect(back.vehicle.current).toBe('jet');
  });
});
