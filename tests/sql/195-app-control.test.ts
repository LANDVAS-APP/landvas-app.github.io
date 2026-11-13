// Live control of the apps (game_config 'app'): anyone can read it (the update and maintenance screens show before
// sign-in), only staff with the settings role can change it, and a bad shape is refused so the apps can always read it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, player: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('app_owner');
  player = await db.newPlayer('app_player');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [owner]);
});
afterAll(() => db.close());

const current = async () => (await db.rpc(null, 'app_config')) as Record<string, any>;

describe('app config', () => {
  it('ships with safe defaults that anyone can read', async () => {
    const c = await current();
    expect(c.min_version).toBe('1.0.0');
    expect(c.maintenance.on).toBe(false);
    expect(c.hidden_pages).toEqual([]);
    expect(c.store.android).toContain('com.landvas.app');
    expect((await db.rpc(player, 'app_config')).latest_version).toBe('1.0.0');
  });

  it('staff change it live; players cannot', async () => {
    const next = { ...(await current()), latest_version: '1.1.0', hidden_pages: ['/space'], maintenance: { on: true, title: 'Back soon', message: 'Upgrading', until: null } };
    await expectError(db.rpc(player, 'admin_config_set', { p_key: 'app', p_value: next }), 'forbidden');
    await db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: next });
    const c = await current();
    expect(c.latest_version).toBe('1.1.0');
    expect(c.hidden_pages).toEqual(['/space']);
    expect(c.maintenance.on).toBe(true);
  });

  it('refuses a shape the apps could not read, and never switches off the core pages', async () => {
    await db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: { ...(await current()), hidden_pages: ['/space'] } });
    const base = await current();
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: { ...base, min_version: 'one' } }), 'invalid_app_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: { ...base, hidden_pages: '/space' } }), 'invalid_app_config');
    for (const page of ['/world', '/settings', '/support', '/']) {
      await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: { ...base, hidden_pages_apps: [page] } }), 'invalid_app_config');
    }
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'app', p_value: { ...base, hidden_pages: ['space'] } }), 'invalid_app_config');
    // the last good version is still what everyone reads
    expect((await current()).hidden_pages).toEqual(['/space']);
  });
});
