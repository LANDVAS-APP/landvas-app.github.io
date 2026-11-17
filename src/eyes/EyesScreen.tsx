// Explorer's Eyes (/eyes): drop into your explorer's eyes and stand in the real place it's in. The real streets and
// buildings around you, every plot glowing by rarity, the real sky over you right now (sun, moon and its phase, stars,
// planets, the Milky Way), real mountains on the horizon, the Leviathan coming over the skyline, Primordial beacons in
// their true direction, falling stars and sky treasures to catch, your party walking with you.
// Walk with the stick (forward is where you look), look by dragging or by moving the phone, tap anything.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Camera, ChevronLeft, CloudSun, Gamepad2, Map as MapIcon, Smartphone, Users, X } from 'lucide-react';
import { useParty, usePartyUi } from '../party/party';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type LevState } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { PlotRow } from '../backend/types';
import { explorerNow, useExplorer } from '../explorer/explorer';
import { Joystick, setDriveBearing, useDriveKeys } from '../explorer/Joystick';
import { isPhone } from '../lib/gfx';
import { invalidateGame, useOnboardedMe, useWorld } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { buzz } from '../native/native';
import { ArtIndex } from '../map/artTiles';
import { PlotBlocks } from '../map/plotTiles';
import { mapTheme, streetPalette } from '../map/basemap';
import { PlotPanel } from '../plot/PlotPanel';
import { qk } from '../lib/queries';
const qkPlot = (gx: number, gy: number) => qk.plot(gx, gy) as unknown as readonly unknown[];
import { ClaimCelebration, useCelebration } from '../plot/ClaimCelebration';
import type { RollMoment } from '../roll/RollReveal';
import { LeviathanFight, useLevUi } from '../leviathan/Leviathan';
import { LEV_KEY, fmtDmg, levPos, levRampage, levTiny, useLeviathan } from '../leviathan/useLeviathan';
import { cellCenter, plotMetres } from '../shared/grid';
import { isPrimordial, rarityInfo, rarityTier, setRarities } from '../shared/rarity';
import { toMap } from '../lib/toMap';
import { bearingName, daylight, moonPhaseName, sunPosition } from './astro';
import { bearingDistance, fmtDistance, makeFrame, type Frame } from './geo';
import { buildBuildings, drawGround, fetchTile, loadTerrain, occupancy, realPalette, streetThings, streetsSource, tilesFor, treePoints, type Tile } from './world';
import { createEyes, type Eyes, type Pick, type PlotPlace } from './scene';
import type { BuildSite } from './builds';
import { FirstPersonSelf } from './FirstPersonSelf';
import { FpGrimoire, type Summoned } from './FpGrimoire';
import { MeetNearby } from './MeetNearby';
import './eyes.css';
import { silhouette } from './selfView';
import { hoursFromHere, kmBetween, localDay, localTime, sunTimes, utcOffset, whereabouts, type Whereabouts } from './whereabouts';
import { REALM_META, isRealm, realmRoute } from '../realms/kinds';

const NEAR_HALF = isPhone() ? 520 : 650; // the sharp ground at your feet: this far each way (m)
const FAR_HALF = 2600; // the softer ground of the town around
const PLOT_R = isPhone() ? 210 : 280; // plots drawn this far each way
const REFRAME = 1600; // walked this far from where the world was built: build it again around you

// eye height by what you're riding (the jetpack's is yours to raise and lower)
const EYE: Record<string, number> = { walk: 1.62, bike: 1.74, car: 1.22 };
let jetAlt = 24;

// the camera's bearing, for the compass and the stick (outside React: it changes many times a second)
let heading = 0, headingPitch = 0;
const lookSubs = new Set<() => void>();
const lookStore = { sub: (f: () => void) => { lookSubs.add(f); return () => { lookSubs.delete(f); }; }, get: () => heading };

type Card =
  | { kind: 'sky'; title: string; body: string; emoji: string }
  | { kind: 'beacon'; title: string; body: string; emoji: string; gx: number; gy: number }
  | { kind: 'buddy'; title: string; username: string }
  | { kind: 'lev'; title: string; body: string };

/** what someone in your party is up to, as they'd look to you: on their bike, driving, up on a jetpack, walking… */
const buddyTag = (b: { how: string; traveling: boolean; vehicle?: string | null; trip?: { mode?: string } | null }) =>
  b.how === 'travel' && b.traveling ? (b.trip?.mode === 'plane' ? '✈️ flying' : '🚆 on a train')
    : b.vehicle === 'bike' ? '🚲 riding a bike' : b.vehicle === 'car' ? '🚗 driving' : b.vehicle === 'jet' ? '🚀 up on a jetpack'
    : b.how === 'travel' ? '🧳 travelling' : b.traveling ? '🚶 walking' : '🕹️ exploring';

