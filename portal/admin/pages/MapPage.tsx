// Every owned plot on the world map. Filter by rarity or owner, pick a plot to see it and act on it.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Unlock, Eraser, Undo2 } from 'lucide-react';
import { api } from '../../../src/backend/api';
import { toGameError } from '../../../src/backend/backend';
import { Button, PlayerAvatar, useConfirm } from '../../../src/ui';
import { RARITY_ORDER, rarityInfo } from '../../../src/shared/rarity';
import { portal } from '../../shared/api';
import { PlotMap, type MapPlot } from '../../shared/PlotMap';
import { date, int, plotLabel, words } from '../../shared/format';
import { Badge, Empty, Json, KV, Loading, PageHeader, Panel, Q, Rarity, useDebounced } from '../../shared/ui';

export default function MapPage() {
  const [sp, setSp] = useSearchParams();
  const q = useQuery({ queryKey: ['portal', 'map', 'all'], queryFn: () => portal.map(null), staleTime: 120_000 });
  const [rar, setRar] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState('');
  const dOwner = useDebounced(owner.trim().toLowerCase(), 200);
  const gx = sp.get('gx'), gy = sp.get('gy');
  const sel = gx && gy ? { gx: Number(gx), gy: Number(gy) } : null;
  const plots: MapPlot[] = useMemo(() => {
    if (!q.data) return [];
    const owners = q.data.owners;
    return q.data.plots
      .filter(([, , r, o]) => (!rar.size || rar.has(r)) && (!dOwner || owners[o]?.[1]?.toLowerCase().includes(dOwner)))
      .map(([x, y, r, o, shiny, type, locked, name]) => ({ gx: x, gy: y, rarity: r, shiny: !!shiny, id: owners[o]?.[0], title: name || `Plot ${plotLabel(x, y)}`, sub: `@${owners[o]?.[1]} · ${rarityInfo(r).name} · ${words(type)}${locked ? ' · locked' : ''}` }));
  }, [q.data, rar, dOwner]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of q.data?.plots ?? []) m.set(p[2], (m.get(p[2]) ?? 0) + 1);
    return m;
  }, [q.data]);
  return (
    <>
      <PageHeader title="World map" sub={q.data ? `${int(q.data.plots.length)} owned plots across ${int(q.data.owners.length)} players. Showing ${int(plots.length)}.` : 'Every owned plot, in its rarity colour.'} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="p-input w-56" placeholder="Filter by owner" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Filter by owner" />
        {RARITY_ORDER.filter((r) => counts.has(r)).map((r) => (
          <button key={r} className={`p-chip ${rar.has(r) ? 'on' : ''}`} aria-pressed={rar.has(r)} onClick={() => { const n = new Set(rar); if (n.has(r)) n.delete(r); else n.add(r); setRar(n); }}>
            <span className="p-plot" style={{ background: rarityInfo(r).color }} /> {rarityInfo(r).name} <span className="tnum text-faint">{int(counts.get(r))}</span>
          </button>
        ))}
        {rar.size > 0 && <button className="text-sm text-accent-2" onClick={() => setRar(new Set())}>Clear</button>}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        {q.data ? <PlotMap plots={plots} focus={sel} height="calc(100vh - 230px)" onPick={(p) => setSp({ gx: String(p.gx), gy: String(p.gy) }, { replace: true })} /> : <Loading label="Loading every plot…" />}
        <div className="grid content-start gap-3">
          {sel ? <PlotPanel gx={sel.gx} gy={sel.gy} /> : <Empty title="Pick a plot">Click any plot on the map to see its owner, history and art, and to lock, rename or release it.</Empty>}
        </div>
      </div>
    </>
  );
}

function PlotPanel({ gx, gy }: { gx: number; gy: number }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin', 'plot', gx, gy], queryFn: () => api.admin.plotLookup(gx, gy) });
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); void q.refetch(); void qc.invalidateQueries({ queryKey: ['portal', 'map'] }); } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <Q q={q}>{(d) => {
      const p = d.plot;
      if (!p) return <Empty title="Nobody owns this plot" />;
      return (
        <>
          <Panel title={p.name || `Plot ${plotLabel(gx, gy)}`} actions={<Rarity id={p.rarity} shiny={p.shiny} />}>
            {d.owner && (
              <Link to={`/players/${d.owner.id}`} className="mb-3 flex items-center gap-2.5 rounded-xl border border-line p-2 hover:border-line-strong">
                <PlayerAvatar p={d.owner} size={32} /><span><b>@{d.owner.username}</b><span className="block text-xs text-muted">owner since {date(p.claimed_at)}</span></span>
              </Link>
            )}
            <KV cols={1} items={[
              ['Coordinates', <span className="tnum">{plotLabel(gx, gy)}</span>], ['Type', words(p.plot_type)], ['Level', p.level], ['Locked', p.locked ? `yes — ${p.lock_reason ?? ''}` : 'no'],
              ['Group', d.group ? `${d.group.name} · ${words(d.group.kind)} · ${d.group.plot_count} plots` : '—'], ['Painted', p.art_publication_id ? 'yes' : 'no'],
            ]} />
            <div className="mt-3 flex flex-wrap gap-2">
              {p.locked
                ? <Button size="sm" onClick={() => act(() => api.admin.setPlotLock(gx, gy, false, 'Unlocked in the admin portal'), 'Plot unlocked')}><Unlock className="h-4 w-4" /> Unlock</Button>
                : <Button size="sm" onClick={() => act(() => api.admin.setPlotLock(gx, gy, true, 'Locked in the admin portal'), 'Plot locked')}><Lock className="h-4 w-4" /> Lock</Button>}
              {p.name && <Button size="sm" variant="ghost" onClick={() => act(() => api.admin.clearPlotName(gx, gy, 'Name removed by the operator'), 'Name cleared')}><Eraser className="h-4 w-4" /> Clear name</Button>}
              <Button size="sm" variant="danger" onClick={async () => {
                if (await confirm({ title: 'Release this plot?', body: 'The owner loses it and it goes back on the map for anyone to claim.', confirm: 'Release' }))
                  void act(() => api.admin.releasePlot(gx, gy, 'Released by the operator'), 'Plot released');
              }}><Undo2 className="h-4 w-4" /> Release</Button>
            </div>
            <p className="mt-3 text-xs text-muted">Change rarity, take or give plots in <Link className="text-accent-2" to="/tools/plots">Plot tools</Link>.</p>
          </Panel>
          {d.art_history?.length > 0 && (
            <Panel title="Art history">
              <ul className="grid gap-1 text-sm">{d.art_history.map((a: any, i: number) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{a.title ?? a.publication_id}</span><span className="text-faint">{date(a.set_at)}</span></li>)}</ul>
            </Panel>
          )}
          <Panel title="Raw record"><Json value={d} max={320} /></Panel>
          {d.ownership?.length > 0 && <Panel title="Owners over time"><ul className="grid gap-1 text-sm">{d.ownership.map((o: any, i: number) => <li key={i}>@{o.username ?? o.player_id} <span className="text-muted">{date(o.acquired_at)} – {o.released_at ? date(o.released_at) : 'now'}</span> {o.method && <Badge>{words(o.method)}</Badge>}</li>)}</ul></Panel>}
        </>
      );
    }}</Q>
  );
}
