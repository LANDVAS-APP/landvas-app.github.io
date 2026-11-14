// The four cabinets that only exist in the Mirror Arcade. All drawn in 2D on the cabinet's screen (light on phones),
// each with a Classic round and an Endless mode, a multiplier that builds while you play well, and a bonus:
//  Twin Drops     two drops, one each side of the mirror: tap a side to switch that drop's lane. Catch every orb,
//                 dodge the shards. A PRISM orb gives a shield that smashes shards for points
//  Glass Breaker  one finger moves two paddles (yours and its reflection at the top); smash the panes of glass in the
//                 middle. Gold panes, tough panes, PRISM panes (an extra ball) and WIDE panes. Every cleared wall
//                 brings a new, faster one
//  Flipside       a runner between a floor and a ceiling: tap to flip gravity. Dodge spikes and glass pillars, jump
//                 the gaps, grab shards. Clean running builds a multiplier
//  Symmetry       a pattern lights up on one side of the mirror; tap its reflection on the other side before the
//                 light runs out. Bigger grids, more tiles and less time as you go; gold tiles pay ×5
import { useEffect, useRef } from 'react';
import { Hud, Lives, clamp, rng, tap, usePops, type ArenaProps } from '../games';
import { Led, RAINBOW, Screen, Tip, bg, glowCircle, run2d, sparks, useHud, type Engine } from '../games2';
import { sfx } from '../sfx';

const SILVER = '#DDE8FF';
/** the glowing mirror line down (or across) the middle */
function mirrorLine(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number) {
  g.save();
  g.strokeStyle = 'rgba(221,232,255,0.85)'; g.lineWidth = 2; g.shadowColor = '#9FD8FF'; g.shadowBlur = 14;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  // a glint running along it
  const k = (t * 0.45) % 1, gx = x0 + (x1 - x0) * k, gy = y0 + (y1 - y0) * k;
  g.shadowBlur = 0; glowCircle(g, gx, gy, 3, '#FFFFFF', 16);
  g.restore();
}

