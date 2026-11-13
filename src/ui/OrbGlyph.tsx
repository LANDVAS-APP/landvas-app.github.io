// The app's map-button icons. Each is one drawing in two paints — white, and its own colours — so the white icon a
// button shows at rest is exactly the colourful one it shows when open. Opening crossfades to colour and starts the
// icon's own little loop (the flame flickers, the clover sways, the book breathes, the bell rings); closing eases it
// back to a still, white icon.
import { motion, useReducedMotion, type TargetAndTransition } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export type GlyphKind = 'flame' | 'clover' | 'book' | 'bell';

const LOOP: Record<GlyphKind, TargetAndTransition> = {
  flame: { scaleY: [1, 1.13, 0.95, 1.09, 1], scaleX: [1, 0.94, 1.04, 0.97, 1], rotate: [-3, 3, -2, 2, -3], transition: { duration: 1.15, repeat: Infinity, ease: 'easeInOut' } },
  clover: { rotate: [0, -14, 12, -8, 0], scale: [1, 1.14, 1.06, 1.1, 1], transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } },
  book: { y: [0, -2.2, 0], rotate: [-5, 5, -5], scale: [1, 1.08, 1], transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } },
  bell: { rotate: [0, 18, -15, 11, -7, 3, 0, 0], transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.12, 0.26, 0.4, 0.52, 0.62, 0.7, 1] } },
};
const REST: TargetAndTransition = { rotate: 0, scale: 1, scaleX: 1, scaleY: 1, y: 0, transition: { type: 'spring', stiffness: 240, damping: 20 } };
const ORIGIN: Record<GlyphKind, string> = { flame: '50% 92%', clover: '50% 55%', book: '50% 60%', bell: '50% 12%' };

