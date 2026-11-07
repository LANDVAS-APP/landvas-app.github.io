// Painting a Paintbrawl card: a terrain-coloured frame, the cost in a paint drop, the name on a banner, a little
// scene of the card's terrain with its creature alive in it (breathing, blinking, bouncing), the rules on parchment,
// attack and health badges, a rarity gem — and a moving holographic sheen on gold foils and legendaries.
import { CARD, RARITY_INFO, TERRAIN_INFO, kindName, type Card, type Terrain } from '../shared/brawl/cards';
import { drawSpecialArt } from './cardFx';
import { portrait } from './chars';
import { cleanGenome, type Genome } from '../inkborn/genome';
import { drawCreature, type CreatureState } from '../inkborn/rig';
import { isPhone } from '../lib/gfx';

const SOFT = !isPhone(); // canvas shadows are slow on phones

const genomes = new Map<string, Genome>();
/** The creature a card shows, from its compact genome string. */
export function genomeOf(c: Card): Genome {
  let g = genomes.get(c.id);
  if (!g) {
    const [body, color, belly, accent, pattern, eyes, ears, horns, tail, wings, legs, eyecount, gait, size] = c.art.split(' ');
    g = cleanGenome({ body, color, belly, accent, pattern, eyes, ears, horns, tail, wings, legs: Number(legs), eyecount: Number(eyecount), gait, size: Number(size), cheeks: c.terrain === 'sugar' || c.terrain === 'meadow', mood: 'brave' } as unknown as Partial<Genome>);
    genomes.set(c.id, g);
  }
  return g;
}
const NEUTRAL = { name: 'Wanderer', emoji: '✦', color: '#B9B4D6', dark: '#4A4466', glow: '#F0ECFF', blurb: '' };
export const terrainOf = (c: Card) => (c.terrain === 'neutral' ? NEUTRAL : TERRAIN_INFO[c.terrain]);

