// 📱 Outside: Bump (two friends' knocks paired by time and place, a gift of Ink moved — never made — and a party pile-up's
// Golden Hour), the Lasso walk (a walked loop becomes a Footprint you can claim anywhere inside), and the real sky
// calendar (showers, the Moon's cycle, ISS passes and the capsule).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError, cellCenter } from '../helpers/db';

const db = new TestDb();
let me: string, pal: string, stranger: string, p3: string, p4: string;
const BASE = { gx: 2_700_000, gy: 1_500_000 };
const here = cellCenter(BASE.gx, BASE.gy);
/** a real GPS fix (metres east/north of the base): the first through the game's own call, then straight in (a jump
 *  across town in a second would be refused as a teleport) */
const started = new Set<string>();
const fix = async (uid: string, east = 0, north = 0) => {
  const lat = here.lat + north / 111_320, lng = here.lng + east / (111_320 * Math.cos((here.lat * Math.PI) / 180));
  if (!started.has(uid)) { started.add(uid); await db.rpc(uid, 'report_position', { p_lng: lng, p_lat: lat, p_accuracy_m: 8 }); }
  await db.sql(`update explorers set mode = 'gps', gps_lng = $2, gps_lat = $3, gps_at = now() where player_id = $1`, [uid, lng, lat]);
};
/** knocks in different scenes mustn't overlap (they pair within 1.5 s) */
const pause = () => new Promise((r) => setTimeout(r, 2100));
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);

beforeAll(async () => {
  await db.init({});
  me = await db.newPlayer('out_me'); pal = await db.newPlayer('out_pal'); stranger = await db.newPlayer('out_str');
  p3 = await db.newPlayer('out_p3'); p4 = await db.newPlayer('out_p4');
  await db.sql(`update players set created_at = now() - interval '10 days'`);
  for (const u of [me, pal, stranger, p3, p4]) await db.giveInk(u, 10_000);
  await db.sql(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [me, pal]);
});
afterAll(() => db.close());

