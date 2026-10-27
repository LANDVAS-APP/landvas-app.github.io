// A canvas of plots drawn by shape only: each owned plot is a tile in its rarity
// colour and painted plots show their published art. There are no coordinates
// here — a mosaic shows what someone owns, never where it is.
import { useEffect, useRef, useState } from 'react';
import type { LandCanvas } from '../backend/types';
import { useAssetUrl } from '../gallery/GalleryScreen';
import { cn } from '../lib/utils';
import { rarityInfo } from '../shared/rarity';

export function LandMosaic({ canvas, size = 180, className, showArt = true }: { canvas: LandCanvas; size?: number; className?: string; showArt?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const art = canvas.art;
  // the published preview covers the canvas exactly when their shapes match
  const aligned = !!art && !!art.preview_width && !!art.preview_height
    && Math.abs(art.preview_width / art.preview_height - canvas.width / canvas.height) < 0.02;
  const url = useAssetUrl(showArt && aligned ? art?.preview_path ?? art?.thumb_path : null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImg(null);
    if (!url) return;
    let live = true;
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => live && setImg(i);
    i.src = url;
    return () => { live = false; };
  }, [url]);

  const side = Math.max(canvas.width, canvas.height);
  const cell = Math.max(3, Math.floor(size / side));
  const w = canvas.width * cell, h = canvas.height * cell;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const gap = cell >= 10 ? 1 : 0;
    for (const [dx, dy, r] of canvas.cells) {
      const info = rarityInfo(r);
      const g = ctx.createLinearGradient(dx * cell, dy * cell, (dx + 1) * cell, (dy + 1) * cell);
      g.addColorStop(0, info.glow);
      g.addColorStop(1, info.color);
      ctx.fillStyle = g;
      ctx.fillRect(dx * cell + gap, dy * cell + gap, cell - gap * 2, cell - gap * 2);
    }
    if (img) {
      // art on its white paper, clipped to the plots it was painted on
      ctx.save();
      ctx.beginPath();
      for (const [dx, dy, , , , painted] of canvas.cells) if (painted) ctx.rect(dx * cell, dy * cell, cell, cell);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    }
  }, [canvas, img, cell, w, h]);

  return (
    <canvas
      ref={ref}
      style={{ width: w, height: h }}
      className={cn('block max-w-full', className)}
      role="img"
      aria-label={`${canvas.plot_count} plot${canvas.plot_count === 1 ? '' : 's'}${art ? ` painted with “${art.title}”` : ''}`}
    />
  );
}
