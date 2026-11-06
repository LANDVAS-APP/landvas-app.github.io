// 🔐 Lockpick: a pick sweeps round the lock. Tap (or press space) when it's inside the gold notch to set the pin.
// Set every pin to open the lock — the chest pays, and the next lock has more pins, smaller notches and a faster pick.
// A miss snaps a pick (three picks). 45 seconds.
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, popText, useGame, type GameProps } from '../games';

export function Lockpick({ seed, level, onEnd, onScore }: GameProps) {
  return useGame(() => {
    const r = rng(seed);
    let ang = 0, dir = 1, speed = 2.2, pins: { at: number; w: number; set: boolean }[] = [], cur = 0, score = 0, picks = 3, over = false, t0 = 0, locks = 0, shake = 0, open = 0, combo = 0;
    const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    let W = 400, H = 700;
    const newLock = () => {
      const n = Math.min(6, 3 + Math.floor(locks / 2)); pins = [];
      for (let i = 0; i < n; i++) pins.push({ at: r() * Math.PI * 2, w: Math.max(0.22, 0.55 - locks * 0.04 - level * 0.005), set: false });
      cur = 0; speed = Math.min(5.5, 2.2 + locks * 0.35); dir = r() < 0.5 ? 1 : -1;
    };
    newLock();
    const tap = () => {
      if (over || open > 0) return;
      const p = pins[cur]; let d = Math.abs(((ang - p.at) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (d < p.w / 2) {
        p.set = true; cur++; combo++; const bonus = d < p.w / 6 ? 2 : 1; const pts = (8 + combo * 2) * bonus; score += pts; dir *= -1; sfx.tick();
        pops.push({ x: W / 2, y: H * 0.42 - 150, t: bonus > 1 ? `Perfect! +${pts}` : `+${pts}`, life: 0.7, c: bonus > 1 ? '#FFE36B' : '#fff' });
        if (cur >= pins.length) { locks++; const b = 30 + locks * 15; score += b; open = 0.9; sfx.coin(); pops.push({ x: W / 2, y: H * 0.42 + 160, t: `🔓 Unlocked! +${b}`, life: 1.1, c: '#7CFFB2' }); }
      } else {
        picks--; combo = 0; shake = 0.35; sfx.fail(); pops.push({ x: W / 2, y: H * 0.42 - 150, t: picks > 0 ? 'Snap! 🪛' : 'Out of picks!', life: 0.8, c: '#FF7A7A' });
        d = 0;
      }
    };
    return {
      update(dt: number, t: number) {
        if (over) return true;
        t0 = t; ang += dir * speed * dt; if (shake > 0) shake -= dt;
        if (open > 0) { open -= dt; if (open <= 0) newLock(); }
        if (picks <= 0 || t > 45) over = true;
        return over;
      },
      draw(g: CanvasRenderingContext2D, w: number, h: number) {
        W = w; H = h;
        const gr = g.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h * 0.42, h * 0.7); gr.addColorStop(0, '#3A2A4A'); gr.addColorStop(1, '#0E0A14'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        const cx = w / 2 + (shake > 0 ? Math.sin(t0 * 80) * 6 : 0), cy = h * 0.42, R = Math.min(w * 0.36, 150);
        // the lock body
        g.fillStyle = '#B8862E'; g.beginPath(); g.arc(cx, cy, R + 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#8A6420'; g.beginPath(); g.arc(cx, cy, R + 12, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#2A1E10'; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
        // shackle
        g.strokeStyle = '#C9CCD6'; g.lineWidth = 22; g.beginPath(); g.arc(cx, cy - R - 20 - (open > 0 ? (0.9 - open) * 60 : 0), R * 0.6, Math.PI, 0); g.stroke();
        // the notch for the current pin
        const p = pins[cur];
        if (p && open <= 0) { g.strokeStyle = '#FFD23F'; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, R, p.at - p.w / 2 - Math.PI / 2, p.at + p.w / 2 - Math.PI / 2); g.stroke(); g.strokeStyle = '#FFF4B0'; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, R, p.at - p.w / 6 - Math.PI / 2, p.at + p.w / 6 - Math.PI / 2); g.stroke(); }
        // the pick
        g.save(); g.translate(cx, cy); g.rotate(ang); g.strokeStyle = '#E8E8F0'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R - 10); g.stroke(); g.fillStyle = '#E8E8F0'; g.beginPath(); g.arc(0, -R - 10, 6, 0, Math.PI * 2); g.fill(); g.restore();
        // keyhole and pins
        g.fillStyle = '#1A120A'; g.beginPath(); g.arc(cx, cy - 10, 18, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy); g.lineTo(cx + 6, cy + 34); g.lineTo(cx - 6, cy + 34); g.fill();
        pins.forEach((q, i) => { g.fillStyle = q.set ? '#7CFFB2' : i === cur ? '#FFD23F' : '#5A4A3A'; g.beginPath(); g.roundRect(cx - pins.length * 14 + i * 28 + 4, cy + R + 50, 20, 34, 6); g.fill(); });
        popText(pops, g, 1 / 60);
        g.font = '800 18px ui-rounded, system-ui'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('🪛'.repeat(Math.max(0, picks)), 14, h - 24);
        g.textAlign = 'right'; g.fillText(`🔓 ${locks}   ${Math.max(0, Math.ceil(45 - t0))}s`, w - 14, h - 24);
        emoji(g, '🧰', w / 2, h - 90, 44);
        g.textAlign = 'center'; g.font = '700 13px ui-rounded, system-ui'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('Tap when the pick is in the gold', w / 2, 96);
      },
      down() { tap(); },
      key(k: string, d: boolean) { if (d && (k === ' ' || k === 'Enter')) tap(); },
      score: () => score,
    };
  }, onEnd, onScore);
}
