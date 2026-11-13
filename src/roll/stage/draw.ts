// The roll's stage, painted for any moment from its trace — the very same function draws the live roll on the phone
// and every frame of its clip. A drop of ink falls and splashes; the minigame strip races past and clunks onto the
// plot's game (the ink takes on that medium's pattern); then the rarity drum spins, each name in its own material,
// the rarity ink spreading wider as the drum slows, teasing the next one up, and floods the canvas as it lands —
// flash, rays, a particle storm, the rarity slams in.
import { kindInfo } from '../../enchant/kinds';
import { PLOT_TYPES } from '../../map/plotStyle';
import { RARITY_ORDER, rarityInfo, rarityTier, type RarityId } from '../../shared/rarity';
import { Assets, BODY, DISPLAY, EMOJI_FONT, GAME_EMOJI } from './assets';
import type { Layout } from './layout';
import { bezier, clamp, clamp01, easeOut, easeOutCubic, frames, framesAt, inkEase, lerp, mix, mod, rgba, rng, shade, smooth, spring } from './math';
import { drawParticles } from './particles';
import { TYPE_ORDER, lastLand, reelPos, type Step, type Trace } from './trace';

const INK = '#1B1240';
const RAINBOW = ['#FF3D9A', '#FFB31F', '#FFE14D', '#3DDC97', '#22E3FF', '#8FA8FF', '#A45CFF'];
const NR = RARITY_ORDER.length, NT = TYPE_ORDER.length;
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
const dropEase = bezier(0.5, 0, 0.9, 0.6);

export type StageOpts = { dpr: number; assets: Assets };
export type Phase = 'drop' | 'spin' | 'pick' | 'enchant' | 'reveal';

// ---- reading the trace ----------------------------------------------------------------------------------------------
export const stepStart = (s: Step) => s.tReel?.t0 ?? s.rStart ?? Infinity;
export function stepAt(tr: Trace, t: number) { let i = -1; tr.steps.forEach((s, k) => { if (stepStart(s) <= t) i = k; }); return i; }
export function phaseAt(tr: Trace, t: number): Phase {
  if (tr.reveal != null && t >= tr.reveal) return 'reveal';
  if (tr.enchant && t >= tr.enchant.t0) return 'enchant';
  if (tr.pick && t >= tr.pick.t0) return 'pick';
  if (t < tr.drop) return 'drop';
  return 'spin';
}
const typeAt = (s: Step, t: number) => (s.tReel && !(s.tLock != null && t >= s.tLock) ? TYPE_ORDER[mod(Math.round(reelPos(s.tReel, t)), NT)] : s.type);
const rarityAt = (s: Step, t: number): RarityId => (s.rReel && !(s.rLock != null && t >= s.rLock) ? RARITY_ORDER[mod(Math.round(reelPos(s.rReel, t)), NR)] : s.rarity);
const finalOf = (tr: Trace): RarityId => (tr.final.enchant ? ('enchanted' as RarityId) : tr.final.rarity);
const colorOf = (r: RarityId) => (r === 'enchanted' ? '#B26BFF' : rarityInfo(r).color);

/** the ink's colour at t (the room glows with it) */
export function inkColor(tr: Trace, t: number) {
  const ph = phaseAt(tr, t);
  if (ph === 'reveal') return colorOf(finalOf(tr));
  if (ph === 'drop') return INK;
  const s = tr.steps[stepAt(tr, t)];
  if (!s) return INK;
  if (s.rStart != null && t >= s.rStart) return rarityInfo(rarityAt(s, t)).color;
  const ty = PLOT_TYPES[typeAt(s, t) as keyof typeof PLOT_TYPES];
  return ty?.a ?? INK;
}

// ---- the ink splash (the same shapes the old SVG splash made) -------------------------------------------------------
type Shape = { p: Path2D; cx: number; cy: number; s: number; d: number; dl: number };
type Splash = { flood: Shape; shapes: Shape[]; tendrils: { p: Path2D; len: number; w: number; dl: number }[]; cx: number; cy: number };
const splashes = new Map<number, Splash>();
function blob(rnd: () => number, cx: number, cy: number, r: number, n = 12, wob = 0.35) {
  const pts = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + rnd() * 0.3, rr = r * (1 - wob / 2 + rnd() * wob); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return new Path2D(d + 'Z');
}
function splash(seed: number): Splash {
  let sp = splashes.get(seed);
  if (sp) return sp;
  const rnd = rng(seed);
  const cx = 44 + rnd() * 12, cy = 44 + rnd() * 12;
  const splats = Array.from({ length: 8 + Math.floor(rnd() * 4) }, () => { const a = rnd() * Math.PI * 2, dist = 20 + rnd() * 26; return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: 3 + rnd() * 9, d: 0.08 + rnd() * 0.22 }; });
  const blooms = Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2 + rnd(), dist = 18 + rnd() * 18; return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: 10 + rnd() * 8, d: 0.16 + rnd() * 0.2 }; });
  const main = blob(rnd, cx, cy, 20, 14, 0.4);
  const sps = splats.map((p) => ({ p: blob(rnd, p.x, p.y, p.r, 8, 0.5), cx: p.x, cy: p.y, s: 1.25, d: 0.32, dl: p.d }));
  const tendrils = splats.slice(0, 6).map((p) => {
    const qx = (cx + p.x) / 2 + (rnd() - 0.5) * 10, qy = (cy + p.y) / 2 + (rnd() - 0.5) * 10;
    const path = new Path2D(`M${cx} ${cy} Q${qx} ${qy} ${p.x} ${p.y}`);
    let len = 0, px = cx, py = cy;
    for (let k = 1; k <= 12; k++) { const u = k / 12, x = (1 - u) ** 2 * cx + 2 * (1 - u) * u * qx + u * u * p.x, y = (1 - u) ** 2 * cy + 2 * (1 - u) * u * qy + u * u * p.y; len += Math.hypot(x - px, y - py); px = x; py = y; }
    return { p: path, len, w: 2 + rnd() * 3, dl: p.d * 0.6 };
  });
  const bls = blooms.map((p) => ({ p: blob(rnd, p.x, p.y, p.r, 10, 0.45), cx: p.x, cy: p.y, s: 2.6, d: 0.55, dl: p.d }));
  const flood = { p: (() => { const c = new Path2D(); c.arc(50, 50, 76, 0, Math.PI * 2); return c; })(), cx: 50, cy: 50, s: 1, d: 0.5, dl: 0.3 };
  sp = { flood, shapes: [...sps, ...bls, { p: main, cx, cy, s: 3.6, d: 0.7, dl: 0 }], tendrils, cx, cy };
  splashes.set(seed, sp);
  if (splashes.size > 40) splashes.delete(splashes.keys().next().value!);
  return sp;
}
/** the CSS "ink grows" keyframes: 0 → s·1.04 at 70% → s */
function grow(et: number, s: number, d: number, dl: number) {
  const x = (et - dl) / d;
  if (x <= 0) return 0;
  if (x >= 1) return s;
  return x < 0.7 ? s * 1.04 * inkEase(x / 0.7) : lerp(s * 1.04, s, inkEase((x - 0.7) / 0.3));
}

