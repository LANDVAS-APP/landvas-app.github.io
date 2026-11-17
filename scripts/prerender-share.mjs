// Link previews. Chat apps and search engines don't run the app's JavaScript, so after each build this writes a copy
// of index.html for each page worth sharing, with its own title, description and preview card in the <head>:
//  - the game's main pages (the Handbook, the Gallery, a party invite…), with the cards in public/og
//    (scripts/make-share-cards.mjs draws those)
//  - every published artwork (/art/<id>): the painting framed on a gallery wall with its title and artist
//  - every artist (/u/<name>): a few of their paintings and their name
// The artwork and artist cards are drawn here (a headless browser); a card drawn by an earlier deploy is fetched
// back from the live site rather than drawn again, and only so many new ones are drawn per deploy (the rest show
// the plain painting until the next one). Only public data is used (the gallery anyone can browse signed out).
// Also lists the pages in the sitemap.
//   node scripts/prerender-share.mjs dist
import fs from 'node:fs';
import path from 'node:path';
import { artCard, artistCard, cardBrowser, renderCard } from './share-cards.mjs';
import { CARD_VERSION, HANDBOOK_CHAPTERS, MAIN_CARD, SECTIONS } from './share-pages.mjs';

const dist = path.resolve(process.argv[2] || 'dist');
const SITE = 'https://landvas.app';
const NEW_CARDS = Number(process.env.SHARE_NEW_CARDS ?? 150); // new artwork/artist cards drawn per deploy
const env = Object.fromEntries(
  fs.existsSync('.env.production')
    ? fs.readFileSync('.env.production', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
    : [],
);
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const asset = (p) => (p && url ? `${url}/storage/v1/object/public/public-art/${p}` : null);

async function rpc(fn, args) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

const base = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
/** a page's own copy of index.html. `card`: the picture is one of our 1200×630 cards (its size is known) */
function page({ route, title, description, image, alt, type = 'article', card = false }) {
  const full = `${SITE}/${route}`;
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
    if (!card) {
      set(/<meta property="og:image:width" content="[^"]*" \/>\s*/, '');
      set(/<meta property="og:image:height" content="[^"]*" \/>\s*/, '');
      set(/<meta property="og:image:type" content="[^"]*" \/>\s*/, '');
    } else {
      set(/<meta property="og:image:type" content="[^"]*" \/>/, `<meta property="og:image:type" content="${image.endsWith('.jpg') ? 'image/jpeg' : 'image/png'}" />`);
    }
    set(/<meta property="og:image:alt" content="[^"]*" \/>/, `<meta property="og:image:alt" content="${esc(alt ?? title)}" />`);
    set(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${esc(image)}" />`);
  }
  const dir = path.join(dist, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), h);
  return full;
}

const urls = [];
// ---- the game's main pages ------------------------------------------------------------------------------------------
for (const s of SECTIONS) {
  if (!fs.existsSync(path.join(dist, s.image))) { console.log(`share previews: ${s.image} missing — run scripts/make-share-cards.mjs`); continue; }
  const u = page({ route: s.route, title: s.title, description: s.description, image: `${SITE}/${s.image}`, alt: s.title, type: 'website', card: true });
  if (!s.route.includes('/')) urls.push(u);
}
const hb = SECTIONS.find((s) => s.route === 'handbook');
if (hb && fs.existsSync(path.join(dist, hb.image))) {
  for (const ch of HANDBOOK_CHAPTERS) {
    urls.push(page({ route: `handbook/${ch.id}`, title: `${ch.title} — the LANDVAS Handbook`, description: ch.blurb, image: `${SITE}/${hb.image}`, alt: `${ch.title} — the LANDVAS Handbook`, card: true }));
  }
}
console.log(`share previews: ${SECTIONS.length} main pages, ${HANDBOOK_CHAPTERS.length} handbook chapters (site card ${MAIN_CARD})`);
if (!url || !key) { console.log('share previews: no Supabase project configured — artworks skipped'); process.exit(0); }

// ---- artworks and artists -------------------------------------------------------------------------------------------
let browser = null, drawn = 0, kept = 0, plain = 0;
/** a card for this page: the one an earlier deploy drew (fetched back from the live site), or a new one */
async function cardFor(rel, html) {
  const file = path.join(dist, rel);
  try {
    const r = await fetch(`${SITE}/${rel}`, { signal: AbortSignal.timeout(8000) });
    if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      kept++; return `${SITE}/${rel}`;
    }
  } catch { /* not there yet */ }
  if (drawn >= NEW_CARDS) return null;
  drawn++; // (held now: several cards are drawn at once)
  try {
    browser ??= cardBrowser().catch((e) => { console.log(`share previews: no browser to draw cards with (${String(e.message ?? e).slice(0, 160)})`); return null; });
    const b = await browser;
    if (!b) { drawn = NEW_CARDS; return null; }
    if (await renderCard(b, html, file)) return `${SITE}/${rel}`;
  } catch (e) { console.log(`share previews: card ${rel} not drawn (${String(e.message ?? e).slice(0, 120)})`); }
  drawn--;
  return null;
}

