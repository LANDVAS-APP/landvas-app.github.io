// Enchantments, part 8: the six newest as pitched. Tempered tempers a plot; the Fated Deck's reversed cards are bigger with
// a catch, the Wheel is a free reroll, the level-4 spread chains and the level-8 Grand Spread turns five; glyphs have hints,
// turn up in chests, the Vortex pulls your chests in and Thunder strikes the Leviathan; the Weak Spot, Paper Shield,
// Tangle, The Tower and a drawn Thunder Glyph against it; a folded plot's drawing travels; a Mirror Shard can pull strings;
// the Spyglass says "something stirs"; fair-play logs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string;
const O = { gx: 667_820, gy: 1_500_180 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `pt-${++k}-00000000` });
const claim = (uid: string, dx: number, dy = 0) => claimAt(uid, O.gx + dx, O.gy + dy);
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
let spot = 0;
async function enchant(uid: string, kind: string) {
  await force(kind);
  const r = await claim(uid, (spot++) * 3, uid === ann ? 0 : 40);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
const luck = async (uid: string) => (await db.sql(`select coalesce(luck, 0) luck, coalesce(armed, 0) armed from player_luck where player_id = $1`, [uid]))[0] ?? { luck: 0, armed: 0 };
const splice = async (uid: string, a: string, b: string) => {
  const sp = await enchant(uid, 'splice');
  await db.sql(`update enchantments set state = state || '{"charges": 3}'::jsonb where id = $1`, [sp]);
  await act(uid, sp, 'splice', { mode: 'swap', a, b });
  return sp;
};

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('pt_owner'); ann = await db.newPlayer('pt_ann'); bob = await db.newPlayer('pt_bob');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 500_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'leviathan'`);
  await db.sql(`insert into player_luck (player_id, luck) values ($1, 0), ($2, 0) on conflict (player_id) do nothing`, [ann, bob]);
  await claim(ann, 900, 0); await claim(bob, 900, 40);
});
afterAll(() => db.close());

describe('🔥 Tempered', () => {
  it('its plot is tempered: no Parasites, no pranks, no tramples — and no Ink from it', async () => {
    const cru = await enchant(ann, 'crucible');
    const g = await enchant(ann, 'goose');
    await splice(ann, cru, g);
    const e = await row(g);
    expect((await db.sql(`select private.ench_tempered_at($1, $2) t`, [e.gx, e.gy]))[0].t).toBe(true);
    expect((await db.sql(`select private.cru_anchored($1, $2) t`, [e.gx, e.gy]))[0].t).toBe(true);
    expect((await db.sql(`select private.lev_safe($1, $2, $3) t`, [ann, e.gx, e.gy]))[0].t).toBe(true);
    await expectError(db.sql(`select private.ray_prank_check($1, $2, $3, $4)`, [bob, ann, e.gx, e.gy]), 'anchored');
    const v = await get(ann, g);
    expect(v.traits.tempered.k).toBeGreaterThanOrEqual(1);
    const p = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [cru]))[0].p;
    expect(p.mods.map((m: any) => m.label).join(' ')).not.toMatch(/Tempered/);
  });
});

describe('🃏 the Fated Deck as pitched', () => {
  it('a reversed card is bigger, with a catch; the Wheel of Fortune is a free reroll', async () => {
    const deck = await enchant(bob, 'deck');
    await db.sql(`update player_luck set luck = 30, armed = 0 where player_id = $1`, [bob]);
    const fx = (await db.sql(`select private.deck_apply(e, 'emperor', false, false) x from enchantments e where e.id = $1`, [deck]))[0].x;
    expect(fx.find((f: any) => f.t === 'ink').v).toBeGreaterThan(80);
    expect(fx.find((f: any) => f.t === 'luck').v).toBe(-8);
    expect((await luck(bob)).luck).toBe(22);
    const w = (await db.sql(`select private.deck_apply(e, 'wheel', true, false) x from enchantments e where e.id = $1`, [deck]))[0].x;
    expect(w).toEqual([{ t: 'reroll', v: 1 }]);
    const l = await luck(bob);
    expect(l.armed).toBe(1);
    expect(l.luck).toBeGreaterThanOrEqual(22 + 20);
    expect((await db.sql(`select private.deck_fx_text($1::jsonb) t`, [JSON.stringify(fx)]))[0].t).toMatch(/Ink, -8 Luck/);
  });

  it('level 4: a Past–Present–Future spread — each upright card that comes true strengthens the next', async () => {
    const deck = await enchant(bob, 'deck');
    await db.sql(`update enchantments set level = 4 where id = $1`, [deck]);
    expect((await get(bob, deck)).view).toMatchObject({ picks: 3, spread: true, chain: 0, chain_mult: 1 });
    const f1 = await act(bob, deck, 'flip', { i: 0 });
    expect(f1.result.pos).toBe('Past');
    await db.sql(`update enchantments set state = jsonb_set(jsonb_set(state, '{pending,up}', 'true'), '{pending,card}', '"emperor"') where id = $1`, [deck]);
    const a1 = await act(bob, deck, 'accept');
    expect(a1.result).toMatchObject({ mult: 1, chain: 1 });
    const f2 = await act(bob, deck, 'flip', { i: 1 });
    expect(f2.result.pos).toBe('Present');
    await db.sql(`update enchantments set state = jsonb_set(jsonb_set(state, '{pending,up}', 'true'), '{pending,card}', '"emperor"') where id = $1`, [deck]);
    const a2 = await act(bob, deck, 'accept');
    expect(a2.result).toMatchObject({ mult: 1.25, chain: 2 });
    await act(bob, deck, 'flip', { i: 2 });
    await db.sql(`update enchantments set state = jsonb_set(state, '{pending,up}', 'false') where id = $1`, [deck]);
    const a3 = await act(bob, deck, 'accept');
    expect(a3.result).toMatchObject({ mult: 1, chain: 0 });
    await expectError(act(bob, deck, 'flip', { i: 1 }), 'already_flipped');
  });

  it('level 8: once a week, the Grand Spread turns five at once', async () => {
    const deck = await enchant(bob, 'deck');
    await expectError(act(bob, deck, 'grand'), 'grand_locked');
    await db.sql(`update enchantments set level = 8 where id = $1`, [deck]);
    expect((await get(bob, deck)).view.grand_ready).toBe(true);
    const g = await act(bob, deck, 'grand');
    expect(g.result.grand).toHaveLength(5);
    for (const c of g.result.grand) { expect(c.card.id).toBeTruthy(); expect(Number(c.mult)).toBeGreaterThanOrEqual(1); }
    await expectError(act(bob, deck, 'grand'), 'already_week');
    expect(Number((await row(deck)).stats.draws)).toBe(5);
  });
});

describe('✍️ glyphs as pitched', () => {
  it('every page has a hint; the Vortex pulls your buried chests in', async () => {
    const book = (await db.sql(`select private.glyph_book() b`))[0].b;
    expect(book).toHaveLength(24);
    for (const g of book) expect(g.hint).toBeTruthy();
    const gl = await enchant(ann, 'glyph');
    const e = await row(gl);
    await db.sql(`insert into seek_chests (player_id, enchant_id, finder_kind, gx, gy, ink) values ($1, $2, 'glyph', $3, $4, 50), ($1, $2, 'glyph', $3 + 5000, $4, 50)`, [ann, gl, e.gx + 3, e.gy]);
    const r = await act(ann, gl, 'cast', { glyph: 'spiral', accuracy: 1 });
    expect(r.result.effects).toEqual(expect.arrayContaining([expect.objectContaining({ t: 'pull', n: 1 })]));
    expect((await db.sql(`select count(*)::int n from seek_chests where player_id = $1 and dug_at is null`, [ann]))[0].n).toBe(1);
  });

  it('glyphs turn up in chests, minigame wins, Leviathan loot and rare plots', async () => {
    const gl = (await db.sql(`select id from enchantments where owner_id = $1 and kind = 'glyph'`, [ann]))[0].id;
    const before = (await row(gl)).state.known?.length ?? 3;
    const found = (await db.sql(`select private.glyph_drop($1, 'chest', 1) g`, [ann]))[0].g;
    expect(found).toBeTruthy();
    const e = await row(gl);
    expect(e.state.known).toHaveLength(before + 1);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'glyph_found'`, [ann]))[0].n).toBeGreaterThanOrEqual(1);
    // nobody without a Glyphcaster finds one
    expect((await db.sql(`select private.glyph_drop($1, 'chest', 1) g`, [owner]))[0].g).toBeNull();
  });
});

