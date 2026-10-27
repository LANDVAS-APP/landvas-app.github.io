// Minimal HTTP API for the worker: server-side minigame validation.
// The browser never reports a score — it sends the raw move log; this service
// regenerates the level from the session's server-side seed, replays the log
// with the shared validator, and only then records rewards in the database.
import http from 'node:http';
import { validateMinigame } from '../src/shared/minigames';
import type { PipelineDb } from '../src/server/pipeline';

export type AuthVerifier = (token: string) => Promise<string | null>; // returns user id

export function createApi(opts: { db: PipelineDb; verify: AuthVerifier; allowedOrigins: string[]; health: () => Promise<unknown> }) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const allow = (key: string, perMinute = 40) => {
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    buckets.set(key, b);
    return true;
  };

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin ?? '';
    if (origin && (opts.allowedOrigins.includes('*') || opts.allowedOrigins.includes(origin))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
    }
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'OPTIONS') return send(204, {});
      if (req.method === 'GET' && req.url === '/healthz') return send(200, await opts.health());
      if (req.method !== 'POST' || req.url !== '/v1/minigames/finish') return send(404, { error: 'not_found' });

      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const userId = token ? await opts.verify(token) : null;
      if (!userId) return send(401, { error: 'not_authenticated' });
      if (!allow(userId)) return send(429, { error: 'rate_limited' });

      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 512 * 1024) return send(413, { error: 'payload_too_large' });
      }
      const body = JSON.parse(raw || '{}');
      if (typeof body.session_id !== 'string') return send(400, { error: 'session_id_required' });
      const session = await opts.db.call<any>('svc_get_session', { p_session_id: body.session_id });
      if (!session || session.player_id !== userId) return send(404, { error: 'session_not_found' });
      if (session.status !== 'active') return send(409, { error: 'session_closed', status: session.status });

      const verdict = validateMinigame(session.game, Number(session.seed), session.level, body.log);
      const result = await opts.db.call('svc_finish_minigame', { p_session_id: body.session_id, p_result: verdict });
      return send(200, { ...(result as object), summary: verdict.summary });
    } catch (e) {
      const msg = (e as Error).message ?? 'error';
      const code = /session_closed|session_not_found|session_expired/.exec(msg)?.[0];
      return send(code ? 409 : 500, { error: code ?? 'internal_error' });
    }
  });
}
