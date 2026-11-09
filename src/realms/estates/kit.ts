// Small shared pieces for the Estate minigames: the header bar, the opening instructions, sparkle bursts.
/** the realm screen draws its score pill and Stop button over the top 52px; games keep their own bar below it */
export const HUD_Y = 56, TOP = 98;
/** how long the how-to card is up: games hold still until then */
export const INTRO = 3.2;
export type Pop = { x: number; y: number; t: string; life: number; c: string };
export type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: string; s: number };

/** the top bar: score, then whatever else (time, lives, combo) */
export function hud(g: CanvasRenderingContext2D, w: number, score: number, right: string, accent = '#FFE14D', left2 = '') {
  // below the realm screen's own score pill and Stop button
  const y = HUD_Y;
  g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.roundRect(10, y, w - 20, 34, 12); g.fill();
  g.textBaseline = 'middle'; g.font = '900 20px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillStyle = accent; g.fillText(`${Math.round(score)}`, 22, y + 17);
  if (left2) { const sw = g.measureText(`${Math.round(score)}`).width; g.font = '800 13px ui-rounded, system-ui'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(left2, 34 + sw, y + 17); }
  g.font = '800 15px ui-rounded, system-ui'; g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText(right, w - 22, y + 17);
}
/** the how-to-play card over the first seconds */
export function intro(g: CanvasRenderingContext2D, w: number, h: number, t: number, lines: string[], until = 3.2) {
  if (t > until) return;
  const a = Math.min(1, (until - t) * 2); g.globalAlpha = a;
  const bw = Math.min(w - 40, 340), bh = 30 + lines.length * 22;
  g.fillStyle = 'rgba(8,6,20,0.72)'; g.beginPath(); g.roundRect(w / 2 - bw / 2, h / 2 - bh / 2, bw, bh, 18); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.font = i ? '700 14px ui-rounded, system-ui' : '900 17px ui-rounded, system-ui'; g.fillText(l, w / 2, h / 2 - bh / 2 + 26 + i * 22); });
  g.globalAlpha = 1;
}
export function pops(list: Pop[], g: CanvasRenderingContext2D, dt: number, size = 18) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]; p.life -= dt; p.y -= 46 * dt;
    g.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); g.fillStyle = p.c; g.font = `900 ${size}px ui-rounded, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeText(p.t, p.x, p.y); g.fillText(p.t, p.x, p.y); g.globalAlpha = 1;
    if (p.life <= 0) list.splice(i, 1);
  }
}
export function burst(list: Spark[], x: number, y: number, colors: string[], n = 16, speed = 220) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7); list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, c: colors[i % colors.length], s: 2 + Math.random() * 3 }); }
}
export function sparks(list: Spark[], g: CanvasRenderingContext2D, dt: number, gravity = 300) {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]; s.life -= dt; s.vy += gravity * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    g.globalAlpha = Math.max(0, s.life * 1.6); g.fillStyle = s.c; g.beginPath(); g.arc(s.x, s.y, s.s, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    if (s.life <= 0) list.splice(i, 1);
  }
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const hearts = (n: number, max = 3) => '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, max - n));
/** a big rounded button drawn on the canvas; returns its box for hit tests */
export function button(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, label: string, opts: { text?: string; font?: string; down?: boolean; ring?: string } = {}) {
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.roundRect(x, y + (opts.down ? 1 : 4), w, h, 14); g.fill();
  g.fillStyle = fill; g.beginPath(); g.roundRect(x, y + (opts.down ? 3 : 0), w, h, 14); g.fill();
  if (opts.ring) { g.strokeStyle = opts.ring; g.lineWidth = 3; g.stroke(); }
  g.fillStyle = opts.text ?? '#fff'; g.font = opts.font ?? '900 16px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + w / 2, y + h / 2 + (opts.down ? 3 : 0));
  return { x, y, w, h };
}
export const inBox = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
