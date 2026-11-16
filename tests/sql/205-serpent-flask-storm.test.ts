// Enchantments, part 4 (the Ouroboros and the Homunculus left in part 9 — see 211-sun-rod-traits-badges): the Storm Coil (a live lightning storm that mutates hybrids) — and more Splice charges (plots, Ink, eggs, sparks).
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

describe('the Storm Coil rolls; every pairing has a name', () => {
  it('rolls it, names every pairing, and gives it a Trait and a Leviathan move', async () => {
    expect((await db.sql(`select private.ench_kinds() k`))[0].k).toEqual(expect.arrayContaining(['stormcoil']));
    const r = (await db.sql(`select count(*)::int n, count(*) filter (where (private.ench_hybrid(a, b) ->> 1)::boolean)::int p
                               from unnest(private.ench_kinds()) a, unnest(private.ench_kinds()) b where a < b and a <> 'splice' and b <> 'splice'
                                and private.ench_hybrid(a, b) ->> 0 <> 'Chimera'`))[0];
    expect(r.n).toBe((await db.sql(`select private.ench_hybrid_count() n`))[0].n);
    for (const kd of ['stormcoil']) {
      expect((await db.sql(`select private.ench_info($1) ->> 'gene' g, private.lev_move($1) ->> 0 m`, [kd]))[0]).toMatchObject({ g: expect.any(String), m: expect.any(String) });
    }
    expect((await db.sql(`select private.ench_hybrid('stormcoil', 'sun') h`))[0].h).toEqual(['Solar Storm', true]);
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
  it('settles storms (and the Traits’ work) without anyone looking', async () => {
    await db.sql(`select private.wonders_tick()`);
  });
});
