// Sculptor: drag the clay's handles in and out until it matches the target outline.
import { useEffect, useMemo, useRef, useState } from 'react';
import { generateSculptor, iou, polygon, sculpt, type SculptMove } from '../../shared/minigames/sculptor';
import { sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, fmtClock, haptic, useBoardSize, useLatest, useTicker, type GameProps } from '../common';

const path = (pts: [number, number][], s: number) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * s).toFixed(1)} ${(y * s).toFixed(1)}`).join(' ') + 'Z';

export function SculptorBoard({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateSculptor(seed, level), [seed, level]);
  const size = useBoardSize(460, 330);
  const [radii, setRadii] = useState(L.start);
  const ref = useLatest(radii);
  const moves = useRef<SculptMove[]>([]);
  const done = useRef(false);
  const drag = useRef<number | null>(null);
  const lastT = useRef(0);
  const [match, setMatch] = useState(() => iou(L.start, L.target));
  useTicker(250);
  const left = L.timeLimitMs - now();
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ moves: moves.current, done_t: Math.round(now()) });
  };
  useEffect(() => { if (left <= 0) finish(); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setMatch(iou(radii, L.target)), 90); return () => clearTimeout(t); }, [radii, L.target]);

  const pull = (v: number, r: number) => {
    if (done.current) return;
    const t = Math.round(now());
    if (t - lastT.current < 14 && moves.current.length) return;
    lastT.current = t;
    const rr = Math.round(Math.max(0.12, Math.min(1, r)) * 1000) / 1000;
    if (Math.abs(rr - ref.current[v]) < 0.003) return;
    moves.current.push({ t, v, r: rr });
    const next = sculpt(ref.current, L.falloff, v, rr);
    ref.current = next;
    setRadii(next);
  };
  const toRadius = (e: React.PointerEvent) => {
    const b = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    return Math.hypot(x, y) / 0.48;
  };
  const nearest = (e: React.PointerEvent) => {
    const b = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    const a = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return Math.round((a / (Math.PI * 2)) * L.v) % L.v;
  };
  registerSolver(async () => {
    for (let pass = 0; pass < 6 && iou(ref.current, L.target) < Math.min(0.97, L.threshold + 0.06); pass++) {
      for (let v = 0; v < L.v; v++) {
        await sleep(40 + Math.random() * 25);
        lastT.current = 0;
        pull(v, L.target[v]);
      }
    }
    await sleep(300);
    finish();
  });

  const clay = polygon(radii), target = polygon(L.target);
  const pct = Math.round(match * 100);
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'Sculpt', value: L.name }, { label: 'Match', value: `${pct}%`, tone: match >= L.threshold ? 'ok' : undefined }, { label: 'Time', value: fmtClock(left), tone: left < 8000 ? 'warn' : undefined }]} />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="no-touch-scroll touch-none rounded-[28px] bg-[radial-gradient(circle_at_50%_40%,#3a2a20,#160f0b)] shadow-[0_0_0_1px_rgba(255,200,150,0.15)]"
        data-testid="sculpt-board"
        onPointerDown={(e) => { (e.currentTarget as SVGElement).setPointerCapture(e.pointerId); drag.current = nearest(e); haptic(5); pull(drag.current, toRadius(e)); }}
        onPointerMove={(e) => { if (drag.current !== null) pull(drag.current, toRadius(e)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <defs>
          <radialGradient id="clayfill" cx="40%" cy="35%" r="75%"><stop offset="0" stopColor="#F2C49B" /><stop offset="0.6" stopColor="#C8794A" /><stop offset="1" stopColor="#8A4B2A" /></radialGradient>
          <filter id="clayglow"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        <path d={path(target, size)} fill="none" stroke="#22E3FF" strokeWidth={6} opacity={0.35} filter="url(#clayglow)" />
        <path d={path(target, size)} fill="rgba(34,227,255,0.06)" stroke="#22E3FF" strokeWidth={2} strokeDasharray="7 6" />
        <path d={path(clay, size)} fill="url(#clayfill)" stroke="#5a2f19" strokeWidth={2} opacity={0.92} />
        {clay.map(([x, y], i) => <circle key={i} cx={x * size} cy={y * size} r={Math.max(5, size / 70)} fill="#fff" stroke="#5a2f19" strokeWidth={1.5} opacity={0.85} />)}
      </svg>
      <p className="max-w-sm text-center text-xs text-muted">Drag anywhere around the clay to push or pull it — match the dashed outline. {Math.round(L.threshold * 100)}% clears the round.</p>
      <Button variant="primary" onClick={finish} data-testid="board-done">Done · {pct}%</Button>
    </div>
  );
}
