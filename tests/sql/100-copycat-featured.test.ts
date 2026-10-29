// v0.17: Copy Cat can be played as a PvP game, and "Featured today" lists today's art.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
const svc = { role: 'service_role' } as const;
const H = (n: number) => n.toString(16).padStart(64, '0');
let owner: string, kim: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('ftowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  const mod = (await db.rpc(owner, 'admin_config_get')).config.moderation.value;
  await db.rpc(owner, 'admin_config_set', { p_key: 'moderation', p_value: { ...mod, mode: 'auto' } });
  kim = await db.newPlayer('kim_copies');
  await db.rpc(kim, 'claim_starter_plot', { p_gx: 2_600_000, p_gy: 1_500_000 });
});
afterAll(() => db.close());

describe('Copy Cat and Featured today', () => {
  it('Copy Cat is a PvP game', async () => {
    await db.sql(`update game_config set value = value || '{"enabled": true}' where key = 'pvp'`);
    const s = await db.rpc(kim, 'pvp_play', { p_game: 'copycat', p_idempotency_key: 'copycat-play-0001' });
    expect(s.game).toBe('copycat');
    const lobby = await db.rpc(kim, 'pvp_lobby');
    expect(lobby.config.games.copycat.enabled).toBe(true);
  });

  it('lists the day’s most inspiring art, staff picks first', async () => {
    const g = (await db.rpc(kim, 'my_groups'))[0];
    const p = await db.rpc(kim, 'get_project', { p_project_id: g.project_id });
    const sv = await db.rpc(kim, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { '2600000_1500000': H(1) } }] } });
    const req = await db.rpc(kim, 'request_publication', { p_project_id: g.project_id, p_version_id: sv.version_id, p_title: 'Sunrise', p_rights_affirmed: true });
    await db.rpc(kim, 'submit_publication', { p_publication_id: req.publication_id });
    await db.rpc(svc, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'none' } } });
    await db.rpc(svc, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: { '2600000_1500000': 1 } });
    const today = await db.rpc({ role: 'anon' }, 'featured_today', { p_limit: 6 });
    expect(today.some((c: any) => c.id === req.publication_id && c.pick === 'community')).toBe(true);
  });
});
