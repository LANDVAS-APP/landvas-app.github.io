// Enchantments, part 7: the 🎭 Puppeteer (play other players' plots' minigames), the 🃏 Fated Deck (a card a day that
// shapes it) and the ✍️ Glyphcaster (trace glyphs to cast them; a Spellbook of 24) — the last three of the twenty.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string;
const O = { gx: 824_700, gy: 1_566_100 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `sfr-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claim(uid, (spot++) * 3, uid === ann ? 0 : 50);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const setStars = (id: string, n: number) => db.sql(`update enchantments set stars = $2 where id = $1`, [id, n]);
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const luck = async (uid: string) => Number((await db.sql(`select coalesce((select luck from player_luck where player_id = $1), 0) n`, [uid]))[0].n);
const finish = (session: string, rounds: number, passed = true) => db.rpc({ role: 'service_role' }, 'svc_finish_minigame', { p_session_id: session,
  p_result: { valid: true, passed, score: 400, stars: 3, flags: [], suspicious: false, min_duration_ms: 0, rounds_passed: passed ? rounds : 0, rounds_total: rounds } });

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('sfr_ann'); bob = await db.newPlayer('sfr_bob');
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 500_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`insert into player_luck (player_id, luck) values ($1, 0), ($2, 0) on conflict (player_id) do nothing`, [ann, bob]);
  // a plain plot each, besides the enchanted ones
  await claim(ann, 900, 0); await claim(bob, 900, 50);
});
afterAll(() => db.close());

describe('the roster', () => {
  // (twenty when these six came; Déjà Vu made it twenty-one — see 510-dejavu)
  it('twenty-one kinds, 190 hybrids, five powers and a Leviathan move each; the egg can hatch into any of the nine', async () => {
    const ks = (await db.sql(`select private.ench_kinds() k`))[0].k;
    expect(ks).toHaveLength(21);
    expect(ks).toEqual(expect.arrayContaining(['spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod']));
    expect((await db.sql(`select private.ench_hybrid_count() n`))[0].n).toBe(190);
    const r = await db.sql(`select k, jsonb_array_length(private.ench_star_powers(k)) n, private.lev_move(k) m, private.ench_info(k) i from unnest(private.ench_kinds()) k`);
    for (const x of r) { expect(x.n).toBe(5); expect(x.m).toBeTruthy(); expect(x.i.name).toBeTruthy(); }
    expect((await db.sql(`select private.ench_hybrid('deck', 'oracle') h`))[0].h).toEqual(['Book of Fates', true]);
    expect((await db.sql(`select private.ench_hybrid('glyph', 'stormcoil') h`))[0].h).toEqual(['Thunder Script', true]);
    expect((await db.sql(`select private.ench_hatchable() h`))[0].h).toEqual(['spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod', 'dejavu']);
  });
});

describe('🎭 Puppeteer', () => {
  let pup: string; let theirs: { gx: number; gy: number };
  beforeAll(async () => {
    pup = await enchant(ann, 'puppeteer');
    const r = await claim(bob, 30, 3);
    theirs = { gx: r.gx, gy: r.gy };
    await db.sql(`update world_plots set plot_type = 'stencil', rarity = 'common' where gx = $1 and gy = $2`, [theirs.gx, theirs.gy]);
  });

  it('lists other players’ plots nearby, and plays one of them on strings — a real session', async () => {
    const v = await get(ann, pup);
    // (the strings reach 25 km since the theatre — 100 km from level 5, anywhere at ★2)
    expect(v.view).toMatchObject({ strings: 2, max: 10, range_m: 25000 });
    expect(v.view.nearby.some((p: any) => p.gx === theirs.gx && p.gy === theirs.gy && p.game === 'blocksplash')).toBe(true);
    const s = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: theirs.gx, p_gy: theirs.gy });
    expect(s).toMatchObject({ game: 'blocksplash', level: 1, puppet: { id: pup } });
    expect((await get(ann, pup)).view.strings).toBe(1);
    const sess = (await db.sql(`select * from minigame_sessions where id = $1`, [s.session_id]))[0];
    expect(sess).toMatchObject({ player_id: ann, puppet_id: pup, gx: theirs.gx, gy: theirs.gy });
  });

  it('a finished run pays the player, tips the owner, pays the Puppeteer — and never moves the owner’s levels', async () => {
    const s = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: theirs.gx, p_gy: theirs.gy });
    const bobInk = await ink(bob);
    const e0 = Number((await row(pup)).stats.ink ?? 0);
    const res = await finish(s.session_id, s.rounds);
    expect(res.passed).toBe(true);
    expect(await ink(bob)).toBeGreaterThan(bobInk);
    const e = await row(pup);
    expect(Number(e.stats.ink)).toBeGreaterThan(e0);
    expect(e.stats.shows).toBeGreaterThanOrEqual(1);
    expect(e.stats.repertoire).toHaveProperty('blocksplash');
    // a puppet run plays the level their plot is on and climbs nothing: Bob's track is untouched, and Ann has none there
    expect((await db.sql(`select coalesce(max(highest_level), 0) n from plot_game_progress where gx = $1 and gy = $2 and player_id = $3`, [theirs.gx, theirs.gy, bob]))[0].n).toBe(0);
    expect((await db.sql(`select max(highest_level) n from plot_game_progress where gx = $1 and gy = $2 and player_id = $3`, [theirs.gx, theirs.gy, ann]))[0].n).toBeNull();
    // the level their plot is on: when Bob has climbed to 3 there, a puppet plays level 4
    await db.sql(`insert into plot_game_progress (gx, gy, player_id, game, highest_level, best_score, plays, wins) values ($1, $2, $3, 'blocksplash', 3, 100, 3, 3)`, [theirs.gx, theirs.gy, bob]);
    await db.sql(`update enchantments set state = state || '{"strings": 2}'::jsonb where id = $1`, [pup]);
    const s4 = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: theirs.gx, p_gy: theirs.gy });
    expect(s4.level).toBe(4);
    await db.sql(`update enchantments set state = state || '{"strings": 0}'::jsonb where id = $1`, [pup]);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'puppet_played'`, [bob]))[0].n).toBe(1);
  });

  it('not your own plots, not out of range, not without a string; strings come back with time', async () => {
    const mine = (await db.sql(`select gx, gy from world_plots where owner_id = $1 limit 1`, [ann]))[0];
    await expectError(db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: mine.gx, p_gy: mine.gy }), 'your_own_plot');
    const far = await claim(bob, 400_000, 0);
    await expectError(db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: far.gx, p_gy: far.gy }), 'out_of_range');
    await expectError(db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: theirs.gx, p_gy: theirs.gy }), 'no_strings');
    await db.sql(`update enchantments set state = state || jsonb_build_object('strings', 0, 'string_at', extract(epoch from now()) - 3700) where id = $1`, [pup]);
    expect((await get(ann, pup)).view.strings).toBe(1);
  });

  it('★2 any plot on Earth; ★3 a Grand Show that pays ×3 once a day', async () => {
    await setStars(pup, 3);
    await db.sql(`update enchantments set state = state || jsonb_build_object('strings', 2, 'string_at', extract(epoch from now())) where id = $1`, [pup]);
    const far = (await db.sql(`select gx, gy from world_plots where owner_id = $1 order by gx desc limit 1`, [bob]))[0];
    await db.sql(`update world_plots set plot_type = 'stencil' where gx = $1 and gy = $2`, [far.gx, far.gy]);
    // ★3 Grand Show: a three-plot medley, each run ×3 and free of strings
    const s = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: far.gx, p_gy: far.gy });
    expect(s.puppet).toMatchObject({ grand: true, medley_left: 2 });
    const second = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: theirs.gx, p_gy: theirs.gy });
    expect(second.puppet).toMatchObject({ grand: true, medley_left: 1 });
    expect((await get(ann, pup)).view.strings).toBe(2);
    // the same plot again isn't part of the medley: it uses a string
    const again = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: theirs.gx, p_gy: theirs.gy });
    expect(again.puppet.grand).toBe(false);
    expect((await get(ann, pup)).view.strings).toBe(1);
    expect((await db.sql(`select count(*)::int n from enchant_buffs where player_id = $1 and kind = 'grand_show'`, [ann]))[0].n).toBeGreaterThanOrEqual(2);
    await setStars(pup, 0);
  });
});

