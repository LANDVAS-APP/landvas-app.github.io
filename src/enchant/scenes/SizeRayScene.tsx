// 📡 Size Ray: a ray gun on a test bench. The big move: pick any plot on the map (or one of yours on the radar), GROW its
// drawing 100× or SHRINK it 100×, and fire as the needle peaks. Someone else's plot is a prank — just for show. Quick shots
// are still here too: grow an enchantment's next reward, shrink a goose's fox, or shrink a parasite off your land. Your
// own tiny plots hide three micro-gems — search the dust for them.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { api } from '../../backend/api';
import { qk } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { rarityInfo } from '../../shared/rarity';
import { Button, Tabs } from '../../ui';
import { Sigil } from '../Sigil';
import { centerOf, efx, useLeft, useMyEnchantments, useVisitors, type SceneProps } from '../core';
import { dur, enchantName } from '../kinds';
import { feel } from '../living';
import { ModeDial, NeedleMeter, RAY, Radar, gradeLine, plotLabel, usePickOnMap, useRayShot, type RayMode } from '../sizeray';

type Quick = { type: 'enchant' | 'fox' | 'parasite'; id: string; label: string; e?: any };
const GRADE_C: Record<string, string> = { PERFECT: '#B6FF3D', GREAT: '#39FF14', GOOD: '#FFD23F', WIDE: '#FF9F1C', MISS: '#FF4D6D' };

