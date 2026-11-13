import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Box, Check, ChevronRight, Combine, Crosshair, Gamepad, LayoutGrid, Plus, Rocket, Satellite, Sparkles, X } from 'lucide-react';
import { CurrencyPills, DayNight, ModeButton, PlayerBadge, takeReturn } from '../map/Hud';
import { fmtLeft, placeName, useFlight, useSpace } from '../space/useSpace';
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { BoostButton, BoostCard, RentHud, useRaritySync } from '../rent/RentHud';
import { NotificationBell } from '../updates/Notifications';
import { MergeBar, startMerge, touchingGroups } from '../plot/MergeBar';
import { enableGps, explorerNow, gpsSupported, startGps, stopGps, useExplorer } from '../explorer/explorer';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { RarityBadge } from '../plot/RarityBadge';
import { Joystick, VEH_EMOJI, fmtTank, recentlyDriven, useDriveKeys, useLandscapePhone } from '../explorer/Joystick';
import { ClaimCelebration, useCelebration } from '../plot/ClaimCelebration';
import { LuckCard, LuckChip, LuckDisc } from '../luck/Altar';
import { GrimoireButton } from '../enchant/GrimoireButton';
import { FlyChip, PinFlight, useFlyUi } from '../travel/Fly';
import { TravelBar, TravelButton, TravelOverlays, useTravel } from '../travel/Travel';
import { GroupButton } from '../travel/GroupPlay';
import { useTravelGroup } from '../travel/Group';
import { buzz, isNative } from '../native/native';
import GameHud, { ProfileMenu } from '../app/GameHud';
import { BellCard } from '../updates/Notifications';
import { GrimoireCard, GrimoireSheet } from '../enchant/GrimoireButton';
import { useHudCard, useWorldButton } from '../app/radial';
import { createPortal } from 'react-dom';
import { DailyWheel } from '../earn/DailyWheel';
import { confetti } from '../ui/confetti';
import { DailyChip } from '../earn/DailyChip';
import { StreakChip, StreakDialog, useStreakPrompt } from '../daily/Streak';
import { HotZoneChip, HotZoneDisc, HotZoneLayer, HotZonePanel } from '../daily/HotZoneMap';
import { useQuickRoll } from '../simple/useQuickRoll';


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
const APP = isNative();
const PlanetView = lazy(() => import('../space/Surface').then((m) => ({ default: m.PlanetView })));

