// The roll turns Enchanted: midway through the spin the rarity drum stutters and cracks, the canvas goes dark violet,
// an arcane circle of runes wheels out round it, beams of gold converge — and the enchantment's own sigil assembles out
// of the light before its name slams in. About three and a half seconds; a tap hurries it along.
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';
import type { Fx } from '../roll/fx';
import { kindInfo } from './kinds';
import { Sigil } from './Sigil';
import './enchant.css';

export type EnchantBrief = { id: string; kind: string; serial: number; sigil: number; minted?: number; population?: number; born_place?: string | null };
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

export function EnchantTransform({ ench, fx, center, onDone }: { ench: EnchantBrief; fx: Fx | null; center(): { x: number; y: number; w: number }; onDone(): void }) {
  const k = kindInfo(ench.kind);
  const [step, setStep] = useState(0);
  const done = useRef(false);
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };
  useEffect(() => {
    if (reduce) { const t = setTimeout(finish, 400); return () => clearTimeout(t); }
    const c = center();
    const ts: ReturnType<typeof setTimeout>[] = [];
    if (haptics) buzz('heavy');
    fx?.burst({ x: c.x, y: c.y, colors: ['#B26BFF', '#2A0A4D', '#FFE8A3'], count: 60, speed: 9, kind: 'spark' });
    ts.push(setTimeout(() => { setStep(1); fx?.burst({ x: c.x, y: c.y, colors: ['#FFE8A3', '#B26BFF', '#fff'], count: 140, speed: 6, ring: c.w * 0.9, kind: 'glitter', life: 1.2 }); if (haptics) buzz('medium'); }, 350));
    ts.push(setTimeout(() => { setStep(2); if (haptics) buzz('medium'); }, 1300));
    ts.push(setTimeout(() => {
      setStep(3);
      fx?.burst({ x: c.x, y: c.y, colors: [k.a, k.b, '#FFE8A3', '#fff'], count: 280, speed: 16, kind: 'spark' });
      fx?.burst({ x: c.x, y: c.y, colors: ['#fff'], count: 24, speed: 10, kind: 'emoji', emojis: [k.emoji, '✨'], life: 1.4 });
      if (haptics) buzz('heavy');
    }, 2100));
    ts.push(setTimeout(finish, 3500));
    return () => ts.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="absolute inset-0 z-[5] grid place-items-center" onPointerDown={(e) => { e.stopPropagation(); finish(); }} data-testid="roll-enchanting">
      {/* the room goes violet */}
      <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
        style={{ background: `radial-gradient(60% 45% at 50% 44%, ${k.a}44 0%, #1A0533 45%, #05020C 100%)` }} />
      {/* the crack across the old rarity */}
      <motion.svg viewBox="0 0 100 100" className="absolute left-1/2 top-[42%] w-[min(80vw,360px)] -translate-x-1/2 -translate-y-1/2" initial={{ opacity: 1 }} animate={{ opacity: step >= 1 ? 0 : 1 }} transition={{ duration: 0.4 }} aria-hidden>
        {['M50 50 L8 20 L20 34', 'M50 50 L92 26 L80 40', 'M50 50 L30 92', 'M50 50 L76 88 L70 74', 'M50 50 L4 62', 'M50 50 L97 66'].map((d, i) => (
          <motion.path key={i} d={d} stroke="#FFE8A3" strokeWidth="1.2" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: i * 0.03 }} />
        ))}
      </motion.svg>
      {/* the arcane circle */}
      <motion.div className="absolute left-1/2 top-[42%] aspect-square w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2" initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: step >= 1 ? 1 : 0.2, opacity: step >= 1 ? 1 : 0 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
        <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
          <g className="lv-ench-circle">
            <circle cx="100" cy="100" r="96" fill="none" stroke="#FFE8A3" strokeOpacity="0.8" strokeWidth="1.2" />
            <circle cx="100" cy="100" r="88" fill="none" stroke={k.a} strokeOpacity="0.7" strokeWidth="0.8" strokeDasharray="3 4" />
            {Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return <text key={i} x={100 + Math.cos(a) * 92} y={100 + Math.sin(a) * 92} fontSize="7" fill="#FFE8A3" textAnchor="middle" dominantBaseline="central" className="lv-ench-rune" style={{ animationDelay: `${i * 0.06}s` }} transform={`rotate(${(a * 180) / Math.PI + 90} ${100 + Math.cos(a) * 92} ${100 + Math.sin(a) * 92})`}>{RUNES[(i * 7 + ench.sigil) % RUNES.length]}</text>; })}
          </g>
          <g className="lv-ench-circle-r">
            <polygon points={Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return `${100 + Math.cos(a) * 74},${100 + Math.sin(a) * 74}`; }).join(' ')} fill="none" stroke="#FFE8A3" strokeOpacity="0.6" strokeWidth="1" />
            <polygon points={Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; return `${100 + Math.cos(a) * 74},${100 + Math.sin(a) * 74}`; }).join(' ')} fill="none" stroke={k.a} strokeOpacity="0.6" strokeWidth="1" />
            <circle cx="100" cy="100" r="60" fill="none" stroke="#FFE8A3" strokeOpacity="0.4" strokeWidth="0.6" />
          </g>
        </svg>
      </motion.div>
      {/* beams converge */}
      {step >= 2 && Array.from({ length: 8 }, (_, i) => (
        <motion.div key={i} className="lv-ench-beam absolute left-1/2 top-[42%] h-[3px] w-[min(46vw,210px)] origin-left" style={{ rotate: `${i * 45}deg` }}
          initial={{ scaleX: 1.6, opacity: 0 }} animate={{ scaleX: step >= 3 ? 0 : 1, opacity: step >= 3 ? 0 : 1 }} transition={{ duration: step >= 3 ? 0.25 : 0.6 }} />
      ))}
      {/* the sigil assembles */}
      <motion.div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2" initial={{ scale: 0, rotate: -180, opacity: 0 }}
        animate={step >= 2 ? { scale: step >= 3 ? [1.35, 1] : 0.6, rotate: 0, opacity: step >= 3 ? 1 : 0.5 } : {}} transition={{ type: 'spring', stiffness: 160, damping: 12 }}>
        <Sigil kind={ench.kind} seed={ench.sigil} size={Math.min(innerWidth * 0.55, 240)} level={1} />
      </motion.div>
      {/* the word */}
      <div className="absolute inset-x-0 top-[12%] grid justify-items-center gap-1 text-center">
        {step >= 3 && <motion.div className="font-display text-[46px] font-black leading-none tracking-tight text-white" style={{ textShadow: `0 0 26px ${k.a}, 0 0 60px #B26BFF` }}
          initial={{ scale: 2.4, opacity: 0, y: -10 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 20 }}>✨ ENCHANTED ✨</motion.div>}
        {step >= 1 && step < 3 && <motion.div className="font-display text-[22px] font-black text-[#FFE8A3]/80" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.6, 1] }}>…something stirs in the ink…</motion.div>}
      </div>
    </div>
  );
}
