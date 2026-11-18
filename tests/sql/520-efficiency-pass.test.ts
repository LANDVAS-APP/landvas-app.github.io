// v1.0 efficiency pass: the same answers for less database work. The rewritten calls give exactly what the old ones
// gave: your plot list matches the per-plot helper, the hot zone's facts match a direct lookup, one plot-places call
// matches the five it replaces, settings are stored unpacked with the same content, and the plan-keeping helpers
// answer as before.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let owner: string, other: string;
const A = { gx: 2_400_000, gy: 1_500_000 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: A.gx + dx, p_gy: A.gy + dy, p_idempotency_key: `eff-${++k}-00000000` });
const groupAt = async (uid: string, dx: number, dy = 0) =>
  (await db.rpc(uid, 'my_groups')).find((g: any) => g.cells.some((c: number[]) => c[0] === A.gx + dx && c[1] === A.gy + dy)).id as string;

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 12 });
  await db.sql(`update game_config set value = jsonb_set(value, '{steps}', '[[1, 1]]') where key = 'plot_access'`);
  owner = await db.newPlayer('eff_owner'); other = await db.newPlayer('eff_other');
  await db.sql(`update players set created_at = now() - interval '5 days'`);
  for (const u of [owner, other]) await db.giveInk(u, 500_000);
  for (let i = 0; i < 6; i++) await claim(owner, i * 2);
  await claim(owner, 1); // touches the first two: they're adjacent groups now
  await claim(other, 40);
  // places of every kind on the owner's land
  await db.rpc(owner, 'set_group_kind', { p_group_id: await groupAt(owner, 2), p_kind: 'farm' });
  await db.rpc(owner, 'set_group_kind', { p_group_id: await groupAt(owner, 4), p_kind: 'arcade' });
  await db.rpc(owner, 'set_group_kind', { p_group_id: await groupAt(owner, 6), p_kind: 'mine' });
  await db.rpc(owner, 'set_group_kind', { p_group_id: await groupAt(owner, 8), p_kind: 'business' });
});
afterAll(() => db.close());

describe('Efficiency pass', () => {
  it('your plot list is exactly the per-plot helper’s answers, newest first', async () => {
    for (const uid of [owner, other]) {
      const list = await db.rpc(uid, 'my_groups');
      const want = (await db.sql(`select coalesce(jsonb_agg(private.group_json(g.id) order by g.updated_at desc), '[]'::jsonb) j
                                    from canvas_groups g where g.owner_id = $1 and g.status = 'active'`, [uid]))[0].j;
      expect(list).toEqual(want);
    }
    const mine = await db.rpc(owner, 'my_groups');
    expect(mine.some((g: any) => g.farm_id) && mine.some((g: any) => g.arcade_id) && mine.some((g: any) => g.realm_id) && mine.some((g: any) => g.business_id)).toBe(true);
    expect(mine.some((g: any) => g.adjacent_groups.length > 0)).toBe(true);
  });

  it('the hot zone’s facts come from its city', async () => {
    const z = await db.rpc(owner, 'hot_zone_today');
    expect(z.today).toBeTruthy();
    const c = (await db.sql(`select pop, state, country, country_name from world_cities where id = $1`, [Number(z.today.id)]))[0];
    expect(z.about).toMatchObject({ pop: c.pop, state: c.state, country: c.country, country_name: c.country_name });
    const rank = (await db.sql(`select count(*)::int + 1 n from world_cities where country = $1 and pop > $2`, [c.country, c.pop]))[0].n;
    expect(z.about.pop_rank).toBe(rank);
  });

  it('one plot-places call answers exactly as the five lookups', async () => {
    for (const dx of [0, 2, 4, 6, 8, 40, 99]) {
      const [gx, gy] = [A.gx + dx, A.gy];
      const one = await db.rpc(null, 'places_for_plot', { p_gx: gx, p_gy: gy });
      expect(one).toEqual({
        habitat: await db.rpc(null, 'habitat_for_plot', { p_gx: gx, p_gy: gy }),
        farm: await db.rpc(null, 'farm_for_plot', { p_gx: gx, p_gy: gy }),
        business: await db.rpc(null, 'biz_for_plot', { p_gx: gx, p_gy: gy }),
        arcade: await db.rpc(null, 'arcade_for_plot', { p_gx: gx, p_gy: gy }),
        realm: await db.rpc(null, 'realm_for_plot', { p_gx: gx, p_gy: gy }),
      });
      // only the kinds asked about are looked up
      expect(await db.rpc(null, 'places_for_plot', { p_gx: gx, p_gy: gy, p_kinds: '{farm}' }))
        .toEqual({ habitat: null, farm: one.farm, business: null, arcade: null, realm: null });
    }
    expect((await db.rpc(null, 'places_for_plot', { p_gx: A.gx + 2, p_gy: A.gy })).farm).toBeTruthy();
  });

  it('settings are stored unpacked, with the same content', async () => {
    const packed = (await db.sql(`select count(*)::int n from game_config where pg_column_compression(value) is not null`))[0].n;
    expect(packed).toBe(0);
    expect((await db.sql(`select pg_column_size(value) > 50000 big from game_config where key = 'realms'`))[0].big).toBe(true);
    // a new value stays unpacked too
    await db.sql(`update game_config set value = value || jsonb_build_object('eff_note', repeat('x', 5000)) where key = 'realms'`);
    expect((await db.sql(`select pg_column_compression(value) c from game_config where key = 'realms'`))[0].c).toBe(null);
    expect((await db.sql(`select private.rlm_cfg('mine') = (value -> 'kinds' -> 'mine') same from game_config where key = 'realms'`))[0].same).toBe(true);
    await db.sql(`update game_config set value = value - 'eff_note' where key = 'realms'`);
  });

  it('busy helpers keep their plans (PL/pgSQL), with the same answers', async () => {
    const lang = async (sig: string) => (await db.sql(`select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = $1::regprocedure`, [sig]))[0].lanname;
    expect(await lang('private.cfg(text)')).toBe('plpgsql');
    expect(await lang('private.ench_partners(uuid)')).toBe('plpgsql');
    expect(await lang('private.day_start(timestamptz)')).toBe('plpgsql');
    // helpers simple enough to be folded into their callers stay SQL
    expect(await lang('private.artist_level(bigint)')).toBe('sql');
    expect((await db.sql(`select private.cfg('rent') = (select value from game_config where key = 'rent') same`))[0].same).toBe(true);
    expect((await db.sql(`select private.cfg('no_such_setting') is null missing`))[0].missing).toBe(true);
    // every rewritten helper answers with its query’s first row, as a SQL function does
    const n = (await db.sql(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace join pg_language l on l.oid = p.prolang
                              where s.nspname in ('public', 'private') and l.lanname = 'plpgsql' and p.prosrc like '%lv_q(lv_x) limit 1%'`))[0].n;
    expect(n).toBeGreaterThan(200);
  });
});
