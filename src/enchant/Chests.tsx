// 🧰 Chests a Seeking Trait buried: each one sits right by the plot of the enchantment that found it — on your map and in
// your Grimoire. Dig one up with a tap (three swings of the spade, no walking): +50 Ink. They keep for 7 days.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type SeekChest } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { toMap } from '../lib/toMap';
import { cn } from '../lib/utils';
import { cellCenter } from '../shared/grid';
import { Button } from '../ui';
import { centerOf, efx } from './core';
import { dur, kindInfo } from './kinds';
import { feel } from './living';

export function useSeekChests() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['seek-chests'], queryFn: api.seekChests, enabled: !!me, staleTime: 20_000, refetchInterval: 90_000 });
}

/** dig one up: the burst, the toast, and every list and map marker refreshed */
export function useDigChest() {
  const qc = useQueryClient();
  return async (c: { id: number; ink: number }, at?: { x: number; y: number }) => {
    try {
      const r = await api.seekChestDig(c.id);
      qc.setQueryData(['seek-chests'], r.chests);
      void qc.invalidateQueries({ queryKey: ['enchant'] });
      void qc.invalidateQueries({ queryKey: ['enchantments'] });
      void qc.invalidateQueries({ queryKey: ['enchant-map'] });
      invalidateGame(qc);
      feel('success');
      const p = at ?? { x: innerWidth / 2, y: innerHeight / 2 };
      efx.burst({ ...p, colors: ['#FFD23F', '#E9C46A', '#fff'], count: 90, speed: 11, kind: 'spark' });
      efx.burst({ ...p, colors: ['#FFD23F'], count: 16, speed: 9, kind: 'emoji', emojis: ['💰', '🪙', '💧'] });
      toast.success(`Dug up a chest: +${r.ink} Ink`);
      return r;
    } catch (e) {
      toast.error(toGameError(e).message);
      void qc.invalidateQueries({ queryKey: ['seek-chests'] });
      return null;
    }
  };
}

const left = (c: SeekChest) => Math.max(0, (Date.parse(c.expires_at) - Date.now()) / 1000);
const finderName = (c: SeekChest) => c.nickname || (c.serial ? `${kindInfo(c.kind).name} #${c.serial}` : kindInfo(c.kind).name);

/** one chest: dig (three swings), or show where it is */
function ChestRow({ c }: { c: SeekChest }) {
  const nav = useNavigate();
  const dig = useDigChest();
  const box = useRef<HTMLSpanElement>(null);
  const [swings, setSwings] = useState(0);
  const [busy, setBusy] = useState(false);
  const swing = async () => {
    if (busy) return;
    feel('light');
    efx.burst({ ...centerOf(box.current), colors: ['#6B4423', '#8B5E34', '#3D2614'], count: 18, speed: 7, kind: 'drop', gravity: 0.4 });
    if (swings < 2) { setSwings(swings + 1); return; }
    setBusy(true);
    await dig(c, centerOf(box.current));
    setBusy(false); setSwings(0);
  };
  const [lng, lat] = cellCenter(c.gx, c.gy);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-2.5 rounded-2xl border border-[#E9C46A]/30 bg-[#E9C46A]/10 p-2.5" data-testid="seek-chest">
      <motion.span ref={box} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#2B1A08] text-2xl" key={swings} animate={swings ? { rotate: [0, -14, 10, 0], y: [0, 3, 0] } : {}} transition={{ duration: 0.3 }}>🧰</motion.span>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-[13px] font-black">+{c.ink} Ink · by {finderName(c)}’s plot</span>
        <span className="text-[11px] text-white/55">{kindInfo(c.kind).emoji} Its Seeking Trait buried it · keeps {dur(left(c))}</span>
      </span>
      <Button size="sm" variant="ghost" onClick={() => toMap(nav, { lng, lat, zoom: 19.2 })} data-testid="seek-chest-show">📍</Button>
      <Button size="sm" variant="rainbow" disabled={busy} onClick={() => void swing()} data-testid="seek-chest-dig">⛏️ {swings ? `${swings}/3` : 'Dig'}</Button>
    </motion.div>
  );
}

/** a list of buried chests (all of yours, or one enchantment's) */
export function SeekChests({ chests, title, hint, className }: { chests: SeekChest[]; title?: string; hint?: string; className?: string }) {
  if (!chests.length) return null;
  return (
    <section className={cn('grid gap-2', className)} data-testid="seek-chests">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-black uppercase tracking-wider text-[#FFE8A3]">🧰 {title ?? `Buried chests · ${chests.length}`}</h3>
        <span className="text-[11px] font-bold text-white/50">3 swings each · no walking</span>
      </div>
      {hint && <p className="-mt-1 text-[11.5px] text-white/60">{hint}</p>}
      <AnimatePresence initial={false}>{chests.slice(0, 25).map((c) => <ChestRow key={c.id} c={c} />)}</AnimatePresence>
    </section>
  );
}
