// Real-browser check of admin.landvas.app → Stars (Skywright), against a local PostgreSQL with every migration (through
// scripts/portal-dev-bridge.mjs, as in portal/README.md): a painting on a star waits in the review queue (its picture
// shown), approving it puts it on the star; a rejected one tells the painter why; the settings save live (in the audit
// log); the latest discoveries are listed. Phone and desktop sizes. Run: node tests/e2e/portal-stars.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-portal-stars');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const PGPORT = 54398, BRIDGE = 8798, WEB = 5198;
const dataDir = path.resolve('.pgtmp', `portal-stars-${process.pid}`);
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
  const kid = await player('kid_painter');
  const amy = await player('amy_painter');
  // a star with two painters on it (a neutron star: 12 plots), each painting waiting for review
  const star = (await c.query(`select x.id from (select ((1 * 8 + f) * 131072 + i)::bigint * 131072 * 16 + j * 16 + k as id from generate_series(0, 5) f, generate_series(0, 40) i, generate_series(0, 40) j, generate_series(0, 6) k) x
                                where (private.sw_star(x.id) ->> 'cls') = 'neutron' limit 1`)).rows[0].id;
  for (const [u, cell] of [[kid, 0], [amy, 1]]) {
    await c.query(`update resource_balances set amount = 100000 where player_id = $1 and resource = 'ink'`, [u]);
    await as(u, 'star_warp', { p_id: star }); await as(u, 'star_rush', {});
    await as(u, 'star_claim', { p_id: star, p_cell: cell, p_kind: 'base' });
  }
  // (a tiny painting: a red and a blue square on a 128×64 flat map, as PNG)
  const png = (r, g, b) => { const w = 128, h = 64; const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; const on = x > 40 && x < 90 && y > 16 && y < 48; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = on ? 255 : 0; } }
    const zlib = require('node:zlib'); const crc = (buf) => { let c2 = ~0; for (const x of buf) { c2 ^= x; for (let k = 0; k < 8; k++) c2 = (c2 >>> 1) ^ (0xEDB88320 & -(c2 & 1)); } return ~c2 >>> 0; };
    const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64'); };
  await as(kid, 'star_art_save', { p_id: star, p_img: png(255, 77, 109), p_w: 128, p_h: 64, p_color: '#ff4d6d' });
  await as(amy, 'star_art_save', { p_id: star, p_img: png(52, 195, 255), p_w: 128, p_h: 64, p_color: '#34c3ff' });
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
    page.on('dialog', (d) => void d.accept());
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${label}-${n}.png`), fullPage: false }).catch(() => {});
    await page.goto(`http://localhost:${WEB}/`, { waitUntil: 'load' });
    await page.waitForSelector('input', { timeout: 60000 });
    await page.fill('input[type=email], input', 'boss_admin@example.test');
    await page.locator('button[type=submit]').first().click();
    await page.waitForSelector('nav, .p-nav, .p-side', { timeout: 30000 }).catch(() => {});
    await page.goto(`http://localhost:${WEB}/stars`, { waitUntil: 'load' });
    const loaded = await page.waitForSelector('[data-testid=stars-page]', { timeout: 30000 }).then(() => true, () => false);
    check(`${label}: the Stars page loads`, loaded);
    if (label === 'desktop') {
      await page.waitForSelector('[data-testid=star-art-item]', { timeout: 15000 }).catch(() => {});
      const items = await page.locator('[data-testid=star-art-item]').count();
      await page.waitForSelector('[data-testid=star-art-crop]', { timeout: 8000 }).catch(() => {});
      const imgOk = await page.locator('[data-testid=star-art-crop]').first().evaluate((i) => i.complete && i.naturalWidth > 0 && i.naturalWidth >= i.naturalHeight).catch(() => false);
      check('both paintings wait in the review queue, each cropped to where it’s painted', items === 2 && imgOk, `${items} waiting`);
      // see one on its star, turning
      await page.locator('[data-testid=star-art-look]').first().click();
      const globeOk = await page.waitForSelector('[data-testid=star-art-globe] [data-testid=star-globe]', { timeout: 45000 }).then(() => true, () => false);
      if (!globeOk) { await shot('01b-globe-missing'); console.log('modal:', await page.locator('[data-testid=star-art-globe]').count(), errors.slice(0, 3)); }
      check('“See it on the star”: the painting on its star, turning', globeOk);
      await page.waitForTimeout(1500); await shot('01b-globe');
      if (await page.locator('[data-testid=star-art-globe]').count()) await page.click('[data-testid=star-art-globe]', { position: { x: 5, y: 5 } }); await page.waitForTimeout(400);
      await shot('01-queue');
      // approve kid's, reject amy's with a reason
      const kidItem = page.locator('[data-testid=star-art-item]', { hasText: 'kid_painter' });
      await kidItem.locator('[data-testid=star-art-approve]').click(); await page.waitForTimeout(1500);
      const amyItem = page.locator('[data-testid=star-art-item]', { hasText: 'amy_painter' });
      await amyItem.locator('input').fill('Please keep it friendly');
      await amyItem.locator('[data-testid=star-art-reject]').click(); await page.waitForTimeout(1500);
      const st = await q1(`select owner_id, status, reason from star_art where star_id = $1 order by owner_id`, [star]);
      const byOwner = Object.fromEntries(st.map((r) => [r.owner_id, r]));
      check('approve one: it’s on the star', byOwner[kid]?.status === 'approved');
      check('reject the other: the painter is told why', byOwner[amy]?.status === 'rejected' && byOwner[amy]?.reason === 'Please keep it friendly'
        && (await q1(`select data from player_notifications where player_id = $1 and kind = 'star' order by id desc limit 1`, [amy]))[0]?.data?.sub === 'art_no');
      const sys = (await q1(`select color, art_rev from star_systems where star_id = $1`, [star]))[0];
      check('the star wears the approved painting’s colour', sys?.color?.toLowerCase() === '#ff4d6d' && sys.art_rev > 0, JSON.stringify(sys));
      check('…and the queue is empty', await page.locator('[data-testid=star-art-item]').count() === 0);
      await page.click('[data-testid=star-art-tab-approved]'); await page.waitForTimeout(1200);
      check('“On the stars”: the approved one, to take down if need be', (await page.locator('[data-testid=star-art-item]', { hasText: 'kid_painter' }).count()) === 1 && (await page.locator('[data-testid=star-art-reject]').count()) >= 1);
      await page.click('[data-testid=star-art-tab-rejected]'); await page.waitForTimeout(1200);
      check('“Turned down”: the rejected one, with why', /keep it friendly/.test(await page.locator('[data-testid=star-art-queue]').textContent().catch(() => '')));
      await page.click('[data-testid=star-art-tab-pending]'); await page.waitForTimeout(800);
      // review off: a new painting goes straight onto the star; on again; approve everything waiting at once
      await page.click('[data-testid=star-art-review-toggle]'); await page.waitForTimeout(1500);
      check('review can be turned off', (await q1(`select value->'art'->>'review' r from game_config where key = 'stars'`))[0].r === 'false');
      await as(amy, 'star_art_save', { p_id: star, p_img: png(52, 195, 255), p_w: 128, p_h: 64, p_color: '#34c3ff' });
      check('…then a painting is on the star straight away', (await q1(`select status from star_art where star_id = $1 and owner_id = $2`, [star, amy]))[0].status === 'approved');
      await page.click('[data-testid=star-art-review-toggle]'); await page.waitForTimeout(1500);
      check('…and back on', (await q1(`select value->'art'->>'review' r from game_config where key = 'stars'`))[0].r === 'true');
      await as(kid, 'star_art_save', { p_id: star, p_img: png(255, 77, 109), p_w: 128, p_h: 64, p_color: '#ff4d6d' });
      await as(amy, 'star_art_save', { p_id: star, p_img: png(52, 195, 255), p_w: 128, p_h: 64, p_color: '#34c3ff' });
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('[data-testid=star-art-approve-all]', { timeout: 15000 }).catch(() => {});
      await page.click('[data-testid=star-art-approve-all]'); await page.waitForTimeout(1800);
      check('“Approve all waiting”', (await q1(`select count(*) n from star_art where status = 'pending'`))[0].n === '0');
      // the settings
      await page.fill('[data-testid="stars-num-rent_mult"]', '1.15');
      await page.fill('[data-testid="stars-num-warp.rush_ink"]', '15');
      await page.fill('[data-testid="stars-num-sky.size_k"]', '12');
      await page.fill('[data-testid="stars-num-reach.base"]', '2');
      await page.fill('[data-testid="stars-num-art.region_px"]', '48');
      await page.selectOption('[data-testid=stars-keystone-floor]', 'legendary');
      await page.click('[data-testid=stars-save]'); await page.waitForTimeout(1500);
      const cfg = (await q1(`select value from game_config where key = 'stars'`))[0].value;
      check('settings save live (top-level and the warp’s)', Number(cfg.rent_mult) === 1.15 && Number(cfg.warp?.rush_ink) === 15 && Number(cfg.warp?.base_ink) === 30, JSON.stringify({ rent: cfg.rent_mult, warp: cfg.warp }));
      check('…the sky’s sizes, the telescope’s reach, the painter’s detail, the Keystones’ floor too', Number(cfg.sky?.size_k) === 12 && Number(cfg.sky?.shell_x) === 2.6 && Number(cfg.reach?.base) === 2 && Number(cfg.art?.region_px) === 48 && cfg.keystone_floor === 'legendary',
        JSON.stringify({ sky: cfg.sky, reach: cfg.reach, art: cfg.art, floor: cfg.keystone_floor }));
      check('…recorded in the audit log', Number((await q1(`select count(*) n from audit_logs where action = 'stars.settings'`))[0].n) >= 1);
      const recent = await page.locator('[data-testid=stars-recent]').textContent().catch(() => '');
      check('the latest discoveries list the star (and its Discoverer)', /kid_painter/.test(recent ?? ''), (recent ?? '').slice(0, 80));
      await shot('02-settings');
      // each plot type's numbers (one type at a time, the rest kept)
      await page.fill('[data-testid="stars-kinds-forge-h_per_hour"]', '8');
      await page.click('[data-testid=stars-nested-save]'); await page.waitForTimeout(1500);
      const cfg2 = (await q1(`select value from game_config where key = 'stars'`))[0].value;
      check('a plot type’s numbers save (the others kept)', Number(cfg2.kinds?.forge?.h_per_hour) === 8 && Number(cfg2.kinds?.forge?.cap_hours) === 24 && Number(cfg2.kinds?.grove?.grow_hours) === 6, JSON.stringify(cfg2.kinds?.forge));
      // a supernova, on the star with the two painters (two taps: it can't be undone)
      await page.fill('[data-testid=stars-nova-code]', String(star));
      await page.click('[data-testid=stars-nova-go]'); await page.waitForTimeout(300);
      check('…a supernova asks twice', (await q1(`select supernova_at from star_systems where star_id = $1`, [star]))[0].supernova_at === null);
      await page.click('[data-testid=stars-nova-go]'); await page.waitForTimeout(1500);
      const nova = (await q1(`select supernova_at from star_systems where star_id = $1`, [star]))[0];
      const gold = (await q1(`select amount from star_elements where player_id = $1 and element = 'au'`, [kid]))[0];
      check('…and then it goes supernova: gold for everyone on it', !!nova.supernova_at && Number(gold?.amount) === 1, JSON.stringify(gold));
      await shot('03-supernova');
    } else {
      await page.waitForTimeout(800); await shot('01-phone');
      check('phone: the Stars page fits the screen (no sideways scroll)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));
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
