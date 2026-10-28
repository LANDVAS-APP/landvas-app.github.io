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
// the player stands on START: explorers follow real GPS only
const START_LL = (() => { const gx = 12398 * 64 + 32, gy = 24628 * 64 + 32, G = 4194304; const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; })();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: 'dark', geolocation: { ...START_LL, accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g/.test(m.text())) errors.push(m.text()); });
// screenshots are a visual record, not a check: a slow WebGL frame must not fail the run
const shot = async (n, p = page) => {
  try { await p.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); }
  catch (e) { console.log(`note  screenshot ${n} skipped (${String(e.message).split('\n')[0]})`); }
};
const URL = `http://localhost:${PORT}/?e2e=1`;
const G = 4194304; // plots per side (zoom-22 grid)
const ZP = 20.4; // zoom that frames a few plots

async function pixelAt(file, x, y) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.round(y) * info.width + Math.round(x)) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}
const near = (a, b, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const center = (gx, gy) => {
  const n = Math.PI * (1 - (2 * (gy + 0.5)) / G);
  return { lng: ((gx + 0.5) / G) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
};
async function gotoPlot(p, gx, gy, zoom = ZP) {
  await p.evaluate(([gx, gy, zoom, G]) => {
    window.__landvasMap.fire('dragstart'); // stop following the explorer, like a user panning away
    const n = Math.PI * (1 - 2 * (gy + 0.5) / G);
    window.__landvasMap.jumpTo({ center: [((gx + 0.5) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))], zoom });
  }, [gx, gy, zoom, G]);
  await p.waitForTimeout(1200);
}
async function screenOf(p, gx, gy, fx = 0.5, fy = 0.5) {
  return p.evaluate(([gx, gy, fx, fy, G]) => {
    const m = window.__landvasMap;
    const n = Math.PI * (1 - 2 * (gy + fy) / G);
    const pt = m.project([((gx + fx) / G) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + pt.x, y: r.top + pt.y };
  }, [gx, gy, fx, fy, G]);
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

const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 }; // a house in Salt Lake City
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

  // place the explorer: the first-visit prompt offers GPS only (no picking a spot, no teleports)
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 15000 });
  check('the placement prompt is GPS-only', (await page.locator('[data-testid=place-pick]').count()) === 0);
  await shot('02-placement-prompt');
  await page.click('[data-testid=place-gps]');
  await page.waitForFunction(() => document.querySelector('.lv-explorer') !== null, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const ex = await page.evaluate(async () => (await window.__landvasApi.myExplorer()));
  check('explorer placed at the player’s GPS position', ex && ex.gx === START.gx && ex.gy === START.gy && ex.mode === 'gps', JSON.stringify(ex && { gx: ex.gx, gy: ex.gy, mode: ex.mode }));
  await gotoPlot(page, START.gx, START.gy, ZP - 0.4);
  await shot('03-explorer-placed');

  // claim the free starter plot (inside the reach square)
  await page.evaluate((z) => window.__landvasMap.jumpTo({ zoom: z }), ZP);
  await page.waitForTimeout(800);
  await clickPlot(page, START.gx, START.gy);
  await shot('04-plot-panel');
  const mystery = await page.evaluate(() => ({
    typeLayer: !!window.__landvasMap.getLayer('lv-free-icon') || !!window.__landvasMap.getLayer('lv-free-pattern'),
    note: !!document.querySelector('[data-testid=mystery-note]'),
  }));
  check('unclaimed plots show neither type nor minigame', !mystery.typeLayer && mystery.note, JSON.stringify(mystery));
  const hidden = await page.evaluate(async ([gx, gy]) => {
    const d = await window.__landvasApi.plotDetails(gx, gy);
    const feats = window.__landvasMap.querySourceFeatures('lv-rarity');
    return { rarity: d.rarity, hidden: d.rarity_hidden, rent: d.rent ?? null, acquireRarity: d.acquire?.rarity ?? null, mapRarity: feats.some((f) => 'r' in f.properties), panel: !!document.querySelector('[data-testid=mystery-rarity]') };
  }, [START.gx, START.gy]);
  check('unclaimed plots keep their rarity secret', hidden.rarity == null && hidden.hidden === true && hidden.rent == null && hidden.acquireRarity == null && !hidden.mapRarity && hidden.panel, JSON.stringify(hidden));
  await page.fill('[data-testid=plot-name-input]', "Ava's HQ");
  await page.click('[data-testid=claim-plot]');
  await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 });
  await page.waitForTimeout(900);
  await shot('04b-claim-celebration');
  await page.waitForFunction(() => /Incredible|solid start|Nice/.test(document.querySelector('[data-testid=claim-celebration]')?.textContent ?? ''), null, { timeout: 15000 });
  const revealed = await page.textContent('[data-testid=claim-rarity]');
  check('claiming plays the celebration and reveals the rarity', !!revealed, revealed);
  await page.waitForSelector('[data-testid=choose-draw]', { timeout: 15000 });
  check('starter plot claimed for free', true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const details = await page.evaluate(async ([gx, gy]) => window.__landvasApi.plotDetails(gx, gy), [START.gx, START.gy]);
  check('plot shows rarity and USD rent', !!details.rarity && Number(details.rent.usd_per_second) > 0, `${details.rarity} ${details.rent.usd_per_second}/s`);
  check('the plot carries its custom name', details.name === "Ava's HQ", String(details.name));
  await page.waitForTimeout(1200);
  const nameLabel = await page.evaluate(() => [...document.querySelectorAll('.lv-plot-name')].map((e) => e.textContent));
  check('the name floats over the plot on the map', nameLabel.includes("Ava's HQ"), JSON.stringify(nameLabel));

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
  await page.evaluate(() => window.__landvasNav('/world'));
  await page.waitForSelector('[data-testid=world-map]', { timeout: 15000 });
  await gotoPlot(page, START.gx + 1, START.gy, ZP);
  await clickPlot(page, START.gx + 1, START.gy);
  const before = await ink();
  await page.click('[data-testid=claim-plot]');
  await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('[data-testid=celebration-close]')?.click());
  await page.waitForTimeout(600);
  const after = await ink();
  const state = await page.evaluate(async () => window.__landvasApi.myState());
  check('bought a neighbouring plot for 100 Ink', state.plot_count === 2 && before - after === 100, `${before} → ${after}, plots ${state.plot_count}`);
  await page.keyboard.press('Escape');
  await shot('07-two-plots');

  // a far plot is out of reach — and there's no travelling or jumping there
  const far = { gx: START.gx + 14, gy: START.gy };
  await page.evaluate(() => window.__landvasUi?.select?.(null));
  await gotoPlot(page, far.gx, far.gy, ZP - 0.8);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await clickPlot(page, far.gx, far.gy);
  // make sure the panel shows the far (unclaimed) plot, not the one that was open before
  await page.waitForFunction(() => !/Rent\$/.test(document.querySelector('[data-testid=plot-panel]')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
  const panelText = await page.textContent('[data-testid=plot-panel]');
  check('far plots can only be reached by walking (no travel or jump buttons)', (await page.locator('[data-testid=claim-plot]').count()) === 0
    && (await page.locator('[data-testid=travel-here]').count()) === 0 && !/Jump now|Travel \(/.test(panelText) && /Walk closer/.test(panelText), panelText.slice(0, 300));
  await shot('08-out-of-reach');

  // every small plot in view is drawn as a plain mystery square
  const layers = await page.evaluate(() => {
    const m = window.__landvasMap;
    const feats = m.querySourceFeatures('lv-rarity');
    return { cells: feats.length, typed: feats.filter((f) => 't' in f.properties).length, rarity: feats.filter((f) => 'r' in f.properties).length };
  });
  check('every unclaimed plot in view is drawn, with no type or rarity', layers.cells > 100 && layers.typed === 0 && layers.rarity === 0, JSON.stringify(layers));
  const metres = (40075016.7 / G) * Math.cos((center(START.gx, START.gy).lat * Math.PI) / 180);
  check('plots are house-sized (~7 m at Salt Lake City)', metres > 6 && metres < 8, `${metres.toFixed(2)} m`);

  // the joystick steers the explorer at a capped speed and burns its tank
  await page.evaluate(() => document.querySelector('[data-testid=plot-panel] button[aria-label="Close plot panel"]')?.click());
  await page.waitForTimeout(600);
  await page.click('[data-testid=joystick-toggle]', { timeout: 10000 }).catch(async (e) => { await shot('zz-joystick-failure'); throw e; });
  await page.waitForSelector('[data-testid=joystick-pad]', { timeout: 10000 });
  const exBefore = await page.evaluate(async () => window.__landvasApi.myExplorer());
  const padBox = await page.locator('[data-testid=joystick-pad]').boundingBox();
  const cx = padBox.x + padBox.width / 2, cy = padBox.y + padBox.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy - 10, { steps: 6 });
  await page.waitForTimeout(3200);
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const exAfter = await page.evaluate(async () => window.__landvasApi.myExplorer());
  const movedM = (() => {
    const r = Math.PI / 180, a = exBefore, b = exAfter;
    const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
  })();
  await shot('08b-joystick');
  check('the joystick moves the explorer (server-checked) and drains the tank', exAfter.mode === 'manual' && movedM > 8 && movedM < 80 && exAfter.joystick.seconds_left < exBefore.joystick.seconds_left && exAfter.lng > exBefore.lng,
    `${movedM.toFixed(1)} m, tank ${Number(exBefore.joystick.seconds_left).toFixed(1)} → ${Number(exAfter.joystick.seconds_left).toFixed(1)} s`);
  await page.click('[data-testid=joystick-close]');
  await page.click('[data-testid=tilt-3d]');
  await page.waitForFunction(() => window.__landvasMap.getPitch() > 40, null, { timeout: 8000 }).catch(() => {});
  const pitch = await page.evaluate(() => window.__landvasMap.getPitch());
  check('the 3D button tilts the map', pitch > 40, pitch.toFixed(1));
  await page.click('[data-testid=tilt-3d]');
  await page.waitForTimeout(1200);

  // paint + publish the starter plot, then see it on the map
  const groups = await page.evaluate(async () => window.__landvasApi.myGroups());
  const starterGroup = groups.find((g) => g.cells.some((c) => c[0] === START.gx && c[1] === START.gy));
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
  // a remounted map can take a while to load in software-rendered headless Chrome
  await page.waitForFunction(() => !!window.__landvasMap?.getSource?.('lv-art'), null, { timeout: 90000 });
  await page.evaluate(() => document.querySelector('[data-testid=plot-panel] button[aria-label="Close plot panel"]')?.click());
  await gotoPlot(page, START.gx, START.gy, 22);
  await page.waitForFunction(() => window.__landvasMap.areTilesLoaded(), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const f = path.join(OUT, '09-art-on-map.png');
  await page.screenshot({ path: f, timeout: 90000 });
  const at = await screenOf(page, START.gx, START.gy, 0.3, 0.3);
  const px = await pixelAt(f, at.x, at.y);
  const artOk = near(px, [255, 61, 154], 70);
  check('published art visible on the map', artOk, JSON.stringify(px));
  if (!artOk) {
    const diag = await page.evaluate(async ([START_GX, START_GY]) => {
      const m = window.__landvasMap;
      const tm = m.style.tileManagers?.['lv-art'];
      let tiles = '';
      try { tiles = tm._inViewTiles.getAllIds().map((id) => { const t = tm._inViewTiles.getTileById(id); const c = t.tileID.canonical; return `${c.z}/${c.x}/${c.y}:${t.state}`; }).join(' '); } catch (e) { tiles = 'ERR ' + e; }
      const idx = await window.__landvasApi.artTileIndex(22, [[START_GX >> 4, START_GY >> 4]]);
      const pubs = await window.__landvasApi.myPublications();
      return { zoom: m.getZoom(), center: m.getCenter(), mode: m.getPaintProperty('lv-groups-line', 'line-opacity'), tiles, idx, pubs: pubs.map((p) => [p.status, p.plot_count, p.title]), log: (window.__lvartLog || []).slice(-30) };
    }, [START.gx, START.gy]);
    console.log('ARTDIAG', JSON.stringify(diag, null, 1));
    await page.evaluate(() => window.__landvasMap.triggerRepaint());
    await page.waitForTimeout(800);
    await shot('09b-after-repaint');
  }

  // persistence across reload
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=world-map]', { timeout: 60000 });
  const persisted = await page.evaluate(async () => {
    const s = await window.__landvasApi.myState();
    return { plots: s.plot_count, usd: Number(s.rent.live_usd), explorer: !!s.explorer, ink: s.balances.ink };
  });
  check('plots, rent, explorer and Ink persist across reload', persisted.plots === 2 && persisted.usd > 0 && persisted.explorer, JSON.stringify(persisted));

  // every screen renders without crashing
  await page.evaluate(async () => { await window.__landvasApi.devGrantSelfAdmin(); });
  const screens = ['/', '/canvases', '/play', '/gallery', '/players', '/achievements', '/leaderboards', '/inventory', '/events', '/settings', '/legal/rent', '/me', '/u/ava_explorer', '/u/ava_explorer/room', '/social', '/social?tab=chat', '/social?tab=friends', '/invite', '/explorer', '/admin'];
  const broken = [];
  for (const sc of screens) {
    await page.evaluate((p) => window.__landvasNav(p), sc);
    await page.waitForTimeout(1200);
    if (sc === '/') await page.waitForSelector('[data-testid=homepage]', { timeout: 15000 }).catch(() => {}); // a bigger lazy chunk
    const txt = await page.evaluate(() => (document.querySelector('[data-testid=homepage]') ?? document.querySelector('main, [class*=gutter]'))?.textContent ?? document.body.textContent ?? '');
    if (txt.trim().length < 30 || /Something went wrong/i.test(txt)) broken.push(sc);
  }
  check('all screens render', broken.length === 0, broken.join(', '));
  await shot('11-admin');
  for (const tab of ['overview', 'players', 'earnings', 'world', 'plots', 'social', 'shop', 'flags', 'system']) {
    await page.evaluate((t) => { location.hash = t; }, tab);
    await page.evaluate(() => window.__landvasNav('/admin'));
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: new RegExp(`^${{ overview: 'Dashboard', players: 'Players', earnings: 'Earnings', world: 'World', plots: 'Plots', social: 'Social', shop: 'Shop', flags: 'Switches', system: 'System' }[tab]}`) }).click().catch(() => {});
    await page.waitForTimeout(900);
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '');
    if (t.trim().length < 60 || /Something went wrong/i.test(t)) broken.push(`/admin#${tab}`);
  }
  await page.getByRole('tab', { name: /^Earnings/ }).click();
  await page.waitForSelector('[data-testid=save-minigames]', { timeout: 10000 });
  await shot('11b-admin-earnings');
  check('admin hub tabs render', broken.length === 0, broken.join(', '));
  await page.evaluate(() => window.__landvasNav('/players'));
  await page.waitForSelector('[data-testid=player-card]', { timeout: 15000 });
  await shot('12-players');
  check('players page lists real players', (await page.locator('[data-testid=player-card]').count()) >= 1);

  // the visit room shows land and art without any location
  await page.evaluate(() => window.__landvasNav('/u/ava_explorer/room'));
  await page.waitForSelector('[data-testid=room-canvases]', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot('13-visit-room');
  const room = await page.evaluate(async () => {
    const land = await window.__landvasApi.playerLand('ava_explorer');
    const text = document.querySelector('[data-testid=visit-room]')?.textContent ?? '';
    const shapes = land.canvases.map(({ art, ...c }) => c);
    return {
      canvases: document.querySelectorAll('[data-testid=room-canvases] canvas').length,
      // canvases carry shapes relative to their own corner, never map coordinates
      coordsInData: JSON.stringify(shapes).match(/"(gx|gy|min_gx|min_gy|max_gx|max_gy|center_lng|center_lat|lng|lat)"/g) ?? [],
      relative: land.canvases.every((c) => c.cells.every((x) => x[0] < c.width && x[1] < c.height)),
      coordsOnPage: /-?\d{1,3}\.\d{3,}°/.test(text),
    };
  });
  check('visit room shows their canvases with no coordinates anywhere', room.canvases >= 1 && !room.coordsInData.length && room.relative && !room.coordsOnPage, JSON.stringify(room));

  // USD rent converts to Ink at $1 = 100 Ink, from a single cent
  const conv = await page.evaluate(async () => {
    const s0 = await window.__landvasApi.myState();
    await window.__landvasApi.admin.adjustRent(s0.user_id, 0.05, 'e2e top-up');
    const r = await window.__landvasApi.convertUsd(0.01);
    return { ink: r.ink, usd: Number(r.usd), before: Number(s0.balances.ink), after: Number(r.balances.ink) };
  });
  check('converting $0.01 of rent gives 1 Ink', conv.ink === 1 && Math.abs(conv.usd - 0.01) < 1e-9 && conv.after === conv.before + 1, JSON.stringify(conv));

  // dress the explorer: buy a cap with Ink and wear it
  await page.evaluate(() => window.__landvasNav('/explorer'));
  await page.waitForSelector('[data-testid=explorer-items]', { timeout: 15000 });
  const look = await page.evaluate(async () => {
    const api = window.__landvasApi;
    const s = await api.myState();
    if (Number(s.balances.ink) < 40) await api.admin.adjustBalance(s.user_id, 'ink', 40, 'e2e test top-up');
    await api.purchaseUnlock('explorer.hat.cap');
    const p = await api.equipExplorer({ hat: 'cap', trail: 'none' });
    return p.explorer_style;
  });
  check('explorer cosmetics are bought with Ink and worn', look?.hat === 'cap', JSON.stringify(look));

  // global chat and the live feed
  await page.evaluate(() => window.__landvasNav('/social?tab=chat'));
  await page.waitForSelector('[data-testid=chat-input]', { timeout: 15000 });
  await page.fill('[data-testid=chat-input]', 'Hello from the launch test!');
  await page.click('[data-testid=chat-send]');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=chat-message]')].some((m) => m.textContent.includes('Hello from the launch test!')), null, { timeout: 15000 });
  await shot('14-chat');
  check('global chat sends and shows messages', true);
  await page.evaluate(() => window.__landvasNav('/social?tab=feed'));
  await page.waitForSelector('[data-testid=feed-row]', { timeout: 15000 });
  const kinds = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-testid=feed-row]')].map((r) => r.getAttribute('data-kind')))]);
  check('live feed shows joins, claims and new art', kinds.includes('join') && kinds.includes('claim'), kinds.join(','));

  // invites: everyone has a code
  await page.evaluate(() => window.__landvasNav('/invite'));
  await page.waitForSelector('[data-testid=invite-code]', { timeout: 15000 });
  const code = await page.textContent('[data-testid=invite-code]');
  const artId = await page.evaluate(async () => (await window.__landvasApi.galleryList('mine', 5))[0]?.id);
  await page.evaluate((id) => window.__landvasNav(`/art/${id}`), artId);
  await page.waitForTimeout(2500);
  check('artwork pages have no “view on the map” link', !!artId && !/View on the map|Live on map/i.test(await page.textContent('body') ?? ''), String(artId));
  const regional = await page.evaluate(async () => window.__landvasApi.galleryList('regional', 10, 0, { min_gx: 0, min_gy: 0, max_gx: 4194303, max_gy: 4194303 }));
  check('art can’t be searched by place', Array.isArray(regional) && regional.length === 0, String(regional?.length));
  check('every player has an invite code', code?.trim() === 'AVA_EXPLORER', String(code));

  // merge several plots at once: Canvases → "merge with the ones touching it" → one tap on the map bar
  const groupsBefore = await page.evaluate(async () => (await window.__landvasApi.myGroups()).filter((g) => g.status === 'active').length);
  await page.evaluate(() => window.__landvasNav('/canvases'));
  await page.waitForSelector('[data-testid=merge-touching]', { timeout: 15000 });
  await page.click('[data-testid=merge-touching]');
  await page.waitForSelector('[data-testid=merge-bar]', { timeout: 20000 });
  await page.waitForSelector('[data-testid=merge-go]:not([disabled])', { timeout: 15000 });
  await page.click('[data-testid=merge-go]');
  await page.waitForFunction(() => !document.querySelector('[data-testid=merge-bar]'), null, { timeout: 20000 });
  const groupsAfter = await page.evaluate(async () => (await window.__landvasApi.myGroups()).filter((g) => g.status === 'active'));
  check('several plots merge in one go', groupsBefore >= 2 && groupsAfter.length === 1 && groupsAfter[0].plot_count === 2, `${groupsBefore} → ${groupsAfter.length} canvases`);

  // boost a game: it jumps to the top of Play with its rate
  const boostGame = await page.evaluate(async () => {
    const api = window.__landvasApi;
    const cfg = (await api.admin.configGet()).config.minigames.value;
    const g = 'rollermural';
    await api.admin.configSet('minigames', { ...cfg, games: { ...cfg.games, [g]: { ...cfg.games[g], boost: { multiplier: 3, ends_at: new Date(Date.now() + 7200_000).toISOString() } } } });
    return g;
  });
  // (the local test build can't serve deep links on reload: reload at / and navigate in-app;
  //  its in-browser database also saves to disk in the background, so give it a moment first)
  await page.waitForTimeout(4000);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__landvasNav, null, { timeout: 60000 });
  await page.evaluate(() => window.__landvasNav('/play'));
  await page.waitForSelector(`[data-testid=boost-${boostGame}]`, { timeout: 30000 }).catch(() => {});
  const playOrder = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=game-card-]')].map((e) => e.getAttribute('data-testid').replace('game-card-', '')));
  const boostTxt = await page.textContent(`[data-testid=boost-${boostGame}]`).catch(() => '');
  check('a boosted game shows first with its rate', playOrder[0] === boostGame && /3× Ink/.test(boostTxt), `${playOrder.join(',')} | ${boostTxt}`);
  check('the Play page doesn’t list every plot', (await page.locator('[data-testid^=game-card-] a[href*="gx="]').count()) === 0);

  // site-wide updates: staff send one, players get the popup and the bell
  await page.evaluate(async () => window.__landvasApi.admin.saveAnnouncement({ title: 'Eight minigames!', body: 'Memory Mural, Sculptor, HueFlow and Mirrorline are live.', kind: 'update', link: '/play', popup: true, active: true }));
  await page.waitForTimeout(4000);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__landvasNav, null, { timeout: 60000 });
  await page.evaluate(() => window.__landvasNav('/gallery'));
  const popped = await page.waitForSelector('[data-testid=announcement-popup]', { timeout: 30000 }).then(() => true).catch(() => false);
  const popupText = popped ? await page.textContent('[data-testid=announcement-popup]') : '';
  if (popped) await page.click('[data-testid=announcement-dismiss]');
  await page.waitForTimeout(1500);
  const notes = await page.evaluate(async () => window.__landvasApi.notifications());
  check('updates pop up once and land on the bell', popped && /Memory Mural/.test(popupText) && notes.unread_announcements === 0 && notes.announcements[0]?.title === 'Eight minigames!', JSON.stringify({ popped, unread: notes.unread_announcements }));
  await page.click('[data-testid=notification-bell]');
  const panel = await page.waitForSelector('[data-testid=updates-panel]', { timeout: 10000 }).then(() => page.textContent('[data-testid=updates-panel]')).catch(() => '');
  check('the bell lists the update', /Eight minigames!/.test(panel));
  await page.keyboard.press('Escape');

  // support tickets replace public emails
  await page.evaluate(() => window.__landvasNav('/support'));
  await page.click('[data-testid=support-new]');
  await page.fill('#st-subject', 'My Ink went missing');
  await page.fill('#st-body', 'After winning Sculptor my Ink did not go up.');
  await page.click('[data-testid=support-send]');
  await page.waitForSelector('[data-testid=support-thread]', { timeout: 15000 });
  const mine = await page.evaluate(async () => window.__landvasApi.supportMine());
  check('players can open a support ticket in the app', mine.length === 1 && mine[0].subject === 'My Ink went missing' && mine[0].status === 'open');
  await page.evaluate(() => window.__landvasNav('/legal/terms'));
  await page.waitForTimeout(1500);
  const legalTxt = await page.textContent('body');
  await page.evaluate(() => window.__landvasNav('/settings'));
  await page.waitForTimeout(1500);
  const settingsTxt = await page.textContent('body');
  check('no email addresses are shown anywhere public', !/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test((legalTxt + settingsTxt).replaceAll('ava@example.test', ''))); // (your own sign-in email shows only to you, in Settings)

  // every minigame (incl. the four new ones) plays all 5 rounds and passes the server's validator
  for (const [g, lv] of [['tracecraft', 1], ['colorburst', 1], ['patternshift', 1], ['lightlines', 1], ['memorymural', 1], ['sculptor', 1], ['rollermural', 1], ['mirrorline', 1], ['memorymural', 10], ['sculptor', 10], ['rollermural', 10], ['mirrorline', 10]]) {
    await page.evaluate(([g, lv]) => window.__landvasNav(`/play-sandbox/${g}?level=${lv}&rounds=5`), [g, lv]);
    await page.waitForFunction(() => !!window.__landvasGame && !document.querySelector('[data-testid=sandbox-result]'), null, { timeout: 20000 });
    await page.waitForTimeout(600);
    if (lv === 1 && ['memorymural', 'sculptor', 'rollermural', 'mirrorline'].includes(g)) { await page.waitForTimeout(400); await shot(`12-${g}`); }
    await page.evaluate(() => window.__landvasGame.autoSolve());
    await page.waitForSelector(`[data-testid=sandbox-result][data-game=${g}]`, { timeout: 150000 });
    const res = JSON.parse(await page.textContent('[data-testid=sandbox-result]'));
    check(`${g} level ${lv}: 5 rounds played and validated`, res.valid && res.passed, JSON.stringify({ v: res.valid, p: res.passed, s: res.summary?.passed_rounds ?? res.summary?.passed_shapes ?? res.summary?.passed_rounds, r: res.reason, f: res.flags }));
  }

  // phone layout (local mode allows one tab per device, so close the desktop one first)
  await page.close();
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