const hash = (s: string, k: number) => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };
const emoji = (g: CanvasRenderingContext2D, e: string, x: number, y: number, s: number) => { g.font = `${s}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, x, y); };

/** The little world inside the art window, by terrain (animated with t). */
export function drawScene(g: CanvasRenderingContext2D, terrain: Terrain | 'neutral', x: number, y: number, w: number, h: number, t: number, seed: string) {
  const T = terrain === 'neutral' ? NEUTRAL : TERRAIN_INFO[terrain];
  const sky = g.createLinearGradient(0, y, 0, y + h);
  const skies: Record<string, [string, string]> = { meadow: ['#9FE0FF', '#E8FFF0'], ember: ['#3A0E14', '#FF7A3D'], frost: ['#C8ECFF', '#FFFFFF'], bog: ['#2A1840', '#6A4A7A'], sugar: ['#FFC8E8', '#FFF4FA'], neon: ['#0A0A1E', '#2A1A50'], neutral: ['#C9C4DA', '#F4F0FF'] };
  const [s0, s1] = skies[terrain] ?? skies.neutral;
  sky.addColorStop(0, s0); sky.addColorStop(1, s1); g.fillStyle = sky; g.fillRect(x, y, w, h);
  const gy = y + h * 0.72;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  switch (terrain) {
    case 'meadow':
      g.fillStyle = '#FFFFFF'; for (let i = 0; i < 2; i++) { const cx = x + ((t * 6 + i * w * 0.6 + hash(seed, i) * w) % (w + 60)) - 30; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(cx, y + h * (0.15 + i * 0.12), 22, 7, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      g.fillStyle = '#7BCB5A'; g.beginPath(); g.moveTo(x, gy - 8); g.quadraticCurveTo(x + w * 0.5, gy - 22, x + w, gy - 6); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill();
      g.fillStyle = '#4FA552'; g.fillRect(x, gy, w, h);
      for (let i = 0; i < 9; i++) { const fx = x + hash(seed, i + 3) * w, fy = gy + 4 + hash(seed, i + 9) * (h * 0.22); g.fillStyle = ['#FFE14D', '#FF8AC2', '#FFFFFF'][i % 3]; g.beginPath(); g.arc(fx, fy + Math.sin(t * 2 + i) * 0.6, 2, 0, Math.PI * 2); g.fill(); }
      break;
    case 'ember':
      g.fillStyle = '#4A1A10'; g.beginPath(); g.moveTo(x + w * 0.15, gy); g.lineTo(x + w * 0.42, y + h * 0.18); g.lineTo(x + w * 0.58, y + h * 0.2); g.lineTo(x + w * 0.85, gy); g.fill();
      g.fillStyle = '#FF7A3D'; g.globalAlpha = 0.6 + Math.sin(t * 3) * 0.3; g.beginPath(); g.ellipse(x + w * 0.5, y + h * 0.19, 9, 4, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#2A0E0A'; g.fillRect(x, gy, w, h);
      g.strokeStyle = '#FF9A3D'; g.lineWidth = 2; g.globalAlpha = 0.5 + Math.sin(t * 4) * 0.3;
      for (let i = 0; i < 4; i++) { g.beginPath(); const cx = x + hash(seed, i) * w; g.moveTo(cx, gy + 2); g.lineTo(cx + 8, gy + 10); g.lineTo(cx + 2, gy + 18); g.stroke(); }
      g.globalAlpha = 1;
      for (let i = 0; i < 6; i++) { const k = (t * 0.35 + hash(seed, i + 20)) % 1; g.fillStyle = `rgba(255,${150 + i * 15},60,${1 - k})`; g.beginPath(); g.arc(x + hash(seed, i + 30) * w, gy - k * h * 0.6, 1.6, 0, Math.PI * 2); g.fill(); }
      break;
    case 'frost':
      g.fillStyle = '#DDF2FF'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + w * (0.1 + i * 0.32), gy); g.lineTo(x + w * (0.22 + i * 0.32), y + h * (0.3 + hash(seed, i) * 0.15)); g.lineTo(x + w * (0.34 + i * 0.32), gy); g.fill(); }
      g.fillStyle = '#FFFFFF'; g.fillRect(x, gy, w, h);
      g.fillStyle = '#BFE8FF'; g.fillRect(x, gy, w, 3);
      for (let i = 0; i < 12; i++) { const k = (t * 0.12 + hash(seed, i)) % 1; g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x + ((hash(seed, i + 40) * w + Math.sin(t + i) * 6) % w), y + k * h, 1.4, 0, Math.PI * 2); g.fill(); }
      break;
    case 'bog':
      g.fillStyle = '#3A2A40'; g.fillRect(x, gy, w, h);
      g.fillStyle = '#5A3A6A'; g.beginPath(); g.ellipse(x + w * 0.5, gy + 6, w * 0.45, 6, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 3; i++) { const mx = x + w * (0.12 + i * 0.38), mh = 12 + hash(seed, i) * 10; g.fillStyle = '#E8D8C8'; g.fillRect(mx - 2, gy - mh, 4, mh); g.fillStyle = ['#FF6FB5', '#9B6BFF', '#3DDC97'][i]; g.beginPath(); g.ellipse(mx, gy - mh, 9, 6, 0, Math.PI, 0); g.fill(); }
      for (let i = 0; i < 5; i++) { const k = (t * 0.3 + hash(seed, i + 50)) % 1; g.strokeStyle = `rgba(200,160,255,${0.8 - k * 0.8})`; g.lineWidth = 1; g.beginPath(); g.arc(x + hash(seed, i + 60) * w, gy + 8 - k * 30, 2 + k * 3, 0, Math.PI * 2); g.stroke(); }
      break;
    case 'sugar':
      for (let i = 0; i < 4; i++) { g.fillStyle = ['#FF8AC2', '#8AE0FF', '#FFE14D', '#B57BFF'][i]; g.beginPath(); g.arc(x + w * (0.1 + i * 0.27), gy - 4, 10 + hash(seed, i) * 6, Math.PI, 0); g.fill(); }
      g.fillStyle = '#FFB3D9'; g.fillRect(x, gy, w, h);
      for (let i = 0; i < 14; i++) { g.fillStyle = ['#FF4D6D', '#3DDC97', '#FFE14D', '#22B8FF'][i % 4]; g.save(); g.translate(x + hash(seed, i) * w, gy + 4 + hash(seed, i + 70) * h * 0.2); g.rotate(i); g.fillRect(-2, -0.8, 4, 1.6); g.restore(); }
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w * 0.88, gy); g.lineTo(x + w * 0.88, y + h * 0.35); g.stroke(); g.fillStyle = '#FF4D6D'; g.beginPath(); g.arc(x + w * 0.88, y + h * 0.3, 7, 0, Math.PI * 2); g.fill();
      break;
    case 'neon':
      g.strokeStyle = 'rgba(255,79,216,0.55)'; g.lineWidth = 1;
      for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(x + w / 2, gy - 2); g.lineTo(x + (i / 8) * w * 1.6 - w * 0.3, y + h); g.stroke(); }
      for (let i = 0; i < 4; i++) { const k = ((t * 0.5 + i / 4) % 1); const yy = gy + (y + h - gy) * k * k; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
      g.fillStyle = '#22E3FF'; g.globalAlpha = 0.25 + Math.sin(t * 2) * 0.15; g.fillRect(x, gy - 2, w, 2); g.globalAlpha = 1;
      for (let i = 0; i < 3; i++) { g.fillStyle = ['#22E3FF', '#FF4FD8', '#F5E14A'][i]; g.fillRect(x + w * (0.15 + i * 0.3), y + h * (0.2 + hash(seed, i) * 0.2), 3, gy - y - h * (0.2 + hash(seed, i) * 0.2)); }
      break;
    default:
      g.fillStyle = '#A8A0B8'; g.fillRect(x, gy, w, h);
  }
  // a soft vignette
  const v = g.createRadialGradient(x + w / 2, y + h / 2, h * 0.2, x + w / 2, y + h / 2, h * 0.9); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = v; g.fillRect(x, y, w, h);
  g.restore();
  void T;
}

/** The emblem a totem or a spell shows: a glowing sigil with its icon. */
function drawEmblem(g: CanvasRenderingContext2D, c: Card, cx: number, cy: number, r: number, t: number) {
  const T = terrainOf(c);
  const glow = g.createRadialGradient(cx, cy, 2, cx, cy, r * 1.4); glow.addColorStop(0, T.glow); glow.addColorStop(0.5, `${T.color}88`); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, r * 1.4, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(cx, cy); g.rotate(t * 0.4);
  g.strokeStyle = T.glow; g.lineWidth = 2; g.globalAlpha = 0.8;
  const pts = c.kind === 'totem' ? 6 : 8;
  g.beginPath(); for (let i = 0; i <= pts * 2; i++) { const a = (i / (pts * 2)) * Math.PI * 2, rr = i % 2 ? r * 0.8 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke();
  g.restore(); g.globalAlpha = 1;
  if (c.kind === 'totem') { g.fillStyle = '#5A4A3A'; g.fillRect(cx - r * 0.35, cy + r * 0.35, r * 0.7, r * 0.4); }
  emoji(g, c.art, cx, cy + Math.sin(t * 2) * 2, r * 1.15);
  // sparks
  for (let i = 0; i < 6; i++) { const a = t * 1.5 + i, rr = r * (0.9 + 0.25 * Math.sin(t * 3 + i)); g.fillStyle = '#FFFFFF'; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + i); g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.5, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y + n * lh); line = w; n++; if (n >= maxLines) return n; }
    else line = test;
  }
  if (line) { g.fillText(line, x, y + n * lh); n++; }
  return n;
}
function badge(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, val: string, icon: 'atk' | 'hp' | 'cost', changed: number) {
  g.save();
  if (SOFT) { g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 4; g.shadowOffsetY = 2; }
  g.fillStyle = fill;
  if (icon === 'hp') { g.beginPath(); g.moveTo(x, y + r); g.bezierCurveTo(x - r * 1.5, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.45); g.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.5, y - r * 0.2, x, y + r); g.fill(); }
  else if (icon === 'cost') { g.beginPath(); g.moveTo(x, y - r * 1.15); g.bezierCurveTo(x + r * 1.1, y - r * 0.1, x + r, y + r, x, y + r); g.bezierCurveTo(x - r, y + r, x - r * 1.1, y - r * 0.1, x, y - r * 1.15); g.fill(); }
  else { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = changed > 0 ? '#9DFFB0' : changed < 0 ? '#FFB0B0' : '#FFFFFF';
  g.font = `900 ${Math.round(r * 1.05)}px ui-rounded, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(val, x, y + (icon === 'hp' ? -1 : icon === 'cost' ? 2 : 1)); g.fillText(val, x, y + (icon === 'hp' ? -1 : icon === 'cost' ? 2 : 1));
}

