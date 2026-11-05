// The five Live Arena games. Each world is plain data: the host steps it, everyone draws it.
import { type ArenaMode, type Inp, type LP, type LiveDef, type LiveResult, TEAM_COLORS, bg, clamp, colorOf, fit, glow, ip, label, placesFrom, rng } from './kit';

type Ent = { x: number; y: number };
const near = (a: Ent, b: Ent) => Math.hypot(a.x - b.x, a.y - b.y);

// ======================================================================================================
// Paint Wars — roll round painting the floor your colour; most paint when the clock runs out wins
// ======================================================================================================
type PWP = { x: number; y: number; c: number; cd: number; boost: number; name: string; col: string; splat: number };
type PW = { mode: ArenaMode; t: number; gw: number; gh: number; grid: string; ps: Record<string, PWP>; pu: Ent | null; puT: number; seed: number; cols: string[] };
const PW_GW = 16, PW_GH = 20, PW_T = 75;
export const paintwars: LiveDef<PW> = {
  id: 'paintwars', controls: { stick: 'xy', action: '💥 SPLAT' },
  init(players, seed, mode) {
    const ps: Record<string, PWP> = {};
    const corners = [[0.12, 0.12], [0.88, 1.18], [0.88, 0.12], [0.12, 1.18]];
    // in 2v2 the colours are the teams'; otherwise each player has their own
    const cols = mode === 'teams' ? TEAM_COLORS : players.map((p) => colorOf(p, mode));
    players.forEach((p, i) => { const [x, y] = corners[i % 4]; ps[p.id] = { x, y, c: mode === 'teams' ? p.team ?? 0 : i, cd: 2, boost: 0, name: p.name, col: colorOf(p, mode), splat: 0 }; });
    return { mode, t: PW_T, gw: PW_GW, gh: PW_GH, grid: '.'.repeat(PW_GW * PW_GH), ps, pu: null, puT: 6, seed, cols };
  },
  step(w, inputs, dt) {
    w.t = Math.max(0, w.t - dt);
    const r = rng(w.seed + Math.floor(w.t * 10));
    const cells = w.grid.split('');
    const paint = (cx: number, cy: number, c: number) => { if (cx >= 0 && cy >= 0 && cx < w.gw && cy < w.gh) cells[cy * w.gw + cx] = String(c); };
    const ids = Object.keys(w.ps);
    for (const id of ids) {
      const p = w.ps[id], i = inputs[id] ?? { x: 0, y: 0, b: false };
      const sp = p.boost > 0 ? 0.5 : 0.32, l = Math.min(1, Math.hypot(i.x, i.y));
      if (l > 0.08) { p.x += (i.x / (Math.hypot(i.x, i.y) || 1)) * l * sp * dt; p.y += (i.y / (Math.hypot(i.x, i.y) || 1)) * l * sp * dt; }
      p.x = clamp(p.x, 0.02, 0.98); p.y = clamp(p.y, 0.02, 1.28);
      p.cd = Math.max(0, p.cd - dt); p.boost = Math.max(0, p.boost - dt); p.splat = Math.max(0, p.splat - dt);
      const cx = Math.floor((p.x / 1) * w.gw), cy = Math.floor((p.y / 1.3) * w.gh);
      paint(cx, cy, p.c);
      if (p.boost > 0) { paint(cx + 1, cy, p.c); paint(cx - 1, cy, p.c); paint(cx, cy + 1, p.c); paint(cx, cy - 1, p.c); }
      if (i.b && p.cd <= 0) { p.cd = 6; p.splat = 0.5; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3) paint(cx + dx, cy + dy, p.c); }
      if (w.pu && near(p, w.pu) < 0.06) { p.boost = 4; w.pu = null; w.puT = 8; }
    }
    // bump each other apart
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const A = w.ps[ids[a]], B = w.ps[ids[b]], d = near(A, B);
      if (d < 0.07 && d > 0) { const k = (0.07 - d) / 2 / d; A.x -= (B.x - A.x) * k; A.y -= (B.y - A.y) * k; B.x += (B.x - A.x) * k; B.y += (B.y - A.y) * k; }
    }
    if (!w.pu) { w.puT -= dt; if (w.puT <= 0) w.pu = { x: 0.15 + r() * 0.7, y: 0.15 + r() * 1.0 }; }
    w.grid = cells.join('');
  },
  result(w) {
    if (w.t > 0) return null;
    const count = (c: number) => w.grid.split('').filter((x) => x === String(c)).length;
    if (w.mode === 'teams') { const a = count(0), b = count(1); return { winner: a === b ? null : a > b ? 0 : 1 }; }
    const pts: Record<string, number> = {};
    for (const [id, p] of Object.entries(w.ps)) pts[id] = count(p.c);
    return { places: placesFrom(pts) };
  },
  renderer() {
    return (g, cw, ch, w, prev, a, me, t) => {
      bg(g, cw, ch, '#140A2E', '#05030F');
      const { s, ox, oy } = fit(cw, ch, 1, 1.3);
      const csz = s / w.gw, csh = (1.3 * s) / w.gh;
      g.fillStyle = '#1C1440'; g.fillRect(ox, oy, s, 1.3 * s);
      for (let i = 0; i < w.grid.length; i++) {
        const c = w.grid[i]; if (c === '.') continue;
        const x = i % w.gw, y = Math.floor(i / w.gw);
        g.fillStyle = w.cols[+c] ?? '#fff'; g.globalAlpha = 0.85;
        g.beginPath(); g.roundRect(ox + x * csz + 1, oy + y * csh + 1, csz - 2, csh - 2, csz * 0.3); g.fill();
      }
      g.globalAlpha = 1;
      if (w.pu) { const pulse = 1 + Math.sin(t * 8) * 0.15; glow(g, ox + w.pu.x * s, oy + w.pu.y * s, csz * 0.45 * pulse, '#FFE14D', 18); label(g, '⚡', ox + w.pu.x * s, oy + w.pu.y * s + 1, csz * 0.6); }
      for (const [id, p] of Object.entries(w.ps)) {
        const q = ip(p, prev?.ps[id], a), x = ox + q.x * s, y = oy + q.y * s, rr = csz * 0.62;
        if (p.splat > 0) { g.globalAlpha = p.splat * 2; glow(g, x, y, rr * (3 - p.splat * 2), p.col, 30); g.globalAlpha = 1; }
        glow(g, x, y, rr * (p.boost > 0 ? 1.15 : 1), p.col, 16);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x - rr * 0.3, y - rr * 0.2, rr * 0.22, 0, Math.PI * 2); g.arc(x + rr * 0.3, y - rr * 0.2, rr * 0.22, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#140A26'; g.beginPath(); g.arc(x - rr * 0.28, y - rr * 0.15, rr * 0.1, 0, Math.PI * 2); g.arc(x + rr * 0.32, y - rr * 0.15, rr * 0.1, 0, Math.PI * 2); g.fill();
        if (id === me) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rr + 4 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2); g.stroke(); }
        label(g, id === me ? 'YOU' : p.name, x, y - rr - 9, 10);
      }
      // the paint race along the top
      const counts = w.cols.map((_, c) => w.grid.split('').filter((x) => x === String(c)).length);
      const total = w.gw * w.gh; let bx = ox;
      counts.forEach((n, c) => { const bw = (n / total) * s; g.fillStyle = w.cols[c]; g.fillRect(bx, oy - 14, bw, 8); bx += bw; });
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.strokeRect(ox, oy - 14, s, 8);
      label(g, `⏱ ${Math.ceil(w.t)}`, cw / 2, oy - 30, 16, w.t < 10 ? '#FF3D6E' : '#fff');
    };
  },
};

