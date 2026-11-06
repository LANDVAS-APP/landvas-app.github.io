// An arcade plot: walk round the hall with your explorer. Step up to a cabinet and "Play" appears; tap it and the
// camera glides in until the cabinet's screen fills the view, then the game runs on that screen. Scores win
// tickets (and a little Ink); the prize counter at the back swaps tickets for prizes that go on your shelves;
// the ticket machine by the door pays a daily bonus. Owners level the arcade up by having it played, then buy
// new cabinets, upgrade them (more tickets a round) and pick the floor, neon and light show.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Infinity as InfinityIcon, Lock, Music, Play, RotateCcw, Trophy, Volume2, VolumeX, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Arcade, ArcadeCosmetic, ArcadeFinish, ArcadeMatch, ArcadeMe, ArcadeMode, ExplorerStyle } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Button, Dialog, PlayerAvatar, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { ARENAS as ARENAS1, BONUS as BONUS1, ENDLESS as ENDLESS1, HOW as HOW1 } from './games';
import { ARENAS2, BONUS2, ENDLESS2, HOW2 } from './games2';
import { createHall, type HallScene, type HallSpot } from './hall3d';
import { music } from './music';
import { InviteBanner, LobbyPanel, MatchButtons, MatchResults, MatchStrip, useArcadeLive } from './party';
import { scoreBus } from './games';
import { isMuted, setMuted, sfx } from './sfx';
import { ArenaRoom } from './live/ArenaRoom';

const ARENAS = { ...ARENAS1, ...ARENAS2 }, HOW = { ...HOW1, ...HOW2 }, BONUS = { ...BONUS1, ...BONUS2 }, ENDLESS = { ...ENDLESS1, ...ENDLESS2 };
export const arcadeKey = (id: string) => ['arcade', id] as const;
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const tix = (n: number) => Math.round(n).toLocaleString();
/** re-render when the jukebox changes */
const useMusic = () => useSyncExternalStore(music.subscribe, () => `${music.current}|${music.volume}|${music.playing}`);
const BONUS_LABEL: Record<string, string> = { hot: '🔥 Hot cabinet — double tickets', first: '✨ First play of the day bonus' };

export default function ArcadeScreen() {
  const { id } = useParams();
  const q = useQuery({ queryKey: arcadeKey(id!), queryFn: () => api.arcadeGet(id!), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#05040F]"><Spinner /></div>;
  if (q.error || !q.data) {
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#05040F] p-6 text-center text-white">
        <div className="text-5xl">🕹️</div><p>This arcade couldn’t be found.</p>
        <Link to="/world"><Button variant="secondary">Back to the map</Button></Link>
      </div>
    );
  }
  return <ArcadeOrArena a={q.data} />;
}

/** The arcade, or (through its portal) the shared Live Arena. */
function ArcadeOrArena({ a }: { a: Arcade }) {
  const [room, setRoom] = useState<'arcade' | 'arena'>(() => (new URLSearchParams(location.search).get('room') === 'arena' ? 'arena' : 'arcade'));
  useEffect(() => { sfx.blip(14); }, [room]);
  return room === 'arena' ? <ArenaRoom from={a.id} onBack={() => setRoom('arcade')} /> : <ArcadeView a={a} onArena={() => setRoom('arena')} />;
}

/** A handful of regulars hanging round the cabinets (more as the arcade levels up). */
function regulars(seed: number, n: number) {
  const pick = <T,>(xs: T[], k: number) => xs[(seed * 7 + k * 13) % xs.length];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const st: ExplorerStyle = { sex: i % 2 ? 'f' : 'm', hair: pick(['short', 'long', 'curly', 'ponytail', 'spiky', 'bob', 'bun'], i), hairc: pick(['brown', 'black', 'blonde', 'red', 'pink', 'blue'], i + 3),
      skin: pick(['peach', 'light', 'tan', 'brown', 'deep'], i + 1), hat: pick(['none', 'cap', 'headphones', 'none', 'beret'], i + 2), hold: 'brush', body: i % 2 ? pick(['classic', 'skirt', 'dress'], i) : 'classic' };
    out.push(svgUrl(explorerSvg(st, pick(['#7B5CFF', '#FF4D6D', '#22C7B5', '#FF9F1C', '#34C3FF'], i), 160)));
  }
  return out;
}

