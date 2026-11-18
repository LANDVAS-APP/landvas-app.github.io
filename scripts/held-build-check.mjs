// Before a deploy changes the server: do the app builds in the stores' hands still work with it?
// For every build in deploy/store-builds.json marked check: true, builds that commit's game (offline test build) with
// THIS commit's migrations — the server as it will be after this deploy — and runs tests/e2e/held-build.mjs on it.
// Any crash fails (the deploy stops before the migrations reach the live database).
// Run: node scripts/held-build-check.mjs            (CHECK_COMMITS=abc123,def456 to check other commits)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const list = process.env.CHECK_COMMITS
  ? process.env.CHECK_COMMITS.split(',').map((commit) => ({ commit, version: '?', platform: '?' }))
  : JSON.parse(fs.readFileSync('deploy/store-builds.json', 'utf8')).builds.filter((b) => b.check);
if (!list.length) { console.log('No app builds to check (deploy/store-builds.json).'); process.exit(0); }

const failed = [];
for (const b of list) {
  const short = b.commit.slice(0, 7);
  const label = `${b.platform} ${b.version}${b.code ? ` (${b.code})` : ''} @ ${short}`;
  console.log(`\n=== ${label}: its game, today's server ===`);
  const dir = path.resolve(root, '..', `held-build-${short}`);
  try {
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
      try { execSync(`git cat-file -e ${b.commit}^{commit}`, { stdio: 'ignore' }); } catch { sh(`git fetch --depth=1 origin ${b.commit}`); }
      sh(`git worktree add --force --detach "${dir}" ${b.commit}`);
    }
    // the server as it will be after this deploy
    fs.rmSync(path.join(dir, 'supabase/migrations'), { recursive: true, force: true });
    fs.cpSync(path.join(root, 'supabase/migrations'), path.join(dir, 'supabase/migrations'), { recursive: true });
    // its own packages: ours when the lock file is the same, else its own install
    const sameLock = fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8') === fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8');
    if (!fs.existsSync(path.join(dir, 'node_modules'))) {
      if (sameLock) fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
      else sh('npm ci --no-audit --no-fund', { cwd: dir });
    }
    sh('npx vite build --mode artifact --logLevel error', { cwd: dir });
    try {
      sh('node tests/e2e/held-build.mjs', { env: { ...process.env, E2E_DIST: path.join(dir, 'dist-artifact'), E2E_OUT: path.resolve(root, 'test-results', `held-build-${short}`) } });
    } catch (e) {
      if (e.status === 3) { console.log(`::warning::${label}: not checked (no browser on this machine)`); continue; }
      throw e;
    }
  } catch (e) {
    console.log(`::error::${label} breaks with this server: ${String(e.message).split('\n')[0]}`);
    failed.push(label);
  }
}
if (failed.length) {
  console.log(`\n${failed.length} app build(s) in the stores' hands would break: ${failed.join(', ')}.`);
  console.log('Keep whatever they read in the server\'s answers (CLAUDE.md, "Apps under store review"), or take a build off deploy/store-builds.json if nobody can have it any more.');
  process.exit(1);
}
console.log(`\nAll ${list.length} app build(s) in the stores' hands work with this server.`);
