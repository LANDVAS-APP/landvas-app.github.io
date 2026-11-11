// Render the LANDVAS brand kit (HD logos, profile picture, social banners, link-preview image) around the
// multiverse logo — the same mark as the iOS and Android app icons —
// with headless Chromium so the real Unbounded typeface is used.
//   node scripts/make-brand.mjs  ->  public/brand/*, public/og-image.png
import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/brand');
fs.mkdirSync(OUT, { recursive: true });
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource-variable', f)).toString('base64');
const UNBOUNDED = font('unbounded/files/unbounded-latin-wght-normal.woff2');
const MANROPE = font('manrope/files/manrope-latin-wght-normal.woff2');

import { multiverse, multiverseTile, worldTile, GLOWS } from './brand-art.mjs';

// The mark is the multiverse: the same logo as the iOS and Android app icons.
export const markSvg = () => multiverseTile(512);
const css = `
@font-face { font-family: Unbounded; src: url(${UNBOUNDED}) format('woff2'); font-weight: 200 900; }
@font-face { font-family: Manrope; src: url(${MANROPE}) format('woff2'); font-weight: 200 800; }
* { margin: 0; box-sizing: border-box; }
html, body { background: transparent; }
.word { font-family: Unbounded; font-weight: 800; letter-spacing: 0.06em; color: #fff; line-height: 1; }
.word3d { font-family: Unbounded; font-weight: 900; letter-spacing: 0.05em; line-height: 1; color: #fff;
  background: linear-gradient(180deg, #ffffff 0%, #ffffff 45%, #E2D6FF 70%, #BCA8FF 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0.02em 0 #8B6BFF) drop-shadow(0 0.02em 0 #6A48F0) drop-shadow(0 0.02em 0 #4E2FD0) drop-shadow(0 0.05em 0.05em rgba(10,6,40,.7)) drop-shadow(0 0 0.25em rgba(164,92,255,.55)); }
.rain { background: linear-gradient(90deg,#FF4D6D,#FF9F1C,#FFE14D,#3DDC97,#34C3FF,#A45CFF); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tag { font-family: Manrope; font-weight: 800; text-shadow: 0 2px 10px rgba(5,4,30,.8); color: #B9C2EE; letter-spacing: 0.02em; }
.space { background: radial-gradient(55% 75% at 12% 8%, #FF3D9Acc 0%, transparent 70%), radial-gradient(60% 80% at 92% 95%, #22E3FFb0 0%, transparent 70%),
  radial-gradient(45% 60% at 88% 10%, #FFB31F80 0%, transparent 70%), linear-gradient(135deg, #3B1A8F 0%, #0A0B2E 100%); }
.stars { position:absolute; inset:0; }
.floor { position:absolute; left:-25%; right:-25%; bottom:-6%; transform-origin: 50% 100%; transform: perspective(var(--pv, 900px)) rotateX(62deg);
  background-image: linear-gradient(rgba(170,190,255,.32) 2px, transparent 2px), linear-gradient(90deg, rgba(170,190,255,.32) 2px, transparent 2px); background-size: var(--cell) var(--cell);
  -webkit-mask-image: linear-gradient(0deg, #000 25%, transparent 85%); mask-image: linear-gradient(0deg, #000 25%, transparent 85%); }
.lit { position:absolute; border-radius: 18%; }
.rays { position:absolute; border-radius:50%; background: conic-gradient(from 0deg, transparent 0 6%, #ffffff22 8%, transparent 11% 19%, #ffffff1a 21%, transparent 24% 33%, #ffffff22 35%, transparent 38% 47%, #ffffff18 49%, transparent 52% 61%, #ffffff22 63%, transparent 66% 75%, #ffffff1a 77%, transparent 80% 89%, #ffffff22 91%, transparent 94%);
  -webkit-mask-image: radial-gradient(closest-side, #000 20%, transparent 100%); mask-image: radial-gradient(closest-side, #000 20%, transparent 100%); }
.fl { position:absolute; filter: drop-shadow(0 0 var(--g) var(--c)) drop-shadow(0 12px 24px rgba(0,0,0,.45)); }
.grid { position:absolute; inset:0; background-image: linear-gradient(rgba(140,160,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(140,160,255,.07) 1px, transparent 1px); background-size: 64px 64px; }
`;