/** paint one layer of ink into a scratch canvas (the card's 100×100 space): its shapes, its colour, the medium's pattern inside it */
const inkKeys = new WeakMap<HTMLCanvasElement, string>();
const patIds = new WeakMap<HTMLCanvasElement, number>();
let patN = 0;
const patId = (p: HTMLCanvasElement | null | undefined) => { if (!p) return 0; let n = patIds.get(p); if (!n) { n = ++patN; patIds.set(p, n); } return n; };
function inkLayer(A: Assets, name: string, u: number, sp: Splash, et: number, o: { mult?: number; flood?: number; color: string; pattern?: HTMLCanvasElement | null; patAlpha?: number; shine?: boolean }) {
  const c = A.layer(name, u), lg = c.getContext('2d')!;
  // (once the splash has settled, the layer only changes with its colour or spread: reuse it)
  const settled = et > 1.2;
  const key = `${sp.cx}|${settled ? 'S' : et.toFixed(3)}|${o.color}|${patId(o.pattern)}|${(o.mult ?? 1).toFixed(3)}|${(o.flood ?? -1).toFixed(3)}|${c.width}`;
  if (inkKeys.get(c) === key) return c;
  inkKeys.set(c, key);
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1; lg.clearRect(0, 0, c.width, c.height);
  const k = c.width / 100;
  lg.setTransform(k, 0, 0, k, 0, 0);
  lg.fillStyle = '#000'; lg.strokeStyle = '#000'; lg.lineCap = 'round';
  const m = o.mult ?? 1;
  const put = (sh: Shape, sc: number) => { if (sc <= 0.001) return; lg.save(); lg.translate(sh.cx, sh.cy); lg.scale(sc, sc); lg.translate(-sh.cx, -sh.cy); lg.fill(sh.p); lg.restore(); };
  put(sp.flood, o.flood ?? grow(et, sp.flood.s, sp.flood.d, sp.flood.dl));
  for (const tdl of sp.tendrils) {
    const p = easeOut(clamp01((et - tdl.dl) / 0.28));
    if (p <= 0) continue;
    lg.lineWidth = tdl.w * Math.min(1.6, m); lg.setLineDash([tdl.len * p, tdl.len + 1]); lg.stroke(tdl.p);
  }
  lg.setLineDash([]);
  for (const sh of sp.shapes) put(sh, grow(et, sh.s, sh.d, sh.dl) * m);
  lg.globalCompositeOperation = 'source-in'; lg.fillStyle = o.color; lg.fillRect(0, 0, 100, 100);
  if (o.pattern) { lg.globalCompositeOperation = 'source-atop'; lg.globalAlpha = o.patAlpha ?? 0.5; lg.drawImage(o.pattern, 0, 0, 100, 100); lg.globalAlpha = 1; }
  if (o.shine !== false) {
    const sc = grow(et, 1.6, 0.7, 0.1) * Math.min(1.25, m);
    if (sc > 0) {
      lg.globalCompositeOperation = 'source-atop';
      const x = sp.cx - 9 * sc, y = sp.cy - 12 * sc, gr = lg.createRadialGradient(x, y, 0, x, y, 30 * sc);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      lg.fillStyle = gr; lg.fillRect(0, 0, 100, 100);
    }
  }
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over';
  return c;
}

/** how far the rarity ink has spread (1 = it floods the canvas) — it widens through the spin and floods as the drum lands */
function inkSpread(s: Step, t: number, reduce: boolean) {
  if (reduce || s.rStart == null) return 1;
  if (s.rLock != null && t >= s.rLock) return 1;
  const free = (x: number) => 0.42 + 0.3 * (1 - Math.exp(-(x - s.rStart!) / 1400));
  const l = s.rReel ? lastLand(s.rReel, t) : null;
  if (!l) return free(t);
  const first = s.rReel!.lands[0], m0 = free(first.t);
  return m0 + (1 - m0) * smooth((t - first.t) / Math.max(1, l.t + l.D - first.t));
}

