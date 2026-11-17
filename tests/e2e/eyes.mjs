// Real-browser test of Explorer's Eyes, the first-person view (local-mode build, a phone; then the simulated iOS app).
// The street tiles and the elevation tiles are served from here (a made-up town of streets, blocks, towers, a park and a
// pond on every tile; a mountain ridge 30 km east), so the whole pipeline runs without the internet:
//  - the map's 👁️ button dives in; the view opens: the streets on the ground, the buildings standing, trees, the land
//    to the horizon, every plot around you (yours floating its card), a Primordial's beacon in its true direction
//  - the real sky: by day the sun, at night stars, and a tapped star says what it is
//  - the Leviathan, 3 km off, on the skyline: tap it and an ink bomb flies (and really hits it)
//  - a sky treasure: tap it and it's caught (Ink / Luck / a ticket), the count goes up
//  - tap the ground: that plot's panel opens; walk with W: forward is where you look
//  - a picture; back to the map
// Build: VITE_STREETS=https://tiles.openfreemap.org/planet npx vite build --mode artifact --outDir dist-eyes
// Run:   node tests/e2e/eyes.mjs
import { serve, launch } from './browser.mjs';
import { encode, decode } from 'fast-png';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODE = process.argv[2] || '';
if (!MODE) {
  let bad = 0;
  for (const m of ['web', 'app']) bad += spawnSync(process.execPath, [fileURLToPath(import.meta.url), m], { stdio: 'inherit' }).status ? 1 : 0;
  process.exit(bad ? 1 : 0);
}
const app = MODE === 'app';
const OUT = process.env.E2E_OUT || path.resolve(`test-results/e2e-eyes-${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const PORT = app ? 4291 : 4290;
const G = 2 ** 22;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  [${MODE}] ${name}${extra ? ' — ' + extra : ''}`); };
const START = { gx: 12398 * 64 + 20, gy: 24628 * 64 + 44 }; // Salt Lake City
const ll = (gx, gy) => { const n = Math.PI * (1 - (2 * (gy + 0.5)) / G); return { lng: ((gx + 0.5) / G) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) }; };
const HERE = ll(START.gx, START.gy);

// ---- a made-up town as vector tiles --------------------------------------------------------------------------------
class W {
  constructor() { this.b = []; }
  varint(n) { while (n > 127) { this.b.push((n & 127) | 128); n = Math.floor(n / 128); } this.b.push(n); return this; }
  tag(f, w) { return this.varint((f << 3) | w); }
  bytes(f, u) { this.tag(f, 2).varint(u.length); for (const x of u) this.b.push(x); return this; }
  str(f, s) { return this.bytes(f, [...new TextEncoder().encode(s)]); }
  packed(f, xs) { const w = new W(); xs.forEach((x) => w.varint(x)); return this.bytes(f, w.b); }
}
const zz = (n) => (n << 1) ^ (n >> 31);
function geom(rings, close) {
  const out = []; let x = 0, y = 0;
  for (const r of rings) {
    out.push(1 | (1 << 3), zz(r[0][0] - x), zz(r[0][1] - y)); x = r[0][0]; y = r[0][1];
    if (r.length === 1) continue; // (a point)
    out.push(2 | ((r.length - 1) << 3));
    for (const [px, py] of r.slice(1)) { out.push(zz(px - x), zz(py - y)); x = px; y = py; }
    if (close) out.push(7 | (1 << 3));
  }
  return out;
}
function mvt(layers) {
  const t = new W();
  for (const L of layers) {
    const keys = [], vals = [];
    const l = new W().tag(15, 0).varint(2).str(1, L.name);
    for (const f of L.features) {
      const tags = [];
      for (const [k, v] of Object.entries(f.props)) {
        let ki = keys.indexOf(k); if (ki < 0) { keys.push(k); ki = keys.length - 1; }
        let vi = vals.indexOf(v); if (vi < 0) { vals.push(v); vi = vals.length - 1; }
        tags.push(ki, vi);
      }
      l.bytes(2, new W().packed(2, tags).tag(3, 0).varint(f.type).packed(4, geom(f.rings, f.type === 3)).b);
    }
    for (const k of keys) l.str(3, k);
    for (const v of vals) l.bytes(4, (typeof v === 'string' ? new W().str(1, v) : new W().tag(5, 0).varint(v)).b);
    l.tag(5, 0).varint(4096);
    t.bytes(3, l.b);
  }
  return Buffer.from(t.b);
}
const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
// where you stand, in a tile's units (your block is a little square with trees: room to look around)
const hereIn = (z, x, y) => { const n = 2 ** z; const X = (HERE.lng + 180) / 360, r = (HERE.lat * Math.PI) / 180, Y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; return [(X * n - x) * 4096, (Y * n - y) * 4096]; };
function town(z, x, y) {
  const step = 512, roads = [], blds = [], parks = [], water = [], wood = [];
  const [hu, hv] = hereIn(z, x, y);
  for (let k = 0; k <= 4096; k += step) {
    const cls = (k / step) % 4 === 0 ? 'primary' : (k / step) % 2 === 0 ? 'secondary' : 'minor';
    roads.push({ type: 2, props: { class: cls }, rings: [[[k, -64], [k, 4160]]] }, { type: 2, props: { class: cls }, rings: [[[-64, k], [4160, k]]] });
  }
  let seed = (x * 73856093) ^ (y * 19349663) ^ z;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let bx = 0; bx < 4096; bx += step) for (let by = 0; by < 4096; by += step) {
    const pick = rnd();
    const mine = z >= 14 && Math.abs(bx + step / 2 - hu) < step * 0.75 && Math.abs(by + step / 2 - hv) < step * 0.75;
    if (mine || pick < 0.1) { parks.push({ type: 3, props: { class: 'park' }, rings: sq(bx + 40, by + 40, bx + step - 40, by + step - 40) }); continue; }
    if (pick < 0.14) { water.push({ type: 3, props: { class: 'lake' }, rings: sq(bx + 60, by + 60, bx + step - 60, by + step - 60) }); continue; }
    if (pick < 0.18) { wood.push({ type: 3, props: { class: 'wood' }, rings: sq(bx + 30, by + 30, bx + step - 30, by + step - 30) }); continue; }
    const tall = rnd() < 0.12;
    for (const [ox, oy] of [[60, 60], [270, 60], [60, 270], [270, 270]]) {
      const h = tall && ox === 60 && oy === 60 ? 60 + Math.floor(rnd() * 120) : 6 + Math.floor(rnd() * 24);
      blds.push({ type: 3, props: { render_height: h, render_min_height: 0 }, rings: sq(bx + ox, by + oy, bx + ox + 170, by + oy + 170) });
    }
  }
  // the town's name on the map (and the quarter you're in), where the map's labels are
  const labels = [];
  if (z <= 12 && hu >= -200 && hu <= 4296 && hv >= -200 && hv <= 4296) {
    labels.push({ type: 1, props: { class: 'city', name: 'Eyesville', capital: 4 }, rings: [[[Math.round(hu + 140), Math.round(hv - 90)]]] });
    labels.push({ type: 1, props: { class: 'suburb', name: 'Lantern Quarter' }, rings: [[[Math.round(hu - 30), Math.round(hv + 25)]]] });
  }
  return mvt([
    ...(labels.length ? [{ name: 'place', features: labels }] : []),
    { name: 'landuse', features: [{ type: 3, props: { class: 'residential' }, rings: sq(0, 0, 4096, 4096) }] },
    { name: 'landcover', features: wood },
    { name: 'park', features: parks },
    { name: 'water', features: water },
    { name: 'transportation', features: roads },
    { name: 'building', features: blds },
  ]);
}
// ---- a mountain ridge 30 km east, as terrarium elevation tiles --------------------------------------------------------
function dem(z, x, y) {
  const n = 2 ** z, size = 256, data = new Uint8Array(size * size * 4);
  const kmE = 111.32 * Math.cos((HERE.lat * Math.PI) / 180);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const lng = ((x + (i + 0.5) / size) / n) * 360 - 180;
    const yy = Math.PI * (1 - (2 * (y + (j + 0.5) / size)) / n);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(yy));
    const east = (lng - HERE.lng) * kmE, north = (lat - HERE.lat) * 111.32;
    const h = 1300 + 2400 * Math.exp(-(((east - 30) / 7) ** 2)) * (0.7 + 0.3 * Math.sin(north / 6)) + 500 * Math.exp(-(((north - 25) / 9) ** 2));
    const v = h + 32768;
    const k = (j * size + i) * 4;
    data[k] = Math.floor(v / 256); data[k + 1] = Math.floor(v) % 256; data[k + 2] = Math.floor((v - Math.floor(v)) * 256); data[k + 3] = 255;
  }
  return Buffer.from(encode({ width: size, height: size, data, channels: 4 }));
}

