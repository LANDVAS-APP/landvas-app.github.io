// Cloudflare Worker for landvas.app
// Serves the always-current LANDVAS build straight from GitHub Pages, so every
// deploy shows up on landvas.app within minutes, and every game address
// (/world, /settings, /u/name/room …) loads the app instead of a 404.
// Paste this into: Cloudflare dashboard → Workers & Pages → your landvas worker → Edit code → Deploy.
const ORIGIN = 'https://landvas-app.github.io';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // one canonical address: www.landvas.app → landvas.app
    if (url.hostname === 'www.landvas.app') {
      url.hostname = 'landvas.app';
      return Response.redirect(url.toString(), 301);
    }
    const upstream = new URL(url.pathname + url.search, ORIGIN);
    let res = await fetch(upstream.toString(), {
      method: request.method,
      headers: { 'user-agent': request.headers.get('user-agent') || 'landvas-worker', accept: request.headers.get('accept') || '*/*' },
      redirect: 'follow',
      cf: { cacheTtl: 60, cacheEverything: false },
    });
    // a page address the game handles itself (no file extension) → serve the app with 200
    const last = url.pathname.split('/').pop() || '';
    if (res.status === 404 && !last.includes('.')) {
      res = await fetch(`${ORIGIN}/index.html`, { cf: { cacheTtl: 60 } });
      return withHeaders(res, 200);
    }
    return withHeaders(res, res.status);
  },
};

function withHeaders(res, status) {
  const h = new Headers(res.headers);
  // the app and its service worker must always be fresh; hashed assets can cache long
  const type = h.get('content-type') || '';
  if (type.includes('text/html') || /\/(sw\.js|version\.json|manifest\.webmanifest)$/.test(new URL(res.url).pathname)) {
    h.set('cache-control', 'no-cache');
  }
  h.delete('x-github-request-id');
  return new Response(res.body, { status, headers: h });
}