function ArcadeView({ a, onArena }: { a: Arcade; onArena(): void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const cv = useRef<HTMLCanvasElement>(null);
  const hall = useRef<HallScene | null>(null);
  const [near, setNear] = useState<HallSpot | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'prizes' | 'scores' | 'manage' | 'jukebox' | null>(null);
  const tune = useMusic();
  const [mute, setMute] = useState(isMuted());
  const [meState, setMeState] = useState<ArcadeMe>(a.me);
  useEffect(() => setMeState(a.me), [a.me]);
  const title = /^untitled/i.test(a.name.trim()) || !a.name.trim() ? `${a.owner.username}’s Arcade` : a.name;
  const games = useMemo(() => Object.entries(a.games).sort((x, y) => x[1].order - y[1].order), [a.games]);
  const prizeEmoji = useMemo(() => Object.fromEntries(a.prizes.map((p) => [p.id, p.emoji])), [a.prizes]);

  useEffect(() => {
    if (!cv.current) return;
    const h = createHall({
      canvas: cv.current, seed: a.seed, reduceMotion: reduce,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 184)),
      onNear: (s) => { setNear(s); if (s) sfx.blip(s.kind === 'machine' ? 7 : 12); },
    });
    hall.current = h;
    if (import.meta.env.DEV || location.search.includes('e2e=1')) (window as unknown as { __landvasArcade: HallScene }).__landvasArcade = h;
    return () => { h.dispose(); hall.current = null; };
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // what's in the hall
  useEffect(() => {
    const h = hall.current; if (!h) return;
    h.setMachines(games.map(([id, g]) => ({ id, name: g.name, color: g.color, emoji: g.emoji, level: a.machines[id] ?? 0, locked: !(id in a.machines), lockLabel: `LV ${g.level}` })));
    h.setRegulars(regulars(a.seed, Math.min(5, 1 + Math.floor(a.level.level / 2))));
  }, [games, a.machines, a.level.level, a.seed]);
  useEffect(() => { hall.current?.setDecor(a.decor, title); }, [a.decor, title]);
  useEffect(() => { hall.current?.setShelf(Object.entries(a.shelf).map(([k, n]) => ({ emoji: prizeEmoji[k] ?? '🎁', n }))); }, [a.shelf, prizeEmoji]);
  useEffect(() => { hall.current?.setBonus(meState.bonus_ready); }, [meState.bonus_ready]);
  useEffect(() => { hall.current?.setPaused(!!sheet && !playing); }, [sheet, playing]);
  useEffect(() => { hall.current?.setHot(a.hot?.game ?? null); }, [a.hot?.game]);
  // the jukebox: starts with your first tap (browsers need one before any sound), a bit quieter on a cabinet
  useEffect(() => {
    const go = () => { if (!isMuted() && music.current) music.play(); };
    window.addEventListener('pointerdown', go, { once: true });
    return () => { window.removeEventListener('pointerdown', go); music.stop(false); };
  }, []);
  useEffect(() => { music.setDuck(!!playing); }, [playing]);
  useEffect(() => { hall.current?.setMusic(music.playing && !!music.current); }, [tune]);
  const hotGame = a.hot?.game && a.games[a.hot.game] && a.hot.game in a.machines ? a.games[a.hot.game] : null;
  // together: the live room (others walking about), open lobbies and your match
  const myId = me?.user_id;
  const liveRoom = useArcadeLive({ arcadeId: a.id, myId, hall, playing });
  const live = liveRoom.live;
  const [matchOn, setMatchOn] = useState<ArcadeMatch | null>(null);
  const handled = useRef(new Set<string>());
  useEffect(() => {
    // the host pressed Start: everyone in the match steps up to the cabinet together
    const m = live?.match;
    if (!m || m.status !== 'playing' || handled.current.has(m.id) || !myId) return;
    const mine = m.players.find((p) => p.id === myId);
    if (!mine?.session || mine.finished) return;
    handled.current.add(m.id);
    setMatchOn(m);
    setSheet(null);
    void (async () => { if (playing !== m.game) { hall.current?.walkTo({ kind: 'machine', id: m.game }); await hall.current?.zoomIn(m.game); } setPlaying(m.game); })();
  }, [live?.match, myId]); // eslint-disable-line react-hooks/exhaustive-deps
  const lobby = live?.match?.status === 'lobby' ? live.match : null;

  const refresh = (next?: Arcade) => { if (next) qc.setQueryData(arcadeKey(a.id), next); else void qc.invalidateQueries({ queryKey: arcadeKey(a.id) }); };
  const play = async (id: string) => {
    sfx.coin();
    await hall.current?.zoomIn(id);
    setPlaying(id);
  };
  const stopPlaying = () => { setPlaying(null); setMatchOn(null); hall.current?.zoomOut(); refresh(); };
  const daily = async () => {
    try {
      const r = await api.arcadeDaily();
      setMeState(r.me); sfx.tickets(r.tickets); confettiCannons(); invalidateGame(qc);
      toast.success(`🎟️ +${r.tickets} tickets${r.paid ? ` · +${r.paid} Ink` : ''}`, { description: r.streak > 1 ? `${r.streak} days in a row — come back tomorrow for more!` : 'Come back tomorrow for a bigger bonus.' });
    } catch (e) { toast(toGameError(e).message); }
  };

  const nearGame = near?.kind === 'machine' ? a.games[near.id] : null;
  const nearLocked = near?.kind === 'machine' && !(near.id in a.machines);
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05040F] text-white" data-testid="arcade">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="arcade-hall" />
      {/* top bar */}
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))] transition-opacity', playing && 'opacity-0')}>
        <button onClick={() => nav(-1)} className="pointer-events-auto rounded-xl bg-black/55 p-2" aria-label="Leave the arcade"><ArrowLeft className="h-5 w-5" /></button>
        <button onClick={() => nav('/home')} className="pointer-events-auto rounded-xl bg-black/55 p-2 text-lg leading-none" aria-label="Go home" title="Your home" data-testid="go-home">🏠</button>
        <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl bg-black/55 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <div className="lv-arc-marquee min-w-0 truncate text-base" style={{ ['--glow' as string]: '#FF3D9A' }}>{title}</div>
            <span className="shrink-0 rounded-full bg-[#8B5CFF] px-1.5 text-[10px] font-black">LV {a.level.level}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" title={`${a.level.into}/${a.level.need} XP`}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#FF3D9A] to-[#22E3FF]" style={{ width: a.level.max ? '100%' : `${(a.level.into / Math.max(1, a.level.need)) * 100}%` }} />
          </div>
          {!a.mine && <div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/60"><PlayerAvatar p={a.owner} size={14} /> @{a.owner.username}’s arcade</div>}
          {live && <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[#3DDC97]" data-testid="arcade-here"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3DDC97]" /> {live.members.length + 1}/{live.room_size} in this room{live.in_arcade > live.members.length + 1 ? ` · ${live.in_arcade} in the arcade` : ''}</div>}
          {hotGame && <div className="mt-1 text-[10px] font-bold text-[#FFB13D]" data-testid="arcade-hot">🔥 Hot this hour: {hotGame.emoji} {hotGame.name} — ×{a.hot!.tickets} tickets</div>}
        </div>
        <div className="pointer-events-auto grid justify-items-end gap-1.5">
          <div className="lv-arc-ticket text-sm" data-testid="arcade-tickets">🎟️ {tix(meState.tickets)}</div>
          <InkMeter p={meState.ink_progress ?? 0} />
          <button onClick={() => { setMuted(!mute); setMute(!mute); if (!mute) music.stop(false); else if (music.current) music.play(); }} className="rounded-xl bg-black/55 p-1.5" aria-label={mute ? 'Sound on' : 'Sound off'}>{mute ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
        </div>
      </div>
      {!playing && live && myId && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(12px,env(safe-area-inset-top,0px))+86px)] z-20 px-16">
          <InviteBanner a={a} live={live} myId={myId} onJoined={() => liveRoom.refresh()} />
        </div>
      )}
      {/* side buttons */}
      {!playing && (
        <div className="absolute right-3 top-[calc(max(12px,env(safe-area-inset-top,0px))+92px)] grid gap-2">
          <button onClick={onArena} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" style={{ boxShadow: 'inset 0 0 0 1.5px #FFE14D' }} data-testid="arcade-arena-btn"><span className="text-lg leading-none">⚔️</span>Live</button>
          <button onClick={() => setSheet('scores')} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" data-testid="arcade-scores"><Trophy className="h-5 w-5 text-[#FFE14D]" />Scores</button>
          <button onClick={() => setSheet('prizes')} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" data-testid="arcade-prizes-btn"><span className="text-lg leading-none">🎁</span>Prizes</button>
          <button onClick={() => setSheet('jukebox')} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" data-testid="arcade-jukebox-btn"><Music className="h-5 w-5 text-[#22E3FF]" />Music</button>
          {a.mine && <button onClick={() => setSheet('manage')} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" data-testid="arcade-manage"><Wrench className="h-5 w-5" />Manage</button>}
        </div>
      )}
      {/* what you're standing at */}
      <AnimatePresence>
        {!playing && lobby && myId && (
          <motion.div key="lobby" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <LobbyPanel a={a} m={lobby} myId={myId} onChange={() => liveRoom.refresh()} />
          </motion.div>
        )}
        {!playing && !lobby && near && (
          <motion.div key={near.kind === 'machine' ? near.id : near.kind} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            {near.kind === 'machine' && nearGame && !nearLocked && (
              <button onClick={() => void play(near.id)} className="lv-arc-play flex items-center gap-3 rounded-3xl px-5 py-3 text-left shadow-2xl" style={{ background: `linear-gradient(135deg, ${nearGame.color}, #8B5CFF)`, boxShadow: `0 0 40px ${nearGame.color}` }} data-testid="arcade-play">
                <span className="text-4xl">{nearGame.emoji}</span>
                <span><span className="block text-xs font-bold uppercase tracking-widest text-white/80">Free play</span><span className="flex items-center gap-1.5 font-display text-2xl font-black"><Play className="h-5 w-5 fill-white" /> Play {nearGame.name}</span>
                  <span className="block text-[11px] text-white/80">Your best: {meState.best[near.id] ?? '—'} · Record: {a.boards[near.id]?.[0]?.score ?? '—'}{(a.machines[near.id] ?? 1) > 1 ? ` · +${Math.round((a.machines[near.id] - 1) * a.upgrade.bonus * 100)}% tickets` : ''}</span>
                  {a.hot?.game === near.id && <span className="mt-0.5 block text-[11px] font-black text-[#FFE14D]">🔥 HOT — ×{a.hot.tickets} tickets this hour</span>}</span>
              </button>
            )}
            {near.kind === 'machine' && nearGame && !nearLocked && myId && <MatchButtons arcade={a.id} game={near.id} onMatch={() => liveRoom.refresh()} />}
            {near.kind === 'machine' && nearGame && nearLocked && (
              <div className="flex items-center gap-3 rounded-3xl bg-black/75 px-5 py-3">
                <Lock className="h-6 w-6 text-white/60" />
                <div><div className="font-display text-lg font-black">{nearGame.emoji} {nearGame.name}</div>
                  <div className="text-xs text-white/70">{a.mine ? (a.level.level >= nearGame.level ? `Install it for ${nearGame.cost} 🎟️` : `Reach arcade level ${nearGame.level} to install it`) : 'Coming soon to this arcade'}</div></div>
                {a.mine && a.level.level >= nearGame.level && <Button size="sm" variant="rainbow" disabled={meState.tickets < nearGame.cost} onClick={async () => { try { const n = await api.arcadeUnlock(a.id, near.id); refresh(n); sfx.jackpot(); confettiCannons(); toast.success(`${nearGame.name} installed!`); } catch (e) { toast.error(toGameError(e).message); } }} data-testid="arcade-install">Install</Button>}
              </div>
            )}
            {near.kind === 'door' && (
              <button onClick={onArena} className="lv-arc-play flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#FFE14D] to-[#FF3D9A] px-5 py-3 text-left text-[#2A0A1A] shadow-2xl" data-testid="arcade-door"><span className="text-4xl">⚔️</span>
                <span><span className="block font-display text-2xl font-black">Enter the Live Arena</span><span className="block text-xs font-bold">Live 1v1, 2v2, free-for-all & co-op games with players from every arcade</span></span></button>
            )}
            {near.kind === 'prizes' && (
              <button onClick={() => setSheet('prizes')} className="lv-arc-play flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#FFB13D] to-[#FF3D9A] px-5 py-3 shadow-2xl" data-testid="arcade-counter"><span className="text-4xl">🎁</span><span className="font-display text-2xl font-black">Prize counter</span></button>
            )}
            {near.kind === 'jukebox' && (
              <button onClick={() => setSheet('jukebox')} className="lv-arc-play flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#7A3A1A] to-[#FF3D9A] px-5 py-3 shadow-2xl" data-testid="arcade-jukebox"><span className="text-4xl">🎵</span>
                <span><span className="block font-display text-2xl font-black">Jukebox</span><span className="block text-xs text-white/80">{music.current ? `Now playing: ${music.tracks.find((t) => t.id === music.current)?.name ?? ''}` : 'Pick a song'}</span></span></button>
            )}
            {near.kind === 'bonus' && (
              <button onClick={daily} disabled={!meState.bonus_ready} className={cn('lv-arc-play flex items-center gap-3 rounded-3xl px-5 py-3 shadow-2xl', meState.bonus_ready ? 'bg-gradient-to-br from-[#FFE14D] to-[#FF7A3D] text-[#3A1A00]' : 'bg-black/75')} data-testid="arcade-daily">
                <span className="text-4xl">🎟️</span><span><span className="block font-display text-2xl font-black">{meState.bonus_ready ? 'Daily tickets!' : 'Come back tomorrow'}</span>
                  <span className="block text-xs">{meState.streak > 0 ? `${meState.streak}-day streak` : 'More every day in a row'}</span></span>
              </button>
            )}
          </motion.div>
        )}
        {!playing && !near && !lobby && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <div className="rounded-full bg-black/60 px-4 py-2 text-xs text-white/80">Drag to walk · tap a machine to go to it · ⚔️ the glowing portal leads to the Live Arena{meState.bonus_ready ? ' · 🎟️ free tickets by the door!' : ''}</div>
          </motion.div>
        )}
      </AnimatePresence>
      {playing && <Cabinet a={a} me={meState} game={playing} haptics={haptics} reduce={reduce} onExit={stopPlaying} onMe={setMeState}
        match={matchOn && matchOn.game === playing ? { m: live?.match?.id === matchOn.id ? live.match : matchOn, myId: myId!, scores: liveRoom.scores, send: (s) => liveRoom.send({ t: 'score', m: matchOn.id, id: myId!, s }) } : null} />}
      {sheet === 'prizes' && <PrizeCounter a={a} me={meState} onMe={setMeState} onClose={() => setSheet(null)} onShelf={() => refresh()} />}
      {sheet === 'scores' && <Scores a={a} me={meState} onClose={() => setSheet(null)} />}
      {sheet === 'jukebox' && <Jukebox onClose={() => setSheet(null)} muted={mute} onUnmute={() => { setMuted(false); setMute(false); }} />}
      {sheet === 'manage' && <Manage a={a} me={meState} onChange={(n) => { refresh(n); setMeState(n.me); }} onClose={() => setSheet(null)} />}
    </div>
  );
}

// ---- playing a cabinet: the screen fills the view, with the marquee above and the bezel round it ----------------
/** How close you are to your next arcade Ink (it builds up a little with every round). */
function InkMeter({ p }: { p: number }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5" title="Next arcade Ink" data-testid="arcade-ink-meter">
      <ResourceIcon r="ink" className="h-3.5 w-3.5" />
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-[#22E3FF] to-[#3DDC97] transition-all" style={{ width: `${Math.round(Math.min(1, p) * 100)}%` }} /></div>
    </div>
  );
}

type Phase = { k: 'attract' } | { k: 'count'; n: number; session: string; seed: number; level: number } | { k: 'play'; session: string; seed: number; level: number } | { k: 'done'; r: ArcadeFinish | null; score: number }
  | { k: 'mwait' } | { k: 'mdone'; r: ArcadeFinish | null; score: number };
type MatchCtx = { m: ArcadeMatch; myId: string; scores: Record<string, number>; send(score: number): void };
function Cabinet({ a, me, game, haptics, reduce, onExit, onMe, match }: { a: Arcade; me: ArcadeMe; game: string; haptics: boolean; reduce: boolean; onExit(): void; onMe(m: ArcadeMe): void; match: MatchCtx | null }) {
  const qc = useQueryClient();
  const info = a.games[game];
  const Arena = ARENAS[game];
  const [phase, setPhase] = useState<Phase>(match ? { k: 'mwait' } : { k: 'attract' });
  // a match: count down to the shared start time (the server's clock), then everyone plays the same round
  const mId = match?.m.id;
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!match || phase.k !== 'mwait' || !match.m.started_at) return;
    const offset = new Date(match.m.server_time).getTime() - Date.now();
    const at = new Date(match.m.started_at).getTime();
    const mine = match.m.players.find((p) => p.id === match.myId);
    const t = setInterval(() => {
      const ms = at - (Date.now() + offset);
      const n = Math.ceil(ms / 1000);
      setLeft((o) => { if (o !== n && n > 0) sfx.blip(n === 1 ? 12 : 0); return n; });
      if (ms <= 0 && mine?.session) { clearInterval(t); setPhase({ k: 'play', session: mine.session, seed: match.m.seed!, level: match.m.level }); }
    }, 100);
    return () => clearInterval(t);
  }, [mId, phase.k]); // eslint-disable-line react-hooks/exhaustive-deps
  // stream your score to the others while you play
  const [myScore, setMyScore] = useState(0);
  const sendRef = useRef(match?.send); sendRef.current = match?.send;
  useEffect(() => {
    if (!match || phase.k !== 'play') return;
    let lastSent = 0, pending: number | null = null;
    const off = scoreBus.on((n) => { setMyScore(n); pending = n; const now = performance.now(); if (now - lastSent > 300) { lastSent = now; sendRef.current?.(n); pending = null; } });
    const t = setInterval(() => { if (pending != null) { sendRef.current?.(pending); pending = null; lastSent = performance.now(); } }, 400);
    return () => { off(); clearInterval(t); };
  }, [mId, phase.k]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState(0);
  const [mode, setMode] = useState<ArcadeMode>('classic');
  const start = async () => {
    setBusy(true);
    try { const r = await api.arcadeStart(a.id, game, mode); sfx.coin(); setPhase({ k: 'count', n: 3, session: r.session, seed: r.seed, level: r.level }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    sfx.blip(phase.n === 1 ? 12 : 0);
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', session: phase.session, seed: phase.seed, level: phase.level }), 650);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (session: string, score: number) => {
    try {
      const r = await api.arcadeFinish(session, score);
      onMe(r.me); invalidateGame(qc);
      if (match) { match.send(r.score); setPhase({ k: 'mdone', r, score: r.score }); return; }
      setCounted(0); setPhase({ k: 'done', r, score: r.score });
      if (r.new_record || r.level_up) confettiCannons();
    } catch (e) { toast.error(toGameError(e).message); setPhase(match ? { k: 'mdone', r: null, score } : { k: 'done', r: null, score }); }
  };
  // tickets spill out, counted up one by one
  useEffect(() => {
    if (phase.k !== 'done' || !phase.r) return;
    const total = phase.r.tickets; if (!total) return;
    sfx.tickets(total);
    const step = Math.max(1, Math.ceil(total / 40));
    const t = setInterval(() => setCounted((c) => { const n = Math.min(total, c + step); if (n >= total) clearInterval(t); return n; }), 35);
    return () => clearInterval(t);
  }, [phase]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex flex-col items-center bg-black/30 px-2 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-[max(10px,env(safe-area-inset-top,0px))]" style={{ ['--glow' as string]: info.color }} data-testid="arcade-cabinet">
      <div className="flex w-full max-w-[560px] items-center gap-2 pb-2">
        <button onClick={onExit} className="rounded-xl bg-black/60 p-2" aria-label="Step back from the cabinet" data-testid="arcade-exit"><X className="h-5 w-5" /></button>
        <div className="lv-arc-marquee min-w-0 flex-1 truncate text-center text-xl">{info.emoji} {info.name}</div>
        <div className="lv-arc-ticket text-xs">🎟️ {tix(me.tickets)}</div>
      </div>
      {match && <div className="mb-2 flex w-full justify-center"><MatchStrip m={match.m} scores={match.scores} myId={match.myId} myScore={phase.k === 'mdone' ? phase.score : myScore} /></div>}
      <div className="lv-arc-crt min-h-0 w-full max-w-[560px] flex-1">
        {phase.k === 'play' && Arena && <Arena key={phase.session} seed={phase.seed} level={phase.level} mode={match ? 'classic' : mode} haptics={haptics} reduce={reduce} onEnd={(s) => void finish(phase.session, s)} />}
        {phase.k !== 'play' && (
          <div className="absolute inset-0 grid place-items-center overflow-y-auto p-5 text-center" style={{ background: `radial-gradient(120% 90% at 50% 10%, ${info.color}55, #05030C 70%)` }}>
            <AnimatePresence mode="wait">
              {phase.k === 'attract' && (
                <motion.div key="attract" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3">
                  <motion.div animate={reduce ? undefined : { y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-7xl">{info.emoji}</motion.div>
                  <div className="lv-arc-marquee text-3xl">{info.name}</div>
                  <div className="flex rounded-2xl bg-black/50 p-1" role="tablist" data-testid="arcade-mode">
                    {(['classic', 'endless'] as const).map((m) => (
                      <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); sfx.blip(m === 'endless' ? 9 : 4); }} data-testid={`arcade-mode-${m}`}
                        className={cn('flex items-center gap-1 rounded-xl px-4 py-1.5 font-mono text-xs font-black uppercase', mode === m ? 'bg-[var(--glow)] text-black shadow-[0_0_16px_var(--glow)]' : 'text-white/70')}>
                        {m === 'endless' && <InfinityIcon className="h-3.5 w-3.5" />}{m}
                      </button>
                    ))}
                  </div>
                  <p className="max-w-xs text-sm text-white/85">{mode === 'endless' ? ENDLESS[game] : HOW[game]}</p>
                  {BONUS[game] && <p className="max-w-xs rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-[#FFE14D]">{BONUS[game]}</p>}
                  {a.hot?.game === game && <p className="text-xs font-black text-[#FFB13D]">🔥 HOT CABINET · ×{a.hot.tickets} tickets this hour</p>}
                  <div className="font-mono text-xs text-white/60">{mode === 'endless'
                    ? <>YOUR BEST {me.best_endless?.[game] ?? 0} · HIGH SCORE {a.boards_endless?.[game]?.[0]?.score ?? 0}</>
                    : <>YOUR BEST {me.best[game] ?? 0} · HIGH SCORE {a.boards[game]?.[0]?.score ?? 0}</>}</div>
                  <button onClick={start} disabled={busy} className="lv-arc-bigbtn !h-20 !w-auto !rounded-3xl px-8 text-lg" data-testid="arcade-start">{busy ? '…' : '▶ PRESS START'}</button>
                  <div className="font-mono text-[11px] text-[#FFE14D] opacity-80">FREE PLAY · WIN TICKETS 🎟️</div>
                </motion.div>
              )}
              {phase.k === 'mwait' && match && (
                <motion.div key="mwait" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid justify-items-center gap-3" data-testid="match-countdown">
                  <div className="lv-arc-marquee text-2xl" style={{ ['--glow' as string]: match.m.mode === 'versus' ? '#FF3D6E' : '#22E3FF' }}>{match.m.mode === 'versus' ? '⚔️ VERSUS' : '🤝 TEAM'}</div>
                  <div className="text-sm text-white/80">{match.m.players.length} players · same round, same time{match.m.mode === 'team' && match.m.target ? ` · team target ${match.m.target}` : ''}</div>
                  <motion.div key={left ?? 'x'} initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="lv-arc-marquee text-9xl">{left && left > 0 ? left : 'GO'}</motion.div>
                </motion.div>
              )}
              {phase.k === 'mdone' && match && (
                <motion.div key="mdone" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid justify-items-center gap-3">
                  <div className="font-mono text-5xl font-black text-[#FFE14D]" style={{ textShadow: '0 0 24px #FFB13D' }}>{phase.score}</div>
                  {phase.r && <div className="lv-arc-ticket text-lg">🎟️ +{phase.r.tickets}{phase.r.paid ? ` · +${phase.r.paid} Ink` : ''}</div>}
                  <MatchResults a={a} matchId={match.m.id} myId={match.myId} onDone={() => { qc.invalidateQueries({ queryKey: arcadeKey(a.id) }); confettiCannons(); }} />
                  <button onClick={onExit} className="rounded-2xl bg-white/10 px-5 py-2 text-sm font-bold" data-testid="match-back">Back to the arcade</button>
                </motion.div>
              )}
              {phase.k === 'count' && <motion.div key={`c${phase.n}`} initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} className="lv-arc-marquee text-9xl">{phase.n}</motion.div>}
              {phase.k === 'done' && (
                <motion.div key="done" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid justify-items-center gap-2.5" data-testid="arcade-done">
                  {phase.r?.mode === 'endless' && <div className="font-mono text-[11px] font-black text-[#B6FF3D]">∞ ENDLESS RUN</div>}
                  {phase.r?.new_record ? <div className="lv-arc-marquee text-2xl" style={{ ['--glow' as string]: '#FFE14D' }}>★ NEW HIGH SCORE ★</div> : phase.r?.new_best ? <div className="lv-arc-marquee text-xl" style={{ ['--glow' as string]: '#22E3FF' }}>PERSONAL BEST!</div> : <div className="font-mono text-sm text-white/70">GAME OVER</div>}
                  <div className="font-mono text-6xl font-black text-[#FFE14D]" style={{ textShadow: '0 0 24px #FFB13D' }}>{phase.score}</div>
                  {phase.r && (
                    <>
                      <motion.div initial={{ scale: 0.8 }} animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: counted < phase.r.tickets ? Infinity : 0, duration: 0.3 }} className="lv-arc-ticket text-2xl" data-testid="arcade-won">🎟️ +{counted}</motion.div>
                      <div className="flex flex-wrap justify-center gap-2 text-sm">
                        {phase.r.paid > 0 && <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-bold"><ResourceIcon r="ink" className="h-4 w-4" /> +{phase.r.paid} Ink</span>}
                        {phase.r.owner_cut > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-xs">+{phase.r.owner_cut} 🎟️ to @{a.owner.username}</span>}
                        {phase.r.level_up && <span className="rounded-full bg-[#8B5CFF] px-3 py-1 text-xs font-bold">Arcade level {phase.r.level_up}!</span>}
                      </div>
                      {!!phase.r.bonus?.length && <div className="grid gap-1" data-testid="arcade-bonus">{phase.r.bonus.map((b) => <span key={b} className="text-xs font-bold text-[#FFB13D]">{BONUS_LABEL[b] ?? b}</span>)}</div>}
                      {phase.r.ink_progress != null && <div className="flex items-center gap-2 text-[11px] text-white/70">Next Ink <InkMeter p={phase.r.ink_progress} /></div>}
                    </>
                  )}
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => setPhase({ k: 'attract' })} className="lv-arc-bigbtn !h-14 !w-auto !rounded-2xl px-5 text-sm" data-testid="arcade-again"><RotateCcw className="mr-1 inline h-4 w-4" />PLAY AGAIN</button>
                    <button onClick={onExit} className="rounded-2xl bg-white/10 px-5 text-sm font-bold">Step back</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---- the prize counter ------------------------------------------------------------------------------------------
function PrizeCounter({ a, me, onMe, onClose, onShelf }: { a: Arcade; me: ArcadeMe; onMe(m: ArcadeMe): void; onClose(): void; onShelf(): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'prizes' | 'explorer' | 'inkborn'>('prizes');
  const next = a.prizes.find((p) => p.tickets > me.tickets);
  const owned = new Set(me.owned ?? []);
  const cos = (a.cosmetics ?? []).filter((c) => c.kind === tab);
  const buy = async (c: ArcadeCosmetic) => {
    setBusy(c.key);
    try {
      const r = await api.arcadeCosmetic(c.key); onMe(r.me); sfx.jackpot(); confettiCannons();
      toast.success(`${c.emoji} ${c.name} unlocked!`, { description: c.kind === 'explorer' ? 'Put it on from your explorer.' : 'Dress up an Inkborn from its profile.' });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🎁 Prize counter" description="Swap tickets for prizes for your shelves, or for gear you can only win here at the arcade.">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-[var(--bg-3)] p-3">
        <div className="lv-arc-ticket text-lg">🎟️ {tix(me.tickets)}</div>
        {tab === 'prizes' && next && <div className="text-right text-xs text-[var(--fg-2)]">{tix(next.tickets - me.tickets)} more for {next.emoji} {next.name}</div>}
      </div>
      <div className="mb-2 flex gap-1.5">
        {(['prizes', 'explorer', 'inkborn'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} data-testid={`counter-tab-${t}`} className={cn('flex-1 rounded-xl py-1.5 text-xs font-bold', tab === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]')}>
            {t === 'prizes' ? '🎁 Shelf prizes' : t === 'explorer' ? '🧑‍🚀 Explorer gear' : '🐾 Inkborn wear'}
          </button>
        ))}
      </div>
      {tab !== 'prizes' ? (
        <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" data-testid="arcade-cosmetics">
          {cos.map((c) => {
            const have = owned.has(c.key), can = !have && me.tickets >= c.tickets;
            return (
              <button key={c.key} disabled={!can || busy === c.key} onClick={() => void buy(c)} data-testid={`cosmetic-${c.key}`}
                className={cn('relative grid justify-items-center gap-0.5 rounded-2xl border-2 p-2 text-center transition', have ? 'border-[#3DDC97] bg-[#3DDC97]/10' : can ? 'border-[#FF3D9A] bg-[#FF3D9A]/10 hover:-translate-y-0.5' : 'border-transparent bg-[var(--bg-3)] opacity-60')}>
                <span className="absolute left-1.5 top-1 rounded-full bg-[#8B5CFF] px-1.5 text-[8px] font-black text-white">ARCADE</span>
                <span className="mt-2 text-4xl">{c.emoji}</span>
                <span className="w-full truncate text-xs font-bold">{c.name}</span>
                <span className="text-[10px] text-[var(--fg-2)] capitalize">{c.part.replace(/^w/, '')}</span>
                {have ? <span className="text-[11px] font-black text-[#3DDC97]">Owned ✓</span> : <span className="lv-arc-ticket text-[11px]">🎟️ {tix(c.tickets)}</span>}
              </button>
            );
          })}
          {!cos.length && <p className="col-span-full py-4 text-center text-sm text-[var(--fg-2)]">Nothing here yet.</p>}
        </div>
      ) : (
      <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" data-testid="arcade-prizes">
        {a.prizes.map((p) => {
          const can = me.tickets >= p.tickets, have = me.prizes[p.id] ?? 0;
          return (
            <button key={p.id} disabled={!can || busy === p.id} data-testid={`prize-${p.id}`}
              onClick={async () => {
                setBusy(p.id);
                try { const r = await api.arcadePrize(p.id); onMe(r.me); onShelf(); sfx.win(5); confettiCannons(); toast.success(`${p.emoji} ${p.name} is yours!`); }
                catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
              }}
              className={cn('relative grid justify-items-center gap-0.5 rounded-2xl border-2 p-2 text-center transition', can ? 'border-[#FFB13D] bg-[#FFB13D]/10 hover:-translate-y-0.5' : 'border-transparent bg-[var(--bg-3)] opacity-60')}>
              {have > 0 && <span className="absolute right-1.5 top-1 rounded-full bg-[#3DDC97] px-1.5 text-[10px] font-black text-black">×{have}</span>}
              <span className="text-4xl">{p.emoji}</span>
              <span className="w-full truncate text-xs font-bold">{p.name}</span>
              <span className="lv-arc-ticket text-[11px]">🎟️ {tix(p.tickets)}</span>
            </button>
          );
        })}
      </div>
      )}
    </Dialog>
  );
}

// ---- the jukebox --------------------------------------------------------------------------------------------------
function Jukebox({ onClose, muted, onUnmute }: { onClose(): void; muted: boolean; onUnmute(): void }) {
  useMusic();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🎵 Jukebox" description="Pick the music for the arcade. It keeps playing (a little quieter) while you’re on a machine.">
      {muted && <button onClick={() => { onUnmute(); if (music.current) music.play(); }} className="mb-2 w-full rounded-xl bg-[#FF3D9A]/20 py-2 text-xs font-bold">Sound is off — tap to turn it on</button>}
      <div className="grid gap-1.5" data-testid="jukebox-tracks">
        {music.tracks.filter((t) => !t.home && !t.game).map((t) => {
          const on = music.current === t.id;
          return (
            <button key={t.id} onClick={() => { if (muted) onUnmute(); music.play(t.id); sfx.coin(); }} data-testid={`track-${t.id}`}
              className={cn('flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left', on ? 'bg-gradient-to-r from-[#FF3D9A] to-[#8B5CFF] text-white' : 'bg-[var(--bg-3)]')}>
              <span className="text-2xl">{t.emoji}</span>
              <span className="min-w-0 flex-1"><b className="block">{t.name}</b><span className="text-[11px] opacity-75">{t.bpm} BPM</span></span>
              {on && music.playing && <span className="flex h-4 items-end gap-0.5" aria-label="Playing">{[0, 1, 2].map((i) => <span key={i} className="w-1 animate-pulse rounded bg-white" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.15}s` }} />)}</span>}
            </button>
          );
        })}
        <button onClick={() => music.play(null)} data-testid="track-off" className={cn('rounded-2xl px-3 py-2 text-sm font-bold', !music.current ? 'bg-white/15' : 'bg-[var(--bg-3)]')}>⏹ Music off</button>
      </div>
      <label className="mt-3 flex items-center gap-3 text-xs font-bold">
        <Volume2 className="h-4 w-4" />
        <input type="range" min={0} max={1} step={0.05} value={music.volume} onChange={(e) => music.setVolume(Number(e.target.value))} className="flex-1 accent-[#FF3D9A]" data-testid="jukebox-volume" />
      </label>
    </Dialog>
  );
}

// ---- high scores --------------------------------------------------------------------------------------------------
function Scores({ a, me, onClose }: { a: Arcade; me: ArcadeMe; onClose(): void }) {
  const ids = Object.entries(a.games).sort((x, y) => x[1].order - y[1].order).map(([k]) => k);
  const [g, setG] = useState(ids[0]);
  const [where, setWhere] = useState<'here' | 'world'>('here');
  const [mode, setMode] = useState<ArcadeMode>('classic');
  const hof = useQuery({ queryKey: ['arcade-hof', g, mode], queryFn: () => api.arcadeHallOfFame(g, mode), enabled: where === 'world' });
  const rows = where === 'here' ? (mode === 'endless' ? a.boards_endless?.[g] : a.boards[g]) ?? [] : hof.data ?? [];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🏆 High scores" description="Every cabinet keeps its own board. Your best on each is shown under its name.">
      <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
        {ids.map((k) => (
          <button key={k} onClick={() => setG(k)} className={cn('shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-bold', g === k ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]')}>
            {a.games[k].emoji} {a.games[k].name}<span className="block text-[10px] font-normal opacity-75">best {(mode === 'endless' ? me.best_endless?.[k] : me.best[k]) ?? '—'}</span>
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-1.5">
        {(['classic', 'endless'] as const).map((m) => <button key={m} onClick={() => setMode(m)} data-testid={`scores-${m}`} className={cn('flex-1 rounded-xl py-1.5 text-xs font-bold capitalize', mode === m ? 'bg-[#8B5CFF] text-white' : 'bg-[var(--bg-3)]')}>{m === 'endless' ? '∞ Endless' : 'Classic'}</button>)}
      </div>
      <div className="mb-2 flex gap-1.5">
        {(['here', 'world'] as const).map((w) => <button key={w} onClick={() => setWhere(w)} className={cn('flex-1 rounded-xl py-1.5 text-xs font-bold', where === w ? 'bg-white/15' : 'bg-[var(--bg-3)]')}>{w === 'here' ? 'This arcade' : 'Hall of fame (everywhere)'}</button>)}
      </div>
      <div className="grid gap-1.5" data-testid="arcade-board">
        {rows.map((r, i) => (
          <div key={r.player.id} className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3 py-2 font-mono text-sm">
            <span className={cn('w-6 text-center font-black', i === 0 ? 'text-[#FFD84D]' : i === 1 ? 'text-[#C9D3E6]' : i === 2 ? 'text-[#E0A06B]' : 'text-[var(--fg-2)]')}>{i + 1}</span>
            <PlayerAvatar p={r.player} size={24} /><span className="min-w-0 flex-1 truncate font-sans font-semibold">@{r.player.username}</span><b className="text-[#FFE14D]">{r.score}</b>
          </div>
        ))}
        {where === 'world' && hof.isLoading && <div className="grid place-items-center py-4"><Spinner /></div>}
        {!rows.length && !(where === 'world' && hof.isLoading) && <p className="py-4 text-center text-sm text-[var(--fg-2)]">No scores yet — be the first!</p>}
      </div>
    </Dialog>
  );
}

// ---- owner: cabinets and decor ----------------------------------------------------------------------------------
function Manage({ a, me, onChange, onClose }: { a: Arcade; me: ArcadeMe; onChange(n: Arcade): void; onClose(): void }) {
  const [tab, setTab] = useState<'cabinets' | 'decor'>('cabinets');
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, f: () => Promise<Arcade>, ok: string) => {
    setBusy(key);
    try { const n = await f(); onChange(n); sfx.win(4); toast.success(ok); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const games = Object.entries(a.games).sort((x, y) => x[1].order - y[1].order);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🛠️ Run your arcade" description={`Level ${a.level.level}${a.level.max ? ' (max)' : ` · ${a.level.into}/${a.level.need} XP to the next`}. Every game played here gives XP — visitors too (and you get 10% of their tickets).`}>
      <div className="mb-3 flex items-center gap-2">
        {(['cabinets', 'decor'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn('flex-1 rounded-xl py-2 text-sm font-bold capitalize', tab === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]')}>{t}</button>)}
        <div className="lv-arc-ticket shrink-0 text-sm">🎟️ {tix(me.tickets)}</div>
      </div>
      {tab === 'cabinets' ? (
        <div className="grid max-h-[55vh] gap-2 overflow-y-auto" data-testid="arcade-cabinets">
          {games.map(([id, g]) => {
            const lv = a.machines[id];
            const cost = a.upgrade.costs[id];
            return (
              <div key={id} className="flex items-center gap-3 rounded-2xl bg-[var(--bg-3)] p-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `${g.color}33`, boxShadow: lv ? `0 0 16px ${g.color}66` : undefined }}>{g.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{g.name}</div>
                  <div className="text-[11px] text-[var(--fg-2)]">{lv ? `Level ${lv}/${a.upgrade.max} · +${Math.round((lv - 1) * a.upgrade.bonus * 100)}% tickets` : a.level.level >= g.level ? `Ready to install` : `Needs arcade level ${g.level}`}</div>
                </div>
                {!lv ? (
                  <Button size="sm" variant="rainbow" disabled={a.level.level < g.level || me.tickets < g.cost} loading={busy === id} data-testid={`install-${id}`}
                    onClick={() => run(id, () => api.arcadeUnlock(a.id, id), `${g.name} installed!`)}>{a.level.level < g.level ? <><Lock className="h-3.5 w-3.5" /> LV {g.level}</> : `Install · ${g.cost} 🎟️`}</Button>
                ) : lv >= a.upgrade.max ? <span className="text-xs font-bold text-[#3DDC97]">MAX</span> : (
                  <Button size="sm" variant="secondary" disabled={me.tickets < (cost ?? 0)} loading={busy === id} data-testid={`upgrade-${id}`}
                    onClick={() => run(id, () => api.arcadeUpgrade(a.id, id), `${g.name} → level ${lv + 1}`)}>⬆ {cost} 🎟️</Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid max-h-[55vh] gap-3 overflow-y-auto" data-testid="arcade-decor">
          {(['floor', 'neon', 'lights'] as const).map((slot) => (
            <div key={slot}>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--fg-2)]">{slot === 'floor' ? 'Floor' : slot === 'neon' ? 'Neon' : 'Light show'}</div>
              <div className="flex flex-wrap gap-1.5">
                {a.decor_catalog[slot].map((d) => {
                  const own = a.decor_owned.includes(`${slot}:${d.id}`), on = a.decor[slot] === d.id;
                  return (
                    <button key={d.id} disabled={on || (!own && me.tickets < d.tickets) || busy === `${slot}:${d.id}`} data-testid={`decor-${slot}-${d.id}`}
                      onClick={() => run(`${slot}:${d.id}`, () => api.arcadeDecor(a.id, slot, d.id), `${d.name} ✨`)}
                      className={cn('rounded-xl px-3 py-2 text-xs font-bold', on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]', !on && !own && me.tickets < d.tickets && 'opacity-50')}>
                      {d.name}<span className="block text-[10px] font-normal">{on ? 'In use' : own ? 'Owned' : `${d.tickets} 🎟️`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
