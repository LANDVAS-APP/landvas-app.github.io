// Estate minigames, part 1. Each is a different kind of skill:
//   🎯 Hue Hunter        (Grand Atelier)      colour sense — mix paint drops to match a swatch
//   🏮 Firefly Lantern   (Wildwood Reserve)   steering a flock — lead fireflies into jars, away from owls
//   🐕 Sheepdog Roundup  (Harvest Valley)     herding — sheep flee the dog; push them through the gate
//   📈 Market Maker      (Skyline Exchange)   timing — hold to buy, let go to sell, read the news
//   🎯 Pinball Wizard    (Neon Boardwalk)     physics — two flippers, bumpers, lit lanes and a multiplier
//   🔔 Crystal Echo      (Gemheart Caverns)   memory — play the crystals' tune back, longer and faster
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, useGame, type GameProps, type Ptr } from '../games';
import { INTRO, TOP, burst, button, clamp, hearts, hud, inBox, intro, pops, sparks, type Pop, type Spark } from './kit';

// ======================================================================================================================
// 🎯 Hue Hunter — mix paint to match the swatch
// ======================================================================================================================
const PAINTS: { id: string; name: string; rgb: [number, number, number] }[] = [
  { id: 'r', name: 'Red', rgb: [226, 40, 46] }, { id: 'y', name: 'Yellow', rgb: [255, 214, 0] }, { id: 'b', name: 'Blue', rgb: [24, 84, 210] },
  { id: 'w', name: 'White', rgb: [255, 255, 255] }, { id: 'k', name: 'Black', rgb: [24, 22, 28] },
];
/** paint mixing that behaves like paint: blue + yellow makes green (mixed in a subtractive-ish space) */
function mix(counts: number[]): [number, number, number] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return [235, 228, 214];
  // mix in "absorbance" space (log of reflectance) for pigment-like results, then back
  const out: number[] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let a = 0;
    counts.forEach((n, i) => { if (n) a += (n / total) * -Math.log(Math.max(0.02, PAINTS[i].rgb[c] / 255)); });
    out[c] = Math.round(255 * Math.exp(-a));
  }
  return out as [number, number, number];
}
const css = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** colour difference (roughly perceptual: weighted RGB) → 0..100 match */
function match(a: [number, number, number], b: [number, number, number]) {
  const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  const d = Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  return clamp(100 - d / 7.6, 0, 100);
}
export function HueHunter({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, combo = 0, round = 0, roundT = 0, flash = 0, flashC = '#fff', verdict = '';
    let counts = [0, 0, 0, 0, 0], target: [number, number, number] = [0, 0, 0], recipe: number[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    let pressed = -1, pressT = 0;
    const newTarget = () => {
      round++; roundT = 0; counts = [0, 0, 0, 0, 0];
      // a reachable colour: 2–4 paints, 1–3 drops each (harder colours as you go)
      const kinds = Math.min(4, 2 + Math.floor(round / 4));
      recipe = [0, 0, 0, 0, 0];
      const pick = [0, 1, 2, 3, 4].sort(() => r() - 0.5).slice(0, kinds);
      pick.forEach((i, k) => { recipe[i] = 1 + Math.floor(r() * (k === 0 ? 3 : 2)); });
      if (recipe[4] > 1) recipe[4] = 1; // a little black goes a long way
      target = mix(recipe);
    };
    newTarget();
    const layout = (w: number, h: number) => {
      const bw = Math.min(64, (w - 40) / 5 - 8), y = h - bw - 92;
      return { drops: PAINTS.map((_, i) => ({ x: w / 2 - (5 * (bw + 8) - 8) / 2 + i * (bw + 8), y, w: bw, h: bw })), wash: { x: 20, y: h - 74, w: (w - 52) / 2, h: 52 }, done: { x: 32 + (w - 52) / 2, y: h - 74, w: (w - 52) / 2, h: 52 } };
    };
    const submit = () => {
      if (!counts.some(Boolean)) return;
      const m = match(mix(counts), target), quick = clamp(1 - roundT / 12, 0, 1);
      let pts = 0;
      if (m >= 96) { combo++; pts = Math.round((90 + 40 * quick) * (1 + Math.min(combo, 8) * 0.12)); verdict = combo > 1 ? `PERFECT ×${combo}!` : 'PERFECT!'; flashC = '#FFE14D'; sfx.perfect(combo); burst(sp, W / 2, H * 0.3, ['#FFE14D', '#fff', css(target)], 28); }
      else if (m >= 88) { combo = Math.max(0, combo - 1); pts = Math.round(55 + 25 * quick); verdict = 'Great match'; flashC = '#3DDC97'; sfx.win(2); burst(sp, W / 2, H * 0.3, ['#3DDC97', css(target)], 14); }
      else if (m >= 75) { combo = 0; pts = Math.round(20 + 10 * quick); verdict = 'Close enough'; flashC = '#22B8FF'; sfx.blip(3); }
      else { combo = 0; verdict = 'Not quite…'; flashC = '#FF5A5F'; sfx.bonk(); }
      score += pts + Math.floor(level / 3) * (pts ? 1 : 0); flash = 0.7;
      if (pts) pp.push({ x: W / 2, y: H * 0.42, t: `+${pts}`, life: 1, c: flashC });
      newTarget();
    };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; roundT += dt; flash = Math.max(0, flash - dt); pressT = Math.max(0, pressT - dt); return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#2A2238'; g.fillRect(0, 0, w, h);
        // the studio wall and the easel
        g.fillStyle = '#3A3050'; for (let i = 0; i < 12; i++) g.fillRect(0, i * (h / 12), w, 1);
        const L = layout(w, h), sw = Math.min(w * 0.36, 170), sy = Math.max(TOP + 30, h * 0.14 + 64);
        // target swatch (left) and your mix (right), framed like two little paintings
        const mixed = mix(counts), m = counts.some(Boolean) ? match(mixed, target) : 0;
        for (const [k, col, label] of [[0, target, 'TARGET'], [1, mixed, 'YOUR MIX']] as const) {
          const x = w / 2 + (k ? 10 : -sw - 10);
          g.fillStyle = '#8B5A2B'; g.beginPath(); g.roundRect(x - 8, sy - 8, sw + 16, sw + 16, 10); g.fill();
          g.fillStyle = '#C9A04A'; g.beginPath(); g.roundRect(x - 4, sy - 4, sw + 8, sw + 8, 8); g.fill();
          g.fillStyle = css(col as [number, number, number]); g.fillRect(x, sy, sw, sw);
          if (k === 1 && !counts.some(Boolean)) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.font = '700 13px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText('tap paints ↓', x + sw / 2, sy + sw / 2); }
          g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '900 11px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + sw / 2, sy + sw + 20);
        }
        // live match meter
        const my = sy + sw + 40, mw = Math.min(w - 60, 340);
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect(w / 2 - mw / 2, my, mw, 16, 8); g.fill();
        const mc = m >= 96 ? '#FFE14D' : m >= 88 ? '#3DDC97' : m >= 75 ? '#22B8FF' : '#FF8A5A';
        g.fillStyle = mc; g.beginPath(); g.roundRect(w / 2 - mw / 2, my, Math.max(16, (mw * m) / 100), 16, 8); g.fill();
        g.fillStyle = '#fff'; g.font = '900 12px ui-rounded, system-ui'; g.fillText(`${Math.round(m)}% match`, w / 2, my + 8.5);
        // drops in the mix
        const dots = counts.flatMap((n, i) => Array(n).fill(i)); dots.slice(0, 14).forEach((i, k) => { g.fillStyle = css(PAINTS[i].rgb); g.beginPath(); g.arc(w / 2 - (Math.min(14, dots.length) - 1) * 9 + k * 18, my + 34, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5; g.stroke(); });
        // paint pots
        L.drops.forEach((b, i) => {
          const down = pressed === i && pressT > 0;
          g.fillStyle = '#1A1424'; g.beginPath(); g.roundRect(b.x, b.y + 6, b.w, b.h - 6, 12); g.fill();
          g.fillStyle = css(PAINTS[i].rgb); g.beginPath(); g.ellipse(b.x + b.w / 2, b.y + (down ? 12 : 8), b.w / 2 - 4, b.w / 4, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.font = '800 11px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(PAINTS[i].name, b.x + b.w / 2, b.y + b.h - 10);
          if (counts[i]) { g.fillStyle = '#FFE14D'; g.beginPath(); g.arc(b.x + b.w - 6, b.y + 6, 10, 0, Math.PI * 2); g.fill(); g.fillStyle = '#000'; g.font = '900 11px ui-rounded'; g.fillText(`${counts[i]}`, b.x + b.w - 6, b.y + 7); }
        });
        button(g, L.wash.x, L.wash.y, L.wash.w, L.wash.h, '#4A4560', '🫗 Wash');
        button(g, L.done.x, L.done.y, L.done.w, L.done.h, counts.some(Boolean) ? '#3DDC97' : '#2C5A46', '✓ Sign it', { text: counts.some(Boolean) ? '#06281A' : 'rgba(255,255,255,0.5)' });
        if (flash > 0) { g.globalAlpha = flash; g.fillStyle = flashC; g.font = '900 26px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(verdict, w / 2, sy - 22); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60, 22);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFE14D', combo > 1 ? `🔥 ×${combo}` : '');
        intro(g, w, h, t, ['Match the colour!', 'Tap paints to mix. Blue + yellow = green.', 'White lightens, black darkens.', 'Sign it when the meter is high.']);
      },
      down(p: Ptr, w: number, h: number) {
        const L = layout(w, h);
        const i = L.drops.findIndex((b) => inBox(p, b));
        if (i >= 0) { if (counts.reduce((a, b) => a + b, 0) < 12) { counts[i]++; pressed = i; pressT = 0.12; sfx.drop(); } return; }
        if (inBox(p, L.wash)) { counts = [0, 0, 0, 0, 0]; sfx.swish(); return; }
        if (inBox(p, L.done)) submit();
      },
      key(k, d) { if (!d) return; const i = 'rybwk'.indexOf(k.toLowerCase()); if (i >= 0) { counts[i]++; sfx.drop(); } else if (k === 'Enter' || k === ' ') submit(); else if (k === 'Backspace') counts = [0, 0, 0, 0, 0]; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🏮 Firefly Lantern — lead the fireflies home
// ======================================================================================================================
export function FireflyLantern({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, lx = W / 2, ly = H * 0.6, tx = lx, ty = ly, stun = 0, chain = 0, chainT = 0;
    type Fly = { x: number; y: number; vx: number; vy: number; follow: boolean; gold: boolean; ph: number; gone?: boolean };
    type Owl = { x: number; y: number; vx: number; vy: number; t: number; dive: boolean };
    const flies: Fly[] = [], owls: Owl[] = [], pp: Pop[] = [], sp: Spark[] = [];
    const jars = [{ x: 0.12, y: 0.86 }, { x: 0.88, y: 0.86 }, { x: 0.5, y: 0.2 }];
    const trees = Array.from({ length: 14 }, (_, i) => ({ x: (i / 13) * W + (r() - 0.5) * 30, h: 0.45 + r() * 0.35, w: 30 + r() * 26 }));
    const spawn = (gold = false) => flies.push({ x: r() * W, y: TOP + 10 + r() * (H - TOP - 100), vx: (r() - 0.5) * 40, vy: (r() - 0.5) * 40, follow: false, gold, ph: r() * 6 });
    for (let i = 0; i < 16; i++) spawn(i === 0);
    let owlT = 6, flyT = 1.2;
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false; // hold still while the how-to card is up
        time -= dt; stun = Math.max(0, stun - dt); chainT -= dt; if (chainT <= 0) chain = 0;
        // the lantern drifts toward your finger
        const k = stun > 0 ? 2 : 9; lx += (tx - lx) * Math.min(1, dt * k); ly += (ty - ly) * Math.min(1, dt * k);
        flyT -= dt; if (flyT <= 0 && flies.filter((f) => !f.gone).length < 22) { flyT = 1.1; spawn(r() < 0.08); }
        owlT -= dt;
        if (owlT <= 0) { owlT = Math.max(3.2, 7 - (60 - time) / 12); const left = r() < 0.5; owls.push({ x: left ? -40 : W + 40, y: TOP + r() * H * 0.25, vx: 0, vy: 0, t: 0, dive: false }); sfx.swish(); }
        const R = stun > 0 ? 0 : 120;
        for (const f of flies) {
          if (f.gone) continue;
          const dx = lx - f.x, dy = ly - f.y, d = Math.hypot(dx, dy);
          if (!f.follow && d < R) { f.follow = true; sfx.blip(f.gold ? 12 : 7); }
          if (f.follow && stun > 0) { f.follow = false; f.vx = (r() - 0.5) * 240; f.vy = (r() - 0.5) * 240; }
          if (f.follow) {
            // orbit the lantern loosely, like moths
            const a = Math.atan2(dy, dx) + Math.sin(t * 3 + f.ph) * 0.9, want = d > 46 ? 1 : -0.3;
            f.vx += (Math.cos(a) * 340 * want - f.vx) * Math.min(1, dt * 3); f.vy += (Math.sin(a) * 340 * want - f.vy) * Math.min(1, dt * 3);
          } else { f.vx += (r() - 0.5) * 90 * dt * 10; f.vy += (r() - 0.5) * 90 * dt * 10; f.vx *= 0.97; f.vy *= 0.97; }
          f.x = clamp(f.x + f.vx * dt, 10, W - 10); f.y = clamp(f.y + f.vy * dt, TOP, H - 10);
          for (const j of jars) {
            if (Math.hypot(f.x - j.x * W, f.y - j.y * H) < 34 && f.follow) {
              f.gone = true; chain++; chainT = 1.4;
              const pts = (f.gold ? 60 : 12) + Math.min(chain, 10) * 3 + Math.floor(level / 4);
              score += pts; pp.push({ x: j.x * W, y: j.y * H - 40, t: `+${pts}${chain > 2 ? ` ×${chain}` : ''}`, life: 0.9, c: f.gold ? '#FFE14D' : '#C7FF8A' });
              burst(sp, j.x * W, j.y * H, f.gold ? ['#FFE14D', '#fff'] : ['#C7FF8A', '#FFF8A0'], 10, 160); sfx.perfect(Math.min(chain, 12));
            }
          }
        }
        for (let i = flies.length - 1; i >= 0; i--) if (flies[i].gone) flies.splice(i, 1);
        for (const o of owls) {
          o.t += dt;
          // circle, then dive at the lantern
          if (!o.dive && o.t > 1.6) { o.dive = true; const a = Math.atan2(ly - o.y, lx - o.x); o.vx = Math.cos(a) * 420; o.vy = Math.sin(a) * 420; sfx.swish(); }
          if (!o.dive) { o.x += ((o.x < W / 2 ? 1 : -1) * 90) * dt; o.y += Math.sin(o.t * 4) * 30 * dt; }
          else { o.x += o.vx * dt; o.y += o.vy * dt; }
          for (const f of flies) if (!f.gone && Math.hypot(f.x - o.x, f.y - o.y) < 26) { f.gone = true; pp.push({ x: f.x, y: f.y, t: '🦉 gulp', life: 0.8, c: '#FF8A8A' }); }
          if (stun <= 0 && Math.hypot(lx - o.x, ly - o.y) < 34) { stun = 1.6; sfx.bonk(); score = Math.max(0, score - 20); pp.push({ x: lx, y: ly - 30, t: '−20 💨', life: 1, c: '#FF8A8A' }); }
        }
        for (let i = owls.length - 1; i >= 0; i--) { const o = owls[i]; if (o.t > 6 || o.x < -80 || o.x > W + 80 || o.y > H + 80) owls.splice(i, 1); }
        return time <= 0;
      },
      draw(g, w, h, t) {
        const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#060B1E'); sky.addColorStop(1, '#0F2A22'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
        g.fillStyle = '#F4F1D0'; g.beginPath(); g.arc(w * 0.78, h * 0.14, 26, 0, Math.PI * 2); g.fill();
        for (const tr of trees) { g.fillStyle = '#071510'; g.beginPath(); g.moveTo(tr.x - tr.w, h); g.lineTo(tr.x, h * (1 - tr.h)); g.lineTo(tr.x + tr.w, h); g.fill(); }
        // lantern light
        const lg = g.createRadialGradient(lx, ly, 4, lx, ly, stun > 0 ? 50 : 140); lg.addColorStop(0, stun > 0 ? 'rgba(255,200,120,0.25)' : 'rgba(255,214,120,0.45)'); lg.addColorStop(1, 'rgba(255,214,120,0)');
        g.fillStyle = lg; g.fillRect(0, 0, w, h);
        for (const j of jars) { const x = j.x * w, y = j.y * h; g.fillStyle = 'rgba(199,255,138,0.12)'; g.beginPath(); g.arc(x, y, 40 + Math.sin(t * 3) * 3, 0, Math.PI * 2); g.fill(); emoji(g, '🫙', x, y, 44); }
        for (const f of flies) {
          const b = 0.6 + 0.4 * Math.sin(t * 8 + f.ph), c = f.gold ? `rgba(255,225,77,${b})` : `rgba(199,255,138,${b})`;
          g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 14; g.beginPath(); g.arc(f.x, f.y, f.gold ? 5 : 3.2, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
        }
        for (const o of owls) emoji(g, '🦉', o.x, o.y, o.dive ? 44 : 38);
        g.save(); g.translate(lx, ly); if (stun > 0 && Math.floor(t * 14) % 2) g.globalAlpha = 0.4; emoji(g, '🏮', 0, 0, 40); g.restore();
        sparks(sp, g, 1 / 60, 40); pops(pp, g, 1 / 60);
        const n = flies.filter((f) => f.follow).length;
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#C7FF8A', n ? `✨ ${n} following` : '');
        intro(g, w, h, t, ['Lead the fireflies home', 'Drag the lantern — fireflies follow its light.', 'Fly them into a jar 🫙. Gold ones are worth 5×.', 'Owls 🦉 dive at your lantern — dodge!']);
      },
      down(p) { tx = p.x; ty = p.y; }, move(p) { tx = p.x; ty = clamp(p.y, TOP, 99999); },
      key(k, d) { if (!d) return; const s = 50; if (k === 'ArrowLeft' || k === 'a') tx -= s; if (k === 'ArrowRight' || k === 'd') tx += s; if (k === 'ArrowUp' || k === 'w') ty -= s; if (k === 'ArrowDown' || k === 's') ty += s; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🐕 Sheepdog Roundup — herd the flock into the pen
// ======================================================================================================================
export function SheepdogRoundup({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, dx = W * 0.2, dy = H * 0.6, tx = dx, ty = dy, wave = 0, waveMsg = 0, streak = 0;
    type Sheep = { x: number; y: number; vx: number; vy: number; black: boolean; penned: boolean; bleat: number };
    let sheep: Sheep[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const pen = () => ({ x: W - 110, y: H * 0.38, w: 96, h: H * 0.3 }); // gate on its left side
    const nextWave = () => {
      wave++; waveMsg = 1.6;
      const n = 4 + wave * 2;
      sheep = Array.from({ length: n }, (_, i) => ({ x: 40 + r() * (W * 0.55), y: TOP + 20 + r() * (H - TOP - 60), vx: 0, vy: 0, black: i === 0 && wave > 1, penned: false, bleat: r() * 3 }));
    };
    nextWave();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false; // hold still while the how-to card is up
        time -= dt; waveMsg = Math.max(0, waveMsg - dt);
        const sp0 = 330; const ddx = tx - dx, ddy = ty - dy, dd = Math.hypot(ddx, ddy);
        if (dd > 2) { const m = Math.min(dd, sp0 * dt); dx += (ddx / dd) * m; dy += (ddy / dd) * m; }
        const P = pen();
        for (const s of sheep) {
          if (s.penned) { s.x += (P.x + 20 + (sheep.indexOf(s) % 3) * 26 - s.x) * dt * 2; s.y += (P.y + 24 + Math.floor((sheep.indexOf(s) % 9) / 3) * (P.h / 3.4) - s.y) * dt * 2; continue; }
          let ax = 0, ay = 0;
          // flee the dog (black sheep are jumpy)
          const fx = s.x - dx, fy = s.y - dy, fd = Math.hypot(fx, fy), fr = s.black ? 170 : 130;
          if (fd < fr) { const f = (1 - fd / fr) * (s.black ? 1400 : 1000); ax += (fx / fd) * f; ay += (fy / fd) * f; }
          // stay with the flock, but not on top of each other
          let cx = 0, cy = 0, c = 0;
          for (const o of sheep) { if (o === s || o.penned) continue; const ox = o.x - s.x, oy = o.y - s.y, od = Math.hypot(ox, oy); if (od < 110) { cx += o.x; cy += o.y; c++; } if (od < 26 && od > 0) { ax -= (ox / od) * 300; ay -= (oy / od) * 300; } }
          if (c) { ax += (cx / c - s.x) * 1.2; ay += (cy / c - s.y) * 1.2; }
          s.vx = (s.vx + ax * dt) * 0.9; s.vy = (s.vy + ay * dt) * 0.9;
          const v = Math.hypot(s.vx, s.vy), mx = s.black ? 260 : 200; if (v > mx) { s.vx *= mx / v; s.vy *= mx / v; }
          let nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
          // fences: the pen's top, bottom and back walls; the whole left side is the open gate
          const wasIn = s.x >= P.x && s.y >= P.y && s.y <= P.y + P.h;
          if (!wasIn) {
            const overX = nx >= P.x - 4;
            if (overX && s.y < P.y && ny >= P.y - 4) ny = P.y - 5;            // can't climb in over the top fence
            if (overX && s.y > P.y + P.h && ny <= P.y + P.h + 4) ny = P.y + P.h + 5; // or under the bottom one
            if (s.x < P.x && nx >= P.x && (ny < P.y || ny > P.y + P.h)) nx = P.x - 5; // only through the gate
          }
          s.x = clamp(nx, 16, W - 16); s.y = clamp(ny, TOP, H - 16);
          s.bleat -= dt; if (s.bleat <= 0) s.bleat = 3 + r() * 5;
          if (s.x > P.x + 10 && s.y > P.y && s.y < P.y + P.h) {
            s.penned = true; streak++;
            const pts = (s.black ? 100 : 40) + Math.min(streak, 10) * 4 + Math.floor(level / 3);
            score += pts; pp.push({ x: s.x, y: s.y - 24, t: `+${pts}`, life: 0.9, c: s.black ? '#FFE14D' : '#fff' }); sfx.perfect(Math.min(streak, 12));
          }
        }
        if (sheep.every((s) => s.penned)) {
          const bonus = 60 + wave * 30; score += bonus; pp.push({ x: W / 2, y: H / 2, t: `Flock in! +${bonus}`, life: 1.4, c: '#FFE14D' });
          burst(sp, W - 60, H / 2, ['#FFE14D', '#fff', '#3DDC97'], 30); sfx.win(4); nextWave();
        }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#6FBF4A'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#7ACB55'; for (let i = 0; i < 40; i++) { const x = (i * 97) % w, y = 60 + ((i * 53) % (h - 60)); g.beginPath(); g.ellipse(x, y, 22, 7, 0, 0, Math.PI * 2); g.fill(); }
        const P = pen();
        g.fillStyle = '#C9A06A'; g.fillRect(P.x, P.y, P.w, P.h);
        g.strokeStyle = '#7A4E2D'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(P.x, P.y); g.lineTo(P.x + P.w, P.y); g.lineTo(P.x + P.w, P.y + P.h); g.lineTo(P.x, P.y + P.h); g.stroke();
        g.lineWidth = 4; for (const yy of [P.y, P.y + P.h]) { g.beginPath(); g.moveTo(P.x - 6, yy); g.lineTo(P.x - 6, yy + (yy === P.y ? -28 : 28)); g.stroke(); }
        g.fillStyle = '#FFE14D'; g.font = '900 12px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText('GATE ▶', P.x - 30, P.y + P.h / 2);
        // a dashed guide from the dog to the gate
        g.setLineDash([6, 8]); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(P.x - 10, P.y + P.h / 2); g.lineTo(P.x - 120, P.y + P.h / 2); g.stroke(); g.setLineDash([]);
        for (const s of sheep) {
          // the prize ram is skittish and worth more: it wears a golden glow
          if (s.black) { g.fillStyle = 'rgba(255,225,77,0.35)'; g.beginPath(); g.arc(s.x, s.y, 20 + Math.sin(t * 6) * 2, 0, Math.PI * 2); g.fill(); }
          emoji(g, s.black ? '🐏' : '🐑', s.x, s.y + Math.sin(t * 10 + s.x) * 1.5, s.black ? 34 : 30);
          if (!s.penned && s.bleat < 0.5) { g.fillStyle = '#fff'; g.font = '800 11px ui-rounded'; g.textAlign = 'center'; g.fillText('baa', s.x, s.y - 22); }
        }
        emoji(g, '🐕', dx, dy, 38);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFE14D', `🌀 Wave ${wave} · ${sheep.filter((s) => s.penned).length}/${sheep.length}`);
        if (waveMsg > 0 && wave > 1) { g.globalAlpha = Math.min(1, waveMsg); g.fillStyle = '#fff'; g.font = '900 28px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(`Wave ${wave}!`, w / 2, h * 0.3); g.globalAlpha = 1; }
        intro(g, w, h, t, ['Round up the flock!', 'Drag to move your sheepdog 🐕.', 'Sheep run from the dog — get behind them', 'and push them through the gate. 🐏 = big bonus.']);
      },
      down(p) { tx = p.x; ty = p.y; }, move(p) { tx = p.x; ty = p.y; },
      key(k, d) { if (!d) return; const s = 60; if (k === 'ArrowLeft' || k === 'a') tx -= s; if (k === 'ArrowRight' || k === 'd') tx += s; if (k === 'ArrowUp' || k === 'w') ty -= s; if (k === 'ArrowDown' || k === 's') ty += s; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 📈 Market Maker — hold to buy, let go to sell
// ======================================================================================================================
const NEWS: { t: string; drift: number }[] = [
  { t: '📰 Merger rumours!', drift: 40 }, { t: '🚀 Record earnings!', drift: 55 }, { t: '🐂 Bulls charge in!', drift: 35 }, { t: '🛰️ New product launch!', drift: 45 },
  { t: '📉 CEO resigns!', drift: -45 }, { t: '🐻 Bears on the prowl!', drift: -35 }, { t: '🔥 Factory fire!', drift: -50 }, { t: '⚖️ Lawsuit filed!', drift: -40 },
];
export function MarketMaker({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, price = 100, vel = 0, drift = 0, driftT = 0, holding = false, buyAt = 0, trades = 0, wins = 0, streak = 0;
    let news: { t: string; drift: number; in: number; life: number } | null = null, newsT = 4;
    const hist: number[] = Array(160).fill(100);
    const marks: { i: number; buy: boolean; p: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    let tick = 0;
    const sell = () => {
      if (!holding) return; holding = false; trades++;
      const gain = price - buyAt, pts = Math.round(gain * 6);
      marks.push({ i: hist.length - 1, buy: false, p: price });
      if (pts > 0) { wins++; streak++; const bonus = Math.round(pts * Math.min(streak, 6) * 0.1); score += pts + bonus; pp.push({ x: W - 70, y: H * 0.35, t: `+${pts + bonus}${streak > 1 ? ` 🔥${streak}` : ''}`, life: 1.1, c: '#3DDC97' }); sfx.tickets?.(Math.min(12, 2 + Math.floor(pts / 15))); burst(sp, W - 60, H * 0.4, ['#3DDC97', '#FFE14D'], 12); }
      else { streak = 0; score = Math.max(0, score + pts); pp.push({ x: W - 70, y: H * 0.35, t: `${pts}`, life: 1.1, c: '#FF5A5F' }); sfx.bonk(); }
    };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false; // hold still while the how-to card is up
        time -= dt; newsT -= dt; driftT -= dt; if (driftT <= 0) drift *= 0.5;
        // breaking news shows up a moment before the market reacts — read it and act
        if (newsT <= 0 && !news) { const n = NEWS[Math.floor(r() * NEWS.length)]; news = { ...n, in: 0.9, life: 3.4 }; newsT = 4 + r() * 3; sfx.blip(n.drift > 0 ? 9 : -3); }
        if (news) { news.in -= dt; news.life -= dt; if (news.in <= 0 && news.in > -dt * 1.5) { drift = news.drift * (1 + (60 - time) / 90); driftT = 2.2; } if (news.life <= 0) news = null; }
        tick += dt;
        while (tick > 1 / 30) {
          tick -= 1 / 30;
          // a jittery walk with momentum, pulled back toward 100 so it never runs away for good
          vel += ((r() - 0.5) * 9 + drift * 0.08 + (100 - price) * 0.02) * (1 / 30) * 30 * 0.06; vel *= 0.92;
          price = Math.max(20, price + vel);
          hist.push(price); hist.shift(); for (const m of marks) m.i--;
        }
        while (marks.length && marks[0].i < 0) marks.shift();
        return time <= 0 && (sell(), true);
      },
      draw(g, w, h, t) {
        g.fillStyle = '#0B1424'; g.fillRect(0, 0, w, h);
        const top = TOP + 50, bot = h - 130, lo = Math.min(...hist) - 6, hi = Math.max(...hist) + 6, X = (i: number) => (i / (hist.length - 1)) * (w - 80) + 20, Y = (p: number) => bot - ((p - lo) / (hi - lo)) * (bot - top);
        g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { const y = top + ((bot - top) * i) / 5; g.beginPath(); g.moveTo(20, y); g.lineTo(w - 60, y); g.stroke(); }
        if (holding) { g.fillStyle = price >= buyAt ? 'rgba(61,220,151,0.12)' : 'rgba(255,90,95,0.12)'; const yb = Y(buyAt); g.fillRect(20, Math.min(yb, Y(price)), w - 80, Math.abs(yb - Y(price))); g.setLineDash([5, 6]); g.strokeStyle = '#FFE14D'; g.beginPath(); g.moveTo(20, yb); g.lineTo(w - 60, yb); g.stroke(); g.setLineDash([]); }
        g.lineWidth = 3; g.strokeStyle = hist[hist.length - 1] >= hist[hist.length - 20] ? '#3DDC97' : '#FF5A5F'; g.beginPath(); hist.forEach((p, i) => (i ? g.lineTo(X(i), Y(p)) : g.moveTo(X(i), Y(p)))); g.stroke();
        for (const m of marks) emoji(g, m.buy ? '🟢' : '🔴', X(m.i), Y(m.p), 12);
        const px = X(hist.length - 1), py = Y(price);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1C2A44'; g.beginPath(); g.roundRect(w - 58, py - 13, 52, 26, 8); g.fill(); g.fillStyle = '#fff'; g.font = '800 13px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(price.toFixed(1), w - 32, py);
        if (news) { const a = Math.min(1, news.life * 2); g.globalAlpha = a; const up = news.drift > 0; g.fillStyle = up ? '#123D2A' : '#4A1620'; g.beginPath(); g.roundRect(w / 2 - 150, TOP + 2, 300, 40, 12); g.fill(); g.fillStyle = up ? '#3DDC97' : '#FF8A8A'; g.font = '900 16px ui-rounded'; g.fillText(news.t, w / 2, TOP + 22); g.globalAlpha = 1; }
        // the big button
        const bh = 70, by = h - bh - 26;
        button(g, 20, by, w - 40, bh, holding ? '#3DDC97' : '#2B3A5A', holding ? `HOLDING · ${price >= buyAt ? '+' : ''}${((price - buyAt) * 6).toFixed(0)} · let go to SELL` : 'HOLD TO BUY', { down: holding, text: holding ? '#06281A' : '#fff', font: '900 18px ui-rounded, system-ui' });
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60, 22);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#3DDC97', trades ? `✅ ${wins}/${trades}` : '');
        intro(g, w, h, t, ['Buy low, sell high', 'HOLD to buy. LET GO to sell.', 'Breaking news 📰 moves the market —', 'it shows up just before the price reacts.']);
      },
      down() { if (!holding) { holding = true; buyAt = price; marks.push({ i: hist.length - 1, buy: true, p: price }); sfx.tick(); } },
      up() { sell(); },
      key(k, d) { if (k === ' ' || k === 'Enter') { if (d && !holding) { holding = true; buyAt = price; marks.push({ i: hist.length - 1, buy: true, p: price }); sfx.tick(); } else if (!d) sell(); } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🎯 Pinball Wizard — flippers, bumpers, lanes
// ======================================================================================================================
type Seg = { ax: number; ay: number; bx: number; by: number; r: number };
export function PinballWizard({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 90, balls = 3, mult = 1, bx = 0, by = 0, vx = 0, vy = 0, live = false, wait = 3.6, msg = '', msgT = 0;
    const lanes = [false, false, false]; let laneFlash = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    // the table, in table units (0..1 wide, 0..1.6 tall), scaled to fit
    const TW = 1, TH = 1.6;
    const S = () => Math.min(W / TW, (H - TOP - 8) / TH) * 0.96;
    const OX = () => (W - TW * S()) / 2, OY = () => TOP;
    const P = (x: number, y: number) => ({ x: OX() + x * S(), y: OY() + y * S() });
    const BR = 0.022;
    const walls: Seg[] = [
      { ax: 0.04, ay: 0.2, bx: 0.04, by: 1.18, r: 0.01 }, { ax: 0.96, ay: 0.2, bx: 0.96, by: 1.18, r: 0.01 },
      { ax: 0.04, ay: 0.2, bx: 0.2, by: 0.04, r: 0.01 }, { ax: 0.96, ay: 0.2, bx: 0.8, by: 0.04, r: 0.01 }, { ax: 0.2, ay: 0.04, bx: 0.8, by: 0.04, r: 0.01 },
      { ax: 0.04, ay: 1.18, bx: 0.31, by: 1.38, r: 0.012 }, { ax: 0.96, ay: 1.18, bx: 0.69, by: 1.38, r: 0.012 },
      // slingshots above the flippers
      { ax: 0.14, ay: 1.02, bx: 0.24, by: 1.16, r: 0.012 }, { ax: 0.86, ay: 1.02, bx: 0.76, by: 1.16, r: 0.012 },
    ];
    const bumpers = [{ x: 0.35, y: 0.42, r: 0.055 }, { x: 0.65, y: 0.42, r: 0.055 }, { x: 0.5, y: 0.6, r: 0.06 }, { x: 0.22, y: 0.75, r: 0.04 }, { x: 0.78, y: 0.75, r: 0.04 }].map((b) => ({ ...b, hit: 0 }));
    const targets = [0.32, 0.5, 0.68].map((x) => ({ x, y: 0.16 }));
    const fl = [{ px: 0.31, py: 1.38, len: 0.15, dir: 1, ang: 0.45, up: false, w: 0 }, { px: 0.69, py: 1.38, len: 0.15, dir: -1, ang: 0.45, up: false, w: 0 }];
    const REST = 0.45, UP = -0.5;
    const flipSeg = (f: typeof fl[0]): Seg => ({ ax: f.px, ay: f.py, bx: f.px + Math.cos(f.ang) * f.len * f.dir, by: f.py + Math.sin(f.ang) * f.len, r: 0.016 });
    const launch = () => { bx = 0.5 + (r() - 0.5) * 0.3; by = 0.12; vx = (r() - 0.5) * 0.6; vy = 0.2; live = true; };
    // collide the ball with a capsule; surface velocity from a moving flipper
    const hitSeg = (s: Seg, svx = 0, svy = 0, bounce = 0.55) => {
      const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy, tt = clamp(((bx - s.ax) * dx + (by - s.ay) * dy) / l2, 0, 1);
      const cx = s.ax + dx * tt, cy = s.ay + dy * tt, ox = bx - cx, oy = by - cy, d = Math.hypot(ox, oy), min = BR + s.r;
      if (d >= min || d === 0) return false;
      const nx = ox / d, ny = oy / d; bx = cx + nx * min; by = cy + ny * min;
      const rvx = vx - svx, rvy = vy - svy, vn = rvx * nx + rvy * ny;
      if (vn < 0) { vx -= (1 + bounce) * vn * nx; vy -= (1 + bounce) * vn * ny; }
      return true;
    };
    return {
      score: () => score,
      update(dt) {
        time -= dt; msgT -= dt; laneFlash = Math.max(0, laneFlash - dt);
        if (!live) { wait -= dt; if (wait <= 0 && balls > 0) launch(); }
        for (const f of fl) { const want = f.up ? UP : REST, prev = f.ang; f.ang += clamp(want - f.ang, -dt * 22, dt * 22); f.w = (f.ang - prev) / dt; }
        for (const b of bumpers) b.hit = Math.max(0, b.hit - dt);
        if (live) {
          const N = 10, h = dt / N;
          for (let k = 0; k < N; k++) {
            vy += 1.25 * h; bx += vx * h; by += vy * h;
            for (const s of walls) hitSeg(s, 0, 0, s.ay > 1 && s.ay < 1.1 ? 1.1 : 0.5);
            for (const f of fl) {
              const s = flipSeg(f);
              // the flipper's speed where the ball touches it
              const along = clamp(Math.hypot(bx - f.px, by - f.py) / f.len, 0, 1), om = f.w;
              const tvx = -Math.sin(f.ang) * om * f.len * along * f.dir, tvy = Math.cos(f.ang) * om * f.len * along;
              if (hitSeg(s, tvx, tvy, 0.3)) { if (Math.abs(om) > 2) sfx.thud(); }
            }
            for (const b of bumpers) {
              const ox = bx - b.x, oy = by - b.y, d = Math.hypot(ox, oy);
              if (d < BR + b.r) {
                const nx = ox / d, ny = oy / d; bx = b.x + nx * (BR + b.r); by = b.y + ny * (BR + b.r);
                const vn = vx * nx + vy * ny; vx -= 2 * vn * nx; vy -= 2 * vn * ny; vx += nx * 0.55; vy += ny * 0.55;
                if (b.hit <= 0.05) { b.hit = 0.2; const pts = 25 * mult; score += pts; const q = P(b.x, b.y); pp.push({ x: q.x, y: q.y - 16, t: `+${pts}`, life: 0.6, c: '#00E5FF' }); burst(sp, q.x, q.y, ['#00E5FF', '#FF3D9A', '#fff'], 8, 180); sfx.blip(5 + (bumpers.indexOf(b) * 2)); }
              }
            }
            targets.forEach((tg, i) => {
              if (!lanes[i] && Math.hypot(bx - tg.x, by - tg.y) < BR + 0.03) {
                lanes[i] = true; score += 50 * mult; sfx.perfect(i * 3); const q = P(tg.x, tg.y); pp.push({ x: q.x, y: q.y + 20, t: `+${50 * mult}`, life: 0.7, c: '#FFE14D' });
                if (lanes.every(Boolean)) { mult = Math.min(6, mult + 1); lanes.fill(false); laneFlash = 1; msg = `MULTIPLIER ×${mult}!`; msgT = 1.6; sfx.jackpot(); burst(sp, W / 2, H * 0.25, ['#FFE14D', '#FF3D9A', '#00E5FF'], 40); }
              }
            });
            const sp2 = Math.hypot(vx, vy); if (sp2 > 3.2) { vx *= 3.2 / sp2; vy *= 3.2 / sp2; }
          }
          if (by > TH + 0.05) { live = false; balls--; wait = 1.2; mult = 1; msg = balls > 0 ? 'Ball lost!' : 'Last ball gone'; msgT = 1.3; sfx.fail(); }
        }
        return time <= 0 || (balls <= 0 && !live);
      },
      draw(g, w, h, t) {
        g.fillStyle = '#070718'; g.fillRect(0, 0, w, h);
        const s = S(), o = P(0, 0);
        const bg = g.createLinearGradient(0, o.y, 0, o.y + TH * s); bg.addColorStop(0, '#1B0F3A'); bg.addColorStop(1, '#0B2440');
        g.fillStyle = bg; g.beginPath(); g.moveTo(P(0.04, 0.2).x, P(0.04, 0.2).y); [[0.2, 0.04], [0.8, 0.04], [0.96, 0.2], [0.96, 1.18], [0.69, 1.38], [0.31, 1.38], [0.04, 1.18]].forEach(([x, y]) => g.lineTo(P(x, y).x, P(x, y).y)); g.closePath(); g.fill();
        // neon lines and arrows on the playfield
        g.globalAlpha = 0.25; g.strokeStyle = '#FF3D9A'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { const a = P(0.5, 0.9 + i * 0.05); g.beginPath(); g.moveTo(a.x - 16, a.y + 8); g.lineTo(a.x, a.y - 4); g.lineTo(a.x + 16, a.y + 8); g.stroke(); } g.globalAlpha = 1;
        g.lineCap = 'round';
        for (const sg of walls) { const a = P(sg.ax, sg.ay), b = P(sg.bx, sg.by); g.strokeStyle = sg.ay > 1 && sg.ay < 1.1 ? '#FFE14D' : '#00E5FF'; g.lineWidth = Math.max(3, sg.r * 2 * s); g.shadowColor = g.strokeStyle; g.shadowBlur = 10; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
        g.shadowBlur = 0;
        for (const b of bumpers) { const q = P(b.x, b.y); g.fillStyle = b.hit > 0 ? '#FFFFFF' : '#FF3D9A'; g.shadowColor = '#FF3D9A'; g.shadowBlur = b.hit > 0 ? 30 : 12; g.beginPath(); g.arc(q.x, q.y, b.r * s, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#2A0F3A'; g.beginPath(); g.arc(q.x, q.y, b.r * s * 0.55, 0, Math.PI * 2); g.fill(); emoji(g, '⭐', q.x, q.y + 1, b.r * s * 0.9); }
        targets.forEach((tg, i) => { const q = P(tg.x, tg.y); g.fillStyle = lanes[i] || laneFlash > 0 ? '#FFE14D' : '#3A3360'; g.shadowColor = '#FFE14D'; g.shadowBlur = lanes[i] ? 14 : 0; g.beginPath(); g.roundRect(q.x - 0.03 * s, q.y - 0.012 * s, 0.06 * s, 0.024 * s, 4); g.fill(); g.shadowBlur = 0; });
        for (const f of fl) { const sg = flipSeg(f), a = P(sg.ax, sg.ay), b = P(sg.bx, sg.by); g.strokeStyle = '#FFFFFF'; g.lineWidth = sg.r * 2 * s + 2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.strokeStyle = '#FF3D9A'; g.lineWidth = sg.r * 2 * s - 3; g.stroke(); }
        if (live) { const q = P(bx, by); const bg2 = g.createRadialGradient(q.x - 3, q.y - 3, 1, q.x, q.y, BR * s); bg2.addColorStop(0, '#FFFFFF'); bg2.addColorStop(1, '#9AA6C0'); g.fillStyle = bg2; g.beginPath(); g.arc(q.x, q.y, BR * s, 0, Math.PI * 2); g.fill(); }
        sparks(sp, g, 1 / 60, 0); pops(pp, g, 1 / 60);
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFE14D'; g.font = '900 26px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(msg, w / 2, h * 0.32); g.globalAlpha = 1; }
        hud(g, w, score, `${'🔵'.repeat(Math.max(0, balls))} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#00E5FF', mult > 1 ? `×${mult}` : '');
        intro(g, w, h, t, ['Pinball!', 'Tap the LEFT or RIGHT half to flip.', 'Light all three lanes at the top', 'to raise the multiplier.']);
      },
      down(p: Ptr, w: number) { if (p.x < w / 2) fl[0].up = true; else fl[1].up = true; },
      up(p: Ptr) { if (p.x < W / 2) fl[0].up = false; else fl[1].up = false; },
      key(k, d) { if (k === 'ArrowLeft' || k === 'a' || k === 'z') fl[0].up = d; if (k === 'ArrowRight' || k === 'd' || k === '/' || k === 'm') fl[1].up = d; if (k === ' ') { fl[0].up = d; fl[1].up = d; } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔔 Crystal Echo — play the tune back
// ======================================================================================================================
const CRYS = [{ c: '#B57BFF', n: 0 }, { c: '#22B8FF', n: 3 }, { c: '#3DDC97', n: 7 }, { c: '#FFE14D', n: 10 }, { c: '#FF5A7A', n: 12 }, { c: '#19D3C5', n: 15 }];
export function CrystalEcho({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 75, lives = 3, seq: number[] = [], step = 0, phase: 'show' | 'play' | 'pause' = 'pause', timer = 3.8, lit = -1, litT = 0, round = 0, wrong = -1, wrongT = 0, perfectRun = true;
    const pp: Pop[] = [], sp: Spark[] = [];
    const add = () => { let n = Math.floor(r() * 6); if (seq.length && n === seq[seq.length - 1] && r() < 0.6) n = (n + 1 + Math.floor(r() * 5)) % 6; seq.push(n); };
    for (let i = 0; i < 3; i++) add();
    const pos = (w: number, h: number) => CRYS.map((_, i) => { const a = -Math.PI / 2 + (i / 6) * Math.PI * 2, R = Math.min(w, h - 120) * 0.32; return { x: w / 2 + Math.cos(a) * R, y: h / 2 + 30 + Math.sin(a) * R, s: Math.min(w, h) * 0.085 }; });
    const ring = (i: number) => { lit = i; litT = 0.32; sfx.blip(CRYS[i].n); };
    const speed = () => Math.max(0.22, 0.6 - round * 0.035);
    return {
      score: () => score,
      update(dt) {
        time -= dt; litT -= dt; wrongT = Math.max(0, wrongT - dt); if (litT <= 0) lit = -1;
        if (phase === 'pause') { timer -= dt; if (timer <= 0) { phase = 'show'; step = 0; timer = 0.25; } }
        else if (phase === 'show') {
          timer -= dt;
          if (timer <= 0) { if (step < seq.length) { ring(seq[step]); step++; timer = speed(); } else { phase = 'play'; step = 0; timer = 0; perfectRun = true; } }
        }
        return time <= 0 || lives <= 0;
      },
      draw(g, w, h, t) {
        const bg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h)); bg.addColorStop(0, '#103A44'); bg.addColorStop(1, '#04121A'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { const x = (i * 131) % w, y = (i * 71) % h; g.fillStyle = `rgba(25,211,197,${0.08 + 0.08 * Math.sin(t * 2 + i)})`; g.fillRect(x, y, 2, 2); }
        const P = pos(w, h);
        P.forEach((p, i) => {
          const on = lit === i, bad = wrong === i && wrongT > 0, c = CRYS[i].c;
          g.save(); g.translate(p.x, p.y);
          if (on) { g.shadowColor = c; g.shadowBlur = 40; }
          g.fillStyle = bad ? '#FF2D2D' : on ? '#FFFFFF' : c; g.globalAlpha = on || bad ? 1 : 0.55;
          g.beginPath(); g.moveTo(0, -p.s * 1.25); g.lineTo(p.s * 0.7, -p.s * 0.2); g.lineTo(p.s * 0.45, p.s); g.lineTo(-p.s * 0.45, p.s); g.lineTo(-p.s * 0.7, -p.s * 0.2); g.closePath(); g.fill();
          g.globalAlpha = 0.6; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -p.s * 1.1); g.lineTo(p.s * 0.25, -p.s * 0.2); g.lineTo(0, p.s * 0.6); g.closePath(); g.fill();
          g.restore(); g.globalAlpha = 1; g.shadowBlur = 0;
        });
        // the middle: whose turn it is and how long the tune is
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(w / 2, h / 2 + 30, 46, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 13px ui-rounded, system-ui';
        g.fillText(phase === 'play' ? 'YOUR TURN' : 'LISTEN…', w / 2, h / 2 + 20); g.font = '900 20px ui-rounded, system-ui'; g.fillText(phase === 'play' ? `${step}/${seq.length}` : `${seq.length} notes`, w / 2, h / 2 + 44);
        sparks(sp, g, 1 / 60, 60); pops(pp, g, 1 / 60, 22);
        hud(g, w, score, `${hearts(lives)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#19D3C5', `Round ${round + 1}`);
        intro(g, w, h, t, ['Echo the crystals', 'Watch and listen to the tune…', 'then tap the crystals in the same order.', 'Every round adds a note and gets faster.']);
      },
      down(p: Ptr, w: number, h: number) {
        if (phase !== 'play') return;
        const P = pos(w, h); const i = P.findIndex((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.s * 1.15);
        if (i < 0) return;
        if (i === seq[step]) {
          ring(i); step++;
          if (step === seq.length) {
            const pts = seq.length * 18 + (perfectRun ? seq.length * 6 : 0) + Math.floor(level / 2) * 2;
            score += pts; round++; pp.push({ x: w / 2, y: h * 0.22, t: `+${pts}`, life: 1, c: '#19D3C5' }); burst(sp, w / 2, h / 2 + 30, CRYS.map((c) => c.c), 30, 260);
            setTimeout(() => sfx.win(4), 120);
            add(); if (round % 3 === 0) add(); phase = 'pause'; timer = 0.9;
          }
        } else {
          lives--; perfectRun = false; wrong = i; wrongT = 0.6; sfx.fail();
          pp.push({ x: P[i].x, y: P[i].y - 30, t: 'wrong note', life: 0.9, c: '#FF8A8A' });
          phase = 'pause'; timer = 1.1; // hear it again
        }
      },
      key(k, d) { if (!d || phase !== 'play') return; const i = '123456'.indexOf(k); if (i >= 0) { const P = pos(W, H); this.down?.({ x: P[i].x, y: P[i].y, id: 0 }, W, H); } },
    };
  }, onEnd, onScore);
}
