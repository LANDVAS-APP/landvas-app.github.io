import { describe, it, expect } from 'vitest';
import { reconcile } from '../../src/social/feedList';

const ev = (...ids: number[]) => ids.map((id) => ({ id }));
describe('feed reconcile', () => {
  it('drops rows the server no longer returns (hidden by privacy), past ones too', () => {
    expect(reconcile(ev(10, 9, 8, 7), ev(11, 10, 8), 40)).toEqual(ev(11, 10, 8));
  });
  it('keeps older rows loaded with "Show older", below the window', () => {
    expect(reconcile(ev(5, 4, 3, 2, 1), ev(6, 5, 3), 3)).toEqual(ev(6, 5, 3, 2, 1));
  });
});
