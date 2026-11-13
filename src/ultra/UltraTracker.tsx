// The Ultra tracker: every Ultra plot you own and where it stands today — Chaos's roll for the day, Phoenix stacking
// on your check-in streak, Solar / Lunar / Comet windows, Kraken / Gemini / Mirror multipliers, and what the rest do.
// Shown in the daily check-in (a compact strip) and as its own section in the Play hub.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import type { MyUltras, UltraPlot } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Z_PLOT, cellCenter } from '../shared/grid';
import { rarityInfo } from '../shared/rarity';

export const ultrasKey = ['ultras'] as const;
export function useUltras() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ultrasKey, queryFn: api.myUltras, enabled: !!me, staleTime: 60_000 });
}

const x = (n: number | string | null | undefined) => `×${(+Number(n ?? 1).toFixed(2)).toString()}`;
const hrs = (h: number) => (h >= 1 ? `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` : `${Math.max(1, Math.round(h * 60))}m`);
/** hours until a daily window (UTC start hour, length) opens or closes */
function windowText(w: NonNullable<UltraPlot['window']>) {
  const now = new Date(), h = now.getUTCHours() + now.getUTCMinutes() / 60;
  const into = (h - Number(w.start) + 48) % 24;
  if (w.open) return { open: true, text: `Open · ${hrs(Number(w.len) - into)} left` };
  return { open: false, text: `Opens in ${hrs(24 - into)}` };
}

type Group = { rarity: string; plots: UltraPlot[] };
function groups(d: MyUltras): Group[] {
  const m = new Map<string, UltraPlot[]>();
  for (const p of d.plots) m.set(p.rarity, [...(m.get(p.rarity) ?? []), p]);
  return [...m].map(([rarity, plots]) => ({ rarity, plots }));
}

function fly(nav: ReturnType<typeof useNavigate>, p: UltraPlot) {
  buzz('light');
  const [lng, lat] = cellCenter(p.gx, p.gy);
  nav('/world');
  setTimeout(() => { useUi.getState().requestFly({ lng, lat, zoom: Z_PLOT + 1 }); useUi.getState().select({ gx: p.gx, gy: p.gy }); }, 350);
}

/** the daily check-in: Phoenix (stacked when you have several) and Chaos's rolls for today */
export function UltraStrip() {
  const q = useUltras();
  const d = q.data;
  if (!d) return null;
  const ph = d.plots.filter((p) => p.rarity === 'phoenix'), ch = d.plots.filter((p) => p.rarity === 'chaos');
  if (!ph.length && !ch.length) return null;
  return (
    <div className="grid gap-2" data-testid="ultra-strip">
      <div className="text-[11px] font-black uppercase tracking-wider text-white/60">Your Ultras today</div>
      {ph.length > 0 && (
        <div className="lv-ultrarow" style={{ ['--c' as string]: rarityInfo('phoenix').color, ['--g' as string]: rarityInfo('phoenix').glow }} data-testid="ultra-phoenix">
          <Stack emoji="🔥" n={ph.length} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-display text-[15px] font-black">Phoenix{ph.length > 1 ? ` · ${ph.length} plots` : ''}</div>
            <div className="text-[11.5px] font-semibold text-white/60">{d.checked_in ? `Lit by your ${d.streak}-day streak` : `Check in to make it ${x(d.phoenix.next)}`}</div>
          </div>
          <div className="text-right leading-none">
            <div className="lv-ultramult tnum">{x(d.phoenix.now)}</div>
            {!d.checked_in && Number(d.phoenix.next) > Number(d.phoenix.now) && <div className="mt-1 text-[11px] font-black text-[#3DDC97] tnum">→ {x(d.phoenix.next)}</div>}
          </div>
        </div>
      )}
      {ch.length > 0 && (
        <div className="lv-ultrarow" style={{ ['--c' as string]: rarityInfo('chaos').color, ['--g' as string]: rarityInfo('chaos').glow }} data-testid="ultra-chaos">
          <Stack emoji="🎲" n={ch.length} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-display text-[15px] font-black">Chaos{ch.length > 1 ? ` · ${ch.length} plots` : ''}</div>
            {ch.length > 1 ? <div className="flex flex-wrap gap-1 pt-1">{ch.map((p) => <span key={`${p.gx},${p.gy}`} className="lv-ultrachip tnum">{x(p.mult)}</span>)}</div>
              : <div className="text-[11.5px] font-semibold text-white/60">Today’s roll · new one at the reset</div>}
          </div>
          <div className="text-right leading-none"><div className="lv-ultramult tnum">{x(Math.max(...ch.map((p) => Number(p.mult ?? 1))))}</div>{ch.length > 1 && <div className="mt-1 text-[10.5px] font-bold text-white/50">best today</div>}</div>
        </div>
      )}
    </div>
  );
}

