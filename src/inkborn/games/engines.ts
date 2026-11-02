// Inkborn games, where you play as your creature. Each engine draws into one canvas and reports its
// score; positions and spawns come from the server's seed, and the server caps what a round can pay.
import type { Genome } from '../genome';
import { drawCreature, heart, type CreatureState } from '../rig';
import { rng } from '../world';

export type GameInput = { joy: { x: number; y: number }; keys: Set<string>; tap: { x: number; y: number } | null; target: { x: number; y: number } | null };
export type Engine = { step(dt: number, t: number): void; draw(g: CanvasRenderingContext2D, W: number, H: number, t: number): void; score(): number; pops: Pop[] };
type Pop = { x: number; y: number; text: string; color: string; life: number };

export type GameId = 'berrydash' | 'fireflies';
export const GAMES: Record<GameId, { name: string; emoji: string; blurb: string; how: string; color: string }> = {
  berrydash: { name: 'Berry Dash', emoji: '🫐', color: '#E8344E', blurb: 'Scamper round the meadow gobbling berries before time runs out.',
    how: 'Hold and drag to lead your Inkborn (or use the arrow keys). Red berries 1, purple 2, golden 5. Bumping a bee makes you drop 3 and get dizzy.' },
  fireflies: { name: 'Firefly Catch', emoji: '✨', color: '#C9F26B', blurb: 'Leap after fireflies in the night meadow before their glow fades.',
    how: 'Tap a firefly and your Inkborn leaps for it. Each catch is 2, and every 3 in a row adds a bonus. Leaping at empty air breaks your streak.' },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---- shared background --------------------------------------------------------------------
function meadow(g: CanvasRenderingContext2D, W: number, H: number, night: boolean, seed: number) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  if (night) { gr.addColorStop(0, '#0B1630'); gr.addColorStop(1, '#16402A'); } else { gr.addColorStop(0, '#6CC463'); gr.addColorStop(1, '#3E9A4C'); }
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = night ? 'rgba(80,140,90,0.25)' : i % 3 ? 'rgba(130,210,110,0.35)' : 'rgba(255,240,180,0.6)';
    g.beginPath(); g.arc(r() * W, r() * H, i % 3 ? 2 + r() * 6 : 1.6, 0, Math.PI * 2); g.fill();
  }
}

function drawPops(g: CanvasRenderingContext2D, pops: Pop[]) {
  for (const p of pops) {
    g.globalAlpha = Math.max(0, 1 - p.life);
    g.font = '800 18px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeText(p.text, p.x, p.y - p.life * 30);
    g.fillStyle = p.color; g.fillText(p.text, p.x, p.y - p.life * 30);
  }
  g.globalAlpha = 1;
}
function agePops(pops: Pop[], dt: number) { for (let i = pops.length - 1; i >= 0; i--) { pops[i].life += dt; if (pops[i].life > 1) pops.splice(i, 1); } }

