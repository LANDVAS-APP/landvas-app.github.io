import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Box, Check, Combine, Crosshair, Gamepad, LayoutGrid, Rocket, Satellite, Sparkles, X } from 'lucide-react';
import { CurrencyPills, DayNight, ModeButton, PlayerBadge, takeReturn } from '../map/Hud';
import { fmtLeft, placeName, useFlight, useSpace } from '../space/useSpace';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { worldOf } from '../space/worlds';
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
import { MergeBar, startMerge, touchingGroups } from '../plot/MergeBar';
import { enableGps, explorerNow, gpsSupported, startGps, stopGps, useExplorer } from '../explorer/explorer';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { RarityBadge } from '../plot/RarityBadge';
import { Joystick, VEH_EMOJI, fmtTank, recentlyDriven, useDriveKeys, useLandscapePhone } from '../explorer/Joystick';
import { ClaimCelebration, useCelebration } from '../plot/ClaimCelebration';
import { TravelBar, TravelButton, TravelOverlays, useTravel } from '../travel/Travel';
import { FindsLayer } from '../explore/Finds';


/** The World tab: Earth — or, while your rocket is parked on another world, that world in 3D. */
export function MapScreen() {
  const space = useSpace();
  const flight = useFlight(space.data);
  const s = space.data;
  const w = s && !flight.flying && !s.dest ? worldOf(s.location, s.home_seed, s.home_name) : null;
  const [peekEarth, setPeekEarth] = useState(false);
  useEffect(() => { if (!w) setPeekEarth(false); }, [w?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (s && w && !peekEarth) return <Suspense fallback={<div className="absolute inset-0 bg-[#05060F]" />}><PlanetView key={s.location} s={s} w={w} embedded onPeekEarth={() => setPeekEarth(true)} /></Suspense>;
  return <EarthMap away={w ? { name: w.name, back: () => setPeekEarth(false) } : null} />;
}
const PlanetView = lazy(() => import('../space/Surface').then((m) => ({ default: m.PlanetView })));

/** Earth. `away`: you're off on another world — your explorer isn't here (and GPS rests) while you look around. */
function EarthMap({ away }: { away: { name: string; back(): void } | null }) {
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const selected = useUi((s) => s.selected);
  const session = useSession();
  const me = useOnboardedMe();
  const view = useUi((s) => s.view);
  useRaritySync();
  useExplorerSync(!!away);
  const [joystick, setJoystick] = useState(false);
  const exState = useExplorer((s) => s.state);
  const canDrive = !!me && !!exState && exState.joystick?.enabled !== false && !away;
  // WASD / arrow keys walk the explorer (and open the joystick if it's closed)
  useDriveKeys(canDrive, () => { if (!useUi.getState().merge) setJoystick(true); });
  // turning a phone sideways brings up the D-pad
  const landscape = useLandscapePhone();
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!landscape) { autoOpened.current = false; return; }
    if (canDrive && !autoOpened.current) { autoOpened.current = true; setJoystick(true); }
  }, [landscape, canDrive]);
  const merging = useUi((s) => s.merge !== null);
  const celebrating = useCelebration((s) => s.hidden !== null);
  const travel = useTravel();
  const travelling = !!me && !!travel.data?.away;
  useEffect(() => () => useUi.getState().setMerge(null), []); // leaving the map ends merge mode
  return (
    <div className={cn('absolute inset-0', away && 'lv-away')}>
      <WorldMap />
      <DayNight />
      {/* the game HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))] pt-[max(10px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          {me ? <PlayerBadge /> : !session ? <div className="pointer-events-auto"><SignInChip /></div> : null}
          <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
            {me && <CurrencyPills />}
            <NotificationBell className="lv-gbtn !h-[38px] !w-[38px] !rounded-full !p-0" />
          </div>
        </div>
        {me && <div className="pointer-events-auto flex min-w-0 items-center gap-2"><RentHud /><BoostButton compact /></div>}
        <div className="flex flex-col items-start gap-2">
          <ModeButton />
          {me && (
            <Link to="/plots" className="pointer-events-auto lv-gbtn round" aria-label="My plots" data-testid="hud-plots">
              <LayoutGrid className="h-5 w-5" /><span className="lbl">Plots</span>
            </Link>
          )}
        </div>
      </div>
      {!travelling && <ZoomHint zoom={view.zoom} />}
      {me && !away && <ExplorerControls joystick={joystick} onJoystick={() => setJoystick((j) => !j)} />}
      {away && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-20 flex justify-center px-4 md:bottom-8">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-[#0B0E24]/90 px-4 py-2.5 text-white shadow-xl backdrop-blur" data-testid="away-banner">
            <span className="text-2xl">🚀</span>
            <div className="leading-tight"><div className="text-sm font-bold">You’re on {away.name}</div><div className="text-[11px] text-white/65">Your explorer is up there with you — just looking at Earth.</div></div>
            <Button size="sm" variant="rainbow" onClick={away.back} data-testid="back-to-planet">Back</Button>
          </div>
        </div>
      )}
      <AnimatePresence>
        {me && joystick && (
          <div className={cn('pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4',
            landscape ? 'bottom-[calc(64px+env(safe-area-inset-bottom,0px))] pl-[max(16px,env(safe-area-inset-left,0px))] md:bottom-[max(12px,env(safe-area-inset-bottom,0px))]' : 'bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-6')}>
            <Joystick onClose={() => setJoystick(false)} />
          </div>
        )}
      </AnimatePresence>
      {/* the panel would give the rarity away while the claim roll is still spinning */}
      <div className={celebrating ? 'invisible' : undefined} aria-hidden={celebrating || undefined}>
        <AnimatePresence>{selected && <PlotPanel key={`${selected.gx}_${selected.gy}`} cell={selected} />}</AnimatePresence>
      </div>
      {me && !away && travelling && !selected && !joystick && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-20 flex justify-start pl-[max(12px,env(safe-area-inset-left,0px))] pr-[84px] md:bottom-8 md:justify-center"><TravelBar /></div>
      )}
      {me && !away && <TravelOverlays />}
      {me && !away && <FindsLayer />}
      {me && !selected && !joystick && !merging && !away && !travelling && <Checklist />}
      {me && <MergeBar />}
      {me && !away && <PlacementPrompt />}
      <ClaimCelebration />
    </div>
  );
}

