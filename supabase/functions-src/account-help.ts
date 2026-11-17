// POST /account-help — staff fix a player's email and sign-in from admin.landvas.app (player → Account).
//   { action, player, reason?, email?, then?, kind? }
//   send_reset    email them a password reset link (to the address on file)
//   send_link     email them a sign-in link, which also confirms their email (a sign-up confirmation if Supabase
//                 never confirmed the account: a sign-in link would wipe an unconfirmed account's password)
//   change_email  change the address; then 'link' (they confirm it from a link sent there) or 'confirmed'
//   confirm       count their email as confirmed (staff checked it's theirs)
//   recheck       they confirm their email again (their game asks until they open a new link, sent now)
//   signout       end every sign-in on every device
//   make_link     owner only: a one-time sign-in or reset link to copy, for when emails don't reach them
// Who may do each is checked in the database as the caller (public.admin_account_check: their staff role, and
// two-step sign-in when it's required); the audit line is written by public.svc_account_done.
import { createClient } from '@supabase/supabase-js';
import { adminClient, cors, env, json, serve } from './shared';

const SITE = 'https://landvas.app';
const ACTIONS = new Set(['send_reset', 'send_link', 'change_email', 'confirm', 'recheck', 'signout', 'make_link']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Check = { actor: string; email: string | null; auth_confirmed: boolean; new_email: string | null; reason: string | null };
type AuthError = { message?: string; code?: string; status?: number } | null;

/** Supabase Auth's answer, in words staff can act on */
function authFail(e: AuthError) {
  const msg = String(e?.message ?? '');
  const wait = msg.match(/after (\d+) seconds?/i)?.[1];
  if (e?.code === 'over_email_send_rate_limit' || e?.status === 429 || /rate limit|seconds/i.test(msg)) {
    return { error: 'too_soon', message: wait ? `They were sent an email moments ago. Try again in ${wait} seconds.` : 'Too many emails just now. Try again in a minute.', detail: wait ?? null };
  }
  if (e?.code === 'email_exists' || /already been registered|already registered/i.test(msg)) return { error: 'email_taken', message: 'Another account already uses that email.' };
  if (e?.code === 'email_address_invalid' || /invalid/i.test(msg)) return { error: 'email_invalid', message: 'That email address doesn’t look right.' };
  if (e?.code === 'user_not_found') return { error: 'player_not_found', message: 'That account doesn’t exist any more.' };
  return { error: 'auth_error', message: msg ? `Supabase Auth said: ${msg}` : 'Supabase Auth didn’t answer. Try again.' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const bearer = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+/i.test(bearer)) return json({ error: 'not_signed_in', message: 'Sign in again.' }, 401);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* checked below */ }
  const action = String(body.action ?? '');
  const player = String(body.player ?? '');
  if (!ACTIONS.has(action) || !UUID.test(player)) return json({ error: 'bad_request' }, 400);
  const args = {
    reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
    email: typeof body.email === 'string' ? body.email.slice(0, 300) : null,
    then: body.then === 'confirmed' ? 'confirmed' : 'link',
    kind: body.kind === 'reset' ? 'reset' : 'signin',
  };

  // 1. as the staff member: may they? (role, two-step sign-in, a staff account's email, limits, the new address)
  const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: ok, error: denied } = await caller.rpc('admin_account_check', { p_player: player, p_action: action, p_args: args });
  if (denied) return json({ error: denied.message, detail: denied.details ?? null }, 403);
  const c = ok as Check;
  const admin = adminClient();
  const confirmLink = { emailRedirectTo: `${SITE}/welcome?confirmed=1` };

  /** a link that proves the inbox: sign-in link, or the sign-up confirmation for accounts Supabase never confirmed */
  const sendLink = async (email: string, authConfirmed: boolean) => (authConfirmed
    ? admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false, ...confirmLink } })
    : admin.auth.resend({ type: 'signup', email, options: confirmLink }));

  const done = async (details: Record<string, unknown>) => {
    const { data, error } = await admin.rpc('svc_account_done', { p_actor: c.actor, p_player: player, p_action: action, p_details: { reason: c.reason, ...details } });
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, unknown>;
  };

  try {
    switch (action) {
      case 'send_reset': {
        const { error } = await admin.auth.resetPasswordForEmail(c.email!, { redirectTo: `${SITE}/reset-password` });
        if (error) return json(authFail(error), 400);
        return json({ ok: true, sent_to: c.email, ...(await done({ to: c.email })) });
      }
      case 'send_link': {
        const { error } = await sendLink(c.email!, c.auth_confirmed);
        if (error) return json(authFail(error), 400);
        return json({ ok: true, sent_to: c.email, kind: c.auth_confirmed ? 'signin' : 'signup', ...(await done({ to: c.email, kind: c.auth_confirmed ? 'signin' : 'signup' })) });
      }
      case 'change_email': {
        const to = c.new_email!;
        // confirmed for Supabase (so their password keeps working); LANDVAS's own confirmation is set in step 2
        const { error } = await admin.auth.admin.updateUserById(player, { email: to, email_confirm: true });
        if (error) return json(authFail(error), 400);
        const out = await done({ from: c.email, to, then: args.then });
        if (args.then === 'confirmed') return json({ ok: true, changed: true, ...out });
        const sent = await sendLink(to, true);
        return json({ ok: true, changed: true, sent_to: sent.error ? null : to, send_error: sent.error ? authFail(sent.error).message : null, ...out });
      }
      case 'confirm':
        return json({ ok: true, ...(await done({})) });
      case 'recheck': {
        const out = await done({ to: c.email });
        const sent = await sendLink(c.email!, c.auth_confirmed);
        return json({ ok: true, sent_to: sent.error ? null : c.email, send_error: sent.error ? authFail(sent.error).message : null, ...out });
      }
      case 'signout':
        return json({ ok: true, ...(await done({})) });
      case 'make_link': {
        const type = args.kind === 'reset' ? 'recovery' : 'magiclink';
        const { data, error } = await admin.auth.admin.generateLink({ type, email: c.email! });
        const hash = (data as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
        if (error || !hash) return json(authFail(error), 400);
        await done({ kind: args.kind });
        return json({ ok: true, link: `${SITE}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=${type}` });
      }
    }
    return json({ error: 'bad_request' }, 400);
  } catch (e) {
    return json({ error: 'server_error', message: String((e as Error)?.message ?? e) }, 500);
  }
});
