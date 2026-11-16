// A house party game, full screen. The host's device keeps the game and checks every move; it sends the game to
// everyone whenever it changes (and every couple of seconds anyway); everyone else sends their moves. At the end the
// host reports the places and the server pays a little Ink (up to 100 a day).
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../backend/api';
import { getBackend, toGameError } from '../../backend/backend';
import type { HomeGame } from '../../backend/types';
import { cn } from '../../lib/utils';
import { Button, PlayerAvatar, ResourceIcon } from '../../ui';
import { sfx } from '../../arcade/sfx';
import { PARTY } from './index';
import { SEAT_COLORS, type Places, type Seat } from './kit';
import { botProfiles, isBot, partyBots } from './bots';
import { ChatDock, type GameTalk } from '../../party/ChatDock';

type Msg = { t: 'gs'; k: number; s: unknown; now: number } | { t: 'gm'; id: string; m: unknown } | { t: 'end'; r: Places };

export const seatsOf = (g: HomeGame): Seat[] => {
  const people = [...g.players].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9)).map((p, i) => ({ id: p.id, slot: p.slot ?? i, name: `@${p.username}`, color: SEAT_COLORS[(p.slot ?? i) % SEAT_COLORS.length], p }));
  // the bots sit in the seats after everyone else
  const bots = botProfiles(g.id, g.bots ?? 0).map((p, i) => { const slot = people.length + i; return { id: p.id, slot, name: p.username, color: SEAT_COLORS[slot % SEAT_COLORS.length], p }; });
  return [...people, ...bots];
};

