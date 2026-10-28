// HueFlow: tap two tiles to swap them until the gradient flows again.
import { useEffect, useMemo, useRef, useState } from 'react';
import { applySwap, generateHueFlow, type HueSwap } from '../../shared/minigames/hueflow';
import { sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, haptic, useBoardSize, useLatest, type GameProps } from '../common';

export function HueFlowBoard({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateHueFlow(seed, level), [seed, level]);
  const [board, setBoard] = useState(L.board);
  const ref = useLatest(board);
  const [sel, setSel] = useState<number | null>(null);
  const swaps = useRef<HueSwap[]>([]);
  const done = useRef(false);
  const max = useBoardSize(440, 330);
  const cell = Math.floor(Math.min(max / L.w, (max * 1.25) / L.h));
  const correct = board.filter((v, i) => v === i).length;
  const solved = correct === board.length;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ swaps: swaps.current, done_t: Math.round(now()) });
  };
  useEffect(() => {
    if (solved && swaps.current.length) { const t = setTimeout(finish, 650); return () => clearTimeout(t); }
  }, [solved]); // eslint-disable-line react-hooks/exhaustive-deps
  const swap = (a: number, b: number) => {
    const next = applySwap(ref.current, L.locked, a, b);
    if (!next || done.current) return;
    swaps.current.push({ t: Math.round(now()), a, b });
    ref.current = next;
    setBoard(next);
    haptic(6);
  };
  const tap = (i: number) => {
    if (L.locked[i]) return;
    if (sel === null) setSel(i);
    else if (sel === i) setSel(null);
    else { swap(sel, i); setSel(null); }
  };
  registerSolver(async () => {
    for (let i = 0; i < L.colors.length; i++) {
      const b = ref.current;
      if (b[i] === i || L.locked[i]) continue;
      await sleep(380 + Math.random() * 160);
      swap(i, ref.current.indexOf(i));
    }
  });
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'In place', value: `${correct}/${board.length}`, tone: solved ? 'ok' : undefined }, { label: 'Swaps', value: swaps.current.length }, { label: 'Par', value: L.par }]} />
      <div className="grid gap-[3px] rounded-2xl bg-[#090d24] p-[3px] shadow-[0_0_0_1px_rgba(140,160,255,0.18)]" style={{ gridTemplateColumns: `repeat(${L.w}, ${cell}px)` }} data-testid="hue-board">
        {board.map((v, i) => (
          <button key={i} onClick={() => tap(i)} aria-label={L.locked[i] ? 'Pinned tile' : `Tile ${i + 1}`} disabled={L.locked[i] || solved}
            className="relative flex items-center justify-center rounded-[6px] transition-transform active:scale-95"
            style={{ width: cell, height: cell, background: L.colors[v], outline: sel === i ? '3px solid #fff' : undefined, outlineOffset: -3, transform: sel === i ? 'scale(0.92)' : undefined }}>
            {L.locked[i] && <span className="h-1.5 w-1.5 rounded-full bg-black/45" />}
          </button>
        ))}
      </div>
      <p className="max-w-sm text-center text-xs text-muted">Tap two tiles to swap them. Dotted tiles are pinned in place.</p>
      <Button variant="ghost" size="sm" onClick={finish}>Give up and submit</Button>
    </div>
  );
}
