// Enchantments, part 14: 🫙 Déjà Vu — a jar that catches moments (the Hot Zone, a Solar Flare, the Leviathan's weak
// moment, a bolt of lightning, a falling star, a Golden Hour) and lets them happen again; its Trait Preserved; its
// Leviathan move (the last 10 seconds of hits land again); its stars; and the rules around it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string;
const O = { gx: 812_400, gy: 1_544_300 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `dv-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claimAt(uid, O.gx + (spot++) * 3, O.gy + (uid === ann ? 0 : 40));
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const splice = async (uid: string, a: string, b: string) => {
  const sp = await enchant(uid, 'splice');
  await db.sql(`update enchantments set state = state || '{"charges": 3}'::jsonb where id = $1`, [sp]);
  await act(uid, sp, 'splice', { mode: 'swap', a, b });
  return sp;
};
/** empty the jar and forget what it has caught */
const emptyJar = (id: string) => db.sql(`update enchantments set state = state || '{"jar": [], "seen": {}, "zones": []}'::jsonb where id = $1`, [id]);
const scoopAs = async (id: string, t: string) => {
  const v = await get(ann, id);
  const m = v.view.live.find((x: any) => x.t === t);
  expect(m, `a live ${t} moment`).toBeTruthy();
  return act(ann, id, 'scoop', { src: m.src });
};

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('dv_owner'); ann = await db.newPlayer('dv_ann'); bob = await db.newPlayer('dv_bob');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 900_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'leviathan'`);
  await db.sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}'::jsonb where key = 'enchantments'`);
  await db.placeAt(ann, O.gx, O.gy);
});
afterAll(() => db.close());

describe('the twenty-first kind', () => {
  it('twenty-one kinds, 190 hybrids (36 Perfect Matches); a Trait, a Leviathan move, five star powers and six badges', async () => {
    const ks = (await db.sql(`select private.ench_kinds() k`))[0].k as string[];
    expect(ks).toHaveLength(21);
    expect(ks).toContain('dejavu');
    expect((await db.sql(`select private.ench_info('dejavu') i`))[0].i).toMatchObject({ name: 'Déjà Vu', emoji: '🫙', gene: 'preserved', gene_name: 'Preserved' });
    const h = (await db.sql(`select count(*)::int n, count(*) filter (where (value ->> 1)::boolean)::int p from jsonb_each(private.ench_hybrids())`))[0];
    expect(h).toEqual({ n: 190, p: 36 });
    for (const other of ks.filter((x) => x !== 'dejavu' && x !== 'splice')) {
      expect((await db.sql(`select private.ench_hybrid('dejavu', $1) ->> 0 n`, [other]))[0].n, other).not.toBe('Chimera');
    }
    expect((await db.sql(`select private.ench_hybrid('stormcoil', 'dejavu') h`))[0].h).toEqual(['Lightning in a Bottle', true]);
    expect((await db.sql(`select private.lev_move('dejavu') m`))[0].m[3]).toBe('dejavu');
    expect((await db.sql(`select jsonb_array_length(private.ench_star_powers('dejavu')) n`))[0].n).toBe(5);
    expect((await db.sql(`select count(*)::int n from achievements where category = 'enchant' and metric like 'ench.dejavu.%'`))[0].n).toBe(6);
    // it rolls as often as every other kind
    expect((await db.sql(`select value -> 'weights' ->> 'dejavu' w from game_config where key = 'enchantments'`))[0].w).toBe('1');
    expect((await db.sql(`select private.ench_hatchable() h`))[0].h).toContain('dejavu');
  });

  it('it comes out of a roll with an empty jar, holding three', async () => {
    const id = await enchant(ann, 'dejavu');
    expect((await row(id)).kind).toBe('dejavu');
    const v = await get(ann, id);
    expect(v.view).toMatchObject({ jar: [], cap: 3, zones: [], fade_d: 7, vintage: false, double_take: false, shared: false });
    expect(v.view.live).toEqual([]);
    await expectError(act(ann, id, 'scoop', { t: 'hotzone' }), 'no_moment');
    await expectError(act(ann, id, 'uncork', { i: 1 }), 'no_moment');
  });
});

