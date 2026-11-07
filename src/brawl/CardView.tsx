// A Paintbrawl card on screen: painted on a canvas at the screen's sharpness, alive (the creature breathes, foils
// shimmer) while it's on screen, and it tilts toward your finger or pointer like a real card in the light.
import { memo, useEffect, useRef, type CSSProperties } from 'react';
import { isPhone } from '../lib/gfx';
import { cn } from '../lib/utils';
import { drawBack, drawCard, drawLandCard, type CardDraw } from './cardArt';
import type { Terrain } from '../shared/brawl/cards';

// one shared clock for every live card (phones redraw less often)
const live = new Set<(t: number) => void>();
let raf = 0, last = 0;
const FPS = isPhone() ? 14 : 30;
function tick(now: number) {
  raf = live.size ? requestAnimationFrame(tick) : 0;
  if (now - last < 1000 / FPS || document.hidden) return;
  last = now;
  const t = now / 1000;
  for (const f of live) f(t);
}
function join(f: (t: number) => void) { live.add(f); if (!raf) raf = requestAnimationFrame(tick); return () => { live.delete(f); }; }

type Props = { id?: string; land?: Terrain; back?: boolean; width: number; animate?: boolean; tilt?: boolean; className?: string; style?: CSSProperties; onClick?(): void; onPointerDown?(e: React.PointerEvent): void; testid?: string; selected?: boolean; glow?: string } & Omit<CardDraw, 't'>;
export const CardView = memo(function CardView({ id, land, back, width, animate = true, tilt = true, className, style, onClick, onPointerDown, testid, selected, glow, ...draw }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const h = Math.round(width * 1.4);
  const key = JSON.stringify(draw);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(width * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    const paint = (t: number) => { g.setTransform(dpr, 0, 0, dpr, 0, 0); if (land) drawLandCard(g, land, width, h, t); else if (back || !id) drawBack(g, width, h, t); else drawCard(g, id, width, h, { ...draw, t }); };
    paint(performance.now() / 1000);
    if (!animate) return;
    // only animate while on screen
    let stop: (() => void) | null = null;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { stop ??= join(paint); } else { stop?.(); stop = null; } });
    io.observe(c);
    return () => { io.disconnect(); stop?.(); };
  }, [id, land, back, width, h, animate, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // tilt toward the pointer
  useEffect(() => {
    const el = wrap.current; if (!el || !tilt) return;
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; el.style.transform = `perspective(700px) rotateY(${x * 18}deg) rotateX(${-y * 18}deg) scale(1.03)`; };
    const leave = () => { el.style.transform = ''; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave); el.addEventListener('pointercancel', leave); el.addEventListener('pointerup', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); el.removeEventListener('pointercancel', leave); el.removeEventListener('pointerup', leave); };
  }, [tilt]);
  return (
    <div ref={wrap} onClick={onClick} onPointerDown={onPointerDown} data-testid={testid} role={onClick || onPointerDown ? 'button' : undefined}
      className={cn('relative shrink-0 rounded-[7%] transition-[transform,box-shadow] duration-150 will-change-transform', onClick && 'cursor-pointer', selected && '-translate-y-3', className)}
      style={{ width, height: h, touchAction: onPointerDown ? 'none' : undefined, boxShadow: selected ? `0 0 0 3px #FFE14D, 0 0 24px 4px ${glow ?? '#FFE14D'}` : glow ? `0 0 18px 2px ${glow}` : '0 6px 16px -6px rgba(0,0,0,0.6)', ...style }}>
      <canvas ref={cv} style={{ width, height: h }} className="block rounded-[7%]" />
    </div>
  );
});
