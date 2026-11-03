// v0.25 Space: build a rocket from four parts, fly to worlds (engine tiers, fuel, real-time travel),
// collect samples once a day, settle a far-off world, and space minigames under a daily cap.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let sol: string, eve: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const land = (uid: string) => db.sql(`update space_pilots set arrive_at = now() - interval '1 second' where player_id = $1`, [uid]);

beforeAll(async () => {
  await db.init({ ungated: true });
  sol = await db.newPlayer('sol_pilot');
  eve = await db.newPlayer('eve_pilot');
});
afterAll(() => db.close());

describe('Space', () => {
  it('a rocket is four parts bought with Ink (each once)', async () => {
    const s0 = await db.rpc(sol, 'space_state');
    expect(s0).toMatchObject({ built: false, location: 'earth', engine: 1 });
    await expectError(db.rpc(sol, 'space_build', { p_part: 'nose' }), 'insufficient_funds');
    await db.giveInk(sol, 1000);
    for (const p of ['nose', 'fins', 'tank']) await db.rpc(sol, 'space_build', { p_part: p });
    await expectError(db.rpc(sol, 'space_launch', { p_dest: 'moon' }), 'rocket_not_built');
    const s = await db.rpc(sol, 'space_build', { p_part: 'engine' });
    expect(s.built).toBe(true);
    await db.rpc(sol, 'space_build', { p_part: 'engine' }); // again: no second charge
    expect(await ink(sol)).toBe(900);
    await expectError(db.rpc(sol, 'space_build', { p_part: 'wings' }), 'invalid_part');
  });

  it('worlds your engine reaches are a free, instant warp; far ones need a bigger engine', async () => {
    await expectError(db.rpc(sol, 'space_launch', { p_dest: 'jupiter' }), 'engine_too_small');
    const before = await ink(sol);
    const s = await db.rpc(sol, 'space_launch', { p_dest: 'moon' });
    expect(s).toMatchObject({ location: 'moon', dest: null, warped: true, fuel_spent: 0 });
    expect(s.visited).toContain('moon');
    expect(s.warps).toEqual(expect.arrayContaining(['earth', 'moon', 'mars']));
    expect(s.warps).not.toContain('jupiter');
    expect(await ink(sol)).toBe(before);
  });

  it('samples pay once a day per world, plus a first-visit bonus', async () => {
    const before = await ink(sol);
    const r = await db.rpc(sol, 'space_collect');
    expect(r.paid).toBe(3);
    expect(r.first_bonus).toBe(10);
    expect(await ink(sol)).toBe(before + 13);
    await expectError(db.rpc(sol, 'space_collect'), 'samples_taken');
  });

  it('upgrading the engine opens the outer planets — also free and instant; so is coming home', async () => {
    const s = await db.rpc(sol, 'space_launch', { p_dest: 'mars' });
    expect(s).toMatchObject({ location: 'mars', fuel_spent: 0 });
    await db.giveInk(sol, 1200);
    expect((await db.rpc(sol, 'space_upgrade_engine')).engine).toBe(2);
    const up = await db.rpc(sol, 'space_upgrade_engine');
    expect(up.engine).toBe(3);
    expect(up.warps).toContain('neptune');
    await expectError(db.rpc(sol, 'space_upgrade_engine'), 'engine_maxed');
    expect((await db.rpc(sol, 'space_launch', { p_dest: 'neptune' })).location).toBe('neptune');
    const home = await db.rpc(sol, 'space_launch', { p_dest: 'earth' });
    expect(home).toMatchObject({ location: 'earth', fuel_spent: 0 });
  });

  it('a new far-off world takes a real trip; once settled (or visited) it is a free warp too', async () => {
    await expectError(db.rpc(sol, 'space_settle', { p_name: 'Nope' }), 'not_on_a_world');
    const s = await db.rpc(sol, 'space_launch', { p_dest: 'exo' });
    expect(s.dest).toMatch(/^exo:\d+$/);
    expect(s.warped).toBe(false);
    await land(sol);
    const st = await db.rpc(sol, 'space_settle', { p_name: 'New Inkhaven' });
    expect(st.home_name).toBe('New Inkhaven');
    expect(st.home_seed).toBe(st.exo_seed);
    expect(st.warps).toContain(`exo:${st.home_seed}`);
    await db.rpc(sol, 'space_launch', { p_dest: 'earth' });
    const back = await db.rpc(sol, 'space_launch', { p_dest: 'home' });
    expect(back).toMatchObject({ location: `exo:${st.home_seed}`, dest: null, warped: true });
    await expectError(db.rpc(sol, 'space_launch', { p_dest: 'exo:12345' }), 'invalid_world');
    await expectError(db.rpc(eve, 'space_launch', { p_dest: 'home' }), 'rocket_not_built');
  });

  it('space minigames pay Ink under the daily cap and need a real round', async () => {
    const g = await db.rpc(sol, 'space_game_start', { p_game: 'asteroids' });
    await expectError(db.rpc(sol, 'space_game_finish', { p_session: g.session, p_score: 50 }), 'game_too_fast');
    await db.sql(`update space_games set started_at = now() - interval '1 minute' where id = $1`, [g.session]);
    const f = await db.rpc(sol, 'space_game_finish', { p_session: g.session, p_score: 99999 });
    expect(f.score).toBe(150);
    expect(f.earned).toBe(25);
    expect((await db.rpc(sol, 'space_game_finish', { p_session: g.session, p_score: 10 })).repeat).toBe(true);
    // fill the day's cap
    await db.sql(`update space_pilots set ink_today = 145, ink_day = private.day_start(now()) where player_id = $1`, [sol]);
    const g2 = await db.rpc(sol, 'space_game_start', { p_game: 'lander' });
    await db.sql(`update space_games set started_at = now() - interval '1 minute' where id = $1`, [g2.session]);
    const f2 = await db.rpc(sol, 'space_game_finish', { p_session: g2.session, p_score: 120 });
    expect(f2.paid).toBe(5);
    expect(f2.capped).toBe(true);
    await expectError(db.rpc(eve, 'space_game_start', { p_game: 'asteroids' }), 'rocket_not_built');
  });

  it('the planet card shows who has been there', async () => {
    const w = await db.rpc(eve, 'space_world', { p_world: 'moon' });
    expect(Number(w.pilots)).toBe(1);
    expect(w.recent[0].username).toBe('sol_pilot');
  });
});

describe('Space fast travel', () => {
  it('a trip somewhere new can be rushed for a little Ink — or redirected by warping', async () => {
    const u = await db.newPlayer('rush_pilot');
    await db.giveInk(u, 500);
    for (const p of ['nose', 'fins', 'tank', 'engine']) await db.rpc(u, 'space_build', { p_part: p });
    await db.sql(`update space_pilots set engine = 3 where player_id = $1`, [u]);
    await expectError(db.rpc(u, 'space_rush'), 'not_in_flight');
    const s = await db.rpc(u, 'space_launch', { p_dest: 'exo' });
    expect(s.rush_cost).toBeGreaterThan(0);
    const before = await ink(u);
    const r = await db.rpc(u, 'space_rush');
    expect(r.rush_paid).toBe(s.rush_cost);
    expect(r.location).toBe(s.dest);
    expect(await ink(u)).toBe(before - s.rush_cost);
    // mid-flight to somewhere new, warp somewhere you know instead
    await db.rpc(u, 'space_launch', { p_dest: 'exo' });
    const w = await db.rpc(u, 'space_launch', { p_dest: 'moon' });
    expect(w).toMatchObject({ location: 'moon', dest: null, warped: true });
  });
});
