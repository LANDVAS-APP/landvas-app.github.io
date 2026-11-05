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
    // 60 points: 15 tickets (+15 for the first round of the day; x2 if it's the hot cabinet), 60/160 of an Ink
    const hot = r.hot ? 2 : 1;
    expect(r).toMatchObject({ score: 60, tickets: 15 * hot + 15, paid: 0, new_best: true });
    expect(r.bonus).toContain('first');
    expect(await ink(ow)).toBe(before);
    const a = await db.rpc(ow, 'arcade_get', { p_id: arcId });
    expect(a.level.xp).toBe(15 * hot + 15);
    expect(a.me.tickets).toBe(15 * hot + 15);
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
    const r = await play(vi, 'cyclone', 1000);
    const hot = r.hot ? 2 : 1;
    expect(r.tickets).toBe(40 * hot + 15);
    expect(r.owner_cut).toBe(Math.floor(r.tickets * 0.1));
    expect((await db.rpc(ow, 'arcade_get', { p_id: arcId })).me.tickets).toBe(before + r.owner_cut);
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
    await db.sql(`update arcades set machines = machines - 'cyclone' - 'claw' where id = $1`, [arcId]); // make stacker the only (so hot) cabinet
    const r = await play(ow, 'stacker', 100);
    expect(r.hot).toBe(true);
    expect(r.tickets).toBe(60); // 100 x 0.25, +20% on a level 2 cabinet, x2 hot
    await db.sql(`update arcades set machines = machines || '{"cyclone": 1, "claw": 1}' where id = $1`, [arcId]);
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

  it('Ink has no daily limit, but comes a little at a time (fractions carry over)', async () => {
    await db.sql(`insert into arcade_ink_days (player_id, day, ink) values ($1, private.day_start(now()), 5000) on conflict (player_id, day) do update set ink = 5000`, [vi]);
    await db.sql(`update arcade_players set ink_frac = 0 where player_id = $1`, [vi]);
    const before = await ink(vi);
    const r1 = await play(vi, 'stacker', 600, 120);
    const k = r1.hot ? 1.5 : 1;
    expect(r1.paid).toBe(Math.floor((600 / 160) * k));
    expect(await ink(vi)).toBe(before + r1.paid);
    expect(r1.ink_progress).toBeCloseTo(((600 / 160) * k) % 1, 2);
  });

  it('Endless mode has no top score and its own boards', async () => {
    const s = await db.rpc(vi, 'arcade_start', { p_arcade: arcId, p_game: 'stacker', p_mode: 'endless' });
    await age(s.session, 300);
    const r = await db.rpc(vi, 'arcade_finish', { p_session: s.session, p_score: 2000 });
    expect(r).toMatchObject({ score: 2000, mode: 'endless' });
    const a = await db.rpc(vi, 'arcade_get', { p_id: arcId });
    expect(a.boards_endless.stacker[0].score).toBe(2000);
    expect(a.me.best_endless.stacker).toBe(2000);
    expect((await db.rpc(vi, 'arcade_hall_of_fame', { p_game: 'stacker', p_mode: 'endless' }))[0].score).toBe(2000);
    // Classic still stops at the cabinet's top
    const c = await play(vi, 'stacker', 5000, 3000);
    expect(c.score).toBe(900);
  });

  it('tickets buy arcade-only cosmetics (never Ink), and Inkborn can wear them', async () => {
    await db.sql(`update arcade_players set tickets = 10000 where player_id = $1`, [vi]);
    await expectError(db.rpc(vi, 'purchase_unlock', { p_key: 'explorer.hat.pixelcrown', p_idempotency_key: 'arcade-pc-0001-abcdef' }), 'arcade_only');
    const c = await db.rpc(vi, 'arcade_cosmetic', { p_key: 'explorer.hat.pixelcrown' });
    expect(c.me.tickets).toBe(10000 - 2400);
    expect(c.me.owned).toContain('explorer.hat.pixelcrown');
    expect((await db.rpc(vi, 'equip_explorer', { p_style: { hat: 'pixelcrown' } })).explorer_style.hat).toBe('pixelcrown');
    await expectError(db.rpc(vi, 'arcade_cosmetic', { p_key: 'explorer.hat.pixelcrown' }), 'already_unlocked');
    // a creature, and its party hat
    const cr = await db.rpc(vi, 'inkborn_create', { p_client_key: 'arc-creature-1', p_name: 'Blip', p_source: 'random', p_genome: { body: 'round', color: '#FF3D9A', whead: 'crown' }, p_drawing: null });
    expect(cr.genome.whead).toBeUndefined(); // can't sneak it on
    await expectError(db.rpc(vi, 'inkborn_wear', { p_id: cr.id, p_slot: 'whead', p_item: 'party' }), 'not_owned');
    await db.rpc(vi, 'arcade_cosmetic', { p_key: 'inkborn.whead.party' });
    const w = await db.rpc(vi, 'inkborn_wear', { p_id: cr.id, p_slot: 'whead', p_item: 'party' });
    expect(w.genome.whead).toBe('party');
    // editing the creature keeps what it's wearing (and can't change it)
    const u = await db.rpc(vi, 'inkborn_update', { p_id: cr.id, p_name: 'Blip', p_genome: { body: 'bean', color: '#22E3FF', whead: 'crown' } });
    expect(u.genome).toMatchObject({ body: 'bean', whead: 'party' });
    expect((await db.rpc(vi, 'inkborn_wear', { p_id: cr.id, p_slot: 'whead', p_item: null })).genome.whead).toBeUndefined();
  });

  it('explorers can be male or female', async () => {
    const p = await db.rpc(vi, 'equip_explorer', { p_style: { sex: 'f' } });
    expect(p.explorer_style.sex).toBe('f');
    await expectError(db.rpc(vi, 'equip_explorer', { p_style: { sex: 'x' } }), 'unknown_item');
    const q = await db.rpc(ow, 'equip_explorer', { p_style: { hat: 'beret' } });
    expect(q.explorer_style.sex).toBeUndefined();
  });
});
