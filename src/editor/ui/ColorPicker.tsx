import { useEffect, useRef, useState } from 'react';
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from '../../shared/color';
import { inputCls } from '../../ui';

/** HSV colour picker: saturation/value field, hue strip and hex entry. */
export function ColorPicker({ value, onChange }: { value: string; onChange(hex: string): void }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value)));
  const [hex, setHex] = useState(value);
  const field = useRef<HTMLDivElement>(null);
  const hue = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (value.toUpperCase() !== rgbToHex(hsvToRgb(hsv[0], hsv[1], hsv[2]))) {
      const n = rgbToHsv(hexToRgb(value));
      setHsv((h) => [n[1] === 0 ? h[0] : n[0], n[1], n[2]]);
    }
    setHex(value.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    const out = rgbToHex(hsvToRgb(h, s, v));
    setHex(out);
    onChange(out);
  };
  const drag = (fn: (fx: number, fy: number) => void) => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent | React.PointerEvent) => {
      const r = el.getBoundingClientRect();
      fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
    };
    move(e);
    const up = () => {
      el.removeEventListener('pointermove', move as any);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move as any);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="grid gap-3">
      <div ref={field} className="no-touch-scroll relative h-36 cursor-crosshair rounded-xl"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv[0]} 100% 50%))` }}
        onPointerDown={drag((fx, fy) => emit(hsv[0], fx, 1 - fy))} aria-label="Saturation and brightness" role="slider" aria-valuenow={Math.round(hsv[1] * 100)}>
        <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
          style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: value }} />
      </div>
      <div ref={hue} className="no-touch-scroll relative h-3.5 cursor-pointer rounded-full"
        style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
        onPointerDown={drag((fx) => emit(fx * 359.9, hsv[1] || 1, hsv[2] || 1))} aria-label="Hue" role="slider" aria-valuenow={Math.round(hsv[0])}>
        <span className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(hsv[0] / 360) * 100}%`, background: `hsl(${hsv[0]} 100% 50%)` }} />
      </div>
      <div className="flex items-center gap-2">
        <span className="h-9 w-9 shrink-0 rounded-lg border border-line" style={{ background: value }} />
        <input className={inputCls + ' h-9 font-mono text-sm uppercase'} value={hex} maxLength={7} aria-label="Hex colour" id="hex-input"
          onChange={(e) => {
            setHex(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toUpperCase());
          }} />
      </div>
    </div>
  );
}
