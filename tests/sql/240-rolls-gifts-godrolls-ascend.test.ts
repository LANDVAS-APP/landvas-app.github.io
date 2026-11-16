// Staff gifts (tickets of any kind, enchantments on the next rolls, Godrolls lined up), a player's own Ink mode,
// ⚡ Godrolls and ⬆️ Ascend.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, eve: string, ian: string, asa: string;
const O = { gx: 3_340_000, gy: 2_240_000 };
let k = 0;
const claim = (uid: string, x: number, y = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + y, p_idempotency_key: `rg-${++k}-00000000` });
const ink = async (u: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [u]))[0].amount);
const ULTRAS = async () => (await db.sql(`select id from plot_rarities where tier = 'ultra' and ppm > 0`)).map((r: any) => r.id);

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('gift_owner'); eve = await db.newPlayer('gift_eve'); ian = await db.newPlayer('ink_ian'); asa = await db.newPlayer('ascend_asa');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [eve, ian, asa]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 1_000_000); }
  // no surprise Godrolls in tests that check exact rolls
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'godrolls'`);
});
afterAll(() => db.close());

describe('a player’s own Ink mode', () => {
  it('only staff can set it', async () => {
    await expectError(db.rpc(ian, 'admin_set_player_ink_mode', { p_player: ian, p_mode: 'off' }), 'forbidden');
    await expectError(db.rpc(owner, 'admin_set_player_ink_mode', { p_player: ian, p_mode: 'sideways' }), 'invalid_mode');
  });
  it('off: earned Ink is held back (counted), bought or staff Ink still arrives; back to default pays again', async () => {
    const m = await db.rpc(owner, 'admin_set_player_ink_mode', { p_player: ian, p_mode: 'off', p_note: 'farming bot' });
    expect(m.mode).toBe('off');
    const before = await ink(ian);
    await db.sql(`select private.grant($1, '{"ink": 50}'::jsonb, 'wheel', 'wheel', 'x', 'ink-mode-1')`, [ian]);
    await db.sql(`select private.ledger_apply($1, 'ink', 40, 'arcade', 'arcade', 'y', 'ink-mode-2')`, [ian]);
    expect(await ink(ian)).toBe(before);
    await db.sql(`select private.ledger_apply($1, 'ink', 25, 'admin_adjust', 'admin', 'z', 'ink-mode-3')`, [ian]);
    expect(await ink(ian)).toBe(before + 25);
    const v = await db.rpc(owner, 'admin_player_ink_mode', { p_player: ian });
    expect(v.held).toBe(90); expect(v.held_n).toBe(2);
    expect((await db.rpc(owner, 'admin_ink_modes')).map((x: any) => x.player.id)).toContain(ian);
    await db.rpc(owner, 'admin_set_player_ink_mode', { p_player: ian, p_mode: 'default' });
    await db.sql(`select private.grant($1, '{"ink": 50}'::jsonb, 'wheel', 'wheel', 'x', 'ink-mode-4')`, [ian]);
    expect(await ink(ian)).toBe(before + 75);
    const audit = await db.sql(`select details from audit_logs where action = 'ink.player_mode' and target_id = $1 order by id`, [ian]);
    expect(audit.map((a: any) => a.details.to)).toEqual(['off', 'default']);
  });
  it('dynamic and classic override Ink Flow for that player only', async () => {
    await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'ink_pacing'`);
    await db.rpc(owner, 'admin_set_player_ink_mode', { p_player: ian, p_mode: 'dynamic' });
    await db.sql(`select private.ink_pace($1, 30, 'minigame')`, [ian]);
    expect((await db.sql(`select count(*)::int n from private.ink_pacing where player_id = $1`, [ian]))[0].n).toBe(1);
    expect((await db.sql(`select count(*)::int n from private.ink_pacing where player_id = $1`, [eve]))[0].n).toBe(0);
    await db.sql(`update game_config set value = value || '{"enabled": true}' where key = 'ink_pacing'`);
    await db.rpc(owner, 'admin_set_player_ink_mode', { p_player: ian, p_mode: 'classic' });
    expect((await db.sql(`select private.ink_pace($1, 30, 'minigame') v`, [ian]))[0].v).toBe(30);
    await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'ink_pacing'`);
    await db.rpc(owner, 'admin_set_player_ink_mode', { p_player: ian, p_mode: 'default' });
  });
});

describe('tickets of every kind', () => {
  it('only the owner gives them; Crowns and bad values are refused', async () => {
    await expectError(db.rpc(eve, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'mythic' } }), 'forbidden');
    await expectError(db.rpc(owner, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'crown' } }), 'invalid_rarity');
    await expectError(db.rpc(owner, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'rare', rerolls: 9 } }), 'invalid_amount');
    await expectError(db.rpc(owner, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'enchanted', enchant: { kind: 'nope' } } }), 'invalid_kind');
  });
  it('an exact ultra ticket, shiny, in a chosen minigame — the player sees it and the roll is exactly that', async () => {
    await db.rpc(owner, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'kraken', plot_type: 'glass', shiny: true, label: 'Winter prize' } });
    const mine = await db.rpc(eve, 'my_roll_tickets');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ min_rarity: 'kraken', exact: true, shiny: true, plot_type: 'glass', label: 'Winter prize' });
    expect((await db.rpc(eve, 'daily_status')).tickets.map((t: any) => t.id)).toContain(mine[0].id);
    const r = await db.rpc(eve, 'quick_buy_plot', { p_idempotency_key: 'qb-ultra-0001', p_ticket: mine[0].id });
    expect(r.rarity).toBe('kraken'); expect(r.shiny).toBe(true); expect(r.plot_type).toBe('glass');
    expect(await db.rpc(eve, 'my_roll_tickets')).toHaveLength(0);
    const alerts = await db.sql(`select data from player_notifications where player_id = $1 and kind = 'power'`, [eve]);
    expect(alerts.some((a: any) => a.data.sub === 'ticket' && a.data.rarity === 'kraken')).toBe(true);
  });
  it('"or better" stays "or better" even with extras; free rerolls come on top with no Luck spent', async () => {
    await db.rpc(owner, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'rare', shiny: true, rerolls: 3 } });
    const t = (await db.rpc(eve, 'my_roll_tickets'))[0];
    expect(t.exact).toBe(false);
    const luck0 = (await db.sql(`select coalesce((select luck from player_luck where player_id = $1), 0) l`, [eve]))[0].l;
    const r = await db.rpc(eve, 'quick_buy_plot', { p_idempotency_key: 'qb-rare-00001', p_ticket: t.id });
    expect(r.choices).toHaveLength(4);
    const rank = async (x: string) => Number((await db.sql(`select private.plot_rarity_rank($1) v`, [x]))[0].v);
    expect(await rank(r.choices[0])).toBeGreaterThanOrEqual(await rank('rare'));
    expect(r.choice_shiny[0]).toBe(true);
    expect((await db.sql(`select coalesce((select luck from player_luck where player_id = $1), 0) l`, [eve]))[0].l).toBe(luck0);
  });
  it('an enchantment ticket is born with its recipe', async () => {
    await db.rpc(owner, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'enchanted', enchant: { kind: 'genie', stars: 2, level: 5, nickname: 'Djinni' } } });
    const t = (await db.rpc(eve, 'my_roll_tickets'))[0];
    const r = await db.rpc(eve, 'quick_buy_plot', { p_idempotency_key: 'qb-ench-00001', p_ticket: t.id });
    expect(r.rarity).toBe('enchanted');
    const e = (await db.sql(`select kind, stars, level, nickname, xp from enchantments where gx = $1 and gy = $2`, [r.gx, r.gy]))[0];
    expect(e).toMatchObject({ kind: 'genie', stars: 2, level: 5, nickname: 'Djinni' });
    expect(e.xp).toBeGreaterThanOrEqual(64);
  });
  it('cancelled tickets can’t be used', async () => {
    const list = await db.rpc(owner, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'epic' } });
    const open = list.find((x: any) => !x.used_at && !x.cancelled_at);
    await db.rpc(owner, 'admin_cancel_ticket', { p_id: open.id });
    await expectError(db.rpc(eve, 'quick_buy_plot', { p_idempotency_key: 'qb-cancel-001', p_ticket: open.id }), 'ticket_not_found');
  });
});

describe('enchantments on the next rolls', () => {
  it('her next claim is an Enchanted Golden Goose with 3 stars', async () => {
    await db.rpc(owner, 'admin_grant_enchant_roll', { p_player: eve, p_spec: { kind: 'goose', stars: 3, level: 2 }, p_mode: 'claim', p_after: 1 });
    const r = await claim(eve, 100);
    expect(r.rarity).toBe('enchanted');
    expect(r.enchant?.kind ?? r.enchant?.k).toBeTruthy();
    const e = (await db.sql(`select kind, stars, level from enchantments where gx = $1 and gy = $2`, [r.gx, r.gy]))[0];
    expect(e).toMatchObject({ kind: 'goose', stars: 3, level: 2 });
  });
  it('on a chosen roll of her Luck rerolls; keeping it births it, leaving it lets it go', async () => {
    await db.rpc(owner, 'admin_grant_enchant_roll', { p_player: eve, p_spec: { kind: 'oracle', nickname: 'Pythia' }, p_mode: 'luck', p_slot: 2 });
    await db.sql(`insert into player_luck (player_id, luck, armed) values ($1, 100, 2) on conflict (player_id) do update set luck = 100, armed = 2`, [eve]);
    const r = await claim(eve, 110);
    expect(r.choices[1]).toBe('enchanted');
    expect(r.choice_enchants[1].kind).toBe('oracle');
    const ultraFirst = ['solar', 'lunar'].includes(r.choices[0]) || ['solar', 'lunar'].includes(r.choices[2]);
    const p = await db.rpc(eve, 'luck_pick', { p_gx: r.gx, p_gy: r.gy, p_idx: 1 });
    expect(p.rarity).toBe('enchanted');
    const e = (await db.sql(`select kind, nickname, status from enchantments where gx = $1 and gy = $2`, [r.gx, r.gy]))[0];
    expect(e).toMatchObject({ kind: 'oracle', nickname: 'Pythia', status: 'active' });
    void ultraFirst;
  });
});

describe('⚡ Godrolls', () => {
  it('Echo: every roll the same ultra, each in a different minigame; staff can line one up', async () => {
    await expectError(db.rpc(eve, 'admin_grant_godroll', { p_player: eve, p_kind: 'echo' }), 'forbidden');
    await db.rpc(owner, 'admin_grant_godroll', { p_player: eve, p_kind: 'echo', p_rolls: 5 });
    const r = await claim(eve, 200);
    expect(r.godroll).toBe('echo');
    expect(r.choices).toHaveLength(5);
    expect(new Set(r.choices).size).toBe(1);
    expect(await ULTRAS()).toContain(r.choices[0]);
    expect(new Set(r.choice_types).size).toBe(5);
    expect(r.rarity).toBe(r.choices[0]);
    const feed = await db.sql(`select data from feed_events where player_id = $1 and kind = 'luck' and data->>'sub' = 'godroll'`, [eve]);
    expect(feed.length).toBe(1);
  });
  it('Pantheon: a different ultra on every roll, the rarest kept until she picks', async () => {
    await db.rpc(owner, 'admin_grant_godroll', { p_player: eve, p_kind: 'pantheon', p_rolls: 7 });
    const r = await claim(eve, 210);
    expect(r.godroll).toBe('pantheon');
    expect(r.choices).toHaveLength(7);
    expect(new Set(r.choices).size).toBe(7);
    const u = await ULTRAS();
    expect(r.choices.every((c: string) => u.includes(c))).toBe(true);
    await db.rpc(eve, 'luck_pick', { p_gx: r.gx, p_gy: r.gy, p_idx: 4 });
    expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [r.gx, r.gy]))[0].rarity).toBe(r.choices[4]);
  });
  it('a Godroll ticket', async () => {
    await db.rpc(owner, 'admin_grant_ticket', { p_player: eve, p_spec: { rarity: 'common', godroll: 'pantheon' } });
    const t = (await db.rpc(eve, 'my_roll_tickets'))[0];
    const r = await db.rpc(eve, 'quick_buy_plot', { p_idempotency_key: 'qb-god-000001', p_ticket: t.id });
    expect(r.godroll).toBe('pantheon');
    expect(r.choices.length).toBeGreaterThanOrEqual(2);
  });
  it('the odds: on with "one in 1", every claim is one', async () => {
    await db.rpc(owner, 'admin_set_roll_settings', { p_key: 'godrolls', p_value: { enabled: true, echo_one_in: 1, pantheon_one_in: 1000000000, rolls_min: 3, rolls_max: 3 } });
    const r = await claim(eve, 220);
    expect(r.godroll).toBe('echo'); expect(r.choices).toHaveLength(3);
    await db.rpc(owner, 'admin_set_roll_settings', { p_key: 'godrolls', p_value: { enabled: false, echo_one_in: 400000 } });
    expect((await claim(eve, 221)).godroll ?? null).toBeNull();
  });
  it('settings are checked and audited', async () => {
    await expectError(db.rpc(eve, 'admin_set_roll_settings', { p_key: 'godrolls', p_value: { enabled: true } }), 'forbidden');
    await expectError(db.rpc(owner, 'admin_set_roll_settings', { p_key: 'godrolls', p_value: { rolls_max: 12 } }), 'invalid_value');
    await expectError(db.rpc(owner, 'admin_set_roll_settings', { p_key: 'godrolls', p_value: { pool: 'everything' } }), 'invalid_value');
    await expectError(db.rpc(owner, 'admin_set_roll_settings', { p_key: 'ascend', p_value: { max_rarity: 'solar' } }), 'invalid_value');
    const s = await db.rpc(owner, 'admin_roll_settings');
    expect(s.godroll_stats.total).toBeGreaterThanOrEqual(4);
    expect(s.pool.length).toBeGreaterThan(5);
    expect((await db.sql(`select count(*)::int n from audit_logs where action = 'rolls.settings'`))[0].n).toBeGreaterThanOrEqual(2);
  });
});

describe('⬆️ Ascend', () => {
  let cell: { gx: number; gy: number };
  it('quotes a fresh plot, then each try costs more — and the rarity never goes down', async () => {
    await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
    const r = await claim(asa, 300, 40);
    cell = { gx: r.gx, gy: r.gy };
    await db.sql(`update world_plots set rarity = 'common' where gx = $1 and gy = $2`, [cell.gx, cell.gy]);
    const q = await db.rpc(asa, 'ascend_quote', { p_gx: cell.gx, p_gy: cell.gy });
    expect(q.ok).toBe(true); expect(q.cost).toBe(100); expect(q.tries).toBe(0);
    expect(q.odds.map((o: any) => o.rarity)).toEqual(['uncommon', 'rare', 'epic', 'legendary', 'mythic']);
    const rank = async (x: string) => Number((await db.sql(`select private.plot_rarity_rank($1) v`, [x]))[0].v);
    let last = 'common', costs: number[] = [];
    const before = await ink(asa);
    for (let i = 0; i < 4; i++) {
      const a = await db.rpc(asa, 'ascend_roll', { p_gx: cell.gx, p_gy: cell.gy, p_idempotency_key: `asc-${i}-0000000` });
      costs.push(a.cost);
      expect(await rank(a.to)).toBeGreaterThanOrEqual(await rank(last));
      last = a.to;
      if (!a.quote.ok) break;
    }
    expect(costs[1]).toBeGreaterThan(costs[0]);
    expect(await ink(asa)).toBe(before - costs.reduce((s, c) => s + c, 0));
    expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [cell.gx, cell.gy]))[0].rarity).toBe(last);
  });
  it('a replayed key never charges twice', async () => {
    await db.sql(`update world_plots set rarity = 'common' where gx = $1 and gy = $2`, [cell.gx, cell.gy]);
    const a = await db.rpc(asa, 'ascend_roll', { p_gx: cell.gx, p_gy: cell.gy, p_idempotency_key: 'asc-same-000000' });
    const before = await ink(asa);
    const b = await db.rpc(asa, 'ascend_roll', { p_gx: cell.gx, p_gy: cell.gy, p_idempotency_key: 'asc-same-000000' });
    expect(b.replayed).toBe(true); expect(b.to).toBe(a.to);
    expect(await ink(asa)).toBe(before);
  });
  it('refused: someone else’s plot, the top of the ladder, an old plot, switched off', async () => {
    await expectError(db.rpc(eve, 'ascend_roll', { p_gx: cell.gx, p_gy: cell.gy }), 'ascend_not_owned');
    await db.sql(`update world_plots set rarity = 'mythic' where gx = $1 and gy = $2`, [cell.gx, cell.gy]);
    await expectError(db.rpc(asa, 'ascend_roll', { p_gx: cell.gx, p_gy: cell.gy }), 'ascend_top');
    await db.sql(`update world_plots set rarity = 'rare', claimed_at = now() - interval '3 days' where gx = $1 and gy = $2`, [cell.gx, cell.gy]);
    await expectError(db.rpc(asa, 'ascend_roll', { p_gx: cell.gx, p_gy: cell.gy }), 'ascend_too_old');
    await db.rpc(owner, 'admin_set_roll_settings', { p_key: 'ascend', p_value: { window_hours: 0 } });
    expect((await db.rpc(asa, 'ascend_quote', { p_gx: cell.gx, p_gy: cell.gy })).ok).toBe(true);
    await db.rpc(owner, 'admin_set_roll_settings', { p_key: 'ascend', p_value: { enabled: false } });
    await expectError(db.rpc(asa, 'ascend_roll', { p_gx: cell.gx, p_gy: cell.gy }), 'ascend_disabled');
    await db.rpc(owner, 'admin_set_roll_settings', { p_key: 'ascend', p_value: { enabled: true, window_hours: 24 } });
  });
  it('pity: with a huge nudge, the next try always climbs', async () => {
    await db.sql(`update world_plots set rarity = 'epic', claimed_at = now() where gx = $1 and gy = $2`, [cell.gx, cell.gy]);
    await db.rpc(owner, 'admin_set_roll_settings', { p_key: 'ascend', p_value: { pity: 100000 } });
    await db.sql(`update plot_ascents set tries = 1, claimed_at = (select claimed_at from world_plots where gx = $1 and gy = $2) where gx = $1 and gy = $2`, [cell.gx, cell.gy]);
    const a = await db.rpc(asa, 'ascend_roll', { p_gx: cell.gx, p_gy: cell.gy, p_idempotency_key: 'asc-pity-000000' });
    expect(a.up).toBe(true); expect(['legendary', 'mythic']).toContain(a.to);
    await db.rpc(owner, 'admin_set_roll_settings', { p_key: 'ascend', p_value: { pity: 0.12 } });
  });
});
