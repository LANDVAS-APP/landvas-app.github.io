// A world, in 3D — both /space/surface (full screen, on your feet) and the World tab while your rocket
// is parked there (it opens up high, with the whole planet in view). One zoom takes you from walking
// to flying low over the plots to orbit; your live group of up to 10 walks with you; plots are bought
// on the shared map, each with its world's two games; and a far-off world can be settled as home.
import GameHud, { ProfileMenu } from '../app/GameHud';
import { useHudCard } from '../app/radial';
import { BellCard } from '../updates/Notifications';
import { isNative } from '../native/native';
import { IfCapped } from '../ui/IfCapped';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronUp, Crosshair, Flag, Footprints, Home, MapPin, Minus, Pencil, Pickaxe, Plus, Rocket as RocketIcon, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlanetMap, PlanetPlot, SpaceState } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { cleanGenome } from '../inkborn/genome';
import { CurrencyPills, PlayerBadge } from '../map/Hud';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { Button, Dialog, ResourceIcon, Spinner, inputCls } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { NotificationBell } from '../updates/Notifications';
import { savedPose, usePlanetLive } from './live';
import { DigPanel } from './Dig';
import { RoverControls, RoverGarage, useRover } from './Rover';
import { PlanetChatBox, usePlanetChat } from './PlanetChat';
import { QuestsChip, QuestsDialog, questsKey, useQuests } from './Quests';
import { BaseBuilder, BaseVisit } from './BaseBuilder';
import { createPlanetScene, type FindKind, type PlanetScene, type ZoomInfo } from './planet3d';
import { PlacesSheet } from './Places';
import { DiscoveriesDialog, FindsChip, StormChip, useDiscoveries } from './Discoveries';
import { PLANET_GAMES } from './planetGames';
import { cellKey, cellLabel, radiusFor, type Cell } from './planetGrid';
import { SPACE_KEY, useFlight, useSpace } from './useSpace';
import { type World, worldKey, worldOf } from './worlds';
import { poll, live as liveMs } from '../lib/poll';
import { useNudge } from '../lib/nudge';

const APP = isNative();
export default function Surface() {
  const q = useSpace();
  const nav = useNavigate();
  const flight = useFlight(q.data);
  if (q.isLoading || !q.data) return <div className="fixed inset-0 grid place-items-center bg-[#05060F]"><Spinner /></div>;
  const s = q.data;
  const w = worldOf(s.location, s.home_seed, s.home_name);
  if (!w || flight.flying) {
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#05060F] p-6 text-center text-white">
        <div className="text-5xl">🚀</div>
        <p>{flight.flying ? 'Your rocket is still flying.' : 'You’re on Earth — launch to a world first.'}</p>
        <Button variant="secondary" onClick={() => nav('/space')}>Mission control</Button>
      </div>
    );
  }
  return <div className="fixed inset-0"><PlanetView key={s.location} s={s} w={w} /></div>;
}

const SAMPLES = 5;
export const planetKey = (world: string) => ['planet', world] as const;
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const seedOf = (loc: string) => (loc.startsWith('exo:') ? Number(loc.slice(4)) : [...loc].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7));
const distance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);

