// The Traits you use with your hands (part 10): crack a Golden egg, open a Chaos box, link a second plot, choose what
// Divining aims at — and what every other Trait has been doing, in a line.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import type { EnchantView } from '../backend/api';
import { Button } from '../ui';
import { centerOf, efx, type useAct } from './core';
import { plotName } from './craft';
import { dur } from './kinds';
import { feel } from './living';
import { useMyPlotsLite } from './myPlots';
import { MapPickButton, usePlotChoice } from './pickers';

type Act = ReturnType<typeof useAct>['act'];
type T = NonNullable<EnchantView['traits']>;

/** 🪿 Golden: tap the egg — it cracks, and out comes a free charge */
export function GoldenEggs({ g, act, busy }: { g: NonNullable<T['golden']>; act: Act; busy: string | null }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [out, setOut] = useState<any>(null);
  const [cracking, setCracking] = useState(false);
  const crack = async () => {
    setCracking(true); feel('medium');
    await new Promise((r) => setTimeout(r, 520));
    const r = await act('trait_egg', {}, { silent: true });
    setCracking(false);
    if (!r?.result?.cracked) return;
    setOut(r.result); feel('success');
    efx.burst({ ...centerOf(ref.current), colors: ['#FFD23F', '#FFF4B8', '#FF9F1C', '#fff'], count: 140, speed: 11, kind: 'spark' });
    if (r.result.spark) efx.burst({ ...centerOf(ref.current), colors: ['#00F5D4'], count: 12, speed: 7, kind: 'emoji', emojis: ['⚡', '🧪'] });
  };
  return (
    <div className="grid gap-1.5 rounded-xl border border-[#FFD23F]/40 bg-[#FFD23F]/10 p-2" data-testid="ench-golden">
      <div className="flex items-center gap-3">
        <motion.button ref={ref} type="button" className="relative grid h-14 w-12 place-items-center" disabled={!!busy || g.left < 1} onClick={() => void crack()}
          animate={cracking ? { rotate: [0, -12, 12, -8, 8, 0] } : { y: [0, -3, 0] }} transition={cracking ? { duration: 0.5 } : { duration: 2.2, repeat: Infinity }} data-testid="ench-golden-egg">
          <span className="lv-gold-egg" />{cracking && <span className="lv-gold-crack" />}
        </motion.button>
        <div className="min-w-0 flex-1 text-[11.5px] font-bold text-white/85">
          {out ? <>Cracked! Out came <b className="text-[#FFE89A]">{out.what}</b>{out.spark ? ' — and a Splice spark ⚡' : ''}.</>
            : g.left > 0 ? <>{g.left} golden egg{g.left > 1 ? 's' : ''} today. Tap to crack it: {g.refills ? 'a free charge of what it does' : 'a little Ink'}.</> : <>No golden eggs left today — {g.k > 1 ? `${g.k} more` : 'one more'} tomorrow.</>}
        </div>
      </div>
      {g.cracked > 0 && <div className="text-[10.5px] font-bold text-white/50">{g.cracked} cracked so far</div>}
    </div>
  );
}

/** 🏺 Chaos: lift the tiny lid and see what jumps out */
export function ChaosBox({ c, act, busy }: { c: NonNullable<T['chaos']>; act: Act; busy: string | null }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [out, setOut] = useState<any>(null);
  const open = async () => {
    feel('medium');
    const r = await act('trait_box', {}, { silent: true });
    if (!r?.result) return;
    setOut(r.result);
    feel(r.result.good ? 'success' : 'heavy');
    efx.burst({ ...centerOf(ref.current), colors: r.result.good ? ['#FF4D6D', '#FFD23F', '#fff'] : ['#2A0A3D', '#7A3AA8'], count: r.result.good ? 110 : 60, speed: 9, kind: 'spark' });
  };
  return (
    <div className="grid gap-1.5 rounded-xl border border-[#FF4D6D]/40 bg-[#FF4D6D]/10 p-2" data-testid="ench-chaos">
      <div className="flex items-center gap-3">
        <motion.button ref={ref} type="button" whileTap={{ scale: 0.9 }} className="relative grid h-12 w-12 place-items-center text-[30px]" disabled={!!busy || c.left < 1} onClick={() => void open()} data-testid="ench-chaos-open">
          <AnimatePresence mode="wait"><motion.span key={out ? 'open' : 'shut'} initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }}>{out ? (out.good ? '🎁' : out.dodged ? '🛡️' : '😵') : '🏺'}</motion.span></AnimatePresence>
        </motion.button>
        <div className="min-w-0 flex-1 text-[11.5px] font-bold text-white/85">
          {out ? (out.good ? <>Out jumped: <b className="text-[#FFC2CE]">{out.label}</b>.</> : out.dodged ? <>A hiccup — but it saw it coming and dodged.</> : <>A hiccup! Its clock stopped for an hour.</>)
            : c.left > 0 ? <>{c.left} chaos box{c.left > 1 ? 'es' : ''} today: 70% a free chore, 30% a hiccup.</> : <>No boxes left today.</>}
        </div>
      </div>
    </div>
  );
}

