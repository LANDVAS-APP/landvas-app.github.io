// The last six of the twenty, in a real browser: a Cuckoo Egg hatches into the kind you pick; the 🔭 Spyglass looks at an
// unclaimed spot you tap on the map and shows its reading (and the ring on the map); the 🦢 Origami Pocket folds a plot in
// 3D into the pocket (paper on the map) and unfolds it somewhere new; the 🔥 Crucible melts plots into Heat and strikes
// one up a tier after three bellows pumps, and forges an artifact; the 🎭 Puppeteer pulls the strings of someone else's
// plot and the game opens on strings; the 🃏 Fated Deck turns a card that comes true; the ✍️ Glyphcaster reads a spiral
// drawn on its circle and casts it. On the website, then in the app's own skin (a simulated iOS shell).
// Run: npm run build:artifact && node tests/e2e/glass-fold-forge.mjs
import { serve, launch } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.E2E_OUT || path.resolve('test-results/e2e-glass-fold-forge'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 4357;
const server = await serve(process.env.E2E_DIST || 'dist-artifact', PORT);
let browser = null;
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const GRID = 4194304;
const cellAt = (lng, lat) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lng + 180) / 360) * GRID), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * GRID)]; };
const cellCenter = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / GRID); return [((gx + 0.5) / GRID) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]; };
const PORTLAND = { lng: -122.68, lat: 45.52 };
// E2E_PART=egg,spyglass,… runs only those parts (for working on one)
const PARTS = process.env.E2E_PART ? process.env.E2E_PART.split(',') : null;
const part = (n) => !PARTS || PARTS.includes(n);

