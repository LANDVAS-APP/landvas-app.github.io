// The clan hall (/clan/hall): a shared 3D room for clan members, live like a house — walk round together, chat
// (clan chat, with bubbles over whoever said it), put on records, and start the house party games at the table.
// Its doors open onto the clan's goals, battles, leaderboard and members; the banners are the clan's.
// Officers decorate it with furniture the clan unlocks as it levels up.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Paintbrush, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import type { Clan, HomeData, HomeGame, HomeStyleData } from '../backend/types';
import { TRACKS, music } from '../arcade/music';
import { explorerSvg } from '../explorer/character';
import type { ExplorerStyle } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { fmt } from '../lib/utils';
import { Button, Spinner } from '../ui';
import { PlanetChatBox } from '../space/PlanetChat';
import { DEFAULT_LAYOUT, Decorator, RecordPanel, svgUrl, useHomeChat, useHomeLive } from '../home/HomeScreen';
import { createHome, type HomeDoor, type HomeScene, type HomeSpot, type Placed } from '../home/home3d';
import { PartyGame } from '../home/party/PartyGame';
import { Live3D } from '../home/live3d/Live3D';
import { SIMS3 } from '../home/live3d/sims';
import { GamePicker, TableInvite, TableLobby } from '../home/party/Tables';
import { clanKeys } from './ClansScreen';
import { ClanBadge, bannerUrl, until } from './ui';

const HALL_STYLE: HomeStyleData = { wall: 'brick', floor: 'herringbone', view: 'mountains', mood: 'warm', wall_color: '#C9B79C', floor_color: '#8B5A3C', trim: '#5C3A21', music: 'jazz' };
const DOORS = [
  { kind: 'goals', label: 'Weekly goals', emoji: '🎯', color: '#3DDC97' },
  { kind: 'battles', label: 'Battles', emoji: '⚔️', color: '#FF3D6E' },
  { kind: 'board', label: 'Leaderboard', emoji: '🏆', color: '#FFD23F' },
  { kind: 'members', label: 'Members', emoji: '👥', color: '#22E3FF' },
] as const;
type DoorKind = (typeof DOORS)[number]['kind'];

export default function ClanHall() {
  const q = useQuery({ queryKey: clanKeys.mine, queryFn: () => api.clanGet(null), retry: false, staleTime: 15_000 });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#1E1626]"><Spinner /></div>;
  if (!q.data?.role) return <Navigate to="/clans" replace />;
  return <Hall key={q.data.id} c={q.data} />;
}

