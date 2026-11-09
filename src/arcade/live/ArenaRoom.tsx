// The Live Arena: one shared room (10 at a time) that every arcade's portal leads to, so you can always find
// people to play with. Walk up to a pod, open a lobby for 1v1 / 2v2 / free-for-all / co-op, and anyone in the
// room can tap Join. When the host starts, everyone drops into the same live game.
import { pulse } from '../../lib/pulse';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { getBackend, toGameError } from '../../backend/backend';
import type { ArenaLive, ArenaMatch, ArenaMode, ExplorerStyle } from '../../backend/types';
import { explorerSvg } from '../../explorer/character';
import { useOnboardedMe } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { Button, PlayerAvatar } from '../../ui';
import { createHall, type HallScene, type HallSpot } from '../hall3d';
import { isMuted, setMuted, sfx } from '../sfx';
import { ARENA_GAMES, MODE_INFO, TEAM_COLORS } from './kit';
import { LIVE_DEFS } from './games';
import { LiveGame } from './LiveGame';
import { config } from '../../env';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
type Pos = { t: 'pos'; id: string; x: number; z: number; f: number; p: string | null };

function useArenaLive(opts: { myId: string | undefined; from: string | null; hall: React.RefObject<HallScene | null>; playing: string | null }) {
  const [live, setLive] = useState<ArenaLive | null>(null);
  const ref = useRef(opts); ref.current = opts;
  const beatNow = useRef<() => void>(() => {});
  useEffect(() => {
    if (!opts.myId) return;
    const backend = getBackend(), myId = opts.myId;
    let stopped = false, ch: { send(m: unknown): void; close(): void } | null = null, chName = '', members = new Set<string>();
    const urls = new Map<string, string>();
    let others: Parameters<HallScene['setOthers']>[0] = [];
    let lastLive: ArenaLive | null = null;
    const onMsg = (raw: unknown) => {
      const m = raw as Pos | { t: 'nudge' };
      if (m?.t === 'nudge') return p.soon();
      if (m?.t === 'pos') { if (members.has(m.id)) ref.current.hall.current?.moveOther(m.id, m.x, m.z, m.f, m.p); else if (m.id !== myId) p.soon(); }
    };
    // arrivals and departures come straight from the live channel; a departure disappears at once
    const onPeer = (id: string, here: boolean) => {
      if (!here && members.has(id)) { members.delete(id); others = others.filter((o) => o.id !== id); ref.current.hall.current?.setOthers(others); }
      p.soon(here ? 600 : 2000);
    };
    const beat = async () => {
      if (stopped || document.hidden) return;
      const pose = ref.current.hall.current?.pose();
      try {
        const r = await api.arenaLive(pose?.x ?? null, pose?.z ?? null, ref.current.playing, ref.current.from);
        if (stopped) return;
        members = new Set(r.members.map((m) => m.id));
        others = r.members.map((m) => {
          let u = urls.get(m.id);
          if (!u) { u = svgUrl(explorerSvg(m.explorer_style as ExplorerStyle | undefined, m.accent_color ?? '#7B5CFF', 184)); urls.set(m.id, u); }
          return { id: m.id, url: u, name: `@${m.username}`, x: m.x, z: m.z, playing: m.playing };
        });
        ref.current.hall.current?.setOthers(others);
        if (r.channel !== chName) { ch?.close(); chName = r.channel; ch = backend.liveChannel?.(r.channel, onMsg, { me: myId, onPeer }) ?? null; }
        lastLive = r;
        setLive(r);
      } catch { /* next beat */ }
    };
    // check in often only while a match is being set up or played here; otherwise every half minute
    const p = pulse(beat, () => !!lastLive?.match); // lobby changes arrive as nudges on the room's channel
    beatNow.current = () => { p.now(); ch?.send({ t: 'nudge' }); };
    let lastKey = '', lastAt = 0;
    const tx = setInterval(() => {
      const p = ref.current.hall.current?.pose(); if (!p || !ch) return;
      const key = `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.face},${ref.current.playing ?? ''}`, now = performance.now();
      if (key !== lastKey || now - lastAt > 6000) { lastKey = key; lastAt = now; ch.send({ t: 'pos', id: myId, x: p.x, z: p.z, f: p.face, p: ref.current.playing }); }
    }, 120);
    return () => { stopped = true; p.stop(); clearInterval(tx); ch?.close(); void api.arenaLeave().catch(() => {}); };
  }, [opts.myId]);
  return { live, refresh: () => beatNow.current() };
}

const GAME_IDS = Object.keys(ARENA_GAMES);

