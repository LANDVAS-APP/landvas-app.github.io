// Mirrorline: paint the missing half (or quarters) as a perfect reflection.
import { useEffect, useMemo, useRef, useState } from 'react';
import { generateMirrorline } from '../../shared/minigames/mirrorline';
import type { PaintAction } from '../../shared/minigames/memorymural';
import { sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, fmtClock, haptic, useBoardSize, useTicker, type GameProps } from '../common';
import { Palette, PaintGridBoard } from './PaintGrid';

export function MirrorlineBoard({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateMirrorline(seed, level), [seed, level]);
  const size = useBoardSize(480, 340);
  const [grid, setGrid] = useState(L.start);
  const [color, setColor] = useState(L.colors[1]);
  const paints = useRef<PaintAction[]>([]);
  const done = useRef(false);
  useTicker(200);
  const limit = Math.max(10000, L.timeLimitMs);
  const left = limit - now();
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ paints: paints.current, done_t: Math.round(now()) });
  };
  useEffect(() => { if (left <= 0) finish(); }); // eslint-disable-line react-hooks/exhaustive-deps
  const paint = (i: number, c = color) => {
    if (done.current || L.given[i]) return;
    paints.current.push({ t: Math.round(now()), i, c });
    setGrid((g) => { const n = g.slice(); n[i] = c; return n; });
    haptic(4);
  };
  registerSolver(async () => {
    for (let i = 0; i < L.target.length; i++) {
      if (L.given[i] || L.target[i] === L.colors[0]) continue;
      await sleep(110 + Math.random() * 60);
      paint(i, L.target[i]);
    }
    await sleep(300);
    finish();
  });
  const bg = L.colors[0];
  const rel = grid.map((c, i) => (!L.given[i] && (c !== bg || L.target[i] !== bg) ? i : -1)).filter((i) => i >= 0);
  const open = rel.length;
  const right = rel.filter((i) => grid[i] === L.target[i]).length;
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'Time', value: fmtClock(left), tone: left < 8000 ? 'warn' : undefined }, { label: 'Mirror', value: L.mode === 'quad' ? 'Both ways' : L.mode === 'vertical' ? 'Left ↔ right' : 'Top ↕ bottom' }]} />
      <PaintGridBoard n={L.n} grid={grid} size={size} onPaint={(i) => paint(i)} locked={L.given} axis={L.mode} />
      <Palette colors={L.colors} value={color} onChange={setColor} />
      <p className="max-w-sm text-center text-xs text-muted">Paint the empty side as the exact reflection of the painted side. Shaded cells are given. {Math.round(L.threshold * 100)}% clears the round.</p>
      <Button variant="primary" onClick={finish} data-testid="board-done">Done · {Math.round((right / Math.max(1, open)) * 100)}%</Button>
    </div>
  );
}
