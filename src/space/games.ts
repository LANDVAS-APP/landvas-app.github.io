// Space minigames. Same contract as the Inkborn games: the server sets the seed, checks the round
// ran its full time and caps the score; each engine draws into one canvas and reports its score.
import type { Engine, GameInput } from '../inkborn/games/engines';
import { rng } from '../inkborn/world';

export type SpaceGameId = 'asteroids' | 'lander';
export const SPACE_GAMES: Record<SpaceGameId, { name: string; emoji: string; color: string; blurb: string; how: string }> = {
  asteroids: { name: 'Asteroid Run', emoji: '☄️', color: '#FFB13D', blurb: 'Thread your rocket through an asteroid field, scooping up Ink drops and stars.',
    how: 'Drag (or hold A/D, ←/→) to steer. Ink drops are 1, stars 5. Hitting a rock costs 3 and shakes you for a moment. It gets faster as you go.' },
  lander: { name: 'Moon Lander', emoji: '🌙', color: '#C9CCD6', blurb: 'Set your lander down gently on the glowing pad. Again. And again.',
    how: 'Hold the screen (or ↑ / W / Space) to fire the thruster; touch left or right of the lander (or ←/→) to drift. Land slow and level on the pad: a soft landing is 10, a perfect one 15, plus fuel left over.' },
};

