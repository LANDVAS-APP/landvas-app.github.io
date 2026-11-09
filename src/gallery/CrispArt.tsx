// Shows a piece of art sharp at any size. Plot art is 256 px per plot, so on big screens it's
// always being enlarged: plain smoothing makes it blurry, plain `pixelated` makes uneven blocks.
// This does "sharp bilinear": enlarge by a whole number with no smoothing (every art pixel the
// same size, edges crisp), then smoothly shrink to exactly the screen's pixels.
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export function CrispArt({ src, alt, fit = 'contain', className, onLoad }: {
  src: string | null | undefined; alt: string; fit?: 'contain' | 'cover'; className?: string; onLoad?(img: HTMLImageElement): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setImg(null);
    if (!src) return;
    const i = new Image();
    i.decoding = 'async';
    let live = true;
    i.onload = () => { if (live) { setImg(i); onLoad?.(i); } };
    i.src = src;
    return () => { live = false; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current;
    if (!c || !img || !size || !size.w || !size.h) return;
    const dpr = Math.min(3, devicePixelRatio || 1);
    const W = Math.round(size.w * dpr), H = Math.round(size.h * dpr);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    // the part of the art that's shown, and where it lands in the box
    const s = fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (fit === 'cover') { sw = Math.min(iw, W / s); sh = Math.min(ih, H / s); sx = (iw - sw) / 2; sy = (ih - sh) / 2; }
    const dw = Math.round(sw * s), dh = Math.round(sh * s);
    c.width = dw; c.height = dh;
    c.style.width = `${dw / dpr}px`; c.style.height = `${dh / dpr}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const k = Math.max(1, Math.ceil(s)); // whole-number enlargement first
    if (k === 1) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      return;
    }
    const big = document.createElement('canvas');
    big.width = Math.ceil(sw * k); big.height = Math.ceil(sh * k);
    const b = big.getContext('2d');
    if (!b) return;
    b.imageSmoothingEnabled = false;
    b.drawImage(img, sx, sy, sw, sh, 0, 0, big.width, big.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, dw, dh);
  }, [img, size, fit]);

  return (
    <div ref={box} className={cn('relative flex h-full w-full items-center justify-center overflow-hidden', className)}>
      <canvas ref={cv} role="img" aria-label={alt} className={cn('block', !img && 'hidden')} />
      {!img && <div className="absolute inset-0 animate-pulse bg-surface-2" />}
    </div>
  );
}
