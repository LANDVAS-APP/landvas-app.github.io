// v0.22 Inkborn: plot kinds (safe conversion, art kept), habitats, creatures, care, layouts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const H = (n: number) => n.toString(16).padStart(64, '0');
let kai: string, lee: string;
const A = { gx: 3_000_000, gy: 1_900_000 }, B = { gx: 3_000_001, gy: 1_900_000 };
const genome = { body: 'bean', color: '#FF7AB8', belly: '#FFE0EE', eyes: 'big', ears: 'cat', tail: 'fluffy', mood: 'playful' };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const groupAt = async (uid: string, at: { gx: number; gy: number }) => (await db.rpc(uid, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === at.gx && c[1] === at.gy));

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  kai = await db.newPlayer('kai_keeper');
  lee = await db.newPlayer('lee_visits');
  await db.rpc(kai, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  await db.rpc(kai, 'acquire_plot', { p_gx: B.gx, p_gy: B.gy, p_idempotency_key: 'ink-acquire-b-00001' });
});
afterAll(() => db.close());

describe('Inkborn', () => {
  let starter: string, creature: string;
  it('a brand-new player can make a creature straight away (the starter sanctuary appears for it)', async () => {
    const neo = await db.newPlayer('neo_first');
    const c = await db.rpc(neo, 'inkborn_create', { p_client_key: 'neo-first-000001', p_name: 'Pip', p_source: 'random', p_genome: genome, p_drawing: null });
    const s = await db.rpc(neo, 'my_sanctuaries');
    expect(c.habitat_id).toBe(s.starter_id);
  });
  it('everyone has a free starter sanctuary; creatures are saved once per client key', async () => {
    const s = await db.rpc(kai, 'my_sanctuaries');
    starter = s.starter_id;
    expect(s.habitats[0]).toMatchObject({ kind: 'starter', capacity: 4 });
    const strokes = [{ c: 3, w: 12, p: [100, 100, 0, 300, 300, 50] }, { c: 5, w: 12, p: [200, 100, 100, 400, 300, 150] }];
    const c1 = await db.rpc(kai, 'inkborn_create', { p_client_key: 'kai-creature-0001', p_name: 'Mochi', p_source: 'drawn', p_genome: genome, p_drawing: strokes });
    const c2 = await db.rpc(kai, 'inkborn_create', { p_client_key: 'kai-creature-0001', p_name: 'Mochi', p_source: 'drawn', p_genome: genome, p_drawing: strokes });
    expect(c2.id).toBe(c1.id);
    expect(c1).toMatchObject({ habitat_id: starter, personality: 'playful', portrait_status: 'unconfigured' });
    creature = c1.id;
    await expectError(db.rpc(kai, 'inkborn_create', { p_client_key: 'kai-creature-0002', p_name: 'x', p_source: 'random', p_genome: { evil: { nested: 1 } }, p_drawing: null }), 'invalid_genome');
    const h = await db.rpc({ role: 'anon' }, 'habitat_get', { p_id: starter });
    expect(h.creatures[0].name).toBe('Mochi');
    expect(h.creatures[0].drawing).toBeUndefined(); // only the owner sees the drawing
  });

  it('care raises happiness and bond; play costs energy; others can’t care for your creature', async () => {
    const pet = await db.rpc(kai, 'inkborn_care', { p_id: creature, p_action: 'pet' });
    expect(pet.bond).toBe(1);
    const fed = await db.rpc(kai, 'inkborn_care', { p_id: creature, p_action: 'feed' });
    expect(fed.reaction).toBe('yum');
    expect((await db.rpc(kai, 'inkborn_care', { p_id: creature, p_action: 'feed' })).reaction).toBe('full');
    const before = (await db.rpc(kai, 'inkborn_care', { p_id: creature, p_action: 'play' }));
    expect(before.reaction).toBe('yay');
    await expectError(db.rpc(lee, 'inkborn_care', { p_id: creature, p_action: 'pet' }), 'not_owner');
  });

  it('a plot becomes a habitat without losing its art, and switching back restores it', async () => {
    const g = await groupAt(kai, A);
    const p = await db.rpc(kai, 'get_project', { p_project_id: g.project_id });
    const sv = await db.rpc(kai, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { [`${A.gx}_${A.gy}`]: H(7) } }] } });
    const coins = await ink(kai);
    const hg = await db.rpc(kai, 'set_group_kind', { p_group_id: g.id, p_kind: 'habitat' });
    expect(hg.kind).toBe('habitat');
    expect(hg.habitat_id).toBeTruthy();
    expect(await ink(kai)).toBe(coins); // no Ink changes
    await expectError(db.rpc(kai, 'request_publication', { p_project_id: g.project_id, p_version_id: sv.version_id, p_title: 'x', p_rights_affirmed: true }), 'habitat_plot');
    // move the creature in, decorate
    await db.rpc(kai, 'inkborn_move', { p_id: creature, p_habitat_id: hg.habitat_id });
    const lay = await db.rpc(kai, 'habitat_save_layout', { p_id: hg.habitat_id, p_layout: [{ id: 'd1', k: 'oak', x: 4, y: 5, f: 0 }], p_rev: 0 });
    expect(lay.layout_rev).toBe(1);
    await expectError(db.rpc(kai, 'habitat_save_layout', { p_id: hg.habitat_id, p_layout: [], p_rev: 0 }), 'layout_conflict');
    await expectError(db.rpc(kai, 'habitat_save_layout', { p_id: hg.habitat_id, p_layout: [{ id: 'd1', k: 'oak', x: 400, y: 5 }], p_rev: 1 }), 'invalid_layout');
    const map = await db.rpc({ role: 'anon' }, 'plot_blocks', { p_blocks: [[A.gx >> 6, A.gy >> 6]] });
    expect((Object.values(map)[0] as any[]).find((r: any[]) => r[0] === A.gx)[11]).toBe('habitat');
    expect((await db.rpc({ role: 'anon' }, 'habitat_for_plot', { p_gx: A.gx, p_gy: A.gy })).habitat_id).toBe(hg.habitat_id);
    // back to a canvas: the art draft is still there; the creature waits in the starter sanctuary
    const cg = await db.rpc(kai, 'set_group_kind', { p_group_id: g.id, p_kind: 'canvas' });
    expect(cg.kind).toBe('canvas');
    expect((await db.rpc(kai, 'get_project', { p_project_id: g.project_id })).version.id).toBe(sv.version_id);
    expect((await db.rpc(kai, 'my_sanctuaries')).creatures[0].habitat_id).toBe(starter);
    // and habitat again: layout and creature come home
    const again = await db.rpc(kai, 'set_group_kind', { p_group_id: g.id, p_kind: 'habitat' });
    const h = await db.rpc(kai, 'habitat_get', { p_id: again.habitat_id });
    expect(h.layout).toHaveLength(1);
    expect(h.creatures[0].id).toBe(creature);
  });

  it('only habitats merge with habitats; a merged habitat keeps everyone', async () => {
    const ga = await groupAt(kai, A), gb = await groupAt(kai, B);
    await db.giveInk(kai, 100);
    await expectError(db.rpc(kai, 'fuse_groups', { p_group_ids: [ga.id, gb.id] }), 'mixed_plot_kinds');
    await db.rpc(kai, 'set_group_kind', { p_group_id: gb.id, p_kind: 'habitat' });
    const g = await db.rpc(kai, 'fuse_groups', { p_group_ids: [ga.id, gb.id] });
    const h = await db.rpc(kai, 'habitat_get', { p_id: g.habitat_id });
    expect(h.plots).toBe(2);
    expect(h.capacity).toBe(5);
    expect(h.creatures.map((c: any) => c.id)).toContain(creature);
  });
});