// ---- the stage --------------------------------------------------------------------------------------------------------
export function drawStage(g: CanvasRenderingContext2D, L: Layout, tr: Trace, t: number, o: StageOpts) {
  const A = o.assets, { W, H, cx, cy, u, s } = L;
  const reduce = tr.reduce;
  const ph = phaseAt(tr, t);
  const final = finalOf(tr), finfo = rarityInfo(final), ench = tr.final.enchant ?? null;
  const tier = rarityTier(final), ultra = tier >= 5 || !!ench;
  const rt = tr.reveal != null ? t - tr.reveal : -1;
  const revealed = ph === 'reveal';
  const fcol = colorOf(final), fglow = ench ? '#F0DBFF' : finfo.glow;
  const si = stepAt(tr, t), step = tr.steps[si];
  const c = inkColor(tr, t);

  g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // the room
  const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  // (the room and its glow in one pass: the ink's colour soaks into the middle of the room)
  const roomOp = ph === 'drop' ? 0 : revealed ? lerp(0.55, 1, clamp01(rt / 450)) : clamp01((t - tr.drop) / 450) * 0.55;
  const k = Math.max(W, H) * 0.62 / far, a = 0.45 * roomOp;
  const room = g.createRadialGradient(cx, cy, 0, cx, cy, far);
  room.addColorStop(0, mix('#2A1F5C', c, a));
  room.addColorStop(Math.min(0.6, k * 0.5), mix(mix('#2A1F5C', '#0B0820', (k * 0.5) / 0.62), c, a * 0.5));
  room.addColorStop(0.62, mix('#0B0820', c, a * Math.max(0, 1 - 0.62 / k) * 0.3));
  room.addColorStop(1, '#05040F');
  g.fillStyle = room; g.fillRect(0, 0, W, H);

  // rays once it lands
  if (revealed && !reduce && (tier >= 1 || ench)) drawRays(g, L, rt, ultra, fglow, tier);
  // the celebration's screen effect, and the flash
  if (revealed && !reduce && tr.overlay) drawOverlay(g, L, tr.overlay.kind, t - tr.overlay.t);
  if (revealed && !reduce && rt < 700) {
    const op = framesAt(rt / 700, [0, 0.12, 1], [0, 0.95, 0], easeOut);
    const fl = g.createRadialGradient(cx, cy, 0, cx, cy, far);
    fl.addColorStop(0, rgba('#ffffff', op)); fl.addColorStop(tier >= 3 ? 0.3 : 0.1, rgba('#ffffff', op)); fl.addColorStop(0.45, rgba(fglow, op * 0.67)); fl.addColorStop(0.75, rgba(fglow, 0));
    g.fillStyle = fl; g.fillRect(0, 0, W, H);
  }

  // the shake (rarer = harder)
  g.save();
  const sh = tr.shakes.find((x) => t >= x.t && t - x.t < 760);
  if (sh && !reduce) {
    const dur = sh.k === 3 ? 750 : sh.k === 2 ? 500 : 300, x = (t - sh.t) / dur;
    if (x < 1) {
      const X = sh.k === 3 ? [0, -20, 18, -14, 10, -6, 3, 0] : sh.k === 2 ? [0, -12, 10, -7, 5, -2, 0] : [0, -5, 4, -2, 0];
      const Y = sh.k === 3 ? [0, 9, -11, 7, -5, 2, 0] : sh.k === 2 ? [0, 5, -6, 4, -2, 0] : [0];
      g.translate(frames(x, X) * s, frames(x, Y) * s);
    }
  }

  // the reels, then the name
  if (revealed) drawTitle(g, L, A, tr, rt);
  else if (step && ph !== 'drop') drawReels(g, L, A, tr, step, si, t, ph);
  else if (ph === 'drop') {
    g.font = `900 ${Math.round(22 * s)}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('Rolling your plot…', cx, L.cardTop - 55 * s);
  }

  // the card
  drawCard(g, L, A, tr, t, ph, step, si, rt);

  // the minigame tag on the card
  drawTypeChip(g, L, A, tr, t, step, ph);
  g.restore();

  // the Enchanted transformation
  if (ph === 'enchant' && ench) drawEnchant(g, L, A, tr, t - tr.enchant!.t0, ench.kind, ench.sigil);

  // particles on top of everything
  drawParticles(g, L, tr.bursts, t, tr.u0);
  void fcol;
}

function drawRays(g: CanvasRenderingContext2D, L: Layout, rt: number, ultra: boolean, glow: string, tier: number) {
  const { cx, cy, W, H } = L, R = Math.max(W, H) * 0.65;
  const op = clamp01(rt / 500), rot = (rt / 24000) * Math.PI * 2;
  g.save(); g.translate(cx, cy); g.rotate(rot); g.globalAlpha = op;
  const mk = (col: string, a: number) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, R); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.08, rgba(col, a)); gr.addColorStop(0.7, rgba(col, 0)); return gr; };
  const wedge = (a0: number, a1: number) => { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath(); g.fill(); };
  const d = Math.PI / 180;
  if (ultra) {
    for (let i = 0; i < 8; i++) {
      const col = [...RAINBOW, RAINBOW[0]][i];
      g.fillStyle = mk(col, 0.4); wedge((i * 45) * d - Math.PI / 2, (i * 45 + 8) * d - Math.PI / 2);
      g.fillStyle = mk(col, 0.27); wedge((i * 45 + 22.5) * d - Math.PI / 2, (i * 45 + 30) * d - Math.PI / 2);
    }
  } else {
    g.fillStyle = mk(glow, tier >= 3 ? 0.33 : 0.19);
    for (let a = 0; a < 360; a += 22) wedge(a * d - Math.PI / 2, (a + 7) * d - Math.PI / 2);
  }
  g.restore();
}

function drawOverlay(g: CanvasRenderingContext2D, L: Layout, kind: string | null, ot: number) {
  const { cx, cy, W, H } = L, far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  g.save();
  if (kind === 'dark') {
    g.globalAlpha = framesAt(ot / 2200, [0, 0.25, 0.45, 1], [0, 1, 1, 0.25], smooth);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, far); gr.addColorStop(0.12, 'rgba(0,0,0,0)'); gr.addColorStop(0.4, 'rgba(0,0,0,0.92)'); gr.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  } else if (kind === 'night' || kind === 'gold' || kind === 'fire') {
    const dur = kind === 'night' ? 2400 : kind === 'gold' ? 2200 : 2600;
    g.globalAlpha = framesAt(ot / dur, [0, 0.15, 1], [0, 1, 0.35], easeOut);
    let gr: CanvasGradient;
    if (kind === 'night') { gr = g.createRadialGradient(cx, cy * 0.95, 0, cx, cy * 0.95, far); gr.addColorStop(0, 'rgba(40,52,140,0.15)'); gr.addColorStop(1, 'rgba(6,8,30,0.85)'); }
    else if (kind === 'gold') { gr = g.createRadialGradient(cx, cy, 0, cx, cy, far); gr.addColorStop(0, 'rgba(255,214,90,0.45)'); gr.addColorStop(0.65, 'rgba(255,214,90,0)'); }
    else { gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, 'rgba(255,90,31,0.75)'); gr.addColorStop(0.4, 'rgba(255,209,102,0.25)'); gr.addColorStop(0.7, 'rgba(255,209,102,0)'); }
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  } else if (kind === 'void') {
    const x = ot / 2400;
    g.globalAlpha = framesAt(x, [0, 0.3, 0.55, 1], [0, 1, 1, 0], smooth);
    const sc = framesAt(x, [0, 0.3], [1.6, 1], smooth);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, far * sc); gr.addColorStop(0.08, 'rgba(0,0,0,0)'); gr.addColorStop(0.3, 'rgba(0,0,0,0.95)'); gr.addColorStop(1, 'rgba(0,0,0,0.95)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  g.restore();
}

/** draw a sprite (made at the screen's density) centred at x, y */
function blit(g: CanvasRenderingContext2D, spr: HTMLCanvasElement, dpr: number, x: number, y: number, sx = 1, sy = sx) {
  const w = spr.width / dpr, h = spr.height / dpr;
  g.save(); g.translate(x, y); g.scale(sx, sy); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
}

function pill(g: CanvasRenderingContext2D, x: number, y: number, text: string, o: { font: string; fg: string; bg: string | CanvasGradient; h: number; padX: number; stroke?: string; track?: number }) {
  g.save(); g.font = o.font;
  const tw = g.measureText(text).width + (o.track ?? 0) * text.length;
  const w = tw + o.padX * 2;
  g.fillStyle = o.bg; g.beginPath(); g.roundRect(x - w / 2, y - o.h / 2, w, o.h, o.h / 2); g.fill();
  if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = 1.5; g.stroke(); }
  g.fillStyle = o.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (o.track) { let px = x - tw / 2; for (const ch of text) { const cw = g.measureText(ch).width; g.textAlign = 'left'; g.fillText(ch, px, y + 1); px += cw + o.track; } }
  else g.fillText(text, x, y + 1);
  g.restore();
  return w;
}

// ---- the reels --------------------------------------------------------------------------------------------------------
/** a rarity's size on the drum (long names smaller) */
export function rowFont(id: RarityId, s: number) {
  const info = rarityInfo(id), len = [...`${info.emoji ? `${info.emoji} ` : ''}${info.name}`].length;
  return clamp(Math.floor(420 / Math.max(6, len)), 22, 34) * s;
}
/** make the reels' pictures ahead of time, a few a frame (so the drum never hitches the first time it spins) */
export function prewarm(A: Assets, L: Layout, budget = 3) {
  for (const ty of TYPE_ORDER) { if (budget <= 0) return false; if (!A.has(`tile:${ty}:${Math.round(64 * L.s * A.dpr)}`)) { A.tile(ty, 64 * L.s); budget--; } }
  for (const id of RARITY_ORDER) {
    const fs = rowFont(id, L.s);
    if (budget <= 0) return false;
    if (!A.has(`lab:${id}:${Math.round(fs * A.dpr)}:0`)) { A.label(id, fs); A.label(id, fs, true); budget--; }
  }
  return true;
}
function drawReels(g: CanvasRenderingContext2D, L: Layout, A: Assets, tr: Trace, st: Step, si: number, t: number, ph: Phase) {
  const { s, cx, ry } = L;
  const showType = !!st.tReel && !st.quick && (st.rStart == null || t < st.rStart + 260);
  const showRarity = st.rStart != null && t >= st.rStart;
  // which step: ① the minigame, ② the rarity
  const lab = showRarity ? 'RARITY' : 'MINIGAME', n = showRarity ? '2' : '1';
  const fadeIn = showRarity && st.tReel && !st.quick ? clamp01((t - st.rStart!) / 260) : 1;
  g.save(); g.globalAlpha = 0.9 * fadeIn;
  const y = ry - 56 * s;
  g.font = `800 ${Math.round(10.5 * s)}px ${BODY}`;
  const w = pill(g, cx + 9 * s, y, lab, { font: `800 ${Math.round(10.5 * s)}px ${BODY}`, fg: 'rgba(255,255,255,0.78)', bg: 'rgba(255,255,255,0.08)', h: 20 * s, padX: 12 * s, track: 2.2 * s });
  g.fillStyle = showRarity ? rarityInfo(rarityAt(st, t)).color : (PLOT_TYPES[typeAt(st, t) as keyof typeof PLOT_TYPES]?.a ?? '#fff');
  g.beginPath(); g.arc(cx + 9 * s - w / 2 - 2 * s, y, 10 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0B0820'; g.font = `900 ${Math.round(11 * s)}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, cx + 9 * s - w / 2 - 2 * s, y + 0.5);
  g.restore();
  if (showType) drawTypeReel(g, L, A, st, t, st.rStart != null ? 1 - clamp01((t - st.rStart) / 260) : 1);
  if (showRarity) drawRarityReel(g, L, A, tr, st, si, t, ph, fadeIn);
}