// ======================================================================================================
// Bumper Orbs — sumo on a shrinking platform; last one on wins the round
// ======================================================================================================
type BOP = { x: number; y: number; vx: number; vy: number; alive: boolean; cd: number; fall: number; team: number | null; col: string; name: string; dash: number };
type BO = { mode: ArenaMode; round: number; rounds: number; wins: Record<string, number>; plat: number; rt: number; between: number; ps: Record<string, BOP>; last: string };
const BO_C = { x: 0.5, y: 0.65 }, BO_R = 0.045;
function boSpawn(w: BO) {
  const ids = Object.keys(w.ps);
  ids.forEach((id, i) => { const a = (i / ids.length) * Math.PI * 2 + w.round; Object.assign(w.ps[id], { x: BO_C.x + Math.cos(a) * 0.25, y: BO_C.y + Math.sin(a) * 0.25, vx: 0, vy: 0, alive: true, fall: 0, cd: 1 }); });
  w.plat = 0.42; w.rt = 0; w.between = 0;
}
export const bumper: LiveDef<BO> = {
  id: 'bumper', controls: { stick: 'xy', action: '💨 DASH' },
  init(players, _seed, mode) {
    const ps: Record<string, BOP> = {};
    for (const p of players) ps[p.id] = { x: 0, y: 0, vx: 0, vy: 0, alive: true, cd: 0, fall: 0, team: p.team, col: colorOf(p, mode), name: p.name, dash: 0 };
    const w: BO = { mode, round: 1, rounds: mode === 'ffa' ? 3 : 0, wins: Object.fromEntries(players.map((p) => [p.id, 0])), plat: 0.42, rt: 0, between: 0, ps, last: '' };
    boSpawn(w); return w;
  },
  step(w, inputs, dt) {
    if (w.between > 0) { w.between -= dt; if (w.between <= 0) { w.round++; boSpawn(w); } return; }
    w.rt += dt;
    // it shrinks after a while, and if everyone just sits tight it keeps going until someone drops
    if (w.rt > 12) w.plat = Math.max(w.rt > 40 ? 0 : 0.14, w.plat - (w.rt > 40 ? 0.02 : 0.012) * dt);
    const ids = Object.keys(w.ps);
    for (const id of ids) {
      const p = w.ps[id], i = inputs[id] ?? { x: 0, y: 0, b: false };
      if (!p.alive) { p.fall += dt; continue; }
      p.cd = Math.max(0, p.cd - dt); p.dash = Math.max(0, p.dash - dt);
      p.vx += i.x * 1.5 * dt; p.vy += i.y * 1.5 * dt;
      if (i.b && p.cd <= 0) { const l = Math.hypot(i.x, i.y) || Math.hypot(p.vx, p.vy) || 1; p.vx += ((i.x || p.vx) / l) * 0.9; p.vy += ((i.y || p.vy) / l) * 0.9; p.cd = 2.2; p.dash = 0.3; }
      const f = Math.pow(0.45, dt); p.vx *= f; p.vy *= f;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    // bonk: heavier hits when dashing
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const A = w.ps[ids[a]], B = w.ps[ids[b]]; if (!A.alive || !B.alive) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      if (d < BO_R * 2 && d > 0) {
        const nx = dx / d, ny = dy / d, rel = (A.vx - B.vx) * nx + (A.vy - B.vy) * ny;
        const push = (BO_R * 2 - d) / 2; A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
        if (rel > 0) { const k = rel * 1.25; A.vx -= nx * k; A.vy -= ny * k; B.vx += nx * k; B.vy += ny * k; w.last = `${ids[a]}|${ids[b]}|${Date.now()}`; }
      }
    }
    const off = ids.filter((id) => w.ps[id].alive && near(w.ps[id], BO_C) > w.plat + BO_R * 0.4);
    // everyone left going over at once: the one nearest the middle hangs on
    if (off.length && off.length === ids.filter((id) => w.ps[id].alive).length) off.splice(off.indexOf(off.reduce((x, y) => (near(w.ps[x], BO_C) <= near(w.ps[y], BO_C) ? x : y))), 1);
    for (const id of off) { w.ps[id].alive = false; w.ps[id].fall = 0; }
    // round over?
    const alive = ids.filter((id) => w.ps[id].alive);
    const teamsLeft = new Set(alive.map((id) => w.ps[id].team));
    const over = w.mode === 'teams' ? teamsLeft.size <= 1 : alive.length <= 1;
    if (over) {
      if (w.mode === 'ffa') {
        // ffa: points by how long you lasted this round
        for (const id of alive) w.wins[id] += 3;
        const fell = ids.filter((id) => !w.ps[id].alive).sort((x, y) => w.ps[x].fall - w.ps[y].fall);
        fell.forEach((id, k) => { w.wins[id] += Math.max(0, 2 - k); });
      } else for (const id of alive) w.wins[id] += 1;
      w.between = 2.2;
    }
  },
  result(w) {
    const ids = Object.keys(w.ps);
    if (w.between <= 0) return null;
    if (w.mode === 'ffa') return w.round >= w.rounds ? { places: placesFrom(w.wins) } : null;
    if (w.mode === 'teams') {
      const tw = [0, 1].map((t) => Math.max(0, ...ids.filter((id) => w.ps[id].team === t).map((id) => w.wins[id])));
      if (tw[0] >= 2 || tw[1] >= 2) return { winner: tw[0] >= 2 ? 0 : 1 };
      return null;
    }
    const top = ids.find((id) => w.wins[id] >= 2);
    return top ? { places: Object.fromEntries(ids.map((id) => [id, id === top ? 1 : 2])) } : null;
  },
  renderer() {
    return (g, cw, ch, w, prev, a, me, t) => {
      bg(g, cw, ch, '#06122A', '#02010A');
      const { s, ox, oy } = fit(cw, ch, 1, 1.3);
      const cx = ox + BO_C.x * s, cy = oy + BO_C.y * s;
      // the platform (and the drop below it)
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, w.plat * s);
      gr.addColorStop(0, '#2A4A8A'); gr.addColorStop(1, '#16285A');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, w.plat * s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = w.plat < 0.3 ? '#FF3D6E' : '#22E3FF'; g.lineWidth = 3; g.shadowColor = g.strokeStyle; g.shadowBlur = 16; g.stroke(); g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.08)'; for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(cx, cy, w.plat * s * (k / 4), 0, Math.PI * 2); g.stroke(); }
      for (const [id, p] of Object.entries(w.ps)) {
        const q = ip(p, prev?.ps[id], a), x = ox + q.x * s, y = oy + q.y * s;
        const k = p.alive ? 1 : Math.max(0, 1 - p.fall * 1.5), rr = BO_R * s * k;
        if (k <= 0) continue;
        g.globalAlpha = p.alive ? 1 : k;
        if (p.dash > 0) { g.globalAlpha = 0.4; glow(g, x - p.vx * s * 0.05, y - p.vy * s * 0.05, rr, p.col, 20); g.globalAlpha = 1; }
        glow(g, x, y, rr, p.col, 14);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - rr * 0.35, y - rr * 0.35, rr * 0.3, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        if (id === me && p.alive) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rr + 4 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2); g.stroke(); }
        if (p.alive) label(g, `${id === me ? 'YOU' : p.name} ${'●'.repeat(w.wins[id])}`, x, y - rr - 10, 10);
      }
      label(g, w.mode === 'ffa' ? `ROUND ${w.round} / ${w.rounds}` : `ROUND ${w.round} · first to 2`, cw / 2, oy - 22, 15);
      if (w.between > 0) label(g, Object.values(w.ps).some((p) => p.alive) ? 'ROUND OVER!' : 'DRAW!', cw / 2, cy, 26, '#FFE14D');
    };
  },
};

