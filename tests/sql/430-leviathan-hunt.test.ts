// The owner's hand on the Leviathan that's out: more health (a bigger bar too), going after any players and plots in
// order, an ENRAGED hunt that goes after players and plots nonstop (your list round and round, or whoever it finds,
// following a player who moves), calling it off, summoning your own (health, speed, hunting from the start), and
// finding plots by number, link or place.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string, cat: string;
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `levh-${++k}-00000000` });
const cellAt = async (lng: number, lat: number) => (await db.sql(`select private.lev_cell($1, $2) c`, [lng, lat]))[0].c as number[];
const live = async () => (await db.sql(`select * from leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0];
const tick = () => db.sql(`select private.leviathan_tick() t`).then((r) => r[0].t);
const admin = (action: string, args: Record<string, unknown> = {}) => db.rpc(owner, 'admin_leviathan', { p_action: action, p_args: args });
const explorer = (uid: string, lng: number, lat: number) =>
  db.sql(`insert into explorers (player_id, mode, lng, lat) values ($1, 'gps', $2, $3) on conflict (player_id) do update set lng = $2, lat = $3, dest_lng = null, dest_lat = null, fixed_at = now()`, [uid, lng, lat]);
const km = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const pt = (p: any) => ({ lng: Number(p[0]), lat: Number(p[1]) });
const PORTLAND = { lng: -122.68, lat: 45.52 }, DENVER = { lng: -104.99, lat: 39.74 }, SEATTLE = { lng: -122.33, lat: 47.61 };
/** run it to the end of its road */
const arrive = async () => { const l = await live(); await db.sql(`update leviathans set walk_s = 10000000, pause_until = null where id = $1`, [l.id]); return tick(); };
let annPlot: number[], bobPlot: number[], catPlot: number[];

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('levh_owner'); ann = await db.newPlayer('levh_ann'); bob = await db.newPlayer('levh_bob'); cat = await db.newPlayer('levh_cat');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 200_000); }
  await db.sql(`update players set last_active_at = now() - interval '30 days' where id = $1`, [owner]);
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false, "powers_auto": false, "hp_mode": "fixed", "hp_fixed": 500000}' where key = 'leviathan'`);
  annPlot = await cellAt(PORTLAND.lng, PORTLAND.lat); await claimAt(ann, annPlot[0], annPlot[1]);
  bobPlot = await cellAt(DENVER.lng, DENVER.lat); await claimAt(bob, bobPlot[0], bobPlot[1]);
  catPlot = await cellAt(SEATTLE.lng, SEATTLE.lat); await claimAt(cat, catPlot[0], catPlot[1]);
  await explorer(ann, PORTLAND.lng + 0.05, PORTLAND.lat);
  await explorer(cat, SEATTLE.lng, SEATTLE.lat + 0.05);
  await admin('summon', { warn_min: 0 });
  await tick();
});
afterAll(() => db.close());

describe('more health', () => {
  it('adds to its health and its health bar (an amount, or a % of the bar)', async () => {
    const l0 = await live();
    let r = await admin('add_hp', { hp: 250_000 });
    expect(Number(r.lev.hp_max)).toBe(Number(l0.hp_max) + 250_000); expect(Number(r.lev.hp)).toBe(Number(l0.hp) + 250_000);
    r = await admin('add_hp', { pct: 100 });
    expect(Number(r.lev.hp_max)).toBe((Number(l0.hp_max) + 250_000) * 2);
    expect(r.feed[0]).toMatchObject({ move: 'heal' });
    await expectError(admin('add_hp', { hp: 0 }), 'invalid_hp');
    await expectError(db.rpc(ann, 'admin_leviathan', { p_action: 'add_hp', p_args: { hp: 5 } }), 'forbidden');
  });
});