const artists = new Map();
/** run `fn` over `items`, `n` at a time */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const x = items[i++]; await fn(x); } }));
}
try {
  const seen = new Set(), arts = [];
  for (let off = 0; off < 3000; off += 60) {
    const cards = await rpc('gallery_list', { p_section: 'new', p_limit: 60, p_offset: off });
    if (!Array.isArray(cards) || !cards.length) break;
    for (const c of cards) {
      if (!c?.id || seen.has(c.id)) continue;
      seen.add(c.id); arts.push(c);
      if (c.artist?.username) {
        const a = artists.get(c.artist.username) ?? { c, imgs: [] };
        const raw = asset(c.preview_path || c.thumb_path);
        if (raw && a.imgs.length < 3) a.imgs.push(raw);
        artists.set(c.artist.username, a);
      }
    }
    if (cards.length < 60) break;
  }
  // the cards (newest first, so the newest get drawn when there are more than a deploy draws)
  const cardOf = new Map();
  await pool([...arts.map((c) => ({ art: c })), ...[...artists].map(([name, a]) => ({ name, a }))], 8, async (it) => {
    if (it.art) {
      const c = it.art, raw = asset(c.preview_path || c.thumb_path);
      const who = c.artist?.username ? `@${c.artist.username}` : 'an artist';
      if (raw) cardOf.set(`art:${c.id}`, await cardFor(`og/art/v${CARD_VERSION}/${c.id}.jpg`, artCard({ img: raw, title: c.title, artist: who, plots: c.plot_count ?? 1, inspired: c.appreciation_count ?? 0 })));
    } else if (it.a.imgs.length) {
      cardOf.set(`u:${it.name}`, await cardFor(`og/u/v${CARD_VERSION}/${encodeURIComponent(it.name.toLowerCase())}.jpg`, artistCard({ imgs: it.a.imgs, name: it.name, display: it.a.c.artist.display_name })));
    }
  });
  for (const c of arts) {
    const who = c.artist?.username ? `@${c.artist.username}` : 'an artist';
    const plots = c.plot_count > 1 ? `a ${c.plot_count}-plot mural` : 'a plot painting';
    const card = cardOf.get(`art:${c.id}`) ?? null;
    if (!card) plain++;
    urls.push(page({
      route: `art/${c.id}`,
      title: `${c.title || 'Untitled'} by ${who} — LANDVAS`,
      description: `${c.title || 'Untitled'}, ${plots} by ${who} on the LANDVAS live world map${c.appreciation_count ? ` · inspired ${c.appreciation_count} artist${c.appreciation_count === 1 ? '' : 's'}` : ''}. Claim a free plot and paint your own.`,
      image: card ?? asset(c.preview_path || c.thumb_path), card: !!card,
      alt: `${c.title || 'Artwork'} by ${who}`,
    }));
  }
  for (const [name, { c }] of artists) {
    const dn = c.artist.display_name ? `${c.artist.display_name} (@${name})` : `@${name}`;
    const card = cardOf.get(`u:${name}`) ?? null;
    urls.push(page({
      route: `u/${encodeURIComponent(name)}`,
      title: `${dn} — artist on LANDVAS`,
      description: `See ${dn}’s murals and paintings on the LANDVAS live world map, visit their room and play together.`,
      image: card ?? asset(c.preview_path || c.thumb_path), card: !!card,
      type: 'profile',
    }));
  }
} catch (e) {
  console.log(`share previews: could not read the gallery (${e.message}) — skipped`);
} finally {
  await (await browser)?.close().catch(() => {});
}

// invite links: landvas.app/i/CODE for every saved invite card, with the player's own words and picture (the words
// match src/social/inviteCard.ts previewText). Not in the sitemap: these are for chats, not search. The codes go to
// invite-pages.json; after the site is published, scripts/invite-pages.mjs tells the game they have a page.
const inviteCodes = [];
try {
  const cards = await rpc('invite_cards_for_pages', {});
  for (const c of Array.isArray(cards) ? cards : []) {
    const who = c.display_name ? `${c.display_name} (@${c.username})` : `@${c.username}`;
    const title = c.headline ? `${c.emoji ? `${c.emoji} ` : ''}${c.headline}` : `${who} invited you to LANDVAS`;
    const description = `${c.message ?? 'Claim a free plot on the live world map and play with me.'} — ${who} on LANDVAS`;
    // (a saved card is the app's own 1200×630 picture; without one, their artwork as it is)
    const image = c.image_path ? `${url}/storage/v1/object/public/invite-cards/${c.image_path}` : asset(c.art_path);
    for (const code of c.codes ?? []) {
      if (!/^[A-Z0-9_]{3,20}$/.test(code)) continue;
      page({ route: `i/${code}`, title, description, image: image ?? `${SITE}/${MAIN_CARD}`, alt: title, type: 'website', card: !!c.image_path || !image });
      inviteCodes.push(code);
    }
  }
  fs.writeFileSync(path.resolve('invite-pages.json'), JSON.stringify(inviteCodes));
} catch (e) {
  console.log(`share previews: could not read invite cards (${e.message}) — skipped`);
}

const sm = path.join(dist, 'sitemap.xml');
if (urls.length && fs.existsSync(sm)) {
  const have = fs.readFileSync(sm, 'utf8');
  const extra = urls.filter((u) => !have.includes(`<loc>${esc(u)}</loc>`)).map((u) => `  <url><loc>${esc(u)}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`).join('\n');
  fs.writeFileSync(sm, have.replace('</urlset>', `${extra}\n</urlset>`));
}
console.log(`share previews: ${urls.length} pages (${artists.size} artists), ${inviteCodes.length} invite links · cards: ${drawn} drawn, ${kept} kept, ${plain} plain`);