// ======================================================================================================
// Ink Trails — steer your line, never cross a trail; last one drawing wins the round
// ======================================================================================================
type ITP = { x: number; y: number; a: number; alive: boolean; draw: boolean; gap: number; next: number; col: string; name: string; died: number };
type IT = { mode: ArenaMode; round: number; rounds: number; first: number; pts: Record<string, number>; between: number; rt: number; seed: number; ps: Record<string, ITP>; _occ?: Uint16Array; _tick?: number };
const IT_GW = 120, IT_GH = 156;
function itSpawn(w: IT) {
  const r = rng(w.seed + w.round * 977);
  w._occ = new Uint16Array(IT_GW * IT_GH); w._tick = 0;
  Object.values(w.ps).forEach((p, i, all) => {
    const ang = (i / all.length) * Math.PI * 2 + r();
    Object.assign(p, { x: 0.5 + Math.cos(ang) * 0.3, y: 0.65 + Math.sin(ang) * 0.4, a: ang + Math.PI + (r() - 0.5), alive: true, draw: true, gap: 0, next: 1.2 + r() * 1.5, died: 0 });
  });
  w.between = 0; w.rt = 0;
}
export const trails: LiveDef<IT> = {
  id: 'trails', controls: { stick: 'x' },
  init(players, seed, mode) {
    const ps: Record<string, ITP> = {};
    for (const p of players) ps[p.id] = { x: 0, y: 0, a: 0, alive: true, draw: true, gap: 0, next: 1, col: colorOf(p, mode), name: p.name, died: 0 };
    const w: IT = { mode, round: 1, rounds: mode === 'duel' ? 0 : 5, first: 3, pts: Object.fromEntries(players.map((p) => [p.id, 0])), between: 0, rt: 0, seed, ps };
    itSpawn(w); return w;
  },
  snap(w) { const { _occ, _tick, ...rest } = w; void _occ; void _tick; return rest; },
  step(w, inputs, dt) {
    if (w.between > 0) { w.between -= dt; if (w.between <= 0) { w.round++; itSpawn(w); } return; }
    if (!w._occ) itSpawn(w);
    w.rt += dt; w._tick = (w._tick ?? 0) + 1;
    const occ = w._occ!, r = rng(w.seed + w._tick);
    const ids = Object.keys(w.ps), speed = 0.2 + Math.min(0.08, w.rt * 0.002);
    for (const id of ids) {
      const p = w.ps[id]; if (!p.alive) continue;
      const i = inputs[id] ?? { x: 0, y: 0, b: false };
      p.a += clamp(i.x, -1, 1) * 3.0 * dt;
      p.x += Math.cos(p.a) * speed * dt; p.y += Math.sin(p.a) * speed * dt;
      // gaps now and then, so there's a way through
      if (p.gap > 0) { p.gap -= dt; if (p.gap <= 0) p.draw = true; }
      else { p.next -= dt; if (p.next <= 0) { p.draw = false; p.gap = 0.22; p.next = 1.5 + r() * 2; } }
      const gx = Math.floor(p.x * IT_GW), gy = Math.floor((p.y / 1.3) * IT_GH);
      if (p.x < 0.01 || p.x > 0.99 || p.y < 0.01 || p.y > 1.29) { p.alive = false; p.died = w.rt; continue; }
      const k = gy * IT_GW + gx, me = ids.indexOf(id) + 1;
      const v = occ[k];
      // hit a trail: anyone else's, or your own from more than a moment ago
      if (v && (v >> 12 !== me || ((w._tick - (v & 0xfff)) & 0xfff) > 12)) { p.alive = false; p.died = w.rt; continue; }
      if (p.draw) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) { const xx = gx + dx, yy = gy + dy; if (xx >= 0 && yy >= 0 && xx < IT_GW && yy < IT_GH && !occ[yy * IT_GW + xx]) occ[yy * IT_GW + xx] = (me << 12) | (w._tick & 0xfff); }
    }
    const alive = ids.filter((id) => w.ps[id].alive);
    if (alive.length <= 1 && ids.length > 1) {
      if (w.mode === 'duel') for (const id of alive) w.pts[id] += 1;
      else { for (const id of alive) w.pts[id] += ids.length; ids.filter((id) => !w.ps[id].alive).sort((a, b) => w.ps[a].died - w.ps[b].died).forEach((id, k) => { w.pts[id] += k; }); }
      w.between = 2.2;
    }
  },
  result(w) {
    if (w.between <= 0) return null;
    if (w.mode === 'duel') { const top = Object.keys(w.pts).find((id) => w.pts[id] >= w.first); return top ? { places: Object.fromEntries(Object.keys(w.pts).map((id) => [id, id === top ? 1 : 2])) } : null; }
    return w.round >= w.rounds ? { places: placesFrom(w.pts) } : null;
  },
  renderer() {
    // trails are rebuilt here from the heads in each snapshot (the host's grid never goes over the wire)
    let round = -1; const lines = new Map<string, { x: number; y: number; d: boolean }[]>();
    return (g, cw, ch, w, prev, a, me, t) => {
      if (w.round !== round) { round = w.round; lines.clear(); }
      bg(g, cw, ch, '#071A12', '#020806');
      const { s, ox, oy } = fit(cw, ch, 1, 1.3);
      g.strokeStyle = '#3DDC97'; g.lineWidth = 2; g.shadowColor = '#3DDC97'; g.shadowBlur = 10; g.strokeRect(ox, oy, s, 1.3 * s); g.shadowBlur = 0;
      g.strokeStyle = 'rgba(61,220,151,0.06)'; g.lineWidth = 1; g.beginPath(); for (let k = 1; k < 10; k++) { g.moveTo(ox + (k / 10) * s, oy); g.lineTo(ox + (k / 10) * s, oy + 1.3 * s); g.moveTo(ox, oy + (k / 10) * 1.3 * s); g.lineTo(ox + s, oy + (k / 10) * 1.3 * s); } g.stroke();
      for (const [id, p] of Object.entries(w.ps)) {
        let l = lines.get(id); if (!l) { l = []; lines.set(id, l); }
        const last = l[l.length - 1];
        if (p.alive && (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.004)) l.push({ x: p.x, y: p.y, d: p.draw });
        g.strokeStyle = p.col; g.lineWidth = Math.max(2, s * 0.012); g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = p.col; g.shadowBlur = 8;
        g.beginPath(); let pen = false;
        for (let k = 0; k < l.length; k++) { const q = l[k]; if (q.d && pen) g.lineTo(ox + q.x * s, oy + q.y * s); else g.moveTo(ox + q.x * s, oy + q.y * s); pen = q.d; }
        g.stroke(); g.shadowBlur = 0;
        const q = ip(p, prev?.ps[id], a);
        if (p.alive) { glow(g, ox + q.x * s, oy + q.y * s, s * 0.012 + 2, '#fff', 14); if (id === me) label(g, 'YOU', ox + q.x * s, oy + q.y * s - 14, 10); }
        else { label(g, '💥', ox + p.x * s, oy + p.y * s, 16); }
      }
      const sc = Object.entries(w.pts).map(([id, n]) => `${id === me ? 'YOU' : w.ps[id].name} ${n}`).join('  ·  ');
      label(g, w.mode === 'duel' ? `first to ${w.first}` : `ROUND ${w.round} / ${w.rounds}`, cw / 2, oy - 34, 13);
      label(g, sc, cw / 2, oy - 16, 11, '#B6FF3D');
      if (w.between > 0) label(g, 'ROUND OVER!', cw / 2, oy + 0.65 * s, 26, '#FFE14D');
      void t;
    };
  },
};

