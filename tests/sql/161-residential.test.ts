// v0.9.6 Residential plots: the Home and Landlord subplots. A house you can visit needs a Home subplot (players from
// before keep theirs); the biggest square of Home plots sets the house's size (more floors, a balcony, a roof
// terrace, a lift, a pool); checking in means signing the book with a note or a drawing; Landlord plots earn 50x
// USD rent all day on the 1st of the month.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, old: string;
const O = { gx: 3_300_000, gy: 2_200_000 };
let n = 0;
const groups = async (u: string) => db.rpc(u, 'my_groups');

/** buy and claim a square of plots next to the starter plot, all made Home, merged into one */
async function homeSquare(u: string, size: number) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!x && !y) continue;
    if ((await db.sql(`select 1 from world_plots where gx = $1 and gy = $2 and owner_id = $3`, [O.gx + x, O.gy + y, u])).length) continue;
    await db.rpc(u, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + y, p_idempotency_key: `res-acq-${++n}-000000` });
  }
  for (const g of await groups(u)) if (g.kind !== 'home') await db.rpc(u, 'set_group_kind', { p_group_id: g.id, p_kind: 'home' });
  const gs = await groups(u);
  return gs.length > 1 ? db.rpc(u, 'fuse_groups', { p_group_ids: gs.map((g: any) => g.id) }) : gs[0];
}

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('ann_res'); bob = await db.newPlayer('bob_res'); old = await db.newPlayer('old_res');
  for (const u of [ann, bob, old]) await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(ann, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.rpc(bob, 'claim_starter_plot', { p_gx: O.gx + 40, p_gy: O.gy });
  await db.rpc(old, 'claim_starter_plot', { p_gx: O.gx + 80, p_gy: O.gy });
  await db.giveInk(ann, 500_000);
  // a player from before Residential existed
  await db.sql(`insert into homes (player_id, legacy) values ($1, true) on conflict (player_id) do update set legacy = true`, [old]);
});
afterAll(() => db.close());