describe('catching moments, and letting them happen again', () => {
  let jar: string;
  beforeAll(async () => { jar = await enchant(ann, 'dejavu'); });

  it('🔥 the Hot Zone: only while you are in it (or a plot of yours is) — once a day', async () => {
    const hz = (await db.sql(`select private.hot_zone(private.today()) z`))[0].z;
    expect((await get(ann, jar)).view.live.find((m: any) => m.t === 'hotzone')).toBeFalsy();
    await db.placeAt(ann, hz.gx, hz.gy);
    const v = await get(ann, jar);
    const m = v.view.live.find((x: any) => x.t === 'hotzone');
    expect(m).toMatchObject({ t: 'hotzone', name: 'the Hot Zone', emoji: '🔥', from: hz.name });
    expect(v.view.attention).toMatch(/A moment is happening/);
    const r = await act(ann, jar, 'scoop', { src: m.src });
    expect(r.result.scooped).toMatchObject({ t: 'hotzone', pct: 100, s: 1 });
    expect(r.view.jar).toHaveLength(1);
    // the same Hot Zone can't be caught twice
    expect(r.view.live.find((x: any) => x.t === 'hotzone')).toBeFalsy();
    await expectError(act(ann, jar, 'scoop', { src: m.src }), 'no_moment');
    const st = (await row(jar)).stats;
    expect(st).toMatchObject({ scooped: 1, scoop_hotzone: 1, moment_kinds: 1 });
    await db.placeAt(ann, O.gx, O.gy);
  });

  it('…uncorked on a spot in reach, it is a Déjà Vu zone: claims inside roll again with ultras ×2.5', async () => {
    const i = (await get(ann, jar)).view.jar[0].i;
    await expectError(act(ann, jar, 'uncork', { i, gx: O.gx + 900_000, gy: O.gy }), 'out_of_range');
    await expectError(act(ann, jar, 'uncork', { i }), 'invalid_plot');
    const r = await act(ann, jar, 'uncork', { i, gx: O.gx, gy: O.gy + 200 });
    expect(r.result.zone).toMatchObject({ t: 'hotzone', gx: O.gx, gy: O.gy + 200, r_m: 150, flare: false });
    expect(Number(r.result.zone.um)).toBe(2.5);
    expect(Number(r.result.zone.until) - Number(r.result.zone.at)).toBe(900);
    expect(r.view.jar).toHaveLength(0);
    expect(r.view.zones).toHaveLength(1);
    // inside: the zone's boost, for you; outside or for someone else: nothing
    const inside = (await db.sql(`select private.dv_for_claim($1, $2, $3) z`, [ann, O.gx + 10, O.gy + 200]))[0].z;
    expect(inside).toMatchObject({ id: jar, flare: false, party: false });
    expect(Number(inside.um)).toBe(2.5);
    expect((await db.sql(`select private.dv_for_claim($1, $2, $3) z`, [ann, O.gx + 400, O.gy + 200]))[0].z).toBeNull();
    expect((await db.sql(`select private.dv_for_claim($1, $2, $3) z`, [bob, O.gx + 10, O.gy + 200]))[0].z).toBeNull();
    // a claim inside goes through it
    await claimAt(ann, O.gx + 12, O.gy + 201);
    expect(Number((await row(jar)).stats.zone_claims)).toBe(1);
    // and the map shows it
    const m = await db.rpc(ann, 'enchant_map2', { p_min_gx: O.gx - 500, p_min_gy: O.gy - 500, p_max_gx: O.gx + 500, p_max_gy: O.gy + 500 });
    expect(m.echoes).toHaveLength(1);
    expect(m.echoes[0]).toMatchObject({ id: jar, mine: true, t: 'hotzone' });
    expect((await db.rpc(bob, 'enchant_map2', { p_min_gx: O.gx - 500, p_min_gy: O.gy - 500, p_max_gx: O.gx + 500, p_max_gy: O.gy + 500 })).echoes).toHaveLength(0);
  });

  it('✨ a Golden Hour goes into the jar whole (it stops), and starts again when uncorked', async () => {
    await emptyJar(jar);
    await db.sql(`insert into enchant_buffs (player_id, kind, mult, uses, data, expires_at) values ($1, 'golden_hour', 2, 3, '{}'::jsonb, now() + interval '1 day')`, [ann]);
    const r = await scoopAs(jar, 'golden');
    expect(r.result.scooped).toMatchObject({ t: 'golden' });
    expect((await db.sql(`select count(*)::int n from enchant_buffs where player_id = $1 and kind = 'golden_hour'`, [ann]))[0].n).toBe(0);
    const u = await act(ann, jar, 'uncork', { i: r.result.scooped.i });
    expect(u.result.golden).toMatchObject({ uses: 3 });
    const b = (await db.sql(`select uses, mult::float m from enchant_buffs where player_id = $1 and kind = 'golden_hour'`, [ann]))[0];
    expect(b).toEqual({ uses: 3, m: 2 });
    expect(Number((await row(jar)).stats.golden_uncorked)).toBe(1);
    // a Golden Hour that came out of a jar can't go back in (no loops)
    expect((await get(ann, jar)).view.live.find((x: any) => x.t === 'golden')).toBeFalsy();
    await db.sql(`delete from enchant_buffs where player_id = $1 and kind = 'golden_hour'`, [ann]);
  });

  it('🌞 a Solar Flare of your own Pocket Sun: uncorked, a zone where every claim keeps the better of two rolls', async () => {
    await emptyJar(jar);
    const sun = await enchant(ann, 'sun');
    const ep = Date.now() / 1000;
    await db.sql(`update enchantments set state = state || jsonb_build_object('zones', $2::jsonb) where id = $1`, [sun, JSON.stringify([{ i: 1, gx: O.gx, gy: O.gy, r0: 150,
      lit_at: ep, fuel: 6 * 3600, fuel_at: ep, heat: 30, heat_at: ep, mode: 'claim', party: false, spots: [], claims: 0, warm_at: ep, flare_until: ep + 90 }])]);
    const r = await scoopAs(jar, 'flare');
    expect(r.result.scooped).toMatchObject({ t: 'flare', from: 'your Pocket Sun' });
    const u = await act(ann, jar, 'uncork', { i: r.result.scooped.i, gx: O.gx + 5, gy: O.gy + 250 });
    expect(u.result.zone).toMatchObject({ t: 'flare', flare: true });
    expect(Number(u.result.zone.until) - Number(u.result.zone.at)).toBe(60);
    expect((await db.sql(`select private.dv_for_claim($1, $2, $3) z`, [ann, O.gx + 5, O.gy + 250]))[0].z).toMatchObject({ flare: true });
    await db.sql(`update enchantments set state = state || '{"zones": []}'::jsonb where id in ($1, $2)`, [sun, jar]);
  });

  it('🌠 a falling star in reach: uncorked, three stars fall into your hand', async () => {
    await emptyJar(jar);
    await db.sql(`insert into rarity_spots (kind, gx, gy, data, expires_at) values ('star', $1, $2, '{"shower": "dv-test"}'::jsonb, now() + interval '20 minutes')`, [O.gx + 30, O.gy + 30]);
    const r = await scoopAs(jar, 'star');
    const before = await ink(ann);
    const luck0 = Number((await db.sql(`select coalesce((select luck from player_luck where player_id = $1), 0) l`, [ann]))[0].l);
    const u = await act(ann, jar, 'uncork', { i: r.result.scooped.i });
    expect(u.result.stars.n).toBe(3);
    const gotInk = (await ink(ann)) - before, luck1 = Number((await db.sql(`select coalesce((select luck from player_luck where player_id = $1), 0) l`, [ann]))[0].l);
    expect(gotInk + (luck1 - luck0) + (u.result.stars.golden ? 1 : 0)).toBeGreaterThan(0);
    // the shower is caught once
    expect((await get(ann, jar)).view.live.find((x: any) => x.t === 'star')).toBeFalsy();
  });

  it('⚡ a storm in reach: a bottled bolt strikes one of your hybrids — and only a hybrid', async () => {
    await emptyJar(jar);
    const coil = await enchant(bob, 'stormcoil');
    await db.sql(`update enchantments set state = state || jsonb_build_object('storm', jsonb_build_object('at', extract(epoch from now()) - 5, 'until', extract(epoch from now()) + 170, 'bolts', '[]'::jsonb, 'caught', '{}'::jsonb)) where id = $1`, [coil]);
    const r = await scoopAs(jar, 'bolt');
    expect(r.result.scooped.from).toMatch(/dv_bob/);
    const lone = await enchant(ann, 'genie');
    const i = r.result.scooped.i;
    await expectError(act(ann, jar, 'uncork', { i }), 'bad_target');
    await expectError(act(ann, jar, 'uncork', { i, target: lone }), 'not_spliced');
    const g2 = await enchant(ann, 'oracle');
    await splice(ann, lone, g2);
    const v = await get(ann, jar);
    expect(v.view.hybrids.map((x: any) => x.id)).toEqual(expect.arrayContaining([lone, g2]));
    const u = await act(ann, jar, 'uncork', { i, target: lone });
    expect(['aberration', 'surge', 'overcharge', 'extend']).toContain(u.result.bolt.what);
    expect(Number((await row(jar)).stats.uncork_bolt)).toBe(1);
    await db.sql(`update enchantments set state = state - 'storm' where id = $1`, [coil]);
  });

  it('the jar holds three (★1 Wide Neck: four); a full jar refuses; a moment can be poured out', async () => {
    await emptyJar(jar);
    const m = (t: string, i: number) => ({ i, t, src: `x${i}`, d: {}, at: Date.now() / 1000, s0: 1 });
    await db.sql(`update enchantments set state = state || jsonb_build_object('jar', $2::jsonb, 'n', 10) where id = $1`, [jar, JSON.stringify([m('star', 1), m('star', 2), m('golden', 3)])]);
    await db.sql(`insert into enchant_buffs (player_id, kind, mult, uses, data, expires_at) values ($1, 'golden_hour', 2, 3, '{}'::jsonb, now() + interval '1 day')`, [ann]);
    await expectError(scoopAs(jar, 'golden'), 'jar_full');
    await db.sql(`update enchantments set stars = 1 where id = $1`, [jar]);
    expect((await get(ann, jar)).view.cap).toBe(4);
    await scoopAs(jar, 'golden');
    const p = await act(ann, jar, 'pour', { i: 1 });
    expect(p.result.poured).toBe('star');
    expect(p.view.jar.map((x: any) => x.i)).toEqual([2, 3, 11]);
    await db.sql(`update enchantments set stars = 0 where id = $1`, [jar]);
    await db.sql(`delete from enchant_buffs where player_id = $1 and kind = 'golden_hour'`, [ann]);
  });

  it('moments fade: half strength over 7 days, then gone; ★2 Good Cork 14 days; ★5 never', async () => {
    const day = 86400, now = Date.now() / 1000;
    const set = (ages: number[]) => db.sql(`update enchantments set state = state || jsonb_build_object('jar', $2::jsonb) where id = $1`,
      [jar, JSON.stringify(ages.map((a, i) => ({ i: i + 1, t: 'star', src: `f${i}`, d: {}, at: now - a * day, s0: 1 })))]);
    await set([0, 3.5, 8]);
    let v = (await get(ann, jar)).view;
    expect(v.jar.map((x: any) => x.pct)).toEqual([100, 75]);
    await db.sql(`update enchantments set stars = 2 where id = $1`, [jar]);
    await set([7, 8]);
    v = (await get(ann, jar)).view;
    expect(v.fade_d).toBe(14);
    expect(v.jar.map((x: any) => x.pct)).toEqual([75, 71]);
    await db.sql(`update enchantments set stars = 5 where id = $1`, [jar]);
    await set([30]);
    v = (await get(ann, jar)).view;
    expect(v.fade_d).toBeNull();
    expect(v.jar[0].pct).toBe(100);
    expect(v.jar[0].gone_at).toBeNull();
    await db.sql(`update enchantments set stars = 0 where id = $1`, [jar]);
  });

  it('a fading moment comes out weaker; ★4 Vintage stronger; ★3 Double Take leaves half in the jar once a day', async () => {
    const now = Date.now() / 1000;
    const put = (age: number) => db.sql(`update enchantments set state = state || jsonb_build_object('jar', $2::jsonb, 'zones', '[]'::jsonb, 'dt_day', null) where id = $1`,
      [jar, JSON.stringify([{ i: 1, t: 'hotzone', src: 'h', d: {}, at: now - age * 86400, s0: 1 }])]);
    await put(3.5);
    let u = await act(ann, jar, 'uncork', { i: 1, gx: O.gx, gy: O.gy + 300 });
    expect(Number(u.result.zone.um)).toBeCloseTo(1 + 1.5 * 0.75, 1);
    await db.sql(`update enchantments set stars = 4 where id = $1`, [jar]);
    await put(0);
    u = await act(ann, jar, 'uncork', { i: 1, gx: O.gx, gy: O.gy + 300 });
    expect(Number(u.result.zone.um)).toBeCloseTo(1 + 1.5 * 1.5, 1);
    // ★3 (and up): half of it stays, once a day
    expect(u.result.double_take).toBe(true);
    expect(u.view.jar).toHaveLength(1);
    expect(u.view.jar[0].pct).toBe(50);
    expect(u.view.double_take).toBe(false);
    u = await act(ann, jar, 'uncork', { i: 1, gx: O.gx, gy: O.gy + 300 });
    expect(u.result.double_take).toBe(false);
    expect(u.view.jar).toHaveLength(0);
    // at most three zones burn at once
    await put(0);
    const live = (i: number) => ({ i: 100 + i, t: 'hotzone', gx: O.gx, gy: O.gy + 300, r_m: 150, um: 2, flare: false, at: now, until: now + 600, party: false });
    await db.sql(`update enchantments set state = state || jsonb_build_object('zones', $2::jsonb) where id = $1`, [jar, JSON.stringify([live(1), live(2), live(3)])]);
    await expectError(act(ann, jar, 'uncork', { i: 1, gx: O.gx, gy: O.gy + 300 }), 'too_many_zones');
    await db.sql(`update enchantments set stars = 0, state = state || '{"zones": []}'::jsonb where id = $1`, [jar]);
  });

  it('★5 Eternal Moment: an uncorked zone is shared with your party, at half the boost', async () => {
    await db.sql(`update enchantments set stars = 5 where id = $1`, [jar]);
    await db.sql(`update enchantments set state = state || jsonb_build_object('jar', $2::jsonb, 'zones', '[]'::jsonb) where id = $1`,
      [jar, JSON.stringify([{ i: 1, t: 'hotzone', src: 'h5', d: {}, at: Date.now() / 1000, s0: 1 }])]);
    const u = await act(ann, jar, 'uncork', { i: 1, gx: O.gx, gy: O.gy + 300 });
    expect(u.result.zone.party).toBe(true);
    // bob joins ann's party
    const g = (await db.sql(`insert into travel_groups (leader_id, code, name) values ($1, 'DVPARTY1', 'dv party') returning id`, [ann]))[0].id;
    await db.sql(`insert into travel_group_members (group_id, player_id) values ($1, $2), ($1, $3)`, [g, ann, bob]);
    const z = (await db.sql(`select private.dv_for_claim($1, $2, $3) z`, [bob, O.gx + 5, O.gy + 300]))[0].z;
    expect(z).toMatchObject({ party: true });
    expect(Number(z.um)).toBeCloseTo(1 + (1 + 1.5 * 1.5 - 1) / 2, 2);
    await db.sql(`delete from travel_group_members where group_id = $1`, [g]);
    await db.sql(`update enchantments set stars = 0, state = state || '{"zones": []}'::jsonb where id = $1`, [jar]);
  });
});

