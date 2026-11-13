// The app's World button: hold it for the map's actions (they fan out around it); tap it on the map to centre on
// your explorer. The tab bar sets these; the map listens.
import { create } from 'zustand';

export const useWorldButton = create<{ open: boolean; recenter: number; setOpen(o: boolean): void; center(): void }>((set) => ({
  open: false,
  recenter: 0,
  setOpen: (open) => set({ open }),
  center: () => set((s) => ({ recenter: s.recenter + 1 })),
}));

/** The app's HUD cards (the Hot Zone, Luck, the Grimoire, the bell, your profile menu): one open at a time. */
export type HudCard = 'hot' | 'luck' | 'grim' | 'bell' | 'me' | 'view' | 'boost' | 'lev';
export const useHudCard = create<{ card: HudCard | null; toggle(c: HudCard): void; close(): void }>((set) => ({
  card: null,
  toggle: (c) => set((s) => ({ card: s.card === c ? null : c })),
  close: () => set({ card: null }),
}));
