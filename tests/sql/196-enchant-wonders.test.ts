// Enchantment wonders: the Size Ray on a plot you pick (giant / tiny / backfire / micro-gems / visits), every way to splice
// (Graft, Chimera, Trinity, a plot, a friend, Aberrations), the Wormhole and the Oracle Eye.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string, cat: string;
const O = { gx: 793_900, gy: 1_576_800 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `wo-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
async function enchant(uid: string, kind: string, dx: number, dy = 0) {
  await force(kind);
  const r = await claim(uid, dx, dy);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const skip = (id: string, secs: number) => db.sql(`update enchantments set clock_skip = clock_skip + $2 where id = $1`, [id, secs]);
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const mult = async (uid: string, gx: number, gy: number) => Number((await db.sql(`select private.ench_minigame_mult($1, $2, $3) m`, [uid, gx, gy]))[0].m);
const charges = (id: string, n: number) => db.sql(`update enchantments set state = state || jsonb_build_object('charges', $2::int, 'charge_at', extract(epoch from now())) where id = $1`, [id, n]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// fire at the needle's peak (0.82 s after the aim, by the server's clock — allowing for the round trip)
const peak = async (uid: string, id: string, target: Record<string, unknown>) => {
  const t0 = Date.now(); await act(uid, id, 'aim', { target }); const rtt = Date.now() - t0;
  await sleep(Math.max(0, 820 - rtt)); return act(uid, id, 'fire');
};

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('wo_owner'); ann = await db.newPlayer('wo_ann'); bob = await db.newPlayer('wo_bob'); cat = await db.newPlayer('wo_cat');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 200_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  for (let i = 0; i < 5; i++) { await claim(bob, 30 + i * 3, 8); await claim(cat, -30 - i * 3, -8); await claim(ann, 60 + i * 2, 20); }
});
afterAll(() => db.close());

describe('📡 Size Ray: a plot you own, grown or shrunk', () => {
  let ray: string; let plot: { gx: number; gy: number };
  it('GROW at the peak: a giant for hours, its minigames pay more, everyone sees it, visitors tip it', async () => {
    ray = await enchant(ann, 'sizeray', 0);
    await charges(ray, 3);
    await db.sql(`update enchantments set state = state || '{"shots": 3}' where id = $1`, [ray]);
    plot = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gx limit 1`, [ann]))[0];
    const f = await peak(ann, ray, { type: 'plot', gx: plot.gx, gy: plot.gy, mode: 'grow' });
    expect(f.result.mode).toBe('grow'); expect(['PERFECT', 'GREAT']).toContain(f.result.grade);
    expect(f.result.hours).toBeGreaterThanOrEqual(8);
    expect(await mult(ann, plot.gx, plot.gy)).toBeGreaterThanOrEqual(1.9);
    const m = await db.rpc(null, 'enchant_map', { p_min_gx: plot.gx - 50, p_min_gy: plot.gy - 50, p_max_gx: plot.gx + 50, p_max_gy: plot.gy + 50 });
    expect(m.sizes.find((s: any) => s.gx === plot.gx && s.gy === plot.gy)).toMatchObject({ mode: 'grow' });
    expect((await db.rpc(null, 'enchant_world')).giants.length).toBeGreaterThanOrEqual(1);
    const b0 = await ink(ann), c0 = await ink(cat);
    await db.rpc(cat, 'size_giant_visit', { p_gx: plot.gx, p_gy: plot.gy });
    expect(await ink(cat)).toBe(c0 + 2); expect(await ink(ann)).toBe(b0 + 4);
    await expectError(db.rpc(cat, 'size_giant_visit', { p_gx: plot.gx, p_gy: plot.gy }), 'already_visited');
    await expectError(db.rpc(ann, 'size_giant_visit', { p_gx: plot.gx, p_gy: plot.gy }), 'own_plot');
  });
  it('a parasite looking for a host goes for the giant', async () => {
    const hosts = await db.sql(`select private.ench_hosts($1, $2, $3, 1, 2000000) h`, [bob, plot.gx, plot.gy]);
    // (60% of the time the giant is picked first — over a few tries it always shows up)
    let seen = hosts[0].h.some((h: any) => h.giant);
    for (let i = 0; i < 12 && !seen; i++) seen = (await db.sql(`select private.ench_hosts($1, $2, $3, 1, 2000000) h`, [bob, plot.gx, plot.gy]))[0].h.some((h: any) => h.giant);
    expect(seen).toBe(true);
  });
  it('SHRINK: a speck — minigames pay less, Parasites and Cuckoos can’t find it, its enchantment’s time runs fast, micro-gems hide in it', async () => {
    const f = await peak(ann, ray, { type: 'plot', gx: plot.gx, gy: plot.gy, mode: 'shrink' });
    expect(f.result.mode).toBe('shrink');
    // the new zap replaced the giant
    expect((await db.sql(`select count(*)::int n from enchant_buffs where kind = 'plot_giant' and gx = $1 and gy = $2 and expires_at > now()`, [plot.gx, plot.gy]))[0].n).toBe(0);
    expect(await mult(ann, plot.gx, plot.gy)).toBeCloseTo(0.7, 5);
    for (let i = 0; i < 10; i++) {
      const h = (await db.sql(`select private.ench_hosts($1, $2, $3, 3, 400) h`, [bob, plot.gx, plot.gy]))[0].h;
      expect(h.some((x: any) => x.gx === plot.gx && x.gy === plot.gy)).toBe(false);
    }
    // the micro-gems: search the 5×5 dust
    const gems: number[] = (await db.sql(`select data -> 'gems' g from enchant_buffs where kind = 'plot_tiny' and gx = $1 and gy = $2 and expires_at > now()`, [plot.gx, plot.gy]))[0].g;
    const miss = [...Array(25).keys()].find((c) => !gems.includes(c))!;
    const r1 = await act(ann, ray, 'micro', { gx: plot.gx, gy: plot.gy, cell: miss });
    expect(r1.result.gem).toBe(false); expect(r1.result.near).toBeGreaterThan(0);
    const r2 = await act(ann, ray, 'micro', { gx: plot.gx, gy: plot.gy, cell: gems[0] });
    expect(r2.result.gem).toBe(true); expect(r2.result.pay.paid).toBeGreaterThan(0);
    await expectError(act(ann, ray, 'micro', { gx: plot.gx, gy: plot.gy, cell: gems[0] }), 'already_found');
    const v = r2.view.sizes.find((s: any) => s.gx === plot.gx);
    expect(v).toMatchObject({ mode: 'shrink', gems_left: 2, tries_left: 6 });
    await act(ann, ray, 'revert', { gx: plot.gx, gy: plot.gy });
    expect(await mult(ann, plot.gx, plot.gy)).toBe(1);
  });
  it('an enchantment on a tiny plot: its clock runs twice as fast', async () => {
    const goose = await enchant(bob, 'goose', 200, 8);
    const at = (await db.sql(`select gx, gy from enchantments where id = $1`, [goose]))[0];
    const r = await enchant(bob, 'sizeray', 204, 8);
    await peak(bob, r, { type: 'plot', gx: at.gx, gy: at.gy, mode: 'shrink' });
    await db.sql(`update enchant_buffs set created_at = now() - interval '1 hour' where kind = 'plot_tiny' and gx = $1 and gy = $2`, [at.gx, at.gy]);
    await db.sql(`update enchantments set born_at = now() - interval '2 hours' where id = $1`, [goose]);
    expect(Number((await db.sql(`select private.ench_tempo($1) t`, [goose]))[0].t)).toBeGreaterThanOrEqual(3590);
  });
  it('a total miss backfires: the opposite, for half an hour', async () => {
    const p2 = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gx desc limit 1`, [ann]))[0];
    await db.sql(`update enchantments set state = state || jsonb_build_object('shots', 3, 'shot_at', extract(epoch from now())) where id = $1`, [ray]);
    await act(ann, ray, 'aim', { target: { type: 'plot', gx: p2.gx, gy: p2.gy, mode: 'grow' } });
    const f = await act(ann, ray, 'fire');
    expect(f.result.grade).toBe('MISS'); expect(f.result.backfire).toBe(true);
    expect(f.result.mode).toBe('shrink'); expect(f.result.hours).toBe(0.5);
  });
  it('100×: a giant is a hundred plots across on the map, a tiny one a hundredth of one', async () => {
    const m = await db.rpc(null, 'enchant_map', { p_min_gx: plot.gx - 50, p_min_gy: plot.gy - 50, p_max_gx: plot.gx + 50, p_max_gy: plot.gy + 50 });
    for (const x of m.sizes) expect(Number(x.scale)).toBe(x.mode === 'grow' ? 100 : 0.01);
  });
});

describe('🤡 Size Ray pranks: any plot on the map, for show', () => {
  let ray: string; let target: { gx: number; gy: number };
  beforeAll(async () => {
    ray = await enchant(cat, 'sizeray', -300, -8);
    target = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gx limit 1`, [bob]))[0];
  });
  const full = () => db.sql(`update enchantments set state = state || jsonb_build_object('shots', 3, 'shot_at', extract(epoch from now())) where id = $1`, [ray]);
  it('zap someone else’s plot GIANT: everyone sees it, but nothing about their game changes', async () => {
    await full();
    const f = await peak(cat, ray, { type: 'plot', gx: target.gx, gy: target.gy, mode: 'grow' });
    expect(f.result).toMatchObject({ mode: 'grow', prank: true, owner_name: 'wo_bob' });
    expect(f.result.hours).toBeLessThanOrEqual(3);
    expect(await mult(bob, target.gx, target.gy)).toBe(1);
    const m = await db.rpc(bob, 'enchant_map', { p_min_gx: target.gx - 5, p_min_gy: target.gy - 5, p_max_gx: target.gx + 5, p_max_gy: target.gy + 5 });
    expect(m.sizes.find((x: any) => x.gx === target.gx && x.gy === target.gy)).toMatchObject({ mode: 'grow', prank: true, by_name: 'wo_cat', scale: 100 });
    // they're told who did it
    const n = await db.sql(`select data from player_notifications where player_id = $1 and data ->> 'sub' = 'size_prank' order by id desc limit 1`, [bob]);
    expect(n[0].data).toMatchObject({ mode: 'grow', gx: target.gx, gy: target.gy });
    // it's in the prankster's list (and they can call it off)
    const v = await db.rpc(cat, 'enchant_get', { p_id: ray });
    expect(v.view.sizes.find((x: any) => x.gx === target.gx)).toMatchObject({ prank: true, owner_name: 'wo_bob' });
    expect(v.view.pranks).toBe(1);
    // a prank giant can't pull in parasites (it's only for show)
    for (let i = 0; i < 6; i++) expect((await db.sql(`select private.ench_hosts($1, $2, $3, 1, 2000000) h`, [ann, target.gx, target.gy]))[0].h.some((h: any) => h.giant && h.gx === target.gx && h.gy === target.gy)).toBe(false);
  });
  it('one prank per player every 12 hours', async () => {
    const other = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gx desc limit 1`, [bob]))[0];
    await expectError(act(cat, ray, 'aim', { target: { type: 'plot', gx: other.gx, gy: other.gy, mode: 'shrink' } }), 'prank_cooldown');
  });
  it('the owner can undo it', async () => {
    const u = await db.rpc(bob, 'size_undo', { p_gx: target.gx, p_gy: target.gy });
    expect(u).toMatchObject({ undone: true, was_prank: true });
    await expectError(db.rpc(cat, 'size_undo', { p_gx: target.gx, p_gy: target.gy }), 'not_owner');
    await expectError(db.rpc(bob, 'size_undo', { p_gx: target.gx, p_gy: target.gy }), 'not_found');
  });
  it('a prank shrink: a speck on the map, but no fast time, no micro-gems, and it never hides them', async () => {
    await db.sql(`delete from enchant_buffs where (data ->> 'by') = $1`, [cat]);
    await full();
    const goose = await enchant(ann, 'goose', 240, 30);
    const at = (await db.sql(`select gx, gy from enchantments where id = $1`, [goose]))[0];
    await db.sql(`update enchantments set born_at = now() - interval '2 hours' where id = $1`, [goose]);
    const f = await peak(cat, ray, { type: 'plot', gx: at.gx, gy: at.gy, mode: 'shrink' });
    expect(f.result).toMatchObject({ mode: 'shrink', prank: true });
    await db.sql(`update enchant_buffs set created_at = now() - interval '1 hour' where kind = 'plot_tiny' and gx = $1 and gy = $2`, [at.gx, at.gy]);
    expect(Number((await db.sql(`select private.ench_tempo($1) t`, [goose]))[0].t)).toBeLessThan(5);
    expect(await mult(ann, at.gx, at.gy)).toBe(1);
    expect((await db.sql(`select data -> 'gems' g from enchant_buffs where kind = 'plot_tiny' and gx = $1 and gy = $2 and expires_at > now()`, [at.gx, at.gy]))[0].g).toEqual([]);
    // the prankster calls it off from their Size Ray
    await act(cat, ray, 'revert', { gx: at.gx, gy: at.gy });
    expect((await db.sql(`select count(*)::int n from enchant_buffs where kind = 'plot_tiny' and gx = $1 and gy = $2 and expires_at > now()`, [at.gx, at.gy]))[0].n).toBe(0);
  });
  it('a prank never replaces the owner’s own zap, never lands on a blocker, and an empty plot can’t be zapped', async () => {
    await db.sql(`delete from enchant_buffs where (data ->> 'by') = $1`, [cat]);
    const annRay = await enchant(ann, 'sizeray', 260, 30);
    await db.sql(`update enchantments set state = state || jsonb_build_object('shots', 3, 'shot_at', extract(epoch from now())) where id = $1`, [annRay]);
    const mine = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gy, gx limit 1`, [ann]))[0];
    await peak(ann, annRay, { type: 'plot', gx: mine.gx, gy: mine.gy, mode: 'grow' });
    await expectError(act(cat, ray, 'aim', { target: { type: 'plot', gx: mine.gx, gy: mine.gy, mode: 'shrink' } }), 'already_sized');
    await db.sql(`insert into player_blocks (blocker_id, blocked_id) values ($1, $2)`, [ann, cat]);
    const another = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gy desc, gx desc limit 1`, [ann]))[0];
    await expectError(act(cat, ray, 'aim', { target: { type: 'plot', gx: another.gx, gy: another.gy, mode: 'grow' } }), 'blocked');
    await db.sql(`delete from player_blocks where blocker_id = $1 and blocked_id = $2`, [ann, cat]);
    await expectError(act(cat, ray, 'aim', { target: { type: 'plot', gx: O.gx + 5000, gy: O.gy + 5000, mode: 'grow' } }), 'not_claimed');
  });
  it('a prank that misses bounces straight back onto your own plot', async () => {
    await db.sql(`delete from enchant_buffs where (data ->> 'by') = $1`, [cat]);
    await full();
    const t2 = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gx desc limit 1`, [bob]))[0];
    await act(cat, ray, 'aim', { target: { type: 'plot', gx: t2.gx, gy: t2.gy, mode: 'grow' } });
    const f = await act(cat, ray, 'fire');
    expect(f.result).toMatchObject({ grade: 'MISS', bounced: true, prank: false, mode: 'grow', hours: 0.5 });
    const home = (await db.sql(`select gx, gy from enchantments where id = $1`, [ray]))[0];
    expect(f.result).toMatchObject({ gx: home.gx, gy: home.gy });
    expect((await db.sql(`select count(*)::int n from enchant_buffs where kind = 'plot_giant' and gx = $1 and gy = $2 and expires_at > now()`, [t2.gx, t2.gy]))[0].n).toBe(0);
  });
});

