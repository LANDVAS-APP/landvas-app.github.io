import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Compass, Droplets, Layers, LocateFixed, MapPinned, Palette, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { useSession } from '../app/App';
import { ResourceBar } from '../app/Shell';
import { WorldMap } from '../map/WorldMap';
import { searchPlaces, type Place } from '../map/places';
import { PlotPanel } from '../plot/PlotPanel';
import { qk, useInvalidate, useOnboardedMe } from '../lib/queries';
import { useUi, type MapMode } from '../lib/store';
import { cn, fmt, safeStorage, saveStorage } from '../lib/utils';
import { Avatar, Button, LogoMark } from '../ui';
import { cellCenter } from '../shared/grid';
import { config } from '../env';

const MODES: { id: MapMode; label: string; icon: any; hint: string }[] = [
  { id: 'atlas', label: 'Atlas', icon: MapPinned, hint: 'Places, borders and every owned territory' },
  { id: 'canvas', label: 'Canvas', icon: Palette, hint: 'The art itself — the map steps back' },
  { id: 'discovery', label: 'Discover', icon: Compass, hint: 'Claimable plots, their types and neighbours' },
  { id: 'land', label: 'My Land', icon: Layers, hint: 'Your plots, canvases and upgrade options' },
];

export function MapScreen() {
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const selected = useUi((s) => s.selected);
  const session = useSession();
  const me = useOnboardedMe();
  const view = useUi((s) => s.view);
  return (
    <div className="absolute inset-0">
      <WorldMap />
      {/* top bar */}
      <div className="gutter pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <Link to="/" className="pointer-events-auto glass flex h-11 items-center gap-2 rounded-2xl px-3 md:hidden" aria-label="LANDVAS">
            <LogoMark size={26} />
          </Link>
          <PlaceSearch />
          <div className="pointer-events-auto ml-auto hidden md:block">
            {me ? <div className="glass rounded-2xl p-1.5"><ResourceBar /></div> : !session ? <SignInChip /> : null}
          </div>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="glass flex rounded-2xl p-1" role="radiogroup" aria-label="Map mode">
            {MODES.map((m) => (
              <button key={m.id} role="radio" aria-checked={mode === m.id} title={m.hint} onClick={() => setMode(m.id)}
                className={cn('flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12.5px] font-bold transition', mode === m.id ? 'bg-surface-2 text-fg shadow' : 'text-muted hover:text-fg')}>
                <m.icon className="h-4 w-4" />
                <span className={cn(mode === m.id ? 'inline' : 'hidden sm:inline')}>{m.label}</span>
              </button>
            ))}
          </div>
          {me && <CollectButton />}
          {!me && !session && <div className="md:hidden"><SignInChip /></div>}
          {me && <div className="md:hidden"><div className="glass rounded-2xl p-1"><ResourceBar compact /></div></div>}
        </div>
      </div>
      <ZoomHint zoom={view.zoom} />
      <Legend mode={mode} />
      <AnimatePresence>{selected && <PlotPanel key={`${selected.gx}_${selected.gy}`} cell={selected} />}</AnimatePresence>
      {me && !selected && <Checklist />}
    </div>
  );
}

function SignInChip() {
  return (
    <Link to="/welcome" className="glass flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold">
      <Sparkles className="h-4 w-4 text-gold" /> Sign in to claim a plot
    </Link>
  );
}

function ZoomHint({ zoom }: { zoom: number }) {
  if (zoom >= 11.5) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-10 flex justify-center md:bottom-6">
      <div className="glass rounded-full px-4 py-2 text-[12.5px] font-semibold text-muted">
        {zoom < 8 ? 'Zoom into a city to see its plots — or search a place above' : 'Keep zooming — tap the map to dive in'}
      </div>
    </div>
  );
}

function Legend({ mode }: { mode: MapMode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute bottom-[calc(96px+env(safe-area-inset-bottom,0px))] right-[max(16px,env(safe-area-inset-right,0px))] z-10 md:bottom-6">
      <button className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Legend <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="glass absolute bottom-12 right-0 w-64 rounded-2xl p-4 text-xs">
          <p className="mb-3 text-muted">{MODES.find((m) => m.id === mode)?.hint}</p>
          {(['graphite', 'pigment', 'mosaic', 'lumina'] as const).map((t) => (
            <div key={t} className="mb-2 flex items-center gap-2"><TypeDot t={t} /><span className="font-bold capitalize">{t}</span></div>
          ))}
          <div className="mt-3 flex items-center gap-2"><span className="h-3 w-6 rounded-sm border-2 border-[#C9F6FF] shadow-[0_0_8px_#22E3FF]" /> Your canvases</div>
          <div className="mt-2 flex items-center gap-2"><span className="h-3 w-6 rounded-sm border-2 border-[#FFE14D]" /> Selected plot</div>
        </div>
      )}
    </div>
  );
}

