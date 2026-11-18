// Real-browser test of Art's places (wave 1, step 1), phone-sized, on the offline build:
// the Studio → through the doors into the Gallery → hang a piece with the hang sheet (frame, light, plaque) → open a
// show → visit another player's Gallery as a visitor → admire a piece (Renown both ways) → room chat and invite are there.
// Run: npm run build:artifact && node tests/e2e/art-gallery.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-art-gallery');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4211, G = 4194304;
const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 };
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { longitude: ((gx + 0.5) / G) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

const server = await serve(DIST, PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { ...ll(START.gx, START.gy), accuracy: 8 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = async (n) => { try { await page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }); } catch { console.log(`note  screenshot ${n} skipped`); } };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const walkTo = async (spot) => {
  await page.evaluate((s) => window.__landvasPlace.scene.walkTo(s), spot);
  await page.waitForFunction((s) => window.__landvasPlace.scene.debug().near === s, spot, { timeout: 20000 });
  await page.waitForTimeout(400);
};
const tools = async (id) => { await page.click('[data-testid=preview-tools]'); await page.click(`[data-testid=${id}]`); };

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'ada@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'ada_gallery'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForTimeout(1500);

  // ---- my own Estate: the Studio, then the Gallery behind its doors ----
  await tools('pv-mine');
  await page.waitForSelector('[data-testid=art-place][data-tier=gallery]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  check('the Art Estate opens as a Studio with a Gallery behind it', true);
  check('the room chat and the invite button are there', (await page.locator('[data-testid=place-chat]').count()) > 0 && (await page.locator('[data-testid=place-invite]').count()) === 1);
  await shot('01-studio');
  await walkTo('easel');
  check('the easel offers painting the mural', /Paint your mural/.test(await page.locator('[data-testid=art-action]').innerText()));
  await walkTo('window'); await shot('02-window');
  // into the Gallery: an empty wall offers a piece
  await walkTo('slot:r1l1');
  check('an empty wall offers to hang a piece', /Hang a piece/.test(await page.locator('[data-testid=art-action]').innerText()));
  await shot('03-gallery-empty');
  await page.click('[data-testid=art-action]');
  await page.waitForSelector("[data-testid=hang-works]", { timeout: 10000 });
  await page.locator('[data-testid=hang-works] button').nth(2).click();
  await page.fill('[data-testid=hang-title]', 'Wasatch, first light');
  await page.fill('[data-testid=hang-story]', 'Hiked up before dawn for this one.');
  await page.waitForTimeout(800);
  await shot('04-hang-sheet');
  await page.click('[data-testid=hang-save]');
  await page.waitForFunction(() => !document.querySelector('[data-testid=hang-works]'), null, { timeout: 15000 });
  await page.waitForTimeout(900);
  let p = await api('artPlace', (await page.evaluate(() => window.__landvasPath())).split('/')[2]);
  check('the piece hangs where it was put, with its plaque', p.hall.hangs.length === 1 && p.hall.hangs[0].slot === 'r1l1' && p.hall.hangs[0].plaque_title === 'Wasatch, first light');
  await shot('05-hung');
  // two more, then open a show at the desk
  const gid = p.group_id, works = p.works;
  await api('galleryHang', gid, 'r1r1', works[0].id, { frame: 'oak', light: 'warm', power: 66, aim: 0, title: 'Dusk', story: 'Ten minutes of glass.' });
  await api('galleryHang', gid, 'r2l1', works[3].id, { frame: 'oak', light: 'warm', power: 60, aim: -10, title: null, story: null });
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['art-place'] })); await page.waitForTimeout(1500);
  await walkTo('desk'); await page.click('[data-testid=art-action]');
  await page.waitForSelector('[data-testid=show-score]', { timeout: 10000 });
  await page.fill('[data-testid=show-title]', 'First Light');
  await shot('06-show-desk');
  await page.click('[data-testid=open-show]');
  await page.waitForFunction(() => !document.querySelector('[data-testid=show-score]'), null, { timeout: 15000 });
  p = await api('artPlace', gid);
  check('the show opens with its title', p.hall.show?.title === 'First Light', JSON.stringify(p.hall.show));
  await page.waitForTimeout(2500);
  await walkTo('slot:r1r1'); await shot('07-show-on');
  // the Renown shop
  await walkTo('desk'); await page.click('[data-testid=art-action]'); await page.getByText('✦ Renown shop').click(); await page.waitForSelector('[data-testid=renown-shop]');
  await shot('08-shop'); await page.keyboard.press('Escape'); await page.waitForTimeout(500);

  // ---- someone else's Gallery, as a visitor ----
  await tools('pv-mira');
  await page.waitForSelector('[data-testid=art-place][data-tier=gallery]', { timeout: 30000 });
  await page.waitForFunction(() => /mira_paints/.test(document.querySelector('[data-testid=art-place]')?.textContent ?? ''), null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  await shot('09-mira-gallery');
  const mira = (await page.evaluate(() => window.__landvasPath())).split('/')[2];
  const before = (await api('artPlace', mira)).me.renown;
  await walkTo('slot:r2l1'); await shot('10-mira-piece-near');
  await page.click('[data-testid=art-action]'); await page.waitForSelector('[data-testid=admire]');
  await shot('11-piece-sheet');
  await page.click('[data-testid=admire]');
  await page.waitForFunction(() => /Admired today/.test(document.querySelector('[data-testid=admire]')?.textContent ?? ''), null, { timeout: 10000 });
  const after = (await api('artPlace', mira)).me.renown;
  check('admiring a piece pays the visitor Renown', after === before + 1, `${before} → ${after}`);
  await page.waitForTimeout(400); await shot('12-admired');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await walkTo('potw'); await shot('13-potw');
  // walls between the camera and you get out of the way (here: the Studio's wall, right behind you)
  const faded = await page.evaluate(() => window.__landvasPlace.scene.debug().fades.filter((f) => f.k < 0.5).length);
  check('walls between you and the camera fade out of the way', faded >= 1, `${faded} faded`);
} catch (e) {
  check('the walk-through finished', false, String(e?.message ?? e));
  await shot('zz-failure');
} finally {
  check('no errors on the page', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
