// Live builds of the game for the apps: the deploy records the current build per kind of app binary; every copy of
// the game sees which build is current, an app fetches the file list only when it needs it, and nobody but the
// deploy can publish. The review hold starts on for 1.0.0.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, player: string;
const COMPAT = 'abcdef0123456789';
const BASE = `https://landvas.app/ota/${COMPAT}/app-1234567/`;
const hash = (c: string) => c.repeat(64);
const manifest = [
  { file_name: 'index.html', file_hash: hash('a'), download_url: `${BASE}index.html`, size: 1200 },
  { file_name: 'assets/index-AbC.js', file_hash: hash('b'), download_url: `${BASE}assets/index-AbC.js`, size: 90000 },
];
const publish = (m: unknown, build = 'app-1234567') =>
  db.sql(`select private.ota_publish($1, $2, now(), $3, $4::jsonb)`, [COMPAT, build, BASE, JSON.stringify(m)]);

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('ota_owner');
  player = await db.newPlayer('ota_player');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [owner]);
});
afterAll(() => db.close());

describe('live builds for the apps', () => {
  it('start with the review hold on for 1.0.0 and nothing published', async () => {
    const c = await db.rpc(null, 'app_config');
    expect(c.ota).toMatchObject({ on: true, paused_for: ['1.0.0'], back_to_store_build: false });
    expect(c.ota_builds).toEqual({});
    expect(await db.rpc(null, 'ota_manifest', { p_compat: COMPAT })).toBeNull();
  });

  it('a published build shows up for everyone; its file list only when asked', async () => {
    await publish(manifest);
    const c = await db.rpc(player, 'app_config');
    expect(c.ota_builds[COMPAT]).toMatchObject({ build: 'app-1234567', files: 2, bytes: 91200 });
    expect(c.ota_builds[COMPAT].manifest).toBeUndefined();
    const m = await db.rpc(null, 'ota_manifest', { p_compat: COMPAT });
    expect(m.build).toBe('app-1234567');
    expect(m.manifest).toHaveLength(2);
    // a newer build replaces it
    await publish(manifest, 'app-89abcde');
    expect((await db.rpc(null, 'app_config')).ota_builds[COMPAT].build).toBe('app-89abcde');
  });

  it('refuses a file list that could point elsewhere or escape the bundle', async () => {
    await expectError(publish([]), 'ota_bad_manifest');
    await expectError(publish([manifest[1]]), 'ota_bad_manifest'); // no index.html
    await expectError(publish([{ ...manifest[0], file_hash: 'nothex' }]), 'ota_bad_manifest');
    await expectError(publish([manifest[0], { ...manifest[1], download_url: 'https://evil.example/x.js' }]), 'ota_bad_manifest');
    await expectError(publish([manifest[0], { ...manifest[1], file_name: '../../etc/x' }]), 'ota_bad_manifest');
  });

  it('players can neither read the table nor publish', async () => {
    await expectError(db.rpc(player, 'ota_publish', { p_compat: COMPAT }), 'ota_publish');
    const rows = await db.rpc(player, 'app_config');
    expect(rows.ota_builds[COMPAT]).toBeDefined();
    const [priv] = await db.sql(`select has_table_privilege('authenticated', 'public.ota_bundles', 'select') as a, has_table_privilege('anon', 'public.ota_bundles', 'select') as b`);
    expect(priv).toEqual({ a: false, b: false });
  });

  it('staff change the live settings; a bad hold list is refused', async () => {
    const cur = await db.rpc(null, 'app_config');
    const { ota_builds: _, ...app } = cur;
    await db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: { ...app, ota: { on: true, paused_for: [], back_to_store_build: false } } });
    expect((await db.rpc(null, 'app_config')).ota.paused_for).toEqual([]);
    // what app_config() adds is never stored back
    await db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: cur });
    const [row] = await db.sql(`select value ? 'ota_builds' as has from game_config where key = 'app'`);
    expect(row.has).toBe(false);
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: { ...app, ota: { on: true, paused_for: ['soon'] } } }), 'invalid_app_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: { ...app, ota: 'on' } }), 'invalid_app_config');
  });
});
