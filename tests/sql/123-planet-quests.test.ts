// v0.44 Planet quests (3 a day per world), crew quests everyone works on together, and dig parties.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let qa: string, qb: string;
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const own = (uid: string, gx: number, gy: number) => db.sql(`insert into planet_plots (world, gx, gy, owner_id) values ('moon', $1, $2, $3)`, [gx, gy, uid]);
const ready = (uid: string) => db.sql(`update planet_miners set energy = 240, last_dig_at = now() - interval '1 hour' where player_id = $1`, [uid]);
// make today's quests a known set
const setQuests = (solo: object[], crew: object) => db.sql(`update game_config set value = value || jsonb_build_object('pool', $1::jsonb, 'crew', $2::jsonb) where key = 'quests'`, [JSON.stringify(solo), JSON.stringify([crew])]);

beforeAll(async () => {
  await db.init({ ungated: true });
  qa = await db.newPlayer('quinn_quester'); qb = await db.newPlayer('quade_quester');
  for (const p of [qa, qb]) { await putOn(p, 'moon'); await db.giveInk(p, 50); }
  await own(qa, 700, 300); await own(qb, 702, 300);
  await setQuests([
    { id: 'dig_3', metric: 'dig_m', target: 3, title: 'Dig 3 m', ink: 12, items: { stone: 8 } },
    { id: 'games_1', metric: 'games', target: 1, title: 'Play a game', ink: 10, items: {} },
    { id: 'build_1', metric: 'modules', target: 1, title: 'Build', ink: 10, items: {} },
  ], { id: 'crew_dig', metric: 'dig_m', target: 8, min_share: 2, title: 'Crew dig', ink: 20, items: { gem: 1 } });
});
afterAll(() => db.close());

describe('planet quests', () => {
  it('three quests a day, the same for everyone on the world', async () => {
    const a = await db.rpc(qa, 'planet_quests', { p_world: 'moon' });
    const b = await db.rpc(qb, 'planet_quests', { p_world: 'moon' });
    expect(a.solo.map((q: any) => q.id).sort()).toEqual(['build_1', 'dig_3', 'games_1']);
    expect(b.solo.map((q: any) => q.id)).toEqual(a.solo.map((q: any) => q.id));
    expect(a.solo.every((q: any) => q.progress === 0 && !q.done && !q.claimed)).toBe(true);
    expect(a.crew).toMatchObject({ id: 'crew_dig', progress: 0, can_claim: false });
  });

  it('digging counts, and the quest pays once', async () => {
    await expectError(db.rpc(qa, 'planet_quest_claim', { p_world: 'moon', p_quest: 'dig_3' }), 'quest_not_done');
    await db.rpc(qa, 'planet_dig', { p_world: 'moon', p_taps: 5, p_gx: 700, p_gy: 300 });
    const q = await db.rpc(qa, 'planet_quests', { p_world: 'moon' });
    expect(q.solo.find((x: any) => x.id === 'dig_3')).toMatchObject({ progress: 5, done: true });
    const c = await db.rpc(qa, 'planet_quest_claim', { p_world: 'moon', p_quest: 'dig_3' });
    expect(c).toMatchObject({ claimed_quest: 'dig_3', paid: 12, items_got: { stone: 8 } });
    expect(c.solo.find((x: any) => x.id === 'dig_3').claimed).toBe(true);
    await expectError(db.rpc(qa, 'planet_quest_claim', { p_world: 'moon', p_quest: 'dig_3' }), 'quest_claimed');
    await expectError(db.rpc(qa, 'planet_quest_claim', { p_world: 'moon', p_quest: 'nope' }), 'not_found');
  });

  it('digging together is a dig party: faster for both', async () => {
    await db.rpc(qa, 'planet_live', { p_world: 'moon', p_d: [0, 0, 1] }); await db.rpc(qb, 'planet_live', { p_world: 'moon', p_d: [0, 0, 1] });
    await ready(qa); await ready(qb);
    await db.rpc(qa, 'planet_dig', { p_world: 'moon', p_taps: 1, p_gx: 700, p_gy: 300 });
    const r = await db.rpc(qb, 'planet_dig', { p_world: 'moon', p_taps: 4, p_gx: 702, p_gy: 300 });
    expect(r).toMatchObject({ party: 1, party_mult: 1.25 });
    expect(Number(r.depth)).toBeCloseTo(5, 5); // 4 taps x 1.25 m
  });

  it('the crew quest: everyone who pitched in can claim once the crew gets there', async () => {
    let q = await db.rpc(qb, 'planet_quests', { p_world: 'moon' });
    expect(Number(q.crew.progress)).toBeCloseTo(11, 0); // 5 + 1.25 + 5 (+ the shovel's first taps)
    expect(q.crew.done).toBe(true);
    expect(q.crew.crew.map((p: any) => p.username).sort()).toEqual(['quade_quester', 'quinn_quester']);
    const c = await db.rpc(qb, 'planet_quest_claim', { p_world: 'moon', p_quest: 'crew_dig' });
    expect(c.items_got).toEqual({ gem: 1 });
    // someone who didn't pitch in can't
    const qc = await db.newPlayer('quiet_quester'); await putOn(qc, 'moon');
    await expectError(db.rpc(qc, 'planet_quest_claim', { p_world: 'moon', p_quest: 'crew_dig' }), 'quest_no_share');
  });

  it('building and driving count too', async () => {
    await db.sql(`insert into planet_bases (world, gx, gy, owner_id) values ('moon', 700, 300, $1)`, [qa]);
    await db.rpc(qa, 'planet_base_save', { p_world: 'moon', p_gx: 700, p_gy: 300, p_layout: [{ id: 'f1', k: 'flag', x: 1, y: 1 }], p_rev: 0 });
    const q = await db.rpc(qa, 'planet_quests', { p_world: 'moon' });
    expect(q.solo.find((x: any) => x.id === 'build_1')).toMatchObject({ progress: 1, done: true });
    // a second save that adds nothing new doesn't count again
    await db.rpc(qa, 'planet_base_save', { p_world: 'moon', p_gx: 700, p_gy: 300, p_layout: [{ id: 'f1', k: 'flag', x: 2, y: 1 }], p_rev: 1 });
    expect((await db.rpc(qa, 'planet_quests', { p_world: 'moon' })).solo.find((x: any) => x.id === 'build_1').progress).toBe(1);
  });
});
