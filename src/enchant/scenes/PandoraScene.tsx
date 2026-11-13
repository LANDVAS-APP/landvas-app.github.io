// 🏺 Pandora's Box: an ornate box on a dark altar, seven empty alcoves around it. Drag the lid up — one, two or three
// notches, light bleeding out wider each time — and let go. Gifts rise as gold; an evil streaks into its alcove and its
// curse lands. When all seven alcoves burn, Hope flutters up from the bottom.
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import { useUi } from '../../lib/store';
import { cn, fmt } from '../../lib/utils';
import { buzz } from '../../native/native';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { EVILS, EVIL_ORDER, dur } from '../kinds';
import { ClipMomentButton, enchantRef, useKeepMoment } from '../../clips/ClipMoment';
import type { Moment } from '../../clips/moments';

const NOTCH = 30;

export function PandoraScene({ v, view, act, busy, at }: SceneProps) {
  const keep = useKeepMoment();
  const [moment, setMoment] = useState<Moment | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const glow = useTransform(y, [0, -NOTCH * 3], [0, 1]);
  const [n, setN] = useState(0);
  const [out, setOut] = useState<any[] | null>(null);
  const [hope, setHope] = useState(false);
  const nextIn = useLeft(view.next_in, at);
  const lockedIn = useLeft(view.locked_in, at);
  const evils: string[] = view.evils ?? [];
  const can = !!view.can_open && !busy;
  const open = async (k: number) => {
    if (!can || k < 1) return;
    efx.burst({ ...centerOf(box.current), colors: ['#FFE8A3', '#fff'], count: 30 * k, speed: 6 + k * 2, kind: 'glitter', up: 1 });
    const r = await act('open', { notches: k }, { silent: true });
    y.set(0); setN(0);
    if (!r) return;
    setOut(r.result.out);
    r.result.out.forEach((o: any, i: number) => setTimeout(() => {
      if (useUi.getState().settings.haptics) buzz(o.type === 'evil' ? 'heavy' : 'success');
      efx.burst({ ...centerOf(box.current), colors: o.type === 'evil' ? ['#2A0A3D', '#5A1A6E', '#FF4D6D'] : ['#FFD23F', '#FFE8A3', '#fff'], count: 50, speed: 10, kind: o.type === 'evil' ? 'drop' : 'spark', up: 1 });
      if (o.type === 'ink' && o.pay) efx.pay(o.pay, 'pandora', centerOf(box.current));
    }, 450 + i * 650));
    if (r.result.hope) setTimeout(() => { setHope(true); setMoment(keep({ type: 'hope', e: enchantRef(v) })); efx.burst({ ...centerOf(box.current), colors: ['#fff', '#FFE8A3', '#A6FFD6', '#C9B8FF'], count: 260, speed: 16, kind: 'spark' }); }, 450 + r.result.out.length * 650);
  };
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'radial-gradient(circle at 50% 70%,#3A0E2A 0%,#14040F 60%,#08020A 100%)' }} data-testid="pandora-scene">
        {/* the seven alcoves */}
        {EVIL_ORDER.map((id, i) => {
          const a = Math.PI + (i / 6) * Math.PI, e = EVILS[id], free = evils.includes(id);
          return (
            <motion.div key={id} className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-xl"
              style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${62 + Math.sin(a) * 52}%`, width: 44, height: 44, borderColor: free ? e.color : 'rgba(255,255,255,0.12)',
                background: free ? `radial-gradient(circle, ${e.color}55, transparent 70%)` : 'rgba(0,0,0,0.35)', boxShadow: free ? `0 0 18px ${e.color}` : undefined }}
              animate={free ? { scale: [1.4, 1] } : {}} title={free ? `${e.name}: ${e.curse}` : 'Sealed'} data-testid={`pandora-evil-${id}`} data-free={free || undefined}>
              <span className={free ? '' : 'opacity-20 grayscale'}>{e.emoji}</span>
            </motion.div>
          );
        })}
        {/* the box */}
        <div ref={box} className="absolute bottom-[10%] left-1/2 w-[38%] -translate-x-1/2">
          <motion.div className="pointer-events-none absolute -top-[60%] left-1/2 h-[90%] w-[70%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_50%_100%,#FFE8A3,transparent_70%)]" style={{ opacity: glow }} />
          <motion.div drag={can ? 'y' : false} dragConstraints={{ top: -NOTCH * 3, bottom: 0 }} dragElastic={0.05} dragMomentum={false} style={{ y }}
            onDrag={() => { const k = Math.min(3, Math.floor(-y.get() / NOTCH + 0.35)); if (k !== n) { setN(k); if (useUi.getState().settings.haptics) buzz('light'); } }}
            onDragEnd={() => { const k = Math.min(3, Math.floor(-y.get() / NOTCH + 0.35)); if (k >= 1) void open(k); else y.set(0); }}
            className={cn('relative z-10 cursor-grab touch-none active:cursor-grabbing', !can && 'opacity-80')} data-testid="pandora-lid">
            <svg viewBox="0 0 200 50" className="w-full drop-shadow-[0_6px_8px_rgba(0,0,0,0.6)]" aria-hidden>
              <path d="M8 44 Q100 0 192 44 Z" fill="#7A1E3A" stroke="#FFD23F" strokeWidth="3" /><circle cx="100" cy="18" r="7" fill="#FFD23F" />
              <path d="M40 36 Q100 14 160 36" stroke="#FFD23F" strokeWidth="1.5" fill="none" strokeDasharray="4 4" /></svg>
          </motion.div>
          <svg viewBox="0 0 200 120" className="relative -mt-[2%] w-full drop-shadow-[0_12px_14px_rgba(0,0,0,0.6)]" aria-hidden>
            <rect x="10" y="0" width="180" height="110" rx="10" fill="#5A1530" stroke="#FFD23F" strokeWidth="3" />
            <rect x="24" y="14" width="152" height="82" rx="6" fill="none" stroke="#FFD23F" strokeOpacity="0.6" strokeWidth="1.5" />
            <path d="M100 30 L112 55 L100 80 L88 55Z" fill="#FFD23F" opacity="0.85" /><circle cx="100" cy="55" r="6" fill="#2A0A3D" />
            {Array.from({ length: 7 }, (_, i) => <circle key={i} cx={34 + i * 22} cy="104" r="3" fill={evils.length > i ? '#FF4D6D' : '#FFD23F'} />)}
          </svg>
        </div>
        <div className="absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[12px] font-black text-white backdrop-blur" data-testid="pandora-status">
          {view.can_open ? (n ? `Lifting: ${n} notch${n > 1 ? 'es' : ''}…` : '👆 Drag the lid up') : (lockedIn ?? 0) > 0 ? `🥀 Sorrow: shut for ${dur(lockedIn)}` : `Shut until tomorrow · ${dur(nextIn)}`}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[12px] font-black text-[#FF9BB0]">{evils.length}/7 evils out{view.cycle ? ` · cycle ${view.cycle + 1}` : ''}</div>
        {/* what came out */}
        <AnimatePresence>
          {out && (
            <motion.button key="o" onClick={() => setOut(null)} className="absolute inset-x-3 bottom-3 grid gap-1 rounded-2xl bg-black/70 p-2 text-left backdrop-blur" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} data-testid="pandora-out">
              {out.map((o, i) => (
                <motion.div key={i} className="flex items-center gap-2 text-[12px] font-bold" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + i * 0.65 }}>
                  {o.type === 'evil' ? <><span className="text-lg">{EVILS[o.evil]?.emoji}</span><span style={{ color: EVILS[o.evil]?.color }}>{EVILS[o.evil]?.name} escaped!</span><span className="text-white/60">{o.dodged ? 'You slipped its curse.' : EVILS[o.evil]?.curse}</span></>
                    : o.type === 'ink' ? <><span className="text-lg">💰</span><span className="text-[#FFD23F]">+{fmt(o.pay?.paid ?? 0)} Ink</span></>
                    : o.type === 'luck' ? <><span className="text-lg">🍀</span><span className="text-[#3DDC97]">+{o.luck} Luck</span></>
                    : o.type === 'enchant' ? <><span className="text-lg">✨</span><span className="text-[#C9A0FF]">+1 Enchanted Luck</span></>
                    : o.type === 'golden' ? <><span className="text-lg">⏳</span><span className="text-[#FF9F1C]">Golden Hour: next {o.uses} wins ×2</span></>
                    : <><span className="text-lg">🦋</span><span className="text-white">HOPE!</span></>}
                </motion.div>
              ))}
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {hope && (
            <motion.div key="h" role="button" onClick={() => setHope(false)} className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle,rgba(255,255,255,0.35),rgba(0,0,0,0.85))] text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="pandora-hope">
              <motion.div initial={{ y: 80, scale: 0.4 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 10 }} className="grid gap-1">
                <span className="lv-ench-float text-8xl">🦋</span><span className="font-display text-4xl font-black text-white drop-shadow-[0_0_20px_#fff]">Hope</span>
                <span className="text-sm font-bold text-white/85">A Legendary+ roll ticket and a fortune. The box closes again — richer.</span>
                {moment && <div className="mt-2"><ClipMomentButton moment={moment} /></div>}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="grid grid-cols-3 gap-2" data-testid="pandora-notches">
        {[1, 2, 3].map((k) => (
          <Button key={k} variant={k === 3 ? 'danger' : 'secondary'} disabled={!can} onClick={() => void open(k)} data-testid={`pandora-open-${k}`}>
            {['A crack', 'Halfway', 'Wide open'][k - 1]}<span className="ml-1 text-[10px] opacity-70">{['22%', '32%', '45%'][k - 1]} evil</span>
          </Button>
        ))}
      </div>
      {(view.curses ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">{view.curses.map((c: any, i: number) => { const e = EVILS[c.kind.replace('curse_', '')]; return <span key={i} className="rounded-full px-2.5 py-0.5 text-[11px] font-black" style={{ background: `${e?.color}22`, color: e?.color }}>{e?.emoji} {e?.name} cursing you</span>; })}</div>
      )}
      <p className="text-center text-[11px] text-white/55">Wider means bigger gifts — and likelier evils. Each evil escapes once; release all seven and Hope comes out. Opened {view.opens} time{view.opens === 1 ? '' : 's'}.</p>
    </div>
  );
}
