// The deploy's live-build step (scripts/publish-ota.mjs prepare): copies the app build into the site and lists every
// file with its sha-256 and address, skipping hidden files and the build's own info file.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('publishing a live build for the apps', () => {
  it('lists every file with its hash and address, and copies it into the site', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-'));
    const app = path.join(tmp, 'app'), site = path.join(tmp, 'site'), pending = path.join(tmp, 'pending');
    fs.mkdirSync(path.join(app, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(app, 'index.html'), '<!doctype html><title>LANDVAS</title>');
    fs.writeFileSync(path.join(app, 'assets', 'index-a b.js'), 'console.log(1)');
    fs.writeFileSync(path.join(app, '.DS_Store'), 'x');
    fs.writeFileSync(path.join(app, 'landvas-bundle.json'), JSON.stringify({ build: 'app-abc1234', built_at: '2026-11-13T12:00:00Z', compat: '0123456789abcdef', ads: false }));
    execFileSync('node', ['scripts/publish-ota.mjs', 'prepare', app, site, pending], { stdio: 'pipe' });
    const p = JSON.parse(fs.readFileSync(path.join(pending, '0123456789abcdef.json'), 'utf8'));
    expect(p.build).toBe('app-abc1234');
    expect(p.base_url).toBe('https://landvas.app/ota/0123456789abcdef/app-abc1234/');
    expect(p.manifest.map((m: any) => m.file_name).sort()).toEqual(['assets/index-a b.js', 'index.html']);
    const js = p.manifest.find((m: any) => m.file_name.endsWith('.js'));
    expect(js.file_hash).toBe(crypto.createHash('sha256').update('console.log(1)').digest('hex'));
    expect(js.download_url).toBe('https://landvas.app/ota/0123456789abcdef/app-abc1234/assets/index-a%20b.js');
    expect(fs.readFileSync(path.join(site, 'ota/0123456789abcdef/app-abc1234/assets/index-a b.js'), 'utf8')).toBe('console.log(1)');
    // the statement it records with keeps every value inside its quotes
    const sql = execFileSync('node', ['scripts/publish-ota.mjs', 'sql', pending], { encoding: 'utf8' });
    expect(sql).toMatch(/^select private\.ota_publish\(\$m[0-9a-f]{12}\$0123456789abcdef\$m[0-9a-f]{12}\$/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
