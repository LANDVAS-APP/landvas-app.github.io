// Draw the fixed link-preview cards into public/og (committed): the site's own card, and one for each page people
// share most (the Handbook, the Gallery, a party invite…). Each card's file name carries a version, so chat apps that
// cached an older picture fetch the new one. scripts/prerender-share.mjs gives each page its card at deploy.
//   node scripts/make-share-cards.mjs
import fs from 'node:fs';
import path from 'node:path';
import { brandCard, cardBrowser, renderCard, sectionCard } from './share-cards.mjs';
import { SECTIONS, CARD_VERSION, MAIN_CARD } from './share-pages.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/og');
fs.mkdirSync(OUT, { recursive: true });
const emoji = (e) => `<div style="font-size:176px;line-height:1;filter:drop-shadow(0 16px 30px rgba(0,0,0,.35))">${e}</div>`;

const browser = await cardBrowser();
try {
  await renderCard(browser, brandCard(), path.join(ROOT, 'public', MAIN_CARD));
  // (the old address keeps working, with the new picture)
  await renderCard(browser, brandCard(), path.join(ROOT, 'public/og-image.png'));
  await renderCard(browser, brandCard(), path.join(ROOT, 'public/brand/landvas-og-2400x1260.png'), { scale: 2 });
  for (const s of SECTIONS) {
    await renderCard(browser, sectionCard({ kicker: s.kicker, title: s.headline, sub: s.sub, accent: s.accent, art: emoji(s.emoji), seed: s.seed }), path.join(ROOT, 'public', s.image));
    console.log(s.image);
  }
  console.log(`cards v${CARD_VERSION}: ${MAIN_CARD} + ${SECTIONS.length} pages`);
} finally { await browser.close(); }
