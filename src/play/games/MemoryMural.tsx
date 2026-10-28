// Memory Mural: study the painting, then repaint it from memory.
import { Eye } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { generateMemoryMural, type PaintAction } from '../../shared/minigames/memorymural';
import { sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, fmtClock, haptic, useBoardSize, useTicker, type GameProps } from '../common';
import { Palette, PaintGridBoard } from './PaintGrid';

function MemoryMuralBoard({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateMemoryMural(seed, level), [seed, level]);
  const size = useBoardSize(460, 360);
  const [grid, setGrid] = useState(() => new Array(L.n * L.n).fill(L.colors[0]));
  const [color, setColor] = useState(L.colors[1]);
  const paints = useRef<PaintAction[]>([]);
  const done = useRef(false);
  useTicker(100);
  const t = now();
  const showing = t < L.previewMs;
  const left = L.previewMs + L.timeLimitMs - t;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ paints: paints.current, done_t: Math.round(now()) });
  };
  useEffect(() => { if (!showing && left <= 0) finish(); }); // eslint-disable-line react-hooks/exhaustive-deps
  const paint = (i: number, c = color) => {
    // read the clock, not render state: the solver's closure can outlive a render
    if (now() < L.previewMs || done.current) return;
    paints.current.push({ t: Math.round(now()), i, c });
    setGrid((g) => { const n = g.slice(); n[i] = c; return n; });
    haptic(4);
  };
  registerSolver(async () => {
    while (now() < L.previewMs + 200) await sleep(100);
    for (let i = 0; i < L.target.length; i++) {
      if (L.target[i] === L.colors[0]) continue;
      await sleep(110 + Math.random() * 60);
      paint(i, L.target[i]);
    }
    await sleep(300);
    finish();
  });
  const rel = grid.map((c, i) => (c !== L.colors[0] || L.target[i] !== L.colors[0] ? i : -1)).filter((i) => i >= 0);
  const correctPct = Math.round((rel.filter((i) => grid[i] === L.target[i]).length / Math.max(1, rel.length)) * 100);
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={showing
        ? [{ label: 'Memorise', value: fmtClock(L.previewMs - t), tone: 'warn' }, { label: 'Colours', value: L.colors.length }]
        : [{ label: 'Time', value: fmtClock(left), tone: left < 8000 ? 'warn' : undefined }, { label: 'Cells', value: L.n * L.n }]} />
      <div className="relative">
        <PaintGridBoard n={L.n} grid={showing ? L.target : grid} size={size} onPaint={showing ? undefined : (i) => paint(i)} />
        {showing && <div className="pointer-events-none absolute inset-x-0 -bottom-3 flex justify-center"><span className="glass flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"><Eye className="h-3.5 w-3.5" /> Remember this!</span></div>}
      </div>
      {!showing && <Palette colors={L.colors} value={color} onChange={setColor} />}
      <p className="max-w-sm text-center text-xs text-muted">{showing ? 'The painting hides when the timer runs out.' : `Repaint it from memory — get ${Math.round(L.threshold * 100)}% of the painted cells right to clear the round.`}</p>
      {!showing && <Button variant="primary" onClick={finish} data-testid="board-done">Done{import.meta.env.DEV ? ` (${correctPct}%)` : ''}</Button>}
    </div>
  );
}

export { MemoryMuralBoard };
