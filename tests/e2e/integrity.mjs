// Integrity: an alt and a self-referrer share a phone; the admin scans, opens the cheater, sees the evidence, suspends
// them with a reason, proof and the invite Ink taken back; the cheater signs in and sees why and where to appeal.
// Run: npm run build:artifact && node tests/e2e/integrity.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-integrity'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4314);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|account_restricted/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
async function authForm() {
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email', { timeout: 30000 });
}
async function signUp(email, username) {
  await authForm();
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', username); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
}
async function signOut() {
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(600); await page.evaluate(() => window.__landvasNav('/world')); await page.waitForTimeout(1500);
}
async function signIn(email) {
  await signOut(); await authForm();
  await page.locator('button').filter({ hasText: /^Sign in$/ }).first().click().catch(() => {}); await page.waitForTimeout(300);
  await page.fill('#email', email); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForTimeout(3000);
}
try {
  await page.goto('http://localhost:4314/?e2e=1', { waitUntil: 'load' });
  await signUp('amy.jones+alt@gmail.com', 'alt_amy');
  await signOut(); await signUp('amyjones@gmail.com', 'cheat_cara');
  await signOut(); await signUp('mod@example.test', 'mod_mo');
  const id = async (u) => (await sql(`select id from profiles where username = '${u}'`))[0].id;
  const [alt, cara, mod] = [await id('alt_amy'), await id('cheat_cara'), await id('mod_mo')];
  await sql(`insert into admin_roles (player_id, role) values ('${mod}', 'owner') on conflict do nothing`);
  // Cara invited Amy — from the same phone — and got the bonus
  await sql(`insert into referrals (referee_id, referrer_id, code, status, reward_ink, created_at, qualified_at) values ('${alt}', '${cara}', 'CARA', 'rewarded', 500, now() - interval '5 days', now() - interval '5 days')`);
  await sql(`insert into resource_ledger (player_id, resource, delta, balance_after, reason) values ('${cara}', 'ink', 500, 500, 'referral')`);
  await sql(`insert into resource_balances (player_id, resource, amount) values ('${cara}', 'ink', 500) on conflict (player_id, resource) do update set amount = resource_balances.amount + 500`);
  await sql(`insert into private.sightings (player_id, device_id, fp_hash, platform, ua) values ('${cara}', 'phone-1', 'fp-1', 'android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)'), ('${alt}', 'phone-1', 'fp-1', 'android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)')`);
  // the mod's own session reports itself (the app does this by itself)
  await page.waitForTimeout(1000);
  const seen = await sql(`select player_id, device_id from private.sightings where player_id in ('${alt}', '${cara}', '${mod}') and device_id <> 'phone-1'`);
  check('each account reported its session on this device', new Set(seen.map((r) => r.player_id)).size === 3, String(seen.length));
  check('…with the same install id, so they link up', new Set(seen.map((r) => r.device_id)).size === 1);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);
  await page.evaluate(() => { location.hash = 'integrity'; window.__landvasNav('/admin'); }); await page.waitForTimeout(600);
  await page.getByRole('tab', { name: /^Integrity/ }).click().catch(() => {});
  await page.waitForSelector('[data-testid=integrity-admin]', { timeout: 20000 });
  await page.click('[data-testid=integrity-scan]');
  await page.waitForSelector('[data-testid=integrity-row-cheat_cara]', { timeout: 30000 });
  await shot('01-list');
  const order = await page.locator('[data-testid=integrity-rows] > button').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  check('the self-referrer and her alt rank above the mod (all share this browser, so all are linked)', order.indexOf('integrity-row-cheat_cara') < order.indexOf('integrity-row-mod_mo') && order.indexOf('integrity-row-alt_amy') < order.indexOf('integrity-row-mod_mo'), order.join(','));
  await page.click('[data-testid=integrity-row-cheat_cara]');
  await page.waitForSelector('[data-testid=integrity-player]', { timeout: 20000 }); await page.waitForTimeout(500);
  check('evidence: shared device and self-referral', (await page.locator('[data-testid=signal-shared_device]').count()) === 1 && (await page.locator('[data-testid=signal-self_referral_device]').count()) === 1);
  check('evidence: look-alike email', (await page.locator('[data-testid=signal-self_referral_email]').count()) === 1);
  check('the invite shows the alt’s email', /amy\.jones\+alt@gmail\.com/.test(await page.locator('[data-testid=integrity-player]').innerText()));
  const over = await page.evaluate(() => { const d = document.querySelector('[data-testid=integrity-player]'); return d ? d.scrollWidth - d.clientWidth : -1; });
  check('the player panel fits the phone', over <= 1, `${over}px`);
  await shot('02-player');
  await page.click('[data-testid=signal-self_referral_device] input');
  await page.selectOption('[data-testid=preset]', 'self_referral');
  check('preset fills the reason', /invited accounts you control/.test(await page.inputValue('[data-testid=reason]')));
  check('ticked pattern fills the proof', /invited account uses their own device/.test(await page.inputValue('[data-testid=proof]')));
  await page.click('#sc-ref');
  await page.click('[data-testid=preview]'); await page.waitForSelector('[data-testid=preview-result]');
  check('preview: 500 Ink to take', /500 Ink to take/.test(await page.locator('[data-testid=preview-result]').innerText()));
  await page.locator('[data-testid=integrity-action]').scrollIntoViewIfNeeded(); await shot('03-action');
  check('a chat summary is ready to edit', /\{name\} was suspended for 7 days for self-referral/.test(await page.inputValue('[data-testid=announce-text]')), await page.inputValue('[data-testid=announce-text]'));
  await page.fill('[data-testid=announce-text]', '{name} was suspended for 7 days for self-referring with an alt account and taking the invite bonus.');
  check('…and shows it with her name', /@cheat_cara was suspended/.test(await page.locator('[data-testid=announce-box]').innerText()));
  await page.click('[data-testid=act]');
  await page.getByRole('button', { name: /^Do it$/ }).click();
  await page.waitForTimeout(1500);
  const st = (await sql(`select status from players where id = '${cara}'`))[0].status;
  check('suspended', st === 'suspended', st);
  check('invite Ink taken back', Number((await sql(`select amount from resource_balances where player_id = '${cara}' and resource = 'ink'`))[0].amount) === 0);
  // everyone sees it in the live chat
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => window.__landvasNav('/social?tab=chat'));
  await page.waitForSelector('[data-testid=chat-moderation]', { timeout: 20000 }); await page.waitForTimeout(500);
  const cm = await page.locator('[data-testid=chat-moderation]').innerText();
  check('the live chat shows a red ban notice with the summary', /Player suspended/i.test(cm) && /@cheat_cara was suspended for 7 days for self-referring/.test(cm), cm.slice(0, 160));
  check('…with a red border', await page.locator('[data-testid=chat-moderation]').evaluate((e) => getComputedStyle(e).borderTopColor.replace(/\s/g, '') === 'rgb(255,61,110)'));
  await shot('05-chat');
  // she signs in
  await signIn('amyjones@gmail.com');
  await page.waitForSelector('[data-testid=restriction-notice]', { timeout: 20000 });
  const t = await page.locator('[data-testid=restriction-notice]').innerText();
  check('the notice says suspended, until when, why, the proof and where to appeal', /suspended/i.test(t) && /until/.test(t) && /invited accounts you control/.test(t) && /own device/.test(t) && /dev@landvas\.app/.test(t), t.slice(0, 200));
  check('it says what was taken back', /500 Ink/.test(t));
  await shot('04-notice');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run', false, e.message); await shot('99-error'); }
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
