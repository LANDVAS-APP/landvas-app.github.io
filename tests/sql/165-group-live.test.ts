// v1.0.0 Travelling together, live: the group's private channel, group games where you are, and group photos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let lea: string, max: string, ned: string;
const SLC = { lng: -111.891, lat: 40.7608 };
const O = { gx: 3_340_000, gy: 2_240_000 };
const bal = async (u: string) => Number((await db.sql(`select coalesce(sum(delta), 0) b from resource_ledger where player_id = $1 and resource = 'ink'`, [u]))[0].b);
const put = (u: string, lng: number, lat: number) => db.sql(`update explorers set lng = $2, lat = $3, fixed_at = now(), dest_lng = null, dest_lat = null where player_id = $1`, [u, lng, lat]);
const start = (u: string, k: string) => db.rpc(u, 'group_game_start', { p_kind: k });
const go = (id: string) => db.sql(`update group_games set starts_at = now() - interval '1 second' where id = $1`, [id]);

beforeAll(async () => {
  await db.init({ ungated: true });
  lea = await db.newPlayer('lea_live'); max = await db.newPlayer('max_live'); ned = await db.newPlayer('ned_live');
  let n = 0;
  for (const u of [lea, max, ned]) {
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
    await db.rpc(u, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
    await db.rpc(u, 'claim_starter_plot', { p_gx: O.gx + n++ * 40, p_gy: O.gy });
  }
  const [g] = await db.rpc(lea, 'my_groups');
  await db.rpc(lea, 'set_group_kind', { p_group_id: g.id, p_kind: 'plane' });
  const code = (await db.rpc(lea, 'travel_group_create')).group.code;
  await db.rpc(max, 'travel_group_join', { p_code: code });
  await db.rpc(ned, 'travel_group_join', { p_code: code });
});
afterAll(() => db.close());

describe('the group’s live channel', () => {
  it('is private to the group, and changes when someone leaves', async () => {
    const a = (await db.rpc(lea, 'travel_group')).group.channel;
    expect(a).toMatch(/^tg-[0-9a-f]{32}$/);
    expect((await db.rpc(max, 'travel_group')).group.channel).toBe(a);
    await db.rpc(ned, 'travel_group_leave');
    const b = (await db.rpc(lea, 'travel_group')).group.channel;
    expect(b).not.toBe(a);
    expect((await db.rpc(ned, 'travel_group')).group).toBeNull();
    await db.rpc(ned, 'travel_group_join', { p_code: (await db.rpc(lea, 'travel_group')).group.code });
    await db.rpc(lea, 'travel_group_kick', { p_player: ned });
    expect((await db.rpc(lea, 'travel_group')).group.channel).not.toBe(b);
  });
});

describe('group games', () => {
  it('start only where you are travelling to', async () => {
    await expectError(start(lea, 'balloons'), 'travel_first');
    await db.rpc(lea, 'travel_depart', { p_mode: 'plane', p_to: 'ap:LHR' });
    await db.sql(`update travel_trips set arrives_at = now() - interval '1 second' where not arrived`);
    await db.sql(`update explorers set fixed_at = fixed_at - interval '3 hours' where mode = 'travel'`);
    await db.rpc(lea, 'travel_status'); await db.rpc(max, 'travel_status');
  });

  it('Balloon Rush: balloons around the leader; pop them by being right there; the most pops wins', async () => {
    const g = await start(lea, 'balloons');
    expect(g.kind).toBe('balloons');
    expect(g.items).toHaveLength(22);
    expect((await db.rpc(max, 'travel_group')).group.game).toMatchObject({ id: g.id, kind: 'balloons' });
    await expectError(start(max, 'race'), 'game_on');
    await expectError(db.rpc(max, 'group_game_hit', { p_game: g.id, p_item: 0 }), 'game_not_started');
    await go(g.id);
    await expectError(db.rpc(max, 'group_game_hit', { p_game: g.id, p_item: 0 }), 'find_too_far');
    const pop = async (u: string, i: number) => { await put(u, g.items[i].lng, g.items[i].lat); return db.rpc(u, 'group_game_hit', { p_game: g.id, p_item: i }); };
    const r = await pop(max, 0);
    expect(r.items[0].by).toBe('max_live');
    await expectError(pop(lea, 0), 'already_popped');
    await pop(lea, 1); await pop(max, 2); await pop(max, 3);
    const st = await db.rpc(lea, 'group_game_status');
    expect(st.scores.map((s: any) => [s.username, s.n])).toEqual([['max_live', 3], ['lea_live', 1]]);
    // time's up: Ink for each pop, and the winner's bonus
    const [m0, l0] = [await bal(max), await bal(lea)];
    await db.sql(`update group_games set ends_at = now() - interval '1 second' where id = $1`, [g.id]);
    const end = await db.rpc(max, 'group_game_status');
    expect(end.over).toBe(true);
    expect(end.winner.username).toBe('max_live');
    expect(await bal(max)).toBe(m0 + 3 + 5);
    expect(await bal(lea)).toBe(l0 + 1);
    // paid once
    await db.rpc(lea, 'group_game_status');
    expect(await bal(max)).toBe(m0 + 8);
    expect((await db.rpc(max, 'group_game_hit', { p_game: g.id, p_item: 5 })).late).toBe(true);
  });

  it('Flag Race: a flag half a kilometre away; first one there wins', async () => {
    const here = await db.rpc(lea, 'my_explorer');
    const g = await start(lea, 'race');
    expect(g.items).toHaveLength(1);
    const d = Math.hypot((g.items[0].lng - here.lng) * 111320 * Math.cos((here.lat * Math.PI) / 180), (g.items[0].lat - here.lat) * 110574);
    expect(d).toBeGreaterThan(300); expect(d).toBeLessThan(700);
    await go(g.id);
    const l0 = await bal(lea);
    await put(lea, g.items[0].lng, g.items[0].lat);
    const won = await db.rpc(lea, 'group_game_hit', { p_game: g.id, p_item: 0 });
    expect(won.over).toBe(true);
    expect(won.winner.username).toBe('lea_live');
    expect(await bal(lea)).toBe(l0 + 10);
  });
});

describe('group photos', () => {
  it('everyone here poses together; it’s in each one’s photos', async () => {
    const here = await db.rpc(lea, 'my_explorer');
    await put(max, here.lng + 0.002, here.lat);
    const p = await db.rpc(max, 'travel_group_photo');
    expect(p.members.map((m: any) => m.username)).toEqual(['max_live', 'lea_live']);
    expect(p.stop.id).toBe('ap:LHR');
    expect((await db.rpc(lea, 'travel_group_photos'))[0].id).toBe(p.id);
    // too far apart: nobody to pose with
    await put(max, here.lng + 0.05, here.lat);
    await expectError(db.rpc(max, 'travel_group_photo'), 'nobody_here');
  });
});
