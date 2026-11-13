// The roll's particles, solved in closed form: each burst is a seed and a moment, and every droplet, spark, glitter
// fleck, emoji and streak is a pure function of its age (gravity and drag integrated exactly). So the live roll and its
// clip draw the very same particles at the very same places, at 60 fps or 30, on a phone or in a 9:16 frame.
import type { Layout } from './layout';
import { rng } from './math';
import type { Burst } from './trace';

type P = { ox: number; oy: number; vx: number; vy: number; r: number; c: string; decay: number; g: number; k: 0 | 1 | 2 | 3 | 4; rot: number; spin: number; em?: string };
const made = new WeakMap<Burst, P[]>();
const FRAME = 1000 / 60;

function build(b: Burst): P[] {
  let ps = made.get(b);
  if (ps) return ps;
  const R = rng(b.seed);
  ps = [];
  for (let i = 0; i < b.count; i++) {
    const v = b.speed * (0.3 + R() * 0.95);
    let ox = 0, oy = 0, vx: number, vy: number;
    if (b.ring) {
      const a = R() * Math.PI * 2; ox = Math.cos(a); oy = Math.sin(a);
      vx = -Math.cos(a) * v; vy = -Math.sin(a) * v;
    } else {
      const a = (b.angle ?? -Math.PI / 2) + (R() - 0.5) * b.spread;
      vx = Math.cos(a) * v; vy = Math.sin(a) * v - (b.angle == null ? b.speed * b.up : 0);
    }
    if (b.area) { ox += R() - 0.5; oy += R() - 0.5; }
    const k: P['k'] = b.kind === 'drop' ? 0 : b.kind === 'spark' ? 1 : b.kind === 'glitter' ? 2 : b.kind === 'emoji' ? 3 : b.kind === 'streak' ? 4 : (R() < 0.55 ? 0 : R() < 0.6 ? 1 : 2);
    const r = (k === 0 ? 2.5 + R() * 5 : k === 3 ? 14 + R() * 14 : k === 4 ? 2 + R() * 2 : 1.5 + R() * 3.5) * b.size;
    ps.push({
      ox, oy, vx, vy, r, k, c: b.colors[(R() * b.colors.length) | 0], decay: (0.01 + R() * 0.008) / b.life,
      g: k === 2 ? b.gravity * 0.25 : b.gravity, rot: R() * 6, spin: (R() - 0.5) * 0.2,
      em: k === 3 && b.emojis?.length ? b.emojis[(R() * b.emojis.length) | 0] : undefined,
    });
  }
  made.set(b, ps);
  return ps;
}

const EMOJI = new Map<string, HTMLCanvasElement>();
export function emojiImg(e: string, px = 72) {
  const key = `${e}@${px}`;
  let c = EMOJI.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.font = `${Math.round(px * 0.78)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, px / 2, px * 0.555);
    EMOJI.set(key, c);
  }
  return c;
}

/** draw every live particle at time t */
export function drawParticles(g: CanvasRenderingContext2D, L: Layout, bursts: Burst[], t: number, u0: number) {
  const S = L.u / (u0 || L.u);
  let budget = 900;
  for (const b of bursts) {
    if (t < b.t || t - b.t > 1720 * b.life + 60) continue;
    const a = (t - b.t) / FRAME;
    const X0 = b.a === 0 ? L.cx + b.x * L.u : b.x * L.W, Y0 = b.a === 0 ? L.cy + b.y * L.u : b.y * L.H;
    const ring = b.ring ? b.ring * L.u : 0;
    const aw = b.area ? b.area[0] * (b.a === 0 ? L.u : L.W) : 0, ah = b.area ? b.area[1] * (b.a === 0 ? L.u : L.H) : 0;
    const kd = -Math.log(Math.min(0.99999, Math.max(0.5, b.drag)));
    const decayV = Math.exp(-kd * a), E = b.drag >= 0.99999 ? a : (1 - decayV) / kd;
    for (const p of build(b)) {
      const life = 1 - p.decay * a;
      if (life <= 0) continue;
      if (budget-- <= 0) return;
      const sx = X0 + (ring ? p.ox * ring : p.ox * aw), sy = Y0 + (ring ? p.oy * ring : p.oy * ah);
      const gS = p.g * S;
      const x = sx + p.vx * S * E;
      const y = b.drag >= 0.99999 ? sy + p.vy * S * a + 0.5 * gS * a * a : sy + p.vy * S * E + (gS / kd) * (a - E);
      if (y > L.H + 60 || y < -200 || x < -120 || x > L.W + 120) continue;
      const rot = p.rot + (p.k === 3 ? p.spin : 0.18) * a, r = p.r * S;
      g.globalAlpha = Math.min(1, life * 1.5);
      g.fillStyle = p.c;
      if (p.k === 3 && p.em) {
        const rr = r * (0.7 + 0.3 * Math.min(1, life * 2));
        g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(emojiImg(p.em), -rr, -rr, rr * 2, rr * 2); g.restore();
      } else if (p.k === 4) {
        // a streak: a bright head and a fading tail along its path
        const vx = p.vx * S * decayV, vy = b.drag >= 0.99999 ? (p.vy + p.g * a) * S : (p.vy * S - gS / kd) * decayV + gS / kd;
        g.strokeStyle = p.c; g.lineWidth = r; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - vx * 5, y - vy * 5); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r * 1.3, 0, Math.PI * 2); g.fill();
      } else if (p.k === 1) {
        // a four-point star
        const rr = r * 1.8, w = 0.8 * Math.max(1, S);
        g.save(); g.translate(x, y); g.rotate(rot);
        g.fillRect(-rr, -w, rr * 2, w * 2); g.fillRect(-w, -rr, w * 2, rr * 2);
        g.restore();
      } else if (p.k === 2) {
        g.globalAlpha *= 0.55 + 0.45 * Math.sin(rot * 3); // glitter twinkles
        g.fillRect(x - r / 2, y - r / 2, r, r);
      } else {
        g.beginPath(); g.arc(x, y, r * (0.55 + life * 0.45), 0, Math.PI * 2); g.fill();
      }
    }
  }
  g.globalAlpha = 1;
}
