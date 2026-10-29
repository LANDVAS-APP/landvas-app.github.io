// Paint Pop (Mosaic plots): match-3 that paints a picture. Swap neighbouring paint
// blobs to pop 3+ in a row; every popped blob splashes its colour onto the painting.
import { useEffect, useMemo, useRef, useState } from 'react';
import { POP_BOMB, POP_COL, POP_ROW, POP_SPRAY, Spawner, adjacent, applySwap, generatePaintPop, solvePaintPop, type PopBoard } from '../../shared/minigames/paintpop';
import { cn, sleep } from '../../lib/utils';
import { Hud, fmtClock, haptic, useBoardSize, useTicker, type GameProps } from '../common';

const CANVAS = '#F5F4EF';

function Blob({ c, p, palette, size }: { c: number; p: number; palette: string[]; size: number }) {
  if (c === -1 || p === POP_BOMB) {
    return <span className="block rounded-full shadow-[0_0_14px_rgba(255,255,255,0.6)]" style={{ width: size, height: size, background: 'conic-gradient(#FF4D6D,#FFB23F,#FFE14D,#3DDC97,#34C3FF,#7B5CFF,#FF4FD8,#FF4D6D)' }} />;
  }
  const col = palette[c] ?? '#888';
  return (
    <span className="relative block rounded-full" style={{ width: size, height: size, background: `radial-gradient(circle at 32% 28%, #ffffffcc 0 12%, ${col} 34%, ${col} 70%, #00000055 100%)`, boxShadow: `0 2px 6px ${col}66` }}>
      {p === POP_ROW && <span className="absolute inset-x-[12%] top-1/2 h-[22%] -translate-y-1/2 rounded-full bg-white/85" />}
      {p === POP_COL && <span className="absolute inset-y-[12%] left-1/2 w-[22%] -translate-x-1/2 rounded-full bg-white/85" />}
      {p === POP_SPRAY && <span className="absolute inset-[18%] rounded-full border-[3px] border-dashed border-white/90" />}
    </span>
  );
}

