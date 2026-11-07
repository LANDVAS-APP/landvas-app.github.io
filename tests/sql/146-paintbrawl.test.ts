// v0.7 Paintbrawl: the card data matches the app's, the arena is a plot type, everyone starts with two legal decks,
// decks are checked, packs and crafting work, the server-side rules engine runs bot and live matches (moves, turns,
// hidden hands) to the end, and rewards and trophies are handed out once.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';
import { CARDS, STARTERS } from '../../src/shared/brawl/cards';
import { brawlOp, type Svc } from '../../src/shared/brawl/server';
import { botMove } from '../../src/shared/brawl/ai';
import type { State, View } from '../../src/shared/brawl/engine';

const db = new TestDb();
let p1: string, p2: string, p3: string;
const svc: Svc = (fn, args) => db.rpc({ role: 'service_role' }, fn, args);
const op = (uid: string, body: Parameters<typeof brawlOp>[2]) => brawlOp(svc, uid, body);
const shards = async (uid: string) => Number((await db.sql(`select wallet from realm_players where player_id = $1 and kind = 'brawl'`, [uid]))[0]?.wallet?.shards ?? 0);
const raw = async (id: string) => (await db.sql(`select state from brawl_matches where id = $1`, [id]))[0].state as State;
const A = { gx: 3_420_000, gy: 2_120_000 };

async function arena(uid: string, dx: number) {
  await db.rpc(uid, 'claim_starter_plot', { p_gx: A.gx + dx, p_gy: A.gy });
  const g = (await db.rpc(uid, 'my_groups'))[0];
  return (await db.rpc(uid, 'set_group_kind', { p_group_id: g.id, p_kind: 'brawl' })).realm_id as string;
}
/** Place a player's land cards (in the order they come), as the first thing in a match. */
async function placeLands(uid: string, id: string) {
  const v = await db.rpc(uid, 'brawl_view', { p_match: id });
  const me = (v.view as View).p[v.side];
  if ((v.view as View).phase !== 'lands' || me.ready) return;
  await op(uid, { op: 'act', match: id, action: { t: 'lands', lanes: [...me.landCards!] } });
}
/** Play one side's whole turn with the bot brain (as the player would, through the server). */
async function playTurn(uid: string, id: string) {
  for (let i = 0; i < 14; i++) {
    const s = await raw(id); const side = (await db.rpc(uid, 'brawl_view', { p_match: id })).side;
    if (s.over || s.turn !== side) return;
    const a = botMove(s, side, 1);
    await op(uid, { op: 'act', match: id, action: a });
    if (a.t === 'end') return;
  }
  await op(uid, { op: 'act', match: id, action: { t: 'end' } });
}

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  p1 = await db.newPlayer('brawl_one'); p2 = await db.newPlayer('brawl_two'); p3 = await db.newPlayer('brawl_three');
});
afterAll(() => db.close());

