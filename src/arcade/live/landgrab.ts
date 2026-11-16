// LAND GRAB, live: 2-4 ink drops on one map, at the same time. Off your land you leave a wet trail; get back onto your
// land and everything you closed off becomes yours (other people's land too). Run across someone's wet trail and
// they're cut: their trail dries up and they're back where they stepped off. Cross your own trail and that's you.
// Smudges roam the open map and cut any trail they touch.
//  · Free for all / 1v1: most land when the clock runs out wins.
//  · 2v2: teammates share their land (and can't cut each other); the bigger team's land wins.
//  · Co-op: one shared land against the smudges. Close off 70% together to clear a map; the next one has more
//    smudges. Five shared lives (one more every second map). How many maps can you clear?
// The host's device runs it (30 steps a second) and streams the map; everyone draws it.
import { type ArenaMode, type LiveDef, type LiveResult, SLOT_COLORS, TEAM_COLORS, bg, clamp, fit, glow, ip, label, placesFrom, rng } from './kit';

const GW = 22, GH = 30, SPEED = 6.2, DASH = 1.6, VERSUS_T = 100, COOP_T = 360, COOP_NEED = 0.7;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
type LGP = {
  x: number; y: number; // cell you're on
  px: number; py: number; // where you're drawn (between cells)
  dir: number; k: number; slot: number; own: number; name: string; col: string;
  trail: number[]; sx: number; sy: number; inv: number; dash: number; cd: number; cuts: number; land0: number; gold: number;
};
type Sm = { x: number; y: number; vx: number; vy: number };
export type LG = {
  mode: ArenaMode; t: number; gw: number; gh: number;
  /** the map as everyone sees it: '.' open, '0'-'3' land by owner, 'a'-'d' a wet trail by slot, '*' gold */
  g: string; ps: Record<string, LGP>; sm: Sm[]; cols: string[]; owners: number;
  lives: number; map: number; cleared: number; flash: number; seed: number; over: boolean;
  /** host only (not sent): land owner per cell (-1 open), wet trail per cell (slot, -1 none), gold cells */
  land?: number[]; tr?: number[]; gold?: number[];
};

const at = (x: number, y: number) => y * GW + x;
const coop = (w: LG) => w.mode === 'coop';

function spawnSmudges(w: LG, n: number, speed: number) {
  const r = rng(w.seed + w.map * 977);
  w.sm = [];
  for (let i = 0; i < n; i++) {
    // somewhere open
    for (let tries = 0; tries < 40; tries++) {
      const x = 2 + r() * (GW - 4), y = 2 + r() * (GH - 4);
      if (w.land![at(Math.floor(x), Math.floor(y))] === -1) {
        const a = r() * Math.PI * 2;
        w.sm.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
        break;
      }
    }
  }
}

function buildMap(w: LG) {
  const land = new Array<number>(GW * GH).fill(-1), tr = new Array<number>(GW * GH).fill(-1), gold: number[] = [];
  w.land = land; w.tr = tr; w.gold = gold;
  const ids = Object.keys(w.ps);
  const r = rng(w.seed + w.map * 131);
  if (coop(w)) {
    // the edge of the map is yours from the start, plus home plots along the bottom
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) land[at(x, y)] = 0;
    ids.forEach((id, i) => {
      const hx = Math.round(((i + 1) / (ids.length + 1)) * GW) - 1, hy = GH - 4;
      for (let x = hx - 1; x <= hx + 1; x++) for (let y = hy - 1; y <= hy + 1; y++) if (x > 0 && x < GW - 1) land[at(x, y)] = 0;
      Object.assign(w.ps[id], { x: hx, y: hy, px: hx, py: hy, dir: -1, k: 0, trail: [], sx: hx, sy: hy, inv: 1.5 });
    });
    spawnSmudges(w, Math.min(7, 1 + w.map + Math.floor(ids.length / 2)), Math.min(9, 3.6 + w.map * 0.7));
  } else {
    // a home plot each, spread round the map
    const homes = [[3, 3], [GW - 4, GH - 4], [GW - 4, 3], [3, GH - 4]];
    ids.forEach((id) => {
      const p = w.ps[id], [hx, hy] = homes[p.slot % 4];
      for (let x = hx - 1; x <= hx + 1; x++) for (let y = hy - 1; y <= hy + 1; y++) land[at(x, y)] = p.own;
      Object.assign(p, { x: hx, y: hy, px: hx, py: hy, dir: -1, k: 0, trail: [], sx: hx, sy: hy, inv: 1.5 });
    });
    spawnSmudges(w, 2, 3.4);
  }
  for (let i = 0; i < 4 + w.map; i++) { const gx = 2 + Math.floor(r() * (GW - 4)), gy = 2 + Math.floor(r() * (GH - 4)); if (land[at(gx, gy)] === -1) gold.push(at(gx, gy)); }
  for (const p of Object.values(w.ps)) p.land0 = 0;
  draw(w);
}