describe('the Leviathan', () => {
  let jar: string;
  beforeAll(async () => {
    jar = await enchant(ann, 'dejavu');
    await db.rpc(owner, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } });
    await db.sql(`select private.leviathan_tick()`);
    await db.sql(`update leviathans set hp = 5000000, hp_max = 5000000, hidden_until = null where status in ('walking', 'enraged', 'fleeing')`);
  });

  it('🎯 its weak moment can be caught — and uncorked for everyone, half as long', async () => {
    await db.sql(`update leviathans set weakspot_until = now() + interval '8 seconds' where status in ('walking', 'enraged', 'fleeing')`);
    const r = await scoopAs(jar, 'weakspot');
    expect(r.result.scooped.d).toMatchObject({ col: 'weakspot', secs: 10 });
    await db.sql(`update leviathans set weakspot_until = null where status in ('walking', 'enraged', 'fleeing')`);
    const u = await act(ann, jar, 'uncork', { i: r.result.scooped.i });
    expect(u.result.lev).toMatchObject({ col: 'weakspot', secs: 5 });
    const left = Number((await db.sql(`select extract(epoch from weakspot_until - now()) s from leviathans where status in ('walking', 'enraged', 'fleeing')`))[0].s);
    expect(left).toBeGreaterThan(3); expect(left).toBeLessThanOrEqual(5);
    expect((await db.sql(`select count(*)::int n from leviathan_hits where emoji = '🫙' and label like '%uncorked%'`))[0].n).toBe(1);
    // the weak moment a jar let out can't be caught again — by this jar or any other
    expect(u.view.live.find((x: any) => x.t === 'weakspot')).toBeFalsy();
    const other = await enchant(ann, 'dejavu');
    expect((await get(ann, other)).view.live.find((x: any) => x.t === 'weakspot')).toBeFalsy();
    await db.sql(`update leviathans set weakspot_until = null where status in ('walking', 'enraged', 'fleeing')`);
  });

  it('the move Déjà Vu: every hit of the last 10 seconds lands again', async () => {
    const b = await db.rpc(bob, 'leviathan_hit', { p_move: 'bomb', p_n: 5 });
    expect(b.dmg).toBeGreaterThan(0);
    const h = await db.rpc(ann, 'leviathan_hit', { p_move: 'enchant', p_n: 1, p_enchant: jar });
    expect(h.label).toMatch(/landed again \(\+\d+\)/);
    const replayed = Number((await row(jar)).stats.replayed);
    expect(replayed).toBe(b.dmg);
    expect(h.dmg).toBeGreaterThanOrEqual(replayed);
    // a second Déjà Vu doesn't replay the first one
    const jar2 = await enchant(ann, 'dejavu');
    await db.sql(`delete from leviathan_hits where emoji <> '🫙'`);
    const h2 = await db.rpc(ann, 'leviathan_hit', { p_move: 'enchant', p_n: 1, p_enchant: jar2 });
    expect(h2.label).toMatch(/\(\+0\)/);
  });

  it('🫙 Preserved: the good its partner makes lasts ×1.5, the bad on it passes ×1.5 sooner', async () => {
    const ray = await enchant(ann, 'sizeray');
    await splice(ann, jar, ray);
    expect((await db.sql(`select private.ench_has_gene($1, 'preserved') k`, [ray]))[0].k).toBe(1);
    const v = await get(ann, ray);
    expect(v.traits.preserved).toMatchObject({ k: 1 });
    expect(Number(v.traits.preserved.x)).toBe(1.5);
    const { gx, gy } = await row(ray);
    const good = (await db.sql(`insert into enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at) values ($1, 'plot_giant', $2, $3, $4, 2, '{}'::jsonb, now() + interval '6 hours')
      returning extract(epoch from expires_at - created_at) s, data`, [ann, gx, gy, ray]))[0];
    expect(Math.round(Number(good.s) / 3600)).toBe(9);
    expect(good.data.preserved).toBe(1);
    // a prank (someone else's plot) is left alone
    const prank = (await db.sql(`insert into enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at) values ($1, 'plot_giant', 1, 1, $2, 2, '{"prank": true}'::jsonb, now() + interval '2 hours')
      returning extract(epoch from expires_at - created_at) s`, [ann, ray]))[0];
    expect(Math.round(Number(prank.s) / 3600)).toBe(2);
    const bad = (await db.sql(`insert into enchant_buffs (player_id, kind, gx, gy, mult, data, expires_at) values ($1, 'scorch', $2, $3, 0.8, '{}'::jsonb, now() + interval '90 minutes')
      returning extract(epoch from expires_at - created_at) s`, [ann, gx, gy]))[0];
    expect(Math.round(Number(bad.s) / 60)).toBe(60);
    const lev = (await db.sql(`select id from leviathans where status in ('walking', 'enraged', 'fleeing')`))[0].id;
    const tr = (await db.sql(`insert into leviathan_trampled (lev_id, gx, gy, owner_id, at, until) values ($1, $2, $3, $4, now(), now() + interval '3 hours')
      returning extract(epoch from until - at) s`, [lev, gx, gy, ann]))[0];
    expect(Math.round(Number(tr.s) / 3600)).toBe(2);
    expect((await row(ray)).stats).toMatchObject({ preserved_good: 1, preserved_bad: 2 });
    // other buffs, and plots with no Preserved enchantment, are untouched
    const plain = (await db.sql(`insert into enchant_buffs (player_id, kind, gx, gy, mult, data, expires_at) values ($1, 'scorch', 5, 5, 0.8, '{}'::jsonb, now() + interval '1 hour')
      returning extract(epoch from expires_at - created_at) s`, [ann]))[0];
    expect(Math.round(Number(plain.s) / 60)).toBe(60);
  });
});

