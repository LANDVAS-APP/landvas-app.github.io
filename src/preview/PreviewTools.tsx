// Preview build only (vite --mode artifact: the offline game, its whole database in the browser). Never in the live
// game or the apps: App.tsx only mounts this behind `import.meta.env.MODE === 'artifact'`, so it isn't even built there.
// One-tap set-ups so the owner can try a new step straight away: your own Art Estate full of paintings, another
// player's Gallery to visit with a show on, and shortcuts like ending a show now.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getBackend } from '../backend/backend';
import { Button, Dialog } from '../ui';

type Db = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; transaction<T>(f: (tx: Db) => Promise<T>): Promise<T> };
const local = () => getBackend() as unknown as { db: Db; blobs: { put(key: string, bytes: Uint8Array): Promise<void> }; current?: { userId: string } | null; mode: string };
const START = { gx: 12398 * 64 + 32, gy: 24628 * 64 + 32 }; // Salt Lake City

/** call an RPC as another (local) player */
async function as<T>(uid: string, fn: string, args: Record<string, unknown> = {}) {
  const keys = Object.keys(args);
  return local().db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.query('set local role authenticated');
    const r = await tx.query<{ r: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => args[k]));
    return r.rows[0]?.r as T;
  });
}
const sql = <T = Record<string, unknown>,>(q: string, p: unknown[] = []) => local().db.query<T>(q, p).then((r) => r.rows);

