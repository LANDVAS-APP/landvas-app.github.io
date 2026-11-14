// "Pick it on the map": an enchantment that needs one of your plots (the Wormhole's far end, a plot to Splice into) hands
// over to the map — the plots you can pick wear crosshairs, you tap one, and you're back on the enchantment's page with it
// chosen. (The radar on the enchantment's page still works too.) Kept tiny: the map imports it.
import { create } from 'zustand';

export type PickPlot = { gx: number; gy: number; rarity: string; name?: string | null; plot_type?: string; note?: string };
export type PickSpec = {
  /** the enchantment, and which of its choices this is ('far', 'third', 'plot') */
  id: string; slot: string;
  title: string; emoji: string; hint: string; color: string;
  /** the plots you may pick */
  allowed: PickPlot[];
  /** where to go back to (the enchantment's page) */
  back: string;
  /** anything the page needs back to carry on where it was (the other choices already made) */
  keep?: Record<string, unknown>;
  /** what to say when a plot that can't be picked is tapped */
  refuse?: string;
};
export type PickDone = { id: string; slot: string; plot: PickPlot; keep?: Record<string, unknown> };

export const usePlotPick = create<{
  spec: PickSpec | null; tapped: { gx: number; gy: number } | null; done: PickDone | null;
  start(spec: PickSpec): void; tap(c: { gx: number; gy: number } | null): void; finish(plot: PickPlot): void; cancel(): void; clear(): void;
}>((set, get) => ({
  spec: null, tapped: null, done: null,
  start: (spec) => set({ spec, tapped: null, done: null }),
  tap: (tapped) => set({ tapped }),
  finish: (plot) => { const s = get().spec; if (s) set({ spec: null, tapped: null, done: { id: s.id, slot: s.slot, plot, keep: s.keep } }); },
  cancel: () => set({ spec: null, tapped: null }),
  clear: () => set({ done: null }),
}));

/** the plot just picked on the map for one of this enchantment's choices, if any */
export function pickedFor(id: string, slot: string): PickDone | null {
  const d = usePlotPick.getState().done;
  return d && d.id === id && d.slot === slot ? d : null;
}
