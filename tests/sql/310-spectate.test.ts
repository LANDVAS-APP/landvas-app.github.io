// Watching someone play: the server hands out the secret channel only to people allowed to watch, says who can be
// watched (online, doing something watchable, watching on), and changes the key when they switch it off or block.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let star: string, fan: string, other: string;
const at = (u: string, kind: string, detail: object = {}) => db.rpc(u, 'set_activity', { p_kind: kind, p_detail: detail });

beforeAll(async () => {
  await db.init({ ungated: true });
  star = await db.newPlayer('watch_star'); fan = await db.newPlayer('watch_fan'); other = await db.newPlayer('watch_other');
});
afterAll(() => db.close());

describe('watching someone play', () => {
  it('your own channel: a secret key, on unless you switch it off', async () => {
    const me = await db.rpc(star, 'watch_me');
    expect(me).toMatchObject({ on: true, fps: 2 });
    expect(me.channel).toMatch(/^watch:[0-9a-f-]{36}$/);
    expect((await db.rpc(star, 'watch_me')).channel).toBe(me.channel); // the same key each time
  });

  it('someone playing a game can be watched: you get their channel and what they’re up to', async () => {
    await at(star, 'game', { game: 'snake' });
    const w = await db.rpc(fan, 'watch_start', { p_username: 'WATCH_STAR' });
    expect(w).toMatchObject({ username: 'watch_star', now: { online: true, watch: true, activity: { kind: 'game' } } });
    expect(w.channel).toBe((await db.rpc(star, 'watch_me')).channel);
    // …and they're in the "live now" list
    expect((await db.rpc(fan, 'watchable_players')).map((p: any) => p.username)).toContain('watch_star');
  });

  it('on the map (or anywhere not a game or a place) there’s nothing to watch', async () => {
    await at(star, 'map');
    const w = await db.rpc(fan, 'watch_start', { p_username: 'watch_star' });
    expect(w.now.watch).toBe(false);
    expect((await db.rpc(fan, 'watchable_players')).map((p: any) => p.username)).not.toContain('watch_star');
    await at(star, 'arcade', { arcade: 'x' });
    expect((await db.rpc(fan, 'watch_start', { p_username: 'watch_star' })).now.watch).toBe(true);
  });

  it('not yourself, not someone who isn’t there', async () => {
    await expectError(db.rpc(star, 'watch_start', { p_username: 'watch_star' }), 'not_found');
    await expectError(db.rpc(fan, 'watch_start', { p_username: 'nobody_here' }), 'not_found');
    // offline: who they are, but no way in
    const w = await db.rpc(fan, 'watch_start', { p_username: 'watch_other' });
    expect(w.channel).toBeNull();
    expect(w.now.watch).toBe(false);
  });

  it('switching it off: nobody can watch, and the old key stops working', async () => {
    const before = (await db.rpc(star, 'watch_me')).channel;
    await db.rpc(star, 'set_privacy', { p_patch: { spectate: false } });
    await expectError(db.rpc(fan, 'watch_start', { p_username: 'watch_star' }), 'not_watchable');
    const me = await db.rpc(star, 'watch_me');
    expect(me.on).toBe(false);
    expect(me.channel).not.toBe(before);
    expect((await db.rpc(fan, 'watchable_players')).map((p: any) => p.username)).not.toContain('watch_star');
    await db.rpc(star, 'set_privacy', { p_patch: { spectate: true } });
    expect((await db.rpc(fan, 'watch_start', { p_username: 'watch_star' })).now.watch).toBe(true);
  });

  it('blocking someone: they can’t watch, and the key changes', async () => {
    const before = (await db.rpc(star, 'watch_me')).channel;
    await db.sql(`insert into player_blocks (blocker_id, blocked_id) values ($1, $2)`, [star, fan]);
    await expectError(db.rpc(fan, 'watch_start', { p_username: 'watch_star' }), 'not_found');
    expect((await db.rpc(star, 'watch_me')).channel).not.toBe(before);
    expect((await db.rpc(fan, 'watchable_players')).map((p: any) => p.username)).not.toContain('watch_star');
    // someone else still can
    await at(other, 'map');
    expect((await db.rpc(other, 'watch_start', { p_username: 'watch_star' })).channel).toBe((await db.rpc(star, 'watch_me')).channel);
  });

  it('staff can switch watching off for everyone', async () => {
    await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'watch'`);
    await expectError(db.rpc(other, 'watch_start', { p_username: 'watch_star' }), 'not_watchable');
    expect(await db.rpc(other, 'watchable_players')).toEqual([]);
    expect((await db.rpc(star, 'watch_me')).on).toBe(false);
    await db.sql(`update game_config set value = value || '{"enabled": true}' where key = 'watch'`);
  });
});
