// Royalty, rarity rankings, and setting rarity odds in the admin.
// Run: npm run build:artifact && node tests/e2e/royalty.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-royalty'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4313);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 45000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const api = (f, ...a) => page.evaluate(([f, a]) => { const p = f.split('.'); let o = window.__landvasApi; for (const k of p.slice(0, -1)) o = o[k]; return o[p.at(-1)](...a); }, [f, a]);
try {
  await page.goto('http://localhost:4313/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'r@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'royal_rosa'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  const me = (await sql(`select id from profiles where username = 'royal_rosa'`))[0].id;
  // give Rosa a Country Crown, a City Crown and some Mythics
  await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at)
    select c.gx + k, c.gy, '${me}', (select id from plot_types limit 1), case k when 0 then 'crown_country' when 1 then 'crown' else 'mythic' end, now() - interval '12 days'
    from (select gx, gy from world_cities order by pop desc limit 1) c, generate_series(0, 4) k on conflict (gx, gy) do nothing`);
  await page.evaluate(() => window.__landvasNav('/royalty'));
  await page.waitForSelector('[data-testid=royalty-hero]', { timeout: 20000 }); await page.waitForTimeout(1000);
  await shot('01-royalty');
  check('Royalty: the Country Crown card shows her (as You)', /\bYou\b/.test(await page.locator('[data-testid=royal-crown_country]').first().innerText()));
  check('Royalty: reign shown', /reigning 12 days/.test(await page.locator('[data-testid=royal-crown_country]').first().innerText()));
  check('Royalty: the court lists her', (await page.locator('[data-testid=royal-court] li').count()) >= 1);
  await page.locator('[data-testid=royal-section-crown]').scrollIntoViewIfNeeded(); await shot('02-royalty-cities');
  // rarity rankings
  await page.evaluate(() => window.__landvasNav('/rankings/rarities?r=mythic'));
  await page.waitForSelector('[data-testid=rr-head]', { timeout: 20000 }); await page.waitForTimeout(1000);
  check('Rarity rankings: Rosa leads Mythic with 3', /3/.test(await page.locator('[data-testid=rr-rows] li').first().innerText()));
  await page.click('[data-testid=rr-crown_country]'); await page.waitForTimeout(800);
  check('Rarity rankings: tapping a rarity switches the board', /Country Crown/i.test(await page.locator('[data-testid=rr-head]').innerText()), await page.locator('[data-testid=rr-head]').innerText());
  await shot('03-rankings');
  const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check('nothing wider than the phone', wide <= 0, `${wide}px`);
  // easy to reach: Leaderboards links to both
  await page.evaluate(() => window.__landvasNav('/leaderboards')); await page.waitForSelector('[data-testid=lb-links]', { timeout: 20000 });
  check('Leaderboards link to rarity rankings and Royalty', (await page.locator('[data-testid=lb-links] a').count()) === 2);
  // admin: set the real odds in %
  await api('devGrantSelfAdmin');
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(1200);
  await page.evaluate(() => { location.hash = 'earnings'; window.__landvasNav('/admin'); }); await page.waitForTimeout(500);
  await page.getByRole('tab', { name: /^Earnings/ }).click().catch(() => {});
  await page.waitForSelector('[data-testid=admin-odds]', { timeout: 20000 });
  await page.locator('[data-testid=admin-odds]').scrollIntoViewIfNeeded();
  await page.fill('[data-testid=odds-pct-mythic]', '2');
  check('odds must add up to 100%', /must be 100%/.test(await page.locator('[data-testid=odds-sum]').innerText()) && await page.locator('[data-testid=odds-save]').isDisabled());
  await page.click('[data-testid=odds-balance]');
  check('…balancing into Common fixes it', /Total 100\.00%/.test(await page.locator('[data-testid=odds-sum]').innerText()));
  await page.fill('[data-testid=odds-onein-solar]', '1000');
  await page.click('[data-testid=odds-save]'); await page.waitForTimeout(1500);
  const rows = await sql(`select id, weight, ppm from plot_rarities where id in ('mythic', 'common', 'solar')`);
  const w = Object.fromEntries(rows.map((r) => [r.id, r]));
  const total = Number((await sql(`select sum(weight) s from plot_rarities where weight > 0`))[0].s);
  check('Mythic is now 2% of the table', Math.abs(Number(w.mythic.weight) / total - 0.02) < 1e-6, `${w.mythic.weight}/${total}`);
  check('Solar is now 1 in 1,000', Number(w.solar.ppm) === 1000, String(w.solar.ppm));
  await page.fill('[data-testid=odds-shiny]', '500'); await page.click('[data-testid=odds-shiny-save]'); await page.waitForTimeout(1200);
  check('Shiny odds saved', Number((await sql(`select value ->> 'one_in' v from game_config where key = 'shiny'`))[0].v) === 500);
  await shot('04-admin-odds');
  // event rolls: line up a Mythic on Rosa's 10th roll from now
  await page.getByRole('tab', { name: /^Players/ }).click();
  await page.locator('button').filter({ hasText: '@royal_rosa' }).first().click();
  await page.waitForSelector('[data-testid=roll-grant-form]', { timeout: 20000 });
  await page.locator('[data-testid=roll-grant-form]').scrollIntoViewIfNeeded();
  await page.selectOption('[data-testid=grant-rarity]', 'kraken').catch(() => page.selectOption('[data-testid=grant-rarity]', 'mythic'));
  await page.locator('[data-testid=roll-grant-form] button', { hasText: '10th' }).click();
  await page.click('[data-testid=grant-go]'); await page.waitForTimeout(1200);
  const gr = await sql(`select rarity, at_roll, created_by from private.granted_rolls where player_id = '${me}'`);
  const rolls = Number((await sql(`select private.roll_count('${me}') n`))[0].n);
  check('Event roll lined up for her 10th roll from now', gr.length === 1 && gr[0].at_roll === rolls + 10, JSON.stringify(gr));
  check('…listed on her admin page', /in 10 claims/.test(await page.locator('[data-testid=roll-grants]').innerText()));
  check('…admin note says Crowns stay one per kingdom and event rolls are posted', /still free/.test(await page.locator('[data-testid=roll-grant-form]').innerText()) && /posted on the live feed/.test(await page.locator('[data-testid=roll-grant-form]').innerText()));
  check('…audit-logged', Number((await sql(`select count(*) n from audit_logs where action = 'rolls.grant'`))[0].n) >= 1);
  await shot('05-event-rolls');
  // owner plot tools: give her a shiny Mythic, then take a plot away
  await page.locator('[data-testid=player-plots]').scrollIntoViewIfNeeded();
  const n0 = await page.locator('[data-testid=player-plot]').count();
  check('Plot tools list her plots, Crowns first', n0 >= 3 && /Country Crown|👑/.test(await page.locator('[data-testid=player-plot]').first().innerText()), String(n0));
  await page.fill('[data-testid=plots-reason]', 'e2e make-good');
  await page.selectOption('[data-testid=give-rarity]', 'mythic');
  await page.click('[data-testid=give-go]'); await page.waitForTimeout(1500);
  check('…Give adds a plot', (await page.locator('[data-testid=player-plot]').count()) === n0 + 1);
  await page.locator('[data-testid=plot-take]').last().click(); await page.waitForTimeout(400);
  await page.locator('[role=dialog] button', { hasText: 'Take it' }).click(); await page.waitForTimeout(1500);
  check('…Take away removes one', (await page.locator('[data-testid=player-plot]').count()) === n0);
  check('…both audit-logged', Number((await sql(`select count(*) n from audit_logs where action in ('plot.given', 'plot.taken')`))[0].n) === 2);
  await shot('06-plot-tools');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('run', false, e.message); await shot('99-error'); }
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
