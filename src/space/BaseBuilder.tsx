// The base builder: your plot (or several of yours merged into one) from above. Pick a module from the
// shelf and tap to place it; drag to move, turn it, colour it or take it down. New modules cost
// materials you've dug (and a little Ink); taking one down gives half its materials back.
// BaseVisit is the same view for anyone who comes across a base: look, but don't touch.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Eye, RotateCw, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { BaseModule, PlanetPlot } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, PlayerAvatar, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';

const uid = () => Math.random().toString(36).slice(2, 10);
type Mods = Record<string, { name: string; emoji: string; w: number; d: number }>;

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

/** The base drawn from above (shared by the builder and visitors). */
function BaseFloor({ W, H, M, layout, mods, sel, onPick, onModuleDown, onMove, onUp, boxRef, placingHint }: {
  W: number; H: number; M: number; layout: BaseModule[]; mods: Mods; sel?: string | null;
  onPick?(e: React.PointerEvent): void; onModuleDown?(e: React.PointerEvent, m: BaseModule): void; onMove?(e: React.PointerEvent): void; onUp?(): void;
  boxRef: React.RefObject<HTMLDivElement | null>; placingHint?: string | null;
}) {
  const [box, setBox] = useState({ w: 300, h: 300 });
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, [boxRef]);
  const px = Math.max(4, Math.min(box.w / W, box.h / H));
  const foot = (m: BaseModule) => { const mod = mods[m.k]; const turned = (m.r ?? 0) % 2 === 1; return { w: turned ? mod?.d ?? 1 : mod?.w ?? 1, d: turned ? mod?.w ?? 1 : mod?.d ?? 1 }; };
  return (
    <div data-plot className="relative touch-none rounded-2xl bg-[#3a3f52]"
      style={{ width: W * px, height: H * px, backgroundImage: `linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.28) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.28) 2px, transparent 2px)`, backgroundSize: `${px}px ${px}px, ${px}px ${px}px, ${M * px}px ${M * px}px, ${M * px}px ${M * px}px` }}
      onPointerDown={onPick} onPointerMove={onMove} onPointerUp={onUp} data-testid="base-plot">
      {layout.map((m) => {
        const f = foot(m), mod = mods[m.k];
        return (
          <div key={m.id} className={cn('absolute grid place-items-center rounded-lg border-2 text-center text-lg shadow', sel === m.id ? 'border-[#FFE36B] ring-2 ring-[#FFE36B]/40' : 'border-black/30')}
            style={{ left: (m.x - f.w / 2) * px, top: (H - m.y - f.d / 2) * px, width: f.w * px, height: f.d * px, background: `${m.c ?? '#F2F5FB'}cc` }}
            onPointerDown={onModuleDown ? (e) => onModuleDown(e, m) : undefined} data-testid="base-module">
            <span style={{ fontSize: Math.min(28, Math.max(12, Math.min(f.w, f.d) * px * 0.5)) }}>{mod?.emoji}</span>
          </div>
        );
      })}
      {placingHint && <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs">{placingHint}</div>}
    </div>
  );
}

