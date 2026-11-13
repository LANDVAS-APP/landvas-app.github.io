// The app's World button: hold it for the map's actions (they fan out around it); tap it on the map to centre on
// your explorer. The tab bar sets these; the map listens.
import { create } from 'zustand';

export const useWorldButton = create<{ open: boolean; recenter: number; setOpen(o: boolean): void; center(): void }>((set) => ({
  open: false,
  recenter: 0,
  setOpen: (open) => set({ open }),
  center: () => set((s) => ({ recenter: s.recenter + 1 })),
}));
