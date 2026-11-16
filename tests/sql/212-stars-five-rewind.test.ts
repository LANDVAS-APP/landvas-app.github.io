// Enchantments, part 12: ★4 and ★5 for all twenty (3 and 5 more copies), and the Clockwork's Rewind — undo what went
// wrong in the last 12 hours, and once a week roll a just-claimed plot again.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string;
const O = { gx: 806_100, gy: 1_561_900 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `s5-${++k}-00000000` });
const claim = (uid: string, dx: number, dy = 0) => claimAt(uid, O.gx + dx, O.gy + dy);
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claim(uid, (spot++) * 3, uid === ann ? 0 : 60);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const merge = (uid: string, target: string, copy: string | null) => db.rpc(uid, 'enchant_merge', { p_target: target, p_copy: copy });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const setStars = (id: string, n: number) => db.sql(`update enchantments set stars = $2, star_fill = 0 where id = $1`, [id, n]);
const setState = (id: string, patch: Record<string, unknown>) => db.sql(`update enchantments set state = state || $2::jsonb where id = $1`, [id, JSON.stringify(patch)]);
const cfg = (patch: Record<string, unknown>) => db.sql(`update game_config set value = value || $1::jsonb where key = 'enchantments'`, [JSON.stringify(patch)]);
const luck = async (uid: string) => (await db.sql(`select coalesce(luck, 0) luck, coalesce(enchant, 0) enchant from player_luck where player_id = $1`, [uid]))[0] ?? { luck: 0, enchant: 0 };
const tickets = async (uid: string, source: string) => (await db.sql(`select min_rarity from roll_tickets where player_id = $1 and source = $2`, [uid, source])).map((r: any) => r.min_rarity);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('s5_ann'); bob = await db.newPlayer('s5_bob');
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 900_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await cfg({ splice: { aberration: 0, unstable: 0 } });
});
afterAll(() => db.close());

