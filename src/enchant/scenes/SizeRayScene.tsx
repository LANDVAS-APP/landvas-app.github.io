// 📡 Size Ray: a ray gun on a test bench. Pick a target (a plot to make giant, an enchantment's next reward, a goose's
// fox, a parasite feeding on your land), aim — and a needle swings across the power meter. Fire at the peak. The server
// works the needle out from its own clock (no faking a PERFECT); the beam lances out and the target swells or shrinks.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../backend/api';
import { qk } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { buzz } from '../../native/native';
import { rarityInfo } from '../../shared/rarity';
import { PLOT_TYPES } from '../../map/plotStyle';
import { Button, Tabs } from '../../ui';
import { Sigil } from '../Sigil';
import { centerOf, efx, useLeft, useMyEnchantments, useVisitors, type SceneProps } from '../core';
import { dur, enchantName } from '../kinds';

type Target = { type: 'plot'; gx: number; gy: number; label: string } | { type: 'enchant' | 'fox' | 'parasite'; id: string; label: string };

export function SizeRayScene({ v, view, act, busy, at }: SceneProps) {
  const [tab, setTab] = useState<'plot' | 'enchant' | 'fox' | 'parasite'>('plot');
  const [target, setTarget] = useState<Target | null>(null);
  const [aim, setAim] = useState<{ at: number; period: number; offset: number } | null>(null);
  const [beam, setBeam] = useState<any>(null);
  const needle = useRef<HTMLDivElement>(null);
  const gun = useRef<HTMLDivElement>(null);
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots });
  const mine = useMyEnchantments();
  const visitors = useVisitors();
  const nextIn = useLeft(view.next_in, at);
  // the needle: x = 0.5 − 0.5·cos(2π·t/period), the same formula the server judges with
  useEffect(() => {
    if (!aim) return;
    let raf = 0;
    const f = () => {
      const t = (Date.now() + aim.offset) / 1000 - aim.at;
      const x = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / aim.period);
      if (needle.current) needle.current.style.transform = `translateX(${x * 100}%)`;
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [aim]);
  const doAim = async () => {
    if (!target) return;
    const { label: _l, ...t } = target as never as Record<string, unknown>; void _l;
    const t0 = Date.now();
    const r = await act('aim', { target: t }, { silent: true });
    if (!r) return;
    const rtt = (Date.now() - t0) / 2;
    setAim({ at: Number(r.result.aim.at), period: Number(r.result.period_ms) / 1000, offset: Number(r.result.server_time) * 1000 + rtt - Date.now() });
  };
  const fire = async () => {
    if (useUi.getState().settings.haptics) buzz('heavy');
    const r = await act('fire', {}, { at: centerOf(gun.current) });
    setAim(null);
    if (r) {
      setBeam(r.result);
      const big = !r.result.fox_shrunk && !r.result.parasite_shrunk;
      efx.burst({ ...centerOf(gun.current), colors: big ? ['#39FF14', '#B6FF3D', '#fff'] : ['#FF00E5', '#FF7AE0', '#fff'], count: r.result.grade === 'PERFECT' ? 220 : 110, speed: 14, kind: 'spark' });
      setTimeout(() => setBeam(null), 2600);
    }
  };
  const lists = {
    plot: (plots.data ?? []).filter((p: any) => p.rarity !== 'enchanted').slice(0, 40).map((p: any) => ({ type: 'plot' as const, gx: p.gx, gy: p.gy, label: `${p.name ?? PLOT_TYPES[p.plot_type as keyof typeof PLOT_TYPES]?.name ?? 'Plot'} · ${rarityInfo(p.rarity).name}`, rarity: p.rarity })),
    enchant: (mine.data ?? []).filter((x) => x.id !== v.id).map((x) => ({ type: 'enchant' as const, id: x.id, label: enchantName(x), e: x })),
    fox: (mine.data ?? []).filter((x) => x.kind === 'goose').map((x) => ({ type: 'fox' as const, id: x.id, label: `The fox at ${enchantName(x)}`, e: x })),
    parasite: (visitors.data ?? []).filter((x) => x.what === 'parasite').map((x) => ({ type: 'parasite' as const, id: x.id, label: `@${x.owner?.username ?? '?'}’s ${x.stage === 2 ? 'Symbiote' : 'Parasite'} on your plot` })),
  };
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'linear-gradient(180deg,#0A1A0F 0%,#13071E 100%)' }} data-testid="ray-scene">
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full opacity-40" aria-hidden>{Array.from({ length: 20 }, (_, i) => <line key={i} x1={i * 20} y1="0" x2={i * 20} y2="300" stroke="#39FF14" strokeOpacity="0.15" />)}{Array.from({ length: 15 }, (_, i) => <line key={i} x1="0" y1={i * 20} x2="400" y2={i * 20} stroke="#39FF14" strokeOpacity="0.15" />)}</svg>
        {/* the gun */}
        <div ref={gun} className={cn('absolute bottom-[26%] left-[6%] w-[40%]', aim && 'lv-tremble')}>
          <svg viewBox="0 0 200 100" className="w-full drop-shadow-[0_0_18px_rgba(57,255,20,0.45)]" aria-hidden>
            <rect x="20" y="40" width="110" height="26" rx="8" fill="#5B5F73" /><rect x="120" y="44" width="40" height="18" rx="4" fill="#8A8FA3" />
            <circle cx="170" cy="53" r="14" fill="#39FF14" opacity={aim ? 1 : 0.5} className={aim ? 'lv-sigil-pulse' : ''} /><circle cx="170" cy="53" r="6" fill="#fff" />
            <path d="M40 66 L30 96 L56 96 L64 66Z" fill="#3A3E50" /><rect x="40" y="30" width="60" height="12" rx="4" fill="#FF00E5" />
            {[0, 1, 2].map((i) => <rect key={i} x={46 + i * 18} y="32" width="12" height="8" rx="2" fill={i < Number(view.shots) ? '#39FF14' : '#1a1a1a'} />)}
          </svg>
        </div>
        {/* the target */}
        <div className="absolute bottom-[20%] right-[8%] grid w-[34%] justify-items-center">
          <motion.div className="grid aspect-square w-[70%] place-items-center rounded-3xl border-2 border-dashed border-white/25 text-4xl"
            animate={beam ? { scale: beam.fox_shrunk || beam.parasite_shrunk ? [1, 0.3, 0.35] : [1, 1.8, 1.6] } : { scale: 1 }} transition={{ duration: 0.9, type: 'spring' }}>
            {target ? (target.type === 'plot' ? '🟩' : target.type === 'fox' ? '🦊' : target.type === 'parasite' ? '🦠' : '✨') : '🎯'}
          </motion.div>
          <span className="mt-1 max-w-full truncate rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-black text-white/80">{target?.label ?? 'choose a target'}</span>
        </div>
        <AnimatePresence>{beam && <motion.div key="b" className="absolute bottom-[38%] left-[42%] h-3 origin-left rounded-full" style={{ width: '46%', background: beam.fox_shrunk || beam.parasite_shrunk ? 'linear-gradient(90deg,#FF00E5,#FF7AE0)' : 'linear-gradient(90deg,#39FF14,#B6FF3D)', boxShadow: '0 0 24px currentColor' }} initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />}</AnimatePresence>
        {/* the power meter */}
        {aim && (
          <div className="absolute inset-x-[8%] top-[12%] h-9 overflow-hidden rounded-full border-2 border-white/30 bg-[linear-gradient(90deg,#330000,#664400_40%,#39FF14_88%,#B6FF3D_96%,#39FF14)]" data-testid="ray-meter">
            <div ref={needle} className="absolute inset-y-0 left-0 w-full"><div className="h-full w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_#fff]" /></div>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#0A1A0F]">PEAK</span>
          </div>
        )}
        <AnimatePresence>
          {beam && (
            <motion.div key="g" className="absolute inset-x-0 top-[10%] text-center" initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} data-testid="ray-grade">
              <div className="font-display text-5xl font-black" style={{ color: beam.grade === 'PERFECT' ? '#B6FF3D' : beam.grade === 'GREAT' ? '#39FF14' : beam.grade === 'GOOD' ? '#FFD23F' : '#FF7AE0', textShadow: '0 0 20px currentColor' }}>{beam.grade}!</div>
              <div className="text-[13px] font-bold text-white/85">{beam.giant ? `Giant plot: its minigames pay ×${beam.giant} for ${beam.hours} h` : beam.grown ? `Its next reward grows ×${beam.grown}` : beam.fox_shrunk ? 'The next fox is tiny — it can’t bite' : beam.parasite_shrunk ? 'The parasite shrank right off — and you ate its meal' : ''}</div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[12px] font-black text-[#B6FF3D]" style={{ display: aim ? 'none' : undefined }} data-testid="ray-shots">⚡ {view.shots}/3 charges{Number(view.shots) < 3 ? ` · next ${dur(nextIn)}` : ''}</div>
      </div>
      {aim ? (
        <Button variant="rainbow" size="lg" onClick={() => void fire()} disabled={!!busy} data-testid="ray-fire">🔫 FIRE!</Button>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(x) => { setTab(x as never); setTarget(null); }} items={[{ value: 'plot', label: '🟩 Grow a plot' }, { value: 'enchant', label: '✨ Grow a reward' }, { value: 'fox', label: '🦊 Shrink a fox' }, { value: 'parasite', label: '🦠 Shrink a parasite' }]} />
          <div className="grid max-h-56 gap-1 overflow-y-auto pr-1" data-testid="ray-targets">
            {lists[tab].length ? lists[tab].map((t: any, i: number) => (
              <button key={i} onClick={() => setTarget(t)} className={cn('flex items-center gap-2 rounded-xl p-2 text-left text-[13px] font-bold', target && JSON.stringify(target) === JSON.stringify(t) ? 'bg-[#39FF14]/15 ring-1 ring-[#39FF14]' : 'bg-white/[0.04]')} data-testid="ray-target">
                {t.e ? <Sigil kind={t.e.kind} seed={t.e.sigil} size={28} still /> : <span className="text-lg">{tab === 'plot' ? '🟩' : '🦠'}</span>}
                <span className="truncate" style={t.rarity ? { color: rarityInfo(t.rarity).color } : undefined}>{t.label}</span>
              </button>
            )) : <p className="p-2 text-[12px] text-white/55">{tab === 'parasite' ? 'Nothing is feeding on your land right now.' : tab === 'fox' ? 'You need a Golden Goose for this.' : 'Nothing to aim at yet.'}</p>}
          </div>
          <Button variant="rainbow" onClick={() => void doAim()} disabled={!target || !!busy || Number(view.shots) < 1} data-testid="ray-aim">{Number(view.shots) < 1 ? `Recharging · ${dur(nextIn)}` : '🎯 Aim'}</Button>
        </>
      )}
      <p className="text-center text-[11px] text-white/55">{view.perfects} PERFECT zap{view.perfects === 1 ? '' : 's'}. Giant plots now: {(view.giants ?? []).length}.</p>
    </div>
  );
}
