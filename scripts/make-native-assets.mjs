// App icons and splash screens for the iOS and Android apps, the store icon, and the public/brand marks,
// all drawn from the crisp LANDVAS mark (scripts/landvas-mark.mjs): the original five-plot "L".
// Run: node scripts/make-native-assets.mjs  (after `npx cap add`)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { markSvg } from './landvas-mark.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BG = '#0B0820'; // matches backgroundColor in capacitor.config.ts, so the splash never flashes
const ICON_PAD = 0.14; // edge-to-edge icons: room for iOS's rounded mask
const ADAPTIVE_PAD = 0.28; // Android adaptive icons: keep the L inside the 66 dp safe circle of the 108 dp layer

const svg = (s) => sharp(Buffer.from(s), { density: 72 });
const write = async (s, out, { flatten = false } = {}) => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let img = svg(s);
  if (flatten) img = img.flatten({ background: BG });
  await img.png({ compressionLevel: 9 }).toFile(out);
};
const splash = async (width, height, markPx, out) => {
  const m = await svg(markSvg(markPx)).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: BG } }).composite([{ input: m, gravity: 'center' }]).png({ compressionLevel: 9 }).toFile(out);
};

// The brand marks (logo tile with its rainbow rim) used by the site, the boot screen and the Welcome screen
const brand = path.join(ROOT, 'public/brand');
fs.writeFileSync(path.join(brand, 'landvas-mark.svg'), markSvg(1024).replace(/ width="1024" height="1024"/, '') + '\n');
for (const px of [512, 1024, 2048, 4096]) await write(markSvg(px), path.join(brand, `landvas-mark-${px}.png`));
console.log('brand marks');

// Store icons: App Store 1024 (no transparency) and Google Play 512
await write(markSvg(1024, { bg: 'full', pad: ICON_PAD }), path.join(ROOT, 'docs/store/app-icon-1024.png'), { flatten: true });
await write(markSvg(512, { bg: 'full', pad: ICON_PAD }), path.join(ROOT, 'docs/store/play-icon-512.png'));
console.log('store icons');

// iOS: one 1024 icon (no transparency allowed) + splash
const ios = path.join(ROOT, 'ios/App/App/Assets.xcassets');
if (fs.existsSync(ios)) {
  await write(markSvg(1024, { bg: 'full', pad: ICON_PAD }), path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'), { flatten: true });
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await splash(2732, 2732, 560, path.join(ios, 'Splash.imageset', f));
  }
  console.log('ios icons + splash');
}

// Android: legacy + round + adaptive (foreground, background, monochrome) per density, and splash drawables
const res = path.join(ROOT, 'android/app/src/main/res');
if (fs.existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const icon = Math.round(48 * k), layer = Math.round(108 * k);
    await write(markSvg(icon, { bg: 'full', pad: ICON_PAD }), path.join(res, `mipmap-${d}/ic_launcher.png`), { flatten: true });
    const roundMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${icon}" height="${icon}"><circle cx="${icon / 2}" cy="${icon / 2}" r="${icon / 2}"/></svg>`);
    const roundSrc = await svg(markSvg(icon, { bg: 'full', pad: 0.22 })).png().toBuffer();
    await sharp(roundSrc).composite([{ input: roundMask, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toFile(path.join(res, `mipmap-${d}/ic_launcher_round.png`));
    await write(markSvg(layer, { bg: 'none', pad: ADAPTIVE_PAD }), path.join(res, `mipmap-${d}/ic_launcher_foreground.png`));
    await write(markSvg(layer, { bg: 'full', plots: false }), path.join(res, `mipmap-${d}/ic_launcher_background.png`));
    // themed icons (Android 13+) tint this: just the L, so it still reads as LANDVAS
    await write(markSvg(layer, { bg: 'none', pad: ADAPTIVE_PAD, mono: true }), path.join(res, `mipmap-${d}/ic_launcher_monochrome.png`));
  }
  fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', f), `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>\n`);
  }
  for (const dir of fs.readdirSync(res).filter((x) => x.startsWith('drawable'))) {
    const f = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const { width, height } = await sharp(f).metadata();
    await splash(width, height, Math.round(Math.min(width, height) * 0.32), f + '.tmp');
    fs.renameSync(f + '.tmp', f);
  }
  console.log('android icons + splash');
}
