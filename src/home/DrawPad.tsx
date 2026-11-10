// Drawing in a check-in book: a little sketch pad (a 400 x 300 page, a few colours and pen sizes, undo and clear)
// and the drawing shown back on the book's page. Drawings are stored as strokes of points, not pictures.
import { Eraser, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BookDrawing } from '../backend/types';
import { cn } from '../lib/utils';

export const PAGE_W = 400, PAGE_H = 300;
const INKS = ['#1F3A5F', '#E8433A', '#FF8A3D', '#F5C842', '#3E9A44', '#22B8FF', '#7A5CC8', '#FF5FA2', '#5C3A21', '#FFFFFF'];
const PENS = [3, 6, 12];
type Stroke = BookDrawing['s'][number];
const MAX_POINTS = 3800;

/** the drawing, as it looks on the page */
export function DrawingView({ d, className }: { d: BookDrawing; className?: string }) {
  return (
    <svg viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} className={cn('w-full rounded-lg bg-white/70', className)} data-testid="book-drawing" role="img" aria-label="A drawing">
      {d.s.map((s, i) => {
        const pts: string[] = []; for (let k = 0; k < s.p.length; k += 2) pts.push(`${s.p[k]},${s.p[k + 1]}`);
        return pts.length === 1
          ? <circle key={i} cx={s.p[0]} cy={s.p[1]} r={s.w / 2} fill={s.c} />
          : <polyline key={i} points={pts.join(' ')} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </svg>
  );
}

/** a sketch pad; tells you the drawing whenever it changes (null when it's empty) */
export function DrawPad({ onChange }: { onChange(d: BookDrawing | null): void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [ink, setInk] = useState(INKS[0]);
  const [pen, setPen] = useState(PENS[1]);
  const cur = useRef<Stroke | null>(null);
  const count = strokes.reduce((n, s) => n + s.p.length / 2, 0);
  const redraw = (list: Stroke[]) => {
    const c = cv.current; if (!c) return; const g = c.getContext('2d')!;
    g.setTransform(c.width / PAGE_W, 0, 0, c.height / PAGE_H, 0, 0);
    g.clearRect(0, 0, PAGE_W, PAGE_H); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of list) {
      g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = s.w;
      if (s.p.length === 2) { g.beginPath(); g.arc(s.p[0], s.p[1], s.w / 2, 0, Math.PI * 2); g.fill(); continue; }
      g.beginPath(); g.moveTo(s.p[0], s.p[1]); for (let k = 2; k < s.p.length; k += 2) g.lineTo(s.p[k], s.p[k + 1]); g.stroke();
    }
  };
  useEffect(() => { redraw(strokes); onChange(strokes.length ? { s: strokes } : null); }, [strokes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const c = cv.current; if (!c) return; const r = c.getBoundingClientRect(); c.width = Math.round(r.width * Math.min(2, devicePixelRatio || 1)); c.height = Math.round(c.width * (PAGE_H / PAGE_W)); redraw(strokes); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const at = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(PAGE_W, ((e.clientX - r.left) / r.width) * PAGE_W))), Math.round(Math.max(0, Math.min(PAGE_H, ((e.clientY - r.top) / r.height) * PAGE_H)))] as const;
  };
  const down = (e: React.PointerEvent) => {
    if (count >= MAX_POINTS || strokes.length >= 150) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = at(e); cur.current = { c: ink, w: pen, p: [x, y] };
    redraw([...strokes, cur.current]);
  };
  const move = (e: React.PointerEvent) => {
    const s = cur.current; if (!s) return;
    const [x, y] = at(e), lx = s.p[s.p.length - 2], ly = s.p[s.p.length - 1];
    if (Math.hypot(x - lx, y - ly) < 3 || count + s.p.length / 2 >= MAX_POINTS) return;
    s.p.push(x, y); redraw([...strokes, s]);
  };
  const up = () => { const s = cur.current; cur.current = null; if (s) setStrokes((l) => [...l, s]); };
  return (
    <div className="grid gap-2" data-testid="draw-pad">
      <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="aspect-[4/3] w-full touch-none rounded-lg border-2 border-dashed border-[#C9B79C] bg-white" data-testid="draw-canvas" />
      <div className="flex flex-wrap items-center gap-1.5">
        {INKS.map((c) => <button key={c} onClick={() => setInk(c)} aria-label={`Ink ${c}`} className={cn('h-6 w-6 rounded-full border-2', ink === c ? 'border-[#3B2A20] scale-110' : 'border-black/10')} style={{ background: c }} />)}
        <span className="mx-1 h-5 w-px bg-[#C9B79C]" />
        {PENS.map((w) => <button key={w} onClick={() => setPen(w)} aria-label={`Pen ${w}`} className={cn('grid h-7 w-7 place-items-center rounded-lg', pen === w ? 'bg-[#F0E4C8]' : '')}><span className="rounded-full bg-[#3B2A20]" style={{ width: w + 2, height: w + 2 }} /></button>)}
        <span className="ml-auto flex gap-1">
          <button onClick={() => setStrokes((l) => l.slice(0, -1))} disabled={!strokes.length} className="rounded-lg p-1.5 text-[#5C3A21] disabled:opacity-30" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
          <button onClick={() => setStrokes([])} disabled={!strokes.length} className="rounded-lg p-1.5 text-[#5C3A21] disabled:opacity-30" aria-label="Clear"><Eraser className="h-4 w-4" /></button>
        </span>
      </div>
    </div>
  );
}
