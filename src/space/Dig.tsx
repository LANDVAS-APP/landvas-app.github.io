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
import { reportActivity } from '../social/activity';

export const digKey = (world: string, gx?: number, gy?: number) => ['dig', world, gx ?? null, gy ?? null] as const;
const layerAt = (layers: MineLayer[], depth: number) => layers.findIndex((l) => depth < l.to) === -1 ? layers.length - 1 : layers.findIndex((l) => depth < l.to);
const coreLabel = (depth: number, bottom: number, cored: boolean) => (cored ? 'the core is yours' : `${((depth / bottom) * 100).toFixed(depth / bottom < 0.01 ? 2 : 1)}% of the way to the core`);
const fmtDepth = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(m < 100 ? 1 : 0)} m`);

export function DigPanel({ world, w, plot, pose, onClose, onDug }: { world: string; w: World; plot: { gx: number; gy: number; name?: string | null }; pose(): number[] | null; onClose(): void; onDug?(depth: number, cored: boolean): void }) {
  const qc = useQueryClient();
  const key = digKey(world, plot.gx, plot.gy);
  const q = useQuery({ queryKey: key, queryFn: () => api.digState(world, plot.gx, plot.gy) });
  const [core, setCore] = useState<{ ink: number } | null>(null);
  const [state, setState] = useState<DigState | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [banner, setBanner] = useState<{ name: string; ink: number } | null>(null);
  const haptics = useUi((st) => st.settings.haptics);
  const reduce = useUi((st) => st.settings.reduceMotion);
  useEffect(() => { if (q.data) setState(q.data); }, [q.data]);
  useEffect(() => { reportActivity('dig', { world }); return () => reportActivity(null); }, [world]);
  const live = useRef({ pending: 0, shown: 0, target: 0, sending: false, holding: false, lastTap: 0, pops: [] as { x: number; y: number; text: string; life: number }[], shake: 0 });
  const st = useRef(state); st.current = state;
  const cv = useRef<HTMLCanvasElement>(null);

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
        const items = s.config.items;
        let k = 0;
        for (const [id, qty] of Object.entries(r.finds ?? {})) {
          L.pops.push({ x: 0.3 + Math.random() * 0.4, y: 0.62 + (k++ % 3) * 0.05, text: `+${qty} ${items[id]?.emoji ?? '✨'}`, life: 0 });
        }
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

  // the cross-section
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const g = c.getContext('2d')!;
    let raf = 0, last = performance.now();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = st.current; if (!s) return;
      const L = live.current;
      if (L.holding && now - L.lastTap > 1000 / 5) tap();
      L.shown += (Math.max(L.target, L.shown) - L.shown) * Math.min(1, dt * 6);
      const r = c.getBoundingClientRect(); const W = r.width, H = r.height;
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const layers = s.config.layers;
      // a window of ~24 m round the drill head; the surface shows when you're near the top
      const span = 24, head = L.shown, top = Math.max(-6, head - span * 0.6);
      const yOf = (m: number) => ((m - top) / span) * H;
      // sky
      const sky = g.createLinearGradient(0, 0, 0, yOf(0));
      sky.addColorStop(0, w.sky[0]); sky.addColorStop(1, w.sky[1]);
      g.fillStyle = sky; g.fillRect(0, 0, W, Math.max(0, yOf(0)));
      // layers, with a few speckles of what's in them
      let from = 0;
      for (const l of layers) {
        const y0 = yOf(from), y1 = yOf(l.to);
        if (y1 > 0 && y0 < H) {
          g.fillStyle = l.color; g.fillRect(0, Math.max(0, y0), W, Math.min(H, y1) - Math.max(0, y0));
          for (let i = Math.floor(Math.max(from, top)); i < Math.min(l.to, top + span); i++) {
            const k = (i * 9301 + 49297) % 233280;
            g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.ellipse((k % W), yOf(i + 0.5), 6 + (k % 9), 3 + (k % 4), 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(((k * 7) % W), yOf(i + 0.2), 2 + (k % 3), 0, Math.PI * 2); g.fill();
          }
          if (y0 > 0) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '700 12px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillText(`${l.name} · ${fmtDepth(from)}`, 10, y0 + 16); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y0, W, 2); }
        }
        from = l.to;
      }
      // the shaft and your drill
      const sx = W / 2, sw = 34;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(sx - sw / 2, Math.max(0, yOf(0)), sw, yOf(head) - Math.max(0, yOf(0)));
      g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 2; for (let y = Math.max(0, yOf(0)); y < yOf(head); y += 18) { g.beginPath(); g.moveTo(sx - sw / 2, y); g.lineTo(sx + sw / 2, y); g.stroke(); }
      L.shake = Math.max(0, L.shake - dt * 4);
      const hx = sx + (reduce ? 0 : Math.sin(now / 20) * 3 * L.shake), hy = yOf(head);
      g.fillStyle = '#FFC93D'; g.beginPath(); g.moveTo(hx - 16, hy - 18); g.lineTo(hx + 16, hy - 18); g.lineTo(hx, hy + 6); g.closePath(); g.fill();
      g.fillStyle = '#59647D'; g.fillRect(hx - 12, hy - 34, 24, 16);
      if (L.shake > 0) for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(hx - 20 + Math.random() * 40, hy - 6 + Math.random() * 12, 3, 3); }
      for (let i = L.pops.length - 1; i >= 0; i--) {
        const p = L.pops[i]; p.life += dt; if (p.life > 1.4) { L.pops.splice(i, 1); continue; }
        g.globalAlpha = 1 - p.life / 1.4; g.font = '800 20px ui-rounded, system-ui'; g.textAlign = 'center';
        g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.strokeText(p.text, p.x * W, (p.y - p.life * 0.08) * H); g.fillStyle = '#FFE36B'; g.fillText(p.text, p.x * W, (p.y - p.life * 0.08) * H);
        g.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [!!state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state && !live.current.target) { live.current.target = Number(state.depth); live.current.shown = Number(state.depth); } }, [!!state]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = () => {
    const s = st.current, L = live.current; if (!s) return;
    if (s.cored) { if (!L.holding) toast('You’ve reached the core of this plot — there’s nowhere deeper!'); L.holding = false; return; }
    if (s.energy - L.pending < 1) { if (!L.holding) toast('Out of digging energy — it refills over time.'); L.holding = false; return; }
    L.lastTap = performance.now(); L.pending++; L.shake = 1;
    const li = layerAt(s.config.layers, L.target);
    L.target = Math.min(s.config.layers[s.config.layers.length - 1].to, L.target + s.power / s.config.layers[li].hardness); // optimistic; the server has the last word
    if (haptics) buzz('light');
  };

  if (!state) return <div className="absolute inset-0 z-40 grid place-items-center bg-black/80"><Spinner /></div>;
  const layers = state.config.layers;
  const li = layerAt(layers, Number(state.depth));
  const energyPct = Math.round((state.energy / state.energy_max) * 100);
  const tool = [...state.config.tools].reverse().find((t) => state.tools.includes(t.id)) ?? state.config.tools[0];
  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 26, stiffness: 260 }} className="absolute inset-x-0 bottom-0 z-40 flex h-[60%] flex-col rounded-t-3xl border-t border-white/15 bg-black/90 text-white shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur" data-testid="dig-panel">
      <div className="flex items-center gap-2 p-3">
        <button onClick={onClose} className="rounded-xl bg-white/10 p-2" aria-label="Back to the surface"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold leading-tight">{plot.name || 'Your plot'} · <span data-testid="dig-depth">{fmtDepth(Number(state.depth))}</span>{state.cored && <span className="ml-1">💖</span>}</div>
          <div className="text-[11px] text-white/65">{layers[li].name} · {tool.name} digs {(state.power / layers[li].hardness).toFixed(2)} m a tap · {coreLabel(Number(state.depth), layers[layers.length - 1].to, !!state.cored)}</div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setToolsOpen(true)} data-testid="dig-tools"><Hammer className="h-4 w-4" /> Tools</Button>
      </div>
      <div className="px-3">
        <div className="flex items-center gap-2 text-[11px]"><Zap className="h-3.5 w-3.5 text-[#FFC93D]" />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#FFC93D]" style={{ width: `${energyPct}%` }} /></div>
          <span className="tnum">{state.energy}/{state.energy_max}</span>
        </div>
        {!!state.party && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-full bg-[#8B5CFF]/30 px-2.5 py-1 text-[11px] font-bold" data-testid="dig-party">
            🎉 Dig party · {state.party} digging with you · ×{state.party_mult} speed
          </div>
        )}
        {/* every layer, down to the crust */}
        <div className="mt-2 flex h-2 overflow-hidden rounded-full" title="Layers">
          {layers.map((l, i) => <div key={l.id} className={cn('h-full', i <= li ? '' : 'opacity-30')} style={{ background: l.color, flex: Math.log(l.to - (layers[i - 1]?.to ?? 0) + 10) }} />)}
        </div>
      </div>
      <div className="relative mt-2 min-h-0 flex-1 touch-none select-none"
        onPointerDown={(e) => { e.preventDefault(); tap(); live.current.holding = true; }} onPointerUp={() => { live.current.holding = false; }} onPointerLeave={() => { live.current.holding = false; }} onPointerCancel={() => { live.current.holding = false; }}
        data-testid="dig-area">
        <canvas ref={cv} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/70">Tap — or hold — to dig</div>
        <AnimatePresence>{core && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-4 top-8 z-10 mx-auto max-w-sm rounded-3xl border-2 border-[#FFB020] bg-gradient-to-b from-[#3B1205]/95 to-black/95 p-5 text-center shadow-[0_0_60px_rgba(255,140,30,0.6)]" data-testid="dig-core">
            <div className="text-5xl">💖</div>
            <div className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-[#FFB020]">You reached the core</div>
            <div className="font-display text-2xl font-black">The heart of {w.name.replace('The ', 'the ')}</div>
            <div className="mt-2 text-sm text-white/80">A <b>Core heart</b> is yours, and this plot is now <b className="text-[#FF7A1A]">Core</b> rarity — the rarest there is. Everyone can see its glow.</div>
            <div className="mt-2 flex items-center justify-center gap-1 text-lg font-bold">+{core.ink.toLocaleString()} <ResourceIcon r="ink" className="h-5 w-5" /></div>
            <Button className="mt-3" variant="rainbow" onClick={() => setCore(null)}>Amazing</Button>
          </motion.div>
        )}</AnimatePresence>
        <AnimatePresence>{banner && (
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit rounded-2xl bg-black/75 px-4 py-3 text-center" data-testid="dig-layer">
            <div className="text-xs font-bold uppercase tracking-widest text-white/60">You broke through to</div>
            <div className="font-display text-2xl font-black">{banner.name}</div>
            {banner.ink > 0 && <div className="flex items-center justify-center gap-1 text-sm">+{banner.ink} <ResourceIcon r="ink" className="h-4 w-4" /></div>}
          </motion.div>
        )}</AnimatePresence>
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]" data-testid="dig-items">
        {Object.entries(state.config.items).filter(([id]) => state.items[id]).map(([id, it]) => (
          <span key={id} className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">{it.emoji} {state.items[id]}</span>
        ))}
        {!Object.keys(state.items).length && <span className="text-xs text-white/55">Nothing found yet — materials turn up as you dig.</span>}
      </div>
      <ToolsDialog open={toolsOpen} onOpenChange={setToolsOpen} state={state} onCrafted={(r) => { const merged = { ...state, ...r, depth: state.depth, layers_reached: state.layers_reached, cored: state.cored, my_shafts: state.my_shafts }; setState(merged); qc.setQueryData(key, merged); invalidateGame(qc); }} />
    </motion.div>
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
