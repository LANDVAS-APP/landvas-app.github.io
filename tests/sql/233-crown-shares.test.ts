// Crowns: a 1% share of the kingdom (Ink or rent, the holder's pick, locked a month) instead of a rent multiplier.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let king: string, a: string, b: string, ad: string, T: { id: number; gx: number; gy: number };
let C: { gx: number; gy: number };
const own = (u: string, gx: number, gy: number, rarity: string) =>
  db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, $2, 'graphite', $3, $4, now())`, [gx, gy, rarity, u]);
const ink = async (u: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [u]))[0].amount);
const earn = (u: string, n: number, reason = 'minigame') => db.sql(`select private.grant($1, jsonb_build_object('ink', $2::int), $3, 'test', gen_random_uuid()::text, null)`, [u, n, reason]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  king = await db.newPlayer('kai_king'); a = await db.newPlayer('ana_subject'); b = await db.newPlayer('bo_subject'); ad = await db.newPlayer('cs_admin');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [ad]);
  await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
  [T] = await db.sql(`select id, gx, gy from world_cities where name = 'Tokyo'`);
  C = { gx: T.gx + 10, gy: T.gy + 10 };
  await own(king, C.gx, C.gy, 'crown');
  await own(a, T.gx + 20, T.gy + 20, 'legendary');
  await own(b, T.gx + 21, T.gy + 20, 'common');
  // the referral share would pay an inviter; nobody invited anyone here
});
afterAll(() => db.close());

describe('Crown shares', () => {
  it('a Crown starts on the Rent share: 1% of everyone else’s rent in the city, added to the holder’s rent', async () => {
    const [m] = await db.rpc(king, 'crown_shares_mine');
    expect(m).toMatchObject({ tier: 'crown', kingdom: 'Tokyo', choice: 'rent', picked: false, can_switch: true, members: 2 });
    const want = 0.01 * Number((await db.sql(`select private.kingdom_rent_rate('crown', $1, $2) r`, [T.id, king]))[0].r);
    expect(Number(m.rent_usd_per_second)).toBeCloseTo(want, 18);
    expect(want).toBeGreaterThan(0);
    // an hour later the holder's rent has it
    await db.sql(`insert into rent_accounts (player_id, settled_at) values ($1, now()) on conflict do nothing`, [king]);
    await db.sql(`update rent_accounts set settled_at = now() - interval '1 hour', balance_usd = 0, boost_until = null where player_id = $1`, [king]);
    const own = Number((await db.sql(`select private.rent_rate($1) r`, [king]))[0].r);
    await db.sql(`select private.rent_settle($1)`, [king]);
    const bal = Number((await db.sql(`select balance_usd from rent_accounts where player_id = $1`, [king]))[0].balance_usd);
    expect(bal).toBeCloseTo((own + want) * 3600, 8);
    // and no multiplier on the holder's own rent
    expect(Number((await db.sql(`select private.rent_mult($1) m`, [king]))[0].m)).toBe(1);
  });

  it('switching to the Ink share pays 1% of the Ink everyone else in the city earns by playing', async () => {
    const r = await db.rpc(king, 'crown_share_choose', { p_gx: C.gx, p_gy: C.gy, p_choice: 'ink' });
    expect(r).toMatchObject({ choice: 'ink', picked: true, can_switch: false });
    await expect(db.rpc(a, 'crown_share_choose', { p_gx: C.gx, p_gy: C.gy, p_choice: 'rent' })).rejects.toThrow(/not_your_crown/);
    await db.sql(`update crown_shares set ink_paid_at = now() - interval '1 second'`);
    await earn(a, 600); await earn(b, 400);
    await earn(king, 5000);                    // the holder's own Ink doesn't count
    await earn(a, 900, 'usd_conversion');       // nor rent conversions, invites or refunds
    const before = await ink(king);
    await db.sql(`update crown_shares set ink_paid_at = ink_paid_at - interval '20 minutes'`); // (as if the heartbeat were due)
    await db.sql(`select private.crown_tick()`);
    expect(await ink(king) - before).toBe(10); // 1% of 1000
    // nothing twice
    await db.sql(`select private.crown_tick()`);
    expect(await ink(king) - before).toBe(10);
    expect(Number((await db.sql(`select ink_total from crown_shares`))[0].ink_total)).toBe(10);
  });

  it('the pick is locked for a month; after that it can be switched (and locks again)', async () => {
    await expectError(db.rpc(king, 'crown_share_choose', { p_gx: C.gx, p_gy: C.gy, p_choice: 'rent' }), 'crown_choice_locked');
    await db.sql(`update crown_shares set locked_until = now() - interval '1 minute'`);
    const r = await db.rpc(king, 'crown_share_choose', { p_gx: C.gx, p_gy: C.gy, p_choice: 'rent' });
    expect(r).toMatchObject({ choice: 'rent', can_switch: false });
    expect(new Date(r.locked_until).getTime() - Date.now()).toBeGreaterThan(29 * 86400_000);
    expect((await db.sql(`select switches from crown_shares`))[0].switches).toBe(1);
  });

  it('a new holder picks afresh', async () => {
    await db.sql(`update world_plots set owner_id = $3 where gx = $1 and gy = $2`, [C.gx, C.gy, b]);
    const [m] = await db.rpc(b, 'crown_share_choose', { p_gx: C.gx, p_gy: C.gy, p_choice: 'ink' }).then((x: any) => [x]);
    expect(m).toMatchObject({ choice: 'ink', picked: true });
    expect((await db.sql(`select holder, ink_total::int, switches from crown_shares`))[0]).toMatchObject({ holder: b, ink_total: 0, switches: 0 });
  });

  it('the shares have their own earning switches', async () => {
    await db.rpc(ad, 'admin_earn_switch', { p_key: 'reason:crown', p_off: true });
    await db.sql(`update crown_shares set ink_paid_at = now() - interval '1 second'`);
    await earn(a, 5000);
    await db.sql(`update crown_shares set ink_paid_at = ink_paid_at - interval '20 minutes'`);
    const before = await ink(b);
    await db.sql(`select private.crown_tick()`);
    expect(await ink(b)).toBe(before);
    await db.rpc(ad, 'admin_earn_switch', { p_key: 'reason:crown', p_off: false });
    await db.rpc(ad, 'admin_earn_switch', { p_key: 'rent.extra:crown', p_off: true });
    expect(Number((await db.sql(`select private.crown_rent_extra($1, now() - interval '1 hour') x`, [king]))[0].x)).toBe(0);
  });

  it('the Royalty page shows a holder their pick (and nobody else’s)', async () => {
    const mine = (await db.rpc(b, 'royalty')).crowns.find((c: any) => c.is_me);
    expect(mine).toMatchObject({ share: 'ink' });
    const theirs = (await db.rpc(a, 'royalty')).crowns[0];
    expect(theirs.share ?? null).toBeNull();
  });
});
