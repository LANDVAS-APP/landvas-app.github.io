// Going where someone is, and sitting down at the game you tapped. Kept tiny: the arcade, the arena and homes import it.
import { create } from 'zustand';

/** the game to sit down at as soon as it shows up in the room you're walking into (a "Looking for players" Join) */
export const useAutoJoin = create<{ id: string | null; at: number; set(id: string): void; take(id: string): boolean }>((set, get) => ({
  id: null, at: 0,
  set: (id) => set({ id, at: Date.now() }),
  // true once, for the game it was set for (within a minute)
  take: (id) => { const s = get(); if (s.id !== id || Date.now() - s.at > 60_000) return false; set({ id: null }); return true; },
}));