describe('🤜 Bump', () => {
  it('needs you out on real GPS', async () => {
    await expectError(db.rpc(me, 'bump_knock', { p_strength: 1 }), 'gps_required');
  });

  it('pairs two friends who knock at the same moment, right next to each other', async () => {
    await fix(me); await fix(pal, 20, 10);
    const a = await db.rpc(me, 'bump_knock', { p_strength: 1 });
    const b = await db.rpc(pal, 'bump_knock', { p_strength: 1 });
    expect(b.matched).toBe(true);
    expect(b.with.username).toBe('out_me');
    const a2 = await db.rpc(me, 'bump_check', { p_id: a.id });
    expect(a2).toMatchObject({ matched: true, pair: b.pair, can_gift: true });
    expect(a2.with.username).toBe('out_pal');
  });

  it('never pairs a stranger, or a friend too far away, or knocks seconds apart', async () => {
    await pause();
    await fix(stranger, 5, 5);
    const s = await db.rpc(stranger, 'bump_knock', {});
    await pause();
    const m = await db.rpc(me, 'bump_knock', {});
    expect(m.matched).toBe(false);
    expect((await db.rpc(stranger, 'bump_check', { p_id: s.id })).matched).toBe(false);
    // a friend 400 m away
    await pause();
    await fix(pal, 400, 0);
    await db.rpc(me, 'bump_knock', {});
    expect((await db.rpc(pal, 'bump_knock', {})).matched).toBe(false);
    // knocks 3 s apart
    await fix(pal, 10, 0);
    await pause();
    await db.rpc(me, 'bump_knock', {});
    await new Promise((r) => setTimeout(r, 3000));
    expect((await db.rpc(pal, 'bump_knock', {})).matched).toBe(false);
  });

  it('a gift of Ink is moved from you to them — once per bump, capped, a few a day', async () => {
    await pause();
    await fix(me); await fix(pal, 10, 0);
    await db.rpc(me, 'bump_knock', {});
    const b = await db.rpc(pal, 'bump_knock', {});
    expect(b.matched).toBe(true);
    const [i0, j0] = [await ink(me), await ink(pal)];
    await expectError(db.rpc(pal, 'bump_gift', { p_pair: b.pair, p_ink: 5 }), 'gift_amount');
    await expectError(db.rpc(pal, 'bump_gift', { p_pair: b.pair, p_ink: 5000 }), 'gift_amount');
    const g = await db.rpc(pal, 'bump_gift', { p_pair: b.pair, p_ink: 120 });
    expect(g.ink).toBe(120);
    expect(await ink(pal)).toBe(j0 - 120);
    expect(await ink(me)).toBe(i0 + 120);
    await expectError(db.rpc(pal, 'bump_gift', { p_pair: b.pair, p_ink: 50 }), 'gift_sent');
    // someone else's bump isn't yours to gift from
    await expectError(db.rpc(stranger, 'bump_gift', { p_pair: b.pair, p_ink: 50 }), 'bump_gone');
    const mine = await db.rpc(pal, 'bump_mine');
    expect(mine.gifts_today).toBe(1);
    expect(mine.recent.map((x: any) => x.username)).toContain('out_me');
  });

  it('new accounts can’t pass Ink around', async () => {
    await db.sql(`update players set created_at = now() where id = $1`, [me]);
    await pause();
    await db.rpc(me, 'bump_knock', {});
    const b = await db.rpc(pal, 'bump_knock', {});
    await expectError(db.rpc(pal, 'bump_gift', { p_pair: b.pair, p_ink: 50 }), 'bump_too_new');
    await db.sql(`update players set created_at = now() - interval '10 days' where id = $1`, [me]);
  });

  it('a party of four piling up gives the whole party a Golden Hour — once a day', async () => {
    const g = (await db.sql(`insert into travel_groups (leader_id, code) values ($1, 'BUMP42') returning id`, [stranger]))[0].id;
    for (const u of [stranger, p3, p4, me]) {
      await db.sql(`delete from travel_group_members where player_id = $1`, [u]);
      await db.sql(`insert into travel_group_members (group_id, player_id) values ($1, $2)`, [g, u]);
    }
    await pause();
    for (const [u, e] of [[stranger, 0], [p3, 8], [p4, 16], [me, 24]] as const) await fix(u, e, 0);
    const rs: any[] = [];
    for (const u of [stranger, p3, p4, me]) rs.push(await db.rpc(u, 'bump_knock', {}));
    expect(rs[3].crowd).toBe(4);
    expect(rs.filter((r) => r.golden)).toHaveLength(1);
    const buffs = await db.sql(`select player_id from enchant_buffs where kind = 'golden_hour' and data ->> 'from' = 'bump_crowd'`);
    expect(new Set(buffs.map((b: any) => b.player_id))).toEqual(new Set([stranger, p3, p4, me]));
    await pause();
    const again: any[] = [];
    for (const u of [stranger, p3, p4, me]) again.push(await db.rpc(u, 'bump_knock', {}));
    expect(again.some((r) => r.golden)).toBe(false);
    for (const u of [stranger, p3, p4, me]) await db.sql(`delete from travel_group_members where player_id = $1`, [u]);
  });
});

