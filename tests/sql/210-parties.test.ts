// v1.2 Parties: one party for everything — public lobbies (busiest first), private parties, party chat, arcade chat,
// invites to online players, friends or anyone with a link, and the privacy switches that go with them.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ana: string, ben: string, cal: string, dee: string, eve: string, fox: string, arcId: string;
const A = { gx: 3_350_000, gy: 2_050_000 };
const online = (u: string) => db.rpc(u, 'set_activity', { p_kind: 'map', p_detail: {} });
const offline = (u: string) => db.sql(`update player_activity set at = now() - interval '1 hour' where player_id = $1`, [u]);
const party = (u: string) => db.rpc(u, 'travel_group');
// one message a second: tests that send a few in a row skip the wait
const unburst = () => db.sql(`delete from private.rate_limits where action like '%chat_burst%'`);
const befriend = async (a: string, b: string) => { await db.rpc(a, 'friend_request', { p_player_id: b }); await db.rpc(b, 'friend_respond', { p_player_id: a, p_accept: true }); };

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ana = await db.newPlayer('ana_party'); ben = await db.newPlayer('ben_party'); cal = await db.newPlayer('cal_party');
  dee = await db.newPlayer('dee_party'); eve = await db.newPlayer('eve_party'); fox = await db.newPlayer('fox_party');
  await db.rpc(ana, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const g = (await db.rpc(ana, 'my_groups'))[0];
  arcId = (await db.rpc(ana, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' })).arcade_id;
});
afterAll(() => db.close());

describe('starting a party', () => {
  it('anyone can start one — no Travel plot needed — with a name, Public or Private, and what you’re up to', async () => {
    const p = await db.rpc(ben, 'party_create', { p_name: 'Night owls', p_visibility: 'public', p_activity: 'arcade' });
    expect(p.group).toMatchObject({ leader: true, name: 'Night owls', custom_name: 'Night owls', visibility: 'public', activity: 'arcade', max: 10 });
    expect(p.group.chat).toMatch(/^ptc:[0-9a-f]{32}$/);
    expect(p.group.ref).toBeTruthy();
    expect(p.group.members).toHaveLength(1);
    expect(p.group.members[0]).toMatchObject({ me: true, online: true });
    // the plain old way still works (no plot needed either), and gets a default name
    const q = await db.rpc(cal, 'travel_group_create');
    // (public by default since open play; cal makes it private)
    expect(q.group).toMatchObject({ name: "cal_party's party", custom_name: null, visibility: 'public', activity: 'hangout' });
    expect((await db.rpc(cal, 'party_update', { p_visibility: 'private' })).group.visibility).toBe('private');
    await expectError(db.rpc(cal, 'party_create', {}), 'already_in_group');
  });

  it('only the leader changes it; names stay friendly', async () => {
    await expectError(db.rpc(ben, 'party_update', { p_activity: 'skydiving' }), 'invalid_party_activity');
    await expectError(db.rpc(ben, 'party_update', { p_visibility: 'secret' }), 'invalid_party_visibility');
    await expectError(db.rpc(ben, 'party_update', { p_name: 'x'.repeat(40) }), 'invalid_party_name');
    await expectError(db.rpc(ben, 'party_update', { p_name: 'visit www.scam.com' }), 'invalid_party_name');
    const p = await db.rpc(ben, 'party_update', { p_note: 'Mirror arcade grind, all welcome' });
    expect(p.group.note).toBe('Mirror arcade grind, all welcome');
    expect((await db.rpc(ben, 'party_update', { p_name: '' })).group.name).toBe("ben_party's party");
    await db.rpc(ben, 'party_update', { p_name: 'Night owls' });
  });
});

describe('lobbies', () => {
  it('list live public parties only — the most people online first, then the biggest', async () => {
    // ben's public party: ben + dee + eve; ana's public party: ana + fox; cal's stays private
    await db.rpc(dee, 'party_join_public', { p_group: (await party(ben)).group.id });
    await db.rpc(eve, 'party_join_code', { p_code: (await party(ben)).group.code.toLowerCase() });
    await db.rpc(ana, 'party_create', { p_name: 'Map walkers', p_visibility: 'public', p_activity: 'explore' });
    await db.rpc(fox, 'party_join_public', { p_group: (await party(ana)).group.id });
    for (const u of [ana, ben, cal, dee, fox]) await online(u);
    await offline(eve);
    let l = await db.rpc(cal, 'party_lobbies', {});
    expect(l.lobbies.map((x: any) => [x.name, x.online, x.size])).toEqual([['Night owls', 2, 3], ['Map walkers', 2, 2]]);
    expect(l.lobbies[0]).toMatchObject({ activity: 'arcade', note: 'Mirror arcade grind, all welcome', max: 10, full: false, mine: false });
    expect(l.lobbies[0].leader.username).toBe('ben_party');
    expect(l.lobbies[0].members[0]).toMatchObject({ username: 'ben_party', leader: true, online: true });
    // eve comes online: still the busiest. Everyone in Map walkers goes quiet: it drops off the list
    await online(eve); await offline(ana); await offline(fox);
    l = await db.rpc(cal, 'party_lobbies', {});
    expect(l.lobbies.map((x: any) => [x.name, x.online])).toEqual([['Night owls', 3]]);
    // filtered by what they're up to
    expect((await db.rpc(cal, 'party_lobbies', { p_activity: 'explore' })).lobbies).toEqual([]);
    expect((await db.rpc(cal, 'party_lobbies', { p_activity: 'arcade' })).lobbies).toHaveLength(1);
    // a private party can't be walked into
    await expectError(db.rpc(fox, 'party_join_public', { p_group: (await party(cal)).group.id, p_switch: true }), 'party_private');
    await online(ana); await online(fox);
  });

  it('a lobby shows how many of your friends are in it', async () => {
    await befriend(cal, dee);
    const l = await db.rpc(cal, 'party_lobbies', {});
    expect(l.lobbies.find((x: any) => x.name === 'Night owls').friends).toBe(1);
  });

  it('switching parties takes a yes', async () => {
    await expectError(db.rpc(fox, 'party_join_public', { p_group: (await party(ben)).group.id }), 'already_in_group');
    const p = await db.rpc(fox, 'party_join_public', { p_group: (await party(ben)).group.id, p_switch: true });
    expect(p.group.name).toBe('Night owls');
    expect((await party(ana)).group.members.map((m: any) => m.username)).toEqual(['ana_party']);
    await db.rpc(fox, 'party_join_code', { p_code: (await party(ana)).group.code, p_switch: true });
  });
});

describe('members', () => {
  it('see who’s online and what each other is up to; the leader can hand over the lead', async () => {
    await db.rpc(dee, 'set_activity', { p_kind: 'arcade', p_detail: { arcade: arcId } });
    const g = (await party(ben)).group;
    const d = g.members.find((m: any) => m.username === 'dee_party');
    expect(d).toMatchObject({ online: true, now: { online: true, activity: { kind: 'arcade', detail: { arcade: arcId } } } });
    expect(g.online).toBe(3);
    await expectError(db.rpc(dee, 'party_promote', { p_player: eve }), 'not_group_leader');
    expect((await db.rpc(ben, 'party_promote', { p_player: dee })).group.leader).toBe(false);
    expect((await party(dee)).group.leader).toBe(true);
    await db.rpc(dee, 'party_promote', { p_player: ben });
  });
});

describe('invites', () => {
  it('go to friends and to anyone online, with an alert — and start a party for you if you’re not in one', async () => {
    const solo = await db.newPlayer('gus_party');
    await online(solo);
    await befriend(solo, cal);
    const t = await db.rpc(solo, 'party_invite_targets', {});
    expect(t.friends.map((f: any) => [f.username, f.online, f.friend])).toEqual([['cal_party', true, true]]);
    const on = t.online.map((x: any) => x.username);
    expect(on).toEqual(expect.arrayContaining(['ana_party', 'ben_party', 'dee_party', 'eve_party', 'fox_party']));
    expect(on).not.toContain('cal_party'); // already under friends
    expect(on).not.toContain('gus_party');
    expect(t.online.find((x: any) => x.username === 'ben_party').busy).toBe(true);
    expect(t.online_count).toBeGreaterThanOrEqual(6);
    // inviting with no party starts one
    expect((await party(solo)).group).toBeNull();
    const p = await db.rpc(solo, 'party_invite', { p_player: eve });
    expect(p.group).toMatchObject({ leader: true, visibility: 'public' });
    expect(p.group.invited.map((x: any) => x.username)).toEqual(['eve_party']);
    const inv = (await party(eve)).invites;
    expect(inv[0]).toMatchObject({ name: "gus_party's party", size: 1, activity: 'hangout' });
    expect(inv[0].by.username).toBe('gus_party');
    const alerts = await db.sql(`select kind, data from player_notifications where player_id = $1 and kind = 'party_invite'`, [eve]);
    expect(alerts).toHaveLength(1);
    // inviting again within the hour doesn't ping them twice
    await db.rpc(solo, 'party_invite', { p_player: eve });
    expect(await db.sql(`select 1 from player_notifications where player_id = $1 and kind = 'party_invite'`, [eve])).toHaveLength(1);
    // a name typed in finds anyone
    const s = await db.rpc(solo, 'party_invite_targets', { p_query: '@eve' });
    expect(s.search.map((x: any) => [x.username, x.invited])).toEqual([['eve_party', true]]);
    // accepting from another party takes a yes; then they're in
    await expectError(db.rpc(eve, 'party_accept', { p_group: inv[0].group_id }), 'already_in_group');
    const j = await db.rpc(eve, 'party_accept', { p_group: inv[0].group_id, p_switch: true });
    expect(j.group.members.map((m: any) => m.username)).toEqual(['gus_party', 'eve_party']);
    expect(j.invites).toEqual([]);
    await expectError(db.rpc(solo, 'party_invite', { p_player: solo }), 'cannot_invite_self');
    await expectError(db.rpc(solo, 'party_invite', { p_player: eve }), 'already_in_group');
    await db.rpc(eve, 'party_join_code', { p_code: (await party(ben)).group.code, p_switch: true });
    await db.rpc(solo, 'travel_group_leave');
  });

  it('old invites drop off, and can be taken back', async () => {
    await db.rpc(ben, 'party_invite', { p_player: cal });
    expect((await party(cal)).invites).toHaveLength(1);
    await db.rpc(dee, 'party_uninvite', { p_player: cal });
    expect((await party(cal)).invites).toHaveLength(0);
    await db.rpc(ben, 'party_invite', { p_player: cal });
    await db.sql(`update travel_group_invites set created_at = now() - interval '2 days' where player_id = $1`, [cal]);
    expect((await party(cal)).invites).toHaveLength(0);
    await expectError(db.rpc(cal, 'party_accept', { p_group: (await party(ben)).group.id }), 'group_not_found');
  });

  it('respect privacy: hidden from Online now, friends-only invites, and blocks', async () => {
    await db.rpc(fox, 'set_privacy', { p_patch: { online: false, party_invites: false } });
    const t = await db.rpc(ben, 'party_invite_targets', {});
    expect(t.online.map((x: any) => x.username)).not.toContain('fox_party');
    // a name typed in still finds them, but they only take invites from friends
    const s = await db.rpc(ben, 'party_invite_targets', { p_query: 'fox' });
    expect(s.search[0]).toMatchObject({ username: 'fox_party', online: false, friends_only: true });
    await expectError(db.rpc(ben, 'party_invite', { p_player: fox }), 'party_invites_friends_only');
    await befriend(ben, fox);
    await db.rpc(ben, 'party_invite', { p_player: fox });
    expect((await party(fox)).invites[0].by.username).toBe('ben_party');
    await db.rpc(fox, 'set_privacy', { p_patch: { online: true, party_invites: true } });
    // someone who blocked you can't be invited, and doesn't see your lobby
    await db.rpc(cal, 'block_player', { p_player_id: ben });
    await expectError(db.rpc(ben, 'party_invite', { p_player: cal }), 'user_not_found');
    expect((await db.rpc(cal, 'party_lobbies', {})).lobbies.map((x: any) => x.name)).not.toContain('Night owls');
    await db.rpc(cal, 'block_player', { p_player_id: ben, p_on: false });
  });
});

describe('invite links', () => {
  it('show the party to anyone (signed in or not) and join it in one go', async () => {
    const code = (await party(ben)).group.code;
    const pv = await db.rpc(null, 'party_preview', { p_code: code.toLowerCase() });
    expect(pv).toMatchObject({ code, name: 'Night owls', activity: 'arcade', visibility: 'public', max: 10, mine: false });
    expect(pv.leader.username).toBe('ben_party');
    expect(pv.size).toBe(3);
    expect(await db.rpc(null, 'party_preview', { p_code: 'NOPE00' })).toBeNull();
    expect((await db.rpc(ben, 'party_preview', { p_code: code })).mine).toBe(true);
    // a brand-new player joins straight from the link
    const neo = await db.newPlayer('neo_party');
    const j = await db.rpc(neo, 'party_join_code', { p_code: code });
    expect(j.group.members.map((m: any) => m.username)).toContain('neo_party');
    // joining your own party again is fine
    expect((await db.rpc(neo, 'party_join_code', { p_code: code })).group.code).toBe(code);
    await db.rpc(neo, 'travel_group_leave');
  });

  it('a full party says so', async () => {
    const code = (await party(ben)).group.code;
    const extra: string[] = [];
    const room = 10 - (await party(ben)).group.members.length;
    for (let i = 0; i < room; i++) { const u = await db.newPlayer(`full_${i}`); extra.push(u); await db.rpc(u, 'party_join_code', { p_code: code }); }
    expect((await party(ben)).group.members).toHaveLength(10);
    const late = await db.newPlayer('late_party');
    await expectError(db.rpc(late, 'party_join_code', { p_code: code }), 'group_full');
    for (const u of extra) await db.rpc(u, 'travel_group_leave');
  });
});

describe('party chat', () => {
  it('is for members only, shows joins and leaves, and starts from when you joined', async () => {
    const m = await db.rpc(ben, 'party_chat_send', { p_body: '  hi   everyone  ' });
    expect(m).toMatchObject({ body: 'hi everyone', kind: 'chat' });
    const outsider = await db.newPlayer('out_chat');
    await expectError(db.rpc(outsider, 'party_chat_send', { p_body: 'let me in' }), 'not_in_group');
    expect(await db.rpc(outsider, 'party_chat_list', {})).toEqual({ items: [], topic: null, party: null });
    // another party's members don't see it either
    expect((await db.rpc(cal, 'party_chat_list', {})).items.map((x: any) => x.body)).not.toContain('hi everyone');
    await unburst();
    await expectError(db.rpc(ben, 'party_chat_send', { p_body: 'go to discord.gg/abc' }), 'chat_links');
    const l = await db.rpc(dee, 'party_chat_list', {});
    expect(l.topic).toBe((await party(dee)).group.chat);
    const lines = l.items.map((x: any) => `${x.kind}:${x.player.username}:${x.body}`);
    expect(lines).toContain('chat:ben_party:hi everyone');
    expect(lines).toContain('join:eve_party:joined the party');
    expect(lines.some((x: string) => x.startsWith('leave:'))).toBe(true);
    // the party's creator didn't "join" it
    expect(lines).not.toContain('join:ben_party:joined the party');
    // someone who joins now doesn't see what was said before
    const late = await db.newPlayer('late_chat');
    await db.rpc(late, 'party_join_code', { p_code: (await party(ben)).group.code });
    const theirs = (await db.rpc(late, 'party_chat_list', {})).items.map((x: any) => x.body);
    expect(theirs).toEqual(['joined the party']);
    await db.rpc(late, 'travel_group_leave');
    // after a given id: only what's new
    const after = (await db.rpc(dee, 'party_chat_list', {})).items.at(-1).id;
    await unburst();
    await db.rpc(eve, 'party_chat_send', { p_body: 'omw' });
    expect((await db.rpc(dee, 'party_chat_list', { p_after: after })).items.map((x: any) => x.body)).toEqual(['omw']);
  });

  it('respects mutes', async () => {
    await db.sql(`update players set chat_muted_until = now() + interval '1 hour' where id = $1`, [eve]);
    await expectError(db.rpc(eve, 'party_chat_send', { p_body: 'hello?' }), 'chat_muted');
    await db.sql(`update players set chat_muted_until = null where id = $1`, [eve]);
  });
});

describe('arcades together', () => {
  it('everyone in the same arcade room can chat; nobody outside it can', async () => {
    await db.rpc(ana, 'arcade_live', { p_arcade: arcId, p_x: 0, p_z: 5 });
    await db.rpc(cal, 'arcade_live', { p_arcade: arcId, p_x: 1, p_z: 5 });
    const m = await db.rpc(ana, 'arcade_chat_send', { p_arcade: arcId, p_body: 'gg' });
    expect(m.body).toBe('gg');
    const l = await db.rpc(cal, 'arcade_chat_list', { p_arcade: arcId });
    expect(l.topic).toMatch(new RegExp(`^ac:${arcId}:\\d+$`));
    expect(l.items.map((x: any) => x.body)).toEqual(['gg']);
    await expectError(db.rpc(ben, 'arcade_chat_send', { p_arcade: arcId, p_body: 'hey' }), 'not_in_arcade');
    expect((await db.rpc(ben, 'arcade_chat_list', { p_arcade: arcId })).items).toEqual([]);
  });

  it('walking into an arcade your party is in puts you in their room', async () => {
    // two rooms with space: five strangers in room 0, ben (dee's party mate) alone in room 1
    await db.sql(`delete from arcade_presence where arcade_id = $1`, [arcId]);
    for (let i = 0; i < 5; i++) {
      const u = await db.newPlayer(`arc_fill${i}`);
      await db.sql(`insert into arcade_presence (player_id, arcade_id, shard, seen_at) values ($1, $2, 0, now() + interval '30 seconds')`, [u, arcId]);
    }
    await db.sql(`insert into arcade_presence (player_id, arcade_id, shard, seen_at) values ($1, $2, 1, now() + interval '30 seconds')`, [ben, arcId]);
    // someone with no party there goes to the busier room; dee goes to ben's
    expect((await db.rpc(cal, 'arcade_live', { p_arcade: arcId })).shard).toBe(0);
    const d = await db.rpc(dee, 'arcade_live', { p_arcade: arcId });
    expect(d.shard).toBe(1);
    expect(d.members.map((x: any) => x.id)).toEqual([ben]);
  });
});

describe('privacy switches', () => {
  it('are in the settings, on by default', async () => {
    const p = await db.rpc(ana, 'my_privacy');
    expect(p).toMatchObject({ online: true, party_invites: true });
  });
});