describe('🐉 the six against the Leviathan', () => {
  let ids: Record<string, string> = {};
  beforeAll(async () => {
    for (const kd of ['spyglass', 'origami', 'puppeteer', 'deck', 'glyph']) ids[kd] = await enchant(ann, kd);
    await db.rpc(owner, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } });
    await db.sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second', status = 'walking' where status in ('warning', 'walking')`);
  });
  const hit = (id: string) => db.rpc(ann, 'leviathan_hit', { p_move: 'enchant', p_n: 1, p_enchant: id });

  it('Weak Spot: everyone hits ×2 for 10 seconds', async () => {
    const r = await hit(ids.spyglass);
    expect(r.effect).toBe('weakspot');
    expect(r.label).toMatch(/×2 for 10 s/);
    const l = (await db.sql(`select weakspot_until > now() w, private.lev_mult(l) m from leviathans l where status = 'walking'`))[0];
    expect(l.w).toBe(true);
    expect(Number(l.m)).toBeGreaterThanOrEqual(2);
  });
  it('Paper Shield: your plots fold out of its path', async () => {
    const r = await hit(ids.origami);
    expect(r.effect).toBe('shield');
    const p = (await db.sql(`select gx, gy from world_plots where owner_id = $1 limit 1`, [ann]))[0];
    expect((await db.sql(`select private.lev_safe($1, $2, $3) s`, [ann, p.gx, p.gy]))[0].s).toBe(true);
  });
  it('Tangle holds it back; The Tower hits ×1 to ×5', async () => {
    const t = await hit(ids.puppeteer);
    expect(t.effect).toBe('tangle');
    expect((await db.sql(`select pause_until > now() + interval '8 minutes' p from leviathans where status = 'walking'`))[0].p).toBe(true);
    expect((await db.sql(`select private.lev_move('deck') m`))[0].m).toEqual(['The Tower', 1.0, 5.0, null]);
  });
  it('Thunder Glyph: how well you draw it sets the damage', async () => {
    await db.sql(`update leviathans set weakspot_until = null where status = 'walking'`);
    const lo = await db.rpc(ann, 'leviathan_glyph', { p_enchant: ids.glyph, p_accuracy: 0 });
    expect(lo.label).toMatch(/drawn 0%/);
    await db.sql(`update leviathan_players set moves = '{}'::jsonb where player_id = $1`, [ann]);
    const hi = await db.rpc(ann, 'leviathan_glyph', { p_enchant: ids.glyph, p_accuracy: 1 });
    expect(hi.label).toMatch(/drawn 100%/);
    expect(Number(hi.dmg)).toBeGreaterThan(Number(lo.dmg) * 3);
  });
  it('the Thunder glyph strikes it from the Spellbook', async () => {
    await db.sql(`update enchantments set state = state || '{"known": ["spiral", "star", "triangle", "bolt"], "mana": 5}'::jsonb where id = $1`, [ids.glyph]);
    const r = await act(ann, ids.glyph, 'cast', { glyph: 'bolt', accuracy: 1 });
    expect(r.result.effects).toEqual(expect.arrayContaining([expect.objectContaining({ t: 'strike' })]));
    expect((await db.sql(`select count(*)::int n from leviathan_hits where player_id = $1 and move = 'glyph'`, [ann]))[0].n).toBe(1);
  });
});

