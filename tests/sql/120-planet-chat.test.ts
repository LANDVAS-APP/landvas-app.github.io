// v0.41 Group chat for the live groups on each world.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let a: string, b: string, c: string;
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const calm = () => db.sql(`delete from rate_limits`).catch(() => db.sql(`truncate private.rate_limits`).catch(() => {}));

beforeAll(async () => {
  await db.init({ ungated: true });
  a = await db.newPlayer('chat_ann'); b = await db.newPlayer('chat_bo'); c = await db.newPlayer('chat_cy');
  for (const p of [a, b, c]) { await putOn(p, 'moon'); await db.rpc(p, 'planet_live', { p_world: 'moon', p_d: [0, 0, 1], p_face: [0, 1, 0] }); }
});
afterAll(() => db.close());

describe('planet group chat', () => {
  it('your group hears you; you have to be in it', async () => {
    const m = await db.rpc(a, 'planet_chat_send', { p_world: 'moon', p_body: '  hi   everyone  ' });
    expect(m).toMatchObject({ body: 'hi everyone', player: { username: 'chat_ann' } });
    const l = await db.rpc(b, 'planet_chat_list', { p_world: 'moon', p_after: 0 });
    expect(l.items.map((x: any) => x.body)).toEqual(['hi everyone']);
    expect((await db.rpc(b, 'planet_chat_list', { p_world: 'moon', p_after: m.id })).items).toEqual([]);
    await expectError(db.rpc(a, 'planet_chat_send', { p_world: 'mars', p_body: 'hello?' }), 'not_in_group');
    expect((await db.rpc(a, 'planet_chat_list', { p_world: 'mars' })).items).toEqual([]);
  });

  it('other groups on the same world don’t see it', async () => {
    await db.sql(`update planet_presence set shard = 7 where player_id = $1`, [c]);
    expect((await db.rpc(c, 'planet_chat_list', { p_world: 'moon' })).items).toEqual([]);
  });

  it('filters links, length and blocked players', async () => {
    await calm();
    await expectError(db.rpc(b, 'planet_chat_send', { p_world: 'moon', p_body: 'go to www.evil.com' }), 'chat_links');
    await expectError(db.rpc(b, 'planet_chat_send', { p_world: 'moon', p_body: 'x'.repeat(141) }), 'chat_too_long');
    await db.rpc(b, 'block_player', { p_player_id: a, p_on: true });
    expect((await db.rpc(b, 'planet_chat_list', { p_world: 'moon' })).items).toEqual([]);
  });
});
