// Merge mode: tap any of your plots on the map to pick their canvases, then merge
// them all at once. Only your own touching canvases can merge (the server checks).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Combine, Hand, MousePointerClick, Paintbrush, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { CanvasGroup } from '../backend/types';
import { celebrate, invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { components, isConnected } from '../shared/fusion';
import type { CellTuple } from '../shared/grid';
import { Button } from '../ui';
import { cn } from '../lib/utils';
import { useMapFx } from '../map/MapFx';
import { buzz } from '../native/native';
import { KIND_LABEL, kindOf, pickKind } from './mergeKind';

const cellsOf = (gs: CanvasGroup[]) => gs.flatMap((g) => g.cells.map((c) => [c[0], c[1]] as CellTuple));

/** Every one of your canvases of the same type that touches the picked ones (directly or through each other). */
export function touchingGroups(all: CanvasGroup[], picked: string[]): string[] {
  const kind = picked.length ? kindOf(all, picked[0]) : null;
  const active = all.filter((g) => g.status === 'active' && (!kind || (g.kind ?? 'canvas') === kind));
  const owner = new Map<string, string>();
  for (const g of active) for (const c of g.cells) owner.set(`${c[0]}_${c[1]}`, g.id);
  const out = new Set(picked);
  const queue = [...picked];
  while (queue.length) {
    // take the id first: inside find() it would never run on an empty list (and loop forever)
    const id = queue.shift();
    const g = active.find((x) => x.id === id);
    if (!g) continue;
    for (const [x, y] of g.cells) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = owner.get(`${x + dx}_${y + dy}`);
        if (id && !out.has(id)) { out.add(id); queue.push(id); }
      }
    }
  }
  return [...out];
}

/** What merging these canvases costs (Ink for every plot that joins the largest one). */
export function useFuseCost(ids: string[], enabled = true) {
  const key = [...ids].sort();
  return useQuery({ queryKey: ['fuse-cost', ...key], queryFn: () => api.fuseCost(key), enabled: enabled && key.length >= 2, staleTime: 15_000 });
}

export function startMerge(groupId?: string | null) {
  useUi.getState().setMerge(groupId ? [groupId] : []);
}

export function MergeBar() {
  const me = useOnboardedMe();
  const merge = useUi((s) => s.merge);
  const setMerge = useUi((s) => s.setMerge);
  const tool = useUi((s) => s.mergeTool);
  const setTool = useUi((s) => s.setMergeTool);
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const all = (groups.data ?? []).filter((g) => g.status === 'active');
  const picked = merge ? all.filter((g) => merge.includes(g.id)) : [];
  const kind = pickKind(all, merge ?? []);
  const mixed = picked.some((g) => (g.kind ?? 'canvas') !== kind);
  const pickedConnected = !mixed && picked.length >= 2 && isConnected(cellsOf(picked));
  // hooks run before any early return
  const cost = useFuseCost(picked.map((x) => x.id), pickedConnected);
  if (!merge) return null;
  const plots = picked.reduce((n, g) => n + g.plot_count, 0);
  const connected = pickedConnected;
  const pieces = picked.length >= 2 ? components(cellsOf(picked)).length : 0;
  const price = cost.data?.ink ?? 0;
  const short = !!cost.data && price > cost.data.balance;
  const more = touchingGroups(all, merge.length ? merge : all.slice(0, 1).map((g) => g.id)).length - merge.length;
  const go = async () => {
    setBusy(true);
    const pieces = picked.map((x) => x.cells.map((c) => [c[0], c[1]] as CellTuple));
    try {
      const g = await api.fuseGroups(picked.map((x) => x.id));
      // the plots pull together, their seams dissolve and one outline traces the new canvas
      setMerge(null);
      useMapFx.getState().playMerge(pieces);
      if (useUi.getState().settings.haptics) buzz('success');
      celebrate(g.achievements);
      invalidateGame(qc);
      toast.success(`Merged into one canvas of ${g.plot_count} plots`, { action: { label: 'Paint it', onClick: () => nav(`/create/${g.id}`) } });
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally { setBusy(false); }
  };
  return (
    <div className="gutter pointer-events-none absolute inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center md:bottom-6" data-testid="merge-bar">
      <div className="pointer-events-auto glass grid w-full max-w-xl gap-3 rounded-[24px] border-accent-2/50 p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-2/15 text-accent-2"><Combine className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="font-display font-semibold">Merge {kind ? KIND_LABEL[kind].many : 'plots'} {kind ? KIND_LABEL[kind].emoji : ''}</div>
            <p className="text-xs text-muted">
              {picked.length === 0 ? <><MousePointerClick className="mr-1 inline h-3.5 w-3.5" />Drag across your plots (or tap them) to pick them.</>
                : picked.length === 1 ? `Now tap the ${KIND_LABEL[kind ?? 'canvas'].many} next to it — or select everything touching. Only the same type of plot can merge.`
                : mixed ? <span className="text-warn">Only plots of the same type can merge — take out the others.</span>
                : connected ? <><b className="text-fg">{picked.length} canvases · {plots} plots</b> ready to become one{price > 0 ? <> for <b className="text-fg tnum">{price} Ink</b></> : ''}.{short && <span className="text-warn"> You need {price - (cost.data?.balance ?? 0)} more Ink.</span>}</>
                : <span className="text-warn">These are in {pieces} separate groups — merged plots must touch.</span>}
            </p>
          </div>
          <button onClick={() => setMerge(null)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Stop merging"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={more <= 0} onClick={() => setMerge(touchingGroups(all, merge.length ? merge : [all[0].id]))} data-testid="merge-select-touching">
            <Sparkles className="h-4 w-4" /> Select all touching{more > 0 ? ` (+${more})` : ''}
          </Button>
          {picked.length > 0 && <Button size="sm" variant="ghost" onClick={() => setMerge([])}>Clear</Button>}
          <div className="flex rounded-xl bg-surface-2 p-0.5" role="radiogroup" aria-label="What dragging does">
            <button role="radio" aria-checked={tool === 'pick'} onClick={() => setTool('pick')} title="Drag across plots to pick them" className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold', tool === 'pick' ? 'bg-surface text-fg shadow' : 'text-muted')} data-testid="merge-tool-pick"><Paintbrush className="h-3.5 w-3.5" /> Pick</button>
            <button role="radio" aria-checked={tool === 'pan'} onClick={() => setTool('pan')} title="Drag to move the map" className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold', tool === 'pan' ? 'bg-surface text-fg shadow' : 'text-muted')} data-testid="merge-tool-pan"><Hand className="h-3.5 w-3.5" /> Move</button>
          </div>
          <Button size="sm" variant="rainbow" className="ml-auto" disabled={!connected || short} loading={busy} onClick={go} data-testid="merge-go">
            <Combine className="h-4 w-4" /> Merge {picked.length >= 2 ? `${plots} plots` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
