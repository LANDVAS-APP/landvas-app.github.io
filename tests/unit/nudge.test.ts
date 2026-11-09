import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// a backend whose live channels we can poke by hand
const channels = new Map<string, (m: unknown) => void>();
let withChannels = true;
vi.mock('../../src/backend/backend', () => ({
  getBackend: () => ({
    liveChannel: withChannels ? (name: string, cb: (m: unknown) => void) => { channels.set(name, cb); return { send() {}, close() { channels.delete(name); } }; } : undefined,
  }),
}));
const { nudged } = await import('../../src/lib/nudge');

beforeEach(() => { vi.useFakeTimers(); channels.clear(); withChannels = true; });
afterEach(() => vi.useRealTimers());

describe('nudges', () => {
  it('a nudge on the topic makes one check, and a flood is held to one per gap', async () => {
    const check = vi.fn();
    const n = nudged('pc:moon:0', check, { safetyMs: 60_000, gapMs: 1000 });
    const poke = channels.get('pc:moon:0')!;
    poke({ t: 'chat' });
    await vi.advanceTimersByTimeAsync(300);
    expect(check).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 50; i++) poke({ t: 'chat' }); // fake nudges, all at once
    await vi.advanceTimersByTimeAsync(2000);
    expect(check).toHaveBeenCalledTimes(2);
    n.stop();
    expect(channels.has('pc:moon:0')).toBe(false);
  });

  it('with nothing heard, the safety check still runs', async () => {
    const check = vi.fn();
    const n = nudged('feed', check, { safetyMs: 60_000 });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(check).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(check).toHaveBeenCalledTimes(1);
    n.stop();
  });

  it('looks once more after a nudge on a topic the server only nudges every few seconds', async () => {
    const check = vi.fn();
    const n = nudged('feed', check, { safetyMs: 120_000, gapMs: 2000, trailMs: 6000 });
    channels.get('feed')!({ t: 'feed' });
    await vi.advanceTimersByTimeAsync(7000);
    expect(check).toHaveBeenCalledTimes(2);
    n.stop();
  });

  it('without live channels it just checks on the old timer', async () => {
    withChannels = false;
    const check = vi.fn();
    const n = nudged('pc:moon:0', check, { safetyMs: 60_000, fallbackMs: 8000 });
    await vi.advanceTimersByTimeAsync(16_500);
    expect(check).toHaveBeenCalledTimes(2);
    n.stop();
  });
});