function drawTypeReel(g: CanvasRenderingContext2D, L: Layout, A: Assets, st: Step, t: number, alpha: number) {
  const { s, cx, ry, W } = L, dpr = A.dpr;
  const r = st.tReel!, pos = reelPos(r, t);
  const T = 64 * s, gap = 84 * s;
  const locked = st.tLock != null && t >= st.tLock, lt = locked ? t - st.tLock! : 0;
  const center = TYPE_ORDER[mod(Math.round(pos), NT)], ct = PLOT_TYPES[center];
  g.save(); g.globalAlpha = alpha;
  // the track
  const band = g.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, 'rgba(10,8,30,0)'); band.addColorStop(0.18, 'rgba(10,8,30,0.6)'); band.addColorStop(0.82, 'rgba(10,8,30,0.6)'); band.addColorStop(1, 'rgba(10,8,30,0)');
  g.fillStyle = band; g.fillRect(0, ry - T * 0.72, W, T * 1.44);
  const line = g.createLinearGradient(0, 0, W, 0);
  line.addColorStop(0, 'rgba(255,255,255,0)'); line.addColorStop(0.5, 'rgba(255,255,255,0.22)'); line.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = line; g.fillRect(0, ry - T * 0.72, W, 1); g.fillRect(0, ry + T * 0.72, W, 1);
  // the glow behind the winner
  const halo = g.createRadialGradient(cx, ry, 0, cx, ry, T * 1.1);
  halo.addColorStop(0, rgba(ct.a, 0.55 + (locked ? 0.3 * Math.max(0, 1 - lt / 500) : 0))); halo.addColorStop(1, rgba(ct.a, 0));
  g.fillStyle = halo; g.fillRect(cx - T * 1.2, ry - T * 1.2, T * 2.4, T * 2.4);
  // the tiles
  const base = Math.floor(pos);
  for (let k = base - 5; k <= base + 6; k++) {
    const d = k - pos, x = cx + d * gap;
    if (x < -T || x > W + T) continue;
    const edge = clamp01((W / 2 - Math.abs(x - cx)) / (W * 0.2));
    const near = Math.max(0, 1 - Math.abs(d));
    let sc = 1 + 0.2 * near;
    let a = edge * (0.55 + 0.45 * near);
    if (locked) {
      const isWin = Math.round(pos) === k;
      if (isWin) sc *= 1 + 0.28 * Math.sin(Math.min(1, lt / 320) * Math.PI) * Math.max(0, 1 - lt / 600);
      else a *= Math.max(0, 1 - lt / 220);
    }
    if (a <= 0.01) continue;
    g.globalAlpha = alpha * a;
    blit(g, A.tile(TYPE_ORDER[mod(k, NT)], 64 * s), dpr, x, ry, sc);
  }
  g.globalAlpha = alpha;
  // the pointer: two gold notches
  g.fillStyle = '#FFE14D';
  const py = T * 0.72 + 2 * s;
  g.beginPath(); g.moveTo(cx - 8 * s, ry - py - 6 * s); g.lineTo(cx + 8 * s, ry - py - 6 * s); g.lineTo(cx, ry - py + 5 * s); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx - 8 * s, ry + py + 6 * s); g.lineTo(cx + 8 * s, ry + py + 6 * s); g.lineTo(cx, ry + py - 5 * s); g.closePath(); g.fill();
  // the click: a white flash and a ring
  if (locked && lt < 420) {
    g.globalAlpha = alpha * (1 - lt / 420);
    g.strokeStyle = '#fff'; g.lineWidth = 3 * s * (1 - lt / 420) + 0.5;
    g.beginPath(); g.roundRect(cx - (T / 2) * (1.25 + lt / 300), ry - (T / 2) * (1.25 + lt / 300), T * (1.25 + lt / 300), T * (1.25 + lt / 300), T * 0.3); g.stroke();
  }
  g.restore();
}

