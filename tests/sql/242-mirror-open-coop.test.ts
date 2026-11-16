// The Mirror Arcade for everyone (25,000 tickets, or find the way in) — and co-op on that side of the glass: a live
// room of its own, and Versus / Co-op rounds at mirror cabinets that pay like any mirror round plus the match bonus.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, ann: string, ben: string, cat: string, arcId: string;
const A = { gx: 3_420_000, gy: 2_120_000 };
const tickets = async (u: string) => Number((await db.sql(`select tickets from arcade_players where player_id = $1`, [u]))[0]?.tickets ?? 0);
const give = (u: string, n: number) => db.sql(`insert into arcade_players (player_id, tickets) values ($1, $2) on conflict (player_id) do update set tickets = arcade_players.tickets + $2`, [u, n]);
const front = (u: string) => db.rpc(u, 'arcade_live', { p_arcade: arcId });
const mirror = (u: string) => db.rpc(u, 'arcade_mirror_live', { p_arcade: arcId });

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ow = await db.newPlayer('mo_owner'); ann = await db.newPlayer('mo_ann'); ben = await db.newPlayer('mo_ben'); cat = await db.newPlayer('mo_cat');
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const groupId = (await db.rpc(ow, 'my_groups'))[0].id;
  arcId = (await db.rpc(ow, 'set_group_kind', { p_group_id: groupId, p_kind: 'arcade' })).arcade_id;
});
afterAll(() => db.close());

describe('open to everyone', () => {
  it('not in yet: the price and your tickets (the recipe stays secret)', async () => {
    const m = await db.rpc(ann, 'arcade_mirror_get', {});
    expect(m).toMatchObject({ found: false, open: true, price: 25000, tickets: 0 });
    expect(JSON.stringify(m)).not.toMatch(/recipe|stacker|Rose/i);
  });

  it('25,000 tickets walks you through, once, for good', async () => {
    await give(ann, 24_999);
    await expectError(db.rpc(ann, 'arcade_mirror_buy', {}), 'not_enough_tickets');
    expect(await tickets(ann)).toBe(24_999);
    await give(ann, 1_001);
    const m = await db.rpc(ann, 'arcade_mirror_buy', {});
    expect(m).toMatchObject({ found: true, how: 'bought' });
    expect(await tickets(ann)).toBe(1_000);
    // again: nothing more to pay
    expect(await db.rpc(ann, 'arcade_mirror_buy', {})).toMatchObject({ found: true });
    expect(await tickets(ann)).toBe(1_000);
  });

  it('the admin page can change the price', async () => {
    await db.sql(`update private.arcade_secrets set cfg = cfg || '{"price_tickets": 100}' where id = 'mirror'`);
    expect(await db.rpc(cat, 'arcade_mirror_get', {})).toMatchObject({ found: false, price: 100 });
    await db.sql(`update private.arcade_secrets set cfg = cfg || '{"price_tickets": 25000}' where id = 'mirror'`);
  });
});

describe('co-op through the glass', () => {
  beforeAll(async () => {
    await give(ben, 25_000);
    await db.rpc(ben, 'arcade_mirror_buy', {});
  });

  it('a live room of its own: the mirror sees the mirror, the front sees the front', async () => {
    await front(cat);
    const a = await mirror(ann);
    const b = await mirror(ben);
    expect(b.channel).toMatch(/^arcade-mirror:/);
    expect(b.members.map((p: any) => p.username)).toEqual(['mo_ann']);
    expect((await mirror(ann)).members.map((p: any) => p.username)).toEqual(['mo_ben']);
    expect(a.shard).toBe(b.shard);
    // the front hall doesn't see people on the other side of the glass
    expect((await front(cat)).members.map((p: any) => p.username)).not.toContain('mo_ann');
  });

  it('only for people who can get through', async () => {
    await expectError(mirror(cat), 'not_found');
    await expectError(db.rpc(cat, 'arcade_mirror_match_create', { p_arcade: arcId, p_game: 'twin', p_mode: 'team' }), 'not_found');
  });

  it('a Co-op round at a mirror cabinet: same seed, mirror rounds, the team bonus', async () => {
    const m = await db.rpc(ann, 'arcade_mirror_match_create', { p_arcade: arcId, p_game: 'twin', p_mode: 'team' });
    expect(m).toMatchObject({ side: 'mirror', game: 'twin', mode: 'team', status: 'lobby', level: 1 });
    // it's in the mirror's lobbies, not the front's
    expect((await mirror(ben)).lobbies.map((x: any) => x.id)).toContain(m.id);
    expect((await front(cat)).lobbies.map((x: any) => x.id)).not.toContain(m.id);
    // Looking for players: for those who can get through (with the way in)
    const lfg = (u: string) => db.rpc(u, 'lfg_list', {}).then((r: any) => r.items.filter((i: any) => i.id === m.id));
    expect(await lfg(cat)).toHaveLength(0);
    expect((await lfg(ben))[0]).toMatchObject({ kind: 'arcade', route: `/arcade/${arcId}?room=mirror` });
    expect((await lfg(ben))[0].title).toMatch(/^🪞 /);
    // someone in the front hall can't join it
    await expectError(db.rpc(cat, 'arcade_match_join', { p_match: m.id }), 'not_in_arcade');
    const j = await db.rpc(ben, 'arcade_match_join', { p_match: m.id });
    expect(j.players).toHaveLength(2);
    // the front's Start doesn't start a mirror match; the mirror's does
    const s = await db.rpc(ann, 'arcade_mirror_match_start', { p_match: m.id });
    expect(s.status).toBe('playing');
    const mine = s.players.find((p: any) => p.username === 'mo_ann').session;
    expect(mine).toBeTruthy();
    const rounds = await db.sql(`select player_id, seed, game from arcade_mirror_plays where id in (select mirror_session from arcade_match_players where match_id = $1)`, [m.id]);
    expect(rounds).toHaveLength(2);
    expect(new Set(rounds.map((r: any) => r.seed)).size).toBe(1);
    // both play their round (an ordinary mirror finish), then the match pays out
    for (const u of [ann, ben]) {
      const sess = (await db.sql(`select mirror_session s from arcade_match_players where match_id = $1 and player_id = $2`, [m.id, u]))[0].s;
      await db.sql(`update arcade_mirror_plays set started_at = now() - interval '90 seconds' where id = $1`, [sess]);
      await db.rpc(u, 'arcade_mirror_finish', { p_session: sess, p_score: 900 });
    }
    const done = await db.rpc(ann, 'arcade_match_result', { p_match: m.id });
    expect(done.status).toBe('done');
    expect(done.players.every((p: any) => p.finished && p.score > 0)).toBe(true);
    expect(done.players.every((p: any) => p.bonus > 0)).toBe(true);
  });

  it('Classic or Endless works for a mirror cabinet’s own game', async () => {
    const m = await db.rpc(ann, 'arcade_mirror_match_create', { p_arcade: arcId, p_game: 'glass', p_mode: 'team' });
    const e = await db.rpc(ann, 'arcade_match_set_play', { p_match: m.id, p_play: 'endless' });
    expect(e.play).toBe('endless');
    await db.rpc(ann, 'arcade_match_leave', { p_match: m.id });
  });

  it('back in the front hall, you’re in the front again', async () => {
    await front(ann);
    expect((await front(cat)).members.map((p: any) => p.username)).toContain('mo_ann');
    expect((await db.sql(`select side from arcade_presence where player_id = $1`, [ann]))[0].side).toBe('front');
  });
});
