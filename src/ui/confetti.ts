// A burst of paint confetti over everything: drops, squares and little brush strokes in the
// LANDVAS palette. Fire-and-forget; skipped when the player prefers reduced motion.
const COLORS = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#7B5CFF', '#FF4FD8', '#22C7B5'];

type Opts = { x?: number; y?: number; count?: number; spread?: number; power?: number; colors?: string[]; angle?: number };

export function confetti(opts: Opts = {}) {
  if (typeof window === 'undefined') return;
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduceMotion === 'true') return;
  } catch { /* ignore */ }
  const c = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  Object.assign(c.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '9999' });
  document.body.appendChild(c);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const ox = opts.x ?? innerWidth / 2, oy = opts.y ?? innerHeight * 0.45;
  const n = opts.count ?? 140, spread = opts.spread ?? Math.PI * 2, power = opts.power ?? 1;
  const colors = opts.colors ?? COLORS;
  const parts = Array.from({ length: n }, () => {
    const a = (opts.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * spread;
    const v = (6 + Math.random() * 9) * power;
    return {
      x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      s: 5 + Math.random() * 7, color: colors[(Math.random() * colors.length) | 0], shape: (Math.random() * 3) | 0, life: 0,
    };
  });
  const t0 = performance.now();
  const tick = (t: number) => {
    const age = t - t0;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - age / 2600);
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.color;
      if (p.shape === 0) g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      else if (p.shape === 1) { g.beginPath(); g.arc(0, 0, p.s / 2.2, 0, Math.PI * 2); g.fill(); }
      else { g.beginPath(); g.ellipse(0, 0, p.s, p.s / 3.4, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    if (age < 2800) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}

/** Two side cannons — for the big moments. */
export function confettiCannons() {
  confetti({ x: 0, y: innerHeight * 0.7, spread: 0.9, count: 90, power: 1.35, angle: -Math.PI / 3 });
  setTimeout(() => confetti({ x: innerWidth, y: innerHeight * 0.7, spread: 0.9, count: 90, power: 1.35, angle: (-2 * Math.PI) / 3 }), 120);
}
