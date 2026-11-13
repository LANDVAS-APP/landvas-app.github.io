import { describe, expect, it } from 'vitest';
import { authEmails, confirmLink } from '../../scripts/auth-emails.mjs';
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

  it('is in the LANDVAS brand: crisp mark, plot colours, Unbounded + Manrope', () => {
    const html = emails.mailer_templates_confirmation_content;
    expect(html).toContain('https://landvas.app/brand/landvas-mark-512.png');
    for (const c of ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF']) expect(html).toContain(c);
    expect(html).toMatch(/font-family:'Unbounded'/);
    expect(html).toMatch(/font-family:'Manrope'/);
    expect(html).toContain('LANDVAS LLC');
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
