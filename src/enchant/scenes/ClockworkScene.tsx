// ⚙️ Clockwork: a brass clock with its works showing. Grab the key and wind it — drag round and round; every full turn
// clicks and stores 8 minutes. Then spend the stored time on your other enchantments: fast-forward their clocks (the
// hands whirl) or freeze them in frost — a frozen spliced hybrid stays fused for longer.
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { buzz } from '../../native/native';
import { Button } from '../../ui';
import { Sigil } from '../Sigil';
import { centerOf, efx, useMyEnchantments, type SceneProps } from '../core';
import { dur, enchantName } from '../kinds';

function Gear({ r, teeth, cls, x, y, c }: { r: number; teeth: number; cls: string; x: number; y: number; c: string }) {
  const d = Array.from({ length: teeth * 2 }, (_, i) => { const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 0.82; return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');
  return <g className={cls}><polygon points={d} fill={c} stroke="#3A2A1A" strokeWidth="1.5" /><circle cx={x} cy={y} r={r * 0.35} fill="#3A2A1A" /><circle cx={x} cy={y} r={r * 0.15} fill="#D4A373" /></g>;
}

export function ClockworkScene({ v, view, act, busy }: SceneProps) {
  const mine = useMyEnchantments();
  const key = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState(0);
  const [whirl, setWhirl] = useState(false);
  const acc = useRef<{ last: number | null; total: number }>({ last: null, total: 0 });
  const turns = Math.min(Number(view.turns_left), Math.floor(acc.current.total / 360));
  const left = Number(view.turns_left);
  const onMove = (e: React.PointerEvent) => {
    if (e.buttons === 0 || left < 1) return;
    const c = centerOf(key.current);
    const a = (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
    if (acc.current.last != null) {
      let d = a - acc.current.last; if (d > 180) d -= 360; if (d < -180) d += 360;
      if (d > 0) {
        const before = Math.floor(acc.current.total / 360);
        acc.current.total = Math.min(acc.current.total + d, left * 360 + 359);
        if (Math.floor(acc.current.total / 360) > before) { if (useUi.getState().settings.haptics) buzz('medium'); efx.burst({ ...c, colors: ['#D4A373', '#FFE8A3'], count: 10, speed: 5, kind: 'spark' }); }
        setAngle(acc.current.total);
      }
    }
    acc.current.last = a;
  };
  const release = async () => {
    acc.current.last = null;
    const n = Math.min(left, Math.floor(acc.current.total / 360));
    acc.current.total = 0; setAngle(0);
    if (n >= 1) await act('wind', { turns: n });
  };
  const forward = async (id: string, minutes: number) => {
    setWhirl(true);
    const r = await act('forward', { target: id, minutes });
    setTimeout(() => setWhirl(false), 1200);
    if (r) efx.burst({ ...centerOf(face.current), colors: ['#D4A373', '#FFE8A3', '#fff'], count: 60, speed: 9, kind: 'spark' });
  };
  const freeze = async (id: string, hours: number) => {
    const r = await act('freeze', { target: id, hours });
    if (r) efx.burst({ ...centerOf(face.current), colors: ['#C0F5FF', '#fff', '#7DD3FC'], count: 80, speed: 8, kind: 'glitter' });
  };
  const targets = (mine.data ?? []).filter((x) => x.id !== v.id);
  const charge = Number(view.charge);
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'radial-gradient(circle at 40% 40%,#3B2B1C,#140D07 75%)' }} data-testid="clock-scene">
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden>
          <Gear r={46} teeth={12} cls="lv-gear" x={70} y={70} c="#8B6B42" /><Gear r={30} teeth={9} cls="lv-gear-r" x={128} y={40} c="#A47E4D" />
          <Gear r={38} teeth={11} cls="lv-gear-r" x={340} y={230} c="#8B6B42" /><Gear r={24} teeth={8} cls="lv-gear" x={300} y={270} c="#A47E4D" />
        </svg>
        {/* the clock face */}
        <div ref={face} className="absolute left-[30%] top-[10%] aspect-square w-[44%] rounded-full border-[6px] border-[#D4A373] bg-[radial-gradient(circle,#FFF8E7,#E9D8B4)] shadow-[0_0_30px_rgba(212,163,115,0.45),inset_0_0_20px_rgba(0,0,0,0.25)]">
          <svg viewBox="0 0 100 100" className="absolute inset-0" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <line key={i} x1={50 + Math.cos(a) * 40} y1={50 + Math.sin(a) * 40} x2={50 + Math.cos(a) * 46} y2={50 + Math.sin(a) * 46} stroke="#3A2A1A" strokeWidth={i % 3 ? 1.5 : 3} />; })}
            <motion.line x1="50" y1="50" x2="50" y2="22" stroke="#3A2A1A" strokeWidth="3" strokeLinecap="round" animate={{ rotate: whirl ? 1080 : angle / 12 }} transition={{ duration: whirl ? 1.1 : 0.1 }} style={{ transformOrigin: '50px 50px' }} />
            <motion.line x1="50" y1="50" x2="50" y2="12" stroke="#7A2E1A" strokeWidth="1.6" strokeLinecap="round" animate={{ rotate: whirl ? 4320 : angle }} transition={{ duration: whirl ? 1.1 : 0.1 }} style={{ transformOrigin: '50px 50px' }} />
            <circle cx="50" cy="50" r="3" fill="#3A2A1A" />
          </svg>
        </div>
        {/* the key */}
        <div ref={key} className="absolute bottom-[8%] right-[8%] grid aspect-square w-[26%] touch-none place-items-center rounded-full bg-[radial-gradient(circle,rgba(212,163,115,0.25),transparent_70%)]"
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); acc.current.last = null; }} onPointerMove={onMove} onPointerUp={() => void release()} onPointerCancel={() => void release()} data-testid="clock-key">
          <motion.svg viewBox="0 0 100 100" className="w-[80%]" style={{ rotate: angle }} aria-hidden>
            <circle cx="50" cy="50" r="12" fill="#D4A373" stroke="#3A2A1A" strokeWidth="2" />
            <path d="M50 38 Q30 10 50 4 Q70 10 50 38Z M50 62 Q30 90 50 96 Q70 90 50 62Z" fill="#B88B5A" stroke="#3A2A1A" strokeWidth="2" />
          </motion.svg>
          <span className="absolute -top-5 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-black text-[#FFE8A3]">{left ? (turns ? `${turns} turn${turns > 1 ? 's' : ''} — let go` : '↻ wind me') : 'wound out today'}</span>
        </div>
        {/* stored time */}
        <div className="absolute left-3 top-3 grid gap-1">
          <span className="rounded-full bg-black/45 px-3 py-1 font-display text-[16px] font-black text-[#FFE8A3]" data-testid="clock-charge">⏱ {Math.floor(charge)} min stored</span>
          <div className="h-1.5 w-36 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-[linear-gradient(90deg,#D4A373,#FFE8A3)]" style={{ width: `${(charge / Number(view.cap)) * 100}%` }} /></div>
          <span className="text-[10px] font-bold text-white/60">{left}/{view.turns_max} turns left today · ticks +3 min an hour</span>
        </div>
      </div>
      <div className="grid gap-1.5" data-testid="clock-targets">
        <div className="text-[12px] font-black uppercase tracking-wider text-white/60">Bend time for…</div>
        {targets.length ? targets.map((t) => {
          const frozen = !!t.clock?.frozen_until;
          return (
            <div key={t.id} className={cn('flex flex-wrap items-center gap-2 rounded-2xl p-2', frozen ? 'bg-[#C0F5FF]/10 ring-1 ring-[#C0F5FF]/40' : 'bg-white/[0.04]')}>
              <Sigil kind={t.kind} seed={t.sigil} size={36} still />
              <span className="grid min-w-0 flex-1 leading-tight"><span className="truncate text-[13px] font-black">{enchantName(t)}</span>
                <span className="text-[10px] text-white/55">{frozen ? `❄️ frozen for ${dur((Date.parse(t.clock!.frozen_until!) - Date.now()) / 1000)}` : t.attention ?? 'ticking along'}{t.partner ? ` · 🧬 ${t.partner.hybrid}` : ''}</span></span>
              {frozen ? <Button size="sm" variant="ghost" onClick={() => void act('unfreeze', { target: t.id })} disabled={!!busy}>Thaw</Button> : <>
                {[15, 60].map((m) => <Button key={m} size="sm" variant="secondary" disabled={!!busy || charge < m} onClick={() => void forward(t.id, m)} data-testid={`clock-forward-${t.kind}-${m}`}>⏩ {m < 60 ? `${m}m` : '1h'}</Button>)}
                <Button size="sm" variant="secondary" disabled={!!busy || charge < 3 * Number(view.freeze_cost)} onClick={() => void freeze(t.id, 3)} data-testid={`clock-freeze-${t.kind}`}>❄️ 3h</Button>
              </>}
            </div>
          );
        }) : <p className="text-[12px] text-white/55">Your other enchantments will appear here.</p>}
      </div>
      <p className="text-center text-[11px] text-white/55">Fast-forward costs a minute of stored time per minute; freezing costs {view.freeze_cost} minutes an hour. Wound {v.stats?.winds ?? 0} turns in all.</p>
    </div>
  );
}
