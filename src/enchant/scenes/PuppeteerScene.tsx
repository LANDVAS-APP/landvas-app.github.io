// 🎭 Puppeteer: a little theatre. The curtains part on a marionette dancing from a wooden cross; its strings are the
// strings you hold (up to ten; one comes back every hour). The show: a playlist of plots — yours or anyone's in reach —
// and the puppet plays their minigames by itself, live on the stage below: each string is ten levels in a row. You
// never play by hand here: you pick the plots and watch. Every kind of game joins your repertoire.
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useUi } from '../../lib/store';
import { GAME_INFO, type GameId } from '../../shared/minigames';
import { useLeft, type SceneProps } from '../core';
import { dur } from '../kinds';
import { PuppetTheatre } from '../puppet/PuppetTheatre';
import { gameName } from '../puppet/names';

function Marionette({ strings, pull }: { strings: number; pull: number }) {
  return (
    <svg viewBox="0 0 160 200" className="h-full w-full overflow-visible" aria-hidden>
      <defs><linearGradient id="pup-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5C3A1E" /><stop offset="0.5" stopColor="#A06B3C" /><stop offset="1" stopColor="#5C3A1E" /></linearGradient></defs>
      <g className="lvx-cross">
        <rect x="40" y="14" width="80" height="8" rx="3" fill="url(#pup-wood)" />
        <rect x="76" y="2" width="8" height="40" rx="3" fill="url(#pup-wood)" />
        {/* the strings: the ones you hold glow */}
        {[[44, 18, 52, 108], [116, 18, 108, 108], [80, 38, 80, 64], [60, 18, 66, 150], [100, 18, 94, 150]].map(([x1, y1, x2, y2], i) => (
          <motion.line key={i} x1={x1} y1={y1} x2={x2} y2={y2 + (i === 0 || i === 1 ? -pull * 14 : 0)} className="lvx-thread" stroke={i < strings ? '#FFE8A3' : 'rgba(255,255,255,0.25)'} strokeWidth={i < strings ? 1.4 : 0.8}
            style={{ filter: i < strings ? 'drop-shadow(0 0 3px #FFD166)' : undefined }} />
        ))}
      </g>
      <g className="lvx-puppet" style={{ transformOrigin: '80px 64px' }}>
        <circle cx="80" cy="76" r="13" fill="#F2C9A0" stroke="#3A1F0E" strokeWidth="1.5" />
        <path d="M68 70 Q80 56 92 70" fill="#E63946" />
        <circle cx="75" cy="76" r="1.8" fill="#2A0509" /><circle cx="85" cy="76" r="1.8" fill="#2A0509" />
        <path d="M74 82 Q80 86 86 82" stroke="#2A0509" strokeWidth="1.4" fill="none" />
        <path d="M66 92 L94 92 L100 132 L60 132 Z" fill="#E63946" stroke="#2A0509" strokeWidth="1.5" />
        <path d="M66 92 L94 92 L90 104 L70 104 Z" fill="#FFB703" />
        <motion.path d={`M66 96 L${52} ${108 - pull * 14}`} stroke="#F2C9A0" strokeWidth="6" strokeLinecap="round" />
        <motion.path d={`M94 96 L${108} ${108 - pull * 14}`} stroke="#F2C9A0" strokeWidth="6" strokeLinecap="round" />
        <path d="M72 132 L66 152 M88 132 L94 152" stroke="#2A0509" strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function PuppeteerScene(props: SceneProps) {
  const { v, view, at } = props;
  const [opening, setOpening] = useState(true);
  const reduce = useUi((s) => s.settings.reduceMotion);
  const nextIn = useLeft(view.next_in, at);
  const strings = Number(view.strings ?? 0), max = Number(view.max ?? 10);
  const rep: Record<string, number> = view.repertoire ?? {};
  // (the marionette dances while a show is on)
  const playing = !!view.show?.on && (view.runs?.length ?? 0) > 0;
  useEffect(() => { const t = setTimeout(() => setOpening(false), reduce ? 0 : 200); return () => clearTimeout(t); }, [reduce]);

  return (
    <div className="grid gap-3">
      <div className="lvx-stage lv-scene aspect-[4/3] w-full" data-testid="puppeteer-scene">
        <div className="lvx-theatre" />
        <div className="lvx-spot" />
        {/* the stage floor */}
        <div className="absolute inset-x-[6%] bottom-0 h-[16%] rounded-t-[40%] bg-[linear-gradient(180deg,#5C3A1E,#2A1808)] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]" />
        <div className="absolute bottom-[10%] left-1/2 h-[80%] w-[46%] -translate-x-1/2"><Marionette strings={Math.min(5, strings)} pull={playing ? 1 : 0} /></div>
        <motion.div className="lvx-curtain l" initial={{ scaleX: 1 }} animate={{ scaleX: opening ? 1 : 0.28 }} transition={{ duration: 1.1, ease: [0.6, 0, 0.2, 1] }} />
        <motion.div className="lvx-curtain r" initial={{ scaleX: 1 }} animate={{ scaleX: opening ? 1 : 0.28 }} transition={{ duration: 1.1, ease: [0.6, 0, 0.2, 1] }} />
        <div className="lvx-valance" />
        <div className="absolute left-3 top-[14%] z-[4] flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1" data-testid="puppeteer-strings">
          <span className="text-[13px] font-black text-[#FFE8A3]">🧵 {strings}/{max}</span>
          {strings < max && nextIn != null && <span className="text-[10px] font-bold text-white/70">+1 in {dur(nextIn)}</span>}
        </div>
        {view.grand_ready && <div className="absolute right-3 top-[14%] z-[4] rounded-full bg-[#FFB703] px-2.5 py-1 text-[11px] font-black text-[#2A0509]">🎪 Grand Show ready · ×{(v.stars ?? 0) >= 5 ? 5 : 3}</div>}
        {view.show?.on && <div className="absolute inset-x-0 bottom-[2%] z-[4] text-center text-[11px] font-black text-[#FFE8A3]">● the show is on — the puppet plays by itself</div>}
        <div className="lvx-grain" />
      </div>

      <PuppetTheatre {...props} />

      <div className="grid gap-1.5">
        <div className="lvx-label">Repertoire · {Object.keys(rep).length} of {Object.keys(GAME_INFO).length} games</div>
        <div className="grid grid-cols-4 gap-1.5" data-testid="puppeteer-repertoire">
          {(Object.keys(GAME_INFO) as GameId[]).map((g) => (
            <div key={g} className="grid justify-items-center gap-0.5 rounded-xl p-1.5 text-center" style={{ background: rep[g] ? 'rgba(255,183,3,0.15)' : 'rgba(255,255,255,0.04)' }}>
              <span className="text-[18px]" style={{ opacity: rep[g] ? 1 : 0.3 }}>🎭</span>
              <span className="text-[10px] font-black leading-tight text-white/80">{gameName(g)}</span>
              <span className="text-[10px] font-bold text-white/50">{rep[g] ? `best ${rep[g]}` : '—'}</span>
            </div>
          ))}
        </div>
      </div>
      {(view.shows ?? []).length > 0 && (
        <div className="grid gap-1">
          <div className="lvx-label">Last shows</div>
          {(view.shows as any[]).map((s, i) => <div key={i} className="flex items-center gap-2 text-[12px] text-white/75"><span>{s.passed ? '👏' : '🪢'}</span><span className="flex-1">{gameName(s.game)} · level {s.level}{s.ink ? ` · +${s.ink} Ink` : ''}{s.tip ? ` · tipped ${s.tip}` : ''}</span></div>)}
        </div>
      )}
      <p className="text-center text-[11px] text-white/55">Someone else’s plot: its owner is tipped for every level your puppet clears there, and told.</p>
    </div>
  );
}