/** Earth. `away`: you're off on another world — your explorer isn't here (and GPS rests) while you look around. */
function EarthMap({ away }: { away: { name: string; back(): void } | null }) {
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const selected = useUi((s) => s.selected);
  const session = useSession();
  const me = useOnboardedMe();
  const view = useUi((s) => s.view);
  const lite = useUi((s) => !!s.settings.hidePlots);
  useRaritySync();
  useExplorerSync(!!away);
  const [joystick, setJoystick] = useState(false);
  // the daily loop: streak (opens once a day), guaranteed rolls, the Hot Zone
  const [streak, setStreak] = useState(false);
  const card = useHudCard((s) => s.card);
  const closeCard = useHudCard((s) => s.close);
  const quick = useQuickRoll();
  // (the app keeps the daily check-in in the Play hub; the map stays for the map)
  useStreakPrompt(() => setStreak(true), !APP);
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
      {/* switching the lite map rebuilds it from scratch, so nothing plot-related is left loaded */}
      <WorldMap key={lite ? 'lite' : 'full'} lite={lite} />
      {!lite && <DayNight />}
      {me && <HotZoneLayer />}
      {me && <StreakDialog open={streak} onOpenChange={setStreak} onRoll={(o) => void quick.roll(o)} />}
      {me && quick.element}
      {/* the game HUD */}
      {APP ? (
        // the app: the HUD on top (boost next to your Ink), then one row of clean buttons under your avatar — the
        // Hot Zone (opens into its card), the Altar of Luck, the map view and the Grimoire. Everything else fans
        // out around the World button when you hold it.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col">
          {me ? <div className="lv-map-top"><GameHud overlay /></div> : (
            <div className="flex items-center gap-2 pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))] pt-[max(10px,env(safe-area-inset-top,0px))]">
              {!session && <div className="pointer-events-auto"><SignInChip /></div>}
            </div>
          )}
          {/* one row, centred: Hot Zone, Luck, Grimoire, View (the boost lives up in the HUD beside your earnings) */}
          <div className="lv-maprow flex items-center justify-center gap-3.5 pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))] pt-1 [&>*]:pointer-events-auto" data-testid="map-row">
            {me && <HotZoneDisc />}
            {me && <LuckDisc />}
            {me && <GrimoireButton rail />}
            <ModeButton rail />
          </div>
          {/* whichever of them is open, as a card right under the row */}
          {me && (
            <div className="mt-2 pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))]">
              <AnimatePresence mode="wait">
                {card === 'hot' && <HotZonePanel key="hot" onClose={closeCard} onRoll={() => void quick.roll({ hot: true })} />}
                {card === 'luck' && <LuckCard key="luck" onClose={closeCard} />}
                {card === 'grim' && <GrimoireCard key="grim" onClose={closeCard} />}
                {card === 'bell' && <BellCard key="bell" onClose={closeCard} />}
                {card === 'boost' && <BoostCard key="boost" onClose={closeCard} />}
                {card === 'me' && <ProfileMenu key="me" />}
              </AnimatePresence>
            </div>
          )}
          {me && !away && !joystick && !card && <div className="mt-2 flex pl-[max(12px,env(safe-area-inset-left,0px))]"><JoystickSpot /></div>}
        </div>
      ) : (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))] pt-[max(10px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          {me ? <PlayerBadge /> : !session ? <div className="pointer-events-auto"><SignInChip /></div> : null}
          <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
            {me && <CurrencyPills />}
            <NotificationBell className="lv-gbtn !h-[38px] !w-[38px] !rounded-full !p-0" />
          </div>
        </div>
        {me && <div className="pointer-events-auto flex min-w-0 items-center gap-2"><RentHud /><BoostButton compact /></div>}
        {me && <div className="flex flex-wrap items-center gap-2 self-start"><HotZoneChip onRoll={() => void quick.roll({ hot: true })} /><FlyChip /><LuckChip className="!h-9 !py-0.5" /></div>}
        {me && !away && !joystick && <JoystickSpot />}
        <div className="flex flex-col items-start gap-2.5">
          {me && <GrimoireButton />}
          <ModeButton />
          {me && <StreakChip onOpen={() => setStreak(true)} />}
          {me && <DailyChip />}
        </div>
      </div>
      )}
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
      {me && !selected && !joystick && !merging && !away && !travelling && <Checklist />}
      {me && <MergeBar />}
      {me && !away && <PlacementPrompt />}
      <ClaimCelebration />
      <PinFlight />
      {APP && me && <GrimoireSheet />}
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
  // on a joystick spot, GPS stays off (it would pull the explorer back, and ask for location) until you pick GPS or Home
  const exMode = useExplorer((x) => x.state?.mode) ?? me?.explorer?.mode;
  const onSpot = exMode === 'manual';
  useEffect(() => {
    if (away) { stopGps(); return; }
    if (wantGps && !onSpot) startGps();
  }, [wantGps, away, onSpot]);
}

