// The app's Merge studio: every plot you own, laid out as it sits on the map (each island of touching plots its own
// board), coloured by rarity or type. Drag across plots to pick them, then merge them into one canvas — or switch to
// Unmerge and drag across plots to split them back off. The server has the final say (touching, same type, Ink).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Combine, Scissors, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { CanvasGroup } from '../backend/types';
import { celebrate, invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { buzz } from '../native/native';
import { rarityInfo } from '../shared/rarity';
import { ResourceIcon } from '../ui';
import { kindOf } from './mergeKind';

export const useMergeStudio = create<{ open: boolean; focus: string | null; show(focus?: string | null): void; hide(): void }>((set) => ({
  open: false, focus: null, show: (focus = null) => set({ open: true, focus }), hide: () => set({ open: false }),
}));

type Plot = { gx: number; gy: number; plot_type: string; rarity: string; level: number; group_id: string | null; name: string | null };
const key = (x: number, y: number) => `${x}_${y}`;
const KIND_ICON: Record<string, string> = { canvas: '🎨', base: '🟩', habitat: '🌳', farm: '🌾', business: '🍋', arcade: '🕹️', home: '🏡', landlord: '🏘️', train: '🚆', plane: '✈️' };

export function MergeStudio() {
  const open = useMergeStudio((s) => s.open);
  const hide = useMergeStudio((s) => s.hide);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="merge" className="lv-sheet lv-merge" role="dialog" aria-label="Merge plots" data-testid="merge-studio"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%', transition: { duration: 0.22, ease: 'easeIn' } }} transition={{ type: 'spring', stiffness: 340, damping: 36 }}>
          <Studio onClose={hide} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Studio({ onClose }: { onClose(): void }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const focus = useMergeStudio((s) => s.focus);
  const plotsQ = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me });
  const groupsQ = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const [mode, setMode] = useState<'merge' | 'unmerge'>('merge');
  const [color, setColor] = useState<'rarity' | 'type'>('rarity');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(focus ? [focus] : [])); // groups (merge) or cells (unmerge)
  const [busy, setBusy] = useState(false);
  const plots = (plotsQ.data ?? []) as Plot[];
  const groups = (groupsQ.data ?? []) as CanvasGroup[];
  const groupOf = useMemo(() => new Map(groups.filter((g) => g.status === 'active').map((g) => [g.id, g])), [groups]);
  const byCell = useMemo(() => new Map(plots.map((p) => [key(p.gx, p.gy), p])), [plots]);
  // islands: plots that touch (side by side), biggest first
  const islands = useMemo(() => {
    const seen = new Set<string>(), out: Plot[][] = [];
    for (const p of plots) {
      const k0 = key(p.gx, p.gy);
      if (seen.has(k0)) continue;
      const isl: Plot[] = [], q = [p]; seen.add(k0);
      while (q.length) {
        const c = q.pop()!; isl.push(c);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = key(c.gx + dx, c.gy + dy), n = byCell.get(k);
          if (n && !seen.has(k)) { seen.add(k); q.push(n); }
        }
      }
      out.push(isl);
    }
    return out.sort((a, b) => b.length - a.length);
  }, [plots, byCell]);
  useEffect(() => setPicked(new Set()), [mode]);

  // what's picked, and whether it can merge: same type, all touching, at least two canvases
  const pickedGroups = mode === 'merge' ? [...picked].filter((id) => groupOf.has(id)) : [];
  const sameKind = pickedGroups.every((id) => kindOf(groups, id) === kindOf(groups, pickedGroups[0]));
  const touching = useMemo(() => {
    if (pickedGroups.length < 2) return true;
    const inPick = new Map<string, string>();
    for (const id of pickedGroups) for (const c of groupOf.get(id)!.cells) inPick.set(key(c[0], c[1]), id);
    const reached = new Set([pickedGroups[0]]), q = [pickedGroups[0]];
    while (q.length) {
      const id = q.pop()!;
      for (const c of groupOf.get(id)!.cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = inPick.get(key(c[0] + dx, c[1] + dy));
        if (o && !reached.has(o)) { reached.add(o); q.push(o); }
      }
    }
    return reached.size === pickedGroups.length;
  }, [pickedGroups.join(','), groupOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const canMerge = pickedGroups.length >= 2 && sameKind && touching;
  const cost = useQuery({ queryKey: ['fuse-cost', [...pickedGroups].sort().join(',')], queryFn: () => api.fuseCost(pickedGroups), enabled: canMerge, staleTime: 10_000 });
  const pickedCells = mode === 'unmerge' ? [...picked] : [];

  // drag to pick: the first plot you touch decides whether the drag adds or removes
  const drag = useRef<{ add: boolean; done: Set<string> } | null>(null);
  const idOf = (p: Plot) => (mode === 'merge' ? p.group_id : key(p.gx, p.gy));
  const apply = (p: Plot | undefined) => {
    if (!p || !drag.current) return;
    if (mode === 'unmerge' && !(p.group_id && (groupOf.get(p.group_id)?.plot_count ?? 1) > 1)) return; // only merged plots split off
    const id = idOf(p);
    if (!id || drag.current.done.has(id)) return;
    drag.current.done.add(id);
    setPicked((s) => { const n = new Set(s); if (drag.current!.add) n.add(id); else n.delete(id); return n; });
    buzz('light');
  };
  const at = (e: React.PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const k = el?.closest<HTMLElement>('[data-cell]')?.dataset.cell;
    return k ? byCell.get(k) : undefined;
  };
  const down = (e: React.PointerEvent) => {
    const p = at(e); if (!p) return;
    const id = idOf(p);
    drag.current = { add: !id || !picked.has(id), done: new Set() };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    apply(p);
  };
  const move = (e: React.PointerEvent) => { if (drag.current) apply(at(e)); };
  const up = () => { drag.current = null; };

  const merge = async () => {
    setBusy(true);
    try {
      const r = await api.fuseGroups(pickedGroups);
      celebrate(r.achievements); buzz('success');
      toast.success(`Merged into one ${r.plot_count}-plot canvas`, { description: r.name });
      setPicked(new Set()); invalidateGame(qc);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.groups }), qc.invalidateQueries({ queryKey: qk.myPlots })]);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const unmerge = async () => {
    setBusy(true);
    try {
      const by = new Map<string, [number, number][]>();
      for (const k of pickedCells) { const p = byCell.get(k); if (p?.group_id) by.set(p.group_id, [...(by.get(p.group_id) ?? []), [p.gx, p.gy]]); }
      let n = 0;
      for (const [gid, cells] of by) { await api.detachPlots(gid, cells); n += cells.length; }
      buzz('success'); toast.success(`${n} plot${n === 1 ? '' : 's'} split off into their own canvas${n === 1 ? '' : 'es'}`);
      setPicked(new Set()); invalidateGame(qc);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.groups }), qc.invalidateQueries({ queryKey: qk.myPlots })]);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };

  const vw = typeof innerWidth === 'number' ? innerWidth : 390;
  const loading = plotsQ.isLoading || groupsQ.isLoading;
  const hint = mode === 'merge'
    ? pickedGroups.length === 0 ? 'Drag across your plots to pick the canvases to merge'
      : !sameKind ? 'Only plots of the same type can merge'
      : !touching ? 'The picked plots need to touch each other'
      : pickedGroups.length < 2 ? 'Pick at least one more canvas next to it' : null
    : pickedCells.length === 0 ? 'Drag across merged plots to split them off' : null;

  return (
    <div className="flex h-full flex-col pt-[max(10px,env(safe-area-inset-top,0px))]">
      <div className="flex items-start justify-between gap-3 px-4">
        <div>
          <div className="lv-ribbon">Merge studio</div>
          <h2 className="font-display text-[24px] font-black leading-tight">{mode === 'merge' ? 'Merge plots' : 'Unmerge plots'}</h2>
          <p className="text-[12px] font-semibold text-white/50">{fmt(plots.length)} plots · {fmt(islands.length)} island{islands.length === 1 ? '' : 's'} · {fmt(groupOf.size)} canvases</p>
        </div>
        <button className="lv-sheet-close !static" onClick={onClose} aria-label="Close" data-testid="merge-close"><X className="h-5 w-5" /></button>
      </div>
      <div className="mt-3 flex gap-2 px-4">
        <div className="lv-seg2" role="tablist">
          {(['merge', 'unmerge'] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} className={cn(mode === m && 'on')} onClick={() => setMode(m)} data-testid={`merge-mode-${m}`}>{m === 'merge' ? <><Combine className="h-4 w-4" /> Merge</> : <><Scissors className="h-4 w-4" /> Unmerge</>}</button>)}
        </div>
        <div className="lv-seg2 ml-auto" role="tablist">
          {(['rarity', 'type'] as const).map((c) => <button key={c} role="tab" aria-selected={color === c} className={cn(color === c && 'on')} onClick={() => setColor(c)}>{c === 'rarity' ? 'Rarity' : 'Type'}</button>)}
        </div>
      </div>
      <div className="mt-3 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="merge-boards">
        {loading && <div className="grid place-items-center py-20"><span className="lv-loader"><i /><i /><i /></span></div>}
        {!loading && !plots.length && <p className="py-16 text-center text-sm text-white/60">You don’t own any plots yet — claim some next to each other, then merge them here.</p>}
        {islands.map((isl, ii) => {
          const xs = isl.map((p) => p.gx), ys = isl.map((p) => p.gy);
          const x0 = Math.min(...xs), y0 = Math.min(...ys), cols = Math.max(...xs) - x0 + 1, rows = Math.max(...ys) - y0 + 1;
          const size = Math.max(16, Math.min(46, Math.floor((vw - 56) / cols)));
          return (
            <div key={ii} className="lv-island" data-testid="merge-island">
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/45"><span>Island {ii + 1}</span><span>{isl.length} plot{isl.length === 1 ? '' : 's'}</span></div>
              <div className="no-scrollbar overflow-x-auto">
                <div className="relative" style={{ width: cols * size, height: rows * size, touchAction: 'none' }}>
                  {isl.map((p) => {
                    const g = p.group_id ? groupOf.get(p.group_id) : undefined;
                    const same = (dx: number, dy: number) => byCell.get(key(p.gx + dx, p.gy + dy))?.group_id === p.group_id && !!p.group_id;
                    const id = idOf(p);
                    const on = !!id && picked.has(id);
                    const fill = color === 'rarity' ? rarityInfo(p.rarity).color : (PLOT_TYPES[p.plot_type as keyof typeof PLOT_TYPES]?.a ?? '#556');
                    const edge = 'rgba(10,12,34,0.95)';
                    return (
                      <div key={key(p.gx, p.gy)} data-cell={key(p.gx, p.gy)} className={cn('lv-mcell', on && 'on', mode === 'unmerge' && !(g && g.plot_count > 1) && 'dim')}
                        style={{ left: (p.gx - x0) * size, top: (p.gy - y0) * size, width: size, height: size, ['--c' as string]: fill,
                          borderTopColor: same(0, -1) ? 'transparent' : edge, borderBottomColor: same(0, 1) ? 'transparent' : edge, borderLeftColor: same(-1, 0) ? 'transparent' : edge, borderRightColor: same(1, 0) ? 'transparent' : edge }}>
                        {size >= 30 && g && (g.plot_count === 1 || (same(-1, 0) === false && same(0, -1) === false)) && <span className="k">{KIND_ICON[g.kind ?? 'canvas'] ?? '🎨'}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="lv-mergebar">
        {hint ? <div className="text-center text-[12.5px] font-bold text-white/60" data-testid="merge-hint">{hint}</div> : null}
        {mode === 'merge' ? (
          <button className="lv-btn lv-rainbow h-14 w-full text-[16px]" disabled={!canMerge || busy || cost.isLoading} onClick={() => void merge()} data-testid="merge-go">
            <Combine className="h-5 w-5" /> Merge {pickedGroups.length >= 2 ? `${pickedGroups.length} canvases` : ''}
            {canMerge && cost.data && <span className="ml-1 inline-flex items-center gap-1 rounded-xl bg-black/25 px-2 py-1 text-[13px]">{cost.data.ink ? <><ResourceIcon r="ink" className="h-3.5 w-3.5" />{fmt(cost.data.ink)}</> : 'free'}</span>}
          </button>
        ) : (
          <button className="lv-btn bad h-14 w-full text-[16px]" disabled={!pickedCells.length || busy} onClick={() => void unmerge()} data-testid="unmerge-go">
            <Scissors className="h-5 w-5" /> Split off {pickedCells.length ? `${pickedCells.length} plot${pickedCells.length === 1 ? '' : 's'}` : ''}
          </button>
        )}
        {picked.size > 0 && <button className="text-[12px] font-bold text-white/50" onClick={() => setPicked(new Set())}>Clear selection</button>}
      </div>
    </div>
  );
}
