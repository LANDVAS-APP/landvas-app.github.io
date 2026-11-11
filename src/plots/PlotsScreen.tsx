// /plots — every plot you own, in one place: sort, filter and search them, see what each one
// earns and does, and jump straight to it (on the map, into its sanctuary or canvas, or its game).
import { kindFamily } from '../realms/estates/meta';
import { CollectionCard, CollectionDialog } from '../daily/Collection';
import { RentCalculator } from '../rent/RentCalculator';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownUp, Brush, ChevronRight, Combine, Gamepad2, MapPin, PawPrint, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { CanvasGroup } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { explorerNow, cellDistance, useExplorer } from '../explorer/explorer';
import { celebrate, invalidateGame, qk, useOnboardedMe, useWorld } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, safeStorage, saveStorage, timeAgo } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { RarityBadge } from '../plot/RarityBadge';
import { startMerge } from '../plot/MergeBar';
import { Z_HOUSE, cellCenter, lngLatToCell, type PlotTypeId } from '../shared/grid';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { formatUsd } from '../shared/rent';
import { Button, Dialog, Empty, ResourceIcon, Spinner } from '../ui';
import { PlacesSheet } from '../space/Places';
import { isRealm, REALM_META, realmRoute } from '../realms/kinds';

type Row = { gx: number; gy: number; plot_type: PlotTypeId; rarity: string; level: number; claimed_at: string; group_id: string | null; has_art: boolean; name: string | null; usd_per_second: number };
type Sort = 'newest' | 'oldest' | 'rarity' | 'rent' | 'level' | 'nearest' | 'name' | 'type';
type Filter = 'all' | 'base' | 'canvas' | 'habitat' | 'art' | 'blank';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'rarity', label: 'Rarity' }, { id: 'rent', label: 'Rent' }, { id: 'level', label: 'Level' }, { id: 'nearest', label: 'Nearest' },
  { id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'name', label: 'Name' }, { id: 'type', label: 'Type' },
];
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'base', label: '🟩 Base' }, { id: 'canvas', label: '🎨 Art' }, { id: 'habitat', label: '🐾 Habitats' }, { id: 'art', label: 'With art' }, { id: 'blank', label: 'Blank' },
];
const DAY = 86400;
export const plotTitle = (r: { name: string | null; gx: number; gy: number }) => r.name || `Plot ${r.gx.toLocaleString()} · ${r.gy.toLocaleString()}`;

