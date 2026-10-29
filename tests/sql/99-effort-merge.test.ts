// v0.16: painting time is the biggest part of the craft score (verified on the server,
// never shown), imported images earn no craft bonus, and merging plots costs Ink.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const svc = { role: 'service_role' } as const;
const H = (n: number) => n.toString(16).padStart(64, '0');
let owner: string, eve: string;
let n = 0;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const effort = async (version: string) => Number((await db.sql(`select effort_ms from private.version_effort where version_id = $1`, [version]))[0]?.effort_ms ?? -1);
const A = { gx: 2_500_000, gy: 1_400_000 }, B = { gx: 2_500_001, gy: 1_400_000 };

async function groupAt(uid: string, at: { gx: number; gy: number }) {
  return (await db.rpc(uid, 'my_groups')).find((x: any) => x.cells.some((c: number[]) => c[0] === at.gx && c[1] === at.gy));
}
async function save(uid: string, at: { gx: number; gy: number }, extra: Record<string, unknown> = {}, minutesAgo = 0) {
  const g = await groupAt(uid, at);
  const p = await db.rpc(uid, 'get_project', { p_project_id: g.project_id });
  if (minutesAgo) {
    // versions are immutable; pretend the last save was a while ago
    await db.sql(`alter table artwork_versions disable trigger user`);
    await db.sql(`update artwork_versions set created_at = now() - make_interval(mins => $2) where id = $1`, [p.version.id, minutesAgo]);
    await db.sql(`alter table artwork_versions enable trigger user`);
  }
  const s = await db.rpc(uid, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { [`${at.gx}_${at.gy}`]: H(++n) } }], ...extra } });
  return { project: g.project_id as string, version: s.version_id as string };
}
async function publish(uid: string, at: { gx: number; gy: number }, s: { project: string; version: string }, picture: number) {
  const req = await db.rpc(uid, 'request_publication', { p_project_id: s.project, p_version_id: s.version, p_title: 'Piece ' + n, p_rights_affirmed: true });
  await db.rpc(uid, 'submit_publication', { p_publication_id: req.publication_id });
  await db.rpc(svc, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'none' } } });
  await db.rpc(svc, 'svc_record_craft', { p_publication_id: req.publication_id, p_craft: { score: picture } });
  await db.rpc(svc, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: { [`${at.gx}_${at.gy}`]: ++n } });
  return (await db.sql(`select craft_score, craft from artwork_publications where id = $1`, [req.publication_id]))[0];
}

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('effortowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  const mod = (await db.rpc(owner, 'admin_config_get')).config.moderation.value;
  await db.rpc(owner, 'admin_config_set', { p_key: 'moderation', p_value: { ...mod, mode: 'auto' } });
  eve = await db.newPlayer('eve_paints');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [eve]);
  await db.rpc(eve, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
});
afterAll(() => db.close());

describe('painting time', () => {
  it('only counts time that really passed, at most 5 minutes per save', async () => {
    const s1 = await save(eve, A, { active_ms: 600_000 }, 10); // 10 min of painting claimed, 10 min really passed
    expect(await effort(s1.version)).toBe(300_000); // capped at 5 minutes for one save
    const s2 = await save(eve, A, { active_ms: 99_000_000 }); // claims a day, but no time passed
    expect(await effort(s2.version)).toBeLessThan(301_000);
    const v = await db.sql(`select manifest from artwork_versions where id = $1`, [s2.version]);
    expect(v[0].manifest.active_ms).toBe(99_000_000); // the counter is kept in the draft
  });

  it('a quick piece keeps little of its picture score; a long one keeps it all', async () => {
    const quick = await publish(eve, A, await save(eve, A, { active_ms: 0 }), 90);
    expect(quick.craft_score).toBeLessThan(50); // ~5 verified minutes so far keeps under half
    expect(quick.craft.picture).toBe(90);
    const s = await save(eve, A, { active_ms: 0 });
    await db.sql(`update private.version_effort set effort_ms = 50 * 60000 where version_id = $1`, [s.version]);
    expect((await publish(eve, A, s, 90)).craft_score).toBe(90);
  });

  it('imported images earn no craft bonus', async () => {
    const s = await save(eve, A, { imported: true });
    expect((await db.sql(`select manifest from artwork_versions where id = $1`, [s.version]))[0].manifest.imported).toBe(true);
    await db.sql(`update private.version_effort set effort_ms = 50 * 60000 where version_id = $1`, [s.version]);
    await db.sql(`delete from craft_rewards`);
    const before = await ink(eve);
    const pub = await publish(eve, A, s, 95);
    expect(pub.craft.imported).toBe(true);
    expect(await ink(eve)).toBe(before);
  });

  it('effort settings are validated', async () => {
    const v = (await db.rpc(owner, 'admin_config_get')).config.earn.value;
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'earn', p_value: { ...v, craft: { ...v.craft, effort: { full_minutes: 0 } } } }), 'invalid_earn_config');
  });
});

