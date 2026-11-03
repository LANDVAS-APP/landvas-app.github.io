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

  it('flying takes real time; the Moon is free; far worlds need a bigger engine', async () => {
    await expectError(db.rpc(sol, 'space_launch', { p_dest: 'jupiter' }), 'engine_too_small');
    const s = await db.rpc(sol, 'space_launch', { p_dest: 'moon' });
    expect(s.dest).toBe('moon');
    expect(s.fuel_spent).toBe(0);
    await expectError(db.rpc(sol, 'space_launch', { p_dest: 'mars' }), 'space_in_flight');
    expect((await db.rpc(sol, 'space_state')).location).toBe('earth');
    await land(sol);
    const there = await db.rpc(sol, 'space_state');
    expect(there).toMatchObject({ location: 'moon', dest: null });
    expect(there.visited).toContain('moon');
  });

  it('samples pay once a day per world, plus a first-visit bonus', async () => {
    const before = await ink(sol);
    const r = await db.rpc(sol, 'space_collect');
    expect(r.paid).toBe(3);
    expect(r.first_bonus).toBe(10);
    expect(await ink(sol)).toBe(before + 13);
    await expectError(db.rpc(sol, 'space_collect'), 'samples_taken');
  });

  it('fuel costs Ink; upgrading the engine opens the outer planets; coming home is free', async () => {
    let s = await db.rpc(sol, 'space_launch', { p_dest: 'mars' });
    expect(s.fuel_spent).toBe(5);
    await land(sol);
    await db.giveInk(sol, 1200);
    s = await db.rpc(sol, 'space_upgrade_engine');
    expect(s.engine).toBe(2);
    s = await db.rpc(sol, 'space_upgrade_engine');
    expect(s.engine).toBe(3);
    await expectError(db.rpc(sol, 'space_upgrade_engine'), 'engine_maxed');
    const home = await db.rpc(sol, 'space_launch', { p_dest: 'earth' });
    expect(home.fuel_spent).toBe(0);
    await land(sol);
    expect((await db.rpc(sol, 'space_state')).location).toBe('earth');
  });

  it('a random far-off world can become your home, and you can fly back to it', async () => {
    await expectError(db.rpc(sol, 'space_settle', { p_name: 'Nope' }), 'not_on_a_world');
    const s = await db.rpc(sol, 'space_launch', { p_dest: 'exo' });
    expect(s.dest).toMatch(/^exo:\d+$/);
    await land(sol);
    const st = await db.rpc(sol, 'space_settle', { p_name: 'New Inkhaven' });
    expect(st.home_name).toBe('New Inkhaven');
    expect(st.home_seed).toBe(st.exo_seed);
    await db.rpc(sol, 'space_launch', { p_dest: 'earth' }); await land(sol);
    const back = await db.rpc(sol, 'space_launch', { p_dest: 'home' });
    expect(back.dest).toBe(`exo:${st.home_seed}`);
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
