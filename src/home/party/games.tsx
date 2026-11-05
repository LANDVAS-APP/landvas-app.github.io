// The house party games: four board games and two party games, all live with the people in the home.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { type PartyDef, type Seat, dec, enc, norm, placesBy, rng, seatOf, secs } from './kit';
export { dec };
import { WORDS } from './words';

export const Turn = ({ seats, id, me, extra }: { seats: Seat[]; id: string | null; me: string; extra?: string }) => {
  const s = id ? seatOf(seats, id) : null;
  if (!s) return null;
  return (
    <div className={cn('mx-auto flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-black', id === me ? 'animate-pulse bg-white text-[#1C1512]' : 'bg-white/10')} data-testid="party-turn">
      <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />{id === me ? 'Your turn!' : `${s.name}’s turn`}{extra ? <span className="font-bold opacity-70">{extra}</span> : null}
    </div>
  );
};

// ======================================================================================================================
// Four in a Row
// ======================================================================================================================
type FR = { ids: string[]; b: number[]; turn: number; win: number[] | null; winner: number | null; last: number; moves: number };
const FR_C = 7, FR_R = 6;
function frLine(b: number[], i: number): number[] | null {
  const r = Math.floor(i / FR_C), c = i % FR_C, v = b[i];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [i];
    for (const s of [1, -1]) { let rr = r + dr * s, cc = c + dc * s; while (rr >= 0 && rr < FR_R && cc >= 0 && cc < FR_C && b[rr * FR_C + cc] === v) { cells.push(rr * FR_C + cc); rr += dr * s; cc += dc * s; } }
    if (cells.length >= 4) return cells;
  }
  return null;
}
export const fourrow: PartyDef<FR, { c: number }> = {
  id: 'fourrow', name: 'Four in a Row', emoji: '🔴', color: '#FF3D6E', min: 2, max: 2, kind: 'board',
  blurb: 'Drop discs and line up four before your rival does.', how: 'Tap a column to drop your disc. Four in a line — across, up or diagonal — wins.',
  init: (seats) => ({ ids: seats.map((s) => s.id), b: Array(FR_C * FR_R).fill(-1), turn: 0, win: null, winner: null, last: -1, moves: 0 }),
  move(s, by, m) {
    if (s.winner != null || s.ids[s.turn] !== by || !(m.c >= 0 && m.c < FR_C)) return false;
    let row = -1; for (let r = FR_R - 1; r >= 0; r--) if (s.b[r * FR_C + m.c] === -1) { row = r; break; }
    if (row < 0) return false;
    const i = row * FR_C + m.c; s.b[i] = s.turn; s.last = i; s.moves++;
    const w = frLine(s.b, i);
    if (w) { s.win = w; s.winner = s.turn; } else if (s.moves >= FR_C * FR_R) s.winner = -1; else s.turn = 1 - s.turn;
    return true;
  },
  result: (s) => (s.winner == null ? null : s.winner < 0 ? { [s.ids[0]]: 1, [s.ids[1]]: 1 } : { [s.ids[s.winner]]: 1, [s.ids[1 - s.winner]]: 2 }),
  turn: (s) => (s.winner == null ? s.ids[s.turn] : null),
  View({ s, me, seats, send }) {
    const mine = s.ids[s.turn] === me && s.winner == null;
    const [hover, setHover] = useState<number | null>(null);
    return (
      <div className="grid justify-items-center gap-3">
        <Turn seats={seats} id={fourrow.turn!(s)} me={me} />
        <div className="relative rounded-3xl bg-gradient-to-b from-[#3B5BDB] to-[#2C47B8] p-2 shadow-[0_12px_0_#1E3290,0_20px_40px_rgba(0,0,0,0.4)]" style={{ width: 'min(92vw, 420px)' }}>
          <div className="grid grid-cols-7 gap-1.5" onPointerLeave={() => setHover(null)}>
            {s.b.map((v, i) => {
              const c = i % FR_C, col = v >= 0 ? seatOf(seats, s.ids[v])?.color : undefined, won = s.win?.includes(i);
              return (
                <button key={i} disabled={!mine} onPointerEnter={() => setHover(c)} onClick={() => send({ c })} data-testid={`fr-${c}`}
                  className={cn('relative aspect-square rounded-full shadow-[inset_0_4px_8px_rgba(0,0,0,0.45)]', hover === c && mine ? 'bg-[#E9EEFF]' : 'bg-[#DCE4FF]')}>
                  {v >= 0 && <motion.span key={`${i}-${v}`} initial={i === s.last ? { y: -(Math.floor(i / FR_C) + 1) * 58 } : false} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                    className={cn('absolute inset-0 rounded-full shadow-[inset_0_-5px_0_rgba(0,0,0,0.25),inset_0_4px_0_rgba(255,255,255,0.35)]', won && 'ring-4 ring-white')} style={{ background: col }} />}
                </button>
              );
            })}
          </div>
        </div>
        {s.winner != null && <div className="font-display text-2xl font-black">{s.winner < 0 ? 'A draw!' : s.ids[s.winner] === me ? '🎉 You win!' : `${seatOf(seats, s.ids[s.winner])?.name} wins!`}</div>}
      </div>
    );
  },
};

