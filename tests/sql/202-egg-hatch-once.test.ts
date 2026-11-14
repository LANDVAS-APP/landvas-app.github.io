// Fix: hatch an egg, sacrifice the new Inkborn at the Altar of Luck, and the egg used to come back unhatched (the link
// to its creature was set to null when the creature went), so it could be hatched and sacrificed again forever.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let u: string;
const egg = async () => (await db.sql(`insert into inkborn_eggs (owner_id, kind, shell, genome, parents, hatch_at) values ($1, 'speckled', '{}', '{"mood": "playful"}', '[]', now() - interval '1 minute') returning id`, [u]))[0].id as string;
const eggs = async () => (await db.sql(`select id, hatched_inkborn, hatched_at from inkborn_eggs where owner_id = $1`, [u])) as any[];
const luck = async () => Number((await db.sql(`select coalesce((select luck from player_luck where player_id = $1), 0) l`, [u]))[0].l);

beforeAll(async () => {
  await db.init({ ungated: true });
  u = await db.newPlayer('hatch_once');
  // a creature to keep (the altar never takes your last one)
  await db.sql(`insert into inkborn (owner_id, client_key, name, source, genome, personality) values ($1, 'keep-me-0001', 'Keeper', 'random', '{}', 'playful')`, [u]);
});
afterAll(() => db.close());

describe('an egg hatches once', () => {
  it('sacrificing what hatched does not bring the egg back', async () => {
    const e = await egg();
    const h = await db.rpc(u, 'inkborn_egg_hatch', { p_egg: e, p_name: 'Hatchling' });
    expect((await eggs()).find((x) => x.id === e)).toMatchObject({ hatched_inkborn: h.inkborn.id });
    expect((await eggs()).find((x) => x.id === e).hatched_at).not.toBeNull();
    const r = await db.rpc(u, 'luck_sacrifice_inkborn', { p_id: h.inkborn.id });
    expect(r.gained).toBeGreaterThan(0);
    const l = await luck();
    // the egg went with it: not in the nest, not on the altar, can't be hatched again
    expect((await eggs()).find((x) => x.id === e)).toBeUndefined();
    expect((await db.rpc(u, 'luck_status', {})).eggs).toEqual([]);
    await expectError(db.rpc(u, 'inkborn_egg_hatch', { p_egg: e, p_name: 'Again' }), 'not_owner');
    await expectError(db.rpc(u, 'luck_sacrifice_egg', { p_id: e }), 'not_owner');
    expect(await luck()).toBe(l);
  });

  it('a hatched egg is refused even if its link to the creature were lost', async () => {
    const e = await egg();
    const h = await db.rpc(u, 'inkborn_egg_hatch', { p_egg: e, p_name: 'Second' });
    await db.sql(`update inkborn_eggs set hatched_inkborn = null where id = $1`, [e]);
    await expectError(db.rpc(u, 'inkborn_egg_hatch', { p_egg: e, p_name: 'Third' }), 'egg_hatched');
    expect(h.inkborn.id).toBeTruthy();
  });

  it('a fresh egg still hatches, and an unhatched egg can still go on the altar', async () => {
    const a = await egg(), b = await egg();
    expect((await db.rpc(u, 'inkborn_egg_hatch', { p_egg: a, p_name: 'Fresh' })).inkborn.name).toBe('Fresh');
    await expectError(db.rpc(u, 'inkborn_egg_hatch', { p_egg: a, p_name: 'Fresh2' }), 'egg_hatched');
    expect((await db.rpc(u, 'luck_sacrifice_egg', { p_id: b })).gained).toBeGreaterThan(0);
  });
});
