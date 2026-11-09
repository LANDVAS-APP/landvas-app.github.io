// Estate stand games, part 3 — the Skyport, the Steel Foundry and the Night Food Hall.
//   ☁️ Cloud Hop       bounce up from cloud to cloud — some puff away
//   📦 Cargo Drop      drop crates from the airship onto the moving pads
//   🧭 Wind Swipe      swipe the way the wind blows — not the way the arrow points
//   🕊️ Postbird        flap a letter through the cloud gates
//   🫗 Hot Pour        fill each mould to the line before the belt takes it
//   ⚙️ Gear Train      pick gears to make the last one spin at the target speed
//   🔨 Rivet Rush      hammer each rivet while it's glowing orange
//   🔥 Bellows         pump to keep the furnace in the moving heat band
//   🍜 Noodle Pull     pull up and down on the beat
//   🥟 Dumpling Pleat  pinch the pleats in order round the dumpling
//   🧋 Bubble Tea      build each order layer by layer
//   🌶️ Spice Pairs     match the spice jars from memory
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, useGame, type GameProps, type Ptr } from '../games';
import { INTRO, TOP, burst, button, clamp, hearts, hud, inBox, intro, pops, sparks, type Pop, type Spark } from './kit';

const msgDraw = (g: CanvasRenderingContext2D, w: number, y: number, msg: string, t: number, c = '#FFE14D') => { if (t <= 0) return; g.globalAlpha = Math.min(1, t); g.fillStyle = c; g.font = '900 22px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeText(msg, w / 2, y); g.fillText(msg, w / 2, y); g.globalAlpha = 1; };
const skyBg = (g: CanvasRenderingContext2D, w: number, h: number, a = '#5AB8F0', b = '#D8F0FF') => { const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, a); s.addColorStop(1, b); g.fillStyle = s; g.fillRect(0, 0, w, h); };
const cloud = (g: CanvasRenderingContext2D, x: number, y: number, w: number, a = 1) => { g.globalAlpha = a; g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(x, y, w / 2, w * 0.18, 0, 0, Math.PI * 2); g.ellipse(x - w * 0.18, y - w * 0.1, w * 0.2, w * 0.16, 0, 0, Math.PI * 2); g.ellipse(x + w * 0.12, y - w * 0.12, w * 0.22, w * 0.18, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };

// ======================================================================================================================
// ☁️ Cloud Hop
// ======================================================================================================================
export function CloudHop({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 50, x = W / 2, y = H - 160, vy = -560, vx = 0, tx = W / 2, cam = 0, height = 0, falls = 0, stars = 0;
    const clouds: { x: number; y: number; w: number; puff?: boolean; gone?: number; star?: boolean }[] = [];
    let top = H - 80;
    const pp: Pop[] = [], sp: Spark[] = [];
    const add = () => { top -= 70 + r() * 40 + Math.min(50, height / 400); clouds.push({ x: 50 + r() * (W - 100), y: top, w: 90 - Math.min(30, height / 200), puff: r() < Math.min(0.35, height / 4000), star: r() < 0.25 }); };
    clouds.push({ x: W / 2, y: H - 80, w: W }); for (let i = 0; i < 14; i++) add();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt;
        vx = clamp((tx - x) * 6, -420, 420); x += vx * dt; if (x < -20) x = W + 20; if (x > W + 20) x = -20;
        vy += 1150 * dt; const py = y; y += vy * dt;
        if (vy > 0) for (const c of clouds) { if (c.gone) continue; if (py <= c.y - 6 && y >= c.y - 6 && Math.abs(x - c.x) < c.w / 2) { y = c.y - 6; vy = -620; sfx.blip(4); if (c.puff) c.gone = 0.01; if (c.star) { c.star = false; stars++; score += 15; pp.push({ x: c.x, y: c.y - cam - 30, t: '⭐ +15', life: 0.8, c: '#FFE14D' }); } } }
        for (const c of clouds) if (c.gone) c.gone += dt;
        const want = y - H * 0.55; if (want < cam) cam = want;
        const h2 = Math.max(0, (H - 160 - y) / 10); if (h2 > height) { score += (h2 - height) * 0.6; height = h2; }
        while (top > cam - 200) add();
        for (let i = clouds.length - 1; i >= 0; i--) if (clouds[i].y > cam + H + 100) clouds.splice(i, 1);
        if (y > cam + H + 60) { falls++; score = Math.max(0, score - 20); sfx.fail(); const c = clouds.filter((k) => !k.gone && k.y > cam && k.y < cam + H).sort((a, b) => b.y - a.y)[0]; if (c) { x = c.x; y = c.y - 40; } else y = cam + H * 0.5; vy = -620; pp.push({ x: W / 2, y: H / 2, t: 'whoosh! −20', life: 1, c: '#fff' }); }
        return time <= 0 || falls >= 3;
      },
      draw(g, w, h, t) {
        skyBg(g, w, h, height > 600 ? '#1A2A6A' : '#5AB8F0', '#D8F0FF');
        for (const c of clouds) { const sy = c.y - cam; if (sy < -40 || sy > h + 40) continue; cloud(g, c.x, sy, c.w, c.gone ? Math.max(0, 1 - c.gone * 3) : c.puff ? 0.65 : 1); if (c.star) emoji(g, '⭐', c.x, sy - 26, 22); }
        g.save(); g.translate(x, y - cam); if (vx < -10) g.scale(-1, 1); emoji(g, '🐣', 0, -14, 34); g.restore();
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(3 - falls)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#22B8FF', `⬆ ${Math.round(height)} m`);
        intro(g, w, h, t, ['Cloud Hop', 'You bounce on your own.', 'Drag left and right to land on clouds.', 'See-through ones puff away! ⭐ = bonus']);
      },
      down(p: Ptr) { tx = p.x; }, move(p: Ptr) { tx = p.x; },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft') tx = x - 100; if (k === 'ArrowRight') tx = x + 100; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 📦 Cargo Drop
// ======================================================================================================================
export function CargoDrop({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, sx = W / 2, sv = 110, wind = 0, crates = 0, landed = 0, streak = 0, reload = 0;
    const pads: { x: number; v: number; w: number; bonus: boolean }[] = [];
    const drops: { x: number; y: number; vx: number; vy: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const SY = () => TOP + 40, GY = () => H - 80;
    for (let i = 0; i < 3; i++) pads.push({ x: (W / 4) * (i + 1), v: (40 + r() * 50) * (i % 2 ? 1 : -1), w: 70 - i * 10, bonus: i === 2 });
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; reload -= dt;
        sx += sv * dt; if (sx < 40 || sx > W - 40) sv *= -1;
        if (r() < dt * 0.3) wind = (r() - 0.5) * (60 + (45 - time) * 3);
        for (const p of pads) { p.x += p.v * dt; if (p.x < p.w / 2 + 10 || p.x > W - p.w / 2 - 10) p.v *= -1; }
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i]; d.vy += 600 * dt; d.vx += wind * dt; d.x += d.vx * dt; d.y += d.vy * dt;
          if (d.y >= GY() - 14) {
            drops.splice(i, 1);
            const pad = pads.find((p) => Math.abs(p.x - d.x) < p.w / 2);
            if (pad) { landed++; streak++; const c = 1 - Math.abs(pad.x - d.x) / (pad.w / 2), pts = Math.round((pad.bonus ? 25 : 12) * (0.6 + c)) + streak * 2 + Math.floor(level / 3); score += pts; pp.push({ x: d.x, y: GY() - 40, t: `+${pts}`, life: 0.8, c: '#FFE14D' }); burst(sp, d.x, GY() - 14, ['#C9A06A', '#FFE14D'], 12, 160); sfx.perfect(Math.min(12, streak)); }
            else { streak = 0; sfx.bonk(); burst(sp, d.x, GY(), ['#8B5A2B'], 8, 120); pp.push({ x: d.x, y: GY() - 30, t: 'splat', life: 0.6, c: '#fff' }); }
          }
        }
        return time <= 0 && !drops.length;
      },
      draw(g, w, h, t) {
        skyBg(g, w, h);
        cloud(g, (t * 20) % (w + 200) - 100, TOP + 120, 140, 0.8); cloud(g, w - ((t * 14) % (w + 200)) + 100, TOP + 200, 110, 0.8);
        g.fillStyle = '#5E9A36'; g.fillRect(0, GY(), w, h - GY());
        for (const p of pads) { g.fillStyle = p.bonus ? '#FFD23F' : '#C9A06A'; g.fillRect(p.x - p.w / 2, GY() - 10, p.w, 10); g.fillStyle = p.bonus ? '#B8963A' : '#8B6A44'; g.fillRect(p.x - p.w / 2 + 4, GY(), p.w - 8, 12); }
        // the airship
        g.save(); g.translate(sx, SY()); g.fillStyle = '#E8E4DC'; g.beginPath(); g.ellipse(0, 0, 60, 22, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#C8352C'; g.fillRect(-60, -3, 120, 6); g.fillStyle = '#8B5A2B'; g.fillRect(-18, 22, 36, 14); g.restore();
        for (const d of drops) emoji(g, '📦', d.x, d.y, 26);
        g.fillStyle = '#fff'; g.font = '800 13px ui-rounded'; g.textAlign = 'center'; g.fillText(`wind ${wind < -10 ? '◀'.repeat(Math.min(3, Math.ceil(-wind / 40))) : wind > 10 ? '▶'.repeat(Math.min(3, Math.ceil(wind / 40))) : '·'}`, w / 2, TOP + 12);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#C8352C', streak > 1 ? `🔥 ${streak}` : `📦 ${landed}/${crates}`);
        intro(g, w, h, t, ['Cargo Drop', 'Tap anywhere to drop a crate.', 'Land it on a moving pad — mind the wind!', 'The gold pad pays double.']);
      },
      down() { if (time <= 0 || reload > 0) return; drops.push({ x: sx, y: SY() + 30, vx: sv * 0.6, vy: 0 }); crates++; reload = 0.35; sfx.drop(); },
      key(k, d) { if (d && (k === ' ' || k === 'Enter')) this.down?.({ x: 0, y: 0, id: 0 }, W, H); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🧭 Wind Swipe
// ======================================================================================================================
const DIRS = [{ a: '↑', dx: 0, dy: -1 }, { a: '→', dx: 1, dy: 0 }, { a: '↓', dx: 0, dy: 1 }, { a: '←', dx: -1, dy: 0 }];
export function WindSwipe({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 40, dir = 0, flip = false, cardT = 0, limit = 2.2, streak = 0, start: { x: number; y: number } | null = null, flash = 0, flashOk = true, done = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => { dir = Math.floor(r() * 4); flip = done > 3 && r() < 0.45; cardT = 0; limit = Math.max(0.8, 2.2 - done * 0.04); };
    deal();
    const answer = (d: number) => {
      const want = flip ? (dir + 2) % 4 : dir; done++;
      if (d === want) { streak++; const pts = 6 + Math.round((1 - cardT / limit) * 8) + Math.min(12, streak) + Math.floor(level / 3); score += pts; flashOk = true; sfx.blip(Math.min(12, streak)); pp.push({ x: W / 2, y: H / 2 - 120, t: `+${pts}`, life: 0.6, c: '#3DDC97' }); }
      else { streak = 0; flashOk = false; time -= 1.5; sfx.bonk(); }
      flash = 0.25; deal();
    };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; cardT += dt; flash -= dt; if (cardT > limit) answer(-1); return time <= 0; },
      draw(g, w, h, t) {
        skyBg(g, w, h, '#3A7AC0', '#9ED8FF');
        if (flash > 0) { g.fillStyle = flashOk ? 'rgba(61,220,151,0.25)' : 'rgba(255,90,95,0.3)'; g.fillRect(0, 0, w, h); }
        const cx = w / 2, cy = TOP + (h - TOP) * 0.45, R = Math.min(w, h) * 0.28;
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = '800 14px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; ['N', 'E', 'S', 'W'].forEach((c, i) => g.fillText(c, cx + DIRS[i].dx * (R + 16), cy + DIRS[i].dy * (R + 16)));
        // the vane points where the wind comes FROM when it's a "from" card
        g.save(); g.translate(cx, cy); g.rotate(dir * Math.PI / 2 + Math.sin(t * 20) * 0.04);
        g.fillStyle = flip ? '#FFB020' : '#FFFFFF'; g.beginPath(); g.moveTo(0, -R * 0.75); g.lineTo(R * 0.18, -R * 0.2); g.lineTo(R * 0.06, -R * 0.2); g.lineTo(R * 0.06, R * 0.6); g.lineTo(-R * 0.06, R * 0.6); g.lineTo(-R * 0.06, -R * 0.2); g.lineTo(-R * 0.18, -R * 0.2); g.closePath(); g.fill();
        g.restore();
        g.fillStyle = '#fff'; g.font = '900 20px ui-rounded'; g.fillText(flip ? 'Wind blows FROM the arrow ↺' : 'Wind blows the arrow’s way', cx, cy + R + 50);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - 100, cy + R + 76, 200, 8); g.fillStyle = '#FFE14D'; g.fillRect(cx - 100, cy + R + 76, 200 * Math.max(0, 1 - cardT / limit), 8);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB020', streak > 2 ? `🔥 ${streak}` : `🧭 ${done}`);
        intro(g, w, h, t, ['Wind Swipe', 'Swipe the way the wind is blowing.', 'White vane: swipe where it points.', 'GOLD vane: the wind comes from it — swipe away!']);
      },
      down(p: Ptr) { start = { x: p.x, y: p.y }; },
      up(p: Ptr) { if (!start || time <= 0) return; const dx = p.x - start.x, dy = p.y - start.y; start = null; if (Math.hypot(dx, dy) < 30) return; answer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0); },
      key(k, d) { if (!d) return; const i = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].indexOf(k); if (i >= 0) answer(i); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🕊️ Postbird
// ======================================================================================================================
export function Postbird({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 50, y = H / 2, vy = 0, letters = 0, crashes = 0, inv = 0, nextX = W + 60, dist = 0;
    const gates: { x: number; gap: number; size: number; passed?: boolean; letter: boolean }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const BX = () => W * 0.28;
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; inv = Math.max(0, inv - dt);
        const speed = 150 + Math.min(130, dist / 40); dist += speed * dt;
        vy += 900 * dt; y += vy * dt;
        nextX -= speed * dt;
        if (nextX < W + 40) { const size = Math.max(130, 220 - dist / 40); gates.push({ x: W + 40, gap: TOP + 60 + size / 2 + r() * (H - TOP - 160 - size), size, letter: r() < 0.6 }); nextX = W + 40 + 200 + r() * 80; }
        for (const g of gates) g.x -= speed * dt;
        for (let i = gates.length - 1; i >= 0; i--) if (gates[i].x < -60) gates.splice(i, 1);
        const hitWall = y < TOP + 10 || y > H - 30;
        for (const g of gates) {
          if (Math.abs(g.x - BX()) < 28) { if ((y < g.gap - g.size / 2 + 12 || y > g.gap + g.size / 2 - 12) && inv <= 0) { crashes++; inv = 1.2; sfx.bonk(); burst(sp, BX(), y, ['#FFFFFF', '#D0D8E8'], 14, 160); } }
          if (!g.passed && g.x < BX() - 28) { g.passed = true; score += 8; if (g.letter) { letters++; score += 12 + Math.floor(level / 3); pp.push({ x: BX(), y: y - 30, t: '✉️ +20', life: 0.7, c: '#FFE14D' }); sfx.coin(); } else sfx.blip(3); }
        }
        if (hitWall) { y = clamp(y, TOP + 10, H - 30); vy = 0; if (inv <= 0) { crashes++; inv = 1.2; sfx.bonk(); } }
        return time <= 0 || crashes >= 3;
      },
      draw(g, w, h, t) {
        skyBg(g, w, h, '#FFB38A', '#FFE9D0');
        for (const gt of gates) { for (const [y0, y1] of [[TOP, gt.gap - gt.size / 2], [gt.gap + gt.size / 2, h]]) { g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(gt.x - 26, y0, 52, y1 - y0, 22); g.fill(); g.fillStyle = '#F0E8F8'; g.fillRect(gt.x - 26, y0 + (y1 > h - 1 ? 0 : (y1 - y0) - 10), 52, 10); } if (gt.letter && !gt.passed) emoji(g, '✉️', gt.x, gt.gap, 24); }
        g.save(); g.translate(BX(), y); g.rotate(clamp(vy / 900, -0.5, 0.7)); if (inv > 0 && Math.floor(t * 12) % 2) g.globalAlpha = 0.4; g.scale(-1, 1); emoji(g, '🕊️', 0, 0, 36); g.restore();
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(3 - crashes)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF8A2A', `✉️ ${letters}`);
        intro(g, w, h, t, ['Postbird', 'Tap to flap.', 'Fly through the gaps in the cloud walls', 'and grab the letters ✉️ on the way.']);
      },
      down() { if (time > 0) { vy = -330; sfx.swish(); } },
      key(k, d) { if (d && (k === ' ' || k === 'ArrowUp')) vy = -330; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🫗 Hot Pour
// ======================================================================================================================
export function HotPour({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, pouring = false, done = 0, perfect = 0;
    const moulds: { x: number; fill: number; line: number; w: number; scored?: boolean }[] = [];
    let nextX = -60;
    const pp: Pop[] = [], sp: Spark[] = [];
    const BY = () => H - 170, LX = () => W / 2;
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt;
        const v = 60 + Math.min(80, done * 4);
        nextX += v * dt; if (nextX > -60 + 150) { moulds.push({ x: -60, fill: 0, line: 0.45 + r() * 0.45, w: 60 + r() * 30 }); nextX = -60; }
        for (const m of moulds) {
          m.x += v * dt;
          if (pouring && Math.abs(m.x - LX()) < m.w / 2 - 6) { m.fill = Math.min(1.2, m.fill + dt * (0.55 + done * 0.01)); if (r() < 0.6) sp.push({ x: LX() + (r() - 0.5) * 8, y: BY() - 60 * m.fill, vx: (r() - 0.5) * 80, vy: -r() * 80, life: 0.3, c: '#FFB020', s: 2 }); }
          if (!m.scored && m.x > LX() + m.w / 2 + 4) {
            m.scored = true; if (m.fill === 0) continue; done++;
            const err = Math.abs(m.fill - m.line);
            if (m.fill > m.line + 0.12) { score = Math.max(0, score - 5); sfx.bonk(); pp.push({ x: m.x, y: BY() - 80, t: 'overflow!', life: 0.7, c: '#FF5A5F' }); }
            else { const pts = Math.round(Math.max(0, 20 - err * 120)) + (err < 0.04 ? 10 : 0) + Math.floor(level / 3); if (err < 0.04) perfect++; score += pts; sfx[err < 0.04 ? 'perfect' : 'blip'](6); pp.push({ x: m.x, y: BY() - 80, t: err < 0.04 ? `perfect +${pts}` : `+${pts}`, life: 0.7, c: '#FFE14D' }); }
          }
        }
        for (let i = moulds.length - 1; i >= 0; i--) if (moulds[i].x > W + 80) moulds.splice(i, 1);
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2A2A30'; g.fillRect(0, 0, w, h);
        // the crucible and its stream
        g.fillStyle = '#4A4A52'; g.beginPath(); g.moveTo(LX() - 50, TOP + 40); g.lineTo(LX() + 50, TOP + 40); g.lineTo(LX() + 30, TOP + 110); g.lineTo(LX() - 30, TOP + 110); g.closePath(); g.fill();
        g.fillStyle = '#FF8A2A'; g.fillRect(LX() - 40, TOP + 44, 80, 10);
        if (pouring) { const gr = g.createLinearGradient(0, TOP + 110, 0, BY()); gr.addColorStop(0, '#FFE14D'); gr.addColorStop(1, '#FF5A1F'); g.fillStyle = gr; g.fillRect(LX() - 5 + Math.sin(t * 30) * 1.5, TOP + 110, 10, BY() - TOP - 110); }
        // belt
        g.fillStyle = '#555'; g.fillRect(0, BY() + 6, w, 22); g.fillStyle = '#777'; for (let x = (t * 60) % 30; x < w; x += 30) g.fillRect(x, BY() + 10, 14, 4);
        for (const m of moulds) {
          const mh = 70; g.fillStyle = '#3A3A42'; g.fillRect(m.x - m.w / 2, BY() - mh, m.w, mh + 6); g.fillStyle = '#1A1A1E'; g.fillRect(m.x - m.w / 2 + 6, BY() - mh + 4, m.w - 12, mh - 4);
          const fh = (mh - 4) * Math.min(1, m.fill); const gr = g.createLinearGradient(0, BY() - fh, 0, BY()); gr.addColorStop(0, '#FFE14D'); gr.addColorStop(1, '#FF5A1F'); g.fillStyle = gr; g.fillRect(m.x - m.w / 2 + 6, BY() - fh, m.w - 12, fh);
          g.strokeStyle = '#3DDC97'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(m.x - m.w / 2, BY() - (mh - 4) * m.line); g.lineTo(m.x + m.w / 2, BY() - (mh - 4) * m.line); g.stroke(); g.setLineDash([]);
        }
        button(g, 30, h - 110, w - 60, 76, pouring ? '#FF5A1F' : '#8A4A2A', pouring ? 'POURING…' : 'HOLD TO POUR', { down: pouring, font: '900 20px ui-rounded' });
        sparks(sp, g, 1 / 60, 400); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF8A2A', perfect ? `✨ ${perfect}` : `🫗 ${done}`);
        intro(g, w, h, t, ['Hot Pour', 'Moulds ride the belt under the crucible.', 'HOLD to pour, let go at the green line.', 'Overflow and it’s scrap!']);
      },
      down() { pouring = true; }, up() { pouring = false; },
      key(k, d) { if (k === ' ' || k === 'Enter') pouring = d; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// ⚙️ Gear Train
// ======================================================================================================================
const TEETH = [8, 12, 16, 24, 32];
export function GearTrain({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, input = 16, slots: (number | null)[] = [null, null], target = 1, round = 0, solved = 0, spinT = 0, msg = '', msgT = 0, picks = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    // a train of gears: input drives slot 0, slot 0 drives slot 1 (on the same axle as the output); speed = in/a * b/c…
    const deal = () => {
      round++; picks = 0; slots = round > 3 ? [null, null, null] : [null, null];
      // build a target from a real solution so it's always solvable
      const sol = slots.map(() => TEETH[Math.floor(r() * TEETH.length)]); input = TEETH[1 + Math.floor(r() * 3)];
      target = speedOf(sol);
      if (Math.abs(target - 1) < 0.01) { sol[0] = TEETH[0]; target = speedOf(sol); }
    };
    function speedOf(s: (number | null)[]) { let v = 1, prev = input; for (const t2 of s) { if (t2 == null) return NaN; v *= prev / t2; prev = t2; } return Math.round(v * 100) / 100; }
    deal();
    const btns = () => TEETH.map((n, i) => { const bw = (W - 40) / TEETH.length; return { n, x: 15 + i * bw, y: H - 120, w: bw - 6, h: 64 }; });
    const gearR = (n: number) => 10 + n * 1.6;
    const drawGear = (g: CanvasRenderingContext2D, x: number, y: number, n: number, a: number, c: string) => { const R = gearR(n); g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = c; g.beginPath(); for (let k = 0; k < n * 2; k++) { const aa = (k / (n * 2)) * Math.PI * 2, rr = k % 2 ? R : R + 6; g.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } g.closePath(); g.fill(); g.fillStyle = '#2A2A30'; g.beginPath(); g.arc(0, 0, R * 0.3, 0, Math.PI * 2); g.fill(); g.restore(); };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; msgT -= dt; spinT += dt; if (spinT > 1.6 && slots.every((s) => s != null) && msgT <= 0) deal(); return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#1C160C'; g.fillRect(0, 0, w, h);
        const y = TOP + (h - TOP) * 0.36, all = [input, ...slots];
        let x = 40 + gearR(input), ang = t * 1.5, prev = input;
        const xs: number[] = [];
        all.forEach((n, i) => { const nn = n ?? 16; if (i) x += gearR(prev) + gearR(nn) + 8; xs.push(x); prev = nn; });
        const scale = Math.min(1, (w - 40) / (xs[xs.length - 1] + gearR(all[all.length - 1] ?? 16) + 20));
        g.save(); g.scale(scale, scale);
        all.forEach((n, i) => { if (n == null) { g.strokeStyle = 'rgba(245,184,61,0.5)'; g.setLineDash([6, 6]); g.lineWidth = 3; g.beginPath(); g.arc(xs[i], y / scale, gearR(16), 0, Math.PI * 2); g.stroke(); g.setLineDash([]); return; } const sp2 = speedOf(all.slice(1, i + 1)); drawGear(g, xs[i], y / scale, n, ang * (i ? (i % 2 ? -1 : 1) * (isNaN(sp2) ? 0 : sp2) : 1), i === 0 ? '#C0C4CC' : '#F5B83D'); g.fillStyle = '#fff'; g.font = '800 12px ui-rounded'; g.textAlign = 'center'; g.fillText(`${n}`, xs[i], y / scale + gearR(n) + 22); });
        g.restore();
        const now = speedOf(slots);
        g.fillStyle = '#fff'; g.font = '900 18px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(`Target speed: ×${target}`, w / 2, TOP + 24);
        g.font = '800 15px ui-rounded'; g.fillStyle = isNaN(now) ? 'rgba(255,255,255,0.6)' : Math.abs(now - target) < 0.01 ? '#3DDC97' : '#FF8A8A'; g.fillText(isNaN(now) ? 'Fill the empty slots…' : `Your speed: ×${now}`, w / 2, y + 100);
        g.font = '700 12px ui-rounded'; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText('Big gear after small = slower. Small after big = faster.', w / 2, y + 126);
        btns().forEach((b) => button(g, b.x, b.y, b.w, b.h, '#8A6A2A', `${b.n}`, { font: '900 20px ui-rounded' }));
        button(g, 15, h - 46, W - 30, 36, '#ffffff22', '↶ clear');
        msgDraw(g, w, h - 150, msg, msgT, '#3DDC97');
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#F5B83D', `⚙️ ${solved}`);
        intro(g, w, h, t, ['Gear Train', 'Tap gear sizes to fill the empty slots.', 'Make the last gear spin at the target speed.', 'Each gear’s speed = before ÷ its teeth.']);
      },
      down(p: Ptr) {
        if (time <= 0 || msgT > 0) return;
        if (inBox(p, { x: 15, y: H - 46, w: W - 30, h: 36 })) { slots = slots.map(() => null); sfx.tick(); return; }
        const b = btns().find((x) => inBox(p, x)); if (!b) return;
        const i = slots.indexOf(null); if (i < 0) return; slots[i] = b.n; picks++; sfx.tick();
        if (slots.every((s) => s != null)) {
          const now = speedOf(slots);
          if (Math.abs(now - target) < 0.01) { solved++; const pts = 25 + slots.length * 10 + Math.max(0, 15 - picks * 2) + Math.floor(level / 2) * 2; score += pts; msg = `Meshed! +${pts}`; msgT = 1.2; spinT = 0; sfx.jackpot(); burst(sp, W / 2, TOP + (H - TOP) * 0.36, ['#F5B83D', '#FFE14D'], 30, 260); }
          else { msg = 'Wrong speed — try again'; msgT = 0.8; sfx.bonk(); score = Math.max(0, score - 3); setTimeout(() => { slots = slots.map(() => null); }, 500); }
        }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔨 Rivet Rush
// ======================================================================================================================
export function RivetRush({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, spawnT = 0.4, set = 0, combo = 0, plates = 0, swing = 0;
    const rivets: { x: number; y: number; heat: number; done?: boolean; bad?: boolean }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    // heat: rises 0 → 1 (red → orange → white), then cools; strike in the orange window
    const colorOf = (h: number) => h < 0.45 ? `rgb(${120 + h * 200},${30 + h * 60},30)` : h < 0.75 ? '#FF8A2A' : h < 0.9 ? '#FFE9A8' : '#FFFFFF';
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; spawnT -= dt; swing = Math.max(0, swing - dt * 6);
        if (spawnT <= 0 && rivets.filter((x) => !x.done).length < 6) { rivets.push({ x: 50 + r() * (W - 100), y: TOP + 50 + r() * (H - TOP - 200), heat: 0 }); spawnT = Math.max(0.35, 0.9 - (45 - time) / 60); }
        for (const v of rivets) if (!v.done) { v.heat += dt * (0.35 + (45 - time) / 150); if (v.heat > 1.05) { v.done = true; v.bad = true; combo = 0; score = Math.max(0, score - 4); pp.push({ x: v.x, y: v.y - 20, t: 'burnt', life: 0.6, c: '#aaa' }); } }
        if (rivets.length > 30) rivets.splice(0, rivets.length - 30);
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#3A3A42'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#5A5A64'; g.fillRect(20, TOP + 20, w - 40, h - TOP - 150); g.strokeStyle = '#2A2A30'; g.lineWidth = 2; for (let x = 20; x < w - 20; x += 60) { g.beginPath(); g.moveTo(x, TOP + 20); g.lineTo(x, h - 130); g.stroke(); }
        for (const v of rivets) { if (v.done) { g.fillStyle = v.bad ? '#2A2A2A' : '#8A8A94'; g.beginPath(); g.arc(v.x, v.y, 10, 0, Math.PI * 2); g.fill(); continue; } g.shadowColor = colorOf(v.heat); g.shadowBlur = 14 * v.heat; g.fillStyle = colorOf(v.heat); g.beginPath(); g.arc(v.x, v.y, 14, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; }
        // the legend: when to strike
        const lx = 30, lw = w - 60, ly = h - 100;
        ['#A04020', '#FF8A2A', '#FFE9A8', '#FFFFFF'].forEach((c, i) => { g.fillStyle = c; g.fillRect(lx + (lw / 4) * i, ly, lw / 4, 16); });
        g.strokeStyle = '#3DDC97'; g.lineWidth = 3; g.strokeRect(lx + lw / 4, ly - 2, lw / 4, 20);
        g.fillStyle = '#fff'; g.font = '800 12px ui-rounded'; g.textAlign = 'center'; g.fillText('strike while ORANGE', w / 2, ly + 34);
        if (swing > 0) emoji(g, '🔨', w / 2, h - 40, 30);
        sparks(sp, g, 1 / 60, 500); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF8A2A', combo > 2 ? `🔥 ${combo}` : `🔩 ${set}`);
        intro(g, w, h, t, ['Rivet Rush', 'Rivets heat up: red → orange → white.', 'Tap each one while it’s ORANGE to set it.', 'Too early or too late and it cracks!']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const v = rivets.find((x) => !x.done && Math.hypot(x.x - p.x, x.y - p.y) < 30); if (!v) return;
        v.done = true; swing = 1;
        if (v.heat >= 0.45 && v.heat < 0.75) { set++; combo++; const sweet = Math.abs(v.heat - 0.6) < 0.06, pts = 8 + (sweet ? 6 : 0) + Math.min(10, combo) + Math.floor(level / 3); score += pts; sfx.perfect(Math.min(12, combo)); burst(sp, v.x, v.y, ['#FFE14D', '#FF8A2A', '#FFFFFF'], 14, 220); pp.push({ x: v.x, y: v.y - 22, t: sweet ? `clang! +${pts}` : `+${pts}`, life: 0.6, c: '#FFE14D' }); if (set % 12 === 0) { plates++; score += 30; pp.push({ x: W / 2, y: H / 2, t: 'Plate done! +30', life: 1.2, c: '#3DDC97' }); sfx.jackpot(); } }
        else { v.bad = true; combo = 0; score = Math.max(0, score - 5); sfx.bonk(); pp.push({ x: v.x, y: v.y - 22, t: v.heat < 0.45 ? 'too cold' : 'too hot', life: 0.6, c: '#FF8A8A' }); }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔥 Bellows
// ======================================================================================================================
export function Bellows({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, heat = 0.4, band = 0.55, bandW = 0.18, bandV = 0.05, pump = 0, inBand = 0, best = 0, ingots = 0, forge = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; pump = Math.max(0, pump - dt * 4);
        heat -= dt * (0.11 + (45 - time) / 600); heat = clamp(heat, 0, 1);
        band += bandV * dt; if (band < 0.25 || band > 0.85) bandV *= -1; if (r() < dt * 0.4) bandV = (r() - 0.5) * 0.16;
        bandW = Math.max(0.1, 0.2 - (45 - time) / 600);
        const ok = Math.abs(heat - band) < bandW / 2;
        if (ok) { inBand += dt; forge += dt; score += dt * (4 + Math.min(8, inBand)); best = Math.max(best, inBand); if (forge >= 6) { forge = 0; ingots++; score += 25 + Math.floor(level / 2) * 2; pp.push({ x: W / 2, y: H * 0.3, t: '🧱 Ingot! +25', life: 1.2, c: '#FFE14D' }); sfx.jackpot(); } }
        else { inBand = 0; if (heat > band + bandW / 2 + 0.15) forge = Math.max(0, forge - dt); }
        if (r() < heat * 0.5) sp.push({ x: W / 2 + (r() - 0.5) * 80, y: TOP + 230, vx: (r() - 0.5) * 60, vy: -80 - r() * 120 * heat, life: 0.5, c: heat > 0.7 ? '#FFE9A8' : '#FF8A2A', s: 2 + r() * 2 });
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#1A1210'; g.fillRect(0, 0, w, h);
        // the furnace mouth glows with the heat
        const cx = w / 2, cy = TOP + 250, gr = g.createRadialGradient(cx, cy, 10, cx, cy, 120); gr.addColorStop(0, heat > 0.75 ? '#FFFFFF' : '#FFE14D'); gr.addColorStop(0.4, `rgba(255,${Math.round(90 + heat * 120)},30,${0.4 + heat * 0.6})`); gr.addColorStop(1, 'rgba(60,20,10,0)');
        g.fillStyle = '#3A2A22'; g.beginPath(); g.roundRect(cx - 120, cy - 120, 240, 200, 30); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 110, Math.PI, 0); g.lineTo(cx + 110, cy + 60); g.lineTo(cx - 110, cy + 60); g.closePath(); g.fill();
        // the thermometer with its moving band
        const tx = w - 50, ty = TOP + 30, th = h - TOP - 200;
        g.fillStyle = '#2A2A30'; g.beginPath(); g.roundRect(tx - 14, ty, 28, th, 14); g.fill();
        g.fillStyle = 'rgba(61,220,151,0.45)'; g.fillRect(tx - 12, ty + th * (1 - band - bandW / 2), 24, th * bandW);
        g.fillStyle = heat > band + bandW / 2 ? '#FF5A5F' : '#FFB020'; g.fillRect(tx - 8, ty + th * (1 - heat), 16, th * heat);
        // the forge progress
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(30, TOP + 30, w - 120, 10); g.fillStyle = '#FFE14D'; g.fillRect(30, TOP + 30, (w - 120) * (forge / 6), 10);
        g.fillStyle = '#fff'; g.font = '800 12px ui-rounded'; g.textAlign = 'left'; g.fillText('forging the next ingot', 30, TOP + 56);
        // the bellows
        const bh = 60 - pump * 26; g.fillStyle = '#8B5A2B'; g.beginPath(); g.moveTo(cx - 90, h - 60); g.lineTo(cx + 60, h - 60 - bh / 2); g.lineTo(cx + 60, h - 60 + bh / 2); g.closePath(); g.fill(); g.fillStyle = '#5A3A20'; g.fillRect(cx + 60, h - 66, 50, 12);
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '900 16px ui-rounded'; g.textAlign = 'center'; g.fillText('TAP TO PUMP', cx - 20, h - 120);
        sparks(sp, g, 1 / 60, -60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB020', ingots ? `🧱 ${ingots}` : '');
        intro(g, w, h, t, ['Bellows', 'Tap anywhere to pump the bellows.', 'Keep the heat inside the green band', 'as it drifts. Hold it there to forge ingots!']);
      },
      down() { if (time > 0) { heat = Math.min(1, heat + 0.07); pump = 1; sfx.swish(); } },
      key(k, d) { if (d && k === ' ') { heat = Math.min(1, heat + 0.07); pump = 1; } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🍜 Noodle Pull
// ======================================================================================================================
export function NoodlePull({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, beat = 0.75, nextT = 1, combo = 0, strands = 1, stretch = 0, judge = '', judgeT = 0, start: { x: number; y: number } | null = null;
    const notes: { at: number; up: boolean; hit?: boolean }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    let clock = 0;
    const HX = () => W * 0.22;
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; clock += dt; judgeT -= dt; stretch = Math.max(0, stretch - dt * 2);
        while (nextT < clock + 3) { notes.push({ at: nextT, up: r() < 0.5 }); nextT += beat * (r() < 0.2 ? 0.5 : 1); beat = Math.max(0.42, 0.75 - clock / 200); }
        for (const n of notes) if (!n.hit && clock - n.at > 0.22) { n.hit = true; combo = 0; judge = 'miss'; judgeT = 0.5; }
        while (notes.length && notes[0].hit && clock - notes[0].at > 0.5) notes.shift();
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2A1A10'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) { g.fillStyle = '#FF5A5F'; g.globalAlpha = 0.6; g.beginPath(); g.arc((i + 0.5) * (w / 8), TOP + 20, 8, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
        // the lane: notes slide in from the right to the hit line
        const ly = TOP + 90; g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, ly - 30, w, 60);
        g.strokeStyle = '#FFE14D'; g.lineWidth = 3; g.beginPath(); g.arc(HX(), ly, 26, 0, Math.PI * 2); g.stroke();
        for (const n of notes) { if (n.hit) continue; const x = HX() + (n.at - clock) * 220; if (x > w + 30) continue; g.fillStyle = n.up ? '#FF8A2A' : '#22B8FF'; g.beginPath(); g.arc(x, ly, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = '900 22px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.up ? '↑' : '↓', x, ly + 1); }
        // the chef's hands and the dough
        const cy = TOP + (h - TOP) * 0.55, span = 60 + Math.min(120, strands * 4) + stretch * 40;
        g.strokeStyle = '#F5E6C8'; g.lineWidth = 2;
        for (let k = 0; k < Math.min(24, strands); k++) { g.beginPath(); g.moveTo(w / 2 - span, cy - 40 + k * 3); g.quadraticCurveTo(w / 2, cy + 40 + Math.sin(t * 4 + k) * 10 + stretch * 30, w / 2 + span, cy - 40 + k * 3); g.stroke(); }
        emoji(g, '🤲', w / 2 - span, cy - 40, 40); emoji(g, '🤲', w / 2 + span, cy - 40, 40);
        if (judgeT > 0) { g.globalAlpha = Math.min(1, judgeT * 2); g.fillStyle = judge === 'PERFECT' ? '#FFE14D' : judge === 'good' ? '#3DDC97' : '#FF8A8A'; g.font = '900 26px ui-rounded'; g.textAlign = 'center'; g.fillText(judge, w / 2, ly + 60); g.globalAlpha = 1; }
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '800 13px ui-rounded'; g.fillText('swipe ↑ or ↓ (or tap the top / bottom half)', w / 2, h - 30);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF8A2A', combo > 3 ? `🔥 ${combo}` : `🍜 ${strands} strands`);
        intro(g, w, h, t, ['Noodle Pull', 'Notes slide into the yellow ring.', 'Swipe UP for orange ↑, DOWN for blue ↓,', 'right on the beat. More combo = more noodles!']);
      },
      down(p: Ptr) { start = { x: p.x, y: p.y }; },
      up(p: Ptr) {
        if (!start || time <= 0) return; const dy = p.y - start.y; const up = Math.abs(dy) > 25 ? dy < 0 : start.y < H / 2; start = null;
        const n = notes.find((x) => !x.hit && Math.abs(x.at - clock) < 0.22); if (!n) { combo = 0; judge = 'early!'; judgeT = 0.4; return; }
        n.hit = true;
        if (n.up !== up) { combo = 0; judge = 'wrong way'; judgeT = 0.5; sfx.bonk(); return; }
        const off = Math.abs(n.at - clock), perfect = off < 0.07; combo++; strands = Math.min(128, strands * (combo % 4 === 0 ? 2 : 1) || 1);
        const pts = (perfect ? 8 : 5) + Math.min(12, Math.floor(combo / 2)) + Math.floor(level / 3); score += pts; stretch = 1;
        judge = perfect ? 'PERFECT' : 'good'; judgeT = 0.5; sfx[perfect ? 'perfect' : 'blip'](Math.min(12, combo));
      },
      key(k, d) { if (!d) return; if (k === 'ArrowUp' || k === 'ArrowDown') { start = { x: 0, y: k === 'ArrowUp' ? 100 : 0 }; this.up?.({ x: 0, y: k === 'ArrowUp' ? 0 : 100, id: 0 }); } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🥟 Dumpling Pleat
// ======================================================================================================================
export function DumplingPleat({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, n = 6, order: number[] = [], next = 0, made = 0, dT = 0, limit = 6, msg = '', msgT = 0, wobble = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const C = () => ({ x: W / 2, y: TOP + (H - TOP) * 0.45, R: Math.min(W, H - TOP) * 0.3 });
    const deal = () => { n = Math.min(12, 5 + Math.floor(made / 2)); const startAt = Math.floor(r() * n), dir = r() < 0.5 ? 1 : -1; order = Array.from({ length: n }, (_, i) => (startAt + dir * i + n * 2) % n); if (made > 5 && r() < 0.35) { const a = Math.floor(r() * (n - 1)) + 1; const b = Math.min(n - 1, a + 1); [order[a], order[b]] = [order[b], order[a]]; } next = 0; dT = 0; limit = Math.max(3, 6 - made * 0.15); };
    deal();
    const pt = (i: number) => { const c = C(), a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: c.x + Math.cos(a) * c.R, y: c.y + Math.sin(a) * c.R }; };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; dT += dt; msgT -= dt; wobble = Math.max(0, wobble - dt * 3);
        if (dT > limit && next < n) { msg = 'It went cold…'; msgT = 1; sfx.fail(); deal(); }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#3A2010'; g.fillRect(0, 0, w, h); g.fillStyle = '#5A3A20'; g.beginPath(); g.arc(w / 2, TOP + (h - TOP) * 0.45, Math.min(w, h - TOP) * 0.42, 0, Math.PI * 2); g.fill();
        const c = C(); g.save(); g.translate(c.x, c.y); g.rotate(Math.sin(wobble * 20) * 0.05);
        g.fillStyle = '#F5EEDC'; g.beginPath(); g.arc(0, 0, c.R * 0.95, 0, Math.PI * 2); g.fill(); g.fillStyle = '#E8C8A0'; g.beginPath(); g.arc(0, 0, c.R * 0.4, 0, Math.PI * 2); g.fill(); g.restore();
        for (let k = 0; k < next; k++) { const a = pt(order[k]); g.strokeStyle = '#D0B890'; g.lineWidth = 6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x + (a.x - c.x) * 0.55, c.y + (a.y - c.y) * 0.55); g.stroke(); }
        for (let i = 0; i < n; i++) { const p = pt(i), k = order.indexOf(i), done = k < next, isNext = k === next; g.fillStyle = done ? '#B89A6A' : isNext ? '#FFE14D' : 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(p.x, p.y, isNext ? 18 + Math.sin(t * 8) * 2 : 14, 0, Math.PI * 2); g.fill(); if (!done) { g.fillStyle = '#3A2010'; g.font = '900 13px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${k + 1}`, p.x, p.y); } }
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(w / 2 - 100, h - 70, 200, 10); g.fillStyle = '#FF8A2A'; g.fillRect(w / 2 - 100, h - 70, 200 * Math.max(0, 1 - dT / limit), 10);
        msgDraw(g, w, h - 110, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB13D', `🥟 ${made}`);
        intro(g, w, h, t, ['Dumpling Pleat', 'Pinch the pleats in number order,', 'round the edge of the dumpling.', 'Finish before it goes cold!']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const i = [...Array(n).keys()].find((k) => { const q = pt(k); return Math.hypot(q.x - p.x, q.y - p.y) < 28; }); if (i === undefined) return;
        if (i === order[next]) { next++; sfx.blip(next); if (next === n) { made++; const pts = n * 3 + Math.round((1 - dT / limit) * 20) + Math.floor(level / 2) * 2; score += pts; msg = `🥟 Perfect pleats! +${pts}`; msgT = 1; sfx.win(4); const c = C(); burst(sp, c.x, c.y, ['#F5EEDC', '#FFE14D'], 20, 200); deal(); } }
        else if (order.indexOf(i) >= next) { wobble = 1; score = Math.max(0, score - 3); sfx.bonk(); }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🧋 Bubble Tea
// ======================================================================================================================
const LAYERS = [{ e: '🫧', n: 'Boba', c: '#3A2010' }, { e: '🧊', n: 'Ice', c: '#DFF4FF' }, { e: '🍵', n: 'Green tea', c: '#9BC46A' }, { e: '🥛', n: 'Milk', c: '#F5F0E6' }, { e: '🍓', n: 'Berry', c: '#FF6F8E' }, { e: '🥭', n: 'Mango', c: '#FFB13D' }, { e: '🟫', n: 'Jelly', c: '#8B5A2B' }];
export function BubbleTea({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 50, order: number[] = [], cup: number[] = [], served = 0, oT = 0, msg = '', msgT = 0, streak = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => { const n = Math.min(5, 3 + Math.floor(served / 3)); order = Array.from({ length: n }, () => Math.floor(r() * LAYERS.length)); cup = []; oT = 0; };
    deal();
    const btns = () => LAYERS.map((_, i) => { const bw = (W - 40) / 4; return { x: 15 + (i % 4) * (bw + 3), y: H - 170 + Math.floor(i / 4) * 74, w: bw - 3, h: 66 }; });
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; oT += dt; msgT -= dt; return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#FFE0EE'; g.fillRect(0, 0, w, h);
        // the ticket
        g.fillStyle = '#fff'; g.beginPath(); g.roundRect(14, TOP + 10, 110, 40 + order.length * 30, 10); g.fill();
        g.fillStyle = '#B0306A'; g.font = '900 13px ui-rounded'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('ORDER ↓ top', 24, TOP + 26);
        [...order].reverse().forEach((l, i) => { emoji(g, LAYERS[l].e, 32, TOP + 50 + i * 30, 20); g.fillStyle = '#333'; g.font = '700 12px ui-rounded'; g.textAlign = 'left'; g.fillText(LAYERS[l].n, 48, TOP + 50 + i * 30); });
        // the cup, filled bottom-up
        const cx = w * 0.62, cw = 130, ch = 220, cy = TOP + 40;
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(cx - cw / 2, cy); g.lineTo(cx + cw / 2, cy); g.lineTo(cx + cw / 2 - 16, cy + ch); g.lineTo(cx - cw / 2 + 16, cy + ch); g.closePath(); g.fill();
        const lh = ch / Math.max(order.length, 1);
        cup.forEach((l, i) => { const y1 = cy + ch - i * lh, y0 = y1 - lh, inset = 16 * (1 - (y0 - cy) / ch); g.fillStyle = LAYERS[l].c; g.fillRect(cx - cw / 2 + inset + 2, y0, cw - inset * 2 - 4, lh); if (l === 0) for (let k = 0; k < 6; k++) { g.fillStyle = '#1A0A04'; g.beginPath(); g.arc(cx - cw / 2 + 26 + k * 16, y0 + lh / 2, 6, 0, Math.PI * 2); g.fill(); } });
        g.strokeStyle = '#B0306A'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - cw / 2, cy); g.lineTo(cx - cw / 2 + 16, cy + ch); g.lineTo(cx + cw / 2 - 16, cy + ch); g.lineTo(cx + cw / 2, cy); g.stroke();
        g.fillStyle = '#FF6FA8'; g.fillRect(cx + 20, cy - 50, 8, 80);
        btns().forEach((b, i) => button(g, b.x, b.y, b.w, b.h, '#FFFFFF', `${LAYERS[i].e}`, { text: '#000', font: '30px system-ui' }));
        msgDraw(g, w, cy + ch + 30, msg, msgT, '#B0306A');
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#B0306A', streak > 1 ? `🔥 ${streak}` : `🧋 ${served}`);
        intro(g, w, h, t, ['Bubble Tea', 'Build the drink from the bottom up:', 'tap the layers in the order on the ticket', '(bottom of the list first).']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const i = btns().findIndex((b) => inBox(p, b)); if (i < 0) return;
        const want = order[cup.length];
        if (i === want) { cup.push(i); sfx.blip(cup.length * 2); if (cup.length === order.length) { served++; streak++; const pts = order.length * 6 + Math.max(0, Math.round(20 - oT * 2)) + streak * 2 + Math.floor(level / 2) * 2; score += pts; msg = `Served! +${pts}`; msgT = 1; sfx.win(4); burst(sp, W * 0.62, TOP + 140, ['#FF6FA8', '#FFE14D', '#FFFFFF'], 20, 200); setTimeout(deal, 350); } }
        else { streak = 0; score = Math.max(0, score - 5); msg = 'Wrong layer — start again'; msgT = 0.9; sfx.bonk(); cup = []; }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🌶️ Spice Pairs
// ======================================================================================================================
const SPICES = ['🌶️', '🧄', '🧅', '🫚', '🌿', '🍋', '🫑', '🧂', '🥥', '⭐'];
export function SpicePairs({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 55, cards: { e: string; open: boolean; done: boolean }[] = [], first = -1, second = -1, flipT = 0, rounds = 0, misses = 0, combo = 0, cols = 4, rows = 3, peek = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => { rounds++; const pairs = Math.min(10, 4 + rounds * 2); cols = pairs > 6 ? 5 : 4; rows = Math.ceil((pairs * 2) / cols); const pick = [...SPICES].sort(() => r() - 0.5).slice(0, pairs); cards = [...pick, ...pick].sort(() => r() - 0.5).map((e) => ({ e, open: false, done: false })); first = second = -1; misses = 0; peek = 1.2; };
    deal();
    const geo = () => { const cs = Math.min((W - 20) / cols, (H - TOP - 60) / rows); return { cs, ox: (W - cs * cols) / 2, oy: TOP + 20 }; };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; peek -= dt;
        if (second >= 0) { flipT -= dt; if (flipT <= 0) { cards[first].open = cards[second].open = false; first = second = -1; } }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2A1A10'; g.fillRect(0, 0, w, h);
        const G = geo();
        cards.forEach((c, i) => {
          const x = G.ox + (i % cols) * G.cs + 4, y = G.oy + Math.floor(i / cols) * G.cs + 4, s = G.cs - 8;
          const show = c.open || c.done || peek > 0;
          g.fillStyle = c.done ? '#5A3A20' : show ? '#F5EEDC' : '#8B5A2B'; g.beginPath(); g.roundRect(x, y, s, s, 12); g.fill();
          if (show) emoji(g, c.e, x + s / 2, y + s / 2, s * 0.55); else { g.fillStyle = '#C9A06A'; g.beginPath(); g.roundRect(x + s * 0.3, y + s * 0.15, s * 0.4, s * 0.12, 4); g.fill(); }
          if (c.done) { g.globalAlpha = 0.5; g.fillStyle = '#000'; g.beginPath(); g.roundRect(x, y, s, s, 12); g.fill(); g.globalAlpha = 1; }
        });
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF8A2A', combo > 1 ? `🔥 ${combo}` : `🫙 ${rounds}`);
        intro(g, w, h, t, ['Spice Pairs', 'Flip two jars at a time.', 'Find the matching spices.', 'Clear the rack fast for a bonus!']);
      },
      down(p: Ptr) {
        if (time <= 0 || second >= 0 || peek > 0) return;
        const G = geo(), cx = Math.floor((p.x - G.ox) / G.cs), cy = Math.floor((p.y - G.oy) / G.cs);
        if (cx < 0 || cy < 0 || cx >= cols) return; const i = cy * cols + cx; const c = cards[i]; if (!c || c.done || c.open) return;
        c.open = true; sfx.tick();
        if (first < 0) { first = i; return; }
        if (cards[first].e === c.e) { cards[first].done = c.done = true; combo++; const pts = 10 + combo * 3 + Math.floor(level / 3); score += pts; sfx.perfect(Math.min(12, combo)); burst(sp, p.x, p.y, ['#FF8A2A', '#FFE14D'], 12, 160); first = -1; if (cards.every((k) => k.done)) { const b = Math.max(10, 50 - misses * 4); score += b; pp.push({ x: W / 2, y: H / 2, t: `Rack cleared! +${b}`, life: 1.2, c: '#FFE14D' }); sfx.jackpot(); setTimeout(deal, 600); } }
        else { second = i; flipT = 0.7; combo = 0; misses++; }
      },
    };
  }, onEnd, onScore);
}
