// v0.10: Roller Mural on Prism plots, Ink duels, joystick refills with Ink.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, a: string, b: string, c: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const svc = { role: 'service_role' } as const;
const finish = (duel: string, player: string, score: number, time = 20000) =>
  db.rpc(svc, 'svc_duel_finish', { p_duel_id: duel, p_player_id: player, p_result: { valid: true, score, time_ms: time, summary: {} } });

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('duelowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'admin') on conflict do nothing`, [owner]);
  a = await db.newPlayer('dueler_a');
  b = await db.newPlayer('dueler_b');
  c = await db.newPlayer('dueler_c');
  for (const p of [a, b, c]) await db.giveInk(p, 1000);
  // the time checks compare against real elapsed time: start every run in the past
  await db.sql(`create or replace function private.backdate_runs() returns void language sql as $$ update public.duel_runs set started_at = now() - interval '30 seconds' where finished_at is null $$`);
});
afterAll(() => db.close());

describe('roller mural', () => {
  it('Prism plots now host Roller Mural', async () => {
    const w = await db.rpc(null, 'world_config');
    const prism = w.plot_types.find((t: any) => t.id === 'prism');
    expect(prism.minigame).toBe('rollermural');
    expect(w.minigames.games.rollermural).toBeTruthy();
    expect(w.minigames.games.hueflow).toBeUndefined();
  });
});

describe('duels', () => {
  it('are off until the operator switches them on', async () => {
    await expectError(db.rpc(a, 'duel_create', { p_game: 'turfwars', p_stake: 50, p_idempotency_key: 'duel-off-test-1' }), 'duels_disabled');
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.duels.value;
    await db.rpc(owner, 'admin_config_set', { p_key: 'duels', p_value: { ...cfg, enabled: true } });
  });

  it('both stake, the higher score takes the pot; scores stay hidden until both played', async () => {
    const start = await db.rpc(a, 'duel_create', { p_game: 'forgery', p_stake: 100, p_idempotency_key: 'duel-create-a-1' });
    expect(start.seed).toBeTruthy();
    expect(await ink(a)).toBe(900);
    await db.sql('select private.backdate_runs()');
    await finish(start.duel_id, a, 500);
    const lobbyB = await db.rpc(b, 'duels_lobby');
    const open = lobbyB.open.find((d: any) => d.id === start.duel_id);
    expect(open.stake).toBe(100);
    expect(open.runs).toBeNull(); // b can't see a's score
    const acc = await db.rpc(b, 'duel_accept', { p_duel_id: start.duel_id, p_idempotency_key: 'duel-accept-b-1' });
    expect(acc.seed).toBe(start.seed); // the same challenge
    expect(await ink(b)).toBe(900);
    await expectError(db.rpc(c, 'duel_accept', { p_duel_id: start.duel_id, p_idempotency_key: 'duel-accept-c-1' }), 'duel_unavailable');
    await db.sql('select private.backdate_runs()');
    const done = await finish(start.duel_id, b, 600);
    expect(done.result).toBe('won');
    expect(await ink(b)).toBe(1100);
    expect(await ink(a)).toBe(900);
    const mine = (await db.rpc(a, 'duels_lobby')).mine.find((d: any) => d.id === start.duel_id);
    expect(mine.result).toBe('lost');
    expect(mine.runs).toHaveLength(2);
  });

  it('a tie on score goes to the faster run; a dead heat refunds both', async () => {
    const s1 = await db.rpc(a, 'duel_create', { p_game: 'turfwars', p_stake: 50, p_idempotency_key: 'duel-create-a-2' });
    await db.sql('select private.backdate_runs()');
    await finish(s1.duel_id, a, 300, 15000);
    await db.rpc(c, 'duel_accept', { p_duel_id: s1.duel_id, p_idempotency_key: 'duel-accept-c-2' });
    await db.sql('select private.backdate_runs()');
    expect((await finish(s1.duel_id, c, 300, 18000)).result).toBe('lost');
    const s2 = await db.rpc(a, 'duel_create', { p_game: 'pixelrecall', p_stake: 40, p_idempotency_key: 'duel-create-a-3' });
    await db.sql('select private.backdate_runs()');
    await finish(s2.duel_id, a, 200, 15000);
    const before = await ink(b);
    await db.rpc(b, 'duel_accept', { p_duel_id: s2.duel_id, p_idempotency_key: 'duel-accept-b-3' });
    await db.sql('select private.backdate_runs()');
    expect((await finish(s2.duel_id, b, 200, 15000)).result).toBe('draw');
    expect(await ink(b)).toBe(before);
  });

  it('a run claiming more time than really passed is void; an unaccepted duel can be cancelled for a refund', async () => {
    const s = await db.rpc(a, 'duel_create', { p_game: 'paletteclash', p_stake: 30, p_idempotency_key: 'duel-create-a-4' });
    const r = await db.rpc(svc, 'svc_duel_finish', { p_duel_id: s.duel_id, p_player_id: a, p_result: { valid: true, score: 800, time_ms: 600000, summary: {} } });
    expect(r.valid).toBe(false);
    const before = await ink(a);
    await db.rpc(a, 'duel_cancel', { p_duel_id: s.duel_id });
    expect(await ink(a)).toBe(before + 30);
    await expectError(db.rpc(a, 'svc_duel_finish', { p_duel_id: s.duel_id, p_player_id: a, p_result: {} }), 'permission denied');
  });

  it('stakes must be within the limits and affordable', async () => {
    await expectError(db.rpc(a, 'duel_create', { p_game: 'turfwars', p_stake: 5, p_idempotency_key: 'duel-create-a-5' }), 'invalid_stake');
    await expectError(db.rpc(a, 'duel_create', { p_game: 'turfwars', p_stake: 100000, p_idempotency_key: 'duel-create-a-6' }), 'invalid_stake');
    const poor = await db.newPlayer('poor_dueler');
    await expectError(db.rpc(poor, 'duel_create', { p_game: 'turfwars', p_stake: 50, p_idempotency_key: 'duel-create-p-1' }), 'insufficient');
  });
});

describe('joystick refills with Ink', () => {
  it('costs Ink, fills the tank, and is limited per day', async () => {
    const p = await db.newPlayer('refiller');
    await db.giveInk(p, 500);
    await db.placeAt(p, 900000, 900000);
    await expectError(db.rpc(p, 'refill_joystick_with_ink', { p_idempotency_key: 'refill-full-1' }), 'tank_full');
    await db.sql(`update explorers set joy_seconds = 0, joy_day = now() + interval '1 day' where player_id = $1`, [p]);
    const r = await db.rpc(p, 'refill_joystick_with_ink', { p_idempotency_key: 'refill-ok-1' });
    expect(r.joystick.seconds_left).toBe(60);
    expect(await ink(p)).toBe(450);
    expect(r.joystick.ink_refills_left).toBe(2);
  });
});
