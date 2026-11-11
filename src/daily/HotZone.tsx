// Hot Zones: one real city a day where rarities roll better (the better of two rolls), ultras are 5× likelier and
// shiny 2×. Shown on simple mode's home, as a chip on the map, and as a glowing circle over the city.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { GRID_SIZE } from '../shared/grid';

export function useHotZone() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['hot-zone'], queryFn: api.hotZone, enabled: !!me, staleTime: 10 * 60_000 });
}
/** the city's centre as [lng, lat] */
export function hotCenter(z: { gx: number; gy: number }): [number, number] {
  const lng = ((z.gx + 0.5) / GRID_SIZE) * 360 - 180;
  const n = Math.PI * (1 - (2 * (z.gy + 0.5)) / GRID_SIZE);
  return [lng, (180 / Math.PI) * Math.atan(Math.sinh(n))];
}
export function endsIn(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
}

/** simple mode's Hot Zone card: roll a plot inside today's city */
export function HotZoneCard({ onRoll, cost, free, canBuy }: { onRoll(): void; cost: number; free: boolean; canBuy: boolean }) {
  const q = useHotZone();
  const z = q.data?.today;
  if (!z) return null;
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onRoll} disabled={!canBuy} data-testid="hot-zone-roll"
      className="relative overflow-hidden rounded-[24px] border-[1.5px] border-[#FF8A3D]/50 bg-[linear-gradient(135deg,#4A1606,#1C0A1F)] p-4 text-left shadow-[0_0_40px_-14px_#FF6A1F] disabled:opacity-70">
      <motion.div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#FF6A1F]/40 blur-2xl" animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 2.4, repeat: Infinity }} />
      <div className="relative flex items-center gap-3">
        <motion.span className="text-[38px] leading-none" animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 1.6, repeat: Infinity }}>🔥</motion.span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#FFB27A]">Today’s Hot Zone · {endsIn(q.data!.ends_at)} left</span>
          <span className="truncate font-display text-[20px] font-black">{z.name}</span>
          <span className="text-[11px] font-semibold text-white/70">Better rarities · {q.data!.ultra_mult}× ultra odds · {q.data!.shiny_mult}× shiny</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-3 py-1.5 text-[12px] font-black', canBuy ? 'bg-[#FF8A3D] text-[#2a0f00]' : 'bg-white/10 text-white/60')}>{free ? 'Roll · free' : `Roll · ${fmt(cost)}`}</span>
      </div>
      <div className="relative mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-white/45">
        {q.data!.crown_free ? <span className="font-black text-[#FFD23F]" data-testid="crown-free">👑 {z.name}’s Crown is up for grabs!</span> : <span>👑 {z.name}’s Crown is taken</span>}
        {q.data!.tomorrow && <span>Tomorrow: {q.data!.tomorrow.name}</span>}
      </div>
    </motion.button>
  );
}
