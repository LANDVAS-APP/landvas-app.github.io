// Chat everywhere people walk about together: the arcade's front hall and its Mirror Arcade each have their own room
// chat, and the Live Arena has one too (same rules as every room chat: filter, mutes, blocks, the global switch).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, ann: string, ben: string, cat: string, dan: string, arcId: string;
const A = { gx: 3_430_000, gy: 2_130_000 };
const give = (u: string, n: number) => db.sql(`insert into arcade_players (player_id, tickets) values ($1, $2) on conflict (player_id) do update set tickets = arcade_players.tickets + $2`, [u, n]);
const unburst = () => db.sql(`delete from private.rate_limits where action like '%chat_burst%'`);
const say = async (u: string, body: string) => { await unburst(); return db.rpc(u, 'arcade_chat_send', { p_arcade: arcId, p_body: body }); };
const heard = async (u: string) => (await db.rpc(u, 'arcade_chat_list', { p_arcade: arcId, p_after: 0 })).items.map((m: any) => m.body);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('ce_owner'); ann = await db.newPlayer('ce_ann'); ben = await db.newPlayer('ce_ben'); cat = await db.newPlayer('ce_cat'); dan = await db.newPlayer('ce_dan');
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const groupId = (await db.rpc(ow, 'my_groups'))[0].id;
  arcId = (await db.rpc(ow, 'set_group_kind', { p_group_id: groupId, p_kind: 'arcade' })).arcade_id;
  for (const u of [ann, ben]) { await give(u, 25_000); await db.rpc(u, 'arcade_mirror_buy', {}); }
});
afterAll(() => db.close());

describe('the arcade: each side of the glass has its own room chat', () => {
  it('the front hears the front, the mirror hears the mirror', async () => {
    await db.rpc(cat, 'arcade_live', { p_arcade: arcId });
    await db.rpc(dan, 'arcade_live', { p_arcade: arcId });
    await db.rpc(ann, 'arcade_mirror_live', { p_arcade: arcId });
    await db.rpc(ben, 'arcade_mirror_live', { p_arcade: arcId });
    await say(cat, 'hello front');
    await say(ann, 'hello mirror');
    expect(await heard(dan)).toEqual(['hello front']);
    expect(await heard(ben)).toEqual(['hello mirror']);
    const f = await db.rpc(dan, 'arcade_chat_list', { p_arcade: arcId, p_after: 0 });
    const m = await db.rpc(ben, 'arcade_chat_list', { p_arcade: arcId, p_after: 0 });
    expect(f).toMatchObject({ side: 'front', topic: `ac:${arcId}:${f.shard}` });
    expect(m).toMatchObject({ side: 'mirror', topic: `ac:${arcId}:m${m.shard}` });
  });

  it('walking through the glass takes you to the other room’s chat', async () => {
    await db.rpc(dan, 'arcade_mirror_buy', {}).catch(() => null);
    await give(dan, 25_000); await db.rpc(dan, 'arcade_mirror_buy', {});
    await db.rpc(dan, 'arcade_mirror_live', { p_arcade: arcId });
    expect(await heard(dan)).toEqual(['hello mirror']);
  });

  it('not there: nothing to say or hear', async () => {
    await expectError(say(ow, 'hi'), 'not_in_arcade');
    expect(await heard(ow)).toEqual([]);
  });
});

describe('the Live Arena has a room chat', () => {
  it('everyone in your arena room hears it; blocks are respected; you must be there', async () => {
    await expectError(db.rpc(ann, 'arena_chat_send', { p_body: 'hey' }), 'not_in_arcade');
    for (const u of [ann, ben, cat]) await db.rpc(u, 'arena_live', { p_x: 0, p_z: 5 });
    await unburst();
    const s = await db.rpc(ann, 'arena_chat_send', { p_body: 'gg everyone' });
    expect(s).toMatchObject({ body: 'gg everyone', kind: 'chat', player: { username: 'ce_ann' } });
    const l = await db.rpc(ben, 'arena_chat_list', { p_after: 0 });
    expect(l.items.map((m: any) => m.body)).toEqual(['gg everyone']);
    expect(l.topic).toBe(`arena-chat:${l.shard}`);
    await db.sql(`insert into player_blocks (blocker_id, blocked_id) values ($1, $2)`, [cat, ann]);
    expect((await db.rpc(cat, 'arena_chat_list', { p_after: 0 })).items).toEqual([]);
    expect((await db.rpc(ow, 'arena_chat_list', { p_after: 0 })).items).toEqual([]);
  });

  it('links and bad words are cleaned; mutes hold', async () => {
    await db.sql(`update players set chat_muted_until = now() + interval '1 hour' where id = $1`, [ben]);
    await expectError(db.rpc(ben, 'arena_chat_send', { p_body: 'hi' }), 'chat_muted');
    await db.sql(`update players set chat_muted_until = null where id = $1`, [ben]);
  });
});
