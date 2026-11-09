// The base builder, in 3D: your plot (or several of yours merged into one) as a diorama you can spin round.
// Pick a piece from the shelf and tap the ground (or the top of another piece, to stack) to place it; press
// a piece to drag it. The inspector turns it to any angle, lifts it, resizes it (shapes on each axis), and
// paints it: any main and accent colour, a material (matte, metal, wood, stone; glass, chrome, glow and neon
// with research) and a style variant. Undo, redo, duplicate.
// Bases work, too: the Economy tab shows power, crew, what everything makes an hour, storage, and lets you
// collect and level buildings up; the Research tab spends what your labs come up with.
// BaseVisit is the same 3D view for anyone who comes across a base: look, but don't touch.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Eye, Grid3x3, Home, Lock, Redo2, RotateCcw, RotateCw, Scan, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { BaseCatalog, BaseModDef, BaseModule, BaseState, PlanetPlot } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, PlayerAvatar, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { createBaseScene, type BaseScene } from './base3d';
import { worldOf } from './worlds';
import { poll } from '../lib/poll';

const uid = () => Math.random().toString(36).slice(2, 10);
const MATERIALS_DEFAULT: Record<string, { name: string; req?: string }> = { matte: { name: 'Matte' } };
const SWATCH: Record<string, string> = { matte: '#C9CED9', metal: 'linear-gradient(135deg,#9AA3B5,#E7ECF5 50%,#7C8496)', wood: '#9A6A3E', stone: '#8E8A80', glass: 'linear-gradient(135deg,#BFE3FF88,#ffffff55)', chrome: 'linear-gradient(135deg,#ffffff,#8E99B0 45%,#ffffff 55%,#5D667A)', glow: 'radial-gradient(#FFF3A8,#FFB13D)', neon: 'radial-gradient(#ffffff,#FF4DD8 60%)' };
const PALETTE = ['#F2F5FB', '#C9CED9', '#59647D', '#23263A', '#FF5C8A', '#FF7A3D', '#FFB13D', '#FFE36B', '#4FD18B', '#2FB59A', '#7FE3FF', '#5CA8FF', '#8B5CFF', '#B57BFF', '#D9A066', '#7A5233'];

/** The sizes a base anchored on `plot` can grow to: every plot under it yours, and none with a base of its own. */
export function baseSizes(plot: PlanetPlot, mine: PlanetPlot[], maxMerge = 4) {
  const byKey = new Map(mine.map((p) => [`${p.gx}:${p.gy}`, p]));
  const out: { w: number; h: number }[] = [];
  for (let h = 1; h <= maxMerge; h++) for (let w = 1; w <= maxMerge; w++) {
    let ok = true;
    for (let j = 0; j < h && ok; j++) for (let i = 0; i < w && ok; i++) {
      if (!i && !j) continue;
      const p = byKey.get(`${plot.gx + i}:${plot.gy + j}`);
      const inOther = p?.in_base && !(p.in_base[0] === plot.gx && p.in_base[1] === plot.gy);
      if (!p || inOther || (p.base?.layout.length ?? 0) > 0) ok = false;
    }
    if (ok) out.push({ w, h });
  }
  return out.sort((a, b) => a.w * a.h - b.w * b.h || a.w - b.w);
}

/** A piece's angle in degrees (old layouts stored quarter turns). */
export const angleOf = (m: BaseModule) => m.a ?? (m.r ?? 0) * 90;
/** How far a piece reaches east-west and north-south from its middle, turned to its angle. */
export function reach(m: BaseModule, def: { w: number; d: number } | undefined) {
  const w = (def?.w ?? 1) * (m.sx ?? 1), d = (def?.d ?? 1) * (m.sz ?? 1), a = (angleOf(m) * Math.PI) / 180;
  return { x: Math.abs(Math.cos(a)) * w / 2 + Math.abs(Math.sin(a)) * d / 2, y: Math.abs(Math.sin(a)) * w / 2 + Math.abs(Math.cos(a)) * d / 2 };
}
/** What a new piece costs (shapes by how big they are). */
export function pieceCost(m: BaseModule, def: BaseModDef | undefined) {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(def?.cost ?? {})) out[k] = def?.prim ? Math.max(1, Math.ceil(n * (m.sx ?? 1) * (m.sy ?? 1) * (m.sz ?? 1))) : n;
  return out;
}
/** What a building does, in a few chips. */
function fxChips(def: BaseModDef, info: BaseCatalog['item_info'], mult = 1, drain = 1) {
  const fx = def.fx; if (!fx) return [];
  const out: string[] = [];
  const r = (n: number) => (Math.round(n * mult * 10) / 10).toString();
  const d = (n: number) => (Math.round(n * drain * 10) / 10).toString();
  if (fx.power) out.push(fx.power > 0 ? `+${r(fx.power)} ⚡` : `${d(fx.power)} ⚡`);
  if (fx.crew) out.push(fx.crew > 0 ? `+${r(fx.crew)} 👩‍🚀` : `${d(fx.crew)} 👩‍🚀`);
  for (const [k, n] of Object.entries(fx.out ?? {})) out.push(`${r(n)} ${info[k]?.emoji ?? k}/h`);
  if (fx.ink) out.push(`${r(fx.ink)} 💧/h`);
  if (fx.research) out.push(`${r(fx.research)} 🔬/h`);
  if (fx.convert) out.push(`${Object.entries(fx.convert.from).map(([k, n]) => `${n}${info[k]?.emoji ?? k}`).join('+')}→${Object.entries(fx.convert.to).map(([k, n]) => `${n}${info[k]?.emoji ?? k}`).join('')}`);
  if (fx.sell) out.push(`sells surplus → 💧`);
  if (fx.storage) out.push('+storage');
  if (fx.boost) out.push(`+${Math.round(fx.boost * 100)}% all`);
  return out;
}

