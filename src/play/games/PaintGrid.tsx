// Shared pixel grid + palette for Memory Mural and Mirrorline: tap or drag to paint.
import { useRef } from 'react';
import { cn } from '../../lib/utils';
import { MURAL_COLORS } from '../../shared/minigames/memorymural';

export function Palette({ colors, value, onChange }: { colors: number[]; value: number; onChange(c: number): void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Paint colour">
      {colors.map((c) => (
        <button key={c} role="radio" aria-checked={value === c} aria-label={`Colour ${c + 1}`} onClick={() => onChange(c)} data-testid="palette-color"
          className={cn('h-10 w-10 rounded-xl border-2 transition active:scale-95', value === c ? 'scale-110 border-white shadow-[0_0_0_3px_rgba(123,92,255,0.7)]' : 'border-white/20')}
          style={{ background: MURAL_COLORS[c] }} />
      ))}
    </div>
  );
}

export function PaintGridBoard({ n, grid, size, onPaint, locked, axis, dim }: {
  n: number; grid: number[]; size: number; onPaint?(i: number): void; locked?: boolean[]; axis?: 'vertical' | 'horizontal' | 'quad'; dim?: boolean;
}) {
  const down = useRef(false);
  const last = useRef(-1);
  const s = size / n;
  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * n), y = Math.floor(((e.clientY - r.top) / r.height) * n);
    return x >= 0 && y >= 0 && x < n && y < n ? y * n + x : -1;
  };
  const paint = (i: number) => {
    if (i < 0 || i === last.current || !onPaint || locked?.[i]) return;
    last.current = i;
    onPaint(i);
  };
  return (
    <div className={cn('no-touch-scroll relative overflow-hidden rounded-2xl shadow-[0_0_0_1px_rgba(140,160,255,0.2)]', onPaint && 'cursor-crosshair')}
      style={{ width: size, height: size }} data-testid="paint-grid"
      onPointerDown={(e) => { down.current = true; last.current = -1; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); paint(at(e)); }}
      onPointerMove={(e) => { if (down.current) paint(at(e)); }}
      onPointerUp={() => { down.current = false; }} onPointerCancel={() => { down.current = false; }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {grid.map((c, i) => (
          <rect key={i} x={(i % n) * s} y={Math.floor(i / n) * s} width={s} height={s} fill={MURAL_COLORS[c]}
            stroke="rgba(10,12,30,0.22)" strokeWidth={1} opacity={dim && !locked?.[i] ? 0.92 : 1} />
        ))}
        {locked && grid.map((_, i) => locked[i] ? <rect key={`l${i}`} x={(i % n) * s} y={Math.floor(i / n) * s} width={s} height={s} fill="rgba(10,12,30,0.18)" /> : null)}
        {axis && axis !== 'horizontal' && <line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke="#22E3FF" strokeWidth={3} strokeDasharray="8 6" />}
        {axis && axis !== 'vertical' && <line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke="#22E3FF" strokeWidth={3} strokeDasharray="8 6" />}
      </svg>
    </div>
  );
}
