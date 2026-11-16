// Enchantments, part 6: the Cuckoo leaves (an egg that hatches into a new kind), and three arrive — the 🔭 Spyglass
// (private readings of unclaimed plots), the 🦢 Origami Pocket (fold a plot up, unfold it somewhere else) and the
// 🔥 Crucible (melt plots into Heat and metal, strike one up a tier, runes, artifacts, inlays, monuments).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, cat: string;
const O = { gx: 812_300, gy: 1_571_900 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `gff-${++k}-00000000` });
const claim = (uid: string, dx: number, dy = 0) => claimAt(uid, O.gx + dx, O.gy + dy);
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const dy = uid === ann ? 0 : uid === bob ? 60 : 120;
  const r = await claim(uid, (spot++) * 3, dy);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const plot = async (gx: number, gy: number) => (await db.sql(`select * from world_plots where gx = $1 and gy = $2`, [gx, gy]))[0];
const setStars = (id: string, n: number) => db.sql(`update enchantments set stars = $2 where id = $1`, [id, n]);
const cfg = (o: Record<string, unknown>) => db.sql(`update game_config set value = value || $1::jsonb where key = 'enchantments'`, [JSON.stringify(o)]);
const old = (gx: number, gy: number) => db.sql(`update world_plots set claimed_at = now() - interval '3 days' where gx = $1 and gy = $2`, [gx, gy]);
let free = 0;
/** an unclaimed cell near Ann's land that nothing has touched */
const freeCell = () => ({ gx: O.gx + 300 + (free++) * 2, gy: O.gy + 7 });

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('gff_ann'); bob = await db.newPlayer('gff_bob'); cat = await db.newPlayer('gff_cat');
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 900_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}'::jsonb where key = 'enchantments'`);
  // a few plots of Ann's own around the spot, so the Spyglass has somewhere to look from
  for (let i = 0; i < 4; i++) await claim(ann, 200 + i * 2, 0);
});
afterAll(() => db.close());

describe('🥚 the Cuckoo is gone', () => {
  it('is out of the roster: never rolled, no hybrids, no Star powers, no Leviathan move', async () => {
    const ks = (await db.sql(`select private.ench_kinds() k`))[0].k;
    expect(ks).not.toContain('cuckoo');
    expect(ks).toEqual(expect.arrayContaining(['spyglass', 'origami', 'crucible', 'sun', 'rod']));
    const h = (await db.sql(`select private.ench_hybrids() h, private.ench_hybrid_count() n`))[0];
    expect(Object.keys(h.h).some((x) => x.includes('cuckoo'))).toBe(false);
    expect(h.n).toBe(Object.keys(h.h).length);
    expect((await db.sql(`select private.ench_hybrid('map', 'spyglass') h`))[0].h).toEqual(['Pirate’s Glass', true]);
    expect((await db.sql(`select private.ench_hybrid('wormhole', 'origami') h`))[0].h).toEqual(['Paper Portal', true]);
    expect((await db.sql(`select private.ench_star_powers('cuckoo') p`))[0].p).toEqual([]);
    expect((await db.sql(`select private.lev_move('cuckoo') m`))[0].m).toBeNull();
    const w = (await db.sql(`select value -> 'weights' w from game_config where key = 'enchantments'`))[0].w;
    expect(w).not.toHaveProperty('cuckoo');
    expect(w).toMatchObject({ spyglass: 1, origami: 1, crucible: 1 });
  });

  it('a Cuckoo that was out is an egg: it hatches into the new kind its owner picks, keeping its level and stars', async () => {
    const id = await enchant(ann, 'cuckoo');
    await db.sql(`update enchantments set level = 4, xp = 60, stars = 1, nickname = 'Pip', titles = array['Brood Mother'] where id = $1`, [id]);
    const v = await get(ann, id);
    expect(v.view).toMatchObject({ egg: true, choices: expect.arrayContaining(['spyglass', 'origami', 'crucible']) });
    expect(v.attention).toMatch(/egg/);
    await expectError(act(ann, id, 'scout'), 'hatch_first');
    await expectError(act(ann, id, 'hatch', { kind: 'goose' }), 'bad_kind');
    const serials = Number((await db.sql(`select coalesce((select n from private.enchant_serials where kind = 'origami'), 0) n`))[0].n);
    const r = await act(ann, id, 'hatch', { kind: 'origami' });
    expect(r.result).toMatchObject({ hatched: 'origami', serial: serials + 1 });
    expect(r).toMatchObject({ kind: 'origami', level: 4, stars: 1, nickname: 'Pip' });
    expect(r.view).toHaveProperty('folds');
    const e = await row(id);
    expect(e.titles).not.toContain('Brood Mother');
    expect(e.stats.hatched_from).toBe('cuckoo');
    expect((await db.sql(`select count(*)::int n from feed_events where player_id = $1 and data ->> 'sub' = 'hatched_into'`, [ann]))[0].n).toBe(1);
  });

  it('an egg can’t be spliced, poured or sent at the Leviathan', async () => {
    const egg = await enchant(ann, 'cuckoo');
    const sp = await enchant(ann, 'splice');
    const g = await enchant(ann, 'goose');
    await expectError(act(ann, sp, 'splice', { mode: 'swap', a: egg, b: g }), 'bad_target');
    await expectError(db.rpc(ann, 'enchant_merge', { p_target: g, p_copy: egg }), 'hatch_first');
    await act(ann, egg, 'hatch', { kind: 'crucible' });
  });

  it('Trickster is now Tempered, the Crucible’s Trait (it still dodges bad luck)', async () => {
    expect((await db.sql(`select private.ench_info('crucible') i`))[0].i).toMatchObject({ gene: 'trick', gene_name: 'Tempered', emoji: '🔥' });
    expect((await db.sql(`select private.ench_info('cuckoo') i`))[0].i).toMatchObject({ name: 'Cuckoo Egg', gene: null });
  });
});

