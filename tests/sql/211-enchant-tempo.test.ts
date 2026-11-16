// Enchantments, seen as they run: every clock says how fast it's running right now (a Clockwork spliced in ×3, as a
// Chimera ×4; frozen 0), with when the boost ends, and the Golden Goose shares its egg's growth curve.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ann: string;
const O = { gx: 812_300, gy: 1_571_200 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `tl-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
async function enchant(uid: string, kind: string, dx: number) {
  await force(kind);
  const r = await claim(uid, dx);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const charges = (id: string, n: number) => db.sql(`update enchantments set state = state || jsonb_build_object('charges', $2::int, 'bonus', 0, 'charge_at', extract(epoch from now())) where id = $1`, [id, n]);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('tl_ann');
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [ann]);
  await db.giveInk(ann, 200_000);
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  // (no Aberrations or unstable splices: a random one would change the rates these check)
  await db.sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}'::jsonb where key = 'enchantments'`);
});
afterAll(() => db.close());

describe('a clock that runs fast shows it', () => {
  let goose: string, clock: string, splice: string, goose2: string, clock2: string; // eslint-disable-line @typescript-eslint/no-unused-vars
  it('normally ×1, with the egg’s curve', async () => {
    goose = await enchant(ann, 'goose', 0);
    const g = await get(ann, goose);
    expect(g.clock.rate).toBe(1);
    expect(g.clock.rate_until).toBeNull();
    expect(g.view).toMatchObject({ tau_h: 6, max: 140, min: 6 });
    expect(g.view.age_s).toBeGreaterThanOrEqual(0);
  });

  it('a Clockwork swapped in: ×3 until the splice ends — and the egg really grows ×3 as fast', async () => {
    clock = await enchant(ann, 'clockwork', 3);
    splice = await enchant(ann, 'splice', 6);
    await charges(splice, 3);
    await act(ann, splice, 'splice', { mode: 'swap', a: goose, b: clock });
    const g = await get(ann, goose);
    expect(g.clock.rate).toBe(3);
    expect(Date.parse(g.clock.rate_until)).toBeGreaterThan(Date.now() + 23 * 3600e3);
    // the list says the same
    expect((await db.rpc(ann, 'my_enchantments')).find((e: any) => e.id === goose).clock.rate).toBe(3);
    // ten real minutes later (the splice started ten minutes ago): thirty minutes of egg
    await db.sql(`update enchant_splices set started_at = started_at - interval '10 minutes' where a = $1 or b = $1`, [goose]);
    await db.sql(`update enchantments set state = state || jsonb_build_object('egg_at', extract(epoch from now() - interval '10 minutes')) where id = $1`, [goose]);
    const age = (await get(ann, goose)).view.age_s;
    expect(age).toBeGreaterThanOrEqual(1790);
    expect(age).toBeLessThanOrEqual(1815);
    // the Clockwork itself isn't sped up (it lends Tempo, it doesn't wear it)
    expect((await get(ann, clock)).clock.rate).toBe(1);
  });

  it('a Chimera doubles it: ×4', async () => {
    goose2 = await enchant(ann, 'goose', 9);
    clock2 = await enchant(ann, 'clockwork', 12);
    // (one Splice runs one splice at a time: a second one)
    const splice2 = await enchant(ann, 'splice', 15);
    await charges(splice2, 3);
    await act(ann, splice2, 'splice', { mode: 'chimera', a: goose2, b: clock2 });
    expect((await get(ann, goose2)).clock.rate).toBe(4);
  });

  it('frozen: 0', async () => {
    await db.sql(`update enchantments set frozen_at = now(), frozen_until = now() + interval '1 hour' where id = $1`, [goose2]);
    expect((await get(ann, goose2)).clock.rate).toBe(0);
  });
});