export function PartyGame({ game, myId, onClose, talk }: { game: HomeGame; myId: string; onClose(): void; talk?: GameTalk }) {
  // the house's chat comes along: what anyone says pops up under their seat
  const said = useSeatSay(talk, myId);
  const seatEls = useRef(new Map<string, HTMLDivElement>());
  const def = PARTY[game.game];
  const seats = useRef(seatsOf(game)).current;
  const host = game.host === myId;
  const [s, setS] = useState<unknown>(() => def?.init(seats, game.seed ?? 1));
  const [phase, setPhase] = useState<'count' | 'play' | 'end' | 'gone'>('count');
  const [count, setCount] = useState(3);
  const [final, setFinal] = useState<HomeGame | null>(null);
  const [, setTick] = useState(0);
  const clock = useRef({ now: 0, at: performance.now() });
  const sendRef = useRef<(m: unknown) => void>(() => {});

  useEffect(() => {
    if (!def) return;
    const backend = getBackend();
    const offset = Date.parse(game.server_time) - Date.now();
    const startAt = Date.parse(game.started_at ?? game.server_time) - offset;
    const state = def.init(seats, game.seed ?? 1) as Record<string, unknown>;
    let seq = 0, lastGot = performance.now(), lastSent = 0, ended: Places | null = null, stop = false, dirty = false;
    const nowMs = () => Date.now() - startAt;
    const pack = () => (def.view ? def.view(state) : state);
    const broadcast = () => { seq++; lastSent = performance.now(); ch.send({ t: 'gs', k: seq, s: pack(), now: nowMs() }); };
    const show = () => { setS(structuredClone(state)); clock.current = { now: nowMs(), at: performance.now() }; };
    const finish = () => {
      setPhase('end'); sfx.jackpot?.();
      const poll = async (tries = 0) => {
        if (stop) return;
        try {
          const r = host ? await api.homeGameReport(game.id, ended!) : await api.homeGameGet(game.id);
          if (r.status === 'done' || r.status === 'cancelled') { setFinal(r); return; }
        } catch (e) { if (host && toGameError(e).code !== 'game_too_fast' && tries > 3) { setFinal({ ...game, status: 'cancelled' }); return; } }
        setTimeout(() => void poll(tries + 1), 1500);
      };
      void poll();
    };
    const apply = (by: string, m: unknown) => {
      if (ended || nowMs() < 0) return;
      if (def.move(state, by, m, nowMs())) { dirty = true; sfx.blip?.(10); }
    };
    const onMsg = (raw: unknown) => {
      const m = raw as Msg; if (!m || typeof m !== 'object') return;
      if (host && m.t === 'gm' && seats.some((x) => x.id === m.id)) apply(m.id, m.m);
      else if (!host && m.t === 'gs' && m.k > seq) { seq = m.k; lastGot = performance.now(); setS(m.s); clock.current = { now: m.now, at: performance.now() }; if (phaseRef.current === 'count' && m.now >= 0) { phaseRef.current = 'play'; setPhase('play'); } }
      else if (!host && m.t === 'end' && !ended) { ended = m.r; finish(); }
    };
    const ch = backend.liveChannel?.(`hg:${game.id}`, onMsg) ?? { send() {}, close() {} };
    sendRef.current = host ? (m) => apply(myId, m) : (m) => ch.send({ t: 'gm', id: myId, m });
    // the bots at the table: the host plays them
    const botIds = seats.filter((x) => isBot(x.id)).map((x) => x.id), runBots = partyBots(game.game, game.seed ?? 1);
    const iv = setInterval(() => {
      if (stop) return;
      const now = nowMs();
      if (now < 0) { setCount(Math.ceil(-now / 1000)); return; }
      if (phaseRef.current === 'count') { phaseRef.current = 'play'; setPhase('play'); sfx.coin(); if (host) dirty = true; }
      if (host && !ended) {
        if (botIds.length) for (const mv of runBots(state, botIds, now)) apply(mv.by, mv.m);
        if (def.tick?.(state, now)) dirty = true;
        if (dirty || performance.now() - lastSent > 1500) { dirty = false; broadcast(); show(); }
        const r = def.result(state);
        if (r) { ended = r; broadcast(); show(); ch.send({ t: 'end', r }); setTimeout(() => ch.send({ t: 'end', r }), 800); setTimeout(() => ch.send({ t: 'end', r }), 2000); finish(); }
      }
      if (!host && !ended && now > 2500 && performance.now() - lastGot > 9000) { ended = {}; setPhase('gone'); }
      setTick((t) => (t + 1) % 1000);
    }, 100);
    (window as unknown as { __party: unknown }).__party = { get s() { return state; }, host, seats, send: (m: unknown) => sendRef.current(m) };
    return () => { stop = true; clearInterval(iv); ch.close(); };
  }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const phaseRef = useRef(phase);

  if (!def) return null;
  const now = clock.current.now + (performance.now() - clock.current.at);
  const score = def.score?.(s as never) ?? null;
  const turn = def.turn?.(s as never) ?? null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-gradient-to-b from-[#2A1F3D] to-[#120C1C] text-white" data-testid="party-game">
      <div className="flex items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <span className="text-2xl">{def.emoji}</span><b className="flex-1 font-display text-lg">{def.name}</b>
        {phase === 'play' && <button onClick={onClose} className="rounded-xl bg-white/10 p-2" aria-label="Leave the game" data-testid="party-leave"><X className="h-4 w-4" /></button>}
      </div>
      {/* the players, their scores and whose turn */}
      <div className="flex justify-center gap-2 overflow-x-auto px-3 pb-2">
        {seats.map((x) => (
          <div key={x.id} ref={(el) => { if (el) seatEls.current.set(x.id, el); else seatEls.current.delete(x.id); }} data-testid="party-seat" data-seat={x.id} className={cn('flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-bold', turn === x.id ? 'bg-white/25 ring-2' : 'bg-white/10')} style={{ ['--tw-ring-color' as string]: x.color }}>
            <span className="rounded-full p-0.5" style={{ background: x.color }}><PlayerAvatar p={x.p} size={22} /></span>
            <span className="max-w-[80px] truncate">{x.id === myId ? 'You' : x.name}</span>
            {score && <span className="tabular-nums" style={{ color: x.color }}>{score[x.id] ?? 0}</span>}
          </div>
        ))}
      </div>
      <SeatBubbles said={said} els={seatEls.current} />
      {talk && <ChatDock channels={talk.channels} myId={myId} onInvite={talk.onInvite} quiet hotkey={false} testid="game-chat"
        className="absolute bottom-[max(16px,env(safe-area-inset-bottom,0px))] left-3 z-[85]" />}
      <div className="flex flex-1 items-start justify-center overflow-y-auto px-3 pb-[max(16px,env(safe-area-inset-bottom,0px))] pt-2">
        <def.View s={s as never} me={myId} seats={seats} send={(m: unknown) => sendRef.current(m)} now={now} host={host} />
      </div>
      <AnimatePresence>
        {phase === 'count' && (
          <motion.div exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-black/60">
            <div className="grid max-w-xs justify-items-center gap-2 text-center">
              <div className="text-6xl">{def.emoji}</div><div className="font-display text-3xl font-black">{def.name}</div>
              <p className="text-sm text-white/80">{def.how}</p>
              <motion.div key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-7xl font-black" style={{ color: def.color }}>{count}</motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {phase === 'gone' && (
        <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center"><div className="grid gap-3"><div className="text-4xl">📡</div><b>The host dropped out</b><p className="text-sm text-white/70">This game can’t finish without them.</p><Button variant="rainbow" onClick={onClose}>Back to the party</Button></div></div>
      )}
      {phase === 'end' && <PartyResults g={final} myId={myId} onClose={onClose} />}
    </div>
  );
}

export function PartyResults({ g, myId, onClose }: { g: HomeGame | null; myId: string; onClose(): void }) {
  if (!g) return <div className="absolute inset-0 grid place-items-center bg-black/50"><div className="lv-arc-marquee text-3xl">GAME OVER!</div></div>;
  if (g.status === 'cancelled') return <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center"><div className="grid gap-3"><b>That game didn’t count</b><Button variant="rainbow" onClick={onClose}>Back to the party</Button></div></div>;
  // the bots too (their places come from the result; they don't win anything)
  const places = g.result?.places ?? {};
  const bots = botProfiles(g.id, g.bots ?? 0).map((p) => ({ ...p, slot: null, place: places[p.id] ?? null, ink: 0, bot: true }));
  const rows = [...g.players, ...bots].sort((a, b) => (a.place ?? 9) - (b.place ?? 9));
  const me = rows.find((p) => p.id === myId);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center bg-black/80 p-6" data-testid="party-results">
      <div className="grid w-full max-w-sm justify-items-center gap-3">
        <motion.div initial={{ scale: 0.5, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} className="font-display text-3xl font-black">{me?.place === 1 ? '🏆 You win!' : `🏆 ${rows[0] && 'bot' in rows[0] ? rows[0].username : `@${rows[0]?.username}`} wins!`}</motion.div>
        <div className="grid w-full gap-1.5">
          {rows.map((p) => (
            <div key={p.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-2 text-sm', p.id === myId ? 'bg-white/20' : 'bg-white/10')}>
              <b className="w-6 text-center">{p.place === 1 ? '👑' : p.place}</b><PlayerAvatar p={p} size={24} />
              <span className="min-w-0 flex-1 truncate font-bold">{p.id === myId ? 'You' : 'bot' in p ? p.username : `@${p.username}`}</span>
              {'bot' in p ? <span className="text-[11px] text-white/50">bot</span> : <span className="flex items-center gap-1 text-sm font-black text-[#7DFFB2]" data-testid="party-ink"><ResourceIcon r="ink" className="h-4 w-4" />+{p.ink}</span>}
            </div>
          ))}
        </div>
        {(g.result?.boost ?? 1) > 1 && <p className="text-xs text-[#7DFFB2]">🎉 Party of {g.result?.players}: +{Math.round(((g.result?.boost ?? 1) - 1) * 100)}% Ink</p>}
        {me && !me.ink && <p className="max-w-xs text-center text-[11px] text-white/60">House games pay up to 500 Ink a day, to accounts at least a day old that own land.</p>}
        {(g.bots ?? 0) > 0 && <p className="max-w-xs text-center text-[11px] text-white/60">🤖 Played with bots: half the Ink of a game with people.</p>}
        <Button variant="rainbow" onClick={onClose} data-testid="party-close">Back to the party</Button>
      </div>
    </motion.div>
  );
}

/** what people at the table say, for a few seconds each (keyed by seat: 'me' is you) */
export function useSeatSay(talk: GameTalk | undefined, myId: string) {
  const [said, setSaid] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!talk) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    talk.ref.current = {
      say: (id, text) => {
        const who = id === 'me' ? myId : id, body = String(text ?? '').trim().slice(0, 140); if (!body) return;
        setSaid((x) => ({ ...x, [who]: body }));
        clearTimeout(timers.get(who));
        timers.set(who, setTimeout(() => setSaid((x) => { const n = { ...x }; delete n[who]; return n; }), 5500 + Math.min(body.length, 90) * 40));
      },
    };
    return () => { talk.ref.current = null; for (const t of timers.values()) clearTimeout(t); };
  }, [talk?.ref, myId]); // eslint-disable-line react-hooks/exhaustive-deps
  return said;
}

/** the speech bubbles, just under each speaker's seat */
function SeatBubbles({ said, els }: { said: Record<string, string>; els: Map<string, HTMLDivElement> }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[84]" aria-live="polite">
      {Object.entries(said).map(([id, text]) => {
        const r = els.get(id)?.getBoundingClientRect(); if (!r) return null;
        return (
          <div key={id} className="lv-seat-say" style={{ left: Math.min(Math.max(r.left + r.width / 2, 100), innerWidth - 100), top: r.bottom + 8 }} data-testid="party-seat-say">
            {text.length > 90 ? `${text.slice(0, 88)}…` : text}
          </div>
        );
      })}
    </div>
  );
}
