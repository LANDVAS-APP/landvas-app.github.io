// v1.3b: sacrifice Inkborn and eggs for Luck; the live feed shows sacrifices, Crowns, flights and estates.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let u: string;
const inkborn = (name: string, bond = 0) => db.sql(`insert into inkborn (owner_id, client_key, name, source, genome, personality, bond) values ($1, $2, $3, 'random', '{}', 'playful', $4) returning id`, [u, `key-${name}-xxxx`, name, bond]);
const egg = (kind: string) => db.sql(`insert into inkborn_eggs (owner_id, kind, shell, genome, parents, hatch_at) values ($1, $2, '{}', '{}', '[]', now() + interval '1 day') returning id`, [u, kind]);
const feed = (kind: string) => db.sql(`select data from feed_events where kind = $1 and player_id = $2 order by id desc`, [kind, u]);

beforeAll(async () => { await db.init({ ungated: true, freePlots: 10 }); u = await db.newPlayer('saga_sacrifice'); });
afterAll(() => db.close());

describe('sacrificing Inkborn and eggs', () => {
  it('the altar lists them, with the Luck each gives', async () => {
    await inkborn('Blot'); await inkborn('Smudge', 80); await egg('speckled'); await egg('cosmic');
    const s = await db.rpc(u, 'luck_status');
    expect(s.inkborn.map((i: any) => i.luck).sort()).toEqual([12, 20]);
    expect(s.eggs.map((e: any) => e.luck).sort()).toEqual([18, 8]);
  });
  it('an Inkborn gives Luck (more if you were close), never your last one', async () => {
    const s = await db.rpc(u, 'luck_status');
    const bonded = s.inkborn.find((i: any) => i.luck === 20);
    const r = await db.rpc(u, 'luck_sacrifice_inkborn', { p_id: bonded.id });
    expect(r).toMatchObject({ luck: 20, gained: 20 });
    const last = s.inkborn.find((i: any) => i.luck === 12);
    await expectError(db.rpc(u, 'luck_sacrifice_inkborn', { p_id: last.id }), 'last_inkborn');
    expect((await feed('luck'))[0].data).toMatchObject({ sub: 'sacrifice', what: 'inkborn', name: 'Smudge', gained: 20, luck: 20 });
  });
  it('eggs too — rare shells give more', async () => {
    const s = await db.rpc(u, 'luck_status');
    for (const e of s.eggs) await db.rpc(u, 'luck_sacrifice_egg', { p_id: e.id });
    expect((await db.rpc(u, 'luck_status')).luck).toBe(46);
    expect((await feed('luck')).length).toBe(3);
  });
  it('Luck tops out at 100', async () => {
    await db.sql(`update player_luck set luck = 100 where player_id = $1`, [u]);
    const [e] = await egg('striped');
    await expectError(db.rpc(u, 'luck_sacrifice_egg', { p_id: e.id }), 'luck_full');
  });
});

describe('the live feed', () => {
  it('a Crown claimed is its own moment (and claims say when they’re shiny)', async () => {
    await db.sql(`update game_config set value = value || '{"crown": {"ppm": 1000000, "pct": 50, "need": 5}}' where key = 'rarity_abilities'`);
    await db.sql(`update player_luck set luck = 0 where player_id = $1`, [u]);
    const [k] = await db.sql(`select gx, gy from world_cities where name = 'Boston' and country = 'US'`);
    await db.sql(`select private.take_plot($1, $2, $3, 'acquire', '{}')`, [u, k.gx + 1, k.gy + 1]);
    expect((await feed('crown'))[0].data).toMatchObject({ tier: 'crown', place: 'Boston', country: 'US' });
    expect((await feed('claim'))[0].data).toHaveProperty('shiny');
  });
  it('a flight to the Hot Zone names it; a pin stays a secret', async () => {
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
    await db.rpc(u, 'report_position', { p_lng: -111.891, p_lat: 40.7608, p_accuracy_m: 10 });
    await db.rpc(u, 'travel_fly_to', { p_lng: 2.35, p_lat: 48.85, p_name: 'Hot Zone · Paris' });
    expect((await feed('flight'))[0].data).toMatchObject({ to: 'Hot Zone · Paris', hot: true });
  });
});
