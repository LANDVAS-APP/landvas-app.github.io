// Real-browser check of my.landvas.app: players never see code. Collection bonuses, a plot's enchantment, Inkborn
// eggs and "All my data" show plain words — no JSON, no braces, no internal IDs, no raw column names. Against a local
// PostgreSQL with every migration (through scripts/portal-dev-bridge.mjs, as in portal/README.md). Phone and desktop.
// Run: node tests/e2e/portal-my-readable.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-my-readable');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54392, BRIDGE = 8792, WEB = 5192;
const dataDir = path.resolve('.pgtmp', `portal-my-${process.pid}`);
fs.mkdirSync(path.dirname(dataDir), { recursive: true });
fs.chmodSync(path.dirname(dataDir), 0o777); // initdb may run as another user
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PGPORT, persistent: false, onLog: () => {}, onError: () => {} });
const kids = [];
let browser;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** what code looks like on a page: JSON keys, braces, null/true/false literals, snake_case words, IDs */
function codeIn(raw) {
  const text = raw.replaceAll('maya_plots', 'maya'); // the player's own username is theirs to see
  const found = [];
  if (/"[a-z_]+"\s*:/i.test(text)) found.push('JSON key');
  if (/[{}]/.test(text)) found.push('brace');
  if (/\bnull\b/.test(text)) found.push('null');
  if (/\b[a-z]+_[a-z_]+\b/.test(text)) found.push(`snake_case "${text.match(/\b[a-z]+_[a-z_]+\b/)[0]}"`);
  if (UUID.test(text)) found.push('ID');
  return found;
}

