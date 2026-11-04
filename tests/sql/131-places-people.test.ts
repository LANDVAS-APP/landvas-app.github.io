// v0.54 Your plots everywhere, who's on a world with you, and claimed counts per world.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let a: string, b: string;
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);

beforeAll(async () => {
  await db.init({ ungated: true });
  a = await db.newPlayer('pp_a'); b = await db.newPlayer('pp_b');
  await putOn(a, 'mars'); await putOn(b, 'mars');
});
afterAll(() => db.close());

describe('Places and people', () => {
  it('lists every world with claimed counts and your own plots', async () => {
    await db.sql(`insert into planet_plots (world, gx, gy, owner_id, rarity) values ('mars', 10, 20, $1, 'common'), ('mars', 11, 20, $2, 'common'), ('moon', 5, 5, $1, 'rare')`, [a, b]);
    const o = await db.rpc(a, 'planet_overview', {});
    const mars = o.worlds.find((w: any) => w.world === 'mars');
    expect(mars).toMatchObject({ claimed: 2, mine: 1 });
    expect(mars.rows).toBeGreaterThan(0);
    expect(o.worlds.find((w: any) => w.world === 'exo')).toBeUndefined();
    expect(o.plots.map((p: any) => `${p.world}:${p.gx}:${p.gy}`).sort()).toEqual(['mars:10:20', 'moon:5:5']);
  });
  it('shows who is on the world with you right now, and where', async () => {
    await db.rpc(a, 'planet_live', { p_world: 'mars', p_d: [0, 0.1, 1] });
    await db.rpc(b, 'planet_live', { p_world: 'mars', p_d: [0.01, 0.1, 1] });
    const here = await db.rpc(a, 'planet_here', { p_world: 'mars' });
    expect(here).toHaveLength(1);
    expect(here[0].player.username).toBe('pp_b');
    expect(here[0].d).toHaveLength(3);
    const o = await db.rpc(a, 'planet_overview', {});
    expect(o.worlds.find((w: any) => w.world === 'mars').here_now).toBe(2);
    await db.sql(`update planet_presence set seen_at = now() - interval '5 minutes' where player_id = $1`, [b]);
    expect(await db.rpc(a, 'planet_here', { p_world: 'mars' })).toHaveLength(0);
  });
});
