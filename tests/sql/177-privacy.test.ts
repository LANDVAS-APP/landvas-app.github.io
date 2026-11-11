// v1.3c: privacy you control — hide your activity from the live feed (all of it, or by kind) and your badges, game
// records and stats from your public profile. Public by default.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  it('hide any single activity — e.g. sacrificing an egg but not Ink', async () => {
    await db.rpc(a, 'set_privacy', { p_patch: { feed: true, feed_games: true } });
    await db.sql(`insert into feed_events (kind, player_id, data) values ('luck', $1, '{"sub":"sacrifice","what":"egg","egg":"glimmer","gained":8}'),
      ('luck', $1, '{"sub":"sacrifice","what":"inkborn","name":"Blob","gained":12}'), ('arcade', $1, '{"sub":"prize","prize":"x"}'), ('arcade', $1, '{"sub":"record","score":5}')`, [a]);
    const what = async () => (await db.rpc(b, 'feed_recent', { p_limit: 100 })).filter((e: any) => e.player.username === 'pri_vacy')
      .map((e: any) => e.data.what ?? e.data.sub ?? e.kind);
    expect(await what()).toEqual(expect.arrayContaining(['egg', 'inkborn', 'ink', 'prize', 'record']));
    const p = await db.rpc(a, 'set_privacy', { p_patch: { fa_luck_egg: false, fa_luck_inkborn: false, fa_arcade_prize: false, fa_join: false } });
    expect(p).toMatchObject({ fa_luck_egg: false, fa_luck_ink: true, fa_arcade_record: true });
    const seen = await what();
    expect(seen).not.toContain('egg'); expect(seen).not.toContain('inkborn'); expect(seen).not.toContain('prize'); expect(seen).not.toContain('join');
    expect(seen).toEqual(expect.arrayContaining(['ink', 'record', 'claim']));
    expect((await db.rpc(a, 'feed_recent', { p_limit: 100 })).some((e: any) => e.data.what === 'egg')).toBe(true);
  });
  it('the settings screen has a switch for every activity, and every kind of feed event has one', async () => {
    const keys = Object.keys(await db.rpc(a, 'my_privacy'));
    const src = readFileSync(join(__dirname, '../../src/screens/Settings.tsx'), 'utf8');
    const listed = [...src.matchAll(/k: '((?:fa|feed)_[a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(listed)).toEqual(new Set(keys.filter((k) => k.startsWith('fa_') || (k.startsWith('feed_')))));
    const kinds = (await db.sql(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'feed_events_kind_check'`))[0].d.match(/'([a-z_]+)'/g).map((x: string) => x.slice(1, -1));
    for (const k of kinds) expect(keys, k).toContain('fa_' + (k === 'luck' ? 'luck_ink' : k === 'arcade' ? 'arcade_playing' : k));
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
