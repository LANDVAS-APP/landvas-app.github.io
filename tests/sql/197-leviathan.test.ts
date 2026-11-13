// The Leviathan: a real route from a sea through real cities, the warning, rising, walking (a pure function of time),
// trampling and scrubbing, ink bombs and enchantment moves, giants in its way, enraged at half, fleeing at 10%, bones and
// loot when it falls, and coming back stronger when it escapes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string, cat: string;
let k = 0;
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `lev-${++k}-00000000` });
const state = (uid: string | null) => db.rpc(uid, 'leviathan_state', {});
const lev = async () => (await db.sql(`select * from leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0];
const pos = async () => (await db.sql(`select private.lev_pos(l, now()) p from leviathans l where status in ('walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0].p;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const cellAt = async (lng: number, lat: number) => (await db.sql(`select private.lev_cell($1, $2) c`, [lng, lat]))[0].c as number[];
const tick = () => db.sql(`select private.leviathan_tick() t`).then((r) => r[0].t);

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('lev_owner'); ann = await db.newPlayer('lev_ann'); bob = await db.newPlayer('lev_bob'); cat = await db.newPlayer('lev_cat');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 200_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  // (this suite summons them by hand)
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'leviathan'`);
  // players around Portland, Oregon
  for (let i = 0; i < 4; i++) { const [gx, gy] = await cellAt(-122.68 + i * 0.001, 45.52); await claimAt(ann, gx, gy); }
});
afterAll(() => db.close());

describe('the route', () => {
  it('a real sea, landfall in a real city, inland city to city, and back to a sea', async () => {
    const r = (await db.sql(`select private.lev_route() r`))[0].r;
    expect(r.path.length).toBeGreaterThanOrEqual(3);
    expect(r.sea).toBeTruthy(); expect(r.exit).toBeTruthy(); expect(r.cities.length).toBeGreaterThanOrEqual(1);
    expect(Number((await db.sql(`select private.lev_path_km($1::jsonb) k`, [JSON.stringify(r.path)]))[0].k)).toBeGreaterThan(100);
  });
  it('the schedule: a Saturday, an hour before 17:00 UTC', async () => {
    const t = new Date((await db.sql(`select private.lev_next_at() t`))[0].t);
    const rise = new Date(t.getTime() + 60 * 60_000);
    expect(rise.getUTCDay()).toBe(6); expect(rise.getUTCHours()).toBe(17);
  });
});

describe('a Leviathan, start to finish', () => {
  it('summoned: everyone is warned; it rises when the warning runs out', async () => {
    await expectError(db.rpc(ann, 'admin_leviathan', { p_action: 'summon', p_args: {} }), 'forbidden');
    const s = await db.rpc(owner, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 30 } });
    expect(s.lev.status).toBe('warning'); expect(s.lev.origin).toBeTruthy();
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and kind = 'leviathan' and data ->> 'sub' = 'warning'`, [ann]))[0].n).toBe(1);
    await expectError(db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 1 }), 'not_risen');
    await db.sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where status = 'warning'`);
    await tick();
    expect((await lev()).status).toBe('walking');
  });
  it('it walks along its path: where it is, is a matter of time', async () => {
    const p0 = await pos();
    await db.sql(`update leviathans set walk_at = walk_at - interval '2 hours' where status = 'walking'`);
    const p1 = await pos();
    const l = await lev();
    expect(Number(p1.km) - Number(p0.km)).toBeCloseTo(2 * Number(l.speed_kmh), 0);
    const st = await state(null);
    expect(st.lev.pos.lng).toBeTypeOf('number'); expect(st.lev.path.length).toBeGreaterThan(2); expect(st.me).toBeNull();
  });
  it('plots it passes are trampled: their minigames pay less until scrubbed (scrubbing pays)', async () => {
    const p = await pos();
    const [gx, gy] = await cellAt(Number(p.lng) + 0.0004, Number(p.lat));
    await claimAt(bob, gx, gy);
    await db.sql(`update leviathans set trampled_km = greatest(0, $1::numeric - 0.5) where status = 'walking'`, [Number(p.km)]);
    await tick();
    expect((await db.sql(`select count(*)::int n from leviathan_trampled where gx = $1 and gy = $2`, [gx, gy]))[0].n).toBe(1);
    expect(Number((await db.sql(`select private.ench_minigame_mult($1, $2, $3) m`, [bob, gx, gy]))[0].m)).toBeCloseTo(0.6, 5);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'trampled'`, [bob]))[0].n).toBe(1);
    const m = await db.rpc(null, 'leviathan_map', { p_min_gx: gx - 5, p_min_gy: gy - 5, p_max_gx: gx + 5, p_max_gy: gy + 5 });
    expect(m.length).toBeGreaterThanOrEqual(1);
    const c0 = await ink(cat), b0 = await ink(bob);
    const r = await db.rpc(cat, 'leviathan_scrub', { p_gx: gx, p_gy: gy });
    expect(r.ink).toBe(6); expect(await ink(cat)).toBe(c0 + 6); expect(await ink(bob)).toBe(b0 + 3);
    expect(Number((await db.sql(`select private.ench_minigame_mult($1, $2, $3) m`, [bob, gx, gy]))[0].m)).toBe(1);
    await expectError(db.rpc(cat, 'leviathan_scrub', { p_gx: gx, p_gy: gy }), 'not_found');
  });
  it('ink bombs: a bank of 60, up to 10 a throw', async () => {
    const r = await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 10 });
    expect(r.dmg).toBeGreaterThanOrEqual(800); expect(r.dmg).toBeLessThanOrEqual(1200);
    expect(r.me.bombs).toBe(50); expect(r.feed[0]).toMatchObject({ name: 'lev_ann', label: '10 ink bombs' });
    await db.sql(`update leviathan_players set bombs = 0, bombs_at = now() where player_id = $1`, [ann]);
    await expectError(db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 3 }), 'no_bombs');
  });
  it('each enchantment has a move (every 3 hours): the Size Ray shrinks it, Clockwork freezes it', async () => {
    const at = await cellAt(-122.6, 45.6);
    await force('sizeray'); const ray = (await claimAt(cat, at[0], at[1])).enchant.id; await force('');
    await force('clockwork'); const clock = (await claimAt(cat, at[0] + 2, at[1])).enchant.id; await force('');
    const r = await db.rpc(cat, 'leviathan_hit', { p_move: 'enchant', p_enchant: ray });
    expect(r.effect).toBe('shrink'); expect(r.lev.shrunk_until).toBeTruthy(); expect(r.label).toMatch(/Shrink Ray/);
    await expectError(db.rpc(cat, 'leviathan_hit', { p_move: 'enchant', p_enchant: ray }), 'too_soon');
    const before = await pos();
    const f = await db.rpc(cat, 'leviathan_hit', { p_move: 'enchant', p_enchant: clock });
    expect(f.effect).toBe('freeze');
    expect((await pos()).paused).toBe(true);
    expect(Number((await pos()).km)).toBeCloseTo(Number(before.km), 1);
    // shrunk: everyone hits half as hard again
    const b = await db.rpc(bob, 'leviathan_hit', { p_move: 'bomb', p_n: 10 });
    expect(b.dmg).toBeGreaterThanOrEqual(1200);
    expect(b.me.moves).toEqual([]);
    expect(b.top.length).toBe(3);
  });
  it('a giant plot in its way stops it and lands a blow (once)', async () => {
    await db.sql(`update leviathans set pause_until = null where status = 'walking'`);
    const p = await pos();
    const [gx, gy] = await cellAt(Number(p.lng) + 0.002, Number(p.lat));
    await claimAt(bob, gx, gy);
    await db.sql(`insert into enchant_buffs (player_id, kind, gx, gy, mult, expires_at) values ($1, 'plot_giant', $2, $3, 2, now() + interval '6 hours')`, [bob, gx, gy]);
    const hp0 = Number((await lev()).hp);
    await tick();
    const l = await lev();
    expect(Number(l.hp)).toBeLessThan(hp0); expect(l.blocked).toEqual([[gx, gy]]);
    expect((await pos()).paused).toBe(true);
    await tick();
    expect((await lev()).blocked).toHaveLength(1);
  });
  it('at half health it’s ENRAGED and turns on the biggest plots; at 10% it runs for the sea', async () => {
    const l = await lev();
    await db.sql(`update leviathans set hp = round(hp_max * 0.5) + 50, pause_until = null where id = $1`, [l.id]);
    await db.sql(`update leviathan_players set bombs = 60 where player_id = $1`, [ann]);
    const r = await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 5 });
    expect(r.lev.status).toBe('enraged'); expect(r.lev.target).toBeTruthy();
    await db.sql(`update leviathans set hp = round(hp_max * 0.1) + 50 where id = $1`, [l.id]);
    const f = await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 5 });
    expect(f.lev.status).toBe('fleeing'); expect(f.lev.path).toHaveLength(2);
  });
  it('it falls: its bones stay where it died, and everyone who fought gets loot by contribution', async () => {
    const l = await lev();
    await db.sql(`update leviathans set hp = 60 where id = $1`, [l.id]);
    const a0 = await ink(ann);
    const r = await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 5 });
    expect(r.fell).toBe(true); expect(r.lev).toBeNull();
    expect(r.last).toMatchObject({ status: 'fallen', gen: l.gen }); expect(r.last.loot.loot.fell).toBe(true);
    expect(r.bones).toHaveLength(1);
    expect(await ink(ann)).toBeGreaterThan(a0 + 25);
    expect((await db.sql(`select count(*)::int n from roll_tickets where source = 'leviathan'`))[0].n).toBeGreaterThanOrEqual(1);
    expect((await db.sql(`select count(*)::int n from feed_events where kind = 'leviathan' and data ->> 'sub' = 'fallen'`))[0].n).toBe(1);
    await db.rpc(ann, 'leviathan_seen', { p_lev: l.id });
    expect((await state(ann)).last.loot.seen).toBe(true);
  });
  it('one that escapes comes back stronger', async () => {
    await db.rpc(owner, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } });
    await tick();
    await db.rpc(bob, 'leviathan_hit', { p_move: 'bomb', p_n: 2 }).catch(() => db.sql(`update leviathan_players set bombs = 60`).then(() => db.rpc(bob, 'leviathan_hit', { p_move: 'bomb', p_n: 2 })));
    await db.sql(`update leviathans set walk_s = 10000000, pause_until = null where status in ('walking', 'enraged', 'fleeing')`);
    const t = await tick();
    expect(t.escaped).toBeTruthy();
    const s = await state(bob);
    expect(s.last.status).toBe('escaped'); expect(s.last.loot.loot.fell).toBe(false);
    const n = await db.rpc(owner, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 5 } });
    expect(Number(n.lev.strength)).toBe(1.5);
    const d = await db.rpc(owner, 'admin_leviathan', { p_action: 'dismiss', p_args: {} });
    expect(d.lev).toBeNull(); expect(d.history.length).toBe(3);
  });
  it('the owner’s settings are checked', async () => {
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'leviathan', p_value: { weekday: 9 } }), 'invalid_leviathan_config');
  });
});
