// Account help (admin.landvas.app → a player → Account): who may change a player's email and sign-in, the checks on a
// new address, and what each action leaves their email confirmation as. The Supabase Auth part (sending emails,
// changing the address in Auth) is the account-help Edge Function's; here the database side is tested as it calls it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, admin: string, support: string, mod2: string, alice: string, bob: string;

/** call as a user with extra JWT claims (aal, amr) */
async function as(uid: string, claims: Record<string, unknown>, fn: string, args: Record<string, unknown> = {}) {
  const c = db.admin;
  const keys = Object.keys(args);
  await c.query('begin');
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated', aal: 'aal1', ...claims })]);
    await c.query('set local role authenticated');
    const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
      keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    await c.query('commit');
    return r.rows[0]?.r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}
const check = (who: string, player: string, action: string, args: Record<string, unknown> = {}) =>
  db.rpc(who, 'admin_account_check', { p_player: player, p_action: action, p_args: args });
/** what the Edge Function records once the Auth part worked */
const done = (actor: string, player: string, action: string, details: Record<string, unknown> = {}) =>
  db.rpc({ role: 'service_role' }, 'svc_account_done', { p_actor: actor, p_player: player, p_action: action, p_details: details });
const verified = async (uid: string) => (await db.sql(`select private.email_verified($1) as v`, [uid]))[0].v as boolean;
const secondsAgo = (s: number) => Math.floor(Date.now() / 1000) - s;

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('acct_owner');
  admin = await db.newPlayer('acct_admin');
  support = await db.newPlayer('acct_support');
  mod2 = await db.newPlayer('acct_mod');
  alice = await db.newPlayer('acct_alice');
  bob = await db.newPlayer('acct_bob');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($2, 'admin'), ($3, 'support'), ($4, 'moderator')`, [owner, admin, support, mod2]);
});
afterAll(() => db.close());

describe('account help: who can do what', () => {
  it('players get nothing', async () => {
    await expectError(db.rpc(alice, 'admin_account', { p_player: bob }), 'forbidden');
    await expectError(check(alice, bob, 'send_reset'), 'forbidden');
    await expectError(db.rpc(alice, 'svc_account_done', { p_actor: alice, p_player: bob, p_action: 'confirm', p_details: {} }), 'permission denied');
  });

  it('support and moderators can send links and sign someone out, not change their email', async () => {
    for (const who of [support, mod2]) {
      const a = await db.rpc(who, 'admin_account', { p_player: alice });
      expect(a).toMatchObject({ email: 'acct_alice@example.test', verified: true, can: { send: true, signout: true, change: false, confirm: false, link: false } });
      expect((await check(who, alice, 'send_reset')).email).toBe('acct_alice@example.test');
      await check(who, alice, 'send_link');
      await check(who, alice, 'signout');
      await expectError(check(who, alice, 'change_email', { email: 'new@example.test', reason: 'typo' }), 'forbidden');
      await expectError(check(who, alice, 'confirm', { reason: 'checked' }), 'forbidden');
      await expectError(check(who, alice, 'make_link', { kind: 'signin', reason: 'emails bounce' }), 'forbidden');
    }
  });

  it('admins change emails, but only the owner changes a staff account’s or makes a link to copy', async () => {
    expect((await db.rpc(admin, 'admin_account', { p_player: alice })).can).toMatchObject({ change: true, confirm: true, link: false });
    expect((await db.rpc(admin, 'admin_account', { p_player: support })).can).toMatchObject({ change: false, confirm: false });
    await check(admin, alice, 'change_email', { email: 'alice.new@example.test', reason: 'typo at sign-up' });
    await expectError(check(admin, support, 'change_email', { email: 'x@example.test', reason: 'asked' }), 'forbidden');
    await expectError(check(admin, alice, 'make_link', { kind: 'signin', reason: 'emails bounce' }), 'forbidden');
    expect((await db.rpc(owner, 'admin_account', { p_player: support })).can).toMatchObject({ change: true, confirm: true, link: true });
    await check(owner, support, 'change_email', { email: 'support.new@example.test', reason: 'new inbox' });
    await check(owner, alice, 'make_link', { kind: 'reset', reason: 'emails bounce' });
  });

  it('two-step sign-in, when required, covers account help too', async () => {
    await db.sql(`update game_config set value = value || '{"require_mfa": true}' where key = 'portal'`);
    try {
      await expectError(as(support, { aal: 'aal1' }, 'admin_account_check', { p_player: alice, p_action: 'send_reset', p_args: {} }), 'mfa_required');
      await expectError(as(support, { aal: 'aal1' }, 'admin_account', { p_player: alice }), 'mfa_required');
      expect((await as(support, { aal: 'aal2' }, 'admin_account_check', { p_player: alice, p_action: 'send_reset', p_args: {} })).email).toBe('acct_alice@example.test');
    } finally {
      await db.sql(`update game_config set value = value || '{"require_mfa": false}' where key = 'portal'`);
    }
  });
});

describe('account help: changing an email', () => {
  it('checks the new address and gives a reason', async () => {
    await expectError(check(admin, alice, 'change_email', { email: 'alice.new@example.test' }), 'reason_required');
    await expectError(check(admin, alice, 'change_email', { email: 'not-an-email', reason: 'typo' }), 'email_invalid');
    await expectError(check(admin, alice, 'change_email', { email: 'a@b', reason: 'typo' }), 'email_invalid');
    await expectError(check(admin, alice, 'change_email', { email: ' ACCT_ALICE@example.test ', reason: 'typo' }), 'email_same');
    // already someone else's: says whose
    await expectError(check(admin, alice, 'change_email', { email: 'ACCT_BOB@example.test', reason: 'typo' }), 'email_taken');
    try { await check(admin, alice, 'change_email', { email: 'acct_bob@example.test', reason: 'typo' }); } catch (e: any) { expect(e.detail).toBe('acct_bob'); }
    const ok = await check(admin, alice, 'change_email', { email: '  Alice.Fixed@Example.test ', reason: 'typo at sign-up', then: 'link' });
    expect(ok).toMatchObject({ actor: admin, email: 'acct_alice@example.test', new_email: 'alice.fixed@example.test', reason: 'typo at sign-up' });
  });

  it('"they confirm it": their game asks until they open a link sent to the new address', async () => {
    expect(await verified(alice)).toBe(true);
    // what the Edge Function does: Auth changes the address (and counts it confirmed for passwords), then this
    await db.sql(`update auth.users set email = 'alice.fixed@example.test', email_confirmed_at = now() where id = $1`, [alice]);
    const out = await done(admin, alice, 'change_email', { reason: 'typo at sign-up', from: 'acct_alice@example.test', to: 'alice.fixed@example.test', then: 'link' });
    expect(out.verified).toBe(false);
    expect(await as(alice, {}, 'my_email_status')).toMatchObject({ verified: false, required: true, email: 'alice.fixed@example.test' });
    await expectError(db.rpc(alice, 'my_referrals'), 'email_not_verified');
    // a session that began with an email link before the change proves nothing about the new address
    expect((await as(alice, { amr: [{ method: 'magiclink', timestamp: secondsAgo(3600) }] }, 'my_email_status')).verified).toBe(false);
    // the link they get now does
    expect((await as(alice, { amr: [{ method: 'magiclink', timestamp: secondsAgo(-1) }] }, 'my_email_status')).verified).toBe(true);
    expect(await verified(alice)).toBe(true);
    expect((await db.sql(`select count(*)::int n from private.email_rechecks where user_id = $1`, [alice]))[0].n).toBe(0);
    await db.rpc(alice, 'my_referrals');
  });

  it('"mark it confirmed": they keep playing, no link needed', async () => {
    const carol = await db.newPlayer('acct_carol');
    await db.sql(`update auth.users set confirmation_sent_at = null, email_confirmed_at = created_at where id = $1`, [carol]); // never confirmed
    expect(await verified(carol)).toBe(false);
    await db.sql(`update auth.users set email = 'carol.real@example.test' where id = $1`, [carol]);
    const out = await done(owner, carol, 'change_email', { reason: 'checked on Discord', from: 'acct_carol@example.test', to: 'carol.real@example.test', then: 'confirmed' });
    expect(out.verified).toBe(true);
    expect((await db.sql(`select via from private.email_verifications where user_id = $1`, [carol]))[0].via).toBe('staff');
    await db.rpc(carol, 'my_referrals');
  });

  it('a waiting Fresh Start credit for the new address is paid', async () => {
    const dan = await db.newPlayer('acct_dan');
    await db.sql(`insert into private.temp_credits (email, earned, ink) values ('dan.real@example.test', 100, 110)`);
    await db.sql(`update auth.users set email = 'dan.real@example.test' where id = $1`, [dan]);
    const out = await done(owner, dan, 'change_email', { reason: 'typo', from: 'acct_dan@example.test', to: 'dan.real@example.test', then: 'confirmed' });
    expect(out.fresh_start_ink).toBe(110);
  });

  it('every action is in the player’s Account history, with who and why (never a copied link)', async () => {
    await done(owner, alice, 'make_link', { reason: 'emails bounce', kind: 'signin', link: 'https://landvas.app/auth/confirm?token_hash=secret' });
    const a = await db.rpc(owner, 'admin_account', { p_player: alice });
    const actions = a.history.map((h: any) => h.action);
    expect(actions).toContain('account_change_email');
    expect(actions).toContain('account_make_link');
    const change = a.history.find((h: any) => h.action === 'account_change_email');
    expect(change).toMatchObject({ by: 'acct_admin', details: { from: 'acct_alice@example.test', to: 'alice.fixed@example.test', reason: 'typo at sign-up' } });
    expect(JSON.stringify(a.history)).not.toContain('token_hash');
  });
});

describe('account help: confirmation on its own', () => {
  it('"ask to confirm again" and "mark confirmed"', async () => {
    expect(await verified(bob)).toBe(true); // tapped the sign-up link
    await done(admin, bob, 'recheck', { reason: 'email looked fake' });
    expect(await verified(bob)).toBe(false);
    expect((await db.rpc(admin, 'admin_account', { p_player: bob })).recheck).toMatchObject({ email: 'acct_bob@example.test', by: 'acct_admin' });
    // a fresh sign-up confirmation counts (accounts Supabase never confirmed get that instead of a sign-in link)
    await db.sql(`update auth.users set confirmation_sent_at = clock_timestamp(), email_confirmed_at = clock_timestamp() where id = $1`, [bob]);
    expect(await verified(bob)).toBe(true);
    await done(admin, bob, 'recheck', { reason: 'again' });
    expect(await verified(bob)).toBe(false);
    await done(admin, bob, 'confirm', { reason: 'checked on Discord' });
    expect(await verified(bob)).toBe(true);
    expect((await db.rpc(admin, 'admin_account', { p_player: bob })).recheck).toBeNull();
  });

  it('signing out everywhere is harmless where there are no sign-in tables (the local build)', async () => {
    expect(await done(support, bob, 'signout', { reason: 'lost phone' })).toMatchObject({ sessions: 0 });
  });

  it('lists their sign-ins and signs them out everywhere (with Supabase’s sign-in tables)', async () => {
    await db.sql(`
      create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null, created_at timestamptz default now(), updated_at timestamptz default now(),
        factor_id uuid, aal text, not_after timestamptz, refreshed_at timestamp, user_agent text, ip inet, tag text);
      create table auth.refresh_tokens (id bigserial primary key, token varchar(255), user_id varchar(255), revoked boolean, created_at timestamptz default now(),
        updated_at timestamptz default now(), parent varchar(255), session_id uuid references auth.sessions(id) on delete cascade);
      create table auth.mfa_amr_claims (id uuid primary key default gen_random_uuid(), session_id uuid not null references auth.sessions(id) on delete cascade,
        created_at timestamptz default now(), updated_at timestamptz default now(), authentication_method text not null);`);
    const s1 = (await db.sql(`insert into auth.sessions (user_id, aal, user_agent, refreshed_at) values ($1, 'aal1', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', now() at time zone 'utc') returning id`, [bob]))[0].id;
    const s2 = (await db.sql(`insert into auth.sessions (user_id, aal, user_agent, created_at) values ($1, 'aal1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', now() - interval '3 days') returning id`, [bob]))[0].id;
    await db.sql(`insert into auth.mfa_amr_claims (session_id, authentication_method) values ($1, 'password'), ($2, 'otp')`, [s1, s2]);
    await db.sql(`insert into auth.refresh_tokens (token, user_id, session_id) values ('t1', $1::text, $2), ('t2', $1::text, $3)`, [bob, s1, s2]);
    const a = await db.rpc(support, 'admin_account', { p_player: bob });
    expect(a.sessions).toHaveLength(2);
    expect(a.sessions.map((s: any) => s.device).sort()).toEqual(['Windows · Chrome', 'iPhone · Safari']);
    expect(a.sessions.find((s: any) => s.device === 'iPhone · Safari').how).toEqual(['password']);
    expect(await done(support, bob, 'signout', { reason: 'lost phone' })).toMatchObject({ sessions: 2 });
    expect((await db.sql(`select count(*)::int n from auth.sessions where user_id = $1`, [bob]))[0].n).toBe(0);
    expect((await db.sql(`select count(*)::int n from auth.refresh_tokens where user_id = $1::text`, [bob]))[0].n).toBe(0);
    expect((await db.rpc(support, 'admin_account', { p_player: bob })).sessions).toEqual([]);
    await db.sql(`drop table auth.mfa_amr_claims, auth.refresh_tokens, auth.sessions`);
  });

  it('players who never had a recheck are unchanged: old links still count', async () => {
    const erin = await db.newPlayer('acct_erin');
    await db.sql(`update auth.users set confirmation_sent_at = null, email_confirmed_at = created_at where id = $1`, [erin]);
    expect((await as(erin, { amr: [{ method: 'otp', timestamp: 1 }] }, 'my_email_status')).verified).toBe(true);
  });

  it('staff are rate limited', async () => {
    await db.sql(`update game_config set value = value || '{"account_help": [2, 3600]}' where key = 'rate_limits'`).catch(() => {});
    await db.sql(`insert into game_config (key, value) values ('rate_limits', '{"account_help": [2, 3600]}') on conflict (key) do update set value = game_config.value || excluded.value`);
    const fresh = await db.newPlayer('acct_limited');
    await db.sql(`insert into admin_roles (player_id, role) values ($1, 'support')`, [fresh]);
    await check(fresh, alice, 'send_reset');
    await check(fresh, alice, 'send_reset');
    await expectError(check(fresh, alice, 'send_reset'), 'rate_limited');
  });
});
