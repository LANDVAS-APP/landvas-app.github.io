// A simple, friendly drawing pad for the creative games: 16 colours, four brush sizes,
// eraser, undo and clear. Records strokes (with timing) for the server and for replays.
import { Eraser, Paintbrush, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SKETCH_COLORS, drawStrokes, type Stroke } from '../shared/strokes';
import { cn } from '../lib/utils';
import { holdUpdates } from '../app/updates';

const SIZES = [6, 14, 28, 60];

export function SketchPad({ strokes, onChange, t0, disabled, clip, underlay, size: want = 520, testid = 'sketch-pad' }: {
  strokes: Stroke[];
  onChange(s: Stroke[]): void;
  /** performance.now() when the drawing started (stroke times are relative to it) */
  t0: number;
  disabled?: boolean;
  /** only this band (board units) can be painted; the rest is dimmed */
  clip?: { y0: number; y1: number };
  /** drawn under the strokes (e.g. a guide or the edge of a partner's half) */
  underlay?(g: CanvasRenderingContext2D, size: number): void;
  size?: number;
  testid?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(want);
  const [color, setColor] = useState(1);
  const [w, setW] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const cur = useRef<Stroke | null>(null);
  const latest = useRef(strokes);
  latest.current = strokes;
  // an app update never reloads the page under someone's drawing
  useEffect(() => holdUpdates(), []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.min(want, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [want]);

  const paint = () => {
    const c = cv.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(size * dpr)) { c.width = c.height = Math.round(size * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
    underlay?.(g, size);
    g.save();
    if (clip) { g.beginPath(); g.rect(0, (clip.y0 / 1000) * size, size, ((clip.y1 - clip.y0) / 1000) * size); g.clip(); }
    drawStrokes(g, cur.current ? [...latest.current, cur.current] : latest.current, size);
    g.restore();
    if (clip) {
      g.fillStyle = 'rgba(11,18,48,0.55)';
      if (clip.y0 > 0) g.fillRect(0, 0, size, (clip.y0 / 1000) * size);
      if (clip.y1 < 1000) g.fillRect(0, (clip.y1 / 1000) * size, size, size);
    }
  };
  useEffect(paint);

  const at = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    let x = Math.round(((e.clientX - r.left) / r.width) * 1000), y = Math.round(((e.clientY - r.top) / r.height) * 1000);
    x = Math.max(0, Math.min(1000, x));
    y = Math.max(clip?.y0 ?? 0, Math.min(clip?.y1 ?? 1000, y));
    return [x, y, Math.max(0, Math.round(performance.now() - t0))];
  };
  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    cur.current = { c: eraser ? 0 : color, w, p: at(e) };
    paint();
  };
  const move = (e: React.PointerEvent) => {
    const s = cur.current;
    if (!s || disabled) return;
    const [x, y, t] = at(e);
    const n = s.p.length;
    if (Math.hypot(x - s.p[n - 3], y - s.p[n - 2]) < 4 || n > 2400) return;
    s.p.push(x, y, t);
    paint();
  };
  const up = () => {
    const s = cur.current;
    cur.current = null;
    if (s && latest.current.length < 2500) onChange([...latest.current, s]);
  };
  return (
    <div className="grid w-full justify-items-center gap-2" ref={wrap}>
      <canvas ref={cv} style={{ width: size, height: size }} className={cn('no-touch-scroll touch-none rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.12)]', disabled ? 'opacity-80' : 'cursor-crosshair')}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid={testid} />
      <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Colour">
        {SKETCH_COLORS.slice(1).map((c, i) => (
          <button key={c} role="radio" aria-checked={!eraser && color === i + 1} aria-label={`Colour ${i + 1}`} onClick={() => { setColor(i + 1); setEraser(false); }}
            className={cn('h-7 w-7 rounded-lg border-2 transition', !eraser && color === i + 1 ? 'scale-110 border-white shadow-[0_0_0_2px_var(--accent)]' : 'border-white/15')} style={{ background: c }} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {SIZES.map((s) => (
          <button key={s} onClick={() => setW(s)} aria-label={`Brush size ${s}`} className={cn('flex h-9 w-9 items-center justify-center rounded-xl border', w === s ? 'border-accent bg-accent/15' : 'border-line')}>
            <span className="rounded-full bg-fg" style={{ width: Math.max(3, s / 3), height: Math.max(3, s / 3) }} />
          </button>
        ))}
        <button onClick={() => setEraser((v) => !v)} className={cn('flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-bold', eraser ? 'border-accent bg-accent/15' : 'border-line')} aria-pressed={eraser}>
          {eraser ? <Eraser className="h-4 w-4" /> : <Paintbrush className="h-4 w-4" />} {eraser ? 'Eraser' : 'Brush'}
        </button>
        <button onClick={() => onChange(strokes.slice(0, -1))} disabled={!strokes.length || disabled} className="flex h-9 items-center gap-1 rounded-xl border border-line px-2.5 text-xs font-bold disabled:opacity-40" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
        <button onClick={() => onChange([])} disabled={!strokes.length || disabled} className="flex h-9 items-center gap-1 rounded-xl border border-line px-2.5 text-xs font-bold disabled:opacity-40" aria-label="Clear"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/** A finished drawing; `replay` draws it stroke by stroke at its real pace (or `speed`× faster). */
export function StrokeView({ strokes, size = 240, replay, speed = 1, onEnd, className, clip, testid }: {
  strokes: Stroke[] | null | undefined; size?: number; replay?: boolean; speed?: number; onEnd?(): void; className?: string;
  clip?: { y0: number; y1: number }; testid?: string;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const draw = (until: number) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, size, size);
      g.save();
      if (clip) { g.beginPath(); g.rect(0, (clip.y0 / 1000) * size, size, ((clip.y1 - clip.y0) / 1000) * size); g.clip(); }
      drawStrokes(g, strokes ?? [], size, until);
      g.restore();
    };
    if (!replay) { draw(Infinity); return; }
    const end = (strokes ?? []).reduce((m, k) => Math.max(m, k.p[k.p.length - 1] ?? 0), 0);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const until = (t - start) * speed;
      draw(until);
      if (until < end) raf = requestAnimationFrame(tick); else onEnd?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, size, replay, speed]);
  return <canvas ref={cv} style={{ width: size, height: size }} className={cn('rounded-2xl bg-white', className)} data-testid={testid} />;
}
