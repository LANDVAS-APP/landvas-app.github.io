// A live, animated creature in a little stage (used in the studio, cards and profiles).
import { useEffect, useRef } from 'react';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import type { Genome } from './genome';
import { drawCreature, type CreatureState } from './rig';

export function CreatureView({ genome, size = 160, state = 'idle', cycle, className, ground = true, testid }: {
  genome: Genome; size?: number; state?: CreatureState; cycle?: boolean; className?: string; ground?: boolean; testid?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const still = useUi((s) => s.settings.reduceMotion);
  const g = useRef(genome);
  g.current = genome;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const seq: CreatureState[] = ['idle', 'look', 'walk', 'happy', 'idle', 'eat', 'sleep'];
    let visible = true;
    const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; });
    io.observe(c);
    const frame = (now: number) => {
      const t = still ? 1 : (now - t0) / 1000;
      if (visible) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        if (ground) {
          const gr = ctx.createRadialGradient(size / 2, size * 0.86, 0, size / 2, size * 0.86, size * 0.5);
          gr.addColorStop(0, 'rgba(120,220,150,0.35)');
          gr.addColorStop(1, 'rgba(120,220,150,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, size, size);
        }
        const st = cycle ? seq[Math.floor(t / 2.6) % seq.length] : state;
        drawCreature(ctx, g.current, size / 2, size * 0.86, size * 0.62, { t, state: st, dir: 1, look: Math.sin(t * 0.8) * 0.8 });
      }
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [size, state, cycle, still, ground]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={cn('block', className)} data-testid={testid} />;
}
