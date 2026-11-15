// Enchantments, part 4: the Ouroboros (coils a splice into loops), the Homunculus (grown from your splices, walks your
// plots), the Storm Coil (a live lightning storm that mutates hybrids) — and more Splice charges (plots, Ink, eggs, sparks).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, cat: string;
const O = { gx: 794_800, gy: 1_577_600 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `sfs-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
async function enchant(uid: string, kind: string, dx: number, dy = 0) {
  await force(kind);
  const r = await claim(uid, dx, dy);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const skip = (id: string, secs: number) => db.sql(`update enchantments set clock_skip = clock_skip + $2 where id = $1`, [id, secs]);
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const st = async (id: string) => (await db.sql(`select state from enchantments where id = $1`, [id]))[0].state;
const stats = async (id: string) => (await db.sql(`select stats from enchantments where id = $1`, [id]))[0].stats;
const charges = (id: string, n: number, bonus = 0) => db.sql(`update enchantments set state = state || jsonb_build_object('charges', $2::int, 'bonus', $3::int, 'charge_at', extract(epoch from now())) where id = $1`, [id, n, bonus]);
const cfg = (patch: Record<string, unknown>) => db.sql(`update game_config set value = value || $1::jsonb where key = 'enchantments'`, [JSON.stringify(patch)]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rows = (id: string) => db.sql(`select * from enchant_splices where (a = $1 or b = $1) and not folded and (ends_at > now() or data ? 'coil_by') order by id`, [id]);
const partners = async (id: string) => (await db.sql(`select private.ench_partners($1) p`, [id]))[0].p as any[];
/** move a coil's next loop (and its splice's end) to a moment ago, as if the hours had passed */
async function loopNow(ouro: string) {
  const s = await st(ouro);
  const at = Date.now() / 1000 - 2;
  await db.sql(`update enchantments set state = jsonb_set(jsonb_set(state, '{coil,next_at}', to_jsonb($2::numeric)), '{coil,until}', to_jsonb($2::numeric)) where id = $1`, [ouro, at]);
  await db.sql(`update enchant_splices set ends_at = to_timestamp($2) where id = any($1::bigint[])`, [s.coil.rows, at]);
  await db.sql(`select private.ouro_settle($1)`, [ouro]);
}
async function egg(uid: string) {
  return (await db.sql(`insert into inkborn_eggs (owner_id, kind, shell, genome, parents, hatch_at) values ($1, 'speckled', '{"a": "#fff"}', '{"mood": "playful"}', '[]', now()) returning id`, [uid]))[0].id as string;
}

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('sfs_ann'); bob = await db.newPlayer('sfs_bob'); cat = await db.newPlayer('sfs_cat');
  for (const u of [ann, bob, cat]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 400_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  for (let i = 0; i < 4; i++) { await claim(bob, 30 + i * 3, 8); await claim(ann, -20 - i * 2, 20); }
  await cfg({ splice: { aberration: 0, unstable: 0 } });
});
afterAll(() => db.close());

describe('three new kinds, 91 hybrids', () => {
  it('rolls them, names every pairing, and gives each a Trait and a Leviathan move', async () => {
    expect((await db.sql(`select private.ench_kinds() k`))[0].k).toEqual(expect.arrayContaining(['ouroboros', 'homunculus', 'stormcoil']));
    const r = (await db.sql(`select count(*)::int n, count(*) filter (where (private.ench_hybrid(a, b) ->> 1)::boolean)::int p
                               from unnest(private.ench_kinds()) a, unnest(private.ench_kinds()) b where a < b and a <> 'splice' and b <> 'splice'
                                and private.ench_hybrid(a, b) ->> 0 <> 'Chimera'`))[0];
    expect(r.n).toBe((await db.sql(`select private.ench_hybrid_count() n`))[0].n);
    for (const kd of ['ouroboros', 'homunculus', 'stormcoil']) {
      expect((await db.sql(`select private.ench_info($1) ->> 'gene' g, private.lev_move($1) ->> 0 m`, [kd]))[0]).toMatchObject({ g: expect.any(String), m: expect.any(String) });
    }
    expect((await db.sql(`select private.ench_hybrid('stormcoil', 'homunculus') h`))[0].h).toEqual(['Galvanized Golem', true]);
  });
});

describe('🧪 more Splice charges', () => {
  let splice: string, goose: string, genie: string;
  beforeAll(async () => {
    splice = await enchant(ann, 'splice', 0);
    goose = await enchant(ann, 'goose', 4); genie = await enchant(ann, 'genie', 8);
  });
  it('the lab: more plots hold more charges and bring them back faster', async () => {
    const lab = (await db.sql(`select private.splice_lab($1) l`, [ann]))[0].l;
    expect(lab).toMatchObject({ tier: 1, max: 2, recharge_h: 36, next_plots: 25, next_max: 3 });
    for (let i = 0; i < 25; i++) await claim(cat, 200 + i, -40);
    const big = (await db.sql(`select private.splice_lab($1) l`, [cat]))[0].l;
    expect(big.plots).toBeGreaterThanOrEqual(25);
    expect(big).toMatchObject({ tier: 2, max: 3, recharge_h: 32 });
  });
  it('buy spare charges with Ink: 300, then 600, then 1,200 — three a day', async () => {
    await charges(splice, 0, 0);
    const i0 = await ink(ann);
    const b1 = await act(ann, splice, 'buy');
    expect(b1.result).toMatchObject({ bought: 1, ink: 300 });
    expect(b1.view).toMatchObject({ bonus: 1, charges: 1, natural: 0 });
    expect((await act(ann, splice, 'buy')).result.ink).toBe(600);
    expect((await act(ann, splice, 'buy')).result.ink).toBe(1200);
    expect(await ink(ann)).toBe(i0 - 2100);
    await expectError(act(ann, splice, 'buy'), 'bought_out');
    expect((await get(ann, splice)).view.shop).toMatchObject({ bought: 3, price: null });
  });
  it('crack an Inkborn egg into the vat (two a day); the egg is gone', async () => {
    const e1 = await egg(ann), e2 = await egg(ann), e3 = await egg(ann);
    const v = await get(ann, splice);
    expect(v.view.eggs.map((x: any) => x.id)).toEqual(expect.arrayContaining([e1, e2, e3]));
    const r = await act(ann, splice, 'egg', { egg: e1 });
    expect(r.result).toMatchObject({ cracked: true, egg: 'speckled' });
    expect(r.view.bonus).toBe(4);
    expect((await db.sql(`select count(*)::int n from inkborn_eggs where id = $1`, [e1]))[0].n).toBe(0);
    await expectError(act(ann, splice, 'egg', { egg: e1 }), 'bad_target');
    await act(ann, splice, 'egg', { egg: e2 });
    await expectError(act(ann, splice, 'egg', { egg: e3 }), 'eggs_today');
    await expectError(act(bob, splice, 'egg', { egg: e3 }), 'not_owner');
  });
  it('spare charges stop at six; a splice spends natural charges first', async () => {
    await charges(splice, 1, 6);
    await expectError(act(ann, splice, 'egg', { egg: await egg(cat) }), 'charges_full');
    const s = await act(ann, splice, 'splice', { mode: 'swap', a: goose, b: genie });
    expect(s.view).toMatchObject({ natural: 0, bonus: 6 });
    await act(ann, splice, 'unsplice');
    // a Trinity with no natural charges takes two spares
    const ray = await enchant(ann, 'sizeray', 12);
    const t = await act(ann, splice, 'splice', { mode: 'trinity', a: goose, b: genie, c: ray });
    expect(t.view).toMatchObject({ natural: 0, bonus: 4 });
    await act(ann, splice, 'unsplice');
  });
  it('a golden egg can carry a spark into your Splice', async () => {
    await cfg({ splice: { aberration: 0, unstable: 0, goose_spark: 1 } });
    await charges(splice, 0, 0);
    await skip(goose, 10 * 3600);
    const r = await act(ann, goose, 'collect');
    expect(r.result.spark).toBe(true);
    expect((await st(splice)).bonus).toBe(1);
    await cfg({ splice: { aberration: 0, unstable: 0 } });
  });
  it('a declined friend splice gives the charge back', async () => {
    const theirs = await enchant(bob, 'pandora', 60, 8);
    await db.sql(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted') on conflict do nothing`, [ann, bob]);
    await charges(splice, 1, 0);
    await act(ann, splice, 'splice', { mode: 'friend', a: goose, b: theirs });
    const inv = await db.rpc(bob, 'splice_invites');
    await db.rpc(bob, 'splice_invite_respond', { p_id: inv[0].id, p_accept: false });
    expect((await get(ann, splice)).view).toMatchObject({ charges: 1, natural: 1 });
  });
});