/** 🌀 Linked: pick its second plot (on the map, or the list) */
export function LinkPlot({ v, l, act, busy }: { v: EnchantView; l: NonNullable<T['linked']>; act: Act; busy: string | null }) {
  const plots = useMyPlotsLite().filter((p) => !(p.gx === v.gx && p.gy === v.gy));
  const pick = usePlotChoice(v, 'link', plots, (p) => void act('trait_link', { gx: p.gx, gy: p.gy }),
    { title: 'Link a second plot', emoji: '🌀', color: '#7B5CFF', hint: 'Tap one of your plots in crosshairs — it works from there too' });
  const linked = l.plot ? plots.find((p) => p.gx === l.plot![0] && p.gy === l.plot![1]) : null;
  return (
    <div className="grid gap-1.5 rounded-xl border border-[#7B5CFF]/40 bg-[#7B5CFF]/10 p-2" data-testid="ench-linked">
      <div className="text-[11.5px] font-bold text-white/85">{l.plot ? <>Linked to <b className="text-[#C8B8FF]">{linked ? plotName(linked) : `(${l.plot[0]}, ${l.plot[1]})`}</b>: its minigames pay ×{Number(l.mult).toFixed(1)}.</> : 'No second plot yet — pick one and it works from there too.'}</div>
      <div className="flex flex-wrap gap-1.5">
        {pick.canMap && <MapPickButton onClick={pick.toMap} label={l.plot ? 'Link another plot' : 'Pick it on the map'} testId="ench-link-map" disabled={!!busy} />}
        {!pick.canMap && plots.slice(0, 4).map((p) => <button key={`${p.gx}_${p.gy}`} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold" onClick={() => void act('trait_link', { gx: p.gx, gy: p.gy })}>{plotName(p)}</button>)}
      </div>
    </div>
  );
}

/** 🪄 Divining: what to aim at, and how deep it is */
export function DivineTarget({ d, act, busy }: { d: NonNullable<T['divining']>; act: Act; busy: string | null }) {
  const pct = Math.min(1, d.depth / Math.max(1, d.need));
  return (
    <div className="grid gap-1.5 rounded-xl border border-[#7FE0C3]/40 bg-[#7FE0C3]/10 p-2" data-testid="ench-divining">
      <div className="flex flex-wrap gap-1.5">{d.targets.map((t) => (
        <button key={t.key} disabled={!!busy} onClick={() => void act('trait_divine', { key: t.key })}
          className={`rounded-full px-2.5 py-1 text-[11px] font-black ${d.target === t.key ? 'bg-[#7FE0C3] text-[#04201A]' : 'bg-white/10 text-white'}`} data-testid="ench-divine-pick">🪄 {t.name}</button>
      ))}</div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full origin-left rounded-full bg-[#7FE0C3] transition-transform" style={{ transform: `scaleX(${pct})` }} /></div>
      <div className="text-[10.5px] font-bold text-white/60">{Math.round(pct * 100)}% deep · {Math.max(0, d.need - d.depth)} draws to certain{d.hits ? ` · ${d.hits} brought up` : ''}</div>
    </div>
  );
}

/** one line on what a Trait has done (for the ones that work by themselves) */
export function traitProof(gene: string | null | undefined, tn: T): string | null {
  switch (gene) {
    case 'spread': return tn.spores ? `${tn.spores.sent} spores sent · ${tn.spores.fed} Ink fed back${tn.spores.live.length ? ` · ${tn.spores.live.length} growing now (${tn.spores.live.map((s) => `@${s.host ?? '?'}`).join(', ')})` : ''}` : null;
    case 'grow': return tn.giant ? (tn.giant.now ? `Its plot stands giant now — ${dur((Date.parse(tn.giant.now.until) - Date.now()) / 1000)} left` : `Stood giant ${tn.giant.days} day${tn.giant.days === 1 ? '' : 's'} so far — it grows again today`) : null;
    case 'echo': return tn.echo ? (tn.echo.pending ? `An echo is coming: ${tn.echo.pending.action} again in ${dur((Date.parse(tn.echo.pending.due_at) - Date.now()) / 1000)}` : `${tn.echo.left} echo${tn.echo.left === 1 ? '' : 'es'} left today · ${tn.echo.done} so far`) : null;
    case 'foresight': return tn.foresight ? `${tn.foresight.preview?.label ? `${tn.foresight.preview.label} · ` : ''}${tn.foresight.dodged} bad luck dodged` : null;
    case 'charged': return tn.charged ? `Static ${tn.charged.static}/${tn.charged.full}${tn.charged.arcs ? ` · arced ${tn.charged.arcs} time${tn.charged.arcs > 1 ? 's' : ''}` : ''}` : null;
    case 'wish': return tn.wishing ? (tn.wishing.keeps ? 'Keeps a charge now and then' : tn.wishing.ready ? 'Its next reward today is wished ×2' : 'Today’s wished reward is done — again tomorrow') : null;
    case 'radiant': return tn.radiant ? `A ${tn.radiant.r_m} m sun on its plot: ultras ×${tn.radiant.um} for your claims there · timers ${tn.radiant.faster}% faster` : null;
    default: return null;
  }
}
