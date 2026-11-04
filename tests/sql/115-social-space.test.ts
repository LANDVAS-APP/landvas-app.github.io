// v0.36 Social space: planet Ink capped per world, settling costs 1,000 Ink, friends' whereabouts,
// warping to a friend (or into anyone's live group with room), and the richer live feed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, ben: string, cid: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('ann_space'); ben = await db.newPlayer('ben_space'); cid = await db.newPlayer('cid_space');
  for (const u of [ann, ben, cid]) await db.giveInk(u, 3000);
  await db.sql(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [ann, ben]);
});
afterAll(() => db.close());

describe('Planet Ink per world', () => {
  it('each world caps at 100 a day, separately', async () => {
    await putOn(ann, 'moon');
    expect(Number((await db.sql(`select private.planet_pay_world($1, 'moon', 80, 'a', 'a1') n`, [ann]))[0].n)).toBe(80);
    expect(Number((await db.sql(`select private.planet_pay_world($1, 'moon', 80, 'b', 'b1') n`, [ann]))[0].n)).toBe(20);
    expect(Number((await db.sql(`select private.planet_pay_world($1, 'mars', 80, 'c', 'c1') n`, [ann]))[0].n)).toBe(80);
    expect((await db.rpc(ann, 'planet_map', { p_world: 'moon' }))).toMatchObject({ ink_today: 100, daily_cap: 100 });
  });
  it('and all worlds together cap at 300 a day', async () => {
    expect(Number((await db.sql(`select private.planet_pay_world($1, 'venus', 100, 'd', 'd1') n`, [ann]))[0].n)).toBe(100);
    expect(Number((await db.sql(`select private.planet_pay_world($1, 'jupiter', 100, 'e', 'e1') n`, [ann]))[0].n)).toBe(20);
    expect(Number((await db.sql(`select private.planet_pay_world($1, 'saturn', 100, 'f', 'f1') n`, [ann]))[0].n)).toBe(0);
  });
});

describe('Settling', () => {
  it('costs 1,000 Ink and shows up in the feed and in friends’ space', async () => {
    await putOn(ben, 'exo:777');
    const before = await ink(ben);
    const s = await db.rpc(ben, 'space_settle', { p_name: 'Benland' });
    expect(s.settle_paid).toBe(1000);
    expect(await ink(ben)).toBe(before - 1000);
    await expectError(db.rpc(ben, 'space_settle', { p_name: 'Again' }), 'already_home');
    await putOn(cid, 'exo:777');
    await expectError(db.rpc(cid, 'space_settle', { p_name: 'Mine now' }), 'world_taken');
    const feed = await db.rpc(ann, 'feed_recent', {});
    expect(feed.find((e: any) => e.kind === 'settle')).toMatchObject({ data: { name: 'Benland', seed: 777 }, player: { username: 'ben_space' } });
    const social = await db.rpc(ann, 'space_worlds_social');
    expect(social.friends[0]).toMatchObject({ player: { username: 'ben_space' }, now: { space: { home_name: 'Benland', at_home: true } } });
    expect(social.new_worlds[0]).toMatchObject({ name: 'Benland' });
  });
});

describe('Friends and warping to them', () => {
  it('friends see where you are and what you’re doing', async () => {
    await putOn(ben, 'mars');
    await db.rpc(ben, 'set_activity', { p_kind: 'dig', p_detail: { world: 'mars' } });
    await expectError(db.rpc(ben, 'set_activity', { p_kind: 'hacking' }), 'invalid_activity');
    await db.rpc(ben, 'planet_live', { p_world: 'mars', p_d: [1, 0, 0] });
    const f = await db.rpc(ann, 'my_friends');
    expect(f.friends[0].now).toMatchObject({ online: true, activity: { kind: 'dig', detail: { world: 'mars' } }, space: { location: 'mars' }, room: { live: true, in_room: 1 } });
  });

  it('warp lands you next to a friend, in their live group', async () => {
    await putOn(ann, 'earth');
    const r = await db.rpc(ann, 'space_warp_to_player', { p_player: ben });
    expect(r).toMatchObject({ location: 'mars', warped: true, spawn: { d: [1, 0, 0] } });
    const live = await db.rpc(ann, 'planet_live', { p_world: 'mars' });
    expect(live).toMatchObject({ joined: false });
    expect(live.members.map((m: any) => m.username)).toEqual(['ben_space']);
  });

  it('strangers only into a group with room; nobody on Earth', async () => {
    await putOn(ben, 'earth');
    await expectError(db.rpc(ann, 'space_warp_to_player', { p_player: ben }), 'not_in_space');
    await putOn(cid, 'earth');
    // ann is live on Mars with room: cid (not a friend) may join
    const r = await db.rpc(cid, 'space_warp_to_player', { p_player: ann });
    expect(r.location).toBe('mars');
    await db.sql(`update planet_presence set seen_at = now() - interval '1 minute' where player_id = $1`, [ann]);
    await putOn(cid, 'earth');
    await expectError(db.rpc(cid, 'space_warp_to_player', { p_player: ann }), 'room_full');
  });
});

describe('Live feed', () => {
  it('shows planet plots, explorers heading out (with room) and digging', async () => {
    await putOn(cid, 'moon');
    await db.rpc(cid, 'planet_claim', { p_world: 'moon', p_gx: 10, p_gy: 500 });
    await db.rpc(cid, 'planet_live', { p_world: 'moon' });
    const feed = await db.rpc(ann, 'feed_recent', {});
    const kinds = feed.map((e: any) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['planet_plot', 'exploring', 'settle']));
    expect(feed.find((e: any) => e.kind === 'planet_plot').data).toMatchObject({ world: 'moon' });
    expect(feed.find((e: any) => e.kind === 'exploring' && e.player.username === 'cid_space').data).toMatchObject({ world: 'moon', live: true, in_room: 1, room_size: 10 });
  });
});