// ---- paintings, drawn here in pixel style (low-res, scaled up crisp) ---------------------------------------------------
type Painter = (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void;
const PAINTINGS: { title: string; story: string; paint: Painter }[] = [
  { title: 'Salt Flats at Dusk', story: 'The lake turned to glass for ten minutes after sunset.', paint: (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, '#2B1B4F'); sky.addColorStop(0.55, '#E8607A'); sky.addColorStop(1, '#FFC27A'); g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.6);
    g.fillStyle = '#FFE6A0'; g.beginPath(); g.arc(w * 0.68, h * 0.5, h * 0.09, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3A2A5C'; for (let x = 0; x < w; x++) { const y = h * 0.6 - 6 - Math.abs(Math.sin(x * 0.09)) * 9 - Math.abs(Math.sin(x * 0.023)) * 14; g.fillRect(x, y, 1, h * 0.6 - y); }
    const sea = g.createLinearGradient(0, h * 0.6, 0, h); sea.addColorStop(0, '#F7B07A'); sea.addColorStop(1, '#5A3A7A'); g.fillStyle = sea; g.fillRect(0, h * 0.6, w, h * 0.4);
    g.fillStyle = 'rgba(255,240,200,0.6)'; for (let y = h * 0.62; y < h; y += 3) g.fillRect(w * 0.6 + Math.sin(y) * 4, y, w * 0.16 - (y - h * 0.6) * 0.2, 1);
  } },
  { title: 'Night Shift', story: 'Every lit window is somebody still awake.', paint: (g, w, h, r) => {
    g.fillStyle = '#0D0F26'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; g.fillRect(r() * w, r() * h * 0.45, 1, 1); }
    g.fillStyle = '#F4EBC4'; g.beginPath(); g.arc(w * 0.18, h * 0.2, 6, 0, Math.PI * 2); g.fill();
    let x = 0; while (x < w) { const bw = 6 + Math.floor(r() * 12), bh = h * (0.3 + r() * 0.5); g.fillStyle = ['#1C2048', '#232A5C', '#161A3A'][Math.floor(r() * 3)]; g.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 3; yy < h - 3; yy += 4) for (let xx = x + 2; xx < x + bw - 2; xx += 3) if (r() > 0.55) { g.fillStyle = r() > 0.8 ? '#7FD8FF' : '#FFD36A'; g.fillRect(xx, yy, 1, 2); }
      x += bw + 1; }
  } },
  { title: 'Wasatch Mirror', story: 'Hiked up before dawn for this reflection.', paint: (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.5); sky.addColorStop(0, '#6EC3F0'); sky.addColorStop(1, '#D8F1FF'); g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.5);
    const peaks = (y0: number, c: string, s: number) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, y0); for (let x = 0; x <= w; x += 4) g.lineTo(x, y0 - Math.abs(Math.sin(x * s)) * h * 0.22 - Math.abs(Math.sin(x * s * 2.7)) * h * 0.06); g.lineTo(w, y0); g.closePath(); g.fill(); };
    peaks(h * 0.5, '#5C6F8A', 0.035); peaks(h * 0.5, '#3E5268', 0.05);
    g.fillStyle = '#F4F8FF'; for (let x = 0; x < w; x += 2) { const y = h * 0.5 - Math.abs(Math.sin(x * 0.035)) * h * 0.22; if (y < h * 0.36) g.fillRect(x, y, 2, 3); }
    g.fillStyle = '#2E6B3A'; g.fillRect(0, h * 0.5, w, 4);
    g.save(); g.translate(0, h); g.scale(1, -1); g.globalAlpha = 0.55; g.drawImage(g.canvas, 0, 0, w, h * 0.5, 0, 0, w, h * 0.5); g.restore();
    g.fillStyle = 'rgba(40,90,140,0.35)'; g.fillRect(0, h * 0.5 + 4, w, h * 0.5);
  } },
  { title: 'Loud Shapes', story: 'Painted with the music way too loud.', paint: (g, w, h, r) => {
    g.fillStyle = '#F6EFE0'; g.fillRect(0, 0, w, h);
    const cs = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#1A1A2E'];
    for (let i = 0; i < 14; i++) { g.fillStyle = cs[i % cs.length]; g.globalAlpha = 0.85; const x = r() * w, y = r() * h, s = 6 + r() * 26;
      if (i % 3 === 0) { g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); } else if (i % 3 === 1) g.fillRect(x - s / 2, y - s / 2, s, s * 0.6); else { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y + s); g.lineTo(x - s, y + s); g.fill(); } }
    g.globalAlpha = 1; g.strokeStyle = '#1A1A2E'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h * 0.7); for (let x = 0; x < w; x += 8) g.lineTo(x, h * 0.7 + Math.sin(x * 0.2) * 8); g.stroke();
  } },
  { title: 'Poppy Field', story: 'My grandmother’s garden, as I remember it.', paint: (g, w, h, r) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.45); sky.addColorStop(0, '#8FD3FF'); sky.addColorStop(1, '#FFF4D6'); g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.45);
    g.fillStyle = '#FFFFFF'; for (const [x, y] of [[0.2, 0.15], [0.62, 0.1]]) { g.beginPath(); g.ellipse(w * x, h * y, 12, 5, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#7FB04A'; g.fillRect(0, h * 0.45, w, h * 0.55); g.fillStyle = '#5E9A3A'; for (let i = 0; i < 160; i++) g.fillRect(r() * w, h * 0.45 + r() * h * 0.55, 1, 3);
    for (let i = 0; i < 90; i++) { const y = h * 0.47 + r() * h * 0.53, s = 1 + (y / h) * 3; g.fillStyle = r() > 0.85 ? '#FFE14D' : '#E8303A'; g.beginPath(); g.arc(r() * w, y, s, 0, Math.PI * 2); g.fill(); }
  } },
  { title: 'Koi', story: 'Three fish, one pond, no hurry.', paint: (g, w, h, r) => {
    g.fillStyle = '#123E4A'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(120,200,210,0.25)'; g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 10, 0, Math.PI * 2); g.stroke(); }
    const fish = (x: number, y: number, a: number, c: string) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(-10, 0); g.lineTo(-18, -5); g.lineTo(-18, 5); g.fill(); g.fillStyle = '#fff'; g.fillRect(4, -2, 4, 3); g.restore(); };
    fish(w * 0.3, h * 0.4, 0.4, '#FF7A2E'); fish(w * 0.62, h * 0.62, -2.6, '#FFFFFF'); fish(w * 0.7, h * 0.28, 2.2, '#FFB13D');
    g.fillStyle = '#3DBF5A'; for (const [x, y] of [[0.12, 0.8], [0.85, 0.18], [0.5, 0.88]]) { g.beginPath(); g.arc(w * x, h * y, 9, 0.4, Math.PI * 2); g.lineTo(w * x, h * y); g.fill(); }
  } },
  { title: 'Ink Bloom', story: 'One drop of every colour in the logo.', paint: (g, w, h, r) => {
    g.fillStyle = '#16121F'; g.fillRect(0, 0, w, h);
    ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF'].forEach((c, i) => { const a = (i / 5) * Math.PI * 2; for (let k = 0; k < 60; k++) { const d = r() * h * 0.36; g.fillStyle = c; g.globalAlpha = 0.25 + r() * 0.5; g.beginPath(); g.arc(w / 2 + Math.cos(a + r() * 0.9) * d, h / 2 + Math.sin(a + r() * 0.9) * d, 1 + r() * 3, 0, Math.PI * 2); g.fill(); } });
    g.globalAlpha = 1;
  } },
  { title: 'Lantern Street', story: 'The night market, five minutes before it rained.', paint: (g, w, h, r) => {
    g.fillStyle = '#2A1A2E'; g.fillRect(0, 0, w, h); g.fillStyle = '#3B2A3F'; g.fillRect(0, h * 0.7, w, h * 0.3);
    for (let i = 0; i < 7; i++) { const x = w * (0.08 + i * 0.14), y = h * (0.2 + (i % 2) * 0.08); g.strokeStyle = '#555'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y); g.stroke(); g.fillStyle = ['#FF4D6D', '#FF9F1C', '#FFE14D'][i % 3]; g.beginPath(); g.ellipse(x, y + 6, 6, 8, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,200,120,0.15)'; g.beginPath(); g.arc(x, y + 6, 18, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 12; i++) { g.fillStyle = ['#7FD8FF', '#FFB3C8', '#C8FFB0'][i % 3]; g.fillRect(r() * w, h * 0.62 + r() * h * 0.1, 3, 6); }
  } },
];
async function paintPng(i: number, seed: number, wide = true) {
  const W = wide ? 96 : 72, H = 72, c = document.createElement('canvas'); c.width = W; c.height = H;
  let s = seed >>> 0 || 1; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; PAINTINGS[i % PAINTINGS.length].paint(g, W, H, r);
  const big = document.createElement('canvas'); big.width = W * 4; big.height = H * 4; const bg = big.getContext('2d')!; bg.imageSmoothingEnabled = false; bg.drawImage(c, 0, 0, W * 4, H * 4);
  const thumb = document.createElement('canvas'); thumb.width = 128; thumb.height = 128; const tg = thumb.getContext('2d')!; tg.imageSmoothingEnabled = false; tg.drawImage(c, (W - H) / 2, 0, H, H, 0, 0, 128, 128);
  const blob = (cv: HTMLCanvasElement) => new Promise<Uint8Array>((res) => cv.toBlob((b) => void b!.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/png'));
  return { preview: await blob(big), thumb: await blob(thumb), w: W * 4, h: H * 4 };
}

async function publish(owner: string, group: string, i: number, status: 'published' | 'superseded', seed: number) {
  const img = await paintPng(i, seed, i % 3 !== 2);
  const [pj] = await sql<{ id: string }>(`insert into artwork_projects (owner_id, group_id, title) values ($1, $2, $3) returning id`, [owner, group, PAINTINGS[i].title]);
  const [v] = await sql<{ id: string }>(`insert into artwork_versions (project_id, owner_id, version_no, kind, manifest, cells, layer_count, tile_count) values ($1, $2, 1, 'initial', '{}', '[]', 1, 1) returning id`, [pj.id, owner]);
  const id = crypto.randomUUID();
  await local().blobs.put(`public-art/previews/${id}.png`, img.preview); await local().blobs.put(`public-art/thumbs/${id}.png`, img.thumb);
  await sql(`insert into artwork_publications (id, owner_id, project_id, version_id, group_id, title, cells, plot_count, min_gx, min_gy, max_gx, max_gy, center_lng, center_lat, status,
               rights_affirmed_at, terms_version, preview_path, thumb_path, preview_width, preview_height, published_at, appreciation_count, craft_score)
             values ($1, $2, $3, $4, $5, $6, '[]', 4, 0, 0, 0, 0, -111.89, 40.76, $7, now(), 'preview', $8, $9, $10, $11, now() - make_interval(days => $12::int), $13::int, $14::int)`,
    [id, owner, pj.id, v.id, group, PAINTINGS[i].title, status, `previews/${id}.png`, `thumbs/${id}.png`, img.w, img.h, i, Math.floor(seed % 40), 55 + (seed % 40)]);
  return id;
}

/** a square of plots on the map, merged into one group of `kind`. One transaction, as its owner (like a real merge):
    the Estate check runs at commit and needs the whole square there. */
async function land(owner: string, gx: number, gy: number, kind: string, size = 2) {
  return local().db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
    const { rows: [g] } = await tx.query<{ id: string }>(`insert into canvas_groups (owner_id, name, kind, plot_count, min_gx, min_gy, max_gx, max_gy) values ($1, $2, $3, $4::int, $5::int, $6::int, $7::int, $8::int) returning id`,
      [owner, kind === 'canvas' ? 'Sketchbook' : kind === 'museum' ? 'Preview Museum' : 'Preview Gallery', kind, size * size, gx, gy, gx + size - 1, gy + size - 1]);
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) {
      await tx.query(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1::int, $2::int, 'graphite', 'rare', $3, now())
                      on conflict (gx, gy) do update set owner_id = excluded.owner_id, claimed_at = now()`, [gx + dx, gy + dy, owner]);
      await tx.query(`insert into canvas_group_members (group_id, gx, gy) values ($1, $2::int, $3::int) on conflict (gx, gy) do update set group_id = excluded.group_id`, [g.id, gx + dx, gy + dy]);
    }
    return g.id;
  });
}

async function setUpMine() {
  const me = local().current?.userId; if (!me) throw new Error('Sign in first');
  await sql(`update players set created_at = least(created_at, now() - interval '3 days') where id = $1`, [me]);
  const existing = await sql<{ id: string }>(`select id from canvas_groups where owner_id = $1 and kind = 'atelier' and name = 'Preview Gallery'`, [me]);
  if (existing.length) return existing[0].id;
  const off = Math.floor(Math.random() * 400);
  const gallery = await land(me, START.gx + off, START.gy, 'atelier');
  const studio = await land(me, START.gx + off + 4, START.gy, 'canvas', 1);
  await publish(me, gallery, 0, 'published', 11);
  for (const i of [1, 2, 3, 4, 5, 6]) await publish(me, gallery, i, 'superseded', 20 + i);
  await publish(me, studio, 7, 'published', 41);
  return gallery;
}

async function setUpMira() {
  const [hit] = await sql<{ id: string }>(`select p.id from players p join profiles pr on pr.id = p.id where pr.username = 'mira_paints'`);
  let mira = hit?.id;
  if (!mira) {
    const [u] = await sql<{ id: string }>(`insert into auth.users (email) values ('mira@preview.local') returning id`);
    mira = u.id;
    const [t] = await sql<{ v: string }>(`select value->>'terms_version' as v from game_config where key = 'legal'`);
    await as(mira, 'complete_onboarding', { p_username: 'mira_paints', p_accept_terms_version: t.v });
    await sql(`update profiles set accent_color = '#FF7AB8', explorer_style = '{"hat":"beret","hold":"palette","outfit":"rainbow","hair":"waves","hairc":"pink","skin":"golden","face":"freckles"}' where id = $1`, [mira]);
    await sql(`update players set created_at = now() - interval '30 days' where id = $1`, [mira]);
  }
  const done = await sql<{ id: string }>(`select id from canvas_groups where owner_id = $1 and kind = 'atelier'`, [mira]);
  if (done.length) return done[0].id;
  const g = await land(mira, START.gx + 900, START.gy + 3, 'atelier');
  const ids: string[] = [];
  for (const i of [7, 6, 1, 4, 2, 5, 0]) ids.push(await publish(mira, g, i, ids.length ? 'superseded' : 'published', 300 + i * 7));
  await as(mira, 'art_place', { p_group: g });
  await sql(`select private.renown_add($1, 2000, 'preview')`, [mira]);
  for (const item of ['frames:gilt', 'frames:ebony', 'frames:neon', 'lights:daylight', 'lights:rose', 'walls:midnight']) await as(mira, 'gallery_buy', { p_group: g, p_item: item });
  await as(mira, 'gallery_wall', { p_group: g, p_room: 2, p_wall: 'midnight' });
  const hangs: [string, number, string, string, number, number][] = [
    ['r1l1', 0, 'gilt', 'warm', 70, -8], ['r1r1', 1, 'ebony', 'daylight', 62, 0], ['r1l2', 2, 'oak', 'warm', 58, 10],
    ['r2l1', 3, 'neon', 'rose', 74, 0], ['r2r1', 4, 'gilt', 'warm', 66, 6], ['r2r2', 5, 'ebony', 'daylight', 60, -6], ['r3l1', 6, 'oak', 'warm', 64, 0],
  ];
  for (const [slot, i, frame, light, power, aim] of hangs) {
    await as(mira, 'gallery_hang', { p_group: g, p_slot: slot, p_publication: ids[i], p_frame: frame, p_light: light, p_power: power, p_aim: aim,
      p_title: null, p_story: PAINTINGS[[7, 6, 1, 4, 2, 5, 0][i]].story });
  }
  await as(mira, 'gallery_potw', { p_group: g, p_publication: ids[0] });
  await as(mira, 'gallery_open_show', { p_group: g, p_title: 'Night Garden' });
  return g;
}

/** my own Museum (an Art Domain, 3×3): 8 paintings hung across two rooms, a piece borrowed from Mira in the Loan Wing,
    and Mira's own Museum next door with Exhibition Night on (and her asking to borrow one of mine) */
async function setUpMuseums() {
  const me = local().current?.userId; if (!me) throw new Error('Sign in first');
  await setUpMine();
  const gal = await setUpMira();
  const [{ id: mira }] = await sql<{ id: string }>(`select owner_id as id from canvas_groups where id = $1`, [gal]);
  const mine = await sql<{ id: string }>(`select id from canvas_groups where owner_id = $1 and kind = 'museum' and name = 'Preview Museum'`, [me]);
  if (mine.length) {
    const [mm] = await sql<{ id: string }>(`select id from canvas_groups where owner_id = $1 and kind = 'museum'`, [mira]);
    return { mine: mine[0].id, mira: mm.id };
  }
  const off = Math.floor(Math.random() * 400);
  const museum = await land(me, START.gx + off, START.gy + 12, 'museum', 3);
  const ids: string[] = [];
  for (let i = 0; i < 8; i++) ids.push(await publish(me, museum, i, i ? 'superseded' : 'published', 500 + i * 13));
  await as(me, 'art_place', { p_group: museum });
  await sql(`select private.renown_add($1, 3000, 'preview')`, [me]);
  for (const item of ['frames:gilt', 'frames:ebony', 'frames:float', 'lights:daylight', 'lights:cool', 'walls:midnight', 'walls:oxblood']) {
    await as(me, 'gallery_buy', { p_group: museum, p_item: item }).catch(() => {});
  }
  await as(me, 'gallery_wall', { p_group: museum, p_room: 2, p_wall: 'oxblood' });
  const hangs: [string, number, string, string][] = [['r1l1', 0, 'gilt', 'warm'], ['r1r1', 1, 'ebony', 'daylight'], ['r1l2', 2, 'float', 'cool'], ['r1r2', 3, 'gilt', 'warm'],
    ['r2l1', 4, 'oak', 'warm'], ['r2r1', 5, 'ebony', 'daylight'], ['r2l2', 6, 'gilt', 'warm'], ['r2r2', 7, 'oak', 'cool']];
  for (const [slot, i, frame, light] of hangs) await as(me, 'gallery_hang', { p_group: museum, p_slot: slot, p_publication: ids[i], p_frame: frame, p_light: light, p_power: 66, p_aim: 0, p_title: null, p_story: PAINTINGS[i].story });
  // two of Mira's pieces on loan to me
  const theirs = await sql<{ id: string }>(`select id from artwork_publications where owner_id = $1 order by published_at desc limit 2`, [mira]);
  await sql(`update artwork_publications set status = 'published' where id = any($1::uuid[])`, [theirs.map((t) => t.id)]);
  for (const [n, t] of theirs.entries()) {
    await as(me, 'museum_loan_request', { p_group: museum, p_publication: t.id, p_note: 'For the Loan Wing’s opening' });
    const [l] = await sql<{ id: number }>(`select id from museum_loans where group_id = $1 and publication_id = $2`, [museum, t.id]);
    await as(mira, 'museum_loan_answer', { p_loan: l.id, p_yes: true });
    await as(me, 'gallery_hang', { p_group: museum, p_slot: `w${n + 1}`, p_publication: t.id, p_frame: 'gilt', p_light: 'warm', p_power: 68, p_aim: 0, p_title: null, p_story: null });
  }
  // Mira's museum: her pieces, Exhibition Night on, and she'd like to borrow one of mine
  const mm = await land(mira, START.gx + 920, START.gy + 12, 'museum', 3);
  const hers: string[] = [];
  for (const i of [5, 0, 3, 7, 1]) hers.push(await publish(mira, mm, i, hers.length ? 'superseded' : 'published', 700 + i * 5));
  await as(mira, 'art_place', { p_group: mm });
  await as(mira, 'gallery_wall', { p_group: mm, p_room: 1, p_wall: 'midnight' });
  for (const [n, id] of hers.entries()) await as(mira, 'gallery_hang', { p_group: mm, p_slot: ['r1l1', 'r1r1', 'r1l2', 'r1r2', 'r2l1'][n], p_publication: id, p_frame: n % 2 ? 'gilt' : 'ebony', p_light: 'warm', p_power: 70, p_aim: 0, p_title: null, p_story: PAINTINGS[[5, 0, 3, 7, 1][n]].story });
  await as(mira, 'museum_exhibition_open', { p_group: mm, p_publication: hers[0] });
  await sql(`update artwork_publications set status = 'published' where id = $1`, [ids[3]]);
  await as(mira, 'museum_loan_request', { p_group: mm, p_publication: ids[3], p_note: 'It would look perfect beside my koi.' });
  return { mine: museum, mira: mm };
}

export default function PreviewTools() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const nav = useNavigate();
  const qc = useQueryClient();
  if (local().mode !== 'local') return null;
  const go = async (key: string, f: () => Promise<string | void>) => {
    setBusy(key);
    try { const to = await f(); await qc.invalidateQueries(); setOpen(false); if (to) nav(to); }
    catch (e) { toast.error((e as Error).message || 'That didn’t work'); }
    finally { setBusy(null); }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed right-0 top-[38%] z-[60] rounded-l-lg bg-[#FFE14D]/85 px-1 py-2 text-[9px] font-black tracking-wider text-black shadow-lg [writing-mode:vertical-rl]" data-testid="preview-tools">PREVIEW</button>
      <Dialog open={open} onOpenChange={setOpen} title="🧪 Preview: Studio, Gallery & Museum" description="Shortcuts for trying this step. They only exist in this offline preview; nothing here touches the live game.">
        <div className="grid gap-2">
          <Button variant="rainbow" loading={busy === 'mine'} onClick={() => void go('mine', async () => `/studio/${await setUpMine()}`)} data-testid="pv-mine">🖼️ Give me an Art Estate with 8 paintings</Button>
          <p className="-mt-1 text-[11px] text-muted">Your Studio, the Gallery behind its doors (3 rooms), and 8 of your own pieces to hang. Plus a plain one-plot Studio next door.</p>
          <Button variant="primary" loading={busy === 'mira'} onClick={() => void go('mira', async () => { await setUpMine(); return `/studio/${await setUpMira()}?room=gallery`; })} data-testid="pv-mira">✨ Visit @mira_paints’ Gallery (a show is on)</Button>
          <p className="-mt-1 text-[11px] text-muted">See it as a visitor: walk the show, read the plaques, admire pieces (you both earn Renown).</p>
          <Button variant="secondary" loading={busy === 'studio'} onClick={() => void go('studio', async () => { await setUpMine(); const me = local().current!.userId; const [s] = await sql<{ id: string }>(`select id from canvas_groups where owner_id = $1 and kind = 'canvas' order by created_at desc limit 1`, [me]); return `/studio/${s.id}`; })}>🎨 My plain Studio (one Art plot)</Button>
          <div className="mt-1 text-[11px] font-black uppercase tracking-wider text-muted">The Museum (Art Domain)</div>
          <Button variant="rainbow" loading={busy === 'museum'} onClick={() => void go('museum', async () => `/studio/${(await setUpMuseums()).mine}?room=museum`)} data-testid="pv-museum">🏛️ Give me a Museum (3×3) with 8 paintings</Button>
          <p className="-mt-1 text-[11px] text-muted">Your Museum at night: the Rotunda, 5 rooms, two pieces borrowed from @mira_paints in the Loan Wing. Open Exhibition Night at the plinth; step inside any painting.</p>
          <Button variant="primary" loading={busy === 'mmuseum'} onClick={() => void go('mmuseum', async () => `/studio/${(await setUpMuseums()).mira}?room=museum`)} data-testid="pv-mira-museum">🌌 Visit @mira_paints’ Museum (Exhibition Night is on)</Button>
          <p className="-mt-1 text-[11px] text-muted">As a visitor: take the exhibition stamp, step inside her paintings and find their sparks.</p>
          <Button variant="secondary" loading={busy === 'loans'} onClick={() => void go('loans', async () => { await setUpMuseums(); return '/loans'; })} data-testid="pv-loans">📜 Mira wants to borrow one of my pieces</Button>
          <Button variant="secondary" loading={busy === 'exnow'} onClick={() => void go('exnow', async () => { await sql(`update museum_exhibitions set opened_at = opened_at - interval '8 days', closes_at = least(closes_at, now() - interval '1 second') where owner_id = $1`, [local().current!.userId]); toast.success('You can open a new Exhibition Night now'); })}>⏩ Let me open another Exhibition Night</Button>
          <div className="mt-1 text-[11px] font-black uppercase tracking-wider text-muted">Both</div>
          <Button variant="secondary" loading={busy === 'renown'} onClick={() => void go('renown', async () => { await sql(`select private.renown_add($1, 1000, 'preview')`, [local().current!.userId]); toast.success('+1,000 Renown'); })}>✦ Give me 1,000 Renown</Button>
          <Button variant="secondary" loading={busy === 'end'} onClick={() => void go('end', async () => { const n = await sql(`update gallery_halls set show_closes_at = now() - interval '1 second' where owner_id = $1 and show_opened_at is not null returning group_id`, [local().current!.userId]); toast.success(n.length ? 'Your show’s week is up: it closes and pays when you next walk in' : 'You have no show on'); })}>⏩ End my show’s week now</Button>
        </div>
      </Dialog>
    </>
  );
}
