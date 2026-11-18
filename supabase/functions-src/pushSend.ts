// Sending one push to Apple (APNs) or Google (Firebase Cloud Messaging v1). Used by push.ts; kept apart so the tests
// can run it against a fake fetch. Only web standards (fetch, WebCrypto), so it runs the same in Deno and Node.
//
// Keys (Edge Function secrets, set by the deploy from GitHub secrets — docs/STORE-LAUNCH.md §9):
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8   an APNs auth key (.p8) from developer.apple.com → Keys
//   APNS_TOPIC                               the app's bundle id (default com.landvas.app)
//   FCM_SERVICE_ACCOUNT_JSON                 a Firebase service account (Project settings → Service accounts)
// Values may be given as they are or base64-encoded (the deploy encodes them so line breaks survive).

export type PushDevice = { token: string; platform: 'ios' | 'android'; env?: 'production' | 'sandbox' };
export type PushMessage = { title: string; body: string; to: string; kind: string; collapse?: string; ttl?: number };
export type SendResult = { ok: boolean; dead?: boolean; sandbox?: boolean; error?: string };
export type Senders = { apns?: Apns; fcm?: Fcm };
type Fetch = typeof fetch;

const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? enc.encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
/** a secret as it was meant: PEM/JSON as is, or base64 of it; "\n" written out becomes a real line break */
export function secretText(v: string | undefined | null) {
  const s = (v ?? '').trim();
  if (!s) return '';
  if (s.startsWith('-----BEGIN') || s.startsWith('{')) return s.replace(/\\n/g, '\n');
  try { return atob(s.replace(/\s+/g, '')).trim(); } catch { return s; }
}
function pemBytes(pem: string) {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function signJwt(header: object, claims: object, key: CryptoKey, alg: AlgorithmIdentifier | EcdsaParams) {
  const head = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(alg, key, enc.encode(head)); // ECDSA: raw r‖s, which is what ES256 wants
  return `${head}.${b64url(sig)}`;
}

// ---- Apple --------------------------------------------------------------------------------------------------------
export class Apns {
  private jwt: { token: string; at: number } | null = null;
  private key: Promise<CryptoKey> | null = null;
  constructor(private o: { keyId: string; teamId: string; p8: string; topic: string }, private http: Fetch = fetch) {}

  static fromEnv(get: (k: string) => string, http?: Fetch) {
    const keyId = get('APNS_KEY_ID'), teamId = get('APNS_TEAM_ID') || get('APPLE_TEAM_ID'), p8 = secretText(get('APNS_KEY_P8'));
    return keyId && teamId && p8 ? new Apns({ keyId, teamId, p8, topic: get('APNS_TOPIC') || 'com.landvas.app' }, http) : undefined;
  }

  /** Apple wants a fresh token at most every 60 minutes and no more often than every 20 */
  async token(force = false) {
    const now = Math.floor(Date.now() / 1000);
    if (!force && this.jwt && now - this.jwt.at < 45 * 60) return this.jwt.token;
    this.key ??= crypto.subtle.importKey('pkcs8', pemBytes(this.o.p8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const token = await signJwt({ alg: 'ES256', kid: this.o.keyId }, { iss: this.o.teamId, iat: now }, await this.key, { name: 'ECDSA', hash: 'SHA-256' });
    this.jwt = { token, at: now };
    return token;
  }

  private async post(host: string, device: string, m: PushMessage, retried = false): Promise<{ status: number; reason: string }> {
    const payload = { aps: { alert: { title: m.title, body: m.body }, sound: 'default', 'thread-id': m.kind }, to: m.to, kind: m.kind };
    const headers: Record<string, string> = {
      authorization: `bearer ${await this.token(retried)}`,
      'apns-topic': this.o.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + (m.ttl ?? 3600)),
      'content-type': 'application/json',
    };
    if (m.collapse) headers['apns-collapse-id'] = m.collapse.slice(0, 64);
    const res = await this.http(`https://${host}/3/device/${device}`, { method: 'POST', headers, body: JSON.stringify(payload) });
    let reason = '';
    if (res.status !== 200) { try { reason = ((await res.json()) as { reason?: string }).reason ?? ''; } catch { /* no body */ } }
    // a token Apple says is stale (it refreshes them) is made again once
    if (res.status === 403 && /ExpiredProviderToken/.test(reason) && !retried) return this.post(host, device, m, true);
    return { status: res.status, reason };
  }

  async send(d: PushDevice, m: PushMessage): Promise<SendResult> {
    const first = d.env === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const other = d.env === 'sandbox' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
    try {
      let r = await this.post(first, d.token, m);
      if (r.status === 200) return { ok: true };
      // a build run from Xcode has a sandbox address (and the other way round): try the other server once
      if (r.status === 400 && r.reason === 'BadDeviceToken') {
        r = await this.post(other, d.token, m);
        if (r.status === 200) return { ok: true, sandbox: other.includes('sandbox') };
        return { ok: false, dead: true, error: 'BadDeviceToken' };
      }
      if (r.status === 410 || r.reason === 'Unregistered' || r.reason === 'DeviceTokenNotForTopic') return { ok: false, dead: true, error: r.reason || 'Unregistered' };
      return { ok: false, error: `apns ${r.status} ${r.reason}`.trim() };
    } catch (e) {
      return { ok: false, error: `apns ${(e as Error).message ?? e}`.slice(0, 80) };
    }
  }
}

// ---- Google -------------------------------------------------------------------------------------------------------
type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
export class Fcm {
  private access: { token: string; exp: number } | null = null;
  private key: Promise<CryptoKey> | null = null;
  constructor(private sa: ServiceAccount, private http: Fetch = fetch) {}

  static fromEnv(get: (k: string) => string, http?: Fetch) {
    const raw = secretText(get('FCM_SERVICE_ACCOUNT_JSON'));
    if (!raw) return undefined;
    try {
      const sa = JSON.parse(raw) as ServiceAccount;
      return sa.project_id && sa.client_email && sa.private_key ? new Fcm(sa, http) : undefined;
    } catch { return undefined; }
  }

  async token() {
    const now = Math.floor(Date.now() / 1000);
    if (this.access && this.access.exp - now > 300) return this.access.token;
    this.key ??= crypto.subtle.importKey('pkcs8', pemBytes(this.sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const aud = this.sa.token_uri || 'https://oauth2.googleapis.com/token';
    const assertion = await signJwt({ alg: 'RS256', typ: 'JWT' },
      { iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud, iat: now, exp: now + 3600 }, await this.key, { name: 'RSASSA-PKCS1-v1_5' });
    const res = await this.http(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}` });
    if (!res.ok) throw new Error(`fcm auth ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in?: number };
    this.access = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
    return j.access_token;
  }

  async send(d: PushDevice, m: PushMessage): Promise<SendResult> {
    try {
      const message = {
        token: d.token,
        notification: { title: m.title, body: m.body },
        data: { to: m.to, kind: m.kind },
        android: {
          priority: 'HIGH', ttl: `${m.ttl ?? 3600}s`, ...(m.collapse ? { collapse_key: m.collapse.slice(0, 64) } : {}),
          notification: { channel_id: 'landvas_alerts', icon: 'ic_stat_landvas', color: '#7B5CFF', sound: 'default', ...(m.collapse ? { tag: m.collapse.slice(0, 64) } : {}) },
        },
      };
      const res = await this.http(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
        method: 'POST', headers: { authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ message }),
      });
      if (res.ok) return { ok: true };
      let code = '';
      try {
        const j = (await res.json()) as { error?: { status?: string; details?: { errorCode?: string }[] } };
        code = j.error?.details?.find((x) => x.errorCode)?.errorCode ?? j.error?.status ?? '';
      } catch { /* no body */ }
      // gone for good (an INVALID_ARGUMENT may be our own mistake, so it never deletes an address)
      if (res.status === 404 || code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH') return { ok: false, dead: true, error: code || 'UNREGISTERED' };
      return { ok: false, error: `fcm ${res.status} ${code}`.trim() };
    } catch (e) {
      return { ok: false, error: `fcm ${(e as Error).message ?? e}`.slice(0, 80) };
    }
  }
}

/** one push to one phone, with whichever sender its platform needs */
export function sendTo(s: Senders, d: PushDevice, m: PushMessage): Promise<SendResult> {
  if (d.platform === 'ios') return s.apns ? s.apns.send(d, m) : Promise.resolve({ ok: false, error: 'no_apns_key' });
  return s.fcm ? s.fcm.send(d, m) : Promise.resolve({ ok: false, error: 'no_fcm_key' });
}

/** run at most n at a time */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
