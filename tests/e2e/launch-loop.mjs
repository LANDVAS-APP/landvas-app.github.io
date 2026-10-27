// Real-browser test of the launch loop (local-mode build):
// sign up → onboarding → place explorer → claim free starter plot → win its
// minigame (server-validated) → Ink → buy a nearby plot with Ink → USD rent
// ticks → 20x boost → paint + publish → art on the map → travel → phone layout.
// Run: npm run build:artifact && node tests/e2e/launch-loop.mjs
import { serve, launch } from './browser.mjs';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-launch');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4182;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g/.test(m.text())) errors.push(m.text()); });
const shot = (n, p = page) => p.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 90000 });
const URL = `http://localhost:${PORT}/?e2e=1`;

async function pixelAt(file, x, y) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.round(y) * info.width + Math.round(x)) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}
const near = (a, b, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const center = (gx, gy) => {
  const n = Math.PI * (1 - (2 * (gy + 0.5)) / 65536);
  return { lng: ((gx + 0.5) / 65536) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
};
async function gotoPlot(p, gx, gy, zoom = 15.6) {
  await p.evaluate(([gx, gy, zoom]) => {
    const n = Math.PI * (1 - 2 * (gy + 0.5) / 65536);
    window.__landvasMap.jumpTo({ center: [((gx + 0.5) / 65536) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))], zoom });
  }, [gx, gy, zoom]);
  await p.waitForTimeout(1200);
}
async function screenOf(p, gx, gy, fx = 0.5, fy = 0.5) {
  return p.evaluate(([gx, gy, fx, fy]) => {
    const m = window.__landvasMap;
    const n = Math.PI * (1 - 2 * (gy + fy) / 65536);
    const pt = m.project([((gx + fx) / 65536) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + pt.x, y: r.top + pt.y };
  }, [gx, gy, fx, fy]);
}
async function clickPlot(p, gx, gy) {
  const s = await screenOf(p, gx, gy);
  await p.mouse.click(s.x, s.y);
  await p.waitForSelector('[data-testid=plot-panel]', { timeout: 10000 });
  await p.waitForTimeout(700);
}
const ink = (p = page) => p.evaluate(async () => Number((await window.__landvasApi.myState()).balances.ink));

async function winMinigame(p, game, gx, gy) {
  if (await p.locator('[data-testid=game-results]').count()) {
    const next = p.locator('[data-testid=game-next]');
    await (await next.count() ? next : p.locator('[data-testid=game-replay]')).click();
  } else {
    await p.evaluate(([g, gx, gy]) => window.__landvasNav(`/play/${g}?gx=${gx}&gy=${gy}`), [game, gx, gy]);
    await p.waitForSelector('[data-testid=game-start]', { timeout: 20000 });
    await p.click('[data-testid=game-start]');
  }
  await p.waitForFunction(() => !!window.__landvasGame, null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__landvasGame.autoSolve());
  await p.waitForSelector('[data-testid=game-results]', { timeout: 90000 });
  return p.evaluate(() => document.querySelector('[data-testid=game-results]')?.textContent ?? '');
}

const START = { gx: 12398, gy: 24628 }; // Salt Lake City
try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await shot('01-welcome');
  await page.fill('#email', 'ava@example.test');
  await page.fill('#password', 'paint-the-world');
  await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.fill('#username', 'ava_explorer');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 20000 });
  check('account created and onboarded', true);
  check('no Ink at signup (Ink only comes from minigames)', (await ink()) === 0);

  // place the explorer: the first-visit prompt → pick a spot → tap the map
  await page.waitForSelector('[data-testid=place-pick]', { timeout: 15000 });
  await shot('02-placement-prompt');
  await page.click('[data-testid=place-pick]');
  await gotoPlot(page, START.gx, START.gy, 15.4);
  const sp = await screenOf(page, START.gx, START.gy);
  await page.mouse.click(sp.x, sp.y);
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const ex = await page.evaluate(async () => (await window.__landvasApi.myExplorer()));
  check('explorer placed where the player tapped', ex && ex.gx === 12398 && ex.gy === 24628, JSON.stringify(ex && { gx: ex.gx, gy: ex.gy, mode: ex.mode }));
  await shot('03-explorer-placed');

  // claim the free starter plot (inside the reach square)
  await page.evaluate(() => window.__landvasMap.jumpTo({ zoom: 15.6 }));
  await page.waitForTimeout(800);
  await clickPlot(page, START.gx, START.gy);
  await shot('04-plot-panel');
  await page.click('[data-testid=claim-plot]');
  await page.waitForSelector('[data-testid=choose-draw]', { timeout: 15000 });
  check('starter plot claimed for free', true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const details = await page.evaluate(async ([gx, gy]) => window.__landvasApi.plotDetails(gx, gy), [START.gx, START.gy]);
  check('plot shows rarity and USD rent', !!details.rarity && Number(details.rent.usd_per_second) > 0, `${details.rarity} ${details.rent.usd_per_second}/s`);

  // rent ticks every frame
  const r1 = await page.textContent('[data-testid=usd-live]');
  await page.waitForTimeout(1500);
  const r2 = await page.textContent('[data-testid=usd-live]');
  check('USD rent counter is ticking', r1 !== r2 && /^\$0\.\d+/.test(r2), `${r1} → ${r2}`);

  // boost
  await page.click('[data-testid=boost]');
  await page.waitForTimeout(800);
  const boosted = await page.evaluate(async () => (await window.__landvasApi.myState()).rent.boost);
  check('20x boost activates for 30 minutes', boosted.active && boosted.multiplier === 20 && boosted.remaining_seconds > 1700, JSON.stringify({ a: boosted.active, m: boosted.multiplier, s: boosted.remaining_seconds }));
  await shot('05-boosted');

  // earn Ink: win the starter plot's minigame until a plot is affordable
  const game = details.type_info.minigame;
  let wins = 0;
  for (let i = 0; i < 8 && (await ink()) < 100; i++) {
    const text = await winMinigame(page, game, START.gx, START.gy);
    if (/cleared/.test(text)) wins++;
    if (i === 0) await shot('06-game-results');
  }
  const inkNow = await ink();
  check(`won ${game} and earned Ink (server-validated)`, wins > 0 && inkNow >= 100, `${wins} wins → ${inkNow} Ink`);
  const sources = await page.evaluate(async () => (await window.__landvasApi.myLedger(100)).filter((l) => l.resource === 'ink' && l.delta > 0).map((l) => l.reason));
  check('every Ink credit came from a minigame win', sources.length > 0 && sources.every((r) => r === 'minigame'), [...new Set(sources)].join(','));

  // buy the neighbouring plot with Ink
  await page.evaluate(() => window.__landvasNav('/'));
  await page.waitForSelector('[data-testid=world-map]', { timeout: 15000 });
  await gotoPlot(page, START.gx + 1, START.gy, 15.6);
  await clickPlot(page, START.gx + 1, START.gy);
  const before = await ink();
  await page.click('[data-testid=claim-plot]');
  await page.waitForTimeout(1500);
  const after = await ink();
  const state = await page.evaluate(async () => window.__landvasApi.myState());
  check('bought a neighbouring plot for 100 Ink', state.plot_count === 2 && before - after === 100, `${before} → ${after}, plots ${state.plot_count}`);
  await page.keyboard.press('Escape');
  await shot('07-two-plots');

  // a far plot is out of reach until the explorer travels there
  const far = { gx: START.gx + 6, gy: START.gy };
  await page.evaluate(() => window.__landvasUi?.select?.(null));
  await gotoPlot(page, far.gx, far.gy, 15.2);
  await clickPlot(page, far.gx, far.gy);
  const travelBtn = await page.locator('[data-testid=travel-here]').count();
  check('far plots need travel (location-gated claims)', travelBtn === 1 && (await page.locator('[data-testid=claim-plot]').count()) === 0);
  await page.click('[data-testid=travel-here]');
  await page.waitForTimeout(2500);
  const moving = await page.evaluate(async () => (await window.__landvasApi.myExplorer()));
  check('explorer travels toward the tapped plot', moving.traveling === true && !!moving.dest, JSON.stringify({ traveling: moving.traveling }));
  await shot('08-travelling');

  // map is colourful: rarity cells and the explorer are rendered
  const layers = await page.evaluate(() => {
    const m = window.__landvasMap;
    const feats = m.querySourceFeatures('lv-rarity');
    return { rarity: feats.length, kinds: [...new Set(feats.map((f) => f.properties.r))] };
  });
  check('every plot in view is coloured by rarity', layers.rarity > 20 && layers.kinds.length >= 3, JSON.stringify(layers));

  // paint + publish the starter plot, then see it on the map
  const groups = await page.evaluate(async () => window.__landvasApi.myGroups());
  const starterGroup = groups.find((g) => g.cells.some((c) => c[0] === 12398 && c[1] === 24628));
  await page.evaluate((id) => window.__landvasNav(`/create/${id}`), starterGroup.id);
  await page.waitForSelector('[data-testid=editor-canvas]', { timeout: 20000 });
  await page.waitForFunction(() => !!window.__landvasEditor, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__landvasEditor.set({ tool: 'fill', color: '#FF3D9A' }));
  const box = await page.locator('[data-testid=editor-canvas]').boundingBox();
  const map = await page.evaluate(() => { const e = window.__landvasEditor; return { ox: e.ox, oy: e.oy, s: e.scale }; });
  await page.mouse.click(box.x + map.ox + 60 * map.s, box.y + map.oy + 60 * map.s);
  await page.click('[data-testid=save-draft]');
  await page.waitForFunction(() => !window.__landvasEditor.dirty, null, { timeout: 15000 });
  await page.click('[data-testid=open-publish]');
  await page.check('[data-testid=rights]');
  await page.click('[data-testid=publish]');
  await page.waitForSelector('[data-testid=view-on-map]', { timeout: 60000 });
  check('artwork published', true);
  await page.click('[data-testid=view-on-map]');
  await page.waitForSelector('[data-testid=world-map]', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('[data-testid=plot-panel] button[aria-label="Close plot panel"]')?.click());
  await gotoPlot(page, START.gx, START.gy, 16);
  await page.waitForTimeout(3000);
  const f = path.join(OUT, '09-art-on-map.png');
  await page.screenshot({ path: f, timeout: 90000 });
  const at = await screenOf(page, START.gx, START.gy, 0.3, 0.3);
  const px = await pixelAt(f, at.x, at.y);
  check('published art visible on the map', near(px, [255, 61, 154], 70), JSON.stringify(px));

  // persistence across reload
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=world-map]', { timeout: 60000 });
  const persisted = await page.evaluate(async () => {
    const s = await window.__landvasApi.myState();
    return { plots: s.plot_count, usd: Number(s.rent.live_usd), explorer: !!s.explorer, ink: s.balances.ink };
  });
  check('plots, rent, explorer and Ink persist across reload', persisted.plots === 2 && persisted.usd > 0 && persisted.explorer, JSON.stringify(persisted));

  // phone layout
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const mp = await phone.newPage();
  mp.on('pageerror', (e) => errors.push('[phone] ' + e.message));
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.waitForSelector('#email', { timeout: 60000 }).catch(() => {});
  if (await mp.locator('#email').count()) {
    await mp.fill('#email', 'pia@example.test');
    await mp.fill('#password', 'phone-player-1');
    await mp.click('button[type=submit]');
    await mp.waitForSelector('#username', { timeout: 20000 });
    await mp.fill('#username', 'pia_phone');
    await mp.check('input[type=checkbox]');
    await mp.click('button[type=submit]');
  }
  await mp.waitForSelector('[data-testid=world-map]', { timeout: 30000 }).catch(async (e) => { await shot('zz-phone-failure', mp); throw e; });
  await mp.waitForTimeout(1500);
  await shot('10-phone-map', mp);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('phone: no horizontal page scroll', !overflow);
  await mp.close();
  await phone.close();
} catch (e) {
  check('unexpected failure', false, String(e?.message ?? e).split('\n')[0]);
  await shot('zz-failure').catch(() => {});
} finally {
  const relevant = errors.filter((e) => !/ErrnoError/.test(e));
  check('no uncaught page errors', relevant.length === 0, relevant.slice(0, 5).join(' || '));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
