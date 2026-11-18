// POST /push — sends the push notifications waiting in the database (20261120000100_phone_push.sql). The database
// wakes it through pg_net when something is queued and once a minute while anything is still due; the caller's
// x-landvas-push key is passed on to svc_push_claim, which only answers to the database's own key. Each round claims
// up to 200 pushes, sends them (APNs for iPhones, Firebase for Android, 8 at a time) and reports what happened, so
// dead addresses are dropped and sandbox ones remembered. Keys: see pushSend.ts.
import { pushText, safePushPath } from '../../src/shared/pushText';
import { Apns, Fcm, mapLimit, sendTo, type PushDevice, type Senders } from './pushSend';
import { adminClient, cors, env, json, serve } from './shared';

type Item = { id: number; kind: string; title?: string; body?: string; to?: string; alert?: any; devices: PushDevice[] };

let senders: Senders | null = null; // kept while the worker stays warm (their tokens are cached inside)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = req.headers.get('x-landvas-push') ?? '';
  if (!key) return json({ error: 'forbidden' }, 403);
  senders ??= { apns: Apns.fromEnv(env), fcm: Fcm.fromEnv(env) };
  const admin = adminClient();
  const started = Date.now();
  let pushes = 0, delivered = 0;
  for (let round = 0; round < 10 && Date.now() - started < 40_000; round++) {
    const { data, error } = await admin.rpc('svc_push_claim', { p_key: key, p_limit: 200 });
    if (error) return json({ error: error.message }, /forbidden/.test(error.message) ? 403 : 500);
    const items = ((data as { items?: Item[] } | null)?.items ?? []);
    if (!items.length) break;
    const results = await mapLimit(items, 8, async (it) => {
      const t = pushText(it);
      const msg = { title: t.title, body: t.body, to: safePushPath(t.to), kind: it.kind, collapse: it.kind === 'fox' ? `fox-${it.id}` : undefined, ttl: it.kind === 'fox' ? 25 * 60 : 3600 };
      const sent = await Promise.all(it.devices.map((d) => sendTo(senders!, d, msg)));
      const ok = sent.filter((r) => r.ok).length;
      delivered += ok;
      return {
        id: it.id, sent: ok,
        error: ok ? undefined : sent.find((r) => r.error)?.error ?? 'failed',
        dead: it.devices.filter((_, i) => sent[i].dead).map((d) => d.token),
        sandbox: it.devices.filter((_, i) => sent[i].sandbox).map((d) => d.token),
      };
    });
    const done = await admin.rpc('svc_push_done', { p_key: key, p_results: results });
    if (done.error) return json({ error: done.error.message }, 500);
    pushes += items.length;
    if (items.length < 200) break;
  }
  return json({ ok: true, pushes, delivered, apns: !!senders.apns, fcm: !!senders.fcm });
});
