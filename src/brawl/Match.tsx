// A Paintbrawl match: the 3D board (in BrawlScreen) plus everything on top — both heroes, the turn clock, your paint,
// your hand. Tap a card, then where it goes (a lane for creatures and totems, a target for spells); tap one of your
// creatures to Flourish it; End turn sends your creatures in. Every move goes to the server, comes back with what
// happened, and plays out on the board; the other player's moves arrive the same way (live, with a poll as backup).
import { useQueryClient } from '@tanstack/react-query';
import { Flag, Hand, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, Dialog } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { sfx } from '../arcade/sfx';
import { CARD, EVENTS, LANES, TERRAIN_INFO, type Target } from '../shared/brawl/cards';
import { check, type Action, type Ev, type Pick, type Side, type State, type View } from '../shared/brawl/engine';
import type { Board3D, BoardPick, Highlight } from './board3d';
import { CardView } from './CardView';
import type { MatchView, Rewards } from './types';

type Mode = { kind: 'idle' } | { kind: 'card'; uid: number } | { kind: 'flourish'; lane: number };
const asState = (v: View) => v as unknown as State;

export function Match({ id, board, me0, onLeave, onPack }: { id: string; board: React.RefObject<Board3D | null>; me0: string; onLeave(): void; onPack(): void }) {
  const qc = useQueryClient();
  const [mv, setMv] = useState<MatchView | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ text: string; sub?: string; color: string } | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<Rewards | null>(null);
  const shown = useRef(-1);           // the last log entry played on the board
  const chain = useRef(Promise.resolve());
  const chan = useRef<{ send(m: unknown): void; close(): void } | null>(null);
  const offset = useRef(0);
  const mvRef = useRef(mv); mvRef.current = mv;

  const side = mv?.side ?? 0, v = mv?.view;
  const myTurn = !!v && !v.over && v.turn === side && mv?.status === 'live';
  const P = v?.p[side], O = v?.p[side === 0 ? 1 : 0];

  /** Play everything new in a view on the board (in order), then show it. */
  const absorb = useCallback((next: MatchView) => {
    chain.current = chain.current.then(async () => {
      const b = board.current;
      const fresh = next.view.log.filter((l) => l.n > shown.current);
      if (shown.current < 0) {
        // joining: no replay of the past, but announce the arena event
        b?.setView(next.view);
        const ev = EVENTS.find((x) => x.id === next.view.ev)!;
        setBanner({ text: `${ev.emoji} ${ev.name}`, sub: ev.text, color: '#FFE14D' });
        setTimeout(() => setBanner(null), 2600);
      } else if (fresh.length && b) {
        for (const l of fresh) {
          const turnEv = l.ev.find((e): e is Extract<Ev, { e: 'turn' }> => e.e === 'turn');
          await b.play(l.ev.filter((e) => e.e !== 'turn'), next.view);
          if (turnEv && !next.view.over) {
            const mine = turnEv.side === next.side;
            setBanner({ text: mine ? 'Your turn!' : `${next.players[turnEv.side]?.username ?? 'Their'}’s turn`, sub: `Round ${turnEv.round}`, color: mine ? '#3DDC97' : '#FF4FD8' });
            if (mine) sfx.perfect(2);
            setTimeout(() => setBanner(null), 1400);
          }
        }
      } else b?.setView(next.view);
      shown.current = Math.max(shown.current, ...next.view.log.map((l) => l.n), next.view.v);
      offset.current = Date.parse(next.server_time) - Date.now();
      setMv(next);
      if (next.status === 'over' && next.rewards && !result) {
        setResult(next.rewards);
        if (next.rewards.result === 'win') { sfx.jackpot(); confettiCannons(); } else sfx.fail();
        invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['brawl'] });
      }
    }).catch(() => {});
    return chain.current;
  }, [board, qc, result]);

  const refresh = useCallback(async () => { try { await absorb(await api.brawlView(id)); } catch { /* next time */ } }, [id, absorb]);

  // live: a nudge from the other player's device, plus a poll as a backup; tick the clock when it runs out
  useEffect(() => {
    void refresh();
    chan.current = getBackend().liveChannel?.(`brawl:${id}`, () => void refresh()) ?? null;
    const poll = setInterval(() => {
      const m = mvRef.current;
      if (!m || m.status === 'over') return;
      void refresh();
      if (!m.bot && m.deadline && Date.parse(m.deadline) - (Date.now() + offset.current) < -2500) void api.brawlOp({ op: 'tick', match: id }).then(() => { chan.current?.send({ t: 'v' }); void refresh(); }).catch(() => {});
    }, 2500);
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(poll); clearInterval(clock); chan.current?.close(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action: Action) => {
    if (busy) return;
    setBusy(true); setMode({ kind: 'idle' }); board.current?.highlight([]);
    try {
      const r = await api.brawlOp({ op: 'act', match: id, action });
      chan.current?.send({ t: 'v' });
      // play our move straight away from the reply, then fetch the full picture (players, rewards)
      if (mvRef.current) await absorb({ ...mvRef.current, view: r.view, status: r.view.over ? 'over' : 'live', rewards: r.rewards ?? null });
      await refresh();
    } catch (e) { toast.error(friendly(toGameError(e).code) ?? toGameError(e).message); void refresh(); }
    finally { setBusy(false); }
  };

  // what can be picked on the board right now
  const highlights = useMemo<Highlight[]>(() => {
    if (!v || !myTurn) return [];
    const s = asState(v), out: Highlight[] = [];
    const all = (fn: (p: Pick) => boolean, kind: Highlight['kind']) => { for (const sd of [0, 1] as Side[]) for (let lane = 0; lane < LANES; lane++) if (fn({ side: sd, lane })) out.push({ side: sd, lane, kind }); };
    if (mode.kind === 'card') {
      const h = P!.hand.find((x) => x.uid === mode.uid); const c = h?.id ? CARD[h.id] : null; if (!c) return [];
      if (c.kind !== 'spell') all((p) => p.side === side && !check(s, side, { t: 'play', uid: mode.uid, lane: p.lane }), 'place');
      else all((p) => !check(s, side, { t: 'play', uid: mode.uid, target: p }), 'target');
    } else if (mode.kind === 'flourish') all((p) => !check(s, side, { t: 'flourish', lane: mode.lane, target: p }), 'target');
    else P!.lanes.forEach((L, lane) => { if (L.unit && !check(s, side, { t: 'flourish', lane, target: { side, lane: lane === 0 ? 1 : lane - 1 } }) || (L.unit && !check(s, side, { t: 'flourish', lane }))) out.push({ side, lane, kind: 'flourish' }); });
    return out;
  }, [v, mode, myTurn, side, P]);
  useEffect(() => { board.current?.highlight(highlights); }, [highlights, board]);

  // taps on the board
  const pickRef = useRef<(p: BoardPick) => void>(() => {});
  pickRef.current = (p: BoardPick) => {
    if (!v || !myTurn || busy) return;
    if (mode.kind === 'card') {
      const h = P!.hand.find((x) => x.uid === mode.uid); const c = h?.id ? CARD[h.id] : null; if (!c) return;
      if (c.kind !== 'spell') { if (p.side === side && p.lane >= 0) void send({ t: 'play', uid: mode.uid, lane: p.lane }); }
      else if (p.lane >= 0) void send({ t: 'play', uid: mode.uid, target: { side: p.side, lane: p.lane } });
      return;
    }
    if (mode.kind === 'flourish') { if (p.lane >= 0) void send({ t: 'flourish', lane: mode.lane, target: { side: p.side, lane: p.lane } }); return; }
    // nothing selected: tapping one of your creatures offers its Flourish
    if (p.side === side && p.lane >= 0 && P!.lanes[p.lane].unit) setPeek(`unit:${p.lane}`);
    else if (p.lane >= 0 && v.p[p.side].lanes[p.lane].unit) setPeek(v.p[p.side].lanes[p.lane].unit!.id);
  };
  useEffect(() => { (window as unknown as { __brawlPick?: (p: BoardPick) => void }).__brawlPick = (p) => pickRef.current(p); }, []);
  useEffect(() => { boardPick = (p) => pickRef.current(p); return () => { boardPick = null; }; }, []);

  const selectCard = (uid: number) => {
    if (!myTurn || busy) return;
    const h = P!.hand.find((x) => x.uid === uid); if (!h?.id) return;
    const c = CARD[h.id];
    if (c.cost > P!.paint) { toast(`Not enough paint — ${c.name} costs ${c.cost}`); return; }
    if (mode.kind === 'card' && mode.uid === uid) {
      // tapping a selected spell that needs no target casts it
      if (c.kind === 'spell' && (!c.target || c.target === 'none')) void send({ t: 'play', uid });
      else setMode({ kind: 'idle' });
      return;
    }
    sfx.tick(); setMode({ kind: 'card', uid });
  };
  const flourish = (lane: number) => {
    const u = P!.lanes[lane].unit!; const f = CARD[u.id].flourish!;
    setPeek(null);
    const needs: Target | undefined = u.id === 'jellyfright' ? 'my_lane' : f.target;
    if (needs) { setMode({ kind: 'flourish', lane }); toast(u.id === 'jellyfright' ? 'Tap a lane next to it' : 'Tap a target'); }
    else void send({ t: 'flourish', lane });
  };

  if (!mv || !v || !P || !O) return <div className="absolute inset-0 grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-white/70" /></div>;
  const opp = mv.players[side === 0 ? 1 : 0], mine = mv.players[side];
  const left = mv.deadline && !mv.bot ? Math.max(0, Math.ceil((Date.parse(mv.deadline) - (now + offset.current)) / 1000)) : null;
  const selected = mode.kind === 'card' ? P.hand.find((h) => h.uid === mode.uid) : null;
  const selCard = selected?.id ? CARD[selected.id] : null;
  const canAfford = P.hand.some((h) => h.id && CARD[h.id].cost <= P.paint);
  const hint = !myTurn ? `${opp.username} is thinking…` : mode.kind === 'card' && selCard ? (selCard.kind !== 'spell' ? 'Tap one of your lanes' : !selCard.target || selCard.target === 'none' ? 'Tap the card again to cast it' : 'Tap a target') : mode.kind === 'flourish' ? 'Tap a target' : canAfford ? 'Tap a card to play it' : 'Out of paint — end your turn';
  const unitPeek = peek?.startsWith('unit:') ? Number(peek.slice(5)) : null;
  const hand = P.hand;
  const cw = Math.max(64, Math.min(96, (Math.min(innerWidth, 720) - 24) / Math.max(5, hand.length) + 18));

  return (
    <>
      {/* the other player */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]" data-testid="brawl-opp">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-black/60 px-3 py-1.5 backdrop-blur">
          <span className="grid h-8 w-8 place-items-center rounded-full text-lg" style={{ background: opp.accent_color ?? '#FF4FD8' }}>{opp.bot ? '🤖' : opp.rank?.emoji ?? '🎨'}</span>
          <div className="min-w-0"><div className="truncate text-sm font-black">{opp.username}</div><div className="text-[10px] text-white/70">{opp.bot ? 'Practice bot' : `${opp.rank.name} · 🏆 ${opp.trophies}`}</div></div>
          <div className="ml-2 grid justify-items-center"><span className="text-lg font-black text-[#FF8AC2]" data-testid="brawl-opp-hp">❤️ {O.hero}</span></div>
          <div className="ml-1 flex -space-x-3">{O.hand.slice(0, 8).map((h) => <CardView key={h.uid} back width={22} animate={false} tilt={false} />)}</div>
          <span className="text-[10px] text-white/60">🂠 {O.deck}</span>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1">
          <button onClick={() => setMenu(true)} className="rounded-xl bg-black/60 px-2.5 py-1.5 text-xs font-bold backdrop-blur" data-testid="brawl-menu"><Flag className="inline h-3.5 w-3.5" /></button>
          {left !== null && <span className={cn('rounded-full px-2 py-0.5 text-xs font-black tabular-nums', left <= 10 ? 'animate-pulse bg-[#FF4D6D]' : 'bg-black/60')} data-testid="brawl-clock">⏱ {left}s</span>}
          <span className="whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold" title={EVENTS.find((x) => x.id === v.ev)?.text}>{EVENTS.find((x) => x.id === v.ev)?.emoji} Round {v.round}</span>
        </div>
      </div>

      {banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] z-20 grid justify-items-center" data-testid="brawl-banner">
          <div className="animate-[lv-pop_0.35s_ease-out] rounded-3xl bg-black/75 px-6 py-3 text-center backdrop-blur" style={{ boxShadow: `0 0 40px -6px ${banner.color}` }}>
            <div className="font-display text-3xl font-black" style={{ color: banner.color }}>{banner.text}</div>
            {banner.sub && <div className="mt-1 max-w-xs text-sm text-white/80">{banner.sub}</div>}
          </div>
        </div>
      )}

      {/* you */}
      <div className="absolute inset-x-0 bottom-0 z-10 grid gap-1.5 p-2 pb-[max(8px,env(safe-area-inset-bottom,0px))]">
        <div className="flex items-end justify-between gap-2">
          <div className="flex items-center gap-2 rounded-2xl bg-black/65 px-3 py-1.5 backdrop-blur" data-testid="brawl-me">
            <span className="text-lg font-black text-[#7BFFAE]" data-testid="brawl-my-hp">❤️ {P.hero}</span>
            <div className="flex gap-0.5" data-testid="brawl-paint" aria-label={`${P.paint} paint`}>
              {Array.from({ length: Math.max(P.paint, Math.min(7, 1 + v.round)) }, (_, i) => <span key={i} className={cn('text-base transition', i < P.paint ? 'drop-shadow-[0_0_6px_#3A86FF]' : 'opacity-25 grayscale')}>💧</span>)}
            </div>
            <span className="text-[10px] text-white/60">🂠 {P.deck}</span>
          </div>
          <div className="pointer-events-none flex-1 text-center text-xs font-bold text-white/80 drop-shadow" data-testid="brawl-hint">{hint}</div>
          <button onClick={() => void send({ t: 'end' })} disabled={!myTurn || busy}
            className={cn('h-12 rounded-2xl px-4 font-display text-base font-black shadow-lg transition disabled:opacity-40', myTurn && !canAfford ? 'animate-pulse bg-[#FFE14D] text-black' : 'bg-[#FF4FD8] text-white')} data-testid="brawl-end">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : myTurn ? 'End turn ⚔️' : 'Waiting…'}
          </button>
        </div>
        <div className="flex items-end justify-center gap-0 overflow-x-auto px-1 pb-1 pt-4 [scrollbar-width:none]" data-testid="brawl-hand">
          {hand.map((h, i) => {
            const c = h.id ? CARD[h.id] : null; if (!c) return null;
            const ok = myTurn && c.cost <= P.paint, sel = mode.kind === 'card' && mode.uid === h.uid;
            const fan = (i - (hand.length - 1) / 2) * 3.5;
            return (
              <div key={h.uid} className="-mx-1.5 transition-transform" style={{ transform: `rotate(${fan}deg) translateY(${Math.abs(fan) * 1.2}px)` }}>
                <CardView id={h.id} width={cw} selected={sel} dim={!ok} glow={ok && myTurn ? '#3A86FF' : undefined} onClick={() => selectCard(h.uid)} testid={`brawl-card-${h.id}`} animate={sel || hand.length <= 6} />
              </div>
            );
          })}
          {!hand.length && <div className="py-6 text-xs text-white/60">No cards in hand</div>}
        </div>
      </div>
      {selCard && (
        <div className="pointer-events-none absolute right-2 top-[18%] z-10 hidden sm:block"><CardView id={selCard.id} width={170} /></div>
      )}

      {/* a creature's Flourish / any card up close */}
      <Dialog open={!!peek} onOpenChange={(o) => !o && setPeek(null)} title={unitPeek !== null ? CARD[P.lanes[unitPeek]?.unit?.id ?? 'pebblegolem'].name : peek ? CARD[peek]?.name ?? '' : ''}>
        {peek && (
          <div className="grid justify-items-center gap-3" data-testid="brawl-peek">
            <CardView id={unitPeek !== null ? P.lanes[unitPeek].unit!.id : peek} width={200} atk={undefined} hp={unitPeek !== null ? P.lanes[unitPeek].unit!.hp : undefined} />
            {unitPeek !== null && (() => {
              const u = P.lanes[unitPeek].unit!; const f = CARD[u.id].flourish;
              if (!f) return <p className="text-sm text-muted">No Flourish — it just fights.</p>;
              const why = !myTurn ? 'Not your turn' : u.acted ? 'Already used this turn' : u.frozen ? 'Frozen' : f.cost > P.paint ? `Needs ${f.cost} paint` : null;
              return <Button variant="primary" disabled={!!why || busy} onClick={() => flourish(unitPeek)} data-testid="brawl-flourish"><Hand className="h-4 w-4" />{why ?? `Flourish (${f.cost} 💧)`}</Button>;
            })()}
          </div>
        )}
      </Dialog>

      <Dialog open={menu} onOpenChange={setMenu} title="Match">
        <div className="grid gap-2">
          <p className="text-sm text-muted">{EVENTS.find((x) => x.id === v.ev)?.emoji} <b>{EVENTS.find((x) => x.id === v.ev)?.name}:</b> {EVENTS.find((x) => x.id === v.ev)?.text}</p>
          <p className="text-xs text-muted">Your lanes: {P.lanes.map((L) => TERRAIN_INFO[L.terrain].emoji).join(' ')} — creatures on their own terrain get +1 attack.</p>
          <Button variant="danger" onClick={() => { setMenu(false); void api.brawlOp({ op: 'concede', match: id }).then(() => { chan.current?.send({ t: 'v' }); void refresh(); }).catch((e) => toast.error(toGameError(e).message)); }} data-testid="brawl-concede"><Flag className="h-4 w-4" />Concede</Button>
        </div>
      </Dialog>

      <Dialog open={!!result} onOpenChange={() => {}} title="">
        {result && (
          <div className="grid justify-items-center gap-3 text-center" data-testid="brawl-result">
            <div className="text-6xl">{result.result === 'win' ? '🏆' : result.result === 'draw' ? '🤝' : '💥'}</div>
            <div className={cn('font-display text-4xl font-black', result.result === 'win' ? 'text-[#FFE14D]' : result.result === 'draw' ? 'text-white' : 'text-[#FF8AC2]')}>{result.result === 'win' ? 'Victory!' : result.result === 'draw' ? 'A draw' : 'Defeat'}</div>
            <div className="text-sm text-muted">{mv.reason === 'concede' ? (result.result === 'win' ? `${opp.username} conceded` : 'You conceded') : mv.reason === 'timeout' ? 'Out of time' : mv.reason === 'rounds' ? 'The round limit was reached' : `${mine.username} vs ${opp.username}`}</div>
            <div className="flex flex-wrap justify-center gap-2 text-sm font-black">
              <span className="rounded-full bg-surface-2 px-3 py-1">💠 +{result.shards} shards</span>
              {result.trophies !== 0 && <span className={cn('rounded-full px-3 py-1', result.trophies > 0 ? 'bg-[#3DDC97]/20 text-[#3DDC97]' : 'bg-[#FF4D6D]/20 text-[#FF8AA0]')}>🏆 {result.trophies > 0 ? '+' : ''}{result.trophies} → {result.total}</span>}
              {result.ink > 0 && <span className="rounded-full bg-surface-2 px-3 py-1">💧 +{result.ink} Ink</span>}
            </div>
            {result.pack && <div className="rounded-2xl bg-[#FFE14D]/15 px-3 py-2 text-sm font-bold text-[#FFE14D]">🎁 First win of the day: a free pack is waiting!</div>}
            <div className="flex gap-2">
              {result.pack && <Button variant="primary" onClick={onPack}>🎁 Open it</Button>}
              <Button variant={result.pack ? 'secondary' : 'primary'} onClick={onLeave} data-testid="brawl-result-done">Back to the arena</Button>
            </div>
          </div>
        )}
      </Dialog>
      <span className="hidden">{me0}</span>
    </>
  );
}
/** The board's tap handler (set by the live match). */
export let boardPick: ((p: BoardPick) => void) | null = null;

function friendly(code: string) {
  const m: Record<string, string> = {
    brawl_not_your_turn: 'It’s not your turn', brawl_no_paint: 'Not enough paint', brawl_bad_target: 'That can’t be targeted', brawl_already_acted: 'It already did something this turn',
    brawl_frozen: 'It’s frozen', brawl_nothing_to_revive: 'No fallen creature to bring back', brawl_conflict: 'The board changed — try again', brawl_over: 'This match is over',
  };
  return m[code];
}
