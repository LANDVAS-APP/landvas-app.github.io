// Homes: your 3D home is your public face. Decorate it (free and bought furniture, wallpaper, floors, the view),
// choose who may use each door to your places, and share it live with up to 10 visitors.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const A = { gx: 52010, gy: 31010 };
let ow: string, fr: string, st: string;
const ink = async (u: string) => Number((await db.rpc(u, 'my_state')).balances.ink);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('home_owner'); fr = await db.newPlayer('home_friend'); st = await db.newPlayer('home_stranger');
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const g = (await db.rpc(ow, 'my_groups'))[0];
  await db.rpc(ow, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' });
  await db.rpc(ow, 'friend_request', { p_player_id: fr });
  await db.rpc(fr, 'friend_respond', { p_player_id: ow, p_accept: true });
});
afterAll(() => db.close());

describe('Homes', () => {
  it('everyone has a home, with a door to each of their places', async () => {
    const h = await db.rpc(ow, 'home_get', { p_username: 'home_owner' });
    expect(h).toMatchObject({ own: true, layout: [], style: {}, host: { username: 'home_owner' } });
    expect(h.doors.arcade).toMatchObject({ privacy: 'public', open: true, count: 1 });
    expect(h.doors.arcade.places[0]).toMatchObject({ level: 1 });
    expect(h.doors.farm).toMatchObject({ count: 0, places: [] });
    expect(h.careers).toMatchObject({ arcade: 1, plots: 1 });
    expect(h.catalog.items.sofa).toBeTruthy();
    expect(h.items).toEqual({});
    const v = await db.rpc(st, 'home_get', { p_username: 'HOME_OWNER' });
    expect(v.own).toBe(false); expect(v.items).toBeNull();
    expect(v.doors.arcade.places).toHaveLength(1);
    await expectError(db.rpc(st, 'home_get', { p_username: 'nobody_here' }), 'not_found');
  });

  it('decorating: free furniture, styles, and the name over the door', async () => {
    const layout = [{ i: 'sofa', x: 0, z: -2, r: 0 }, { i: 'rug_rect', x: 0, z: 0, r: 1 }, { i: 'wall_clock', x: 2, z: -5.9, r: 0 }, { i: 'wall_shelf', x: 6.9, z: 1, r: 0 }];
    const h = await db.rpc(ow, 'home_save', { p_name: 'Sunny Nook', p_style: { wall: 'floral', floor: 'marble', view: 'beach', mood: 'warm', wall_color: '#ffd1dc' }, p_layout: layout });
    expect(h.name).toBe('Sunny Nook');
    expect(h.style).toEqual({ wall: 'floral', floor: 'marble', view: 'beach', mood: 'warm', wall_color: '#FFD1DC' });
    expect(h.layout).toHaveLength(4);
    // bought furniture has to be bought first
    await expectError(db.rpc(ow, 'home_save', { p_name: null, p_style: {}, p_layout: [{ i: 'chandelier', x: 0, z: 0, r: 0 }] }), 'item_not_owned');
    // bad things are refused
    await expectError(db.rpc(ow, 'home_save', { p_name: null, p_style: {}, p_layout: [{ i: 'sofa', x: -6.5, z: 0, r: 0 }] }), 'invalid_layout'); // in front of the doors
    await expectError(db.rpc(ow, 'home_save', { p_name: null, p_style: {}, p_layout: [{ i: 'wall_clock', x: 0, z: 0, r: 0 }] }), 'invalid_layout'); // a clock in mid-air
    await expectError(db.rpc(ow, 'home_save', { p_name: null, p_style: {}, p_layout: [{ i: 'spaceship', x: 0, z: 0, r: 0 }] }), 'invalid_layout');
    await expectError(db.rpc(ow, 'home_save', { p_name: null, p_style: { wall: 'lava' }, p_layout: [] }), 'invalid_style');
    await expectError(db.rpc(ow, 'home_save', { p_name: null, p_style: { trim: 'red' }, p_layout: [] }), 'invalid_style');
    await expectError(db.rpc(ow, 'home_save', { p_name: null, p_style: {}, p_layout: Array.from({ length: 7 }, (_, i) => ({ i: 'cactus', x: i - 3, z: 2, r: 0 })) }), 'too_many_items');
  });

  it('buying furniture with Ink (and arcade tickets)', async () => {
    await expectError(db.rpc(ow, 'home_buy', { p_item: 'chandelier', p_idempotency_key: 'home-buy-0001' }), 'insufficient_funds');
    await db.giveInk(ow, 20);
    const before = await ink(ow);
    const r = await db.rpc(ow, 'home_buy', { p_item: 'chandelier', p_idempotency_key: 'home-buy-0002' });
    expect(r).toMatchObject({ item: 'chandelier', qty: 1 });
    expect(await ink(ow)).toBe(before - 8);
    // the same purchase again (a retry) isn't charged twice
    await db.rpc(ow, 'home_buy', { p_item: 'chandelier', p_idempotency_key: 'home-buy-0002' });
    expect(await ink(ow)).toBe(before - 8);
    await expectError(db.rpc(ow, 'home_buy', { p_item: 'sofa', p_idempotency_key: 'home-buy-0003' }), 'invalid_item');
    await expectError(db.rpc(ow, 'home_buy', { p_item: 'mini_arcade', p_idempotency_key: 'home-buy-0004' }), 'not_enough_tickets');
    await db.sql(`update arcade_players set tickets = 400 where player_id = $1`, [ow]);
    const t = await db.rpc(ow, 'home_buy', { p_item: 'mini_arcade', p_idempotency_key: 'home-buy-0005' });
    expect(t.tickets).toBe(100);
    const h = await db.rpc(ow, 'home_save', { p_name: 'Sunny Nook', p_style: {}, p_layout: [{ i: 'chandelier', x: 0, z: 0, r: 0 }, { i: 'mini_arcade', x: 3, z: -4, r: 2 }] });
    expect(h.items).toEqual({ chandelier: 1, mini_arcade: 1 });
    await expectError(db.rpc(ow, 'home_save', { p_name: null, p_style: {}, p_layout: [{ i: 'chandelier', x: 0, z: 0, r: 0 }, { i: 'chandelier', x: 1, z: 0, r: 0 }] }), 'item_not_owned');
  });

  it('doors: everyone, friends only, or nobody', async () => {
    await db.rpc(ow, 'home_doors', { p_doors: { arcade: 'friends' } });
    expect((await db.rpc(fr, 'home_get', { p_username: 'home_owner' })).doors.arcade).toMatchObject({ open: true, privacy: 'friends' });
    expect((await db.rpc(st, 'home_get', { p_username: 'home_owner' })).doors.arcade).toMatchObject({ open: false, places: [] });
    await db.rpc(ow, 'home_doors', { p_doors: { arcade: 'hidden' } });
    expect((await db.rpc(fr, 'home_get', { p_username: 'home_owner' })).doors.arcade.open).toBe(false);
    expect((await db.rpc(ow, 'home_get', { p_username: 'home_owner' })).doors.arcade).toMatchObject({ open: true, count: 1 });
    await expectError(db.rpc(ow, 'home_doors', { p_doors: { arcade: 'everyone!' } }), 'invalid_style');
    await db.rpc(ow, 'home_doors', { p_doors: { arcade: 'public' } });
  });

  it('live: visitors share the home in rooms of ten, the owner is always in the first', async () => {
    const o = await db.rpc(ow, 'home_live', { p_host: ow, p_x: 0, p_z: 4 });
    expect(o).toMatchObject({ shard: 0, room_size: 10, channel: `home:${ow}:0` });
    const f = await db.rpc(fr, 'home_live', { p_host: ow, p_x: 1, p_z: 3 });
    expect(f.shard).toBe(0);
    expect(f.members.map((m: any) => m.id)).toEqual([ow]);
    expect(f.in_home).toBe(2);
    await db.rpc(fr, 'home_leave', {});
    expect((await db.rpc(ow, 'home_live', { p_host: ow })).members).toEqual([]);
  });
});
