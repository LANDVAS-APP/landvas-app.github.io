// GET /admob-ssv?... — AdMob's server-side verification callback for rewarded ads.
// Google calls this after a player finishes watching a rewarded ad. We check Google's signature
// (ECDSA P-256 over the query string, keys from gstatic), then grant the reward once per
// transaction id. A reward can only come from here, so it can't be faked from the app.
// Set this URL as the "server-side verification" callback on each rewarded ad unit in AdMob:
//   https://<project>.supabase.co/functions/v1/admob-ssv
import { adminClient, serve } from './shared';

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
let keys: { at: number; byId: Map<string, CryptoKey> } | null = null;

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function verifierKeys() {
  if (keys && Date.now() - keys.at < 6 * 3600_000) return keys.byId;
  const res = await fetch(KEYS_URL);
  if (!res.ok) throw new Error(`keys ${res.status}`);
  const j = (await res.json()) as { keys: { keyId: number; base64: string }[] };
  const byId = new Map<string, CryptoKey>();
  for (const k of j.keys) {
    byId.set(String(k.keyId), await crypto.subtle.importKey('spki', b64(k.base64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
  }
  keys = { at: Date.now(), byId };
  return byId;
}

/** DER-encoded ECDSA signature → the raw r‖s form WebCrypto expects */
function derToRaw(der: Uint8Array) {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => { i++; const len = der[i++]; const v = der.slice(i, i + len); i += len; return v; };
  const fix = (v: Uint8Array) => { while (v.length > 32 && v[0] === 0) v = v.slice(1); const out = new Uint8Array(32); out.set(v, 32 - v.length); return out; };
  const r = fix(read()), s = fix(read());
  const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32);
  return raw;
}

serve(async (req) => {
  const url = new URL(req.url);
  const q = url.search.slice(1);
  const sigAt = q.indexOf('&signature=');
  // AdMob's console sends an empty test ping when you save the URL
  if (sigAt < 0) return new Response('ok', { status: 200 });
  const message = new TextEncoder().encode(q.slice(0, sigAt));
  const p = url.searchParams;
  const signature = p.get('signature') ?? '', keyId = p.get('key_id') ?? '';
  try {
    const key = (await verifierKeys()).get(keyId);
    if (!key) return new Response('unknown key', { status: 400 });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(b64(signature)), message);
    if (!ok) return new Response('bad signature', { status: 400 });
  } catch (e) {
    return new Response(`verify failed: ${(e as Error).message}`, { status: 500 });
  }
  const player = p.get('user_id') ?? '', custom = p.get('custom_data') ?? '', tx = p.get('transaction_id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(player) || !tx) return new Response('missing user or transaction', { status: 400 });
  const { data, error } = await adminClient().rpc('svc_ad_verified', { p_player_id: player, p_custom: custom, p_network: `admob:${p.get('ad_network') ?? ''}`.slice(0, 40), p_transaction_id: tx });
  // 200 even when the reward can't be given (daily cap, already used): AdMob shouldn't retry those
  if (error) return new Response(`not granted: ${error.message}`, { status: /ads_disabled|cap|invalid|unknown|not_owner|used/.test(error.message) ? 200 : 500 });
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
});
