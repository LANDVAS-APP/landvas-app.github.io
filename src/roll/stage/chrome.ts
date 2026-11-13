// What a clip adds round the roll: the LANDVAS mark and the player's name on top, Luck's meter and the tray of rolls,
// the pick (squeezed into a quick montage), and, once it lands, the caption — what it is, its minigame, the odds and
// what it does — with landvas.app at the bottom.
import { kindInfo } from '../../enchant/kinds';
import { PLOT_TYPES } from '../../map/plotStyle';
import { rarityInfo, rarityOdds, rarityTier, type RarityId } from '../../shared/rarity';
import { celebrateDelay } from '../celebrate';
import { bestIdx } from './director';
import { Assets, BODY, DISPLAY, GAME_EMOJI } from './assets';
import type { Layout } from './layout';
import { clamp01, easeOutCubic, lerp, rgba, spring } from './math';
import { phaseAt } from './draw';
import type { Trace } from './trace';

const PLOTS = [
  { base: '#FF4D6D', light: '#FF9DB0', deep: '#C81E45' }, { base: '#FF9F1C', light: '#FFCB78', deep: '#D06A00' }, { base: '#FFE14D', light: '#FFF3A6', deep: '#D9A900' },
  { base: '#3DDC97', light: '#9BF2CB', deep: '#14A36A' }, { base: '#34C3FF', light: '#9DE4FF', deep: '#0B8AD1' },
];
const SPECTRUM = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#8B6BFF'];

/** the LANDVAS mark (five plots making the L), drawn crisp at x, y (top-left), size S */
export function drawMark(g: CanvasRenderingContext2D, x: number, y: number, S: number) {
  g.save(); g.translate(x, y);
  const bg = g.createRadialGradient(S * 0.28, S * 0.16, 0, S * 0.28, S * 0.16, S);
  bg.addColorStop(0, '#2B2070'); bg.addColorStop(0.55, '#101848'); bg.addColorStop(1, '#070B1C');
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, S, S, S * 0.235); g.fill();
  const rim = g.createLinearGradient(0, 0, S, S);
  SPECTRUM.forEach((c, i) => rim.addColorStop([0, 0.22, 0.42, 0.62, 0.82, 1][i], c));
  const sw = S * 0.012;
  g.strokeStyle = rim; g.lineWidth = sw; g.beginPath(); g.roundRect(sw / 2, sw / 2, S - sw, S - sw, S * 0.235 - sw / 2); g.stroke();
  const inset = S * 0.115, inner = S - inset * 2, gap = inner * 0.075, c = (inner - gap * 2) / 3, r = c * 0.26, lip = c * 0.075;
  const at = (i: number, j: number) => [inset + i * (c + gap), inset + j * (c + gap)];
  for (const [i, j] of [[1, 0], [2, 0], [1, 1], [2, 1]]) {
    const [px, py] = at(i, j), eg = g.createLinearGradient(0, py, 0, py + c);
    eg.addColorStop(0, '#26346F'); eg.addColorStop(1, '#1A2558');
    g.fillStyle = eg; g.beginPath(); g.roundRect(px, py, c, c, r); g.fill();
    g.strokeStyle = '#34458F'; g.lineWidth = c * 0.03; g.stroke();
  }
  [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]].forEach(([i, j], n) => {
    const p = PLOTS[n], [px, py] = at(i, j);
    g.fillStyle = p.deep; g.beginPath(); g.roundRect(px, py, c, c, r); g.fill();
    const fg = g.createLinearGradient(0, py, 0, py + c - lip); fg.addColorStop(0, p.light); fg.addColorStop(0.5, p.base); fg.addColorStop(1, p.base);
    g.fillStyle = fg; g.beginPath(); g.roundRect(px, py, c, c - lip, r); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.42)'; g.beginPath(); g.roundRect(px + c * 0.13, py + c * 0.09, c * 0.74, c * 0.15, c * 0.075); g.fill();
  });
  g.restore();
}

/** the top of a clip: the mark, the wordmark and who rolled it */
export function drawBrand(g: CanvasRenderingContext2D, L: Layout, user?: { username: string } | null) {
  const { W, s } = L;
  const S = 58 * s, top = 46 * s;
  g.save();
  g.font = `900 ${Math.round(30 * s)}px ${DISPLAY}`;
  const ww = g.measureText('LANDVAS').width, gap = 14 * s, total = S + gap + ww;
  const x0 = W / 2 - total / 2;
  drawMark(g, x0, top, S);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#fff';
  g.fillText('LANDVAS', x0 + S + gap, top + S * 0.42);
  const bw = ww / 5;
  PLOTS.forEach((p, i) => { g.fillStyle = p.base; g.beginPath(); g.roundRect(x0 + S + gap + i * bw + 1.5 * s, top + S * 0.8, bw - 3 * s, 5 * s, 2.5 * s); g.fill(); });
  if (user?.username) {
    g.textAlign = 'center'; g.font = `800 ${Math.round(17 * s)}px ${BODY}`; g.fillStyle = 'rgba(255,255,255,0.72)';
    g.fillText(`@${user.username}`, W / 2, top + S + 26 * s);
  }
  g.restore();
}

