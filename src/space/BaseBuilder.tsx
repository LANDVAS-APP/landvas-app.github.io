// The base builder: your 8 x 8 m plot from above. Pick a module from the shelf and tap the plot to
// place it; drag to move, turn it, colour it or take it down. New modules cost materials you've dug
// (and a little Ink); taking one down gives half its materials back. Everyone on the world sees it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { RotateCw, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { BaseModule, PlanetPlot } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { digKey } from './Dig';

const uid = () => Math.random().toString(36).slice(2, 10);

export function BaseBuilder({ world, plot, onClose, onSaved }: { world: string; plot: PlanetPlot; onClose(): void; onSaved(): void }) {
  const qc = useQueryClient();
  const cat = useQuery({ queryKey: ['base-catalog'], queryFn: api.baseCatalog });
  const [layout, setLayout] = useState<BaseModule[]>(() => (plot.base?.layout ?? []).map((m) => ({ ...m })));
  const [rev, setRev] = useState(plot.base?.rev ?? 0);
  const [placing, setPlacing] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [size, setSize] = useState(300);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.min(el.clientWidth, el.clientHeight)));
    ro.observe(el); return () => ro.disconnect();
  }, [!!cat.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = cat.data;
  const M = c?.plot_m ?? 8, px = size / M;
  const foot = (m: BaseModule) => { const mod = c!.config.modules[m.k]; const turned = (m.r ?? 0) % 2 === 1; return { w: turned ? mod.d : mod.w, d: turned ? mod.w : mod.d }; };
  const clampTo = (m: BaseModule) => { const f = foot(m); return { ...m, x: Math.min(M - f.w / 2, Math.max(f.w / 2, m.x)), y: Math.min(M - f.d / 2, Math.max(f.d / 2, m.y)) }; };
  const snap = (v: number) => Math.round(v * 2) / 2;
  const at = (e: React.PointerEvent) => { const r = box.current!.querySelector('[data-plot]')!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * M, y: M - ((e.clientY - r.top) / r.height) * M }; };

  // what the changes cost against what you have
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
      const r = await api.baseSave(world, plot.gx, plot.gy, layout, rev);
      setRev(r.rev); setLayout(r.layout);
      void qc.invalidateQueries({ queryKey: ['base-catalog'] }); void qc.invalidateQueries({ queryKey: digKey(world) }); invalidateGame(qc);
      if (Object.keys(r.spent).length) confettiCannons();
      toast.success('Base saved 🏗️', { description: Object.keys(r.refunded).length ? `Got back ${Object.entries(r.refunded).map(([k, n]) => `${n} ${c.item_info[k]?.emoji ?? k}`).join(', ')}` : undefined });
      onSaved(); onClose();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex flex-col bg-[#0B0E24] text-white" data-testid="base-builder">
      <div className="flex items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={onClose} className="rounded-xl bg-white/10 p-2" aria-label="Close the builder"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><div className="font-display text-lg font-bold leading-tight">Build your base</div><div className="text-[11px] text-white/65">{plot.name || 'Your plot'} · {layout.length}/{c.config.max_modules} modules · 8 × 8 m</div></div>
        <Button size="sm" variant="rainbow" loading={busy} disabled={short.length > 0} onClick={save} data-testid="base-save">Save</Button>
      </div>
      {/* the plot from above */}
      <div ref={box} className="relative mx-3 grid min-h-0 flex-1 place-items-center">
        <div data-plot className="relative touch-none rounded-2xl bg-[#3a3f52]" style={{ width: size, height: size, backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: `${px}px ${px}px` }}
          onPointerDown={(e) => {
            if (!placing) { setSel(null); return; }
            const p = at(e);
            const m = clampTo({ id: uid(), k: placing, x: snap(p.x), y: snap(p.y), r: 0, c: '#F2F5FB' });
            if (layout.length >= c.config.max_modules) { toast('This plot is full.'); return; }
            setLayout((l) => [...l, m]); setSel(m.id); setPlacing(null);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const p = at(e), d = drag.current;
            setLayout((l) => l.map((m) => (m.id === d.id ? clampTo({ ...m, x: snap(p.x - d.dx), y: snap(p.y - d.dy) }) : m)));
          }}
          onPointerUp={() => { drag.current = null; }} data-testid="base-plot">
          {layout.map((m) => {
            const f = foot(m), mod = c.config.modules[m.k];
            return (
              <div key={m.id} className={cn('absolute grid place-items-center rounded-lg border-2 text-center text-lg shadow', sel === m.id ? 'border-[#FFE36B] ring-2 ring-[#FFE36B]/40' : 'border-black/30')}
                style={{ left: (m.x - f.w / 2) * px, top: (M - m.y - f.d / 2) * px, width: f.w * px, height: f.d * px, background: `${m.c ?? '#F2F5FB'}cc` }}
                onPointerDown={(e) => { e.stopPropagation(); if (placing) return; setSel(m.id); const p = at(e); drag.current = { id: m.id, dx: p.x - m.x, dy: p.y - m.y }; (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); }}
                data-testid="base-module">
                <span style={{ fontSize: Math.min(28, Math.max(12, Math.min(f.w, f.d) * px * 0.5)) }}>{mod?.emoji}</span>
              </div>
            );
          })}
          {placing && <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs">Tap the plot to place your {c.config.modules[placing].name.toLowerCase()}</div>}
        </div>
      </div>
      {/* the selected module */}
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
      {/* cost of the changes */}
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {Object.keys(cost).length ? <span className="text-white/60">New modules cost:</span> : <span className="text-white/60">Pick a module below, then tap the plot.</span>}
        {Object.entries(cost).map(([k, n]) => k === 'ink'
          ? <span key={k} className="flex items-center gap-0.5 rounded-full bg-white/10 px-2 py-0.5">{n} <ResourceIcon r="ink" className="h-3 w-3" /></span>
          : <span key={k} className={cn('rounded-full px-2 py-0.5', (c.items[k] ?? 0) >= n ? 'bg-white/10' : 'bg-[#FF5C8A]/30')}>{c.item_info[k]?.emoji} {c.items[k] ?? 0}/{n}</span>)}
        {short.length > 0 && <span className="text-[#FF9AB6]">Dig for more {short.map(([k]) => c.item_info[k]?.name ?? k).join(', ')}.</span>}
      </div>
      {/* the shelf */}
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
