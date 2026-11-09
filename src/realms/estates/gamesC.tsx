// Domain minigames, part 1 (the 3x3 merge tier). New kinds of skill again:
//   ✴️ Constellation    (Starlight Museum)      one unbroken stroke through the stars, in order
//   🎣 Spirit Angler    (Spirit Lake Sanctuary) a tension meter — reel while the fish fights, never let it snap
//   🚜 Plough Run       (Harvest Kingdom)       cover the whole field, steer round rocks and cows
//   🛗 Lift Rush        (Megacorp Spire)        run a lift: pick people up, drop them on their floor
//   ⭕ Ring Toss        (Neon Galaxy Park)      slingshot aim with wind — ring the far bottles
//   🪛 Drill Dive       (World's Core)          steer a falling drill through the planet
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, useGame, type GameProps, type Ptr } from '../games';
import { INTRO, TOP, burst, button, clamp, hearts, hud, inBox, intro, pops, sparks, type Pop, type Spark } from './kit';

// ======================================================================================================================
// ✴️ Constellation — draw one line through the stars, in order
// ======================================================================================================================
export function Constellation({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, round = 0, stars: { x: number; y: number; hit: boolean }[] = [], next = 0, drawing = false, roundT = 0, msg = '', msgT = 0, perfectRuns = 0;
    let path: { x: number; y: number }[] = [];
    const done: { pts: { x: number; y: number }[]; life: number; hue: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const bg = Array.from({ length: 90 }, () => ({ x: r(), y: r(), s: r() * 1.6 + 0.4, p: r() * 6 }));
    const deal = () => {
      round++; roundT = 0; next = 0; path = [];
      const n = Math.min(10, 4 + round);
      stars = [];
      for (let i = 0; i < n; i++) {
        // spread out, but not too far from the last star (so a line can be drawn)
        let x = 0, y = 0, tries = 0;
        do { const prev = stars[stars.length - 1]; x = prev ? clamp(prev.x + (r() - 0.5) * W * 0.6, 40, W - 40) : 40 + r() * (W - 80); y = prev ? clamp(prev.y + (r() - 0.5) * H * 0.4, TOP + 50, H - 60) : TOP + 50 + r() * (H - TOP - 120); tries++; }
        while (tries < 40 && stars.some((s) => Math.hypot(s.x - x, s.y - y) < 70));
        stars.push({ x, y, hit: false });
      }
    };
    deal();
    const finish = (complete: boolean) => {
      drawing = false;
      const got = stars.filter((s) => s.hit).length;
      if (complete) {
        const quick = clamp(1 - roundT / (3 + stars.length * 0.9), 0, 1);
        const pts = stars.length * 14 + Math.round(60 * quick) + (round > 2 ? 20 : 0) + Math.floor(level / 3);
        perfectRuns++; score += pts; msg = quick > 0.5 ? 'BRILLIANT!' : 'Constellation!'; msgT = 1.3;
        pp.push({ x: W / 2, y: H * 0.3, t: `+${pts}`, life: 1.1, c: '#C3D0FF' }); sfx.win(4);
        stars.forEach((s) => burst(sp, s.x, s.y, ['#FFFFFF', '#C3D0FF', '#FFE14D'], 6, 160));
        done.push({ pts: stars.map((s) => ({ x: s.x, y: s.y })), life: 1.6, hue: (round * 47) % 360 });
        deal();
      } else {
        // a broken line: the same sky again (a little credit for a good try, none for a stray tap)
        const pts = got >= 3 ? got * 4 : 0; score += pts; perfectRuns = 0; path = [];
        msg = got ? `${got}/${stars.length} — the line broke, try again` : 'Start on star 1'; msgT = 1.2;
        if (pts) pp.push({ x: W / 2, y: H * 0.3, t: `+${pts}`, life: 0.9, c: '#8A9AE0' });
        if (got) sfx.bonk();
        for (const st of stars) st.hit = false; next = 0;
      }
    };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; roundT += dt; msgT -= dt; for (const d of done) d.life -= dt; return time <= 0; },
      draw(g, w, h, t) {
        const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#05061A'); sky.addColorStop(1, '#1A1450'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
        for (const s of bg) { g.globalAlpha = 0.3 + 0.4 * Math.sin(t * 2 + s.p); g.fillStyle = '#fff'; g.fillRect(s.x * w, s.y * h, s.s, s.s); } g.globalAlpha = 1;
        for (const d of done) { if (d.life <= 0) continue; g.globalAlpha = Math.min(1, d.life); g.strokeStyle = `hsl(${d.hue},90%,75%)`; g.lineWidth = 3; g.shadowColor = g.strokeStyle; g.shadowBlur = 16; g.beginPath(); d.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.shadowBlur = 0; g.globalAlpha = 1; }
        // the line you've drawn so far, and the links between the stars you've reached
        g.strokeStyle = 'rgba(195,208,255,0.35)'; g.lineWidth = 2; g.beginPath(); path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
        g.strokeStyle = '#FFE14D'; g.lineWidth = 3.5; g.shadowColor = '#FFE14D'; g.shadowBlur = 12; g.beginPath(); stars.filter((s) => s.hit).forEach((s, i) => (i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y))); g.stroke(); g.shadowBlur = 0;
        stars.forEach((s, i) => {
          const isNext = i === next;
          g.fillStyle = s.hit ? '#FFE14D' : isNext ? '#FFFFFF' : 'rgba(255,255,255,0.75)';
          g.shadowColor = s.hit ? '#FFE14D' : '#C3D0FF'; g.shadowBlur = isNext ? 20 + Math.sin(t * 6) * 8 : 10;
          g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 5 : 12; g.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr); } g.closePath(); g.fill(); g.shadowBlur = 0;
          g.fillStyle = '#C3D0FF'; g.font = '900 12px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${i + 1}`, s.x, s.y + 22);
        });
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFE14D'; g.font = '900 24px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(msg, w / 2, h - 40); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60, 40); pops(pp, g, 1 / 60, 22);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#C3D0FF', perfectRuns > 1 ? `✴️ ×${perfectRuns}` : `Sky ${round}`);
        intro(g, w, h, t, ['Draw the constellation', 'Put your finger on star 1 and,', 'without lifting it, pass through 2, 3, 4…', 'Lift too early and the line breaks.']);
      },
      down(p: Ptr) { if (time <= 0) return; drawing = true; path = [{ x: p.x, y: p.y }]; this.move?.(p); },
      move(p: Ptr) {
        if (!drawing) return;
        path.push({ x: p.x, y: p.y }); if (path.length > 400) path.shift();
        const s = stars[next];
        if (s && Math.hypot(s.x - p.x, s.y - p.y) < 26) { s.hit = true; next++; sfx.blip(next * 2); if (next === stars.length) finish(true); }
      },
      up() { if (drawing) finish(false); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🎣 Spirit Angler — keep the line's tension in the green
// ======================================================================================================================
const FISH = [{ e: '🐟', name: 'Silver fish', fight: 0.7, pts: 40 }, { e: '🐠', name: 'Glow fish', fight: 1, pts: 70 }, { e: '🐡', name: 'Puffer', fight: 1.2, pts: 90 }, { e: '🦈', name: 'Lake shark', fight: 1.6, pts: 160 }, { e: '🐋', name: 'Spirit whale', fight: 2.1, pts: 280 }];
export function SpiritAngler({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, reel = false, tension = 0.4, dist = 1, fish = FISH[0], pull = 0, surge = 0, phase: 'bite' | 'fight' = 'bite', biteT = 1.4, caught = 0, msg = '', msgT = 0, fx = W / 2, streak = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const hook = () => { const roll = r(), lv = Math.min(4, Math.floor(caught / 2)); fish = FISH[Math.min(4, Math.floor(roll * (2 + lv)))]; phase = 'fight'; dist = 1; tension = 0.45; pull = 0; fx = W * (0.25 + r() * 0.5); sfx.swish(); msg = `${fish.e} Hooked! ${fish.name}`; msgT = 1.4; };
    const lose = (why: string) => { phase = 'bite'; biteT = 1.6 + r(); streak = 0; msg = why; msgT = 1.4; sfx.fail(); };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (phase === 'bite') { biteT -= dt; if (biteT <= 0) hook(); return time <= 0; }
        // the fish fights in surges; reeling pulls it in but raises the tension
        surge -= dt; if (surge <= 0) { surge = 0.5 + r() * 1.3; pull = (0.25 + r() * 0.75) * fish.fight; }
        pull *= 1 - dt * 0.6;
        tension += ((reel ? 0.55 : -0.5) + pull * 0.55) * dt;
        tension = clamp(tension, 0, 1.2);
        dist += ((reel && tension < 1 ? -0.16 : 0.03) + pull * 0.05) * dt;
        fx += Math.sin(t * 3) * 60 * dt * fish.fight + (r() - 0.5) * 40 * dt;
        fx = clamp(fx, 40, W - 40);
        if (tension >= 1) { lose('💥 Snap! Too much tension'); return time <= 0; }
        if (dist >= 1.35) { lose('…it got away. Keep the line tighter'); return time <= 0; }
        if (dist <= 0) {
          caught++; streak++; const pts = fish.pts + streak * 10 + Math.floor(level / 2) * 2;
          score += pts; pp.push({ x: W / 2, y: H * 0.35, t: `${fish.e} +${pts}`, life: 1.3, c: '#9AE6FF' }); burst(sp, fx, H * 0.55, ['#9AE6FF', '#FFFFFF', '#3FA7D6'], 24, 260); sfx.win(4);
          msg = `Caught: ${fish.name}!`; msgT = 1.4; phase = 'bite'; biteT = 1 + r();
        }
        return time <= 0;
      },
      draw(g, w, h, t) {
        const sky = g.createLinearGradient(0, 0, 0, h * 0.4); sky.addColorStop(0, '#16244A'); sky.addColorStop(1, '#4A6FA5'); g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.4);
        const lake = g.createLinearGradient(0, h * 0.4, 0, h); lake.addColorStop(0, '#1E5A7A'); lake.addColorStop(1, '#06202E'); g.fillStyle = lake; g.fillRect(0, h * 0.4, w, h);
        g.fillStyle = '#F4F1D0'; g.beginPath(); g.arc(w * 0.8, h * 0.18, 22, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(w / 2 + Math.sin(t + i) * 40, h * (0.45 + i * 0.07), w * 0.3, 3, 0, 0, Math.PI * 2); g.stroke(); }
        // the rod and line out to the fish
        const rx = w / 2, ry = h - 60, depth = h * 0.45 + clamp(dist, 0, 1.3) * h * 0.3;
        g.strokeStyle = '#8B5A2B'; g.lineWidth = 5; g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 20, ry - 120); g.stroke();
        const tc = tension > 0.85 ? '#FF5A5F' : tension < 0.2 ? '#FFB13D' : '#CFF4FF';
        g.strokeStyle = tc; g.lineWidth = 1.5 + tension * 2; g.beginPath(); g.moveTo(rx - 20, ry - 120); g.quadraticCurveTo((rx + fx) / 2, (ry - 120 + depth) / 2 + (1 - tension) * 80, fx, depth); g.stroke();
        if (phase === 'fight') { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(fx, depth + 6, 26, 8, 0, 0, Math.PI * 2); g.fill(); emoji(g, fish.e, fx + Math.sin(t * 12) * 3 * pull, depth, 36 + fish.fight * 8); }
        else { emoji(g, '🔴', w / 2, h * 0.55 + Math.sin(t * 3) * 3, 16); if (biteT < 0.4) emoji(g, '💦', w / 2 + 12, h * 0.53, 18); }
        // the tension meter (right side): keep it in the green
        const mx = w - 40, my = TOP + 40, mh = h - TOP - 180;
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(mx - 14, my - 6, 28, mh + 12, 10); g.fill();
        g.fillStyle = 'rgba(61,220,151,0.35)'; g.fillRect(mx - 9, my + mh * (1 - 0.85), 18, mh * 0.65);
        g.fillStyle = 'rgba(255,90,95,0.45)'; g.fillRect(mx - 9, my, 18, mh * 0.15);
        g.fillStyle = tc; g.fillRect(mx - 9, my + mh * (1 - clamp(tension, 0, 1)), 18, 6);
        // distance to shore (left)
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(16, my - 6, 22, mh + 12, 10); g.fill();
        g.fillStyle = '#9AE6FF'; g.fillRect(21, my + mh * clamp(dist / 1.35, 0, 1), 12, 6); emoji(g, '🏝️', 27, my + mh + 20, 16);
        button(g, 60, h - 76, w - 120, 58, reel ? '#3FA7D6' : 'rgba(63,167,214,0.35)', phase === 'bite' ? 'waiting for a bite…' : reel ? 'REELING…' : 'HOLD TO REEL', { down: reel });
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#fff'; g.font = '900 20px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(msg, w / 2, TOP + 30); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60, 120); pops(pp, g, 1 / 60, 22);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#9AE6FF', caught ? `🎣 ${caught}${streak > 1 ? ` · 🔥${streak}` : ''}` : '');
        intro(g, w, h, t, ['Spirit Angler', 'HOLD to reel the fish in, LET GO to give line.', 'Keep the tension in the green —', 'red snaps the line, too slack and it escapes.']);
      },
      down() { reel = true; }, up() { reel = false; },
      key(k, d) { if (k === ' ' || k === 'Enter') reel = d; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🚜 Plough Run — cover the field
// ======================================================================================================================
export function PloughRun({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const C = 9, R = 12;
    let score = 0, time = 60, field = 0, x = 0, y = 0, a = -Math.PI / 2, ta = a, stun = 0, cells: number[] = [], rocks: { x: number; y: number; cow: boolean }[] = [], left = 0, msg = '', msgT = 0, combo = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const geo = () => { const cs = Math.min((W - 20) / C, (H - TOP - 30) / R); return { cs, ox: (W - cs * C) / 2, oy: TOP + 14 + (H - TOP - 30 - cs * R) / 2 }; };
    const deal = () => {
      field++; cells = Array(C * R).fill(0); rocks = [];
      const n = Math.min(10, 2 + field * 2);
      for (let i = 0; i < n; i++) { const cx = Math.floor(r() * C), cy = Math.floor(r() * (R - 2)); if (rocks.some((k) => k.x === cx && k.y === cy)) continue; rocks.push({ x: cx, y: cy, cow: r() < 0.35 }); cells[cy * C + cx] = 2; }
      left = cells.filter((c) => c === 0).length; const G = geo(); x = G.ox + G.cs * (C / 2); y = G.oy + G.cs * (R - 0.5); a = ta = -Math.PI / 2;
      msg = field > 1 ? `Field ${field}!` : ''; msgT = 1.2;
    };
    deal();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; stun = Math.max(0, stun - dt);
        const G = geo();
        // turn smoothly toward where you're steering
        let da = ta - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; a += clamp(da, -dt * 5, dt * 5);
        const sp0 = stun > 0 ? 0 : G.cs * (2.4 + field * 0.15);
        let nx = x + Math.cos(a) * sp0 * dt, ny = y + Math.sin(a) * sp0 * dt;
        if (nx < G.ox + 6 || nx > G.ox + G.cs * C - 6) { a = Math.PI - a; ta = a; nx = clamp(nx, G.ox + 6, G.ox + G.cs * C - 6); }
        if (ny < G.oy + 6 || ny > G.oy + G.cs * R - 6) { a = -a; ta = a; ny = clamp(ny, G.oy + 6, G.oy + G.cs * R - 6); }
        x = nx; y = ny;
        const cx = Math.floor((x - G.ox) / G.cs), cy = Math.floor((y - G.oy) / G.cs), i = cy * C + cx;
        if (cx >= 0 && cy >= 0 && cx < C && cy < R) {
          if (cells[i] === 0) { cells[i] = 1; left--; combo++; score += 4 + Math.floor(combo / 10); if (combo % 10 === 0) sfx.blip(Math.min(12, combo / 10)); }
          else if (cells[i] === 2 && stun <= 0) { const rk = rocks.find((k) => k.x === cx && k.y === cy)!; stun = 0.9; combo = 0; a += Math.PI; ta = a; score = Math.max(0, score - 15); sfx.bonk(); pp.push({ x, y: y - 20, t: rk.cow ? '🐄 moo!' : '🪨 clunk', life: 0.9, c: '#FF8A8A' }); }
        }
        if (left <= 0) { const bonus = 100 + field * 40 + Math.round(time); score += bonus; pp.push({ x: W / 2, y: H / 2, t: `Field ploughed! +${bonus}`, life: 1.5, c: '#FFE14D' }); burst(sp, W / 2, H / 2, ['#FFE14D', '#7DBB4A', '#C9A06A'], 40, 300); sfx.jackpot(); deal(); }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#5E9A36'; g.fillRect(0, 0, w, h);
        const G = geo();
        for (let cy = 0; cy < R; cy++) for (let cx = 0; cx < C; cx++) {
          const v = cells[cy * C + cx], px = G.ox + cx * G.cs, py = G.oy + cy * G.cs;
          g.fillStyle = v === 1 ? ((cx + cy) % 2 ? '#7A4E2D' : '#6B4426') : (cx + cy) % 2 ? '#8CC653' : '#7DBB4A'; g.fillRect(px, py, G.cs + 0.5, G.cs + 0.5);
          if (v === 1) { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(px + 2, py + (G.cs * k) / 3); g.lineTo(px + G.cs - 2, py + (G.cs * k) / 3); g.stroke(); } }
        }
        for (const k of rocks) emoji(g, k.cow ? '🐄' : '🪨', G.ox + (k.x + 0.5) * G.cs, G.oy + (k.y + 0.5) * G.cs + (k.cow ? Math.sin(t * 2 + k.x) * 1.5 : 0), G.cs * 0.8);
        g.save(); g.translate(x, y); if (stun > 0 && Math.floor(t * 14) % 2) g.globalAlpha = 0.4;
        // the emoji faces left: mirror it when heading right, and tilt it with the heading
        const right = Math.cos(a) > 0; g.scale(right ? -1 : 1, 1); g.rotate(right ? -a : a - Math.PI); emoji(g, '🚜', 0, 0, G.cs * 1.1); g.restore();
        // a little arrow showing where you're steering
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ta) * G.cs * 1.4, y + Math.sin(ta) * G.cs * 1.4); g.stroke();
        if (msgT > 0 && msg) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFE14D'; g.font = '900 26px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(msg, w / 2, h * 0.4); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60, 20);
        const total = cells.filter((c) => c !== 2).length;
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFE14D', `🌾 ${Math.round(((total - left) / Math.max(1, total)) * 100)}%`);
        intro(g, w, h, t, ['Plough the whole field!', 'Touch and drag to steer the tractor.', 'Cover every green patch before time runs out —', 'and steer clear of rocks and cows.']);
      },
      down(p: Ptr) { ta = Math.atan2(p.y - y, p.x - x); }, move(p: Ptr) { ta = Math.atan2(p.y - y, p.x - x); },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft' || k === 'a') ta = Math.PI; if (k === 'ArrowRight' || k === 'd') ta = 0; if (k === 'ArrowUp' || k === 'w') ta = -Math.PI / 2; if (k === 'ArrowDown' || k === 's') ta = Math.PI / 2; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🛗 Lift Rush — run the lift
