// The app's small drawing dock (Sketch of the Day, duets, doodles, visitor books)
import { Eraser, Paintbrush, Trash2, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';

/** the app's small drawing dock: one brush button (hold it and slide to change the size), the eraser, undo and clear.
 *  Used by Sketch of the Day, duets, doodles and the visitor books. */
export function MiniDock({ w, setW, min, max, eraser = false, setEraser, color, canUndo, onUndo, onClear, light }: { w: number; setW(n: number): void; min: number; max: number; eraser?: boolean; setEraser?(v: boolean): void; color: string; canUndo: boolean; onUndo(): void; onClear(): void; light?: boolean }) {
  const [held, setHeld] = useState(false);
  const p = useRef<{ t: ReturnType<typeof setTimeout>; y: number; w: number; on: boolean } | null>(null);
  const lo = min, hi = max;
  return (
    <div className="relative w-full">
      {held && (
        <div className="lv-toolbubble !absolute !bottom-[calc(100%+8px)] !left-0 !right-0" data-testid="sketch-size">
          <div className="flex items-center gap-3">
            <div className="lv-sizeprev"><span style={{ width: Math.max(3, w), height: Math.max(3, w), background: eraser ? '#fff' : color }} /></div>
            <div className="min-w-0 flex-1"><div className="font-display text-[15px] font-black">Brush size</div><div className="text-[11.5px] font-semibold text-white/55">Slide up or down while holding</div></div>
            <button className="lv-x" onClick={() => setHeld(false)} aria-label="Done">×</button>
          </div>
          <input type="range" className="lv-range mt-3 w-full" min={lo} max={hi} step={1} value={w} onChange={(e) => setW(Number(e.target.value))} aria-label="Brush size" />
        </div>
      )}
      <div className={cn('lv-paintdock !m-0', light && 'lv-paintdock-paper')}>
        <button className={cn('lv-tool !w-auto gap-2 px-3', !eraser && 'on')} aria-label="Brush — hold to change the size" data-testid="sketch-brush"
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); const q = { y: e.clientY, w, on: false, t: setTimeout(() => { q.on = true; setEraser?.(false); setHeld(true); buzz('medium'); }, 320) }; p.current = q; }}
          onPointerMove={(e) => { const q = p.current; if (q?.on) setW(Math.round(Math.max(lo, Math.min(hi, q.w + (q.y - e.clientY) / 6)))); }}
          onPointerUp={() => { const q = p.current; p.current = null; if (!q) return; clearTimeout(q.t); if (!q.on) { setEraser?.(false); buzz('light'); } }}
          onContextMenu={(e) => e.preventDefault()}>
          <Paintbrush className="h-5 w-5" /><span className="rounded-full" style={{ width: Math.max(4, Math.min(22, w / 2)), height: Math.max(4, Math.min(22, w / 2)), background: color }} />
        </button>
        {setEraser && <button className={cn('lv-tool', eraser && 'on')} onClick={() => setEraser(!eraser)} aria-pressed={eraser} aria-label="Eraser"><Eraser className="h-5 w-5" /></button>}
        <div className="flex-1" />
        <button className="lv-tool" onClick={onUndo} disabled={!canUndo} aria-label="Undo"><Undo2 className="h-5 w-5" /></button>
        <button className="lv-tool" onClick={onClear} disabled={!canUndo} aria-label="Clear"><Trash2 className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