describe('⭐ stars to five', () => {
  it('★4 takes three more copies and ★5 five more (12 in all); then no more', async () => {
    const a = await enchant(ann, 'goose');
    const c: string[] = [];
    for (let i = 0; i < 12; i++) c.push(await enchant(ann, 'goose'));
    let r: any;
    for (let i = 0; i < 4; i++) r = await merge(ann, a, c[i]);
    expect(r.result).toMatchObject({ stars: 3, starred: true, need: 3 });
    for (let i = 4; i < 6; i++) expect((await merge(ann, a, c[i])).result).toMatchObject({ stars: 3, starred: false });
    r = await merge(ann, a, c[6]);
    expect(r.result).toMatchObject({ stars: 4, starred: true, fill: 0, need: 5 });
    expect(r.result.power).toMatchObject({ name: 'Watch Goose' });
    expect(r.titles).toContain('Comet-Crowned');
    for (let i = 7; i < 11; i++) expect((await merge(ann, a, c[i])).result).toMatchObject({ stars: 4 });
    r = await merge(ann, a, c[11]);
    expect(r.result).toMatchObject({ stars: 5, starred: true, need: null });
    expect(r.result.power).toMatchObject({ name: 'Golden Age' });
    expect(r.titles).toEqual(expect.arrayContaining(['Starlit', 'Starforged', 'Supernova', 'Comet-Crowned', 'Ascendant']));
    expect(r.powers).toHaveLength(5);
    expect(r.powers.every((p: any) => p.on)).toBe(true);
    expect(r.star_ink).toBe(50);
    await expectError(merge(ann, a, await enchant(ann, 'goose')), 'max_stars');
    // the moment is news
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'ascended'`, [ann]))[0].n).toBe(2);
    // and a badge
    expect((await db.sql(`select count(*)::int n from player_achievements pa where pa.player_id = $1 and pa.achievement_key in ('en_star_4', 'en_star_5')`, [ann]))[0].n).toBe(2);
  });

  it('a ★4 copy brings 7 copies and a ★5 brings 12', async () => {
    const a = await enchant(ann, 'genie'); const b = await enchant(ann, 'genie');
    await setStars(b, 4); // 7 + itself = 8: ★1–★4 and 1 toward ★5
    expect((await merge(ann, a, b)).result).toMatchObject({ stars: 4, fill: 1, need: 5 });
  });

  it('five powers for every kind; ★5 pays +50%', async () => {
    const r = await db.sql(`select k, jsonb_array_length(private.ench_star_powers(k)) n from unnest(private.ench_kinds()) k`);
    expect(r).toHaveLength(20);
    for (const x of r) expect(x.n).toBe(5);
    const s = await enchant(ann, 'spyglass'); await setStars(s, 5);
    const p = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [s]))[0].p;
    expect(p.mods.map((m: any) => m.label)).toContain('★★★★★ +50%');
  });
});

describe('⭐ the forty new powers', () => {
  it('🪿 Goose ★4 watches the nest itself, ★5 grows eggs 50% bigger', async () => {
    const g = await enchant(ann, 'goose'); await setStars(g, 5);
    expect((await get(ann, g)).view).toMatchObject({ max: 210, watch: true });
  });

  it('🧞 Genie ★4 holds 5 wishes that come back in 6 hours; ★5 a Forbidden Wish can’t twist', async () => {
    const g = await enchant(ann, 'genie'); await setStars(g, 4);
    await setState(g, { wishes: 0, charge_at: now() - 31 * 3600 });
    expect((await get(ann, g)).view).toMatchObject({ wishes: 5, max: 5 });
    await setStars(g, 5);
    for (let i = 0; i < 6; i++) {
      await setState(g, { wishes: 5, charge_at: now(), cold_until: 0, freed_until: 0 });
      const r = await act(ann, g, 'forbidden');
      expect(r.result.forbidden).not.toBe('twisted');
    }
  });

  it('🗺️ Map ★5: every 5th chest is El Dorado — a Mythic ticket, and the next map at once', async () => {
    const m = await enchant(ann, 'map'); await setStars(m, 5);
    const e = await row(m);
    await setState(m, { pieces: [], x: { gx: e.gx + 4, gy: e.gy + 4, m: 10, bearing: 0 }, dug: 0, maps: 4 });
    await db.placeAt(ann, e.gx + 4, e.gy + 4);
    let r: any;
    for (let i = 0; i < 5; i++) { r = await act(ann, m, 'dig'); await sleep(380); }
    expect(r.result).toMatchObject({ chest: true, eldorado: true, ticket: 'mythic' });
    expect(await tickets(ann, 'el_dorado')).toEqual(['mythic']);
    expect(Number((await row(m)).state.next_at)).toBeLessThanOrEqual(now() + 5);
    expect(Number(r.result.pay.base)).toBeGreaterThanOrEqual(240); // ★4 Hoard: double Ink
  });

  it('🏺 Pandora ★4: Hope after 5; ★5: escaped evils turn into blessings', async () => {
    const p = await enchant(ann, 'pandora'); await setStars(p, 4);
    expect((await get(ann, p)).view.hope_at).toBe(5);
    await setStars(p, 5);
    await cfg({ pandora: { blessing: 1 } });
    await db.sql(`insert into player_luck (player_id, luck) values ($1, 0) on conflict (player_id) do update set luck = 0`, [ann]);
    const l0 = await luck(ann);
    const r = await act(ann, p, 'open', { notches: 3 });
    const evils = r.result.out.filter((x: any) => x.type === 'evil');
    for (const x of evils) expect(x.blessed).toBe(true);
    if (evils.length) expect((await luck(ann)).luck).toBeGreaterThanOrEqual(l0.luck + 15);
    expect(Number((await row(p)).stats.blessings ?? 0)).toBe(evils.length);
    await cfg({ pandora: { blessing: 0.3333 } });
  });

  it('📡 Size Ray ★4: a PERFECT grow is a MEGA (1,000×, ×4); ★5: it gives its shot back', async () => {
    const s = await enchant(ann, 'sizeray'); await setStars(s, 5);
    const mine = await claim(ann, 900, 9);
    await setState(s, { shots: 2, shot_at: now() });
    await act(ann, s, 'aim', { target: { type: 'plot', gx: mine.gx, gy: mine.gy, mode: 'grow' } });
    await db.sql(`update enchantments set state = jsonb_set(state, '{aim,at}', to_jsonb(extract(epoch from clock_timestamp()) - 0.82)) where id = $1`, [s]);
    const r = await act(ann, s, 'fire');
    expect(r.result).toMatchObject({ grade: 'PERFECT', mega: true, giant: 4, refunded: true });
    expect(r.view.shots).toBe(2);
    const b = (await db.sql(`select data, mult from enchant_buffs where kind = 'plot_giant' and gx = $1 and gy = $2 and expires_at > now()`, [mine.gx, mine.gy]))[0];
    expect(b.data).toMatchObject({ scale: 1000, mega: true });
    expect(Number((await row(s)).stats.megas)).toBe(1);
    const w = await db.rpc(ann, 'enchant_world', {});
    expect(w.giants.find((g: any) => g.gx === mine.gx && g.gy === mine.gy)?.scale).toBe(1000);
  });

  it('🪞 Shard ★4: five reflections to choose from, carrying ★2; ★5 ★3', async () => {
    const s = await enchant(ann, 'shard'); await setStars(s, 4);
    const r = await act(ann, s, 'gaze');
    expect(r.result.options).toHaveLength(5);
    await setState(s, { reflect: { kind: 'genie', until: now() + 3600 }, r: {} });
    expect((await db.sql(`select (private.ench_reflected(e, now())).stars n from enchantments e where id = $1`, [s]))[0].n).toBe(2);
    await setStars(s, 5);
    expect((await db.sql(`select (private.ench_reflected(e, now())).stars n from enchantments e where id = $1`, [s]))[0].n).toBe(3);
  });

  it('🌀 Wormhole ★5: perfectly stable, open 48 hours', async () => {
    const w = await enchant(ann, 'wormhole'); await setStars(w, 5);
    const there = await claim(ann, 400, 3);
    await act(ann, w, 'trace');
    await setState(w, { trace_at: now() - 2 });
    const r = await act(ann, w, 'open', { gx: there.gx, gy: there.gy, smooth: 0.1 });
    expect(r.result).toMatchObject({ hours: 48, stability: 100 });
  });

  it('👁️ Oracle ★5 weaves a roll card into an Enchanted roll, once a week', async () => {
    const o = await enchant(ann, 'oracle'); await setStars(o, 5);
    await setState(o, { charges: 2, charge_at: now() });
    const g = await act(ann, o, 'gaze', { what: 'roll' });
    expect(g.result.cards.list.length).toBeGreaterThan(0);
    const r = await act(ann, o, 'weave', { i: 0 });
    expect(r.result.woven).toMatchObject({ rarity: 'enchanted' });
    const f = (await db.sql(`select outcome from private.oracle_fates where id = $1`, [r.result.cards.list[0].fate]))[0].outcome;
    expect(f.rarity).toBe('enchanted');
    expect(f.kind).toBeTruthy();
    await expectError(act(ann, o, 'weave', { i: 1 }), 'too_soon');
    // (the woven fate is the next roll: a claim that takes it is an enchantment)
    const c = await claim(ann, 1500, 21);
    expect(c.rarity).toBe('enchanted');
    expect(c.enchant.kind).toBe(f.kind);
    // (the rest of the prophecy would decide the next claims here: gone)
    await db.sql(`delete from private.oracle_fates where player_id = $1`, [ann]);
    const low = await enchant(ann, 'oracle');
    await expectError(act(ann, low, 'weave', { i: 0 }), 'stars_locked');
  });

  it('🧪 Splice ★5: splices never wear off — until the next one is made', async () => {
    const sp = await enchant(ann, 'splice'); await setStars(sp, 5);
    const ids = [await enchant(ann, 'goose'), await enchant(ann, 'genie'), await enchant(ann, 'map'), await enchant(ann, 'deck')];
    await setState(sp, { charges: 0, bonus: 6, charge_at: now() });
    const r = await act(ann, sp, 'splice', { mode: 'swap', a: ids[0], b: ids[1] });
    expect(r.result.eternal).toBe(true);
    const first = (await db.sql(`select id, data, ends_at > now() + interval '50 years' far from enchant_splices where splice_id = $1 and ends_at > now()`, [sp]))[0];
    expect(first.far).toBe(true);
    expect(first.data.eternal).toBe(true);
    // a new one ends it
    await act(ann, sp, 'splice', { mode: 'swap', a: ids[2], b: ids[3] });
    const live = await db.sql(`select a, b from enchant_splices where splice_id = $1 and ends_at > now()`, [sp]);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ a: ids[2], b: ids[3] });
    expect(Number((await row(sp)).stats.eternal)).toBe(2);
    expect((await get(ann, sp)).view.eternal).toBe(true);
  });

  it('☀️ Pocket Sun ★5: a sun that burns out white-hot goes supernova — ×6 over twice the ground for 15 minutes', async () => {
    const s = await enchant(ann, 'sun'); await setStars(s, 5);
    const e = await row(s);
    const t = now();
    const zone = (heat: number, i: number) => ({ i, gx: e.gx + 30 * i, gy: e.gy, r0: 200, lit_at: t - 7200, fuel: 50, fuel_at: t - 100, heat, heat_at: t - 100,
      mode: 'claim', party: false, spots: [], claims: 0, warm_at: t - 100, steady: true, full_party: true, nova: true });
    await setState(s, { zones: [zone(100, 1), zone(60, 2)] });
    const v = (await get(ann, s)).view;
    expect(v.zones).toHaveLength(1);
    expect(v.zones[0]).toMatchObject({ i: 1, tier: 'nova', mult: 6, r_m: 400, alive: true });
    expect(Number(v.zones[0].until)).toBeGreaterThan(t + 700);
    // the claim inside it gets ×6
    const sc = (await db.sql(`select private.sun_for_claim($1, $2, $3) s`, [ann, e.gx + 31, e.gy]))[0].s;
    expect(sc).toMatchObject({ tier: 'nova', um: 6 });
    // the heartbeat sees it once
    await db.sql(`select private.sun_nova_tick()`); await db.sql(`select private.sun_nova_tick()`);
    expect(Number((await row(s)).stats.novas)).toBe(1);
    expect((await db.sql(`select count(*)::int n from feed_events where player_id = $1 and data ->> 'sub' = 'supernova'`, [ann]))[0].n).toBe(1);
    await expectError(act(ann, s, 'stoke', { i: 1, n: 1 }), 'sun_nova');
  });

  it('☀️ ★4 Solar Wind: white-hot burns no faster', async () => {
    const z = { fuel: 3600, fuel_at: now(), heat: 100, heat_at: now(), r0: 200 };
    const a = (await db.sql(`select private.sun_zone($1::jsonb, $2) z`, [JSON.stringify(z), now() + 1800]))[0].z;
    const b = (await db.sql(`select private.sun_zone($1::jsonb, $2) z`, [JSON.stringify({ ...z, steady: true }), now() + 1800]))[0].z;
    expect(Number(b.left_s)).toBeGreaterThan(Number(a.left_s) + 1500);
  });

  it('⚡ Storm Coil ★4: 30 bolts over 4 minutes', async () => {
    const c = await enchant(ann, 'stormcoil'); await setStars(c, 4);
    await setState(c, { charge: 100 });
    const r = await act(ann, c, 'storm');
    expect(r.result.storm.bolts).toHaveLength(30);
    expect(Number(r.result.storm.until) - Number(r.result.storm.at)).toBe(240);
  });

  it('🔭 Spyglass ★4 reads the plots around a look; ★5 reaches 10 km', async () => {
    const g = await enchant(ann, 'spyglass'); await setStars(g, 5);
    const e = await row(g);
    const v = await get(ann, g);
    expect(v.view.range_m).toBe(10000);
    const r = await act(ann, g, 'look', { gx: e.gx + 40, gy: e.gy + 40 });
    expect(r.result.sighting).toBeTruthy();
    expect(r.result.panorama).toHaveLength(8);
    expect((await db.sql(`select count(*)::int n from private.spy_sightings where enchant_id = $1`, [g]))[0].n).toBe(9);
  });

  it('⚒️ Crucible ★5: the first strike each day can’t fail; ★4: a failed strike keeps its Heat', async () => {
    const c = await enchant(ann, 'crucible'); await setStars(c, 5);
    const p = await claim(ann, 1100, 15);
    await db.sql(`update world_plots set rarity = 'common' where gx = $1 and gy = $2`, [p.gx, p.gy]);
    await setState(c, { heat: 0.01 });
    const r = await act(ann, c, 'strike', { gx: p.gx, gy: p.gy });
    expect(r.result.ok).toBe(true);
    // (uncommon — or rare, if the ★3 Masterwork took it two tiers)
    expect(['uncommon', 'rare']).toContain((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [p.gx, p.gy]))[0].rarity);
    // the next one can fail — and keeps all its Heat (★4)
    await setState(c, { heat: 0.01 });
    const r2 = await act(ann, c, 'strike', { gx: p.gx, gy: p.gy });
    if (!r2.result.ok) expect(Number(r2.result.heat)).toBeCloseTo(0.01, 3);
    expect(r2.result.starforged).toBe(false);
  });

  it('🃏 Deck ★5: one more card a day; 🎭 Puppeteer ★4: two more strings; 📜 Origami ★4: anywhere on Earth', async () => {
    const d = await enchant(ann, 'deck');
    const p0 = (await get(ann, d)).view.picks;
    await setStars(d, 5);
    expect((await get(ann, d)).view.picks).toBe(p0 + 1);
    const pp = await enchant(ann, 'puppeteer');
    const m0 = (await get(ann, pp)).view.max;
    await setStars(pp, 4);
    expect((await get(ann, pp)).view.max).toBe(m0 + 2);
    const o = await enchant(ann, 'origami'); await setStars(o, 4);
    expect((await get(ann, o)).view.far_m).toBe(40100000);
  });

  it('✍️ Glyphcaster ★4: no more fizzles; ★5: three glyphs at once, at double strength', async () => {
    const g = await enchant(ann, 'glyph'); await setStars(g, 4);
    await setState(g, { mana: 7, mana_at: now() });
    const r = await act(ann, g, 'cast', { glyph: 'spiral', accuracy: 0.05 });
    expect(r.result.fizzled).toBeUndefined();
    expect(r.result.accuracy).toBeCloseTo(0.35, 2);
    await expectError(act(ann, g, 'cast', { glyphs: ['spiral', 'star', 'triangle'], accuracy: 1 }), 'invalid_action');
    await setStars(g, 5);
    await setState(g, { mana: 7, mana_at: now() });
    const ge = await row(g);
    const t = await act(ann, g, 'cast', { glyphs: ['spiral', 'star', 'triangle'], accuracy: 1, gx: ge.gx, gy: ge.gy });
    expect(t.result).toMatchObject({ chain: true, power: 2 });
    expect(t.result.effects.length).toBeGreaterThanOrEqual(3);
    expect(Number((await row(g)).stats.triples)).toBe(1);
  });

  it('🦠 Parasite ★4 feeds in 10 hours', async () => {
    const p = await enchant(ann, 'parasite'); await setStars(p, 4);
    await setState(p, { host: { gx: O.gx, gy: O.gy + 60, owner: bob, owner_name: 's5_bob', at: now(), welcomed: false } });
    const v = (await get(ann, p)).view;
    expect(Number(v.ready_in)).toBeGreaterThan(10 * 3600 - 60);
    expect(Number(v.ready_in)).toBeLessThanOrEqual(10 * 3600);
  });
});

describe('⏪ the Rewind', () => {
  let clock: string;
  const charge = (n: number) => setState(clock, { charge: n, tick_at: now() });
  const timeline = async () => (await get(ann, clock)).view.timeline as any[];
  beforeAll(async () => { clock = await enchant(ann, 'clockwork'); });

  it('lists what went wrong; a curse rewound lifts and gives back what it took', async () => {
    const box = await enchant(ann, 'pandora');
    await db.sql(`insert into player_luck (player_id, luck) values ($1, 40) on conflict (player_id) do update set luck = 40`, [ann]);
    await db.sql(`select private.ench_event($1, 'evil', private.pandora_curse(e, 'envy')) from enchantments e where id = $1`, [box]);
    expect((await luck(ann)).luck).toBe(25);
    const tl = await timeline();
    const m = tl.find((x) => x.type === 'curse' && x.evil === 'envy');
    expect(m).toMatchObject({ emoji: '😈', kind: 'pandora', cost: 40 });
    await charge(30);
    await expectError(act(ann, clock, 'rewind', { id: m.id }), 'not_enough_charge');
    await charge(200);
    const r = await act(ann, clock, 'rewind', { id: m.id });
    expect(r.result).toMatchObject({ cost: 40, undo: { luck: 15 } });
    expect(Number(r.view.charge)).toBeCloseTo(160, 0);
    expect((await luck(ann)).luck).toBeGreaterThanOrEqual(40); // (and the badge's Luck on top)
    expect((await timeline()).find((x) => x.id === m.id)).toBeUndefined();
    expect(Number((await row(clock)).stats.rewinds)).toBe(1);
    // once a day at level 1
    await expectError(act(ann, clock, 'rewind', { id: m.id }), 'already_today');
    expect((await db.sql(`select count(*)::int n from player_achievements where player_id = $1 and achievement_key = 'cw_rewind_1'`, [ann]))[0].n).toBe(1);
  });

  it('a Despair, a failed strike, a reversed card, a fizzle, a scorch — each undone', async () => {
    await db.sql(`update enchantments set level = 5, xp = 1000 where id = $1`, [clock]); // twice a day from level 5
    const day = async () => setState(clock, { rw_day: 'x', rw_n: 0 });
    // Despair
    const box = await enchant(ann, 'pandora');
    await db.sql(`update player_luck set enchant = 3 where player_id = $1`, [ann]);
    await db.sql(`select private.ench_event($1, 'evil', private.pandora_curse(e, 'despair')) from enchantments e where id = $1`, [box]);
    expect((await luck(ann)).enchant).toBe(0);
    let m = (await timeline()).find((x) => x.evil === 'despair');
    await charge(300); await day();
    await act(ann, clock, 'rewind', { id: m.id });
    expect((await luck(ann)).enchant).toBe(3);
    // a failed strike: the Heat comes back
    const cru = await enchant(ann, 'crucible');
    await setState(cru, { heat: 2 });
    await db.sql(`select private.ench_event($1, 'struck', '{"ok": false, "heat": 10, "rune": null, "from": "rare"}'::jsonb)`, [cru]);
    m = (await timeline()).find((x) => x.type === 'strike');
    expect(m).toMatchObject({ lost: 5, emoji: '🔥' });
    await act(ann, clock, 'rewind', { id: m.id });
    expect(Number((await row(cru)).state.heat)).toBe(7);
    // a reversed card: the Luck comes back
    const deck = await enchant(ann, 'deck');
    await db.sql(`update player_luck set luck = 10 where player_id = $1`, [ann]);
    await db.sql(`select private.ench_event($1, 'fate', '{"card": "fool", "up": false, "effects": [{"t": "ink", "v": 110}, {"t": "luck", "v": -6}]}'::jsonb)`, [deck]);
    m = (await timeline()).find((x) => x.type === 'reversed');
    expect(m.lost).toBe(6);
    await day();
    await act(ann, clock, 'rewind', { id: m.id });
    expect((await luck(ann)).luck).toBe(16);
    // a fizzle: the mana comes back
    const gl = await enchant(ann, 'glyph');
    await setState(gl, { mana: 5, mana_at: now() });
    const f = await act(ann, gl, 'cast', { glyph: 'spiral', accuracy: 0.05 });
    expect(f.result.fizzled).toBe(true);
    m = (await timeline()).find((x) => x.type === 'fizzle');
    await act(ann, clock, 'rewind', { id: m.id });
    expect((await get(ann, gl)).view.mana).toBe(5);
    // a storm's scorch washes off
    await day();
    await db.sql(`insert into enchant_buffs (player_id, kind, gx, gy, mult, data, expires_at) values ($1, 'scorch', $2, $3, 0.8, '{}'::jsonb, now() + interval '1 hour')`, [ann, O.gx, O.gy]);
    m = (await timeline()).find((x) => x.type === 'scorch');
    expect(m).toMatchObject({ n: 1, emoji: '⚡' });
    const r = await act(ann, clock, 'rewind', { id: m.id });
    expect(r.result.undo).toMatchObject({ washed: 1 });
    expect((await db.sql(`select count(*)::int n from enchant_buffs where player_id = $1 and kind = 'scorch' and expires_at > now()`, [ann]))[0].n).toBe(0);
    // (only what's on the timeline can be rewound)
    await expectError(act(ann, clock, 'rewind', { id: 'nope' }), 'not_found');
  });

  it('a fox bite on the egg in the nest never happened', async () => {
    let found = false;
    for (let i = 0; i < 6 && !found; i++) {
      const g = await enchant(ann, 'goose');
      await setState(g, { egg_at: now() - 5 * 3600, chased: [], eggs: 0 });
      const bit = (await get(ann, g)).view.visits.find((x: any) => x.state === 'bit');
      if (!bit) continue;
      found = true;
      const before = (await get(ann, g)).view.value;
      const m = (await timeline()).find((x) => x.type === 'fox' && x.target === g);
      expect(m).toBeTruthy();
      await setState(clock, { rw_day: 'x', rw_n: 0, charge: 300, tick_at: now() });
      await act(ann, clock, 'rewind', { id: m.id });
      const v = (await get(ann, g)).view;
      expect(v.visits.find((x: any) => x.k === bit.k).state).toBe('chased');
      expect(v.value).toBeGreaterThan(before);
    }
    expect(found).toBe(true);
  });

  it('★4 Deep Time: 48 hours back, half the cost, three a day', async () => {
    await setStars(clock, 4);
    const v = (await get(ann, clock)).view;
    expect(v.rewind).toMatchObject({ back_h: 48, per_day: 3, half: true, roll_cost: 30 });
    expect((await db.sql(`select private.clock_cost(36000, true) a, private.clock_cost(36000, false) b`))[0]).toEqual({ a: 65, b: 130 });
    await setStars(clock, 0);
  });

  it('rolls a just-claimed plot again, once a week; ★5 Paradox keeps the better timeline', async () => {
    const c = await claim(ann, 2000, 30);
    const v = (await get(ann, clock)).view;
    expect(v.rolls.map((x: any) => `${x.gx}:${x.gy}`)).toContain(`${c.gx}:${c.gy}`);
    await setState(clock, { charge: 300, tick_at: now() });
    await cfg({ base_pct: 100 });
    const r = await act(ann, clock, 'rewind_roll', { gx: c.gx, gy: c.gy });
    await cfg({ base_pct: 2 });
    expect(r.result).toMatchObject({ rarity: 'enchanted', kept_old: false });
    const e = (await db.sql(`select kind, owner_id from enchantments where gx = $1 and gy = $2 and status = 'active'`, [c.gx, c.gy]))[0];
    expect(e.owner_id).toBe(ann);
    expect(r.result.drew.kind).toBe(e.kind);
    expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [c.gx, c.gy]))[0].rarity).toBe('enchanted');
    const c2 = await claim(ann, 2003, 30);
    await expectError(act(ann, clock, 'rewind_roll', { gx: c2.gx, gy: c2.gy }), 'too_soon');
    // ★5: twice a week, and the better of the two stands
    await setStars(clock, 5);
    await db.sql(`update world_plots set rarity = 'mythic' where gx = $1 and gy = $2`, [c2.gx, c2.gy]);
    await cfg({ base_pct: 0 });
    const p = await act(ann, clock, 'rewind_roll', { gx: c2.gx, gy: c2.gy });
    await cfg({ base_pct: 2 });
    expect(p.result.paradox).toBe(true);
    const now2 = (await db.sql(`select rarity, private.spy_rank(rarity) rk, private.spy_rank('mythic') m from world_plots where gx = $1 and gy = $2`, [c2.gx, c2.gy]))[0];
    expect(Number(now2.rk)).toBeGreaterThanOrEqual(Number(now2.m));
    expect(Number((await row(clock)).stats.paradoxes)).toBe(1);
    // the plot is off the list now — and that was the week's two
    expect((await get(ann, clock)).view.rolls.find((x: any) => x.gx === c2.gx)).toBeUndefined();
    const theirs = await claim(bob, 2006, 30);
    await expectError(act(ann, clock, 'rewind_roll', { gx: theirs.gx, gy: theirs.gy }), 'too_soon');
  });
});
