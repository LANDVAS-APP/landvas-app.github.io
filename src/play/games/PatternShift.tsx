// PatternShift (Mosaic plots): slide rows and columns until the mosaic matches the target.
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TILE_COLORS, applyMove, generatePatternShift, type PSMove, type Tile } from '../../shared/minigames/patternshift';
import { sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, haptic, useBoardSize, useLatest, type GameProps } from '../common';

function TileShape({ t, x, y, s }: { t: Tile; x: number; y: number; s: number }) {
  const c = TILE_COLORS[t.c];
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.34;
  switch (t.s) {
    case 0: return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={s * 0.08} fill={c} />;
    case 1: return <circle cx={cx} cy={cy} r={r} fill={c} />;
    case 2: return <path d={`M${cx} ${cy - r * 1.15} L${cx + r * 1.15} ${cy} L${cx} ${cy + r * 1.15} L${cx - r * 1.15} ${cy} Z`} fill={c} />;
    case 3: return <path d={`M${cx} ${cy - r * 1.1} L${cx + r * 1.1} ${cy + r * 0.85} L${cx - r * 1.1} ${cy + r * 0.85} Z`} fill={c} />;
    case 4: return <circle cx={cx} cy={cy} r={r * 0.82} fill="none" stroke={c} strokeWidth={s * 0.14} />;
    default: return <path d={`M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}`} stroke={c} strokeWidth={s * 0.2} strokeLinecap="round" />;
  }
}

function Board({ tiles, n, size, target }: { tiles: Tile[]; n: number; size: number; target?: Tile[] }) {
  const s = size / n;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {tiles.map((t, i) => {
        const x = (i % n) * s, y = Math.floor(i / n) * s;
        const ok = target && target[i].c === t.c && target[i].s === t.s;
        return (
          <g key={i}>
            <rect x={x + s * 0.04} y={y + s * 0.04} width={s * 0.92} height={s * 0.92} rx={s * 0.16} fill={ok ? '#18214a' : '#0f1534'} stroke={ok ? 'rgba(61,220,151,0.55)' : 'rgba(140,160,255,0.14)'} strokeWidth={Math.max(1, s * 0.025)} />
            <TileShape t={t} x={x} y={y} s={s} />
          </g>
        );
      })}
    </svg>
  );
}

export function PatternShiftGame({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generatePatternShift(seed, level), [seed, level]);
  const [board, setBoard] = useState<Tile[]>(L.board);
  const boardRef = useLatest(board);
  const moves = useRef<PSMove[]>([]);
  const done = useRef(false);
  const size = useBoardSize(500, 360);
  const n = L.n;
  const correct = board.filter((t, i) => t.c === L.target[i].c && t.s === L.target[i].s).length;
  const solved = correct === board.length;

  const move = (k: 'r' | 'c', i: number, d: 1 | -1) => {
    if (done.current) return;
    const next = applyMove(boardRef.current, n, { k, i, d });
    moves.current.push({ t: Math.round(now()), k, i, d });
    boardRef.current = next;
    setBoard(next);
    haptic();
  };
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ moves: moves.current, done_t: Math.round(now()) });
  };
  useEffect(() => {
    if (solved && moves.current.length) {
      const t = setTimeout(finish, 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  registerSolver(async () => {
    const undo = [...moves.current].reverse().map((m) => ({ k: m.k, i: m.i, d: -m.d as 1 | -1 }));
    const plan = [...undo, ...[...L.scramble].reverse().map((m) => ({ k: m.k, i: m.i, d: -m.d as 1 | -1 }))];
    for (const m of plan) {
      await sleep(430 + Math.random() * 180);
      move(m.k, m.i, m.d);
    }
  });

  // swipe: drag a tile horizontally to shift its row, vertically for its column
  const start = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const cellPx = size / n;
  const onDown = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    start.current = { x: e.clientX, y: e.clientY, cx: Math.floor((e.clientX - r.left) / cellPx), cy: Math.floor((e.clientY - r.top) / cellPx) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < Math.min(24, cellPx * 0.3)) return;
    if (Math.abs(dx) > Math.abs(dy)) move('r', Math.min(n - 1, Math.max(0, s.cy)), dx > 0 ? 1 : -1);
    else move('c', Math.min(n - 1, Math.max(0, s.cx)), dy > 0 ? 1 : -1);
  };

  const arrow = 'flex items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg active:scale-95';
  const preview = Math.min(120, Math.max(72, size * 0.26));
  return (
    <div className="grid justify-items-center gap-3">
      <div className="flex w-full max-w-[560px] items-center justify-between gap-3">
        <Hud items={[
          { label: 'Matched', value: `${correct}/${board.length}`, tone: solved ? 'ok' : undefined },
          { label: 'Moves', value: moves.current.length },
          { label: 'Par', value: L.par },
        ]} />
        <div className="glass shrink-0 rounded-2xl p-1.5 text-center">
          <div className="eyebrow mb-1 !text-[9px]">Target</div>
          <Board tiles={L.target} n={n} size={preview} />
        </div>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `28px ${size}px 28px` }}>
        <div />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {Array.from({ length: n }, (_, i) => <button key={i} className={`${arrow} h-7`} onClick={() => move('c', i, -1)} aria-label={`Column ${i + 1} up`}><ChevronUp className="h-4 w-4" /></button>)}
        </div>
        <div />
        <div className="grid" style={{ gridTemplateRows: `repeat(${n}, 1fr)` }}>
          {Array.from({ length: n }, (_, i) => <button key={i} className={`${arrow} w-7`} onClick={() => move('r', i, -1)} aria-label={`Row ${i + 1} left`}><ChevronLeft className="h-4 w-4" /></button>)}
        </div>
        <div className="no-touch-scroll rounded-3xl bg-[#090d24] shadow-[0_0_0_1px_rgba(140,160,255,0.18)]" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (start.current = null)} data-testid="ps-board">
          <Board tiles={board} n={n} size={size} target={L.target} />
        </div>
        <div className="grid" style={{ gridTemplateRows: `repeat(${n}, 1fr)` }}>
          {Array.from({ length: n }, (_, i) => <button key={i} className={`${arrow} w-7`} onClick={() => move('r', i, 1)} aria-label={`Row ${i + 1} right`}><ChevronRight className="h-4 w-4" /></button>)}
        </div>
        <div />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {Array.from({ length: n }, (_, i) => <button key={i} className={`${arrow} h-7`} onClick={() => move('c', i, 1)} aria-label={`Column ${i + 1} down`}><ChevronDown className="h-4 w-4" /></button>)}
        </div>
        <div />
      </div>
      <p className="max-w-sm text-center text-xs text-muted">Swipe a row or column (or use the arrows). Tiles wrap around the edges.</p>
      <Button variant="ghost" size="sm" onClick={finish}>Give up and submit</Button>
    </div>
  );
}
