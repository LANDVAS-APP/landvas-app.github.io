// The Enchantment editor: every number found in the live code, staff-only changes (audited), the power dials on every
// kind (Ink paid, the star bonus, XP, Luck), the Pocket Sun's numbers and star powers, the Genie's wishes, and the
// words players read (taglines, how-it-works lines, the five star powers).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string;
const O = { gx: 2_100_000, gy: 1_500_000 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `ee-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
async function enchant(uid: string, kind: string, dx: number) {
  await force(kind);
  const r = await claim(uid, dx);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const tune = (kind: string, values: Record<string, unknown>) => db.rpc(owner, 'admin_set_enchant_tuning', { p_kind: kind, p_values: values });

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('ench_owner'); ann = await db.newPlayer('ench_ann');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [ann]);
  await db.giveInk(ann, 1_000_000);
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'godrolls'`);
});
afterAll(() => db.close());

describe('the editor', () => {
  it('lists every kind with every number in the live code (default, now, where it is used) and the dials', async () => {
    const ed = await db.rpc(owner, 'admin_enchant_editor');
    const sun = ed.kinds.find((x: any) => x.kind === 'sun');
    const keys = sun.tunables.map((t: any) => t.key);
    expect(keys).toEqual(expect.arrayContaining(['warm_x', 'hot_x', 'white_x', 'nova_x', 'range_m', 'fuel_h', 'star1_r_x', 'star2_fuel_x', 'star3_suns', 'nova_star', 'flare_perfect_s', 'cool_per_h', 'party_share']));
    expect(sun.tunables.find((t: any) => t.key === 'white_x')).toMatchObject({ def: 4, value: null });
    expect(sun.tunables.find((t: any) => t.key === 'white_x').line).toMatch(/white_x/);
    expect(sun.dials.map((d: any) => d.key)).toEqual(expect.arrayContaining(['pay_x', 'star_pay', 'level_pay_x', 'xp_x', 'luck_x']));
    expect(sun.star_powers).toHaveLength(5);
    expect(ed.kinds.find((x: any) => x.kind === 'genie').tunables.map((t: any) => t.key)).toEqual(expect.arrayContaining(['wish_ink_min', 'wish_luck', 'golden_x', 'forbid_grant', 'twist_ink']));
    expect(ed.kinds.length).toBeGreaterThanOrEqual(20);
  });
  it('is staff-only, refuses unknown settings and bad values, and audits every change', async () => {
    await expectError(db.rpc(ann, 'admin_enchant_editor'), 'forbidden');
    await expectError(db.rpc(ann, 'admin_set_enchant_tuning', { p_kind: 'sun', p_values: { white_x: 1 } }), 'forbidden');
    await expectError(tune('sun', { made_up: 3 }), 'unknown_setting');
    await expectError(tune('sun', { white_x: 'lots' }), 'bad_value');
    await expectError(tune('dragon', { pay_x: 2 }), 'unknown_kind');
    await expectError(tune('sun', { weight: -1 }), 'bad_value');
    const ed = await tune('sun', { white_x: 2.5, weight: 3 });
    const sun = ed.kinds.find((x: any) => x.kind === 'sun');
    expect(sun.tunables.find((t: any) => t.key === 'white_x').value).toBe(2.5);
    expect(sun.weight).toBe(3);
    expect(ed.history[0]).toMatchObject({ action: 'enchant.tune', kind: 'sun', details: { to: { white_x: 2.5, weight: 3 } } });
    // null puts it back to its default
    const back = await tune('sun', { white_x: null, weight: null });
    expect(back.kinds.find((x: any) => x.kind === 'sun').tunables.find((t: any) => t.key === 'white_x').value).toBeNull();
    // the shared ones
    const g = await tune('global', { base_pct: 3, enabled: true });
    expect(g.global).toMatchObject({ base_pct: 3, enabled: true });
    await tune('global', { base_pct: null });
  });
});

describe('the power dials work on every kind', () => {
  it('Ink paid ×, and the bonus per star', async () => {
    const id = await enchant(ann, 'goose', 2);
    const base = await db.sql(`select private.ench_pay($1, 100, 'test') p`, [id]);
    const paid0 = Number(base[0].p.paid);
    await tune('goose', { pay_x: 0.5 });
    const half = Number((await db.sql(`select private.ench_pay($1, 100, 'test') p`, [id]))[0].p.paid);
    expect(half).toBeLessThanOrEqual(Math.ceil(paid0 / 2) + 1);
    expect(half).toBeGreaterThanOrEqual(Math.floor(paid0 / 2) - 1);
    await tune('goose', { pay_x: null });
    await db.sql(`update enchantments set stars = 2 where id = $1`, [id]);
    await tune('goose', { star_pay: 0.5 });
    const p = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [id]))[0].p;
    expect(p.mods.some((m: any) => /★★ \+100%/.test(m.label))).toBe(true);
    await tune('goose', { star_pay: null });
  });
  it('XP ×', async () => {
    const id = await enchant(ann, 'map', 4);
    await tune('map', { xp_x: 3 });
    const xp0 = Number((await db.sql(`select xp from enchantments where id = $1`, [id]))[0].xp);
    await db.sql(`select private.ench_xp($1, 2)`, [id]);
    expect(Number((await db.sql(`select xp from enchantments where id = $1`, [id]))[0].xp)).toBe(xp0 + 6);
    await tune('map', { xp_x: null });
  });
});

