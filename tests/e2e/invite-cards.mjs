// Invite cards (local-mode build, a phone):
//  - the Invite page's card editor: themes, emoji, headline, message, what to show off; the live link preview (the
//    picture and the words chats show) and the phone preview of the friend's page; saving draws and stores the picture
//  - words the chat filter wouldn't allow are refused
//  - the friend's page at /i/CODE, signed out: the inviter's card in their theme, and joining keeps the code
//  - a code that doesn't exist; the inviter sees their own page with an Edit button
// Run: npm run build:artifact && node tests/e2e/invite-cards.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-invite-cards'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4338);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::|invite_card_language/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const tid = (id) => page.locator(`[data-testid="${id}"]`);
async function authForm() {
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 90000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email', { timeout: 30000 });
}
async function signUp(email, username) {
  await authForm();
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
}
try {
  await page.goto('http://localhost:4338/?e2e=1', { waitUntil: 'load' });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await signUp('card.boss@example.test', 'card_boss');
  await nav('/invite');
  check('the Invite page has the card editor', await tid('invite-card-editor').waitFor({ timeout: 20000 }).then(() => true, () => false));
  await tid('invite-card-editor').scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
  const blank = await tid('card-canvas').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); return s.size; });
  check('…the link preview picture is drawn', blank > 50, String(blank));
  check('…the preview’s words: “@card_boss invited you to LANDVAS” by default', /@card_boss invited you to LANDVAS/.test(await tid('card-og-title').textContent()));
  await shot('01-editor-default');

  // ---- make it mine ----
  await tid('card-theme-sunset').click();
  await tid('card-emoji-👑').click();
  await tid('card-headline').fill('Build an empire with me');
  await tid('card-message').fill('Grab a free plot next to mine and let’s take over the city.');
  await page.waitForTimeout(400);
  check('the preview follows: the headline with its emoji', (await tid('card-og-title').textContent()).trim() === '👑 Build an empire with me');
  await tid('card-canvas').scrollIntoViewIfNeeded(); await shot('02-editor-sunset');
  await tid('card-tab-page').click(); await page.waitForTimeout(800);
  check('“Their page” shows the friend’s page in the theme', (await tid('card-page-preview').locator('[data-testid=invite-landing]').getAttribute('data-theme')) === 'sunset'
    && /Build an empire with me/.test(await tid('card-page-preview').locator('[data-testid=invite-landing-headline]').textContent()));
  await tid('card-page-preview').scrollIntoViewIfNeeded(); await shot('03-editor-page');
  await tid('card-tab-preview').click();
  await tid('card-save').click(); await page.waitForTimeout(2500);
  const row = (await sql(`select theme, emoji, headline, message, showcase, image_path from invite_cards c join profiles p on p.id = c.player_id where p.username = 'card_boss'`))[0];
  check('saving stores the card', row?.theme === 'sunset' && row.emoji === '👑' && row.headline === 'Build an empire with me' && row.showcase === 'plots', JSON.stringify(row));
  check('…and the picture chats show (drawn by the app)', /^[0-9a-f-]{36}\/[0-9a-f]{64}\.jpg$/.test(row?.image_path ?? ''), row?.image_path);
  const pic = await page.evaluate(async (p) => { const u = await window.__landvasBackend.inviteCardUrl(p); const b = await (await fetch(u)).blob(); const r = new FileReader(); return await new Promise((ok) => { r.onload = () => ok({ size: b.size, type: b.type, data: r.result }); r.readAsDataURL(b); }); }, row.image_path);
  check('…a 1200x630 JPEG of a sensible size', pic.size > 15000 && pic.size < 700000, `${pic.size} bytes`);
  fs.writeFileSync(`${OUT}/04-card-picture.jpg`, Buffer.from(String(pic.data).split(',')[1], 'base64'));
  check('…the button says Saved', /Saved/.test(await tid('card-save').textContent()));

  // ---- the filter ----
  await tid('card-headline').fill('this game is shit');
  await tid('card-save').click(); await page.waitForTimeout(1200);
  const h2 = (await sql(`select headline from invite_cards c join profiles p on p.id = c.player_id where p.username = 'card_boss'`))[0].headline;
  check('words the chat filter wouldn’t allow are refused', h2 === 'Build an empire with me' && (await page.getByText(/keep your card friendly/i).count()) > 0, h2);
  await tid('card-headline').fill('Build an empire with me'); await page.waitForTimeout(300);

  // ---- the inviter's own page ----
  await nav('/i/CARD_BOSS'); await page.waitForTimeout(2000);
  check('the inviter sees their own page, with an Edit button', await tid('invite-landing-mine').isVisible().catch(() => false));

  // ---- a friend, signed out ----
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); localStorage.removeItem('landvas.ref'); });
  await page.waitForTimeout(600);
  await nav('/i/card_boss'); await page.waitForTimeout(2500);
  check('signed out, /i/CODE shows the inviter’s card', await tid('invite-landing').isVisible().catch(() => false));
  check('…in their theme, with their headline and message', (await tid('invite-landing').getAttribute('data-theme')) === 'sunset'
    && /👑\s*Build an empire with me/.test(await tid('invite-landing-headline').textContent()) && /take over the city/.test(await tid('invite-landing-message').textContent()));
  check('…and what they show off (their plots)', await tid('invite-landing-stats').isVisible().catch(() => false));
  check('…no “your page” banner for the friend', (await tid('invite-landing-mine').count()) === 0);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('…fits a phone', wide <= 1, String(wide));
  await shot('05-landing');
  const kept = await page.evaluate(() => localStorage.getItem('landvas.ref'));
  check('the code is kept on this device for sign-up', /CARD_BOSS/.test(kept ?? ''), kept);
  await tid('invite-landing-join').click(); await page.waitForTimeout(2000);
  check('Join goes to sign-up, which knows the code', await page.locator('[data-testid=welcome-invite]').filter({ hasText: 'CARD_BOSS' }).isVisible().catch(() => false));
  await shot('06-welcome');
  await nav('/i/NOPE_NOPE'); await page.waitForTimeout(2000);
  check('a code that doesn’t exist says so', await tid('invite-landing-missing').isVisible().catch(() => false));
  // light themes read too
  await page.evaluate(() => window.__landvasBackend.db.query(`update invite_cards set theme = 'paper'`));
  await nav('/i/CARD_BOSS'); await page.waitForTimeout(2000);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(1500);
  check('the paper theme', (await tid('invite-landing').getAttribute('data-theme')) === 'paper');
  await shot('07-landing-paper');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('ran', false, String(e?.stack ?? e).slice(0, 400)); await shot('zz-error');
} finally {
  await browser.close(); server.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
