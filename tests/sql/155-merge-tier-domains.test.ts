// v0.9 merge tiers: a 3x3 square can become the type's Domain; breaking it steps down to the Estate, then the type.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let bo: string;
const O = { gx: 2_800_000, gy: 1_700_000 };
const at = (dx: number, dy: number) => ({ gx: O.gx + dx, gy: O.gy + dy });
const groupAt = async (uid: string, p: { gx: number; gy: number }) =>
  (await db.rpc(uid, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === p.gx && c[1] === p.gy));
const kindOf = async (id: string) => (await db.sql(`select kind from canvas_groups where id = $1`, [id]))[0].kind;
let n = 0;

beforeAll(async () => {
  await db.init({ ungated: true });
  bo = await db.newPlayer('bo_domains');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [bo]);
  await db.rpc(bo, 'claim_starter_plot', { p_gx: O.gx, p_gy: O.gy });
  await db.giveInk(bo, 200_000);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x || y) await db.rpc(bo, 'acquire_plot', { p_gx: at(x, y).gx, p_gy: at(x, y).gy, p_idempotency_key: `domain-acq-${++n}-00000` });
});
afterAll(() => db.close());

describe('Domains (3x3 merge tier)', () => {
  it('every base type has one Domain with a full config and a bigger charter', async () => {
    const rows = await db.sql(`select k, private.estate_base(k) as base, private.rlm_cfg(k) as c from unnest(private.estate_kinds()) k where private.tier_square(k) = 3`);
    expect(rows).toHaveLength(11);
    expect(new Set(rows.map((r: any) => r.base)).size).toBe(11);
    for (const { c } of rows) { expect(c.charter).toBe(600); expect(c.zones).toHaveLength(6); expect(Object.keys(c.finds)).toHaveLength(12); }
  });

  let gid: string;
  it('a 2x2 is an Estate but not yet a Domain', async () => {
    const four = await Promise.all([O, at(1, 0), at(0, 1), at(1, 1)].map((p) => groupAt(bo, p)));
    gid = (await db.rpc(bo, 'fuse_groups', { p_group_ids: four.map((g: any) => g.id) })).id;
    await expectError(db.rpc(bo, 'set_group_kind', { p_group_id: gid, p_kind: 'museum' }), 'domain_needs_square');
    expect((await db.rpc(bo, 'set_group_kind', { p_group_id: gid, p_kind: 'atelier' })).kind).toBe('atelier');
  });

  it('merging the Estate with five more plots into a 3x3 keeps it an Estate, and the Domain unlocks', async () => {
    const rest = await Promise.all([at(2, 0), at(2, 1), at(0, 2), at(1, 2), at(2, 2)].map((p) => groupAt(bo, p)));
    gid = (await db.rpc(bo, 'fuse_groups', { p_group_ids: [gid, ...rest.map((g: any) => g.id)] })).id;
    expect(await kindOf(gid)).toBe('atelier');
    const r = await db.rpc(bo, 'set_group_kind', { p_group_id: gid, p_kind: 'museum' });
    expect(r.kind).toBe('museum'); expect(r.fee).toBe(0); expect(r.realm_id).toBeTruthy();
    const w = (await db.sql(`select wallet from realm_players where player_id = $1 and kind = 'museum'`, [bo]))[0].wallet;
    expect(Number(w.renown)).toBe(600);
  });

  it('the Domain’s game pays out its own resources', async () => {
    const realm = (await db.sql(`select id from realms where group_id = $1 and kind = 'museum'`, [gid]))[0].id;
    const s = await db.rpc(bo, 'realm_start', { p_id: realm, p_game: 'constellation' });
    await db.sql(`update realm_runs set started_at = now() - interval '60 seconds' where id = $1`, [s.session]);
    const f = await db.rpc(bo, 'realm_finish', { p_session: s.session, p_score: 1000 });
    expect(f.loot.stardust).toBeGreaterThan(0);
  });

  it('breaking the 3x3 steps down to the Estate, then to the base type', async () => {
    await db.rpc(bo, 'detach_plots', { p_group_id: gid, p_cells: [[at(2, 2).gx, at(2, 2).gy]] });
    expect(await kindOf(gid)).toBe('atelier');
    await db.rpc(bo, 'detach_plots', { p_group_id: gid, p_cells: [[at(1, 1).gx, at(1, 1).gy]] });
    expect(await kindOf(gid)).toBe('canvas');
  });

  it('Estates and Domains get doors at home', async () => {
    const [{ ok }] = await db.sql(`select (private.home_places($1, $1, 'bo') ? 'museum') and (private.home_places($1, $1, 'bo') ? 'atelier') as ok`, [bo]);
    expect(ok).toBe(true);
    await db.rpc(bo, 'home_doors', { p_doors: { museum: 'friends' } });
  });
});
