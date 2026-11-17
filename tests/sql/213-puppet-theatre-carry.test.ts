// Enchantments, part 13: the Puppeteer's theatre — it plays plots' minigames by itself, run after run, while you watch
// (or don't) — and the Origami Pocket's carry: a folded plot's powers work from wherever you are.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, cellCenter, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, cat: string;
const O = { gx: 799_700, gy: 1_566_300 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `pt-${++k}-00000000` });
const claim = (uid: string, dx: number, dy = 0) => claimAt(uid, O.gx + dx, O.gy + dy);
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claim(uid, (spot++) * 3, uid === ann ? 0 : uid === bob ? 30 : 60);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const setStars = (id: string, n: number) => db.sql(`update enchantments set stars = $2, star_fill = 0 where id = $1`, [id, n]);
const setState = (id: string, patch: Record<string, unknown>) => db.sql(`update enchantments set state = state || $2::jsonb where id = $1`, [id, JSON.stringify(patch)]);
const now = () => Date.now() / 1000;
/** a plot of theirs with a minigame on it */
async function gamePlot(uid: string, dx: number, dy: number, type = 'stencil') {
  const r = await claim(uid, dx, dy);
  await db.sql(`update world_plots set plot_type = $3, rarity = 'common' where gx = $1 and gy = $2`, [r.gx, r.gy, type]);
  return { gx: r.gx as number, gy: r.gy as number };
}
/** bring every running act's curtain down now, the way the plan says (or forced to a pass / a fall) */
const due = (id: string, passed?: boolean) => db.sql(`update puppet_runs set due_at = now() - interval '1 second'${passed === undefined ? '' : `, plan = plan || jsonb_build_object('passed', ${passed}, 'rounds_passed', case when ${passed} then rounds else 1 end)`}
  where enchant_id = $1 and finished_at is null`, [id]);
const runs = async (id: string) => db.sql(`select * from puppet_runs where enchant_id = $1 order by started_at, slot`, [id]);
const inkOf = async (uid: string) => Number((await db.sql(`select coalesce(sum(delta), 0) n from resource_ledger where player_id = $1 and resource = 'ink'`, [uid]))[0].n);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('pt_ann'); bob = await db.newPlayer('pt_bob'); cat = await db.newPlayer('pt_cat');
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 300_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
});
afterAll(() => db.close());

