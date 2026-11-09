// Your home, and everyone else's: /home is yours, /u/:username/home is theirs. Walk in as your explorer; the
// doors on the left lead to their places, their art hangs either side of the window, their trophies and Inkborn
// are about the place. Up to 10 people share a home at a time, live. Owners press Decorate to furnish it:
// tap a piece to pick it up, drag it, turn it, recolour it; change the wallpaper, floor, view and lighting;
// and choose who may use each door.
import { pulse } from '../lib/pulse';
import { live } from '../lib/poll';
import { useNudge } from '../lib/nudge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BookHeart, Check, DoorOpen, Lock, Paintbrush, RotateCw, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { ExplorerStyle, HomeData, RealmKind, HomeGame, HomeLive, HomePlaced, HomeStyleData, PlanetChatMsg } from '../backend/types';
import { PlanetChatBox } from '../space/PlanetChat';
import { TRACKS, music } from '../arcade/music';
import { isRealm, REALM_KINDS, REALM_META, realmRoute } from '../realms/kinds';
import { GuestBook } from './GuestBook';
import { PartyGame } from './party/PartyGame';
import { Live3D } from './live3d/Live3D';
import { SIMS3 } from './live3d/sims';
import { GamePicker, TableInvite, TableLobby } from './party/Tables';
import { explorerSvg } from '../explorer/character';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { FriendButton } from '../social/FriendButton';
import { Button, ResourceIcon, Spinner } from '../ui';
import { CheckIn } from '../visit/VisitRoom';
import { randomGenome } from '../inkborn/genome';
import { CATALOG, CATS, ITEM, swatches, colorOf, type Cat } from './furniture';
import { DEFAULT_STYLE, createHome, type HomeDoor, type HomeScene, type HomeSpot, type Placed } from './home3d';

export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
type Kind = 'arcade' | 'habitat' | 'farm' | 'business' | RealmKind;
const KINDS: Kind[] = ['arcade', 'habitat', 'farm', 'business', ...REALM_KINDS];
const DOOR_META: Record<Kind, { label: string; emoji: string; color: string; route: (id: string) => string; none: string }> = {
  ...(Object.fromEntries(REALM_KINDS.map((k) => [k, { label: REALM_META[k].name, emoji: REALM_META[k].emoji, color: REALM_META[k].color, route: realmRoute, none: `Turn a plot into ${/^[aeiou]/i.test(REALM_META[k].name) ? 'an' : 'a'} ${REALM_META[k].name} to open this door.` }])) as Record<RealmKind, { label: string; emoji: string; color: string; route: (id: string) => string; none: string }>),
  arcade: { label: 'Arcade', emoji: '🕹️', color: '#22E3FF', route: (id) => `/arcade/${id}`, none: 'Turn a plot into an arcade to open this door.' },
  habitat: { label: 'Sanctuary', emoji: '🐾', color: '#3DDC97', route: (id) => `/habitat/${id}`, none: 'Make an Inkborn sanctuary to open this door.' },
  farm: { label: 'Farm', emoji: '🌾', color: '#FFB13D', route: (id) => `/farm/${id}`, none: 'Turn a plot into a farm to open this door.' },
  business: { label: 'Business', emoji: '🍋', color: '#FF5FA2', route: (id) => `/business/${id}`, none: 'Turn a plot into a business to open this door.' },
};
const PRIVACY = [{ v: 'public', label: 'Everyone' }, { v: 'friends', label: 'Friends' }, { v: 'hidden', label: 'Only me' }] as const;
const STYLE_LABEL: Record<string, string> = {
  paint: 'Paint', stripes: 'Stripes', floral: 'Floral', brick: 'Brick', wood: 'Wood panels', stars: 'Starry', splatter: 'Ink splatter', tiles: 'Tiles', scallop: 'Scallops',
  oak: 'Oak', walnut: 'Walnut', herringbone: 'Herringbone', checker: 'Checkerboard', carpet: 'Carpet', marble: 'Marble', tatami: 'Tatami',
  city: '🏙️ City', forest: '🌲 Forest', beach: '🏝️ Beach', mountains: '🏔️ Mountains', space: '🪐 Space', sunset: '🌅 Sunset sea',
  warm: '☀️ Warm', day: '🌤️ Daylight', cozy: '🛋️ Cozy', neon: '💜 Neon', candle: '🕯️ Candlelight',
};
const WALL_COLORS = ['#E9DCC9', '#F4F1EA', '#FFD1DC', '#CDE7F0', '#D5E8C9', '#FFE8A3', '#E3D5F5', '#C9B79C', '#8C9BAE', '#5B6B5A', '#3E4A61', '#2B2B33'];
const FLOOR_COLORS = ['#C69C6D', '#E3C69A', '#8B5A3C', '#A0522D', '#D8D2C6', '#9AA5B1', '#B5485D', '#3E5C76', '#6B8E5A', '#F4F1EA', '#4A4A4A', '#C9A227'];
const TRIMS = ['#FFFFFF', '#F4F1EA', '#2B2B33', '#5C3A21', '#3E5C76', '#B5485D', '#2F4F4F', '#C9A227'];

