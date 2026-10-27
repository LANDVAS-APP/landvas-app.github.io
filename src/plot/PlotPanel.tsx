import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowUpRight, Brush, Footprints, Gamepad2, Link2, Lock, MapPin, Rocket, Scissors, Sparkles, Upload, X, Zap } from 'lucide-react';
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
import { RarityBadge } from './RarityBadge';
import { formatDuration, formatRate } from '../shared/rent';
import { cellCenter } from '../shared/grid';
import { travelEta, travelTo, useExplorer } from '../explorer/explorer';

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
        {d ? <PlotSwatch type={d.plot_type} className="ring-2" /> : <div className="h-14 w-14 rounded-xl bg-surface-2" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {d && <RarityBadge r={d.rarity} />}
            <span className="eyebrow">{d ? `${d.type_info.name} · ${d.type_info.minigame_name}` : 'Plot'}</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-semibold tnum">Plot {plotLabel(selected.gx, selected.gy)}</h2>
          {d && <p className="text-xs text-faint tnum">{d.center.lat.toFixed(4)}°, {d.center.lng.toFixed(4)}° · ≈{Math.round(611 * Math.cos((d.center.lat * Math.PI) / 180))} m square</p>}
        </div>
        <button onClick={() => select(null)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close plot panel"><X className="h-5 w-5" /></button>
      </div>
      {q.isLoading && <div className="flex justify-center py-10"><Spinner /></div>}
      {q.error && <p className="mt-4 text-sm text-bad">{toGameError(q.error).message}</p>}
      {d && (
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-line bg-surface/50 p-3">
              <div className="eyebrow !text-[10px]">Rent</div>
              <div className="font-display text-[15px] font-semibold tnum" style={{ color: d.rarity_info.glow }}>{formatRate(Number(d.rent.usd_per_second))}</div>
              <div className="flex items-center gap-1 text-[11px] text-gold tnum"><Zap className="h-3 w-3" />{formatRate(Number(d.rent.usd_per_second) * Number(d.rent.boost_multiplier))} boosted</div>
            </div>
            <div className="rounded-2xl border border-line bg-surface/50 p-3">
              <div className="eyebrow !text-[10px]">Minigame</div>
              <div className="font-display text-[15px] font-semibold">{d.type_info.minigame_name}</div>
              <div className="text-[11px] text-muted">×{Number(d.rarity_info.ink_reward_multiplier).toFixed(2)} Ink per win</div>
            </div>
          </div>
          <p className="text-sm text-muted">{PLOT_TYPES[d.plot_type].blurb}. Owners earn USD rent every second and win Ink by playing <b className="text-fg">{d.type_info.minigame_name}</b>.</p>
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
  const world = useWorld();
  const nav = useNavigate();
  const ex = useExplorer();
  const [busy, setBusy] = useState<string | null>(null);
  const a = d.acquire;
  if (!signedIn || !me) {
    return (
      <div className="grid gap-3 rounded-2xl border border-line bg-surface/60 p-4">
        <div className="flex items-center justify-between"><span className="text-sm text-muted">Status</span><span className="font-bold text-ok">Available</span></div>
        <Link to="/welcome?next=/" className="rounded-xl bg-accent py-2.5 text-center text-sm font-bold text-white">Sign up to claim plots</Link>
      </div>
    );
  }
  const starter = a?.starter_available;
  const cost = Number(a?.ink ?? 0);
  const canAfford = Number(me.balances.ink) >= cost;
  const reach = d.reach;
  const inReach = reach?.in_reach ?? false;
  const gpsOn = ex.gps === 'on';
  const manualOk = world.data?.explorer?.manual_travel !== false;
  const speed = Number(world.data?.explorer?.travel_speed_kmh ?? 20);
  const [lng, lat] = cellCenter(d.gx, d.gy);
  const eta = travelEta(ex.state, ex.offset, { lng, lat }, speed);
  const jumpReady = !ex.state?.jump_available_at || new Date(ex.state.jump_available_at).getTime() <= Date.now() + ex.offset;
  const run = async () => {
    setBusy('claim');
    try {
      if (starter) {
        const r = await api.claimStarter(d.gx, d.gy);
        celebrate(r.achievements);
        setClaimed({ groupId: r.group_id, first: true });
      } else {
        const r = await api.acquirePlot(d.gx, d.gy);
        celebrate(r.achievements);
        const mineAdjacent = [...new Set(d.neighbors.filter((n) => n.is_mine && n.group_id).map((n) => n.group_id!))];
        toast.success(`Plot claimed — +${formatRate(Number(r.usd_per_second))} rent`, { description: `Spent ${fmt(r.cost.ink)} Ink` });
        if (mineAdjacent.length) setGrow({ newGroup: r.group_id, neighbors: mineAdjacent });
        else setClaimed({ groupId: r.group_id, first: false });
      }
      invalidateGame(qc);
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setBusy(null);
    }
  };
  const go = async (jump: boolean) => {
    setBusy(jump ? 'jump' : 'travel');
    const r = await travelTo(lng, lat, jump);
    if (r) {
      void qc.invalidateQueries({ queryKey: ['plot'] });
      if (!jump && !r.placed) toast(`Your explorer is on the way`, { description: `Arrives in ${formatDuration(eta)}. Keep playing while it travels.` });
    }
    setBusy(null);
  };
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center justify-between text-sm"><span className="text-muted">Status</span><span className="font-bold text-ok">{d.available === false ? 'Unavailable' : 'Available'}</span></div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Price</span>
        {starter ? <span className="font-bold text-ok">Free starter plot</span> : <Cost cost={{ ink: cost }} />}
      </div>
      {!reach?.explorer ? (
        <div className="grid gap-2 rounded-xl bg-accent/10 p-3 text-sm">
          <b>Place your explorer first</b>
          <span className="text-xs text-muted">You can claim plots right around your explorer. Use your location, or tap “Start here”.</span>
          <Button size="sm" variant="primary" loading={busy === 'travel'} onClick={() => go(false)}><MapPin className="h-4 w-4" /> Start here</Button>
        </div>
      ) : inReach ? (
        <Button variant={starter ? 'rainbow' : 'primary'} size="lg" loading={busy === 'claim'} disabled={d.available === false || (!starter && !canAfford)} onClick={run} data-testid="claim-plot">
          <Sparkles className="h-4 w-4" />
          {starter ? 'Claim my free starter plot' : canAfford ? `Claim for ${fmt(cost)} Ink` : `Need ${fmt(cost - Number(me.balances.ink))} more Ink`}
        </Button>
      ) : (
        <div className="grid gap-2 rounded-xl border border-line-strong p-3 text-sm">
          <div className="flex items-center gap-2 font-bold"><Footprints className="h-4 w-4 text-accent-2" /> {reach.distance} plots from your explorer</div>
          <span className="text-xs text-muted">You can claim plots within {reach.max} plot{reach.max === 1 ? '' : 's'} of your explorer.{gpsOn ? ' Walk closer — your explorer follows your GPS.' : ''}</span>
          {!gpsOn && manualOk && (
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="primary" loading={busy === 'travel'} onClick={() => go(false)} data-testid="travel-here"><Footprints className="h-4 w-4" /> Travel ({formatDuration(eta)})</Button>
              <Button size="sm" variant="secondary" loading={busy === 'jump'} disabled={!jumpReady} onClick={() => go(true)} title={jumpReady ? 'Instant jump (once a day)' : `Next jump ${new Date(ex.state!.jump_available_at!).toLocaleString()}`}><Rocket className="h-4 w-4" /> {jumpReady ? 'Jump now' : 'Jump used'}</Button>
            </div>
          )}
        </div>
      )}
      {!starter && !canAfford && inReach && (
        <Button size="sm" variant="secondary" onClick={() => nav('/play')}><Gamepad2 className="h-4 w-4" /> Win minigames to earn Ink</Button>
      )}
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
  const maxLevel = Number(eco?.upgrade?.max_level ?? 10);
  const levelCost = eco && d.level < maxLevel ? { ink: eco.upgrade.level_cost_ink[d.level], pigments: eco.upgrade.level_cost_pigments[d.level] } : null;
  const doUpgrade = async () => {
    setBusy('level');
    try {
      const r = await api.upgradePlot(d.gx, d.gy);
      celebrate(r.achievements);
      toast.success(`Plot upgraded to level ${r.plot.level}`);
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
      <div className="grid gap-2">
        <div className="eyebrow">Level {d.level} / {maxLevel}</div>
        <UpgradeRow title={d.level < maxLevel ? `Upgrade to level ${d.level + 1}` : 'Max level'} desc="+1% rent and +5% minigame Ink on this plot" cost={levelCost} busy={busy === 'level'} onClick={doUpgrade} balances={me?.balances} />
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
