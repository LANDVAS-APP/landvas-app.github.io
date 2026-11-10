// v0.9.9 Out and about: vehicles for the joystick, finds on the map, travel groups — and nobody's GPS or home shows.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let lea: string, max: string, ned: string, ola: string;
const SLC = { lng: -111.891, lat: 40.7608 };
const PROVO = { lng: -111.658, lat: 40.2338 };
const O = { gx: 3_330_000, gy: 2_230_000 };
const ink = (u: string, n: number) => db.sql(`select private.ledger_apply($1, 'ink', $2, 'admin_adjust', 'test', 'test', $3)`, [u, n, `t:${u}:${n}:${Math.random()}`]);
const bal = async (u: string) => Number((await db.sql(`select coalesce(sum(delta), 0) b from resource_ledger where player_id = $1 and resource = 'ink'`, [u]))[0].b);
async function setup(u: string, at: { lng: number; lat: number }, n: number) {
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'report_position', { p_lng: at.lng, p_lat: at.lat, p_accuracy_m: 10 });
  await db.rpc(u, 'claim_starter_plot', { p_gx: O.gx + n * 40, p_gy: O.gy });
}
async function arrive(u: string) {
  await db.sql(`update travel_trips set arrives_at = now() - interval '1 second' where player_id = $1 and not arrived`, [u]);
  await db.sql(`update explorers set fixed_at = fixed_at - interval '3 hours' where player_id = $1`, [u]);
  return db.rpc(u, 'travel_status');
}

beforeAll(async () => {
  await db.init({ ungated: true });
  lea = await db.newPlayer('lea_lead'); max = await db.newPlayer('max_mate'); ned = await db.newPlayer('ned_new'); ola = await db.newPlayer('ola_out');
  await setup(lea, SLC, 0); await setup(max, PROVO, 1); await setup(ned, SLC, 2); await setup(ola, SLC, 3);
  const [g] = await db.rpc(lea, 'my_groups');
  await db.rpc(lea, 'set_group_kind', { p_group_id: g.id, p_kind: 'plane' });
});
afterAll(() => db.close());

describe('vehicles', () => {
  it('everyone can walk; a Bike costs Ink, and a Car needs a Bike first', async () => {
    const ex = await db.rpc(max, 'my_explorer');
    expect(ex.vehicle).toMatchObject({ current: 'walk', speed_kmh: 6, range_m: 600, fuel: false });
    expect(ex.vehicle.all.map((v: any) => [v.id, v.owned])).toEqual([['walk', true], ['bike', false], ['car', false]]);
    await expectError(db.rpc(max, 'vehicle_use', { p_kind: 'bike' }), 'vehicle_not_owned');
    await ink(max, 2000);
    await expectError(db.rpc(max, 'vehicle_buy', { p_kind: 'car' }), 'needs_bike_first');
    const before = await bal(max);
    const b = await db.rpc(max, 'vehicle_buy', { p_kind: 'bike' });
    expect(b.vehicle).toMatchObject({ current: 'bike', speed_kmh: 20, range_m: 2000 });
    expect(await bal(max)).toBe(before - 250);
    await expectError(db.rpc(max, 'vehicle_buy', { p_kind: 'bike' }), 'already_owned');
    const c = await db.rpc(max, 'vehicle_buy', { p_kind: 'car' });
    expect(c.vehicle).toMatchObject({ current: 'car', speed_kmh: 60, range_m: 6000, fuel: true });
    expect(await bal(max)).toBe(before - 1450);
  });

  it('a faster vehicle goes faster and further, but never further than its range from where you really are', async () => {
    await db.rpc(max, 'vehicle_use', { p_kind: 'bike' });
    await db.sql(`update explorers set joy_bucket_m = 10000, joy_at = now() - interval '1 hour' where player_id = $1`, [max]);
    const r = await db.rpc(max, 'joystick_step', { p_lng: PROVO.lng + 0.05, p_lat: PROVO.lat });
    // the burst bucket: 4 s at 20 km/h ≈ 22 m
    expect(r.moved_m).toBeGreaterThan(20);
    expect(r.moved_m).toBeLessThan(26);
    // way out past 2 km: the leash holds
    await db.sql(`update explorers set lng = $2, joy_bucket_m = 10000, joy_at = now() - interval '1 hour' where player_id = $1`, [max, PROVO.lng + 0.0235]);
    const far = await db.rpc(max, 'joystick_step', { p_lng: PROVO.lng + 0.03, p_lat: PROVO.lat });
    expect(far.leash).toBe(true);
  });
});

