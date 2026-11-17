import { describe, expect, it } from 'vitest';
import { hoursFromHere, kmBetween, localTime, sunTimes, utcOffset, zoneAt } from '../../src/eyes/whereabouts';
import { allZones } from '../../src/eyes/zones';

describe('where you are: the clock there', () => {
  it('knows every time zone with its country', () => {
    const zs = allZones();
    expect(zs.length).toBeGreaterThan(400);
    expect(zs.find((z) => z.zone === 'Europe/Paris')?.cc).toBe('FR');
    expect(zs.every((z) => /^[A-Z]{2}$/.test(z.cc) && Number.isFinite(z.lat) && Number.isFinite(z.lng))).toBe(true);
  });
  it("picks the country's own zone nearest you", () => {
    expect(zoneAt(4.84, 45.76, 'FR')).toBe('Europe/Paris'); // Lyon (Monaco and Zurich are nearer, but it's France)
    expect(zoneAt(-87.63, 41.88, 'US')).toBe('America/Chicago');
    expect(zoneAt(-118.24, 34.05, 'US')).toBe('America/Los_Angeles');
    expect(zoneAt(151.2, -33.87, 'AU')).toBe('Australia/Sydney');
    expect(zoneAt(139.69, 35.69, 'JP')).toBe('Asia/Tokyo');
    // Salt Lake City: Mountain time either way
    expect(utcOffset(zoneAt(-111.89, 40.76, 'US'), Date.UTC(2026, 0, 15))).toBe(utcOffset('America/Denver', Date.UTC(2026, 0, 15)));
  });
  it('out at sea, the sun’s own hour', () => {
    expect(zoneAt(-140, 10, null)).toBe('Etc/GMT+9');
    expect(zoneAt(-20, -20, null)).toBe('Etc/GMT+1');
    expect(zoneAt(-30, 0, null)).toBe('America/Noronha'); // (an island's clock, near enough)
  });
  it('tells the time there, and how far ahead of you it is', () => {
    const t = Date.UTC(2026, 6, 1, 12, 0);
    expect(localTime('Asia/Tokyo', t)).toBe('9:00 PM');
    expect(localTime('Europe/London', t)).toBe('1:00 PM');
    expect(hoursFromHere('UTC', t) + hoursFromHere(Intl.DateTimeFormat().resolvedOptions().timeZone, t)).toBe(hoursFromHere('UTC', t));
    expect(hoursFromHere('Asia/Kolkata', t) - hoursFromHere('UTC', t)).toBe(5.5);
  });
  it('knows when the sun rises and sets', () => {
    // London, midsummer: up about 03:43 UTC, down about 20:21 UTC
    const s = sunTimes(-0.13, 51.5, Date.UTC(2026, 5, 21, 12));
    expect(Math.abs(s.rise! - Date.UTC(2026, 5, 21, 3, 43))).toBeLessThan(12 * 60_000);
    expect(Math.abs(s.set! - Date.UTC(2026, 5, 21, 20, 21))).toBeLessThan(12 * 60_000);
    // the North Pole in June: it never sets
    const p = sunTimes(0, 89, Date.UTC(2026, 5, 21, 12));
    expect(p.rise).toBeNull(); expect(p.set).toBeNull();
  });
  it('measures the way between two places', () => {
    expect(Math.round(kmBetween(2.35, 48.86, -0.13, 51.51))).toBeGreaterThan(330);
    expect(Math.round(kmBetween(2.35, 48.86, -0.13, 51.51))).toBeLessThan(350);
  });
});
