// v0.31 Playdates and eggs: co-op rounds between two players' Inkborn; a great round lays one egg
// for each owner (never the same kind), eggs hatch into new 'bred' Inkborn.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let gia: string, hal: string;
let giaPet: string, halPet: string, giaPet2: string;
const gA = { body: 'round', color: '#FF5C8A', belly: '#FFE0EA', accent: '#8B5CFF', pattern: 'spots', eyes: 'big', ears: 'cat', horns: 'none', tail: 'fluffy', wings: 'none', legs: 2, eyecount: 2, gait: 'walk', cheeks: true, size: 1, mood: 'playful' };
const gB = { body: 'blob', color: '#4FA8FF', belly: '#E0F0FF', accent: '#FFC93D', pattern: 'stripes', eyes: 'star', ears: 'none', horns: 'unicorn', tail: 'flame', wings: 'tiny', legs: 0, eyecount: 3, gait: 'roll', cheeks: false, size: 1.1, mood: 'brave' };
const make = async (uid: string, key: string, name: string, genome: object) => (await db.rpc(uid, 'inkborn_create', { p_client_key: key, p_name: name, p_source: 'random', p_genome: genome, p_drawing: null })).id;
const age = (s: string) => db.sql(`update inkborn_playdates set started_at = now() - interval '60 seconds' where id = $1`, [s]);

beforeAll(async () => {
  await db.init({ ungated: true });
  gia = await db.newPlayer('gia_play'); hal = await db.newPlayer('hal_host');
  await db.giveInk(gia, 500); await db.giveInk(hal, 500);
  giaPet = await make(gia, 'gia-pet-000001', 'Pip', gA);
  giaPet2 = await make(gia, 'gia-pet-000002', 'Moss', gA);
  halPet = await make(hal, 'hal-pet-000001', 'Zap', gB);
});
afterAll(() => db.close());

describe('Playdates', () => {
  it('your creature visits someone else’s', async () => {
    await expectError(db.rpc(gia, 'inkborn_playdate_start', { p_mine: halPet, p_theirs: giaPet }), 'not_owner');
    await expectError(db.rpc(gia, 'inkborn_playdate_start', { p_mine: giaPet, p_theirs: giaPet2 }), 'playdate_own');
    const s = await db.rpc(gia, 'inkborn_playdate_start', { p_mine: giaPet, p_theirs: halPet });
    expect(s).toMatchObject({ seconds: 45, mine: { name: 'Pip' }, theirs: { name: 'Zap', owner: { username: 'hal_host' } }, eggs_left: 3 });
    await expectError(db.rpc(gia, 'inkborn_playdate_finish', { p_session: s.session, p_score: 99 }), 'game_too_fast');
  });

  it('a great round pays both and lays two different eggs', async () => {
    const s = await db.rpc(gia, 'inkborn_playdate_start', { p_mine: giaPet, p_theirs: halPet });
    await age(s.session);
    const r = await db.rpc(gia, 'inkborn_playdate_finish', { p_session: s.session, p_score: 120 });
    expect(r.paid).toBe(20);
    expect(r.host_tip).toBe(4);
    expect(r.egg).toMatchObject({ ready: false, hatched: false, genome: null });
    expect(r.their_egg.kind).not.toBe(r.egg.kind);
    const mine = await db.rpc(gia, 'inkborn_eggs');
    const theirs = await db.rpc(hal, 'inkborn_eggs');
    expect(mine).toHaveLength(1); expect(theirs).toHaveLength(1);
    expect(theirs[0].kind).toBe(r.their_egg.kind);
    expect(mine[0].parents.map((p: any) => p.name)).toEqual(['Pip', 'Zap']);
    // the same pair can't lay again straight away
    const again = await db.rpc(gia, 'inkborn_playdate_start', { p_mine: giaPet, p_theirs: halPet });
    await age(again.session);
    const r2 = await db.rpc(gia, 'inkborn_playdate_finish', { p_session: again.session, p_score: 120 });
    expect(r2).toMatchObject({ egg: null, no_egg_because: 'pair' });
    // a weak round lays nothing
    const weak = await db.rpc(gia, 'inkborn_playdate_start', { p_mine: giaPet2, p_theirs: halPet });
    await age(weak.session);
    expect((await db.rpc(gia, 'inkborn_playdate_finish', { p_session: weak.session, p_score: 10 })).no_egg_because).toBe('score');
  });

  it('eggs hatch into a new Inkborn mixed from both parents', async () => {
    const [egg] = await db.rpc(gia, 'inkborn_eggs');
    await expectError(db.rpc(gia, 'inkborn_egg_hatch', { p_egg: egg.id, p_name: 'Sprout' }), 'egg_not_ready');
    await expectError(db.rpc(hal, 'inkborn_egg_hatch', { p_egg: egg.id, p_name: 'Sprout' }), 'not_owner');
    await db.sql(`update inkborn_eggs set hatch_at = now() - interval '1 second'`);
    const h = await db.rpc(gia, 'inkborn_egg_hatch', { p_egg: egg.id, p_name: 'Sprout' });
    expect(h.inkborn).toMatchObject({ name: 'Sprout', source: 'bred', mine: true });
    const odd = Object.keys(gA).filter((k) => ![(gA as any)[k], (gB as any)[k]].includes(h.inkborn.genome[k]));
    expect(odd.length).toBeLessThanOrEqual(h.egg.mutated ? 1 : 0); // a mutation changes one gene
    expect(h.egg).toMatchObject({ hatched: true });
    await expectError(db.rpc(gia, 'inkborn_egg_hatch', { p_egg: egg.id, p_name: 'Again' }), 'egg_hatched');
  });

  it('mixing leans on the egg owner’s creature', async () => {
    const rows = await db.sql(`select private.mix_genome($1::jsonb, $2::jsonb, 0) g from generate_series(1, 400)`, [JSON.stringify(gA), JSON.stringify(gB)]);
    const fromA = rows.filter((r: any) => r.g.genome.body === 'round').length;
    expect(fromA).toBeGreaterThan(220);
    expect(fromA).toBeLessThan(330);
  });
});
