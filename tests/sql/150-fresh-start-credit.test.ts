// v0.7.4 Fresh Start Event credit: Ink earned on the temporary server is paid to the main account with the same
// email — now for existing accounts, on sign-up for everyone else — exactly once.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
const ink = async (uid: string) => Number((await db.sql(`select coalesce((select amount from resource_balances where player_id = $1 and resource = 'ink'), 0) n`, [uid]))[0].n);
const load = (rows: [string, number][]) => db.sql(
  `insert into private.temp_credits (email, earned, ink) select e, x, ceil(x * 1.1) from unnest($1::text[], $2::bigint[]) t(e, x) on conflict (email) do nothing`,
  [rows.map((r) => r[0]), rows.map((r) => r[1])]);
let old: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  old = await db.newPlayer('fresh_old'); // fresh_old@example.test
});
afterAll(() => db.close());

describe('Fresh Start credit', () => {
  it('pays an existing account its earnings plus 10%, once', async () => {
    await load([['fresh_old@example.test', 1000], ['fresh_new@example.test', 200]]);
    const before = await ink(old);
    const r = await db.sql(`select private.temp_credit_apply_all() r`);
    expect(r[0].r).toMatchObject({ credited_now: 1, ink_now: 1100, waiting_for_signup: 1, ink_waiting: 220 });
    expect(await ink(old)).toBe(before + 1100);
    const h = await db.sql(`select reason, delta from resource_ledger where player_id = $1 and reason = 'fresh_start_event'`, [old]);
    expect(h).toEqual([{ reason: 'fresh_start_event', delta: '1100' }].map((x) => ({ ...x, delta: expect.anything() })));
    // again: nothing more
    expect((await db.sql(`select private.temp_credit_apply_all() r`))[0].r).toMatchObject({ credited_now: 0, ink_now: 0 });
    await load([['fresh_old@example.test', 99999]]); // loading again never changes a credit
    expect((await db.sql(`select private.temp_credit_apply_all() r`))[0].r).toMatchObject({ credited_now: 0 });
    expect(await ink(old)).toBe(before + 1100);
  });

  it('someone who only played on the temporary server is paid when they sign up', async () => {
    const uid = await db.createUser('Fresh_New@Example.test');
    await db.onboard(uid, 'fresh_new');
    const got = await db.sql(`select coalesce(sum(delta), 0)::int n from resource_ledger where player_id = $1 and reason = 'fresh_start_event'`, [uid]);
    expect(got[0].n).toBe(220);
    expect((await db.sql(`select private.temp_credit_apply_all() r`))[0].r).toMatchObject({ credited_now: 0, waiting_for_signup: 0, credited_total: 2 });
  });

  it('players can neither read the list nor pay themselves', async () => {
    await expect(db.rpc(old, 'temp_credit_apply_all', {})).rejects.toThrow();
    await expect(db.sql(`set local role authenticated; select * from private.temp_credits`)).rejects.toThrow();
  });
});