describe('finds on the map', () => {
  it('turn up around you every day, and you collect them by walking up to them', async () => {
    const at = await db.rpc(ned, 'my_explorer');
    const w = 0.02, finds = await db.rpc(ned, 'map_finds', { p_w: at.lng - w, p_s: at.lat - w, p_e: at.lng + w, p_n: at.lat + w });
    expect(finds.length).toBeGreaterThan(5);
    expect(new Set(finds.map((f: any) => f.kind)).size).toBeGreaterThan(1);
    expect(finds[0].ink).toBeUndefined();
    // the same finds for everyone today
    const same = await db.rpc(ola, 'map_finds', { p_w: at.lng - w, p_s: at.lat - w, p_e: at.lng + w, p_n: at.lat + w });
    expect(same.map((f: any) => f.id)).toEqual(finds.map((f: any) => f.id));
    // zoomed far out: nothing (too much map)
    expect(await db.rpc(ned, 'map_finds', { p_w: -120, p_s: 30, p_e: -100, p_n: 45 })).toEqual([]);
    const f = finds.reduce((a: any, b: any) => (Math.hypot(a.lng - at.lng, a.lat - at.lat) < Math.hypot(b.lng - at.lng, b.lat - at.lat) ? a : b));
    await db.sql(`update explorers set lng = $2, lat = $3 where player_id = $1`, [ned, f.lng + 0.01, f.lat]);
    await expectError(db.rpc(ned, 'map_find_claim', { p_id: f.id }), 'find_too_far');
    await db.sql(`update explorers set lng = $2, lat = $3 where player_id = $1`, [ned, f.lng + 0.0002, f.lat]);
    const before = await bal(ned);
    const got = await db.rpc(ned, 'map_find_claim', { p_id: f.id });
    expect(got.kind).toBe(f.kind);
    expect(got.ink).toBeGreaterThan(0);
    expect(await bal(ned)).toBe(before + got.ink);
    await expectError(db.rpc(ned, 'map_find_claim', { p_id: f.id }), 'already_found');
    const after = await db.rpc(ned, 'map_finds', { p_w: at.lng - w, p_s: at.lat - w, p_e: at.lng + w, p_n: at.lat + w });
    expect(after.some((x: any) => x.id === f.id)).toBe(false);
    // someone else can still collect it
    expect((await db.rpc(ola, 'map_finds', { p_w: at.lng - w, p_s: at.lat - w, p_e: at.lng + w, p_n: at.lat + w })).some((x: any) => x.id === f.id)).toBe(true);
    await expectError(db.rpc(ned, 'map_find_claim', { p_id: 'f1_2_3' }), 'find_gone');
  });
});

