import { plotBlocks } from '../map/WorldMap';
import { TravelPlotCard, useTravelUi } from '../travel/Travel';
import { HouseCard, LandlordCard } from '../residential/ResidentialCard';
import { WalletDialog } from '../rent/RentHud';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { startMerge, useFuseCost } from './MergeBar';
import { kindOf } from './mergeKind';
import { mergePieces, useMapFx } from '../map/MapFx';
import { diveInto } from '../map/Hud';
import { Combine, ArrowUpRight, Brush, Footprints, Gamepad2, Link2, Lock, MapPin, Scissors, Sparkles, Upload, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { rarities } from '../shared/rarity';
import { RarityBadge } from './RarityBadge';
import { MadeBadge } from '../gallery/MadeBadge';
import { kindFamily } from '../realms/estates/meta';
import { PlaceAccessCard } from './placeAccess';
import { EstateCard } from './EstateCard';
import { GamePreview } from '../play/GamePreview';
import { formatRate } from '../shared/rent';
import { plotMetres } from '../shared/grid';
import { enableGps, useExplorer } from '../explorer/explorer';
import { useCelebration } from './ClaimCelebration';
import { PlotKindControl, PlotKindDialog } from '../inkborn/PlotKindPicker';
import { isRealm, REALM_META, realmRoute } from '../realms/kinds';

const useFarmAt = (gx: number, gy: number, on: boolean) => useQuery({ queryKey: ['plot', 'farm', gx, gy], queryFn: () => api.farmForPlot(gx, gy), enabled: on, staleTime: 30_000 });
const useArcadeAt = (gx: number, gy: number, on: boolean) => useQuery({ queryKey: ['plot', 'arcade', gx, gy], queryFn: () => api.arcadeForPlot(gx, gy), enabled: on, staleTime: 30_000 });
const useBizAt = (gx: number, gy: number, on: boolean) => useQuery({ queryKey: ['plot', 'business', gx, gy], queryFn: () => api.bizForPlot(gx, gy), enabled: on, staleTime: 30_000 });
const useRealmAt = (gx: number, gy: number, on: boolean) => useQuery({ queryKey: ['plot', 'realm', gx, gy], queryFn: () => api.realmForPlot(gx, gy), enabled: on, staleTime: 30_000 });
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
      className="glass fixed inset-x-0 bottom-0 z-30 max-h-[72dvh] overflow-y-auto rounded-t-[28px] px-[max(16px,env(safe-area-inset-left,0px))] pb-[calc(84px+env(safe-area-inset-bottom,0px))] pt-4 scroll-thin md:absolute md:bottom-auto md:left-auto md:right-6 md:top-[116px] md:max-h-[calc(100%-140px)] md:w-[400px] md:rounded-[28px] md:p-5"
      aria-label="Plot details" data-testid="plot-panel">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong md:hidden" />
      <div className="flex items-start gap-3">
        {d?.plot_type ? <PlotSwatch type={d.plot_type} className="ring-2" /> : d ? <MysterySwatch /> : <div className="h-14 w-14 rounded-xl bg-surface-2" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {d && (d.rarity ? <RarityBadge r={d.rarity} /> : <MysteryBadge />)}
            {(d?.owned || d?.type_info) && <span className="eyebrow">{d?.type_info ? `${d.type_info.name} · ${d.type_info.minigame_name}` : 'Plot'}</span>}
          </div>
          <h2 className="mt-1 truncate font-display text-lg font-semibold" data-testid="plot-title">{d?.name || (d && !d.owned ? 'Unclaimed land' : <span className="tnum">Plot {plotLabel(selected.gx, selected.gy)}</span>)}</h2>
          {d && (d.owned
            ? <p className="text-xs text-faint tnum">{d.name ? `Plot ${plotLabel(selected.gx, selected.gy)} · ` : ''}{d.center.lat.toFixed(4)}°, {d.center.lng.toFixed(4)}° · ≈{plotMetres(d.center.lat).toFixed(1)} m square</p>
            : <p className="text-xs text-faint tnum">Plot {plotLabel(selected.gx, selected.gy)} · ≈{plotMetres(d.center.lat).toFixed(0)} m square</p>)}
        </div>
        <button onClick={() => select(null)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close plot panel"><X className="h-5 w-5" /></button>
      </div>
      {q.isLoading && <div className="flex justify-center py-10"><Spinner /></div>}
      {q.error && <p className="mt-4 text-sm text-bad">{toGameError(q.error).message}</p>}
      {d && !d.owned && (
        <div className="mt-4 grid gap-3">
          {d.type_info && d.plot_type ? (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/50 p-2.5">
              <GamePreview game={d.type_info.minigame} size={44} className="shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Minigame</div>
                <div className="truncate font-display font-semibold">{d.type_info.minigame_name}</div>
              </div>
            </div>
          ) : null}
          {!d.rarity && <RarityOdds />}
          {d.locked && <p className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm"><Lock className="h-4 w-4" /> This plot is locked while a dispute is reviewed.</p>}
          <AcquireBlock d={d} signedIn={!!session} onClaimed={setClaimed} onGrow={setGrow} />
        </div>
      )}
      {d && d.owned && (
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
          {!d.is_mine && d.owner && (
            <Link to={`/u/${d.owner.username}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3 hover:border-line-strong">
              <PlayerAvatar p={d.owner} size={40} />
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Owned by</div>
                <div className="truncate font-semibold">{d.owner.display_name || d.owner.username} <span className="text-faint">@{d.owner.username}</span></div>
              </div>
              <span className="text-xs text-muted">Level {d.level}</span>
            </Link>
          )}
          {!d.is_mine && <HabitatVisit d={d} />}
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
  // how the art was made comes with the artwork's own details (shared with its page)
  const made = useQuery({ queryKey: ['artwork', art.publication_id], queryFn: () => api.artworkDetail(art.publication_id), staleTime: 60_000 }).data?.made;
  return (
    <Link to={`/art/${art.publication_id}`} className="group flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 p-3 hover:border-line-strong">
      <div className="min-w-0">
        <div className="eyebrow">Artwork on this plot</div>
        <div className="truncate font-semibold">{art.title}</div>
        <div className="text-xs text-muted">by @{art.artist.username} · {art.plot_count} plot{art.plot_count === 1 ? '' : 's'} · {art.appreciation_count} ♥</div>
        <MadeBadge made={made} className="mt-1.5" />
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
  const [naming, setNaming] = useState(false);
  const [kind, setKind] = useState<PlotKind>(() => { const k = safeStorage<string>('landvas.plotKind', 'base'); return k === 'canvas' || k === 'habitat' || k === 'farm' || k === 'business' || k === 'arcade' || k === 'home' || k === 'landlord' || k === 'train' || k === 'plane' || isRealm(k) ? (k as PlotKind) : 'base'; });
  const pickKind = (k: PlotKind) => { setKind(k); saveStorage('landvas.plotKind', k); };
  const a = d.acquire;
  if (!signedIn || !me) {
    return <GameCta color="#8b6bff" onClick={() => nav('/welcome?next=/')} label="Sign up to claim" />;
  }
  const starter = a?.starter_available;
  const cost = Number(a?.ink ?? 0);
  const canAfford = Number(me.balances.ink) >= cost;
  const reach = d.reach;
  const inReach = reach?.in_reach ?? false;
  const gpsOn = ex.gps === 'on';
  // what the new plot becomes is the player's choice; a habitat is the same plot at the same price
  const becomeHabitat = async (groupId: string) => {
    if (kind === 'base') return null;
    try { const g = await api.setGroupKind(groupId, kind); if (kind === 'farm' && g.farm_id) { toast.success('Your farm is ready 🌾', { action: { label: 'Enter it', onClick: () => nav(`/farm/${g.farm_id}`) } }); return null; }
      if (kind === 'business' && g.business_id) { toast.success('Your lemonade stand is open 🍋', { action: { label: 'Open it', onClick: () => nav(`/business/${g.business_id}`) } }); return null; }
      if (kind === 'arcade' && g.arcade_id) { toast.success('Your arcade is open 🕹️', { action: { label: 'Walk in', onClick: () => nav(`/arcade/${g.arcade_id}`) } }); return null; }
      if (kind === 'home') { toast.success('Your home is built 🏠', { description: 'Visitors can walk in from your profile now.', action: { label: 'Go in', onClick: () => nav('/home') } }); return null; }
      if (kind === 'train' || kind === 'plane') { toast.success(kind === 'train' ? 'Your rail depot is open 🚆' : 'Your airfield is open ✈️', { description: kind === 'train' ? 'Tap Travel on the map to ride to real stations.' : 'Tap Travel on the map to fly to real airports.' }); return null; }
      if (kind === 'landlord') { toast.success('Tenants are moving in 🏘️', { description: 'On the 1st of every month these plots earn 50× USD rent all day.' }); return null; }
      if (isRealm(kind) && g.realm_id) { const m = REALM_META[kind]; toast.success(`Your ${m.one} is ready ${m.emoji}`, { action: { label: m.enter, onClick: () => nav(realmRoute(g.realm_id!)) } }); return null; }
      return g.habitat_id ?? null; }
    catch (e) { toast.error(toGameError(e).message); return null; }
  };
  const run = async () => {
    setBusy('claim');
    try {
      if (starter) {
        const r = await api.claimStarter(d.gx, d.gy, name);
        celebrate(r.achievements);
        const hab = await becomeHabitat(r.group_id);
        useCelebration.getState().show({ gx: d.gx, gy: d.gy, rarity: r.rarity, type: r.plot_type as PlotTypeId, name: r.name, usd: Number(r.usd_per_second), groupId: r.group_id, first: true, habitatId: hab, base: kind === 'base', shiny: !!(r as { shiny?: boolean }).shiny, lucky: !!(r as { lucky?: boolean }).lucky });
      } else {
        const r = await api.acquirePlot(d.gx, d.gy, name);
        celebrate(r.achievements);
        const hab = await becomeHabitat(r.group_id);
        // only plots of the same type can join up (art with art, habitat with habitat)
        const groups = (qc.getQueryData(qk.groups) as CanvasGroup[] | undefined) ?? [];
        const kindOf = (id: string) => groups.find((g) => g.id === id)?.kind ?? 'canvas';
        const mineAdjacent = [...new Set(d.neighbors.filter((n) => n.is_mine && n.group_id).map((n) => n.group_id!))].filter((id) => kindFamily(kindOf(id)) === kindFamily(kind));
        useCelebration.getState().show({
          gx: d.gx, gy: d.gy, rarity: r.rarity, type: r.plot_type as PlotTypeId, name: r.name, usd: Number(r.usd_per_second), groupId: r.group_id, first: false, habitatId: hab, base: kind === 'base', shiny: !!(r as { shiny?: boolean }).shiny, lucky: !!(r as { lucky?: boolean }).lucky,
          onDone: mineAdjacent.length ? () => setGrow({ newGroup: r.group_id, neighbors: mineAdjacent, habitat: kind === 'habitat' }) : undefined,
        });
      }
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
      void qc.invalidateQueries({ queryKey: ['luck'] });
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setBusy(null);
    }
  };
  const freeLeft = Number((a as any)?.free_left ?? 0);
  const unavailable = d.available === false;
  const ink = Number(me.balances.ink);
  const opt = optOf(kind);
  const nextToMine = d.neighbors.some((n) => n.is_mine);
  // 1) no explorer yet → one clear step: turn on location
  if (!reach?.explorer) {
    return (
      <div className="grid justify-items-center gap-2 rounded-2xl border border-line bg-surface/50 p-4 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-accent/15"><MapPin className="h-6 w-6 text-accent-2" /></div>
        <div className="font-display text-[17px] font-semibold">Turn on your location</div>
        <p className="text-xs text-muted">You claim the land right around where you really are.</p>
        <Button className="mt-1 w-full" variant="primary" size="lg" loading={ex.gps === 'asking'} onClick={() => enableGps()} data-testid="plot-use-gps"><MapPin className="h-4 w-4" /> Use my location</Button>
      </div>
    );
  }
  // 2) too far away → how far, and that walking closer is the way
  if (!inReach) {
    const dist = reach.distance ?? 0;
    const steps = Math.min(12, Math.max(1, dist));
    return (
      <div className="grid justify-items-center gap-2 rounded-2xl border border-line bg-surface/50 p-4 text-center" data-testid="plot-out-of-reach">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-2/15"><Footprints className="h-6 w-6 text-accent-2" /></div>
        <div className="font-display text-[17px] font-semibold"><span className="tnum">{fmt(dist)}</span> plots away</div>
        <div className="flex items-center gap-1" aria-hidden>
          {Array.from({ length: steps }, (_, i) => <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < reach.max ? 'bg-ok' : 'bg-line-strong')} />)}
          <MapPin className="ml-1 h-3.5 w-3.5 text-[#FFE14D]" />
        </div>
        <p className="text-xs text-muted">Walk within {reach.max} plot{reach.max === 1 ? '' : 's'} to claim it — your explorer follows you.</p>
        {!gpsOn && <Button className="mt-1 w-full" variant="primary" loading={ex.gps === 'asking'} onClick={() => enableGps()} data-testid="plot-use-gps"><MapPin className="h-4 w-4" /> Turn on my location</Button>}
      </div>
    );
  }
  // 3) in reach: pick what to build, then one big button
  const affordable = starter || canAfford;
  return (
    <div className="grid gap-3">
      {affordable && !unavailable && <PlotKindChoice kind={kind} onPick={pickKind} />}
      {nextToMine && affordable && !unavailable && (
        <div className="flex items-center gap-2 rounded-xl bg-accent-2/10 px-3 py-2 text-xs font-semibold text-accent-2"><Link2 className="h-3.5 w-3.5 shrink-0" /> Next to your land — you can connect them after</div>
      )}
      {affordable && !unavailable && (naming ? (
        <input autoFocus className="h-10 w-full rounded-xl border border-line bg-surface/80 px-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none" maxLength={32}
          placeholder="Plot name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Plot name" data-testid="plot-name-input" />
      ) : (
        <button type="button" onClick={() => setNaming(true)} className="justify-self-start text-xs font-bold text-muted hover:text-fg" data-testid="plot-name-toggle">✎ Name it (optional)</button>
      ))}
      {freeLeft > 0 && !unavailable && (
        <div className="justify-self-center rounded-full bg-ok/15 px-3 py-1 text-[11px] font-bold text-ok" data-testid="free-plots-left">🎁 {freeLeft} free plot{freeLeft === 1 ? '' : 's'} left for new players</div>
      )}
      {unavailable ? (
        <GameCta color="#5a6385" disabled label="Unavailable" />
      ) : affordable ? (
        <GameCta color={opt.color} loading={busy === 'claim'} onClick={run} testid="claim-plot"
          label={starter ? 'Claim free plot' : 'Claim'} sub={SUBS[kind] ? `${opt.title} · ${SUBS[kind]!.title}` : opt.title}
          price={starter || cost === 0 ? <span className="font-extrabold">FREE</span> : <span className="inline-flex items-center gap-1 tnum"><ResourceIcon r="ink" className="h-4 w-4" />{fmt(cost)}</span>} />
      ) : (
        <div className="grid gap-2.5 rounded-2xl border border-line bg-surface/50 p-3" data-testid="plot-need-ink">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">Not enough Ink</span>
            <span className="inline-flex items-center gap-1 font-bold tnum"><ResourceIcon r="ink" className="h-3.5 w-3.5" />{fmt(ink)} <span className="text-faint">/ {fmt(cost)}</span></span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#22e3ff,#8b6bff)]" initial={{ width: 0 }} animate={{ width: `${Math.max(4, Math.min(100, (ink / Math.max(1, cost)) * 100))}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
          <GameCta color="#8b6bff" onClick={() => nav('/play')} label={`Win ${fmt(cost - ink)} more Ink`} icon={<Gamepad2 className="h-5 w-5" />} />
        </div>
      )}
    </div>
  );
}

/** Every plot type, in picker order. Same price and rent whichever you pick. Residential is one type with two
 *  subplots (Home, Landlord): picking it opens the choice between them. */
type KindOpt = { k: PlotKind; icon: string; title: string; body: string; color: string; perks: string[]; subs?: PlotKind[]; tid?: string };
const KIND_OPTS: KindOpt[] = [
  { k: 'base', icon: '🟩', title: 'Base', body: 'Just land: earns rent, no extras — give it a type any time, free', color: '#5FB37A', perks: ['Earns USD rent like any plot', 'Nothing to look after', 'Turn it into any type later, free'] },
  { k: 'canvas', icon: '🎨', title: 'Art', body: 'Paint art the whole world can see', color: '#7B5CFF', perks: ['Paint with every brush and tool', 'Publish your art onto the map', 'Merge neighbours into one mural'] },
  { k: 'habitat', icon: '🌳', title: 'Habitat', body: 'A home for your Inkborn — merge plots to grow it', color: '#3DDC97', perks: ['A woodland sanctuary to walk around', 'Room for more Inkborn as it grows', 'Trees, nests and lanterns to place'] },
  { k: 'farm', icon: '🌾', title: 'Farm', body: 'Grow, harvest and sell crops — 6 soil beds to start', color: '#E0A800', perks: ['Soil beds in a 3D farmyard', 'Farm levels, buildings and orders', 'Farm games, 2D and 3D'] },
  { k: 'business', icon: '🍋', title: 'Business', body: 'Lemonade stand to empire — +10% to all your income', color: '#D4A500', perks: ['Ten kinds of business to buy', 'Earns while you’re away', 'Money-making games'] },
  { k: 'arcade', icon: '🕹️', title: 'Arcade', body: 'Neon cabinets and prizes — you get 10% of tickets won', color: '#FF3D9A', perks: ['Free cabinets: win tickets and Ink', 'Prize counter, upgrades, neon decor', 'Grows a carnival outside as an Estate'] },
  { k: 'home', icon: '🏡', title: 'Residential', body: 'Houses: your home, or homes you rent out', color: '#E0745C', subs: ['home', 'landlord'], tid: 'residential', perks: ['Two subplots — choose Home or Landlord', 'Switch between them for free'] },
  { k: 'train', icon: '🧳', title: 'Travel', body: 'Ride trains and fly to real stations and airports', color: '#2FA4D9', subs: ['train', 'plane'], tid: 'travel', perks: ['Two subplots — choose Train or Plane', 'Arrive and really be there: claim and play', 'A souvenir stamp for every stop', 'Switch between them for free'] },
  ...(['brawl', 'mine', 'sky', 'workshop', 'diner', 'dungeon'] as const).map((k) => ({
    k, icon: REALM_META[k].emoji, color: REALM_META[k].color, body: REALM_META[k].body,
    title: ({ brawl: 'Arena', mine: 'Mine', sky: 'Sky Island', workshop: 'Workshop', diner: 'Restaurant', dungeon: 'Dungeon' } as const)[k],
    perks: k === 'brawl' ? ['Painted creature cards, live battles', 'Packs, crafting and ranked trophies'] : ['Six zones that open as it levels', `${REALM_META[k].crew} that work while you’re away`, 'A signature minigame anyone can play'],
  })),
];
/** the subplots, by kind */
const SUBS: Partial<Record<PlotKind, { icon: string; title: string; body: string; perks: string[] }>> = {
  home: { icon: '🏠', title: 'Home', body: 'Your house: visitors walk in from your profile', perks: ['Opens “Visit home” on your profile', 'Merge 2×2 … 10×10 for a bigger house: floors, stairs, balconies, a roof terrace, a lift, a pool', 'Visitors check in with a note or a drawing in your book'] },
  train: { icon: '🚆', title: 'Train', body: 'Ride to real stations on the rail network', perks: ['Board at the station nearest you', 'Stop at the real stations on the way', '4 trips a day, +1 for each extra Train plot'] },
  plane: { icon: '✈️', title: 'Plane', body: 'Fly to 3,000+ real airports worldwide', perks: ['Board at the airport nearest you', 'Fly anywhere in the world in minutes', '2 flights a day, +1 for each extra Plane plot'] },
  landlord: { icon: '🏘️', title: 'Landlord', body: 'Homes you rent to virtual tenants', perks: ['Tenants pay on the 1st of every month', 'Rent day: 50× USD rent from these plots all day', 'Normal rent the rest of the month'] },
};
/** the type a kind belongs to (a subplot belongs to its main type) */
const optOf = (k: PlotKind) => KIND_OPTS.find((o) => o.k === k || o.subs?.includes(k)) ?? KIND_OPTS[0];

function PlotKindChoice({ kind, onPick }: { kind: PlotKind; onPick(k: PlotKind): void }) {
  const [details, setDetails] = useState(false);
  const opt = optOf(kind);
  const sub = SUBS[kind];
  return (
    <div className="grid gap-2" data-testid="plot-kind-choice">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Build a…</span>
        <span className="text-[11px] text-faint">Same price for every type</span>
      </div>
      {/* every type at once: tiny squares */}
      <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="What this plot becomes">
        {KIND_OPTS.map((o) => {
          const on = opt.k === o.k;
          return (
            <motion.button key={o.k} type="button" role="radio" aria-checked={on} aria-label={o.title} title={o.title} whileTap={{ scale: 0.9 }}
              onClick={() => onPick(o.subs ? (o.subs.includes(kind) ? kind : o.subs[0]) : o.k)} data-testid={`buy-as-${o.tid ?? o.k}`}
              className={cn('relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 p-0.5 transition', on ? 'bg-surface-2' : 'border-transparent bg-surface/50 opacity-75 hover:opacity-100')}
              style={on ? { borderColor: o.color, boxShadow: `0 0 16px -6px ${o.color}` } : undefined}>
              <span className="text-[20px] leading-none">{o.icon}</span>
              <span className="w-full truncate text-center text-[9px] font-bold leading-tight" style={{ color: on ? o.color : undefined }}>{o.title}</span>
              {o.subs && <span className="absolute right-0.5 top-0.5 text-[8px] leading-none text-faint" aria-hidden>▾</span>}
            </motion.button>
          );
        })}
      </div>
      {/* Residential / Travel: pick the subplot */}
      <AnimatePresence initial={false}>
        {opt.subs && (
          <motion.div key="subs" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl border p-1.5" style={{ borderColor: `${opt.color}55`, background: `${opt.color}12` }} role="radiogroup" aria-label={`${opt.title} subplot`} data-testid="buy-subplots">
              {opt.subs.map((k) => {
                const sp = SUBS[k]!, on = kind === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onPick(k)} data-testid={`buy-as-${k}`}
                    className={cn('flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left transition', on ? 'bg-surface-2' : 'border-transparent opacity-75 hover:opacity-100')} style={on ? { borderColor: opt.color } : undefined}>
                    <span className="text-xl">{sp.icon}</span>
                    <span className="min-w-0"><span className="block text-xs font-bold" style={{ color: on ? opt.color : undefined }}>{sp.title}</span><span className="block text-[10px] leading-tight text-muted">{sp.body}</span></span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={kind} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
          className="min-h-[18px] text-center text-xs text-muted">{sub ? `${sub.icon} ${opt.title} · ${sub.title}: ${sub.body}` : opt.body}</motion.p>
      </AnimatePresence>
      {/* every type's details (and the subplots') */}
      <button type="button" onClick={() => setDetails((v) => !v)} className="justify-self-center text-[11px] font-bold text-muted hover:text-fg" aria-expanded={details} data-testid="buy-details-toggle">
        {details ? '▴ Hide details' : '▾ What can each type do?'}
      </button>
      <AnimatePresence initial={false}>
        {details && (
          <motion.div key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid max-h-[46vh] gap-1.5 overflow-y-auto pr-1 scroll-thin" data-testid="buy-details">
              {KIND_OPTS.map((o) => (
                <div key={o.k} className={cn('rounded-xl border p-2', optOf(kind).k === o.k ? '' : 'border-line')} style={optOf(kind).k === o.k ? { borderColor: o.color } : undefined}>
                  <button type="button" onClick={() => onPick(o.subs ? (o.subs.includes(kind) ? kind : o.subs[0]) : o.k)} className="flex w-full items-center gap-2 text-left">
                    <span className="text-xl">{o.icon}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-bold" style={{ color: o.color }}>{o.title}</span><span className="block text-[11px] text-muted">{o.body}</span></span>
                  </button>
                  <ul className="mt-1 grid gap-0.5 pl-8 text-[11px]">{o.perks.map((p) => <li key={p} className="flex gap-1"><span style={{ color: o.color }}>✦</span>{p}</li>)}</ul>
                  {o.subs && (
                    <div className="mt-1.5 grid gap-1.5 pl-8">
                      {o.subs.map((k) => { const sp = SUBS[k]!; return (
                        <button key={k} type="button" onClick={() => onPick(k)} className={cn('rounded-lg border p-1.5 text-left', kind === k ? '' : 'border-line')} style={kind === k ? { borderColor: o.color } : undefined} data-testid={`buy-detail-${k}`}>
                          <div className="text-xs font-bold">{sp.icon} {sp.title} <span className="font-normal text-muted">— {sp.body}</span></div>
                          <ul className="mt-0.5 grid gap-0.5 text-[10.5px] text-muted">{sp.perks.map((p) => <li key={p}>· {p}</li>)}</ul>
                        </button>
                      ); })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The big, chunky, pressable game button (raised edge, sinks when tapped). */
function GameCta({ color, label, sub, price, icon, onClick, loading, disabled, testid }: {
  color: string; label: string; sub?: string; price?: ReactNode; icon?: ReactNode; onClick?(): void; loading?: boolean; disabled?: boolean; testid?: string;
}) {
  const off = disabled || loading;
  return (
    <motion.button type="button" onClick={onClick} disabled={off} data-testid={testid} whileTap={off ? undefined : { y: 4, boxShadow: `0 1px 0 0 color-mix(in srgb, ${color} 55%, black)` }}
      className={cn('relative flex h-[58px] w-full select-none items-center gap-3 overflow-hidden rounded-2xl px-4 text-left text-white', disabled && 'opacity-60')}
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${color} 72%, white), ${color} 55%)`, boxShadow: `0 5px 0 0 color-mix(in srgb, ${color} 55%, black), 0 16px 30px -14px ${color}` }}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" aria-hidden />
      <span className="relative grid h-8 w-8 shrink-0 place-items-center">{loading ? <Spinner /> : (icon ?? <Sparkles className="h-5 w-5" />)}</span>
      <span className="relative min-w-0 flex-1 leading-tight">
        <span className="block truncate font-display text-[18px] font-bold drop-shadow-[0_1px_0_rgba(0,0,0,0.25)]">{label}</span>
        {sub && <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-white/80">{sub}</span>}
      </span>
      {price && <span className="relative shrink-0 rounded-xl bg-black/25 px-3 py-1.5 text-[15px] font-bold">{price}</span>}
    </motion.button>
  );
}

/** What a mystery plot could roll: one bar, five rarities, real odds. */
function RarityOdds() {
  const list = rarities();
  const total = list.reduce((s, r) => s + Number(r.weight), 0) || 1;
  const pct = (w: number) => { const p = (w / total) * 100; return p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`; };
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-3" data-testid="mystery-note">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted">What’s inside?</span>
        <span className="text-[11px] text-faint">Revealed when you claim</span>
      </div>
      <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {list.map((r) => <div key={r.id} style={{ flex: Number(r.weight), background: r.color, boxShadow: `0 0 10px ${r.color}` }} />)}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 text-center">
        {list.map((r) => (
          <div key={r.id} className="min-w-0">
            <div className="truncate text-[10px] font-extrabold uppercase" style={{ color: r.glow }}>{r.name}</div>
            <div className="text-[10px] text-faint tnum">{pct(Number(r.weight))}</div>
          </div>
        ))}
      </div>
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
  // only plots of the same type can merge
  const myGroups = qc.getQueryData(qk.groups) as CanvasGroup[] | undefined;
  const myGroup = useQuery({ queryKey: qk.groups, queryFn: api.myGroups }).data?.find((g) => g.id === d.group?.id);
  const sameKind = (d.connections ?? []).filter((c) => !d.group || kindFamily(kindOf(myGroups, c.group_id)) === kindFamily(kindOf(myGroups, d.group.id)));
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
  // ask only about what this plot is (the map already knows); if it doesn't, ask about each kind of place
  // your own plot: its real type; anyone's: what the map knows (Base is never mistaken for Art)
  const k = myGroup?.kind ?? (d.group ? plotBlocks.kindAt(d.gx, d.gy) : null);
  const any = k === undefined;
  const isRealm = !!k && !['canvas', 'base', 'habitat', 'farm', 'business', 'arcade', 'home', 'landlord', 'train', 'plane'].includes(k);
  const hab = useHabitatAt(d.gx, d.gy, any || k === 'habitat').data;
  const farm = useFarmAt(d.gx, d.gy, any || k === 'farm').data;
  const biz = useBizAt(d.gx, d.gy, any || k === 'business').data;
  const arc = useArcadeAt(d.gx, d.gy, any || k === 'arcade' || k === 'boardwalk' || k === 'galaxypark').data;
  const rlm = useRealmAt(d.gx, d.gy, any || isRealm).data;
  const [wallet, setWallet] = useState(false);
  const [typing, setTyping] = useState(false);
  return (
    <div className="grid gap-3">
      {wallet && <WalletDialog open onOpenChange={setWallet} />}
      {typing && d.group && <PlotKindDialog g={{ id: d.group.id, name: d.group.name, plot_count: d.group.plot_count, kind: 'base' }} open onOpenChange={setTyping} />}
      {myGroup && k === 'home' && <HouseCard group={myGroup} />}
      {myGroup && k === 'landlord' && <LandlordCard group={myGroup} />}
      {myGroup && (k === 'train' || k === 'plane') && <TravelPlotCard mode={k} />}
      {myGroup && k !== 'home' && k !== 'landlord' && k !== 'train' && k !== 'plane' && <EstateCard group={myGroup} />}
      <RenamePlot d={d} />
      {d.group && <PlotKindControl g={{ id: d.group.id, name: d.group.name, plot_count: d.group.plot_count, kind: rlm ? rlm.kind : hab ? 'habitat' : farm ? 'farm' : biz ? 'business' : arc ? 'arcade' : k === 'home' || k === 'landlord' || k === 'train' || k === 'plane' || k === 'base' ? k : 'canvas', habitat_id: hab?.habitat_id ?? null, farm_id: farm?.farm_id ?? null, business_id: biz?.business_id ?? null, arcade_id: arc?.arcade_id ?? null, realm_id: rlm?.realm_id ?? null }} />}
      <div className="grid grid-cols-2 gap-2">
        {rlm && arc ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/arcade/${arc.arcade_id}`, d.center); }} data-testid="open-realm">{REALM_META[rlm.kind].emoji} {REALM_META[rlm.kind].enter}</Button>
          : rlm ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, realmRoute(rlm.realm_id), d.center); }} data-testid="open-realm">{REALM_META[rlm.kind].emoji} {REALM_META[rlm.kind].enter}</Button>
          : arc ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/arcade/${arc.arcade_id}`, d.center); }} data-testid="open-arcade">🕹️ Enter arcade</Button>
          : biz ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/business/${biz.business_id}`, d.center); }} data-testid="open-business">🍋 Open business</Button>
          : farm ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/farm/${farm.farm_id}`, d.center); }} data-testid="open-farm">🌾 Enter farm</Button>
          : hab ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, `/habitat/${hab.habitat_id}`, d.center); }} data-testid="open-habitat">🐾 Enter sanctuary</Button>
          : k === 'home' ? <Button variant="primary" onClick={() => { useUi.getState().select(null); diveInto(nav, '/home', d.center); }} data-testid="open-house">🏠 Enter your home</Button>
          : k === 'landlord' ? <Button variant="primary" onClick={() => setWallet(true)} data-testid="open-rentals">💵 Your rent</Button>
          : k === 'train' || k === 'plane' ? <Button variant="primary" onClick={() => { useUi.getState().select(null); useTravelUi.getState().setOpen(true); }} data-testid="open-travel">{k === 'train' ? '🚆 Ride a train' : '✈️ Take a flight'}</Button>
          : k === 'base' ? <Button variant="primary" onClick={() => setTyping(true)} data-testid="give-type">🟩 Give it a type</Button>
          : <Button variant="primary" onClick={() => { if (!d.group) return; useUi.getState().select(null); diveInto(nav, `/create/${d.group.id}`, d.center); }} data-testid="open-canvas"><Brush className="h-4 w-4" /> Paint canvas</Button>}
        <Button onClick={() => nav(`/play/${d.type_info!.minigame}?gx=${d.gx}&gy=${d.gy}`)}><Gamepad2 className="h-4 w-4" /> {d.type_info!.minigame_name}</Button>
      </div>
      {d.group && d.group.plot_count > 1 && (
        <p className="text-xs text-muted">Part of <b className="text-fg">{d.group.name}</b> — a {d.group.max_gx - d.group.min_gx + 1}×{d.group.max_gy - d.group.min_gy + 1} canvas of {d.group.plot_count} plots.</p>
      )}
      {sameKind.length > 0 && (
        <div className="grid gap-2 rounded-2xl border border-accent-2/40 bg-accent-2/10 p-3">
          <div className="text-sm font-bold">Your canvas can grow</div>
          {sameKind.map((c) => <ConnectButton key={c.group_id} c={c} mine={d.group?.id ?? null} busy={busy === 'fuse'} onGo={() => { useUi.getState().setMergeHover(null); void fuse(c.group_id); }} />)}
          <p className="text-[11px] text-muted">Bigger murals earn bigger craft bonuses — merging costs Ink for each plot that joins.</p>
        </div>
      )}
      <Button variant="secondary" size="sm" onClick={() => startMerge(d.group?.id)} data-testid="start-merge"><Combine className="h-4 w-4" /> Merge several plots at once</Button>
      {myGroup && <PlaceAccessCard group={myGroup} />}
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
  const rlm = useRealmAt(d.gx, d.gy, true).data;
  const kind = plotBlocks.kindAt(d.gx, d.gy);
  if ((kind === 'home' || kind === 'landlord') && d.owner) return (
    <Link to={`/u/${d.owner.username}/home`} className="flex items-center gap-3 rounded-2xl border border-[#E0745C]/40 bg-[#E0745C]/10 p-3 hover:border-[#E0745C]" data-testid="visit-house">
      <span className="text-2xl">{kind === 'home' ? '🏠' : '🏘️'}</span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Residential · {kind === 'home' ? 'Home' : 'Landlord'}</div>
        <div className="truncate text-sm font-semibold">{kind === 'home' ? `@${d.owner.username}’s home` : `@${d.owner.username}’s rentals`}</div>
      </div>
      <span className="text-xs font-bold text-[#E0745C]">{kind === 'home' ? 'Visit & check in →' : 'Visit their home →'}</span>
    </Link>
  );
  if (rlm) { const m = REALM_META[rlm.kind]; return (
    <Link to={arc ? `/arcade/${arc.arcade_id}` : realmRoute(rlm.realm_id)} className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: `${m.color}66`, background: `${m.color}1A` }} data-testid="visit-realm">
      <span className="text-2xl">{m.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">{m.name} · level {rlm.level}</div>
        <div className="truncate text-sm font-semibold">{rlm.name || m.name} · @{rlm.owner.username}</div>
      </div>
      <span className="text-xs font-bold" style={{ color: m.color }}>{arc ? `${m.enter} →` : 'Visit & play →'}</span>
    </Link>
  ); }
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
