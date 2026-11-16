// The Mirror Arcade: a second arcade on the other side of the glass. Every arcade has its 🪞 door: walk through for
// tickets (once, for good), or find the secret way in — five cabinets in a row in the colours of the LANDVAS logo's L
// (the server keeps the recipe and checks it from the rounds you really played; finders get a bounty).
// Everything here is flipped left-right. Every ordinary cabinet runs mirrored, faster and with a twist of its own, and
// four cabinets along the back wall exist only here. It pays several times the Ink, with no cap. It has a live room of
// its own (whoever else is through the glass in this arcade) with Versus and Co-op rounds, like the front hall; none
// of it is posted to the live feed.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Infinity as InfinityIcon, Play, RotateCcw, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import type { Arcade, ArcadeFinish, ArcadeMatch, ArcadeMe, ArcadeMode, MirrorArcade, MirrorGame } from '../../backend/types';
import { explorerSvg } from '../../explorer/character';
import { invalidateGame, useOnboardedMe } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { Button, Dialog, PlayerAvatar, ResourceIcon, Spinner } from '../../ui';
import { confettiCannons } from '../../ui/confetti';
import { ARENAS as ARENAS1, BONUS as BONUS1, ENDLESS as ENDLESS1, HOW as HOW1, scoreBus } from '../games';
import { fmtScore, InviteBanner, LobbyPanel, MatchButtons, MatchResults, MatchStrip, PLAY, useArcadeLive } from '../party';
import { ARENAS2, BONUS2, ENDLESS2, HOW2 } from '../games2';
import { createHall, type HallScene, type HallSpot } from '../hall3d';
import { music } from '../music';
import { sfx } from '../sfx';
import { MIRROR_ARENAS, MIRROR_BONUS, MIRROR_ENDLESS, MIRROR_HOW } from './games';
import { mirrorOff, mirrorOn, type MirrorFlip } from './mir';
import { config } from '../../env';

const ARENAS = { ...ARENAS1, ...ARENAS2, ...MIRROR_ARENAS }, HOW = { ...HOW1, ...HOW2, ...MIRROR_HOW }, BONUS = { ...BONUS1, ...BONUS2, ...MIRROR_BONUS }, ENDLESS = { ...ENDLESS1, ...ENDLESS2, ...MIRROR_ENDLESS };
export const mirrorKey = ['arcade-mirror'] as const;
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const tix = (n: number) => Math.round(n).toLocaleString();

/** How each ordinary cabinet plays on this side of the glass: which way its screen is flipped, how much faster it
 *  runs, and its twist (the game code checks MIR.on for the twists that change the rules). */
export const MIRROR_SPECS: Record<string, { flip: MirrorFlip; speed: number; twist: string }> = {
  stacker:   { flip: 'y',  speed: 1.25, twist: 'Upside down: the tower hangs from the ceiling and builds downward, a quarter faster.' },
  cyclone:   { flip: 'x',  speed: 1.15, twist: 'The light turns back on itself at random. Time your STOP round the reversals.' },
  skeeball:  { flip: 'xy', speed: 1.1,  twist: 'Upside-down lane: flick DOWN to roll from the top, and left is right.' },
  hoops:     { flip: 'x',  speed: 1.15, twist: 'The hoop moves from the very first ball, and quicker.' },
  bop:       { flip: 'x',  speed: 1.2,  twist: 'Shapeshifters: a bot can turn into a kitty while it’s up (and back). Look before you bop.' },
  claw:      { flip: 'xy', speed: 1.15, twist: 'The whole machine is upside down and back to front (the arrows follow it).' },
  airhockey: { flip: 'y',  speed: 1.1,  twist: 'Ice table: the puck barely slows down. You defend the top goal.' },
  plinko:    { flip: 'y',  speed: 1.15, twist: 'Gravity’s reversed: the chips fall UP through the pegs.' },
  snake:     { flip: 'x',  speed: 1.15, twist: 'The apples run away from you. Corner them to eat them.' },
  pusher:    { flip: 'y',  speed: 1.25, twist: 'The pusher hangs from the top on overdrive, and every 5th coin is GOLD.' },
  fruit:     { flip: 'y',  speed: 1.2,  twist: 'The fruit rains DOWN from the top instead of flying up.' },
  blaster:   { flip: 'y',  speed: 1.2,  twist: 'The drones rise from below and you fire downward.' },
  maze:      { flip: 'x',  speed: 1.1,  twist: 'Lights out: you only see by your blob’s lantern.' },
  rhythm:    { flip: 'y',  speed: 1.2,  twist: 'The notes rise up from the bottom, a fifth faster.' },
  racer:     { flip: 'y',  speed: 1.25, twist: 'An upside-down highway, a quarter faster.' },
  pinball:   { flip: 'y',  speed: 1.1,  twist: 'Gravity pulls UP: the flippers are at the top of the table.' },
};
const twistOf = (g: MirrorGame) => (g.own ? 'Only on this side of the glass.' : MIRROR_SPECS[g.id]?.twist ?? 'Mirrored and faster.');