export function SizeRayScene({ v, view, act, busy, at }: SceneProps) {
  const [tab, setTab] = useState<'plot' | 'quick'>('plot');
  const [mode, setMode] = useState<RayMode>('grow');
  const [picked, setPicked] = useState<{ gx: number; gy: number } | null>(null);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [beam, setBeam] = useState<any>(null);
  const gun = useRef<HTMLDivElement>(null);
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots });
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  const nextIn = useLeft(view.next_in, at);
  const shot = useRayShot(v.id);
  const pickOnMap = usePickOnMap();
  // (simple mode has no map: the radar is the picker there)
  const simple = useUi((s) => !!s.settings.simpleMode);
  const sizes: any[] = view.sizes ?? [];
  const aimNow = async () => {
    if (tab === 'plot' && picked) await shot.doAim({ type: 'plot', gx: picked.gx, gy: picked.gy, mode });
    else if (quick) { const { label: _l, e: _e, ...t } = quick; void _l; void _e; await shot.doAim(t); }
  };
  const fire = async () => {
    const r = await shot.fire();
    if (!r) return;
    setBeam(r);
    const c = r.mode === 'shrink' || r.fox_shrunk || r.parasite_shrunk ? RAY.shrink : RAY.grow;
    efx.burst({ ...centerOf(gun.current), colors: [c.c, c.c2, '#fff'], count: r.grade === 'PERFECT' ? 220 : 110, speed: 14, kind: 'spark' });
    if (r.pay) efx.pay(r.pay, 'sizeray', centerOf(gun.current));
    setTimeout(() => setBeam(null), 3200);
  };
  const quicks = {
    enchant: (mine.data ?? []).filter((x) => x.id !== v.id).map((x) => ({ type: 'enchant' as const, id: x.id, label: `Grow ${enchantName(x)}’s next reward`, e: x })),
    fox: (mine.data ?? []).filter((x) => x.kind === 'goose').map((x) => ({ type: 'fox' as const, id: x.id, label: `Shrink the fox at ${enchantName(x)}`, e: x })),
    parasite: (visitors.data ?? []).filter((x) => x.what === 'parasite').map((x) => ({ type: 'parasite' as const, id: x.id, label: `Shrink @${x.owner?.username ?? '?'}’s ${x.stage === 2 ? 'Symbiote' : 'Parasite'} off your plot` })),
  };
  const allQuick: Quick[] = [...quicks.enchant, ...quicks.fox, ...quicks.parasite];
  const list = (plots.data ?? []) as any[];
  const p = picked ? list.find((x) => x.gx === picked.gx && x.gy === picked.gy) : null;
  const target = tab === 'plot' ? p : quick;
  const shrinking = tab === 'plot' ? mode === 'shrink' : quick?.type !== 'enchant';
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'linear-gradient(180deg,#0A1A0F 0%,#13071E 100%)' }} data-testid="ray-scene">
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full opacity-40" aria-hidden>{Array.from({ length: 20 }, (_, i) => <line key={i} x1={i * 20} y1="0" x2={i * 20} y2="300" stroke="#39FF14" strokeOpacity="0.15" />)}{Array.from({ length: 15 }, (_, i) => <line key={i} x1="0" y1={i * 20} x2="400" y2={i * 20} stroke="#39FF14" strokeOpacity="0.15" />)}</svg>
        <div ref={gun} className={cn('absolute bottom-[26%] left-[6%] w-[40%]', shot.aim && 'lv-tremble')}>
          <svg viewBox="0 0 200 100" className="w-full drop-shadow-[0_0_18px_rgba(57,255,20,0.45)]" aria-hidden>
            <rect x="20" y="40" width="110" height="26" rx="8" fill="#5B5F73" /><rect x="120" y="44" width="40" height="18" rx="4" fill="#8A8FA3" />
            <circle cx="170" cy="53" r="14" fill={shrinking ? '#FF00E5' : '#39FF14'} opacity={shot.aim ? 1 : 0.5} className={shot.aim ? 'lv-sigil-pulse' : ''} /><circle cx="170" cy="53" r="6" fill="#fff" />
            <path d="M40 66 L30 96 L56 96 L64 66Z" fill="#3A3E50" /><rect x="40" y="30" width="60" height="12" rx="4" fill="#FF00E5" />
            {[0, 1, 2].map((i) => <rect key={i} x={46 + i * 18} y="32" width="12" height="8" rx="2" fill={i < Number(view.shots) ? '#39FF14' : '#1a1a1a'} />)}
          </svg>
        </div>
        <div className="absolute bottom-[20%] right-[8%] grid w-[34%] justify-items-center">
          <motion.div className="grid aspect-square w-[70%] place-items-center rounded-3xl border-2 border-dashed border-white/25 text-4xl"
            style={p ? { background: `${rarityInfo(p.rarity).color}33`, borderColor: rarityInfo(p.rarity).color } : undefined}
            animate={beam ? { scale: beam.mode === 'shrink' || beam.fox_shrunk || beam.parasite_shrunk ? [1, 0.18, 0.22] : [1, 2.2, 1.9] } : { scale: 1 }} transition={{ duration: 0.9, type: 'spring' }}>
            {tab === 'plot' ? (p ? '🟩' : '🎯') : quick?.type === 'fox' ? '🦊' : quick?.type === 'parasite' ? '🦠' : quick ? '✨' : '🎯'}
          </motion.div>
          <span className="mt-1 max-w-full truncate rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-black text-white/80">{tab === 'plot' ? (p ? plotLabel(p) : 'pick a plot') : quick?.label ?? 'choose a target'}</span>
        </div>
        <AnimatePresence>{beam && <motion.div key="b" className="absolute bottom-[38%] left-[42%] h-3 origin-left rounded-full" style={{ width: '46%', background: beam.mode === 'shrink' || beam.fox_shrunk || beam.parasite_shrunk ? 'linear-gradient(90deg,#FF00E5,#FF7AE0)' : 'linear-gradient(90deg,#39FF14,#B6FF3D)', boxShadow: '0 0 24px currentColor' }} initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />}</AnimatePresence>
        {shot.aim && <div className="absolute inset-x-[8%] top-[12%]"><NeedleMeter needle={shot.needle} mode={shrinking ? 'shrink' : 'grow'} /></div>}
        <AnimatePresence>
          {beam && (
            <motion.div key="g" className="absolute inset-x-0 top-[8%] px-4 text-center" initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} data-testid="ray-grade">
              <div className="font-display text-5xl font-black" style={{ color: GRADE_C[beam.grade] ?? '#fff', textShadow: '0 0 20px currentColor' }}>{beam.grade}!</div>
              <div className="text-[13px] font-bold text-white/85">{beam.mode === 'grow' || beam.mode === 'shrink' ? gradeLine(beam) : beam.grown ? `Its next reward grows ×${beam.grown}` : beam.fox_shrunk ? 'The next fox is tiny — it can’t bite' : beam.parasite_shrunk ? 'The parasite shrank right off — and you ate its meal' : ''}</div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[12px] font-black text-[#B6FF3D]" style={{ display: shot.aim ? 'none' : undefined }} data-testid="ray-shots">⚡ {view.shots}/3 charges{Number(view.shots) < 3 ? ` · next ${dur(nextIn)}` : ''}</div>
      </div>
      {shot.aim ? (
        <Button variant="rainbow" size="lg" onClick={() => void fire()} disabled={!!shot.busy} data-testid="ray-fire">🔫 FIRE!</Button>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(x) => { setTab(x as never); setQuick(null); }} items={[{ value: 'plot', label: '🗺️ A plot of yours' }, { value: 'quick', label: '✨ Quick shots' }]} />
          {tab === 'plot' ? (
            <div className="grid gap-2.5">
              <ModeDial mode={mode} onChange={setMode} />
              <p className="text-[12px] font-semibold text-white/65">{RAY[mode].text}</p>
              {!simple && <Button variant="rainbow" size="lg" disabled={Number(view.shots) < 1} onClick={() => pickOnMap(v.id, mode)} data-testid="ray-pick-map">🗺️ Pick any plot on the map</Button>}
              <details className="rounded-2xl bg-white/[0.04] p-2.5" open={!list.length || simple || undefined}>
                <summary className="cursor-pointer text-[12px] font-black text-white/70">{simple ? 'Pick a plot of yours on the radar' : '…or pick it on the radar'}</summary>
                <div className="mt-2 grid gap-2">
                  <Radar plots={list} picked={picked} onPick={(x) => setPicked({ gx: x.gx, gy: x.gy })} sizes={sizes} />
                  {p && <div className="text-center text-[12px] font-black" style={{ color: rarityInfo(p.rarity).color }}>{plotLabel(p)} · {rarityInfo(p.rarity).name}</div>}
                  <Button variant="secondary" onClick={() => void aimNow()} disabled={!picked || !!busy || Number(view.shots) < 1} data-testid="ray-aim">{Number(view.shots) < 1 ? `Recharging · ${dur(nextIn)}` : `🎯 Aim · ${RAY[mode].label}`}</Button>
                </div>
              </details>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid max-h-56 gap-1 overflow-y-auto pr-1" data-testid="ray-targets">
                {allQuick.length ? allQuick.map((t, i) => (
                  <button key={i} onClick={() => { feel('light'); setQuick(t); }} className={cn('flex items-center gap-2 rounded-xl p-2 text-left text-[13px] font-bold', quick && quick.id === t.id && quick.type === t.type ? 'bg-[#39FF14]/15 ring-1 ring-[#39FF14]' : 'bg-white/[0.04]')} data-testid="ray-target">
                    {t.e ? <Sigil kind={t.e.kind} seed={t.e.sigil} size={28} still /> : <span className="text-lg">🦠</span>}
                    <span className="truncate">{t.label}</span>
                  </button>
                )) : <p className="p-2 text-[12px] text-white/55">Nothing to aim at yet.</p>}
              </div>
              <Button variant="rainbow" onClick={() => void aimNow()} disabled={!quick || !!busy || Number(view.shots) < 1} data-testid="ray-aim-quick">{Number(view.shots) < 1 ? `Recharging · ${dur(nextIn)}` : '🎯 Aim'}</Button>
            </div>
          )}
        </>
      )}
      {target === undefined && null}
      {sizes.length > 0 && <Sizes sizes={sizes} act={act} busy={busy} />}
      <p className="text-center text-[11px] text-white/55">{view.perfects} PERFECT zap{view.perfects === 1 ? '' : 's'}.</p>
    </div>
  );
}

