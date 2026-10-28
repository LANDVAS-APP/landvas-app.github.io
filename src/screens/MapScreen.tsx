import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Box, Check, ChevronDown, Compass, Crosshair, Gamepad, Layers, LocateFixed, MapPinned, Palette, Satellite, Search, Sparkles, X } from 'lucide-react';
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
import { Button, Dialog, LogoMark, PlayerAvatar } from '../ui';
import { GRID_SIZE, Z_HOUSE, Z_PLOT, Z_STREET, Z_TOWN, cellCenter, type PlotTypeId } from '../shared/grid';
import { PLOT_TYPES } from '../map/plotStyle';
import { config } from '../env';
import { BoostButton, RentHud, useRaritySync } from '../rent/RentHud';
import { NotificationBell } from '../updates/Notifications';
import { enableGps, explorerNow, gpsSupported, startGps, stopGps, useExplorer } from '../explorer/explorer';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { RarityBadge } from '../plot/RarityBadge';
import { Joystick, fmtTank } from '../explorer/Joystick';
import { ClaimCelebration, useCelebration } from '../plot/ClaimCelebration';

const MODES: { id: MapMode; label: string; icon: any; hint: string }[] = [
  { id: 'atlas', label: 'Atlas', icon: MapPinned, hint: 'Places, borders and every owned territory' },
  { id: 'canvas', label: 'Canvas', icon: Palette, hint: 'The art itself — the map steps back' },
  { id: 'discovery', label: 'Discover', icon: Compass, hint: 'Claimable mystery plots and who owns the land around you' },
  { id: 'land', label: 'My Land', icon: Layers, hint: 'Your plots, canvases and upgrade options' },
];

export function MapScreen() {
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const selected = useUi((s) => s.selected);
  const session = useSession();
  const me = useOnboardedMe();
  const view = useUi((s) => s.view);
  useRaritySync();
  useExplorerSync();
  const [joystick, setJoystick] = useState(false);
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
          <NotificationBell className="pointer-events-auto shrink-0 md:hidden" />
          <div className="pointer-events-auto ml-auto hidden items-center gap-2 md:flex">
            {me ? <><RentHud /><BoostButton /><div className="glass rounded-2xl p-1.5"><ResourceBar /></div></> : !session ? <SignInChip /> : null}
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
          {me && <div className="flex min-w-0 items-center gap-2 md:hidden"><RentHud /><BoostButton compact /></div>}
          {!me && !session && <div className="md:hidden"><SignInChip /></div>}
          {me && <div className="md:hidden"><div className="glass rounded-2xl p-1"><ResourceBar compact /></div></div>}
        </div>
      </div>
      <ZoomHint zoom={view.zoom} />
      {me && <ExplorerControls joystick={joystick} onJoystick={() => setJoystick((j) => !j)} />}
      <AnimatePresence>
        {me && joystick && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-20 flex justify-center px-4 md:bottom-6">
            <Joystick onClose={() => setJoystick(false)} />
          </div>
        )}
      </AnimatePresence>
      <Legend mode={mode} />
      <AnimatePresence>{selected && <PlotPanel key={`${selected.gx}_${selected.gy}`} cell={selected} />}</AnimatePresence>
      {me && !selected && !joystick && <Checklist />}
      {me && <PlacementPrompt />}
      <ClaimCelebration />
    </div>
  );
}

/** Mirror the server's explorer state; resume GPS for players who turned it on. */
function useExplorerSync() {
  const me = useOnboardedMe();
  const set = useExplorer((s) => s.set);
  useEffect(() => {
    if (me) set(me.explorer);
  }, [me?.explorer, set]); // eslint-disable-line react-hooks/exhaustive-deps
  const wantGps = !!me && safeStorage('landvas.gps', false);
  useEffect(() => {
    if (wantGps) startGps();
  }, [wantGps]);
}

