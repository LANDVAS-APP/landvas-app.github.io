// 🦠 The Parasite: a glowing specimen tank. It looks like what it is — a pale larva, a tendrilled Parasite, or a
// leaf-crowned Symbiote with a beating heart. Release it and it leaps out of the tank onto a stranger's plot; a ring
// fills as it feeds; harvest it when it's fat. Evolutions are a show.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { dur } from '../kinds';
import { useNavigate } from 'react-router-dom';
import { toMap } from '../../lib/toMap';
import { cellCenter } from '../../shared/grid';
import { useWrapFx } from '../ParasiteWraps';

/** where it's wrapped: a little picture of the host plot with the parasite coiled all the way round it */
function WrapPreview({ stage, feeds }: { stage: number; feeds: number }) {
  const w = 2 + Math.min(10, feeds) * 0.9;
  const sym = stage >= 2;
  return (
    <svg viewBox="0 0 60 60" className="h-full w-full" aria-hidden>
      <defs><linearGradient id="pw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={sym ? '#3DDC97' : '#7CFF6B'} /><stop offset="1" stopColor={sym ? '#FFD23F' : '#B026FF'} /></linearGradient></defs>
      <rect x="14" y="14" width="32" height="32" rx="3" fill="#2B3B66" />
      <rect x="14" y="14" width="32" height="32" rx="4" fill="none" stroke="url(#pw)" strokeWidth={w} strokeDasharray="7 2" className="lv-coil" />
      {Array.from({ length: Math.min(8, feeds) }, (_, i) => <path key={i} d={`M${16 + (i % 4) * 9} ${i < 4 ? 15 : 45} q4 ${i < 4 ? 6 : -6} ${2 + (i % 3)} ${i < 4 ? 12 : -12}`} stroke={sym ? '#3DDC97' : '#B026FF'} strokeWidth="1" fill="none" opacity="0.7" />)}
      {sym && [0, 1, 2, 3].map((i) => <circle key={i} cx={[14, 46, 46, 14][i]} cy={[14, 14, 46, 46][i]} r="3" fill="#FF8FD0" />)}
      <circle cx="46" cy="14" r="3.5" fill="#fff" /><circle cx="46.6" cy="14.4" r="1.6" fill="#0B1F08" />
    </svg>
  );
}
import { ClipMomentButton, enchantRef, useKeepMoment } from '../../clips/ClipMoment';
import type { Moment } from '../../clips/moments';

const STAGES = [
  { name: 'Larva', c: '#E6FFB3', g: '#9BE15D', text: 'A hungry little thing. 3 feeds to grow.' },
  { name: 'Parasite', c: '#7CFF6B', g: '#B026FF', text: 'Tendrils out. 10 feeds in all to become something more.' },
  { name: 'Symbiote', c: '#3DDC97', g: '#FFD23F', text: 'It gives back now: its hosts share every meal and can’t shake it off.' },
];

function Creature({ stage, fat }: { stage: number; fat: number }) {
  const s = STAGES[stage] ?? STAGES[0];
  return (
    <svg viewBox="0 0 120 120" className="lv-wriggle w-full drop-shadow-[0_0_24px_rgba(124,255,107,0.55)]" aria-hidden>
      <defs><radialGradient id={`pz${stage}`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="0.35" stopColor={s.c} /><stop offset="1" stopColor={s.g} /></radialGradient></defs>
      {stage >= 1 && Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2; return <path key={i} d={`M60 62 Q${60 + Math.cos(a) * 40} ${62 + Math.sin(a) * 40} ${60 + Math.cos(a + 0.5) * 52} ${62 + Math.sin(a + 0.5) * 52}`} stroke={s.g} strokeWidth="4" strokeLinecap="round" fill="none" className="lv-sway" style={{ animationDelay: `${i * 0.2}s` }} />; })}
      {stage === 0
        ? <path d={`M20 70 Q35 ${50 - fat * 8} 50 66 Q65 ${48 - fat * 8} 80 66 Q95 ${50 - fat * 8} 104 68 Q100 84 60 84 Q20 86 20 70Z`} fill={`url(#pz${stage})`} />
        : <ellipse cx="60" cy="62" rx={30 + fat * 8} ry={26 + fat * 6} fill={`url(#pz${stage})`} />}
      {stage === 2 && <>
        <path d="M48 34 Q40 18 56 22 Q58 30 48 34Z M72 34 Q80 18 64 22 Q62 30 72 34Z" fill="#3DDC97" />
        <motion.path d="M60 70 C54 62 46 66 52 74 L60 82 L68 74 C74 66 66 62 60 70Z" fill="#FF4D6D" animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} style={{ transformOrigin: '60px 72px' }} />
      </>}
      <circle cx={stage === 0 ? 92 : 50} cy={stage === 0 ? 64 : 56} r="5" fill="#fff" /><circle cx={stage === 0 ? 93 : 51} cy={stage === 0 ? 64 : 57} r="2.5" fill="#0B1F08" />
      {stage >= 1 && <><circle cx="70" cy="56" r="5" fill="#fff" /><circle cx="71" cy="57" r="2.5" fill="#0B1F08" /></>}
    </svg>
  );
}