/** The 3D view, shared by the builder and visitors. */
function BaseView({ world, W, H, M, layout, sel, sceneRef, onTap, onGrab, onDrag, onDragEnd }: {
  world: string; W: number; H: number; M: number; layout: BaseModule[]; sel?: string | null; sceneRef?: React.MutableRefObject<BaseScene | null>;
  onTap?(at: { x: number; y: number; z: number; id: string | null }): void; onGrab?(id: string): boolean; onDrag?(id: string, x: number, y: number): void; onDragEnd?(id: string): void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const sc = useRef<BaseScene | null>(null);
  const cb = useRef({ onTap, onGrab, onDrag, onDragEnd }); cb.current = { onTap, onGrab, onDrag, onDragEnd };
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!cv.current) return;
    const w = worldOf(world);
    try {
      const s = createBaseScene({
        canvas: cv.current, ground: w?.ground ?? ['#9AA0AE', '#6E7383'], sky: w?.sky ?? ['#0B0E24', '#1B2140'], dark: w?.dark,
        reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        onTap: (a) => cb.current.onTap?.(a), onGrab: (id) => cb.current.onGrab?.(id) ?? false,
        onDrag: (id, x, y) => cb.current.onDrag?.(id, x, y), onDragEnd: (id) => cb.current.onDragEnd?.(id),
      });
      sc.current = s; if (sceneRef) sceneRef.current = s;
      if (import.meta.env.DEV || location.search.includes('e2e=1')) (window as any).__landvasBase = s;
      return () => { s.dispose(); sc.current = null; if (sceneRef) sceneRef.current = null; };
    } catch (e) { console.error(e); setFailed(true); }
  }, [world]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sc.current?.setSize(W, H, M); sc.current?.view(); }, [W, H, M]);
  useEffect(() => { sc.current?.setLayout(layout, sel ?? null); }, [layout, sel]);
  return (
    <div className="relative min-h-0 flex-1">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="base-3d" />
      {failed && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">This device can’t draw the 3D view right now.</div>}
    </div>
  );
}

/** A labelled slider with − / + nudges. */
function Slider({ label, value, min, max, step, onChange, fmt, testid }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; fmt?(v: number): string; testid?: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-12 shrink-0 text-white/65">{label}</span>
      <button type="button" className="rounded-lg bg-white/10 px-2 py-1" onClick={() => onChange(clamp(value - step))} aria-label={`Less ${label}`}>−</button>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-[#8B5CFF]" data-testid={testid} />
      <button type="button" className="rounded-lg bg-white/10 px-2 py-1" onClick={() => onChange(clamp(value + step))} aria-label={`More ${label}`}>+</button>
      <span className="w-11 shrink-0 text-right font-bold tabular-nums">{fmt ? fmt(value) : value}</span>
    </label>
  );
}

function ColourRow({ label, value, onChange, testid }: { label: string; value: string; onChange(c: string): void; testid: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-12 shrink-0 text-white/65">{label}</span>
      <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {PALETTE.map((col) => (
          <button key={col} type="button" onClick={() => onChange(col)} aria-label={`${label} ${col}`}
            className={cn('h-7 w-7 shrink-0 rounded-full border-2', value.toUpperCase() === col ? 'border-white' : 'border-white/10')} style={{ background: col }} />
        ))}
      </div>
      <label className="relative h-7 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 border-white/30" style={{ background: value }} title="Any colour">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" data-testid={testid} />
      </label>
    </div>
  );
}