function Hall({ c }: { c: Clan }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const cv = useRef<HTMLCanvasElement>(null);
  const hall = useRef<HomeScene | null>(null);
  const [near, setNear] = useState<HomeSpot | null>(null);
  const [edit, setEdit] = useState(false);
  const [picker, setPicker] = useState(false);
  const [game, setGame] = useState<HomeGame | null>(null);
  const [rec, setRec] = useState<string>(c.hall?.style.music ?? HALL_STYLE.music!);
  const [musicOn, setMusicOn] = useState(true);
  const officer = c.role === 'leader' || c.role === 'officer';
  const unlocks = c.unlocks ?? {};
  const style = useMemo(() => ({ ...HALL_STYLE, ...(c.hall?.style ?? {}) }), [c.hall?.style]);
  const layout = useMemo<Placed[]>(() => (c.hall?.layout.length ? c.hall.layout : DEFAULT_LAYOUT.filter((p) => p.i !== 'bed' && (unlocks[p.i] ?? 99) <= c.level)) as Placed[], [c.hall?.layout, c.level]); // eslint-disable-line react-hooks/exhaustive-deps
  const doors: HomeDoor[] = useMemo(() => DOORS.map((d) => {
    const plaque = d.kind === 'goals' ? `${c.goals?.filter((g) => g.done).length ?? 0}/${c.goals?.length ?? 0} done this week`
      : d.kind === 'battles' ? (c.battles?.find((b) => b.status === 'live') ? 'Battle on!' : `${c.wins} wins`)
      : d.kind === 'board' ? (c.season_rank ? `#${c.season_rank} this week` : 'This week’s ranks')
      : `${c.members}/${c.cap} members`;
    return { ...d, plaque, state: 'open' as const };
  }), [c]);
  const trophies = useMemo(() => [c.emblem, ...Array.from({ length: Math.min(8, c.wins) }, () => '🏆'), ...(c.level >= 5 ? ['⭐'] : []), ...(c.level >= 10 ? ['👑'] : [])], [c]);
  const banners = useMemo(() => { const u = bannerUrl(c); return [u, u, u]; }, [c.emblem, c.color, c.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cv.current) return;
    const s = createHome({
      canvas: cv.current, reduceMotion: reduce,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style as ExplorerStyle | undefined, me?.profile.accent_color ?? '#7B5CFF', 184)),
      onNear: setNear,
    });
    hall.current = s;
    if (import.meta.env.DEV || location.search.includes('e2e=1')) Object.assign(window, { __landvasHome: s });
    return () => { s.dispose(); hall.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (edit) return;
    hall.current?.setHome({ style, layout, doors, art: banners, achievements: trophies, inkborn: [] });
  }, [style, layout, doors, banners, trophies, edit]);

  const chatIn = useRef<((m: unknown) => void) | null>(null);
  const room = useHomeLive(c.id, me?.user_id, hall, (id, by) => {
    setRec(id); const who = room.live?.members.find((m) => m.id === by);
    if (who) toast(`🎶 @${who.username} put on ${id === 'off' ? 'silence' : TRACKS.find((t) => t.id === id)?.name ?? 'a record'}`, { duration: 2000 });
  }, chatIn);
  const chat = useHomeChat(c.id, me?.user_id, hall, room.send, { list: (a) => api.clanChatList(a), send: (b) => api.clanChatSend(b) });
  chatIn.current = chat.onChat;
  const live = room.live;
  const here = (live?.members.length ?? 0) + 1;
  const handled = useRef(new Set<string>());
  useEffect(() => {
    const g = live?.game; if (!g || g.status !== 'playing' || handled.current.has(g.id)) return;
    handled.current.add(g.id); setGame(g); setPicker(false);
  }, [live?.game]);
  const lobby = live?.game?.status === 'lobby' ? live.game : null;
  const invite = !lobby ? live?.tables.find((t) => !t.players.some((p) => p.id === me?.user_id)) : null;

  // music for the whole hall (starts on your first tap)
  const started = useRef(false);
  useEffect(() => {
    if (!musicOn || rec === 'off') { if (started.current) music.stop(); return; }
    const go = () => { started.current = true; music.play(rec, false); };
    if (started.current) { go(); return; }
    const once = () => { go(); window.removeEventListener('pointerdown', once); };
    window.addEventListener('pointerdown', once);
    return () => window.removeEventListener('pointerdown', once);
  }, [musicOn, rec]);
  useEffect(() => { music.setDuck(!!game); }, [game]);
  useEffect(() => () => { music.stop(); music.setDuck(false); }, []);
  const putOn = async (id: string) => {
    setRec(id); setMusicOn(true); started.current = true; if (id === 'off') music.stop(); else music.play(id, false);
    room.send({ t: 'rec', id: me?.user_id, rec: id });
    if (officer) { try { qc.setQueryData(clanKeys.mine, await api.clanHallSave(c.hall?.name ?? null, { ...style, music: id }, (hall.current?.layout() ?? layout) as Placed[])); } catch { /* it still plays */ } }
  };

  const nd = near?.kind === 'door' ? (near.door as DoorKind) : null;
  const nItem = near?.kind === 'item' ? near.id : null;
  const title = c.hall?.name || `${c.name} Hall`;
  // a fake "home" for the decorator: the hall's look, the house catalog, no purchases
  const asHome = useMemo(() => ({
    host: { id: c.id, username: c.tag, display_name: c.name }, own: true, name: c.hall?.name ?? null, style, layout,
    doors: {}, careers: {}, inkborn: [], items: {}, tickets: 0, catalog: c.catalog,
  }) as unknown as HomeData, [c, style, layout]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1E1626] text-white" data-testid="clan-hall">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="home-canvas" />
      {!edit && <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={() => (history.length > 1 ? nav(-1) : nav('/clans'))} className="pointer-events-auto rounded-xl bg-black/45 p-2 backdrop-blur" aria-label="Back" data-testid="hall-back"><ArrowLeft className="h-5 w-5" /></button>
        <Link to="/clans" className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-black/45 px-3 py-1.5 backdrop-blur">
          <ClanBadge c={c} size={34} />
          <span className="min-w-0"><span className="block truncate font-display text-lg font-black leading-tight" data-testid="hall-title">{title}</span>
            <span className="flex items-center gap-2 text-[11px] text-white/75"><b>[{c.tag}] · Lv {c.level}</b>
              <span className="flex items-center gap-1 font-bold text-[#7DFFB2]" data-testid="hall-here"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7DFFB2]" />{here}/{live?.room_size ?? 16} here</span></span></span>
        </Link>
        <div className="pointer-events-auto flex flex-col gap-2">
          {officer && <button onClick={() => setEdit(true)} className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#FFB13D] to-[#FF5FA2] text-[9px] font-black shadow-lg" data-testid="hall-decorate"><Paintbrush className="h-5 w-5" />Decorate</button>}
          <button onClick={() => setPicker(true)} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/45 text-[9px] font-bold backdrop-blur" data-testid="hall-games"><span className="text-lg leading-none">🎲</span>Games</button>
          <button onClick={() => { const on = !musicOn; setMusicOn(on); if (on && rec !== 'off') { started.current = true; music.play(rec, false); } else music.stop(); }} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/45 text-[9px] font-bold backdrop-blur" aria-label={musicOn ? 'Music off' : 'Music on'}>{musicOn && rec !== 'off' ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}{musicOn && rec !== 'off' ? 'Music' : 'Muted'}</button>
        </div>
      </div>}

      <AnimatePresence>
        {!edit && nd && (
          <motion.div key={nd} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <DoorPanel kind={nd} c={c} />
          </motion.div>
        )}
        {!edit && !game && nItem && (nItem === 'game_table' || nItem === 'card_table') && !lobby && (
          <motion.div key="table" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <button onClick={() => setPicker(true)} className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#FFB13D] to-[#FF5FA2] px-5 py-3 text-left text-[#2A0A1A] shadow-2xl" data-testid="hall-table"><span className="text-4xl">🎲</span>
              <span><span className="block font-display text-2xl font-black">Play a game</span><span className="block text-xs font-bold">Party games with your clanmates here</span></span></button>
          </motion.div>
        )}
        {!edit && !game && (nItem === 'record_player' || nItem === 'jukebox') && (
          <motion.div key="rec" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <RecordPanel rec={musicOn ? rec : 'off'} onPick={(id) => void putOn(id)} own={officer} />
          </motion.div>
        )}
        {!edit && !near && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <div className="rounded-full bg-black/55 px-4 py-2 text-center text-xs text-white/85 backdrop-blur">Tap the floor to walk · time here together fills the hall goal · the doors open the clan’s goals, battles and ranks</div>
          </motion.div>
        )}
      </AnimatePresence>

      {!edit && !game && me && (invite || lobby) && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(12px,env(safe-area-inset-top,0px))+118px)] z-20 flex justify-center px-3">
          {lobby ? <TableLobby t={lobby} myId={me.user_id} onChange={room.refresh} /> : invite && <TableInvite t={invite} onJoined={room.refresh} />}
        </div>
      )}
      {!edit && !game && <PlanetChatBox chat={chat} myId={me?.user_id} className="absolute bottom-[104px] left-3 z-20" title="Clan chat" sub={`${here} in the hall`} placeholder="Message your clan…" empty="Say hi to your clan 👋" notHere="One moment — still stepping inside…" />}
      {picker && <GamePicker home={c.id} here={here} onClose={() => setPicker(false)} onMade={room.refresh} />}
      {game && me && (SIMS3[game.game]
        ? <Live3D game={game} myId={me.user_id} onClose={() => { setGame(null); room.refresh(); }} />
        : <PartyGame game={game} myId={me.user_id} onClose={() => { setGame(null); room.refresh(); }} />)}
      {edit && hall.current && officer && c.catalog && (
        <Decorator h={asHome} start={layout} scene={hall.current} onClose={() => setEdit(false)}
          clan={{ level: c.level, unlocks, save: async (name, st, l) => { qc.setQueryData(clanKeys.mine, await api.clanHallSave(name, st, l)); } }} />
      )}
    </div>
  );
}