export function PaintPopGame({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generatePaintPop(seed, level), [seed, level]);
  const spawner = useRef(new Spawner(L.spawnSeed, L.k));
  const [board, setBoard] = useState<PopBoard>(L.start);
  const boardRef = useRef(L.start);
  const [got, setGot] = useState<number[]>(() => new Array(L.k).fill(0));
  const gotRef = useRef<number[]>(new Array(L.k).fill(0));
  const [popping, setPopping] = useState<Set<number>>(new Set());
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [combo, setCombo] = useState<{ n: number; key: number } | null>(null);
  const busy = useRef(false);
  const moves = useRef<{ t: number; a: number; b: number }[]>([]);
  const done = useRef(false);
  const drag = useRef<{ i: number; x: number; y: number } | null>(null);
  useTicker(250);
  const size = useBoardSize(440, 380);
  const cell = Math.floor(size / L.n);
  const left = L.timeLimitMs - now();
  const movesLeft = L.moves - moves.current.length;
  const complete = (g: number[]) => L.quota.every((q, i) => g[i] >= q);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ moves: moves.current, done_t: Math.round(now()) });
  };
  useEffect(() => { if (left <= 0 && !busy.current) finish(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const swap = async (a: number, b: number) => {
    if (busy.current || done.current || moves.current.length >= L.moves) return;
    const r = applySwap(boardRef.current, a, b, spawner.current);
    if (!r) { setShake(a); haptic(25); setTimeout(() => setShake(null), 320); return; }
    busy.current = true;
    setSel(null);
    moves.current.push({ t: Math.round(now()), a, b });
    haptic(10);
    const before = gotRef.current.slice();
    const counts = before.slice();
    // show the swap itself first
    const swapped = { ...boardRef.current, color: boardRef.current.color.slice(), power: boardRef.current.power.slice() };
    [swapped.color[a], swapped.color[b]] = [swapped.color[b], swapped.color[a]];
    [swapped.power[a], swapped.power[b]] = [swapped.power[b], swapped.power[a]];
    boardRef.current = swapped;
    setBoard(swapped);
    await sleep(110);
    for (let k = 0; k < r.steps.length; k++) {
      const st = r.steps[k];
      if (st.cleared.length) {
        setPopping(new Set(st.cleared));
        if (k > 0) { setCombo({ n: k + 1, key: Math.random() }); haptic(15); }
        await sleep(190);
        for (const i of st.cleared) { const c = boardRef.current.color[i]; if (c >= 0) counts[c]++; }
        gotRef.current = counts.slice();
        setGot(counts.slice());
      }
      boardRef.current = st.after;
      setPopping(new Set());
      setFresh(new Set(st.cleared));
      setBoard(st.after);
      await sleep(170);
    }
    // the move's exact tally (the same count the server makes)
    gotRef.current = before.map((v, i) => v + r.popped[i]);
    setGot(gotRef.current.slice());
    setFresh(new Set());
    busy.current = false;
    if (complete(gotRef.current) || moves.current.length >= L.moves) { await sleep(450); finish(); }
  };

  registerSolver(async () => {
    for (const m of solvePaintPop(seed, level).slice(moves.current.length)) {
      while (busy.current) await sleep(60);
      if (done.current) return;
      await sleep(320 + Math.random() * 120);
      await swap(m.a, m.b);
    }
    while (busy.current) await sleep(60);
    finish();
  });

  const tap = (i: number) => {
    if (busy.current) return;
    if (sel === null) { setSel(i); return; }
    if (sel === i) { setSel(null); return; }
    if (adjacent(L.n, sel, i)) void swap(sel, i); else setSel(i);
  };
  const onDown = (i: number, e: React.PointerEvent) => { drag.current = { i, x: e.clientX, y: e.clientY }; };
  const onUp = (i: number, e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.35) { tap(d.i); return; }
    const x = d.i % L.n, y = Math.floor(d.i / L.n);
    const to = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? (x < L.n - 1 ? d.i + 1 : -1) : (x > 0 ? d.i - 1 : -1)) : (dy > 0 ? (y < L.n - 1 ? d.i + L.n : -1) : (y > 0 ? d.i - L.n : -1));
    if (to >= 0) void swap(d.i, to);
    void i;
  };

  // the painting fills in colour by colour as blobs pop
  const reveal = useMemo(() => {
    const order: Record<number, number[]> = {};
    L.picture.forEach((c, i) => { if (c >= 0) (order[c] ??= []).push(i); });
    return order;
  }, [L]);
  const shown = new Set<number>();
  for (const [c, cells] of Object.entries(reveal)) {
    const q = L.quota[Number(c)] || 1;
    const n = Math.round((Math.min(got[Number(c)], q) / q) * cells.length);
    cells.slice(0, n).forEach((i) => shown.add(i));
  }
  const pic = Math.min(150, Math.max(110, size * 0.34));
  const px = pic / L.pictureN;

  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'Moves', value: movesLeft, tone: movesLeft <= 3 ? 'warn' : undefined }, { label: 'Time', value: fmtClock(left), tone: left < 10000 ? 'warn' : undefined }]} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <svg width={pic} height={pic} className="rounded-xl shadow-lg ring-1 ring-white/10" aria-label="Your painting" data-testid="pop-painting">
          {L.picture.map((c, i) => (
            <rect key={i} x={(i % L.pictureN) * px} y={Math.floor(i / L.pictureN) * px} width={px + 0.5} height={px + 0.5}
              fill={c < 0 ? CANVAS : shown.has(i) ? L.palette[c] : '#d9d6cc'} opacity={c >= 0 && !shown.has(i) ? 0.55 : 1} style={{ transition: 'fill 300ms' }} />
          ))}
        </svg>
        <div className="grid gap-1.5" data-testid="pop-quota">
          {L.quota.map((q, c) => q > 0 && (
            <div key={c} className="flex items-center gap-2 text-sm font-bold tnum">
              <Blob c={c} p={0} palette={L.palette} size={18} />
              <span className={cn(got[c] >= q && 'text-ok')}>{Math.min(got[c], q)}/{q}</span>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full transition-all" style={{ width: `${Math.min(100, (got[c] / q) * 100)}%`, background: L.palette[c] }} /></span>
            </div>
          ))}
        </div>
      </div>
      <div className="relative">
        <div className="grid touch-none select-none gap-[2px] rounded-2xl bg-[#0b1226] p-[4px]" style={{ gridTemplateColumns: `repeat(${L.n}, ${cell - 2}px)` }} data-testid="pop-board">
          {board.color.map((c, i) => (
            <button key={i} type="button" aria-label={`Blob ${i + 1}`}
              onPointerDown={(e) => onDown(i, e)} onPointerUp={(e) => onUp(i, e)}
              className={cn('flex items-center justify-center rounded-lg transition', sel === i ? 'bg-white/20 ring-2 ring-white' : 'hover:bg-white/5', shake === i && 'animate-[lv-shake_0.3s]')}
              style={{ height: cell - 2 }}>
              <span className={cn('transition-transform duration-150', popping.has(i) ? 'scale-0 opacity-0' : 'scale-100', fresh.has(i) && 'animate-[lv-drop_0.22s_ease-out]')}>
                <Blob c={c} p={board.power[i]} palette={L.palette} size={Math.round(cell * 0.72)} />
              </span>
            </button>
          ))}
        </div>
        {combo && combo.n > 1 && (
          <div key={combo.key} className="pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-3xl font-black text-gold drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] animate-[lv-pop_0.6s_ease-out_both]">Combo ×{combo.n}!</div>
        )}
      </div>
      <p className="max-w-sm text-center text-xs text-muted">Swipe or tap two neighbouring blobs to swap them. Pop 3 in a row to splash paint. 4 makes a Roller, an L or T makes a Spray, 5 makes a Colour Bomb — swap the bomb with any blob.</p>
    </div>
  );
}