function drawRarityReel(g: CanvasRenderingContext2D, L: Layout, A: Assets, tr: Trace, st: Step, si: number, t: number, ph: Phase, alpha: number) {
  const { s, cx, ry, W } = L, dpr = A.dpr;
  const breaking = ph === 'enchant';
  // (an Enchanted roll: the drum stops dead where it broke)
  const r = st.rReel!, pos = reelPos(r, breaking ? tr.enchant!.t0 : t);
  const rowH = 58 * s, pw = Math.min(W - 48, 312 * s), ph2 = 58 * s;
  const ck = Math.round(pos), cid = RARITY_ORDER[mod(ck, NR)], ci = rarityInfo(cid), ctier = rarityTier(cid);
  const dwell = 1 - Math.min(1, Math.abs(pos - ck) * 2);
  const locked = st.rLock != null && t >= st.rLock, lt = locked ? t - st.rLock! : 0;
  const charge = st.charge != null && t >= st.charge && !locked ? (rarityTier(st.rarity) * 0.45 + 0.6) * s : 0;
  g.save(); g.globalAlpha = alpha;
  if (charge) { const k = Math.floor(t / 17.5) % 4; g.translate(k === 0 ? charge : k === 2 ? -charge : 0, k === 1 ? charge : k === 3 ? -charge : 0); }
  // the window: a glass plate tinted with the rarity passing through it
  const x0 = cx - pw / 2, y0 = ry - ph2 / 2;
  const glow = g.createRadialGradient(cx, ry, 0, cx, ry, pw * 0.62);
  glow.addColorStop(0, rgba(ci.color, 0.34 + 0.16 * dwell)); glow.addColorStop(1, rgba(ci.color, 0));
  g.fillStyle = glow; g.fillRect(cx - pw * 0.7, ry - pw * 0.4, pw * 1.4, pw * 0.8);
  const plate = g.createLinearGradient(x0, 0, x0 + pw, 0);
  plate.addColorStop(0, 'rgba(255,255,255,0)'); plate.addColorStop(0.2, rgba(shade(ci.color, 0.6), 0.1)); plate.addColorStop(0.8, rgba(shade(ci.color, 0.6), 0.1)); plate.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = plate; g.beginPath(); g.roundRect(x0, y0, pw, ph2, 16 * s); g.fill();
  const edge = g.createLinearGradient(x0, 0, x0 + pw, 0);
  edge.addColorStop(0, 'rgba(255,255,255,0)'); edge.addColorStop(0.5, ctier >= 5 ? '#fff' : rgba(shade(ci.color, 0.5), 0.6)); edge.addColorStop(1, 'rgba(255,255,255,0)');
  if (ctier >= 5) {
    // the ultras: a holographic rim running round the window
    const off = (t / 900) % 1;
    const holo = g.createLinearGradient(x0 - pw * off, 0, x0 + pw * (2 - off), 0);
    [...RAINBOW, ...RAINBOW].forEach((c2, i, a) => holo.addColorStop(i / (a.length - 1), c2));
    g.strokeStyle = holo; g.globalAlpha = alpha * (0.45 + 0.55 * dwell); g.lineWidth = 2 * s;
    g.beginPath(); g.roundRect(x0 + 6 * s, y0, pw - 12 * s, ph2, 16 * s); g.stroke(); g.globalAlpha = alpha;
  } else { g.fillStyle = edge; g.fillRect(x0, y0, pw, 1); g.fillRect(x0, y0 + ph2 - 1, pw, 1); }
  // each rarity's own flourish while it sits in the window
  if (dwell > 0.05 && !breaking) rarityFx(g, L, cid, ctier, t, x0, y0, pw, ph2, dwell * alpha);
  // the rows
  const base = Math.floor(pos);
  for (let k = base - 3; k <= base + 3; k++) {
    const d = k - pos, ad = Math.abs(d);
    const id = RARITY_ORDER[mod(k, NR)];
    const fs = rowFont(id, s);
    // fade out above and (faster) below, like looking into a drum
    const mask = d < 0 ? clamp01(1 - (ad - 0.35) / 0.6) : clamp01(1 - (ad - 0.3) / 0.62);
    let a = Math.max(0, 1 - ad * 0.34) * mask;
    if (breaking) a *= 0.6;
    if (a <= 0.01) continue;
    const ang = clamp(-d * 26, -88, 88) * (Math.PI / 180);
    const sc = (1 - Math.min(ad, 3) * 0.1) * (locked && k === ck ? 1 + 0.12 * Math.max(0, 1 - lt / 260) : 1);
    const spr = A.label(id, fs);
    const maxW = pw - 20 * s, sw = spr.width / dpr, fit = sw > maxW + fs ? (maxW + fs) / sw : 1;
    g.globalAlpha = alpha * a;
    blit(g, spr, dpr, cx, ry + d * rowH, sc * fit, sc * fit * Math.cos(ang));
    // the shine running across the name in the window
    if (ad < 0.5 && !breaking) {
      // (one fixed scratch buffer, so nothing is allocated per frame)
      const m = A.label(id, fs, true), lay = A.layer('shine', 560 * s, 110 * s), lg = lay.getContext('2d')!;
      const mw = Math.min(m.width, lay.width), mh = Math.min(m.height, lay.height);
      lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, mw + 2, mh + 2);
      lg.drawImage(m, 0, 0); lg.globalCompositeOperation = 'source-in';
      const p = ((t / 1100) % 1) * 1.6 - 0.3, bw = mw * 0.18, bx = p * mw;
      const band = lg.createLinearGradient(bx - bw, 0, bx + bw, mh * 0.3);
      band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.85)'); band.addColorStop(1, 'rgba(255,255,255,0)');
      lg.fillStyle = band; lg.fillRect(0, 0, mw, mh);
      lg.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha * a * (0.35 + 0.4 * rarityTier(id) / 5) * (1 - ad * 2);
      g.globalCompositeOperation = 'lighter';
      const w = mw / dpr, h = mh / dpr, k = sc * fit;
      g.save(); g.translate(cx, ry + d * rowH); g.scale(k, k * Math.cos(ang)); g.drawImage(lay, 0, 0, mw, mh, -w / 2, -h / 2, w, h); g.restore();
      g.globalCompositeOperation = 'source-over';
    }
  }
  // it lands: the plate flashes
  if (locked && lt < 300) {
    g.globalAlpha = alpha * 0.7 * (1 - lt / 300); g.fillStyle = '#fff';
    g.beginPath(); g.roundRect(x0 + 10 * s, y0, pw - 20 * s, ph2, 16 * s); g.fill();
  }
  // an Enchanted roll: the drum cracks
  if (breaking) {
    const et = t - tr.enchant!.t0, op = 1 - clamp01((et - 350) / 400);
    if (op > 0) {
      const bw = Math.min(W * 0.8, 360 * s);
      g.globalAlpha = op; g.strokeStyle = '#FFE8A3'; g.lineWidth = 1.2 * (bw / 100); g.lineCap = 'round'; g.lineJoin = 'round';
      const P = [[[50, 50], [8, 20], [20, 34]], [[50, 50], [92, 26], [80, 40]], [[50, 50], [30, 92]], [[50, 50], [76, 88], [70, 74]], [[50, 50], [4, 62]], [[50, 50], [97, 66]]];
      P.forEach((pts, i) => {
        const p = clamp01((et - i * 30) / 300), segs = pts.length - 1;
        g.beginPath(); g.moveTo(cx + (pts[0][0] - 50) * bw / 100, ry + (pts[0][1] - 50) * bw / 100 * 0.5);
        for (let j = 1; j <= segs; j++) {
          const f = clamp01(p * segs - (j - 1)); if (f <= 0) break;
          const [ax, ay] = pts[j - 1], [bx, by] = pts[j];
          g.lineTo(cx + (lerp(ax, bx, f) - 50) * bw / 100, ry + (lerp(ay, by, f) - 50) * bw / 100 * 0.5);
        }
        g.stroke();
      });
    }
  }
  g.restore();
  void si;
}

/** the little extra each rarity does while it's in the window: a glint, lightning, gold sparkles, a prism, a hologram */
function rarityFx(g: CanvasRenderingContext2D, L: Layout, id: RarityId, tier: number, t: number, x0: number, y0: number, pw: number, ph: number, a: number) {
  const { s, cx, ry } = L, info = rarityInfo(id);
  g.save();
  g.beginPath(); g.rect(x0 - 40 * s, y0 - 30 * s, pw + 80 * s, ph + 60 * s); g.clip();
  if (tier >= 1) {
    // a glint sweeping the glass
    const p = ((t / 760) % 1) * 1.4 - 0.2, bx = x0 + p * pw;
    const gl = g.createLinearGradient(bx - 30 * s, y0, bx + 30 * s, y0 + ph);
    gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, rgba(tier === 4 ? '#FFC4E1' : '#ffffff', 0.2 * a)); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.beginPath(); g.roundRect(x0, y0, pw, ph, 16 * s); g.fill();
  }
  if (tier === 2 || tier >= 5) {
    // electricity crackling off both ends
    const R = rng(Math.floor(t / 70) * 7919 + RARITY_ORDER.indexOf(id));
    g.lineJoin = 'round';
    for (const side of [-1, 1]) for (let n = 0; n < 2; n++) {
      let x = cx + side * (pw / 2 - 18 * s), y = ry + (R() - 0.5) * ph * 0.6;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 5; k++) { x += side * (6 + R() * 8) * s; y += (R() - 0.5) * 16 * s; pts.push([x, y]); }
      for (const [lw, col] of [[5 * s, rgba(info.color, 0.35 * a)], [1.6 * s, rgba(tier === 2 ? '#DABDFF' : info.glow, 0.95 * a)]] as const) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      }
    }
  }
  if (tier >= 3) {
    // sparkles round the window (gold for Legendary)
    const R = rng(Math.floor(t / 120) * 104729 + tier);
    const col = tier === 3 ? '#FFE3A1' : tier === 4 ? '#FFC4E1' : RAINBOW[Math.floor(t / 120) % RAINBOW.length];
    g.fillStyle = rgba(col, a);
    for (let n = 0; n < (tier >= 5 ? 7 : 5); n++) {
      const x = x0 + R() * pw, y = R() < 0.5 ? y0 - 4 * s + R() * 8 * s : y0 + ph - 4 * s + R() * 8 * s, r = (3 + R() * 4) * s;
      g.save(); g.translate(x, y); g.rotate(R()); g.fillRect(-r, -0.9 * s, r * 2, 1.8 * s); g.fillRect(-0.9 * s, -r, 1.8 * s, r * 2); g.restore();
    }
  }
  if (tier === 4 || tier >= 5) {
    // a prism of colour behind the name
    const p = ((t / 1300) % 1) * 1.6 - 0.3, bx = x0 + p * pw;
    const pr = g.createLinearGradient(bx - 70 * s, 0, bx + 70 * s, 0);
    RAINBOW.forEach((c2, i) => pr.addColorStop(i / (RAINBOW.length - 1), rgba(c2, 0.16 * a)));
    g.fillStyle = pr; g.beginPath(); g.roundRect(x0 + 8 * s, y0 + 3 * s, pw - 16 * s, ph - 6 * s, 14 * s); g.fill();
  }
  g.restore();
}

