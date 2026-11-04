// v0.50 Keeper progression: keeper/creature levels, Glimmer, materials, treats, wishes, upgrades and expeditions.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let kim: string, other: string, c1: string, c2: string, c3: string;
const genome = { body: 'round', color: '#7FD3F5', belly: '#FFFFFF', eyes: 'big', ears: 'bunny', tail: 'curl', mood: 'foodie' };
const make = (uid: string, key: string, name: string) => db.rpc(uid, 'inkborn_create', { p_client_key: key, p_name: name, p_source: 'random', p_genome: genome, p_drawing: null });
const keeper = () => db.rpc(kim, 'keeper_get');
const setK = (sql: string, args: unknown[] = []) => db.sql(`update keeper_state set ${sql} where player_id = $1`, [kim, ...args]);

beforeAll(async () => {
  await db.init({ ungated: true });
  kim = await db.newPlayer('kim_keeper'); other = await db.newPlayer('oli_other');
  await db.giveInk(kim, 500);
  c1 = (await make(kim, 'kim-creature-000001', 'Mochi')).id;
  c2 = (await make(kim, 'kim-creature-000002', 'Pip')).id;
  c3 = (await make(kim, 'kim-creature-000003', 'Fig')).id;
});
afterAll(() => db.close());

describe('Keepers', () => {
  it('starts with XP from making creatures, and wishes for today', async () => {
    const k = await keeper();
    expect(k.xp).toBe(75); // 3 creatures × 25 — the first level comes quickly
    expect(k.level).toBe(2);
    expect(k.creatures).toHaveLength(3);
    expect(k.creatures[0]).toMatchObject({ level: 1 });
    expect(k.wishes).toHaveLength(3);
  });

  it('caring builds bond, which grows the keeper and the creature', async () => {
    const before = await keeper();
    await db.rpc(kim, 'inkborn_care', { p_id: c1, p_action: 'pet' });
    await db.rpc(kim, 'inkborn_care', { p_id: c1, p_action: 'feed' });
    const k = await keeper();
    expect(k.xp).toBeGreaterThan(before.xp);
    expect(k.creatures.find((c: any) => c.id === c1).xp).toBeGreaterThan(0);
    const ib = await db.rpc(kim, 'my_sanctuaries');
    expect(ib.creatures.find((c: any) => c.id === c1)).toHaveProperty('level');
  });

  it('jobs bring home materials, Glimmer and XP when collected', async () => {
    await db.rpc(kim, 'inkborn_job_start', { p_id: c2, p_job: 'forage' });
    await db.sql(`update inkborn set job_until = now() - interval '1 second' where id = $1`, [c2]);
    await db.rpc(kim, 'inkborn_job_claim', { p_id: c2 });
    const k = await keeper();
    expect(k.glimmer).toBeGreaterThanOrEqual(4);
    expect(k.materials.berries).toBeGreaterThanOrEqual(2);
    expect(k.events.some((e: any) => e.kind === 'job')).toBe(true);
  });

  it('games pay materials and creature XP', async () => {
    const g = await db.rpc(kim, 'inkborn_game_start', { p_id: c3, p_game: 'lilyhop' });
    await db.sql(`update inkborn_games set started_at = now() - interval '50 seconds' where id = $1`, [g.session]);
    await db.rpc(kim, 'inkborn_game_finish', { p_session: g.session, p_score: 96 });
    const k = await keeper();
    expect(k.materials.shells).toBe(4);
    expect(k.creatures.find((c: any) => c.id === c3).xp).toBeGreaterThan(0);
  });

  it('bake treats from materials and feed them to creatures', async () => {
    await setK(`materials = '{"berries": 7, "mushrooms": 2}'::jsonb`);
    await expectError(db.rpc(kim, 'keeper_bake', { p_treat: 'stardust_cake', p_times: 1 }), 'keeper_level_needed');
    const b = await db.rpc(kim, 'keeper_bake', { p_treat: 'berry_tart', p_times: 2 });
    expect(b.treats.berry_tart).toBe(2);
    expect(b.materials.berries).toBe(1);
    await expectError(db.rpc(kim, 'keeper_bake', { p_treat: 'berry_tart', p_times: 1 }), 'not_enough_materials');
    const f = await db.rpc(kim, 'keeper_feed_treat', { p_id: c1, p_treat: 'berry_tart' });
    expect(f.treats.berry_tart).toBe(1);
    expect(f.creature.happiness).toBeGreaterThan(80);
    await expectError(db.rpc(other, 'keeper_feed_treat', { p_id: c1, p_treat: 'berry_tart' }), 'no_treat');
  });

  it('wishes come true by doing the thing, and granting them pays', async () => {
    await db.sql(`update keeper_wishes set kind = 'care', target = 'brush', done_at = null where inkborn_id = $1`, [c1]);
    await expectError(db.rpc(kim, 'keeper_wish_claim', { p_id: (await keeper()).wishes.find((w: any) => w.inkborn === c1).id }), 'not_done_yet');
    await db.rpc(kim, 'inkborn_care', { p_id: c1, p_action: 'brush' });
    const w = (await keeper()).wishes.find((x: any) => x.inkborn === c1);
    expect(w.done).toBe(true);
    const before = (await keeper()).glimmer;
    const r = await db.rpc(kim, 'keeper_wish_claim', { p_id: w.id });
    expect(r.glimmer).toBeGreaterThanOrEqual(before + 10);
    await expectError(db.rpc(kim, 'keeper_wish_claim', { p_id: w.id }), 'already_done');
  });

  it('upgrades cost Glimmer and need a level; lantern paths shorten jobs', async () => {
    await expectError(db.rpc(kim, 'keeper_upgrade', { p_key: 'maps' }), 'keeper_level_needed');
    await setK(`xp = 400, glimmer = 1000`);
    const u = await db.rpc(kim, 'keeper_upgrade', { p_key: 'lanterns' });
    expect(u).toMatchObject({ to: 1, spent: 60 });
    const j = await db.rpc(kim, 'inkborn_job_start', { p_id: c2, p_job: 'explore' });
    const mins = (new Date(j.job_until).getTime() - new Date(j.job_started).getTime()) / 60000;
    expect(mins).toBeCloseTo(120 * 0.93, 0);
    await db.sql(`update inkborn set job_started = now() - interval '2 hours', job_until = now() - interval '1 second' where id = $1`, [c2]);
    await db.rpc(kim, 'inkborn_job_claim', { p_id: c2 });
  });

  it('expeditions: a team goes out, comes home with loot, and they’re busy meanwhile', async () => {
    await db.sql(`update inkborn set energy = 100, stats_at = now() where owner_id = $1`, [kim]);
    await expectError(db.rpc(kim, 'keeper_expedition_start', { p_region: 'stars', p_team: [c1] }), 'keeper_level_needed');
    await expectError(db.rpc(kim, 'keeper_expedition_start', { p_region: 'meadow', p_team: [] }), 'invalid_team');
    const s = await db.rpc(kim, 'keeper_expedition_start', { p_region: 'meadow', p_team: [c1, c3] });
    expect(s.chance).toBeGreaterThan(0.15);
    const e = s.expeditions[0];
    expect(e.done).toBe(false);
    // they can't be sent off again, or pulled home with a normal job claim
    await expectError(db.rpc(kim, 'inkborn_care', { p_id: c1, p_action: 'pet' }), 'inkborn_busy');
    await db.sql(`update inkborn set job_until = now() - interval '1 second' where id = $1`, [c1]);
    await expectError(db.rpc(kim, 'inkborn_job_claim', { p_id: c1 }), 'on_expedition');
    await expectError(db.rpc(kim, 'keeper_expedition_claim', { p_id: e.id }), 'job_not_done');
    await db.sql(`update keeper_expeditions set ends_at = now() - interval '1 second', chance = 1 where id = $1`, [e.id]);
    const r = await db.rpc(kim, 'keeper_expedition_claim', { p_id: e.id });
    expect(r.result.success).toBe(true);
    expect(Object.keys(r.result.loot).length).toBeGreaterThan(0);
    const back = await db.sql(`select job from inkborn where id = any($1::uuid[])`, [[c1, c3]]);
    expect(back.every((x: any) => x.job === null)).toBe(true);
    await expectError(db.rpc(kim, 'keeper_expedition_claim', { p_id: e.id }), 'already_done');
  });

  it('treasures fill the collection; a full set pays a bonus', async () => {
    await setK(`treasures = '["meadow:0", "meadow:1"]'::jsonb, upgrades = upgrades || '{"maps": 6}'::jsonb`);
    await db.sql(`update inkborn set energy = 100, stats_at = now(), job = null where owner_id = $1`, [kim]);
    const s = await db.rpc(kim, 'keeper_expedition_start', { p_region: 'meadow', p_team: [c2] });
    const id = s.expeditions[0].id;
    // a sure thing, with the best treasure odds
    await db.sql(`update keeper_expeditions set ends_at = now() - interval '1 second', chance = 1 where id = $1`, [id]);
    await db.sql(`update game_config set value = jsonb_set(value, '{expedition,treasure_chance}', '1') where key = 'keeper'`);
    const g0 = (await keeper()).glimmer;
    const r = await db.rpc(kim, 'keeper_expedition_claim', { p_id: id });
    expect(r.result.treasure).toBe('Snail’s tiny hat');
    expect(r.result.set_complete).toBe(true);
    expect(r.glimmer).toBeGreaterThanOrEqual(g0 + 150);
    expect(r.treasures).toHaveLength(3);
  });

  it('a deeper spring fills faster', async () => {
    const hid = (await db.rpc(kim, 'my_sanctuaries')).starter_id;
    await db.sql(`update habitats set spring_at = now() - interval '3 hours', layout = '[{"id":"s1","k":"inkspring","x":8,"y":8}]' where id = $1`, [hid]);
    const a = await db.rpc(kim, 'habitat_spring', { p_id: hid });
    await setK(`xp = 2000, upgrades = upgrades || '{"spring": 2}'::jsonb`);
    const b = await db.rpc(kim, 'habitat_spring', { p_id: hid });
    expect(b.rate).toBeCloseTo(a.rate * 1.3, 1);
  });
});
