// Push notifications: what each push says (src/shared/pushText.ts) and how it's sent (supabase/functions-src/pushSend.ts)
// — Apple's ES256 token and its answers (a sandbox address, a dead one, a stale token), Google's OAuth and its answers —
// against a fake fetch. Plus: adding the push plugin leaves the apps' compatibility key alone (it's optional).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pushText, safePushPath, PUSH_KINDS } from '../../src/shared/pushText';
import { Apns, Fcm, mapLimit, secretText, sendTo } from '../../supabase/functions-src/pushSend';
import { nativeCompat, OPTIONAL_PLUGINS } from '../../scripts/native-compat.mjs';

const b64urlDecode = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const pem = (der: ArrayBuffer, label: string) => `-----BEGIN ${label}-----\n${Buffer.from(der).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;
type Call = { url: string; init: RequestInit };
const fakeFetch = (answer: (c: Call) => { status: number; body?: unknown }) => {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const c = { url: String(url), init };
    calls.push(c);
    const a = answer(c);
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status });
  }) as unknown as typeof fetch;
  return { f, calls };
};
const msg = { title: 'T', body: 'B', to: '/world', kind: 'land' };

describe('what a push says', () => {
  it('a push with its own words keeps them', () => {
    expect(pushText({ kind: 'fox', title: '🦊 A fox is at your egg!', body: 'Honk’s egg…', to: '/grimoire/x' })).toEqual({ title: '🦊 A fox is at your egg!', body: 'Honk’s egg…', to: '/grimoire/x' });
  });
  it('bell alerts in the lock screen’s words, with who did it and where tapping goes', () => {
    expect(pushText({ kind: 'friends', alert: { kind: 'friend_request', actor: 'bob' } })).toEqual({ title: '👋 Friend request', body: '@bob sent you a friend request', to: '/social' });
    expect(pushText({ kind: 'leviathan', alert: { kind: 'leviathan', sub: 'fallen', data: { sub: 'fallen', rank: 3, ink: 12500 } } }).body).toBe('Your share: #3 (+12,500 Ink)');
    expect(pushText({ kind: 'land', alert: { kind: 'power', sub: 'whisper', data: { sub: 'whisper', rarity: 'mythic', gx: 5, gy: 6 } } })).toMatchObject({ to: '/world?fly=5,6&z=18' });
    expect(pushText({ kind: 'land', alert: { kind: 'enchant', sub: 'size_prank', data: { sub: 'size_prank', mode: 'grow', hours: 6, gx: 1, gy: 2 }, actor: 'cat' } }).body).toBe('@cat made your plot 100× GIANT on everyone’s map for 6 h');
    expect(pushText({ kind: 'friends', alert: { kind: 'chat_reply', data: { body: 'x'.repeat(200) }, actor: 'ann' } }).body.length).toBeLessThanOrEqual(90);
  });
  it('an alert with no line of its own still says something for its switch', () => {
    for (const k of [...PUSH_KINDS.map((x) => x.id), 'test']) {
      const t = pushText({ kind: k, alert: { kind: 'enchant', sub: 'something_new' } });
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.to.startsWith('/')).toBe(true);
    }
  });
  it('only follows paths inside the game', () => {
    expect(safePushPath('/world?fly=1,2&z=18')).toBe('/world?fly=1,2&z=18');
    expect(safePushPath('https://evil.example')).toBe('/');
    expect(safePushPath('//evil.example/x')).toBe('/');
    expect(safePushPath('javascript:alert(1)')).toBe('/');
    expect(safePushPath(undefined)).toBe('/');
  });
  it('the switches match the database’s', () => {
    const sql = fs.readFileSync('supabase/migrations/20261120000100_phone_push.sql', 'utf8');
    const all = sql.match(/push_kinds_all\(\) returns text\[\] language sql immutable as \$\$ select array\[([^\]]+)\]/)![1];
    const def = sql.match(/push_kinds_default\(\) returns text\[\] language sql immutable as \$\$ select array\[([^\]]+)\]/)![1];
    const list = (s: string) => s.split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(PUSH_KINDS.map((k) => k.id)).toEqual(list(all));
    expect(PUSH_KINDS.filter((k) => k.on).map((k) => k.id)).toEqual(list(def));
  });
});

describe('Apple (APNs)', () => {
  it('signs an ES256 token Apple can check, and sends an alert push to the production server', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const p8 = pem(await crypto.subtle.exportKey('pkcs8', kp.privateKey), 'PRIVATE KEY');
    const { f, calls } = fakeFetch(() => ({ status: 200 }));
    const apns = Apns.fromEnv((k) => ({ APNS_KEY_ID: 'KEY123', APPLE_TEAM_ID: 'TEAM456', APNS_KEY_P8: Buffer.from(p8).toString('base64') } as Record<string, string>)[k] ?? '', f)!;
    expect(await apns.send({ token: 'ab'.repeat(32), platform: 'ios' }, { ...msg, collapse: 'fox-1' })).toEqual({ ok: true });
    const c = calls[0];
    expect(c.url).toBe(`https://api.push.apple.com/3/device/${'ab'.repeat(32)}`);
    const h = c.init.headers as Record<string, string>;
    expect(h['apns-topic']).toBe('com.landvas.app');
    expect(h['apns-push-type']).toBe('alert');
    expect(h['apns-collapse-id']).toBe('fox-1');
    expect(JSON.parse(String(c.init.body))).toMatchObject({ aps: { alert: { title: 'T', body: 'B' } }, to: '/world' });
    const [head, claims, sig] = h.authorization.replace('bearer ', '').split('.');
    expect(JSON.parse(b64urlDecode(head).toString())).toEqual({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(b64urlDecode(claims).toString())).toMatchObject({ iss: 'TEAM456' });
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64urlDecode(sig), new TextEncoder().encode(`${head}.${claims}`))).toBe(true);
    // the token is reused, not made per push
    await apns.send({ token: 'cd'.repeat(32), platform: 'ios' }, msg);
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe(h.authorization);
  });
  it('a sandbox address goes to the sandbox; a dead one is reported dead', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const p8 = pem(await crypto.subtle.exportKey('pkcs8', kp.privateKey), 'PRIVATE KEY');
    const { f, calls } = fakeFetch((c) => (c.url.includes('/device/dead') ? { status: 410, body: { reason: 'Unregistered' } }
      : c.url.includes('sandbox') ? { status: 200 } : { status: 400, body: { reason: 'BadDeviceToken' } }));
    const apns = new Apns({ keyId: 'K', teamId: 'T', p8, topic: 'com.landvas.app' }, f);
    expect(await apns.send({ token: 'dev', platform: 'ios' }, msg)).toEqual({ ok: true, sandbox: true });
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['api.push.apple.com', 'api.sandbox.push.apple.com']);
    expect(await apns.send({ token: 'dead', platform: 'ios' }, msg)).toMatchObject({ ok: false, dead: true });
  });
  it('a stale token is made again once', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const p8 = pem(await crypto.subtle.exportKey('pkcs8', kp.privateKey), 'PRIVATE KEY');
    let n = 0;
    const { f } = fakeFetch(() => (n++ === 0 ? { status: 403, body: { reason: 'ExpiredProviderToken' } } : { status: 200 }));
    const apns = new Apns({ keyId: 'K', teamId: 'T', p8, topic: 'com.landvas.app' }, f);
    expect(await apns.send({ token: 'x', platform: 'ios' }, msg)).toEqual({ ok: true });
    expect(n).toBe(2);
  });
});