// ---- the name at the reveal ---------------------------------------------------------------------------------------------
function drawTitle(g: CanvasRenderingContext2D, L: Layout, A: Assets, tr: Trace, rt: number) {
  const { s, cx, cardTop, W } = L, dpr = A.dpr;
  const ench = tr.final.enchant, final = finalOf(tr), info = rarityInfo(final), tier = rarityTier(final);
  const ek = ench ? kindInfo(ench.kind) : null;
  const name = ek ? `${ek.name}!` : `${info.name}${tier >= 3 ? '!' : ''}`;
  const emoji = ek ? ek.emoji : info.emoji ?? null;
  const len = [...`${emoji ? `${emoji} ` : ''}${name}`].length;
  const fs = Math.max(22, Math.min(50, Math.floor(470 / Math.max(6, len)))) * s;
  const spr = A.title(name.toUpperCase(), emoji, ench ? 'enchanted' : final, fs);
  const ty = cardTop - 55 * s;
  const p = tr.reduce ? 1 : spring(rt / 1000, 520, 22);
  const sw = spr.width / dpr, fit = sw > W - 16 ? (W - 16) / sw : 1;
  g.save(); g.globalAlpha = clamp01(p * 1.6);
  blit(g, spr, dpr, cx, ty - 6 * s * (1 - p), lerp(1.9, 1, p) * fit);
  g.restore();
  if (tier >= 5 || ench) {
    const q = tr.reduce ? 1 : spring((rt - 150) / 1000, 500, 18);
    if (q > 0) {
      g.save(); g.globalAlpha = clamp01(q);
      const text = ench ? `ENCHANTED · #${ench.serial}` : 'ULTRA RARE';
      g.font = `900 ${Math.round(13 * s)}px ${DISPLAY}`;
      const w = g.measureText(text).width + 13 * s * 0.3 * text.length + 32 * s;
      const by = ty - 46 * s;
      const gr = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      (ench ? ['#B26BFF', '#FFE8A3', '#B26BFF'] : [...RAINBOW, RAINBOW[0]]).forEach((c2, i, a) => gr.addColorStop(i / (a.length - 1), c2));
      g.translate(cx, by); g.scale(q, q);
      pill(g, 0, 0, text, { font: `900 ${Math.round(13 * s)}px ${DISPLAY}`, fg: '#1a0b2e', bg: gr, h: 26 * s, padX: 16 * s, track: 3.6 * s });
      g.restore();
    }
  }
}

