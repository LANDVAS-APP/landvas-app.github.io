// Open play: parties are public unless their leader says otherwise; anyone online on their own is joinable (a party
// forms around them); every game waiting for players is listed; following someone lands you in their room; "at home".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, ben: string, cal: string, dee: string, eve: string, arcId: string;
const A = { gx: 3_352_000, gy: 2_052_000 };
const online = (u: string, kind = 'map', detail: Record<string, unknown> = {}) => db.rpc(u, 'set_activity', { p_kind: kind, p_detail: detail });
const offline = (u: string) => db.sql(`update player_activity set at = now() - interval '1 hour' where player_id = $1`, [u]);
const party = (u: string) => db.rpc(u, 'travel_group');
const here = `now() + interval '30 seconds'`;

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ann = await db.newPlayer('ann_open'); ben = await db.newPlayer('ben_open'); cal = await db.newPlayer('cal_open');
  dee = await db.newPlayer('dee_open'); eve = await db.newPlayer('eve_open');
  await db.rpc(ann, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const g = (await db.rpc(ann, 'my_groups'))[0];
  arcId = (await db.rpc(ann, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' })).arcade_id;
  for (const u of [ann, ben, cal, dee, eve]) await online(u);
});
afterAll(() => db.close());

describe('public by default', () => {
  it('a new party is public; going private also means "don’t join me"', async () => {
    expect((await db.rpc(ann, 'party_create', {})).group.visibility).toBe('public');
    await db.rpc(ann, 'party_update', { p_visibility: 'private' });
    expect((await db.rpc(ann, 'my_privacy')).joinable).toBe(false);
    await db.rpc(ann, 'party_update', { p_visibility: 'public' });
    expect((await db.rpc(ann, 'my_privacy')).joinable).toBe(true);
    await db.rpc(ann, 'travel_group_leave');
  });
});

describe('join anyone online', () => {
  it('on their own: a party forms around them (they lead, and they hear about it)', async () => {
    const r = await db.rpc(ben, 'party_join_player', { p_player: ann });
    expect(r.group.leader).toBe(false);
    expect(r.group.members.map((m: any) => m.username).sort()).toEqual(['ann_open', 'ben_open']);
    expect((await party(ann)).group).toMatchObject({ leader: true, visibility: 'public' });
    expect(await db.sql(`select 1 from player_notifications where player_id = $1 and kind = 'party_join'`, [ann])).toHaveLength(1);
  });

  it('in a public party: you join that party', async () => {
    const r = await db.rpc(cal, 'party_join_player', { p_player: ben });
    expect(r.group.members).toHaveLength(3);
  });

  it('in a private party, or private on their own, or not around: no', async () => {
    await db.rpc(ann, 'party_update', { p_visibility: 'private' });
    await expectError(db.rpc(dee, 'party_join_player', { p_player: ben }), 'party_private');
    await db.rpc(ann, 'party_update', { p_visibility: 'public' });
    await db.rpc(eve, 'set_privacy', { p_patch: { joinable: false } });
    await expectError(db.rpc(dee, 'party_join_player', { p_player: eve }), 'party_private');
    await db.rpc(eve, 'set_privacy', { p_patch: { joinable: true } });
    await offline(eve);
    await expectError(db.rpc(dee, 'party_join_player', { p_player: eve }), 'player_offline');
    await online(eve);
    await expectError(db.rpc(dee, 'party_join_player', { p_player: dee }), 'cannot_invite_self');
  });

  it('already in a party: switching takes a yes', async () => {
    await db.rpc(dee, 'party_join_player', { p_player: eve });
    await expectError(db.rpc(dee, 'party_join_player', { p_player: ann }), 'already_in_group');
    const r = await db.rpc(dee, 'party_join_player', { p_player: ann, p_switch: true });
    expect(r.group.members).toHaveLength(4);
    // the party that formed around eve stays hers (public, so still joinable from the lobbies)
    expect((await party(eve)).group.members.map((m: any) => m.username)).toEqual(['eve_open']);
  });

  it('the lobbies list who’s on their own and open to it (friends first)', async () => {
    const solo = await db.newPlayer('fay_open');
    await online(solo, 'arcade', { arcade: arcId });
    const l = await db.rpc(ben, 'party_lobbies', {});
    const names = l.players.map((p: any) => p.username);
    expect(names).toContain('fay_open');
    expect(names).not.toContain('ann_open'); // in a party (it's in the lobbies)
    expect(names).not.toContain('eve_open');
    expect(l.players.find((p: any) => p.username === 'fay_open').now.activity).toMatchObject({ kind: 'arcade' });
    expect(l.joinable).toBe(true);
    await db.rpc(solo, 'set_privacy', { p_patch: { joinable: false } });
    expect((await db.rpc(ben, 'party_lobbies', {})).players.map((p: any) => p.username)).not.toContain('fay_open');
  });
});

describe('looking for players', () => {
  let host: string, arcMatch: string, homeGame: string, arenaMatch: string;
  it('lists house tables, arcade matches and arena lobbies waiting for more — with where to go', async () => {
    host = await db.newPlayer('gus_open');
    // an arcade match, its host in the arcade
    await db.sql(`insert into arcade_presence (player_id, arcade_id, shard, seen_at) values ($1, $2, 0, ${here})`, [host, arcId]);
    arcMatch = (await db.sql(`insert into arcade_matches (arcade_id, shard, game, mode, host_id) values ($1, 0, 'stacker', 'versus', $2) returning id`, [arcId, host]))[0].id;
    await db.sql(`insert into arcade_match_players (match_id, player_id) values ($1, $2)`, [arcMatch, host]);
    // a table at the host's house
    await db.sql(`insert into home_presence (player_id, host_id, shard, seen_at) values ($1, $1, 0, ${here}) on conflict (player_id) do update set host_id = excluded.host_id, seen_at = excluded.seen_at`, [host]);
    homeGame = (await db.sql(`insert into home_games (home_id, shard, game, host_id) values ($1, 0, 'dots', $1) returning id`, [host]))[0].id;
    await db.sql(`insert into home_game_players (game_id, player_id) values ($1, $2)`, [homeGame, host]);
    const items = (await db.rpc(ben, 'lfg_list')).items;
    const arc = items.find((x: any) => x.id === arcMatch), home = items.find((x: any) => x.id === homeGame);
    expect(arc).toMatchObject({ kind: 'arcade', title: 'Ink Tower', players: 1, max: 4, route: `/arcade/${arcId}` });
    expect(arc.host.username).toBe('gus_open');
    expect(home).toMatchObject({ kind: 'home', title: 'Dots & Boxes', players: 1, max: 4, route: '/u/gus_open/home', where: "gus_open's home" });
    // the host doesn't see their own; the lobbies carry the list too
    expect((await db.rpc(host, 'lfg_list')).items.find((x: any) => x.id === arcMatch)).toBeUndefined();
    expect((await db.rpc(ben, 'party_lobbies', {})).lfg.map((x: any) => x.id)).toEqual(expect.arrayContaining([arcMatch, homeGame]));
  });

  it('an arena lobby goes through the host’s arcade portal', async () => {
    const h2 = await db.newPlayer('hal_open');
    await db.sql(`insert into arena_presence (player_id, shard, from_arcade, seen_at) values ($1, 0, $2, ${here})`, [h2, arcId]);
    arenaMatch = (await db.sql(`insert into arena_matches (shard, game, mode, host_id) values (0, 'race', 'ffa', $1) returning id`, [h2]))[0].id;
    await db.sql(`insert into arena_match_players (match_id, player_id) values ($1, $2)`, [arenaMatch, h2]);
    const a = (await db.rpc(ben, 'lfg_list')).items.find((x: any) => x.id === arenaMatch);
    expect(a).toMatchObject({ kind: 'arena', players: 1, max: 4, route: `/arcade/${arcId}?room=arena`, where: 'the Live Arena' });
  });

  it('started, full, or the host walked off: gone from the list', async () => {
    await db.sql(`update arcade_matches set status = 'playing' where id = $1`, [arcMatch]);
    await db.sql(`update home_presence set seen_at = now() - interval '1 minute' where player_id = $1`, [host]);
    const ids = (await db.rpc(ben, 'lfg_list')).items.map((x: any) => x.id);
    expect(ids).not.toContain(arcMatch);
    expect(ids).not.toContain(homeGame);
  });
});

describe('following someone into their room', () => {
  it('the arcade: you land in the room of the player you followed', async () => {
    const stranger = await db.newPlayer('ivy_open');
    await db.sql(`delete from arcade_presence where arcade_id = $1`, [arcId]);
    for (let i = 0; i < 4; i++) {
      const u = await db.newPlayer(`arc_crowd${i}`);
      await db.sql(`insert into arcade_presence (player_id, arcade_id, shard, seen_at) values ($1, $2, 0, ${here})`, [u, arcId]);
    }
    await db.sql(`insert into arcade_presence (player_id, arcade_id, shard, seen_at) values ($1, $2, 1, ${here})`, [stranger, arcId]);
    // without following: the busy room. Following ivy: hers.
    expect((await db.rpc(eve, 'arcade_live', { p_arcade: arcId })).shard).toBe(0);
    await db.sql(`delete from arcade_presence where player_id = $1`, [eve]);
    await db.rpc(eve, 'place_follow', { p_player: stranger });
    expect((await db.rpc(eve, 'arcade_live', { p_arcade: arcId })).shard).toBe(1);
    await expectError(db.rpc(eve, 'place_follow', { p_player: eve }), 'user_not_found');
  });

  it('the Live Arena too', async () => {
    const a1 = await db.newPlayer('jo_open'), a2 = await db.newPlayer('kit_open');
    await db.sql(`delete from arena_presence`);
    for (let i = 0; i < 3; i++) {
      const u = await db.newPlayer(`arena_crowd${i}`);
      await db.sql(`insert into arena_presence (player_id, shard, seen_at) values ($1, 0, ${here})`, [u]);
    }
    await db.sql(`insert into arena_presence (player_id, shard, seen_at) values ($1, 4, ${here})`, [a1]);
    await db.rpc(a2, 'place_follow', { p_player: a1 });
    expect((await db.rpc(a2, 'arena_live', {})).shard).toBe(4);
  });
});

describe('at home', () => {
  it('is somewhere you can be — and party mates and friends see it', async () => {
    await online(ann, 'home', { username: 'ann_open' });
    const m = (await party(ben)).group.members.find((x: any) => x.username === 'ann_open');
    expect(m.now.activity).toMatchObject({ kind: 'home', detail: { username: 'ann_open' } });
  });
});