export function drawFooter(g: CanvasRenderingContext2D, L: Layout) {
  const { W, H, s } = L;
  g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(17 * s)}px ${DISPLAY}`; g.fillStyle = 'rgba(255,255,255,0.86)';
  g.fillText('landvas.app', W / 2, H - 52 * s);
  g.font = `700 ${Math.round(12 * s)}px ${BODY}`; g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillText('Own a piece of the world · roll your own plot', W / 2, H - 30 * s);
  g.restore();
}

function chip(g: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string | CanvasGradient, fg: string, s: number, font = `900 ${Math.round(13 * s)}px ${BODY}`) {
  g.font = font;
  const w = g.measureText(text).width + 22 * s, h = 26 * s;
  g.fillStyle = bg; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 1);
  return w;
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, lines: number) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > max && line) { g.fillText(n === lines - 1 ? `${line}…` : line, x, y + n * lh); n++; line = w; if (n >= lines) return n; }
    else line = test;
  }
  if (line && n < lines) { g.fillText(line, x, y + n * lh); n++; }
  return n;
}

/** Luck's meter, during the rerolls */
export function drawLuck(g: CanvasRenderingContext2D, L: Layout, tr: Trace, t: number, luck?: number | null) {
  const c = tr.final.choices;
  if (!c || c.length < 2) return;
  const ph = phaseAt(tr, t);
  if (ph === 'reveal' || ph === 'pick') return;
  const { W, s, ry } = L;
  const i = Math.max(0, tr.steps.filter((x) => (x.tReel?.t0 ?? x.rStart ?? Infinity) <= t).length - 1);
  const text = i === 0 ? `🍀 ${luck ? `Luck ${luck}: ` : ''}${c.length} rolls!` : `🍀 Lucky reroll ${i} of ${c.length - 1}`;
  g.save();
  const y = ry - 86 * s;
  const w = chip(g, W / 2 - 30 * s, y, text, 'rgba(61,220,151,0.18)', '#8CF5C6', s, `900 ${Math.round(14 * s)}px ${BODY}`);
  for (let k = 0; k < c.length - 1; k++) {
    g.fillStyle = k < i ? 'rgba(255,255,255,0.15)' : '#3DDC97';
    g.beginPath(); g.roundRect(W / 2 - 30 * s + w / 2 + 8 * s + k * 20 * s, y - 4 * s, 16 * s, 8 * s, 4 * s); g.fill();
  }
  g.restore();
}

/** the rolls Luck gave you, as they land */
export function drawTray(g: CanvasRenderingContext2D, L: Layout, A: Assets, tr: Trace, t: number) {
  const c = tr.final.choices;
  if (!c || c.length < 2) return;
  const ph = phaseAt(tr, t);
  if (ph === 'reveal' || ph === 'pick') return;
  const { W, s, panelTop } = L;
  const landed = tr.steps.filter((x) => x.rLock != null && t >= x.rLock);
  if (!landed.length) return;
  const cw = 64 * s, gap = 10 * s, x0 = W / 2 - (landed.length * cw + (landed.length - 1) * gap) / 2, y = panelTop + 52 * s;
  landed.forEach((st, i) => {
    const p = spring((t - st.rLock!) / 1000, 300, 20);
    const info = rarityInfo(st.rarity), ty = PLOT_TYPES[st.type as keyof typeof PLOT_TYPES];
    g.save(); g.globalAlpha = clamp01(p * 1.5);
    g.translate(x0 + i * (cw + gap) + cw / 2, lerp(y - 260 * s, y, p)); g.scale(lerp(1.8, 1, p), lerp(1.8, 1, p));
    const img = A.art(st.rarity, st.shiny);
    if (img) g.drawImage(img, -24 * s, -24 * s, 48 * s, 48 * s);
    if (st.shiny) { g.font = `${Math.round(16 * s)}px system-ui`; g.textAlign = 'center'; g.fillText('✨', 22 * s, -22 * s); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(10 * s)}px ${BODY}`; g.fillStyle = info.color; g.fillText(info.name.toUpperCase(), 0, 36 * s);
    if (ty) { g.font = `800 ${Math.round(9 * s)}px ${BODY}`; g.fillStyle = ty.a; g.fillText(ty.game, 0, 50 * s); }
    g.restore();
  });
}

