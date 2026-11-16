// Real-browser check of admin.landvas.app → Rolls & Godrolls, and a player's Gifts tab, against a local PostgreSQL with
// every migration (through scripts/portal-dev-bridge.mjs, as in portal/README.md): the Godroll and Ascend settings
// save live; on a player, a ticket, an enchantment roll and a Godroll are sent, and their Ink earnings switched off and
// back. Phone and desktop sizes. Run: node tests/e2e/portal-rolls.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-rolls');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54397, BRIDGE = 8797, WEB = 5197;
const dataDir = path.resolve('.pgtmp', `portal-rolls-${process.pid}`);
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
    await page.goto(`http://localhost:${WEB}/rolls`, { waitUntil: 'load' });
    const loaded = await page.waitForSelector('[data-testid=rolls-page]', { timeout: 30000 }).then(() => true, () => false);
    check(`${label}: the Rolls page loads`, loaded);
    if (label === 'desktop') {
      await shot('01-rolls');
      await page.fill('[data-testid=num-echo_one_in]', '250000');
      await page.click('[data-testid=save-godrolls]'); await page.waitForTimeout(1200);
      check('Godroll odds save live', (await q1(`select value->>'echo_one_in' v from game_config where key = 'godrolls'`))[0].v === '250000');
      await page.fill('[data-testid=num-base_ink]', '150');
      await page.selectOption('[data-testid=asc-max]', 'legendary');
      await page.click('[data-testid=save-ascend]'); await page.waitForTimeout(1200);
      const a = (await q1(`select value->>'base_ink' b, value->>'max_rarity' m from game_config where key = 'ascend'`))[0];
      check('Ascend price and cap save live', a.b === '150' && a.m === 'legendary', JSON.stringify(a));
      check('…both in the audit log', Number((await q1(`select count(*) n from audit_logs where action = 'rolls.settings'`))[0].n) === 2);
      // a player's Gifts tab
      await page.goto(`http://localhost:${WEB}/players/${kid}/gifts`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid=player-gifts]', { timeout: 30000 });
      await page.selectOption('[data-testid=ticket-rarity]', 'enchanted');
      await page.selectOption('[data-testid=ticket-ench-kind]', 'genie');
      await page.selectOption('[data-testid=ticket-ench-stars]', '3');
      await page.selectOption('[data-testid=ticket-ench-level]', '5');
      await page.fill('[data-testid=ticket-label]', 'Contest winner');
      await page.click('[data-testid=ticket-go]'); await page.waitForTimeout(1200);
      const t = (await q1(`select min_rarity, enchant, label from roll_tickets where player_id = $1`, [kid]))[0];
      check('a ticket for an exact enchantment is sent', t?.min_rarity === 'enchanted' && t.enchant.kind === 'genie' && t.enchant.stars === 3 && t.enchant.level === 5 && t.label === 'Contest winner', JSON.stringify(t));
      check('…it shows in their list', (await page.locator('[data-testid=ticket-list] >> text=Contest winner').count()) === 1);
      await page.selectOption('[data-testid=ench-kind]', 'oracle');
      await page.click('[data-testid=ench-mode-luck]');
      await page.click('[data-testid=ench-go]'); await page.waitForTimeout(1200);
      const g = (await q1(`select rarity, mode, enchant from private.granted_rolls where player_id = $1`, [kid]))[0];
      check('an enchantment is lined up on their next Luck rerolls', g?.rarity === 'enchanted' && g.mode === 'luck' && g.enchant.kind === 'oracle', JSON.stringify(g));
      await page.selectOption('[data-testid=god-kind]', 'pantheon');
      await page.selectOption('[data-testid=god-rolls]', '7');
      await page.click('[data-testid=god-go]'); await page.waitForTimeout(1200);
      const gq = (await q1(`select kind, rolls from private.godroll_queue where player_id = $1`, [kid]))[0];
      check('a Pantheon Godroll with 6 rerolls is lined up', gq?.kind === 'pantheon' && gq.rolls === 7, JSON.stringify(gq));
      await page.click('[data-testid=ink-mode-off]'); await page.waitForTimeout(1200);
      check('their Ink earnings switch off', (await q1(`select mode from private.player_ink_modes where player_id = $1`, [kid]))[0]?.mode === 'off');
      await shot('02-gifts');
      await page.click('[data-testid=ink-mode-default]'); await page.waitForTimeout(1200);
      check('…and back to the game’s own setting', (await q1(`select count(*) n from private.player_ink_modes where player_id = $1`, [kid]))[0].n === '0');
    } else {
      await page.waitForTimeout(800); await shot('01-phone');
      check('phone: the Rolls page fits the screen (no sideways scroll)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));
      await page.goto(`http://localhost:${WEB}/players/${kid}/gifts`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid=player-gifts]', { timeout: 30000 }); await page.waitForTimeout(600); await shot('02-phone-gifts');
      check('phone: the Gifts tab fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));
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
