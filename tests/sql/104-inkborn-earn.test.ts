// v0.23 Inkborn economy: first creature free then 100 Ink; springs, jobs and Inkborn games earn Ink under one daily cap.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ivy: string;
const genome = { body: 'round', color: '#7FD3F5', belly: '#FFFFFF', eyes: 'big', ears: 'bunny', tail: 'curl', mood: 'foodie' };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const make = (uid: string, key: string, name: string) => db.rpc(uid, 'inkborn_create', { p_client_key: key, p_name: name, p_source: 'random', p_genome: genome, p_drawing: null });

beforeAll(async () => {
  await db.init({ ungated: true });
  ivy = await db.newPlayer('ivy_keeper');
});
afterAll(() => db.close());

describe('Inkborn economy', () => {
  let c1: string, c2: string;
  it('the first creature is free, the next costs 100 Ink (once, even if the save is sent twice)', async () => {
    expect((await db.rpc(ivy, 'inkborn_economy')).next_cost).toBe(0);
    c1 = (await make(ivy, 'ivy-creature-000001', 'Bloop')).id;
    expect(await ink(ivy)).toBe(0);
    expect((await db.rpc(ivy, 'inkborn_economy')).next_cost).toBe(100);
    await expectError(make(ivy, 'ivy-creature-000002', 'Zip'), 'insufficient_funds');
    await db.giveInk(ivy, 150);
    const z = await make(ivy, 'ivy-creature-000002', 'Zip');
    c2 = z.id;
    expect(z.ink_spent).toBe(100);
    await make(ivy, 'ivy-creature-000002', 'Zip');
    expect(await ink(ivy)).toBe(50);
    // releasing doesn't make the next one free
    await db.rpc(ivy, 'inkborn_release', { p_id: c2 });
    expect((await db.rpc(ivy, 'inkborn_economy')).next_cost).toBe(100);
  });

  it('happy creatures fill the Ink Spring over time; collecting pays once', async () => {
    const s = await db.rpc(ivy, 'my_sanctuaries');
    const hid = s.starter_id;
    await db.sql(`update habitats set spring_at = now() - interval '3 hours', layout = '[{"id":"s1","k":"inkspring","x":8,"y":8}]' where id = $1`, [hid]);
    const st = await db.rpc(ivy, 'habitat_spring', { p_id: hid });
    expect(st.happy).toBe(1);
    expect(st.springs).toBe(1);
    expect(st.ready).toBe(9); // 3 h × (1 happy creature × 2 + 1 spring × 1)
    const before = await ink(ivy);
    const r = await db.rpc(ivy, 'habitat_collect', { p_id: hid });
    expect(r.paid).toBe(9);
    expect(await ink(ivy)).toBe(before + 9);
    expect((await db.rpc(ivy, 'habitat_collect', { p_id: hid })).paid).toBe(0);
  });

  it('jobs take energy and time, then bring back Ink', async () => {
    await db.sql(`update inkborn set energy = 100, stats_at = now() where id = $1`, [c1]);
    const j = await db.rpc(ivy, 'inkborn_job_start', { p_id: c1, p_job: 'forage' });
    expect(j.job).toBe('forage');
    expect(j.energy).toBe(85);
    await expectError(db.rpc(ivy, 'inkborn_job_claim', { p_id: c1 }), 'job_not_done');
    await expectError(db.rpc(ivy, 'inkborn_game_start', { p_id: c1, p_game: 'berrydash' }), 'inkborn_busy');
    await db.sql(`update inkborn set job_until = now() - interval '1 minute' where id = $1`, [c1]);
    const before = await ink(ivy);
    const r = await db.rpc(ivy, 'inkborn_job_claim', { p_id: c1 });
    expect(r.paid).toBe(6);
    expect(await ink(ivy)).toBe(before + 6);
    expect(r.job).toBeNull();
  });

  it('Inkborn games pay by score, need the clock to run, and use energy', async () => {
    const g = await db.rpc(ivy, 'inkborn_game_start', { p_id: c1, p_game: 'berrydash' });
    await expectError(db.rpc(ivy, 'inkborn_game_finish', { p_session: g.session, p_score: 60 }), 'game_too_fast');
    await db.sql(`update inkborn_games set started_at = now() - interval '50 seconds' where id = $1`, [g.session]);
    const r = await db.rpc(ivy, 'inkborn_game_finish', { p_session: g.session, p_score: 9999 });
    expect(r.score).toBe(140); // capped at the game's max
    expect(r.paid).toBe(25);
    const again = await db.rpc(ivy, 'inkborn_game_finish', { p_session: g.session, p_score: 50 });
    expect(again.repeat).toBe(true);
    await db.sql(`update inkborn set energy = 5, stats_at = now() where id = $1`, [c1]);
    await expectError(db.rpc(ivy, 'inkborn_game_start', { p_id: c1, p_game: 'fireflies' }), 'inkborn_tired');
  });

  it('everything Inkborn pays shares one daily cap', async () => {
    await db.sql(`update inkborn_keepers set ink_today = 148 where owner_id = $1`, [ivy]);
    await db.sql(`update inkborn set energy = 100, stats_at = now() where id = $1`, [c1]);
    const g = await db.rpc(ivy, 'inkborn_game_start', { p_id: c1, p_game: 'fireflies' });
    await db.sql(`update inkborn_games set started_at = now() - interval '45 seconds' where id = $1`, [g.session]);
    const r = await db.rpc(ivy, 'inkborn_game_finish', { p_session: g.session, p_score: 60 });
    expect(r.earned).toBe(20);
    expect(r.paid).toBe(2);
    expect(r.capped).toBe(true);
  });

  it('only the keeper can collect, send or play', async () => {
    const other = await db.newPlayer('not_ivy');
    await expectError(db.rpc(other, 'inkborn_job_start', { p_id: c1, p_job: 'forage' }), 'not_owner');
    await expectError(db.rpc(other, 'inkborn_game_start', { p_id: c1, p_game: 'berrydash' }), 'not_owner');
  });
});