/** your giant and tiny plots right now: time left, revert, and the micro-gem hunt */
function Sizes({ sizes, act, busy }: { sizes: any[]; act: SceneProps['act']; busy: string | null }) {
  const [hunt, setHunt] = useState<string | null>(null);
  return (
    <div className="grid gap-2" data-testid="ray-sizes">
      <div className="text-[12px] font-black uppercase tracking-wider text-white/60">Zapped right now</div>
      {sizes.map((s) => {
        const key = `${s.gx}_${s.gy}`, c = RAY[s.mode as RayMode];
        const total = Math.max(1, (Date.parse(s.until) - Date.now()) / 1000 + 1);
        return (
          <div key={key} className="grid gap-2 rounded-2xl border p-2.5" style={{ borderColor: `${c.c}55`, background: `${c.c}12` }}>
            <div className="flex items-center gap-2">
              <span className="lv-ring" style={{ ['--p' as string]: Math.min(1, Number(s.left) / Math.max(total, 1)), ['--c' as string]: c.c }}>{c.emoji}</span>
              <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-[13px] font-black">{s.prank ? `🤡 @${s.owner_name ?? '?'}’s plot` : s.name ?? 'Your plot'} · {s.mode === 'grow' ? (s.prank ? 'GIANT' : `GIANT ×${s.mult}`) : 'TINY'}</div>
                <div className="text-[11px] text-white/60">{dur(s.left)} left{s.prank ? ' · your prank' : s.pranked_by ? ` · @${s.pranked_by}’s prank on you` : s.mode === 'grow' ? ` · ${s.tips} visitor${s.tips === 1 ? '' : 's'} tipped it` : ` · ${s.gems_left} micro-gem${s.gems_left === 1 ? '' : 's'} left`}</div></div>
              {s.mode === 'shrink' && !s.prank && !s.pranked_by && s.gems_left > 0 && s.tries_left > 0 && <Button size="sm" variant="secondary" onClick={() => setHunt(hunt === key ? null : key)} data-testid="ray-hunt">🔍 Search</Button>}
              {!s.pranked_by && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void act('revert', { gx: s.gx, gy: s.gy })}>{s.prank ? 'Call it off' : 'Revert'}</Button>}
            </div>
            {hunt === key && <MicroHunt s={s} act={act} />}
          </div>
        );
      })}
    </div>
  );
}

