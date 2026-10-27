// Image import: validate, crop with aspect presets, then hand off to on-canvas placement.
import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '../../ui';
import { cn } from '../../lib/utils';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];
const MAX_BYTES = 25 * 1024 * 1024;
type Rect = { x: number; y: number; w: number; h: number };

export function ImportDialog({ open, onOpenChange, canvasAspect, onPlace }: {
  open: boolean; onOpenChange(o: boolean): void; canvasAspect: number; onPlace(img: HTMLCanvasElement, fit: 'fit' | 'fill'): void;
}) {
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [aspect, setAspect] = useState<number | null>(null);
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setBmp(null);
      setError(null);
      setCrop({ x: 0, y: 0, w: 1, h: 1 });
      setAspect(null);
    }
  }, [open]);

  const load = async (f: File) => {
    setError(null);
    if (!ALLOWED.includes(f.type)) return setError('Use a PNG, JPEG, WebP, GIF, AVIF or BMP image.');
    if (f.size > MAX_BYTES) return setError('That file is larger than 25 MB.');
    try {
      const b = await createImageBitmap(f, { imageOrientation: 'from-image' });
      if (b.width < 8 || b.height < 8 || b.width > 8192 || b.height > 8192) return setError('Images must be between 8 and 8192 pixels on each side.');
      setBmp(b);
      setName(f.name);
      setCrop({ x: 0, y: 0, w: 1, h: 1 });
    } catch {
      setError('This image could not be read. Try exporting it again as PNG or JPEG.');
    }
  };

  const applyAspect = (a: number | null) => {
    setAspect(a);
    if (!bmp || !a) return;
    const imgA = bmp.width / bmp.height;
    // normalised crop dims for target aspect a (w/h in pixels)
    let w = 1, h = imgA / a;
    if (h > 1) { h = 1; w = a / imgA; }
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const startDrag = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = box.current!;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const c0 = { ...crop };
    const sx = e.clientX, sy = e.clientY;
    const imgA = bmp ? bmp.width / bmp.height : 1;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      let n = { ...c0 };
      if (mode === 'move') {
        n.x = Math.min(1 - c0.w, Math.max(0, c0.x + dx));
        n.y = Math.min(1 - c0.h, Math.max(0, c0.y + dy));
      } else {
        const left = mode === 'nw' || mode === 'sw', top = mode === 'nw' || mode === 'ne';
        let x0 = c0.x, y0 = c0.y, x1 = c0.x + c0.w, y1 = c0.y + c0.h;
        if (left) x0 = Math.min(x1 - 0.05, Math.max(0, x0 + dx)); else x1 = Math.max(x0 + 0.05, Math.min(1, x1 + dx));
        if (top) y0 = Math.min(y1 - 0.05, Math.max(0, y0 + dy)); else y1 = Math.max(y0 + 0.05, Math.min(1, y1 + dy));
        n = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        if (aspect) {
          const want = aspect / imgA; // w/h in normalised units
          if (n.w / n.h > want) n.w = n.h * want; else n.h = n.w / want;
          if (left) n.x = x1 - n.w;
          if (top) n.y = y1 - n.h;
        }
      }
      setCrop(n);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const place = (fit: 'fit' | 'fill') => {
    if (!bmp) return;
    const sx = Math.round(crop.x * bmp.width), sy = Math.round(crop.y * bmp.height);
    const sw = Math.max(1, Math.round(crop.w * bmp.width)), sh = Math.max(1, Math.round(crop.h * bmp.height));
    // cap working size to keep memory sane on phones
    const k = Math.min(1, 4096 / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
    onPlace(c, fit);
    onOpenChange(false);
  };

  const presets: [string, number | null][] = [['Free', null], ['Canvas shape', canvasAspect], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9]];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Upload artwork" wide
      description="Your image is processed on this device; only the finished plot tiles are uploaded, so photo location data and other metadata never leave it.">
      {!bmp ? (
        <div className="grid gap-3">
          <button onClick={() => file.current?.click()}
            className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line-strong px-6 py-14 text-center hover:border-accent"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void load(f); }}>
            <ImagePlus className="h-10 w-10 text-accent-2" />
            <b>Choose an image or drop it here</b>
            <span className="text-sm text-muted">PNG, JPEG, WebP, GIF, AVIF or BMP · up to 25 MB · transparent PNGs keep their transparency</span>
          </button>
          <input ref={file} type="file" accept={ALLOWED.join(',')} className="hidden" id="import-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
          {error && <p className="text-sm font-semibold text-bad">{error}</p>}
          <p className="text-xs text-faint">Only upload images you created or have permission to use. Photos of people need their consent.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-1.5">
            {presets.map(([label, a]) => (
              <button key={label} onClick={() => applyAspect(a)} className={cn('rounded-full border px-3 py-1 text-xs font-bold', aspect === a ? 'border-accent bg-accent/15' : 'border-line text-muted')}>{label}</button>
            ))}
          </div>
          <div className="checker relative mx-auto w-full max-w-xl select-none overflow-hidden rounded-xl" ref={box} style={{ aspectRatio: `${bmp.width} / ${bmp.height}` }}>
            <BitmapCanvas bmp={bmp} />
            <div className="absolute inset-0 bg-black/55" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${crop.y * 100}%)` }} />
            <div className="no-touch-scroll absolute cursor-move border-2 border-[#FFE14D]" onPointerDown={startDrag('move')}
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}>
              {(['nw', 'ne', 'sw', 'se'] as const).map((k) => (
                <span key={k} onPointerDown={startDrag(k)} className="no-touch-scroll absolute h-5 w-5 rounded-full border-2 border-[#0B1230] bg-[#FFE14D]"
                  style={{ [k.includes('n') ? 'top' : 'bottom']: -10, [k.includes('w') ? 'left' : 'right']: -10, cursor: `${k}-resize` } as any} />
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-muted tnum">{name} · crop {Math.round(crop.w * bmp.width)}×{Math.round(crop.h * bmp.height)} px</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setBmp(null)}>Choose another</Button>
            <Button onClick={() => place('fill')}>Fill the canvas</Button>
            <Button variant="primary" onClick={() => place('fit')}>Fit across plots</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function BitmapCanvas({ bmp }: { bmp: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  }, [bmp]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
