// v0.7.4 Chat, the feed, meteors, rooms and PvP nudge phones instead of phones asking on a timer. Tests have no
// pg_net (so nothing is actually sent); these check the nudges never get in the way of what triggers them, that a
// busy topic is nudged at most once per gap, and that phones are told which topic to listen on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let lead: string, mate: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  lead = await db.newPlayer('nudge_lead'); mate = await db.newPlayer('nudge_mate');
  await db.giveInk(lead, 1500);
  await db.sql(`insert into feature_flags (key, enabled) values ('global_chat', true) on conflict (key) do update set enabled = true`);
});
afterAll(() => db.close());

describe('Push nudges', () => {
  it('a busy topic is nudged at most once per gap, and never waits', async () => {
    const gate = async () => (await db.sql(`select at from private.push_gate where topic = 'test'`))[0]?.at as Date | undefined;
    await db.sql(`select private.push_gated('test', 'x', interval '1 hour')`);
    const first = await gate();
    expect(first).toBeTruthy();
    await db.sql(`select private.push_gated('test', 'x', interval '1 hour')`);
    expect((await gate())!.getTime()).toBe(first!.getTime()); // inside the gap: not nudged again
    await db.sql(`update private.push_gate set at = now() - interval '2 hours' where topic = 'test'`);
    await db.sql(`select private.push_gated('test', 'x', interval '1 hour')`);
    expect((await gate())!.getTime()).toBeGreaterThan(first!.getTime() - 3_600_000);
  });

  it('feed posts still go in (and nudge the feed)', async () => {
    await db.sql(`insert into feed_events (kind, player_id, data) values ('exploring', $1, '{"world":"moon"}')`, [lead]);
    expect((await db.sql(`select count(*)::int n from private.push_gate where topic = 'feed'`))[0].n).toBe(1);
  });

  it('clan chat still sends, and the list says which clan to listen to', async () => {
    const c = await db.rpc(lead, 'clan_found', { p_name: 'Nudgers', p_tag: 'NDG', p_emblem: '🐉', p_color: '#7B5CFF' });
    expect((await db.rpc(mate, 'clan_chat_list', { p_after: 0 }))).toMatchObject({ items: [], clan: null });
    const m = await db.rpc(lead, 'clan_chat_send', { p_body: 'hello clan' });
    expect(m.body).toBe('hello clan');
    const l = await db.rpc(lead, 'clan_chat_list', { p_after: 0 });
    expect(l.clan).toBe(c.id);
    expect(l.items.map((x: any) => x.body)).toEqual(['hello clan']);
  });

  it('the nudge triggers are in place', async () => {
    const rows = await db.sql(`select tgname from pg_trigger where not tgisinternal and tgname like '%push' order by 1`);
    expect(rows.map((r: any) => r.tgname)).toEqual(expect.arrayContaining(['clan_chat_push', 'feed_events_push', 'home_chat_push', 'planet_chat_push', 'planet_meteors_push',
      'arcade_matches_push', 'arcade_match_players_push', 'arena_matches_push', 'arena_match_players_push', 'home_games_push',
      'home_game_players_push', 'pvp_matches_push', 'pvp_runs_push', 'room_visits_push', 'room_checkins_push', 'room_notes_push', 'inkborn_eggs_push']));
  });
});