describe('🔭 Spyglass', () => {
  let glass: string;
  beforeAll(async () => { glass = await enchant(ann, 'spyglass'); });

  it('3 looks; each one a private reading of an unclaimed plot, kept on the server', async () => {
    const v = await get(ann, glass);
    expect(v.view).toMatchObject({ looks: 3, max: 3, range_m: 1000, sightings: [] });
    const c = freeCell();
    const r = await act(ann, glass, 'look', c);
    expect(r.result.sighting).toMatchObject({ gx: c.gx, gy: c.gy, used: false });
    expect(r.result.sighting.rarity).toBeTruthy();
    expect(r.view.looks).toBe(2);
    expect(r.view.sightings).toHaveLength(1);
    // the same cell twice: no
    await expectError(act(ann, glass, 'look', c), 'already_sighted');
    // the reading can't be seen by anyone else: not on their map, not in the table
    const m = await db.rpc(bob, 'enchant_map3', { p_min_gx: c.gx - 10, p_min_gy: c.gy - 10, p_max_gx: c.gx + 10, p_max_gy: c.gy + 10 });
    expect(m.sightings).toEqual([]);
    const mine = await db.rpc(ann, 'enchant_map3', { p_min_gx: c.gx - 10, p_min_gy: c.gy - 10, p_max_gx: c.gx + 10, p_max_gy: c.gy + 10 });
    expect(mine.sightings).toHaveLength(1);
    await expectError(db.rpc(bob, 'enchant_get', { p_id: glass }).then((x: any) => { if (x.view) throw new Error('leaked'); throw new Error('ok_hidden'); }), 'ok_hidden');
  });

  it('claiming a sighted plot within a day: the reading is your roll, and the glass is paid', async () => {
    const c = freeCell();
    // make the reading something you can tell apart from the cell's own roll
    const r = await act(ann, glass, 'look', c);
    const nat = (await db.sql(`select private.plot_rarity_for($1, $2) r`, [c.gx, c.gy]))[0].r;
    const want = nat === 'legendary' ? 'epic' : 'legendary';
    await db.sql(`update private.spy_sightings set rarity = $2, kind = null where id = $1`, [r.result.sighting.id, want]);
    const ink0 = Number((await row(glass)).stats.ink ?? 0);
    const cl = await claimAt(ann, c.gx, c.gy);
    expect(cl).toMatchObject({ rarity: want, sighted: true });
    expect((await plot(c.gx, c.gy)).rarity).toBe(want);
    const e = await row(glass);
    expect(Number(e.stats.ink)).toBeGreaterThan(ink0);
    expect(e.stats.claimed).toBe(1);
    expect((await db.sql(`select used_at is not null u from private.spy_sightings where id = $1`, [r.result.sighting.id]))[0].u).toBe(true);
  });

  it('a sighting can show an Enchanted plot — and claiming it hatches that enchantment', async () => {
    await db.sql(`update enchantments set state = state || '{"looks": 3}'::jsonb where id = $1`, [glass]);
    const c = freeCell();
    const r = await act(ann, glass, 'look', c);
    await db.sql(`update private.spy_sightings set rarity = 'enchanted', kind = 'genie' where id = $1`, [r.result.sighting.id]);
    const cl = await claimAt(ann, c.gx, c.gy);
    expect(cl).toMatchObject({ rarity: 'enchanted', sighted: true });
    expect(cl.enchant).toMatchObject({ kind: 'genie' });
  });

  it('someone else claims your sighted plot first: they get their own roll, and your look comes back', async () => {
    await db.sql(`update enchantments set state = state || '{"looks": 3}'::jsonb where id = $1`, [glass]);
    const c = freeCell();
    const r = await act(ann, glass, 'look', c);
    await db.sql(`update private.spy_sightings set rarity = 'mythic' where id = $1`, [r.result.sighting.id]);
    expect(r.view.looks).toBe(2);
    const cl = await claimAt(bob, c.gx, c.gy);
    expect(cl.sighted).toBe(false);
    expect(cl.rarity).not.toBe('enchanted');
    expect(cl.rarity).toBe((await db.sql(`select private.plot_rarity_for($1, $2) r`, [c.gx, c.gy]))[0].r);
    const v = await get(ann, glass);
    expect(v.view.looks).toBe(3);
    expect(v.view.sightings.find((s: any) => s.gx === c.gx)).toBeUndefined();
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'spy_refund'`, [ann]))[0].n).toBe(1);
  });

  it('only near your explorer or your plots, only unclaimed, only with a look left', async () => {
    await expectError(act(ann, glass, 'look', { gx: O.gx + 200_000, gy: O.gy }), 'out_of_range');
    const mine = (await db.sql(`select gx, gy from world_plots where owner_id = $1 limit 1`, [ann]))[0];
    await expectError(act(ann, glass, 'look', mine), 'plot_taken');
    await db.sql(`update enchantments set state = state || jsonb_build_object('looks', 0, 'look_at', extract(epoch from now())) where id = $1`, [glass]);
    await expectError(act(ann, glass, 'look', freeCell()), 'no_looks');
    // they come back with time (8 h each)
    await db.sql(`update enchantments set state = state || jsonb_build_object('looks', 0, 'look_at', extract(epoch from now()) - 9 * 3600) where id = $1`, [glass]);
    expect((await get(ann, glass)).view.looks).toBe(1);
  });

  it('a reading never shows a Crown; a Crown cell stays a Crown', async () => {
    const r = await db.sql(`select count(*) filter (where (private.spy_roll(1, 1) ->> 'rarity') like 'crown%')::int n from generate_series(1, 400)`);
    expect(r[0].n).toBe(0);
  });

  it('★1 four looks, ★2 three times the reach, ★3 a second reading that keeps the better one', async () => {
    await setStars(glass, 3);
    await db.sql(`update enchantments set state = state || '{"looks": 4}'::jsonb where id = $1`, [glass]);
    const v = await get(ann, glass);
    expect(v.view).toMatchObject({ max: 4, range_m: 3000, second_ready: true });
    const c = freeCell();
    const r = await act(ann, glass, 'look', c);
    await db.sql(`update private.spy_sightings set rarity = 'common' where id = $1`, [r.result.sighting.id]);
    const s = await act(ann, glass, 'second', { id: r.result.sighting.id });
    expect(s.result).toHaveProperty('drew');
    expect(s.result.sighting.second).toBe(true);
    expect(s.result.sighting.rarity).toBe(s.result.better ? s.result.drew.rarity : 'common');
    await expectError(act(ann, glass, 'second', { id: r.result.sighting.id }), 'already_today');
    await setStars(glass, 0);
  });
});

describe('🦢 Origami Pocket', () => {
  let ori: string; let home: { gx: number; gy: number };
  beforeAll(async () => {
    ori = await enchant(ann, 'origami');
    const r = await claim(ann, 400, 0);
    home = { gx: r.gx, gy: r.gy };
    await db.sql(`update world_plots set rarity = 'epic', level = 3, name = 'Paper Home', shiny = true where gx = $1 and gy = $2`, [home.gx, home.gy]);
    await db.sql(`insert into plot_game_progress (gx, gy, player_id, game, highest_level, best_score, plays, wins) values ($1, $2, $3, 'pigment', 4, 900, 5, 4)`, [home.gx, home.gy, ann]).catch(async () => {
      await db.sql(`insert into plot_game_progress (gx, gy, player_id, game, highest_level) values ($1, $2, $3, 'pigment', 4)`, [home.gx, home.gy, ann]);
    });
  });

  it('folds a plot into the pocket: still yours (still earning), shown as paper on the map', async () => {
    const v = await get(ann, ori);
    expect(v.view).toMatchObject({ folds: 1, pocket_max: 1, pocket: 0 });
    expect(v.view.plots.some((p: any) => p.gx === home.gx && p.gy === home.gy)).toBe(true);
    const r = await act(ann, ori, 'fold', home);
    expect(r.result.folded).toMatchObject({ gx: home.gx, rarity: 'epic', name: 'Paper Home' });
    const p = await plot(home.gx, home.gy);
    expect(p.owner_id).toBe(ann);
    expect(p.folded_at).not.toBeNull();
    expect(r.view.pocket_plots).toHaveLength(1);
    const m = await db.rpc(bob, 'enchant_map3', { p_min_gx: home.gx - 5, p_min_gy: home.gy - 5, p_max_gx: home.gx + 5, p_max_gy: home.gy + 5 });
    expect(m.folds).toEqual([expect.objectContaining({ gx: home.gx, gy: home.gy, mine: false })]);
    // a folded plot can't be played or sacrificed, and the pocket is full
    await expectError(db.rpc(ann, 'start_minigame', { p_game: 'pigment', p_level: 5, p_gx: home.gx, p_gy: home.gy }), 'plot_folded');
    await db.sql(`update enchantments set state = state || '{"folds": 1}'::jsonb where id = $1`, [ori]);
    const other = await claim(ann, 404, 0);
    await expectError(act(ann, ori, 'fold', { gx: other.gx, gy: other.gy }), 'pocket_full');
  });

  it('unfolds somewhere new: rarity, shine, type, level, name and game progress travel; the old cell takes the new cell’s roll', async () => {
    const to = freeCell();
    const natTo = (await db.sql(`select private.cell_ladder_rarity($1, $2) r`, [to.gx, to.gy]))[0].r;
    const before = await plot(home.gx, home.gy);
    const r = await act(ann, ori, 'unfold', { gx: home.gx, gy: home.gy, to_gx: to.gx, to_gy: to.gy });
    expect(r.result).toMatchObject({ rarity: 'epic', left: natTo });
    expect(r.result.pay.paid).toBeGreaterThan(0);
    const b = await plot(to.gx, to.gy);
    expect(b).toMatchObject({ owner_id: ann, rarity: 'epic', shiny: true, level: 3, name: 'Paper Home', plot_type: before.plot_type, folded_at: null });
    const a = await plot(home.gx, home.gy);
    expect(a).toMatchObject({ owner_id: null, rarity: natTo, folded_at: null });
    expect((await db.sql(`select count(*)::int n from plot_game_progress where gx = $1 and gy = $2 and highest_level = 4`, [to.gx, to.gy]))[0].n).toBe(1);
    expect((await db.sql(`select count(*)::int n from plot_game_progress where gx = $1 and gy = $2`, [home.gx, home.gy]))[0].n).toBe(0);
    // the history: released there, arrived here
    expect((await db.sql(`select method from plot_ownership where gx = $1 and gy = $2 and released_at is null`, [to.gx, to.gy]))[0].method).toBe('unfold');
    expect((await db.sql(`select release_reason from plot_ownership where gx = $1 and gy = $2 order by id desc limit 1`, [home.gx, home.gy]))[0].release_reason).toMatch(/folded/);
    // a fresh crease: its minigames pay 25% more for a day
    expect(Number((await db.sql(`select private.forge_plot_mult($1, $2, $3) m`, [ann, to.gx, to.gy]))[0].m)).toBeCloseTo(1.25, 2);
    home = to;
  });

  it('won’t land on a taken cell, and won’t fold a Crown, an enchanted plot (until ★3) or its own plot', async () => {
    await db.sql(`update enchantments set state = state || '{"folds": 1}'::jsonb where id = $1`, [ori]);
    await act(ann, ori, 'fold', home);
    const bobs = (await db.sql(`select gx, gy from world_plots where owner_id = $1 limit 1`, [bob]))[0];
    await expectError(act(ann, ori, 'unfold', { gx: home.gx, gy: home.gy, to_gx: bobs.gx, to_gy: bobs.gy }), 'plot_taken');
    // smooth it out right where it was
    const s = await act(ann, ori, 'smooth', home);
    expect(s.result.smoothed).toEqual([home.gx, home.gy]);
    expect((await plot(home.gx, home.gy)).folded_at).toBeNull();
    const e = await row(ori);
    await db.sql(`update enchantments set state = state || '{"folds": 1}'::jsonb where id = $1`, [ori]);
    await expectError(act(ann, ori, 'fold', { gx: e.gx, gy: e.gy }), 'own_plot');
    const g = await enchant(ann, 'goose'); const ge = await row(g);
    await expectError(act(ann, ori, 'fold', { gx: ge.gx, gy: ge.gy }), 'enchanted');
    const c = await claim(ann, 410, 0);
    await db.sql(`update world_plots set rarity = 'crown' where gx = $1 and gy = $2`, [c.gx, c.gy]);
    await expectError(act(ann, ori, 'fold', { gx: c.gx, gy: c.gy }), 'crown');
  });

  it('★3 Living Fold carries an enchantment along, creature and all', async () => {
    await setStars(ori, 3);
    await db.sql(`update enchantments set state = state || '{"folds": 1}'::jsonb where id = $1`, [ori]);
    const g = await enchant(ann, 'genie'); const ge = await row(g);
    await act(ann, ori, 'fold', { gx: ge.gx, gy: ge.gy });
    const to = freeCell();
    const r = await act(ann, ori, 'unfold', { gx: ge.gx, gy: ge.gy, to_gx: to.gx, to_gy: to.gy });
    expect(r.result.enchant).toBe(g);
    const moved = await row(g);
    expect(moved).toMatchObject({ gx: to.gx, gy: to.gy, status: 'active', owner_id: ann });
    expect((await plot(to.gx, to.gy)).rarity).toBe('enchanted');
    expect((await plot(ge.gx, ge.gy)).rarity).not.toBe('enchanted');
    await setStars(ori, 0);
  });
});

describe('🔥 Crucible', () => {
  let cru: string; const mine: { gx: number; gy: number }[] = [];
  beforeAll(async () => {
    cru = await enchant(ann, 'crucible');
    for (let i = 0; i < 6; i++) { const r = await claim(ann, 500 + i * 2, 0); mine.push({ gx: r.gx, gy: r.gy }); await old(r.gx, r.gy); }
    await db.sql(`update world_plots set rarity = 'common', shiny = false where (gx, gy) in (select (x ->> 'gx')::int, (x ->> 'gy')::int from jsonb_array_elements($1::jsonb) x)`, [JSON.stringify(mine)]);
  });

  it('melts plots into Heat and metal — no limit — and they go back to the world at the cell’s own roll', async () => {
    await db.sql(`update world_plots set rarity = 'legendary' where gx = $1 and gy = $2`, [mine[0].gx, mine[0].gy]);
    const r = await act(ann, cru, 'melt', { cells: [[mine[0].gx, mine[0].gy], [mine[1].gx, mine[1].gy]] });
    expect(r.result).toMatchObject({ melted: 2, heat_gained: 17, metal_gained: { platinum: 1, iron: 1 }, heat: 17 });
    expect(r.view).toMatchObject({ heat: 17, metal: { platinum: 1, iron: 1 } });
    const p = await plot(mine[0].gx, mine[0].gy);
    expect(p.owner_id).toBeNull();
    expect(p.rarity).toBe((await db.sql(`select private.plot_rarity_for($1, $2) r`, [mine[0].gx, mine[0].gy]))[0].r);
    expect((await db.sql(`select release_reason from plot_ownership where gx = $1 and gy = $2 order by id desc limit 1`, [mine[1].gx, mine[1].gy]))[0].release_reason).toMatch(/Crucible/);
  });

  it('won’t melt a new plot, a Crown, an enchanted plot or a folded one', async () => {
    const fresh = await claim(ann, 530, 0);
    await expectError(act(ann, cru, 'melt', { cells: [[fresh.gx, fresh.gy]] }), 'too_new');
    await old(fresh.gx, fresh.gy);
    await db.sql(`update world_plots set rarity = 'crown' where gx = $1 and gy = $2`, [fresh.gx, fresh.gy]);
    await expectError(act(ann, cru, 'melt', { cells: [[fresh.gx, fresh.gy]] }), 'crown');
    const e = await row(cru);
    await expectError(act(ann, cru, 'melt', { cells: [[e.gx, e.gy]] }), 'enchanted');
  });

  it('a strike’s chance grows with Heat, a little at a time; a miss keeps half the Heat', async () => {
    const v = await get(ann, cru);
    expect(v.view.chances.uncommon).toBeGreaterThan(v.view.chances.rare);
    expect(v.view.chances.rare).toBeGreaterThan(v.view.chances.mythic);
    expect(v.view.chances.uncommon).toBeLessThanOrEqual(0.85);
    const c = (await db.sql(`select private.cru_chance(1, 'uncommon', 0, false) a, private.cru_chance(2, 'uncommon', 0, false) b, private.cru_chance(500, 'uncommon', 0, false) z`))[0];
    expect(Number(c.b) - Number(c.a)).toBeLessThan(Number(c.a));
    expect(Number(c.z)).toBeLessThanOrEqual(0.85);
    // a sure miss
    await cfg({ crucible: { need_uncommon: 1e9 } });
    const r = await act(ann, cru, 'strike', { gx: mine[2].gx, gy: mine[2].gy });
    expect(r.result).toMatchObject({ ok: false, from: 'common', kept: 0.5, heat: 8.5 });
    expect((await plot(mine[2].gx, mine[2].gy)).rarity).toBe('common');
  });

  it('a hit lifts the plot one tier (the ladder only), spends the Heat and pays', async () => {
    await cfg({ crucible: { need_uncommon: 0.0001, cap: 1 } });
    const r = await act(ann, cru, 'strike', { gx: mine[2].gx, gy: mine[2].gy, pump: 1 });
    expect(r.result).toMatchObject({ ok: true, from: 'common', to: 'uncommon', heat: 0 });
    expect(r.result.pay.paid).toBeGreaterThan(0);
    expect((await plot(mine[2].gx, mine[2].gy)).rarity).toBe('uncommon');
    await expectError(act(ann, cru, 'strike', { gx: mine[2].gx, gy: mine[2].gy }), 'no_heat');
    // past Mythic: an Ultra (very hard), then a Crown (harder still) — never past a Crown, never an Enchanted plot
    await db.sql(`update enchantments set state = state || '{"heat": 999}'::jsonb where id = $1`, [cru]);
    await db.sql(`update world_plots set rarity = 'mythic' where gx = $1 and gy = $2`, [mine[3].gx, mine[3].gy]);
    const v0 = await get(ann, cru);
    expect(Number(v0.view.chances.ultra)).toBeLessThan(0.06);
    expect(Number(v0.view.chances.crown)).toBeLessThanOrEqual(0.002);
    expect(v0.view.strikeable.find((p: any) => p.gx === mine[3].gx && p.gy === mine[3].gy)?.to).toBe('ultra');
    await cfg({ crucible: { need_ultra: 0.0001, cap_ultra: 1, need_crown: 0.0001, cap_crown: 1 } });
    const u = await act(ann, cru, 'strike', { gx: mine[3].gx, gy: mine[3].gy });
    expect(u.result.ok).toBe(true);
    const ultra = (await db.sql(`select w.rarity, r.ppm from world_plots w join plot_rarities r on r.id = w.rarity where gx = $1 and gy = $2`, [mine[3].gx, mine[3].gy]))[0];
    expect(Number(ultra.ppm)).toBeGreaterThan(0);
    await db.sql(`update enchantments set state = state || '{"heat": 999}'::jsonb where id = $1`, [cru]);
    const free = (await db.sql(`select private.crown_free_at($1, $2) c`, [mine[3].gx, mine[3].gy]))[0].c;
    if (free) {
      const c = await act(ann, cru, 'strike', { gx: mine[3].gx, gy: mine[3].gy });
      expect(c.result.ok).toBe(true);
      expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [mine[3].gx, mine[3].gy]))[0].rarity).toMatch(/^crown/);
      await db.sql(`update enchantments set state = state || '{"heat": 999}'::jsonb where id = $1`, [cru]);
      await expectError(act(ann, cru, 'strike', { gx: mine[3].gx, gy: mine[3].gy }), 'top_tier');
    } else {
      await expectError(act(ann, cru, 'strike', { gx: mine[3].gx, gy: mine[3].gy }), 'crowns_taken');
    }
    await cfg({ crucible: {} });
  });

  it('runes from metal: Steady keeps 75%, Fury risks it all; Kind picks the plot’s type', async () => {
    await db.sql(`update enchantments set state = state || '{"heat": 40, "metal": {"silver": 3, "gold": 2, "copper": 4}}'::jsonb where id = $1`, [cru]);
    await act(ann, cru, 'rune', { rune: 'steady' });
    await expectError(act(ann, cru, 'rune', { rune: 'steady' }), 'not_enough_metal');
    await cfg({ crucible: { need_rare: 1e9, need_uncommon: 1e9 } });
    const r = await act(ann, cru, 'strike', { gx: mine[4].gx, gy: mine[4].gy, rune: 'steady' });
    expect(r.result).toMatchObject({ ok: false, kept: 0.75, heat: 30 });
    await expectError(act(ann, cru, 'strike', { gx: mine[4].gx, gy: mine[4].gy, rune: 'fury' }), 'no_rune');
    await act(ann, cru, 'rune', { rune: 'kind' });
    await cfg({ crucible: { need_uncommon: 0.0001, cap: 1 } });
    const type = (await db.sql(`select id from plot_types where weight > 0 order by sort desc limit 1`))[0].id;
    const k2 = await act(ann, cru, 'strike', { gx: mine[4].gx, gy: mine[4].gy, rune: 'kind', type });
    expect(k2.result).toMatchObject({ ok: true, to: 'uncommon' });
    expect((await plot(mine[4].gx, mine[4].gy)).plot_type).toBe(type);
    await cfg({ crucible: {} });
  });

  it('★2 a free rune every strike; ★3 Masterwork: once a week a hit jumps two tiers', async () => {
    await setStars(cru, 3);
    await cfg({ crucible: { need_rare: 0.0001, need_epic: 0.0001, cap: 1 } });
    await db.sql(`update enchantments set state = state || '{"heat": 5}'::jsonb where id = $1`, [cru]);
    await db.sql(`update world_plots set rarity = 'uncommon' where gx = $1 and gy = $2`, [mine[5].gx, mine[5].gy]);
    const r = await act(ann, cru, 'strike', { gx: mine[5].gx, gy: mine[5].gy, rune: 'steady' });
    expect(r.result).toMatchObject({ ok: true, free_rune: true, masterwork: true, from: 'uncommon', to: 'epic' });
    await setStars(cru, 0); await cfg({ crucible: {} });
  });

  it('artifacts: forged from metal, fused up, carried or mounted — a bell for the Leviathan, a lantern for a plot', async () => {
    await db.sql(`update enchantments set state = state || '{"metal": {"iron": 40, "silver": 20, "gold": 20, "platinum": 6, "starsteel": 2}}'::jsonb where id = $1`, [cru]);
    const b1 = (await act(ann, cru, 'forge', { artifact: 'bell' })).result.artifact;
    const b2 = (await act(ann, cru, 'forge', { artifact: 'bell' })).result.artifact;
    const f = await act(ann, cru, 'fuse', { a: b1.id, b: b2.id });
    expect(f.result.artifact).toMatchObject({ kind: 'bell', level: 2 });
    await act(ann, cru, 'mount', { id: b1.id });
    expect(Number((await db.sql(`select private.crucible_bell($1) b`, [ann]))[0].b)).toBeCloseTo(1.2, 2);
    const lan = (await act(ann, cru, 'forge', { artifact: 'lantern' })).result.artifact;
    const target = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' and folded_at is null limit 1`, [ann]))[0];
    await act(ann, cru, 'mount', { id: lan.id, gx: target.gx, gy: target.gy });
    expect(Number((await db.sql(`select private.forge_plot_mult($1, $2, $3) m`, [ann, target.gx, target.gy]))[0].m)).toBeCloseTo(1.1, 2);
    // horseshoes bring Luck once a day
    const hs = (await act(ann, cru, 'forge', { artifact: 'horseshoe' })).result.artifact;
    await act(ann, cru, 'mount', { id: hs.id });
    const t = await act(ann, cru, 'tend');
    expect(t.result.luck).toBe(2);
    await expectError(act(ann, cru, 'tend'), 'already_today');
    // an anchor: no pranks, no Parasites
    const an = (await act(ann, cru, 'forge', { artifact: 'anchor' })).result.artifact;
    const t2 = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' and folded_at is null and not exists (select 1 from crucible_artifacts a where a.gx = world_plots.gx and a.gy = world_plots.gy) limit 1`, [ann]))[0];
    await act(ann, cru, 'mount', { id: an.id, gx: t2.gx, gy: t2.gy });
    await expectError(db.sql(`select private.ray_prank_check($1, $2, $3, $4)`, [bob, ann, t2.gx, t2.gy]), 'anchored');
    // all four kinds: the Smith's Set
    expect((await db.sql(`select private.cru_set($1) s`, [ann]))[0].s).toBe(true);
  });

  it('inlays and monuments: metal set into your plots, landmarks on everyone’s map', async () => {
    const target = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' and folded_at is null order by gx limit 1`, [ann]))[0];
    await act(ann, cru, 'inlay', { gx: target.gx, gy: target.gy, metal: 'gold' });
    const m = await act(ann, cru, 'monument', { gx: target.gx, gy: target.gy, metal: { iron: 10, silver: 4 }, name: 'The Ann Arch' });
    expect(m.result.monument).toMatchObject({ points: 26, tier: 1, name: 'The Ann Arch' });
    const map = await db.rpc(bob, 'enchant_map3', { p_min_gx: target.gx - 5, p_min_gy: target.gy - 5, p_max_gx: target.gx + 5, p_max_gy: target.gy + 5 });
    expect(map.monuments).toEqual([expect.objectContaining({ gx: target.gx, tier: 1, name: 'The Ann Arch', mine: false })]);
    expect(map.inlays).toEqual([expect.objectContaining({ gx: target.gx, metal: 'gold' })]);
    // when the plot leaves its owner, they go too
    await db.sql(`update world_plots set owner_id = null, claimed_at = null where gx = $1 and gy = $2`, [target.gx, target.gy]);
    expect((await db.sql(`select count(*)::int n from crucible_monuments where gx = $1 and gy = $2`, [target.gx, target.gy]))[0].n).toBe(0);
    expect((await db.sql(`select count(*)::int n from crucible_inlays where gx = $1 and gy = $2`, [target.gx, target.gy]))[0].n).toBe(0);
  });
});

