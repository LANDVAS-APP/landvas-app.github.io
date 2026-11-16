// Enchantments, parts 9–11: the Ouroboros and the Homunculus leave (a Dowsing Rod and a Pocket Sun take their place, and
// keep what they were); the Pocket Sun is your own mini Hot Zone; the Dowsing Rod aims your rolls; every Trait does its
// own thing (no Ink multipliers); 124 enchantment badges.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';


const LATER = fs.readdirSync(path.resolve(__dirname, '../../supabase/migrations')).filter((f) => f.endsWith('.sql') && f >= '20261119000290')
  .filter((f) => !fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', f), 'utf8').startsWith('-- @supabase-only')).sort();
const db = new TestDb();
let ann: string, bob: string, cat: string;
const O = { gx: 812_400, gy: 1_544_300 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `sr-${++k}-00000000` });
const claim = (uid: string, dx: number, dy = 0) => claimAt(uid, O.gx + dx, O.gy + dy);
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claim(uid, (spot++) * 3, uid === ann ? 0 : uid === bob ? 40 : 80);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const cfg = (patch: Record<string, unknown>) => db.sql(`update game_config set value = value || $1::jsonb where key = 'enchantments'`, [JSON.stringify(patch)]);
const splice = async (uid: string, a: string, b: string) => {
  const sp = await enchant(uid, 'splice');
  await db.sql(`update enchantments set state = state || '{"charges": 3}'::jsonb where id = $1`, [sp]);
  await act(uid, sp, 'splice', { mode: 'swap', a, b });
  return sp;
};
/** a free cell near O whose own roll is this rarity */
async function cellRolling(r: string, from = 2000) {
  for (let i = from; i < from + 4000; i++) {
    const gx = O.gx + i, gy = O.gy - 300;
    const x = (await db.sql(`select private.plot_rarity_for($1, $2) r`, [gx, gy]))[0].r;
    if (x === r) return { gx, gy };
  }
  throw new Error(`no ${r} cell`);
}