export function MirrorRoom({ a, onBack, first }: { a: Arcade; onBack(): void; first?: { bounty: number; bought?: boolean } | null }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: mirrorKey, queryFn: () => api.arcadeMirrorGet(), staleTime: 15_000, refetchOnWindowFocus: false });
  // just walked through (bought): the glass cracks, then the welcome
  const [through, setThrough] = useState<MirrorArcade | null>(null);
  const [welcome, setWelcome] = useState<{ bounty: number; bought?: boolean } | null>(first ?? null);
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#06121E]"><Spinner /></div>;
  if (through) return <GlassCrack onDone={() => { qc.setQueryData(mirrorKey, through); setThrough(null); setWelcome({ bounty: 0, bought: true }); }} />;
  if (q.data && !q.data.found && q.data.open) return <MirrorDoor a={a} m={q.data} onBack={onBack} onThrough={setThrough} />;
  if (!q.data || !q.data.found) {
    // switched off: there's nothing on this side
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#06121E] p-6 text-center text-white">
        <div className="text-5xl">🪞</div><p>Just your reflection.</p>
        <button onClick={onBack} className="rounded-2xl bg-white/10 px-5 py-2 text-sm font-bold">Back to the arcade</button>
      </div>
    );
  }
  return <MirrorHall a={a} m={q.data} onBack={onBack} first={welcome} />;
}