describe('🪢 The Lasso walk', () => {
  // a loop of `side` metres round the base, walked in `mins` minutes, n points a side
  const loop = (side: number, mins: number, n = 15, at = Date.now()) => {
    const pts: [number, number][] = [];
    const corners = [[0, 0], [side, 0], [side, side], [0, side], [0, 0]];
    for (let c = 0; c < 4; c++) for (let i = 0; i < n; i++) {
      const f = i / n, [x0, y0] = corners[c], [x1, y1] = corners[c + 1];
      pts.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
    }
    pts.push([0, 0]);
    const t0 = at - mins * 60_000;
    const k = 111_320 * Math.cos((here.lat * Math.PI) / 180);
    return pts.map(([x, y], i) => [here.lng + x / k, here.lat + y / 111_320, Math.round(t0 + (i / (pts.length - 1)) * mins * 60_000), 8]);
  };

  it('a walked loop becomes your Footprint: claims anywhere inside skip the walk-up rule', async () => {
    await fix(me, 0, 0);
    const r = await db.rpc(me, 'lasso_submit', { p_track: loop(150, 12) });
    expect(r.area_m2).toBeGreaterThan(20_000);
    expect(r.area_m2).toBeLessThan(25_000);
    expect(r.rank).toBe(1);
    // a cell ~100 m in (cells are ~10 m here): inside the loop, far past the explorer's reach
    const inside = { gx: BASE.gx + 8, gy: BASE.gy - 8 }, outside = { gx: BASE.gx - 30, gy: BASE.gy + 30 };
    expect((await db.sql(`select private.lasso_ok($1, $2, $3) ok`, [me, inside.gx, inside.gy]))[0].ok).toBe(true);
    expect((await db.sql(`select private.lasso_ok($1, $2, $3) ok`, [me, outside.gx, outside.gy]))[0].ok).toBe(false);
    expect((await db.sql(`select private.lasso_ok($1, $2, $3) ok`, [pal, inside.gx, inside.gy]))[0].ok).toBe(false);
    const d = await db.rpc(me, 'plot_details', { p_gx: inside.gx, p_gy: inside.gy });
    expect(d.reach).toMatchObject({ in_reach: true, footprint: true });
    const far = await db.rpc(me, 'plot_details', { p_gx: outside.gx, p_gy: outside.gy });
    expect(far.reach.in_reach).toBe(false);
    await db.sql(`select private.require_in_reach($1, $2, $3)`, [me, inside.gx, inside.gy]);
    await expectError(db.sql(`select private.require_in_reach($1, $2, $3)`, [me, outside.gx, outside.gy]), 'out_of_reach');
  });

  it('it shows for you and your party, and the week’s biggest loop leads', async () => {
    const g = (await db.sql(`insert into travel_groups (leader_id, code) values ($1, 'LASSO1') returning id`, [me]))[0].id;
    for (const u of [me, pal]) await db.sql(`insert into travel_group_members (group_id, player_id) values ($1, $2)`, [g, u]);
    const v = await db.rpc(pal, 'lasso_view');
    expect(v.loops).toHaveLength(1);
    expect(v.loops[0]).toMatchObject({ mine: false });
    expect(v.loops[0].who.username).toBe('out_me');
    expect(v.board[0].username).toBe('out_me');
    expect((await db.rpc(stranger, 'lasso_view')).loops).toHaveLength(0);
    for (const u of [me, pal]) await db.sql(`delete from travel_group_members where player_id = $1`, [u]);
  });

  it('a car, an open loop, a speck, or a loop somewhere you aren’t — no', async () => {
    await expectError(db.rpc(me, 'lasso_submit', { p_track: loop(1500, 6) }), 'lasso_fast');
    const open = loop(150, 12); open[open.length - 1] = [open[open.length - 1][0] + 0.002, open[open.length - 1][1], open[open.length - 1][2], 8];
    await expectError(db.rpc(me, 'lasso_submit', { p_track: open }), 'lasso_open');
    await expectError(db.rpc(me, 'lasso_submit', { p_track: loop(30, 6) }), 'lasso_s');
    await fix(me, 2000, 0);
    await expectError(db.rpc(me, 'lasso_submit', { p_track: loop(150, 12) }), 'lasso_elsewhere');
    await expectError(db.rpc(me, 'lasso_submit', { p_track: loop(150, 12, 15, Date.now() - 3_600_000) }), 'lasso_stale');
    await fix(me, 0, 0);
  });

  it('a new loop replaces the old one; a few a day', async () => {
    await db.rpc(me, 'lasso_submit', { p_track: loop(200, 15) });
    expect((await db.sql(`select count(*)::int n from lasso_loops where player_id = $1 and expires_at > now()`, [me]))[0].n).toBe(1);
    await db.rpc(me, 'lasso_submit', { p_track: loop(180, 15) });
    await expectError(db.rpc(me, 'lasso_submit', { p_track: loop(170, 15) }), 'lasso_today');
  });
});

