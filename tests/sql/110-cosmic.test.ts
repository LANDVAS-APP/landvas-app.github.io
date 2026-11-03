// v0.30 Cosmic rarities (roll on claim, multiply game Ink, unlock bonus games) and meteor showers.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let a: string, b: string;
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const age = (session: string) => db.sql(`update planet_games set started_at = now() - interval '70 seconds' where id = $1`, [session]);

beforeAll(async () => {
  await db.init({ ungated: true });
  a = await db.newPlayer('cosmo_a'); b = await db.newPlayer('cosmo_b');
  await db.giveInk(a, 5000); await db.giveInk(b, 5000);
  await putOn(a, 'moon'); await putOn(b, 'moon');
});
afterAll(() => db.close());

describe('Cosmic rarities', () => {
  it('a claim rolls a rarity that everyone sees', async () => {
    const r = await db.rpc(a, 'planet_claim', { p_world: 'moon', p_gx: 1, p_gy: 30 });
    expect(['dust', 'comet', 'nebula', 'pulsar', 'supernova', 'singularity']).toContain(r.rarity);
    expect(r.rarities).toHaveLength(6);
    const seen = await db.rpc(b, 'planet_plots_near', { p_world: 'moon', p_gx0: 0, p_gx1: 5, p_gy0: 28, p_gy1: 32 });
    expect(seen[0].rarity).toBe(r.rarity);
  });

  it('rarer worlds roll rarer plots', async () => {
    const roll = async (world: string) => (await db.sql(`select private.roll_cosmic($1) r from generate_series(1, 3000)`, [world])).filter((x: any) => x.r !== 'dust').length;
    expect(await roll('pluto')).toBeGreaterThan(await roll('moon'));
  });

  it('Nebula and up unlock the bonus game and every rarity multiplies game Ink', async () => {
    await db.sql(`update planet_plots set rarity = 'dust' where gx = 1 and gy = 30`);
    await expectError(db.rpc(a, 'planet_game_start', { p_world: 'moon', p_gx: 1, p_gy: 30, p_game: 'regolith' }), 'invalid_game');
    await db.sql(`update planet_plots set rarity = 'supernova' where gx = 1 and gy = 30`);
    const g = await db.rpc(a, 'planet_game_start', { p_world: 'moon', p_gx: 1, p_gy: 30, p_game: 'regolith' });
    expect(g).toMatchObject({ rarity: 'supernova', mult: 1.75 });
    await age(g.session);
    const r = await db.rpc(a, 'planet_game_finish', { p_session: g.session, p_score: 160 });
    expect(r.earned).toBe(Math.floor(26 * 1.75)); // 160/6 = 26 Ink x 1.75
    expect((await db.rpc(a, 'my_planet_plots'))[0].games).toEqual(['moonlander', 'rockrun', 'regolith']);
  });
});

describe('Meteor showers', () => {
  it('everyone sees the same shower; the first one there takes each meteorite', async () => {
    const s1 = await db.rpc(a, 'planet_meteors', { p_world: 'moon' });
    const s2 = await db.rpc(b, 'planet_meteors', { p_world: 'moon' });
    expect(s1.meteors).toHaveLength(8);
    expect(s2.meteors).toEqual(s1.meteors);
    const met = s1.meteors[0];
    // too far away (no live position yet)
    await expectError(db.rpc(a, 'planet_meteor_grab', { p_world: 'moon', p_idx: 0 }), 'too_far');
    await db.rpc(a, 'planet_live', { p_world: 'moon', p_d: met.d });
    await db.rpc(b, 'planet_live', { p_world: 'moon', p_d: met.d });
    const got = await db.rpc(a, 'planet_meteor_grab', { p_world: 'moon', p_idx: 0, p_d: met.d });
    expect(got.paid).toBeGreaterThanOrEqual(3);
    await expectError(db.rpc(b, 'planet_meteor_grab', { p_world: 'moon', p_idx: 0, p_d: met.d }), 'meteor_taken');
    // a far-off claimed position doesn't let you reach across the Moon
    const far = s1.meteors.find((m: any) => Math.acos(m.d[0] * met.d[0] + m.d[1] * met.d[1] + m.d[2] * met.d[2]) * (1000 * 8 * 180 / (144 * Math.PI)) > 60);
    if (far) await expectError(db.rpc(b, 'planet_meteor_grab', { p_world: 'moon', p_idx: far.i, p_d: far.d }), 'too_far');
    const after = await db.rpc(b, 'planet_meteors', { p_world: 'moon' });
    expect(after.meteors[0]).toMatchObject({ taken: true, by: 'cosmo_a', mine: false });
  });
});
