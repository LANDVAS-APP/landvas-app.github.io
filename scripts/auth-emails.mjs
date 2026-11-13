// LANDVAS's sign-up / sign-in emails (Supabase Auth templates), in the crisp LANDVAS brand: the five-plot L mark,
// the wordmark with its plot bars, the night card with the spectrum rim — and every word in the brand fonts
// (Unbounded titles, Manrope text). Gmail, Outlook and most phone mail apps ignore web fonts, so the words are crisp
// images drawn by scripts/make-email-art.mjs (listed in scripts/email-art.json); each image carries its words as
// alt text, so the email still reads with images off. Change words here, then run: node scripts/make-email-art.mjs
//
// Every button goes to a LANDVAS address (https://landvas.app/auth/confirm?token_hash=…&type=…), never to the
// Supabase project's own *.supabase.co/auth/v1/verify link. That page (src/screens/AuthConfirm.tsx) checks the
// one-time code with Supabase and lands the player in the right place. {{ .TokenHash }} is filled in by Supabase.
import fs from 'node:fs';

export const LINK_BASE = 'https://landvas.app';
/** widest line of text art, in CSS px (fits a phone-width card without shrinking) */
export const ART_WIDTH = 320;

/** the words of each email (the art is drawn from these) */
export const COPY = {
  confirmation: {
    subject: 'Confirm your email to start playing LANDVAS', type: 'signup',
    title: 'Welcome to LANDVAS',
    text: 'One tap and you’re in. Confirm your email to claim your first free plots, paint them, and start earning.',
    button: 'Confirm my email',
  },
  recovery: {
    subject: 'Reset your LANDVAS password', type: 'recovery',
    title: 'Choose a new password',
    text: 'Someone (hopefully you) asked to reset the password for this LANDVAS account. The link works once and expires soon.',
    button: 'Reset my password',
  },
  // sent for a sign-in link and for players confirming an email they never confirmed: one tap does both
  magic_link: {
    subject: 'Confirm it’s you on LANDVAS', type: 'magiclink',
    title: 'Confirm it’s you',
    text: 'Tap below to confirm your email and jump straight back into LANDVAS. The link works once and expires soon.',
    button: 'Confirm my email',
  },
  email_change: {
    subject: 'Confirm your new LANDVAS email', type: 'email_change',
    title: 'Confirm your new email',
    text: 'Tap below to use this address for your LANDVAS account.',
    button: 'Confirm new email',
  },
};
/** the small print, the same in every email */
export const SHARED = {
  fallback: 'If the button doesn’t work, open this link:',
  ignore: 'Didn’t ask for this? You can ignore this email.',
  company: 'LANDVAS LLC · contact@landvas.app',
};

const C = { night: '#070B1C', deep: '#0B1230', surface: '#10183A', raised: '#172253', line: '#26346F', text: '#EEF1FF', muted: '#A1ABD6', faint: '#6F7AAE' };
const SPECTRUM = 'linear-gradient(135deg,#FF4D6D 0%,#FF9F1C 22%,#FFE14D 42%,#3DDC97 62%,#34C3FF 80%,#8B6BFF 100%)';
// only for alt text (images off) and the one live line, the link itself
const DISPLAY = "'Unbounded','Arial Black',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

let manifest = null;
/** the drawn words (scripts/email-art.json) */
export function emailArt() {
  manifest ??= JSON.parse(fs.readFileSync(new URL('./email-art.json', import.meta.url), 'utf8'));
  return manifest;
}

/** the landvas.app address an email's button opens */
export function confirmLink(type, base = LINK_BASE) {
  return `${base.replace(/\/$/, '')}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`;
}

/** the Supabase Auth settings for LANDVAS's four emails (subjects + bodies) */
export function authEmails(base = LINK_BASE) {
  const out = {};
  for (const [id, c] of Object.entries(COPY)) {
    out[`mailer_subjects_${id}`] = c.subject;
    out[`mailer_templates_${id}_content`] = email(id, confirmLink(c.type, base), base);
  }
  return out;
}

/** every image an email shows, as full addresses (the deploy waits until they're live before switching emails) */
export function artUrls(base = LINK_BASE) {
  return Object.values(emailArt()).map((a) => `${base.replace(/\/$/, '')}/${a.file}`);
}