describe('🃏 Fated Deck', () => {
  let deck: string;
  beforeAll(async () => { deck = await enchant(ann, 'deck'); });

  it('three face-down cards; turn one, then it comes true', async () => {
    const v = await get(ann, deck);
    expect(v.view).toMatchObject({ cards: 3, picks: 1, picked: 0, pending: null });
    expect(v.view.deck).toHaveLength(22);
    const f = await act(ann, deck, 'flip', { i: 1 });
    expect(f.result.card.id).toBeTruthy();
    expect(f.view.pending).toMatchObject({ i: 1, card: f.result.card.id });
    await expectError(act(ann, deck, 'flip', { i: 0 }), 'card_waiting');
    const a = await act(ann, deck, 'accept');
    expect(Array.isArray(a.result.effects)).toBe(true);
    expect(a.view.pending).toBeNull();
    expect((await row(deck)).stats.cards[f.result.card.id]).toBe(1);
    await expectError(act(ann, deck, 'flip', { i: 2 }), 'already_today');
  });

  it('each card does what it says: The Magician’s wins, The Sun’s glow, The Tower’s hits, The Moon’s ticket', async () => {
    const e = await row(deck);
    const fx = async (card: string, up = true) => (await db.sql(`select private.deck_apply(e, $2, $3, false) r from enchantments e where id = $1`, [deck, card, up]))[0].r;
    expect(await fx('magician')).toEqual([{ t: 'wins', m: 2, u: 3 }]);
    expect((await db.sql(`select mult, uses from enchant_buffs where player_id = $1 and kind = 'golden_hour' order by id desc limit 1`, [ann]))[0]).toMatchObject({ uses: 3 });
    await db.sql(`delete from enchant_buffs where player_id = $1 and kind = 'glow'`, [ann]);
    await fx('sun');
    const p = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [deck]))[0].p;
    expect(p.mods.map((m: any) => m.label)).toEqual(expect.arrayContaining([expect.stringMatching(/^Glow ×1\.25/)]));
    await db.sql(`delete from enchant_buffs where player_id = $1 and kind = 'fate_tower'`, [ann]);
    await fx('tower');
    expect(Number((await db.sql(`select private.lev_player_mult($1) m`, [ann]))[0].m)).toBeCloseTo(3, 2);
    const l0 = await luck(ann);
    await fx('star');
    expect(await luck(ann)).toBe(l0 + 15);
    // (the card turned in the first test is random: it may have been The Moon already)
    const tickets = async () => (await db.sql(`select count(*)::int n from roll_tickets where player_id = $1 and source = 'deck'`, [ann]))[0].n;
    const t0 = await tickets();
    await fx('moon');
    expect(await tickets()).toBe(t0 + 1);
    void e;
  });

  it('Rebirth: a plot becomes another kind', async () => {
    await db.sql(`update enchantments set state = state || '{"rebirth": 1}'::jsonb where id = $1`, [deck]);
    const p = (await db.sql(`select gx, gy, plot_type from world_plots where owner_id = $1 and rarity <> 'enchanted' limit 1`, [ann]))[0];
    const to = (await db.sql(`select id from plot_types where weight > 0 and id <> $1 order by sort limit 1`, [p.plot_type]))[0].id;
    const r = await act(ann, deck, 'rebirth', { gx: p.gx, gy: p.gy, type: to });
    expect(r.result.reborn).toMatchObject({ from: p.plot_type, to });
    expect((await db.sql(`select plot_type from world_plots where gx = $1 and gy = $2`, [p.gx, p.gy]))[0].plot_type).toBe(to);
    await expectError(act(ann, deck, 'rebirth', { gx: p.gx, gy: p.gy, type: p.plot_type }), 'no_card');
  });

  it('★1 a fourth card, ★2 hold one for later, ★3 turn a reversed card upright; level 4 lays a Past–Present–Future spread', async () => {
    await setStars(deck, 3);
    await db.sql(`update enchantments set level = 4, state = state || jsonb_build_object('day', 'x') where id = $1`, [deck]);
    const v = await get(ann, deck);
    expect(v.view).toMatchObject({ cards: 4, picks: 3, picked: 0, spread: true, chain: 0, hold_ready: true, right_ready: true });
    await act(ann, deck, 'flip', { i: 3 });
    await db.sql(`update enchantments set state = jsonb_set(state, '{pending,up}', 'false') where id = $1`, [deck]);
    const h = await act(ann, deck, 'accept', { upright: true, hold: true });
    expect(h.result.held).toMatchObject({ up: true, righted: true });
    expect(h.view.hand).toBeTruthy();
    const pl = await act(ann, deck, 'play');
    expect(pl.result.up).toBe(true);
    expect(pl.view.hand).toBeNull();
    await act(ann, deck, 'flip', { i: 0 });
    await db.sql(`update enchantments set state = jsonb_set(state, '{pending,up}', 'false') where id = $1`, [deck]);
    await expectError(act(ann, deck, 'accept', { upright: true }), 'stars_locked');
    await act(ann, deck, 'accept');
    await setStars(deck, 0);
  });
});

