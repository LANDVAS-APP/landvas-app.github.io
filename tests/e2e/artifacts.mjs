// Real-browser test of the Crucible's artifacts (local-mode build, a phone): eight to forge, each drawn in its own
// metal; a fresh one rises out of the pot; the shelf shows each one's level (Forged → Legendary), what it does and
// where it is; fusing two lifts one a level; one of each is the Grand Set; carried amphoras bring Ink every day.
// Run: npm run build:artifact && node tests/e2e/artifacts.mjs
import { serve, launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-artifacts'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4245;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 };
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
const shot = (n, sel) => (sel ? page.locator(sel).first().screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }) : page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 })).catch(() => {});
const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const text = (sel) => page.locator(sel).first().textContent({ timeout: 5000 }).catch(() => '');
const tap = (sel) => page.locator(sel).first().click({ timeout: 10000 });
/** tap the reveal away (it also goes by itself after a few seconds) */
const closeReveal = async () => {
  await page.locator('[data-testid=crucible-reveal]').click({ timeout: 1500 }).catch(() => {});
  await page.waitForSelector('[data-testid=crucible-reveal]', { state: 'detached', timeout: 6000 }).catch(() => {});
};
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'smith@example.test'); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', 'smith_sam'); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await as(me, 'claim_starter_plot', { p_gx: START.gx, p_gy: START.gy });
  const cell = (await sql(`select gx, gy from world_plots where owner_id = '${me}' limit 1`))[0];
  await sql(`update world_plots set rarity = 'enchanted' where gx = ${cell.gx} and gy = ${cell.gy}`);
  const cru = (await sql(`select (private.ench_create('crucible', '${me}', ${cell.gx}, ${cell.gy})).id`))[0].id;
  await sql(`update enchantments set state = state || '{"metal": {"iron": 60, "copper": 60, "silver": 40, "gold": 40, "platinum": 10, "starsteel": 4}}'::jsonb where id = '${cru}'`);

  await nav(`/grimoire/${cru}`);
  check('the Crucible opens', await waitFor('[data-testid=crucible-scene]', 30000));
  await tap('[data-testid=crucible-tab-craft]');
  await page.waitForTimeout(800);
  const recipes = await page.locator('[data-testid^=crucible-recipe-]').count();
  check('eight artifacts to forge, each drawn', recipes === 8 && (await page.locator('[data-testid^=crucible-recipe-] svg.lvx-art').count()) === 8, `${recipes} recipes`);
  check('…and the set to collect: none yet', /0\/4 kinds for the Smith’s Set/.test(await text('[data-testid=crucible-set]')));
  await shot('01-recipes', '[data-testid=crucible-workshop]');

  await tap('[data-testid=crucible-forge-nest]');
  check('forging: a Golden Nest rises out of the pot', await waitFor('[data-testid=crucible-reveal]', 8000) && /Golden Nest/.test(await text('[data-testid=crucible-reveal]')) && /Forged/.test(await text('[data-testid=crucible-reveal]')));
  await page.waitForTimeout(700);
  await shot('02-reveal');
  await closeReveal();
  const card = '[data-testid=crucible-artifact][data-kind=nest]';
  check('…onto the shelf: level 1 “Forged”, what it does, in the chest', /Forged/.test(await text(card)) && /Golden Goose/.test(await text(card)) && /In the chest/.test(await text(card)));
  await page.locator(card).first().locator('[data-testid=crucible-carry]').click();
  await page.waitForTimeout(1200);
  check('carry it', /Carried/.test(await text(card)) && /carrying 1\/4/.test(await text('[data-testid=crucible-workshop]')));
  await tap('[data-testid=crucible-forge-nest]');
  await waitFor('[data-testid=crucible-reveal]', 8000); await closeReveal();
  await page.locator(card).first().locator('[data-testid=crucible-fuse]').click();
  check('two the same fuse into one a level up: “Tempered”', await waitFor('[data-testid=crucible-reveal]', 8000) && /Fused/.test(await text('[data-testid=crucible-reveal]')) && /Tempered/.test(await text('[data-testid=crucible-reveal]')));
  await closeReveal();
  check('…one nest on the shelf, level 2', (await page.locator(card).count()) === 1 && (await page.locator(`${card}[data-level="2"]`).count()) === 1);

  // the rest of the eight, up to Legendary
  await sql(`insert into crucible_artifacts (player_id, kind, level, carried) values ('${me}', 'horseshoe', 3, false), ('${me}', 'bell', 4, false), ('${me}', 'lantern', 5, false),
    ('${me}', 'anchor', 2, false), ('${me}', 'lodestone', 5, false), ('${me}', 'feather', 5, true), ('${me}', 'amphora', 4, true)`);
  await nav('/world'); await page.waitForTimeout(1200); await nav(`/grimoire/${cru}`);
  await waitFor('[data-testid=crucible-scene]', 20000);
  await tap('[data-testid=crucible-tab-craft]'); await page.waitForTimeout(1200);
  check('one of each: the Grand Set (+10% enchantment Ink)', /Grand Set/.test(await text('[data-testid=crucible-set]')));
  check('Legendary ones wear a starsteel halo with sparks', (await page.locator('.lvx-art-card.l5').count()) === 3 && (await page.locator('.lvx-art-card.l5 .lvx-art-spark').count()) >= 12);
  await page.locator('[data-testid=crucible-artifacts]').scrollIntoViewIfNeeded();
  await shot('03-shelf', '[data-testid=crucible-workshop]');
  // the amphora's Ink (and nothing else's Luck: no horseshoe carried)
  const ink0 = Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0]?.amount ?? 0);
  check('carried amphora: today’s gifts to collect', await waitFor('[data-testid=crucible-tend]', 5000));
  await tap('[data-testid=crucible-tend]');
  await page.waitForTimeout(1500);
  const ink1 = Number((await sql(`select amount from resource_balances where player_id = '${me}' and resource = 'ink'`))[0]?.amount ?? 0);
  check('…24 Ink from a level-4 amphora', ink1 - ink0 === 24, `${ink0} → ${ink1}`);
  await as(me, 'acquire_plot', { p_gx: START.gx + 2, p_gy: START.gy, p_idempotency_key: 'e2e-art-goose-00000001' });
  await sql(`update world_plots set rarity = 'enchanted' where gx = ${START.gx + 2} and gy = ${START.gy}`);
  const goose = (await sql(`select (private.ench_create('goose', '${me}', ${START.gx + 2}, ${START.gy})).id`))[0].id;
  const paid = (await sql(`select private.ench_pay('${goose}', 100, 'a golden egg') p`))[0].p;
  check('the Golden Nest you carry pays on your goose’s eggs', paid.mods.some((m) => m.label === 'Golden Nest +12%') && paid.mods.some((m) => m.label === 'Grand Set +10%'), JSON.stringify(paid.mods));
} catch (e) {
  check('no crash', false, String(e?.stack ?? e).slice(0, 400));
  await shot('zz-crash');
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