describe('☀️ the Pocket Sun', () => {
  let sun: string;
  beforeAll(async () => { sun = await enchant(ann, 'sun', 8); });
  it('range, size, fuel and its star powers follow the editor', async () => {
    const e = (await db.sql(`select * from enchantments where id = $1`, [sun]))[0];
    const view0 = (await db.sql(`select private.sun_eval(e, now()) g from enchantments e where id = $1`, [sun]))[0].g;
    expect(view0).toMatchObject({ fuel_h: 6, max_zones: 1, per_day: 1 });
    await tune('sun', { fuel_h: 2, range_m: 500, r_min: 100, max_suns: 2, per_day: 3 });
    let g = (await db.sql(`select private.sun_eval(e, now()) g from enchantments e where id = $1`, [sun]))[0].g;
    expect(g).toMatchObject({ fuel_h: 2, max_zones: 2, per_day: 3, r0: 100 });
    expect(Number(g.range_m)).toBeLessThanOrEqual(500);
    // ★1–★3: wider, longer, more suns — each by the editor's numbers
    await db.sql(`update enchantments set stars = 3 where id = $1`, [sun]);
    await tune('sun', { star1_r_x: 1.2, star2_fuel_x: 1.5, star3_suns: 0, star3_per_day: 0 });
    g = (await db.sql(`select private.sun_eval(e, now()) g from enchantments e where id = $1`, [sun]))[0].g;
    expect(g).toMatchObject({ fuel_h: 3, max_zones: 2, per_day: 3, r0: 120 });
    expect(e.gx).toBeTruthy();
  });
  it('heat tiers, their power and the star that makes it steady', async () => {
    await tune('sun', { white_x: 1.5, hot_x: 1.2, warm_x: 1.1, white_heat: 80, hot_heat: 40, steady_star: 6, nova_star: 6, start_heat: 45 });
    const e = (await db.sql(`select * from enchantments where id = $1`, [sun]))[0];
    await db.sql(`update enchantments set stars = 5 where id = $1`, [sun]);
    const r = await act(ann, sun, 'ignite', { gx: e.gx + 10, gy: e.gy });
    expect(r.result.zone).toMatchObject({ tier: 'hot', mult: 1.2, steady: false, nova: false });
    expect(Number(r.result.zone.heat)).toBe(45);
  });
});

describe('🧞 the Genie', () => {
  it('its wishes pay what the editor says', async () => {
    const id = await enchant(ann, 'genie', 12);
    await tune('genie', { wish_luck: 40, wishes: 5 });
    await db.sql(`update enchantments set state = state || '{"wishes": 2}'::jsonb where id = $1`, [id]);
    const before = Number((await db.sql(`select luck from player_luck where player_id = $1`, [ann]))[0]?.luck ?? 0);
    const r = await act(ann, id, 'wish', { wish: 'luck' });
    expect(r.result).toMatchObject({ wish: 'luck', luck: 40 });
    const after = Number((await db.sql(`select luck from player_luck where player_id = $1`, [ann]))[0].luck);
    expect(after - before).toBe(Math.min(40, 100 - before));
    expect(Number((await db.sql(`select private.genie_eval(e, now()) ->> 'max' m from enchantments e where id = $1`, [id]))[0].m)).toBe(5);
  });
  it('the Luck dial scales the Luck its actions give', async () => {
    const id = await enchant(ann, 'genie', 14);
    await db.sql(`update player_luck set luck = 0 where player_id = $1`, [ann]);
    await tune('genie', { luck_x: 0.5, wish_luck: 20 });
    await db.sql(`update enchantments set state = state || '{"wishes": 1}'::jsonb where id = $1`, [id]);
    await act(ann, id, 'wish', { wish: 'luck' });
    expect(Number((await db.sql(`select luck from player_luck where player_id = $1`, [ann]))[0].luck)).toBe(10);
  });
});

describe('the words players read', () => {
  it('taglines and how-it-works lines go to the game; star powers to each enchantment', async () => {
    const stars = [1, 2, 3, 4, 5].map((n) => ({ name: `Power ${n}`, emoji: '🔥', text: `Star ${n} does a thing.` }));
    await expectError(db.rpc(owner, 'admin_set_enchant_texts', { p_kind: 'sun', p_texts: { star_powers: stars.slice(0, 3) } }), 'bad_value');
    await expectError(db.rpc(ann, 'admin_set_enchant_texts', { p_kind: 'sun', p_texts: { tagline: 'x' } }), 'forbidden');
    const ed = await db.rpc(owner, 'admin_set_enchant_texts', { p_kind: 'sun', p_texts: { tagline: 'A smaller sun.', how: ['It burns 2 hours.', ''], star_powers: stars } });
    expect(ed.kinds.find((x: any) => x.kind === 'sun').star_powers[0]).toMatchObject({ name: 'Power 1' });
    const t = await db.rpc(null, 'enchant_texts');
    expect(t.sun).toEqual({ tagline: 'A smaller sun.', how: ['It burns 2 hours.'] });
    const g = (await db.sql(`select private.ench_star_powers('sun') p`))[0].p;
    expect(g[4]).toMatchObject({ name: 'Power 5', text: 'Star 5 does a thing.' });
    // back to the built-in words
    await db.rpc(owner, 'admin_set_enchant_texts', { p_kind: 'sun', p_texts: null });
    expect((await db.rpc(null, 'enchant_texts')).sun).toBeUndefined();
    expect((await db.sql(`select private.ench_star_powers('sun') p`))[0].p[0].name).not.toBe('Power 1');
  });
});
