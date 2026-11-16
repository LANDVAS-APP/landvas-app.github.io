// Players on the map: only explorers out in the game without GPS (a trip, or the joystick far from home) show or can be
// found — never anyone on GPS, never near their real spot, never heading home, never offline, never if they hid.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let me: string, gps: string, joyNear: string, joyFar: string, away: string, riding: string, homeward: string;
// home is around London; trips go to Paris
const HOME = { lng: -0.1276, lat: 51.5072 };
const PARIS = { lng: 2.3522, lat: 48.8566 };
const WORLD = { p_west: -180, p_south: -85, p_east: 180, p_north: 85 };
const online = (u: string) => db.rpc(u, 'set_activity', { p_kind: 'map', p_detail: {} });
const place = (u: string, mode: string, lng: number, lat: number, extra = '') =>
  db.sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at) values ($1, $2, $3, $4, $5, $6, now())
          on conflict (player_id) do update set mode = excluded.mode, lng = excluded.lng, lat = excluded.lat, gps_lng = excluded.gps_lng,
            gps_lat = excluded.gps_lat, gps_at = excluded.gps_at, dest_lng = null, dest_lat = null, speed_mps = null, trip_id = null ${extra}`,
    [u, mode, lng, lat, HOME.lng, HOME.lat]);
const trip = async (u: string, mode: 'train' | 'plane' | 'home', to: string | null) =>
  (await db.sql(`insert into travel_trips (player_id, mode, to_stop, arrives_at) values ($1, $2, $3, now() + interval '1 hour') returning id`, [u, mode, to]))[0].id;
const names = async (u: string, box = WORLD) => (await db.rpc(u, 'map_explorers', box)).items.map((p: any) => p.username).sort();

beforeAll(async () => {
  await db.init({ ungated: true });
  me = await db.newPlayer('map_me');
  gps = await db.newPlayer('map_gps'); joyNear = await db.newPlayer('map_joynear'); joyFar = await db.newPlayer('map_joyfar');
  away = await db.newPlayer('map_away'); riding = await db.newPlayer('map_riding'); homeward = await db.newPlayer('map_homeward');
  for (const u of [me, gps, joyNear, joyFar, away, riding, homeward]) await online(u);
  await place(me, 'travel', PARIS.lng, PARIS.lat);
  await place(gps, 'gps', HOME.lng + 0.3, HOME.lat);                 // ~20 km out, but on GPS
  await place(joyNear, 'manual', HOME.lng + 0.02, HOME.lat);         // ~1.4 km from their real spot
  await place(joyFar, 'manual', HOME.lng + 0.08, HOME.lat);          // ~5.5 km from their real spot
  await place(away, 'travel', PARIS.lng, PARIS.lat);                 // staying in Paris
  await db.sql(`update explorers set trip_id = $2, home_lng = $3, home_lat = $4 where player_id = $1`, [away, await trip(away, 'train', null), HOME.lng, HOME.lat]);
  // mid-ride from home towards Paris, already well clear of home
  await place(riding, 'travel', HOME.lng + 0.5, HOME.lat - 0.4);
  await db.sql(`update explorers set trip_id = $2, home_lng = $3, home_lat = $4, dest_lng = $5, dest_lat = $6, speed_mps = 50, fixed_at = now()
                 where player_id = $1`, [riding, await trip(riding, 'train', null), HOME.lng, HOME.lat, PARIS.lng, PARIS.lat]);
  await place(homeward, 'travel', 1.0, 50.0);
  await db.sql(`update explorers set trip_id = $2 where player_id = $1`, [homeward, await trip(homeward, 'home', null)]);
});
afterAll(() => db.close());

describe('who shows on the map', () => {
  it('only explorers out in the game, away from home — never GPS, never near home, never heading home', async () => {
    expect(await names(me)).toEqual(['map_away', 'map_joyfar', 'map_riding']);
  });

  it('never yourself', async () => {
    expect(await names(away)).not.toContain('map_away');
  });

  it('nothing that points back home: where it is now and where this leg heads, no start point or start time', async () => {
    const items = (await db.rpc(me, 'map_explorers', WORLD)).items;
    const r = items.find((p: any) => p.username === 'map_riding');
    expect(r).toMatchObject({ how: 'travel', traveling: true, dest_lng: PARIS.lng, dest_lat: PARIS.lat });
    expect(r.arrives_at).toBeTruthy();
    for (const k of ['origin_lng', 'origin_lat', 'fixed_at', 'gps_lng', 'home_lng', 'speed_mps']) expect(r).not.toHaveProperty(k);
    expect(Math.abs(r.lng - HOME.lng)).toBeGreaterThan(0.1);
    expect(items.find((p: any) => p.username === 'map_joyfar')).toMatchObject({ how: 'joystick', traveling: false });
    expect(items.find((p: any) => p.username === 'map_away')).toMatchObject({ how: 'travel', joinable: true });
  });

  it('only the ones in view', async () => {
    expect(await names(me, { p_west: 2, p_south: 48, p_east: 3, p_north: 49 })).toEqual(['map_away']);
  });

  it('going back to GPS hides you straight away', async () => {
    await place(joyFar, 'gps', HOME.lng, HOME.lat);
    expect(await names(me)).not.toContain('map_joyfar');
    await place(joyFar, 'manual', HOME.lng + 0.08, HOME.lat);
  });

  it('offline, or "Show my explorer on the map" off: hidden', async () => {
    await db.sql(`update player_activity set at = now() - interval '1 hour' where player_id = $1`, [away]);
    expect(await names(me)).not.toContain('map_away');
    await online(away);
    await db.rpc(away, 'set_privacy', { p_patch: { on_map: false } });
    expect(await names(me)).not.toContain('map_away');
    expect(await db.rpc(me, 'find_explorer', { p_player: away })).toBeNull();
    await db.rpc(away, 'set_privacy', { p_patch: { on_map: true } });
    expect(await names(me)).toContain('map_away');
  });

  it('blocking works both ways', async () => {
    await db.rpc(away, 'block_player', { p_player_id: me });
    expect(await names(me)).not.toContain('map_away');
    await db.rpc(away, 'block_player', { p_player_id: me, p_on: false });
  });
});

describe('find someone', () => {
  it('finds them when they’re out in the game; not on GPS or near home', async () => {
    expect(await db.rpc(me, 'find_explorer', { p_player: away })).toMatchObject({ how: 'travel', lng: PARIS.lng, lat: PARIS.lat });
    expect(await db.rpc(me, 'find_explorer', { p_player: gps })).toBeNull();
    expect(await db.rpc(me, 'find_explorer', { p_player: joyNear })).toBeNull();
    expect(await db.rpc(me, 'find_explorer', { p_player: homeward })).toBeNull();
  });

  it('the lobbies say who can be found', async () => {
    const l = await db.rpc(me, 'party_lobbies', {});
    const by = (n: string) => l.players.find((p: any) => p.username === n);
    expect(by('map_away').findable).toBe(true);
    expect(by('map_gps').findable).toBe(false);
  });
});
