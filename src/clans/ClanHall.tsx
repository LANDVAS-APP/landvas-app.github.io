// The Clan Keep (/clan/hall): the clan's own castle courtyard, live for every member at once. Walk up to:
//   🐉 the Clan Spirit — feed it once a day; it grows through the week and gives the clan XP
//   🎁 the clan chest — opens once enough members have come by today
//   ⛏️ the quarry and 🎯 the training grounds — the Keep's own games, for stone (and a members' leaderboard)
//   🏗️ eight building plots — give stone to raise the clan's monuments
//   🗺️ the war table (battles), 🏆 the trophy shelf, 🔥 the campfire, 🎲 the games pavilion (party games)
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Compass, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Clan, ClanKeep, HomeGame } from '../backend/types';
import { music } from '../arcade/music';
import { explorerSvg } from '../explorer/character';
import type { ExplorerStyle } from '../backend/types';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, PlayerAvatar, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { PlanetChatBox } from '../space/PlanetChat';
import { svgUrl, useHomeChat, useHomeLive } from '../home/HomeScreen';
import { PartyGame } from '../home/party/PartyGame';
import { Live3D } from '../home/live3d/Live3D';
import { SIMS3 } from '../home/live3d/sims';
import { GamePicker, TableInvite, TableLobby } from '../home/party/Tables';
import { clanKeys } from './ClansScreen';
import { createKeep, type KeepScene, type KeepStation } from './keep3d';
import { Quarry, Training } from './keepGames';
import { Bar, ClanBadge, until } from './ui';

const keepKey = ['clan', 'keep'] as const;
const err = (e: unknown) => toast.error(toGameError(e).message);

export default function ClanHall() {
  const c = useQuery({ queryKey: clanKeys.mine, queryFn: () => api.clanGet(null), retry: false, staleTime: 15_000 });
  const k = useQuery({ queryKey: keepKey, queryFn: api.clanKeep, retry: false, refetchInterval: 15_000, enabled: !!c.data?.role });
  if (c.isLoading || (c.data?.role && k.isLoading)) return <div className="fixed inset-0 grid place-items-center bg-[#2A1B2E]"><Spinner /></div>;
  if (!c.data?.role || !k.data) return <Navigate to="/clans" replace />;
  return <Keep key={c.data.id} c={c.data} k={k.data} />;
}

const STATION_LIST: { id: KeepStation; label: string }[] = [
  { id: 'spirit', label: '🐉 Clan Spirit' }, { id: 'chest', label: '🎁 Clan chest' }, { id: 'quarry', label: '⛏️ Quarry' }, { id: 'training', label: '🎯 Training grounds' },
  { id: 'build:well', label: '🏗️ Building plots' }, { id: 'campfire', label: '🔥 Campfire' }, { id: 'games', label: '🎲 Games pavilion' }, { id: 'war', label: '🗺️ War table' }, { id: 'trophies', label: '🏆 Trophies' },
];