export type CardDraw = { t: number; foil?: boolean; state?: CreatureState; atk?: number; hp?: number; costNow?: number; dim?: boolean; compact?: boolean };
/** Paint a card into a w×h box at (0,0) (the card's own proportions are 5:7). */
export function drawCard(g: CanvasRenderingContext2D, id: string, w: number, h: number, o: CardDraw) {
  const c = CARD[id]; if (!c) return;
  const T = terrainOf(c), R = RARITY_INFO[c.rarity], t = o.t;
  const r = w * 0.06, pad = w * 0.045;
  g.clearRect(0, 0, w, h);
  // the frame: terrain colours, a rarity rim
  const fr = g.createLinearGradient(0, 0, w, h); fr.addColorStop(0, T.color); fr.addColorStop(0.55, T.dark); fr.addColorStop(1, '#120C22');
  g.fillStyle = fr; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill();
  g.strokeStyle = R.color; g.lineWidth = Math.max(2, w * 0.022); g.beginPath(); g.roundRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth, r); g.stroke();
  // filigree corners
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
  for (const [cx, cy, sx, sy] of [[pad, pad, 1, 1], [w - pad, pad, -1, 1], [pad, h - pad, 1, -1], [w - pad, h - pad, -1, -1]]) { g.beginPath(); g.moveTo(cx, cy + sy * w * 0.08); g.quadraticCurveTo(cx, cy, cx + sx * w * 0.08, cy); g.stroke(); }
  // art window
  const ax = pad, ay = h * 0.12, aw = w - pad * 2, ah = h * (o.compact ? 0.5 : 0.44);
  g.save(); g.beginPath(); g.roundRect(ax, ay, aw, ah, r * 0.6); g.clip();
  // cataclysms and wonders have their own little animation; everything else stands in its terrain
  if (!drawSpecialArt(g, c, ax, ay, aw, ah, t)) {
    drawScene(g, c.terrain, ax, ay, aw, ah, t, c.id);
    // the creature: a 2D cartoon of its character (flat shading, an ink outline), breathing gently on the card
    const pic = c.kind === 'creature' ? portrait(c.id) : null;
    if (pic) { const S = Math.min(ah * 1.12, aw * 1.05), br = 1 + Math.sin(t * 2.2 + hash(c.id, 2) * 6) * 0.015; g.drawImage(pic, ax + aw / 2 - (S * br) / 2, ay + ah * 0.54 - (S * br) / 2, S * br, S * br); }
    else if (c.kind === 'creature') drawCreature(g, genomeOf(c), ax + aw / 2, ay + ah * 0.86, ah * 0.5, { t, state: o.state ?? 'idle', dir: 1, seed: hash(c.id, 1) * 6 });
    else drawEmblem(g, c, ax + aw / 2, ay + ah * 0.5, ah * 0.28, t);
  }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.roundRect(ax, ay, aw, ah, r * 0.6); g.stroke();
  // name banner
  const nb = h * 0.085;
  g.fillStyle = 'rgba(10,6,24,0.72)'; g.beginPath(); g.roundRect(pad * 0.6, h * 0.02, w - pad * 1.2, nb, nb / 2); g.fill();
  g.fillStyle = '#FFFFFF'; g.font = `800 ${Math.round(w * 0.072)}px ui-rounded, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = Math.round(w * 0.072); while (g.measureText(c.name).width > w * 0.66 && fs > 8) { fs--; g.font = `800 ${fs}px ui-rounded, system-ui, sans-serif`; }
  g.fillText(c.name, w * 0.54, h * 0.02 + nb / 2 + 1);
  // the type line
  const ty = ay + ah + h * 0.035;
  g.font = `700 ${Math.round(w * 0.048)}px ui-rounded, system-ui, sans-serif`; g.fillStyle = T.glow;
  if (c.fx || c.wonder) { g.fillStyle = c.fx ? '#FFB13D' : '#FFE9A8'; g.font = `900 ${Math.round(w * 0.05)}px ui-rounded, system-ui, sans-serif`; }
  g.fillText(`${c.fx ? '🌋' : c.wonder ? '🏰' : T.emoji} ${kindName(c)} · ${T.name}`, w / 2, ty);
  // rules on parchment
  if (!o.compact) {
    const px0 = pad, py0 = ty + h * 0.03, pw = w - pad * 2, ph = h - py0 - h * 0.1;
    const pg = g.createLinearGradient(0, py0, 0, py0 + ph); pg.addColorStop(0, '#FFF8E8'); pg.addColorStop(1, '#F0E2C4');
    g.fillStyle = pg; g.beginPath(); g.roundRect(px0, py0, pw, ph, r * 0.5); g.fill();
    g.fillStyle = '#2A1E10'; g.textAlign = 'center'; g.textBaseline = 'top';
    let fy = py0 + h * 0.015, size = Math.round(w * 0.05);
    const rules = [c.text, c.flourish ? `✋ Flourish (${c.flourish.cost}): ${c.flourish.text}` : ''].filter(Boolean).join('  ');
    // shrink to fit
    for (; size > 7; size--) { g.font = `600 ${size}px ui-rounded, system-ui, sans-serif`; const lines = Math.ceil(g.measureText(rules).width / (pw - 10)) + 1; if (lines * size * 1.2 + size * 2.2 < ph) break; }
    g.font = `600 ${size}px ui-rounded, system-ui, sans-serif`;
    if (rules) fy += wrap(g, rules, w / 2, fy, pw - 10, size * 1.18, 6) * size * 1.18 + 2;
    g.font = `italic 500 ${Math.max(7, size - 1)}px Georgia, serif`; g.fillStyle = 'rgba(60,40,20,0.7)';
    if (fy + size < py0 + ph - 2) wrap(g, `“${c.flavor}”`, w / 2, fy + 1, pw - 12, (size - 1) * 1.15, 2);
  }
  // cost, attack, health
  const br = w * 0.085;
  badge(g, w * 0.1, h * 0.065, br, '#3A86FF', String(o.costNow ?? c.cost), 'cost', o.costNow !== undefined ? c.cost - o.costNow : 0);
  if (c.kind === 'creature') {
    const atk = o.atk ?? c.atk!, hp = o.hp ?? c.hp!;
    badge(g, w * 0.13, h - h * 0.065, br, '#E8323C', String(atk), 'atk', atk - c.atk!);
    badge(g, w * 0.87, h - h * 0.07, br * 1.05, '#2BB35A', String(hp), 'hp', hp - c.hp!);
  }
  // rarity gem
  g.fillStyle = R.color; g.save(); g.translate(w / 2, h - h * 0.045); g.rotate(Math.PI / 4); g.fillRect(-w * 0.025, -w * 0.025, w * 0.05, w * 0.05); g.restore();
  // foils and legendaries shimmer
  if (o.foil || c.rarity === 'legendary') {
    g.save(); g.beginPath(); g.roundRect(0, 0, w, h, r); g.clip();
    g.globalCompositeOperation = 'overlay';
    const k = ((t * 0.25) % 1.6) - 0.3;
    const sh = g.createLinearGradient(w * (k - 0.4), 0, w * (k + 0.4), h);
    const cols = o.foil ? ['rgba(255,80,200,0)', 'rgba(255,230,120,0.75)', 'rgba(120,230,255,0.7)', 'rgba(200,120,255,0)'] : ['rgba(255,220,120,0)', 'rgba(255,240,180,0.55)', 'rgba(255,220,120,0)'];
    cols.forEach((cc, i) => sh.addColorStop(i / (cols.length - 1), cc));
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
    g.restore();
    if (o.foil) { g.fillStyle = '#FFE14D'; g.font = `900 ${Math.round(w * 0.045)}px ui-rounded, system-ui`; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('★ GOLD', w - pad, h * 0.115); }
  }
  if (o.dim) { g.fillStyle = 'rgba(10,6,24,0.55)'; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill(); }
}

/** The back of a card (the other player's hand, unopened packs). */
export function drawBack(g: CanvasRenderingContext2D, w: number, h: number, t = 0) {
  const r = w * 0.06;
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#FF4FD8'); gr.addColorStop(0.5, '#7B5CFF'); gr.addColorStop(1, '#22E3FF');
  g.fillStyle = gr; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill();
  g.fillStyle = 'rgba(10,6,24,0.35)'; g.beginPath(); g.roundRect(w * 0.08, h * 0.06, w * 0.84, h * 0.88, r * 0.7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.stroke();
  g.save(); g.translate(w / 2, h / 2); g.rotate(t * 0.3);
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.fillStyle = ['#FF4FD8', '#FFE14D', '#22E3FF'][i % 3]; g.beginPath(); g.ellipse(0, -w * 0.16, w * 0.06, w * 0.13, 0, 0, Math.PI * 2); g.fill(); }
  g.restore();
  g.fillStyle = '#FFFFFF'; g.font = `900 ${Math.round(w * 0.1)}px ui-rounded, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🎨', w / 2, h / 2);
}

