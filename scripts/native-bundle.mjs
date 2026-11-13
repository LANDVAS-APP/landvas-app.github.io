// After `vite build --mode native`: trims what the app never uses out of the web build, and writes
// landvas-bundle.json (this build's id, time and compatibility key) for scripts/publish-ota.mjs.
// Usage: node scripts/native-bundle.mjs dist-native
import fs from 'node:fs';
import path from 'node:path';
import { nativeCompat } from './native-compat.mjs';

const dir = path.resolve(process.argv[2] || 'dist-native');
if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`no web build in ${dir}`);

// the big brand files are for the website, stores and press: the app shows only the mark
const KEEP = new Set(['landvas-mark.svg', 'landvas-mark-512.png', 'landvas-mark-1024.png']);
let saved = 0;
const brand = path.join(dir, 'brand');
if (fs.existsSync(brand)) {
  for (const f of fs.readdirSync(brand)) {
    if (KEEP.has(f)) continue;
    saved += fs.statSync(path.join(brand, f)).size;
    fs.rmSync(path.join(brand, f));
  }
}
for (const f of ['og-image.png']) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) { saved += fs.statSync(p).size; fs.rmSync(p); }
}

const info = {
  build: process.env.LANDVAS_BUILD_ID || null,
  built_at: new Date().toISOString(),
  compat: nativeCompat(),
  ads: process.env.LANDVAS_ADS === 'on',
};
fs.writeFileSync(path.join(dir, 'landvas-bundle.json'), JSON.stringify(info) + '\n');
console.log(`native bundle: ${info.build ?? '(no build id)'} compat ${info.compat}${info.ads ? ' (ads)' : ''}, trimmed ${(saved / 1048576).toFixed(1)} MB`);
