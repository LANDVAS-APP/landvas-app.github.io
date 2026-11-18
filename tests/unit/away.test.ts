// Away from the screen (src/lib/away.ts) and which client errors get reported (src/lib/errorReports.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const channels = new Map<string, (m: unknown) => void>();
vi.mock('../../src/backend/backend', () => ({
  getBackend: () => ({ liveChannel: (name: string, cb: (m: unknown) => void) => { channels.set(name, cb); return { send() {}, close() { channels.delete(name); } }; } }),
}));

const away = await import('../../src/lib/away');
const { nudged } = await import('../../src/lib/nudge');
const { shouldReport, resetReports } = await import('../../src/lib/errorReports');

beforeEach(() => { vi.useFakeTimers(); away.resetAway(); channels.clear(); });
afterEach(() => vi.useRealTimers());

describe('away from the screen', () => {
  it('goes away after five quiet minutes on a browse screen, and the first touch brings you back', () => {
    const back = vi.fn();
    const off = away.onBack(back);
    away.awayRoute('/world');
    vi.advanceTimersByTime(4 * 60_000);
    expect(away.isAway()).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(away.isAway()).toBe(true);
    away.stillHere();
    expect(away.isAway()).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
    off();
  });

  it('never goes away in a game, a room or while watching', () => {
    for (const p of ['/play/rockrun', '/arcade/abc', '/watch/sam', '/eyes', '/u/sam/home', '/create/g1']) {
      away.resetAway();
      away.awayRoute(p);
      vi.advanceTimersByTime(60 * 60_000);
      expect(away.isAway(), p).toBe(false);
    }
  });

  it('a held browse screen stays here until it lets go', () => {
    away.awayRoute('/world');
    const release = away.holdHere();
    vi.advanceTimersByTime(30 * 60_000);
    expect(away.isAway()).toBe(false);
    release();
    vi.advanceTimersByTime(5 * 60_000 + 1000);
    expect(away.isAway()).toBe(true);
  });

  it('nudges wait while you are away and look once when you come back', async () => {
    away.awayRoute('/world');
    const check = vi.fn();
    const n = nudged('global-chat', check, { safetyMs: 45_000, gapMs: 2000 });
    vi.advanceTimersByTime(5 * 60_000 + 1000);
    const seenBefore = check.mock.calls.length;
    expect(away.isAway()).toBe(true);
    for (let i = 0; i < 20; i++) { channels.get('global-chat')!({ t: 'chat' }); await vi.advanceTimersByTimeAsync(3000); }
    await vi.advanceTimersByTimeAsync(10 * 60_000); // safety checks too
    expect(check.mock.calls.length).toBe(seenBefore);
    away.stillHere();
    await vi.advanceTimersByTimeAsync(10);
    expect(check.mock.calls.length).toBe(seenBefore + 1);
    n.stop();
  });
});

describe('client error reports', () => {
  beforeEach(() => resetReports());

  it('reports each distinct error once, ignoring the numbers and ids that vary', () => {
    expect(shouldReport('Cannot read properties of undefined (reading 12)')).toBe(true);
    expect(shouldReport('Cannot read properties of undefined (reading 13)')).toBe(false);
    expect(shouldReport('plot 3fa85f64-5717-4562-b3fc-2c963f66afa6 missing')).toBe(true);
    expect(shouldReport('plot 9b2e1c40-1111-4562-b3fc-2c963f66afa6 missing')).toBe(false);
    expect(shouldReport('Something else broke')).toBe(true);
  });

  it('skips network blips the app already handles, and stops after twenty a visit', () => {
    expect(shouldReport('Failed to fetch')).toBe(false);
    expect(shouldReport('Load failed')).toBe(false);
    expect(shouldReport('The server took too long to answer')).toBe(false);
    let n = 0;
    for (let i = 0; i < 50; i++) if (shouldReport(`bug kind ${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${'xyz'[i % 3]}`)) n++;
    expect(n).toBe(20);
  });
});
