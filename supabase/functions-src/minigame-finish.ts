// POST {session_id, log} — replays a minigame move log on the server with the
// same validators the game uses, then records the verified result. Clients never
// submit scores: the server regenerates the level from the session seed.
import { validateMinigame, type GameId } from '../../src/shared/minigames';
import { adminClient, callerId, cors, json, serve } from './shared';

const recent = new Map<string, number[]>();
function limited(uid: string) {
  const now = Date.now();
  const list = (recent.get(uid) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  recent.set(uid, list);
  return list.length > 20;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const admin = adminClient();
    const uid = await callerId(req, admin);
    if (!uid) return json({ error: 'not_authenticated' }, 401);
    if (limited(uid)) return json({ error: 'rate_limited' }, 429);
    const body = await req.json().catch(() => null);
    if (!body?.session_id || typeof body.session_id !== 'string') return json({ error: 'bad_request' }, 400);
    const { data: s, error: se } = await admin.rpc('svc_get_session', { p_session_id: body.session_id });
    if (se || !s || s.player_id !== uid) return json({ error: 'session_not_found' }, 404);
    if (s.status !== 'active') return json({ error: 'session_closed' }, 409);
    const verdict = validateMinigame(s.game as GameId, Number(s.seed), s.level, body.log);
    const { data: r, error: re } = await admin.rpc('svc_finish_minigame', { p_session_id: body.session_id, p_result: verdict });
    if (re) return json({ error: re.message }, 400);
    return json({ ...r, summary: verdict.summary });
  } catch (e) {
    return json({ error: 'minigame_error', detail: String((e as Error)?.message ?? e).slice(0, 200) }, 500);
  }
});
