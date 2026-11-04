// v0.52 Planet discoveries: storms with shards, hidden aliens (and the codex), places to investigate.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let a: string, b: string;
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const stand = (uid: string, d: number[]) => db.rpc(uid, 'planet_live', { p_world: 'mars', p_d: d });
const items = async (uid: string) => Object.fromEntries((await db.sql(`select item, qty from planet_items where player_id = $1`, [uid])).map((r: any) => [r.item, Number(r.qty)]));

beforeAll(async () => {
  await db.init({ ungated: true });
  a = await db.newPlayer('disc_a'); b = await db.newPlayer('disc_b');
  await putOn(a, 'mars'); await putOn(b, 'mars');
});
afterAll(() => db.close());

describe('Planet discoveries', () => {
  it('everyone sees the same world: its weather, today’s aliens and its places', async () => {
    const x = await db.rpc(a, 'planet_discoveries', { p_world: 'mars' });
    const y = await db.rpc(b, 'planet_discoveries', { p_world: 'mars' });
    expect(x.weather).toMatchObject({ kind: 'dust', name: 'Dust storm' });
    expect(new Date(x.weather.ends).getTime() - new Date(x.weather.starts).getTime()).toBe(8 * 60_000);
    expect(x.aliens).toHaveLength(12);
    expect(x.pois).toHaveLength(40);
    expect(y.aliens.map((q: any) => q.species.id)).toEqual(x.aliens.map((q: any) => q.species.id));
    expect(y.pois.map((q: any) => q.kind)).toEqual(x.pois.map((q: any) => q.kind));
    // each world keeps to a few species
    const common = new Set(x.aliens.filter((q: any) => q.species.rarity === 'common').map((q: any) => q.species.id));
    expect(common.size).toBeLessThanOrEqual(3);
  });

  it('find an alien only up close; it goes in your codex (a new species pays triple)', async () => {
    const x = await db.rpc(a, 'planet_discoveries', { p_world: 'mars' });
    const al = x.aliens[0];
    await expectError(db.rpc(a, 'planet_find', { p_world: 'mars', p_kind: 'alien', p_idx: 0 }), 'too_far');
    await stand(a, al.d);
    const r = await db.rpc(a, 'planet_find', { p_world: 'mars', p_kind: 'alien', p_idx: 0, p_d: al.d });
    expect(r.new_species).toBe(true);
    expect(r.earned).toBe(al.species.ink * 3);
    await expectError(db.rpc(a, 'planet_find', { p_world: 'mars', p_kind: 'alien', p_idx: 0, p_d: al.d }), 'already_found');
    const after = await db.rpc(a, 'planet_discoveries', { p_world: 'mars' });
    expect(after.aliens[0].found).toBe(true);
    expect(after.codex[al.species.id]).toBe(1);
    // b can find the same one too (everyone finds their own)
    await stand(b, al.d);
    expect((await db.rpc(b, 'planet_find', { p_world: 'mars', p_kind: 'alien', p_idx: 0, p_d: al.d })).kind).toBe('alien');
  });

  it('investigate a place once for its find', async () => {
    const x = await db.rpc(a, 'planet_discoveries', { p_world: 'mars' });
    const p = x.pois[0];
    await stand(a, p.d);
    const before = await items(a);
    const r = await db.rpc(a, 'planet_find', { p_world: 'mars', p_kind: 'poi', p_idx: 0, p_d: p.d });
    expect(r.poi).toBe(p.kind);
    const after = await items(a);
    const gained = Object.entries(r.items as Record<string, number>).filter(([, n]) => n > 0);
    for (const [k, n] of gained) expect(after[k] ?? 0).toBe((before[k] ?? 0) + n);
    await expectError(db.rpc(a, 'planet_find', { p_world: 'mars', p_kind: 'poi', p_idx: 0, p_d: p.d }), 'already_found');
    // the far ones are out of reach from here
    const far = x.pois.find((q: any) => q.i >= 8);
    await expectError(db.rpc(a, 'planet_find', { p_world: 'mars', p_kind: 'poi', p_idx: far.i, p_d: far.d }), 'too_far');
  });

  it('storm shards only during a storm', async () => {
    const x = await db.rpc(a, 'planet_discoveries', { p_world: 'mars' });
    if (!x.weather.active) {
      expect(x.weather.shards).toEqual([]);
      await expectError(db.rpc(a, 'planet_find', { p_world: 'mars', p_kind: 'shard', p_idx: 0 }), 'storm_over');
      return;
    }
    const sh = x.weather.shards[0];
    await stand(a, sh.d);
    const r = await db.rpc(a, 'planet_find', { p_world: 'mars', p_kind: 'shard', p_idx: 0, p_d: sh.d });
    expect(Object.keys(r.items)).toHaveLength(1);
  });
});