describe('any players and plots, in order', () => {
  it('goes for them one after another — players where they are, then their best plots; plots themselves', async () => {
    const r = await admin('target', { targets: [{ t: 'player', name: 'levh_ann' }, { t: 'player', id: bob }, { t: 'plot', gx: catPlot[0], gy: catPlot[1] }] });
    expect(r.lev.target).toMatchObject({ owner_name: 'levh_ann', player: true, more: 2 });
    const path = (await live()).path.map(pt);
    expect(km(path[1], { lng: PORTLAND.lng + 0.05, lat: PORTLAND.lat })).toBeLessThan(1); // ann's explorer
    expect(path.some((p: any) => km(p, DENVER) < 2)).toBe(true); // bob's plot (no explorer)
    expect(path.some((p: any) => km(p, SEATTLE) < 2)).toBe(true); // cat's plot
    for (const u of [ann, bob, cat]) expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'coming'`, [u]))[0].n).toBeGreaterThanOrEqual(1);
    await expectError(admin('target', { targets: [{ t: 'player', name: 'nobody_here' }] }), 'player_not_found');
    await expectError(admin('target', { targets: [{ t: 'plot', gx: -5, gy: 3 }] }), 'bad_plot');
  });
});

describe('ENRAGED: hunting players and plots nonstop', () => {
  it('by itself (players): enraged, after a player — and everyone can see it’s hunting', async () => {
    const r = await admin('hunt', { on: true, auto: 'players' });
    expect(r.lev.status).toBe('enraged'); expect(r.lev.hunting).toBe(true);
    expect(r.lev.hunt).toMatchObject({ on: true, auto: 'players' });
    expect(r.lev.target.player).toBe(true);
    expect(['levh_ann', 'levh_bob', 'levh_cat']).toContain(r.lev.target.owner_name);
    expect(r.feed.some((h: any) => h.move === 'hunt')).toBe(true);
    const s = await db.rpc(bob, 'leviathan_state', {});
    expect(s.lev.hunting).toBe(true); expect(s.lev.hunt).toBeUndefined();
  });
  it('at the end of every road it turns on the next one — never the same one twice in a row', async () => {
    const first = (await live()).data.target.owner_name;
    expect((await arrive()).roamed).toBeTruthy();
    const l = await live();
    expect(l.status).toBe('enraged'); expect(l.data.target.owner_name).not.toBe(first);
    expect(Number(l.data.hunt.hunted)).toBeGreaterThanOrEqual(2);
  });
  it('your own list, round and round', async () => {
    const r = await admin('hunt', { on: true, targets: [{ t: 'plot', gx: bobPlot[0], gy: bobPlot[1] }, { t: 'plot', gx: catPlot[0], gy: catPlot[1] }] });
    expect(r.lev.target).toMatchObject({ gx: bobPlot[0], owner_name: 'levh_bob' });
    await arrive(); expect((await live()).data.target.gx).toBe(catPlot[0]);
    await arrive(); expect((await live()).data.target.gx).toBe(bobPlot[0]);
    expect((await live()).status).toBe('enraged');
  });
  it('a hunted player who moves is followed', async () => {
    await admin('hunt', { on: true, targets: [{ t: 'player', id: ann }] });
    expect(km(pt((await live()).path[1]), { lng: PORTLAND.lng + 0.05, lat: PORTLAND.lat })).toBeLessThan(1);
    // ann drives 60 km east
    await explorer(ann, PORTLAND.lng + 0.8, PORTLAND.lat);
    await db.sql(`update leviathans set data = jsonb_set(data, '{hunt,aimed_at}', to_jsonb(now() - interval '2 minutes')) where status in ('walking', 'enraged')`);
    await tick();
    expect(km(pt((await live()).path[1]), { lng: PORTLAND.lng + 0.8, lat: PORTLAND.lat })).toBeLessThan(1);
  });
  it('faster while hunting (× its pace)', async () => {
    const r = await admin('hunt', { on: true, auto: 'both', mult: 4 });
    expect(Number(r.lev.speed_kmh)).toBeCloseTo(Number(r.lev.base_kmh) * 4, 1);
    await admin('speed', { mult: 1 });
  });
  it('called off: it calms down and roams on', async () => {
    const r = await admin('hunt', { on: false });
    expect(r.lev.hunting).toBe(false); expect(r.lev.status).toBe('walking');
    expect((await arrive()).roamed).toBeTruthy();
    expect((await live()).data.hunt.on).toBe(false);
  });
  it('sent to retreat: the hunt is off', async () => {
    await admin('hunt', { on: true });
    await admin('retreat');
    const l = await live();
    expect(l.status).toBe('fleeing'); expect(l.data.hunt.on).toBe(false);
    await admin('stay');
  });
  it('it keeps hunting through a dive under the sea and back', async () => {
    await admin('hunt', { on: true, auto: 'plots' });
    await admin('submerge', {});
    await admin('resurface', { warn_min: 0, step: 0 });
    await tick();
    const l = await live();
    expect(l.status).toBe('enraged'); expect(l.data.hunt.on).toBe(true); expect(l.data.target).toBeTruthy();
    await admin('dismiss');
  });
});

describe('summon your own', () => {
  it('its health, its pace, and hunting from the moment it rises', async () => {
    const r = await admin('summon', { warn_min: 0, hp: 777_777, mult: 3, hunt: { on: true, auto: 'players', targets: [{ t: 'player', id: cat }] } });
    expect(Number(r.lev.hp_max)).toBe(777_777); expect(Number(r.lev.hp)).toBe(777_777);
    expect(Number(r.lev.speed_kmh)).toBeCloseTo(Number(r.lev.base_kmh) * 3, 1);
    expect(r.lev.status).toBe('warning');
    await tick();
    const l = await live();
    expect(l.status).toBe('enraged'); expect(l.data.target.owner_name).toBe('levh_cat');
    expect(km(pt(l.path[1]), { lng: SEATTLE.lng, lat: SEATTLE.lat + 0.05 })).toBeLessThan(1);
    await expectError(admin('summon', {}), 'leviathan_active');
    await admin('dismiss');
    await expectError(admin('summon', { hp: 0 }), 'invalid_hp');
  });
});

describe('finding plots', () => {
  const find = (q: string) => db.rpc(owner, 'admin_lev_find', { p_q: q });
  it('by number (as the game writes it, as two numbers, or a link)', async () => {
    const label = `${annPlot[0].toLocaleString('en-US').replace(/,/g, ' ')} · ${annPlot[1].toLocaleString('en-US').replace(/,/g, ' ')}`;
    for (const q of [label, `${annPlot[0]} ${annPlot[1]}`, `https://landvas.app/world?fly=${annPlot[0]},${annPlot[1]}&z=18`]) {
      const r = await find(q);
      expect(r.plots[0]).toMatchObject({ gx: annPlot[0], gy: annPlot[1], owner_name: 'levh_ann' });
    }
  });
  it('by place: the best plots around a city', async () => {
    const r = await find('Denver');
    expect(r.place).toMatch(/Denver/);
    expect(r.plots.some((p: any) => p.gx === bobPlot[0] && p.gy === bobPlot[1])).toBe(true);
  });
  it('only the owner', async () => {
    await expectError(db.rpc(ann, 'admin_lev_find', { p_q: 'Denver' }), 'forbidden');
  });
});