function DoorPanel({ kind, c }: { kind: DoorKind; c: Clan }) {
  const d = DOORS.find((x) => x.kind === kind)!;
  const live = c.battles?.find((b) => b.status === 'live');
  return (
    <div className="w-full max-w-md rounded-3xl bg-black/75 p-4 shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 30px ${d.color}55, inset 0 0 0 2px ${d.color}` }} data-testid="hall-door">
      <div className="mb-2 flex items-center gap-2"><span className="text-3xl">{d.emoji}</span><b className="font-display text-xl">{d.label}</b></div>
      {kind === 'goals' && <div className="grid gap-1.5 text-sm">{(c.goals ?? []).map((g) => (
        <div key={g.n} className="flex items-center gap-2"><span>{g.emoji}</span><span className="min-w-0 flex-1 truncate">{g.label}</span>
          <span className="text-xs font-bold">{g.done ? '✅' : `${Math.floor((g.progress / g.target) * 100)}%`}</span></div>
      ))}<span className="text-xs text-white/60">New goals in {until(c.week_ends)}</span></div>}
      {kind === 'battles' && <p className="text-sm text-white/80">{live ? `⚔️ vs ${live.vs.name}: ${fmt(live.us)} – ${fmt(live.them)} · ${until(live.ends_at)} left` : `${c.wins} wins, ${c.losses} losses. Officers can challenge any clan to a day-long Ink race.`}</p>}
      {kind === 'board' && <p className="text-sm text-white/80">{c.season_rank ? `Your clan is #${c.season_rank} this week with ${fmt(c.week_score)} Ink.` : 'Earn Ink this week to get on the board.'} The top clans win season rewards.</p>}
      {kind === 'members' && <p className="text-sm text-white/80">{c.members_list.filter((m) => m.in_hall).length} in the hall · {c.members}/{c.cap} members.</p>}
      <Link to={`/clans?tab=${kind}`} className="mt-3 block" data-testid="hall-door-go"><Button variant="rainbow" size="sm" className="w-full">Open {d.label.toLowerCase()} →</Button></Link>
    </div>
  );
}