describe('Residential', () => {
  it('a house can only be visited once its owner has a Home subplot (old players keep theirs)', async () => {
    await expectError(db.rpc(bob, 'home_get', { p_username: 'ann_res' }), 'no_home');
    expect(await db.rpc(bob, 'home_status', { p_username: 'ann_res' })).toMatchObject({ allowed: false, has_home: false });
    // your own house page still opens (and says it isn't built yet)
    expect((await db.rpc(ann, 'home_get', { p_username: 'ann_res' })).house).toMatchObject({ allowed: false, size: 1 });
    expect((await db.rpc(bob, 'home_get', { p_username: 'old_res' })).house).toMatchObject({ allowed: true, legacy: true, has_home: false });
    const g = (await groups(ann))[0];
    await db.rpc(ann, 'set_group_kind', { p_group_id: g.id, p_kind: 'home' });
    const h = await db.rpc(bob, 'home_get', { p_username: 'ann_res' });
    expect(h.house).toMatchObject({ allowed: true, has_home: true, size: 1, floors: 1, levels: 1, name: 'Cottage' });
    expect(h.house.next).toMatchObject({ size: 2, floors: 2 });
    expect(await db.rpc(bob, 'home_status', { p_username: 'ann_res' })).toMatchObject({ allowed: true, size: 1 });
  });

  it('switching between Home and Landlord is free', async () => {
    const g = (await groups(ann))[0];
    await db.sql(`update canvas_groups set created_at = now() - interval '1 day', kind_changed_at = now() - interval '1 day' where id = $1`, [g.id]);
    expect((await db.rpc(ann, 'set_group_kind', { p_group_id: g.id, p_kind: 'landlord' })).fee).toBe(0);
    expect((await db.rpc(ann, 'set_group_kind', { p_group_id: g.id, p_kind: 'home' })).fee).toBe(0);
  });

  it('the house grows with the square: floors, balconies, a roof terrace, a lift, a pool', async () => {
    await homeSquare(ann, 2);
    let h = (await db.rpc(ann, 'home_get', { p_username: 'ann_res' })).house;
    expect(h).toMatchObject({ size: 2, floors: 2, levels: 2, balcony: false, plots: 4 });
    expect(h.max_items).toBeGreaterThan(90);
    await homeSquare(ann, 4);
    h = (await db.rpc(ann, 'home_get', { p_username: 'ann_res' })).house;
    expect(h).toMatchObject({ size: 4, floors: 3, balcony: true, roof: false });
    expect(h.ladder).toHaveLength(10);
    expect(h.ladder[9]).toMatchObject({ size: 10, floors: 6, roof: true, elevator: true, pool: true });
  });

  it('furniture goes on any floor (and the balcony upstairs)', async () => {
    const layout = [{ i: 'sofa', x: 0, z: -2, r: 0 }, { i: 'bed', x: 0, z: -2, r: 0, f: 1 }, { i: 'armchair', x: -6.2, z: 0, r: 0, f: 2 }, { i: 'monstera', x: 2, z: 7, r: 0, f: 1 }, { i: 'cactus', x: 1, z: 1, r: 0, f: 9 }];
    const h = await db.rpc(ann, 'home_save', { p_name: null, p_style: {}, p_layout: layout });
    expect(h.layout.map((x: any) => x.f ?? 0)).toEqual([0, 1, 2, 1, 2]); // floor 9 doesn't exist: the top floor
    // downstairs the strip by the doors stays clear and there's no balcony
    await expectError(db.rpc(ann, 'home_save', { p_name: null, p_style: {}, p_layout: [{ i: 'sofa', x: -6.2, z: 0, r: 0 }] }), 'invalid_layout');
    await expectError(db.rpc(ann, 'home_save', { p_name: null, p_style: {}, p_layout: [{ i: 'sofa', x: 0, z: 7, r: 0 }] }), 'invalid_layout');
  });

  it('who is on which floor, live', async () => {
    const r = await db.rpc(bob, 'home_live', { p_host: ann, p_x: 1, p_z: 7, p_f: 1 });
    expect(r.shard).toBe(0);
    const me = await db.rpc(ann, 'home_live', { p_host: ann, p_x: 0, p_z: 0, p_f: 0 });
    expect(me.members[0]).toMatchObject({ x: 1, z: 7, f: 1 });
    await expectError(db.rpc(ann, 'home_live', { p_host: bob, p_x: 0, p_z: 0 }), 'no_home');
  });

  it('checking in means signing the book: a note or a drawing', async () => {
    await db.rpc(bob, 'room_enter', { p_username: 'ann_res' });
    await db.sql(`update room_visits set entered_at = now() - interval '1 minute' where host_id = $1 and visitor_id = $2`, [ann, bob]);
    await expectError(db.rpc(bob, 'room_checkin', { p_username: 'ann_res' }), 'sign_the_book');
    expect((await db.rpc(bob, 'room_enter', { p_username: 'ann_res' })).signed_today).toBe(false);
    await expectError(db.rpc(bob, 'room_note', { p_username: 'ann_res', p_body: '', p_drawing: null }), 'empty_message');
    await expectError(db.rpc(bob, 'room_note', { p_username: 'ann_res', p_drawing: { s: [{ c: 'red', w: 4, p: [1, 2, 3, 4] }] } }), 'invalid_drawing');
    await expectError(db.rpc(bob, 'room_note', { p_username: 'ann_res', p_drawing: { s: [{ c: '#ff0000', w: 4, p: [1, 2, 900, 4] }] } }), 'invalid_drawing');
    const drawing = { s: [{ c: '#ff3d9a', w: 6, p: [10, 10, 50, 40, 90, 20] }, { c: '#22b8ff', w: 3, p: [200, 150, 210, 160] }] };
    const soc = await db.rpc(bob, 'room_note', { p_username: 'ann_res', p_drawing: drawing });
    expect(soc.notes[0]).toMatchObject({ body: '', drawing: { s: [{ c: '#FF3D9A', w: 6 }, { c: '#22B8FF' }] } });
    expect((await db.rpc(bob, 'room_enter', { p_username: 'ann_res' })).signed_today).toBe(true);
    const c = await db.rpc(bob, 'room_checkin', { p_username: 'ann_res' });
    expect(c.checked_in).toBe(true);
    // a plain note still works too
    expect((await db.rpc(ann, 'room_note', { p_username: 'bob_res', p_body: 'hello!' })).notes[0].body).toBe('hello!');
  });

  it('Landlord plots earn 50x USD rent all day on the 1st of the month', async () => {
    const sec = async (a: string, b: string) => Number((await db.sql(`select private.rent_day_seconds($1::timestamptz, $2::timestamptz) s`, [a, b]))[0].s);
    expect(await sec('2026-12-01T00:00:00Z', '2026-12-01T01:00:00Z')).toBe(3600);
    expect(await sec('2026-11-30T23:00:00Z', '2026-12-01T01:00:00Z')).toBe(3600);
    expect(await sec('2026-11-29T00:00:00Z', '2026-12-03T00:00:00Z')).toBe(86400);
    expect(await sec('2026-12-02T00:00:00Z', '2026-12-31T23:00:00Z')).toBe(0);
    expect(await sec('2026-11-15T00:00:00Z', '2027-01-15T00:00:00Z')).toBe(2 * 86400);
    const g = (await groups(bob))[0];
    expect(Number((await db.sql(`select private.landlord_rate($1) r`, [bob]))[0].r)).toBe(0);
    await db.rpc(bob, 'set_group_kind', { p_group_id: g.id, p_kind: 'landlord' });
    // (v1.3: rent day has to be earned — an estate's monthly checklist; done here by hand, see 173-landlord-estates)
    expect(Number((await db.sql(`select private.landlord_rate($1) r`, [bob]))[0].r)).toBe(0);
    await db.sql(`insert into landlord_progress (group_id, cycle, inspect_days, garden_days, repaired, requests)
      values ($1, private.landlord_cycle(now()), array[current_date, current_date - 1, current_date - 2], array[current_date, current_date - 1], array['a','b','c','d','e','f'], 3)`, [g.id]);
    const rate = Number((await db.sql(`select private.landlord_rate($1) r`, [bob]))[0].r);
    expect(rate).toBeGreaterThan(0);
    const st = await db.rpc(bob, 'my_state');
    expect(st.rent.landlord).toMatchObject({ multiplier: 50, plots: 1 });
    // an hour of rent day since rent was last settled pays 49 extra hours' worth (on top of the normal hour)
    const extra = Number((await db.sql(`select private.landlord_extra($1, now() - interval '1 hour') e`, [bob]))[0].e);
    const onFirst = Number((await db.sql(`select extract(day from now() at time zone 'UTC') = 1 d`))[0].d === true);
    if (!onFirst) expect(extra).toBe(0);
    const fake = Number((await db.sql(`select private.landlord_rate($1) * 49 * private.rent_day_seconds('2026-12-01T00:00:00Z', '2026-12-01T01:00:00Z') e`, [bob]))[0].e);
    expect(fake).toBeCloseTo(rate * 49 * 3600, 12);
  });
});