/** a 5×5 of dust in the tiny world: three gems hide in it (8 looks per shrink) */
export function MicroHunt({ s, act }: { s: any; act: SceneProps['act'] }) {
  const [found, setFound] = useState<number[]>(s.found ?? []);
  const [miss, setMiss] = useState<Record<number, number>>({});
  const [tries, setTries] = useState<number>(s.tries_left ?? 8);
  const cells = useRef<Record<number, HTMLButtonElement | null>>({});
  const look = async (c: number) => {
    if (found.includes(c) || miss[c] != null || tries <= 0) return;
    feel('light');
    const r = await act('micro', { gx: s.gx, gy: s.gy, cell: c }, { at: centerOf(cells.current[c]) });
    if (!r) return;
    setTries((t) => t - 1);
    if (r.result.gem) { setFound((f) => [...f, c]); feel('success'); efx.burst({ ...centerOf(cells.current[c]), colors: ['#FF00E5', '#FFE8A3', '#fff'], count: 60, speed: 9, kind: 'spark' }); }
    else setMiss((m) => ({ ...m, [c]: r.result.near ?? 0 }));
  };
  return (
    <div className="grid gap-1.5" data-testid="micro-hunt">
      <div className="lv-microworld grid grid-cols-5 gap-1 rounded-2xl p-2">
        {Array.from({ length: 25 }, (_, c) => (
          <button key={c} ref={(el) => { cells.current[c] = el; }} onClick={() => void look(c)} className={cn('grid aspect-square place-items-center rounded-lg text-[15px] font-black', found.includes(c) ? 'lv-microgem' : miss[c] != null ? 'bg-black/40 text-white/40' : 'lv-microdust')} data-testid="micro-cell">
            {found.includes(c) ? '💎' : miss[c] != null ? miss[c] : ''}
          </button>
        ))}
      </div>
      <p className="text-center text-[11px] text-white/55">{tries} look{tries === 1 ? '' : 's'} left · a number is how many steps away the nearest gem is</p>
    </div>
  );
}