describe('Google (Firebase Cloud Messaging v1)', () => {
  it('gets an access token with an RS256 assertion, then sends to the Game alerts channel', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const sa = { project_id: 'landvas-app', client_email: 'push@landvas-app.iam.gserviceaccount.com', private_key: pem(await crypto.subtle.exportKey('pkcs8', kp.privateKey), 'PRIVATE KEY') };
    const { f, calls } = fakeFetch((c) => (c.url.includes('oauth2') ? { status: 200, body: { access_token: 'ya29.x', expires_in: 3599 } } : { status: 200, body: { name: 'm/1' } }));
    const fcm = Fcm.fromEnv((k) => (k === 'FCM_SERVICE_ACCOUNT_JSON' ? Buffer.from(JSON.stringify(sa)).toString('base64') : ''), f)!;
    expect(await sendTo({ fcm }, { token: 'tok', platform: 'android' }, msg)).toEqual({ ok: true });
    const assertion = new URLSearchParams(String(calls[0].init.body)).get('assertion')!;
    const [head, claims, sig] = assertion.split('.');
    expect(JSON.parse(b64urlDecode(claims).toString())).toMatchObject({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging' });
    expect(await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, kp.publicKey, b64urlDecode(sig), new TextEncoder().encode(`${head}.${claims}`))).toBe(true);
    expect(calls[1].url).toBe('https://fcm.googleapis.com/v1/projects/landvas-app/messages:send');
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer ya29.x');
    expect(JSON.parse(String(calls[1].init.body)).message).toMatchObject({ token: 'tok', data: { to: '/world' }, android: { notification: { channel_id: 'landvas_alerts' } } });
    // one access token for many pushes
    await fcm.send({ token: 'tok2', platform: 'android' }, msg);
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(1);
  });
  it('an unregistered address is dead; a malformed request never deletes one', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
    const sa = { project_id: 'p', client_email: 'e', private_key: pem(await crypto.subtle.exportKey('pkcs8', kp.privateKey), 'PRIVATE KEY') };
    const { f } = fakeFetch((c) => (c.url.includes('oauth2') ? { status: 200, body: { access_token: 'a' } }
      : String(c.init.body).includes('"gone"') ? { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }
      : { status: 400, body: { error: { status: 'INVALID_ARGUMENT' } } }));
    const fcm = new Fcm(sa, f);
    expect(await fcm.send({ token: 'gone', platform: 'android' }, msg)).toMatchObject({ ok: false, dead: true, error: 'UNREGISTERED' });
    expect(await fcm.send({ token: 'odd', platform: 'android' }, msg)).toMatchObject({ ok: false, error: 'fcm 400 INVALID_ARGUMENT' });
    expect((await fcm.send({ token: 'odd', platform: 'android' }, msg)).dead).toBeUndefined();
  });
});

