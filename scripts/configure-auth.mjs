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
//                    own design, and new players must confirm their email (unless
//                    AUTH_AUTOCONFIRM says otherwise). The key itself is never printed.
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
    mailer_subjects_confirmation: 'Confirm your email to start playing LANDVAS',
    mailer_templates_confirmation_content: email('Welcome to LANDVAS', 'One tap and you’re in. Confirm your email to claim your first free plots, paint them, and start earning.', 'Confirm my email', '{{ .ConfirmationURL }}'),
    mailer_subjects_recovery: 'Reset your LANDVAS password',
    mailer_templates_recovery_content: email('Choose a new password', 'Someone (hopefully you) asked to reset the password for this LANDVAS account. The link works once and expires soon.', 'Reset my password', '{{ .ConfirmationURL }}'),
    mailer_subjects_magic_link: 'Your LANDVAS sign-in link',
    mailer_templates_magic_link_content: email('Here’s your sign-in link', 'Tap below to jump straight back into LANDVAS. The link works once and expires soon.', 'Sign me in', '{{ .ConfirmationURL }}'),
    mailer_subjects_email_change: 'Confirm your new LANDVAS email',
    mailer_templates_email_change_content: email('Confirm your new email', 'Tap below to use this address for your LANDVAS account.', 'Confirm new email', '{{ .ConfirmationURL }}'),
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

/** LANDVAS's emails: dark, gold button, works in every mail app (tables, inline styles) */
function email(title, text, button, url) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#070b1c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b1c;padding:32px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#121845;border:1px solid #2c3470;border-radius:24px;">
<tr><td style="padding:36px 32px 8px;text-align:center;">
<div style="font-size:13px;letter-spacing:6px;font-weight:900;color:#ffd86b;">LANDVAS</div>
<h1 style="margin:18px 0 10px;font-size:26px;line-height:1.2;color:#ffffff;">${title}</h1>
<p style="margin:0 0 26px;font-size:15px;line-height:1.55;color:#c3cbf0;">${text}</p>
<a href="${url}" style="display:inline-block;padding:15px 30px;border-radius:16px;background:#f2c048;color:#2a1a00;font-weight:900;font-size:16px;text-decoration:none;">${button}</a>
</td></tr>
<tr><td style="padding:24px 32px 32px;text-align:center;">
<p style="margin:0;font-size:12px;line-height:1.5;color:#7d86b5;">If the button doesn’t work, open this link:<br><a href="${url}" style="color:#9fb3ff;word-break:break-all;">${url}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#7d86b5;">Didn’t ask for this? You can ignore this email.<br>LANDVAS LLC · contact@landvas.app</p>
</td></tr></table>
</td></tr></table></body></html>`;
}
