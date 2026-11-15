// Fair play: the egg loop scanner (Inkborn sacrificed beyond any a player could have had), the plots they rolled with the
// Luck it paid for, putting those back to a lower tier or taking them away (and undoing a downgrade), the integrity signal,
// and every player's ultras with their rent now and boosted 24/7.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let cheat: string, honest: string, boss: string, eco: string, mod: string, nobody: string;
const SLC = { lng: -111.891, lat: 40.7608 };
const FIX = '2026-11-14 20:42:52+00';
let A: any, B: any, C: any;
const sacrifice = (who: string, at: string, what = 'inkborn', gained = 12) =>
  db.sql(`insert into feed_events (kind, player_id, data, created_at) values ('luck', $1, jsonb_build_object('sub', 'sacrifice', 'what', $2::text, 'gained', $3::int, 'name', 'Blob'), $4::timestamptz)`, [who, what, gained, at]);
const plot = async (gx: number, gy: number) => (await db.sql(`select owner_id, rarity, shiny from world_plots where gx = $1 and gy = $2`, [gx, gy]))[0];

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10, basePlots: true });
  cheat = await db.newPlayer('loop_larry'); honest = await db.newPlayer('fair_fiona'); boss = await db.newPlayer('boss_bea');
  eco = await db.newPlayer('eco_ed'); mod = await db.newPlayer('mod_mo'); nobody = await db.newPlayer('just_jo');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($2, 'economy'), ($3, 'moderator')`, [boss, eco, mod]);
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [cheat]);
  await db.rpc(cheat, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
  await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
  for (let i = 0; i < 3; i++) await db.rpc(cheat, 'quick_buy_plot', { p_idempotency_key: `loop-buy-${i}-xxxxxxxx` });
  // A is the starter plot, B and C were bought
  [A, B, C] = await db.sql(`select w.gx, w.gy from world_plots w join plot_ownership o on o.gx = w.gx and o.gy = w.gy and o.player_id = w.owner_id and o.released_at is null
                             where w.owner_id = $1 order by (o.method = 'starter') desc, o.acquired_at, o.gx`, [cheat]);
  // one Inkborn made (the free one) and one egg; then the loop: twelve Inkborn sacrificed before the fix
  await db.sql(`insert into inkborn_keepers (owner_id, made) values ($1, 1) on conflict (owner_id) do update set made = 1`, [cheat]);
  await db.sql(`insert into inkborn (owner_id, client_key, name, source, genome, personality) values ($1, 'loop-keep-0001', 'Keeper', 'random', '{}', 'playful')`, [cheat]);
  await db.sql(`insert into inkborn_eggs (owner_id, kind, shell, genome, parents, hatch_at) values ($1, 'speckled', '{}', '{}', '[]', now())`, [cheat]);
  for (let i = 0; i < 12; i++) await sacrifice(cheat, `2026-11-14 18:${String(10 + i).padStart(2, '0')}:00+00`);
  await sacrifice(cheat, '2026-11-14 18:30:00+00', 'egg', 8);
  await db.sql(`insert into player_luck (player_id, luck, sacrificed) values ($1, 0, 13)`, [cheat]);
  // what the Luck bought: A an ultra (with a shine), B a mythic, and C rolled long before the loop
  await db.sql(`insert into luck_choices (player_id, gx, gy, options, shinies, best, created_at) values
    ($1, $2, $3, '["common", "legendary", "solar"]', '[false, false, true]', 2, '2026-11-14 19:00:00+00'),
    ($1, $4, $5, '["rare", "mythic"]', '[false, false]', 1, '2026-11-14 19:05:00+00'),
    ($1, $6, $7, '["common", "epic"]', '[false, false]', 1, '2026-11-01 10:00:00+00')`, [cheat, A.gx, A.gy, B.gx, B.gy, C.gx, C.gy]);
  await db.sql(`update world_plots set rarity = 'solar', shiny = true where gx = $1 and gy = $2`, [A.gx, A.gy]);
  await db.sql(`update world_plots set rarity = 'mythic', shiny = false where gx = $1 and gy = $2`, [B.gx, B.gy]);
  await db.sql(`update world_plots set rarity = 'epic', shiny = false where gx = $1 and gy = $2`, [C.gx, C.gy]);
  // a fair player: made two, sacrificed one
  await db.sql(`insert into inkborn_keepers (owner_id, made) values ($1, 2) on conflict (owner_id) do update set made = 2`, [honest]);
  await db.sql(`insert into inkborn (owner_id, client_key, name, source, genome, personality) values ($1, 'fair-keep-0001', 'Fern', 'random', '{}', 'playful')`, [honest]);
  await sacrifice(honest, '2026-11-14 17:00:00+00');
  await db.sql(`insert into player_luck (player_id, luck, sacrificed) values ($1, 12, 1)`, [honest]);
});
afterAll(() => db.close());

describe('the egg loop scanner', () => {
  it('counts the Inkborn sacrificed beyond what they could have had', async () => {
    const [{ s }] = await db.sql(`select private.egg_loop_stats($1) s`, [cheat]);
    expect(s).toMatchObject({ sacrificed: 12, made: 1, alive: 1, eggs: 1, after_fix: 0, could_have: 1, excess: 11, luck_from_inkborn: 144, luck_total: 152, peak_day: 12 });
    const [{ h }] = await db.sql(`select private.egg_loop_stats($1) h`, [honest]);
    expect(h).toMatchObject({ sacrificed: 1, excess: 0 });
  });

  it('lists who was caught, with the Luck-rolled plots still to deal with', async () => {
    await expectError(db.rpc(nobody, 'admin_egg_loop_scan', { p_min: 1 }), 'forbidden');
    const s = await db.rpc(mod, 'admin_egg_loop_scan', { p_min: 1 });
    expect(s.rows.map((r: any) => r.player.username)).toEqual(['loop_larry']);
    expect(s.rows[0]).toMatchObject({ stats: { excess: 11 }, rolls: { n: 3, improved: 2, ultras: 1, open: 2, fixed: 0 } });
  });

  it('flags them in the risk scanner', async () => {
    const r = await db.rpc(mod, 'admin_integrity_player', { p_player: cheat });
    expect(r.signals.find((x: any) => x.key === 'egg_loop')).toMatchObject({ severity: 'severe' });
    expect(r.level).toBe('severe');
    const f = await db.rpc(mod, 'admin_integrity_player', { p_player: honest });
    expect(f.signals.find((x: any) => x.key === 'egg_loop')).toBeUndefined();
  });

  it("shows each plot's rolls, the plot's own roll and whether it came after the loop began", async () => {
    const d = await db.rpc(mod, 'admin_egg_loop_player', { p_player: cheat });
    const at = (p: any) => d.plots.find((x: any) => x.gx === p.gx && x.gy === p.gy);
    expect(at(A)).toMatchObject({ own: 'common', kept_rarity: 'solar', improved: true, ultra: true, in_window: true, theirs: true, rarity: 'solar', shiny: true, own_shiny: false });
    expect(at(B)).toMatchObject({ own: 'rare', kept_rarity: 'mythic', improved: true, ultra: false, in_window: true });
    expect(at(C)).toMatchObject({ in_window: false });
    expect(d.days.find((x: any) => x.day === '2026-11-14')).toMatchObject({ inkborn: 12, luck: 144 });
    expect(d).toMatchObject({ can_fix: false, can_take: false });
    expect(d.tiers.map((t: any) => t.id)).not.toContain('crown');
  });

  it('puts plots back to their own roll or a chosen lower tier (economy staff)', async () => {
    await expectError(db.rpc(mod, 'admin_egg_loop_fix', { p_player: cheat, p_plots: [{ gx: A.gx, gy: A.gy, action: 'downgrade' }], p_reason: 'egg loop' }), 'forbidden');
    await expectError(db.rpc(eco, 'admin_egg_loop_fix', { p_player: cheat, p_plots: [{ gx: A.gx, gy: A.gy, action: 'downgrade' }], p_reason: '' }), 'reason_required');
    await expectError(db.rpc(eco, 'admin_egg_loop_fix', { p_player: cheat, p_plots: [{ gx: B.gx, gy: B.gy, action: 'take' }], p_reason: 'egg loop' }), 'forbidden');
    const r = await db.rpc(eco, 'admin_egg_loop_fix', { p_player: cheat, p_reason: 'Egg loop: Luck from duplicated Inkborn', p_plots: [
      { gx: A.gx, gy: A.gy, action: 'downgrade' }, { gx: B.gx, gy: B.gy, action: 'downgrade', rarity: 'epic' }, { gx: C.gx, gy: C.gy, action: 'downgrade', rarity: 'mythic' }] });
    expect(r.done).toBe(2);
    expect(r.results.find((x: any) => x.gx === C.gx && x.gy === C.gy)).toMatchObject({ ok: false, why: 'not_lower' });
    expect(await plot(A.gx, A.gy)).toMatchObject({ owner_id: cheat, rarity: 'common', shiny: false });
    expect(await plot(B.gx, B.gy)).toMatchObject({ rarity: 'epic' });
    expect(r.fixes).toHaveLength(2);
    expect(r.plots.find((x: any) => x.gx === A.gx && x.gy === A.gy).fix).toMatchObject({ action: 'downgrade', from: 'solar', to: 'common' });
    // the old roll can't be picked back
    await expectError(db.rpc(cheat, 'luck_pick', { p_gx: A.gx, p_gy: A.gy, p_idx: 2 }), 'nothing_to_pick');
    const s = await db.rpc(mod, 'admin_egg_loop_scan', { p_min: 1 });
    expect(s.rows[0].rolls).toMatchObject({ open: 0, fixed: 2 });
    const audit = await db.sql(`select action from audit_logs where action like 'egg_loop.%' order by id`);
    expect(audit.map((x: any) => x.action)).toEqual(['egg_loop.downgrade', 'egg_loop.downgrade']);
  });

  it('a downgrade can be undone; taking a plot away cannot', async () => {
    const d = await db.rpc(mod, 'admin_egg_loop_player', { p_player: cheat });
    const fa = d.fixes.find((f: any) => f.gx === A.gx && f.gy === A.gy);
    const u = await db.rpc(eco, 'admin_egg_loop_undo', { p_fix: fa.id });
    expect(await plot(A.gx, A.gy)).toMatchObject({ rarity: 'solar', shiny: true });
    expect(u.fixes.find((f: any) => f.id === fa.id).undone_at).not.toBeNull();
    await expectError(db.rpc(eco, 'admin_egg_loop_undo', { p_fix: fa.id }), 'not_found');
    // the owner takes B away: it goes back to the world
    const t = await db.rpc(boss, 'admin_egg_loop_fix', { p_player: cheat, p_plots: [{ gx: B.gx, gy: B.gy, action: 'take' }], p_reason: 'Egg loop: Luck from duplicated Inkborn' });
    expect(t.done).toBe(1);
    expect((await plot(B.gx, B.gy)).owner_id).toBeNull();
    const ft = t.fixes.find((f: any) => f.action === 'take');
    await expectError(db.rpc(boss, 'admin_egg_loop_undo', { p_fix: ft.id }), 'cannot_undo');
    // not theirs any more
    const again = await db.rpc(boss, 'admin_egg_loop_fix', { p_player: cheat, p_plots: [{ gx: B.gx, gy: B.gy, action: 'downgrade' }], p_reason: 'again please' });
    expect(again.results[0]).toMatchObject({ ok: false, why: 'not_theirs' });
  });
});

describe('ultras and rent', () => {
  it("a player's ultras, and their rent now, with free boosts, and boosted 24/7", async () => {
    await expectError(db.rpc(nobody, 'admin_player_ultras', { p_player: cheat }), 'forbidden');
    const u = await db.rpc(mod, 'admin_player_ultras', { p_player: cheat });
    expect(u).toMatchObject({ plots: 2, ultras: 1, crowns: 0, shiny_ultras: 1, boost_mult: 20, free_boost_seconds: 10800 });
    expect(u.by_rarity).toEqual([{ rarity: 'solar', n: 1, shiny: 1 }]);
    expect(u.list).toHaveLength(1);
    expect(u.list[0]).toMatchObject({ rarity: 'solar', shiny: true, luck: true });
    const rate = Number(u.rate), extras = Number(u.extras_day);
    expect(rate).toBeGreaterThan(0);
    expect(Number(u.day)).toBeCloseTo(rate * 86400 + extras, 12);
    expect(Number(u.day_boosted)).toBeCloseTo(rate * 20 * 86400 + extras, 12);
    expect(Number(u.day_free_boosts)).toBeCloseTo(rate * (86400 + 19 * 10800) + extras, 12);
    expect(Number(u.ultra_rate)).toBeGreaterThan(0);
    expect(u.egg_loop).toMatchObject({ excess: 11 });
  });

  it('everyone with ultras, ranked, with the egg loop marked', async () => {
    await expectError(db.rpc(nobody, 'admin_ultra_scan', {}), 'forbidden');
    await expectError(db.rpc(mod, 'admin_ultra_scan', { p_sort: 'nope' }), 'invalid_input');
    // a second player with two ultras
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [honest]);
    await db.rpc(honest, 'report_position', { p_lng: SLC.lng, p_lat: SLC.lat, p_accuracy_m: 10 });
    for (let i = 0; i < 2; i++) await db.rpc(honest, 'quick_buy_plot', { p_idempotency_key: `fair-buy-${i}-xxxxxxxx` });
    await db.sql(`update world_plots set rarity = 'comet' where owner_id = $1`, [honest]);
    const s = await db.rpc(mod, 'admin_ultra_scan', { p_sort: 'ultras' });
    expect(s.rows.map((r: any) => r.player.username)).toEqual(['fair_fiona', 'loop_larry']);
    expect(s.rows[0]).toMatchObject({ ultras: 2, plots: 2, egg_loop: 0, by_rarity: [{ rarity: 'comet', n: 2 }] });
    expect(s.rows[1]).toMatchObject({ ultras: 1, egg_loop: 11 });
    expect(Number(s.rows[0].day_boosted)).toBeCloseTo(Number(s.rows[0].rate) * 20 * 86400, 12);
    expect(s.totals).toMatchObject({ players: 2, ultras: 3 });
    expect((await db.rpc(mod, 'admin_ultra_scan', { p_q: 'larry' })).rows).toHaveLength(1);
    expect((await db.rpc(mod, 'admin_ultra_scan', { p_min: 2 })).rows).toHaveLength(1);
  });
});

describe('reversing what the Luck plots earned', () => {
  const inkOf = async (who: string) => Number((await db.sql(`select coalesce((select amount from resource_balances where player_id = $1 and resource = 'ink'), 0) n`, [who]))[0].n);
  const game = async (gx: number, gy: number, ink: number, at: string) => {
    const [s] = await db.sql(`insert into minigame_sessions (player_id, game, level, seed, expires_at, gx, gy, status, started_at) values ($1, 'tracecraft', 1, 1, now() + interval '1 hour', $2, $3, 'validated', $4::timestamptz) returning id`, [cheat, gx, gy, at]);
    await db.sql(`insert into minigame_rewards (session_id, player_id, ink, created_at) values ($1, $2, $3, $4::timestamptz)`, [s.id, cheat, ink, at]);
  };
  beforeAll(async () => {
    await game(A.gx, A.gy, 500, new Date(Date.now() - 5 * 60_000).toISOString()); // on the ultra, after its Luck roll
    await game(A.gx, A.gy, 999, '2026-11-14 18:00:00+00'); // before the roll: not part of it
    await game(C.gx, C.gy, 777, new Date(Date.now() - 4 * 60_000).toISOString()); // another plot, not picked
    await db.sql(`insert into rent_accounts (player_id, balance_usd, settled_at) values ($1, 1000, now()) on conflict (player_id) do update set balance_usd = 1000, settled_at = now()`, [cheat]);
    await db.sql(`update resource_balances set amount = 200 where player_id = $1 and resource = 'ink'`, [cheat]);
    // C was bought with Ink since the loop began
    await db.sql(`alter table plot_ownership disable trigger plot_ownership_immutable`);
    await db.sql(`update plot_ownership set cost = '{"ink": 250}' where player_id = $1 and gx = $2 and gy = $3 and released_at is null`, [cheat, C.gx, C.gy]);
    await db.sql(`alter table plot_ownership enable trigger plot_ownership_immutable`);
  });

  it('works out the Ink from games on those plots, their USD rent, and what it was spent on', async () => {
    await expectError(db.rpc(mod, 'admin_egg_loop_reverse', { p_player: cheat, p_plots: [{ gx: A.gx, gy: A.gy }], p_mode: 'all', p_reason: 'x', p_preview: true }), 'forbidden');
    const p = await db.rpc(eco, 'admin_egg_loop_reverse', { p_player: cheat, p_plots: [{ gx: A.gx, gy: A.gy }], p_mode: 'all', p_reason: '', p_preview: true });
    expect(p.earnings.ink_games).toBe(500);
    expect(Number(p.usd)).toBeGreaterThan(0);
    expect(Number(p.usd_taken)).toBeCloseTo(Number(p.usd), 12);
    expect(p).toMatchObject({ usd_as_ink: 0, ink_target: 500, ink_balance: 200, ink_taken: 200, plots_ink: 250, debt: 50 });
    expect(p.plots.map((x: any) => [x.gx, x.gy])).toEqual([[C.gx, C.gy]]);
    // only what the ultra added over the plot's own roll
    const x = await db.rpc(eco, 'admin_egg_loop_reverse', { p_player: cheat, p_plots: [{ gx: A.gx, gy: A.gy }], p_mode: 'extra', p_reason: '', p_preview: true });
    expect(x.earnings.ink_games).toBeGreaterThan(0);
    expect(x.earnings.ink_games).toBeLessThan(500);
    expect(Number(x.usd)).toBeLessThan(Number(p.usd));
    expect(await inkOf(cheat)).toBe(200); // a preview changes nothing
  });

  it('takes it back: USD, Ink, the plots it bought, and the rest is owed from what they earn next', async () => {
    await expectError(db.rpc(eco, 'admin_egg_loop_reverse', { p_player: cheat, p_plots: [{ gx: A.gx, gy: A.gy }], p_mode: 'all', p_reason: 'Egg loop earnings' }), 'forbidden');
    await expectError(db.rpc(boss, 'admin_egg_loop_reverse', { p_player: cheat, p_plots: [{ gx: A.gx, gy: A.gy }], p_mode: 'all', p_reason: '' }), 'reason_required');
    const usd0 = Number((await db.sql(`select balance_usd from rent_accounts where player_id = $1`, [cheat]))[0].balance_usd);
    const r = await db.rpc(boss, 'admin_egg_loop_reverse', { p_player: cheat, p_plots: [{ gx: A.gx, gy: A.gy }], p_mode: 'all', p_reason: 'Egg loop earnings' });
    expect(r.reversal).toMatchObject({ ink_taken: 200, plots_ink: 250, debt: 50 });
    expect(await inkOf(cheat)).toBe(0);
    expect(r.owed).toBe(50);
    const c = await plot(C.gx, C.gy);
    expect(c.owner_id).toBeNull();
    // its Luck rarity went with it: back to the cell's own roll (which, 14% of the time, happens to be an Epic too)
    const nat = (await db.sql(`select private.plot_rarity_for($1, $2) r`, [C.gx, C.gy]))[0].r;
    expect(c.rarity).toBe(nat.startsWith('crown') ? 'common' : nat);
    const usd1 = Number((await db.sql(`select balance_usd from rent_accounts where player_id = $1`, [cheat]))[0].balance_usd);
    expect(usd1).toBeLessThan(usd0);
    expect(r.reversals).toHaveLength(1);
    // the next Ink they earn pays what's owed first
    await db.sql(`select private.ledger_apply($1, 'ink', 80, 'minigame', 'test', 'test', 'egg-debt-test-1')`, [cheat]);
    expect(await inkOf(cheat)).toBe(30);
    expect(Number((await db.sql(`select owed from private.ink_debts where player_id = $1`, [cheat]))[0].owed)).toBe(0);
    const repay = await db.sql(`select delta from resource_ledger where player_id = $1 and reason = 'debt_repay'`, [cheat]);
    expect(repay.map((x: any) => Number(x.delta))).toEqual([-50]);
    // once paid, earning is back to normal
    await db.sql(`select private.ledger_apply($1, 'ink', 10, 'minigame', 'test', 'test', 'egg-debt-test-2')`, [cheat]);
    expect(await inkOf(cheat)).toBe(40);
    expect((await db.sql(`select action from audit_logs where action = 'egg_loop.reverse'`))).toHaveLength(1);
  });

  it('can be undone: the Ink, the USD and the cost of the plots come back', async () => {
    const d = await db.rpc(mod, 'admin_egg_loop_player', { p_player: cheat });
    const u = await db.rpc(eco, 'admin_egg_loop_reverse_undo', { p_id: d.reversals[0].id });
    expect(u.ink_returned).toBe(200 + 250 + 50);
    expect(await inkOf(cheat)).toBe(540);
    expect(u.owed).toBe(0);
    await expectError(db.rpc(eco, 'admin_egg_loop_reverse_undo', { p_id: d.reversals[0].id }), 'not_found');
  });
});
