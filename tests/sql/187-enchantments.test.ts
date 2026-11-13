// Enchantments: the 2% roll, Enchanted Luck, the Altar's any-Ink offering, and every one of the ten enchantments.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string, cat: string;
const O = { gx: 793_400, gy: 1_576_300 }; // Salt Lake City-ish
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `en-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
async function enchant(uid: string, kind: string, dx: number, dy = 0) {
  await force(kind);
  const r = await claim(uid, dx, dy);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const skip = (id: string, secs: number) => db.sql(`update enchantments set clock_skip = clock_skip + $2 where id = $1`, [id, secs]);
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const st = async (id: string) => (await db.sql(`select state from enchantments where id = $1`, [id]))[0].state;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ids: Record<string, string> = {};

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('ench_owner'); ann = await db.newPlayer('ench_ann'); bob = await db.newPlayer('ench_bob'); cat = await db.newPlayer('ench_cat');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 200_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  // Bob and Cat have land around Ann's
  for (let i = 0; i < 6; i++) { await claim(bob, 40 + i * 3, 10); await claim(cat, -40 - i * 3, -10); }
});
afterAll(() => db.close());

describe('the roll', () => {
  it('an enchanted roll takes the place of the rarity, mints a numbered, unique enchantment and is on the feed', async () => {
    await force('goose');
    const r = await claim(ann, 0);
    await force('');
    expect(r.rarity).toBe('enchanted');
    expect(r.enchant).toMatchObject({ kind: 'goose', serial: 1, name: 'Golden Goose', emoji: '🪿' });
    expect(r.enchant.sigil).toBeGreaterThan(0);
    expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [O.gx, O.gy]))[0].rarity).toBe('enchanted');
    expect((await db.sql(`select data from feed_events where player_id = $1 and kind = 'enchant'`, [ann]))[0].data).toMatchObject({ sub: 'born', kind: 'goose', serial: 1 });
    ids.goose = r.enchant.id;
  });
  it('2% by default; Enchanted Luck from the Altar raises the chance and is used up by the next roll', async () => {
    expect(Number((await db.sql(`select value ->> 'base_pct' v from game_config where key = 'enchantments' and $1::int = 1`, [1]))[0].v)).toBe(0); // (off for this suite's setup)
    await db.sql(`update game_config set value = value || '{"base_pct": 2}' where key = 'enchantments'`);
    const before = await ink(bob);
    const l = await db.rpc(bob, 'luck_enchant', { p_charges: 3 });
    expect(l.enchant).toBe(3); expect(Number(l.enchant_pct)).toBe(8); expect(before - (await ink(bob))).toBe(450);
    await claim(bob, 80, 10);
    expect((await db.rpc(bob, 'luck_status')).enchant).toBe(0);
    // a guaranteed roll when the chance is 100%
    await db.sql(`update game_config set value = value || '{"base_pct": 100}' where key = 'enchantments'`);
    expect((await claim(bob, 84, 10)).rarity).toBe('enchanted');
    await db.sql(`update game_config set value = value || '{"base_pct": 0}' where key = 'enchantments'`);
    expect((await claim(bob, 88, 10)).rarity).not.toBe('enchanted');
  });
  it('the Altar takes any amount of Ink for Luck (only what fits is charged)', async () => {
    await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'true') where key = 'luck'`);
    const b = await ink(cat);
    const r = await db.rpc(cat, 'luck_offer_ink_amount', { p_ink: 1234 });
    expect(r.gained).toBe(24); expect(Number(r.cost)).toBe(1200); expect(b - (await ink(cat))).toBe(1200);
    const r2 = await db.rpc(cat, 'luck_offer_ink_amount', { p_ink: 1_000_000 });
    expect(r2.luck).toBe(100); expect(Number(r2.cost)).toBe(76 * 50);
    await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  });
});

