// Favicons and home-screen / PWA icons for the website and both portals, all from the official LANDVAS mark
// (the crisp L, scripts/landvas-mark.mjs). These are what Google shows next to the site in search results.
//   node scripts/make-icons.mjs
//   → public/favicon.svg, favicon.ico (16/32/48), favicon-48/96/144.png, public/icons/*
//   → portal/admin/public and portal/my/public: the same favicons and icons
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { markSvg } from './landvas-mark.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9, effort: 10 }).toBuffer();
// the logo tile with its rainbow rim (transparent corners) — favicons
const tile = (size) => markSvg(size, { bg: 'squircle' });
// edge to edge, no transparency (iOS home screen, Android/PWA install icons)
const full = (size, pad) => markSvg(size, { bg: 'full', pad });

/** a .ico holding PNG images (supported by every current browser and by Google) */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const o = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, o); head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3); head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

async function write(dir, { manifestIcons }) {
  fs.mkdirSync(dir, { recursive: true });
  const icons = path.join(dir, manifestIcons ? 'icons' : '');
  fs.mkdirSync(icons, { recursive: true });
  fs.writeFileSync(path.join(dir, 'favicon.svg'), tile(64).replace(/ width="64" height="64"/, '') + '\n');
  const sizes = await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await png(tile(256), s) })));
  fs.writeFileSync(path.join(dir, 'favicon.ico'), ico(sizes));
  for (const s of [48, 96, 144, 192]) fs.writeFileSync(path.join(dir, `favicon-${s}.png`), await png(tile(512), s));
  fs.writeFileSync(path.join(icons, 'apple-touch-icon.png'), await png(full(720, 0.15), 180));
  fs.writeFileSync(path.join(icons, 'icon-192.png'), await png(full(768, 0.14), 192));
  fs.writeFileSync(path.join(icons, 'icon-512.png'), await png(full(1024, 0.14), 512));
  fs.writeFileSync(path.join(icons, 'icon-maskable-512.png'), await png(full(1024, 0.26), 512));
  console.log('icons →', path.relative(ROOT, dir));
}

await write(path.join(ROOT, 'public'), { manifestIcons: true });
for (const app of ['admin', 'my']) await write(path.join(ROOT, 'portal', app, 'public'), { manifestIcons: false });