/** the pick, as a quick montage (p: 0…1 through it) */
export function drawPickMontage(g: CanvasRenderingContext2D, L: Layout, A: Assets, tr: Trace, p: number) {
  const c = tr.final.choices;
  if (!c) return;
  const { W, H, s, cy } = L;
  const kept = tr.pick?.sel ?? tr.final.kept, best = bestIdx(c, tr.final.choiceShiny);
  g.save();
  g.globalAlpha = clamp01(p / 0.12) * (p > 0.92 ? 1 - (p - 0.92) / 0.08 : 1);
  g.fillStyle = 'rgba(5,4,15,0.95)'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const gw = Math.min(W - 40 * s, 380 * s), cols = 3, cw = (gw - 2 * 10 * s) / cols, ch = cw * 1.32;
  const rows = Math.ceil(c.length / cols), gh = rows * ch + (rows - 1) * 10 * s;
  const top = cy - gh / 2 + 20 * s;
  g.font = `900 ${Math.round(26 * s)}px ${DISPLAY}`; g.fillStyle = '#fff'; g.fillText('🍀 Pick your plot', W / 2, top - 62 * s);
  g.font = `700 ${Math.round(13 * s)}px ${BODY}`; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText(`Luck rolled it ${c.length} times — keep the one you want.`, W / 2, top - 32 * s);
  const sel = p > 0.45 ? kept : best;
  c.forEach((r, i) => {
    const q = spring(p * 1.6 - i * 0.07, 360, 22);
    const x = W / 2 - gw / 2 + (i % cols) * (cw + 10 * s), y = top + Math.floor(i / cols) * (ch + 10 * s);
    const info = rarityInfo(r), on = sel === i, sh = !!tr.final.choiceShiny?.[i], ty = PLOT_TYPES[(tr.final.choiceTypes?.[i] ?? '') as keyof typeof PLOT_TYPES];
    g.save(); g.globalAlpha *= clamp01(q * 1.4); g.translate(x + cw / 2, y + ch / 2 + 30 * s * (1 - q)); const k = on ? 1.06 : 1; g.scale(k, k);
    if (on) { g.shadowColor = info.color; g.shadowBlur = 24 * s; }
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.roundRect(-cw / 2, -ch / 2, cw, ch, 16 * s); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = on ? info.color : 'rgba(255,255,255,0.1)'; g.lineWidth = 2 * s; g.stroke();
    const img = A.art(r, sh);
    if (img) g.drawImage(img, -29 * s, -ch / 2 + 10 * s, 58 * s, 58 * s);
    g.font = `900 ${Math.round(11 * s)}px ${BODY}`; g.fillStyle = info.color; g.fillText(`${info.emoji ? `${info.emoji} ` : ''}${info.name.toUpperCase()}`, 0, -ch / 2 + 84 * s);
    if (ty) { g.font = `800 ${Math.round(9 * s)}px ${BODY}`; g.fillStyle = ty.a; g.fillText(`${ty.name} · ${ty.game}`, 0, -ch / 2 + 100 * s); }
    if (sh) { g.font = `900 ${Math.round(9 * s)}px ${BODY}`; g.fillStyle = '#FFE14D'; g.fillText('✨ SHINY ×5', 0, -ch / 2 + 114 * s); }
    if (i === best) chip(g, cw / 2 - 12 * s, -ch / 2 + 2 * s, 'BEST', '#FFE14D', '#1a0b2e', s * 0.8);
    g.restore();
  });
  if (p > 0.6) {
    const q = spring((p - 0.6) * 1.6, 400, 18), y = top + gh + 44 * s;
    g.globalAlpha *= clamp01(q);
    const bw = gw, bh = 52 * s;
    const gr = g.createLinearGradient(W / 2 - bw / 2, 0, W / 2 + bw / 2, 0); gr.addColorStop(0, '#3DDC97'); gr.addColorStop(1, '#1FA971');
    g.save(); g.translate(W / 2, y); const press = p > 0.82 ? 0.96 : 1; g.scale(press, press);
    g.fillStyle = '#147a52'; g.beginPath(); g.roundRect(-bw / 2, -bh / 2 + 5 * s, bw, bh, 16 * s); g.fill();
    g.fillStyle = gr; g.beginPath(); g.roundRect(-bw / 2, -bh / 2, bw, bh, 16 * s); g.fill();
    g.font = `900 ${Math.round(17 * s)}px ${DISPLAY}`; g.fillStyle = '#fff';
    g.fillText(`Keep the ${tr.final.choiceShiny?.[kept] ? 'shiny ' : ''}${rarityInfo(c[kept]).name}`, 0, 1);
    g.restore();
  }
  g.restore();
}

