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

describe('the twenty', () => {
  it('twenty kinds, 171 hybrids, three powers and a Leviathan move each; the egg can hatch into any of the six', async () => {
    const ks = (await db.sql(`select private.ench_kinds() k`))[0].k;
    expect(ks).toHaveLength(20);
    expect(ks).toEqual(expect.arrayContaining(['spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'ouroboros', 'homunculus']));
    expect((await db.sql(`select private.ench_hybrid_count() n`))[0].n).toBe(171);
    const r = await db.sql(`select k, jsonb_array_length(private.ench_star_powers(k)) n, private.lev_move(k) m, private.ench_info(k) i from unnest(private.ench_kinds()) k`);
    for (const x of r) { expect(x.n).toBe(3); expect(x.m).toBeTruthy(); expect(x.i.name).toBeTruthy(); }
    expect((await db.sql(`select private.ench_hybrid('deck', 'oracle') h`))[0].h).toEqual(['Book of Fates', true]);
    expect((await db.sql(`select private.ench_hybrid('glyph', 'stormcoil') h`))[0].h).toEqual(['Thunder Script', true]);
    expect((await db.sql(`select private.ench_hatchable() h`))[0].h).toEqual(['spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph']);
  });
});

describe('🎭 Puppeteer', () => {
  let pup: string; let theirs: { gx: number; gy: number };
  beforeAll(async () => {
    pup = await enchant(ann, 'puppeteer');
    const r = await claim(bob, 30, 3);
    theirs = { gx: r.gx, gy: r.gy };
    await db.sql(`update world_plots set plot_type = 'clay', rarity = 'common' where gx = $1 and gy = $2`, [theirs.gx, theirs.gy]);
  });

  it('lists other players’ plots nearby, and plays one of them on strings — a real session', async () => {
    const v = await get(ann, pup);
    expect(v.view).toMatchObject({ strings: 2, max: 2, range_m: 5000 });
    expect(v.view.nearby.some((p: any) => p.gx === theirs.gx && p.gy === theirs.gy && p.game === 'sculptor')).toBe(true);
    const s = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: theirs.gx, p_gy: theirs.gy });
    expect(s).toMatchObject({ game: 'sculptor', level: 1, puppet: { id: pup } });
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
    expect(e.stats.repertoire).toHaveProperty('sculptor');
    // Ann climbs her own track on Bob's plot; Bob's is untouched
    expect((await db.sql(`select coalesce(max(highest_level), 0) n from plot_game_progress where gx = $1 and gy = $2 and player_id = $3`, [theirs.gx, theirs.gy, bob]))[0].n).toBe(0);
    expect((await db.sql(`select max(highest_level) n from plot_game_progress where gx = $1 and gy = $2 and player_id = $3`, [theirs.gx, theirs.gy, ann]))[0].n).toBe(1);
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
    await db.sql(`update enchantments set state = state || '{"strings": 2}'::jsonb where id = $1`, [pup]);
    const far = (await db.sql(`select gx, gy from world_plots where owner_id = $1 order by gx desc limit 1`, [bob]))[0];
    await db.sql(`update world_plots set plot_type = 'clay' where gx = $1 and gy = $2`, [far.gx, far.gy]);
    const s = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: far.gx, p_gy: far.gy });
    expect(s.puppet.grand).toBe(true);
    const plain = await db.rpc(ann, 'puppet_start', { p_id: pup, p_gx: theirs.gx, p_gy: theirs.gy });
    expect(plain.puppet.grand).toBe(false);
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
    await fx('tower');
    expect(Number((await db.sql(`select private.lev_player_mult($1) m`, [ann]))[0].m)).toBeCloseTo(3, 2);
    const l0 = await luck(ann);
    await fx('star');
    expect(await luck(ann)).toBe(l0 + 15);
    await fx('moon');
    expect((await db.sql(`select count(*)::int n from roll_tickets where player_id = $1 and source = 'deck'`, [ann]))[0].n).toBe(1);
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

  it('★1 a fourth card, ★2 hold one for later, ★3 turn a reversed card upright; level 4 turns two a day', async () => {
    await setStars(deck, 3);
    await db.sql(`update enchantments set level = 4, state = state || jsonb_build_object('day', 'x') where id = $1`, [deck]);
    const v = await get(ann, deck);
    expect(v.view).toMatchObject({ cards: 4, picks: 2, picked: 0, hold_ready: true, right_ready: true });
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
  beforeAll(async () => { gl = await enchant(ann, 'glyph'); });

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
    const s = await act(ann, gl, 'study');
    expect(s.result.found).toBeTruthy();
    expect(s.result.found.secret).toBeUndefined();
    expect(s.view.known).toHaveLength(4);
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
  it('Strings, Fated and Inscribed pay on any kind', async () => {
    const sp = await enchant(bob, 'splice');
    const pup = await enchant(bob, 'puppeteer');
    const gl = await enchant(bob, 'glyph');
    const g = await enchant(bob, 'goose');
    const m = await enchant(bob, 'map');
    await db.sql(`update enchantments set state = state || '{"charges": 3}'::jsonb where id = $1`, [sp]);
    await act(bob, sp, 'splice', { mode: 'swap', a: pup, b: g });
    const p1 = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [g]))[0].p;
    expect(p1.mods.map((x: any) => x.label)).toEqual(expect.arrayContaining(['Strings +15%', 'Strings: a puppet played it twice']));
    const p2 = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [g]))[0].p;
    expect(p2.mods.map((x: any) => x.label)).not.toContain('Strings: a puppet played it twice');
    await db.sql(`update enchant_splices set ends_at = now() where splice_id = $1`, [sp]);
    await db.sql(`update enchantments set state = state || '{"charges": 3}'::jsonb where id = $1`, [sp]);
    await act(bob, sp, 'splice', { mode: 'swap', a: gl, b: m });
    const labels: string[] = [];
    for (let i = 0; i < 4; i++) labels.push(...(await db.sql(`select private.ench_pay($1, 100, 'test') p`, [m]))[0].p.mods.map((x: any) => x.label));
    expect(labels).toContain('Inscribed ×1.75');
  });
});
