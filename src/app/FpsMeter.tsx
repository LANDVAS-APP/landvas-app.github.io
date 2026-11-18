// Settings → Show frame rate: a little meter in the corner — frames a second, and the slowest frame of the last second —
// so a player (or the team on a test phone) can see exactly which screens struggle. It only runs while it's switched on.
import { useEffect, useRef } from 'react';
import { useUi } from '../lib/store';

/** the meter's numbers from a second of frame times (ms between frames) */
export function fpsStats(gaps: number[]) {
  if (!gaps.length) return { fps: 0, worst: 0 };
  const total = gaps.reduce((a, b) => a + b, 0);
  return { fps: Math.round((gaps.length * 1000) / Math.max(1, total)), worst: Math.round(Math.max(...gaps)) };
}

export function FpsMeter() {
  const on = useUi((s) => !!s.settings.fpsMeter);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!on) return;
    let raf = 0, last = 0, gaps: number[] = [], since = performance.now();
    const loop = (t: number) => {
      if (last) gaps.push(t - last);
      last = t;
      if (t - since >= 1000) {
        const { fps, worst } = fpsStats(gaps);
        const n = el.current;
        if (n) { n.textContent = `${fps} fps · worst ${worst} ms`; n.className = `lv-fps${fps < 40 || worst > 80 ? ' bad' : fps < 55 || worst > 40 ? ' slow' : ''}`; }
        gaps = []; since = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // (in the background there are no frames: start counting afresh on the way back)
    const back = () => { last = 0; gaps = []; since = performance.now(); };
    document.addEventListener('visibilitychange', back);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', back); };
  }, [on]);
  if (!on) return null;
  return <div ref={el} className="lv-fps" data-testid="fps-meter">– fps</div>;
}