// a field of stars (fixed seed, so every render matches)
function stars(w, h, n, seed = 5) {
  let v = seed; const r = () => ((v = (v * 16807) % 2147483647) / 2147483647);
  let out = '';
  for (let i = 0; i < n; i++) { const s = 1 + r() * 2.4; out += `<div style="position:absolute;left:${(r() * w).toFixed(0)}px;top:${(r() * h).toFixed(0)}px;width:${s}px;height:${s}px;border-radius:50%;background:#fff;opacity:${(0.25 + r() * 0.7).toFixed(2)};box-shadow:0 0 ${s * 3}px #fff"></div>`; }
  return `<div class="stars">${out}</div>`;
}
// a perspective floor of plots receding to the horizon, a few of them lit
function floor(w, h, cell, seed = 3) {
  let v = seed; const r = () => ((v = (v * 16807) % 2147483647) / 2147483647);
  const cols = Math.ceil((w * 1.5) / cell), rows = Math.ceil((h * 0.9) / cell), C = ['#FF3D7F', '#FFB31F', '#3DDC97', '#2FB8FF', '#A45CFF', '#22E3FF'];
  let lit = '';
  for (let k = 0; k < cols * rows * 0.13; k++) { const x = Math.floor(r() * cols), y = Math.floor(r() * rows), c = C[Math.floor(r() * C.length)];
    lit += `<div class="lit" style="left:${x * cell + 3}px;top:${y * cell + 3}px;width:${cell - 6}px;height:${cell - 6}px;background:${c};opacity:${(0.35 + r() * 0.5).toFixed(2)};box-shadow:0 0 ${cell * 0.5}px ${c}"></div>`; }
  return `<div class="floor" style="--cell:${cell}px;height:${h * 0.9}px;--pv:${h * 1.6}px">${lit}</div>`;
}
const rays = (x, y, d) => `<div class="rays" style="left:${x - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px"></div>`;
// floating world tiles: [world, x, y, size, rotation, opacity]
const float = (list) => list.map(([id, x, y, s, rot, o = 1]) => `<div class="fl" style="left:${x}px;top:${y}px;transform:rotate(${rot}deg) perspective(600px) rotateY(${rot * 0.8}deg);opacity:${o};--c:${GLOWS[id]}cc;--g:${s * 0.2}px${o < 0.9 ? `;filter:blur(${(1 - o) * 7}px) drop-shadow(0 0 ${s * 0.2}px ${GLOWS[id]}aa)` : ''}">${worldTile(id, s)}</div>`).join('');
const mark = (px, pad = 0.12) => `<div style="width:${px}px;height:${px}px;filter:drop-shadow(0 ${px * 0.06}px ${px * 0.18}px rgba(123,92,255,.55))">${multiverseTile(px, px * pad)}</div>`;
const lockup = (h, sub = true, gap = h * 0.08) => `<div style="display:flex;align-items:center;gap:${gap}px">${mark(h)}<div>
  <div class="word3d" style="font-size:${h * 0.5}px">LANDVAS</div>
  <div style="height:${h * 0.045}px;margin-top:${h * 0.09}px;border-radius:99px;background:linear-gradient(90deg,#FF3D7F,#FFB31F,#3DDC97,#2FB8FF,#A45CFF)"></div>
  ${sub ? `<div class="tag" style="font-size:${h * 0.13}px;margin-top:${h * 0.09}px;color:#E6E9FF">Own a piece. Play it your way.</div>` : ''}</div></div>`;
const pill = (t, fs) => `<span style="font-family:Manrope;font-weight:800;font-size:${fs}px;padding:${fs * 0.45}px ${fs * 0.9}px;border-radius:999px;background:#0A0B2Ecc;border:1.5px solid #ffffff40;color:#fff;white-space:nowrap">${t}</span>`;

const browser = await pw.launch({ executablePath: await chromium.executablePath(), headless: true, args: chromium.args.filter((a) => !/single-process|no-zygote/.test(a)) });
async function render(name, w, h, scale, body, transparent = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="width:${w}px;height:${h}px;overflow:hidden">${body}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: name, omitBackground: transparent });
  await ctx.close();
  console.log(path.relative(ROOT, name));
}

// 1. the mark, transparent corners
fs.writeFileSync(path.join(OUT, 'landvas-mark.svg'), markSvg());
for (const s of [4096, 2048, 1024, 512]) await render(path.join(OUT, `landvas-mark-${s}.png`), 512, 512, s / 512, `<div style="width:512px;height:512px">${multiverseTile(512)}</div>`, true);
fs.copyFileSync(path.join(OUT, 'landvas-mark-512.png'), path.join(OUT, 'landvas-multiverse-512.png'));

// 2. horizontal logo (transparent) and on the nebula
const horiz = (dark) => `<div class="${dark ? 'space' : ''}" style="position:relative;width:1600px;height:480px;display:flex;align-items:center;justify-content:center;overflow:hidden">
  ${dark ? stars(1600, 480, 90) : ''}<div style="position:relative">${lockup(300, false)}</div></div>`;
await render(path.join(OUT, 'landvas-logo-horizontal.png'), 1600, 480, 2.5, horiz(false), true);
await render(path.join(OUT, 'landvas-logo-horizontal-dark.png'), 1600, 480, 2.5, horiz(true));

