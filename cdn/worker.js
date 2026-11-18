// cdn.landvas.app — LANDVAS's CDN (Cloudflare Worker, deployed by the "Deploy LANDVAS" workflow with wrangler).
// Cloudflare serves what's here at no bandwidth cost, so what everyone reads goes through it instead of the database:
//
//   GET /w/<key>.json   a world snapshot (the Leviathan, the hot zone, the map's giants and wormholes, the primordial
//                       plots, trains and planes in the air): the public view from world_snapshot(), asked of the
//                       database at most once per few seconds per Cloudflare location, then served from its cache.
//                       A slightly old copy is served while a fresh one is fetched, so nobody waits on the database.
//   GET /i/<bucket>/<path>  a picture from Supabase Storage's public buckets (artwork, tiles, avatars, invite cards),
//                       cached at the edge, so each one leaves Supabase once per location instead of once per view.
//   GET /health         for the deploy's check.
//
// Only public data passes through: snapshots are what anyone signed out could see, and the buckets are public.

/** how long a snapshot is fresh (s), and how long an older one may still be served while it's refreshed (s) */
export const SNAPSHOTS = {
  leviathan: { fresh: 5, stale: 60 },
  hot_zone: { fresh: 60, stale: 600 },
  enchant_world: { fresh: 15, stale: 120 },
  primordials: { fresh: 30, stale: 300 },
  travel: { fresh: 15, stale: 120 },
};
/** public buckets, and how long their pictures keep (s): content-addressed names never change */
export const BUCKETS = {
  avatars: 31_536_000,
  'invite-cards': 31_536_000,
  'public-art': 86_400,
};
const ART_IMMUTABLE = /^tiles\//; // tiles carry their revision in the path

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'x-now, x-cdn' };

const withHeaders = (res, extra) => {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...CORS, ...extra })) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
};
const jsonResponse = (body, status = 200, extra = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS, ...extra } });

/** ask the database for a snapshot (the public, read-only call) */
async function fromOrigin(env, key, fetchImpl) {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/world_snapshot?p_key=${encodeURIComponent(key)}`;
  // (the same headers the app and the landvas.app worker send with the publishable key)
  const res = await fetchImpl(url, { headers: { apikey: env.SUPABASE_KEY, authorization: `Bearer ${env.SUPABASE_KEY}`, accept: 'application/json' } });
  if (!res.ok) throw new Error(`origin ${res.status}`);
  const text = await res.text();
  if (!text || text === 'null') throw new Error('no snapshot');
  return text;
}

async function snapshot(request, env, ctx, key, deps) {
  const rule = SNAPSHOTS[key];
  if (!rule) return jsonResponse({ error: 'unknown snapshot' }, 404);
  const cache = deps.cache;
  const cacheKey = new Request(`https://cdn.landvas.app/w/${key}.json`);
  const store = async () => {
    const text = await fromOrigin(env, key, deps.fetch);
    const res = new Response(text, {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${rule.stale}`, 'x-fetched-at': String(deps.now()) },
    });
    await cache.put(cacheKey, res.clone());
    return res;
  };
  // (x-now: this moment by Cloudflare's clock, so phones with a wrong clock still judge a snapshot's age right)
  const browser = { 'cache-control': `public, max-age=${Math.min(rule.fresh, 5)}`, 'x-now': String(deps.now()) };
  const hit = await cache.match(cacheKey);
  if (hit) {
    const age = (deps.now() - Number(hit.headers.get('x-fetched-at') || 0)) / 1000;
    if (age < rule.fresh) return withHeaders(hit, { ...browser, 'x-cdn': 'hit' });
    if (age < rule.stale) {
      // old but usable: serve it now, and fetch a fresh one behind it
      ctx.waitUntil(store().catch(() => undefined));
      return withHeaders(hit, { ...browser, 'x-cdn': 'stale' });
    }
  }
  try {
    return withHeaders(await store(), { ...browser, 'x-cdn': 'miss' });
  } catch (e) {
    if (hit) return withHeaders(hit, { ...browser, 'x-cdn': 'stale-error' });
    return jsonResponse({ error: String(e?.message ?? e) }, 502, { 'cache-control': 'no-store' });
  }
}

async function picture(request, env, ctx, bucket, path, deps) {
  const ttl = BUCKETS[bucket];
  if (!ttl || !path || path.includes('..')) return jsonResponse({ error: 'not found' }, 404);
  const keep = bucket === 'public-art' && ART_IMMUTABLE.test(path) ? 31_536_000 : ttl;
  const cacheKey = new Request(`https://cdn.landvas.app/i/${bucket}/${path}`);
  const hit = await deps.cache.match(cacheKey);
  if (hit) return withHeaders(hit, { 'x-cdn': 'hit' });
  const res = await deps.fetch(`${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`);
  if (!res.ok) return withHeaders(new Response(null, { status: res.status }), { 'cache-control': 'public, max-age=60' });
  const out = new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'cache-control': `public, max-age=${keep}, immutable` },
  });
  ctx.waitUntil(deps.cache.put(cacheKey, out.clone()));
  return withHeaders(out, { 'x-cdn': 'miss' });
}

export async function handle(request, env, ctx, deps) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET' && request.method !== 'HEAD') return jsonResponse({ error: 'method' }, 405);
  const url = new URL(request.url);
  if (url.pathname === '/health') return jsonResponse({ ok: true, at: new Date(deps.now()).toISOString() }, 200, { 'cache-control': 'no-store' });
  let m = url.pathname.match(/^\/w\/([a-z_]+)\.json$/);
  if (m) return snapshot(request, env, ctx, m[1], deps);
  m = url.pathname.match(/^\/i\/([a-z-]+)\/(.+)$/);
  if (m) return picture(request, env, ctx, m[1], decodeURIComponent(m[2]), deps);
  return jsonResponse({ error: 'not found' }, 404);
}

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx, { cache: caches.default, fetch: (u, i) => fetch(u, i), now: () => Date.now() });
  },
};
