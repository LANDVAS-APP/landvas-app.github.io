// Enchantments, part 5: ⭐ Stars. Pour a copy into an enchantment of the same kind (or three of other kinds, as Essence)
// and it earns a star: +10% Ink a star and a new power at each (45 in all).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string;
const O = { gx: 795_400, gy: 1_578_200 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `str-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claim(uid, (spot++) * 3, uid === ann ? 0 : 40);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const merge = (uid: string, target: string, copy: string | null) => db.rpc(uid, 'enchant_merge', { p_target: target, p_copy: copy });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const setStars = (id: string, n: number) => db.sql(`update enchantments set stars = $2, star_fill = 0 where id = $1`, [id, n]);
const st = async (id: string) => (await row(id)).state;
const tickets = async (uid: string, source: string) => (await db.sql(`select min_rarity from roll_tickets where player_id = $1 and source = $2 order by created_at`, [uid, source])).map((r: any) => r.min_rarity);
const essence = async (uid: string) => Number((await db.sql(`select coalesce((select essence from enchant_essence where player_id = $1), 0) n`, [uid]))[0].n);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('str_ann'); bob = await db.newPlayer('str_bob');
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 400_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}'::jsonb where key = 'enchantments'`);
});
afterAll(() => db.close());

describe('⭐ merging copies', () => {
  it('pours a copy of the same kind in: ★1, its XP carried over, its plot kept and rolled fresh', async () => {
    const a = await enchant(ann, 'goose'); const b = await enchant(ann, 'goose');
    await db.sql(`update enchantments set xp = 40 where id = $1`, [b]);
    const cb = await row(b);
    const before = (await db.sql(`select xp from enchantments where id = $1`, [a]))[0].xp;
    const r = await merge(ann, a, b);
    expect(r.result).toMatchObject({ merged: true, same: true, starred: true, stars: 1, fill: 0, need: 1 });
    expect(r.result.power).toMatchObject({ name: 'Gilded Nest' });
    expect(r.stars).toBe(1);
    expect(r.powers).toHaveLength(3);
    expect(r.powers[0]).toMatchObject({ star: 1, on: true, name: 'Gilded Nest' });
    expect(r.powers[1]).toMatchObject({ star: 2, on: false });
    expect(r.titles).toContain('Starlit');
    const ra = await row(a);
    expect(ra.xp).toBe(before + 40);
    expect(ra.level).toBeGreaterThan(1);
    // the copy is gone; its plot is still Ann's, with the plot's own roll
    const rb = await row(b);
    expect(rb).toMatchObject({ status: 'gone', owner_id: null });
    const plot = (await db.sql(`select owner_id, rarity, private.plot_rarity_for(gx, gy) nat from world_plots where gx = $1 and gy = $2`, [cb.gx, cb.gy]))[0];
    expect(plot.owner_id).toBe(ann);
    expect(plot.rarity).not.toBe('enchanted');
    expect(plot.rarity).toBe(plot.nat === 'enchanted' || String(plot.nat).startsWith('crown') ? 'common' : plot.nat);
    expect(r.result.copy).toMatchObject({ kind: 'goose', rarity: plot.rarity });
    // its chronicle says where it went
    expect((await db.sql(`select count(*)::int n from enchant_events where enchant_id = $1 and kind = 'merged_away'`, [b]))[0].n).toBe(1);
  });

  it('★2 takes one more copy, ★3 two more; then no more', async () => {
    const a = await enchant(ann, 'genie');
    const c = [await enchant(ann, 'genie'), await enchant(ann, 'genie'), await enchant(ann, 'genie'), await enchant(ann, 'genie'), await enchant(ann, 'genie')];
    expect((await merge(ann, a, c[0])).result).toMatchObject({ stars: 1 });
    expect((await merge(ann, a, c[1])).result).toMatchObject({ stars: 2, need: 2 });
    expect((await merge(ann, a, c[2])).result).toMatchObject({ starred: false, stars: 2, fill: 1, need: 2 });
    const r = await merge(ann, a, c[3]);
    expect(r.result).toMatchObject({ starred: true, stars: 3, need: null });
    expect(r.titles).toEqual(expect.arrayContaining(['Starlit', 'Starforged', 'Supernova']));
    await expectError(merge(ann, a, c[4]), 'max_stars');
    expect((await db.sql(`select count(*)::int n from feed_events where player_id = $1 and data ->> 'sub' = 'starred' and data ->> 'kind' = 'genie'`, [ann]))[0].n).toBe(3);
  });

  it('a starred copy brings its copies along', async () => {
    const a = await enchant(ann, 'map'); const b = await enchant(ann, 'map');
    await setStars(b, 2); // ★2 = 2 copies, + itself = 3: ★1, ★2 and one toward ★3
    const r = await merge(ann, a, b);
    expect(r.result).toMatchObject({ stars: 2, fill: 1, need: 2 });
  });

  it('other kinds pour in as Essence; three make a copy; Essence a ★3 can’t take is kept', async () => {
    const a = await enchant(ann, 'pandora');
    const e0 = await essence(ann);
    expect((await merge(ann, a, await enchant(ann, 'spyglass'))).result).toMatchObject({ same: false, starred: false, essence: e0 + 1 });
    expect((await merge(ann, a, await enchant(ann, 'parasite'))).result).toMatchObject({ essence: e0 + 2 });
    const r = await merge(ann, a, await enchant(ann, 'spyglass'));
    expect(r.result).toMatchObject({ essence_used: true, starred: true, stars: 1, essence: e0 });
    expect(r.essence).toBe(e0);
    // banked Essence: a ★3 can't take it, so it waits; pouring with no copy uses 3 of it
    const full = await enchant(ann, 'oracle'); await setStars(full, 3);
    for (let i = 0; i < 3; i++) await merge(ann, full, await enchant(ann, 'spyglass'));
    expect(await essence(ann)).toBe(e0 + 3);
    await expectError(merge(ann, full, null), 'max_stars');
    const r2 = await merge(ann, a, null);
    expect(r2.result).toMatchObject({ essence_used: true, stars: 2 });
    expect(await essence(ann)).toBe(e0);
    await expectError(merge(ann, a, null), 'not_enough_essence');
  });

  it('won’t pour a busy copy, someone else’s, or itself', async () => {
    const a = await enchant(ann, 'clockwork'); const b = await enchant(ann, 'clockwork');
    const splice = await enchant(ann, 'splice'); const g = await enchant(ann, 'goose');
    await db.sql(`update enchantments set state = state || jsonb_build_object('charges', 3, 'charge_at', extract(epoch from now())) where id = $1`, [splice]);
    await act(ann, splice, 'splice', { a: b, b: g, mode: 'swap' });
    await expectError(merge(ann, a, b), 'copy_busy');
    await expectError(merge(ann, a, splice), 'copy_busy');
    await expectError(merge(ann, a, a), 'bad_target');
    const theirs = await enchant(bob, 'clockwork');
    await expectError(merge(ann, a, theirs), 'not_owner');
    await expectError(merge(bob, a, theirs), 'not_owner');
  });

  it('every star adds +10% to the Ink it pays', async () => {
    const a = await enchant(ann, 'spyglass');
    const p0 = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [a]))[0].p;
    await setStars(a, 2);
    const p2 = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [a]))[0].p;
    expect(Math.abs(p2.paid - p0.paid * 1.2)).toBeLessThanOrEqual(1);
    expect(p2.mods.map((m: any) => m.label)).toContain('★★ +20%');
  });

  it('shows stars in the brief, the page and the map', async () => {
    const a = await enchant(ann, 'sizeray'); await setStars(a, 1);
    const v = await get(ann, a);
    expect(v).toMatchObject({ stars: 1, star_fill: 0, star_need: 1, star_ink: 10 });
    expect((await get(bob, a)).stars).toBe(1);
    const ra = await row(a);
    const m = await db.rpc(ann, 'enchant_map', { p_min_gx: ra.gx - 5, p_min_gy: ra.gy - 5, p_max_gx: ra.gx + 5, p_max_gy: ra.gy + 5 });
    const mine = m.plots.find((x: any) => x.id === a);
    expect(mine?.stars).toBe(1);
  });
});