// ======================================================================================================================
// Checkers
// ======================================================================================================================
type CK = { ids: string[]; b: number[]; turn: number; must: number | null; quiet: number; winner: number | null; last: [number, number] | null };
const ckSide = (v: number) => (v > 0 ? 0 : v < 0 ? 1 : -1);
function ckSteps(s: CK, from: number): { to: number; jump: number | null }[] {
  const v = s.b[from], side = ckSide(v); if (side < 0) return [];
  const r = Math.floor(from / 8), c = from % 8, king = Math.abs(v) === 2;
  const dirs = king ? [-1, 1] : [side === 0 ? -1 : 1];
  const out: { to: number; jump: number | null }[] = [];
  for (const dr of dirs) for (const dc of [-1, 1]) {
    const r1 = r + dr, c1 = c + dc; if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
    const i1 = r1 * 8 + c1;
    if (s.b[i1] === 0) out.push({ to: i1, jump: null });
    else if (ckSide(s.b[i1]) === 1 - side) { const r2 = r1 + dr, c2 = c1 + dc; if (r2 >= 0 && r2 <= 7 && c2 >= 0 && c2 <= 7 && s.b[r2 * 8 + c2] === 0) out.push({ to: r2 * 8 + c2, jump: i1 }); }
  }
  return out;
}
export function ckLegal(s: CK) {
  const side = s.turn, from = s.must != null ? [s.must] : s.b.map((v, i) => (ckSide(v) === side ? i : -1)).filter((i) => i >= 0);
  const all = from.flatMap((f) => ckSteps(s, f).map((m) => ({ from: f, ...m })));
  const caps = all.filter((m) => m.jump != null);
  return caps.length || s.must != null ? caps : all;
}
export const checkers: PartyDef<CK, { from: number; to: number }> = {
  id: 'checkers', name: 'Checkers', emoji: '⚫', color: '#E8D5A6', min: 2, max: 2, kind: 'board',
  blurb: 'The classic: jump your rival’s pieces, crown your kings.', how: 'Move diagonally forward. Jumps are a must (and can chain). Reach the far side to crown a king.',
  init(seats) {
    const b = Array(64).fill(0);
    for (let i = 0; i < 64; i++) { const r = Math.floor(i / 8), c = i % 8; if ((r + c) % 2 === 1) { if (r < 3) b[i] = -1; if (r > 4) b[i] = 1; } }
    return { ids: seats.map((x) => x.id), b, turn: 0, must: null, quiet: 0, winner: null, last: null };
  },
  move(s, by, m) {
    if (s.winner != null || s.ids[s.turn] !== by) return false;
    const mv = ckLegal(s).find((x) => x.from === m.from && x.to === m.to); if (!mv) return false;
    const v = s.b[mv.from]; s.b[mv.to] = v; s.b[mv.from] = 0; s.last = [mv.from, mv.to];
    let crowned = false;
    const r = Math.floor(mv.to / 8);
    if (Math.abs(v) === 1 && ((v > 0 && r === 0) || (v < 0 && r === 7))) { s.b[mv.to] = v * 2; crowned = true; }
    if (mv.jump != null) {
      s.b[mv.jump] = 0; s.quiet = 0;
      s.must = mv.to;
      if (!crowned && ckLegal(s).length) return true; // keep jumping
    } else s.quiet++;
    s.must = null; s.turn = 1 - s.turn;
    if (!ckLegal(s).length) s.winner = 1 - s.turn;
    else if (s.quiet >= 80) s.winner = -1;
    return true;
  },
  result: (s) => (s.winner == null ? null : s.winner < 0 ? { [s.ids[0]]: 1, [s.ids[1]]: 1 } : { [s.ids[s.winner]]: 1, [s.ids[1 - s.winner]]: 2 }),
  turn: (s) => (s.winner == null ? s.ids[s.turn] : null),
  score: (s) => ({ [s.ids[0]]: s.b.filter((v) => v > 0).length, [s.ids[1]]: s.b.filter((v) => v < 0).length }),
  View({ s, me, seats, send }) {
    const [pick, setPick] = useState<number | null>(null);
    const mySide = s.ids.indexOf(me), mine = mySide === s.turn && s.winner == null;
    const legal = useMemo(() => (mine ? ckLegal(s) : []), [s, mine]);
    useEffect(() => { if (s.must != null && mine) setPick(s.must); else setPick(null); }, [s.must, s.turn, mine]); // eslint-disable-line react-hooks/exhaustive-deps
    const flip = mySide === 1;
    const cells = Array.from({ length: 64 }, (_, k) => (flip ? 63 - k : k));
    const targets = pick != null ? legal.filter((m) => m.from === pick).map((m) => m.to) : [];
    const movable = new Set(legal.map((m) => m.from));
    const col = (side: number) => seatOf(seats, s.ids[side])?.color ?? '#fff';
    return (
      <div className="grid justify-items-center gap-3">
        <Turn seats={seats} id={checkers.turn!(s)} me={me} extra={s.must != null ? ' · keep jumping!' : legal.some((m) => m.jump != null) && mine ? ' · you must jump' : undefined} />
        <div className="rounded-2xl bg-[#5C3A21] p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]" style={{ width: 'min(92vw, 440px)' }}>
          <div className="grid grid-cols-8 overflow-hidden rounded-lg">
            {cells.map((i) => {
              const r = Math.floor(i / 8), c = i % 8, dark = (r + c) % 2 === 1, v = s.b[i];
              const isT = targets.includes(i), last = s.last?.includes(i);
              return (
                <button key={i} data-testid={`ck-${i}`} onClick={() => { if (isT && pick != null) { send({ from: pick, to: i }); setPick(null); } else if (movable.has(i)) setPick(i); }}
                  className={cn('relative aspect-square', dark ? 'bg-[#7A5230]' : 'bg-[#EAD7B0]', last && 'after:absolute after:inset-0 after:bg-yellow-300/25')}>
                  {isT && <span className="absolute inset-[34%] rounded-full bg-[#3DDC97]/80" />}
                  {v !== 0 && (
                    <motion.span layout layoutId={undefined} className={cn('absolute inset-[10%] grid place-items-center rounded-full shadow-[inset_0_-4px_0_rgba(0,0,0,0.3),0_3px_6px_rgba(0,0,0,0.4)]', pick === i && 'ring-4 ring-white', mine && movable.has(i) && pick !== i && 'ring-2 ring-white/60')}
                      style={{ background: col(ckSide(v)) }}>
                      <span className="absolute inset-[18%] rounded-full border-2 border-black/15" />
                      {Math.abs(v) === 2 && <span className="relative text-[min(4vw,18px)]">👑</span>}
                    </motion.span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {s.winner != null && <div className="font-display text-2xl font-black">{s.winner < 0 ? 'A draw!' : s.ids[s.winner] === me ? '🎉 You win!' : `${seatOf(seats, s.ids[s.winner])?.name} wins!`}</div>}
      </div>
    );
  },
};

// ======================================================================================================================
// Dots & Boxes
// ======================================================================================================================
type DB = { ids: string[]; n: number; h: number[]; v: number[]; box: number[]; turn: number; pts: number[]; ends: number; last: string | null };
const DB_TURN = 25_000;
function dbBoxesAround(s: DB, k: 'h' | 'v', i: number): number[] {
  const n = s.n, out: number[] = [];
  if (k === 'h') { const r = Math.floor(i / n), c = i % n; if (r > 0) out.push((r - 1) * n + c); if (r < n) out.push(r * n + c); }
  else { const r = Math.floor(i / (n + 1)), c = i % (n + 1); if (c > 0) out.push(r * n + c - 1); if (c < n) out.push(r * n + c); }
  return out;
}
const dbDone = (s: DB, b: number) => { const n = s.n, r = Math.floor(b / n), c = b % n; return s.h[r * n + c] >= 0 && s.h[(r + 1) * n + c] >= 0 && s.v[r * (n + 1) + c] >= 0 && s.v[r * (n + 1) + c + 1] >= 0; };
function dbPlay(s: DB, k: 'h' | 'v', i: number, now: number) {
  (k === 'h' ? s.h : s.v)[i] = s.turn; s.last = `${k}${i}`;
  let got = 0;
  for (const b of dbBoxesAround(s, k, i)) if (s.box[b] < 0 && dbDone(s, b)) { s.box[b] = s.turn; s.pts[s.turn]++; got++; }
  if (!got) s.turn = (s.turn + 1) % s.ids.length;
  s.ends = now + DB_TURN;
}
export const dots: PartyDef<DB, { k: 'h' | 'v'; i: number }> = {
  id: 'dots', name: 'Dots & Boxes', emoji: '🔲', color: '#22B8CF', min: 2, max: 4, kind: 'board',
  blurb: 'Draw lines, close boxes, steal the board.', how: 'Draw one line a turn. Close a box to claim it — and go again. Most boxes wins.',
  init: (seats) => { const n = seats.length > 2 ? 6 : 5; return { ids: seats.map((x) => x.id), n, h: Array((n + 1) * n).fill(-1), v: Array(n * (n + 1)).fill(-1), box: Array(n * n).fill(-1), turn: 0, pts: seats.map(() => 0), ends: DB_TURN, last: null }; },
  move(s, by, m, now) {
    if (s.ids[s.turn] !== by || s.box.every((b) => b >= 0)) return false;
    const arr = m.k === 'h' ? s.h : s.v; if (!(m.i >= 0 && m.i < arr.length) || arr[m.i] >= 0) return false;
    dbPlay(s, m.k, m.i, now); return true;
  },
  tick(s, now) {
    // out of time: a line is drawn for you (one that doesn't hand over a box, if there is one)
    if (now < s.ends || s.box.every((b) => b >= 0)) return false;
    const free = [...s.h.map((x, i) => (x < 0 ? ['h', i] as const : null)), ...s.v.map((x, i) => (x < 0 ? ['v', i] as const : null))].filter(Boolean) as ['h' | 'v', number][];
    const safe = free.filter(([k, i]) => dbBoxesAround(s, k, i).every((b) => { const n = s.n, r = Math.floor(b / n), c = b % n; return [s.h[r * n + c], s.h[(r + 1) * n + c], s.v[r * (n + 1) + c], s.v[r * (n + 1) + c + 1]].filter((x) => x >= 0).length < 2; }));
    const pick = (safe.length ? safe : free)[Math.floor(rng(now)() * (safe.length || free.length))];
    if (pick) dbPlay(s, pick[0], pick[1], now);
    return true;
  },
  result: (s) => (s.box.every((b) => b >= 0) ? placesBy(Object.fromEntries(s.ids.map((id, i) => [id, s.pts[i]]))) : null),
  turn: (s) => (s.box.every((b) => b >= 0) ? null : s.ids[s.turn]),
  score: (s) => Object.fromEntries(s.ids.map((id, i) => [id, s.pts[i]])),
  View({ s, me, seats, send, now }) {
    const n = s.n, S = 340, pad = 18, step = (S - pad * 2) / n, mine = s.ids[s.turn] === me;
    const col = (slot: number) => seatOf(seats, s.ids[slot])?.color ?? '#fff';
    const line = (k: 'h' | 'v', i: number) => {
      const owner = (k === 'h' ? s.h : s.v)[i];
      const [x1, y1, x2, y2] = k === 'h' ? [pad + (i % n) * step, pad + Math.floor(i / n) * step, pad + (i % n + 1) * step, pad + Math.floor(i / n) * step] : [pad + (i % (n + 1)) * step, pad + Math.floor(i / (n + 1)) * step, pad + (i % (n + 1)) * step, pad + (Math.floor(i / (n + 1)) + 1) * step];
      return (
        <g key={`${k}${i}`} data-testid={`db-${k}${i}`} onClick={() => owner < 0 && mine && send({ k, i })} className={owner < 0 && mine ? 'cursor-pointer' : ''}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={owner >= 0 ? col(owner) : 'rgba(255,255,255,0.12)'} strokeWidth={owner >= 0 ? 6 : 4} strokeLinecap="round"
            className={cn(owner < 0 && mine && 'hover:stroke-white/60', s.last === `${k}${i}` && 'animate-pulse')} />
        </g>
      );
    };
    return (
      <div className="grid justify-items-center gap-3">
        <Turn seats={seats} id={dots.turn!(s)} me={me} extra={` · ${secs(s.ends - now)}s`} />
        <svg viewBox={`0 0 ${S} ${S}`} className="rounded-3xl bg-[#14213D] shadow-2xl" style={{ width: 'min(92vw, 440px)' }}>
          {s.box.map((o, b) => o >= 0 && (
            <motion.rect key={b} initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ transformOrigin: `${pad + (b % n + 0.5) * step}px ${pad + (Math.floor(b / n) + 0.5) * step}px` }}
              x={pad + (b % n) * step + 4} y={pad + Math.floor(b / n) * step + 4} width={step - 8} height={step - 8} rx={8} fill={col(o)} opacity={0.75} />
          ))}
          {s.h.map((_, i) => line('h', i))}{s.v.map((_, i) => line('v', i))}
          {Array.from({ length: (n + 1) * (n + 1) }, (_, k) => <circle key={k} cx={pad + (k % (n + 1)) * step} cy={pad + Math.floor(k / (n + 1)) * step} r={5} fill="#fff" />)}
        </svg>
      </div>
    );
  },
};

// ======================================================================================================================
// Ladders & Slides
// ======================================================================================================================
export const LADDERS: Record<number, number> = { 2: 23, 8: 34, 20: 77, 32: 68, 41: 79, 74: 88, 82: 100, 85: 95 };
export const SLIDES: Record<number, number> = { 29: 9, 38: 15, 47: 5, 53: 33, 62: 37, 86: 54, 92: 70, 97: 25 };
type LS = { ids: string[]; pos: number[]; turn: number; dice: number | null; rolls: number; seed: number; ends: number; done: number[]; last: { who: number; from: number; to: number; via: number | null } | null; over: boolean };
const LS_TURN = 12_000;
function lsRoll(s: LS, now: number) {
  const r = rng(s.seed + s.rolls * 7919)(); s.rolls++;
  const d = 1 + Math.floor(r * 6), who = s.turn, from = s.pos[who];
  let to = from + d; if (to > 100) to = from; // need the exact roll to land on 100
  let via: number | null = null;
  if (LADDERS[to]) { via = to; to = LADDERS[to]; } else if (SLIDES[to]) { via = to; to = SLIDES[to]; }
  s.pos[who] = to; s.dice = d; s.last = { who, from, to, via };
  if (to === 100) { s.done.push(who); s.over = true; }
  else if (d !== 6) s.turn = (s.turn + 1) % s.ids.length;
  s.ends = now + LS_TURN;
}
const lsXY = (n: number) => { const k = Math.max(1, n) - 1, row = Math.floor(k / 10), col = row % 2 ? 9 - (k % 10) : k % 10; return { x: col * 10 + 5, y: (9 - row) * 10 + 5 }; };
export const ladders: PartyDef<LS, { roll: true }> = {
  id: 'ladders', name: 'Ladders & Slides', emoji: '🪜', color: '#3DDC97', min: 2, max: 6, kind: 'board',
  blurb: 'Roll, climb the ladders, dodge the slides. First to 100!', how: 'Roll the die on your turn. Ladders take you up, slides send you down. Roll a 6 to go again; land exactly on 100 to win.',
  init: (seats, seed) => ({ ids: seats.map((x) => x.id), pos: seats.map(() => 1), turn: 0, dice: null, rolls: 0, seed, ends: LS_TURN, done: [], last: null, over: false }),
  move(s, by, m, now) { if (s.over || s.ids[s.turn] !== by || !m.roll) return false; lsRoll(s, now); return true; },
  tick(s, now) { if (s.over || now < s.ends) return false; lsRoll(s, now); return true; },
  result(s) {
    if (!s.over) return null;
    const pts: Record<string, number> = {}; s.ids.forEach((id, i) => { pts[id] = s.pos[i]; });
    return placesBy(pts);
  },
  turn: (s) => (s.over ? null : s.ids[s.turn]),
  score: (s) => Object.fromEntries(s.ids.map((id, i) => [id, s.pos[i]])),
  View({ s, me, seats, send, now }) {
    const mine = s.ids[s.turn] === me && !s.over;
    const [spin, setSpin] = useState(false);
    const lastKey = s.rolls;
    useEffect(() => { if (!lastKey) return; setSpin(true); const t = setTimeout(() => setSpin(false), 450); return () => clearTimeout(t); }, [lastKey]);
    const tiles = Array.from({ length: 100 }, (_, i) => i + 1);
    const lastWho = s.last ? seatOf(seats, s.ids[s.last.who]) : null;
    return (
      <div className="grid justify-items-center gap-3">
        <Turn seats={seats} id={ladders.turn!(s)} me={me} extra={` · ${secs(s.ends - now)}s`} />
        <div className="relative rounded-2xl bg-[#FFF7E6] p-1.5 shadow-2xl" style={{ width: 'min(92vw, 440px)' }}>
          <svg viewBox="0 0 100 100" className="block w-full">
            {tiles.map((n) => { const { x, y } = lsXY(n); const k = n % 2; return <g key={n}><rect x={x - 5} y={y - 5} width={10} height={10} fill={n === 100 ? '#FFD84D' : k ? '#FFE8C2' : '#FFF4DE'} /><text x={x - 4} y={y - 2} fontSize={2.6} fill="#B39A7A" fontWeight={700}>{n}</text></g>; })}
            {Object.entries(LADDERS).map(([a, b]) => { const p = lsXY(+a), q = lsXY(b); const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy), nx = (-dy / l) * 1.6, ny = (dx / l) * 1.6; return (
              <g key={`l${a}`} stroke="#8B5A2B" strokeWidth={0.9} strokeLinecap="round">
                <line x1={p.x + nx} y1={p.y + ny} x2={q.x + nx} y2={q.y + ny} /><line x1={p.x - nx} y1={p.y - ny} x2={q.x - nx} y2={q.y - ny} />
                {Array.from({ length: Math.floor(l / 3.2) }, (_, k) => { const t = (k + 0.5) / Math.floor(l / 3.2); return <line key={k} x1={p.x + dx * t + nx} y1={p.y + dy * t + ny} x2={p.x + dx * t - nx} y2={p.y + dy * t - ny} strokeWidth={0.6} />; })}
              </g>); })}
            {Object.entries(SLIDES).map(([a, b], k) => { const p = lsXY(+a), q = lsXY(b); const mx = (p.x + q.x) / 2 + (k % 2 ? 9 : -9), my = (p.y + q.y) / 2; const cols = ['#FF5FA2', '#22B8CF', '#8B5CFF', '#FFB13D']; return (
              <g key={`s${a}`}><path d={`M${p.x} ${p.y} Q${mx} ${my} ${q.x} ${q.y}`} stroke={cols[k % 4]} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.85} /><path d={`M${p.x} ${p.y} Q${mx} ${my} ${q.x} ${q.y}`} stroke="#fff" strokeWidth={0.6} fill="none" strokeDasharray="1.5 2" opacity={0.7} /></g>); })}
            {s.pos.map((pv, i) => { const { x, y } = lsXY(pv); const o = (i - (s.ids.length - 1) / 2) * 1.6; return (
              <motion.g key={s.ids[i]} animate={{ x: x + o, y: y + (i % 2) * 1.2 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} initial={false}>
                <circle r={2.9} fill={seatOf(seats, s.ids[i])?.color} stroke="#fff" strokeWidth={0.7} />
                {s.ids[i] === me && <circle r={4} fill="none" stroke="#1C1512" strokeWidth={0.5} strokeDasharray="1 1" />}
              </motion.g>); })}
          </svg>
        </div>
        <div className="flex items-center gap-3">
          <motion.div animate={spin ? { rotate: [0, 200, 360], scale: [1, 1.2, 1] } : {}} transition={{ duration: 0.45 }} className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-3xl font-black text-[#1C1512] shadow-[0_5px_0_#C9C2B8]" data-testid="ls-dice">{['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][s.dice ?? 0] || '🎲'}</motion.div>
          {mine ? <button onClick={() => send({ roll: true })} className="rounded-2xl bg-gradient-to-br from-[#3DDC97] to-[#22B8CF] px-6 py-3 font-display text-xl font-black shadow-lg" data-testid="ls-roll">Roll!</button>
            : <span className="text-sm text-white/70">{s.over ? '' : 'Waiting for their roll…'}</span>}
        </div>
        {s.last && lastWho && <p className="text-center text-sm text-white/80">{lastWho.id === me ? 'You' : lastWho.name} rolled {s.dice}{s.last.via != null ? (LADDERS[s.last.via] ? ` — up a ladder to ${s.last.to}! 🪜` : ` — down a slide to ${s.last.to} 😱`) : ` → ${s.last.to}`}{s.dice === 6 && !s.over ? ' · roll again!' : ''}</p>}
        {s.over && <div className="font-display text-2xl font-black">{s.ids[s.done[0]] === me ? '🎉 You reached 100!' : `${seatOf(seats, s.ids[s.done[0]])?.name} reached 100!`}</div>}
      </div>
    );
  },
};

// ======================================================================================================================
// Doodle Guess
// ======================================================================================================================
type Stroke = { id: string; c: string; w: number; p: number[] };
type DG = { ids: string[]; round: number; rounds: number; drawer: number; wz: string; len: number; hint: number[]; phase: 'draw' | 'reveal' | 'done'; ends: number; drawFor: number;
  strokes: Stroke[]; got: Record<string, number>; chat: { id: string; t: string; ok?: boolean }[]; pts: Record<string, number>; seed: number; used: number[] };
const DG_DRAW = 70_000, DG_REVEAL = 4500;
function dgStart(s: DG, now: number) {
  const r = rng(s.seed + s.round * 31);
  let k = Math.floor(r() * WORDS.length); while (s.used.includes(k)) k = (k + 1) % WORDS.length;
  s.used.push(k); const w = WORDS[k];
  s.drawer = s.round % s.ids.length; s.wz = enc(w); s.len = w.length; s.hint = []; s.phase = 'draw'; s.ends = now + DG_DRAW; s.drawFor = DG_DRAW; s.strokes = []; s.got = {};
}
export const doodle: PartyDef<DG, { k: 'pts'; sid: string; c: string; w: number; p: number[] } | { k: 'clear' } | { k: 'undo' } | { k: 'guess'; t: string }> = {
  id: 'doodle', name: 'Doodle Guess', emoji: '✏️', color: '#FFB13D', min: 3, max: 8, kind: 'party',
  blurb: 'One draws, everyone guesses. Quick!', how: 'When it’s your turn, draw the secret word — no letters! Everyone else types guesses. Faster guesses score more, and the artist scores for every right guess.',
  init(seats, seed) { const s: DG = { ids: seats.map((x) => x.id), round: 0, rounds: Math.min(seats.length, 6), drawer: 0, wz: '', len: 0, hint: [], phase: 'draw', ends: 0, drawFor: DG_DRAW, strokes: [], got: {}, chat: [], pts: Object.fromEntries(seats.map((x) => [x.id, 0])), seed, used: [] }; dgStart(s, 0); return s; },
  move(s, by, m, now) {
    if (s.phase !== 'draw') return false;
    const drawer = s.ids[s.drawer];
    if (m.k === 'guess') {
      if (by === drawer || s.got[by] != null) return false;
      const t = String(m.t ?? '').slice(0, 40).trim(); if (!t) return false;
      const word = dec(s.wz);
      if (norm(t) === norm(word)) {
        const left = Math.max(0, s.ends - now) / s.drawFor;
        s.got[by] = now; s.pts[by] += 5 + Math.round(10 * left); s.pts[drawer] += 3;
        s.chat.push({ id: by, t: 'guessed it!', ok: true });
        if (Object.keys(s.got).length >= s.ids.length - 1) { s.phase = 'reveal'; s.ends = now + DG_REVEAL; }
      } else s.chat.push({ id: by, t });
      s.chat = s.chat.slice(-14); return true;
    }
    if (by !== drawer) return false;
    if (m.k === 'clear') { s.strokes = []; return true; }
    if (m.k === 'undo') { s.strokes.pop(); return true; }
    if (m.k === 'pts' && Array.isArray(m.p)) {
      const total = s.strokes.reduce((a, x) => a + x.p.length, 0); if (total > 9000) return false;
      const p = m.p.slice(0, 400).map((v) => Math.max(0, Math.min(1000, Math.round(+v || 0))));
      const ex = s.strokes.find((x) => x.id === m.sid);
      if (ex) ex.p.push(...p); else s.strokes.push({ id: String(m.sid).slice(0, 16), c: /^#[0-9a-fA-F]{6}$/.test(m.c) ? m.c : '#1C1512', w: Math.max(2, Math.min(28, +m.w || 6)), p });
      return true;
    }
    return false;
  },
  tick(s, now) {
    if (s.phase === 'done') return false;
    if (s.phase === 'draw') {
      // a letter as a hint halfway through, another near the end
      const word = dec(s.wz), left = s.ends - now;
      const want = left < s.drawFor * 0.25 ? 2 : left < s.drawFor * 0.5 ? 1 : 0;
      if (s.hint.length < Math.min(want, Math.max(0, word.length - 2))) { const r = rng(s.seed + s.round * 97 + s.hint.length); let i = Math.floor(r() * word.length); while (s.hint.includes(i) || word[i] === ' ') i = (i + 1) % word.length; s.hint.push(i); return true; }
      if (now >= s.ends) { s.phase = 'reveal'; s.ends = now + DG_REVEAL; return true; }
      return false;
    }
    if (now < s.ends) return false;
    s.round++;
    if (s.round >= s.rounds) { s.phase = 'done'; return true; }
    dgStart(s, now); return true;
  },
  result: (s) => (s.phase === 'done' ? placesBy(s.pts) : null),
  turn: (s) => (s.phase === 'draw' ? s.ids[s.drawer] : null),
  score: (s) => s.pts,
  View({ s, me, seats, send, now }) {
    const drawer = s.ids[s.drawer], amDrawer = drawer === me && s.phase === 'draw';
    const word = dec(s.wz);
    const cv = useRef<HTMLCanvasElement>(null);
    const [color, setColor] = useState('#1C1512');
    const [size, setSize] = useState(6);
    const [guess, setGuess] = useState('');
    const local = useRef<Stroke | null>(null), pend = useRef<number[]>([]), sid = useRef(0);
    // draw whatever we have (and my own stroke straight away)
    useEffect(() => {
      const c = cv.current; if (!c) return; const g = c.getContext('2d')!;
      g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, c.width, c.height); g.lineCap = 'round'; g.lineJoin = 'round';
      const k = c.width / 1000;
      const all = [...s.strokes]; if (local.current && !all.some((x) => x.id === local.current!.id)) all.push(local.current);
      for (const st of all) {
        const ex = local.current && st.id === local.current.id ? local.current : st;
        g.strokeStyle = ex.c; g.lineWidth = ex.w * k; g.beginPath();
        for (let i = 0; i < ex.p.length; i += 2) { const x = ex.p[i] * k, y = ex.p[i + 1] * k * 0.75; if (i === 0) { g.moveTo(x, y); g.lineTo(x + 0.01, y); } else g.lineTo(x, y); }
        g.stroke();
      }
    });
    useEffect(() => { if (!amDrawer) return; const iv = setInterval(() => { if (pend.current.length && local.current) { send({ k: 'pts', sid: local.current.id, c: local.current.c, w: local.current.w, p: pend.current }); pend.current = []; } }, 110); return () => clearInterval(iv); }, [amDrawer]); // eslint-disable-line react-hooks/exhaustive-deps
    const pt = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 750 / 0.75)]; };
    const [, force] = useState(0);
    const COLORS = ['#1C1512', '#FF3D3D', '#FFB13D', '#FFE14D', '#3DDC97', '#22B8CF', '#4C6EF5', '#8B5CFF', '#FF5FA2', '#8B5A2B', '#FFFFFF'];
    const masked = word.split('').map((ch, i) => (ch === ' ' ? ' ' : s.hint.includes(i) || s.phase !== 'draw' || amDrawer || s.got[me] != null ? ch : '_')).join('');
    return (
      <div className="grid w-full max-w-lg justify-items-center gap-2">
        <div className="flex w-full items-center justify-between gap-2 text-sm">
          <span className="rounded-full bg-white/10 px-3 py-1 font-bold">Round {Math.min(s.round + 1, s.rounds)}/{s.rounds}</span>
          <span className="font-display text-xl font-black tracking-[0.25em]" data-testid="dg-word">{s.phase === 'done' ? '' : amDrawer ? word.toUpperCase() : masked.toUpperCase()}</span>
          <span className="rounded-full bg-white/10 px-3 py-1 font-bold tabular-nums">{s.phase === 'draw' ? `${secs(s.ends - now)}s` : ''}</span>
        </div>
        <div className="text-xs text-white/70">{s.phase === 'reveal' ? `The word was “${word}”` : amDrawer ? 'You’re drawing — no letters or numbers!' : `${seatOf(seats, drawer)?.name ?? ''} is drawing`}</div>
        <div className="relative w-full overflow-hidden rounded-2xl shadow-2xl">
          <canvas ref={cv} width={800} height={600} className={cn('block w-full touch-none bg-[#FFFDF7]', amDrawer && 'cursor-crosshair')} data-testid="dg-canvas"
            onPointerDown={(e) => { if (!amDrawer) return; (e.target as Element).setPointerCapture(e.pointerId); const [x, y] = pt(e); local.current = { id: `${me.slice(0, 6)}${sid.current++}`, c: color, w: size, p: [x, y] }; pend.current = [x, y]; force((n) => n + 1); }}
            onPointerMove={(e) => { if (!amDrawer || !local.current) return; const [x, y] = pt(e); local.current.p.push(x, y); pend.current.push(x, y); force((n) => n + 1); }}
            onPointerUp={() => { if (local.current && pend.current.length) { send({ k: 'pts', sid: local.current.id, c: local.current.c, w: local.current.w, p: pend.current }); pend.current = []; } local.current = null; }} />
          <AnimatePresence>{s.phase === 'reveal' && <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-black/40"><div className="rounded-2xl bg-white px-5 py-3 font-display text-3xl font-black text-[#1C1512]">{word}</div></motion.div>}</AnimatePresence>
        </div>
        {amDrawer ? (
          <div className="flex w-full flex-wrap items-center gap-1.5">
            {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={cn('h-7 w-7 rounded-full border-2', color === c ? 'scale-110 border-white' : 'border-white/30')} style={{ background: c }} aria-label={`Colour ${c}`} />)}
            {[4, 8, 16].map((w) => <button key={w} onClick={() => setSize(w)} className={cn('grid h-8 w-8 place-items-center rounded-full bg-white/10', size === w && 'ring-2 ring-white')} aria-label={`Size ${w}`}><span className="rounded-full bg-white" style={{ width: w / 1.5 + 2, height: w / 1.5 + 2 }} /></button>)}
            <button onClick={() => send({ k: 'undo' })} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">Undo</button>
            <button onClick={() => send({ k: 'clear' })} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">Clear</button>
          </div>
        ) : s.phase === 'draw' && (
          <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); if (guess.trim() && s.got[me] == null) { send({ k: 'guess', t: guess }); setGuess(''); } }}>
            <input value={guess} onChange={(e) => setGuess(e.target.value)} maxLength={40} disabled={s.got[me] != null} placeholder={s.got[me] != null ? 'You got it! 🎉' : 'Type your guess…'} className="h-11 flex-1 rounded-xl bg-white px-3 text-[#1C1512]" data-testid="dg-guess" />
            <button className="rounded-xl bg-[#FFB13D] px-4 font-black text-[#2A1A08]" disabled={s.got[me] != null}>Guess</button>
          </form>
        )}
        <div className="flex max-h-28 w-full flex-col gap-0.5 overflow-y-auto text-sm" data-testid="dg-chat">
          {s.chat.slice(-6).map((c, i) => <div key={i} className={cn(c.ok && 'font-bold text-[#7DFFB2]')}><b style={{ color: seatOf(seats, c.id)?.color }}>{c.id === me ? 'You' : seatOf(seats, c.id)?.name}</b> {c.t}</div>)}
        </div>
      </div>
    );
  },
};

