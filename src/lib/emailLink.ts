// landvas.app/auth/confirm?token_hash=…&type=… — where every LANDVAS email button lands
// (see scripts/auth-emails.mjs). The page checks the one-time code with Supabase Auth and
// then sends the player on. Kept here, apart from the screen, so it can be unit-tested.

export const EMAIL_LINK_TYPES = ['signup', 'email', 'magiclink', 'recovery', 'email_change', 'invite'] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

export type EmailLink = { tokenHash: string; type: EmailLinkType };

/** read the code and kind of link from the page address; null when it isn't a usable link */
export function parseEmailLink(search: string): EmailLink | null {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const tokenHash = (q.get('token_hash') || '').trim();
  const type = (q.get('type') || '').trim() as EmailLinkType;
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(tokenHash)) return null; // never a real code: don't even ask
  if (!EMAIL_LINK_TYPES.includes(type)) return null;
  return { tokenHash, type };
}

/** what each kind of link is for, in the words the page uses */
export function linkKind(type: EmailLinkType): 'confirm' | 'signin' | 'reset' | 'email_change' {
  if (type === 'recovery') return 'reset';
  if (type === 'magiclink') return 'signin';
  if (type === 'email_change') return 'email_change';
  return 'confirm';
}

/** where the player goes once the link has worked (fixed per kind: the link can't send them anywhere else) */
export function nextPath(type: EmailLinkType): string {
  switch (linkKind(type)) {
    case 'reset': return '/reset-password';
    case 'signin': return '/world';
    case 'email_change': return '/settings';
    default: return '/world';
  }
}
