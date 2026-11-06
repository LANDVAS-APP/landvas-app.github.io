// 🍔 Burger Stack: the ticket shows a burger, bottom to top. Ingredients fall from the kitchen — slide the plate to
// catch the next one the ticket needs. Catch the wrong thing and the tower wobbles (three wobbles and it topples).
// Finish a burger and it's served; the next ticket is taller. 45 seconds.
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { popText, useGame, type GameProps } from '../games';

type Layer = 'bun' | 'patty' | 'cheese' | 'lettuce' | 'tomato' | 'onion' | 'bacon' | 'top';
const LOOK: Record<Layer, { c: string; h: number; w: number; edge?: string }> = {
  bun: { c: '#E3A04A', h: 16, w: 92, edge: '#C47F2A' }, patty: { c: '#6B3A1E', h: 15, w: 96, edge: '#4A2612' }, cheese: { c: '#FFC93D', h: 6, w: 102 },
  lettuce: { c: '#6CC24A', h: 8, w: 104 }, tomato: { c: '#E8483C', h: 8, w: 90 }, onion: { c: '#E9D8F0', h: 6, w: 88 }, bacon: { c: '#C8553D', h: 7, w: 100 },
  top: { c: '#E8A54E', h: 30, w: 94, edge: '#C47F2A' },
};
const FILL: Layer[] = ['patty', 'cheese', 'lettuce', 'tomato', 'onion', 'bacon'];
const drawLayer = (g: CanvasRenderingContext2D, l: Layer, x: number, y: number, s = 1) => {
  const L = LOOK[l], w = L.w * s, h = L.h * s;
  g.fillStyle = L.c;
  if (l === 'top') { g.beginPath(); g.ellipse(x, y, w / 2, h, 0, Math.PI, 0); g.fill(); g.fillStyle = '#FFF4D6'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(x - w * 0.3 + i * w * 0.12, y - h * 0.55 - (i % 2) * 5 * s, 3 * s, 1.6 * s, 0.4, 0, Math.PI * 2); g.fill(); } return; }
  if (l === 'lettuce') { g.beginPath(); g.moveTo(x - w / 2, y); for (let i = 0; i <= 10; i++) g.lineTo(x - w / 2 + (i * w) / 10, y - h + (i % 2) * h * 0.8); g.lineTo(x + w / 2, y); g.closePath(); g.fill(); return; }
  if (l === 'cheese') { g.beginPath(); g.moveTo(x - w / 2, y - h); g.lineTo(x + w / 2, y - h); g.lineTo(x + w / 2 - 8 * s, y + 6 * s); g.lineTo(x + w / 2 - 16 * s, y); g.lineTo(x - w / 2 + 10 * s, y); g.lineTo(x - w / 2 + 4 * s, y + 7 * s); g.closePath(); g.fill(); return; }
  g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, h / 2); g.fill();
  if (L.edge) { g.fillStyle = L.edge; g.fillRect(x - w / 2 + h / 2, y - h * 0.35, w - h, h * 0.25); }
  if (l === 'tomato') { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - w * 0.2, y - h * 0.8, w * 0.4, 2 * s); }
};
export function BurgerStack({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((w0, h0) => {
    const r = rng(seed);
    let W = w0, H = h0, px = w0 / 2, target = w0 / 2, score = 0, lives = 3, wobble = 0, combo = 0, over = false, t0 = 0, made = 0, shake = 0, flying = -1;
    let ticket: Layer[] = [], stack: Layer[] = [];
    const falling: { x: number; y: number; vy: number; l: Layer; spin: number }[] = [];
    const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    const newTicket = () => { const n = Math.min(6, 2 + Math.floor(made / 2) + (level >= 8 ? 1 : 0)); ticket = ['bun', ...Array.from({ length: n }, () => FILL[Math.floor(r() * Math.min(FILL.length, 3 + Math.floor(level / 4)))]), 'top']; stack = []; wobble = 0; };
    newTicket();
    let spawnT = 0.4, dragging = false;
    const need = () => ticket[stack.length];
    return {
      update(dt: number, t: number) {
        if (over) return true;
        t0 = t; px += (target - px) * Math.min(1, dt * 14);
        spawnT -= dt;
        if (spawnT <= 0) {
          // the next layer the ticket needs comes often; decoys the rest of the time
          const l: Layer = r() < 0.45 ? need() : r() < 0.15 ? 'bun' : (['top', ...FILL] as Layer[])[Math.floor(r() * (FILL.length + 1))];
          falling.push({ x: 50 + r() * (W - 100), y: 120, vy: 150 + Math.min(170, t * 3 + made * 6), l, spin: (r() - 0.5) * 2 });
          spawnT = Math.max(0.45, 0.95 - t * 0.008 - made * 0.02);
        }
        if (shake > 0) shake -= dt;
        if (flying >= 0) { flying += dt; if (flying > 0.7) { flying = -1; newTicket(); } }
        const plateY = H - 90, topY = plateY - stack.reduce((s, l) => s + LOOK[l].h, 0);
        for (let i = falling.length - 1; i >= 0; i--) {
          const f = falling[i]; f.y += f.vy * dt;
          if (flying < 0 && f.y >= topY - 4 && f.y <= topY + 18 && Math.abs(f.x - px) < 52) {
            falling.splice(i, 1);
            if (f.l === need()) {
              stack.push(f.l); combo++; const p = 5 + Math.min(15, combo); score += p; sfx.tick(); pops.push({ x: px, y: topY - 20, t: `+${p}`, life: 0.6, c: '#fff' });
              if (stack.length === ticket.length) { made++; const b = ticket.length * 12 + made * 4; score += b; sfx.coin(); pops.push({ x: px, y: topY - 50, t: `🍔 Order up! +${b}`, life: 1.1, c: '#FFE36B' }); flying = 0; }
            } else {
              wobble++; combo = 0; shake = 0.35; sfx.fail(); pops.push({ x: px, y: topY - 20, t: wobble >= 3 ? 'Timber!' : 'Wobble!', life: 0.8, c: '#FF7A7A' });
              if (wobble >= 3) { lives--; stack = []; wobble = 0; }
            }
            continue;
          }
          if (f.y > H + 40) falling.splice(i, 1);
        }
        if (lives <= 0 || t > 45) over = true;
        return over;
      },
      draw(g: CanvasRenderingContext2D, w: number, h: number) {
        W = w; H = h;
        // the kitchen: tiles, a pass shelf, warm light
        g.fillStyle = '#F6EFE2'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(0,0,0,0.06)'; for (let x = 0; x < w; x += 36) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        g.fillStyle = '#E8484C'; g.fillRect(0, 96, w, 14); g.fillStyle = '#C8CCD4'; g.fillRect(0, h - 70, w, 70);
        // the ticket
        g.fillStyle = '#FFFFFF'; g.strokeStyle = '#1C1A1F'; g.lineWidth = 2; const tw = 74, th = 26 + ticket.length * 13; g.beginPath(); g.roundRect(w - tw - 10, 120, tw, th, 8); g.fill(); g.stroke();
        g.fillStyle = '#1C1A1F'; g.font = '800 11px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText('TICKET', w - tw / 2 - 10, 134);
        [...ticket].reverse().forEach((l, i) => { const idx = ticket.length - 1 - i; g.globalAlpha = idx < stack.length ? 0.3 : 1; drawLayer(g, l, w - tw / 2 - 10, 152 + i * 13, 0.5); g.globalAlpha = 1; if (idx === stack.length) { g.fillStyle = '#E8484C'; g.beginPath(); g.moveTo(w - tw - 6, 146 + i * 13); g.lineTo(w - tw + 2, 150 + i * 13); g.lineTo(w - tw - 6, 154 + i * 13); g.fill(); } });
        for (const f of falling) { g.save(); g.translate(f.x, f.y); g.rotate(Math.sin(t0 * 3 + f.spin) * 0.25); drawLayer(g, f.l, 0, 0, 0.8); g.restore(); }
        // the plate and the stack
        const plateY = h - 90, sx = shake > 0 ? Math.sin(t0 * 70) * 6 : 0, lean = wobble * 0.04 * Math.sin(t0 * 6);
        g.save(); g.translate(px + sx, plateY);
        if (flying >= 0) g.translate(flying * 600, -flying * 300);
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(0, 6, 66, 10, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#B8BCC6'; g.lineWidth = 2; g.stroke();
        let y = 0; stack.forEach((l, i) => { g.save(); g.translate(Math.sin(i * 1.3) * lean * 40, 0); drawLayer(g, l, 0, y); g.restore(); y -= LOOK[l].h; });
        g.restore();
        popText(pops, g, 1 / 60);
        g.font = '800 18px ui-rounded, system-ui'; g.fillStyle = '#1C1A1F'; g.textAlign = 'left'; g.fillText('❤️'.repeat(Math.max(0, lives)) + '  ' + '〰️'.repeat(wobble), 14, h - 24);
        g.textAlign = 'right'; g.fillText(`🍔 ${made}   ${Math.max(0, Math.ceil(45 - t0))}s`, w - 14, h - 24);
        g.textAlign = 'center'; g.font = '700 13px ui-rounded, system-ui'; g.fillStyle = 'rgba(28,26,31,0.7)'; g.fillText('Slide the plate · catch what the ticket needs next', w / 2, 86);
      },
      down(p: { x: number }) { dragging = true; target = p.x; },
      up() { dragging = false; },
      move(p: { x: number }) { if (dragging) target = p.x; },
      key(k: string, d: boolean) { if (!d) return; if (k === 'ArrowLeft' || k === 'a') target = Math.max(60, target - 80); if (k === 'ArrowRight' || k === 'd') target = Math.min(W - 60, target + 80); },
      score: () => score,
    };
  }, onEnd, onScore);
}