describe('🧪 Splice: Graft, Chimera, Trinity, a plot, a friend — and Aberrations', () => {
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    ids.splice = await enchant(ann, 'splice', 100);
    ids.goose = await enchant(ann, 'goose', 104); ids.ray = await enchant(ann, 'sizeray', 108); ids.genie = await enchant(ann, 'genie', 112);
    ids.clock = await enchant(ann, 'clockwork', 116); ids.shard = await enchant(ann, 'shard', 120);
    await db.sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}' where key = 'enchantments'`);
  });
  const end = () => act(ann, ids.splice, 'unsplice');
  it('Graft: one-way, double strength — the donor sleeps', async () => {
    await charges(ids.splice, 2);
    const s = await act(ann, ids.splice, 'splice', { mode: 'graft', a: ids.goose, b: ids.genie });
    expect(s.result).toMatchObject({ mode: 'graft', hours: 12 });
    const host = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    expect(host.partners).toHaveLength(1); expect(host.partners[0]).toMatchObject({ kind: 'genie', gene: 'wish', strength: 2, mode: 'graft' });
    const donor = await db.rpc(ann, 'enchant_get', { p_id: ids.genie });
    expect(donor.partners).toHaveLength(0); expect(donor.clock.frozen_until).toBeTruthy();
    expect(s.view.active).toMatchObject({ mode: 'graft' }); expect(s.view.active.members[0].id).toBe(ids.goose);
    await end();
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.genie })).clock.frozen_until).toBeFalsy();
  });
  it('Chimera: both traits doubled, and a roar every 3 hours', async () => {
    await charges(ids.splice, 2);
    const s = await act(ann, ids.splice, 'splice', { mode: 'chimera', a: ids.goose, b: ids.shard });
    expect(s.result.mode).toBe('chimera'); expect(s.result.unstable).toBe(false);
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.shard })).partners[0]).toMatchObject({ gene: 'golden', strength: 2 });
    const r = await act(ann, ids.splice, 'roar');
    expect(r.result.pay.paid).toBeGreaterThan(0);
    await expectError(act(ann, ids.splice, 'roar'), 'too_soon');
    await end();
  });
  it('a Chimera can be unstable: it rejects in 1–4 hours', async () => {
    await db.sql(`update game_config set value = jsonb_set(value, '{splice,unstable}', '1') where key = 'enchantments'`);
    await charges(ids.splice, 2);
    const s = await act(ann, ids.splice, 'splice', { mode: 'chimera', a: ids.goose, b: ids.shard });
    expect(s.result.unstable).toBe(true); expect(s.result.hours).toBeLessThanOrEqual(4);
    await db.sql(`update game_config set value = jsonb_set(value, '{splice,unstable}', '0') where key = 'enchantments'`);
    await end();
  });
  it('Trinity: three at once, for two charges; each wears both other traits', async () => {
    await charges(ids.splice, 1);
    await expectError(act(ann, ids.splice, 'splice', { mode: 'trinity', a: ids.goose, b: ids.ray, c: ids.clock }), 'no_charges');
    await charges(ids.splice, 2);
    const s = await act(ann, ids.splice, 'splice', { mode: 'trinity', a: ids.goose, b: ids.ray, c: ids.clock });
    expect(s.result.hybrid).toBe('The Ticking Golden Titan');
    expect(s.view.charges).toBe(0); expect(s.view.trinities).toContain('clockwork+goose+sizeray');
    const g = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    expect(g.partners.map((p: any) => p.gene).sort()).toEqual(['grow', 'tempo']);
    // the Perfect Match pair (Goose + Size Ray) is still doubled inside a Trinity
    expect(g.partners.find((p: any) => p.gene === 'grow').strength).toBe(2);
    expect(s.view.active.members).toHaveLength(3);
    // any one of them can step out — the whole Trinity ends
    await act(ann, ids.clock, 'separate');
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.goose })).partners).toHaveLength(0);
  });
  it('splice with one of your plots: the plot wears the trait in its minigames, the enchantment wears the plot’s', async () => {
    await charges(ids.splice, 2);
    const plot = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gx limit 1 offset 2`, [ann]))[0];
    const before = await mult(ann, plot.gx, plot.gy);
    const s = await act(ann, ids.splice, 'splice', { mode: 'plot', a: ids.goose, gx: plot.gx, gy: plot.gy });
    expect(s.result).toMatchObject({ mode: 'plot', hybrid: 'Golden Canvas', trait: 'inspired' });
    expect(await mult(ann, plot.gx, plot.gy)).toBeCloseTo(before * 1.5, 5);
    const g = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    expect(g.partners[0]).toMatchObject({ kind: 'plot', gene: 'inspired', plot_kind: 'canvas' });
    await skip(ids.goose, 3 * 3600);
    const c = await act(ann, ids.goose, 'collect');
    expect(c.result.pay.mods.some((m: any) => /Inspired/.test(m.label))).toBe(true);
    await end();
  });
  it('splice with a friend: they say yes, and both enchantments wear each other’s trait (a no gives the charge back)', async () => {
    const theirs = await enchant(bob, 'map', 140, 8);
    await charges(ids.splice, 1);
    await expectError(act(ann, ids.splice, 'splice', { mode: 'friend', a: ids.ray, b: theirs }), 'not_friends');
    await db.sql(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [ann, bob]);
    const opts = await db.rpc(ann, 'splice_friends');
    expect(opts[0].enchantments.some((x: any) => x.id === theirs)).toBe(true);
    const inv = await act(ann, ids.splice, 'splice', { mode: 'friend', a: ids.ray, b: theirs });
    expect(inv.result.invited).toBe(true); expect(inv.view.invite).toBeTruthy(); expect(inv.view.charges).toBe(0);
    const mine = await db.rpc(bob, 'splice_invites');
    expect(mine[0]).toMatchObject({ hybrid: 'Atlas Map' });
    await db.rpc(bob, 'splice_invite_respond', { p_id: mine[0].id, p_accept: false });
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.splice })).view.charges).toBe(1);
    const inv2 = await act(ann, ids.splice, 'splice', { mode: 'friend', a: ids.ray, b: theirs });
    const ok = await db.rpc(bob, 'splice_invite_respond', { p_id: inv2.result.invite, p_accept: true });
    expect(ok.accepted).toBe(true);
    expect((await db.rpc(bob, 'enchant_get', { p_id: theirs })).partners[0]).toMatchObject({ gene: 'grow', mode: 'friend' });
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.ray })).partners[0]).toMatchObject({ gene: 'seek' });
    // either of them can step out
    await act(bob, theirs, 'separate');
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.ray })).partners).toHaveLength(0);
  });
  it('~5% of splices mutate into a secret Aberration: traits tripled, a secret of its own, a new page in the Codex', async () => {
    await db.sql(`update game_config set value = jsonb_set(value, '{splice,aberration}', '1') where key = 'enchantments'`);
    await charges(ids.splice, 1);
    const s = await act(ann, ids.splice, 'splice', { mode: 'swap', a: ids.goose, b: ids.ray });
    expect(s.result.aberration).toBeTruthy();
    expect(s.view.aberrations).toContain(s.result.aberration);
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.goose })).partners[0]).toMatchObject({ strength: 3, aberration: s.result.aberration });
    const b = await db.rpc(ann, 'enchant_bestiary');
    expect(b.aberrations).toContain(s.result.aberration); expect(b.aberrations_total).toBe(6);
    await db.sql(`update game_config set value = jsonb_set(value, '{splice,aberration}', '0') where key = 'enchantments'`);
    await end();
  });
});

describe('🌀 Wormhole', () => {
  let w: string; let far: { gx: number; gy: number }; let home: { gx: number; gy: number };
  it('trace the spiral, then link another plot (100 miles at first): both ends pay 30% more', async () => {
    w = await enchant(cat, 'wormhole', -100, -8);
    home = (await db.sql(`select gx, gy from enchantments where id = $1`, [w]))[0];
    far = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gx limit 1`, [cat]))[0];
    await expectError(act(cat, w, 'open', { gx: far.gx, gy: far.gy, smooth: 1 }), 'trace_first');
    await act(cat, w, 'trace');
    await sleep(600);
    const o = await act(cat, w, 'open', { gx: far.gx, gy: far.gy, smooth: 0.9 });
    expect(o.result.hours).toBeGreaterThanOrEqual(14); expect(o.view.open).toBeTruthy(); expect(o.view.ends).toHaveLength(2);
    expect(await mult(cat, far.gx, far.gy)).toBeCloseTo(1.3, 5);
    expect(await mult(cat, home.gx, home.gy)).toBeCloseTo(1.3, 5);
    const m = await db.rpc(null, 'enchant_map', { p_min_gx: home.gx - 200, p_min_gy: home.gy - 200, p_max_gx: home.gx + 200, p_max_gy: home.gy + 200 });
    expect(m.wormholes.some((x: any) => x.id === w)).toBe(true);
    await expectError(act(cat, w, 'open', { gx: far.gx, gy: far.gy }), 'already_open');
  });
  it('a Size Ray effect at one end reaches the other', async () => {
    const r = await enchant(cat, 'sizeray', -150, -8);
    await peak(cat, r, { type: 'plot', gx: far.gx, gy: far.gy, mode: 'grow' });
    const s = (await db.sql(`select private.plot_size($1, $2) s`, [home.gx, home.gy]))[0].s;
    expect(s).toMatchObject({ mode: 'grow', linked: true });
  });
  it('something shoots out of the far end every few hours — catch it before it’s gone', async () => {
    const st = (await db.sql(`select state from enchantments where id = $1`, [w]))[0].state;
    const d = (await db.sql(`select private.wormhole_drop($1, $2, 1) d`, [(await db.sql(`select sigil from enchantments where id = $1`, [w]))[0].sigil, st.open.from_c]))[0].d;
    const now = Number((await db.sql(`select private.ench_ep(private.ench_now(e)) t from enchantments e where id = $1`, [w]))[0].t);
    await skip(w, Number(d.at) - now + 30);
    const v = await db.rpc(cat, 'enchant_get', { p_id: w });
    expect(v.view.drop).toMatchObject({ k: 1 }); expect(v.attention).toMatch(/coming through/);
    const c = await act(cat, w, 'catch', { k: 1 });
    expect(c.result.caught).toBe(d.type);
    await expectError(act(cat, w, 'catch', { k: 1 }), 'already_caught');
  });
  it('too far for a young wormhole; close it early; it needs a day to recharge', async () => {
    await act(cat, w, 'close');
    expect(await mult(cat, home.gx, home.gy)).toBe(1);
    await db.sql(`update enchantments set state = state || '{"next_open_at": 0}' where id = $1`, [w]);
    await db.rpc(cat, 'acquire_plot', { p_gx: O.gx + 900_000, p_gy: O.gy, p_idempotency_key: 'wo-far-plot-0000' });
    await act(cat, w, 'trace'); await sleep(400);
    await expectError(act(cat, w, 'open', { gx: O.gx + 900_000, gy: O.gy }), 'too_far');
    await db.sql(`update enchantments set level = 5 where id = $1`, [w]);
    await act(cat, w, 'trace'); await sleep(400);
    const o = await act(cat, w, 'open', { gx: O.gx + 900_000, gy: O.gy });
    expect(o.result.open.km).toBeGreaterThan(1000);
    await act(cat, w, 'close');
    await act(cat, w, 'trace'); await sleep(400);
    await expectError(act(cat, w, 'open', { gx: far.gx, gy: far.gy }), 'too_soon');
  });
});

