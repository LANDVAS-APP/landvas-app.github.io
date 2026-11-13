// Live builds of the game for the iOS / Android apps (no store release). Two steps in the deploy:
//
//   node scripts/publish-ota.mjs prepare <native build dir> <site dir> <pending dir>
//     Copies the app build (from `npm run build:native`) into the site at ota/<compat>/<build>/ and writes its file
//     list (path, sha-256, size, address) to <pending dir>/<compat>.json.
//
//   node scripts/publish-ota.mjs publish <pending dir>
//     After the site is published: waits until landvas.app serves the new files, then records the build as current
//     for that kind of app in the database (private.ota_publish), through the Supabase Management API.
//     Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.
//
// The apps fetch only files they don't already have, and check every file against this list (src/native/liveBundle.ts).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SITE = process.env.OTA_SITE || 'https://landvas.app';
const [cmd, ...args] = process.argv.slice(2);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
function* walk(dir, rel = '') {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue; // the app shell refuses hidden files
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(dir, r);
    else if (e.isFile()) yield r;
  }
}
const urlPath = (p) => p.split('/').map(encodeURIComponent).join('/');

function prepare(nativeDir, siteDir, pendingDir) {
  const info = JSON.parse(fs.readFileSync(path.join(nativeDir, 'landvas-bundle.json'), 'utf8'));
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(info.build ?? '')) throw new Error(`the app build has no usable id (${info.build}); set LANDVAS_BUILD_ID`);
  if (!/^[a-f0-9]{8,64}$/.test(info.compat ?? '')) throw new Error(`bad compatibility key ${info.compat}`);
  const rel = `ota/${info.compat}/${info.build}`;
  const out = path.join(siteDir, rel);
  const base = `${SITE}/${rel}/`;
  fs.rmSync(out, { recursive: true, force: true });
  const manifest = [];
  for (const file of walk(nativeDir)) {
    if (file === 'landvas-bundle.json') continue;
    const buf = fs.readFileSync(path.join(nativeDir, file));
    fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
    fs.writeFileSync(path.join(out, file), buf);
    manifest.push({ file_name: file, file_hash: sha256(buf), download_url: base + urlPath(file), size: buf.length });
  }
  if (!manifest.some((m) => m.file_name === 'index.html')) throw new Error('the app build has no index.html');
  fs.mkdirSync(pendingDir, { recursive: true });
  const pending = { ...info, base_url: base, manifest };
  fs.writeFileSync(path.join(pendingDir, `${info.compat}.json`), JSON.stringify(pending));
  const mb = manifest.reduce((s, m) => s + m.size, 0) / 1048576;
  console.log(`live build ${info.build} for apps ${info.compat}: ${manifest.length} files, ${mb.toFixed(1)} MB → ${rel}/`);
}

async function query(sql, tries = 5) {
  const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) throw new Error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required');
  for (let i = 1; ; i++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) return text;
    if (i >= tries || res.status < 500) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    await new Promise((r) => setTimeout(r, i * 15000));
  }
}

/** the site serves this exact file (Cloudflare picks up a new deploy within a few minutes) */
async function live(entry, deadline) {
  for (;;) {
    try {
      const res = await fetch(`${entry.download_url}?check=${Date.now()}`, { cache: 'no-store' });
      if (res.ok && sha256(Buffer.from(await res.arrayBuffer())) === entry.file_hash) return true;
    } catch { /* not yet */ }
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 15000));
  }
}

/** the statement that records a build as current (dollar-quoted with a random tag, so no value can break out) */
function publishSql(p) {
  const tag = `m${crypto.randomBytes(6).toString('hex')}`;
  const lit = (v) => `$${tag}$${v}$${tag}$`;
  return `select private.ota_publish(${lit(p.compat)}, ${lit(p.build)}, ${lit(p.built_at)}::timestamptz, ${lit(p.base_url)}, ${lit(JSON.stringify(p.manifest))}::jsonb)`;
}

async function publish(pendingDir) {
  if (!fs.existsSync(pendingDir)) { console.log('no live builds to record'); return; }
  let failed = 0;
  for (const f of fs.readdirSync(pendingDir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(pendingDir, f), 'utf8'));
    const deadline = Date.now() + 10 * 60_000;
    // index.html, plus the largest script (both must be the new ones before any app is told about them)
    const js = p.manifest.filter((m) => m.file_name.endsWith('.js')).sort((a, b) => b.size - a.size)[0];
    const ok = (await live(p.manifest.find((m) => m.file_name === 'index.html'), deadline)) && (!js || (await live(js, deadline)));
    if (!ok) { console.log(`::warning::live build ${p.build} isn't on ${SITE} yet; the apps keep their current build (the next deploy tries again)`); failed++; continue; }
    await query(publishSql(p));
    console.log(`live build ${p.build} is now current for apps ${p.compat} (${p.manifest.length} files)`);
  }
  if (failed) process.exitCode = 0; // never fails the deploy: the site is already live
}

if (cmd === 'prepare') prepare(...args);
else if (cmd === 'publish') await publish(args[0]);
// print the statements without waiting or connecting (for a manual run, or a local database)
else if (cmd === 'sql') for (const f of fs.readdirSync(args[0]).filter((x) => x.endsWith('.json'))) console.log(`${publishSql(JSON.parse(fs.readFileSync(path.join(args[0], f), 'utf8')))};`);
else { console.error('usage: publish-ota.mjs prepare <native dir> <site dir> <pending dir> | publish <pending dir> | sql <pending dir>'); process.exit(2); }