export default function EyesScreen() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const world = useWorld();
  useEffect(() => setRarities(world.data?.rarities), [world.data?.rarities]);
  const settings = useUi((s) => s.settings);
  const selected = useUi((s) => s.selected);
  const select = useUi((s) => s.select);
  const ex = useExplorer();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [eyes, setEyes] = useState<Eyes | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [steps, setSteps] = useState<{ streets: 'wait' | 'ok' | 'none'; land: 'wait' | 'ok' | 'none' }>({ streets: 'wait', land: 'wait' });
  const [ready, setReady] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [gyro, setGyro] = useState(false);
  const [steer, setSteer] = useState(() => ex.gps !== 'on' && ex.gps !== 'asking');
  const [hint, setHint] = useState(() => !safeStorage('landvas.eyes.hinted', false));
  const [flash, setFlash] = useState(0);
  const start = useRef(explorerNow(ex.state, ex.offset));
  const hasExplorer = !!start.current;

  // ---- the scene ----------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!canvas.current || !start.current) return;
    const s = createEyes({
      canvas: canvas.current,
      pose: () => { const st = useExplorer.getState(); const p = explorerNow(st.state, st.offset); return p ? { lng: p.lng, lat: p.lat } : null; },
      eye: () => { const v = useExplorer.getState().state?.vehicle?.current ?? 'walk'; return v === 'jet' ? jetAlt : EYE[v] ?? 1.62; },
      vehicle: () => (useExplorer.getState().state?.vehicle?.current ?? 'walk') as 'walk' | 'bike' | 'car' | 'jet',
      onPick: (p) => onPick.current(p),
      onLook: (y, p) => { heading = y; headingPitch = p; lookSubs.forEach((f) => f()); },
      onNeedClose: (x, z) => closeAsk.current?.(x, z),
      reduceMotion: !!settings.reduceMotion,
    });
    const f = makeFrame(start.current.lng, start.current.lat);
    s.setFrame(f);
    setFrame(f);
    setEyes(s);
    // walking: up on the stick is wherever you're looking
    setDriveBearing(() => s.look().yaw);
    if (typeof window !== 'undefined') (window as unknown as { __landvasEyes?: Eyes }).__landvasEyes = s;
    return () => {
      setDriveBearing(null);
      s.dispose();
      setEyes(null);
      delete (window as unknown as { __landvasEyes?: Eyes }).__landvasEyes;
    };
  }, [hasExplorer]); // eslint-disable-line react-hooks/exhaustive-deps

  // your hands, your sleeves, what you hold: the explorer you are, in its own art (and its silhouette is your shadow)
  const style = me?.profile.explorer_style;
  const accent = me?.profile.accent_color || '#8B5CFF';
  const selfLook = useMemo(() => ({ style, accent }), [JSON.stringify(style ?? {}), accent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!eyes) return;
    let live = true;
    void silhouette(selfLook).then((c) => { if (live) eyes.setShadowImage(c); });
    return () => { live = false; };
  }, [eyes, selfLook]);
  // the jetpack: hold ▲ / ▼ to rise and sink (2–80 m)
  const vehicle = ex.state?.vehicle?.current ?? 'walk';
  const [alt, setAlt] = useState(jetAlt);
  const climb = useRef<number | null>(null);
  const hold = (dir: 1 | -1) => {
    const stop = () => { if (climb.current) cancelAnimationFrame(climb.current); climb.current = null; window.removeEventListener('pointerup', stop); };
    let last = performance.now();
    const step = (now: number) => { jetAlt = Math.max(2, Math.min(80, jetAlt + dir * ((now - last) / 1000) * 9)); last = now; setAlt(Math.round(jetAlt)); climb.current = requestAnimationFrame(step); };
    stop(); climb.current = requestAnimationFrame(step);
    window.addEventListener('pointerup', stop);
  };
  useEffect(() => () => { if (climb.current) cancelAnimationFrame(climb.current); }, []);

  // your party (up to 10 explore with you, standing in the view as their own explorers); invite from right here
  const party = useParty();
  const partySize = party.data?.group?.members.length ?? 0;

  // the place you've walked up to (a plot made into an arcade, a farm, a house…), and going in
  const [place, setPlace] = useState<BuildSite | null>(null);
  useEffect(() => {
    if (!eyes) return;
    const t = setInterval(() => { const p = eyes.placeHere(); setPlace((old) => (old?.key === p?.key ? old : p)); }, 350);
    return () => clearInterval(t);
  }, [eyes]);
  const [going, setGoing] = useState<{ key: string; fade: boolean } | null>(null);
  const enterPlace = async (s: BuildSite) => {
    if (!eyes || going) return;
    if (useUi.getState().settings?.haptics) buzz('light');
    setGoing({ key: s.key, fade: false });
    // where it leads (looked up while you knock)
    const route = (async (): Promise<string | null> => {
      try {
        if (s.kind === 'home' || s.kind === 'landlord') return s.owner ? `/u/${s.owner}/home` : null;
        if (s.family === 'arcade') { const a = await api.arcadeForPlot(s.gx, s.gy); if (a) return `/arcade/${a.arcade_id}`; }
        if (s.tier === 0 && s.family === 'farm') { const f = await api.farmForPlot(s.gx, s.gy); if (f) return `/farm/${f.farm_id}`; }
        if (s.tier === 0 && s.family === 'business') { const b = await api.bizForPlot(s.gx, s.gy); if (b) return `/business/${b.business_id}`; }
        if (s.tier === 0 && s.family === 'habitat') { const h = await api.habitatForPlot(s.gx, s.gy); if (h) return `/habitat/${h.habitat_id}`; }
        if (s.kind !== 'train' && s.kind !== 'plane') { const r = await api.realmForPlot(s.gx, s.gy); if (r) return realmRoute(r.realm_id); }
      } catch (e) { toast.error(toGameError(e).message); }
      return null;
    })();
    // knock (the door shakes, it creaks open) or open the gate, then walk through
    await new Promise((r) => setTimeout(r, eyes.knock(s.key)));
    const to = await route;
    if (!to) {
      // nothing to walk into (a station, an airfield): its plot's card has what it offers
      setGoing(null);
      select({ gx: s.gx, gy: s.gy });
      return;
    }
    const ms = eyes.walkIn(s.key);
    setTimeout(() => setGoing((g) => (g ? { ...g, fade: true } : g)), Math.max(0, ms - 450));
    await new Promise((r) => setTimeout(r, ms + 120));
    // inside, still in first person (leave first person and you're in its usual view)
    nav(`${to}${to.includes('?') ? '&' : '?'}fp=1`);
  };

  // the plot you tapped: its card floats over it in the world, its outline lights up, and a painting lifts up to you
  const selQ = useQuery({ queryKey: selected ? qkPlot(selected.gx, selected.gy) : ['plot', 'none'], queryFn: () => api.plotDetails(selected!.gx, selected!.gy), enabled: !!selected && !!eyes });
  useEffect(() => {
    if (!eyes) return;
    if (!selected) { eyes.setSelected(null); eyes.dropArt(); return; }
    const row = rowsRef.current.find((r) => r[0] === selected.gx && r[1] === selected.gy);
    eyes.setSelected({ ...selected, card: plotCard(selQ.data ?? null, row ?? null) });
  }, [eyes, selected, selQ.data]);
  useEffect(() => { if (eyes && selected) eyes.liftArt(selected.gx, selected.gy); }, [eyes, selected]);

  // WASD / arrows walk too (the stick opens if it's closed)
  useDriveKeys(!!me && hasExplorer, () => setSteer(true));

  // walked far from where the world was built: build it again around you
  useEffect(() => {
    if (!eyes || !frame) return;
    const t = setInterval(() => {
      const st = useExplorer.getState();
      const p = explorerNow(st.state, st.offset);
      if (!p) return;
      // (riding a train or a plane: the streets fly by too fast to build; the land is rebuilt every few km instead)
      const fast = Number(st.state?.speed_mps ?? 0) > 30 && !!p.traveling;
      if (bearingDistance(frame.lng0, frame.lat0, p.lng, p.lat).m > (fast ? 12_000 : REFRAME)) {
        const f = makeFrame(p.lng, p.lat);
        eyes.setFrame(f);
        setFrame(f);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [eyes, frame]);

  // the sharpest ground right round you is painted again as you move (the scene asks)
  const closeAsk = useRef<((x: number, z: number) => void) | null>(null);

  // ---- the real place: streets, buildings, trees, land out to the horizon ---------------------------------------------
  useEffect(() => {
    if (!eyes || !frame) return;
    let live = true;
    setSteps({ streets: 'wait', land: 'wait' });
    const sun = sunPosition(Date.now(), frame.lat0, frame.lng0);
    const night = daylight(sun.alt) < 0.35;
    const neon = mapTheme() === 'neon';
    const real = !neon;
    const pal = real ? realPalette(streetPalette(night)) : streetPalette(night);
    const glow = neon && night ? 0.55 : 0;
    const colors = { land: pal.land, water: pal.water, rock: pal.rock, snow: '#F4F8FF', wood: pal.wood, neon };
    // the land first (it's the backdrop for everything)
    eyes.setTerrain(null, colors);
    void loadTerrain(frame, { extent: 90_000, n: isPhone() ? 130 : 190, z: 9, flatten: [1700, 4600] }).then((t) => {
      if (!live) return;
      if (t) eyes.setTerrain(t, colors);
      setSteps((s) => ({ ...s, land: t ? 'ok' : 'none' }));
    });
    const st0 = useExplorer.getState();
    if (Number(st0.state?.speed_mps ?? 0) > 30 && explorerNow(st0.state, st0.offset)?.traveling) { setSteps((s) => ({ ...s, streets: 'none' })); return () => { live = false; }; }
    void (async () => {
      const src = await streetsSource();
      const nearR = { x0: -NEAR_HALF, z0: -NEAR_HALF, size: NEAR_HALF * 2 };
      const farR = { x0: -FAR_HALF, z0: -FAR_HALF, size: FAR_HALF * 2 };
      if (!src) {
        if (!live) return;
        eyes.setGround({ canvas: drawGround(frame, [], nearR, 256, pal), region: nearR, glow }, null);
        setSteps((s) => ({ ...s, streets: 'none' }));
        return;
      }
      const get = (z: number, r: typeof nearR) => Promise.all(tilesFor(frame, z, r).map((t) => fetchTile(src, z, t.x, t.y))).then((l) => l.filter((x): x is Tile => !!x));
      const near = await get(Math.min(14, src.maxzoom), nearR);
      if (!live) return;
      const big = isPhone() ? 1536 : 2048;
      eyes.setGround({ canvas: drawGround(frame, near, nearR, big, pal, { detail: true, real }), region: nearR, glow }, null);
      // the sharpest ground, right round you: kerbs, road markings, zebra crossings
      const CLOSE = isPhone() ? 150 : 200;
      closeAsk.current = (x, z) => {
        if (!live) return;
        const r = { x0: Math.round(x - CLOSE / 2), z0: Math.round(z - CLOSE / 2), size: CLOSE };
        eyes.setClose({ canvas: drawGround(frame, near, r, isPhone() ? 1536 : 2048, pal, { detail: true, real, close: true }), region: r });
      };
      const at0 = eyes.debug().pos as number[] | undefined;
      closeAsk.current(at0?.[0] ?? 0, at0?.[2] ?? 0);
      // what the ground is, metre by metre (trees and lamps go on open ground, grass grows on lawns)
      const occ = occupancy(frame, near, nearR, isPhone() ? 0.9 : 0.75);
      const bld = buildBuildings(frame, near, pal, { near: NEAR_HALF * 1.1, far: NEAR_HALF * 1.1, skylineMin: 999, budget: isPhone() ? 70_000 : 160_000, real });
      eyes.setBuildings(bld, night);
      const st = streetThings(frame, near, { radius: isPhone() ? 300 : 420, ground: occ, max: isPhone() ? 260 : 520 });
      const trees = treePoints(frame, near, { radius: NEAR_HALF, max: isPhone() ? 700 : 1800, free: (x, z) => { const g = occ(x, z); return g === 0 || g === 1; } });
      eyes.setTrees([...st.trees, ...trees], frame.lat0);
      eyes.setStreet(st, bld.roofBits);
      eyes.setOccupancy(occ);
      setSteps((s) => ({ ...s, streets: near.length ? 'ok' : 'none' }));
      // further out: the town's ground on the land, and its tall buildings on the skyline
      const mid = await get(Math.min(13, src.maxzoom), farR);
      if (!live) return;
      eyes.setGround({ canvas: drawGround(frame, near, nearR, big, pal, { detail: true, real }), region: nearR, glow },
        mid.length ? { canvas: drawGround(frame, mid, farR, isPhone() ? 1024 : 2048, pal, { real }), region: farR, glow: glow * 0.8 } : null);
      if (mid.length) {
        const all = buildBuildings(frame, [...near, ...mid], pal, { near: NEAR_HALF * 1.05, far: 1700, skylineMin: 24, budget: isPhone() ? 90_000 : 220_000, real });
        eyes.setBuildings(all, night);
        eyes.setStreet(st, all.roofBits);
      }
    })().catch(() => setSteps((s) => ({ ...s, streets: 'none' })));
    return () => { live = false; closeAsk.current = null; };
  }, [eyes, frame]);

  useEffect(() => { if (steps.streets !== 'wait') { const t = setTimeout(() => setReady(true), 350); return () => clearTimeout(t); } }, [steps.streets]);
  useEffect(() => { const t = setTimeout(() => setReady(true), 6000); return () => clearTimeout(t); }, []);

  // ---- plots around you -----------------------------------------------------------------------------------------------
  const blocks = useMemo(() => new PlotBlocks(), []);
  const art = useMemo(() => new ArtIndex(), []);
  const plotsAt = useRef<{ gx: number; gy: number; at: number } | null>(null);
  const rowsRef = useRef<PlotRow[]>([]);
  const reload = useRef<((force: boolean) => void) | null>(null);
  useEffect(() => {
    if (!eyes || !frame) return;
    let live = true;
    const artDone = new Set<string>();
    const load = async (force = false) => {
      if (document.hidden && !force) return;
      const st = useExplorer.getState();
      const p = explorerNow(st.state, st.offset);
      if (!p) return;
      const c = cellAtLngLat(p.lng, p.lat);
      const prev = plotsAt.current;
      if (!force && prev && Math.max(Math.abs(prev.gx - c.gx), Math.abs(prev.gy - c.gy)) < 8 && Date.now() - prev.at < 25_000) return;
      plotsAt.current = { ...c, at: Date.now() };
      const n = Math.ceil(PLOT_R / plotMetres(p.lat));
      if (force) blocks.reset();
      let rows: PlotRow[] = [];
      try { rows = await blocks.rowsIn(c.gx - n, c.gy - n, c.gx + n, c.gy + n, 16); } catch { return; }
      if (!live) return;
      rowsRef.current = rows;
      const list: PlotPlace[] = rows.map((r) => {
        const info = rarityInfo(r[9]);
        return { gx: r[0], gy: r[1], rarity: r[9], color: info.color, glow: info.glow, tier: rarityTier(r[9]), mine: !!r[4], group: r[5], shiny: !!r[12], emoji: info.emoji ?? null, name: r[10] ?? null, kind: r[11] ?? 'canvas', owner: r[7] };
      });
      eyes.setPlots(list);
      // the art on the nearest plots that have some (and the drawings on your floating cards)
      const withArt = rows.filter((r) => r[6]).map((r) => ({ r, d: Math.hypot(r[0] - c.gx, r[1] - c.gy) })).sort((a, b) => a.d - b.d).slice(0, isPhone() ? 60 : 140);
      const bitmaps = new Map<string, ImageBitmap>();
      await Promise.all(withArt.map(async ({ r }) => {
        const k = `${r[0]}_${r[1]}`;
        try {
          const rev = await art.rev(22, r[0], r[1]);
          if (!rev) return;
          const buf = await getBackend().artTile(22, r[0], r[1], rev);
          if (!buf || !live) return;
          const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
          bitmaps.set(k, bmp);
          if (!artDone.has(`${k}:${rev}`) || force) { artDone.add(`${k}:${rev}`); eyes.setArt(r[0], r[1], bmp); }
        } catch { /* no art there after all */ }
      }));
      if (!live) return;
      // your own plots float a card over them
      const mine = rows.filter((r) => r[4]).map((r) => ({ r, d: Math.hypot(r[0] - c.gx, r[1] - c.gy) })).sort((a, b) => a.d - b.d).slice(0, 16);
      eyes.setMine(mine.map(({ r }) => ({ gx: r[0], gy: r[1], card: drawCard(r, bitmaps.get(`${r[0]}_${r[1]}`) ?? null) })));
    };
    reload.current = (force) => void load(force);
    void load(true);
    const t = setInterval(() => void load(), 3000);
    const full = setInterval(() => void load(true), 45_000);
    return () => { live = false; reload.current = null; clearInterval(t); clearInterval(full); };
  }, [eyes, frame, blocks, art]);
  // a plot's panel closed (you may have claimed it, painted it or let it go): draw the plots again
  const hadPanel = useRef(false);
  useEffect(() => {
    if (selected) { hadPanel.current = true; return; }
    if (hadPanel.current) { hadPanel.current = false; reload.current?.(true); }
  }, [selected]);

  // ---- the Leviathan --------------------------------------------------------------------------------------------------
  const levQ = useLeviathan(true);
  const lev = levQ.data?.lev ?? null;
  useEffect(() => {
    if (!eyes) return;
    if (!lev || !lev.path || lev.hidden) { eyes.setLeviathan(null); return; }
    const put = () => {
      if (document.hidden) return;
      const p = levPos(lev);
      eyes.setLeviathan({ lng: p.lng, lat: p.lat, heading: p.heading, walking: !p.paused && lev.status !== 'warning',
        look: { status: lev.status, paused: p.paused, tiny: levTiny(lev), rampage: levRampage(lev) } });
    };
    put();
    const t = setInterval(put, 120);
    return () => clearInterval(t);
  }, [eyes, lev]);
  const bombs = useRef(0), pending = useRef(0), sending = useRef(false);
  const [bombsLeft, setBombsLeft] = useState<number | null>(null);
  useEffect(() => { const b = levQ.data?.me?.bombs; if (b != null) { bombs.current = b - pending.current; setBombsLeft(bombs.current); } }, [levQ.data?.me?.bombs]);
  const flushBombs = async () => {
    if (sending.current || pending.current < 1) return;
    sending.current = true;
    const n = Math.min(10, pending.current);
    pending.current -= n;
    try {
      const r = await api.leviathanHit('bomb', n);
      qc.setQueryData([...LEV_KEY, !!me], r as LevState);
      invalidateGame(qc);
      eyes?.damage(r.missed ? `${r.missed} missed` : `−${fmtDmg(r.dmg)}`);
      if (r.fell) { buzz('success'); toast.success('The Leviathan has fallen! 🐉', { description: 'Your share of the loot is on its way.' }); }
    } catch (e) { pending.current = 0; toast.error(toGameError(e).message); void levQ.refetch(); }
    finally { sending.current = false; if (pending.current > 0) setTimeout(() => void flushBombs(), 300); }
  };
  useEffect(() => { const t = setInterval(() => void flushBombs(), 700); return () => clearInterval(t); }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- beacons, falling stars, the Hot Zone, your party -------------------------------------------------------------
  const prim = useQuery({ queryKey: ['primordials-world'], queryFn: api.primordialsWorld, staleTime: 120_000, enabled: !!me });
  const beaconList = useMemo(() => (prim.data?.plots ?? []).map((p) => {
    const [lng, lat] = cellCenter(p.gx, p.gy);
    const info = rarityInfo(p.rarity);
    return { id: `${p.gx}_${p.gy}`, lng, lat, color: info.glow || info.color, emoji: info.emoji ?? '🌌', name: info.name, owner: p.owner_name, gx: p.gx, gy: p.gy };
  }), [prim.data]);
  useEffect(() => {
    if (!eyes || !frame) return;
    // (ones right here already stand as their own plot)
    eyes.setBeacons(beaconList.filter((b) => bearingDistance(frame.lng0, frame.lat0, b.lng, b.lat).m > PLOT_R * 1.2));
  }, [eyes, frame, beaconList]);

  const box = useMemo(() => {
    if (!frame) return null;
    const c = cellAtLngLat(frame.lng0, frame.lat0);
    const n = Math.ceil(2200 / plotMetres(frame.lat0));
    return { min_gx: c.gx - n, min_gy: c.gy - n, max_gx: c.gx + n, max_gy: c.gy + n };
  }, [frame]);
  const rx = useQuery({ queryKey: ['eyes-rx', box], queryFn: () => api.rarityMap(box!), enabled: !!box && !!me, staleTime: 20_000, refetchInterval: 30_000 });
  useEffect(() => { eyes?.setFallingStars((rx.data?.stars ?? []).filter((s) => s.in > 0).map((s) => ({ id: s.id, gx: s.gx, gy: s.gy }))); }, [eyes, rx.data]);

  const hotQ = useQuery({ queryKey: ['hot-zone'], queryFn: api.hotZone, staleTime: 5 * 60_000, enabled: !!me });
  const hotZone = useMemo(() => {
    const z = hotQ.data?.today;
    if (!z) return null;
    const [lng, lat] = cellCenter(z.gx, z.gy);
    return { lng, lat, radiusM: z.radius * plotMetres(lat), name: z.name };
  }, [hotQ.data]);
  useEffect(() => { eyes?.setHotZone(hotZone); }, [eyes, hotZone]);

  // ---- where you are: arriving somewhere new (a new city, after a trip), its name, its country, its local time ---------
  const [where, setWhere] = useState<(Whereabouts & { lng: number; lat: number }) | null>(null);
  const [arrived, setArrived] = useState(0);
  const [showWhere, setShowWhere] = useState(false);
  useEffect(() => { if (arrived) setShowWhere(true); }, [arrived]);
  const lastWhere = useRef<{ lng: number; lat: number } | null>(null);
  useEffect(() => {
    if (!frame) return;
    const l = lastWhere.current;
    if (l && kmBetween(l.lng, l.lat, frame.lng0, frame.lat0) < 12) return;
    lastWhere.current = { lng: frame.lng0, lat: frame.lat0 };
    let live = true;
    void whereabouts(frame.lng0, frame.lat0).then((w) => { if (live) { setWhere({ ...w, lng: frame.lng0, lat: frame.lat0 }); setArrived((n) => n + 1); } });
    return () => { live = false; };
  }, [frame]);

  const buddiesQ = useQuery({
    queryKey: ['eyes-buddies', frame?.lng0, frame?.lat0],
    queryFn: () => api.mapExplorers({ w: frame!.lng0 - 0.03, s: frame!.lat0 - 0.03, e: frame!.lng0 + 0.03, n: frame!.lat0 + 0.03 }),
    enabled: !!frame && !!me, refetchInterval: 8000, staleTime: 5000,
  });
  useEffect(() => {
    eyes?.setBuddies((buddiesQ.data?.items ?? []).filter((b) => b.id !== me?.profile.id).slice(0, 10).map((b) => ({ id: b.id, lng: b.lng, lat: b.lat, name: b.display_name || b.username, color: b.accent_color || '#8B6BFF', style: b.explorer_style ?? null, vehicle: b.vehicle, tag: buddyTag(b) })));
  }, [eyes, buddiesQ.data, me?.profile.id]);

  // ---- sky treasures ------------------------------------------------------------------------------------------------
  const skyQ = useQuery({ queryKey: ['eyes-sky'], queryFn: api.eyesSky, enabled: !!me, refetchInterval: 60_000, staleTime: 20_000 });
  const skyData = skyQ.data;
  useEffect(() => {
    if (!skyData?.next_at) return;
    const ms = Date.parse(skyData.next_at) - Date.now() + 1500;
    if (ms <= 0 || ms > 3600_000) return;
    const t = setTimeout(() => void skyQ.refetch(), ms);
    return () => clearTimeout(t);
  }, [skyData?.next_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const [caught, setCaught] = useState<Set<string>>(() => new Set());
  // balloons by day, lanterns at dusk, wishing stars at night (by the real sun where you are)
  const [dropKind, setDropKind] = useState<'balloon' | 'lantern' | 'meteor'>('balloon');
  useEffect(() => {
    if (!eyes) return;
    const k = () => { const day = eyes.sky().day; setDropKind(day > 0.6 ? 'balloon' : day > 0.12 ? 'lantern' : 'meteor'); };
    const t0 = setTimeout(k, 300);
    const t = setInterval(k, 5000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [eyes]);
  useEffect(() => {
    if (!eyes || !skyData?.enabled) { eyes?.setDrops([]); return; }
    eyes.setDrops((skyData.drops ?? []).filter((d) => !caught.has(`${skyData.win}:${d.i}`)).map((d) => ({ id: `${skyData.win}:${d.i}:${dropKind}`, kind: dropKind, seed: d.seed })));
  }, [eyes, skyData, caught, dropKind]);

  // ---- taps ---------------------------------------------------------------------------------------------------------
  // ---- the Grimoire: pulled out and held open; an enchantment summoned in front of you ----------------------------------
  const [book, setBook] = useState(false);
  const [summoned, setSummoned] = useState<Summoned | null>(null);
  const [enchPage, setEnchPage] = useState(0);
  const onPick = useRef<(p: Pick | null) => void>(() => {});
  onPick.current = (p) => {
    if (hint) { setHint(false); saveStorage('landvas.eyes.hinted', true); }
    if (!p) { setCard(null); return; }
    const feel = (k: 'light' | 'medium' | 'success' = 'light') => { if (settings.haptics) buzz(k); };
    if (p.kind === 'cell') {
      if (p.dist > 500) { toast('That’s too far to make out', { description: 'Walk closer to open that plot.' }); return; }
      feel(); setCard(null); select({ gx: p.gx, gy: p.gy });
      return;
    }
    if (p.kind === 'lev') {
      if (!lev) return;
      if (lev.status === 'warning') { setCard({ kind: 'lev', title: 'It’s still rising…', body: 'Get your ink bombs ready.' }); return; }
      if (bombs.current < 1) { setCard({ kind: 'lev', title: 'Out of ink bombs', body: 'One comes back every minute. Your enchantments can hit it too — open the fight.' }); return; }
      feel('medium');
      bombs.current -= 1; setBombsLeft(bombs.current);
      eyes?.throwAtLev(() => { pending.current += 1; });
      return;
    }
    if (p.kind === 'drop') {
      const [win, i] = p.id.split(':').map(Number);
      feel('success');
      eyes?.burstAtDrop(p.id);
      setCaught((s) => new Set(s).add(`${win}:${i}`));
      void api.eyesCatch(win, i).then((r) => {
        invalidateGame(qc);
        const what = r.ticket ? `a ${rarityInfo(r.ticket).name}+ roll ticket! 🎟️` : r.luck ? `${r.luck} Luck 🍀` : `${r.ink ?? 0} Ink`;
        eyes?.floatAt({ drop: `${win}:${i}` }, r.ticket ? '🎟️ Ticket!' : r.luck ? `+${r.luck} 🍀` : `+${r.ink ?? 0} Ink`);
        toast.success(`Caught it — ${what}`, { description: `${r.today}/${r.cap} sky treasures today` });
        void skyQ.refetch();
        if (r.ticket) void qc.invalidateQueries({ queryKey: ['tickets'] });
      }).catch((e) => {
        const err = toGameError(e);
        toast(err.code === 'caught_enough' ? 'That’s all the sky has for you today' : err.code === 'gone' ? 'It drifted away…' : err.message);
        void skyQ.refetch();
      });
      return;
    }
    if (p.kind === 'star') {
      feel('success');
      eyes?.burstAtStar(p.id);
      void api.rarityCatch(p.id).then((r) => {
        invalidateGame(qc);
        eyes?.floatAt({ star: p.id }, r.golden ? '✨ Golden Hour' : r.luck ? `+${r.luck} 🍀` : `+${r.ink ?? 0} Ink`);
        toast.success(`You caught a falling star ⭐`, { description: r.golden ? 'A Golden Hour: your next wins pay double!' : r.luck ? `+${r.luck} Luck` : `+${r.ink ?? 0} Ink` });
        void rx.refetch();
      }).catch((e) => { const err = toGameError(e); toast(err.code === 'caught_enough' ? 'You’ve caught all you can from this shower' : err.code === 'gone' ? 'Someone caught it first!' : err.message); void rx.refetch(); });
      return;
    }
    if (p.kind === 'beacon') {
      const b = beaconList.find((x) => x.id === p.id);
      if (!b || !frame) return;
      const here = explorerNow(ex.state, ex.offset) ?? { lng: frame.lng0, lat: frame.lat0 };
      const bd = bearingDistance(here.lng, here.lat, b.lng, b.lat);
      feel();
      setCard({ kind: 'beacon', emoji: b.emoji, title: b.name, body: `A Primordial ${fmtDistance(bd.m)} ${bearingName(bd.bearing)} of you${b.owner ? ` · held by ${b.owner}` : ''}`, gx: b.gx, gy: b.gy });
      return;
    }
    if (p.kind === 'manifest') { feel(); eyes?.manifestFlare(); setEnchPage((n) => n + 1); return; }
    if (p.kind === 'buddy') {
      const b = buddiesQ.data?.items.find((x) => x.id === p.id);
      if (b) setCard({ kind: 'buddy', title: b.display_name || b.username, username: b.username });
      return;
    }
    if (p.kind === 'sky') {
      feel();
      const sky = eyes?.sky();
      if (p.what === 'moon' && sky) setCard({ kind: 'sky', emoji: '🌙', title: 'The Moon', body: `${moonPhaseName(sky.moonPhase)} · ${Math.round(sky.moonFrac * 100)}% lit. It's right there in the real sky too.` });
      else if (p.what === 'sun') setCard({ kind: 'sky', emoji: '☀️', title: 'The Sun', body: 'Exactly where it is in your sky right now. (Don’t look at the real one.)' });
      else if (p.what === 'planet') setCard({ kind: 'sky', emoji: '🪐', title: p.name, body: `A planet, not a star: it doesn't twinkle. Look up tonight and it's there.` });
      else setCard({ kind: 'sky', emoji: '✨', title: p.name, body: `${p.group ? `Part of ${p.group}. ` : ''}${p.ly ? `About ${p.ly.toLocaleString()} light-years away: the light you're seeing left it ${p.ly < 2000 ? `around ${Math.round(new Date().getFullYear() - p.ly)}` : `${p.ly.toLocaleString()} years ago`}.` : ''}` });
    }
  };

  // ---- the phone as a window --------------------------------------------------------------------------------------------
  const canGyro = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && isPhone();
  const toggleGyro = async () => {
    if (!eyes) return;
    if (gyro) { eyes.setGyro(false); setGyro(false); return; }
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try { if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') { toast('Motion access was turned down', { description: 'Drag to look around instead.' }); return; } }
    catch { /* not a phone that asks */ }
    eyes.setGyro(true);
    setGyro(true);
    toast('Move your phone to look around', { description: 'Drag sideways to turn as well.' });
  };

  const glide = (yaw: number | null, pitch: number) => {
    if (!eyes) return;
    const a = eyes.look();
    const y0 = a.yaw, p0 = a.pitch;
    let dy = (yaw ?? y0) - y0;
    dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 900), e = 1 - (1 - k) ** 3;
      eyes.lookAt(y0 + dy * e, p0 + (pitch - p0) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // a plot you bought here rolls right there on the ground in front of you: turn to it, and let the world play along
  // with the roll (the drop, the ink column in the drum's colours, the beam when it lands)
  const rolling = useCelebration((s) => s.c);
  useEffect(() => {
    if (!eyes) return;
    if (!rolling) { eyes.rollAt(null); return; }
    const look = eyes.rollAt({ gx: rolling.gx, gy: rolling.gy });
    // (look a little below it: the plot stands in the upper part of the view, above the card)
    if (look) glide(look.yaw, look.pitch - 0.27);
    const on = (e: Event) => eyes.rollMoment((e as CustomEvent<RollMoment>).detail);
    addEventListener('lv-roll', on);
    return () => removeEventListener('lv-roll', on);
  }, [eyes, rolling]); // eslint-disable-line react-hooks/exhaustive-deps
  // first look: toward the Leviathan if it's out there, else the nearest Primordial, else the moon at night
  const firstLook = useRef(false);
  useEffect(() => {
    if (!eyes || !frame || firstLook.current) return;
    if (levQ.isLoading || prim.isLoading) return;
    firstLook.current = true;
    if (lev?.path && !lev.hidden) {
      const p = levPos(lev);
      const bd = bearingDistance(frame.lng0, frame.lat0, p.lng, p.lat);
      if (bd.m < 120_000) { eyes.lookAt(bd.bearing, 0.08); return; }
    }
    const near = beaconList.map((b) => ({ b, bd: bearingDistance(frame.lng0, frame.lat0, b.lng, b.lat) })).filter((x) => x.bd.m < 200_000 && x.bd.m > PLOT_R).sort((a, b) => a.bd.m - b.bd.m)[0];
    if (near) { eyes.lookAt(near.bd.bearing, 0.1); return; }
    const sky = eyes.sky();
    if (sky.day < 0.3 && sky.moonAlt > 0.1) eyes.lookAt(sky.moonAz, Math.min(0.6, sky.moonAlt * 0.6));
  }, [eyes, frame, levQ.isLoading, prim.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const snap = async () => {
    if (!eyes) return;
    setFlash((f) => f + 1);
    if (settings.haptics) buzz('light');
    const blob = await eyes.snapshot();
    if (!blob) { toast.error('Couldn’t take the picture'); return; }
    const file = new File([blob], `landvas-eyes-${Date.now()}.jpg`, { type: 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Through my explorer’s eyes — LANDVAS' }); return; }
    } catch (e) { if ((e as Error)?.name === 'AbortError') return; }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast.success('Saved your picture 📸');
  };

  const back = () => { if (history.length > 1) nav(-1); else nav('/world'); };

  // ---- what's on screen -----------------------------------------------------------------------------------------------
  if (!hasExplorer) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#070B1C] p-6 text-center text-white" data-testid="eyes-no-explorer">
        <div className="grid max-w-xs gap-3">
          <div className="text-5xl">👁️</div>
          <div className="font-display text-xl font-black">Your explorer isn’t out yet</div>
          <p className="text-sm text-white/70">Turn on GPS or put your explorer on the map, then step into its eyes.</p>
          <button className="lv-btn on h-11" onClick={() => nav('/world')}>Go to the map</button>
        </div>
      </div>
    );
  }
  const levDist = lev?.path && !lev.hidden && frame ? (() => { const p = levPos(lev); const here = explorerNow(ex.state, ex.offset) ?? { lng: frame.lng0, lat: frame.lat0 }; return bearingDistance(here.lng, here.lat, p.lng, p.lat); })() : null;
  const markers: { at: number; emoji: string; label: string; key: string }[] = [];
  if (levDist) markers.push({ key: 'lev', at: levDist.bearing, emoji: '🐉', label: fmtDistance(levDist.m) });
  if (hotZone && frame) { const bd = bearingDistance(frame.lng0, frame.lat0, hotZone.lng, hotZone.lat); if (bd.m > hotZone.radiusM && bd.m < 400_000) markers.push({ key: 'hot', at: bd.bearing, emoji: '🔥', label: fmtDistance(bd.m) }); }
  if (frame) beaconList.map((b) => ({ b, bd: bearingDistance(frame.lng0, frame.lat0, b.lng, b.lat) })).filter((x) => x.bd.m > PLOT_R && x.bd.m < 1_500_000).sort((a, b) => a.bd.m - b.bd.m).slice(0, 4)
    .forEach(({ b, bd }) => markers.push({ key: b.id, at: bd.bearing, emoji: b.emoji, label: fmtDistance(bd.m) }));
  const inHot = !!hotZone && !!frame && bearingDistance(frame.lng0, frame.lat0, hotZone.lng, hotZone.lat).m < hotZone.radiusM;
  const left = skyData?.enabled ? (skyData.drops ?? []).filter((d) => !caught.has(`${skyData.win}:${d.i}`)).length : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070B1C] text-white select-none" data-testid="eyes">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" data-testid="eyes-canvas" />
      {inHot && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,122,61,0.28),transparent_60%)]" />}
      {/* the opening: the world fades in through an iris */}
      <AnimatePresence>
        {!ready && (
          <motion.div key="loading" className="absolute inset-0 z-30 grid place-items-center bg-[#070B1C]" exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: 0.7 }} data-testid="eyes-loading">
            <div className="grid justify-items-center gap-3 text-center">
              <motion.div className="text-6xl" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>👁️</motion.div>
              <div className="font-display text-lg font-black">Opening your explorer’s eyes…</div>
              <div className="grid gap-1 text-xs text-white/60">
                <span>{steps.streets === 'wait' ? '⏳' : steps.streets === 'ok' ? '✅' : '➖'} Streets and buildings</span>
                <span>{steps.land === 'wait' ? '⏳' : steps.land === 'ok' ? '✅' : '➖'} The land to the horizon</span>
                <span>✅ The sky right now</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{flash > 0 && <motion.div key={flash} className="pointer-events-none absolute inset-0 z-40 bg-white" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.45 }} />}</AnimatePresence>

      {/* you: your hands, what you hold, your seat (in your explorer's own art) */}
      {hasExplorer && <FirstPersonSelf eyes={eyes} look={selfLook} vehicle={vehicle as 'walk' | 'bike' | 'car' | 'jet'} hidden={!!going?.fade || book} />}
      {/* your Grimoire, held open; what you've summoned from it */}
      {me && <FpGrimoire eyes={eyes} look={selfLook} open={book} onClose={() => setBook(false)} summoned={summoned} setSummoned={setSummoned} openPage={enchPage} />}
      {/* the middle of your view */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white/25" />

      {/* top: back, the compass, the sky */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top,0px))]">
        <div className="flex w-full items-center gap-2">
          <button className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white shadow-lg" onClick={back} aria-label="Back" data-testid="eyes-back"><ChevronLeft className="h-5 w-5" /></button>
          <Compass markers={markers} sky={eyes} />
          <SkyChip eyes={eyes} zone={where?.zone ?? null} onClick={() => setArrived((n) => n + 1)} />
        </div>
        {levDist && levDist.m < 120_000 && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-[#1A0B3D]/80 px-3 py-1 text-[12px] font-bold shadow-lg" data-testid="eyes-lev-chip">
            <span>🐉 Leviathan {fmtDistance(levDist.m)} {bearingName(levDist.bearing)}</span>
            {bombsLeft != null && <span className="text-[#FFC6F3]">💣 {Math.max(0, bombsLeft)}</span>}
            <button className="rounded-full bg-white/15 px-2 py-0.5 text-[11px]" onClick={() => glide(levDist.bearing, 0.12)} data-testid="eyes-face-lev">Face it</button>
          </div>
        )}
        {inHot && (
          <div className="lv-eyes-hotchip flex items-center gap-1.5 rounded-full bg-[linear-gradient(90deg,#FF3D3D,#FF8A1F)] px-3 py-1 text-[12px] font-black text-white shadow-[0_0_24px_rgba(255,106,31,0.55)]" data-testid="eyes-hot-chip">
            🔥 You’re in the Hot Zone{hotZone?.name ? ` · ${hotZone.name}` : ''}
          </div>
        )}
      </div>

      {/* arriving somewhere new: where you are, and the time there */}
      <AnimatePresence>{where && showWhere && <Arrival key={arrived} w={where} n={arrived} hot={inHot ? hotZone?.name ?? 'Hot Zone' : null} onClose={() => setShowWhere(false)} />}</AnimatePresence>
      {/* in the Hot Zone: it says so, and the heat rises round you */}
      {inHot && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] h-[38%] overflow-hidden" data-testid="eyes-hot">
          {Array.from({ length: 14 }, (_, i) => <span key={i} className="lv-eyes-ember absolute bottom-0 h-1.5 w-1.5 rounded-full bg-[#FFB04A]" style={{ left: `${(i * 37) % 96 + 2}%`, animationDelay: `${(i * 0.53) % 4}s`, animationDuration: `${3.2 + (i % 5) * 0.6}s` }} />)}
        </div>
      )}
      {/* right: look up, the phone as a window, a picture, the map */}
      <div className="absolute right-[max(12px,env(safe-area-inset-right,0px))] top-1/2 z-20 grid -translate-y-1/2 gap-2.5">
        <RoundBtn label="Sky" onClick={() => glide(null, headingPitch > 0.9 ? 0.05 : 1.25)} testid="eyes-sky"><CloudSun className="h-5 w-5" /></RoundBtn>
        {canGyro && <RoundBtn label={gyro ? 'Gyro on' : 'Gyro'} on={gyro} onClick={() => void toggleGyro()} testid="eyes-gyro"><Smartphone className="h-5 w-5" /></RoundBtn>}
        <RoundBtn label="Party" onClick={() => usePartyUi.getState().show(partySize > 1 ? 'party' : 'invite')} testid="eyes-party">
          <span className="relative"><Users className="h-5 w-5" />{partySize > 1 && <span className="absolute -right-2.5 -top-2 rounded-full bg-[#22E3FF] px-1 text-[10px] font-black text-[#0b0b1e]">{partySize}</span>}</span>
        </RoundBtn>
        {me && <RoundBtn label="Grimoire" on={book} onClick={() => setBook((b) => !b)} testid="eyes-grimoire-btn"><BookOpen className="h-5 w-5" /></RoundBtn>}
        <RoundBtn label="Snap" onClick={() => void snap()} testid="eyes-snap"><Camera className="h-5 w-5" /></RoundBtn>
        <RoundBtn label="Map" onClick={() => toMap(nav)} testid="eyes-map"><MapIcon className="h-5 w-5" /></RoundBtn>
      </div>

      {/* walking through a door */}
      <div className={cn('pointer-events-none absolute inset-0 z-30 bg-black transition-opacity duration-500', going?.fade ? 'opacity-100' : 'opacity-0')} />
      {/* walked up to a place: go in */}
      <AnimatePresence>
        {place && !going && (
          <motion.button
            key={place.key}
            initial={{ opacity: 0, y: 10, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }}
            className="absolute left-1/2 top-[57%] z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border-2 bg-black/60 px-4 py-2.5 text-left shadow-2xl"
            style={{ borderColor: place.color }}
            onClick={() => void enterPlace(place)}
            data-testid="eyes-enter"
          >
            <span className="text-2xl leading-none">{place.emoji}</span>
            <span className="grid leading-tight">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">{place.owner ? `@${place.owner}’s ${place.label}` : place.name || place.label}</span>
              <span className="text-[15px] font-black text-white">{placeGo(place)} →</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* the jetpack: up and down */}
      {vehicle === 'jet' && (
        <div className="absolute left-[max(12px,env(safe-area-inset-left,0px))] top-1/2 z-20 grid -translate-y-1/2 justify-items-center gap-2" data-testid="eyes-jet">
          <button className="grid h-12 w-12 touch-none place-items-center rounded-full bg-black/50 text-xl shadow-lg active:scale-95" onPointerDown={() => hold(1)} aria-label="Rise" data-testid="eyes-rise">▲</button>
          <div className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-black tnum" data-testid="eyes-alt">🚀 {alt} m</div>
          <button className="grid h-12 w-12 touch-none place-items-center rounded-full bg-black/50 text-xl shadow-lg active:scale-95" onPointerDown={() => hold(-1)} aria-label="Sink" data-testid="eyes-sink">▼</button>
        </div>
      )}

      {/* bottom: walking, and what's in the sky */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 px-[max(14px,env(safe-area-inset-left,0px))] pb-[max(14px,env(safe-area-inset-bottom,0px))]">
        <div className="pointer-events-auto">
          {/* out on GPS for real: players near you who play too */}
          {me && <MeetNearby onGps={ex.gps === 'on'} />}
          {me && ex.state?.joystick?.enabled !== false && (steer
            ? <Joystick minimal onClose={() => setSteer(false)} />
            : <button className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2.5 text-sm font-bold shadow-lg" onClick={() => setSteer(true)} data-testid="eyes-steer"><Gamepad2 className="h-4 w-4" /> Steer</button>)}
          {ex.gps === 'on' && !steer && <div className="mt-1.5 text-[11px] font-semibold text-white/70">📡 Walking for real moves you too</div>}
        </div>
        {skyData?.enabled && (
          <div className="pointer-events-auto mb-1 rounded-2xl bg-black/50 px-3 py-2 text-right text-[11.5px] leading-tight shadow-lg" data-testid="eyes-treasures">
            <div className="font-bold">✨ {left > 0 ? `${left} treasure${left === 1 ? '' : 's'} in your sky` : 'More in the sky soon'}</div>
            <div className="text-white/60">{skyData.today ?? 0}/{skyData.cap ?? 0} caught today</div>
          </div>
        )}
      </div>

      {/* the first time: how it works */}
      <AnimatePresence>
        {hint && ready && (
          <motion.div key="hint" className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center px-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-testid="eyes-hint">
            <div className="max-w-xs rounded-3xl bg-black/60 px-5 py-4 text-center shadow-2xl">
              <div className="font-display text-base font-black">You’re standing in your explorer’s shoes</div>
              <div className="mt-1 text-[12.5px] text-white/75">Drag to look around (look up!), walk with the stick, and tap anything: plots, the Leviathan, stars, the moon.</div>
              <button className="pointer-events-auto mt-3 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold" onClick={() => { setHint(false); saveStorage('landvas.eyes.hinted', true); }} data-testid="eyes-hint-ok">Got it</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* a tapped thing's card */}
      <AnimatePresence>
        {card && (
          <motion.div key={card.title} className="absolute inset-x-0 bottom-[calc(170px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} data-testid="eyes-card">
            <div className="flex w-full max-w-sm items-start gap-3 rounded-3xl border border-white/15 bg-[#0B1230]/95 p-4 shadow-2xl">
              <div className="text-3xl">{card.kind === 'lev' ? '🐉' : card.kind === 'buddy' ? '🧭' : card.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-base font-black" data-testid="eyes-card-title">{card.title}</div>
                {'body' in card && <div className="mt-0.5 text-[12.5px] text-white/75">{card.body}</div>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {card.kind === 'beacon' && <Link to={`/powers/${card.gx}_${card.gy}`} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">Its powers</Link>}
                  {card.kind === 'beacon' && <button className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold" onClick={() => { const [lng, lat] = cellCenter(card.gx, card.gy); toMap(nav, { lng, lat, zoom: 17 }); }}>On the map</button>}
                  {card.kind === 'buddy' && <Link to={`/u/${card.username}`} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">Profile</Link>}
                  {card.kind === 'lev' && <button className="rounded-full bg-[#B026FF]/70 px-3 py-1 text-xs font-bold" onClick={() => { setCard(null); useLevUi.getState().open(); }} data-testid="eyes-open-fight">Open the fight</button>}
                </div>
              </div>
              <button className="grid h-7 w-7 place-items-center rounded-full text-white/60 hover:text-white" onClick={() => setCard(null)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-40">
        <AnimatePresence>{selected && !rolling && <PlotPanel key={`${selected.gx}_${selected.gy}`} cell={selected} variant="eyes" />}</AnimatePresence>
      </div>
      <ClaimCelebration />
      <LeviathanFight />
    </div>
  );
}

function RoundBtn({ label, onClick, children, on, testid }: { label: string; onClick(): void; children: React.ReactNode; on?: boolean; testid: string }) {
  return (
    <button className={cn('grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white shadow-lg transition active:scale-95', on && 'bg-[linear-gradient(135deg,#22E3FF,#8B5CFF_55%,#FF3D9A)]')}
      onClick={onClick} aria-label={label} aria-pressed={on} data-testid={testid}>
      {children}
    </button>
  );
}

/** the strip across the top: where you're facing, and the bearings of things worth turning toward */
function Compass({ markers, sky }: { markers: { at: number; emoji: string; label: string; key: string }[]; sky: Eyes | null }) {
  const yaw = useSyncExternalStore(lookStore.sub, lookStore.get, lookStore.get);
  const span = Math.PI * 0.78; // how much of the circle the strip shows
  const s = sky?.sky();
  const all = [...markers];
  if (s && s.sunAlt > -0.05) all.push({ key: 'sun', at: s.sunAz, emoji: '☀️', label: '' });
  if (s && s.moonAlt > -0.05) all.push({ key: 'moon', at: s.moonAz, emoji: '🌙', label: '' });
  const rel = (a: number) => ((a - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const ticks = [];
  for (let d = 0; d < 360; d += 15) {
    const r = rel((d * Math.PI) / 180);
    if (Math.abs(r) > span / 2) continue;
    const name = d % 45 === 0 ? bearingName((d * Math.PI) / 180) : '';
    ticks.push(<div key={d} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${50 + (r / span) * 100}%` }}>
      <span className={cn('w-px bg-white/50', name ? 'h-2.5' : 'h-1.5')} />
      {name && <span className={cn('text-[10px] font-black', name === 'N' ? 'text-[#FF4D6D]' : 'text-white/80')}>{name}</span>}
    </div>);
  }
  return (
    <div className="relative h-11 min-w-0 flex-1 overflow-hidden rounded-2xl bg-black/40 shadow-lg [mask-image:linear-gradient(90deg,transparent,#000_14%,#000_86%,transparent)]" data-testid="eyes-compass" data-heading={Math.round((yaw * 180) / Math.PI)}>
      {ticks}
      {all.map((m) => {
        const r = rel(m.at);
        if (Math.abs(r) > span / 2) return null;
        return <div key={m.key} className="absolute bottom-0.5 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap text-[13px] leading-none" style={{ left: `${50 + (r / span) * 100}%` }}>
          {m.emoji}{m.label && <span className="text-[9.5px] font-bold text-white/75">{m.label}</span>}
        </div>;
      })}
      <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-[#22E3FF]/80" />
    </div>
  );
}

/** the time where you are and the moon's phase */
function SkyChip({ eyes, zone, onClick }: { eyes: Eyes | null; zone: string | null; onClick(): void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) tick((n) => n + 1); }, 5_000); return () => clearInterval(t); }, []);
  const s = eyes?.sky();
  const night = s ? s.day < 0.35 : false;
  const ms = eyes?.now() ?? Date.now();
  return (
    <button className="pointer-events-auto flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-black/45 px-3 text-[12px] font-bold shadow-lg" onClick={onClick} data-testid="eyes-skychip" aria-label="Where am I">
      <span>{night ? '🌙' : s && s.day < 0.7 ? '🌅' : '☀️'}</span>
      {/* (the time there, not on your phone) */}
      <span className="tnum">{zone ? localTime(zone, ms) : new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      {night && s && <span className="hidden text-white/60 sm:inline">· {moonPhaseName(s.moonPhase)}</span>}
    </button>
  );
}

/** arriving somewhere: the city's name, big, its country and flag, the time there and its sun — then out of the way */
function Arrival({ w, n, hot, onClose }: { w: Whereabouts & { lng: number; lat: number }; n: number; hot: string | null; onClose(): void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setTimeout(onClose, 8_000); const i = setInterval(() => tick((k) => k + 1), 15_000); return () => { clearTimeout(t); clearInterval(i); }; }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const zone = w.zone ?? 'UTC';
  const ahead = hoursFromHere(zone);
  const sun = sunTimes(w.lng, w.lat);
  const title = w.city ?? w.country ?? 'Somewhere new';
  const capital = w.capital === 2 ? `Capital of ${w.country ?? 'the country'}` : w.capital > 2 ? 'A state capital' : null;
  const sub = [w.area && w.area !== w.city ? w.area : null, w.city && w.country ? `${w.country}${w.flag ? ` ${w.flag}` : ''}` : w.flag].filter(Boolean).join(' · ');
  return (
    <motion.button
      key={n}
      className="lv-eyes-arrive pointer-events-auto absolute left-1/2 top-[15%] z-20 grid w-[min(92vw,380px)] -translate-x-1/2 justify-items-center gap-1.5 rounded-[26px] px-5 pb-4 pt-3 text-center shadow-2xl"
      initial={{ opacity: 0, y: -18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      onClick={onClose} data-testid="eyes-arrival"
    >
      <span className="text-[10.5px] font-black uppercase tracking-[0.32em] text-[#22E3FF]">{w.kind === 'city' || w.kind === 'town' ? 'Welcome to' : 'You’re in'}</span>
      <span className="font-display text-[clamp(26px,8vw,38px)] font-black leading-none text-white" data-testid="eyes-arrival-city">{title}</span>
      {capital && <span className="rounded-full bg-[#FFD23F]/15 px-2.5 py-0.5 text-[11px] font-black text-[#FFE28A]">★ {capital}</span>}
      {sub && <span className="text-[13px] font-bold text-white/80" data-testid="eyes-arrival-country">{sub}</span>}
      <span className="mt-1 flex flex-wrap justify-center gap-1.5 text-[12px] font-bold">
        <span className="rounded-full bg-white/10 px-2.5 py-1" data-testid="eyes-arrival-time">🕒 {localTime(zone)} {localDay(zone)} <span className="text-white/55">{utcOffset(zone)}</span></span>
        {ahead !== 0 && <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/75">{Math.abs(ahead)}h {ahead > 0 ? 'ahead of' : 'behind'} you</span>}
        {sun.rise != null && <span className="rounded-full bg-white/10 px-2.5 py-1">🌅 {localTime(zone, sun.rise)}</span>}
        {sun.set != null && <span className="rounded-full bg-white/10 px-2.5 py-1">🌇 {localTime(zone, sun.set)}</span>}
        {hot && <span className="rounded-full bg-[#FF6A1F]/25 px-2.5 py-1 text-[#FFB27A]">🔥 {hot}</span>}
      </span>
    </motion.button>
  );
}

/** the plot under a place */
function cellAtLngLat(lng: number, lat: number) {
  const x = (lng + 180) / 360;
  const r = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  const n = 4194304;
  return { gx: Math.min(n - 1, Math.floor((x - Math.floor(x)) * n)), gy: Math.max(0, Math.min(n - 1, Math.floor(y * n))) };
}

/** your plot's floating card: its art (or its rarity), its name */
function drawCard(r: PlotRow, art: ImageBitmap | null): HTMLCanvasElement {
  const W = 256, H = 316;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d')!;
  const info = rarityInfo(r[9]);
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, info.glow || '#ffffff'); grad.addColorStop(1, info.color);
  g.fillStyle = grad;
  g.beginPath(); g.roundRect(0, 0, W, H, 26); g.fill();
  g.fillStyle = '#0B1230';
  g.beginPath(); g.roundRect(8, 8, W - 16, W - 16, 20); g.fill();
  if (art) {
    g.save(); g.beginPath(); g.roundRect(8, 8, W - 16, W - 16, 20); g.clip();
    g.drawImage(art, 8, 8, W - 16, W - 16);
    g.restore();
  } else {
    const rg = g.createRadialGradient(W / 2, W / 2 - 10, 10, W / 2, W / 2, W / 2);
    rg.addColorStop(0, info.glow || '#fff'); rg.addColorStop(1, '#0B1230');
    g.fillStyle = rg; g.globalAlpha = 0.55; g.beginPath(); g.roundRect(8, 8, W - 16, W - 16, 20); g.fill(); g.globalAlpha = 1;
    if (info.emoji || isPrimordial(r[9])) {
      g.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(info.emoji ?? '🌌', W / 2, W / 2);
    } else {
      // the LANDVAS L: five plots in a 3×3 grid, in this plot's colours
      const cell = 46, gap = 8, x0 = W / 2 - (cell * 3 + gap * 2) / 2, y0 = W / 2 - (cell * 3 + gap * 2) / 2;
      for (const [cx, cy] of [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]) {
        const gg = g.createLinearGradient(0, y0 + cy * (cell + gap), 0, y0 + cy * (cell + gap) + cell);
        gg.addColorStop(0, info.glow || '#fff'); gg.addColorStop(1, info.color);
        g.fillStyle = gg; g.beginPath(); g.roundRect(x0 + cx * (cell + gap), y0 + cy * (cell + gap), cell, cell, 12); g.fill();
      }
    }
  }
  g.fillStyle = '#0B1230';
  g.font = '800 22px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = (r[10] || info.name).slice(0, 18);
  g.fillText(label, W / 2, W + 10);
  g.font = '900 14px system-ui, sans-serif';
  g.fillText('YOURS', W / 2, W + 36);
  return c;
}

/** what going in is called: knock on a house, open a farm's gate, go down a mine… */
function placeGo(s: BuildSite): string {
  if (s.kind === 'home' || s.kind === 'landlord') return '🚪 Knock';
  if (isRealm(s.kind)) return REALM_META[s.kind].enter;
  return ({ arcade: 'Walk in & play', farm: 'Open the gate', business: 'Buy a lemonade', habitat: 'Step into the glade', train: 'See the trains', plane: 'See the flights' } as Record<string, string>)[s.kind] ?? 'Go in';
}

/** the card that floats over a tapped plot: what it is, whose, what it earns */
function plotCard(d: import('../backend/types').PlotDetails | null, row: PlotRow | null): HTMLCanvasElement {
  const c = Object.assign(document.createElement('canvas'), { width: 640, height: 360 });
  const g = c.getContext('2d')!;
  const rarity = d?.rarity ?? row?.[9] ?? null;
  const info = rarity ? rarityInfo(rarity) : null;
  const col = info?.color ?? '#22E3FF';
  g.fillStyle = 'rgba(10,8,28,0.82)'; g.beginPath(); g.roundRect(8, 8, 624, 344, 36); g.fill();
  const grad = g.createLinearGradient(0, 0, 640, 360); grad.addColorStop(0, col); grad.addColorStop(1, info?.glow || '#ffffff');
  g.strokeStyle = grad; g.lineWidth = 8; g.stroke();
  g.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; g.textBaseline = 'middle';
  const owned = d ? d.owned : !!row;
  g.fillText(owned ? info?.emoji ?? '🟩' : '✨', 36, 104);
  g.fillStyle = '#ffffff'; g.font = 'bold 50px system-ui, sans-serif';
  const title = d?.name || row?.[10] || (owned ? 'A plot' : 'Unclaimed land');
  g.fillText(title.length > 16 ? `${title.slice(0, 15)}…` : title, 150, 82);
  g.font = 'bold 34px system-ui, sans-serif'; g.fillStyle = col;
  g.fillText(owned ? (info?.name ?? 'Plot') : 'Yours to claim', 150, 136);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '32px system-ui, sans-serif';
  const owner = d?.owner?.username ?? row?.[7] ?? null;
  const lines = [
    owned ? (owner ? `@${owner}` : '') : 'Its rarity is a surprise',
    d?.type_info ? `${d.type_info.name} · ${d.type_info.minigame_name}` : '',
    d?.rent ? `$${(d.rent.usd_per_second * 3600).toFixed(4)} an hour` : '',
  ].filter(Boolean);
  lines.forEach((t, i) => g.fillText(t, 40, 214 + i * 46));
  return c;
}
