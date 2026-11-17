// The ✈️ pin flight's state, on its own so the map can read it without loading the flight UI: pin mode is on while
// the player is choosing; a tap on the map (WorldMap's click handler) drops — or moves — the pin, which lives on the
// map at its spot (it pans and zooms with the map).
import { create } from 'zustand';

export type FlyPin = { lng: number; lat: number };
export const useFlyUi = create<{
  pinMode: boolean; pin: FlyPin | null; refill: boolean;
  setPinMode(v: boolean): void; setPin(p: FlyPin | null): void; setRefill(v: boolean): void;
}>((set) => ({
  pinMode: false, pin: null, refill: false,
  setPinMode: (pinMode) => set(pinMode ? { pinMode } : { pinMode, pin: null }),
  setPin: (pin) => set({ pin }),
  setRefill: (refill) => set({ refill }),
}));
if (typeof window !== 'undefined') (window as unknown as { __landvasFly: unknown }).__landvasFly = useFlyUi;
