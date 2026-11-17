// 📡 Meet nearby: players out on GPS for real see each other as a name and a rough distance — only if both turned it on
// (saying they're 18 or over), only while both are on GPS with a fresh fix, never if either blocked the other, never a
// spot or a direction. Explorers out in the game near you show as explorers in the game, under the map's rules.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let me: string, ana: string, ben: string, cal: string, dee: string, far: string, joy: string;
const HERE = { lng: -0.1276, lat: 51.5072 };
const m = (metres: number) => metres / 111320; // (northward degrees)
const online = (u: string) => db.rpc(u, 'set_activity', { p_kind: 'map', p_detail: {} });
const gps = (u: string, north: number, minsAgo = 0) =>
  db.sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at) values ($1, 'gps', $2, $3, $2, $3, now() - make_interval(mins => $4))
          on conflict (player_id) do update set mode = 'gps', lng = excluded.lng, lat = excluded.lat, gps_lng = excluded.gps_lng, gps_lat = excluded.gps_lat,
            gps_at = excluded.gps_at, dest_lng = null, dest_lat = null, speed_mps = null, trip_id = null`, [u, HERE.lng, HERE.lat + m(north), minsAgo]);
const optIn = (u: string) => db.rpc(u, 'meet_set', { p_enabled: true, p_adult: true });
const near = async (u: string) => (await db.rpc(u, 'meet_nearby')).items as any[];
const names = async (u: string) => (await near(u)).map((p) => p.username).sort();

beforeAll(async () => {
  await db.init({ ungated: true });
  me = await db.newPlayer('meet_me'); ana = await db.newPlayer('meet_ana'); ben = await db.newPlayer('meet_ben');
  cal = await db.newPlayer('meet_cal'); dee = await db.newPlayer('meet_dee'); far = await db.newPlayer('meet_far'); joy = await db.newPlayer('meet_joy');
  for (const u of [me, ana, ben, cal, dee, far, joy]) await online(u);
  await gps(me, 0);
  await gps(ana, 100);    // right here
  await gps(ben, 900);    // nearby
  await gps(cal, 300);    // a short walk — but never turned it on
  await gps(dee, 200, 45); // their last fix was 45 minutes ago
  await gps(far, 30_000); // 30 km off
  for (const u of [me, ana, ben, dee, far]) await optIn(u);
});
afterAll(() => db.close());

describe('meet nearby', () => {
  it('is off until you turn it on — and turning it on means saying you are 18 or over', async () => {
    expect(await db.rpc(cal, 'meet_settings')).toMatchObject({ enabled: false, adult: false });
    expect((await db.rpc(cal, 'meet_nearby')).items).toEqual([]);
    await expect(db.rpc(cal, 'meet_set', { p_enabled: true })).rejects.toThrow(/adult_required/);
    expect(await db.rpc(me, 'meet_settings')).toMatchObject({ enabled: true, adult: true, on_gps: true });
  });

  it('shows players out on GPS near you who turned it on too — a name and a rough band, never a spot', async () => {
    expect(await names(me)).toEqual(['meet_ana', 'meet_ben']);
    const items = await near(me);
    expect(items[0]).toMatchObject({ username: 'meet_ana', how: 'gps', band: 'here' });
    expect(items[1]).toMatchObject({ username: 'meet_ben', how: 'gps', band: 'near' });
    for (const p of items) for (const k of ['lng', 'lat', 'gps_lng', 'gps_lat', 'distance', 'd', 'bearing', 'at']) expect(p).not.toHaveProperty(k);
  });

  it('only while you are on GPS yourself, with a fresh fix', async () => {
    await gps(me, 0, 30);
    expect(await db.rpc(me, 'meet_nearby')).toMatchObject({ on_gps: false, items: [] });
    await gps(me, 0);
    await db.sql(`update explorers set mode = 'manual' where player_id = $1`, [me]);
    expect((await near(me))).toEqual([]);
    await gps(me, 0);
  });

  it('turning it off hides you straight away (and you see no one)', async () => {
    await db.rpc(ana, 'meet_set', { p_enabled: false });
    expect(await names(me)).toEqual(['meet_ben']);
    expect(await near(ana)).toEqual([]);
    // (on again: no need to say it twice)
    await db.rpc(ana, 'meet_set', { p_enabled: true });
    expect(await names(me)).toEqual(['meet_ana', 'meet_ben']);
  });

  it('blocking works both ways', async () => {
    await db.rpc(ben, 'block_player', { p_player_id: me });
    expect(await names(me)).toEqual(['meet_ana']);
    expect(await names(ben)).not.toContain('meet_me');
    await db.rpc(ben, 'block_player', { p_player_id: me, p_on: false });
    expect(await names(me)).toEqual(['meet_ana', 'meet_ben']);
  });

  it('explorers out in the game near you show as explorers in the game (under the map’s rules: your party only)', async () => {
    // home far away, exploring here with the joystick
    await db.sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at) values ($1, 'manual', $2, $3, $4, $5, now() - interval '1 day')`,
      [joy, HERE.lng + 0.004, HERE.lat, HERE.lng + 3, HERE.lat + 2]);
    expect(await names(me)).not.toContain('meet_joy'); // (a stranger's explorer: never)
    const g0 = (await db.sql(`insert into travel_groups (leader_id, code) values ($1, 'MEETJY') returning id`, [me]))[0].id;
    for (const id of [me, joy]) await db.sql(`insert into travel_group_members (group_id, player_id) values ($1, $2)`, [g0, id]);
    const g = (await near(me)).find((p) => p.username === 'meet_joy');
    expect(g).toMatchObject({ how: 'game', band: 'walk' });
    // "Show my explorer on the map" off: not here either
    await db.rpc(joy, 'set_privacy', { p_patch: { on_map: false } });
    expect(await names(me)).not.toContain('meet_joy');
    await db.rpc(joy, 'set_privacy', { p_patch: { on_map: true } });
  });

  it('a wave: only to someone who could see you too, once every 10 minutes, and it lands in their notifications', async () => {
    expect(await db.rpc(me, 'meet_wave', { p_player: ana })).toMatchObject({ ok: true });
    expect(await db.rpc(me, 'meet_wave', { p_player: ana })).toMatchObject({ ok: true, again: true });
    const n = await db.sql(`select kind, actor_id, data from player_notifications where player_id = $1 and kind = 'meet_wave'`, [ana]);
    expect(n.length).toBe(1);
    expect(n[0]).toMatchObject({ actor_id: me, data: { band: 'here' } });
    expect((await near(ana)).find((p) => p.username === 'meet_me')).toMatchObject({ waved_me: true });
    await expect(db.rpc(me, 'meet_wave', { p_player: cal })).rejects.toThrow(/not_nearby/);
    await expect(db.rpc(me, 'meet_wave', { p_player: far })).rejects.toThrow(/not_nearby/);
  });
});
