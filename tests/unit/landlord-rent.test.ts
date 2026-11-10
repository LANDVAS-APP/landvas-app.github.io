// Landlord rent day on the client: the live USD counter adds Landlord plots' extra on the 1st of the month (UTC),
// the same way the server does.
import { describe, it, expect } from 'vitest';
import { landlordExtra, liveRent, rentDaySeconds, type RentState } from '../../src/shared/rent';

const T = (s: string) => new Date(s).getTime();
describe('landlord rent day', () => {
  it('counts the seconds that fall on the 1st', () => {
    expect(rentDaySeconds(T('2026-12-01T00:00:00Z'), T('2026-12-01T01:00:00Z'))).toBe(3600);
    expect(rentDaySeconds(T('2026-11-30T23:00:00Z'), T('2026-12-01T01:00:00Z'))).toBe(3600);
    expect(rentDaySeconds(T('2026-11-29T00:00:00Z'), T('2026-12-03T00:00:00Z'))).toBe(86400);
    expect(rentDaySeconds(T('2026-12-02T00:00:00Z'), T('2026-12-31T23:00:00Z'))).toBe(0);
    expect(rentDaySeconds(T('2026-11-15T00:00:00Z'), T('2027-01-15T00:00:00Z'))).toBe(2 * 86400);
  });
  it('adds 49x the Landlord rate on top while it is rent day', () => {
    const s = { balance_usd: 0, settled_at: '2026-12-01T00:00:00Z', rate_usd_per_second: 1, max_offline_days: 30, boost: { until: null, multiplier: 20 },
      landlord: { rate: 0.5, multiplier: 50, plots: 1, active: true, day_start: '', day_end: '', next: '' } } as unknown as RentState;
    expect(landlordExtra(s, T('2026-12-01T00:00:00Z'), T('2026-12-01T00:00:10Z'))).toBe(0.5 * 49 * 10);
    expect(liveRent(s, T('2026-12-01T00:00:10Z'))).toBe(10 + 0.5 * 49 * 10);
    expect(liveRent({ ...s, settled_at: '2026-12-02T00:00:00Z' }, T('2026-12-02T00:00:10Z'))).toBe(10);
  });
});