/** one drawn line of words: the image, with its words as alt text styled for when images are off */
function art(key, base, altStyle) {
  const a = emailArt()[key];
  if (!a) throw new Error(`email art "${key}" is missing — run: node scripts/make-email-art.mjs`);
  const site = base.replace(/\/$/, '');
  return `<img src="${site}/${a.file}" width="${a.width}" height="${a.height}" alt="${a.text.replace(/"/g, '&quot;')}" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:${a.width}px;max-width:100%;height:auto;${altStyle}">`;
}

export function email(id, url, base = LINK_BASE) {
  const c = COPY[id];
  const a = emailArt();
  for (const [k, want] of [[`${id}-title`, c.title], [`${id}-text`, c.text], [`${id}-button`, c.button], ...Object.entries(SHARED)]) {
    if (a[k]?.text !== want) throw new Error(`email art for "${k}" is out of date — run: node scripts/make-email-art.mjs`);
  }
  const site = base.replace(/\/$/, '');
  const shown = url.replace(/&/g, '&amp;');
  const small = `font-family:${BODY};font-size:12px;line-height:1.55;font-weight:500;color:${C.faint};text-align:center;`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${c.title}</title>
<style>
body{margin:0!important;padding:0!important;background:${C.night};-webkit-text-size-adjust:100%;}
a{text-decoration:none;}
img{-ms-interpolation-mode:bicubic;}
@media (max-width:520px){.lv-pad{padding:30px 20px 6px!important}.lv-foot{padding:20px 20px 28px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${C.night};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.night};">${c.text}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.night};background-image:radial-gradient(120% 70% at 50% 0%,#1B1F5C 0%,${C.night} 62%);">
<tr><td align="center" style="padding:40px 14px 36px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td align="center" style="padding:0 0 26px;">
<a href="${site}" style="text-decoration:none;">${art('header', base, `font-family:${DISPLAY};font-size:20px;font-weight:900;letter-spacing:0.16em;color:#FFFFFF;text-align:center;`)}</a>
</td></tr>

<tr><td style="border-radius:26px;padding:1.5px;background:${C.line};background-image:${SPECTRUM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};background-image:linear-gradient(180deg,${C.raised} 0%,${C.surface} 46%,${C.deep} 100%);border-radius:24.5px;">
<tr><td class="lv-pad" align="center" style="padding:38px 34px 8px;text-align:center;">
${art(`${id}-title`, base, `font-family:${DISPLAY};font-size:25px;line-height:1.25;font-weight:900;color:${C.text};text-align:center;`)}
<div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>
${art(`${id}-text`, base, `font-family:${BODY};font-size:15px;line-height:1.6;font-weight:500;color:${C.muted};text-align:center;`)}
<div style="height:28px;line-height:28px;font-size:28px;">&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td align="center" bgcolor="#5B3FE0" style="border-radius:16px;background:#5B3FE0;background-image:linear-gradient(180deg,#8F72FF 0%,#4A2FD6 100%);box-shadow:0 2px 0 #24137A,0 14px 28px -12px rgba(123,92,255,0.85);">
<a href="${shown}" style="display:inline-block;padding:15px 32px;border-radius:16px;text-decoration:none;">${art(`${id}-button`, base, `font-family:${BODY};font-size:16px;line-height:1.25;font-weight:800;color:#FFFFFF;text-align:center;`)}</a>
</td></tr></table>
</td></tr>
<tr><td class="lv-foot" align="center" style="padding:26px 34px 34px;text-align:center;">
${art('fallback', base, small)}
<p style="margin:2px 0 0;font-family:${BODY};font-size:12px;line-height:1.55;font-weight:500;color:${C.faint};"><a href="${shown}" style="color:#9DB2FF;word-break:break-all;text-decoration:underline;">${shown}</a></p>
</td></tr>
</table>
</td></tr>

<tr><td align="center" style="padding:24px 10px 0;text-align:center;">
${art('ignore', base, small)}
<a href="mailto:contact@landvas.app" style="text-decoration:none;">${art('company', base, small)}</a>
</td></tr>
</table>

</td></tr></table>
</body></html>`;
}