describe('merging costs Ink', () => {
  it('charges per plot joining the canvas, and keeps the painting time', async () => {
    await db.giveInk(eve, 1000);
    await db.rpc(eve, 'acquire_plot', { p_gx: B.gx, p_gy: B.gy, p_idempotency_key: 'effort-acquire-b-0001' });
    const ga = await groupAt(eve, A), gb = await groupAt(eve, B);
    const cost = await db.rpc(eve, 'fuse_cost', { p_group_ids: [ga.id, gb.id] });
    expect(cost).toMatchObject({ added_plots: 1, ink: 15 });
    const balance = await ink(eve);
    await db.sql(`update resource_balances set amount = 10 where player_id = $1 and resource = 'ink'`, [eve]);
    await expectError(db.rpc(eve, 'fuse_groups', { p_group_ids: [ga.id, gb.id] }), 'insufficient_funds');
    await db.sql(`update resource_balances set amount = $2 where player_id = $1 and resource = 'ink'`, [eve, balance]);
    const pa = await db.rpc(eve, 'get_project', { p_project_id: ga.project_id });
    const before = await effort(pa.version.id);
    const g = await db.rpc(eve, 'fuse_groups', { p_group_ids: [ga.id, gb.id] });
    expect(g.plot_count).toBe(2);
    expect(g.ink_spent).toBe(15);
    expect(await ink(eve)).toBe(balance - 15);
    const merged = await db.rpc(eve, 'get_project', { p_project_id: g.project_id });
    expect(await effort(merged.version.id)).toBeGreaterThanOrEqual(before);
  });
});

describe('daily reset and huge canvases', () => {
  it('days reset at 6 pm Denver time', async () => {
    const r = await db.sql(`select to_char(private.day_start(now()) at time zone 'America/Denver', 'HH24:MI') t,
                                   private.day_start(now()) <= now() a, private.day_start(now()) > now() - interval '1 day' b`);
    expect(r[0]).toMatchObject({ t: '18:00', a: true, b: true });
  });

  it('a 10,000-plot canvas is checked quickly', async () => {
    const t0 = Date.now();
    const r = await db.sql(`with c as (select jsonb_agg(jsonb_build_array(3000000 + x, 1500000 + y)) j, array_agg((3000000 + x) || '_' || (1500000 + y)) k
                                         from generate_series(0, 99) x, generate_series(0, 99) y)
                            select private.cells_connected(j) ok,
                                   (select count(*) from private.components(j)) parts,
                                   (select private.validate_manifest(jsonb_build_object('layers', jsonb_build_array(jsonb_build_object('id', 'm', 'name', 'Mural',
                                      'tiles', (select jsonb_object_agg(kk, repeat('a', 64)) from unnest(k) kk)))), k, 8))::text = '' v
                              from c`);
    expect(r[0]).toMatchObject({ ok: true, parts: '1', v: true });
    expect(Date.now() - t0).toBeLessThan(20_000);
  });
});