describe('🪿 Golden Goose', () => {
  it('the egg grows; polishing adds to it; a fox comes in a window and can be chased', async () => {
    const v0 = await act(ann, ids.goose, 'polish');
    expect(v0.view.polish).toBe(3);
    await expectError(act(ann, ids.goose, 'polish'), 'too_soon');
    await expectError(act(ann, ids.goose, 'collect'), 'egg_not_ready');
    // jump to the first fox's window
    const first = (await db.sql(`select (private.goose_visits(e, (e.state ->> 'egg_at')::numeric, 0))[1] - (e.state ->> 'egg_at')::numeric s from enchantments e where id = $1`, [ids.goose]))[0].s;
    await skip(ids.goose, Number(first) + 60);
    const v = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    expect(v.view.lurking).toBe(0); expect(v.attention).toMatch(/fox/i);
    const c = await act(ann, ids.goose, 'chase');
    expect(c.result.chased).toBe(true);
    expect(c.view.lurking).toBeNull();
  });
  it('an unchased fox bites the egg; collecting pays the egg in Ink and starts a new one', async () => {
    const g = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    const second = g.view.visits.length ? null : null; void second;
    await skip(ids.goose, 10 * 3600); // hours pass: more foxes come and go
    const v = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    expect(v.view.bites).toBeGreaterThan(0);
    const b = await ink(ann);
    const r = await act(ann, ids.goose, 'collect');
    expect(r.result.pay.paid).toBeGreaterThan(0);
    expect(await ink(ann)).toBe(b + r.result.pay.paid);
    expect(r.view.eggs).toBe(1); expect(r.view.streak).toBe(0); // bitten: no streak
    // a fresh egg is small (one in ~33 eggs is platinum: worth 3x)
    expect(r.view.value).toBeLessThan(r.view.platinum ? 30 : 10);
  });
});

describe('🧞 Genie', () => {
  it('a wish for Ink, a wish for Enchanted Luck; wishes recharge; the Forbidden Wish needs three', async () => {
    ids.genie = await enchant(ann, 'genie', 4);
    const b = await ink(ann);
    const w = await act(ann, ids.genie, 'wish', { wish: 'ink' });
    expect(w.result.pay.paid).toBeGreaterThanOrEqual(40); expect(await ink(ann)).toBe(b + w.result.pay.paid);
    await expectError(act(ann, ids.genie, 'wish', { wish: 'ink' }), 'no_wishes');
    await expectError(act(ann, ids.genie, 'forbidden'), 'need_three_wishes');
    await skip(ids.genie, 8 * 3600 + 5);
    const e = await act(ann, ids.genie, 'wish', { wish: 'enchant' });
    expect(e.result.now.enchant).toBe(1);
    await skip(ids.genie, 24 * 3600 + 5);
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.genie })).view.wishes).toBe(3);
    const f = await act(ann, ids.genie, 'forbidden');
    expect(['granted', 'twisted', 'freed']).toContain(f.result.forbidden);
    if (f.result.forbidden === 'granted') expect(f.view.wishes).toBe(7);
    if (f.result.forbidden === 'freed') expect((await db.sql(`select count(*)::int n from roll_tickets where player_id = $1 and min_rarity = 'mythic'`, [ann]))[0].n).toBe(1);
    expect(f.titles).toContain('Forbidden');
  });
  it('a Golden Hour doubles the next minigame wins', async () => {
    await db.sql(`delete from enchant_buffs where player_id = $1`, [ann]);
    await db.sql(`insert into enchant_buffs (player_id, kind, mult, uses, expires_at) values ($1, 'golden_hour', 2, 3, now() + interval '1 hour')`, [ann]);
    expect(Number((await db.sql(`select private.ench_minigame_mult($1, 0, 0) m`, [ann]))[0].m)).toBe(2);
    expect((await db.sql(`select uses from enchant_buffs where player_id = $1`, [ann]))[0].uses).toBe(2);
  });
});