describe('🌠 The real sky calendar', () => {
  it('knows the meteor showers (peak ± a day)', async () => {
    const at = async (t: string) => (await db.sql(`select (private.sky_shower($1::timestamptz)).id id`, [t]))[0].id;
    expect(await at('2026-11-17 20:00+00')).toBe('leonids');
    expect(await at('2026-12-15 03:00+00')).toBe('geminids');
    expect(await at('2027-01-03 12:00+00')).toBe('quadrantids');
    expect(await at('2026-07-01 12:00+00')).toBeNull();
  });

  it('follows the Moon’s real cycle', async () => {
    const full = async (t: string) => (await db.sql(`select private.sky_full_moon($1::timestamptz) f`, [t]))[0].f;
    expect(await full('2026-11-24 15:00+00')).toBe(true); // a real full moon
    expect(await full('2026-12-24 01:30+00')).toBe(true);
    expect(await full('2026-11-17 06:00+00')).toBe(false); // first quarter
    const next = (await db.sql(`select private.next_full_moon('2026-11-17 06:00+00'::timestamptz) t`))[0].t;
    expect(Math.abs(new Date(next).getTime() - Date.parse('2026-11-24T14:53Z'))).toBeLessThan(18 * 3600_000);
  });

  it('works out ISS passes over where your explorer is, and drops a capsule while it’s overhead', async () => {
    await fix(me, 0, 0);
    expect((await db.rpc(me, 'sky_now')).capsule).toBeNull();
    await expectError(db.rpc(me, 'sky_capsule_catch'), 'not_overhead');
    // a pass: from 3 minutes ago to 3 minutes from now, the station sweeps right over the base (400 km up)
    await db.sql(`insert into sky_iss (at, lat, lng, alt_km)
      select date_trunc('minute', now()) + make_interval(secs => k * 30), $1 + (k * 0.6), $2, 420 from generate_series(-12, 12) k
      on conflict (at) do update set lat = excluded.lat, lng = excluded.lng, alt_km = excluded.alt_km`, [here.lat, here.lng]);
    const s = await db.rpc(me, 'sky_now');
    expect(s.iss_data).toBe(true);
    expect(s.passes.length).toBeGreaterThanOrEqual(1);
    expect(s.passes[0].max_elev).toBeGreaterThan(60);
    expect(s.capsule).toMatchObject({ caught: false });
    const c = await db.rpc(me, 'sky_capsule_catch');
    expect(c.elev).toBeGreaterThan(10);
    expect(c.ink ?? c.luck ?? c.ticket).toBeTruthy();
    await expectError(db.rpc(me, 'sky_capsule_catch'), 'caught_already');
    expect((await db.rpc(me, 'sky_now')).capsule.caught).toBe(true);
    // someone 3,000 km away sees no pass
    await fix(pal, 3_000_000, 0);
    await expectError(db.rpc(pal, 'sky_capsule_catch'), 'not_overhead');
  });

  it('a shower night doubles the sky treasures in Explorer’s Eyes', async () => {
    await db.sql(`delete from sky_showers where id <> 'e2e_now'`);
    const plain = await db.rpc(pal, 'eyes_sky');
    await db.sql(`insert into sky_showers (id, name, month, day, zhr) values ('e2e_now', 'Test shower', extract(month from now() at time zone 'utc'), extract(day from now() at time zone 'utc'), 99)
      on conflict (id) do update set month = excluded.month, day = excluded.day`);
    const shower = await db.rpc(pal, 'eyes_sky');
    expect(shower.cap).toBe(plain.cap * 2);
    expect(shower.drops.length).toBe(6);
    expect((await db.rpc(pal, 'sky_now')).shower.name).toBe('Test shower');
  });

  it('shows the Moon and the next showers', async () => {
    const s = await db.rpc(me, 'sky_now');
    expect(s.moon.phase).toBeGreaterThanOrEqual(0);
    expect(s.moon.phase).toBeLessThan(1);
    expect(s.showers.length).toBeGreaterThanOrEqual(1);
    expect(Date.parse(s.moon.next_full)).toBeGreaterThan(Date.now());
  });
});
