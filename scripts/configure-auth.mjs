// Keeps the hosted Supabase Auth settings in line with where the game is served.
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF. Only touches the keys
// below, so anything else configured in the Supabase dashboard is left alone.
//   SITE_URL         the public address of the game (custom domain once live)
//   EXTRA_ORIGINS    other origins that may receive sign-in redirects
//   AUTH_AUTOCONFIRM optional. Only when set to "true" or "false" does this change
//                    whether new players must confirm their email; otherwise the
//                    project's current setting is left as it is.
//   RESEND_API_KEY   optional. When set, Supabase sends its emails through Resend as
//                    LANDVAS <no-reply@landvas.app> (no tiny hourly limit), in LANDVAS's
//                    own design (scripts/auth-emails.mjs; every button is a landvas.app link),
//                    and new players must confirm their email (unless AUTH_AUTOCONFIRM says
//                    otherwise). The key itself is never printed.
import { authEmails } from './auth-emails.mjs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required');
  process.exit(1);
}
// report (never change) how email is set up, so the deploy log shows whether players get
// confirmation and password-reset emails. No secrets are printed.
try {
  const cur = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { headers: { authorization: `Bearer ${token}` } })).json();
  console.log(`email: confirm_required=${cur.mailer_autoconfirm === false} custom_smtp=${!!cur.smtp_host} sender=${cur.smtp_sender_name ?? '-'} emails_per_hour=${cur.rate_limit_email_sent ?? '?'} email_signups=${cur.external_email_enabled}`);
} catch (e) {
  console.log(`email: could not read auth settings (${e.message})`);
}
const site = (process.env.SITE_URL || 'https://landvas-app.github.io').replace(/\/$/, '');
const origins = [site, ...(process.env.EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean), 'http://localhost:5173'];
const body = {
  site_url: site,
  uri_allow_list: [...new Set(origins)].map((o) => `${o.replace(/\/$/, '')}/**`).join(','),
};
const resend = (process.env.RESEND_API_KEY || '').trim();
if (resend) {
  Object.assign(body, {
    smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend', smtp_pass: resend,
    smtp_admin_email: 'no-reply@landvas.app', smtp_sender_name: 'LANDVAS',
    rate_limit_email_sent: 120,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    // LANDVAS-branded emails whose buttons open landvas.app/auth/confirm (see scripts/auth-emails.mjs)
    ...authEmails(),
  });
}
if (process.env.AUTH_AUTOCONFIRM === 'true' || process.env.AUTH_AUTOCONFIRM === 'false') body.mailer_autoconfirm = process.env.AUTH_AUTOCONFIRM === 'true';
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`auth config update failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  process.exit(1);
}
console.log(`auth: site_url=${body.site_url} redirects=${body.uri_allow_list}${'mailer_autoconfirm' in body ? ` autoconfirm=${body.mailer_autoconfirm}` : ''}${resend ? ' smtp=resend (no-reply@landvas.app)' : ''}`);
// confirm the saved confirmation email now links to landvas.app (not the project's supabase.co address)
if (resend) {
  let saved = '';
  try { saved = JSON.parse(text).mailer_templates_confirmation_content ?? ''; } catch { /* not JSON */ }
  console.log(`emails: confirmation link ${saved.includes('landvas.app/auth/confirm?token_hash=') ? 'is a landvas.app link' : 'NOT confirmed as a landvas.app link — check Authentication → Emails'}`);
}

