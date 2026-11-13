// Peel a Parasite off your plot by hand: grab the tentacle and drag it away — it fights back and snaps half-way home, so it
// takes three good pulls (a hard shake of the phone counts as one). The map shows it thrashing while you pull.
import { useQueryClient } from '@tanstack/react-query';
import { motion, useAnimation } from 'motion/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, type EnchantVisitor } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame } from '../lib/queries';
import { centerOf, efx } from './core';
import { askMotion, feel, useShake } from './living';
import { useWrapFx } from './ParasiteWraps';

export function PeelOff({ v, onDone }: { v: Pick<EnchantVisitor, 'id' | 'stage' | 'feeds'>; onDone?(r: any): void }) {
  const qc = useQueryClient();
  const [pulls, setPulls] = useState(0);
  const [taps, setTaps] = useState(0);
  const [gone, setGone] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tip = useAnimation();
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const NEED = 3;
  const finish = async () => {
    try {
      const r = await api.enchantVisitorAct(v.id, 'shake');
      setGone(true); feel('success');
      efx.burst({ ...centerOf(box.current), colors: ['#7CFF6B', '#B026FF', '#fff'], count: 90, speed: 13, kind: 'drop' });
      toast.success(`Peeled it off! +${r.result.ink} Ink`);
      qc.setQueryData(['enchant-visitors'], r.visitors); invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['enchant-map'] });
      useWrapFx.getState().setPeel(v.id, 0);
      onDone?.(r);
    } catch (e) { toast.error(toGameError(e).message); }
  };
  const pull = () => {
    const n = pulls + 1;
    setPulls(n); feel(n >= NEED ? 'heavy' : 'medium');
    useWrapFx.getState().setPeel(v.id, n / NEED);
    efx.burst({ ...centerOf(box.current), colors: ['#7CFF6B'], count: 14, speed: 6, kind: 'drop' });
    if (n >= NEED) void finish();
  };
  useShake(gone || v.stage >= 2 ? null : pull);
  if (v.stage >= 2) return <p className="text-[12px] font-bold text-[#3DDC97]">💚 A Symbiote can’t be peeled off — it shares its meals with you instead. Welcome it for a bigger share.</p>;
  if (gone) return <p className="text-[12px] font-black text-[#7CFF6B]">🌿 Your plot is free.</p>;
  return (
    <div className="grid gap-1.5" data-testid="peel-off">
      <div ref={box} className="lv-peel relative h-28 touch-none overflow-hidden rounded-2xl"
        onPointerDown={(e) => { void askMotion(); drag.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const x = e.clientX - drag.current.x, y = e.clientY - drag.current.y;
          setOff({ x, y }); useWrapFx.getState().setPeel(v.id, Math.min(1, (pulls + Math.hypot(x, y) / 120) / NEED));
          if (Math.hypot(x, y) > 110) { drag.current = null; setOff({ x: 0, y: 0 }); void tip.start({ x: [x * 0.6, 0], y: [y * 0.6, 0], transition: { type: 'spring', stiffness: 500, damping: 12 } }); pull(); }
        }}
        onPointerUp={() => { drag.current = null; void tip.start({ x: [off.x, 0], y: [off.y, 0], transition: { type: 'spring', stiffness: 600, damping: 14 } }); setOff({ x: 0, y: 0 }); }}>
        <div className="absolute inset-x-6 inset-y-5 rounded-lg bg-[#2B3B66]" />
        <div className="lv-peel-coil pointer-events-none absolute inset-x-5 inset-y-4 rounded-xl" style={{ borderWidth: 4 + Math.min(10, v.feeds ?? 1) }} />
        <motion.div animate={tip} className="absolute right-4 top-2 grid h-14 w-14 place-items-center" style={{ x: off.x, y: off.y }}>
          <span className="lv-wriggle grid h-12 w-12 place-items-center rounded-full bg-[radial-gradient(circle,#B6FF8F,#7CFF6B_45%,#B026FF)] text-xl shadow-[0_0_18px_#7CFF6B]">👁️</span>
        </motion.div>
        <div className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[11px] font-black text-white/85">Grab the head and drag it off · {pulls}/{NEED} pulls · or shake your phone</div>
      </div>
      <button className="text-[11px] font-bold text-white/55 underline" onClick={() => { const n = taps + 1; setTaps(n); feel('light'); if (n >= 5) { setTaps(0); pull(); } }} data-testid="visitor-shake">…or tap here 5× for a pull ({taps}/5)</button>
    </div>
  );
}
