// v1.3c: privacy you control — hide your activity from the live feed (all of it, or by kind) and your badges, game
// records and stats from your public profile. Public by default.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let a: string, b: string;
const feedFor = async (viewer: string | null, who: string) => (await db.rpc(viewer, 'feed_recent', { p_limit: 100 })).filter((e: any) => e.player.username === who).map((e: any) => e.kind);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  a = await db.newPlayer('pri_vacy'); b = await db.newPlayer('nosy_ned');
  await db.sql(`insert into feed_events (kind, player_id, data) values ('claim', $1, '{"rarity":"rare"}'), ('achievement', $1, '{"name":"x"}'), ('minigame', $1, '{"game":"tracecraft","level":3}'), ('luck', $1, '{"sub":"sacrifice","what":"ink","gained":5}')`, [a]);
  await db.sql(`insert into minigame_records (player_id, game, highest_level, best_score, plays, wins) values ($1, 'tracecraft', 5, 100, 3, 2)`, [a]);
});
afterAll(() => db.close());

describe('privacy', () => {
  it('everything is public by default', async () => {
    expect(await db.rpc(a, 'my_privacy')).toMatchObject({ feed: true, feed_games: true, profile_games: true });
    expect(await feedFor(b, 'pri_vacy')).toEqual(expect.arrayContaining(['join', 'claim', 'achievement', 'minigame', 'luck']));
  });
  it('hide one kind of activity from the feed — others don’t see it, you still do', async () => {
    const p = await db.rpc(a, 'set_privacy', { p_patch: { feed_games: false, nonsense: false, feed_luck: 'no' } });
    expect(p).toMatchObject({ feed_games: false, feed_luck: true });
    expect(p.nonsense).toBeUndefined();
    const seen = await feedFor(b, 'pri_vacy');
    expect(seen).not.toContain('minigame'); expect(seen).toContain('claim');
    expect(await feedFor(a, 'pri_vacy')).toContain('minigame');
  });
  it('or hide everything from the feed', async () => {
    await db.rpc(a, 'set_privacy', { p_patch: { feed: false } });
    expect(await feedFor(b, 'pri_vacy')).toEqual([]);
    expect(await feedFor(null, 'pri_vacy')).toEqual([]);
  });
  it('hide badges, game records and stats from the public profile', async () => {
    await db.sql(`insert into player_achievements (player_id, achievement_key) values ($1, 'first_plot')`, [a]);
    let p = await db.rpc(b, 'profile_by_username', { p_username: 'pri_vacy' });
    expect(p.minigames.tracecraft.wins).toBe(2); expect(p.achievements.length).toBe(1);
    await db.rpc(a, 'set_privacy', { p_patch: { profile_badges: false, profile_games: false, profile_stats: false } });
    p = await db.rpc(b, 'profile_by_username', { p_username: 'pri_vacy' });
    expect(p.minigames).toEqual({}); expect(p.achievements).toEqual([]);
    expect(p.stats.plots).toBeUndefined();
    expect(p.hidden).toEqual({ badges: true, games: true, stats: true });
    const mine = await db.rpc(a, 'profile_by_username', { p_username: 'pri_vacy' });
    expect(mine.minigames.tracecraft.wins).toBe(2); expect(mine.privacy.profile_games).toBe(false);
  });
});
