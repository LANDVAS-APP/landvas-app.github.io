import { describe, expect, it } from 'vitest';
import { celebrations, searchCelebrations, snapshotName, type RoyalCrown } from '../../src/royalty/celebration';

const NOW = new Date('2026-11-11T23:00:00Z').getTime();
const crown = (o: Partial<RoyalCrown>): RoyalCrown => ({
  tier: 'crown', city: 'Ironville', state: 'Kentucky', country: 'US', country_name: 'United States of America', kingdom: 'Ironville',
  claimed_at: '2026-11-11T18:00:00Z', reign_days: 0, shiny: false, boost: 1.5, full_boost: 1.5, holder: { id: 'g', username: 'gravitysnap' }, ...o,
});
const totals = { city: 3, cities: 2932, state: 1, states: 1285, country: 0, countries: 162 };

describe('crown celebrations', () => {
  const list = [
    crown({}),
    crown({ kingdom: 'Ashland', city: 'Ashland', claimed_at: '2026-11-12T01:00:00Z', holder: { id: 'r', username: 'rosa', display_name: 'Rosa Royal' } }),
    crown({ kingdom: 'Paris', city: 'Paris', state: null, country: 'FR', country_name: 'France', claimed_at: '2026-11-12T02:00:00Z', holder: null }),
    crown({ tier: 'crown_state', city: null, kingdom: 'Ohio', state: 'Ohio', claimed_at: '2026-11-01T00:00:00Z', holder: { id: 'm', username: 'max' }, shiny: true }),
  ];
  const all = celebrations(list, totals, NOW);

  it('skips holders who hide from Royalty and lists newest first', () => {
    expect(all.map((c) => c.holder.username)).toEqual(['rosa', 'gravitysnap', 'max']);
  });
  it('the first City Crown is "first ever"; later ones are numbered', () => {
    const g = all.find((c) => c.holder.username === 'gravitysnap')!;
    expect(g.headline).toBe('FIRST EVER CITY CROWN');
    expect(all.find((c) => c.holder.username === 'rosa')!.headline).toBe('CITY CROWN #2');
    expect(all.find((c) => c.holder.username === 'max')!.headline).toBe('FIRST EVER SHINY STATE CROWN');
  });
  it('builds the card words', () => {
    const g = all.find((c) => c.holder.username === 'gravitysnap')!;
    expect(g.handle).toBe('@gravitysnap');
    expect(g.title).toBe('Sovereign of Ironville');
    expect(g.where).toBe('KENTUCKY · UNITED STATES OF AMERICA');
    expect(g.boost).toBe('×1.50 KINGDOM RENT');
    expect(g.claimed).toBe('CROWNED NOV 11, 2026');
    expect(g.left).toBe(2929);
    expect(g.fresh).toBe(true);
    expect(all.find((c) => c.holder.username === 'max')!.fresh).toBe(false);
  });
  it('searches by handle, display name and kingdom', () => {
    expect(searchCelebrations(all, '@grav').map((c) => c.holder.username)).toEqual(['gravitysnap']);
    expect(searchCelebrations(all, 'royal').map((c) => c.holder.username)).toEqual(['rosa']);
    expect(searchCelebrations(all, 'ohio').map((c) => c.holder.username)).toEqual(['max']);
    expect(searchCelebrations(all, 'kentucky').length).toBe(2);
    expect(searchCelebrations(all, 'paris')).toEqual([]);
    expect(searchCelebrations(all, '  ')).toEqual([]);
  });
  it('makes a tidy file name', () => {
    expect(snapshotName(all[1], 'square')).toBe('landvas-crown-gravitysnap-ironville-square.png');
  });
});
