// The Leviathan sent back to the ocean (the fight is kept, no loot) and brought back — the same one, stronger — and its
// health: by players, a set amount, or scaled with the enchantments out so it lasts about N hours (learning how hard
// players really fight from the last one); setting the health of the one that's out; the loot pool doesn't grow with it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string;
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `levd-${++k}-00000000` });
const cellAt = async (lng: number, lat: number) => (await db.sql(`select private.lev_cell($1, $2) c`, [lng, lat]))[0].c as number[];
const live = async () => (await db.sql(`select * from leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0];
const byId = async (id: string) => (await db.sql(`select * from leviathans where id = $1`, [id]))[0];
const tick = () => db.sql(`select private.leviathan_tick() t`).then((r) => r[0].t);
const admin = (action: string, args: Record<string, unknown> = {}) => db.rpc(owner, 'admin_leviathan', { p_action: action, p_args: args });
const cfg = (patch: Record<string, unknown>) => db.sql(`update game_config set value = value || $1::jsonb where key = 'leviathan'`, [JSON.stringify(patch)]);
const calc = async () => (await db.sql(`select private.lev_hp_calc(null) c`))[0].c;
const bombs = async (uid: string, rounds = 1) => { for (let i = 0; i < rounds; i++) await db.rpc(uid, 'leviathan_hit', { p_move: 'bomb', p_n: 10 }); };
const full = (c: any, h: number) => Number(c.ench_move_sum) * (1 + h / Number(c.cd_h)) + Number(c.players) * 100 * (Number(c.bombs_max) + (h * 3600) / Number(c.bomb_regen_s));

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('levd_owner'); ann = await db.newPlayer('levd_ann'); bob = await db.newPlayer('levd_bob');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 200_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await cfg({ enabled: false, powers_auto: false, roam: true });
  for (let i = 0; i < 3; i++) { const [gx, gy] = await cellAt(-122.68 + i * 0.001, 45.52); await claimAt(ann, gx, gy); }
  const [gx, gy] = await cellAt(-104.99, 39.74); await claimAt(bob, gx, gy);
});
afterAll(() => db.close());

describe('its health', () => {
  it('ships scaling with the enchantments out, to last about 9 hours', async () => {
    const v = (await db.sql(`select value from game_config where key = 'leviathan'`))[0].value;
    expect(v).toMatchObject({ hp_mode: 'enchant', last_hours: 9, fight_auto: true });
  });
  it('by players (as before): active players × health each, at least the least health', async () => {
    await cfg({ hp_mode: 'players', hp_min: 1000, hp_per_player: 700 });
    const c = await calc();
    expect(Number(c.hp)).toBe(Math.max(1000, Number(c.players) * 700));
  });
  it('a set amount', async () => {
    await cfg({ hp_mode: 'fixed', hp_fixed: 1_234_567 });
    expect(Number((await calc()).hp)).toBe(1_234_567);
    const r = await admin('summon', { warn_min: 0 });
    expect(Number(r.lev.hp_max)).toBe(1_234_567);
    await admin('dismiss');
  });
  it('scaled with the enchantments out: everything they could do in N hours × how hard they fight', async () => {
    await cfg({ hp_mode: 'enchant', hp_min: 1, last_hours: 9, fight_auto: false, fight_pct: 50 });
    const c0 = await calc();
    expect(Math.abs(Number(c0.hp) - full(c0, 9) * 0.5)).toBeLessThanOrEqual(1);
    // more enchantments out → more health; longer → more
    await db.rpc(owner, 'admin_give_enchantment', { p_player: ann, p_kind: 'goose', p_reason: 'test' });
    await db.rpc(owner, 'admin_give_enchantment', { p_player: bob, p_kind: 'deck', p_reason: 'test' });
    const c1 = await calc();
    expect(Number(c1.enchantments)).toBe(Number(c0.enchantments) + 2);
    expect(Number(c1.hp)).toBeGreaterThan(Number(c0.hp));
    expect(Math.abs(Number(c1.hp) - full(c1, 9) * 0.5)).toBeLessThanOrEqual(1);
    await cfg({ last_hours: 18 });
    expect(Number((await calc()).hp)).toBeGreaterThan(Number(c1.hp) * 1.8);
    await cfg({ last_hours: 9 });
  });
  it('the settings are checked', async () => {
    const v = (await db.sql(`select value from game_config where key = 'leviathan'`))[0].value;
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'leviathan', p_value: { ...v, hp_mode: 'nope' } }), 'invalid_leviathan_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'leviathan', p_value: { ...v, last_hours: 0 } }), 'invalid_leviathan_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'leviathan', p_value: { ...v, fight_pct: 0 } }), 'invalid_leviathan_config');
    await db.rpc(owner, 'admin_config_set', { p_key: 'leviathan', p_value: { ...v, hp_mode: 'fixed', hp_fixed: 5_000_000, last_hours: 12, fight_pct: 30 } });
    await db.rpc(owner, 'admin_config_set', { p_key: 'leviathan', p_value: v });
  });
});

describe('sent back to the ocean, and back again — stronger', () => {
  let id: string; let hpMax0: number; let annDmg: number;
  beforeAll(async () => {
    await cfg({ hp_mode: 'fixed', hp_fixed: 400_000 });
    const r = await admin('summon', { warn_min: 0 });
    id = r.lev.id; hpMax0 = Number(r.lev.hp_max);
    await tick();
    await bombs(ann, 2);
    annDmg = Number((await db.sql(`select dmg from leviathan_players where lev_id = $1 and player_id = $2`, [id, ann]))[0].dmg);
    expect(annDmg).toBeGreaterThan(0);
  });
  it('only the owner', async () => {
    await expectError(db.rpc(ann, 'admin_leviathan', { p_action: 'submerge', p_args: {} }), 'forbidden');
  });
  it('send it back: it dives into the nearest sea and waits — no loot, the fight is kept', async () => {
    const r = await admin('submerge', {});
    expect(r.lev).toBeNull();
    expect(r.deep).toMatchObject({ id, gen: (await byId(id)).gen });
    const l = await byId(id);
    expect(l.status).toBe('submerged'); expect(l.data.dove.sea).toBeTruthy();
    expect((await db.sql(`select loot from leviathan_players where lev_id = $1 and player_id = $2`, [id, ann]))[0].loot).toBeNull();
    // players see it under the sea (with their damage), and can't hit it
    const s = await db.rpc(ann, 'leviathan_state', {});
    expect(s.lev).toBeNull();
    expect(s.deep).toMatchObject({ id, my_dmg: annDmg, fighters: 1 });
    expect(Number(s.deep.next_strength)).toBeCloseTo(1.5, 2);
    await expectError(db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 1 }), 'no_leviathan');
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'submerged'`, [ann]))[0].n).toBe(1);
    // and nothing new comes while it waits (the schedule is off here)
    expect((await tick()).idle).toBe(true);
  });
  it('bring it back: the same one — stronger, with more health, from a sea near the players', async () => {
    await expectError(db.rpc(ann, 'admin_leviathan', { p_action: 'resurface', p_args: {} }), 'forbidden');
    const before = await byId(id);
    const r = await admin('resurface', { step: 1, warn_min: 0 });
    expect(r.lev.id).toBe(id); expect(r.lev.gen).toBe(before.gen);
    expect(Number(r.lev.strength)).toBeCloseTo(2, 2);
    expect(r.lev.returns).toBe(1);
    // health: never less than it had, grown by the step (×2 / ×1) — back to full
    expect(Number(r.lev.hp_max)).toBeGreaterThanOrEqual(hpMax0 * 2);
    expect(Number(r.lev.hp)).toBe(Number(r.lev.hp_max));
    expect(r.lev.status).toBe('warning');
    expect((await tick())).toBeTruthy();
    expect((await live()).status).toBe('walking');
    // everyone's damage is still theirs
    expect(Number((await db.sql(`select dmg from leviathan_players where lev_id = $1 and player_id = $2`, [id, ann]))[0].dmg)).toBe(annDmg);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'warning' and (data ->> 'back')::boolean`, [bob]))[0].n).toBe(1);
    const s = await db.rpc(bob, 'leviathan_state', {});
    expect(s.feed.some((h: any) => h.move === 'return')).toBe(true);
    expect(s.deep).toBeNull();
    await expectError(admin('resurface', {}), 'leviathan_active');
  });
  it('keep its wounds: back with the same share of its health left; from the sea it dove into', async () => {
    await db.sql(`update leviathans set hp = round(hp_max * 0.4) where id = $1`, [id]);
    await admin('submerge', {});
    const sea = (await byId(id)).data.dove;
    const r = await admin('resurface', { step: 0.5, heal: false, from: 'same', warn_min: 0 });
    expect(Number(r.lev.strength)).toBeCloseTo(2.5, 2);
    expect(Number(r.lev.hp) / Number(r.lev.hp_max)).toBeCloseTo(0.4, 2);
    expect(r.lev.origin).toBe(sea.sea);
    const l = await byId(id);
    expect(l.path[0].map(Number)).toEqual(sea.pt.map(Number));
    await tick();
  });
  it('on a timer: it comes back by itself when its time is up', async () => {
    await admin('submerge', { return_h: 6, step: 0.25 });
    const s = await db.rpc(ann, 'leviathan_state', {});
    expect(s.deep.return_at).toBeTruthy();
    expect(Number(s.deep.next_strength)).toBeCloseTo(2.75, 2);
    expect((await tick()).idle).toBe(true);
    await db.sql(`update leviathans set data = jsonb_set(data, '{return_at}', to_jsonb(now() - interval '1 second')) where id = $1`, [id]);
    expect((await tick()).returned).toBe(id);
    expect(Number((await byId(id)).strength)).toBeCloseTo(2.75, 2);
    // (it rises after the usual warning)
    expect((await byId(id)).status).toBe('warning');
    await db.sql(`update leviathans set rise_at = now(), walk_at = now() where id = $1`, [id]);
    await tick();
    expect((await live()).status).toBe('walking');
  });
});

describe('the health of the one that’s out', () => {
  it('a set amount, keeping its wounds (or full)', async () => {
    const l0 = await live();
    await db.sql(`update leviathans set hp = round(hp_max * 0.6) where id = $1`, [l0.id]);
    let r = await admin('set_hp', { mode: 'fixed', hp: 1_000_000 });
    expect(Number(r.lev.hp_max)).toBe(1_000_000); expect(Number(r.lev.hp)).toBe(600_000);
    r = await admin('set_hp', { mode: 'fixed', hp: 2_000_000, keep: false });
    expect(Number(r.lev.hp)).toBe(2_000_000);
    await expectError(admin('set_hp', { mode: 'fixed', hp: 0 }), 'invalid_hp');
  });
  it('“lasts N more hours at the pace it’s being hit now”', async () => {
    await db.sql(`update leviathan_players set bombs = 60`);
    await bombs(ann, 3); await bombs(bob, 3);
    const s = await admin('status');
    expect(s.pace.measured).toBe(true);
    const r = await admin('set_hp', { mode: 'hours', hours: 10 });
    expect(Number(r.lev.hp) / (Number(s.pace.dph) * 10)).toBeGreaterThan(0.9);
    expect(Number(r.lev.hp) / (Number(s.pace.dph) * 10)).toBeLessThan(1.1);
    expect(Number(r.pace.eta_h)).toBeGreaterThan(9);
  });
  it('the loot pool stays the old size however big the health bar gets', async () => {
    await cfg({ loot_cap: 1_000_000 });
    const l = await live();
    await admin('set_hp', { mode: 'fixed', hp: 500_000_000 });
    const lootHp = Number((await live()).data.loot_hp);
    expect(lootHp).toBeLessThan(500_000_000);
    await db.sql(`update leviathans set hp = 50 where id = $1`, [l.id]);
    await bombs(ann, 1);
    expect((await byId(l.id)).status).toBe('fallen');
    const paid = (await db.sql(`select coalesce(sum((loot ->> 'ink')::int), 0)::int n from leviathan_players where lev_id = $1`, [l.id]))[0].n;
    expect(paid).toBeLessThanOrEqual(lootHp / 100 + 25 * 3 + 5);
  });
  it('“how hard they fight” is learned from the last fight', async () => {
    // the last one fell after 2 hours
    const last = (await db.sql(`select * from leviathans where status = 'fallen' order by ended_at desc limit 1`))[0];
    await db.sql(`update leviathans set rise_at = ended_at - interval '2 hours' where id = $1`, [last.id]);
    await cfg({ hp_mode: 'enchant', fight_auto: true, hp_min: 1 });
    const c = await calc();
    expect(c.engage_from).toBe('last');
    expect(Number(c.last.hours)).toBeCloseTo(2, 1);
    expect(Number(c.engage)).toBeGreaterThan(0); expect(Number(c.engage)).toBeLessThanOrEqual(1);
    const want = full(c, 9) * Math.max(0.02, Number(c.engage));
    expect(Math.abs(Number(c.hp) - want) / want).toBeLessThan(0.001);
    await cfg({ fight_auto: false });
    expect((await calc()).engage_from).toBe('setting');
  });
});

describe('the weekly schedule', () => {
  it('brings back the one under the sea (stronger) instead of a new one', async () => {
    await cfg({ hp_mode: 'fixed', hp_fixed: 300_000 });
    const r = await admin('summon', { warn_min: 0 });
    await tick();
    await admin('submerge', {});
    const n0 = (await db.sql(`select count(*)::int n from leviathans`))[0].n;
    // (the schedule says now)
    await cfg({ enabled: true });
    await db.sql(`create or replace function private.lev_next_at() returns timestamptz language sql stable as $$ select now() - interval '1 second' $$`);
    expect((await tick()).returned).toBe(r.lev.id);
    expect((await db.sql(`select count(*)::int n from leviathans`))[0].n).toBe(n0);
    expect(Number((await byId(r.lev.id)).strength)).toBeCloseTo(1.5, 2);
  });
});