/** under the card once it lands: what you got */
export function drawCaption(g: CanvasRenderingContext2D, L: Layout, tr: Trace, t: number) {
  if (tr.reveal == null || t < tr.reveal) return;
  const f = tr.final, ench = f.enchant ?? null;
  const final: RarityId = ench ? ('enchanted' as RarityId) : f.rarity;
  const info = rarityInfo(final), tier = rarityTier(final), ek = ench ? kindInfo(ench.kind) : null;
  const ty = PLOT_TYPES[f.type as keyof typeof PLOT_TYPES];
  const rt = t - tr.reveal, d = tr.reduce ? 0 : celebrateDelay(final);
  const p = easeOutCubic(clamp01((rt - d) / 380));
  if (p <= 0) return;
  const { W, s, panelTop } = L;
  g.save(); g.globalAlpha = p; g.translate(0, 18 * s * (1 - p));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let y = panelTop + 20 * s;
  const subtitle = ek ? ek.tagline : tier >= 3 ? `Incredible — a ${info.name} plot!` : final === 'common' ? 'A solid start' : `Nice — a ${info.name} plot`;
  g.font = `800 ${Math.round(17 * s)}px ${BODY}`; g.fillStyle = ench ? '#F0DBFF' : info.glow;
  y += (wrap(g, subtitle, W / 2, y, W - 80 * s, 22 * s, 2) - 1) * 22 * s;
  // the badges
  const chips: [string, string | CanvasGradient, string][] = [];
  if (f.shiny) { const gr = g.createLinearGradient(W / 2 - 100 * s, 0, W / 2 + 100 * s, 0); gr.addColorStop(0, '#FF7AE0'); gr.addColorStop(0.5, '#FFE14D'); gr.addColorStop(1, '#22E3FF'); chips.push(['✨ SHINY · ×5 rent ✨', gr, '#1a0b2e']); }
  if (f.lucky) chips.push(['🍀 Lucky roll', 'rgba(61,220,151,0.2)', '#8CF5C6']);
  if (f.hot) chips.push(['🔥 Hot Zone roll', 'rgba(255,106,31,0.25)', '#FFB27A']);
  if (f.guaranteed) chips.push([`Guaranteed ${rarityInfo(f.guaranteed).name}+`, 'rgba(255,255,255,0.1)', '#fff']);
  if (chips.length) {
    y += 38 * s;
    g.font = `900 ${Math.round(13 * s)}px ${BODY}`;
    const ws = chips.map(([tx]) => g.measureText(tx).width + 22 * s), total = ws.reduce((a, b) => a + b, 0) + (ws.length - 1) * 8 * s;
    let x = W / 2 - total / 2;
    chips.forEach(([tx, bg, fg], i) => { chip(g, x + ws[i] / 2, y, tx, bg, fg, s); x += ws[i] + 8 * s; });
  }
  // its minigame and odds
  y += 40 * s;
  if (ty) {
    const text = `${GAME_EMOJI[f.type] ?? '🎮'} ${ty.game} · ${ty.name} plot`;
    g.font = `900 ${Math.round(15 * s)}px ${BODY}`;
    const w = g.measureText(text).width + 28 * s;
    g.fillStyle = rgba(ty.a, 0.18); g.beginPath(); g.roundRect(W / 2 - w / 2, y - 16 * s, w, 32 * s, 16 * s); g.fill();
    g.fillStyle = ty.a; g.fillText(text, W / 2, y + 1);
    y += 34 * s;
  }
  g.font = `800 ${Math.round(14 * s)}px ${BODY}`; g.fillStyle = 'rgba(255,255,255,0.72)';
  g.fillText(ench ? (ench.minted ? `#${ench.serial} of ${ench.minted} ever minted${ench.born_place ? ` · born in ${ench.born_place}` : ''}` : `Enchanted · #${ench.serial}`) : `${rarityOdds(final)} plots${f.first ? ' · my first plot' : ''}`, W / 2, y);
  // what it does
  const blurb = ek ? ek.how[0] : info.ability;
  if (blurb) {
    y += 34 * s;
    g.font = `600 ${Math.round(14 * s)}px ${BODY}`; g.fillStyle = 'rgba(255,255,255,0.78)';
    wrap(g, blurb, W / 2, y, W - 110 * s, 20 * s, 3);
  }
  if (f.name) { g.font = `700 ${Math.round(16 * s)}px ${BODY}`; g.fillStyle = '#fff'; g.fillText(`“${f.name}”`, W / 2, panelTop - 4 * s); }
  g.restore();
}
