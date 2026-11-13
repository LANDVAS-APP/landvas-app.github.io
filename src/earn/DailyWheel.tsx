// The daily wheel: one free spin a day for Ink, pigments, a rent boost, a joystick
// refill or the jackpot. The server picks the prize; the wheel just shows it landing.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { WheelSlice } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { Button, Dialog } from '../ui';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { isNative } from '../native/native';

const R = 140;

function arc(i: number, n: number) {
  const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
  const [x0, y0, x1, y1] = [R + R * Math.cos(a0), R + R * Math.sin(a0), R + R * Math.cos(a1), R + R * Math.sin(a1)];
  return `M${R} ${R} L${x0} ${y0} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1} Z`;
}

export function prizeText(p: WheelSlice) {
  switch (p.kind) {
    case 'ink': return `${p.amount} Ink`;
    case 'pigments': return `${p.amount} Pigments`;
    case 'brush_points': return `${p.amount} XP`;
    case 'gallery_tokens': return `${p.amount} Gallery tokens`;
    case 'boost': return `a ${p.amount}-minute rent boost`;
    case 'joystick': return 'a full joystick tank';
  }
}

const APP = isNative();
const KIND_ICON: Record<WheelSlice['kind'], string> = { ink: '💧', pigments: '🎨', brush_points: '⭐', gallery_tokens: '🎟️', boost: '⚡', joystick: '🕹️' };
const KIND_WORD: Record<WheelSlice['kind'], string> = { ink: 'INK', pigments: 'PIGMENTS', brush_points: 'XP', gallery_tokens: 'TOKENS', boost: 'BOOST', joystick: 'REFILL' };
const amountText = (s: WheelSlice) => (s.kind === 'joystick' ? 'FULL' : s.kind === 'boost' ? `${s.amount}m` : s.amount >= 10000 ? `${Math.round(s.amount / 1000)}k` : `${s.amount}`);
/** a point on the wheel at `r` along slice i's middle */
const at = (i: number, n: number, r: number) => { const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2; return [R + r * Math.cos(a), R + r * Math.sin(a)] as const; };

/** the app: rich slices — each a gradient with a gloss, a big icon at the rim, the amount, and gold pegs between them */
function PremiumSlices({ slices }: { slices: WheelSlice[] }) {
  const n = Math.max(1, slices.length), seg = 360 / n;
  const jackpot = Math.max(...slices.filter((s) => s.kind === 'ink').map((s) => s.amount), 0);
  // fit the text to the slice: narrower slices get smaller type
  const k = Math.min(1, 10 / n + 0.2);
  return (
    <>
      <defs>
        {slices.map((s, i) => {
          const [x0, y0] = at(i, n, 0), [x1, y1] = at(i, n, R);
          return (
            <linearGradient key={i} id={`lvws${i}`} gradientUnits="userSpaceOnUse" x1={x0} y1={y0} x2={x1} y2={y1}>
              <stop offset="0" stopColor={s.color || '#7B5CFF'} stopOpacity="0.75" />
              <stop offset="0.55" stopColor={s.color || '#7B5CFF'} />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.55" />
            </linearGradient>
          );
        })}
        <radialGradient id="lvwgloss" cx="0.5" cy="0.18" r="0.75"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.06" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      {slices.map((s, i) => <path key={`p${i}`} d={arc(i, n)} fill={s.color || '#7B5CFF'} />)}
      {slices.map((s, i) => <path key={`g${i}`} d={arc(i, n)} fill={`url(#lvws${i})`} opacity={0.55} />)}
      {/* gold spokes */}
      {slices.map((_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return <line key={`l${i}`} x1={R + 24 * Math.cos(a)} y1={R + 24 * Math.sin(a)} x2={R + (R - 1) * Math.cos(a)} y2={R + (R - 1) * Math.sin(a)} stroke="#ffe7a1" strokeWidth="2" strokeOpacity="0.9" />; })}
      {/* the gloss goes under the labels so they stay crisp */}
      <circle cx={R} cy={R} r={R - 1} fill="url(#lvwg)" pointerEvents="none" />
      <circle cx={R} cy={R} r={R - 1} fill="url(#lvwgloss)" pointerEvents="none" />
      {slices.map((s, i) => {
        const big = s.kind === 'ink' && s.amount === jackpot && jackpot > 0;
        const rot = i * seg + seg / 2;
        return (
          <g key={`t${i}`} transform={`rotate(${rot} ${R} ${R})`} style={{ paintOrder: 'stroke' }}>
            <text x={R} y={R * 0.2} textAnchor="middle" fontSize={24 * k} dominantBaseline="middle">{big ? '💎' : KIND_ICON[s.kind] ?? '🎁'}</text>
            {/* the label runs along the slice, read from the rim in */}
            <g transform={`translate(${R} ${R * 0.58}) rotate(90)`}>
              <text x={0} y={-1} textAnchor="middle" fontSize={(amountText(s).length > 3 ? 16 : 19) * k} fontWeight="900" fill="#fff" stroke="rgba(20,10,30,0.55)" strokeWidth="3" fontFamily="var(--font-display)">{amountText(s)}</text>
              <text x={0} y={10 * k} textAnchor="middle" fontSize={7.5 * k} fontWeight="900" letterSpacing="0.8" fill="#fff" fillOpacity="0.92" stroke="rgba(20,10,30,0.45)" strokeWidth="2" fontFamily="var(--font-display)">{big ? 'JACKPOT' : KIND_WORD[s.kind] ?? ''}</text>
            </g>
          </g>
        );
      })}
      <circle cx={R} cy={R} r={R - 1.5} fill="none" stroke="#ffe7a1" strokeWidth="3" />
      {/* pegs */}
      {slices.map((_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return <circle key={`c${i}`} cx={R + (R - 9) * Math.cos(a)} cy={R + (R - 9) * Math.sin(a)} r="3.4" fill="#fff3c4" stroke="#b07a12" strokeWidth="1.2" />; })}
    </>
  );
}

