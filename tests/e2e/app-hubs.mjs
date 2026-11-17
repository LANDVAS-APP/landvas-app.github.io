// The app's own hubs and navigation (simulated Android shell, phone size): the Play hub's What's new ribbon and
// Together / Magic / Ultras banners, the new default tab bar, each hub's screen (hero, live numbers, cards, sheets),
// What's new — and that the website keeps its own navigation without any of these pages.
// Run: npm run build:artifact && node tests/e2e/app-hubs.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4341;
const OUT = process.env.E2E_OUT || path.resolve('test-results/app-hubs');
fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' };
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };

async function signUp(page, tag) {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `${tag}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', tag); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  await page.keyboard.press('Escape').catch(() => {});
}

// ---- the app ---------------------------------------------------------------------------------------------------
{
  const browser = await launch();
  const ctx = await browser.newContext(phone);
  await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
  const shot = (n, full = true) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full, timeout: 60000 }).catch(() => console.log('skip shot', n));
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
    const keys = Object.keys(args);
    return window.__landvasBackend.db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await tx.query('set local role authenticated');
      const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      return r.rows[0]?.r;
    });
  }, [uid, fn, args]);
  const nav = async (p, wait = 1400) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(wait); };
  const path_ = () => page.evaluate(() => window.__landvasPath());
  try {
    await signUp(page, 'hub_hana');
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
    await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
    await as(me, 'claim_starter_plot', { p_gx: START.gx, p_gy: START.gy });
    // two ultras and two enchantments to show
    for (const [i, r] of [[1, 'volcano'], [2, 'phoenix']]) {
      await sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (${START.gx + i}, ${START.gy}, 'lumina', '${r}', '${me}', now()) on conflict (gx, gy) do nothing`);
    }
    for (const [i, k] of [[3, 'goose'], [4, 'sun']]) {
      await sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (${START.gx + i}, ${START.gy}, 'lumina', 'enchanted', '${me}', now()) on conflict (gx, gy) do nothing`);
      await sql(`select (private.ench_create('${k}', '${me}', ${START.gx + i}, ${START.gy})).id`);
    }
    await page.evaluate(() => window.__landvasQc?.invalidateQueries?.());

    // the Play hub
    await nav('/hub', 2200);
    await page.waitForSelector('[data-testid=game-hub]', { timeout: 30000 });
    check('Play hub: the What’s new ribbon is at the top', await page.locator('[data-testid=hub-whats-new]').count() === 1);
    check('Play hub: banners for Explorer’s Eyes, Together, Magic and Ultras', await page.locator('[data-testid=hub-features] .lvh-feature').count() === 4);
    const magicSub = await page.locator('[data-testid=hub-feature-magic] .ss').innerText().catch(() => '');
    check('…the Magic banner says what you own', /2 owned|ready now/.test(magicSub), magicSub);
    const ultraSub = await page.locator('[data-testid=hub-feature-ultras] .ss').innerText().catch(() => '');
    check('…the Ultras banner counts your ultras', /2 ultras earning/.test(ultraSub), ultraSub);
    check('Play hub: a Clips card among the game’s cards', await page.locator('[data-testid="hub-/clips"]').count() === 1);
    const groups = await page.locator('[data-testid=hub-all] .lv-allgroup h3').allInnerTexts();
    check('Play hub: Everything is grouped with Together, Magic and Ultras', ['Together', 'Magic', 'Ultras'].every((g) => groups.some((x) => x.toLowerCase() === g.toLowerCase())), groups.join(', '));
    check('…and You has What’s new and the Handbook', await page.locator('[data-testid="hub-all-/new"]').count() === 1 && await page.locator('[data-testid="hub-all-/handbook"]').count() === 1);
    check('…and World has Explorer’s Eyes', await page.locator('[data-testid="hub-all-/eyes"]').count() === 1);
    await shot('01-hub');
    await page.click('[data-testid=hub-feature-eyes]'); await page.waitForTimeout(3000);
    check('…the Eyes banner steps into Explorer’s Eyes', (await path_()) === '/eyes' && await page.locator('[data-testid=eyes-no-explorer], canvas').count() > 0, await path_());
    await nav('/hub', 2000);

    // the tab bar: Play · Together · World · Magic · Create
    const tabs = await page.locator('[data-testid=game-tabbar] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check('tab bar: Play, Together, World, Magic and Create', JSON.stringify(tabs) === JSON.stringify(['/hub', '/together', '/world', '/magic', '/canvases']), JSON.stringify(tabs));

    // Together
    await page.click('[data-testid="tab-/together"]'); await page.waitForTimeout(1800);
    check('Together: its own screen', await page.locator('[data-testid=together-hub]').count() === 1 && (await path_()) === '/together');
    check('…a tab (no back button, the tab bar stays)', await page.locator('[data-testid=hud-back]').count() === 0 && !(await page.locator('[data-testid=game-tabbar]').getAttribute('class')).includes('away'));
    check('…the Together tab is lit', (await page.locator('[data-testid="tab-/together"]').getAttribute('aria-current')) === 'page');
    check('…hero with live numbers', await page.locator('[data-testid=together-hub] [data-testid=hub-stats] .lvh-chip').count() >= 4);
    check('…Jump in: games, lobbies or a way to start one', await page.locator('[data-testid=together-jump-in] .lvh-row').count() >= 1);
    check('…global chat, watching, invites, friends, helping hands and clans', await page.locator('[data-testid=together-cards] .lvh-card').count() === 6);
    await shot('02-together');
    await page.click('[data-testid=together-party]'); await page.waitForTimeout(1000);
    check('…"Find a party" opens the party panel', await page.locator('[role=dialog]').count() >= 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    await page.click('[data-testid="jump-/social"]'); await page.waitForTimeout(1500);
    check('…Feed & chat opens as a screen of Together (back button)', (await path_()) === '/social' && await page.locator('[data-testid=hud-back]').count() === 1);
    await page.click('[data-testid=hud-back]'); await page.waitForTimeout(1200);
    check('…and back returns to Together', (await path_()) === '/together');

    // Magic
    await page.click('[data-testid="tab-/magic"]'); await page.waitForTimeout(2000);
    check('Magic: its own screen', await page.locator('[data-testid=magic-hub]').count() === 1);
    await page.waitForFunction(() => document.querySelector('[data-testid=magic-owned] b')?.textContent !== '–', null, { timeout: 15000 }).catch(() => {});
    check('…counts your enchantments', (await page.locator('[data-testid=magic-owned] b').innerText()) === '2');
    check('…and the kinds you have', (await page.locator('[data-testid=magic-kinds] b').innerText()) === '2/20');
    check('…all twenty kinds to collect', await page.locator('[data-testid=magic-kinds-grid] .lvh-kind').count() === 20);
    check('…the ones you have aren’t locked', await page.locator('[data-testid=magic-kind-sun]:not(.locked)').count() === 1 && await page.locator('[data-testid=magic-kind-genie].locked').count() === 1);
    check('…six feature cards (Stars, Splice, Rewind, Badges, Leviathan, On my land)', await page.locator('[data-testid=magic-cards] .lvh-card').count() === 6);
    await shot('03-magic');
    await page.click('[data-testid=magic-kind-sun]'); await page.waitForTimeout(900);
    const sheet = await page.locator('[data-testid=magic-kind-sheet]').innerText().catch(() => '');
    check('…a kind opens its sheet: what it does and your copy', /You have 1/.test(sheet) && await page.locator('[data-testid=magic-kind-copy]').count() === 1, sheet.slice(0, 80));
    await shot('04-magic-kind', false);
    await page.click('[data-testid=magic-kind-copy]'); await page.waitForTimeout(1600);
    check('…and its copy opens in the Grimoire', /^\/grimoire\/./.test(await path_()));
    check('…as a screen of Magic (back button)', await page.locator('[data-testid=hud-back]').count() === 1);
    await page.click('[data-testid=hud-back]'); await page.waitForTimeout(1200);
    check('…back to Magic', (await path_()) === '/magic', await path_());

    // Ultras (not a tab by default: a deeper screen with a back button)
    await nav('/ultras', 2000);
    check('Ultras: its own screen', await page.locator('[data-testid=ultras-hub]').count() === 1);
    await page.waitForFunction(() => document.querySelector('[data-testid=ultras-owned] b')?.textContent !== '–', null, { timeout: 15000 }).catch(() => {});
    check('…counts your ultras', (await page.locator('[data-testid=ultras-owned] b').innerText()) === '2');
    check('…your ultras today (the tracker)', await page.locator('[data-testid=ultra-tracker]').count() === 1);
    check('…the nine land-changing ultras', await page.locator('[data-testid=ultras-new-rail] .lvh-orb').count() === 9);
    check('…Fusion Lab, Primordials, Godrolls, Ascend, Crowns, ranks and clips', await page.locator('[data-testid=ultras-cards] .lvh-card').count() === 7);
    check('…opened from the menu, it has a back button', await page.locator('[data-testid=hud-back]').count() === 1);
    await shot('05-ultras');
    await page.click('[data-testid=ultras-card-godrolls]'); await page.waitForTimeout(800);
    check('…Godrolls explains itself', /Echo/.test(await page.locator('[data-testid=ultras-info-sheet]').innerText().catch(() => '')));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    await page.click('[data-testid=ultras-orb-volcano]'); await page.waitForTimeout(800);
    const us = await page.locator('[data-testid=ultras-sheet]').innerText().catch(() => '');
    check('…an ultra opens its sheet (odds and yours)', /You own 1/.test(us) && /1 in/.test(us), us.slice(0, 80));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    await page.click('[data-testid="jump-/fusion"]'); await page.waitForTimeout(1500);
    check('…the Fusion Lab is a screen of Ultras', (await path_()) === '/fusion' && await page.locator('[data-testid=hud-back]').count() === 1, await path_());

    // What's new
    await nav('/new', 2000);
    check('What’s new: its own screen', await page.locator('[data-testid=whats-new]').count() === 1);
    check('…the latest features, each with Try', await page.locator('[data-testid=whats-new-highlights] [data-testid=whats-new-highlight]').count() >= 10);
    check('…the newest first: Explorer’s Eyes', /Explorer’s Eyes/.test(await page.locator('[data-testid=whats-new-highlight]').first().innerText()));
    await shot('06-whats-new');
    await page.locator('[data-testid=whats-new-highlight]').filter({ hasText: 'Ultra Expansion' }).click(); await page.waitForTimeout(1500);
    check('…Try takes you there', (await path_()) === '/ultras', await path_());

    // the menu under your avatar
    await nav('/hub', 1500);
    await page.click('[data-testid=hud-avatar]'); await page.waitForTimeout(700);
    check('profile menu: What’s new, Magic and Ultras', await page.locator('[data-testid=menu-new]').count() === 1 && /Magic/.test(await page.locator('[data-testid=profile-menu]').innerText()) && /Ultras/.test(await page.locator('[data-testid=profile-menu]').innerText()));
    await page.keyboard.press('Escape').catch(() => {});

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('app run', false, String(e?.stack || e));
    await shot('zz-app-error');
  }
  await browser.close();
}

// ---- the website keeps its own pages ----------------------------------------------------------------------------
{
  const browser = await launch();
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const nav = async (p, wait = 1400) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(wait); };
  try {
    await signUp(page, 'web_wren');
    await nav('/social', 1800);
    const hrefs = await page.locator('nav[aria-label=Main] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check('website: the tab bar is unchanged (Community, no Together/Magic)', hrefs.includes('/social') && !hrefs.includes('/together') && !hrefs.includes('/magic'), JSON.stringify(hrefs));
    for (const p of ['/together', '/magic', '/ultras', '/new']) {
      await nav(p, 1200);
      check(`website: ${p} isn’t a page (back to the map)`, (await page.evaluate(() => window.__landvasPath())) === '/world');
    }
    check('website: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('website run', false, String(e?.stack || e));
  }
  await browser.close();
}

server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
