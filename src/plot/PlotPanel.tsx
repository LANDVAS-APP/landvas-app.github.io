import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowUpRight, Brush, Gamepad2, Link2, Lock, Scissors, Sparkles, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlotDetails } from '../backend/types';
import { useSession } from '../app/App';
import { celebrate, invalidateGame, qk, useOnboardedMe, useWorld } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt, plotLabel } from '../lib/utils';
import { PLOT_TYPES, drawPlotDesign } from '../map/plotStyle';
import type { PlotTypeId } from '../shared/grid';
import { Avatar, Button, Cost, Dialog, ResourceIcon, Spinner, useConfirm } from '../ui';

export function PlotSwatch({ type, size = 56, seed = 3, className }: { type: PlotTypeId; size?: number; seed?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    drawPlotDesign(c.getContext('2d')!, type, c.width, seed);
  }, [type, size, seed]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={cn('shrink-0 rounded-xl', className)} aria-hidden />;
}

export function PlotPanel({ cell: selected }: { cell: { gx: number; gy: number } }) {
  const select = useUi((s) => s.select);
  const session = useSession();
  const q = useQuery({ queryKey: qk.plot(selected.gx, selected.gy), queryFn: () => api.plotDetails(selected.gx, selected.gy) });
  const d = q.data;
  const nav = useNavigate();
  // dialogs live here (not in AcquireBlock) so they survive the panel switching to "owned"
  const [claimed, setClaimed] = useState<{ groupId: string; first: boolean } | null>(null);
  const [grow, setGrow] = useState<{ newGroup: string; neighbors: string[] } | null>(null);
  return (
    <motion.aside
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="glass fixed inset-x-0 bottom-0 z-30 max-h-[72dvh] overflow-y-auto rounded-t-[28px] px-[max(16px,env(safe-area-inset-left,0px))] pb-[calc(84px+env(safe-area-inset-bottom,0px))] pt-4 scroll-thin md:absolute md:bottom-6 md:left-auto md:right-6 md:top-[116px] md:max-h-none md:w-[400px] md:rounded-[28px] md:p-5"
      aria-label="Plot details" data-testid="plot-panel">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong md:hidden" />
      <div className="flex items-start gap-3">
        {d ? <PlotSwatch type={d.plot_type} /> : <div className="h-14 w-14 rounded-xl bg-surface-2" />}
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{d ? `${d.type_info.name} plot · ${d.type_info.minigame_name}` : 'Plot'}</div>
          <h2 className="mt-0.5 font-display text-lg font-semibold tnum">Plot {plotLabel(selected.gx, selected.gy)}</h2>
          {d && <p className="text-xs text-faint tnum">{d.center.lat.toFixed(4)}°, {d.center.lng.toFixed(4)}° · ≈{Math.round(611 * Math.cos((d.center.lat * Math.PI) / 180))} m square</p>}
        </div>
        <button onClick={() => select(null)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close plot panel"><X className="h-5 w-5" /></button>
      </div>
      {q.isLoading && <div className="flex justify-center py-10"><Spinner /></div>}
      {q.error && <p className="mt-4 text-sm text-bad">{toGameError(q.error).message}</p>}
      {d && (
        <div className="mt-4 grid gap-4">
          <p className="text-sm text-muted">{PLOT_TYPES[d.plot_type].blurb}. Owners earn Ink here and play <b className="text-fg">{d.type_info.minigame_name}</b>.</p>
          {d.locked && <p className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm"><Lock className="h-4 w-4" /> This plot is locked while a dispute is reviewed.</p>}
          {d.art && <ArtCard art={d.art} />}
          <NeighborDiagram d={d} />
          {!d.owned && <AcquireBlock d={d} signedIn={!!session} onClaimed={setClaimed} onGrow={setGrow} />}
          {d.owned && !d.is_mine && d.owner && (
            <Link to={`/u/${d.owner.username}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3 hover:border-line-strong">
              <Avatar seed={d.owner.avatar_seed} style={d.owner.avatar_style} accent={d.owner.accent_color} size={40} />
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Owned by</div>
                <div className="truncate font-semibold">{d.owner.display_name || d.owner.username} <span className="text-faint">@{d.owner.username}</span></div>
              </div>
              <span className="text-xs text-muted">Level {d.level}</span>
            </Link>
          )}
          {d.is_mine && <MineBlock d={d} />}
        </div>
      )}
      <Dialog open={!!claimed} onOpenChange={(o) => !o && setClaimed(null)} title={claimed?.first ? 'Your first piece of the world' : 'Make it yours'}
        description={claimed?.first ? 'This square is your canvas. Paint something the whole world can see.' : 'Paint this plot or place an image on it.'}>
        <div className="grid grid-cols-2 gap-3">
          <button className="rainbow-edge grid gap-2 rounded-2xl bg-surface-2 p-4 text-left hover:bg-surface" onClick={() => nav(`/create/${claimed!.groupId}?start=draw`)} data-testid="choose-draw">
            <Brush className="h-6 w-6 text-accent-2" /><b>Draw artwork</b><span className="text-xs text-muted">Brushes, layers, symmetry and more.</span>
          </button>
          <button className="grid gap-2 rounded-2xl border border-line bg-surface-2 p-4 text-left hover:border-line-strong" onClick={() => nav(`/create/${claimed!.groupId}?start=upload`)} data-testid="choose-upload">
            <Upload className="h-6 w-6 text-gold" /><b>Upload artwork</b><span className="text-xs text-muted">Crop, scale and place your own image.</span>
          </button>
        </div>
      </Dialog>
      <GrowDialog grow={grow} onClose={() => setGrow(null)} />
    </motion.aside>
  );
}

function ArtCard({ art }: { art: NonNullable<PlotDetails['art']> }) {
  return (
    <Link to={`/art/${art.publication_id}`} className="group flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 p-3 hover:border-line-strong">
      <div className="min-w-0">
        <div className="eyebrow">Artwork on this plot</div>
        <div className="truncate font-semibold">{art.title}</div>
        <div className="text-xs text-muted">by @{art.artist.username} · {art.plot_count} plot{art.plot_count === 1 ? '' : 's'} · {art.appreciation_count} ♥</div>
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-fg" />
    </Link>
  );
}

/** 3x3 diagram of the plot and its cardinal neighbours (Canvas Fusion preview). */
function NeighborDiagram({ d }: { d: PlotDetails }) {
  const at = (dir: 'n' | 's' | 'e' | 'w') => d.neighbors.find((n) => n.dir === dir);
  const cell = (dir: 'n' | 's' | 'e' | 'w' | 'c') => {
    if (dir === 'c') return <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-[#FFE14D] text-[10px] font-bold">THIS</div>;
    const n = at(dir);
    if (!n) return <div className="aspect-square rounded-lg bg-surface/40" />;
    return (
      <div className={cn('flex aspect-square flex-col items-center justify-center rounded-lg border text-[9.5px] font-bold leading-tight',
        n.is_mine ? (n.same_group ? 'border-accent-2 bg-accent-2/15 text-accent-2' : 'border-accent-2/60 text-accent-2') : n.owned ? 'border-line bg-surface-2/70 text-muted' : 'border-dashed border-line-strong text-faint')}
        title={n.owned ? `Owned by @${n.owner_username}` : `${n.plot_type} · available`}>
        <span className="capitalize">{n.plot_type}</span>
        <span>{n.is_mine ? (n.same_group ? 'canvas' : 'yours') : n.owned ? `@${(n.owner_username ?? '').slice(0, 8)}` : 'free'}</span>
      </div>
    );
  };
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-3">
      <div className="grid grid-cols-3 gap-1">
        <div />{cell('n')}<div />
        {cell('w')}{cell('c')}{cell('e')}
        <div />{cell('s')}<div />
      </div>
      <p className="text-xs text-muted">
        Neighbours you own can be fused with this plot into one continuous canvas. Plots must share an edge — corners do not connect.
      </p>
    </div>
  );
}

function AcquireBlock({ d, signedIn, onClaimed: setClaimed, onGrow: setGrow }: {
  d: PlotDetails; signedIn: boolean; onClaimed(v: { groupId: string; first: boolean }): void; onGrow(v: { newGroup: string; neighbors: string[] }): void;
}) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const a = d.acquire;
  if (!signedIn || !me) {
    return (
      <div className="grid gap-3 rounded-2xl border border-line bg-surface/60 p-4">
        <div className="flex items-center justify-between"><span className="text-sm text-muted">Status</span><span className="font-bold text-ok">Available</span></div>
        <Link to="/welcome?next=/" className="rounded-xl bg-accent py-2.5 text-center text-sm font-bold text-white">Sign in to claim this plot free</Link>
      </div>
    );
  }
  const starter = a?.starter_available;
  const cost = Number(a?.ink ?? 0);
  const canAfford = Number(me.balances.ink) >= cost;
  const run = async () => {
    setBusy(true);
    try {
      if (starter) {
        const r = await api.claimStarter(d.gx, d.gy);
        celebrate(r.achievements);
        setClaimed({ groupId: r.group_id, first: true });
      } else {
        const r = await api.acquirePlot(d.gx, d.gy);
        celebrate(r.achievements);
        const mineAdjacent = [...new Set(d.neighbors.filter((n) => n.is_mine && n.group_id).map((n) => n.group_id!))];
        if (mineAdjacent.length) setGrow({ newGroup: r.group_id, neighbors: mineAdjacent });
        else {
          toast.success(`Plot ${d.gx} · ${d.gy} is yours`, { description: `Spent ${fmt(r.cost.ink)} Ink` });
          setClaimed({ groupId: r.group_id, first: false });
        }
      }
      invalidateGame(qc);
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center justify-between text-sm"><span className="text-muted">Status</span><span className="font-bold text-ok">{d.available === false ? 'Unavailable' : 'Available'}</span></div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Production</span>
        <span className="flex items-center gap-1 font-semibold tnum"><ResourceIcon r="ink" />{d.production_preview?.ink_per_hour}/h · <ResourceIcon r="pigments" />{d.production_preview?.pigments_per_hour}/h</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Cost</span>
        {starter ? <span className="font-bold text-ok">Free starter plot</span> : (
          <span className="flex items-center gap-2"><Cost cost={{ ink: cost }} />{a?.adjacent && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok">−25% neighbour</span>}</span>
        )}
      </div>
      <Button variant={starter ? 'rainbow' : 'primary'} size="lg" loading={busy} disabled={d.available === false || (!starter && !canAfford)} onClick={run} data-testid="claim-plot">
        <Sparkles className="h-4 w-4" />
        {starter ? 'Claim my free starter plot' : canAfford ? `Acquire for ${fmt(cost)} Ink` : `Need ${fmt(cost - Number(me.balances.ink))} more Ink`}
      </Button>
      {!starter && !canAfford && <p className="text-xs text-muted">Play your plots' minigames or collect production to earn Ink.</p>}

    </div>
  );
}

function GrowDialog({ grow, onClose }: { grow: { newGroup: string; neighbors: string[] } | null; onClose(): void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!grow} onOpenChange={(o) => !o && onClose()} title="Your canvas can grow"
      description="Connect these plots to create a larger masterpiece. Existing art keeps its exact position — you will draw across the old border as one surface.">
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Not now</Button>
        <Button variant="rainbow" loading={busy} data-testid="connect-plots" onClick={async () => {
          if (!grow) return;
          setBusy(true);
          try {
            const g = await api.fuseGroups([grow.newGroup, ...grow.neighbors]);
            celebrate(g.achievements);
            invalidateGame(qc);
            toast.success(`Connected — ${g.plot_count} plots, one canvas`);
            nav(`/create/${g.id}`);
          } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
        }}>
          <Link2 className="h-4 w-4" /> Connect plots
        </Button>
      </div>
    </Dialog>
  );
}

function MineBlock({ d }: { d: PlotDetails }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const world = useWorld();
  const me = useOnboardedMe();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const eco = world.data?.economy;
  const up = d.upgrades ?? {};
  const levelCost = eco ? { ink: eco.upgrade.level_cost_ink[d.level], pigments: eco.upgrade.level_cost_pigments[d.level] } : null;
  const mod = (k: 'studio' | 'reservoir') => {
    const cur = up[k] ?? 0;
    const m = eco?.modules?.[k];
    return m && cur < m.max ? { ink: m.cost_ink[cur], pigments: m.cost_pigments[cur] } : null;
  };
  const doUpgrade = async (kind: 'level' | 'studio' | 'reservoir') => {
    setBusy(kind);
    try {
      const r = await api.upgradePlot(d.gx, d.gy, kind);
      celebrate(r.achievements);
      toast.success(kind === 'level' ? `Plot upgraded to level ${r.plot.level}` : `${kind === 'studio' ? 'Studio' : 'Reservoir'} installed`);
      invalidateGame(qc);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const fuse = async (other: string) => {
    if (!d.group) return;
    setBusy('fuse');
    try {
      const g = await api.fuseGroups([d.group.id, other]);
      celebrate(g.achievements);
      invalidateGame(qc);
      toast.success(`Canvases connected — ${g.plot_count} plots`);
      nav(`/create/${g.id}`);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const detach = async () => {
    if (!d.group) return;
    const ok = await confirm({ title: 'Detach this plot?', body: 'It becomes its own single-plot canvas and keeps its part of the artwork. The published mural stays on the map until you publish again. Every version stays in history.', confirm: 'Detach plot' });
    if (!ok) return;
    setBusy('detach');
    try {
      await api.detachPlots(d.group.id, [[d.gx, d.gy]]);
      invalidateGame(qc);
      toast.success('Plot detached into its own canvas');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const p = d.production!;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={() => d.group && nav(`/create/${d.group.id}`)} data-testid="open-canvas"><Brush className="h-4 w-4" /> Paint canvas</Button>
        <Button onClick={() => nav(`/play/${d.type_info.minigame}?gx=${d.gx}&gy=${d.gy}`)}><Gamepad2 className="h-4 w-4" /> {d.type_info.minigame_name}</Button>
      </div>
      {d.group && d.group.plot_count > 1 && (
        <p className="text-xs text-muted">Part of <b className="text-fg">{d.group.name}</b> — a {d.group.max_gx - d.group.min_gx + 1}×{d.group.max_gy - d.group.min_gy + 1} canvas of {d.group.plot_count} plots.</p>
      )}
      {(d.connections?.length ?? 0) > 0 && (
        <div className="grid gap-2 rounded-2xl border border-accent-2/40 bg-accent-2/10 p-3">
          <div className="text-sm font-bold">Your canvas can grow</div>
          {d.connections!.map((c) => (
            <Button key={c.group_id} size="sm" variant="rainbow" loading={busy === 'fuse'} onClick={() => fuse(c.group_id)}>
              <Link2 className="h-4 w-4" /> Connect with “{c.name}” ({c.plot_count} plot{c.plot_count === 1 ? '' : 's'})
            </Button>
          ))}
        </div>
      )}
      <div className="grid gap-2 rounded-2xl border border-line bg-surface/60 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted">Level</span><b>{d.level} / {eco?.upgrade?.max_level ?? 5}</b></div>
        <div className="flex justify-between"><span className="text-muted">Production</span><span className="flex items-center gap-1 font-semibold tnum"><ResourceIcon r="ink" />{p.ink_per_hour}/h · <ResourceIcon r="pigments" />{p.pigments_per_hour}/h</span></div>
        <div className="flex justify-between"><span className="text-muted">Stored (cap {p.cap_hours}h)</span><span className="font-semibold tnum">{fmt(p.pending_ink)} Ink · {fmt(p.pending_pigments)} Pigments</span></div>
      </div>
      <div className="grid gap-2">
        <div className="eyebrow">Develop this plot</div>
        <UpgradeRow title={`Level ${d.level + 1}`} desc="+50% production for this plot" cost={d.level < (eco?.upgrade?.max_level ?? 5) ? levelCost : null} busy={busy === 'level'} onClick={() => doUpgrade('level')} balances={me?.balances} />
        <UpgradeRow title={`Studio ${(up.studio ?? 0) + 1}`} desc="+25% Ink per studio level" cost={mod('studio')} busy={busy === 'studio'} onClick={() => doUpgrade('studio')} balances={me?.balances} />
        <UpgradeRow title={`Reservoir ${(up.reservoir ?? 0) + 1}`} desc="+6 hours of offline storage" cost={mod('reservoir')} busy={busy === 'reservoir'} onClick={() => doUpgrade('reservoir')} balances={me?.balances} />
      </div>
      {d.group && d.group.plot_count > 1 && (
        <Button variant="ghost" size="sm" onClick={detach} loading={busy === 'detach'}><Scissors className="h-4 w-4" /> Detach this plot from the canvas</Button>
      )}
    </div>
  );
}

function UpgradeRow({ title, desc, cost, busy, onClick, balances }: { title: string; desc: string; cost: { ink?: number; pigments?: number } | null; busy: boolean; onClick(): void; balances?: Record<string, number> }) {
  const afford = !!cost && Number(balances?.ink ?? 0) >= (cost.ink ?? 0) && Number(balances?.pigments ?? 0) >= (cost.pigments ?? 0);
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/40 p-3">
      <div className="min-w-0">
        <div className="text-sm font-bold">{title}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      {cost ? (
        <Button size="sm" variant={afford ? 'primary' : 'secondary'} disabled={!afford} loading={busy} onClick={onClick}><Cost cost={cost} /></Button>
      ) : <span className="text-xs font-bold text-faint">MAX</span>}
    </div>
  );
}