export function ArenaRoom({ from, onBack }: { from: string | null; onBack(): void }) {
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const cv = useRef<HTMLCanvasElement>(null);
  const hall = useRef<HallScene | null>(null);
  const [near, setNear] = useState<HallSpot | null>(null);
  const [game, setGame] = useState<ArenaMatch | null>(null);
  const [mute, setMute] = useState(isMuted());
  const myId = me?.user_id;

  useEffect(() => {
    if (!cv.current) return;
    const h = createHall({
      canvas: cv.current, seed: 4242, reduceMotion: reduce, arena: true,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 184)),
      onNear: (s) => { setNear(s); if (s) sfx.blip(s.kind === 'machine' ? 7 : 12); },
    });
    h.setMachines(GAME_IDS.map((id) => ({ id: `live:${id}`, name: ARENA_GAMES[id].name, color: ARENA_GAMES[id].color, emoji: ARENA_GAMES[id].emoji, level: 1, locked: false })));
    h.setDecor({ floor: 'grid', neon: 'rainbow', lights: 'lasers' }, 'LIVE ARENA');
    hall.current = h;
    if (import.meta.env.DEV || config.e2e) (window as unknown as { __arenaDefs: unknown }).__arenaDefs = LIVE_DEFS;
    if (import.meta.env.DEV || config.e2e) (window as unknown as { __landvasArcade: HallScene }).__landvasArcade = h;
    return () => { h.dispose(); hall.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { hall.current?.setPaused(!!game); }, [game]);

  const room = useArenaLive({ myId, from, hall, playing: game?.game ?? null });
  const live = room.live;
  // the host pressed Start: everyone in the lobby drops into the game
  const handled = useRef(new Set<string>());
  useEffect(() => {
    const m = live?.match;
    if (!m || m.status !== 'playing' || handled.current.has(m.id)) return;
    handled.current.add(m.id); setGame(m); sfx.coin();
  }, [live?.match]);
  const lobby = live?.match?.status === 'lobby' ? live.match : null;
  const podGame = near?.kind === 'machine' ? near.id.replace(/^live:/, '') : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05040F] text-white" data-testid="arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="arena-hall" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={onBack} className="pointer-events-auto rounded-xl bg-black/55 p-2" aria-label="Back to the arcade" data-testid="arena-back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl bg-black/55 px-3 py-1.5">
          <div className="lv-arc-marquee truncate text-base" style={{ ['--glow' as string]: '#FFE14D' }}>● LIVE ARENA</div>
          <div className="text-[10px] text-white/70">Live games against real players · 1v1 · 2v2 · free for all · co-op</div>
          {live && <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[#3DDC97]" data-testid="arena-here"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3DDC97]" /> {live.members.length + 1}/{live.room_size} in this room{live.in_arena > live.members.length + 1 ? ` · ${live.in_arena} in the arena` : ''}</div>}
        </div>
        <button onClick={() => { setMuted(!mute); setMute(!mute); }} className="pointer-events-auto rounded-xl bg-black/55 p-2" aria-label={mute ? 'Sound on' : 'Sound off'}>{mute ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
      </div>
      {live && myId && !lobby && !game && <div className="pointer-events-none absolute inset-x-0 top-[calc(max(12px,env(safe-area-inset-top,0px))+76px)] z-20 px-14"><ArenaInvite live={live} myId={myId} onJoined={room.refresh} /></div>}
      <AnimatePresence>
        {lobby && myId && !game && (
          <motion.div key="lobby" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <ArenaLobby m={lobby} myId={myId} onChange={room.refresh} />
          </motion.div>
        )}
        {!lobby && !game && podGame && ARENA_GAMES[podGame] && (
          <motion.div key={podGame} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <PodPanel game={podGame} live={live} myId={myId} onChange={room.refresh} />
          </motion.div>
        )}
        {!lobby && !game && near?.kind === 'door' && (
          <motion.div key="door" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <button onClick={onBack} className="lv-arc-play flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#22E3FF] to-[#8B5CFF] px-5 py-3 shadow-2xl" data-testid="arena-door"><span className="text-4xl">🕹️</span><span className="font-display text-2xl font-black">Back to the arcade</span></button>
          </motion.div>
        )}
        {!lobby && !game && !near && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <div className="rounded-full bg-black/60 px-4 py-2 text-xs text-white/80">Walk up to a live pod to start a game · anyone in the room can join</div>
          </motion.div>
        )}
      </AnimatePresence>
      {game && myId && <LiveGame match={game} myId={myId} onClose={() => { setGame(null); room.refresh(); }} />}
    </div>
  );
}