describe('🗺️ Treasure Map', () => {
  it('four pieces on other players’ plots; walk to each; their owners get a tip; then the X and the chest', async () => {
    ids.map = await enchant(ann, 'map', 8);
    const d = await act(ann, ids.map, 'draw');
    const pieces = d.view.pieces;
    expect(pieces).toHaveLength(4);
    expect(pieces.filter((p: any) => !p.wild).every((p: any) => [bob, cat].includes(p.owner))).toBe(true);
    await expectError(act(ann, ids.map, 'collect', { i: 0 }), 'too_far');
    const bobInk = await ink(bob), catInk = await ink(cat);
    for (let i = 0; i < 4; i++) {
      await db.placeAt(ann, pieces[i].gx, pieces[i].gy);
      const r = await act(ann, ids.map, 'collect', { i });
      expect(r.result.found).toBe(i + 1);
    }
    const tipped = (await ink(bob)) - bobInk + (await ink(cat)) - catInk;
    expect(tipped).toBe(3 * pieces.filter((p: any) => !p.wild).length);
    const v = await db.rpc(ann, 'enchant_get', { p_id: ids.map });
    expect(v.view.x).toBeTruthy();
    await db.placeAt(ann, v.view.x.gx, v.view.x.gy);
    let r: any;
    for (let i = 0; i < 5; i++) { r = await act(ann, ids.map, 'dig'); await sleep(380); }
    expect(r.result.chest).toBe(true); expect(r.result.pay.paid).toBeGreaterThanOrEqual(120);
    expect(r.view.pieces).toHaveLength(0); expect(r.view.can_draw).toBe(false);
  });
});

describe('🦠 Parasite', () => {
  it('leaps onto a player’s plot; the host can shake it off (and is paid); otherwise it feeds', async () => {
    ids.parasite = await enchant(ann, 'parasite', 12);
    const r = await act(ann, ids.parasite, 'release');
    const host = r.view.host.owner as string;
    expect(host).not.toBe(ann);
    const vis = await db.rpc(host, 'enchant_visitors');
    expect(vis.find((x: any) => x.id === ids.parasite).what).toBe('parasite');
    const b = await ink(host);
    await db.rpc(host, 'enchant_visitor_act', { p_id: ids.parasite, p_action: 'shake' });
    expect(await ink(host)).toBe(b + 6);
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.parasite })).view.host).toBeNull();
    await expectError(act(ann, ids.parasite, 'release'), 'too_soon');
    await skip(ids.parasite, 3700);
    await act(ann, ids.parasite, 'release');
    await expectError(act(ann, ids.parasite, 'harvest'), 'still_feeding');
    await skip(ids.parasite, 20 * 3600 + 10);
    const h = await act(ann, ids.parasite, 'harvest');
    expect(h.result.pay.paid).toBe(25); expect(h.view.feeds).toBe(1);
  });
  it('ten feeds make a Symbiote — its host shares the meal', async () => {
    await db.sql(`update enchantments set state = state || '{"feeds": 9, "stage": 1, "rest_until": 0}' where id = $1`, [ids.parasite]);
    await act(ann, ids.parasite, 'release');
    await skip(ids.parasite, 20 * 3600 + 10);
    const h = await act(ann, ids.parasite, 'harvest');
    expect(h.result.evolved).toBe(true); expect(h.view.stage).toBe(2); expect(h.titles).toContain('Symbiote');
    await skip(ids.parasite, 3700);
    const r = await act(ann, ids.parasite, 'release');
    const host = r.view.host.owner as string;
    await expectError(db.rpc(host, 'enchant_visitor_act', { p_id: ids.parasite, p_action: 'shake' }), 'symbiote');
    await db.rpc(host, 'enchant_visitor_act', { p_id: ids.parasite, p_action: 'welcome' });
    await skip(ids.parasite, 20 * 3600 + 10);
    const b = await ink(host);
    const h2 = await act(ann, ids.parasite, 'harvest');
    expect(h2.result.gift).toBe(Math.round(60 * 0.75)); expect(await ink(host)).toBe(b + h2.result.gift);
  });
});