/** Mirror the server's explorer state; resume GPS for players who turned it on. */
function useExplorerSync(away = false) {
  const me = useOnboardedMe();
  const set = useExplorer((s) => s.set);
  useEffect(() => {
    // while you steer, the joystick's own (server-checked) steps are newer than this snapshot
    if (me && !recentlyDriven()) set(me.explorer);
  }, [me?.explorer, set]);
  // opening the map: go to your explorer and follow it (it used to stay wherever the map last was)
  const centred = useRef(false);
  const hasExplorer = !!me?.explorer;
  useEffect(() => {
    if (!hasExplorer || centred.current || away) return;
    centred.current = true;
    const ui = useUi.getState();
    // back from a plot you dove into: zoom back out over it
    const back = takeReturn();
    if (back) {
      // start close over the plot, then pull back out to where you were
      ui.setView({ lng: back.lng, lat: back.lat, zoom: Math.min(22.4, back.zoom + 2.2) }, ui.bbox);
      setTimeout(() => useUi.getState().requestFly({ lng: back.lng, lat: back.lat, zoom: back.zoom }), 700);
      return;
    }
    if (ui.flyTo && Date.now() - ui.flyTo.at < 15000) return; // something else asked to show a place
    const st = useExplorer.getState();
    const p = explorerNow(st.state, st.offset);
    if (!p) return;
    ui.requestFly({ lng: p.lng, lat: p.lat, zoom: Math.max(ui.view.zoom, Z_STREET + 0.5) });
    st.setFollowing(true);
  }, [hasExplorer]); // eslint-disable-line react-hooks/exhaustive-deps
  const wantGps = !!me && safeStorage('landvas.gps', false);
  useEffect(() => {
    if (away) { stopGps(); return; }
    if (wantGps) startGps();
  }, [wantGps, away]);
}