describe('🦢 a folded plot’s drawing travels', () => {
  it('its canvas, its Studio project (re-keyed) and its published tile go to the new cell', async () => {
    const ori = await enchant(ann, 'origami');
    const p = await claim(ann, 1200, 0);
    await db.sql(`update world_plots set claimed_at = now() - interval '2 days' where gx = $1 and gy = $2`, [p.gx, p.gy]);
    const g = (await db.sql(`select gr.* from canvas_group_members m join canvas_groups gr on gr.id = m.group_id where m.gx = $1 and m.gy = $2`, [p.gx, p.gy]))[0];
    const pr = (await db.sql(`select * from artwork_projects where group_id = $1`, [g.id]))[0];
    const key = `${p.gx}_${p.gy}`;
    // a drawing: one tile in the current version, a published tile on the map
    const v = (await db.sql(`select * from artwork_versions where id = $1`, [pr.current_version_id]))[0];
    const man = { layers: [{ id: 'layer-1', name: 'Layer 1', opacity: 1, visible: true, tiles: { [key]: 'abc123' } }] };
    const v1 = (await db.sql(`insert into artwork_versions (project_id, owner_id, version_no, parent_version_id, kind, manifest, cells, layer_count, tile_count)
      values ($1, $2, $3, $4, 'save', $5, $6, 1, 1) returning id`, [pr.id, ann, Number(v.version_no) + 1, v.id, JSON.stringify(man), JSON.stringify([[p.gx, p.gy]])]))[0].id;
    await db.sql(`update artwork_projects set current_version_id = $2 where id = $1`, [pr.id, v1]);
    const pub = (await db.sql(`insert into artwork_publications (owner_id, project_id, version_id, group_id, title, cells, plot_count, min_gx, min_gy, max_gx, max_gy, center_lng, center_lat, status, rights_affirmed_at, terms_version)
      values ($1, $2, $3, $4, 'Mine', $5, 1, $6, $7, $6, $7, 0, 0, 'published', now(), 'v1') returning id`, [ann, pr.id, v1, g.id, JSON.stringify([[p.gx, p.gy]]), p.gx, p.gy]))[0].id;
    await db.sql(`update world_plots set art_publication_id = $3, art_rev = 77 where gx = $1 and gy = $2`, [p.gx, p.gy, pub]);
    await act(ann, ori, 'fold', { gx: p.gx, gy: p.gy });
    const to = [O.gx + 1300, O.gy + 5];
    const u = await act(ann, ori, 'unfold', { gx: p.gx, gy: p.gy, to_gx: to[0], to_gy: to[1] });
    expect(u.result.drawing).toBe(true);
    const m = (await db.sql(`select group_id from canvas_group_members where gx = $1 and gy = $2`, [to[0], to[1]]))[0];
    expect(m.group_id).toBe(g.id);
    const pr2 = (await db.sql(`select * from artwork_projects where id = $1`, [pr.id]))[0];
    expect(pr2.status).toBe('active');
    const v2 = (await db.sql(`select * from artwork_versions where id = $1`, [pr2.current_version_id]))[0];
    expect(v2.manifest.layers[0].tiles).toEqual({ [`${to[0]}_${to[1]}`]: 'abc123' });
    expect((await db.sql(`select art_publication_id from world_plots where gx = $1 and gy = $2`, [to[0], to[1]]))[0].art_publication_id).toBe(pub);
    const job = (await db.sql(`select payload from private.render_jobs where kind = 'move_art' order by id desc limit 1`))[0];
    expect(job.payload).toMatchObject({ from: [p.gx, p.gy], to, rev: 77, publication_id: pub });
    await db.rpc({ role: 'service_role' }, 'svc_art_moved', { p_to: to, p_rev: 88, p_publication_id: pub });
    expect((await db.sql(`select art_rev from world_plots where gx = $1 and gy = $2`, [to[0], to[1]]))[0].art_rev).toBe('88');
    // logged for fair play
    expect((await db.sql(`select kind from private.fairplay_log where player_id = $1 and kind in ('fold', 'unfold') order by id`, [ann])).map((r: any) => r.kind)).toEqual(['fold', 'unfold']);
  });
});

describe('🔭 the Spyglass as pitched', () => {
  it('"something stirs": an Enchanted reading hides its kind until it’s claimed; a look is logged', async () => {
    const sg = await enchant(bob, 'spyglass');
    const e = await row(sg);
    await db.sql(`update game_config set value = value || '{"base_pct": 100}'::jsonb where key = 'enchantments'`);
    const r = await act(bob, sg, 'look', { gx: e.gx + 7, gy: e.gy + 7 });
    await db.sql(`update game_config set value = value - 'base_pct' where key = 'enchantments'`);
    expect(r.result.sighting).toMatchObject({ rarity: 'enchanted', kind: null, stirs: true });
    expect((await db.sql(`select count(*)::int n from private.fairplay_log where player_id = $1 and kind = 'spy_look'`, [bob]))[0].n).toBe(1);
  });
});
