// Estate stand games, part 4 — the Dragon Citadel and the Grand Colosseum.
//   🏃 Trap Run       tap to jump the spikes, swipe down to slide under the blades
//   🕯️ Torch Maze     find the exit of a dark maze before your torch burns out
//   🧪 Potion Mix     drip red, yellow and blue to match the colour of the potion
//   🏹 Arrow Volley   loose arrows at the goblins — lead your shots, they take time to land
//   🛡️ Parry          block each strike by swiping toward it as it lands
//   🐎 Chariot Race   switch lanes to dodge and grab laurels
//   🙌 Crowd Wave     tap each stand exactly as the wave reaches it
//   🪖 Shield Wall    raise the shields under falling spears — but shields tire
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, useGame, type GameProps, type Ptr } from '../games';
import { INTRO, TOP, burst, button, clamp, hearts, hud, inBox, intro, pops, sparks, type Pop, type Spark } from './kit';

const msgDraw = (g: CanvasRenderingContext2D, w: number, y: number, msg: string, t: number, c = '#FFE14D') => { if (t <= 0) return; g.globalAlpha = Math.min(1, t); g.fillStyle = c; g.font = '900 22px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeText(msg, w / 2, y); g.fillText(msg, w / 2, y); g.globalAlpha = 1; };

// ======================================================================================================================
// 🏃 Trap Run
// ======================================================================================================================
export function TrapRun({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, y = 0, vy = 0, slide = 0, hp = 3, inv = 0, dist = 0, nextAt = 400, coins = 0, start: { x: number; y: number } | null = null;
    const traps: { x: number; k: 'spike' | 'blade' | 'coin' }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const GY = () => TOP + (H - TOP) * 0.6, PX = () => W * 0.24;
    const jump = () => { if (y === 0 && slide <= 0) { vy = 620; sfx.swish(); } };
    const duck = () => { if (y === 0) { slide = 0.6; sfx.swish(); } else vy = -900; };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; inv = Math.max(0, inv - dt); slide = Math.max(0, slide - dt);
        const speed = Math.min(520, 260 + dist / 25); dist += speed * dt; score += speed * dt * 0.02;
        vy -= 1700 * dt; y = Math.max(0, y + vy * dt); if (y === 0) vy = 0;
        for (const tr of traps) tr.x -= speed * dt;
        if (dist > nextAt) { const roll = r(); traps.push({ x: W + 40, k: roll < 0.42 ? 'spike' : roll < 0.78 ? 'blade' : 'coin' }); nextAt = dist + 260 + r() * 260 - Math.min(120, dist / 60); }
        for (let i = traps.length - 1; i >= 0; i--) {
          const tr = traps[i];
          if (Math.abs(tr.x - PX()) < 24) {
            if (tr.k === 'coin') { if (y > 40 || slide <= 0) { traps.splice(i, 1); coins++; score += 10 + Math.floor(level / 3); sfx.coin(); pp.push({ x: PX(), y: GY() - 80, t: '+10', life: 0.6, c: '#FFE14D' }); } continue; }
            const hit = tr.k === 'spike' ? y < 30 : slide <= 0 && y < 90;
            if (hit && inv <= 0) { hp--; inv = 1.2; sfx.bonk(); burst(sp, PX(), GY() - 30, ['#FF5A5F', '#fff'], 14, 200); }
          }
          if (tr.x < -60) traps.splice(i, 1);
        }
        return time <= 0 || hp <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#24202A'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) { const x = ((i * 140 - dist * 0.4) % (w + 140) + w + 140) % (w + 140) - 70; g.fillStyle = '#3A3240'; g.fillRect(x, TOP + 20, 50, GY() - TOP - 40); emoji(g, '🔥', x + 25, TOP + 60, 22); }
        g.fillStyle = '#5A5060'; g.fillRect(0, GY(), w, h - GY());
        for (const tr of traps) {
          if (tr.k === 'spike') { g.fillStyle = '#C0C4CC'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(tr.x - 18 + k * 12, GY()); g.lineTo(tr.x - 12 + k * 12, GY() - 26); g.lineTo(tr.x - 6 + k * 12, GY()); g.fill(); } }
          else if (tr.k === 'blade') { g.strokeStyle = '#888'; g.lineWidth = 2; g.beginPath(); g.moveTo(tr.x, TOP); g.lineTo(tr.x, GY() - 70); g.stroke(); g.save(); g.translate(tr.x, GY() - 70); g.rotate(t * 10); g.fillStyle = '#D0D4DC'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? 12 : 26; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.restore(); }
          else emoji(g, '🪙', tr.x, GY() - 60, 26);
        }
        g.save(); g.translate(PX(), GY() - y); if (inv > 0 && Math.floor(t * 12) % 2) g.globalAlpha = 0.4; if (slide > 0) { g.rotate(-Math.PI / 2); emoji(g, '🏃', -14, 0, 38); } else emoji(g, '🏃', 0, -22 + (y === 0 ? Math.abs(Math.sin(t * 14)) * -3 : 0), 40); g.restore();
        button(g, 20, h - 90, w / 2 - 30, 70, '#3DDC97', '⬆ JUMP'); button(g, w / 2 + 10, h - 90, w / 2 - 30, 70, '#22B8FF', '⬇ SLIDE');
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(hp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#A855F7', `${Math.round(dist / 10)} m · 🪙 ${coins}`);
        intro(g, w, h, t, ['Trap Run', 'JUMP over the floor spikes,', 'SLIDE under the swinging blades.', '(or swipe up / down)']);
      },
      down(p: Ptr) { start = { x: p.x, y: p.y }; },
      up(p: Ptr) { if (!start || time <= 0) return; const dy = p.y - start.y; if (Math.abs(dy) > 30) { if (dy < 0) jump(); else duck(); } else if (p.y > H - 100) { if (p.x < W / 2) jump(); else duck(); } else jump(); start = null; },
      key(k, d) { if (!d) return; if (k === 'ArrowUp' || k === ' ') jump(); if (k === 'ArrowDown') duck(); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🕯️ Torch Maze
// ======================================================================================================================
export function TorchMaze({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, N = 7, walls: { e: boolean; s: boolean }[] = [], px = 0, py = 0, ex = 0, ey = 0, torch = 1, mazes = 0, seen = new Set<number>(), keys: Set<number> = new Set(), got = 0, msg = '', msgT = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const geo = () => { const cs = Math.min((W - 20) / N, (H - TOP - 140) / N); return { cs, ox: (W - cs * N) / 2, oy: TOP + 20 }; };
    const build = () => {
      mazes++; N = Math.min(11, 6 + mazes); torch = 1; seen = new Set(); got = 0;
      walls = Array.from({ length: N * N }, () => ({ e: true, s: true }));
      const vis = new Set([0]), st = [0];
      while (st.length) { const c = st[st.length - 1], x = c % N, y = Math.floor(c / N); const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !vis.has(b * N + a)); if (!nb.length) { st.pop(); continue; } const [a, b, dx, dy] = nb[Math.floor(r() * nb.length)], n = b * N + a; if (dx === 1) walls[c].e = false; if (dx === -1) walls[n].e = false; if (dy === 1) walls[c].s = false; if (dy === -1) walls[n].s = false; vis.add(n); st.push(n); }
      px = 0; py = 0; ex = N - 1; ey = N - 1; keys = new Set(); while (keys.size < Math.min(4, 1 + Math.floor(mazes / 2))) keys.add(1 + Math.floor(r() * (N * N - 2)));
    };
    build();
    const canGo = (x: number, y: number, dx: number, dy: number) => { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) return false; if (dx === 1) return !walls[y * N + x].e; if (dx === -1) return !walls[ny * N + nx].e; if (dy === 1) return !walls[y * N + x].s; return !walls[ny * N + nx].s; };
    const step = (dx: number, dy: number) => {
      if (time <= 0 || !canGo(px, py, dx, dy)) { sfx.bonk(); return; }
      px += dx; py += dy; torch = Math.max(0, torch - 0.012); sfx.tick();
      const i = py * N + px; if (keys.has(i)) { keys.delete(i); got++; torch = Math.min(1, torch + 0.25); score += 10; sfx.coin(); pp.push({ x: W / 2, y: TOP + 40, t: '🕯️ +10, torch refilled', life: 0.9, c: '#FFB020' }); }
      if (px === ex && py === ey) { const pts = 30 + N * 4 + Math.round(torch * 30) + Math.floor(level / 2) * 2; score += pts; msg = `Escaped! +${pts}`; msgT = 1.2; sfx.jackpot(); build(); }
    };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; msgT -= dt; torch -= dt * 0.012; if (torch <= 0) { msg = 'Your torch went out…'; msgT = 1.2; sfx.fail(); score = Math.max(0, score - 15); build(); } return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#0A0812'; g.fillRect(0, 0, w, h);
        const G = geo(), light = 1.2 + torch * 2.2;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x - px, y - py); if (d <= light) seen.add(y * N + x); }
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const i = y * N + x, d = Math.hypot(x - px, y - py); if (!seen.has(i)) continue;
          const a = d <= light ? 1 - d / (light + 1) * 0.6 : 0.18;
          const X = G.ox + x * G.cs, Y = G.oy + y * G.cs; g.globalAlpha = a; g.fillStyle = '#3A3240'; g.fillRect(X, Y, G.cs, G.cs);
          g.strokeStyle = '#8A7A90'; g.lineWidth = 3; g.beginPath(); if (walls[i].e) { g.moveTo(X + G.cs, Y); g.lineTo(X + G.cs, Y + G.cs); } if (walls[i].s) { g.moveTo(X, Y + G.cs); g.lineTo(X + G.cs, Y + G.cs); } if (x === 0) { g.moveTo(X, Y); g.lineTo(X, Y + G.cs); } if (y === 0) { g.moveTo(X, Y); g.lineTo(X + G.cs, Y); } g.stroke();
          if (keys.has(i) && d <= light) emoji(g, '🕯️', X + G.cs / 2, Y + G.cs / 2, G.cs * 0.55);
          if (x === ex && y === ey) emoji(g, '🚪', X + G.cs / 2, Y + G.cs / 2, G.cs * 0.6);
          g.globalAlpha = 1;
        }
        emoji(g, '🧙', G.ox + (px + 0.5) * G.cs, G.oy + (py + 0.5) * G.cs, G.cs * 0.7);
        // d-pad
        const bx = w / 2, by = h - 70, s = 48;
        button(g, bx - s / 2, by - s - 26, s, s, '#ffffff22', '▲'); button(g, bx - s / 2, by - 6, s, s, '#ffffff22', '▼'); button(g, bx - s * 1.6, by - 30, s, s, '#ffffff22', '◀'); button(g, bx + s * 0.6, by - 30, s, s, '#ffffff22', '▶');
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(16, h - 30, 100, 8); g.fillStyle = '#FFB020'; g.fillRect(16, h - 30, 100 * torch, 8);
        msgDraw(g, w, TOP + 30, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB020', `🚪 ${mazes - 1}`);
        intro(g, w, h, t, ['Torch Maze', 'Swipe or use the arrows to walk.', 'Find the door 🚪 before your torch burns out.', 'Candles 🕯️ top up your torch.']);
      },
      down(p: Ptr) {
        const bx = W / 2, by = H - 70, s = 48;
        if (inBox(p, { x: bx - s / 2, y: by - s - 26, w: s, h: s })) step(0, -1); else if (inBox(p, { x: bx - s / 2, y: by - 6, w: s, h: s })) step(0, 1); else if (inBox(p, { x: bx - s * 1.6, y: by - 30, w: s, h: s })) step(-1, 0); else if (inBox(p, { x: bx + s * 0.6, y: by - 30, w: s, h: s })) step(1, 0);
        else { const G = geo(), dx = p.x - (G.ox + (px + 0.5) * G.cs), dy = p.y - (G.oy + (py + 0.5) * G.cs); if (Math.abs(dx) > Math.abs(dy)) step(Math.sign(dx), 0); else step(0, Math.sign(dy)); }
      },
      key(k, d) { if (!d) return; if (k === 'ArrowUp') step(0, -1); if (k === 'ArrowDown') step(0, 1); if (k === 'ArrowLeft') step(-1, 0); if (k === 'ArrowRight') step(1, 0); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🧪 Potion Mix
// ======================================================================================================================
export function PotionMix({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 55, want = [0, 0, 0], have = [0, 0, 0], brewed = 0, msg = '', msgT = 0, bubble = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => { const n = Math.min(6, 2 + Math.floor(brewed / 2)); want = [0, 0, 0]; for (let i = 0; i < n; i++) want[Math.floor(r() * 3)]++; if (want.filter(Boolean).length < 2) want[(want.indexOf(Math.max(...want)) + 1) % 3]++; have = [0, 0, 0]; };
    deal();
    // mix red/yellow/blue drops into a colour
    const mix = (v: number[]) => { const t = v[0] + v[1] + v[2]; if (!t) return 'rgb(220,220,230)'; const R = [230, 40, 30], Y = [250, 210, 40], B = [40, 90, 230]; const c = [0, 1, 2].map((k) => (R[k] * v[0] + Y[k] * v[1] + B[k] * v[2]) / t); if (v[0] && v[2]) { c[0] *= 0.85; c[1] *= 0.6; } if (v[1] && v[2]) { c[0] *= 0.6; c[2] *= 0.55; } return `rgb(${c.map(Math.round).join(',')})`; };
    const btns = () => [0, 1, 2].map((i) => ({ x: 15 + i * ((W - 30) / 3), y: H - 150, w: (W - 30) / 3 - 8, h: 70 }));
    const ctrl = () => ({ pour: { x: W / 2 + 4, y: H - 66, w: W / 2 - 19, h: 48 }, dump: { x: 15, y: H - 66, w: W / 2 - 19, h: 48 } });
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; msgT -= dt; bubble += dt; return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#1E1426'; g.fillRect(0, 0, w, h);
        // the potion to match
        const tx = w * 0.27, ty = TOP + 120; g.fillStyle = mix(want); g.beginPath(); g.arc(tx, ty + 20, 46, 0, Math.PI * 2); g.fill(); g.fillStyle = '#C0B8D0'; g.fillRect(tx - 12, ty - 50, 24, 36); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(tx, ty + 20, 46, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#fff'; g.font = '800 13px ui-rounded'; g.textAlign = 'center'; g.fillText('MATCH THIS', tx, ty + 86);
        // your cauldron
        const cx = w * 0.72, cy = TOP + 140; g.fillStyle = '#2A2A30'; g.beginPath(); g.arc(cx, cy, 62, 0, Math.PI); g.fill(); g.fillStyle = mix(have); g.beginPath(); g.ellipse(cx, cy, 58, 16, 0, 0, Math.PI * 2); g.fill();
        for (let k = 0; k < 4; k++) { const a = (bubble * 2 + k) % 1; g.fillStyle = mix(have); g.globalAlpha = 1 - a; g.beginPath(); g.arc(cx - 30 + k * 20, cy - a * 40, 5, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
        g.fillStyle = '#fff'; g.fillText(`drops: ${have[0] + have[1] + have[2]}`, cx, cy + 86);
        g.font = '700 12px ui-rounded'; g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillText('Same colour = same mix of drops (amounts matter!)', w / 2, TOP + 260);
        btns().forEach((b, i) => button(g, b.x, b.y, b.w, b.h, ['#E62E1E', '#FAD228', '#285AE6'][i], ['RED', 'YELLOW', 'BLUE'][i], { text: i === 1 ? '#333' : '#fff' }));
        const C = ctrl(); button(g, C.dump.x, C.dump.y, C.dump.w, C.dump.h, '#ffffff22', '🗑️ dump'); button(g, C.pour.x, C.pour.y, C.pour.w, C.pour.h, '#A855F7', '🧪 BOTTLE IT');
        msgDraw(g, w, TOP + 300, msg, msgT, '#E3B8FF');
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#A855F7', `🧪 ${brewed}`);
        intro(g, w, h, t, ['Potion Mix', 'Add red, yellow and blue drops', 'until your cauldron matches the potion,', 'then BOTTLE IT. Fewer tries = more!']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const i = btns().findIndex((b) => inBox(p, b)); if (i >= 0) { if (have.reduce((a, b) => a + b, 0) < 12) { have[i]++; sfx.blip(3 + i * 3); burst(sp, W * 0.72, TOP + 140, [['#E62E1E', '#FAD228', '#285AE6'][i]], 6, 100); } return; }
        const C = ctrl();
        if (inBox(p, C.dump)) { have = [0, 0, 0]; sfx.swish(); return; }
        if (inBox(p, C.pour)) {
          // the same ratio counts (2:2 matches 1:1)
          const ta = want.reduce((a, b) => a + b, 0), hb = have.reduce((a, b) => a + b, 0);
          const err = hb ? [0, 1, 2].reduce((a, k) => a + Math.abs(want[k] / ta - have[k] / hb), 0) : 2;
          if (err < 0.01) { brewed++; const pts = 20 + ta * 5 + (hb === ta ? 10 : 0) + Math.floor(level / 2) * 2; score += pts; msg = `Potion brewed! +${pts}`; msgT = 1.1; sfx.jackpot(); burst(sp, W * 0.72, TOP + 120, ['#A855F7', '#FFE14D', '#FFFFFF'], 30, 260); deal(); }
          else if (err < 0.3) { score += 5; msg = 'Close… but not quite'; msgT = 1; sfx.bonk(); have = [0, 0, 0]; }
          else { score = Math.max(0, score - 3); msg = 'That’s a different potion!'; msgT = 1; sfx.fail(); have = [0, 0, 0]; }
        }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🏹 Arrow Volley
// ======================================================================================================================
export function ArrowVolley({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, hp = 5, spawnT = 0.5, kills = 0, reload = 0;
    const gobs: { x: number; y: number; v: number; hp: number; big: boolean }[] = [];
    const arrows: { x0: number; y0: number; x1: number; y1: number; t: number; T: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const WALL = () => H - 130, BOW = () => ({ x: W / 2, y: H - 80 });
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; spawnT -= dt; reload -= dt;
        if (spawnT <= 0) { const big = r() < 0.15; gobs.push({ x: 30 + r() * (W - 60), y: TOP + 10, v: (big ? 28 : 45 + r() * 30) * (1 + (45 - time) / 60), hp: big ? 3 : 1, big }); spawnT = Math.max(0.5, 1.3 - (45 - time) / 50); }
        for (const g of gobs) { g.y += g.v * dt; g.x += Math.sin(t * 2 + g.y * 0.05) * 30 * dt; }
        for (let i = gobs.length - 1; i >= 0; i--) if (gobs[i].y > WALL()) { gobs.splice(i, 1); hp--; sfx.bonk(); pp.push({ x: W / 2, y: WALL() - 20, t: 'the wall shakes!', life: 0.8, c: '#FF5A5F' }); }
        for (let i = arrows.length - 1; i >= 0; i--) {
          const a = arrows[i]; a.t += dt;
          if (a.t >= a.T) {
            arrows.splice(i, 1);
            const hit = gobs.find((g) => Math.hypot(g.x - a.x1, g.y - a.y1) < (g.big ? 34 : 24));
            if (hit) { hit.hp--; burst(sp, a.x1, a.y1, ['#A855F7', '#3DDC97'], 10, 160); if (hit.hp <= 0) { gobs.splice(gobs.indexOf(hit), 1); kills++; const pts = (hit.big ? 30 : 10) + Math.floor(level / 3); score += pts; sfx.perfect(Math.min(12, kills % 12)); pp.push({ x: a.x1, y: a.y1 - 20, t: `+${pts}`, life: 0.7, c: '#3DDC97' }); } else sfx.thud(); }
            else { sp.push({ x: a.x1, y: a.y1, vx: 0, vy: -40, life: 0.3, c: '#C9A06A', s: 3 }); }
          }
        }
        return time <= 0 || hp <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#5E7A3A'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 40; i++) g.fillRect((i * 79) % w, (i * 53) % h, 4, 4);
        for (const gb of gobs) { emoji(g, gb.big ? '👹' : '👺', gb.x, gb.y, gb.big ? 46 : 32); if (gb.big) { g.fillStyle = '#FF5A5F'; for (let k = 0; k < gb.hp; k++) g.fillRect(gb.x - 15 + k * 11, gb.y - 32, 9, 4); } }
        for (const a of arrows) { const k = a.t / a.T, x = a.x0 + (a.x1 - a.x0) * k, y = a.y0 + (a.y1 - a.y0) * k - Math.sin(k * Math.PI) * 60; g.save(); g.translate(x, y); g.rotate(Math.atan2(a.y1 - a.y0 - Math.cos(k * Math.PI) * 60 * Math.PI, a.x1 - a.x0)); g.fillStyle = '#5A3A20'; g.fillRect(-14, -1.5, 26, 3); g.fillStyle = '#C0C4CC'; g.beginPath(); g.moveTo(12, -4); g.lineTo(20, 0); g.lineTo(12, 4); g.fill(); g.restore(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(a.x1, a.y1, 10, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = '#6A6070'; g.fillRect(0, WALL(), w, 36); for (let x = 0; x < w; x += 40) g.fillRect(x, WALL() - 14, 24, 14);
        emoji(g, '🏹', BOW().x, BOW().y, 40);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${'🧱'.repeat(Math.max(0, hp))} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#3DDC97', `👺 ${kills}`);
        intro(g, w, h, t, ['Arrow Volley', 'Tap where you want an arrow to land.', 'Arrows take a moment to fly —', 'aim a little ahead of the goblins!']);
      },
      down(p: Ptr) { if (time <= 0 || reload > 0 || p.y > WALL()) return; const b = BOW(), d = Math.hypot(p.x - b.x, p.y - b.y); arrows.push({ x0: b.x, y0: b.y - 20, x1: p.x, y1: p.y, t: 0, T: 0.25 + d / 700 }); reload = 0.28; sfx.swish(); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🛡️ Parry
// ======================================================================================================================
const PDIR = [{ dx: 0, dy: -1, a: '↑' }, { dx: 1, dy: 0, a: '→' }, { dx: 0, dy: 1, a: '↓' }, { dx: -1, dy: 0, a: '←' }];
export function Parry({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, hp = 3, spawnT = 0.6, combo = 0, guard = -1, guardT = 0, start: { x: number; y: number } | null = null, blocks = 0;
    const strikes: { d: number; p: number; v: number; e: string }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const C = () => ({ x: W / 2, y: TOP + (H - TOP) * 0.45, R: Math.min(W, H - TOP) * 0.42 });
    const parry = (d: number) => { guard = d; guardT = 0.25; const s = strikes.filter((x) => x.d === d && x.p > 0.72).sort((a, b) => b.p - a.p)[0]; if (s) { strikes.splice(strikes.indexOf(s), 1); combo++; blocks++; const perfect = s.p > 0.86, pts = (perfect ? 12 : 7) + Math.min(12, combo) + Math.floor(level / 3); score += pts; sfx[perfect ? 'perfect' : 'blip'](Math.min(12, combo)); const c = C(); burst(sp, c.x + PDIR[d].dx * 50, c.y + PDIR[d].dy * 50, ['#FFE14D', '#FFFFFF'], 12, 200); pp.push({ x: c.x + PDIR[d].dx * 70, y: c.y + PDIR[d].dy * 70, t: perfect ? 'PARRY!' : `+${pts}`, life: 0.6, c: '#FFE14D' }); } else sfx.swish(); };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; spawnT -= dt; guardT -= dt;
        if (spawnT <= 0) { strikes.push({ d: Math.floor(r() * 4), p: 0, v: 0.55 + (45 - time) / 60 + r() * 0.2, e: ['🗡️', '🔱', '🪓', '⚔️'][Math.floor(r() * 4)] }); spawnT = Math.max(0.45, 1.2 - (45 - time) / 45); }
        for (const s of strikes) s.p += s.v * dt;
        for (let i = strikes.length - 1; i >= 0; i--) if (strikes[i].p >= 1) { strikes.splice(i, 1); hp--; combo = 0; sfx.bonk(); const c = C(); burst(sp, c.x, c.y, ['#FF5A5F'], 16, 200); }
        return time <= 0 || hp <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#D9C8A0'; g.fillRect(0, 0, w, h);
        const c = C(); g.fillStyle = '#C2AE84'; g.beginPath(); g.arc(c.x, c.y, c.R * 0.3, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; for (const d of PDIR) { g.beginPath(); g.moveTo(c.x + d.dx * c.R * 0.3, c.y + d.dy * c.R * 0.3); g.lineTo(c.x + d.dx * c.R, c.y + d.dy * c.R); g.stroke(); }
        g.strokeStyle = 'rgba(61,220,151,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, c.R * 0.3 + c.R * 0.7 * 0.2, 0, Math.PI * 2); g.stroke();
        for (const s of strikes) { const d = PDIR[s.d], dist = c.R * (1 - s.p * 0.7); g.save(); g.translate(c.x + d.dx * dist, c.y + d.dy * dist); g.rotate(Math.atan2(-d.dy, -d.dx) + Math.PI / 4); emoji(g, s.e, 0, 0, 36); g.restore(); }
        emoji(g, '🧔', c.x, c.y, 54);
        if (guardT > 0) { const d = PDIR[guard]; emoji(g, '🛡️', c.x + d.dx * c.R * 0.32, c.y + d.dy * c.R * 0.32, 44); }
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(hp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#C9A64A', combo > 2 ? `🔥 ${combo}` : `🛡️ ${blocks}`);
        intro(g, w, h, t, ['Parry', 'Weapons strike from four sides.', 'Swipe TOWARD each one as it reaches the', 'green ring (or tap that side). Late = hurt!']);
      },
      down(p: Ptr) { start = { x: p.x, y: p.y }; },
      up(p: Ptr) {
        if (!start || time <= 0) return; let dx = p.x - start.x, dy = p.y - start.y; start = null;
        if (Math.hypot(dx, dy) < 25) { const c = C(); dx = p.x - c.x; dy = p.y - c.y; }
        parry(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      },
      key(k, d) { if (!d) return; const i = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].indexOf(k); if (i >= 0) parry(i); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🐎 Chariot Race
// ======================================================================================================================
export function ChariotRace({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, lane = 1, lx = 1, dist = 0, hp = 3, inv = 0, nextAt = 300, laurels = 0, start: { x: number; y: number } | null = null, boost = 0;
    const items: { lane: number; y: number; k: 'rock' | 'chariot' | 'laurel' | 'boost' }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const laneX = (l: number) => W * (0.25 + l * 0.25), CY = () => H - 160;
    const move = (d: number) => { lane = clamp(lane + d, 0, 2); sfx.swish(); };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; inv = Math.max(0, inv - dt); boost = Math.max(0, boost - dt);
        const speed = Math.min(600, 280 + dist / 30) * (boost > 0 ? 1.5 : 1); dist += speed * dt; score += speed * dt * 0.02 * (boost > 0 ? 2 : 1);
        lx += (lane - lx) * Math.min(1, dt * 12);
        if (dist > nextAt) { const roll = r(), k = roll < 0.4 ? 'rock' : roll < 0.62 ? 'chariot' : roll < 0.94 ? 'laurel' : 'boost'; items.push({ lane: Math.floor(r() * 3), y: TOP, k }); if (r() < Math.min(0.5, dist / 8000)) items.push({ lane: Math.floor(r() * 3), y: TOP - 40, k: 'rock' }); nextAt = dist + 200 + r() * 200 - Math.min(80, dist / 100); }
        for (const it of items) it.y += (speed + (it.k === 'chariot' ? -120 : 0)) * dt;
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          if (Math.abs(it.y - CY()) < 34 && Math.abs(laneX(it.lane) - laneX(lx)) < W * 0.12) {
            if (it.k === 'laurel') { laurels++; score += 12 + Math.floor(level / 3); sfx.coin(); items.splice(i, 1); continue; }
            if (it.k === 'boost') { boost = 3; sfx.jackpot(); items.splice(i, 1); pp.push({ x: laneX(lx), y: CY() - 60, t: 'SPEED!', life: 0.8, c: '#FFE14D' }); continue; }
            if (inv <= 0 && boost <= 0) { hp--; inv = 1.2; sfx.bonk(); burst(sp, laneX(lx), CY(), ['#C9A06A', '#FF5A5F'], 14, 200); }
            items.splice(i, 1); continue;
          }
          if (it.y > H + 40) items.splice(i, 1);
        }
        return time <= 0 || hp <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#C9A06A'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#B8905A'; for (let i = 0; i < 20; i++) g.fillRect(((i * 97) % w), ((i * 61 + dist) % (h + 20)) - 10, 6, 6);
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.setLineDash([20, 20]); g.lineDashOffset = -dist; for (const l of [0.5, 1.5]) { g.beginPath(); g.moveTo(laneX(l), 0); g.lineTo(laneX(l), h); g.stroke(); } g.setLineDash([]);
        for (const it of items) emoji(g, it.k === 'rock' ? '🪨' : it.k === 'chariot' ? '🛞' : it.k === 'laurel' ? '🌿' : '⚡', laneX(it.lane), it.y, it.k === 'chariot' ? 40 : 32);
        g.save(); g.translate(laneX(lx), CY()); if (inv > 0 && Math.floor(t * 12) % 2) g.globalAlpha = 0.4; if (boost > 0) { g.shadowColor = '#FFE14D'; g.shadowBlur = 20; } emoji(g, '🐎', 0, -20, 44); g.fillStyle = '#C8352C'; g.fillRect(-18, 10, 36, 18); g.restore();
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(hp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#C8352C', `🌿 ${laurels}`);
        intro(g, w, h, t, ['Chariot Race', 'Swipe or tap left/right to change lanes.', 'Dodge the rocks and rival chariots,', 'grab laurels 🌿 and ⚡ for a speed boost!']);
      },
      down(p: Ptr) { start = { x: p.x, y: p.y }; },
      up(p: Ptr) { if (!start || time <= 0) return; const dx = p.x - start.x; start = null; if (Math.abs(dx) > 25) move(dx > 0 ? 1 : -1); else move(p.x > W / 2 ? 1 : -1); },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft') move(-1); if (k === 'ArrowRight') move(1); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🙌 Crowd Wave
// ======================================================================================================================
export function CrowdWave({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const S = 10;
    let score = 0, time = 45, wave = 0, speed = 1.6, up: number[] = Array(S).fill(0), hit: boolean[] = Array(S).fill(false), laps = 0, combo = 0, msg = '', msgT = 0, last = -1;
    const pp: Pop[] = [], sp: Spark[] = [];
    const C = () => ({ x: W / 2, y: TOP + (H - TOP) * 0.48, rx: W * 0.42, ry: (H - TOP) * 0.36 });
    const pos = (i: number) => { const c = C(), a = (i / S) * Math.PI * 2 - Math.PI / 2; return { x: c.x + Math.cos(a) * c.rx, y: c.y + Math.sin(a) * c.ry }; };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        wave += dt * speed; const cur = Math.floor(wave) % S;
        if (cur !== last) {
          // the stand the wave just left: did you tap it in time?
          if (last >= 0 && !hit[last]) { combo = 0; }
          if (cur === 0 && last === S - 1) { laps++; const all = hit.every(Boolean); if (all) { const b = 30 + laps * 5 + Math.floor(level / 2) * 2; score += b; msg = `Full wave! +${b}`; msgT = 1.2; sfx.jackpot(); } speed = Math.min(4.2, speed + 0.25); hit = Array(S).fill(false); }
          last = cur;
        }
        for (let i = 0; i < S; i++) up[i] = Math.max(0, up[i] - dt * 3);
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#C2AE84'; g.fillRect(0, 0, w, h);
        const c = C(); g.fillStyle = '#D9C8A0'; g.beginPath(); g.ellipse(c.x, c.y, c.rx * 0.7, c.ry * 0.7, 0, 0, Math.PI * 2); g.fill();
        const cur = Math.floor(wave) % S, frac = wave % 1;
        for (let i = 0; i < S; i++) {
          const p = pos(i), active = i === cur;
          g.fillStyle = hit[i] ? '#3DDC97' : active ? '#FFE14D' : '#8B6A44'; g.beginPath(); g.arc(p.x, p.y, 30, 0, Math.PI * 2); g.fill();
          if (active) { g.strokeStyle = '#FFFFFF'; g.lineWidth = 4; g.beginPath(); g.arc(p.x, p.y, 30 + (1 - frac) * 20, 0, Math.PI * 2); g.stroke(); }
          emoji(g, up[i] > 0 || hit[i] ? '🙌' : '🧍', p.x, p.y - up[i] * 10, 30);
        }
        msgDraw(g, w, c.y, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFE14D', combo > 2 ? `🔥 ${combo}` : `🌊 ${laps}`);
        intro(g, w, h, t, ['Crowd Wave', 'The wave runs round the stands.', 'Tap each stand while it’s lit up', 'to get the crowd on their feet!']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const i = [...Array(S).keys()].find((k) => { const q = pos(k); return Math.hypot(q.x - p.x, q.y - p.y) < 40; }); if (i === undefined) return;
        const cur = Math.floor(wave) % S;
        if (i === cur && !hit[i]) { hit[i] = true; up[i] = 1; combo++; const timing = 1 - Math.abs((wave % 1) - 0.5) * 2, pts = 4 + Math.round(timing * 5) + Math.min(10, combo) + Math.floor(level / 3); score += pts; sfx.blip(Math.min(12, combo)); const q = pos(i); burst(sp, q.x, q.y, ['#FFE14D', '#FF5A5F', '#22B8FF'], 8, 140); }
        else { combo = 0; score = Math.max(0, score - 3); sfx.bonk(); }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🪖 Shield Wall
// ======================================================================================================================
export function ShieldWall({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, hp = 3, spawnT = 0.6, blocked = 0, combo = 0;
    const raised = [false, false, false], stamina = [1, 1, 1];
    const spears: { lane: number; y: number; v: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const laneX = (l: number) => W * (0.2 + l * 0.3), SY = () => H - 200;
    const btn = (l: number) => ({ x: laneX(l) - W * 0.13, y: H - 120, w: W * 0.26, h: 96 });
    const held = new Map<number, number>();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; spawnT -= dt;
        for (let l = 0; l < 3; l++) { if (raised[l]) { stamina[l] -= dt * 0.45; if (stamina[l] <= 0) { stamina[l] = 0; raised[l] = false; } } else stamina[l] = Math.min(1, stamina[l] + dt * 0.3); }
        if (spawnT <= 0) { spears.push({ lane: Math.floor(r() * 3), y: TOP, v: 260 + (45 - time) * 6 + r() * 80 }); spawnT = Math.max(0.35, 1 - (45 - time) / 60); }
        for (let i = spears.length - 1; i >= 0; i--) {
          const s = spears[i]; s.y += s.v * dt;
          if (s.y >= SY() - 30) {
            spears.splice(i, 1);
            if (raised[s.lane]) { blocked++; combo++; const pts = 6 + Math.min(10, combo) + Math.floor(level / 3); score += pts; sfx.thud(); burst(sp, laneX(s.lane), SY() - 40, ['#C0C4CC', '#FFE14D'], 10, 180); pp.push({ x: laneX(s.lane), y: SY() - 70, t: `+${pts}`, life: 0.6, c: '#FFE14D' }); }
            else { hp--; combo = 0; sfx.bonk(); burst(sp, laneX(s.lane), SY(), ['#FF5A5F'], 14, 200); }
          }
        }
        return time <= 0 || hp <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#D9C8A0'; g.fillRect(0, 0, w, h);
        for (let l = 0; l < 3; l++) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(laneX(l) - W * 0.12, TOP, W * 0.24, SY() - TOP); }
        for (const s of spears) { g.save(); g.translate(laneX(s.lane), s.y); g.fillStyle = '#6B4A2A'; g.fillRect(-2, -60, 4, 56); g.fillStyle = '#C0C4CC'; g.beginPath(); g.moveTo(-8, -4); g.lineTo(0, 14); g.lineTo(8, -4); g.closePath(); g.fill(); g.restore(); }
        for (let l = 0; l < 3; l++) {
          emoji(g, '💂', laneX(l), SY() + 10, 46);
          if (raised[l]) { g.fillStyle = '#C9A64A'; g.beginPath(); g.ellipse(laneX(l), SY() - 40, 40, 14, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#8A6A2A'; g.lineWidth = 3; g.stroke(); }
          const b = btn(l); button(g, b.x, b.y, b.w, b.h, raised[l] ? '#C9A64A' : stamina[l] < 0.25 ? '#555' : '#8A6A2A', raised[l] ? 'UP' : 'HOLD', { down: raised[l] });
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(b.x + 8, b.y + b.h - 14, b.w - 16, 6); g.fillStyle = stamina[l] > 0.3 ? '#3DDC97' : '#FF5A5F'; g.fillRect(b.x + 8, b.y + b.h - 14, (b.w - 16) * stamina[l], 6);
        }
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(hp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#C9A64A', combo > 2 ? `🔥 ${combo}` : `🛡️ ${blocked}`);
        intro(g, w, h, t, ['Shield Wall', 'HOLD a lane’s button to raise its shield.', 'Shields tire while raised (green bar) —', 'only raise them when a spear is coming!']);
      },
      down(p: Ptr) { const l = [0, 1, 2].find((k) => inBox(p, btn(k))); if (l !== undefined && stamina[l] > 0.08) { raised[l] = true; held.set(p.id, l); } },
      up(p: Ptr) { const l = held.get(p.id); if (l !== undefined) { raised[l] = false; held.delete(p.id); } },
      key(k, d) { const l = ['1', '2', '3'].indexOf(k); if (l >= 0) raised[l] = d && stamina[l] > 0.08; },
    };
  }, onEnd, onScore);
}
void clamp;
