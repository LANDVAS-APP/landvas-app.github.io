// Domain minigames, part 2:
//   ☄️ Orbit Slingshot  (Celestial Observatory) aim a comet; planets' gravity bends its path to the targets
//   🔌 Circuit Connect  (Automaton Works)       rotate tiles to carry power from the battery to every bulb
//   🔪 Perfect Slice    (Sky Banquet Palace)    swipe to cut cakes into fair slices
//   ✨ Rune Duel        (Abyssal Throne)        draw the rune over each monster before it reaches the throne
//   🔥 Elemental Clash  (Hall of Titans)        read the titan's tell and answer fire / water / leaf
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, useGame, type GameProps, type Ptr } from '../games';
import { INTRO, TOP, burst, button, clamp, hearts, hud, inBox, intro, pops, sparks, type Pop, type Spark } from './kit';

// ======================================================================================================================
// ☄️ Orbit Slingshot
// ======================================================================================================================
export function OrbitSlingshot({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    type Planet = { x: number; y: number; m: number; rad: number; c: string; sun?: boolean };
    type Target = { x: number; y: number; hit: boolean };
    let score = 0, time = 60, stage = 0, shots = 0, planets: Planet[] = [], targets: Target[] = [], aim: { x: number; y: number } | null = null, msg = '', msgT = 0;
    let comet: { x: number; y: number; vx: number; vy: number; life: number; trail: { x: number; y: number }[]; hits: number; boosts: number } | null = null;
    const pp: Pop[] = [], sp: Spark[] = [];
    const bg = Array.from({ length: 80 }, () => ({ x: r(), y: r(), s: r() * 1.5 + 0.3 }));
    const launch = () => ({ x: W / 2, y: H - 70 });
    const deal = () => {
      stage++; planets = []; targets = [];
      const np = Math.min(4, 1 + Math.floor(stage / 2));
      for (let i = 0; i < np; i++) {
        let x = 0, y = 0, k = 0;
        do { x = 60 + r() * (W - 120); y = TOP + 90 + r() * (H - TOP - 280); k++; } while (k < 30 && planets.some((p) => Math.hypot(p.x - x, p.y - y) < 120));
        const sun = stage > 2 && i === 0 && r() < 0.5;
        planets.push({ x, y, m: sun ? 140000 : 60000 + r() * 50000, rad: sun ? 26 : 14 + r() * 10, c: sun ? '#FFB020' : ['#6C9BFF', '#FF8AD8', '#7CE0B0', '#C9A6FF'][i % 4], sun });
      }
      const nt = Math.min(5, 2 + Math.floor(stage / 2));
      for (let i = 0; i < nt; i++) {
        let x = 0, y = 0, k = 0;
        do { x = 40 + r() * (W - 80); y = TOP + 50 + r() * (H - TOP - 220); k++; } while (k < 40 && (planets.some((p) => Math.hypot(p.x - x, p.y - y) < p.rad + 40) || targets.some((t) => Math.hypot(t.x - x, t.y - y) < 60)));
        targets.push({ x, y, hit: false });
      }
      if (stage > 1) { msg = `Sector ${stage}`; msgT = 1.2; }
    };
    deal();
    const fire = (dx: number, dy: number) => {
      const s = launch(), pow = clamp(Math.hypot(dx, dy) / 130, 0.2, 1.3), a = Math.atan2(-dy, -dx);
      comet = { x: s.x, y: s.y, vx: Math.cos(a) * 420 * pow, vy: Math.sin(a) * 420 * pow, life: 5, trail: [], hits: 0, boosts: 0 }; shots++; sfx.swish();
    };
    const end = (why: string) => {
      if (!comet) return;
      if (comet.hits > 1) { const b = comet.hits * 25; score += b; pp.push({ x: W / 2, y: H * 0.4, t: `multi-hit +${b}`, life: 1.2, c: '#FFE14D' }); }
      if (why) { msg = why; msgT = 1; }
      comet = null;
      if (targets.every((t) => t.hit)) { const b = 80 + stage * 20; score += b; pp.push({ x: W / 2, y: H / 2, t: `Sector clear! +${b}`, life: 1.4, c: '#9AE6FF' }); sfx.jackpot(); deal(); }
    };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (comet) {
          // a few substeps so fast slingshots stay accurate
          for (let k = 0; k < 4 && comet; k++) {
            const h = dt / 4;
            for (const p of planets) {
              const dx = p.x - comet.x, dy = p.y - comet.y, d2 = Math.max(dx * dx + dy * dy, 400), d = Math.sqrt(d2), f = p.m / d2;
              comet.vx += (dx / d) * f * h; comet.vy += (dy / d) * f * h;
              if (d < p.rad + 4) { burst(sp, comet.x, comet.y, [p.c, '#fff'], 18, 200); sfx.bonk(); end(p.sun ? '🔥 Swallowed by the sun' : '💥 Crashed'); break; }
              if (d < p.rad + 34 && !(comet.boosts & (1 << planets.indexOf(p)))) { comet.boosts |= 1 << planets.indexOf(p); score += 10; pp.push({ x: p.x, y: p.y - p.rad - 14, t: 'slingshot +10', life: 0.8, c: '#C9A6FF' }); }
            }
            if (!comet) break;
            comet.x += comet.vx * h; comet.y += comet.vy * h;
            for (const tg of targets) if (!tg.hit && Math.hypot(tg.x - comet.x, tg.y - comet.y) < 22) {
              tg.hit = true; comet.hits++; const pts = 40 * comet.hits + Math.floor(level / 2) * 2; score += pts;
              pp.push({ x: tg.x, y: tg.y - 20, t: `+${pts}`, life: 1, c: '#9AE6FF' }); burst(sp, tg.x, tg.y, ['#9AE6FF', '#fff', '#4F6BFF'], 20, 240); sfx.perfect(comet.hits * 2);
            }
          }
          if (comet) {
            comet.trail.push({ x: comet.x, y: comet.y }); if (comet.trail.length > 60) comet.trail.shift();
            comet.life -= dt;
            if (comet.life <= 0 || comet.x < -80 || comet.x > W + 80 || comet.y < -80 || comet.y > H + 80) end(comet.hits ? '' : 'Lost in space');
          }
        }
        return time <= 0 && !comet;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#04061A'; g.fillRect(0, 0, w, h);
        for (const s of bg) { g.fillStyle = `rgba(255,255,255,${0.35 + 0.3 * Math.sin(t + s.x * 9)})`; g.fillRect(s.x * w, s.y * h, s.s, s.s); }
        for (const p of planets) {
          // gravity well rings
          g.strokeStyle = 'rgba(255,255,255,0.06)'; for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(p.x, p.y, p.rad + k * 22, 0, Math.PI * 2); g.stroke(); }
          const gr = g.createRadialGradient(p.x - p.rad * 0.4, p.y - p.rad * 0.4, 1, p.x, p.y, p.rad); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, p.c); gr.addColorStop(1, '#111'); g.fillStyle = gr;
          if (p.sun) { g.shadowColor = '#FFB020'; g.shadowBlur = 30 + Math.sin(t * 4) * 8; }
          g.beginPath(); g.arc(p.x, p.y, p.rad, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
          if (!p.sun) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y, p.rad * 1.7, p.rad * 0.45, -0.3, 0, Math.PI * 2); g.stroke(); }
        }
        for (const tg of targets) { if (tg.hit) continue; g.strokeStyle = '#9AE6FF'; g.lineWidth = 2; g.beginPath(); g.arc(tg.x, tg.y, 14 + Math.sin(t * 5) * 2, 0, Math.PI * 2); g.stroke(); emoji(g, '🛰️', tg.x, tg.y, 20); }
        const s = launch();
        if (aim && !comet) {
          // a short preview of the path, gravity included
          const dx = aim.x - s.x, dy = aim.y - s.y, pow = clamp(Math.hypot(dx, dy) / 130, 0.2, 1.3), a = Math.atan2(-dy, -dx);
          let x = s.x, y = s.y, vx = Math.cos(a) * 420 * pow, vy = Math.sin(a) * 420 * pow;
          g.fillStyle = 'rgba(255,255,255,0.6)';
          for (let i = 0; i < 70; i++) { const hh = 1 / 120; for (const p of planets) { const ddx = p.x - x, ddy = p.y - y, d2 = Math.max(ddx * ddx + ddy * ddy, 400), d = Math.sqrt(d2), f = p.m / d2; vx += (ddx / d) * f * hh; vy += (ddy / d) * f * hh; } x += vx * hh; y += vy * hh; if (i % 3 === 0 && i < 45) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); } }
          g.strokeStyle = '#FFB020'; g.lineWidth = 3; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(aim.x, aim.y); g.stroke();
        }
        if (comet) {
          g.lineCap = 'round'; comet.trail.forEach((p, i) => { g.strokeStyle = `rgba(150,220,255,${i / comet!.trail.length})`; g.lineWidth = (i / comet!.trail.length) * 6; if (i) { g.beginPath(); g.moveTo(comet!.trail[i - 1].x, comet!.trail[i - 1].y); g.lineTo(p.x, p.y); g.stroke(); } });
          emoji(g, '☄️', comet.x, comet.y, 24);
        } else emoji(g, '☄️', aim ? aim.x : s.x, aim ? aim.y : s.y, 26);
        g.fillStyle = 'rgba(79,107,255,0.4)'; g.beginPath(); g.arc(s.x, s.y + 30, 34, Math.PI, 0); g.fill();
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#9AE6FF'; g.font = '900 22px ui-rounded'; g.textAlign = 'center'; g.fillText(msg, w / 2, h * 0.62); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60, 0); pops(pp, g, 1 / 60, 18);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#9AE6FF', `🛰️ ${targets.filter((x) => !x.hit).length} left`);
        intro(g, w, h, t, ['Orbit Slingshot', 'Drag back from the comet and let go.', 'Planets pull it round — use their gravity', 'to curve into the 🛰️ targets. Avoid suns!']);
      },
      down(p: Ptr) { if (!comet && time > 0) aim = { x: p.x, y: p.y }; },
      move(p: Ptr) { if (aim) aim = { x: p.x, y: p.y }; },
      up() { if (aim) { const s = launch(); if (Math.hypot(aim.x - s.x, aim.y - s.y) > 12) fire(aim.x - s.x, aim.y - s.y); aim = null; } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔌 Circuit Connect — a rotate-the-pipes puzzle
// ======================================================================================================================
// tile openings as bits: 1 up, 2 right, 4 down, 8 left
const rot = (m: number) => ((m << 1) | (m >> 3)) & 15;
export function CircuitConnect({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, board = 0, N = 4, tiles: number[] = [], solution: number[] = [], bulbs: number[] = [], src = 0, lit = new Set<number>(), turns = 0, flash = 0, msg = '', msgT = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const geo = () => { const cs = Math.min((W - 30) / N, (H - TOP - 60) / N, 92); return { cs, ox: (W - cs * N) / 2, oy: TOP + 30 + (H - TOP - 60 - cs * N) / 2 }; };
    const deal = () => {
      board++; N = Math.min(6, 3 + Math.floor((board + 1) / 2)); turns = 0;
      // a random spanning tree (so every tile is reachable from the battery), then scramble the rotations
      solution = Array(N * N).fill(0); const seen = new Set<number>(); src = Math.floor(r() * N * N); const stack = [src]; seen.add(src);
      while (stack.length) {
        const c = stack[stack.length - 1], x = c % N, y = Math.floor(c / N);
        const opts = ([[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]] as const).filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && !seen.has(ny * N + nx); });
        if (!opts.length) { stack.pop(); continue; }
        const [dx, dy, a, b] = opts[Math.floor(r() * opts.length)], n = (y + dy) * N + x + dx;
        solution[c] |= a; solution[n] |= b; seen.add(n); stack.push(n);
      }
      bulbs = []; for (let i = 0; i < N * N; i++) if (i !== src && [1, 2, 4, 8].filter((b) => solution[i] & b).length === 1) bulbs.push(i);
      tiles = solution.map((m) => { let v = m; const k = Math.floor(r() * 4); for (let i = 0; i < k; i++) v = rot(v); return v; });
      flow();
      if (bulbs.every((b) => lit.has(b))) { tiles = tiles.map((m, i) => (i === src ? m : rot(m))); flow(); }
    };
    const flow = () => {
      lit = new Set([src]); const q = [src];
      while (q.length) {
        const c = q.shift()!, x = c % N, y = Math.floor(c / N);
        for (const [dx, dy, a, b] of [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]] as const) {
          const nx = x + dx, ny = y + dy, n = ny * N + nx;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N || lit.has(n)) continue;
          if (tiles[c] & a && tiles[n] & b) { lit.add(n); q.push(n); }
        }
      }
    };
    deal();
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; msgT -= dt; flash = Math.max(0, flash - dt); return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#1C1408'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(245,184,61,0.07)'; g.lineWidth = 1; for (let i = 0; i < w; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
        const G = geo();
        for (let i = 0; i < N * N; i++) {
          const x = G.ox + (i % N) * G.cs, y = G.oy + Math.floor(i / N) * G.cs, cx = x + G.cs / 2, cy = y + G.cs / 2, on = lit.has(i);
          g.fillStyle = '#2E2414'; g.beginPath(); g.roundRect(x + 3, y + 3, G.cs - 6, G.cs - 6, 10); g.fill();
          g.strokeStyle = on ? '#FFD84D' : '#6A5A3A'; g.lineWidth = G.cs * 0.16; g.lineCap = 'round';
          if (on) { g.shadowColor = '#FFD84D'; g.shadowBlur = 10 + flash * 30; }
          for (const [b, dx, dy] of [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]] as const) if (tiles[i] & b) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (dx * G.cs) / 2, cy + (dy * G.cs) / 2); g.stroke(); }
          g.shadowBlur = 0; g.fillStyle = on ? '#FFD84D' : '#6A5A3A'; g.beginPath(); g.arc(cx, cy, G.cs * 0.1, 0, Math.PI * 2); g.fill();
          if (i === src) emoji(g, '🔋', cx, cy, G.cs * 0.5);
          else if (bulbs.includes(i)) { if (on) { g.fillStyle = 'rgba(255,230,120,0.35)'; g.beginPath(); g.arc(cx, cy, G.cs * 0.38, 0, Math.PI * 2); g.fill(); } emoji(g, on ? '💡' : '⚪', cx, cy, G.cs * 0.42); }
        }
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFD84D'; g.font = '900 24px ui-rounded'; g.textAlign = 'center'; g.fillText(msg, w / 2, h - 24); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60, 160); pops(pp, g, 1 / 60, 20);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFD84D', `💡 ${bulbs.filter((b) => lit.has(b)).length}/${bulbs.length}`);
        intro(g, w, h, t, ['Circuit Connect', 'Tap a tile to turn it.', 'Run power from the 🔋 battery', 'until every bulb lights up 💡']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const G = geo(), cx = Math.floor((p.x - G.ox) / G.cs), cy = Math.floor((p.y - G.oy) / G.cs);
        if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
        const i = cy * N + cx; tiles[i] = rot(tiles[i]); turns++; sfx.tick();
        const before = bulbs.filter((b) => lit.has(b)).length; flow(); const after = bulbs.filter((b) => lit.has(b)).length;
        if (after > before) { sfx.blip(after * 2); score += (after - before) * 5; }
        if (bulbs.every((b) => lit.has(b))) {
          const par = N * N, neat = clamp(1 - (turns - par * 0.6) / par, 0, 1), pts = N * N * 6 + Math.round(neat * 60) + Math.floor(level / 2) * 2;
          score += pts; flash = 0.6; msg = neat > 0.6 ? 'Neat wiring!' : 'All lit!'; msgT = 1.3; sfx.jackpot();
          const G2 = geo(); pp.push({ x: W / 2, y: G2.oy - 10, t: `+${pts}`, life: 1.2, c: '#FFD84D' }); burst(sp, W / 2, H / 2, ['#FFD84D', '#fff', '#F5B83D'], 40, 320);
          setTimeout(deal, 450);
        }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔪 Perfect Slice — cut fair pieces
// ======================================================================================================================
// the cake is a circle sampled on a grid; a swipe is a straight cut through the cells, and we compare the pieces' areas
export function PerfectSlice({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const CAKES = [{ e: '🎂', top: '#FFB3D1', side: '#F4D3A0' }, { e: '🍫', top: '#6B3A1E', side: '#9C5A2E' }, { e: '🍓', top: '#FF6F8E', side: '#FFE3D0' }, { e: '🍋', top: '#FFE680', side: '#FFF1C2' }, { e: '🫐', top: '#7C6CFF', side: '#E8DDF5' }];
    let score = 0, time = 60, cake = 0, want = 2, cuts: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [], drag: { a: { x: number; y: number }; b: { x: number; y: number } } | null = null, msg = '', msgT = 0, style = CAKES[0], result: number[] | null = null, resultT = 0, streak = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const C = () => ({ x: W / 2, y: TOP + (H - TOP) * 0.45, R: Math.min(W * 0.38, (H - TOP) * 0.3) });
    const deal = () => { cake++; cuts = []; result = null; want = cake < 3 ? 2 : cake < 6 ? (r() < 0.5 ? 3 : 4) : [3, 4, 4, 6][Math.floor(r() * 4)]; style = CAKES[Math.floor(r() * CAKES.length)]; };
    deal();
    const cutsNeeded = () => (want === 2 ? 1 : want === 3 ? 2 : want === 4 ? 2 : 3);
    // label each sample point by which side of every cut it's on, then group
    const pieces = () => {
      const c = C(), map = new Map<string, number>(), N = 70;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = c.x - c.R + ((i + 0.5) / N) * 2 * c.R, y = c.y - c.R + ((j + 0.5) / N) * 2 * c.R;
        if (Math.hypot(x - c.x, y - c.y) > c.R) continue;
        const key = cuts.map((k) => ((k.b.x - k.a.x) * (y - k.a.y) - (k.b.y - k.a.y) * (x - k.a.x) > 0 ? 1 : 0)).join('');
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      const v = [...map.values()], tot = v.reduce((a, b) => a + b, 0);
      return v.map((n) => n / tot).sort((a, b) => b - a);
    };
    const judge = () => {
      const ps = pieces();
      // count only real slices (ignore crumbs from a cut that barely grazed the edge)
      const real = ps.filter((x) => x > 0.03);
      const target = 1 / want;
      const err = real.length === want ? real.reduce((a, x) => a + Math.abs(x - target), 0) / 2 : 1;
      const fair = clamp(1 - err * 3, 0, 1);
      const pts = Math.round(fair * (40 + want * 15)) + (fair > 0.9 ? 40 : 0) + Math.floor(level / 3);
      score += pts; result = real; resultT = 1.6;
      if (fair > 0.9) { streak++; msg = streak > 1 ? `PERFECT ×${streak}!` : 'PERFECT!'; sfx.jackpot(); burst(sp, C().x, C().y, ['#FFE14D', '#FF6FA8', '#fff'], 36, 300); }
      else if (fair > 0.6) { streak = 0; msg = 'The guests are happy'; sfx.win(3); }
      else { streak = 0; msg = real.length !== want ? `That's ${real.length} pieces, not ${want}!` : 'Someone got a tiny slice…'; sfx.fail(); }
      msgT = 1.6; pp.push({ x: W / 2, y: C().y - C().R - 20, t: `+${pts}`, life: 1.2, c: '#FF6FA8' });
    };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (result) { resultT -= dt; if (resultT <= 0) deal(); }
        return time <= 0 && !result;
      },
      draw(g, w, h, t) {
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#FFE4EF'); bg.addColorStop(1, '#C9B6FF'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
        const c = C();
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(c.x, c.y + c.R * 0.12, c.R * 1.18, c.R * 1.12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = style.side; g.beginPath(); g.arc(c.x, c.y + 10, c.R, 0, Math.PI * 2); g.fill();
        g.fillStyle = style.top; g.beginPath(); g.arc(c.x, c.y, c.R, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; emoji(g, style.e, c.x + Math.cos(a) * c.R * 0.8, c.y + Math.sin(a) * c.R * 0.8, 16); }
        g.save(); g.beginPath(); g.arc(c.x, c.y, c.R, 0, Math.PI * 2); g.clip();
        for (const k of cuts) { const dx = k.b.x - k.a.x, dy = k.b.y - k.a.y, l = Math.hypot(dx, dy) || 1; g.strokeStyle = '#5A3A22'; g.lineWidth = 4; g.beginPath(); g.moveTo(k.a.x - (dx / l) * 999, k.a.y - (dy / l) * 999); g.lineTo(k.a.x + (dx / l) * 999, k.a.y + (dy / l) * 999); g.stroke(); }
        g.restore();
        if (drag) { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.setLineDash([8, 6]); g.lineWidth = 3; g.beginPath(); g.moveTo(drag.a.x, drag.a.y); g.lineTo(drag.b.x, drag.b.y); g.stroke(); g.setLineDash([]); emoji(g, '🔪', drag.b.x, drag.b.y, 26); }
        // the order card
        g.fillStyle = 'rgba(80,30,60,0.75)'; g.beginPath(); g.roundRect(w / 2 - 130, h - 96, 260, 64, 16); g.fill();
        g.fillStyle = '#fff'; g.font = '900 18px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(`Cut ${want} equal slices`, w / 2, h - 76);
        g.font = '700 13px ui-rounded'; g.fillText(`${'🍰'.repeat(want)}  ·  cuts ${cuts.length}/${cutsNeeded()}`, w / 2, h - 52);
        if (result) {
          g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.roundRect(w / 2 - 140, c.y + c.R + 18, 280, 30, 10); g.fill();
          g.fillStyle = '#5A2A4A'; g.font = '800 13px ui-rounded'; g.fillText(result.map((x) => `${Math.round(x * 100)}%`).join('  ·  '), w / 2, c.y + c.R + 33);
        }
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#B0306A'; g.font = '900 24px ui-rounded'; g.fillText(msg, w / 2, TOP + 26); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60, 22);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF6FA8', `🎂 ${cake}${streak > 1 ? ` · 🔥${streak}` : ''}`);
        intro(g, w, h, t, ['Perfect Slice', 'Swipe right across the cake to cut it.', 'Make the slices as even as you can —', 'halves, then thirds, quarters and more.']);
      },
      down(p: Ptr) { if (!result && time > 0) drag = { a: { x: p.x, y: p.y }, b: { x: p.x, y: p.y } }; },
      move(p: Ptr) { if (drag) drag.b = { x: p.x, y: p.y }; },
      up() {
        if (!drag) return; const d = drag; drag = null;
        if (Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) < 40) return;
        // the line must actually pass through the cake
        const c = C(), dx = d.b.x - d.a.x, dy = d.b.y - d.a.y, l = Math.hypot(dx, dy), dist = Math.abs(dx * (c.y - d.a.y) - dy * (c.x - d.a.x)) / l;
        if (dist > c.R * 0.95) return;
        cuts.push(d); sfx.swish();
        if (cuts.length >= cutsNeeded()) judge();
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// ✨ Rune Duel — draw the rune on each monster
// ======================================================================================================================
type Rune = '—' | '|' | 'V' | 'Λ' | 'O' | 'Z';
const RUNES: Rune[] = ['—', '|', 'V', 'Λ', 'O', 'Z'];
/** classify a stroke into one of the runes, or null */
function readRune(pts: { x: number; y: number }[]): Rune | null {
  if (pts.length < 4) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), size = Math.max(w, h);
  if (size < 30) return null;
  const a = pts[0], b = pts[pts.length - 1], closed = Math.hypot(a.x - b.x, a.y - b.y) < size * 0.35;
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && len > size * 2.2) return 'O';
  // how many times the horizontal direction flips (zigzags flip a lot)
  let flips = 0, lastDx = 0; for (let i = 3; i < pts.length; i += 3) { const dx = pts[i].x - pts[i - 3].x; if (Math.abs(dx) > 4) { if (lastDx && Math.sign(dx) !== Math.sign(lastDx)) flips++; lastDx = dx; } }
  if (flips >= 2 && w > size * 0.5) return 'Z';
  const straight = len < Math.hypot(a.x - b.x, a.y - b.y) * 1.25;
  if (straight) return w > h ? '—' : '|';
  // V or Λ: the middle of the stroke is the lowest / highest point and both ends are level
  const mid = pts.reduce((m, p) => (p.y > m.y ? p : m), pts[0]), top = pts.reduce((m, p) => (p.y < m.y ? p : m), pts[0]);
  if (mid.y - Math.max(a.y, b.y) > h * 0.5) return 'V';
  if (Math.min(a.y, b.y) - top.y > h * 0.5) return 'Λ';
  return null;
}
export function RuneDuel({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    type M = { x: number; y: number; e: string; runes: Rune[]; speed: number; hit: number; boss?: boolean };
    let score = 0, time = 60, hp = 3, mobs: M[] = [], spawnT = 0.5, stroke: { x: number; y: number }[] = [], drawing = false, combo = 0, msg = '', msgT = 0, wave = 0, cast = '';
    const pp: Pop[] = [], sp: Spark[] = [];
    const throneY = () => H - 70;
    const spawn = () => {
      wave++; const boss = wave % 9 === 0, n = boss ? 3 + Math.min(2, Math.floor(wave / 18)) : r() < Math.min(0.45, wave / 30) ? 2 : 1;
      const pool: Rune[] = RUNES.slice(0, Math.min(6, 3 + Math.floor(wave / 4)));
      mobs.push({ x: 40 + r() * (W - 80), y: TOP + 30, e: boss ? '🐲' : ['👻', '💀', '🦇', '👹', '🕷️', '🧟'][Math.floor(r() * 6)], runes: Array.from({ length: n }, () => pool[Math.floor(r() * pool.length)]), speed: (boss ? 22 : 36 + Math.min(40, wave * 1.4)) * (H / 700), hit: 0, boss });
    };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; spawnT -= dt;
        if (spawnT <= 0) { spawn(); spawnT = Math.max(0.9, 2.4 - wave * 0.05); }
        for (const m of mobs) { m.y += m.speed * dt; m.hit = Math.max(0, m.hit - dt); }
        for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].y > throneY() - 30) { mobs.splice(i, 1); hp--; combo = 0; sfx.bonk(); burst(sp, W / 2, throneY(), ['#7A2CFF', '#FF2E88'], 20, 240); pp.push({ x: W / 2, y: throneY() - 40, t: '💔', life: 1, c: '#FF5A5F' }); }
        return time <= 0 || hp <= 0;
      },
      draw(g, w, h, t) {
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0A0218'); bg.addColorStop(1, '#2A0A40'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(122,44,255,0.15)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w / 2, h + 40, 80 + i * 70 + Math.sin(t * 2 + i) * 6, Math.PI, 0); g.fill(); }
        // the throne
        emoji(g, '🪑', w / 2, throneY(), 40); emoji(g, '👁️', w / 2, throneY() - 30 + Math.sin(t * 2) * 3, 28);
        g.strokeStyle = 'rgba(255,46,136,0.35)'; g.setLineDash([6, 8]); g.beginPath(); g.moveTo(0, throneY() - 30); g.lineTo(w, throneY() - 30); g.stroke(); g.setLineDash([]);
        for (const m of mobs) {
          const s = m.boss ? 56 : 40;
          if (m.hit > 0) g.globalAlpha = 0.5; emoji(g, m.e, m.x + Math.sin(t * 3 + m.y * 0.05) * 6, m.y, s); g.globalAlpha = 1;
          const rw = m.runes.length * 26 + 10;
          g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.roundRect(m.x - rw / 2, m.y - s / 2 - 34, rw, 26, 9); g.fill();
          m.runes.forEach((ru, i) => { g.fillStyle = i === 0 ? '#FFE14D' : 'rgba(255,255,255,0.55)'; g.font = `900 ${i === 0 ? 18 : 15}px ui-rounded`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ru, m.x - rw / 2 + 18 + i * 26, m.y - s / 2 - 21); });
        }
        if (stroke.length > 1) { g.strokeStyle = '#E3B8FF'; g.shadowColor = '#B36BFF'; g.shadowBlur = 18; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); stroke.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.shadowBlur = 0; }
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#E3B8FF'; g.font = '900 22px ui-rounded'; g.textAlign = 'center'; g.fillText(msg, w / 2, h * 0.55); g.globalAlpha = 1; }
        // the rune legend along the bottom
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = '800 12px ui-rounded'; g.textAlign = 'left'; g.fillText(cast ? `cast: ${cast}` : 'runes:  —  |  V  Λ  O  Z', 14, h - 18);
        sparks(sp, g, 1 / 60, 0); pops(pp, g, 1 / 60, 20);
        hud(g, w, score, `${hearts(hp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#E3B8FF', combo > 1 ? `✨ ×${combo}` : '');
        intro(g, w, h, t, ['Rune Duel', 'Draw the yellow rune over a monster:', '— line  | line  V  Λ  O circle  Z zigzag', 'Draw anywhere — it hits the nearest match.']);
      },
      down(p: Ptr) { drawing = true; stroke = [{ x: p.x, y: p.y }]; },
      move(p: Ptr) { if (drawing) stroke.push({ x: p.x, y: p.y }); },
      up() {
        if (!drawing) return; drawing = false;
        const ru = readRune(stroke); const pts = stroke; stroke = [];
        cast = ru ?? '?';
        if (!ru) { msg = 'The rune fizzled'; msgT = 0.6; return; }
        // hit the lowest (most dangerous) monster whose next rune matches
        const target = mobs.filter((m) => m.runes[0] === ru).sort((a, b) => b.y - a.y)[0];
        if (!target) { combo = 0; msg = `No monster needs ${ru} right now`; msgT = 0.6; sfx.bonk(); return; }
        target.runes.shift(); target.hit = 0.15; target.y -= 14;
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        burst(sp, target.x, target.y, ['#E3B8FF', '#7A2CFF', '#fff'], 10, 160); void cx; void cy;
        if (!target.runes.length) {
          mobs.splice(mobs.indexOf(target), 1); combo++;
          const pts2 = (target.boss ? 120 : 25) + combo * 5 + Math.floor(level / 2) * 2; score += pts2;
          pp.push({ x: target.x, y: target.y - 20, t: `+${pts2}`, life: 1, c: target.boss ? '#FFE14D' : '#E3B8FF' }); burst(sp, target.x, target.y, ['#FFE14D', '#E3B8FF'], 24, 260);
          sfx.perfect(Math.min(combo, 12)); if (target.boss) { msg = 'The dragon falls!'; msgT = 1.3; sfx.jackpot(); }
        } else sfx.blip(4);
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔥 Elemental Clash — fire > leaf > water > fire, read the titan's tell
// ======================================================================================================================
const EL = [{ id: 'fire', e: '🔥', c: '#FF5A1F' }, { id: 'water', e: '💧', c: '#3FA7FF' }, { id: 'leaf', e: '🍃', c: '#3DDC97' }] as const;
const BEATS = [2, 0, 1]; // fire beats leaf (2), water beats fire (0), leaf beats water (1)
export function ElementalClash({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, titanHp = 5, titans = 0, myHp = 3, chain = 0, next = 0, tell = 0, window_ = 2.4, wT = 0, phase: 'tell' | 'show' = 'tell', showT = 0, mine = -1, theirs = 0, outcome = 0, msg = '', msgT = 0, shake = 0, fake = false;
    const pp: Pop[] = [], sp: Spark[] = [];
    const TITANS = ['🗿', '🦁', '🐲', '🌩️', '👑'];
    const newRound = () => { next = Math.floor(r() * 3); fake = titans >= 1 && r() < Math.min(0.35, titans * 0.1); tell = fake ? (next + 1 + Math.floor(r() * 2)) % 3 : next; window_ = Math.max(1.1, 2.4 - titans * 0.25 - chain * 0.03); wT = window_; phase = 'tell'; mine = -1; };
    newRound();
    const resolve = (pick: number) => {
      mine = pick; theirs = next; phase = 'show'; showT = 1;
      if (pick === -1) outcome = -1; else outcome = pick === theirs ? 0 : BEATS[pick] === theirs ? 1 : -1;
      if (outcome === 1) {
        chain++; titanHp--; const pts = 30 + chain * 6 + Math.round((wT / window_) * 20) + Math.floor(level / 2) * 2; score += pts;
        pp.push({ x: W / 2, y: H * 0.3, t: `+${pts}`, life: 1, c: '#FFE14D' }); burst(sp, W / 2, H * 0.32, [EL[pick].c, '#fff', '#FFB020'], 24, 280); sfx.perfect(Math.min(chain, 12)); shake = 0.3;
        if (titanHp <= 0) { titans++; const b = 150 + titans * 50; score += b; msg = `Titan toppled! +${b}`; msgT = 1.6; sfx.jackpot(); titanHp = 5 + titans; burst(sp, W / 2, H * 0.3, ['#FFB020', '#FFE14D', '#fff'], 60, 380); }
      } else if (outcome === 0) { msg = 'Stalemate'; msgT = 0.8; sfx.tick(); }
      else { chain = 0; myHp--; msg = pick === -1 ? 'Too slow!' : `${EL[theirs].e} beats ${EL[pick].e}`; msgT = 1; sfx.fail(); shake = 0.4; }
    };
    const btns = () => { const bw = (W - 50) / 3; return EL.map((_, i) => ({ x: 15 + i * (bw + 10), y: H - 120, w: bw, h: 92 })); };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; shake = Math.max(0, shake - dt);
        if (phase === 'tell') { wT -= dt; if (wT <= 0) resolve(-1); }
        else { showT -= dt; if (showT <= 0 && myHp > 0) newRound(); }
        return time <= 0 || myHp <= 0;
      },
      draw(g, w, h, t) {
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2A1A06'); bg.addColorStop(1, '#0E0A1C'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.save(); if (shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
        // the titan and its health
        const tx = w / 2, ty = TOP + (h - TOP) * 0.28;
        g.fillStyle = 'rgba(255,176,32,0.15)'; g.beginPath(); g.arc(tx, ty, 90 + Math.sin(t * 2) * 6, 0, Math.PI * 2); g.fill();
        emoji(g, TITANS[titans % TITANS.length], tx, ty, 96);
        const maxHp = 5 + titans; g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(tx - 90, ty + 62, 180, 12, 6); g.fill(); g.fillStyle = '#FFB020'; g.beginPath(); g.roundRect(tx - 90, ty + 62, 180 * (titanHp / maxHp), 12, 6); g.fill();
        // the tell: the element the titan is charging (sometimes a feint, shown flickering)
        if (phase === 'tell') {
          const flick = fake && Math.floor(t * 9) % 4 === 0;
          g.globalAlpha = 0.85; emoji(g, flick ? EL[next].e : EL[tell].e, tx + 70, ty - 50, 40); g.globalAlpha = 1;
          g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '800 12px ui-rounded'; g.textAlign = 'center'; g.fillText(fake ? 'charging… (watch it flicker!)' : 'charging…', tx + 70, ty - 18);
          g.fillStyle = '#FFB020'; g.fillRect(tx - 90, ty + 80, 180 * (wT / window_), 5);
        } else {
          emoji(g, EL[theirs].e, tx + 40, ty + 120, 50); if (mine >= 0) emoji(g, EL[mine].e, tx - 40, ty + 120, 50);
          g.fillStyle = outcome === 1 ? '#3DDC97' : outcome === 0 ? '#FFE14D' : '#FF5A5F'; g.font = '900 18px ui-rounded'; g.textAlign = 'center'; g.fillText(outcome === 1 ? 'WIN' : outcome === 0 ? 'DRAW' : 'LOSE', tx, ty + 170);
        }
        g.restore();
        btns().forEach((b, i) => button(g, b.x, b.y, b.w, b.h, EL[i].c, EL[i].e, { font: '40px system-ui', down: mine === i }));
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '800 12px ui-rounded'; g.textAlign = 'center'; g.fillText('🔥 beats 🍃 · 🍃 beats 💧 · 💧 beats 🔥', w / 2, h - 14);
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFE14D'; g.font = '900 22px ui-rounded'; g.fillText(msg, w / 2, h - 146); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60, 200); pops(pp, g, 1 / 60, 22);
        hud(g, w, score, `${hearts(myHp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB020', `${chain > 1 ? `⚡×${chain} · ` : ''}🗿 ${titans}`);
        intro(g, w, h, t, ['Elemental Clash', 'The titan shows what it’s charging.', 'Tap the element that beats it, fast!', 'Later titans feint — watch for a flicker.']);
      },
      down(p: Ptr) { if (phase !== 'tell' || time <= 0) return; const i = btns().findIndex((b) => inBox(p, b)); if (i >= 0) resolve(i); },
      key(k, d) { if (!d || phase !== 'tell') return; const i = ['1', '2', '3'].indexOf(k); if (i >= 0) resolve(i); },
    };
  }, onEnd, onScore);
}
