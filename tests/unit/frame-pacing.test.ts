import { afterEach, describe, expect, it, vi } from 'vitest';

/** Feed a pacer one simulated second of screen refreshes at `hz` and count the frames it lets through. */
function drawn(pace: { ready(now: number): boolean }, hz: number, from = 0, seconds = 1) {
  let n = 0;
  const step = 1000 / hz;
  for (let t = from; t < from + seconds * 1000 - 1e-6; t += step) if (pace.ready(t)) n++;
  return n;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('3D frame pacing', () => {
  it('caps scenes at 60 fps, whatever the screen refresh rate', async () => {
    const { framePacer } = await import('../../src/lib/gfx');
    expect(drawn(framePacer(), 60)).toBeGreaterThanOrEqual(59);
    expect(drawn(framePacer(), 120)).toBeLessThanOrEqual(61);
    expect(drawn(framePacer(), 120)).toBeGreaterThanOrEqual(59);
    const at90 = drawn(framePacer(), 90);
    expect(at90).toBeGreaterThanOrEqual(58);
    expect(at90).toBeLessThanOrEqual(61);
  });

  it('a slow device just draws every frame it gets (no catch-up bursts)', async () => {
    const { framePacer } = await import('../../src/lib/gfx');
    expect(drawn(framePacer(), 24)).toBe(24);
  });

  it('on a phone, a place you are just looking at rests at 30 fps until the screen is touched', async () => {
    const listeners: Record<string, ((e?: unknown) => void)[]> = {};
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
    vi.stubGlobal('window', { addEventListener: (t: string, f: () => void) => { (listeners[t] ??= []).push(f); }, innerWidth: 390, innerHeight: 844 });
    vi.stubGlobal('document', { addEventListener: () => {}, hidden: false });
    let clock = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const { framePacer, userActive } = await import('../../src/lib/gfx');
    const room = framePacer({ ambient: true }), game = framePacer();
    expect(userActive()).toBe(false);
    expect(drawn(room, 60, clock)).toBeLessThanOrEqual(31);
    expect(drawn(room, 120, clock + 1000)).toBeLessThanOrEqual(31);
    expect(room.target()).toBeCloseTo(1 / 30);
    // a minigame never rests
    expect(drawn(game, 60, clock)).toBeGreaterThanOrEqual(59);
    // a finger on the screen: full speed straight away, and for a moment after it lifts
    for (const f of listeners.pointerdown ?? []) f();
    expect(userActive()).toBe(true);
    expect(room.target()).toBeCloseTo(1 / 60);
    expect(drawn(room, 60, clock + 2000)).toBeGreaterThanOrEqual(59);
    for (const f of listeners.pointerup ?? []) f();
    clock += 1000;
    expect(userActive()).toBe(true);
    clock += 3000;
    expect(userActive()).toBe(false);
    // and a scene can decide for itself (e.g. not while a fight is on)
    let fighting = true;
    const dungeon = framePacer({ ambient: () => !fighting });
    expect(dungeon.target()).toBeCloseTo(1 / 60);
    fighting = false;
    expect(dungeon.target()).toBeCloseTo(1 / 30);
  });

  it('the resolution tuner judges frame times against the pace the scene is aiming at', async () => {
    const { adaptiveDpr } = await import('../../src/lib/gfx');
    let target = 1 / 30;
    const pace = { ready: () => true, target: () => target };
    const set = vi.fn();
    const tune = adaptiveDpr(set, 1.5, pace);
    // resting at 30 fps: 33 ms frames are right on time — nothing changes
    for (let i = 0; i < 200; i++) tune(1 / 30);
    expect(set).not.toHaveBeenCalled();
    // aiming for 60 fps but getting 30: that's struggling — fewer pixels
    target = 1 / 60;
    for (let i = 0; i < 200; i++) tune(1 / 30);
    expect(set).toHaveBeenCalled();
    expect(set.mock.calls.at(-1)![0]).toBeLessThan(1.5);
  });
});

describe('sound engines nap when quiet', () => {
  const fakeCtx = () => {
    const c = { state: 'running' as AudioContextState, suspend: vi.fn(async () => { c.state = 'suspended'; }), resume: vi.fn(async () => { c.state = 'running'; }) };
    return c;
  };

  it('suspends a few seconds after the last sound, and stays awake while music holds it', async () => {
    vi.useFakeTimers();
    const { audioNap } = await import('../../src/lib/audioNap');
    const c = fakeCtx();
    const nap = audioNap(() => c as unknown as AudioContext, 4000);
    nap.poke(1);
    vi.advanceTimersByTime(4900);
    expect(c.suspend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(c.suspend).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(c.state).toBe('suspended');
    // a track playing: no nap until it stops
    c.state = 'running';
    nap.poke(0);
    nap.hold();
    vi.advanceTimersByTime(60_000);
    expect(c.suspend).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('a sound that arrives while it dozes off wakes it again', async () => {
    vi.useFakeTimers();
    const { audioNap } = await import('../../src/lib/audioNap');
    const c = fakeCtx();
    let finish!: () => void;
    c.suspend = vi.fn(() => new Promise<void>((r) => { finish = () => { c.state = 'suspended'; r(); }; }));
    const nap = audioNap(() => c as unknown as AudioContext, 1000);
    nap.poke(0);
    vi.advanceTimersByTime(1000);
    expect(c.suspend).toHaveBeenCalledTimes(1);
    nap.poke(0); // a new beep, mid-suspend
    finish();
    await Promise.resolve(); await Promise.resolve();
    expect(c.resume).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
