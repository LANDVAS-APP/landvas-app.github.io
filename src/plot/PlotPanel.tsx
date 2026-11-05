import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { startMerge, useFuseCost } from './MergeBar';
import { mergePieces, useMapFx } from '../map/MapFx';
import { diveInto } from '../map/Hud';
import { Combine, ArrowUpRight, Brush, Footprints, Gamepad2, Link2, Lock, MapPin, Scissors, Sparkles, Upload, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { CanvasGroup, PlotDetails, PlotKind } from '../backend/types';
import { useSession } from '../app/App';
import { celebrate, invalidateGame, qk, useOnboardedMe, useWorld } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt, plotLabel, safeStorage, saveStorage } from '../lib/utils';
import { PLOT_TYPES, drawPlotDesign } from '../map/plotStyle';
import type { PlotTypeId } from '../shared/grid';
import { Button, Cost, Dialog, ResourceIcon, Spinner, useConfirm, PlayerAvatar } from '../ui';
import { RarityBadge } from './RarityBadge';
import { GamePreview } from '../play/GamePreview';
import { formatRate } from '../shared/rent';
import { plotMetres } from '../shared/grid';
import { enableGps, useExplorer } from '../explorer/explorer';
import { useCelebration } from './ClaimCelebration';
import { PlotKindControl } from '../inkborn/PlotKindPicker';