/** what a fresh home has in it: a sofa under the art, a dining table, a bed in the corner, all free pieces */
export const DEFAULT_LAYOUT: Placed[] = [
  { i: 'rug_rect', x: -3.6, z: -3.9, r: 0 }, { i: 'sofa', x: -3.75, z: -5.2, r: 0 }, { i: 'coffee_table', x: -3.75, z: -3.8, r: 0 },
  { i: 'armchair', x: -1.85, z: -3.8, r: 3 }, { i: 'floor_lamp', x: -5.2, z: -5.4, r: 0 }, { i: 'side_table', x: -2.25, z: -5.35, r: 0 }, { i: 'cactus', x: -2.25, z: -5.35, r: 0 },
  { i: 'monstera', x: 2.3, z: -5.3, r: 0 }, { i: 'bed', x: 4.6, z: -4.9, r: 0 }, { i: 'bookshelf', x: 6.55, z: -1.9, r: 3 }, { i: 'trophy_case', x: 6.5, z: 0.5, r: 3 },
  { i: 'dining_table', x: 2.4, z: 2.6, r: 0 }, { i: 'dining_chair', x: 1.9, z: 1.85, r: 0 }, { i: 'dining_chair', x: 2.9, z: 1.85, r: 0 },
  { i: 'dining_chair', x: 1.9, z: 3.35, r: 2 }, { i: 'dining_chair', x: 2.9, z: 3.35, r: 2 },
  { i: 'wall_clock', x: 6.9, z: 3.9, r: 3 }, { i: 'wall_shelf', x: 6.9, z: 2.3, r: 3 },
  { i: 'game_table', x: -2.25, z: 1.5, r: 0 }, { i: 'guestbook', x: -3.0, z: 4.9, r: 0 }, { i: 'record_player', x: -3.45, z: -3.75, r: 0 },
];
const isFresh = (h: HomeData) => !h.layout.length && !Object.keys(h.style ?? {}).length && !h.name;

export default function HomeScreen() {
  const me = useOnboardedMe();
  const params = useParams();
  const username = params.username ?? me?.profile.username ?? '';
  const home = useQuery({ queryKey: ['home', username.toLowerCase()], queryFn: () => api.homeGet(username), enabled: !!username, staleTime: 20_000, refetchOnWindowFocus: false });
  const profile = useQuery({ queryKey: ['profile', username], queryFn: () => api.profileByUsername(username), enabled: !!username, staleTime: 60_000 });
  if (!username || home.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#2A1F1A]"><Spinner /></div>;
  if (home.error || !home.data) {
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#2A1F1A] p-6 text-center text-white" data-testid="home-missing">
        <div className="text-5xl">🏠</div><p>This home couldn’t be found.</p>
        <Link to="/world"><Button variant="secondary">Back to the map</Button></Link>
      </div>
    );
  }
  return <HomeView key={home.data.host.id} h={home.data} profile={profile.data} />;
}

type Prof = { achievements?: { icon?: string; unlocked_at?: string | null }[]; gallery?: { id: string; title: string; thumb_path: string | null; preview_path: string | null }[] } | undefined;

