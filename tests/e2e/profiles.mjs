// Public profiles: rarest rarity + showcase badge, Crown flair, ultra sets; ultra explorer wear unlocked by the plot.
// Run: npm run build:artifact && node tests/e2e/profiles.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-profiles'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4314);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = (n, o = {}) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000, ...o }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
try {
  await page.goto('http://localhost:4314/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'k@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'kraken_kira'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  const me = (await sql(`select id from profiles where username = 'kraken_kira'`))[0].id;
  // a Country Crown, a Kraken and some Mythics — getting them unlocks the sets
  await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at)
    select c.gx + k, c.gy, '${me}', (select id from plot_types limit 1), case k when 0 then 'crown_country' when 1 then 'kraken' else 'mythic' end, now() - interval '40 days'
    from (select gx, gy from world_cities order by pop desc limit 1) c, generate_series(0, 4) k on conflict (gx, gy) do nothing`);
  await sql(`insert into player_achievements (player_id, achievement_key) select '${me}', key from achievements order by threshold desc limit 6 on conflict do nothing`);
  const keys = (await sql(`select unlock_key from player_unlocks where player_id = '${me}' and unlock_key like '%.x%'`)).map((r) => r.unlock_key);
  check('Getting a Kraken + Country Crown unlocked both sets (18 pieces)', keys.length === 18, String(keys.length));
  await page.evaluate(() => window.__landvasQc.invalidateQueries());
  await page.evaluate(() => window.__landvasNav('/u/kraken_kira'));
  await page.waitForSelector('[data-testid=profile-hero]', { timeout: 20000 }); await page.waitForTimeout(1500);
  await shot('01-profile-royal');
  check('Crown flair: royal frame + ribbon', (await page.locator('[data-testid=profile-hero]').getAttribute('data-royal')) === 'crown_country' && /Reigning Country Crown/i.test(await page.locator('[data-testid=profile-royal]').innerText()));
  check('Rarest plot shows the Country Crown', /Country Crown/.test(await page.locator('[data-testid=showcase-rarest]').innerText()));
  check('Ultra sets: Kraken + Country Crown lit', (await page.locator('[data-testid=profile-ultras] [data-has]').count()) === 2);
  const best = await page.locator('[data-testid=showcase-badge-name]').innerText();
  check('a best badge is showcased', best.length > 0, best);
  await page.click('[data-testid=showcase-badge-edit]'); await page.waitForSelector('[data-testid=badge-picker]');
  const pick = page.locator('[data-testid=badge-pick]').last(); const pickName = (await pick.innerText()).trim().split('\n').pop().trim();
  await pick.click(); await page.waitForTimeout(1200);
  check('…and the badge of their choice replaces it', (await page.locator('[data-testid=showcase-badge-name]').innerText()).trim() === pickName, pickName);
  await page.locator('[data-testid=profile-crowns]').scrollIntoViewIfNeeded(); await shot('02-profile-showcase');
  await page.click('[data-testid=profile-tab-badges]'); await page.waitForTimeout(600);
  check('Badges tab lists them', (await page.locator('[data-testid=profile-badges] .glass').count()) === 6);
  await shot('03-profile-badges');
  const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check('nothing wider than the phone', wide <= 0, `${wide}px`);
  // explorer: the Kraken set is owned and wearable; others show what unlocks them
  await page.evaluate(() => window.__landvasNav('/explorer'));
  await page.waitForSelector('[data-testid=explorer-items]', { timeout: 20000 });
  await page.click('[data-testid=explorer-group-style]'); await page.waitForTimeout(500);
  const kHat = page.locator('[data-testid=explorer-item][data-key="explorer.hat.xkraken"]');
  check('Kraken Hat is owned', /Owned/.test(await kHat.innerText()));
  check('Solar hat says what unlocks it', /Solar plot/.test(await page.locator('[data-testid=explorer-item][data-key="explorer.hat.xsolar"]').innerText()));
  await kHat.click();
  for (const [tab, part] of [['style', 'outfit'], ['style', 'hold'], ['fx', 'aura'], ['fx', 'trail']]) {
    await page.click(`[data-testid=explorer-group-${tab}]`); await page.waitForTimeout(250);
    await page.locator(`[data-testid=explorer-item][data-key="explorer.${part}.xkraken"]`).click();
  }
  await page.click('[data-testid=explorer-save]'); await page.waitForTimeout(1500);
  const st = (await sql(`select explorer_style s from profiles where id = '${me}'`))[0].s;
  check('the full Kraken look saves', st.hat === 'xkraken' && st.outfit === 'xkraken' && st.aura === 'xkraken' && st.trail === 'xkraken', JSON.stringify(st));
  await page.locator('[data-testid=explorer-preview]').screenshot({ path: `${OUT}/04-kraken-explorer.png` }).catch(() => {});
  // every ultra look, side by side
  await page.evaluate(() => {
    const sets = ['xsolar', 'xlunar', 'xcomet', 'xchaos', 'xphoenix', 'xgemini', 'xkraken', 'xancient', 'xmirror', 'xprismatic', 'xcity', 'xstate', 'xcountry', 'xgenesis', 'xsingularity'];
    window.__ultraSets = sets;
  });
  await page.evaluate(() => window.__landvasNav('/u/kraken_kira'));
  await page.waitForSelector('[data-testid=profile-hero]'); await page.waitForTimeout(800);
  await page.locator('[data-testid=profile-hero]').screenshot({ path: `${OUT}/05-hero-kraken.png` }).catch(() => {});
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run', false, e.message); await shot('99-error'); }
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
