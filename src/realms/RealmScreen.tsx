// A realm plot (Crystal Mine, Sky Island, Inventor's Workshop, Restaurant, Dungeon): walk round it with your explorer.
// Step up to a station and its button appears (or tap a station in the bar along the bottom to walk there):
//   play     the signature minigame (anyone can play; the owner gets a cut of visitors' hauls)
//   collect  bring in what your producers made while you were away
//   build    producers and upgrades
//   make     recipes (bars, gadgets, dishes, potions…)
//   market   sell resources for the place's currency
//   book     the collection of rare finds, and the zones you've opened (and what's next)
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Lock, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Bag, ExplorerStyle, Realm, RealmFinish, RealmItem } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Button, Dialog, PlayerAvatar, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { sfx } from '../arcade/sfx';
import { fmt, gameIds, useRealmCore } from './core';
import { REALM_META } from './kinds';
import MineScreen from './mine/MineScreen';
import SkyScreen from './sky/SkyScreen';
import WorkshopScreen from './workshop/WorkshopScreen';
import DinerScreen from './diner/DinerScreen';
import DungeonScreen from './dungeon/DungeonScreen';
import BrawlScreen from '../brawl/BrawlScreen';
import { createRealm3D, STATIONS, type NearKey, type RealmScene, type Station } from './realm3d';
import { ESTATE_GAMES } from './estates/games';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
export const realmKey = (id: string) => ['realm', id] as const;

