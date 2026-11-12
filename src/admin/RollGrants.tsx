// Event rolls: line up a specific rarity on a player's chosen upcoming roll (next, 10th, 100th…), for prizes. Owner only;
// nobody else's odds change; every grant and delivery is in the audit log.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { RarityBadge } from '../plot/RarityBadge';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { cn, timeAgo } from '../lib/utils';
import { Button, Switch, inputCls } from '../ui';

function GrantList({ rows, onCancel, showPlayer }: { rows: any[]; onCancel(id: number): void; showPlayer?: boolean }) {
  if (!rows.length) return <p className="text-xs text-muted">No event rolls lined up.</p>;
  return (
    <div className="grid gap-1 text-xs" data-testid="roll-grants">
      {rows.map((g) => (
        <div key={g.id} className={cn('flex flex-wrap items-center gap-2', (g.used_at || g.cancelled_at) && 'opacity-50')}>
          <RarityBadge r={g.rarity} small />{g.shiny && <span>✨</span>}
          {showPlayer && <b>@{g.player.username}</b>}
          <span className="text-muted">{g.used_at ? `landed ${timeAgo(g.used_at)}` : g.cancelled_at ? 'cancelled' : g.in === 1 ? 'on their next roll' : `in ${g.in} rolls`}{g.rarity.startsWith('crown') && !g.used_at && !g.cancelled_at ? ' (first claim in a free kingdom)' : ''}</span>
          {g.note && <span className="text-faint">· {g.note}</span>}
          {!g.used_at && !g.cancelled_at && <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => onCancel(g.id)}>Cancel</Button>}
        </div>
      ))}
    </div>
  );
}

/** on a player: line one up, see theirs */
export function RollGrants({ playerId }: { playerId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'roll-grants', playerId], queryFn: () => api.admin.rollGrants(playerId) });
  const [f, setF] = useState({ rarity: 'mythic', after: 1, count: 1, shiny: false, note: '' });
  const done = (r: any) => { qc.setQueryData(['admin', 'roll-grants', playerId], r); void qc.invalidateQueries({ queryKey: ['admin', 'roll-grants', null] }); };
  const grant = async () => { try { done(await api.admin.grantRoll(playerId, f.rarity, f.after, f.count, f.shiny, f.note || null)); toast.success(`${rarityInfo(f.rarity).name} lined up`); } catch (e) { toast.error(toGameError(e).message); } };
  const cancel = async (id: number) => { try { done(await api.admin.cancelRollGrant(id)); } catch (e) { toast.error(toGameError(e).message); } };
  return (
    <div className="mt-2 grid gap-2 rounded-2xl border border-line p-3" data-testid="roll-grant-form">
      <div className="text-sm font-bold">🎲 Event rolls</div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className={cn(inputCls, 'h-9 w-auto')} value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })} aria-label="Rarity" data-testid="grant-rarity">
          {RARITY_ORDER.map((r) => <option key={r} value={r}>{rarityInfo(r).name}</option>)}
        </select>
        <label className="flex items-center gap-1">on roll <input type="number" min={1} max={100000} className={cn(inputCls, 'h-9 w-20')} value={f.after} onChange={(e) => setF({ ...f, after: Math.max(1, Number(e.target.value) || 1) })} data-testid="grant-after" /> from now</label>
        <label className="flex items-center gap-1">× <input type="number" min={1} max={1000} className={cn(inputCls, 'h-9 w-16')} value={f.count} onChange={(e) => setF({ ...f, count: Math.max(1, Number(e.target.value) || 1) })} /> in a row</label>
        <div className="flex gap-1">{[1, 10, 100].map((n) => <button key={n} className="rounded-full bg-surface-2 px-2 py-1 font-bold" onClick={() => setF({ ...f, after: n })}>{n === 1 ? 'next' : `${n}th`}</button>)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Switch id={`grant-shiny-${playerId}`} label="Shiny" checked={f.shiny} onCheckedChange={(v) => setF({ ...f, shiny: v })} />
        <input className={cn(inputCls, 'h-9 min-w-40 flex-1 text-xs')} placeholder="Note (which event)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <Button size="sm" onClick={() => void grant()} data-testid="grant-go">Line it up</Button>
      </div>
      <GrantList rows={q.data ?? []} onCancel={(id) => void cancel(id)} />
      <p className="text-[11px] text-faint">Lands on that roll of theirs (Crowns: their first claim after that inside a kingdom whose Crown is free). Nobody else’s odds change. Recorded in the audit log.</p>
    </div>
  );
}

/** every event roll lined up, for all players */
export function AllRollGrants() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'roll-grants', null], queryFn: () => api.admin.rollGrants(null) });
  const cancel = async (id: number) => { try { await api.admin.cancelRollGrant(id); void qc.invalidateQueries({ queryKey: ['admin', 'roll-grants'] }); } catch (e) { toast.error(toGameError(e).message); } };
  return (
    <div className="glass grid gap-2 rounded-3xl p-4" data-testid="all-roll-grants">
      <div className="font-display text-lg font-black">🎲 Event rolls</div>
      <p className="text-xs text-muted">Rarities lined up for specific players’ upcoming rolls. Add them from a player in the Players tab.</p>
      <GrantList rows={q.data ?? []} onCancel={(id) => void cancel(id)} showPlayer />
    </div>
  );
}
