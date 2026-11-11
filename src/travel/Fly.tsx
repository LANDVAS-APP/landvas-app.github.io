// Fly anywhere: tap ✈️, drop a pin anywhere on the map (or pick "Fly to the Hot Zone"), and your explorer flies
// there. Uses one of today's trips (2 a day, flights and train rides together); out of trips → refill 2 more for
// 100 Ink (or, once ads are on, by watching one).
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useExplorer } from '../explorer/explorer';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { mapHandle } from '../map/mapHandle';
import { buzz } from '../native/native';
import { Dialog } from '../ui';
import { TRAVEL_KEY, useTravel } from './Travel';

export const useFlyUi = create<{ pinMode: boolean; refill: boolean; setPinMode(v: boolean): void; setRefill(v: boolean): void }>((set) => ({
  pinMode: false, refill: false,
  setPinMode: (pinMode) => set({ pinMode }), setRefill: (refill) => set({ refill }),
}));

const km = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** take off: returns true if the flight left */
export function useFly() {
  const qc = useQueryClient();
  return async (lng: number, lat: number, name?: string) => {
    try {
      const st = await api.travelFlyTo(lng, lat, name);
      qc.setQueryData(TRAVEL_KEY, st);
      if (st.explorer) {
        useExplorer.getState().set(st.explorer);
        useUi.getState().requestFly({ lng: st.explorer.lng, lat: st.explorer.lat, zoom: 4 });
        useExplorer.getState().setFollowing(true);
      }
      if (useUi.getState().settings.haptics) buzz('success');
      toast.success(`✈️ Flying to ${name ?? 'your pin'}`, { description: 'You’ll land in a moment — then claim plots right there.' });
      return true;
    } catch (e) {
      const err = toGameError(e);
      if (err.code === 'no_trips_left') useFlyUi.getState().setRefill(true);
      else toast.error(err.message);
      return false;
    }
  };
}

/** the ✈️ button on the map: drop a pin anywhere */
export function FlyChip({ className }: { className?: string }) {
  const on = useFlyUi((s) => s.pinMode);
  const set = useFlyUi((s) => s.setPinMode);
  return (
    <button onClick={() => { set(!on); buzz('light'); }} data-testid="fly-chip"
      className={cn('pointer-events-auto lv-hud !h-9 gap-1 !rounded-full !px-3 text-[12px] font-extrabold', on && '!bg-[#2F7BFF]', className)}>
      ✈️ {on ? 'Cancel' : 'Fly'}
    </button>
  );
}

/** pin mode: the next tap on the map drops a pin; then "Fly here?" */
export function PinFlight() {
  const on = useFlyUi((s) => s.pinMode);
  const set = useFlyUi((s) => s.setPinMode);
  const [pin, setPin] = useState<{ lng: number; lat: number; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const travel = useTravel();
  const fly = useFly();
  const ex = useExplorer((s) => s.state);
  const left = travel.data?.plane?.left ?? null;
  const tap = (e: React.PointerEvent) => {
    const m = mapHandle.current; if (!m) return;
    const r = m.getCanvas().getBoundingClientRect();
    const ll = m.unproject([e.clientX - r.left, e.clientY - r.top]);
    setPin({ lng: ll.lng, lat: ll.lat, x: e.clientX, y: e.clientY });
    buzz('light');
  };
  const close = () => { setPin(null); set(false); };
  const go = async () => { if (!pin) return; setBusy(true); const ok = await fly(pin.lng, pin.lat); setBusy(false); if (ok) close(); };
  if (!on) return <RefillDialog />;
  return (
    <>
      <RefillDialog />
      {/* a sheet over the map that catches the tap (pan and zoom still work with two fingers / the wheel) */}
      {!pin && <div className="absolute inset-0 z-[25] cursor-crosshair" onPointerUp={tap} data-testid="pin-catcher" />}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+150px)] z-[26] flex justify-center px-4">
        {!pin && <div className="rounded-2xl bg-[#2F7BFF] px-4 py-2 text-[13px] font-extrabold text-white shadow-xl">📍 Tap anywhere on the map to drop a pin</div>}
      </div>
      {pin && <div className="pointer-events-none absolute z-[26] -translate-x-1/2 -translate-y-full text-[34px] drop-shadow-lg" style={{ left: pin.x, top: pin.y }}>📍</div>}
      <AnimatePresence>
        {pin && (
          <motion.div className="absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-[27] flex justify-center px-4" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
            <div className="w-full max-w-sm rounded-[24px] bg-[#0B0E24]/95 p-4 text-white shadow-2xl" data-testid="pin-sheet">
              <div className="font-display text-[17px] font-black">✈️ Fly to this pin?</div>
              <div className="mt-1 text-[12px] text-white/65">
                {ex ? `${fmt(Math.round(km(ex, pin)))} km away · ` : ''}uses 1 of your trips today{left != null ? ` (${left} left)` : ''}. Land, then claim plots right there.
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="h-11 rounded-2xl bg-white/10 font-bold" onClick={() => setPin(null)}>Move pin</button>
                <button className="h-11 rounded-2xl bg-[linear-gradient(135deg,#2F7BFF,#22E3FF)] font-black text-white disabled:opacity-60" disabled={busy} onClick={() => void go()} data-testid="pin-fly">✈️ Fly here</button>
              </div>
              <button className="mt-2 w-full text-[12px] font-bold text-white/50" onClick={close}>Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** out of trips: 2 more for 100 Ink (or an ad, once they're on) */
export function RefillDialog() {
  const open = useFlyUi((s) => s.refill);
  const set = useFlyUi((s) => s.setRefill);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refill = async () => {
    setBusy(true);
    try {
      const r = await api.travelRefill();
      buzz('success');
      toast.success('✈️ 2 more trips today', { description: `−${r.cost} Ink · you have ${r.left} trips left` });
      void qc.invalidateQueries({ queryKey: TRAVEL_KEY }); invalidateGame(qc);
      set(false);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={set} title="✈️ Out of trips for today" description="Everyone gets 2 trips a day — flights, pin flights and train rides together.">
      <div className="grid gap-2" data-testid="refill-dialog">
        <button className="h-12 rounded-2xl bg-[linear-gradient(135deg,#2F7BFF,#22E3FF)] font-black text-white disabled:opacity-60" disabled={busy} onClick={() => void refill()} data-testid="refill-ink">Refill 2 trips · 100 Ink</button>
        <button className="h-11 rounded-2xl bg-white/10 text-[13px] font-bold text-white/50" disabled title="Rewarded ads arrive with the app">📺 Watch an ad · coming with the app</button>
        <p className="text-[11px] text-muted">Trips reset at the daily reset.</p>
      </div>
    </Dialog>
  );
}
