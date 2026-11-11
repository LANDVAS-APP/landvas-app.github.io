// v1.2: the joystick steers from your last real location without a fresh GPS fix, the spot it reaches stays put,
// and Home puts the explorer back on that real location.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let jo: string;
beforeAll(async () => { await db.init({ ungated: true }); jo = await db.newPlayer('jo_joystick'); });
afterAll(() => db.close());

describe('the joystick spot', () => {
  it('steers with a GPS fix from hours ago', async () => {
    await db.rpc(jo, 'report_position', { p_lng: -104.99, p_lat: 39.74, p_accuracy_m: 10 });
    await db.sql(`update explorers set gps_at = now() - interval '6 hours', joy_at = now() - interval '1 minute' where player_id = $1`, [jo]);
    const r = await db.rpc(jo, 'joystick_step', { p_lng: -104.9895, p_lat: 39.7403 });
    expect(r.moved_m).toBeGreaterThan(1);
    expect(r.mode).toBe('manual');
  });
  it('stays put (the server keeps the spot) until Home', async () => {
    const ex = await db.rpc(jo, 'my_explorer');
    expect(ex.mode).toBe('manual');
    const h = await db.rpc(jo, 'explorer_home');
    expect(h.mode).toBe('gps');
    expect(h.lng).toBeCloseTo(-104.99, 4); expect(h.lat).toBeCloseTo(39.74, 4);
  });
});
