// 🪁 Kite Flyer: drag left and right to steer your kite through the sky. Gusts (the swirly arrows) lift it; without
// wind it sinks. Collect feathers and stars, keep clear of the storm clouds — and don't let it hit the ground.
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, popText, useGame, type GameProps } from '../games';

type Thing = { x: number; y: number; kind: 'gust' | 'feather' | 'star' | 'storm'; got?: boolean; w: number };
export function KiteFlyer({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((w0, h0) => {
    const r = rng(seed);
    let W = w0, H = h0, kx = w0 / 2, ky = h0 * 0.45, vy = 0, target = w0 / 2, score = 0, lives = 3, hurt = 0, over = false, t0 = 0, scroll = 0, combo = 0;
    const things: Thing[] = []; const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    let spawnY = 0; const trail: { x: number; y: number }[] = [];
    const spawn = () => {
      const roll = r(), x = 40 + r() * (W - 80);
      const kind: Thing['kind'] = roll < 0.3 ? 'gust' : roll < 0.62 ? 'feather' : roll < 0.74 ? 'star' : 'storm';
      things.push({ x, y: -60 - spawnY, kind, w: kind === 'storm' ? 70 + r() * 40 : 28 });
      spawnY += 50 + r() * 60 - Math.min(30, level * 1.5);
    };
    for (let i = 0; i < 12; i++) spawn();
    let dragging = false;
    return {
      update(dt: number, t: number) {
        if (over) return true;
        t0 = t; const speed = 120 + t * 3; scroll += speed * dt;
        kx += (target - kx) * Math.min(1, dt * 5);
        vy += 70 * dt; ky += vy * dt; ky = Math.max(60, ky);
        if (hurt > 0) hurt -= dt;
        for (const th of things) {
          th.y += speed * dt;
          if (th.got || Math.abs(th.x - kx) > th.w / 2 + 22 || Math.abs(th.y - ky) > th.w / 2 + 22) continue;
          th.got = true;
          if (th.kind === 'gust') { vy = -170; sfx.swish?.(); pops.push({ x: kx, y: ky - 30, t: 'Whoosh!', life: 0.7, c: '#BDEBFF' }); }
          else if (th.kind === 'storm') { lives--; hurt = 1; combo = 0; vy = 60; sfx.fail(); pops.push({ x: kx, y: ky - 30, t: '⚡ Zap!', life: 1, c: '#FF6B6B' }); }
          else { combo++; const p = (th.kind === 'star' ? 40 : 10) + Math.min(20, combo * 2); score += p; sfx.coin(); pops.push({ x: th.x, y: th.y, t: `+${p}`, life: 0.8, c: th.kind === 'star' ? '#FFE36B' : '#fff' }); }
        }
        for (let i = things.length - 1; i >= 0; i--) if (things[i].y > H + 80) { things.splice(i, 1); spawn(); }
        if (ky > H - 40) { lives--; hurt = 1; ky = H * 0.45; vy = -120; sfx.fail(); pops.push({ x: kx, y: H - 80, t: 'Bump!', life: 1, c: '#FF6B6B' }); }
        trail.push({ x: kx, y: ky }); if (trail.length > 24) trail.shift();
        if (lives <= 0 || t > 45) over = true;
        return over;
      },
      draw(g: CanvasRenderingContext2D, w: number, h: number) {
        W = w; H = h;
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5AA8F0'); gr.addColorStop(1, '#E8F6FF'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < 6; i++) { const y = ((i * 170 + scroll * 0.35) % (h + 200)) - 100, x = (i * 137) % w; g.beginPath(); g.ellipse(x, y, 60, 20, 0, 0, Math.PI * 2); g.ellipse(x + 40, y - 10, 40, 16, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#7CC45A'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 20) g.lineTo(x, h - 26 - Math.sin(x / 50) * 8); g.lineTo(w, h); g.fill();
        for (const th of things) {
          if (th.got) continue;
          if (th.kind === 'storm') { g.fillStyle = '#5A6070'; g.beginPath(); g.ellipse(th.x, th.y, th.w / 2, th.w / 3.4, 0, 0, Math.PI * 2); g.ellipse(th.x + th.w / 4, th.y - 10, th.w / 3, th.w / 4, 0, 0, Math.PI * 2); g.fill(); emoji(g, '⚡', th.x, th.y + th.w / 3, 26); }
          else emoji(g, th.kind === 'gust' ? '🌬️' : th.kind === 'star' ? '⭐' : '🪶', th.x, th.y, th.kind === 'gust' ? 40 : 30);
        }
        // the string, the trail, the kite
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2, (h + ky) / 2 + 40, kx, ky + 14); g.stroke();
        g.strokeStyle = '#FF5F9E'; g.lineWidth = 3; g.beginPath(); g.moveTo(kx, ky + 20); for (let i = 1; i <= 10; i++) g.lineTo(kx + Math.sin(i * 0.9 + t0 * 7) * 6 + (kx - (trail[0]?.x ?? kx)) * -0.04 * i, ky + 20 + i * 6); g.stroke();
        for (let i = 2; i <= 10; i += 3) emoji(g, '🎀', kx + Math.sin(i * 0.9 + t0 * 7) * 6, ky + 20 + i * 6, 12);
        g.globalAlpha = hurt > 0 && Math.floor(hurt * 12) % 2 ? 0.4 : 1;
        g.save(); g.translate(kx, ky); g.rotate(Math.max(-0.4, Math.min(0.4, (target - kx) * 0.004)));
        g.fillStyle = '#FF5F6D'; g.beginPath(); g.moveTo(0, -26); g.lineTo(18, 0); g.lineTo(0, 22); g.lineTo(-18, 0); g.closePath(); g.fill();
        g.fillStyle = '#FFD23F'; g.beginPath(); g.moveTo(0, -26); g.lineTo(18, 0); g.lineTo(0, 0); g.fill(); g.beginPath(); g.moveTo(0, 22); g.lineTo(-18, 0); g.lineTo(0, 0); g.fill();
        g.restore(); g.globalAlpha = 1;
        popText(pops, g, 1 / 60);
        g.font = '800 18px ui-rounded, system-ui'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('❤️'.repeat(Math.max(0, lives)), 14, h - 14);
        g.textAlign = 'right'; g.fillText(`${Math.max(0, Math.ceil(45 - t0))}s`, w - 14, h - 14);
        g.textAlign = 'center'; g.font = '700 13px ui-rounded, system-ui'; g.fillStyle = 'rgba(30,50,80,0.75)'; g.fillText('Drag to steer · fly through 🌬️ gusts to climb · dodge the storms', w / 2, 112);
      },
      down(p: { x: number }) { dragging = true; target = p.x; },
      up() { dragging = false; },
      key(k: string, d: boolean) { if (!d) return; if (k === 'ArrowLeft' || k === 'a') target = Math.max(30, target - 70); if (k === 'ArrowRight' || k === 'd') target = Math.min(W - 30, target + 70); },
      move(p: { x: number }) { if (dragging) target = p.x; },
      score: () => score,
    };
  }, onEnd, onScore);
}
