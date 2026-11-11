// The PWA / home-screen icons and the website's favicons (what Google shows next to search results), all drawn
// from the LANDVAS logo — the same multiverse mark as the iOS and Android app icons (see brand-art.mjs).
// Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { multiverse, multiverseSmall, multiverseTile } from './brand-art.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUB = path.join(ROOT, 'public');
const ICONS = path.join(PUB, 'icons');
fs.mkdirSync(ICONS, { recursive: true });
const BG = '#0B0820';
const png = (svg, opts = {}) => { let s = sharp(Buffer.from(svg)); if (opts.flatten) s = s.flatten({ background: BG }); return s.png({ compressionLevel: 9, effort: 10 }).toBuffer(); };
const write = async (file, buf) => { fs.writeFileSync(file, buf); console.log(path.relative(ROOT, file)); };

// PWA: full-bleed squares (the phone rounds or masks them itself, like the native apps)
await write(path.join(ICONS, 'icon-192.png'), await png(multiverse(192, 192 * 0.12), { flatten: true }));
await write(path.join(ICONS, 'icon-512.png'), await png(multiverse(512, 512 * 0.12), { flatten: true }));
// maskable: the logo kept inside the safe circle (the middle 80%)
await write(path.join(ICONS, 'icon-maskable-512.png'), await png(multiverse(512, 512 * 0.2), { flatten: true }));
await write(path.join(ICONS, 'apple-touch-icon.png'), await png(multiverse(180, 180 * 0.12), { flatten: true }));

// favicons: the simple mark when small (the detailed worlds turn to mush at 16-48 px), the full mark from 96 px up
await write(path.join(PUB, 'favicon-48.png'), await png(multiverseSmall(48)));
await write(path.join(PUB, 'favicon-96.png'), await png(multiverseTile(96)));
await write(path.join(PUB, 'favicon-144.png'), await png(multiverseTile(144)));
fs.writeFileSync(path.join(PUB, 'favicon.svg'), multiverseSmall(64).replace(/\s+/g, ' '));
console.log('public/favicon.svg');

// favicon.ico: 16, 32 and 48 px PNGs in one ICO file
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => png(multiverseSmall(s))));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += imgs[i].length;
});
await write(path.join(PUB, 'favicon.ico'), Buffer.concat([head, ...imgs]));
