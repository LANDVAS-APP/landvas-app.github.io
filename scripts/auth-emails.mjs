// LANDVAS's sign-up / sign-in emails (Supabase Auth templates), in the LANDVAS brand:
// the crisp five-plot L mark, Unbounded titles, Manrope text, night-sky card with the spectrum rim.
//
// Every button goes to a LANDVAS address (https://landvas.app/auth/confirm?token_hash=…&type=…),
// never to the Supabase project's own *.supabase.co/auth/v1/verify link. That page
// (src/screens/AuthConfirm.tsx) checks the one-time code with Supabase and lands the player
// in the right place. {{ .TokenHash }} is filled in by Supabase when it sends the email.
//
// Built for every mail app: tables and inline styles, no SVG, web fonts with system fallbacks
// (Apple Mail and iOS Mail show Unbounded/Manrope; Gmail and Outlook fall back cleanly).

export const LINK_BASE = 'https://landvas.app';

const C = {
  night: '#070B1C', deep: '#0B1230', surface: '#10183A', raised: '#172253', line: '#26346F',
  text: '#EEF1FF', muted: '#A1ABD6', faint: '#6F7AAE', violet: '#8B6BFF', cyan: '#22E3FF',
  plots: ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF'],
};
const SPECTRUM = 'linear-gradient(135deg,#FF4D6D 0%,#FF9F1C 22%,#FFE14D 42%,#3DDC97 62%,#34C3FF 80%,#8B6BFF 100%)';
const DISPLAY = "'Unbounded','Unbounded Variable','Arial Black',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BODY = "'Manrope','Manrope Variable',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FONTS = 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Unbounded:wght@700;900&display=swap';

/** the landvas.app address an email's button opens */
export function confirmLink(type, base = LINK_BASE) {
  return `${base.replace(/\/$/, '')}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`;
}

/** the Supabase Auth settings for LANDVAS's four emails (subjects + bodies) */
export function authEmails(base = LINK_BASE) {
  return {
    mailer_subjects_confirmation: 'Confirm your email to start playing LANDVAS',
    mailer_templates_confirmation_content: email({
      title: 'Welcome to LANDVAS',
      text: 'One tap and you’re in. Confirm your email to claim your first free plots, paint them, and start earning.',
      button: 'Confirm my email', url: confirmLink('signup', base), base,
    }),
    mailer_subjects_recovery: 'Reset your LANDVAS password',
    mailer_templates_recovery_content: email({
      title: 'Choose a new password',
      text: 'Someone (hopefully you) asked to reset the password for this LANDVAS account. The link works once and expires soon.',
      button: 'Reset my password', url: confirmLink('recovery', base), base,
    }),
    // sent for a sign-in link and for players confirming an email they never confirmed: one tap does both
    mailer_subjects_magic_link: 'Confirm it’s you on LANDVAS',
    mailer_templates_magic_link_content: email({
      title: 'Confirm it’s you',
      text: 'Tap below to confirm your email and jump straight back into LANDVAS. The link works once and expires soon.',
      button: 'Confirm my email', url: confirmLink('magiclink', base), base,
    }),
    mailer_subjects_email_change: 'Confirm your new LANDVAS email',
    mailer_templates_email_change_content: email({
      title: 'Confirm your new email',
      text: 'Tap below to use this address for your LANDVAS account.',
      button: 'Confirm new email', url: confirmLink('email_change', base), base,
    }),
  };
}

/** five little plot bars under the wordmark, as in the brand lockup */
function plotBars() {
  const cells = C.plots.map((c, i) =>
    `${i ? '<td width="4" style="font-size:0;line-height:0;">&nbsp;</td>' : ''}<td width="18" height="4" style="width:18px;height:4px;background:${c};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:10px auto 0;"><tr>${cells}</tr></table>`;
}

export function email({ title, text, button, url, base = LINK_BASE }) {
  const site = base.replace(/\/$/, '');
  const shown = url.replace(/&/g, '&amp;');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${title}</title>
<link href="${FONTS.replace(/&/g, '&amp;')}" rel="stylesheet">
<style>
@import url('${FONTS}');
body{margin:0!important;padding:0!important;background:${C.night};-webkit-text-size-adjust:100%;}
a{text-decoration:none;}
@media (max-width:520px){.lv-pad{padding:30px 22px 6px!important}.lv-foot{padding:20px 22px 28px!important}.lv-h1{font-size:22px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${C.night};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.night};">${text}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.night};background-image:radial-gradient(120% 70% at 50% 0%,#1B1F5C 0%,${C.night} 62%);">
<tr><td align="center" style="padding:40px 14px 36px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td align="center" style="padding:0 0 26px;">
<a href="${site}" style="text-decoration:none;"><img src="${site}/brand/landvas-mark-512.png" width="64" height="64" alt="LANDVAS" style="display:block;margin:0 auto;width:64px;height:64px;border:0;outline:none;"></a>
<div style="margin-top:16px;font-family:${DISPLAY};font-size:20px;line-height:1;font-weight:900;letter-spacing:0.16em;color:#FFFFFF;">LANDVAS</div>
${plotBars()}
</td></tr>

<tr><td style="border-radius:26px;padding:1.5px;background:${C.line};background-image:${SPECTRUM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};background-image:linear-gradient(180deg,${C.raised} 0%,${C.surface} 46%,${C.deep} 100%);border-radius:24.5px;">
<tr><td class="lv-pad" align="center" style="padding:38px 34px 8px;text-align:center;">
<h1 class="lv-h1" style="margin:0 0 12px;font-family:${DISPLAY};font-size:25px;line-height:1.25;font-weight:900;color:${C.text};letter-spacing:-0.005em;">${title}</h1>
<p style="margin:0 0 28px;font-family:${BODY};font-size:15px;line-height:1.6;font-weight:500;color:${C.muted};">${text}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td align="center" style="border-radius:16px;background:#5B3FE0;background-image:linear-gradient(180deg,#8F72FF 0%,#4A2FD6 100%);box-shadow:0 2px 0 #24137A,0 14px 28px -12px rgba(123,92,255,0.85);">
<a href="${shown}" style="display:inline-block;padding:16px 34px;font-family:${BODY};font-size:16px;line-height:1;font-weight:800;color:#FFFFFF;text-decoration:none;border-radius:16px;letter-spacing:0.01em;">${button}</a>
</td></tr></table>
</td></tr>
<tr><td class="lv-foot" align="center" style="padding:26px 34px 34px;text-align:center;">
<p style="margin:0;font-family:${BODY};font-size:12px;line-height:1.55;font-weight:500;color:${C.faint};">If the button doesn’t work, open this link:<br><a href="${shown}" style="color:#9DB2FF;word-break:break-all;text-decoration:underline;">${shown}</a></p>
</td></tr>
</table>
</td></tr>

<tr><td align="center" style="padding:24px 10px 0;text-align:center;">
<p style="margin:0;font-family:${BODY};font-size:12px;line-height:1.6;font-weight:500;color:${C.faint};">Didn’t ask for this? You can ignore this email.<br>LANDVAS LLC · <a href="mailto:contact@landvas.app" style="color:${C.faint};text-decoration:underline;">contact@landvas.app</a> · <a href="${site}" style="color:${C.faint};text-decoration:underline;">landvas.app</a></p>
</td></tr>
</table>

</td></tr></table>
</body></html>`;
}
