// The Hot Zone's crowd: players whose explorer stands in today's zone (now = active in the last 15 minutes),
// plus anyone who claimed a plot in the zone's city today. Counts only.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let a: string, b: string, c: string;
let zone: { gx: number; gy: number; radius: number; id: string };
const lngOf = (gx: number) => ((gx + 0.5) / 4194304) * 360 - 180;
const latOf = (gy: number) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / 4194304); return (180 / Math.PI) * Math.atan(Math.sinh(n)); };
const put = (u: string, gx: number, gy: number) => db.sql(`update explorers set lng = $2, lat = $3, fixed_at = now(), updated_at = now() where player_id = $1`, [u, lngOf(gx), latOf(gy)]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 1 });
  a = await db.newPlayer('cara_crowd'); b = await db.newPlayer('cole_crowd'); c = await db.newPlayer('cleo_crowd');
  zone = (await db.rpc(a, 'hot_zone_today')).today;
  for (const u of [a, b, c]) await db.rpc(u, 'report_position', { p_lng: -111.891, p_lat: 40.7608, p_accuracy_m: 10 });
});
afterAll(() => db.close());

describe('hot_zone_crowd', () => {
  it('nobody there: 0 now, 0 today', async () => {
    expect(await db.rpc(a, 'hot_zone_crowd')).toEqual({ now: 0, today: 0 });
  });
  it('counts explorers standing in the zone; only recently active ones count as "now"', async () => {
    await put(a, zone.gx, zone.gy);
    await put(b, zone.gx + Math.floor(zone.radius / 2), zone.gy);
    await put(c, zone.gx + zone.radius * 3, zone.gy); // outside
    await db.sql(`update players set last_active_at = now() - interval '2 hours' where id = $1`, [b]);
    await db.sql(`update players set last_active_at = now() where id = $1`, [a]);
    const r = await db.rpc(c, 'hot_zone_crowd');
    expect(r.now).toBe(1);
    expect(r.today).toBe(2);
  });
  it('a claim in the zone’s city today counts toward today', async () => {
    const [gx, gy] = [zone.gx + 7, zone.gy + 7];
    await db.sql(`insert into world_plots (gx, gy, plot_type, rarity) select $1, $2, (select id from plot_types order by id limit 1), 'common'
      on conflict (gx, gy) do nothing`, [gx, gy]);
    await db.sql(`update world_plots set owner_id = $1, claimed_at = now(), city_id = $4 where gx = $2 and gy = $3`, [c, gx, gy, Number(zone.id)]);
    const r = await db.rpc(a, 'hot_zone_crowd');
    expect(r.today).toBe(3);
  });
  it('suspended players are left out', async () => {
    await db.sql(`update players set status = 'suspended' where id = $1`, [b]);
    const r = await db.rpc(a, 'hot_zone_crowd');
    expect(r.today).toBe(2);
    await db.sql(`update players set status = 'active' where id = $1`, [b]);
  });
});
