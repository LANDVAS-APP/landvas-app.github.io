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
      <div className="grid justify-items-center gap-4" data-testid="daily-wheel">
        <div className="relative" style={{ width: R * 2, height: R * 2, maxWidth: '100%' }}>
          <svg viewBox={`0 0 ${R * 2} ${R * 2}`} width="100%" height="100%" className="drop-shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
            style={{ transform: `rotate(${turn}deg)`, transition: spinning && !reduce ? 'transform 4.2s cubic-bezier(0.15, 0.85, 0.2, 1)' : 'none' }}>
            {slices.map((s, i) => (
              <g key={i}>
                <path d={arc(i, n)} fill={s.color || '#7B5CFF'} stroke="#0b1226" strokeWidth="2" />
                <text transform={`rotate(${i * seg + seg / 2} ${R} ${R}) translate(${R} ${R * 0.32})`} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0b1226">
                  {s.label.length > 14 ? `${s.label.slice(0, 13)}…` : s.label}
                </text>
              </g>
            ))}
            <circle cx={R} cy={R} r={22} fill="#0b1226" stroke="#fff" strokeWidth="3" />
          </svg>
          <div className="absolute left-1/2 top-[-6px] h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[22px] border-x-transparent border-t-white drop-shadow" aria-hidden />
        </div>
        {won && <p className="font-display text-xl font-bold text-gold" data-testid="wheel-won">You won {prizeText(won)}!</p>}
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
