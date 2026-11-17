// The global chat everywhere: every chat box reads the global chat like a room chat (since the last message seen, one
// topic to listen on). Sending is the Social page's send_chat_message, with its switch, mutes and blocks.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, ben: string, cal: string;
const unburst = () => db.sql(`delete from private.rate_limits where action like '%chat%'`);
const say = async (u: string, body: string) => { await unburst(); return db.rpc(u, 'send_chat_message', { p_body: body }); };
const list = (u: string, after = 0) => db.rpc(u, 'global_chat_list', { p_after: after });

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('gc_ann'); ben = await db.newPlayer('gc_ben'); cal = await db.newPlayer('gc_cal');
});
afterAll(() => db.close());

describe('the global chat, as every chat box reads it', () => {
  it('everyone hears it, shaped like a room chat, with a topic to listen on', async () => {
    const s = await say(ann, 'hello world');
    const l = await list(ben);
    expect(l).toMatchObject({ topic: 'global-chat', enabled: true, muted_until: null });
    const m = l.items.find((x: any) => x.id === s.id);
    expect(m).toMatchObject({ body: 'hello world', kind: 'chat', player: { username: 'gc_ann' } });
    expect(typeof m.at).toBe('string');
  });

  it('only what came after the last message seen', async () => {
    const before = await list(cal);
    const last = Math.max(...before.items.map((x: any) => x.id));
    await say(ben, 'second');
    const next = await list(cal, last);
    expect(next.items.map((x: any) => x.body)).toEqual(['second']);
    expect((await list(cal, next.items[0].id)).items).toEqual([]);
  });

  it('blocked players are hidden; removed messages and moderation notices never show', async () => {
    await db.rpc(cal, 'block_player', { p_player_id: ann, p_on: true });
    await say(ann, 'can you hear me');
    expect((await list(cal)).items.map((x: any) => x.body)).not.toContain('can you hear me');
    expect((await list(ben)).items.map((x: any) => x.body)).toContain('can you hear me');
    await db.rpc(cal, 'block_player', { p_player_id: ann, p_on: false });
    const gone = await say(ben, 'oops');
    await db.sql(`update chat_messages set deleted_at = now() where id = $1`, [gone.id]);
    await db.sql(`insert into chat_messages (player_id, body, kind) values ($1, 'a notice', 'moderation')`, [ben]).catch(() => null);
    const bodies = (await list(ann)).items.map((x: any) => x.body);
    expect(bodies).not.toContain('oops');
    expect(bodies).not.toContain('a notice');
  });

  it('switched off: nothing to hear or say', async () => {
    await db.sql(`update feature_flags set enabled = false where key = 'global_chat'`);
    const l = await list(ben);
    expect(l).toMatchObject({ enabled: false, items: [] });
    await expectError(say(ben, 'anyone?'), 'chat_disabled');
    await db.sql(`update feature_flags set enabled = true where key = 'global_chat'`);
  });

  it('muted: still listening, and told until when', async () => {
    await db.sql(`update players set chat_muted_until = now() + interval '1 hour' where id = $1`, [cal]);
    const l = await list(cal);
    expect(l.muted_until).toBeTruthy();
    await expectError(say(cal, 'hi'), 'chat_muted');
  });

  it('signed out: no', async () => {
    await expect(db.rpc(null, 'global_chat_list', { p_after: 0 })).rejects.toBeTruthy();
  });
});
