// A tiny particle engine on one full-screen <canvas>: ink droplets, sparks and glitter with gravity and drag.
// One rAF loop for everything, sleeping when nothing is alive, so the roll stays at 60 fps on phones.
export type BurstOpts = {
  x: number; y: number; colors: string[]; count: number;
  speed?: number; gravity?: number; size?: number; spread?: number; up?: number;
  kind?: 'mix' | 'drop' | 'spark' | 'glitter' | 'emoji' | 'streak'; life?: number;
  /** for kind 'emoji': which glyphs */ emojis?: string[];
  /** aim every particle at this angle (radians; default: up, spread by `spread`) */ angle?: number;
  /** spawn on a ring this far out, moving inwards (an implosion) */ ring?: number;
  /** spawn spread over a rectangle (w × h centred on x, y) */ area?: [number, number];
  drag?: number;
};
type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; life: number; decay: number; g: number; k: 0 | 1 | 2 | 3 | 4; rot: number; spin: number; em?: HTMLCanvasElement; drag: number };
const EMOJI = new Map<string, HTMLCanvasElement>();
function emojiImg(e: string) {
  let c = EMOJI.get(e);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 72;
    const g = c.getContext('2d')!; g.font = '56px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 36, 40);
    EMOJI.set(e, c);
  }
  return c;
}

export class Fx {
  private ctx: CanvasRenderingContext2D;
  private parts: P[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  constructor(private cv: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d')!;
    this.resize();
  }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  burst(o: BurstOpts) {
    const speed = o.speed ?? 10, size = o.size ?? 1, g = o.gravity ?? 0.26, spread = o.spread ?? Math.PI * 2, up = o.up ?? 0.3;
    // (phones: cap the count so a Genesis roll can't drop frames)
    const n = Math.min(o.count, 480 - this.parts.length);
    for (let i = 0; i < n; i++) {
      let x = o.x, y = o.y, vx: number, vy: number;
      const v = speed * (0.3 + Math.random() * 0.95);
      if (o.ring) {
        const a = Math.random() * Math.PI * 2; x = o.x + Math.cos(a) * o.ring; y = o.y + Math.sin(a) * o.ring;
        vx = -Math.cos(a) * v; vy = -Math.sin(a) * v;
      } else {
        const a = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * spread;
        vx = Math.cos(a) * v; vy = Math.sin(a) * v - (o.angle == null ? speed * up : 0);
      }
      if (o.area) { x += (Math.random() - 0.5) * o.area[0]; y += (Math.random() - 0.5) * o.area[1]; }
      const k: P['k'] = o.kind === 'drop' ? 0 : o.kind === 'spark' ? 1 : o.kind === 'glitter' ? 2 : o.kind === 'emoji' ? 3 : o.kind === 'streak' ? 4 : (Math.random() < 0.55 ? 0 : Math.random() < 0.6 ? 1 : 2);
      this.parts.push({
        x, y, vx, vy,
        r: (k === 0 ? 2.5 + Math.random() * 5 : k === 3 ? 14 + Math.random() * 14 : k === 4 ? 2 + Math.random() * 2 : 1.5 + Math.random() * 3.5) * size,
        c: o.colors[(Math.random() * o.colors.length) | 0], life: 1, decay: (0.010 + Math.random() * 0.008) / (o.life ?? 1),
        g: k === 2 ? g * 0.25 : g, k, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.2, drag: o.drag ?? 0.982,
        em: k === 3 && o.emojis?.length ? emojiImg(o.emojis[(Math.random() * o.emojis.length) | 0]) : undefined,
      });
    }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
  }
  private loop = () => {
    const now = performance.now();
    const dt = Math.min(2.5, (now - this.last) / 16.67);
    this.last = now;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    let alive = 0;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.vx *= p.drag ** dt;
      p.vy = p.vy * p.drag ** dt + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= p.decay * dt; p.rot += (p.k === 3 ? p.spin : 0.18) * dt;
      if (p.life <= 0 || p.y > this.h + 60 || p.y < -200) { p.life = 0; continue; }
      alive++;
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = p.c;
      if (p.k === 3 && p.em) {
        const r = p.r * (0.7 + 0.3 * Math.min(1, p.life * 2));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(p.em, -r, -r, r * 2, r * 2); ctx.restore();
      } else if (p.k === 4) {
        // a streak: a bright head and a fading tail along its path
        ctx.strokeStyle = p.c; ctx.lineWidth = p.r; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 5, p.y - p.vy * 5); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.3, 0, Math.PI * 2); ctx.fill();
      } else if (p.k === 1) {
        // a four-point star
        const r = p.r * 1.8;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-r, -0.8, r * 2, 1.6); ctx.fillRect(-0.8, -r, 1.6, r * 2);
        ctx.restore();
      } else if (p.k === 2) {
        ctx.globalAlpha *= 0.55 + 0.45 * Math.sin(p.rot * 3); // glitter twinkles
        ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.55 + p.life * 0.45), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (alive) this.raf = requestAnimationFrame(this.loop);
    else { this.raf = 0; this.parts = []; ctx.clearRect(0, 0, this.w, this.h); }
  };
  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; this.parts = []; }
}