describe('🐍 Ouroboros: the splice that eats its own tail', () => {
  let ouro: string, splice: string, goose: string, genie: string, clock: string;
  beforeAll(async () => {
    ouro = await enchant(ann, 'ouroboros', 40); splice = await enchant(ann, 'splice', 44);
    goose = await enchant(ann, 'goose', 48); genie = await enchant(ann, 'genie', 52); clock = await enchant(ann, 'clockwork', 56);
    await cfg({ splice: { aberration: 0, unstable: 0 }, ouroboros: { risk: [0, 0, 0, 0, 0, 0, 0] } });
  });
  it('coils any splice you have running (not a Graft); the first loop comes when it would have ended', async () => {
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'graft', a: goose, b: genie });
    const graft = (await rows(goose))[0];
    await expectError(act(ann, ouro, 'coil', { row: graft.id }), 'bad_target');
    await act(ann, splice, 'unsplice');
    await db.sql(`update enchantments set frozen_until = now() where id = $1`, [genie]);
    await act(ann, splice, 'splice', { mode: 'swap', a: goose, b: genie });
    const v = await get(ann, ouro);
    expect(v.view.coilable.length).toBe(1);
    expect(v.attention).toMatch(/coil/i);
    const row = v.view.coilable[0];
    expect(row.hybrid).toBe('Wishing Goose');
    const c = await act(ann, ouro, 'coil', { row: row.row });
    expect(c.result).toMatchObject({ coiled: true, hybrid: 'Wishing Goose', period_h: 12 });
    const r = (await rows(goose))[0];
    expect(r.data.coil_by).toBe(ouro);
    await expectError(act(ann, ouro, 'coil', { row: row.row }), 'coil_active');
  });
  it('catch the tail: tap as the head meets it to halve the next loop’s risk', async () => {
    const t0 = Date.now();
    const ch = await act(ann, ouro, 'chase');
    const rtt = Date.now() - t0;
    expect(ch.result.period_ms).toBeGreaterThan(1000);
    // too early (the head hasn't gone round yet)
    await sleep(Math.max(0, ch.result.period_ms + 120 - rtt));
    const c = await act(ann, ouro, 'catch');
    expect(['CLEAN', 'CLOSE']).toContain(c.result.grade);
    expect(c.view.coil.caught).toBe(true);
    await expectError(act(ann, ouro, 'chase'), 'already_caught');
  });
  it('each loop that holds banks Ink and makes the hybrid stronger: ×2 from loop 2, ×3 from loop 4', async () => {
    await loopNow(ouro);
    let s = await st(ouro);
    expect(s.coil).toMatchObject({ loops: 1, bank: 60, status: 'coiled' });
    expect((await partners(goose))[0].strength).toBe(1);
    expect(new Date((await rows(goose))[0].ends_at).getTime()).toBeGreaterThan(Date.now() + 11 * 3600_000);
    // between a boundary and its settling, the coiled pair still counts as busy
    await db.sql(`update enchant_splices set ends_at = now() - interval '1 second' where id = any($1::bigint[])`, [s.coil.rows]);
    expect((await db.sql(`select private.ench_spliced($1) b`, [goose]))[0].b).toBe(true);
    await loopNow(ouro);
    expect((await partners(goose))[0].strength).toBe(2);
    await loopNow(ouro); await loopNow(ouro);
    s = await st(ouro);
    expect(s.coil.loops).toBe(4);
    expect((await partners(goose))[0].strength).toBe(3);
    expect((await get(ann, ouro)).view.coil).toMatchObject({ strength: 3, loop_next: 5 });
  });
  it('seven loops close the circle: you choose the Aberration it becomes (and the bank pays ×1.5)', async () => {
    await loopNow(ouro); await loopNow(ouro); await loopNow(ouro);
    const v = await get(ann, ouro);
    expect(v.view.coil.status).toBe('closed');
    expect(v.attention).toMatch(/choose/i);
    await expectError(act(ann, ouro, 'choose', { aberration: 'Nobody' }), 'bad_target');
    const bank = (await st(ouro)).coil.bank;
    expect(bank).toBe(7 * 40 + 20 * 28);
    const c = await act(ann, ouro, 'choose', { aberration: 'Ninefold' });
    expect(c.result).toMatchObject({ closed: true, aberration: 'Ninefold' });
    expect(c.result.pay.paid).toBeGreaterThanOrEqual(Math.round(bank * 1.5));
    const r = (await rows(goose))[0];
    expect(r.data).toMatchObject({ aberration: 'Ninefold', circle: true });
    expect(r.data.coil_by).toBeUndefined();
    expect((await st(splice)).aberrations).toContain('Ninefold');
    expect(c.titles).toContain('Eternal');
    expect((await db.sql(`select count(*)::int n from feed_events where kind = 'enchant' and data ->> 'sub' = 'circle'`))[0].n).toBe(1);
    await expectError(act(ann, ouro, 'coil', { row: r.id }), 'too_soon');
  });
  it('a bite snaps the splice, loses the bank, and the serpent sheds its skin', async () => {
    await db.sql(`update enchantments set state = state - 'rest_until' where id = $1`, [ouro]);
    await act(ann, splice, 'unsplice');
    await db.sql(`select private.ench_settle($1)`, [goose]);
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'chimera', a: goose, b: clock });
    const row = (await get(ann, ouro)).view.coilable[0];
    await act(ann, ouro, 'coil', { row: row.row });
    await loopNow(ouro); // loop 1 holds (60 banked)
    await cfg({ splice: { aberration: 0, unstable: 0 }, ouroboros: { risk: [1, 1, 1, 1, 1, 1, 1] } });
    await loopNow(ouro);
    const s = await st(ouro);
    expect(s.coil).toBeNull();
    expect(s.last).toMatchObject({ end: 'bitten', loops: 1, lost: 60 });
    expect(s.shed_until).toBeGreaterThan(Date.now() / 1000 + 23 * 3600);
    expect((await partners(goose)).length).toBe(0);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'coil_bitten'`, [ann]))[0].n).toBe(1);
    await expectError(act(ann, ouro, 'coil', { row: 1 }), 'shedding');
    expect((await stats(ouro)).bites).toBe(1);
  });
  it('Break the circle: the bank is paid and the hybrid stays fused to the end of its loop', async () => {
    await db.sql(`update enchantments set state = state - 'shed_until' where id = $1`, [ouro]);
    await cfg({ splice: { aberration: 0, unstable: 0 }, ouroboros: { risk: [0, 0, 0, 0, 0, 0, 0] } });
    await db.sql(`select private.ench_settle($1)`, [goose]);
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'swap', a: goose, b: genie });
    await act(ann, ouro, 'coil', { row: (await get(ann, ouro)).view.coilable[0].row });
    await loopNow(ouro); await loopNow(ouro);
    const i0 = await ink(ann);
    const b = await act(ann, ouro, 'break');
    expect(b.result.broke).toBe(true);
    expect(b.result.pay.paid).toBeGreaterThanOrEqual(140);
    expect(await ink(ann)).toBeGreaterThanOrEqual(i0 + 140);
    expect((await partners(goose))[0].strength).toBe(2);
    expect((await rows(goose))[0].data.coil_by).toBeUndefined();
  });
  it('separating a coiled splice by hand breaks the circle too (what was banked is paid)', async () => {
    await db.sql(`update enchantments set state = state - 'rest_until' where id = $1`, [ouro]);
    await act(ann, splice, 'unsplice');
    await db.sql(`select private.ench_settle($1)`, [goose]);
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'swap', a: goose, b: genie });
    await act(ann, ouro, 'coil', { row: (await get(ann, ouro)).view.coilable[0].row });
    await loopNow(ouro);
    await act(ann, goose, 'separate');
    const s = await st(ouro);
    expect(s.coil).toBeNull();
    expect(s.last.end).toBe('uncoiled');
  });
  it('Endless: a splice with an Ouroboros in it renews itself once when it ends', async () => {
    await db.sql(`update enchantments set state = state - 'rest_until' where id = $1`, [ouro]);
    await db.sql(`select private.ench_settle($1)`, [goose]);
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'swap', a: goose, b: ouro });
    expect((await partners(goose))[0]).toMatchObject({ gene: 'endless', hybrid: 'Eternal Egg' });
    await db.sql(`update enchant_splices set ends_at = now() - interval '1 second', started_at = now() - interval '24 hours 1 second' where a = $1 and not folded`, [goose]);
    await db.sql(`select private.ench_settle($1)`, [goose]);
    let r = (await rows(goose))[0];
    expect(r.data.renewed).toBe(1);
    expect(new Date(r.ends_at).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    await db.sql(`update enchant_splices set ends_at = now() - interval '1 second' where a = $1 and not folded`, [goose]);
    await db.sql(`select private.ench_settle($1)`, [goose]);
    expect((await db.sql(`select folded from enchant_splices where a = $1 order by id desc limit 1`, [goose]))[0].folded).toBe(true);
  });
  it('an Infinity Clock (spliced with a Clockwork) loops every 6 hours', async () => {
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'swap', a: ouro, b: clock });
    expect((await get(ann, ouro)).view.period_h).toBe(6);
    await act(ann, splice, 'unsplice');
  });
});

describe('🧫 Homunculus: grown from your splices', () => {
  let homu: string, splice: string, ids: Record<string, string> = {};
  beforeAll(async () => {
    homu = await enchant(ann, 'homunculus', 100); splice = await enchant(ann, 'splice', 104);
    for (const [i, kd] of ['goose', 'genie', 'map', 'clockwork', 'shard', 'pandora'].entries()) ids[kd] = await enchant(ann, kd, 108 + i * 4);
    await cfg({ splice: { aberration: 0, unstable: 0 } });
  });
  const splice2 = async (a: string, b: string) => { await charges(splice, 2); const r = await act(ann, splice, 'splice', { mode: 'swap', a: ids[a], b: ids[b] }); await act(ann, splice, 'unsplice'); return r; };
  it('every splice drips into the flask: a part for each enchantment, a part it has grows', async () => {
    await splice2('goose', 'genie');
    let v = (await get(ann, homu)).view;
    expect(v.parts.map((p: any) => p.k).sort()).toEqual(['genie', 'goose']);
    expect(v).toMatchObject({ weight: 2, need: 5, can_wake: false });
    await splice2('goose', 'map');
    v = (await get(ann, homu)).view;
    expect(v.parts.find((p: any) => p.k === 'goose').lv).toBe(2);
    expect(v.weight).toBe(3);
  });
  it('an Aberration’s parts glow and count double', async () => {
    await cfg({ splice: { aberration: 1, unstable: 0 } });
    const r = await splice2('clockwork', 'shard');
    expect(r.result.aberration).toBeTruthy();
    await cfg({ splice: { aberration: 0, unstable: 0 } });
    const v = (await get(ann, homu)).view;
    expect(v.parts.filter((p: any) => p.glow).map((p: any) => p.k).sort()).toEqual(['clockwork', 'shard']);
    expect(v.weight).toBe(7);
    expect(v.can_wake).toBe(true);
    expect((await get(ann, homu)).attention).toMatch(/wake/i);
  });
  it('it wakes and walks your plots: the plot it stands on wears its parts', async () => {
    const w = await act(ann, homu, 'wake');
    expect(w.result.awake).toBe(true);
    const [gx, gy] = w.result.pos;
    expect((await db.sql(`select owner_id from world_plots where gx = $1 and gy = $2`, [gx, gy]))[0].owner_id).toBe(ann);
    const m = Number((await db.sql(`select private.ench_minigame_mult($1, $2, $3) m`, [ann, gx, gy]))[0].m);
    expect(m).toBeCloseTo(Number(w.view.mult), 1);
    expect(m).toBeGreaterThan(1.5);
    const map = await db.rpc(bob, 'enchant_map2', { p_min_gx: gx - 20, p_min_gy: gy - 20, p_max_gx: gx + 20, p_max_gy: gy + 20 });
    expect(map.walkers.find((x: any) => x.id === homu)).toMatchObject({ gx, gy, mine: false, greeted: false });
    expect((await db.sql(`select count(*)::int n from feed_events where data ->> 'sub' = 'awoke'`))[0].n).toBe(1);
  });
  it('you can lead it to a plot (twice a day)', async () => {
    const p = (await db.sql(`select gx, gy from world_plots where owner_id = $1 order by gx desc limit 1`, [ann]))[0];
    const l = await act(ann, homu, 'lead', { gx: p.gx, gy: p.gy });
    expect(l.view.awake).toMatchObject({ pos: [p.gx, p.gy], led: true, leads_left: 1 });
    await act(ann, homu, 'lead', { gx: p.gx, gy: p.gy });
    await expectError(act(ann, homu, 'lead', { gx: p.gx, gy: p.gy }), 'too_soon');
    const bobs = (await db.sql(`select gx, gy from world_plots where owner_id = $1 limit 1`, [bob]))[0];
    await db.sql(`update enchantments set state = jsonb_set(state, '{awake,leads}', '0') where id = $1`, [homu]);
    await expectError(act(ann, homu, 'lead', { gx: bobs.gx, gy: bobs.gy }), 'bad_target');
  });
  it('anyone can greet it once a day: a few Ink for them and for you', async () => {
    const b0 = await ink(bob), a0 = await ink(ann);
    await db.rpc(bob, 'homunculus_greet', { p_id: homu });
    expect(await ink(bob)).toBe(b0 + 3);
    expect(await ink(ann)).toBe(a0 + 5);
    await expectError(db.rpc(bob, 'homunculus_greet', { p_id: homu }), 'already_greeted');
    await expectError(db.rpc(ann, 'homunculus_greet', { p_id: homu }), 'own_homunculus');
    expect((await get(ann, homu)).view.awake.greets).toBe(1);
  });
  it('after its week it melts into a heart (Ink, Enchanted Luck, a Splice charge) and keeps one part', async () => {
    await expectError(act(ann, homu, 'heart'), 'not_ready');
    await skip(homu, 7 * 86400 + 60);
    const v = await get(ann, homu);
    expect(v.view.awake.melted).toBe(true);
    expect(v.attention).toMatch(/heart/i);
    await charges(splice, 0, 0);
    const spares = async () => Number((await db.sql(`select coalesce(sum((state ->> 'bonus')::int), 0) n from enchantments where owner_id = $1 and kind = 'splice'`, [ann]))[0].n);
    const sp0 = await spares();
    const e0 = Number((await db.sql(`select enchant from player_luck where player_id = $1`, [ann]))[0]?.enchant ?? 0);
    const h = await act(ann, homu, 'heart', { keep: 'shard' });
    expect(h.result).toMatchObject({ heart: true, enchanted_luck: 2, spark: true, kept: 'shard' });
    expect(h.result.pay.paid).toBeGreaterThan(200);
    expect(Number((await db.sql(`select enchant from player_luck where player_id = $1`, [ann]))[0].enchant)).toBe(Math.min(9, e0 + 2));
    expect(await spares()).toBe(sp0 + 1);
    expect(h.view).toMatchObject({ gen: 2, weight: 1, awake: null });
    expect(h.view.parts).toEqual([expect.objectContaining({ k: 'shard', lv: 1, glow: false, heir: true })]);
    expect(h.titles).toContain('Alchemist');
  });
  it('Patchwork: what it’s spliced with borrows a Trait from its parts; with a Storm Coil it wakes a part sooner', async () => {
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'swap', a: ids.goose, b: homu });
    const pay = (await db.sql(`select private.ench_pay($1, 100, 'test') p`, [ids.goose]))[0].p;
    expect(pay.mods.map((m: any) => m.label).join(' ')).toMatch(/Patchwork borrowed/);
    await act(ann, splice, 'unsplice');
    await db.sql(`select private.ench_settle($1)`, [homu]);
    const storm = await enchant(ann, 'stormcoil', 160);
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'swap', a: storm, b: homu });
    expect((await get(ann, homu)).view).toMatchObject({ need: 4, galvanized: true });
    await act(ann, splice, 'unsplice');
  });
});

describe('⚡ Storm Coil: a live lightning storm over your plots', () => {
  let coil: string, splice: string, goose: string, genie: string;
  beforeAll(async () => {
    coil = await enchant(ann, 'stormcoil', 200); splice = await enchant(ann, 'splice', 204);
    goose = await enchant(ann, 'goose', 208); genie = await enchant(ann, 'genie', 212);
    await cfg({ splice: { aberration: 0, unstable: 0 }, stormcoil: { scorch: 1 } });
    await charges(splice, 2);
    await act(ann, splice, 'splice', { mode: 'swap', a: goose, b: genie });
  });
  /** move the storm's clock so bolt i is landing right now */
  const landing = async (i: number) => {
    const s = await st(coil);
    await db.sql(`update enchantments set state = jsonb_set(state, '{storm,at}', to_jsonb(extract(epoch from clock_timestamp()) - $2::numeric)) where id = $1`, [coil, s.storm.bolts[i].t]);
  };
  it('crank it full, then call the storm', async () => {
    await expectError(act(ann, coil, 'storm'), 'not_charged');
    const c = await act(ann, coil, 'crank', { turns: 7 });
    expect(c.view.charge).toBe(100);
    await expectError(act(ann, coil, 'crank', { turns: 1 }), 'charged');
    const s = await act(ann, coil, 'storm');
    expect(s.result.storm.bolts.length).toBe(18);
    expect(s.result.storm.bolts.some((b: any) => b.kind === 'mutate' && [goose, genie].includes(b.target))).toBe(true);
    expect(s.attention).toMatch(/storm/i);
    expect(s.view.charge).toBe(0);
    const map = await db.rpc(null, 'enchant_map2', { p_min_gx: O.gx, p_min_gy: O.gy, p_max_gx: O.gx + 400, p_max_gy: O.gy + 400 });
    expect(map.storms.find((x: any) => x.id === coil).bolts.length).toBe(18);
  });
  it('a bolt is caught as it lands — not before, not twice; on a hybrid it mutates it', async () => {
    const bolts = (await st(coil)).storm.bolts;
    const m = bolts.findIndex((b: any) => b.kind === 'mutate');
    await db.sql(`update enchantments set state = jsonb_set(state, '{storm,at}', to_jsonb(extract(epoch from clock_timestamp()))) where id = $1`, [coil]);
    await expectError(act(ann, coil, 'catch', { i: m }), 'missed');
    await cfg({ splice: { aberration: 0, unstable: 0 }, stormcoil: { scorch: 1, aberration: 1 } });
    await landing(m);
    const r = await act(ann, coil, 'catch', { i: m });
    expect(r.result).toMatchObject({ what: 'aberration', i: m });
    const target = bolts[m].target;
    expect((await partners(target))[0]).toMatchObject({ strength: 3, aberration: r.result.aberration });
    const made = (await db.sql(`select splice_id from enchant_splices where (a = $1 or b = $1) and not folded and ends_at > now() order by id desc limit 1`, [target]))[0].splice_id;
    expect((await st(made)).aberrations).toContain(r.result.aberration);
    await expectError(act(ann, coil, 'catch', { i: m }), 'already_caught');
    // the next mutation is one of the others (with no Aberration left to give, it's +6 h, a surge or an overcharge)
    await cfg({ splice: { aberration: 0, unstable: 0 }, stormcoil: { scorch: 1, aberration: 0 } });
    const m2 = bolts.findIndex((b: any, i: number) => i !== m && b.kind === 'mutate');
    await landing(m2);
    const r2 = await act(ann, coil, 'catch', { i: m2 });
    expect(['extend', 'surge', 'overcharge']).toContain(r2.result.what);
  });
  it('a stray bolt on a neighbour’s plot is anyone’s to catch', async () => {
    const s = await st(coil);
    const i = s.storm.bolts.findIndex((b: any, n: number) => b.kind === 'ink' && !(String(n) in s.storm.caught));
    const bp = (await db.sql(`select gx, gy from world_plots where owner_id = $1 limit 1`, [bob]))[0];
    await db.sql(`update enchantments set state = jsonb_set(state, array['storm','bolts',$2::text], (state -> 'storm' -> 'bolts' -> $2::int) || jsonb_build_object('kind', 'stray', 'owner', $3::text, 'gx', $4::int, 'gy', $5::int)) where id = $1`, [coil, i, bob, bp.gx, bp.gy]);
    await landing(i);
    const b0 = await ink(bob);
    await expectError(db.rpc(ann, 'storm_catch', { p_id: coil, p_i: i }), 'own_storm');
    await db.rpc(bob, 'storm_catch', { p_id: coil, p_i: i });
    expect(await ink(bob)).toBe(b0 + 5);
    await expectError(db.rpc(cat, 'storm_catch', { p_id: coil, p_i: i }), 'already_caught');
  });
  it('when it passes: what was caught is paid, and bolts nobody caught scorch their plots', async () => {
    await expectError(act(ann, coil, 'end'), 'too_soon');
    await db.sql(`update enchantments set state = jsonb_set(jsonb_set(state, '{storm,until}', to_jsonb(extract(epoch from now()) - 10)), '{storm,at}', to_jsonb(extract(epoch from now()) - 200)) where id = $1`, [coil]);
    const e = await act(ann, coil, 'end');
    expect(e.result.ended).toBe(true);
    expect(e.result.last).toMatchObject({ of: 18 });
    expect(e.result.last.caught).toBeGreaterThanOrEqual(3);
    expect(e.result.pay.paid).toBeGreaterThan(0);
    const sc = await db.sql(`select gx, gy from enchant_buffs where kind = 'scorch' and player_id = $1 and expires_at > now()`, [ann]);
    expect(sc.length).toBe(e.result.last.scorched);
    if (sc.length) {
      const m = Number((await db.sql(`select private.ench_minigame_mult($1, $2, $3) m`, [ann, sc[0].gx, sc[0].gy]))[0].m);
      expect(m).toBeLessThan(1);
    }
    expect(e.view.storm).toBeNull();
    expect(e.view.storms_left).toBe(0);
    await db.sql(`update enchantments set state = state || '{"charge": 100}' where id = $1`, [coil]);
    await expectError(act(ann, coil, 'storm'), 'too_soon');
  });
  it('Charged: a splice with a Storm Coil is three times as likely to mutate', async () => {
    await act(ann, splice, 'unsplice');
    await db.sql(`select private.ench_settle($1)`, [goose]);
    await cfg({ splice: { aberration: 0.34, unstable: 0 } });
    await charges(splice, 2);
    const r = await act(ann, splice, 'splice', { mode: 'swap', a: goose, b: coil });
    expect(r.result.aberration).toBeTruthy();
    await act(ann, splice, 'unsplice');
    await cfg({ splice: { aberration: 0, unstable: 0 } });
  });
});

describe('the heartbeat', () => {
  it('settles coils, storms and renewals without anyone looking', async () => {
    await db.sql(`select private.wonders_tick()`);
  });
});
