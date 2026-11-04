// Two more Inkborn games, both feeding the keeper's bakery:
//  * Stardust Glide — glide through the night sky on a leaf, catching stardust (it comes home as 🌠)
//  * Crystal Caves — tap clusters of matching crystals to break them free (they come home as 💎)
import type { Genome } from '../genome';
import { drawCreature, type CreatureState } from '../rig';
import { rng } from '../world';
import type { Engine, GameInput } from './engines';

type Pop = { x: number; y: number; text: string; color: string; life: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function drawPops(g: CanvasRenderingContext2D, pops: Pop[]) {
  for (const p of pops) {
    g.globalAlpha = Math.max(0, 1 - p.life); g.font = '900 20px ui-rounded, system-ui'; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeText(p.text, p.x, p.y - p.life * 30); g.fillStyle = p.color; g.fillText(p.text, p.x, p.y - p.life * 30);
  }
  g.globalAlpha = 1;
}
const agePops = (pops: Pop[], dt: number) => { for (let i = pops.length - 1; i >= 0; i--) { pops[i].life += dt; if (pops[i].life > 1) pops.splice(i, 1); } };

// ---- Stardust Glide ---------------------------------------------------------------------------
export function stardustGlide(genome: Genome, seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const size = clamp(Math.min(W, H) * 0.12, 44, 76);
  const me = { x: W * 0.26, y: H * 0.5, vy: 0, dizzy: 0, happy: 0 };
  type Thing = { x: number; y: number; kind: 'dust' | 'gold' | 'cloud' | 'owl'; ph: number };
  const things: Thing[] = [];
  const stars = Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H * 0.9, s: 0.5 + r() * 1.6, p: r() * 6 }));
  const hills = Array.from({ length: 8 }, (_, i) => ({ x: i * (W / 4), h: 30 + r() * 60 }));
  const pops: Pop[] = [];
  let score = 0, clock = 0, spawnT = 0.4, scroll = 0;
  return {
    pops,
    score: () => score,
    step(dt) {
      clock += dt;
      const speed = 170 + Math.min(130, clock * 3);
      scroll += speed * dt;
      // hold anywhere (or ↑/space) to rise; let go to glide down
      const up = !!input.target || input.keys.has('arrowup') || input.keys.has('w') || input.keys.has(' ');
      me.vy += (up ? -620 : 380) * dt;
      me.vy = clamp(me.vy, -260, 220);
      me.y = clamp(me.y + me.vy * dt, size * 0.8, H - 30);
      if (me.y <= size * 0.8 || me.y >= H - 30) me.vy *= 0.3;
      me.dizzy -= dt; me.happy -= dt;
      spawnT -= dt;
      if (spawnT <= 0) {
        const roll = r();
        // a little trail of stardust, now and then a golden star, a storm cloud or a sleepy owl
        if (roll < 0.62) { const y0 = 60 + r() * (H - 140); const n = 3 + Math.floor(r() * 4); for (let i = 0; i < n; i++) things.push({ x: W + 20 + i * 34, y: y0 + Math.sin(i * 0.8) * 26, kind: 'dust', ph: r() * 6 }); }
        else if (roll < 0.7) things.push({ x: W + 30, y: 60 + r() * (H - 140), kind: 'gold', ph: 0 });
        else if (roll < 0.88) things.push({ x: W + 60, y: 60 + r() * (H - 160), kind: 'cloud', ph: r() * 6 });
        else things.push({ x: W + 40, y: 80 + r() * (H - 180), kind: 'owl', ph: r() * 6 });
        spawnT = 0.55 + r() * 0.6 - Math.min(0.25, clock / 200);
      }
      for (let i = things.length - 1; i >= 0; i--) {
        const t = things[i];
        t.x -= speed * dt * (t.kind === 'owl' ? 1.2 : 1);
        if (t.kind === 'owl') t.y += Math.sin(clock * 3 + t.ph) * 40 * dt;
        const d = Math.hypot(t.x - me.x, t.y - (me.y - size * 0.35));
        if ((t.kind === 'dust' || t.kind === 'gold') && d < size * 0.6) {
          const v = t.kind === 'gold' ? 5 : 1; score += v; me.happy = 0.4;
          pops.push({ x: t.x, y: t.y, text: `+${v}`, color: t.kind === 'gold' ? '#FFE14D' : '#C9D8FF', life: 0 });
          things.splice(i, 1); continue;
        }
        if ((t.kind === 'cloud' || t.kind === 'owl') && me.dizzy <= 0 && d < size * (t.kind === 'cloud' ? 0.8 : 0.55)) {
          me.dizzy = 1; const lost = Math.min(3, score); score -= lost;
          if (lost) pops.push({ x: me.x, y: me.y - size, text: `-${lost}`, color: '#FF8A8A', life: 0 });
        }
        if (t.x < -80) things.splice(i, 1);
      }
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0B1033'); sky.addColorStop(0.7, '#2A2466'); sky.addColorStop(1, '#4B3A7A');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (const s of stars) { g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.p)); g.fillStyle = '#fff'; g.fillRect(((s.x - scroll * 0.05) % W + W) % W, s.y, s.s, s.s); }
      g.globalAlpha = 1;
      g.fillStyle = '#F5F0D8'; g.beginPath(); g.arc(W * 0.82, H * 0.16, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1C2A4A';
      for (const h of hills) { const x = ((h.x - scroll * 0.3) % (W * 2) + W * 2) % (W * 2) - W * 0.25; g.beginPath(); g.ellipse(x, H, W * 0.3, h.h + 40, 0, Math.PI, 0); g.fill(); }
      for (const th of things) {
        if (th.kind === 'dust') { g.fillStyle = 'rgba(201,216,255,0.35)'; g.beginPath(); g.arc(th.x, th.y, 11, 0, Math.PI * 2); g.fill(); g.font = '18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✨', th.x, th.y); }
        else if (th.kind === 'gold') { g.fillStyle = 'rgba(255,225,77,0.4)'; g.beginPath(); g.arc(th.x, th.y, 20, 0, Math.PI * 2); g.fill(); g.font = '28px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🌟', th.x, th.y); }
        else if (th.kind === 'cloud') { g.font = '56px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🌩️', th.x, th.y); }
        else { g.font = '40px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🦉', th.x, th.y); }
      }
      // the leaf you ride
      g.fillStyle = '#5FBF6A'; g.beginPath(); g.ellipse(me.x, me.y + 4, size * 0.7, size * 0.16, -0.1 + me.vy / 2000, 0, Math.PI * 2); g.fill();
      const st: CreatureState = me.dizzy > 0 ? 'sleep' : me.happy > 0 ? 'happy' : 'idle';
      drawCreature(g, genome, me.x, me.y, size, { t, state: st, dir: 1 });
      if (me.dizzy > 0) { g.font = '700 18px system-ui'; g.textAlign = 'center'; g.fillText('💫', me.x, me.y - size * 1.1); }
      drawPops(g, pops);
    },
  };
}

