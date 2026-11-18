// Whether the party-play panel (emotes, games, photos on the map) is open, and whether it's here to open (it lives on the
// map). Its own tiny module so the party sheet can open it without pulling in the map code that GroupPlay.tsx carries.
import { create } from 'zustand';

export const useGroupPlayUi = create<{ open: boolean; here: boolean; set(o: boolean): void }>((set) => ({ open: false, here: false, set: (open) => set({ open }) }));