// ======================================================================================================
// Bubble Volley — side view; bounce the bubble over the net, first side to 7
// ======================================================================================================
type BVP = { x: number; y: number; vx: number; vy: number; side: number; col: string; name: string };
type BV = { mode: ArenaMode; ps: Record<string, BVP>; ball: { x: number; y: number; vx: number; vy: number }; score: [number, number]; serve: number; wait: number; to: number; touch: string };
const BV_W = 1, BV_H = 0.72, NET_H = 0.2, PR = 0.06, BR = 0.05;
function bvServe(w: BV) { w.ball = { x: w.serve === 0 ? 0.25 : 0.75, y: 0.5, vx: 0, vy: 0 }; w.wait = 1.2; }
export const volley: LiveDef<BV> = {
  id: 'volley', controls: { stick: 'x', action: '⬆ JUMP' },
  init(players, _seed, mode) {
    const ps: Record<string, BVP> = {};
    players.forEach((p, i) => { const side = mode === 'teams' ? p.team ?? 0 : i % 2; const k = players.filter((q, j) => j < i && (mode === 'teams' ? q.team === p.team : j % 2 === side)).length; ps[p.id] = { x: side === 0 ? 0.15 + k * 0.18 : 0.85 - k * 0.18, y: 0, vx: 0, vy: 0, side, col: colorOf(p, mode), name: p.name }; });
    const w: BV = { mode, ps, ball: { x: 0.25, y: 0.5, vx: 0, vy: 0 }, score: [0, 0], serve: 0, wait: 1.2, to: 7, touch: '' };
    bvServe(w); return w;
  },
  step(w, inputs, dt) {
    for (const [id, p] of Object.entries(w.ps)) {
      const i = inputs[id] ?? { x: 0, y: 0, b: false };
      p.vx = clamp(i.x, -1, 1) * 0.6;
      if ((i.b || i.y < -0.6) && p.y <= 0.001) p.vy = 1.15;
      p.vy -= 2.8 * dt; p.x += p.vx * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0) p.vy = Math.max(0, p.vy);
      // your own half only
      p.x = p.side === 0 ? clamp(p.x, PR, 0.5 - PR - 0.01) : clamp(p.x, 0.5 + PR + 0.01, 1 - PR);
    }
    if (w.wait > 0) { w.wait -= dt; return; }
    const b = w.ball;
    b.vy -= 0.95 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); } if (b.x > BV_W - BR) { b.x = BV_W - BR; b.vx = -Math.abs(b.vx); }
    if (b.y > BV_H - BR) { b.y = BV_H - BR; b.vy = -Math.abs(b.vy) * 0.8; }
    // the net
    if (Math.abs(b.x - 0.5) < BR + 0.008 && b.y < NET_H + BR) {
      if (b.y > NET_H) { b.vy = Math.abs(b.vy) * 0.8 + 0.1; } else { b.vx = (b.x < 0.5 ? -1 : 1) * Math.max(0.15, Math.abs(b.vx) * 0.8); b.x = 0.5 + (b.x < 0.5 ? -1 : 1) * (BR + 0.009); }
    }
    for (const [id, p] of Object.entries(w.ps)) {
      const dx = b.x - p.x, dy = b.y - (p.y + PR * 0.6), d = Math.hypot(dx, dy);
      if (d < PR + BR && d > 0) {
        const nx = dx / d, ny = dy / d; b.x = p.x + nx * (PR + BR); b.y = p.y + PR * 0.6 + ny * (PR + BR);
        const sp = Math.max(0.9, Math.hypot(b.vx, b.vy));
        b.vx = nx * sp + p.vx * 0.5; b.vy = Math.max(0.55, ny * sp + p.vy * 0.4);
        w.touch = `${id}:${Date.now()}`;
      }
    }
    if (b.y <= BR) {
      const side = b.x < 0.5 ? 0 : 1; // it landed on this side: the other side scores
      w.score[1 - side]++; w.serve = side; bvServe(w);
    }
  },
  result(w) {
    const win = w.score[0] >= w.to ? 0 : w.score[1] >= w.to ? 1 : -1;
    if (win < 0) return null;
    if (w.mode === 'teams') return { winner: win };
    return { places: Object.fromEntries(Object.entries(w.ps).map(([id, p]) => [id, p.side === win ? 1 : 2])) };
  },
  renderer() {
    return (g, cw, ch, w, prev, a, me, t) => {
      bg(g, cw, ch, '#2A1050', '#FF7A3D');
      const { s, ox, oy } = fit(cw, ch, BV_W, BV_H + 0.06, 80, 90);
      const Y = (y: number) => oy + (BV_H - y) * s;
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(ox, oy, s, BV_H * s);
      g.fillStyle = '#F4D58A'; g.fillRect(ox, Y(0), s, 0.06 * s);
      g.fillStyle = '#fff'; g.fillRect(ox + 0.5 * s - 3, Y(NET_H), 6, NET_H * s);
      g.fillStyle = '#FF3D9A'; g.fillRect(ox + 0.5 * s - 5, Y(NET_H) - 4, 10, 6);
      for (const [id, p] of Object.entries(w.ps)) {
        const q = ip(p, prev?.ps[id], a), x = ox + q.x * s, y = Y(q.y), rr = PR * s;
        g.fillStyle = p.col; g.shadowColor = p.col; g.shadowBlur = 12;
        g.beginPath(); g.arc(x, y - rr * 0.1, rr, Math.PI, 0); g.lineTo(x + rr, y); g.lineTo(x - rr, y); g.closePath(); g.fill(); g.shadowBlur = 0;
        const look = (w.ball.x > p.x ? 1 : -1) * rr * 0.12;
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x - rr * 0.3, y - rr * 0.55, rr * 0.2, 0, Math.PI * 2); g.arc(x + rr * 0.3, y - rr * 0.55, rr * 0.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#140A26'; g.beginPath(); g.arc(x - rr * 0.3 + look, y - rr * 0.55, rr * 0.09, 0, Math.PI * 2); g.arc(x + rr * 0.3 + look, y - rr * 0.55, rr * 0.09, 0, Math.PI * 2); g.fill();
        label(g, id === me ? 'YOU' : p.name, x, y - rr * 1.5, 10);
      }
      const b = ip(w.ball, prev?.ball, a), bx = ox + b.x * s, by = Y(b.y), br = BR * s;
      const gr = g.createRadialGradient(bx - br * 0.4, by - br * 0.4, br * 0.1, bx, by, br);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(173,232,255,0.55)'); gr.addColorStop(1, 'rgba(255,61,154,0.6)');
      g.fillStyle = gr; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(bx, Y(0) + 3, br * (1 - Math.min(0.7, b.y)), 3, 0, 0, Math.PI * 2); g.fill();
      label(g, `${w.score[0]}  :  ${w.score[1]}`, cw / 2, oy - 30, 30, '#FFE14D');
      label(g, `first to ${w.to}`, cw / 2, oy - 8, 11);
      if (w.wait > 0) label(g, 'SERVE!', ox + w.ball.x * s, Y(0.62), 18, '#fff');
      void t;
    };
  },
};

