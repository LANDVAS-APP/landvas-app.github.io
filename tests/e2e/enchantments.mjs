// Enchantments: Enchanted Luck and any-amount Ink at the Altar, a real roll that turns Enchanted mid-spin, the Grimoire
// (from simple mode and from the map), every enchantment's scene, a payout, the bestiary and codex, and the owner's tools.
// Run: npm run build:artifact && node tests/e2e/enchantments.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-enchantments'); fs.mkdirSync(OUT, { recursive: true });
const server = await serve(process.env.E2E_DIST || 'dist-artifact', 4331);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); };
const KINDS = { goose: 'goose-scene', genie: 'genie-scene', map: 'map-scene', parasite: 'parasite-scene', cuckoo: 'cuckoo-scene', pandora: 'pandora-scene', splice: 'splice-scene', clockwork: 'clock-scene', sizeray: 'ray-scene', shard: 'shard-scene' };
try {
  await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('landvas.settings') || '{}'); if (!('simpleMode' in s)) localStorage.setItem('landvas.settings', JSON.stringify({ ...s, simpleMode: true })); } catch {} });
  await page.goto('http://localhost:4331/?e2e=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#email') || [...document.querySelectorAll('button,a')].some((b) => /sign in/i.test(b.textContent || '')), null, { timeout: 60000 });
  if (!(await page.locator('#email').count())) await page.locator('button,a').filter({ hasText: /sign in/i }).first().click();
  await page.waitForSelector('#email'); await page.fill('#email', 'grim@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 20000 }); await page.fill('#username', 'grim_ruth'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await nav('/world');
  await page.waitForSelector('[data-testid=simple-home]', { timeout: 20000 }); await page.waitForTimeout(1200);
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`select private.ledger_apply('${me}', 'ink', 50000, 'admin_adjust', 'test', 'test', 'e2e:ench:ink')`);
  await page.evaluate(() => window.__landvasQc?.invalidateQueries?.());
  check('the Grimoire button is on the simple home', (await page.locator('[data-testid=grimoire-button]').count()) === 1);

  // ---- the altar: Enchanted Luck, and Ink in any amount ----
  await page.click('[data-testid=luck-chip]'); await page.waitForSelector('[data-testid=luck-enchant]', { timeout: 10000 }); await page.waitForTimeout(600);
  const base = parseFloat(await page.textContent('[data-testid=luck-enchant-pct]'));
  check('Enchanted Luck shows the base chance', base === 2, `${base}`);
  await page.locator('[data-testid=luck-enchant]').scrollIntoViewIfNeeded();
  await page.click('[data-testid=luck-enchant-1]'); await page.waitForTimeout(1400);
  const up = parseFloat(await page.textContent('[data-testid=luck-enchant-pct]'));
  check('a charge of Enchanted Luck raises the next roll', up === 4, `${base}% → ${up}%`);
  check('…and is saved', (await sql(`select enchant from player_luck where player_id = '${me}'`))[0].enchant === 1);
  await shot('01-altar-enchanted-luck');
  const per = (await api('luckStatus')).ink_per_point;
  const before = Number(await page.textContent('[data-testid=luck-value]'));
  await page.fill('[data-testid=luck-ink-amount]', String(per * 7 + 3)); await page.waitForTimeout(300);
  check('the offer button shows what that Ink buys', /\+7/.test(await page.textContent('[data-testid=luck-ink-offer]')));
  await page.click('[data-testid=luck-ink-offer]'); await page.waitForTimeout(1400);
  const after = Number(await page.textContent('[data-testid=luck-value]'));
  check('any amount of Ink becomes Luck', after === before + 7, `${before} → ${after} (${per} Ink a point)`);
  await page.click('[data-testid=luck-ink-5]'); await page.waitForTimeout(1400);
  check('…and the quick buttons still offer in one tap', Number(await page.textContent('[data-testid=luck-value]')) === after + 5);
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  check('the Luck chip shows the enchant chance', /4% enchant/.test(await page.textContent('[data-testid=luck-chip-note]')));

  // ---- a real roll turns Enchanted mid-spin ----
  await sql(`update game_config set value = jsonb_set(value, '{base_pct}', '100') where key = 'enchantments'`);
  await page.click('[data-testid=simple-buy]');
  await page.waitForSelector('[data-testid=roll-enchanting]', { timeout: 30000 });
  check('the roll changes into the enchanting animation', true);
  await page.waitForTimeout(1300); await shot('02-roll-transforming');
  await page.waitForSelector('[data-testid=roll-enchanted]', { timeout: 30000 }); await page.waitForTimeout(1500);
  await shot('03-roll-enchanted');
  check('the reveal names the enchantment and its mint serial', /ENCHANTED · #1/.test(await page.textContent('[data-testid=roll-enchanted]')));
  check('…and says where it was born', /born in|#1/.test(await page.textContent('[data-testid=roll-enchant]')));
  const rolled = (await sql(`select e.kind, e.id, p.rarity from enchantments e join world_plots p using (gx, gy) where e.owner_id = '${me}'`))[0];
  check('the plot is Enchanted (no rarity) and the enchantment is saved', rolled?.rarity === 'enchanted', JSON.stringify(rolled));
  check('the Enchanted Luck was spent', (await sql(`select enchant from player_luck where player_id = '${me}'`))[0].enchant === 0);
  await sql(`update game_config set value = jsonb_set(value, '{base_pct}', '0') where key = 'enchantments'`);
  await page.click('[data-testid=roll-open-grimoire]');
  await page.waitForSelector('[data-testid=ench-header]', { timeout: 20000 }); await page.waitForTimeout(1500);
  check('“Open it in the Grimoire” opens its page', (await page.locator('[data-testid=ench-header]').count()) === 1);
  check('…with its own scene', (await page.locator(`[data-testid=${KINDS[rolled.kind]}]`).count()) === 1, rolled.kind);
  await shot('04-grimoire-rolled');

  // ---- the owner gives one of every kind; every scene renders ----
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  const ids = { [rolled.kind]: rolled.id };
  for (const k of Object.keys(KINDS)) {
    if (ids[k]) continue;
    const g = await page.evaluate(([me, k]) => window.__landvasApi.admin.giveEnchantment(me, k, 'e2e: one of each', null), [me, k]);
    ids[k] = g.id;
  }
  check('the owner can give every kind', Object.keys(ids).length === 10);
  let i = 5;
  for (const [k, tid] of Object.entries(KINDS)) {
    await nav(`/grimoire/${ids[k]}`);
    const ok = await page.waitForSelector(`[data-testid=${tid}]`, { timeout: 20000 }).then(() => true, () => false);
    await page.waitForTimeout(1200);
    check(`${k}: its scene renders`, ok);
    await shot(`${String(i++).padStart(2, '0')}-scene-${k}`);
  }
  // polish the Golden Goose's egg (it grows the egg), then a laid-long-ago egg is collected with a payout burst
  await nav(`/grimoire/${ids.goose}`); await page.waitForSelector('[data-testid=goose-polish]', { timeout: 20000 }); await page.waitForTimeout(600);
  const egg0 = Number((await page.textContent('[data-testid=goose-value]')).replace(/[^0-9]/g, ''));
  await page.click('[data-testid=goose-polish]'); await page.waitForTimeout(1500);
  const egg1 = Number((await page.textContent('[data-testid=goose-value]')).replace(/[^0-9]/g, ''));
  check('polishing grows the egg (+3) and starts the polish cooldown', egg1 >= egg0 + 3 && /Polish · \d+m/.test(await page.textContent('[data-testid=goose-polish]')), `${egg0} → ${egg1}`);
  await sql(`update enchantments set state = jsonb_set(state, '{egg_at}', to_jsonb((state ->> 'egg_at')::numeric - 4 * 3600)) where id = '${ids.goose}'`);
  await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['enchant'] })); await page.waitForTimeout(1500);
  await shot('15-goose-grown');
  await page.click('[data-testid=goose-collect]');
  const paid = await page.waitForSelector('[data-testid=ench-payout]', { timeout: 10000 }).then(() => true, () => false);
  check('collecting the egg pays Ink with a payout burst', paid);
  await page.waitForTimeout(500); await shot('16-goose-payout');
  await page.waitForTimeout(1500);
  check('…and the egg is in the chronicle', /egg/i.test((await page.textContent('[data-testid=ench-chronicle]')) ?? ''));
  // a Size Ray shot needs a plot to aim at: roll an ordinary one first
  await nav('/world'); await page.waitForSelector('[data-testid=simple-buy]', { timeout: 20000 });
  await page.click('[data-testid=simple-buy]'); await page.waitForSelector('[data-testid=roll-rarity]', { timeout: 30000 }); await page.waitForTimeout(1200);
  await page.click('[data-testid=roll-done]'); await page.waitForTimeout(900);
  // (the Size Ray aims at a plot of yours: here, picked on its radar — the map's targeting mode is in wonders.mjs)
  await nav(`/grimoire/${ids.sizeray}`); await page.waitForSelector('[data-testid=ray-dial]', { timeout: 20000 }); await page.waitForTimeout(600);
  // (in simple mode the radar is already open — there's no map to pick on)
  if (!(await page.locator('[data-testid=ray-blip]').first().isVisible().catch(() => false))) await page.locator('details summary').first().click().catch(() => {});
  check('simple mode has no “Pick on the map” (no map there)', (await page.locator('[data-testid=ray-pick-map]').count()) === 0);
  await page.waitForSelector('[data-testid=ray-blip]', { timeout: 10000 });
  await page.locator('[data-testid=ray-blip]').first().click(); await page.click('[data-testid=ray-aim]');
  await page.waitForSelector('[data-testid=ray-fire]', { timeout: 15000 }); await page.waitForTimeout(1100);
  // (no screenshot between aiming and firing: the server only holds an aim for 12 seconds, and a screenshot can take longer)
  await page.click('[data-testid=ray-fire]');
  const graded = await page.waitForSelector('[data-testid=ray-grade]', { timeout: 10000 }).then(() => true, () => false);
  check('the Size Ray aims, fires and is graded by the server', graded, graded ? await page.textContent('[data-testid=ray-grade]') : await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent).join(' | ')));
  await shot('17-sizeray-graded');
  await page.waitForTimeout(600); await shot('18-sizeray-fired');
  // renaming
  await nav(`/grimoire/${ids.genie}`); await page.waitForSelector('[data-testid=ench-name]', { timeout: 20000 });
  await page.click('[data-testid=ench-name]'); await page.waitForSelector('[data-testid=ench-rename]');
  await page.fill('[data-testid=ench-rename]', 'Jinn Tonic'); await page.press('[data-testid=ench-rename]', 'Enter');
  await page.waitForSelector('[data-testid=ench-name]', { timeout: 10000 }); await page.waitForTimeout(800);
  check('an enchantment can be named', /Jinn Tonic/.test(await page.textContent('[data-testid=ench-name]')));

  // a Splice: pull the lever on the Goose and the Size Ray — a resonant Giant Goose, new in the codex
  await nav(`/grimoire/${ids.splice}`); await page.waitForSelector('[data-testid=splice-pick-goose]', { timeout: 20000 }); await page.waitForTimeout(600);
  await page.click('[data-testid=splice-pick-goose]'); await page.click('[data-testid=splice-pick-sizeray]'); await page.waitForTimeout(400);
  check('the Splice previews the hybrid, in plain words', /Giant Goose/.test(await page.textContent('[data-testid=hybrid-card]')) && /Your Golden Goose gets/.test(await page.textContent('[data-testid=hybrid-card]')));
  await shot('18b-splice-ready');
  await page.click('[data-testid=splice-go]');
  const made = await page.waitForSelector('[data-testid=splice-made]', { timeout: 15000 }).then(() => true, () => false);
  await page.waitForTimeout(900); await shot('18c-splice-made');
  check('…and makes it (new in your codex)', made && /NEW IN YOUR CODEX/.test(await page.textContent('[data-testid=splice-made]')));
  await page.click('[data-testid=splice-made]'); await page.waitForTimeout(500);

  // ---- the book: list, bestiary, codex ----
  await nav('/grimoire'); await page.waitForSelector('[data-testid=grimoire-list]', { timeout: 20000 }); await page.waitForTimeout(1200);
  const cards = await page.locator('[data-testid=grimoire-card]').count();
  check('the Grimoire lists all ten', cards === 10, `${cards}`);
  check('…and shows your next roll’s chance', /0% Enchanted/.test(await page.textContent('[data-testid=grimoire-chance]')));
  await shot('19-grimoire-list');
  await nav('/grimoire?tab=bestiary'); await page.waitForSelector('[data-testid=grimoire-bestiary]', { timeout: 15000 }); await page.waitForTimeout(800);
  await shot('20-bestiary');
  check('the bestiary shows all ten kinds', /Golden Goose/.test(await page.textContent('[data-testid=grimoire-bestiary]')) && /Mirror Shard/.test(await page.textContent('[data-testid=grimoire-bestiary]')));
  await nav('/grimoire?tab=codex'); await page.waitForSelector('[data-testid=grimoire-codex]', { timeout: 15000 }); await page.waitForTimeout(800);
  await shot('21-codex');
  check('the codex shows the Giant Goose, the rest still secret', /1\/55/.test(await page.textContent('[data-testid=grimoire-codex]')) && (await page.locator('[data-testid=grimoire-codex] [title="Giant Goose"]').count()) === 2 && (await page.locator('[data-testid=grimoire-codex] [title=Undiscovered]').count()) > 30);
  check('…and the Codex tab is the one lit', /Codex/.test(await page.textContent('[role=tab][data-state=active]')));

  // ---- the owner: the Enchantments card (Admin → Earnings) and “Give an enchantment” on a player ----
  await api('devGrantSelfAdmin');
  await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(800);
  await page.evaluate(() => { location.hash = 'earnings'; window.__landvasNav('/admin'); }); await page.waitForTimeout(800);
  await page.getByRole('tab', { name: /^Earnings/ }).click().catch(() => {});
  await page.waitForSelector('[data-testid=enchant-cfg]', { timeout: 20000 });
  await page.locator('[data-testid=enchant-cfg]').scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
  check('the Enchantments card lists all twelve kinds with their numbers', (await page.locator('[data-testid=enchant-weight]').count()) === 12 && /#1/.test(await page.locator('[data-testid=enchant-weight]').first().getAttribute('data-pop')));
  await page.fill('#nf-chance-per-plot-roll', '5'); await page.fill('[aria-label="Mirror Shard weight"]', '0'); await page.waitForTimeout(300);
  await shot('21b-admin-enchant-card');
  const wide = await page.evaluate(() => document.querySelector('[data-testid=enchant-cfg]').scrollWidth - document.querySelector('[data-testid=enchant-cfg]').clientWidth);
  check('…and fits a phone', wide <= 0, `${wide}px`);
  await page.click('[data-testid=enchant-cfg-save]'); await page.waitForTimeout(1500);
  const cfg = (await sql(`select value from game_config where key = 'enchantments'`))[0].value;
  check('…saves the chance and the weights for everyone', Number(cfg.base_pct) === 5 && Number(cfg.weights.shard) === 0, JSON.stringify({ base: cfg.base_pct, shard: cfg.weights.shard }));
  await sql(`update game_config set value = jsonb_set(jsonb_set(value, '{base_pct}', '2'), '{weights,shard}', '1') where key = 'enchantments'`);
  await page.getByRole('tab', { name: /^Players/ }).click();
  await page.locator('button').filter({ hasText: '@grim_ruth' }).first().click();
  await page.waitForSelector('[data-testid=give-enchant]', { timeout: 20000 });
  await page.locator('[data-testid=give-enchant]').scrollIntoViewIfNeeded();
  await page.fill('[data-testid=plots-reason]', 'e2e event prize');
  await page.selectOption('[data-testid=give-enchant-kind]', 'cuckoo');
  await page.click('[data-testid=give-enchant-go]'); await page.waitForTimeout(1500);
  check('“Give an enchantment” mints the next serial for the player', Number((await sql(`select max(serial) n from enchantments where kind = 'cuckoo' and owner_id = '${me}'`))[0].n) === 2);
  check('…audit-logged', Number((await sql(`select count(*) n from audit_logs where action = 'enchant.given'`))[0].n) >= 10);
  await shot('21c-admin-give-enchant');

  // ---- the map: the Grimoire button and enchanted plots ----
  await sql(`update game_config set value = jsonb_set(value, '{base_pct}', '2') where key = 'enchantments'`);
  await nav('/world'); await page.waitForSelector('[data-testid=simple-mode-off]', { timeout: 20000 });
  await page.click('[data-testid=simple-mode-off]');
  const onMap = await page.waitForSelector('[data-testid=grimoire-button]', { timeout: 60000 }).then(() => true, () => false);
  await page.waitForTimeout(4000);
  await page.keyboard.press('Escape'); await page.waitForTimeout(800); // (the first-visit “Drop into the world” sheet)
  check('the Grimoire button floats on the map', onMap);
  check('…with a count or a “needs you” badge', /\d/.test(await page.textContent('[data-testid=grimoire-button]')));
  await shot('22-map-grimoire');
  await page.click('[data-testid=grimoire-button]');
  check('…and opens the Grimoire', await page.waitForSelector('[data-testid=grimoire-list]', { timeout: 20000 }).then(() => true, () => false));

  // ---- the demo transformation (any kind) ----
  await nav('/world'); await page.waitForSelector('[data-testid=grimoire-button]', { timeout: 30000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__landvasRollDemo('rare', false, null, null, null, 'pandora'));
  const demo = await page.waitForSelector('[data-testid=roll-enchanting]', { timeout: 20000 }).then(() => true, () => false);
  check('the demo roll turns Enchanted too', demo);
  await page.waitForSelector('[data-testid=roll-enchanted]', { timeout: 30000 }); await page.waitForTimeout(1200);
  await shot('23-demo-pandora');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('run completed', false, e.message.split('\n')[0]);
  await shot('99-err');
} finally {
  await browser.close(); server.close();
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