describe('Paintbrawl', () => {
  it('the server’s card list and starters match the app’s', async () => {
    const cfg = (await db.sql(`select value from game_config where key = 'brawl'`))[0].value;
    expect(cfg.cards).toEqual(Object.fromEntries(CARDS.map((c) => [c.id, c.rarity])));
    expect(cfg.starters).toEqual(STARTERS);
  });

  it('the arena is a plot type; everyone starts with two starter decks; you need an arena to battle', async () => {
    await expectError(op(p3, { op: 'bot' }), 'brawl_no_arena');
    const id = await arena(p1, 0);
    const g = await db.rpc(p1, 'brawl_get', { p_id: id });
    expect(g.kind).toBe('brawl');
    expect(g.brawl.decks.length).toBe(2);
    expect(g.brawl.cards.sproutling).toBe(2);
    expect(g.brawl.rank.name).toBe('Bronze');
    await arena(p2, 3);
  });

  it('decks are checked: size, copies, ownership, terrains', async () => {
    const d = STARTERS[0];
    await expectError(db.rpc(p1, 'brawl_deck_save', { p_slot: 2, p_name: 'x', p_cards: d.cards.slice(1), p_terrains: d.terrains }), 'deck_size');
    await expectError(db.rpc(p1, 'brawl_deck_save', { p_slot: 2, p_name: 'x', p_cards: [...d.cards.slice(1), 'oakheart'], p_terrains: d.terrains }), 'deck_not_owned');
    await expectError(db.rpc(p1, 'brawl_deck_save', { p_slot: 2, p_name: 'x', p_cards: d.cards, p_terrains: ['meadow', 'lava', 'x', 'y'] }), 'deck_terrains');
    const me = await db.rpc(p1, 'brawl_deck_save', { p_slot: 2, p_name: 'Mine', p_cards: d.cards, p_terrains: ['meadow', 'ember', 'frost', 'neon'] });
    expect(me.decks[2].name).toBe('Mine');
    expect(me.deck_slot).toBe(2);
    await db.rpc(p1, 'brawl_deck_use', { p_slot: 0 });
  });

  it('packs: the free daily one, then for shards; 5 cards with a rare or better; craft and dust', async () => {
    const f = await db.rpc(p1, 'brawl_pack_open', { p_free: true });
    expect(f.cards.length).toBe(5);
    expect(f.cards.some((c: { rarity: string }) => c.rarity !== 'common')).toBe(true);
    await expectError(db.rpc(p1, 'brawl_pack_open', { p_free: true }), 'already_claimed');
    await expectError(db.rpc(p1, 'brawl_pack_open', {}), 'not_enough');
    await db.sql(`update realm_players set wallet = '{"shards": 300}' where player_id = $1 and kind = 'brawl'`, [p1]);
    await db.rpc(p1, 'brawl_pack_open', {});
    expect(await shards(p1)).toBe(180);
    // a card the decks need can't be dusted; a spare can; dust crafts
    await db.sql(`update brawl_players set cards = cards || '{"sproutling": 2}' where player_id = $1`, [p1]);
    await expectError(db.rpc(p1, 'brawl_craft', { p_card: 'sproutling', p_dust: true }), 'brawl_card_in_deck');
    await db.sql(`update brawl_players set cards = cards || '{"pebblegolem": 4}', dust = 0 where player_id = $1`, [p1]);
    const d = await db.rpc(p1, 'brawl_craft', { p_card: 'pebblegolem', p_dust: true });
    expect(d.dust).toBe(5);
    await expectError(db.rpc(p1, 'brawl_craft', { p_card: 'oakheart' }), 'not_enough');
    await db.sql(`update brawl_players set dust = 2000 where player_id = $1`, [p1]);
    const c = await db.rpc(p1, 'brawl_craft', { p_card: 'oakheart' });
    expect(c.cards.oakheart).toBeGreaterThanOrEqual(1);
    expect(c.dust).toBe(400);
  });

  it('a practice match against the bot, played to the end, pays out once', async () => {
    const r = await op(p1, { op: 'bot' });
    expect(r.match).toBeTruthy();
    expect((await op(p1, { op: 'bot' })).match).toBe(r.match); // one live match at a time
    // the view hides the bot's hand
    const v = await db.rpc(p1, 'brawl_view', { p_match: r.match });
    expect(v.bot).toBe(true);
    expect(v.players[1].username).toMatch(/practice bot/);
    expect((v.view as View).p[1].hand.every((h) => h.id === undefined)).toBe(true);
    // it opens with the land cards: the bot has placed its own, nothing else can happen until we place ours
    expect((v.view as View).phase).toBe('lands');
    expect((v.view as View).p[1].ready).toBe(true);
    await expectError(op(p1, { op: 'act', match: r.match, action: { t: 'end' } }), 'brawl_placing_lands');
    await expectError(op(p1, { op: 'act', match: r.match, action: { t: 'lands', lanes: ['neon', 'neon', 'neon', 'neon'] } }), 'brawl_bad_lands');
    await placeLands(p1, r.match);
    expect((await raw(r.match)).phase).toBe('play');
    // a bad move is refused
    await expectError(op(p1, { op: 'act', match: r.match, action: { t: 'play', uid: 99999, lane: 0 } }), 'brawl_no_card');
    const s0 = await shards(p1);
    for (let i = 0; i < 40; i++) { const s = await raw(r.match); if (s.over) break; await playTurn(p1, r.match); }
    const end = await db.rpc(p1, 'brawl_view', { p_match: r.match });
    expect(end.status).toBe('over');
    expect(end.rewards.shards).toBeGreaterThan(0);
    expect(await shards(p1)).toBe(s0 + end.rewards.shards);
    await expectError(op(p1, { op: 'act', match: r.match, action: { t: 'end' } }), 'brawl_over');
  });

  it('two players are matched and play live: turns, a timeout, then a concession; trophies move', async () => {
    expect((await op(p1, { op: 'queue' })).waiting).toBe(true);
    const m = await op(p2, { op: 'queue' });
    expect(m.match).toBeTruthy();
    expect((await op(p1, { op: 'queue' })).match).toBe(m.match);
    // both place their lands (each kept secret from the other until both are ready)
    await placeLands(p1, m.match);
    expect((await raw(m.match)).phase).toBe('lands');
    await placeLands(p2, m.match);
    const s = await raw(m.match);
    expect(s.phase).toBe('play');
    const side1 = (await db.rpc(p1, 'brawl_view', { p_match: m.match })).side;
    const first = s.turn === side1 ? p1 : p2, second = first === p1 ? p2 : p1;
    await expectError(op(second, { op: 'act', match: m.match, action: { t: 'end' } }), 'brawl_not_your_turn');
    await playTurn(first, m.match);
    expect((await raw(m.match)).turn).toBe(s.turn === 0 ? 1 : 0);
    // the player on turn goes quiet: once the clock runs out, either player can move things on
    expect((await op(first, { op: 'tick', match: m.match })).ok).toBe(false);
    await db.sql(`update brawl_matches set deadline = now() - interval '10 seconds' where id = $1`, [m.match]);
    expect((await op(first, { op: 'tick', match: m.match })).ok).toBe(true);
    expect((await raw(m.match)).p[s.turn === 0 ? 1 : 0].timeouts).toBe(1);
    const t0 = (await db.sql(`select trophies from brawl_players where player_id = $1`, [first]))[0].trophies;
    const fin = await op(second, { op: 'concede', match: m.match });
    expect(fin.rewards.result).toBe('loss');
    const v = await db.rpc(first, 'brawl_view', { p_match: m.match });
    expect(v.rewards.result).toBe('win');
    expect(v.rewards.trophies).toBeGreaterThan(0);
    expect((await db.sql(`select trophies from brawl_players where player_id = $1`, [first]))[0].trophies).toBe(t0 + v.rewards.trophies);
    const lb = await db.rpc(p1, 'brawl_leaderboard');
    expect(lb.top.length).toBe(2);
    expect((await db.rpc(first, 'brawl_history'))[0].won).toBe(true);
  });

  it('strangers can’t see a match; the service functions aren’t for players', async () => {
    const id = (await db.sql(`select id from brawl_matches limit 1`))[0].id;
    await expectError(db.rpc(p3, 'brawl_view', { p_match: id }), 'not_found');
    await expect(db.rpc(p1, 'svc_brawl_load', { p_match: id, p_uid: p1 })).rejects.toThrow(/permission denied/);
  });
});
