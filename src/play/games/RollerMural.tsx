// Roller Mural: pick a colour, roll whole rows and columns, recreate the mural.
import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MURAL_COLORS } from '../../shared/minigames/memorymural';
import { generateRollerMural, rollGrid, solveRoller, type RollerStroke } from '../../shared/minigames/rollermural';
import { cn, sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, fmtClock, haptic, useBoardSize, useLatest, useTicker, type GameProps } from '../common';
import { Palette } from './PaintGrid';

export function RollerMuralBoard({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateRollerMural(seed, level), [seed, level]);
  const [strokes, setStrokes] = useState<RollerStroke[]>([]);
  const ref = useLatest(strokes);
  const [color, setColor] = useState(L.colors[0]);
  const done = useRef(false);
  useTicker(250);
  const size = useBoardSize(380, 470);
  const cell = Math.floor(size / (L.n + 1.4));
  const grid = useMemo(() => rollGrid(L.n, L.base, strokes), [L, strokes]);
  const solved = grid.every((c, i) => c === L.target[i]);
  const left = L.timeLimitMs - now();
  const finish = (s = ref.current) => {
    if (done.current) return;
    done.current = true;
    onDone({ strokes: s, done_t: Math.round(now()) });
  };
  useEffect(() => { if (solved && strokes.length) { const t = setTimeout(() => finish(), 600); return () => clearTimeout(t); } }, [solved]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (left <= 0) finish(); }); // eslint-disable-line react-hooks/exhaustive-deps
  const roll = (axis: 'r' | 'c', i: number, c = color) => {
    if (done.current || ref.current.length >= L.maxStrokes) return;
    const next = [...ref.current, { t: Math.round(now()), axis, i, c }];
    ref.current = next;
    setStrokes(next);
    haptic(6);
  };
  registerSolver(async () => {
    for (const s of solveRoller(L.n, L.base, L.target)) {
      await sleep(260 + Math.random() * 120);
      roll(s.axis, s.i, s.c);
    }
  });
  const Handle = ({ axis, i }: { axis: 'r' | 'c'; i: number }) => (
    <button onClick={() => roll(axis, i)} aria-label={`Roll ${axis === 'r' ? 'row' : 'column'} ${i + 1}`} data-testid={`roll-${axis}${i}`}
      className="flex items-center justify-center rounded-lg border border-line bg-surface-2/70 transition hover:border-accent-2 active:scale-90"
      style={{ width: axis === 'r' ? cell * 0.7 : cell - 3, height: axis === 'r' ? cell - 3 : cell * 0.7 }}>
      <span className="block rounded-full" style={{ width: axis === 'r' ? 6 : cell * 0.5, height: axis === 'r' ? cell * 0.5 : 6, background: MURAL_COLORS[color] }} />
    </button>
  );
  const Mini = ({ g }: { g: number[] }) => (
    <div className="grid gap-px overflow-hidden rounded-lg" style={{ gridTemplateColumns: `repeat(${L.n}, 1fr)`, width: Math.max(84, cell * 2.4) }}>
      {g.map((c, i) => <span key={i} className="aspect-square" style={{ background: MURAL_COLORS[c] }} />)}
    </div>
  );
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'Strokes', value: `${strokes.length}`, tone: strokes.length <= L.par ? undefined : 'warn' }, { label: 'Par', value: L.par }, { label: 'Time', value: fmtClock(left), tone: left < 8000 ? 'warn' : undefined }]} />
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="grid justify-items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">Mural<Mini g={L.target} /></div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `${cell * 0.7}px repeat(${L.n}, ${cell}px)` }} data-testid="roller-board">
          <span />
          {Array.from({ length: L.n }, (_, i) => <Handle key={`c${i}`} axis="c" i={i} />)}
          {Array.from({ length: L.n }, (_, r) => (
            <div key={r} className="contents">
              <Handle axis="r" i={r} />
              {Array.from({ length: L.n }, (_, c) => {
                const v = grid[r * L.n + c];
                return <span key={c} className={cn('rounded-[5px] transition-colors duration-200', v === L.target[r * L.n + c] && solved && 'ring-1 ring-ok/60')} style={{ width: cell, height: cell, background: MURAL_COLORS[v] }} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <Palette colors={L.colors} value={color} onChange={setColor} />
      <p className="max-w-sm text-center text-xs text-muted">Tap a handle to roll that whole row or column in your colour. The last stroke sits on top — start from what’s underneath.</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={!strokes.length} onClick={() => { const s = ref.current.slice(0, -1); ref.current = s; setStrokes(s); }}><RotateCcw className="h-4 w-4" /> Undo</Button>
        <Button variant="secondary" size="sm" onClick={() => finish()}>Submit</Button>
      </div>
    </div>
  );
}
