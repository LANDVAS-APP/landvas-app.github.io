// v0.53 Bases in detail (any angle, height, size, colours, materials) and bases that work (power, crew, production,
// refining, trading, research, upgrades).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let kai: string;
const W = 'moon', GX = 8, GY = 600;
const items = async () => Object.fromEntries((await db.sql(`select item, qty from planet_items where player_id = $1`, [kai])).map((r: any) => [r.item, Number(r.qty)]));
const save = (layout: object[], rev: number) => db.rpc(kai, 'planet_base_save', { p_world: W, p_gx: GX, p_gy: GY, p_layout: layout, p_rev: rev });
const age = (hours: number) => db.sql(`update planet_bases set prod_at = now() - make_interval(hours => $1) where world = $2 and gx = $3 and gy = $4`, [hours, W, GX, GY]);

beforeAll(async () => {
  await db.init({ ungated: true });
  kai = await db.newPlayer('kai_base3d');
  await db.giveInk(kai, 5000);
  await db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', 'moon')`, [kai]);
  await db.rpc(kai, 'planet_claim', { p_world: W, p_gx: GX, p_gy: GY });
  await db.sql(`insert into planet_items (player_id, item, qty) values ($1, 'stone', 500), ($1, 'iron', 300), ($1, 'copper', 200), ($1, 'crystal', 200), ($1, 'titanium', 50), ($1, 'ice', 100)`, [kai]);
});
afterAll(() => db.close());

describe('Bases in detail', () => {
  it('any angle, height, size and colour; materials and shapes need research', async () => {
    const r = await save([
      { id: 'b1', k: 'box', x: 4, y: 4, a: 37.5, z: 2, sx: 2, sy: 0.5, sz: 1.5, c: '#FF00AA', c2: '#00FFAA', m: 'metal', v: 2 },
      { id: 'w1', k: 'wall', x: 2, y: 1, a: 90 },
    ], 0);
    const box = r.layout.find((m: any) => m.id === 'b1');
    expect(box).toMatchObject({ a: 37.5, z: 2, sx: 2, sy: 0.5, sz: 1.5, c: '#FF00AA', c2: '#00FFAA', m: 'metal', v: 2 });
    // a scaled shape costs by its size (2 × 0.5 × 1.5 = 1.5 → 2 stone)
    expect(r.spent.stone).toBe(2 + 3);
    await expectError(save([...r.layout, { id: 'g', k: 'ball', x: 6, y: 6, m: 'neon' }], r.rev), 'research_needed');
    await expectError(save([...r.layout, { id: 'g', k: 'wedge', x: 6, y: 6 }], r.rev), 'research_needed');
    // a turned piece still has to fit
    await expectError(save([{ id: 'p', k: 'pad', x: 4, y: 4, a: 45 }], r.rev), 'invalid_layout');
  });
});