const server = await serve(process.env.E2E_DIST || 'dist-eyes', PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', geolocation: { latitude: HERE.lat, longitude: HERE.lng, accuracy: 8 }, permissions: ['geolocation'] });
if (app) await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }; });
let tilesServed = 0, demServed = 0;
await ctx.route('https://tiles.openfreemap.org/**', (route) => {
  const u = route.request().url();
  if (/\/planet$/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) });
  const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(u);
  if (m) { tilesServed++; return route.fulfill({ status: 200, contentType: 'application/x-protobuf', headers: { 'access-control-allow-origin': '*' }, body: town(+m[1], +m[2], +m[3]) }); }
  return route.fulfill({ status: 404, body: '' });
});
await ctx.route('https://s3.amazonaws.com/elevation-tiles-prod/**', (route) => {
  const m = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(route.request().url());
  if (!m) return route.fulfill({ status: 404, body: '' });
  demServed++;
  return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: dem(+m[1], +m[2], +m[3]) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|fonts.g|WebGL|net::|Content Security Policy|glyphs|pbf/.test(m.text())) errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 45000 }).catch(() => {});
const api = (f, ...a) => page.evaluate(([f, a]) => window.__landvasApi[f](...a), [f, a]);
const sql = (q, p = []) => page.evaluate(([q, p]) => window.__landvasBackend.db.query(q, p).then((r) => r.rows), [q, p]);
const nav = (p) => page.evaluate((p) => window.__landvasNav(p), p);
const waitFor = (sel, timeout = 20000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const eyes = (fn, ...a) => page.evaluate(([fn, a]) => { const e = window.__landvasEyes; return e ? e[fn](...a) : null; }, [fn, a]);
const as = (uid, fn, args = {}) => page.evaluate(async ([uid, fn, args]) => {
  const keys = Object.keys(args);
  return window.__landvasBackend.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0]?.r;
  });
}, [uid, fn, args]);
async function someone(name) {
  const id = (await sql(`insert into auth.users (email) values ('${name}@example.test') returning id`))[0].id;
  const terms = (await sql(`select value->>'terms_version' v from game_config where key = 'legal'`))[0].v;
  await as(id, 'complete_onboarding', { p_username: name, p_accept_terms_version: terms });
  await sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = '${id}'`);
  return id;
}
/** a local hour today (the page's clock) as a timestamp */
const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };

try {
  await page.goto(`http://localhost:${PORT}/?e2e=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=title-play], #email', { timeout: 90000 });
  if (await page.locator('[data-testid=title-play]').count()) await page.click('[data-testid=title-play]', { force: true });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', `eyes-${MODE}@example.test`); await page.fill('#password', 'paint-the-world'); await page.click('button[type=submit]');
  await page.waitForSelector('#username', { timeout: 30000 }); await page.fill('#username', `eyes_${MODE}`); await page.check('input[type=checkbox]'); await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__landvasUi.getState().updateSettings({ simpleMode: false }));
  const me = (await sql(`select id from players order by created_at desc limit 1`))[0].id;
  await sql(`update players set created_at = now() - interval '3 days' where id = '${me}'`);
  await sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  await sql(`update resource_balances set amount = 20000 where player_id = $1 and resource = 'ink'`, [me]);
  const r0 = await api('reportPosition', HERE.lng, HERE.lat, 8).catch(() => null);
  if (r0) await page.evaluate((r) => window.__landvasExplorer?.getState().set(r), r0);

  // the land around: my plot (a Legendary), the neighbours' (a Mythic, a Rare, a Solar), a Primordial across town
  const mine = { gx: START.gx + 3, gy: START.gy - 4 };
  await as(me, 'claim_starter_plot', { p_gx: mine.gx, p_gy: mine.gy });
  await sql(`update world_plots set rarity = 'legendary' where gx = $1 and gy = $2`, [mine.gx, mine.gy]);
  const ned = await someone('eyes_ned');
  const spots = [[START.gx - 3, START.gy - 6, 'mythic'], [START.gx + 6, START.gy + 2, 'rare'], [START.gx - 8, START.gy + 1, 'solar']];
  for (const [gx, gy, r] of spots) {
    await sql(`insert into world_plots (gx, gy, owner_id, claimed_at, rarity, plot_type) values ($1, $2, $3, now(), $4, 'graphite')
               on conflict (gx, gy) do update set owner_id = excluded.owner_id, claimed_at = now(), rarity = excluded.rarity`, [gx, gy, ned, r]).catch((e) => console.log('plot insert:', String(e).slice(0, 200)));
  }
  // ultras near you (each raises its monument) and a row of plots of every type (each with its piece of the type)
  for (const [dx, dy, r] of [[2, -2, 'volcano'], [-2, 2, 'kraken'], [9, -6, 'crown'], [-4, -3, 'singularity']]) {
    await sql(`insert into world_plots (gx, gy, owner_id, claimed_at, rarity, plot_type) values ($1, $2, $3, now(), $4, 'prism')
               on conflict (gx, gy) do update set owner_id = excluded.owner_id, claimed_at = now(), rarity = excluded.rarity`, [START.gx + dx, START.gy + dy, ned, r]).catch((e) => console.log('ultra insert:', String(e).slice(0, 200)));
  }
  for (const [i, t] of ['graphite', 'pigment', 'mosaic', 'lumina', 'fresco', 'stencil', 'prism', 'glass'].entries()) {
    await sql(`insert into world_plots (gx, gy, owner_id, claimed_at, rarity, plot_type) values ($1, $2, $3, now(), 'rare', $4)
               on conflict (gx, gy) do update set owner_id = excluded.owner_id, claimed_at = now(), plot_type = excluded.plot_type`, [START.gx - 4 + i, START.gy - 12, ned, t]).catch((e) => console.log('type insert:', String(e).slice(0, 200)));
  }
  // what the plots around have been made into: places standing on them
  const places = [
    ['farm', [[6, -4]]], ['business', [[-2, 4]]], ['habitat', [[1, 5]]], ['home', [[-6, -2]]], ['mine', [[9, 2]]], ['sky', [[-5, 6]]],
    ['diner', [[4, 7]]], ['dungeon', [[-9, -5]]], ['workshop', [[7, -8]]], ['brawl', [[-2, -9]]], ['train', [[11, -3]]], ['landlord', [[-11, 3]]],
    ['boardwalk', [[12, 6], [13, 6], [12, 7], [13, 7]]], ['exchange', [[3, 11], [4, 11], [3, 12], [4, 12]]],
    ['kingdom', [[-15, -3], [-14, -3], [-13, -3], [-15, -2], [-14, -2], [-13, -2], [-15, -1], [-14, -1], [-13, -1]]],
  ];
  for (const [kind, cells] of places) {
    const abs = cells.map(([dx, dy]) => [START.gx + dx, START.gy + dy]);
    for (const [gx, gy] of abs) await sql(`insert into world_plots (gx, gy, owner_id, claimed_at, rarity, plot_type) values ($1, $2, $3, now(), 'common', 'graphite')
               on conflict (gx, gy) do update set owner_id = excluded.owner_id`, [gx, gy, ned]).catch((e) => console.log('place plot:', String(e).slice(0, 160)));
    const xs = abs.map((c) => c[0]), ys = abs.map((c) => c[1]);
    const g = await sql(`insert into canvas_groups (owner_id, name, kind, plot_count, min_gx, min_gy, max_gx, max_gy) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ned, `Ned's ${kind}`, kind, abs.length, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]).catch((e) => { console.log('place group:', kind, String(e).slice(0, 160)); return []; });
    if (g[0]) for (const [gx, gy] of abs) await sql(`insert into canvas_group_members (group_id, gx, gy) values ($1, $2, $3) on conflict (gx, gy) do update set group_id = excluded.group_id`, [g[0].id, gx, gy]).catch((e) => { if (!/type json/.test(String(e))) console.log('place member:', String(e).slice(0, 300)); });
  }
  // what plots have been made into, all around: one of every kind (and an Estate and a Domain), and my plot an arcade
  const placeAt = async (cells, kind) => {
    for (const [gx, gy] of cells) await sql(`insert into world_plots (gx, gy, owner_id, claimed_at, rarity, plot_type) values ($1, $2, $3, now(), 'rare', 'graphite')
      on conflict (gx, gy) do update set owner_id = excluded.owner_id, claimed_at = now()`, [gx, gy, ned]).catch((e) => console.log('place plot:', String(e).slice(0, 160)));
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    // (the group is made as plain land and given its kind once its plots are in: the Estate bookkeeping isn't what's tested)
    const g = (await sql(`insert into canvas_groups (owner_id, name, kind, plot_count, min_gx, min_gy, max_gx, max_gy) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ned, `Ned's ${kind}`, 'canvas', cells.length, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]).catch((e) => { console.log('place group:', kind, String(e).slice(0, 160)); return []; }))[0]?.id;
    if (g) for (const [gx, gy] of cells) await sql(`insert into canvas_group_members (group_id, gx, gy) values ('${g}'::uuid, ${gx | 0}, ${gy | 0}) on conflict (gx, gy) do update set group_id = excluded.group_id`).catch((e) => { if (!/type json/.test(String(e))) console.log('place member:', String(e).slice(0, 300)); });
    if (g) await sql(`update canvas_groups set kind = $2 where id = $1`, [g, kind]).catch((e) => console.log('place kind:', kind, String(e).slice(0, 160)));
  };
  const one = (dx, dy) => [[START.gx + dx, START.gy + dy]];
  const sq2 = (dx, dy, n) => { const out = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([START.gx + dx + i, START.gy + dy + j]); return out; };
  for (const [cells, kind] of [
    [one(6, -4), 'farm'], [one(-2, 4), 'business'], [one(1, 5), 'habitat'], [one(-6, -2), 'home'], [one(9, 2), 'mine'], [one(-5, 6), 'sky'],
    [one(4, 7), 'diner'], [one(-9, -5), 'dungeon'], [one(7, -8), 'workshop'], [one(-2, -9), 'brawl'], [one(11, -3), 'train'], [one(-11, 3), 'landlord'],
    [sq2(12, 6, 2), 'boardwalk'], [sq2(-15, -3, 3), 'kingdom'], [sq2(3, 11, 2), 'exchange'],
  ]) await placeAt(cells, kind);
  const myGroup = (await sql(`select group_id from canvas_group_members where gx = $1 and gy = $2`, [mine.gx, mine.gy]))[0]?.group_id;
  const madeArcade = myGroup ? await as(me, 'set_group_kind', { p_group_id: myGroup, p_kind: 'arcade' }).catch((e) => ({ err: String(e).slice(0, 160) })) : null;
  if (madeArcade?.err) console.log('my arcade:', madeArcade.err);
  const prim = { gx: START.gx + 900, gy: START.gy - 1400 }; // ~12 km NNE
  await sql(`insert into world_plots (gx, gy, owner_id, claimed_at, rarity, plot_type) values ($1, $2, $3, now(), 'heart_world', 'graphite')
             on conflict (gx, gy) do update set owner_id = excluded.owner_id, claimed_at = now(), rarity = 'heart_world'`, [prim.gx, prim.gy, ned]).catch((e) => console.log('primordial insert:', String(e).slice(0, 200)));
  // the Leviathan, walking 3 km west of here
  await sql(`insert into admin_roles (player_id, role) values ('${me}', 'owner') on conflict do nothing`);
  const s0 = await as(me, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } }).catch((e) => ({ err: String(e) }));
  const levId = (await sql(`select id from leviathans where status in ('warning','walking','enraged') order by spawned_at desc limit 1`))[0]?.id;
  if (levId) {
    const path = [[HERE.lng - 0.036, HERE.lat + 0.004], [HERE.lng - 0.03, HERE.lat], [HERE.lng - 0.5, HERE.lat - 0.2]];
    await sql(`update leviathans set status = 'walking', path = $2::jsonb, path_km = 60, walk_s = 0, walk_at = now(), rise_at = now() - interval '1 minute', pause_until = null, hidden_until = null, tiny_until = null, speed_kmh = 4, data = data - 'hunt' where id = $1`, [levId, JSON.stringify(path)]);
  }
  check('set-up: a Leviathan out there', !!levId, JSON.stringify(s0).slice(0, 120));
  // (its "it has risen" moment was seen already)
  await page.evaluate((id) => localStorage.setItem('landvas.leviathan.seen', JSON.stringify({ [id]: 'risen' })), levId);

  // ---- the way in ------------------------------------------------------------------------------------------------
  await nav('/world'); await page.waitForTimeout(3500);
  for (let i = 0; i < 3 && (await page.locator('[data-state=open][aria-hidden=true]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  const btn = app ? '[data-testid=map-row] [data-testid=eyes-disc]' : '[data-testid=eyes-rail]';
  check('the map has the 👁️ way in', await waitFor(btn, 15000));
  await shot('00-map');
  await page.click(btn, { timeout: 15000 }).catch(() => page.click(btn, { force: true }));
  check('it opens the first-person view', await waitFor('[data-testid=eyes]', 40000));
  // arriving: the town's name, its country and flag, the time there
  const arrived = await waitFor('[data-testid=eyes-arrival]', 15000);
  const arrText = arrived ? await page.locator('[data-testid=eyes-arrival]').textContent().catch(() => '') : '';
  check('arriving: the town you’re in, its country and the time there', /Eyesville/.test(arrText) && /United States/.test(arrText) && /\d:\d\d/.test(arrText), arrText.replace(/\s+/g, ' '));
  await shot('00b-arrival');
  await page.waitForSelector('[data-testid=eyes-loading]', { state: 'detached', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  // the middle of the day, looking along the street
  await eyes('setClock', at(12));
  await eyes('lookAt', Math.PI / 2, 0.02);
  await page.waitForTimeout(1500);
  let d = await eyes('debug');
  check('the ground: real streets painted at your feet', d?.ground === true && tilesServed > 0, `${tilesServed} tiles`);
  check('…buildings stand at their real heights', d?.buildings > 500, `${d?.buildings} triangles`);
  check('…trees in the parks and woods', d?.trees > 10, `${d?.trees}`);
  check('…and the land rolls out to the horizon from real elevation', d?.terrain === true && demServed > 0, `${demServed} elevation tiles`);
  check('the plots around you, glowing by rarity (and yours floats its card)', d?.plots >= 4 && d?.edges > 8 && d?.cards >= 1, JSON.stringify({ plots: d?.plots, edges: d?.edges, cards: d?.cards, beams: d?.beams }));
  const png = decode(await page.screenshot({ timeout: 45000 }));
  const pixels = (() => {
    let lit = 0; const colours = new Set(); const ch = png.channels;
    for (let i = 0; i < png.data.length; i += ch * 37) { const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]; if (r + g + b > 60) lit++; colours.add(`${r >> 4}${g >> 4}${b >> 4}`); }
    return { lit, colours: colours.size };
  })();
  check('it draws (a lit, colourful frame)', pixels.lit > 20000 && pixels.colours > 40, JSON.stringify(pixels));
  await shot('01-street-day');
  await page.click('[data-testid=eyes-hint-ok]').catch(() => {});
  // ---- your explorer: hands, body, the ride ---------------------------------------------------------------------------
  await sql(`insert into vehicles_owned (player_id, kind) select $1, k from unnest(array['bike','car','jet']) k on conflict do nothing`, [me]).catch((e) => console.log('vehicles:', String(e).slice(0, 120)));
  const refresh = async () => { const st = await api('myExplorer'); if (st) await page.evaluate((s) => window.__landvasExplorer.getState().set(s), st); await page.waitForTimeout(600); };
  await refresh();
  check('what you ride is right there in the view (and the garage)', await waitFor('[data-testid=eyes] [data-testid=vehicle-bar]', 8000));
  await eyes('lookAt', Math.PI / 2, -0.05); await page.waitForTimeout(800); await shot('01b-hands');
  await eyes('lookAt', Math.PI / 2, -1.3); await page.waitForTimeout(800); await shot('01c-look-down');
  for (const v of ['bike', 'car', 'jet']) {
    if (await page.locator(`[data-testid=eyes] [data-testid=vehicle-${v}]`).count()) await page.click(`[data-testid=eyes] [data-testid=vehicle-${v}]`);
    await page.waitForTimeout(1500);
    await eyes('lookAt', Math.PI / 2, v === 'jet' ? -0.05 : 0.02); await page.waitForTimeout(700);
    check(`ride the ${v}: you're in its seat`, (await eyes('debug'))?.veh === v);
    await shot(`02-${v}`);
  }
  // the jetpack: hold ▲ to rise over the rooftops
  check('the jetpack has its own up and down', await waitFor('[data-testid=eyes-rise]', 4000));
  const rb = await page.locator('[data-testid=eyes-rise]').boundingBox();
  if (rb) { await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await page.mouse.down(); await page.waitForTimeout(2200); await page.mouse.up(); }
  await page.waitForTimeout(600);
  check('up on a jetpack the eyes rise above the rooftops', (await eyes('debug'))?.pos?.[1] > 30, `${Math.round((await eyes('debug'))?.pos?.[1])} m`);
  await eyes('lookAt', Math.PI / 2, -0.02); await page.waitForTimeout(1200); await shot('02-mountains-east');
  await eyes('lookAt', Math.PI * 1.5, -0.05); await page.waitForTimeout(900); await shot('02b-jetpack-west');
  // a drone's view of the streets below: markings, crossings, parked cars, lamps, trees, roofs
  for (const [k, yaw] of [['n', 0], ['s', Math.PI]]) { await eyes('lookAt', yaw, -0.7); await page.waitForTimeout(1500); await shot(`02d-streets-below-${k}`); }
  if (process.env.EYES_LAYERS) {
    for (const layer of ['ground', 'grid', 'plots', 'nature', 'street', 'buildings', 'body', 'shadows']) {
      await page.evaluate((l) => window.__landvasEyes.debugShow(l, false), layer); await page.waitForTimeout(700); await shot(`02x-without-${layer}`);
    }
  }
  const closePng = await page.evaluate(() => window.__landvasEyes?.closeCanvas()?.toDataURL('image/png') ?? null);
  if (closePng) fs.writeFileSync(path.join(OUT, '02e-close-ground.png'), Buffer.from(closePng.split(',')[1], 'base64'));
  // driving on a low tank (the car runs on it): refill it right here
  await page.click('[data-testid=eyes] [data-testid=vehicle-car]').catch(() => {});
  await page.waitForTimeout(1200);
  await sql(`update explorers set joy_seconds = 2, joy_day = now() where player_id = $1`, [me]);
  await refresh();
  check('a low tank offers a refill in the view', await waitFor('[data-testid=eyes] [data-testid=joystick-refills]', 6000));
  await shot('02c-refill');
  if (await page.locator('[data-testid=eyes] [data-testid=joystick-refill-ink]').isEnabled().catch(() => false)) {
    await page.click('[data-testid=eyes] [data-testid=joystick-refill-ink]');
    check('…and it refills', await waitFor('text=Tank refilled', 6000));
  } else check('…the Ink refill is on offer', false);
  await page.click('[data-testid=eyes] [data-testid=vehicle-walk]').catch(() => {});
  await page.waitForTimeout(1200);
  // the Primordial's beacon, in its true direction (NNE)
  const pr = await eyes('debug');
  check('a Primordial stands as a beacon on the skyline', pr?.beacons >= 1, `${pr?.beacons}`);
  await eyes('lookAt', 0.5, 0.15); await page.waitForTimeout(800); await shot('03-beacon');
  const bId = `${prim.gx}_${prim.gy}`;
  const bAt = await eyes('screenOf', { beacon: bId });
  if (bAt) {
    await page.mouse.click(bAt.x, bAt.y); await page.waitForTimeout(600);
    check('tap the beacon: what it is and how far', (await page.locator('[data-testid=eyes-card-title]').textContent().catch(() => '')).includes('Heart of the World'));
    await shot('04-beacon-card');
    await page.locator('[data-testid=eyes-card] button[aria-label=Close]').click().catch(() => {});
  } else check('the beacon is in view when you face it', false);

  // ---- the Leviathan -------------------------------------------------------------------------------------------------
  await page.click('[data-testid=eyes-face-lev]').catch(() => {});
  await page.waitForTimeout(1400);
  d = await eyes('debug');
  if (!d?.lev) console.log('leviathan now', JSON.stringify(await sql(`select status, path_km, walk_s, data->'hunt' hunt, pause_until, hidden_until, tiny_until, rise_at from leviathans order by spawned_at desc limit 1`)));
  check('the Leviathan is out there, colossal on the skyline', !!d?.lev && d.lev.dist > 1500 && d.lev.dist < 5000, JSON.stringify(d?.lev));
  await shot('05-leviathan');
  const lAt = await eyes('screenOf', { lev: true });
  const hits0 = Number((await sql(`select coalesce(sum(hits), 0) n from leviathan_players where player_id = $1`, [me]))[0].n);
  if (lAt) {
    for (let i = 0; i < 3; i++) { await page.mouse.click(lAt.x, lAt.y); await page.waitForTimeout(250); }
    await page.waitForTimeout(600); await shot('06-bombs-flying');
    await page.waitForTimeout(2500);
  }
  const hits1 = Number((await sql(`select coalesce(sum(hits), 0) n from leviathan_players where player_id = $1`, [me]))[0].n);
  check('tap it: ink bombs fly and really hit it', !!lAt && hits1 > hits0, `${hits0} → ${hits1}`);

  // ---- a sky treasure ----------------------------------------------------------------------------------------------
  const sky = await api('eyesSky');
  check('the sky has treasures for you', sky?.enabled === true && (sky.drops ?? []).length >= 1, JSON.stringify(sky).slice(0, 160));
  await page.waitForTimeout(1500);
  const drop = sky?.drops?.[0] ? `${sky.win}:${sky.drops[0].i}` : null;
  let dAt = null;
  if (drop) {
    // turn until it's in view (it floats somewhere around you)
    const clear = (a) => a && a.y > 250 && a.y < 640 && a.x > 70 && a.x < 340 ? a : null;
    // face it (it drifts: aim again until it's in the clear middle of the screen)
    for (let k = 0; k < 12 && !dAt; k++) {
      const at = ((await eyes('debug'))?.dropsAt ?? []).find((x) => x.id.startsWith(`${drop}:`));
      if (!at) { await page.waitForTimeout(500); continue; }
      await eyes('lookAt', at.yaw, at.pitch); await page.waitForTimeout(200);
      dAt = at.visible ? clear(await eyes('screenOf', { drop })) : null;
      if (!dAt) await page.waitForTimeout(400);
    }
  }
  if (dAt) {
    await shot('07-treasure');
    // (it drifts: where is it now, after the picture)
    const now2 = await eyes('screenOf', { drop });
    if (now2) dAt = now2;
    await page.mouse.click(dAt.x, dAt.y); await page.waitForTimeout(1800);
    // (the catch goes to the server: give it a moment on a busy test machine)
    let n = 0;
    for (let k = 0; k < 16 && !n; k++) { n = Number((await sql(`select count(*) n from eyes_catches where player_id = $1`, [me]))[0].n); if (!n) await page.waitForTimeout(500); }
    await page.waitForTimeout(600);
    check('tap it: caught (and the count goes up)', n === 1 && (await page.locator('[data-testid=eyes-treasures]').textContent()).includes('1/'), `${n} caught`);
    await shot('08-caught');
  } else check('a treasure floats in view somewhere around you', false);

  // ---- night: the stars --------------------------------------------------------------------------------------------
  await eyes('setClock', at(23));
  await page.waitForTimeout(4500);
  await eyes('lookAt', 0, 0.75); await page.waitForTimeout(1200);
  const sk = await eyes('sky');
  check('at night the sky goes dark', sk?.day < 0.1, JSON.stringify(sk));
  await shot('09-night-north');
  // tap the Pole Star (north, at your latitude)
  await eyes('lookAt', 0, (HERE.lat * Math.PI) / 180); await page.waitForTimeout(900);
  const box = await page.locator('[data-testid=eyes-canvas]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(700);
  const starName = await page.locator('[data-testid=eyes-card-title]').textContent().catch(() => '');
  check('tap a star: it says which one (the Pole Star, due north)', /Polaris|Kochab|Dubhe|Merak/.test(starName ?? ''), starName);
  await shot('10-polaris');
  await eyes('lookAt', 3.3, 0.05); await page.waitForTimeout(800); await shot('11-night-street');
  await eyes('setClock', at(12)); await page.waitForTimeout(4500);

  // ---- the ground: tap a plot, walk ------------------------------------------------------------------------------------
  await page.locator('[data-testid=eyes-card] button[aria-label=Close]').click().catch(() => {});
  const look = await eyes('look');
  void look;
  // look down at your own plot and tap it
  // (somewhere in the middle of the screen, clear of the buttons)
  const cellAt = await (async () => { for (const pitch of [-0.12, -0.25, -0.4]) for (let k = 0; k < 24; k++) { await eyes('lookAt', (k / 24) * Math.PI * 2, pitch); await page.waitForTimeout(120); const a = await eyes('screenOf', { cell: [mine.gx, mine.gy] }); if (a && a.y > 250 && a.y < 640 && a.x > 70 && a.x < 340) return a; } return null; })();
  if (cellAt) {
    console.log('cell at', JSON.stringify(cellAt), JSON.stringify(await eyes('look')));
    await page.mouse.click(cellAt.x, cellAt.y); await page.waitForTimeout(1500);
    console.log('after', JSON.stringify(await eyes('look')), JSON.stringify(await page.evaluate(() => window.__landvasUi.getState().selected)));
    check('tap the ground: that plot’s panel opens', (await page.locator('aside').count()) > 0);
    await shot('12-plot-panel');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.evaluate(() => window.__landvasUi.getState().select(null)); await page.waitForTimeout(600);
  } else check('your plot is in view when you look down at it', false);

  // ---- buy a plot in first person: the sheet comes up from below, and the roll plays out right there in the world ------
  {
    const buy = { gx: mine.gx - 2, gy: mine.gy + 1 };
    await sql(`delete from world_plots where gx = $1 and gy = $2`, [buy.gx, buy.gy]).catch(() => {});
    await refresh(); await page.waitForTimeout(1200);
    const bAt = await (async () => { for (const pitch of [-0.12, -0.25, -0.4]) for (let k = 0; k < 24; k++) { await eyes('lookAt', (k / 24) * Math.PI * 2, pitch); await page.waitForTimeout(120); const a = await eyes('screenOf', { cell: [buy.gx, buy.gy] }); if (a && a.y > 250 && a.y < 640 && a.x > 70 && a.x < 340) return a; } return null; })();
    if (bAt) {
      await page.mouse.click(bAt.x, bAt.y); await page.waitForTimeout(1500);
      if (await page.locator('[data-testid=buy-as-canvas]').count()) await page.click('[data-testid=buy-as-canvas]').catch(() => {});
      await shot('12b-buy-sheet');
      await page.click('[data-testid=claim-plot]', { timeout: 8000 }).catch((e) => console.log('claim:', String(e).slice(0, 160)));
      const rolled = await page.waitForSelector('[data-testid=claim-celebration]', { timeout: 15000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(600);
      const mid = await eyes('debug');
      const worldShown = await page.evaluate(() => document.getElementById('root')?.style.visibility !== 'hidden');
      check('buy a plot in first person: it rolls right there in the world', rolled && !!mid?.roll && worldShown, JSON.stringify({ rolled, roll: mid?.roll, worldShown }));
      await shot('12c-roll-drop');
      await page.waitForTimeout(1300); await shot('12d-roll-spin');
      await page.waitForFunction(() => /Incredible|solid start|Nice/.test(document.querySelector('[data-testid=claim-celebration]')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(400);
      const end = await eyes('debug');
      check('…and lands, its beam shooting into the sky', end?.roll?.reveal === true, JSON.stringify(end?.roll));
      await shot('12e-roll-landed');
      await page.keyboard.press('Escape'); await page.waitForTimeout(900);
      await page.evaluate(() => window.__landvasUi.getState().select(null)); await page.waitForTimeout(400);
    } else check('a free plot is in view to buy', false);
  }
  // ---- the Grimoire: pull it out, summon an enchantment into the world before you, use its powers right there ----------
  {
    const given = await as(me, 'admin_give_enchantment', { p_player: me, p_kind: 'goose', p_reason: 'eyes test', p_near_gx: mine.gx, p_near_gy: mine.gy }).catch((e) => ({ err: String(e).slice(0, 200) }));
    if (given?.err) console.log('give enchantment:', given.err);
    await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['enchantments'] }));
    await eyes('lookAt', 0.4, -0.05); await page.waitForTimeout(500);
    await page.click('[data-testid=eyes-grimoire-btn]');
    const opened = await waitFor('[data-testid=eyes-grimoire-item]', 12000);
    await page.waitForTimeout(1000); await shot('20-grimoire-open');
    check('pull out your Grimoire: your enchantments, in the book in your hands', opened);
    await page.click('[data-testid=eyes-grimoire-summon]').catch(() => {});
    await page.waitForTimeout(1800);
    const dm = await eyes('debug');
    check('…summon one: it stands in the world in front of you', !!dm?.manifest && await waitFor('[data-testid=eyes-summoned]', 5000), JSON.stringify(dm?.manifest));
    await shot('20b-summoned');
    await page.click('[data-testid=eyes-summoned-use]').catch(() => {});
    check('…its powers open right over the view', await waitFor('[data-testid=eyes-enchant-sheet] [data-testid=ench-header]', 12000));
    await page.waitForTimeout(800); await shot('20c-its-powers');
    const polish = page.locator('[data-testid=eyes-enchant-sheet] [data-testid=goose-polish]');
    if (await polish.count()) { await polish.scrollIntoViewIfNeeded().catch(() => {}); await polish.click().catch(() => {}); await page.waitForTimeout(1500); }
    // (it flares once the power's been used: the server answers first)
    let df = await eyes('debug');
    for (let k = 0; k < 12 && !df?.manifest?.flared; k++) { await page.waitForTimeout(500); df = await eyes('debug'); }
    check('…use it: the one in the world flares', !!df?.manifest?.flared, JSON.stringify(df?.manifest));
    await page.click('[data-testid=eyes-enchant-sheet-close]').catch(() => {}); await page.waitForTimeout(700);
    await shot('20d-flared');
    await page.click('[data-testid=eyes-summoned-dismiss]').catch((e) => console.log('dismiss:', String(e).slice(0, 160)));
    let back = null;
    for (let k = 0; k < 10; k++) { back = (await eyes('debug'))?.manifest; if (!back || back.gone) break; await page.waitForTimeout(500); }
    check('…and send it back', !back || back.gone === true, JSON.stringify(back));
  }
  // walk: face east and hold W
  await eyes('lookAt', Math.PI / 2, 0);
  const p0 = await page.evaluate(() => window.__landvasExplorer.getState().state);
  // (a software-rendered test browser draws few frames a second: keep walking until the steps come, up to 9 s)
  await page.keyboard.down('w'); await page.waitForTimeout(3200);
  for (let k = 0; k < 12 && ((await eyes('debug'))?.steps ?? 0) <= 2; k++) await page.waitForTimeout(500);
  await page.keyboard.up('w'); await page.waitForTimeout(1200);
  const p1 = await page.evaluate(() => window.__landvasExplorer.getState().state);
  check('walk with W: forward is where you look (east)', p1.lng > p0.lng && Math.abs(p1.lat - p0.lat) < Math.abs(p1.lng - p0.lng), `${(p1.lng - p0.lng).toFixed(6)} east, ${(p1.lat - p0.lat).toFixed(6)} north`);
  const dw = await eyes('debug');
  check('it feels like walking: steps (and their sound) as you go', dw?.steps > 2, `${dw?.steps} steps`);
  console.log('frame', JSON.stringify({ calls: dw?.calls, tris: dw?.tris, ms: dw?.frameMs, dpr: dw?.dpr, trees: dw?.trees, grass: dw?.grass, street: dw?.street, close: dw?.close }));
  await shot('13-walked');

  // ---- driving on: the next stretch of town is made ahead of you (off the main thread) and takes over between two
  // frames, with nothing standing built again ------------------------------------------------------------------------
  {
    const nudge = (m) => page.evaluate((m) => { const ex = window.__landvasExplorer; const s = ex.getState().state; const dl = m / (111320 * Math.cos((s.lat * Math.PI) / 180)); const at = { lng: s.lng + dl, lat: s.lat }; ex.getState().set({ ...s, ...at, origin: at, dest: null, speed_mps: null }); }, m);
    const d0 = await eyes('debug');
    const r0 = d0?.rebases ?? 0, remade0 = d0?.builds?.remade ?? 0;
    for (let k = 0; k < 9; k++) { await nudge(50); await page.waitForTimeout(600); }
    let d1 = await eyes('debug');
    for (let k = 0; k < 40 && (d1?.rebases ?? 0) <= r0; k++) { await page.waitForTimeout(500); d1 = await eyes('debug'); }
    check('driving on: the next stretch is made ahead of you and takes over (the view’s origin moves along)', (d1?.rebases ?? 0) > r0, JSON.stringify({ rebases: d1?.rebases, origin: d1?.origin, pos: d1?.pos }));
    check('…nothing standing is built again', (d1?.builds?.remade ?? 0) === remade0, JSON.stringify(d1?.builds));
    check('…the sharpest ground is kept, not painted again from nothing', (d1?.close?.painted ?? 0) >= 32, JSON.stringify(d1?.close));
    check('…and you’re near the middle of the new stretch', Math.hypot(d1?.pos?.[0] ?? 1e9, d1?.pos?.[2] ?? 1e9) < 300, JSON.stringify(d1?.pos));
    await page.waitForTimeout(800); await eyes('lookAt', Math.PI / 2, -0.05); await page.waitForTimeout(1200); await shot('13b-drove-on');
    // and back again
    for (let k = 0; k < 9; k++) { await nudge(-50); await page.waitForTimeout(400); }
    let d2 = await eyes('debug');
    for (let k = 0; k < 40 && (d2?.rebases ?? 0) <= (d1?.rebases ?? 0); k++) { await page.waitForTimeout(500); d2 = await eyes('debug'); }
    check('…and back: it moves along again', (d2?.rebases ?? 0) > (d1?.rebases ?? 0), JSON.stringify({ rebases: d2?.rebases, origin: d2?.origin }));
  }

  // ---- (E2E_PROFILE=1) driving through town in first person: every long frame, and what the main thread spent it on --
  if (process.env.E2E_PROFILE) {
    await sql(`update explorers set lng = $2, lat = $3, dest_lng = null, dest_lat = null, speed_mps = null, fixed_at = now(), vehicle = 'walk' where player_id = $1`, [me, HERE.lng, HERE.lat]);
    await refresh(); await page.waitForTimeout(4000);
    await page.click('[data-testid=eyes] [data-testid=vehicle-car]').catch(() => {});
    await page.waitForTimeout(3000);
    await eyes('lookAt', Math.PI / 2, -0.02);
    await page.evaluate(() => {
      const w = window; w.__frames = []; let last = performance.now();
      const loop = (t) => { w.__frames.push(t - last); last = t; if (!w.__stopFrames) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      w.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false }); } catch { /* */ }
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
    await page.keyboard.down('w'); await page.waitForTimeout(Number(process.env.E2E_PROFILE) > 1 ? Number(process.env.E2E_PROFILE) * 1000 : 15000); await page.keyboard.up('w');
    const { profile } = await cdp.send('Profiler.stop');
    const fr = await page.evaluate(() => { window.__stopFrames = true; const f = window.__frames.slice(5); return { n: f.length, over34: f.filter((x) => x > 34).length, over50: f.filter((x) => x > 50).length, over100: f.filter((x) => x > 100).length, max: Math.round(Math.max(...f)), avg: Math.round(f.reduce((a, b) => a + b, 0) / f.length), long: window.__long }; });
    console.log('frames', JSON.stringify(fr));
    const dbgP = await eyes('debug');
    console.log('debug', JSON.stringify({ calls: dbgP?.calls, tris: dbgP?.tris, ms: dbgP?.frameMs, dpr: dbgP?.dpr }));
    // self time by function
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    profile.samples.forEach((id, i) => { const n = byId.get(id); const dt = profile.timeDeltas[i] || 0; const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt); });
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    console.log('self time (ms), top 40 of', Math.round(total / 1000));
    for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(Math.round(v / 1000)).padStart(7), k);
    // inclusive time by function (what each one calls, too)
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const incl = new Map();
    profile.samples.forEach((id, i) => { const dt = profile.timeDeltas[i] || 0; const seen = new Set(); let cur = id; while (cur != null) { const n = byId.get(cur); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; if (!seen.has(k)) { incl.set(k, (incl.get(k) || 0) + dt); seen.add(k); } cur = parent.get(cur); } });
    console.log('inclusive (ms), top 50');
    for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50)) console.log(String(Math.round(v / 1000)).padStart(7), k);
    await browser.close(); server.close(); process.exit(0);
  }

  // ---- the places plots have been made into, standing on them; walk up to one and go in ---------------------------------
  {
    await sql(`update explorers set lng = $2, lat = $3, dest_lng = null, dest_lat = null, speed_mps = null, fixed_at = now(), vehicle = 'walk' where player_id = $1`, [me, HERE.lng, HERE.lat]);
    await refresh(); await page.waitForTimeout(1500);
    // (the plots reload as you go: give them a moment)
    let b = null;
    for (let k = 0; k < 20; k++) { b = (await eyes('debug'))?.builds; if ((b?.sites ?? 0) >= 12) break; await page.waitForTimeout(500); }
    check('the plots stand as what they’ve been made into (an arcade, a farm, a castle…)', (b?.sites ?? 0) >= 12, JSON.stringify(b));
    for (const [k, yaw] of [['n', 0], ['e', Math.PI / 2], ['s', Math.PI], ['w', Math.PI * 1.5]]) { await eyes('lookAt', yaw, 0.02); await page.waitForTimeout(1300); await shot(`16-places-${k}`); }
    // walk up to the farm (6 east, 4 north): stand just south of it, facing north
    const farm = ll(START.gx + 6, START.gy - 3);
    await sql(`update explorers set lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, farm.lng, farm.lat + 0.000002]);
    await refresh(); await eyes('lookAt', 0, -0.05); await page.waitForTimeout(1600);
    check('walk up to a place: a way in appears', await waitFor('[data-testid=eyes-enter]', 6000));
    await shot('16b-farm-up-close');
    const label = await page.locator('[data-testid=eyes-enter]').innerText().catch(() => '');
    check('…and it says what it is', /farm/i.test(label), label.replace(/\s+/g, ' '));
    // look away: it goes
    await eyes('lookAt', Math.PI, -0.05); await page.waitForTimeout(1200);
    const gone = await page.waitForFunction(() => !document.querySelector('[data-testid=eyes-enter]'), null, { timeout: 5000 }).then(() => true).catch(() => false);
    check('…facing away, it goes', gone);
    // the castle up close
    const castle = ll(START.gx - 14, START.gy + 1);
    await sql(`update explorers set lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, castle.lng, castle.lat]);
    await refresh(); await eyes('lookAt', 0, 0.12); await page.waitForTimeout(1800);
    await shot('16c-castle');
    // the carnival (a turning Ferris wheel)
    const carn = ll(START.gx + 12, START.gy + 9);
    await sql(`update explorers set lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, carn.lng, carn.lat]);
    await refresh(); await eyes('lookAt', 0, 0.15); await page.waitForTimeout(1800);
    await shot('16d-carnival');
  }

  // ---- the ultras stand as monuments; every plot type carries its piece --------------------------------------------------
  {
    await sql(`update explorers set lng = $2, lat = $3, dest_lng = null, dest_lat = null, speed_mps = null, fixed_at = now(), vehicle = 'walk' where player_id = $1`, [me, HERE.lng, HERE.lat]);
    await refresh(); await page.waitForTimeout(1500);
    let d = null;
    for (let k = 0; k < 20; k++) { d = await eyes('debug'); if ((d?.places ?? []).filter((x) => String(x.key).startsWith('m:')).length >= 3 && !(d?.builds?.waiting)) break; await page.waitForTimeout(500); }
    const mons = (d?.places ?? []).filter((x) => String(x.key).startsWith('m:'));
    check('the ultras near you stand as monuments (a volcano, a kraken, a crown, a singularity…)', mons.length >= 3, JSON.stringify(mons.map((x) => x.kind)));
    check('…and the plots near you carry a piece of their type', (d?.accents ?? 0) >= 8, `${d?.accents} pieces`);
    for (const [name, dx, dy] of [['volcano', 2, -2], ['kraken', -2, 2], ['singularity', -4, -3]]) {
      const c = ll(START.gx + dx, START.gy + dy);
      const from = ll(START.gx + dx, START.gy + dy + 3);
      await sql(`update explorers set lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, from.lng, from.lat]);
      await refresh(); await page.waitForTimeout(900);
      await eyes('lookAt', Math.atan2(c.lng - from.lng, (c.lat - from.lat) * 1.3), 0.12); await page.waitForTimeout(1500);
      await shot(`16e-ultra-${name}`);
    }
    // the row of plot types, from one end
    const rowFrom = ll(START.gx - 6, START.gy - 11);
    await sql(`update explorers set lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, rowFrom.lng, rowFrom.lat]);
    await refresh(); await page.waitForTimeout(1200);
    await eyes('lookAt', Math.PI / 2 - 0.2, -0.18); await page.waitForTimeout(1800);
    await shot('16f-plot-types');
  }

  // ---- your party, standing in the view as their own explorers --------------------------------------------------------
  {
    const pia = await someone('eyes_pia');
    await sql(`update profiles set explorer_style = $2::jsonb, accent_color = '#FF3D9A' where id = $1`, [pia, JSON.stringify({ hat: 'crown', hold: 'wand', outfit: 'galaxy', hair: 'long', hairc: 'pink', skin: 'caramel', sex: 'f' })]);
    await sql(`insert into player_activity (player_id, kind, detail, at) values ($1, 'map', '{}', now() + interval '10 minutes') on conflict (player_id) do update set at = excluded.at`, [pia]);
    await sql(`insert into player_activity (player_id, kind, detail, at) values ($1, 'map', '{}', now() + interval '10 minutes') on conflict (player_id) do update set at = excluded.at`, [me]);
    const trip = (await sql(`insert into travel_trips (player_id, mode, arrives_at) values ($1, 'train', now() + interval '2 hours') returning id`, [pia]))[0].id;
    const pAt = { lng: HERE.lng + 0.00006, lat: HERE.lat + 0.00004 }, far = { lng: HERE.lng - 1.2, lat: HERE.lat + 0.8 };
    await sql(`insert into explorers (player_id, mode, lng, lat, gps_lng, gps_lat, gps_at, trip_id, home_lng, home_lat, fixed_at) values ($1, 'travel', $2, $3, $4, $5, now(), $6, $4, $5, now())
               on conflict (player_id) do update set mode = excluded.mode, lng = excluded.lng, lat = excluded.lat, gps_lng = excluded.gps_lng, gps_lat = excluded.gps_lat, trip_id = excluded.trip_id, home_lng = excluded.home_lng, home_lat = excluded.home_lat`,
      [pia, pAt.lng, pAt.lat, far.lng, far.lat, trip]);
    const grp = (await sql(`insert into travel_groups (leader_id, code) values ($1, 'EYESTT') returning id`, [me]))[0].id;
    await sql(`insert into travel_group_members (group_id, player_id) values ($1, $2), ($1, $3) on conflict do nothing`, [grp, me, pia]);
    await sql(`update explorers set lng = $2, lat = $3, dest_lng = null, dest_lat = null, speed_mps = null, fixed_at = now(), vehicle = 'walk' where player_id = $1`, [me, HERE.lng, HERE.lat]);
    await refresh();
    await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(3000);
    let n = 0;
    for (let k = 0; k < 24 && !n; k++) { n = (await eyes('debug'))?.buddies ?? 0; if (!n) await page.waitForTimeout(500); }
    check('your party stands in the view as their own explorers', n >= 1, `${n} in view`);
    await eyes('lookAt', Math.atan2(pAt.lng - HERE.lng, (pAt.lat - HERE.lat) * 1.3), -0.04); await page.waitForTimeout(1800);
    await shot('18-party-pia');
    // she gets on her bike, then up on her jetpack: you see it
    for (const v of ['bike', 'jet']) {
      await sql(`update explorers set vehicle = $2 where player_id = $1`, [pia, v]);
      await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['eyes-buddies'] })); await page.waitForTimeout(2500);
      await eyes('lookAt', Math.atan2(pAt.lng - HERE.lng, (pAt.lat - HERE.lat) * 1.3), v === 'jet' ? 0.5 : -0.04); await page.waitForTimeout(1500);
      await shot(`18b-party-pia-${v}`);
      const tags = (await eyes('debug'))?.buddyTags ?? [];
      check(`…and you see her ${v === 'bike' ? 'riding her bike' : 'up on her jetpack'}`, tags.some((x) => x.includes(v === 'bike' ? 'riding a bike' : 'jetpack')), JSON.stringify(tags));
    }
    // she waves (her emote comes over the group's live channel): it pops up over her head
    await page.evaluate((id) => window.__landvasGroupLive.setState({ emotes: { [id]: { e: 'wave', at: Date.now() } } }), pia);
    await page.waitForTimeout(700);
    const em = (await eyes('debug'))?.emotes ?? 0;
    await shot('18c-party-pia-waves');
    check('…and when she waves, it pops up over her head', em >= 1, `${em}`);
    check('invite people right from the view', await waitFor('[data-testid=eyes-party]', 3000));
  }

  // ---- out on GPS for real: players near you who turned on "Meet nearby" pop up — a name and a rough distance, never a spot
  {
    const pia = (await sql(`select id from profiles where username = 'eyes_pia'`))[0]?.id;
    const mode0 = (await sql(`select mode from explorers where player_id = $1`, [me]))[0]?.mode;
    await sql(`update explorers set mode = 'gps', lng = $2, lat = $3, gps_lng = $2, gps_lat = $3, gps_at = now(), dest_lng = null, dest_lat = null, speed_mps = null where player_id = $1`, [me, HERE.lng, HERE.lat]);
    await sql(`update explorers set mode = 'gps', lng = $2, lat = $3, gps_lng = $2, gps_lat = $3, gps_at = now(), trip_id = null where player_id = $1`, [pia, HERE.lng + 0.0035, HERE.lat]);
    await as(pia, 'meet_set', { p_enabled: true, p_adult: true });
    await page.evaluate(() => window.__landvasExplorer.setState({ gps: 'on' }));
    const chip = await waitFor('[data-testid=meet-chip]', 8000);
    check('out on GPS: “Meet players nearby” is right there', chip);
    await page.click('[data-testid=meet-chip]').catch(() => {});
    await waitFor('[data-testid=meet-adult]', 5000);
    await shot('21-meet-off');
    await page.check('[data-testid=meet-adult]').catch(() => {});
    await page.click('[data-testid=meet-on]').catch(() => {});
    const seen = await waitFor('[data-testid=meet-panel] [data-testid=meet-gps]', 15000);
    const row = seen ? await page.locator('[data-testid=meet-panel] [data-testid=meet-gps]').first().textContent() : '';
    check('…turn it on (18+): a player out on GPS near you shows — on GPS, roughly how far', /eyes_pia/.test(row) && /on GPS/.test(row) && /short walk/.test(row), row.replace(/\s+/g, ' '));
    await shot('21b-meet-nearby');
    await page.click('[data-testid=meet-panel] [data-testid=meet-wave]').catch(() => {});
    await page.waitForTimeout(1200);
    const wv = await sql(`select count(*) n from player_notifications where player_id = $1 and kind = 'meet_wave'`, [pia]);
    check('…and wave: they get it in their notifications', Number(wv[0].n) === 1);
    await page.click('[data-testid=meet-close]').catch(() => {}); await page.waitForTimeout(500);
    await page.evaluate(() => window.__landvasExplorer.setState({ gps: 'off' }));
    await sql(`update explorers set mode = $2 where player_id = $1`, [me, mode0 ?? 'manual']);
  }

  // ---- Inkborn in the world: the creatures living in a habitat roam its glade; tap one and it hops for joy ---------------
  {
    const ned2 = (await sql(`select id from profiles where username = 'eyes_ned'`))[0]?.id;
    // Ned's glade: its habitat, and three creatures living there (made with Ink, as anyone would)
    const g5 = (await sql(`select group_id from canvas_group_members where gx = $1 and gy = $2`, [START.gx + 1, START.gy + 5]))[0]?.group_id;
    const habId = g5 ? (await sql(`insert into habitats (owner_id, group_id, kind) values ($1, $2, 'plot') on conflict (group_id) do update set kind = 'plot' returning id`, [ned2, g5]))[0]?.id : null;
    await sql(`insert into resource_balances (player_id, resource, amount) values ($1, 'ink', 50000) on conflict (player_id, resource) do update set amount = 50000`, [ned2]);
    const gen = (c, b) => ({ body: b, color: c, belly: '#FFF3D6', accent: '#FF7AB8', pattern: 'spots', eyes: 'big', ears: 'bunny', horns: 'none', tail: 'fluffy', wings: 'none', legs: 2, eyecount: 2, gait: 'walk', cheeks: true, size: 1.1, mood: 'playful' });
    for (const [i, [n, c, b]] of [['Pip', '#7BD389', 'round'], ['Mochi', '#FFB4D9', 'bean'], ['Zib', '#8FB8FF', 'tall']].entries()) {
      await as(ned2, 'inkborn_create', { p_client_key: `eyes-${i}-${Date.now()}`, p_name: n, p_source: 'custom', p_genome: gen(c, b), p_drawing: null, p_habitat_id: habId })
        .catch((e) => console.log('inkborn:', String(e).slice(0, 200)));
    }
    console.log('glade:', JSON.stringify({ g5, habId, n: (await sql(`select count(*) n from inkborn where habitat_id = $1`, [habId]))[0]?.n }));
    await sql(`update explorers set lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, ...(() => { const c = ll(START.gx + 1, START.gy + 3); return [c.lng, c.lat]; })()]);
    await refresh(); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__landvasQc.invalidateQueries()); await page.waitForTimeout(500);
    // (the plots reload a moment after you move)
    let crit = 0;
    for (let k = 0; k < 64 && !crit; k++) { crit = (await eyes("debug"))?.critters ?? 0; if (!crit) await page.waitForTimeout(500); }
    check('Inkborn roam their habitat’s glade', crit >= 1, `${crit} in view`);
    const c5 = ll(START.gx + 1, START.gy + 5), c3 = ll(START.gx + 1, START.gy + 3);
    await eyes('lookAt', Math.atan2((c5.lng - c3.lng) * Math.cos((c3.lat * Math.PI) / 180), c5.lat - c3.lat), -0.12); await page.waitForTimeout(2500);
    await shot('23-inkborn-glade');
  }

  // ---- going in: my arcade -------------------------------------------------------------------------------------------
  {
    await sql(`update explorers set lng = $2, lat = $3, dest_lng = null, dest_lat = null, speed_mps = null, fixed_at = now(), vehicle = 'walk' where player_id = $1`, [me, HERE.lng, HERE.lat]);
    await refresh(); await page.waitForTimeout(1500);
    let dp = null;
    for (let k = 0; k < 20; k++) { dp = await eyes('debug'); if ((dp?.places ?? []).some((p) => p.kind === 'arcade')) break; await page.waitForTimeout(500); }
    // stand at my arcade's door, facing it
    const arc = (dp?.places ?? []).find((p) => p.kind === 'arcade');
    const toLngLat = (f, x, z) => { const X = f.X0 + x / f.S, Y = f.Y0 + z / f.S; return { lng: X * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) }; };
    if (arc) {
      const fx = arc.x + Math.sin(arc.rot) * (arc.d / 2 + 2.2), fz = arc.z + Math.cos(arc.rot) * (arc.d / 2 + 2.2);
      const ll2 = toLngLat(dp.frame, fx, fz);
      await sql(`update explorers set lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, ll2.lng, ll2.lat]);
      await refresh(); await page.waitForTimeout(1500);
      await eyes('lookAt', Math.atan2(arc.x - fx, -(arc.z - fz)), -0.05); await page.waitForTimeout(1500);
      check('walk up to a place: the way in appears', await waitFor('[data-testid=eyes-enter]', 5000));
      await shot('17-at-the-door');
      await page.click('[data-testid=eyes-enter]');
      await page.waitForTimeout(1200); await shot('17b-door-opening');
      const went = await page.waitForFunction(() => window.__landvasPath().startsWith('/arcade/'), null, { timeout: 9000 }).then(() => true).catch(() => false);
      check('…and through the door you go, into the place', went && await waitFor('[data-testid=arcade]', 8000), await page.evaluate(() => window.__landvasPath()));
      check('…still in first person, inside — until you leave it', await waitFor('[data-testid=fp-inside]', 6000));
      await page.waitForTimeout(800); await shot('17d-inside-first-person');
      await page.click('[data-testid=fp-leave]').catch(() => {});
      await page.waitForTimeout(800);
      check('…leave first person: you’re in the place’s own view', (await page.locator('[data-testid=fp-inside]').count()) === 0 && await waitFor('[data-testid=arcade]', 3000));
      await page.waitForTimeout(1500); await shot('17c-inside');
      await page.evaluate(() => window.__landvasNav(-1)); await waitFor('[data-testid=eyes]', 8000); await page.waitForTimeout(3000);
    } else check('my arcade stands on my plot', false, JSON.stringify((dp?.places ?? []).map((p) => p.kind)));
  }

  // ---- down on a real street: pavement, kerb, markings, parked cars, lamps, trees, shopfronts ------------------------
  {
    const z = 14, n = 2 ** z;
    const X = ((HERE.lng + 180) / 360) * n, tx = Math.floor(X);
    const r = (HERE.lat * Math.PI) / 180, Y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n, ty = Math.floor(Y);
    // a north–south minor street (an odd line of the town's grid), mid-block
    let k = Math.round(((X - tx) * 4096) / 512); if (k % 2 === 0) k += 1;
    const v = (Math.floor(((Y - ty) * 4096) / 512) + 0.5) * 512;
    const lngOf = (u) => ((tx + u / 4096) / n) * 360 - 180;
    const latOf = (vv) => { const yy = Math.PI * (1 - (2 * (ty + vv / 4096)) / n); return (180 / Math.PI) * Math.atan(Math.sinh(yy)); };
    const metresPerUnit = (40075016.7 * Math.cos(r)) / n / 4096;
    const lng = lngOf(k * 512 + 6.2 / metresPerUnit), lat = latOf(v);
    await sql(`update explorers set lng = $2, lat = $3, dest_lng = null, dest_lat = null, speed_mps = null, fixed_at = now(), vehicle = 'walk' where player_id = $1`, [me, lng, lat]);
    await refresh(); await page.waitForTimeout(2500);
    const ds = await eyes('debug');
    check('down on the street: lamps, parked cars and street trees along it', (ds?.street ?? 0) >= 3 && (ds?.trees ?? 0) > 0, JSON.stringify({ street: ds?.street, trees: ds?.trees, close: ds?.close }));
    await eyes('lookAt', 0, -0.06); await page.waitForTimeout(1800); await shot('15-street-north');
    await eyes('lookAt', Math.PI * 1.5, 0.12); await page.waitForTimeout(1200); await shot('15b-street-across');
    await eyes('lookAt', Math.PI * 1.75, -0.35); await page.waitForTimeout(1200); await shot('15c-street-kerb');
    await eyes('setClock', at(21)); await page.waitForTimeout(4500);
    await eyes('lookAt', 0, -0.03); await page.waitForTimeout(1500); await shot('15d-street-night');
    await eyes('setClock', at(12)); await page.waitForTimeout(4500);
  }

  // ---- off to another city (today's Hot Zone): the arrival says where you are now and the time there; the Hot Zone shows
  {
    const hz = (await api('hotZone'))?.today;
    if (hz) {
      const at2 = ll(hz.gx, hz.gy);
      await sql(`update explorers set lng = $2, lat = $3, dest_lng = null, dest_lat = null, speed_mps = null, fixed_at = now(), vehicle = 'walk' where player_id = $1`, [me, at2.lng, at2.lat]);
      await refresh();
      const again = await page.waitForFunction(() => !!document.querySelector('[data-testid=eyes-arrival]') && !/Eyesville/.test(document.querySelector('[data-testid=eyes-arrival]')?.textContent ?? ''), null, { timeout: 25000 }).then(() => true).catch(() => false);
      const txt = again ? await page.locator('[data-testid=eyes-arrival]').textContent().catch(() => '') : '';
      check('travel somewhere new: it says where you are now, and the time there', again && /\d:\d\d/.test(txt), `${hz.name} (${hz.country}) → ${txt.replace(/\s+/g, ' ')}`);
      check('in the Hot Zone, the view says so', await waitFor('[data-testid=eyes-hot-chip]', 8000));
      await eyes('lookAt', 0.3, 0.02); await page.waitForTimeout(1500); await shot('19-hot-zone-arrival');
      await sql(`update explorers set lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, HERE.lng, HERE.lat]);
      await refresh(); await page.waitForTimeout(2500);
    } else check('a Hot Zone today', false);
  }

  // ---- flying across the world: a window seat on the plane, up at a plane's height, the land rolling by below ----------
  {
    const dest = { lng: HERE.lng + 3.5, lat: HERE.lat + 1.2 };
    const trip = (await sql(`insert into travel_trips (player_id, mode, arrives_at) values ($1, 'plane', now() + interval '40 minutes') returning id`, [me]))[0].id;
    await sql(`update explorers set mode = 'travel', trip_id = $2, lng = $3, lat = $4, home_lng = $3, home_lat = $4, dest_lng = $5, dest_lat = $6, speed_mps = 220, fixed_at = now() where player_id = $1`,
      [me, trip, HERE.lng, HERE.lat, dest.lng, dest.lat]);
    await refresh();
    const seat = await waitFor('[data-testid=eyes-plane]', 12000);
    await page.waitForTimeout(6000);
    await eyes('lookAt', Math.atan2(3.5 * Math.cos((HERE.lat * Math.PI) / 180), 1.2) + 1.2, -0.25); await page.waitForTimeout(2500);
    await shot('24-plane-window');
    check('flying across the world: a window seat, the land below', seat && await waitFor('[data-testid=eyes-trip]', 3000));
    await sql(`update explorers set mode = 'manual', trip_id = null, dest_lng = null, dest_lat = null, speed_mps = null, lng = $2, lat = $3, fixed_at = now() where player_id = $1`, [me, HERE.lng, HERE.lat]);
    await refresh(); await page.waitForTimeout(3000);
  }

  // ---- a picture, and back -------------------------------------------------------------------------------------------
  // (the app's share sheet is the phone's own: here it just takes the picture)
  if (app) await page.evaluate(() => {
    window.__shared = null;
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = { files: d.files?.length ?? 0, type: d.files?.[0]?.type ?? null, size: d.files?.[0]?.size ?? 0 }; } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  });
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('[data-testid=eyes-snap]');
  const shared = app ? await page.waitForFunction(() => window.__shared, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null) : null;
  check('a picture of the view', app ? shared?.files === 1 && shared.type === 'image/jpeg' && shared.size > 5000 : !!(await dl) || (await page.locator('text=Saved your picture').count()) > 0, JSON.stringify(shared));
  // (the "saved your picture" note sits over the back button for a few seconds: let it go first)
  await page.waitForFunction(() => !document.querySelector('[data-sonner-toast]'), null, { timeout: 9000 }).catch(() => {});
  await page.click('[data-testid=eyes-back]'); await page.waitForTimeout(2500);
  check('back to the map', (await page.locator('[data-testid=eyes]').count()) === 0);
  await shot('14-back');

  // ---- to space, in first person: pick a world on the solar system, ride your rocket up from the street, across, and
  // down onto it; step out onto its own map -------------------------------------------------------------------------
  {
    await sql(`insert into space_pilots (player_id, parts, location) values ($1, array['nose','tank','fins','engine'], 'earth')
               on conflict (player_id) do update set parts = excluded.parts, location = 'earth', dest = null, depart_at = null, arrive_at = null`, [me]);
    await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['space'] }));
    await nav('/eyes'); await waitFor('[data-testid=eyes]', 30000); await page.waitForTimeout(2500);
    await page.click('[data-testid=eyes-space-btn]');
    const sys = await waitFor('[data-testid=eyes-space-system] canvas', 20000);
    await page.waitForTimeout(1500); await shot('22-space-where-to');
    check('to space from the street: the whole solar system, pick a world', sys);
    await page.click('[data-testid=eyes-space-pick-mars]');
    await waitFor('[data-testid=world-card]', 8000);
    // (a real trip: launch; if Mars is a free warp for this pilot, it's instant)
    const warp = (await page.locator('[data-testid=world-card] [data-testid=warp]').count()) > 0;
    await page.click(`[data-testid=world-card] [data-testid=${warp ? 'warp' : 'launch'}]`, { timeout: 10000 }).catch((e) => console.log('launch:', String(e).slice(0, 160)));
    const lifted = await page.waitForSelector('[data-testid=eyes-space-status][data-phase=liftoff]', { timeout: 10000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1500); await shot('22b-liftoff');
    check('…liftoff: you ride your rocket up from where you stand', lifted);
    if (!warp) {
      const cruising = await page.waitForSelector('[data-testid=eyes-space-status][data-phase=cruise]', { timeout: 20000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(1200); await shot('22c-cruise');
      check('…out across the solar system, for as long as the real trip takes', cruising, await page.locator('[data-testid=eyes-space-status]').textContent().catch(() => ''));
      // (the trip's time is up)
      await sql(`update space_pilots set arrive_at = now() - interval '1 second', depart_at = now() - interval '5 minutes' where player_id = $1`, [me]);
      await page.evaluate(() => window.__landvasQc.invalidateQueries({ queryKey: ['space'] }));
    }
    const down = await page.waitForSelector('[data-testid=eyes-space-status][data-phase=approach]', { timeout: 30000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1500); await shot('22d-coming-down');
    const landedOk = await page.waitForSelector('[data-testid=eyes-space-out]', { timeout: 30000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(800); await shot('22e-landed');
    check('…and down onto Mars', down && landedOk);
    await page.click('[data-testid=eyes-space-out]').catch(() => {});
    const out = await page.waitForFunction(() => window.__landvasPath() === '/world', null, { timeout: 10000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(2500); await shot('22f-on-mars');
    check('step out: you’re on Mars’ own map', out && (await sql(`select location from space_pilots where player_id = $1`, [me]))[0]?.location === 'mars');
  }
  const dbg = d;
  console.log('debug', JSON.stringify({ calls: dbg?.calls, tris: dbg?.tris, dpr: dbg?.dpr }));
  check('no errors in the page', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.error(e);
  if (errors.length) console.error('page errors:', errors.slice(0, 5).join('\n'));
  check('ran to the end', false, String(e).slice(0, 300));
  await shot('zz-crash');
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n[${MODE}] ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
