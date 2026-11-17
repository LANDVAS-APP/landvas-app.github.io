// A Mirror Shard reflecting a Pocket Sun: the mirrored sun lights near the explorer (its rules run on the shard), and
// every sun reflection that never lit (the app held the mirrored sun's buttons) is given back, once.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, cellCenter } from '../helpers/db';

const FIX = '20261119000410_mirror_sun_fixed.sql';
const db = new TestDb();
let ann: string, bob: string;
const O = { gx: 812_400, gy: 1_544_300 };
let k = 0;
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const ep = async () => Number((await db.sql(`select extract(epoch from now()) n`))[0].n);
async function shard(uid: string) {
  await force('shard');
  const r = await db.rpc(uid, 'acquire_plot', { p_gx: O.gx + (k++) * 3, p_gy: O.gy, p_idempotency_key: `msun-${k}-00000000` });
  await force('');
  return r.enchant.id as string;
}
/** a sun reflection stepped into some hours ago (as the shard's 'step' records it) */
const reflected = (id: string, hoursAgo: number, kind = 'sun') =>
  db.sql(`insert into enchant_events (enchant_id, kind, data, created_at) values ($1, 'reflect', jsonb_build_object('kind', $2::text), now() - make_interval(hours => $3))`, [id, kind, hoursAgo]);
const reflecting = async (id: string, kind: string, hoursLeft: number) => {
  const now = await ep();
  await db.sql(`update enchantments set state = state || jsonb_build_object('reflect', jsonb_build_object('kind', $2::text, 'until', $3::numeric, 'from', $4::numeric), 'r', private.ench_init($2, now())) where id = $1`,
    [id, kind, now + hoursLeft * 3600, now - 3600]);
};

beforeAll(async () => {
  await db.init({ ungated: true, skip: [FIX] });
  ann = await db.newPlayer('msun_ann'); bob = await db.newPlayer('msun_bob');
  await db.giveInk(ann, 1_000_000); await db.giveInk(bob, 1_000_000);
});
afterAll(() => db.close());

describe('a mirrored Pocket Sun', () => {
  it('is thrown anywhere near the explorer — far from every plot', async () => {
    const s = await shard(bob);
    await reflecting(s, 'sun', 20);
    // the explorer is out ~1 km from the plots
    const at = cellCenter(O.gx + 300, O.gy);
    await db.sql(`insert into explorers (player_id, mode, lng, lat) values ($1, 'manual', $2, $3) on conflict (player_id) do update set lng = excluded.lng, lat = excluded.lat`, [bob, at.lng, at.lat]);
    const g = await db.rpc(bob, 'enchant_get', { p_id: s });
    expect(g.reflect_kind).toBe('sun');
    expect(g.reflected).toMatchObject({ can_ignite: true });
    expect(g.reflected.explorer).toEqual([O.gx + 300, O.gy]);
    const r = await act(bob, s, 'ignite', { gx: O.gx + 310, gy: O.gy, mode: 'claim' });
    expect(r.result.zone).toMatchObject({ alive: true, gx: O.gx + 310 });
    // it lights the claims around it like a real one, and stokes and flares
    expect(r.reflected.zones).toHaveLength(1);
    expect((await act(bob, s, 'stoke', { n: 1 })).result.heat).toBeGreaterThan(30);
    expect((await act(bob, s, 'aim')).result.ring_at).toBeTruthy();
    const live = await db.sql(`select count(*)::int n from private.sun_live(array[$1]::uuid[])`, [bob]);
    expect(live[0].n).toBe(1);
  });
});

describe('every wasted sun reflection comes back', () => {
  let still: string, over: string, other: string, lit: string, twice: string;
  it('(before the fix)', async () => {
    still = await shard(ann); await reflected(still, 3); await reflecting(still, 'sun', 21);        // reflecting a sun now, never lit
    over = await shard(ann); await reflected(over, 40);                                               // a sun reflection that ran out
    other = await shard(ann); await reflected(other, 50); await reflected(other, 2, 'genie'); await reflecting(other, 'genie', 22);
    lit = await shard(ann); await reflected(lit, 30);
    await db.sql(`insert into enchant_events (enchant_id, kind, data, created_at) values ($1, 'ignited', '{}'::jsonb, now() - interval '29 hours')`, [lit]);
    twice = await shard(ann); await reflected(twice, 80); await reflected(twice, 50);
    await db.sql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', FIX), 'utf8'));
  });
  it('still reflecting that sun: the reflection starts over (a full 24 hours)', async () => {
    const e = await row(still); const now = await ep();
    expect(e.state.reflect.kind).toBe('sun');
    expect(Number(e.state.reflect.until) - now).toBeGreaterThan(23.9 * 3600);
  });
  it('over, nothing in the glass: a fresh sun reflection; two wasted → twice as long', async () => {
    const now = await ep();
    const o = await row(over);
    expect(o.state.reflect).toMatchObject({ kind: 'sun', dream: true, given: true });
    expect(Number(o.state.reflect.until) - now).toBeGreaterThan(23.9 * 3600);
    expect(o.state.r.zones).toEqual([]);
    const t = await row(twice);
    expect(Number(t.state.reflect.until) - now).toBeGreaterThan(47.9 * 3600);
    // and it's a working sun
    expect((await db.rpc(ann, 'enchant_get', { p_id: over })).reflected.can_ignite).toBe(true);
  });
  it('reflecting something else now: a sun waits among its reflections', async () => {
    const e = await row(other);
    expect(e.state.reflect.kind).toBe('genie');
    expect(e.state.options).toEqual([{ kind: 'sun', dream: true, given: true }]);
    const r = await act(ann, other, 'step', { i: 0 });
    expect(r.reflect_kind).toBe('sun');
  });
  it('a sun that did light is left alone; the owner is told; it happens once', async () => {
    expect((await row(lit)).state.reflect ?? null).toBeNull();
    const notes = await db.sql(`select data from player_notifications where player_id = $1 and data ->> 'sub' = 'mirror_sun_back'`, [ann]);
    expect(notes).toHaveLength(4);
    expect(notes.map((n: any) => n.data.extended).sort()).toEqual([false, true, true, true]);
    const before = await row(still);
    await db.sql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', FIX), 'utf8'));
    expect((await row(still)).state.reflect.until).toEqual(before.state.reflect.until);
    expect(await db.sql(`select 1 from player_notifications where player_id = $1 and data ->> 'sub' = 'mirror_sun_back'`, [ann])).toHaveLength(4);
  });
});
