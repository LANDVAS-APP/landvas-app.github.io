// Digging: your shaft on this world, as a cross-section. Tap (or hold) to dig — every layer is harder
// than the last, materials turn up as you go, reaching a new layer pays Ink, and better tools (crafted
// from what you dig, plus Ink) dig faster. Taps are sent in small batches; the server counts them.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Hammer, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { DigState, MineLayer } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, Dialog, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import type { World } from './worlds';
import { createShaft, type ShaftScene } from './shaft3d';
import { reportActivity } from '../social/activity';
import { config } from '../env';

export const digKey = (world: string, gx?: number, gy?: number) => ['dig', world, gx ?? null, gy ?? null] as const;
const layerAt = (layers: MineLayer[], depth: number) => layers.findIndex((l) => depth < l.to) === -1 ? layers.length - 1 : layers.findIndex((l) => depth < l.to);
const coreLabel = (depth: number, bottom: number, cored: boolean) => (cored ? 'the core is yours' : `${((depth / bottom) * 100).toFixed(depth / bottom < 0.01 ? 2 : 1)}% of the way to the core`);
const fmtDepth = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(m < 100 ? 1 : 0)} m`);

export function DigPanel({ world, w, plot, pose, onClose, onDug, explorerUrl }: { world: string; w: World; plot: { gx: number; gy: number; name?: string | null }; pose(): number[] | null; onClose(): void; onDug?(depth: number, cored: boolean): void; explorerUrl: string }) {
  const qc = useQueryClient();
  const key = digKey(world, plot.gx, plot.gy);
  const q = useQuery({ queryKey: key, queryFn: () => api.digState(world, plot.gx, plot.gy) });
  const [core, setCore] = useState<{ ink: number } | null>(null);
  const [state, setState] = useState<DigState | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [refillOpen, setRefillOpen] = useState(false);
  const [banner, setBanner] = useState<{ name: string; ink: number } | null>(null);
  const [viewDepth, setViewDepth] = useState(0);
  const [riding, setRiding] = useState(false);
  const haptics = useUi((st) => st.settings.haptics);
  const reduce = useUi((st) => st.settings.reduceMotion);
  useEffect(() => { if (q.data) setState(q.data); }, [q.data]);
  useEffect(() => { reportActivity('dig', { world }); return () => reportActivity(null); }, [world]);
  const live = useRef({ pending: 0, target: 0, sending: false, holding: false, lastTap: 0, finds: [] as string[] });
  const st = useRef(state); st.current = state;
  const cv = useRef<HTMLCanvasElement>(null);
  const shaft = useRef<ShaftScene | null>(null);

  // send taps in batches, about once a second
  useEffect(() => {
    const t = setInterval(async () => {
      const L = live.current, s = st.current;
      if (!L.pending || L.sending || !s) return;
      const n = Math.min(L.pending, 30); L.pending -= n; L.sending = true;
      try {
        const r = await api.dig(world, n, pose(), plot.gx, plot.gy);
        setState(r); qc.setQueryData(key, r);
        onDug?.(Number(r.depth), !!r.cored);
        if (r.reached_core) { setCore({ ink: r.core_ink ?? 0 }); confettiCannons(); setTimeout(confettiCannons, 900); invalidateGame(qc); if (haptics) buzz('success'); }
        L.target = Number(r.depth);
        shaft.current?.setDepth(L.target, !!r.cored);
        L.finds.push(...Object.entries(r.finds ?? {}).flatMap(([id, qty]) => Array(Math.min(3, Number(qty))).fill(id)));
        if (r.new_layers?.length) {
          const last = s.config.layers.find((l) => l.id === r.new_layers![r.new_layers!.length - 1]);
          setBanner({ name: last?.name ?? 'a new layer', ink: r.layer_ink ?? 0 }); confettiCannons(); invalidateGame(qc);
          setTimeout(() => setBanner(null), 3200);
        }
        if ((r.dug ?? 0) < n) L.pending = 0; // out of energy, or tapping faster than allowed
      } catch (e) {
        L.pending = 0;
        toast.error(toGameError(e).message);
      } finally { L.sending = false; }
    }, 900);
    return () => clearInterval(t);
  }, [world, plot.gx, plot.gy]); // eslint-disable-line react-hooks/exhaustive-deps

  // the shaft in 3D: built once the dig state (layers) is in, and you ride down into it
  useEffect(() => {
    const s = st.current; const c = cv.current; if (!s || !c) return;
    const items = s.config.items;
    const sc = createShaft({
      canvas: c, layers: s.config.layers, explorerUrl, accent: '#FFE36B', sky: w.sky, ground: w.ground[0],
      itemEmoji: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.emoji])), reduceMotion: reduce,
      onView: (d) => setViewDepth(d),
    });
    shaft.current = sc;
    live.current.target = Number(s.depth);
    sc.setDepth(Number(s.depth), !!s.cored);
    sc.descend();
    if (import.meta.env.DEV || config.e2e) (window as any).__landvasShaft = sc;
    return () => { sc.dispose(); shaft.current = null; };
  }, [!!state]); // eslint-disable-line react-hooks/exhaustive-deps

  // holding keeps digging, about 6 times a second
  useEffect(() => {
    const t = setInterval(() => { if (live.current.holding) tap(); }, 160);
    return () => clearInterval(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = () => {
    const s = st.current, L = live.current; if (!s) return;
    if (s.cored) { if (!L.holding) toast('You’ve reached the core of this plot — there’s nowhere deeper!'); L.holding = false; return; }
    if (s.energy - L.pending < 1) { L.holding = false; setRefillOpen(true); return; }
    L.lastTap = performance.now(); L.pending++;
    const li = layerAt(s.config.layers, L.target);
    L.target = Math.min(s.config.layers[s.config.layers.length - 1].to, L.target + (s.power * (s.party_mult ?? 1)) / s.config.layers[li].hardness); // optimistic; the server has the last word
    shaft.current?.setDepth(L.target, !!s.cored);
    shaft.current?.lookAt(null);
    shaft.current?.swing(L.finds.splice(0, 2));
    if (haptics) buzz('light');
  };
  const leave = async () => {
    if (riding) return;
    setRiding(true);
    try { await shaft.current?.ascend(); } finally { onClose(); }
  };

  if (!state) return <div className="absolute inset-0 z-40 grid place-items-center bg-black/80"><Spinner /></div>;
  const layers = state.config.layers;
  const depthNow = Number(state.depth);
  const li = layerAt(layers, depthNow);
  const energyPct = Math.round((state.energy / state.energy_max) * 100);
  const tool = [...state.config.tools].reverse().find((t) => state.tools.includes(t.id)) ?? state.config.tools[0];
  const bottom = layers[layers.length - 1].to;
  // the lift rail: the whole shaft, top to bottom, on a squeezed scale so deep shafts still fit
  const railOf = (m: number) => (depthNow <= 0 ? 0 : Math.log1p(m) / Math.log1p(depthNow));
  const depthAtRail = (f: number) => Math.expm1(f * Math.log1p(depthNow));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex flex-col bg-black text-white" data-testid="dig-panel">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      {/* tap or hold anywhere to dig */}
      <div className="absolute inset-0 touch-none select-none"
        onPointerDown={(e) => { e.preventDefault(); tap(); live.current.holding = true; }} onPointerUp={() => { live.current.holding = false; }} onPointerLeave={() => { live.current.holding = false; }} onPointerCancel={() => { live.current.holding = false; }}
        data-testid="dig-area" />
      <div className="pointer-events-none relative flex items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={leave} className="pointer-events-auto rounded-xl bg-black/55 p-2 backdrop-blur" aria-label="Back to the surface" data-testid="dig-leave"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1 rounded-2xl bg-black/45 px-3 py-1.5 backdrop-blur">
          <div className="font-display text-lg font-bold leading-tight">{plot.name || 'Your shaft'} · <span data-testid="dig-depth">{fmtDepth(depthNow)}</span>{state.cored && <span className="ml-1">💖</span>}</div>
          <div className="text-[11px] text-white/70">{layers[li].name} · {tool.name} digs {((state.power * (state.party_mult ?? 1)) / layers[li].hardness).toFixed(2)} m a tap · {coreLabel(depthNow, bottom, !!state.cored)}</div>
        </div>
        <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => setToolsOpen(true)} data-testid="dig-tools"><Hammer className="h-4 w-4" /> Tools</Button>
      </div>
      <div className="pointer-events-none relative px-3">
        <button className="pointer-events-auto flex w-full items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-[11px] backdrop-blur" onClick={() => setRefillOpen(true)} data-testid="dig-energy">
          <Zap className="h-3.5 w-3.5 text-[#FFC93D]" />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#FFC93D]" style={{ width: `${energyPct}%` }} /></div>
          <span className="tnum">{state.energy}/{state.energy_max}</span>
          <span className="rounded-full bg-[#FFC93D] px-2 py-0.5 font-bold text-black">Refill</span>
        </button>
        {!!state.party && (
          <div className="mt-1.5 w-fit rounded-full bg-[#8B5CFF]/60 px-2.5 py-1 text-[11px] font-bold backdrop-blur" data-testid="dig-party">
            🎉 Dig party · {state.party} digging with you · ×{state.party_mult} speed
          </div>
        )}
      </div>
      {/* the lift: drag to ride up and down your shaft */}
      {depthNow > 3 && (
        <div className="absolute bottom-24 right-2 top-36 flex w-14 flex-col items-center" data-testid="dig-lift">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-white/70">Lift</div>
          <div className="relative w-3 flex-1 touch-none overflow-hidden rounded-full border border-white/25"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); shaft.current?.lookAt(depthAtRail((e.clientY - r.top) / r.height)); }}
            onPointerMove={(e) => { if (!e.buttons) return; const r = e.currentTarget.getBoundingClientRect(); shaft.current?.lookAt(depthAtRail(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)))); }}>
            {layers.map((l, i) => { const a = railOf(i ? layers[i - 1].to : 0), b = railOf(Math.min(l.to, depthNow)); return b > a ? <div key={l.id} className="absolute inset-x-0" style={{ top: `${a * 100}%`, height: `${(b - a) * 100}%`, background: l.color }} /> : null; })}
            <div className="absolute -left-1 -right-1 h-1.5 rounded-full bg-white shadow" style={{ top: `calc(${railOf(viewDepth) * 100}% - 3px)` }} />
          </div>
          <div className="mt-1 text-[10px] font-bold tnum">{fmtDepth(viewDepth)}</div>
          {viewDepth < depthNow - 2 && <button className="mt-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold" onClick={() => shaft.current?.lookAt(null)}>⬇ Back</button>}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-16 text-center text-xs text-white/75">{depthNow < 0.5 ? 'Tap — or hold — to start digging your shaft' : 'Tap — or hold — to dig'}</div>
      <AnimatePresence>{core && (
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-4 top-32 z-10 mx-auto max-w-sm rounded-3xl border-2 border-[#FFB020] bg-gradient-to-b from-[#3B1205]/95 to-black/95 p-5 text-center shadow-[0_0_60px_rgba(255,140,30,0.6)]" data-testid="dig-core">
          <div className="text-5xl">💖</div>
          <div className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-[#FFB020]">You reached the core</div>
          <div className="font-display text-2xl font-black">The heart of {w.name.replace('The ', 'the ')}</div>
          <div className="mt-2 text-sm text-white/80">A <b>Core heart</b> is yours, and this plot is now <b className="text-[#FF7A1A]">Core</b> rarity — the rarest there is. Everyone can see its glow.</div>
          <div className="mt-2 flex items-center justify-center gap-1 text-lg font-bold">+{core.ink.toLocaleString()} <ResourceIcon r="ink" className="h-5 w-5" /></div>
          <Button className="mt-3" variant="rainbow" onClick={() => setCore(null)}>Amazing</Button>
        </motion.div>
      )}</AnimatePresence>
      <AnimatePresence>{banner && (
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-36 mx-auto w-fit rounded-2xl bg-black/75 px-4 py-3 text-center" data-testid="dig-layer">
          <div className="text-xs font-bold uppercase tracking-widest text-white/60">You broke through to</div>
          <div className="font-display text-2xl font-black">{banner.name}</div>
          {banner.ink > 0 && <div className="flex items-center justify-center gap-1 text-sm">+{banner.ink} <ResourceIcon r="ink" className="h-4 w-4" /></div>}
        </motion.div>
      )}</AnimatePresence>
      <div className="no-scrollbar pointer-events-none absolute inset-x-0 bottom-0 flex gap-1.5 overflow-x-auto p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]" data-testid="dig-items">
        {Object.entries(state.config.items).filter(([id]) => state.items[id]).map(([id, it]) => (
          <span key={id} className="flex shrink-0 items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold backdrop-blur">{it.emoji} {state.items[id]}</span>
        ))}
        {!Object.keys(state.items).length && <span className="rounded-full bg-black/45 px-2.5 py-1 text-xs text-white/70">Nothing found yet — materials turn up as you dig.</span>}
      </div>
      <ToolsDialog open={toolsOpen} onOpenChange={setToolsOpen} state={state} onCrafted={(r) => { const merged = { ...state, ...r, depth: state.depth, layers_reached: state.layers_reached, cored: state.cored, my_shafts: state.my_shafts }; setState(merged); qc.setQueryData(key, merged); invalidateGame(qc); }} />
      <RefillDialog open={refillOpen} onOpenChange={setRefillOpen} state={state} world={world} plot={plot}
        onDone={(r) => { const merged = { ...state, ...r, depth: state.depth, layers_reached: state.layers_reached, cored: state.cored, my_shafts: state.my_shafts }; setState(merged); qc.setQueryData(key, merged); invalidateGame(qc); }} />
    </motion.div>
  );
}

/** Top up digging energy: a free refill a day, Ink, or rations made from ice and moondust. */
export function RefillDialog({ open, onOpenChange, state, world, plot, onDone }: { open: boolean; onOpenChange(v: boolean): void; state: DigState; world: string; plot: { gx: number; gy: number }; onDone(r: DigState): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const cfg = state.config.refills, left = state.refills;
  const items = state.config.items;
  const full = state.energy >= state.energy_max;
  const go = async (kind: 'free' | 'ink' | 'ration') => {
    setBusy(kind);
    try { const r = await api.digRefill(kind, world, plot.gx, plot.gy); onDone(r); toast.success(`+${r.added} energy ⚡`); if (r.energy >= r.energy_max) onOpenChange(false); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  if (!cfg || !left) return null;
  const rationOk = Object.entries(cfg.ration.cost).every(([k, n]) => (state.items[k] ?? 0) >= n);
  const mins = Math.ceil((state.energy_max - state.energy) / Math.max(0.1, state.regen_per_minute));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="⚡ Digging energy" description={full ? 'You’re full — dig away!' : `${state.energy}/${state.energy_max} · refills by itself in about ${mins < 60 ? `${mins} min` : `${Math.round(mins / 6) / 10} h`}.`}>
      <div className="grid gap-2" data-testid="refill-list">
        <RefillRow emoji="☕" title="Coffee break" sub={left.free_left ? 'Free, once a day — fills you right up' : 'Used today — back tomorrow'} disabled={!left.free_left || full} busy={busy === 'free'} onGo={() => go('free')} label="Free" testid="refill-free" />
        <RefillRow emoji="🥤" title={`Energy drink · +${cfg.ink.energy}`} sub={`${left.ink_left} left today`} disabled={!left.ink_left || full} busy={busy === 'ink'} onGo={() => go('ink')}
          label={<span className="flex items-center gap-0.5">{cfg.ink.cost} <ResourceIcon r="ink" className="h-3.5 w-3.5" /></span>} testid="refill-ink" />
        <RefillRow emoji="🍱" title={`Miner’s ration · +${cfg.ration.energy}`} sub={<>Made from {Object.entries(cfg.ration.cost).map(([k, n]) => <span key={k} className={cn('mr-1', (state.items[k] ?? 0) >= n ? 'text-ok' : 'text-hot')}>{items[k]?.emoji} {state.items[k] ?? 0}/{n}</span>)} — as many as you like</>}
          disabled={!rationOk || full} busy={busy === 'ration'} onGo={() => go('ration')} label="Eat" testid="refill-ration" />
      </div>
    </Dialog>
  );
}
function RefillRow({ emoji, title, sub, disabled, busy, onGo, label, testid }: { emoji: string; title: string; sub: React.ReactNode; disabled: boolean; busy: boolean; onGo(): void; label: React.ReactNode; testid: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
      <span className="text-2xl">{emoji}</span>
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{title}</div><div className="text-[11px] text-muted">{sub}</div></div>
      <Button size="sm" variant="rainbow" disabled={disabled} loading={busy} onClick={onGo} data-testid={testid}>{label}</Button>
    </div>
  );
}

export function ToolsDialog({ open, onOpenChange, state, onCrafted }: { open: boolean; onOpenChange(v: boolean): void; state: DigState; onCrafted(r: DigState): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const items = state.config.items;
  const craft = async (id: string) => {
    setBusy(id);
    try { const r = await api.craftTool(id); onCrafted(r); confettiCannons(); toast.success(`${state.config.tools.find((t) => t.id === id)?.name} crafted!`); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Digging tools" description="Better tools dig faster through harder layers. Craft them from what you dig (plus Ink).">
      <div className="grid gap-2" data-testid="tools-list">
        {state.config.tools.map((t) => {
          const have = state.tools.includes(t.id);
          const ok = Object.entries(t.cost).every(([k, n]) => k === 'ink' || (state.items[k] ?? 0) >= n);
          return (
            <div key={t.id} className={cn('flex items-center gap-3 rounded-2xl p-3', have ? 'bg-ok/10' : 'bg-surface-2')}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-xl">{({ shovel: '🪏', pick: '⛏️', drill: '🔧', plasma: '🔫', core: '🌀' } as Record<string, string>)[t.id] ?? '🛠️'}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.name} <span className="text-xs font-normal text-muted">· power {t.power}</span></div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                  {Object.entries(t.cost).map(([k, n]) => k === 'ink'
                    ? <span key={k} className="flex items-center gap-0.5">{n} <ResourceIcon r="ink" className="h-3 w-3" /></span>
                    : <span key={k} className={cn((state.items[k] ?? 0) >= n ? 'text-ok' : '')}>{items[k]?.emoji} {state.items[k] ?? 0}/{n}</span>)}
                  {!Object.keys(t.cost).length && <span>starter tool</span>}
                </div>
              </div>
              {have ? <span className="text-xs font-bold text-ok">Owned</span>
                : <Button size="sm" variant="rainbow" disabled={!ok} loading={busy === t.id} onClick={() => craft(t.id)} data-testid={`craft-${t.id}`}>Craft</Button>}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
