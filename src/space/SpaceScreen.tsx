// /space — mission control. Build your rocket (four parts, bought with Ink), then pick a world on
// the living solar-system map and launch. Trips take real time; land, explore the surface, collect
// the day's samples, and play space minigames for Ink. A bigger engine reaches the outer planets
// and beyond — jump to a random far-off world and make it your home.
import { IfCapped } from '../ui/IfCapped';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, Globe2, Home, Lock, Orbit, Rocket as RocketIcon, Sparkles, Telescope, Users, Wrench } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { SpaceState } from '../backend/types';
import { invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { PARTS, PART_INFO, Rocket } from './Rocket';
import { SPACE_KEY, fmtLeft, placeName, useFlight, useSpace } from './useSpace';
import { WORLDS, WORLD_ORDER, type World, type WorldId, exoWorld, worldKey, worldOf } from './worlds';
import { SPACE_GAMES } from './games';
import { createSystemScene, type SystemLive } from './system3d';
import { PlanetBall } from './PlanetBall';
import { PlacesSheet } from './Places';
export { PlanetBall };
import { PLANET_GAMES } from './planetGames';
import { canWarpTo, describeWhereabouts, useWarpTo } from '../social/activity';
import { poll } from '../lib/poll';
import { config } from '../env';

export default function SpaceScreen() {
  const me = useOnboardedMe();
  const q = useSpace();
  const qc = useQueryClient();
  // fresh balances when you walk into the hangar
  useEffect(() => { void qc.invalidateQueries({ queryKey: qk.me }); void qc.invalidateQueries({ queryKey: SPACE_KEY }); }, [qc]);
  if (!me || q.isLoading) return <div className="lv-space grid min-h-full place-items-center"><Spinner /></div>;
  if (q.error || !q.data) return <div className="lv-space min-h-full p-6 text-center text-muted">Mission control is offline right now. <Button variant="secondary" onClick={() => q.refetch()}>Try again</Button></div>;
  // your Ink comes from your player state (kept fresh everywhere), not the space snapshot
  const s = { ...q.data, balances: { ...q.data.balances, ...me.balances } };
  return <div className="lv-space min-h-full"><Control s={s} accent={me.profile.accent_color ?? '#8B5CFF'} /></div>;
}

function useSet() {
  const qc = useQueryClient();
  return (s: SpaceState) => { qc.setQueryData(SPACE_KEY, s); invalidateGame(qc); };
}

function Control({ s, accent }: { s: SpaceState; accent: string }) {
  const nav = useNavigate();
  const set = useSet();
  const flight = useFlight(s);
  const [launching, setLaunching] = useState<{ to: string; minutes: number } | null>(null);
  const [warping, setWarping] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const ink = Number(s.balances?.ink ?? 0);
  const cfg = s.config;
  const here = s.location;
  const onWorld = !flight.flying && here !== 'earth';

  const run = async (key: string, fn: () => Promise<SpaceState>, ok?: (r: SpaceState) => void) => {
    setBusy(key);
    try { const r = await fn(); set(r); ok?.(r); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const rush = () => run('rush', api.spaceRush, (r) => {
    if (useUi.getState().settings.haptics) buzz('success');
    toast.success(`Fast travel! You’re on ${placeName(r, r.location)} 🚀`, { description: `−${(r as SpaceState & { rush_paid?: number }).rush_paid ?? 0} Ink` });
  });
  /** launch, and with `fast` arrive right away (fast travel) */
  const launch = (dest: string, fast = false) => run(`launch:${dest}${fast ? ':fast' : ''}`, async () => { const r = await api.spaceLaunch(dest); return fast && !r.warped ? api.spaceRush() : r; }, (r) => {
    if (r.warped) { if (useUi.getState().settings.haptics) buzz('success'); setPick(null); setWarping(placeName(r, r.location)); return; }
    if (fast) { if (useUi.getState().settings.haptics) buzz('success'); setPick(null); toast.success(`Fast travel! You’re on ${placeName(r, r.location)} 🚀`); return; }
    if (useUi.getState().settings.haptics) buzz('heavy');
    const mins = (new Date(r.arrive_at!).getTime() - new Date(r.depart_at!).getTime()) / 60000;
    setLaunching({ to: r.dest!, minutes: mins });
    setPick(null);
  });

  return (
    <div className="mx-auto grid min-w-0 max-w-5xl grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden p-4 pb-28 md:p-6" data-testid="space">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => nav('/world')} className="rounded-xl p-2 hover:bg-surface-2" aria-label="Back to the map"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-[150px] flex-1">
          <div className="eyebrow">Mission control</div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Space</h1>
        </div>
        <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold"><ResourceIcon r="ink" className="h-4 w-4" /><span className="tnum">{ink.toLocaleString()}</span></div>
        <IfCapped><div className="glass rounded-2xl px-3 py-2 text-xs text-muted" title="Ink from samples and space games today">Space Ink today <b className="tnum text-fg">{s.ink_today}/{cfg.daily_cap}</b></div></IfCapped>
      </div>

      {!s.built ? <Hangar s={s} accent={accent} busy={busy} onBuild={(p) => run(`part:${p}`, () => api.spaceBuild(p), (r) => {
        if (r.built) { confettiCannons(); toast.success('Your rocket is ready! 🚀', { description: 'Pick a world and launch — the Moon trip is free.' }); }
      })} /> : (
        <>
          <StatusCard s={s} flight={flight} onWorld={onWorld} accent={accent} busy={busy} onHome={() => launch('earth')} onRush={rush} />
          <WarpBar s={s} busy={busy} onWarp={(d) => launch(d)} />
          <FriendsInSpace />
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="glass relative min-w-0 overflow-hidden rounded-[28px] p-2" data-testid="system-map">
              <SystemMap s={s} progress={flight.progress} flying={flight.flying} picked={pick} onPick={setPick} accent={accent} />
              <div className="absolute left-4 top-3 text-[11px] font-bold uppercase tracking-wider text-white/60">The solar system · drag to look · tap a world</div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                {s.home_seed && <Button size="sm" variant="secondary" onClick={() => setPick('home')} data-testid="pick-home"><Home className="h-4 w-4" /> {s.home_name}</Button>}
                <Button size="sm" variant="secondary" onClick={() => setPick('exo')} data-testid="pick-exo"><Telescope className="h-4 w-4" /> Deep space</Button>
              </div>
            </div>
            <div className="grid min-w-0 content-start gap-4">
              <AnimatePresence mode="wait">
                {pick ? <WorldCard key={pick} s={s} id={pick} busy={busy} flying={flight.flying} onLaunch={(fast) => launch(pick, fast)} onClose={() => setPick(null)} />
                  : <EngineCard key="engine" s={s} busy={busy} onUpgrade={() => run('engine', api.spaceUpgradeEngine, (r) => { confettiCannons(); toast.success(`Engine Mk ${'I'.repeat(r.engine)} installed!`, { description: r.engine >= 3 ? 'The outer planets — and deep space — are within reach.' : 'Jupiter and Saturn are within reach.' }); })} accent={accent} />}
              </AnimatePresence>
              <GamesCard s={s} />
              <PlanetPlotsCard s={s} />
            </div>
          </div>
          <Logbook s={s} />
        </>
      )}

      <AnimatePresence>{warping && <WarpOverlay to={warping} onDone={() => { setWarping(null); nav('/world'); }} />}</AnimatePresence>
      <AnimatePresence>{launching && <LaunchOverlay s={s} to={launching.to} minutes={launching.minutes} accent={accent} onDone={() => setLaunching(null)} />}</AnimatePresence>
    </div>
  );
}

// ---- the hangar: build the rocket ----------------------------------------------------------
function Hangar({ s, accent, busy, onBuild }: { s: SpaceState; accent: string; busy: string | null; onBuild(p: string): void }) {
  const ink = Number(s.balances?.ink ?? 0);
  const total = PARTS.reduce((n, p) => n + (s.parts.includes(p) ? 0 : s.config.parts[p]?.ink ?? 0), 0);
  return (
    <div className="glass grid gap-5 rounded-[28px] p-5 md:grid-cols-[220px_1fr] md:p-7" data-testid="hangar">
      <div className="grid justify-items-center gap-2">
        <motion.div key={s.parts.length} initial={{ scale: 0.9, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
          <Rocket parts={s.parts} size={230} accent={accent} />
        </motion.div>
        <div className="text-sm font-bold">{s.parts.length}/4 parts built</div>
      </div>
      <div className="grid content-start gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Build your rocket</h2>
          <p className="text-sm text-muted">Four parts and you’re off. {total > 0 ? <>The rest costs <b className="text-fg">{total} Ink</b> — </> : ''}your first trip, to the Moon, burns no fuel at all.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {PARTS.map((p) => {
            const built = s.parts.includes(p);
            const cost = s.config.parts[p]?.ink ?? 0;
            return (
              <div key={p} className={cn('flex items-center gap-3 rounded-2xl border p-3', built ? 'border-ok/50 bg-ok/10' : 'border-line bg-surface-2/60')} data-testid={`part-${p}`}>
                <span className="text-2xl">{PART_INFO[p].emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{PART_INFO[p].label}</div>
                  <div className="text-[11px] text-muted">{PART_INFO[p].blurb}</div>
                </div>
                {built ? <span className="flex items-center gap-1 text-xs font-bold text-ok"><Check className="h-4 w-4" /> Built</span>
                  : <Button size="sm" variant="rainbow" loading={busy === `part:${p}`} disabled={ink < cost} onClick={() => onBuild(p)} data-testid={`build-${p}`}>
                      <Wrench className="h-3.5 w-3.5" /> {cost} <ResourceIcon r="ink" className="h-3.5 w-3.5" />
                    </Button>}
              </div>
            );
          })}
        </div>
        {ink < total && <p className="rounded-xl bg-warn/10 p-3 text-xs">You need <b>{total - ink} more Ink</b>. Win plot minigames on the map, or play Inkborn games, to earn it.</p>}
      </div>
    </div>
  );
}

// ---- status -------------------------------------------------------------------------------
function StatusCard({ s, flight, onWorld, accent, busy, onHome, onRush }: { s: SpaceState; flight: ReturnType<typeof useFlight>; onWorld: boolean; accent: string; busy: string | null; onHome(): void; onRush(): void }) {
  // the fast-travel price drops as the trip goes on (base + per minute left)
  const ft = s.config.fast_travel;
  const rushCost = flight.flying ? (ft?.base_ink ?? 3) + (ft?.ink_per_minute ?? 2) * Math.ceil(flight.left / 60) : 0;
  const nav = useNavigate();
  return (
    <div className="glass flex flex-wrap items-center gap-4 rounded-[28px] p-4" data-testid="space-status">
      <div className={cn('shrink-0', flight.flying && 'animate-[lv-bob_1.2s_ease-in-out_infinite]')}><Rocket parts={s.parts} engine={s.engine} flame={flight.flying} size={92} accent={accent} /></div>
      <div className="min-w-0 flex-1">
        {flight.flying ? (
          <>
            <div className="eyebrow">In flight</div>
            <div className="font-display text-xl font-bold">{placeName(s, s.location)} → {placeName(s, s.dest)}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-[linear-gradient(90deg,#22E3FF,#8B5CFF,#FF3D9A)] transition-[width] duration-500" style={{ width: `${flight.progress * 100}%` }} /></div>
            <div className="mt-1 text-sm text-muted">Landing in <b className="tnum text-fg" data-testid="flight-left">{fmtLeft(flight.left)}</b> — play an asteroid run while you fly.</div>
            {ft?.enabled !== false && (
              <Button size="sm" variant="rainbow" className="mt-2" loading={busy === 'rush'} disabled={Number(s.balances?.ink ?? 0) < rushCost} onClick={onRush} data-testid="fast-travel">
                ⚡ Fast travel · {rushCost} <ResourceIcon r="ink" className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        ) : onWorld ? (
          <>
            <div className="eyebrow">Landed</div>
            <div className="font-display text-xl font-bold">On {placeName(s, s.location)}</div>
            <div className="text-sm text-muted">{s.samples[s.location] === s.day ? 'Today’s samples are collected here.' : 'Samples are waiting on the surface.'}</div>
          </>
        ) : (
          <>
            <div className="eyebrow">On the launch pad</div>
            <div className="font-display text-xl font-bold">Earth 🌍</div>
            <div className="text-sm text-muted">Pick a world on the map below and launch.</div>
          </>
        )}
      </div>
      {onWorld && (
        <div className="flex flex-wrap gap-2">
          <Button variant="rainbow" onClick={() => nav('/space/surface')} data-testid="explore-surface"><Globe2 className="h-4 w-4" /> Explore the surface</Button>
          <Button variant="secondary" loading={busy === 'launch:earth'} onClick={onHome} data-testid="fly-home"><Home className="h-4 w-4" /> Fly home</Button>
        </div>
      )}
    </div>
  );
}

// ---- the living solar system ----------------------------------------------------------------
const RINGS: (WorldId | 'earth')[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const BASE: Record<string, number> = { mercury: 0.4, venus: 2.1, earth: 3.9, mars: 1.2, jupiter: 5.1, saturn: 2.8, uranus: 4.4, neptune: 0.9, pluto: 3.3 };
const SPEED: Record<string, number> = { mercury: 4.1, venus: 1.6, earth: 1, mars: 0.53, jupiter: 0.084, saturn: 0.034, uranus: 0.012, neptune: 0.006, pluto: 0.004 };

type MapProps = { s: SpaceState; progress: number; flying: boolean; picked: string | null; onPick(id: string): void; accent: string };
/** The solar system in 3D (falls back to the flat map where WebGL isn't available). */
function SystemMap(p: MapProps) {
  const [flat, setFlat] = useState(false);
  return flat ? <SystemMap2D {...p} /> : <SystemMap3D {...p} onFail={() => setFlat(true)} />;
}
function SystemMap3D({ s, progress, flying, picked, onPick, accent, onFail }: MapProps & { onFail(): void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const reduce = useUi((st) => st.settings.reduceMotion);
  const live = useRef<SystemLive>({ location: s.location, dest: s.dest, flying, progress, picked, locked: () => false });
  live.current = { location: s.location, dest: s.dest, flying, progress, picked, locked: (id) => s.engine < (s.config.worlds[id]?.tier ?? 1) };
  const pickRef = useRef(onPick); pickRef.current = onPick;
  useEffect(() => {
    let sc: ReturnType<typeof createSystemScene>;
    try { sc = createSystemScene(cv.current!, live, accent, reduce, (id) => pickRef.current(id)); }
    catch (e) { console.warn('3D map unavailable', e); onFail(); return; }
    if (config.e2e) (window as any).__landvasSystem = sc.positions;
    return () => sc.dispose();
  }, [accent, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={cv} className="block h-[min(80vw,480px)] min-h-[320px] w-full max-w-full cursor-grab touch-none rounded-[22px] active:cursor-grabbing" aria-label="The solar system in 3D: drag to look around, tap a world to plan a trip" data-testid="system-canvas" />;
}

function SystemMap2D({ s, progress, flying, picked, onPick, accent }: MapProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const pos = useRef(new Map<string, { x: number; y: number; r: number }>());
  const live = useRef({ s, progress, flying, picked });
  live.current = { s, progress, flying, picked };
  const reduce = useUi((st) => st.settings.reduceMotion);
  useEffect(() => {
    const c = cv.current!;
    const g = c.getContext('2d')!;
    let raf = 0, W = 0, H = 0;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const resize = () => { const r = c.getBoundingClientRect(); W = r.width; H = r.height; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(c);
    const stars = Array.from({ length: 140 }, (_, i) => ({ x: (i * 97.13) % 1, y: (i * 57.71) % 1, r: (i % 5) * 0.25 + 0.3, p: i }));
    const t0 = performance.now();
    const frame = (now: number) => {
      const { s, progress, flying, picked } = live.current;
      const t = reduce ? 0 : (now - t0) / 1000;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      bg.addColorStop(0, '#141A3D'); bg.addColorStop(1, '#05060F');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (const st of stars) { g.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.5 + st.p); g.fillStyle = '#fff'; g.fillRect(st.x * W, st.y * H, st.r, st.r); }
      g.globalAlpha = 1;
      const cx = W / 2, cy = H / 2, tilt = 0.5;
      const R = Math.min(W / 2 - 24, (H / 2 - 20) / tilt);
      const step = (R - 30) / RINGS.length;
      // the Sun
      const sg = g.createRadialGradient(cx, cy, 0, cx, cy, 42);
      sg.addColorStop(0, '#FFF6B0'); sg.addColorStop(0.35, '#FFC93D'); sg.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, 42, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FFD84D'; g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.fill();
      const P = pos.current; P.clear();
      const engine = s.engine;
      RINGS.forEach((id, i) => {
        const rr = 30 + step * (i + 0.8);
        g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(cx, cy, rr, rr * tilt, 0, 0, Math.PI * 2); g.stroke();
        const a = BASE[id] + t * 0.06 * Math.pow(SPEED[id], 0.45);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * tilt;
        const w = id === 'earth' ? null : WORLDS[id];
        const size = id === 'earth' ? 6 : Math.max(3.5, Math.min(13, w!.r * 0.62));
        const locked = !!w && engine < (s.config.worlds[id]?.tier ?? 1);
        g.globalAlpha = locked ? 0.45 : 1;
        if (id === 'earth') {
          g.fillStyle = '#3EA0DA'; g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#4FA552'; g.beginPath(); g.arc(x - 1.5, y - 1, size * 0.5, 0, Math.PI * 2); g.fill();
          // the Moon goes round the Earth
          const ma = t * 0.9, mx = x + Math.cos(ma) * 13, my = y + Math.sin(ma) * 13 * tilt;
          g.fillStyle = WORLDS.moon.color; g.beginPath(); g.arc(mx, my, 2.6, 0, Math.PI * 2); g.fill();
          P.set('moon', { x: mx, y: my, r: 3 }); P.set('earth', { x, y, r: size });
        } else {
          const pg = g.createRadialGradient(x - size * 0.4, y - size * 0.4, 0, x, y, size);
          pg.addColorStop(0, w!.color); pg.addColorStop(1, w!.color2);
          if (w!.ring) { g.strokeStyle = w!.ring; g.lineWidth = Math.max(1.5, size * 0.25); g.beginPath(); g.ellipse(x, y, size * 1.9, size * 0.6, -0.3, 0, Math.PI * 2); g.stroke(); }
          g.fillStyle = pg; g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill();
          P.set(id, { x, y, r: size });
        }
        g.globalAlpha = 1;
        if (locked && w) { g.font = '700 9px system-ui'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText('🔒', x, y - size - 4); }
      });
      // labels (and the picked one highlighted)
      for (const [id, p] of P) {
        if (id === 'earth') continue;
        const sel = picked === id;
        if (sel) { g.strokeStyle = '#FFE14D'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, p.r + 6 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); g.stroke(); }
        if (sel || W > 520) { g.font = `${sel ? 800 : 600} 10.5px ui-rounded, system-ui`; g.textAlign = 'center'; g.fillStyle = sel ? '#FFE14D' : 'rgba(255,255,255,0.65)'; g.fillText(WORLDS[id as WorldId]?.name ?? id, p.x, p.y + p.r + 13); }
      }
      // your rocket: parked at its world, or on its way between two
      const at = (id: string | null) => (id && id.startsWith('exo:') ? { x: W - 18, y: 22, r: 4 } : P.get(id ?? 'earth') ?? P.get('earth')!);
      let rx: number, ry: number, ang = -Math.PI / 2;
      if (flying && s.dest) {
        const a = at(s.location), b = at(s.dest);
        rx = a.x + (b.x - a.x) * progress; ry = a.y + (b.y - a.y) * progress;
        ang = Math.atan2(b.y - a.y, b.x - a.x);
        g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
      } else { const a = at(s.location); rx = a.x + 8; ry = a.y - 10; }
      g.save(); g.translate(rx, ry); g.rotate(ang + Math.PI / 2);
      if (flying) { g.fillStyle = `rgba(255,177,61,${0.6 + 0.4 * Math.sin(t * 30)})`; g.beginPath(); g.moveTo(-3, 6); g.lineTo(0, 13 + Math.sin(t * 40) * 2); g.lineTo(3, 6); g.fill(); }
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(5, -2, 4, 6); g.lineTo(-4, 6); g.quadraticCurveTo(-5, -2, 0, -8); g.fill();
      g.fillStyle = accent; g.beginPath(); g.moveTo(-4, 3); g.lineTo(-7, 8); g.lineTo(-3, 6); g.fill(); g.beginPath(); g.moveTo(4, 3); g.lineTo(7, 8); g.lineTo(3, 6); g.fill();
      g.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [reduce, accent]);
  useEffect(() => { if (config.e2e) (window as any).__landvasSystem = pos.current; }, []);
  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best: string | null = null, bd = 26;
    for (const [id, p] of pos.current) { if (id === 'earth') continue; const d = Math.hypot(p.x - x, p.y - y) - p.r; if (d < bd) { bd = d; best = id; } }
    if (best) onPick(best);
  };
  return <canvas ref={cv} onPointerUp={tap} className="block h-[min(70vw,440px)] min-h-[300px] w-full max-w-full cursor-pointer rounded-[22px]" aria-label="Solar system map: tap a world to plan a trip" data-testid="system-canvas" />;
}

// ---- a world's card ---------------------------------------------------------------------------
function WorldCard({ s, id, busy, flying, onLaunch, onClose }: { s: SpaceState; id: string; busy: string | null; flying: boolean; onLaunch(fast?: boolean): void; onClose(): void }) {
  const key = worldKey(id);
  const cfg = s.config.worlds[key];
  const w: World | null = id === 'exo' ? null : id === 'home' ? exoWorld(s.home_seed!, s.home_name) : worldOf(id);
  const locked = !!cfg && s.engine < cfg.tier;
  const ink = Number(s.balances?.ink ?? 0);
  const fuel = cfg?.fuel ?? 0;
  const there = (id === 'home' && s.location === `exo:${s.home_seed}`) || s.location === id;
  const warpable = id !== 'exo' && (s.warps ?? []).includes(id === 'home' ? `exo:${s.home_seed}` : id);
  const info = useQuery({ queryKey: ['space-world', id], queryFn: () => api.spaceWorld(id), enabled: id !== 'exo' && id !== 'home', staleTime: 60_000 });
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="glass grid gap-3 rounded-[28px] p-4" data-testid="world-card">
      <div className="flex items-start gap-3">
        <PlanetBall w={w} size={58} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{id === 'exo' ? 'Uncharted' : w?.kind === 'moon' ? 'Moon' : w?.kind === 'dwarf' ? 'Dwarf planet' : id === 'home' ? 'Your home world' : 'Planet'}</div>
          <div className="font-display text-xl font-bold">{id === 'exo' ? 'Deep space' : w?.name}</div>
        </div>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-bold text-muted hover:text-fg">Close</button>
      </div>
      <p className="text-sm text-muted">{id === 'exo' ? 'Fire up the big engine and jump to a random world nobody has charted. Like it? Settle it as your home world.' : w?.fact}</p>
      {cfg && (
        <div className="flex flex-wrap gap-2 text-xs">
          {warpable ? <span className="rounded-full bg-[#7FE3FF]/20 px-3 py-1 font-bold text-[#7FE3FF]">⚡ free, instant warp</span> : <>
            <span className="rounded-full bg-surface-2 px-3 py-1">⏱ {cfg.minutes} min trip</span>
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1">⛽ {fuel ? <>{fuel} <ResourceIcon r="ink" className="h-3 w-3" /></> : 'free'}</span>
          </>}
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1">🪨 samples +{cfg.sample} <ResourceIcon r="ink" className="h-3 w-3" />/day</span>
          {!s.samples[`first:${key}`] && <span className="rounded-full bg-gold/15 px-3 py-1 text-gold">✨ first visit +{cfg.first} Ink</span>}
          {w?.gravity != null && <span className="rounded-full bg-surface-2 px-3 py-1">🪶 gravity {w.gravity}×</span>}
        </div>
      )}
      {info.data && Number(info.data.pilots) > 0 && <div className="flex items-center gap-1.5 text-xs text-muted"><Users className="h-3.5 w-3.5" /> {info.data.pilots} pilot{Number(info.data.pilots) === 1 ? ' has' : 's have'} been here{Number(info.data.here) > 0 ? ` · ${info.data.here} here now` : ''}</div>}
      {locked ? (
        <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3 text-sm"><Lock className="h-4 w-4 text-muted" /> Needs an Engine Mk {'I'.repeat(cfg.tier)} — upgrade in the hangar.</div>
      ) : there ? (
        <div className="rounded-2xl bg-ok/10 p-3 text-sm text-ok">You’re here.</div>
      ) : warpable ? (
        <Button variant="rainbow" size="lg" loading={busy === `launch:${id}`} onClick={() => onLaunch()} data-testid="warp">
          ⚡ Warp there — free &amp; instant
        </Button>
      ) : (
        <div className="grid gap-2">
          <Button variant="rainbow" size="lg" loading={busy === `launch:${id}`} disabled={flying || ink < fuel} onClick={() => onLaunch()} data-testid="launch">
            <RocketIcon className="h-5 w-5" /> {flying ? 'Already in flight' : ink < fuel ? `Need ${fuel} Ink of fuel` : 'Launch'}
          </Button>
          {!flying && cfg && s.config.fast_travel?.enabled !== false && (() => {
            const fast = fuel + (s.config.fast_travel?.base_ink ?? 3) + (s.config.fast_travel?.ink_per_minute ?? 2) * Math.ceil(cfg.minutes);
            return (
              <Button variant="secondary" loading={busy === `launch:${id}:fast`} disabled={ink < fast} onClick={() => onLaunch(true)} data-testid="launch-fast">
                ⚡ Fast travel — arrive now · {fast} <ResourceIcon r="ink" className="h-3.5 w-3.5" />
              </Button>
            );
          })()}
        </div>
      )}
    </motion.div>
  );
}


// ---- engine upgrades ---------------------------------------------------------------------------
function EngineCard({ s, busy, onUpgrade, accent }: { s: SpaceState; busy: string | null; onUpgrade(): void; accent: string }) {
  const next = s.config.engine_upgrade_ink[s.engine];
  const ink = Number(s.balances?.ink ?? 0);
  const reach = s.engine >= 3 ? 'everywhere — even deep space' : s.engine === 2 ? 'out to Saturn' : 'the Moon, Mercury, Venus and Mars';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass flex items-center gap-3 rounded-[28px] p-4" data-testid="engine-card">
      <Rocket parts={s.parts} engine={s.engine} size={84} accent={accent} />
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Hangar</div>
        <div className="font-display text-lg font-bold">Engine Mk {'I'.repeat(s.engine)}</div>
        <div className="text-xs text-muted">Reaches {reach}.</div>
      </div>
      {next != null && (
        <Button size="sm" variant="secondary" loading={busy === 'engine'} disabled={ink < next} onClick={onUpgrade} data-testid="upgrade-engine">
          <Sparkles className="h-4 w-4" /> Mk {'I'.repeat(s.engine + 1)} · {next} <ResourceIcon r="ink" className="h-3.5 w-3.5" />
        </Button>
      )}
    </motion.div>
  );
}

// ---- space minigames ------------------------------------------------------------------------
function GamesCard({ s }: { s: SpaceState }) {
  const nav = useNavigate();
  return (
    <div className="glass grid gap-2 rounded-[28px] p-4" data-testid="space-games">
      <div className="eyebrow">Space games · earn Ink</div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(SPACE_GAMES).filter(([g]) => s.config.games[g]?.enabled !== false).map(([g, info]) => (
          <button key={g} onClick={() => nav(`/space/play/${g}`)} className="grid gap-0.5 rounded-2xl bg-surface-2/70 p-3 text-left text-xs hover:bg-surface-2" style={{ boxShadow: `inset 0 0 0 1px ${info.color}55` }} data-testid={`space-game-${g}`}>
            <span className="text-2xl">{info.emoji}</span><b className="text-sm">{info.name}</b>
            <span className="flex items-center gap-1 text-muted">up to <ResourceIcon r="ink" className="h-3 w-3" />{s.config.games[g]?.max_ink ?? 25}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- your plots out among the planets ---------------------------------------------------------
function PlanetPlotsCard({ s }: { s: SpaceState }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['planet-mine'], queryFn: api.myPlanetPlots, staleTime: 30_000 });
  const plots = q.data ?? [];
  const [places, setPlaces] = useState(false);
  return (
    <div className="glass grid gap-2 rounded-[28px] p-4" data-testid="planet-plots">
      <div className="flex items-center gap-2"><div className="eyebrow">Planet plots</div><span className="ml-auto text-[11px] text-muted">{plots.length} owned</span>
        <button onClick={() => setPlaces(true)} className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white" data-testid="space-places">📍 Find & warp</button></div>
      {places && <PlacesSheet open onOpenChange={setPlaces} />}
      {!plots.length && <p className="text-xs text-muted">Land on any world and walk its globe to claim plots — everyone exploring there sees your flag. Each world’s plots come with two games of their own that pay Ink.</p>}
      <div className="grid max-h-72 gap-1.5 overflow-y-auto">
        {plots.map((p) => {
          const w = worldOf(p.world, s.home_seed, s.home_name);
          const games = p.games ?? PLANET_GAMES_BY_WORLD[worldKey(p.world)] ?? [];
          return (
            <div key={`${p.world}:${p.gx}:${p.gy}`} className="flex items-center gap-2 rounded-2xl bg-surface-2/70 p-2">
              <PlanetBall w={w} size={30} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{p.name || 'Plot'}</div><div className="truncate text-[11px] text-muted">{w?.name ?? p.world} · <span className="capitalize">{p.rarity}</span></div></div>
              {games.map((g) => (
                <button key={g} onClick={() => nav(`/space/planet/${encodeURIComponent(p.world)}/${p.gx}/${p.gy}/${g}`)} className="rounded-xl bg-surface-3/80 px-2 py-1 text-lg hover:bg-surface-3" title={PLANET_GAMES[g]?.name} aria-label={`Play ${PLANET_GAMES[g]?.name}`}>{PLANET_GAMES[g]?.emoji}</button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
const PLANET_GAMES_BY_WORLD: Record<string, string[]> = Object.entries(PLANET_GAMES).filter(([, g]) => !g.bonus).reduce((m, [id, g]) => { (m[g.world] ??= []).push(id); return m; }, {} as Record<string, string[]>);

// ---- the logbook: worlds visited ------------------------------------------------------------
function Logbook({ s }: { s: SpaceState }) {
  const seen = WORLD_ORDER.filter((w) => s.visited.includes(w)).length;
  const exos = s.visited.filter((v) => v.startsWith('exo:')).length;
  return (
    <div className="glass rounded-[28px] p-4" data-testid="logbook">
      <div className="flex items-center gap-2"><Orbit className="h-4 w-4 text-accent-2" /><div className="font-display font-bold">Pilot’s logbook</div><span className="ml-auto text-xs text-muted">{seen}/{WORLD_ORDER.length} worlds · {exos} far-off · {s.launches} launches</span></div>
      <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1">
        {WORLD_ORDER.map((id) => {
          const v = s.visited.includes(id);
          return (
            <div key={id} className={cn('grid w-16 shrink-0 justify-items-center gap-1 text-center text-[10.5px] font-semibold', !v && 'opacity-35 grayscale')}>
              <PlanetBall w={WORLDS[id]} size={38} />{WORLDS[id].name.replace('The ', '')}{v && s.samples[`first:${id}`] ? <span className="text-ok">✓</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- friends out in space, and the newest worlds anyone has settled ----------------------------------
function FriendsInSpace() {
  const q = useQuery({ queryKey: ['space-social'], queryFn: api.spaceSocial, refetchInterval: poll(120_000) });
  const warpTo = useWarpTo();
  const friends = q.data?.friends ?? [], worlds = q.data?.new_worlds ?? [];
  if (!friends.length && !worlds.length) return null;
  return (
    <div className="glass grid gap-3 rounded-[28px] p-4" data-testid="friends-in-space">
      {friends.length > 0 && (
        <div className="grid gap-2">
          <div className="eyebrow">Friends in space</div>
          {friends.map(({ player, now }) => {
            const loc = now.space && now.space.location !== 'earth' ? worldOf(now.space.location, now.space.home_seed, now.space.home_name) : null;
            const home = now.space?.home_seed ? exoWorld(now.space.home_seed, now.space.home_name) : null;
            return (
              <div key={player.id} className="flex items-center gap-2.5 rounded-2xl bg-surface-2/70 p-2" data-testid="space-friend">
                <PlanetBall w={loc ?? home} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">@{player.username}{now.online && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[#4FD18B]" />}</div>
                  <div className="truncate text-[11px] text-muted">{describeWhereabouts(now) ?? (home ? `🏡 ${now.space?.home_name}` : 'on Earth')}{home && !now.space?.at_home ? ` · home: ${now.space?.home_name}` : ''}</div>
                </div>
                {canWarpTo(now, true) && <Button size="sm" variant="rainbow" onClick={() => void warpTo(player)}>⚡ Warp</Button>}
              </div>
            );
          })}
        </div>
      )}
      {worlds.length > 0 && (
        <div className="grid gap-2">
          <div className="eyebrow">Newly settled worlds</div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {worlds.map((x) => (
              <div key={`${x.seed}-${x.at}`} className="grid w-20 shrink-0 justify-items-center gap-1 text-center text-[10.5px]">
                <PlanetBall w={exoWorld(x.seed, x.name)} size={44} />
                <b className="w-full truncate">{x.name}</b><span className="w-full truncate text-muted">@{x.player.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- warp: anywhere you've unlocked or been, free and instant --------------------------------------
function WarpBar({ s, busy, onWarp }: { s: SpaceState; busy: string | null; onWarp(dest: string): void }) {
  const list = (s.warps ?? []).map((d) => ({ d, arg: d === `exo:${s.home_seed}` ? 'home' : d, w: d === 'earth' ? null : worldOf(d, s.home_seed, s.home_name) }));
  if (list.length < 2) return null;
  return (
    <div className="glass rounded-[28px] p-3" data-testid="warp-bar">
      <div className="mb-2 flex items-center gap-2 px-1"><span className="eyebrow">⚡ Warp</span><span className="text-[11px] text-muted">free &amp; instant to anywhere you’ve unlocked or been</span></div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {list.map(({ d, arg, w }) => {
          const here = s.location === d && !s.dest;
          return (
            <button key={d} disabled={here || !!busy} onClick={() => onWarp(arg)} data-testid={`warp-${arg}`}
              className={cn('grid w-[72px] shrink-0 justify-items-center gap-1 rounded-2xl p-2 text-center text-[10.5px] font-semibold transition', here ? 'bg-ok/15 text-ok' : 'bg-surface-2/70 hover:bg-surface-2 active:scale-95')}>
              {w ? <PlanetBall w={w} size={36} /> : <span className="grid h-9 w-9 place-items-center text-2xl">🌍</span>}
              <span className="w-full truncate">{d === 'earth' ? 'Earth' : d === `exo:${s.home_seed}` ? `🏡 ${s.home_name ?? 'Home'}` : w?.name.replace('The ', '').split(' (')[0]}</span>
              {here && <span className="text-[9px] uppercase">here</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WarpOverlay({ to, onDone }: { to: string; onDone(): void }) {
  const reduce = useUi((st) => st.settings.reduceMotion);
  useEffect(() => { const t = setTimeout(onDone, reduce ? 500 : 1500); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const streaks = useMemo(() => Array.from({ length: 48 }, (_, i) => ({ a: (i / 48) * 360 + (i % 3) * 4, d: 0.5 + (i % 5) * 0.12, delay: (i % 7) * 0.05 })), []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-[#05060F]" data-testid="warp-overlay">
      {!reduce && streaks.map((st, i) => (
        <motion.div key={i} className="absolute left-1/2 top-1/2 h-[2px] origin-left rounded-full bg-gradient-to-r from-transparent via-[#7FE3FF] to-white"
          style={{ rotate: st.a, width: '60vmax' }} initial={{ scaleX: 0, opacity: 0, x: 0 }} animate={{ scaleX: [0, 1], opacity: [0, 1, 0], x: ['0vmax', '30vmax'] }} transition={{ duration: st.d, delay: st.delay, repeat: Infinity, ease: 'easeIn' }} />
      ))}
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative text-center text-white">
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/60">Warping to</div>
        <div className="font-display text-4xl font-black">{to}</div>
      </motion.div>
    </motion.div>
  );
}

// ---- launch! ------------------------------------------------------------------------------------
function LaunchOverlay({ s, to, minutes, accent, onDone }: { s: SpaceState; to: string; minutes: number; accent: string; onDone(): void }) {
  const [n, setN] = useState(3);
  const [lift, setLift] = useState(false);
  const reduce = useUi((st) => st.settings.reduceMotion);
  useEffect(() => {
    if (reduce) { const t = setTimeout(onDone, 900); return () => clearTimeout(t); }
    const ts = [setTimeout(() => setN(2), 600), setTimeout(() => setN(1), 1200), setTimeout(() => { setN(0); setLift(true); if (useUi.getState().settings.haptics) buzz('heavy'); }, 1800), setTimeout(onDone, 4000)];
    return () => ts.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const streaks = useMemo(() => Array.from({ length: 30 }, (_, i) => ({ x: (i * 37) % 100, d: 0.4 + (i % 5) * 0.12, delay: (i % 7) * 0.08 })), []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onDone} className="fixed inset-0 z-[80] overflow-hidden bg-[radial-gradient(120%_90%_at_50%_100%,#2A1E5E,#05060F_70%)]" data-testid="launch-overlay">
      {lift && streaks.map((st, i) => (
        <motion.div key={i} className="absolute top-0 w-px bg-white/70" style={{ left: `${st.x}%`, height: 80 }} initial={{ y: -100 }} animate={{ y: '110vh' }} transition={{ duration: st.d, delay: st.delay, repeat: Infinity, ease: 'linear' }} />
      ))}
      <div className="absolute inset-x-0 top-[12%] text-center text-white">
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/60">Next stop</div>
        <div className="font-display text-3xl font-black">{placeName(s, to)}</div>
        <div className="text-sm text-white/70">{minutes >= 1 ? `${Math.round(minutes)} minute${Math.round(minutes) === 1 ? '' : 's'}` : `${Math.round(minutes * 60)} seconds`} through space</div>
      </div>
      <AnimatePresence>{n > 0 && <motion.div key={n} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-[38%] text-center font-display text-8xl font-black text-white">{n}</motion.div>}</AnimatePresence>
      <motion.div className="absolute bottom-[8%] left-1/2 -translate-x-1/2" animate={lift ? { y: '-120vh' } : { x: [0, -2, 2, -1, 1, 0] }} transition={lift ? { duration: 2, ease: [0.5, 0, 0.9, 0.4] } : { duration: 0.25, repeat: Infinity }}>
        <Rocket parts={s.parts} engine={s.engine} flame size={220} accent={accent} />
      </motion.div>
      {!lift && <motion.div className="absolute bottom-[6%] left-1/2 h-6 w-64 -translate-x-1/2 rounded-[50%] bg-white/20 blur-md" animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 0.4, repeat: Infinity }} />}
      <div className="absolute inset-x-0 bottom-4 text-center text-xs text-white/50">Tap to skip</div>
    </motion.div>
  );
}


