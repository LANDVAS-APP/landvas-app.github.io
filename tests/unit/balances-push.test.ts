// New balances handed back by a call go straight onto the screen, and a burst of such actions doesn't re-read
// your whole state.
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const calls: string[] = [];
vi.mock('../../src/backend/backend', () => ({
  getBackend: () => ({ session: () => ({ userId: 'u1' }), rpc: async (fn: string) => { calls.push(fn); return { ok: true, balances: { ink: 77 } }; } }),
}));

describe('balances from replies', () => {
  it('patches your balances and skips re-reading your state after balance-only actions', async () => {
    const { api } = await import('../../src/backend/api');
    const { watchBalances, invalidateGame, qk } = await import('../../src/lib/queries');
    const qc = new QueryClient();
    qc.setQueryData(qk.me, { onboarded: true, balances: { ink: 5, brush_points: 2 } });
    watchBalances(qc);
    const spy = vi.spyOn(qc, 'invalidateQueries');
    await api.farmPlant('f1', 0, 'carrot');
    invalidateGame(qc);
    await api.farmPlant('f1', 1, 'carrot');
    invalidateGame(qc);
    expect((qc.getQueryData(qk.me) as { balances: Record<string, number> }).balances).toEqual({ ink: 77, brush_points: 2 });
    await new Promise((r) => setTimeout(r, 500));
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).not.toContain(JSON.stringify(qk.me));
    expect(keys).toContain(JSON.stringify(qk.groups));
    expect(spy.mock.calls.filter((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey) === JSON.stringify(qk.groups))).toHaveLength(1); // one refresh for the burst
  });
});