export function OrbGlyph({ kind, on, size = 20 }: { kind: GlyphKind; on: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const id = `g${useId().replace(/:/g, '')}`;
  return (
    <motion.span className={cn('lv-glyph', on && 'on')} style={{ width: size, height: size, transformOrigin: ORIGIN[kind] }} animate={on && !reduce ? LOOP[kind] : REST} aria-hidden>
      <svg viewBox="0 0 24 24" className="w">{draw(kind, null)}</svg>
      <svg viewBox="0 0 24 24" className="c">{draw(kind, id)}</svg>
    </motion.span>
  );
}

/** one drawing; `id` set = its colours (gradients named from it), null = all white */
function draw(kind: GlyphKind, id: string | null): ReactNode {
  const W = '#ffffff', soft = 'rgba(122, 98, 255, 0.55)';
  const g = (n: string) => `url(#${id}${n})`;
  switch (kind) {
    case 'flame': return (
      <>
        {id && <defs>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd23f" /><stop offset="0.45" stopColor="#ff7a1c" /><stop offset="1" stopColor="#e3260f" /></linearGradient>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff7c2" /><stop offset="1" stopColor="#ffc93d" /></linearGradient>
        </defs>}
        <path d="M12 1.6c1.1 3.6 4.7 5.4 5.9 9 1.4 4.3-1.5 10-5.9 10s-7.4-4.6-6.2-8.9c.6-2.3 2.3-3.6 2.8-5.9.9 1.2 1.3 2.5 1.2 3.8 1.4-2.2 2.8-5.4 2.2-8z" fill={id ? g('a') : W} />
        <path d="M12 20.6c-2.1 0-3.6-1.6-3.3-3.6.3-1.7 1.9-2.6 2.3-4.3.9 1 1.5 2 1.5 3.2.9-.7 1.5-1.7 1.6-2.8 1.4 1.5 2 2.8 1.7 4.3-.3 1.9-1.7 3.2-3.8 3.2z" fill={id ? g('b') : soft} />
      </>
    );
    case 'clover': {
      const leaf = 'M12 11.4C10.1 9.4 6.9 8.6 6.9 5.7 6.9 4.1 8.1 3 9.6 3c1.1 0 1.9.7 2.4 1.5.5-.8 1.3-1.5 2.4-1.5 1.5 0 2.7 1.1 2.7 2.7 0 2.9-3.2 3.7-5.1 5.7z';
      return (
        <>
          {id && <defs>
            <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9dffcf" /><stop offset="0.5" stopColor="#2fd493" /><stop offset="1" stopColor="#0d8a57" /></linearGradient>
          </defs>}
          <path d="M12.6 13.2c1.6 3.4 3.4 5.9 6.4 8.2" fill="none" stroke={id ? '#1fae74' : W} strokeWidth="1.8" strokeLinecap="round" />
          {[0, 90, 180, 270].map((r) => <path key={r} d={leaf} transform={`rotate(${r} 12 12)`} fill={id ? g('a') : W} />)}
          <circle cx="12" cy="12" r="1.25" fill={id ? '#fff3a0' : soft} />
        </>
      );
    }
    case 'book': return (
      <>
        {id && <defs>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffe9b0" /><stop offset="1" stopColor="#fff8e6" /></linearGradient>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff8e6" /><stop offset="1" stopColor="#ffe3a0" /></linearGradient>
          <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7ac2" /><stop offset="1" stopColor="#8a3bff" /></linearGradient>
        </defs>}
        <path d="M2.2 6.6c3.4-1.3 6.8-1 9.8 1.2v13c-3-1.9-6.4-2.2-9.8-1.1z" fill={id ? g('c') : soft} />
        <path d="M21.8 6.6c-3.4-1.3-6.8-1-9.8 1.2v13c3-1.9 6.4-2.2 9.8-1.1z" fill={id ? g('c') : soft} />
        <path d="M3.2 5.2c3-.9 6-.6 8.8 1.4V19c-2.8-1.6-5.8-1.9-8.8-1z" fill={id ? g('a') : W} />
        <path d="M20.8 5.2c-3-.9-6-.6-8.8 1.4V19c2.8-1.6 5.8-1.9 8.8-1z" fill={id ? g('b') : W} />
        <path d="M5.2 8.6c1.8-.3 3.4 0 4.8.8M5.2 11.4c1.8-.3 3.4 0 4.8.8M14 9.4c1.4-.8 3-1.1 4.8-.8M14 12.2c1.4-.8 3-1.1 4.8-.8" fill="none" stroke={id ? '#c98a2a' : soft} strokeWidth="1.1" strokeLinecap="round" />
      </>
    );
    case 'bell': return (
      <>
        {id && <defs>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" /><stop offset="0.5" stopColor="#ffc93d" /><stop offset="1" stopColor="#e08a12" /></linearGradient>
        </defs>}
        <path d="M12 2.6a6.1 6.1 0 0 0-6.1 6.1v3.7L4.2 16.3c-.3.6.1 1.2.8 1.2h14c.7 0 1.1-.6.8-1.2l-1.7-3.9V8.7A6.1 6.1 0 0 0 12 2.6z" fill={id ? g('a') : W} />
        <path d="M9.6 18.6a2.4 2.4 0 0 0 4.8 0z" fill={id ? '#ff5cae' : W} />
        <path d="M8.6 7.4a3.6 3.6 0 0 1 2.4-2.3" fill="none" stroke={id ? '#fffbe6' : soft} strokeWidth="1.3" strokeLinecap="round" />
      </>
    );
  }
}

/** Luck as liquid: the button fills with green as your Luck fills (gold when it's armed) */
export function LuckLiquid({ fill, armed }: { fill: number; armed?: boolean }) {
  const f = Math.max(0, Math.min(1, fill));
  return (
    <span className={cn('lv-liquid', armed && 'armed', f >= 1 && 'full')} style={{ ['--fill' as string]: f }} aria-hidden>
      <i className="back" /><i className="front" />
    </span>
  );
}
