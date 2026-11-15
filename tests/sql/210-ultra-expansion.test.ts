// The Ultra Expansion: nine new ultras that change the land around them (their marks for their owner only), Ultra Fusions
// (two ultras → one; three → a random Primordial), and the Primordials — rolled on their own parts-per-billion roll, a
// shockwave on every map when one appears, and a power over the land around each.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, cy: string;
const O = { gx: 1_000_400, gy: 1_550_200 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `ux-${++k}-00000000` });
const at = (dx: number, dy = 0) => ({ gx: O.gx + dx, gy: O.gy + dy });
const claim = (uid: string, dx: number, dy = 0) => claimAt(uid, O.gx + dx, O.gy + dy);
const setR = (dx: number, dy: number, r: string) => db.sql(`update world_plots set rarity = $3 where gx = $1 and gy = $2`, [O.gx + dx, O.gy + dy, r]);
const tick = () => db.sql(`select private.rx_tick()`);
const due = (dx: number, dy = 0) => db.sql(`update rarity_powers set next_at = now() - interval '1 second' where gx = $1 and gy = $2`, [O.gx + dx, O.gy + dy]);
const power = async (dx: number, dy = 0) => (await db.sql(`select * from rarity_powers where gx = $1 and gy = $2`, [O.gx + dx, O.gy + dy]))[0];
const act = (uid: string, dx: number, dy: number, action: string, args: Record<string, unknown> = {}) =>
  db.rpc(uid, 'rarity_act', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_action: action, p_args: args });