function ExplorerControls({ joystick, onJoystick }: { joystick: boolean; onJoystick(): void }) {
  const ex = useExplorer();
  const requestFly = useUi((s) => s.requestFly);
  const tilt = useUi((s) => s.settings.tilt3d);
  const updateSettings = useUi((s) => s.updateSettings);
  const joy = ex.state?.joystick;
  const has = !!ex.state;
  const space = useSpace();
  const flight = useFlight(space.data);
  // one tap into merge mode whenever some of your plots touch each other
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: has });
  const merging = useUi((s) => s.merge !== null);
  const canMerge = useMemo(() => {
    const act = (groups.data ?? []).filter((g) => g.status === 'active');
    return act.some((g) => touchingGroups(act, [g.id]).length > 1);
  }, [groups.data]);
  const nav = useNavigate();
  const gpsLabel = { off: 'Use GPS', asking: 'Finding you…', on: 'GPS on', paused: 'GPS paused', denied: 'Location blocked', unavailable: 'No GPS here' }[ex.gps];
  const spaceLabel = !space.data?.built ? 'Space' : flight.flying ? fmtLeft(flight.left) : space.data.location !== 'earth' ? placeName(space.data, space.data.location).replace('The ', '') : 'Space';
  return (
    <div className="absolute bottom-[calc(96px+env(safe-area-inset-bottom,0px))] right-[max(12px,env(safe-area-inset-right,0px))] z-10 flex flex-col items-center gap-2.5 md:bottom-8" data-testid="hud-rail">
      {canMerge && !merging && (
        <button className="lv-gbtn round" onClick={() => startMerge(null)} title="Merge touching plots into one bigger canvas or sanctuary" data-testid="map-merge">
          <Combine className="h-5 w-5" /><span className="lbl">Merge</span>
        </button>
      )}
      {has && <TravelButton />}
      {/* space: your rocket, and the trip under way */}
      <button className={cn('lv-gbtn round', flight.flying && 'hot')}
        onClick={() => nav(space.data && space.data.location !== 'earth' && !flight.flying ? '/space/surface' : '/space')} title="Your rocket — fly to the Moon, the planets and beyond" data-testid="space-button">
        <Rocket className={cn('h-5 w-5', flight.flying && 'animate-[lv-bob_1.2s_ease-in-out_infinite]')} /><span className="lbl tnum max-w-[48px] truncate">{spaceLabel}</span>
      </button>
      <button
        className={cn('lv-gbtn round', (ex.gps === 'on' || ex.gps === 'paused') && 'go')}
        onClick={() => {
          if (ex.gps === 'on' || ex.gps === 'asking' || ex.gps === 'paused') { stopGps(); saveStorage('landvas.gps', false); toast('GPS off', { description: 'Your explorer waits at your last real location. Turn GPS back on to move it.' }); return; }
          enableGps((lng, lat) => requestFly({ lng, lat, zoom: Z_STREET + 0.5 }));
        }}
        title={ex.gps === 'denied' ? 'Location permission was denied. Enable it in your browser settings to move your explorer.' : 'Your explorer follows your real location'}
        aria-label={gpsLabel}
        data-testid="gps-toggle"
      >
        <Satellite className="h-5 w-5" /><span className="lbl">{{ off: 'GPS', asking: '…', on: 'GPS', paused: 'Paused', denied: 'Blocked', unavailable: 'No GPS' }[ex.gps]}</span>
      </button>
      <button className={cn('lv-gbtn round', tilt && 'on')} onClick={() => updateSettings({ tilt3d: !tilt })} aria-pressed={tilt} title="Tilt the map to see buildings in 3D" data-testid="tilt-3d">
        <Box className="h-5 w-5" /><span className="lbl">{tilt ? '3D' : '2D'}</span>
      </button>
      {has && joy?.enabled !== false && (
        <button className={cn('lv-gbtn round', joystick && 'on')} onClick={onJoystick} aria-pressed={joystick} title="Steer your explorer with the joystick" data-testid="joystick-toggle">
          <Gamepad className="h-5 w-5" /><span className="lbl tnum">{ex.state?.vehicle?.fuel && joy ? `⛽${fmtTank(Number(joy.seconds_left))}` : `${VEH_EMOJI[ex.state?.vehicle?.current ?? 'walk']} Move`}</span>
        </button>
      )}
      {has && (
        <button className={cn('lv-gbtn round', ex.following && 'on')} aria-label="Center on my explorer"
          onClick={() => {
            const p = explorerNow(ex.state, ex.offset);
            if (p) requestFly({ lng: p.lng, lat: p.lat, zoom: Math.max(useUi.getState().view.zoom, Z_STREET + 0.5) });
            ex.setFollowing(true);
          }}
          data-testid="locate-me"
        >
          <Crosshair className="h-5 w-5" /><span className="lbl">Me</span>
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
        {zoom < Z_TOWN - 1 ? 'Zoom in to see plots — or tap 🎯 to jump to your explorer' : 'Keep zooming in to your street — tap the map to dive in'}
      </div>
    </div>
  );
}


export function TypeDot({ t, size = 14 }: { t: PlotTypeId; size?: number }) {
  const c = [PLOT_TYPES[t].a, PLOT_TYPES[t].b];
  return <span className="inline-block shrink-0 rounded-[4px]" style={{ width: size, height: size, background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }} />;
}


// ---- "Getting started" quest list: the mandatory launch loop, made visible ----

function Checklist() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(() => safeStorage('landvas.checklist.hidden', false));
  // (only while the list is showing: a hidden or finished list asks the server nothing)
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me && !hidden });
  const pubs = useQuery({ queryKey: qk.pubs, queryFn: api.myPublications, enabled: !!me && !hidden });
  const records = useQuery({ queryKey: qk.records, queryFn: api.myMinigameRecords, enabled: !!me && !hidden });
  const [collapsed, setCollapsed] = useState(() => typeof innerWidth === 'number' && innerWidth < 640);
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
  // all done: remember it, so the map stops asking for the list's data from now on
  if (doneCount === steps.length) { if (!safeStorage('landvas.checklist.hidden', false)) saveStorage('landvas.checklist.hidden', true); return null; }
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
