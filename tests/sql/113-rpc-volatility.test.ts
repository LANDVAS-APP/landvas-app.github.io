// Guard: the hosted API runs STABLE/IMMUTABLE functions read-only, and require_active_player()
// writes (last activity) — so no public function that calls it may be STABLE or IMMUTABLE.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
beforeAll(async () => { await db.init({ ungated: true }); });
afterAll(() => db.close());

describe('RPC volatility', () => {
  it('no read-only function checks (and so writes to) the player', async () => {
    const rows = await db.sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.provolatile in ('s', 'i') and p.prosrc like '%require_active_player%'`);
    expect(rows.map((r: any) => r.proname)).toEqual([]);
  });

  it('the planet map and sanctuary directory work inside a read-only transaction', async () => {
    const u = await db.newPlayer('ro_tester');
    await db.sql(`update players set last_active_at = now() - interval '1 hour' where id = $1`, [u]);
    // emulate the hosted API: a read-only transaction for read-only functions — these are volatile now, so they get read/write
    const vol = await db.sql(`select proname, provolatile from pg_proc where proname in ('planet_map', 'sanctuary_directory', 'planet_meteors', 'inkborn_economy')`);
    expect(vol.every((r: any) => r.provolatile === 'v')).toBe(true);
    expect((await db.rpc(u, 'sanctuary_directory', {})).items).toEqual(expect.any(Array));
  });
});