describe('plumbing', () => {
  it('no key for a platform: nothing is sent and nothing is dropped', async () => {
    expect(await sendTo({}, { token: 'x', platform: 'ios' }, msg)).toEqual({ ok: false, error: 'no_apns_key' });
    expect(await sendTo({}, { token: 'x', platform: 'android' }, msg)).toEqual({ ok: false, error: 'no_fcm_key' });
    expect(Apns.fromEnv(() => '')).toBeUndefined();
    expect(Fcm.fromEnv(() => 'not json')).toBeUndefined();
  });
  it('keys can arrive base64-encoded or with written-out line breaks', () => {
    expect(secretText(Buffer.from('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----').toString('base64'))).toContain('\nabc\n');
    expect(secretText('-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----')).toContain('\nabc\n');
    expect(secretText('{"a":1}')).toBe('{"a":1}');
  });
  it('runs a few at a time and keeps the order', async () => {
    let live = 0, peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (x) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return x * 2; });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
  it('the push plugin is optional: installed apps keep their compatibility key and their live versions', () => {
    expect(OPTIONAL_PLUGINS).toContain('@capacitor/push-notifications');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies['@capacitor/push-notifications']).toBeTruthy();
    const without = { ...pkg.dependencies };
    delete without['@capacitor/push-notifications'];
    expect(nativeCompat(false, pkg.dependencies)).toBe(nativeCompat(false, without));
    expect(nativeCompat(true, pkg.dependencies)).toBe(nativeCompat(true, without));
    // any other plugin still changes it
    expect(nativeCompat(false, { ...without, '@capacitor/camera': '^8.0.0' })).not.toBe(nativeCompat(false, without));
  });
});
