// Estate minigames, part 2:
//   ⚓ Airship Docking   (Aurora Skyport)     flying — thrusters and a burner against the wind, land soft and centred
//   🚀 Rocket Stages     (Clockwork Foundry)  rhythm — stop the needle in the green, stage after stage
//   🍣 Sushi Train       (Grand Food Hall)    juggling — pick a dish off the belt, serve the guest who wants it
//   🐲 Boss Rush         (Dragonspire)        dodging — weave through the boss's attacks, grab swords to strike
//   🃏 Card Clash        (Colosseum)          memory — flip pairs, chain combos, wild cards
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, useGame, type GameProps, type Ptr } from '../games';
import { INTRO, TOP, burst, button, clamp, hearts, hud, inBox, intro, pops, sparks, type Pop, type Spark } from './kit';

// ======================================================================================================================
// ⚓ Airship Docking
// ======================================================================================================================
export function AirshipDocking({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 75, hull = 3, x = 0, y = 0, vx = 0, vy = 0, pad = 0, docks = 0, msg = '', msgT = 0, settle = 0, fuel = 1;
    let L = false, R = false, U = false;
    type Gust = { y: number; h: number; f: number; ph: number };
    let gusts: Gust[] = [];
    type Star = { x: number; y: number; got: boolean };
    let stars: Star[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const ground = () => H - 70;
    const round = () => {
      x = 60 + r() * (W - 120); y = TOP + 30; vx = (r() - 0.5) * 40; vy = 0; fuel = 1; settle = 0;
      pad = clamp(x + (r() < 0.5 ? -1 : 1) * (W * (0.25 + r() * 0.35)), 70, W - 70);
      const strength = 60 + docks * 18;
      gusts = Array.from({ length: 3 }, (_, i) => ({ y: TOP + 80 + i * ((ground() - TOP - 140) / 3), h: 50 + r() * 30, f: (r() < 0.5 ? -1 : 1) * strength * (0.6 + r() * 0.6), ph: r() * 6 }));
      stars = Array.from({ length: 5 }, () => ({ x: 40 + r() * (W - 80), y: TOP + 60 + r() * (ground() - TOP - 150), got: false }));
    };
    round();
    const crash = (why: string) => { hull--; msg = why; msgT = 1.4; sfx.fail(); burst(sp, x, y, ['#FF8A5A', '#FFE14D', '#888'], 26, 260); if (hull > 0) round(); };
    return {
      score: () => score,
      update(dt, t) {
        if (t < 3.6) return false; // hovering while the how-to card is up
        time -= dt; msgT -= dt;
        if (hull <= 0) return true;
        const thrust = 150, lift = 260;
        if (L && fuel > 0) vx -= thrust * dt; if (R && fuel > 0) vx += thrust * dt; if (U && fuel > 0) vy -= lift * dt;
        if ((L || R || U) && fuel > 0) fuel = Math.max(0, fuel - dt * 0.07);
        vy += 70 * dt; // gentle gravity (it's a balloon)
        for (const gu of gusts) if (Math.abs(y - gu.y) < gu.h / 2) vx += gu.f * (0.7 + 0.3 * Math.sin(t * 2 + gu.ph)) * dt;
        vx *= 0.995; vy *= 0.995; x += vx * dt; y += vy * dt;
        if (x < 24 || x > W - 24) { x = clamp(x, 24, W - 24); vx = -vx * 0.4; }
        if (y < TOP + 10) { y = TOP + 10; vy = Math.max(0, vy); }
        for (const s of stars) if (!s.got && Math.hypot(s.x - x, s.y - y) < 30) { s.got = true; score += 15; pp.push({ x: s.x, y: s.y - 20, t: '+15', life: 0.7, c: '#C3B8FF' }); sfx.blip(12); }
        if (y >= ground() - 30) {
          const off = Math.abs(x - pad), speed = Math.hypot(vx, vy);
          if (off < 46 && vy < 95 && Math.abs(vx) < 70) {
            settle += dt; y = ground() - 30; vy = 0; vx *= 0.8;
            if (settle > 0.35) {
              docks++;
              const precision = Math.round(clamp(1 - off / 46, 0, 1) * 80), gentle = Math.round(clamp(1 - speed / 95, 0, 1) * 60), f = Math.round(fuel * 40);
              const pts = 120 + precision + gentle + f + Math.floor(level / 2) * 2;
              score += pts; msg = precision > 60 && gentle > 40 ? 'PERFECT BERTH!' : 'Docked!'; msgT = 1.4;
              pp.push({ x: pad, y: ground() - 80, t: `+${pts}`, life: 1.2, c: '#FFE14D' }); burst(sp, pad, ground() - 30, ['#8A7CFF', '#FFE14D', '#fff', '#3DDC97'], 34, 300); sfx.win(5);
              round();
            }
          } else if (vy >= 95 || Math.abs(vx) >= 70) crash(vy >= 95 ? 'Too fast! 💥' : 'Sideswiped! 💥');
          else { y = ground() - 30; vy = -60; vx *= 0.6; } // bumped the ground off the pad: bounce up
        }
        return time <= 0;
      },
      draw(g, w, h, t) {
        const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#0B0730'); sky.addColorStop(0.6, '#1C1260'); sky.addColorStop(1, '#2A1E70'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
        // the aurora
        for (let k = 0; k < 3; k++) { g.strokeStyle = ['rgba(61,220,151,0.25)', 'rgba(138,124,255,0.22)', 'rgba(34,227,255,0.18)'][k]; g.lineWidth = 26 - k * 6; g.beginPath(); for (let i = 0; i <= 20; i++) { const xx = (i / 20) * w, yy = 80 + k * 22 + Math.sin(i * 0.6 + t * 0.8 + k) * 18; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); }
        for (const gu of gusts) {
          g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, gu.y - gu.h / 2, w, gu.h);
          g.fillStyle = 'rgba(200,220,255,0.55)'; g.font = '900 16px ui-rounded'; g.textAlign = 'center';
          for (let i = 0; i < 6; i++) { const xx = ((i / 6) * w + t * gu.f * 0.8 + 1000 * w) % w; g.fillText(gu.f > 0 ? '»' : '«', xx, gu.y + 5); }
        }
        for (const s of stars) if (!s.got) emoji(g, '✨', s.x, s.y + Math.sin(t * 3 + s.x) * 4, 22);
        // the dock
        const gy = ground(); g.fillStyle = '#1A1240'; g.fillRect(0, gy, w, h - gy);
        g.fillStyle = '#5A4A9A'; g.fillRect(pad - 50, gy - 6, 100, 10);
        g.strokeStyle = '#FFE14D'; g.lineWidth = 3; g.beginPath(); g.ellipse(pad, gy - 20, 44, 14, 0, 0, Math.PI * 2); g.stroke();
        emoji(g, '⚓', pad, gy + 22, 22);
        g.fillStyle = 'rgba(255,225,77,0.15)'; g.fillRect(pad - 46, 0, 92, gy);
        // the airship
        g.save(); g.translate(x, y); g.rotate(clamp(vx / 400, -0.3, 0.3));
        if (U && fuel > 0) { g.fillStyle = `rgba(255,170,60,${0.6 + Math.random() * 0.4})`; g.beginPath(); g.moveTo(-6, 6); g.lineTo(0, -10 - Math.random() * 8); g.lineTo(6, 6); g.fill(); }
        emoji(g, '🎈', 0, -18, 46);
        g.fillStyle = '#7A4E2D'; g.fillRect(-14, 6, 28, 12); g.strokeStyle = '#4A2E1D'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-12, 6); g.lineTo(-8, -6); g.moveTo(12, 6); g.lineTo(8, -6); g.stroke();
        if (L && fuel > 0) emoji(g, '💨', 22, 12, 16); if (R && fuel > 0) emoji(g, '💨', -22, 12, 16);
        g.restore();
        // speed gauge: green = safe to land
        const sp0 = Math.hypot(vx, vy), safe = vy < 95 && Math.abs(vx) < 70;
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(14, TOP + 2, 120, 40, 10); g.fill();
        g.fillStyle = safe ? '#3DDC97' : '#FF5A5F'; g.font = '900 13px ui-rounded'; g.textAlign = 'left'; g.fillText(`${safe ? '✓ safe' : '⚠ too fast'} ${Math.round(sp0)}`, 24, TOP + 18);
        g.fillStyle = '#FFE14D'; g.fillRect(24, TOP + 28, 100 * fuel, 6); g.strokeStyle = 'rgba(255,255,255,0.4)'; g.strokeRect(24, TOP + 28, 100, 6);
        // the three thruster zones
        const zh = 58, zy = h - zh - 6;
        button(g, 8, zy, w / 3 - 12, zh, L ? '#8A7CFF' : 'rgba(138,124,255,0.35)', '◀ thrust', { down: L });
        button(g, w / 3 + 4, zy, w / 3 - 8, zh, U ? '#FF9A3D' : 'rgba(255,154,61,0.35)', '🔥 burner', { down: U });
        button(g, (2 * w) / 3 + 4, zy, w / 3 - 12, zh, R ? '#8A7CFF' : 'rgba(138,124,255,0.35)', 'thrust ▶', { down: R });
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60, 22);
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFE14D'; g.font = '900 26px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(msg, w / 2, h * 0.36); g.globalAlpha = 1; }
        hud(g, w, score, `${hearts(hull)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#C3B8FF', docks ? `⚓ ${docks}` : '');
        intro(g, w, h, t, ['Dock the airship', 'Hold 🔥 to rise, ◀ ▶ to steer.', 'Ride the winds » down to the golden ring', 'and land slow (green gauge) and centred.'], 3.6);
      },
      down(p: Ptr, w: number) { if (p.x < w / 3) L = true; else if (p.x > (2 * w) / 3) R = true; else U = true; },
      up(p: Ptr) { if (p.x < W / 3) L = false; else if (p.x > (2 * W) / 3) R = false; else U = false; },
      key(k, d) { if (k === 'ArrowLeft' || k === 'a') L = d; if (k === 'ArrowRight' || k === 'd') R = d; if (k === 'ArrowUp' || k === 'w' || k === ' ') U = d; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🚀 Rocket Stages
// ======================================================================================================================
export function RocketStages({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, lives = 3, stage = 0, rocket = 1, needle = 0, dir = 1, speed = 0.9, center = 0.5, width = 0.3, combo = 0;
    let alt = 0, altV = 0, shake = 0, flash = 0, flashC = '#fff', verdict = '', stall = 0, cooldown = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const stars = Array.from({ length: 70 }, () => ({ x: r(), y: r(), s: r() * 2 + 0.5 }));
    const STAGES = 6;
    const newWindow = () => { center = 0.2 + r() * 0.6; width = Math.max(0.07, 0.3 - stage * 0.03 - (rocket - 1) * 0.03); speed = 0.9 + stage * 0.16 + (rocket - 1) * 0.2; };
    newWindow();
    const fire = () => {
      if (stall > 0 || cooldown > 0) return;
      cooldown = 0.15;
      const off = Math.abs(needle - center), half = width / 2;
      if (off <= half * 0.25) { combo++; const pts = Math.round((70 + stage * 15) * (1 + Math.min(combo, 8) * 0.15)); score += pts; verdict = combo > 1 ? `PERFECT ×${combo}` : 'PERFECT!'; flashC = '#FFE14D'; altV += 900; shake = 0.4; sfx.perfect(combo); pp.push({ x: W / 2, y: H * 0.42, t: `+${pts}`, life: 1, c: '#FFE14D' }); burst(sp, W / 2, H * 0.62, ['#FFE14D', '#FF8A3D', '#fff'], 26, 280); next(); }
      else if (off <= half) { combo = 0; const pts = 35 + stage * 8; score += pts; verdict = 'Stage fired'; flashC = '#3DDC97'; altV += 520; shake = 0.2; sfx.blip(7); pp.push({ x: W / 2, y: H * 0.42, t: `+${pts}`, life: 0.9, c: '#3DDC97' }); burst(sp, W / 2, H * 0.62, ['#FF8A3D', '#fff'], 14, 200); next(); }
      else { combo = 0; lives--; verdict = 'Misfire!'; flashC = '#FF5A5F'; stall = 1; altV = -300; shake = 0.5; sfx.fail(); }
      flash = 0.8;
    };
    const next = () => {
      stage++;
      if (stage >= STAGES) { const bonus = 150 + rocket * 50; score += bonus; pp.push({ x: W / 2, y: H * 0.3, t: `🛰️ ORBIT! +${bonus}`, life: 1.6, c: '#C3B8FF' }); sfx.jackpot(); burst(sp, W / 2, H * 0.3, ['#C3B8FF', '#FFE14D', '#22E3FF', '#FF3D9A'], 50, 340); rocket++; stage = 0; }
      newWindow();
    };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false; // hold still while the how-to card is up
        time -= dt; flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt); cooldown -= dt;
        if (stall > 0) { stall -= dt; if (stall <= 0) newWindow(); }
        else { needle += dir * speed * dt; if (needle > 1) { needle = 1; dir = -1; } if (needle < 0) { needle = 0; dir = 1; } }
        altV *= 0.96; alt = Math.max(0, alt + altV * dt * 0.02);
        return time <= 0 || lives <= 0;
      },
      draw(g, w, h, t) {
        const up = Math.min(1, alt / 400);
        const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, `rgb(${Math.round(20 - 18 * up)},${Math.round(40 - 36 * up)},${Math.round(90 - 70 * up)})`); sky.addColorStop(1, `rgb(${Math.round(226 - 210 * up)},${Math.round(120 - 105 * up)},${Math.round(59 - 40 * up)})`);
        g.fillStyle = sky; g.fillRect(0, 0, w, h);
        for (const s of stars) { g.fillStyle = `rgba(255,255,255,${0.2 + up * 0.8})`; g.fillRect(s.x * w, ((s.y * h + alt * 3) % h), s.s, s.s); }
        const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        // the rocket, with its stages stacked (spent ones fall away)
        g.save(); g.translate(w / 2 + sx, h * 0.62);
        if (stall <= 0) { const fl = 30 + Math.random() * 20; const fg = g.createLinearGradient(0, 40, 0, 40 + fl); fg.addColorStop(0, '#FFE14D'); fg.addColorStop(1, 'rgba(255,90,40,0)'); g.fillStyle = fg; g.beginPath(); g.moveTo(-14, 40); g.lineTo(0, 40 + fl + 20 * Math.min(1, altV / 600)); g.lineTo(14, 40); g.fill(); }
        else { g.fillStyle = 'rgba(160,160,160,0.6)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc((Math.random() - 0.5) * 30, 50 + i * 10, 10 + i * 4, 0, Math.PI * 2); g.fill(); } }
        for (let k = STAGES - 1; k >= stage; k--) { const yy = 40 - (STAGES - k) * 22; g.fillStyle = k % 2 ? '#C9A04A' : '#B87333'; g.fillRect(-16, yy, 32, 22); g.fillStyle = '#4A2E1D'; g.fillRect(-16, yy, 32, 2); }
        const topY = 40 - (STAGES - stage) * 22; g.fillStyle = '#E2783B'; g.beginPath(); g.moveTo(-16, topY); g.lineTo(0, topY - 30); g.lineTo(16, topY); g.fill();
        g.fillStyle = '#9AE6FF'; g.beginPath(); g.arc(0, topY - 8, 6, 0, Math.PI * 2); g.fill();
        g.restore();
        // the timing gauge
        const gx = 30, gw = w - 60, gy = h - 130;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(gx - 6, gy - 6, gw + 12, 40, 12); g.fill();
        g.fillStyle = '#3A2A20'; g.fillRect(gx, gy, gw, 28);
        g.fillStyle = '#3DDC97'; g.fillRect(gx + (center - width / 2) * gw, gy, width * gw, 28);
        g.fillStyle = '#FFE14D'; g.fillRect(gx + (center - width / 8) * gw, gy, (width / 4) * gw, 28);
        const nx = gx + needle * gw; g.fillStyle = stall > 0 ? '#888' : '#fff'; g.fillRect(nx - 3, gy - 8, 6, 44);
        button(g, 20, h - 78, w - 40, 60, stall > 0 ? '#5A4A40' : '#E2783B', stall > 0 ? 'Restarting engine…' : `🔥 FIRE STAGE ${stage + 1}`, { font: '900 20px ui-rounded, system-ui' });
        if (flash > 0) { g.globalAlpha = Math.min(1, flash * 1.5); g.fillStyle = flashC; g.font = '900 28px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(verdict, w / 2, h * 0.24); g.globalAlpha = 1; }
        sparks(sp, g, 1 / 60, 200); pops(pp, g, 1 / 60, 22);
        hud(g, w, score, `${hearts(lives)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB36A', `🚀 #${rocket} · ${Math.round(alt)} km`);
        intro(g, w, h, t, ['Launch the rocket!', 'Tap FIRE when the needle is in the green.', 'Hit the yellow middle for a PERFECT.', 'Six stages make orbit — then a new rocket.']);
      },
      down() { fire(); },
      key(k, d) { if (d && (k === ' ' || k === 'Enter')) fire(); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🍣 Sushi Train
// ======================================================================================================================
const DISHES = ['🍣', '🍤', '🥟', '🍙', '🍜', '🍡', '🥢', '🍛'];
const GUESTS = ['🧑', '👩', '👨‍🦳', '👧', '🧔', '👵', '🧑‍🎤', '🥷'];
export function SushiTrain({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, strikes = 3, held = -1, speed = 0.055, served = 0, streak = 0;
    type Dish = { e: string; u: number; id: number };
    type Guest = { e: string; want: string; pat: number; max: number; mood: number; leave: number; happy: boolean } | null;
    let dishes: Dish[] = [], uid = 0;
    const seats: Guest[] = [null, null, null, null];
    const pp: Pop[] = [], sp: Spark[] = [];
    const kinds = () => DISHES.slice(0, Math.min(DISHES.length, 4 + Math.floor((60 - time) / 15)));
    const wanted = () => seats.filter(Boolean).map((s) => s!.want);
    const addDish = () => {
      const want = wanted(), pool = kinds();
      const e = want.length && r() < 0.55 ? want[Math.floor(r() * want.length)] : pool[Math.floor(r() * pool.length)];
      dishes.push({ e, u: 0, id: ++uid });
    };
    const seat = (i: number) => { const ks = kinds(); seats[i] = { e: GUESTS[Math.floor(r() * GUESTS.length)], want: ks[Math.floor(r() * ks.length)], pat: 0, max: Math.max(7, 13 - (60 - time) / 10), mood: 0, leave: 0, happy: false }; };
    seats.forEach((_, i) => i < 2 && seat(i));
    let spawnT = 0, seatT = 1.5;
    // the belt: a rounded loop; u in 0..1 along it
    const belt = (u: number, w: number, h: number) => {
      const x0 = 40, x1 = w - 40, y0 = TOP + 24, y1 = Math.max(TOP + 160, h * 0.5), rr = 40, top = x1 - x0 - 2 * rr, side = y1 - y0 - 2 * rr, arc = (Math.PI / 2) * rr, L = 2 * top + 2 * side + 4 * arc;
      let d = ((u % 1) + 1) % 1 * L;
      const segs: [number, (d: number) => [number, number]][] = [
        [top, (d) => [x0 + rr + d, y0]], [arc, (d) => { const a = -Math.PI / 2 + d / rr; return [x1 - rr + Math.cos(a) * rr, y0 + rr + Math.sin(a) * rr]; }],
        [side, (d) => [x1, y0 + rr + d]], [arc, (d) => { const a = d / rr; return [x1 - rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr]; }],
        [top, (d) => [x1 - rr - d, y1]], [arc, (d) => { const a = Math.PI / 2 + d / rr; return [x0 + rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr]; }],
        [side, (d) => [x0, y1 - rr - d]], [arc, (d) => { const a = Math.PI + d / rr; return [x0 + rr + Math.cos(a) * rr, y0 + rr + Math.sin(a) * rr]; }],
      ];
      for (const [len, f] of segs) { if (d <= len) return f(d); d -= len; }
      return [x0 + rr, y0] as [number, number];
    };
    const seatPos = (i: number, w: number, h: number) => ({ x: (w / 4) * i + w / 8, y: Math.max(TOP + 160, h * 0.5) + 120 });
    return {
      score: () => score,
      update(dt, t) {
        if (t < 3.2) return false;
        time -= dt; speed = 0.055 + (60 - time) * 0.0009;
        for (const d of dishes) d.u += speed * dt;
        spawnT -= dt; if (spawnT <= 0 && dishes.length < 9) { addDish(); spawnT = 0.9; }
        dishes = dishes.filter((d) => d.u < 1 || d.id === held);
        seatT -= dt;
        seats.forEach((s, i) => {
          if (!s) { if (seatT <= 0) { seat(i); seatT = 1.2 + r() * 1.5; } return; }
          if (s.leave > 0) { s.leave -= dt; if (s.leave <= 0) seats[i] = null; return; }
          s.pat += dt; s.mood = Math.max(0, s.mood - dt);
          if (s.pat >= s.max) { strikes--; streak = 0; s.leave = 0.8; s.happy = false; sfx.fail(); pp.push({ x: (W / 4) * i + W / 8, y: H * 0.5 + 70, t: '😤 left', life: 1, c: '#FF8A8A' }); }
        });
        return time <= 0 || strikes <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2A1A14'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#3A251C'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 90 + 20, w, 3);
        // lanterns
        for (let i = 0; i < 5; i++) emoji(g, '🏮', ((i + 0.5) / 5) * w, TOP - 2 + Math.sin(t * 2 + i) * 2, 18);
        // the belt
        g.strokeStyle = '#6B4A33'; g.lineWidth = 46; g.lineJoin = 'round'; g.beginPath(); for (let i = 0; i <= 100; i++) { const [x, y] = belt(i / 100, w, h); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke();
        g.strokeStyle = '#8B6B4A'; g.lineWidth = 38; g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let i = 0; i < 30; i++) { const [x, y] = belt(i / 30 + t * speed, w, h); g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.stroke(); }
        for (const d of dishes) { if (d.id === held) continue; const [x, y] = belt(d.u, w, h); g.fillStyle = '#F4F1E8'; g.beginPath(); g.ellipse(x, y + 4, 19, 9, 0, 0, Math.PI * 2); g.fill(); emoji(g, d.e, x, y - 2, 26); }
        // the counter and the guests
        const cy0 = Math.max(TOP + 160, h * 0.5) + 70; g.fillStyle = '#5A3A26'; g.fillRect(0, cy0, w, h); g.fillStyle = '#C9A06A'; g.fillRect(0, cy0, w, 10);
        seats.forEach((s, i) => {
          const p = seatPos(i, w, h);
          if (!s) { emoji(g, '🪑', p.x, p.y + 40, 30); return; }
          const pf = 1 - s.pat / s.max;
          emoji(g, s.leave > 0 ? (s.happy ? '😋' : '😤') : s.mood > 0 ? '😠' : s.e, p.x, p.y + 30 + (s.leave > 0 ? -s.leave * 20 : 0), 44);
          if (s.leave > 0) return;
          // the bubble with what they want
          g.fillStyle = '#fff'; g.beginPath(); g.roundRect(p.x - 28, p.y - 46, 56, 44, 12); g.fill(); g.beginPath(); g.moveTo(p.x - 6, p.y - 3); g.lineTo(p.x, p.y + 6); g.lineTo(p.x + 6, p.y - 3); g.fill();
          emoji(g, s.want, p.x, p.y - 24, 28);
          g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(p.x - 30, p.y + 62, 60, 7); g.fillStyle = pf > 0.5 ? '#3DDC97' : pf > 0.25 ? '#FFB13D' : '#FF5A5F'; g.fillRect(p.x - 30, p.y + 62, 60 * pf, 7);
        });
        if (held >= 0) { const d = dishes.find((x) => x.id === held); if (d) { g.fillStyle = 'rgba(255,225,77,0.25)'; g.beginPath(); g.arc(w / 2, h - 40, 34, 0, Math.PI * 2); g.fill(); emoji(g, d.e, w / 2, h - 42, 40); g.fillStyle = '#FFE14D'; g.font = '800 12px ui-rounded'; g.textAlign = 'center'; g.fillText('tap a guest to serve', w / 2, h - 8); } }
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `${hearts(strikes)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF9A6A', streak > 1 ? `🔥 ×${streak}` : served ? `🍽️ ${served}` : '');
        intro(g, w, h, t, ['Sushi Train!', 'Tap a dish on the belt to pick it up,', 'then tap the guest who wants it.', 'Serve fast for bigger tips!']);
      },
      down(p: Ptr, w: number, h: number) {
        // a guest?
        for (let i = 0; i < 4; i++) {
          const s = seats[i], q = seatPos(i, w, h);
          if (!s || s.leave > 0 || Math.abs(p.x - q.x) > w / 8 || p.y < q.y - 50 || p.y > q.y + 80) continue;
          if (held < 0) return;
          const d = dishes.find((x) => x.id === held)!;
          if (d && d.e === s.want) {
            served++; streak++;
            const tip = Math.round(30 + 40 * (1 - s.pat / s.max)) + Math.min(streak, 8) * 4 + Math.floor(level / 3);
            score += tip; s.leave = 0.8; s.happy = true; sfx.tickets?.(Math.min(10, 2 + Math.floor(tip / 15))); burst(sp, q.x, q.y, ['#FFE14D', '#FF9A6A', '#fff'], 16);
            pp.push({ x: q.x, y: q.y - 50, t: `+${tip}`, life: 1, c: '#FFE14D' });
            dishes = dishes.filter((x) => x.id !== held); held = -1;
          } else { s.mood = 1; s.pat += s.max * 0.25; streak = 0; sfx.bonk(); pp.push({ x: q.x, y: q.y - 50, t: 'not that!', life: 0.8, c: '#FF8A8A' }); }
          return;
        }
        // a dish on the belt?
        let best = -1, bd = 40;
        for (const d of dishes) { if (d.id === held) continue; const [x, y] = belt(d.u, w, h); const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = d.id; } }
        if (best >= 0) { held = best; sfx.blip(5); }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🐲 Boss Rush
// ======================================================================================================================
const BOSSES = [{ e: '👹', name: 'Ogre King', hp: 60 }, { e: '🧟', name: 'Bone Lord', hp: 80 }, { e: '🧙', name: 'Shadow Mage', hp: 100 }, { e: '🐉', name: 'Elder Dragon', hp: 140 }];
export function BossRush({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, hp = 3, inv = 0, px = W / 2, py = H * 0.8, tx = px, ty = py, boss = 0, bhp = BOSSES[0].hp, bx = W / 2, bdir = 1, power = 0, kills = 0;
    let atkT = 4.4, pattern = 0, shotT = 0, hurtFlash = 0, bossFlash = 0, swordT = 4.6, msg = '', msgT = 0;
    type B = { x: number; y: number; vx: number; vy: number; r: number; c: string };
    type L = { x: number; warn: number; on: number };
    let bullets: B[] = [], shots: { x: number; y: number }[] = [], lasers: L[] = [];
    let swords: { x: number; y: number; t: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const by = () => TOP + 56;
    const attack = () => {
      const tier = boss + kills * 0, b = BOSSES[boss % BOSSES.length];
      pattern = (pattern + 1 + Math.floor(r() * 2)) % 4;
      const spd = 150 + tier * 25;
      if (pattern === 0) { const n = 10 + tier * 3, off = r() * Math.PI; for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; bullets.push({ x: bx, y: by(), vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 7, c: '#FF5A7A' }); } }
      else if (pattern === 1) { for (let k = 0; k < 3 + tier; k++) setTimeout(() => { const a = Math.atan2(py - by(), px - bx); bullets.push({ x: bx, y: by(), vx: Math.cos(a) * (spd + 90), vy: Math.sin(a) * (spd + 90), r: 9, c: '#FFB13D' }); }, k * 180); }
      else if (pattern === 2) { const n = 2 + tier; for (let i = 0; i < n; i++) lasers.push({ x: 30 + r() * (W - 60), warn: 0.9, on: 0.5 }); }
      else { for (let i = 0; i < 6 + tier * 2; i++) bullets.push({ x: 20 + r() * (W - 40), y: -20 - r() * 200, vx: 0, vy: spd * 0.9, r: 11, c: '#A08A70' }); }
      void b;
      atkT = Math.max(0.8, 1.8 - boss * 0.2);
    };
    return {
      score: () => score,
      update(dt) {
        time -= dt; inv = Math.max(0, inv - dt); hurtFlash = Math.max(0, hurtFlash - dt); bossFlash = Math.max(0, bossFlash - dt); msgT -= dt; power = Math.max(0, power - dt);
        const ddx = tx - px, ddy = ty - py, dd = Math.hypot(ddx, ddy); if (dd > 1) { const m = Math.min(dd, 420 * dt); px += (ddx / dd) * m; py += (ddy / dd) * m; }
        px = clamp(px, 20, W - 20); py = clamp(py, H * 0.35, H - 30);
        bx += bdir * (60 + boss * 20) * dt; if (bx > W - 60) bdir = -1; if (bx < 60) bdir = 1;
        atkT -= dt; if (atkT <= 0) attack();
        swordT -= dt; if (swordT <= 0) { swords.push({ x: 40 + r() * (W - 80), y: H * 0.45 + r() * (H * 0.4), t: 6 }); swordT = 3 + r() * 2; }
        for (const s of swords) s.t -= dt;
        swords = swords.filter((s) => { if (Math.hypot(s.x - px, s.y - py) < 30) { power = 3.2; sfx.perfect(4); pp.push({ x: px, y: py - 30, t: '⚔️ POWER!', life: 0.9, c: '#FFE14D' }); return false; } return s.t > 0; });
        // you strike back while powered up
        if (power > 0) { shotT -= dt; if (shotT <= 0) { shots.push({ x: px, y: py - 20 }); shotT = 0.11; } }
        for (const s of shots) s.y -= 640 * dt;
        shots = shots.filter((s) => {
          if (Math.abs(s.x - bx) < 52 && Math.abs(s.y - by()) < 46) {
            bhp--; score += 4; bossFlash = 0.06; if (r() < 0.3) burst(sp, s.x, s.y, ['#FFE14D', '#fff'], 4, 120);
            if (bhp <= 0) {
              kills++; const bonus = 200 + boss * 80; score += bonus; msg = `${BOSSES[boss % BOSSES.length].name} defeated! +${bonus}`; msgT = 1.8; sfx.jackpot(); burst(sp, bx, by(), ['#FFE14D', '#FF5A7A', '#B23CFF', '#fff'], 60, 360);
              boss++; bhp = BOSSES[boss % BOSSES.length].hp + Math.floor(boss / BOSSES.length) * 40; bullets = []; lasers = []; atkT = 2;
            }
            return false;
          }
          return s.y > -20;
        });
        for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
        bullets = bullets.filter((b) => b.y < H + 40 && b.x > -40 && b.x < W + 40 && b.y > -260);
        for (const l of lasers) { if (l.warn > 0) l.warn -= dt; else l.on -= dt; }
        lasers = lasers.filter((l) => l.warn > 0 || l.on > 0);
        if (inv <= 0) {
          const hitB = bullets.find((b) => Math.hypot(b.x - px, b.y - py) < b.r + 11);
          const hitL = lasers.find((l) => l.warn <= 0 && l.on > 0 && Math.abs(l.x - px) < 18);
          if (hitB || hitL) { hp--; inv = 1.4; hurtFlash = 0.3; sfx.bonk(); if (hitB) bullets.splice(bullets.indexOf(hitB), 1); score = Math.max(0, score - 15); }
          else for (const b of bullets) { const d = Math.hypot(b.x - px, b.y - py); if (d < b.r + 26 && d > b.r + 11 && r() < dt * 6) { score += 2; } } // grazes
        }
        return time <= 0 || hp <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#140A1E'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 10; i++) { g.fillStyle = '#1F1230'; g.fillRect((i / 10) * w, 0, w / 10 - 4, h); }
        // a bright halo behind the boss so it reads against the dark hall
        const halo = g.createRadialGradient(bx, by(), 10, bx, by(), 70); halo.addColorStop(0, 'rgba(255,220,255,0.55)'); halo.addColorStop(1, 'rgba(178,60,255,0)'); g.fillStyle = halo; g.beginPath(); g.arc(bx, by(), 74 + Math.sin(t * 4) * 6, 0, Math.PI * 2); g.fill();
        const b = BOSSES[boss % BOSSES.length];
        g.save(); if (bossFlash > 0) g.filter = 'brightness(3)'; emoji(g, b.e, bx, by() + Math.sin(t * 2) * 6, 86); g.restore();
        // boss health
        const maxHp = BOSSES[boss % BOSSES.length].hp + Math.floor(boss / BOSSES.length) * 40;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(40, TOP - 2, w - 80, 12); g.fillStyle = '#FF3D5A'; g.fillRect(40, TOP - 2, (w - 80) * (bhp / maxHp), 12);
        g.fillStyle = '#fff'; g.font = '800 11px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.name, w / 2, TOP + 4.5);
        for (const l of lasers) { if (l.warn > 0) { g.fillStyle = `rgba(255,60,90,${0.15 + 0.2 * Math.sin(t * 30)})`; g.fillRect(l.x - 18, by(), 36, h); } else { g.fillStyle = '#FF3D5A'; g.shadowColor = '#FF3D5A'; g.shadowBlur = 20; g.fillRect(l.x - 14, by(), 28, h); g.shadowBlur = 0; g.fillStyle = '#fff'; g.fillRect(l.x - 4, by(), 8, h); } }
        for (const bb of bullets) { g.fillStyle = bb.c; g.beginPath(); g.arc(bb.x, bb.y, bb.r, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(bb.x - 2, bb.y - 2, bb.r * 0.4, 0, Math.PI * 2); g.fill(); }
        for (const s of swords) { g.globalAlpha = s.t < 1.5 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 10)) : 1; g.fillStyle = 'rgba(255,225,77,0.25)'; g.beginPath(); g.arc(s.x, s.y, 22, 0, Math.PI * 2); g.fill(); emoji(g, '⚔️', s.x, s.y, 28); g.globalAlpha = 1; }
        for (const s of shots) emoji(g, '🗡️', s.x, s.y, 20);
        if (!(inv > 0 && Math.floor(t * 16) % 2)) { if (power > 0) { g.fillStyle = 'rgba(255,225,77,0.3)'; g.beginPath(); g.arc(px, py, 28, 0, Math.PI * 2); g.fill(); } emoji(g, '🛡️', px, py, 36); }
        if (hurtFlash > 0) { g.fillStyle = `rgba(255,0,40,${hurtFlash})`; g.fillRect(0, 0, w, h); }
        sparks(sp, g, 1 / 60, 120); pops(pp, g, 1 / 60);
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFE14D'; g.font = '900 22px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(msg, w / 2, h * 0.3); g.globalAlpha = 1; }
        hud(g, w, score, `${hearts(hp)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#D9A0FF', power > 0 ? `⚔️ ${power.toFixed(1)}s` : kills ? `💀 ${kills}` : '');
        intro(g, w, h, t, ['Boss Rush!', 'Drag your hero 🛡️ to dodge everything.', 'Red stripes = a laser is coming.', 'Grab ⚔️ to strike back — slay the boss!'], 3.6);
      },
      down(p) { tx = p.x; ty = p.y - 40; }, move(p) { tx = p.x; ty = p.y - 40; },
      key(k, d) { if (!d) return; const s = 50; if (k === 'ArrowLeft' || k === 'a') tx -= s; if (k === 'ArrowRight' || k === 'd') tx += s; if (k === 'ArrowUp' || k === 'w') ty -= s; if (k === 'ArrowDown' || k === 's') ty += s; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🃏 Card Clash — pairs, combos, wilds
// ======================================================================================================================
const FACES = ['🦁', '🐉', '🦅', '🐙', '🦊', '🐺', '🦄', '🐻', '🦖', '🐲', '🦂', '🐢', '🦈', '🐝'];
export function CardClash({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 60, board = 0, combo = 0, peek = 0, lock = 0, msg = '', msgT = 0;
    type C = { f: string; open: boolean; done: boolean; flip: number };
    let cards: C[] = [], cols = 4, rows = 4, first = -1, second = -1;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => {
      board++; combo = 0; first = second = -1;
      [cols, rows] = board === 1 ? [4, 3] : board === 2 ? [4, 4] : [4, 5];
      const pairs = (cols * rows) / 2, wild = board >= 2;
      const faces = [...FACES].sort(() => r() - 0.5).slice(0, wild ? pairs - 1 : pairs);
      const deck = [...faces, ...faces, ...(wild ? ['🌟', '🌟'] : [])].sort(() => r() - 0.5);
      cards = deck.map((f) => ({ f, open: false, done: false, flip: 0 }));
      peek = Math.max(0.8, 1.6 - board * 0.2) + (board === 1 ? 2.4 : 0); // a glimpse of the board first (after the how-to on the first)
    };
    deal();
    const box = (i: number, w: number, h: number) => {
      const top = TOP + 6, gw = w - 24, gh = h - top - 20, cw = Math.min(gw / cols, (gh / rows) * 0.72), ch = cw / 0.72;
      const ox = (w - cw * cols) / 2, oy = top + (gh - ch * rows) / 2;
      return { x: ox + (i % cols) * cw + 4, y: oy + Math.floor(i / cols) * ch + 4, w: cw - 8, h: ch - 8 };
    };
    const matched = (a: number, b: number) => {
      cards[a].done = cards[b].done = true; combo++;
      const pts = Math.round(40 * (1 + Math.min(combo, 8) * 0.25)) + Math.floor(level / 3);
      score += pts; const bb = box(b, W, H); pp.push({ x: bb.x + bb.w / 2, y: bb.y, t: `+${pts}${combo > 1 ? ` ×${combo}` : ''}`, life: 0.9, c: '#FFE14D' }); burst(sp, bb.x + bb.w / 2, bb.y + bb.h / 2, ['#FF5A5F', '#FFE14D', '#fff'], 14);
      sfx.perfect(Math.min(combo, 12));
      if (cards.every((c) => c.done)) { const bonus = 100 + board * 40 + Math.round(time); score += bonus; msg = `Board clear! +${bonus}`; msgT = 1.6; sfx.jackpot(); burst(sp, W / 2, H / 2, ['#FF5A5F', '#FFE14D', '#22E3FF', '#3DDC97'], 60, 360); setTimeout(deal, 900); }
    };
    const tap = (i: number) => {
      const c = cards[i];
      if (peek > 0 || lock > 0 || !c || c.done || c.open) return;
      c.open = true; c.flip = 0.18; sfx.swish();
      if (first < 0) { first = i; return; }
      second = i;
      const a = cards[first], b = cards[second];
      if (a.f === b.f) {
        if (a.f === '🌟') {
          // the wild pair clears a random pair for free
          const left = cards.map((x, k) => k).filter((k) => !cards[k].done && k !== first && k !== second);
          const f = left.length ? cards[left[Math.floor(r() * left.length)]].f : null;
          matched(first, second);
          if (f) { const ks = left.filter((k) => cards[k].f === f); ks.forEach((k) => { cards[k].open = true; }); if (ks.length === 2) setTimeout(() => matched(ks[0], ks[1]), 300); }
          msg = '🌟 WILD!'; msgT = 1;
        } else matched(first, second);
        first = second = -1;
      } else { combo = 0; lock = 0.7; sfx.bonk(); }
    };
    return {
      score: () => score,
      update(dt) {
        time -= dt; msgT -= dt;
        for (const c of cards) c.flip = Math.max(0, c.flip - dt);
        if (peek > 0) { peek -= dt; }
        if (lock > 0) { lock -= dt; if (lock <= 0 && first >= 0 && second >= 0) { cards[first].open = cards[second].open = false; cards[first].flip = cards[second].flip = 0.18; first = second = -1; } }
        return time <= 0;
      },
      draw(g, w, h, t) {
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#3A0F1A'); bg.addColorStop(1, '#1A0710'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,90,95,0.06)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(w / 2, h * 1.1, 120 + i * 70, Math.PI, 0); g.lineWidth = 20; g.strokeStyle = 'rgba(255,90,95,0.05)'; g.stroke(); }
        cards.forEach((c, i) => {
          const b = box(i, w, h), show = c.open || c.done || peek > 0, sq = c.flip > 0 ? Math.abs(Math.cos((c.flip / 0.18) * Math.PI)) : 1;
          g.save(); g.translate(b.x + b.w / 2, b.y + b.h / 2); g.scale(sq, 1);
          if (c.done) g.globalAlpha = 0.35;
          if (show) {
            g.fillStyle = c.f === '🌟' ? '#FFE9A0' : '#FFF6E8'; g.beginPath(); g.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 10); g.fill();
            g.strokeStyle = c.f === '🌟' ? '#FFB13D' : '#C9A04A'; g.lineWidth = 3; g.stroke();
            emoji(g, c.f, 0, 2, Math.min(b.w, b.h) * 0.55);
          } else {
            const cb = g.createLinearGradient(-b.w / 2, -b.h / 2, b.w / 2, b.h / 2); cb.addColorStop(0, '#FF5A5F'); cb.addColorStop(1, '#8B1E3F');
            g.fillStyle = cb; g.beginPath(); g.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 10); g.fill();
            g.strokeStyle = '#FFE14D'; g.lineWidth = 2; g.beginPath(); g.roundRect(-b.w / 2 + 5, -b.h / 2 + 5, b.w - 10, b.h - 10, 7); g.stroke();
            emoji(g, '🏟️', 0, 2, Math.min(b.w, b.h) * 0.36);
          }
          g.restore(); g.globalAlpha = 1;
        });
        if (peek > 0) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(w / 2 - 90, h - 44, 180, 30, 12); g.fill(); g.fillStyle = '#FFE14D'; g.font = '900 14px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`Memorise! ${peek.toFixed(1)}`, w / 2, h - 29); }
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        if (msgT > 0) { g.globalAlpha = Math.min(1, msgT); g.fillStyle = '#FFE14D'; g.font = '900 26px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText(msg, w / 2, h * 0.5); g.globalAlpha = 1; }
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF8A8E', `Board ${board}${combo > 1 ? ` · 🔥×${combo}` : ''}`);
        intro(g, w, h, t, ['Card Clash!', 'Flip two cards — find matching pairs.', 'Match in a row for combos 🔥.', '🌟 pairs are wild: they clear a pair for free.'], 2.3);
      },
      down(p: Ptr, w: number, h: number) { const i = cards.findIndex((_, k) => inBox(p, box(k, w, h))); if (i >= 0) tap(i); },
    };
  }, onEnd, onScore);
}
