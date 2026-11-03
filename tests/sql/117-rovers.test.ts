// v0.38 Rovers: bought with Ink + dug materials, driven across a world, burning fuel by the km
// (the server works it out from where you went, never faster than the rover), refuelled with ice or Ink.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let rae: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const give = (uid: string, item: string, n: number) =>
  db.sql(`insert into planet_items (player_id, item, qty) values ($1, $2, $3) on conflict (player_id, item) do update set qty = planet_items.qty + $3`, [uid, item, n]);
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const ago = (uid: string, secs: number) => db.sql(`update planet_rovers set last_at = now() - make_interval(secs => $2) where player_id = $1`, [uid, secs]);
// a point on the unit sphere `m` metres along the surface from [0,0,1] on a world of radius r
const along = (m: number, r: number) => [Math.sin(m / r), 0, Math.cos(m / r)];

beforeAll(async () => {
  await db.init({ ungated: true });
  rae = await db.newPlayer('rae_rover');
  await db.giveInk(rae, 2000);
});
afterAll(() => db.close());

describe('Rovers', () => {
  it('cost Ink and materials you have dug', async () => {
    const s = await db.rpc(rae, 'rover_state');
    expect(s).toMatchObject({ owned: [], active: null, fuel: 0, driving: false });
    expect(s.config.models.map((m: any) => m.id)).toEqual(['buggy', 'crawler', 'hover']);
    await expectError(db.rpc(rae, 'rover_buy', { p_model: 'buggy' }), 'not_enough_materials');
    await expectError(db.rpc(rae, 'rover_buy', { p_model: 'tank' }), 'invalid_rover');
    await give(rae, 'iron', 25); await give(rae, 'copper', 10);
    const before = await ink(rae);
    const b = await db.rpc(rae, 'rover_buy', { p_model: 'buggy' });
    expect(b).toMatchObject({ bought: 'buggy', owned: ['buggy'], active: 'buggy', fuel: 30, tank: 120 });
    expect(b.items).toMatchObject({ iron: 5 });
    expect(b.items.copper).toBeUndefined();
    expect(await ink(rae)).toBe(before - 150);
  });

  it('only drive on the world you are on', async () => {
    await expectError(db.rpc(rae, 'rover_drive', { p_world: 'moon', p_on: true, p_d: [0, 0, 1] }), 'land_first');
    await putOn(rae, 'moon');
    const d = await db.rpc(rae, 'rover_drive', { p_world: 'moon', p_on: true, p_d: [0, 0, 1] });
    expect(d).toMatchObject({ driving: true, world: 'moon' });
  });

  it('burns fuel by the km, and no faster than the rover can go', async () => {
    const r = Number((await db.sql(`select private.planet_radius('moon') r`))[0].r);
    await ago(rae, 10);
    const t = await db.rpc(rae, 'rover_tick', { p_world: 'moon', p_d: along(200, r) });
    expect(t.moved_m).toBeCloseTo(200, 0);
    expect(t.burned).toBeCloseTo(2, 1); // 0.2 km x 10 per km
    expect(t.fuel).toBeCloseTo(28, 0);
    // a jump of 5 km in 2 s only counts as far as the buggy could go (22 m/s)
    await ago(rae, 2);
    const far = await db.rpc(rae, 'rover_tick', { p_world: 'moon', p_d: along(5200, r) });
    expect(far.moved_m).toBeLessThan(22 * 2 * 1.25 + 6);
    // ticks for another world are ignored
    expect((await db.rpc(rae, 'rover_tick', { p_world: 'mars', p_d: [1, 0, 0] })).driving).toBe(false);
  });

  it('runs dry and puts you back on foot', async () => {
    await db.sql(`update planet_rovers set fuel = 0.3 where player_id = $1`, [rae]);
    const r = Number((await db.sql(`select private.planet_radius('moon') r`))[0].r);
    await ago(rae, 10);
    const t = await db.rpc(rae, 'rover_tick', { p_world: 'moon', p_d: along(400, r) });
    expect(t).toMatchObject({ out_of_fuel: true, driving: false, fuel: 0 });
    await expectError(db.rpc(rae, 'rover_drive', { p_world: 'moon', p_on: true, p_d: [0, 0, 1] }), 'no_fuel');
  });

  it('refuels with ice or Ink, never past a full tank', async () => {
    await expectError(db.rpc(rae, 'rover_refuel', { p_ice: 2 }), 'not_enough_materials');
    await give(rae, 'ice', 50);
    const a = await db.rpc(rae, 'rover_refuel', { p_ice: 3 });
    expect(a).toMatchObject({ added: 30, fuel: 30 });
    expect(a.items.ice).toBe(47);
    const before = await ink(rae);
    const b = await db.rpc(rae, 'rover_refuel', { p_ink: 5 });
    expect(b).toMatchObject({ added: 20, fuel: 50 });
    expect(await ink(rae)).toBe(before - 5);
    // asking for far too much only takes what fits
    const c = await db.rpc(rae, 'rover_refuel', { p_ice: 40 });
    expect(c.fuel).toBe(120);
    expect(c.items.ice).toBe(40); // 7 bars of ice fill the last 70
  });

  it('getting out stops the meter', async () => {
    await db.rpc(rae, 'rover_drive', { p_world: 'moon', p_on: true, p_d: [0, 0, 1] });
    const off = await db.rpc(rae, 'rover_drive', { p_world: 'moon', p_on: false });
    expect(off.driving).toBe(false);
    const t = await db.rpc(rae, 'rover_tick', { p_world: 'moon', p_d: [1, 0, 0] });
    expect(t).toMatchObject({ driving: false, fuel: 120 });
  });
});
