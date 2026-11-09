// When the server struggles, background refreshes pause (with growing pauses) and nothing a player does is held back.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND, guard, isStrain } from '../../src/backend/supabase/guard';

describe('load guard', () => {
  beforeEach(() => { guard.reset(); vi.useRealTimers(); });

  it('pauses background calls after a few strained answers, never player actions', () => {
    expect(guard.skip('my_alerts')).toBe(false);
    guard.record(200, true); guard.record(200, true);
    expect(guard.busy()).toBe(false);
    guard.record(200, true);
    expect(guard.busy()).toBe(true);
    expect(guard.skip('my_alerts')).toBe(true);
    expect(guard.skip('planet_live')).toBe(true);
    expect(guard.skip('farm_plant')).toBe(false);
    expect(guard.skip('acquire_plot')).toBe(false);
  });

  it('counts very slow answers as strain, and the pause grows while it lasts', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) guard.record(6000, false);
    expect(guard.busy()).toBe(true);
    vi.advanceTimersByTime(15_100);
    expect(guard.busy()).toBe(false);
    for (let i = 0; i < 3; i++) guard.record(6000, false);
    vi.advanceTimersByTime(15_100);
    expect(guard.busy()).toBe(true); // second pause is 30 s
    vi.advanceTimersByTime(15_000);
    expect(guard.busy()).toBe(false);
  });

  it('knows server trouble from a bad request', () => {
    expect(isStrain({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(true);
    expect(isStrain({ message: 'x', status: 503 })).toBe(true);
    expect(isStrain({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(isStrain({ code: 'P0001', message: 'not_enough', status: 400 })).toBe(false);
    expect(BACKGROUND.test('my_state')).toBe(false); // balances still load
  });
});