function Keep({ c, k }: { c: Clan; k: ClanKeep }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const cv = useRef<HTMLCanvasElement>(null);
  const keep = useRef<KeepScene | null>(null);
  const [near, setNear] = useState<KeepStation | null>(null);
  const [picker, setPicker] = useState(false);
  const [compass, setCompass] = useState(false);
  const [game, setGame] = useState<HomeGame | null>(null);
  const [play, setPlay] = useState<{ game: 'quarry' | 'training'; id: string; seed: number; seconds: number } | null>(null);
  const [musicOn, setMusicOn] = useState(true);
  const refresh = () => { void qc.invalidateQueries({ queryKey: keepKey }); void qc.invalidateQueries({ queryKey: clanKeys.mine }); };

  useEffect(() => {
    if (!cv.current) return;
    const s = createKeep({
      canvas: cv.current, reduceMotion: reduce, onNear: setNear,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style as ExplorerStyle | undefined, me?.profile.accent_color ?? '#7B5CFF', 184)),
    });
    keep.current = s;
    if (import.meta.env.DEV || location.search.includes('e2e=1')) Object.assign(window, { __landvasKeep: s });
    return () => { s.dispose(); keep.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    keep.current?.setKeep({
      clan: { name: c.name, tag: c.tag, emblem: c.emblem, color: c.color },
      spirit: { seed: k.spirit.seed, stage: k.spirit.stage }, chestOpen: k.chest.open, chestClaimed: k.chest.claimed, wins: c.wins,
      builds: k.builds.map((b) => ({ key: b.key, name: b.name, emoji: b.emoji, progress: b.progress, cost: b.cost, done: b.done, locked: b.locked, level: b.level })),
    });
  }, [c, k]);
  useEffect(() => { keep.current?.setPaused(!!game || !!play); }, [game, play]);

  const chatIn = useRef<((m: unknown) => void) | null>(null);
  const room = useHomeLive(c.id, me?.user_id, keep, () => {}, chatIn);
  const chat = useHomeChat(c.id, me?.user_id, keep, room.send, { list: (a) => api.clanChatList(a), send: (b) => api.clanChatSend(b) });
  chatIn.current = chat.onChat;
  const live = room.live;
  const here = (live?.members.length ?? 0) + 1;
  const handled = useRef(new Set<string>());
  useEffect(() => {
    const g = live?.game; if (!g || g.status !== 'playing' || handled.current.has(g.id)) return;
    handled.current.add(g.id); setGame(g); setPicker(false);
  }, [live?.game]);
  // the chest counts you once the Keep knows you're here
  const visited = useRef(false);
  useEffect(() => { if (live && !visited.current) { visited.current = true; void qc.invalidateQueries({ queryKey: keepKey }); } }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const lobby = live?.game?.status === 'lobby' ? live.game : null;
  const invite = !lobby ? live?.tables.find((t) => !t.players.some((p) => p.id === me?.user_id)) : null;

  // a castle tune (starts on your first tap)
  const started = useRef(false);
  useEffect(() => {
    if (!musicOn) { if (started.current) music.stop(); return; }
    const go = () => { started.current = true; music.play('keep', false); };
    if (started.current) { go(); return; }
    const once = () => { go(); window.removeEventListener('pointerdown', once); };
    window.addEventListener('pointerdown', once);
    return () => window.removeEventListener('pointerdown', once);
  }, [musicOn]);
  useEffect(() => { music.setDuck(!!game || !!play); }, [game, play]);
  useEffect(() => () => { music.stop(); music.setDuck(false); }, []);

  const startPlay = async (g: 'quarry' | 'training') => { try { const r = await api.clanKeepStart(g); setPlay({ game: g, ...r }); } catch (e) { err(e); } };
  const endPlay = async (score: number) => {
    const p = play; if (!p) return;
    try {
      const r = await api.clanKeepFinish(p.id, score);
      toast.success(`${r.score} points · +${r.stone} stone 🪨${r.record ? ' · new personal best! 🏅' : ''}${r.capped ? ' (that’s today’s stone)' : ''}`);
      keep.current?.burst(p.game, ['🪨', '✨', '💎'], 10);
      if (r.record) confettiCannons();
    } catch (e) { err(e); }
    setPlay(null); refresh();
  };

  const nb = near?.startsWith('build:') ? k.builds.find((b) => `build:${b.key}` === near) : null;
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#2A1B2E] text-white" data-testid="clan-hall">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="keep-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={() => (history.length > 1 ? nav(-1) : nav('/clans'))} className="pointer-events-auto rounded-xl border border-[#E8B83E]/50 bg-[#1B1225]/80 p-2 backdrop-blur" aria-label="Back" data-testid="hall-back"><ArrowLeft className="h-5 w-5" /></button>
        <Link to="/clans" className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[#E8B83E]/50 bg-[#1B1225]/80 px-3 py-1.5 backdrop-blur">
          <ClanBadge c={c} size={34} />
          <span className="min-w-0"><span className="block truncate font-display text-lg font-black leading-tight" data-testid="hall-title">{c.name} Keep</span>
            <span className="flex items-center gap-2 text-[11px] text-white/75"><b>[{c.tag}] · Lv {c.level}</b>
              <span className="flex items-center gap-1 font-bold text-[#7DFFB2]" data-testid="hall-here"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7DFFB2]" />{here}/{live?.room_size ?? 16} here</span></span></span>
        </Link>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="rounded-2xl border border-[#E8B83E]/50 bg-[#1B1225]/80 px-3 py-1.5 text-sm font-black backdrop-blur" data-testid="keep-stone">🪨 {fmt(k.stone)}</div>
          <button onClick={() => setCompass((x) => !x)} className="grid h-11 w-11 place-items-center rounded-2xl border border-[#E8B83E]/50 bg-[#1B1225]/80 backdrop-blur" aria-label="Go to…" data-testid="keep-compass"><Compass className="h-5 w-5" /></button>
          <button onClick={() => { const on = !musicOn; setMusicOn(on); if (on) { started.current = true; music.play('keep', false); } else music.stop(); }} className="grid h-11 w-11 place-items-center rounded-2xl border border-[#E8B83E]/50 bg-[#1B1225]/80 backdrop-blur" aria-label={musicOn ? 'Music off' : 'Music on'}>{musicOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button>
        </div>
      </div>
      {compass && (
        <div className="absolute right-3 top-[calc(max(12px,env(safe-area-inset-top,0px))+150px)] z-30 grid w-52 gap-1 rounded-2xl border border-[#E8B83E]/50 bg-[#1B1225]/90 p-2 backdrop-blur" data-testid="keep-places">
          {STATION_LIST.map((s) => <button key={s.id} onClick={() => { keep.current?.walkTo(s.id); setCompass(false); }} className="rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-white/10">{s.label}</button>)}
        </div>
      )}

      <AnimatePresence>
        {!game && !play && near && (
          <motion.div key={near} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-[max(16px,env(safe-area-inset-bottom,0px))]">
            <Panel>
              {near === 'spirit' && <SpiritPanel k={k} onFed={() => { keep.current?.joy(); refresh(); }} haptics={haptics} />}
              {near === 'chest' && <ChestPanel k={k} onOpen={() => { keep.current?.burst('chest', ['🪙', '💧', '🪨', '✨'], 16); refresh(); invalidateGame(qc); }} />}
              {near === 'quarry' && <PlayPanel emoji="⛏️" title="The Quarry" text="Crack boulders for stone — gem rocks are worth more, and keep away from the TNT." k={k} onPlay={() => void startPlay('quarry')} />}
              {near === 'training' && <TrainingPanel k={k} onPlay={() => void startPlay('training')} myId={me?.user_id} />}
              {nb && <BuildPanel b={nb} k={k} onGave={(done) => { keep.current?.burst(near!, done ? ['🎉', '🏰', '✨', '🪨'] : ['🪨', '🔨'], done ? 18 : 8); if (done) confettiCannons(); refresh(); }} />}
              {near === 'campfire' && <Campfire onRoast={(txt) => { keep.current?.say('me', txt); }} haptics={haptics} />}
              {near === 'games' && (
                <div className="grid gap-2"><Head emoji="🎲" title="Games pavilion" />
                  <p className="text-sm text-white/75">Start a party game for everyone in the Keep — tag, hide and seek, races and more.</p>
                  <Button variant="rainbow" onClick={() => setPicker(true)} data-testid="hall-games">Pick a game</Button></div>
              )}
              {near === 'war' && <WarPanel c={c} />}
              {near === 'trophies' && (
                <div className="grid gap-2"><Head emoji="🏆" title="Trophy shelf" />
                  <p className="text-sm text-white/75">{c.wins ? `${c.wins} battle${c.wins === 1 ? '' : 's'} won, ${c.losses} lost — every win puts a cup on the shelf.` : 'Win clan battles to fill the shelf with gold cups.'}</p>
                  {c.season_rank && <p className="text-sm">This week you’re <b>#{c.season_rank}</b> on the clan board.</p>}</div>
              )}
            </Panel>
          </motion.div>
        )}
        {!near && !game && !play && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <div className="rounded-full border border-[#E8B83E]/40 bg-[#1B1225]/75 px-4 py-2 text-center text-xs text-white/85 backdrop-blur">Tap the ground to walk · tap a sign to go there · 🧭 for every place</div>
          </motion.div>
        )}
      </AnimatePresence>

      {!game && !play && me && (invite || lobby) && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(12px,env(safe-area-inset-top,0px))+70px)] z-20 flex justify-center px-3">
          {lobby ? <TableLobby t={lobby} myId={me.user_id} onChange={room.refresh} /> : invite && <TableInvite t={invite} onJoined={room.refresh} />}
        </div>
      )}
      {!game && !play && !near && <PlanetChatBox chat={chat} myId={me?.user_id} className="absolute bottom-[76px] left-3 z-20" title="Clan chat" sub={`${here} in the Keep`} placeholder="Message your clan…" empty="Say hi to your clan 👋" notHere="One moment — still riding in…" />}
      {picker && <GamePicker home={c.id} here={here} onClose={() => setPicker(false)} onMade={room.refresh} />}
      {game && me && (SIMS3[game.game]
        ? <Live3D game={game} myId={me.user_id} onClose={() => { setGame(null); room.refresh(); }} />
        : <PartyGame game={game} myId={me.user_id} onClose={() => { setGame(null); room.refresh(); }} />)}
      {play?.game === 'quarry' && <Quarry seed={play.seed} seconds={play.seconds} onEnd={(s) => void endPlay(s)} haptics={haptics} reduce={reduce} />}
      {play?.game === 'training' && <Training seed={play.seed} seconds={play.seconds} onEnd={(s) => void endPlay(s)} haptics={haptics} reduce={reduce} />}
    </div>
  );
}

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full max-w-md rounded-3xl border-2 border-[#E8B83E]/70 bg-gradient-to-b from-[#2B1C33]/95 to-[#1B1225]/95 p-4 shadow-2xl backdrop-blur" data-testid="keep-panel">{children}</div>
);
const Head = ({ emoji, title, right }: { emoji: string; title: string; right?: React.ReactNode }) => (
  <div className="flex items-center gap-2"><span className="text-3xl">{emoji}</span><b className="min-w-0 flex-1 font-display text-xl text-[#FFE7A8]">{title}</b>{right}</div>
);

