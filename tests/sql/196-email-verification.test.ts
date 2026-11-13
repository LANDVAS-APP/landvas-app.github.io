// Every player confirms their email: an account Supabase marked "confirmed" without a link (sign-ups from when
// confirmation was off) can't play until it opens a LANDVAS email link; invites only pay out for confirmed friends.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const P = { gx: 1_310_000, gy: 1_520_000 };

/** call an RPC with a full set of JWT claims (how the session began: amr) */
async function rpcAs(uid: string, method: string, fn: string) {
  const c = db.admin;
  await c.query('begin');
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated', amr: [{ method, timestamp: 1763000000 }] })]);
    await c.query('set local role authenticated');
    const r = await c.query(`select public.${fn}() as r`);
    await c.query('commit');
    return r.rows[0].r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}
/** an account from before confirmation was required: confirmed by Supabase at sign-up, no link ever sent */
async function legacyPlayer(username: string) {
  const uid = await db.createUser(`${username}@example.test`);
  await db.sql(`update auth.users set confirmation_sent_at = null, email_confirmed_at = created_at where id = $1`, [uid]);
  await db.onboard(uid, username);
  return uid;
}
const setRequired = (on: boolean) => db.sql(`update game_config set value = jsonb_build_object('required', $1::boolean) where key = 'email_verification'`, [on]);

beforeAll(async () => {
  await db.init({ ungated: true });
});
afterAll(() => db.close());

describe('email confirmation', () => {
  it('a player who tapped their sign-up confirmation link is confirmed and plays as normal', async () => {
    const p = await db.newPlayer('linked_in');
    expect(await db.rpc(p, 'my_email_status')).toMatchObject({ verified: true, required: true, email: 'linked_in@example.test' });
    await db.placeAt(p, P.gx, P.gy);
  });

  it('an account that never confirmed can sign in and onboard, but not play', async () => {
    const p = await legacyPlayer('never_linked');
    expect(await db.rpc(p, 'my_email_status')).toMatchObject({ verified: false, required: true });
    expect((await db.rpc(p, 'my_state')).onboarded).toBe(true); // the app can still load who they are
    await expectError(db.placeAt(p, P.gx + 4, P.gy), 'email_not_verified');
    await expectError(db.rpc(p, 'my_referrals'), 'email_not_verified');
    // signing in with a password proves nothing about the inbox
    expect((await rpcAs(p, 'password', 'my_email_status')).verified).toBe(false);
  });

  it('opening a LANDVAS email link (sign-in link, reset, sign-up) confirms it for good', async () => {
    const p = await legacyPlayer('magic_now');
    expect((await rpcAs(p, 'magiclink', 'my_email_status')).verified).toBe(true);
    const row = await db.sql(`select via from private.email_verifications where user_id = $1`, [p]);
    expect(row[0].via).toBe('link:magiclink');
    // later sessions (password, refreshed tokens) stay confirmed
    expect((await db.rpc(p, 'my_email_status')).verified).toBe(true);
    await db.placeAt(p, P.gx + 8, P.gy);
    for (const m of ['recovery', 'email/signup', 'otp']) {
      const q = await legacyPlayer(`via_${m.replace(/\W/g, '')}`);
      expect((await rpcAs(q, m, 'my_email_status')).verified).toBe(true);
    }
  });

  it('a link sign-in also counts on any game action, without visiting the confirm screen', async () => {
    const p = await legacyPlayer('acts_first');
    // report_position goes through require_active_player
    const c = db.admin;
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: p, role: 'authenticated', amr: [{ method: 'magiclink', timestamp: 1 }] })]);
    await c.query('set local role authenticated');
    await c.query(`select public.my_referrals()`);
    await c.query('commit');
    expect((await db.rpc(p, 'my_email_status')).verified).toBe(true);
  });

  it('the requirement can be switched off in game settings', async () => {
    const p = await legacyPlayer('switch_off');
    await setRequired(false);
    expect(await db.rpc(p, 'my_email_status')).toMatchObject({ verified: false, required: false });
    await db.placeAt(p, P.gx + 12, P.gy);
    await setRequired(true);
    await expectError(db.placeAt(p, P.gx + 12, P.gy + 1), 'email_not_verified');
  });

  it('players can’t read who is confirmed, and signed-out visitors can’t ask', async () => {
    const p = await db.newPlayer('snoop');
    const c = db.admin;
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: p, role: 'authenticated' })]);
    await c.query('set local role authenticated');
    await expect(c.query('select * from private.email_verifications')).rejects.toThrow(/permission denied/);
    await c.query('rollback');
    await expectError(db.rpc(null, 'my_email_status'), 'permission denied');
  });
});

describe('referrals and email confirmation', () => {
  it('an invite pays out only once the invited friend confirms their email', async () => {
    const inviter = await db.newPlayer('crew_lead');
    const friend = await legacyPlayer('crew_new');
    const ref = (await db.sql(`select value from game_config where key = 'referrals'`))[0].value;
    await db.sql(`update game_config set value = $1 where key = 'referrals'`, [{ ...ref, qualify: 'starter_plot' }]);
    try {
      // (with the requirement off the friend can play; the invite still waits for their email)
      await setRequired(false);
      await db.rpc(friend, 'redeem_referral', { p_code: 'CREW_LEAD' });
      await db.placeAt(friend, P.gx + 20, P.gy);
      await db.rpc(friend, 'claim_starter_plot', { p_gx: P.gx + 20, p_gy: P.gy });
      await setRequired(true);
      let mine = await db.rpc(inviter, 'my_referrals');
      expect(mine.stats).toMatchObject({ pending: 1, awaiting_email: 1, rewarded: 0 });
      expect(mine.recent[0]).toMatchObject({ status: 'pending', email_confirmed: false });
      const before = (await db.rpc(inviter, 'my_state')).balances.ink;

      // the friend taps a LANDVAS email link: confirmed, and the starter plot they already claimed now counts
      expect((await rpcAs(friend, 'magiclink', 'my_email_status')).verified).toBe(true);
      mine = await db.rpc(inviter, 'my_referrals');
      expect(mine.stats).toMatchObject({ pending: 0, awaiting_email: 0, rewarded: 1, earned_ink: 500 });
      expect(mine.recent[0]).toMatchObject({ status: 'rewarded', email_confirmed: true });
      expect((await db.rpc(inviter, 'my_state')).balances.ink).toBe(before + 500);
      // …once
      expect((await rpcAs(friend, 'magiclink', 'my_email_status')).verified).toBe(true);
      expect((await db.rpc(inviter, 'my_state')).balances.ink).toBe(before + 500);
    } finally {
      await setRequired(true);
      await db.sql(`update game_config set value = $1 where key = 'referrals'`, [ref]);
    }
  });

  it('a confirmed friend counts straight away, as before', async () => {
    const inviter = await db.newPlayer('crew_two');
    const friend = await db.newPlayer('crew_two_new');
    const ref = (await db.sql(`select value from game_config where key = 'referrals'`))[0].value;
    await db.sql(`update game_config set value = $1 where key = 'referrals'`, [{ ...ref, qualify: 'signup' }]);
    try {
      await db.rpc(friend, 'redeem_referral', { p_code: 'CREW_TWO' });
      const mine = await db.rpc(inviter, 'my_referrals');
      expect(mine.stats).toMatchObject({ rewarded: 1, awaiting_email: 0 });
      expect(mine.recent[0].email_confirmed).toBe(true);
    } finally {
      await db.sql(`update game_config set value = $1 where key = 'referrals'`, [ref]);
    }
  });
});