// 3. profile picture (Discord, Reddit, X…): the L of worlds on the nebula, safe inside the circle crop
await render(path.join(OUT, 'landvas-profile-2048.png'), 1024, 1024, 2, `<div class="space" style="position:relative;width:1024px;height:1024px;overflow:hidden">
  ${stars(1024, 1024, 90, 9)}${rays(512, 512, 1300)}<div style="position:absolute;inset:0">${multiverse(1024, 1024 * 0.19, { bg: false })}</div></div>`);

// 4. banners: the logo lockup in the middle, worlds floating out to the edges
const banner = (w, h, { tiles, lock, extra = '' }) => `<div class="space" style="position:relative;width:${w}px;height:${h}px;overflow:hidden">
  ${stars(w, h, Math.round((w * h) / 9000), 11)}${floor(w, h, Math.round(h * 0.16))}${rays(w / 2, h * 0.46, Math.max(w, h) * 0.9)}${float(tiles)}
  <div style="position:absolute;inset:0;background:radial-gradient(40% 62% at 50% 46%, #0A0B2Eb8 0%, #0A0B2E55 55%, transparent 80%)"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${h * 0.06}px">${lock}${extra}</div></div>`;
const bigTiles = (w, h, k = 1) => [
  ['art', w * 0.05, h * 0.12, 150 * k, -12], ['forest', w * 0.11, h * 0.62, 120 * k, 8], ['desert', w * -0.01, h * 0.66, 110 * k, -6, 0.85],
  ['ocean', w * 0.82, h * 0.1, 140 * k, 10], ['galaxy', w * 0.9, h * 0.56, 130 * k, -9], ['forest', w * 0.79, h * 0.72, 90 * k, 14, 0.8],
  ['desert', w * 0.27, h * 0.05, 70 * k, 18, 0.7], ['galaxy', w * 0.64, h * 0.03, 74 * k, -16, 0.7],
];
const launch = (fs) => `<div style="display:flex;gap:${fs * 0.7}px">${pill('🌍 Play now at landvas.app', fs)}${pill('📱 Coming soon to iOS & Android', fs)}</div>`;
// X / Twitter header (3:1)
await render(path.join(OUT, 'landvas-banner-3000x1000.png'), 1500, 500, 2, banner(1500, 500, { tiles: bigTiles(1500, 500), lock: lockup(170), extra: launch(19) }));
// Reddit banner (very wide; the middle stays clear of the crop on phones)
await render(path.join(OUT, 'landvas-banner-reddit-1920x384.png'), 1920, 384, 1, banner(1920, 384, {
  tiles: [['art', 230, 60, 120, -12], ['forest', 360, 220, 96, 8], ['desert', 90, 210, 100, -6, 0.85], ['ocean', 1560, 50, 116, 10], ['galaxy', 1700, 200, 110, -9], ['forest', 1440, 230, 80, 14, 0.8]],
  lock: lockup(150) }));
// Discord server banner / invite background (16:9)
await render(path.join(OUT, 'landvas-banner-discord-1920x1080.png'), 960, 540, 2, banner(960, 540, { tiles: bigTiles(960, 540, 0.75), lock: lockup(150), extra: launch(15) }));

// 5. link preview (Open Graph / Twitter card)
const og = `<div class="space" style="position:relative;width:1200px;height:630px;overflow:hidden">
  ${stars(1200, 630, 80, 3)}${floor(1200, 630, 90, 5)}${float([['ocean', 900, 60, 150, 10], ['galaxy', 1010, 300, 140, -9], ['forest', 820, 380, 120, 8], ['art', 1040, 40, 0, 0]].filter((t) => t[3]))}
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#0A0B2E 0%,#0A0B2Ef2 46%,#0A0B2E55 72%,transparent 100%)"></div>
  <div style="position:absolute;left:80px;top:78px;display:flex;align-items:center;gap:26px">${mark(104)}<div class="word3d" style="font-size:54px">LANDVAS</div></div>
  <div style="position:absolute;left:80px;top:220px;width:900px">
    <div class="word" style="font-size:64px;line-height:1.05;letter-spacing:0">Own a piece.<br><span class="rain">Play it your way.</span></div>
    <div class="tag" style="font-size:25px;margin-top:24px;line-height:1.4;width:680px;color:#D6DBFF">Own plots on a real-world map, roll their rarity, and play them your way — paint, farm, raise creatures, explore.</div>
  </div>
  <div style="position:absolute;left:80px;bottom:56px">${launch(18)}</div></div>`;
await render(path.join(ROOT, 'public/og-image.png'), 1200, 630, 1, og);
await render(path.join(OUT, 'landvas-og-2400x1260.png'), 1200, 630, 2, og);
await browser.close();
