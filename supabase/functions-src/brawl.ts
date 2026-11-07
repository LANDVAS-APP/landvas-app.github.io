// POST {op, match?, action?} — Paintbrawl: matchmaking, practice bots and every move of every match, decided here with
// the shared rules engine (src/shared/brawl), so no player can cheat.
import { BrawlError, brawlOp, type BrawlBody } from '../../src/shared/brawl/server';
import { adminClient, callerId, cors, json, serve } from './shared';

const recent = new Map<string, number[]>();
function limited(uid: string) {
  const now = Date.now();
  const list = (recent.get(uid) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  recent.set(uid, list);
  return list.length > 150;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const admin = adminClient();
    const uid = await callerId(req, admin);
    if (!uid) return json({ error: 'not_authenticated' }, 401);
    if (limited(uid)) return json({ error: 'rate_limited' }, 429);
    const body = (await req.json().catch(() => null)) as BrawlBody | null;
    const svc = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new BrawlError(error.message);
      return data;
    };
    return json(await brawlOp(svc, uid, body as BrawlBody));
  } catch (e) {
    if (e instanceof BrawlError) return json({ error: e.message }, 400);
    return json({ error: 'brawl_error', detail: String((e as Error)?.message ?? e).slice(0, 200) }, 500);
  }
});