const one = async (q: string, p: unknown[] = []) => (await db.sql(q, p))[0];
const cfg = (path: string, v: unknown) => db.sql(`update game_config set value = jsonb_set(value, $1::text[], $2::jsonb) where key = 'rarity_powers'`, [`{${path}}`, JSON.stringify(v)]);
/** a plot of yours with a rarity, and its power row */
async function own(uid: string, dx: number, dy: number, r: string) {
  await claim(uid, dx, dy);
  await setR(dx, dy, r);
  await db.sql(`select private.rx_sync($1, $2)`, [O.gx + dx, O.gy + dy]);
}

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('ux_ann'); bob = await db.newPlayer('ux_bob'); cy = await db.newPlayer('ux_cy');
  for (const u of [ann, bob, cy]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 2_000_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'leviathan'`);
  await claim(ann, -900, 0); await claim(bob, -900, 40); await claim(cy, -900, 80);
});
afterAll(() => db.close());

describe('🌌 the rarities', () => {
  it('nine new ultras, nine fusions and nineteen Primordials, ranked above everything', async () => {
    const r = await db.sql(`select id, tier, ppm, ppb from plot_rarities where tier in ('ultra', 'fusion', 'primordial')`);
    const by = (t: string) => r.filter((x: any) => x.tier === t);
    for (const id of ['volcano', 'world_tree', 'phantom', 'wanderer', 'lodestone', 'leyline', 'glacier', 'mycelium', 'hive']) expect(r.find((x: any) => x.id === id)?.ppm).toBeGreaterThan(0);
    expect(by('fusion')).toHaveLength(9);
    expect(by('primordial')).toHaveLength(19);
    expect(by('primordial').every((x: any) => x.ppm === 0 && x.ppb > 0)).toBe(true);
    expect(r.find((x: any) => x.id === 'aurora')).toBeUndefined();
    const rank = async (id: string) => Number((await one(`select private.plot_rarity_rank($1) r`, [id])).r);
    expect(await rank('loom')).toBeGreaterThan(await rank('crown_country'));
    expect(await rank('crown')).toBeGreaterThan(await rank('singularity'));
    expect(await rank('volcano')).toBeGreaterThan(await rank('mythic'));
    const t = await db.rpc(ann, 'primordial_tier');
    expect(t.list).toHaveLength(19);
    expect(t.list[0].one_in).toBeGreaterThan(2_000_000);
    expect(t.tier_one_in).toBeGreaterThan(100_000);
  });

  it('a Primordial rolled: its own roll, a shockwave on every map and a line on the feed', async () => {
    await db.sql(`update plot_rarities set ppb = 1000000000 where id = 'loom'`);
    expect((await one(`select private.plot_rarity_for($1, $2) r`, [at(5000).gx, at(5000).gy])).r).toBe('loom');
    const before = (await db.rpc(bob, 'rarity_moments', { p_since: 0 })).last;
    const c = await claim(bob, 5000);
    await db.sql(`update plot_rarities set ppb = 330 where id = 'loom'`);
    expect(c.rarity).toBe('loom');
    const m = await db.rpc(ann, 'rarity_moments', { p_since: before });
    expect(m.moments.at(-1)).toMatchObject({ rarity: 'loom', how: 'rolled', owner_name: 'ux_bob', mine: false });
    expect((await one(`select count(*)::int n from feed_events where kind = 'primordial' and player_id = $1`, [bob])).n).toBeGreaterThanOrEqual(1);
    const w = await db.rpc(ann, 'primordials_world');
    expect(w.plots.some((p: any) => p.rarity === 'loom' && p.owner_name === 'ux_bob')).toBe(true);
    // the Loom: every claim is rolled twice, the better kept
    const n = (await one(`select private.plot_rarity_for($1, $2) r`, [at(5005).gx, at(5005).gy])).r;
    const r = (await one(`select private.rx_claim_roll($1, $2, $3, $4) r`, [bob, at(5005).gx, at(5005).gy, n])).r;
    const rank = async (id: string) => Number((await one(`select private.plot_rarity_rank($1) r`, [id])).r);
    expect(await rank(r)).toBeGreaterThanOrEqual(await rank(n));
  });
});

describe('🌋 the new ultras (their marks for their owner only)', () => {
  it('a Volcano erupts: obsidian only its owner sees, and a claim there rolls a tier higher', async () => {
    await own(ann, 100, 0, 'volcano');
    const p = await power(100);
    expect(p.next_at).toBeTruthy();
    await due(100); await tick();
    const lava = await db.sql(`select gx, gy from rarity_spots where kind = 'obsidian' and owner_id = $1`, [ann]);
    expect(lava.length).toBeGreaterThan(0);
    const m = await db.rpc(ann, 'rarity_map', { p_min_gx: O.gx, p_min_gy: O.gy - 100, p_max_gx: O.gx + 300, p_max_gy: O.gy + 100 });
    expect(m.spots.filter((s: any) => s.kind === 'obsidian').length).toBe(lava.length);
    const mb = await db.rpc(bob, 'rarity_map', { p_min_gx: O.gx, p_min_gy: O.gy - 100, p_max_gx: O.gx + 300, p_max_gy: O.gy + 100 });
    expect(mb.spots).toHaveLength(0);
    // claim an obsidian spot whose own roll is an everyday one
    for (const s of lava) {
      const nat = (await one(`select private.plot_rarity_for($1, $2) r`, [s.gx, s.gy])).r;
      if (!['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(nat)) continue;
      const up = (await one(`select private.rx_up($1) r`, [nat])).r;
      const c = await claimAt(ann, s.gx, s.gy);
      expect(c.rarity).toBe(up);
      expect((await one(`select count(*)::int n from rarity_spots where gx = $1 and gy = $2`, [s.gx, s.gy])).n).toBe(0);
      break;
    }
    const v = await db.rpc(ann, 'rarity_power', { p_gx: at(100).gx, p_gy: at(100).gy });
    expect(v).toMatchObject({ rarity: 'volcano', family: 'volcano', mine: true, eruptions: 1 });
    expect(v.log[0].k).toBe('erupted');
  });

  it('a World Tree roots toward your nearest plot; the tree and its roots pay more in minigames', async () => {
    await own(ann, 200, 0, 'world_tree');
    await claim(ann, 210, 0);
    await due(200); await tick();
    const p = await power(200);
    expect(p.state.roots).toEqual([[at(210).gx, at(210).gy]]);
    expect(Number((await one(`select private.rx_game_mult($1, $2, $3) m`, [ann, at(210).gx, at(210).gy])).m)).toBeCloseTo(1.1);
    expect(Number((await one(`select private.rx_game_mult($1, $2, $3) m`, [ann, at(200).gx, at(200).gy])).m)).toBeCloseTo(1.1);
    expect(Number((await one(`select private.rx_game_mult($1, $2, $3) m`, [bob, at(210).gx, at(210).gy])).m)).toBe(1);
  });

  it('a Phantom is a Common to everyone else; at night it whispers a reading that the claim keeps', async () => {
    await own(ann, 300, 0, 'phantom');
    const blocks = async (uid: string) => {
      const b = await db.rpc(uid, 'plot_blocks', { p_blocks: [[at(300).gx >> 6, at(300).gy >> 6]] });
      return (Object.values(b)[0] as any[]).find((r) => r[0] === at(300).gx && r[1] === at(300).gy)[9];
    };
    expect(await blocks(ann)).toBe('phantom');
    expect(await blocks(bob)).toBe('common');
    expect((await db.rpc(bob, 'plot_details', { p_gx: at(300).gx, p_gy: at(300).gy })).rarity).toBe('common');
    expect((await db.rpc(ann, 'plot_details', { p_gx: at(300).gx, p_gy: at(300).gy })).rarity).toBe('phantom');
    expect(await db.rpc(bob, 'rarity_power', { p_gx: at(300).gx, p_gy: at(300).gy })).toBeNull();
    await due(300); await tick();
    const w = (await power(300)).state.whisper;
    expect(w.rarity).toBeTruthy();
    const c = await claimAt(ann, w.gx, w.gy);
    expect(c.rarity).toBe(w.rarity);
  });

  it('a Wanderer gallops to a new spot (its power comes along) and leaves a rainbow trail', async () => {
    await own(ann, 400, 0, 'wanderer');
    await db.sql(`select private.rx_gallop(x) from rarity_powers x where gx = $1 and gy = $2`, [at(400).gx, at(400).gy]);
    expect(await power(400)).toBeUndefined();
    const moved = await one(`select * from rarity_powers where owner_id = $1 and rarity = 'wanderer'`, [ann]);
    expect(moved.state.from).toEqual([at(400).gx, at(400).gy]);
    expect((await one(`select owner_id, rarity from world_plots where gx = $1 and gy = $2`, [moved.gx, moved.gy]))).toMatchObject({ owner_id: ann, rarity: 'wanderer' });
    expect((await one(`select owner_id from world_plots where gx = $1 and gy = $2`, [at(400).gx, at(400).gy])).owner_id).toBeNull();
    expect((await one(`select method from plot_ownership where gx = $1 and gy = $2 and released_at is null`, [moved.gx, moved.gy])).method).toBe('wander');
    expect((await one(`select count(*)::int n from rarity_spots where kind = 'trail' and owner_id = $1`, [ann])).n).toBeGreaterThan(0);
  });

  it('a Lodestone gathers Ink, pulls your Seeking chests beside it and more Leviathan loot', async () => {
    await own(ann, 500, 0, 'lodestone');
    await db.sql(`update rarity_powers set state = state || jsonb_build_object('lode_at', extract(epoch from now() - interval '2 days')) where gx = $1 and gy = $2`, [at(500).gx, at(500).gy]);
    const v = await db.rpc(ann, 'rarity_power', { p_gx: at(500).gx, p_gy: at(500).gy });
    expect(v.ink).toBe(40);
    const r = await act(ann, 500, 0, 'collect');
    expect(r.result.ink).toBe(40);
    await expectError(act(ann, 500, 0, 'collect'), 'nothing_yet');
    const c = (await one(`select private.rx_lode_cell($1) c`, [ann])).c;
    expect(Math.abs(c[0] - at(500).gx)).toBeLessThanOrEqual(3);
    expect(Number((await one(`select private.rx_loot_pct($1) p`, [ann])).p)).toBe(25);
    await expectError(act(bob, 500, 0, 'collect'), 'not_your_plot');
  });

  it('a Leyline beams to your farthest plot, and the spots under the beam roll a tier higher for you', async () => {
    await own(ann, 600, 0, 'leyline');
    await claim(ann, 640, 0);
    await due(600); await tick();
    const p = await power(600);
    expect(p.state.beams.length).toBe(1);
    const [bx, by] = p.state.beams[0];
    const mx = Math.round((at(600).gx + bx) / 2), my = Math.round((at(600).gy + by) / 2);
    expect((await one(`select private.rx_on_beam($1, $2, $3) b`, [ann, mx, my])).b).toBe(true);
    expect((await one(`select private.rx_on_beam($1, $2, $3) b`, [bob, mx, my])).b).toBe(false);
    expect((await one(`select private.rx_on_beam($1, $2, $3) b`, [ann, mx, my + 20])).b).toBe(false);
  });

  it('a Glacier freezes the land around it — the neighbours’ too', async () => {
    await own(ann, 700, 0, 'glacier');
    await claim(bob, 705, 3);
    expect((await one(`select private.cru_anchored($1, $2) a`, [at(705).gx, at(705).gy + 3])).a).toBe(true);
    expect((await one(`select private.lev_safe($1, $2, $3) a`, [bob, at(705).gx, at(705).gy + 3])).a).toBe(true);
    expect((await one(`select private.cru_anchored($1, $2) a`, [at(740).gx, at(740).gy])).a).toBe(false);
  });

  it('a Mycelium creeps mushrooms onto the land around it; a Hive pollinates the neighbours and brings honey', async () => {
    await own(ann, 800, 0, 'mycelium');
    await due(800); await tick();
    expect((await one(`select count(*)::int n from rarity_spots where kind = 'mushroom' and owner_id = $1`, [ann])).n).toBe(1);
    await own(ann, 900, 0, 'hive');
    await claim(bob, 910, 5);
    await due(900); await tick();
    const b = await one(`select * from enchant_buffs where player_id = $1 and kind = 'pollinated'`, [bob]);
    expect([b.gx, b.gy]).toEqual([at(910).gx, at(910).gy + 5]);
    expect(Number((await one(`select private.rx_game_mult($1, $2, $3) m`, [bob, b.gx, b.gy])).m)).toBeCloseTo(1.1);
    expect((await power(900)).state.honey).toBeGreaterThan(0);
    expect((await one(`select count(*)::int n from player_notifications where player_id = $1 and kind = 'power' and data ->> 'sub' = 'pollinated'`, [bob])).n).toBe(1);
  });
});

describe('🧬 Ultra Fusions', () => {
  it('a Solar and a Lunar become an Eclipse (×4.5); the other plot goes back to the world', async () => {
    await claim(ann, 1000); await setR(1000, 0, 'solar');
    await claim(ann, 1002); await setR(1002, 0, 'lunar');
    await claim(ann, 1004); await setR(1004, 0, 'comet');
    await expectError(db.rpc(ann, 'ultra_fuse', { p_cells: [[at(1000).gx, at(1000).gy], [at(1004).gx, at(1004).gy]] }), 'no_recipe');
    const b0 = await db.rpc(ann, 'fusion_book');
    expect(b0.recipes.filter((r: any) => r.secret && r.to == null)).toHaveLength(2);
    expect(b0.ultras.length).toBeGreaterThanOrEqual(3);
    const f = await db.rpc(ann, 'ultra_fuse', { p_cells: [[at(1000).gx, at(1000).gy], [at(1002).gx, at(1002).gy]] });
    expect(f).toMatchObject({ rarity: 'eclipse', gx: at(1000).gx, triple: false });
    expect((await one(`select owner_id from world_plots where gx = $1 and gy = $2`, [at(1002).gx, at(1002).gy])).owner_id).toBeNull();
    const p = await one(`select * from world_plots where gx = $1 and gy = $2`, [at(1000).gx, at(1000).gy]);
    expect(Number((await one(`select private.plot_day_mult(p, current_date) m from world_plots p where gx = $1 and gy = $2`, [p.gx, p.gy])).m)).toBe(4.5);
    expect((await db.rpc(ann, 'fusion_book')).recipes.find((r: any) => r.to === 'eclipse').made).toBe(1);
    await expectError(db.rpc(bob, 'ultra_fuse', { p_cells: [[at(1004).gx, at(1004).gy], [at(1000).gx, at(1000).gy]] }), 'not_your_plot');
  });

  it('any three ultras become a random Primordial (and a shockwave says how)', async () => {
    for (const [i, r] of [[1100, 'chaos'], [1102, 'kraken'], [1104, 'hive']] as const) { await claim(cy, i, 80); await setR(i, 80, r); }
    const f = await db.rpc(cy, 'ultra_fuse', { p_cells: [[at(1100).gx, at(1100).gy + 80], [at(1102).gx, at(1102).gy + 80], [at(1104).gx, at(1104).gy + 80]] });
    expect(f.triple).toBe(true);
    expect(f.rarity_info.tier).toBe('primordial');
    expect(f.released).toHaveLength(2);
    expect((await one(`select how from rarity_moments where gx = $1 and gy = $2 order by id desc`, [at(1100).gx, at(1100).gy + 80])).how).toBe('fused');
  });
});

describe('🌍 the Primordials', () => {
  it('Heart of the World: a Golden Hour for everyone with land nearby, once a week', async () => {
    await own(ann, 1200, 0, 'heart_world');
    const r = await act(ann, 1200, 0, 'gift');
    expect(r.result.players).toBeGreaterThanOrEqual(2);
    expect((await one(`select count(*)::int n from enchant_buffs where player_id = $1 and kind = 'golden_hour'`, [bob])).n).toBe(1);
    await expectError(act(ann, 1200, 0, 'gift'), 'already_this_week');
  });

  it('Throne of Ink: the week’s rule over the land around it', async () => {
    await own(ann, 1300, 0, 'throne_ink');
    await expectError(act(ann, 1300, 0, 'decree', { rule: 'nope' }), 'invalid_rule');
    await act(ann, 1300, 0, 'decree', { rule: 'minigames' });
    expect(Number((await one(`select private.rx_game_mult($1, $2, $3) m`, [bob, at(1310).gx, at(1310).gy])).m)).toBeCloseTo(1.15);
    expect((await one(`select private.rx_rule_at($1, $2, 'minigames') r`, [O.gx + 200000, O.gy])).r).toBe(false);
    await expectError(act(ann, 1300, 0, 'decree', { rule: 'peace' }), 'already_this_week');
    await db.sql(`update rarity_powers set state = state - 'decree_week' where rarity = 'throne_ink'`);
    await act(ann, 1300, 0, 'decree', { rule: 'peace' });
    expect((await one(`select private.cru_anchored($1, $2) a`, [at(1320).gx, at(1320).gy])).a).toBe(true);
    await db.sql(`update rarity_powers set state = state - 'decree_week' where rarity = 'throne_ink'`);
    await act(ann, 1300, 0, 'decree', { rule: 'ultras' });
    expect(Number((await one(`select private.rx_cell_um($1, $2) m`, [at(1320).gx, at(1320).gy])).m)).toBe(2);
  });

  it('Serpent’s Egg: its holder’s land is never trampled and takes more loot; the call needs a Leviathan', async () => {
    await own(bob, 1400, 40, 'serpent_egg');
    expect((await one(`select private.lev_safe($1, $2, $3) a`, [bob, O.gx - 900, O.gy + 40])).a).toBe(true);
    expect(Number((await one(`select private.rx_loot_pct($1) p`, [bob])).p)).toBe(50);
    await expectError(act(bob, 1400, 40, 'call'), 'no_leviathan');
  });

  it('World’s Eye: sees the Phantoms nearby, and gazes once a day', async () => {
    await own(bob, 350, 40, 'world_eye');
    const b = await db.rpc(bob, 'plot_blocks', { p_blocks: [[at(300).gx >> 6, at(300).gy >> 6]] });
    expect((Object.values(b)[0] as any[]).find((r) => r[0] === at(300).gx && r[1] === at(300).gy)[9]).toBe('phantom');
    const g = await act(bob, 350, 40, 'gaze');
    expect(g.result.glints).toBeGreaterThanOrEqual(0);
    await expectError(act(bob, 350, 40, 'gaze'), 'already_today');
  });

  it('Void Gate: in its evening anyone with land nearby steps through once for a roll ticket; its holder is paid', async () => {
    await own(ann, 1600, 0, 'void_gate');
    const h = Number((await one(`select private.rx_solar_h($1) h`, [at(1600).gx])).h);
    await cfg('void_gate,open_h', Math.floor(h));
    const t0 = (await one(`select count(*)::int n from roll_tickets where player_id = $1`, [bob])).n;
    const r = await act(bob, 1600, 0, 'step');
    expect(['rare', 'epic']).toContain(r.result.ticket);
    expect((await one(`select count(*)::int n from roll_tickets where player_id = $1`, [bob])).n).toBe(t0 + 1);
    await expectError(act(bob, 1600, 0, 'step'), 'already_today');
    await cfg('void_gate,open_h', (Math.floor(h) + 12) % 24);
    await expectError(act(ann, 1600, 0, 'step'), 'gate_closed');
  });

  it('Fallen Star: a shower anyone can catch; Genesis Well: new land where ultras come 3× as often', async () => {
    await own(ann, 1700, 0, 'fallen_star');
    expect((await act(ann, 1700, 0, 'shower')).result.stars).toBe(30);
    const m = await db.rpc(bob, 'rarity_map', { p_min_gx: O.gx, p_min_gy: O.gy - 400, p_max_gx: O.gx + 2200, p_max_gy: O.gy + 400 });
    expect(m.stars.length).toBeGreaterThan(0);
    const c = await db.rpc(bob, 'rarity_catch', { p_id: m.stars[0].id });
    expect(c.ink ?? c.luck ?? c.golden).toBeTruthy();
    await expectError(db.rpc(bob, 'rarity_catch', { p_id: m.stars[0].id }), 'gone');
    await own(ann, 1800, 0, 'genesis_well');
    const g = await act(ann, 1800, 0, 'rise');
    expect(g.result.spots).toBe(25);
    const s = await one(`select gx, gy from rarity_spots where kind = 'genesis' limit 1`);
    // (×3 — and ×2 again under the Throne's decree of ultras next door)
    expect(Number((await one(`select private.rx_cell_um($1, $2) m`, [s.gx, s.gy])).m)).toBe(6);
    await expectError(act(ann, 1800, 0, 'rise'), 'already_month');
  });

  it('Chrysalis hatches into a random Primordial; the Hourglass runs its holder’s enchantments on', async () => {
    await own(cy, 1900, 80, 'chrysalis');
    await db.sql(`update rarity_powers set state = jsonb_build_object('hatch_at', now() - interval '1 minute'), next_at = now() - interval '1 second' where gx = $1 and gy = $2`, [at(1900).gx, at(1900).gy + 80]);
    await tick();
    const r = (await one(`select rarity from world_plots where gx = $1 and gy = $2`, [at(1900).gx, at(1900).gy + 80])).rarity;
    expect(r).not.toBe('chrysalis');
    expect((await one(`select tier from plot_rarities where id = $1`, [r])).tier).toBe('primordial');
    expect((await one(`select how from rarity_moments order by id desc limit 1`)).how).toBe('hatched');
    await own(ann, 2000, 0, 'hourglass');
    await db.sql(`select set_config('landvas.force_enchant', 'goose', false)`);
    const e = await claim(ann, 2010);
    await db.sql(`select set_config('landvas.force_enchant', '', false)`);
    await db.sql(`update rarity_powers set tick_at = now() - interval '5 minutes' where gx = $1 and gy = $2`, [at(2000).gx, at(2000).gy]);
    await tick();
    expect(Number((await one(`select clock_skip from enchantments where id = $1`, [e.enchant.id])).clock_skip)).toBeGreaterThan(250);
  });

  it('Sunspot: your own Hot Zone, placed once a day — only your claims in it get its rolls', async () => {
    await own(ann, 2100, 0, 'sunspot');
    await act(ann, 2100, 0, 'place', { gx: O.gx + 50000, gy: O.gy });
    await expectError(act(ann, 2100, 0, 'place', { gx: O.gx, gy: O.gy }), 'already_today');
    expect((await one(`select private.rx_in_sunspot($1, $2, $3) s`, [ann, O.gx + 50010, O.gy])).s).toBe(true);
    expect((await one(`select private.rx_in_sunspot($1, $2, $3) s`, [bob, O.gx + 50010, O.gy])).s).toBe(false);
    expect((await one(`select private.rx_in_sunspot($1, $2, $3) s`, [ann, O.gx + 60000, O.gy])).s).toBe(false);
    expect(Number((await one(`select private.rx_shiny_x($1, $2, $3) x`, [ann, O.gx + 50010, O.gy])).x)).toBe(2);
  });

  it('Eleven-Eleven: a wish only in the 11:11 minute of your own time zone; the zone holds for a week', async () => {
    await own(ann, 2200, 0, 'eleven');
    await expectError(act(ann, 2200, 0, 'wish', { pick: 'ink' }), 'no_tz');
    await act(ann, 2200, 0, 'tz', { tz: 'UTC' });
    await expectError(act(ann, 2200, 0, 'tz', { tz: 'Not/AZone' }), 'invalid_tz');
    await expectError(act(ann, 2200, 0, 'tz', { tz: 'Asia/Tokyo' }), 'tz_locked');
    // the clock away from 11:11, then on it
    const off = Number((await one(`select extract(epoch from (date_trunc('day', now() at time zone 'UTC') + time '11:11:20') - (now() at time zone 'UTC')) s`)).s);
    await db.sql(`update game_config set value = value || jsonb_build_object('clock_shift_s', $1::numeric + 3600) where key = 'rarity_powers'`, [off]);
    await expectError(act(ann, 2200, 0, 'wish', { pick: 'ink' }), 'not_1111');
    await db.sql(`update game_config set value = value || jsonb_build_object('clock_shift_s', $1::numeric) where key = 'rarity_powers'`, [off]);
    const v = await db.rpc(ann, 'rarity_power', { p_gx: at(2200).gx, p_gy: at(2200).gy });
    expect(v.open).toBe(true);
    const w = await act(ann, 2200, 0, 'wish', { pick: 'ink' });
    expect(w.result).toMatchObject({ ink: 111, streak: 1 });
    await expectError(act(ann, 2200, 0, 'wish', { pick: 'luck' }), 'already_wished');
    // twelve hours later, the streak goes on
    await db.sql(`update game_config set value = value || jsonb_build_object('clock_shift_s', $1::numeric + 43200) where key = 'rarity_powers'`, [off]);
    const w2 = await act(ann, 2200, 0, 'wish', { pick: 'ticket' });
    expect(w2.result.streak).toBe(2);
    expect(['epic', 'legendary']).toContain(w2.result.ticket);
    await db.sql(`update game_config set value = value || '{"clock_shift_s": 0}' where key = 'rarity_powers'`);
  });

  it('Upside Down flips the table for an hour; Midas turns a won plot to gold', async () => {
    await own(ann, 2300, 0, 'upside_down');
    await act(ann, 2300, 0, 'flip');
    expect((await one(`select private.rx_flip_on($1) f`, [ann])).f).toBe(true);
    await expectError(act(ann, 2300, 0, 'flip'), 'already_this_week');
    const flipped = await db.sql(`select private.rx_pick_flipped(g) r from generate_series(0, 999) g`);
    const n = (r: string) => flipped.filter((x: any) => x.r === r).length;
    expect(n('mythic')).toBeGreaterThan(300);
    expect(n('common')).toBeLessThan(30);
    await own(ann, 2400, 0, 'midas');
    await cfg('midas,one_in', 1);
    await claim(ann, 2410); await setR(2410, 0, 'rare');
    expect((await one(`select private.rx_after_win($1, $2, $3) r`, [ann, at(2410).gx, at(2410).gy])).r).toBe('epic');
    expect((await one(`select rarity from world_plots where gx = $1 and gy = $2`, [at(2410).gx, at(2410).gy])).rarity).toBe('epic');
    await cfg('midas,one_in', 25);
  });

  it('Chain Reaction claims the spots beside a claim for free', async () => {
    await own(bob, 2500, 40, 'chain');
    await cfg('chain,pct', 100); await cfg('chain,max', 2);
    const c = await claim(bob, 2520, 40);
    expect(c.chained).toHaveLength(2);
    for (const l of c.chained) expect((await one(`select owner_id from world_plots where gx = $1 and gy = $2`, [l.gx, l.gy])).owner_id).toBe(bob);
    expect((await one(`select method from plot_ownership where gx = $1 and gy = $2 and released_at is null`, [c.chained[0].gx, c.chained[0].gy])).method).toBe('chain');
    await cfg('chain,pct', 30); await cfg('chain,max', 5);
  });

  it('Transmuter: five of a rarity into one of the next tier; Doubling Cube: double or nothing, once a day', async () => {
    await own(ann, 2600, 0, 'transmuter');
    const cells: number[][] = [];
    for (let i = 0; i < 5; i++) { await claim(ann, 2610 + i * 2); await setR(2610 + i * 2, 0, 'uncommon'); cells.push([O.gx + 2610 + i * 2, O.gy]); }
    await expectError(act(ann, 2600, 0, 'transmute', { cells: cells.slice(0, 4) }), 'pick_five');
    const t = await act(ann, 2600, 0, 'transmute', { cells });
    expect(t.result).toMatchObject({ from: 'uncommon', rarity: 'rare' });
    expect((await one(`select count(*)::int n from world_plots where owner_id = $1 and gx between $2 and $3 and gy = $4`, [ann, O.gx + 2610, O.gx + 2618, O.gy])).n).toBe(1);
    await expectError(act(ann, 2600, 0, 'transmute', { cells }), 'already_today');
    await own(ann, 2700, 0, 'doubling_cube');
    await claim(ann, 2710); await setR(2710, 0, 'rare');
    const r = await act(ann, 2700, 0, 'roll', { gx: O.gx + 2710, gy: O.gy });
    expect(['uncommon', 'epic']).toContain(r.result.rarity);
    await expectError(act(ann, 2700, 0, 'roll', { gx: O.gx + 2710, gy: O.gy }), 'already_today');
  });

  it('Rift: claim around it as if you stood there', async () => {
    await own(ann, 2800, 0, 'rift');
    await db.sql(`update feature_flags set enabled = true where key = 'location_gated_claims'`);
    const far = { gx: O.gx + 80000, gy: O.gy + 100 };
    await expectError(db.sql(`select private.require_in_reach($1, $2, $3)`, [ann, far.gx, far.gy]), 'explorer_required');
    await act(ann, 2800, 0, 'open', far);
    await db.sql(`select private.require_in_reach($1, $2, $3)`, [ann, far.gx + 3, far.gy]);
    await expectError(db.sql(`select private.require_in_reach($1, $2, $3)`, [bob, far.gx + 3, far.gy]), 'explorer_required');
    await db.sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  });

  it('my powers at a glance, and the map shows each owner only their own marks', async () => {
    const mine = await db.rpc(ann, 'my_powers');
    expect(mine.length).toBeGreaterThan(10);
    expect(mine.every((p: any) => p.mine)).toBe(true);
    const m = await db.rpc(bob, 'rarity_map', { p_min_gx: O.gx, p_min_gy: O.gy - 100, p_max_gx: O.gx + 3000, p_max_gy: O.gy + 100 });
    expect(m.mine.length).toBeGreaterThan(0);
    expect(m.mine.every((p: any) => [at(1400).gx, at(350).gx, at(2500).gx, at(5000).gx].includes(p.gx))).toBe(true);
    expect((await db.rpc(ann, 'my_ultras')).plots.some((p: any) => p.rarity === 'eclipse')).toBe(true);
  });
});
