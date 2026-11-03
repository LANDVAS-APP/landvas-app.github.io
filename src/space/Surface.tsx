// /space/surface — the world your rocket landed on, as a real 3D globe. Walk all the way round it in
// third person (joystick, WASD/arrows, or tap the ground) with your Inkborn in a bubble helmet,
// gather the day's glowing samples, buy plots on the shared map (everyone sees whose flag is where),
// play your plots' two games, see who else is exploring, pull out to orbit to see the whole planet —
// and on a far-off world, settle it as your home.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronUp, Flag, Footprints, Globe2, Home, MapPin, Minus, Pencil, Plus, Rocket as RocketIcon, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { toGameError } from '../backend/backend';
import type { PlanetMap, PlanetPlot, SpaceState } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { cleanGenome } from '../inkborn/genome';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Button, Dialog, ResourceIcon, Spinner, inputCls } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { createPlanetScene, type PlanetScene } from './planet3d';
import { PLANET_GAMES } from './planetGames';
import { cellKey, cellLabel, type Cell } from './planetGrid';
import { SPACE_KEY, useFlight, useSpace } from './useSpace';
import { type World, worldKey, worldOf } from './worlds';

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
  return <Ground key={s.location} s={s} w={w} />;
}

const SAMPLES = 5;
export const planetKey = (world: string) => ['planet', world] as const;
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const seedOf = (loc: string) => (loc.startsWith('exo:') ? Number(loc.slice(4)) : [...loc].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7));

