// 🛤️ Minecart Rush: ride three rails down into the mine. Swipe or tap left/right to switch rails, swipe up (or tap
// the cart) to jump the gaps; grab ore and gems, dodge the rockfalls. It speeds up the longer you last.
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, popText, useGame, type GameProps } from '../games';

type Thing = { lane: number; z: number; kind: 'ore' | 'gem' | 'rock' | 'gap' | 'gold'; got?: boolean };
export function MinecartRush({ seed, level, onEnd, onScore }: GameProps) {
  return useGame(() => {
    const r = rng(seed);
    let lane = 1, laneX = 1, jump = 0, speed = 9 + Math.min(4, level * 0.2), dist = 0, score = 0, lives = 3, hurt = 0, over = false, t0 = 0;
    const things: Thing[] = []; const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    let spawnAt = 18, sx = 0, sy = 0, swiping = false;
    const spawn = () => {
      const roll = r(); const l = Math.floor(r() * 3);
      if (roll < 0.18) things.push({ lane: l, z: spawnAt, kind: 'gap' });
      else if (roll < 0.4) things.push({ lane: l, z: spawnAt, kind: 'rock' });
      else { const k = r() < 0.08 ? 'gem' : r() < 0.2 ? 'gold' : 'ore'; for (let i = 0; i < 3; i++) things.push({ lane: l, z: spawnAt + i * 1.4, kind: k }); }
      spawnAt += 5 + r() * 5;
    };
    for (let i = 0; i < 6; i++) spawn();
    const move = (d: number) => { lane = Math.max(0, Math.min(2, lane + d)); };
    const hop = () => { if (jump <= 0) { jump = 0.75; sfx.tick?.(); } };
    return {
      update(dt: number, t: number) {
        if (over) return true;
        t0 = t; speed += dt * 0.12; dist += speed * dt; laneX += (lane - laneX) * Math.min(1, dt * 14);
        if (jump > 0) jump -= dt; if (hurt > 0) hurt -= dt;
        while (spawnAt - dist < 40) spawn();
        for (const th of things) {
          const dz = th.z - dist; if (th.got || dz > 0.6 || dz < -0.6) continue;
          if (th.lane !== lane) continue;
          if (th.kind === 'gap') { if (jump <= 0) { th.got = true; lives--; hurt = 0.8; sfx.fail(); pops.push({ x: 0, y: 0, t: 'Oof!', life: 1, c: '#FF6B6B' }); } }
          else if (th.kind === 'rock') { if (jump <= 0.15) { th.got = true; lives--; hurt = 0.8; sfx.fail(); pops.push({ x: 0, y: 0, t: 'Rockfall!', life: 1, c: '#FF6B6B' }); } }
          else { th.got = true; const p = th.kind === 'gem' ? 60 : th.kind === 'gold' ? 25 : 10; score += p; sfx.coin?.(); pops.push({ x: 0, y: 0, t: `+${p}`, life: 0.8, c: th.kind === 'gem' ? '#8FE3FF' : '#FFE36B' }); }
        }
        for (let i = things.length - 1; i >= 0; i--) if (things[i].z - dist < -3) things.splice(i, 1);
        if (lives <= 0 || t > 45) over = true;
        return over;
      },
      draw(g: CanvasRenderingContext2D, w: number, h: number) {
        const hz = h * 0.3, vx = w / 2;
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#120C10'); gr.addColorStop(0.3, '#2A1C1A'); gr.addColorStop(1, '#4A3426'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        // tunnel arches rushing by
        for (let k = 0; k < 14; k++) {
          const z = ((k * 3 - (dist % 3)) + 3), s = 1 / Math.max(0.3, z * 0.25), y = hz + (h - hz) * s * 0.9, half = w * 0.7 * s;
          if (s > 3) continue;
          g.strokeStyle = `rgba(122,82,50,${Math.min(1, s)})`; g.lineWidth = 10 * s; g.beginPath(); g.moveTo(vx - half, y); g.lineTo(vx - half, y - h * 0.9 * s); g.lineTo(vx + half, y - h * 0.9 * s); g.lineTo(vx + half, y); g.stroke();
          if (k % 3 === 0) { g.globalAlpha = Math.min(1, s); emoji(g, '🏮', vx + half * 0.92, y - h * 0.75 * s, 26 * s); g.globalAlpha = 1; }
        }
        // three rails to the horizon
        const laneScreen = (l: number, z: number) => { const s = 1 / Math.max(0.25, 0.95 + z * 0.3), y = hz + (h - hz) * s * 0.9; return { x: vx + (l - 1) * w * 0.3 * s, y, s }; };
        for (let l = 0; l < 3; l++) {
          g.strokeStyle = '#8A8A96'; g.lineWidth = 3;
          for (const off of [-0.07, 0.07]) { g.beginPath(); for (let z = 0; z <= 30; z += 1) { const p = laneScreen(l + off, z); if (!z) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); } g.stroke(); }
          for (let z = 0; z < 30; z += 1) { const zz = z - (dist % 1); const a = laneScreen(l - 0.1, zz), b = laneScreen(l + 0.1, zz); g.strokeStyle = '#5B3A20'; g.lineWidth = 4 * a.s; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
        }
        // what's coming
        const sorted = [...things].filter((th) => !th.got && th.z - dist > -1).sort((a, b) => b.z - a.z);
        for (const th of sorted) {
          const p = laneScreen(th.lane, th.z - dist); if (p.s > 1.25) continue;
          if (th.kind === 'gap') { g.fillStyle = '#000'; g.beginPath(); g.ellipse(p.x, p.y, 70 * p.s, 16 * p.s, 0, 0, Math.PI * 2); g.fill(); }
          else emoji(g, th.kind === 'rock' ? '🪨' : th.kind === 'gem' ? '💎' : th.kind === 'gold' ? '🪙' : '🟠', p.x, p.y - 20 * p.s, (th.kind === 'rock' ? 70 : 40) * p.s);
        }
        // you, in the cart
        const me = laneScreen(laneX, 0.15), jy = jump > 0 ? Math.sin((1 - jump / 0.75) * Math.PI) * 90 : 0;
        g.globalAlpha = hurt > 0 && Math.floor(hurt * 12) % 2 ? 0.4 : 1;
        const cy = me.y - 40 - jy;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(me.x, me.y - 6, 60, 12, 0, 0, Math.PI * 2); g.fill();
        emoji(g, '🧒', me.x, cy - 44, 46); emoji(g, '⛑️', me.x, cy - 66, 34);
        emoji(g, '🟠', me.x - 22, cy - 30, 22); emoji(g, '💎', me.x + 18, cy - 32, 22);
        g.fillStyle = '#6B6470'; g.strokeStyle = '#2C2A30'; g.lineWidth = 4; g.beginPath(); g.moveTo(me.x - 58, cy - 34); g.lineTo(me.x + 58, cy - 34); g.lineTo(me.x + 44, cy + 14); g.lineTo(me.x - 44, cy + 14); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#8A8494'; g.fillRect(me.x - 50, cy - 26, 100, 6); g.fillStyle = '#C9A04A'; for (const dx of [-36, 0, 36]) { g.beginPath(); g.arc(me.x + dx, cy - 8, 4, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#2C2A30'; for (const dx of [-30, 30]) { g.beginPath(); g.arc(me.x + dx, cy + 16, 10, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
        for (const p of pops) { p.x = p.x || me.x; p.y = p.y || me.y - 120; }
        popText(pops, g, 1 / 60);
        g.font = '800 18px ui-rounded, system-ui'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('❤️'.repeat(Math.max(0, lives)), 14, h - 18);
        g.textAlign = 'right'; g.fillText(`${Math.max(0, Math.ceil(45 - t0))}s`, w - 14, h - 18);
        g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '700 13px ui-rounded, system-ui'; g.fillText('Swipe ← → to switch rails · swipe ↑ or tap the cart to jump', w / 2, h - 44);
      },
      down(p: { x: number; y: number }, w: number, h: number) { sx = p.x; sy = p.y; swiping = true; void w; void h; },
      up(p: { x: number; y: number }) {
        if (!swiping) return; swiping = false; const dx = p.x - sx, dy = p.y - sy;
        if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
        else if (dy < -30) hop();
        else { const w = window.innerWidth; if (sx < w * 0.33) move(-1); else if (sx > w * 0.67) move(1); else hop(); }
      },
      key(k: string, d: boolean) { if (!d) return; if (k === 'ArrowLeft' || k === 'a') move(-1); if (k === 'ArrowRight' || k === 'd') move(1); if (k === 'ArrowUp' || k === ' ' || k === 'w') hop(); },
      score: () => score,
    };
  }, onEnd, onScore);
}