function PodPanel({ game, live, myId, onChange }: { game: string; live: ArenaLive | null; myId: string | undefined; onChange(): void }) {
  const g = ARENA_GAMES[game];
  const [busy, setBusy] = useState<string | null>(null);
  const open = (live?.lobbies ?? []).filter((m) => m.game === game && !m.players.some((p) => p.id === myId));
  const create = async (mode: ArenaMode) => {
    setBusy(mode);
    try { await api.arenaCreate(game, mode); sfx.coin(); onChange(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <div className="w-full max-w-md rounded-3xl bg-black/85 p-4 shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 34px ${g.color}66, inset 0 0 0 2px ${g.color}` }} data-testid="arena-pod">
      <div className="flex items-center gap-3">
        <span className="text-4xl">{g.emoji}</span>
        <div className="min-w-0"><div className="font-display text-xl font-black">{g.name}</div><div className="text-[11px] text-white/75">{g.blurb}</div></div>
      </div>
      {open.length > 0 && <div className="mt-3 grid gap-1.5">{open.map((m) => <JoinRow key={m.id} m={m} onJoined={onChange} />)}</div>}
      <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-white/50">Start a game</div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {g.modes.map((md) => (
          <button key={md} disabled={!!busy || !myId} onClick={() => void create(md)} data-testid={`arena-new-${md}`}
            className="rounded-2xl bg-white/10 px-3 py-2 text-left disabled:opacity-50" style={{ boxShadow: `inset 0 0 0 1.5px ${g.color}88` }}>
            <div className="text-sm font-black">{MODE_INFO[md].emoji} {busy === md ? '…' : MODE_INFO[md].label}</div>
            <div className="text-[10px] text-white/60">{MODE_INFO[md].short}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-white/50">Win tickets & a little Ink · bigger squads get a small bonus</p>
    </div>
  );
}

function JoinRow({ m, onJoined }: { m: ArenaMatch; onJoined(): void }) {
  const [busy, setBusy] = useState(false);
  const host = m.players.find((p) => p.id === m.host) ?? m.players[0], md = MODE_INFO[m.mode];
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-1.5 pl-2">
      {host && <PlayerAvatar p={host} size={24} />}
      <div className="min-w-0 flex-1 text-xs"><b>@{host?.username}</b> · {md.emoji} {md.label} <span className="text-white/60">{m.players.length}/{md.need[1]}</span></div>
      <Button size="sm" variant="rainbow" loading={busy} data-testid="arena-join" onClick={async () => { setBusy(true); try { await api.arenaJoin(m.id); sfx.coin(); onJoined(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); } }}>Join</Button>
    </div>
  );
}

/** Someone in the room is gathering players: one tap to join, wherever you're standing. */
function ArenaInvite({ live, myId, onJoined }: { live: ArenaLive; myId: string; onJoined(): void }) {
  const inv = live.lobbies.find((m) => !m.players.some((p) => p.id === myId) && m.players.length < MODE_INFO[m.mode].need[1]);
  if (!inv) return null;
  const g = ARENA_GAMES[inv.game];
  return (
    <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-black/80 text-white shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 24px ${g?.color}66, inset 0 0 0 1.5px ${g?.color}` }} data-testid="arena-invite">
      <JoinRow m={inv} onJoined={onJoined} />
    </motion.div>
  );
}

function ArenaLobby({ m, myId, onChange }: { m: ArenaMatch; myId: string; onChange(): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const g = ARENA_GAMES[m.game], md = MODE_INFO[m.mode], host = m.host === myId, [min, max] = md.need;
  const run = async (k: string, f: () => Promise<unknown>) => { setBusy(k); try { await f(); onChange(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); } };
  const ready = m.players.length >= min;
  return (
    <div className="pointer-events-auto w-full max-w-md rounded-3xl bg-black/85 p-4 shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 30px ${g.color}55, inset 0 0 0 2px ${g.color}` }} data-testid="arena-lobby">
      <div className="flex items-center gap-2">
        <span className="text-3xl">{g.emoji}</span>
        <div className="min-w-0 flex-1"><div className="font-display text-lg font-black">{md.emoji} {md.label} · {g.name}</div><div className="text-[11px] text-white/70">{md.short}{m.players.length > 1 ? ` · squad of ${m.players.length}: +${(m.players.length - 1) * 5}% rewards` : ''}</div></div>
      </div>
      <div className={cn('mt-3 grid gap-2', max === 2 ? 'grid-cols-2' : 'grid-cols-4')}>
        {Array.from({ length: max }, (_, i) => {
          const p = m.players[i], team = m.mode === 'teams' ? i % 2 : null;
          return (
            <div key={i} className={cn('grid justify-items-center gap-1 rounded-2xl p-2 text-center', p ? 'bg-white/10' : 'border border-dashed border-white/20')} style={team != null ? { boxShadow: `inset 0 -3px 0 ${TEAM_COLORS[team]}` } : undefined}>
              {p ? <><PlayerAvatar p={p} size={36} /><span className="w-full truncate text-[10px] font-bold">{p.id === myId ? 'You' : `@${p.username}`}{p.id === m.host ? ' 👑' : ''}</span></> : <span className="py-3 text-[10px] text-white/40">{i < min ? 'needed' : 'open'}</span>}
            </div>
          );
        })}
      </div>
      {m.mode === 'duel' && <div className="mt-2 text-center text-[11px] text-white/70">⚔️ Head to head</div>}
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" size="sm" className="!text-white" loading={busy === 'leave'} onClick={() => run('leave', () => api.arenaLeaveMatch(m.id))} data-testid="arena-leave">Leave</Button>
        {host
          ? <Button variant="rainbow" size="sm" className="ml-auto" disabled={!ready} loading={busy === 'start'} onClick={() => run('start', () => api.arenaStart(m.id))} data-testid="arena-start">{ready ? `▶ Start (${m.players.length} players)` : `Waiting for ${min - m.players.length} more…`}</Button>
          : <span className="ml-auto self-center text-xs text-white/70">Waiting for the host to start…</span>}
      </div>
    </div>
  );
}