// ---- the card ------------------------------------------------------------------------------------------------------------
function drawCard(g: CanvasRenderingContext2D, L: Layout, A: Assets, tr: Trace, t: number, ph: Phase, st: Step | undefined, si: number, rt: number) {
  const { s, cx, cy, u } = L, dpr = A.dpr;
  const reduce = tr.reduce, revealed = ph === 'reveal';
  const final = finalOf(tr), finfo = rarityInfo(final), ench = tr.final.enchant ?? null, tier = rarityTier(final);
  const fcol = colorOf(final);
  const c = inkColor(tr, t);
  // it springs in, trembles as it charges, and pops when the rarity lands
  const enter = reduce ? 1 : spring(t / 1000, 260, 19);
  let sc = lerp(0.55, 1, enter), rot = lerp(-6, 0, enter) * (Math.PI / 180);
  if (revealed && !reduce) sc *= framesAt(rt / 500, [0, 0.45, 1], [0.92, 1.06, 1]);
  let jx = 0, jy = 0;
  if (st?.charge != null && t >= st.charge && !(st.rLock != null && t >= st.rLock) && !reduce && ph === 'spin') {
    const amp = (0.6 + rarityTier(st.rarity) * 0.45) * s, k = Math.floor(t / 17.5) % 4;
    jx = k === 0 ? amp : k === 2 ? -amp : 0; jy = k === 1 ? amp : k === 3 ? -amp : 0;
  }
  const r = 28 * s, half = u / 2;
  g.save();
  g.translate(cx + jx, cy + jy); g.rotate(rot); g.scale(sc, sc);
  g.globalAlpha = clamp01(enter * 1.5);
  // the glow behind it
  const gop = ph === 'drop' ? 0 : revealed ? 1 : 0.6;
  if (gop > 0) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, half + 48 * s);
    gr.addColorStop(0, rgba(c, gop)); gr.addColorStop(0.45, rgba(c, 0.45 * gop)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(-half - 50 * s, -half - 50 * s, u + 100 * s, u + 100 * s);
  }
  // its shadow, then the canvas itself
  const shadow = A.shadow(u, r);
  g.drawImage(shadow, -half - u * 0.25, -half - u * 0.25 + 26 * s, u * 1.5, u * 1.5);
  g.save(); g.beginPath(); g.roundRect(-half, -half, u, u, r); g.clip();
  g.drawImage(A.card(u), -half, -half, u, u);
  // the ink
  if (ph !== 'drop' && st) {
    const prev = tr.steps[si - 1];
    if (prev && !revealed) {
      g.fillStyle = rarityInfo(prev.rarity).color; g.fillRect(-half, -half, u, u);
      if (PLOT_TYPES[prev.type as keyof typeof PLOT_TYPES]) { g.globalAlpha = 0.16; g.drawImage(A.pattern(prev.type, u), -half, -half, u, u); g.globalAlpha = 1; }
    }
    if (revealed) {
      g.fillStyle = fcol; g.fillRect(-half, -half, u, u);
      if (PLOT_TYPES[tr.final.type as keyof typeof PLOT_TYPES]) { g.globalAlpha = 0.16; g.drawImage(A.pattern(tr.final.type, u), -half, -half, u, u); g.globalAlpha = 1; }
    } else {
      const t0 = stepStart(st), big = 9e9;
      const ty = typeAt(st, t), hasT = !!PLOT_TYPES[ty as keyof typeof PLOT_TYPES];
      const tcol = PLOT_TYPES[ty as keyof typeof PLOT_TYPES]?.a ?? INK;
      // ① the medium: the first splash takes on the minigame's colour and pattern
      const la = inkLayer(A, 'inkA', u, splash(st.seed), reduce ? big : (t - t0) / 1000, { color: st.tReel ? tcol : INK, pattern: hasT && st.tReel ? A.pattern(ty, u) : null, patAlpha: 0.5 });
      g.drawImage(la, -half, -half, u, u);
      // ② the rarity: a second ink spreads over it as the drum slows, and floods it as it lands
      if (st.rStart != null && t >= st.rStart) {
        const m = inkSpread(st, t, reduce);
        const rc = rarityInfo(rarityAt(st, t)).color;
        const lb = inkLayer(A, 'inkB', u, splash(st.seed ^ 0x5bd1e995), reduce ? big : (t - st.rStart) / 1000, {
          mult: m, flood: clamp01((m - 0.72) / 0.28), color: rc, pattern: PLOT_TYPES[st.type as keyof typeof PLOT_TYPES] && st.tLock != null ? A.pattern(st.type, u) : null, patAlpha: 0.16,
        });
        g.drawImage(lb, -half, -half, u, u);
      }
    }
  }
  // an Enchanted card: the ink turns to the enchantment's own night sky
  if (revealed && ench) {
    const k = kindInfo(ench.kind);
    g.globalAlpha = reduce ? 1 : clamp01(rt / 500);
    const a1 = g.createRadialGradient(0, -half * 0.1, 0, 0, -half * 0.1, u * 0.62); a1.addColorStop(0, rgba(k.a, 0.4)); a1.addColorStop(1, rgba(k.a, 0));
    const bg = g.createLinearGradient(-half, -half, half, half); bg.addColorStop(0, '#1B0733'); bg.addColorStop(1, '#07020F');
    g.fillStyle = bg; g.fillRect(-half, -half, u, u); g.fillStyle = a1; g.fillRect(-half, -half, u, u);
    const a2 = g.createRadialGradient(-half * 0.6, half * 0.7, 0, -half * 0.6, half * 0.7, u * 0.55); a2.addColorStop(0, rgba(k.b, 0.27)); a2.addColorStop(1, rgba(k.b, 0));
    g.fillStyle = a2; g.fillRect(-half, -half, u, u);
    if (!reduce) for (let i = 0; i < 14; i++) twinkle(g, -half + ((i * 37) % 92 + 4) / 100 * u, -half + ((i * 53) % 88 + 6) / 100 * u, 5 * s, (rt / 1000 - (i % 7) * 0.3) / 1.4, 'rgba(255,255,255,0.8)');
    g.globalAlpha = 1;
  }
  // the plot rises out of the ink
  if (revealed) {
    const p = reduce ? 1 : spring((rt - 200) / 1000, 330, 15);
    if (p > 0) {
      const img = ench ? A.sigil(ench.kind, ench.sigil) : A.art(final, tr.final.shiny);
      if (img) {
        const inner = u * 0.72;
        g.save(); g.globalAlpha = clamp01(p * 1.4); g.translate(0, 24 * s * (1 - p)); g.rotate(lerp(-14, 0, p) * (Math.PI / 180)); g.scale(lerp(0.3, 1, p), lerp(0.3, 1, p));
        g.drawImage(img, -inner / 2, -inner / 2, inner, inner);
        g.restore();
      }
    }
    if (!reduce && (tr.final.shiny || tier >= 3)) {
      // a sheen sweeping across
      const cyc = ((rt - 600) / 2400) % 1;
      if (rt > 600 && cyc < 0.55) {
        const x = lerp(-1.2, 1.2, easeOut(cyc / 0.55)) * u;
        const gr = g.createLinearGradient(x - u * 0.5, -half, x + u * 0.5, half * 0.2);
        gr.addColorStop(0.35, 'rgba(255,255,255,0)'); gr.addColorStop(0.48, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(-half, -half, u, u);
      }
    }
    if (!reduce && tr.final.shiny && rt > 800) {
      // holographic foil
      const cyc = ((rt - 800) / 2200) % 1, op = framesAt(cyc, [0, 0.15, 1], [0, 1, 1]);
      const x = lerp(1.3, -1.3, smooth(cyc)) * u * 1.6;
      const gr = g.createLinearGradient(x - u, -half, x + u, half);
      [[0.2, 'rgba(255,122,224,0)'], [0.32, 'rgba(255,122,224,0.55)'], [0.4, 'rgba(255,225,77,0.55)'], [0.48, 'rgba(61,220,151,0.5)'], [0.56, 'rgba(34,227,255,0.55)'], [0.64, 'rgba(164,92,255,0.55)'], [0.76, 'rgba(164,92,255,0)']].forEach(([o2, c2]) => gr.addColorStop(o2 as number, c2 as string));
      g.globalAlpha = op; g.globalCompositeOperation = 'color-dodge'; g.fillStyle = gr; g.fillRect(-half, -half, u, u);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
  }
  g.restore();
  // the border
  g.lineWidth = 6 * s; g.strokeStyle = revealed ? fcol : '#E9DFC8';
  g.beginPath(); g.roundRect(-half + 3 * s, -half + 3 * s, u - 6 * s, u - 6 * s, r - 3 * s); g.stroke();
  // the falling drop
  if (ph === 'drop') {
    const x = t / tr.drop;
    const seg = x < 0.85 ? dropEase(x / 0.85) : dropEase((x - 0.85) / 0.15);
    const ty = x < 0.85 ? lerp(-L.H * 0.62, -43 * s, seg) : lerp(-43 * s, -29 * s, seg);
    const sx = x < 0.85 ? 0.8 : lerp(0.8, 1.6, seg), sy = x < 0.85 ? lerp(1.5, 1.6, seg) : lerp(1.6, 0.6, seg);
    g.save(); g.translate(0, ty + 36 * s); g.scale(sx * 1.2 * s, sy * 1.2 * s); g.translate(-20, -30);
    g.fillStyle = INK; g.fill(new Path2D('M20 2 C26 16 36 28 36 40 A16 16 0 0 1 4 40 C4 28 14 16 20 2Z'));
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(14, 38, 4, 7, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // shockwaves: each splash, then the reveal
  if (!reduce) {
    for (const st2 of tr.steps) { const wt = t - stepStart(st2); if (wt >= 0 && wt < 500 && !revealed) wave(g, wt / 500, 4, 0.9, '#ffffff', s); }
    if (revealed) {
      if (rt < 800) wave(g, rt / 800, 8, 1, finfo.glow, s);
      if (tier >= 2 && rt > 180 && rt < 980) wave(g, (rt - 180) / 800, 8, 1, finfo.glow, s);
    }
  }
  g.restore();
  // a shiny pull: stars twinkling round it, and the stamp
  if (revealed && tr.final.shiny && !reduce) {
    g.save(); g.translate(cx, cy); g.scale(sc, sc);
    const box = u + 64 * s;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, rr = (46 + (i % 3) * 6) / 100 * box;
      twinkle(g, Math.cos(a) * rr, Math.sin(a) * rr, (10 + (i % 4) * 5) * s * 0.6, (rt / 1000 - (0.9 + (i % 8) * 0.17)) / 1.4, '#ffffff');
    }
    const q = spring((rt - 750) / 1000, 500, 14);
    if (q > 0) {
      g.translate(half - 14 * s, -half - 4 * s); g.rotate(lerp(-12, 10, q) * (Math.PI / 180)); g.scale(lerp(3, 1, q), lerp(3, 1, q)); g.globalAlpha = clamp01(q * 2);
      g.font = `900 ${Math.round(20 * s)}px ${DISPLAY}`;
      const text = '✨ SHINY! ✨', w = g.measureText(text).width + 24 * s, h = 34 * s;
      const off = ((rt / 1600) % 1) * w;
      const gr = g.createLinearGradient(-w / 2 - off, 0, w * 1.5 - off, 0);
      ['#FF7AE0', '#FFE14D', '#3DDC97', '#22E3FF', '#A45CFF', '#FF7AE0', '#FFE14D', '#3DDC97', '#22E3FF', '#A45CFF', '#FF7AE0'].forEach((c2, i, a) => gr.addColorStop(i / (a.length - 1), c2));
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(-w / 2 - 3 * s, -h / 2 - 3 * s, w + 6 * s, h + 6 * s, 14 * s); g.fill();
      g.fillStyle = gr; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 12 * s); g.fill();
      g.fillStyle = '#1a0b2e'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 1);
    }
    g.restore();
  }
  void dpr;
}

function wave(g: CanvasRenderingContext2D, x: number, to: number, from: number, col: string, s: number) {
  const p = easeOut(clamp01(x)), sc = lerp(0.3, to, p);
  g.save(); g.globalAlpha = from * (1 - p); g.strokeStyle = col; g.lineWidth = Math.max(0.5, 4 * s);
  g.beginPath(); g.arc(0, 0, 40 * s * sc, 0, Math.PI * 2); g.stroke(); g.restore();
}
/** a ✦ that grows, turns and fades on a 1.4 s loop (x: its phase, 0…1) */
function twinkle(g: CanvasRenderingContext2D, x: number, y: number, r: number, ph: number, col: string) {
  if (ph < 0) return;
  const f = ph % 1, k = f < 0.5 ? easeInOutQ(f * 2) : easeInOutQ((1 - f) * 2);
  if (k <= 0.02) return;
  g.save(); g.translate(x, y); g.rotate(f * Math.PI); g.globalAlpha *= k; g.fillStyle = col;
  const R = r * 1.2 * k;
  g.beginPath(); g.moveTo(0, -R); g.quadraticCurveTo(0, 0, R, 0); g.quadraticCurveTo(0, 0, 0, R); g.quadraticCurveTo(0, 0, -R, 0); g.quadraticCurveTo(0, 0, 0, -R); g.fill();
  g.restore();
}
const easeInOutQ = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

