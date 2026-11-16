// The Crucible's four new artifacts — 🪺 Golden Nest (the goose's eggs pay more), 🪨 Lodestone (Ink on your plots
// around it), 🪶 Phoenix Feather (a missed strike keeps more Heat), 🏺 Ink Amphora (Ink every day) — carrying four at
// once, and the Grand Set (all eight kinds).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, cru: string, goose: string;
const O = { gx: 1_212_300, gy: 1_371_900 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `cra-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claim(uid, (spot++) * 3, 40);
  await force('');
  return r.enchant.id as string;
}
const act = (id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(ann, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const cfg = (o: Record<string, unknown>) => db.sql(`update game_config set value = value || $1::jsonb where key = 'enchantments'`, [JSON.stringify(o)]);
const forge = async (kind: string) => (await act(cru, 'forge', { artifact: kind })).result.artifact;
const pay = async () => (await db.sql(`select private.ench_pay($1, 100, 'a golden egg') p`, [goose]))[0].p;
const labels = (p: any) => (p.mods as { label: string }[]).map((m) => m.label);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('cra_ann');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [ann]);
  await db.giveInk(ann, 900_000);
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  cru = await enchant(ann, 'crucible');
  goose = await enchant(ann, 'goose');
  await db.sql(`update enchantments set state = state || '{"metal": {"iron": 80, "copper": 80, "silver": 60, "gold": 60, "platinum": 10, "starsteel": 2}}'::jsonb where id = $1`, [cru]);
});
afterAll(() => db.close());

describe('🔥 the Crucible’s new artifacts', () => {
  it('four new kinds to forge, each from its own metals', async () => {
    const v = (await db.rpc(ann, 'enchant_get', { p_id: cru })).view;
    expect(Object.keys(v.recipes.artifacts)).toEqual(expect.arrayContaining(['nest', 'lodestone', 'feather', 'amphora']));
    expect(v.carry).toBe(4);
    const n = await forge('nest');
    expect(n).toMatchObject({ kind: 'nest', level: 1, power: '+6% Ink from your Golden Goose\'s eggs' });
    const after = (await db.sql(`select state -> 'metal' m from enchantments where id = $1`, [cru]))[0].m;
    expect(after).toMatchObject({ gold: 57, copper: 77 });
    await expectError(act(cru, 'forge', { artifact: 'teapot' }), 'invalid_action');
  });

  it('🪺 Golden Nest: carried, the Golden Goose’s eggs pay more (other enchantments don’t)', async () => {
    const n = (await db.sql(`select id from crucible_artifacts where player_id = $1 and kind = 'nest'`, [ann]))[0];
    expect(labels(await pay()).some((l) => /Golden Nest/.test(l))).toBe(false);
    await act(cru, 'mount', { id: n.id });
    expect(labels(await pay())).toContain('Golden Nest +6%');
    // a second nest fused up: level 2, +12%
    const n2 = await forge('nest');
    await act(cru, 'mount', { id: n.id }); // (put away to fuse)
    const f = await act(cru, 'fuse', { a: n.id, b: n2.id });
    expect(f.result.artifact).toMatchObject({ kind: 'nest', level: 2 });
    await act(cru, 'mount', { id: n.id });
    expect(labels(await pay())).toContain('Golden Nest +12%');
    // not for the Crucible's own pay
    const c = (await db.sql(`select private.ench_pay($1, 100, 'forged') p`, [cru]))[0].p;
    expect(labels(c).some((l) => /Golden Nest/.test(l))).toBe(false);
  });

  it('🪨 Lodestone: on a plot, Ink for your plots in the 3×3 around it', async () => {
    const a = await claim(ann, 700, 0), b = await claim(ann, 701, 0), far = await claim(ann, 704, 0);
    const lo = await forge('lodestone');
    await act(cru, 'mount', { id: lo.id, gx: a.gx, gy: a.gy });
    const m = async (p: { gx: number; gy: number }) => Number((await db.sql(`select private.forge_plot_mult($1, $2, $3) m`, [ann, p.gx, p.gy]))[0].m);
    expect(await m(a)).toBeCloseTo(1.04, 3);
    expect(await m(b)).toBeCloseTo(1.04, 3);
    expect(await m(far)).toBeCloseTo(1, 3);
  });

  it('🪶 Phoenix Feather: carried, a missed strike keeps more of the Heat (not with Fury)', async () => {
    const p = await claim(ann, 720, 0);
    await db.sql(`update world_plots set rarity = 'common', shiny = false where gx = $1 and gy = $2`, [p.gx, p.gy]);
    const fe = await forge('feather');
    await act(cru, 'mount', { id: fe.id });
    await cfg({ crucible: { need_uncommon: 1e9 } });
    await db.sql(`update enchantments set state = state || '{"heat": 10}'::jsonb where id = $1`, [cru]);
    const r = await act(cru, 'strike', { gx: p.gx, gy: p.gy });
    expect(r.result).toMatchObject({ ok: false, kept: 0.58, heat: 5.8 });
    await cfg({ crucible: {} });
  });

  it('🏺 Ink Amphora: carried, Ink every day when you collect', async () => {
    const am = await forge('amphora');
    expect((await db.rpc(ann, 'enchant_get', { p_id: cru })).view.tend_ready).toBe(false);
    await act(cru, 'mount', { id: am.id });
    const v = (await db.rpc(ann, 'enchant_get', { p_id: cru })).view;
    expect(v.tend_ready).toBe(true);
    const t = await act(cru, 'tend');
    expect(t.result).toMatchObject({ luck: 0, ink: 6 });
    await expectError(act(cru, 'tend'), 'already_today');
  });

  it('four in your hands at once', async () => {
    // carried now: nest, feather, amphora — a horseshoe makes four, a bell is one too many
    const hs = await forge('horseshoe');
    await act(cru, 'mount', { id: hs.id });
    const bell = await forge('bell');
    await expectError(act(cru, 'mount', { id: bell.id }), 'hands_full');
  });

  it('🏆 the Grand Set: one of each of the eight, +10% enchantment Ink (instead of the Smith’s +5%)', async () => {
    expect(labels(await pay())).toContain('Smith’s Set +5%');
    expect((await db.sql(`select private.cru_grand($1) g`, [ann]))[0].g).toBe(false);
    await forge('lantern'); await forge('anchor');
    expect((await db.sql(`select private.cru_grand($1) g`, [ann]))[0].g).toBe(true);
    const l = labels(await pay());
    expect(l).toContain('Grand Set +10%');
    expect(l).not.toContain('Smith’s Set +5%');
    const v = (await db.rpc(ann, 'enchant_get', { p_id: cru })).view;
    expect(v).toMatchObject({ grand: true, set: true, kinds_owned: 8 });
  });
});
