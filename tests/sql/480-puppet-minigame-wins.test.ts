// 🎭 The Puppeteer brings in that minigame's wins (Nov 17, 2026): a level it clears pays as a win of the plot's
// minigame — the same sum a win by hand pays there (an ultra's Ink multiplier and all), at the puppet's cut — as
// minigame Ink, on the live feed, under the same Earning switches; and when it's held, the curtain call says so.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, cat: string;
const O = { gx: 812_300, gy: 1_571_200 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `pmw-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claimAt(uid, O.gx + (spot++) * 3, O.gy + (uid === ann ? 0 : uid === bob ? 30 : 60));
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
/** a Block Splash plot of theirs, of a rarity */
async function gamePlot(uid: string, dx: number, dy: number, rarity = 'common') {
  const r = await claimAt(uid, O.gx + dx, O.gy + dy);
  await db.sql(`update world_plots set plot_type = 'stencil', rarity = $3 where gx = $1 and gy = $2`, [r.gx, r.gy, rarity]);
  return { gx: r.gx as number, gy: r.gy as number };
}
/** bring the running act's curtain down now, as a cleared level */
const clear = (id: string) => db.sql(`update puppet_runs set due_at = now() - interval '1 second', plan = plan || jsonb_build_object('passed', true, 'rounds_passed', rounds)
  where enchant_id = $1 and finished_at is null`, [id]);
const lastCall = async (uid: string, id: string) => {
  await clear(id);
  const r = await act(uid, id, 'tick');
  return r.view.curtain_calls[0];
};
const winOf = async (uid: string, p: { gx: number; gy: number }, level: number) =>
  (await db.sql(`select private.minigame_win_ink($1, 'blocksplash', $2, 5, 5, $3, $4) w`, [uid, level, p.gx, p.gy]))[0].w;
const ledger = (uid: string) => db.sql(`select delta::int, reason, ref_type from resource_ledger where player_id = $1 and resource = 'ink' order by id desc limit 5`, [uid]);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('pmw_ann'); bob = await db.newPlayer('pmw_bob'); cat = await db.newPlayer('pmw_cat');
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 300_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
});
afterAll(() => db.close());

describe('🎭 a puppet’s win is that minigame’s win', () => {
  let pup: string; let ultra: { gx: number; gy: number };
  beforeAll(async () => {
    pup = await enchant(ann, 'puppeteer');
    ultra = await gamePlot(ann, 200, 5, 'crown_country'); // an ultra: ×10 Ink
    await act(ann, pup, 'show', { plots: [[ultra.gx, ultra.gy]], encore: true });
  });

  it('a win by hand and the puppet’s value of it are the same sum, on the same plot', async () => {
    // an ultra plot played by hand at level 1 (someone else's, so this win's feed line doesn't stand in the puppet's way)
    const twin = await gamePlot(bob, 204, 5, 'crown_country');
    const s = await db.rpc(bob, 'start_minigame', { p_game: 'blocksplash', p_level: 1, p_gx: twin.gx, p_gy: twin.gy });
    const real = await db.rpc({ role: 'service_role' }, 'svc_finish_minigame', {
      p_session_id: s.session_id, p_result: { valid: true, passed: true, score: 400, stars: 3, flags: [], suspicious: false, min_duration_ms: 0 },
    });
    const w = await winOf(bob, twin, 1);
    expect(Number(real.rewards.ink)).toBeGreaterThan(0);
    expect(Number(w.ink)).toBe(Number(real.rewards.ink));
    expect(Number(w.multiplier)).toBe(Number(real.rewards.multiplier));
    expect(Number(w.rarity)).toBe(10);
  });

  it('on an ultra plot: the ultra’s multiplier applies, the puppet’s cut is paid as minigame Ink', async () => {
    const w = await winOf(ann, ultra, 1);
    const call = await lastCall(ann, pup);
    expect(call.result).toMatchObject({ passed: true, level: 1, held: null });
    expect(Number(call.result.win)).toBe(Number(w.ink));
    expect(Number(call.result.mult)).toBeGreaterThanOrEqual(10);
    expect(Number(call.result.rarity)).toBe(10);
    expect(Number(call.result.ink)).toBe(Math.floor(Number(w.ink) * 0.75));
    const l = await ledger(ann);
    expect(l[0]).toMatchObject({ delta: Number(call.result.ink), reason: 'minigame', ref_type: 'puppet_run' });
    // vs. the same level on a plain plot: ten times the Ink
    const plain = await gamePlot(ann, 208, 5, 'common');
    expect(Number(w.ink)).toBe(Number((await winOf(ann, plain, 1)).ink) * 10);
  });

  it('the live feed says it: “@ann’s 🎭 puppet cleared Block Splash level 1 · +N Ink” on an ultra', async () => {
    const f = (await db.sql(`select data from feed_events where player_id = $1 and kind = 'minigame' order by id desc limit 1`, [ann]))[0]?.data;
    expect(f).toMatchObject({ game: 'blocksplash', level: 1, puppet: true, rarity: 'crown_country' });
    expect(Number(f.ink)).toBeGreaterThan(0);
    const seen = await db.rpc(cat, 'feed_recent', { p_after_id: null, p_before_id: null, p_limit: 40 });
    expect(seen.some((e: any) => e.kind === 'minigame' && e.data.puppet && e.player.username === 'pmw_ann')).toBe(true);
    // (one minigame line every few minutes each, as by hand)
    await lastCall(ann, pup);
    expect((await db.sql(`select count(*)::int n from feed_events where player_id = $1 and kind = 'minigame' and data ->> 'puppet' = 'true'`, [ann]))[0].n).toBe(1);
  });

  it('the chronicle and the Puppeteer’s totals carry it', async () => {
    const ev = (await db.sql(`select data from enchant_events where enchant_id = $1 and kind = 'auto_show' order by id desc limit 1`, [pup]))[0].data;
    expect(Number(ev.ink)).toBeGreaterThan(0);
    expect(Number(ev.mult)).toBeGreaterThanOrEqual(10);
    const st = (await db.sql(`select stats from enchantments where id = $1`, [pup]))[0].stats;
    expect(Number(st.auto_ink)).toBeGreaterThan(0);
  });

  it('switched off — that minigame, minigames, or the Puppeteer — it pays nothing and says so', async () => {
    for (const key of ['minigame:blocksplash', 'reason:minigame', 'ench:puppeteer']) {
      await db.sql(`insert into private.earn_switches (key) values ($1)`, [key]);
      const before = (await ledger(ann))[0];
      const call = await lastCall(ann, pup);
      expect(call.result).toMatchObject({ passed: true, ink: 0, held: 'paused' });
      expect(Number(call.result.win)).toBeGreaterThan(0);
      expect((await ledger(ann))[0]).toEqual(before);
      await db.sql(`delete from private.earn_switches where key = $1`, [key]);
    }
    // a switch for another minigame leaves it alone
    await db.sql(`insert into private.earn_switches (key) values ('minigame:paintpop')`);
    expect((await lastCall(ann, pup)).result).toMatchObject({ passed: true, held: null });
    await db.sql(`delete from private.earn_switches where key = 'minigame:paintpop'`);
    // the rarity multiplier alone switched off: the win is a plain plot's
    await db.sql(`insert into private.earn_switches (key) values ('mult:rarity')`);
    const c = await lastCall(ann, pup);
    expect(Number(c.result.rarity)).toBe(1);
    await db.sql(`delete from private.earn_switches where key = 'mult:rarity'`);
  });

  it('a player whose Ink is on hold: held, and said', async () => {
    await db.sql(`insert into private.player_ink_modes (player_id, mode) values ($1, 'off') on conflict (player_id) do update set mode = 'off'`, [ann]);
    const call = await lastCall(ann, pup);
    expect(call.result).toMatchObject({ passed: true, ink: 0, held: 'ink_held' });
    await db.sql(`delete from private.player_ink_modes where player_id = $1`, [ann]);
  });
});

describe('🎭 on someone else’s plot', () => {
  it('as by hand, their rarity doesn’t multiply your win — and they’re tipped', async () => {
    const pz = await enchant(cat, 'puppeteer');
    const theirs = await gamePlot(bob, 260, 5, 'crown_country');
    await act(cat, pz, 'show', { plots: [[theirs.gx, theirs.gy]] });
    const bobBefore = Number((await db.sql(`select coalesce(sum(delta), 0) n from resource_ledger where player_id = $1 and resource = 'ink'`, [bob]))[0].n);
    const call = await lastCall(cat, pz);
    expect(call.result).toMatchObject({ passed: true, rarity: 1 });
    expect(Number(call.result.ink)).toBe(Math.floor(Number(call.result.win) * 0.75));
    expect(Number((await db.sql(`select coalesce(sum(delta), 0) n from resource_ledger where player_id = $1 and resource = 'ink'`, [bob]))[0].n)).toBeGreaterThan(bobBefore);
    const f = (await db.sql(`select data from feed_events where player_id = $1 and kind = 'minigame' order by id desc limit 1`, [cat]))[0]?.data;
    expect(f).toMatchObject({ puppet: true, owner: 'pmw_bob' });
  });
});