/** The planet itself. `embedded` = the World tab (game HUD, starts high over the globe). */
export function PlanetView({ s, w, embedded = false, onPeekEarth }: { s: SpaceState; w: World; embedded?: boolean; onPeekEarth?(): void }) {
  const hudCard = useHudCard((x) => x.card);
  const closeHudCard = useHudCard((x) => x.close);
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const reduce = useUi((st) => st.settings.reduceMotion);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<PlanetScene | null>(null);
  const world = s.location;
  const taken = s.samples[s.location] === s.day;
  const isHome = s.home_seed != null && s.location === `exo:${s.home_seed}`;
  const canPlots = w.kind !== 'exo' || isHome;
  const map = useQuery({ queryKey: planetKey(world), queryFn: () => api.planetMap(world), enabled: canPlots, refetchInterval: poll(45_000) });
  const sanct = useQuery({ queryKey: ['sanctuaries'], queryFn: api.mySanctuaries, enabled: !!me, staleTime: 60_000 });
  // your companion comes along (or, until you've starred one, whoever's free)
  const buddy = (sanct.data?.companion_id ? sanct.data.creatures.find((c) => c.id === sanct.data!.companion_id) : null) ?? sanct.data?.creatures.find((c) => !c.job) ?? null;
  const buddyGenome = useMemo(() => (buddy ? cleanGenome(buddy.genome) : null), [buddy?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cell, setCell] = useState<Cell | null>(null);
  const [zoom, setZoomInfo] = useState<ZoomInfo>({ level: embedded ? 0.8 : 0.1, meters: 0, mode: embedded ? 'orbit' : 'walk' });
  const [got, setGot] = useState(0);
  const [paid, setPaid] = useState<{ paid: number; first: number } | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [warpOpen, setWarpOpen] = useState(false);
  const [digPlot, setDigPlot] = useState<PlanetPlot | null>(null);
  const [garageOpen, setGarageOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [building, setBuilding] = useState<PlanetPlot | null>(null);
  const [visiting, setVisiting] = useState<{ gx: number; gy: number } | null>(null);
  // the planet doesn't need drawing behind the full-screen base view
  useEffect(() => { if (building || visiting) { scene.current?.setPaused(true); return () => scene.current?.setPaused(false); } }, [!!building || !!visiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const collecting = useRef(false);

  const collect = async () => {
    if (collecting.current) return;
    collecting.current = true;
    try {
      const r = await api.spaceCollect();
      qc.setQueryData(SPACE_KEY, r);
      invalidateGame(qc);
      setPaid({ paid: r.paid ?? 0, first: r.first_bonus ?? 0 });
      confettiCannons();
    } catch (e) { toast.error(toGameError(e).message); }
  };

  // build the world once, when its map size is known — nothing else rebuilds it
  const rows = map.data?.rows;
  const canBuild = canPlots ? rows != null || map.isError : true;
  const builtRows = rows ?? 16;
  const latest = useRef({ taken, collect, grab: (_i: number) => {}, find: (_k: FindKind, _i: number) => {} }); latest.current = { taken, collect, grab: (i: number) => void grab(i), find: latest.current.find };
  useEffect(() => {
    if (!canBuild || !cv.current) return;
    const introKey = `landvas.planet.intro.${world}`;
    const intro = !embedded && !safeStorage(introKey, false);
    saveStorage(introKey, true);
    let sc: PlanetScene;
    try {
      sc = createPlanetScene({
        canvas: cv.current, world: w, rows: builtRows, seed: seedOf(world), accent: me?.profile.accent_color ?? '#8B5CFF',
        explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 184)),
        isHome, samples: latest.current.taken ? 0 : SAMPLES, reduceMotion: reduce, startHigh: embedded, intro,
        onCell: setCell, onPick: setCell, onZoom: setZoomInfo, onLost: () => setLost(true), onArea: setArea,
        onSample: (n) => { setGot(n); if (n === SAMPLES) void latest.current.collect(); },
        onMeteor: (i) => latest.current.grab(i),
        onFind: (k, i) => latest.current.find(k, i),
      });
    } catch (e) {
      console.error(e);
      setLost(true);
      return;
    }
    scene.current = sc;
    const back = savedPose(world); if (back) sc.place(back.d, back.face);
    setReady(true);
    return () => { sc.dispose(); scene.current = null; setReady(false); };
  }, [canBuild]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ready) scene.current?.setBuddy(buddyGenome); }, [ready, buddyGenome]);
  const rarityOf = useMemo(() => Object.fromEntries((map.data?.rarities ?? []).map((r, i) => [r.id, { ...r, rank: i }])), [map.data?.rarities]);
  // a world has millions of plots: fetch the claimed ones round where you're looking, and sector counts for afar
  const [area, setArea] = useState<{ gx: number; gy: number } | null>(null);
  const win = area ? { gx: Math.round(area.gx / 32) * 32, gy: Math.round(area.gy / 32) * 32 } : null;
  const near = useQuery({
    queryKey: ['planet-near', world, win?.gx, win?.gy], enabled: canPlots && !!win && !!map.data, refetchInterval: poll(45_000), placeholderData: (prev) => prev,
    queryFn: () => api.planetPlotsNear(world, win!.gx - 120, win!.gx + 120, Math.max(0, win!.gy - 100), Math.min((map.data?.rows ?? 1) - 1, win!.gy + 100)),
  });
  const sectorSize = Math.max(1, Math.round(builtRows / 40));
  const sectors = useQuery({ queryKey: ['planet-sectors', world], enabled: canPlots && ready, refetchInterval: poll(60_000), queryFn: () => api.planetSectors(world, sectorSize) });
  const shownPlots = useMemo(() => {
    const byKey = new Map<string, PlanetPlot>();
    for (const p of near.data ?? []) byKey.set(`${p.gx}:${p.gy}`, p);
    for (const p of map.data?.plots ?? []) byKey.set(`${p.gx}:${p.gy}`, p);
    return [...byKey.values()];
  }, [near.data, map.data?.plots]);
  useEffect(() => { if (ready && map.data) scene.current?.setPlots(shownPlots, rarityOf); }, [ready, shownPlots, rarityOf]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready && sectors.data) scene.current?.setSectors(sectors.data, sectorSize); }, [ready, sectors.data, sectorSize]);

  // meteor showers: everyone on the world sees the same ones; first to reach one gets it
  // they change when someone grabs one (the server nudges this world's sky) and when the next shower starts (on the
  // clock: we look right then)
  const shower = useQuery({ queryKey: ['meteors', world], queryFn: () => api.planetMeteors(world), enabled: ready && !lost, refetchInterval: liveMs(120_000) });
  useNudge(`pm:${world}`, () => shower.refetch(), { enabled: ready && !lost, immediate: false, safetyMs: liveMs(120_000), fallbackMs: liveMs(6000), gapMs: 1500, trailMs: 3000 });
  useEffect(() => {
    const ends = shower.data?.ends_at ? new Date(shower.data.ends_at).getTime() : 0;
    if (!ends || !ready || lost) return;
    const t = setTimeout(() => void shower.refetch(), Math.max(500, ends - Date.now() + 750));
    return () => clearTimeout(t);
  }, [shower.data?.ends_at, ready, lost]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready && shower.data) scene.current?.setMeteors(String(shower.data.win), shower.data.meteors); }, [ready, shower.data]);
  const grabbing = useRef(new Set<number>());
  const farUntil = useRef(new Map<number, number>()); // after "too far", wait a moment before trying that one again
  const grab = async (i: number) => {
    if (grabbing.current.has(i) || (farUntil.current.get(i) ?? 0) > Date.now()) return;
    grabbing.current.add(i);
    let far = false;
    try {
      const r = await api.planetMeteorGrab(world, i, scene.current?.pose().d ?? null);
      const m = shower.data?.meteors.find((x) => x.i === i);
      if (m) scene.current?.burst(m.d, r.golden ? '#FFE36B' : '#FF9A5C');
      invalidateGame(qc);
      toast.success(r.golden ? `Golden meteorite! +${r.paid} Ink 🌟` : `Meteorite! +${r.paid} Ink ☄️`, { description: r.capped ? 'You’ve hit today’s planet Ink limit.' : undefined, duration: 2200 });
    } catch (e) {
      const err = toGameError(e);
      if (err.code === 'too_far') { far = true; farUntil.current.set(i, Date.now() + 8000); } else toast(err.message, { duration: 1800 });
    } finally {
      grabbing.current.delete(i);
      if (!far) void shower.refetch();
    }
  };
  // weather, hiding aliens and places to discover
  const disc = useDiscoveries(world, ready && !lost, scene);
  latest.current.find = (k, i) => void disc.find(k, i);
  const [discOpen, setDiscOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState<'plots' | 'people' | 'worlds' | null>(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t); }, []);
  const metLeft = shower.data?.meteors.filter((m) => !m.taken).length ?? 0;
  const nextIn = shower.data ? Math.max(0, (new Date(shower.data.ends_at).getTime() - clock) / 1000) : 0;
  const [reveal, setReveal] = useState<{ rarity: string; games: string[] } | null>(null);

  // walk together with your live group (the same group from the World tab or full screen)
  const chat = usePlanetChat(world, me?.profile.id, ready, scene);
  const live = usePlanetLive({
    sendRef: chat.sendRef, onChat: chat.onChat,
    world, enabled: ready, myId: me?.profile.id,
    pose: () => scene.current?.pose() ?? null,
    onMembers: (ms) => scene.current?.setLive(ms.map((m) => ({ id: m.id, username: m.username, d: m.d, face: m.face, hop: m.hop, companion: m.companion?.genome ? cleanGenome(m.companion.genome) : null,
      explorerUrl: svgUrl(explorerSvg(m.explorer_style as never, m.accent_color ?? '#7B5CFF', 184)) }))),
    onRemote: (id, d, f, h, v) => scene.current?.remote(id, d, f, h, v),
    onSpawn: (d, who) => {
      if (savedPose(world)) return; // you were already here — stay where you left off
      scene.current?.teleport(d);
      if (who) toast(`You landed next to @${who.username} 👋`, { description: 'Walk together — everyone in your group sees you move live.' });
    },
  });

  const plotAt = (c: Cell | null) => (c ? shownPlots.find((p) => p.gx === c.gx && p.gy === c.gy) ?? null : null);
  const here = plotAt(cell);
  const mine = (map.data?.plots ?? []).filter((p) => p.mine);
  const high = zoom.mode !== 'walk';
  const rover = useRover(world, scene, ready, high);
  const quests = useQuests(world, ready);
  const R = radiusFor(builtRows);
  const around = 2 * Math.PI * R, plotM = (R * Math.PI * 144) / (180 * builtRows);

  const claim = async () => {
    if (!cell) return;
    setBusy(true);
    try {
      const r = await api.planetClaim(world, cell.gx, cell.gy);
      qc.setQueryData(planetKey(world), r);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['planet-mine'] }); void near.refetch(); void sectors.refetch();
      setReveal({ rarity: r.rarity, games: r.games_unlocked });
    } catch (e) { toast.error(toGameError(e).message); void map.refetch(); } finally { setBusy(false); }
  };
  const rename = async () => {
    if (!cell) return;
    setBusy(true);
    try { await api.planetRename(world, cell.gx, cell.gy, name.trim()); setRenameOpen(false); void map.refetch(); void qc.invalidateQueries({ queryKey: ['planet-mine'] }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const settle = async () => {
    setBusy(true);
    try { const r = await api.spaceSettle(name.trim()); qc.setQueryData(SPACE_KEY, r); setSettleOpen(false); confettiCannons(); toast.success(`Welcome home to ${r.home_name}! 🏡`, { description: 'It has a map of its own now — only you can build here.' }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const warpTo = async (dest: string, label: string) => {
    setWarpOpen(false);
    try { const r = await api.spaceLaunch(dest); qc.setQueryData(SPACE_KEY, r); invalidateGame(qc); toast.success(`⚡ Warped to ${label}`); }
    catch (e) { toast.error(toGameError(e).message); }
  };
  const cfg = s.config.worlds[worldKey(s.location)];
  const bottom = embedded ? 'bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-5' : 'bottom-[max(16px,env(safe-area-inset-bottom,0px))]';
  const modeLabel = { walk: 'On foot', fly: 'Flying', orbit: 'Orbit' }[zoom.mode];

  return (
    <div className="lv-space absolute inset-0 select-none overflow-hidden bg-black text-white" data-testid={embedded ? 'planet-map' : 'surface'}>
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" aria-label={`${w.name} in 3D. Walk with the joystick, WASD or the arrow keys, or tap the ground; pinch or scroll to rise up over the planet; drag to look around.`} data-testid="surface-canvas" />
      {!ready && !lost && <div className="absolute inset-0 grid place-items-center bg-[#05060F]"><div className="grid justify-items-center gap-2 text-sm text-white/70"><Spinner />{embedded ? `Loading ${w.name}…` : `Descending to ${w.name}…`}</div></div>}
      {lost && (
        <div className="absolute inset-0 grid place-content-center gap-3 bg-[#05060F] p-6 text-center">
          <div className="text-4xl">🛰️</div>
          <p className="max-w-xs text-sm text-white/80">The 3D view stopped — your device ran short on graphics memory. Close a few apps or tabs and try again.</p>
          <Button variant="secondary" onClick={() => location.reload()}>Reload</Button>
        </div>
      )}

      {/* top: the game HUD (World tab) or back + world name (full screen) */}
      {APP && embedded && (
        // the app: the same HUD as on Earth (you, your earnings, Ink, the bell), and its cards
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
          <GameHud overlay />
          <div className="px-3"><AnimatePresence mode="wait">{hudCard === 'me' && <ProfileMenu key="me" />}{hudCard === 'bell' && <BellCard key="bell" onClose={closeHudCard} />}</AnimatePresence></div>
        </div>
      )}
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-3 pt-[max(10px,env(safe-area-inset-top,0px))]', APP && embedded && 'pt-[calc(max(10px,env(safe-area-inset-top,0px))+64px)]', APP && 'lv-planethud')}>
        <div className={cn('flex items-start gap-2', APP && embedded && 'hidden')}>
          {embedded ? <PlayerBadge /> : (
            <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl bg-black/55 p-1.5 pr-3 backdrop-blur lv-planetchip">
              <button onClick={() => nav(-1)} className={APP ? 'lv-back !h-9 !w-9' : 'rounded-xl p-2 hover:bg-white/10'} aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0"><div className="truncate font-display text-sm font-bold">{w.name}{isHome ? ' · home' : ''}</div><div className="truncate text-[11px] text-white/70">Gravity {w.gravity}× · {taken && !paid ? 'samples collected' : `samples ${got}/${SAMPLES}`}</div></div>
            </div>
          )}
          <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
            {embedded && <CurrencyPills />}
            {embedded && <NotificationBell className="lv-gbtn !h-[38px] !w-[38px] !rounded-full !p-0" />}
            {!embedded && w.kind === 'exo' && !isHome && <Button size="sm" variant="rainbow" onClick={() => { setName(w.name.split(' (')[0]); setSettleOpen(true); }} data-testid="settle"><Home className="h-4 w-4" /> Settle here</Button>}
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          {embedded && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-black/55 px-3 py-1.5 backdrop-blur lv-planetchip" data-testid="planet-banner">
              <span className="text-lg">🪐</span>
              <div className="leading-tight"><div className="font-display text-sm font-bold">{w.name}{isHome ? ' · home' : ''}</div><div className="whitespace-nowrap text-[10.5px] text-white/65">Rocket parked here</div></div>
              <button className="ml-1 rounded-xl bg-white/10 p-2 hover:bg-white/20" onClick={() => nav('/space')} aria-label="Mission control" data-testid="space-button"><RocketIcon className="h-4 w-4" /></button>
              {onPeekEarth && <button className="whitespace-nowrap rounded-xl bg-white/10 px-2 py-1.5 text-[11px] font-bold hover:bg-white/20" onClick={onPeekEarth} title="Look at Earth's map (you stay here)" data-testid="peek-earth">🌍 Earth</button>}
              <button className="whitespace-nowrap rounded-xl bg-white/10 px-2 py-1.5 text-[11px] font-bold hover:bg-white/20" onClick={() => setWarpOpen(true)} title="Warp to another world — free and instant" data-testid="warp-open">⚡ Warp</button>
            </div>
          )}
          {/* one tidy row of status chips (it scrolls sideways if there are many), instead of a tall stack over the view */}
          <div className="pointer-events-auto no-scrollbar -mx-3 flex max-w-[100vw] items-center gap-1.5 overflow-x-auto px-3 [&>*]:shrink-0 [&>*]:whitespace-nowrap" data-testid="planet-chips">
          <span className="hidden items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] sm:flex" data-testid="planet-scale">
            🧭 {distance(around)} around · {((map.data?.rows ?? builtRows) * (map.data?.cols ?? builtRows * 2.5) / 1e6).toFixed(1)}M plots, {Math.round(plotM)} m wide
          </span>
          {live && (
            <button onClick={() => setPlacesOpen('people')} className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px]" data-testid="live-group">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4FD18B]" /><Users className="h-3 w-3" />
              {live.with ? `${live.with + 1}/${live.size} here` : 'Just you'}{live.onWorld > live.with + 1 ? ` · ${live.onWorld} on ${w.name.replace('The ', 'the ')}` : ''}
            </button>
          )}
          {shower.data && (
            <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]', metLeft ? 'bg-[#FF7A3D]/80' : 'bg-black/50')} data-testid="meteor-chip" title="Meteor shower by the landing site">
              ☄️ {metLeft ? `${metLeft} meteors` : 'next shower'} · {Math.floor(nextIn / 60)}:{String(Math.floor(nextIn % 60)).padStart(2, '0')}
            </span>
          )}
          <StormChip d={disc.data} onOpen={() => setDiscOpen(true)} />
          <FindsChip d={disc.data} onOpen={() => setDiscOpen(true)} />
          <QuestsChip q={quests.data} onOpen={() => setQuestsOpen(true)} />
          {canPlots && map.data && (
            <button className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px]" onClick={() => setPlacesOpen('plots')} data-testid="my-planet-plots">
              <Flag className="h-3 w-3" /> {mine.length ? `My plots (${mine.length}) · ` : ''}{map.data.claimed.toLocaleString()} claimed
            </button>
          )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {paid && (
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-40 z-10 mx-auto w-fit max-w-[calc(100%-24px)] rounded-2xl bg-black/70 px-4 py-3 text-center" data-testid="samples-paid">
            <div className="font-display text-lg font-bold">All samples collected! 🪨✨</div>
            <div className="flex items-center justify-center gap-1 text-sm">+{paid.paid} <ResourceIcon r="ink" className="h-4 w-4" />{paid.first > 0 && <> · first-visit bonus +{paid.first} <ResourceIcon r="ink" className="h-4 w-4" /></>}</div>
          </motion.div>
        )}
      </AnimatePresence>
      {taken && !paid && ready && !high && got === 0 && !embedded && (
        <div className="pointer-events-none absolute inset-x-0 top-40 mx-auto w-fit max-w-[calc(100%-24px)] rounded-2xl bg-black/50 px-3 py-1.5 text-center text-[11px] text-white/80">
          Today’s samples are in (+{cfg?.sample ?? 0} Ink a day). Explore, claim plots, or fly on.
        </div>
      )}

      {/* right: zoom rail (feet ↔ orbit) and rocket */}
      <div className={cn('pointer-events-none absolute right-3 z-10 flex flex-col items-center gap-2', embedded ? 'top-[30%]' : 'top-[24%]')}>
        <button className="lv-gbtn round pointer-events-auto max-sm:!hidden" onClick={() => scene.current?.zoom(0.55)} aria-label="Closer" data-testid="zoom-in"><Plus className="h-5 w-5" /></button>
        <button className="pointer-events-auto grid w-12 justify-items-center gap-0.5 rounded-2xl bg-black/55 py-1.5 text-[9.5px] font-bold uppercase tracking-wide backdrop-blur"
          onClick={() => scene.current?.setZoom(high ? 0.08 : 0.85)} aria-label={high ? 'Back down on foot' : 'Up to orbit'} data-testid="zoom-mode">
          <span className="relative h-12 w-1.5 rounded-full bg-white/20"><span className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#FFE36B] shadow" style={{ bottom: `calc(${Math.round(zoom.level * 100)}% - 6px)` }} /></span>
          <span>{modeLabel}</span>
        </button>
        <button className="lv-gbtn round pointer-events-auto max-sm:!hidden" onClick={() => scene.current?.zoom(1.8)} aria-label="Higher" data-testid="zoom-out"><Minus className="h-5 w-5" /></button>
        {high && <button className="lv-gbtn round pointer-events-auto" onClick={() => scene.current?.findMe()} aria-label="Find me"><Crosshair className="h-5 w-5" /></button>}
        {!high && ready && <RoverControls rover={rover} onGarage={() => setGarageOpen(true)} />}
        {!high && ready && <button className="lv-gbtn round go pointer-events-auto" onClick={() => {
          if (here?.mine) { setDigPlot(here); scene.current?.setPaused(true); }
          else toast(here ? 'You can only dig into your own plots.' : 'Stand on one of your plots to dig — claim one first!', { description: 'Every plot you own has its own shaft, all the way down to the core.' });
        }} aria-label="Enter your shaft" data-testid="dig-open"><Pickaxe className="h-5 w-5" /><span className="lbl">{here?.shaft ? 'Enter' : 'Dig'}</span></button>}
        {!embedded && <button className="lv-gbtn round pointer-events-auto" onClick={() => nav('/space')} aria-label="Your rocket"><RocketIcon className="h-5 w-5" /></button>}
      </div>

      {/* group chat (your live group of up to 10) */}
      {ready && !high && <PlanetChatBox chat={chat} myId={me?.profile.id} className={cn('absolute left-3 z-10', embedded ? 'top-[40%]' : 'top-[38%]')} />}

      {/* the plot under you (or the one you tapped from above) */}
      <div className={cn('pointer-events-none absolute inset-x-0 z-10 flex justify-center pl-3 pr-[68px] sm:px-3', embedded ? 'bottom-[calc(84px+env(safe-area-inset-bottom,0px)+140px)] md:bottom-[150px]' : 'bottom-[calc(max(16px,env(safe-area-inset-bottom,0px))+140px)] sm:bottom-[max(16px,env(safe-area-inset-bottom,0px))]')}>
        {ready && canPlots && map.data && (
          <PlotCard map={map.data} cell={cell} plot={here} high={high} busy={busy} rows={builtRows} rarityOf={rarityOf}
            onClaim={claim} onWalk={() => cell && scene.current?.walkTo(cell)}
            onRename={() => { setName(here?.name ?? ''); setRenameOpen(true); }}
            onPlay={(g) => cell && nav(`/space/planet/${encodeURIComponent(world)}/${cell.gx}/${cell.gy}/${g}`)} onBuild={() => {
              if (!here) return;
              // part of a bigger base of yours: open that one
              const anchor = here.in_base ? shownPlots.find((p) => p.gx === here.in_base![0] && p.gy === here.in_base![1]) : null;
              setBuilding(anchor ?? here);
            }}
            onVisit={(gx, gy) => setVisiting({ gx, gy })} />
        )}
        {ready && !canPlots && (
          <div className="pointer-events-auto rounded-2xl bg-black/60 px-4 py-2 text-center text-xs text-white/80 backdrop-blur">Uncharted world — settle it to lay out plots of your own.</div>
        )}
      </div>

      {/* bottom: move (walk, or fly when you're up high) and jump */}
      <div className={cn('pointer-events-none absolute inset-x-0 z-10 flex items-end justify-between px-4', bottom)}>
        <Stick onMove={(x, y) => { const sc = scene.current; if (sc) { sc.joy.x = x; sc.joy.y = y; } }} />
        {!high ? (
          <button className="pointer-events-auto flex h-20 w-20 select-none items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur active:bg-white/25"
            onPointerDown={(e) => { e.preventDefault(); scene.current?.jump(); }} aria-label="Jump" data-testid="jump"><ChevronUp className="h-9 w-9" /></button>
        ) : (
          <button className="pointer-events-auto flex h-20 w-20 select-none flex-col items-center justify-center rounded-full border border-white/25 bg-black/40 text-[10px] font-bold text-white backdrop-blur active:bg-white/25"
            onClick={() => scene.current?.setZoom(0.08)} aria-label="Land on foot" data-testid="land-on-foot"><Footprints className="h-7 w-7" />Land</button>
        )}
      </div>
      {high && ready && !cell && <div className={cn('pointer-events-none absolute inset-x-0 z-10 mx-auto w-fit rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/80', embedded ? 'bottom-[calc(84px+env(safe-area-inset-bottom,0px)+150px)] md:bottom-[160px]' : 'bottom-[160px]')}>{zoom.mode === 'orbit' ? 'Drag to spin the planet · tap a plot' : 'Fly with the stick · tap a plot · Land to walk'}</div>}

      <AnimatePresence>{building && <BaseBuilder world={world} plot={building} mine={shownPlots.filter((p) => p.mine)} onClose={() => setBuilding(null)} onSaved={() => { void near.refetch(); void map.refetch(); }} />}</AnimatePresence>
      <AnimatePresence>{visiting && <BaseVisit world={world} gx={visiting.gx} gy={visiting.gy} onClose={() => setVisiting(null)} />}</AnimatePresence>
      <RoverGarage open={garageOpen} onOpenChange={setGarageOpen} rover={rover} />
      {placesOpen && <PlacesSheet open onOpenChange={(o) => { if (!o) setPlacesOpen(null); }} start={placesOpen}
        here={{ world, R, go: (d) => scene.current?.teleport(d), pose: () => scene.current?.pose().d ?? null }} />}
      <DiscoveriesDialog d={disc.data} open={discOpen} onOpenChange={setDiscOpen} worldName={w.name.replace('The ', 'the ')} pose={() => scene.current?.pose().d ?? null} R={R} />
      <QuestsDialog world={world} worldName={w.name.replace('The ', 'the ')} q={quests.data} open={questsOpen} onOpenChange={setQuestsOpen} />
      <AnimatePresence>{digPlot && <DigPanel world={world} w={w} plot={digPlot} pose={() => scene.current?.pose().d ?? null}
        onDug={(depth, cored) => scene.current?.setShaft(digPlot.gx, digPlot.gy, depth, cored)}
        explorerUrl={svgUrl(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 184))}
        onClose={() => { setDigPlot(null); scene.current?.setPaused(false); void near.refetch(); void map.refetch(); void qc.invalidateQueries({ queryKey: questsKey(world) }); }} />}</AnimatePresence>
      <Dialog open={warpOpen} onOpenChange={setWarpOpen} title="Warp" description="Free and instant to anywhere you’ve unlocked or been.">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="warp-list">
          {(s.warps ?? []).map((d) => {
            const ww = d === 'earth' ? null : worldOf(d, s.home_seed, s.home_name);
            const label = d === 'earth' ? 'Earth' : d === `exo:${s.home_seed}` ? (s.home_name ?? 'Home') : (ww?.name ?? d).replace('The ', '').split(' (')[0];
            const here = d === s.location;
            return (
              <button key={d} disabled={here} onClick={() => void warpTo(d === `exo:${s.home_seed}` ? 'home' : d, label)} data-testid={`warp-to-${d}`}
                className={cn('grid justify-items-center gap-1 rounded-2xl p-2 text-[11px] font-semibold', here ? 'bg-ok/15 text-ok' : 'bg-surface-2 hover:bg-surface-3')}>
                <span className="grid h-10 w-10 place-items-center rounded-full text-xl" style={{ background: ww ? `radial-gradient(circle at 35% 35%, ${ww.color}, ${ww.color2})` : 'radial-gradient(circle at 35% 35%, #3EA0DA, #1B4A7A)' }}>{d === 'earth' ? '🌍' : d === `exo:${s.home_seed}` ? '🏡' : ''}</span>
                <span className="w-full truncate text-center">{label}</span>{here && <span className="text-[9px] uppercase">here</span>}
              </button>
            );
          })}
        </div>
      </Dialog>
      <AnimatePresence>{reveal && map.data && <RarityReveal r={rarityOf[reveal.rarity]} games={reveal.games} bonus={map.data.bonus_game} world={w} onClose={() => setReveal(null)} />}</AnimatePresence>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen} title="Name your plot" description="Everyone exploring this world sees it on your flag.">
        <div className="grid gap-3">
          <input className={inputCls} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Crater Cove" data-testid="planet-plot-name" />
          <Button variant="rainbow" loading={busy} onClick={rename}>Save</Button>
        </div>
      </Dialog>
      <Dialog open={settleOpen} onOpenChange={setSettleOpen} title="Settle this world" description="Make it your home world for 1,000 Ink. Your dome goes up by the rocket, it gets a plot map of its own that only you can build on, it shows up for your friends, and you can warp back any time.">
        <div className="grid gap-3">
          <input className={inputCls} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Name your world" data-testid="settle-name" />
          <Button variant="rainbow" loading={busy} disabled={!name.trim()} onClick={settle} data-testid="settle-go"><Home className="h-4 w-4" /> Make it home · 1,000 <ResourceIcon r="ink" className="h-4 w-4" /></Button>
        </div>
      </Dialog>
    </div>
  );
}

type RarityInfo = { id: string; name: string; color: string; mult: number; rank: number };
function RarityBadge({ r }: { r: RarityInfo | undefined }) {
  if (!r) return null;
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ background: `${r.color}33`, color: r.color, boxShadow: `inset 0 0 0 1px ${r.color}88` }} data-testid="cosmic-rarity">{r.name}{r.mult > 1 ? ` ×${r.mult}` : ''}</span>;
}
function PlotCard({ map, cell, plot, high, busy, rows, rarityOf, onClaim, onWalk, onRename, onPlay, onBuild, onVisit }: {
  map: PlanetMap; cell: Cell | null; plot: PlanetPlot | null; high: boolean; busy: boolean; rows: number; rarityOf: Record<string, RarityInfo>;
  onClaim(): void; onWalk(): void; onRename(): void; onPlay(game: string): void; onBuild(): void; onVisit(gx: number, gy: number): void;
}) {
  const card = 'pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-black/65 p-3 text-white shadow-xl backdrop-blur';
  if (!cell) return high ? null : <div className={cn(card, 'text-center text-xs text-white/75')}>The polar wilds — no plots out here. Head toward the equator.</div>;
  const where = <span className="text-[11px] text-white/60">{cellLabel(cell, rows)}</span>;
  const go = <Button size="sm" variant="secondary" onClick={onWalk}><Footprints className="h-4 w-4" /> Go here</Button>;
  if (plot?.mine) return (
    <div className={card} data-testid="planet-plot-mine">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 shrink-0" style={{ color: plot.owner.accent ?? '#FFE36B' }} />
        <div className="min-w-0 flex-1 truncate font-display font-bold">{plot.name || 'Your plot'}</div>
        <RarityBadge r={rarityOf[plot.rarity]} />
        <button onClick={onRename} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Rename plot"><Pencil className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[...map.games, ...((rarityOf[plot.rarity]?.rank ?? 0) >= map.bonus_from ? [map.bonus_game] : [])].map((g) => { const info = PLANET_GAMES[g]; return (
          <button key={g} onClick={() => onPlay(g)} className="flex items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-left hover:bg-white/20" data-testid={`planet-game-${g}`}>
            <span className="text-2xl">{info?.emoji ?? '🎮'}</span><span className="min-w-0 truncate text-sm font-bold">{info?.name ?? g}</span>
          </button>
        ); })}
      </div>
      {(rarityOf[plot.rarity]?.rank ?? 0) < map.bonus_from && PLANET_GAMES[map.bonus_game] && (
        <div className="mt-2 rounded-xl border border-dashed border-white/20 px-2.5 py-1.5 text-[11px] text-white/60">🔒 {PLANET_GAMES[map.bonus_game].emoji} {PLANET_GAMES[map.bonus_game].name} — plots of {map.rarities[map.bonus_from]?.name ?? 'Nebula'} rarity or rarer unlock it</div>
      )}
      {!high && <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={onBuild} data-testid="base-open">🏗️ Build your base{plot.base?.layout.length ? ` · ${plot.base.layout.length} modules` : ''}</Button>}
      {high && <div className="mt-2 flex justify-center">{go}</div>}
      <IfCapped><div className="mt-1.5 text-center text-[10px] text-white/55">Planet Ink today {map.ink_today}/{map.daily_cap}</div></IfCapped>
    </div>
  );
  if (plot) return (
    <div className={cn(card, 'flex items-center gap-2')}>
      <Flag className="h-4 w-4 shrink-0" style={{ color: plot.owner.accent ?? '#fff' }} />
      <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="truncate font-bold">{plot.name || `@${plot.owner.username}’s plot`}</span><RarityBadge r={rarityOf[plot.rarity]} /></div><div className="text-[11px] text-white/60">Claimed by @{plot.owner.username}{plot.base?.layout.length ? ` · 🏗️ base of ${plot.base.layout.length}` : plot.in_base ? ' · part of a bigger base' : ''}{plot.shaft ? ` · ⛏️ ${Math.round(plot.shaft.depth)} m shaft${plot.shaft.cored ? ' to the core 💖' : ''}` : ''}</div></div>
      {!high && (plot.base?.layout.length || plot.in_base) ? (
        <Button size="sm" variant="secondary" onClick={() => onVisit(plot.in_base ? plot.in_base[0] : plot.gx, plot.in_base ? plot.in_base[1] : plot.gy)} data-testid="base-visit-open">🏗️ Visit base</Button>
      ) : high ? go : where}
    </div>
  );
  return (
    <div className={cn(card, 'flex items-center gap-2')} data-testid="planet-plot-free">
      <div className="min-w-0 flex-1"><div className="font-bold">Unclaimed plot</div><div className="text-[11px] text-white/60">{cellLabel(cell, rows)}{map.luck > 0 ? ` · +${Math.round(map.luck * 100)}% rare luck here` : ''}</div></div>
      {high && go}
      {map.landed ? <Button size="sm" variant="rainbow" loading={busy} onClick={onClaim} data-testid="planet-claim"><Flag className="h-4 w-4" /> Claim · {map.price} <ResourceIcon r="ink" className="h-3.5 w-3.5" /></Button>
        : <span className="text-[11px] text-white/60">Land here to buy</span>}
    </div>
  );
}