function ExplorerControls({ joystick, onJoystick }: { joystick: boolean; onJoystick(): void }) {
  const ex = useExplorer();
  const requestFly = useUi((s) => s.requestFly);
  const tilt = useUi((s) => s.settings.tilt3d);
  const updateSettings = useUi((s) => s.updateSettings);
  const joy = ex.state?.joystick;
  const has = !!ex.state;
  const gpsLabel = { off: 'Use GPS', asking: 'Finding you…', on: 'GPS on', denied: 'Location blocked', unavailable: 'No GPS here' }[ex.gps];
  return (
    <div className="absolute bottom-[calc(150px+env(safe-area-inset-bottom,0px))] right-[max(16px,env(safe-area-inset-right,0px))] z-10 flex flex-col items-end gap-2 md:bottom-20">
      <button
        className={cn('glass flex h-11 items-center gap-2 rounded-2xl px-3 text-xs font-bold', ex.gps === 'on' ? 'text-ok' : ex.gps === 'denied' || ex.gps === 'unavailable' ? 'text-faint' : 'text-fg')}
        onClick={() => {
          if (ex.gps === 'on' || ex.gps === 'asking') { stopGps(); saveStorage('landvas.gps', false); toast('GPS off', { description: 'Your explorer waits at your last real location. Turn GPS back on to move it.' }); return; }
          enableGps((lng, lat) => requestFly({ lng, lat, zoom: Z_STREET + 0.5 }));
        }}
        title={ex.gps === 'denied' ? 'Location permission was denied. Enable it in your browser settings to move your explorer.' : 'Your explorer follows your real location'}
        data-testid="gps-toggle"
      >
        <Satellite className="h-4 w-4" /> <span className="hidden sm:inline">{gpsLabel}</span>
      </button>
      <button className={cn('glass flex h-11 items-center gap-1.5 rounded-2xl px-3 text-xs font-bold', tilt && 'text-accent-2 ring-2 ring-accent-2/60')}
        onClick={() => updateSettings({ tilt3d: !tilt })} aria-pressed={tilt} title="Tilt the map to see buildings in 3D" data-testid="tilt-3d">
        <Box className="h-4 w-4" /> {tilt ? '3D' : '2D'}
      </button>
      {has && joy?.enabled !== false && (
        <button className={cn('glass flex h-11 items-center gap-1.5 rounded-2xl px-3 text-xs font-bold', joystick && 'text-accent-2 ring-2 ring-accent-2/60')}
          onClick={onJoystick} aria-pressed={joystick} title="Steer your explorer with the joystick" data-testid="joystick-toggle">
          <Gamepad className="h-4 w-4" /> <span className="tnum">{joy ? fmtTank(Number(joy.seconds_left)) : 'Joystick'}</span>
        </button>
      )}
      {has && (
        <button
          className={cn('glass flex h-11 w-11 items-center justify-center rounded-2xl', ex.following && 'text-accent-2 ring-2 ring-accent-2/60')}
          aria-label="Center on my explorer"
          onClick={() => {
            const p = explorerNow(ex.state, ex.offset);
            if (p) requestFly({ lng: p.lng, lat: p.lat, zoom: Math.max(useUi.getState().view.zoom, Z_STREET + 0.5) });
            ex.setFollowing(!ex.following || true);
          }}
          data-testid="locate-me"
        >
          <Crosshair className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

/** First visit: the explorer starts where the player really is — GPS only. */
function PlacementPrompt() {
  const me = useOnboardedMe();
  const ex = useExplorer();
  const requestFly = useUi((s) => s.requestFly);
  const [dismissed, setDismissed] = useState(false);
  const open = !!me && !me.explorer && !ex.state && ex.gps !== 'on' && ex.gps !== 'asking' && !dismissed;
  const blocked = ex.gps === 'denied' || ex.gps === 'unavailable' || !gpsSupported();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && setDismissed(true)} title="Drop into the world"
      description="Your explorer is you on the map, standing where you really are. You can claim the plots right around it.">
      <div className="grid gap-3">
        <Button variant="rainbow" size="lg" disabled={!gpsSupported()} onClick={() => {
          enableGps((lng, lat) => requestFly({ lng, lat, zoom: Z_STREET + 0.5 }));
          setDismissed(true);
        }} data-testid="place-gps"><Satellite className="h-4 w-4" /> Use my location</Button>
        {blocked && (
          <p className="rounded-xl bg-bad/10 p-3 text-xs text-fg">
            {ex.gps === 'denied'
              ? 'Location is blocked for LANDVAS. Allow it in your browser’s site settings (on iPhone: Settings → Safari → Location), then tap “Use my location”.'
              : 'This browser can’t share your location. Open LANDVAS in your phone’s browser to place your explorer.'}
          </p>
        )}
        <p className="text-xs text-muted">LANDVAS needs GPS — explorers can’t be placed by hand or teleported. Your location is never shown to other players.</p>
      </div>
    </Dialog>
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
  if (zoom >= Z_STREET - 1) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-10 flex justify-center md:bottom-6">
      <div className="glass rounded-full px-4 py-2 text-[12.5px] font-semibold text-muted">
        {zoom < Z_TOWN - 1 ? 'Zoom into a city to see its plots — or search a place above' : 'Keep zooming in to your street — tap the map to dive in'}
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
        <div className="glass absolute bottom-12 right-0 w-72 rounded-2xl p-4 text-xs">
          <p className="mb-3 text-muted">{MODES.find((m) => m.id === mode)?.hint}</p>
          <div className="eyebrow mb-2">Rarity · rent per plot (owned plots)</div>
          {RARITY_ORDER.map((r) => (
            <div key={r} className="mb-1.5 flex items-center justify-between gap-2"><RarityBadge r={r} small /><span className="tnum text-muted">{formatRate(rarityInfo(r).usd_per_second)}</span></div>
          ))}
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-dashed border-line-strong p-2 text-muted"><span className="font-display text-base font-bold text-fg">?</span> Unclaimed plots are a mystery — type, minigame and rarity are revealed when claimed.</div>
          <div className="eyebrow mb-2 mt-3">Minigame by plot type (owned plots)</div>
          {(['graphite', 'pigment', 'mosaic', 'lumina', 'fresco', 'clay', 'prism', 'glass'] as const).map((t) => (
            <div key={t} className="mb-1.5 flex items-center gap-2"><TypeDot t={t} /><span className="font-bold capitalize">{t}</span><span className="text-faint">{PLOT_TYPES[t].game}</span></div>
          ))}
          <div className="mt-3 flex items-center gap-2"><span className="h-3 w-6 rounded-sm border-2 border-white" /> Your plots · others show their owner's colour</div>
          <div className="mt-2 flex items-center gap-2"><span className="h-3 w-6 rounded-sm border border-dashed border-white" /> Claimable around your explorer</div>
        </div>
      )}
    </div>
  );
}