// ---- Berry Dash ------------------------------------------------------------------------------
export function berryDash(genome: Genome, seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const size = clamp(Math.min(W, H) * 0.14, 50, 90);
  const me = { x: W / 2, y: H / 2, dir: 1 as 1 | -1, moving: false, dizzy: 0, happy: 0 };
  type Berry = { x: number; y: number; v: 1 | 2 | 5; born: number };
  const berries: Berry[] = [];
  const bees = Array.from({ length: 3 }, (_, i) => ({ x: r() * W, y: r() * H, vx: (r() - 0.5) * 120, vy: (r() - 0.5) * 120, ph: i }));
  const pops: Pop[] = [];
  let score = 0, spawnT = 0, clock = 0;
  const spawn = () => {
    const roll = r();
    berries.push({ x: 30 + r() * (W - 60), y: 70 + r() * (H - 120), v: roll < 0.06 ? 5 : roll < 0.3 ? 2 : 1, born: clock });
  };
  for (let i = 0; i < 6; i++) spawn();
  return {
    pops,
    score: () => score,
    step(dt) {
      clock += dt;
      // moving: stick / keys, or towards the finger
      let mx = input.joy.x, my = input.joy.y;
      const k = input.keys;
      if (k.has('a') || k.has('arrowleft')) mx -= 1;
      if (k.has('d') || k.has('arrowright')) mx += 1;
      if (k.has('w') || k.has('arrowup')) my -= 1;
      if (k.has('s') || k.has('arrowdown')) my += 1;
      if (!mx && !my && input.target) { const dx = input.target.x - me.x, dy = input.target.y - me.y, d = Math.hypot(dx, dy); if (d > 6) { mx = dx / d; my = dy / d; } }
      const m = Math.hypot(mx, my);
      me.moving = m > 0.05 && me.dizzy <= 0;
      if (me.moving) {
        const sp = 260 * Math.min(1, m) / Math.max(1, m);
        me.x = clamp(me.x + mx * sp * dt, size * 0.4, W - size * 0.4);
        me.y = clamp(me.y + my * sp * dt, size * 0.9, H - 8);
        if (Math.abs(mx) > 0.1) me.dir = mx > 0 ? 1 : -1;
      }
      me.dizzy -= dt; me.happy -= dt;
      // berries
      spawnT -= dt;
      if (spawnT <= 0 && berries.length < 10) { spawn(); spawnT = 0.55 + r() * 0.5; }
      for (let i = berries.length - 1; i >= 0; i--) {
        const b = berries[i];
        if (Math.hypot(b.x - me.x, b.y - (me.y - size * 0.35)) < size * 0.55) {
          score += b.v; me.happy = 0.5;
          pops.push({ x: b.x, y: b.y - 10, text: `+${b.v}`, color: b.v === 5 ? '#FFE14D' : '#FFFFFF', life: 0 });
          berries.splice(i, 1);
        } else if (clock - b.born > (b.v === 5 ? 4 : 9)) berries.splice(i, 1);
      }
      // bees buzz about and bounce off the edges
      for (const b of bees) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < 20 || b.x > W - 20) b.vx *= -1;
        if (b.y < 60 || b.y > H - 20) b.vy *= -1;
        b.x = clamp(b.x, 20, W - 20); b.y = clamp(b.y, 60, H - 20);
        if (me.dizzy <= 0 && Math.hypot(b.x - me.x, b.y - (me.y - size * 0.4)) < size * 0.45) {
          me.dizzy = 1; const lost = Math.min(3, score); score -= lost;
          if (lost) pops.push({ x: me.x, y: me.y - size, text: `-${lost}`, color: '#FF8A8A', life: 0 });
          b.vx *= -1; b.vy *= -1;
        }
      }
      // bees speed up as the round goes on
      if (clock > 20) for (const b of bees) { const s = Math.hypot(b.vx, b.vy); if (s < 190) { b.vx *= 1 + dt * 0.02; b.vy *= 1 + dt * 0.02; } }
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      meadow(g, W, H, false, 7);
      for (const b of berries) {
        const c = b.v === 5 ? '#FFC93D' : b.v === 2 ? '#7B4BD9' : '#E8344E';
        const bob = Math.sin(t * 3 + b.x) * 2;
        if (b.v === 5) { g.fillStyle = 'rgba(255,225,77,0.35)'; g.beginPath(); g.arc(b.x, b.y + bob, 18, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#2E7A3B'; g.beginPath(); g.ellipse(b.x + 5, b.y - 9 + bob, 6, 3, -0.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = c; g.beginPath(); g.arc(b.x, b.y + bob, b.v === 5 ? 10 : 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(b.x - 3, b.y - 3 + bob, 2.5, 0, Math.PI * 2); g.fill();
      }
      const st: CreatureState = me.dizzy > 0 ? 'sleep' : me.happy > 0 ? 'happy' : me.moving ? 'walk' : 'idle';
      drawCreature(g, genome, me.x, me.y, size, { t, state: st, dir: me.dir });
      if (me.dizzy > 0) { g.font = '700 18px system-ui'; g.textAlign = 'center'; g.fillText('💫', me.x, me.y - size * 1.1); }
      for (const b of bees) {
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(b.x - 4, b.y - 8 + Math.sin(t * 40 + b.ph) * 2, 6, 4, -0.4, 0, Math.PI * 2); g.ellipse(b.x + 4, b.y - 8 - Math.sin(t * 40 + b.ph) * 2, 6, 4, 0.4, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#FFC93D'; g.beginPath(); g.ellipse(b.x, b.y, 11, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2A2A2A'; g.fillRect(b.x - 3, b.y - 8, 3, 16); g.fillRect(b.x + 3, b.y - 7, 3, 14);
      }
      drawPops(g, pops);
    },
  };
}

// ---- Firefly Catch ---------------------------------------------------------------------------
export function fireflies(genome: Genome, seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const size = clamp(Math.min(W, H) * 0.14, 50, 90);
  const me = { x: W / 2, y: H - 30, dir: 1 as 1 | -1, from: { x: W / 2, y: H - 30 }, to: null as null | { x: number; y: number; fly: Fly | null }, t: 0, dur: 0, happy: 0 };
  type Fly = { x: number; y: number; born: number; life: number; ph: number; caught: boolean };
  const flies: Fly[] = [];
  const pops: Pop[] = [];
  let score = 0, streak = 0, clock = 0, spawnT = 0;
  const spawn = () => flies.push({ x: 30 + r() * (W - 60), y: 80 + r() * (H - 180), born: clock, life: 2.6 + r() * 1.6, ph: r() * 6, caught: false });
  return {
    pops,
    score: () => score,
    step(dt) {
      clock += dt;
      spawnT -= dt;
      if (spawnT <= 0 && flies.length < 7) { spawn(); spawnT = 0.45 + r() * 0.45 - Math.min(0.2, clock / 200); }
      for (let i = flies.length - 1; i >= 0; i--) if (clock - flies[i].born > flies[i].life || flies[i].caught) flies.splice(i, 1);
      // a tap picks where to leap
      if (input.tap && !me.to) {
        const tp = input.tap;
        input.tap = null;
        let best: Fly | null = null, bd = 44;
        for (const f of flies) { const d = Math.hypot(f.x - tp.x, f.y - tp.y); if (d < bd) { bd = d; best = f; } }
        me.from = { x: me.x, y: me.y };
        me.to = { x: best ? best.x : tp.x, y: best ? best.y + size * 0.4 : tp.y, fly: best };
        me.t = 0; me.dur = clamp(Math.hypot(me.to.x - me.x, me.to.y - me.y) / 650, 0.18, 0.55);
        me.dir = me.to.x > me.x ? 1 : -1;
      } else if (input.tap && me.to) input.tap = null;
      if (me.to) {
        me.t += dt;
        const k = Math.min(1, me.t / me.dur);
        me.x = me.from.x + (me.to.x - me.from.x) * k;
        me.y = me.from.y + (me.to.y - me.from.y) * k - Math.sin(k * Math.PI) * 60;
        if (k >= 1) {
          const f = me.to.fly;
          if (f && !f.caught && clock - f.born <= f.life) {
            f.caught = true; streak++;
            const bonus = streak % 3 === 0 ? 2 : 0;
            score += 2 + bonus; me.happy = 0.6;
            pops.push({ x: f.x, y: f.y - 10, text: bonus ? `+${2 + bonus} streak!` : '+2', color: bonus ? '#FFE14D' : '#E6FF9C', life: 0 });
          } else { streak = 0; pops.push({ x: me.x, y: me.y - size, text: 'missed', color: '#9FB3C8', life: 0 }); }
          me.to = null;
        }
      }
      me.happy -= dt;
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      meadow(g, W, H, true, 11);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      const sr = rng(5);
      for (let i = 0; i < 40; i++) { g.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t + i)); g.fillRect(sr() * W, sr() * H * 0.4, 1.5, 1.5); }
      g.globalAlpha = 1;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const f of flies) {
        const age = (clock - f.born) / f.life;
        const a = age < 0.15 ? age / 0.15 : age > 0.7 ? Math.max(0, (1 - age) / 0.3) : 1;
        const x = f.x + Math.sin(t * 2 + f.ph) * 6, y = f.y + Math.cos(t * 1.6 + f.ph) * 5;
        const gr = g.createRadialGradient(x, y, 0, x, y, 26);
        gr.addColorStop(0, `rgba(230,255,140,${0.95 * a})`); gr.addColorStop(0.3, `rgba(200,255,120,${0.4 * a})`); gr.addColorStop(1, 'rgba(200,255,120,0)');
        g.fillStyle = gr; g.fillRect(x - 26, y - 26, 52, 52);
      }
      g.restore();
      const st: CreatureState = me.to ? 'happy' : me.happy > 0 ? 'happy' : 'idle';
      drawCreature(g, genome, me.x, me.y, size, { t, state: st, dir: me.dir, look: 0 });
      if (streak >= 3) { heart(g, me.x + size * 0.5, me.y - size * 1.1, 7); }
      drawPops(g, pops);
    },
  };
}

export const ENGINES: Record<GameId, typeof berryDash> = { berrydash: berryDash, fireflies };