export default function PlotsScreen() {
  const me = useOnboardedMe();
  const [album, setAlbum] = useState(false);
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me });
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const ex = useExplorer();
  const [sort, setSort] = useState<Sort>(() => safeStorage<Sort>('landvas.plots.sort', 'rarity'));
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const [limit, setLimit] = useState(120);
  const byGroup = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data]);
  const here = useMemo(() => { const p = explorerNow(ex.state, ex.offset); return p ? lngLatToCell(p.lng, p.lat) : null; }, [ex.state?.lng, ex.state?.lat]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = (plots.data ?? []) as Row[];
  const kindOf = (r: Row) => (r.group_id ? byGroup.get(r.group_id)?.kind ?? 'base' : 'base');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (filter === 'base' && kindOf(r) !== 'base') return false;
      if (filter === 'canvas' && kindFamily(kindOf(r)) !== 'canvas') return false;
      if (filter === 'habitat' && kindOf(r) !== 'habitat') return false;
      if (filter === 'art' && !r.has_art) return false;
      if (filter === 'blank' && (r.has_art || kindFamily(kindOf(r)) !== 'canvas')) return false;
      if (!s) return true;
      const g = r.group_id ? byGroup.get(r.group_id) : null;
      return plotTitle(r).toLowerCase().includes(s) || `${r.gx} ${r.gy}`.includes(s) || r.plot_type.includes(s) || r.rarity.includes(s) || (g?.name ?? '').toLowerCase().includes(s);
    });
    const rank = (r: Row) => RARITY_ORDER.indexOf(r.rarity as never);
    const dist = (r: Row) => (here ? cellDistance(here, { gx: r.gx, gy: r.gy }) : 0);
    const cmp: Record<Sort, (a: Row, b: Row) => number> = {
      rarity: (a, b) => rank(b) - rank(a) || b.usd_per_second - a.usd_per_second,
      rent: (a, b) => b.usd_per_second - a.usd_per_second,
      level: (a, b) => b.level - a.level || rank(b) - rank(a),
      nearest: (a, b) => dist(a) - dist(b),
      newest: (a, b) => b.claimed_at.localeCompare(a.claimed_at),
      oldest: (a, b) => a.claimed_at.localeCompare(b.claimed_at),
      name: (a, b) => plotTitle(a).localeCompare(plotTitle(b)),
      type: (a, b) => a.plot_type.localeCompare(b.plot_type) || rank(b) - rank(a),
    };
    out = [...out].sort(cmp[sort]);
    return out;
  }, [rows, filter, q, sort, byGroup, here]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = rows.reduce((n, r) => n + r.usd_per_second, 0);
  const counts = RARITY_ORDER.map((r) => [r, rows.filter((x) => x.rarity === r).length] as const).filter(([, n]) => n > 0);
  const habitats = (groups.data ?? []).filter((g) => g.status === 'active' && g.kind === 'habitat').length;

  const [places, setPlaces] = useState(false);
  if (!me || plots.isLoading) return <Page><div className="grid min-h-[50vh] place-items-center"><Spinner /></div></Page>;
  return (
    <Page wide>
      <PageHeader eyebrow="Your land" title="My Plots">Every plot you own — sort, filter and tap one for everything about it.</PageHeader>
      <div className="mb-4"><CollectionCard onOpen={() => setAlbum(true)} /></div>
      <div className="mb-4"><RentCalculator /></div>
      <CollectionDialog open={album} onOpenChange={setAlbum} />
      <Link to="/home" className="glass mb-4 flex items-center gap-3 rounded-3xl p-3 hover:border-line-strong" data-testid="plots-home"><span className="text-3xl">🏠</span><span className="min-w-0 flex-1"><b className="block font-display">Your home</b><span className="text-xs text-muted">A door to each of your places — and the place visitors see. Decorate it your way.</span></span><span className="text-sm font-bold text-accent-2">Go →</span></Link>
      <Button variant="secondary" className="mb-4 w-full sm:w-auto" onClick={() => setPlaces(true)} data-testid="plots-places">🪐 All my plots, on Earth and every world — warp to any</Button>
      {places && <PlacesSheet open onOpenChange={setPlaces} />}
      {rows.length === 0 ? (
        <Empty icon={<MapPin className="h-6 w-6" />} title="No plots yet" action={<Button variant="rainbow" onClick={() => history.back()}>Claim your first plot</Button>}>Claim plots around your explorer on the map.</Empty>
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" data-testid="plots">
          {/* summary */}
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Plots" value={rows.length.toLocaleString()} />
            <Stat label="Rent a day" value={formatUsd(total * DAY, 6)} />
            <Stat label="Habitats" value={String(habitats)} />
            <div className="lv-card flex flex-wrap items-center gap-1 p-3">{counts.map(([r, n]) => <span key={r} className="flex items-center gap-1 text-xs font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: rarityInfo(r).color }} />{n}</span>)}</div>
          </div>
          {/* search, filter, sort */}
          <div className="lv-card grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 p-3">
            <label className="flex h-11 items-center gap-2 rounded-2xl bg-surface-2/70 px-3">
              <Search className="h-4 w-4 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a plot by name, type, rarity or number" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" data-testid="plots-search" />
              {q && <button onClick={() => setQ('')} aria-label="Clear"><X className="h-4 w-4 text-muted" /></button>}
            </label>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {FILTERS.map((f) => <Chip key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)} testid={`filter-${f.id}`}>{f.label}</Chip>)}
            </div>
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
              <ArrowDownUp className="h-4 w-4 shrink-0 text-muted" />
              {SORTS.map((s) => <Chip key={s.id} on={sort === s.id} onClick={() => { setSort(s.id); saveStorage('landvas.plots.sort', s.id); }} testid={`sort-${s.id}`}>{s.label}</Chip>)}
            </div>
          </div>
          <div className="text-xs font-bold text-muted">{list.length.toLocaleString()} plot{list.length === 1 ? '' : 's'}</div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2" data-testid="plots-list">
            {list.slice(0, limit).map((r) => {
              const g = r.group_id ? byGroup.get(r.group_id) : null;
              const kind = kindOf(r);
              const d = here ? cellDistance(here, { gx: r.gx, gy: r.gy }) : null;
              return (
                <motion.button key={`${r.gx}_${r.gy}`} whileTap={{ scale: 0.98 }} onClick={() => setOpen(r)} className="lv-card flex items-center gap-3 p-3 text-left" data-testid="plot-row">
                  <PlotTile r={r} kind={kind} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate font-bold">{plotTitle(r)}</span><RarityBadge r={r.rarity} small /></div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                      <span>{PLOT_TYPES[r.plot_type]?.name ?? r.plot_type}</span>
                      <span>Lv {r.level}</span>
                      <span>{isRealm(kind) ? `${REALM_META[kind].emoji} ${REALM_META[kind].name}` : kind === 'habitat' ? '🐾 Habitat' : kind === 'farm' ? '🌾 Farm' : kind === 'business' ? '🍋 Business' : kind === 'arcade' ? '🕹️ Arcade' : kind === 'train' ? '🚆 Train' : kind === 'plane' ? '✈️ Plane' : kind === 'home' ? '🏠 Home' : kind === 'landlord' ? '🏘️ Landlord' : r.has_art ? '🎨 Art' : '🎨 Blank'}</span>
                      {g && g.plot_count > 1 && <span>part of {g.plot_count}</span>}
                      {d !== null && <span>{d <= 1 ? 'right here' : `${d} plots away`}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-xs font-bold text-ok">{formatUsd(r.usd_per_second * DAY, 6)}</div>
                    <div className="text-[10px] text-faint">a day</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                </motion.button>
              );
            })}
          </div>
          {list.length > limit && <Button variant="secondary" onClick={() => setLimit((n) => n + 200)}>Show more</Button>}
        </div>
      )}
      <AnimatePresence>{open && <PlotSheet key={`${open.gx}_${open.gy}`} r={open} group={open.group_id ? byGroup.get(open.group_id) ?? null : null} onClose={() => setOpen(null)} />}</AnimatePresence>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="lv-card p-3"><div className="eyebrow !text-[10px]">{label}</div><div className="tnum font-display text-lg font-bold">{value}</div></div>;
}
function Chip({ on, onClick, children, testid }: { on: boolean; onClick(): void; children: React.ReactNode; testid?: string }) {
  return <button onClick={onClick} aria-pressed={on} data-testid={testid} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition', on ? 'bg-gradient-to-r from-accent to-accent-2 text-white shadow' : 'bg-surface-2/70 text-muted')}>{children}</button>;
}
function PlotTile({ r, kind, size = 48 }: { r: Row; kind: string; size?: number }) {
  const t = PLOT_TYPES[r.plot_type];
  const ri = rarityInfo(r.rarity);
  return (
    <span className="relative grid shrink-0 place-items-center rounded-2xl text-lg" style={{ width: size, height: size, background: kind === 'habitat' ? 'linear-gradient(135deg,#6CC463,#2F7D3A)' : `linear-gradient(135deg, ${t?.a ?? '#888'}, ${t?.b ?? '#444'})`, boxShadow: `0 0 0 2px ${ri.color}, 0 6px 16px -8px ${ri.color}` }}>
      {isRealm(kind) ? REALM_META[kind].emoji : kind === 'habitat' ? '🐾' : kind === 'farm' ? '🌾' : kind === 'business' ? '🍋' : kind === 'arcade' ? '🕹️' : kind === 'train' ? '🚆' : kind === 'plane' ? '✈️' : kind === 'home' ? '🏠' : kind === 'landlord' ? '🏘️' : kind === 'base' ? '🟩' : r.has_art ? '🖼️' : '🎨'}
    </span>
  );
}

// ---- everything about one plot ------------------------------------------------------------
function PlotSheet({ r, group, onClose }: { r: Row; group: CanvasGroup | null; onClose(): void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const world = useWorld();
  const me = useOnboardedMe();
  const d = useQuery({ queryKey: qk.plot(r.gx, r.gy), queryFn: () => api.plotDetails(r.gx, r.gy) });
  const [busy, setBusy] = useState<string | null>(null);
  const eco = world.data?.economy;
  const kind = group?.kind ?? 'base';
  const show = () => {
    const [lng, lat] = cellCenter(r.gx, r.gy);
    useUi.getState().requestFly({ lng, lat, zoom: Z_HOUSE + 0.6 });
    useUi.getState().select({ gx: r.gx, gy: r.gy });
    useExplorer.getState().setFollowing(false);
    nav('/world');
  };
  const t = PLOT_TYPES[r.plot_type];
  const ri = rarityInfo(r.rarity);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={plotTitle(r)} description={`${ri.name} ${t?.name ?? ''} plot · ${r.gx.toLocaleString()}, ${r.gy.toLocaleString()}`}>
      <div className="grid gap-3" data-testid="plot-sheet">
        <div className="flex items-center gap-3">
          <PlotTile r={r} kind={kind} size={64} />
          <div className="grid flex-1 grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-surface-2/70 p-2"><div className="text-[10px] font-bold uppercase text-muted">Rent / day</div><div className="tnum text-sm font-bold text-ok">{formatUsd(r.usd_per_second * DAY, 6)}</div></div>
            <div className="rounded-2xl bg-surface-2/70 p-2"><div className="text-[10px] font-bold uppercase text-muted">Land</div><div className="text-sm font-bold">{group?.plot_count ?? 1} plot{(group?.plot_count ?? 1) === 1 ? '' : 's'}</div></div>
            <div className="rounded-2xl bg-surface-2/70 p-2"><div className="text-[10px] font-bold uppercase text-muted">Minigame</div><div className="text-sm font-bold">{d.data?.type_info?.minigame_name ?? t?.game}</div></div>
            <div className="rounded-2xl bg-surface-2/70 p-2"><div className="text-[10px] font-bold uppercase text-muted">Ink bonus</div><div className="text-sm font-bold">×{ri.ink_reward_multiplier}</div></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
          <span className="rounded-full bg-surface-2/70 px-2.5 py-1">{isRealm(kind) ? `${REALM_META[kind].emoji} ${REALM_META[kind].name}` : kind === 'habitat' ? '🐾 Inkborn Habitat' : kind === 'farm' ? '🌾 Farm' : kind === 'business' ? '🍋 Business' : kind === 'arcade' ? '🕹️ Arcade' : kind === 'train' ? '🚆 Travel · Train' : kind === 'plane' ? '✈️ Travel · Plane' : kind === 'home' ? '🏠 Residential · Home' : kind === 'landlord' ? '🏘️ Residential · Landlord' : '🎨 Art Canvas'}</span>
          {group && <span className="rounded-full bg-surface-2/70 px-2.5 py-1">{group.plot_count > 1 ? `Part of “${group.name}” (${group.plot_count} plots)` : 'A single plot'}</span>}
          {d.data?.art && <span className="rounded-full bg-surface-2/70 px-2.5 py-1">🖼️ “{d.data.art.title}”</span>}
          <span className="rounded-full bg-surface-2/70 px-2.5 py-1">Claimed {timeAgo(r.claimed_at)}</span>
          <span className="rounded-full bg-surface-2/70 px-2.5 py-1">{t?.blurb}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="rainbow" onClick={show} data-testid="sheet-map"><MapPin className="h-4 w-4" /> Show on map</Button>
          {d.data?.type_info && <Button variant="secondary" onClick={() => nav(`/play/${d.data!.type_info!.minigame}?gx=${r.gx}&gy=${r.gy}`)}><Gamepad2 className="h-4 w-4" /> Play {d.data.type_info.minigame_name}</Button>}
          {isRealm(kind) && group?.realm_id ? <Button variant="secondary" onClick={() => nav(group.arcade_id ? `/arcade/${group.arcade_id}` : realmRoute(group.realm_id!))}>{REALM_META[kind].emoji} {REALM_META[kind].enter}</Button>
          : kind === 'home' ? <Button variant="secondary" onClick={() => nav('/home')}>🏠 Enter your home</Button>
          : kind === 'arcade' && group?.arcade_id ? <Button variant="secondary" onClick={() => nav(`/arcade/${group.arcade_id}`)}>🕹️ Enter arcade</Button>
          : kind === 'business' && group?.business_id ? <Button variant="secondary" onClick={() => nav(`/business/${group.business_id}`)}>🍋 Open business</Button>
          : kind === 'farm' && group?.farm_id ? <Button variant="secondary" onClick={() => nav(`/farm/${group.farm_id}`)}>🌾 Enter farm</Button>
            : kind === 'habitat' && group?.habitat_id ? <Button variant="secondary" onClick={() => nav(`/habitat/${group.habitat_id}`)}><PawPrint className="h-4 w-4" /> Enter sanctuary</Button>
            : group && kindFamily(kind) === 'canvas' ? <Button variant="secondary" onClick={() => nav(`/create/${group.id}`)}><Brush className="h-4 w-4" /> Paint canvas</Button> : null}
          {group && <Button variant="secondary" onClick={() => { startMerge(group.id); show(); }}><Combine className="h-4 w-4" /> Merge</Button>}
        </div>
      </div>
    </Dialog>
  );
}