async function run(mode) {
  const app = mode === 'app';
  const ctx = await browser.newContext({
    ...(app ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 }),
    colorScheme: 'dark',
    ...(app ? {} : { geolocation: { latitude: PORTLAND.lat, longitude: PORTLAND.lng, accuracy: 8 }, permissions: ['geolocation'] }),
  });
  if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::/.test(m.text())) errors.push(m.text()); });
  const ok = (n, v, x) => check(`${mode}: ${n}`, v, x);
  const shot = (n) => (process.env.E2E_NOSHOTS ? Promise.resolve() : page.screenshot({ path: `${OUT}/${mode}-${n}.png`, timeout: 60000 }).catch(() => console.log('skip', n)));
  // E2E_SCENES=dir: also snap each new scene on its own (for previews)
  const scene = async (n, id) => { if (!process.env.E2E_SCENES) return; fs.mkdirSync(process.env.E2E_SCENES, { recursive: true }); await page.locator(`[data-testid=${id}]`).first().screenshot({ path: `${process.env.E2E_SCENES}/${mode}-${n}.png`, timeout: 30000 }).catch((e) => console.log('scene skip', n, e.message.split('\n')[0])); };
  const sql = (q) => page.evaluate((q) => window.__landvasBackend.db.query(q).then((r) => r.rows), q);
  const api = (f, ...a) => page.evaluate(([f, a]) => { const p = f.split('.'); let o = window.__landvasApi; for (const k of p.slice(0, -1)) o = o[k]; return o[p.at(-1)](...a); }, [f, a]);
  const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
    const keys = Object.keys(args);
    return window.__landvasBackend.db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await tx.query('set local role authenticated');
      const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      return r.rows[0]?.r;
    });
  }, [uid, fn, args]);
  const nav = async (p) => { await page.evaluate((p) => window.__landvasNav(p), p); await page.waitForTimeout(900); };
  const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
  const text = (sel) => page.locator(sel).first().textContent().catch(() => '');
  const tap = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); await page.locator(sel).first().click({ force: true }); };
  /** on the map (picking a spot): zoom right in on a cell and tap it, then "use" it */
  const tapCell = async (gx, gy) => {
    await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 });
    const [lng, lat] = cellCenter(gx, gy);
    // (the map may still be flying to the picker's spot: stop it, jump, and tap — and once more if the tap didn't land)
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(1200);
      await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; m.stop(); m.jumpTo({ center: [lng, lat], zoom: 20.5 }); }, [lng, lat]);
      await page.waitForTimeout(900);
      const pt = await page.evaluate(([lng, lat]) => { const m = window.__landvasMap; const p = m.project([lng, lat]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, [lng, lat]);
      await page.mouse.click(pt.x, pt.y);
      if (await waitFor('[data-testid=pick-use]', 5000)) {
        // (the sheet slides up as it appears: let it settle, and press again if the first press missed)
        await page.waitForTimeout(500);
        for (let k = 0; k < 3; k++) {
          await page.click('[data-testid=pick-use]', { force: true }).catch(() => {});
          if (await page.waitForSelector('[data-testid=pick-card]', { state: 'detached', timeout: 3000 }).then(() => true, () => false)) break;
        }
        await page.waitForTimeout(1200);
        return true;
      }
    }
    console.log('  (no pick-use after tapping', gx, gy, ')');
    return false;
  };
  /** look at a cell on the map and wait for a marker there (the map may still be flying somewhere when we arrive: look twice) */
  const seeOnMap = async (gx, gy, sel, zoom = 18.5) => {
    await page.waitForFunction(() => !!window.__landvasMap, null, { timeout: 30000 });
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(1200);
      await page.evaluate(([lng, lat, z]) => { const m = window.__landvasMap; m.stop(); m.jumpTo({ center: [lng, lat], zoom: z }); }, [...cellCenter(gx, gy), zoom - i * 0.4]);
      if (await waitFor(sel, 10000)) return true;
    }
    return false;
  };
  try {
    await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
    if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', `gff_${mode}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
    await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `gff_${mode}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
    const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
    await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
    await sql(`select private.ledger_apply('${me}', 'ink', 50000, 'admin_adjust', 'test', 'test', 'e2e:gff:ink')`);
    await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
    const [bx, by] = cellAt(PORTLAND.lng, PORTLAND.lat);
    const pt = `(select id from plot_types order by sort limit 1)`;
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) select ${bx} + (k % 5) * 3, ${by} + (k / 5) * 3, '${me}', ${pt}, 'common', now() - interval '2 days' from generate_series(0, 19) k on conflict do nothing`);
    // someone else's plot nearby, with a game that's on
    const game = (await sql(`select t.id, t.minigame from plot_types t where t.minigame is not null and coalesce((private.cfg('minigames') -> 'games' -> t.minigame ->> 'enabled')::boolean, false) order by t.sort limit 1`))[0];
    const pia = (await sql(`insert into auth.users (email) values ('pia_gff_${mode}@example.test') returning id`))[0].id;
    const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
    await as(pia, 'complete_onboarding', { p_username: `pia_gff_${mode}`, p_accept_terms_version: terms });
    await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${pia}'`);
    await sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (${bx + 30}, ${by + 30}, '${pia}', '${game.id}', 'rare', now() - interval '1 day') on conflict do nothing`);
    const give = async (kind, i) => (await api('admin.giveEnchantment', me, kind, 'e2e: the six', { gx: bx + 1 + (i % 5) * 3, gy: by + 1 + Math.floor(i / 5) * 3 })).id;
    const ids = {};
    for (const [i, k] of ['spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph'].entries()) ids[k] = await give(k, i);
    ok('the owner can give all six new kinds', Object.values(ids).every(Boolean));
    ok('…and not a Cuckoo', await api('admin.giveEnchantment', me, 'cuckoo', 'e2e', null).then(() => false, () => true));

    // ---- 🥚 a Cuckoo Egg hatches ----
    if (part('egg')) {
    const [ex, ey] = [bx + 12, by + 9];
    await sql(`update world_plots set rarity = 'enchanted' where gx = ${ex} and gy = ${ey}`);
    const egg = (await sql(`select (private.ench_create('cuckoo', '${me}', ${ex}, ${ey})).id`))[0].id;
    await nav(`/grimoire/${egg}`);
    ok('a Cuckoo Egg shows the six to choose from', await waitFor('[data-testid=egg-choices]') && (await page.locator('[data-testid^=egg-pick-]').count()) === 6);
    await shot('01-egg'); await tap('[data-testid=egg-pick-crucible]').catch(() => {}); await page.waitForTimeout(600); await scene('egg', 'egg-scene');
    await tap('[data-testid=egg-pick-glyph]'); await tap('[data-testid=egg-hatch]');
    ok('…it cracks, and a Glyphcaster hatches', await waitFor('[data-testid=egg-born]', 12000) && (await sql(`select kind from enchantments where id = '${egg}'`))[0].kind === 'glyph');
    await page.waitForTimeout(900); await shot('02-hatched');
    }

    // ---- 🔭 Spyglass ----
    if (part('spyglass')) {
    await nav(`/grimoire/${ids.spyglass}`);
    ok('the Spyglass shows its night hill and its looks', await waitFor('[data-testid=spyglass-scene]') && /🔭/.test((await text('[data-testid=spyglass-looks]')) ?? ''));
    await shot('03-spyglass');
    await tap('[data-testid=spyglass-look]');
    ok('…a look hands over to the map, with its reach', await waitFor('[data-testid=pick-card]', 15000));
    const lookOk = await tapCell(bx + 7, by + 5);
    ok('…tap an unclaimed spot and come back', lookOk && await waitFor('[data-testid=spyglass-scene]', 15000));
    ok('…the lens clears on the reading', await waitFor('[data-testid=spyglass-reading]', 15000), await text('[data-testid=spyglass-reading]'));
    await page.waitForTimeout(800); await shot('04-spyglass-reading'); await scene('spyglass', 'spyglass-scene');
    ok('…and it’s listed as yours alone', await waitFor('[data-testid=spyglass-sightings]', 8000) && Number((await sql(`select count(*) n from private.spy_sightings where player_id = '${me}'`))[0].n) === 1);
    }

    // ---- 🦢 Origami Pocket ----
    if (part('origami')) {
    await nav(`/grimoire/${ids.origami}`);
    ok('the Origami Pocket shows its desk, its pocket and your plots', await waitFor('[data-testid=origami-scene]') && await waitFor('[data-testid=origami-plot]'));
    // pick the plot to fold on the real map
    await tap('[data-testid=origami-fold-map]');
    // (the map can take a while to open on a busy machine; if the press didn't land, press again)
    let picking = await waitFor('[data-testid=pick-card]', 25000);
    if (!picking && await page.locator('[data-testid=origami-fold-map]').count()) { await tap('[data-testid=origami-fold-map]'); picking = await waitFor('[data-testid=pick-card]', 20000); }
    ok('…the plot to fold can be picked on the map', picking);
    const pickedOnMap = await tapCell(bx + 3, by);
    ok('…tap it in its crosshairs and come back with it chosen', pickedOnMap && await waitFor('[data-testid=origami-fold]', 15000));
    await page.waitForTimeout(800); await shot('05-origami-paper');
    await tap('[data-testid=origami-fold]');
    await page.waitForTimeout(900); await scene('origami', 'origami-scene'); await shot('06-origami-folding');
    ok('…the plot folds into the pocket', await waitFor('[data-testid=origami-pocket-list]', 15000));
    const folded = (await sql(`select gx, gy, rarity from world_plots where folded_by = '${ids.origami}'`))[0];
    ok('…still yours, folded', !!folded);
    await page.waitForTimeout(1500); await shot('07-origami-pocket');
    await page.waitForSelector('[data-testid=origami-unfold]:not([disabled])', { timeout: 15000 }).catch(() => {});
    await tap('[data-testid=origami-unfold]');
    const unfoldPick = await waitFor('[data-testid=pick-card]', 15000);
    ok('…unfolding picks a free spot on the map', unfoldPick, unfoldPick ? '' : await page.evaluate(() => location.pathname + ' ' + (document.querySelector('[data-testid=origami-unfold]')?.outerHTML.slice(0, 160) ?? 'no button')));
    if (!unfoldPick) await page.screenshot({ path: `${OUT}/${mode}-07x-no-unfold-pick.png` }).catch(() => {});
    const paper = await seeOnMap(folded.gx, folded.gy, '[data-testid=map-fold]');
    ok('…a folded plot is paper on the map', paper, paper ? '' : JSON.stringify(await page.evaluate(() => ({ z: window.__landvasMap?.getZoom(), path: location.pathname, folds: document.querySelectorAll('.lvx-paper').length }))));
    if (!paper) await page.screenshot({ path: `${OUT}/${mode}-07c-no-paper.png` }).catch(() => {});
    await shot('07b-origami-paper-on-map');
    const to = [bx + 2, by + 2];
    const landOk = await tapCell(to[0], to[1]);
    ok('…it flies out of the pocket and unfolds there', landOk && await waitFor('[data-testid=origami-landed]', 20000));
    const moved = (await sql(`select owner_id, rarity from world_plots where gx = ${to[0]} and gy = ${to[1]}`))[0];
    ok('…the plot is in its new spot, its rarity with it', moved?.owner_id === me && moved?.rarity === folded?.rarity, JSON.stringify(moved));
    await shot('08-origami-landed');
    }

    // ---- 🔥 Crucible ----
    if (part('crucible')) {
    await sql(`update game_config set value = value || '{"crucible": {"need_uncommon": 0.0001, "need_rare": 0.0001, "cap": 1}}'::jsonb where key = 'enchantments'`);
    await sql(`update enchantments set state = state || '{"metal": {"iron": 20, "silver": 10, "gold": 6}}'::jsonb where id = '${ids.crucible}'`);
    await nav(`/grimoire/${ids.crucible}`);
    ok('the Crucible shows its forge and what can melt', await waitFor('[data-testid=crucible-scene]') && await waitFor('[data-testid=crucible-melt-plot]'));
    await page.locator('[data-testid=crucible-melt-plot]').nth(0).click({ force: true }); await page.locator('[data-testid=crucible-melt-plot]').nth(1).click({ force: true });
    await tap('[data-testid=crucible-melt]');
    await page.waitForTimeout(2200);
    ok('…two plots melt into Heat', Number((await sql(`select (state ->> 'heat')::numeric h from enchantments where id = '${ids.crucible}'`))[0].h) > 0, await text('[data-testid=crucible-heat]'));
    await shot('09-crucible-melted');
    await tap('[data-testid=crucible-tab-strike]');
    await page.waitForTimeout(500);
    await tap('[data-testid=crucible-target]');
    await tap('[data-testid=crucible-strike]');
    ok('…the bellows come up', await waitFor('[data-testid=crucible-bellows]', 6000));
    for (let i = 0; i < 3; i++) { await page.click('[data-testid=crucible-pump]', { force: true }); await page.waitForTimeout(350); }
    ok('…the hammer falls and the plot is forged up a tier', await waitFor('[data-testid=crucible-verdict]', 12000) && /→/.test((await text('[data-testid=crucible-verdict]')) ?? ''), await text('[data-testid=crucible-verdict]'));
    await page.waitForTimeout(600); await shot('10-crucible-forged'); await scene('crucible', 'crucible-scene');
    await tap('[data-testid=crucible-tab-craft]');
    await tap('[data-testid=crucible-forge-horseshoe]');
    ok('…metal forges an artifact', await waitFor('[data-testid=crucible-artifacts]', 8000));
    await shot('11-crucible-craft');
    }

    // ---- 🎭 Puppeteer ----
    if (part('puppet')) {
    await nav(`/grimoire/${ids.puppeteer}`);
    ok('the Puppeteer’s curtains part on someone else’s plot nearby', await waitFor('[data-testid=puppeteer-scene]') && await waitFor('[data-testid=puppeteer-plot]', 10000));
    await page.waitForTimeout(1300); await shot('12-puppeteer'); await scene('puppeteer', 'puppeteer-scene');
    await tap('[data-testid=puppeteer-plot]'); await tap('[data-testid=puppeteer-pull]');
    const strung = await waitFor('[data-testid=puppet-banner]', 15000);
    ok('…pulling the strings opens their plot’s game, on strings', strung);
    if (!strung) await shot('12b-no-banner');
    await tap('[data-testid=game-start]');
    await page.waitForTimeout(2500);
    ok('…a real session starts on their plot', Number((await sql(`select count(*) n from minigame_sessions where puppet_id = '${ids.puppeteer}' and gx = ${bx + 30}`))[0].n) === 1);
    await shot('13-puppet-game');
    }

    // ---- 🃏 Fated Deck ----
    if (part('deck')) {
    await nav(`/grimoire/${ids.deck}`);
    ok('the Fated Deck deals its cards face down', await waitFor('[data-testid=deck-scene]') && (await page.locator('[data-testid^=deck-card-]').count()) === 3);
    await page.waitForTimeout(900);
    await tap('[data-testid=deck-card-1]');
    ok('…a card turns over', await waitFor('[data-testid=deck-pending]', 10000), await text('[data-testid=deck-pending]'));
    await page.waitForTimeout(1000); await shot('14-deck-turned'); await scene('deck', 'deck-scene');
    await tap('[data-testid=deck-accept]');
    ok('…and comes true', await waitFor('[data-testid=deck-result]', 10000), await text('[data-testid=deck-result]'));
    await shot('15-deck-result');
    await sql(`update enchantments set level = 8 where id = '${ids.deck}'`);
    await nav(`/grimoire/${ids.deck}`);
    await waitFor('[data-testid=deck-grand]', 10000);
    await tap('[data-testid=deck-grand]');
    ok('…at level 8 the Grand Spread turns five cards at once', await waitFor('[data-testid=deck-grand-result]', 10000) && (await page.locator('[data-testid=deck-grand-result] .lvx-card').count()) === 5);
    await page.waitForTimeout(1500); await shot('15b-grand-spread');
    }

    // ---- ✍️ Glyphcaster ----
    if (part('glyph')) {
    await nav(`/grimoire/${ids.glyph}`);
    ok('the Glyphcaster shows its circle and its mana', await waitFor('[data-testid=glyph-scene]') && await waitFor('[data-testid=glyph-mana]'));
    await page.locator('[data-testid=glyph-canvas]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const box = await page.locator('[data-testid=glyph-canvas]').boundingBox();
    const pts = Array.from({ length: 73 }, (_, i) => { const t = i / 72; return [0.5 + Math.cos(t * Math.PI * 4.5) * 0.45 * t, 0.5 + Math.sin(t * Math.PI * 4.5) * 0.45 * t]; });
    const S = Math.min(box.width, box.height) * 0.6, ox = box.x + (box.width - S) / 2, oy = box.y + (box.height - S) / 2;
    await page.mouse.move(ox + pts[0][0] * S, oy + pts[0][1] * S); await page.mouse.down();
    for (const [x, y] of pts) await page.mouse.move(ox + x * S, oy + y * S, { steps: 2 });
    await page.mouse.up();
    ok('…a spiral drawn on the circle is read and cast', await waitFor('[data-testid=glyph-result]', 12000) && /Vortex|Ink/.test((await text('[data-testid=glyph-result]')) ?? ''), await text('[data-testid=glyph-result]'));
    await page.waitForTimeout(250); await scene('glyph', 'glyph-scene'); await shot('16-glyph-cast');
    await tap('[data-testid=glyph-tab-book]');
    ok('…the Spellbook shows 24 pages, the found ones readable', (await page.locator('[data-testid^=glyph-page-]').count()) === 24);
    await shot('17-glyph-book');
    }

    // ---- the map: a monument and the sighting ----
    if (part('map')) {
    const [mx, my] = [bx + 6, by + 3];
    await sql(`insert into crucible_monuments (gx, gy, player_id, name, points, tier) values (${mx}, ${my}, '${me}', 'The E2E Arch', 260, 3) on conflict do nothing`);
    await nav('/world');
    await page.keyboard.press('Escape').catch(() => {});
    const stands = await seeOnMap(mx, my, '[data-testid=map-monument]', 18);
    ok('a monument stands on the map', stands, stands ? '' : JSON.stringify(await page.evaluate(() => ({ z: window.__landvasMap?.getZoom(), c: window.__landvasMap?.getCenter() }))));
    if (!stands) await page.screenshot({ path: `${OUT}/${mode}-18b-no-monument.png` }).catch(() => {});
    if (part('spyglass')) ok('…and your Spyglass reading glows there (only for you)', await waitFor('[data-testid=map-sighting]', 15000), JSON.stringify(await sql(`select gx - ${bx} dx, gy - ${by} dy, used_at, refunded_at, expires_at > now() live from private.spy_sightings`)));
    await page.waitForTimeout(1200); await shot('18-map');
    }

        // ---- the Grimoire, organised ----
    if (part('grimoire')) {
    const second = await give('spyglass', 9);
    await nav('/grimoire');
    await page.evaluate(() => window.__landvasQc?.invalidateQueries({ queryKey: ['enchantments'] }));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=grimoire-group][data-kind=spyglass] [data-testid=grimoire-card]').length === 2, null, { timeout: 15000 }).catch(() => {});
    ok('the Grimoire leads with what’s ready now', await waitFor('[data-testid=grimoire-ready]'));
    ok('…and groups copies of a kind together', (await page.locator('[data-testid=grimoire-group][data-kind=spyglass] [data-testid=grimoire-card]').count()) === 2);
    ok('…every enchantment still has its card', (await page.locator('[data-testid=grimoire-card]').count()) >= 7);
    await tap('[data-testid=grimoire-filter-spliced]');
    await page.waitForTimeout(400);
    ok('…a filter narrows it (nothing spliced yet)', (await page.locator('[data-testid=grimoire-card]').count()) === 0);
    await tap('[data-testid=grimoire-filter-all]');
    await shot('19-grimoire');
    await nav(`/grimoire/${second}`);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=ench-copy]').length === 2, null, { timeout: 15000 }).catch(() => {});
    ok('an enchantment’s page: its status, what it works on, and a jump bar', await waitFor('[data-testid=ench-status]') && await waitFor('[data-testid=ench-works-on]') && await waitFor('[data-testid=ench-nav]'));
    ok('…and a switcher between your copies', (await page.locator('[data-testid=ench-copy]').count()) === 2);
    await page.locator('[data-testid=ench-copy]').first().click({ force: true });
    await page.waitForTimeout(900);
    ok('…that steps to the other one', await waitFor('[data-testid=spyglass-scene]'));
    await shot('20-ench-page');
    }

    // ---- Traits you use: fold a wait (Folded), trace a rune (Inscribed) ----
    if (part('traits')) {
    const sp = await give('splice', 10);
    const goose = await give('goose', 11);
    const deck2 = await give('deck', 12);
    await sql(`update enchantments set state = state || '{"charges": 4}'::jsonb where id = '${sp}'`);
    await as(me, 'enchant_act', { p_id: sp, p_action: 'splice', p_args: { mode: 'swap', a: ids.origami, b: goose } });
    const sp2 = await give('splice', 13);
    await sql(`update enchantments set state = state || '{"charges": 4}'::jsonb where id = '${sp2}'`);
    await as(me, 'enchant_act', { p_id: sp2, p_action: 'splice', p_args: { mode: 'swap', a: ids.glyph, b: deck2 } });
    await nav(`/grimoire/${goose}`);
    ok('a Folded partner offers to fold its longest wait', await waitFor('[data-testid=ench-fold]', 15000));
    await tap('[data-testid=ench-fold-go]');
    ok('…a tap folds it in half', await waitFor('[data-testid=ench-fold] >> text=Folded!', 10000), await text('[data-testid=ench-fold]'));
    await shot('21-trait-fold');
    await nav(`/grimoire/${deck2}`);
    ok('an Inscribed partner shows its rune to trace', await waitFor('[data-testid=ench-rune-canvas]', 15000));
    const rb = await (async () => { await page.locator('[data-testid=ench-rune-canvas]').scrollIntoViewIfNeeded(); await page.waitForTimeout(300); return page.locator('[data-testid=ench-rune-canvas]').boundingBox(); })();
    const star = [[0.5, 0.05], [0.78, 0.92], [0.05, 0.38], [0.95, 0.38], [0.22, 0.92], [0.5, 0.05]];
    const S = Math.min(rb.width, rb.height) * 0.9, ox = rb.x + (rb.width - S) / 2, oy = rb.y + (rb.height - S) / 2;
    await page.mouse.move(ox + star[0][0] * S, oy + star[0][1] * S); await page.mouse.down();
    for (let i = 1; i < star.length; i++) for (let t = 1; t <= 8; t++) {
      const [x0, y0] = star[i - 1], [x1, y1] = star[i];
      await page.mouse.move(ox + (x0 + ((x1 - x0) * t) / 8) * S, oy + (y0 + ((y1 - y0) * t) / 8) * S);
    }
    await page.mouse.up();
    ok('…traced, it casts its glyph for free', await waitFor('[data-testid=ench-rune-result]', 12000) && /Wish|Luck/.test((await text('[data-testid=ench-rune-result]')) ?? ''), await text('[data-testid=ench-rune-result]'));
    await shot('22-trait-rune');
    }

    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    ok('nothing wider than the screen', wide <= 0, `${wide}px`);
    if (app) ok('the app wears its own skin (html.native)', await page.evaluate(() => document.documentElement.classList.contains('native')));
    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check(`${mode}: run completed`, false, e.message.split('\n')[0]);
    await shot('99-err');
  } finally {
    await ctx.close();
  }
}

try {
  // a fresh browser for each skin (the 3D scenes and the map are heavy; one run shouldn't starve the next)
  for (const m of (process.env.E2E_ONLY ? [process.env.E2E_ONLY] : ['web', 'app'])) {
    browser = await launch().catch(async (e) => { console.log(`(launch failed: ${String(e?.message ?? e).split('\n')[0]} — once more)`); await new Promise((r) => setTimeout(r, 3000)); return launch(); })
      .catch((e) => { check(`${m}: browser launched`, false, String(e?.message ?? e).split('\n')[0]); return null; });
    if (!browser) continue;
    await run(m).catch((e) => check(`${m}: started`, false, String(e?.message ?? e).split('\n')[0]));
    await browser.close().catch(() => {}); browser = null;
  }
} finally {
  await browser?.close().catch(() => {}); server.close();
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
