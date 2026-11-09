import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/backend/backend', () => ({ getBackend: () => ({}) }));
const { burstIsLocal } = await import('../../src/lib/queries');

describe('what a refresh re-reads after actions', () => {
  it('actions inside a place only refresh your state', () => {
    expect(burstIsLocal(['farm_plant', 'farm_plant', 'farm_get'])).toBe(true);
    expect(burstIsLocal(['biz_sync', 'my_state'])).toBe(true);
    expect(burstIsLocal(['planet_dig', 'planet_meteor_grab', 'planet_live'])).toBe(true);
    expect(burstIsLocal(['realm_buy', 'realm_get'])).toBe(true);
  });
  it('anything that can change plots, art or records refreshes everything', () => {
    expect(burstIsLocal(['acquire_plot'])).toBe(false);
    expect(burstIsLocal(['farm_plant', 'set_group_kind'])).toBe(false);
    expect(burstIsLocal(['publish_artwork'])).toBe(false);
    expect(burstIsLocal(['something_new'])).toBe(false); // unknown: full refresh
  });
  it('with no change at all (only reads, or a call the app made elsewhere) it refreshes everything', () => {
    expect(burstIsLocal([])).toBe(false);
    expect(burstIsLocal(['my_state', 'my_groups'])).toBe(false);
  });
});
