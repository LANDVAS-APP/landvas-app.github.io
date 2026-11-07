// A Paintbrawl match: the 3D board (in BrawlScreen) plus everything on top — both heroes, the turn clock, your paint,
// your hand. Tap a card, then where it goes (a lane for creatures and totems, a target for spells); tap one of your
// creatures to Flourish it; End turn sends your creatures in. Every move goes to the server, comes back with what
// happened, and plays out on the board; the other player's moves arrive the same way (live, with a poll as backup).
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Flag, Hand, Loader2, Pencil, Play, Shuffle, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { invalidateGame } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, Dialog } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { sfx } from '../arcade/sfx';
import { CARD, EVENTS, HAND_MAX_UI, LANES, TERRAIN_INFO, kindName, type Card, type Target, type Terrain } from '../shared/brawl/cards';
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
  const [inspect, setInspect] = useState<number | null>(null); // a hand card being looked at up close
  const [showing, setShowing] = useState(false);              // its effect is playing on the board
  // dragging a card (or a land card) out of your hand onto the board
  type DragWhat = { kind: 'card'; uid: number; id: string } | { kind: 'land'; i: number; t: Terrain };
  const [drag, setDrag] = useState<(DragWhat & { x: number; y: number; ok: boolean }) | null>(null);
  const press = useRef<{ d: DragWhat; sx: number; sy: number; on: boolean; pid: number; blocked?: boolean } | null>(null);
  // the land cards: which of your four goes in which lane (index into landCards), and the one picked up by a tap
  const [placed, setPlaced] = useState<(number | null)[]>([null, null, null, null]);
  const [landSel, setLandSel] = useState<number | null>(null);
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
  const landing = v?.phase === 'lands' && mv?.status === 'live';
  const landCards = (P?.landCards ?? []) as Terrain[];

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
      } else if (!b?.previewing) b?.setView(next.view);
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
    if (v && landing && !P?.ready && (landSel !== null || drag?.kind === 'land')) return [0, 1, 2, 3].map((lane) => ({ side, lane, kind: 'place' as const }));
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
  }, [v, mode, myTurn, side, P, landing, landSel, drag?.kind]);
  useEffect(() => { board.current?.highlight(highlights); }, [highlights, board]);

  // taps on the board
  const pickRef = useRef<(p: BoardPick) => void>(() => {});
  pickRef.current = (p: BoardPick) => {
    if (v && landing) {
      if (P?.ready || p.side !== side || p.lane < 0) return;
      if (landSel !== null) { placeLand(landSel, p.lane); setLandSel(null); }
      else if (placed[p.lane] !== null) { setPlaced((x) => x.map((v2, l) => (l === p.lane ? null : v2))); board.current?.setLocalLand(p.lane, null); }
      return;
    }
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

  // ---- land cards ----
  const placeLand = (i: number, lane: number) => {
    setPlaced((cur) => {
      const next = cur.map((x) => (x === i ? null : x));
      next[lane] = i;
      return next;
    });
    sfx.tick(); board.current?.setLocalLand(lane, landCards[i]);
  };
  const autoLands = () => { setPlaced([0, 1, 2, 3]); landCards.forEach((t, l) => board.current?.setLocalLand(l, t)); };
  const readyLands = () => { if (placed.some((x) => x === null)) return; void send({ t: 'lands', lanes: placed.map((i) => landCards[i!]) }); };
  useEffect(() => { if (landing && !P?.ready) { setPlaced([null, null, null, null]); board.current?.clearLocalLands(); } }, [landing, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- dragging: press a card, move, drop it on a lane or a target (a tap opens it up close instead) ----
  /** Where would this drop land, and is it allowed? */
  const dropAt = (d: DragWhat, x: number, y: number): { pick: BoardPick | null; ok: boolean; cast?: boolean } => {
    const b = board.current; if (!b || !v) return { pick: null, ok: false };
    const pick = b.pickAt(x, y);
    if (d.kind === 'land') return { pick, ok: !!pick && pick.side === side && pick.lane >= 0 };
    const c = CARD[d.id], s2 = asState(v);
    if (c.kind === 'spell' && (!c.target || c.target === 'none')) { const handTop = (document.querySelector('[data-testid=brawl-hand]') as HTMLElement | null)?.getBoundingClientRect().top ?? innerHeight * 0.75; return { pick: null, ok: y < handTop - 20, cast: true }; }
    if (!pick || pick.lane < 0) return { pick, ok: false };
    if (c.kind !== 'spell') return { pick, ok: pick.side === side && !check(s2, side, { t: 'play', uid: d.uid, lane: pick.lane }) };
    return { pick, ok: !check(s2, side, { t: 'play', uid: d.uid, target: pick }) };
  };
  const dragH = useRef({ dropAt, why: (_d: DragWhat) => {}, start: (_d: DragWhat) => {}, drop: (_d: DragWhat, _x: number, _y: number) => {}, tap: (_d: DragWhat) => {}, can: (_d: DragWhat) => false as boolean });
  dragH.current = {
    dropAt,
    why: (d) => { if (d.kind !== 'card') return; const c = CARD[d.id]; toast(!myTurn ? 'Wait for your turn' : busy ? 'One moment…' : `${c.name} needs ${c.cost} 💧 — you have ${P!.paint}`); },
    can: (d) => d.kind === 'land' ? !!landing && !P?.ready : myTurn && !busy && CARD[d.id].cost <= P!.paint,
    start: (d) => { setInspect(null); if (d.kind === 'card') setMode({ kind: 'card', uid: d.uid }); else setLandSel(null); sfx.tick(); },
    drop: (d, x, y) => {
      const r = dropAt(d, x, y);
      if (d.kind === 'land') { if (r.ok && r.pick) placeLand(d.i, r.pick.lane); return; }
      if (!r.ok) { setMode({ kind: 'idle' }); return; }
      if (r.cast) void send({ t: 'play', uid: d.uid });
      else if (CARD[d.id].kind !== 'spell') void send({ t: 'play', uid: d.uid, lane: r.pick!.lane });
      else void send({ t: 'play', uid: d.uid, target: { side: r.pick!.side, lane: r.pick!.lane } });
    },
    tap: (d) => { if (d.kind === 'card') selectCard(d.uid); else setLandSel((cur) => (cur === d.i ? null : d.i)); },
  };
  const pressStart = (d: DragWhat) => (e: React.PointerEvent) => { if (e.button > 0) return; press.current = { d, sx: e.clientX, sy: e.clientY, on: false, pid: e.pointerId }; };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = press.current; if (!r || r.pid !== e.pointerId) return;
      if (!r.on) { if (r.blocked || Math.hypot(e.clientX - r.sx, e.clientY - r.sy) < 12) return; if (!dragH.current.can(r.d)) { r.blocked = true; return; } r.on = true; dragH.current.start(r.d); }
      e.preventDefault();
      const at = dragH.current.dropAt(r.d, e.clientX, e.clientY);
      board.current?.hover(at.ok ? at.pick : null);
      setDrag({ ...r.d, x: e.clientX, y: e.clientY, ok: at.ok });
    };
    const up = (e: PointerEvent) => {
      const r = press.current; if (!r || r.pid !== e.pointerId) return; press.current = null;
      board.current?.hover(null); setDrag(null);
      if (r.on) dragH.current.drop(r.d, e.clientX, e.clientY);
      else if (r.blocked) dragH.current.why(r.d);
      else if (e.type === 'pointerup') dragH.current.tap(r.d);
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [board]);

  // tapping a card in your hand opens it up close (any time — even on their turn, even if you can't afford it yet)
  const selectCard = (uid: number) => {
    const h = P!.hand.find((x) => x.uid === uid); if (!h?.id) return;
    const c = CARD[h.id];
    if (mode.kind === 'card' && mode.uid === uid) {
      // tapping the card you're placing again: a spell that needs no target casts, anything else is put back
      if (c.kind === 'spell' && (!c.target || c.target === 'none')) void send({ t: 'play', uid });
      else setMode({ kind: 'idle' });
      return;
    }
    sfx.tick(); setMode({ kind: 'idle' }); setInspect(uid);
  };
  /** From the up-close view: play it (a lane or a target next, unless it needs neither). */
  const playInspected = () => {
    const h = P!.hand.find((x) => x.uid === inspect); if (!h?.id) return;
    const c = CARD[h.id]; setInspect(null);
    if (c.kind === 'spell' && (!c.target || c.target === 'none')) void send({ t: 'play', uid: h.uid });
    else setMode({ kind: 'card', uid: h.uid });
  };
  const showMe = async (id: string) => {
    const b = board.current; if (!b || showing) return;
    setShowing(true);
    try { await b.preview(id); } finally { setShowing(false); }
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
  const hint = landing ? (P.ready ? `Waiting for ${opp.username} to place their lands…` : landSel !== null ? 'Tap one of your lanes' : 'Drag your land cards onto your lanes') : !myTurn ? `${opp.username} is thinking…` : mode.kind === 'card' && selCard ? (selCard.kind !== 'spell' ? `Tap one of your lanes for ${selCard.name}` : !selCard.target || selCard.target === 'none' ? 'Tap the card again to cast it' : selCard.target === 'any_lane' ? 'Tap any lane' : 'Tap a target') : mode.kind === 'flourish' ? 'Tap a target' : canAfford ? 'Drag a card onto the board — tap to see it' : 'Out of paint — end your turn';
  const inspected = inspect !== null ? P.hand.find((h) => h.uid === inspect) : null;
  const inCard = inspected?.id ? CARD[inspected.id] : null;
  const canSketch = myTurn && !busy && P.paint >= 1 && P.deck > 0 && P.hand.length < HAND_MAX_UI;
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
          <div className="flex gap-1">
            <button onClick={() => board.current?.resetView()} title="Reset the camera (drag the board to look around)" className="rounded-xl bg-black/60 px-2.5 py-1.5 text-xs font-bold backdrop-blur" data-testid="brawl-resetview"><Camera className="inline h-3.5 w-3.5" /></button>
            <button onClick={() => setMenu(true)} className="rounded-xl bg-black/60 px-2.5 py-1.5 text-xs font-bold backdrop-blur" data-testid="brawl-menu"><Flag className="inline h-3.5 w-3.5" /></button>
          </div>
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
        <div className={cn('flex items-end justify-between gap-2', landing && 'hidden')}>
          <div className="flex items-center gap-2 rounded-2xl bg-black/65 px-3 py-1.5 backdrop-blur" data-testid="brawl-me">
            <span className="text-lg font-black text-[#7BFFAE]" data-testid="brawl-my-hp">❤️ {P.hero}</span>
            <div className="flex gap-0.5" data-testid="brawl-paint" aria-label={`${P.paint} paint`}>
              {P.paint > 8
                ? <span className="text-base font-black text-[#9FD0FF] drop-shadow-[0_0_6px_#3A86FF]">💧×{P.paint}</span>
                : Array.from({ length: Math.max(P.paint, Math.min(7, 1 + v.round)) }, (_, i) => <span key={i} className={cn('text-base transition', i < P.paint ? 'drop-shadow-[0_0_6px_#3A86FF]' : 'opacity-25 grayscale')}>💧</span>)}
            </div>
            <span className="text-[10px] text-white/60">🂠 {P.deck}</span>
            <button onClick={() => void send({ t: 'sketch' })} disabled={!canSketch} title="Spend 1 paint to draw a card"
              className="ml-1 flex items-center gap-0.5 rounded-lg bg-white/10 px-1.5 py-1 text-[10px] font-black text-[#9FE6FF] transition hover:bg-white/20 disabled:opacity-30" data-testid="brawl-sketch">
              <Pencil className="h-3 w-3" />+1 <span className="opacity-70">(1💧)</span>
            </button>
          </div>
          <div className="pointer-events-none min-w-0 flex-1 text-center text-[11px] font-bold leading-tight text-white/80 drop-shadow" data-testid="brawl-hint">{hint}</div>
          <button onClick={() => void send({ t: 'end' })} disabled={!myTurn || busy || landing}
            className={cn('h-12 rounded-2xl px-4 font-display text-base font-black shadow-lg transition disabled:opacity-40', myTurn && !canAfford ? 'animate-pulse bg-[#FFE14D] text-black' : 'bg-[#FF4FD8] text-white')} data-testid="brawl-end">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : myTurn ? 'End turn ⚔️' : 'Waiting…'}
          </button>
        </div>
        {landing ? (
          <div className="mx-auto grid w-full max-w-md justify-items-center gap-2 rounded-3xl bg-black/55 px-3 pb-2 pt-2 backdrop-blur" data-testid="brawl-lands">
            <div className="text-center"><div className="font-display text-lg font-black drop-shadow">{P.ready ? 'Lands ready!' : 'Place your lands'}</div>
              <div className="text-[11px] text-white/75">{P.ready ? 'The battle starts when both sides are ready.' : 'Each lane takes one land. Creatures get +1 attack on their own land. Drag the board to look around.'}</div></div>
            {!P.ready && (
              <div className="flex items-end justify-center gap-2">
                {landCards.map((t, i) => placed.includes(i) ? <div key={i} style={{ width: 74, height: 104 }} className="rounded-xl border-2 border-dashed border-white/20" /> : (
                  <CardView key={i} land={t} width={74} selected={landSel === i} glow={TERRAIN_INFO[t].color} onPointerDown={pressStart({ kind: 'land', i, t })} testid={`brawl-landcard-${i}`} style={drag?.kind === 'land' && drag.i === i ? { opacity: 0.25 } : undefined} />
                ))}
              </div>
            )}
            {!P.ready && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={autoLands} data-testid="brawl-lands-auto"><Shuffle className="h-3.5 w-3.5" />Place for me</Button>
                <Button variant="primary" size="sm" disabled={placed.some((x) => x === null) || busy} onClick={readyLands} data-testid="brawl-lands-ready">Ready ⚔️</Button>
              </div>
            )}
          </div>
        ) : (
        <div className="flex items-end justify-center gap-0 overflow-x-auto px-1 pb-1 pt-4 [scrollbar-width:none]" data-testid="brawl-hand">
          {hand.map((h, i) => {
            const c = h.id ? CARD[h.id] : null; if (!c) return null;
            const ok = myTurn && c.cost <= P.paint, sel = mode.kind === 'card' && mode.uid === h.uid;
            const fan = (i - (hand.length - 1) / 2) * 3.5;
            return (
              <div key={h.uid} className="-mx-1.5 transition-transform" style={{ transform: `rotate(${fan}deg) translateY(${Math.abs(fan) * 1.2}px)` }}>
                <CardView id={h.id} width={cw} selected={sel} dim={!ok} glow={ok && myTurn ? (c.fx ? '#FF7A20' : c.wonder ? '#FFE14D' : '#3A86FF') : undefined} onPointerDown={pressStart({ kind: 'card', uid: h.uid, id: h.id! })} testid={`brawl-card-${h.id}`} animate={sel || hand.length <= 6}
                  style={drag?.kind === 'card' && drag.uid === h.uid ? { opacity: 0.25 } : undefined} />
              </div>
            );
          })}
          {!hand.length && <div className="py-6 text-xs text-white/60">No cards in hand</div>}
        </div>
        )}
      </div>
      {selCard && !drag && (
        <div className="pointer-events-none absolute right-2 top-[18%] z-10 hidden sm:block"><CardView id={selCard.id} width={170} /></div>
      )}
      {drag && (
        <div className="pointer-events-none fixed z-40 transition-transform duration-100" style={{ left: drag.x, top: drag.y, transform: `translate(-50%, -75%) rotate(${drag.ok ? 0 : -6}deg) scale(${drag.ok ? 0.72 : 1})` }} data-testid="brawl-dragging">
          {drag.kind === 'land' ? <CardView land={drag.t} width={96} animate={false} glow={drag.ok ? '#3DDC97' : undefined} /> : <CardView id={drag.id} width={110} animate={false} glow={drag.ok ? '#3DDC97' : '#FF4D6D'} />}
        </div>
      )}

      {/* a card from your hand, up close: what it is, how it works, show me, play it */}
      {inCard && inspected && (
        <div className="absolute inset-0 z-30 flex items-end bg-gradient-to-t from-black/85 via-black/40 to-transparent" onClick={() => !showing && setInspect(null)} data-testid="brawl-inspect">
          <div className={cn('w-full p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))] transition-opacity', showing && 'pointer-events-none opacity-0')} onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto flex max-w-xl items-end gap-3">
              <div className="shrink-0 animate-[lv-pop_0.25s_ease-out]"><CardView id={inCard.id} width={Math.min(190, Math.max(140, innerWidth * 0.4))} /></div>
              <div className="min-w-0 flex-1 rounded-2xl bg-[#1A1030]/95 p-3 shadow-2xl ring-1 ring-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-lg font-black leading-tight">{inCard.name}</div>
                    <div className={cn('text-[11px] font-bold', inCard.fx ? 'text-[#FFB13D]' : inCard.wonder ? 'text-[#FFE9A8]' : 'text-white/60')}>{kindName(inCard)} · {inCard.terrain === 'neutral' ? 'Wanderer' : TERRAIN_INFO[inCard.terrain].name} · {inCard.cost} 💧</div>
                  </div>
                  <button onClick={() => setInspect(null)} className="rounded-full bg-white/10 p-1" aria-label="Close"><X className="h-4 w-4" /></button>
                </div>
                <ul className="mt-2 grid gap-1 text-[12px] leading-snug text-white/85" data-testid="brawl-explain">
                  {explain(inCard).map((line, i) => <li key={i} className="flex gap-1.5"><span className="text-white/40">•</span><span>{line}</span></li>)}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void showMe(inCard.id)} disabled={showing} data-testid="brawl-showme"><Play className="h-3.5 w-3.5" />Show me</Button>
                  {(() => {
                    const why = !myTurn ? 'Not your turn yet' : inCard.cost > P.paint ? `Needs ${inCard.cost} 💧 (you have ${P.paint})` : null;
                    const label = inCard.kind === 'spell' && (!inCard.target || inCard.target === 'none') ? `Cast it` : inCard.kind === 'spell' ? 'Aim it' : 'Place it';
                    return <Button variant="primary" size="sm" disabled={!!why || busy} onClick={playInspected} data-testid="brawl-playit">{why ?? `${label} (${inCard.cost} 💧)`}</Button>;
                  })()}
                </div>
              </div>
            </div>
          </div>
          {showing && <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs font-bold text-white/80 drop-shadow">Preview — nothing is played</div>}
        </div>
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
/** How a card works, in plain words. */
function explain(c: Card): string[] {
  const strip = (t: string) => t.replace(/^(Cataclysm|Wonder|Totem)\.\s*/, '');
  const T = c.terrain === 'neutral' ? null : TERRAIN_INFO[c.terrain];
  const aim: Partial<Record<Target, string>> = { enemy_unit: 'You pick an enemy creature.', any_unit: 'You pick any creature.', my_unit: 'You pick one of your creatures.', my_lane: 'You pick one of your lanes.', enemy_lane: 'You pick an enemy lane.', my_empty_lane: 'You pick one of your empty lanes.', any_lane: 'You pick any lane — it hits both sides of it.' };
  const out: string[] = [];
  if (c.fx) {
    out.push('Cataclysm: it changes the whole board the moment you cast it.', strip(c.text));
    if (c.target && aim[c.target]) out.push(aim[c.target]!);
    if (['eruption', 'earthquake', 'tidalwave', 'eclipse', 'blackhole', 'meteors'].includes(c.fx)) out.push('⚠️ It hits your side too — best when you’re behind.');
  } else if (c.wonder) {
    out.push('Wonder: a landmark rises behind one of your lanes and stays there.', strip(c.text), 'Building another totem or wonder in that lane replaces it.');
  } else if (c.kind === 'creature') {
    out.push(`A creature with ${c.atk} attack and ${c.hp} health. Place it in one of your lanes.`);
    out.push('When you end your turn it attacks the creature opposite — or the enemy hero if that lane is empty.');
    if (T) out.push(`+1 attack in a ${T.emoji} ${T.name} lane (its home).`);
    if (c.text) out.push(c.text);
    if (c.flourish) out.push(`✋ Flourish (${c.flourish.cost} 💧): ${c.flourish.text} Tap it on the board to use it — it skips its attack that turn.`);
  } else if (c.kind === 'totem') {
    out.push('A totem: it sits behind one of your lanes and keeps working.', strip(c.text));
  } else {
    out.push('A spell: it happens once, then it’s gone.', c.text);
    if (c.target && aim[c.target]) out.push(aim[c.target]!);
  }
  return out;
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
