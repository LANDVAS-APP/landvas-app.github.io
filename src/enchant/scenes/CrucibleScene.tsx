// 🔥 Crucible: a forge in the dark. Melt plots into the pot — they fly in, splash, and the metal glows hotter — then take
// one of your plots to the anvil: pump the bellows in time with the ring, and bring the hammer down. The chance a strike
// lifts it a tier grows with the Heat, a little at a time; a miss keeps half (Steady keeps more, Fury risks it all).
// What melts leaves metal: runes, artifacts (a horseshoe, a bell, a lantern, an anchor), inlays and monuments.
import { AnimatePresence, motion, useSpring, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import { cn } from '../../lib/utils';
import { centerOf, efx, type SceneProps } from '../core';
import { PlotRow, plotName, sleep, useCraftClip, type PlotLite } from '../craft';
import { feel } from '../living';

const METALS: Record<string, { name: string; c: string; hi: string; lo: string; from: string }> = {
  iron: { name: 'Iron', c: '#8A8F98', hi: '#D5D9E0', lo: '#4A4E55', from: 'Common' }, copper: { name: 'Copper', c: '#C46A35', hi: '#F3B08A', lo: '#6E3418', from: 'Uncommon' },
  silver: { name: 'Silver', c: '#C9D3DE', hi: '#FFFFFF', lo: '#7D8896', from: 'Rare' }, gold: { name: 'Gold', c: '#E8B530', hi: '#FFF0A8', lo: '#8A5E0C', from: 'Epic' },
  platinum: { name: 'Platinum', c: '#BFE6F0', hi: '#F4FFFF', lo: '#6C9AA8', from: 'Legendary' }, starsteel: { name: 'Starsteel', c: '#9C7BFF', hi: '#E7DCFF', lo: '#3A1F8E', from: 'Mythic & ultras' },
};
const RUNES: Record<string, { name: string; emoji: string; text: string }> = {
  steady: { name: 'Steady', emoji: '🛡️', text: 'a miss keeps 75% of the Heat' }, fury: { name: 'Fury', emoji: '💢', text: 'a bigger chance — but a miss loses it all' },
  kind: { name: 'Kind', emoji: '🎨', text: 'a hit also turns the plot into the kind you choose' },
};
const ARTIFACTS: Record<string, { name: string; emoji: string; text: string; carry: boolean }> = {
  horseshoe: { name: 'Iron Horseshoe', emoji: '🧲', text: 'Carry it: Luck every day (more as it levels)', carry: true },
  bell: { name: 'Silver Bell', emoji: '🔔', text: 'Carry it: your Leviathan hits land harder', carry: true },
  lantern: { name: 'Gold Lantern', emoji: '🏮', text: 'Hang it on a plot: its minigames pay more', carry: false },
  anchor: { name: 'Starsteel Anchor', emoji: '⚓', text: 'Set it on a plot: no Parasites, no pranks there', carry: false },
};
const TIERS = ['', 'Bronze', 'Silver', 'Gold', 'Starsteel'];
const pct = (n: number) => `${Math.round(n * 100)}%`;
const cost = (o: Record<string, number>) => Object.entries(o).map(([k, n]) => `${n} ${METALS[k]?.name ?? k}`).join(' + ');

function Pot({ heat, splash }: { heat: number; splash: number }) {
  const lv = Math.min(1, Math.log10(1 + heat) / 2.6);
  const hot = lv > 0.02;
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full overflow-visible" aria-hidden>
      <defs>
        <radialGradient id="cru-molten" cx="50%" cy="35%" r="70%"><stop offset="0" stopColor="#FFF3B0" /><stop offset="0.35" stopColor="#FFB000" /><stop offset="0.75" stopColor="#FF5A00" /><stop offset="1" stopColor="#7A1A00" /></radialGradient>
        <linearGradient id="cru-iron" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1A1512" /><stop offset="0.4" stopColor="#4A403A" /><stop offset="0.7" stopColor="#2A2420" /><stop offset="1" stopColor="#0E0B09" /></linearGradient>
      </defs>
      {/* the coals */}
      {Array.from({ length: 9 }, (_, i) => <ellipse key={i} cx={40 + i * 15} cy={140 - (i % 2) * 3} rx="11" ry="6" fill={hot ? ['#FF6A00', '#C23A00', '#FF9A1F'][i % 3] : '#2A201A'} opacity={hot ? 0.9 : 0.8} />)}
      {/* the pot */}
      <path d="M38 52 Q34 128 100 132 Q166 128 162 52 Z" fill="url(#cru-iron)" stroke="#000" strokeWidth="2" />
      <ellipse cx="100" cy="52" rx="62" ry="15" fill="#140F0C" stroke="#3A322C" strokeWidth="3" />
      <motion.g className="lvx-molten" initial={false} animate={{ scaleY: 0.5 + lv * 0.5, opacity: hot ? 1 : 0 }} style={{ originY: '58px' }}>
        <ellipse cx="100" cy="54" rx="56" ry="11" fill="url(#cru-molten)" />
        <g className="lvx-molten-wave"><path d="M48 54 q13 -6 26 0 t26 0 t26 0 t26 0 t26 0" stroke="#FFF7C8" strokeOpacity="0.55" strokeWidth="2" fill="none" /></g>
      </motion.g>
      <AnimatePresence>
        {splash > 0 && (
          <motion.g key={splash} initial={{ opacity: 1, scale: 0.4 }} animate={{ opacity: 0, scale: 1.6 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }} style={{ originX: '100px', originY: '50px' }}>
            {Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI - Math.PI; return <circle key={i} cx={100 + Math.cos(a) * 40} cy={50 + Math.sin(a) * 28} r="5" fill="#FFB000" />; })}
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}

function Count({ n }: { n: number }) {
  const s = useSpring(n, { stiffness: 80, damping: 18 });
  useEffect(() => { s.set(n); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = useTransform(s, (x) => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(x < 10 ? 2 : 1)));
  return <motion.span>{t}</motion.span>;
}

/** the bellows: a ring closes on the target three times — press as it touches */
function Bellows({ onDone }: { onDone: (score: number) => void }) {
  const [round, setRound] = useState(0);
  const [hits, setHits] = useState<number[]>([]);
  const t0 = useRef(performance.now());
  const [now, setNow] = useState(performance.now());
  useEffect(() => { let raf = 0; const f = () => { setNow(performance.now()); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf); }, []);
  const period = 1100;
  const phase = ((now - t0.current) % period) / period;
  const scale = 2.2 - phase * 1.6;
  const press = () => {
    const off = Math.abs(scale - 1);
    const q = Math.max(0, 1 - off / 0.55);
    feel(q > 0.75 ? 'success' : 'light');
    const h = [...hits, q]; setHits(h); setRound(round + 1); t0.current = performance.now();
    if (h.length >= 3) onDone(h.reduce((a, b) => a + b, 0) / h.length);
  };
  return (
    <div className="grid justify-items-center gap-2" data-testid="crucible-bellows">
      <button className="relative grid h-28 w-28 place-items-center rounded-full bg-[#3A1606] text-[34px] shadow-[inset_0_0_30px_#000]" onPointerDown={press} data-testid="crucible-pump">
        <span className="lvx-bellows-ring" style={{ transform: `scale(${scale})`, opacity: 1 - phase * 0.4 }} />
        <span className="absolute inset-[30%] rounded-full border-2 border-dashed border-[#FFD27A]/70" />
        <motion.span animate={{ scaleY: [1, 0.8, 1] }} transition={{ duration: 0.3 }} key={round}>🌬️</motion.span>
      </button>
      <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-8 rounded-full" style={{ background: hits[i] == null ? 'rgba(255,255,255,0.12)' : hits[i] > 0.75 ? '#FFD27A' : hits[i] > 0.35 ? '#FF8C00' : '#7A2A00' }} />)}</div>
      <div className="text-[11px] font-bold text-white/60">Press as the ring meets the circle — three pumps</div>
    </div>
  );
}

export function CrucibleScene({ v, view, act, busy, mirror }: SceneProps) {
  const pot = useRef<HTMLDivElement>(null), anvil = useRef<HTMLDivElement>(null);
  const clip = useCraftClip(v);
  const [tab, setTab] = useState<'melt' | 'strike' | 'craft' | 'mark'>('melt');
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [flying, setFlying] = useState<PlotLite[]>([]);
  const [splash, setSplash] = useState(0);
  const [target, setTarget] = useState<PlotLite | null>(null);
  const [rune, setRune] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [bellows, setBellows] = useState<'off' | 'on' | number>('off');
  const [swing, setSwing] = useState(0);
  const [verdict, setVerdict] = useState<any>(null);
  const [mark, setMark] = useState<{ p: PlotLite | null; metal: string; pour: Record<string, number>; name: string }>({ p: null, metal: 'iron', pour: {}, name: '' });
  const heat = Number(view.heat ?? 0);
  const metal: Record<string, number> = view.metal ?? {};
  const runes: Record<string, number> = view.runes ?? {};
  const meltable: (PlotLite & { heat: number; metal: string })[] = view.meltable ?? [];
  const strikeable: (PlotLite & { to: string; chance: number })[] = view.strikeable ?? [];
  const arts: any[] = view.artifacts ?? [];
  const allPlots: PlotLite[] = useMemo(() => { const m = new Map<string, PlotLite>(); for (const p of [...strikeable, ...meltable]) m.set(`${p.gx},${p.gy}`, p); return [...m.values()]; }, [strikeable, meltable]);
  const picked = meltable.filter((p) => pick.has(`${p.gx},${p.gy}`));
  const gain = picked.reduce((a, p) => a + Number(p.heat), 0);
  const sparks = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ l: 28 + ((i * 41) % 44), d: (i * 0.37) % 2.4 })), []);

  const melt = async () => {
    if (!picked.length || mirror) return;
    const cells = picked.map((p) => [p.gx, p.gy]);
    setFlying(picked); feel('medium');
    await sleep(700);
    const r = await act('melt', { cells }, { silent: true });
    setFlying([]);
    if (!r?.result) return;
    setSplash((x) => x + 1); setPick(new Set());
    feel('heavy');
    efx.burst({ ...centerOf(pot.current), colors: ['#FFB000', '#FF5A00', '#FFF3B0'], count: 120 + picked.length * 20, speed: 12, kind: 'spark' });
  };
  const strike = async (pump: number) => {
    if (!target || mirror) return;
    setBellows('off'); setSwing((s) => s + 1); feel('heavy');
    await sleep(420);
    const r = await act('strike', { gx: target.gx, gy: target.gy, rune, type: rune === 'kind' ? type : undefined, pump }, { silent: true });
    if (!r?.result) return;
    setVerdict(r.result);
    const at = centerOf(anvil.current);
    if (r.result.ok) {
      const c = rarityInfo(r.result.to).color;
      efx.burst({ ...at, colors: [c, '#FFF3B0', '#fff'], count: 260, speed: 17, kind: 'spark' });
      efx.burst({ ...at, colors: [c], count: 22, speed: 9, kind: 'emoji', emojis: ['⚒️', '✨', '🔥'] });
      if (r.result.pay?.paid) efx.pay(r.result.pay, 'crucible', at);
      feel('success');
      clip({ title: `Forged up to ${rarityInfo(r.result.to).name}`, sub: plotName(target), emoji: '🔥', payoff: '⚒️', color: c, kicker: 'Striking the anvil…', head: `${rarityInfo(r.result.to).name.toUpperCase()}!`,
        lines: [`${rarityInfo(r.result.from).name} → ${rarityInfo(r.result.to).name}${r.result.masterwork ? ' · a Masterwork' : ''}`, `A ${pct(r.result.chance)} strike`], text: `🔥 Forged to ${rarityInfo(r.result.to).name}! Clip the strike?` });
      setTarget(null);
    } else {
      efx.burst({ ...at, colors: ['#8A8F98', '#D5D9E0'], count: 50, speed: 6, kind: 'glitter' });
    }
  };

  const tabs = [['melt', '🔥 Melt'], ['strike', '⚒️ Strike'], ['craft', '🧪 Craft'], ['mark', '🏛️ Mark']] as const;
  return (
    <div className="grid gap-3">
      <div className="lvx-stage lv-scene aspect-[4/3] w-full" data-testid="crucible-scene">
        <div className="lvx-forge" />
        <div className="lvx-forge-glow" style={{ opacity: heat > 0 ? 1 : 0.3 }} />
        {heat > 0 && sparks.map((s, i) => <span key={i} className="lvx-spark" style={{ left: `${s.l}%`, bottom: '34%', animationDelay: `${s.d}s` }} />)}
        <div ref={pot} className="absolute bottom-[4%] left-[8%] h-[62%] w-[52%]"><Pot heat={heat} splash={splash} /></div>
        {/* the anvil and the hammer */}
        <div ref={anvil} className="absolute bottom-[8%] right-[4%] h-[44%] w-[36%]">
          <svg viewBox="0 0 120 90" className="h-full w-full overflow-visible" aria-hidden>
            <path d="M10 34 L110 34 L96 50 L72 50 L80 82 L40 82 L48 50 L24 50 Z" fill="#2C2E33" stroke="#0B0C0E" strokeWidth="2" />
            <path d="M10 34 L110 34 L104 40 L16 40 Z" fill="#5A5E66" />
            {target && <rect x="44" y="24" width="32" height="10" rx="2" fill={rarityInfo(target.rarity).color} stroke="#000" />}
            <motion.g className="lvx-hammer" key={swing} initial={{ rotate: swing ? -70 : -50 }} animate={{ rotate: swing ? [-70, 8, -30] : -50 }} transition={{ duration: swing ? 0.6 : 0, times: [0, 0.55, 1] }} style={{ originX: '104px', originY: '78px' }}>
              <rect x="100" y="10" width="6" height="70" rx="2" fill="#6B3B20" />
              <rect x="84" y="4" width="38" height="16" rx="3" fill="#7A7E86" stroke="#1A1B1E" strokeWidth="1.5" />
            </motion.g>
          </svg>
        </div>
        {/* plots flying into the pot */}
        <AnimatePresence>
          {flying.map((p, i) => (
            <motion.div key={`${p.gx},${p.gy}`} className="absolute left-1/2 top-[8%] rounded-lg px-2 py-1 text-[11px] font-black text-[#1a0b2e]" style={{ background: rarityInfo(p.rarity).color }}
              initial={{ x: (i - flying.length / 2) * 40, y: -10, opacity: 0, rotate: 0 }} animate={{ x: -90, y: 150, opacity: [0, 1, 1, 0], rotate: 260, scale: 0.4 }} transition={{ duration: 0.75, delay: i * 0.06, ease: 'easeIn' }}>
              {plotName(p)}
            </motion.div>
          ))}
        </AnimatePresence>
        <div className="absolute left-3 top-3 grid gap-0.5 rounded-2xl bg-black/55 px-3 py-1.5" data-testid="crucible-heat">
          <span className="text-[10px] font-black uppercase tracking-wider text-[#FFB347]">Heat{view.heat_mult > 1 ? ' · ×1.25 bellows' : ''}</span>
          <span className="font-display text-[24px] font-black leading-none text-white" style={{ textShadow: '0 0 14px #FF8C00' }}><Count n={heat} /></span>
        </div>
        <div className="absolute right-3 top-3 flex max-w-[55%] flex-wrap justify-end gap-1" data-testid="crucible-metal">
          {Object.entries(METALS).filter(([k]) => (metal[k] ?? 0) > 0).map(([k, m]) => (
            <span key={k} className="lvx-ingot" style={{ ['--c' as any]: m.c, ['--hi' as any]: m.hi, ['--lo' as any]: m.lo }}><i /><b className="text-[10px] text-white">{metal[k]} {m.name}</b></span>
          ))}
        </div>
        <AnimatePresence>
          {verdict && (
            <motion.div className="absolute inset-x-4 bottom-4 rounded-2xl p-3 text-center shadow-2xl" style={{ background: verdict.ok ? `linear-gradient(135deg, ${rarityInfo(verdict.to).color}, #2B0A00)` : 'linear-gradient(135deg,#3A3F48,#111)' }}
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} data-testid="crucible-verdict" onClick={() => setVerdict(null)}>
              <div className="font-display text-[20px] font-black text-white">{verdict.ok ? `${rarityInfo(verdict.from).name} → ${rarityInfo(verdict.to).name}!` : 'The metal cooled…'}</div>
              <div className="text-[12px] font-bold text-white/80">{verdict.ok ? `${verdict.masterwork ? 'A Masterwork — two tiers! ' : ''}A ${pct(verdict.chance)} strike.` : `A ${pct(verdict.chance)} chance. ${verdict.kept ? `${pct(verdict.kept)} of the Heat is kept.` : 'Fury burned all the Heat.'}`}</div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="lvx-grain" />
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/5 p-1">
        {tabs.map(([id, label]) => <button key={id} className={cn('rounded-xl py-2 text-[12px] font-black', tab === id ? 'bg-[#FF7A00] text-[#2B0A00]' : 'text-white/70')} onClick={() => setTab(id)} data-testid={`crucible-tab-${id}`}>{label}</button>)}
      </div>

      {tab === 'melt' && (
        <div className="grid gap-2">
          <div className="text-[12px] text-white/70">Melt any of your plots — no limit. Rarer plots give far more Heat. They go back to the world at their spot’s own roll (plots must be yours for {view.melt_min_h} hours; starter plots can’t melt).</div>
          <div className="grid max-h-[280px] gap-1.5 overflow-y-auto pr-1" data-testid="crucible-meltable">
            {meltable.length ? meltable.slice(0, 60).map((p) => {
              const k = `${p.gx},${p.gy}`;
              return <PlotRow key={k} p={p} on={pick.has(k)} onClick={() => { const n = new Set(pick); n.has(k) ? n.delete(k) : n.size < 25 && n.add(k); setPick(n); }} testId="crucible-melt-plot"
                right={<span className="text-right text-[11px] font-black leading-tight text-[#FFB347]">+{p.heat} 🔥<br /><span className="text-white/60">{METALS[p.metal]?.name}</span></span>} />;
            }) : <p className="text-[12px] text-white/60">Nothing to melt yet.</p>}
          </div>
          <Button variant="rainbow" size="lg" onClick={() => void melt()} disabled={!!busy || !picked.length || !!mirror} data-testid="crucible-melt">{picked.length ? `🔥 Melt ${picked.length} plot${picked.length > 1 ? 's' : ''} · +${Math.round(gain * 100) / 100} Heat` : 'Pick plots to melt'}</Button>
        </div>
      )}

      {tab === 'strike' && (
        <div className="grid gap-2">
          <div className="grid grid-cols-5 gap-1 text-center" data-testid="crucible-chances">
            {(['uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const).map((r) => (
              <div key={r} className="rounded-xl bg-white/5 p-1.5"><div className="text-[10px] font-black" style={{ color: rarityInfo(r).color }}>→ {rarityInfo(r).name}</div><div className="text-[13px] font-black text-white">{pct(view.chances?.[r] ?? 0)}</div></div>
            ))}
          </div>
          {bellows === 'on' ? <Bellows onDone={(s) => { setBellows(s); void strike(s); }} /> : (
            <>
              <div className="grid max-h-[220px] gap-1.5 overflow-y-auto pr-1" data-testid="crucible-strikeable">
                {strikeable.slice(0, 60).map((p) => <PlotRow key={`${p.gx},${p.gy}`} p={p} on={target?.gx === p.gx && target?.gy === p.gy} onClick={() => setTarget(p)} testId="crucible-target"
                  right={<span className="text-right text-[11px] font-black leading-tight"><span style={{ color: rarityInfo(p.to).color }}>→ {rarityInfo(p.to).name}</span><br /><span className="text-white/70">{pct(p.chance)}</span></span>} />)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="lvx-label w-full">Temper rune{view.free_rune ? ' · ★2: free every strike' : ''}</span>
                {[null, 'steady', 'fury', 'kind'].map((k) => (
                  <button key={k ?? 'none'} className={cn('rounded-full border px-3 py-1 text-[12px] font-black', rune === k ? 'border-[#FFB347] bg-[#FFB347]/20 text-white' : 'border-white/15 text-white/70')}
                    disabled={!!k && !view.free_rune && !(runes[k] > 0)} onClick={() => setRune(k)} data-testid={`crucible-rune-${k ?? 'none'}`}>
                    {k ? `${RUNES[k].emoji} ${RUNES[k].name}${view.free_rune ? '' : ` ×${runes[k] ?? 0}`}` : 'No rune'}
                  </button>
                ))}
              </div>
              {rune === 'kind' && (
                <div className="flex flex-wrap gap-1">{(view.types ?? []).map((t: any) => <button key={t.id} className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', type === t.id ? 'bg-white text-black' : 'bg-white/10 text-white/80')} onClick={() => setType(t.id)}>{t.name}</button>)}</div>
              )}
              <Button variant="rainbow" size="lg" onClick={() => setBellows('on')} disabled={!!busy || !target || heat <= 0 || (rune === 'kind' && !type) || !!mirror} data-testid="crucible-strike">
                {heat <= 0 ? 'The Heart is cold — melt something first' : target ? `⚒️ Pump the bellows, then strike ${plotName(target)}` : 'Pick a plot for the anvil'}
              </Button>
              {view.master_ready && <div className="text-center text-[11px] font-black text-[#FFD23F]">⚒️ Masterwork ready: this week’s first hit jumps two tiers</div>}
            </>
          )}
        </div>
      )}

      {tab === 'craft' && (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <div className="lvx-label">Temper runes</div>
            {Object.entries(RUNES).map(([k, r]) => (
              <div key={k} className="lvx-row"><span className="text-xl">{r.emoji}</span><span className="grid flex-1 leading-tight"><span className="text-[13px] font-black text-white">{r.name} ×{runes[k] ?? 0}</span><span className="text-[11px] text-white/60">{r.text} · {cost(view.recipes?.runes?.[k] ?? {})}</span></span>
                <Button size="sm" onClick={() => void act('rune', { rune: k })} disabled={!!busy} data-testid={`crucible-make-${k}`}>Make</Button></div>
            ))}
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between"><span className="lvx-label">Artifacts{view.set ? ' · ⚒️ Smith’s Set: +5% enchantment Ink' : ''}</span>
              {view.tend_ready && <Button size="sm" variant="rainbow" onClick={() => void act('tend').then((r) => r?.result && efx.burst({ x: innerWidth / 2, y: innerHeight / 2, colors: ['#7CFF6B'], count: 18, speed: 8, kind: 'emoji', emojis: ['🍀', '🧲'] }))} data-testid="crucible-tend">🧲 Collect Luck</Button>}</div>
            {Object.entries(ARTIFACTS).map(([k, a]) => (
              <div key={k} className="lvx-row"><span className="text-xl">{a.emoji}</span><span className="grid flex-1 leading-tight"><span className="text-[13px] font-black text-white">{a.name}</span><span className="text-[11px] text-white/60">{a.text} · {cost(view.recipes?.artifacts?.[k] ?? {})}</span></span>
                <Button size="sm" onClick={() => void act('forge', { artifact: k }).then((r) => r?.result && efx.burst({ ...centerOf(pot.current), colors: ['#FFD27A', '#fff'], count: 80, speed: 9, kind: 'spark' }))} disabled={!!busy} data-testid={`crucible-forge-${k}`}>Forge</Button></div>
            ))}
            {arts.length > 0 && (
              <div className="grid gap-1" data-testid="crucible-artifacts">
                {arts.map((a) => {
                  const twin = arts.find((b) => b.id !== a.id && b.kind === a.kind && b.level === a.level);
                  const info = ARTIFACTS[a.kind];
                  return (
                    <div key={a.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1.5 text-[12px]">
                      <span>{info.emoji}</span><span className="flex-1 font-bold text-white">{info.name} <span className="text-[#FFD23F]">{'◆'.repeat(a.level)}</span><br /><span className="text-[11px] font-semibold text-white/60">{a.power}{a.carried ? ' · carried' : a.gx != null ? ' · on a plot' : ''}</span></span>
                      {twin && a.level < 5 && <button className="font-black text-[#FFB347]" onClick={() => void act('fuse', { a: a.id, b: twin.id })} disabled={!!busy}>Fuse</button>}
                      {info.carry ? <button className="font-black text-white/80" onClick={() => void act('mount', { id: a.id })} disabled={!!busy} data-testid="crucible-carry">{a.carried ? 'Put away' : 'Carry'}</button>
                        : <select className="rounded bg-white/10 px-1 py-0.5 text-[11px] text-white" value={a.gx != null ? `${a.gx},${a.gy}` : ''} onChange={(e) => { const [gx, gy] = e.target.value.split(',').map(Number); void act('mount', e.target.value ? { id: a.id, gx, gy } : { id: a.id }); }}>
                            <option value="">Not placed</option>{allPlots.slice(0, 80).map((p) => <option key={`${p.gx},${p.gy}`} value={`${p.gx},${p.gy}`}>{plotName(p)}</option>)}</select>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'mark' && (
        <div className="grid gap-2">
          <div className="text-[12px] text-white/70">Set metal into one of your plots (an inlay: a little more minigame Ink) — or pour it into a monument everyone sees on the map.</div>
          <div className="grid max-h-[180px] gap-1.5 overflow-y-auto pr-1">
            {allPlots.slice(0, 60).map((p) => <PlotRow key={`${p.gx},${p.gy}`} p={p} on={mark.p?.gx === p.gx && mark.p?.gy === p.gy} onClick={() => setMark({ ...mark, p })} testId="crucible-mark-plot" />)}
          </div>
          <div className="flex flex-wrap gap-1">{Object.entries(METALS).map(([k, m]) => (
            <button key={k} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black', mark.metal === k ? 'bg-white text-black' : 'bg-white/10 text-white/80')} onClick={() => setMark({ ...mark, metal: k })}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.c }} />{m.name} · {metal[k] ?? 0}</button>
          ))}</div>
          <Button onClick={() => mark.p && void act('inlay', { gx: mark.p.gx, gy: mark.p.gy, metal: mark.metal })} disabled={!!busy || !mark.p || (metal[mark.metal] ?? 0) < 2} data-testid="crucible-inlay">◇ Inlay 2 {METALS[mark.metal].name}</Button>
          <div className="grid gap-1.5 rounded-2xl bg-white/5 p-2.5">
            <div className="lvx-label">Monument · {TIERS.slice(1).map((t, i) => `${t} ${[10, 60, 250, 1000][i]}`).join(' · ')} points</div>
            <div className="flex flex-wrap gap-1.5">{Object.entries(METALS).filter(([k]) => (metal[k] ?? 0) > 0).map(([k, m]) => (
              <label key={k} className="flex items-center gap-1 text-[11px] font-bold text-white/80">{m.name}
                <input type="number" min={0} max={metal[k]} value={mark.pour[k] ?? 0} onChange={(e) => setMark({ ...mark, pour: { ...mark.pour, [k]: Math.max(0, Math.min(metal[k], Math.floor(Number(e.target.value) || 0))) } })}
                  className="w-14 rounded bg-black/40 px-1 py-0.5 text-white" data-testid={`crucible-pour-${k}`} /></label>
            ))}</div>
            <input value={mark.name} onChange={(e) => setMark({ ...mark, name: e.target.value.slice(0, 32) })} placeholder="Name it (optional)" className="rounded-xl bg-black/40 px-3 py-2 text-[13px] text-white" />
            <Button variant="rainbow" onClick={() => mark.p && void act('monument', { gx: mark.p.gx, gy: mark.p.gy, metal: Object.fromEntries(Object.entries(mark.pour).filter(([, n]) => n > 0)), name: mark.name || null })
              .then((r) => { if (r?.result?.monument) { efx.burst({ ...centerOf(pot.current), colors: ['#E8B530', '#fff'], count: 120, speed: 11, kind: 'spark' }); setMark({ ...mark, pour: {} }); } })}
              disabled={!!busy || !mark.p || !Object.values(mark.pour).some((n) => n > 0)} data-testid="crucible-monument">🏛️ Pour into a monument</Button>
          </div>
          {(view.monuments ?? []).length > 0 && <div className="flex flex-wrap gap-1.5">{(view.monuments as any[]).map((m) => <span key={`${m.gx},${m.gy}`} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80">🏛️ {m.name ?? 'A monument'} · {TIERS[m.tier] || 'rising'} · {m.points}</span>)}</div>}
          {(view.inlays ?? []).length > 0 && <div className="text-[11px] text-white/60">{view.inlays.length} plot{view.inlays.length > 1 ? 's' : ''} inlaid</div>}
        </div>
      )}
      <p className="text-center text-[11px] text-white/55">Strikes only climb the normal ladder, up to Mythic — never ultras or Crowns. Artifacts, inlays and monuments are Ink and perks only; rent never changes except by rarity.</p>
    </div>
  );
}