describe('Bases that work', () => {
  let rev = 0;
  it('power and crew run the buildings; short of either, everything slows', async () => {
    const cur = (await db.rpc(kai, 'planet_plots_near', { p_world: W, p_gx0: GX - 1, p_gx1: GX + 1, p_gy0: GY - 1, p_gy1: GY + 1 }))[0].base;
    rev = cur.rev;
    const r = await save([
      { id: 'rig1', k: 'condenser', x: 1.5, y: 1.5 },
      { id: 'sol1', k: 'solar', x: 5, y: 2 },
    ], rev);
    rev = r.rev;
    // a condenser needs 3 power (4 from the solar panel: fine) and 1 crew (none: stopped)
    expect(r.state.econ.power).toEqual({ supply: 4, demand: 3 });
    expect(r.state.econ.efficiency).toBe(0);
    const h = await save([...r.layout, { id: 'hab1', k: 'hab', x: 5.5, y: 5.5 }], rev);
    rev = h.rev;
    expect(h.state.econ.efficiency).toBe(1);
    expect(h.state.econ.out.ice).toBe(5);
  });

  it('production builds up while you’re away; collect it into your materials', async () => {
    await age(2);
    const s = await db.rpc(kai, 'planet_base_state', { p_world: W, p_gx: GX, p_gy: GY });
    expect(s.storage.ice).toBe(10);
    const before = await items();
    const c = await db.rpc(kai, 'planet_base_collect', { p_world: W, p_gx: GX, p_gy: GY });
    expect(c.collected.ice).toBe(10);
    expect((await items()).ice).toBe(before.ice + 10);
    expect(c.storage.ice ?? 0).toBe(0);
  });

  it('levelling up a building makes it 50% better, and the level stays when you rebuild round it', async () => {
    const u = await db.rpc(kai, 'planet_base_upgrade', { p_world: W, p_gx: GX, p_gy: GY, p_id: 'rig1' });
    expect(u.levels.rig1).toBe(2);
    expect(u.econ.out.ice).toBeCloseTo(7.5, 5);
    const cur = (await db.rpc(kai, 'planet_plots_near', { p_world: W, p_gx0: GX - 1, p_gx1: GX + 1, p_gy0: GY - 1, p_gy1: GY + 1 }))[0].base;
    const moved = cur.layout.map((m: any) => (m.id === 'rig1' ? { ...m, x: 1.6 } : m));
    const r = await save([...moved, { id: 'lamp1', k: 'lamp', x: 7.5, y: 7.5 }], cur.rev);
    expect(r.state.levels.rig1).toBe(2);
    await expectError(db.rpc(kai, 'planet_base_upgrade', { p_world: W, p_gx: GX, p_gy: GY, p_id: 'lamp1' }), 'not_found');
  });

  it('labs make research, which unlocks new things', async () => {
    const cur = (await db.rpc(kai, 'planet_plots_near', { p_world: W, p_gx0: GX - 1, p_gx1: GX + 1, p_gy0: GY - 1, p_gy1: GY + 1 }))[0].base;
    // more power for a lab (6 power, 2 crew): another two solar panels
    const r = await save([...cur.layout.filter((m: any) => m.id !== 'lamp1'),
      { id: 'lab1', k: 'lab', x: 6.4, y: 6.4 }, { id: 'sol2', k: 'solar', x: 1.2, y: 6.4 }, { id: 'sol3', k: 'solar', x: 3.3, y: 6.4 }], cur.rev);
    expect(r.state.econ.research).toBeGreaterThan(0);
    await age(10);
    const c = await db.rpc(kai, 'planet_base_collect', { p_world: W, p_gx: GX, p_gy: GY });
    expect(c.research_gained).toBeGreaterThanOrEqual(10);
    await expectError(db.rpc(kai, 'base_research_buy', { p_node: 'megastructures' }), 'not_enough_research');
    const b = await db.rpc(kai, 'base_research_buy', { p_node: 'glassworks' });
    expect(b.unlocked).toContain('glassworks');
    await expectError(db.rpc(kai, 'base_research_buy', { p_node: 'glassworks' }), 'already_owned');
  });

  it('refineries turn stored stone into iron; trading posts sell the surplus for Ink', async () => {
    await db.sql(`update planet_bases set storage = '{"stone": 40, "dust": 50}'::jsonb, prod_at = now() where world = $1 and gx = $2 and gy = $3`, [W, GX, GY]);
    const e = await db.sql(`select private.base_econ($1::jsonb, '{}'::jsonb, $2) e`, [JSON.stringify([
      { id: 'h', k: 'dome' }, { id: 'g1', k: 'solar' }, { id: 'g2', k: 'solar' }, { id: 'g3', k: 'solar' }, { id: 'rf', k: 'refinery' }, { id: 'mk', k: 'market' }]), kai]);
    expect(e[0].e.efficiency).toBe(1);
    expect(e[0].e.convert[0]).toMatchObject({ from: { stone: 4 }, to: { iron: 1 }, rate: 2 });
    expect(e[0].e.sell).toHaveLength(1);
  });

  it('a levelled-up building needs only a little more power and crew', async () => {
    const lay = JSON.stringify([{ id: 'h', k: 'dome' }, { id: 'g1', k: 'solar' }, { id: 'g2', k: 'solar' }, { id: 'c', k: 'condenser' }]);
    const one = (await db.sql(`select private.base_econ($1::jsonb, '{}'::jsonb, $2) e`, [lay, kai]))[0].e;
    const three = (await db.sql(`select private.base_econ($1::jsonb, '{"c": 3}'::jsonb, $2) e`, [lay, kai]))[0].e;
    expect(one.power.demand).toBe(3);
    expect(three.power.demand).toBeCloseTo(4.2);
    expect(three.out.ice).toBeCloseTo(one.out.ice * 2.25);
  });
});