const useFarmAt = (gx: number, gy: number, on: boolean) => useQuery({ queryKey: ['plot', 'farm', gx, gy], queryFn: () => api.farmForPlot(gx, gy), enabled: on, staleTime: 30_000 });
const useArcadeAt = (gx: number, gy: number, on: boolean) => useQuery({ queryKey: ['plot', 'arcade', gx, gy], queryFn: () => api.arcadeForPlot(gx, gy), enabled: on, staleTime: 30_000 });
const useBizAt = (gx: number, gy: number, on: boolean) => useQuery({ queryKey: ['plot', 'business', gx, gy], queryFn: () => api.bizForPlot(gx, gy), enabled: on, staleTime: 30_000 });
const useHabitatAt = (gx: number, gy: number, on: boolean) => useQuery({ queryKey: ['plot', 'habitat', gx, gy], queryFn: () => api.habitatForPlot(gx, gy), enabled: on, staleTime: 30_000 });

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
        {d?.plot_type ? <PlotSwatch type={d.plot_type} className="ring-2" /> : d ? <MysterySwatch /> : <div className="h-14 w-14 rounded-xl bg-surface-2" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {d && (d.rarity ? <RarityBadge r={d.rarity} /> : <MysteryBadge />)}
            <span className="eyebrow">{d?.type_info ? `${d.type_info.name} · ${d.type_info.minigame_name}` : d ? 'Mystery plot' : 'Plot'}</span>
          </div>
          <h2 className="mt-1 truncate font-display text-lg font-semibold" data-testid="plot-title">{d?.name || <span className="tnum">Plot {plotLabel(selected.gx, selected.gy)}</span>}</h2>
          {d && <p className="text-xs text-faint tnum">{d.name ? `Plot ${plotLabel(selected.gx, selected.gy)} · ` : ''}{d.center.lat.toFixed(4)}°, {d.center.lng.toFixed(4)}° · ≈{plotMetres(d.center.lat).toFixed(1)} m square</p>}
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
              {d.rent && d.rarity_info ? (
                <>
                  <div className="font-display text-[15px] font-semibold tnum" style={{ color: d.rarity_info.glow }}>{formatRate(Number(d.rent.usd_per_second))}</div>
                  <div className="flex items-center gap-1 text-[11px] text-gold tnum"><Zap className="h-3 w-3" />{formatRate(Number(d.rent.usd_per_second) * Number(d.rent.boost_multiplier))} boosted</div>
                </>
              ) : (
                <>
                  <div className="font-display text-[15px] font-semibold">Hidden</div>
                  <div className="text-[11px] text-muted">Its rarity sets the rent — revealed when claimed</div>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-line bg-surface/50 p-3">
              <div className="eyebrow !text-[10px]">Minigame</div>
              {d.type_info ? (
                <>
                  <div className="font-display text-[15px] font-semibold">{d.type_info.minigame_name}</div>
                  <div className="text-[11px] text-muted">{d.rarity_info ? `×${Number(d.rarity_info.ink_reward_multiplier).toFixed(2)} Ink per win` : 'Rarer plots pay more Ink'}</div>
                </>
              ) : (
                <>
                  <div className="font-display text-[15px] font-semibold">Hidden</div>
                  <div className="text-[11px] text-muted">One of four games — revealed when claimed</div>
                </>
              )}
            </div>
          </div>
          {d.type_info && d.plot_type ? (
            <div className="flex items-center gap-3">
              <GamePreview game={d.type_info.minigame} size={64} className="shrink-0" />
              <p className="text-sm text-muted">{PLOT_TYPES[d.plot_type].blurb}. Owners earn USD rent every second and win Ink by playing <b className="text-fg">{d.type_info.minigame_name}</b>.</p>
            </div>
          ) : (
            <p className="text-sm text-muted" data-testid="mystery-note">A mystery plot. Its <b className="text-fg">type, minigame, rarity and rent</b> are revealed the moment you claim it — Common to Mythic, any plot could be the big one.</p>
          )}
          {d.locked && <p className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm"><Lock className="h-4 w-4" /> This plot is locked while a dispute is reviewed.</p>}
          {d.art && <ArtCard art={d.art} />}
          <NeighborDiagram d={d} />
          {!d.owned && <AcquireBlock d={d} signedIn={!!session} onClaimed={setClaimed} onGrow={setGrow} />}
          {d.owned && !d.is_mine && d.owner && (
            <Link to={`/u/${d.owner.username}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3 hover:border-line-strong">
              <PlayerAvatar p={d.owner} size={40} />
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Owned by</div>
                <div className="truncate font-semibold">{d.owner.display_name || d.owner.username} <span className="text-faint">@{d.owner.username}</span></div>
              </div>
              <span className="text-xs text-muted">Level {d.level}</span>
            </Link>
          )}
          {d.owned && !d.is_mine && <HabitatVisit d={d} />}
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
        title={n.owned ? `Owned by @${n.owner_username}` : 'Mystery plot · available'}>
        <span className="capitalize">{n.plot_type ?? '?'}</span>
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
  d: PlotDetails; signedIn: boolean; onClaimed(v: { groupId: string; first: boolean }): void; onGrow(v: { newGroup: string; neighbors: string[]; habitat?: boolean }): void;
}) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const world = useWorld();
  const nav = useNavigate();
  const ex = useExplorer();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PlotKind>(() => { const k = safeStorage<string>('landvas.plotKind', 'canvas'); return k === 'habitat' || k === 'farm' || k === 'business' || k === 'arcade' ? k : 'canvas'; });
  const pickKind = (k: PlotKind) => { setKind(k); saveStorage('landvas.plotKind', k); };
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
  // what the new plot becomes is the player's choice; a habitat is the same plot at the same price
  const becomeHabitat = async (groupId: string) => {
    if (kind === 'canvas') return null;
    try { const g = await api.setGroupKind(groupId, kind); if (kind === 'farm' && g.farm_id) { toast.success('Your farm is ready 🌾', { action: { label: 'Enter it', onClick: () => nav(`/farm/${g.farm_id}`) } }); return null; }
      if (kind === 'business' && g.business_id) { toast.success('Your lemonade stand is open 🍋', { action: { label: 'Open it', onClick: () => nav(`/business/${g.business_id}`) } }); return null; }
      if (kind === 'arcade' && g.arcade_id) { toast.success('Your arcade is open 🕹️', { action: { label: 'Walk in', onClick: () => nav(`/arcade/${g.arcade_id}`) } }); return null; } return g.habitat_id ?? null; }
    catch (e) { toast.error(toGameError(e).message); return null; }
  };
  const run = async () => {
    setBusy('claim');
    try {
      if (starter) {
        const r = await api.claimStarter(d.gx, d.gy, name);
        celebrate(r.achievements);
        const hab = await becomeHabitat(r.group_id);
        useCelebration.getState().show({ gx: d.gx, gy: d.gy, rarity: r.rarity, type: r.plot_type as PlotTypeId, name: r.name, usd: Number(r.usd_per_second), groupId: r.group_id, first: true, habitatId: hab });
      } else {
        const r = await api.acquirePlot(d.gx, d.gy, name);
        celebrate(r.achievements);
        const hab = await becomeHabitat(r.group_id);
        // only plots of the same type can join up (art with art, habitat with habitat)
        const groups = (qc.getQueryData(qk.groups) as CanvasGroup[] | undefined) ?? [];
        const kindOf = (id: string) => groups.find((g) => g.id === id)?.kind ?? 'canvas';
        const mineAdjacent = [...new Set(d.neighbors.filter((n) => n.is_mine && n.group_id).map((n) => n.group_id!))].filter((id) => kindOf(id) === kind);
        useCelebration.getState().show({
          gx: d.gx, gy: d.gy, rarity: r.rarity, type: r.plot_type as PlotTypeId, name: r.name, usd: Number(r.usd_per_second), groupId: r.group_id, first: false, habitatId: hab,
          onDone: mineAdjacent.length ? () => setGrow({ newGroup: r.group_id, neighbors: mineAdjacent, habitat: kind === 'habitat' }) : undefined,
        });
      }
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center justify-between text-sm"><span className="text-muted">Status</span><span className="font-bold text-ok">{d.available === false ? 'Unavailable' : 'Available'}</span></div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Price</span>
        {starter ? <span className="font-bold text-ok">Free starter plot</span> : cost === 0 ? <span className="font-bold text-ok">Free</span> : <Cost cost={{ ink: cost }} />}
      </div>
      {Number((a as any)?.free_left ?? 0) > 0 && (
        <div className="rounded-xl bg-ok/10 px-3 py-2 text-xs font-semibold text-ok" data-testid="free-plots-left">🎁 {(a as any).free_left} free plot{(a as any).free_left === 1 ? '' : 's'} left for new players</div>
      )}
      {!reach?.explorer ? (
        <div className="grid gap-2 rounded-xl bg-accent/10 p-3 text-sm">
          <b>Turn on your location first</b>
          <span className="text-xs text-muted">Your explorer stands where you really are, and you can claim the plots right around it.</span>
          <Button size="sm" variant="primary" loading={ex.gps === 'asking'} onClick={() => enableGps()} data-testid="plot-use-gps"><MapPin className="h-4 w-4" /> Use my location</Button>
        </div>
      ) : inReach ? (
        <>
          {(starter || canAfford) && d.available !== false && <PlotKindChoice kind={kind} onPick={pickKind} />}
          {(starter || canAfford) && (
            <input className="h-10 w-full rounded-xl border border-line bg-surface/80 px-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none" maxLength={32}
              placeholder="Name your plot (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Plot name" data-testid="plot-name-input" />
          )}
          <Button variant={starter ? 'rainbow' : 'primary'} size="lg" loading={busy === 'claim'} disabled={d.available === false || (!starter && !canAfford)} onClick={run} data-testid="claim-plot">
            <Sparkles className="h-4 w-4" />
            {starter ? 'Claim my free starter plot' : cost === 0 ? 'Claim this plot free' : canAfford ? `Claim for ${fmt(cost)} Ink` : `Need ${fmt(cost - Number(me.balances.ink))} more Ink`}
          </Button>
        </>
      ) : (
        <div className="grid gap-2 rounded-xl border border-line-strong p-3 text-sm">
          <div className="flex items-center gap-2 font-bold"><Footprints className="h-4 w-4 text-accent-2" /> {reach.distance} plots from your explorer</div>
          <span className="text-xs text-muted">You can claim plots within {reach.max} plot{reach.max === 1 ? '' : 's'} of your explorer. Walk closer in real life — your explorer follows your GPS.</span>
          {!gpsOn && <Button size="sm" variant="primary" loading={ex.gps === 'asking'} onClick={() => enableGps()} data-testid="plot-use-gps"><MapPin className="h-4 w-4" /> Turn on my location</Button>}
        </div>
      )}
      {!starter && !canAfford && inReach && (
        <Button size="sm" variant="secondary" onClick={() => nav('/play')}><Gamepad2 className="h-4 w-4" /> Win minigames to earn Ink</Button>
      )}
    </div>
  );
}

function PlotKindChoice({ kind, onPick }: { kind: PlotKind; onPick(k: PlotKind): void }) {
  const opts = [
    { k: 'canvas' as const, icon: '🎨', title: 'Art Canvas', body: 'Paint and publish artwork', color: '#7B5CFF' },
    { k: 'habitat' as const, icon: '🌳', title: 'Inkborn Habitat', body: 'A sanctuary for your creatures', color: '#3DDC97' },
    { k: 'farm' as const, icon: '🌾', title: 'Farm', body: 'Grow, harvest and sell crops', color: '#E0A800' },
    { k: 'business' as const, icon: '🍋', title: 'Business', body: 'Lemonade stand to corporation', color: '#D4A500' },
    { k: 'arcade' as const, icon: '🕹️', title: 'Arcade', body: 'Neon cabinets, tickets, prizes', color: '#FF3D9A' },
  ];
  return (
    <div className="grid gap-1.5" data-testid="plot-kind-choice">
      <div className="text-xs font-bold text-muted">What should this plot become?</div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {opts.map((o) => (
          <motion.button key={o.k} type="button" role="radio" aria-checked={kind === o.k} whileTap={{ scale: 0.96 }} onClick={() => onPick(o.k)} data-testid={`buy-as-${o.k}`}
            className={cn('grid gap-0.5 rounded-2xl border-2 p-2.5 text-left transition', kind === o.k ? 'bg-surface-2' : 'border-line bg-surface/40 opacity-75')}
            style={{ borderColor: kind === o.k ? o.color : undefined, boxShadow: kind === o.k ? `0 0 24px -10px ${o.color}` : undefined }}>
            <span className="text-xl">{o.icon}</span>
            <span className="text-sm font-bold" style={{ color: kind === o.k ? o.color : undefined }}>{o.title}</span>
            <span className="text-[11px] leading-tight text-muted">{o.body}</span>
          </motion.button>
        ))}
      </div>
      {kind === 'arcade' && <p className="text-[11px] text-muted">Same price and rent. Walk your explorer round a neon arcade: Tower Stacker, Claw Crane, Skee-Ball and more. Free to play, win tickets for prizes. You get 10% of the tickets visitors win.</p>}
      {kind === 'business' && <p className="text-[11px] text-muted">Same price and rent. Start with a lemonade stand and grow an empire that earns while you’re away. Every business plot you own adds 10% to all your income.</p>}
      {kind === 'farm' && <p className="text-[11px] text-muted">Same price and rent. A farm plot has 6 soil beds and every connected farm plot adds 4 more. Switch types any time without losing anything.</p>}
      {kind === 'habitat' && <p className="text-[11px] text-muted">Same price and rent. Merge neighbouring habitat plots to grow it: 1 plot is a small glade, 4 a woodland, 16 a big sanctuary. You can switch types any time without losing anything.</p>}
    </div>
  );
}

const AUTO_CONNECT_KEY = 'landvas.merge.auto';

function GrowDialog({ grow, onClose }: { grow: { newGroup: string; neighbors: string[]; habitat?: boolean } | null; onClose(): void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const cost = useFuseCost(grow ? [grow.newGroup, ...grow.neighbors] : [], !!grow);
  const price = cost.data?.ink ?? 0;
  const short = !!cost.data && price > cost.data.balance;
  const [always, setAlways] = useState(() => safeStorage<boolean>(AUTO_CONNECT_KEY, false));
  const connect = async () => {
    if (!grow) return;
    setBusy(true);
    try {
      const ids = [grow.newGroup, ...grow.neighbors];
      const pieces = await mergePieces(qc.getQueryData(qk.groups), ids);
      const g = await api.fuseGroups(ids);
      // stay on the map for the merge animation; the new canvas / sanctuary is one tap away
      onClose();
      useMapFx.getState().playMerge(pieces);
      celebrate(g.achievements);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['habitat'] });
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
      if (grow.habitat && g.habitat_id) toast.success(`Connected — a ${g.plot_count}-plot sanctuary`, { action: { label: 'Enter it', onClick: () => nav(`/habitat/${g.habitat_id}`) } });
      else toast.success(`Connected — ${g.plot_count} plots, one canvas`, { action: { label: 'Paint it', onClick: () => nav(`/create/${g.id}`) } });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  // "always connect": new plots join their neighbours by themselves (when the Ink is there)
  const auto = useRef<string | null>(null);
  useEffect(() => {
    if (!grow || !always || !cost.data || short || busy || auto.current === grow.newGroup) return;
    auto.current = grow.newGroup;
    void connect();
  }, [grow, always, cost.data, short]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={!!grow} onOpenChange={(o) => !o && onClose()} title={grow?.habitat ? 'Your sanctuary can grow' : 'Your canvas can grow'}
      description={grow?.habitat ? 'Connect these habitat plots into one bigger sanctuary — more room to explore, more decorations and space for more Inkborn. Everyone living there moves in together.'
        : 'Connect these plots to create a larger masterpiece. Existing art keeps its exact position — you will draw across the old border as one surface.'}>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Not now</Button>
        {price > 0 && <p className="mr-auto self-center text-xs text-muted">Connecting costs <b className="text-fg tnum">{price} Ink</b>{short ? ' — you need more Ink first' : ''}. {grow?.habitat ? 'Bigger sanctuaries hold more creatures.' : 'Bigger murals earn bigger craft bonuses.'}</p>}
        <Button variant="rainbow" loading={busy} disabled={short} data-testid="connect-plots" onClick={() => void connect()}>
          <Link2 className="h-4 w-4" /> Connect plots
        </Button>
        <label className="flex w-full items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={always} onChange={(e) => { setAlways(e.target.checked); saveStorage(AUTO_CONNECT_KEY, e.target.checked); }} className="h-4 w-4 accent-[var(--accent)]" data-testid="auto-connect" />
          Always connect new plots to the ones they touch (you can turn this off in the same place)
        </label>
      </div>
    </Dialog>
  );
}

function ConnectButton({ c, mine, busy, onGo }: { c: { group_id: string; name: string; plot_count: number }; mine: string | null; busy: boolean; onGo(): void }) {
  const cost = useFuseCost(mine ? [mine, c.group_id] : [], !!mine);
  const price = cost.data?.ink ?? 0;
  const short = !!cost.data && price > cost.data.balance;
  return (
    <Button size="sm" variant="rainbow" loading={busy} disabled={short} onClick={onGo}
      onMouseEnter={() => useUi.getState().setMergeHover([c.group_id])} onMouseLeave={() => useUi.getState().setMergeHover(null)}
      onFocus={() => useUi.getState().setMergeHover([c.group_id])} onBlur={() => useUi.getState().setMergeHover(null)}>
      <Link2 className="h-4 w-4" /> Connect with “{c.name}” ({c.plot_count} plot{c.plot_count === 1 ? '' : 's'}){price > 0 ? ` · ${price} Ink` : ''}{short ? ' — not enough Ink' : ''}
    </Button>
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
      const pieces = await mergePieces(qc.getQueryData(qk.groups), [d.group.id, other]);
      const g = await api.fuseGroups([d.group.id, other]);
      useMapFx.getState().playMerge(pieces);
      celebrate(g.achievements);
      invalidateGame(qc);
      toast.success(`Canvases connected — ${g.plot_count} plots`, { action: g.habitat_id ? { label: 'Enter sanctuary', onClick: () => nav(`/habitat/${g.habitat_id}`) } : { label: 'Paint it', onClick: () => nav(`/create/${g.id}`) } });
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
  const hab = useHabitatAt(d.gx, d.gy, true).data;
  const farm = useFarmAt(d.gx, d.gy, true).data;
  const biz = useBizAt(d.gx, d.gy, true).data;
  const arc = useArcadeAt(d.gx, d.gy, true).data;
  return (
    <div className="grid gap-3">
      <RenamePlot d={d} />
      {d.group && <PlotKindControl g={{ id: d.group.id, name: d.group.name, plot_count: d.group.plot_count, kind: hab ? 'habitat' : farm ? 'farm' : biz ? 'business' : arc ? 'arcade' : 'canvas', habitat_id: hab?.habitat_id ?? null, farm_id: farm?.farm_id ?? null, business_id: biz?.business_id ?? null, arcade_id: arc?.arcade_id ?? null }} />}
      <div className="grid grid-cols-2 gap-2">
        {arc ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/arcade/${arc.arcade_id}`, d.center); }} data-testid="open-arcade">🕹️ Enter arcade</Button>
          : biz ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/business/${biz.business_id}`, d.center); }} data-testid="open-business">🍋 Open business</Button>
          : farm ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/farm/${farm.farm_id}`, d.center); }} data-testid="open-farm">🌾 Enter farm</Button>
          : hab ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/habitat/${hab.habitat_id}`, d.center); }} data-testid="open-habitat">🐾 Enter sanctuary</Button>
          : <Button variant="primary" onClick={() => { if (!d.group) return; useUi.getState().select(null); diveInto(nav, `/create/${d.group.id}`, d.center); }} data-testid="open-canvas"><Brush className="h-4 w-4" /> Paint canvas</Button>}
        <Button onClick={() => nav(`/play/${d.type_info!.minigame}?gx=${d.gx}&gy=${d.gy}`)}><Gamepad2 className="h-4 w-4" /> {d.type_info!.minigame_name}</Button>
      </div>
      {d.group && d.group.plot_count > 1 && (
        <p className="text-xs text-muted">Part of <b className="text-fg">{d.group.name}</b> — a {d.group.max_gx - d.group.min_gx + 1}×{d.group.max_gy - d.group.min_gy + 1} canvas of {d.group.plot_count} plots.</p>
      )}
      {(d.connections?.length ?? 0) > 0 && (
        <div className="grid gap-2 rounded-2xl border border-accent-2/40 bg-accent-2/10 p-3">
          <div className="text-sm font-bold">Your canvas can grow</div>
          {d.connections!.map((c) => <ConnectButton key={c.group_id} c={c} mine={d.group?.id ?? null} busy={busy === 'fuse'} onGo={() => { useUi.getState().setMergeHover(null); void fuse(c.group_id); }} />)}
          <p className="text-[11px] text-muted">Bigger murals earn bigger craft bonuses — merging costs Ink for each plot that joins.</p>
        </div>
      )}
      <Button variant="secondary" size="sm" onClick={() => startMerge(d.group?.id)} data-testid="start-merge"><Combine className="h-4 w-4" /> Merge several plots at once</Button>
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

function HabitatVisit({ d }: { d: PlotDetails }) {
  const hab = useHabitatAt(d.gx, d.gy, true).data;
  const farm = useFarmAt(d.gx, d.gy, true).data;
  const biz = useBizAt(d.gx, d.gy, true).data;
  const arc = useArcadeAt(d.gx, d.gy, true).data;
  if (arc) return (
    <Link to={`/arcade/${arc.arcade_id}`} className="flex items-center gap-3 rounded-2xl border border-[#FF3D9A]/40 bg-[#FF3D9A]/10 p-3 hover:border-[#FF3D9A]" data-testid="visit-arcade">
      <span className="text-2xl">🕹️</span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Arcade · level {arc.level}</div>
        <div className="truncate text-sm font-semibold">{arc.name} · @{arc.owner.username}</div>
      </div>
      <span className="text-xs font-bold text-[#FF3D9A]">Walk in & play →</span>
    </Link>
  );
  if (biz) return (
    <Link to={`/business/${biz.business_id}`} className="flex items-center gap-3 rounded-2xl border border-[#D4A500]/40 bg-[#FFE14D]/10 p-3 hover:border-[#D4A500]" data-testid="visit-business">
      <span className="text-2xl">🍋</span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Business</div>
        <div className="truncate text-sm font-semibold">{biz.name} · @{biz.owner.username}</div>
      </div>
      <span className="text-xs font-bold text-[#D4A500]">Buy a lemonade →</span>
    </Link>
  );
  if (farm) return (
    <Link to={`/farm/${farm.farm_id}`} className="flex items-center gap-3 rounded-2xl border border-[#E0A800]/40 bg-[#F5C842]/10 p-3 hover:border-[#E0A800]" data-testid="visit-farm">
      <span className="text-2xl">🌾</span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Farm</div>
        <div className="truncate text-sm font-semibold">{farm.name} · 🌱 {farm.growing} growing</div>
      </div>
      <span className="text-xs font-bold text-[#E0A800]">Visit →</span>
    </Link>
  );
  if (!hab) return null;
  return (
    <Link to={`/habitat/${hab.habitat_id}`} className="flex items-center gap-3 rounded-2xl border border-[#3DDC97]/40 bg-[#3DDC97]/10 p-3 hover:border-[#3DDC97]" data-testid="visit-habitat">
      <span className="text-2xl">🌳</span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Inkborn Habitat</div>
        <div className="truncate text-sm font-semibold">{hab.name} · 🐾 {hab.creatures} creature{hab.creatures === 1 ? '' : 's'}</div>
      </div>
      <span className="text-xs font-bold text-[#3DDC97]">Visit →</span>
    </Link>
  );
}

function RenamePlot({ d }: { d: PlotDetails }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name ?? '');
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <button className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-line-strong px-3 py-2 text-left text-sm hover:border-accent-2" onClick={() => { setName(d.name ?? ''); setEditing(true); }} data-testid="rename-plot">
        <span className="min-w-0 truncate">{d.name ? <><span className="text-muted">Name:</span> <b>{d.name}</b></> : <span className="text-muted">Give this plot a name</span>}</span>
        <span className="shrink-0 text-xs font-bold text-accent-2">{d.name ? 'Rename' : 'Add'}</span>
      </button>
    );
  }
  return (
    <form className="flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        const r = await api.namePlot(d.gx, d.gy, name.trim() || null);
        toast.success(r.name ? `Named “${r.name}”` : 'Name removed');
        setEditing(false);
        void qc.invalidateQueries({ queryKey: ['plot'] });
        void qc.invalidateQueries({ queryKey: qk.myPlots });
      } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
    }}>
      <input autoFocus className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface/80 px-3 text-sm focus:border-accent focus:outline-none" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="Plot name" aria-label="Plot name" />
      <Button size="sm" type="submit" variant="primary" loading={busy}>Save</Button>
      <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  );
}

/** Unclaimed plots keep their rarity secret until someone claims them. */
function MysteryBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-muted" title="Rarity is revealed when the plot is claimed" data-testid="mystery-rarity">
      <span className="bg-[linear-gradient(90deg,#3DDC97,#2FB8FF,#A45CFF,#FFB31F,#FF3D9A)] bg-clip-text text-transparent">?</span> Mystery rarity
    </span>
  );
}

/** The face of an unclaimed plot: nothing about it is known until it's claimed. */
export function MysterySwatch({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-xl ring-2 ring-white/20', className)} style={{ width: size, height: size }} aria-hidden>
      <div className="absolute inset-0 shimmer opacity-80" />
      <div className="absolute inset-0 flex items-center justify-center font-display text-2xl font-bold text-white drop-shadow">?</div>
    </div>
  );
}
