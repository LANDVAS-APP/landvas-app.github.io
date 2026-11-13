import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { authEmails, artUrls, confirmLink, COPY, emailArt, SHARED } from '../../scripts/auth-emails.mjs';
import { linkKind, nextPath, parseEmailLink } from '../../src/lib/emailLink';

const TEMPLATES = {
  mailer_templates_confirmation_content: 'signup',
  mailer_templates_recovery_content: 'recovery',
  mailer_templates_magic_link_content: 'magiclink',
  mailer_templates_email_change_content: 'email_change',
} as const;

describe('LANDVAS auth emails', () => {
  const emails = authEmails();

  it('every button and fallback link is a landvas.app link, never the Supabase project address', () => {
    for (const [key, type] of Object.entries(TEMPLATES)) {
      const html = emails[key];
      const want = `https://landvas.app/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`;
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.includes('/auth/confirm'));
      expect(links, key).toEqual([want, want]); // the button and the "open this link" fallback
      expect(html, key).not.toMatch(/ConfirmationURL|supabase\.co|\{\{\s*\.SiteURL/);
    }
  });

  it('keeps the confirmation email’s subject and words', () => {
    expect(emails.mailer_subjects_confirmation).toBe('Confirm your email to start playing LANDVAS');
    const html = emails.mailer_templates_confirmation_content;
    expect(html).toContain('Welcome to LANDVAS');
    expect(html).toContain('One tap and you’re in. Confirm your email to claim your first free plots, paint them, and start earning.');
    expect(html).toContain('Confirm my email');
  });

  it('every word is drawn in the brand fonts, from the current copy, and the art is in public/', () => {
    const art = emailArt();
    for (const [id, c] of Object.entries(COPY)) {
      expect(art[`${id}-title`].text).toBe(c.title);
      expect(art[`${id}-text`].text).toBe(c.text);
      expect(art[`${id}-button`].text).toBe(c.button);
    }
    for (const [k, t] of Object.entries(SHARED)) expect(art[k].text).toBe(t);
    for (const a of Object.values(art)) {
      const f = path.resolve(__dirname, '../../public', a.file);
      expect(fs.existsSync(f), a.file).toBe(true);
      expect(fs.readFileSync(f).subarray(1, 4).toString()).toBe('PNG');
      expect(a.file).toMatch(/^email\/[a-z_-]+-[0-9a-f]{10}\.png$/); // content-hashed: mail apps never show stale art
    }
    expect(artUrls().every((u) => u.startsWith('https://landvas.app/email/'))).toBe(true);
  });

  it('shows the crisp LANDVAS header and keeps the words as alt text (images off still reads)', () => {
    const html = emails.mailer_templates_confirmation_content;
    expect(html).toContain(`src="https://landvas.app/${emailArt().header.file}"`);
    expect(html).toContain('alt="Welcome to LANDVAS"');
    expect(html).toContain('alt="Confirm my email"');
    expect(html).toMatch(/font-family:'Unbounded'/);
    expect(html).toMatch(/font-family:'Manrope'/);
    expect(html).toContain('LANDVAS LLC · contact@landvas.app');
  });

  it('ships a BIMI-ready logo and a round-safe sender picture', () => {
    const svg = fs.readFileSync(path.resolve(__dirname, '../../public/bimi/landvas.svg'), 'utf8');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 512 512"><title>LANDVAS<\/title>/);
    expect(svg).not.toMatch(/<script|<image|xlink:href|filter=| opacity=|<svg[^>]* (x|y|width|height)=/);
    expect(Buffer.byteLength(svg)).toBeLessThan(32 * 1024);
    const png = fs.readFileSync(path.resolve(__dirname, '../../public/brand/landvas-avatar-1024.png'));
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
  });

  it('builds the link for another base address when asked', () => {
    expect(confirmLink('signup', 'https://staging.landvas.app/')).toBe('https://staging.landvas.app/auth/confirm?token_hash={{ .TokenHash }}&type=signup');
  });
});

describe('landvas.app/auth/confirm', () => {
  it('reads the code and kind from the address', () => {
    expect(parseEmailLink('?token_hash=pkce_0123456789abcdef&type=signup')).toEqual({ tokenHash: 'pkce_0123456789abcdef', type: 'signup' });
    expect(parseEmailLink('token_hash=0123456789abcdef0123&type=recovery')?.type).toBe('recovery');
  });

  it('turns away broken or unknown links without calling the server', () => {
    expect(parseEmailLink('')).toBeNull();
    expect(parseEmailLink('?type=signup')).toBeNull();
    expect(parseEmailLink('?token_hash={{ .TokenHash }}&type=signup')).toBeNull(); // template never filled in
    expect(parseEmailLink('?token_hash=0123456789abcdef&type=phone_change')).toBeNull();
    expect(parseEmailLink('?token_hash=0123456789abcdef')).toBeNull();
  });

  it('sends each kind of link to a fixed place in the game', () => {
    expect(nextPath('signup')).toBe('/world');
    expect(nextPath('email')).toBe('/world');
    expect(nextPath('magiclink')).toBe('/world');
    expect(nextPath('recovery')).toBe('/reset-password');
    expect(nextPath('email_change')).toBe('/settings');
    expect(linkKind('invite')).toBe('confirm');
  });
});
