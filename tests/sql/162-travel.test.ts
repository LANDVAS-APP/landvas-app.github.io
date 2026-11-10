// v0.9.7 Travel plots: a Train or Plane subplot lets your explorer ride to a real station or airport, stop at the real
// stations on the way, arrive and really be there (claim, play), collect a stamp per stop, and head home again.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string;
const SLC = { lng: -111.891, lat: 40.7608 }; // downtown Salt Lake City
const O = { gx: 3_310_000, gy: 2_210_000 };

/** fast-forward the trip the player is on to its arrival */
async function arrive(u: string) {
  await db.sql(`update travel_trips set arrives_at = now() - interval '1 second' where player_id = $1 and not arrived`, [u]);
  await db.sql(`update explorers set fixed_at = fixed_at - interval '1 hour' where player_id = $1`, [u]);
}

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('ann_trv'); bob = await db.newPlayer('bob_trv');
  for (const u of [ann, bob]) {
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
    await db.rpc(u, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  }
  await db.rpc(ann, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.rpc(bob, 'claim_starter_plot', { p_gx: O.gx + 40, p_gy: O.gy });
});
afterAll(() => db.close());

describe('Travel', () => {
  it('stations and airports are searchable by name, code, or a place on the map', async () => {
    const byName = await db.rpc(ann, 'travel_search', { p_mode: 'train', p_q: 'denver' });
    expect(byName[0]).toMatchObject({ id: 'us:DEN', kind: 'station' });
    const byCode = await db.rpc(ann, 'travel_search', { p_mode: 'plane', p_q: 'lhr' });
    expect(byCode[0]).toMatchObject({ id: 'ap:LHR', kind: 'airport', country: 'GB' });
    const near = await db.rpc(ann, 'travel_search', { p_mode: 'train', p_lng: -0.124, p_lat: 51.53 });
    expect(near.map((s: any) => s.id)).toContain('uk:KGX');
    await expectError(db.rpc(ann, 'travel_search', { p_mode: 'boat', p_q: 'x' }), 'invalid_mode');
  });

  it('needs a Train plot to ride a train; switching Train and Plane is free', async () => {
    await expectError(db.rpc(ann, 'travel_depart', { p_mode: 'train', p_to: 'us:DEN' }), 'needs_train_plot');
    const [g] = await db.rpc(ann, 'my_groups');
    await db.rpc(ann, 'set_group_kind', { p_group_id: g.id, p_kind: 'train' });
    await db.sql(`update canvas_groups set created_at = now() - interval '2 days', kind_changed_at = now() - interval '2 days' where id = $1`, [g.id]);
    const before = (await db.sql(`select balance from player_balances where player_id = $1 and resource = 'ink'`, [ann]).catch(() => []))[0];
    await db.rpc(ann, 'set_group_kind', { p_group_id: g.id, p_kind: 'plane' });
    await db.rpc(ann, 'set_group_kind', { p_group_id: g.id, p_kind: 'train' });
    const after = (await db.sql(`select balance from player_balances where player_id = $1 and resource = 'ink'`, [ann]).catch(() => []))[0];
    expect(after).toEqual(before);
    const st = await db.rpc(ann, 'travel_status');
    expect(st.train).toMatchObject({ plots: 1, left: 4 });
    expect(st.plane.plots).toBe(0);
  });

  it('a plan boards at the nearest station on the same network and stops at real stations on the way', async () => {
    const p = await db.rpc(ann, 'travel_plan', { p_mode: 'train', p_to: 'us:PRO' });
    expect(p.from.id).toBe('us:SLC');
    expect(p.to.id).toBe('us:PRO');
    expect(p.km).toBeGreaterThan(55);
    expect(p.seconds).toBeGreaterThan(20);
    await expectError(db.rpc(ann, 'travel_plan', { p_mode: 'train', p_to: 'uk:KGX' }), 'no_station_near');
    await expectError(db.rpc(ann, 'travel_plan', { p_mode: 'train', p_to: 'us:SLC' }), 'already_here');
  });

  it('riding: GPS is ignored while away; arriving gives a stamp and Ink; you are really there', async () => {
    const st = await db.rpc(ann, 'travel_depart', { p_mode: 'train', p_to: 'us:DEN' });
    expect(st.away).toBe(true);
    expect(st.trip).toMatchObject({ mode: 'train', arrived: false });
    expect(st.trip.from.id).toBe('us:SLC');
    expect(st.trip.to.id).toBe('us:DEN');
    expect(st.explorer.traveling).toBe(true);
    expect(st.explorer.trip.id).toBe(st.trip.id);
    // trains go station to station: the explorer heads for the first real station on the way
    expect(st.trip.stops.length).toBeGreaterThan(1);
    expect(st.trip.km).toBeGreaterThan(596);
    expect(st.explorer.dest.lng).toBeCloseTo(st.trip.stops[0].lng, 5);
    expect(st.trip.stops.map((s: any) => s.t)).toEqual([...st.trip.stops.map((s: any) => s.t)].sort((a, b) => a - b));
    // past the first station: on to the next leg, still on time
    const first = await db.sql(`select extract(epoch from arrives_at - departs_at) secs from travel_trips where id = $1`, [st.trip.id]);
    await db.sql(`update explorers set fixed_at = fixed_at - make_interval(secs => $2::float8 * $3::float8) where player_id = $1`, [ann, first[0].secs, st.trip.stops[0].t + 0.001]);
    const mid = await db.rpc(ann, 'travel_status');
    expect(mid.trip.leg).toBe(1);
    expect(mid.explorer.traveling).toBe(true);
    expect(mid.explorer.dest.lng).toBeCloseTo(st.trip.stops[1].lng, 5);
    await expectError(db.rpc(ann, 'travel_depart', { p_mode: 'train', p_to: 'us:PRO' }), 'on_the_way');
    const gps = await db.rpc(ann, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
    expect(gps).toMatchObject({ accepted: false, away: true });

    await arrive(ann);
    const there = await db.rpc(ann, 'travel_status');
    expect(there.arrival).toMatchObject({ new_stamp: true, new_country: true, mode: 'train' });
    expect(there.arrival.stop.id).toBe('us:DEN');
    expect(there.arrival.ink).toBe(12);
    expect(there.explorer.traveling).toBe(false);
    expect(there.explorer.lng).toBeCloseTo(-104.99961, 4);
    expect(there.stamps).toBe(1);
    expect(there.countries).toBe(1);
    expect(there.train.left).toBe(3);
    // GPS still can't pull you back while you're there
    expect((await db.rpc(ann, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 })).away).toBe(true);
    expect((await db.rpc(ann, 'my_explorer')).lng).toBeCloseTo(-104.99961, 4);
  });

  it('the stop gets a building on the map and shows who has been; the passport lists it', async () => {
    const b = await db.rpc(bob, 'travel_buildings', { p_w: -106, p_s: 39, p_e: -104, p_n: 40.5 });
    expect(b.map((x: any) => x.id)).toContain('us:DEN');
    const s = await db.rpc(bob, 'travel_stop', { p_id: 'us:DEN' });
    expect(s.visitors).toBe(1);
    expect(s.mine).toBeNull();
    const pp = await db.rpc(ann, 'travel_passport');
    expect(pp).toHaveLength(1);
    expect(pp[0]).toMatchObject({ id: 'us:DEN', visits: 1 });
  });

  it('heading home hands the explorer back to GPS where you set off', async () => {
    await expectError(db.rpc(bob, 'travel_home'), 'not_away');
    const st = await db.rpc(ann, 'travel_home');
    expect(st.trip.mode).toBe('home');
    expect(st.explorer.traveling).toBe(true);
    await arrive(ann);
    const back = await db.rpc(ann, 'travel_status');
    expect(back.arrival).toMatchObject({ home: true });
    expect(back.away).toBe(false);
    expect(back.explorer.mode).toBe('gps');
    expect(back.explorer.lng).toBeCloseTo(SLC.lng, 4);
    expect(back.trip).toBeNull();
    const gps = await db.rpc(ann, 'report_position', { p_lng: SLC.lng + 0.001, p_lat: SLC.lat, p_accuracy_m: 10 });
    expect(gps.accepted).toBe(true);
  });

  it('a second visit is not a new stamp; trips run out for the day', async () => {
    await db.rpc(ann, 'travel_depart', { p_mode: 'train', p_to: 'us:DEN' });
    await arrive(ann);
    const st = await db.rpc(ann, 'travel_status');
    expect(st.arrival).toMatchObject({ new_stamp: false, ink: 0 });
    expect((await db.rpc(ann, 'travel_passport'))[0].visits).toBe(2);
    await db.sql(`insert into travel_trips (player_id, mode, arrives_at, arrived) select $1, 'train', now(), true from generate_series(1, 5)`, [ann]);
    await expectError(db.rpc(ann, 'travel_depart', { p_mode: 'train', p_to: 'us:PRO' }), 'no_trips_left');
  });

  it('planes fly anywhere in the world', async () => {
    const [g] = await db.rpc(bob, 'my_groups');
    await db.rpc(bob, 'set_group_kind', { p_group_id: g.id, p_kind: 'plane' });
    const p = await db.rpc(bob, 'travel_plan', { p_mode: 'plane', p_to: 'ap:LHR' });
    expect(p.from.id).toBe('ap:SLC');
    expect(p.km).toBeGreaterThan(7000);
    expect(p.stops).toEqual([]);
    expect(p.seconds).toBeLessThanOrEqual(360);
    await db.rpc(bob, 'travel_depart', { p_mode: 'plane', p_to: 'ap:LHR' });
    await arrive(bob);
    const st = await db.rpc(bob, 'travel_status');
    expect(st.arrival.stop.id).toBe('ap:LHR');
    expect(st.explorer.lat).toBeCloseTo(51.47075, 3);
  });
});