/** a little pile of badges: one for each plot, fanned out */
function Stack({ emoji, n }: { emoji: string; n: number }) {
  const k = Math.min(n, 4);
  return (
    <span className="lv-ultrastack" aria-label={`${n} plot${n === 1 ? '' : 's'}`}>
      {Array.from({ length: k }, (_, i) => <span key={i} style={{ transform: `translate(${(i - (k - 1) / 2) * 7}px, ${-i * 2}px) rotate(${(i - (k - 1) / 2) * 8}deg)`, zIndex: i }}>{emoji}</span>)}
      {n > 1 && <b className="tnum">{n}</b>}
    </span>
  );
}

/** the Play hub's section: one card per Ultra rarity you own */
export function UltraTracker() {
  const q = useUltras();
  const nav = useNavigate();
  const d = q.data;
  if (!d || !d.plots.length) return null;
  return (
    <section className="mb-6" data-testid="ultra-tracker">
      <h2 className="mb-2.5 flex items-baseline justify-between px-0.5 font-display text-[17px] font-black">Ultra tracker <span className="text-[11.5px] font-bold text-white/45">{d.plots.length} Ultra plot{d.plots.length === 1 ? '' : 's'}</span></h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {groups(d).map(({ rarity, plots }, i) => {
          const r = rarityInfo(rarity);
          const best = Math.max(...plots.map((p) => Number(p.mult ?? 1)));
          const w = plots[0].window ? windowText(plots[0].window) : null;
          const head = rarity === 'phoenix' ? x(d.phoenix.now) : plots[0].daily ? x(best) : w ? (w.open ? x(plots[0].window!.mult) : 'Waiting') : null;
          const sub = rarity === 'phoenix'
            ? (d.checked_in ? `${d.streak}-day streak · ${x(d.phoenix.next)} tomorrow if you keep it` : `${d.streak}-day streak · check in for ${x(d.phoenix.next)}`)
            : rarity === 'chaos' ? `Re-rolls at the daily reset · ${[...new Set((d.chaos_values ?? []).map(Number))].sort((a, b) => a - b).map((v) => x(v)).join(' ')}`
            : w ? w.text : plots[0].daily ? 'Today’s multiplier' : (plots[0].ability ?? r.ability ?? '');
          return (
            <motion.div key={rarity} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={cn('lv-ultracard', w?.open && 'open')} style={{ ['--c' as string]: r.color, ['--g' as string]: r.glow }} data-testid={`ultra-${rarity}`}>
              <div className="flex items-center gap-3">
                <Stack emoji={r.emoji ?? '✨'} n={plots.length} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="font-display text-[16px] font-black">{r.name}</div>
                  <div className="line-clamp-2 text-[11.5px] font-semibold text-white/60">{sub}</div>
                </div>
                {head && <div className="lv-ultramult tnum">{head}</div>}
              </div>
              {rarity === 'chaos' && <ChaosBar values={(d.chaos_values ?? []).map(Number)} today={plots.map((p) => Number(p.mult ?? 1))} />}
              {rarity === 'phoenix' && <PhoenixBar streak={d.streak} max={d.phoenix.max_days} />}
              {plots.length > 0 && (
                <div className="no-scrollbar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1">
                  {plots.map((p) => (
                    <button key={`${p.gx},${p.gy}`} className="lv-ultrachip shrink-0" onClick={() => fly(nav, p)} data-testid="ultra-plot">
                      {p.name ?? `Plot ${p.gx % 1000},${p.gy % 1000}`}{p.daily && rarity !== 'phoenix' ? <b className="ml-1 tnum">{x(p.mult)}</b> : null}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/** every value Chaos can roll, with today's marked */
function ChaosBar({ values, today }: { values: number[]; today: number[] }) {
  const v = [...new Set(values)].sort((a, b) => a - b);
  if (v.length < 2) return null;
  return (
    <div className="mt-2.5 flex gap-1" aria-label="What Chaos can roll">
      {v.map((n) => <span key={n} className={cn('lv-chaoscell tnum', today.includes(n) && 'on')}>{x(n)}</span>)}
    </div>
  );
}
/** the streak on its way to the Phoenix's peak */
function PhoenixBar({ streak, max }: { streak: number; max: number }) {
  const pct = Math.max(2, Math.min(100, (streak / Math.max(1, max)) * 100));
  return (
    <div className="mt-2.5">
      <div className="lv-phoenixbar"><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} /></div>
      <div className="mt-1 flex justify-between text-[10.5px] font-bold text-white/45 tnum"><span>Day {streak}</span><span>Peak at day {max}</span></div>
    </div>
  );
}