describe('⭐ the powers', () => {
  it('🧞 Genie: 4 wishes, a wish for a friend, a weekly boon', async () => {
    const g = await enchant(ann, 'genie'); await setStars(g, 3);
    await db.sql(`update enchantments set state = state || jsonb_build_object('wishes', 0, 'charge_at', extract(epoch from now()) - 40 * 3600) where id = $1`, [g]);
    const v = await get(ann, g);
    expect(v.view).toMatchObject({ wishes: 4, max: 4, gift_used: false, boon_in: 0 });
    await expectError(act(ann, g, 'gift', { username: 'str_bob' }), 'not_friends');
    await db.sql(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted') on conflict do nothing`, [ann, bob]);
    expect((await db.sql(`select private.friend_state($1, $2) s`, [ann, bob]))[0].s).toBe('friends');
    const r = await act(ann, g, 'gift', { username: 'str_bob' });
    expect(r.result).toMatchObject({ gift: true, to: 'str_bob', ink: 30 });
    expect(r.view).toMatchObject({ wishes: 3, gift_used: true });
    await expectError(act(ann, g, 'gift', { username: 'str_bob' }), 'too_soon');
    expect((await act(ann, g, 'boon')).result).toMatchObject({ boon: true, ticket: 'epic' });
    expect(await tickets(ann, 'genie_boon')).toEqual(['epic']);
    await expectError(act(ann, g, 'boon'), 'too_soon');
    const low = await enchant(ann, 'genie');
    await expectError(act(ann, low, 'boon'), 'stars_locked');
  });

  it('🪿 Goose: foxes pay 15 and 3 Luck at ★2; every 5th egg brings a gosling at ★3', async () => {
    const g = await enchant(ann, 'goose'); await setStars(g, 3);
    await db.sql(`update enchantments set state = state || jsonb_build_object('eggs', 4, 'egg_at', extract(epoch from now()) - 7200) where id = $1`, [g]);
    expect((await get(ann, g)).view.gosling_in).toBe(1);
    const r = await act(ann, g, 'collect');
    expect(r.result.gosling).toBe(true);
    expect(await tickets(ann, 'gosling')).toEqual(['rare']);
    expect((await db.sql(`select private.ench_n('goose', 'platinum', 0.03) * 2 = 0.06 ok`))[0].ok).toBe(true);
  });

  it('⏰ Clockwork: 20 turns and 6 h of charge; ×1.5 fast-forward; the Toll of Hours', async () => {
    const c = await enchant(ann, 'clockwork'); await setStars(c, 3);
    const v = (await get(ann, c)).view;
    expect(v).toMatchObject({ turns_max: 20, cap: 360, skip_x: 1.5, toll: true, toll_used: false });
    const other = await enchant(ann, 'pandora');
    const before = Number((await row(other)).clock_skip);
    const r = await act(ann, c, 'toll');
    expect(r.result.tolled).toBeGreaterThan(1);
    expect(Number((await row(other)).clock_skip)).toBe(before + 1800);
    await expectError(act(ann, c, 'toll'), 'too_soon');
    await db.sql(`update enchantments set state = state || jsonb_build_object('charge', 100, 'tick_at', extract(epoch from now())) where id = $1`, [c]);
    const f = await act(ann, c, 'forward', { target: other, minutes: 20 });
    expect(f.result).toMatchObject({ forwarded: 20, skipped: 30 });
    expect(Number((await row(other)).clock_skip)).toBe(before + 1800 + 1800);
  });

  it('📡 Size Ray holds 4 shots at ★1', async () => {
    const s = await enchant(ann, 'sizeray'); await setStars(s, 1);
    await db.sql(`update enchantments set state = state || jsonb_build_object('shots', 0, 'shot_at', extract(epoch from now()) - 40 * 3600) where id = $1`, [s]);
    expect((await get(ann, s)).view).toMatchObject({ shots: 4, max: 4 });
  });

  it('👁️ Oracle: a card, a rewrite and a gaze more', async () => {
    const o = await enchant(ann, 'oracle');
    const v0 = (await db.sql(`select private.oracle_eval(e, now()) g from enchantments e where id = $1`, [o]))[0].g;
    await setStars(o, 3);
    const v3 = (await db.sql(`select private.oracle_eval(e, now()) g from enchantments e where id = $1`, [o]))[0].g;
    expect(v3.cards_n).toBe(v0.cards_n + 1); expect(v3.rewrites_n).toBe(v0.rewrites_n + 1); expect(v3.max).toBe(v0.max + 1);
  });

  it('🏺 Pandora: Hope after 6 evils at ★1', async () => {
    const p = await enchant(ann, 'pandora'); await setStars(p, 1);
    expect((await get(ann, p)).view.hope_at).toBe(6);
  });

  it('🪱 Parasite: quicker at ★2', async () => {
    const p = await enchant(ann, 'parasite'); await setStars(p, 2);
    expect((await get(ann, p)).view.next_stage_at).toBe(2);
  });

  it('🌀 Wormhole: a three-mouthed wormhole at any level with ★3', async () => {
    const w = await enchant(ann, 'wormhole');
    expect((await get(ann, w)).view.three).toBe(false);
    await setStars(w, 3);
    expect((await get(ann, w)).view.three).toBe(true);
  });

  it('🪞 Shard: a ★3 Shard reflects with ★1', async () => {
    const s = await enchant(ann, 'shard'); await setStars(s, 3);
    await db.sql(`update enchantments set state = state || jsonb_build_object('reflect', jsonb_build_object('kind', 'genie', 'until', extract(epoch from now()) + 3600), 'r', '{}'::jsonb) where id = $1`, [s]);
    const x = (await db.sql(`select (private.ench_reflected(e, now())).stars n from enchantments e where id = $1`, [s]))[0].n;
    expect(x).toBe(1);
    expect((await get(ann, s)).reflected).toMatchObject({ max: 4 });
  });

  it('🧪 Splice: a charge more at ★1, longer splices at ★2, a Quad at ★3', async () => {
    const sp = await enchant(ann, 'splice');
    const m0 = (await get(ann, sp)).view.max;
    await setStars(sp, 1);
    expect((await get(ann, sp)).view.max).toBe(m0 + 1);
    const ids = [await enchant(ann, 'goose'), await enchant(ann, 'genie'), await enchant(ann, 'map'), await enchant(ann, 'spyglass')];
    await db.sql(`update enchantments set state = state || jsonb_build_object('charges', 0, 'bonus', 6, 'charge_at', extract(epoch from now())) where id = $1`, [sp]);
    await expectError(act(ann, sp, 'splice', { mode: 'quad', a: ids[0], b: ids[1], c: ids[2], d: ids[3] }), 'stars_locked');
    await setStars(sp, 3);
    const r = await act(ann, sp, 'splice', { mode: 'quad', a: ids[0], b: ids[1], c: ids[2], d: ids[3] });
    expect(r.result).toMatchObject({ mode: 'quad', hours: 27 });
    expect(r.result.hybrid).toMatch(/^The /);
    const rows = await db.sql(`select * from enchant_splices where splice_id = $1 and ends_at > now()`, [sp]);
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((x: any) => x.grp)).size).toBe(1);
    expect(r.view.active.members).toHaveLength(4);
    const partners = (await db.sql(`select private.ench_partners($1) p`, [ids[0]]))[0].p;
    expect(partners).toHaveLength(3);
    expect((await row(sp)).state.bonus).toBe(3);
  });

  it('☀️ Pocket Sun: ★1 a wider zone, ★2 a longer day; 🪄 Dowsing Rod: ★1 full depth sooner', async () => {
    const sun = await enchant(ann, 'sun');
    const v0 = (await get(ann, sun)).view;
    await setStars(sun, 2);
    const v2 = (await get(ann, sun)).view;
    expect(v2.r0).toBe(Math.round(v0.r0 * 1.5));
    expect(v2.fuel_h).toBe(v0.fuel_h * 2);
    const rod = await enchant(ann, 'rod');
    const t0 = (await act(ann, rod, 'tune', { t: 'rarity', id: 'epic' })).result.tuned.need;
    await setStars(rod, 1);
    expect((await get(ann, rod)).view.targets[0].need).toBeLessThan(t0);
  });

  it('⚡ Storm Coil storms twice a day at ★1', async () => {
    const s = await enchant(ann, 'stormcoil');
    const p0 = (await get(ann, s)).view.per_day;
    await setStars(s, 1);
    expect((await get(ann, s)).view.per_day).toBe(p0 + 1);
  });

  it('lists three powers for every kind', async () => {
    const r = (await db.sql(`select k, jsonb_array_length(private.ench_star_powers(k)) n from unnest(private.ench_kinds()) k`));
    expect(r.length).toBeGreaterThanOrEqual(17);
    for (const x of r) expect(x.n).toBe(3);
  });
});