export function ParasiteScene({ v, view, act, busy, at }: SceneProps) {
  const keep = useKeepMoment();
  const [moment, setMoment] = useState<Moment | null>(null);
  const tank = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const showHost = () => {
    if (!view.host) return;
    const [lng, lat] = cellCenter(view.host.gx, view.host.gy);
    toMap(nav, { lng, lat, zoom: 19.4 });
  };
  const [leap, setLeap] = useState(false);
  const [evolved, setEvolved] = useState<number | null>(null);
  const readyIn = useLeft(view.ready_in, at);
  const restIn = useLeft(view.rest_in, at);
  const host = view.host;
  const stage = Number(view.stage);
  const fed = host ? Math.min(100, Number(view.fed) + ((Date.now() - at) / 1000 / (20 * 36))) : 0;
  const release = async () => {
    setLeap(true);
    const r = await act('release');
    if (!r) setLeap(false);
    else setTimeout(() => setLeap(false), 900);
  };
  const harvest = async () => {
    const r = await act('harvest', {}, { at: centerOf(tank.current) });
    if (r) useWrapFx.getState().pulseAt(v.id);
    if (r?.result?.evolved) {
      setEvolved(r.result.stage);
      const st = STAGES[Number(r.result.stage)] ?? STAGES[STAGES.length - 1];
      setMoment(keep({ type: 'evolve', e: enchantRef(v), stageName: st.name, color: st.c, text: st.text }));
      efx.burst({ ...centerOf(tank.current), colors: ['#7CFF6B', '#FFD23F', '#B026FF', '#fff'], count: 220, speed: 15, kind: 'spark' });
    }
  };
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'radial-gradient(circle at 50% 60%,#123A1A,#06140A 70%)' }} data-testid="parasite-scene">
        {/* the tank */}
        <div ref={tank} className="absolute left-1/2 top-[8%] h-[78%] w-[52%] -translate-x-1/2 overflow-hidden rounded-[40%_40%_18px_18px] border-4 border-[#A7F3D0]/40 bg-[linear-gradient(180deg,rgba(124,255,107,0.08),rgba(124,255,107,0.22))]">
          {Array.from({ length: 10 }, (_, i) => <span key={i} className="lv-smoke absolute bottom-0 h-2 w-2 rounded-full bg-[#A7F3D0]/60" style={{ left: `${10 + i * 8}%`, animationDelay: `${i * 0.25}s`, animationDuration: '3s' }} />)}
          <AnimatePresence>
            {!host && !leap && (
              <motion.div key="c" className="absolute inset-x-[12%] bottom-[16%]" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ y: -300, x: 200, rotate: 90, scale: 0.4, transition: { duration: 0.7, ease: 'easeIn' } }}>
                <Creature stage={stage} fat={0.2} />
              </motion.div>
            )}
          </AnimatePresence>
          {host && <div className="absolute inset-0 grid place-items-center text-center text-[12px] font-black text-[#A7F3D0]/70">the tank is empty —<br />it’s out feeding</div>}
          <div className="lv-glass pointer-events-none absolute inset-0 opacity-40" />
        </div>
        {/* where it is */}
        {host && (
          <motion.div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-2xl bg-black/55 p-2.5 backdrop-blur" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} data-testid="parasite-host">
            <div className="relative h-14 w-14 shrink-0">
              <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden><circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" /><circle cx="20" cy="20" r="17" fill="none" stroke="#7CFF6B" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(fed / 100) * 106.8} 106.8`} /></svg>
              <div className="absolute inset-[12%]"><WrapPreview stage={stage} feeds={Number(view.feeds)} /></div>
            </div>
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-[13px] font-black text-white">Feeding on @{host.owner_name}’s <span style={{ color: rarityInfo(host.rarity).color }}>{rarityInfo(host.rarity).name}</span> plot</span>
              <span className="text-[11px] text-white/60">{(readyIn ?? 0) > 0 ? `${Math.round(fed)}% fed · ready in ${dur(readyIn)}` : 'Fully fed!'}{host.welcomed ? ' · 💚 welcomed' : ''}</span>
            </div>
            <button onClick={showHost} className="shrink-0 rounded-full bg-[#7CFF6B] px-2.5 py-1.5 text-[11px] font-black text-[#0B1F08]" data-testid="parasite-show">📍 Show on map</button>
          </motion.div>
        )}
        <div className="absolute left-3 top-3 rounded-full bg-black/40 px-3 py-1 text-[12px] font-black backdrop-blur" style={{ color: STAGES[stage].c }} data-testid="parasite-stage">{STAGES[stage].name} · {view.feeds} feed{view.feeds === 1 ? '' : 's'}</div>
        <AnimatePresence>
          {evolved != null && (
            <motion.div key="e" role="button" onClick={() => setEvolved(null)} className="absolute inset-0 grid place-items-center bg-black/75 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="parasite-evolved">
              <motion.div initial={{ scale: 0.2, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 10 }} className="grid w-[60%] justify-items-center gap-2">
                <Creature stage={evolved} fat={0.6} />
                <span className="font-display text-3xl font-black" style={{ color: STAGES[evolved].c }}>It evolved: {STAGES[evolved].name}!</span>
                <span className="text-sm font-semibold text-white/80">{STAGES[evolved].text}</span>
                {moment && <ClipMomentButton moment={moment} />}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!host
        ? <Button variant="rainbow" onClick={() => void release()} disabled={!!busy || (restIn ?? 0) > 0} loading={busy === 'release'} data-testid="parasite-release">{(restIn ?? 0) > 0 ? `Resting · ${dur(restIn)}` : '🦠 Release it onto a host'}</Button>
        : <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button variant="rainbow" onClick={() => void harvest()} disabled={!!busy || (readyIn ?? 0) > 0} data-testid="parasite-harvest">{(readyIn ?? 0) > 0 ? `Feeding · ${dur(readyIn)}` : '🍽️ Harvest the meal'}</Button>
            <Button variant="ghost" onClick={() => void act('recall')} disabled={!!busy}>Recall</Button>
          </div>}
      <p className="text-center text-[11px] text-white/55">{STAGES[stage].text}{view.next_stage_at ? ` (${view.feeds}/${view.next_stage_at})` : ''} Shaken off {view.shaken} time{view.shaken === 1 ? '' : 's'}.</p>
    </div>
  );
}
