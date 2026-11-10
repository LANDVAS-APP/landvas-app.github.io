// v0.9.8 Travellers: other players' rides and flights, with their usernames — and what stays private.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, cat: string;
const SLC = { lng: -111.891, lat: 40.7608 };
const O = { gx: 3_320_000, gy: 2_220_000 };

async function make(u: string, n: number, kind: 'train' | 'plane') {
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  await db.rpc(u, 'claim_starter_plot', { p_gx: O.gx + n * 40, p_gy: O.gy });
  const [g] = await db.rpc(u, 'my_groups');
  await db.rpc(u, 'set_group_kind', { p_group_id: g.id, p_kind: kind });
}

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('ann_fly'); bob = await db.newPlayer('bob_rail'); cat = await db.newPlayer('cat_watch');
  await make(ann, 0, 'plane'); await make(bob, 1, 'train'); await make(cat, 2, 'plane');
});
afterAll(() => db.close());

describe('Travellers', () => {
  it('shows other players’ flights with their usernames and routes', async () => {
    await db.rpc(ann, 'travel_depart', { p_mode: 'plane', p_to: 'ap:LHR' });
    const t = await db.rpc(cat, 'travel_traffic');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ username: 'ann_fly', mode: 'plane', arrived: false });
    expect(t[0].from.id).toBe('ap:SLC');
    expect(t[0].to.id).toBe('ap:LHR');
    expect(new Date(t[0].arrives_at).getTime()).toBeGreaterThan(Date.now() - 5000);
    // not your own
    expect(await db.rpc(ann, 'travel_traffic')).toHaveLength(0);
  });

  it('a train from home starts at its first stop on the way: the home station stays private', async () => {
    await db.rpc(bob, 'travel_depart', { p_mode: 'train', p_to: 'us:DEN' });
    const t = (await db.rpc(cat, 'travel_traffic')).find((x: any) => x.username === 'bob_rail');
    expect(t.from).toBeNull();
    expect(t.stops.length).toBeGreaterThan(0);
    expect(JSON.stringify(t)).not.toContain('us:SLC');
    expect(new Date(t.starts_at).getTime()).toBeGreaterThan(Date.now() - 2000);
  });

  it('an arrival noticed by a GPS report still brings the welcome card next time', async () => {
    await db.sql(`update travel_trips set arrives_at = now() - interval '1 second' where player_id = $1 and not arrived`, [ann]);
    await db.sql(`update explorers set fixed_at = fixed_at - interval '2 hours' where player_id = $1`, [ann]);
    expect((await db.rpc(ann, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 })).away).toBe(true);
    const st = await db.rpc(ann, 'travel_status');
    expect(st.arrival).toMatchObject({ new_stamp: true, mode: 'plane' });
    expect(st.arrival.stop.id).toBe('ap:LHR');
    expect((await db.rpc(ann, 'travel_status')).arrival).toBeNull();
  });

  it('trips home, hidden players and anyone who stops sharing are left out', async () => {
    await db.sql(`update travel_trips set arrives_at = now() - interval '1 second' where player_id = $1`, [bob]);
    await db.sql(`update explorers set fixed_at = fixed_at - interval '1 hour' where player_id = $1`, [bob]);
    await db.rpc(bob, 'travel_status');
    await db.rpc(bob, 'travel_home');
    const t = await db.rpc(cat, 'travel_traffic');
    expect(t.filter((x: any) => x.username === 'bob_rail').every((x: any) => x.mode === 'train')).toBe(true);
    // the finished ride still shows (it's recent), as arrived
    expect(t.find((x: any) => x.username === 'bob_rail').arrived).toBe(true);
    expect((await db.rpc(ann, 'travel_share', { p_share: false })).share).toBe(false);
    expect((await db.rpc(ann, 'travel_status')).share).toBe(false);
    expect((await db.rpc(cat, 'travel_traffic')).some((x: any) => x.username === 'ann_fly')).toBe(false);
    await db.rpc(ann, 'travel_share', { p_share: true });
    await db.sql(`update profiles set is_hidden = true where id = $1`, [ann]);
    expect((await db.rpc(cat, 'travel_traffic')).some((x: any) => x.username === 'ann_fly')).toBe(false);
    await db.sql(`update profiles set is_hidden = false where id = $1`, [ann]);
    expect((await db.rpc(cat, 'travel_traffic')).some((x: any) => x.username === 'ann_fly')).toBe(true);
  });
});
