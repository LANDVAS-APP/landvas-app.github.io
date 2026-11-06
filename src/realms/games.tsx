// The realms' signature minigames. Each is a short skill game drawn on a canvas; the score goes to the server,
// which turns it into resources (from every zone the place has reached), finds, XP and a little Ink.
//   ⛏️ Deep Dig        tap blocks next to your miner to dig down before the lamp runs out
//   🪂 Sky Glide       hold to climb, let go to dive: catch starlight, dodge storm clouds
//   🏭 Assembly Line   tap a part to drop it into the bin below — the right bin for the part
//   🧑‍🍳 Order Up!      tap the ingredients in order, then tap the customer to serve
//   🗡️ Dungeon Dash    switch lanes to dodge traps, tap monsters before they reach you, grab treasure
import { useEffect, useRef, type ReactElement } from 'react';
import { rng } from '../home/party/kit';
import { sfx } from '../arcade/sfx';

export type GameProps = { seed: number; level: number; onEnd(score: number): void; onScore?(score: number): void };
export type Ptr = { x: number; y: number; id: number };
export type Loop = {
  update(dt: number, t: number): boolean | void; // return true when the game's over
  draw(g: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  down?(p: Ptr, w: number, h: number): void; up?(p: Ptr): void; key?(k: string, down: boolean): void;
  score(): number;
};
/** a full-size canvas with a game loop, pointer and keys */
export function useGame(make: (w: number, h: number) => Loop, onEnd: (s: number) => void, onScore?: (s: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const g = c.getContext('2d')!;
    let w = 0, h = 0; const dpr = Math.min(2, devicePixelRatio || 1);
    const size = () => { const r = c.getBoundingClientRect(); w = r.width; h = r.height; c.width = w * dpr; c.height = h * dpr; };
    size(); const ro = new ResizeObserver(size); ro.observe(c);
    const game = make(w, h);
    let last = performance.now(), t = 0, raf = 0, done = false, shown = -1;
    const tick = () => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      if (!done && game.update(dt, t)) { done = true; setTimeout(() => onEnd(Math.round(game.score())), 700); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); game.draw(g, w, h, t);
      const s = Math.round(game.score()); if (s !== shown) { shown = s; onScore?.(s); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const at = (e: PointerEvent): Ptr => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId }; };
    const pd = (e: PointerEvent) => { e.preventDefault(); if (!done) game.down?.(at(e), w, h); };
    const pu = (e: PointerEvent) => { if (!done) game.up?.(at(e)); };
    const kd = (e: KeyboardEvent) => { if (!done && !e.repeat) game.key?.(e.key, true); };
    const ku = (e: KeyboardEvent) => { if (!done) game.key?.(e.key, false); };
    c.addEventListener('pointerdown', pd); c.addEventListener('pointerup', pu); c.addEventListener('pointercancel', pu);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); c.removeEventListener('pointerdown', pd); c.removeEventListener('pointerup', pu); c.removeEventListener('pointercancel', pu); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="absolute inset-0 h-full w-full touch-none select-none" data-testid="realm-game-canvas" />;
}
export const emoji = (g: CanvasRenderingContext2D, e: string, x: number, y: number, s: number) => { g.font = `${s}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, x, y); };
export const bar = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, col: string) => { g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill(); g.fillStyle = col; g.beginPath(); g.roundRect(x, y, Math.max(h, w * Math.max(0, Math.min(1, f))), h, h / 2); g.fill(); };
export const popText = (pops: { x: number; y: number; t: string; life: number; c: string }[], g: CanvasRenderingContext2D, dt: number) => {
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= dt; p.y -= 40 * dt; g.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); g.fillStyle = p.c; g.font = '800 18px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(p.t, p.x, p.y); g.globalAlpha = 1; if (p.life <= 0) pops.splice(i, 1); }
};

// ======================================================================================================================
// ⛏️ Deep Dig
// ======================================================================================================================
const BLOCKS = [
  { id: 'dirt', hp: 1, pts: 2, col: '#8B5A2B', e: '' }, { id: 'stone', hp: 2, pts: 4, col: '#6B6470', e: '' }, { id: 'hard', hp: 3, pts: 6, col: '#3F3A47', e: '' },
  { id: 'copper', hp: 2, pts: 18, col: '#6B6470', e: '🟠', lv: 3 }, { id: 'iron', hp: 3, pts: 26, col: '#5A5462', e: '⚫', lv: 6 }, { id: 'silver', hp: 3, pts: 38, col: '#5A5462', e: '⚪', lv: 10 },
  { id: 'crystal', hp: 3, pts: 55, col: '#4A3A6A', e: '🔮', lv: 15 }, { id: 'gem', hp: 4, pts: 90, col: '#3A2A4A', e: '💎', lv: 22 },
  { id: 'gold', hp: 2, pts: 30, col: '#6B6470', e: '🪙' }, { id: 'oil', hp: 1, pts: 5, col: '#8B5A2B', e: '🛢️' }, { id: 'tnt', hp: 1, pts: 5, col: '#8B5A2B', e: '🧨' }, { id: 'bed', hp: 99, pts: 0, col: '#1A161E', e: '' },
];
export function DeepDig({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed), COLS = 7, CELL = Math.min(W / COLS, 70), ox = (W - CELL * COLS) / 2;
    const rows: (number[] | null)[] = []; const hp: number[][] = [];
    const pick = (depth: number) => {
      const x = r();
      if (x < 0.035) return 9; if (x < 0.05) return 10; if (x < 0.06 + depth * 0.0006) return 8;
      const ores = [3, 4, 5, 6, 7].filter((k) => level >= (BLOCKS[k].lv ?? 1));
      if (ores.length && x < 0.16 + Math.min(0.12, depth * 0.002)) { const deep = Math.min(ores.length - 1, Math.floor(r() * Math.min(ores.length, 1 + depth / 12))); return ores[deep]; }
      if (x < 0.19) return 11;
      return depth < 6 ? 0 : depth < 18 ? (r() < 0.6 ? 1 : 0) : (r() < 0.5 ? 2 : 1);
    };
    const row = (d: number) => { while (rows.length <= d) { const k = rows.length; rows.push(k === 0 ? [-1, -1, -1, -1, -1, -1, -1] : Array.from({ length: COLS }, (_, i) => (k === 1 && i === 3 ? 0 : pick(k)))); hp.push(rows[k]!.map((b) => (b < 0 ? 0 : BLOCKS[b].hp))); } return rows[d]!; };
    let mx = 3, my = 0, fy = 0, score = 0, oil = 45, cam = 0, shake = 0, deepest = 0;
    const pops: { x: number; y: number; t: string; life: number; c: string }[] = [], chips: { x: number; y: number; vx: number; vy: number; c: string; life: number }[] = [];
    const dig = (cx: number, cy: number) => {
      const b = row(cy)[cx]; if (b < 0 || b === 11) { if (b === 11) sfx.bonk(); return; }
      hp[cy][cx]--; for (let k = 0; k < 4; k++) chips.push({ x: ox + cx * CELL + CELL / 2, y: cy * CELL + CELL / 2, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200, c: BLOCKS[b].col, life: 0.5 });
      if (hp[cy][cx] > 0) { sfx.tick(); return; }
      rows[cy]![cx] = -1; const bl = BLOCKS[b];
      score += bl.pts; pops.push({ x: ox + cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 - cam, t: `+${bl.pts}`, life: 0.8, c: bl.e ? '#FFE14D' : '#fff' });
      if (bl.e) sfx.coin(); else sfx.drop();
      if (b === 9) { oil = Math.min(60, oil + 6); pops.push({ x: ox + cx * CELL + CELL / 2, y: cy * CELL - cam, t: '+6s lamp oil', life: 1.2, c: '#FFB13D' }); }
      if (b === 10) { shake = 0.4; sfx.fail(); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = cy + dy, xx = cx + dx; if (yy > 0 && xx >= 0 && xx < COLS && row(yy)[xx] >= 0 && row(yy)[xx] !== 11) { score += BLOCKS[row(yy)[xx]].pts; rows[yy]![xx] = -1; } } }
    };
    const tap = (cx: number, cy: number) => {
      if (cy < 0 || cx < 0 || cx >= COLS) return; if (cy === my && Math.abs(cx - mx) === 1) { if (row(cy)[cx] < 0) mx = cx; else dig(cx, cy); } else if (cx === mx && cy === my + 1) dig(cx, cy); else if (cx === mx && cy === my - 1 && row(cy)[cx] < 0) { /* can't climb */ } };
    return {
      score: () => score,
      update(dt) {
        oil -= dt; shake = Math.max(0, shake - dt);
        // fall into holes
        fy += dt; if (fy > 0.08) { fy = 0; if (row(my + 1)[mx] < 0) { my++; if (my > deepest) { deepest = my; score += 3; } } }
        cam += ((my - 3) * CELL - cam) * Math.min(1, dt * 6);
        return oil <= 0;
      },
      draw(g, w, h, t) {
        const depthC = Math.min(1, my / 60);
        g.fillStyle = `rgb(${20 - depthC * 10}, ${16 - depthC * 8}, ${26})`; g.fillRect(0, 0, w, h);
        g.save(); g.translate(shake ? (Math.random() - 0.5) * 10 : 0, -cam);
        const y0 = Math.max(0, Math.floor(cam / CELL) - 1), y1 = Math.ceil((cam + h) / CELL) + 1;
        for (let y = y0; y <= y1; y++) { const rw = row(y); for (let x = 0; x < COLS; x++) {
          const b = rw[x], px = ox + x * CELL, py = y * CELL;
          if (b < 0) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(px, py, CELL, CELL); continue; }
          const bl = BLOCKS[b]; g.fillStyle = bl.col; g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px + 1, py + 1, CELL - 2, 6);
          if (hp[y][x] < bl.hp) { g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(px + CELL * 0.3, py + CELL * 0.2); g.lineTo(px + CELL * 0.55, py + CELL * 0.5); g.lineTo(px + CELL * 0.4, py + CELL * 0.8); g.stroke(); }
          if (bl.e) emoji(g, bl.e, px + CELL / 2, py + CELL / 2, CELL * 0.5);
          // the blocks you can dig now glow
          const can = (y === my && Math.abs(x - mx) === 1) || (x === mx && y === my + 1);
          if (can && b !== 11) { g.strokeStyle = `rgba(255,225,77,${0.5 + Math.sin(t * 6) * 0.3})`; g.lineWidth = 3; g.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6); }
        } }
        emoji(g, '👷', ox + mx * CELL + CELL / 2, my * CELL + CELL / 2, CELL * 0.7);
        for (let i = chips.length - 1; i >= 0; i--) { const c = chips[i]; c.life -= 1 / 60; c.vy += 600 / 60; c.x += c.vx / 60; c.y += c.vy / 60; g.fillStyle = c.c; g.fillRect(c.x, c.y, 5, 5); if (c.life <= 0) chips.splice(i, 1); }
        g.restore();
        // the lamp: everything outside its circle is dark
        const lx = ox + mx * CELL + CELL / 2, ly = my * CELL + CELL / 2 - cam, rad = CELL * (2.2 + oil / 20);
        const gr = g.createRadialGradient(lx, ly, rad * 0.4, lx, ly, rad * 1.4); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.92)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        popText(pops, g, 1 / 60);
        bar(g, 16, h - 28, w - 32, 12, oil / 45, oil < 8 ? '#FF4D4D' : '#FFB13D');
        g.fillStyle = '#fff'; g.font = '700 13px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillText(`🔦 ${Math.ceil(oil)}s · depth ${deepest}m`, 18, h - 38);
      },
      down(p) { const cx = Math.floor((p.x - ox) / CELL), cy = Math.floor((p.y + cam) / CELL); if (cx >= 0 && cx < COLS) tap(cx, cy); },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft' || k === 'a') tap(mx - 1, my); if (k === 'ArrowRight' || k === 'd') tap(mx + 1, my); if (k === 'ArrowDown' || k === 's' || k === ' ') tap(mx, my + 1); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🪂 Sky Glide
// ======================================================================================================================
export function SkyGlide({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let y = H / 2, vy = 0, hold = false, score = 0, hearts = 3, time = 60, speed = 190, hurt = 0, dist = 0;
    type O = { x: number; y: number; k: 'star' | 'big' | 'ring' | 'storm' | 'bird' | 'heart'; hit?: boolean; ph: number };
    const objs: O[] = []; let next = 0.5;
    const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    const clouds = Array.from({ length: 12 }, () => ({ x: r() * W, y: r() * H, s: 30 + r() * 60, v: 0.2 + r() * 0.6 }));
    return {
      score: () => score,
      update(dt) {
        time -= dt; hurt = Math.max(0, hurt - dt); speed = 190 + (60 - time) * 3; dist += speed * dt;
        vy += (hold ? -900 : 650) * dt; vy = Math.max(-380, Math.min(420, vy)); y += vy * dt;
        if (y < 30) { y = 30; vy = 0; } if (y > H - 30) { y = H - 30; vy = -200; if (!hurt) { hearts--; hurt = 1; sfx.bonk(); } }
        next -= dt;
        if (next <= 0) {
          next = 0.35 + r() * 0.4;
          const roll = r(), oy = 50 + r() * (H - 100);
          const k: O['k'] = roll < 0.45 ? 'star' : roll < 0.55 ? 'big' : roll < 0.66 ? 'ring' : roll < 0.86 ? 'storm' : roll < 0.97 ? 'bird' : 'heart';
          if (k === 'star') for (let i = 0; i < 4; i++) objs.push({ x: W + 30 + i * 40, y: oy + Math.sin(i) * 30, k, ph: r() * 6 });
          else objs.push({ x: W + 40, y: oy, k, ph: r() * 6 });
        }
        const gx = W * 0.25;
        for (const o of objs) {
          o.x -= speed * dt * (o.k === 'bird' ? 1.35 : 1); if (o.k === 'bird') o.y += Math.sin(o.x / 40 + o.ph) * 60 * dt;
          if (o.hit) continue;
          const d = Math.hypot(o.x - gx, o.y - y), R = o.k === 'storm' ? 44 : o.k === 'ring' ? 34 : 26;
          if (d < R) {
            o.hit = true;
            const pts = o.k === 'star' ? 12 : o.k === 'big' ? 60 : o.k === 'ring' ? 35 : 0;
            if (pts) { score += pts + Math.floor(level / 3); pops.push({ x: o.x, y: o.y, t: `+${pts}`, life: 0.8, c: '#FFE14D' }); sfx.blip(o.k === 'big' ? 12 : 5); }
            if (o.k === 'ring') speed += 25;
            if (o.k === 'heart') { hearts = Math.min(3, hearts + 1); sfx.coin(); }
            if ((o.k === 'storm' || o.k === 'bird') && !hurt) { hearts--; hurt = 1.2; sfx.bonk(); }
          }
        }
        for (let i = objs.length - 1; i >= 0; i--) if (objs[i].x < -60 || (objs[i].hit && objs[i].k !== 'storm' && objs[i].k !== 'bird')) objs.splice(i, 1);
        return time <= 0 || hearts <= 0;
      },
      draw(g, w, h, t) {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5AA9F2'); gr.addColorStop(1, '#CBE9FF'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.7)';
        for (const c of clouds) { c.x -= c.v * speed / 60 * 0.5; if (c.x < -c.s * 2) { c.x = w + c.s; c.y = Math.random() * h; } g.beginPath(); g.ellipse(c.x, c.y, c.s, c.s * 0.45, 0, 0, Math.PI * 2); g.fill(); }
        for (const o of objs) {
          if (o.k === 'star') emoji(g, '✨', o.x, o.y, 26);
          else if (o.k === 'big') emoji(g, '🌟', o.x, o.y, 40);
          else if (o.k === 'ring') { g.strokeStyle = `hsl(${(t * 120) % 360},90%,60%)`; g.lineWidth = 6; g.beginPath(); g.ellipse(o.x, o.y, 18, 38, 0, 0, Math.PI * 2); g.stroke(); }
          else if (o.k === 'storm') { g.fillStyle = '#4A4E66'; g.beginPath(); g.ellipse(o.x, o.y, 50, 28, 0, 0, Math.PI * 2); g.fill(); emoji(g, '⚡', o.x, o.y + 22, 24); }
          else if (o.k === 'bird') emoji(g, '🦅', o.x, o.y, 34);
          else emoji(g, '💖', o.x, o.y, 26);
        }
        const gx = w * 0.25;
        g.save(); g.translate(gx, y); g.rotate(Math.max(-0.5, Math.min(0.5, vy / 600))); if (hurt && Math.floor(t * 12) % 2) g.globalAlpha = 0.4;
        g.fillStyle = '#FF6B9E'; g.beginPath(); g.moveTo(-34, -6); g.quadraticCurveTo(0, -26, 34, -6); g.lineTo(0, 0); g.closePath(); g.fill();
        emoji(g, '🧒', 0, 12, 26); g.restore();
        popText(pops, g, 1 / 60);
        g.fillStyle = '#fff'; g.font = '800 16px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillText(`${'❤️'.repeat(Math.max(0, hearts))}  ⏱ ${Math.ceil(time)}s`, 14, h - 20);
        if (t < 3) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(w / 2 - 150, h / 2 - 24, 300, 48, 24); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 15px ui-rounded, system-ui'; g.fillText('Hold anywhere to climb, let go to dive', w / 2, h / 2 + 5); }
      },
      down() { hold = true; }, up() { hold = false; },
      key(k, d) { if (k === ' ' || k === 'ArrowUp' || k === 'w') hold = d; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🏭 Assembly Line
// ======================================================================================================================
const PARTS = [{ e: '🥫', c: '#8A8A99' }, { e: '⚙️', c: '#C9A04A' }, { e: '🌀', c: '#22B8CF' }, { e: '🧵', c: '#B87333' }, { e: '💾', c: '#3DDC97' }, { e: '🔋', c: '#8B5CFF' }];
export function AssemblyLine({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed), kinds = Math.min(6, 3 + (level >= 6 ? 1 : 0) + (level >= 15 ? 1 : 0) + (level >= 22 ? 1 : 0));
    const BINW = Math.min(110, (W - 24) / 4), beltY = H * 0.36;
    // four bins along the bottom; every 12 seconds their labels change
    const bins = Array.from({ length: 4 }, (_, i) => ({ k: i % kinds }));
    let score = 0, lives = 5, time = 60, speed = 90, combo = 0, next = 0.4, flash = 0;
    type Part = { k: number; x: number; y: number; vy: number; falling: boolean; done?: boolean };
    const parts: Part[] = []; const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    const binX = (i: number, w: number) => (w - BINW * 4) / 2 + i * BINW + BINW / 2;
    return {
      score: () => score,
      update(dt) {
        time -= dt; speed = 90 + (60 - time) * 2.2; flash = Math.max(0, flash - dt);
        // every 12 seconds the bins get new labels (but there's always a bin for every part on the belt)
        if (Math.floor(time) % 12 === 0 && Math.floor(time + dt) % 12 !== 0) {
          const need = [...new Set(parts.filter((q) => !q.done).map((q) => q.k))].slice(0, 4);
          bins.forEach((b, i) => { b.k = need[i] ?? Math.floor(r() * kinds); });
          for (let i = bins.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bins[i].k, bins[j].k] = [bins[j].k, bins[i].k]; }
        }
        // make sure every kind on the belt has a bin
        next -= dt; if (next <= 0) { next = Math.max(0.45, 1.2 - (60 - time) * 0.012); const ks = [...new Set(bins.map((b) => b.k))]; parts.push({ k: ks[Math.floor(r() * ks.length)], x: -30, y: beltY - 22, vy: 0, falling: false }); }
        for (const p of parts) {
          if (p.done) continue;
          if (!p.falling) { p.x += speed * dt; if (p.x > W + 20) { p.done = true; lives--; combo = 0; flash = 0.4; sfx.fail(); } }
          else {
            p.vy += 1400 * dt; p.y += p.vy * dt;
            if (p.y > H - 70) {
              p.done = true;
              const bi = bins.findIndex((b, i) => Math.abs(binX(i, W) - p.x) < BINW / 2);
              if (bi >= 0 && bins[bi].k === p.k) { combo++; const pts = 10 + Math.min(40, combo * 3) + p.k * 4; score += pts; pops.push({ x: p.x, y: H - 110, t: `+${pts}${combo > 2 ? ` x${combo}` : ''}`, life: 0.8, c: '#3DDC97' }); sfx.perfect(combo); }
              else if (bi < 0) { combo = 0; pops.push({ x: p.x, y: H - 110, t: 'missed!', life: 0.7, c: '#FFB13D' }); sfx.drop(); }
              else { lives--; combo = 0; flash = 0.4; pops.push({ x: p.x, y: H - 110, t: 'wrong bin!', life: 0.9, c: '#FF4D4D' }); sfx.bonk(); }
            }
          }
        }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].done) parts.splice(i, 1);
        return time <= 0 || lives <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2A1E16'; g.fillRect(0, 0, w, h);
        if (flash) { g.fillStyle = `rgba(255,60,60,${flash * 0.6})`; g.fillRect(0, 0, w, h); }
        // the bins' columns, so you can see where a part will land
        bins.forEach((b, i) => { g.fillStyle = `${PARTS[b.k].c}14`; g.fillRect(binX(i, w) - BINW / 2 + 4, beltY + 34, BINW - 8, h - 104 - beltY - 34); });
        // belt
        g.fillStyle = '#3A3A44'; g.fillRect(0, beltY, w, 26); g.fillStyle = '#55555F';
        for (let x = -((t * speed) % 30); x < w; x += 30) g.fillRect(x, beltY + 4, 14, 18);
        g.fillStyle = '#1E1E26'; g.fillRect(0, beltY + 26, w, 8);
        // the drop guide under each part on the belt
        for (const p of parts) { if (!p.falling) { g.strokeStyle = 'rgba(255,255,255,0.08)'; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(p.x, beltY + 30); g.lineTo(p.x, h - 70); g.stroke(); g.setLineDash([]); } }
        for (const p of parts) { g.fillStyle = PARTS[p.k].c; g.beginPath(); g.arc(p.x, p.y, 22, 0, Math.PI * 2); g.fill(); emoji(g, PARTS[p.k].e, p.x, p.y + 1, 26); }
        bins.forEach((b, i) => { const x = binX(i, w); g.fillStyle = PARTS[b.k].c; g.beginPath(); g.roundRect(x - BINW / 2 + 4, h - 70, BINW - 8, 56, 10); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - BINW / 2 + 10, h - 64, BINW - 20, 10); emoji(g, PARTS[b.k].e, x, h - 32, 28); });
        popText(pops, g, 1 / 60);
        g.fillStyle = '#fff'; g.font = '800 16px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillText(`${'🔧'.repeat(Math.max(0, lives))}  ⏱ ${Math.ceil(time)}s`, 14, 28);
        if (t < 3.5) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(w / 2 - 170, h * 0.55, 340, 48, 24); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 14px ui-rounded, system-ui'; g.fillText('Tap a part to drop it — into the bin that matches!', w / 2, h * 0.55 + 29); }
      },
      down(p) { let best: Part | null = null, bd = 50; for (const q of parts) { if (q.falling) continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } } if (!best) for (const q of parts) { if (!q.falling && Math.abs(q.x - p.x) < 40) { best = q; break; } } if (best) { best.falling = true; sfx.drop(); } },
      key(k, d) { if (d && k === ' ') { const q = parts.filter((x) => !x.falling).sort((a, b) => b.x - a.x)[0]; if (q) { q.falling = true; sfx.drop(); } } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🧑‍🍳 Order Up!
// ======================================================================================================================
const INGR = ['🍞', '🥚', '🧀', '🍅', '🥬', '🐟', '🍓', '🍫', '🍄'];
export function OrderUp({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed), n = Math.min(INGR.length, 5 + (level >= 6 ? 1 : 0) + (level >= 10 ? 1 : 0) + (level >= 15 ? 1 : 0) + (level >= 22 ? 1 : 0));
    const avail = INGR.slice(0, n);
    type Cust = { order: string[]; patience: number; max: number; face: string; slot: number; leaving?: number; happy?: boolean };
    const faces = ['🧑', '👩', '👨‍🦰', '👵', '🧔', '👧', '🧑‍🦱', '👴', '🤠', '🧕'];
    const custs: (Cust | null)[] = [null, null, null];
    let plate: string[] = [], score = 0, time = 60, served = 0, misses = 0, next = 0.2, shake = 0;
    const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    const btnW = Math.min(76, (W - 20) / Math.ceil(n / 2) - 8), btnH = 64;
    const btn = (i: number, w: number, h: number) => { const cols = Math.ceil(n / 2), row = Math.floor(i / cols), col = i % cols, x0 = (w - cols * (btnW + 8)) / 2; return { x: x0 + col * (btnW + 8), y: h - 160 + row * (btnH + 8) }; };
    const slotX = (s: number, w: number) => w * (0.2 + s * 0.3);
    const serve = (s: number) => {
      const c = custs[s]; if (!c || c.leaving != null || !plate.length) return;
      const ok = plate.length === c.order.length && plate.every((x, i) => x === c.order[i]);
      if (ok) { const tip = 25 * c.order.length + Math.round(40 * (c.patience / c.max)); score += tip; served++; pops.push({ x: slotX(s, W), y: 120, t: `+${tip} tip!`, life: 1, c: '#3DDC97' }); sfx.coin(); c.leaving = 0.6; c.happy = true; }
      else { misses++; shake = 0.3; pops.push({ x: slotX(s, W), y: 120, t: 'That’s not my order!', life: 1, c: '#FF4D4D' }); sfx.fail(); c.patience -= c.max * 0.25; }
      plate = [];
    };
    return {
      score: () => score,
      update(dt) {
        time -= dt; shake = Math.max(0, shake - dt); next -= dt;
        custs.forEach((c, i) => {
          if (!c) return;
          if (c.leaving != null) { c.leaving -= dt; if (c.leaving <= 0) custs[i] = null; return; }
          c.patience -= dt; if (c.patience <= 0) { misses++; pops.push({ x: slotX(i, W), y: 120, t: 'Walked out 😤', life: 1, c: '#FF4D4D' }); sfx.bonk(); c.leaving = 0.6; c.happy = false; }
        });
        if (next <= 0) { const free = custs.findIndex((c) => !c); if (free >= 0) { const len = 2 + Math.floor(r() * Math.min(3, 1 + served / 4)), max = 9 + len * 2.5 - Math.min(5, served * 0.2); custs[free] = { order: Array.from({ length: len }, () => avail[Math.floor(r() * avail.length)]), patience: max, max, face: faces[Math.floor(r() * faces.length)], slot: free }; } next = 1.2 + r() * 1.6; }
        return time <= 0;
      },
      draw(g, w, h) {
        g.fillStyle = '#3A2E50'; g.fillRect(0, 0, w, h);
        g.save(); if (shake) g.translate((Math.random() - 0.5) * 8, 0);
        // the counter
        g.fillStyle = '#E8323C'; g.fillRect(0, 210, w, 24); g.fillStyle = '#F4F1EA'; g.fillRect(0, 200, w, 12);
        custs.forEach((c, i) => {
          if (!c) return; const x = slotX(i, w), a = c.leaving != null ? Math.max(0, c.leaving / 0.6) : 1;
          g.globalAlpha = a; emoji(g, c.leaving != null ? (c.happy ? '😋' : '😤') : c.face, x, 165, 56);
          const step = Math.min(52, (w * 0.3 - 18) / c.order.length), es = Math.min(34, step * 0.78);
          g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x - (step * c.order.length) / 2 - 6, 40, step * c.order.length + 12, 58, 14); g.fill();
          c.order.forEach((e, k) => emoji(g, e, x - (step * (c.order.length - 1)) / 2 + k * step, 70, es));
          bar(g, x - 50, 104, 100, 10, c.patience / c.max, c.patience / c.max < 0.3 ? '#FF4D4D' : '#3DDC97');
          g.globalAlpha = 1;
        });
        g.restore();
        // your plate
        g.fillStyle = '#F4F1EA'; g.beginPath(); g.ellipse(w / 2, 290, 120, 34, 0, 0, Math.PI * 2); g.fill();
        plate.forEach((e, k) => emoji(g, e, w / 2 - 30 * (plate.length - 1) + k * 60, 286, 36));
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '700 12px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(plate.length ? 'Tap a customer to serve · tap the plate to clear' : 'Tap ingredients in the order they asked', w / 2, 345);
        avail.forEach((e, i) => { const b = btn(i, w, h); g.fillStyle = '#F4F1EA'; g.beginPath(); g.roundRect(b.x, b.y, btnW, btnH, 14); g.fill(); emoji(g, e, b.x + btnW / 2, b.y + btnH / 2 + 2, 34); });
        popText(pops, g, 1 / 60);
        g.fillStyle = '#fff'; g.font = '800 16px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillText(`⏱ ${Math.ceil(time)}s · served ${served}`, 14, h - 190);
      },
      down(p, w, h) {
        for (let i = 0; i < avail.length; i++) { const b = btn(i, w, h); if (p.x >= b.x && p.x <= b.x + btnW && p.y >= b.y && p.y <= b.y + btnH) { if (plate.length < 4) { plate.push(avail[i]); sfx.blip(i); } return; } }
        if (Math.abs(p.y - 290) < 40 && Math.abs(p.x - w / 2) < 130) { plate = []; sfx.swish(); return; }
        for (let s = 0; s < 3; s++) if (Math.abs(p.x - slotX(s, w)) < w * 0.14 && p.y < 230) { serve(s); return; }
      },
      key(k, d) { if (!d) return; const i = Number(k) - 1; if (i >= 0 && i < avail.length && plate.length < 4) { plate.push(avail[i]); sfx.blip(i); } if (k === 'q') serve(0); if (k === 'w') serve(1); if (k === 'e') serve(2); if (k === 'Backspace') plate = []; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🗡️ Dungeon Dash
// ======================================================================================================================
export function DungeonDash({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed), LANES = 3, laneW = Math.min(130, W / 3.2), lx = (i: number, w: number) => w / 2 + (i - 1) * laneW;
    let lane = 1, x = W / 2, score = 0, hearts = 3, time = 60, speed = 220, hurt = 0, next = 0.6, slash = 0, slashLane = 1;
    const heroY = H - 110;
    type T = { lane: number; y: number; k: 'mob' | 'boss' | 'spikes' | 'coin' | 'chest' | 'potion'; hp: number; dead?: boolean; e: string };
    const things: T[] = []; const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    const mobs = ['👻', '🦇', '🕷️', '💀', '👺', ...(level >= 6 ? ['🧟'] : []), ...(level >= 10 ? ['🐺'] : []), ...(level >= 15 ? ['👹'] : [])];
    const hitMob = (o: T, px: number) => { o.hp--; slash = 0.18; slashLane = o.lane; sfx.cut(); if (o.hp <= 0) { o.dead = true; const pts = o.k === 'boss' ? 120 : 25; score += pts; pops.push({ x: px, y: o.y, t: `+${pts}`, life: 0.8, c: '#FFE14D' }); } };
    return {
      score: () => score,
      update(dt) {
        time -= dt; hurt = Math.max(0, hurt - dt); slash = Math.max(0, slash - dt); speed = 220 + (60 - time) * 3.5;
        x += (lx(lane, W) - x) * Math.min(1, dt * 14);
        next -= dt;
        if (next <= 0) {
          next = Math.max(0.32, 0.75 - (60 - time) * 0.006);
          const roll = r(), ln = Math.floor(r() * LANES);
          if (roll < 0.36) things.push({ lane: ln, y: -40, k: 'mob', hp: 1, e: mobs[Math.floor(r() * mobs.length)] });
          else if (roll < 0.42 && time < 50) things.push({ lane: ln, y: -40, k: 'boss', hp: 4, e: level >= 22 ? '🐉' : '👹' });
          else if (roll < 0.66) { things.push({ lane: ln, y: -40, k: 'spikes', hp: 99, e: '' }); if (r() < 0.4) things.push({ lane: (ln + 1 + Math.floor(r() * 2)) % 3, y: -40, k: 'spikes', hp: 99, e: '' }); }
          else if (roll < 0.9) things.push({ lane: ln, y: -40, k: 'coin', hp: 0, e: r() < 0.15 ? '💎' : '🪙' });
          else if (roll < 0.97) things.push({ lane: ln, y: -40, k: 'chest', hp: 0, e: '🧰' });
          else things.push({ lane: ln, y: -40, k: 'potion', hp: 0, e: '🧪' });
        }
        for (const o of things) {
          if (o.dead) continue;
          o.y += speed * dt * (o.k === 'boss' ? 0.6 : 1);
          if (Math.abs(o.y - heroY) < 28 && o.lane === lane) {
            if (o.k === 'coin') { o.dead = true; const p = o.e === '💎' ? 40 : 10; score += p; pops.push({ x, y: heroY - 30, t: `+${p}`, life: 0.6, c: '#FFE14D' }); sfx.coin(); }
            else if (o.k === 'chest') { o.dead = true; score += 60; pops.push({ x, y: heroY - 30, t: '+60 treasure!', life: 0.9, c: '#FFE14D' }); sfx.win(3); }
            else if (o.k === 'potion') { o.dead = true; hearts = Math.min(3, hearts + 1); sfx.coin(); }
            else if (!hurt) { hearts--; hurt = 1.1; o.dead = o.k !== 'spikes'; sfx.fail(); }
          }
        }
        for (let i = things.length - 1; i >= 0; i--) if (things[i].dead || things[i].y > H + 40) things.splice(i, 1);
        return time <= 0 || hearts <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#1A1420'; g.fillRect(0, 0, w, h);
        // the corridor: flagstones scrolling, torches on the walls
        for (let i = 0; i < LANES; i++) { g.fillStyle = i % 2 ? '#2E2836' : '#332C3C'; g.fillRect(lx(i, w) - laneW / 2, 0, laneW, h); }
        g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = ((t * speed) % 60) - 60; y < h; y += 60) g.fillRect(lx(0, w) - laneW / 2, y, laneW * 3, 3);
        for (const s of [-1, 1]) for (let y = ((t * speed) % 240) - 240; y < h; y += 240) emoji(g, '🔥', w / 2 + s * (laneW * 1.5 + 18), y, 24);
        for (const o of things) {
          const px = lx(o.lane, w);
          if (o.k === 'spikes') { g.fillStyle = '#9AA0B0'; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(px - laneW / 2 + 10 + k * (laneW - 20) / 5, o.y + 12); g.lineTo(px - laneW / 2 + 10 + (k + 0.5) * (laneW - 20) / 5, o.y - 14); g.lineTo(px - laneW / 2 + 10 + (k + 1) * (laneW - 20) / 5, o.y + 12); g.fill(); } }
          else { emoji(g, o.e, px, o.y, o.k === 'boss' ? 64 : 40); if (o.k === 'boss') bar(g, px - 30, o.y - 44, 60, 7, o.hp / 4, '#FF4D4D'); }
        }
        g.save(); if (hurt && Math.floor(t * 12) % 2) g.globalAlpha = 0.35; emoji(g, '🧝', x, heroY, 46); g.restore();
        if (slash) { g.strokeStyle = `rgba(255,255,255,${slash * 5})`; g.lineWidth = 6; g.beginPath(); g.arc(lx(slashLane, w), heroY - 80, 40, -2.6, -0.5); g.stroke(); }
        popText(pops, g, 1 / 60);
        g.fillStyle = '#fff'; g.font = '800 16px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillText(`${'❤️'.repeat(Math.max(0, hearts))}  ⏱ ${Math.ceil(time)}s`, 14, 26);
        if (t < 3.5) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(w / 2 - 170, h / 2 - 30, 340, 60, 20); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 14px ui-rounded, system-ui'; g.fillText('Tap monsters to slash them', w / 2, h / 2 - 6); g.fillText('Tap the floor left/right of you to switch lanes', w / 2, h / 2 + 16); }
      },
      down(p, w) {
        // a monster under your finger? slash it
        for (const o of things) { if (o.dead || (o.k !== 'mob' && o.k !== 'boss')) continue; const px = lx(o.lane, w); if (Math.hypot(px - p.x, o.y - p.y) < (o.k === 'boss' ? 50 : 36) && o.y < heroY + 10) { hitMob(o, px); return; } }
        if (p.x < x - 20) lane = Math.max(0, lane - 1); else if (p.x > x + 20) lane = Math.min(LANES - 1, lane + 1);
        sfx.swish();
      },
      key(k, d) {
        if (!d) return;
        if (k === 'ArrowLeft' || k === 'a') lane = Math.max(0, lane - 1);
        if (k === 'ArrowRight' || k === 'd') lane = Math.min(LANES - 1, lane + 1);
        if (k === ' ' || k === 'ArrowUp' || k === 'w') { const o = things.filter((q) => !q.dead && (q.k === 'mob' || q.k === 'boss') && q.lane === lane && q.y < heroY).sort((a, b) => b.y - a.y)[0]; if (o) hitMob(o, lx(o.lane, W)); }
      },
    };
  }, onEnd, onScore);
}

export const REALM_GAMES: Record<string, (p: GameProps) => ReactElement> = { dig: DeepDig, glide: SkyGlide, line: AssemblyLine, orders: OrderUp, delve: DungeonDash };