try {
  await db.initialise(); await db.start();
  const root = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'postgres' }); await root.connect();
  await root.query(`create database landvas template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`); await root.end();
  const c = new pg.Client({ host: 'localhost', port: PGPORT, user: 'postgres', password: 'postgres', database: 'landvas' }); await c.connect();
  await c.query(fs.readFileSync('supabase/local/shim.sql', 'utf8'));
  for (const f of fs.readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) {
    const s = fs.readFileSync(path.join('supabase/migrations', f), 'utf8'); if (!s.startsWith('-- @supabase-only')) await c.query(s);
  }
  const terms = (await c.query(`select value->>'terms_version' as v from game_config where key = 'legal'`)).rows[0].v;
  const as = async (uid, fn, args) => { await c.query('begin'); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]); await c.query('set local role authenticated');
    const keys = Object.keys(args); const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))); await c.query('commit'); return r.rows[0].r; };
  const id = (await c.query(`insert into auth.users (email) values ('maya@example.test') returning id`)).rows[0].id;
  await as(id, 'complete_onboarding', { p_username: 'maya_plots', p_accept_terms_version: terms });
  // plots of three types (one shiny), the collection bonus switched on, an enchantment with stats, an egg
  await c.query(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at, shiny) values
    (793536, 1576240, 'stencil', 'common', $1, now(), false), (793537, 1576240, 'fresco', 'rare', $1, now(), true),
    (793538, 1576240, 'graphite', 'common', $1, now(), false), (793539, 1576240, 'stencil', 'epic', $1, now(), false)`, [id]);
  await c.query(`update world_plots set shiny = true where gx = 793537 and gy = 1576240`); // claims roll their own shine
  await c.query(`update game_config set value = value || '{"enabled": true, "tiers": [{"types": 3, "pct": 5}, {"types": 8, "pct": 25}]}'::jsonb where key = 'collection'`);
  await c.query(`insert into enchantments (gx, gy, owner_id, kind, serial, sigil, nickname, level, xp, state, stats, titles, born_place, first_owner)
    values (793537, 1576240, $1, 'goose', 7, 3, 'Goldie', 3, 140, '{"egg": {"size": 4, "fox_at": 123}}', '{"ink": 420, "eggs": 6}', '{Fox Dodger}', 'Salt Lake City', $1)`, [id]);
  await c.query(`insert into inkborn_eggs (owner_id, kind, shell, genome, parents, hatch_at)
    values ($1, 'speckled', '{"a": "#ff00aa", "b": "#00ffcc"}', '{"body": "blob"}', $2, now() + interval '3 hours')`, [id, JSON.stringify([{ name: 'Pip', owner: id, genome: { body: 'blob' } }, { name: 'Moss', owner: id, genome: {} }])]);
  await c.end();

  const env = { ...process.env, DATABASE_URL: `postgres://postgres:postgres@localhost:${PGPORT}/landvas`, PORT: String(BRIDGE) };
  kids.push(spawn('node', ['scripts/portal-dev-bridge.mjs'], { env, stdio: 'ignore' }));
  kids.push(spawn('npx', ['vite', '--config', 'portal/vite.config.ts', '--port', String(WEB), '--strictPort'], { env: { ...process.env, PORTAL_APP: 'my', VITE_PORTAL_DEV_API: `http://localhost:${BRIDGE}` }, stdio: 'ignore' }));
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://localhost:${WEB}/sign-in`); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }

  for (const [label, vp] of [['phone', { width: 400, height: 860 }], ['desktop', { width: 1400, height: 1000 }]]) {
    browser = await launch();
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${label}-${n}.png`), fullPage: true }).catch(() => {});
    const main = async () => (await page.locator('main.p-content').innerText()).replace(/\s+/g, ' ');
    const noCode = async (where) => {
      const pre = await page.locator('main.p-content pre').count();
      const found = codeIn(await main());
      check(`${label}: ${where} shows no code`, pre === 0 && found.length === 0, [pre ? `${pre} <pre>` : '', ...found].filter(Boolean).join(', '));
    };

    await page.goto(`http://localhost:${WEB}/sign-in`, { waitUntil: 'load' });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.fill('input[type=email], input', 'maya@example.test');
    await page.locator('button[type=submit]').first().click();
    await page.waitForSelector('[data-testid=my-usd]', { timeout: 60000 });

    // Collection: the bonus ladder and the plot-type album instead of the raw JSON
    await page.goto(`http://localhost:${WEB}/collection`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=plot-type-album]', { timeout: 30000 });
    await page.waitForTimeout(600);
    const col = await page.locator('section', { has: page.locator('[data-testid=plot-type-album]') }).innerText();
    await page.waitForSelector('text=Achievements', { timeout: 30000 }); await page.waitForTimeout(800);
    check(`${label}: collection bonuses show the tiers in words`, /Collection bonuses/.test(col) && /\+5% on all your rent/.test(col) && /Own 3 different plot types/.test(col) && /unlocked/.test(col), col.slice(0, 200).replace(/\n/g, ' | '));
    check(`${label}: the album shows owned plot types`, /2 owned/.test(await page.locator('[data-testid=plot-type-stencil]').innerText()) && /Not yet/.test(await page.locator('[data-testid=plot-type-glass]').innerText().catch(() => 'Not yet')));
    check(`${label}: rarity cards count shiny plots`, /1 shiny/.test(await main()));
    await noCode('Collection');
    await shot('01-collection');
    await page.locator('section', { has: page.locator('[data-testid=plot-type-album]') }).screenshot({ path: path.join(OUT, `${label}-01b-bonuses.png`) }).catch(() => {});

    // a plot with an enchantment: its card in words, no "Everything about it" JSON
    await page.goto(`http://localhost:${WEB}/plots/793537/1576240`, { waitUntil: 'load' });
    await page.waitForSelector('text=Golden Goose', { timeout: 30000 });
    await page.waitForTimeout(600);
    const plotText = await main();
    check(`${label}: the plot's enchantment reads as a card`, /Goldie/.test(plotText) && /Golden Goose/.test(plotText) && /Ink 420/.test(plotText) && !/Everything about it/.test(plotText));
    await noCode('a plot');
    await shot('02-plot');

    // Enchantments
    await page.goto(`http://localhost:${WEB}/enchantments`, { waitUntil: 'load' });
    await page.waitForSelector('text=Goldie', { timeout: 30000 });
    await noCode('Enchantments');

    // Inkborn eggs: parents by name, no shell colours as JSON
    await page.goto(`http://localhost:${WEB}/inkborn`, { waitUntil: 'load' });
    await page.waitForSelector('text=Speckled egg', { timeout: 30000 });
    await page.waitForTimeout(400);
    const eggs = await main();
    check(`${label}: eggs show parents and status in words`, /Pip, Moss/.test(eggs) && /incubating/.test(eggs));
    await noCode('Inkborn');
    await shot('03-inkborn');

    // All my data: plain column names, no IDs, objects as words
    await page.goto(`http://localhost:${WEB}/data`, { waitUntil: 'load' });
    for (const t of ['World plots', 'Inkborn eggs', 'Enchantments']) {
      await page.locator('button', { hasText: t }).first().click({ timeout: 30000 });
      await page.waitForSelector(`h2:has-text("${t}")`, { timeout: 30000 });
      await page.waitForTimeout(800);
      await noCode(`All my data → ${t}`);
      if (t === 'Inkborn eggs') check(`${label}: an egg's shell reads as words`, /A: #ff00aa/.test(await main()));
      if (t === 'World plots') { check(`${label}: plots show as one Plot column, no block numbers`, /793 537 · 1 576 240/.test(await main()) && !/\bBx\b/.test(await main())); await shot('04-data-plots'); }
    }
    await shot('05-data-enchantments');
    // every other table in All my data, and every other page
    const tables = await page.locator('[data-testid=my-tables] button').allInnerTexts();
    for (const t of tables.map((x) => x.split('\n')[0].trim()).filter((x) => x && !['World plots', 'Inkborn eggs', 'Enchantments'].includes(x))) {
      await page.locator('[data-testid=my-tables] button', { hasText: t }).first().click();
      await page.waitForSelector(`h2:has-text("${t.split(' · ')[0]}")`, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(700);
      await noCode(`All my data → ${t}`);
    }
    for (const p of ['/', '/earnings', '/ledger', '/usd', '/cashouts', '/plots', '/activity', '/social', '/account']) {
      await page.goto(`http://localhost:${WEB}${p}`, { waitUntil: 'load' });
      await page.waitForSelector('main.p-content h1, main.p-content [data-testid=my-usd]', { timeout: 30000 });
      await page.waitForTimeout(1500);
      await noCode(`page ${p}`);
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