function Ground({ s, w }: { s: SpaceState; w: World }) {
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
  const map = useQuery({ queryKey: planetKey(world), queryFn: () => api.planetMap(world), enabled: canPlots, refetchInterval: 15_000 });
  const sanct = useQuery({ queryKey: ['sanctuaries'], queryFn: api.mySanctuaries, enabled: !!me, staleTime: 60_000 });
  const buddy = sanct.data?.creatures.find((c) => !c.job) ?? null;
  const buddyGenome = useMemo(() => (buddy ? cleanGenome(buddy.genome) : null), [buddy?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = map.data?.rows ?? (s.config.worlds[worldKey(world)] as { size?: number } | undefined)?.size ?? 16;
  const [cell, setCell] = useState<Cell | null>(null);
  const [orbit, setOrbit] = useState(false);
  const [got, setGot] = useState(0);
  const [paid, setPaid] = useState<{ paid: number; first: number } | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
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

  // build the world once we know its grid (and who your buddy is)
  const waitForMap = canPlots && !map.data && !map.isError;
  useEffect(() => {
    if (waitForMap || !cv.current) return;
    let sc: PlanetScene;
    try {
      sc = createPlanetScene({
        canvas: cv.current, world: w, rows, seed: seedOf(world), accent: me?.profile.accent_color ?? '#8B5CFF',
        explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 184)),
        buddy: buddyGenome, isHome, samples: taken ? 0 : SAMPLES, reduceMotion: reduce,
        onCell: setCell, onPick: setCell, onMode: setOrbit,
        onSample: (n) => { setGot(n); if (n === SAMPLES) void collect(); },
      });
    } catch (e) {
      console.error(e);
      toast.error('Your device couldn’t start the 3D view.', { description: 'Try closing other apps or tabs.' });
      return;
    }
    scene.current = sc;
    setReady(true);
    return () => { sc.dispose(); scene.current = null; };
  }, [waitForMap, buddyGenome, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the plots and explorers on the globe current
  useEffect(() => { if (ready && map.data) scene.current?.setPlots(map.data.plots); }, [ready, map.data]);
  // walk together: a heartbeat finds (and keeps) your live group of up to 10 and drops you next to
  // someone; in between, positions stream to the group over a realtime channel
  const [live, setLive] = useState<{ with: number; onWorld: number; size: number } | null>(null);
  useEffect(() => {
    if (!ready || !me) return;
    const backend = getBackend();
    const myId = me.profile.id;
    let stopped = false, ch: { send(m: unknown): void; close(): void } | null = null, chName = '';
    let members = new Set<string>();
    let lastSent = 0, lastKey = '';
    const onMsg = (m: unknown) => {
      const x = m as { id?: string; d?: number[]; f?: number[]; h?: number };
      if (x?.id && members.has(x.id) && x.d && x.f) scene.current?.remote(x.id, x.d, x.f, x.h ?? 0);
    };
    const beat = async (first = false) => {
      const sc = scene.current; if (!sc || stopped) return;
      const pose = sc.pose();
      try {
        const r = await api.planetLive(world, pose.d, pose.face, pose.hop);
        if (stopped) return;
        if (r.joined && r.spawn && first) {
          sc.teleport(r.spawn.d);
          const who = r.members.find((m) => m.id === r.spawn!.player);
          if (who) toast(`You landed next to @${who.username} 👋`, { description: 'Walk together — everyone in your group sees you move live.' });
        }
        members = new Set(r.members.map((m) => m.id));
        if (!(window as { __landvasLiveFreeze?: boolean }).__landvasLiveFreeze) sc.setLive(r.members.map((m) => ({ id: m.id, username: m.username, d: m.d, face: m.face, hop: m.hop,
          explorerUrl: svgUrl(explorerSvg(m.explorer_style as never, m.accent_color ?? '#7B5CFF', 184)) })));
        if (r.channel !== chName) { ch?.close(); chName = r.channel; ch = backend.liveChannel?.(r.channel, onMsg) ?? null; }
        setLive({ with: r.members.length, onWorld: r.on_world, size: r.group_size });
      } catch (e) {
        const err = toGameError(e);
        if (err.code === 'land_first') stopped = true;
      }
    };
    void beat(true);
    const hb = setInterval(() => void beat(), backend.mode === 'local' ? 1000 : 2000);
    const tx = setInterval(() => {
      const sc = scene.current; if (!sc || !ch) return;
      const p = sc.pose();
      const key = p.d.map((n) => n.toFixed(4)).join() + p.hop.toFixed(2);
      const now = performance.now();
      if (key !== lastKey || now - lastSent > 1000) { lastKey = key; lastSent = now; ch.send({ id: myId, d: p.d, f: p.face, h: p.hop }); }
    }, 100);
    return () => { stopped = true; clearInterval(hb); clearInterval(tx); ch?.close(); void api.planetLeave().catch(() => {}); };
  }, [ready, world, me?.profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const plotAt = (c: Cell | null) => (c && map.data ? map.data.plots.find((p) => p.gx === c.gx && p.gy === c.gy) ?? null : null);
  const here = plotAt(cell);
  const mine = (map.data?.plots ?? []).filter((p) => p.mine);

  const claim = async () => {
    if (!cell) return;
    setBusy(true);
    try {
      const r = await api.planetClaim(world, cell.gx, cell.gy);
      qc.setQueryData(planetKey(world), r);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['planet-mine'] });
      confettiCannons();
      toast.success(`Plot claimed on ${w.name}! 🚩`, { description: `-${r.paid} Ink · its two games are ready to play.` });
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
  const cfg = s.config.worlds[worldKey(s.location)];

  return (
    <div className="lv-space fixed inset-0 select-none overflow-hidden bg-black text-white" data-testid="surface">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" aria-label={`${w.name} in 3D. Walk with the joystick, WASD or the arrow keys, or tap the ground; drag to look around; space to jump.`} data-testid="surface-canvas" />
      {!ready && <div className="absolute inset-0 grid place-items-center bg-[#05060F]"><div className="grid justify-items-center gap-2 text-sm text-white/70"><Spinner />Descending to {w.name}…</div></div>}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl bg-black/55 p-1.5 pr-3 backdrop-blur">
          <button onClick={() => nav('/space')} className="rounded-xl p-2 hover:bg-white/10" aria-label="Back to mission control"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-bold">{w.name}{isHome ? ' · home' : ''}</div>
            <div className="truncate text-[11px] text-white/70">Gravity {w.gravity}× · {taken && !paid ? 'samples collected' : `samples ${got}/${SAMPLES}`}</div>
          </div>
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5">
          {w.kind === 'exo' && !isHome && <Button size="sm" variant="rainbow" onClick={() => { setName(w.name.split(' (')[0]); setSettleOpen(true); }} data-testid="settle"><Home className="h-4 w-4" /> Settle here</Button>}
          <button className={cn('lv-gbtn round', orbit && 'on')} onClick={() => scene.current?.setOrbit(!orbit)} aria-label={orbit ? 'Back to walking' : 'Orbit view'} data-testid="orbit-toggle">
            {orbit ? <Footprints className="h-5 w-5" /> : <Globe2 className="h-5 w-5" />}
          </button>
          <button className="lv-gbtn round" onClick={() => nav('/space')} aria-label="Your rocket"><RocketIcon className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-[calc(max(12px,env(safe-area-inset-top,0px))+58px)] flex flex-col items-start gap-1.5">
        {live && (
          <span className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px]" data-testid="live-group">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4FD18B]" /><Users className="h-3 w-3" />
            {live.with ? `${live.with + 1}/${live.size} exploring together` : 'Just you here right now'}{live.onWorld > live.with + 1 ? ` · ${live.onWorld} on ${w.name.replace('The ', 'the ')}` : ''}
          </span>
        )}
        {canPlots && map.data && (
          <button className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px]" onClick={() => setListOpen(true)} data-testid="my-planet-plots">
            <Flag className="h-3 w-3" /> {mine.length ? `My plots here (${mine.length})` : `${map.data.plots.length} plots claimed`}
          </button>
        )}
      </div>

      <AnimatePresence>
        {paid && (
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-28 mx-auto w-fit max-w-[calc(100%-24px)] rounded-2xl bg-black/70 px-4 py-3 text-center" data-testid="samples-paid">
            <div className="font-display text-lg font-bold">All samples collected! 🪨✨</div>
            <div className="flex items-center justify-center gap-1 text-sm">+{paid.paid} <ResourceIcon r="ink" className="h-4 w-4" />{paid.first > 0 && <> · first-visit bonus +{paid.first} <ResourceIcon r="ink" className="h-4 w-4" /></>}</div>
          </motion.div>
        )}
      </AnimatePresence>
      {taken && !paid && ready && !orbit && got === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-28 mx-auto w-fit max-w-[calc(100%-24px)] rounded-2xl bg-black/50 px-3 py-1.5 text-center text-[11px] text-white/80">
          Today’s samples are in (+{cfg?.sample ?? 0} Ink a day). Explore, claim plots, or fly on.
        </div>
      )}

      {/* the plot under you */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(16px,env(safe-area-inset-bottom,0px))+140px)] flex justify-center px-3 sm:bottom-[max(16px,env(safe-area-inset-bottom,0px))]">
        {ready && canPlots && map.data && (
          <PlotCard map={map.data} cell={cell} plot={here} orbit={orbit} busy={busy} rows={rows}
            onClaim={claim} onWalk={() => cell && scene.current?.walkTo(cell)}
            onRename={() => { setName(here?.name ?? ''); setRenameOpen(true); }}
            onPlay={(g) => cell && nav(`/space/planet/${encodeURIComponent(world)}/${cell.gx}/${cell.gy}/${g}`)} />
        )}
        {ready && !canPlots && (
          <div className="pointer-events-auto rounded-2xl bg-black/60 px-4 py-2 text-center text-xs text-white/80 backdrop-blur">Uncharted world — settle it to lay out plots of your own.</div>
        )}
      </div>

      {/* controls */}
      {!orbit ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))]">
          <Stick onMove={(x, y) => { const sc = scene.current; if (sc) { sc.joy.x = x; sc.joy.y = y; } }} />
          <button className="pointer-events-auto flex h-20 w-20 select-none items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur active:bg-white/25"
            onPointerDown={(e) => { e.preventDefault(); scene.current?.jump(); }} aria-label="Jump" data-testid="jump"><ChevronUp className="h-9 w-9" /></button>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-0 right-0 flex flex-col gap-2 p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))]">
          <button className="lv-gbtn round pointer-events-auto" onClick={() => scene.current?.zoom(0.8)} aria-label="Zoom in"><Plus className="h-5 w-5" /></button>
          <button className="lv-gbtn round pointer-events-auto" onClick={() => scene.current?.zoom(1.25)} aria-label="Zoom out"><Minus className="h-5 w-5" /></button>
        </div>
      )}
      {orbit && <div className="pointer-events-none absolute inset-x-0 top-28 mx-auto w-fit rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80">Drag to spin the planet · tap a plot to look at it</div>}

      <Dialog open={listOpen} onOpenChange={setListOpen} title={`Plots on ${w.name}`} description={map.data ? `${map.data.plots.length} claimed by explorers so far. A new plot costs you ${map.data.price} Ink here.` : undefined}>
        <div className="grid max-h-[50vh] gap-1.5 overflow-y-auto">
          {(mine.length ? mine : (map.data?.plots ?? [])).map((p) => (
            <button key={cellKey(p)} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-left hover:bg-surface-3"
              onClick={() => { setListOpen(false); scene.current?.walkTo(p); }}>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.owner.accent ?? '#8B5CFF' }} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name || (p.mine ? 'My plot' : `@${p.owner.username}`)}</span>
              <span className="text-[11px] text-muted">{cellLabel(p, rows)}</span>
              <MapPin className="h-4 w-4 text-muted" />
            </button>
          ))}
          {!map.data?.plots.length && <p className="text-sm text-muted">No one has claimed a plot here yet — be the first!</p>}
        </div>
      </Dialog>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen} title="Name your plot" description="Everyone exploring this world sees it on your flag.">
        <div className="grid gap-3">
          <input className={inputCls} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Crater Cove" data-testid="planet-plot-name" />
          <Button variant="rainbow" loading={busy} onClick={rename}>Save</Button>
        </div>
      </Dialog>
      <Dialog open={settleOpen} onOpenChange={setSettleOpen} title="Settle this world" description="Make it your home world. Your dome goes up by the rocket, it gets a plot map of its own that only you can build on, and you can fly back from mission control any time.">
        <div className="grid gap-3">
          <input className={inputCls} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Name your world" data-testid="settle-name" />
          <Button variant="rainbow" loading={busy} disabled={!name.trim()} onClick={settle} data-testid="settle-go"><Home className="h-4 w-4" /> Make it home</Button>
        </div>
      </Dialog>
    </div>
  );
}

