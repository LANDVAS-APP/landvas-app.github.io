// Primordials are only rolled: three ultras no longer fuse, a fused Primordial gives back the very three ultras that went
// in (no picking), players who had already picked are put back on the same footing, and Primordial rent is far lower
// (still above the everyday ultras).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, carl: string, dana: string, erin: string;
const O = { gx: 1_100_400, gy: 1_650_200 };
let k = 0;
const at = (dx: number, dy = 0) => [O.gx + dx, O.gy + dy];
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `pr-${++k}-00000000` });
const setR = (dx: number, dy: number, r: string) => db.sql(`update world_plots set rarity = $3 where gx = $1 and gy = $2`, [O.gx + dx, O.gy + dy, r]);
const one = async (q: string, p: unknown[] = []) => (await db.sql(q, p))[0];
const plot = (dx: number, dy = 0) => one(`select owner_id, rarity, shiny from world_plots where gx = $1 and gy = $2`, at(dx, dy));
/** a text[] argument (as PostgREST sends one) */
const arr = (a: string[]) => `{${a.join(',')}}`;
/** a Primordial made the old way: three ultras fused (the first plot became the Primordial, the other two were released) */
async function fusedPrimordial(uid: string, dx: number, prim: string, from: string[], released: [number, number][]) {
  await claim(uid, dx); await setR(dx, 0, prim); await db.sql(`select private.rx_sync($1, $2)`, at(dx));
  await db.sql(`insert into private.fairplay_log (player_id, kind, gx, gy, data) values ($1, 'rx_fuse', $2, $3, $4)`,
    [uid, O.gx + dx, O.gy, JSON.stringify({ from, to: prim, released: released.map(([x, y]) => at(x, y)) })]);
}
const pendingGrants = (uid: string) => db.sql(`select rarity from private.granted_rolls where player_id = $1 and used_at is null and cancelled_at is null order by id`, [uid]).then((r) => r.map((x: any) => x.rarity));
const backAlert = (uid: string) => one(`select data from player_notifications where player_id = $1 and kind = 'power' and data ->> 'sub' = 'refund_back'`, [uid]);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('pr_ann'); bob = await db.newPlayer('pr_bob'); carl = await db.newPlayer('pr_carl'); dana = await db.newPlayer('pr_dana'); erin = await db.newPlayer('pr_erin');
  for (const u of [ann, bob, carl, dana, erin]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 2_000_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'leviathan'`);
});
afterAll(() => db.close());

describe('Primordials: rolled, never fused', () => {
  it('Primordial rent is far lower, but still above every everyday ultra', async () => {
    const r = await db.sql(`select id, tier, usd_per_second::float8 u from plot_rarities where tier in ('ultra', 'primordial')`);
    const prim = r.filter((x: any) => x.tier === 'primordial'), everyday = r.filter((x: any) => x.tier === 'ultra' && !['singularity', 'genesis'].includes(x.id) && !x.id.startsWith('crown'));
    expect(prim.every((x: any) => x.u === 1e-7)).toBe(true);
    expect(Math.max(...everyday.map((x: any) => x.u))).toBeLessThan(1e-7);
  });

  it('a fused Primordial gives back the very three ultras: the plot, the released spots, or the next claim', async () => {
    // ann's second ultra was a real plot the fusion released (it sits on the map unowned, at its own roll)
    await claim(ann, 1); await setR(1, 0, 'kraken');
    await db.sql(`select private.rx_release(w, 'fused into The Loom') from world_plots w where gx = $1 and gy = $2`, at(1));
    expect((await plot(1)).owner_id).toBeNull();
    await fusedPrimordial(ann, 0, 'loom', ['chaos', 'kraken', 'hive'], [[1, 0], [2, 0]]);
    await claim(bob, 2); // somebody claimed the second released spot since
    await fusedPrimordial(bob, 10, 'midas', ['solar', 'lunar', 'comet'], [[11, 0], [12, 0]]);
    await db.sql(`update world_plots set owner_id = $3 where gx = $1 and gy = $2`, [...at(10), ann]); // bob no longer holds his
    expect((await one(`select private.primordial_refunds_open() n`)).n).toBe(1);
    expect((await one(`select private.primordial_refunds_open() n`)).n).toBe(0); // once only
    // the Primordial is its first ultra again; the free released spot is ann's again, as the second
    expect(await plot(0)).toMatchObject({ owner_id: ann, rarity: 'chaos' });
    expect(await plot(1)).toMatchObject({ owner_id: ann, rarity: 'kraken', shiny: false });
    expect((await one(`select method from plot_ownership where gx = $1 and gy = $2 and released_at is null`, at(1))).method).toBe('refund');
    // the other spot is bob's now, so ann's next claim rolls the third
    expect((await plot(2)).owner_id).toBe(bob);
    expect(await pendingGrants(ann)).toEqual(['hive']);
    const f = await one(`select status, returned, picks from primordial_refunds where player_id = $1`, [ann]);
    expect(f.status).toBe('returned');
    expect(f.picks).toBeNull();
    expect(f.returned.map((x: any) => [x.rarity, x.how])).toEqual([['chaos', 'plot'], ['kraken', 'plot'], ['hive', 'claim']]);
    // one alert says what came back (and no "pick three" alert)
    expect((await backAlert(ann)).data).toMatchObject({ rarity: 'loom', back: ['chaos', 'kraken', 'hive'], claims: 1, swapped: false });
    expect((await one(`select count(*)::int n from player_notifications where player_id = $1 and data ->> 'sub' = 'refund'`, [ann])).n).toBe(0);
    // giving a spot back isn't a claim on the feed, and doesn't count as a roll
    expect((await one(`select count(*)::int n from feed_events where player_id = $1 and kind = 'claim' and data ->> 'rarity' = 'kraken'`, [ann])).n).toBe(0);
    // the next claim is the hive
    expect((await claim(ann, 30)).rarity).toBe('hive');
    expect(await pendingGrants(ann)).toEqual([]);
    // bob's, which he no longer holds, isn't refunded (staff can see it)
    expect(await one(`select status, note from primordial_refunds where player_id = $1`, [bob])).toMatchObject({ status: 'void', note: 'no longer theirs' });
    expect(await backAlert(bob)).toBeUndefined();
  });

  it('there is nothing to pick any more', async () => {
    expect(await db.rpc(ann, 'primordial_refund_status')).toEqual({ open: [], choices: [] });
    const id = (await one(`select id from primordial_refunds where player_id = $1`, [ann])).id;
    await expectError(db.rpc(ann, 'primordial_refund_choose', { p_id: id, p_picks: arr(['volcano', 'hive', 'hive']) }), 'not_found');
    const book = await db.rpc(ann, 'fusion_book');
    expect(book.refunds).toHaveLength(1);
    expect(book.refunds[0]).toMatchObject({ status: 'returned', fused_from: ['chaos', 'kraken', 'hive'] });
  });

  it('players who had already picked get the fused ultras instead: picks undone, originals given back the same way', async () => {
    const before = async (uid: string, dx: number, from: string[], released: [number, number][]) => {
      await fusedPrimordial(uid, dx, 'loom', from, released);
      // as the picker left it: the plot first turned back into the first ultra…
      await setR(dx, 0, from[0]); await db.sql(`select private.rx_sync($1, $2)`, at(dx));
      return (await one(`insert into primordial_refunds (player_id, gx, gy, primordial, fused_from, fused_at, reverted_to)
                         select $1, $2, $3, 'loom', $4::jsonb, l.at, $5 from private.fairplay_log l where l.player_id = $1 and l.gx = $2 and l.gy = $3 returning id`,
                         [uid, ...at(dx), JSON.stringify(from), from[0]])).id;
    };
    const pick = async (uid: string, id: number, picks: string[], firstAsGrant = false) => {
      const n = (await one(`select private.roll_count($1) n`, [uid])).n;
      if (firstAsGrant) await db.sql(`insert into private.granted_rolls (player_id, rarity, at_roll, note) values ($1, $2, $3, $4)`, [uid, picks[0], n + 1, `Primordial refund #${id}`]);
      const g1 = (await one(`insert into private.granted_rolls (player_id, rarity, at_roll, note) values ($1, $2, $3, $4) returning id`, [uid, picks[1], n + 1, `Primordial refund #${id}`])).id;
      const g2 = (await one(`insert into private.granted_rolls (player_id, rarity, at_roll, note) values ($1, $2, $3, $4) returning id`, [uid, picks[2], n + 2, `Primordial refund #${id}`])).id;
      await db.sql(`update primordial_refunds set status = 'chosen', picks = $2, grants = $3, chosen_at = now() where id = $1`, [id, picks, [g1, g2]]);
    };

    // carl picked Volcano (his plot), Gemini (already claimed) and Hive (still waiting)
    const c = await before(carl, 40, ['solar', 'lunar', 'comet'], [[41, 0], [42, 0]]);
    await pick(carl, c, ['volcano', 'gemini', 'hive']);
    await setR(40, 0, 'volcano');
    const x = await claim(carl, 50);
    expect(x.rarity).toBe('gemini');
    // dana's plot had left her before she picked, so all three of her picks were claims (none used yet)
    const d = await before(dana, 60, ['phoenix', 'ancient', 'mirror'], [[61, 0], [62, 0]]);
    await db.sql(`update world_plots set owner_id = $3 where gx = $1 and gy = $2`, [...at(60), bob]);
    await claim(bob, 61); // and one of her released spots is taken
    await pick(dana, d, ['volcano', 'hive', 'kraken'], true);
    // erin fused her picked plot into something else since
    const e = await before(erin, 70, ['chaos', 'mirror', 'comet'], [[71, 0], [72, 0]]);
    await pick(erin, e, ['volcano', 'hive', 'hive']);
    await setR(70, 0, 'krakatoa');

    expect((await one(`select private.primordial_refunds_return() n`)).n).toBe(3);

    // carl: the plot is the Solar again; the claimed Gemini is back to its own roll and the Lunar comes home to its spot;
    // the waiting Hive is cancelled and the Comet comes home to its spot
    expect(await plot(40)).toMatchObject({ owner_id: carl, rarity: 'solar' });
    const own = (await one(`select private.plot_rarity_for($1, $2) r`, at(50))).r;
    expect((await plot(50)).rarity).toBe(own.startsWith('crown') ? 'mythic' : own);
    expect((await plot(50)).rarity).not.toBe('gemini');
    expect(await plot(41)).toMatchObject({ owner_id: carl, rarity: 'lunar' });
    expect(await plot(42)).toMatchObject({ owner_id: carl, rarity: 'comet' });
    expect(await pendingGrants(carl)).toEqual([]);
    expect((await backAlert(carl)).data).toMatchObject({ back: ['solar', 'lunar', 'comet'], claims: 0, swapped: true });

    // dana: her picks are cancelled; the Phoenix (her old plot is bob's) and the Ancient (its spot is taken) come on her next
    // two claims, the Mirror comes home to its spot
    expect((await plot(60)).owner_id).toBe(bob);
    expect((await plot(61)).owner_id).toBe(bob);
    expect(await plot(62)).toMatchObject({ owner_id: dana, rarity: 'mirror' });
    expect(await pendingGrants(dana)).toEqual(['phoenix', 'ancient']);
    expect((await backAlert(dana)).data).toMatchObject({ back: ['phoenix', 'ancient', 'mirror'], claims: 2, swapped: true });
    expect([(await claim(dana, 80)).rarity, (await claim(dana, 82)).rarity]).toEqual(['phoenix', 'ancient']);

    // erin: the changed plot is left alone and noted; her waiting picks become the fused ultras
    expect((await plot(70)).rarity).toBe('krakatoa');
    expect(await plot(71)).toMatchObject({ owner_id: erin, rarity: 'mirror' });
    expect(await plot(72)).toMatchObject({ owner_id: erin, rarity: 'comet' });
    const ef = await one(`select status, note, returned from primordial_refunds where id = $1`, [e]);
    expect(ef.status).toBe('returned');
    expect(ef.note).toMatch(/pick 1 \(volcano\) on the plot has changed \(now krakatoa\)/);
    expect(ef.returned.map((r: any) => r.rarity)).toEqual(['mirror', 'comet']);

    // all done, once only
    expect((await one(`select private.primordial_refunds_return() n`)).n).toBe(0);
    expect((await one(`select count(*)::int n from primordial_refunds where status in ('open', 'chosen')`)).n).toBe(0);
  });
});