describe('👁️ Oracle Eye', () => {
  let eye: string;
  it('gaze at your next rolls: 3 cards, and the next roll comes out exactly as shown', async () => {
    eye = await enchant(bob, 'oracle', 300, 8);
    await db.sql(`update game_config set value = value || '{"base_pct": 0}' where key = 'enchantments'`);
    const g = await act(bob, eye, 'gaze', { what: 'roll' });
    expect(g.view.cards.list).toHaveLength(3); expect(g.view.charges).toBe(0);
    await expectError(act(bob, eye, 'gaze', { what: 'roll' }), 'no_charges');
    const first = g.view.cards.list[0].rarity;
    const r = await claim(bob, 310, 8);
    expect(r.rarity).toBe(first); expect(r.foretold).toBe(true);
    const v = await db.rpc(bob, 'enchant_get', { p_id: eye });
    expect(v.view.cards.list[0].done).toBe(true); expect(v.view.queued.roll).toBe(2);
  });
  it('rewrite: swap two cards (fate obeys the new order) or burn one for a fresh draw', async () => {
    // make the last card a Legendary (in fate and on the table), then swap it to the front of the line
    await db.sql(`update private.oracle_fates set outcome = '{"rarity": "legendary"}' where id = (select id from private.oracle_fates where player_id = $1 and what = 'roll' order by id desc limit 1)`, [bob]);
    await db.sql(`update enchantments set state = jsonb_set(state, '{cards,list,2,rarity}', '"legendary"') where id = $1`, [eye]);
    const before = await db.rpc(bob, 'enchant_get', { p_id: eye });
    const s = await act(bob, eye, 'swap', { i: 1, j: 2 });
    expect(s.view.cards.list[1].rarity).toBe('legendary');
    expect(s.view.cards.rewrites).toBe(0);
    await expectError(act(bob, eye, 'burn', { i: 1 }), 'no_rewrites');
    const r = await claim(bob, 314, 8);
    expect(r.rarity).toBe('legendary');
    expect(before.view.cards.list).toHaveLength(3);
  });
  it('minigame fortunes come true too (the Eye opens them at level 3)', async () => {
    await db.sql(`update enchantments set level = 3, state = state || jsonb_build_object('charges', 1, 'charge_at', extract(epoch from now())) where id = $1`, [eye]);
    const g = await act(bob, eye, 'gaze', { what: 'reward' });
    const plot = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' order by gx limit 1`, [bob]))[0];
    expect(await mult(bob, plot.gx, plot.gy)).toBeCloseTo(Number(g.view.cards.list[0].mult), 5);
  });
  it('locked until a higher level: Pandora’s lid and the Goose’s eggs', async () => {
    await db.sql(`update enchantments set state = state || jsonb_build_object('charges', 1, 'charge_at', extract(epoch from now())) where id = $1`, [eye]);
    await expectError(act(bob, eye, 'gaze', { what: 'pandora' }), 'oracle_locked');
  });
  it('Pandora’s next lid, foreseen: what each number of notches would let out — and it does', async () => {
    await db.sql(`delete from private.oracle_fates where player_id = $1`, [bob]);
    const box = await enchant(bob, 'pandora', 320, 8);
    await db.sql(`update enchantments set level = 5 where id = $1`, [eye]);
    const g = await act(bob, eye, 'gaze', { what: 'pandora', target: box });
    expect(g.view.cards.list.map((c: any) => c.notches)).toEqual([1, 2, 3]);
    const seen = g.view.cards.list[2].slots.map((s: any) => s.type === 'evil' ? `evil:${s.evil}` : s.type);
    const pv = await db.rpc(bob, 'enchant_get', { p_id: box });
    expect(pv.view.foreseen['3'].map((s: any) => s.type === 'evil' ? `evil:${s.evil}` : s.type)).toEqual(seen);
    const o = await act(bob, box, 'open', { notches: 3 });
    expect(o.result.foretold).toBe(true);
    expect(o.result.out.slice(0, 3).map((s: any) => s.type === 'evil' ? `evil:${s.evil}` : s.type)).toEqual(seen);
  });
  it('the Goose’s eggs: which ones will be Platinum — and burning one draws again', async () => {
    const goose = await enchant(bob, 'goose', 324, 8);
    await db.sql(`update enchantments set state = state || jsonb_build_object('charges', 1, 'charge_at', extract(epoch from now())) where id = $1`, [eye]);
    const g = await act(bob, eye, 'gaze', { what: 'egg', target: goose });
    expect(g.view.cards.list).toHaveLength(3);
    // fate fixed the eggs; force the first one Platinum to see the goose obey
    await db.sql(`update enchantments set state = jsonb_set(state, '{fate_plat,0}', 'true') where id = $1`, [goose]);
    await skip(goose, 2 * 3600);
    const c = await act(bob, goose, 'collect');
    expect(c.result.egg.platinum).toBe(true);
  });
  it('seal a prophecy about a friend’s next roll: when it comes true, you both get Ink', async () => {
    const f = await act(bob, eye, 'foretell', { username: 'wo_cat' });
    expect(f.result.sealed).toBe(true);
    await expectError(act(bob, eye, 'foretell', { username: 'wo_cat' }), 'too_soon');
    const b0 = await ink(bob);
    const r = await claim(cat, -400, -8);
    expect(r.rarity).toBe(f.result.outcome.rarity === 'enchanted' ? 'enchanted' : f.result.outcome.rarity);
    // (10 Ink, paced by Ink Flow like all enchantment Ink)
    const got = (await ink(bob)) - b0;
    expect(got).toBeGreaterThan(0); expect(got).toBeLessThanOrEqual(10);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'prophecy_true'`, [bob]))[0].n).toBe(1);
  });
  it('Djinn of Fate (Genie + Oracle): the Forbidden Wish’s outcome shows before you make it', async () => {
    const sp = await enchant(bob, 'splice', 330, 8);
    const genie = await enchant(bob, 'genie', 334, 8);
    const eye2 = await enchant(bob, 'oracle', 338, 8);
    const s = await act(bob, sp, 'splice', { a: genie, b: eye2 });
    expect(s.result).toMatchObject({ hybrid: 'Djinn of Fate', perfect: true });
    const v = await db.rpc(bob, 'enchant_get', { p_id: genie });
    expect(['granted', 'twisted', 'freed']).toContain(v.view.foreseen);
  });
});
