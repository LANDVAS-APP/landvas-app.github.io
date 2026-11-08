// A Paintbrawl match: the 3D board (in BrawlScreen) plus everything on top — both heroes, the turn clock, your paint,
// your hand. Tap a card, then where it goes (a lane for creatures and totems, a target for spells); tap one of your
// creatures to Flourish it; End turn sends your creatures in. Every move goes to the server, comes back with what
// happened, and plays out on the board; the other player's moves arrive the same way (live, with a poll as backup).
import { live } from '../lib/poll';
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
import { CARD, EVENTS, HAND_MAX_UI, LANES, TERRAIN_INFO, kindName, kindStyle, type Card, type Target, type Terrain } from '../shared/brawl/cards';
import { check, type Action, type Ev, type Pick, type Side, type State, type View } from '../shared/brawl/engine';
import type { Board3D, BoardPick, Highlight } from './board3d';
import { CardView } from './CardView';
import { LabBar } from './Lab';
import { MusicButton } from './brawlMusic';
import type { MatchView, Rewards } from './types';

type Mode = { kind: 'idle' } | { kind: 'card'; uid: number } | { kind: 'flourish'; lane: number };
const asState = (v: View) => v as unknown as State;

export function Match({ id, board, me0, onLeave, onPack }: { id: string; board: React.RefObject<Board3D | null>; me0: string; onLeave(): void; onPack(): void }) {
  const qc = useQueryClient();
  const [mv, setMv] = useState<MatchView | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);           // a turn-changing move (end turn, lands, a choice) is on its way
  // moves sent but not answered yet: shown straight away (the card leaves your hand, the paint is spent)
  const [pending, setPending] = useState<{ uid: number; cost: number }[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const lastV = useRef(-1);
  const [banner, setBanner] = useState<{ text: string; sub?: string; color: string } | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [inspect, setInspect] = useState<number | null>(null); // a hand card being looked at up close
  const [showing, setShowing] = useState(false);              // its effect is playing on the board
  // dragging a card (or a land card) out of your hand onto the board
  type DragWhat = { kind: 'card'; uid: number; id: string } | { kind: 'land'; i: number; t: Terrain };
  const [drag, setDrag] = useState<(DragWhat & { x: number; y: number; ok: boolean; pick?: BoardPick | null; cast?: boolean }) | null>(null);
  /** a card held down (without moving): shown big until you let go */
  const [hold, setHold] = useState<string | null>(null);
  const holdTimer = useRef(0);
  const press = useRef<{ d: DragWhat; sx: number; sy: number; on: boolean; pid: number; blocked?: boolean; held?: boolean } | null>(null);
  // the land cards: which of your four goes in which lane (index into landCards), and the one picked up by a tap
  const [placed, setPlaced] = useState<(number | null)[]>([null, null, null, null]);
  const [landSel, setLandSel] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  // the screen's size (phones rotate; the address bar comes and goes)
  const [scr, setScr] = useState(() => ({ w: innerWidth, h: innerHeight }));
  useEffect(() => {
    const on = () => setScr({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on); addEventListener('orientationchange', on); visualViewport?.addEventListener('resize', on);
    return () => { removeEventListener('resize', on); removeEventListener('orientationchange', on); visualViewport?.removeEventListener('resize', on); };
  }, []);
  const narrow = scr.w < 400;
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<Rewards | null>(null);
  const shown = useRef(-1);           // the last log entry played on the board
  const chain = useRef(Promise.resolve());
  const chan = useRef<{ send(m: unknown): void; close(): void } | null>(null);
  const offset = useRef(0);
  const mvRef = useRef(mv); mvRef.current = mv;

  const side = mv?.side ?? 0, v = mv?.view;
  const myTurn = !!v && !v.over && v.turn === side && mv?.status === 'live';
  const P0 = v?.p[side], O = v?.p[side === 0 ? 1 : 0];
  const P = P0 && pending.length ? { ...P0, paint: Math.max(0, P0.paint - pending.reduce((n, x) => n + x.cost, 0)), hand: P0.hand.filter((h) => !pending.some((x) => x.uid === h.uid)) } : P0;
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
      } else if (!b?.previewing && next.view.v >= lastV.current) b?.setView(next.view);
      shown.current = Math.max(shown.current, ...next.view.log.map((l) => l.n), next.view.v);
      offset.current = Date.parse(next.server_time) - Date.now();
      lastV.current = Math.max(lastV.current, next.view.v);
      setMv((cur) => (!cur || next.view.v >= cur.view.v || next.status === 'over' ? next : cur));
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
    // (against a bot every move answers in the same call, so only a match against a person needs a backup check)
    const poll = setInterval(() => {
      const m = mvRef.current;
      if (!m || m.status === 'over' || m.bot || document.hidden) return;
      void refresh();
      if (!m.bot && m.deadline && Date.parse(m.deadline) - (Date.now() + offset.current) < -2500) void api.brawlOp({ op: 'tick', match: id }).then(() => { chan.current?.send({ t: 'v' }); void refresh(); }).catch(() => {});
    }, live(4000));
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(poll); clearInterval(clock); chan.current?.close(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Send a move. Plays go out at once and show straight away (the card leaves your hand while the server checks it);
   * moves are queued so several quick plays never get lost, and the board animates each reply as it arrives. Only
   * moves that hand the turn over (end turn, lands, a choice) wait for their answer before you can move again.
   */
  const send = (action: Action) => {
    if (busy) return Promise.resolve();
    const turnish = action.t === 'end' || action.t === 'lands' || action.t === 'choose';
    if (turnish) setBusy(true);
    const card = action.t === 'play' ? P0?.hand.find((h) => h.uid === action.uid)?.id : undefined;
    const pend = action.t === 'play' ? { uid: action.uid, cost: card ? CARD[card].cost : 0 } : null;
    if (pend) setPending((x) => [...x, pend]);
    setMode({ kind: 'idle' }); board.current?.highlight([]);
    queue.current = queue.current.then(async () => {
      try {
        const r = await api.brawlOp({ op: 'act', match: id, action });
        chan.current?.send({ t: 'v' }); // nudge the other player's device right away
        const cur = mvRef.current;
        if (cur) {
          const next: MatchView = { ...cur, view: r.view, v: r.view.v, status: r.view.over ? 'over' : 'live', winner: r.view.over ? r.view.winner : null, reason: r.view.over ? r.view.reason : null, rewards: r.rewards ?? null, server_time: new Date(Date.now() + offset.current).toISOString() };
          mvRef.current = next;
          setMv((m) => (!m || next.view.v >= m.view.v ? next : m)); // your hand and paint update now…
          void absorb(next);                                          // …while the board plays it out
        }
      } catch (e) { toast.error(friendly(toGameError(e).code) ?? toGameError(e).message); void refresh(); }
      finally {
        if (pend) setPending((x) => x.filter((p) => p !== pend));
        if (turnish) setBusy(false);
      }
    });
    return queue.current;
  };

  /** Leave: concede (the result shows), or if the server can't be reached, just go back to the arena. */
  const leave = () => {
    setMenu(false);
    if (mv?.status !== 'live') { onLeave(); return; }
    const out = setTimeout(onLeave, 8000);
    void api.brawlOp({ op: 'concede', match: id })
      .then((r: { view?: View; rewards?: Rewards | null }) => { clearTimeout(out); chan.current?.send({ t: 'v' }); if (r?.view && mvRef.current) void absorb({ ...mvRef.current, view: r.view, status: 'over', winner: r.view.winner ?? null, reason: r.view.reason ?? 'concede', rewards: r.rewards ?? null }); else void refresh(); })
      .catch(() => { clearTimeout(out); onLeave(); });
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
    // still over your hand: not dropped yet
    const handTop = (document.querySelector('[data-testid=brawl-hand], [data-testid=brawl-lands]') as HTMLElement | null)?.getBoundingClientRect().top ?? innerHeight * 0.75;
    if (y > handTop - 8) return { pick: null, ok: false };
    if (d.kind === 'land') { const pick = b.laneAt(x, y, true); return { pick, ok: !!pick }; }
    const c = CARD[d.id], s2 = asState(v);
    if (c.kind === 'spell' && (!c.target || c.target === 'none')) return { pick: null, ok: true, cast: true };
    // creatures and totems: whichever of your lanes is nearest the finger
    if (c.kind !== 'spell') { const pick = b.laneAt(x, y, true); return { pick, ok: !!pick && !check(s2, side, { t: 'play', uid: d.uid, lane: pick.lane }) }; }
    // aimed spells: the lane under the finger if it's a fair target, otherwise the nearest fair target (generously)
    const valid = (p: BoardPick) => !check(s2, side, { t: 'play', uid: d.uid, target: p });
    const under = b.laneAt(x, y); if (under && valid(under)) return { pick: under, ok: true };
    let best: BoardPick | null = null, bd = 150;
    for (const sd of [0, 1] as Side[]) for (let lane = -1; lane < LANES; lane++) { const p = { side: sd, lane }; if (!valid(p)) continue; const at = b.screenOf(sd, lane); const dd = Math.hypot(at.x - x, at.y - 30 - y); if (dd < bd) { bd = dd; best = p; } }
    return { pick: best, ok: !!best };
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
  const pressStart = (d: DragWhat) => (e: React.PointerEvent) => {
    if (e.button > 0) return; press.current = { d, sx: e.clientX, sy: e.clientY, on: false, pid: e.pointerId };
    clearTimeout(holdTimer.current);
    if (d.kind === 'card') holdTimer.current = window.setTimeout(() => { const r = press.current; if (r && !r.on && r.d === d) { setHold(d.id); r.held = true; } }, 320);
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = press.current; if (!r || r.pid !== e.pointerId) return;
      if (!r.on) { if (r.blocked || Math.hypot(e.clientX - r.sx, e.clientY - r.sy) < 12) return; clearTimeout(holdTimer.current); setHold(null); if (!dragH.current.can(r.d)) { r.blocked = true; return; } r.on = true; dragH.current.start(r.d); }
      e.preventDefault();
      const at = dragH.current.dropAt(r.d, e.clientX, e.clientY);
      board.current?.hover(at.ok ? at.pick : null);
      setDrag({ ...r.d, x: e.clientX, y: e.clientY, ok: at.ok, pick: at.pick, cast: at.cast });
    };
    const up = (e: PointerEvent) => {
      const r = press.current; if (!r || r.pid !== e.pointerId) return; press.current = null;
      clearTimeout(holdTimer.current); setHold(null);
      board.current?.hover(null); setDrag(null);
      if (r.on) dragH.current.drop(r.d, e.clientX, e.clientY);
      else if (r.held) return; // it was a look, not a tap
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
  const hint = landing ? (P.ready ? `Waiting for ${opp.username} to place their lands…` : landSel !== null ? 'Tap one of your lanes' : 'Drag your land cards onto your lanes') : !myTurn ? `${opp.username} is thinking…` : mode.kind === 'card' && selCard ? (selCard.kind !== 'spell' ? `Tap one of your lanes for ${selCard.name}` : !selCard.target || selCard.target === 'none' ? 'Tap the card again to cast it' : selCard.target === 'any_lane' ? 'Tap any lane' : 'Tap a target') : mode.kind === 'flourish' ? 'Tap a target' : canAfford ? 'Drag a card onto the board · hold it to read it' : 'Out of paint — end your turn';
  const inspected = inspect !== null ? P.hand.find((h) => h.uid === inspect) : null;
  const inCard = inspected?.id ? CARD[inspected.id] : null;
  const canSketch = myTurn && !busy && P.paint >= 1 && P.deck > 0 && P.hand.length < HAND_MAX_UI;
  const unitPeek = peek?.startsWith('unit:') ? Number(peek.slice(5)) : null;
  const hand = P.hand;
  // the hand always fits the width: the more cards, the more they overlap (never scrolled off the edge)
  const handW = Math.min(scr.w, 760) - 24 - Math.max(0, hand.length - 1) * 2;
  const stepOf = (n: number, w: number) => (n > 1 ? Math.min(w - 12, (handW - w) / (n - 1)) : w);
  const lw = Math.round(Math.max(50, Math.min(74, (scr.w - 60) / 4, (scr.h * 0.2) / 1.4)));
  // cards sized to the screen: narrow phones, tall phones and phones on their side all get a hand that fits
  const cw = Math.round(Math.max(56, Math.min(118, (Math.min(scr.w, 760) - 16) / Math.max(4.4, hand.length) + 14, (scr.h * 0.24) / 1.4)));
  const step = stepOf(hand.length, cw);
  // the fan dips the outer cards: leave room below so their numbers are never off the bottom of the screen
  const edgeFan = ((hand.length - 1) / 2) * 3.5;
  const dip = Math.ceil(edgeFan * 1.2 + (cw / 2) * Math.sin((edgeFan * Math.PI) / 180) + 4);

  return (
    <>
      {/* the top bar: leave, the other player, camera and music — sized to fit any phone */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-1.5 px-2 pb-2 pt-[max(8px,env(safe-area-inset-top,0px))] pl-[max(8px,env(safe-area-inset-left,0px))] pr-[max(8px,env(safe-area-inset-right,0px))]" data-testid="brawl-opp">
        <button onClick={() => setMenu(true)} aria-label="Leave the match" className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/65 backdrop-blur active:scale-95" data-testid="brawl-exit"><X className="h-5 w-5" /></button>
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl bg-black/60 px-2 py-1 backdrop-blur">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg" style={{ background: opp.accent_color ?? '#FF4FD8' }}>{opp.bot ? '🤖' : opp.rank?.emoji ?? '🎨'}</span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-black leading-tight">{opp.username}</div><div className="truncate text-[10px] text-white/70">{opp.bot ? (v.lab ? 'Card Lab' : 'Practice bot') : `${opp.rank.name} · 🏆 ${opp.trophies}`}</div></div>
          <span className="shrink-0 text-base font-black text-[#FF8AC2]" data-testid="brawl-opp-hp">❤️{O.hero}</span>
          {P.peek
            ? <div className="flex shrink-0 -space-x-3" data-testid="brawl-opp-hand">{O.hand.slice(0, narrow ? 4 : 8).map((h) => (h.id
              ? <button key={h.uid} className="pointer-events-auto" onClick={() => setHold((x) => (x === h.id ? null : h.id!))}><CardView id={h.id} width={28} animate={false} tilt={false} glow="#C89BFF" /></button>
              : <CardView key={h.uid} back width={20} animate={false} tilt={false} />))}{O.hand.length > (narrow ? 4 : 8) && <span className="z-10 self-center pl-3 text-[10px] font-black">+{O.hand.length - (narrow ? 4 : 8)}</span>}</div>
            : <span className="shrink-0 rounded-md bg-white/10 px-1 py-0.5 text-[10px] font-bold" data-testid="brawl-opp-hand" title="Cards in their hand">✋{O.hand.length}</span>}
          {!narrow && <span className="shrink-0 text-[10px] text-white/60">🂠{O.deck}</span>}
        </div>
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-1">
          <div className="flex gap-1">
            <button onClick={() => board.current?.resetView()} aria-label="Reset the camera" title="Reset the camera (drag the board to look around)" className="grid h-10 w-9 place-items-center rounded-xl bg-black/60 backdrop-blur" data-testid="brawl-resetview"><Camera className="h-4 w-4" /></button>
            <MusicButton className="grid h-10 w-9 place-items-center rounded-xl bg-black/60 text-xs font-bold backdrop-blur" />
          </div>
          {left !== null && <span className={cn('rounded-full px-2 py-0.5 text-xs font-black tabular-nums', left <= 10 ? 'animate-pulse bg-[#FF4D6D]' : 'bg-black/60')} data-testid="brawl-clock">⏱ {left}s</span>}
          <span className="whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold" title={EVENTS.find((x) => x.id === v.ev)?.text}>{EVENTS.find((x) => x.id === v.ev)?.emoji} R{v.round}</span>
        </div>
      </div>
      {P.peek && <div className="pointer-events-none absolute left-1/2 top-[calc(max(8px,env(safe-area-inset-top,0px))+48px)] z-10 -translate-x-1/2 rounded-full bg-[#C89BFF]/90 px-2 py-0.5 text-[10px] font-black text-black">👁️ Peeking at their hand</div>}

      {banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] z-20 grid justify-items-center" data-testid="brawl-banner">
          <div className="animate-[lv-pop_0.35s_ease-out] rounded-3xl bg-black/75 px-6 py-3 text-center backdrop-blur" style={{ boxShadow: `0 0 40px -6px ${banner.color}` }}>
            <div className="font-display text-3xl font-black" style={{ color: banner.color }}>{banner.text}</div>
            {banner.sub && <div className="mt-1 max-w-xs text-sm text-white/80">{banner.sub}</div>}
          </div>
        </div>
      )}

      {/* you */}
      <div className="absolute inset-x-0 bottom-0 z-10 grid gap-1.5 p-2 pb-[max(8px,env(safe-area-inset-bottom,0px))] pl-[max(8px,env(safe-area-inset-left,0px))] pr-[max(8px,env(safe-area-inset-right,0px))]">
        {!landing && <div className="pointer-events-none mx-auto max-w-[92%] truncate rounded-full bg-black/55 px-3 py-1 text-center text-[12px] font-bold text-white/90 backdrop-blur" data-testid="brawl-hint">{hint}</div>}
        {v.lab && !landing && <LabBar disabled={!myTurn || busy} handFull={P.hand.length >= HAND_MAX_UI} onCard={(card) => void send({ t: 'lab', card })} onPaint={() => void send({ t: 'lab', paint: true })} />}
        <div className={cn('flex items-end justify-between gap-2', landing && 'hidden')}>
          <div className="flex min-w-0 items-center gap-1.5 rounded-2xl bg-black/65 px-2.5 py-1.5 backdrop-blur" data-testid="brawl-me">
            <span className="whitespace-nowrap text-lg font-black text-[#7BFFAE]" data-testid="brawl-my-hp">❤️ {P.hero}</span>
            <div className="flex gap-0.5" data-testid="brawl-paint" aria-label={`${P.paint} paint`}>
              {P.paint > 7 || narrow
                ? <span className="whitespace-nowrap text-base font-black text-[#9FD0FF] drop-shadow-[0_0_6px_#3A86FF]">💧{P.paint > 7 ? `×${P.paint}` : `${P.paint}/${Math.max(P.paint, Math.min(7, 1 + v.round))}`}</span>
                : Array.from({ length: Math.max(P.paint, Math.min(7, 1 + v.round)) }, (_, i) => <span key={i} className={cn('text-base transition', i < P.paint ? 'drop-shadow-[0_0_6px_#3A86FF]' : 'opacity-25 grayscale')}>💧</span>)}
            </div>
            {!narrow && <span className="text-[10px] text-white/60">🂠 {P.deck}</span>}
            <button onClick={() => void send({ t: 'sketch' })} disabled={!canSketch} title="Spend 1 paint to draw a card"
              className="ml-1 flex items-center gap-0.5 rounded-lg bg-white/10 px-1.5 py-1 text-[10px] font-black text-[#9FE6FF] transition hover:bg-white/20 disabled:opacity-30" data-testid="brawl-sketch">
              <Pencil className="h-3 w-3" />+1{!narrow && <span className="opacity-70"> (1💧)</span>}
            </button>
          </div>
          <div className="flex-1" />
          <button onClick={() => void send({ t: 'end' })} disabled={!myTurn || busy || landing}
            className={cn('h-12 shrink-0 rounded-2xl px-3.5 font-display text-base font-black shadow-lg transition disabled:opacity-40', myTurn && !canAfford ? 'animate-pulse bg-[#FFE14D] text-black' : 'bg-[#FF4FD8] text-white')} data-testid="brawl-end">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : myTurn ? 'End turn ⚔️' : 'Waiting…'}
          </button>
        </div>
        {landing ? (
          <div className="mx-auto grid w-full max-w-md justify-items-center gap-2 rounded-3xl bg-black/55 px-3 pb-2 pt-2 backdrop-blur" data-testid="brawl-lands">
            <div className="text-center"><div className="font-display text-lg font-black drop-shadow">{P.ready ? 'Lands ready!' : 'Place your lands'}</div>
              <div className="text-[11px] text-white/75">{P.ready ? 'The battle starts when both sides are ready.' : 'Each lane takes one land. Creatures get +1 attack on their own land. Drag the board to look around.'}</div></div>
            {!P.ready && (
              <div className="flex items-end justify-center gap-2">
                {landCards.map((t, i) => placed.includes(i) ? <div key={i} style={{ width: lw, height: Math.round(lw * 1.4) }} className="rounded-xl border-2 border-dashed border-white/20" /> : (
                  <CardView key={i} land={t} width={lw} selected={landSel === i} glow={TERRAIN_INFO[t].color} onPointerDown={pressStart({ kind: 'land', i, t })} testid={`brawl-landcard-${i}`} style={drag?.kind === 'land' && drag.i === i ? { opacity: 0.25 } : undefined} />
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
        <div className="flex items-end justify-center gap-0 px-1 pt-4" style={{ paddingBottom: dip }} data-testid="brawl-hand">
          {hand.map((h, i) => {
            const c = h.id ? CARD[h.id] : null; if (!c) return null;
            const ok = myTurn && c.cost <= P.paint, sel = mode.kind === 'card' && mode.uid === h.uid;
            const fan = (i - (hand.length - 1) / 2) * 3.5;
            return (
              <div key={h.uid} className="transition-transform" style={{ marginLeft: i ? step - cw : 0, zIndex: sel ? 20 : i, transform: `rotate(${fan}deg) translateY(${Math.abs(fan) * 1.2}px)` }}>
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
        <div className="pointer-events-none fixed z-40 grid justify-items-center gap-1 transition-transform duration-100" style={{ left: drag.x, top: drag.y, transform: `translate(-50%, -88%) rotate(${drag.ok ? 0 : -6}deg) scale(${drag.ok ? 0.62 : 0.85})` }} data-testid="brawl-dragging">
          {drag.kind === 'land' ? <CardView land={drag.t} width={96} animate={false} glow={drag.ok ? '#3DDC97' : undefined} /> : <CardView id={drag.id} width={110} animate={false} glow={drag.ok ? '#3DDC97' : '#FF4D6D'} />}
        </div>
      )}
      {drag && drag.kind === 'card' && (() => {
        // what letting go would do, in words, right under the finger
        const c = CARD[drag.id], tgt = drag.pick && drag.pick.lane >= 0 ? v.p[drag.pick.side].lanes[drag.pick.lane].unit : null;
        const msg = !drag.ok ? (c.kind === 'spell' && c.target && c.target !== 'none' ? 'Drag onto a target' : c.kind === 'spell' ? 'Drag up onto the board' : 'Drag onto one of your lanes')
          : drag.cast ? `Let go to cast ${c.name}` : c.kind === 'spell' ? `Let go: ${tgt ? CARD[tgt.id].name : drag.pick?.lane === -1 ? 'the hero' : `lane ${drag.pick!.lane + 1}`}`
          : (() => {
            const L = v.p[side].lanes[drag.pick!.lane];
            if (c.kind === 'creature' && L.unit?.id === c.id && !L.unit.mega) return `Let go: FUSE into MEGA ${c.name}!`;
            if (c.kind === 'totem' && L.totem?.id === c.id && !c.wonder && (L.totem.lv ?? 1) < 2) return `Let go: stack it — LEVEL 2!`;
            if (c.kind === 'creature' && L.unit) return `Let go: replaces your ${CARD[L.unit.id].name}`;
            return `Let go: ${c.kind === 'totem' ? 'build in' : 'summon in'} lane ${drag.pick!.lane + 1}`;
          })();
        return <div className={cn('pointer-events-none fixed z-40 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-black shadow-lg', drag.ok ? 'bg-[#3DDC97] text-black' : 'bg-black/75 text-white')} style={{ left: drag.x, top: drag.y + 18 }} data-testid="brawl-drop-hint">{drag.ok ? '✓ ' : ''}{msg}</div>;
      })()}
      {(hold || (drag && drag.kind === 'card')) && (() => {
        // the card, big and readable, at the top of the screen while you hold or drag it
        const c = CARD[hold ?? (drag as { id: string }).id], K = kindStyle(c);
        return (
          <div className="pointer-events-none fixed inset-x-0 top-[max(8px,env(safe-area-inset-top,0px))] z-40 flex justify-center px-2" data-testid="brawl-hold">
            <div className={cn('flex items-start gap-2 rounded-2xl bg-black/80 p-2 shadow-2xl ring-2 backdrop-blur', !hold && 'scale-90 opacity-95')} style={{ ['--tw-ring-color' as string]: K.color, maxWidth: 440 }}>
              <CardView id={c.id} width={hold ? Math.min(190, innerWidth * 0.44) : 108} animate={false} tilt={false} />
              <div className="min-w-0 max-w-[220px] pt-1">
                <div className="font-display text-base font-black leading-tight">{c.name}</div>
                <div className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black text-black" style={{ background: K.color }}>{K.icon} {kindName(c)} · {c.cost} 💧</div>
                <div className="mt-1 text-[11px] font-bold text-white/70">{K.tip}</div>
                {hold && <ul className="mt-1.5 grid max-h-[46vh] gap-0.5 overflow-hidden text-[12px] leading-snug text-white/90">{explain(c).filter((l) => !l.startsWith('A creature with')).slice(0, 3).map((l, i) => <li key={i}>• {l}</li>)}</ul>}
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* a choice to make: which of the enemy's cards to steal */}
      {P.choice && myTurn && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 p-3 backdrop-blur-sm" data-testid="brawl-choice">
          <div className="grid w-full max-w-xl justify-items-center gap-3 text-center">
            <div className="text-5xl">🦝</div>
            <div className="font-display text-2xl font-black">Steal a card!</div>
            <div className="text-sm text-white/75">This is {opp.username}’s hand. Tap the one you want — it’s yours now.</div>
            <div className="flex flex-wrap justify-center gap-2">
              {P.choice.cards.map((h, i) => (
                <button key={h.uid} onClick={() => void send({ t: 'choose', i })} disabled={busy} className="transition hover:-translate-y-1" data-testid={`brawl-choose-${i}`}>
                  <CardView id={h.id} width={Math.min(112, (innerWidth - 40) / Math.min(5, P.choice!.cards.length) - 8)} tilt={false} glow="#FFE14D" />
                </button>
              ))}
            </div>
          </div>
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

      <Dialog open={menu} onOpenChange={setMenu} title="Leave the match?">
        <div className="grid gap-2" data-testid="brawl-leave-dialog">
          <p className="text-sm text-muted">{v.lab ? 'It’s only the Card Lab — nothing is won or lost.' : mv.bot ? 'Leaving counts as a loss against the practice bot.' : `Leaving counts as a loss — ${opp.username} wins.`}</p>
          <p className="text-xs text-muted">{EVENTS.find((x) => x.id === v.ev)?.emoji} <b>{EVENTS.find((x) => x.id === v.ev)?.name}:</b> {EVENTS.find((x) => x.id === v.ev)?.text}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setMenu(false)} data-testid="brawl-stay">Keep playing</Button>
            <Button variant="danger" onClick={leave} data-testid="brawl-leave"><Flag className="h-4 w-4" />Leave</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!result} onOpenChange={() => {}} title="">
        {result && (
          <div className="grid justify-items-center gap-3 text-center" data-testid="brawl-result">
            <div className="text-6xl">{result.result === 'win' ? '🏆' : result.result === 'draw' ? '🤝' : '💥'}</div>
            <div className={cn('font-display text-4xl font-black', result.result === 'win' ? 'text-[#FFE14D]' : result.result === 'draw' ? 'text-white' : 'text-[#FF8AC2]')}>{result.result === 'win' ? 'Victory!' : result.result === 'draw' ? 'A draw' : 'Defeat'}</div>
            <div className="text-sm text-muted">{mv.reason === 'concede' ? (result.result === 'win' ? `${opp.username} conceded` : 'You conceded') : mv.reason === 'timeout' ? 'Out of time' : mv.reason === 'rounds' ? 'The round limit was reached' : `${mine.username} vs ${opp.username}`}</div>
            <div className="flex flex-wrap justify-center gap-2 text-sm font-black">
              {result.lab ? <span className="rounded-full bg-[#0E7490] px-3 py-1 text-white">🧪 Card Lab test — nothing won or lost</span> : <span className="rounded-full bg-surface-2 px-3 py-1">💠 +{result.shards} shards</span>}
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
    out.push(`🧬 Fusion: play a second ${c.name} onto this one and they fuse into a MEGA ${c.name} (bigger, double stats).`);
  } else if (c.kind === 'totem') {
    out.push('A totem: it sits behind one of your lanes and keeps working.', strip(c.text), '⬆️ Play the same totem on it again to stack it to Level 2: twice the effect.');
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
