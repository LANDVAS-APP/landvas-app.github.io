// 🦠 The Parasite: a glowing specimen tank. It looks like what it is — a pale larva, a tendrilled Parasite, or a
// leaf-crowned Symbiote with a beating heart. Release it and it leaps out of the tank onto a stranger's plot; a ring
// fills as it feeds; harvest it when it's fat. Evolutions are a show.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { rarityInfo } from '../../shared/rarity';
import { PlayerAvatar, Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { dur } from '../kinds';

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

export function ParasiteScene({ view, act, busy, at }: SceneProps) {
  const tank = useRef<HTMLDivElement>(null);
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
    if (r?.result?.evolved) {
      setEvolved(r.result.stage);
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
              <div className="absolute inset-[18%]"><Creature stage={stage} fat={fed / 100} /></div>
            </div>
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-[13px] font-black text-white">Feeding on @{host.owner_name}’s <span style={{ color: rarityInfo(host.rarity).color }}>{rarityInfo(host.rarity).name}</span> plot</span>
              <span className="text-[11px] text-white/60">{(readyIn ?? 0) > 0 ? `${Math.round(fed)}% fed · ready in ${dur(readyIn)}` : 'Fully fed!'}{host.welcomed ? ' · 💚 welcomed' : ''}</span>
            </div>
            <PlayerAvatar p={{ username: host.owner_name, avatar_seed: host.owner_name, avatar_style: 'prism', accent_color: '#7CFF6B' } as never} size={34} />
          </motion.div>
        )}
        <div className="absolute left-3 top-3 rounded-full bg-black/40 px-3 py-1 text-[12px] font-black backdrop-blur" style={{ color: STAGES[stage].c }} data-testid="parasite-stage">{STAGES[stage].name} · {view.feeds} feed{view.feeds === 1 ? '' : 's'}</div>
        <AnimatePresence>
          {evolved != null && (
            <motion.button key="e" onClick={() => setEvolved(null)} className="absolute inset-0 grid place-items-center bg-black/75 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="parasite-evolved">
              <motion.div initial={{ scale: 0.2, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 10 }} className="grid w-[60%] justify-items-center gap-2">
                <Creature stage={evolved} fat={0.6} />
                <span className="font-display text-3xl font-black" style={{ color: STAGES[evolved].c }}>It evolved: {STAGES[evolved].name}!</span>
                <span className="text-sm font-semibold text-white/80">{STAGES[evolved].text}</span>
              </motion.div>
            </motion.button>
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