// ======================================================================================================
// Twin Drops
// ======================================================================================================
export function TwinDrops({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, left: 60, mult: 1, shield: 0 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    // lane 0 is the outer lane, 1 the inner one, on each side
    const side = [{ lane: 0, x: 0, spawn: 0.6 }, { lane: 0, x: 0, spawn: 1.0 }];
    type Thing = { s: 0 | 1; lane: number; y: number; kind: 'orb' | 'shard' | 'prism'; dead: boolean };
    const things: Thing[] = [];
    let score = 0, lives = endless ? 3 : 3, over = false, timeLeft = 60, mult = 1, caught = 0, speed = 1, shield = 0, inv = 0, flash = 0, played = 0;
    const laneX = (s: number, lane: number, W: number) => (s === 0 ? (lane === 0 ? W * 0.13 : W * 0.37) : lane === 0 ? W * 0.87 : W * 0.63);
    const end = (why: string) => { if (over) return; over = true; pops.add(why, '#FFE14D', 50, 40, true); sfx.win(4); setTimeout(() => onEnd(score), 1300); };
    const hurt = (why: string) => {
      if (inv > 0) return;
      inv = 0.9; flash = 0.35; mult = Math.max(1, mult - 1); sfx.fail(); tap(haptics, 'heavy');
      lives--; setHud({ lives, mult }); pops.add(lives > 0 ? why : 'SHATTERED!', '#FF3D6E', 50, 50, true);
      if (lives <= 0) end('GAME OVER');
    };
    const flipLane = (s: 0 | 1) => { if (over) return; side[s].lane = 1 - side[s].lane; sfx.blip(s ? 7 : 3); };
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        const dropY = H * 0.84, R = Math.min(W * 0.055, 24);
        if (!over) {
          played += dt;
          speed = endless ? 1 + played / 55 : 1 + played / 80 + (mult - 1) * 0.05;
          if (!endless) { timeLeft -= dt; setHud({ left: Math.max(0, Math.ceil(timeLeft)) }); if (timeLeft <= 0) end('TIME!'); }
          shield = Math.max(0, shield - dt); inv = Math.max(0, inv - dt); setHud({ shield: Math.ceil(shield) });
          const fall = H * 0.42 * speed;
          for (const s of [0, 1] as const) {
            side[s].spawn -= dt * speed;
            if (side[s].spawn <= 0) {
              // one thing at a time per side, far enough apart that there's always time to switch
              side[s].spawn = 0.55 + r() * 0.45;
              const roll = r();
              things.push({ s, lane: r() < 0.5 ? 0 : 1, y: -R, kind: roll < 0.04 ? 'prism' : roll < 0.6 ? 'orb' : 'shard', dead: false });
            }
          }
          for (const s of [0, 1] as const) { const tx = laneX(s, side[s].lane, W); side[s].x = side[s].x ? side[s].x + (tx - side[s].x) * Math.min(1, dt * 20) : tx; }
          for (const th of things) {
            if (th.dead) continue;
            th.y += fall * dt;
            const dx = Math.abs(laneX(th.s, th.lane, W) - side[th.s].x);
            if (Math.abs(th.y - dropY) < R * 1.1 && dx < R * 1.2) {
              th.dead = true;
              const px = (laneX(th.s, th.lane, W) / W) * 100;
              if (th.kind === 'shard') {
                if (shield > 0) { const p = 10 * mult; score += p; fx.burst(side[th.s].x, dropY, ['#FFFFFF', SILVER], 18, 220); sfx.bonk(); pops.add(`SMASH +${p}`, SILVER, px, 70); }
                else { fx.burst(side[th.s].x, dropY, '#FF3D6E', 16, 200); hurt('OUCH! −1'); }
              } else {
                caught++;
                const p = (th.kind === 'prism' ? 25 : 5) * mult * (shield > 0 ? 2 : 1); score += p;
                fx.burst(side[th.s].x, dropY, th.kind === 'prism' ? RAINBOW : th.s ? '#FF7AC8' : '#7FF3FF', th.kind === 'prism' ? 30 : 10, 160);
                if (th.kind === 'prism') { shield = 5; sfx.jackpot(); tap(haptics, 'success'); pops.add('PRISM SHIELD!', '#FFE14D', 50, 35, true); }
                else { sfx.blip(8 + (caught % 6)); tap(haptics); }
                if (caught % 20 === 0) { mult = Math.min(8, mult + 1); sfx.win(4); pops.add(`×${mult}!`, '#3DDC97', 50, 30, true); }
                if (endless && caught % 100 === 0 && lives < 5) { lives++; pops.add('+1 LIFE', '#3DDC97', 50, 45, true); }
                setHud({ score, mult, lives });
              }
            } else if (th.y > H + R) {
              th.dead = true;
              if (th.kind !== 'shard') hurt('MISSED ONE! −1');
            }
          }
          for (let i = things.length - 1; i >= 0; i--) if (things[i].dead) things.splice(i, 1);
        }
        // draw: two dark halves either side of the mirror
        bg(g, W, H, '#0A1630', '#03050F');
        if (flash > 0) { flash -= dt; g.fillStyle = `rgba(255,61,110,${flash})`; g.fillRect(0, 0, W, H); }
        g.strokeStyle = 'rgba(159,216,255,0.12)'; g.lineWidth = 1;
        for (const s of [0, 1]) for (const lane of [0, 1]) { const x = laneX(s, lane, W); g.setLineDash([6, 12]); g.lineDashOffset = -t * 90 * speed; g.beginPath(); g.moveTo(x, 40); g.lineTo(x, H); g.stroke(); }
        g.setLineDash([]);
        mirrorLine(g, W / 2, 30, W / 2, H, t);
        for (const th of things) {
          const x = laneX(th.s, th.lane, W);
          if (th.kind === 'shard') {
            g.save(); g.translate(x, th.y); g.rotate(t * 3 + th.lane); g.fillStyle = '#FFFFFF'; g.shadowColor = '#FF3D6E'; g.shadowBlur = 14;
            g.beginPath(); g.moveTo(0, -R * 0.9); g.lineTo(R * 0.55, 0); g.lineTo(0, R * 0.9); g.lineTo(-R * 0.55, 0); g.closePath(); g.fill(); g.restore();
          } else if (th.kind === 'prism') glowCircle(g, x, th.y, R * 0.6, RAINBOW[Math.floor(t * 10) % RAINBOW.length], 24);
          else glowCircle(g, x, th.y, R * 0.45, th.s ? '#FF7AC8' : '#7FF3FF', 14);
        }
        for (const s of [0, 1] as const) {
          if (inv > 0 && Math.floor(t * 16) % 2) continue;
          const x = side[s].x || laneX(s, 0, W), c = s ? '#FF7AC8' : '#7FF3FF';
          if (shield > 0) { g.strokeStyle = RAINBOW[Math.floor(t * 8 + s) % RAINBOW.length]; g.lineWidth = 3; g.beginPath(); g.arc(x, dropY, R * 1.35, 0, Math.PI * 2); g.stroke(); }
          g.save(); g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 20;
          g.beginPath(); g.moveTo(x, dropY - R * 1.25); g.bezierCurveTo(x + R, dropY - R * 0.2, x + R, dropY + R * 0.9, x, dropY + R * 0.9); g.bezierCurveTo(x - R, dropY + R * 0.9, x - R, dropY - R * 0.2, x, dropY - R * 1.25); g.fill();
          g.restore();
          g.fillStyle = '#05070F'; g.beginPath(); g.arc(x - R * 0.3, dropY + R * 0.1, R * 0.12, 0, Math.PI * 2); g.arc(x + R * 0.3, dropY + R * 0.1, R * 0.12, 0, Math.PI * 2); g.fill();
        }
        fx.draw(g, dt);
      },
      down: (p) => { const W = cv.current!.getBoundingClientRect().width; flipLane(p.x < W / 2 ? 0 : 1); },
      key: (k, d) => { if (!d) return; if (k === 'ArrowLeft' || k === 'a') flipLane(0); if (k === 'ArrowRight' || k === 'd') flipLane(1); },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="twin" cv={cv}>
      <Hud score={hud.score} left={<Led label="MULT" v={hud.shield ? `×${hud.mult} 🛡${hud.shield}` : `×${hud.mult}`} c={hud.shield ? '#FFE14D' : '#3DDC97'} />}
        right={endless ? <Lives n={hud.lives} max={5} /> : <div className="flex gap-1.5"><Lives n={hud.lives} max={3} /><Led label="TIME" v={hud.left} /></div>} />
      <Tip>TAP A SIDE TO SWITCH THAT DROP · catch the orbs, dodge the shards</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Glass Breaker
// ======================================================================================================
export function GlassBreaker({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, level: 1, combo: 0 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    type Pane = { c: number; row: number; hp: number; kind: 'glass' | 'tough' | 'gold' | 'prism' | 'wide'; alive: boolean };
    type Ball = { x: number; y: number; vx: number; vy: number; stuck: number };
    let panes: Pane[] = [], balls: Ball[] = [], score = 0, lives = 3, level = 1, combo = 0, over = false, wide = 0, px = 0.5, keyDir = 0, shake = 0, between = 0;
    const COLS = 7;
    let W = 0, H = 0;
    const rowsFor = (lv: number) => Math.min(8, 4 + Math.floor((lv - 1) / 1.5)) & ~1; // always even: mirrored top and bottom
    const geo = () => {
      const topY = 64, botY = H - 46, rows = rowsFor(level);
      const pw = (W - 24) / COLS, ph = Math.min(22, (botY - topY) * 0.42 / rows), y0 = (topY + botY) / 2 - (rows * ph) / 2;
      return { topY, botY, rows, pw, ph, y0, padW: W * (wide > 0 ? 0.36 : 0.24) };
    };
    const build = () => {
      const rows = rowsFor(level), half = rows / 2;
      panes = [];
      // a pattern for one quarter, reflected left-right and top-bottom
      for (let row = 0; row < half; row++) for (let c = 0; c < Math.ceil(COLS / 2); c++) {
        if (level > 1 && r() < 0.12 + Math.min(0.15, level * 0.01)) continue;
        const roll = r();
        const kind: Pane['kind'] = roll < 0.06 ? 'gold' : roll < 0.11 ? 'prism' : roll < 0.15 ? 'wide' : roll < 0.15 + Math.min(0.35, level * 0.05) ? 'tough' : 'glass';
        for (const cc of new Set([c, COLS - 1 - c])) for (const rr of [row, rows - 1 - row]) panes.push({ c: cc, row: rr, hp: kind === 'tough' ? 2 : 1, kind, alive: true });
      }
      if (!panes.length) panes.push({ c: 3, row: 0, hp: 1, kind: 'glass', alive: true });
    };
    const serve = () => { balls = [{ x: 0, y: 0, vx: 0, vy: 0, stuck: 0.9 }]; combo = 0; setHud({ combo }); };
    const ballSpeed = () => H * (0.5 + Math.min(0.55, (level - 1) * 0.07));
    const loseBall = () => {
      if (balls.length > 0) return;
      lives--; shake = 0.4; sfx.fail(); tap(haptics, 'heavy'); setHud({ lives });
      if (lives <= 0) { over = true; pops.add('GAME OVER', '#FF3D6E', 50, 45, true); setTimeout(() => onEnd(score), 1400); return; }
      pops.add('−1 BALL', '#FF3D6E', 50, 50, true); serve();
    };
    const hitPane = (p: Pane, b: Ball) => {
      p.hp--;
      const G = geo(), cx = 12 + (p.c + 0.5) * G.pw, cy = G.y0 + (p.row + 0.5) * G.ph;
      if (p.hp > 0) { sfx.tick(); fx.burst(cx, cy, SILVER, 6, 90); return; }
      p.alive = false; combo++;
      const base = p.kind === 'gold' ? 50 : p.kind === 'tough' ? 20 : 10;
      const pts = base * Math.min(5, 1 + Math.floor(combo / 3)) * (1 + Math.floor((level - 1) / 3)); score += pts;
      fx.burst(cx, cy, p.kind === 'gold' ? '#FFD84D' : p.kind === 'prism' ? RAINBOW : ['#FFFFFF', '#BFE3FF', '#9FD8FF'], reduce ? 6 : 16, 200);
      sfx.blip(6 + Math.min(12, combo)); tap(haptics);
      if (p.kind === 'gold') pops.add(`GOLD +${pts}`, '#FFD84D', (cx / W) * 100, (cy / H) * 100, true);
      else if (combo > 0 && combo % 5 === 0) pops.add(`COMBO ×${Math.min(5, 1 + Math.floor(combo / 3))}`, '#3DDC97', 50, 50, true);
      if (p.kind === 'prism') { balls.push({ x: b.x, y: b.y, vx: -b.vx, vy: b.vy, stuck: 0 }); sfx.jackpot(); pops.add('MULTIBALL!', '#FF7AC8', 50, 40, true); }
      if (p.kind === 'wide') { wide = 12; sfx.win(3); pops.add('WIDE PADDLES!', '#22E3FF', 50, 40, true); }
      setHud({ score, combo });
      if (!panes.some((q) => q.alive)) {
        const bonus = 100 * level; score += bonus; sfx.jackpot(); tap(haptics, 'success');
        pops.add(`WALL ${level} CLEARED +${bonus}`, '#FFE14D', 50, 45, true);
        if (!endless && level >= 5) { over = true; setTimeout(() => onEnd(score), 1500); setHud({ score }); return; }
        level++; if (endless && level % 3 === 1 && lives < 5) { lives++; pops.add('+1 BALL', '#3DDC97', 50, 58, true); }
        between = 1.1; setHud({ score, level, lives });
      }
    };
    const eng: Engine = {
      frame(g, w, h, dt, t) {
        const first = !W; W = w; H = h; if (first) { build(); serve(); }
        const G = geo();
        wide = Math.max(0, wide - dt);
        if (keyDir) px = clamp(px + keyDir * dt * 1.4, 0, 1);
        const padX = clamp(px * W, G.padW / 2, W - G.padW / 2);
        if (between > 0) { between -= dt; if (between <= 0) { build(); serve(); } }
        if (!over && between <= 0) {
          for (const b of balls) {
            if (b.stuck > 0) {
              b.stuck -= dt; b.x = padX; b.y = G.botY - 10;
              if (b.stuck <= 0) { const sp = ballSpeed(), a = (r() - 0.5) * 0.9; b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; }
              continue;
            }
            const steps = 3;
            for (let s = 0; s < steps; s++) {
              const sd = dt / steps;
              b.x += b.vx * sd; b.y += b.vy * sd;
              if (b.x < 8) { b.x = 8; b.vx = Math.abs(b.vx); sfx.tick(); }
              if (b.x > W - 8) { b.x = W - 8; b.vx = -Math.abs(b.vx); sfx.tick(); }
              // the two paddles: yours at the bottom, your reflection at the top
              for (const [py, dirUp] of [[G.botY, true], [G.topY, false]] as const) {
                const towards = dirUp ? b.vy > 0 : b.vy < 0;
                if (towards && Math.abs(b.y - py) < 9 && Math.abs(b.x - padX) < G.padW / 2 + 7) {
                  const off = clamp((b.x - padX) / (G.padW / 2), -1, 1), sp = Math.min(ballSpeed() * 1.35, Math.hypot(b.vx, b.vy) * 1.01), a = off * 1.05;
                  b.vx = Math.sin(a) * sp; b.vy = (dirUp ? -1 : 1) * Math.cos(a) * sp; b.y = dirUp ? py - 9 : py + 9;
                  combo = 0; setHud({ combo }); sfx.bonk(); tap(haptics);
                }
              }
              // panes
              for (const p of panes) {
                if (!p.alive) continue;
                const x0 = 12 + p.c * G.pw + 2, x1 = x0 + G.pw - 4, y0 = G.y0 + p.row * G.ph + 2, y1 = y0 + G.ph - 4;
                if (b.x + 6 < x0 || b.x - 6 > x1 || b.y + 6 < y0 || b.y - 6 > y1) continue;
                const ox = Math.min(b.x + 6 - x0, x1 - (b.x - 6)), oy = Math.min(b.y + 6 - y0, y1 - (b.y - 6));
                if (ox < oy) { b.vx = -b.vx; b.x += b.vx > 0 ? ox : -ox; } else { b.vy = -b.vy; b.y += b.vy > 0 ? oy : -oy; }
                hitPane(p, b);
                break;
              }
              // never a flat, endless sideways bounce
              const sp = Math.hypot(b.vx, b.vy); if (Math.abs(b.vy) < sp * 0.3) { b.vy = Math.sign(b.vy || 1) * sp * 0.3; b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy); }
            }
          }
          const before = balls.length;
          balls = balls.filter((b) => b.y > G.topY - 30 && b.y < G.botY + 30);
          if (balls.length < before) { if (!balls.length) loseBall(); else sfx.thud(); }
        }
        // draw
        shake = Math.max(0, shake - dt);
        g.save(); if (shake) g.translate((Math.random() - 0.5) * shake * 16, 0);
        bg(g, W, H, '#0A1228', '#050812');
        mirrorLine(g, 0, (G.topY + G.botY) / 2, W, (G.topY + G.botY) / 2, t);
        for (const p of panes) {
          if (!p.alive) continue;
          const x = 12 + p.c * G.pw + 2, y = G.y0 + p.row * G.ph + 2, w2 = G.pw - 4, h2 = G.ph - 4;
          const col = p.kind === 'gold' ? '#FFD84D' : p.kind === 'prism' ? RAINBOW[(p.c + p.row + Math.floor(t * 6)) % RAINBOW.length] : p.kind === 'wide' ? '#22E3FF' : p.kind === 'tough' ? (p.hp > 1 ? '#8FA8D8' : '#C9D9F5') : '#BFE3FF';
          g.fillStyle = col; g.globalAlpha = p.kind === 'glass' ? 0.55 : 0.85; g.shadowColor = col; g.shadowBlur = p.kind === 'glass' ? 4 : 12;
          g.beginPath(); g.roundRect(x, y, w2, h2, 3); g.fill(); g.shadowBlur = 0; g.globalAlpha = 1;
          g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 3, y + 3); g.lineTo(x + w2 * 0.4, y + 3); g.stroke();
          if (p.kind === 'tough' && p.hp === 1) { g.strokeStyle = 'rgba(5,8,18,0.8)'; g.beginPath(); g.moveTo(x + w2 * 0.3, y); g.lineTo(x + w2 * 0.5, y + h2 * 0.6); g.lineTo(x + w2 * 0.7, y + h2); g.stroke(); }
        }
        for (const [py, c] of [[G.botY, '#7FF3FF'], [G.topY, '#FF7AC8']] as const) {
          g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 16; g.beginPath(); g.roundRect(padX - G.padW / 2, py - 5, G.padW, 10, 5); g.fill(); g.shadowBlur = 0;
        }
        for (const b of balls) glowCircle(g, b.x, b.y, 6.5, '#FFFFFF', 16);
        if (between > 0) { g.font = '900 24px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFE14D'; g.fillText(`WALL ${level}`, W / 2, (G.topY + G.botY) / 2 - 30); }
        g.restore();
        fx.draw(g, dt);
      },
      down: (p) => { px = clamp(p.x / Math.max(1, W), 0, 1); },
      move: (p) => { px = clamp(p.x / Math.max(1, W), 0, 1); },
      key: (k, d) => { if (k === 'ArrowLeft' || k === 'a') keyDir = d ? -1 : keyDir === -1 ? 0 : keyDir; if (k === 'ArrowRight' || k === 'd') keyDir = d ? 1 : keyDir === 1 ? 0 : keyDir; },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="glass" cv={cv}>
      <Hud score={hud.score} left={<Led label="WALL" v={endless ? hud.level : `${hud.level}/5`} />} right={<Lives n={hud.lives} max={endless ? 5 : 3} />} />
      <Tip>DRAG TO MOVE BOTH PADDLES · keep the ball between them</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Flipside
// ======================================================================================================
export function Flipside({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, left: 60, mult: 1 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    // everything is laid out in corridor units: 0 is the floor, 1 the ceiling; x in pixels from the left
    type Ob = { x: number; w: number; kind: 'spike' | 'pillar' | 'gap' | 'shard' | 'gold'; on: 0 | 1; h: number; done: boolean };
    const obs: Ob[] = [];
    let y = 0, vy = 0, grav: 0 | 1 = 0, grounded = true, speed = 0, dist = 0, scoreF = 0, score = 0, lives = 3, over = false, timeLeft = 60;
    let inv = 0, clean = 0, mult = 1, nextAt = 0, played = 0, falling = 0, flash = 0;
    let W = 0, H = 0;
    const end = (why: string) => { if (over) return; over = true; pops.add(why, '#FFE14D', 50, 40, true); sfx.win(4); setTimeout(() => onEnd(score), 1300); };
    const hurt = (why: string) => {
      if (inv > 0 || over) return;
      inv = 1.3; flash = 0.3; clean = 0; mult = 1; sfx.fail(); tap(haptics, 'heavy'); lives--; setHud({ lives, mult });
      pops.add(lives > 0 ? why : 'WIPED OUT!', '#FF3D6E', 50, 45, true);
      if (lives <= 0) end('GAME OVER');
    };
    const flip = () => { if (over || !grounded || falling > 0) return; grav = grav ? 0 : 1; grounded = false; vy = 0; sfx.swish(); tap(haptics); };
    // the next stretch of corridor, always passable: one hazard on one side, with room to flip between them
    const spawn = (x: number) => {
      const roll = r(), on: 0 | 1 = r() < 0.5 ? 0 : 1, lvl = Math.min(1, played / 90);
      if (roll < 0.34) obs.push({ x, w: 40 + r() * (60 + lvl * 60), kind: 'spike', on, h: 0.16, done: false });
      else if (roll < 0.6) obs.push({ x, w: 26, kind: 'pillar', on, h: 0.42 + r() * 0.12 + lvl * 0.08, done: false });
      else if (roll < 0.8) obs.push({ x, w: 50 + r() * 50 + lvl * 40, kind: 'gap', on, h: 0, done: false });
      else { for (let i = 0; i < 4; i++) obs.push({ x: x + i * 34, w: 14, kind: r() < 0.08 ? 'gold' : 'shard', on: r() < 0.5 ? 0 : 1, h: 0, done: false }); }
      if (r() < 0.35) obs.push({ x: x + 60 + r() * 60, w: 14, kind: 'shard', on: on ? 0 : 1, h: 0, done: false });
    };
    const eng: Engine = {
      frame(g, w, h, dt, t) {
        W = w; H = h;
        const top = H * 0.24, bot = H * 0.82, ch = bot - top, S = Math.min(26, ch * 0.09), PX = W * 0.24;
        if (!speed) { speed = W * 0.5; nextAt = W * 0.9; }
        if (!over) {
          played += dt;
          speed = Math.min(W * (endless ? 1.55 : 1.25), speed + W * 0.006 * dt * 1.4);
          dist += speed * dt; scoreF += speed * dt * 0.05 * mult;
          if (Math.floor(scoreF) > score) { score = Math.floor(scoreF); setHud({ score }); }
          if (!endless) { timeLeft -= dt; setHud({ left: Math.max(0, Math.ceil(timeLeft)) }); if (timeLeft <= 0) end('FINISH!'); }
          inv = Math.max(0, inv - dt);
          clean += dt; if (clean > 8 && mult < 5) { clean = 0; mult++; setHud({ mult }); sfx.win(3); pops.add(`CLEAN RUN ×${mult}`, '#3DDC97', 50, 32, true); }
          // gravity toward the floor (0) or the ceiling (1)
          const gy = grav ? 1 : 0;
          vy += (gy ? 1 : -1) * 9 * dt; y += vy * dt;
          if (falling > 0) {
            // fell out of the corridor: back on the floor in a moment
            falling -= dt;
            if (falling <= 0) { y = 0; vy = 0; grav = 0; grounded = true; inv = Math.max(inv, 1); }
          } else if ((gy === 1 && y >= 1) || (gy === 0 && y <= 0)) {
            const hole = obs.some((o) => o.kind === 'gap' && o.on === gy && PX > o.x + 6 && PX < o.x + o.w - 6);
            if (!hole) { y = gy; vy = 0; grounded = true; }
            else {
              // no floor (or ceiling) here: you slip through it
              grounded = false;
              if (Math.abs(y - gy) > 0.3) { falling = 0.7; if (inv <= 0) hurt('FELL THROUGH! −1'); }
            }
          }
          // scroll the hazards past
          for (const o of obs) o.x -= speed * dt;
          nextAt -= speed * dt;
          if (nextAt <= W + 40) { spawn(W + 60); nextAt += W * (0.42 + r() * 0.2) * (1 + Math.min(0.6, played / 120)); }
          const py = bot - y * ch;
          for (const o of obs) {
            if (o.done || o.x > PX + S / 2 || o.x + o.w < PX - S / 2) continue;
            if (o.kind === 'shard' || o.kind === 'gold') {
              const oy = o.on ? top + S * 1.2 : bot - S * 1.2;
              if (Math.abs(oy - py) < S * 1.3) { o.done = true; const p = (o.kind === 'gold' ? 50 : 10) * mult; scoreF += p; sfx.coin(); fx.burst(PX, py, o.kind === 'gold' ? '#FFD84D' : SILVER, 10, 140); if (o.kind === 'gold') pops.add(`GOLD +${p}`, '#FFD84D', 30, 40); }
            } else if (o.kind === 'spike') {
              if (grounded && grav === o.on && falling <= 0) { o.done = true; fx.burst(PX, py, '#FF3D6E', 14, 180); hurt('SPIKED! −1'); }
            } else if (o.kind === 'pillar') {
              const reach = o.h; // the pillar fills this much of the corridor from its side
              const inside = o.on ? y > 1 - reach - 0.04 : y < reach + 0.04;
              if (inside) { o.done = true; fx.burst(PX, py, ['#FFFFFF', SILVER], 20, 220); hurt('SMASHED THE GLASS! −1'); }
            }
          }
          for (let i = obs.length - 1; i >= 0; i--) if (obs[i].x + obs[i].w < -80) obs.splice(i, 1);
        }
        // draw: a corridor with a mirror floor and ceiling
        bg(g, W, H, '#0B1026', '#04060F');
        if (flash > 0) { flash -= dt; g.fillStyle = `rgba(255,61,110,${flash})`; g.fillRect(0, 0, W, H); }
        const off = dist % 40;
        for (const [sy, dir] of [[bot, 1], [top, -1]] as const) {
          g.fillStyle = 'rgba(221,232,255,0.08)'; g.fillRect(0, dir > 0 ? sy : 0, W, dir > 0 ? H - sy : sy);
          g.strokeStyle = 'rgba(221,232,255,0.75)'; g.lineWidth = 2; g.shadowColor = '#9FD8FF'; g.shadowBlur = 10;
          g.beginPath(); g.moveTo(0, sy); g.lineTo(W, sy); g.stroke(); g.shadowBlur = 0;
          g.strokeStyle = 'rgba(221,232,255,0.15)'; g.lineWidth = 1;
          for (let x = -off; x < W; x += 40) { g.beginPath(); g.moveTo(x, sy); g.lineTo(x - 14, sy + dir * 16); g.stroke(); }
        }
        for (const o of obs) {
          if (o.done && (o.kind === 'shard' || o.kind === 'gold')) continue;
          const sy = o.on ? top : bot, dir = o.on ? 1 : -1;
          if (o.kind === 'gap') { g.fillStyle = '#04060F'; g.fillRect(o.x, o.on ? 0 : sy - 1, o.w, o.on ? sy + 2 : H - sy + 1); }
          else if (o.kind === 'spike') {
            g.fillStyle = '#FF3D6E'; g.shadowColor = '#FF3D6E'; g.shadowBlur = 10; g.beginPath();
            for (let x = o.x; x < o.x + o.w - 2; x += 14) { g.moveTo(x, sy); g.lineTo(x + 7, sy + dir * S * 0.9); g.lineTo(x + 14, sy); }
            g.fill(); g.shadowBlur = 0;
          } else if (o.kind === 'pillar') {
            const ph = o.h * ch, yy = o.on ? top : bot - ph;
            g.fillStyle = 'rgba(191,227,255,0.55)'; g.shadowColor = '#BFE3FF'; g.shadowBlur = 12; g.fillRect(o.x, yy, o.w, ph); g.shadowBlur = 0;
            g.strokeStyle = '#FFFFFF'; g.lineWidth = 1; g.strokeRect(o.x + 0.5, yy + 0.5, o.w - 1, ph - 1);
            g.beginPath(); g.moveTo(o.x + 5, yy + 6); g.lineTo(o.x + 5, yy + ph - 6); g.stroke();
          } else glowCircle(g, o.x + 7, o.on ? top + S * 1.2 : bot - S * 1.2, o.kind === 'gold' ? 8 : 5.5, o.kind === 'gold' ? '#FFD84D' : SILVER, 14);
        }
        // you: a glowing cube, a little squashed toward the side gravity pulls you to
        const py = falling > 0 ? bot - y * ch : bot - clamp(y, 0, 1) * ch;
        if (!(inv > 0 && Math.floor(t * 16) % 2)) {
          const c = grav ? '#FF7AC8' : '#7FF3FF';
          g.save(); g.translate(PX, py + (grav ? S / 2 : -S / 2)); g.rotate(grounded ? 0 : (grav ? 1 : -1) * Math.min(1, Math.abs(vy) / 3) * 0.6);
          g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 20; g.fillRect(-S / 2, -S / 2, S, S); g.shadowBlur = 0;
          g.fillStyle = '#05070F'; g.fillRect(S * 0.08, -S * 0.18, S * 0.14, S * 0.14); g.fillRect(S * 0.3, -S * 0.18, S * 0.14, S * 0.14);
          g.restore();
          // your reflection in the other surface
          g.globalAlpha = 0.18; g.fillStyle = grav ? '#7FF3FF' : '#FF7AC8'; g.fillRect(PX - S / 2, grav ? bot - S : top, S, S); g.globalAlpha = 1;
        }
        fx.draw(g, dt);
      },
      down: () => flip(),
      key: (k, d) => { if (d && (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'w' || k === 's')) flip(); },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="flip" cv={cv}>
      <Hud score={hud.score} left={<Led label="MULT" v={`×${hud.mult}`} c="#3DDC97" />} right={endless ? <Lives n={hud.lives} max={3} /> : <div className="flex gap-1.5"><Lives n={hud.lives} max={3} /><Led label="TIME" v={hud.left} /></div>} />
      <Tip>TAP TO FLIP GRAVITY · dodge spikes and glass, jump the gaps</Tip>
      {pops.el}
    </Screen>
  );
}

// ======================================================================================================
// Symmetry
// ======================================================================================================
export function Symmetry({ seed, onEnd, haptics, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, left: 75, streak: 0, round: 1 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    let score = 0, lives = 3, over = false, timeLeft = 75, streak = 0, round = 0, n = 3, flipSide = false;
    let pattern: number[] = [], gold = -1, got = new Set<number>(), limit = 3, left = 3, pause = 0.6, reveal = 0, wrongCell = -1, rr = 0;
    let W = 0, H = 0;
    const mult = () => Math.min(5, 1 + Math.floor(streak / 4));
    const end = (why: string) => { if (over) return; over = true; pops.add(why, '#FFE14D', 50, 40, true); sfx.win(4); setTimeout(() => onEnd(score), 1300); };
    const next = () => {
      round++; rr++;
      n = round <= 5 ? 3 : round <= 14 ? 4 : 5;
      const k = Math.min(Math.floor((n * n) / 2), 2 + Math.floor(round / 2));
      const cells = Array.from({ length: n * n }, (_, i) => i);
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      pattern = cells.slice(0, k); gold = r() < 0.3 ? pattern[Math.floor(r() * k)] : -1; got = new Set();
      flipSide = round > 6 && r() < 0.35;
      limit = Math.max(1.2, (1.6 + k * 0.55) * (endless ? Math.max(0.45, 1 - round * 0.02) : Math.max(0.6, 1 - round * 0.015)));
      left = limit; wrongCell = -1;
      setHud({ round });
    };
    const fail = (why: string) => {
      streak = 0; lives--; sfx.fail(); tap(haptics, 'heavy'); setHud({ lives, streak });
      pops.add(lives > 0 ? why : 'OUT OF LIVES', '#FF3D6E', 50, 50, true);
      reveal = 0.9; if (lives <= 0) end('GAME OVER');
    };
    // where the two grids sit: side by side on a wide screen, one above the other on a tall one
    const layout = () => {
      const tall = H > W * 1.05, gap = 26;
      const size = tall ? Math.min(W * 0.78, (H - 110 - gap) / 2) : Math.min((W - gap - 30) / 2, H - 120);
      const A = tall ? { x: (W - size) / 2, y: 52 } : { x: (W - gap) / 2 - size, y: (H - size) / 2 + 10 };
      const B = tall ? { x: A.x, y: A.y + size + gap } : { x: (W + gap) / 2, y: A.y };
      return { tall, size, A, B, cs: size / n };
    };
    // a cell's reflection across the mirror line
    const reflect = (i: number, tall: boolean) => { const row = Math.floor(i / n), c = i % n; return tall ? (n - 1 - row) * n + c : row * n + (n - 1 - c); };
    const eng: Engine = {
      frame(g, w, h, dt, t) {
        W = w; H = h;
        const L = layout();
        if (!over) {
          if (!endless) { timeLeft -= dt; setHud({ left: Math.max(0, Math.ceil(timeLeft)) }); if (timeLeft <= 0) end('TIME!'); }
          if (reveal > 0) { reveal -= dt; if (reveal <= 0 && !over) next(); }
          else if (pause > 0) { pause -= dt; if (pause <= 0) next(); }
          else if (pattern.length) { left -= dt; if (left <= 0) { left = 0; fail('TOO SLOW! −1'); } }
        }
        bg(g, W, H, '#140A2A', '#05030F');
        if (L.tall) mirrorLine(g, 12, L.A.y + L.size + 13, W - 12, L.A.y + L.size + 13, t); else mirrorLine(g, W / 2, 40, W / 2, H - 10, t);
        // which grid shows the pattern and which one you tap (they swap on some rounds)
        const show = flipSide ? L.B : L.A, play = flipSide ? L.A : L.B;
        for (const [o, isShow] of [[show, true], [play, false]] as const) {
          for (let i = 0; i < n * n; i++) {
            const x = o.x + (i % n) * L.cs + 3, y = o.y + Math.floor(i / n) * L.cs + 3, s = L.cs - 6;
            const answer = !isShow && pattern.some((p) => reflect(p, L.tall) === i);
            const lit = isShow ? pattern.includes(i) && !pause : got.has(i) || (reveal > 0 && answer);
            const isGold = isShow ? i === gold : gold >= 0 && i === reflect(gold, L.tall);
            const col = !lit ? 'rgba(221,232,255,0.07)' : isGold ? '#FFD84D' : isShow ? '#FF7AC8' : reveal > 0 && !got.has(i) ? 'rgba(255,61,110,0.7)' : '#7FF3FF';
            g.fillStyle = i === wrongCell && !isShow ? '#FF3D6E' : col;
            if (lit) { g.shadowColor = col; g.shadowBlur = 16; }
            g.beginPath(); g.roundRect(x, y, s, s, Math.min(10, s * 0.18)); g.fill(); g.shadowBlur = 0;
            g.strokeStyle = 'rgba(221,232,255,0.18)'; g.lineWidth = 1; g.stroke();
          }
        }
        // the light running out
        if (pattern.length && !pause && reveal <= 0) {
          const k = left / limit, bw = W * 0.7;
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect((W - bw) / 2, H - 18, bw, 6);
          g.fillStyle = k > 0.35 ? '#7FF3FF' : '#FF3D6E'; g.fillRect((W - bw) / 2, H - 18, bw * k, 6);
        }
        if (flipSide && pattern.length && !pause && reveal <= 0 && rr) { g.font = '800 11px ui-monospace, monospace'; g.textAlign = 'center'; g.fillStyle = '#FFE14D'; g.fillText('↕ REVERSED', W / 2, H - 26); }
        fx.draw(g, dt);
      },
      down: (p) => {
        if (over || pause > 0 || reveal > 0 || !pattern.length) return;
        const L = layout(), play = flipSide ? L.A : L.B;
        const c = Math.floor((p.x - play.x) / L.cs), row = Math.floor((p.y - play.y) / L.cs);
        if (c < 0 || row < 0 || c >= n || row >= n) return;
        const i = row * n + c;
        if (got.has(i)) return;
        const want = pattern.map((q) => reflect(q, L.tall));
        const cx = play.x + (c + 0.5) * L.cs, cy = play.y + (row + 0.5) * L.cs;
        if (!want.includes(i)) { wrongCell = i; fx.burst(cx, cy, '#FF3D6E', 10, 140); fail('WRONG TILE! −1'); return; }
        got.add(i);
        const isGold = gold >= 0 && i === reflect(gold, L.tall), pts = (isGold ? 50 : 10) * mult(); score += pts;
        sfx.blip(5 + got.size); tap(haptics); fx.burst(cx, cy, isGold ? '#FFD84D' : '#7FF3FF', isGold ? 20 : 8, 150);
        if (isGold) pops.add(`GOLD +${pts}`, '#FFD84D', (cx / W) * 100, (cy / H) * 100);
        if (got.size === want.length) {
          streak++;
          const bonus = Math.round((pattern.length * 5 + left * 10) * mult()); score += bonus;
          sfx.win(Math.min(5, 2 + Math.floor(streak / 3))); pops.add(streak % 4 === 0 ? `STREAK ${streak}! ×${mult()}` : `+${bonus}`, streak % 4 === 0 ? '#3DDC97' : '#FFE14D', 50, 50, streak % 4 === 0);
          pattern = []; pause = 0.45;
        }
        setHud({ score, streak });
      },
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="sym" cv={cv}>
      <Hud score={hud.score} left={<Led label="STREAK" v={hud.streak} c="#3DDC97" />} right={endless ? <Lives n={hud.lives} max={3} /> : <div className="flex gap-1.5"><Lives n={hud.lives} max={3} /><Led label="TIME" v={hud.left} /></div>} />
      <Tip>TAP THE REFLECTION OF THE PINK TILES</Tip>
      {pops.el}
    </Screen>
  );
}

export const MIRROR_ARENAS: Record<string, (p: ArenaProps) => React.ReactElement> = { twin: TwinDrops, glass: GlassBreaker, flip: Flipside, sym: Symmetry };
export const MIRROR_HOW: Record<string, string> = {
  twin: 'Two drops, one each side of the mirror. Tap the left or right side to switch that drop’s lane. Catch every orb and dodge the shards. 60 seconds, three lives.',
  glass: 'Drag to move your paddle — its reflection at the top moves with it. Keep the ball between them and smash every pane of glass. Clear five walls.',
  flip: 'You run between a floor and a ceiling. Tap to flip gravity. Dodge the spikes and glass pillars, don’t fall through the gaps, and grab the shards. 60 seconds.',
  sym: 'Pink tiles light up on one side of the mirror. Tap their reflection on the other side before the light runs out. Gold tiles pay ×5. 75 seconds.',
};
export const MIRROR_BONUS: Record<string, string> = {
  twin: '🌈 Catch a PRISM orb for a 5-second shield: shards smash for points and orbs pay double. Every 20 orbs raises your multiplier (up to ×8).',
  glass: '🌈 PRISM panes split your ball in two · 🔷 WIDE panes widen both paddles · 🟨 GOLD panes pay 50. Breaks in a row build a combo up to ×5.',
  flip: '✨ Eight seconds without a hit raises your CLEAN RUN multiplier (up to ×5). Gold shards pay 50.',
  sym: '🔥 Every 4 patterns in a row raises your multiplier (up to ×5). Faster answers pay more. Some rounds are REVERSED.',
};
export const MIRROR_ENDLESS: Record<string, string> = {
  twin: 'No clock — it speeds up forever. An extra life every 100 orbs (up to five).',
  glass: 'Wall after wall, each one faster. An extra ball every three walls.',
  flip: 'No clock — the corridor keeps getting faster until you’re out of lives.',
  sym: 'No clock — grids grow and the light runs out faster every round.',
};
