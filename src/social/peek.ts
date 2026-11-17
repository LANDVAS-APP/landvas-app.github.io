// Tap a player's name (or face) in a chat and a peek at them pops out of it: one at a time, anywhere in the game. The
// card itself loads only when first opened (PeekHost).
import { create } from 'zustand';
import type { Profile } from '../backend/types';

export type PeekOpts = {
  /** the chat line it was opened from: it can be answered or reported from the peek */
  message?: { id: number; body: string };
  onReply?(): void;
  /** they were blocked from the peek: the chat hides them */
  onBlocked?(id: string): void;
};
type Rect = { x: number; y: number; w: number; h: number };
type PeekState = { player: Profile | null; at: Rect | null; opts: PeekOpts; open(p: Profile, from: Element | null, opts?: PeekOpts): void; close(): void };

export const usePeek = create<PeekState>((set) => ({
  player: null, at: null, opts: {},
  open: (player, from, opts = {}) => {
    const r = from?.getBoundingClientRect();
    set({ player, opts, at: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null });
  },
  close: () => set({ player: null, at: null, opts: {} }),
}));

/** open a peek at this player, popping out of the element tapped */
export const openPeek = (p: Profile, from: Element | null, opts?: PeekOpts) => usePeek.getState().open(p, from, opts);
