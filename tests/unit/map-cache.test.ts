// The map loads only what changed: map updates are replayed from a saved point, and tile blocks are kept between visits.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapUpdate } from '../../src/backend/types';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
vi.stubGlobal('document', { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
vi.stubGlobal('addEventListener', () => {});

let cursor = 0;
const be = { session: () => ({ userId: 'u1' }), mapCursor: () => cursor, setMapCursor: (n: number) => { if (!cursor) cursor = n; } };
vi.mock('../../src/backend/backend', () => ({ getBackend: () => be }));

class Blocks<T> { m = new Map<string, T>(); dump(n: number) { return [...this.m.entries()].slice(-n); } restore(e: [string, T][]) { for (const [k, v] of e) if (!this.m.has(k)) this.m.set(k, v); } }

describe('map cache between visits', () => {
  beforeEach(() => { store.clear(); cursor = 0; vi.resetModules(); });

  it('saves the blocks with the newest update, and restores them for the same player', async () => {
    const { saveMapCache, restoreMapCache } = await import('../../src/map/mapCache');
    const plots = new Blocks<unknown[]>(), art = new Blocks<[string, number][]>();
    plots.m.set('1_2', [[64, 128, 'meadow']]); art.m.set('18/3/4', [['5/6', 7]]);
    cursor = 42;
    saveMapCache(plots as never, art as never);
    cursor = 0;
    const p2 = new Blocks<unknown[]>(), a2 = new Blocks<[string, number][]>();
    expect(restoreMapCache(p2 as never, a2 as never)).toBe(true);
    expect(p2.m.get('1_2')).toEqual([[64, 128, 'meadow']]);
    expect(a2.m.get('18/3/4')).toEqual([['5/6', 7]]);
    expect(cursor).toBe(42);
  });

  it("doesn't restore another player's blocks", async () => {
    const { saveMapCache, restoreMapCache } = await import('../../src/map/mapCache');
    const plots = new Blocks<unknown[]>(), art = new Blocks<[string, number][]>();
    plots.m.set('1_2', []); cursor = 9;
    saveMapCache(plots as never, art as never);
    cursor = 0;
    const saved = JSON.parse(store.get('landvas.map-cache.v1')!); saved.uid = 'someone-else'; store.set('landvas.map-cache.v1', JSON.stringify(saved));
    expect(restoreMapCache(new Blocks() as never, new Blocks() as never)).toBe(false);
    expect(cursor).toBe(0);
  });
});

describe('map updates since a point', () => {
  const run = async (seen: number, reply: { latest_id: number; updates: MapUpdate[] }) => {
    const { SupabaseBackend } = await import('../../src/backend/supabase/SupabaseBackend');
    const self = { mapSeen: seen, rpc: vi.fn(async () => reply) } as unknown as InstanceType<typeof SupabaseBackend>;
    const got: MapUpdate[] = [];
    const stop = SupabaseBackend.prototype.subscribeMapUpdates.call(self, (u: MapUpdate) => got.push(u));
    await new Promise((r) => setTimeout(r, 0));
    stop();
    return { got, self: self as unknown as { mapSeen: number; rpc: ReturnType<typeof vi.fn> } };
  };
  const up = (id: number): MapUpdate => ({ id, kind: 'art', min_gx: id, min_gy: id, max_gx: id, max_gy: id, publication_id: null });

  it('replays the updates since the saved point', async () => {
    const { got, self } = await run(10, { latest_id: 12, updates: [up(11), up(12)] });
    expect(self.rpc).toHaveBeenCalledWith('map_updates_since', { p_since_id: 10 });
    expect(got.map((u) => u.id)).toEqual([11, 12]);
    expect(self.mapSeen).toBe(12);
  });

  it('starts over when more changed than one answer holds', async () => {
    const { got } = await run(10, { latest_id: 900, updates: [up(11), up(12)] });
    expect(got.at(-1)!.max_gx - got.at(-1)!.min_gx).toBeGreaterThan(1_000_000);
  });

  it('on a first visit, only notes where things stand', async () => {
    const { got, self } = await run(0, { latest_id: 77, updates: [up(1)] });
    expect(got).toEqual([]);
    expect(self.mapSeen).toBe(77);
  });
});
