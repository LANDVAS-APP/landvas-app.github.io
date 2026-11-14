// LAND GRAB — the Founder's Code's cabinet. LANDVAS itself as an arcade game: you're a drop of ink on a blank map.
// Off your own land you leave a wet trail; get back onto your land and everything you closed off (that no smudge is
// in) becomes yours, filled in the logo's colours one claim after another. Smudges bounce round the open map: if one
// touches your wet trail (or you, out in the open), the trail dries up and you lose a life. Crossing your own trail
// does the same. Claim 75% to clear the map; gold plots pay extra; a claim of 10%+ in one go pays double.
// Classic: three maps. Endless: map after map, more smudges and faster every time, an extra life every second map.
import { useEffect, useRef } from 'react';
import { Hud, Lives, rng, tap, usePops, type ArenaProps } from '../games';
import { DIRS, Led, Screen, Tip, glowCircle, run2d, sparks, swipe, useHud, type Engine } from '../games2';
import { sfx } from '../sfx';
import { LOGO, setMeta } from './meta';

const EMPTY = 0, OWN = 1, TRAIL = 2;

export function LandGrab({ seed, onEnd, haptics, reduce, mode }: ArenaProps) {
  const endless = mode === 'endless';
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useHud({ score: 0, lives: 3, level: 1, pct: 0 });
  const pops = usePops();
  useEffect(() => {
    const r = rng(seed), fx = sparks();
    let GW = 24, GH = 36, cs = 10, ox = 0, oy = 0;
    let cell = new Uint8Array(0), col = new Uint8Array(0), gold = new Uint8Array(0);
    let interior = 1, owned0 = 0, ownedN = 0, claims = 0;
    let score = 0, lives = 3, level = 1, over = false, pause = 1.2, flash = 0, inv = 0, levelT = 0;
    // you: on a cell, heading somewhere, part of the way to the next cell
    const me = { x: 0, y: 0, dir: -1 as number, want: -1 as number, k: 0, startX: 0, startY: 0 };
    let trail: number[] = [];
    type Smudge = { x: number; y: number; vx: number; vy: number; r: number };
    let smudges: Smudge[] = [];
    let built = false;
    const at = (x: number, y: number) => y * GW + x;
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH;
    const build = () => {
      cell = new Uint8Array(GW * GH); col = new Uint8Array(GW * GH); gold = new Uint8Array(GW * GH);
      // the edge of the map is yours from the start (somewhere to stand), plus a little home plot at the bottom
      for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) { cell[at(x, y)] = OWN; col[at(x, y)] = 255; }
      const hx = Math.floor(GW / 2) - 2, hy = GH - 5;
      for (let x = hx; x < hx + 4; x++) for (let y = hy; y < hy + 4; y++) { cell[at(x, y)] = OWN; col[at(x, y)] = 0; }
      owned0 = 0; for (let i = 0; i < cell.length; i++) if (cell[i] === OWN) owned0++;
      interior = GW * GH - owned0; ownedN = 0; claims = 0;
      me.x = hx + 1; me.y = hy + 1; me.startX = me.x; me.startY = me.y; me.dir = -1; me.want = -1; me.k = 0; trail = [];
      // gold plots out in the open
      for (let i = 0; i < 3 + Math.min(4, level); i++) { const gx = 2 + Math.floor(r() * (GW - 4)), gy = 2 + Math.floor(r() * (GH - 9)); if (cell[at(gx, gy)] === EMPTY) gold[at(gx, gy)] = 1; }
      // the smudges: more, bigger and quicker on every map
      const n = Math.min(8, 1 + level), sp = Math.min(13, 5 + level * 0.9);
      smudges = Array.from({ length: n }, () => {
        const a = (0.2 + r() * 0.3) * Math.PI * (r() < 0.5 ? 1 : 3), s = sp * (0.8 + r() * 0.4);
        return { x: 3 + r() * (GW - 6), y: 3 + r() * (GH * 0.55), vx: Math.cos(a) * s * (r() < 0.5 ? -1 : 1), vy: Math.sin(a) * s, r: 0.42 + Math.min(0.25, level * 0.03) };
      });
      levelT = 0; pause = 1.2;
      setHud({ pct: 0, level });
    };
    const pct = () => Math.min(100, Math.floor((ownedN / interior) * 1000) / 10);
    const lose = (why: string) => {
      if (inv > 0 || over) return;
      // the wet trail dries up and you're back where you stepped off your land
      for (const i of trail) cell[i] = EMPTY;
      trail = []; me.x = me.startX; me.y = me.startY; me.dir = -1; me.want = -1; me.k = 0;
      lives--; inv = 1.4; flash = 0.35; sfx.fail(); tap(haptics, 'heavy'); setHud({ lives });
      pops.add(lives > 0 ? why : 'WASHED OUT', '#FF3D6E', 50, 45, true);
      if (lives <= 0) { over = true; setMeta({ level }); setTimeout(() => onEnd(score), 1500); }
    };
    // close the loop: the trail becomes land, and so does everything closed off from every smudge
    const claim = () => {
      const c = claims % LOGO.length; claims++;
      let got = 0, golds = 0;
      for (const i of trail) { cell[i] = OWN; col[i] = c; got++; if (gold[i]) { golds++; gold[i] = 0; } }
      trail = [];
      const seen = new Uint8Array(GW * GH), stack: number[] = [];
      for (const s of smudges) { const sx = Math.floor(s.x), sy = Math.floor(s.y); if (inside(sx, sy) && cell[at(sx, sy)] !== OWN) { seen[at(sx, sy)] = 1; stack.push(at(sx, sy)); } }
      while (stack.length) {
        const i = stack.pop()!, x = i % GW, y = (i / GW) | 0;
        for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!inside(nx, ny)) continue; const j = at(nx, ny); if (!seen[j] && cell[j] !== OWN) { seen[j] = 1; stack.push(j); } }
      }
      for (let i = 0; i < cell.length; i++) if (cell[i] === EMPTY && !seen[i]) { cell[i] = OWN; col[i] = c; got++; if (gold[i]) { golds++; gold[i] = 0; } }
      ownedN += got;
      const big = got >= interior * 0.1;
      const pts = Math.round(got * 2 * (1 + level * 0.5) * (big ? 2 : 1)) + golds * 250;
      score += pts;
      fx.burst(ox + (me.x + 0.5) * cs, oy + (me.y + 0.5) * cs, [LOGO[c], '#FFFFFF'], reduce ? 6 : Math.min(40, 8 + got / 6), 200);
      if (big) { sfx.jackpot(); tap(haptics, 'success'); pops.add(`LAND GRAB! ×2 +${pts}`, LOGO[c], 50, 40, true); }
      else { sfx.coin(); tap(haptics); pops.add(`+${pts}`, LOGO[c], 50, 45); }
      if (golds) pops.add(`★ GOLD PLOT${golds > 1 ? ` ×${golds}` : ''}`, '#FFD84D', 50, 33, true);
      setHud({ score, pct: pct() });
      if (pct() >= 75) {
        const bonus = 500 * level + Math.max(0, Math.round(120 - levelT)) * 10;
        score += bonus; sfx.win(5); setHud({ score });
        pops.add(`MAP ${level} CLAIMED! +${bonus}`, '#FFE14D', 50, 50, true);
        setMeta({ level });
        if (!endless && level >= 3) { over = true; setTimeout(() => onEnd(score), 1600); return; }
        level++;
        if (endless && level % 2 === 1 && lives < 5) { lives++; pops.add('+1 LIFE', '#3DDC97', 50, 58, true); setHud({ lives }); }
        setTimeout(() => { if (!over) build(); }, 1100); pause = 99;
      }
    };
    // arriving on a new cell
    const step = () => {
      const i = at(me.x, me.y);
      if (cell[i] === TRAIL) { lose('CROSSED YOUR TRAIL! −1'); return; }
      if (cell[i] === OWN) { if (trail.length) claim(); me.startX = me.x; me.startY = me.y; }
      else { if (!trail.length) sfx.blip(3); cell[i] = TRAIL; trail.push(i); }
    };
    const sw = swipe((d) => { me.want = d; if (me.dir < 0 || !trail.length || (d + 2) % 4 !== me.dir) { if (me.dir < 0 || me.k === 0) me.dir = d; } });
    const eng: Engine = {
      frame(g, W, H, dt, t) {
        if (!built) {
          built = true; GW = 24; GH = Math.max(28, Math.min(44, Math.round(GW * ((H - 70) / W))));
          cs = Math.floor(Math.min(W / GW, (H - 70) / GH)); ox = Math.floor((W - cs * GW) / 2); oy = Math.floor(56 + (H - 62 - cs * GH) / 2);
          build();
        }
        if (!over && pause <= 0) {
          levelT += dt; inv = Math.max(0, inv - dt);
          // you move cell to cell; turns happen as you arrive
          const speed = Math.min(14, 8.5 + level * 0.35);
          if (me.dir >= 0) {
            me.k += speed * dt;
            while (me.k >= 1 && !over) {
              me.k -= 1;
              const [dx, dy] = DIRS[me.dir]; const nx = me.x + dx, ny = me.y + dy;
              if (!inside(nx, ny)) { me.k = 0; me.dir = -1; break; }
              me.x = nx; me.y = ny; step();
              if (over || me.dir < 0) break;
              // the turn you asked for (never straight back along a wet trail)
              if (me.want >= 0 && me.want !== me.dir && !(trail.length && (me.want + 2) % 4 === me.dir)) me.dir = me.want;
              const [ax, ay] = DIRS[me.dir]; if (!inside(me.x + ax, me.y + ay)) { me.dir = -1; me.k = 0; }
            }
          } else if (me.want >= 0) { const [ax, ay] = DIRS[me.want]; if (inside(me.x + ax, me.y + ay)) me.dir = me.want; }
          // the smudges bounce round the open map
          for (const s of smudges) {
            const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
            const blockX = !inside(Math.floor(nx), Math.floor(s.y)) || cell[at(Math.floor(nx), Math.floor(s.y))] === OWN;
            const blockY = !inside(Math.floor(s.x), Math.floor(ny)) || cell[at(Math.floor(s.x), Math.floor(ny))] === OWN;
            if (blockX) s.vx = -s.vx; else s.x = nx;
            if (blockY) s.vy = -s.vy; else s.y = ny;
            const ci = inside(Math.floor(s.x), Math.floor(s.y)) ? at(Math.floor(s.x), Math.floor(s.y)) : -1;
            if (ci >= 0 && cell[ci] === OWN) { // squeezed onto land by a claim: pop it back into the open
              let moved = false;
              for (let k = 0; k < 40 && !moved; k++) { const tx = 1 + Math.floor(r() * (GW - 2)), ty = 1 + Math.floor(r() * (GH - 2)); if (cell[at(tx, ty)] === EMPTY) { s.x = tx + 0.5; s.y = ty + 0.5; moved = true; } }
            }
            if (ci >= 0 && cell[ci] === TRAIL) { fx.burst(ox + s.x * cs, oy + s.y * cs, '#FF3D6E', 14, 160); lose('SMUDGED! −1'); }
            const mx = me.x + 0.5 + (me.dir >= 0 ? DIRS[me.dir][0] * me.k : 0), my = me.y + 0.5 + (me.dir >= 0 ? DIRS[me.dir][1] * me.k : 0);
            if (trail.length && Math.hypot(mx - s.x, my - s.y) < s.r + 0.4) lose('SMUDGED! −1');
          }
        } else if (pause > 0 && pause < 50) pause -= dt;
        // ---- draw
        g.fillStyle = '#070B1C'; g.fillRect(0, 0, W, H);
        if (flash > 0) { flash -= dt; g.fillStyle = `rgba(255,61,110,${flash})`; g.fillRect(0, 0, W, H); }
        const pad = cs > 9 ? 1 : 0;
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
          const i = at(x, y), v = cell[i], px = ox + x * cs, py = oy + y * cs;
          if (v === OWN) { g.fillStyle = col[i] === 255 ? '#22306F' : LOGO[col[i]]; g.fillRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2); }
          else if (v === TRAIL) { g.fillStyle = '#8B6BFF'; g.fillRect(px + cs * 0.2, py + cs * 0.2, cs * 0.6, cs * 0.6); }
          else { g.fillStyle = (x + y) % 2 ? '#0D1430' : '#0B1129'; g.fillRect(px, py, cs, cs); }
          if (gold[i] && v !== OWN) glowCircle(g, px + cs / 2, py + cs / 2, cs * 0.32, '#FFD84D', 10);
        }
        // the light glass highlight on owned land (one pass over the whole map, cheap)
        g.fillStyle = 'rgba(255,255,255,0.08)';
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (cell[at(x, y)] === OWN && col[at(x, y)] !== 255) g.fillRect(ox + x * cs + pad, oy + y * cs + pad, cs - pad * 2, Math.max(1, cs * 0.18));
        for (const s of smudges) {
          const sx = ox + s.x * cs, sy = oy + s.y * cs, rr = s.r * cs * 1.25;
          g.fillStyle = '#1A1030'; g.beginPath(); g.arc(sx, sy, rr, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#FF3D6E'; g.lineWidth = 1.5; g.stroke();
          g.fillStyle = '#FFFFFF'; const ex = Math.sign(s.vx) * rr * 0.2;
          g.beginPath(); g.arc(sx - rr * 0.32 + ex, sy - rr * 0.15, rr * 0.2, 0, Math.PI * 2); g.arc(sx + rr * 0.32 + ex, sy - rr * 0.15, rr * 0.2, 0, Math.PI * 2); g.fill();
        }
        const mx = ox + (me.x + 0.5 + (me.dir >= 0 ? DIRS[me.dir][0] * me.k : 0)) * cs, my = oy + (me.y + 0.5 + (me.dir >= 0 ? DIRS[me.dir][1] * me.k : 0)) * cs;
        if (!(inv > 0 && Math.floor(t * 14) % 2)) {
          const R = cs * 0.62;
          g.save(); g.fillStyle = '#FFFFFF'; g.shadowColor = '#8B6BFF'; g.shadowBlur = 16;
          g.beginPath(); g.moveTo(mx, my - R * 1.2); g.bezierCurveTo(mx + R, my - R * 0.1, mx + R * 0.9, my + R * 0.9, mx, my + R * 0.9); g.bezierCurveTo(mx - R * 0.9, my + R * 0.9, mx - R, my - R * 0.1, mx, my - R * 1.2); g.fill(); g.restore();
          g.fillStyle = '#070B1C'; g.beginPath(); g.arc(mx - R * 0.28, my + R * 0.15, R * 0.12, 0, Math.PI * 2); g.arc(mx + R * 0.28, my + R * 0.15, R * 0.12, 0, Math.PI * 2); g.fill();
        }
        if (pause > 0 && pause < 50 && !over) { g.font = '900 26px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFE14D'; g.fillText(`MAP ${level}`, W / 2, oy + cs * GH * 0.42); g.font = '700 12px ui-rounded, system-ui'; g.fillStyle = '#DDE3FF'; g.fillText('claim 75% · swipe to move', W / 2, oy + cs * GH * 0.42 + 26); }
        fx.draw(g, dt);
      },
      down: sw.down, move: sw.move, up: sw.up, key: sw.key,
    };
    return run2d(cv.current!, eng);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="landgrab" cv={cv}>
      <Hud score={hud.score} left={<Led label="CLAIMED" v={`${hud.pct}%`} c={hud.pct >= 60 ? '#3DDC97' : '#FFE14D'} />}
        right={<div className="flex gap-1.5"><Led label="MAP" v={endless ? hud.level : `${hud.level}/3`} /><Lives n={hud.lives} max={endless ? 5 : 3} /></div>} />
      <Tip>SWIPE TO STEER · leave your land, loop back, claim it all</Tip>
      {pops.el}
    </Screen>
  );
}