function PlotCard({ map, cell, plot, orbit, busy, rows, onClaim, onWalk, onRename, onPlay }: {
  map: PlanetMap; cell: Cell | null; plot: PlanetPlot | null; orbit: boolean; busy: boolean; rows: number;
  onClaim(): void; onWalk(): void; onRename(): void; onPlay(game: string): void;
}) {
  const card = 'pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-black/65 p-3 text-white shadow-xl backdrop-blur';
  if (!cell) return <div className={cn(card, 'text-center text-xs text-white/75')}>{orbit ? 'Tap a plot on the globe.' : 'The polar wilds — no plots out here. Head toward the equator.'}</div>;
  const where = <span className="text-[11px] text-white/60">{cellLabel(cell, rows)}</span>;
  if (plot?.mine) return (
    <div className={card} data-testid="planet-plot-mine">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 shrink-0" style={{ color: plot.owner.accent ?? '#FFE36B' }} />
        <div className="min-w-0 flex-1 truncate font-display font-bold">{plot.name || 'Your plot'}</div>
        {where}
        <button onClick={onRename} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Rename plot"><Pencil className="h-4 w-4" /></button>
      </div>
      {orbit ? <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={onWalk}><Footprints className="h-4 w-4" /> Walk here</Button> : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {map.games.map((g) => { const info = PLANET_GAMES[g]; return (
            <button key={g} onClick={() => onPlay(g)} className="flex items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-left hover:bg-white/20" data-testid={`planet-game-${g}`}>
              <span className="text-2xl">{info?.emoji ?? '🎮'}</span><span className="min-w-0 truncate text-sm font-bold">{info?.name ?? g}</span>
            </button>
          ); })}
        </div>
      )}
      <div className="mt-1.5 text-center text-[10px] text-white/55">Planet Ink today {map.ink_today}/{map.daily_cap}</div>
    </div>
  );
  if (plot) return (
    <div className={cn(card, 'flex items-center gap-2')}>
      <Flag className="h-4 w-4 shrink-0" style={{ color: plot.owner.accent ?? '#fff' }} />
      <div className="min-w-0 flex-1"><div className="truncate font-bold">{plot.name || `@${plot.owner.username}’s plot`}</div><div className="text-[11px] text-white/60">Claimed by @{plot.owner.username}</div></div>
      {orbit ? <Button size="sm" variant="secondary" onClick={onWalk}>Visit</Button> : where}
    </div>
  );
  return (
    <div className={cn(card, 'flex items-center gap-2')} data-testid="planet-plot-free">
      <div className="min-w-0 flex-1"><div className="font-bold">Unclaimed plot</div>{where}</div>
      {orbit ? <Button size="sm" variant="secondary" onClick={onWalk}><Footprints className="h-4 w-4" /> Walk here</Button>
        : map.landed ? <Button size="sm" variant="rainbow" loading={busy} onClick={onClaim} data-testid="planet-claim"><Flag className="h-4 w-4" /> Claim · {map.price} <ResourceIcon r="ink" className="h-3.5 w-3.5" /></Button>
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
