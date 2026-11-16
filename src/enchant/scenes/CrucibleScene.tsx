// 🔥 Crucible: a forge in the dark. Melt plots into the pot — they fly in, splash, and the metal glows hotter — then take
// one of your plots to the anvil: pump the bellows in time with the ring, and bring the hammer down. The chance a strike
// lifts it a tier grows with the Heat, a little at a time; a miss keeps half (Steady keeps more, Fury risks it all).
// What melts leaves metal: runes, artifacts (eight of them, from a horseshoe to a Phoenix Feather), inlays and monuments.
import { AnimatePresence, motion, useSpring, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { rarityInfo } from '../../shared/rarity';
import { Button, useConfirm } from '../../ui';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { centerOf, efx, type SceneProps } from '../core';
import { PlotRow, plotName, sleep, useCraftClip, type PlotLite } from '../craft';
import { feel } from '../living';
import { MapPickButton, useMapPick, usePlotChoice } from '../pickers';
import { ARTIFACTS, ARTIFACT_ORDER, ArtifactArt, LevelPips } from '../artifacts';

const METALS: Record<string, { name: string; c: string; hi: string; lo: string; from: string }> = {
  iron: { name: 'Iron', c: '#8A8F98', hi: '#D5D9E0', lo: '#4A4E55', from: 'Common' }, copper: { name: 'Copper', c: '#C46A35', hi: '#F3B08A', lo: '#6E3418', from: 'Uncommon' },
  silver: { name: 'Silver', c: '#C9D3DE', hi: '#FFFFFF', lo: '#7D8896', from: 'Rare' }, gold: { name: 'Gold', c: '#E8B530', hi: '#FFF0A8', lo: '#8A5E0C', from: 'Epic' },
  platinum: { name: 'Platinum', c: '#BFE6F0', hi: '#F4FFFF', lo: '#6C9AA8', from: 'Legendary' }, starsteel: { name: 'Starsteel', c: '#9C7BFF', hi: '#E7DCFF', lo: '#3A1F8E', from: 'Mythic & ultras' },
};
const RUNES: Record<string, { name: string; emoji: string; text: string }> = {
  steady: { name: 'Steady', emoji: '🛡️', text: 'a miss keeps 75% of the Heat' }, fury: { name: 'Fury', emoji: '💢', text: 'a bigger chance — but a miss loses it all' },
  kind: { name: 'Kind', emoji: '🎨', text: 'a hit also turns the plot into the kind you choose' },
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

/** the bellows: a ring closes on the bright circle three times — tap anywhere on the pad as it touches the circle.
 *  (The closing ring is a CSS animation, so phones don't repaint it from script; the tap reads where it was.) */
const PERIOD = 1300, FROM = 2.4, TO = 0.35;
function Bellows({ onDone }: { onDone: (score: number) => void }) {
  const [hits, setHits] = useState<number[]>([]);
  const [say, setSay] = useState<{ t: string; c: string; k: number } | null>(null);
  const t0 = useRef(performance.now());
  const done = useRef(false);
  const press = (e: React.PointerEvent) => {
    e.preventDefault();
    if (done.current) return;
    const phase = ((performance.now() - t0.current) % PERIOD) / PERIOD;
    const scale = FROM - phase * (FROM - TO);
    const off = Math.abs(scale - 1);
    const q = Math.max(0, 1 - off / 0.5);
    feel(q > 0.75 ? 'success' : q > 0.35 ? 'medium' : 'light');
    setSay({ t: q > 0.75 ? 'PERFECT!' : q > 0.35 ? 'Good' : scale > 1 ? 'Too early' : 'Too late', c: q > 0.75 ? '#FFD27A' : q > 0.35 ? '#FF8C00' : '#FF6B6B', k: hits.length });
    const h = [...hits, q]; setHits(h); t0.current = performance.now();
    if (h.length >= 3) { done.current = true; setTimeout(() => onDone(h.reduce((a, b) => a + b, 0) / h.length), 350); }
  };
  return (
    <div className="grid justify-items-center gap-2" data-testid="crucible-bellows">
      <button type="button" className="relative grid h-44 w-full max-w-[340px] touch-manipulation select-none place-items-center overflow-hidden rounded-3xl bg-[radial-gradient(circle,#4A1C08,#1E0903_75%)] shadow-[inset_0_0_40px_#000]"
        onPointerDown={press} data-testid="crucible-pump" aria-label="Pump the bellows">
        {/* the circle to hit, and the ring closing on it */}
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2">
          <span className="lvx-bellows-target" />
          {hits.length < 3 && <span key={hits.length} className="lvx-bellows-ring lv-keep-moving" style={{ animationDuration: `${PERIOD}ms` }} />}
        </span>
        <span className="pointer-events-none relative text-[30px]">🌬️</span>
        <AnimatePresence>{say && <motion.span key={say.k} className="pointer-events-none absolute top-3 font-display text-[18px] font-black" style={{ color: say.c, textShadow: '0 2px 8px #000' }}
          initial={{ y: 8, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>{say.t}</motion.span>}</AnimatePresence>
        <span className="pointer-events-none absolute bottom-2 text-[11px] font-bold text-white/60">Tap anywhere here as the ring meets the bright circle</span>
      </button>
      <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-8 rounded-full" style={{ background: hits[i] == null ? 'rgba(255,255,255,0.12)' : hits[i] > 0.75 ? '#FFD27A' : hits[i] > 0.35 ? '#FF8C00' : '#7A2A00' }} />)}</div>
      <div className="text-center text-[11px] font-bold text-white/60">Three pumps · good pumps add up to 10% more Heat to this strike</div>
      <button type="button" className="text-[11px] font-black text-white/50 underline" onClick={() => { if (!done.current) { done.current = true; onDone(0); } }} data-testid="crucible-skip-pump">Strike without pumping</button>
    </div>
  );
}

/** the artifacts: the set, what you can forge, and the shelf of what you have */
function ArtifactWorkshop({ view, arts, busy, allPlots, mountPick, act, pot, onReveal }: {
  view: any; arts: any[]; busy: boolean; allPlots: PlotLite[]; mountPick: ReturnType<typeof useMapPick>; act: SceneProps['act'];
  pot: React.RefObject<HTMLDivElement | null>; onReveal(r: { kind: string; level: number; power: string; fused: boolean }): void;
}) {
  const owned = new Set(arts.map((a) => a.kind));
  const carried = arts.filter((a) => a.carried).length, hands = Number(view.carry ?? 4);
  const forge = async (k: string) => {
    const r = await act('forge', { artifact: k }, { silent: true });
    const a = r?.result?.artifact;
    if (!a) return;
    efx.burst({ ...centerOf(pot.current), colors: [ARTIFACTS[k]?.glow ?? '#FFD27A', '#fff'], count: 90, speed: 10, kind: 'spark' });
    feel('success');
    onReveal({ kind: a.kind, level: a.level, power: a.power, fused: false });
  };
  const fuse = async (a: any, b: any) => {
    const r = await act('fuse', { a: a.id, b: b.id }, { silent: true });
    const x = r?.result?.artifact;
    if (!x) return;
    feel('success');
    onReveal({ kind: x.kind, level: x.level, power: x.power, fused: true });
  };
  const collect = async () => {
    const r = await act('tend', {}, { silent: true });
    if (!r?.result) return;
    efx.burst({ x: innerWidth / 2, y: innerHeight / 2, colors: ['#7CFF6B', '#5B8CFF'], count: 22, speed: 8, kind: 'emoji', emojis: [...(r.result.luck ? ['🍀'] : []), ...(r.result.ink ? ['💧'] : [])] });
    toast.success([r.result.luck ? `🍀 +${r.result.luck} Luck` : '', r.result.ink ? `💧 +${r.result.ink} Ink` : ''].filter(Boolean).join(' · ') || 'Collected');
  };
  return (
    <div className="grid gap-2" data-testid="crucible-workshop">
      <div className="flex items-center justify-between gap-2">
        <span className="lvx-label">Artifacts · carrying {carried}/{hands}</span>
        {view.tend_ready && <Button size="sm" variant="rainbow" onClick={() => void collect()} disabled={busy} data-testid="crucible-tend">✨ Collect today’s gifts</Button>}
      </div>
      <div className="lvx-set" data-testid="crucible-set" title="One of each">
        {ARTIFACT_ORDER.map((k) => <ArtifactArt key={k} kind={k} size={24} ghost={!owned.has(k)} />)}
        <span className="ml-auto text-[11px] font-black" style={{ color: view.grand ? '#C9B4FF' : view.set ? '#FFD27A' : 'rgba(255,255,255,.6)' }}>
          {view.grand ? '🏆 Grand Set · +10% enchantment Ink' : view.set ? `⚒️ Smith’s Set +5% · ${owned.size}/8 for the Grand Set` : `${owned.size}/4 kinds for the Smith’s Set`}
        </span>
      </div>
      <div className="grid gap-1.5">
        {ARTIFACT_ORDER.map((k) => {
          const a = ARTIFACTS[k];
          return (
            <div key={k} className="lvx-row" data-testid={`crucible-recipe-${k}`}>
              <ArtifactArt kind={k} size={40} />
              <span className="grid flex-1 leading-tight"><span className="text-[13px] font-black text-white">{a.name}</span><span className="text-[11px] text-white/60">{a.text} · {cost(view.recipes?.artifacts?.[k] ?? {})}</span></span>
              <Button size="sm" onClick={() => void forge(k)} disabled={busy} data-testid={`crucible-forge-${k}`}>Forge</Button>
            </div>
          );
        })}
      </div>
      {arts.length > 0 && (
        <div className="lvx-shelf" data-testid="crucible-artifacts">
          {arts.map((a) => {
            const twin = arts.find((b) => b.id !== a.id && b.kind === a.kind && b.level === a.level);
            const info = ARTIFACTS[a.kind] ?? ARTIFACTS.horseshoe;
            return (
              <div key={a.id} className={cn('lvx-art-card', a.level >= 5 && 'l5')} style={{ ['--g' as any]: info.glow }} data-testid="crucible-artifact" data-kind={a.kind} data-level={a.level}>
                <span className={cn('tag', (a.carried || a.gx != null) && 'on')}>{a.carried ? 'Carried' : a.gx != null ? 'On a plot' : 'In the chest'}</span>
                <ArtifactArt kind={a.kind} level={a.level} size={64} />
                <span className="text-[13px] font-black leading-tight text-white">{info.name}</span>
                <LevelPips level={a.level} />
                <span className="text-[11px] font-semibold leading-tight text-white/70">{a.power}</span>
                <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2 text-[12px]">
                  {twin && a.level < 5 && <button className="font-black text-[#FFB347]" onClick={() => void fuse(a, twin)} disabled={busy} data-testid="crucible-fuse">⚒️ Fuse</button>}
                  {info.carry ? <button className="font-black text-white/85" onClick={() => void act('mount', { id: a.id })} disabled={busy} data-testid="crucible-carry">{a.carried ? 'Put away' : 'Carry'}</button>
                    : <select className="max-w-[120px] rounded bg-white/10 px-1 py-0.5 text-[11px] text-white" value={a.gx != null ? `${a.gx},${a.gy}` : ''} onChange={(e) => { const [gx, gy] = e.target.value.split(',').map(Number); void act('mount', e.target.value ? { id: a.id, gx, gy } : { id: a.id }); }} data-testid="crucible-place">
                        <option value="">Not placed</option>{allPlots.slice(0, 80).map((p) => <option key={`${p.gx},${p.gy}`} value={`${p.gx},${p.gy}`}>{plotName(p)}</option>)}</select>}
                  {!info.carry && !mountPick.simple && allPlots.length > 0 && <button className="text-[13px]" title="Place it on the map" aria-label="Place it on the map" data-testid="crucible-mount-map"
                    onClick={() => mountPick.open({ title: `Place the ${info.name}`, emoji: info.emoji, color: info.glow, hint: 'Tap the plot to set it on', keep: { id: a.id },
                      allowed: allPlots.map((p) => ({ gx: p.gx, gy: p.gy, rarity: p.rarity, name: p.name ?? null, plot_type: p.plot_type })) })}>🗺️</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** a fresh artifact rises out of the pot (tap to put it on the shelf) */
function ArtifactReveal({ r, onClose }: { r: { kind: string; level: number; power: string; fused: boolean }; onClose(): void }) {
  const info = ARTIFACTS[r.kind] ?? ARTIFACTS.horseshoe;
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => { const t = setTimeout(() => close.current(), 4500); return () => clearTimeout(t); }, [r]);
  return (
    <motion.div className="lvx-reveal" style={{ ['--g' as any]: info.glow }} onClick={onClose} data-testid="crucible-reveal"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="lvx-reveal-rays" initial={{ rotate: 0, scale: 0.6, opacity: 0 }} animate={{ rotate: 90, scale: 1, opacity: 1 }} transition={{ duration: 3, ease: 'easeOut' }} />
      <motion.div className="relative grid justify-items-center gap-2 px-6 text-center" initial={{ y: 60, scale: 0.4, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14 }}>
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">{r.fused ? 'Fused' : 'Forged'}</span>
        <ArtifactArt kind={r.kind} level={r.level} size={148} />
        <span className="font-display text-[26px] font-black text-white" style={{ textShadow: `0 0 18px ${info.glow}` }}>{info.name}</span>
        <LevelPips level={r.level} />
        <span className="max-w-[260px] text-[13px] font-bold text-white/85">{r.power}</span>
        <span className="mt-1 text-[11px] text-white/50">{info.carry ? 'Carry it to use it' : 'Set it on one of your plots'} · tap to close</span>
      </motion.div>
    </motion.div>
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
  const [reveal, setReveal] = useState<{ kind: string; level: number; power: string; fused: boolean } | null>(null);
  const [mark, setMark] = useState<{ p: PlotLite | null; metal: string; pour: Record<string, number>; name: string }>({ p: null, metal: 'iron', pour: {}, name: '' });
  const heat = Number(view.heat ?? 0);
  const metal: Record<string, number> = view.metal ?? {};
  const runes: Record<string, number> = view.runes ?? {};
  const meltable: (PlotLite & { heat: number; metal: string })[] = view.meltable ?? [];
  const strikeable: (PlotLite & { to: string; chance: number })[] = view.strikeable ?? [];
  const arts: any[] = view.artifacts ?? [];
  // past Mythic: an Ultra, then a Crown (the ladder's last two steps, very hard)
  const tier = (r: string) => (r === 'ultra' ? { name: 'Ultra ✦', color: '#FF5CDB' } : r === 'crown' ? { name: 'Crown 👑', color: '#FFD23F' } : rarityInfo(r));
  const meltPick = usePlotChoice(v, 'melt', meltable, (p) => setPick((cur) => { const n = new Set(cur); const k = `${p.gx},${p.gy}`; if (!n.has(k) && n.size < 25) n.add(k); return n; }),
    { title: 'Melt a plot', emoji: '🔥', color: '#FF7A00', hint: 'Tap a plot in crosshairs to throw it in (tap again on the map for more)' });
  const strikePick = usePlotChoice(v, 'strike', strikeable, (p) => setTarget(p), { title: 'Choose a plot for the anvil', emoji: '⚒️', color: '#FFD23F', hint: 'Tap one of your plots in crosshairs', note: (p) => `→ ${tier(p.to).name} · ${Math.round(p.chance * 1000) / 10}%` });
  const allPlots: PlotLite[] = useMemo(() => { const m = new Map<string, PlotLite>(); for (const p of [...strikeable, ...meltable]) m.set(`${p.gx},${p.gy}`, p); return [...m.values()]; }, [strikeable, meltable]);
  const markPick = usePlotChoice(v, 'mark', allPlots, (p) => setMark((m) => ({ ...m, p })), { title: 'Choose a plot to mark', emoji: '🏛️', color: '#E8B530', hint: 'Tap one of your plots for an inlay or a monument' });
  const mountPick = useMapPick(v.id, 'mount', (p, keep) => { if (keep?.id) void act('mount', { id: keep.id, gx: p.gx, gy: p.gy }); });
  const picked = meltable.filter((p) => pick.has(`${p.gx},${p.gy}`));
  const gain = picked.reduce((a, p) => a + Number(p.heat), 0);
  const sparks = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ l: 28 + ((i * 41) % 44), d: (i * 0.37) % 2.4 })), []);

  const confirm = useConfirm();
  const melt = async () => {
    if (!picked.length || mirror) return;
    // melting is for good: say so once when something rare is going in
    const rare = picked.filter((p) => ['epic', 'legendary', 'mythic', 'ultra', 'crown'].includes(p.rarity));
    if (rare.length && !(await confirm({ title: `Melt ${picked.length} plot${picked.length > 1 ? 's' : ''}?`, body: `${rare.length} of them ${rare.length === 1 ? 'is' : 'are'} ${rarityInfo(rare[0].rarity).name} or rarer. Melted plots go back to the world for good — their Heat is yours to strike with.`, confirm: 'Melt them', danger: true }))) return;
    const cells = picked.map((p) => [p.gx, p.gy]);
    setFlying(picked); feel('medium');
    await sleep(700);
    const r = await act('melt', { cells }, { silent: true });
    setFlying([]);
    if (!r?.result) return;
    setSplash((x) => x + 1); setPick(new Set());
    feel('heavy');
    efx.burst({ ...centerOf(pot.current), colors: ['#FFB000', '#FF5A00', '#FFF3B0'], count: 120 + picked.length * 20, speed: 12, kind: 'spark' });
    // the Heat is in: on to the anvil
    setTimeout(() => setTab('strike'), 900);
    toast.success(`+${Math.round(gain * 100) / 100} Heat — now pick a plot for the anvil`, { description: 'The chance on every plot below grows with the Heat.' });
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
              <div className="text-[12px] font-bold text-white/80">{verdict.ok ? `${verdict.starforged ? '🌠 Starforged — the stars held it! ' : ''}${verdict.masterwork ? 'A Masterwork — two tiers! ' : ''}A ${pct(verdict.chance)} strike.` : `A ${pct(verdict.chance)} chance. ${verdict.kept ? `${pct(verdict.kept)} of the Heat is kept.` : 'Fury burned all the Heat.'}`}</div>
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
          {meltPick.canMap && <MapPickButton className="w-fit" onClick={meltPick.toMap} testId="crucible-melt-map" label="Pick plots on the map" />}
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
          <div className="grid grid-cols-4 gap-1 text-center sm:grid-cols-7" data-testid="crucible-chances">
            {(['uncommon', 'rare', 'epic', 'legendary', 'mythic', 'ultra', 'crown'] as const).map((r) => (
              <div key={r} className={cn('rounded-xl p-1.5', r === 'ultra' || r === 'crown' ? 'bg-[linear-gradient(135deg,#FF5CDB22,#FFD23F22)] ring-1 ring-[#FFD23F]/30' : 'bg-white/5')}><div className="text-[10px] font-black" style={{ color: tier(r).color }}>→ {tier(r).name}</div><div className="text-[13px] font-black text-white">{pct(view.chances?.[r] ?? 0)}</div></div>
            ))}
          </div>
          {bellows === 'on' ? <Bellows onDone={(s) => { setBellows(s); void strike(s); }} /> : (
            <>
              {strikePick.canMap && <MapPickButton className="w-fit" onClick={strikePick.toMap} testId="crucible-strike-map" label="Pick the plot on the map" />}
              <div className="grid max-h-[220px] gap-1.5 overflow-y-auto pr-1" data-testid="crucible-strikeable">
                {!strikeable.length && <p className="rounded-xl bg-white/5 p-2.5 text-[12px] text-white/70" data-testid="crucible-none">None of your plots can go on the anvil right now (locked, folded, enchanted and Crown plots can’t). Claim or roll more plots and they’ll show up here.</p>}
                {strikeable.slice(0, 60).map((p) => <PlotRow key={`${p.gx},${p.gy}`} p={p} on={target?.gx === p.gx && target?.gy === p.gy} onClick={() => setTarget(p)} testId="crucible-target"
                  right={<span className="text-right text-[11px] font-black leading-tight"><span style={{ color: tier(p.to).color }}>→ {tier(p.to).name}</span><br /><span className="text-white/70">{pct(p.chance)}</span></span>} />)}
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
          <ArtifactWorkshop view={view} arts={arts} busy={!!busy} allPlots={allPlots} mountPick={mountPick} act={act} pot={pot} onReveal={setReveal} />
        </div>
      )}

      {tab === 'mark' && (
        <div className="grid gap-2">
          <div className="text-[12px] text-white/70">Set metal into one of your plots (an inlay: a little more minigame Ink) — or pour it into a monument everyone sees on the map.</div>
          {markPick.canMap && <MapPickButton className="w-fit" onClick={markPick.toMap} testId="crucible-mark-map" label="Pick the plot on the map" />}
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
      <AnimatePresence>{reveal && <ArtifactReveal r={reveal} onClose={() => setReveal(null)} />}</AnimatePresence>
      <p className="text-center text-[11px] text-white/55">Strikes climb the ladder to Mythic — then, very rarely, to an Ultra, and past an Ultra to a Crown (only while that spot’s crown is free). Artifacts, inlays and monuments are Ink and perks only; rent never changes except by rarity.</p>
    </div>
  );
}