beforeAll(async () => {
  // everything up to the day before: the Ouroboros and the Homunculus are still here
  await db.init({ ungated: true, skip: LATER });
  ann = await db.newPlayer('sr_ann'); bob = await db.newPlayer('sr_bob'); cat = await db.newPlayer('sr_cat');
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 900_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'leviathan'`);
  await cfg({ splice: { aberration: 0, unstable: 0 } });
});
afterAll(() => db.close());

describe('the Ouroboros and the Homunculus leave', () => {
  let ouro: string, homu: string;
  it('they turn into a Dowsing Rod and a Pocket Sun, keeping what they were', async () => {
    ouro = await enchant(ann, 'ouroboros');
    homu = await enchant(ann, 'homunculus');
    await db.sql(`update enchantments set level = 4, xp = 60, stars = 1, nickname = 'Slinky', stats = stats || '{"clean": 3}'::jsonb where id = $1`, [ouro]);
    await db.sql(`update enchantments set level = 2, nickname = 'Blob', state = state || '{"awake": {"at": 1, "greets": 4}, "parts": [{"k": "goose", "lv": 2}]}'::jsonb where id = $1`, [homu]);
    const inkBefore = Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [ann]))[0].amount);
    for (const f of LATER) await db.sql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', f), 'utf8'));
    const o = await row(ouro), h = await row(homu);
    expect(o).toMatchObject({ kind: 'rod', level: 4, stars: 1, nickname: 'Slinky' });
    expect(o.stats.hatched_from).toBe('ouroboros');
    expect(o.state).toEqual({ targets: [] });
    expect(h).toMatchObject({ kind: 'sun', level: 2, nickname: 'Blob' });
    expect(h.stats.hatched_from).toBe('homunculus');
    // the awake Homunculus's heart was paid
    const inkAfter = Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [ann]))[0].amount);
    expect(inkAfter).toBeGreaterThan(inkBefore);
    expect((await db.sql(`select count(*)::int n from pg_proc where proname like 'ouro\\_%' or proname like 'homu\\_%' or proname = 'endless_renew'`))[0].n).toBe(0);
    await expectError(db.sql(`update enchantments set kind = 'ouroboros' where id = $1`, [ouro]), 'enchantments_kind_check');
  });
  it('still twenty kinds, 171 hybrids (33 Perfect Matches), every one with a Trait and a Leviathan move', async () => {
    const ks = (await db.sql(`select private.ench_kinds() k`))[0].k as string[];
    expect(ks).toHaveLength(20);
    expect(ks).toEqual(expect.arrayContaining(['sun', 'rod']));
    expect(ks).not.toContain('ouroboros');
    const r = (await db.sql(`select count(*)::int n, count(*) filter (where (private.ench_hybrid(a, b) ->> 1)::boolean)::int p
                               from unnest(private.ench_kinds()) a, unnest(private.ench_kinds()) b where a < b and a <> 'splice' and b <> 'splice'
                                and private.ench_hybrid(a, b) ->> 0 <> 'Chimera'`))[0];
    expect(r).toEqual({ n: 171, p: 33 });
    expect((await db.sql(`select private.ench_hybrid_count() n`))[0].n).toBe(171);
    for (const kd of ks.filter((x) => x !== 'splice')) {
      expect((await db.sql(`select private.ench_info($1) ->> 'gene' g, private.lev_move($1) ->> 0 m`, [kd]))[0]).toMatchObject({ g: expect.any(String), m: expect.any(String) });
    }
    expect((await db.sql(`select private.ench_hatchable() h`))[0].h).toEqual(expect.arrayContaining(['sun', 'rod']));
  });
});

describe('☀️ the Pocket Sun', () => {
  let sun: string;
  beforeAll(async () => { sun = await enchant(bob, 'sun'); });
  it('lights on a spot in reach, once a day, and shows its zone', async () => {
    const e = await row(sun);
    await expectError(act(bob, sun, 'ignite', { gx: e.gx + 9000, gy: e.gy }), 'out_of_range');
    const r = await act(bob, sun, 'ignite', { gx: e.gx + 20, gy: e.gy });
    expect(r.result.zone).toMatchObject({ alive: true, tier: 'warm', mode: 'claim' });
    expect(r.result.zone.r_m).toBe(150);
    expect(r.result.zone.spots.length).toBeGreaterThan(0);
    await expectError(act(bob, sun, 'ignite', { gx: e.gx + 30, gy: e.gy }), 'no_ignites');
    expect(r.view.zones).toHaveLength(1);
    const map = await db.rpc(bob, 'enchant_map2', { p_min_gx: e.gx - 50, p_min_gy: e.gy - 50, p_max_gx: e.gx + 50, p_max_gy: e.gy + 50 });
    expect(map.suns).toHaveLength(1);
    expect(map.suns[0]).toMatchObject({ mine: true, tier: 'warm' });
  });
  it('a claim inside gets a sun roll for its owner (and only them)', async () => {
    await cfg({ sun: { warm_x: 1000, hot_x: 1000, white_x: 1000 } });
    const e = await row(sun);
    const mine = await claimAt(bob, e.gx + 22, e.gy + 2);
    expect(mine.rarity_info.tier).toMatch(/ultra|primordial/);
    const theirs = await claimAt(cat, e.gx + 18, e.gy - 2);
    expect(theirs.rarity_info?.tier ?? null).not.toBe('ultra');
    expect((await row(sun)).stats.sun_claims).toBeGreaterThanOrEqual(1);
    await cfg({ sun: { warm_x: 2, hot_x: 3, white_x: 4 } });
  });
  it('a sunspot rolls a tier higher, once', async () => {
    const z = (await row(sun)).state.zones[0];
    const [gx, gy] = z.spots[0];
    expect((await db.sql(`select private.sun_spot_take($1, $2, $3) t`, [bob, gx, gy]))[0].t).toBe(true);
    expect((await db.sql(`select private.sun_spot_take($1, $2, $3) t`, [bob, gx, gy]))[0].t).toBe(false);
  });
  it('rubbing stokes it hotter (and smaller); past 95 it can snuff out', async () => {
    let r = await act(bob, sun, 'stoke', { n: 5 });
    expect(r.result.zone.tier).toBe('hot');
    expect(r.result.zone.r_m).toBeLessThan(150);
    await cfg({ sun: { snuff_pct: 0 } });
    r = await act(bob, sun, 'stoke', { n: 6 });
    expect(r.result.zone.tier).toBe('white');
    await cfg({ sun: { snuff_pct: 1 } });
    r = await act(bob, sun, 'stoke', { n: 2 });
    expect(r.result.snuffed).toBe(true);
    expect(r.view.zones).toHaveLength(0);
    await cfg({ sun: { snuff_pct: 0.12 } });
  });
  it('the Solar Flare is graded by the server’s clock; orbit warms your plots', async () => {
    const e = await row(sun);
    await db.sql(`update enchantments set state = state || '{"day": null, "lit": 0}'::jsonb where id = $1`, [sun]);
    await act(bob, sun, 'ignite', { gx: e.gx + 4, gy: e.gy, mode: 'orbit' });
    await expectError(act(bob, sun, 'flare'), 'no_ring');
    const aim = await act(bob, sun, 'aim');
    expect(aim.result.ring_at).toBeGreaterThan(aim.result.server_now);
    await new Promise((r) => setTimeout(r, 1550));
    const f = await act(bob, sun, 'flare');
    expect(['PERFECT', 'GREAT', 'GOOD']).toContain(f.result.grade);
    expect(f.view.zones[0].flare).toBe(true);
    await expectError(act(bob, sun, 'aim'), 'already_today');
    const m = (await db.sql(`select private.ench_plot_mult_extra($1, $2, $3) m`, [bob, e.gx, e.gy]))[0].m;
    expect(Number(m)).toBeCloseTo(1.25, 2);
    expect(Number((await db.sql(`select private.ench_plot_mult_extra($1, $2, $3) m`, [cat, e.gx, e.gy]))[0].m)).toBe(1);
  });
});

describe('🪄 the Dowsing Rod', () => {
  let rod: string;
  beforeAll(async () => { rod = await enchant(cat, 'rod'); });
  it('tunes to a target and shows the odds: harder per roll, certain at full depth', async () => {
    await expectError(act(cat, rod, 'tune', { t: 'rarity', id: 'common' }), 'bad_target');
    await expectError(act(cat, rod, 'tune', { t: 'primordial', id: 'primordial' }), 'bad_target');
    const r = await act(cat, rod, 'tune', { t: 'rarity', id: 'legendary' });
    expect(r.result.tuned).toMatchObject({ t: 'rarity', id: 'legendary', depth: 0, h: 0.5 });
    expect(r.result.tuned.need).toBe(Math.ceil(3 / r.result.tuned.p));
    expect(r.view.dowsing).toBe(true);
  });
  it('at full depth the next roll is the target', async () => {
    const need = (await get(cat, rod)).view.targets[0].need;
    await db.sql(`update enchantments set state = jsonb_set(state, '{targets,0,depth}', to_jsonb($2::int)) where id = $1`, [rod, need - 1]);
    const c = await cellRolling('common');
    const x = await claimAt(cat, c.gx, c.gy);
    expect(x.rarity).toBe('legendary');
    expect(x.dowsed[0]).toMatchObject({ result: 'forced', name: 'Legendary' });
    expect((await row(rod)).state.targets[0].depth).toBe(0);
    expect((await row(rod)).stats.dowsed).toBe(1);
  });
  it('a natural hit can slip (and pushes it deeper); a miss adds one', async () => {
    await act(cat, rod, 'tune', { t: 'rarity', id: 'rare' });
    await cfg({ rod: { h: 0 } });
    const c = await cellRolling('rare', 7000);
    const x = await claimAt(cat, c.gx, c.gy);
    expect(x.rarity).not.toBe('rare');
    expect(x.dowsed[0].result).toBe('slip');
    expect((await row(rod)).state.targets[0].depth).toBeGreaterThanOrEqual(1);
    await cfg({ rod: { h: 0.5 } });
    const d0 = (await row(rod)).state.targets[0].depth;
    const m = await cellRolling('common', 12000);
    const y = await claimAt(cat, m.gx, m.gy);
    expect(y.dowsed[0].result).toBe('miss');
    expect((await row(rod)).state.targets[0].depth).toBe(d0 + 1);
  });
  it('a kind: full depth brings up that enchantment; Shiny: the shine', async () => {
    await cfg({ base_pct: 2 });
    await act(cat, rod, 'tune', { t: 'kind', id: 'goose' });
    const need = (await get(cat, rod)).view.targets[0].need;
    await db.sql(`update enchantments set state = jsonb_set(state, '{targets,0,depth}', to_jsonb($2::int)) where id = $1`, [rod, need - 1]);
    const c = await cellRolling('common', 16000);
    const x = await claimAt(cat, c.gx, c.gy);
    expect(x.rarity).toBe('enchanted');
    expect(x.enchant.kind).toBe('goose');
    await cfg({ base_pct: 0 });
    await act(cat, rod, 'tune', { t: 'shiny', id: 'shiny' });
    const n2 = (await get(cat, rod)).view.targets[0].need;
    await db.sql(`update enchantments set state = jsonb_set(state, '{targets,0,depth}', to_jsonb($2::int)) where id = $1`, [rod, n2 - 1]);
    const c2 = await cellRolling('common', 20000);
    const y = await claimAt(cat, c2.gx, c2.gy);
    expect(y.shiny).toBe(true);
    expect(y.dowsed.find((d: any) => d.t === 'shiny').result).toBe('forced');
  });
});

describe('🧬 every Trait does its own thing', () => {
  it('Golden: a golden egg gives a free charge (here: a wish)', async () => {
    const goose = await enchant(ann, 'goose'), genie = await enchant(ann, 'genie');
    await splice(ann, goose, genie);
    const before = (await get(ann, genie)).view.wishes;
    const r = await act(ann, genie, 'trait_egg');
    expect(r.result).toMatchObject({ cracked: true, what: 'a wish' });
    expect(r.view.wishes).toBe(before + 1);
    await expectError(act(ann, genie, 'trait_egg'), 'already_today');
    // and no Ink multiplier any more
    const p = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [genie]))[0].p;
    expect(p.mods.map((m: any) => m.label).join(' ')).not.toMatch(/Golden/);
  });
  it('Chaos: a box does a chore or hiccups', async () => {
    const box = await enchant(ann, 'pandora'), cw = await enchant(ann, 'clockwork');
    await splice(ann, box, cw);
    const r = await act(ann, cw, 'trait_box');
    expect(typeof r.result.good).toBe('boolean');
  });
  it('Giant: its plot stands giant for the day; Spreading: spores on neighbours', async () => {
    const ray = await enchant(bob, 'sizeray'), map = await enchant(bob, 'map');
    const par = await enchant(bob, 'parasite');
    await splice(bob, ray, map);
    await db.sql(`select private.trait_daily($1)`, [map]);
    const e = await row(map);
    expect((await db.sql(`select private.plot_size($1, $2) s`, [e.gx, e.gy]))[0].s).toMatchObject({ mode: 'grow' });
    const sp2 = await enchant(bob, 'spyglass');
    await splice(bob, par, sp2);
    await claim(cat, (spot++) * 3, 42);
    await db.sql(`select private.trait_spores_run($1)`, [sp2]);
    const spores = await db.sql(`select * from enchant_spores where enchant_id = $1`, [sp2]);
    expect(spores.length).toBeGreaterThanOrEqual(1);
    // a win on a spored plot feeds the spore's owner
    const s = spores[0];
    const before = Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [bob]))[0].amount);
    await db.sql(`select private.spore_feed($1, $2, $3, 100)`, [s.host_id, s.gx, s.gy]);
    const after = Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [bob]))[0].amount);
    expect(after - before).toBe(10);
    expect(Number((await db.sql(`select private.trait_plot_mult($1, $2, $3) m`, [s.host_id, s.gx, s.gy]))[0].m)).toBeCloseTo(1.1, 2);
  });
  it('Echo: the last action repeats by itself a minute later, free', async () => {
    const shard = await enchant(cat, 'shard'), genie = await enchant(cat, 'genie');
    await splice(cat, shard, genie);
    await db.sql(`update enchantments set state = state || '{"wishes": 1}'::jsonb where id = $1`, [genie]);
    const r = await act(cat, genie, 'wish', { wish: 'ink' });
    expect(r.result.echo).toBe(true);
    await db.sql(`update enchant_echoes set due_at = now() - interval '1 second' where enchant_id = $1`, [genie]);
    await db.sql(`select private.trait_tick()`);
    const q = (await db.sql(`select * from enchant_echoes where enchant_id = $1`, [genie]))[0];
    expect(q.done_at).not.toBeNull();
    expect(q.result.echoed).toBe('wish');
    expect((await row(genie)).stats.echoes_done).toBe(1);
  });
  it('Charged: static builds with use and arcs to your plots', async () => {
    const coil = await enchant(ann, 'stormcoil'), gl = await enchant(ann, 'glyph');
    await splice(ann, coil, gl);
    await db.sql(`update enchantments set stats = stats || '{"static": 11}'::jsonb where id = $1`, [gl]);
    const r = (await db.sql(`select private.static_add(e) s from enchantments e where id = $1`, [gl]))[0].s;
    expect(r.arced).toBeGreaterThanOrEqual(1);
  });
  it('Linked: a second plot of yours pays ×1.2 and is tempered when the enchantment is', async () => {
    const wh = await enchant(cat, 'wormhole'), dk = await enchant(cat, 'deck');
    await splice(cat, wh, dk);
    const p = await claim(cat, (spot++) * 3, 84);
    await act(cat, dk, 'trait_link', { gx: p.gx, gy: p.gy });
    expect(Number((await db.sql(`select private.trait_plot_mult($1, $2, $3) m`, [cat, p.gx, p.gy]))[0].m)).toBeCloseTo(1.2, 2);
    await expectError(act(cat, dk, 'trait_link', { gx: O.gx, gy: O.gy }), 'not_your_plot');
  });
  it('Divining: a goose’s next egg is divined toward Platinum', async () => {
    const goose = await enchant(bob, 'goose'), rod = await enchant(bob, 'rod');
    await splice(bob, goose, rod);
    const v = await get(bob, goose);
    expect(v.traits.divining).toMatchObject({ target: 'platinum', depth: 0 });
    await db.sql(`update enchantments set stats = stats || '{"div_depth": 9999}'::jsonb, state = state || jsonb_build_object('egg_at', extract(epoch from now()) - 86400) where id = $1`, [goose]);
    await act(bob, goose, 'collect');
    const e = await row(goose);
    expect(e.state.fate_plat[String(e.state.eggs)]).toBe(true);
  });
});

describe('🏅 enchantment badges', () => {
  it('come back with an action, and the catalog keeps a secret a secret', async () => {
    const sun2 = await enchant(cat, 'sun');
    const r = await act(cat, sun2, 'rename', { name: 'Sol' });
    const keys = (r.achievements as any[]).map((a) => a.key);
    expect(keys).toContain('en_named');
    const got = (await db.sql(`select achievement_key k from player_achievements where player_id = $1`, [cat])).map((x: any) => x.k);
    expect(got).toEqual(expect.arrayContaining(['en_first', 'en_named', 'rd_tune', 'rd_hit_1']));
    const cat2 = await db.rpc(cat, 'achievements_catalog', {});
    const secret = (cat2 as any[]).find((a) => a.key === 'sn_snuffed');
    expect(secret).toMatchObject({ name: '???', icon: '❔', secret: true, category: 'enchant' });
    expect((cat2 as any[]).filter((a) => a.category === 'enchant').length).toBeGreaterThanOrEqual(124); // (124, and the ★4/★5 ones after)
  });
  it('the tally stays with the player', async () => {
    const m = (await db.sql(`select private.ench_metrics($1) m`, [cat]))[0].m;
    expect(m['ench.kinds_owned']).toBeGreaterThanOrEqual(3);
    expect(m['ench.rod.dowsed']).toBeGreaterThanOrEqual(1);
  });
});
