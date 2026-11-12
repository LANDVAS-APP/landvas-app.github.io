// Crown celebrations on the home page and Royalty: the newest crown is celebrated, the search finds crown holders,
// switching sizes redraws the card, and Snapshot saves a PNG.
// Run: npm run build:artifact && node tests/e2e/crown-celebrations.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-crown-celebrations'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4317);
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const errors = [];
async function run(viewport, label) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark', acceptDownloads: true, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  // headless Chrome has no share sheet: make Snapshot take the download path
  await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
  const shot = (n) => page.screenshot({ path: `${OUT}/${label}-${n}.png`, timeout: 45000 }).catch(() => console.log('skip', n));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  await page.goto('http://localhost:4317/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', `${label}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', `crowned_${label}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  const me = (await sql(`select id from profiles where username = 'crowned_${label}'`))[0].id;
  // an older City Crown and a brand-new one
  await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at)
    select c.gx, c.gy, '${me}', (select id from plot_types limit 1), 'crown', now() - (k || ' days')::interval
    from (select gx, gy, row_number() over (order by pop desc) - 1 k from world_cities order by pop desc limit 2) c on conflict (gx, gy) do nothing`);
  await page.evaluate(() => { window.__landvasQc.invalidateQueries(); window.__landvasNav('/'); });
  await page.waitForSelector('[data-testid=crown-celebrations]', { timeout: 30000 });
  await page.locator('[data-testid=crown-celebrations]').scrollIntoViewIfNeeded(); await page.waitForTimeout(1500);
  await shot('01-home');
  check(`${label}: home shows the celebration`, (await page.locator('[data-testid=crown-cel-canvas]').count()) === 1);
  check(`${label}: two crowns listed as newest`, (await page.locator('[data-testid=crown-cel-recent] li').count()) === 2);
  const inked = await page.evaluate(() => { const c = document.querySelector('[data-testid=crown-cel-canvas]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 400) if (d[i] > 200 && d[i + 1] > 150) n++; return n; });
  check(`${label}: the card is drawn (gold on it)`, inked > 50, String(inked));
  const first = await page.locator('[data-testid=crown-cel-canvas]').getAttribute('aria-label');
  check(`${label}: the newest is the first ever City Crown, by name`, /FIRST EVER CITY CROWN|CITY CROWN #2/.test(first) && first.includes(`@crowned_${label}`), first);
  await page.fill('[data-testid=crown-cel-search]', `crowned_${label.slice(0, 3)}`);
  check(`${label}: search finds the crown holder`, (await page.locator('[data-testid=crown-cel-results] li button').count()) >= 1);
  await shot('02-search');
  await page.locator('[data-testid=crown-cel-results] li button').last().click(); await page.waitForTimeout(500);
  check(`${label}: picking a result closes the search`, (await page.locator('[data-testid=crown-cel-results]').count()) === 0);
  await page.fill('[data-testid=crown-cel-search]', 'zzzz-nobody');
  check(`${label}: no match message`, /No crown holder matches/.test(await page.locator('[data-testid=crown-cel-results]').innerText()));
  await page.fill('[data-testid=crown-cel-search]', '');
  await page.click('[data-testid=crown-cel-size-wide]'); await page.waitForTimeout(400);
  check(`${label}: wide size redraws 1200×675`, await page.evaluate(() => { const c = document.querySelector('[data-testid=crown-cel-canvas]'); return c.width === 1200 && c.height === 675; }));
  await shot('03-wide');
  const dl = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
  await page.click('[data-testid=crown-cel-snapshot]');
  const d = await dl;
  if (d) { const f = `${OUT}/${label}-${d.suggestedFilename()}`; await d.saveAs(f); const sz = fs.statSync(f).size; check(`${label}: snapshot saves a PNG`, /\.png$/.test(f) && sz > 20000, `${d.suggestedFilename()} ${sz}B`); }
  else check(`${label}: snapshot saves a PNG`, false, 'no download');
  const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check(`${label}: nothing wider than the screen`, wide <= 0, `${wide}px`);
  await page.evaluate(() => window.__landvasNav('/royalty'));
  await page.waitForSelector('[data-testid=royalty-hero]', { timeout: 20000 }); await page.waitForTimeout(1200);
  check(`${label}: Royalty page has the celebration too`, (await page.locator('[data-testid=crown-celebrations]').count()) === 1);
  await shot('04-royalty');
  await browser.close();
}
try {
  await run({ width: 390, height: 844 }, 'phone');
  await run({ width: 1366, height: 900 }, 'desk');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run', false, e.message); }
server.close();
process.exit(results.every(Boolean) ? 0 : 1);
