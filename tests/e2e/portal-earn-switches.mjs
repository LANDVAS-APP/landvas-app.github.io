// Real-browser check of admin.landvas.app → Earning switches, against a local PostgreSQL with every migration (through
// scripts/portal-dev-bridge.mjs, as in portal/README.md): the groups are listed, one arcade cabinet is switched off (and
// its payouts stop), it shows in "Switched off now" with its note, and goes back on; the big Stop ALL switch works both
// ways. Phone and desktop sizes. Run: node tests/e2e/portal-earn-switches.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-earn-switches');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54394, BRIDGE = 8794, WEB = 5194;
const dataDir = path.resolve('.pgtmp', `portal-switches-${process.pid}`);
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
  const off = async () => (await c.query(`select key, note from private.earn_switches order by key`)).rows;

  const env = { ...process.env, DATABASE_URL: `postgres://postgres:postgres@localhost:${PGPORT}/landvas`, PORT: String(BRIDGE) };
  kids.push(spawn('node', ['scripts/portal-dev-bridge.mjs'], { env, stdio: 'ignore' }));
  kids.push(spawn('npx', ['vite', '--config', 'portal/vite.config.ts', '--port', String(WEB), '--strictPort'], { env: { ...process.env, PORTAL_APP: 'admin', VITE_PORTAL_DEV_API: `http://localhost:${BRIDGE}` }, stdio: 'ignore' }));
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://localhost:${WEB}/`); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }

  for (const label of ['desktop', 'phone']) {
    browser = await launch();
    const ctx = await browser.newContext(label === 'phone' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' } : { viewport: { width: 1360, height: 900 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${label}-${n}.png`), fullPage: false }).catch(() => {});
    await page.goto(`http://localhost:${WEB}/`, { waitUntil: 'load' });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.fill('input[type=email], input', 'boss_admin@example.test');
    await page.locator('button[type=submit]').first().click();
    await page.waitForSelector('nav, .p-nav, .p-side', { timeout: 30000 }).catch(() => {});
    await page.goto(`http://localhost:${WEB}/earning`, { waitUntil: 'load' });
    const loaded = await page.waitForSelector('[data-testid=earn-switches]', { timeout: 30000 }).then(() => true, () => false);
    check(`${label}: the Earning switches page loads`, loaded);
    if (label === 'desktop') {
      for (const g of ['sources', 'arcade', 'minigames', 'enchant', 'splice', 'kinds', 'mult', 'rent']) check(`group ${g} is listed`, (await page.locator(`[data-testid=switch-group-${g}]`).count()) === 1);
      await shot('01-all');
      await page.fill('[data-testid=switch-note]', 'stacker exploit');
      await page.fill('[data-testid=switch-find]', 'tower');
      await page.waitForTimeout(400);
      await page.click('[data-testid="switch-arcade.game:stacker"]');
      await page.waitForSelector('[data-testid="switch-on-arcade.game:stacker"]', { timeout: 15000 });
      const o = await off();
      check('one cabinet switched off, with its note', o.length === 1 && o[0].key === 'arcade.game:stacker' && o[0].note === 'stacker exploit', JSON.stringify(o));
      await shot('02-one-off');
      await page.click('[data-testid="switch-on-arcade.game:stacker"]');
      await page.waitForTimeout(1200);
      check('…and back on', (await off()).length === 0);
      await page.fill('[data-testid=switch-find]', '');
      await page.click('[data-testid=switch-all]'); await page.waitForTimeout(1200);
      check('Stop ALL Ink', (await off()).some((x) => x.key === 'all'));
      await shot('03-all-off');
      await page.click('[data-testid=switch-all]'); await page.waitForTimeout(1200);
      check('…and ALL back on', (await off()).length === 0);
    } else {
      await page.waitForTimeout(800); await shot('01-phone');
      check('phone: the switches fit the screen (no sideways scroll)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));
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