describe('✍️ Glyphcaster', () => {
  let gl: string;
  beforeAll(async () => {
    gl = await enchant(ann, 'glyph');
    // (claiming a plot can turn up a glyph by chance — the claim that made this one sometimes did: start from the three)
    await db.sql(`update enchantments set state = state || '{"known": ["spiral", "star", "triangle"]}'::jsonb where id = $1`, [gl]);
  });

  it('starts with three glyphs and 5 mana; a neat Vortex pays, a scrawl fizzles', async () => {
    const v = await get(ann, gl);
    expect(v.view).toMatchObject({ mana: 5, max: 5, known: ['spiral', 'star', 'triangle'] });
    expect(v.view.book).toHaveLength(24);
    await expectError(act(ann, gl, 'cast', { glyph: 'bolt', accuracy: 1 }), 'unknown_glyph');
    await db.sql(`update game_config set value = value || '{"glyph": {"find": 0, "study": 0}}'::jsonb where key = 'enchantments'`);
    const c = await act(ann, gl, 'cast', { glyph: 'spiral', accuracy: 0.9 });
    expect(c.result).toMatchObject({ glyphs: ['spiral'], cost: 1 });
    expect(c.result.pay.paid).toBeGreaterThan(0);
    expect(c.view.mana).toBe(4);
    const f = await act(ann, gl, 'cast', { glyph: 'spiral', accuracy: 0.1 });
    expect(f.result.fizzled).toBe(true);
    expect(f.view.mana).toBe(3);
  });

  it('a better drawing is a stronger spell (within a cap); a Ward protects a plot from pranks', async () => {
    await db.sql(`update enchantments set state = state || '{"mana": 5}'::jsonb where id = $1`, [gl]);
    const a = await act(ann, gl, 'cast', { glyph: 'spiral', accuracy: 0.4 });
    const b = await act(ann, gl, 'cast', { glyph: 'spiral', accuracy: 5 });
    expect(b.result.accuracy).toBe(1);
    expect(Number(b.result.power)).toBeGreaterThan(Number(a.result.power));
    const p = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' limit 1`, [ann]))[0];
    await act(ann, gl, 'cast', { glyph: 'triangle', accuracy: 1, gx: p.gx, gy: p.gy });
    await expectError(db.sql(`select private.ray_prank_check($1, $2, $3, $4)`, [bob, ann, p.gx, p.gy]), 'anchored');
  });

  it('studying finds new glyphs; mastery makes them cheaper; secrets wait for the twenty', async () => {
    await db.sql(`update game_config set value = value || '{"glyph": {"find": 0, "study": 1}}'::jsonb where key = 'enchantments'`);
    const k0 = (await row(gl)).state.known.length as number;
    const s = await act(ann, gl, 'study');
    expect(s.result.found).toBeTruthy();
    expect(s.result.found.secret).toBeUndefined();
    expect(s.view.known).toHaveLength(k0 + 1);
    await expectError(act(ann, gl, 'study'), 'already_today');
    // mastered (10 casts): a 2-mana glyph costs 1
    await db.sql(`update enchantments set state = state || '{"mana": 5, "mastery": {"triangle": 10}}'::jsonb where id = $1`, [gl]);
    const p = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' limit 1`, [ann]))[0];
    const c = await act(ann, gl, 'cast', { glyph: 'triangle', accuracy: 1, gx: p.gx, gy: p.gy });
    expect(c.result.cost).toBe(1);
  });

  it('★2 Chain Cast (two at once, 50% stronger), ★3 Archmage (full strength once a day); Thunder makes Leviathan hits ×3 drawn perfectly', async () => {
    await setStars(gl, 3);
    await db.sql(`update enchantments set state = state || '{"mana": 7, "known": ["spiral", "star", "triangle", "bolt"]}'::jsonb where id = $1`, [gl]);
    const c = await act(ann, gl, 'cast', { glyphs: ['spiral', 'star'], accuracy: 0.8 });
    expect(c.result).toMatchObject({ chain: true, cost: 2 });
    expect(Number(c.result.power)).toBeCloseTo((0.6 + 0.4 * 0.8) * 1.5, 2);
    const b = await act(ann, gl, 'cast', { glyph: 'bolt', accuracy: 0.2, arch: true });
    expect(b.result).toMatchObject({ arch: true, accuracy: 1 });
    expect(b.result.effects[0]).toMatchObject({ t: 'bolt', m: 3 });
    await expectError(act(ann, gl, 'cast', { glyph: 'spiral', accuracy: 1, arch: true }), 'stars_locked');
    await setStars(gl, 0);
  });
});

