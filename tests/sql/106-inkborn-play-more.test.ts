// v0.24 Inkborn: more care actions (brush, fetch, trick, bathe, hide & seek), new games, and habitat residents on the map.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ada: string, bo: string, creature: string, groupId: string;
const A = { gx: 3_100_000, gy: 1_950_000 };
const genome = { body: 'round', color: '#7FD3F5', belly: '#FFFFFF', eyes: 'big', ears: 'bunny', tail: 'curl', mood: 'playful' };
const care = (a: string) => db.rpc(ada, 'inkborn_care', { p_id: creature, p_action: a });

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ada = await db.newPlayer('ada_keeper');
  bo = await db.newPlayer('bo_visitor');
  await db.rpc(ada, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  creature = (await db.rpc(ada, 'inkborn_create', { p_client_key: 'ada-creature-0001', p_name: 'Fizz', p_source: 'random', p_genome: genome, p_drawing: null })).id;
  await db.sql(`update inkborn set energy = 100, happiness = 60, stats_at = now() where id = $1`, [creature]);
});
afterAll(() => db.close());

describe('Inkborn: more ways to play', () => {
  it('brushing and bathing grow bond once, then just make them a bit happier until the cooldown passes', async () => {
    const b1 = await care('brush');
    expect(b1.reaction).toBe('shiny');
    expect(b1.bond_gain).toBe(2);
    const b2 = await care('brush');
    expect(b2.reaction).toBe('fluffy');
    expect(b2.bond_gain).toBe(0);
    expect((await care('bathe')).reaction).toBe('splash');
    expect((await care('bathe')).reaction).toBe('clean');
  });

  it('fetch and hide & seek use a little energy; tricks need a Pal-level bond', async () => {
    await db.sql(`update inkborn set bond = 0 where id = $1`, [creature]);
    expect((await care('trick')).reaction).toBe('unsure');
    const f = await care('fetch');
    expect(f.reaction).toBe('fetch');
    expect(f.energy).toBe(95);
    const h = await care('hideseek');
    expect(h.reaction).toBe('found');
    expect(h.energy).toBe(85);
    expect((await care('hideseek')).reaction).toBe('again');
    await db.sql(`update inkborn set bond = 12 where id = $1`, [creature]);
    expect((await care('trick')).reaction).toBe('trick');
    await db.sql(`update inkborn set energy = 2, stats_at = now() where id = $1`, [creature]);
    expect((await care('fetch')).reaction).toBe('tired');
    await expectError(care('dance'), 'invalid_action');
    await expectError(db.rpc(bo, 'inkborn_care', { p_id: creature, p_action: 'brush' }), 'not_owner');
  });

  it('bond from care still stops at 40 a day', async () => {
    await db.sql(`update inkborn set bond_today = 39, bond_day = private.day_start(now()), energy = 100, stats_at = now(), care_at = '{}' where id = $1`, [creature]);
    const r = await care('play');
    expect(r.bond_gain).toBe(1);
    expect((await care('pet')).bond_gain).toBe(0);
  });

  it('the new games can be played and pay under the shared caps', async () => {
    await db.sql(`update inkborn set energy = 100, stats_at = now() where id = $1`, [creature]);
    for (const g of ['leafleap', 'lilyhop', 'songbloom']) {
      const s = await db.rpc(ada, 'inkborn_game_start', { p_id: creature, p_game: g });
      expect(s.game).toBe(g);
      await db.sql(`update inkborn_games set started_at = now() - interval '2 minutes' where id = $1`, [s.session]);
      const f = await db.rpc(ada, 'inkborn_game_finish', { p_session: s.session, p_score: 99999 });
      expect(f.earned).toBe(25);
    }
    expect(Object.keys((await db.rpc(ada, 'inkborn_economy')).games)).toEqual(expect.arrayContaining(['berrydash', 'fireflies', 'leafleap', 'lilyhop', 'songbloom']));
  });

  it('the map can see who lives on a habitat plot (but not creatures off on a job)', async () => {
    const g = (await db.rpc(ada, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === A.gx));
    groupId = g.id;
    // a canvas plot has no residents
    expect(await db.rpc({ role: 'anon' }, 'habitat_residents', { p_groups: [groupId] })).toEqual({});
    const hg = await db.rpc(ada, 'set_group_kind', { p_group_id: groupId, p_kind: 'habitat' });
    await db.rpc(ada, 'inkborn_move', { p_id: creature, p_habitat_id: hg.habitat_id });
    const r = await db.rpc({ role: 'anon' }, 'habitat_residents', { p_groups: [groupId, 'not-a-uuid'] });
    expect(r[groupId]).toHaveLength(1);
    expect(r[groupId][0]).toMatchObject({ name: 'Fizz', mine: false, personality: 'playful' });
    expect(r[groupId][0].genome.body).toBe('round');
    expect(r[groupId][0].drawing).toBeUndefined();
    expect((await db.rpc(ada, 'habitat_residents', { p_groups: [groupId] }))[groupId][0].mine).toBe(true);
    await db.sql(`update inkborn set job = 'forage', job_until = now() + interval '1 hour' where id = $1`, [creature]);
    expect((await db.rpc(bo, 'habitat_residents', { p_groups: [groupId] }))[groupId]).toEqual([]);
    await expectError(db.rpc(ada, 'inkborn_care', { p_id: creature, p_action: 'pet' }), 'inkborn_busy');
    await expectError(db.rpc(bo, 'habitat_residents', { p_groups: Array.from({ length: 65 }, () => groupId) }), 'too_many_groups');
  });
});
