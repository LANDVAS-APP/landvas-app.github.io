// The Mirror Arcade: hidden until a player plays five cabinets in the logo's colour order (Rose, Amber, Sun, Mint, Sky)
// in one arcade; then every ordinary cabinet (mirrored) plus four of its own, paying 3x Ink with no cap, never posted.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, vi: string, arcId: string;
const A = { gx: 3_410_000, gy: 2_110_000 };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const play = async (uid: string, game: string, score: number, secs = 60) => {
  const s = await db.rpc(uid, 'arcade_start', { p_arcade: arcId, p_game: game });
  await db.sql(`update arcade_plays set started_at = now() - make_interval(secs => $2) where id = $1`, [s.session, secs]);
  await db.rpc(uid, 'arcade_finish', { p_session: s.session, p_score: score });
  return s.session as string;
};
const check = (uid: string, session: string) => db.rpc(uid, 'arcade_mirror_check', { p_session: session });
const mplay = async (uid: string, game: string, score: number, secs = 60, mode = 'classic') => {
  const s = await db.rpc(uid, 'arcade_mirror_start', { p_game: game, p_mode: mode });
  await db.sql(`update arcade_mirror_plays set started_at = now() - make_interval(secs => $2) where id = $1`, [s.session, secs]);
  return db.rpc(uid, 'arcade_mirror_finish', { p_session: s.session, p_score: score });
};

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  await db.sql(`update game_config set value = jsonb_set(value, '{steps}', '[[1, 1]]') where key = 'plot_access'`);
  ow = await db.newPlayer('mir_owner'); vi = await db.newPlayer('mir_visitor');
  await db.giveInk(ow, 100);
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const groupId = (await db.rpc(ow, 'my_groups'))[0].id;
  arcId = (await db.rpc(ow, 'set_group_kind', { p_group_id: groupId, p_kind: 'arcade' })).arcade_id;
  await db.sql(`update arcades set machines = '{"stacker": 1, "cyclone": 1, "skeeball": 1, "pusher": 1, "bop": 1, "snake": 1}' where id = $1`, [arcId]);
});
afterAll(() => db.close());

