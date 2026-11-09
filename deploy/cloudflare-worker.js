// Cloudflare Worker for landvas.app
// Serves the always-current LANDVAS build straight from GitHub Pages, so every
// deploy shows up on landvas.app within minutes, and every game address
// (/world, /settings, /u/name/room …) loads the app instead of a 404.
// Paste this into: Cloudflare dashboard → Workers & Pages → your landvas worker → Edit code → Deploy.
const ORIGIN = 'https://landvas-app.github.io';
// link previews: shared /art/<id> links get the artwork's own title and picture right away
const SUPABASE = 'https://ojxqarpmreekylwotbdb.supabase.co';
const ANON = 'sb_publishable_dEOM4bqREs8XHmtFNrx7NA_qK7GijGL'; // public (publishable) key — same one the web app ships

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
      res = withHeaders(res, 200);
    } else {
      res = withHeaders(res, res.status);
    }
    const art = url.pathname.match(/^\/art\/([0-9a-f-]{36})\/?$/);
    if (art && (res.headers.get('content-type') || '').includes('text/html')) return artPreview(res, art[1]);
    return res;
  },
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function artPreview(res, id) {
  try {
    const r = await fetch(`${SUPABASE}/rest/v1/rpc/artwork_detail`, {
      method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_publication_id: id }), cf: { cacheTtl: 300 },
    });
    if (!r.ok) return res;
    const d = await r.json();
    const a = d?.artwork ?? d;
    if (!a?.title) return res;
    const who = a.artist?.username ? `@${a.artist.username}` : 'an artist';
    const title = `${a.title} by ${who} — LANDVAS`;
    const desc = `${a.title}, ${a.plot_count > 1 ? `a ${a.plot_count}-plot mural` : 'a plot painting'} by ${who} on the LANDVAS live world map. Claim a free plot and paint your own.`;
    const p = a.preview_path || a.thumb_path;
    const img = p ? `${SUPABASE}/storage/v1/object/public/public-art/${p}` : null;
    const page = `https://landvas.app/art/${id}`;
    const content = (v) => ({ element(e) { e.setAttribute('content', v); } });
    let rw = new HTMLRewriter()
      .on('title', { element(e) { e.setInnerContent(title); } })
      .on('meta[name="description"]', content(desc))
      .on('meta[property="og:type"]', content('article'))
      .on('meta[property="og:url"]', content(page))
      .on('meta[property="og:title"]', content(title))
      .on('meta[property="og:description"]', content(desc))
      .on('meta[name="twitter:title"]', content(title))
      .on('meta[name="twitter:description"]', content(desc))
      .on('link[rel="canonical"]', { element(e) { e.setAttribute('href', page); } });
    if (img) {
      rw = rw.on('meta[property="og:image"]', content(img)).on('meta[name="twitter:image"]', content(img))
        .on('meta[property="og:image:width"]', { element(e) { e.remove(); } }).on('meta[property="og:image:height"]', { element(e) { e.remove(); } })
        .on('meta[property="og:image:alt"]', content(esc(`${a.title} by ${who}`)));
    }
    return rw.transform(res);
  } catch {
    return res;
  }
}

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