export function BaseBuilder({ world, plot, mine, onClose, onSaved }: { world: string; plot: PlanetPlot; mine: PlanetPlot[]; onClose(): void; onSaved(): void }) {
  const qc = useQueryClient();
  const cat = useQuery({ queryKey: ['base-catalog'], queryFn: api.baseCatalog });
  const [layout, setLayoutRaw] = useState<BaseModule[]>(() => (plot.base?.layout ?? []).map((m) => ({ ...m })));
  const [rev, setRev] = useState(plot.base?.rev ?? 0);
  const [saved, setSaved] = useState(() => JSON.stringify(plot.base?.layout ?? []));
  const [span, setSpan] = useState({ w: plot.base?.w ?? 1, h: plot.base?.h ?? 1 });
  const [savedSpan, setSavedSpan] = useState(span);
  const grabbed = useRef(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'build' | 'economy' | 'research'>('build');
  const [panel, setPanel] = useState<'move' | 'size' | 'look'>('move');
  const [shelf, setShelf] = useState('build');
  const [snap, setSnap] = useState(0.5);
  const [stack, setStack] = useState(true);
  const hist = useRef<{ past: BaseModule[][]; future: BaseModule[][]; at: number }>({ past: [], future: [], at: 0 });
  const [, bump] = useState(0);
  const sceneRef = useRef<BaseScene | null>(null);

  const c = cat.data;
  const M = c?.plot_m ?? 8, W = span.w * M, H = span.h * M;
  const cfg = c?.config;
  const maxMerge = cfg?.max_merge ?? 4;
  const maxModules = Math.min(cfg?.max_modules_total ?? 600, (cfg?.max_modules ?? 80) * span.w * span.h);
  const unlocked = useMemo(() => new Set(c?.research?.unlocked ?? []), [c?.research?.unlocked]);
  const maxZ = unlocked.has('megastructures') ? cfg?.max_z ?? 24 : 12;
  const [smin, smax] = cfg?.scale ?? [0.25, 4];
  const sizes = useMemo(() => baseSizes(plot, mine, maxMerge), [plot, mine, maxMerge]);
  const def = (k: string) => cfg?.modules[k];
  const oldIds = useMemo(() => new Set((JSON.parse(saved) as BaseModule[]).map((m) => m.id)), [saved]);
  const dirty = JSON.stringify(layout) !== saved || span.w !== savedSpan.w || span.h !== savedSpan.h;

  /** Change the layout, remembering the old one for undo (quick runs of changes, like a slider drag, undo as one). */
  const setLayout = (f: (l: BaseModule[]) => BaseModule[], merge = false) => {
    setLayoutRaw((l) => {
      const now = performance.now();
      if (!merge || now - hist.current.at > 600) { hist.current.past.push(l); if (hist.current.past.length > 80) hist.current.past.shift(); }
      hist.current.at = now; hist.current.future = [];
      return f(l);
    });
    bump((n) => n + 1);
  };
  const undo = () => { const h = hist.current; const p = h.past.pop(); if (!p) return; setLayoutRaw((l) => { h.future.push(l); return p; }); bump((n) => n + 1); };
  const redo = () => { const h = hist.current; const p = h.future.pop(); if (!p) return; setLayoutRaw((l) => { h.past.push(l); return p; }); bump((n) => n + 1); };
  const clampTo = (m: BaseModule): BaseModule => {
    const r = reach(m, def(m.k));
    const x = Math.min(W - r.x, Math.max(r.x, m.x)), y = Math.min(H - r.y, Math.max(r.y, m.y));
    return { ...m, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: m.z ? Math.min(maxZ, Math.max(0, Math.round(m.z * 100) / 100)) : undefined };
  };
  const snapTo = (v: number) => (snap ? Math.round(v / snap) * snap : Math.round(v * 100) / 100);
  const patch = (id: string, p: Partial<BaseModule>, merge = true) => setLayout((l) => l.map((m) => (m.id === id ? clampTo({ ...m, ...p }) : m)), merge);
  const fits = (s: { w: number; h: number }) => layout.every((m) => { const r = reach(m, def(m.k)); return m.x + r.x <= s.w * M + 0.05 && m.y + r.y <= s.h * M + 0.05; });

  const cost = useMemo(() => {
    const out: Record<string, number> = {};
    if (!cfg) return out;
    for (const m of layout) if (!oldIds.has(m.id)) for (const [k, n] of Object.entries(pieceCost(m, cfg.modules[m.k]))) out[k] = (out[k] ?? 0) + n;
    return out;
  }, [layout, oldIds, cfg]);
  const short = c ? Object.entries(cost).filter(([k, n]) => k !== 'ink' && (c.items[k] ?? 0) < n) : [];
  const locked = (k: string) => { const d = def(k); return !!d?.req && !unlocked.has(d.req); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { setLayout((l) => l.filter((m) => m.id !== sel)); setSel(null); }
      else if (e.key === 'Escape') { setPlacing(null); setSel(null); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c || !cfg) return <div className="absolute inset-0 z-40 grid place-items-center bg-black/80"><Spinner /></div>;
  const selM = layout.find((m) => m.id === sel) ?? null;
  const selDef = selM ? def(selM.k) : undefined;
  const ordered = <T,>(o: Record<string, T>, order: string[]) => Object.fromEntries(Object.entries(o).sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99));
  const materials = ordered(cfg.materials ?? MATERIALS_DEFAULT, ['matte', 'metal', 'wood', 'stone', 'glass', 'chrome', 'glow', 'neon']);
  const categories = ordered(cfg.categories ?? { build: { name: 'Pieces', emoji: '🏗️' } }, ['build', 'shape', 'power', 'make', 'decor']);

  const place = (at: { x: number; y: number; z: number; id: string | null }) => {
    if (!placing) {
      setSel(at.id);
      return;
    }
    if (layout.length >= maxModules) { toast(span.w * span.h < 16 ? 'This base is full — merge more plots for more room.' : 'This base is full.'); return; }
    if (locked(placing)) { toast.error(`Research ${cfg.research?.[def(placing)!.req!]?.name ?? 'this'} first.`); return; }
    const z = stack && at.id ? Math.min(maxZ, sceneRef.current?.topOf(at.id) ?? at.z) : 0;
    const prev = selM && selM.k === placing ? selM : null;
    const m = clampTo({ id: uid(), k: placing, x: snapTo(at.x), y: snapTo(at.y), a: prev ? angleOf(prev) : 0, z: z > 0.01 ? z : undefined, c: prev?.c ?? '#F2F5FB', c2: prev?.c2, m: prev?.m, v: prev?.v, sx: prev?.sx, sy: prev?.sy, sz: prev?.sz });
    setLayout((l) => [...l, m]); setSel(m.id); setPlacing(null);
  };
  const duplicate = () => {
    if (!selM) return;
    if (layout.length >= maxModules) { toast('This base is full.'); return; }
    const r = reach(selM, selDef);
    const m = clampTo({ ...selM, id: uid(), x: selM.x + r.x * 2 + 0.2 <= W ? selM.x + r.x * 2 : selM.x - r.x * 2 });
    setLayout((l) => [...l, m]); setSel(m.id);
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.baseSave(world, plot.gx, plot.gy, layout, rev, span.w, span.h);
      setRev(r.rev); setLayoutRaw(r.layout); setSaved(JSON.stringify(r.layout)); setSavedSpan({ w: r.w, h: r.h });
      if (r.state) qc.setQueryData(['base-state', world, plot.gx, plot.gy], r.state);
      void qc.invalidateQueries({ queryKey: ['base-catalog'] }); void qc.invalidateQueries({ queryKey: ['dig'] }); invalidateGame(qc);
      if (Object.keys(r.spent).length) confettiCannons();
      toast.success(span.w * span.h > 1 ? `Base saved — ${span.w * span.h} plots merged 🏗️` : 'Base saved 🏗️', { description: Object.keys(r.refunded).length ? `Got back ${Object.entries(r.refunded).map(([k, n]) => `${n} ${c.item_info[k]?.emoji ?? k}`).join(', ')}` : undefined });
      onSaved();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const close = () => { if (dirty && !confirmClose()) return; onClose(); };
  const confirmClose = () => typeof window === 'undefined' || window.confirm('Leave without saving your changes?');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex flex-col bg-[#0B0E24] text-white" data-testid="base-builder">
      <div className="flex items-center gap-2 p-3 pb-2 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={close} className="rounded-xl bg-white/10 p-2" aria-label="Close the builder"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><div className="truncate font-display text-lg font-bold leading-tight">{plot.name || 'Your base'}</div><div className="text-[11px] text-white/65">{layout.length}/{maxModules} pieces · {W} × {H} m{dirty ? ' · unsaved' : ''}</div></div>
        <Button size="sm" variant="rainbow" loading={busy} disabled={short.length > 0 || !dirty} onClick={save} data-testid="base-save">Save</Button>
      </div>
      <div className="mx-3 flex gap-1 rounded-2xl bg-white/5 p-1 text-xs font-bold" role="tablist">
        {([['build', '🏗️ Build'], ['economy', '⚙️ Economy'], ['research', '🔬 Research']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`base-tab-${k}`} className={cn('flex-1 rounded-xl py-1.5', tab === k ? 'bg-[#8B5CFF]' : 'text-white/70')}>{l}</button>
        ))}
      </div>

      {tab === 'build' && (
        <>
          <div className="no-scrollbar mx-3 mt-2 flex items-center gap-1.5 overflow-x-auto text-[11px]" data-testid="base-sizes">
            <span className="shrink-0 text-white/60">Size</span>
            {sizes.map((s) => {
              const on = s.w === span.w && s.h === span.h, ok = fits(s);
              return (
                <button key={`${s.w}x${s.h}`} disabled={!ok} onClick={() => setSpan(s)} data-testid={`base-size-${s.w}x${s.h}`}
                  className={cn('shrink-0 rounded-full px-2.5 py-1 font-bold', on ? 'bg-[#8B5CFF]' : 'bg-white/10', !ok && 'opacity-35')}
                  title={ok ? `${s.w * s.h} plot${s.w * s.h === 1 ? '' : 's'}` : 'Some pieces sit outside — move them in first'}>
                  {s.w}×{s.h}{s.w * s.h > 1 ? ` · ${s.w * s.h} plots` : ''}
                </button>
              );
            })}
            {sizes.length === 1 && <span className="shrink-0 text-white/55">Own the plots east and north of this one to merge them.</span>}
          </div>
        </>
      )}

      <div className={cn('relative mt-2 flex min-h-0 flex-1 flex-col', tab !== 'build' && 'hidden')}>
        <BaseView world={world} W={W} H={H} M={M} layout={layout} sel={sel} sceneRef={sceneRef}
          onTap={place}
          onGrab={(id) => { if (placing) return false; setSel(id); grabbed.current = false; return true; }}
          onDrag={(id, x, y) => setLayoutRaw((l) => { if (!grabbed.current) { grabbed.current = true; hist.current.past.push(l); hist.current.future = []; } return l.map((m) => (m.id === id ? clampTo({ ...m, x: snapTo(x), y: snapTo(y) }) : m)); })}
          onDragEnd={() => bump((n) => n + 1)} />
        {/* view tools */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between">
          <div className="pointer-events-auto flex flex-col gap-1.5">
            <button onClick={undo} disabled={!hist.current.past.length} className="rounded-xl bg-black/55 p-2 disabled:opacity-30" aria-label="Undo" data-testid="base-undo"><Undo2 className="h-4 w-4" /></button>
            <button onClick={redo} disabled={!hist.current.future.length} className="rounded-xl bg-black/55 p-2 disabled:opacity-30" aria-label="Redo" data-testid="base-redo"><Redo2 className="h-4 w-4" /></button>
          </div>
          {placing && <div className="pointer-events-none rounded-full bg-black/65 px-3 py-1 text-xs" data-testid="base-placing">Tap to place: {def(placing)?.emoji} {def(placing)?.name}{stack ? ' · tap a piece to stack' : ''}</div>}
          <div className="pointer-events-auto flex flex-col gap-1.5">
            <button onClick={() => sceneRef.current?.view('home')} className="rounded-xl bg-black/55 p-2" aria-label="Reset the view"><Home className="h-4 w-4" /></button>
            <button onClick={() => sceneRef.current?.view('top')} className="rounded-xl bg-black/55 p-2" aria-label="View from above"><Scan className="h-4 w-4" /></button>
            <button onClick={() => setSnap(snap === 1 ? 0.5 : snap === 0.5 ? 0.25 : snap === 0.25 ? 0 : 1)} className="rounded-xl bg-black/55 px-1.5 py-1 text-[10px] font-bold" aria-label="Snap" data-testid="base-snap"><Grid3x3 className="mx-auto h-4 w-4" />{snap ? `${snap} m` : 'free'}</button>
            <button onClick={() => setStack(!stack)} className={cn('rounded-xl px-1.5 py-1 text-[10px] font-bold', stack ? 'bg-[#8B5CFF]/80' : 'bg-black/55')} aria-label="Stack on pieces">🧱<br />stack</button>
          </div>
        </div>
      </div>

      {tab === 'build' && selM && selDef && (
        <div className="mx-3 mt-2 rounded-2xl bg-white/10 p-2" data-testid="base-selected">
          <div className="flex items-center gap-1.5">
            <span className="text-xl">{selDef.emoji}</span>
            <div className="min-w-0 flex-1 truncate text-sm font-bold">{selDef.name}</div>
            {(['move', 'size', 'look'] as const).map((p) => (
              <button key={p} onClick={() => setPanel(p)} data-testid={`base-panel-${p}`} className={cn('rounded-lg px-2 py-1 text-[11px] font-bold capitalize', panel === p ? 'bg-[#8B5CFF]' : 'bg-white/10')}>{p}</button>
            ))}
            <button className="rounded-lg bg-white/10 p-1.5" onClick={duplicate} aria-label="Duplicate" data-testid="base-dup"><Copy className="h-4 w-4" /></button>
            <button className="rounded-lg bg-white/10 p-1.5" onClick={() => { setLayout((l) => l.filter((m) => m.id !== selM.id)); setSel(null); }} aria-label="Take down" data-testid="base-remove"><Trash2 className="h-4 w-4" /></button>
            <button className="rounded-lg bg-white/10 p-1.5" onClick={() => setSel(null)} aria-label="Done"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 space-y-1.5">
            {panel === 'move' && (
              <>
                <Slider label="Turn" value={Math.round(angleOf(selM))} min={0} max={359} step={snap ? 15 : 1} fmt={(v) => `${v}°`} testid="base-angle"
                  onChange={(v) => patch(selM.id, { a: ((v % 360) + 360) % 360, r: undefined })} />
                <Slider label="Height" value={selM.z ?? 0} min={0} max={maxZ} step={0.1} fmt={(v) => `${v.toFixed(1)} m`} testid="base-z" onChange={(v) => patch(selM.id, { z: v || undefined })} />
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-12 shrink-0 text-white/65">Nudge</span>
                  {([[ArrowLeft, -1, 0, 'west'], [ArrowRight, 1, 0, 'east'], [ArrowUp, 0, 1, 'north'], [ArrowDown, 0, -1, 'south']] as const).map(([I, dx, dy, n]) => (
                    <button key={n} className="rounded-lg bg-white/10 p-1.5" aria-label={`Nudge ${n}`} onClick={() => patch(selM.id, { x: selM.x + dx * (snap || 0.1), y: selM.y + dy * (snap || 0.1) })}><I className="h-4 w-4" /></button>
                  ))}
                  <button className="rounded-lg bg-white/10 p-1.5" aria-label="Turn left" onClick={() => patch(selM.id, { a: (angleOf(selM) + 270) % 360, r: undefined }, false)}><RotateCcw className="h-4 w-4" /></button>
                  <button className="rounded-lg bg-white/10 p-1.5" aria-label="Turn right" onClick={() => patch(selM.id, { a: (angleOf(selM) + 90) % 360, r: undefined }, false)} data-testid="base-rotate"><RotateCw className="h-4 w-4" /></button>
                  <span className="ml-auto text-white/55">{selM.x.toFixed(1)}, {selM.y.toFixed(1)} m</span>
                </div>
              </>
            )}
            {panel === 'size' && (selDef.prim ? (
              <>
                <Slider label="Width" value={selM.sx ?? 1} min={smin} max={smax} step={0.05} fmt={(v) => `${(v * selDef.w).toFixed(2)} m`} testid="base-sx" onChange={(v) => patch(selM.id, { sx: v === 1 ? undefined : v })} />
                <Slider label="Height" value={selM.sy ?? 1} min={smin} max={smax} step={0.05} fmt={(v) => `${(v * (selDef.h ?? 1)).toFixed(2)} m`} testid="base-sy" onChange={(v) => patch(selM.id, { sy: v === 1 ? undefined : v })} />
                <Slider label="Depth" value={selM.sz ?? 1} min={smin} max={smax} step={0.05} fmt={(v) => `${(v * selDef.d).toFixed(2)} m`} testid="base-sz" onChange={(v) => patch(selM.id, { sz: v === 1 ? undefined : v })} />
                <div className="text-[10px] text-white/50">Shapes cost by size: this one costs {Object.entries(pieceCost(selM, selDef)).map(([k, n]) => `${n} ${c.item_info[k]?.emoji ?? (k === 'ink' ? '💧' : k)}`).join(', ')}{oldIds.has(selM.id) ? ' (already paid)' : ''}.</div>
              </>
            ) : (
              <Slider label="Scale" value={selM.sx ?? 1} min={Math.max(0.5, smin)} max={Math.min(2, smax)} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} testid="base-scale"
                onChange={(v) => patch(selM.id, v === 1 ? { sx: undefined, sy: undefined, sz: undefined } : { sx: v, sy: v, sz: v })} />
            ))}
            {panel === 'look' && (
              <>
                <ColourRow label="Main" value={selM.c ?? '#F2F5FB'} onChange={(col) => patch(selM.id, { c: col })} testid="base-colour" />
                <ColourRow label="Accent" value={selM.c2 ?? '#59647D'} onChange={(col) => patch(selM.id, { c2: col })} testid="base-colour2" />
                <div className="no-scrollbar flex items-center gap-1 overflow-x-auto text-[11px]" data-testid="base-materials">
                  <span className="w-12 shrink-0 text-white/65">Finish</span>
                  {Object.entries(materials).map(([k, mt]) => {
                    const lock = !!mt.req && !unlocked.has(mt.req);
                    const on = (selM.m ?? 'matte') === k;
                    return (
                      <button key={k} disabled={lock} onClick={() => patch(selM.id, { m: k === 'matte' ? undefined : k }, false)} data-testid={`base-mat-${k}`}
                        title={lock ? `Research ${cfg.research?.[mt.req!]?.name ?? mt.req}` : mt.name}
                        className={cn('flex shrink-0 items-center gap-1 rounded-full py-1 pl-1 pr-2', on ? 'bg-[#8B5CFF]' : 'bg-white/10', lock && 'opacity-45')}>
                        <span className="h-4 w-4 rounded-full border border-white/30" style={{ background: SWATCH[k] ?? '#999' }} />{mt.name}{lock && <Lock className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="w-12 shrink-0 text-white/65">Style</span>
                  {[0, 1, 2].map((v) => (
                    <button key={v} onClick={() => patch(selM.id, { v: v || undefined }, false)} data-testid={`base-style-${v}`} className={cn('rounded-full px-3 py-1 font-bold', (selM.v ?? 0) === v ? 'bg-[#8B5CFF]' : 'bg-white/10')}>{['Classic', 'Trim', 'Fancy'][v]}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'build' && !selM && (
        <>
          <div className="mx-3 mt-2 flex min-h-[20px] flex-wrap items-center gap-1.5 text-[11px]">
            {Object.keys(cost).length ? <span className="text-white/60">New pieces cost:</span> : <span className="text-white/60">{placing ? 'Tap the ground to place it — press a piece to drag it.' : 'Pick a piece, then tap the ground. Drag with one finger to look round, pinch to zoom.'}</span>}
            {Object.entries(cost).map(([k, n]) => k === 'ink'
              ? <span key={k} className="flex items-center gap-0.5 rounded-full bg-white/10 px-2 py-0.5">{n} <ResourceIcon r="ink" className="h-3 w-3" /></span>
              : <span key={k} className={cn('rounded-full px-2 py-0.5', (c.items[k] ?? 0) >= n ? 'bg-white/10' : 'bg-[#FF5C8A]/30')}>{c.item_info[k]?.emoji} {c.items[k] ?? 0}/{n}</span>)}
            {short.length > 0 && <span className="text-[#FF9AB6]">Dig for more {short.map(([k]) => c.item_info[k]?.name ?? k).join(', ')}.</span>}
          </div>
          <div className="no-scrollbar mx-3 mt-2 flex gap-1 overflow-x-auto text-[11px]" data-testid="base-cats">
            {Object.entries(categories).map(([k, cg]) => (
              <button key={k} onClick={() => setShelf(k)} data-testid={`base-cat-${k}`} className={cn('shrink-0 rounded-full px-3 py-1 font-bold', shelf === k ? 'bg-white text-[#0B0E24]' : 'bg-white/10')}>{cg.emoji} {cg.name}</button>
            ))}
          </div>
        </>
      )}
      {tab === 'build' && !selM && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]" data-testid="base-shelf">
          {Object.entries(cfg.modules).filter(([, m]) => (m.cat ?? 'build') === shelf || !cfg.categories).map(([k, mod]) => {
            const lock = locked(k);
            const fx = fxChips(mod, c.item_info);
            return (
              <button key={k} onClick={() => { if (lock) { toast(`Research ${cfg.research?.[mod.req!]?.name ?? mod.req} to build this.`, { action: { label: 'Research', onClick: () => setTab('research') } }); return; } setPlacing(placing === k ? null : k); setSel(null); }} data-testid={`base-pick-${k}`}
                className={cn('relative grid w-[92px] shrink-0 justify-items-center gap-0.5 rounded-2xl p-2 text-center text-[10.5px]', placing === k ? 'bg-[#8B5CFF]' : 'bg-white/10', lock && 'opacity-55')}>
                {lock && <Lock className="absolute right-1.5 top-1.5 h-3 w-3" />}
                <span className="text-2xl">{mod.emoji}</span><b className="w-full truncate">{mod.name}</b>
                <span className="w-full truncate text-white/60">{Object.entries(mod.cost).map(([ck, n]) => (ck === 'ink' ? `${n}💧` : `${n}${c.item_info[ck]?.emoji ?? ''}`)).join(' ')}</span>
                {fx.length > 0 && <span className="w-full truncate text-[9.5px] text-[#9FFFD0]">{fx.slice(0, 2).join(' ')}</span>}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'economy' && <Economy world={world} plot={plot} layout={JSON.parse(saved) as BaseModule[]} cat={c} dirty={dirty} />}
      {tab === 'research' && <Research cat={c} />}
    </motion.div>
  );
}

function Bar({ have, need, label, color }: { have: number; need: number; label: string; color: string }) {
  const k = need > 0 ? Math.min(1, have / need) : 1;
  return (
    <div className="text-[11px]">
      <div className="flex justify-between"><span className="text-white/70">{label}</span><b className={cn(need > have && 'text-[#FF9AB6]')}>{have} / {need || 0}</b></div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${k * 100}%`, background: need > have ? '#FF5C8A' : color }} /></div>
    </div>
  );
}

function Economy({ world, plot, layout, cat, dirty }: { world: string; plot: PlanetPlot; layout: BaseModule[]; cat: BaseCatalog; dirty: boolean }) {
  const qc = useQueryClient();
  const key = ['base-state', world, plot.gx, plot.gy];
  const has = layout.length > 0;
  const q = useQuery({ queryKey: key, queryFn: () => api.baseState(world, plot.gx, plot.gy), enabled: has, refetchInterval: poll(120_000) });
  const [busy, setBusy] = useState<string | null>(null);
  const s = q.data;
  const info = cat.item_info;
  const run = async (what: string, f: () => Promise<BaseState>, ok: (r: BaseState) => void) => {
    setBusy(what);
    try { const r = await f(); qc.setQueryData(key, r); invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['base-catalog'] }); void qc.invalidateQueries({ queryKey: ['dig'] }); ok(r); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  if (!has) return <div className="grid flex-1 place-items-center p-6 text-center text-sm text-white/70">Build and save your base first — then working buildings (power, habitats, drills, labs, trading posts…) show up here.</div>;
  if (q.isLoading || !s) return <div className="grid flex-1 place-items-center">{q.error ? <span className="text-sm text-white/70">{toGameError(q.error).message}</span> : <Spinner />}</div>;
  const e = s.econ;
  const stored = Object.entries(s.storage).filter(([, n]) => n > 0);
  const anything = stored.length > 0 || s.ink_pending > 0 || s.research_pending > 0;
  const working = e.buildings.map((b) => ({ ...b, def: cat.config.modules[b.k], m: layout.find((x) => x.id === b.id) })).filter((b) => b.def);
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-[max(16px,env(safe-area-inset-bottom,0px))]" data-testid="base-economy">
      {dirty && <div className="rounded-xl bg-[#FFB13D]/20 px-3 py-2 text-xs">You have unsaved changes — this shows your base as it was last saved.</div>}
      <div className="grid gap-2 rounded-2xl bg-white/10 p-3">
        <Bar label="⚡ Power" have={e.power.supply} need={e.power.demand} color="#FFE36B" />
        <Bar label="👩‍🚀 Crew" have={e.crew.have} need={e.crew.need} color="#7FE3FF" />
        <div className="flex items-center justify-between text-xs"><span className="text-white/70">Running at</span><b className={cn('text-base', e.efficiency < 1 ? 'text-[#FF9AB6]' : 'text-[#4FD18B]')} data-testid="base-eff">{Math.round(e.efficiency * 100)}%</b></div>
        {e.efficiency < 1 && <div className="text-[11px] text-[#FF9AB6]">Short on {e.power.supply < e.power.demand ? 'power — add solar panels, wind turbines or a generator' : 'crew — add habitat pods or domes'}. Everything runs slower until then.</div>}
        {e.boost > 0 && <div className="text-[11px] text-[#9FFFD0]">📡 Antennas: +{Math.round(e.boost * 100)}% to everything</div>}
      </div>
      <div className="rounded-2xl bg-white/10 p-3">
        <div className="mb-1 text-xs font-bold">Every hour</div>
        <div className="flex flex-wrap gap-1.5 text-xs" data-testid="base-rates">
          {Object.entries(e.out).map(([k, n]) => <span key={k} className="rounded-full bg-white/10 px-2 py-0.5">{info[k]?.emoji ?? k} {Math.round(n * 10) / 10}</span>)}
          {e.ink > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5">💧 {Math.round(e.ink * 10) / 10}</span>}
          {e.research > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5">🔬 {Math.round(e.research * 10) / 10}</span>}
          {e.convert.map((cv, i) => <span key={i} className="rounded-full bg-white/10 px-2 py-0.5">{Object.entries(cv.from).map(([k, n]) => `${n}${info[k]?.emoji ?? k}`).join('+')} → {Object.entries(cv.to).map(([k, n]) => `${n}${info[k]?.emoji ?? k}`).join('')} ×{Math.round(cv.rate * 10) / 10}</span>)}
          {e.sell.length > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5">🏪 sells surplus for 💧</span>}
          {!Object.keys(e.out).length && !e.ink && !e.research && !e.convert.length && <span className="text-white/60">Nothing yet — build drill rigs, condensers, greenhouses or a lab from the Production shelf.</span>}
        </div>
      </div>
      <div className="rounded-2xl bg-white/10 p-3">
        <div className="mb-1 flex items-center justify-between text-xs"><b>Storage</b><span className="text-white/60">up to {e.storage_cap} of each · fills for up to 12 h</span></div>
        <div className="flex flex-wrap gap-1.5 text-xs" data-testid="base-storage">
          {stored.map(([k, n]) => <span key={k} className="rounded-full bg-white/10 px-2 py-0.5">{info[k]?.emoji ?? k} {n}</span>)}
          {s.ink_pending > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5">💧 {s.ink_pending}</span>}
          {s.research_pending > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5">🔬 {s.research_pending}</span>}
          {!anything && <span className="text-white/60">Empty — check back later.</span>}
        </div>
        <Button className="mt-2 w-full" variant="rainbow" disabled={!anything} loading={busy === 'collect'} data-testid="base-collect"
          onClick={() => run('collect', () => api.baseCollect(world, plot.gx, plot.gy), (r) => {
            const got = Object.entries(r.collected ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${info[k]?.emoji ?? k}`);
            if (r.ink) got.push(`${r.ink} Ink`); if (r.research_gained) got.push(`${r.research_gained} research`);
            toast.success('Collected! 📦', { description: got.join(', ') || undefined }); if (got.length) confettiCannons();
          })}>Collect</Button>
      </div>
      <div className="rounded-2xl bg-white/10 p-3">
        <div className="mb-1.5 text-xs font-bold">Working buildings</div>
        <div className="space-y-1.5" data-testid="base-buildings">
          {working.map((b) => {
            const up = s.upgrades[b.id] ?? {};
            const can = Object.entries(up).every(([k, n]) => k === 'ink' || (cat.items[k] ?? 0) >= n);
            const max = b.lv >= (cat.config.max_level ?? 10);
            return (
              <div key={b.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-2 py-1.5 text-xs">
                <span className="text-xl">{b.def.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{b.def.name} <span className="rounded-full bg-[#8B5CFF]/60 px-1.5 text-[10px]">Lv {b.lv}</span></div>
                  <div className="truncate text-[10px] text-white/60">{fxChips(b.def, info, Math.pow(1.5, b.lv - 1), 1 + 0.2 * (b.lv - 1)).join(' · ')}</div>
                </div>
                {max ? <span className="text-[10px] text-white/60">Max</span> : (
                  <Button size="sm" variant="secondary" disabled={!can} loading={busy === b.id} data-testid={`base-up-${b.id}`}
                    onClick={() => run(b.id, () => api.baseUpgrade(world, plot.gx, plot.gy, b.id), () => toast.success(`${b.def.name} → level ${b.lv + 1} ⬆️`))}>
                    ⬆ {Object.entries(up).map(([k, n]) => `${n}${k === 'ink' ? '💧' : info[k]?.emoji ?? k}`).join(' ')}
                  </Button>
                )}
              </div>
            );
          })}
          {!working.length && <div className="text-[11px] text-white/60">No working buildings yet. Power, habitats and everything on the Production shelf work for you.</div>}
        </div>
      </div>
    </div>
  );
}

function Research({ cat }: { cat: BaseCatalog }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const r = cat.research ?? { points: 0, unlocked: [] };
  const nodes = Object.entries(cat.config.research ?? {}).sort((a, b) => a[1].cost - b[1].cost);
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pb-[max(16px,env(safe-area-inset-bottom,0px))]" data-testid="base-research">
      <div className="flex items-center justify-between rounded-2xl bg-white/10 p-3">
        <div><div className="text-xs text-white/65">Research points</div><div className="font-display text-2xl font-bold" data-testid="base-points">🔬 {r.points}</div></div>
        <div className="max-w-[55%] text-right text-[11px] text-white/60">Research labs make points every hour — collect them from the Economy tab.</div>
      </div>
      {nodes.map(([k, n]) => {
        const have = r.unlocked.includes(k);
        return (
          <div key={k} className={cn('flex items-center gap-3 rounded-2xl p-3', have ? 'bg-[#4FD18B]/15' : 'bg-white/10')}>
            <span className="text-2xl">{n.emoji}</span>
            <div className="min-w-0 flex-1"><div className="text-sm font-bold">{n.name}</div><div className="text-[11px] text-white/65">{n.desc}</div></div>
            {have ? <span className="text-xs font-bold text-[#4FD18B]">✓ Done</span> : (
              <Button size="sm" variant="secondary" disabled={r.points < n.cost} loading={busy === k} data-testid={`research-${k}`}
                onClick={async () => {
                  setBusy(k);
                  try { await api.researchBuy(k); await qc.invalidateQueries({ queryKey: ['base-catalog'] }); toast.success(`${n.emoji} ${n.name} researched!`); confettiCannons(); }
                  catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
                }}>🔬 {n.cost}</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Looking round someone's base, in 3D (they hear you dropped by). */
export function BaseVisit({ world, gx, gy, onClose }: { world: string; gx: number; gy: number; onClose(): void }) {
  const q = useQuery({ queryKey: ['base-view', world, gx, gy], queryFn: () => api.baseView(world, gx, gy) });
  const v = q.data;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex flex-col bg-[#0B0E24] text-white" data-testid="base-visit">
      <div className="flex items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={onClose} className="rounded-xl bg-white/10 p-2" aria-label="Leave the base"><X className="h-5 w-5" /></button>
        {v ? (
          <>
            <PlayerAvatar p={v.owner} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-lg font-bold leading-tight">{v.name || `@${v.owner.username}’s base`}</div>
              <div className="text-[11px] text-white/65">Built by @{v.owner.username} · {v.modules} piece{v.modules === 1 ? '' : 's'} · {v.w * v.plot_m} × {v.h * v.plot_m} m{v.w * v.h > 1 ? ` · ${v.w * v.h} plots merged` : ''}</div>
            </div>
          </>
        ) : <div className="flex-1" />}
      </div>
      {q.isLoading && <div className="grid flex-1 place-items-center"><Spinner /></div>}
      {q.error && <div className="grid flex-1 place-items-center text-sm text-white/70">{toGameError(q.error).message}</div>}
      {v && <BaseView world={world} W={v.w * v.plot_m} H={v.h * v.plot_m} M={v.plot_m} layout={v.layout} />}
      {v && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-[max(14px,env(safe-area-inset-bottom,0px))] pt-2 text-xs" data-testid="base-visit-modules">
          {Object.entries(v.layout.reduce<Record<string, number>>((a, m) => { a[m.k] = (a[m.k] ?? 0) + 1; return a; }, {})).map(([k, n]) => (
            <span key={k} className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 font-bold">{v.catalog.modules[k]?.emoji} {v.catalog.modules[k]?.name} ×{n}</span>
          ))}
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-white/55"><Eye className="h-3.5 w-3.5" /> @{v.owner.username} will see you dropped by</span>
        </div>
      )}
    </motion.div>
  );
}