export function TypeDot({ t, size = 14 }: { t: 'graphite' | 'pigment' | 'mosaic' | 'lumina'; size?: number }) {
  const c = { graphite: ['#B9C3D8', '#5C6680'], pigment: ['#FF5470', '#FFB23F'], mosaic: ['#22C7B5', '#FFD43B'], lumina: ['#8B5CFF', '#22E3FF'] }[t];
  return <span className="inline-block shrink-0 rounded-[4px]" style={{ width: size, height: size, background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }} />;
}

function CollectButton() {
  const me = useOnboardedMe();
  const inv = useInvalidate();
  const [busy, setBusy] = useState(false);
  if (!me || me.plot_count === 0) return null;
  const pending = Number(me.pending.ink);
  return (
    <button disabled={busy || pending < 1} onClick={async () => {
      setBusy(true);
      try {
        const r = await api.collect();
        toast.success(`Collected ${fmt(r.ink)} Ink${r.pigments ? ` and ${fmt(r.pigments)} Pigments` : ''} from ${r.plots} plot${r.plots === 1 ? '' : 's'}`);
        inv();
      } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
    }} className="glass flex h-10 items-center gap-2 rounded-2xl px-3 text-[12.5px] font-bold disabled:opacity-60" title="Collect what your plots produced (accrues up to the offline cap)">
      <Droplets className="h-4 w-4 text-[#34C3FF]" /> {pending >= 1 ? `Collect ${fmt(pending)}` : 'Producing…'}
    </button>
  );
}

function PlaceSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const requestFly = useUi((s) => s.requestFly);
  const select = useUi((s) => s.select);
  const me = useOnboardedMe();
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchPlaces(q);
      if (live) setResults(r);
    }, 120);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const coords = useMemo(() => {
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < 65536 && b < 65536 && (a > 180 || b > 90)) return { plot: { gx: a, gy: b } };
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
    return null;
  }, [q]);
  const go = (lng: number, lat: number, zoom: number) => {
    requestFly({ lng, lat, zoom });
    setOpen(false);
    setQ('');
  };
  const myLand = groups.data?.[0];
  return (
    <div className="pointer-events-auto relative min-w-0 flex-1 md:max-w-md">
      <div className="glass flex h-11 items-center gap-2 rounded-2xl px-3">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)}
          placeholder="Search a city, country or plot" className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-fg placeholder:text-faint focus:outline-none" aria-label="Search places" id="place-search" />
        {q && <button onClick={() => setQ('')} aria-label="Clear search"><X className="h-4 w-4 text-muted" /></button>}
      </div>
      {open && (results.length > 0 || coords || (!q && (myLand || !config.isArtifact))) && (
        <div className="glass absolute left-0 right-0 top-12 z-30 max-h-[60vh] overflow-y-auto rounded-2xl p-1.5 scroll-thin">
          {!q && myLand && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" onMouseDown={() => {
              const [lng, lat] = cellCenter(myLand.cells[0][0], myLand.cells[0][1]);
              go(lng, lat, 15.2);
              select({ gx: myLand.cells[0][0], gy: myLand.cells[0][1] });
            }}>
              <Layers className="h-4 w-4 text-accent-2" /><span className="text-sm font-semibold">Go to my land</span>
            </button>
          )}
          {!q && !config.isArtifact && 'geolocation' in navigator && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" onMouseDown={() => {
              navigator.geolocation.getCurrentPosition((p) => go(p.coords.longitude, p.coords.latitude, 14.5), () => toast.error('Location unavailable — search for a place instead.'), { timeout: 8000 });
            }}>
              <LocateFixed className="h-4 w-4 text-muted" />
              <span className="text-sm">Near me <span className="text-faint">(optional, never stored)</span></span>
            </button>
          )}
          {coords && 'plot' in coords && coords.plot && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" onMouseDown={() => {
              const [lng, lat] = cellCenter(coords.plot!.gx, coords.plot!.gy);
              go(lng, lat, 15.5);
              select(coords.plot!);
            }}>
              <MapPinned className="h-4 w-4 text-gold" /><span className="text-sm">Plot {coords.plot.gx} · {coords.plot.gy}</span>
            </button>
          )}
          {coords && 'lat' in coords && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" onMouseDown={() => go(coords.lng!, coords.lat!, 14)}>
              <MapPinned className="h-4 w-4 text-gold" /><span className="text-sm">{coords.lat}, {coords.lng}</span>
            </button>
          )}
          {results.map((r) => (
            <button key={r.kind + r.name + r.lng} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" onMouseDown={() => go(r.lng, r.lat, r.zoom)}>
              <span className="min-w-0 truncate text-sm font-semibold">{r.name}</span>
              <span className="shrink-0 text-xs text-faint">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- "Getting started" quest list: the mandatory launch loop, made visible ----

function Checklist() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const pubs = useQuery({ queryKey: qk.pubs, queryFn: api.myPublications, enabled: !!me });
  const records = useQuery({ queryKey: qk.records, queryFn: api.myMinigameRecords, enabled: !!me });
  const [hidden, setHidden] = useState(() => safeStorage('landvas.checklist.hidden', false));
  const [collapsed, setCollapsed] = useState(false);
  const guide = useRef(safeStorage<string | null>('landvas.guide', null));
  const requestFly = useUi((s) => s.requestFly);
  useEffect(() => {
    if (guide.current === 'starter' && me && !me.player.starter_plot_claimed) {
      toast('Pick your free starter plot', { description: 'Search for a city you love, zoom in until you see the grid, then tap a glowing square.' });
      saveStorage('landvas.guide', null);
      guide.current = null;
      if (useUi.getState().view.zoom < 3) requestFly({ lng: -40, lat: 30, zoom: 2.2 });
    }
  }, [me, requestFly]);
  if (!me || hidden) return null;
  const g = groups.data ?? [];
  const p = pubs.data ?? [];
  const steps = [
    { label: 'Claim your free starter plot', done: me.player.starter_plot_claimed },
    { label: 'Paint it or place an image', done: g.some((x) => (x.project?.tile_count ?? 0) > 0) },
    { label: 'Publish it to the world map', done: p.some((x) => ['published', 'pending_review', 'approved', 'processing', 'superseded'].includes(x.status)) },
    { label: 'Claim a neighbouring plot', done: me.plot_count >= 2 },
    { label: 'Connect them into one canvas', done: g.some((x) => x.plot_count >= 2) },
    { label: 'Publish a mural across both', done: p.some((x) => x.plot_count >= 2 && ['published', 'superseded'].includes(x.status)) },
    { label: 'Play your plot’s minigame', done: Object.values(records.data?.records ?? {}).some((r: any) => r.plays > 0) },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const nextIdx = steps.findIndex((s) => !s.done);
  void qc;
  return (
    <div className="absolute bottom-[calc(96px+env(safe-area-inset-bottom,0px))] left-[max(16px,env(safe-area-inset-left,0px))] z-10 w-[min(320px,calc(100vw-120px))] md:bottom-6">
      <div className="glass rounded-2xl p-3">
        <div className="flex items-center justify-between gap-2">
          <button className="flex items-center gap-2 text-left" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
            <span className="eyebrow">Getting started</span>
            <span className="text-xs font-bold tnum text-accent-2">{doneCount}/{steps.length}</span>
          </button>
          <button aria-label="Hide checklist" onClick={() => { setHidden(true); saveStorage('landvas.checklist.hidden', true); }}><X className="h-4 w-4 text-faint" /></button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full shimmer" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
        {!collapsed && (
          <ol className="mt-3 grid gap-1.5">
            {steps.map((s, i) => (
              <li key={s.label} className={cn('flex items-center gap-2 text-[13px]', s.done ? 'text-faint line-through' : i === nextIdx ? 'font-bold text-fg' : 'text-muted')}>
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', s.done ? 'border-ok bg-ok text-bg' : i === nextIdx ? 'border-accent-2' : 'border-line-strong')}>
                  {s.done && <Check className="h-3 w-3" />}
                </span>
                {s.label}
              </li>
            ))}
          </ol>
        )}
        {!collapsed && nextIdx >= 1 && nextIdx !== 3 && (
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => nav(nextIdx === 6 ? '/play' : '/canvases')}>
            {nextIdx === 6 ? 'Open the minigames' : 'Open my canvases'}
          </Button>
        )}
      </div>
    </div>
  );
}

export function MeChip() {
  const me = useOnboardedMe();
  if (!me) return null;
  return <Avatar seed={me.profile.avatar_seed} style={me.profile.avatar_style} accent={me.profile.accent_color} size={32} />;
}

export { getBackend };