export default function RealmScreen() {
  const { id } = useParams();
  const q = useQuery({ queryKey: realmKey(id!), queryFn: () => api.realmGet(id!), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#0C0A12]"><Spinner /></div>;
  if (q.error || !q.data) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#0C0A12] p-6 text-center text-white"><div className="text-5xl">🗺️</div><p>This place couldn’t be found.</p><Link to="/world"><Button variant="secondary">Back to the map</Button></Link></div>;
  if (q.data.kind === 'mine') return <MineScreen id={q.data.id} />;
  if (q.data.kind === 'sky') return <SkyScreen id={q.data.id} />;
  if (q.data.kind === 'workshop') return <WorkshopScreen id={q.data.id} />;
  if (q.data.kind === 'diner') return <DinerScreen id={q.data.id} />;
  if (q.data.kind === 'dungeon') return <DungeonScreen id={q.data.id} />;
  if (q.data.kind === 'brawl') return <BrawlScreen id={q.data.id} />;
  return <RealmView key={q.data.id} r={q.data} />;
}

function RealmView({ r: initial }: { r: Realm }) {
  const nav = useNavigate();
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const [r, setR] = useState(initial);
  useEffect(() => setR(initial), [initial]);
  const cfg = r.cfg, meta = REALM_META[r.kind];
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<RealmScene | null>(null);
  const [near, setNear] = useState<NearKey | null>(null);
  const [games, setGames] = useState(false);
  // the place's other games, each on its own stand in the world (the signature game is at the play station)
  const extra = useMemo(() => gameIds(cfg).slice(1).map((id) => ({ id, emoji: cfg.games[id].emoji, name: cfg.games[id].name, level: cfg.games[id].level ?? 1, color: cfg.color })), [cfg]);
  useEffect(() => {
    if (!cv.current) return;
    const style = me?.profile.explorer_style as ExplorerStyle | undefined;
    scene.current = createRealm3D({
      canvas: cv.current, kind: r.kind, seed: r.seed, reduceMotion: reduce,
      explorerUrl: svgUrl(explorerSvg(style, me?.profile.accent_color ?? '#7B5CFF', 184)),
      zoneLevels: cfg.zones.map((z) => z.level), producerIds: Object.keys(cfg.producers), games: extra,
      onNear: (s) => setNear(s),
    });
    return () => { scene.current?.dispose(); scene.current = null; };
  }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const core = useRealmCore({ r, setR, burst: (at: string, e: string[]) => scene.current?.burst((at === 'play' && lastStand.current ? `game:${lastStand.current}` : at) as NearKey, e), extraGames: ESTATE_GAMES });
  const lastStand = useRef<string | null>(null);
  const { panel, setPanel, busy, collect, daily, game, wallet, have, cur, sorted, pending, pendingAny, zoneNow, zoneNext } = core;
  useEffect(() => { scene.current?.setState(r.level.level, r.producers, pendingAny); }, [r.level.level, r.producers, pendingAny]);
  const open = (s: NearKey) => {
    if (s.startsWith('game:')) { const id = s.slice(5); lastStand.current = id; if (r.level.level >= (cfg.games[id]?.level ?? 1)) core.openGame(id); else toast(`${cfg.games[id].emoji} ${cfg.games[id].name} opens at level ${cfg.games[id].level}`, { description: 'Play, build and make things here to level up.' }); return; }
    lastStand.current = null;
    if (s === 'collect') void collect(); else if (s === 'play') core.openGame(gameIds(cfg)[0]); else setPanel(s as Exclude<Station, 'play' | 'collect'>);
  };
  const gcfg = cfg.games[gameIds(cfg)[0]];
  const standLabel = (id: string) => { const g = cfg.games[id]; return r.level.level >= (g.level ?? 1) ? `${g.emoji} Play ${g.name}` : `🔒 ${g.emoji} ${g.name} · level ${g.level}`; };
  const nearLabel: Record<Station, string> = { play: `${gcfg.emoji} Play ${gcfg.name}`, collect: pendingAny ? `Collect ${Object.entries(pending).filter(([, v]) => v >= 1).slice(0, 3).map(([k, v]) => `${cfg.resources[k]?.emoji}${fmt(v)}`).join(' ')}` : 'Collect', build: `🏗️ ${meta.crew}`, make: `🔨 ${meta.make}`, market: `⚖️ ${meta.market}`, book: `📖 ${meta.book}` };
  const icons: Record<Station, string> = { play: gcfg.emoji, collect: '📦', build: '🏗️', make: '🔨', market: '⚖️', book: '📖' };

  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-black text-white" data-testid="realm" data-kind={r.kind}>
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="realm-canvas" />
      {/* top: where you are, the level, your wallet */}
      <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl bg-black/55 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 rounded-2xl bg-black/55 px-3 py-1.5 backdrop-blur">
            <div className="truncate font-display text-base font-black">{cfg.emoji} {r.name}</div>
            <div className="flex items-center gap-2 text-[11px] text-white/75">
              {!r.mine && <span className="flex items-center gap-1"><PlayerAvatar p={r.owner} size={14} /> @{r.owner.username}’s</span>}
              <span>📍 {zoneNow.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-2" data-testid="realm-level">
              <b className="text-xs" style={{ color: cfg.color }}>Lv {r.level.level}</b>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: `${r.level.max ? 100 : (r.level.into / Math.max(1, r.level.need)) * 100}%`, background: cfg.color }} /></div>
              {zoneNext && <span className="text-[10px] text-white/60">🔓 {zoneNext.name} at {zoneNext.level}</span>}
            </div>
          </div>
          {r.mine && r.me.bonus_ready && <button onClick={() => void daily()} className="pointer-events-auto rounded-xl bg-[#FFE14D] px-2.5 py-2 text-xs font-black text-black shadow-lg" data-testid="realm-daily">🎁 Daily</button>}
        </div>
        <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" data-testid="realm-wallet">
          <span className="shrink-0 rounded-full bg-black/60 px-2.5 py-1 text-xs font-black backdrop-blur" style={{ color: '#FFE14D' }}>{cur.emoji} {fmt(wallet[cfg.currency] ?? 0)}</span>
          {sorted.filter(([k]) => have(k) > 0).map(([k, v]) => <span key={k} className="shrink-0 rounded-full bg-black/50 px-2 py-1 text-xs font-bold backdrop-blur">{v.emoji} {fmt(have(k))}</span>)}
        </div>
      </div>
      {/* bottom: the station you're at, and a bar to get to any of them */}
      <div className="absolute inset-x-0 bottom-0 grid justify-items-center gap-2 p-3 pb-[max(14px,env(safe-area-inset-bottom,0px))]">
        <AnimatePresence>
          {near && !panel && !game && (
            <motion.div key={near} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
              <Button variant="rainbow" size="lg" loading={busy === near || (near === 'play' && busy === 'play')} onClick={() => open(near)} data-testid="realm-action" data-near={near}>{near.startsWith('game:') ? standLabel(near.slice(5)) : nearLabel[near as Station]}</Button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex gap-1.5 rounded-2xl bg-black/55 p-1.5 backdrop-blur" data-testid="realm-stations">
          {STATIONS.map((s) => (
            <button key={s} onClick={() => { scene.current?.walkTo(s); open(s); }} className={cn('relative grid h-11 w-11 place-items-center rounded-xl text-xl', near === s ? 'bg-white/25' : 'bg-white/5 hover:bg-white/15')} aria-label={nearLabel[s]} data-testid={`realm-go-${s}`}>
              {s === 'play' ? gcfg.emoji : icons[s]}
              {s === 'collect' && pendingAny && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[#FFE14D] shadow" />}
            </button>
          ))}
          {extra.length > 0 && (
            <button onClick={() => setGames(true)} className="relative grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-xl hover:bg-white/15" aria-label="All games here" data-testid="realm-games">🎮
              <span className="absolute -right-1 -top-1 rounded-full bg-[#FFE14D] px-1 text-[9px] font-black text-black">{extra.length + 1}</span>
            </button>
          )}
        </div>
      </div>

      {/* every game in the place: tap one to walk to its stand and play */}
      <Dialog open={games} onOpenChange={setGames} title={<>🎮 Games at {r.name}</>} description={`${gameIds(cfg).length} games — each pays out ${cur.emoji} resources from this place. More open as it levels up.`}>
        <div className="grid grid-cols-2 gap-2" data-testid="realm-games-list">
          {gameIds(cfg).map((id, i) => { const g = cfg.games[id], off = r.level.level < (g.level ?? 1); return (
            <button key={id} disabled={off} onClick={() => { setGames(false); const k: NearKey = i === 0 ? 'play' : `game:${id}`; scene.current?.walkTo(k); open(k); }} className={cn('grid justify-items-center gap-1 rounded-2xl bg-surface-2 p-3 text-center hover:bg-surface-3', off && 'opacity-50')} data-testid={`realm-list-${id}`}>
              <span className={cn('text-4xl', off && 'grayscale')}>{g.emoji}</span><b className="text-sm">{g.name}</b>
              <span className="text-[11px] text-muted">{off ? `🔒 Level ${g.level}` : i === 0 ? 'Signature game' : `Best: ${r.me.best[id] ?? 0}`}</span>
            </button>
          ); })}
        </div>
      </Dialog>

      {core.dialogs}
    </div>
  );
}