export function DailyWheel({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ['wheel'], queryFn: api.wheelStatus, enabled: open });
  const [turn, setTurn] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<WheelSlice | null>(null);
  const reduce = useUi((s) => s.settings.reduceMotion);
  const slices = st.data?.slices ?? [];
  const n = Math.max(1, slices.length);
  const seg = 360 / n;
  const spin = async () => {
    setSpinning(true);
    setWon(null);
    try {
      const r = await api.wheelSpin();
      // land the chosen slice under the pointer at the top, after a few full turns
      const target = 360 * 6 - (r.slice * seg + seg / 2);
      setTurn((t) => t - (t % 360) + target + 360);
      await new Promise((res) => setTimeout(res, reduce ? 50 : 4300));
      setWon(r.prize);
      toast.success(`You won ${prizeText(r.prize)}!`);
      void qc.invalidateQueries({ queryKey: ['wheel'] });
      void qc.invalidateQueries({ queryKey: ['earn'] });
      invalidateGame(qc);
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setSpinning(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !spinning && onOpenChange(o)} title="Daily wheel" description="One free spin every day. Everything on the wheel is a prize.">
      <div className={cn('grid justify-items-center gap-4', APP && 'lv-wheelwrap', spinning && 'spinning')} data-testid="daily-wheel">
        <div className="relative" style={{ width: R * 2, height: R * 2, maxWidth: '100%' }}>
          {/* the app: a gold rim of bulbs that chase while it spins */}
          {APP && <div className="lv-wheelrim" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 15}deg) translateY(-${R + 6}px)`, animationDelay: `${(i % 4) * 0.12}s` }} />)}</div>}
          <svg viewBox={`0 0 ${R * 2} ${R * 2}`} width="100%" height="100%" className="drop-shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
            style={{ transform: `rotate(${turn}deg)`, transition: spinning && !reduce ? 'transform 4.2s cubic-bezier(0.15, 0.85, 0.2, 1)' : 'none' }}>
            {APP && <defs><radialGradient id="lvwg" cx="0.5" cy="0.5" r="0.5"><stop offset="0.55" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.28" /></radialGradient></defs>}
            {APP && <PremiumSlices slices={slices} />}
            {!APP && slices.map((s, i) => (
              <g key={i}>
                <path d={arc(i, n)} fill={s.color || '#7B5CFF'} stroke={APP ? '#fff3c4' : '#0b1226'} strokeWidth={APP ? 1.5 : 2} />
                <text transform={`rotate(${i * seg + seg / 2} ${R} ${R}) translate(${R} ${R * 0.32})`} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0b1226">
                  {s.label.length > 14 ? `${s.label.slice(0, 13)}…` : s.label}
                </text>
              </g>
            ))}
                        <circle cx={R} cy={R} r={22} fill={APP ? '#2a1a00' : '#0b1226'} stroke={APP ? '#ffd86b' : '#fff'} strokeWidth="3" />
            {APP && <text x={R} y={R + 7} textAnchor="middle" fontSize="20">⭐</text>}
          </svg>
          {APP ? <div className="lv-wheelpin" aria-hidden><span /></div>
            : <div className="absolute left-1/2 top-[-6px] h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[22px] border-x-transparent border-t-white drop-shadow" aria-hidden />}
        </div>
        {won && (APP
          ? <motion.div className="lv-prize" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }} data-testid="wheel-won"><span>🎉</span>You won <b>{prizeText(won)}</b>!</motion.div>
          : <p className="font-display text-xl font-bold text-gold" data-testid="wheel-won">You won {prizeText(won)}!</p>)}
        <Button variant="rainbow" size="lg" disabled={!st.data?.enabled || (st.data?.spins_left ?? 0) <= 0 || spinning} loading={spinning} onClick={() => void spin()} data-testid="wheel-spin">
          <RotateCw className="h-4 w-4" /> {(st.data?.spins_left ?? 0) > 0 ? 'Spin' : st.data?.resets_at ? `Next spin ${new Date(st.data.resets_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Spin'}
        </Button>
        {slices.length > 0 && (
          <details className="w-full text-xs text-muted">
            <summary className="cursor-pointer font-semibold">Odds</summary>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 tnum">{slices.map((s, i) => <span key={i} className="flex justify-between gap-2"><span className="flex items-center gap-1.5"><Gift className="h-3 w-3" style={{ color: s.color }} />{s.label}</span><span>{s.chance}%</span></span>)}</div>
          </details>
        )}
      </div>
    </Dialog>
  );
}