/** Not through yet: what's on the other side, the price, and a hint that there's another way in. */
function MirrorDoor({ a, m, onBack, onThrough }: { a: Arcade; m: Extract<MirrorArcade, { found: false }>; onBack(): void; onThrough(r: MirrorArcade): void }) {
  const [busy, setBusy] = useState(false);
  const price = m.price ?? 25000, have = m.tickets ?? 0, short = Math.max(0, price - have);
  const buy = async () => {
    setBusy(true);
    try { const r = await api.arcadeMirrorBuy(); sfx.coin(); onThrough(r); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[radial-gradient(120%_80%_at_50%_0%,#1C3A66,#06121E_70%)] text-white" data-testid="mirror-door-screen">
      <div className="mx-auto grid max-w-md gap-4 p-5 pt-[max(16px,env(safe-area-inset-top,0px))] pb-[max(24px,env(safe-area-inset-bottom,0px))]">
        <button onClick={onBack} className="justify-self-start rounded-xl bg-black/40 p-2" aria-label="Back to the arcade" data-testid="mirror-door-back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="grid justify-items-center gap-2 text-center">
          <div className="text-7xl" style={{ transform: 'scaleX(-1)' }}>🪞</div>
          <div className="lv-arc-marquee text-3xl" style={{ ['--glow' as string]: '#9FD8FF' }}>The Mirror Arcade</div>
          <p className="text-sm text-white/75">Behind the glass in {a.mine ? 'your' : `@${a.owner.username}’s`} arcade (and every arcade) there’s another one — everything backwards.</p>
        </div>
        <ul className="grid gap-2 text-sm">
          <li className="rounded-2xl bg-white/[0.07] px-3 py-2">🪞 Every cabinet mirrored, faster, each with a twist of its own</li>
          <li className="rounded-2xl bg-white/[0.07] px-3 py-2">✦ Four cabinets that only exist on that side: Twin Drops, Glass Breaker, Flipside and Symmetry</li>
          <li className="rounded-2xl bg-white/[0.07] px-3 py-2">💧 Pays more Ink than the front hall — with no cap</li>
          <li className="rounded-2xl bg-white/[0.07] px-3 py-2">🤝 Play Co-op or Versus with whoever else is through the glass</li>
        </ul>
        <div className="grid gap-2 rounded-3xl bg-[#DDE8FF]/10 p-4 text-center" style={{ boxShadow: 'inset 0 0 0 1.5px #DDE8FF55' }}>
          <div className="text-xs font-black uppercase tracking-widest text-[#DDE8FF]">Walk through · once, for good</div>
          <div className="font-display text-3xl font-black tnum">🎟️ {tix(price)}</div>
          <div className="h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-gradient-to-r from-[#9FD8FF] to-[#DDE8FF]" style={{ width: `${Math.min(100, (have / Math.max(1, price)) * 100)}%` }} /></div>
          <div className="text-xs text-white/70" data-testid="mirror-door-have">You have 🎟️ {tix(have)}{short > 0 ? ` · ${tix(short)} to go` : ''}</div>
          <Button variant="rainbow" disabled={short > 0} loading={busy} onClick={() => void buy()} data-testid="mirror-buy">{short > 0 ? 'Not enough tickets yet' : `Walk through · 🎟️ ${tix(price)}`}</Button>
        </div>
        <p className="text-center text-xs text-white/60" data-testid="mirror-door-secret">…or find the way in yourself. There’s a secret hidden in every arcade — find it and the glass opens for free, with a bounty.</p>
      </div>
    </div>
  );
}

function MirrorHall({ a, m, onBack, first }: { a: Arcade; m: Extract<MirrorArcade, { found: true }>; onBack(): void; first?: { bounty: number; bought?: boolean } | null }) {
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const cv = useRef<HTMLCanvasElement>(null);
  const hall = useRef<HallScene | null>(null);
  const [near, setNear] = useState<HallSpot | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'scores' | null>(null);
  const [welcome, setWelcome] = useState(!!first);
  const [meState, setMeState] = useState<ArcadeMe>(m.me);
  useEffect(() => setMeState(m.me), [m.me]);
  // the ordinary cabinets in their usual places, then this side's own four along the back wall
  const games = useMemo(() => [...m.games].sort((x, y) => Number(x.own) - Number(y.own) || x.order - y.order), [m.games]);
  const byId = useMemo(() => Object.fromEntries(games.map((g) => [g.id, g])), [games]);

  useEffect(() => {
    if (!cv.current) return;
    const h = createHall({
      canvas: cv.current, seed: (a.seed ^ 0x5f3759df) >>> 0, reduceMotion: reduce, mirror: true,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 184)),
      onNear: (s) => { setNear(s); if (s) sfx.blip(s.kind === 'machine' ? 9 : 14); },
    });
    hall.current = h;
    if (import.meta.env.DEV || config.e2e) (window as unknown as { __landvasMirror: HallScene }).__landvasMirror = h;
    h.setDecor({ floor: 'galaxy', neon: 'cyan', lights: 'steady' }, 'Arcade');
    h.setRegulars([]); h.setBonus(false); h.setHot(null);
    return () => { h.dispose(); hall.current = null; };
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    hall.current?.setMachines(games.map((g) => ({ id: g.id, name: g.name, color: g.color, emoji: g.emoji, level: 1, locked: false, lockLabel: g.own ? '✦ NEW' : '🪞' })));
  }, [games]);
  useEffect(() => { hall.current?.setPaused(!!sheet && !playing); }, [sheet, playing]);
  useEffect(() => { music.setDuck(!!playing); }, [playing]);
  useEffect(() => { if (first) { confettiCannons(); sfx.jackpot(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const play = async (id: string) => { sfx.coin(); await hall.current?.zoomIn(id); setPlaying(id); };
  const stopPlaying = () => { setPlaying(null); setMatchOn(null); hall.current?.zoomOut(); void qc.invalidateQueries({ queryKey: mirrorKey }); };
  const nearGame = near?.kind === 'machine' ? byId[near.id] : null;
  const busy = !!playing;
  // together: whoever else is through the glass in this arcade, their lobbies and your match
  const myId = me?.user_id;
  const liveRoom = useArcadeLive({ arcadeId: a.id, myId, hall, playing, side: 'mirror' });
  const live = liveRoom.live;
  const [matchOn, setMatchOn] = useState<ArcadeMatch | null>(null);
  const handled = useRef(new Set<string>());
  useEffect(() => {
    // the host pressed Start: everyone in the match steps up to the cabinet together
    const mt = live?.match;
    if (!mt || mt.status !== 'playing' || handled.current.has(mt.id) || !myId) return;
    const mine = mt.players.find((p) => p.id === myId);
    if (!mine?.session || mine.finished) return;
    handled.current.add(mt.id);
    setMatchOn(mt); setSheet(null);
    void (async () => { if (playing !== mt.game) { hall.current?.walkTo({ kind: 'machine', id: mt.game }); await hall.current?.zoomIn(mt.game); } setPlaying(mt.game); })();
  }, [live?.match, myId]); // eslint-disable-line react-hooks/exhaustive-deps
  const lobby = live?.match?.status === 'lobby' ? live.match : null;
  // (the match panels name a cabinet from the arcade: give them this side's)
  const aMir = useMemo(() => ({ ...a, games: { ...a.games, ...Object.fromEntries(games.map((g) => [g.id, { ...(a.games[g.id] ?? {}), name: g.name, emoji: g.emoji, color: g.color }])) } }) as Arcade, [a, games]);
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#06121E] text-white" data-testid="mirror-arcade">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" style={{ transform: 'scaleX(-1)' }} data-testid="mirror-hall" />
      {/* the silvery edge of the glass (still: nothing animates here) */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(130% 95% at 50% 45%, transparent 58%, rgba(170,205,255,0.16) 82%, rgba(220,235,255,0.32) 100%)' }} />
      {/* top bar */}
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))] transition-opacity', busy && 'opacity-0')}>
        <button onClick={onBack} className="pointer-events-auto rounded-xl bg-black/55 p-2" aria-label="Back through the glass" data-testid="mirror-back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl bg-black/55 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <div className="lv-arc-marquee min-w-0 truncate text-base" style={{ ['--glow' as string]: '#9FD8FF' }}>🪞 Mirror Arcade</div>
            <span className="shrink-0 rounded-full bg-[#DDE8FF] px-1.5 text-[10px] font-black text-[#06121E]" data-testid="mirror-mult">×{m.ink_mult} INK</span>
          </div>
          <div className="mt-0.5 text-[10px] text-white/60">Every cabinet mirrored with a twist · no cap · Co-op and Versus with whoever’s through the glass</div>
          {live && live.members.length > 0 && <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#9FD8FF]" data-testid="mirror-room-count"><span className="h-1.5 w-1.5 rounded-full bg-[#9FD8FF]" /> {live.members.length + 1} through the glass here</div>}
        </div>
        <div className="pointer-events-auto grid justify-items-end gap-1.5">
          <div className="lv-arc-ticket text-sm" data-testid="mirror-tickets">🎟️ {tix(meState.tickets)}</div>
        </div>
      </div>
      {!busy && live && myId && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(12px,env(safe-area-inset-top,0px))+86px)] z-20 px-16">
          <InviteBanner a={aMir} live={live} myId={myId} onJoined={() => liveRoom.refresh()} />
        </div>
      )}
      {!busy && (
        <div className="absolute right-3 top-[calc(max(12px,env(safe-area-inset-top,0px))+92px)] grid gap-2">
          <button onClick={() => setSheet('scores')} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/55 text-[9px] font-bold" data-testid="mirror-scores"><Trophy className="h-5 w-5 text-[#DDE8FF]" />Scores</button>
        </div>
      )}
      <AnimatePresence>
        {!busy && lobby && myId && (
          <motion.div key="lobby" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <LobbyPanel a={aMir} m={lobby} myId={myId} onChange={() => liveRoom.refresh()} />
          </motion.div>
        )}
        {!busy && !lobby && near && (
          <motion.div key={near.kind === 'machine' ? `m:${near.id}` : near.kind} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            {near.kind === 'machine' && nearGame && (
              <button onClick={() => void play(nearGame.id)} className="lv-arc-play flex max-w-md items-center gap-3 rounded-3xl px-5 py-3 text-left shadow-2xl" data-testid="mirror-play"
                style={{ background: `linear-gradient(135deg, ${nearGame.color}, #1C3A66)`, boxShadow: `0 0 40px ${nearGame.color}88` }}>
                <span className="text-4xl">{nearGame.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-widest text-white/80">{nearGame.own ? '✦ Only in the mirror' : '🪞 Mirrored'} · ×{m.ink_mult} Ink</span>
                  <span className="flex items-center gap-1.5 font-display text-2xl font-black"><Play className="h-5 w-5 fill-white" /> {nearGame.name}</span>
                  <span className="block text-[11px] text-white/85">{twistOf(nearGame)}</span>
                  <span className="block text-[11px] text-white/70">Your best: {m.best[nearGame.id] ?? '—'} · Record: {m.boards[nearGame.id]?.[0]?.score ?? '—'}</span>
                </span>
              </button>
            )}
            {near.kind === 'machine' && nearGame && myId && <MatchButtons arcade={a.id} game={nearGame.id} side="mirror" onMatch={() => liveRoom.refresh()} />}
            {near.kind === 'door' && (
              <button onClick={onBack} className="lv-arc-play flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#DDE8FF] to-[#7FB8FF] px-5 py-3 text-left text-[#06121E] shadow-2xl" data-testid="mirror-door">
                <span className="text-4xl">🪞</span><span><span className="block font-display text-2xl font-black">Step back through the glass</span><span className="block text-xs font-bold">Back to {a.mine ? 'your' : `@${a.owner.username}’s`} arcade</span></span>
              </button>
            )}
          </motion.div>
        )}
        {!busy && !lobby && !near && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <div className="rounded-full bg-black/60 px-4 py-2 text-xs text-white/80">Everything’s backwards here · ✦ four cabinets along the back wall exist only on this side</div>
          </motion.div>
        )}
      </AnimatePresence>
      {playing && byId[playing] && <MirrorCabinet g={byId[playing]} a={aMir} m={m} me={meState} haptics={haptics} reduce={reduce} onExit={stopPlaying} onMe={setMeState}
        match={matchOn && matchOn.game === playing ? { m: live?.match?.id === matchOn.id ? live.match : matchOn, myId: myId!, scores: liveRoom.scores, send: (sc) => liveRoom.send({ t: 'score', m: matchOn.id, id: myId!, s: sc }) } : null} />}
      {sheet === 'scores' && <MirrorScores m={m} games={games} onClose={() => setSheet(null)} />}
      {welcome && (
        <Dialog open onOpenChange={(o) => { if (!o) setWelcome(false); }} title="🪞 You went through the glass" description={first?.bought ? 'Welcome to the Mirror Arcade. It’s yours for good — the 🪞 door in any arcade brings you back.' : 'You found the Mirror Arcade. Nobody told you it was here.'}>
          <div className="grid gap-2 text-sm" data-testid="mirror-welcome">
            {!!first?.bounty && <div className="flex items-center gap-2 rounded-2xl bg-[#DDE8FF]/15 p-3 font-bold"><ResourceIcon r="ink" className="h-5 w-5" /> +{first.bounty} Ink for finding it</div>}
            <p>Every cabinet works on this side, mirrored, faster and with a twist of its own. Four cabinets along the back wall exist only here.</p>
            <p>Everything here pays <b>×{m.ink_mult} Ink</b>, with no cap. Nothing you do here shows up on the live feed.</p>
            <p>🤝 Anyone else through the glass in this arcade is here with you: start a <b>Co-op</b> or <b>Versus</b> round at any cabinet.</p>
            <p className="text-[var(--fg-2)]">From now on, the 🪞 button in any arcade brings you straight back.</p>
            <button onClick={() => setWelcome(false)} className="mt-1 rounded-2xl bg-gradient-to-r from-[#DDE8FF] to-[#7FB8FF] py-2.5 font-black text-[#06121E]" data-testid="mirror-welcome-ok">Let’s play</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

type Phase = { k: 'attract' } | { k: 'count'; n: number; session: string; seed: number; level: number } | { k: 'play'; session: string; seed: number; level: number } | { k: 'done'; r: ArcadeFinish | null; score: number }
  | { k: 'mwait' } | { k: 'mdone'; r: ArcadeFinish | null; score: number };
type MatchCtx = { m: ArcadeMatch; myId: string; scores: Record<string, number>; send(score: number): void };
function MirrorCabinet({ g, a, m, me, haptics, reduce, onExit, onMe, match }: { g: MirrorGame; a: Arcade; m: Extract<MirrorArcade, { found: true }>; me: ArcadeMe; haptics: boolean; reduce: boolean; onExit(): void; onMe(m: ArcadeMe): void; match: MatchCtx | null }) {
  const qc = useQueryClient();
  const Arena = ARENAS[g.id];
  const spec = g.own ? null : MIRROR_SPECS[g.id] ?? { flip: 'x' as const, speed: 1.1, twist: '' };
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
      if (ms <= 0 && mine?.session) { clearInterval(t); mirrorOn(spec ? { flip: spec.flip, speed: spec.speed } : null); setPhase({ k: 'play', session: mine.session, seed: match.m.seed!, level: match.m.level }); }
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
  const [mode, setMode] = useState<ArcadeMode>('classic');
  const [counted, setCounted] = useState(0);
  useEffect(() => () => mirrorOff(), []);
  const start = async () => {
    setBusy(true);
    try {
      const r = await api.arcadeMirrorStart(g.id, mode); sfx.coin();
      mirrorOn(spec ? { flip: spec.flip, speed: spec.speed } : null);
      setPhase({ k: 'count', n: 3, session: r.session, seed: r.seed, level: r.level });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    sfx.blip(phase.n === 1 ? 12 : 0);
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', session: phase.session, seed: phase.seed, level: phase.level }), 650);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (session: string, score: number) => {
    try {
      const r = await api.arcadeMirrorFinish(session, score);
      onMe(r.me); invalidateGame(qc);
      if (match) { match.send(r.score); setPhase({ k: 'mdone', r, score: r.score }); return; }
      setCounted(0); setPhase({ k: 'done', r, score: r.score });
      if (r.new_record || r.new_best) confettiCannons();
    } catch (e) { toast.error(toGameError(e).message); setPhase(match ? { k: 'mdone', r: null, score } : { k: 'done', r: null, score }); }
    finally { mirrorOff(); }
  };
  useEffect(() => {
    if (phase.k !== 'done' || !phase.r) return;
    const total = phase.r.tickets; if (!total) return;
    sfx.tickets(total);
    const step = Math.max(1, Math.ceil(total / 40));
    const t = setInterval(() => setCounted((c) => { const n = Math.min(total, c + step); if (n >= total) clearInterval(t); return n; }), 35);
    return () => clearInterval(t);
  }, [phase]);
  const best = mode === 'endless' ? m.best_endless[g.id] : m.best[g.id];
  const record = (mode === 'endless' ? m.boards_endless[g.id] : m.boards[g.id])?.[0]?.score;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex flex-col items-center bg-black/30 px-2 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-[max(10px,env(safe-area-inset-top,0px))]" style={{ ['--glow' as string]: g.color }} data-testid="mirror-cabinet">
      <div className="flex w-full max-w-[560px] items-center gap-2 pb-2">
        <button onClick={() => { mirrorOff(); onExit(); }} className="rounded-xl bg-black/60 p-2" aria-label="Step back from the cabinet" data-testid="mirror-exit"><X className="h-5 w-5" /></button>
        <div className="lv-arc-marquee min-w-0 flex-1 truncate text-center text-xl">{g.emoji} {g.name}</div>
        <div className="lv-arc-ticket text-xs">🎟️ {tix(me.tickets)}</div>
      </div>
      {match && <div className="mb-2 flex w-full justify-center"><MatchStrip m={match.m} scores={match.scores} myId={match.myId} myScore={phase.k === 'mdone' ? phase.score : myScore} /></div>}
      <div className="lv-arc-crt min-h-0 w-full max-w-[560px] flex-1">
        {phase.k === 'play' && Arena && (
          <div className={cn('absolute inset-0', spec && `lv-mir-${spec.flip}`)} data-testid="mirror-screen">
            <Arena key={phase.session} seed={phase.seed} level={phase.level} mode={match ? (match.m.play ?? 'classic') : mode} haptics={haptics} reduce={reduce} onEnd={(s) => void finish(phase.session, s)} />
          </div>
        )}
        {phase.k !== 'play' && (
          <div className="absolute inset-0 grid place-items-center overflow-y-auto p-5 text-center" style={{ background: `radial-gradient(120% 90% at 50% 10%, ${g.color}55, #04101A 70%)` }}>
            <AnimatePresence mode="wait">
              {phase.k === 'attract' && (
                <motion.div key="attract" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3">
                  <motion.div animate={reduce ? undefined : { y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-7xl" style={spec ? { transform: 'scaleX(-1)' } : undefined}>{g.emoji}</motion.div>
                  <div className="lv-arc-marquee text-3xl">{g.name}</div>
                  <div className={cn('rounded-full px-3 py-1 text-[11px] font-black', g.own ? 'bg-[#FFE14D] text-[#2A1A00]' : 'bg-[#DDE8FF] text-[#06121E]')}>{g.own ? '✦ ONLY IN THE MIRROR' : '🪞 MIRROR TWIST'} · ×{m.ink_mult} INK</div>
                  <div className="flex rounded-2xl bg-black/50 p-1" role="tablist" data-testid="mirror-mode">
                    {(['classic', 'endless'] as const).map((md) => (
                      <button key={md} role="tab" aria-selected={mode === md} onClick={() => { setMode(md); sfx.blip(md === 'endless' ? 9 : 4); }} data-testid={`mirror-mode-${md}`}
                        className={cn('flex items-center gap-1 rounded-xl px-4 py-1.5 font-mono text-xs font-black uppercase', mode === md ? 'bg-[var(--glow)] text-black shadow-[0_0_16px_var(--glow)]' : 'text-white/70')}>
                        {md === 'endless' && <InfinityIcon className="h-3.5 w-3.5" />}{md}
                      </button>
                    ))}
                  </div>
                  {!g.own && <p className="max-w-xs rounded-xl bg-[#DDE8FF]/15 px-3 py-1.5 text-xs font-bold text-[#DDE8FF]" data-testid="mirror-twist">🪞 {twistOf(g)}</p>}
                  <p className="max-w-xs text-sm text-white/85">{mode === 'endless' ? ENDLESS[g.id] : HOW[g.id]}</p>
                  {BONUS[g.id] && <p className="max-w-xs rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-[#FFE14D]">{BONUS[g.id]}</p>}
                  <div className="font-mono text-xs text-white/60">YOUR BEST {best ?? 0} · MIRROR RECORD {record ?? 0}</div>
                  <button onClick={start} disabled={busy} className="lv-arc-bigbtn !h-20 !w-auto !rounded-3xl px-8 text-lg" data-testid="mirror-start">{busy ? '…' : '▶ PRESS START'}</button>
                  <div className="font-mono text-[11px] text-[#DDE8FF] opacity-80">FREE PLAY · ×{m.ink_mult} INK · NO CAP</div>
                </motion.div>
              )}
              {phase.k === 'mwait' && match && (
                <motion.div key="mwait" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid justify-items-center gap-3" data-testid="match-countdown">
                  <div className="lv-arc-marquee text-2xl" style={{ ['--glow' as string]: match.m.mode === 'versus' ? '#FF3D6E' : '#22E3FF' }}>{match.m.mode === 'versus' ? '⚔️ VERSUS' : '🤝 CO-OP'} · 🪞</div>
                  <div className="text-sm text-white/80">{match.m.players.length} players · <b>{PLAY[match.m.play ?? 'classic'].short}</b> · same round, same time{match.m.mode === 'team' && match.m.target ? ` · co-op target ${fmtScore(match.m.target)}` : ''}</div>
                  <div className="lv-arc-marquee text-8xl">{left != null && left > 0 ? left : '…'}</div>
                </motion.div>
              )}
              {phase.k === 'mdone' && match && (
                <motion.div key="mdone" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid w-full max-w-sm justify-items-center gap-2.5" data-testid="match-done">
                  <div className="font-mono text-5xl font-black text-[#FFE14D]" style={{ textShadow: '0 0 24px #FFB13D' }} data-testid="match-my-score">{phase.score.toLocaleString()}</div>
                  {phase.r && <span className="flex items-center gap-1 rounded-full bg-[#DDE8FF]/15 px-3 py-1 text-sm font-bold"><ResourceIcon r="ink" className="h-4 w-4" /> +{phase.r.paid} Ink · 🎟️ +{phase.r.tickets}</span>}
                  <MatchResults a={a} matchId={match.m.id} myId={match.myId} onDone={() => { void qc.invalidateQueries({ queryKey: mirrorKey }); confettiCannons(); }} />
                  <button onClick={onExit} className="rounded-2xl bg-white/10 px-5 py-2 text-sm font-bold" data-testid="match-back">Back to the mirror</button>
                </motion.div>
              )}
              {phase.k === 'count' && <motion.div key={`c${phase.n}`} initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} className="lv-arc-marquee text-9xl">{phase.n}</motion.div>}
              {phase.k === 'done' && (
                <motion.div key="done" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid justify-items-center gap-2.5" data-testid="mirror-done">
                  {phase.r?.mode === 'endless' && <div className="font-mono text-[11px] font-black text-[#B6FF3D]">∞ ENDLESS RUN</div>}
                  {phase.r?.new_record ? <div className="lv-arc-marquee text-2xl" style={{ ['--glow' as string]: '#FFE14D' }}>★ NEW MIRROR RECORD ★</div> : phase.r?.new_best ? <div className="lv-arc-marquee text-xl" style={{ ['--glow' as string]: '#9FD8FF' }}>NEW PERSONAL BEST</div> : null}
                  <div className="font-mono text-6xl font-black text-[#FFE14D]" style={{ textShadow: '0 0 24px #FFB13D' }}>{phase.score}</div>
                  {phase.r && (
                    <>
                      <div className="lv-arc-ticket text-2xl" data-testid="mirror-won">🎟️ +{counted}</div>
                      <div className="flex flex-wrap justify-center gap-2 text-sm">
                        <span className="flex items-center gap-1 rounded-full bg-[#DDE8FF]/15 px-3 py-1 font-bold" data-testid="mirror-ink"><ResourceIcon r="ink" className="h-4 w-4" /> +{phase.r.paid} Ink</span>
                        {phase.r.ink_progress != null && <span className="rounded-full bg-white/10 px-3 py-1 text-xs">next Ink {Math.round(phase.r.ink_progress * 100)}%</span>}
                      </div>
                    </>
                  )}
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => setPhase({ k: 'attract' })} className="lv-arc-bigbtn !h-14 !w-auto !rounded-2xl px-5 text-sm" data-testid="mirror-again"><RotateCcw className="mr-1 inline h-4 w-4" />PLAY AGAIN</button>
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

function MirrorScores({ m, games, onClose }: { m: Extract<MirrorArcade, { found: true }>; games: MirrorGame[]; onClose(): void }) {
  const [mode, setMode] = useState<ArcadeMode>('classic');
  const [game, setGame] = useState(games[games.length - 1]?.id ?? '');
  const board = (mode === 'endless' ? m.boards_endless : m.boards)[game] ?? [];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🪞 Mirror records" description="Only players who found the mirror are on these boards.">
      <div className="mb-2 flex gap-1.5">
        {(['classic', 'endless'] as const).map((md) => <button key={md} onClick={() => setMode(md)} className={cn('flex-1 rounded-xl py-1.5 text-xs font-bold capitalize', mode === md ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)]')}>{md}</button>)}
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {games.map((g) => <button key={g.id} onClick={() => setGame(g.id)} className={cn('shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-bold', game === g.id ? 'bg-[#DDE8FF] text-[#06121E]' : 'bg-[var(--bg-3)]')}>{g.emoji} {g.name}</button>)}
      </div>
      <div className="grid gap-1.5" data-testid="mirror-board">
        {board.map((row, i) => (
          <div key={row.player.id ?? i} className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3 py-2">
            <span className="w-5 text-center font-black">{i + 1}</span><PlayerAvatar p={row.player} size={22} /><span className="min-w-0 flex-1 truncate text-sm">@{row.player.username}</span><b className="font-mono">{row.score}</b>
          </div>
        ))}
        {!board.length && <p className="py-4 text-center text-sm text-[var(--fg-2)]">No one has a score here yet.</p>}
      </div>
    </Dialog>
  );
}

/** The moment you go through: the cabinet's glass cracks, everything flashes white and flips. */
export function GlassCrack({ onDone }: { onDone(): void }) {
  useEffect(() => { sfx.thud(); const a = setTimeout(() => sfx.jackpot(), 700); const b = setTimeout(onDone, 2100); return () => { clearTimeout(a); clearTimeout(b); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cracks = ['M50 48 L18 12 L10 2', 'M50 48 L86 18 L97 6', 'M50 48 L92 62 L100 70', 'M50 48 L70 92 L74 100', 'M50 48 L30 88 L22 100', 'M50 48 L6 60 L0 64', 'M50 48 L52 4', 'M50 48 L36 30 L26 26', 'M50 48 L66 34 L80 36'];
  return (
    <div className="pointer-events-auto fixed inset-0 z-[80]" data-testid="mirror-crack">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {cracks.map((d, i) => (
          <motion.path key={i} d={d} fill="none" stroke="white" strokeWidth={0.5} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 1.2px #9FD8FF)' }}
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: i * 0.05 }} />
        ))}
      </svg>
      <motion.div className="absolute inset-0 bg-white" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ duration: 2.1, times: [0, 0.4, 0.55, 0.75, 1] }} />
      <motion.div className="absolute inset-0 grid place-items-center" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 0] }} transition={{ duration: 2.1, times: [0, 0.5, 0.7, 1] }}>
        <div className="font-display text-4xl font-black text-[#06121E]" style={{ transform: 'scaleX(-1)' }}>THROUGH THE GLASS</div>
      </motion.div>
    </div>
  );
}