function SpiritPanel({ k, onFed, haptics }: { k: ClanKeep; onFed(): void; haptics: boolean }) {
  const [busy, setBusy] = useState(false);
  const s = k.spirit;
  const feed = async () => {
    setBusy(true);
    try {
      const r = await api.clanSpiritFeed(); if (haptics) buzz('success');
      toast.success(r.grew ? `Your spirit grew into a ${s.names[r.stage]}! 🎉 +${r.xp} clan XP · +${r.stone} stone` : `Yum! +${r.xp} clan XP · +${r.stone} stone`);
      if (r.grew) confettiCannons(); onFed();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-2" data-testid="keep-spirit">
      <Head emoji="🐉" title={`Clan Spirit · ${s.name}`} right={<span className="text-xs text-white/60">bond {s.bond}</span>} />
      <div className="flex gap-1">{s.names.map((n, i) => <div key={n} className={cn('h-2 flex-1 rounded-full', i <= s.stage ? 'bg-[#FFD23F]' : 'bg-white/15')} title={n} />)}</div>
      <p className="text-sm text-white/75">{s.next ? `${s.feeds} feeds this week · ${s.next - s.feeds} more to grow into a ${s.names[s.stage + 1]}.` : `${s.feeds} feeds this week — it’s Legendary!`} A new egg hatches every Monday.</p>
      {!!s.feeders_today.length && <div className="flex items-center gap-1 text-xs text-white/60">Fed today by {s.feeders_today.slice(0, 6).map((p) => <PlayerAvatar key={p.id} p={p} size={22} />)}</div>}
      <Button variant="rainbow" disabled={s.fed_today} loading={busy} onClick={() => void feed()} data-testid="keep-feed">{s.fed_today ? 'Fed today ✓ — come back tomorrow' : `Feed the spirit 🍖 (+${s.feed_xp} XP, +${s.feed_stone} 🪨)`}</Button>
    </div>
  );
}

function ChestPanel({ k, onOpen }: { k: ClanKeep; onOpen(): void }) {
  const [busy, setBusy] = useState(false);
  const ch = k.chest;
  return (
    <div className="grid gap-2" data-testid="keep-chest">
      <Head emoji="🎁" title="Daily clan chest" />
      <p className="text-sm text-white/75">It opens when {ch.need} clanmate{ch.need === 1 ? '' : 's'} visit the Keep today. Everyone who came gets {ch.ink} Ink and {ch.stone} stone.</p>
      <Bar v={ch.visitors} max={ch.need} color="#FFD23F" />
      <div className="flex flex-wrap items-center gap-1 text-xs text-white/70">{ch.visitors}/{ch.need} here today {ch.who.slice(0, 10).map((p) => <PlayerAvatar key={p.id} p={p} size={22} />)}</div>
      {ch.claimed ? <p className="text-center text-sm font-bold text-[#7DFFB2]">Collected today ✓ — new chest tomorrow</p>
        : <Button variant="rainbow" disabled={!ch.claim} loading={busy} data-testid="keep-chest-open"
            onClick={async () => { setBusy(true); try { const r = await api.clanChestOpen(); toast.success(`+${r.ink} Ink · +${r.stone} stone 🎉`); confettiCannons(); onOpen(); } catch (e) { err(e); } finally { setBusy(false); } }}>
            {ch.open ? 'Open the chest!' : `Waiting for ${ch.need - ch.visitors} more…`}</Button>}
    </div>
  );
}

function PlayPanel({ emoji, title, text, k, onPlay }: { emoji: string; title: string; text: string; k: ClanKeep; onPlay(): void }) {
  const capped = k.stone_today >= k.stone_cap;
  return (
    <div className="grid gap-2"><Head emoji={emoji} title={title} right={<span className="text-xs font-bold text-white/60">🪨 {k.stone_today}/{k.stone_cap} today</span>} />
      <p className="text-sm text-white/75">{text}</p>
      <Button variant="rainbow" onClick={onPlay} data-testid="keep-play">{capped ? 'Play for fun (stone’s full today)' : 'Play · 30 seconds'}</Button>
    </div>
  );
}

function TrainingPanel({ k, onPlay, myId }: { k: ClanKeep; onPlay(): void; myId?: string }) {
  return (
    <div className="grid gap-2"><Head emoji="🎯" title="Training grounds" right={<span className="text-xs font-bold text-white/60">your best: {k.training.mine}</span>} />
      <div className="grid max-h-32 gap-1 overflow-y-auto">
        {k.training.board.length ? k.training.board.map((p, i) => (
          <div key={p.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-1 text-sm', p.id === myId ? 'bg-[#FFD23F]/20' : 'bg-white/5')}>
            <b className="w-6 text-center">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</b><PlayerAvatar p={p} size={22} /><span className="min-w-0 flex-1 truncate">@{p.username}</span><b>{p.best}</b></div>
        )) : <p className="text-sm text-white/60">Nobody’s trained this week — be the clan’s first champion.</p>}
      </div>
      <Button variant="rainbow" onClick={onPlay} data-testid="keep-play">Shoot · 30 seconds</Button>
    </div>
  );
}

function BuildPanel({ b, k, onGave }: { b: ClanKeep['builds'][number]; k: ClanKeep; onGave(done: boolean): void }) {
  const [busy, setBusy] = useState(false);
  const need = b.cost - b.progress;
  const give = async (n: number) => { setBusy(true); try { const r = await api.clanBuildGive(b.key, n); toast.success(r.done ? `${b.name} is built! 🎉` : `+${r.gave} stone for the ${b.name}`); onGave(r.done); } catch (e) { err(e); } finally { setBusy(false); } };
  const others = useMemo(() => k.builds.filter((x) => x.key !== b.key), [k.builds, b.key]);
  return (
    <div className="grid gap-2" data-testid="keep-build">
      <Head emoji={b.emoji} title={b.name} right={<span className="text-xs font-bold text-white/60">🪨 {fmt(k.stone)}</span>} />
      {b.done ? <p className="text-sm text-[#7DFFB2]">Built! It stands in the Keep for good.</p>
        : b.locked ? <p className="text-sm text-white/75">🔒 Unlocks at clan level {b.level} (you’re level {k.level}).</p>
        : <>
          <Bar v={b.progress} max={b.cost} color="#7DFFB2" />
          <p className="text-xs text-white/70">{fmt(b.progress)}/{fmt(b.cost)} stone · finishing it gives the clan {fmt(b.xp)} XP</p>
          <div className="grid grid-cols-3 gap-2">
            {[10, 50].map((n) => <Button key={n} size="sm" variant="secondary" disabled={k.stone < 1 || busy} onClick={() => void give(n)}>+{n}</Button>)}
            <Button size="sm" variant="rainbow" disabled={k.stone < 1} loading={busy} onClick={() => void give(Math.min(k.stone, need))} data-testid="keep-give-all">All ({fmt(Math.min(k.stone, need))})</Button>
          </div>
          {k.stone < 1 && <p className="text-xs text-white/60">Get stone at the ⛏️ quarry, 🎯 training grounds, 🐉 spirit or 🎁 chest.</p>}
        </>}
      <div className="flex flex-wrap gap-1 pt-1">{others.map((x) => <span key={x.key} className={cn('rounded-full px-2 py-0.5 text-[11px]', x.done ? 'bg-[#3DDC97]/25' : x.locked ? 'bg-white/5 text-white/40' : 'bg-white/10')}>{x.done ? '✅' : x.locked ? '🔒' : x.emoji} {x.name}</span>)}</div>
    </div>
  );
}

/** hold to toast a marshmallow; let go when it's golden */
function Campfire({ onRoast, haptics }: { onRoast(text: string): void; haptics: boolean }) {
  const [heat, setHeat] = useState(0);
  const [best, setBest] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const t0 = useRef(0);
  const start = () => { t0.current = performance.now(); setBest(null); timer.current = window.setInterval(() => setHeat(Math.min(1.15, (performance.now() - t0.current) / 2600)), 30); };
  const stop = () => {
    if (timer.current == null) return; clearInterval(timer.current); timer.current = null;
    const h = (performance.now() - t0.current) / 2600;
    const r = h < 0.45 ? ['Still squishy 🤍', 'raw'] : h < 0.7 ? ['Lightly toasted 🍡', 'ok'] : h < 0.86 ? ['PERFECTLY GOLDEN! ✨🍡', 'perfect'] : h < 1.02 ? ['A bit crispy 🟤', 'crispy'] : ['On fire!! 🔥🍡', 'burnt'];
    setBest(r[0]); onRoast(r[0]); if (haptics) buzz(r[1] === 'perfect' ? 'success' : 'light'); setTimeout(() => setHeat(0), 900);
  };
  useEffect(() => () => { if (timer.current != null) clearInterval(timer.current); }, []);
  const col = heat < 0.45 ? '#FFF4E8' : heat < 0.7 ? '#F7D79B' : heat < 0.86 ? '#E8A64A' : heat < 1.02 ? '#8A5A2B' : '#2A1A10';
  return (
    <div className="grid gap-2" data-testid="keep-campfire">
      <Head emoji="🔥" title="Campfire" />
      <p className="text-sm text-white/75">Sit by the fire with your clan. Hold to roast a marshmallow — let go when it’s golden!</p>
      <div className="relative h-3 overflow-hidden rounded-full bg-white/10"><div className="absolute inset-y-0 left-[70%] w-[16%] bg-[#FFD23F]/40" /><div className="h-full rounded-full" style={{ width: `${Math.min(100, heat * 87)}%`, background: col }} /></div>
      <button onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} className="select-none rounded-2xl bg-gradient-to-br from-[#FF9A3A] to-[#FF5F3A] py-3 font-display text-lg font-black text-[#2A0F05] active:scale-95" data-testid="keep-roast">
        <span className="mr-2 inline-block h-5 w-5 rounded-full align-middle" style={{ background: col }} />Hold to roast</button>
      {best && <p className="text-center text-sm font-bold">{best}</p>}
    </div>
  );
}

function WarPanel({ c }: { c: Clan }) {
  const live = c.battles?.find((b) => b.status === 'live');
  const pending = c.battles?.filter((b) => b.status === 'pending' && !b.challenger).length ?? 0;
  return (
    <div className="grid gap-2"><Head emoji="🗺️" title="War table" />
      {live ? (
        <div className="rounded-2xl bg-black/30 p-3">
          <div className="flex items-center gap-2 text-sm"><ClanBadge c={c} size={28} /><b className="text-lg">{fmt(live.us)}</b><span className="flex-1 text-center text-xs font-black text-[#FF7A9A]">LIVE · {until(live.ends_at)}</span><b className="text-lg">{fmt(live.them)}</b><ClanBadge c={live.vs} size={28} /></div>
          <p className="mt-1 text-center text-xs text-white/70">vs {live.vs.name} — every Ink you earn counts</p>
        </div>
      ) : <p className="text-sm text-white/75">{pending ? `⚔️ ${pending} clan${pending === 1 ? '' : 's'} challenged you!` : 'No battle on. Officers can challenge any clan to a 24-hour Ink race.'}</p>}
      <Link to="/clans?tab=battles"><Button variant="rainbow" size="sm" className="w-full">Plan battles →</Button></Link>
    </div>
  );
}