describe('🪺 Cuckoo', () => {
  it('scout nests, lay, the host can throw the egg out (and is paid); a hatched chick pays more from rarer hosts', async () => {
    ids.cuckoo = await enchant(ann, 'cuckoo', 16);
    const s = await act(ann, ids.cuckoo, 'scout');
    expect(s.view.nests.length).toBeGreaterThanOrEqual(2);
    expect(s.view.nests[0]).toHaveProperty('watch'); expect(s.view.nests[0]).toHaveProperty('reward');
    const l = await act(ann, ids.cuckoo, 'lay', { i: 0 });
    const host = l.view.egg.owner as string;
    const b = await ink(host);
    await db.rpc(host, 'enchant_visitor_act', { p_id: ids.cuckoo, p_action: 'eject' });
    expect(await ink(host)).toBe(b + 8);
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.cuckoo })).view.egg).toBeNull();
    await act(ann, ids.cuckoo, 'scout');
    const l2 = await act(ann, ids.cuckoo, 'lay', { i: 0 });
    await expectError(act(ann, ids.cuckoo, 'raise'), 'not_hatched');
    await skip(ids.cuckoo, 10 * 3600 + 10);
    const rr = await act(ann, ids.cuckoo, 'raise');
    expect(rr.result.pay.paid).toBe(l2.view.egg.reward);
  });
});

describe('🏺 Pandora’s Box', () => {
  it('once a day; seven evils released bring Hope (a Legendary+ ticket) and reset the box', async () => {
    ids.pandora = await enchant(ann, 'pandora', 20);
    const o = await act(ann, ids.pandora, 'open', { notches: 3 });
    expect(o.result.out).toHaveLength(3);
    await expectError(act(ann, ids.pandora, 'open', { notches: 1 }), 'already_opened');
    await db.sql(`update enchantments set state = state || '{"evils": ["plague","greed","strife","envy","despair","toil"]}' where id = $1`, [ids.pandora]);
    let hope = false;
    for (let i = 0; i < 40 && !hope; i++) {
      await db.sql(`update enchantments set state = state - 'opened_on' - 'locked_until' where id = $1`, [ids.pandora]);
      hope = (await act(ann, ids.pandora, 'open', { notches: 3 })).result.hope;
    }
    expect(hope).toBe(true);
    const v = await db.rpc(ann, 'enchant_get', { p_id: ids.pandora });
    expect(v.view.evils).toHaveLength(0); expect(v.view.cycle).toBe(1); expect(v.titles).toContain('Hope-Bringer');
    expect((await db.sql(`select count(*)::int n from roll_tickets where player_id = $1 and min_rarity = 'legendary'`, [ann]))[0].n).toBeGreaterThanOrEqual(1);
  });
});