// ---- Crystal Caves ----------------------------------------------------------------------------
const GEMS = ['#FF5C8A', '#4FC3FF', '#7BE36B', '#FFC93D', '#B57BFF'];
export function crystalCaves(genome: Genome, seed: number, W: number, H: number, input: GameInput): Engine {
  const r = rng(seed);
  const COLS = 6, ROWS = 7;
  const cell = Math.min((W - 24) / COLS, (H - 230) / ROWS);
  const ox = (W - cell * COLS) / 2, oy = 100;
  type Gem = { c: number } | null;
  const grid: Gem[][] = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => ({ c: Math.floor(r() * GEMS.length) })));
  const pops: Pop[] = [];
  const size = clamp(Math.min(W, H) * 0.12, 44, 76);
  let score = 0, happy = 0, shake = 0, combo = 0, comboT = 0;
  const group = (x: number, y: number) => {
    const g0 = grid[x][y]; if (!g0) return [];
    const seen = new Set<string>(), out: [number, number][] = [], stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [a, b] = stack.pop()!; const k = `${a},${b}`;
      if (seen.has(k) || a < 0 || b < 0 || a >= COLS || b >= ROWS) continue;
      seen.add(k); const g = grid[a][b];
      if (!g || g.c !== g0.c) continue;
      out.push([a, b]); stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    return out;
  };
  // gems drop into the gaps and fresh ones fall in from the top; each keeps an offset (pixels above its slot) that eases to 0
  const fallOffset = new Map<NonNullable<Gem>, number>();
  const settle = () => {
    for (let x = 0; x < COLS; x++) {
      const col = grid[x].filter(Boolean) as NonNullable<Gem>[];
      const fresh = ROWS - col.length;
      const news = Array.from({ length: fresh }, () => ({ c: Math.floor(r() * GEMS.length) }));
      for (const g of news) fallOffset.set(g, fresh * cell);
      grid[x] = [...news, ...col];
    }
  };
  return {
    pops,
    score: () => score,
    step(dt) {
      happy -= dt; shake = Math.max(0, shake - dt * 4); comboT -= dt; if (comboT <= 0) combo = 0;
      for (const [g, off] of fallOffset) { const n = Math.max(0, off - dt * 900); if (n <= 0) fallOffset.delete(g); else fallOffset.set(g, n); }
      if (input.tap) {
        const tp = input.tap; input.tap = null;
        const x = Math.floor((tp.x - ox) / cell), y = Math.floor((tp.y - oy) / cell);
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS && grid[x][y]) {
          const gr = group(x, y);
          if (gr.length >= 2) {
            combo += 1; comboT = 2.2;
            const pts = Math.round((gr.length * (gr.length - 1)) / 2) + (combo >= 3 ? 2 : 0);
            score += pts; happy = 0.6;
            pops.push({ x: ox + (x + 0.5) * cell, y: oy + (y + 0.5) * cell, text: `+${pts}${combo >= 3 ? ' 🔥' : ''}`, color: GEMS[grid[x][y]!.c], life: 0 });
            // how far the gems above will fall
            const removed = new Set(gr.map(([a, b]) => `${a},${b}`));
            for (let a = 0; a < COLS; a++) {
              let gap = 0;
              for (let b = ROWS - 1; b >= 0; b--) {
                if (removed.has(`${a},${b}`)) { gap++; continue; }
                const g = grid[a][b]; if (g && gap) fallOffset.set(g, (fallOffset.get(g) ?? 0) + gap * cell);
              }
            }
            for (const [a, b] of gr) grid[a][b] = null;
            settle();
          } else { shake = 1; combo = 0; }
        }
      }
      agePops(pops, dt);
    },
    draw(g, W, H, t) {
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1B1430'); bg.addColorStop(1, '#2D2148'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // cave walls
      g.fillStyle = '#3A2E58'; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(i * W / 8 - 30, 0); g.lineTo(i * W / 8 + 30, 0); g.lineTo(i * W / 8, 50 + (i % 3) * 22); g.fill(); }
      const sx = shake ? Math.sin(t * 80) * shake * 4 : 0;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.roundRect(ox - 8 + sx, oy - 8, cell * COLS + 16, cell * ROWS + 16, 18); g.fill();
      for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
        const gem = grid[x][y]; if (!gem) continue;
        const off = fallOffset.get(gem) ?? 0;
        const cx = ox + (x + 0.5) * cell + sx, cy = oy + (y + 0.5) * cell - off, s = cell * 0.4;
        g.fillStyle = GEMS[gem.c];
        g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.85, cy - s * 0.2); g.lineTo(cx + s * 0.55, cy + s); g.lineTo(cx - s * 0.55, cy + s); g.lineTo(cx - s * 0.85, cy - s * 0.2); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(cx - s * 0.3, cy - s * 0.6); g.lineTo(cx + s * 0.1, cy - s * 0.6); g.lineTo(cx - s * 0.1, cy); g.closePath(); g.fill();
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3 + x + y); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
      }
      drawCreature(g, genome, W / 2, H - 22, size, { t, state: happy > 0 ? 'happy' : 'idle', dir: 1 });
      if (combo >= 3) { g.font = '900 18px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillStyle = '#FFC93D'; g.fillText(`🔥 ${combo} in a row`, W / 2, H - size * 1.3 - 22); }
      drawPops(g, pops);
    },
  };
}
