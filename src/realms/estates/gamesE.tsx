// Estate stand games, part 1 — the Grand Atelier, the Wild Reserve and the Horse Ranch.
//   🎨 Fill Frenzy      paint by numbers: pick a colour, fill every tile of that number
//   🖼️ Level It         keep the swinging frame straight against the gusts
//   🔍 Spot the Forgery tap the three things the forger got wrong
//   🪣 Splat Catch      catch drops of the bucket's colour — and the bucket keeps changing
//   📷 Photo Safari     snap the shutter when an animal is right in the frame
//   🐾 Track Reader     remember the trail of prints and walk it back
//   🐸 River Crossing   hop up the river on logs and lily pads
//   🥕 Feeding Time     give each animal the food it's asking for
//   🏇 Barrel Race      weave round the barrels on the side the arrows say
//   🤠 Lasso Toss       aim and throw the loop over a running calf
//   🌾 Haystack Hunt    find the golden egg — warmer, colder…
//   🐑 Corral Count     count the animals that run past
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, useGame, type GameProps, type Ptr } from '../games';
import { INTRO, TOP, burst, button, clamp, hearts, hud, inBox, intro, pops, sparks, type Pop, type Spark } from './kit';

const PAINT = ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97', '#B36BFF', '#FF8A2A'];
const msgDraw = (g: CanvasRenderingContext2D, w: number, y: number, msg: string, t: number, c = '#FFE14D') => { if (t <= 0) return; g.globalAlpha = Math.min(1, t); g.fillStyle = c; g.font = '900 22px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4; g.strokeText(msg, w / 2, y); g.fillText(msg, w / 2, y); g.globalAlpha = 1; };

// ======================================================================================================================
// 🎨 Fill Frenzy
// ======================================================================================================================
export function FillFrenzy({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, pick = 0, nums: number[] = [], filled: boolean[] = [], N = 4, k = 3, pic = 0, combo = 0, msg = '', msgT = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const geo = () => { const cs = Math.min((W - 30) / N, (H - TOP - 170) / N); return { cs, ox: (W - cs * N) / 2, oy: TOP + 20 }; };
    const deal = () => { pic++; N = Math.min(6, 3 + Math.floor(pic / 2)); k = Math.min(5, 2 + Math.floor(pic / 2)); nums = Array.from({ length: N * N }, () => Math.floor(r() * k)); filled = nums.map(() => false); };
    deal();
    const pal = () => { const bw = Math.min(64, (W - 30) / k - 8); return Array.from({ length: k }, (_, i) => ({ x: W / 2 - (k * (bw + 8)) / 2 + i * (bw + 8), y: H - 110, w: bw, h: 64 })); };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; msgT -= dt; return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#F2E6D0'; g.fillRect(0, 0, w, h);
        const G = geo();
        g.fillStyle = '#8B5A2B'; g.fillRect(G.ox - 10, G.oy - 10, G.cs * N + 20, G.cs * N + 20);
        nums.forEach((n, i) => {
          const x = G.ox + (i % N) * G.cs, y = G.oy + Math.floor(i / N) * G.cs;
          g.fillStyle = filled[i] ? PAINT[n] : '#FFFDF6'; g.fillRect(x + 1, y + 1, G.cs - 2, G.cs - 2);
          if (!filled[i]) { g.fillStyle = '#8A7A6A'; g.font = `800 ${Math.round(G.cs * 0.38)}px ui-rounded`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${n + 1}`, x + G.cs / 2, y + G.cs / 2); }
        });
        pal().forEach((b, i) => { button(g, b.x, b.y, b.w, b.h, PAINT[i], `${i + 1}`, { ring: i === pick ? '#000' : undefined, text: '#222', font: '900 22px ui-rounded' }); });
        msgDraw(g, w, h - 140, msg, msgT, '#B0306A');
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#B0306A', combo > 2 ? `🔥 ${combo}` : `🖼️ ${pic}`);
        intro(g, w, h, t, ['Fill Frenzy', 'Pick a colour at the bottom,', 'then tap every tile with its number.', 'Wrong colour costs points!']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const pi = pal().findIndex((b) => inBox(p, b)); if (pi >= 0) { pick = pi; sfx.tick(); return; }
        const G = geo(), cx = Math.floor((p.x - G.ox) / G.cs), cy = Math.floor((p.y - G.oy) / G.cs);
        if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
        const i = cy * N + cx; if (filled[i]) return;
        if (nums[i] === pick) { filled[i] = true; combo++; score += 3 + Math.min(5, Math.floor(combo / 4)); sfx.blip(Math.min(12, combo)); burst(sp, G.ox + (cx + 0.5) * G.cs, G.oy + (cy + 0.5) * G.cs, [PAINT[pick]], 6, 120); }
        else { combo = 0; score = Math.max(0, score - 4); sfx.bonk(); pp.push({ x: p.x, y: p.y, t: 'smudge!', life: 0.7, c: '#B0306A' }); }
        if (filled.every(Boolean)) { const b = 25 + N * N; score += b + Math.floor(level / 2) * 2; msg = `Masterpiece! +${b}`; msgT = 1.3; sfx.jackpot(); deal(); }
      },
      key(k2, d) { if (d) { const n = Number(k2); if (n >= 1 && n <= k) pick = n - 1; } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🖼️ Level It
// ======================================================================================================================
export function LevelIt({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, ang = 0, vel = 0, gust = 0, gustT = 2, steady = 0, best = 0, frames = 1, msg = '', msgT = 0, nudgeL = 0, nudgeR = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const pic = Math.floor(r() * 4);
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; gustT -= dt; nudgeL -= dt; nudgeR -= dt;
        if (gustT <= 0) { gust = (r() - 0.5) * (1.2 + (45 - time) / 25); gustT = 1 + r() * 2; }
        vel += (gust - ang * 2.2) * dt; vel *= 1 - dt * 0.4; ang += vel * dt;
        ang = clamp(ang, -0.9, 0.9);
        const deg = Math.abs(ang * 57.3);
        if (deg < 3) { steady += dt; score += dt * (6 + Math.min(10, steady * 1.5)); if (steady > best + 1 && Math.floor(steady) % 5 === 0 && Math.floor(steady) > 0 && Math.floor(steady - dt) !== Math.floor(steady)) { msg = `Perfectly level ${Math.floor(steady)}s!`; msgT = 1; sfx.perfect(Math.min(12, Math.floor(steady / 5))); } best = Math.max(best, steady); }
        else steady = 0;
        if (deg > 40) { time -= dt * 2; }
        frames = 1 + Math.floor((45 - time) / 15);
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#E9D3B0'; g.fillRect(0, 0, w, h); g.fillStyle = '#D9C09A'; for (let y = 0; y < h; y += 26) g.fillRect(0, y, w, 2);
        const cx = w / 2, cy = TOP + (h - TOP) * 0.38, fw = Math.min(w * 0.7, 300), fh = fw * 0.72;
        g.strokeStyle = '#5A3A20'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - fh / 2 - 60); g.lineTo(cx - fw * 0.3 * Math.cos(ang) , cy - fh / 2 + Math.sin(ang) * -fw * 0.3); g.moveTo(cx, cy - fh / 2 - 60); g.lineTo(cx + fw * 0.3 * Math.cos(ang), cy - fh / 2 + Math.sin(ang) * fw * 0.3); g.stroke();
        emoji(g, '📌', cx, cy - fh / 2 - 64, 18);
        g.save(); g.translate(cx, cy); g.rotate(ang);
        g.fillStyle = '#C9A64A'; g.fillRect(-fw / 2 - 12, -fh / 2 - 12, fw + 24, fh + 24); g.fillStyle = '#8B6A2A'; g.fillRect(-fw / 2 - 4, -fh / 2 - 4, fw + 8, fh + 8);
        const sky = g.createLinearGradient(0, -fh / 2, 0, fh / 2); sky.addColorStop(0, ['#9ED8FF', '#FFB38A', '#1A1450', '#B8E8C8'][pic]); sky.addColorStop(1, ['#FFFDF6', '#FF6FA8', '#6C7BFF', '#3E8A4A'][pic]); g.fillStyle = sky; g.fillRect(-fw / 2, -fh / 2, fw, fh);
        emoji(g, ['🌻', '🌅', '🌌', '🏞️'][pic], 0, 0, fh * 0.5);
        g.restore();
        // the spirit level
        const deg = ang * 57.3, lw = Math.min(w - 60, 280);
        g.fillStyle = '#2A2A30'; g.beginPath(); g.roundRect(cx - lw / 2, h - 210, lw, 30, 15); g.fill(); g.fillStyle = Math.abs(deg) < 3 ? '#3DDC97' : '#B8E86A'; g.beginPath(); g.roundRect(cx - lw / 2 + 4, h - 206, lw - 8, 22, 11); g.fill();
        g.strokeStyle = '#2A2A30'; g.lineWidth = 2; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 16, h - 206); g.lineTo(cx + s * 16, h - 184); g.stroke(); }
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(cx + clamp(deg * 4, -lw / 2 + 14, lw / 2 - 14), h - 195, 12, 8, 0, 0, Math.PI * 2); g.fill();
        const L = button(g, 20, h - 150, w / 2 - 30, 90, nudgeL > 0 ? '#8B5A2B' : '#A9865E', '↶ nudge', { down: nudgeL > 0 }), R = button(g, w / 2 + 10, h - 150, w / 2 - 30, 90, nudgeR > 0 ? '#8B5A2B' : '#A9865E', 'nudge ↷', { down: nudgeR > 0 }); void L; void R;
        msgDraw(g, w, TOP + 20, msg, msgT, '#3E7D3A');
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#8B5A2B', `📐 ${Math.abs(deg).toFixed(1)}°${frames > 1 ? '' : ''}`);
        intro(g, w, h, t, ['Level It', 'Gusts swing the painting.', 'Tap ↶ or ↷ to nudge it back.', 'Points for every second it hangs straight.']);
      },
      down(p: Ptr) { if (time <= 0 || p.y < H - 160) return; if (p.x < W / 2) { vel -= 0.55; nudgeL = 0.15; } else { vel += 0.55; nudgeR = 0.15; } sfx.tick(); },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft') vel -= 0.55; if (k === 'ArrowRight') vel += 0.55; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔍 Spot the Forgery
// ======================================================================================================================
export function SpotForgery({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    type S = { x: number; y: number; s: number; c: string; k: number };
    let score = 0, time = 50, shapes: S[] = [], diffs: number[] = [], found: number[] = [], roundT = 0, rounds = 0, misses = 0, msg = '', msgT = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const box = (top: boolean) => { const bw = Math.min(W - 30, (H - TOP - 60) / 2 * 1.3), bh = (H - TOP - 60) / 2 - 10; return { x: (W - bw) / 2, y: top ? TOP + 10 : TOP + 20 + bh + 10, w: bw, h: bh }; };
    const deal = () => {
      rounds++; roundT = 0; found = [];
      const n = 9 + Math.min(6, rounds);
      shapes = Array.from({ length: n }, () => ({ x: 0.1 + r() * 0.8, y: 0.12 + r() * 0.76, s: 0.06 + r() * 0.07, c: PAINT[Math.floor(r() * 6)], k: Math.floor(r() * 3) }));
      const idx = [...shapes.keys()].sort(() => r() - 0.5); diffs = idx.slice(0, 3);
    };
    deal();
    const drawShape = (g: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }, s: S, i: number, forged: boolean) => {
      const d = forged && diffs.includes(i) ? diffs.indexOf(i) : -1;
      const c = d === 0 ? PAINT[(PAINT.indexOf(s.c) + 2) % 6] : s.c, k = d === 1 ? (s.k + 1) % 3 : s.k;
      if (d === 2) return; // a missing shape
      const x = b.x + s.x * b.w, y = b.y + s.y * b.h, R = s.s * b.w;
      g.fillStyle = c; g.beginPath();
      if (k === 0) g.arc(x, y, R, 0, Math.PI * 2); else if (k === 1) g.rect(x - R, y - R, R * 2, R * 2); else { g.moveTo(x, y - R); g.lineTo(x + R, y + R); g.lineTo(x - R, y + R); g.closePath(); }
      g.fill();
    };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; roundT += dt; msgT -= dt; return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#3A2A20'; g.fillRect(0, 0, w, h);
        for (const top of [true, false]) {
          const b = box(top);
          g.fillStyle = '#C9A64A'; g.fillRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16); g.fillStyle = '#FFFDF6'; g.fillRect(b.x, b.y, b.w, b.h);
          shapes.forEach((s, i) => drawShape(g, b, s, i, !top));
          g.fillStyle = 'rgba(0,0,0,0.55)'; g.font = '800 11px ui-rounded'; g.textAlign = 'left'; g.fillText(top ? 'ORIGINAL' : 'FORGERY — tap the 3 changes', b.x + 6, b.y + 12);
        }
        const fb = box(false);
        for (const i of found) { const s = shapes[i]; g.strokeStyle = '#3DDC97'; g.lineWidth = 3; g.beginPath(); g.arc(fb.x + s.x * fb.w, fb.y + s.y * fb.h, s.s * fb.w + 8, 0, Math.PI * 2); g.stroke(); }
        msgDraw(g, w, h - 20, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#C9A64A', `🔍 ${found.length}/3`);
        intro(g, w, h, t, ['Spot the Forgery', 'The bottom painting is a fake.', 'Tap the 3 things that are different:', 'a colour, a shape, or one that’s missing.']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const b = box(false); if (!inBox(p, b)) return;
        const hit = diffs.find((i) => !found.includes(i) && Math.hypot(b.x + shapes[i].x * b.w - p.x, b.y + shapes[i].y * b.h - p.y) < shapes[i].s * b.w + 8);
        if (hit !== undefined) {
          found.push(hit); score += 15; sfx.perfect(found.length * 3); burst(sp, p.x, p.y, ['#3DDC97', '#FFE14D'], 12, 160);
          if (found.length === 3) { const b2 = Math.max(10, Math.round(60 - roundT * 3)) + Math.floor(level / 2) * 2; score += b2; msg = `Forger caught! +${b2}`; msgT = 1.3; sfx.jackpot(); deal(); }
        } else { misses++; score = Math.max(0, score - 8); time -= 1.5; sfx.bonk(); pp.push({ x: p.x, y: p.y, t: '−1.5s', life: 0.8, c: '#FF5A5F' }); }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🪣 Splat Catch
// ======================================================================================================================
export function SplatCatch({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, bx = W / 2, tx = W / 2, col = 0, colT = 5, spawnT = 0.6, streak = 0, warn = 0;
    const drops: { x: number; y: number; c: number; v: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const by = () => H - 90;
    const colors = 3;
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; colT -= dt; spawnT -= dt;
        if (colT <= 1.2 && warn <= 0) warn = 1.2;
        if (warn > 0) warn -= dt;
        if (colT <= 0) { col = (col + 1 + Math.floor(r() * (colors - 1))) % colors; colT = 4 + r() * 3; sfx.swish(); }
        if (spawnT <= 0) { drops.push({ x: 30 + r() * (W - 60), y: TOP, c: Math.floor(r() * colors), v: 160 + (45 - time) * 4 + r() * 60 }); spawnT = Math.max(0.28, 0.7 - (45 - time) / 120); }
        bx += clamp(tx - bx, -700 * dt, 700 * dt);
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i]; d.y += d.v * dt;
          if (d.y > by() - 20 && d.y < by() + 10 && Math.abs(d.x - bx) < 46) {
            drops.splice(i, 1);
            if (d.c === col) { streak++; const pts = 5 + Math.min(10, Math.floor(streak / 3)); score += pts; sfx.blip(Math.min(12, streak)); burst(sp, d.x, by() - 16, [PAINT[d.c]], 8, 140); }
            else { streak = 0; score = Math.max(0, score - 8); sfx.bonk(); pp.push({ x: d.x, y: by() - 40, t: 'wrong colour!', life: 0.8, c: '#FF5A5F' }); }
          } else if (d.y > H) drops.splice(i, 1);
        }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#FFFDF6'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) { g.globalAlpha = 0.08; g.fillStyle = PAINT[i % 6]; g.beginPath(); g.arc((i * 137) % w, (i * 89) % h, 30 + (i % 3) * 10, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
        for (const d of drops) { g.fillStyle = PAINT[d.c]; g.beginPath(); g.moveTo(d.x, d.y - 14); g.quadraticCurveTo(d.x + 10, d.y, d.x, d.y + 8); g.quadraticCurveTo(d.x - 10, d.y, d.x, d.y - 14); g.fill(); }
        // the bucket in its current colour (blinking before it changes)
        const blink = warn > 0 && Math.floor(t * 8) % 2;
        g.fillStyle = blink ? '#DDD' : PAINT[col]; g.beginPath(); g.moveTo(bx - 44, by() - 24); g.lineTo(bx + 44, by() - 24); g.lineTo(bx + 34, by() + 24); g.lineTo(bx - 34, by() + 24); g.closePath(); g.fill();
        g.strokeStyle = '#555'; g.lineWidth = 3; g.beginPath(); g.arc(bx, by() - 24, 40, Math.PI, 0); g.stroke();
        g.fillStyle = '#333'; g.font = '800 13px ui-rounded'; g.textAlign = 'center'; g.fillText(`catch ${['RED', 'BLUE', 'YELLOW'][col]}`, bx, by() + 44);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, PAINT[col], streak > 2 ? `🔥 ${streak}` : '');
        intro(g, w, h, t, ['Splat Catch', 'Drag to move the bucket.', 'Only catch drops of the bucket’s colour —', 'and watch out, it changes colour!']);
      },
      down(p: Ptr) { tx = p.x; }, move(p: Ptr) { tx = p.x; },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft') tx = bx - 90; if (k === 'ArrowRight') tx = bx + 90; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 📷 Photo Safari
// ======================================================================================================================
const ANIMALS = [{ e: '🦌', p: 20 }, { e: '🦊', p: 30 }, { e: '🐗', p: 25 }, { e: '🦉', p: 45 }, { e: '🐻', p: 60 }, { e: '🦄', p: 150 }];
export function PhotoSafari({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, film = 12, flash = 0, spawnT = 0.5, msg = '', msgT = 0, album: string[] = [];
    const walkers: { x: number; lane: number; v: number; a: typeof ANIMALS[number]; shot?: boolean }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const laneY = (l: number) => TOP + 120 + l * ((H - TOP - 300) / 2);
    const frame = () => ({ x: W / 2 - 60, y: laneY(1) - 70, w: 120, h: 140 });
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; flash = Math.max(0, flash - dt * 3); msgT -= dt; spawnT -= dt;
        if (spawnT <= 0) { const dir = r() < 0.5 ? 1 : -1, roll = r(); const a = ANIMALS[roll < 0.04 ? 5 : roll < 0.14 ? 4 : roll < 0.3 ? 3 : Math.floor(r() * 3)]; walkers.push({ x: dir > 0 ? -40 : W + 40, lane: Math.floor(r() * 3), v: dir * (60 + r() * 90 + (45 - time) * 2) * (a.e === '🦄' ? 1.8 : 1), a }); spawnT = 0.9 + r() * 1.2; }
        for (const k of walkers) k.x += k.v * dt;
        for (let i = walkers.length - 1; i >= 0; i--) if (walkers[i].x < -80 || walkers[i].x > W + 80) walkers.splice(i, 1);
        return time <= 0 || film <= 0;
      },
      draw(g, w, h, t) {
        const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#BFE6FF'); sky.addColorStop(1, '#7DBB4A'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
        for (let l = 0; l < 3; l++) { const y = laneY(l); g.fillStyle = ['#8CC653', '#7DBB4A', '#6CA83A'][l]; g.fillRect(0, y + 20, w, 30); }
        for (const k of walkers) { const y = laneY(k.lane); g.save(); g.translate(k.x, y); if (k.v > 0) g.scale(-1, 1); emoji(g, k.a.e, 0, Math.abs(Math.sin(t * 8 + k.x * 0.05)) * -4, 46 - (2 - k.lane) * 6); g.restore(); }
        // bushes in front
        for (let l = 0; l < 3; l++) for (let i = 0; i < 6; i++) { const x = ((i * 97 + l * 53) % (w + 60)) - 30; g.fillStyle = '#3E7D3A'; g.beginPath(); g.arc(x, laneY(l) + 28, 22, 0, Math.PI * 2); g.fill(); }
        const f = frame(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.setLineDash([12, 8]); g.strokeRect(f.x, f.y, f.w, f.h + (laneY(2) - laneY(1))); g.setLineDash([]);
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(w / 2, f.y + 10); g.lineTo(w / 2, f.y + f.h + (laneY(2) - laneY(1)) - 10); g.stroke();
        if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, w, h); }
        button(g, w / 2 - 70, h - 96, 140, 64, '#222', '📸 SNAP', { font: '900 20px ui-rounded' });
        g.fillStyle = '#fff'; g.font = '800 12px ui-rounded'; g.textAlign = 'left'; g.fillText(album.slice(-8).join(' '), 14, h - 16);
        msgDraw(g, w, TOP + 20, msg, msgT, '#FFFFFF');
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `🎞️ ${film} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#3E7D3A', album.length ? `📷 ${album.length}` : '');
        intro(g, w, h, t, ['Photo Safari', 'Animals cross the meadow.', 'Tap SNAP when one is in the frame —', 'dead centre scores most. Rare ones pay big!']);
      },
      down(p: Ptr) {
        if (time <= 0 || film <= 0) return;
        if (p.y < H - 110) return;
        film--; flash = 0.8; sfx.thud();
        const fx = W / 2;
        const inFrame = walkers.filter((k) => !k.shot && Math.abs(k.x - fx) < 60).sort((a, b) => Math.abs(a.x - fx) - Math.abs(b.x - fx))[0];
        if (!inFrame) { msg = 'Just bushes…'; msgT = 0.8; return; }
        inFrame.shot = true; const c = 1 - Math.abs(inFrame.x - fx) / 60, pts = Math.round(inFrame.a.p * (0.4 + c)) + Math.floor(level / 2) * 2;
        score += pts; album.push(inFrame.a.e); film += c > 0.8 ? 1 : 0;
        msg = c > 0.8 ? `Perfect shot! ${inFrame.a.e} +${pts} (+1 🎞️)` : `${inFrame.a.e} +${pts}`; msgT = 1.1; sfx.perfect(Math.round(c * 10)); burst(sp, inFrame.x, laneY(inFrame.lane), ['#FFE14D', '#FFFFFF'], 14, 160);
      },
      key(k, d) { if (d && (k === ' ' || k === 'Enter')) this.down?.({ x: W / 2, y: H - 50, id: 0 }, W, H); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🐾 Track Reader
// ======================================================================================================================
export function TrackReader({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const N = 5;
    let score = 0, time = 50, path: number[] = [], got = 0, phase: 'show' | 'walk' | 'pause' = 'show', showT = 0, len = 3, trail = 0, msg = '', msgT = 0, wrong = -1, wrongT = 0;
    const TRACK = ['🐾', '🦶', '🐾', '🪶'];
    const pp: Pop[] = [], sp: Spark[] = [];
    const geo = () => { const cs = Math.min((W - 30) / N, (H - TOP - 120) / N); return { cs, ox: (W - cs * N) / 2, oy: TOP + 40 + (H - TOP - 120 - cs * N) / 2 }; };
    const deal = () => {
      trail++; got = 0; phase = 'show'; showT = 0;
      path = [Math.floor(r() * N * N)];
      while (path.length < len) { const c = path[path.length - 1], x = c % N, y = Math.floor(c / N); const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N).map(([a, b]) => b * N + a).filter((n) => !path.includes(n)); if (!nb.length) break; path.push(nb[Math.floor(r() * nb.length)]); }
    };
    deal();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; wrongT -= dt; showT += dt;
        if (phase === 'show' && showT > 0.55 * path.length + 0.8) { phase = 'walk'; }
        if (phase === 'pause' && showT > 0.9) deal();
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#6B8A3A'; g.fillRect(0, 0, w, h);
        const G = geo();
        for (let i = 0; i < N * N; i++) { const x = G.ox + (i % N) * G.cs, y = G.oy + Math.floor(i / N) * G.cs; g.fillStyle = (i + Math.floor(i / N)) % 2 ? '#8A6A44' : '#9C7A55'; g.beginPath(); g.roundRect(x + 3, y + 3, G.cs - 6, G.cs - 6, 10); g.fill(); if (i === wrong && wrongT > 0) { g.fillStyle = 'rgba(255,90,95,0.6)'; g.fill(); } }
        const shown = phase === 'show' ? Math.min(path.length, Math.floor(showT / 0.55) + 1) : phase === 'pause' ? path.length : got;
        for (let k = 0; k < shown; k++) { const c = path[k], x = G.ox + (c % N + 0.5) * G.cs, y = G.oy + (Math.floor(c / N) + 0.5) * G.cs; g.save(); g.translate(x, y); g.rotate(k * 0.4); g.globalAlpha = phase === 'show' && showT > 0.55 * path.length ? Math.max(0, 1 - (showT - 0.55 * path.length) * 1.5) : 1; emoji(g, TRACK[trail % 4], 0, 0, G.cs * 0.5); g.restore(); }
        g.fillStyle = '#fff'; g.font = '800 15px ui-rounded'; g.textAlign = 'center'; g.fillText(phase === 'show' ? 'Watch the tracks…' : phase === 'walk' ? `Walk the trail: ${got}/${path.length}` : '', w / 2, G.oy - 16);
        msgDraw(g, w, h - 40, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#C9A06A', `🐾 ${len}`);
        intro(g, w, h, t, ['Track Reader', 'Footprints appear one by one, then fade.', 'Tap the squares in the same order', 'to follow the trail. Trails get longer!']);
      },
      down(p: Ptr) {
        if (phase !== 'walk' || time <= 0) return;
        const G = geo(), cx = Math.floor((p.x - G.ox) / G.cs), cy = Math.floor((p.y - G.oy) / G.cs);
        if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
        const i = cy * N + cx;
        if (i === path[got]) { got++; score += 3 + len; sfx.blip(got * 2); if (got === path.length) { const b = len * 8 + Math.floor(level / 2) * 2; score += b; msg = `Found the den! +${b}`; msgT = 1.1; sfx.win(4); len = Math.min(12, len + 1); phase = 'pause'; showT = 0; } }
        else if (!path.slice(0, got).includes(i)) { wrong = i; wrongT = 0.5; sfx.bonk(); msg = 'Lost the trail'; msgT = 1; len = Math.max(3, len - 1); phase = 'pause'; showT = 0; got = path.length; }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🐸 River Crossing
// ======================================================================================================================
export function RiverCrossing({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const ROWS = 7;
    type Row = { y: number; dir: number; v: number; items: { x: number; w: number }[]; bank: boolean };
    let score = 0, time = 50, hp = 3, row = 0, fx = W / 2, crossings = 0, inv = 0, msg = '', msgT = 0, hop = 0, rows: Row[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const rh = () => (H - TOP - 120) / ROWS;
    const rowY = (i: number) => H - 80 - i * rh();
    const build = () => {
      rows = [];
      for (let i = 0; i < ROWS; i++) {
        const bank = i === 0 || i === ROWS - 1, dir = i % 2 ? 1 : -1, v = (40 + r() * 50 + crossings * 10) * dir, wide = r() < 0.5;
        const items: { x: number; w: number }[] = [];
        if (!bank) { let x = r() * 80; while (x < W + 100) { const w = wide ? 90 + r() * 50 : 46; items.push({ x, w }); x += w + 60 + r() * 70; } }
        rows.push({ y: rowY(i), dir, v, items, bank });
      }
      row = 0; fx = W / 2;
    };
    build();
    const onItem = () => { const R = rows[row]; if (R.bank) return true; return R.items.some((it) => fx > it.x - 8 && fx < it.x + it.w + 8); };
    const fall = () => { hp--; inv = 1; sfx.bonk(); burst(sp, fx, rowY(row), ['#3B8FD0', '#BFE6FF'], 16, 180); pp.push({ x: fx, y: rowY(row) - 20, t: 'splash!', life: 0.8, c: '#9AE6FF' }); row = 0; fx = W / 2; };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; inv = Math.max(0, inv - dt); hop = Math.max(0, hop - dt * 5);
        for (const R of rows) for (const it of R.items) { it.x += R.v * dt; const span = W + 200; if (R.v > 0 && it.x > W + 60) it.x -= span; if (R.v < 0 && it.x + it.w < -60) it.x += span; }
        const R = rows[row]; if (!R.bank && onItem()) fx += R.v * dt;
        if (fx < -10 || fx > W + 10 || (!R.bank && !onItem())) { if (inv <= 0) fall(); }
        return time <= 0 || hp <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2F7FA8'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 20; i++) { g.beginPath(); g.moveTo(((i * 61 + t * 30) % (w + 40)) - 20, (i * 47) % h); g.lineTo(((i * 61 + t * 30) % (w + 40)) + 10, (i * 47) % h); g.stroke(); }
        rows.forEach((R, i) => {
          if (R.bank) { g.fillStyle = i === 0 ? '#7DBB4A' : '#5E9A36'; g.fillRect(0, R.y - rh() / 2, w, rh()); if (i) emoji(g, '🏡', w - 40, R.y, 30); return; }
          for (const it of R.items) { if (it.w > 60) { g.fillStyle = '#8B5A2B'; g.beginPath(); g.roundRect(it.x, R.y - 14, it.w, 28, 14); g.fill(); g.fillStyle = '#A9865E'; g.fillRect(it.x + 6, R.y - 4, it.w - 12, 3); } else { g.fillStyle = '#3E8A4A'; g.beginPath(); g.arc(it.x + it.w / 2, R.y, 22, 0.3, Math.PI * 2 - 0.3); g.lineTo(it.x + it.w / 2, R.y); g.fill(); } }
        });
        if (!(inv > 0 && Math.floor(t * 12) % 2)) emoji(g, '🐸', fx, rowY(row) - hop * 10, 34);
        button(g, 20, h - 64, (w - 50) / 3, 52, '#ffffff33', '◀'); button(g, 25 + (w - 50) / 3, h - 64, (w - 50) / 3, 52, '#3DDC97', '▲ HOP'); button(g, 30 + ((w - 50) / 3) * 2, h - 64, (w - 50) / 3, 52, '#ffffff33', '▶');
        msgDraw(g, w, TOP + 20, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(hp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#3DDC97', crossings ? `🏡 ${crossings}` : '');
        intro(g, w, h, t, ['River Crossing', 'Tap ▲ to hop up onto a log or lily pad,', '◀ ▶ to shuffle along. Don’t fall in!', 'Reach the far bank for big points.']);
      },
      down(p: Ptr) {
        if (time <= 0 || hp <= 0 || p.y < H - 70) return;
        const third = (W - 50) / 3;
        if (p.x < 20 + third) fx -= 36; else if (p.x > 30 + third * 2) fx += 36; else { row++; hop = 1; score += 4; sfx.tick(); }
        if (row >= ROWS - 1) { crossings++; const b = 40 + crossings * 10 + Math.floor(level / 2) * 2; score += b; msg = `Made it across! +${b}`; msgT = 1.2; sfx.jackpot(); build(); }
      },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft') fx -= 36; if (k === 'ArrowRight') fx += 36; if (k === 'ArrowUp' || k === ' ') this.down?.({ x: W / 2, y: H - 30, id: 0 }, W, H); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🥕 Feeding Time
// ======================================================================================================================
const FEED = [{ a: '🐰', f: '🥕' }, { a: '🐿️', f: '🌰' }, { a: '🐻', f: '🍯' }, { a: '🦔', f: '🍄' }, { a: '🐦', f: '🌾' }, { a: '🦊', f: '🍇' }];
export function FeedingTime({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, food = 0, fed = 0, combo = 0, angry = 0;
    let slots = [0, 1, 2, 3].map((i) => ({ who: i, want: i, pat: 1, hop: 0 }));
    const pp: Pop[] = [], sp: Spark[] = [];
    const slotBox = (i: number) => { const sw = (W - 30) / 2; return { x: 15 + (i % 2) * sw, y: TOP + 20 + Math.floor(i / 2) * ((H - TOP - 240) / 2), w: sw - 6, h: (H - TOP - 240) / 2 - 10 }; };
    const nextFood = () => { const wants = slots.map((s) => s.want); food = r() < 0.75 ? wants[Math.floor(r() * 4)] : Math.floor(r() * FEED.length); };
    nextFood();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt;
        for (const s of slots) { s.pat -= dt / Math.max(4, 9 - (45 - time) / 8); s.hop = Math.max(0, s.hop - dt * 3); if (s.pat <= 0) { angry++; combo = 0; s.pat = 1; s.who = Math.floor(r() * FEED.length); s.want = s.who; sfx.fail(); } }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#B8D86A'; g.fillRect(0, 0, w, h);
        slots.forEach((s, i) => {
          const b = slotBox(i); g.fillStyle = '#8CB84A'; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 18); g.fill();
          emoji(g, FEED[s.who].a, b.x + b.w / 2, b.y + b.h * 0.6 - s.hop * 12, Math.min(64, b.h * 0.45));
          g.fillStyle = '#fff'; g.beginPath(); g.roundRect(b.x + b.w - 56, b.y + 10, 46, 40, 14); g.fill(); emoji(g, FEED[s.want].f, b.x + b.w - 33, b.y + 30, 26);
          g.fillStyle = s.pat > 0.5 ? '#3DDC97' : s.pat > 0.25 ? '#FFB13D' : '#FF5A5F'; g.fillRect(b.x + 12, b.y + b.h - 14, (b.w - 24) * s.pat, 6);
        });
        // the food in hand
        g.fillStyle = '#FFF4D8'; g.beginPath(); g.arc(w / 2, h - 120, 52, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#C9A06A'; g.lineWidth = 4; g.stroke();
        emoji(g, FEED[food].f, w / 2, h - 120 + Math.sin(t * 4) * 3, 54);
        button(g, w / 2 - 70, h - 54, 140, 40, '#C9A06A', 'nobody wants it ↻', { font: '800 13px ui-rounded' });
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${'😠'.repeat(Math.min(5, angry))} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#3E7D3A', combo > 1 ? `🔥 ${combo}` : `🍽️ ${fed}`);
        intro(g, w, h, t, ['Feeding Time', 'Each animal shows what it wants.', 'Tap the animal that wants the food in your hand,', 'or toss it if nobody does.']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        if (inBox(p, { x: W / 2 - 70, y: H - 54, w: 140, h: 40 })) { const wanted = slots.some((s) => s.want === food); if (wanted) { score = Math.max(0, score - 3); combo = 0; } else score += 2; nextFood(); sfx.swish(); return; }
        const i = [0, 1, 2, 3].find((k) => inBox(p, slotBox(k))); if (i === undefined) return;
        const s = slots[i];
        if (s.want === food) {
          fed++; combo++; const pts = 6 + Math.round(s.pat * 8) + Math.min(10, combo) + Math.floor(level / 3); score += pts;
          const b = slotBox(i); pp.push({ x: b.x + b.w / 2, y: b.y + 20, t: `+${pts}`, life: 0.8, c: '#3E7D3A' }); burst(sp, b.x + b.w / 2, b.y + b.h / 2, ['#FF8AD8', '#FFE14D'], 10, 140); sfx.blip(Math.min(12, combo));
          s.hop = 1; s.pat = 1; s.who = Math.floor(r() * FEED.length); s.want = r() < 0.7 ? s.who : Math.floor(r() * FEED.length);
        } else { combo = 0; score = Math.max(0, score - 4); sfx.bonk(); pp.push({ x: p.x, y: p.y, t: 'yuck!', life: 0.7, c: '#FF5A5F' }); }
        nextFood();
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🏇 Barrel Race
// ======================================================================================================================
export function BarrelRace({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, x = W / 2, tx = W / 2, speed = 220, dist = 0, combo = 0, msg = '', msgT = 0, stun = 0;
    const barrels: { x: number; y: number; side: -1 | 1; done?: boolean }[] = [];
    let nextY = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const HY = () => H - 150;
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; stun = Math.max(0, stun - dt);
        speed = Math.min(420, 220 + dist / 30) * (stun > 0 ? 0.45 : 1);
        const dy = speed * dt; dist += dy; x += clamp(tx - x, -420 * dt, 420 * dt);
        nextY -= dy;
        while (nextY < H) { barrels.push({ x: 60 + r() * (W - 120), y: nextY - H * 0.3 + TOP, side: r() < 0.5 ? -1 : 1 }); nextY += Math.max(150, 230 - dist / 120); }
        for (const b of barrels) b.y += dy;
        for (const b of barrels) {
          if (b.done) continue;
          if (Math.hypot(b.x - x, b.y - HY()) < 30 && stun <= 0) { b.done = true; stun = 0.8; combo = 0; score = Math.max(0, score - 10); sfx.bonk(); pp.push({ x: b.x, y: b.y - 30, t: 'knocked it!', life: 0.8, c: '#FF5A5F' }); continue; }
          if (b.y > HY() + 4) {
            b.done = true;
            const ok = Math.sign(x - b.x) === b.side && Math.abs(x - b.x) < 150;
            if (ok) { combo++; const pts = 10 + Math.min(20, combo * 2) + Math.floor(level / 3); score += pts; sfx.blip(Math.min(12, combo)); pp.push({ x: b.x, y: b.y - 30, t: `+${pts}`, life: 0.7, c: '#FFE14D' }); }
            else { combo = 0; sfx.fail(); pp.push({ x: b.x, y: b.y - 30, t: 'wrong side', life: 0.7, c: '#FF8A8A' }); }
          }
        }
        for (let i = barrels.length - 1; i >= 0; i--) if (barrels[i].y > H + 60) barrels.splice(i, 1);
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#D9C08A'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < 30; i++) g.fillRect((i * 71) % w, ((i * 53 + dist) % (h + 20)) - 10, 3, 3);
        g.strokeStyle = '#FFFFFF'; g.lineWidth = 6; for (const s of [16, w - 16]) { g.beginPath(); g.moveTo(s, 0); g.lineTo(s, h); g.stroke(); }
        for (const b of barrels) {
          if (!b.done) { g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '900 22px ui-rounded'; g.textAlign = 'center'; g.fillText(b.side < 0 ? '◀◀' : '▶▶', b.x + b.side * 54, b.y + 6); }
          g.fillStyle = '#C8352C'; g.beginPath(); g.ellipse(b.x, b.y, 20, 22, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#7A1E18'; g.lineWidth = 3; g.stroke();
        }
        g.save(); g.translate(x, HY()); if (stun > 0 && Math.floor(t * 12) % 2) g.globalAlpha = 0.4; emoji(g, '🏇', 0, Math.sin(t * 16) * 3, 50); g.restore();
        msgDraw(g, w, TOP + 20, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#C8352C', combo > 1 ? `🔥 ${combo}` : `${Math.round(dist / 10)} m`);
        intro(g, w, h, t, ['Barrel Race', 'Drag to steer your horse.', 'Pass each barrel on the side its arrows show —', 'and don’t knock it over!']);
      },
      down(p: Ptr) { tx = p.x; }, move(p: Ptr) { tx = p.x; },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft') tx = x - 80; if (k === 'ArrowRight') tx = x + 80; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🤠 Lasso Toss
// ======================================================================================================================
export function LassoToss({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, aim: { x: number; y: number } | null = null, caught = 0, streak = 0, msg = '', msgT = 0;
    let loop: { x0: number; y0: number; x1: number; y1: number; t: number; T: number } | null = null;
    const calves: { x: number; y: number; vx: number; vy: number; e: string; gold?: boolean }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const me = () => ({ x: W / 2, y: H - 70 });
    const pen = () => ({ x: 20, y: TOP + 20, w: W - 40, h: H - TOP - 200 });
    const add = () => { const P = pen(), gold = r() < 0.12; calves.push({ x: P.x + r() * P.w, y: P.y + r() * P.h, vx: (r() - 0.5) * 220, vy: (r() - 0.5) * 160, e: gold ? '🐂' : r() < 0.5 ? '🐄' : '🐮', gold }); };
    for (let i = 0; i < 3; i++) add();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        const P = pen(), fast = 1 + (45 - time) / 60;
        for (const c of calves) { c.x += c.vx * dt * fast * (c.gold ? 1.5 : 1); c.y += c.vy * dt * fast * (c.gold ? 1.5 : 1); if (c.x < P.x + 16 || c.x > P.x + P.w - 16) c.vx *= -1; if (c.y < P.y + 16 || c.y > P.y + P.h - 16) c.vy *= -1; if (r() < dt * 0.6) { c.vx = (r() - 0.5) * 260; c.vy = (r() - 0.5) * 180; } c.x = clamp(c.x, P.x + 16, P.x + P.w - 16); c.y = clamp(c.y, P.y + 16, P.y + P.h - 16); }
        if (loop) { loop.t += dt; if (loop.t >= loop.T) {
          const L = loop; loop = null;
          const hit = calves.find((c) => Math.hypot(c.x - L.x1, c.y - L.y1) < 34);
          if (hit) { calves.splice(calves.indexOf(hit), 1); caught++; streak++; const pts = (hit.gold ? 60 : 20) + streak * 4 + Math.floor(level / 2) * 2; score += pts; pp.push({ x: L.x1, y: L.y1 - 30, t: `${hit.e} +${pts}`, life: 1, c: '#FFE14D' }); burst(sp, L.x1, L.y1, ['#C9A06A', '#FFE14D'], 16, 200); sfx.perfect(Math.min(12, streak)); msg = streak > 2 ? `Yee-haw ×${streak}!` : ''; msgT = 1; add(); if (calves.length < 3 + Math.floor(caught / 5)) add(); }
          else { streak = 0; sfx.bonk(); pp.push({ x: L.x1, y: L.y1 - 20, t: 'missed', life: 0.6, c: '#fff' }); }
        } }
        return time <= 0 && !loop;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#B8D86A'; g.fillRect(0, 0, w, h);
        const P = pen(); g.fillStyle = '#D9C08A'; g.fillRect(P.x, P.y, P.w, P.h); g.strokeStyle = '#FFFFFF'; g.lineWidth = 5; g.strokeRect(P.x, P.y, P.w, P.h);
        for (const c of calves) { g.save(); g.translate(c.x, c.y); if (c.vx > 0) g.scale(-1, 1); emoji(g, c.e, 0, Math.abs(Math.sin(t * 10 + c.x)) * -3, 36); g.restore(); if (c.gold) { g.strokeStyle = '#FFE14D'; g.lineWidth = 2; g.beginPath(); g.arc(c.x, c.y, 24, 0, Math.PI * 2); g.stroke(); } }
        const m = me(); emoji(g, '🤠', m.x, m.y, 44);
        if (aim && !loop) { g.setLineDash([6, 8]); g.strokeStyle = 'rgba(90,58,32,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(m.x, m.y - 20); g.lineTo(aim.x, aim.y); g.stroke(); g.setLineDash([]); g.strokeStyle = '#8B5A2B'; g.lineWidth = 3; g.beginPath(); g.ellipse(aim.x, aim.y, 26, 12, 0, 0, Math.PI * 2); g.stroke(); }
        if (loop) { const k = loop.t / loop.T, lx = loop.x0 + (loop.x1 - loop.x0) * k, ly = loop.y0 + (loop.y1 - loop.y0) * k - Math.sin(k * Math.PI) * 60; g.strokeStyle = '#8B5A2B'; g.lineWidth = 2; g.beginPath(); g.moveTo(m.x, m.y - 20); g.lineTo(lx, ly); g.stroke(); g.lineWidth = 4; g.beginPath(); g.ellipse(lx, ly, 18 + k * 10, 8 + k * 4, t * 10, 0, Math.PI * 2); g.stroke(); }
        else { g.strokeStyle = '#8B5A2B'; g.lineWidth = 3; g.beginPath(); g.ellipse(m.x + 18, m.y - 34, 18, 7, t * 8, 0, Math.PI * 2); g.stroke(); }
        msgDraw(g, w, h - 130, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#8B5A2B', caught ? `🤠 ${caught}` : '');
        intro(g, w, h, t, ['Lasso Toss', 'Touch where you want the loop to land,', 'let go to throw. It takes a moment to fly —', 'aim where the calf is going! 🐂 = big bonus']);
      },
      down(p: Ptr) { if (!loop && time > 0) aim = { x: p.x, y: Math.min(p.y, H - 160) }; },
      move(p: Ptr) { if (aim) aim = { x: p.x, y: Math.min(p.y, H - 160) }; },
      up() { if (aim && !loop) { const m = me(), d = Math.hypot(aim.x - m.x, aim.y - m.y); loop = { x0: m.x, y0: m.y - 20, x1: aim.x, y1: aim.y, t: 0, T: 0.25 + d / 900 }; sfx.swish(); } aim = null; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🌾 Haystack Hunt
// ======================================================================================================================
export function HaystackHunt({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const N = 6;
    let score = 0, time = 50, egg = 0, egg2 = -1, opened: Map<number, number> = new Map(), tries = 0, round = 0, found = 0, msg = '', msgT = 0, done = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const geo = () => { const cs = Math.min((W - 24) / N, (H - TOP - 90) / N); return { cs, ox: (W - cs * N) / 2, oy: TOP + 30 }; };
    const dist = (a: number, b: number) => Math.abs((a % N) - (b % N)) + Math.abs(Math.floor(a / N) - Math.floor(b / N));
    const deal = () => { round++; tries = 0; opened = new Map(); found = 0; done = 0; egg = Math.floor(r() * N * N); egg2 = round > 3 ? (egg + 7 + Math.floor(r() * 20)) % (N * N) : -1; };
    deal();
    const near = (i: number) => Math.min(dist(i, egg), egg2 >= 0 && found < 2 ? dist(i, egg2) : 99);
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; msgT -= dt; if (done > 0) { done -= dt; if (done <= 0) deal(); } return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#8CB84A'; g.fillRect(0, 0, w, h);
        const G = geo();
        for (let i = 0; i < N * N; i++) {
          const x = G.ox + (i % N + 0.5) * G.cs, y = G.oy + (Math.floor(i / N) + 0.5) * G.cs, o = opened.get(i);
          if (o === undefined) { g.fillStyle = '#E0B84A'; g.beginPath(); g.ellipse(x, y + 4, G.cs * 0.42, G.cs * 0.36, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#C99A3A'; g.lineWidth = 2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 6, y - G.cs * 0.25); g.lineTo(x + k * 8, y + G.cs * 0.3); g.stroke(); } }
          else if (o === 0) emoji(g, '🥚', x, y, G.cs * 0.6);
          else { const heat = clamp(1 - (o - 1) / 6, 0, 1); g.fillStyle = `hsl(${(1 - heat) * 210},80%,${50 + (1 - heat) * 10}%)`; g.beginPath(); g.arc(x, y, G.cs * 0.3, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `900 ${Math.round(G.cs * 0.3)}px ui-rounded`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${o}`, x, y); }
        }
        g.fillStyle = '#fff'; g.font = '800 13px ui-rounded'; g.textAlign = 'center'; g.fillText(egg2 >= 0 ? `Two golden eggs hide here! Found ${found}/2` : 'One golden egg is hidden. Numbers = steps away.', w / 2, G.oy - 12);
        msgDraw(g, w, h - 30, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#E0B84A', `🌾 tries ${tries}`);
        intro(g, w, h, t, ['Haystack Hunt', 'Tap a haystack to search it.', 'The number tells you how many steps', 'away the golden egg is. Fewer tries = more!']);
      },
      down(p: Ptr) {
        if (time <= 0 || done > 0) return;
        const G = geo(), cx = Math.floor((p.x - G.ox) / G.cs), cy = Math.floor((p.y - G.oy) / G.cs);
        if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
        const i = cy * N + cx; if (opened.has(i)) return;
        tries++;
        if (i === egg || i === egg2) {
          opened.set(i, 0); found++; const pts = Math.max(10, 70 - tries * 8) + Math.floor(level / 2) * 2; score += pts;
          burst(sp, G.ox + (cx + 0.5) * G.cs, G.oy + (cy + 0.5) * G.cs, ['#FFE14D', '#FFFFFF'], 20, 220); sfx.jackpot();
          const need = egg2 >= 0 ? 2 : 1;
          if (found >= need) { msg = `Golden egg! +${pts}`; msgT = 1.2; done = 1; } else { msg = `One down! +${pts}`; msgT = 1; }
        } else { opened.set(i, near(i)); sfx.tick(); }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🐑 Corral Count
// ======================================================================================================================
const HERD = ['🐑', '🐄', '🐐', '🐖', '🐓'];
export function CorralCount({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 55, round = 0, target = 0, count = 0, phase: 'run' | 'ask' | 'show' = 'run', runT = 0, queue: { e: number; at: number; y: number; v: number }[] = [], choices: number[] = [], msg = '', msgT = 0, showT = 0, streak = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => {
      round++; phase = 'run'; runT = 0; queue = [];
      const kinds = Math.min(5, 2 + Math.floor(round / 2)); target = Math.floor(r() * kinds); count = 0;
      const n = 6 + Math.min(10, round * 2); let at = 0.2;
      for (let i = 0; i < n; i++) { const e = r() < 0.4 ? target : Math.floor(r() * kinds); if (e === target) count++; queue.push({ e, at, y: TOP + 60 + r() * (H - TOP - 260), v: 260 + r() * 120 + round * 18 }); at += Math.max(0.18, 0.5 - round * 0.03) + r() * 0.25; }
      const opts = new Set([count]); while (opts.size < 4) opts.add(Math.max(0, count + Math.round((r() - 0.5) * 6))); choices = [...opts].sort((a, b) => a - b);
    };
    deal();
    const btns = () => choices.map((_, i) => { const bw = (W - 50) / 4; return { x: 15 + i * (bw + 7), y: H - 110, w: bw, h: 70 }; });
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (phase === 'run') { runT += dt; const last = queue[queue.length - 1]; if (runT > last.at + (W + 80) / last.v) phase = 'ask'; }
        if (phase === 'show') { showT -= dt; if (showT <= 0) deal(); }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#8CC653'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#C9A06A'; for (let i = 0; i < 5; i++) g.fillRect(0, TOP + 50 + i * ((h - TOP - 250) / 4), w, 4);
        if (phase === 'run') for (const q of queue) { const x = -40 + (runT - q.at) * q.v; if (x > -40 && x < w + 40) emoji(g, HERD[q.e], x, q.y + Math.abs(Math.sin((runT - q.at) * 14)) * -6, 40); }
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(w / 2 - 110, TOP + 4, 220, 40, 14); g.fill();
        g.fillStyle = '#fff'; g.font = '900 17px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`Count the ${HERD[target]}`, w / 2, TOP + 24);
        if (phase !== 'run') btns().forEach((b, i) => button(g, b.x, b.y, b.w, b.h, phase === 'show' ? (choices[i] === count ? '#3DDC97' : '#ffffff33') : '#8B5A2B', `${choices[i]}`, { font: '900 26px ui-rounded' }));
        if (phase === 'ask') { g.fillStyle = '#fff'; g.font = '900 22px ui-rounded'; g.fillText(`How many ${HERD[target]} ran past?`, w / 2, h - 150); }
        msgDraw(g, w, h / 2, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#8B5A2B', streak > 1 ? `🔥 ${streak}` : `Herd ${round}`);
        intro(g, w, h, t, ['Corral Count', 'Animals stampede past.', 'Count only the kind shown at the top,', 'then pick the right number.']);
      },
      down(p: Ptr) {
        if (phase !== 'ask' || time <= 0) return;
        const i = btns().findIndex((b) => inBox(p, b)); if (i < 0) return;
        if (choices[i] === count) { streak++; const pts = 15 + count * 3 + streak * 4 + Math.floor(level / 2) * 2; score += pts; msg = `Spot on! +${pts}`; sfx.win(4); burst(sp, W / 2, H / 2, ['#FFE14D', '#3DDC97'], 24, 240); }
        else { streak = 0; const off = Math.abs(choices[i] - count); score += off === 1 ? 5 : 0; msg = `It was ${count}`; sfx.fail(); }
        msgT = 1.2; phase = 'show'; showT = 1.2;
      },
    };
  }, onEnd, onScore);
}