describe('travel groups', () => {
  let code: string;
  it('leading a group needs a Travel plot; others join with the code or an invite', async () => {
    await expectError(db.rpc(max, 'travel_group_create'), 'needs_travel_plot');
    const g = await db.rpc(lea, 'travel_group_create');
    expect(g.group).toMatchObject({ leader: true, max: 10 });
    code = g.group.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect((await db.rpc(max, 'travel_group_join', { p_code: code.toLowerCase() })).group.members).toHaveLength(2);
    await db.rpc(max, 'travel_group_invite', { p_username: 'ned_new' });
    const inv = await db.rpc(ned, 'travel_group');
    expect(inv.group).toBeNull();
    expect(inv.invites[0].by.username).toBe('max_mate');
    await db.rpc(ned, 'travel_group_accept', { p_group: inv.invites[0].group_id });
    expect((await db.rpc(ned, 'travel_group')).group.members.map((m: any) => m.username)).toEqual(['lea_lead', 'max_mate', 'ned_new']);
    await expectError(db.rpc(ned, 'travel_group_create'), 'already_in_group');
  });

  it('nobody’s GPS shows: members at home have no location at all', async () => {
    const g = (await db.rpc(lea, 'travel_group')).group;
    for (const m of g.members) {
      expect(m.away).toBe(false);
      expect(m.lng).toBeUndefined();
    }
  });

  it('holds at most 10', async () => {
    const extra: string[] = [];
    for (let i = 0; i < 7; i++) extra.push(await db.newPlayer(`grp_${i}`));
    for (const u of extra) await db.rpc(u, 'travel_group_join', { p_code: code });
    expect((await db.rpc(lea, 'travel_group')).group.members).toHaveLength(10);
    await expectError(db.rpc(ola, 'travel_group_join', { p_code: code }), 'group_full');
    for (const u of extra) await db.rpc(u, 'travel_group_leave');
  });

  it('when the leader sets off, the group rides too — each from the stop nearest them — and arrives together', async () => {
    const st = await db.rpc(lea, 'travel_depart', { p_mode: 'plane', p_to: 'ap:LHR' });
    expect(st.group.with.sort()).toEqual(['max_mate', 'ned_new']);
    const trips = await db.sql(`select player_id, from_stop, to_stop, arrives_at, with_leader from travel_trips where to_stop = 'ap:LHR' and not arrived`);
    expect(trips).toHaveLength(3);
    expect(new Set(trips.map((t: any) => new Date(t.arrives_at).getTime())).size).toBe(1);
    expect(trips.find((t: any) => t.player_id === max).with_leader).toBe(true);
    // riding along doesn't use up your own trips
    expect((await db.rpc(max, 'travel_status')).plane.left).toBe(2);
    // on the way: members see each other moving (not where they set off from)
    const g = (await db.rpc(max, 'travel_group')).group;
    const ned1 = g.members.find((m: any) => m.username === 'ned_new');
    expect(ned1).toMatchObject({ away: true, traveling: true });
    expect(ned1.trip).toMatchObject({ mode: 'plane', to: 'London Heathrow Airport' });
    expect(ned1.dest_lng).toBeCloseTo(-0.46, 1);
  });

  it('there together; a member heading home disappears from the map', async () => {
    for (const u of [lea, max, ned]) await arrive(u);
    const g = (await db.rpc(lea, 'travel_group')).group;
    for (const m of g.members) {
      expect(m.away).toBe(true);
      expect(m.traveling).toBe(false);
      expect(m.lat).toBeCloseTo(51.47, 1);
    }
    await db.rpc(ned, 'travel_home');
    const g2 = (await db.rpc(lea, 'travel_group')).group;
    const n2 = g2.members.find((m: any) => m.username === 'ned_new');
    expect(n2).toEqual(expect.objectContaining({ away: false }));
    expect(n2.lng).toBeUndefined();
  });

  it('the next leg leaves from where the group is, together', async () => {
    const st = await db.rpc(lea, 'travel_depart', { p_mode: 'plane', p_to: 'ap:CDG' });
    // ned went home and is still on the way there: they catch the next one
    expect(st.group.with).toEqual(['max_mate']);
    expect(st.group.left_behind).toEqual(['ned_new']);
    const mt = await db.sql(`select from_stop, from_home from travel_trips where player_id = $1 and to_stop = 'ap:CDG'`, [max]);
    expect(mt[0]).toMatchObject({ from_stop: 'ap:LHR', from_home: false });
  });

  it('the leader leaving hands the group on; the leader can ask someone to leave', async () => {
    await db.rpc(lea, 'travel_group_leave');
    const g = (await db.rpc(max, 'travel_group')).group;
    expect(g.leader).toBe(true);
    expect(g.members.map((m: any) => m.username)).toEqual(['max_mate', 'ned_new']);
    await db.rpc(max, 'travel_group_kick', { p_player: ned });
    expect((await db.rpc(ned, 'travel_group')).group).toBeNull();
    await expectError(db.rpc(ned, 'travel_group_kick', { p_player: max }), 'not_group_leader');
  });
});