describe('the new Traits', () => {
  it('Farsight: the partner reaches twice as far; one that reaches for nothing scouts a private reading a day', async () => {
    const sp = await enchant(cat, 'splice');
    const glass = await enchant(cat, 'spyglass');
    const g = await enchant(cat, 'goose');
    await act(cat, sp, 'splice', { mode: 'swap', a: glass, b: g });
    expect(Number((await db.sql(`select private.ench_reach($1) r`, [g]))[0].r)).toBe(2);
    // a goose reaches for nothing on the map: it scouts
    const r = (await db.sql(`select private.trait_farsight_run($1) r`, [g]))[0].r;
    expect(r).toHaveLength(1);
    const s = (await db.sql(`select * from private.spy_sightings where enchant_id = $1`, [g]))[0];
    expect(s).toMatchObject({ player_id: cat, gx: r[0].gx, gy: r[0].gy });
    expect((await db.sql(`select private.trait_farsight_run($1) r`, [g]))[0].r).toBeNull();
    expect((await get(cat, g)).traits.farsight).toMatchObject({ k: 1, reach: 2, reaches: false, scouted: 1, today: true });
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'far_sighted'`, [cat]))[0].n).toBe(1);
    // no Ink from it
    const pay = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [g]))[0].p;
    expect(pay.mods.map((m: any) => m.label).join(' ')).not.toMatch(/Farsight/);
    await db.sql(`update enchant_splices set ends_at = now() where splice_id = $1`, [sp]);
  });

  it('Folded: a tap folds the partner’s longest wait in half, once a day', async () => {
    const sp = await enchant(cat, 'splice');
    const ori = await enchant(cat, 'origami');
    const g = await enchant(cat, 'goose');
    await act(cat, sp, 'splice', { mode: 'swap', a: ori, b: g });
    const v = await get(cat, g);
    expect(v.traits.fold).toMatchObject({ k: 1, left: 1 });
    const wait = Number(v.traits.fold.wait.s);
    expect(wait).toBeGreaterThan(60);
    const skip0 = Number((await row(g)).clock_skip);
    const r = await act(cat, g, 'trait_fold');
    expect(r.result).toMatchObject({ key: v.traits.fold.wait.key, other: false });
    expect(Math.abs(Number(r.result.folded) - wait / 2)).toBeLessThan(5);
    expect(Number((await row(g)).clock_skip) - skip0).toBeGreaterThanOrEqual(Number(r.result.folded) - 1);
    await expectError(act(cat, g, 'trait_fold'), 'already_today');
    await expectError(act(cat, ori, 'trait_fold'), 'no_trait');
  });
});
