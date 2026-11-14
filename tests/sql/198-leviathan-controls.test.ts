// The owner's live controls on a Leviathan that's already walking (nothing about it resets): speed, aiming it at a
// player or at plots, a rampage, retreat / stay, heal, roaming — and its powers: TINY (bombs miss) and HIDDEN (a hazy
// area for everyone; zoom in and search to find it; only finders can hit it; the Oracle reveals it).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string;
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `levc-${++k}-00000000` });
const lev = async () => (await db.sql(`select * from leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0];
const pos = async () => (await db.sql(`select private.lev_pos(l, now()) p from leviathans l where status in ('walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0].p;
const cellAt = async (lng: number, lat: number) => (await db.sql(`select private.lev_cell($1, $2) c`, [lng, lat]))[0].c as number[];
const tick = () => db.sql(`select private.leviathan_tick() t`).then((r) => r[0].t);
const admin = (action: string, args: Record<string, unknown> = {}) => db.rpc(owner, 'admin_leviathan', { p_action: action, p_args: args });
const km = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('levc_owner'); ann = await db.newPlayer('levc_ann'); bob = await db.newPlayer('levc_bob');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 200_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false, "powers_auto": false}' where key = 'leviathan'`);
  // Ann plays in Portland; Bob in Denver
  for (let i = 0; i < 3; i++) { const [gx, gy] = await cellAt(-122.68 + i * 0.001, 45.52); await claimAt(ann, gx, gy); }
  for (let i = 0; i < 2; i++) { const [gx, gy] = await cellAt(-104.99 + i * 0.001, 39.74); await claimAt(bob, gx, gy); }
  await admin('summon', { warn_min: 0 });
  await tick();
  // it has been walking a while, and been hit
  await db.sql(`update leviathans set walk_at = walk_at - interval '3 hours', hp = hp - 5000 where status = 'walking'`);
});
afterAll(() => db.close());