// ======================================================================================================================
// Colour Rush
// ======================================================================================================================
const RUSH = [{ n: 'RED', c: '#FF3D3D' }, { n: 'BLUE', c: '#3D7BFF' }, { n: 'GREEN', c: '#2FC46B' }, { n: 'YELLOW', c: '#FFD21F' }, { n: 'PURPLE', c: '#9B5CFF' }, { n: 'ORANGE', c: '#FF8A1F' }];
type CR = { ids: string[]; round: number; rounds: number; phase: 'ready' | 'ask' | 'reveal' | 'done'; ends: number; word: number; ink: number; ask: 'ink' | 'word'; choices: number[]; ans: Record<string, { c: number; at: number; pts: number }>; pts: Record<string, number>; seed: number };
const CR_ASK = 6000, CR_REVEAL = 1700;
function crNext(s: CR, now: number) {
  const r = rng(s.seed + s.round * 131);
  s.word = Math.floor(r() * RUSH.length); do s.ink = Math.floor(r() * RUSH.length); while (s.ink === s.word);
  s.ask = r() < 0.5 ? 'ink' : 'word';
  const others = RUSH.map((_, i) => i).filter((i) => i !== s.word && i !== s.ink).sort(() => r() - 0.5).slice(0, 2);
  s.choices = [s.word, s.ink, ...others].sort(() => r() - 0.5);
  s.ans = {}; s.phase = 'ask'; s.ends = now + CR_ASK;
}
export const rush: PartyDef<CR, { k: 'tap'; r: number; c: number }> = {
  id: 'rush', name: 'Colour Rush', emoji: '🌈', color: '#8B5CFF', min: 2, max: 8, kind: 'party',
  blurb: 'Tap the right colour before anyone else. Harder than it sounds!', how: 'Each round says “tap the INK” (the colour the word is printed in) or “tap the WORD” (what it says). First right answer: 3 points. Right: 1. Wrong: −1.',
  init: (seats, seed) => ({ ids: seats.map((x) => x.id), round: 0, rounds: 12, phase: 'ready', ends: 4500, word: 0, ink: 1, ask: 'ink', choices: [0, 1, 2, 3], ans: {}, pts: Object.fromEntries(seats.map((x) => [x.id, 0])), seed }),
  move(s, by, m, now) {
    if (s.phase !== 'ask' || m.r !== s.round || s.ans[by] || !s.ids.includes(by)) return false;
    const right = m.c === (s.ask === 'ink' ? s.ink : s.word);
    const first = right && !Object.values(s.ans).some((a) => a.pts === 3);
    const pts = right ? (first ? 3 : 1) : -1;
    s.ans[by] = { c: m.c, at: now, pts }; s.pts[by] = Math.max(0, s.pts[by] + pts);
    if (Object.keys(s.ans).length >= s.ids.length) { s.phase = 'reveal'; s.ends = now + CR_REVEAL; }
    return true;
  },
  tick(s, now) {
    if (s.phase === 'done' || now < s.ends) return false;
    if (s.phase === 'ask') { s.phase = 'reveal'; s.ends = now + CR_REVEAL; return true; }
    if (s.phase === 'reveal') s.round++;
    if (s.round >= s.rounds) { s.phase = 'done'; return true; }
    crNext(s, now); return true;
  },
  result: (s) => (s.phase === 'done' ? placesBy(s.pts) : null),
  score: (s) => s.pts,
  View({ s, me, send, now }) {
    const mine = s.ans[me], right = s.ask === 'ink' ? s.ink : s.word;
    if (s.phase === 'ready') return <div className="grid place-items-center gap-3 py-10 text-center"><div className="text-6xl">🌈</div><div className="font-display text-3xl font-black">Get ready…</div><p className="max-w-xs text-sm text-white/80">{rush.how}</p></div>;
    if (s.phase === 'done') return <div className="py-10 text-center font-display text-3xl font-black">That’s the last round!</div>;
    return (
      <div className="grid w-full max-w-md justify-items-center gap-4">
        <div className="flex w-full justify-between text-sm font-bold text-white/70"><span>Round {s.round + 1}/{s.rounds}</span><span className="tabular-nums">{s.phase === 'ask' ? `${secs(s.ends - now)}s` : ''}</span></div>
        <div className={cn('rounded-full px-4 py-1.5 font-display text-lg font-black', s.ask === 'ink' ? 'bg-white text-[#1C1512]' : 'bg-[#1C1512] text-white ring-2 ring-white')} data-testid="cr-ask">Tap the {s.ask === 'ink' ? 'INK colour' : 'WORD'}</div>
        <motion.div key={s.round} initial={{ scale: 0.4, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} className="rounded-3xl bg-white px-8 py-6 font-display text-6xl font-black tracking-wide shadow-2xl" style={{ color: RUSH[s.ink].c }} data-testid="cr-word">{RUSH[s.word].n}</motion.div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15"><div className="h-full bg-white transition-[width] duration-200" style={{ width: `${s.phase === 'ask' ? Math.max(0, (s.ends - now) / CR_ASK) * 100 : 0}%` }} /></div>
        <div className="grid w-full grid-cols-2 gap-3">
          {s.choices.map((c) => {
            const show = s.phase === 'reveal' || !!mine;
            return (
              <motion.button key={c} whileTap={{ scale: 0.92 }} disabled={!!mine || s.phase !== 'ask'} onClick={() => send({ k: 'tap', r: s.round, c })} data-testid={`cr-${c}`}
                className={cn('relative h-24 rounded-3xl shadow-[0_6px_0_rgba(0,0,0,0.35)]', show && c === right && 'ring-4 ring-white', mine && mine.c === c && c !== right && 'opacity-50')}
                style={{ background: RUSH[c].c }}>
                {show && c === right && <span className="absolute right-2 top-2 text-2xl">✅</span>}
                {mine && mine.c === c && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2 text-sm font-black">{mine.pts > 0 ? `+${mine.pts}` : mine.pts}</span>}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  },
};