/** the wire format of the map */
function draw(w: LG) {
  const land = w.land!, tr = w.tr!, gold = new Set(w.gold);
  let s = '';
  for (let i = 0; i < land.length; i++) s += tr[i] >= 0 ? 'abcd'[tr[i]] : land[i] >= 0 ? String(land[i]) : gold.has(i) ? '*' : '.';
  w.g = s;
}

function cut(w: LG, p: LGP) {
  if (p.inv > 0) return;
  for (const i of p.trail) if (w.tr![i] === p.slot) w.tr![i] = -1;
  p.trail = []; p.x = p.sx; p.y = p.sy; p.px = p.sx; p.py = p.sy; p.dir = -1; p.k = 0; p.inv = 1.5;
  if (coop(w)) { w.lives--; w.flash = 0.4; }
}

/** back on your land: the trail and everything it closed off become yours */
function claim(w: LG, p: LGP) {
  const land = w.land!, tr = w.tr!, own = p.own;
  for (const i of p.trail) { land[i] = own; if (tr[i] === p.slot) tr[i] = -1; }
  p.trail = [];
  // flood the outside in from the edges (and from every smudge: what a smudge is in stays open)
  const seen = new Uint8Array(GW * GH), stack: number[] = [];
  const push = (x: number, y: number) => { if (x < 0 || y < 0 || x >= GW || y >= GH) return; const i = at(x, y); if (seen[i] || land[i] === own) return; seen[i] = 1; stack.push(i); };
  for (let x = 0; x < GW; x++) { push(x, 0); push(x, GH - 1); }
  for (let y = 0; y < GH; y++) { push(0, y); push(GW - 1, y); }
  for (const s of w.sm) push(Math.floor(s.x), Math.floor(s.y));
  while (stack.length) { const i = stack.pop()!, x = i % GW, y = (i / GW) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  let gained = 0;
  for (let i = 0; i < land.length; i++) if (!seen[i] && land[i] !== own) {
    land[i] = own; gained++;
    // a wet trail closed inside your land dries into it
    if (tr[i] >= 0) { const o = Object.values(w.ps).find((q) => q.slot === tr[i]); if (o && o.own !== own) cut(w, o); tr[i] = -1; }
  }
  // gold plots you closed off are yours (a bonus at the end)
  p.gold += (w.gold ?? []).filter((i) => land[i] === own).length;
  w.gold = (w.gold ?? []).filter((i) => land[i] !== own);
  return gained;
}

function landOf(w: LG) {
  const n = new Array<number>(w.owners).fill(0);
  for (const c of w.g) if (c >= '0' && c <= '3') n[+c]++;
  return n;
}

export const landgrab: LiveDef<LG> = {
  id: 'landgrab', controls: { stick: 'xy', action: '⚡ DASH' },
  init(players, seed, mode) {
    const ps: Record<string, LGP> = {};
    players.forEach((p, i) => {
      const own = mode === 'coop' ? 0 : mode === 'teams' ? p.team ?? i % 2 : i;
      ps[p.id] = { x: 0, y: 0, px: 0, py: 0, dir: -1, k: 0, slot: i, own, name: p.name, col: mode === 'teams' ? TEAM_COLORS[own] : SLOT_COLORS[i % 4], trail: [], sx: 0, sy: 0, inv: 0, dash: 0, cd: 0, cuts: 0, land0: 0, gold: 0 };
    });
    const cols = mode === 'teams' ? TEAM_COLORS : mode === 'coop' ? ['#3DDC97'] : players.map((_, i) => SLOT_COLORS[i % 4]);
    const w: LG = { mode, t: mode === 'coop' ? COOP_T : VERSUS_T, gw: GW, gh: GH, g: '', ps, sm: [], cols, owners: cols.length,
      lives: 5, map: 1, cleared: 0, flash: 0, seed, over: false };
    buildMap(w);
    return w;
  },
  step(w, inputs, dt) {
    if (w.over) return;
    w.t = Math.max(0, w.t - dt); w.flash = Math.max(0, w.flash - dt);
    const land = w.land!, tr = w.tr!;
    // the smudges bounce round the open map, off land
    for (const s of w.sm) {
      let nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      const solid = (x: number, y: number) => x < 0.5 || y < 0.5 || x > GW - 0.5 || y > GH - 0.5 || land[at(clamp(Math.floor(x), 0, GW - 1), clamp(Math.floor(y), 0, GH - 1))] >= 0;
      if (solid(nx, s.y)) { s.vx = -s.vx; nx = s.x; }
      if (solid(nx, ny)) { s.vy = -s.vy; ny = s.y; }
      s.x = nx; s.y = ny;
      // a wet trail it touches dries up (and cuts whoever left it)
      const i = at(clamp(Math.floor(s.x), 0, GW - 1), clamp(Math.floor(s.y), 0, GH - 1));
      if (tr[i] >= 0) { const o = Object.values(w.ps).find((q) => q.slot === tr[i]); if (o) cut(w, o); }
      for (const p of Object.values(w.ps)) if (p.inv <= 0 && land[at(p.x, p.y)] !== p.own && Math.hypot(p.px + 0.5 - s.x, p.py + 0.5 - s.y) < 0.75) cut(w, p);
    }
    for (const [id, p] of Object.entries(w.ps)) {
      const i = inputs[id] ?? { x: 0, y: 0, b: false };
      p.inv = Math.max(0, p.inv - dt); p.cd = Math.max(0, p.cd - dt); p.dash = Math.max(0, p.dash - dt);
      if (i.b && p.cd <= 0) { p.dash = 1.2; p.cd = 6; }
      // the stick picks a direction (no turning straight back on yourself)
      const ax = Math.abs(i.x), ay = Math.abs(i.y);
      const want = ax < 0.3 && ay < 0.3 ? -1 : ax > ay ? (i.x > 0 ? 1 : 3) : (i.y > 0 ? 2 : 0);
      if (p.k === 0 && want >= 0 && !(p.dir >= 0 && p.trail.length && (want + 2) % 4 === p.dir)) p.dir = want;
      if (p.dir < 0) { p.px = p.x; p.py = p.y; continue; }
      const [dx, dy] = DIRS[p.dir];
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) { p.dir = -1; p.k = 0; continue; }
      p.k += dt * SPEED * (p.dash > 0 ? DASH : 1);
      if (p.k < 1) { p.px = p.x + dx * p.k; p.py = p.y + dy * p.k; continue; }
      // into the next cell
      p.k = 0; p.x = nx; p.y = ny; p.px = nx; p.py = ny;
      const c = at(nx, ny);
      if (land[c] === p.own) {
        if (p.trail.length) {
          const got = claim(w, p);
          p.land0 += got;
        }
        p.sx = nx; p.sy = ny;
        if (want < 0) p.dir = -1; // let go of the stick: stop on your land
        continue;
      }
      // out in the open (or on someone else's land): a wet trail
      if (tr[c] >= 0) {
        const o = Object.values(w.ps).find((q) => q.slot === tr[c]);
        if (o === p) { cut(w, p); continue; }
        if (o && o.own !== p.own) { if (o.inv <= 0) { p.cuts++; cut(w, o); } }
        else if (o) o.trail = o.trail.filter((x) => x !== c); // a teammate's: it's yours now
      }
      tr[c] = p.slot; p.trail.push(c);
    }
    // co-op: close off enough of the map together and the next one opens
    if (coop(w)) {
      const mine = land.filter((o) => o === 0).length, edge = 2 * GW + 2 * (GH - 2);
      if ((mine - edge) / (GW * GH - edge) >= COOP_NEED) {
        w.cleared++; w.map++; if (w.map % 2 === 1) w.lives++;
        buildMap(w);
        return;
      }
    }
    draw(w);
  },
  result(w): LiveResult | null {
    if (coop(w)) {
      if (w.lives > 0 && w.t > 0) return null;
      w.over = true;
      // (the server pays co-op by "waves": three for every map cleared)
      return { waves: w.cleared * 3 };
    }
    if (w.t > 0) return null;
    w.over = true;
    const n = landOf(w);
    if (w.mode === 'teams') return { winner: n[0] === n[1] ? null : n[0] > n[1] ? 0 : 1 };
    const pts: Record<string, number> = {};
    for (const [id, p] of Object.entries(w.ps)) pts[id] = (n[p.own] + p.gold * 3) * 100 + p.cuts;
    return { places: placesFrom(pts) };
  },
  snap(w) {
    const { land, tr, gold, ...rest } = w; // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest;
  },
  renderer() {
    return (g, cw, ch, w, prev, a, me, t) => {
      bg(g, cw, ch, '#0A1A1E', '#020A0C');
      const { s, ox, oy } = fit(cw, ch, w.gw, w.gh, 70, 74);
      // the map
      g.fillStyle = '#F4F1EA'; g.fillRect(ox, oy, w.gw * s, w.gh * s);
      for (let i = 0; i < w.g.length; i++) {
        const c = w.g[i]; if (c === '.') continue;
        const x = ox + (i % w.gw) * s, y = oy + Math.floor(i / w.gw) * s;
        if (c === '*') { g.fillStyle = '#FFE14D'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.32, 0, Math.PI * 2); g.fill(); continue; }
        if (c >= 'a' && c <= 'd') {
          const p = Object.values(w.ps).find((q) => q.slot === c.charCodeAt(0) - 97);
          g.fillStyle = p?.col ?? '#888'; g.globalAlpha = 0.45; g.fillRect(x + s * 0.18, y + s * 0.18, s * 0.64, s * 0.64); g.globalAlpha = 1; continue;
        }
        g.fillStyle = w.cols[+c] ?? '#888'; g.globalAlpha = 0.9; g.fillRect(x, y, s + 0.5, s + 0.5); g.globalAlpha = 1;
      }
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(ox, oy, w.gw * s, w.gh * s);
      // the smudges
      for (const m of w.sm) { g.fillStyle = '#1B1030'; g.beginPath(); g.arc(ox + m.x * s, oy + m.y * s, s * 0.55, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(ox + m.x * s - s * 0.15, oy + m.y * s - s * 0.1, s * 0.1, 0, Math.PI * 2); g.arc(ox + m.x * s + s * 0.15, oy + m.y * s - s * 0.1, s * 0.1, 0, Math.PI * 2); g.fill(); }
      // the drops
      for (const [id, p] of Object.entries(w.ps)) {
        const q = ip({ x: p.px, y: p.py }, prev?.ps[id] ? { x: prev.ps[id].px, y: prev.ps[id].py } : undefined, a);
        const x = ox + (q.x + 0.5) * s, y = oy + (q.y + 0.5) * s, rr = s * 0.62;
        if (p.inv > 0 && Math.floor(t * 10) % 2 === 0) g.globalAlpha = 0.45;
        glow(g, x, y, rr * (p.dash > 0 ? 1.15 : 1), p.col, p.dash > 0 ? 22 : 12);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x - rr * 0.3, y - rr * 0.2, rr * 0.22, 0, Math.PI * 2); g.arc(x + rr * 0.3, y - rr * 0.2, rr * 0.22, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        if (id === me) { g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rr + 4 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2); g.stroke(); }
        label(g, id === me ? 'YOU' : p.name, x, y - rr - 9, 10);
      }
      // the land race (or, together, how close the map is), the clock, lives
      const total = w.gw * w.gh;
      if (w.mode === 'coop') {
        const edge = 2 * w.gw + 2 * (w.gh - 2), mine = [...w.g].filter((c) => c === '0').length, f = Math.max(0, (mine - edge) / (total - edge));
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(ox, oy - 16, w.gw * s, 9);
        g.fillStyle = '#3DDC97'; g.fillRect(ox, oy - 16, Math.min(1, f / COOP_NEED) * w.gw * s, 9);
        label(g, `MAP ${w.map} · ${Math.round(f * 100)}% / ${Math.round(COOP_NEED * 100)}% · ${'❤'.repeat(Math.max(0, Math.min(8, w.lives)))}`, cw / 2, oy - 34, 13, w.flash > 0 ? '#FF3D6E' : '#fff');
      } else {
        const n = [0, 0, 0, 0]; for (const c of w.g) if (c >= '0' && c <= '3') n[+c]++;
        let bx = ox;
        w.cols.forEach((col, i) => { const bw = (n[i] / total) * w.gw * s; g.fillStyle = col; g.fillRect(bx, oy - 16, bw, 9); bx += bw; });
        g.strokeStyle = 'rgba(255,255,255,0.3)'; g.strokeRect(ox, oy - 16, w.gw * s, 9);
        label(g, `⏱ ${Math.ceil(w.t)}`, cw / 2, oy - 34, 16, w.t < 10 ? '#FF3D6E' : '#fff');
      }
    };
  },
};
