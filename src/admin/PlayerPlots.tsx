// Owner tools on a player: their plots (Crowns first), take one away, change one in place, or give them a new one —
// for event prizes or to make up for a problem. Crowns stay one per kingdom; everything is in the audit log.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { RarityBadge } from '../plot/RarityBadge';
import { PLOT_TYPES } from '../map/plotStyle';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { cn } from '../lib/utils';
import { Button, Switch, inputCls, useConfirm } from '../ui';

type P = { gx: number; gy: number; rarity: string; shiny: boolean; plot_type: string; kingdom: string | null; place: string | null; merged: boolean | null };

export function PlayerPlots({ playerId, username }: { playerId: string; username: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const key = ['admin', 'player-plots', playerId];
  const q = useQuery({ queryKey: key, queryFn: () => api.admin.playerPlots(playerId) });
  const [reason, setReason] = useState('');
  const [edit, setEdit] = useState<{ gx: number; gy: number; rarity: string; shiny: boolean } | null>(null);
  const [give, setGive] = useState({ rarity: 'mythic', shiny: false, type: '', post: true });
  const [near, setNear] = useState<{ gx: number; gy: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const ok = reason.trim().length >= 4;
  const done = (rows: any[]) => { qc.setQueryData(key, rows); void qc.invalidateQueries({ queryKey: ['royalty'] }); };
  const act = async (f: () => Promise<any>, msg: string) => { try { const r = await f(); done(Array.isArray(r) ? r : r.plots); toast.success(msg); return r; } catch (e) { toast.error(toGameError(e).message); } };
  const rows: P[] = q.data ?? [];
  const shown = showAll ? rows : rows.slice(0, 12);

  const take = async (p: P) => {
    if (!(await confirm({ title: `Take this ${rarityInfo(p.rarity).name} from @${username}?`, body: <>It goes back on the map as a plain plot{p.rarity.startsWith('crown') ? ' and the Crown is free for anyone again' : ''}{p.merged ? '. It’s part of a merged canvas, which will be split' : ''}. Reason: <b>{reason}</b></>, confirm: 'Take it' }))) return;
    if (await act(() => api.admin.takePlot(p.gx, p.gy, reason.trim()), 'Plot taken')) setNear({ gx: p.gx, gy: p.gy });
  };

  return (
    <div className="mt-2 grid gap-2 rounded-2xl border border-line p-3" data-testid="player-plots">
      <div className="text-sm font-bold">🗺️ Their plots · {rows.length}</div>
      <input className={cn(inputCls, 'h-9 text-xs')} placeholder="Reason (audited) — e.g. Crown landed in the wrong state" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="plots-reason" />
      {q.isLoading ? <p className="text-xs text-muted">Loading…</p> : !rows.length ? <p className="text-xs text-muted">No plots.</p> : (
        <div className="grid gap-1 text-xs">
          {shown.map((p) => {
            const editing = edit && edit.gx === p.gx && edit.gy === p.gy;
            return (
              <div key={`${p.gx},${p.gy}`} className="flex flex-wrap items-center gap-2" data-testid="player-plot">
                <RarityBadge r={p.rarity} small />{p.shiny && <span>✨</span>}
                <span className="text-muted">{p.kingdom ? `👑 ${p.kingdom}` : p.place ?? `${p.gx}, ${p.gy}`} · {PLOT_TYPES[p.plot_type as keyof typeof PLOT_TYPES]?.name ?? p.plot_type}{p.merged ? ' · merged' : ''}</span>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setEdit(editing ? null : { gx: p.gx, gy: p.gy, rarity: p.rarity, shiny: p.shiny })}>Change</Button>
                  <Button size="sm" variant="danger" className="h-7" disabled={!ok} onClick={() => void take(p)} data-testid="plot-take">Take away</Button>
                </div>
                {editing && (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-surface-2/60 p-2">
                    <select className={cn(inputCls, 'h-8 w-auto')} value={edit.rarity} onChange={(e) => setEdit({ ...edit, rarity: e.target.value })} aria-label="New rarity">
                      {RARITY_ORDER.map((r) => <option key={r} value={r}>{rarityInfo(r).name}</option>)}
                    </select>
                    <Switch id={`edit-shiny-${p.gx}-${p.gy}`} label="Shiny" checked={edit.shiny} onCheckedChange={(v) => setEdit({ ...edit, shiny: v })} />
                    <Button size="sm" className="h-8" disabled={!ok} onClick={async () => { if (await act(() => api.admin.setPlotRarity(p.gx, p.gy, edit.rarity, edit.shiny, reason.trim()), 'Plot changed')) setEdit(null); }}>Save</Button>
                  </div>
                )}
              </div>
            );
          })}
          {rows.length > 12 && <button className="text-left text-xs font-bold text-accent" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button>}
        </div>
      )}
      <div className="grid gap-2 rounded-xl bg-surface-2/40 p-2" data-testid="give-plot">
        <div className="text-xs font-bold">🎁 Give them a plot {near && <span className="font-normal text-muted">· near the one you took</span>}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select className={cn(inputCls, 'h-9 w-auto')} value={give.rarity} onChange={(e) => setGive({ ...give, rarity: e.target.value })} aria-label="Rarity" data-testid="give-rarity">
            {RARITY_ORDER.map((r) => <option key={r} value={r}>{rarityInfo(r).name}</option>)}
          </select>
          <select className={cn(inputCls, 'h-9 w-auto')} value={give.type} onChange={(e) => setGive({ ...give, type: e.target.value })} aria-label="Minigame">
            <option value="">any minigame</option>
            {Object.entries(PLOT_TYPES).map(([id, t]) => <option key={id} value={id}>{t.name} · {t.game}</option>)}
          </select>
          <Switch id={`give-shiny-${playerId}`} label="Shiny" checked={give.shiny} onCheckedChange={(v) => setGive({ ...give, shiny: v })} />
          <Switch id={`give-post-${playerId}`} label="Post on live feed" checked={give.post} onCheckedChange={(v) => setGive({ ...give, post: v })} />
          <Button size="sm" disabled={!ok} data-testid="give-go" onClick={async () => {
            const r = await act(() => api.admin.givePlot(playerId, give.rarity, give.shiny, give.type || null, reason.trim(), give.post, near), `${rarityInfo(give.rarity).name} given`);
            if (r) setNear(null);
          }}>Give</Button>
        </div>
        <p className="text-[11px] text-faint">Lands near where they play{near ? ' (here: next to the plot you just took)' : ''}. A Crown goes to the nearest kingdom whose Crown is free — one per city, state or country, so it can’t double up. Needs the reason above.</p>
      </div>
    </div>
  );
}
