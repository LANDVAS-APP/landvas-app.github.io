// The living art on cataclysm and wonder cards: each one is a tiny looping animation of what the card does — the
// volcano erupting, snowballs rolling down a slope, a wave curling, the ground cracking, lightning, a candy tornado,
// vines, bubbling swamp, meteors, the moon sliding over the sun, a black hole swirling — and each wonder standing in
// its little landscape (the peak smoking, the beanstalk swaying, the gate's portal turning…).
import type { Card } from '../shared/brawl/cards';

const H = (i: number, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const sky = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: string, b: string) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(x, y, w, h); };
const dot = (g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.3, r), 0, Math.PI * 2); g.fill(); };
const glow = (g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string, a = 1) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };
const zig = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, n: number, j: number, seed: number) => { g.beginPath(); g.moveTo(x0, y0); for (let i = 1; i < n; i++) { const k = i / n; g.lineTo(x0 + (x1 - x0) * k + (H(i, seed) - 0.5) * j, y0 + (y1 - y0) * k); } g.lineTo(x1, y1); g.stroke(); };

/** Paint a cataclysm's or wonder's art window. Returns false for ordinary cards. */
export function drawSpecialArt(g: CanvasRenderingContext2D, c: Card, x: number, y: number, w: number, h: number, t: number): boolean {
  const id = c.fx ? c.fx : c.wonder ? c.id : null; if (!id) return false;
  const s = Math.min(w, h) / 100; // a unit that scales with the window
  const gy = y + h * 0.78;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  switch (id) {
    case 'eruption': {
      sky(g, x, y, w, h, '#1A0408', '#8A2A10'); glow(g, x + w / 2, y + h * 0.3, h * 0.7, 'rgba(255,90,20,0.55)');
      for (let i = 0; i < 5; i++) { const k = (t * 0.15 + H(i)) % 1; g.globalAlpha = 0.45 * (1 - k); dot(g, x + w / 2 + (H(i, 2) - 0.5) * w * 0.3 + k * 10 * s, y + h * 0.3 - k * h * 0.4, (8 + k * 22) * s, '#2A2024'); } g.globalAlpha = 1;
      g.fillStyle = '#2A1410'; g.beginPath(); g.moveTo(x + w * 0.05, gy + 4 * s); g.lineTo(x + w * 0.4, y + h * 0.36); g.lineTo(x + w * 0.6, y + h * 0.36); g.lineTo(x + w * 0.95, gy + 4 * s); g.fill();
      g.strokeStyle = '#FF7A20'; g.lineWidth = 1.6 * s; for (let i = 0; i < 4; i++) { g.globalAlpha = 0.6 + Math.sin(t * 4 + i) * 0.3; zig(g, x + w * (0.42 + i * 0.05), y + h * 0.38, x + w * (0.3 + i * 0.13), gy, 5, 6 * s, i); } g.globalAlpha = 1;
      for (let i = 0; i < 28; i++) { const k = (t * 0.9 + H(i)) % 1, vx = (H(i, 1) - 0.5) * w * 0.7, vy = h * (0.55 + H(i, 3) * 0.35); dot(g, x + w / 2 + vx * k, y + h * 0.36 - vy * k + h * 1.1 * k * k, (1.2 + H(i, 4) * 1.8) * s, ['#FFF0A0', '#FFB020', '#FF5A10'][i % 3]); }
      g.fillStyle = '#FF6A10'; g.fillRect(x, gy, w, h); for (let i = 0; i < 10; i++) dot(g, x + ((H(i) * w + t * 8 * s) % w), gy + 3 * s + H(i, 5) * h * 0.15, (3 + H(i, 6) * 4) * s, '#3A1008');
      break;
    }
    case 'avalanche': {
      sky(g, x, y, w, h, '#6A8AB0', '#DDEEFF');
      g.fillStyle = '#F4FBFF'; g.beginPath(); g.moveTo(x, y + h * 0.12); g.lineTo(x + w, gy); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill();
      g.fillStyle = '#C8E4F8'; g.beginPath(); g.moveTo(x, y + h * 0.2); g.lineTo(x + w * 0.8, gy + 4 * s); g.lineTo(x, y + h); g.fill();
      for (let i = 0; i < 5; i++) { const k = (t * 0.45 + i / 5) % 1, bx = x + k * w, by = y + h * 0.12 + k * (gy - y - h * 0.12), r = (4 + i * 1.5) * s; dot(g, bx, by - r, r, '#FFFFFF'); g.strokeStyle = '#A8CCE8'; g.lineWidth = 0.8 * s; g.beginPath(); g.arc(bx, by - r, r, t * 6 + i, t * 6 + i + 2); g.stroke(); }
      for (let i = 0; i < 30; i++) { const k = (t * 0.6 + H(i)) % 1; dot(g, x + ((H(i, 1) * w + k * w * 0.6) % w), y + k * h, 0.9 * s, '#FFFFFF'); }
      break;
    }
    case 'tidalwave': {
      sky(g, x, y, w, h, '#7FD0FF', '#E8FAFF');
      const sx = x + ((t * 0.25) % 1) * w * 0.3 - w * 0.15;
      g.fillStyle = '#0A5A9A'; g.beginPath(); g.moveTo(x - 5, gy); g.quadraticCurveTo(sx + w * 0.2, gy - h * 0.1, sx + w * 0.45, y + h * 0.25); g.quadraticCurveTo(sx + w * 0.62, y + h * 0.12, sx + w * 0.72, y + h * 0.3); g.quadraticCurveTo(sx + w * 0.6, y + h * 0.28, sx + w * 0.62, y + h * 0.42); g.lineTo(sx + w * 0.8, gy); g.lineTo(x + w + 5, gy); g.lineTo(x + w + 5, y + h); g.lineTo(x - 5, y + h); g.fill();
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 2.4 * s; g.beginPath(); g.moveTo(sx + w * 0.4, y + h * 0.3); g.quadraticCurveTo(sx + w * 0.6, y + h * 0.08, sx + w * 0.73, y + h * 0.3); g.stroke();
      for (let i = 0; i < 14; i++) { const k = (t * 1.2 + H(i)) % 1; dot(g, sx + w * (0.62 + H(i, 1) * 0.2), y + h * 0.25 - Math.sin(k * Math.PI) * h * 0.15, 1.2 * s, '#FFFFFF'); }
      g.fillStyle = '#2A8AD0'; g.fillRect(x, gy, w, h);
      break;
    }
    case 'earthquake': {
      sky(g, x, y, w, h, '#C8A87A', '#F0DCC0');
      const jit = Math.sin(t * 40) * 1.2 * s * (Math.sin(t * 2) > 0 ? 1 : 0.2);
      g.fillStyle = '#7A5A3A'; g.fillRect(x, y + h * 0.5 + jit, w, h);
      g.strokeStyle = '#1A0E06'; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) { g.lineWidth = (2 + Math.sin(t * 2 + i)) * s; zig(g, x + w * (0.1 + i * 0.25), y + h * 0.5 + jit, x + w * (0.2 + i * 0.22), y + h, 6, 14 * s, i + 3); }
      g.strokeStyle = '#FF8A30'; g.lineWidth = 0.8 * s; for (let i = 0; i < 4; i++) zig(g, x + w * (0.1 + i * 0.25), y + h * 0.5 + jit, x + w * (0.2 + i * 0.22), y + h, 6, 14 * s, i + 3);
      for (let i = 0; i < 6; i++) { const k = (t * 1.1 + H(i)) % 1; g.fillStyle = '#5A4A3A'; const rx = x + H(i, 2) * w, ry = y + h * 0.5 - Math.sin(k * Math.PI) * h * 0.35; g.fillRect(rx - 2 * s, ry - 2 * s, 4 * s, 4 * s); }
      break;
    }
    case 'thunderstorm': {
      sky(g, x, y, w, h, '#0A0A18', '#2A2A48');
      const f = (t * 0.8) % 1, on = f < 0.08;
      if (on) { g.fillStyle = 'rgba(200,230,255,0.35)'; g.fillRect(x, y, w, h); }
      for (let i = 0; i < 5; i++) dot(g, x + w * (0.1 + i * 0.2) + Math.sin(t + i) * 3 * s, y + h * 0.12, (12 + H(i) * 6) * s, '#4A4A5E');
      g.strokeStyle = 'rgba(160,190,230,0.6)'; g.lineWidth = 0.6 * s; for (let i = 0; i < 18; i++) { const k = (t * 2 + H(i)) % 1, rx = x + H(i, 1) * w; g.beginPath(); g.moveTo(rx, y + h * 0.2 + k * h * 0.8); g.lineTo(rx - 2 * s, y + h * 0.26 + k * h * 0.8); g.stroke(); }
      if (f < 0.18) { const bx = x + w * (0.25 + H(Math.floor(t * 0.8)) * 0.5); g.strokeStyle = '#FFFFFF'; g.lineWidth = 2 * s; zig(g, bx, y + h * 0.18, bx + 4 * s, gy, 7, 12 * s, Math.floor(t * 0.8)); g.strokeStyle = 'rgba(120,210,255,0.6)'; g.lineWidth = 5 * s; zig(g, bx, y + h * 0.18, bx + 4 * s, gy, 7, 12 * s, Math.floor(t * 0.8)); }
      g.fillStyle = '#1A1A2A'; g.fillRect(x, gy, w, h);
      break;
    }
    case 'cyclone': {
      sky(g, x, y, w, h, '#FFB3D9', '#FFF0F8');
      const cx = x + w / 2 + Math.sin(t * 1.3) * w * 0.12;
      for (let i = 0; i < 9; i++) { const k = i / 8, yy = gy - k * h * 0.7, rw = (6 + k * k * 34) * s; g.fillStyle = i % 2 ? '#FF4FA8' : '#FFFFFF'; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(cx + Math.sin(t * 5 + i) * 2 * s, yy, rw, 4 * s, 0, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      for (let i = 0; i < 14; i++) { const a = t * 6 + i, k = H(i), yy = gy - k * h * 0.7, r = (8 + k * k * 34) * s; dot(g, cx + Math.cos(a) * r, yy + Math.sin(a) * 2 * s, 1.6 * s, ['#FFE14D', '#8AE0FF', '#3DDC97', '#B57BFF'][i % 4]); }
      g.fillStyle = '#FF9AD0'; g.fillRect(x, gy, w, h);
      break;
    }
    case 'overgrowth': {
      sky(g, x, y, w, h, '#BFF0C8', '#F0FFF0');
      g.fillStyle = '#3E8A3A'; g.fillRect(x, gy, w, h);
      const grow = 0.5 + 0.5 * Math.sin(t * 0.8);
      for (let v = 0; v < 4; v++) {
        g.strokeStyle = '#2F7A3A'; g.lineWidth = 2.4 * s; g.beginPath(); const bx = x + w * (0.15 + v * 0.23);
        for (let i = 0; i <= 20 * grow; i++) { const k = i / 20; const px = bx + Math.sin(k * 9 + v) * 6 * s, py = gy - k * h * 0.75; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); if (i % 4 === 2) { g.save(); g.fillStyle = '#5FD26A'; g.beginPath(); g.ellipse(px + 3 * s, py, 3 * s, 1.4 * s, 0.5, 0, Math.PI * 2); g.fill(); g.restore(); } }
        g.stroke();
        if (grow > 0.8) dot(g, bx + Math.sin(9 * grow + v) * 6 * s, gy - grow * h * 0.75, 2.6 * s, ['#FF8AC2', '#FFE14D', '#FFFFFF', '#FF8AC2'][v]);
      }
      break;
    }
    case 'bogrise': {
      sky(g, x, y, w, h, '#2A1840', '#5A3A6A');
      const lvl = gy - (0.5 + 0.5 * Math.sin(t * 0.9)) * h * 0.25;
      g.fillStyle = '#5A2A8A'; g.fillRect(x, lvl, w, h);
      g.fillStyle = '#7A4AAA'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(x + H(i) * w, lvl + 4 * s + H(i, 1) * h * 0.2, 10 * s, 3 * s, 0, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 9; i++) { const k = (t * 0.7 + H(i)) % 1; g.strokeStyle = `rgba(220,190,255,${1 - k})`; g.lineWidth = 1 * s; g.beginPath(); g.arc(x + H(i, 2) * w, lvl - k * 10 * s, (1.5 + k * 4) * s, 0, Math.PI * 2); g.stroke(); }
      break;
    }
    case 'meteors': {
      sky(g, x, y, w, h, '#1A0A10', '#7A2A10');
      for (let i = 0; i < 4; i++) { const k = (t * 0.7 + i / 4) % 1, mx = x + w * (0.1 + H(i) * 0.5) + k * w * 0.4, my = y + k * (gy - y);
        const gr = g.createLinearGradient(mx - 18 * s, my - 18 * s, mx, my); gr.addColorStop(0, 'rgba(255,160,40,0)'); gr.addColorStop(1, 'rgba(255,220,120,1)'); g.strokeStyle = gr; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(mx - 18 * s, my - 18 * s); g.lineTo(mx, my); g.stroke(); dot(g, mx, my, 2.6 * s, '#FFF0C0');
        if (k > 0.9) glow(g, mx, gy, 16 * s, 'rgba(255,140,40,0.9)'); }
      g.fillStyle = '#2A1410'; g.fillRect(x, gy, w, h);
      break;
    }
    case 'eclipse': {
      const k = 0.5 + 0.5 * Math.sin(t * 0.6), dark = Math.max(0, 1 - Math.abs(k - 0.5) * 4);
      sky(g, x, y, w, h, '#0A0A28', '#2A2A5A'); g.fillStyle = `rgba(0,0,0,${dark * 0.6})`; g.fillRect(x, y, w, h);
      for (let i = 0; i < 16; i++) dot(g, x + H(i) * w, y + H(i, 1) * h * 0.7, 0.8 * s, `rgba(255,255,255,${0.3 + dark * 0.7})`);
      const cx = x + w / 2, cy = y + h * 0.42, r = 15 * s;
      glow(g, cx, cy, r * 2.4, 'rgba(255,240,180,0.9)', 0.5 + dark * 0.5);
      dot(g, cx, cy, r, '#FFF6D8');
      dot(g, cx - r * 2.2 + k * r * 4.4, cy, r * 1.02, '#05030A');
      g.fillStyle = '#1A1A30'; g.fillRect(x, gy, w, h);
      break;
    }
    case 'blackhole': {
      g.fillStyle = '#05020C'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 20; i++) dot(g, x + H(i) * w, y + H(i, 1) * h, 0.7 * s, 'rgba(255,255,255,0.6)');
      const cx = x + w / 2, cy = y + h * 0.5;
      glow(g, cx, cy, 34 * s, 'rgba(180,120,255,0.8)');
      for (let i = 0; i < 40; i++) { const a = t * (2 + H(i) * 2) + i, r = (10 + H(i, 1) * 22) * s; dot(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.35, 1.2 * s, ['#FFE0A0', '#FF9A50', '#B57BFF'][i % 3]); }
      dot(g, cx, cy, 9 * s, '#000000');
      g.strokeStyle = 'rgba(255,220,160,0.8)'; g.lineWidth = 1 * s; g.beginPath(); g.arc(cx, cy, 9.5 * s, 0, Math.PI * 2); g.stroke();
      break;
    }
    // ---- wonders ----
    case 'smolderpeak': {
      sky(g, x, y, w, h, '#3A1414', '#C86A3A');
      for (let i = 0; i < 4; i++) { const k = (t * 0.25 + i / 4) % 1; g.globalAlpha = 0.5 * (1 - k); dot(g, x + w / 2 + k * 14 * s, y + h * 0.32 - k * h * 0.3, (5 + k * 14) * s, '#3A3036'); } g.globalAlpha = 1;
      g.fillStyle = '#3A2420'; g.beginPath(); g.moveTo(x + w * 0.18, gy); g.lineTo(x + w * 0.44, y + h * 0.34); g.lineTo(x + w * 0.56, y + h * 0.34); g.lineTo(x + w * 0.82, gy); g.fill();
      glow(g, x + w / 2, y + h * 0.35, 10 * s, 'rgba(255,120,30,1)', 0.6 + Math.sin(t * 4) * 0.3);
      g.fillStyle = '#4A3020'; g.fillRect(x, gy, w, h);
      g.font = `900 ${Math.round(14 * s)}px ui-rounded, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3 * s; g.strokeStyle = '#140A1E'; g.strokeText(String(3 - (Math.floor(t * 0.7) % 3)), x + w / 2, y + h * 0.58); g.fillStyle = '#FFB13D'; g.fillText(String(3 - (Math.floor(t * 0.7) % 3)), x + w / 2, y + h * 0.58);
      break;
    }
    case 'beanstalk': {
      sky(g, x, y, w, h, '#8FD8FF', '#E8FFF0');
      for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(x + ((t * 4 * s + i * w * 0.6) % (w + 30)) - 15, y + h * (0.12 + i * 0.1), 14 * s, 5 * s, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#4FA552'; g.fillRect(x, gy, w, h);
      g.strokeStyle = '#2F8A3A'; g.lineWidth = 4 * s; g.beginPath();
      for (let i = 0; i <= 24; i++) { const k = i / 24, px = x + w / 2 + Math.sin(k * 10 + t) * 7 * s * k, py = gy - k * h * 0.9; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke();
      for (let i = 2; i < 24; i += 3) { const k = i / 24, px = x + w / 2 + Math.sin(k * 10 + t) * 7 * s * k, py = gy - k * h * 0.9; g.fillStyle = '#62D66E'; g.beginPath(); g.ellipse(px + (i % 2 ? 5 : -5) * s, py, 5 * s, 2 * s, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'mirrorlake': {
      sky(g, x, y, w, h, '#9FD8F5', '#F2FBFF');
      for (let i = 0; i < 3; i++) { g.fillStyle = '#DDF2FF'; g.beginPath(); g.moveTo(x + w * (0.05 + i * 0.32), y + h * 0.55); g.lineTo(x + w * (0.2 + i * 0.32), y + h * 0.2); g.lineTo(x + w * (0.35 + i * 0.32), y + h * 0.55); g.fill(); }
      g.fillStyle = '#FFFFFF'; g.fillRect(x, y + h * 0.55, w, h);
      const lg = g.createLinearGradient(0, y + h * 0.6, 0, y + h); lg.addColorStop(0, '#BFEFFF'); lg.addColorStop(1, '#3A9AD8'); g.fillStyle = lg; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.76, w * 0.42, h * 0.16, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 4; i++) { g.strokeStyle = `rgba(255,255,255,${0.4 + Math.sin(t * 2 + i) * 0.3})`; g.lineWidth = 1 * s; g.beginPath(); g.moveTo(x + w * (0.25 + i * 0.12) + Math.sin(t + i) * 3 * s, y + h * (0.72 + (i % 2) * 0.06)); g.lineTo(x + w * (0.32 + i * 0.12) + Math.sin(t + i) * 3 * s, y + h * (0.72 + (i % 2) * 0.06)); g.stroke(); }
      break;
    }
    case 'toadstoolhut': {
      sky(g, x, y, w, h, '#2A1840', '#6A4A7A');
      g.fillStyle = '#3A2A40'; g.fillRect(x, gy, w, h);
      g.fillStyle = '#F0E2C8'; g.fillRect(x + w * 0.4, y + h * 0.45, w * 0.2, gy - y - h * 0.45);
      g.fillStyle = '#D0284A'; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.46, w * 0.3, h * 0.22, 0, Math.PI, 0); g.fill();
      for (let i = 0; i < 5; i++) dot(g, x + w * (0.3 + i * 0.1), y + h * (0.36 + (i % 2) * 0.05), 2.4 * s, '#FFF4E8');
      g.fillStyle = '#5A3A1A'; g.fillRect(x + w * 0.46, gy - h * 0.14, w * 0.08, h * 0.14);
      glow(g, x + w * 0.56, y + h * 0.58, 6 * s, 'rgba(255,200,60,1)', 0.7 + Math.sin(t * 3) * 0.2); dot(g, x + w * 0.56, y + h * 0.58, 1.8 * s, '#FFE48A');
      for (let i = 0; i < 4; i++) { const k = (t * 0.3 + i / 4) % 1; dot(g, x + w * (0.2 + i * 0.2), gy - k * h * 0.4, 1 * s, `rgba(200,255,160,${1 - k})`); }
      break;
    }
    case 'gumballmachine': {
      sky(g, x, y, w, h, '#FFC8E8', '#FFF4FA');
      g.fillStyle = '#FFB3D9'; g.fillRect(x, gy, w, h);
      g.fillStyle = '#E8323C'; g.fillRect(x + w * 0.38, y + h * 0.58, w * 0.24, gy - y - h * 0.58);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x + w / 2, y + h * 0.38, h * 0.24, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 16; i++) dot(g, x + w / 2 + (H(i) - 0.5) * h * 0.36, y + h * 0.42 + (H(i, 1) - 0.3) * h * 0.24 + Math.sin(t * 3 + i) * 0.5 * s, 3 * s, ['#FF4D6D', '#FFE14D', '#3DDC97', '#22B8FF', '#B57BFF'][i % 5]);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.4 * s; g.beginPath(); g.arc(x + w / 2, y + h * 0.38, h * 0.24, -2.4, -1.6); g.stroke();
      { const k = (t * 0.5) % 1; dot(g, x + w * 0.62 + k * w * 0.25, gy - 2 * s - Math.abs(Math.sin(k * 9)) * 5 * s * (1 - k), 2.6 * s, '#FF4D6D'); }
      break;
    }
    case 'stormspire': {
      sky(g, x, y, w, h, '#0A0A1E', '#2A1A50');
      g.fillStyle = '#120A2A'; g.fillRect(x, gy, w, h);
      g.fillStyle = '#2A2A40'; g.beginPath(); g.moveTo(x + w * 0.44, gy); g.lineTo(x + w * 0.5, y + h * 0.18); g.lineTo(x + w * 0.56, gy); g.fill();
      glow(g, x + w / 2, y + h * 0.18, 10 * s, 'rgba(34,227,255,1)', 0.6 + Math.sin(t * 8) * 0.3);
      for (let i = 0; i < 2; i++) { g.strokeStyle = '#22E3FF'; g.lineWidth = 1.2 * s; g.beginPath(); g.ellipse(x + w / 2, y + h * (0.4 + i * 0.18), (10 - i * 3) * s, 2.5 * s, 0, t * (i ? -3 : 2), t * (i ? -3 : 2) + 4.5); g.stroke(); }
      if ((t * 1.3) % 1 < 0.15) { g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.4 * s; zig(g, x + w / 2, y + h * 0.18, x + w * (0.15 + H(Math.floor(t * 1.3)) * 0.7), gy, 6, 8 * s, Math.floor(t * 1.3)); }
      break;
    }
    case 'riftgate': {
      sky(g, x, y, w, h, '#1A1030', '#4A3A6A');
      g.fillStyle = '#3A3048'; g.fillRect(x, gy, w, h);
      const cx = x + w / 2, cy = y + h * 0.48, r = h * 0.28;
      for (let i = 0; i < 50; i++) { const a = -t * 2 + i * 0.4, rr = (i / 50) * r * 0.85; dot(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, (2.6 - i * 0.03) * s, `hsl(${270 + Math.sin(i) * 40}, 90%, ${55 + (i % 3) * 10}%)`); }
      g.strokeStyle = '#7A7088'; g.lineWidth = 5 * s; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#5A5268'; g.fillRect(cx - r * 1.2, gy - 3 * s, r * 2.4, 4 * s);
      glow(g, cx, cy, r * 1.4, 'rgba(180,120,255,0.6)');
      break;
    }
  }
  const v = g.createRadialGradient(x + w / 2, y + h / 2, h * 0.2, x + w / 2, y + h / 2, h * 0.9); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = v; g.fillRect(x, y, w, h);
  g.restore();
  return true;
}
