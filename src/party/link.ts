// A party link opened before signing up (or before confirming an email) is kept on this device and joined once the
// player can play. No imports: the boot code reads the address with this before anything else loads.
export const PARTY_CODE = /^[A-Za-z0-9]{6}$/;
// a party link opened before signing up (or before confirming an email): joined once the player can play
const PENDING = 'landvas.party';
const MAX_AGE = 7 * 864e5;
/** read /party/CODE from the address (call before the router starts); the page itself still shows the party */
export function capturePartyLink() {
  try {
    // /party/CODE, or /party/join?c=CODE
    const m = location.pathname.match(/^\/party\/([A-Za-z0-9]{6})\/?$/);
    const q = /^\/party\/join\/?$/.test(location.pathname) ? new URLSearchParams(location.search).get('c') : null;
    const code = m?.[1] ?? (q && PARTY_CODE.test(q) ? q : null);
    if (code) localStorage.setItem(PENDING, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
  } catch { /* storage blocked */ }
}
export function savePendingParty(code: string) {
  try { localStorage.setItem(PENDING, JSON.stringify({ code: code.toUpperCase(), at: Date.now() })); } catch { /* storage blocked */ }
}
export function pendingParty(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING) ?? 'null') as { code: string; at: number } | null;
    return v?.code && Date.now() - v.at < MAX_AGE && PARTY_CODE.test(v.code) ? v.code : null;
  } catch { return null; }
}
export function clearPendingParty() {
  try { localStorage.removeItem(PENDING); } catch { /* ignore */ }
}

