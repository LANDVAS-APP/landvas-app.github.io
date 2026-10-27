// TraceCraft (Graphite plots): trace each glowing guide in one steady stroke.
import { useEffect, useMemo, useRef, useState } from 'react';
import { generateTraceCraft, resample, scoreStroke, type Pt } from '../../shared/minigames/tracecraft';
import { cn, sleep } from '../../lib/utils';
import { Hud, haptic, useBoardSize, useLatest, type GameProps } from '../common';

type Stroke = [number, number, number][];

export function TraceCraftGame({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateTraceCraft(seed, level), [seed, level]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<{ score: number; passed: boolean; accuracy: number; coverage: number }[]>([]);
  const idxRef = useLatest(idx);
  const strokes = useRef<{ points: Stroke }[]>([]);
  const current = useRef<Stroke | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useBoardSize(560, 260);
  const busy = useRef(false);
  const done = useRef(false);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const shape = L.shapes[idxRef.current];
    if (!shape) return;
    const guide = resample(shape.points, 240);
    // guide: soft glow + dashed core
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(185,195,216,0.18)';
    g.lineWidth = Math.max(10, L.tolerance * size * 1.6);
    g.beginPath();
    guide.forEach(([x, y], i) => (i ? g.lineTo(x * size, y * size) : g.moveTo(x * size, y * size)));
    g.stroke();
    g.setLineDash([6, 7]);
    g.strokeStyle = '#D9E0F2';
    g.lineWidth = 2;
    g.shadowColor = '#B9C3D8';
    g.shadowBlur = 10;
    g.stroke();
    g.setLineDash([]);
    g.shadowBlur = 0;
    // start marker
    const [sx, sy] = shape.points[0];
    g.fillStyle = '#3DDC97';
    g.beginPath();
    g.arc(sx * size, sy * size, 9, 0, Math.PI * 2);
    g.fill();
    // live stroke
    const s = current.current;
    if (s && s.length > 1) {
      g.strokeStyle = '#FFE14D';
      g.lineWidth = 4.5;
      g.shadowColor = '#FFB23F';
      g.shadowBlur = 12;
      g.beginPath();
      s.forEach(([x, y], i) => (i ? g.lineTo(x * size, y * size) : g.moveTo(x * size, y * size)));
      g.stroke();
      g.shadowBlur = 0;
    }
  };

  useEffect(() => {
    const c = canvas.current!;
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, idx]);

  const point = (e: { clientX: number; clientY: number }): [number, number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, Math.round(now())];
  };

  const endStroke = async () => {
    const s = current.current;
    current.current = null;
    if (!s || busy.current || done.current) return draw();
    const shape = L.shapes[idxRef.current];
    const pts = s.map(([x, y]) => [x, y] as Pt);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s.length < 4 || len < 0.06) return draw(); // a tap, not a stroke
    busy.current = true;
    strokes.current.push({ points: s });
    const r = scoreStroke(shape, L.tolerance, pts);
    setResults((x) => [...x, { score: r.score, passed: r.passed, accuracy: r.accuracy, coverage: r.coverage }]);
    haptic(r.passed ? 18 : 40);
    await sleep(700);
    if (idxRef.current + 1 >= L.shapes.length) {
      done.current = true;
      onDone({ strokes: strokes.current });
    } else {
      idxRef.current = idxRef.current + 1;
      setIdx(idxRef.current);
    }
    busy.current = false;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy.current || done.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = [point(e)];
    draw();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of evs) {
      const p = point(ev);
      const last = current.current[current.current.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.002 && current.current.length < 3900) current.current.push(p);
    }
    draw();
  };

  registerSolver(async () => {
    for (let k = idxRef.current; k < L.shapes.length; k++) {
      while (idxRef.current !== k || busy.current) await sleep(40);
      const pts = resample(L.shapes[k].points, 110);
      current.current = [];
      for (let i = 0; i < pts.length; i++) {
        await sleep(12 + ((i * 7) % 9));
        const [x, y] = pts[i];
        current.current!.push([x + Math.sin(i * 1.7) * 0.0025, y + Math.cos(i * 2.3) * 0.0025, Math.round(now())]);
        if (i % 6 === 0) draw();
      }
      await endStroke();
    }
  });

  const shape = L.shapes[idx];
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[
        { label: 'Shape', value: `${Math.min(idx + 1, L.shapes.length)}/${L.shapes.length}` },
        { label: 'Guide', value: shape?.name ?? '' },
        { label: 'Cleared', value: `${results.filter((r) => r.passed).length}`, tone: results.filter((r) => r.passed).length >= 2 ? 'ok' : undefined },
      ]} />
      <canvas ref={canvas} style={{ width: size, height: size }} className="no-touch-scroll rounded-3xl bg-[#0c1029] shadow-[0_0_0_1px_rgba(140,160,255,0.18),0_30px_80px_-30px_#000]"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => void endStroke()} onPointerCancel={() => { current.current = null; draw(); }}
        aria-label={`Trace the ${shape?.name}`} data-testid="tc-canvas" />
      <div className="flex gap-2">
        {L.shapes.map((s, i) => {
          const r = results[i];
          return (
            <div key={i} className={cn('rounded-xl border px-3 py-1.5 text-center text-xs', r ? (r.passed ? 'border-ok/50 bg-ok/10' : 'border-bad/50 bg-bad/10') : i === idx ? 'border-accent-2/60' : 'border-line')}>
              <div className="font-bold">{s.name}</div>
              <div className="tnum text-muted">{r ? `${Math.round(r.accuracy * 100)}% · ${r.score}` : i === idx ? 'now' : '—'}</div>
            </div>
          );
        })}
      </div>
      <p className="max-w-sm text-center text-xs text-muted">Start at the green dot and follow the guide in one stroke. Clear 2 of 3 shapes to win.</p>
    </div>
  );
}