/** A thumb-stick: drag anywhere in the pad; reports x (right) and y (forward), each -1..1. */
function Stick({ onMove }: { onMove(x: number, y: number): void }) {
  const [k, setK] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const R = 46;
  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / R, y = (e.clientY - (r.top + r.height / 2)) / R;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    setK({ x, y }); onMove(x, -y);
  };
  const end = () => { id.current = null; setK({ x: 0, y: 0 }); onMove(0, 0); };
  return (
    <div className="pointer-events-auto relative h-32 w-32 touch-none rounded-full border border-white/20 bg-black/35 backdrop-blur" data-testid="planet-stick"
      onPointerDown={(e) => { id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
      onPointerMove={(e) => { if (id.current === e.pointerId) at(e); }} onPointerUp={end} onPointerCancel={end}>
      <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-white/40 bg-white/25 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${k.x * R}px), calc(-50% + ${k.y * R}px))` }} />
    </div>
  );
}

/** The roll: a plot's cosmic rarity spins up after you claim it. */
function RarityReveal({ r, games, bonus, world, onClose }: { r: RarityInfo | undefined; games: string[]; bonus: string; world: World; onClose(): void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setShown(true); if ((r?.rank ?? 0) >= 2) confettiCannons(); }, 1400); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return null;
  const unlocked = games.includes(bonus) && PLANET_GAMES[bonus];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onClick={() => shown && onClose()} data-testid="rarity-reveal">
      <div className="grid w-full max-w-xs justify-items-center gap-3 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/60">Plot claimed on {world.name}</div>
        <motion.div className="grid h-40 w-40 place-items-center rounded-full"
          style={{ background: shown ? `radial-gradient(circle, ${r.color} 0%, ${r.color}55 45%, transparent 70%)` : 'radial-gradient(circle, #ffffff33, transparent 70%)' }}
          animate={shown ? { scale: [0.6, 1.15, 1], rotate: 0 } : { rotate: 360 * 3 }} transition={shown ? { duration: 0.6 } : { duration: 1.4, ease: 'easeIn' }}>
          <span className="text-6xl">{shown ? ['✨', '☄️', '🌌', '💫', '🌟', '🕳️'][r.rank] ?? '✨' : '❔'}</span>
        </motion.div>
        {shown ? (
          <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="grid gap-2">
            <div className="font-display text-3xl font-black" style={{ color: r.color }}>{r.name}</div>
            <div className="text-sm text-white/80">{r.mult > 1 ? `Its games pay ×${r.mult} Ink.` : 'A solid start — rarer plots pay more.'}</div>
            {unlocked && <div className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">Bonus game unlocked: {PLANET_GAMES[bonus].emoji} {PLANET_GAMES[bonus].name}</div>}
            <Button variant="rainbow" onClick={onClose} data-testid="reveal-ok">Nice!</Button>
          </motion.div>
        ) : <div className="text-sm text-white/70">Scanning the plot…</div>}
      </div>
    </motion.div>
  );
}