describe('🧪 Splice, ⚙️ Clockwork, 📡 Size Ray', () => {
  it('splice two enchantments into a hybrid: resonant genes are doubled; the Codex remembers', async () => {
    ids.splice = await enchant(ann, 'splice', 24);
    ids.sizeray = await enchant(ann, 'sizeray', 28);
    const s = await act(ann, ids.splice, 'splice', { a: ids.goose, b: ids.sizeray });
    expect(s.result).toMatchObject({ hybrid: 'Giant Goose', resonant: true, new: true });
    expect(s.view.codex).toContain('goose+sizeray');
    await expectError(act(ann, ids.splice, 'splice', { a: ids.goose, b: ids.genie }), 'no_charges');
    const g = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    expect(g.partner).toMatchObject({ kind: 'sizeray', gene: 'grow', resonant: true, hybrid: 'Giant Goose' });
    // the Giant gene triples the goose's egg
    await skip(ids.goose, 3 * 3600);
    const c = await act(ann, ids.goose, 'collect');
    expect(c.result.pay.mods.some((m: any) => /Giant ×3/.test(m.label))).toBe(true);
  });
  it('Clockwork: wind it, fast-forward an enchantment, freeze a spliced one to keep the hybrid longer', async () => {
    ids.clock = await enchant(ann, 'clockwork', 32);
    const w = await act(ann, ids.clock, 'wind', { turns: 10 });
    expect(Number(w.view.charge)).toBeGreaterThanOrEqual(110);
    const before = Number((await db.sql(`select clock_skip from enchantments where id = $1`, [ids.cuckoo]))[0].clock_skip);
    await act(ann, ids.clock, 'forward', { target: ids.cuckoo, minutes: 60 });
    expect(Number((await db.sql(`select clock_skip from enchantments where id = $1`, [ids.cuckoo]))[0].clock_skip)).toBe(before + 3600);
    const ends0 = new Date((await db.sql(`select ends_at from enchant_splices where a = $1 or b = $1 order by id desc limit 1`, [ids.goose]))[0].ends_at).getTime();
    await act(ann, ids.clock, 'freeze', { target: ids.goose, hours: 2 });
    const ends1 = new Date((await db.sql(`select ends_at from enchant_splices where a = $1 or b = $1 order by id desc limit 1`, [ids.goose]))[0].ends_at).getTime();
    expect(ends1 - ends0).toBe(2 * 3600_000);
    const g = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    expect(g.clock.frozen_until).toBeTruthy();
    await expectError(act(ann, ids.clock, 'forward', { target: ids.goose, minutes: 10 }), 'target_frozen');
    await act(ann, ids.clock, 'unfreeze', { target: ids.goose });
  });
  it('Size Ray: aim, fire at the peak — a plot turns giant and its minigames pay more', async () => {
    const plot = (await db.sql(`select gx, gy from world_plots where owner_id = $1 and rarity <> 'enchanted' limit 1`, [bob]))[0];
    const e = await enchant(bob, 'sizeray', 120, 10);
    await act(bob, e, 'aim', { target: { type: 'plot', gx: plot.gx, gy: plot.gy } });
    // wait for the needle's peak (half a period after aiming, plus the latency allowance)
    await sleep(700 + 120);
    const f = await act(bob, e, 'fire');
    expect(f.result.accuracy).toBeGreaterThan(0.8);
    expect(f.result.giant).toBeGreaterThanOrEqual(1.9);
    expect(Number((await db.sql(`select private.ench_minigame_mult($1, $2, $3) m`, [bob, plot.gx, plot.gy]))[0].m)).toBeGreaterThanOrEqual(1.9);
    await expectError(act(bob, e, 'fire'), 'not_aimed');
  });
});

describe('🪞 Mirror Shard', () => {
  it('gaze: other players’ enchantments are reflected; step through one and the shard becomes it; its owner is tipped', async () => {
    const e = await enchant(bob, 'shard', 124, 10);
    const g = await act(bob, e, 'gaze');
    expect(g.view.options).toHaveLength(3);
    const real = g.view.options.findIndex((o: any) => !o.dream);
    expect(real).toBeGreaterThanOrEqual(0);
    const opt = g.view.options[real];
    const b = await ink(opt.owner);
    const s = await act(bob, e, 'step', { i: real });
    expect(s.reflect_kind).toBe(opt.kind); expect(s.reflected).toBeTruthy();
    // the finder's tip is paced Ink (src: private.grant_ink_paced): up to 3, never nothing
    const tip = (await ink(opt.owner)) - b;
    expect(tip).toBeGreaterThan(0); expect(tip).toBeLessThanOrEqual(3);
    // the reflected rules run on the shard
    const first = Object.keys(s.reflected).length;
    expect(first).toBeGreaterThan(0);
    const r = await act(bob, e, 'release');
    expect(r.reflect_kind).toBeNull();
    expect(r.view.cracks).toBe(1);
  });
});

