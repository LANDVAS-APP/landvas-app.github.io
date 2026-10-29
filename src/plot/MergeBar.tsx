// Merge mode: tap any of your plots on the map to pick their canvases, then merge
// them all at once. Only your own touching canvases can merge (the server checks).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Combine, MousePointerClick, Sparkles, X } from 'lucide-react';
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

const cellsOf = (gs: CanvasGroup[]) => gs.flatMap((g) => g.cells.map((c) => [c[0], c[1]] as CellTuple));

/** Every one of your canvases that touches the picked ones (directly or through each other). */
export function touchingGroups(all: CanvasGroup[], picked: string[]): string[] {
  const active = all.filter((g) => g.status === 'active');
  const owner = new Map<string, string>();
  for (const g of active) for (const c of g.cells) owner.set(`${c[0]}_${c[1]}`, g.id);
  const out = new Set(picked);
  const queue = [...picked];
  while (queue.length) {
    const g = active.find((x) => x.id === queue.shift());
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
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!merge) return null;
  const all = (groups.data ?? []).filter((g) => g.status === 'active');
  const picked = all.filter((g) => merge.includes(g.id));
  const plots = picked.reduce((n, g) => n + g.plot_count, 0);
  const connected = picked.length >= 2 && isConnected(cellsOf(picked));
  const pieces = picked.length >= 2 ? components(cellsOf(picked)).length : 0;
  const cost = useFuseCost(picked.map((x) => x.id), connected);
  const price = cost.data?.ink ?? 0;
  const short = !!cost.data && price > cost.data.balance;
  const more = touchingGroups(all, merge.length ? merge : all.slice(0, 1).map((g) => g.id)).length - merge.length;
  const go = async () => {
    setBusy(true);
    try {
      const g = await api.fuseGroups(picked.map((x) => x.id));
      celebrate(g.achievements);
      invalidateGame(qc);
      setMerge(null);
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
            <div className="font-display font-semibold">Merge plots</div>
            <p className="text-xs text-muted">
              {picked.length === 0 ? <><MousePointerClick className="mr-1 inline h-3.5 w-3.5" />Tap your plots on the map to pick them.</>
                : picked.length === 1 ? 'Now tap the plots next to it — or select everything touching.'
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
          <Button size="sm" variant="rainbow" className="ml-auto" disabled={!connected || short} loading={busy} onClick={go} data-testid="merge-go">
            <Combine className="h-4 w-4" /> Merge {picked.length >= 2 ? `${plots} plots` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
