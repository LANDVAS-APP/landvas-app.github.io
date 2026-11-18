// The CDN (cdn.landvas.app, cdn/worker.js). What every player reads the same — the Leviathan, the hot zone, the map's
// giants and wormholes, primordial plots, trains and planes in the air — comes from world snapshots Cloudflare serves,
// instead of each player asking the database; and public pictures come through it too (free bandwidth). The deploy
// switches it on in the app config ('cdn') once the worker answers; until then, or whenever it doesn't answer, every
// screen asks the database the old way. Nothing here is personal: a player's own part is always a database call.
import { config } from '../env';

let base: string | null = null;
let pictures = false;
let failures = 0, pausedUntil = 0;
let skew = 0; // server clock − ours (ms), from any server_time we see

/** from the app config: { enabled, url, pictures } (pictures: public pictures through the CDN too — off by default) */
export function setCdn(c: { enabled?: boolean; url?: string; pictures?: boolean } | null | undefined) {
  base = config.backend === 'supabase' && c?.enabled && typeof c.url === 'string' && /^https:\/\//.test(c.url) ? c.url.replace(/\/$/, '') : null;
  pictures = !!base && c?.pictures === true;
}
export const cdnOn = () => !!base && Date.now() >= pausedUntil;
/** a server time seen in an answer: snapshots' ages are judged on the server's clock, not the phone's */
export function noteServerTime(iso: string | null | undefined, sentAt: number) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isFinite(t)) skew = t - (sentAt + Date.now()) / 2;
}
const failed = () => { if (++failures >= 3) { pausedUntil = Date.now() + 5 * 60_000; failures = 0; } };

/**
 * A world snapshot, or null (no CDN, unreachable, or older than `maxAgeMs`): the caller then asks the database.
 * Three failures in a row and the CDN is left alone for five minutes, so a CDN that's down never doubles the calls.
 */
export async function cdnSnapshot<T extends object>(key: string, maxAgeMs: number): Promise<(T & { built_at: string }) | null> {
  if (!cdnOn()) return null;
  try {
    const t0 = Date.now();
    const r = await fetch(`${base}/w/${key}.json`);
    if (!r.ok) { failed(); return null; }
    // the CDN's clock when it answered (Cloudflare's, which is right): how far off this phone's clock is
    const now = Number(r.headers.get('x-now'));
    if (Number.isFinite(now) && now > 0) skew = now - (t0 + Date.now()) / 2;
    const j = (await r.json()) as T & { built_at?: string };
    const age = Date.now() + skew - Date.parse(j?.built_at ?? '');
    if (!(age < maxAgeMs)) return null; // (not a failure: the next one will be fresher)
    failures = 0;
    return j as T & { built_at: string };
  } catch {
    failed();
    return null;
  }
}

/** server clock − this phone's (ms), as last seen */
export const cdnSkew = () => skew;

/** a public picture's address through the CDN (null: use Storage's own address) */
export function cdnPicture(bucket: 'avatars' | 'invite-cards' | 'public-art', path: string): string | null {
  if (!base || !pictures) return null;
  return `${base}/i/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** (for tests) */
export function resetCdn() { base = null; pictures = false; failures = 0; pausedUntil = 0; skew = 0; }