export function BaseBuilder({ world, plot, mine, onClose, onSaved }: { world: string; plot: PlanetPlot; mine: PlanetPlot[]; onClose(): void; onSaved(): void }) {
  const qc = useQueryClient();
  const cat = useQuery({ queryKey: ['base-catalog'], queryFn: api.baseCatalog });
  const [layout, setLayout] = useState<BaseModule[]>(() => (plot.base?.layout ?? []).map((m) => ({ ...m })));
  const [rev, setRev] = useState(plot.base?.rev ?? 0);
  const [span, setSpan] = useState({ w: plot.base?.w ?? 1, h: plot.base?.h ?? 1 });
  const [placing, setPlacing] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const c = cat.data;
  const M = c?.plot_m ?? 8, W = span.w * M, H = span.h * M;
  const maxMerge = (c?.config as { max_merge?: number } | undefined)?.max_merge ?? 4;
  const maxModules = Math.min((c?.config as { max_modules_total?: number } | undefined)?.max_modules_total ?? 300, (c?.config.max_modules ?? 40) * span.w * span.h);
  const sizes = useMemo(() => baseSizes(plot, mine, maxMerge), [plot, mine, maxMerge]);
  const foot = (m: BaseModule) => { const mod = c!.config.modules[m.k]; const turned = (m.r ?? 0) % 2 === 1; return { w: turned ? mod.d : mod.w, d: turned ? mod.w : mod.d }; };
  const clampTo = (m: BaseModule) => { const f = foot(m); return { ...m, x: Math.min(W - f.w / 2, Math.max(f.w / 2, m.x)), y: Math.min(H - f.d / 2, Math.max(f.d / 2, m.y)) }; };
  const fits = (s: { w: number; h: number }) => layout.every((m) => { const f = foot(m); return m.x + f.w / 2 <= s.w * M + 0.01 && m.y + f.d / 2 <= s.h * M + 0.01; });
  const snap = (v: number) => Math.round(v * 2) / 2;
  const at = (e: React.PointerEvent) => { const r = box.current!.querySelector('[data-plot]')!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: H - ((e.clientY - r.top) / r.height) * H }; };

  const oldIds = useMemo(() => new Set((plot.base?.layout ?? []).map((m) => m.id)), [plot.base?.layout]);
  const cost = useMemo(() => {
    const out: Record<string, number> = {};
    if (!c) return out;
    for (const m of layout) if (!oldIds.has(m.id)) for (const [k, n] of Object.entries(c.config.modules[m.k]?.cost ?? {})) out[k] = (out[k] ?? 0) + n;
    return out;
  }, [layout, oldIds, c]);
  const short = c ? Object.entries(cost).filter(([k, n]) => k !== 'ink' && (c.items[k] ?? 0) < n) : [];

  if (!c) return <div className="absolute inset-0 z-40 grid place-items-center bg-black/80"><Spinner /></div>;
  const selM = layout.find((m) => m.id === sel) ?? null;
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.baseSave(world, plot.gx, plot.gy, layout, rev, span.w, span.h);
      setRev(r.rev); setLayout(r.layout);
      void qc.invalidateQueries({ queryKey: ['base-catalog'] }); void qc.invalidateQueries({ queryKey: ['dig'] }); invalidateGame(qc);
      if (Object.keys(r.spent).length) confettiCannons();
      toast.success(span.w * span.h > 1 ? `Base saved — ${span.w * span.h} plots merged 🏗️` : 'Base saved 🏗️', { description: Object.keys(r.refunded).length ? `Got back ${Object.entries(r.refunded).map(([k, n]) => `${n} ${c.item_info[k]?.emoji ?? k}`).join(', ')}` : undefined });
      onSaved(); onClose();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex flex-col bg-[#0B0E24] text-white" data-testid="base-builder">
      <div className="flex items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={onClose} className="rounded-xl bg-white/10 p-2" aria-label="Close the builder"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><div className="font-display text-lg font-bold leading-tight">Build your base</div><div className="text-[11px] text-white/65">{plot.name || 'Your plot'} · {layout.length}/{maxModules} modules · {W} × {H} m</div></div>
        <Button size="sm" variant="rainbow" loading={busy} disabled={short.length > 0} onClick={save} data-testid="base-save">Save</Button>
      </div>
      {/* how big: merge the plots of yours next door */}
      <div className="no-scrollbar mx-3 flex items-center gap-1.5 overflow-x-auto text-[11px]" data-testid="base-sizes">
        <span className="shrink-0 text-white/60">Size</span>
        {sizes.map((s) => {
          const on = s.w === span.w && s.h === span.h, ok = fits(s);
          return (
            <button key={`${s.w}x${s.h}`} disabled={!ok} onClick={() => setSpan(s)} data-testid={`base-size-${s.w}x${s.h}`}
              className={cn('shrink-0 rounded-full px-2.5 py-1 font-bold', on ? 'bg-[#8B5CFF]' : 'bg-white/10', !ok && 'opacity-35')}
              title={ok ? `${s.w * s.h} plot${s.w * s.h === 1 ? '' : 's'}` : 'Some modules sit outside — move them in first'}>
              {s.w}×{s.h}{s.w * s.h > 1 ? ` · ${s.w * s.h} plots` : ''}
            </button>
          );
        })}
        {sizes.length === 1 && <span className="shrink-0 text-white/55">Own the plots east and north of this one to merge them into a bigger base.</span>}
      </div>
      {/* the base from above */}
      <div ref={box} className="relative mx-3 mt-2 grid min-h-0 flex-1 place-items-center">
        <BaseFloor W={W} H={H} M={M} layout={layout} mods={c.config.modules} sel={sel} boxRef={box}
          placingHint={placing ? `Tap to place your ${c.config.modules[placing].name.toLowerCase()}` : null}
          onPick={(e) => {
            if (!placing) { setSel(null); return; }
            const p = at(e);
            const m = clampTo({ id: uid(), k: placing, x: snap(p.x), y: snap(p.y), r: 0, c: '#F2F5FB' });
            if (layout.length >= maxModules) { toast(span.w * span.h < 16 ? 'This base is full — merge more plots for more room.' : 'This base is full.'); return; }
            setLayout((l) => [...l, m]); setSel(m.id); setPlacing(null);
          }}
          onModuleDown={(e, m) => { e.stopPropagation(); if (placing) return; setSel(m.id); const p = at(e); drag.current = { id: m.id, dx: p.x - m.x, dy: p.y - m.y }; (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); }}
          onMove={(e) => {
            if (!drag.current) return;
            const p = at(e), d = drag.current;
            setLayout((l) => l.map((m) => (m.id === d.id ? clampTo({ ...m, x: snap(p.x - d.dx), y: snap(p.y - d.dy) }) : m)));
          }}
          onUp={() => { drag.current = null; }} />
      </div>
      {selM && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-2xl bg-white/10 p-2" data-testid="base-selected">
          <span className="text-xl">{c.config.modules[selM.k].emoji}</span>
          <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
            {c.config.palette.map((col) => (
              <button key={col} onClick={() => setLayout((l) => l.map((m) => (m.id === selM.id ? { ...m, c: col } : m)))} aria-label={`Colour ${col}`}
                className={cn('h-7 w-7 shrink-0 rounded-full border-2', selM.c === col ? 'border-white' : 'border-transparent')} style={{ background: col }} />
            ))}
          </div>
          <button className="rounded-xl bg-white/10 p-2" onClick={() => setLayout((l) => l.map((m) => (m.id === selM.id ? clampTo({ ...m, r: ((m.r ?? 0) + 1) % 4 }) : m)))} aria-label="Turn" data-testid="base-rotate"><RotateCw className="h-4 w-4" /></button>
          <button className="rounded-xl bg-white/10 p-2" onClick={() => { setLayout((l) => l.filter((m) => m.id !== selM.id)); setSel(null); }} aria-label="Take down" data-testid="base-remove"><Trash2 className="h-4 w-4" /></button>
        </div>
      )}
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {Object.keys(cost).length ? <span className="text-white/60">New modules cost:</span> : <span className="text-white/60">Pick a module below, then tap the base.</span>}
        {Object.entries(cost).map(([k, n]) => k === 'ink'
          ? <span key={k} className="flex items-center gap-0.5 rounded-full bg-white/10 px-2 py-0.5">{n} <ResourceIcon r="ink" className="h-3 w-3" /></span>
          : <span key={k} className={cn('rounded-full px-2 py-0.5', (c.items[k] ?? 0) >= n ? 'bg-white/10' : 'bg-[#FF5C8A]/30')}>{c.item_info[k]?.emoji} {c.items[k] ?? 0}/{n}</span>)}
        {short.length > 0 && <span className="text-[#FF9AB6]">Dig for more {short.map(([k]) => c.item_info[k]?.name ?? k).join(', ')}.</span>}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]" data-testid="base-shelf">
        {Object.entries(c.config.modules).map(([k, mod]) => (
          <button key={k} onClick={() => { setPlacing(placing === k ? null : k); setSel(null); }} data-testid={`base-pick-${k}`}
            className={cn('grid w-[84px] shrink-0 justify-items-center gap-0.5 rounded-2xl p-2 text-center text-[10.5px]', placing === k ? 'bg-[#8B5CFF]' : 'bg-white/10')}>
            <span className="text-2xl">{mod.emoji}</span><b className="w-full truncate">{mod.name}</b>
            <span className="w-full truncate text-white/60">{Object.entries(mod.cost).map(([ck, n]) => (ck === 'ink' ? `${n}💧` : `${n}${c.item_info[ck]?.emoji ?? ''}`)).join(' ')}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** Looking round someone's base (they hear you dropped by). */
export function BaseVisit({ world, gx, gy, onClose }: { world: string; gx: number; gy: number; onClose(): void }) {
  const q = useQuery({ queryKey: ['base-view', world, gx, gy], queryFn: () => api.baseView(world, gx, gy) });
  const box = useRef<HTMLDivElement>(null);
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
              <div className="text-[11px] text-white/65">Built by @{v.owner.username} · {v.modules} module{v.modules === 1 ? '' : 's'} · {v.w * v.plot_m} × {v.h * v.plot_m} m{v.w * v.h > 1 ? ` · ${v.w * v.h} plots merged` : ''}</div>
            </div>
          </>
        ) : <div className="flex-1" />}
      </div>
      <div ref={box} className="relative mx-3 grid min-h-0 flex-1 place-items-center pb-3">
        {q.isLoading && <Spinner />}
        {q.error && <div className="text-sm text-white/70">{toGameError(q.error).message}</div>}
        {v && <BaseFloor W={v.w * v.plot_m} H={v.h * v.plot_m} M={v.plot_m} layout={v.layout} mods={v.catalog.modules} boxRef={box} />}
      </div>
      {v && (
        <div className="flex flex-wrap justify-center gap-1.5 px-3 pb-[max(14px,env(safe-area-inset-bottom,0px))] text-xs" data-testid="base-visit-modules">
          {Object.entries(v.layout.reduce<Record<string, number>>((a, m) => { a[m.k] = (a[m.k] ?? 0) + 1; return a; }, {})).map(([k, n]) => (
            <span key={k} className="rounded-full bg-white/10 px-2.5 py-1 font-bold">{v.catalog.modules[k]?.emoji} {v.catalog.modules[k]?.name} ×{n}</span>
          ))}
          <span className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-white/55"><Eye className="h-3.5 w-3.5" /> @{v.owner.username} will see you dropped by</span>
        </div>
      )}
    </motion.div>
  );
}
