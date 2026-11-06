// v0.6 Clans: found for 1,000 Ink, join / ask / invite, roles, chat, the clan hall (a live house room keyed by the
// clan), weekly goals filled by members' Ink and hall time, levels, battles and season rewards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let lead: string, off: string, mem: string, other: string, rival: string, clanId: string, rivalId: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
let n = 0;
const earn = (uid: string, amount: number, reason = 'arcade', ref = 'arcade') =>
  db.sql(`select private.grant($1, jsonb_build_object('ink', $2::int), $3, $4, 'x', $5)`, [uid, amount, reason, ref, `t-${uid}-${++n}`]);

beforeAll(async () => {
  await db.init({ ungated: true });
  lead = await db.newPlayer('clan_lead'); off = await db.newPlayer('clan_off'); mem = await db.newPlayer('clan_mem');
  other = await db.newPlayer('clan_other'); rival = await db.newPlayer('clan_rival');
  for (const u of [lead, rival]) await db.giveInk(u, 1500);
});
afterAll(() => db.close());

describe('Clans', () => {
  it('founding costs 1,000 Ink and checks the name, tag, emblem and colour', async () => {
    const h = await db.rpc(lead, 'clan_home');
    expect(h.clan).toBeNull();
    expect(h.cfg.found_cost).toBe(1000);
    await expectError(db.rpc(other, 'clan_found', { p_name: 'Poor Folk', p_tag: 'POOR', p_emblem: '🐉', p_color: '#7B5CFF' }), 'insufficient');
    await expectError(db.rpc(lead, 'clan_found', { p_name: 'X', p_tag: 'AB', p_emblem: '🐉', p_color: '#7B5CFF' }), 'invalid_clan_name');
    await expectError(db.rpc(lead, 'clan_found', { p_name: 'Inkwells', p_tag: 'A!', p_emblem: '🐉', p_color: '#7B5CFF' }), 'invalid_clan_tag');
    await expectError(db.rpc(lead, 'clan_found', { p_name: 'Inkwells', p_tag: 'INK', p_emblem: '💩', p_color: '#7B5CFF' }), 'invalid_clan_emblem');
    const before = await ink(lead);
    const c = await db.rpc(lead, 'clan_found', { p_name: 'Inkwells', p_tag: 'ink', p_emblem: '🐉', p_color: '#7B5CFF', p_motto: 'We paint together', p_privacy: 'request' });
    expect(before - (await ink(lead))).toBe(1000);
    expect(c).toMatchObject({ name: 'Inkwells', tag: 'INK', role: 'leader', level: 1, members: 1, privacy: 'request' });
    expect(c.goals.length).toBe(3);
    expect(c.goals.map((g: any) => g.k).slice(0, 2)).toEqual(['ink', 'hall']);
    clanId = c.id;
    await expectError(db.rpc(rival, 'clan_found', { p_name: 'INKWELLS', p_tag: 'RIV', p_emblem: '🦊', p_color: '#FF5FA2' }), 'clan_name_taken');
    await expectError(db.rpc(rival, 'clan_found', { p_name: 'Rivals', p_tag: 'Ink', p_emblem: '🦊', p_color: '#FF5FA2' }), 'clan_tag_taken');
    rivalId = (await db.rpc(rival, 'clan_found', { p_name: 'Rivals', p_tag: 'RIV', p_emblem: '🦊', p_color: '#FF5FA2' })).id;
    await expectError(db.rpc(lead, 'clan_found', { p_name: 'Second', p_tag: 'TWO', p_emblem: '🦊', p_color: '#FF5FA2' }), 'already_in_clan');
  });

  it('players ask to join a request clan; officers say yes or no; invites skip the queue', async () => {
    expect(await db.rpc(off, 'clan_join', { p_id: clanId })).toMatchObject({ joined: false, asked: true });
    expect(await db.rpc(mem, 'clan_join', { p_id: clanId })).toMatchObject({ joined: false, asked: true });
    const c = await db.rpc(lead, 'clan_get');
    expect(c.requests.length).toBe(2);
    await expectError(db.rpc(mem, 'clan_answer', { p_ask: c.requests[0].id, p_yes: true }), 'clan_officers_only');
    const reqOff = c.requests.find((r: any) => r.player.id === off), reqMem = c.requests.find((r: any) => r.player.id === mem);
    await db.rpc(lead, 'clan_answer', { p_ask: reqOff.id, p_yes: true });
    await db.rpc(lead, 'clan_answer', { p_ask: reqMem.id, p_yes: false });
    expect((await db.rpc(lead, 'clan_get')).members).toBe(2);
    // invite instead
    await db.rpc(lead, 'clan_invite', { p_username: '@clan_mem' });
    const inv = (await db.rpc(mem, 'clan_home')).invites;
    expect(inv[0].clan.name).toBe('Inkwells');
    await db.rpc(mem, 'clan_answer', { p_ask: inv[0].id, p_yes: true });
    expect((await db.rpc(mem, 'clan_home')).clan).toMatchObject({ id: clanId, role: 'member' });
    // outsiders see the page but not the goals, hall or chat
    const seen = await db.rpc(other, 'clan_get', { p_id: clanId });
    expect(seen.role).toBeNull(); expect(seen.goals).toBeUndefined(); expect(seen.members_list.length).toBe(3);
    await expectError(db.rpc(other, 'clan_chat_send', { p_body: 'hi' }), 'not_in_clan');
  });

  it('roles: the leader makes officers; officers kick members, not each other; leaving makes you wait to rejoin', async () => {
    await expectError(db.rpc(off, 'clan_set_role', { p_player: mem, p_role: 'officer' }), 'clan_officers_only');
    await db.rpc(lead, 'clan_set_role', { p_player: off, p_role: 'officer' });
    await db.rpc(off, 'clan_kick', { p_player: mem });
    expect((await db.rpc(mem, 'clan_home')).clan).toBeNull();
    await db.sql(`update clans set privacy = 'open' where id = $1`, [clanId]);
    await expectError(db.rpc(mem, 'clan_join', { p_id: clanId }), 'clan_rejoin_wait');
    await db.sql(`update clan_left set left_at = now() - interval '13 hours' where player_id = $1`, [mem]);
    expect((await db.rpc(mem, 'clan_join', { p_id: clanId })).joined).toBe(true);
    await expectError(db.rpc(off, 'clan_kick', { p_player: lead }), 'clan_cant_kick');
  });

  it('clan chat works from anywhere for members', async () => {
    const m = await db.rpc(mem, 'clan_chat_send', { p_body: 'gg everyone' });
    const l = await db.rpc(lead, 'clan_chat_list', { p_after: 0 });
    expect(l.items.map((x: any) => x.body)).toContain('gg everyone');
    expect((await db.rpc(lead, 'clan_chat_list', { p_after: m.id })).items.length).toBe(0);
  });

  it('the clan hall is a live room only members can enter, and time there fills the hall goal', async () => {
    const r = await db.rpc(lead, 'home_live', { p_host: clanId });
    expect(r.channel).toBe(`home:${clanId}:0`);
    expect(r.room_size).toBeGreaterThanOrEqual(16);
    await db.rpc(mem, 'home_live', { p_host: clanId });
    expect((await db.rpc(lead, 'home_live', { p_host: clanId })).members.map((m: any) => m.id)).toContain(mem);
    await expectError(db.rpc(other, 'home_live', { p_host: clanId }), 'not_found');
    // chat and party games work there like in a house
    await db.rpc(mem, 'home_chat_send', { p_home: clanId, p_body: 'in the hall!' });
    const g = await db.rpc(lead, 'home_game_create', { p_home: clanId, p_game: 'chairs' });
    expect(g.status).toBe('lobby');
    await db.rpc(lead, 'home_game_leave', { p_game: g.id });
    // 8 seconds since the last beat count as hanging out
    await db.sql(`update home_presence set seen_at = now() - interval '8 seconds' where player_id = $1`, [mem]);
    await db.rpc(mem, 'home_live', { p_host: clanId });
    const c = await db.rpc(mem, 'clan_get');
    expect(c.goals.find((x: any) => x.k === 'hall').progress).toBeGreaterThanOrEqual(8);
    expect(c.me.week_secs).toBeGreaterThanOrEqual(8);
  });

  it('officers decorate the hall with furniture the clan level unlocks', async () => {
    const c = await db.rpc(lead, 'clan_get');
    const free = Object.entries(c.unlocks).find(([, lv]) => lv === 1)![0];
    const locked = Object.entries(c.unlocks).find(([, lv]) => (lv as number) > 1)![0];
    const wall = (c.catalog.items[free].mount === 'wall');
    const spot = wall ? { x: 0, z: -5.9 } : { x: 0, z: 0 };
    const s = await db.rpc(off, 'clan_hall_save', { p_name: 'Dragon Den', p_style: { wall: 'brick' }, p_layout: [{ i: free, ...spot, r: 0 }] });
    expect(s.hall).toMatchObject({ name: 'Dragon Den', layout: [{ i: free }] });
    const lw = c.catalog.items[locked].mount === 'wall';
    await expectError(db.rpc(lead, 'clan_hall_save', { p_name: null, p_style: {}, p_layout: [{ i: locked, x: 0, z: lw ? -5.9 : 0, r: 0 }] }), 'clan_item_locked');
    await expectError(db.rpc(mem, 'clan_hall_save', { p_name: null, p_style: {}, p_layout: [] }), 'clan_officers_only');
    // at level 10, everything
    await db.sql(`update clans set xp = 10000000 where id = $1`, [clanId]);
    const s2 = await db.rpc(lead, 'clan_hall_save', { p_name: null, p_style: {}, p_layout: [{ i: locked, x: 0, z: lw ? -5.9 : 0, r: 0 }] });
    expect(s2.hall.layout[0].i).toBe(locked);
    await expectError(db.rpc(lead, 'clan_hall_save', { p_name: null, p_style: {}, p_layout: [{ i: locked, x: 40, z: 0, r: 0 }] }), 'invalid_layout');
    await db.sql(`update clans set xp = 0 where id = $1`, [clanId]);
  });

  it('members’ Ink fills goals and levels the clan; finished goals pay everyone who helped', async () => {
    const c0 = await db.rpc(lead, 'clan_get');
    const g0 = c0.goals.find((g: any) => g.k === 'ink');
    await earn(mem, 300);
    let c = await db.rpc(lead, 'clan_get');
    expect(c.goals.find((g: any) => g.k === 'ink').progress).toBe(300);
    expect(c.week_score).toBe(300);
    expect(c.xp).toBe(300);
    expect(c.members_list.find((m: any) => m.id === mem).week_ink).toBe(300);
    // clan rewards themselves don't count; referral shares don't either
    await earn(mem, g0.target, 'arcade');
    c = await db.rpc(mem, 'clan_get');
    const g = c.goals.find((x: any) => x.k === 'ink');
    expect(g.done).toBe(true);
    expect(c.xp).toBeGreaterThanOrEqual(300 + g0.target + 400);
    expect(c.level).toBeGreaterThan(1);
    expect(c.feed.some((f: any) => f.kind === 'goal')).toBe(true);
    // the leader hasn't helped yet: nothing to collect
    expect((await db.rpc(lead, 'clan_get')).goals.find((x: any) => x.k === 'ink').claim).toBeNull();
    const before = await ink(mem);
    const r = await db.rpc(mem, 'clan_claim', { p_key: g.claim });
    expect(r.ink).toBe(g.reward);
    expect((await ink(mem)) - before).toBe(g.reward);
    const xp = (await db.rpc(mem, 'clan_get')).xp;
    expect(xp).toBe(c.xp); // a clan reward isn't credited back
    await expectError(db.rpc(mem, 'clan_claim', { p_key: g.claim }), 'already_claimed');
    await expectError(db.rpc(other, 'clan_claim', { p_key: g.claim }), 'not_in_clan');
  });

  it('realm and party-game Ink fill their own goals', async () => {
    const w = (await db.sql(`select goals from clan_weeks where clan_id = $1`, [clanId]))[0].goals;
    // make sure the week has a realm and a party goal for the test
    const goals = [w[0], w[1], { k: 'realm', cat: 'realm', emoji: '⛏️', label: 'Earn Ink in realms', unit: 'ink', target: 100 }, { k: 'party', cat: 'party', emoji: '🎉', label: 'Win Ink in house party games', unit: 'ink', target: 100 }];
    await db.sql(`update clan_weeks set goals = $2 where clan_id = $1`, [clanId, JSON.stringify(goals)]);
    await earn(mem, 40, 'realm', 'realm');
    await earn(mem, 25, 'minigame', 'home_game');
    const c = await db.rpc(mem, 'clan_get');
    expect(c.goals.find((g: any) => g.k === 'realm').progress).toBe(40);
    expect(c.goals.find((g: any) => g.k === 'party').progress).toBe(25);
  });

  it('clan vs clan: challenge, accept, a day of scoring, a winner and rewards', async () => {
    await expectError(db.rpc(mem, 'clan_challenge', { p_clan: rivalId }), 'clan_officers_only');
    await db.rpc(off, 'clan_challenge', { p_clan: rivalId });
    await expectError(db.rpc(lead, 'clan_challenge', { p_clan: rivalId }), 'already_challenged');
    const rv = await db.rpc(rival, 'clan_get');
    const pending = rv.battles.find((b: any) => b.status === 'pending');
    expect(pending.vs.name).toBe('Inkwells');
    const live = (await db.rpc(rival, 'clan_battle_answer', { p_battle: pending.id, p_yes: true })).battles.find((b: any) => b.id === pending.id);
    expect(live.status).toBe('live');
    await earn(mem, 200); await earn(rival, 50);
    let b = (await db.rpc(lead, 'clan_get')).battles.find((x: any) => x.id === pending.id);
    expect(b).toMatchObject({ us: 200, them: 50 });
    // time's up
    await db.sql(`update clan_battles set ends_at = now() - interval '1 second' where id = $1`, [pending.id]);
    const c = await db.rpc(mem, 'clan_get');
    b = c.battles.find((x: any) => x.id === pending.id);
    expect(b).toMatchObject({ status: 'done', won: true, mine: 200 });
    expect(c.wins).toBe(1);
    expect((await db.rpc(rival, 'clan_get')).losses).toBe(1);
    expect((await db.rpc(lead, 'clan_get')).battles.find((x: any) => x.id === pending.id).claim).toBeNull(); // didn't play
    const before = await ink(mem);
    expect((await db.rpc(mem, 'clan_claim', { p_key: b.claim })).ink).toBe(120);
    expect((await ink(mem)) - before).toBe(120);
    const lose = (await db.rpc(rival, 'clan_get')).battles.find((x: any) => x.id === pending.id);
    expect((await db.rpc(rival, 'clan_claim', { p_key: lose.claim })).ink).toBe(40);
  });

  it('the weekly board ranks clans by Ink, and last week’s top clans collect season rewards', async () => {
    const board = await db.rpc(lead, 'clan_board', { p_kind: 'week' });
    expect(board.rows[0].id).toBe(clanId);
    expect(board.mine).toBe(1);
    // pretend last week happened
    await db.sql(`insert into clan_weeks (clan_id, week, score) values ($1, private.clan_week() - 7, 900), ($2, private.clan_week() - 7, 300)`, [clanId, rivalId]);
    await db.sql(`insert into clan_contrib (player_id, clan_id, week, ink) values ($1, $2, private.clan_week() - 7, 900)`, [mem, clanId]);
    const last = await db.rpc(lead, 'clan_board', { p_kind: 'last' });
    expect(last.rows.map((r: any) => r.prize)).toEqual([300, 200]);
    const c = await db.rpc(mem, 'clan_get');
    expect(c.season).toMatchObject({ rank: 1, ink: 300 });
    expect((await db.rpc(lead, 'clan_get')).season.claim).toBeNull(); // didn't play last week
    expect((await db.rpc(mem, 'clan_claim', { p_key: c.season.claim })).ink).toBe(300);
    await expectError(db.rpc(mem, 'clan_claim', { p_key: c.season.claim }), 'already_claimed');
    const lv = await db.rpc(lead, 'clan_board', { p_kind: 'level' });
    expect(lv.rows[0].id).toBe(clanId);
    const list = await db.rpc(other, 'clan_list', { p_q: 'riv' });
    expect(list.map((x: any) => x.name)).toEqual(['Rivals']);
  });

  it('the leader leaving hands the clan on; the last one out closes it', async () => {
    await db.rpc(lead, 'clan_leave');
    const c = await db.rpc(off, 'clan_get');
    expect(c.role).toBe('leader');
    expect(c.members).toBe(2);
    await db.rpc(rival, 'clan_leave');
    expect((await db.sql(`select count(*)::int n from clans where id = $1`, [rivalId]))[0].n).toBe(0);
    // and can found or join straight away
    expect((await db.rpc(rival, 'clan_home')).rejoin_at).toBeNull();
  });
});
