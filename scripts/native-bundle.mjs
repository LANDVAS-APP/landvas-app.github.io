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

// the website's search and share tags (keywords, FAQ, social cards) mean nothing inside the app: leave them out
{
  const f = path.join(dir, 'index.html');
  const before = fs.readFileSync(f, 'utf8');
  const after = before
    .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
    .replace(/\s*<meta (name="(keywords|robots|twitter:[a-z:]+)"|property="og:[a-z:]+")[^>]*>/g, '')
    .replace(/\s*<link rel="canonical"[^>]*>/g, '');
  fs.writeFileSync(f, after);
  saved += before.length - after.length;
}

// chunks nothing in the app can reach (code the app build switched off, e.g. the website's home page, whose lazy
// import was dropped after the chunk was already split off): a chunk stays if its file name appears in any file that
// the app can reach, starting from index.html and every non-script file
{
  const assets = path.join(dir, 'assets');
  if (fs.existsSync(assets)) {
    const js = fs.readdirSync(assets).filter((f) => f.endsWith('.js'));
    const text = (f) => fs.readFileSync(f, 'utf8');
    const roots = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (!(d === assets && e.name.endsWith('.js'))) roots.push(f); } };
    walk(dir);
    const reach = new Set();
    let queue = roots.filter((f) => /\.(html|css|json|js|webmanifest)$/.test(f)).map(text);
    while (queue.length) {
      const next = [];
      for (const t of queue) for (const f of js) if (!reach.has(f) && t.includes(f)) { reach.add(f); next.push(text(path.join(assets, f))); }
      queue = next;
    }
    for (const f of js) if (!reach.has(f)) { saved += fs.statSync(path.join(assets, f)).size; fs.rmSync(path.join(assets, f)); console.log(`  unreachable, left out: ${f}`); }
  }
}

const info = {
  build: process.env.LANDVAS_BUILD_ID || null,
  built_at: new Date().toISOString(),
  compat: nativeCompat(),
  ads: process.env.LANDVAS_ADS === 'on',
};
fs.writeFileSync(path.join(dir, 'landvas-bundle.json'), JSON.stringify(info) + '\n');
console.log(`native bundle: ${info.build ?? '(no build id)'} compat ${info.compat}${info.ads ? ' (ads)' : ''}, trimmed ${(saved / 1048576).toFixed(1)} MB`);
