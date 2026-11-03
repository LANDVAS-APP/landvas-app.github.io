// v0.27 Planet plots: shared plot maps on every solar-system world, a private map on your settled
// home world, buying only once landed, and two Ink-earning minigames per world's plots.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ana: string, bo: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const age = (session: string, secs: number) => db.sql(`update planet_games set started_at = now() - make_interval(secs => $2) where id = $1`, [session, secs]);

beforeAll(async () => {
  await db.init({ ungated: true });
  ana = await db.newPlayer('ana_planet');
  bo = await db.newPlayer('bo_planet');
  await db.giveInk(ana, 1000);
  await db.giveInk(bo, 1000);
});
afterAll(() => db.close());

describe('Planet plots', () => {
  it('every solar world has a map anyone can see; buying needs you landed there', async () => {
    const m = await db.rpc(ana, 'planet_map', { p_world: 'moon' });
    expect(m).toMatchObject({ world: 'moon', rows: 60, cols: 120, price: 30, landed: false, plots: [] });
    expect(m.games).toEqual(['moonlander', 'rockrun']);
    await expectError(db.rpc(ana, 'planet_claim', { p_world: 'moon', p_gx: 3, p_gy: 4 }), 'land_first');
    await expectError(db.rpc(ana, 'planet_map', { p_world: 'vulcan' }), 'invalid_world');
  });

  it('claims cost Ink, rise with each plot you own there, and are shared with everyone', async () => {
    await putOn(ana, 'moon');
    const r = await db.rpc(ana, 'planet_claim', { p_world: 'moon', p_gx: 3, p_gy: 4 });
    expect(r.paid).toBe(30);
    expect(r.price).toBe(35);
    expect(await ink(ana)).toBe(970);
    await expectError(db.rpc(ana, 'planet_claim', { p_world: 'moon', p_gx: 3, p_gy: 4 }), 'plot_unavailable');
    await expectError(db.rpc(ana, 'planet_claim', { p_world: 'moon', p_gx: 120, p_gy: 0 }), 'invalid_plot');
    // Bo sees it (and Ana, who is on the Moon)
    const seen = await db.rpc(bo, 'planet_map', { p_world: 'moon' });
    expect(seen.plots).toHaveLength(1);
    expect(seen.plots[0]).toMatchObject({ gx: 3, gy: 4, mine: false, owner: { username: 'ana_planet' } });
    expect(seen.pilots.map((p: any) => p.username)).toContain('ana_planet');
    expect(seen.price).toBe(30);
    // and can't buy on Mars without being there
    await putOn(bo, 'moon');
    await expectError(db.rpc(bo, 'planet_claim', { p_world: 'mars', p_gx: 0, p_gy: 0 }), 'land_first');
    await db.rpc(bo, 'planet_claim', { p_world: 'moon', p_gx: 5, p_gy: 5 });
    expect((await db.rpc(ana, 'planet_map', { p_world: 'moon' })).plots).toHaveLength(2);
    await db.rpc(ana, 'planet_rename', { p_world: 'moon', p_gx: 3, p_gy: 4, p_name: 'Tranquil Base' });
    await expectError(db.rpc(bo, 'planet_rename', { p_world: 'moon', p_gx: 3, p_gy: 4, p_name: 'Mine now' }), 'not_owner');
    const mine = await db.rpc(ana, 'my_planet_plots');
    expect(mine).toEqual([expect.objectContaining({ world: 'moon', gx: 3, gy: 4, name: 'Tranquil Base' })]);
  });

  it('your home world is yours alone', async () => {
    await db.sql(`update space_pilots set home_seed = 4242, home_name = 'Ana Prime', location = 'exo:4242' where player_id = $1`, [ana]);
    const m = await db.rpc(ana, 'planet_map', { p_world: 'exo:4242' });
    expect(m).toMatchObject({ rows: 12, cols: 24, landed: true });
    await db.rpc(ana, 'planet_claim', { p_world: 'exo:4242', p_gx: 0, p_gy: 0 });
    await expectError(db.rpc(bo, 'planet_map', { p_world: 'exo:4242' }), 'invalid_world');
    await db.sql(`update space_pilots set location = 'exo:4242' where player_id = $1`, [bo]);
    await expectError(db.rpc(bo, 'planet_claim', { p_world: 'exo:4242', p_gx: 1, p_gy: 1 }), 'invalid_world');
  });

  it('each plot has its world\'s two games; a few rounds a day pay Ink', async () => {
    await expectError(db.rpc(bo, 'planet_game_start', { p_world: 'moon', p_gx: 3, p_gy: 4, p_game: 'moonlander' }), 'not_owner');
    await expectError(db.rpc(ana, 'planet_game_start', { p_world: 'moon', p_gx: 3, p_gy: 4, p_game: 'duststorm' }), 'invalid_game');
    const g = await db.rpc(ana, 'planet_game_start', { p_world: 'moon', p_gx: 3, p_gy: 4, p_game: 'moonlander' });
    expect(g).toMatchObject({ rewarded: true, rounds_left: 2, seconds: 50 });
    await expectError(db.rpc(ana, 'planet_game_finish', { p_session: g.session, p_score: 100 }), 'game_too_fast');
    await age(g.session, 60);
    const before = await ink(ana);
    const r = await db.rpc(ana, 'planet_game_finish', { p_session: g.session, p_score: 9999 });
    expect(r).toMatchObject({ score: 120, earned: 24, paid: 24 });
    expect(await ink(ana)).toBe(before + 24);
    expect((await db.rpc(ana, 'planet_game_finish', { p_session: g.session, p_score: 50 })).repeat).toBe(true);
    for (let i = 0; i < 2; i++) {
      const s = await db.rpc(ana, 'planet_game_start', { p_world: 'moon', p_gx: 3, p_gy: 4, p_game: 'rockrun' });
      await age(s.session, 60);
      await db.rpc(ana, 'planet_game_finish', { p_session: s.session, p_score: 10 });
    }
    const free = await db.rpc(ana, 'planet_game_start', { p_world: 'moon', p_gx: 3, p_gy: 4, p_game: 'rockrun' });
    expect(free).toMatchObject({ rewarded: false, rounds_left: 0 });
    await age(free.session, 60);
    expect((await db.rpc(ana, 'planet_game_finish', { p_session: free.session, p_score: 150 })).paid).toBe(0);
  });

  it('planet Ink stops at the daily cap', async () => {
    await db.sql(`update space_pilots set planet_ink_today = 195, planet_ink_day = date_trunc('day', now()) where player_id = $1`, [bo]);
    await db.sql(`update space_pilots set planet_ink_day = private.day_start(now()) where player_id = $1`, [bo]);
    const g = await db.rpc(bo, 'planet_game_start', { p_world: 'moon', p_gx: 5, p_gy: 5, p_game: 'rockrun' });
    await age(g.session, 60);
    const r = await db.rpc(bo, 'planet_game_finish', { p_session: g.session, p_score: 150 });
    expect(r).toMatchObject({ earned: 25, paid: 5, capped: true });
  });
});
