// Real-browser check of admin.landvas.app → Enchantments (the Enchantment editor), against a local PostgreSQL with every
// migration (through scripts/portal-dev-bridge.mjs): the Pocket Sun's numbers and a power dial change live, search finds
// a number, a number goes back to its default, the words (tagline, star powers) save and reset, the shared odds save,
// and every change is in the history. Phone and desktop sizes. Run: node tests/e2e/portal-enchantments.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-enchantments');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54398, BRIDGE = 8798, WEB = 5198;
const dataDir = path.resolve('.pgtmp', `portal-ench-${process.pid}`);
fs.mkdirSync(path.dirname(dataDir), { recursive: true });
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PGPORT, persistent: false, onLog: () => {}, onError: () => {} });
const kids = [];
let browser;
try {
  await db.initialise(); await db.start();
  const root = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'postgres' }); await root.connect();
  await root.query(`create database landvas template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`); await root.end();
  const c = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'landvas' }); c.on('error', () => {}); await c.connect();
  await c.query(fs.readFileSync('supabase/local/shim.sql', 'utf8'));
  for (const f of fs.readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) {
    const s = fs.readFileSync(path.join('supabase/migrations', f), 'utf8'); if (!s.startsWith('-- @supabase-only')) await c.query(s);
  }
  const terms = (await c.query(`select value->>'terms_version' as v from game_config where key = 'legal'`)).rows[0].v;
  const as = async (uid, fn, args) => { await c.query('begin'); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]); await c.query('set local role authenticated');
    const keys = Object.keys(args); const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))); await c.query('commit'); return r.rows[0].r; };
  const player = async (name) => { const id = (await c.query(`insert into auth.users (email) values ($1) returning id`, [`${name}@example.test`])).rows[0].id; await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms }); return id; };
  const boss = await player('boss_admin');
  await c.query(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [boss]);
  const kid = await player('kid_player');
  const q1 = async (s, a = []) => (await c.query(s, a)).rows;

  const env = { ...process.env, DATABASE_URL: `postgres://postgres:postgres@localhost:${PGPORT}/landvas`, PORT: String(BRIDGE) };
  kids.push(spawn('node', ['scripts/portal-dev-bridge.mjs'], { env, stdio: 'ignore' }));
  kids.push(spawn('npx', ['vite', '--config', 'portal/vite.config.ts', '--port', String(WEB), '--strictPort'], { env: { ...process.env, PORTAL_APP: 'admin', VITE_PORTAL_DEV_API: `http://localhost:${BRIDGE}` }, stdio: 'ignore' }));
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://localhost:${WEB}/`); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }

  const cfg = async () => (await q1(`select value from game_config where key = 'enchantments'`))[0].value;
  for (const label of ['desktop', 'phone']) {
    browser = await launch();
    const ctx = await browser.newContext(label === 'phone' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' } : { viewport: { width: 1440, height: 950 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${label}-${n}.png`), fullPage: false }).catch(() => {});
    await page.goto(`http://localhost:${WEB}/`, { waitUntil: 'load' });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.fill('input[type=email], input', 'boss_admin@example.test');
    await page.locator('button[type=submit]').first().click();
    await page.waitForSelector('nav, .p-nav, .p-side', { timeout: 30000 }).catch(() => {});
    await page.goto(`http://localhost:${WEB}/enchantments`, { waitUntil: 'load' });
    const loaded = await page.waitForSelector('[data-testid=enchant-editor]', { timeout: 30000 }).then(() => true, () => false);
    check(`${label}: the Enchantment editor loads`, loaded);
    if (label === 'desktop') {
      await page.click('[data-testid=enchant-kind-sun]'); await page.waitForTimeout(500);
      const nums = await page.locator('[data-testid^=num-]').count();
      check('the Pocket Sun shows every number (power dials, heat, star powers, flare…)', nums >= 45, `${nums} numbers`);
      await shot('01-sun');
      await page.fill('[data-testid=input-white_x]', '2.5');
      await page.fill('[data-testid=input-fuel_h]', '3');
      await page.fill('[data-testid=input-pay_x]', '0.5');
      await page.click('[data-testid=enchant-save]'); await page.waitForTimeout(1200);
      let c = await cfg();
      check('its numbers and a power dial save live', c.sun?.white_x === 2.5 && c.sun?.fuel_h === 3 && c.sun?.pay_x === 0.5, JSON.stringify(c.sun));
      check('…and show in the history', (await page.locator('[data-testid=enchant-history]').textContent()).includes('White-hot'));
      // back to its default
      await page.click('[data-testid=reset-fuel_h]'); await page.click('[data-testid=enchant-save]'); await page.waitForTimeout(1200);
      c = await cfg();
      check('a number goes back to its default', c.sun && !('fuel_h' in c.sun) && c.sun.white_x === 2.5, JSON.stringify(c.sun));
      // find a number
      await page.fill('[data-testid=enchant-find]', 'shiny'); await page.waitForTimeout(400);
      const kinds = await page.locator('[data-testid^=enchant-kind-]').count();
      check('search narrows to the enchantments with a matching number', kinds >= 2 && kinds < 10, `${kinds}`);
      await page.fill('[data-testid=enchant-find]', ''); await page.waitForTimeout(300);
      // the Genie and its weight
      await page.click('[data-testid=enchant-kind-genie]'); await page.waitForTimeout(500);
      await page.fill('[data-testid=input-wish_luck]', '8');
      await page.fill('[data-testid=input-weight]', '0.5');
      await page.click('[data-testid=enchant-save]'); await page.waitForTimeout(1200);
      c = await cfg();
      check('the Genie’s wish and how often it rolls save', c.genie?.wish_luck === 8 && c.weights?.genie === 0.5, JSON.stringify({ g: c.genie, w: c.weights }));
      // the words
      await page.click('[data-testid=enchant-kind-sun]'); await page.waitForTimeout(500);
      await page.fill('[data-testid=words-tagline]', 'A gentler sun.');
      await page.fill('[data-testid=words-star-1] input[aria-label="Star 1 name"]', 'Halo');
      await page.click('[data-testid=words-save]'); await page.waitForTimeout(1200);
      const t = (await q1(`select value from game_config where key = 'enchant_texts'`))[0].value;
      check('the words save (tagline and star powers)', t.sun?.tagline === 'A gentler sun.' && t.sun?.star_powers?.[0]?.name === 'Halo', JSON.stringify(t.sun?.star_powers?.[0]));
      await shot('02-words');
      await page.click('[data-testid=words-reset]'); await page.waitForTimeout(1200);
      check('…and go back to the built-in words', !((await q1(`select value from game_config where key = 'enchant_texts'`))[0].value.sun));
      // the shared odds
      await page.click('[data-testid=enchant-kind-global]'); await page.waitForTimeout(400);
      await page.fill('[data-testid=global-base_pct]', '1.5');
      await page.click('[data-testid=global-save]'); await page.waitForTimeout(1200);
      check('the shared odds save', (await cfg()).base_pct === 1.5);
      await shot('03-global');
    } else {
      await page.click('[data-testid=enchant-kind-sun]').catch(() => {}); await page.waitForTimeout(800); await shot('01-phone');
      check('phone: the editor fits the screen (no sideways scroll)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));
    }
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close(); await browser.close(); browser = null;
  }
} catch (e) {
  console.log('FAIL  crashed:', e.message);
  results.push({ name: 'crashed', ok: false });
} finally {
  await browser?.close();
  for (const k of kids) k.kill();
  await db.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
}
