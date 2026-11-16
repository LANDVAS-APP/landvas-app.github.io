// Earning switches: stop any way of earning live, without an error anywhere — that part just pays 0.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ad: string, pl: string, arcId: string;
const A = { gx: 3_330_000, gy: 2_030_000 };
const ink = async (u: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [u]))[0].amount);
const tickets = async (u: string) => Number((await db.sql(`select tickets from arcade_players where player_id = $1`, [u]))[0]?.tickets ?? 0);
const sw = (key: string, off: boolean, note: string | null = null) => db.rpc(ad, 'admin_earn_switch', { p_key: key, p_off: off, p_note: note });
const play = async (u: string, game: string, score: number, secs = 60) => {
  const s = await db.rpc(u, 'arcade_start', { p_arcade: arcId, p_game: game });
  await db.sql(`update arcade_plays set started_at = now() - make_interval(secs => $2) where id = $1`, [s.session, secs]);
  return db.rpc(u, 'arcade_finish', { p_session: s.session, p_score: score });
};

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  ad = await db.newPlayer('sw_admin'); pl = await db.newPlayer('sw_player');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [ad]);
  await db.rpc(pl, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const g = (await db.rpc(pl, 'my_groups'))[0];
  arcId = (await db.rpc(pl, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' })).arcade_id;
});
afterAll(() => db.close());

describe('Earning switches', () => {
  it('only staff can see or flip them', async () => {
    await expectError(db.rpc(pl, 'admin_earn_switches'), 'forbidden');
    await expectError(db.rpc(pl, 'admin_earn_switch', { p_key: 'all', p_off: true }), 'forbidden');
    const d = await db.rpc(ad, 'admin_earn_switches');
    expect(d.off).toEqual([]);
    expect(d.arcade_games.map((g: any) => g.id)).toContain('stacker');
    expect(d.enchantments.map((e: any) => e.id)).toContain('goose');
    expect(d.minigames.length).toBeGreaterThan(0);
    await expectError(sw('Bad Key!', true), 'invalid_key');
  });

  it('a cabinet switched off still plays, but wins no tickets and no Ink; switched back on it pays again', async () => {
    const r0 = await play(pl, 'stacker', 400);
    expect(r0.tickets).toBeGreaterThan(0);
    const d = await sw('arcade.game:stacker', true, 'testing');
    expect(d.off.map((o: any) => o.key)).toEqual(['arcade.game:stacker']);
    expect(d.off[0].note).toBe('testing');
    const t0 = await tickets(pl), i0 = await ink(pl);
    const r1 = await play(pl, 'stacker', 400);
    expect(r1).toMatchObject({ score: 400, tickets: 0, paid: 0 }); // the game ran normally
    expect(await tickets(pl)).toBe(t0);
    expect(await ink(pl)).toBe(i0);
    // the other cabinets carry on
    expect((await play(pl, 'cyclone', 900)).tickets).toBeGreaterThan(0);
    const held = (await db.rpc(ad, 'admin_earn_switches')).held;
    expect(held['arcade.tickets'].n).toBeGreaterThanOrEqual(1);
    await sw('arcade.game:stacker', false);
    expect((await play(pl, 'stacker', 400)).tickets).toBeGreaterThan(0);
  });

  it('the whole arcade plot type off stops every cabinet in it', async () => {
    await sw('plotkind:arcade', true);
    expect((await play(pl, 'cyclone', 900)).tickets).toBe(0);
    await sw('plotkind:arcade', false);
  });

  it('ALL Ink off: nothing pays Ink anywhere, nothing errors; back on, it pays', async () => {
    await sw('all', true);
    const i0 = await ink(pl);
    const r = await play(pl, 'cyclone', 900);
    expect(r.paid).toBe(0);
    // a direct grant from anywhere pays nothing either
    await db.sql(`select private.grant($1, '{"ink": 50}'::jsonb, 'wheel', 'wheel_spin', 'x', null)`, [pl]);
    expect(await ink(pl)).toBe(i0);
    await sw('all', false);
    await db.sql(`select private.grant($1, '{"ink": 50}'::jsonb, 'wheel', 'wheel_spin', 'y', null)`, [pl]);
    expect(await ink(pl)).toBe(i0 + 50);
  });

  it('one source off (reason) leaves every other source paying', async () => {
    await sw('reason:wheel', true);
    const i0 = await ink(pl);
    await db.sql(`select private.grant($1, '{"ink": 7}'::jsonb, 'wheel', 'wheel_spin', 'z', null)`, [pl]);
    await db.sql(`select private.grant($1, '{"ink": 5}'::jsonb, 'daily_streak', 'day', 'z', null)`, [pl]);
    expect(await ink(pl)).toBe(i0 + 5);
    await sw('reason:wheel', false);
  });

  it('an enchantment switched off pays 0 through grant_ink_paced (reported as 0)', async () => {
    const e = (await db.sql(`insert into enchantments (gx, gy, owner_id, kind, serial, sigil) values ($1, $2, $3, 'goose', 999001, 1) returning id`, [A.gx, A.gy, pl]))[0].id;
    await sw('ench:goose', true);
    const paid = (await db.sql(`select private.grant_ink_paced($1, 20, 'enchantment', 'enchantment', $2, null) n`, [pl, e]))[0].n;
    expect(paid).toBe(0);
    const pay = (await db.sql(`select private.ench_pay($1, 20, 'test') r`, [e]))[0].r;
    expect(pay).toMatchObject({ paid: 0, paused: true });
    await sw('ench:goose', false);
    expect((await db.sql(`select private.grant_ink_paced($1, 20, 'enchantment', 'enchantment', $2, null) n`, [pl, e]))[0].n).toBe(20);
  });

  it('multipliers switched off count as ×1, and rent switches zero just that extra', async () => {
    await db.sql(`select private.earn_note('x', 0)`);
    await sw('mult:enchant', true);
    expect(Number((await db.sql(`select private.ench_minigame_mult($1, $2, $3) m`, [pl, A.gx, A.gy]))[0].m)).toBe(1);
    await sw('mult:enchant', false);
    await sw('rent.extra:landlord', true);
    expect(Number((await db.sql(`select private.landlord_extra($1, now() - interval '1 day') x`, [pl]))[0].x)).toBe(0);
    await sw('rent.extra:landlord', false);
  });

  it('every switch is in the audit log', async () => {
    const n = Number((await db.sql(`select count(*)::int n from audit_logs where action like 'earn.switch_%'`))[0].n);
    expect(n).toBeGreaterThanOrEqual(10);
  });
});