type Pop = { x: number; y: number; text: string; color: string; life: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function drawPops(g: CanvasRenderingContext2D, pops: Pop[]) {
  for (const p of pops) {
    g.globalAlpha = Math.max(0, 1 - p.life);
    g.font = '800 18px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.strokeText(p.text, p.x, p.y - p.life * 30);
    g.fillStyle = p.color; g.fillText(p.text, p.x, p.y - p.life * 30);
  }
  g.globalAlpha = 1;
}
const agePops = (pops: Pop[], dt: number) => { for (let i = pops.length - 1; i >= 0; i--) { pops[i].life += dt; if (pops[i].life > 1) pops.splice(i, 1); } };
function space(g: CanvasRenderingContext2D, W: number, H: number, t: number, speed: number, seed: number) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#05060F'); bg.addColorStop(1, '#1A1440');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let i = 0; i < 90; i++) {
    const layer = 1 + (i % 3);
    const x = r() * W, y = ((r() * H + t * speed * layer * 20) % (H + 10)) - 5;
    g.globalAlpha = 0.3 + layer * 0.2; g.fillStyle = '#fff'; g.fillRect(x, y, layer * 0.8, layer * (speed > 2 ? 3 : 0.8));
  }
  g.globalAlpha = 1;
}
function ship(g: CanvasRenderingContext2D, x: number, y: number, s: number, tilt: number, flame: number, t: number) {
  g.save(); g.translate(x, y); g.rotate(tilt);
  if (flame > 0) {
    g.fillStyle = `rgba(255,177,61,${0.7 + 0.3 * Math.sin(t * 40)})`;
    g.beginPath(); g.moveTo(-s * 0.18, s * 0.45); g.lineTo(0, s * (0.75 + flame * 0.35 + Math.sin(t * 50) * 0.06)); g.lineTo(s * 0.18, s * 0.45); g.fill();
  }
  g.fillStyle = '#8B5CFF'; g.beginPath(); g.moveTo(-s * 0.2, s * 0.15); g.lineTo(-s * 0.42, s * 0.5); g.lineTo(-s * 0.15, s * 0.42); g.fill();
  g.beginPath(); g.moveTo(s * 0.2, s * 0.15); g.lineTo(s * 0.42, s * 0.5); g.lineTo(s * 0.15, s * 0.42); g.fill();
  g.fillStyle = '#F2F5FB'; g.beginPath(); g.moveTo(0, -s * 0.55); g.quadraticCurveTo(s * 0.26, -s * 0.2, s * 0.2, s * 0.45); g.lineTo(-s * 0.2, s * 0.45); g.quadraticCurveTo(-s * 0.26, -s * 0.2, 0, -s * 0.55); g.fill();
  g.fillStyle = '#FF3D9A'; g.beginPath(); g.moveTo(0, -s * 0.55); g.quadraticCurveTo(s * 0.15, -s * 0.36, s * 0.17, -s * 0.25); g.lineTo(-s * 0.17, -s * 0.25); g.quadraticCurveTo(-s * 0.15, -s * 0.36, 0, -s * 0.55); g.fill();
  g.fillStyle = '#1B2A5E'; g.beginPath(); g.arc(0, -s * 0.05, s * 0.09, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7EC8F5'; g.beginPath(); g.arc(-s * 0.025, -s * 0.07, s * 0.035, 0, Math.PI * 2); g.fill();
  g.restore();
}

// ---- Asteroid Run ---------------------------------------------------------------------------
export function asteroidRun(seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const size = clamp(Math.min(W, H) * 0.13, 44, 76);
  const me = { x: W / 2, y: H - size * 1.3, vx: 0, hurt: 0 };
  type Thing = { x: number; y: number; v: number; kind: 'rock' | 'ink' | 'star'; r: number; spin: number; pts: number[] };
  const things: Thing[] = [];
  const pops: Pop[] = [];
  let score = 0, clock = 0, spawnT = 0;
  const spawn = () => {
    const roll = r();
    const kind: Thing['kind'] = roll < 0.55 ? 'rock' : roll < 0.93 ? 'ink' : 'star';
    const rr = kind === 'rock' ? 16 + r() * 26 : kind === 'star' ? 14 : 10;
    things.push({ x: rr + r() * (W - rr * 2), y: -rr * 2, v: 160 + r() * 90 + clock * 6, kind, r: rr, spin: (r() - 0.5) * 3, pts: Array.from({ length: 9 }, () => 0.75 + r() * 0.35) });
  };
  return {
    pops,
    score: () => score,
    step(dt) {
      clock += dt;
      let mx = input.joy.x;
      const k = input.keys;
      if (k.has('a') || k.has('arrowleft')) mx -= 1;
      if (k.has('d') || k.has('arrowright')) mx += 1;
      let tx: number | null = null;
      if (!mx && input.target) tx = input.target.x;
      if (tx !== null) me.vx = clamp((tx - me.x) * 9, -520, 520);
      else me.vx = clamp(mx, -1, 1) * 440;
      me.x = clamp(me.x + me.vx * dt, size * 0.4, W - size * 0.4);
      me.hurt -= dt;
      spawnT -= dt;
      if (spawnT <= 0) { spawn(); spawnT = Math.max(0.16, 0.5 - clock * 0.006) * (0.6 + r() * 0.8); }
      for (let i = things.length - 1; i >= 0; i--) {
        const o = things[i];
        o.y += o.v * dt;
        if (o.y > H + 60) { things.splice(i, 1); continue; }
        const hit = Math.hypot(o.x - me.x, o.y - me.y) < o.r + size * 0.28;
        if (!hit) continue;
        if (o.kind === 'rock') {
          if (me.hurt > 0) continue;
          me.hurt = 1; const lost = Math.min(3, score); score -= lost;
          pops.push({ x: me.x, y: me.y - size * 0.7, text: lost ? `-${lost}` : 'bonk!', color: '#FF8A8A', life: 0 });
        } else {
          const v = o.kind === 'star' ? 5 : 1; score += v;
          pops.push({ x: o.x, y: o.y, text: `+${v}`, color: o.kind === 'star' ? '#FFE14D' : '#C9B8FF', life: 0 });
        }
        things.splice(i, 1);
      }
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      space(g, W, H, t, 3 + clock * 0.05, 7);
      for (const o of things) {
        if (o.kind === 'rock') {
          g.save(); g.translate(o.x, o.y); g.rotate(t * o.spin);
          g.fillStyle = '#7D6B5D'; g.beginPath();
          o.pts.forEach((p, i) => { const a = (i / o.pts.length) * Math.PI * 2; const x = Math.cos(a) * o.r * p, y = Math.sin(a) * o.r * p; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
          g.closePath(); g.fill();
          g.fillStyle = '#5E4F44'; g.beginPath(); g.arc(-o.r * 0.25, -o.r * 0.15, o.r * 0.22, 0, Math.PI * 2); g.arc(o.r * 0.3, o.r * 0.2, o.r * 0.15, 0, Math.PI * 2); g.fill();
          g.restore();
        } else if (o.kind === 'ink') {
          const gl = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 2.2); gl.addColorStop(0, 'rgba(139,92,255,0.6)'); gl.addColorStop(1, 'rgba(139,92,255,0)');
          g.fillStyle = gl; g.beginPath(); g.arc(o.x, o.y, o.r * 2.2, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#B79CFF'; g.beginPath(); g.moveTo(o.x, o.y - o.r * 1.2); g.quadraticCurveTo(o.x + o.r, o.y, o.x, o.y + o.r); g.quadraticCurveTo(o.x - o.r, o.y, o.x, o.y - o.r * 1.2); g.fill();
        } else {
          g.save(); g.translate(o.x, o.y); g.rotate(t * 2);
          g.fillStyle = '#FFE14D'; g.beginPath();
          for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? o.r * 0.45 : o.r; if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          g.closePath(); g.fill(); g.restore();
        }
      }
      if (!(me.hurt > 0 && Math.floor(t * 12) % 2)) ship(g, me.x, me.y, size, clamp(me.vx / 1800, -0.35, 0.35), 1, t);
      drawPops(g, pops);
    },
  };
}

// ---- Moon Lander --------------------------------------------------------------------------------
export function moonLander(seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const size = clamp(Math.min(W, H) * 0.1, 36, 60);
  const G = 70, THRUST = 175, SIDE = 95;
  const groundY = (x: number, hills: number[]) => {
    const i = clamp(Math.floor((x / W) * (hills.length - 1)), 0, hills.length - 2), f = (x / W) * (hills.length - 1) - i;
    return hills[i] + (hills[i + 1] - hills[i]) * f;
  };
  let hills: number[] = [], pad = { x: 0, w: 0, y: 0 };
  const newLevel = () => {
    hills = Array.from({ length: 13 }, () => H - 60 - r() * H * 0.22);
    const pi = 1 + Math.floor(r() * 10);
    pad = { x: (pi / 12) * W, w: Math.max(size * 1.6, W / 12 * 1.6), y: hills[pi] };
    for (let i = 0; i < hills.length; i++) { const x = (i / 12) * W; if (x >= pad.x - 4 && x <= pad.x + pad.w + W / 12) hills[i] = pad.y; }
  };
  newLevel();
  const pops: Pop[] = [];
  const me = { x: W / 2, y: 90, vx: (r() - 0.5) * 60, vy: 10, fuel: 100, thrust: 0, crash: 0, landed: 0, tilt: 0 };
  let score = 0, landings = 0;
  const reset = () => { me.x = 40 + r() * (W - 80); me.y = 90; me.vx = (r() - 0.5) * 70; me.vy = 10; me.fuel = 100; me.crash = 0; me.landed = 0; };
  const debris: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  return {
    pops,
    score: () => score,
    step(dt) {
      if (me.crash > 0) { me.crash -= dt; if (me.crash <= 0) reset(); }
      else if (me.landed > 0) { me.landed -= dt; if (me.landed <= 0) { newLevel(); reset(); } }
      else {
        const k = input.keys;
        let up = k.has('arrowup') || k.has('w') || k.has(' ');
        let side = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
        if (input.target) {
          up = true;
          const dx = input.target.x - me.x;
          if (Math.abs(dx) > size * 0.8) side = dx > 0 ? 1 : -1;
        }
        me.thrust = up && me.fuel > 0 ? 1 : 0;
        if (me.thrust) me.fuel = Math.max(0, me.fuel - dt * 14);
        if (side && me.fuel > 0) me.fuel = Math.max(0, me.fuel - dt * 4);
        me.vy += (G - me.thrust * THRUST) * dt;
        me.vx += side * SIDE * dt * (me.fuel > 0 ? 1 : 0);
        me.vx *= 0.995;
        me.x += me.vx * dt; me.y += me.vy * dt;
        if (me.x < 10) { me.x = 10; me.vx = Math.abs(me.vx) * 0.4; }
        if (me.x > W - 10) { me.x = W - 10; me.vx = -Math.abs(me.vx) * 0.4; }
        if (me.y < 40) { me.y = 40; me.vy = Math.max(0, me.vy); }
        me.tilt = clamp(me.vx / 300, -0.4, 0.4);
        const feet = me.y + size * 0.45;
        const gy = groundY(me.x, hills);
        if (feet >= gy) {
          const onPad = me.x > pad.x + size * 0.2 && me.x < pad.x + pad.w - size * 0.2;
          const soft = me.vy < 55 && Math.abs(me.vx) < 40;
          if (onPad && soft) {
            const perfect = me.vy < 25 && Math.abs(me.vx) < 15;
            const pts = (perfect ? 15 : 10) + Math.floor(me.fuel / 20);
            score += pts; landings++;
            pops.push({ x: me.x, y: me.y - size, text: perfect ? `PERFECT +${pts}` : `Landed +${pts}`, color: perfect ? '#FFE14D' : '#9BF2C6', life: 0 });
            me.y = gy - size * 0.45; me.vy = 0; me.vx = 0; me.landed = 1.1; me.thrust = 0;
          } else {
            me.crash = 1.2; me.thrust = 0;
            pops.push({ x: me.x, y: me.y - size, text: onPad ? 'too fast!' : 'missed the pad', color: '#FF8A8A', life: 0 });
            for (let i = 0; i < 18; i++) debris.push({ x: me.x, y: gy - 6, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 220, life: 0 });
          }
        }
      }
      for (let i = debris.length - 1; i >= 0; i--) { const d = debris[i]; d.life += dt; d.vy += 300 * dt; d.x += d.vx * dt; d.y += d.vy * dt; if (d.life > 1.2) debris.splice(i, 1); }
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      space(g, W, H, t, 0.2, 3);
      // Earth hanging in the sky
      g.fillStyle = '#3EA0DA'; g.beginPath(); g.arc(W * 0.82, H * 0.18, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4FA552'; g.beginPath(); g.arc(W * 0.81, H * 0.17, 12, 0, Math.PI * 2); g.fill();
      // ground
      g.fillStyle = '#9BA0AF'; g.beginPath(); g.moveTo(0, H);
      for (let i = 0; i < hills.length; i++) g.lineTo((i / 12) * W, hills[i]);
      g.lineTo(W, H); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 7; i++) { const x = ((i * 131) % W), y = groundY(x, hills) + 18 + (i % 3) * 14; g.beginPath(); g.ellipse(x, y, 14, 5, 0, 0, Math.PI * 2); g.fill(); }
      // the pad
      const glow = 0.5 + 0.5 * Math.sin(t * 4);
      g.fillStyle = `rgba(61,220,151,${0.25 + glow * 0.3})`; g.fillRect(pad.x, pad.y - 14, pad.w, 14);
      g.fillStyle = '#3DDC97'; g.fillRect(pad.x, pad.y - 4, pad.w, 5);
      g.fillStyle = '#FFE14D'; g.fillRect(pad.x, pad.y - 10, 4, 10); g.fillRect(pad.x + pad.w - 4, pad.y - 10, 4, 10);
      // lander
      if (me.crash <= 0) {
        g.save(); g.translate(me.x, me.y); g.rotate(me.tilt);
        if (me.thrust) { g.fillStyle = `rgba(255,177,61,${0.7 + 0.3 * Math.sin(t * 40)})`; g.beginPath(); g.moveTo(-size * 0.14, size * 0.3); g.lineTo(0, size * (0.75 + Math.sin(t * 50) * 0.08)); g.lineTo(size * 0.14, size * 0.3); g.fill(); }
        g.strokeStyle = '#C9CCD6'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(-size * 0.2, size * 0.15); g.lineTo(-size * 0.4, size * 0.45); g.moveTo(size * 0.2, size * 0.15); g.lineTo(size * 0.4, size * 0.45); g.stroke();
        g.fillStyle = '#E8B94A'; g.fillRect(-size * 0.28, -size * 0.05, size * 0.56, size * 0.28);
        g.fillStyle = '#F2F5FB'; g.beginPath(); g.arc(0, -size * 0.15, size * 0.24, Math.PI, 0); g.fill(); g.fillRect(-size * 0.24, -size * 0.16, size * 0.48, size * 0.12);
        g.fillStyle = '#1B2A5E'; g.beginPath(); g.arc(0, -size * 0.18, size * 0.1, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      for (const d of debris) { g.globalAlpha = 1 - d.life / 1.2; g.fillStyle = d.life < 0.3 ? '#FFB13D' : '#9BA0AF'; g.fillRect(d.x, d.y, 4, 4); }
      g.globalAlpha = 1;
      // gauges
      g.font = '800 13px ui-rounded, system-ui'; g.textAlign = 'left';
      const vs = Math.round(me.vy), hs = Math.round(Math.abs(me.vx));
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(10, H - 52, 150, 42);
      g.fillStyle = vs < 25 ? '#9BF2C6' : vs < 55 ? '#FFE14D' : '#FF8A8A'; g.fillText(`↓ ${Math.max(0, vs)}`, 18, H - 34);
      g.fillStyle = hs < 15 ? '#9BF2C6' : hs < 40 ? '#FFE14D' : '#FF8A8A'; g.fillText(`↔ ${hs}`, 70, H - 34);
      g.fillStyle = '#fff'; g.fillText(`⛽`, 18, H - 16);
      g.fillStyle = '#333'; g.fillRect(40, H - 26, 110, 8); g.fillStyle = me.fuel > 25 ? '#3DDC97' : '#FF8A8A'; g.fillRect(40, H - 26, 110 * (me.fuel / 100), 8);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.textAlign = 'right'; g.fillText(`${landings} landed`, W - 14, H - 16);
      drawPops(g, pops);
    },
  };
}

export const SPACE_ENGINES: Record<SpaceGameId, (seed: number, W: number, H: number, input: GameInput) => Engine> = { asteroids: asteroidRun, lander: moonLander };
