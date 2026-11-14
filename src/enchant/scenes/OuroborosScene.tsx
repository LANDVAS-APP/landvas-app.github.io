// 🐍 Ouroboros: a serpent ringed round one of your hybrids. Coil it around a splice and the splice loops instead of
// ending — each loop stronger, each loop likelier to bite through. Before a loop comes round, catch the tail: the head
// chases it round the ring (timed by the server's own clock) — tap as they touch to halve the risk. Break the circle to
// cash out, or hold on for seven loops and choose the Aberration it becomes.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../ui';
import { Sigil } from '../Sigil';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { ABERRATIONS, SPLICE_MODES, dur, kindInfo, type SpliceMode } from '../kinds';
import { HybridSigil, feel } from '../living';

const GRADE: Record<string, { c: string; t: string }> = {
  CLEAN: { c: '#3DDC97', t: 'CLEAN CATCH — risk halved' }, CLOSE: { c: '#FFD23F', t: 'CLOSE — risk down a quarter' }, MISS: { c: '#FF4D6D', t: 'MISSED — the tail slipped away' },
};
const pct = (x: number | null | undefined) => `${Math.round(Number(x ?? 0) * 100)}%`;

/** the serpent: a scaled ring with its tail at the top, and a head that goes round (driven from outside) */
function Serpent({ head, loops, closed, chasing }: { head: React.RefObject<SVGGElement | null>; loops: number; closed?: boolean; chasing?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="ouro-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9BF6C9" /><stop offset="0.5" stopColor="#3DDC97" /><stop offset="1" stopColor="#0E7C5A" /></linearGradient>
      </defs>
      {/* a ring of light for every loop that held */}
      {Array.from({ length: Math.min(7, loops) }, (_, i) => (
        <circle key={i} cx="100" cy="100" r={58 - i * 5} fill="none" stroke={closed ? '#FFD23F' : '#3DDC97'} strokeOpacity={0.25 + i * 0.08} strokeWidth="1.6" />
      ))}
      <g className={cn('lv-ouro-spin', closed && 'fast')} style={chasing ? { animation: 'none' } : undefined}>
        <circle cx="100" cy="100" r="78" fill="none" stroke="url(#ouro-g)" strokeWidth="15" />
        <circle cx="100" cy="100" r="78" fill="none" stroke="#03160F" strokeOpacity="0.45" strokeWidth="15" strokeDasharray="3 6" />
        <circle cx="100" cy="100" r="78" fill="none" stroke="#C9FFE6" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="1 8" />
        {/* the tail, at the top */}
        <g className="lv-ouro-tail"><path d="M100 14 L92 22 L100 30 Z" fill="#0E7C5A" stroke="#9BF6C9" strokeWidth="1.5" /><circle cx="100" cy="22" r="13" fill="none" stroke={chasing ? '#FFD23F' : 'transparent'} strokeWidth="2.5" strokeDasharray="3 3" /></g>
        {/* the head, chasing */}
        <g ref={head}>
          <g transform="translate(100 22)">
            <ellipse cx="0" cy="0" rx="13" ry="10" fill="#3DDC97" stroke="#03160F" strokeWidth="2" />
            <circle cx="5" cy="-4" r="2.6" fill="#FFD23F" /><circle cx="5" cy="4" r="2.6" fill="#FFD23F" />
            <path d="M12 0 L20 -3 M12 0 L20 3" stroke="#FF4D6D" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}

export function OuroborosScene({ v, view, act, busy, at }: SceneProps) {
  const head = useRef<SVGGElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const c = view.coil as any;
  const [chase, setChase] = useState<{ at: number; period: number; offset: number } | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [pickAb, setPickAb] = useState<string | null>(null);
  const nextIn = useLeft(c?.next_in ?? null, at);
  const shedIn = useLeft(view.shed_in || null, at);
  const restIn = useLeft(view.rest_in || null, at);
  const chooseIn = useLeft(c?.choose_in ?? null, at);
  const loops = Number(c?.loops ?? 0);

  // the head goes round: one lap per period, by the server's clock
  useEffect(() => {
    const g = head.current;
    if (!g) return;
    if (!chase) { g.style.transform = 'rotate(26deg)'; g.style.transformOrigin = '100px 100px'; return; }
    let raf = 0, lastBuzz = 0;
    const f = () => {
      const t = (Date.now() + chase.offset) / 1000 - chase.at;
      const deg = (t / chase.period) * 360;
      g.style.transformOrigin = '100px 100px';
      g.style.transform = `rotate(${deg}deg)`;
      const near = ((deg % 360) + 360) % 360;
      if ((near > 340 || near < 8) && t > chase.period * 0.6 && performance.now() - lastBuzz > chase.period * 700) { lastBuzz = performance.now(); feel('light'); }
      if (t > 20) { setChase(null); return; }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [chase]);

  const startChase = async () => {
    setGrade(null);
    const t0 = Date.now();
    const r = await act('chase', {}, { silent: true });
    if (!r) return;
    const rtt = (Date.now() - t0) / 2;
    setChase({ at: Number(r.result.chase.at), period: Number(r.result.period_ms) / 1000, offset: Number(r.result.server_time) * 1000 + rtt - Date.now() });
    feel('medium');
  };
  const catchIt = async () => {
    if (!chase) return;
    feel('heavy');
    const r = await act('catch', {}, { silent: true });
    setChase(null);
    if (!r) return;
    setGrade(r.result.grade);
    if (r.result.grade !== 'MISS') efx.burst({ ...centerOf(ring.current), colors: ['#3DDC97', '#9BF6C9', '#FFD23F', '#fff'], count: r.result.grade === 'CLEAN' ? 160 : 80, speed: 11, kind: 'spark' });
    feel(r.result.grade === 'MISS' ? 'heavy' : 'success');
  };
  const coil = async (row: number) => {
    const r = await act('coil', { row });
    if (r) { efx.burst({ ...centerOf(ring.current), colors: ['#3DDC97', '#0E7C5A', '#fff'], count: 140, speed: 10, kind: 'spark' }); feel('success'); }
  };
  const brk = async () => { const r = await act('break', {}, { at: centerOf(ring.current) }); if (r) feel('success'); };
  const choose = async (name: string) => {
    const r = await act('choose', { aberration: name }, { at: centerOf(ring.current) });
    if (r) { efx.burst({ ...centerOf(ring.current), colors: ['#FFD23F', '#FF5C8A', '#3DDC97', '#fff'], count: 320, speed: 16, kind: 'spark' }); feel('success'); setPickAb(null); }
  };

  const members: any[] = c?.members ?? [];
  const last = view.last as any;
  return (
    <div className="grid gap-3">
      <div ref={ring} className="lv-scene aspect-square w-full" style={{ background: 'radial-gradient(circle at 50% 50%,#0D3B2A,#03160F 72%)' }}
        onPointerDown={() => { if (chase) void catchIt(); }} data-testid="ouro-scene">
        <Serpent head={head} loops={loops} closed={c?.status === 'closed'} chasing={!!chase} />
        <div className="absolute inset-[26%] grid place-items-center text-center">
          {c ? (
            <div className="grid justify-items-center gap-1">
              {members.length >= 2 ? <HybridSigil a={members[0].kind} b={members[1].kind} c={members[2]?.kind} seedA={members[0].sigil} seedB={members[1].sigil} size={84} />
                : members[0] ? <Sigil kind={members[0].kind} seed={members[0].sigil} size={84} /> : <span className="text-5xl">🐍</span>}
              <div className="font-display text-[15px] font-black leading-tight text-[#9BF6C9]">{c.hybrid}</div>
              {c.status === 'closed' ? <div className="font-display text-[13px] font-black text-[#FFD23F]">THE CIRCLE IS CLOSED</div>
                : <div className="text-[11px] font-black text-white/70">Loop {loops}/7 · Traits ×{c.strength}</div>}
            </div>
          ) : shedIn ? (
            <div className="lv-ouro-shed grid justify-items-center gap-1"><span className="text-5xl">🐍</span><span className="text-[12px] font-black text-white/70">Shedding its skin<br />{dur(shedIn)}</span></div>
          ) : (
            <div className="grid justify-items-center gap-1"><span className="text-6xl">🐍</span><span className="text-[11px] font-bold text-white/60">Hungry for a splice</span></div>
          )}
        </div>
        {chase && <div className="pointer-events-none absolute inset-x-0 bottom-5 text-center font-display text-2xl font-black text-[#FFD23F] drop-shadow-[0_2px_0_#03160F]">TAP AS IT BITES ITS TAIL!</div>}
        <AnimatePresence>
          {grade && (
            <motion.div key={grade} className="lv-ouro-grade pointer-events-none absolute inset-x-6 top-5 rounded-2xl px-3 py-2 text-center font-display text-[15px] font-black text-[#03160F]"
              style={{ background: GRADE[grade]?.c }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="ouro-grade">{GRADE[grade]?.t}</motion.div>
          )}
        </AnimatePresence>
        {c && c.status === 'coiled' && (
          <div className="absolute left-3 top-3 grid gap-1">
            <span className="rounded-full bg-black/50 px-3 py-1 font-display text-[14px] font-black text-[#9BF6C9]" data-testid="ouro-bank">🏦 {Number(c.bank)} Ink banked</span>
            <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-black text-white/80">Loop {loops + 1} in {dur(nextIn)}</span>
          </div>
        )}
      </div>

      {/* the ladder: seven loops, the risk of each */}
      {c?.status === 'coiled' && (
        <div className="grid grid-cols-7 gap-1" data-testid="ouro-ladder">
          {(view.risks as number[]).map((r, i) => {
            const k = i + 1, done = k <= loops, next = k === loops + 1;
            return (
              <div key={k} className={cn('lv-ouro-pip', done ? 'bg-[#3DDC97] text-[#03160F]' : next ? 'bg-[#FFD23F] text-[#1A1200] ring-2 ring-white' : 'bg-white/[0.06] text-white/60')}
                title={`Loop ${k}: ${pct(r)} to bite`}>
                <span>{done ? '✓' : `${pct(next ? c.risk_next : r)}`}</span>
              </div>
            );
          })}
        </div>
      )}

      {c?.status === 'coiled' ? (
        <div className="grid gap-2">
          <div className="rounded-2xl bg-white/[0.05] p-3 text-[12.5px] text-white/85">
            <b className="text-[#9BF6C9]">Next loop:</b> {pct(c.risk_next)} chance it bites through{c.caught ? ` (caught: ${c.grade})` : ` — ${pct(c.risk_base / 2)} with a clean catch`}.
            {' '}If it holds: +{Number(c.bank_next)} Ink banked{loops + 1 === 2 || loops + 1 === 4 ? ` and its Traits go ×${loops + 1 >= 4 ? 3 : 2}` : ''}{loops + 1 === 7 ? ' — and the circle closes' : ''}.
            {c.steadied && <div className="mt-1 text-[11px] font-bold text-[#FFD23F]">🐉 It steadied an unstable Chimera — it won’t reject while coiled.</div>}
          </div>
          {chase ? <Button variant="rainbow" size="lg" onClick={() => void catchIt()} disabled={!!busy} data-testid="ouro-catch">🐍 CATCH!</Button>
            : <Button variant="rainbow" onClick={() => void startChase()} disabled={!!busy || c.caught} data-testid="ouro-chase">{c.caught ? `✓ Tail caught for loop ${loops + 1} (${c.grade})` : Number(c.risk_base) === 0 ? '🎯 Practise catching the tail (this loop always holds)' : '🎯 Catch the tail'}</Button>}
          <Button variant="secondary" onClick={() => void brk()} disabled={!!busy || !!chase} data-testid="ouro-break">💰 Break the circle · cash out {Number(c.bank)} Ink</Button>
          <p className="text-center text-[11px] text-white/50">A loop every {view.period_h} h. Breaking it pays what’s banked; the hybrid stays fused to the end of this loop. A bite loses the bank.</p>
        </div>
      ) : c?.status === 'closed' ? (
        <div className="grid gap-2" data-testid="ouro-choose">
          <div className="text-center text-[12px] font-black uppercase tracking-wider text-[#FFD23F]">Choose the Aberration it becomes{chooseIn ? ` · ${dur(chooseIn)} left` : ''}</div>
          <div className="grid grid-cols-2 gap-2">
            {(view.aberrations as string[]).map((name) => (
              <button key={name} onClick={() => { feel('light'); setPickAb(name); }} className={cn('grid gap-0.5 rounded-2xl p-2.5 text-left', pickAb === name ? 'bg-[#FF5C8A]/30 ring-2 ring-[#FFD1DE]' : 'bg-white/[0.05]')} data-testid="ouro-ab">
                <span className="text-[13px] font-black">{ABERRATIONS[name]?.emoji} {name}</span><span className="text-[10.5px] text-white/65">{ABERRATIONS[name]?.secret}</span>
              </button>
            ))}
          </div>
          <Button variant="rainbow" disabled={!pickAb || !!busy} onClick={() => pickAb && void choose(pickAb)} data-testid="ouro-choose-go">☣️ Make it {pickAb ?? '…'} · +{Math.round(Number(c.bank) * 1.5)} Ink</Button>
        </div>
      ) : (
        <div className="grid gap-2" data-testid="ouro-coilable">
          {last && (
            <div className={cn('rounded-2xl p-3 text-[12.5px]', last.end === 'bitten' ? 'bg-[#FF4D6D]/15 text-[#FFD1DE]' : last.end === 'closed' ? 'bg-[#FFD23F]/15 text-[#FFF3C9]' : 'bg-white/[0.05] text-white/80')}>
              {last.end === 'bitten' ? `💥 It bit through on loop ${Number(last.loops) + 1} — ${last.hybrid} snapped and ${last.lost} Ink was lost.`
                : last.end === 'closed' ? `☣️ The circle closed: ${last.hybrid} became ${last.aberration} (+${last.ink} Ink).`
                : last.end === 'broke' ? `💰 You broke the circle after ${last.loops} loop${Number(last.loops) === 1 ? '' : 's'} (+${last.ink} Ink).`
                : `🐍 The splice was separated — the circle broke after ${last.loops ?? 0} loops.`}
            </div>
          )}
          <div className="text-[12px] font-black uppercase tracking-wider text-white/60">{shedIn ? `Shedding its skin · ${dur(shedIn)}` : restIn ? `Digesting · coils again in ${dur(restIn)}` : 'Coil it around a splice'}</div>
          {(view.coilable as any[]).length ? (view.coilable as any[]).map((s) => (
            <div key={s.row} className="flex items-center gap-2 rounded-2xl bg-white/[0.05] p-2">
              {s.b === 'plot' ? <span className="text-2xl">{kindInfo(s.a).emoji}🏞️</span> : <HybridSigil a={s.a} b={s.b} seedA={s.a_sigil} seedB={s.b_sigil ?? 2} size={42} />}
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-[13px] font-black">{s.hybrid}</span>
                <span className="text-[10.5px] text-white/55">{SPLICE_MODES[s.mode as SpliceMode]?.emoji} {SPLICE_MODES[s.mode as SpliceMode]?.name ?? s.mode} · ends in {dur((Date.parse(s.ends_at) - Date.now()) / 1000)}{s.unstable ? ' · ⚠️ unstable' : ''}</span>
              </span>
              <Button size="sm" variant="rainbow" disabled={!!busy || !!shedIn || !!restIn || s.coiled} onClick={() => void coil(s.row)} data-testid="ouro-coil">{s.coiled ? 'Coiled' : '🐍 Coil'}</Button>
            </div>
          )) : <p className="text-[12px] text-white/55">Make a splice first (not a Graft) — then coil the serpent around it and it won’t have to end.</p>}
          <p className="text-center text-[11px] text-white/50">Each loop: stronger Traits, more Ink banked — and a likelier bite. Seven loops closes the circle: you choose the Aberration.</p>
        </div>
      )}
      <p className="text-center text-[11px] text-white/45">{Number(v.stats?.coils ?? 0)} coils · {Number(v.stats?.circles ?? 0)} circles closed · {Number(v.stats?.bites ?? 0)} bites</p>
    </div>
  );
}