/** A land card: the terrain's little world, its name and what it's good for. */
export function drawLandCard(g: CanvasRenderingContext2D, t: Terrain, w: number, h: number, time: number) {
  const T = TERRAIN_INFO[t], r = w * 0.06, pad = w * 0.05;
  g.clearRect(0, 0, w, h);
  const fr = g.createLinearGradient(0, 0, w, h); fr.addColorStop(0, T.color); fr.addColorStop(0.6, T.dark); fr.addColorStop(1, '#120C22');
  g.fillStyle = fr; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill();
  g.strokeStyle = '#FFE9A8'; g.lineWidth = Math.max(2, w * 0.025); g.beginPath(); g.roundRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth, r); g.stroke();
  const ax = pad, ay = h * 0.13, aw = w - pad * 2, ah = h * 0.6;
  g.save(); g.beginPath(); g.roundRect(ax, ay, aw, ah, r * 0.6); g.clip(); drawScene(g, t, ax, ay, aw, ah, time, `land-${t}`); g.restore();
  g.fillStyle = 'rgba(10,6,24,0.72)'; g.beginPath(); g.roundRect(pad * 0.6, h * 0.02, w - pad * 1.2, h * 0.09, h * 0.045); g.fill();
  g.fillStyle = '#FFFFFF'; g.font = `900 ${Math.round(w * 0.1)}px ui-rounded, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${T.emoji} ${T.name}`, w / 2, h * 0.067);
  g.fillStyle = '#FFE9A8'; g.font = `800 ${Math.round(w * 0.075)}px ui-rounded, system-ui, sans-serif`; g.fillText('LAND', w / 2, ay + ah + h * 0.06);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `600 ${Math.round(w * 0.062)}px ui-rounded, system-ui, sans-serif`; g.textBaseline = 'top';
  wrap(g, `${T.name} creatures get +1 attack here.`, w / 2, ay + ah + h * 0.1, w - pad * 2.5, w * 0.075, 3);
}
