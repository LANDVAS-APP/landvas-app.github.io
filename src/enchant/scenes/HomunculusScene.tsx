// 🧫 Homunculus: a creature floating in an alchemist's flask, built out of your splices — every enchantment you splice
// drips in and grows it a part. Fill the flask and hold to wake it: it cracks the glass and walks out onto the map, from
// one of your plots to the next (the plot it stands on wears its parts). A week later it melts into a beating heart.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../backend/api';
import { qk } from '../../lib/queries';
import { toMap } from '../../lib/toMap';
import { cn } from '../../lib/utils';
import { cellCenter } from '../../shared/grid';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { HomunculusFigure, partName } from '../homunculus';
import { dur, kindInfo } from '../kinds';
import { feel } from '../living';
import { Radar } from '../sizeray';
import { MapPickButton, usePlotChoice } from '../pickers';

const HOLD_MS = 1600;
const FLASK = 'M48 6 h24 v34 Q112 64 104 112 Q96 152 60 154 Q24 152 16 112 Q8 64 48 40 Z';

export function HomunculusScene({ v, view, act, busy, at }: SceneProps) {
  const nav = useNavigate();
  const flask = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState(0);
  const [cracked, setCracked] = useState(false);
  const [leading, setLeading] = useState(false);
  const [keep, setKeep] = useState<string | null>(null);
  const timer = useRef<{ t0: number; raf: number; beat: number; done: number } | null>(null);
  const aw = view.awake as any;
  const left = useLeft(aw?.left ?? null, at);
  const moveIn = useLeft(aw?.next_move_in ?? null, at);
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots });
  const parts: any[] = view.parts ?? [];
  const melted = !!aw?.melted;
  const fill = Math.min(1, Number(view.weight) / Math.max(1, Number(view.need)));

  useEffect(() => () => { if (timer.current) { cancelAnimationFrame(timer.current.raf); clearInterval(timer.current.beat); clearTimeout(timer.current.done); } }, []);
  const holdStart = () => {
    if (!view.can_wake || busy) return;
    feel('medium');
    const t0 = performance.now();
    const beat = window.setInterval(() => { feel('medium'); setTimeout(() => feel('light'), 140); }, 420);
    // (the frames only draw the fill; the hold itself is timed, so a slow phone still wakes it on time)
    const f = () => {
      setHold(Math.min(1, (performance.now() - t0) / HOLD_MS));
      if (timer.current) timer.current.raf = requestAnimationFrame(f);
    };
    timer.current = { t0, raf: requestAnimationFrame(f), beat, done: window.setTimeout(() => holdEnd(true), HOLD_MS) };
  };
  const holdEnd = (done = false) => {
    if (!timer.current) return;
    cancelAnimationFrame(timer.current.raf); clearInterval(timer.current.beat); clearTimeout(timer.current.done); timer.current = null;
    setHold(0);
    if (done) void wake();
  };
  const wake = async () => {
    setCracked(true);
    feel('heavy');
    const r = await act('wake', {}, { silent: true });
    if (r) {
      efx.burst({ ...centerOf(flask.current), colors: ['#FF9AC8', '#8A3FFC', '#FFE8A3', '#fff'], count: 260, speed: 15, kind: 'spark' });
      efx.burst({ ...centerOf(flask.current), colors: ['#C0F5FF', '#fff'], count: 60, speed: 12, kind: 'glitter' });
      feel('success');
    }
    setTimeout(() => setCracked(false), 900);
  };
  const leadMap = usePlotChoice(v, 'lead', ((plots.data ?? []) as any[]), (p) => void lead(p), { title: 'Lead your Homunculus', emoji: '🧫', color: '#7CFF6B', hint: 'Tap the plot it should walk to (it stays 6 hours)' });
  const lead = async (p: { gx: number; gy: number }) => {
    const r = await act('lead', { gx: p.gx, gy: p.gy });
    if (r) { setLeading(false); feel('success'); }
  };
  const heart = async () => {
    const r = await act('heart', { keep: keep ?? parts[0]?.k }, { at: centerOf(flask.current) });
    if (r) { efx.burst({ ...centerOf(flask.current), colors: ['#FF4D6D', '#FF9AC8', '#FFD23F', '#fff'], count: 200, speed: 12, kind: 'spark' }); setKeep(null); }
  };
  const showOnMap = () => {
    if (!aw?.pos) return;
    const [lng, lat] = cellCenter(aw.pos[0], aw.pos[1]);
    toMap(nav, { lng, lat, zoom: 19 });
  };

  return (
    <div className="grid gap-3">
      <div ref={flask} className="lv-scene aspect-[4/3] w-full" style={{ background: 'radial-gradient(circle at 50% 35%,#3B1036,#12040F 72%)' }} data-testid="homu-scene">
        {/* shelves and jars */}
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full opacity-40" aria-hidden>
          <rect x="0" y="236" width="400" height="10" fill="#5A2A1A" /><rect x="22" y="196" width="26" height="40" rx="6" fill="#3DDC97" opacity="0.4" />
          <rect x="54" y="206" width="18" height="30" rx="5" fill="#FFD23F" opacity="0.35" /><rect x="330" y="190" width="30" height="46" rx="8" fill="#7DF9FF" opacity="0.35" />
          <circle cx="368" cy="226" r="10" fill="#FF4D6D" opacity="0.35" />
        </svg>
        {!aw ? (
          // in the flask
          <div className="absolute inset-0 grid place-items-center">
            <div className={cn('relative grid h-[88%] aspect-[3/4] place-items-center', cracked && 'lv-tremble')}>
              <svg viewBox="0 0 120 160" className="absolute inset-0 h-full w-full" aria-hidden>
                <defs><clipPath id={`hfl${v.id.slice(0, 6)}`}><path d={FLASK} /></clipPath></defs>
                <path d={FLASK} fill="rgba(255,220,240,0.06)" />
                <g clipPath={`url(#hfl${v.id.slice(0, 6)})`}>
                  <g className="lv-homu-liquid"><path d={`M-10 ${156 - fill * 92} Q30 ${148 - fill * 92} 60 ${156 - fill * 92} T130 ${156 - fill * 92} L130 170 L-10 170 Z`} fill="#FF9AC8" opacity="0.34" /></g>
                </g>
                <path d={FLASK} fill="none" stroke="rgba(255,230,245,0.7)" strokeWidth="3" />
                <path d="M30 70 Q22 100 30 130" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" strokeLinecap="round" />
                <rect x="44" y="2" width="32" height="8" rx="3" fill="#8B5E34" />
                {cracked && <path d="M40 60 L52 78 L46 96 L60 112 M84 58 L74 80 L82 100" stroke="#fff" strokeWidth="2" fill="none" />}
              </svg>
              {Array.from({ length: 5 }, (_, i) => <span key={i} className="lv-homu-bub" style={{ left: `${26 + i * 12}%`, animationDelay: `${i * 0.6}s` }} />)}
              <motion.div className="relative mt-[30%] w-[62%]" animate={{ y: [0, -6, 0], rotate: [-3, 3, -3] }} transition={{ repeat: Infinity, duration: 4 }}>
                <HomunculusFigure parts={parts} size="100%" asleep={!view.can_wake} id={`hf${v.id.slice(0, 6)}`} />
              </motion.div>
            </div>
            <div className="absolute left-3 top-3 grid gap-1">
              <span className="rounded-full bg-black/50 px-3 py-1 font-display text-[14px] font-black text-[#FF9AC8]" data-testid="homu-fill">🧪 {view.can_wake ? 'Full — ready to wake!' : `${view.weight}/${view.need} to wake`}</span>
              <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-black text-white/75">Generation {view.gen}{view.galvanized ? ' · ⚡ galvanized' : ''}</span>
            </div>
          </div>
        ) : melted ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="grid justify-items-center gap-2">
              <div className="lv-homu-heart text-7xl drop-shadow-[0_0_24px_#FF4D6D]">❤️</div>
              <div className="h-4 w-40 rounded-[50%] bg-[#FF9AC8]/40" />
              <div className="font-display text-xl font-black text-[#FFD1E8]">Its week is up — it melted into a heart</div>
            </div>
          </div>
        ) : (
          // out walking
          <div className="absolute inset-0">
            <div className="absolute inset-x-0 bottom-[14%] flex justify-center gap-1.5 opacity-70">
              {Array.from({ length: 7 }, (_, i) => <span key={i} className="h-7 w-10 rounded-md border border-white/20" style={{ background: i === 3 ? 'rgba(255,154,200,0.35)' : 'rgba(255,255,255,0.05)' }} />)}
            </div>
            <div className="absolute bottom-[19%] left-1/2 w-[34%] -translate-x-1/2"><HomunculusFigure parts={parts} size="100%" walking id={`hw${v.id.slice(0, 6)}`} /></div>
            <div className="absolute left-3 top-3 grid gap-1">
              <span className="rounded-full bg-black/50 px-3 py-1 font-display text-[14px] font-black text-[#FFE8A3]" data-testid="homu-boost">🎮 Its plot’s games ×{Number(view.mult).toFixed(2)}</span>
              <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-black text-white/75">{aw.led ? 'Led here' : 'Moves on'} in {dur(moveIn)} · {dur(left)} left</span>
              <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-black text-white/75">👋 Greeted {aw.greets} time{aw.greets === 1 ? '' : 's'}</span>
            </div>
          </div>
        )}
      </div>

      {/* its parts */}
      <div className="grid gap-1.5" data-testid="homu-parts">
        <div className="flex items-center justify-between text-[12px] font-black uppercase tracking-wider text-white/60"><span>Its parts ({parts.length}/{view.max_parts})</span><span className="text-[#FF9AC8]">×{Number(view.mult).toFixed(2)} where it stands</span></div>
        {parts.length ? (
          <div className="flex flex-wrap gap-1.5">
            {parts.map((p) => {
              const k = kindInfo(p.k);
              return (
                <button key={p.k} onClick={() => melted && setKeep(p.k)} className={cn('rounded-full px-2.5 py-1 text-[11px] font-black', p.glow ? 'bg-[linear-gradient(90deg,#FF5CDB,#FFD23F)] text-[#22061A]' : 'bg-white/[0.07] text-white/85',
                  melted && (keep ?? parts[0]?.k) === p.k && 'ring-2 ring-white')} title={p.from ? `From ${p.from}` : undefined} data-testid="homu-part">
                  {k.emoji} {partName(p.k)}{Number(p.lv) > 1 ? ` · lv ${p.lv}` : ''}{p.glow ? ' ✨' : ''}{p.heir ? ' · heirloom' : ''}
                </button>
              );
            })}
          </div>
        ) : <p className="text-[12px] text-white/55">The flask is empty. Every splice you make drips in and grows it a part — one for each enchantment in the splice.</p>}
      </div>

      {!aw ? (
        <>
          <button className={cn('lv-homu-hold rounded-2xl px-4 py-3.5 font-display text-[17px] font-black', view.can_wake ? 'bg-[linear-gradient(135deg,#FF9AC8,#8A3FFC)] text-white' : 'bg-white/[0.06] text-white/45')}
            style={{ ['--p' as string]: hold, touchAction: 'none' }} disabled={!view.can_wake || !!busy}
            onPointerDown={holdStart} onPointerUp={() => holdEnd()} onPointerLeave={() => holdEnd()} onPointerCancel={() => holdEnd()} data-testid="homu-wake">
            {view.can_wake ? (hold > 0 ? '💓 Keep holding…' : '💓 Hold to wake it') : `Needs ${Number(view.need) - Number(view.weight)} more to wake — splice something`}
          </button>
          <p className="text-center text-[11px] text-white/50">A part counts 1; an Aberration’s glowing parts count 2. {view.galvanized ? 'Spliced with a Storm Coil, it needs one less.' : 'Splice it with a Storm Coil and it needs one less.'}</p>
        </>
      ) : melted ? (
        <>
          <p className="text-center text-[12px] text-white/70">Pick the part it keeps for the next one, then collect its heart: Ink, Enchanted Luck and a spare Splice charge.</p>
          <Button variant="rainbow" disabled={!!busy} onClick={() => void heart()} data-testid="homu-heart">❤️ Collect the heart · keep {partName(keep ?? parts[0]?.k ?? '')}</Button>
        </>
      ) : (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={showOnMap} disabled={!aw.pos} data-testid="homu-map">📍 Show it on the map</Button>
            <Button variant="secondary" onClick={() => setLeading((x) => !x)} disabled={!!busy || Number(aw.leads_left) < 1} data-testid="homu-lead">🫱 Lead it ({aw.leads_left} left today)</Button>
          </div>
          <AnimatePresence>
            {leading && (
              <motion.div className="grid gap-2" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <p className="text-[12px] text-white/65">Pick one of your plots — it walks there and stays 6 hours (lead it to the plot whose games you’ll play).</p>
                {leadMap.canMap && <MapPickButton className="w-fit" onClick={leadMap.toMap} testId="homu-lead-map" label="Lead it on the map" />}
                <Radar plots={(plots.data ?? []) as any[]} picked={aw.pos ? { gx: aw.pos[0], gy: aw.pos[1] } : null} onPick={(p) => void lead(p)} />
              </motion.div>
            )}
          </AnimatePresence>
          {aw.pos && <p className="text-center text-[11px] text-white/50">It’s standing on your plot at {aw.pos[0]}, {aw.pos[1]} — play that plot’s minigames while it’s there.</p>}
        </div>
      )}
      <p className="text-center text-[11px] text-white/45">{Number(v.stats?.wakes ?? 0)} woken · {Number(v.stats?.hearts ?? 0)} hearts · {Number(v.stats?.boosts ?? 0)} games boosted</p>
    </div>
  );
}
