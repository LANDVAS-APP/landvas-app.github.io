// Cloudflare Worker for the LANDVAS portal: admin.landvas.app (staff) and my.landvas.app (players).
// The portal builds are published with the website under /portal/admin and /portal/my on every deploy,
// so this Worker only picks the right one by hostname and serves it (every page address loads the app).
// Set up once: Cloudflare dashboard → Workers & Pages → Create → Worker "landvas-portal" → paste this → Deploy,
// then Settings → Domains & Routes → add custom domains admin.landvas.app and my.landvas.app.
// It holds no keys: everything the portal shows is checked by the database on every call.
const ORIGINS = ['https://landvas.app/portal', 'https://landvas-app.github.io/portal'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const app = url.hostname.startsWith('admin.') ? 'admin' : 'my';
    // a real file (a hashed script, a style, a font) or a page address the portal handles itself
    const isFile = /\.[a-z0-9]{1,8}$/i.test(url.pathname) && !url.pathname.endsWith('.html');
    const path = isFile ? url.pathname : '/index.html';
    let res = null;
    for (const origin of ORIGINS) {
      try {
        const r = await fetch(`${origin}/${app}${path}`, { redirect: 'follow', cf: { cacheTtl: isFile ? 86400 : 30, cacheEverything: true } });
        // a site that answers every missing file with its own home page would hand back HTML for a script
        const html = (r.headers.get('content-type') || '').includes('text/html');
        if (r.ok && (!isFile || !html)) { res = r; break; }
      } catch {
        /* try the next origin */
      }
    }
    if (!res) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    const h = new Headers(res.headers);
    h.set('cache-control', isFile && /\/assets\//.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
    h.set('x-content-type-options', 'nosniff');
    h.set('referrer-policy', 'strict-origin-when-cross-origin');
    h.set('x-frame-options', 'DENY');
    h.set('content-security-policy', "frame-ancestors 'none'");
    h.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (app === 'admin') h.set('x-robots-tag', 'noindex, nofollow');
    h.delete('set-cookie');
    return new Response(request.method === 'HEAD' ? null : res.body, { status: 200, headers: h });
  },
};