describe('The Mirror Arcade', () => {
  it('is hidden: nothing in game_config, nothing for someone who hasn’t found it', async () => {
    expect(JSON.stringify(await db.sql(`select value from game_config`))).not.toMatch(/Twin Drops|arcade_mirror|"glass": \{"order"/);
    expect(await db.rpc(vi, 'arcade_mirror_get', {})).toEqual({ found: false });
    await expectError(db.rpc(vi, 'arcade_mirror_start', { p_game: 'twin' }), 'not_found');
  });

  it('the wrong order, a zero score or an older round never opens it', async () => {
    // right colours, wrong order (Mint and Sky swapped)
    for (const g of ['stacker', 'skeeball', 'pusher', 'cyclone']) await play(vi, g, 50);
    let last = await play(vi, 'bop', 50);
    expect(await check(vi, last)).toEqual({ opened: false });
    // the right order, but one round scored nothing
    for (const g of ['stacker', 'skeeball']) await play(vi, g, 50);
    await play(vi, 'pusher', 0);
    await play(vi, 'bop', 50);
    last = await play(vi, 'cyclone', 50);
    expect(await check(vi, last)).toEqual({ opened: false });
    // the right order, but something else in between
    for (const g of ['stacker', 'skeeball', 'pusher', 'snake', 'bop']) await play(vi, g, 50);
    last = await play(vi, 'cyclone', 50);
    expect(await check(vi, last)).toEqual({ opened: false });
    expect(await db.rpc(vi, 'arcade_mirror_get', {})).toEqual({ found: false });
  });

  it('Rose, Amber, Sun, Mint, Sky opens it, once, with a bounty', async () => {
    const before = await ink(vi);
    const ids: string[] = [];
    for (const g of ['stacker', 'skeeball', 'pusher', 'bop']) ids.push(await play(vi, g, 40));
    expect(await check(vi, ids[3])).toEqual({ opened: false });
    const last = await play(vi, 'cyclone', 40);
    expect(await check(vi, ids[2])).toEqual({ opened: false }); // only the round that just finished counts
    const r = await check(vi, last);
    expect(r).toMatchObject({ opened: true, first: true, bounty: 500 });
    expect(await ink(vi) - before).toBeGreaterThanOrEqual(500);
    const again = await check(vi, last);
    expect(again).toMatchObject({ opened: true, first: false, bounty: 0 });
  });

  it('then it lists every ordinary cabinet plus its own four, and only finders see each other on its boards', async () => {
    const m = await db.rpc(vi, 'arcade_mirror_get', {});
    expect(m.found).toBe(true);
    expect(m.ink_mult).toBe(3);
    const ids = m.games.map((g: any) => g.id);
    expect(ids.slice(-4)).toEqual(['twin', 'glass', 'flip', 'sym']);
    expect(ids).toContain('stacker'); expect(ids).toContain('pinball');
    expect(m.games.filter((g: any) => g.own).length).toBe(4);
    expect(m.games.length).toBe(20);
  });

  it('pays 3x Ink, uncapped and unpaced even with Ink Flow on, and tickets as usual', async () => {
    await db.sql(`update game_config set value = value || '{"enabled": true, "uncapped": false}'::jsonb where key = 'ink_pacing'`);
    await db.sql(`update game_config set value = value || '{"daily_ink_cap": 1}'::jsonb where key = 'arcade'`);
    const before = await ink(vi);
    // Twin Drops: 1,500 points a Ink normally, so 3 Ink for 1,500 points; 0.05 tickets a point
    const r = await mplay(vi, 'twin', 1500);
    expect(r).toMatchObject({ score: 1500, tickets: 75, paid: 3, new_best: true, new_record: true });
    // a mirrored ordinary cabinet: stacker pays an Ink per 160 points, so 3 per 160 here
    const r2 = await mplay(vi, 'stacker', 320, 60);
    expect(r2.paid).toBe(6);
    // endless runs: the whole score counts, however big (no per-run cap)
    const r3 = await mplay(vi, 'twin', 9000, 120, 'endless');
    expect(r3.score).toBe(9000);
    expect(r3.paid).toBe(18);
    expect(await ink(vi) - before).toBe(3 + 6 + 18);
    await db.sql(`update game_config set value = value || '{"enabled": false}'::jsonb where key = 'ink_pacing'`);
  });

  it('keeps the usual anti-cheat limits', async () => {
    const s = await db.rpc(vi, 'arcade_mirror_start', { p_game: 'glass' });
    await expectError(db.rpc(vi, 'arcade_mirror_finish', { p_session: s.session, p_score: 10 }), 'game_too_fast');
    await db.sql(`update arcade_mirror_plays set started_at = now() - interval '10 seconds' where id = $1`, [s.session]);
    const r = await db.rpc(vi, 'arcade_mirror_finish', { p_session: s.session, p_score: 999999 });
    expect(r.score).toBeLessThanOrEqual(200 * 11);
    expect((await db.rpc(vi, 'arcade_mirror_finish', { p_session: s.session, p_score: 5 })).repeat).toBe(true);
    await expectError(db.rpc(vi, 'arcade_mirror_start', { p_game: 'nope' }), 'invalid_game');
  });

  it('is never posted: no feed events, no ordinary arcade rounds, its own boards', async () => {
    const feed = await db.sql(`select count(*)::int n from feed_events where player_id = $1 and data::text ilike '%twin%'`, [vi]);
    expect(feed[0].n).toBe(0);
    const plays = await db.sql(`select count(*)::int n from arcade_plays where game in ('twin', 'glass', 'flip', 'sym')`);
    expect(plays[0].n).toBe(0);
    const m = await db.rpc(vi, 'arcade_mirror_get', {});
    expect(m.boards.twin[0]).toMatchObject({ score: 1500 });
    expect(m.boards_endless.twin[0]).toMatchObject({ score: 9000 });
    expect(m.best.twin).toBe(1500);
    // the owner of the arcade it was found in hasn't found it
    expect(await db.rpc(ow, 'arcade_mirror_get', {})).toEqual({ found: false });
  });
});
