// 🎭 Puppeteer: a little theatre. The curtains part on a marionette dancing from a wooden cross; its strings are the
// strings you hold (one comes back every hour). The show: a playlist of plots — yours or anyone's in reach — and the
// puppet plays their minigames by itself, live on the stage below, one string an act. Or pull the strings yourself:
// pick someone else's plot and the game screen opens on it, on strings. Every kind of game joins your repertoire.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUi } from '../../lib/store';
import { GAME_INFO, type GameId } from '../../shared/minigames';
import { Button } from '../../ui';
import { useLeft, type SceneProps } from '../core';
import { PlotRow, type PlotLite } from '../craft';
import { dur } from '../kinds';
import { feel } from '../living';
import { usePickOnMapFor } from '../PlotPickOverlay';
import { pickedFor, usePlotPick } from '../plotPick';
import { PuppetTheatre } from '../puppet/PuppetTheatre';

const gameName = (g: string) => (GAME_INFO as Record<string, { name: string }>)[g]?.name ?? g;

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
  const { v, view, busy, at, mirror } = props;
  const nav = useNavigate();
  const pickOnMap = usePickOnMapFor();
  const [sel, setSel] = useState<PlotLite & { game?: string; m?: number } | null>(null);
  const [opening, setOpening] = useState(true);
  const [pull, setPull] = useState(0);
  const reduce = useUi((s) => s.settings.reduceMotion);
  const nextIn = useLeft(view.next_in, at);
  const strings = Number(view.strings ?? 0), max = Number(view.max ?? 2);
  const near: (PlotLite & { game: string; m: number })[] = view.nearby ?? [];
  const rep: Record<string, number> = view.repertoire ?? {};
  useEffect(() => { const t = setTimeout(() => setOpening(false), reduce ? 0 : 200); return () => clearTimeout(t); }, [reduce]);
  // a plot picked on the map
  useEffect(() => {
    const d = pickedFor(v.id, 'puppet');
    if (!d) return;
    usePlotPick.getState().clear();
    const p = near.find((x) => x.gx === d.plot.gx && x.gy === d.plot.gy);
    if (p) setSel(p);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    if (!sel) return;
    setPull(1); feel('heavy');
    await new Promise((r) => setTimeout(r, reduce ? 0 : 520));
    nav(`/play/${sel.game}?gx=${sel.gx}&gy=${sel.gy}&puppet=${v.id}`);
  };
  const onMap = () => pickOnMap({ id: v.id, slot: 'puppet', title: 'Pull someone’s strings', emoji: '🎭', color: '#FFB703', back: `/grimoire/${v.id}`,
    hint: 'Pick another player’s plot in the crosshairs', allowed: near.map((p) => ({ gx: p.gx, gy: p.gy, rarity: p.rarity, name: p.name, plot_type: p.plot_type, note: `@${p.owner_name} · ${gameName(p.game)}` })) });

  return (
    <div className="grid gap-3">
      <div className="lvx-stage lv-scene aspect-[4/3] w-full" data-testid="puppeteer-scene">
        <div className="lvx-theatre" />
        <div className="lvx-spot" />
        {/* the stage floor */}
        <div className="absolute inset-x-[6%] bottom-0 h-[16%] rounded-t-[40%] bg-[linear-gradient(180deg,#5C3A1E,#2A1808)] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]" />
        <div className="absolute bottom-[10%] left-1/2 h-[80%] w-[46%] -translate-x-1/2"><Marionette strings={strings} pull={pull} /></div>
        <motion.div className="lvx-curtain l" initial={{ scaleX: 1 }} animate={{ scaleX: opening ? 1 : 0.28 }} transition={{ duration: 1.1, ease: [0.6, 0, 0.2, 1] }} />
        <motion.div className="lvx-curtain r" initial={{ scaleX: 1 }} animate={{ scaleX: opening ? 1 : 0.28 }} transition={{ duration: 1.1, ease: [0.6, 0, 0.2, 1] }} />
        <div className="lvx-valance" />
        <div className="absolute left-3 top-[14%] z-[4] flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1" data-testid="puppeteer-strings">
          {Array.from({ length: max }, (_, i) => <span key={i} className="text-[13px]" style={{ opacity: i < strings ? 1 : 0.3 }}>🧵</span>)}
          {strings < max && nextIn != null && <span className="ml-1 text-[10px] font-bold text-white/70">+1 in {dur(nextIn)}</span>}
        </div>
        {view.grand_ready && <div className="absolute right-3 top-[14%] z-[4] rounded-full bg-[#FFB703] px-2.5 py-1 text-[11px] font-black text-[#2A0509]">🎪 Grand Show ready · ×{(v.stars ?? 0) >= 5 ? 5 : 3}</div>}
        {view.show?.on && <div className="absolute inset-x-0 bottom-[2%] z-[4] text-center text-[11px] font-black text-[#FFE8A3]">● the show is on</div>}
        <AnimatePresence>
          {sel && (
            <motion.div className="absolute inset-x-4 bottom-[18%] z-[4] rounded-2xl bg-[#2A0509]/90 p-2.5 text-center" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-[13px] font-black text-white">@{sel.owner_name}’s plot · {gameName(sel.game!)}</div>
              <div className="text-[11px] text-white/60">{sel.m != null ? `${(sel.m / 1000).toFixed(1)} km away` : ''}{rep[sel.game!] ? ` · your best ${rep[sel.game!]}` : ' · new to your repertoire'}</div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="lvx-grain" />
      </div>

      {!mirror ? <PuppetTheatre {...props} /> : (
        <p className="rounded-2xl bg-white/[0.05] px-3 py-2 text-center text-[12px] text-white/75" data-testid="puppet-mirror-note">🪞 A reflection pulls the strings by hand, below — a show that plays by itself needs a Puppeteer of your own.</p>
      )}

      <div className="lvx-label mt-1">Or pull the strings yourself — play someone else’s plot on the game screen</div>
      {(view.medley || view.grand_ready) && (
        <div className="rounded-2xl border border-[#FFB703]/50 bg-[linear-gradient(90deg,#E6394622,#FFB70322)] px-3 py-2 text-[12.5px] font-black text-[#FFE8A3]" data-testid="puppeteer-grand">
          🎪 {view.medley ? `The Grand Show is on: ${view.medley.left} more act${view.medley.left === 1 ? '' : 's'} — each on a different plot, ×3, no strings` : 'Grand Show ready: today’s first pull starts a three-plot medley — every act ×3, no strings'}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="rainbow" size="lg" className="flex-1" onClick={() => void go()} disabled={!!busy || !sel || (strings < 1 && !view.grand_ready && !view.medley)} data-testid="puppeteer-pull">
          {strings < 1 && !view.medley && !view.grand_ready ? `No strings · +1 in ${dur(nextIn)}` : sel ? (view.medley || view.grand_ready ? '🎪 Start the act' : '🎭 Pull the strings') : 'Pick a plot to play'}
        </Button>
        <Button size="lg" variant="ghost" onClick={onMap} disabled={!near.length} data-testid="puppeteer-map">🗺️ Pick on the map</Button>
      </div>

      <div className="grid gap-1.5">
        <div className="lvx-label">Other players’ plots nearby{view.range_m ? ` · within ${Math.round(view.range_m / 1000)} km` : ' · anywhere'}</div>
        <div className="grid max-h-[260px] gap-1.5 overflow-y-auto pr-1" data-testid="puppeteer-nearby">
          {near.length ? near.map((p) => (
            <PlotRow key={`${p.gx},${p.gy}`} p={p} on={sel?.gx === p.gx && sel?.gy === p.gy} onClick={() => setSel(p)} testId="puppeteer-plot"
              right={<span className="text-right text-[11px] font-black leading-tight text-[#FFB703]">{gameName(p.game)}<br /><span className="text-white/50">{(p.m / 1000).toFixed(1)} km</span></span>} />
          )) : <p className="text-[12px] text-white/60">No one else’s plots nearby yet — walk somewhere busier, or try again later.</p>}
        </div>
      </div>

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
      <p className="text-center text-[11px] text-white/55">The owner is tipped and told. Runs you play yourself count toward your daily wins.</p>
    </div>
  );
}
