// Link previews for shared art and artist pages. Chat apps and search engines don't run
// the app's JavaScript, so after each build this writes a copy of index.html for every
// published artwork (/art/<id>) and artist (/u/<name>) with its own title, description and
// preview image in the <head>. The page itself is the normal app. Also lists them in the
// sitemap. Only public data is used (the same gallery anyone can browse signed out).
//   node scripts/prerender-share.mjs dist
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
const SITE = 'https://landvas.app';
const env = Object.fromEntries(
  fs.existsSync('.env.production')
    ? fs.readFileSync('.env.production', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
    : [],
);
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.log('share previews: no Supabase project configured — skipped'); process.exit(0); }

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const asset = (p) => (p ? `${url}/storage/v1/object/public/public-art/${p}` : null);

async function rpc(fn, args) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

const base = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
function page({ route, title, description, image, alt, type = 'article' }) {
  const full = `${SITE}${route}`;
  let h = base;
  const set = (re, val) => { h = h.replace(re, val); };
  set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  set(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`);
  set(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${full}" />`);
  set(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${type}" />`);
  set(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${full}" />`);
  set(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`);
  set(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(description)}" />`);
  set(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(title)}" />`);
  set(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(description)}" />`);
  if (image) {
    set(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${esc(image)}" />`);
    set(/<meta property="og:image:width" content="[^"]*" \/>\s*/, '');
    set(/<meta property="og:image:height" content="[^"]*" \/>\s*/, '');
    set(/<meta property="og:image:alt" content="[^"]*" \/>/, `<meta property="og:image:alt" content="${esc(alt ?? title)}" />`);
    set(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${esc(image)}" />`);
  }
  const dir = path.join(dist, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), h);
  return full;
}

const urls = [];
const artists = new Map();
try {
  const seen = new Set();
  for (let off = 0; off < 3000; off += 60) {
    const cards = await rpc('gallery_list', { p_section: 'new', p_limit: 60, p_offset: off });
    if (!Array.isArray(cards) || !cards.length) break;
    for (const c of cards) {
      if (!c?.id || seen.has(c.id)) continue;
      seen.add(c.id);
      const who = c.artist?.username ? `@${c.artist.username}` : 'an artist';
      const plots = c.plot_count > 1 ? `a ${c.plot_count}-plot mural` : 'a plot painting';
      urls.push(page({
        route: `/art/${c.id}`,
        title: `${c.title || 'Untitled'} by ${who} — LANDVAS`,
        description: `${c.title || 'Untitled'}, ${plots} by ${who} on the LANDVAS live world map${c.appreciation_count ? ` · inspired ${c.appreciation_count} artist${c.appreciation_count === 1 ? '' : 's'}` : ''}. Claim a free plot and paint your own.`,
        image: asset(c.preview_path || c.thumb_path),
        alt: `${c.title || 'Artwork'} by ${who}`,
      }));
      if (c.artist?.username && !artists.has(c.artist.username)) artists.set(c.artist.username, c);
    }
    if (cards.length < 60) break;
  }
  for (const [name, c] of artists) {
    const dn = c.artist.display_name ? `${c.artist.display_name} (@${name})` : `@${name}`;
    urls.push(page({
      route: `/u/${encodeURIComponent(name)}`,
      title: `${dn} — artist on LANDVAS`,
      description: `See ${dn}’s murals and paintings on the LANDVAS live world map, visit their room and play together.`,
      image: asset(c.preview_path || c.thumb_path),
      type: 'profile',
    }));
  }
} catch (e) {
  console.log(`share previews: could not read the gallery (${e.message}) — skipped`);
}

const sm = path.join(dist, 'sitemap.xml');
if (urls.length && fs.existsSync(sm)) {
  const extra = urls.map((u) => `  <url><loc>${esc(u)}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`).join('\n');
  fs.writeFileSync(sm, fs.readFileSync(sm, 'utf8').replace('</urlset>', `${extra}\n</urlset>`));
}
console.log(`share previews: ${urls.length} pages (${artists.size} artists)`);
