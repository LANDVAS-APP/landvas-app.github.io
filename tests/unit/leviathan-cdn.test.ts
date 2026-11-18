// The Leviathan from the CDN (src/leviathan/useLeviathan.ts): the world's view from the snapshot, your own part asked
// only when it matters — and the one old call whenever the CDN isn't there.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let snap: any = null;
const calls = { state: 0, me: 0 };
vi.mock('../../src/lib/cdn', () => ({ cdnSnapshot: vi.fn(async () => snap), cdnSkew: () => 0 }));
vi.mock('../../src/backend/api', () => ({
  api: {
    leviathanState: vi.fn(async () => { calls.state++; return { server_time: new Date().toISOString(), lev: null, feed: null, top: null, me: null, last: null, next_at: null, bones: [] }; }),
    leviathanMe: vi.fn(async () => { calls.me++; return { server_time: new Date().toISOString(), me: { dmg: 7 }, loot: null, deep_my_dmg: null, lev: null }; }),
  },
}));
vi.mock('../../src/lib/queries', () => ({ useOnboardedMe: () => null }));
const { loadLeviathan, resetLeviathan } = await import('../../src/leviathan/useLeviathan');

const world = (lev: any) => ({ server_time: new Date().toISOString(), built_at: new Date().toISOString(), snapshot: 'leviathan', lev,
  feed: [], top: [{ player: { id: 'ann' }, dmg: 9, me: null }], me: null, last: null, next_at: null, bones: [] });
const walking = { id: 'L1', status: 'walking', hidden: false };

beforeEach(() => { resetLeviathan(); snap = null; calls.state = 0; calls.me = 0; vi.useRealTimers(); });

describe('the Leviathan from the CDN', () => {
  it('no CDN: the old call, as before', async () => {
    const r = await loadLeviathan(false, 'ann', undefined);
    expect(calls).toEqual({ state: 1, me: 0 });
    expect(r.lev).toBeNull();
  });

  it('with the CDN: the world from the snapshot, your part once, then not again for a minute', async () => {
    snap = world(walking);
    const r = await loadLeviathan(false, 'ann', undefined);
    expect(calls).toEqual({ state: 0, me: 1 });
    expect(r.me).toEqual({ dmg: 7 });
    expect(r.top![0].me).toBe(true);
    expect(r).not.toHaveProperty('built_at');
    for (let i = 0; i < 5; i++) await loadLeviathan(false, 'ann', undefined);
    expect(calls.me).toBe(1);
  });

  it('asks for your part every look while you fight, while it hides, and when it changes stage', async () => {
    snap = world(walking);
    await loadLeviathan(false, 'ann', undefined);
    await loadLeviathan(true, 'ann', undefined);
    await loadLeviathan(true, 'ann', undefined);
    expect(calls.me).toBe(3);
    snap = world({ ...walking, hidden: true });
    await loadLeviathan(false, 'ann', undefined);
    await loadLeviathan(false, 'ann', undefined);
    expect(calls.me).toBe(5);
    snap = world({ ...walking, status: 'enraged' });
    await loadLeviathan(false, 'ann', undefined);
    expect(calls.me).toBe(6);
    await loadLeviathan(false, 'ann', undefined);
    expect(calls.me).toBe(6);
  });

  it('signed out: the snapshot alone, no database at all', async () => {
    snap = world(walking);
    const r = await loadLeviathan(false, null, undefined);
    expect(calls).toEqual({ state: 0, me: 0 });
    expect(r.me).toBeNull();
    expect(r.top![0].me).toBe(false);
  });

  it('another player on this phone never gets the last one’s part', async () => {
    snap = world(walking);
    await loadLeviathan(false, 'ann', undefined);
    await loadLeviathan(false, 'bob', undefined);
    expect(calls.me).toBe(2);
  });

  it('a hit’s answer since the last look counts as your newest part', async () => {
    snap = world(walking);
    await loadLeviathan(false, 'ann', undefined);
    const later = { ...world(walking), server_time: new Date(Date.now() + 5000).toISOString(), me: { dmg: 99 } } as any;
    const r = await loadLeviathan(false, 'ann', later);
    expect(calls.me).toBe(1);
    expect(r.me).toEqual({ dmg: 99 });
  });
});
