// Explorer's Eyes: the sky treasures. A few drift through your sky every window; catching one pays a little (Ink,
// sometimes Luck, rarely a roll ticket), once each, only from this window or the one just gone, at most a day's cap;
// the whole thing switches off from game_config 'eyes'.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bo: string;
const cfg = (sky: Record<string, unknown>, top: Record<string, unknown> = {}) =>
  db.sql(`update game_config set value = (value || $2::jsonb) || jsonb_build_object('sky', (value -> 'sky') || $1::jsonb) where key = 'eyes'`, [JSON.stringify(sky), JSON.stringify(top)]);
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('eyes_ann');
  bo = await db.newPlayer('eyes_bo');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = any($1)`, [[ann, bo]]);
});
afterAll(() => db.close());

describe('👁️ the sky treasures', () => {
  it('a few drift through your sky each window, each with its own seed', async () => {
    const s = await db.rpc(ann, 'eyes_sky');
    expect(s).toMatchObject({ enabled: true, today: 0, cap: 12, window_s: 900 });
    expect(s.drops.map((d: { i: number }) => d.i)).toEqual([0, 1, 2]);
    for (const d of s.drops) { expect(d.seed).toBeGreaterThanOrEqual(0); expect(d.seed).toBeLessThan(1); }
    // someone else's sky has its own
    const b = await db.rpc(bo, 'eyes_sky');
    expect(b.win).toBe(s.win);
    expect(b.drops.map((d: { seed: number }) => d.seed)).not.toEqual(s.drops.map((d: { seed: number }) => d.seed));
  });

  it('catching one pays (Ink here), once; it leaves your sky', async () => {
    await cfg({ ticket_pct: 0, luck_pct: 0, ink_min: 5, ink_max: 5 });
    const s = await db.rpc(ann, 'eyes_sky');
    const before = await ink(ann);
    const r = await db.rpc(ann, 'eyes_catch', { p_win: s.win, p_i: 0 });
    expect(r).toMatchObject({ ink: 5, today: 1, cap: 12 });
    expect(r.balances).toBeTruthy();
    expect(await ink(ann)).toBe(before + 5);
    await expectError(db.rpc(ann, 'eyes_catch', { p_win: s.win, p_i: 0 }), 'gone');
    const after = await db.rpc(ann, 'eyes_sky');
    expect(after.drops.map((d: { i: number }) => d.i)).toEqual([1, 2]);
    expect(after.today).toBe(1);
    // it's in the ledger as a find from the sky (so the earning switch ref:eyes_sky covers it)
    const l = await db.sql(`select reason, ref_type from resource_ledger where player_id = $1 and resource = 'ink' order by id desc limit 1`, [ann]);
    expect(l[0]).toMatchObject({ reason: 'finds', ref_type: 'eyes_sky' });
  });

  it('only this window’s treasures (or the one just gone), and only real ones', async () => {
    const s = await db.rpc(ann, 'eyes_sky');
    await expectError(db.rpc(ann, 'eyes_catch', { p_win: s.win - 2, p_i: 1 }), 'gone');
    await expectError(db.rpc(ann, 'eyes_catch', { p_win: s.win + 1, p_i: 1 }), 'gone');
    await expectError(db.rpc(ann, 'eyes_catch', { p_win: s.win, p_i: 3 }), 'gone');
    await expectError(db.rpc(ann, 'eyes_catch', { p_win: s.win, p_i: -1 }), 'gone');
    // the window that just ended still counts (you were mid-tap)
    const r = await db.rpc(ann, 'eyes_catch', { p_win: s.win - 1, p_i: 2 });
    expect(r.ink).toBe(5);
  });

  it('sometimes Luck, rarely a Rare+ roll ticket', async () => {
    await cfg({ ticket_pct: 0, luck_pct: 100, luck: 3 });
    const s = await db.rpc(ann, 'eyes_sky');
    const luck0 = Number((await db.sql(`select coalesce((select luck from player_luck where player_id = $1), 0) l`, [ann]))[0].l);
    expect(await db.rpc(ann, 'eyes_catch', { p_win: s.win, p_i: 1 })).toMatchObject({ luck: 3 });
    expect(Number((await db.sql(`select luck from player_luck where player_id = $1`, [ann]))[0].luck)).toBe(luck0 + 3);
    await cfg({ ticket_pct: 100 });
    expect(await db.rpc(ann, 'eyes_catch', { p_win: s.win, p_i: 2 })).toMatchObject({ ticket: 'rare' });
    const t = await db.sql(`select min_rarity, source from roll_tickets where player_id = $1 and used_at is null`, [ann]);
    expect(t).toEqual(expect.arrayContaining([expect.objectContaining({ min_rarity: 'rare', source: 'eyes_sky' })]));
  });

  it('a day’s cap: then the sky is empty until tomorrow', async () => {
    await cfg({ ticket_pct: 0, luck_pct: 0, daily_cap: 5 });
    const s = await db.rpc(ann, 'eyes_sky');
    expect(s.today).toBe(4);
    expect(s.drops).toEqual([]); // (all three of this window caught)
    // a fresh window (here: shorter windows from now on): only as many as are left today
    await cfg({ window_min: 7 });
    const s2 = await db.rpc(ann, 'eyes_sky');
    expect(s2.window_s).toBe(420);
    expect(s2.drops.length).toBe(1);
    await db.rpc(ann, 'eyes_catch', { p_win: s2.win, p_i: s2.drops[0].i });
    expect((await db.rpc(ann, 'eyes_sky')).drops).toEqual([]);
    await expectError(db.rpc(ann, 'eyes_catch', { p_win: s2.win, p_i: 2 }), 'caught_enough');
  });

  it('switched off: no treasures, no catching', async () => {
    await cfg({}, { enabled: false });
    expect(await db.rpc(bo, 'eyes_sky')).toEqual({ enabled: false });
    await expectError(db.rpc(bo, 'eyes_catch', { p_win: 1, p_i: 0 }), 'eyes_off');
    await cfg({ enabled: false }, { enabled: true });
    expect(await db.rpc(bo, 'eyes_sky')).toEqual({ enabled: false });
    await cfg({ enabled: true });
    expect((await db.rpc(bo, 'eyes_sky')).enabled).toBe(true);
  });

  it('nobody can read or write the catches table directly', async () => {
    const c = (db as unknown as { admin: { query(q: string, p?: unknown[]): Promise<{ rows: any[] }> } }).admin;
    const asAnn = async (q: string, p: unknown[] = []) => {
      await c.query('begin');
      try {
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ann, role: 'authenticated' })]);
        await c.query('set local role authenticated');
        return (await c.query(q, p)).rows;
      } finally { await c.query('rollback'); }
    };
    // (reading: nothing comes back, or it's refused)
    const seen = await asAnn('select count(*)::int n from public.eyes_catches').then((r) => r[0].n, () => 0);
    expect(seen).toBe(0);
    await expect(asAnn(`insert into public.eyes_catches (player_id, win, i) values ($1, 1, 0)`, [ann])).rejects.toThrow();
  });
});