describe('the rules around it', () => {
  it('a Mirror Shard never reflects a Déjà Vu', async () => {
    const def = (await db.sql(`select pg_get_functiondef('private.ench_act_shard(public.enchantments,text,jsonb,timestamptz)'::regprocedure) d`))[0].d as string;
    expect(def).toMatch(/'oracle', 'rod', 'dejavu', 'stormcoil'/);
  });
  it('a jar with moments in it can’t be poured into a star; an empty one can', async () => {
    const a = await enchant(ann, 'dejavu'), b = await enchant(ann, 'dejavu');
    await db.sql(`update enchantments set state = state || jsonb_build_object('jar', $2::jsonb) where id = $1`,
      [b, JSON.stringify([{ i: 1, t: 'star', src: 's', d: {}, at: Date.now() / 1000, s0: 1 }])]);
    await expectError(db.rpc(ann, 'enchant_merge', { p_target: a, p_copy: b }), 'copy_busy');
    await emptyJar(b);
    const r = await db.rpc(ann, 'enchant_merge', { p_target: a, p_copy: b });
    expect(r.result).toMatchObject({ stars: 1 });
  });
  it('a golden egg (Golden) makes every moment a day fresher', async () => {
    const j = await enchant(ann, 'dejavu');
    const at = Date.now() / 1000 - 3 * 86400;
    await db.sql(`update enchantments set state = state || jsonb_build_object('jar', $2::jsonb) where id = $1`, [j, JSON.stringify([{ i: 1, t: 'star', src: 's', d: {}, at, s0: 1 }])]);
    const e = await row(j);
    const r = (await db.sql(`select private.ench_refill(e, 1) r from enchantments e where id = $1`, [j]))[0].r;
    expect(r.what).toMatch(/a day fresher/);
    expect(Number(r.state.jar[0].at)).toBeCloseTo(at + 86400, 0);
    expect(e.kind).toBe('dejavu');
  });
  it('badges and titles come from what it does', async () => {
    const got = (await db.sql(`select achievement_key k from player_achievements where player_id = $1 and achievement_key like 'dv_%'`, [ann])).map((x: any) => x.k);
    expect(got).toEqual(expect.arrayContaining(['dv_first', 'dv_saved']));
  });
});
