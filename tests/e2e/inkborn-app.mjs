// The Inkborn studio in the app build (simulated Android shell, phone size):
//  - the drawing pad fills the width, with the hold-to-size brush dock and a sticky "Bring to Life"
//  - no creature preview until there's something to preview; after the reveal, a stage at the top
//  - the part picker shows one part at a time (tabs) with live previews; colours, legs and moods
//  - randomize rolls onto the stage; the release card names and releases the creature
// Run: npm run build:artifact && node tests/e2e/inkborn-app.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.E2E_DIST || 'dist-artifact';
const OUT = process.env.E2E_OUT || path.resolve('test-results/inkborn-app');
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);
const server = await serve(DIST, 4196);
const BASE = 'http://localhost:4196';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android', plugins: {} }; });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const shot = (n, full = false) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: full, timeout: 90000 }).catch(() => console.log('(screenshot skipped:', n + ')'));
const nav = async (r, wait = 1200) => { await page.evaluate((x) => window.__landvasNav(x), r); await page.waitForTimeout(wait); };
const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);

try {
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 60000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'studio_app@example.test');
  await page.fill('#password', 'paint-the-world');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 });
  await page.fill('#username', 'studio_app');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps], [data-testid=place-simple]', { timeout: 30000 }).catch(() => {});
  await page.click('[data-testid=place-simple]').catch(() => {});
  await page.waitForTimeout(2500);

  // draw mode: a full-width pad, the dock, no preview yet
  await nav('/inkborn/create', 1800);
  const pad = page.locator('[data-testid=inkborn-pad]').first();
  const b = await pad.boundingBox();
  check('the pad fills the phone width', !!b && b.width >= W - 48, b ? `${Math.round(b.width)}px of ${W}` : 'no pad');
  check('no creature preview before drawing', !(await visible('[data-testid=creature-preview]')));
  check('the brush dock is there', await visible('[data-testid=sketch-brush]'));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('nothing spills sideways', overflow <= 1, `${overflow}px`);
  await shot('1-draw');

  // hold the brush: the size bubble
  const brush = await page.locator('[data-testid=sketch-brush]').boundingBox();
  await page.mouse.move(brush.x + brush.width / 2, brush.y + brush.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  check('holding the brush opens the size bubble', await visible('[data-testid=sketch-size]'));
  await page.mouse.move(brush.x + brush.width / 2, brush.y - 60, { steps: 6 });
  await shot('2-brush-size');
  await page.mouse.up();
  await page.locator('[data-testid=sketch-size] button[aria-label=Done]').click().catch(() => {});

  // draw a creature
  const at = (fx, fy) => [b.x + b.width * fx, b.y + b.height * fy];
  const stroke = async (pts) => { await page.mouse.move(...at(...pts[0])); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(...at(...p), { steps: 4 }); await page.mouse.up(); };
  const circle = []; for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; circle.push([0.5 + Math.cos(a) * 0.25, 0.58 + Math.sin(a) * 0.22]); }
  await stroke(circle);
  await stroke([[0.36, 0.38], [0.32, 0.18], [0.44, 0.34]]);
  await stroke([[0.56, 0.34], [0.68, 0.18], [0.64, 0.38]]);
  await stroke([[0.75, 0.62], [0.88, 0.55], [0.9, 0.42]]);
  await stroke([[0.43, 0.55], [0.44, 0.56]]); await stroke([[0.57, 0.55], [0.58, 0.56]]);
  const cta = await page.locator('[data-testid=bring-to-life]').boundingBox();
  check('"Bring to Life" is on screen without scrolling', !!cta && cta.y + cta.height <= H, cta ? `bottom at ${Math.round(cta.y + cta.height)}` : '');
  await shot('3-drawn');
  await page.click('[data-testid=bring-to-life]');
  await page.waitForSelector('[data-testid=life-reveal]', { timeout: 3000 });
  await page.waitForTimeout(700);
  await shot('4-reveal');
  await page.waitForSelector('[data-testid=life-reveal]', { state: 'detached', timeout: 6000 });
  await page.waitForTimeout(600);
  check('after the reveal: the stage shows the creature', await visible('[data-testid=creature-preview]'));
  check('after the reveal: the came-alive card', await visible('[data-testid=came-alive]'));
  check('after the reveal: the release card', await visible('[data-testid=studio-release]'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('5-alive');
  await shot('5b-alive-full', true);

  // customize: one part at a time
  await page.click('[data-testid=studio-custom]');
  await page.waitForTimeout(500);
  check('the part picker is open', await visible('section[data-testid=studio-custom]'));
  for (const t of ['body', 'colours', 'wings', 'counts', 'mood']) {
    await page.click(`[data-testid=part-${t}]`);
    await page.waitForTimeout(700);
    if (t === 'wings') { await page.locator('section[data-testid=studio-custom] .lv-ipick').nth(1).click(); await page.waitForTimeout(500); }
    if (t === 'mood') { await page.locator('.lv-imood').nth(2).click(); await page.waitForTimeout(500); }
    await shot(`6-part-${t}`);
  }
  const studioH = await page.evaluate(() => document.documentElement.scrollHeight);
  check('customize fits in about two screens', studioH <= H * 2.2, `${studioH}px`);

  // randomize
  await page.locator('[data-testid=studio-random]').first().click();
  await page.waitForTimeout(400);
  await page.click('button[data-testid=roll]');
  await page.waitForTimeout(600);
  await page.click('button[data-testid=roll]');
  await page.waitForTimeout(800);
  check('earlier rolls are kept', (await page.locator('section[data-testid=studio-random] .lv-ipick').count()) >= 1);
  await shot('7-random');

  // release
  await page.fill('[data-testid=inkborn-name]', 'Pip');
  const cost = await page.textContent('[data-testid=inkborn-cost]').catch(() => '');
  check('the release button shows the cost', /Free|\d/.test(cost || ''), cost || '');
  await page.click('[data-testid=save-inkborn]');
  await page.waitForSelector('[data-testid=sanctuary]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  check('released into the sanctuary', await visible('[data-testid=sanctuary]'));
  await shot('8-sanctuary');
} catch (e) {
  console.log('ERROR', e);
  failed++;
  await shot('error');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
console.log(failed ? `${failed} check(s) failed` : 'all inkborn app checks passed');
process.exit(failed ? 1 : 0);