describe('the land, the map and the owner', () => {
  it('a released enchanted plot goes dormant and wakes for whoever claims it next', async () => {
    const e = await enchant(cat, 'pandora', -200, -10);
    const at = (await db.sql(`select gx, gy from enchantments where id = $1`, [e]))[0];
    await db.rpc(owner, 'admin_release_plot', { p_gx: at.gx, p_gy: at.gy, p_reason: 'test release' });
    expect((await db.sql(`select status, owner_id from enchantments where id = $1`, [e]))[0]).toEqual({ status: 'dormant', owner_id: null });
    const r = await db.rpc(bob, 'acquire_plot', { p_gx: at.gx, p_gy: at.gy, p_idempotency_key: 'wake-the-box-000' });
    expect(r.rarity).toBe('enchanted'); expect(r.enchant.id).toBe(e);
    expect((await db.sql(`select status, owner_id from enchantments where id = $1`, [e]))[0]).toEqual({ status: 'active', owner_id: bob });
  });
  it('the map shows enchanted plots; the Grimoire lists yours with what needs you; the bestiary counts them', async () => {
    const m = await db.rpc(null, 'enchant_map', { p_min_gx: O.gx - 500, p_min_gy: O.gy - 500, p_max_gx: O.gx + 500, p_max_gy: O.gy + 500 });
    expect(m.plots.length).toBeGreaterThanOrEqual(8);
    const mine = await db.rpc(ann, 'my_enchantments');
    expect(mine.map((x: any) => x.kind).sort()).toEqual(expect.arrayContaining(['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'sizeray', 'clockwork']));
    expect(mine.some((x: any) => x.attention)).toBe(true);
    const b = await db.rpc(ann, 'enchant_bestiary');
    expect(b.kinds).toHaveLength(12); expect(b.codex).toContain('goose+sizeray');
    const ch = await db.rpc(ann, 'enchant_chronicle', { p_id: ids.goose });
    const older = await db.rpc(ann, 'enchant_chronicle', { p_id: ids.goose, p_before: ch[ch.length - 1].id });
    expect([...ch, ...older].map((x: any) => x.kind)).toEqual(expect.arrayContaining(['born', 'fox', 'egg', 'spliced', 'frozen']));
    expect(await db.rpc(bob, 'enchant_chronicle', { p_id: ids.goose })).toEqual([]);
    await expectError(db.rpc(bob, 'enchant_act', { p_id: ids.goose, p_action: 'collect' }), 'not_owner');
  });
  it('renaming, and the owner can give an enchantment (never a bare “Enchanted” rarity)', async () => {
    const r = await act(ann, ids.goose, 'rename', { name: '  Goldie  ' });
    expect(r.nickname).toBe('Goldie');
    await expectError(db.rpc(owner, 'admin_give_plot', { p_player: cat, p_rarity: 'enchanted', p_reason: 'nope nope' }), 'invalid_rarity');
    const g = await db.rpc(owner, 'admin_give_enchantment', { p_player: cat, p_kind: 'genie', p_reason: 'sorry about the bug' });
    expect(g.kind).toBe('genie');
    expect((await db.sql(`select rarity from world_plots where gx = $1 and gy = $2`, [g.gx, g.gy]))[0].rarity).toBe('enchanted');
  });
  it('the owner’s Enchantments settings are range-checked, and an admin plot change away from Enchanted ends the enchantment', async () => {
    const cur = (await db.sql(`select value from game_config where key = 'enchantments'`))[0].value;
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'enchantments', p_value: { ...cur, base_pct: 150 } }), 'invalid_enchant_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'enchantments', p_value: { ...cur, weights: { ...cur.weights, goose: -1 } } }), 'invalid_enchant_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'enchantments', p_value: { ...cur, luck_ink: 0 } }), 'invalid_enchant_config');
    await db.rpc(owner, 'admin_config_set', { p_key: 'enchantments', p_value: { ...cur, base_pct: 3.5, weights: { ...cur.weights, shard: 0 } } });
    expect((await db.sql(`select value ->> 'base_pct' p from game_config where key = 'enchantments'`))[0].p).toBe('3.5');
    await db.rpc(owner, 'admin_config_set', { p_key: 'enchantments', p_value: cur });
    const g = await db.rpc(owner, 'admin_give_enchantment', { p_player: cat, p_kind: 'cuckoo', p_reason: 'to be changed' });
    await db.rpc(owner, 'admin_set_plot_rarity', { p_gx: g.gx, p_gy: g.gy, p_rarity: 'rare', p_shiny: false, p_reason: 'changed it' });
    expect((await db.sql(`select status from enchantments where id = $1`, [g.id]))[0].status).toBe('gone');
  });
  it('enchantment Ink is paced by Ink Flow', async () => {
    const c = (await db.sql(`select value -> 'paced' p from game_config where key = 'ink_pacing'`))[0].p;
    expect(c).toContain('enchantment');
    expect(await st(ids.goose)).toBeTruthy();
  });
});