export function TypeDot({ t, size = 14 }: { t: PlotTypeId; size?: number }) {
  const c = [PLOT_TYPES[t].a, PLOT_TYPES[t].b];
  return <span className="inline-block shrink-0 rounded-[4px]" style={{ width: size, height: size, background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }} />;
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
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < GRID_SIZE && b < GRID_SIZE && (a > 180 || b > 90)) return { plot: { gx: a, gy: b } };
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
              go(lng, lat, Z_HOUSE);
              select({ gx: myLand.cells[0][0], gy: myLand.cells[0][1] });
            }}>
              <Layers className="h-4 w-4 text-accent-2" /><span className="text-sm font-semibold">Go to my land</span>
            </button>
          )}
          {!q && !config.isArtifact && 'geolocation' in navigator && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" onMouseDown={() => {
              navigator.geolocation.getCurrentPosition((p) => go(p.coords.longitude, p.coords.latitude, Z_STREET), () => toast.error('Location unavailable — search for a place instead.'), { timeout: 8000 });
            }}>
              <LocateFixed className="h-4 w-4 text-muted" />
              <span className="text-sm">Near me <span className="text-faint">(optional, never stored)</span></span>
            </button>
          )}
          {coords && 'plot' in coords && coords.plot && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" onMouseDown={() => {
              const [lng, lat] = cellCenter(coords.plot!.gx, coords.plot!.gy);
              go(lng, lat, Z_PLOT);
              select(coords.plot!);
            }}>
              <MapPinned className="h-4 w-4 text-gold" /><span className="text-sm">Plot {coords.plot.gx} · {coords.plot.gy}</span>
            </button>
          )}
          {coords && 'lat' in coords && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" onMouseDown={() => go(coords.lng!, coords.lat!, Z_STREET)}>
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
    if (guide.current === 'starter' && me && !me.player.starter_plot_claimed && me.explorer) {
      toast('Pick your free starter plot', { description: 'Tap any plot inside the dashed square around your explorer.' });
      saveStorage('landvas.guide', null);
      guide.current = null;
      if (useUi.getState().view.zoom < 3) requestFly({ lng: -40, lat: 30, zoom: 2.2 });
    }
  }, [me, requestFly]);
  if (!me || hidden) return null;
  const g = groups.data ?? [];
  const p = pubs.data ?? [];
  const steps = [
    { label: 'Place your explorer', done: !!me.explorer },
    { label: 'Claim your free starter plot', done: me.player.starter_plot_claimed },
    { label: 'Win its minigame to earn Ink', done: Object.values(records.data?.records ?? {}).some((r: any) => r.wins > 0) },
    { label: 'Buy a second plot with Ink', done: me.plot_count >= 2 },
    { label: 'Hit the 20× rent boost', done: (me.rent?.boost?.used_today ?? 0) > 0 || !!me.rent?.boost?.active },
    { label: 'Paint & publish your plot', done: p.some((x) => ['published', 'pending_review', 'approved', 'processing', 'superseded'].includes(x.status)) },
    { label: 'Connect plots into a mural', done: g.some((x) => x.plot_count >= 2) },
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
        {!collapsed && nextIdx === 0 && (
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => enableGps((lng, lat) => useUi.getState().requestFly({ lng, lat, zoom: Z_STREET + 0.5 }))}>Use my location</Button>
        )}
        {!collapsed && nextIdx === 2 && (
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => nav('/play')}>Play my minigame</Button>
        )}
        {!collapsed && nextIdx >= 5 && (
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => nav('/canvases')}>Open my canvases</Button>
        )}
      </div>
    </div>
  );
}

export function MeChip() {
  const me = useOnboardedMe();
  if (!me) return null;
  return <PlayerAvatar p={me.profile} size={32} />;
}

export { getBackend };
