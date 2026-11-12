import { describe, expect, it, vi } from 'vitest';

// reminders.ts only needs the pure scheduling helpers here; keep the app's backend and native shell out of it
vi.mock('../../src/backend/api', () => ({ api: {} }));
vi.mock('../../src/native/native', () => ({ isNative: () => false }));
const { reminderTime, streakReminder } = await import('../../src/native/reminders');

const H = 3_600_000;
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('streak reminders', () => {
  it('rings at 6 pm local when that falls inside the window', () => {
    const now = at(2026, 11, 12, 9);
    expect(reminderTime(now, at(2026, 11, 13, 0), now)).toBe(at(2026, 11, 12, 18));
  });

  it('falls back to a few hours before the window closes when 6 pm is outside it', () => {
    const now = at(2026, 11, 12, 9);
    const reset = at(2026, 11, 12, 17); // e.g. a UTC-midnight reset seen from Denver
    expect(reminderTime(now, reset, now)).toBe(reset - 3 * H);
  });

  it('gives up when the window is nearly over', () => {
    const now = at(2026, 11, 12, 16, 45);
    expect(reminderTime(now, at(2026, 11, 12, 17), now)).toBeNull();
  });

  it('after claiming, reminds about tomorrow (never today)', () => {
    const now = at(2026, 11, 12, 10);
    const reset = at(2026, 11, 13, 0);
    const r = streakReminder({ enabled: true, streak: 4, claimed_today: true, resets_at: new Date(reset).toISOString() }, now)!;
    expect(r.at).toBe(at(2026, 11, 13, 18));
    expect(r.title).toContain('Day 5');
    expect(r.body).toContain('4-day streak');
  });

  it('before claiming, reminds before today’s reset', () => {
    const now = at(2026, 11, 12, 10);
    const r = streakReminder({ enabled: true, streak: 0, claimed_today: false, resets_at: new Date(at(2026, 11, 13, 0)).toISOString() }, now)!;
    expect(r.at).toBe(at(2026, 11, 12, 18));
    expect(r.title).toMatch(/daily reward/);
  });

  it('stays quiet when the streak calendar is switched off', () => {
    expect(streakReminder({ enabled: false, streak: 3, claimed_today: false, resets_at: new Date().toISOString() })).toBeNull();
  });
});