/** what the live-room hooks need from a 3D scene (the house, or the Clan Keep) */
export type LiveScene = Pick<HomeScene, 'pose' | 'setOthers' | 'moveOther' | 'say'>;
export function useHomeLive(hostId: string, myId: string | undefined, hall: React.RefObject<LiveScene | null>, onRec: (id: string, by: string) => void, chatRef: React.RefObject<((m: unknown) => void) | null>) {
  const [live, setLive] = useState<HomeLive | null>(null);
  const api2 = useRef({ refresh: () => {}, send: (_m: unknown) => {} });
  const recRef = useRef(onRec); recRef.current = onRec;
  useEffect(() => {
    if (!myId) return;
    const backend = getBackend();
    let stopped = false, ch: { send(m: unknown): void; close(): void } | null = null, chName = '', members = new Set<string>();
    const urls = new Map<string, string>();
    let others: Parameters<LiveScene['setOthers']>[0] = [];
    let lastLive: HomeLive | null = null;
    const onMsg = (raw: unknown) => {
      const m = raw as { t: string; id: string; x: number; z: number; f: number; rec?: string };
      if (m?.t === 'nudge') return p.soon(); // someone changed the room (a table, a game): look again
      if (m?.t === 'pos' && members.has(m.id)) hall.current?.moveOther(m.id, m.x, m.z, m.f);
      else if (m?.t === 'pos' && m.id !== myId) p.soon(); // someone new: fetch the list now
      if (m?.t === 'rec' && typeof m.rec === 'string') recRef.current(m.rec, m.id);
      if (m?.t === 'chat' && members.has(m.id)) chatRef.current?.((raw as { m: unknown }).m);
    };
    // arrivals and departures come straight from the live channel; a departure disappears at once
    const onPeer = (id: string, here: boolean) => {
      if (!here && members.has(id)) { members.delete(id); others = others.filter((o) => o.id !== id); hall.current?.setOthers(others); }
      p.soon(here ? 600 : 2000);
    };
    const beat = async () => {
      if (stopped || document.hidden) return;
      const pose = hall.current?.pose();
      try {
        const r = await api.homeLive(hostId, pose?.x ?? null, pose?.z ?? null);
        if (stopped) return;
        members = new Set(r.members.map((m) => m.id));
        others = r.members.map((m) => {
          let u = urls.get(m.id); if (!u) { u = svgUrl(explorerSvg(m.explorer_style as ExplorerStyle | undefined, m.accent_color ?? '#7B5CFF', 184)); urls.set(m.id, u); }
          return { id: m.id, url: u, name: `@${m.username}`, x: m.x, z: m.z };
        });
        hall.current?.setOthers(others);
        if (r.channel !== chName) { ch?.close(); chName = r.channel; ch = backend.liveChannel?.(r.channel, onMsg, { me: myId, onPeer }) ?? null; }
        lastLive = r;
        setLive(r);
      } catch { /* next beat */ }
    };
    // check in often only while a table game is being set up or played; otherwise every half minute
    const p = pulse(beat, () => !!lastLive?.game); // table changes arrive as nudges on the room's channel
    api2.current = { refresh: () => { p.now(); ch?.send({ t: 'nudge' }); }, send: (m) => ch?.send(m) };
    let lastKey = '', lastAt = 0;
    const tx = setInterval(() => {
      const p = hall.current?.pose(); if (!p || !ch) return;
      const key = `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.face}`, now = performance.now();
      if (key !== lastKey || now - lastAt > 6000) { lastKey = key; lastAt = now; ch.send({ t: 'pos', id: myId, x: p.x, z: p.z, f: p.face }); }
    }, 120);
    return () => { stopped = true; p.stop(); clearInterval(tx); ch?.close(); void api.homeLeave().catch(() => {}); };
  }, [hostId, myId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { live, refresh: () => api2.current.refresh(), send: (m: unknown) => api2.current.send(m) };
}

/** chat for everyone in the house: a chat box, and speech bubbles over whoever said it */
export function useHomeChat(home: string, myId: string | undefined, scene: { current: LiveScene | null }, send: (m: unknown) => void,
  fns: { list(after: number): Promise<{ items: PlanetChatMsg[]; shard?: number | null; clan?: string | null }>; send(body: string): Promise<PlanetChatMsg>;
         /** where the server nudges when someone says something (from the list's answer) */ topic?(r: { shard?: number | null; clan?: string | null }): string | null } =
    { list: (a) => api.homeChatList(home, a), send: (b) => api.homeChatSend(home, b) }) {
  const fnRef = useRef(fns); fnRef.current = fns;
  const [msgs, setMsgs] = useState<PlanetChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const last = useRef(0), seen = useRef(new Set<number>()), first = useRef(true), open = useRef(false);
  const add = useCallback((list: PlanetChatMsg[], bubbles: boolean, fromList = false) => {
    const fresh = list.filter((m) => m && typeof m.id === 'number' && !seen.current.has(m.id) && typeof m.body === 'string' && m.player?.id);
    if (!fresh.length) return;
    for (const m of fresh) { seen.current.add(m.id); if (fromList) last.current = Math.max(last.current, m.id); if (bubbles) scene.current?.say(m.player.id === myId ? 'me' : m.player.id, m.body); }
    setMsgs((cur) => [...cur, ...fresh].sort((a, b) => a.id - b.id).slice(-40));
    if (!open.current) setUnread((u) => u + fresh.filter((m) => m.player.id !== myId).length);
  }, [scene, myId]);
  // the server nudges this room's chat topic when someone says something; the list call (filtered and checked) is the
  // only way messages get in. Until the first answer says which room you're in, look every few seconds.
  const [topic, setTopic] = useState<string | null>(null);
  useEffect(() => { setTopic(null); }, [home]);
  const tick = useCallback(async () => {
    try {
      const r = await fnRef.current.list(last.current);
      const t = fnRef.current.topic ? fnRef.current.topic(r) : r.shard != null ? `hc:${home}:${r.shard}` : null;
      setTopic(t);
      add(r.items, !first.current, true); first.current = false;
    } catch { /* next time */ }
  }, [home, add]);
  const nudge = useNudge(myId && topic ? topic : null, tick, { enabled: !!myId, immediate: false, safetyMs: live(60_000), fallbackMs: live(8000), gapMs: 1000 });
  useEffect(() => {
    if (!myId || topic) return;
    const t0 = setTimeout(() => void tick(), 1500); const t = setInterval(() => { if (!document.hidden) void tick(); }, 5000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [myId, topic, tick]);
  return {
    msgs, unread,
    send: async (body: string) => { const m = await fnRef.current.send(body); add([m], true); send({ t: 'chat', id: myId, m }); return m; },
    // someone in the room says they just sent something: look now (what they sent isn't trusted as-is)
    onChat: () => nudge.current?.soon(0),
    setOpen: (o: boolean) => { open.current = o; if (o) setUnread(0); },
  };
}

function HomeView({ h, profile }: { h: HomeData; profile: Prof }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const cv = useRef<HTMLCanvasElement>(null);
  const hall = useRef<HomeScene | null>(null);
  const [near, setNear] = useState<HomeSpot | null>(null);
  const [art, setArt] = useState<string[]>([]);
  const [edit, setEdit] = useState(false);
  const [guests, setGuests] = useState(false);
  const [picker, setPicker] = useState(false);
  const [game, setGame] = useState<HomeGame | null>(null);
  const [rec, setRec] = useState<string>(h.style.music ?? 'jazz');
  const [musicOn, setMusicOn] = useState(true);
  const [recPanel, setRecPanel] = useState(false);
  const host = h.host, own = h.own;
  const startLayout = useMemo(() => (isFresh(h) ? DEFAULT_LAYOUT : h.layout) as Placed[], [h]);
  const gallery = profile?.gallery ?? [];
  const achievements = useMemo(() => (profile?.achievements ?? []).filter((a) => a.unlocked_at).map((a) => a.icon ?? '🏅'), [profile]);

  // the two best pieces of their art, for the frames either side of the window (and the easel and TV)
  useEffect(() => {
    let off = false;
    void Promise.all(gallery.slice(0, 3).map((g) => getBackend().publicAssetUrl(g.preview_path ?? g.thumb_path).catch(() => null))).then((u) => { if (!off) setArt(u.filter(Boolean) as string[]); });
    return () => { off = true; };
  }, [gallery.map((g) => g.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // four doors on the wall: the places they have (busiest kinds first), and when there are more kinds than fit
  // (there are nine), the last door opens onto all of them
  const doorKinds = useMemo(() => {
    const filled = KINDS.filter((k) => h.doors[k]?.count);
    if (!own) return filled.length <= 4 ? filled : [...filled.slice(0, 3), 'more' as const];
    const firstThree = [...filled, ...KINDS.filter((k) => !filled.includes(k))].slice(0, 3);
    return [...firstThree, 'more' as const];
  }, [h, own]);
  const doors: HomeDoor[] = useMemo(() => doorKinds.flatMap((k): HomeDoor[] => {
    if (k === 'more') { const n = KINDS.filter((x) => h.doors[x]?.count).length; return [{ kind: 'more', label: 'All places', emoji: '🌍', color: '#FFD23F', plaque: `${n} kind${n === 1 ? '' : 's'} of place`, state: 'open' }]; }
    const d = h.doors[k], m = DOOR_META[k], c = h.careers;
    if (!d || (!own && !d.count)) return [];
    const plaque = isRealm(k) ? `Level ${Math.max(1, c.realms?.[k] ?? 1)} ${REALM_META[k].one}` : k === 'arcade' ? `Level ${Math.max(1, c.arcade)} arcade` : k === 'habitat' ? `Keeper lv ${Math.max(1, c.keeper)} · ${c.creatures} Inkborn` : k === 'farm' ? `Farmer lv ${Math.max(1, c.farmer)}` : `${fmt(c.merchant)} earned`;
    return [{ kind: k, label: m.label, emoji: m.emoji, color: m.color, plaque: d.count ? plaque : own ? 'Not yet — tap to start' : '', state: !d.count ? 'empty' : d.open ? 'open' : 'locked', here: d.places[0]?.here }];
  }), [h, own, doorKinds]);

  // the scene
  useEffect(() => {
    if (!cv.current) return;
    const s = createHome({
      canvas: cv.current, reduceMotion: reduce,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style as ExplorerStyle | undefined, me?.profile.accent_color ?? '#7B5CFF', 184)),
      onNear: setNear,
      onCreature: (c) => toast(`${c.name} is happy to see you 💗`, { duration: 1500 }),
    });
    hall.current = s;
    if (import.meta.env.DEV || location.search.includes('e2e=1')) Object.assign(window, { __landvasHome: s, __homeGenome: randomGenome });
    return () => { s.dispose(); hall.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (edit) return;
    hall.current?.setHome({ style: h.style, layout: startLayout, doors, art, achievements, inkborn: h.inkborn });
  }, [h, startLayout, doors, art, achievements, edit]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatIn = useRef<((m: unknown) => void) | null>(null);
  const room = useHomeLive(host.id, me?.user_id, hall, (id, by) => {
    setRec(id); const who = room.live?.members.find((m) => m.id === by);
    if (who) toast(`🎶 @${who.username} put on ${id === 'off' ? 'silence' : TRACKS.find((t) => t.id === id)?.name ?? 'a record'}`, { duration: 2000 });
  }, chatIn);
  const chat = useHomeChat(host.id, me?.user_id, hall, room.send);
  chatIn.current = chat.onChat;
  const live = room.live;
  const here = (live?.members.length ?? 0) + 1;
  // the host started your table: in you go
  const handled = useRef(new Set<string>());
  useEffect(() => {
    const g = live?.game; if (!g || g.status !== 'playing' || handled.current.has(g.id)) return;
    handled.current.add(g.id); setGame(g); setRecPanel(false); setPicker(false);
  }, [live?.game]);
  const lobby = live?.game?.status === 'lobby' ? live.game : null;
  const invite = !lobby ? live?.tables.find((t) => !t.players.some((p) => p.id === me?.user_id)) : null;
  // the record player: music for the whole house (it starts on your first tap; browsers insist)
  const hasPlayer = useMemo(() => (edit ? [] : startLayout).some((p) => p.i === 'record_player' || p.i === 'jukebox') || h.layout.some((p) => p.i === 'record_player' || p.i === 'jukebox'), [startLayout, h.layout, edit]);
  const started = useRef(false);
  useEffect(() => {
    if (!hasPlayer || !musicOn || rec === 'off') { if (started.current) music.stop(); return; }
    const go = () => { started.current = true; music.play(rec, false); };
    if (started.current) { go(); return; }
    const once = () => { go(); window.removeEventListener('pointerdown', once); };
    window.addEventListener('pointerdown', once);
    return () => window.removeEventListener('pointerdown', once);
  }, [hasPlayer, musicOn, rec]);
  useEffect(() => { music.setDuck(!!game); }, [game]);
  useEffect(() => () => { music.stop(); music.setDuck(false); }, []);
  const putOn = async (id: string) => {
    setRec(id); setMusicOn(true); music.play(id === 'off' ? null : id, false); if (id === 'off') music.stop();
    room.send({ t: 'rec', id: me?.user_id, rec: id });
    if (own) { try { qc.setQueryData(['home', host.username.toLowerCase()], await api.homeSave(h.name, { ...h.style, music: id }, (hall.current?.layout() ?? h.layout) as HomePlaced[])); } catch { /* it still plays */ } }
  };
  const title = h.name || `${host.display_name || host.username}’s home`;
  const nd = near?.kind === 'door' ? (near.door as Kind | 'more') : null;
  const nArt = near?.kind === 'art' ? gallery[near.i] : null;
  const nItem = near?.kind === 'item' ? near.id : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#2A1F1A] text-white" data-testid="home">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="home-canvas" />
      {/* top bar */}
      {!edit && <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={() => (history.length > 1 ? nav(-1) : nav(`/u/${host.username}`))} className="pointer-events-auto rounded-xl bg-black/45 p-2 backdrop-blur" aria-label="Back" data-testid="home-back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl bg-black/45 px-3 py-1.5 backdrop-blur">
          <div className="truncate font-display text-lg font-black leading-tight" data-testid="home-title">🏠 {title}</div>
          <div className="flex items-center gap-2 text-[11px] text-white/75">
            <Link to={`/u/${host.username}`} className="truncate font-bold hover:underline">@{host.username}</Link>
            <span className="flex items-center gap-1 font-bold text-[#7DFFB2]" data-testid="home-here"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7DFFB2]" />{here}/{live?.room_size ?? 10} here</span>
          </div>
        </div>
        {!edit && (
          <div className="pointer-events-auto flex flex-col gap-2">
            {own && <button onClick={() => { setEdit(true); }} className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#FFB13D] to-[#FF5FA2] text-[9px] font-black shadow-lg" data-testid="home-decorate"><Paintbrush className="h-5 w-5" />Decorate</button>}
            <button onClick={() => setPicker(true)} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/45 text-[9px] font-bold backdrop-blur" data-testid="home-games"><span className="text-lg leading-none">🎲</span>Games</button>
            <button onClick={() => setGuests(true)} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/45 text-[9px] font-bold backdrop-blur" data-testid="home-guestbook"><BookHeart className="h-5 w-5 text-[#FF9FB2]" />Book</button>
            {hasPlayer && <button onClick={() => { const on = !musicOn; setMusicOn(on); if (on && rec !== 'off') { started.current = true; music.play(rec, false); } else music.stop(); }} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/45 text-[9px] font-bold backdrop-blur" aria-label={musicOn ? 'Music off' : 'Music on'} data-testid="home-music">{musicOn && rec !== 'off' ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}{musicOn && rec !== 'off' ? 'Music' : 'Muted'}</button>}
          </div>
        )}
      </div>}
      {!own && !edit && (
        <div className="pointer-events-auto absolute left-3 top-[calc(max(12px,env(safe-area-inset-top,0px))+64px)] flex gap-2">
          <CheckIn username={host.username} />
          <FriendButton playerId={host.id} username={host.username} />
        </div>
      )}

      {/* what you're standing at */}
      <AnimatePresence>
        {!edit && nd && (
          <motion.div key={nd} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            {nd === 'more' ? <AllPlacesPanel h={h} onGo={(k, id) => nav(DOOR_META[k].route(id))} /> : <DoorPanel kind={nd} h={h} onGo={(id) => nav(DOOR_META[nd].route(id))} />}
          </motion.div>
        )}
        {!edit && nArt && (
          <motion.div key="art" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <Link to={`/art/${nArt.id}`} className="flex items-center gap-3 rounded-3xl bg-black/70 px-5 py-3 shadow-2xl backdrop-blur" data-testid="home-art"><span className="text-3xl">🖼️</span><span><span className="block font-display text-lg font-black">{nArt.title || 'Untitled'}</span><span className="text-xs text-white/70">View the artwork</span></span></Link>
          </motion.div>
        )}
        {!edit && !game && nItem && (nItem === 'game_table' || nItem === 'card_table') && !lobby && (
          <motion.div key="table" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <button onClick={() => setPicker(true)} className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#FFB13D] to-[#FF5FA2] px-5 py-3 text-left text-[#2A0A1A] shadow-2xl" data-testid="home-table"><span className="text-4xl">🎲</span>
              <span><span className="block font-display text-2xl font-black">Play a game</span><span className="block text-xs font-bold">Board games & party games with everyone here</span></span></button>
          </motion.div>
        )}
        {!edit && !game && (nItem === 'record_player' || nItem === 'jukebox') && (
          <motion.div key="rec" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <RecordPanel rec={musicOn ? rec : 'off'} onPick={(id) => void putOn(id)} own={own} />
          </motion.div>
        )}
        {!edit && !game && nItem === 'guestbook' && !guests && (
          <motion.div key="gb" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <button onClick={() => setGuests(true)} className="flex items-center gap-3 rounded-3xl bg-[#6B2E2E] px-5 py-3 text-left text-[#F4E3B5] shadow-2xl" data-testid="home-open-book"><span className="text-4xl">📖</span>
              <span><span className="block font-display text-2xl font-black">{own ? 'Read your guestbook' : 'Sign the guestbook'}</span><span className="block text-xs">Leave @{host.username} a note</span></span></button>
          </motion.div>
        )}
        {!edit && !near && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <div className="rounded-full bg-black/55 px-4 py-2 text-center text-xs text-white/85 backdrop-blur">{own ? 'Tap the floor to walk · the doors lead to your places · Decorate to make it yours' : `Walk round · the doors lead to @${host.username}’s places · tap an Inkborn to say hi`}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {!edit && !game && me && (invite || lobby) && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(12px,env(safe-area-inset-top,0px))+118px)] z-20 flex justify-center px-3">
          {lobby ? <TableLobby t={lobby} myId={me.user_id} onChange={room.refresh} /> : invite && <TableInvite t={invite} onJoined={room.refresh} />}
        </div>
      )}
      {!edit && !game && !guests && (
        <PlanetChatBox chat={chat} myId={me?.user_id} className="absolute bottom-[104px] left-3 z-20" title="House chat" sub={`${here} here`} placeholder="Say something to the house…" empty="Say hi to everyone here 👋" notHere="One moment — still stepping inside…" />
      )}
      {picker && <GamePicker home={host.id} here={here} onClose={() => setPicker(false)} onMade={room.refresh} />}
      {game && me && (SIMS3[game.game]
        ? <Live3D game={game} myId={me.user_id} onClose={() => { setGame(null); room.refresh(); }} />
        : <PartyGame game={game} myId={me.user_id} onClose={() => { setGame(null); room.refresh(); }} />)}
      {edit && hall.current && own && <Decorator h={h} start={startLayout} scene={hall.current} onClose={(saved) => {
        setEdit(false);
        if (saved) { qc.setQueryData(['home', host.username.toLowerCase()], saved); invalidateGame(qc); }
      }} />}
      {guests && <GuestBook username={host.username} hostName={host.display_name || host.username} own={own} onClose={() => setGuests(false)} />}
    </div>
  );
}

function DoorPanel({ kind, h, onGo }: { kind: Kind; h: HomeData; onGo(id: string): void }) {
  const d = h.doors[kind] ?? { privacy: 'public' as const, open: true, count: 0, places: [] }, m = DOOR_META[kind];
  return (
    <div className="w-full max-w-md rounded-3xl bg-black/75 p-4 shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 30px ${m.color}55, inset 0 0 0 2px ${m.color}` }} data-testid="home-door">
      <div className="mb-2 flex items-center gap-2"><span className="text-3xl">{m.emoji}</span><b className="font-display text-xl">{m.label}</b>
        {h.own && d.count > 0 && <span className="ml-auto text-[11px] text-white/60">{d.privacy === 'public' ? 'Open to everyone' : d.privacy === 'friends' ? 'Friends only' : 'Only you'}</span>}</div>
      {!d.count ? (
        h.own ? <div className="grid gap-2"><p className="text-sm text-white/80">{m.none}</p><Link to="/plots"><Button variant="rainbow" size="sm" className="w-full">Go to my plots</Button></Link></div>
          : null
      ) : !d.open ? (
        <p className="flex items-center gap-2 text-sm text-white/80" data-testid="home-door-locked"><Lock className="h-4 w-4" /> @{h.host.username} keeps this door {d.privacy === 'friends' ? 'for friends' : 'closed'}.</p>
      ) : (
        <div className="grid gap-1.5">
          {d.places.slice(0, 6).map((p) => (
            <button key={p.id} onClick={() => onGo(p.id)} className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2.5 text-left hover:bg-white/15" data-testid="home-door-go">
              <DoorOpen className="h-5 w-5 shrink-0" style={{ color: m.color }} />
              <span className="min-w-0 flex-1"><span className="block truncate font-bold">{p.name}</span>
                <span className="text-[11px] text-white/60">{p.plots} plot{p.plots === 1 ? '' : 's'}{p.rarity ? ` · ${p.rarity}` : ''}{p.level ? ` · level ${p.level}` : ''}{p.here ? ` · ${p.here} playing` : ''}</span></span>
              <span className="text-sm font-black" style={{ color: m.color }}>Go →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** the last door: every kind of place they have (and, for the owner, the kinds they could start) */
function AllPlacesPanel({ h, onGo }: { h: HomeData; onGo(k: Kind, id: string): void }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const list = KINDS.filter((k) => h.own || h.doors[k]?.count);
  if (open) return <div className="grid w-full max-w-md gap-2"><button onClick={() => setOpen(null)} className="justify-self-start rounded-xl bg-black/60 px-3 py-1.5 text-xs font-bold">← All places</button><DoorPanel kind={open} h={h} onGo={(id) => onGo(open, id)} /></div>;
  return (
    <div className="w-full max-w-md rounded-3xl bg-black/75 p-4 shadow-2xl backdrop-blur" style={{ boxShadow: '0 0 30px #FFD23F55, inset 0 0 0 2px #FFD23F' }} data-testid="home-all-places">
      <div className="mb-2 flex items-center gap-2"><span className="text-3xl">🌍</span><b className="font-display text-xl">All places</b></div>
      <div className="grid max-h-[46vh] grid-cols-2 gap-1.5 overflow-y-auto">
        {list.map((k) => { const d = h.doors[k], m = DOOR_META[k]; const n = d?.count ?? 0; return (
          <button key={k} onClick={() => (n === 1 && d!.open ? onGo(k, d!.places[0].id) : setOpen(k))} className={cn('flex items-center gap-2 rounded-2xl px-2.5 py-2 text-left', n ? 'bg-white/10 hover:bg-white/15' : 'bg-white/5 opacity-60')} data-testid={`home-place-${k}`}>
            <span className="text-2xl">{m.emoji}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-bold">{m.label}</span><span className="text-[11px] text-white/60">{n ? `${n} place${n === 1 ? '' : 's'}` : 'Not yet'}</span></span>
          </button>
        ); })}
      </div>
    </div>
  );
}

// ---- decorating -------------------------------------------------------------------------------------------------------
/** clan halls: pieces come from the clan's level instead of purchases, and there are no doors to set */
export type HallDecor = { level: number; unlocks: Record<string, number>; save(name: string | null, style: HomeStyleData, layout: Placed[]): Promise<void> };
export function Decorator({ h, start, scene, onClose, clan }: { h: HomeData; start: Placed[]; scene: HomeScene; onClose(saved: HomeData | null): void; clan?: HallDecor }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'furniture' | 'room' | 'doors'>('furniture');
  const [cat, setCat] = useState<Cat>('Seating');
  const [layout, setLayout] = useState<Placed[]>(start);
  const [style, setStyle] = useState<HomeStyleData>({ ...DEFAULT_STYLE, ...h.style });
  const [name, setName] = useState(h.name ?? '');
  const [owned, setOwned] = useState<Record<string, number>>(h.items ?? {});
  const [tickets, setTickets] = useState(h.tickets ?? 0);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [doors, setDoors] = useState<Record<Kind, string>>(() => Object.fromEntries(KINDS.map((k) => [k, h.doors[k]?.privacy ?? 'public'])) as Record<Kind, string>);
  const [open, setOpen] = useState(true);
  const ink = Number(me?.balances?.ink ?? 0);
  const freeEach = h.catalog.free_each ?? 6;
  const dirty = useRef(false);

  useEffect(() => {
    scene.setEditing(true);
    scene.setLayout(start);
    scene.listen({ onSelect: setSel, onLayout: (l) => { setLayout(l); dirty.current = true; } });
    return () => { scene.listen({}); scene.setEditing(false); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const used = (id: string) => layout.filter((p) => p.i === id).length;
  const price = (id: string) => h.catalog.items[id]?.price ?? {};
  const isFree = (id: string) => !price(id).ink && !price(id).tickets;
  const needLv = (id: string) => clan?.unlocks[id] ?? 1;
  const canAdd = (id: string) => (clan ? needLv(id) <= clan.level && used(id) < freeEach : isFree(id) ? used(id) < freeEach : (owned[id] ?? 0) > used(id));
  const add = (id: string) => { if (layout.length >= (h.catalog.max_items ?? 90)) { toast.error('That’s as many pieces as fit.'); return; } scene.addItem(id); setOpen(false); dirty.current = true; };
  const buy = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.homeBuy(id, `home-${id}-${crypto.randomUUID()}`);
      setOwned((o) => ({ ...o, [r.item]: r.qty })); setTickets(r.tickets ?? tickets);
      invalidateGame(qc);
      toast.success(`${ITEM[id].name} bought`);
      scene.addItem(id); setOpen(false); dirty.current = true;
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const setS = (k: keyof HomeStyleData, v: string) => { const n = { ...style, [k]: v }; setStyle(n); scene.setStyle(n); dirty.current = true; };
  const save = async () => {
    setBusy('save');
    try {
      if (clan) { await clan.save(name.trim() || null, style, scene.layout()); toast.success('Hall saved'); onClose(null); return; }
      const saved = await api.homeSave(name.trim() || null, style, scene.layout());
      toast.success('Home saved');
      onClose(saved);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const cancel = () => { scene.setStyle(h.style); scene.setLayout(start); onClose(null); };
  const setDoor = async (k: Kind, v: string) => {
    const prev = doors[k]; setDoors((d) => ({ ...d, [k]: v }));
    try { const r = await api.homeDoors({ [k]: v }); qc.setQueryData(['home', h.host.username.toLowerCase()], r); toast.success(`${DOOR_META[k].label} door: ${PRIVACY.find((p) => p.v === v)?.label}`); }
    catch (e) { setDoors((d) => ({ ...d, [k]: prev })); toast.error(toGameError(e).message); }
  };
  const s = sel != null ? layout[sel] : null, si = s ? ITEM[s.i] : null;

  return (
    <>
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 pt-[max(12px,env(safe-area-inset-top,0px))]" data-testid="home-decorator">
        <button onClick={cancel} className="rounded-xl bg-black/50 px-3 py-2 text-sm font-bold" data-testid="home-cancel">Cancel</button>
        <div className="min-w-0 flex-1 text-center"><div className="font-display text-lg font-black">Decorating</div><div className="text-[11px] text-white/70">{layout.length} pieces · tap one to move it</div></div>
        <Button variant="rainbow" size="sm" loading={busy === 'save'} onClick={save} data-testid="home-save"><Check className="h-4 w-4" /> Save</Button>
      </div>

      {/* the piece you picked */}
      <AnimatePresence>
        {s && si && (
          <motion.div key={`sel-${sel}`} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] z-20 flex justify-center px-3" data-testid="home-selected">
            <div className="flex w-full max-w-md flex-wrap items-center gap-2 rounded-3xl bg-black/80 p-3 shadow-2xl backdrop-blur">
              <span className="text-2xl">{si.emoji}</span><b className="min-w-0 flex-1 truncate">{si.name}</b>
              {si.mount !== 'wall' && <button onClick={() => scene.rotateSel()} className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold" data-testid="home-rotate"><RotateCw className="h-4 w-4" /> Turn</button>}
              <button onClick={() => scene.removeSel()} className="flex items-center gap-1 rounded-xl bg-[#FF3D6E]/80 px-3 py-2 text-sm font-bold" data-testid="home-remove"><Trash2 className="h-4 w-4" /> Put away</button>
              <button onClick={() => scene.deselect()} className="rounded-xl bg-white/15 px-3 py-2 text-sm font-bold" data-testid="home-done">Done</button>
              {swatches(si.tint).length > 0 && (
                <div className="flex w-full flex-wrap gap-1.5 pt-1">
                  {swatches(si.tint).map((c, k) => (
                    <button key={c} onClick={() => scene.recolorSel(k)} aria-label={`Colour ${k + 1}`} className={cn('h-7 w-7 rounded-full border-2', colorOf(s.i, s.c) === c ? 'border-white' : 'border-white/20')} style={{ background: c }} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* the drawer */}
      {!s && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center">
          <div className="w-full max-w-2xl rounded-t-3xl bg-[#1C1512]/95 p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))] shadow-2xl backdrop-blur" data-testid="home-drawer">
            <div className="flex items-center gap-1">
              {(clan ? ['furniture', 'room'] as const : ['furniture', 'room', 'doors'] as const).map((t) => (
                <button key={t} onClick={() => { setTab(t); setOpen(true); }} className={cn('rounded-xl px-3 py-1.5 text-sm font-bold capitalize', tab === t && open ? 'bg-white text-[#1C1512]' : 'bg-white/10')} data-testid={`home-tab-${t}`}>{t === 'furniture' ? '🛋️ Furniture' : t === 'room' ? '🎨 Room' : '🚪 Doors'}</button>
              ))}
              {clan ? <span className="ml-auto text-xs font-bold">🏰 Clan level {clan.level}</span>
                : <span className="ml-auto flex items-center gap-2 text-xs font-bold"><span className="flex items-center gap-1"><ResourceIcon r="ink" className="h-4 w-4" />{fmt(ink)}</span><span>🎟️ {fmt(tickets)}</span></span>}
              <button onClick={() => setOpen(!open)} className="rounded-lg bg-white/10 px-2 py-1 text-xs" aria-label={open ? 'Hide' : 'Show'}>{open ? '▾' : '▴'}</button>
            </div>
            {open && tab === 'furniture' && (
              <div className="mt-2">
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-bold', cat === c ? 'bg-[#FFB13D] text-[#1C1512]' : 'bg-white/10')} data-testid={`home-cat-${c}`}>{c}</button>)}
                </div>
                <div className="mt-2 grid max-h-[34vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                  {CATALOG.filter((c) => c.cat === cat).map((c) => {
                    const pr = price(c.id), free = isFree(c.id), have = free ? freeEach : owned[c.id] ?? 0, u = used(c.id), ok = canAdd(c.id);
                    if (clan) return (
                      <div key={c.id} className={cn('grid gap-1 rounded-2xl bg-white/10 p-2 text-center', needLv(c.id) > clan.level && 'opacity-55')} data-testid={`home-item-${c.id}`}>
                        <div className="text-3xl">{c.emoji}</div>
                        <div className="truncate text-xs font-bold">{c.name}</div>
                        <div className="text-[10px] text-white/60">{needLv(c.id) > clan.level ? `🔒 Clan level ${needLv(c.id)}` : `${u}/${freeEach} out`}</div>
                        {ok ? <button onClick={() => add(c.id)} className="rounded-lg bg-[#3DDC97] py-1 text-xs font-black text-[#0F2A1E]" data-testid={`home-add-${c.id}`}>Place</button>
                          : <span className="py-1 text-[10px] text-white/50">{needLv(c.id) > clan.level ? 'Locked' : 'All out'}</span>}
                      </div>
                    );
                    return (
                      <div key={c.id} className="grid gap-1 rounded-2xl bg-white/10 p-2 text-center" data-testid={`home-item-${c.id}`}>
                        <div className="text-3xl">{c.emoji}</div>
                        <div className="truncate text-xs font-bold">{c.name}</div>
                        <div className="text-[10px] text-white/60">{free ? `Free · ${u}/${have} out` : have ? `${u}/${have} out` : pr.ink ? `${pr.ink} Ink` : `${pr.tickets} 🎟️`}</div>
                        {ok ? <button onClick={() => add(c.id)} className="rounded-lg bg-[#3DDC97] py-1 text-xs font-black text-[#0F2A1E]" data-testid={`home-add-${c.id}`}>Place</button>
                          : free ? <span className="py-1 text-[10px] text-white/50">All out</span>
                          : <button disabled={!!busy} onClick={() => void buy(c.id)} className="rounded-lg bg-[#FFB13D] py-1 text-xs font-black text-[#2A1A08] disabled:opacity-50" data-testid={`home-buy-${c.id}`}>{busy === c.id ? '…' : `Buy · ${pr.ink ? `${pr.ink} Ink` : `${pr.tickets} 🎟️`}`}</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {open && tab === 'room' && (
              <div className="mt-2 grid max-h-[40vh] gap-3 overflow-y-auto pr-1 text-sm">
                <label className="grid gap-1"><span className="text-xs font-bold text-white/70">Name over the door</span>
                  <input value={name} maxLength={32} onChange={(e) => { setName(e.target.value); dirty.current = true; }} placeholder={clan ? 'Clan hall' : `${h.host.display_name || h.host.username}’s home`} className="h-10 rounded-xl bg-white/10 px-3 text-white placeholder:text-white/40" data-testid="home-name" />
                </label>
                <Chips label="Wallpaper" opts={h.catalog.styles.wall} v={style.wall} on={(v) => setS('wall', v)} testid="home-wall" />
                <Swatches label="Wall colour" cols={WALL_COLORS} v={style.wall_color} on={(v) => setS('wall_color', v)} />
                <Chips label="Floor" opts={h.catalog.styles.floor} v={style.floor} on={(v) => setS('floor', v)} testid="home-floor" />
                <Swatches label="Floor colour" cols={FLOOR_COLORS} v={style.floor_color} on={(v) => setS('floor_color', v)} />
                <Swatches label="Trim & doors" cols={TRIMS} v={style.trim} on={(v) => setS('trim', v)} />
                <Chips label="The view" opts={h.catalog.styles.view} v={style.view} on={(v) => setS('view', v)} testid="home-view" />
                <Chips label="Lighting" opts={h.catalog.styles.mood} v={style.mood} on={(v) => setS('mood', v)} testid="home-mood" />
              </div>
            )}
            {open && tab === 'doors' && (
              <div className="mt-2 grid gap-2">
                <p className="text-xs text-white/70">Who can go through each door to your places. (This saves straight away.)</p>
                {KINDS.map((k) => (
                  <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 p-2" data-testid={`home-door-${k}`}>
                    <span className="text-xl">{DOOR_META[k].emoji}</span><b className="flex-1 text-sm">{DOOR_META[k].label}{h.doors[k]?.count ? '' : <span className="ml-1 text-[10px] font-normal text-white/50">(none yet)</span>}</b>
                    {PRIVACY.map((p) => <button key={p.v} onClick={() => void setDoor(k, p.v)} className={cn('rounded-lg px-2 py-1 text-[11px] font-bold', doors[k] === p.v ? 'bg-white text-[#1C1512]' : 'bg-white/10')} data-testid={`home-door-${k}-${p.v}`}>{p.label}</button>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Chips({ label, opts, v, on, testid }: { label: string; opts: string[]; v?: string; on(v: string): void; testid: string }) {
  return (
    <div className="grid gap-1"><span className="text-xs font-bold text-white/70">{label}</span>
      <div className="flex flex-wrap gap-1.5" data-testid={testid}>{opts.map((o) => <button key={o} onClick={() => on(o)} className={cn('rounded-full px-3 py-1 text-xs font-bold', v === o ? 'bg-[#FFB13D] text-[#1C1512]' : 'bg-white/10')} data-testid={`${testid}-${o}`}>{STYLE_LABEL[o] ?? o}</button>)}</div>
    </div>
  );
}
function Swatches({ label, cols, v, on }: { label: string; cols: string[]; v?: string; on(v: string): void }) {
  return (
    <div className="grid gap-1"><span className="text-xs font-bold text-white/70">{label}</span>
      <div className="flex flex-wrap gap-1.5">{cols.map((c) => <button key={c} onClick={() => on(c)} aria-label={c} className={cn('h-7 w-7 rounded-full border-2', v?.toUpperCase() === c.toUpperCase() ? 'border-white' : 'border-white/20')} style={{ background: c }} />)}</div>
    </div>
  );
}

export function RecordPanel({ rec, onPick, own }: { rec: string; onPick(id: string): void; own: boolean }) {
  const recs = TRACKS.filter((t) => t.home).concat(TRACKS.filter((t) => !t.home && !t.game));
  return (
    <div className="w-full max-w-md rounded-3xl bg-[#1C1512]/90 p-4 text-white shadow-2xl backdrop-blur" data-testid="home-records">
      <div className="mb-2 flex items-center gap-2"><motion.span animate={{ rotate: rec !== 'off' ? 360 : 0 }} transition={{ repeat: rec !== 'off' ? Infinity : 0, duration: 2.4, ease: 'linear' }} className="grid h-9 w-9 place-items-center rounded-full bg-[#111] text-lg ring-4 ring-[#2B2B33]">🎵</motion.span>
        <b className="flex-1 font-display text-lg">Record player</b><span className="text-[10px] text-white/60">{own ? 'Your pick plays for every visitor' : 'Everyone here hears it'}</span></div>
      <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto">
        {recs.map((t) => (
          <button key={t.id} onClick={() => onPick(t.id)} className={cn('flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-bold', rec === t.id ? 'bg-[#FFB13D] text-[#2A1A08]' : 'bg-white/10')} data-testid={`rec-${t.id}`}>
            <span className="text-lg">{t.emoji}</span><span className="truncate">{t.name}</span>
          </button>
        ))}
        <button onClick={() => onPick('off')} className={cn('rounded-xl px-2.5 py-2 text-sm font-bold', rec === 'off' ? 'bg-white text-[#1C1512]' : 'bg-white/10')} data-testid="rec-off">⏹ Off</button>
      </div>
    </div>
  );
}
