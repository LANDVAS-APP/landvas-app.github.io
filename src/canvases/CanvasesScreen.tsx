import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brush, LayoutGrid, MapPin, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { CanvasGroup } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { qk, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, timeAgo } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { GRID_SIZE, Z_HOUSE, cellCenter } from '../shared/grid';
import { Button, Empty, Spinner, inputCls } from '../ui';

const STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: 'Live on the map', cls: 'text-ok' },
  pending_review: { label: 'Waiting for review', cls: 'text-warn' },
  processing: { label: 'Processing', cls: 'text-accent-2' },
  approved: { label: 'Publishing…', cls: 'text-accent-2' },
  rejected: { label: 'Not approved', cls: 'text-bad' },
  removed: { label: 'Removed', cls: 'text-bad' },
  failed: { label: 'Publishing failed — try again', cls: 'text-bad' },
  superseded: { label: 'Replaced by a newer version', cls: 'text-muted' },
};

function Shape({ g }: { g: CanvasGroup }) {
  const w = g.max_gx - g.min_gx + 1, h = g.max_gy - g.min_gy + 1;
  const s = Math.min(14, 96 / Math.max(w, h));
  return (
    <svg width={w * s} height={h * s} className="shrink-0" aria-hidden>
      {g.cells.map(([gx, gy, t]) => {
        const x = ((gx - g.min_gx) % GRID_SIZE + GRID_SIZE) % GRID_SIZE;
        const c = PLOT_TYPES[t as keyof typeof PLOT_TYPES];
        return <rect key={`${gx}_${gy}`} x={x * s + 0.5} y={(gy - g.min_gy) * s + 0.5} width={s - 1} height={s - 1} rx={s * 0.2} fill={c?.a ?? '#888'} />;
      })}
    </svg>
  );
}

export default function CanvasesScreen() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  if (!me || q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const groups = q.data ?? [];
  return (
    <Page>
      <PageHeader eyebrow="Canvas Fusion" title="My canvases">Each canvas is one artwork. Connect neighbouring plots you own to paint one continuous mural across them.</PageHeader>
      {!groups.length ? (
        <Empty icon={<LayoutGrid className="h-6 w-6" />} title="No canvases yet" action={<Button variant="rainbow" onClick={() => nav('/world')}>Claim your first plot</Button>}>Every plot you claim starts as its own canvas.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const pub = g.latest_publication;
            const st = pub ? STATUS[pub.status] : null;
            return (
              <div key={g.id} className="glass flex gap-4 rounded-3xl p-4">
                <div className="flex min-h-24 w-24 items-center justify-center rounded-2xl bg-surface-2/60 p-2"><Shape g={g} /></div>
                <div className="min-w-0 flex-1">
                  {renaming?.id === g.id ? (
                    <form className="flex gap-2" onSubmit={async (e) => {
                      e.preventDefault();
                      try { await api.renameGroup(g.id, renaming.name); setRenaming(null); void qc.invalidateQueries({ queryKey: qk.groups }); } catch (err) { toast.error(toGameError(err).message); }
                    }}>
                      <input autoFocus className={cn(inputCls, 'h-9')} maxLength={60} value={renaming.name} onChange={(e) => setRenaming({ id: g.id, name: e.target.value })} />
                      <Button size="sm" type="submit">Save</Button>
                    </form>
                  ) : (
                    <button className="flex items-center gap-1.5 text-left font-bold hover:underline" onClick={() => setRenaming({ id: g.id, name: g.name })}>{g.name} <Pencil className="h-3 w-3 text-faint" /></button>
                  )}
                  <div className="text-xs text-muted">{g.plot_count} plot{g.plot_count === 1 ? '' : 's'} · {g.max_gx - g.min_gx + 1}×{g.max_gy - g.min_gy + 1} · edited {timeAgo(g.project?.updated_at ?? g.updated_at)}</div>
                  {st && <div className={cn('mt-1 text-xs font-semibold', st.cls)}>{st.label}{pub?.decision_reason ? ` — ${pub.decision_reason}` : ''}</div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" onClick={() => nav(`/create/${g.id}`)}><Brush className="h-4 w-4" /> Paint</Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const [gx, gy] = g.cells[0];
                      const [lng, lat] = cellCenter(gx, gy);
                      useUi.getState().requestFly({ lng, lat, zoom: Z_HOUSE });
                      nav('/world');
                    }}><MapPin className="h-4 w-4" /> Map</Button>
                  </div>
                  {g.adjacent_groups.length > 0 && <p className="mt-2 text-xs text-accent-2">Touches {g.adjacent_groups.length} of your other canvases — connect them from a plot's panel on the map.</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