// ======================================================================================================
// Meteor Guard — co-op: swing your shields round the core and stop the meteors together
// ======================================================================================================
type MGP = { a: number; cd: number; col: string; name: string; pulse: number };
type MGM = { id: number; x: number; y: number; vx: number; vy: number; r: number; gold: boolean };
type MG = { mode: ArenaMode; hp: number; wave: number; left: number; spawn: number; rest: number; ms: MGM[]; ps: Record<string, MGP>; score: number; seq: number; seed: number; booms: { x: number; y: number; t: number; c: string }[] };
const MG_C = { x: 0.5, y: 0.65 }, SHIELD_R = 0.2, ARC = 0.55;
export const meteor: LiveDef<MG> = {
  id: 'meteor', controls: { stick: 'xy', action: '💫 PULSE' },
  init(players, seed, mode) {
    const ps: Record<string, MGP> = {};
    players.forEach((p, i) => { ps[p.id] = { a: (i / players.length) * Math.PI * 2 - Math.PI / 2, cd: 3, col: colorOf(p, mode), name: p.name, pulse: 0 }; });
    return { mode, hp: 5, wave: 1, left: 8, spawn: 1.5, rest: 0, ms: [], ps, score: 0, seq: 0, seed, booms: [] };
  },
  step(w, inputs, dt) {
    if (w.hp <= 0) return;
    const r = rng(w.seed + w.seq * 31 + w.wave);
    w.booms = w.booms.filter((b) => (b.t -= dt) > 0);
    for (const [id, p] of Object.entries(w.ps)) {
      const i = inputs[id] ?? { x: 0, y: 0, b: false };
      p.cd = Math.max(0, p.cd - dt); p.pulse = Math.max(0, p.pulse - dt);
      if (Math.hypot(i.x, i.y) > 0.3) {
        const target = Math.atan2(i.y, i.x); let d = target - p.a;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        p.a += clamp(d, -6 * dt, 6 * dt);
      }
      if (i.b && p.cd <= 0) {
        p.cd = 12; p.pulse = 0.5;
        const px = MG_C.x + Math.cos(p.a) * SHIELD_R, py = MG_C.y + Math.sin(p.a) * SHIELD_R;
        w.ms = w.ms.filter((m) => { if (Math.hypot(m.x - px, m.y - py) < 0.3) { w.score++; w.booms.push({ x: m.x, y: m.y, t: 0.5, c: p.col }); return false; } return true; });
      }
    }
    // the wave: meteors from every side, faster each wave
    if (w.rest > 0) { w.rest -= dt; if (w.rest <= 0) { w.wave++; w.left = 6 + w.wave * 2; } }
    else if (w.left > 0) {
      w.spawn -= dt;
      if (w.spawn <= 0) {
        w.spawn = Math.max(0.35, 1.3 - w.wave * 0.08); w.left--; w.seq++;
        const ang = r() * Math.PI * 2, sp = 0.11 + w.wave * 0.012 + r() * 0.03, gold = r() < 0.08;
        const x = MG_C.x + Math.cos(ang) * 0.75, y = MG_C.y + Math.sin(ang) * 0.75;
        const aim = Math.atan2(MG_C.y - y, MG_C.x - x) + (r() - 0.5) * 0.25;
        w.ms.push({ id: w.seq, x, y, vx: Math.cos(aim) * sp, vy: Math.sin(aim) * sp, r: gold ? 0.022 : 0.018 + r() * 0.02, gold });
      }
    } else if (!w.ms.length) w.rest = 2.5;
    const shields = Object.values(w.ps);
    w.ms = w.ms.filter((m) => {
      m.x += m.vx * dt; m.y += m.vy * dt;
      const dx = m.x - MG_C.x, dy = m.y - MG_C.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (Math.abs(d - SHIELD_R) < m.r + 0.012) {
        for (const p of shields) {
          let da = a - p.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) < ARC / 2) { w.score += m.gold ? 5 : 1; if (m.gold) w.hp = Math.min(5, w.hp + 1); w.booms.push({ x: m.x, y: m.y, t: 0.4, c: m.gold ? '#FFD84D' : p.col }); return false; }
        }
      }
      if (d < 0.08 + m.r) { w.hp--; w.booms.push({ x: m.x, y: m.y, t: 0.7, c: '#FF3D3D' }); return false; }
      return true;
    });
  },
  result(w) { return w.hp <= 0 ? { waves: w.wave - 1 } : null; },
  renderer() {
    const stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 0.137) % 1, y: (i * 0.291) % 1.3, s: (i % 3) + 1 }));
    return (g, cw, ch, w, prev, a, me, t) => {
      bg(g, cw, ch, '#0C0424', '#02010A');
      const { s, ox, oy } = fit(cw, ch, 1, 1.3);
      for (const st of stars) { g.fillStyle = `rgba(255,255,255,${0.2 + st.s * 0.15})`; g.fillRect(ox + st.x * s, oy + st.y * s, st.s, st.s); }
      const cx = ox + MG_C.x * s, cy = oy + MG_C.y * s;
      // the core, its health as rings
      const pulse = 1 + Math.sin(t * 4) * 0.05;
      glow(g, cx, cy, 0.075 * s * pulse, w.hp <= 2 ? '#FF3D6E' : '#B57BFF', 30);
      glow(g, cx, cy, 0.04 * s, '#fff', 10);
      for (let k = 0; k < 5; k++) { g.strokeStyle = k < w.hp ? '#3DDC97' : 'rgba(255,255,255,0.15)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 0.09 * s, -Math.PI / 2 + k * (Math.PI * 2 / 5) + 0.1, -Math.PI / 2 + (k + 1) * (Math.PI * 2 / 5) - 0.1); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, SHIELD_R * s, 0, Math.PI * 2); g.stroke();
      for (const [id, p] of Object.entries(w.ps)) {
        const pa = prev?.ps[id]?.a; let ang = p.a;
        if (pa != null) { let d = p.a - pa; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; ang = pa + d * a; }
        g.strokeStyle = p.col; g.lineWidth = id === me ? 9 : 7; g.lineCap = 'round'; g.shadowColor = p.col; g.shadowBlur = 16;
        g.beginPath(); g.arc(cx, cy, SHIELD_R * s, ang - ARC / 2, ang + ARC / 2); g.stroke(); g.shadowBlur = 0;
        if (p.pulse > 0) { g.globalAlpha = p.pulse * 2; g.strokeStyle = p.col; g.lineWidth = 3; g.beginPath(); g.arc(cx + Math.cos(ang) * SHIELD_R * s, cy + Math.sin(ang) * SHIELD_R * s, (0.3 - p.pulse * 0.4) * s, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
        label(g, id === me ? 'YOU' : p.name, cx + Math.cos(ang) * (SHIELD_R + 0.06) * s, cy + Math.sin(ang) * (SHIELD_R + 0.06) * s, 10, p.col);
      }
      for (const m of w.ms) {
        const pm = prev?.ms.find((x) => x.id === m.id), q = ip(m, pm, a), x = ox + q.x * s, y = oy + q.y * s;
        g.strokeStyle = m.gold ? 'rgba(255,216,77,0.5)' : 'rgba(255,122,61,0.45)'; g.lineWidth = m.r * s; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - m.vx * s * 0.5, y - m.vy * s * 0.5); g.stroke();
        glow(g, x, y, m.r * s, m.gold ? '#FFD84D' : '#FF7A3D', 10);
      }
      for (const b of w.booms) { g.globalAlpha = Math.min(1, b.t * 2); glow(g, ox + b.x * s, oy + b.y * s, (0.06 - b.t * 0.05) * s, b.c, 20); g.globalAlpha = 1; }
      label(g, `WAVE ${w.wave}`, cw / 2, oy - 30, 18, '#B57BFF');
      label(g, `${w.score} meteors stopped`, cw / 2, oy - 10, 11);
      if (w.rest > 0) label(g, `WAVE ${w.wave} CLEAR!`, cx, cy - 0.35 * s, 22, '#3DDC97');
      if (w.hp <= 0) label(g, 'THE CORE FELL', cx, cy - 0.35 * s, 24, '#FF3D6E');
    };
  },
};

export const LIVE_DEFS: Record<string, LiveDef<any>> = { paintwars, bumper, trails, volley, meteor }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type { Inp, LP, LiveResult };
