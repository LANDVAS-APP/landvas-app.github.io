// Referral tiers on the Invite page (local-mode build, a phone):
//  - the ladder: real friends so far, a segment per tier, Tiers I–III with four bonuses each, the Grand Package with
//    its boosts; before Tier I the summary says what unlocks it
//  - picking a bonus (with a confirm), planning a tier ahead, and the monthly lock
//  - friends who really play: the tiers climb, the stack pays, the friend cards say what each paid
//  - staff: the tier editor and the switch for every share of friends' Ink
// (Tiers are 1, 2, 3 and 4 real friends here so two friends climb two tiers.)
// Run: npm run build:artifact && node tests/e2e/referral-tiers.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-referral-tiers'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4337);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000, fullPage: n.includes('full') }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const tid = (id) => page.locator(`[data-testid="${id}"]`);
const refresh = async () => { await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(1500); };
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
async function signOut() {
  await page.evaluate(async () => { await window.__landvasBackend.db.syncToFs?.(); await window.__landvasBackend.signOut(); });
  await page.waitForTimeout(600); await nav('/world'); await page.waitForTimeout(1500);
}
async function confirmDialog() {
  await page.getByRole('dialog').getByRole('button').filter({ hasText: /^(Pick it|Switch)$/ }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
}
try {
  await page.goto('http://localhost:4337/?e2e=1', { waitUntil: 'load' });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await signUp('amy.tier@example.test', 'tier_amy');
  await signOut(); await signUp('ben.tier@example.test', 'tier_ben');
  await signOut(); await signUp('boss.tier@example.test', 'tier_boss');
  const id = async (u) => (await sql(`select id from profiles where username = '${u}'`))[0].id;
  const [amy, ben, boss] = [await id('tier_amy'), await id('tier_ben'), await id('tier_boss')];
  await sql(`insert into admin_roles (player_id, role) values ('${boss}', 'owner') on conflict do nothing`);
  await sql(`update game_config set value = jsonb_set(value, '{packages,tiers}', (select jsonb_agg(t || jsonb_build_object('n', i)) from jsonb_array_elements(value -> 'packages' -> 'tiers') with ordinality x(t, i))) where key = 'referrals'`);
  await nav('/invite'); await page.waitForTimeout(2500);

  // ---- the ladder, before any real friends ----
  check('the Invite page shows the referral tiers', await tid('referral-tiers').waitFor({ timeout: 20000 }).then(() => true, () => false));
  check('…0 real friends so far', (await tid('tier-real').textContent().catch(() => '')).trim() === '0');
  check('…Tiers I–III with four bonuses each, and the Grand Package with four boosts',
    (await page.locator('[data-testid^=tier-1-pick-]').count()) === 4 && (await page.locator('[data-testid^=tier-3-pick-]').count()) === 4
    && (await tid('tier-grand').count()) === 1 && (await page.locator('[data-testid^=grand-boost-]').count()) === 4);
  const stack0 = await tid('tier-stack').textContent();
  check('…the summary says what unlocks Tier I', /Reach Tier I/.test(stack0), stack0.slice(0, 80));
  check('…an unpicked tier shows the default (Golden Circle)', /Default/.test(await tid('tier-1-pick-golden').textContent()));
  check('…the Ink Tycoon’s Tier III pays 5,000 Ink', /\+5,000 Ink/.test(await tid('tier-3-pick-tycoon').textContent()));
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('…fits a phone (nothing runs off the side)', wide <= 1, String(wide));
  await tid('referral-tiers').scrollIntoViewIfNeeded(); await shot('01-tiers');
  await shot('01-invite-full');

  // ---- picking ----
  await tid('tier-1-pick-tycoon').click(); await confirmDialog();
  check('picking Ink Tycoon for Tier I: it’s checked', (await tid('tier-1-pick-tycoon').getAttribute('aria-checked')) === 'true');
  check('…and locked for a month', await tid('tier-1-locked').isVisible().catch(() => false));
  await tid('tier-3-pick-fortune').click(); await confirmDialog();
  check('a tier can be planned ahead (Tier III: Fortune Seeker)', (await tid('tier-3-pick-fortune').getAttribute('aria-checked')) === 'true');
  await tid('grand-boost-share').click(); await confirmDialog();
  check('the Grand Package’s boost is picked (a bigger share)', (await tid('grand-boost-share').getAttribute('aria-checked')) === 'true');
  await tid('tier-1-pick-royalties').click(); await page.waitForTimeout(900);
  check('a locked pick doesn’t change', (await tid('tier-1-pick-tycoon').getAttribute('aria-checked')) === 'true'
    && (await page.getByRole('dialog').count()) === 0);
  const picks = await sql(`select tier, pick from referral_picks where player_id = '${boss}' order by tier`);
  check('…the picks are saved', JSON.stringify(picks) === JSON.stringify([{ tier: 1, pick: 'tycoon' }, { tier: 3, pick: 'fortune' }, { tier: 4, pick: 'share' }]), JSON.stringify(picks));

  // ---- two friends who really play ----
  for (const f of [amy, ben]) {
    await sql(`insert into referrals (referee_id, referrer_id, code, status, reward_ink, created_at, qualified_at) values ('${f}', '${boss}', 'TIER_BOSS', 'rewarded', 500, now() - interval '4 days', now() - interval '4 days') on conflict (referee_id) do nothing`);
    for (const d of [3, 2, 1]) await sql(`insert into resource_ledger (player_id, resource, delta, balance_after, reason, created_at) values ('${f}', 'ink', 100, 100, 'minigame', now() - interval '${d} days')`);
    await sql(`select private.ref_real_try('${f}')`);
  }
  await refresh();
  check('two real friends: Tier II unlocked', (await tid('tier-real').textContent()).trim() === '2' && /Unlocked/.test(await tid('tier-2').textContent()));
  const stack = await tid('tier-stack').textContent();
  check('…the summary adds the picks up (Tycoon I 1,000 + Golden II 700 Ink, 3% share, Luck refill)', /\+1,700 Ink/.test(stack) && /3% of their Ink/.test(stack) && /Luck refilled/.test(stack), stack.slice(0, 160));
  const paid = await page.locator('[data-testid=friend-bonus-paid]').allTextContents();
  check('…each friend card says what its bonus paid', paid.length === 2 && paid.some((t) => /Tier I bonus paid · \+1,000 Ink/.test(t)) && paid.some((t) => /Tier II bonus paid · \+1,700 Ink/.test(t)), JSON.stringify(paid));
  const bonusInk = (await sql(`select coalesce(sum(delta), 0)::int n from resource_ledger where player_id = '${boss}' and reason = 'referral_bonus'`))[0].n;
  check('…and the Ink arrived (1,000 + 1,700)', bonusInk === 2700, String(bonusInk));
  await tid('tier-progress').scrollIntoViewIfNeeded(); await shot('02-climbed');
  await page.locator('[data-testid=referral-list]').scrollIntoViewIfNeeded().catch(() => {}); await shot('03-friends');

  // ---- staff ----
  await page.evaluate(() => { location.hash = 'social'; window.__landvasNav('/admin'); }); await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: /^Social/ }).click().catch(() => {});
  check('admin: the referral tier editor', await page.waitForSelector('[data-testid=ref-packages-admin]', { timeout: 20000 }).then(() => true, () => false));
  check('…every tier, option, the Grand Package and its boosts', (await page.locator('[data-testid=ref-tiers-admin] input[aria-label$="name"]').count()) === 4
    && (await page.locator('[data-testid^=ref-opt-]').count()) === 4 && (await page.locator('[data-testid^=ref-boost-]').count()) === 4);
  await page.click('#ref-share'); await page.waitForTimeout(300);
  await tid('save-referrals').click(); await page.waitForTimeout(1500);
  const on = (await sql(`select value -> 'packages' ->> 'share_enabled' v from game_config where key = 'referrals'`))[0].v;
  check('…the share switch turns every share of friends’ Ink off', on === 'false', String(on));
  await tid('ref-packages-admin').scrollIntoViewIfNeeded(); await shot('04-admin');
  await nav('/invite'); await page.waitForTimeout(2000); await refresh();
  check('…and the Invite page shows the share paused', (await tid('tier-stack').locator('.line-through').count()) >= 1 && /paused/.test(await tid('tier-stack').textContent()));
  // light theme reads too
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(600);
  await tid('tier-grand').scrollIntoViewIfNeeded(); await shot('05-grand-light');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('ran', false, String(e?.stack ?? e).slice(0, 400)); await shot('zz-error');
} finally {
  await browser.close(); server.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
