// v0.56 Arcade plots: free skill games for tickets, levels, cabinets, upgrades, prizes, decor, boards, daily bonus; explorer sex.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, vi: string, arcId: string, groupId: string;
const A = { gx: 3_310_000, gy: 2_010_000 };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const age = (session: string, secs: number) => db.sql(`update arcade_plays set started_at = now() - make_interval(secs => $2) where id = $1`, [session, secs]);
const play = async (uid: string, game: string, score: number, secs = 60) => {
  const s = await db.rpc(uid, 'arcade_start', { p_arcade: arcId, p_game: game });
  await age(s.session, secs);
  return db.rpc(uid, 'arcade_finish', { p_session: s.session, p_score: score });
};

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('arc_owner'); vi = await db.newPlayer('arc_visitor');
  await db.giveInk(ow, 100);
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  groupId = (await db.rpc(ow, 'my_groups'))[0].id;
});
afterAll(() => db.close());

describe('Arcade plots', () => {
  it('a plot becomes an arcade with two cabinets', async () => {
    const g = await db.rpc(ow, 'set_group_kind', { p_group_id: groupId, p_kind: 'arcade' });
    expect(g.kind).toBe('arcade');
    arcId = g.arcade_id;
    const a = await db.rpc(ow, 'arcade_get', { p_id: arcId });
    expect(a.mine).toBe(true);
    expect(Object.keys(a.machines).sort()).toEqual(['cyclone', 'stacker']);
    expect(a.level).toMatchObject({ level: 1, xp: 0 });
    expect(a.me.tickets).toBe(0);
    expect(await db.rpc(null, 'arcade_for_plot', { p_gx: A.gx, p_gy: A.gy })).toMatchObject({ arcade_id: arcId, level: 1 });
    await expectError(db.rpc(ow, 'arcade_start', { p_arcade: arcId, p_game: 'claw' }), 'machine_locked');
  });

  it('playing is free and pays tickets, a little Ink and arcade XP', async () => {
    const before = await ink(ow);
    const r = await play(ow, 'stacker', 60);
    expect(r).toMatchObject({ score: 60, tickets: 60, paid: 2, new_best: true });
    expect(await ink(ow)).toBe(before + 2);
    const a = await db.rpc(ow, 'arcade_get', { p_id: arcId });
    expect(a.level.xp).toBe(60);
    expect(a.me.tickets).toBe(60);
    expect(a.boards.stacker[0]).toMatchObject({ score: 60 });
  });

  it('scores are checked: not too fast, never past what the game allows', async () => {
    const s = await db.rpc(ow, 'arcade_start', { p_arcade: arcId, p_game: 'stacker' });
    await expectError(db.rpc(ow, 'arcade_finish', { p_session: s.session, p_score: 10 }), 'game_too_fast');
    await age(s.session, 5);
    const r = await db.rpc(ow, 'arcade_finish', { p_session: s.session, p_score: 900 });
    expect(r.score).toBeLessThanOrEqual(14 * 6);
    expect((await db.rpc(ow, 'arcade_finish', { p_session: s.session, p_score: 5 })).repeat).toBe(true);
  });

  it('visitors play too, and the owner gets a cut', async () => {
    const before = (await db.rpc(ow, 'arcade_get', { p_id: arcId })).me.tickets;
    const r = await play(vi, 'cyclone', 300);
    expect(r.tickets).toBe(90);
    expect(r.owner_cut).toBe(9);
    expect((await db.rpc(ow, 'arcade_get', { p_id: arcId })).me.tickets).toBe(before + 9);
  });

  it('levels unlock cabinets; tickets buy them, upgrade them, decorate and win prizes', async () => {
    await db.sql(`update arcade_players set tickets = 5000 where player_id = $1`, [ow]);
    await expectError(db.rpc(ow, 'arcade_unlock', { p_arcade: arcId, p_game: 'claw' }), 'level_too_low');
    await db.sql(`update arcades set xp = 20000 where id = $1`, [arcId]);
    let a = await db.rpc(ow, 'arcade_unlock', { p_arcade: arcId, p_game: 'claw' });
    expect(a.machines.claw).toBe(1);
    expect(a.me.tickets).toBe(5000 - 700);
    a = await db.rpc(ow, 'arcade_upgrade', { p_arcade: arcId, p_game: 'stacker' });
    expect(a.machines.stacker).toBe(2);
    const r = await play(ow, 'stacker', 50);
    expect(r.tickets).toBe(60); // +20% on a level 2 cabinet
    a = await db.rpc(ow, 'arcade_decor', { p_arcade: arcId, p_slot: 'neon', p_id: 'cyan' });
    expect(a.decor.neon).toBe('cyan');
    const t = a.me.tickets;
    a = await db.rpc(ow, 'arcade_decor', { p_arcade: arcId, p_slot: 'neon', p_id: 'pink' });
    expect(a.me.tickets).toBe(t); // owned already: free to switch back
    const p = await db.rpc(ow, 'arcade_prize', { p_prize: 'bear' });
    expect(p.me.prizes.bear).toBe(1);
    await expectError(db.rpc(vi, 'arcade_prize', { p_prize: 'trophy' }), 'not_enough_tickets');
    await expectError(db.rpc(vi, 'arcade_unlock', { p_arcade: arcId, p_game: 'hoops' }), 'not_owner');
  });

  it('a daily bonus with a streak, once a day', async () => {
    const d = await db.rpc(vi, 'arcade_daily', {});
    expect(d).toMatchObject({ tickets: 20, streak: 1 });
    await expectError(db.rpc(vi, 'arcade_daily', {}), 'already_done');
    await db.sql(`update arcade_players set bonus_day = bonus_day - interval '1 day' where player_id = $1`, [vi]);
    expect((await db.rpc(vi, 'arcade_daily', {})).streak).toBe(2);
  });

  it('Ink is capped a day', async () => {
    await db.sql(`insert into arcade_ink_days (player_id, day, ink) values ($1, private.day_start(now()), 119) on conflict (player_id, day) do update set ink = 119`, [vi]);
    const r = await play(vi, 'stacker', 300);
    expect(r).toMatchObject({ earned: 10, paid: 1, capped: true });
    expect((await db.rpc(vi, 'arcade_hall_of_fame', { p_game: 'stacker' }))[0].score).toBe(300);
  });

  it('explorers can be male or female', async () => {
    const p = await db.rpc(vi, 'equip_explorer', { p_style: { sex: 'f' } });
    expect(p.explorer_style.sex).toBe('f');
    await expectError(db.rpc(vi, 'equip_explorer', { p_style: { sex: 'x' } }), 'unknown_item');
    const q = await db.rpc(ow, 'equip_explorer', { p_style: { hat: 'beret' } });
    expect(q.explorer_style.sex).toBeUndefined();
  });
});
