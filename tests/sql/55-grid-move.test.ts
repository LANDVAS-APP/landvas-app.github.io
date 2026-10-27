// The one-time move from the zoom-16 grid to the zoom-22 grid ("keep plots"):
// every claimed plot becomes the small plot at the centre of where it was, with
// its owner, level, type, rarity and name; art and connected canvases are cleared.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, migrationFiles } from '../helpers/db';

const MOVE = '20261027000013_move_plots_to_small_grid.sql';
const db = new TestDb();
afterAll(() => db.close());
const H = (n: number) => n.toString(16).padStart(64, '0');

let alice: string, bob: string;
beforeAll(async () => {
  // a database as it was before the move: every migration except the move itself
  const files = migrationFiles();
  const move = files.find((f) => f.endsWith(MOVE))!;
  expect(move).toBeTruthy();
  await db.init({ ungated: true, skip: [MOVE] });
  alice = await db.newPlayer('oldtimer');
  bob = await db.newPlayer('neighbour2');
  // old-grid plots (zoom-16 coordinates are all below 65536)
  await db.rpc(alice, 'claim_starter_plot', { p_gx: 12398, p_gy: 24628, p_name: 'Old HQ' });
  await db.giveInk(alice, 1000);
  await db.rpc(alice, 'acquire_plot', { p_gx: 12399, p_gy: 24628, p_idempotency_key: 'old-acq-1' });
  await db.rpc(alice, 'acquire_plot', { p_gx: 12398, p_gy: 24629, p_idempotency_key: 'old-acq-2' });
  const gs = await db.rpc(alice, 'my_groups');
  await db.rpc(alice, 'fuse_groups', { p_group_ids: gs.map((g: any) => g.id) });
  await db.rpc(bob, 'claim_starter_plot', { p_gx: 30000, p_gy: 30000 });
  await db.sql(`update world_plots set level = 4 where gx = 12398 and gy = 24628`);
  // some art on the map and a minigame played on an old plot
  await db.sql(`insert into art_tiles (z, x, y, rev, bytes) values (16, 12398, 24628, 5, 100), (15, 6199, 12314, 6, 100)`);
  await db.sql(`insert into minigame_sessions (player_id, game, level, gx, gy, seed, status, expires_at)
                select $1, 'lightlines', 1, 12398, 24628, 1, 'validated', now() + interval '1 hour'`, [alice]).catch(() => {});
  const g = (await db.rpc(alice, 'my_groups'))[0];
  const p = await db.rpc(alice, 'get_project', { p_project_id: g.project_id });
  await db.rpc(alice, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: { layers: [{ id: 'l1', name: 'L', tiles: { [`${g.cells[0][0]}_${g.cells[0][1]}`]: H(1) } }] } });
  const before = await db.sql(`select sum(balance_usd)::float8 s from rent_accounts`);
  expect(before[0].s).toBeGreaterThanOrEqual(0);
  // now run the move
  await db.admin.query(fs.readFileSync(move, 'utf8'));
});

describe('moving plots to the small grid', () => {
  it('each plot lands on the centre small plot, keeping owner, level, rarity and name', async () => {
    const rows = await db.sql(`select gx, gy, owner_id, level, name, rarity, plot_type from world_plots order by gx, gy`);
    expect(rows.map((r: any) => [r.gx, r.gy])).toEqual([
      [12398 * 64 + 32, 24628 * 64 + 32], [12398 * 64 + 32, 24629 * 64 + 32], [12399 * 64 + 32, 24628 * 64 + 32], [30000 * 64 + 32, 30000 * 64 + 32],
    ]);
    const hq = rows.find((r: any) => r.gx === 12398 * 64 + 32 && r.gy === 24628 * 64 + 32);
    expect(hq).toMatchObject({ owner_id: alice, level: 4, name: 'Old HQ' });
    expect(rows.filter((r: any) => r.owner_id === alice)).toHaveLength(3);
  });

  it('clears art and canvases, and gives every plot its own empty canvas', async () => {
    expect(await db.sql(`select * from art_tiles`)).toHaveLength(0);
    const groups = await db.rpc(alice, 'my_groups');
    expect(groups).toHaveLength(3);
    for (const g of groups) {
      expect(g.plot_count).toBe(1);
      const p = await db.rpc(alice, 'get_project', { p_project_id: g.project_id });
      expect(p.version.manifest.layers.every((l: any) => Object.keys(l.tiles).length === 0)).toBe(true);
    }
    const members = await db.sql(`select count(*)::int n from canvas_group_members where gx < 65536`);
    expect(members[0].n).toBe(0);
  });

  it('ownership history continues on the new cells; old records are closed', async () => {
    const open = await db.sql(`select gx, gy, player_id from plot_ownership where released_at is null order by gx, gy`);
    expect(open).toHaveLength(4);
    expect(open.every((o: any) => o.gx >= 65536)).toBe(true);
    const closed = await db.sql(`select count(*)::int n from plot_ownership where released_at is not null and release_reason = 'moved to the small-plot grid'`);
    expect(closed[0].n).toBe(4);
  });

  it('the moved plots work: details, viewport, rent and density', async () => {
    const d = await db.rpc(alice, 'plot_details', { p_gx: 12398 * 64 + 32, p_gy: 24628 * 64 + 32 });
    expect(d.is_mine).toBe(true);
    expect(d.name).toBe('Old HQ');
    expect(d.rarity).toBeTruthy();
    const rows = await db.rpc(null, 'plots_in_bbox', { p_min_gx: 12398 * 64, p_min_gy: 24628 * 64, p_max_gx: 12398 * 64 + 100, p_max_gy: 24628 * 64 + 100 });
    expect(rows.length).toBe(3);
    const st = await db.rpc(alice, 'rent_state');
    expect(Number(st.rate_usd_per_second)).toBeGreaterThan(0);
    const dens = await db.sql(`select sum(owned)::int n from world_density where z = 5`);
    expect(dens[0].n).toBe(4);
    // and the owner can keep building on the new grid
    await db.rpc(alice, 'acquire_plot', { p_gx: 12398 * 64 + 33, p_gy: 24628 * 64 + 32, p_idempotency_key: 'new-acq-1' });
    expect((await db.rpc(alice, 'my_state')).plot_count).toBe(4);
  });
});
