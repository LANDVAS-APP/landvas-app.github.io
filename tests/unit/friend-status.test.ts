import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/backend/backend', () => ({ getBackend: () => ({}), toGameError: (e: unknown) => e }));
const { friendStatusFrom } = await import('../../src/social/FriendButton');
const p = (id: string) => ({ player: { id } as never, since: '', plots: 0, at: '' });
const list = { friends: [p('f')], incoming: [p('i')], outgoing: [p('o')] } as never;

describe('friend button status, from the one friend list', () => {
  it('reads each kind', () => {
    expect(friendStatusFrom(list, 'f')).toBe('friends');
    expect(friendStatusFrom(list, 'i')).toBe('incoming');
    expect(friendStatusFrom(list, 'o')).toBe('outgoing');
    expect(friendStatusFrom(list, 'x')).toBe('none');
  });
});
