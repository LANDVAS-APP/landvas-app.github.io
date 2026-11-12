// Explorer studio: the explorer is fully in view; male and female looks; skin and hair colours; save.
// Run: npm run build:artifact && node tests/e2e/explorer-studio.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-explorer-studio'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4318);
const browser = await launch();
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
for (const [W, H, tag] of [[390, 844, 'phone'], [1280, 860, 'desktop']].filter(([, , t]) => !process.env.ONLY || process.env.ONLY === t)) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 700, hasTouch: W < 700, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => page.screenshot({ path: `${OUT}/${tag}-${n}.png`, timeout: 90000 }).catch(() => console.log('skip', n));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  try {
    await page.goto('http://localhost:4318/?e2e=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
    if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
    await page.waitForSelector('#email'); await page.fill('#email', `s-${tag}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', `studio_${tag}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.__landvasNav('/explorer'));
    await page.waitForSelector('[data-testid=explorer-preview]', { timeout: 20000 }); await page.waitForTimeout(1200);
    const fit = await page.evaluate(() => { const st = document.querySelector('[data-testid=explorer-preview]').getBoundingClientRect(); const f = document.querySelector('.lv-studio-figure svg').getBoundingClientRect();
      return { inside: f.top >= st.top - 1 && f.bottom <= st.bottom + 1 && f.left >= st.left && f.right <= st.right, centred: Math.abs((f.left + f.right) / 2 - (st.left + st.right) / 2) < 6 }; });
    check(`${tag}: the explorer is fully visible and centred`, fit.inside && fit.centred, JSON.stringify(fit));
    await shot('01-studio');
    // male: male hair only
    await page.click('[data-testid=explorer-sex-m]'); await page.click('[data-testid=explorer-group-hair]'); await page.waitForTimeout(300);
    const mHair = await page.locator('[data-testid=explorer-part-hair] [data-testid=explorer-item]').evaluateAll((b) => b.map((x) => x.dataset.key.split('.').pop()));
    check(`${tag}: male hairstyles only for a male explorer`, mHair.includes('quiff') && mHair.includes('buzz') && !mHair.includes('ponytail') && !mHair.includes('long'), mHair.join(','));
    await page.click('[data-testid=explorer-item][data-key="explorer.hair.quiff"]');
    await page.click('[data-testid=explorer-item][data-key="explorer.hairc.auburn"]');
    await page.click('[data-testid=explorer-group-body]'); await page.waitForTimeout(300);
    const mBody = await page.locator('[data-testid=explorer-part-body] [data-testid=explorer-item]').evaluateAll((b) => b.map((x) => x.dataset.key.split('.').pop()));
    check(`${tag}: male builds (no dress/skirt)`, mBody.includes('broad') && !mBody.includes('dress'), mBody.join(','));
    const skins = await page.locator('[data-testid=explorer-part-skin] [data-testid=explorer-item]').count();
    check(`${tag}: lots of skin tones`, skins >= 13, String(skins));
    await page.click('[data-testid=explorer-item][data-key="explorer.skin.espresso"]');
    await page.click('[data-testid=explorer-item][data-key="explorer.body.broad"]');
    await page.click('[data-testid=explorer-item][data-key="explorer.face.beard"]');
    await shot('02-male');
    await page.click('[data-testid=explorer-save]'); await page.waitForTimeout(1500);
    const st = (await sql(`select explorer_style s from profiles where username = 'studio_${tag}'`))[0].s;
    check(`${tag}: the male look saves`, st.sex === 'm' && st.hair === 'quiff' && st.body === 'broad' && st.face === 'beard' && st.skin === 'espresso' && st.hairc === 'auburn', JSON.stringify(st));
    // female: switching swaps male-only pieces for female defaults
    await page.click('[data-testid=explorer-sex-f]'); await page.click('[data-testid=explorer-group-hair]'); await page.waitForTimeout(300);
    const fHair = await page.locator('[data-testid=explorer-part-hair] [data-testid=explorer-item]').evaluateAll((b) => b.map((x) => x.dataset.key.split('.').pop()));
    check(`${tag}: female hairstyles for a female explorer`, fHair.includes('waves') && fHair.includes('ponytail') && !fHair.includes('quiff'), fHair.join(','));
    await page.click('[data-testid=explorer-item][data-key="explorer.hair.spacebuns"]');
    await page.click('[data-testid=explorer-group-body]'); await page.waitForTimeout(300);
    await page.click('[data-testid=explorer-item][data-key="explorer.body.dress"]');
    await page.click('[data-testid=explorer-item][data-key="explorer.face.freckles"]');
    await page.click('[data-testid=explorer-item][data-key="explorer.skin.porcelain"]');
    await page.click('[data-testid=explorer-save]'); await page.waitForTimeout(1500);
    const sf = (await sql(`select explorer_style s from profiles where username = 'studio_${tag}'`))[0].s;
    check(`${tag}: the female look saves (beard gone)`, sf.sex === 'f' && sf.hair === 'spacebuns' && sf.body === 'dress' && sf.face === 'freckles', JSON.stringify(sf));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    await shot('03-female');
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    check(`${tag}: nothing wider than the screen`, wide <= 0, `${wide}px`);
    check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) { check(`${tag}: run`, false, e.message); await shot('99-error'); }
  await ctx.close();
}
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
