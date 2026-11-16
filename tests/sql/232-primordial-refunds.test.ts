// Primordials are only rolled: three ultras no longer fuse, fused Primordials come back as three ultras the player picks,
// and Primordial rent is far lower (still above the everyday ultras).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string;
const O = { gx: 1_100_400, gy: 1_650_200 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `pr-${++k}-00000000` });
const setR = (dx: number, dy: number, r: string) => db.sql(`update world_plots set rarity = $3 where gx = $1 and gy = $2`, [O.gx + dx, O.gy + dy, r]);
const one = async (q: string, p: unknown[] = []) => (await db.sql(q, p))[0];
/** a text[] argument (as PostgREST sends one) */
const arr = (a: string[]) => `{${a.join(',')}}`;
/** a Primordial made the old way: three ultras fused, as the fair-play log recorded it */
async function fusedPrimordial(uid: string, dx: number, prim: string, from: string[]) {
  await claim(uid, dx); await setR(dx, 0, prim); await db.sql(`select private.rx_sync($1, $2)`, [O.gx + dx, O.gy]);
  await db.sql(`insert into private.fairplay_log (player_id, kind, gx, gy, data) values ($1, 'rx_fuse', $2, $3, $4)`,
    [uid, O.gx + dx, O.gy, JSON.stringify({ from, to: prim, released: [[1, 1], [2, 2]] })]);
}

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('pr_ann'); bob = await db.newPlayer('pr_bob');
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 2_000_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'leviathan'`);
});
afterAll(() => db.close());

describe('Primordials: rolled, never fused', () => {
  it('Primordial rent is far lower, but still above every everyday ultra', async () => {
    const r = await db.sql(`select id, tier, usd_per_second::float8 u from plot_rarities where tier in ('ultra', 'primordial')`);
    const prim = r.filter((x: any) => x.tier === 'primordial'), everyday = r.filter((x: any) => x.tier === 'ultra' && !['singularity', 'genesis'].includes(x.id) && !x.id.startsWith('crown'));
    expect(prim.every((x: any) => x.u === 1e-7)).toBe(true);
    expect(Math.max(...everyday.map((x: any) => x.u))).toBeLessThan(1e-7);
  });

  it('a fused Primordial turns straight back into its first ultra and opens a refund with an alert', async () => {
    await fusedPrimordial(ann, 0, 'loom', ['chaos', 'kraken', 'hive']);
    await fusedPrimordial(bob, 10, 'midas', ['solar', 'lunar', 'comet']);
    await db.sql(`update world_plots set owner_id = $3 where gx = $1 and gy = $2`, [O.gx + 10, O.gy, ann]); // bob no longer holds his
    expect((await one(`select private.primordial_refunds_open() n`)).n).toBe(1);
    expect((await one(`select private.primordial_refunds_open() n`)).n).toBe(0); // once only
    expect((await one(`select rarity from world_plots where gx = $1 and gy = $2`, [O.gx, O.gy])).rarity).toBe('chaos');
    const st = await db.rpc(ann, 'primordial_refund_status');
    expect(st.open).toHaveLength(1);
    expect(st.open[0]).toMatchObject({ primordial: 'loom', fused_from: ['chaos', 'kraken', 'hive'], reverted_to: 'chaos' });
    const ids = st.choices.map((c: any) => c.id);
    expect(ids).toContain('volcano');
    expect(ids.some((x: string) => x.startsWith('crown'))).toBe(false);
    expect(ids).not.toContain('singularity');
    expect(ids).not.toContain('loom');
    expect((await one(`select count(*)::int n from player_notifications where player_id = $1 and kind = 'power' and data ->> 'sub' = 'refund'`, [ann])).n).toBe(1);
    // the one bob no longer holds isn't refunded, but staff can see it
    expect((await db.rpc(bob, 'primordial_refund_status')).open).toHaveLength(0);
    expect((await one(`select status, note from primordial_refunds where player_id = $1`, [bob]))).toMatchObject({ status: 'void', note: 'no longer theirs' });
  });

  it('the player picks any three ultras: the plot becomes the first, the next two claims roll the others', async () => {
    const st = await db.rpc(ann, 'primordial_refund_status');
    const id = st.open[0].id;
    await expectError(db.rpc(ann, 'primordial_refund_choose', { p_id: id, p_picks: arr(['volcano', 'hive']) }), 'pick_three');
    await expectError(db.rpc(ann, 'primordial_refund_choose', { p_id: id, p_picks: arr(['volcano', 'hive', 'crown']) }), 'not_a_choice');
    await expectError(db.rpc(bob, 'primordial_refund_choose', { p_id: id, p_picks: arr(['volcano', 'hive', 'hive']) }), 'not_found');
    const r = await db.rpc(ann, 'primordial_refund_choose', { p_id: id, p_picks: arr(['volcano', 'hive', 'hive']) });
    expect(r).toMatchObject({ ok: true, on_plot: true });
    expect((await one(`select rarity from world_plots where gx = $1 and gy = $2`, [O.gx, O.gy])).rarity).toBe('volcano');
    await expectError(db.rpc(ann, 'primordial_refund_choose', { p_id: id, p_picks: arr(['volcano', 'hive', 'hive']) }), 'not_found');
    expect((await db.rpc(ann, 'primordial_refund_status')).open).toHaveLength(0);
    const a = await claim(ann, 20); const b = await claim(ann, 22);
    expect([a.rarity, b.rarity]).toEqual(['hive', 'hive']);
  });
});
