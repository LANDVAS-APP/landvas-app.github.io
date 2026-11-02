// Inkborn games, where you play as your creature. Each engine draws into one canvas and reports its
// score; positions and spawns come from the server's seed, and the server caps what a round can pay.
import type { Genome } from '../genome';
import { drawCreature, heart, type CreatureState } from '../rig';
import { rng } from '../world';

export type GameInput = { joy: { x: number; y: number }; keys: Set<string>; tap: { x: number; y: number } | null; target: { x: number; y: number } | null };
export type Engine = { step(dt: number, t: number): void; draw(g: CanvasRenderingContext2D, W: number, H: number, t: number): void; score(): number; pops: Pop[]; dispose?(): void };
type Pop = { x: number; y: number; text: string; color: string; life: number };

export type GameId = 'berrydash' | 'fireflies' | 'leafleap' | 'lilyhop' | 'songbloom';
export const GAMES: Record<GameId, { name: string; emoji: string; blurb: string; how: string; color: string }> = {
  berrydash: { name: 'Berry Dash', emoji: '🫐', color: '#E8344E', blurb: 'Scamper round the meadow gobbling berries before time runs out.',
    how: 'Hold and drag to lead your Inkborn (or use the arrow keys). Red berries 1, purple 2, golden 5. Bumping a bee makes you drop 3 and get dizzy.' },
  fireflies: { name: 'Firefly Catch', emoji: '✨', color: '#C9F26B', blurb: 'Leap after fireflies in the night meadow before their glow fades.',
    how: 'Tap a firefly and your Inkborn leaps for it. Each catch is 2, and every 3 in a row adds a bonus. Leaping at empty air breaks your streak.' },
  leafleap: { name: 'Leaf Leap', emoji: '🍃', color: '#7BD47F', blurb: 'Bounce from leaf to leaf up the giant beanstalk — how high can you go?',
    how: 'Your Inkborn bounces by itself. Steer left and right by holding the side of the screen (or A/D, ←/→). Mushrooms launch you high, twigs snap after one bounce, acorns are +3. Falling costs 5.' },
  lilyhop: { name: 'Lily Hop', emoji: '🪷', color: '#3EA0DA', blurb: 'Hop across the drifting lily pads to the far bank without a splash.',
    how: 'Tap above, below or beside your Inkborn to hop that way (or use the arrow keys / WASD). Each row forward is 1, reaching the far bank is +10, dragonflies are +2. Miss a pad and you swim back to the start.' },
  songbloom: { name: 'Song Bloom', emoji: '🌸', color: '#FF7AB8', blurb: 'Your Inkborn sings a little tune on the flowers — sing it back!',
    how: 'Watch which flowers light up, then tap them in the same order (or keys 1–4). Every right note is 1 and every finished tune adds its length. The tunes grow longer as you go.' },
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

// keys pressed since the last frame (for games that move one step per press)
function pressedSince(keys: Set<string>, prev: Set<string>) {
  const out: string[] = [];
  for (const k of keys) if (!prev.has(k)) out.push(k);
  prev.clear(); for (const k of keys) prev.add(k);
  return out;
}

// ---- Leaf Leap -----------------------------------------------------------------------------
export function leafLeap(genome: Genome, seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const size = clamp(Math.min(W, H) * 0.11, 40, 70);
  const GRAV = 1900, BOUNCE = 820, SUPER = 1300, SIDE = 380;
  type Leaf = { x: number; y: number; w: number; kind: 'leaf' | 'twig' | 'shroom' | 'drift'; vx: number; broken: number; acorn: boolean };
  const leaves: Leaf[] = [];
  const pops: Pop[] = [];
  const me = { x: W / 2, y: H - 80, vy: -BOUNCE, dir: 1 as 1 | -1, squash: 0, hurt: 0 };
  let cam = 0; // world y at the top of the screen (goes negative as you climb)
  let top = H - 40, best = 0, bonus = 0, falls = 0, score = 0, clock = 0;
  const addLeaf = (y: number) => {
    const climb = Math.max(0, (H - y) / 1000);
    const roll = r();
    const kind: Leaf['kind'] = roll < 0.08 ? 'shroom' : roll < 0.08 + Math.min(0.22, climb * 0.04) ? 'twig' : roll < 0.3 + Math.min(0.2, climb * 0.03) ? 'drift' : 'leaf';
    const w = kind === 'shroom' ? 58 : clamp(96 - climb * 6, 64, 96);
    leaves.push({ x: 20 + r() * (W - 40 - w), y, w, kind, vx: kind === 'drift' ? (r() < 0.5 ? -1 : 1) * (50 + r() * 60) : 0, broken: 0, acorn: kind !== 'twig' && r() < 0.18 });
  };
  leaves.push({ x: W / 2 - 60, y: H - 40, w: 120, kind: 'leaf', vx: 0, broken: 0, acorn: false });
  while (top > -H) { top -= 70 + r() * 55; addLeaf(top); }
  return {
    pops,
    score: () => score,
    step(dt) {
      clock += dt;
      // steer: keys, the stick, or holding to one side of the creature
      let mx = input.joy.x;
      const k = input.keys;
      if (k.has('a') || k.has('arrowleft')) mx -= 1;
      if (k.has('d') || k.has('arrowright')) mx += 1;
      if (!mx && input.target) { const dx = input.target.x - me.x; if (Math.abs(dx) > 10) mx = clamp(dx / 80, -1, 1); }
      me.x += clamp(mx, -1, 1) * SIDE * dt;
      if (Math.abs(mx) > 0.1) me.dir = mx > 0 ? 1 : -1;
      if (me.x < -size * 0.4) me.x += W + size * 0.8; else if (me.x > W + size * 0.4) me.x -= W + size * 0.8; // wrap around
      const prevY = me.y;
      me.vy += GRAV * dt;
      me.y += me.vy * dt;
      me.squash = Math.max(0, me.squash - dt * 4); me.hurt -= dt;
      // land on leaves only while falling
      if (me.vy > 0) for (const l of leaves) {
        if (l.broken) continue;
        if (prevY <= l.y && me.y >= l.y && me.x > l.x - size * 0.25 && me.x < l.x + l.w + size * 0.25) {
          me.y = l.y; me.vy = l.kind === 'shroom' ? -SUPER : -BOUNCE; me.squash = 1;
          if (l.kind === 'twig') l.broken = 0.001;
          if (l.kind === 'shroom') pops.push({ x: me.x, y: me.y - cam - size, text: 'boing!', color: '#FF9FCB', life: 0 });
          break;
        }
      }
      for (const l of leaves) {
        if (l.kind === 'drift') { l.x += l.vx * dt; if (l.x < 4 || l.x + l.w > W - 4) l.vx *= -1; }
        if (l.broken) l.broken += dt;
        if (l.acorn && Math.hypot(me.x - (l.x + l.w / 2), (me.y - size * 0.5) - (l.y - 22)) < size * 0.6) {
          l.acorn = false; bonus += 3;
          pops.push({ x: l.x + l.w / 2, y: l.y - 22 - cam, text: '+3', color: '#FFE14D', life: 0 });
        }
      }
      // the camera follows you up, never down
      cam = Math.min(cam, me.y - H * 0.45);
      const height = Math.max(0, Math.floor((H - 80 - me.y) / 90));
      if (height > best) best = height;
      // fell off the bottom: a rescue leaf catches you, for a price
      if (me.y - cam > H + size) {
        falls++;
        pops.push({ x: W / 2, y: H * 0.5, text: '-5', color: '#FF8A8A', life: 0 });
        const y = cam + H - 60;
        leaves.push({ x: W / 2 - 60, y, w: 120, kind: 'leaf', vx: 0, broken: 0, acorn: false });
        me.x = W / 2; me.y = y; me.vy = -BOUNCE; me.hurt = 1;
      }
      // more beanstalk above, tidy below
      while (top > cam - H) { top -= 70 + r() * 60 + Math.min(40, -cam / 300); addLeaf(top); }
      for (let i = leaves.length - 1; i >= 0; i--) if (leaves[i].y - cam > H + 80 || leaves[i].broken > 0.6) leaves.splice(i, 1);
      score = Math.max(0, best + bonus - falls * 5);
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      const k = clamp(-cam / 6000, 0, 1);
      sky.addColorStop(0, k > 0.5 ? '#1B2A5E' : '#7EC8F5'); sky.addColorStop(1, k > 0.5 ? '#4E5FA8' : '#D8F3FF');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // drifting clouds (parallax)
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 6; i++) {
        const cy = ((i * 260 - cam * 0.3) % (H + 200) + H + 200) % (H + 200) - 100, cx = ((i * 173 + t * 12) % (W + 160)) - 80;
        g.beginPath(); g.ellipse(cx, cy, 50, 18, 0, 0, Math.PI * 2); g.ellipse(cx + 30, cy - 10, 34, 16, 0, 0, Math.PI * 2); g.fill();
      }
      // the beanstalk
      g.strokeStyle = '#3E9A4C'; g.lineWidth = 14; g.beginPath();
      for (let y = -20; y <= H + 20; y += 20) { const x = W / 2 + Math.sin((y + cam) / 140) * W * 0.18; if (y === -20) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      for (const l of leaves) {
        const y = l.y - cam;
        if (y < -40 || y > H + 40) continue;
        g.save(); g.translate(l.x + l.w / 2, y);
        if (l.broken) { g.globalAlpha = 1 - l.broken / 0.6; g.rotate(l.broken * 2); g.translate(0, l.broken * 120); }
        if (l.kind === 'shroom') {
          g.fillStyle = '#F2E6CF'; g.fillRect(-7, -2, 14, 16);
          g.fillStyle = '#E8344E'; g.beginPath(); g.ellipse(0, 0, l.w / 2, 16, 0, Math.PI, 0); g.fill();
          g.fillStyle = '#FFFFFF'; [[-12, -8], [8, -10], [0, -4]].forEach(([x, yy]) => { g.beginPath(); g.arc(x, yy, 3.5, 0, Math.PI * 2); g.fill(); });
        } else if (l.kind === 'twig') {
          g.strokeStyle = '#8A5A35'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-l.w / 2, 0); g.lineTo(l.w / 2, 0); g.stroke();
          g.strokeStyle = '#6B4A2E'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, 0); g.lineTo(2, -2); g.stroke();
        } else {
          g.fillStyle = l.kind === 'drift' ? '#9BD86A' : '#4FA552';
          g.beginPath(); g.ellipse(0, 0, l.w / 2, 11, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(20,70,30,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-l.w / 2 + 6, 0); g.lineTo(l.w / 2 - 6, 0); g.stroke();
        }
        if (l.acorn) {
          const bob = Math.sin(t * 3 + l.x) * 3;
          g.fillStyle = '#B5763A'; g.beginPath(); g.ellipse(0, -24 + bob, 8, 10, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#6B4A2E'; g.beginPath(); g.ellipse(0, -31 + bob, 9, 5, 0, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
      const y = me.y - cam;
      const st: CreatureState = me.hurt > 0 ? 'look' : me.vy < -200 ? 'happy' : 'idle';
      g.save(); g.translate(me.x, y); g.scale(1 + me.squash * 0.18, 1 - me.squash * 0.18); g.translate(-me.x, -y);
      drawCreature(g, genome, me.x, y, size, { t, state: st, dir: me.dir });
      g.restore();
      g.font = '800 14px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillText(`${best} m`, 14, H - 16);
      drawPops(g, pops);
    },
  };
}

// ---- Lily Hop ------------------------------------------------------------------------------
export function lilyHop(genome: Genome, seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const ROWS = 6; // rows of water between the banks
  const top = 70, bottom = H - 20;
  const rowH = (bottom - top) / (ROWS + 2);
  const rowY = (i: number) => bottom - rowH * (i + 0.5); // 0 = near bank, ROWS + 1 = far bank
  const size = clamp(rowH * 0.62, 34, 64);
  const colW = clamp(W / 7, 44, 90);
  type Pad = { x: number; w: number; fly: boolean };
  type Row = { pads: Pad[]; v: number };
  let lap = 0;
  const rows: Row[] = [];
  const build = () => {
    rows.length = 0;
    for (let i = 1; i <= ROWS; i++) {
      const v = (i % 2 ? 1 : -1) * (36 + r() * 40 + lap * 14 + i * 4);
      const pads: Pad[] = [];
      let x = r() * 60;
      while (x < W + 120) { const w = colW * (1.1 + r() * 0.9); pads.push({ x, w, fly: r() < 0.12 }); x += w + colW * (0.55 + r() * 0.9 + lap * 0.08); }
      rows.push({ pads, v });
    }
  };
  build();
  const pops: Pop[] = [];
  const prev = new Set<string>();
  const me = { row: 0, x: W / 2, dir: 1 as 1 | -1, hop: null as null | { fx: number; fy: number; tx: number; trow: number; t: number }, splash: 0, happy: 0, onPad: null as Pad | null };
  let score = 0, reached = 0;
  const padAt = (row: number, x: number) => rows[row - 1]?.pads.find((p) => x > p.x + 4 && x < p.x + p.w - 4) ?? null;
  const hop = (dx: number, dy: number) => {
    if (me.hop || me.splash > 0) return;
    const trow = clamp(me.row + dy, 0, ROWS + 1);
    const tx = clamp(me.x + dx * colW, size * 0.4, W - size * 0.4);
    if (trow === me.row && tx === me.x) return;
    if (dx) me.dir = dx > 0 ? 1 : -1;
    me.hop = { fx: me.x, fy: rowY(me.row), tx, trow, t: 0 };
  };
  return {
    pops,
    score: () => score,
    step(dt) {
      for (const k of pressedSince(input.keys, prev)) {
        if (k === 'w' || k === 'arrowup') hop(0, 1);
        else if (k === 's' || k === 'arrowdown') hop(0, -1);
        else if (k === 'a' || k === 'arrowleft') hop(-1, 0);
        else if (k === 'd' || k === 'arrowright') hop(1, 0);
      }
      if (input.tap) {
        const tp = input.tap; input.tap = null;
        const dx = tp.x - me.x, dy = rowY(me.row) - size * 0.4 - tp.y;
        if (Math.abs(dy) > Math.abs(dx) * 0.6) hop(0, dy > 0 ? 1 : -1); else hop(dx > 0 ? 1 : -1, 0);
      }
      // pads drift and wrap around
      for (const row of rows) for (const p of row.pads) {
        p.x += row.v * dt;
        if (row.v > 0 && p.x > W + 40) p.x -= W + 160 + p.w;
        if (row.v < 0 && p.x + p.w < -40) p.x += W + 160 + p.w;
      }
      if (me.hop) {
        me.hop.t += dt;
        const k = Math.min(1, me.hop.t / 0.24);
        me.x = me.hop.fx + (me.hop.tx - me.hop.fx) * k;
        if (k >= 1) {
          const from = me.row;
          me.row = me.hop.trow; me.hop = null;
          if (me.row >= 1 && me.row <= ROWS) {
            const p = padAt(me.row, me.x);
            if (!p) { me.splash = 1.1; pops.push({ x: me.x, y: rowY(me.row) - size, text: 'splash!', color: '#9FDFFF', life: 0 }); }
            else {
              me.onPad = p;
              if (me.row > from && me.row > reached) { reached = me.row; score += 1; }
              if (p.fly) { p.fly = false; score += 2; pops.push({ x: me.x, y: rowY(me.row) - size, text: '+2', color: '#E6FF9C', life: 0 }); }
            }
          } else me.onPad = null;
          if (me.row === ROWS + 1) {
            score += 10; me.happy = 1.2; lap++;
            pops.push({ x: me.x, y: rowY(me.row) - size, text: '+10 made it!', color: '#FFE14D', life: 0 });
            setTimeout(() => { build(); me.row = 0; reached = 0; me.onPad = null; }, 700);
          }
        }
      } else if (me.onPad && me.row >= 1 && me.row <= ROWS && me.splash <= 0) {
        me.x += rows[me.row - 1].v * dt;
        if (me.x < -size * 0.3 || me.x > W + size * 0.3 || !padAt(me.row, me.x)) { me.splash = 1.1; me.onPad = null; pops.push({ x: clamp(me.x, 30, W - 30), y: rowY(me.row) - size, text: 'splash!', color: '#9FDFFF', life: 0 }); }
      }
      if (me.splash > 0) {
        me.splash -= dt;
        if (me.splash <= 0) { me.row = 0; reached = 0; me.x = W / 2; me.onPad = null; }
      }
      me.happy -= dt;
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      g.fillStyle = '#2C7AB8'; g.fillRect(0, 0, W, H);
      const wg = g.createLinearGradient(0, top, 0, bottom);
      wg.addColorStop(0, '#2A6FA8'); wg.addColorStop(1, '#3EA0DA');
      g.fillStyle = wg; g.fillRect(0, rowY(ROWS) - rowH / 2, W, rowH * ROWS);
      // ripples
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
      for (let i = 0; i < 18; i++) { const x = ((i * 97 + t * 20) % (W + 60)) - 30, y = rowY(1 + (i % ROWS)) + ((i * 37) % 20) - 10; g.beginPath(); g.ellipse(x, y, 18, 4, 0, 0, Math.PI * 2); g.stroke(); }
      // banks
      for (const [y0, h] of [[rowY(0) - rowH / 2, rowH + 30], [0, rowY(ROWS + 1) + rowH / 2]] as const) {
        g.fillStyle = '#4FA552'; g.fillRect(0, y0, W, h);
        g.fillStyle = 'rgba(255,240,180,0.5)'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc((i * 61) % W, y0 + 8 + ((i * 23) % Math.max(10, h - 16)), 2, 0, Math.PI * 2); g.fill(); }
      }
      g.fillStyle = '#B9A675'; g.fillRect(0, rowY(ROWS + 1) + rowH / 2 - 6, W, 6); g.fillRect(0, rowY(0) - rowH / 2, W, 6);
      // pads
      rows.forEach((row, i) => {
        const y = rowY(i + 1);
        for (const p of row.pads) {
          if (p.x > W + 10 || p.x + p.w < -10) continue;
          const cx = p.x + p.w / 2;
          g.fillStyle = '#2E7A3B'; g.beginPath(); g.ellipse(cx, y + 3, p.w / 2, rowH * 0.3, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#4FA552'; g.beginPath(); g.ellipse(cx, y, p.w / 2, rowH * 0.28, 0, 0.35, Math.PI * 2 - 0.1); g.lineTo(cx, y); g.fill();
          if (p.w > colW * 1.5) { g.fillStyle = '#FF9FCB'; g.beginPath(); g.arc(cx + p.w * 0.2, y - 4, 6, 0, Math.PI * 2); g.fill(); }
          if (p.fly) {
            const fx = cx - p.w * 0.15, fy = y - 18 + Math.sin(t * 6 + cx) * 3;
            g.fillStyle = 'rgba(220,240,255,0.8)'; g.beginPath(); g.ellipse(fx - 6, fy - 4, 7, 3, -0.4, 0, Math.PI * 2); g.ellipse(fx + 6, fy - 4, 7, 3, 0.4, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#34C3FF'; g.fillRect(fx - 1.5, fy - 8, 3, 16);
          }
        }
      });
      // you
      let y = rowY(me.row);
      if (me.hop) { const k = Math.min(1, me.hop.t / 0.24); y = me.hop.fy + (rowY(me.hop.trow) - me.hop.fy) * k - Math.sin(k * Math.PI) * rowH * 0.6; }
      if (me.splash > 0) {
        const k = 1 - me.splash / 1.1;
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
        for (let i = 0; i < 3; i++) { g.globalAlpha = Math.max(0, 1 - k - i * 0.2); g.beginPath(); g.ellipse(me.x, y, 10 + k * 50 + i * 12, (10 + k * 50 + i * 12) * 0.35, 0, 0, Math.PI * 2); g.stroke(); }
        g.globalAlpha = 1;
        if (k < 0.4) drawCreature(g, genome, me.x, y + k * size * 1.5, size, { t, state: 'look', dir: me.dir });
      } else drawCreature(g, genome, me.x, y + rowH * 0.12, size, { t, state: me.hop ? 'happy' : me.happy > 0 ? 'happy' : 'idle', dir: me.dir });
      drawPops(g, pops);
    },
  };
}

// ---- Song Bloom ----------------------------------------------------------------------------
export function songBloom(genome: Genome, seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const COLORS = ['#FF7AB8', '#FFD84D', '#7FD3F5', '#9C7CFF'];
  const NOTES = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  const cx = W / 2, cy = H * 0.56;
  const rad = clamp(Math.min(W, H) * 0.3, 90, 190);
  const fr = clamp(rad * 0.42, 40, 80);
  // flowers sit around your Inkborn: up, right, down, left
  const flowers = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({ x: cx + dx * rad, y: cy + dy * rad * 0.8, lit: 0 }));
  const size = clamp(Math.min(W, H) * 0.16, 54, 100);
  const pops: Pop[] = [];
  const prev = new Set<string>();
  let ac: AudioContext | null = null;
  try { ac = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { ac = null; }
  const tone = (i: number, wrong = false) => {
    if (!ac) return;
    try {
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = wrong ? 'square' : 'triangle'; o.frequency.value = wrong ? 140 : NOTES[i];
      gn.gain.setValueAtTime(0.0001, ac.currentTime); gn.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (wrong ? 0.35 : 0.42));
      o.connect(gn).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.45);
    } catch { /* no sound on this device */ }
  };
  let seq: number[] = [r() * 4 | 0, r() * 4 | 0];
  let phase: 'show' | 'listen' | 'pause' = 'pause', pi = 0, timer = 0.8, score = 0, mood: CreatureState = 'idle', moodT = 0, streak = 0;
  const gap = () => clamp(0.55 - seq.length * 0.025, 0.28, 0.55);
  const press = (i: number) => {
    if (phase !== 'listen') return;
    flowers[i].lit = 0.3;
    if (seq[pi] === i) {
      tone(i); score += 1; pi++;
      if (pi >= seq.length) {
        score += seq.length; streak++;
        pops.push({ x: cx, y: cy - size * 1.3, text: `+${seq.length + 1} tune!`, color: '#FFE14D', life: 0 });
        mood = 'happy'; moodT = 1.2;
        seq.push(r() * 4 | 0);
        phase = 'pause'; timer = 1;
      }
    } else {
      tone(i, true); streak = 0;
      pops.push({ x: flowers[i].x, y: flowers[i].y - fr, text: 'oops', color: '#FF8A8A', life: 0 });
      mood = 'look'; moodT = 1;
      // a slip: a fresh, slightly shorter tune
      seq = Array.from({ length: Math.max(2, seq.length - 1) }, () => r() * 4 | 0);
      phase = 'pause'; timer = 1.2;
    }
  };
  return {
    pops,
    score: () => score,
    dispose: () => { void ac?.close().catch(() => {}); },
    step(dt) {
      for (const f of flowers) f.lit = Math.max(0, f.lit - dt);
      moodT -= dt; if (moodT <= 0 && phase !== 'show') mood = 'idle';
      for (const k of pressedSince(input.keys, prev)) {
        const i = ({ '1': 0, '2': 1, '3': 2, '4': 3, arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 } as Record<string, number>)[k];
        if (i !== undefined) press(i);
      }
      if (input.tap) {
        const tp = input.tap; input.tap = null;
        let best = -1, bd = fr * 1.3;
        flowers.forEach((f, i) => { const d = Math.hypot(tp.x - f.x, tp.y - f.y); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) press(best);
      }
      timer -= dt;
      if (phase === 'pause' && timer <= 0) { phase = 'show'; pi = 0; timer = 0.2; }
      else if (phase === 'show' && timer <= 0) {
        if (pi < seq.length) { const i = seq[pi]; flowers[i].lit = gap() * 0.85; tone(i); mood = 'happy'; pi++; timer = gap(); }
        else { phase = 'listen'; pi = 0; mood = 'idle'; }
      }
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      meadow(g, W, H, false, 23);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(cx, cy + 10, rad * 1.25, rad * 0.95, 0, 0, Math.PI * 2); g.fill();
      flowers.forEach((f, i) => {
        const lit = f.lit > 0;
        const k = lit ? 1.12 : 1;
        if (lit) { const gl = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, fr * 1.8); gl.addColorStop(0, `${COLORS[i]}cc`); gl.addColorStop(1, `${COLORS[i]}00`); g.fillStyle = gl; g.beginPath(); g.arc(f.x, f.y, fr * 1.8, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#2E7A3B'; g.fillRect(f.x - 3, f.y, 6, fr * 0.9);
        for (let p = 0; p < 6; p++) {
          const a = (p / 6) * Math.PI * 2 + Math.sin(t * 0.8 + i) * 0.08;
          g.fillStyle = lit ? COLORS[i] : `${COLORS[i]}99`;
          g.beginPath(); g.ellipse(f.x + Math.cos(a) * fr * 0.5 * k, f.y + Math.sin(a) * fr * 0.5 * k, fr * 0.36 * k, fr * 0.22 * k, a, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = lit ? '#FFFFFF' : '#FFE9A8'; g.beginPath(); g.arc(f.x, f.y, fr * 0.24 * k, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.font = '800 13px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(String(i + 1), f.x, f.y + 5);
      });
      drawCreature(g, genome, cx, cy + size * 0.45, size, { t, state: mood, dir: 1, look: 0 });
      if (phase === 'show') { g.font = '700 22px system-ui'; g.textAlign = 'center'; g.fillText(['♪', '♫', '♩'][Math.floor(t * 3) % 3], cx + size * 0.5 + Math.sin(t * 4) * 6, cy - size * 0.9); }
      g.font = '800 16px ui-rounded, system-ui'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.35)';
      const msg = phase === 'listen' ? `Your turn — ${seq.length - pi} note${seq.length - pi === 1 ? '' : 's'} to go` : phase === 'show' ? 'Listen…' : streak ? `${streak} in a row!` : 'Get ready…';
      g.strokeText(msg, cx, 96); g.fillStyle = '#FFFFFF'; g.fillText(msg, cx, 96);
      drawPops(g, pops);
    },
  };
}

export const ENGINES: Record<GameId, typeof berryDash> = { berrydash: berryDash, fireflies, leafleap: leafLeap, lilyhop: lilyHop, songbloom: songBloom };