// ---- the minigame's tag, docked on the card ---------------------------------------------------------------------------------
function drawTypeChip(g: CanvasRenderingContext2D, L: Layout, A: Assets, tr: Trace, t: number, st: Step | undefined, ph: Phase) {
  if (ph === 'drop' || !st) return;
  const revealed = ph === 'reveal';
  const type = revealed ? tr.final.type : st.quick && st.tReel ? typeAt(st, t) : st.type;
  const ty = PLOT_TYPES[type as keyof typeof PLOT_TYPES];
  if (!ty) return;
  // it arrives when the minigame locks (a quick reroll shows it spinning right on the tag)
  const at = st.quick ? stepStart(st) : st.tLock;
  if (at == null || (t < at && !revealed)) return;
  const { s, cx, ry, cardTop } = L;
  const k = revealed || tr.reduce ? 1 : st.quick ? 1 : easeOutCubic(clamp01((t - at - 160) / 320));
  if (k <= 0 && !st.quick) return;
  const y = lerp(ry + 52 * s, cardTop, k), sc = lerp(1.25, 1, k);
  g.save(); g.translate(cx, y); g.scale(sc, sc); g.globalAlpha *= clamp01(k * 3 + (st.quick || revealed ? 1 : 0));
  const text = `${GAME_EMOJI[type] ?? '🎮'} ${ty.game.toUpperCase()}`;
  g.font = `900 ${Math.round(11.5 * s)}px ${DISPLAY}`;
  const w = g.measureText(text).width + 26 * s, h = 26 * s;
  const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, ty.a); gr.addColorStop(1, ty.b);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.roundRect(-w / 2 - 2.5 * s, -h / 2 + 1 * s, w + 5 * s, h + 5 * s, h / 2 + 2.5 * s); g.fill();
  g.fillStyle = shade(ty.base, -0.2); g.beginPath(); g.roundRect(-w / 2 - 2.5 * s, -h / 2 - 2.5 * s, w + 5 * s, h + 5 * s, h / 2 + 2.5 * s); g.fill();
  g.fillStyle = gr; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.roundRect(-w / 2 + 4 * s, -h / 2 + 2.5 * s, w - 8 * s, h * 0.36, h * 0.2); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = 3 * s; g.strokeStyle = shade(ty.base, -0.1); g.strokeText(text, 0, 1);
  g.fillStyle = '#fff'; g.fillText(text, 0, 1);
  g.restore();
  void A;
}

// ---- the Enchanted transformation -------------------------------------------------------------------------------------------
function drawEnchant(g: CanvasRenderingContext2D, L: Layout, A: Assets, tr: Trace, et: number, kind: string, sigil: number) {
  const { W, H, cx, cy, s } = L, k = kindInfo(kind);
  g.save();
  // the room goes violet
  g.globalAlpha = clamp01(et / 400);
  const far = Math.hypot(W, H) * 0.6;
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, far);
  bg.addColorStop(0, rgba(k.a, 0.27)); bg.addColorStop(0.45, '#1A0533'); bg.addColorStop(1, '#05020C');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  // the arcane circle
  const size = Math.min(W * 0.92, 420 * s), R = size / 2;
  const cp = spring((et - 350) / 1000, 120, 14);
  if (cp > 0) {
    g.save(); g.translate(cx, cy); g.globalAlpha = clamp01(cp); g.scale(lerp(0.2, 1, cp), lerp(0.2, 1, cp));
    const u = R / 100;
    g.save(); g.rotate((et / 7000) * Math.PI * 2);
    g.strokeStyle = 'rgba(255,232,163,0.8)'; g.lineWidth = 1.2 * u; g.beginPath(); g.arc(0, 0, 96 * u, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = rgba(k.a, 0.7); g.lineWidth = 0.8 * u; g.setLineDash([3 * u, 4 * u]); g.beginPath(); g.arc(0, 0, 88 * u, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.font = `${7 * u}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFE8A3';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.save(); g.globalAlpha = clamp01(cp) * (0.3 + 0.7 * (0.5 - 0.5 * Math.cos(((et / 1000 - i * 0.06) / 1.6) * Math.PI * 2)));
      g.translate(Math.cos(a) * 92 * u, Math.sin(a) * 92 * u); g.rotate(a + Math.PI / 2); g.fillText(RUNES[(i * 7 + sigil) % RUNES.length], 0, 0); g.restore();
    }
    g.restore();
    g.save(); g.rotate(-(et / 11000) * Math.PI * 2);
    const hex = (off: number, col: string) => { g.strokeStyle = col; g.lineWidth = u; g.beginPath(); for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 + off; const x = Math.cos(a) * 74 * u, y = Math.sin(a) * 74 * u; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); };
    hex(0, 'rgba(255,232,163,0.6)'); hex(Math.PI / 6, rgba(k.a, 0.6));
    g.strokeStyle = 'rgba(255,232,163,0.4)'; g.lineWidth = 0.6 * u; g.beginPath(); g.arc(0, 0, 60 * u, 0, Math.PI * 2); g.stroke();
    g.restore();
    g.restore();
  }
  // beams converge
  if (et >= 1300) {
    const bw = Math.min(W * 0.46, 210 * s);
    const sx = et < 2100 ? lerp(1.6, 1, easeOut(clamp01((et - 1300) / 600))) : lerp(1, 0, clamp01((et - 2100) / 250));
    const op = et < 2100 ? clamp01((et - 1300) / 600) : 1 - clamp01((et - 2100) / 250);
    if (op > 0) for (let i = 0; i < 8; i++) {
      g.save(); g.translate(cx, cy); g.rotate((i * Math.PI) / 4); g.globalAlpha = op * (0.6 + 0.4 * Math.sin((et / 1200) * Math.PI * 2));
      const gr = g.createLinearGradient(0, 0, bw * sx, 0); gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(0.5, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr; g.fillRect(0, -1.5 * s, bw * sx, 3 * s); g.restore();
    }
  }
  // the sigil assembles
  const img = A.sigil(kind, sigil);
  if (et >= 1300 && img) {
    const a = spring((et - 1300) / 1000, 160, 12);
    let sc = lerp(0, 0.6, a), op = 0.5 * clamp01(a), rot = lerp(-180, 0, a);
    if (et >= 2100) { const b = spring((et - 2100) / 1000, 160, 12); sc = lerp(1.35, 1, b); op = 1; rot = 0; }
    const sz = Math.min(W * 0.55, 240 * s);
    g.save(); g.translate(cx, cy); g.rotate((rot * Math.PI) / 180); g.scale(sc, sc); g.globalAlpha = clamp01(op);
    g.drawImage(img, -sz / 2, -sz / 2, sz, sz); g.restore();
  }
  // the words
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (et >= 350 && et < 2100) {
    g.globalAlpha = framesAt(((et - 350) / 1000) % 1.2 / 1.2, [0, 0.33, 0.66, 1], [0, 1, 0.6, 1]) * 0.8;
    g.font = `900 ${Math.round(22 * s)}px ${DISPLAY}`; g.fillStyle = '#FFE8A3';
    g.fillText('…something stirs in the ink…', cx, L.cardTop - 55 * s);
  }
  if (et >= 2100) {
    const q = spring((et - 2100) / 1000, 520, 20);
    g.globalAlpha = clamp01(q * 1.5);
    g.save(); g.translate(cx, L.cardTop - 55 * s - 10 * s * (1 - q)); g.scale(lerp(2.4, 1, q), lerp(2.4, 1, q));
    blit(g, A.glowText('✨ ENCHANTED ✨', Math.round(40 * s), k.a, '#B26BFF'), A.dpr, 0, 0);
    g.restore();
  }
  g.restore();
  void tr; void EMOJI_FONT;
}
