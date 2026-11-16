// Arcade: Classic or Endless for Versus and Team, and scores with no top (what a run pays stays as before).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, b: string, arcId: string;
const A = { gx: 3_340_000, gy: 2_040_000 };
const live = (u: string) => db.rpc(u, 'arcade_live', { p_arcade: arcId, p_x: 0, p_z: 5 });
const age = (session: string, secs: number) => db.sql(`update arcade_plays set started_at = now() - make_interval(secs => $2) where id = $1`, [session, secs]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('ps_owner'); b = await db.newPlayer('ps_bee');
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const g = (await db.rpc(ow, 'my_groups'))[0];
  arcId = (await db.rpc(ow, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' })).arcade_id;
  await live(ow); await live(b);
});
afterAll(() => db.close());

describe('Arcade play styles and uncapped scores', () => {
  it('a long Endless run keeps a score in the millions', async () => {
    const s = await db.rpc(ow, 'arcade_start', { p_arcade: arcId, p_game: 'cyclone', p_mode: 'endless' });
    await age(s.session, 40 * 60);
    const r = await db.rpc(ow, 'arcade_finish', { p_session: s.session, p_score: 4_250_000 });
    expect(r.score).toBe(4_250_000);
    expect(r.new_best).toBe(true);
    const a = await db.rpc(ow, 'arcade_get', { p_id: arcId });
    expect(a.boards_endless.cyclone[0].score).toBe(4_250_000);
    // …but it pays like before: no faster than the game's base rate
    const row = (await db.sql(`select reward_score from arcade_plays where id = $1`, [s.session]))[0];
    expect(row.reward_score).toBeLessThanOrEqual(80 * 40 * 60 + 80);
  });

  it('a made-up score is still refused (the envelope)', async () => {
    const s = await db.rpc(ow, 'arcade_start', { p_arcade: arcId, p_game: 'cyclone', p_mode: 'endless' });
    await age(s.session, 30);
    const r = await db.rpc(ow, 'arcade_finish', { p_session: s.session, p_score: 2_000_000_000 });
    expect(r.score).toBeLessThan(20_000);
  });

  it('the host picks Endless for a Versus match; everyone plays Endless; the best score wins with no tie at the old top', async () => {
    const m = await db.rpc(ow, 'arcade_match_create', { p_arcade: arcId, p_game: 'stacker', p_mode: 'versus' });
    expect(m.play).toBe('classic');
    await db.rpc(b, 'arcade_match_join', { p_match: m.id });
    await expectError(db.rpc(b, 'arcade_match_set_play', { p_match: m.id, p_play: 'endless' }), 'not_host');
    await expectError(db.rpc(ow, 'arcade_match_set_play', { p_match: m.id, p_play: 'weird' }), 'invalid_game');
    const e = await db.rpc(ow, 'arcade_match_set_play', { p_match: m.id, p_play: 'endless' });
    expect(e.play).toBe('endless');
    expect((await live(b)).match.play).toBe('endless');
    const st = await db.rpc(ow, 'arcade_match_start', { p_match: m.id });
    const sessions = await db.sql(`select mode from arcade_plays p join arcade_match_players mp on mp.session = p.id where mp.match_id = $1`, [m.id]);
    expect(sessions.map((x: any) => x.mode)).toEqual(['endless', 'endless']);
    await expectError(db.rpc(ow, 'arcade_match_set_play', { p_match: m.id, p_play: 'classic' }), 'match_closed');
    const mine = st.players.find((p: any) => p.id === ow).session;
    const bs = (await live(b)).match.players.find((p: any) => p.id === b).session;
    // both well past the old Classic top (900): before, both would have been cut to 900 and tied
    await age(mine, 600); await age(bs, 600);
    await db.rpc(ow, 'arcade_finish', { p_session: mine, p_score: 15_000 });
    await db.rpc(b, 'arcade_finish', { p_session: bs, p_score: 12_000 });
    const res = await db.rpc(ow, 'arcade_match_result', { p_match: m.id });
    expect(res.status).toBe('done');
    const me = res.players.find((p: any) => p.id === ow), them = res.players.find((p: any) => p.id === b);
    expect(me.score).toBe(15_000); expect(them.score).toBe(12_000);
    expect(me.bonus).toBeGreaterThan(them.bonus);
  });

  it('a Classic Versus match no longer ties at the top score', async () => {
    const m = await db.rpc(ow, 'arcade_match_create', { p_arcade: arcId, p_game: 'stacker', p_mode: 'versus' });
    await db.rpc(b, 'arcade_match_join', { p_match: m.id });
    const st = await db.rpc(ow, 'arcade_match_start', { p_match: m.id });
    const mine = st.players.find((p: any) => p.id === ow).session;
    const bs = (await live(b)).match.players.find((p: any) => p.id === b).session;
    await age(mine, 90); await age(bs, 90);
    await db.rpc(ow, 'arcade_finish', { p_session: mine, p_score: 1300 });
    await db.rpc(b, 'arcade_finish', { p_session: bs, p_score: 1100 });
    const res = await db.rpc(ow, 'arcade_match_result', { p_match: m.id });
    const me = res.players.find((p: any) => p.id === ow), them = res.players.find((p: any) => p.id === b);
    expect([me.score, them.score]).toEqual([1300, 1100]);
    expect(me.bonus).toBeGreaterThan(them.bonus);
  });

  it('Team in Endless has a bigger target', async () => {
    const m = await db.rpc(ow, 'arcade_match_create', { p_arcade: arcId, p_game: 'stacker', p_mode: 'team' });
    const e = await db.rpc(ow, 'arcade_match_set_play', { p_match: m.id, p_play: 'endless' });
    expect(e.target).toBe(m.target * 4);
    const c = await db.rpc(ow, 'arcade_match_set_play', { p_match: m.id, p_play: 'classic' });
    expect(c.target).toBe(m.target);
    await db.rpc(ow, 'arcade_match_leave', { p_match: m.id });
  });
});
