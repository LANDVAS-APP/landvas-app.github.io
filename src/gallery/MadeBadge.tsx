// How a piece of art was made, at a glance:
//   drawn  — painted by hand in the LANDVAS editor, no uploaded image ever placed in it (the Ink seal)
//   upload — an uploaded image was placed into it
// Art published before uploads were tracked (made = null) shows nothing rather than guessing.
import { ImageUp } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../lib/utils';
import type { ArtMade } from '../backend/types';

export const MADE_TEXT = {
  drawn: { label: 'Drawn on LANDVAS', short: 'Hand-drawn', explain: 'Painted by hand in the LANDVAS editor. No uploaded images.' },
  upload: { label: 'Uses an uploaded image', short: 'Uploaded image', explain: 'An image from outside LANDVAS was placed into this art.' },
} as const;

/** The LANDVAS seal: a scalloped ink rosette with a brush-stroke tick. */
export function InkSeal({ size = 18, className }: { size?: number; className?: string }) {
  const gid = `lv-seal-${useId().replace(/:/g, '')}`;
  const pts = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 9.1 : 10.6;
    return `${(12 + Math.cos(a) * r).toFixed(2)},${(12 + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22E3FF" /><stop offset="0.55" stopColor="#8B6BFF" /><stop offset="1" stopColor="#FF3D9A" />
        </linearGradient>
      </defs>
      <polygon points={pts} fill={`url(#${gid})`} />
      <circle cx="12" cy="12" r="6.9" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.8" />
      <path d="M8.1 12.4c1 .7 1.9 1.6 2.6 2.8 1.4-3 3-4.9 5.3-6.6" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Pill for detail views: the seal + "Drawn on LANDVAS", or a plain note for uploaded imagery. */
export function MadeBadge({ made, className, withText = false }: { made: ArtMade | undefined; className?: string; withText?: boolean }) {
  if (made !== 'drawn' && made !== 'upload') return null;
  const t = MADE_TEXT[made];
  return (
    <div className={cn('grid gap-1', className)} data-testid={`made-${made}`}>
      {made === 'drawn' ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[12px] font-extrabold text-fg"
          style={{ background: 'linear-gradient(90deg, rgba(34,227,255,.16), rgba(139,107,255,.16))', boxShadow: 'inset 0 0 0 1px rgba(139,107,255,.45)' }}>
          <InkSeal size={20} /> {t.label}
        </span>
      ) : (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line-strong bg-surface-2/70 px-3 py-1 text-[12px] font-bold text-muted">
          <ImageUp className="h-3.5 w-3.5" /> {t.label}
        </span>
      )}
      {withText && <span className="text-xs text-faint">{t.explain}</span>}
    </div>
  );
}

/** Small corner mark for thumbnails. */
export function MadeMark({ made, className }: { made: ArtMade | undefined; className?: string }) {
  if (made === 'drawn') {
    return <span className={cn('grid place-items-center rounded-full bg-black/35 p-0.5 backdrop-blur-sm', className)} title={MADE_TEXT.drawn.label} aria-label={MADE_TEXT.drawn.label} data-testid="made-mark-drawn"><InkSeal size={18} /></span>;
  }
  if (made === 'upload') {
    return <span className={cn('grid h-[22px] w-[22px] place-items-center rounded-full bg-black/55 text-white/85 backdrop-blur-sm', className)} title={MADE_TEXT.upload.label} aria-label={MADE_TEXT.upload.label} data-testid="made-mark-upload"><ImageUp className="h-3 w-3" /></span>;
  }
  return null;
}