function ExplorerControls({ joystick, onJoystick }: { joystick: boolean; onJoystick(): void }) {
  const ex = useExplorer();
  const requestFly = useUi((s) => s.requestFly);
  const tilt = useUi((s) => s.settings.tilt3d);
  const haptics = useUi((s) => s.settings.haptics);
  const updateSettings = useUi((s) => s.updateSettings);
  const joy = ex.state?.joystick;
  const has = !!ex.state;
  const space = useSpace();
  const flight = useFlight(space.data);
  const travel = useTravel();
  const group = useTravelGroup();
  // one tap into merge mode whenever some of your plots touch each other
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: has });
  const merging = useUi((s) => s.merge !== null);
  const canMerge = useMemo(() => {
    const act = (groups.data ?? []).filter((g) => g.status === 'active');
    return act.some((g) => touchingGroups(act, [g.id]).length > 1);
  }, [groups.data]);
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const tap = () => { if (haptics) buzz('light'); };
  // a live trip, flight or group comes out of the tray onto the rail by itself
  const trip = travel.data?.trip;
  const tripLive = !!travel.data?.away || (!!trip && !trip.arrived);
  const groupLive = !!group.data?.group && tripLive;
  const flying = flight.flying;
  const gpsLabel = { off: 'Use GPS', asking: 'Finding you…', on: 'GPS on', paused: 'GPS paused', denied: 'Location blocked', unavailable: 'No GPS here' }[ex.gps];
  const spaceLabel = !space.data?.built ? 'Space' : flying ? fmtLeft(flight.left) : space.data.location !== 'earth' ? placeName(space.data, space.data.location).replace('The ', '') : 'Space';
  const spaceBtn = (
    <button className={cn('lv-gbtn round', flying && 'hot')}
      onClick={() => { tap(); setMore(false); nav(space.data && space.data.location !== 'earth' && !flying ? '/space/surface' : '/space'); }} title="Your rocket — fly to the Moon, the planets and beyond" data-testid="space-button">
      <Rocket className={cn('h-5 w-5', flying && 'animate-[lv-bob_1.2s_ease-in-out_infinite]')} /><span className="lbl tnum max-w-[48px] truncate">{spaceLabel}</span>
    </button>
  );
  const gpsBtn = (
    <button
      className={cn('lv-gbtn round', (ex.gps === 'on' || ex.gps === 'paused') && 'go')}
      onClick={() => {
        tap();
        if (ex.gps === 'on' || ex.gps === 'asking' || ex.gps === 'paused') { stopGps(); saveStorage('landvas.gps', false); toast('GPS off', { description: 'Your explorer waits at your last real location. Turn GPS back on to move it.' }); return; }
        enableGps((lng, lat) => requestFly({ lng, lat, zoom: Z_STREET + 0.5 }));
      }}
      title={ex.gps === 'denied' ? 'Location permission was denied. Enable it in your browser settings to move your explorer.' : 'Your explorer follows your real location'}
      aria-label={gpsLabel}
      data-testid="gps-toggle"
    >
      <Satellite className="h-5 w-5" /><span className="lbl">{{ off: 'GPS', asking: '…', on: 'GPS', paused: 'Paused', denied: 'Blocked', unavailable: 'No GPS' }[ex.gps]}</span>
    </button>
  );
  const tray: { key: string; node: ReactNode; label: string }[] = [
    { key: 'plots', label: 'My plots', node: <Link to="/plots" className="lv-gbtn round" aria-label="My plots" data-testid="hud-plots" onClick={() => { tap(); setMore(false); }}><LayoutGrid className="h-5 w-5" /><span className="lbl">Plots</span></Link> },
    ...(has && !tripLive ? [{ key: 'travel', label: 'Trains & planes', node: <TravelButton /> }] : []),
    ...(has && !groupLive && group.data?.group ? [{ key: 'group', label: 'Your group', node: <GroupButton /> }] : []),
    ...(!flying ? [{ key: 'space', label: 'Your rocket', node: spaceBtn }] : []),
    ...((canMerge || APP) && !merging ? [{ key: 'merge', label: 'Merge plots', node: (
      <button className="lv-gbtn round" onClick={() => { tap(); setMore(false); startMerge(null); }} title="Merge touching plots into one bigger canvas or sanctuary" data-testid="map-merge">
        <Combine className="h-5 w-5" /><span className="lbl">Merge</span>
      </button>) }] : []),
    { key: 'gps', label: gpsLabel, node: gpsBtn },
    { key: 'tilt', label: tilt ? '3D buildings' : 'Flat map', node: (
      <button className={cn('lv-gbtn round', tilt && 'on')} onClick={() => { tap(); updateSettings({ tilt3d: !tilt }); }} aria-pressed={tilt} title="Tilt the map to see buildings in 3D" data-testid="tilt-3d">
        <Box className="h-5 w-5" /><span className="lbl">{tilt ? '3D' : '2D'}</span>
      </button>) },
  ];
  // something worth a look in the tray: a merge you can make
  const nudge = canMerge && !merging;
  const locate = () => {
    tap();
    const p = explorerNow(ex.state, ex.offset);
    if (p) requestFly({ lng: p.lng, lat: p.lat, zoom: Math.max(useUi.getState().view.zoom, Z_STREET + 0.5) });
    ex.setFollowing(true);
  };
  if (APP) return <WorldRadial tray={tray} live={<>{has && tripLive && <TravelButton />}{has && groupLive && <GroupButton />}{flying && spaceBtn}</>}
    joystick={has && joy?.enabled !== false ? { on: joystick, toggle: () => { tap(); onJoystick(); }, label: ex.state?.vehicle?.fuel && joy ? `⛽ ${fmtTank(Number(joy.seconds_left))}` : `${VEH_EMOJI[ex.state?.vehicle?.current ?? 'walk']} Move` } : null}
    locate={has ? locate : null} following={ex.following} nudge={nudge} />;
  return (
    <>
      <AnimatePresence>
        {more && <motion.button key="scrim" aria-label="Close" className="absolute inset-0 z-[9] cursor-default bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMore(false)} />}
      </AnimatePresence>
      <div className="absolute bottom-[calc(96px+env(safe-area-inset-bottom,0px))] right-[max(12px,env(safe-area-inset-right,0px))] z-10 flex flex-col items-center gap-2.5 md:bottom-8" data-testid="hud-rail">
        <AnimatePresence>
          {more && (
            <motion.div key="tray" data-testid="hud-tray" role="menu"
              initial={{ opacity: 0, y: 16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.94 }} transition={{ type: 'spring', stiffness: 520, damping: 32 }}
              className="absolute bottom-[calc(100%+10px)] right-0 grid w-[236px] origin-bottom-right grid-cols-3 gap-x-2 gap-y-3 rounded-[26px] border-[1.5px] border-white/15 bg-[linear-gradient(180deg,rgba(28,34,88,0.97),rgba(12,15,44,0.98))] p-3 pb-3.5 text-white shadow-[0_24px_60px_-18px_rgba(0,0,0,0.9)]">
              {tray.map((t, i) => (
                <motion.div key={t.key} className="grid justify-items-center gap-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.025 * i }}
                  onClickCapture={() => { if (t.key === 'travel' || t.key === 'group') { tap(); setMore(false); } }}>
                  {t.node}
                  <span className="max-w-[70px] truncate text-center text-[10px] font-bold text-white/60">{t.label}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {/* live things sit on the rail while they're happening */}
        {has && tripLive && <TravelButton />}
        {has && groupLive && <GroupButton />}
        {flying && spaceBtn}
        <button className={cn('lv-gbtn round', more && 'on')} onClick={() => { tap(); setMore((m) => !m); }} aria-expanded={more} aria-label="More" data-testid="hud-more">
          <motion.span animate={{ rotate: more ? 45 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}><Plus className="h-6 w-6" strokeWidth={2.6} /></motion.span>
          {nudge && !more && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-[#0b0e24] bg-hot" />}
        </button>
        {has && joy?.enabled !== false && (
          <button className={cn('lv-gbtn round', joystick && 'on')} onClick={() => { tap(); onJoystick(); }} aria-pressed={joystick} title="Steer your explorer with the joystick" data-testid="joystick-toggle">
            <Gamepad className="h-5 w-5" /><span className="lbl tnum">{ex.state?.vehicle?.fuel && joy ? `⛽${fmtTank(Number(joy.seconds_left))}` : `${VEH_EMOJI[ex.state?.vehicle?.current ?? 'walk']} Move`}</span>
          </button>
        )}
        {has && (
          <button className={cn('lv-gbtn round !h-[60px] !w-[60px]', ex.following ? 'on' : '')} aria-label="Center on my explorer"
            onClick={() => {
              tap();
              const p = explorerNow(ex.state, ex.offset);
              if (p) requestFly({ lng: p.lng, lat: p.lat, zoom: Math.max(useUi.getState().view.zoom, Z_STREET + 0.5) });
              ex.setFollowing(true);
            }}
            data-testid="locate-me"
          >
            <Crosshair className="h-6 w-6" /><span className="lbl">Me</span>
          </button>
        )}
      </div>
    </>
  );
}

/** The app: hold the World button and the map's actions fan out around it in two arcs. Live things (a trip, a
 *  group, a rocket in flight) stay on the right while they're happening. A tap on World centres on you. */
function WorldRadial({ tray, live, joystick, locate, following, nudge }: {
  tray: { key: string; node: ReactNode; label: string }[]; live: ReactNode;
  joystick: { on: boolean; toggle(): void; label: string } | null; locate: (() => void) | null; following: boolean; nudge: boolean;
}) {
  const open = useWorldButton((s) => s.open);
  const setOpen = useWorldButton((s) => s.setOpen);
  const recenter = useWorldButton((s) => s.recenter);
  const me = useOnboardedMe();
  const wheelQ = useQuery({ queryKey: ['wheel'], queryFn: api.wheelStatus, enabled: !!me, staleTime: 5 * 60_000 });
  const spins = wheelQ.data?.enabled ? Number(wheelQ.data.spins_left ?? 0) : 0;
  const [wheel, setWheel] = useState(false);
  const pin = useFlyUi((s) => s.pinMode);
  const setPin = useFlyUi((s) => s.setPinMode);
  // a tap on World (already on the map) centres on your explorer
  const first = useRef(recenter);
  useEffect(() => { if (recenter !== first.current) locate?.(); }, [recenter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setOpen(false), [setOpen]); // leaving the map closes it
  // the first few visits: a little "hold me" bubble over the World button
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const n = safeStorage('landvas.worldHint', 0);
    if (n >= 3) return;
    saveStorage('landvas.worldHint', n + 1);
    const a = setTimeout(() => setHint(true), 1800), b = setTimeout(() => setHint(false), 7000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const close = () => setOpen(false);
  const items: { key: string; label: string; node: ReactNode }[] = [
    ...(spins > 0 ? [{ key: 'spin', label: 'Spin', node: <button className="lv-gbtn round hot" onClick={() => { close(); setWheel(true); }} data-testid="hud-daily"><span className="text-[22px] leading-none">🎡</span>{spins > 1 && <span className="lv-bang">{spins}</span>}</button> }] : []),
    { key: 'fly', label: pin ? 'Cancel fly' : 'Fly', node: <button className={cn('lv-gbtn round', pin && 'on')} onClick={() => { close(); setPin(!pin); buzz('light'); }} data-testid="fly-chip"><span className="text-[21px] leading-none">✈️</span></button> },
    ...(joystick ? [{ key: 'joy', label: joystick.label, node: <button className={cn('lv-gbtn round', joystick.on && 'on')} onClick={() => { close(); joystick.toggle(); }} aria-pressed={joystick.on} data-testid="joystick-toggle"><Gamepad className="h-5 w-5" /></button> }] : []),
    ...(locate ? [{ key: 'me', label: 'Find me', node: <button className={cn('lv-gbtn round', following && 'on')} onClick={() => { close(); locate(); }} aria-label="Center on my explorer" data-testid="locate-me"><Crosshair className="h-5 w-5" /></button> }] : []),
    ...tray.map((t) => ({ key: t.key, label: t.label, node: t.node })),
  ];
  // arcs over the World button, each holding only as many as fit without touching (and staying on screen and clear of
  // the tab bar); the next arc out takes the rest
  const vw = typeof innerWidth === 'number' ? innerWidth : 390;
  const half = vw / 2 - 40, FOOT = 38, deg = Math.PI / 180;
  const spots: { it: (typeof items)[number]; x: number; y: number }[] = [];
  let left = [...items];
  for (const [r, maxSpan] of [[124, 110], [206, 120], [288, 120]] as const) {
    if (!left.length) break;
    const step = (2 * Math.asin(FOOT / r)) / deg * 1.12;
    const span = Math.min(maxSpan, (2 * Math.asin(Math.min(1, half / r))) / deg);
    const cap = Math.max(1, Math.floor(span / step) + 1);
    const row = left.slice(0, cap); left = left.slice(cap);
    row.forEach((it, i) => {
      const a = (270 + (i - (row.length - 1) / 2) * step) * deg;
      spots.push({ it, x: Math.cos(a) * r, y: Math.sin(a) * r });
    });
  }
  return (
    <>
      {live && <div className="absolute bottom-[calc(96px+env(safe-area-inset-bottom,0px))] right-[max(12px,env(safe-area-inset-right,0px))] z-10 flex flex-col items-center gap-2.5 [&_.lv-gbtn.round]:!h-[50px] [&_.lv-gbtn.round]:!w-[50px]" data-testid="hud-rail">{live}</div>}
      {nudge && !open && <span className="lv-world-nudge" aria-hidden />}
      <div className="lv-world-hint-wrap"><AnimatePresence>{hint && !open && <motion.div className="lv-world-hint" initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} data-testid="world-hint">Hold 🌍 for map actions</motion.div>}</AnimatePresence></div>
      <DailyWheel open={wheel} onOpenChange={setWheel} />
      {createPortal(
        <>
          <AnimatePresence>
            {open && <motion.button key="scrim" className="lv-radial-scrim" aria-label="Close" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} data-testid="world-radial-close" />}
          </AnimatePresence>
          <AnimatePresence>
            {open && (
              <motion.div key="radial" className="lv-radial" role="menu" data-testid="world-radial" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {spots.map(({ it, x, y }, i) => (
                  <motion.div key={it.key} className={cn('lv-radial-item', `lv-logo-${i % LOGO_COLORS}`)} role="menuitem"
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }} animate={{ opacity: 1, x, y, scale: 1 }} exit={{ opacity: 0, x: 0, y: 0, scale: 0.3, transition: { duration: 0.16, ease: 'easeIn' } }}
                    transition={{ type: 'spring', stiffness: 520, damping: 26, delay: i * 0.035 }}
                    onClickCapture={() => { if (it.key !== 'spin' && it.key !== 'fly' && it.key !== 'joy' && it.key !== 'me') close(); }}>
                    {it.node}
                    <span className="lb">{it.label}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}

/** the World button's actions take the colours of the LANDVAS mark, in order (red, orange, yellow, green, blue, violet) */
const LOGO_COLORS = 6;

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
              ? isNative()
                ? 'Location is off for LANDVAS. Turn it on in your phone’s Settings → LANDVAS → Location, then tap “Use my location”.'
                : 'Location is blocked for LANDVAS. Allow it in your browser’s site settings (on iPhone: Settings → Safari → Location), then tap “Use my location”.'
              : 'This browser can’t share your location. Open LANDVAS in your phone’s browser to place your explorer.'}
          </p>
        )}
        <p className="text-xs text-muted">The map needs GPS — explorers can’t be placed by hand or teleported. Your location is never shown to other players.</p>
        {/* no location, still a game: Simple mode rolls plots from one screen and never asks where you are */}
        <Button variant="secondary" onClick={() => { useUi.getState().updateSettings({ simpleMode: true }); setDismissed(true); }} data-testid="place-simple">
          Play without location (Simple mode)
        </Button>
      </div>
    </Dialog>
  );
}

/** You steered the explorer somewhere: it stays there (through refreshes) until you go back to GPS or Home. */
function JoystickSpot() {
  const ex = useExplorer();
  const requestFly = useUi((s) => s.requestFly);
  const [busy, setBusy] = useState(false);
  if (ex.state?.mode !== 'manual') return null;
  const home = async () => {
    setBusy(true);
    try {
      const r = await api.explorerHome();
      useExplorer.getState().set(r);
      saveStorage('landvas.joySpot', false);
      requestFly({ lng: r.lng, lat: r.lat, zoom: Math.max(useUi.getState().view.zoom, Z_STREET + 0.5) });
      useExplorer.getState().setFollowing(true);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="pointer-events-auto lv-hud !h-9 self-start gap-1 !rounded-full !pl-3 !pr-1 text-[12px] font-extrabold" data-testid="joystick-spot">
      <span>🕹️ Joystick spot</span>
      {gpsSupported() && <button className="ml-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px]" onClick={() => { saveStorage('landvas.joySpot', false); enableGps((lng, lat) => requestFly({ lng, lat, zoom: Z_STREET + 0.5 })); }} data-testid="spot-gps">📡 GPS</button>}
      <button className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]" disabled={busy} onClick={home} data-testid="spot-home">🏠 Home</button>
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
  if (zoom >= Z_STREET - 1) return null;
  return (
    <div className={cn('pointer-events-none absolute inset-x-0 z-10 flex justify-center md:bottom-6', APP ? 'bottom-[calc(172px+env(safe-area-inset-bottom,0px))] px-6' : 'bottom-[calc(96px+env(safe-area-inset-bottom,0px))]')}>
      <div className="glass rounded-full px-4 py-2 text-center text-[12.5px] font-semibold text-muted">
        {APP ? (zoom < Z_TOWN - 1 ? 'Zoom in to see plots' : 'Zoom in to your street') : zoom < Z_TOWN - 1 ? 'Zoom in to see plots — or tap 🎯 to jump to your explorer' : 'Keep zooming in to your street — tap the map to dive in'}
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
  const [hidden, setHidden] = useState(() => safeStorage('landvas.checklist.hidden', false));
  // (only while the list is showing: a hidden or finished list asks the server nothing)
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me && !hidden });
  const pubs = useQuery({ queryKey: qk.pubs, queryFn: api.myPublications, enabled: !!me && !hidden });
  const records = useQuery({ queryKey: qk.records, queryFn: api.myMinigameRecords, enabled: !!me && !hidden });
  const [open, setOpen] = useState(false);
  const guide = useRef(safeStorage<string | null>('landvas.guide', null));
  const requestFly = useUi((s) => s.requestFly);
  const haptics = useUi((s) => s.settings.haptics);
  useEffect(() => {
    if (guide.current === 'starter' && me && !me.player.starter_plot_claimed && me.explorer) {
      toast('Pick your free starter plot', { description: 'Tap any plot inside the dashed square around your explorer.' });
      saveStorage('landvas.guide', null);
      guide.current = null;
      if (useUi.getState().view.zoom < 3) requestFly({ lng: -40, lat: 30, zoom: 2.2 });
    }
  }, [me, requestFly]);
  const g = groups.data ?? [];
  const p = pubs.data ?? [];
  const steps = me ? [
    { label: 'Place your explorer', reward: 'Start', done: !!me.explorer },
    { label: 'Claim your free starter plot', reward: 'Free plot', done: me.player.starter_plot_claimed },
    { label: 'Win its minigame to earn Ink', reward: 'Ink', done: Object.values(records.data?.records ?? {}).some((r: any) => r.wins > 0) },
    { label: 'Buy a second plot with Ink', reward: 'More rent', done: me.plot_count >= 2 },
    { label: 'Hit the 20× rent boost', reward: '20× rent', done: (me.rent?.boost?.used_today ?? 0) > 0 || !!me.rent?.boost?.active },
    { label: 'Paint & publish your plot', reward: 'On the map', done: p.some((x) => ['published', 'pending_review', 'approved', 'processing', 'superseded'].includes(x.status)) },
    { label: 'Connect plots into a mural', reward: 'Mural', done: g.some((x) => x.plot_count >= 2) },
  ] : [];
  const doneCount = steps.filter((s) => s.done).length;
  // a step just got done: celebrate it (only once the data has settled, not on first load)
  const seen = useRef<number | null>(null);
  const settled = !!me && !groups.isLoading && !pubs.isLoading && !records.isLoading;
  useEffect(() => {
    if (!settled) return;
    if (seen.current !== null && doneCount > seen.current) {
      confetti({ y: innerHeight - 160, count: 90 });
      if (haptics) buzz('success');
      toast.success(`Quest complete! ${doneCount}/${steps.length}`, { description: steps[doneCount] ? `Next: ${steps[doneCount].label}` : 'You’ve finished getting started 🎉' });
    }
    seen.current = doneCount;
  }, [doneCount, settled]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me || hidden) return null;
  // all done: remember it, so the map stops asking for the list's data from now on
  if (doneCount === steps.length) { if (!safeStorage('landvas.checklist.hidden', false)) saveStorage('landvas.checklist.hidden', true); return null; }
  const nextIdx = steps.findIndex((s) => !s.done);
  const next = steps[nextIdx];
  const go = () => {
    if (nextIdx === 0) enableGps((lng, lat) => useUi.getState().requestFly({ lng, lat, zoom: Z_STREET + 0.5 }));
    else if (nextIdx === 2) nav('/play');
    else if (nextIdx >= 5) nav('/canvases');
    else setOpen((o) => !o);
  };
  const pct = doneCount / steps.length;
  const R = 15, C = 2 * Math.PI * R;
  return (
    <div className="absolute bottom-[calc(96px+env(safe-area-inset-bottom,0px))] left-[max(12px,env(safe-area-inset-left,0px))] z-10 w-[min(300px,calc(100vw-96px))] md:bottom-6" data-testid="quest">
      <AnimatePresence>
        {open && (
          <motion.ol initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="mb-2 grid gap-1.5 rounded-2xl border-[1.5px] border-white/12 bg-[#0e1336]/95 p-3 text-white shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/60">Getting started</span>
              <button aria-label="Hide checklist" onClick={() => { setHidden(true); saveStorage('landvas.checklist.hidden', true); }} className="text-[11px] font-bold text-white/45">Hide</button>
            </div>
            {steps.map((s, i) => (
              <li key={s.label} className={cn('flex items-center gap-2 text-[13px]', s.done ? 'text-white/35 line-through' : i === nextIdx ? 'font-bold' : 'text-white/60')}>
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', s.done ? 'border-ok bg-ok text-bg' : i === nextIdx ? 'border-[#22E3FF]' : 'border-white/25')}>
                  {s.done && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1">{s.label}</span>
                {!s.done && <span className="rounded-full bg-white/8 px-1.5 text-[10px] font-bold text-gold">{s.reward}</span>}
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
      <div className="flex items-stretch gap-1.5">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="quest-pill"
          className="lv-hud !h-auto min-w-0 flex-1 gap-2.5 !rounded-2xl !py-1.5 !pl-1.5 !pr-3 text-left">
          <span className="relative grid h-[38px] w-[38px] shrink-0 place-items-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" /><circle cx="18" cy="18" r={R} fill="none" stroke="url(#lvq)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset .6s' }} /><defs><linearGradient id="lvq"><stop stopColor="#22E3FF" /><stop offset="1" stopColor="#8B5CFF" /></linearGradient></defs></svg>
            <span className="text-[11px] font-black tnum">{doneCount}/{steps.length}</span>
          </span>
          <span className="grid min-w-0 leading-tight">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#22E3FF]">Next quest</span>
            <span className="truncate text-[13px] font-extrabold">{next.label}</span>
          </span>
        </button>
        {(nextIdx === 0 || nextIdx === 2 || nextIdx >= 5) && (
          <button onClick={go} className="lv-gbtn go shrink-0 px-3 text-[13px]" data-testid="quest-go">GO<ChevronRight className="h-4 w-4" /></button>
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
