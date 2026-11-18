// Fair play: the Altar loop scanner (a cell laid on the altar again: bought back with the rarity it had, or passed round a
// clan), the risk signal, and taking it back: Luck they still hold (any amount, undoable), the plots that Luck rolled
// (down a tier or away), and a share of what those plots earned (undoable).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let lou: string, cam: string, hal: string, boss: string, eco: string, mod: string, nobody: string;
const SLC = { lng: -111.891, lat: 40.7608 };
let A: any, B: any;
const X = { gx: 3170001, gy: 6300001 }, Y = { gx: 3170003, gy: 6300003 }, Z = { gx: 3170005, gy: 6300005 };
/** a plot sacrifice as the altar wrote it before the fix: the release and its feed line, in the same moment */
const sacrificed = async (who: string, c: { gx: number; gy: number }, at: string, rarity = 'gemini', gained = 100) => {
  await db.sql(`insert into plot_ownership (gx, gy, player_id, method, cost, acquired_at, released_at, release_reason)
                values ($1, $2, $3, 'acquire', '{"ink": 100}', $4::timestamptz - interval '10 minutes', $4::timestamptz, 'sacrificed for luck')`, [c.gx, c.gy, who, at]);
  await db.sql(`insert into feed_events (kind, player_id, data, created_at) values ('luck', $1, jsonb_build_object('sub', 'sacrifice', 'what', 'plot', 'gained', $2::int, 'rarity', $3::text, 'shiny', false), $4::timestamptz)`,
    [who, gained, rarity, at]);
};

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10, basePlots: true });
  lou = await db.newPlayer('loop_lou'); cam = await db.newPlayer('clan_cam'); hal = await db.newPlayer('honest_hal');
  boss = await db.newPlayer('boss_bo'); eco = await db.newPlayer('eco_em'); mod = await db.newPlayer('mod_max'); nobody = await db.newPlayer('just_jay');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($2, 'economy'), ($3, 'moderator')`, [boss, eco, mod]);
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [lou]);
  await db.rpc(lou, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
  for (let i = 0; i < 2; i++) await db.rpc(lou, 'quick_buy_plot', { p_idempotency_key: `altar-loop-buy-${i}-xxxxxxxx` });
  [A, B] = await db.sql(`select gx, gy from world_plots where owner_id = $1 order by gx, gy limit 2`, [lou]);
  // the loop: Lou lays the same Gemini on the altar three times; Cam lays a cell Lou had sacrificed; Hal once, fairly
  await sacrificed(lou, X, '2026-11-17 10:00:00+00');
  await sacrificed(lou, Y, '2026-11-17 10:20:00+00', 'mythic', 60);
  await sacrificed(lou, X, '2026-11-17 11:00:00+00');
  await sacrificed(lou, X, '2026-11-17 12:00:00+00');
  await sacrificed(cam, Y, '2026-11-17 13:00:00+00', 'mythic', 60);
  await sacrificed(hal, Z, '2026-11-17 09:00:00+00', 'rare', 8);
  await db.sql(`insert into player_luck (player_id, luck, sacrificed) values ($1, 60, 4) on conflict (player_id) do update set luck = 60`, [lou]);
  // what the Luck bought: A an ultra right after a repeat; B rolled before the loop began
  await db.sql(`insert into luck_choices (player_id, gx, gy, options, shinies, best, created_at) values
    ($1, $2, $3, '["common", "epic", "solar"]', '[false, false, false]', 2, '2026-11-17 11:05:00+00'),
    ($1, $4, $5, '["rare", "mythic"]', '[false, false]', 1, '2026-11-17 09:30:00+00')`, [lou, A.gx, A.gy, B.gx, B.gy]);
  await db.sql(`update world_plots set rarity = 'solar' where gx = $1 and gy = $2`, [A.gx, A.gy]);
  await db.sql(`update world_plots set rarity = 'mythic' where gx = $1 and gy = $2`, [B.gx, B.gy]);
  // 500 Ink from a game played on A
  const [s] = await db.sql(`insert into minigame_sessions (player_id, game, level, seed, expires_at, gx, gy, status, started_at)
                            values ($1, 'tracecraft', 1, 1, now() + interval '1 hour', $2, $3, 'validated', now() - interval '30 minutes') returning id`, [lou, A.gx, A.gy]);
  await db.sql(`insert into minigame_rewards (session_id, player_id, ink, created_at) values ($1, $2, 500, now() - interval '30 minutes')`, [s.id, lou]);
  await db.sql(`update resource_balances set amount = 100 where player_id = $1 and resource = 'ink'`, [lou]);
});
afterAll(() => db.close());

describe('the altar loop scanner', () => {
  it('counts repeats of their own plots and of plots someone else sacrificed, and the Luck they gave', async () => {
    const [{ s }] = await db.sql(`select private.altar_loop_stats($1) s`, [lou]);
    expect(s).toMatchObject({ sacrificed: 4, repeats: 2, repeats_self: 2, repeats_other: 0, cells: 1, luck_from_repeats: 200, luck_from_plots: 360, peak_day: 2, luck_now: 60 });
    expect(new Date(s.first_at).toISOString()).toBe('2026-11-17T11:00:00.000Z');
    const [{ c }] = await db.sql(`select private.altar_loop_stats($1) c`, [cam]);
    expect(c).toMatchObject({ repeats: 1, repeats_self: 0, repeats_other: 1, luck_from_repeats: 60 });
    const [{ h }] = await db.sql(`select private.altar_loop_stats($1) h`, [hal]);
    expect(h).toMatchObject({ sacrificed: 1, repeats: 0, luck_from_repeats: 0 });
  });

  it('lists who repeated a cell, worst first, for staff only', async () => {
    await expectError(db.rpc(nobody, 'admin_altar_loop_scan', { p_min: 1 }), 'forbidden');
    const s = await db.rpc(mod, 'admin_altar_loop_scan', { p_min: 1 });
    expect(s.rows.map((r: any) => r.player.username)).toEqual(['loop_lou', 'clan_cam']);
    expect(s.rows[0]).toMatchObject({ stats: { repeats: 2 }, rolls: { n: 2, improved: 1, ultras: 1, open: 1, fixed: 0 } });
    expect((await db.rpc(mod, 'admin_altar_loop_scan', { p_min: 2 })).rows).toHaveLength(1);
  });

  it('flags two or more repeats in the risk scanner', async () => {
    const r = await db.rpc(mod, 'admin_integrity_player', { p_player: lou });
    expect(r.signals.find((x: any) => x.key === 'altar_loop')).toBeTruthy();
    const c = await db.rpc(mod, 'admin_integrity_player', { p_player: cam });
    expect(c.signals.find((x: any) => x.key === 'altar_loop')).toBeUndefined();
  });

  it('shows every sacrifice (and who laid the cell before), and which Luck plots came after a repeat', async () => {
    const d = await db.rpc(mod, 'admin_altar_loop_player', { p_player: lou });
    expect(d.sacrifices.map((x: any) => x.repeat)).toEqual([false, false, true, true]);
    expect(d.days).toEqual([{ day: '2026-11-17', repeats: 2, luck: 200 }]);
    const at = (p: any) => d.plots.find((x: any) => x.gx === p.gx && x.gy === p.gy);
    expect(at(A)).toMatchObject({ from_repeat: true, in_window: true, improved: true, ultra: true, own: 'common', rarity: 'solar' });
    expect(at(B)).toMatchObject({ from_repeat: false, in_window: false });
    expect(d.luck).toEqual({ now: 60, from_repeats: 200, taken: 0, can_take: 60 });
    const c = await db.rpc(mod, 'admin_altar_loop_player', { p_player: cam });
    expect(c.sacrifices[0]).toMatchObject({ repeat: true, after_self: false, after: { username: 'loop_lou' } });
  });
});

describe('taking it back', () => {
  it('takes back any amount of the Luck they still hold, up to what the repeats gave, and can give it back', async () => {
    await expectError(db.rpc(mod, 'admin_altar_loop_take_luck', { p_player: lou, p_amount: 10, p_reason: 'Altar loop' }), 'forbidden');
    await expectError(db.rpc(eco, 'admin_altar_loop_take_luck', { p_player: lou, p_amount: 10, p_reason: '' }), 'reason_required');
    const a = await db.rpc(eco, 'admin_altar_loop_take_luck', { p_player: lou, p_amount: 45, p_reason: 'Altar loop: part of it' });
    expect(a.taken).toBe(45);
    expect(a.luck).toEqual({ now: 15, from_repeats: 200, taken: 45, can_take: 15 });
    const b = await db.rpc(eco, 'admin_altar_loop_take_luck', { p_player: lou, p_amount: 100, p_reason: 'Altar loop: the rest' });
    expect(b.taken).toBe(15);
    await expectError(db.rpc(eco, 'admin_altar_loop_take_luck', { p_player: lou, p_amount: 1, p_reason: 'Altar loop: more' }), 'nothing_to_take');
    const u = await db.rpc(eco, 'admin_altar_loop_luck_undo', { p_id: b.luck_takes[0].id });
    expect(u.luck).toMatchObject({ now: 15, taken: 45 });
  });

  it('puts a Luck plot back to its own roll (undoable); taking one away needs a moderator too', async () => {
    await expectError(db.rpc(eco, 'admin_altar_loop_fix', { p_player: lou, p_plots: [{ ...A, action: 'take' }], p_reason: 'Altar loop' }), 'forbidden');
    const f = await db.rpc(eco, 'admin_altar_loop_fix', { p_player: lou, p_plots: [{ ...A, action: 'downgrade' }], p_reason: 'Altar loop: Luck from repeats' });
    expect(f.done).toBe(1);
    expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [A.gx, A.gy]))[0].rarity).toBe('common');
    const u = await db.rpc(eco, 'admin_altar_loop_undo', { p_fix: f.fixes[0].id });
    expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [A.gx, A.gy]))[0].rarity).toBe('solar');
    expect(u.fixes[0].undone_at).toBeTruthy();
  });

  it('takes back a share of what those plots earned, owes the rest, and can be undone', async () => {
    const p = await db.rpc(eco, 'admin_altar_loop_reverse', { p_player: lou, p_plots: [A], p_mode: 'all', p_share: 40, p_reason: '', p_preview: true });
    expect(p).toMatchObject({ share: 40, ink_games: 200, ink_balance: 100, ink_taken: 100 });
    expect(p.ink_target).toBeGreaterThanOrEqual(200);
    await expectError(db.rpc(eco, 'admin_altar_loop_reverse', { p_player: lou, p_plots: [A], p_mode: 'all', p_share: 40, p_reason: 'Altar loop', p_preview: false }), 'forbidden');
    await expectError(db.rpc(boss, 'admin_altar_loop_reverse', { p_player: lou, p_plots: [A], p_mode: 'all', p_share: 0, p_reason: 'Altar loop', p_preview: true }), 'invalid_input');
    const r = await db.rpc(boss, 'admin_altar_loop_reverse', { p_player: lou, p_plots: [A], p_mode: 'all', p_share: 40, p_reason: 'Altar loop: 40% of it', p_preview: false });
    expect(r.reversal).toMatchObject({ share: 40, ink_taken: 100 });
    const owed = Number((await db.sql(`select owed from private.ink_debts where player_id = $1`, [lou]))[0].owed);
    expect(owed).toBe(r.reversal.debt);
    expect(Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [lou]))[0].amount)).toBe(0);
    // undone: the 100 Ink comes back (not swallowed by the debt), and the debt it added goes
    const u = await db.rpc(eco, 'admin_altar_loop_reverse_undo', { p_id: r.reversals[0].id });
    expect(u.ink_returned).toBe(100);
    expect(Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [lou]))[0].amount)).toBe(100);
    expect(Number((await db.sql(`select coalesce((select owed from private.ink_debts where player_id = $1), 0) o`, [lou]))[0].o)).toBe(0);
  });

  it('writes every action to the audit log', async () => {
    const [{ n }] = await db.sql(`select count(*)::int n from audit_logs where action like 'altar_loop.%'`);
    expect(n).toBe(7); // luck ×2, luck_undo, downgrade, undo, reverse, reverse_undo
  });
});
