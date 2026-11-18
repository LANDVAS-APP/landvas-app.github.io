// Real-browser test of the Museum (Estates & Domains wave 1, step 2), phone-sized, on the offline build:
// my Museum (Rotunda, rooms, the Loan Wing with borrowed pieces) → open Exhibition Night → ask to borrow a piece at the
// loan desk → step inside one of my paintings and take a spark → visit Mira's Museum: take her exhibition's stamp,
// find a spark inside her painting (Renown both ways) → answer Mira's loan request on the loans page.
// Run: npm run build:artifact && node tests/e2e/museum.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-museum');
fs.mkdirSync(OUT, { recursive: true });
const DIST = process.env.E2E_DIST || 'dist-artifact';
const PORT = 4212, G = 4194304;
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
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const groupOf = async () => (await page.evaluate(() => window.__landvasPath())).split('/')[2];
/** go straight to a spot (the walk itself is the gallery test's) */
const at = async (spot) => {
  const sp = await page.evaluate((s) => window.__landvasPlace.world.spots.find((x) => x.id === s), spot);
  await page.evaluate(([x, z]) => window.__landvasPlace.scene.place(x, z, 1), [sp.x, sp.z]);
  await page.waitForFunction((s) => window.__landvasPlace.scene.debug().near === s, spot, { timeout: 30000 });
  await page.waitForTimeout(600);
};
const tools = async (id) => { await page.click('[data-testid=preview-tools]'); await page.click(`[data-testid=${id}]`); };
/** step inside the painting at a slot, then stand on its first untaken spark (after the museum counts you inside) */
const sparkInside = async (slot) => {
  await at(`slot:${slot}`); await page.click('[data-testid=art-action]');
  await page.waitForSelector('[data-testid=step-inside]'); await page.click('[data-testid=step-inside]');
  await page.waitForSelector('[data-testid=diorama]', { timeout: 15000 });
  await page.waitForFunction(() => window.__landvasDiorama?.world.spots.some((s) => s.id.startsWith('spark:') && !s.off), null, { timeout: 30000 });
  const before = await page.locator('[data-testid=sparks-found]').innerText();
  const sp = await page.evaluate(() => window.__landvasDiorama.world.spots.find((s) => s.id.startsWith('spark:') && !s.off));
  await page.evaluate(([x, z]) => window.__landvasDiorama.scene.place(x, z, 1), [sp.x, sp.z]);
  await page.waitForFunction((b) => document.querySelector('[data-testid=sparks-found]')?.textContent !== b, before, { timeout: 30000 });
  return { before, after: await page.locator('[data-testid=sparks-found]').innerText() };
};

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.fill('#email', 'max@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'max_museum'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=place-gps]', { timeout: 20000 }); await page.click('[data-testid=place-gps]');
  await page.waitForTimeout(1500);

  // ---- my Museum ----
  await tools('pv-museum');
  await page.waitForSelector('[data-testid=art-place][data-tier=museum]', { timeout: 60000 });
  await page.waitForTimeout(3000);
  const mine = await groupOf();
  let p = await api('artPlace', mine);
  check('the Art Domain opens as a Museum with 5 rooms, its Rotunda and two borrowed pieces', p.tier === 'museum' && p.hall.rooms === 5 && p.museum.loans.length === 2, `${p.tier} · ${p.hall.rooms} rooms · ${p.museum.loans.length} loans`);
  check('the room chat and the invite button are there', (await page.locator('[data-testid=place-chat]').count()) > 0 && (await page.locator('[data-testid=place-invite]').count()) === 1);
  await shot('01-rotunda');
  // Exhibition Night at the plinth
  await at('exhibit'); await page.click('[data-testid=art-action]');
  await page.waitForSelector('[data-testid=exhibit-open]'); await shot('02-exhibit-sheet');
  await page.click('[data-testid=exhibit-open]');
  await page.waitForFunction(() => !document.querySelector('[data-testid=exhibit-open]'), null, { timeout: 15000 });
  p = await api('artPlace', mine);
  check('Exhibition Night opens for a piece on the walls', p.museum.exhibition?.no === 1, JSON.stringify(p.museum.exhibition?.piece?.title));
  await page.waitForTimeout(2500); await shot('03-hologram');
  // the loan desk: ask to borrow another of Mira's pieces
  await at('loandesk'); await page.click('[data-testid=art-action]');
  await page.waitForSelector('[data-testid=loan-borrow]');
  await page.fill('[data-testid=loan-name]', '@mira_paints'); await page.click('[data-testid=loan-look]');
  await page.waitForSelector('[data-testid=loan-pieces]', { timeout: 15000 });
  await page.locator('[data-testid=loan-ask]').first().click();
  await page.waitForTimeout(1500); await shot('04-loan-desk');
  p = await api('artPlace', mine);
  check('asking to borrow a piece puts the request on the desk', (p.museum.requests ?? []).length >= 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // the Loan Wing
  await at('slot:w1'); await shot('05-loan-wing');
  check('a borrowed piece hangs in the Loan Wing', /🖼️/.test(await page.locator('[data-testid=art-action]').innerText()));
  // inside one of my paintings
  const own = await sparkInside('r1l1');
  await shot('06-inside');
  check('stepping inside a painting and walking onto a spark takes it', own.after !== own.before, `${own.before} → ${own.after}`);
  await page.click('[data-testid=step-out]'); await page.waitForTimeout(1200);

  // ---- Mira's Museum, as a visitor ----
  await tools('pv-mira-museum');
  await page.waitForFunction(() => /mira_paints/.test(document.querySelector('[data-testid=art-place]')?.textContent ?? ''), null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  const mira = await groupOf();
  const r0 = (await api('artPlace', mira)).me.renown;
  await at('exhibit'); await page.click('[data-testid=art-action]');
  await page.waitForSelector('[data-testid=exhibit-stamp]'); await shot('07-exhibit-visitor');
  await page.click('[data-testid=exhibit-stamp]');
  await page.waitForFunction(() => /Stamped/.test(document.querySelector('[data-testid=exhibit-stamp]')?.textContent ?? ''), null, { timeout: 15000 });
  const r1 = (await api('artPlace', mira)).me.renown;
  check('taking the exhibition stamp pays the visitor Renown', r1 === r0 + 2, `${r0} → ${r1}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const theirs = await sparkInside('r1l1');
  const r2 = (await api('artPlace', mira)).me.renown;
  await shot('08-inside-hers');
  check('a spark inside someone else’s painting pays the finder', r2 === r1 + 2, `${theirs.before} → ${theirs.after} · ${r1} → ${r2}`);
  await page.click('[data-testid=step-out]'); await page.waitForTimeout(1000);

  // ---- the artist's side: Mira asked to borrow one of mine ----
  await tools('pv-loans');
  await page.waitForSelector('[data-testid=artist-loans]', { timeout: 20000 });
  await shot('09-loans');
  await page.locator('[data-testid=loan-yes]').first().click();
  await page.waitForTimeout(1500);
  const lent = await sql(`select count(*)::int n from museum_loans l join profiles p on p.id = l.artist_id where p.username = 'max_museum' and l.status = 'active'`);
  check('saying yes lends the piece', lent[0].n === 1, JSON.stringify(lent));
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
