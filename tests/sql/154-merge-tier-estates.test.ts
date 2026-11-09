// v0.8 merge tiers: a 2x2 square of same-type plots can become that type's Estate (or stay as it is).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ana: string;
const O = { gx: 2_700_000, gy: 1_600_000 };
const at = (dx: number, dy: number) => ({ gx: O.gx + dx, gy: O.gy + dy });
const groupAt = async (uid: string, p: { gx: number; gy: number }) =>
  (await db.rpc(uid, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === p.gx && c[1] === p.gy));
let n = 0;
const buy = (uid: string, p: { gx: number; gy: number }) => db.rpc(uid, 'acquire_plot', { p_gx: p.gx, p_gy: p.gy, p_idempotency_key: `estate-acq-${++n}-000000` });
const wallet = async (uid: string, kind: string) => (await db.sql(`select wallet from realm_players where player_id = $1 and kind = $2`, [uid, kind]))[0]?.wallet ?? null;

beforeAll(async () => {
  await db.init({ ungated: true });
  ana = await db.newPlayer('ana_estates');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [ana]);
  await db.rpc(ana, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(ana, 50_000);
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 0]]) await buy(ana, at(dx, dy));
});
afterAll(() => db.close());

describe('Estates (2x2 merge tier)', () => {
  it('every base type has exactly one Estate, with a full realm config', async () => {
    const rows = await db.sql(`select k, private.estate_base(k) as base from unnest(private.estate_kinds()) k where private.tier_square(k) = 2`);
    expect(rows).toHaveLength(11);
    expect(new Set(rows.map((r: any) => r.base))).toEqual(new Set(['canvas', 'habitat', 'farm', 'business', 'arcade', 'mine', 'sky', 'workshop', 'diner', 'dungeon', 'brawl']));
    for (const { k } of rows) {
      const [{ c }] = await db.sql(`select private.rlm_cfg($1) as c`, [k]);
      expect(Object.keys(c.games)).toHaveLength(1);
      expect(Object.keys(c.finds)).toHaveLength(12);
      expect(c.zones).toHaveLength(6);
      expect(Object.keys(c.producers)).toHaveLength(6);
      // every producer, recipe and drop points at a real resource
      for (const p of Object.values<any>(c.producers)) for (const r of Object.keys(p.makes)) expect(c.resources[r]).toBeTruthy();
      for (const rc of Object.values<any>(c.recipes)) for (const r of [...Object.keys(rc.in), ...Object.keys(rc.out)]) expect(c.resources[r]).toBeTruthy();
      for (const d of Object.values<any>(c.games)[0].drops) expect(c.resources[d.res]).toBeTruthy();
    }
  });

  it('a single plot can’t become an Estate, and an Estate must match the type', async () => {
    const g = await groupAt(ana, O);
    await expectError(db.rpc(ana, 'set_group_kind', { p_group_id: g.id, p_kind: 'atelier' }), 'estate_needs_square');
    await expectError(db.rpc(ana, 'set_group_kind', { p_group_id: g.id, p_kind: 'ranch' }), 'estate_wrong_type');
  });

  let gid: string;
  it('four plots merged into a 2x2 square unlock the Estate; upgrading is free and comes with a charter', async () => {
    const ids = [O, at(1, 0), at(0, 1), at(1, 1)];
    const groups = await Promise.all(ids.map((p) => groupAt(ana, p)));
    const merged = await db.rpc(ana, 'fuse_groups', { p_group_ids: groups.map((g: any) => g.id) });
    gid = merged.id;
    expect((await db.sql(`select private.group_has_square($1, 2) as s`, [gid]))[0].s).toBe(true);
    const r = await db.rpc(ana, 'set_group_kind', { p_group_id: gid, p_kind: 'atelier' });
    expect(r.kind).toBe('atelier');
    expect(r.fee).toBe(0);
    expect(r.realm_id).toBeTruthy();
    expect(Number((await wallet(ana, 'atelier')).acclaim)).toBe(250);
    const view = await db.rpc(ana, 'realm_get', { p_id: r.realm_id });
    expect(view.kind).toBe('atelier');
    expect(view.cfg.games.hue).toBeTruthy();
  });

  it('the Estate’s minigame pays out its own resources', async () => {
    const realm = (await db.sql(`select id from realms where group_id = $1 and kind = 'atelier'`, [gid]))[0].id;
    const s = await db.rpc(ana, 'realm_start', { p_id: realm, p_game: 'hue' });
    await db.sql(`update realm_runs set started_at = now() - interval '60 seconds' where id = $1`, [s.session]);
    const f = await db.rpc(ana, 'realm_finish', { p_session: s.session, p_score: 900 });
    expect(f.score).toBe(900);
    expect(f.loot.charcoal).toBeGreaterThan(0);
  });

  it('keeping the base type is always possible, free, and the charter is only given once', async () => {
    const back = await db.rpc(ana, 'set_group_kind', { p_group_id: gid, p_kind: 'canvas' });
    expect(back.kind).toBe('canvas');
    expect(back.fee).toBe(0);
    const again = await db.rpc(ana, 'set_group_kind', { p_group_id: gid, p_kind: 'atelier' });
    expect(again.fee).toBe(0);
    expect(Number((await wallet(ana, 'atelier')).acclaim)).toBeLessThan(500); // no second charter
  });

  it('an Estate merges with plots of its base type and stays an Estate', async () => {
    const extra = await groupAt(ana, at(2, 0));
    expect(extra.kind).toBe('canvas');
    const merged = await db.rpc(ana, 'fuse_groups', { p_group_ids: [gid, extra.id] });
    const [{ kind }] = await db.sql(`select kind from canvas_groups where id = $1`, [merged.id]);
    expect(kind).toBe('atelier');
    gid = merged.id;
  });

  it('breaking the 2x2 square turns the Estate back into its base type', async () => {
    await db.rpc(ana, 'detach_plots', { p_group_id: gid, p_cells: [[at(1, 1).gx, at(1, 1).gy]] });
    const [{ kind }] = await db.sql(`select kind from canvas_groups where id = $1`, [gid]);
    expect(kind).toBe('canvas');
  });
});