describe('the last three Traits', () => {
  // (a swap is sometimes an Aberration, which wears the Trait at strength 3: keep these plain)
  beforeAll(async () => {
    await db.sql(`update game_config set value = jsonb_set(value, '{splice}', coalesce(value -> 'splice', '{}'::jsonb) || '{"aberration": 0}'::jsonb) where key = 'enchantments'`);
  });
  it('Strings: a puppet does one of the partner’s chores (or another enchantment’s) once a day', async () => {
    const sp = await enchant(bob, 'splice');
    const pup = await enchant(bob, 'puppeteer');
    const g = await enchant(bob, 'goose');
    await db.sql(`update enchantments set state = state || '{"charges": 3}'::jsonb where id = $1`, [sp]);
    await act(bob, sp, 'splice', { mode: 'swap', a: pup, b: g });
    // (the goose's partner wears Strings now — run the daily Traits by hand)
    const r = (await db.sql(`select private.trait_strings_run($1) r`, [g]))[0].r;
    expect(r).toMatchObject({ kind: 'goose' });
    expect(['polished its egg', 'collected its golden egg', 'chased the fox off its egg']).toContain(r.label);
    expect((await db.sql(`select private.trait_strings_run($1) r`, [g]))[0].r).toBeNull();
    const v = await get(bob, g);
    expect(v.traits.strings).toMatchObject({ k: 1, done: 1, own: true });
    expect(v.traits.strings.last.label).toBe(r.label);
    // no Ink from it any more
    const p = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [g]))[0].p;
    expect(p.mods.map((x: any) => x.label).join(' ')).not.toMatch(/Strings/);
  });

  it('Fated: a partner’s reward sometimes draws a card — and the card comes true', async () => {
    const sp = await enchant(bob, 'splice');
    const deck = await enchant(bob, 'deck');
    const g = await enchant(bob, 'goose');
    await db.sql(`update enchantments set state = state || '{"charges": 3}'::jsonb where id = $1`, [sp]);
    await act(bob, sp, 'splice', { mode: 'swap', a: deck, b: g });
    let hit: any = null;
    for (let i = 0; i < 120 && !hit; i++) {
      const p = (await db.sql(`select private.ench_pay($1, 10, 'test') p`, [g]))[0].p;
      hit = p.mods.find((m: any) => String(m.label).startsWith('Fated: '));
    }
    expect(hit.label).toMatch(/^Fated: .+ came true — /);
    expect(hit.card).toBeTruthy();
    const e = await row(g);
    expect(e.stats.fated_n).toBeGreaterThanOrEqual(1);
    expect(e.stats.fated_last.card).toBe(hit.card);
  });

  it('Inscribed: trace the partner’s rune once a day — it casts that glyph for free, as strong as it was drawn', async () => {
    const sp = await enchant(bob, 'splice');
    const gl = await enchant(bob, 'glyph');
    const m = await enchant(bob, 'map');
    await db.sql(`update enchantments set state = state || '{"charges": 3}'::jsonb where id = $1`, [sp]);
    await act(bob, sp, 'splice', { mode: 'swap', a: gl, b: m });
    const v = await get(bob, m);
    expect(v.traits.rune).toMatchObject({ k: 1, glyph: 'anchor', name: 'Steady', ready: true });
    const f = await act(bob, m, 'trait_rune', { accuracy: 0.1 });
    expect(f.result).toMatchObject({ fizzled: true });
    const l0 = await luck(bob);
    const r = await act(bob, m, 'trait_rune', { accuracy: 1 });
    expect(r.result).toMatchObject({ glyph: 'anchor', name: 'Steady', accuracy: 1 });
    expect(await luck(bob)).toBe(l0 + 8);
    expect(r.traits.rune.ready).toBe(false);
    await expectError(act(bob, m, 'trait_rune', { accuracy: 1 }), 'already_today');
    // a kind without the Trait can't
    await expectError(act(bob, gl, 'trait_rune', { accuracy: 1 }), 'no_trait');
  });
});