describe('live controls (on one that is already walking)', () => {
  it('only the owner', async () => {
    await expectError(db.rpc(ann, 'admin_leviathan', { p_action: 'speed', p_args: { mult: 5 } }), 'forbidden');
  });
  it('speed: faster from where it stands — no jump, health and damage untouched', async () => {
    const before = await lev(); const p0 = await pos();
    const r = await admin('speed', { mult: 5 });
    expect(Number(r.lev.speed_kmh)).toBeCloseTo(Number(before.base_kmh) * 5, 1);
    const p1 = await pos();
    expect(km(p0, p1)).toBeLessThan(1);
    const after = await lev();
    expect(Number(after.hp)).toBe(Number(before.hp));
    // and it really goes 5× as far in the same time
    await db.sql(`update leviathans set walk_at = walk_at - interval '10 minutes' where id = $1`, [before.id]);
    expect(Number((await pos()).km) - Number(p1.km)).toBeCloseTo((Number(after.speed_kmh) * 10) / 60, 0);
    await expectError(admin('speed', { kmh: 0 }), 'invalid_speed');
    await admin('speed', { kmh: Number(before.base_kmh) });
  });
  it('aim it at a player: it heads for where they are, and they are told', async () => {
    const r = await admin('target', { player: 'levc_bob' });
    expect(r.lev.target.owner_name).toBe('levc_bob');
    const l = await lev();
    const goal = { lng: Number(l.path[1][0]), lat: Number(l.path[1][1]) };
    expect(km(goal, { lng: -104.99, lat: 39.74 })).toBeLessThan(2);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'coming'`, [bob]))[0].n).toBe(1);
    await expectError(admin('target', { player: 'nobody_here' }), 'player_not_found');
  });
  it('aim it at plots you pick', async () => {
    const plot = (await db.sql(`select gx, gy from world_plots where owner_id = $1 limit 1`, [ann]))[0];
    const r = await admin('target', { plots: [[plot.gx, plot.gy]] });
    expect(r.lev.target).toMatchObject({ gx: plot.gx, gy: plot.gy, owner_name: 'levc_ann' });
    const l = await lev();
    expect(km({ lng: Number(l.path[1][0]), lat: Number(l.path[1][1]) }, { lng: -122.68, lat: 45.52 })).toBeLessThan(2);
  });
  it('a rampage: ×8 for 20 minutes towards them, then back to its pace (same way)', async () => {
    const pace = Number((await lev()).speed_kmh);
    const r = await admin('rampage', { player: 'levc_ann', minutes: 20, mult: 8 });
    expect(r.lev.rampage_until).toBeTruthy();
    expect(Number(r.lev.speed_kmh)).toBeCloseTo(Math.max(Number(r.lev.base_kmh) * 8, pace * 1.5), 1);
    const path = (await lev()).path;
    await db.sql(`update leviathans set rampage_until = now() - interval '1 second' where status in ('walking', 'enraged')`);
    await tick();
    const l = await lev();
    expect(l.rampage_until).toBeNull();
    expect(Number(l.speed_kmh)).toBeCloseTo(pace, 1);
    expect(l.path).toEqual(path);
  });
  it('heal: back up by a share of its health (shown in the fight feed)', async () => {
    const h0 = Number((await lev()).hp);
    await admin('heal', { pct: 2 });
    const l = await lev();
    expect(Number(l.hp)).toBeGreaterThan(h0); expect(Number(l.hp)).toBeLessThanOrEqual(Number(l.hp_max));
    const s = await db.rpc(ann, 'leviathan_state', {});
    expect(s.feed[0]).toMatchObject({ move: 'heal' });
  });
  it('retreat: it runs for the sea and escapes there (even with roaming on); stay: it turns back', async () => {
    await admin('retreat');
    let l = await lev();
    expect(l.status).toBe('fleeing'); expect(l.data.retreat).toBe(true);
    await admin('stay');
    l = await lev();
    expect(['walking', 'enraged']).toContain(l.status); expect(l.data.retreat).toBeUndefined();
    await admin('retreat');
    await db.sql(`update leviathans set walk_s = 10000000 where id = $1`, [l.id]);
    expect((await tick()).escaped).toBe(l.id);
  });
});

describe('its powers', () => {
  beforeAll(async () => {
    await admin('summon', { warn_min: 0 });
    await tick();
    await db.sql(`update leviathan_players set bombs = 60`);
  });
  it('TINY: half the ink bombs miss, and the Size Ray blows it back up', async () => {
    await db.sql(`update game_config set value = value || '{"tiny_miss": 0.95}' where key = 'leviathan'`);
    const r = await admin('tiny', { minutes: 20 });
    expect(r.lev.tiny_until).toBeTruthy();
    let missed = 0;
    for (let i = 0; i < 3; i++) missed += (await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 10 })).missed;
    expect(missed).toBeGreaterThan(15);
    await db.sql(`update game_config set value = value - 'tiny_miss' where key = 'leviathan'`);
    await admin('tiny', { minutes: 0 });
    expect((await lev()).tiny_until).toBeNull();
  });
  it('HIDDEN: everyone sees only a hazy area (the owner sees it all)', async () => {
    await admin('hide', { minutes: 30 });
    const truth = await pos();
    const s = await db.rpc(ann, 'leviathan_state', {});
    expect(s.lev.hidden).toBe(true); expect(s.lev.path).toBeNull(); expect(s.lev.target).toBeNull();
    expect(s.lev.pos.haze).toBe(true);
    expect(km(s.lev.pos, truth)).toBeLessThan(Number(s.lev.haze.km));
    expect(km(s.lev.pos, truth)).toBeGreaterThan(1);
    const o = await admin('status');
    expect(o.lev.hidden).toBe(false); expect(o.lev.path).toBeTruthy();
  });
  it('only someone who found it can hit it', async () => {
    await expectError(db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 1 }), 'lev_hidden');
  });
  it('searching: zoom in to look; warm, cold — then found (a reward, and you can see and hit it)', async () => {
    const t = await pos();
    const at = (lng: number, lat: number, w: number) => db.rpc(ann, 'leviathan_seek', { p_west: lng - w, p_south: lat - w / 2, p_east: lng + w, p_north: lat + w / 2 });
    expect((await at(t.lng, t.lat, 5)).too_wide).toBe(true);
    const cold = await at(t.lng + 3, t.lat, 0.2);
    expect(cold).toMatchObject({ found: false, hint: 'cold' });
    const warm = await at(t.lng + 0.6, t.lat, 0.2);
    expect(['warm', 'hot']).toContain(warm.hint);
    const f = await at(t.lng, t.lat, 0.2);
    expect(f).toMatchObject({ found: true, first: true });
    expect(f.ink).toBeGreaterThan(0);
    const s = await db.rpc(ann, 'leviathan_state', {});
    expect(s.lev.hidden).toBe(false); expect(s.lev.path).toBeTruthy(); expect(s.me.spotted).toBe(true);
    expect((await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 1 })).dmg).toBeGreaterThan(0);
    // (once per hiding)
    expect((await at(t.lng, t.lat, 0.2)).spotted).toBe(true);
    expect((await db.sql(`select count(*)::int n from feed_events where kind = 'leviathan' and data ->> 'sub' = 'found'`))[0].n).toBe(1);
    // Bob still can't see it
    expect((await db.rpc(bob, 'leviathan_state', {})).lev.hidden).toBe(true);
  });
  it('the Oracle Eye reveals it to everyone', async () => {
    await db.sql(`select set_config('landvas.force_enchant', 'oracle', false)`);
    const [gx, gy] = await cellAt(-104.99 + 0.01, 39.74);
    await claimAt(bob, gx, gy);
    await db.sql(`select set_config('landvas.force_enchant', '', false)`);
    const eye = (await db.sql(`select id from enchantments where owner_id = $1 and kind = 'oracle'`, [bob]))[0].id;
    const r = await db.rpc(bob, 'leviathan_hit', { p_move: 'enchant', p_enchant: eye });
    expect(r.effect).toBe('reveal');
    expect((await db.rpc(bob, 'leviathan_state', {})).lev.hidden).toBe(false);
  });
  it('on its own, every few hours: tiny or hidden', async () => {
    await db.sql(`update game_config set value = value || '{"powers_auto": true}' where key = 'leviathan'`);
    await db.sql(`update leviathans set data = data || jsonb_build_object('next_power_at', now() - interval '1 minute'), tiny_until = null, hidden_until = null where status in ('walking', 'enraged', 'fleeing')`);
    await tick();
    const l = await lev();
    expect(!!l.tiny_until || !!l.hidden_until).toBe(true);
    expect(new Date(l.data.next_power_at).getTime()).toBeGreaterThan(Date.now());
    await db.sql(`update game_config set value = value || '{"powers_auto": false}' where key = 'leviathan'`);
  });
  it('a tiny one tramples a narrow path', async () => {
    const r = (await db.sql(`select private.lev_n('trample_km', 1.2) r`))[0].r;
    expect(Number(r)).toBeGreaterThan(0);
    await admin('tiny', { minutes: 10 });
    expect((await db.sql(`select private.lev_tiny(l) t from leviathans l where status in ('walking', 'enraged', 'fleeing')`))[0].t).toBe(true);
  });
  it('settings are checked', async () => {
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'leviathan', p_value: { tiny_miss: 2 } }), 'invalid_leviathan_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'leviathan', p_value: { roam: 'yes' } }), 'invalid_leviathan_config');
  });
});
