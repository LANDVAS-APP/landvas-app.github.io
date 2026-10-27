// Invite codes arrive as ?ref=CODE links. The code is kept on this device until
// the new player has finished signing up, then redeemed once.
const KEY = 'landvas.ref';
const MAX_AGE_MS = 14 * 864e5;

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20);

/** Read ?ref= from the address (call before the router starts) and tidy the URL. */
export function captureReferral() {
  try {
    const url = new URL(location.href);
    const raw = url.searchParams.get('ref');
    if (raw === null) return;
    const code = normalizeCode(raw);
    if (code.length >= 3) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    url.searchParams.delete('ref');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  } catch {
    /* storage or history blocked */
  }
}

export function pendingReferral(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code: string; at: number } | null;
    if (!v?.code || Date.now() - v.at > MAX_AGE_MS) return null;
    return v.code;
  } catch {
    return null;
  }
}

export function clearPendingReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
