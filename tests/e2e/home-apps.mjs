// The website's homepage, signed out, on the local build with the browser router (the homepage lives at /):
//  * the Explore section links every big feature into its Handbook chapter, and the footer names the main pages
//  * the rent table keeps the base rarities and links every other rate to /guide
//  * the store buttons say "coming soon" until Live control switches a listing on (store.on_website), then link to it
// Run: VITE_ROUTER=browser npx vite build --mode artifact --outDir dist-home && node tests/e2e/home-apps.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-home';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-home-apps');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 4193;
const server = await serve(DIST, PORT);
const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })).newPage();
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid=homepage]', { timeout: 90000 });
  await page.waitForSelector('[data-testid=home-app-android]', { timeout: 30000 });

  const explore = await page.$$eval('[data-testid=home-explore] a', (as) => as.map((a) => a.getAttribute('href')));
  for (const to of ['/handbook/enchant', '/handbook/places', '/handbook/inkborn', '/handbook/space', '/handbook/ultra', '/handbook/social', '/handbook', '/guide'])
    check(`Explore links to ${to}`, explore.includes(to));
  const footer = await page.$$eval('[data-testid=home-footer] a', (as) => as.map((a) => a.getAttribute('href')));
  for (const to of ['/world', '/gallery', '/handbook', '/guide', '/leaderboards', '/royalty', '/support', '/legal/privacy'])
    check(`footer links to ${to}`, footer.includes(to));
  check('the rent table links every other rate to /guide', (await page.getAttribute('[data-testid=home-all-rates]', 'href')) === '/guide');

  const tag = (id) => page.$eval(`[data-testid=home-app-${id}]`, (e) => ({ tag: e.tagName, href: e.getAttribute('href'), text: e.textContent }));
  let a = await tag('android'), i = await tag('ios');
  check('store buttons say "coming soon" until a listing is switched on', a.tag === 'SPAN' && /coming soon/i.test(a.text) && i.tag === 'SPAN', `${a.text} | ${i.text}`);

  // Live control → "Google Play button on landvas.app" on
  await page.evaluate(async () => {
    const b = window.__landvasBackend;
    await b.db.query(`update game_config set value = jsonb_set(value, '{store,on_website}', '{"android": true}'::jsonb) where key = 'app'`);
    await window.__landvasQc.invalidateQueries({ queryKey: ['app-config'] });
  });
  await page.waitForTimeout(1500);
  a = await tag('android'); i = await tag('ios');
  check('switched on, Google Play links to the listing', a.tag === 'A' && /play\.google\.com/.test(a.href ?? '') && /get it on/i.test(a.text), JSON.stringify(a));
  check('the App Store stays "coming soon"', i.tag === 'SPAN' && /coming soon/i.test(i.text));
  await page.screenshot({ path: path.join(OUT, 'play-on.png') });
} catch (e) {
  failed++;
  console.log('FAIL  ', e.message.split('\n')[0]);
} finally {
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