// ======================================================================================================================
export function LiftRush({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const F = 6, CAP = 5, PEOPLE = ['🧑‍💼', '👩‍💼', '👨‍🔬', '👩‍🔧', '🧑‍🎨', '👨‍🍳', '👩‍⚕️', '🕵️'];
    type P = { e: string; to: number; wait: number; max: number };
    let score = 0, time = 60, carY = 0, target = 0, moving = false, doorT = 0, angry = 0, served = 0, spawnT = 0.8, streak = 0;
    const waiting: P[][] = Array.from({ length: F }, () => []);
    let riding: P[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const floorY = (f: number) => { const top = TOP + 20, bot = H - 30, fh = (bot - top) / F; return bot - fh * (f + 0.5); };
    const fh = () => (H - 30 - TOP - 20) / F;
    const shaftX = () => W * 0.18;
    const spawn = () => { const f = Math.floor(r() * F); let to = Math.floor(r() * F); if (to === f) to = (f + 1 + Math.floor(r() * (F - 1))) % F; if (waiting[f].length < 4) waiting[f].push({ e: PEOPLE[Math.floor(r() * PEOPLE.length)], to, wait: 0, max: Math.max(9, 16 - (60 - time) / 8) }); };
    for (let i = 0; i < 3; i++) spawn();
    const arrive = () => {
      const f = target;
      // drop off first, then pick up
      const off = riding.filter((p) => p.to === f);
      if (off.length) {
        riding = riding.filter((p) => p.to !== f);
        const bonus = off.length > 1 ? off.length * 12 : 0;
        for (const p of off) { served++; streak++; const tip = Math.round(20 + 30 * clamp(1 - p.wait / p.max, 0, 1)) + Math.floor(level / 3); score += tip; pp.push({ x: W * 0.55, y: floorY(f) - 10, t: `${p.e} +${tip}`, life: 1, c: '#2EC4B6' }); }
        if (bonus) { score += bonus; pp.push({ x: W * 0.55, y: floorY(f) - 34, t: `group drop +${bonus}`, life: 1.1, c: '#FFE14D' }); }
        sfx.tickets?.(Math.min(10, off.length * 3)); burst(sp, shaftX(), floorY(f), ['#2EC4B6', '#FFE14D'], 10);
      }
      while (riding.length < CAP && waiting[f].length) riding.push(waiting[f].shift()!);
      doorT = 0.45;
    };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; spawnT -= dt; doorT = Math.max(0, doorT - dt);
        if (spawnT <= 0) { spawn(); spawnT = Math.max(0.7, 1.8 - (60 - time) / 50); }
        if (moving) {
          const d = target - carY, s = 5.5 * dt;
          if (Math.abs(d) <= s) { carY = target; moving = false; arrive(); } else carY += Math.sign(d) * s;
        }
        for (const f of waiting) for (let i = f.length - 1; i >= 0; i--) { f[i].wait += dt; if (f[i].wait >= f[i].max) { f.splice(i, 1); angry++; streak = 0; score = Math.max(0, score - 15); sfx.fail(); } }
        for (const p of riding) p.wait += dt * 0.5;
        return time <= 0 || angry >= 5;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#0E2A33'; g.fillRect(0, 0, w, h);
        const sx = shaftX(), FH = fh();
        for (let f = 0; f < F; f++) {
          const y = floorY(f);
          g.fillStyle = f % 2 ? '#163A45' : '#1A4450'; g.fillRect(0, y - FH / 2, w, FH);
          g.fillStyle = '#2EC4B6'; g.fillRect(sx + 30, y + FH / 2 - 3, w - sx - 40, 3);
          g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '900 13px ui-rounded, system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(`${f + 1}F`, 8, y);
          waiting[f].forEach((p, i) => { const px = sx + 54 + i * 44; emoji(g, p.e, px, y + 4, 26); g.fillStyle = '#fff'; g.beginPath(); g.roundRect(px - 11, y - FH / 2 + 4, 22, 16, 6); g.fill(); g.fillStyle = '#0E2A33'; g.font = '900 11px ui-rounded'; g.textAlign = 'center'; g.fillText(`${p.to + 1}`, px, y - FH / 2 + 12.5); const pf = 1 - p.wait / p.max; g.fillStyle = pf > 0.5 ? '#3DDC97' : pf > 0.25 ? '#FFB13D' : '#FF5A5F'; g.fillRect(px - 14, y + FH / 2 - 9, 28 * pf, 3); });
        }
        // the shaft and the lift car
        g.fillStyle = '#081C22'; g.fillRect(sx - 30, TOP + 20, 60, h - TOP - 50);
        const cy = floorY(0) - (floorY(0) - floorY(F - 1)) * (carY / (F - 1));
        g.fillStyle = '#C0C4CC'; g.fillRect(sx - 1, TOP + 20, 2, cy - FH / 2 - TOP - 20);
        g.fillStyle = '#E8E4DC'; g.beginPath(); g.roundRect(sx - 28, cy - FH / 2 + 2, 56, FH - 4, 6); g.fill();
        const open = doorT > 0 ? 1 : 0;
        g.fillStyle = '#9AA0B0'; g.fillRect(sx - 26, cy - FH / 2 + 4, 26 - open * 20, FH - 8); g.fillRect(sx + open * 20, cy - FH / 2 + 4, 26 - open * 20, FH - 8);
        riding.forEach((p, i) => { g.fillStyle = '#2EC4B6'; g.beginPath(); g.arc(sx - 18 + (i % 3) * 18, cy - 6 + Math.floor(i / 3) * 16, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#0E2A33'; g.font = '900 10px ui-rounded'; g.textAlign = 'center'; g.fillText(`${p.to + 1}`, sx - 18 + (i % 3) * 18, cy - 5.5 + Math.floor(i / 3) * 16); });
        g.fillStyle = '#FFE14D'; g.font = '800 11px ui-rounded'; g.textAlign = 'center'; g.fillText(`${riding.length}/${CAP}`, sx, cy + FH / 2 - 10);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60, 16);
        hud(g, w, score, `${'😤'.repeat(angry)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#2EC4B6', served ? `🛗 ${served}${streak > 2 ? ` · 🔥${streak}` : ''}` : '');
        intro(g, w, h, t, ['Lift Rush', 'Tap a floor to send the lift there.', 'People get in, and get out on the floor', 'on their badge. Don’t keep them waiting!']);
      },
      down(p: Ptr, w: number, h: number) {
        if (p.y < TOP + 20) return;
        const FH = (h - 30 - TOP - 20) / F, f = clamp(Math.floor((h - 30 - p.y) / FH), 0, F - 1);
        target = f; if (f === carY && !moving) arrive(); else moving = true; sfx.tick();
      },
      key(k, d) { if (!d) return; const n = Number(k); if (n >= 1 && n <= F) { target = n - 1; moving = true; } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// ⭕ Ring Toss — slingshot rings onto bottles
// ======================================================================================================================
export function RingToss({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, wind = 0, aiming: { x: number; y: number } | null = null, flying: { t: number; T: number; x0: number; y0: number; x1: number; y1: number; peak: number } | null = null;
    let row3 = 0, rings = 0, ringers = 0, msg = '', msgT = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    type B = { x: number; y: number; row: number; ringed: number };
    let bottles: B[] = [];
    const start = () => ({ x: W / 2, y: H - 90 });
    const rack = () => {
      bottles = [];
      for (let row = 0; row < 3; row++) { const n = 5 - row, y = TOP + 70 + row * ((H - TOP - 300) / 2.5); for (let i = 0; i < n; i++) bottles.push({ x: W / 2 + (i - (n - 1) / 2) * (W / 6.2) * (1 - row * 0.12), y: TOP + 70 + (2 - row) * 0 + y - (TOP + 70), row: 2 - row, ringed: 0 }); }
      wind = (r() - 0.5) * 2 * (0.5 + Math.min(1.5, ringers / 8));
    };
    rack();
    const throwRing = (dx: number, dy: number) => {
      // pull back to throw forward: distance sets how far, sideways sets the aim
      const s = start(), pow = clamp(Math.hypot(dx, dy) / 140, 0.15, 1.25);
      const ty = s.y - pow * (H - TOP - 160), tx = s.x - dx * 1.2 + wind * 40 * pow;
      flying = { t: 0, T: 0.55 + pow * 0.35, x0: s.x, y0: s.y, x1: tx, y1: ty, peak: 60 + pow * 90 };
      rings++; sfx.swish();
    };
    const land = (x: number, y: number) => {
      const b = bottles.filter((b) => Math.hypot(b.x - x, (b.y - y) * 1.6) < 22).sort((a, c) => Math.hypot(a.x - x, a.y - y) - Math.hypot(c.x - x, c.y - y))[0];
      if (b) {
        b.ringed++; ringers++; row3++;
        const pts = [40, 70, 120][b.row] * (b.ringed > 1 ? 1.5 : 1) + (row3 >= 3 ? 50 : 0) + Math.floor(level / 2) * 2;
        score += Math.round(pts); pp.push({ x: b.x, y: b.y - 30, t: `${row3 >= 3 ? '🔥 ' : ''}+${Math.round(pts)}`, life: 1, c: row3 >= 3 ? '#FFE14D' : '#FF2E88' });
        burst(sp, b.x, b.y, ['#FF2E88', '#00E5FF', '#FFE14D'], 16, 220); sfx.perfect(Math.min(row3, 12));
        if (row3 === 3) { msg = 'RINGER STREAK!'; msgT = 1.3; sfx.jackpot(); }
        if (bottles.every((x) => x.ringed)) { score += 200; msg = 'Every bottle! +200'; msgT = 1.5; rack(); }
      } else { row3 = 0; sfx.bonk(); pp.push({ x, y: y - 20, t: 'clink', life: 0.6, c: '#AAA' }); }
      if (rings % 6 === 0) wind = (r() - 0.5) * 2 * (0.5 + Math.min(1.5, ringers / 8));
    };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (flying) { flying.t += dt; if (flying.t >= flying.T) { const f = flying; flying = null; land(f.x1, f.y1); } }
        return time <= 0 && !flying;
      },
      draw(g, w, h, t) {
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#12052A'); bg.addColorStop(1, '#2A0A40'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(t * 2 + i)})`; g.fillRect((i * 97) % w, (i * 43) % (h * 0.5), 2, 2); }
        // shelves and bottles (far row smaller)
        for (const row of [2, 1, 0]) { const bs = bottles.filter((b) => b.row === row); if (!bs.length) continue; g.fillStyle = '#5E402C'; g.fillRect(20, bs[0].y + 14, w - 40, 6); }
        for (const b of bottles) {
          const s = [26, 32, 38][2 - b.row] * 0.9;
          g.fillStyle = ['#00E5FF', '#3DDC97', '#FF2E88'][b.row]; g.globalAlpha = 0.85; g.beginPath(); g.roundRect(b.x - s * 0.22, b.y - s * 0.6, s * 0.44, s * 0.95, 6); g.fill(); g.fillRect(b.x - s * 0.08, b.y - s * 0.95, s * 0.16, s * 0.4); g.globalAlpha = 1;
          if (b.ringed) { g.strokeStyle = '#FFE14D'; g.lineWidth = 4; g.beginPath(); g.ellipse(b.x, b.y + 6, s * 0.45, s * 0.14, 0, 0, Math.PI * 2); g.stroke(); }
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '800 10px ui-rounded'; g.textAlign = 'center'; g.fillText(`${[40, 70, 120][b.row]}`, b.x, b.y + 30);
        }
        // the wind
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect(w / 2 - 70, TOP + 4, 140, 26, 10); g.fill();
        g.fillStyle = '#9AE6FF'; g.font = '900 13px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`wind ${wind < -0.05 ? '◀'.repeat(Math.ceil(Math.abs(wind) * 2)) : wind > 0.05 ? '▶'.repeat(Math.ceil(wind * 2)) : '·'}`, w / 2, TOP + 17);
        const s = start();
        if (aiming) {
          const dx = aiming.x - s.x, dy = aiming.y - s.y, pow = clamp(Math.hypot(dx, dy) / 140, 0.15, 1.25);
          const ty = s.y - pow * (h - TOP - 160), tx = s.x - dx * 1.2 + wind * 40 * pow;
          g.setLineDash([4, 8]); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x, s.y); g.quadraticCurveTo((s.x + tx) / 2, Math.min(s.y, ty) - 60 - pow * 90, tx, ty); g.stroke(); g.setLineDash([]);
          g.strokeStyle = '#FF2E88'; g.lineWidth = 3; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(aiming.x, aiming.y); g.stroke();
        }
        if (flying) { const k = flying.t / flying.T, x = flying.x0 + (flying.x1 - flying.x0) * k, y = flying.y0 + (flying.y1 - flying.y0) * k - Math.sin(k * Math.PI) * flying.peak, sc = 1 - k * 0.45; g.strokeStyle = '#FFE14D'; g.lineWidth = 5 * sc; g.beginPath(); g.ellipse(x, y, 20 * sc, 8 * sc, Math.sin(flying.t * 20) * 0.3, 0, Math.PI * 2); g.stroke(); }
        else { g.strokeStyle = '#FFE14D'; g.lineWidth = 5; g.beginPath(); g.ellipse(aiming ? aiming.x : s.x, aiming ? aiming.y : s.y, 20, 8, 0, 0, Math.PI * 2); g.stroke(); }
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFE14D'; g.font = '900 24px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(msg, w / 2, h * 0.62); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60, 200); pops(pp, g, 1 / 60, 20);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF2E88', rings ? `⭕ ${ringers}/${rings}` : '');
        intro(g, w, h, t, ['Ring Toss', 'Drag back from the ring and let go to throw.', 'Pull further to throw further. Mind the wind!', 'Far bottles score most — 3 in a row = bonus.']);
      },
      down(p: Ptr) { if (!flying && time > 0) aiming = { x: p.x, y: p.y }; },
      move(p: Ptr) { if (aiming) aiming = { x: p.x, y: Math.max(start().y - 40, p.y) }; },
      up() { if (aiming) { const s = start(); throwRing(aiming.x - s.x, aiming.y - s.y); aiming = null; } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🪛 Drill Dive — steer down through the planet
// ======================================================================================================================
export function DrillDive({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, x = W / 2, tx = x, depth = 0, speed = 120, fuel = 1, hp = 3, inv = 0, gems = 0, msg = '', msgT = 0;
    type O = { x: number; y: number; k: 'magma' | 'rock' | 'gem' | 'big' | 'fuel'; w: number; got?: boolean };
    let obs: O[] = [], nextAt = H;
    const pp: Pop[] = [], sp: Spark[] = [];
    const DY = () => TOP + 70;
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; inv = Math.max(0, inv - dt);
        speed = Math.min(380, 120 + depth / 30); fuel -= dt * 0.03;
        x += clamp(tx - x, -520 * dt, 520 * dt);
        const dy = speed * dt; depth += dy; score += dy * 0.06;
        for (const o of obs) o.y -= dy;
        nextAt -= dy;
        while (nextAt < H + 40) {
          const roll = r(), k: O['k'] = roll < 0.34 ? 'magma' : roll < 0.52 ? 'rock' : roll < 0.84 ? 'gem' : roll < 0.9 ? 'big' : 'fuel';
          obs.push({ x: 30 + r() * (W - 60), y: nextAt + H * 0.15, k, w: k === 'magma' ? 28 + r() * 26 + Math.min(30, depth / 300) : k === 'rock' ? 26 : 14 });
          nextAt += Math.max(50, 110 - depth / 120);
        }
        for (const o of obs) {
          if (o.got) continue;
          const d = Math.hypot(o.x - x, (o.y - DY()) * 1.1);
          if (d < o.w + 14) {
            if (o.k === 'magma') { if (inv <= 0) { hp--; inv = 1.2; sfx.bonk(); burst(sp, x, DY(), ['#FF5A1F', '#FFE14D'], 18, 220); pp.push({ x, y: DY() - 20, t: '🔥 ouch', life: 0.8, c: '#FF8A5A' }); } }
            else if (o.k === 'rock') { o.got = true; speed *= 0.5; depth -= 4; sfx.thud(); }
            else if (o.k === 'fuel') { o.got = true; fuel = Math.min(1, fuel + 0.35); sfx.coin(); pp.push({ x: o.x, y: o.y - 20, t: '⛽ +fuel', life: 0.8, c: '#3DDC97' }); }
            else { o.got = true; gems++; const pts = o.k === 'big' ? 60 : 15; score += pts + Math.floor(level / 3); sfx.blip(o.k === 'big' ? 12 : 6); pp.push({ x: o.x, y: o.y - 18, t: `+${pts}`, life: 0.7, c: o.k === 'big' ? '#FF5AE0' : '#FFE14D' }); burst(sp, o.x, o.y, ['#FFE14D', '#fff'], 6, 140); }
          }
        }
        obs = obs.filter((o) => o.y > -60 && !(o.got && o.k !== 'rock'));
        if (fuel <= 0) { msg = 'Out of fuel!'; msgT = 2; }
        return time <= 0 || hp <= 0 || fuel <= 0;
      },
      draw(g, w, h, t) {
        // strata get hotter the deeper you go
        const heat = Math.min(1, depth / 9000);
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, `rgb(${60 + heat * 120},${40 - heat * 20},${30 - heat * 20})`); bg.addColorStop(1, `rgb(${30 + heat * 140},${18},${14})`); g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.25; for (let i = 0; i < 10; i++) { const yy = ((i * 97 - depth * 0.6) % (h + 100) + h + 100) % (h + 100) - 50; g.fillStyle = i % 2 ? '#000' : '#fff'; g.fillRect(0, yy, w, 3); } g.globalAlpha = 1;
        // the tunnel behind you
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 14, 0, 28, DY());
        for (const o of obs) {
          if (o.k === 'magma') { const gr = g.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.w); gr.addColorStop(0, '#FFE14D'); gr.addColorStop(0.5, '#FF5A1F'); gr.addColorStop(1, 'rgba(255,40,0,0.2)'); g.fillStyle = gr; g.beginPath(); g.arc(o.x, o.y, o.w + Math.sin(t * 6 + o.x) * 2, 0, Math.PI * 2); g.fill(); }
          else if (o.k === 'rock') { g.fillStyle = o.got ? 'rgba(80,70,70,0.3)' : '#4A4040'; g.beginPath(); g.arc(o.x, o.y, o.w, 0, Math.PI * 2); g.fill(); }
          else emoji(g, o.k === 'fuel' ? '⛽' : o.k === 'big' ? '💎' : ['🔶', '🔷', '🟣'][Math.floor(Math.abs(o.x)) % 3], o.x, o.y, o.k === 'big' ? 30 : 22);
        }
        g.save(); g.translate(x, DY()); if (inv > 0 && Math.floor(t * 14) % 2) g.globalAlpha = 0.4;
        g.fillStyle = '#C0C4CC'; g.beginPath(); g.moveTo(-14, -18); g.lineTo(14, -18); g.lineTo(0, 22); g.closePath(); g.fill();
        g.strokeStyle = '#6A6A74'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { const yy = -14 + ((k * 9 + t * 120) % 34); g.beginPath(); g.moveTo(-12 + (yy + 18) * 0.33, yy); g.lineTo(12 - (yy + 18) * 0.33, yy + 4); g.stroke(); }
        g.fillStyle = '#FF5A1F'; g.fillRect(-16, -32, 32, 14); g.restore();
        // fuel gauge
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(14, h - 34, w - 28, 18, 9); g.fill(); g.fillStyle = fuel > 0.3 ? '#3DDC97' : '#FF5A5F'; g.beginPath(); g.roundRect(16, h - 32, (w - 32) * clamp(fuel, 0, 1), 14, 7); g.fill();
        g.fillStyle = '#fff'; g.font = '800 11px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⛽ fuel', w / 2, h - 25);
        if (msgT > 0) { g.fillStyle = '#FFE14D'; g.font = '900 24px ui-rounded'; g.fillText(msg, w / 2, h / 2); }
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(hp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB36A', `⬇ ${Math.round(depth / 10)} m${gems ? ` · 💎${gems}` : ''}`);
        intro(g, w, h, t, ['Drill Dive', 'Drag left and right to steer the drill.', 'Grab gems 💎 and fuel ⛽,', 'swerve round magma — rocks slow you down.']);
      },
      down(p: Ptr) { tx = p.x; }, move(p: Ptr) { tx = p.x; },
      key(k, d) { if (!d) return; if (k === 'ArrowLeft' || k === 'a') tx = x - 80; if (k === 'ArrowRight' || k === 'd') tx = x + 80; },
    };
  }, onEnd, onScore);
}
void button; void inBox;
