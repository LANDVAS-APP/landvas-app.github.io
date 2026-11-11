// v1.3: Landlord estates — rent day (50× on the 1st) has to be earned with a monthly checklist: inspect on 3 days,
// fix 6 broken things, answer 3 tenants, water the garden on 2 days.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let u: string, o: string, gid: string;
const SLC = { lng: -111.891, lat: 40.7608 };
// move "today" for the checklist by rewriting the stored days (the server reads the clock)
const shiftDays = (n: number) => db.sql(`update landlord_progress set inspect_days = array(select d - $2::int from unnest(inspect_days) d),
  garden_days = array(select d - $2::int from unnest(garden_days) d),
  repaired = array(select ((split_part(k, ':', 1))::date - $2::int)::text || ':' || split_part(k, ':', 2) from unnest(repaired) k),
  request_days = '{}'::jsonb where group_id = $1`, [gid, n]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  u = await db.newPlayer('lana_landlord'); o = await db.newPlayer('otto_other');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
  await db.rpc(u, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  await db.rpc(u, 'claim_starter_plot', { p_gx: 3_330_000, p_gy: 2_230_000 });
  const [g] = await db.rpc(u, 'my_groups');
  gid = g.id;
  await db.rpc(u, 'set_group_kind', { p_group_id: gid, p_kind: 'landlord' });
});
afterAll(() => db.close());

describe('the estate', () => {
  it('only its owner can walk in, and only a Landlord group is an estate', async () => {
    await expectError(db.rpc(o, 'estate_visit', { p_group: gid }), 'not_owned');
    const e = await db.rpc(u, 'estate_visit', { p_group: gid });
    expect(e).toMatchObject({ houses: 1, multiplier: 50, eligible: false });
    expect(e.tasks.inspect).toMatchObject({ done: 1, need: 3, today: true });
    expect(e.spots.length).toBe(3);
  });
  it('visiting twice in a day counts once', async () => {
    const e = await db.rpc(u, 'estate_visit', { p_group: gid });
    expect(e.tasks.inspect.done).toBe(1);
  });
  it('repairs: each of today’s broken things once', async () => {
    let e = await db.rpc(u, 'estate_repair', { p_group: gid, p_idx: 0 });
    expect(e.tasks.repairs.done).toBe(1); expect(e.spots[0].fixed).toBe(true);
    await expectError(db.rpc(u, 'estate_repair', { p_group: gid, p_idx: 0 }), 'already_fixed');
    await expectError(db.rpc(u, 'estate_repair', { p_group: gid, p_idx: 9 }), 'invalid_spot');
    e = await db.rpc(u, 'estate_repair', { p_group: gid, p_idx: 1 });
    e = await db.rpc(u, 'estate_repair', { p_group: gid, p_idx: 2 });
    expect(e.tasks.repairs.done).toBe(3);
  });
  it('tenants: two a day; ignoring one uses it up without credit', async () => {
    let e = await db.rpc(u, 'estate_request', { p_group: gid, p_help: true });
    e = await db.rpc(u, 'estate_request', { p_group: gid, p_help: false });
    expect(e.tasks.requests).toMatchObject({ done: 1, left_today: 0 });
    await expectError(db.rpc(u, 'estate_request', { p_group: gid, p_help: true }), 'no_requests_today');
  });
  it('the garden: once a day', async () => {
    const e = await db.rpc(u, 'estate_garden', { p_group: gid });
    expect(e.tasks.garden).toMatchObject({ done: 1, today: true });
    await expectError(db.rpc(u, 'estate_garden', { p_group: gid }), 'already_watered');
  });
  it('rent day pays 50× only once the checklist is done', async () => {
    expect(Number((await db.sql(`select private.landlord_rate($1) r`, [u]))[0].r)).toBe(0);
    // the next two days
    for (let d = 1; d <= 2; d++) {
      await shiftDays(1);
      await db.rpc(u, 'estate_visit', { p_group: gid });
      if (d === 1) await db.rpc(u, 'estate_garden', { p_group: gid });
      for (let i = 0; i < 3; i++) await db.rpc(u, 'estate_repair', { p_group: gid, p_idx: i }).catch(() => {});
      await db.rpc(u, 'estate_request', { p_group: gid, p_help: true });
    }
    const e = (await db.rpc(u, 'my_estates'))[0];
    expect(e.tasks).toMatchObject({ inspect: { done: 3 }, garden: { done: 2 }, requests: { done: 3 } });
    expect(e.tasks.repairs.done).toBeGreaterThanOrEqual(6);
    expect(e.eligible).toBe(true);
    expect(Number((await db.sql(`select private.landlord_rate($1) r`, [u]))[0].r)).toBeGreaterThan(0);
  });
  it('each rent day checks its own checklist', async () => {
    const [x] = await db.sql(`select private.landlord_rate_for($1, (private.landlord_cycle(now()) + interval '1 month')::date) r`, [u]);
    expect(Number(x.r)).toBe(0);
    const [c] = await db.sql(`select private.landlord_cycle('2026-12-01T05:00:00Z') a, private.landlord_cycle('2026-12-02T05:00:00Z') b, private.landlord_cycle('2026-11-30T23:00:00Z') c`);
    expect([c.a, c.b, c.c].map((d: any) => new Date(d).toISOString().slice(0, 10))).toEqual(['2026-12-01', '2027-01-01', '2026-12-01']);
  });
});