describe('🎭 the Puppeteer plays by itself', () => {
  let pup: string; let mine: { gx: number; gy: number }; let theirs: { gx: number; gy: number };
  beforeAll(async () => {
    pup = await enchant(ann, 'puppeteer');
    mine = await gamePlot(ann, 200, 5);
    theirs = await gamePlot(bob, 210, 5);
  });

  it('a show on your own plot: a string, a level, a run on stage', async () => {
    const v0 = (await get(ann, pup)).view;
    expect(v0).toMatchObject({ playlist_max: 3, slots: 1, pay_pct: 75, range_m: 25000 });
    expect(v0.own_plots.find((p: any) => p.gx === mine.gx)).toMatchObject({ game: 'blocksplash', next: 1 });
    const r = await act(ann, pup, 'show', { plots: [[mine.gx, mine.gy]], encore: true });
    expect(r.result).toMatchObject({ show: true, tick: { started: 1 } });
    expect(r.view.strings).toBe(v0.strings - 1);
    expect(r.view.runs).toHaveLength(1);
    expect(r.view.runs[0]).toMatchObject({ gx: mine.gx, gy: mine.gy, game: 'blocksplash', level: 1, own: true, rounds: 5, finished: false });
    expect(r.view.runs[0].seed).toBeGreaterThan(0);
    expect(r.view.runs[0].secs.length).toBeGreaterThan(0);
    // (paced like the game's own solver on the stage: a Block Splash round takes as long as its solver does)
    expect(r.view.runs[0].secs.every((x: number) => x >= 4.7 && x <= 5.6)).toBe(true);
    expect(r.view.runs[0].due_at - r.view.runs[0].started_at).toBeLessThan(32);
    expect(r.view.show).toMatchObject({ on: true, encore: true });
    expect(r.view.attention).toMatch(/show is on/);
  });

  it('the curtain falls: a cleared level pays 75%, the plot climbs, and the encore climbs on', async () => {
    const before = await inkOf(ann);
    const want = Math.floor(Number((await db.sql(`select private.pup_level_ink('blocksplash', 1, 5, $1, $2, $3) n`, [mine.gx, mine.gy, ann]))[0].n) * 0.75);
    await due(pup, true);
    const r = await act(ann, pup, 'tick');
    expect(r.result).toMatchObject({ finished: 1, started: 1 });
    const call = r.view.curtain_calls[0];
    expect(call.result).toMatchObject({ passed: true, level: 1 });
    expect(Number(call.result.ink)).toBeGreaterThanOrEqual(want);
    expect(await inkOf(ann)).toBeGreaterThan(before);
    expect((await db.sql(`select highest_level from plot_game_progress where gx = $1 and gy = $2 and player_id = $3`, [mine.gx, mine.gy, ann]))[0].highest_level).toBe(1);
    expect(r.view.runs[0]).toMatchObject({ level: 2, gx: mine.gx });
    // (the same string plays on: no new string spent, one level cleared on it)
    expect(r.view.strings).toBe((await get(ann, pup)).view.strings);
    expect(r.view.show.str[0]).toMatchObject({ clears: 1, tangles: 0, gx: mine.gx });
    expect(r.view.auto_levels).toBe(1);
    expect((await db.sql(`select count(*)::int n from player_achievements where player_id = $1 and achievement_key = 'pp_auto_1'`, [ann]))[0].n).toBe(1);
    // a fall: no Ink, and the plot stays where it was
    await due(pup, false);
    const f = await act(ann, pup, 'tick');
    expect(f.view.curtain_calls[0].result).toMatchObject({ passed: false, ink: 0, level: 2 });
    expect((await db.sql(`select highest_level from plot_game_progress where gx = $1 and gy = $2 and player_id = $3`, [mine.gx, mine.gy, ann]))[0].highest_level).toBe(1);
    // the chronicle: the show going on, then each curtain call (not every curtain rising)
    const ev = (await db.sql(`select kind, data from enchant_events where enchant_id = $1 order by id`, [pup])).map((x: any) => x.kind);
    expect(ev.filter((x: string) => x === 'show_on')).toHaveLength(1);
    expect(ev.filter((x: string) => x === 'string_on')).toHaveLength(1);
    expect(ev.filter((x: string) => x === 'auto_show')).toHaveLength(2);
    expect(f.view.show.str[0]).toMatchObject({ clears: 1, tangles: 1 });
    expect(ev).not.toContain('curtain');
  });

  it('a string plays through 10 levels by itself (and snaps at 3 tangles); strings stack to 10', async () => {
    const pz = await enchant(ann, 'puppeteer');
    const a = await gamePlot(ann, 280, 5);
    expect((await get(ann, pz)).view).toMatchObject({ max: 10, per_string: 10, snaps_at: 3 });
    await setState(pz, { strings: 2, string_at: now() });
    await act(ann, pz, 'show', { plots: [[a.gx, a.gy]] });
    for (let i = 1; i <= 10; i++) { await due(pz, true); await act(ann, pz, 'tick'); }
    let v = (await get(ann, pz)).view;
    // ten levels cleared on one string — the eleventh act is the next string
    expect((await db.sql(`select coalesce(max(highest_level), 0) n from plot_game_progress where gx = $1 and gy = $2 and player_id = $3`, [a.gx, a.gy, ann]))[0].n).toBe(10);
    expect(v.strings).toBe(0);
    expect(v.runs[0]).toMatchObject({ level: 11 });
    expect(v.show.str[0]).toMatchObject({ clears: 0, tangles: 0, n: 1 });
    expect((await row(pz)).stats.strings_played).toBe(1);
    // three tangles and the string snaps — no strings left, so the show waits
    for (let i = 1; i <= 3; i++) { await due(pz, false); await act(ann, pz, 'tick'); }
    v = (await get(ann, pz)).view;
    expect(v.runs).toHaveLength(0);
    expect(v.show.waiting).toBe('no_strings');
    const done = (await db.sql(`select data from enchant_events where enchant_id = $1 and kind = 'string_done' order by id`, [pz])).map((x: any) => x.data);
    expect(done).toEqual([expect.objectContaining({ clears: 10, snapped: false }), expect.objectContaining({ clears: 0, tangles: 3, snapped: true })]);
    // a stopped show keeps the string in hand for next time
    await setState(pz, { strings: 1, string_at: now() });
    await act(ann, pz, 'tick');
    await due(pz, true); await act(ann, pz, 'tick');
    await act(ann, pz, 'stop');
    await db.sql(`update puppet_runs set finished_at = now(), result = '{"passed": true}' where enchant_id = $1 and finished_at is null`, [pz]);
    const again = await act(ann, pz, 'show', { plots: [[a.gx, a.gy]] });
    expect(again.view.strings).toBe(0);
    expect(again.view.runs).toHaveLength(1);
    expect(again.view.show.str[0].clears).toBeGreaterThanOrEqual(1);
  });

  it('someone else’s plot: the puppet’s own ladder there, theirs never moves, and they’re tipped and told', async () => {
    await act(ann, pup, 'stop');
    await db.sql(`update puppet_runs set finished_at = now() where enchant_id = $1 and finished_at is null`, [pup]);
    await setState(pup, { strings: 3, string_at: now() });
    const bobBefore = await inkOf(bob);
    const r = await act(ann, pup, 'show', { plots: [[theirs.gx, theirs.gy]] });
    expect(r.view.runs[0]).toMatchObject({ own: false, level: 1, owner_name: 'pt_bob' });
    await due(pup, true);
    await act(ann, pup, 'tick');
    expect((await row(pup)).stats.ladder[`${theirs.gx}:${theirs.gy}`]).toBe(1);
    expect((await db.sql(`select count(*)::int n from plot_game_progress where gx = $1 and gy = $2`, [theirs.gx, theirs.gy]))[0].n).toBe(0);
    expect(await inkOf(bob)).toBeGreaterThan(bobBefore);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'puppet_auto'`, [bob]))[0].n).toBe(1);
    expect((await runs(pup)).at(-1)).toMatchObject({ level: 2, own: false });
  });

  it('reach: 25 km (anywhere at ★2); playlists of 3; no strings, no show', async () => {
    await act(ann, pup, 'stop');
    await db.sql(`update puppet_runs set finished_at = now() where enchant_id = $1 and finished_at is null`, [pup]);
    const far = await gamePlot(bob, 40_000, 40_000);
    await expectError(act(ann, pup, 'show', { plots: [[far.gx, far.gy]] }), 'out_of_range');
    // a plot picked on the map: the theatre asks first
    expect((await act(ann, pup, 'peek', { gx: far.gx, gy: far.gy })).result).toMatchObject({ why: 'out_of_range', owner_name: 'pt_bob', game: 'blocksplash', own: false });
    expect((await act(ann, pup, 'peek', { gx: theirs.gx, gy: theirs.gy })).result).toMatchObject({ why: null, owner_name: 'pt_bob', next: 2 }); // (its ladder there climbed in the last test)
    expect((await act(ann, pup, 'peek', { gx: O.gx - 9000, gy: O.gy })).result).toMatchObject({ why: 'not_found' });
    await setStars(pup, 2);
    expect((await get(ann, pup)).view.range_m).toBeNull();
    expect((await act(ann, pup, 'peek', { gx: far.gx, gy: far.gy })).result.why).toBeNull();
    const ps = [mine, theirs, await gamePlot(ann, 220, 5), await gamePlot(ann, 230, 5)];
    await expectError(act(ann, pup, 'show', { plots: ps.map((p) => [p.gx, p.gy]) }), 'playlist_full');
    await setState(pup, { strings: 0, string_at: now() });
    const r = await act(ann, pup, 'show', { plots: [[far.gx, far.gy]] });
    expect(r.result.tick).toMatchObject({ started: 0, waiting: 'no_strings' });
    expect(r.view.show.waiting).toBe('no_strings');
    expect(r.view.playlist).toEqual([expect.objectContaining({ gx: far.gx, gy: far.gy, owner_name: 'pt_bob', game: 'blocksplash', why: null })]);
    await setStars(pup, 0);
  });

  it('★4 Troupe: two puppets at once; ★5 Opening Night pays in full', async () => {
    const p2 = await enchant(ann, 'puppeteer'); await setStars(p2, 4);
    const a = await gamePlot(ann, 240, 5, 'pigment'), b = await gamePlot(ann, 250, 5, 'lumina');
    await setState(p2, { strings: 6, string_at: now() });
    await db.sql(`update enchantments set state = state || jsonb_build_object('grand_day', private.today()::text) where id = $1`, [p2]);
    const r = await act(ann, p2, 'show', { plots: [[a.gx, a.gy], [b.gx, b.gy]] });
    expect(r.view.slots).toBe(2);
    expect(r.view.runs).toHaveLength(2);
    expect(new Set(r.view.runs.map((x: any) => `${x.gx}:${x.gy}`)).size).toBe(2);
    // the same level at ★4 and at ★5
    const lvl = (await db.sql(`select private.pup_level_ink('colorburst', 1, 5, $1, $2, $3) n`, [a.gx, a.gy, ann]))[0].n;
    await due(p2, true);
    await act(ann, p2, 'tick');
    const four = (await db.sql(`select result from puppet_runs where enchant_id = $1 and gx = $2 and level = 1 and finished_at is not null`, [p2, a.gx]))[0].result;
    expect(Number(four.ink)).toBeGreaterThanOrEqual(Math.floor(Number(lvl) * 0.75));
    expect(Number(four.ink)).toBeLessThan(Math.floor(Number(lvl) * 1.4 * 1.0) + 1);
    await setStars(p2, 5);
    await due(p2, true);
    await act(ann, p2, 'tick');
    const lvl2 = (await db.sql(`select private.pup_level_ink('colorburst', 2, 5, $1, $2, $3) n`, [a.gx, a.gy, ann]))[0].n;
    const five = (await db.sql(`select result from puppet_runs where enchant_id = $1 and gx = $2 and level = 2 and finished_at is not null`, [p2, a.gx]))[0].result;
    expect(Number(five.ink)).toBeGreaterThanOrEqual(Math.floor(Number(lvl2)));
    expect((await get(ann, p2)).view.pay_pct).toBe(100);
  });

  it('★3 Grand Show: the day’s first acts are free and pay ×3', async () => {
    const p3 = await enchant(ann, 'puppeteer'); await setStars(p3, 3);
    const a = await gamePlot(ann, 260, 5, 'graphite');
    await setState(p3, { strings: 1, string_at: now() });
    const r = await act(ann, p3, 'show', { plots: [[a.gx, a.gy]] });
    expect(r.view.runs[0].grand).toBe(true);
    expect(r.view.strings).toBe(1);
    const lvl = (await db.sql(`select private.pup_level_ink('tracecraft', 1, 5, $1, $2, $3) n`, [a.gx, a.gy, ann]))[0].n;
    await due(p3, true);
    const t = await act(ann, p3, 'tick');
    expect(Number(t.view.curtain_calls[0].result.ink)).toBeGreaterThanOrEqual(Math.floor(Number(lvl) * 0.75 * 3));
    expect(t.view.medley.left).toBe(1);
  });

  it('the heartbeat plays on while you’re away — and the little stage sees it', async () => {
    const p4 = await enchant(cat, 'puppeteer');
    const a = await gamePlot(cat, 270, 65, 'fresco');
    await setState(p4, { strings: 3, string_at: now() });
    await act(cat, p4, 'show', { plots: [[a.gx, a.gy]] });
    const live = await db.rpc(cat, 'puppet_live', {});
    expect(live.shows).toHaveLength(1);
    expect(live.shows[0].runs).toHaveLength(1);
    await due(p4, true);
    await db.sql(`select private.pup_tick_all()`);
    expect((await runs(p4)).filter((x: any) => x.finished_at)).toHaveLength(1);
    expect((await runs(p4)).filter((x: any) => !x.finished_at)).toHaveLength(1);
    // a day after you were last around, the show closes by itself
    await db.sql(`update players set last_active_at = now() - interval '2 days' where id = $1`, [cat]);
    await due(p4);
    await db.sql(`select private.pup_tick_all()`);
    expect((await row(p4)).state.show.on).toBe(false);
    expect((await row(p4)).state.show_end).toBe('away');
    await db.sql(`update players set last_active_at = now() where id = $1`, [cat]);
  });

  it('a Mirror Shard reflecting a Puppeteer runs a show too — and stays a Shard', async () => {
    const s = await enchant(bob, 'shard');
    const b2 = await gamePlot(bob, 300, 35);
    await db.sql(`update enchantments set state = state || jsonb_build_object('reflect', jsonb_build_object('kind', 'puppeteer', 'dream', true, 'from', extract(epoch from now()), 'until', extract(epoch from now()) + 3600),
      'r', private.ench_init('puppeteer', now()), 'cracks', 2) where id = $1`, [s]);
    const r = await act(bob, s, 'show', { plots: [[b2.gx, b2.gy]] });
    expect(r.reflect_kind).toBe('puppeteer');
    expect(r.reflected.runs).toHaveLength(1);
    let st = (await row(s)).state;
    expect(st.reflect.kind).toBe('puppeteer'); expect(st.cracks).toBe(2);
    expect(st.r.show.on).toBe(true); expect(st.show).toBeUndefined();
    // the heartbeat plays it on, level after level, on the reflection
    await due(s, true);
    await db.sql(`select private.pup_tick_all()`);
    st = (await row(s)).state;
    expect(st.reflect.kind).toBe('puppeteer');
    expect(st.r.show.str[0]).toMatchObject({ clears: 1 });
    expect(st.show).toBeUndefined();
    expect((await runs(s)).filter((x: any) => !x.finished_at)).toMatchObject([{ level: 2 }]);
    expect((await db.rpc(bob, 'puppet_live', {})).shows.some((x: any) => x.id === s)).toBe(true);
  });
});

describe('🦢 carried: a folded plot works from where you are', () => {
  let ori: string;
  const placeAt = (uid: string, gx: number, gy: number) => db.placeAt(uid, gx, gy);
  // (level 10: three folds at a time)
  const folds = (id: string) => db.sql(`update enchantments set level = 10, state = state || jsonb_build_object('folds', 3, 'fold_at', extract(epoch from now())) where id = $1`, [id]);
  // (★1: three folded plots in the pocket)
  beforeAll(async () => { ori = await enchant(ann, 'origami'); await folds(ori); await setStars(ori, 1); });

  it('a carried Kraken counts the neighbours around you', async () => {
    const kr = await claim(ann, 500, 40);
    await db.sql(`update world_plots set rarity = 'kraken' where gx = $1 and gy = $2`, [kr.gx, kr.gy]);
    const at = (await db.sql(`select private.kraken_mult(w) m from world_plots w where gx = $1 and gy = $2`, [kr.gx, kr.gy]))[0].m;
    await act(ann, ori, 'fold', { gx: kr.gx, gy: kr.gy });
    // somewhere busy: other players all round
    const busy = { gx: O.gx + 3000, gy: O.gy + 3000 };
    for (let i = 0; i < 6; i++) await claimAt(bob, busy.gx + 2 + i, busy.gy + 1);
    await placeAt(ann, busy.gx, busy.gy);
    expect((await db.sql(`select private.carry_cell($1, $2) c`, [kr.gx, kr.gy]))[0].c).toEqual([busy.gx, busy.gy]);
    const there = (await db.sql(`select private.kraken_mult(w) m from world_plots w where gx = $1 and gy = $2`, [kr.gx, kr.gy]))[0].m;
    expect(Number(there)).toBeGreaterThan(Number(at));
    const v = (await get(ann, ori)).view;
    expect(v.carry.live).toBe(true);
    expect(v.carry.plots.find((p: any) => p.gx === kr.gx).power).toMatchObject({ what: 'kraken' });
    // the map shows it riding along
    const m = await db.rpc(ann, 'enchant_map2', { p_min_gx: busy.gx - 50, p_min_gy: busy.gy - 50, p_max_gx: busy.gx + 50, p_max_gy: busy.gy + 50 });
    expect(m.carried.find((c: any) => c.gx === kr.gx).at).toEqual([busy.gx, busy.gy]);
  });

  it('only on real GPS, and only while it’s fresh (15 minutes; an hour at ★3)', async () => {
    const kr = (await db.sql(`select gx, gy from world_plots where folded_by = $1 limit 1`, [ori]))[0];
    await db.sql(`update explorers set gps_at = now() - interval '30 minutes' where player_id = $1`, [ann]);
    expect((await db.sql(`select private.carry_cell($1, $2) c`, [kr.gx, kr.gy]))[0].c).toBeNull();
    await setStars(ori, 3);
    expect((await db.sql(`select private.carry_cell($1, $2) c`, [kr.gx, kr.gy]))[0].c).not.toBeNull();
    await db.sql(`update explorers set mode = 'manual' where player_id = $1`, [ann]);
    expect((await db.sql(`select private.carry_cell($1, $2) c`, [kr.gx, kr.gy]))[0].c).toBeNull();
    await setStars(ori, 1);
  });

  it('a carried Glacier freezes around you, not where it was', async () => {
    const gl = await claim(ann, 520, 40);
    await db.sql(`update world_plots set rarity = 'glacier' where gx = $1 and gy = $2`, [gl.gx, gl.gy]);
    await folds(ori);
    await db.sql(`insert into rarity_powers (gx, gy, owner_id, rarity, state, since) values ($1, $2, $3, 'glacier', '{}'::jsonb, now()) on conflict (gx, gy) do nothing`, [gl.gx, gl.gy, ann]);
    expect((await db.sql(`select private.rx_frozen_at($1, $2) f`, [gl.gx + 1, gl.gy]))[0].f).toBe(true);
    await act(ann, ori, 'fold', { gx: gl.gx, gy: gl.gy });
    const far = { gx: O.gx + 6000, gy: O.gy + 6000 };
    await placeAt(ann, far.gx, far.gy);
    expect((await db.sql(`select private.rx_frozen_at($1, $2) f`, [far.gx + 2, far.gy - 1]))[0].f).toBe(true);
    expect((await db.sql(`select private.rx_frozen_at($1, $2) f`, [gl.gx + 1, gl.gy]))[0].f).toBe(false);
  });

  it('an enchanted plot folds from the start, and its creature works from where you are', async () => {
    await folds(ori);
    await db.sql(`update world_plots set folded_at = null, folded_by = null where folded_by = $1`, [ori]);
    const g = await enchant(ann, 'goose');
    const ge = await row(g);
    const r = await act(ann, ori, 'fold', { gx: ge.gx, gy: ge.gy });
    expect(r.result.folded).toMatchObject({ rarity: 'enchanted', kind: 'goose' });
    const here = { gx: O.gx + 7000, gy: O.gy + 7000 };
    await placeAt(ann, here.gx, here.gy);
    expect((await get(ann, g)).view.carried_at).toEqual([here.gx, here.gy]);
  });

  it('the distance you carry it counts (and a Kraken on the walk)', async () => {
    const kr = await claim(ann, 540, 40);
    await db.sql(`update world_plots set rarity = 'kraken' where gx = $1 and gy = $2`, [kr.gx, kr.gy]);
    await folds(ori);
    await act(ann, ori, 'fold', { gx: kr.gx, gy: kr.gy });
    const start = { gx: O.gx + 8000, gy: O.gy + 8000 };
    await placeAt(ann, start.gx, start.gy);
    for (let i = 1; i <= 3; i++) {
      await db.sql(`update explorers set fixed_at = now() - interval '5 minutes', gps_at = now() - interval '5 minutes' where player_id = $1`, [ann]);
      const c = cellCenter(start.gx + i * 60, start.gy);
      await db.rpc(ann, 'report_position', { p_lng: c.lng, p_lat: c.lat, p_accuracy_m: 8 });
    }
    const st = (await row(ori)).stats;
    expect(Number(st.carry_km)).toBeGreaterThan(0.3);
    expect(st.kraken_carry).toBe(1);
  });

  it('★5 Grand Fold: a whole merged canvas folds and lands somewhere new, every plot in its place', async () => {
    const o5 = await enchant(ann, 'origami');
    await folds(o5);
    const a = await claim(ann, 600, 40), b = await claim(ann, 601, 40);
    const cells = [[a.gx, a.gy], [b.gx, b.gy]];
    await db.sql(`delete from canvas_group_members where (gx, gy) in (($1::int, $2::int), ($3::int, $4::int))`, [a.gx, a.gy, b.gx, b.gy]);
    await db.sql(`select private.create_group_with_cells($1, $2::jsonb, private.empty_manifest(), 'Two', 'initial')`, [ann, JSON.stringify(cells)]);
    const gid = (await db.sql(`select group_id from canvas_group_members where gx = $1 and gy = $2`, [a.gx, a.gy]))[0].group_id;
    await db.sql(`update canvas_groups set plot_count = 2 where id = $1`, [gid]);
    await expectError(act(ann, o5, 'fold', { gx: a.gx, gy: a.gy }), 'merged');
    await setStars(o5, 5);
    await act(ann, o5, 'fold', { gx: a.gx, gy: a.gy });
    expect((await db.sql(`select count(*)::int n from world_plots where folded_by = $1`, [o5]))[0].n).toBe(2);
    expect((await get(ann, o5)).view.pocket).toBe(1);
    const to = { gx: O.gx + 9000, gy: O.gy + 9000 };
    await db.sql(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
    const r = await act(ann, o5, 'unfold', { gx: a.gx, gy: a.gy, to_gx: to.gx, to_gy: to.gy });
    expect(r.result).toMatchObject({ canvas: true, plots: 2 });
    const moved = await db.sql(`select gx, gy, owner_id from world_plots where (gx, gy) in (($1::int, $2::int), ($3::int, $4::int))`, [to.gx, to.gy, to.gx + 1, to.gy]);
    expect(moved.filter((x: any) => x.owner_id === ann)).toHaveLength(2);
    expect((await db.sql(`select count(*)::int n from canvas_group_members where group_id = $1 and gx between $2 and $3`, [gid, to.gx, to.gx + 1]))[0].n).toBe(2);
    expect((await db.sql(`select owner_id from world_plots where gx = $1 and gy = $2`, [a.gx, a.gy]))[0].owner_id).toBeNull();
    expect(Number((await row(o5)).stats.grand_folds)).toBe(1);
  });
});
