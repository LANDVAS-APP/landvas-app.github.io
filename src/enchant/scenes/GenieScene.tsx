// 🧞 The Genie: a tent under the stars. Rub the lamp (drag back and forth across it) until the smoke pours out and the
// Genie rises; pick a wish card. With three wishes stored, the Forbidden Wish glows red — and what comes back is drama.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useConfirm } from '../../ui';
import { cn } from '../../lib/utils';
import { buzz } from '../../native/native';
import { useUi } from '../../lib/store';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { dur } from '../kinds';
import { ClipMomentButton, enchantRef, useKeepMoment } from '../../clips/ClipMoment';
import type { Moment } from '../../clips/moments';

const WISHES = [
  { id: 'ink', emoji: '💰', name: 'Riches', text: '40–90 Ink, here and now', c: '#FFD23F' },
  { id: 'luck', emoji: '🍀', name: 'Fortune', text: '+15 Luck for your rerolls', c: '#3DDC97' },
  { id: 'enchant', emoji: '✨', name: 'Enchantment', text: '+1 Enchanted Luck for your next roll', c: '#B26BFF' },
  { id: 'golden', emoji: '⏳', name: 'Golden Hour', text: 'Your next 3 minigame wins pay ×2', c: '#FF9F1C' },
];

export function GenieScene({ v, view, act, busy, at }: SceneProps) {
  const keep = useKeepMoment();
  const [moment, setMoment] = useState<Moment | null>(null);
  const lamp = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const [rub, setRub] = useState(0);
  const [awake, setAwake] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const last = useRef<number | null>(null);
  const nextIn = useLeft(view.next_in, at);
  const wishes = Number(view.wishes);
  const freed = !!view.freed_until, cold = !!view.cold_until;
  const canSummon = wishes > 0 && !freed;
  const onMove = (e: React.PointerEvent) => {
    if (!canSummon || awake || e.buttons === 0) return;
    if (last.current != null) {
      const d = Math.abs(e.clientX - last.current);
      if (d > 2) {
        setRub((r) => {
          const n = Math.min(100, r + d / 7);
          if (Math.floor(n / 10) > Math.floor(r / 10)) {
            efx.burst({ ...centerOf(lamp.current), colors: ['#C9B8FF', '#8B5CFF', '#fff'], count: 6, speed: 3, gravity: -0.05, up: 0.9, kind: 'glitter', life: 1.4 });
            if (useUi.getState().settings.haptics) buzz('light');
          }
          if (n >= 100 && r < 100) {
            setAwake(true);
            efx.burst({ ...centerOf(lamp.current), colors: ['#8B5CFF', '#22E3FF', '#fff', '#FFD23F'], count: 120, speed: 12, kind: 'spark' });
            if (useUi.getState().settings.haptics) buzz('heavy');
          }
          return n;
        });
      }
    }
    last.current = e.clientX;
  };
  const wish = async (id: string) => {
    const r = await act('wish', { wish: id }, { at: centerOf(lamp.current) });
    if (r) {
      if (id !== 'ink') efx.burst({ ...centerOf(lamp.current), colors: ['#fff'], count: 24, speed: 8, kind: 'emoji', emojis: [WISHES.find((w) => w.id === id)!.emoji] });
      if (r.result?.kept) efx.burst({ ...centerOf(lamp.current), colors: ['#fff'], count: 16, speed: 6, kind: 'emoji', emojis: ['🔁'] });
      setAwake(false); setRub(0);
    }
  };
  const forbidden = async () => {
    if (!(await confirm({ title: '⛓️ The Forbidden Wish', body: <>All three wishes, spent on one: <b>wish for more wishes</b>. The Genie may grant it — seven wishes. It may twist it — a fortune, and a lamp gone cold for three days. Or it may take its freedom, leaving a Mythic+ roll ticket behind and an empty lamp for a week.</>, confirm: 'Make the wish' }))) return;
    const r = await act('forbidden', {}, { at: centerOf(lamp.current) });
    if (r) {
      setOutcome(r.result.forbidden); setAwake(false); setRub(0);
      setMoment(keep({ type: 'forbidden', e: enchantRef(v), outcome: String(r.result.forbidden) }));
      efx.burst({ ...centerOf(lamp.current), colors: r.result.forbidden === 'granted' ? ['#FFD23F', '#fff', '#8B5CFF'] : r.result.forbidden === 'freed' ? ['#22E3FF', '#fff'] : ['#FF2E63', '#2A0A3D', '#fff'], count: 200, speed: 15, kind: 'spark' });
      if (useUi.getState().settings.haptics) buzz('heavy');
    }
  };
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full touch-none" style={{ background: 'radial-gradient(120% 80% at 50% 110%,#5A2D82 0%,#24104A 45%,#0B0620 100%)' }}
        onPointerMove={onMove} onPointerUp={() => { last.current = null; }} onPointerLeave={() => { last.current = null; }} data-testid="genie-scene">
        {Array.from({ length: 40 }, (_, i) => <span key={i} className="lv-twinkle absolute h-[2px] w-[2px] rounded-full bg-white" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 55}%`, animationDelay: `${(i % 9) * 0.3}s` }} />)}
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          <path d="M0 0 L200 40 L400 0 V60 Q200 100 0 60Z" fill="#7A2E4E" opacity="0.7" /><path d="M0 300 Q200 230 400 300Z" fill="#3A1A54" />
        </svg>
        {/* the genie */}
        <AnimatePresence>
          {awake && (
            <motion.div key="g" className="absolute bottom-[34%] left-1/2 w-[46%] -translate-x-1/2" initial={{ opacity: 0, y: 60, scale: 0.3 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -40, scale: 0.6 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
              <svg viewBox="0 0 160 200" className="lv-ench-float w-full drop-shadow-[0_0_30px_rgba(34,227,255,0.6)]" aria-hidden>
                <path d="M80 200 Q40 170 70 150 Q100 130 60 110 Q30 90 80 80 Q130 90 100 110 Q60 130 90 150 Q120 170 80 200Z" fill="#22C3E6" opacity="0.75" />
                <ellipse cx="80" cy="70" rx="34" ry="30" fill="#3DB6E8" /><circle cx="80" cy="40" r="24" fill="#4CC3EE" />
                <path d="M56 30 Q80 6 104 30 Q80 20 56 30Z" fill="#8B5CFF" /><circle cx="80" cy="12" r="5" fill="#FFD23F" />
                <circle cx="71" cy="40" r="3.4" fill="#fff" /><circle cx="89" cy="40" r="3.4" fill="#fff" /><circle cx="71" cy="40" r="1.6" fill="#14082E" /><circle cx="89" cy="40" r="1.6" fill="#14082E" />
                <path d="M70 52 Q80 60 90 52" stroke="#14082E" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                <path d="M46 66 Q20 50 18 34 M114 66 Q140 50 142 34" stroke="#3DB6E8" strokeWidth="10" strokeLinecap="round" fill="none" />
                <circle cx="18" cy="32" r="7" fill="#FFD23F" /><circle cx="142" cy="32" r="7" fill="#FFD23F" /></svg>
            </motion.div>
          )}
        </AnimatePresence>
        {/* smoke while rubbing */}
        {rub > 5 && !awake && Array.from({ length: Math.ceil(rub / 20) }, (_, i) => <span key={i} className="lv-smoke absolute bottom-[34%] left-[52%] h-10 w-10 rounded-full bg-[#B9A6FF]/50 blur-md" style={{ animationDelay: `${i * 0.4}s` }} />)}
        {/* the lamp */}
        <div ref={lamp} className={cn('absolute bottom-[12%] left-1/2 w-[44%] -translate-x-1/2', rub > 0 && rub < 100 && 'lv-tremble')} data-testid="genie-lamp">
          <svg viewBox="0 0 200 110" className="w-full drop-shadow-[0_10px_14px_rgba(0,0,0,0.5)]" aria-hidden>
            <defs><linearGradient id="lamp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cold ? '#8A8FA3' : '#FFE38A'} /><stop offset="0.55" stopColor={cold ? '#5B6075' : '#E9A100'} /><stop offset="1" stopColor={cold ? '#3A3E50' : '#8C5A00'} /></linearGradient></defs>
            <ellipse cx="100" cy="102" rx="70" ry="8" fill="#000" opacity="0.35" />
            <path d="M40 70 Q40 40 100 38 Q150 40 160 62 L196 46 Q190 64 168 74 Q160 96 100 98 Q48 98 40 70Z" fill="url(#lamp)" />
            <path d="M76 38 Q100 14 124 38Z" fill="url(#lamp)" /><circle cx="100" cy="18" r="6" fill={cold ? '#5B6075' : '#FFD23F'} />
            <path d="M40 66 Q14 62 18 80 Q26 92 44 84" stroke="url(#lamp)" strokeWidth="7" fill="none" />
            <path d="M60 60 Q100 52 140 60" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" fill="none" /></svg>
        </div>
        {/* wishes held */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 backdrop-blur" data-testid="genie-wishes">
          {Array.from({ length: Math.max(3, wishes) }, (_, i) => <span key={i} className={cn('h-3.5 w-3.5 rounded-full', i < wishes ? 'bg-[radial-gradient(circle,#fff,#22E3FF)] shadow-[0_0_10px_#22E3FF]' : 'bg-white/15')} />)}
          <span className="ml-1 text-[12px] font-black text-white">{wishes} wish{wishes === 1 ? '' : 'es'}</span>
        </div>
        {!awake && (
          <div className="absolute inset-x-0 top-[38%] grid justify-items-center gap-1 text-center">
            {freed ? <span className="rounded-2xl bg-black/50 px-4 py-2 text-sm font-bold text-[#9FEAFF]">The Genie is free. The lamp is empty… for now.</span>
              : cold ? <span className="rounded-2xl bg-black/50 px-4 py-2 text-sm font-bold text-white/80">The lamp has gone cold.</span>
              : canSummon ? <span className="rounded-full bg-black/40 px-3 py-1 text-[13px] font-black text-white">👆 Rub the lamp · {Math.round(rub)}%</span>
              : <span className="rounded-full bg-black/40 px-3 py-1 text-[13px] font-bold text-white/80">Next wish in {dur(nextIn)}</span>}
            {canSummon && rub > 0 && <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-[linear-gradient(90deg,#8B5CFF,#22E3FF)]" style={{ width: `${rub}%` }} /></div>}
          </div>
        )}
        {/* the Forbidden Wish's answer */}
        <AnimatePresence>
          {outcome && (
            <motion.div key="o" role="button" onClick={() => setOutcome(null)} className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="genie-outcome">
              <motion.div initial={{ scale: 0.4, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
                <div className="text-6xl">{outcome === 'granted' ? '🌟' : outcome === 'freed' ? '🕊️' : '⛓️'}</div>
                <div className="mt-2 font-display text-3xl font-black" style={{ color: outcome === 'granted' ? '#FFD23F' : outcome === 'freed' ? '#9FEAFF' : '#FF4D6D' }}>
                  {outcome === 'granted' ? 'GRANTED — seven wishes!' : outcome === 'freed' ? 'The Genie is free!' : 'Twisted…'}</div>
                <div className="mt-1 text-sm font-semibold text-white/80">{outcome === 'granted' ? 'Use them well.' : outcome === 'freed' ? 'It leaves you a Mythic+ roll ticket, and an empty lamp for a week.' : 'A fortune falls from the lamp — and it goes cold for three days.'}</div>
                {moment && <div className="mt-3"><ClipMomentButton moment={moment} /></div>}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* the wish cards */}
      <AnimatePresence>
        {awake && (
          <motion.div className="grid grid-cols-2 gap-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {WISHES.map((w, i) => (
              <motion.button key={w.id} onClick={() => void wish(w.id)} disabled={!!busy} data-testid={`genie-wish-${w.id}`}
                className="grid justify-items-start gap-0.5 rounded-2xl border-2 bg-white/[0.05] p-3 text-left" style={{ borderColor: `${w.c}88` }}
                initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ delay: i * 0.08 }} whileTap={{ scale: 0.96 }}>
                <span className="text-2xl">{w.emoji}</span><span className="font-display text-[15px] font-black" style={{ color: w.c }}>{w.name}</span><span className="text-[11px] font-semibold text-white/65">{w.text}</span>
              </motion.button>
            ))}
            <motion.button onClick={() => void forbidden()} disabled={!!busy || wishes < 3} data-testid="genie-forbidden"
              className={cn('col-span-2 rounded-2xl border-2 p-3 text-left', wishes >= 3 ? 'border-[#FF2E63] bg-[linear-gradient(135deg,#3A0A1E,#14020A)] shadow-[0_0_24px_rgba(255,46,99,0.45)]' : 'border-white/10 bg-white/[0.03] opacity-60')}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
              <div className="flex items-center gap-2"><span className="text-2xl">⛓️</span><span className="font-display text-[16px] font-black text-[#FF4D6D]">The Forbidden Wish</span>{wishes < 3 && <span className="ml-auto text-[11px] font-bold text-white/50">needs 3 wishes</span>}</div>
              <div className="text-[11px] font-semibold text-white/65">Spend all three to wish for more wishes. The Genie decides what you get.</div>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      {!awake && <p className="text-center text-[11px] text-white/55">{view.made} wish{view.made === 1 ? '' : 'es'} granted{view.forbidden ? ` · ${view.forbidden} forbidden` : ''}. {wishes < 3 && !freed && !cold && view.next_in != null ? `Next wish in ${dur(nextIn)}.` : ''}</p>}
    </div>
  );
}
