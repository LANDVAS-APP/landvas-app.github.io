// Everything the roll's stage draws that's worth making once: the plot art and sigils (the game's own SVGs, turned into
// pictures), the minigame tiles, each plot type's pattern, the rarity names in their own materials (gold for Legendary,
// a rainbow for Prismatic…), the parchment card. All cached; drawn at the screen's pixel density so they stay crisp.
import { createElement } from 'react';
import { BasePlotArt } from '../../plot/BasePlotArt';
import { Sigil } from '../../enchant/Sigil';
import { PLOT_TYPES, drawPlotDesign } from '../../map/plotStyle';
import type { PlotTypeId } from '../../shared/grid';
import { rarityInfo, rarityTier, type RarityId } from '../../shared/rarity';
import { shade } from './math';
import type { Trace } from './trace';

export const DISPLAY = '"Unbounded Variable", "Unbounded", ui-sans-serif, system-ui, sans-serif';
export const BODY = '"Manrope Variable", "Manrope", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui';

/** each minigame's glyph */
export const GAME_EMOJI: Record<string, string> = { graphite: '✏️', pigment: '🎨', mosaic: '🧩', lumina: '💡', fresco: '🧠', clay: '🏺', prism: '🖌️', glass: '🪞' };

let fontsReady: Promise<void> | null = null;
export function loadFonts() {
  fontsReady ??= (async () => {
    try { await Promise.all([document.fonts.load(`900 40px ${DISPLAY}`), document.fonts.load(`800 20px ${BODY}`), document.fonts.load(`700 20px ${BODY}`)]); } catch { /* system fonts */ }
  })();
  return fontsReady;
}

type Img = HTMLImageElement & { ok?: boolean };
const svgCache = new Map<string, Img>();
let server: Promise<typeof import('react-dom/server')> | null = null;
/** start loading the SVG renderer early (it's a separate chunk) */
export const warmUp = () => { server ??= import('react-dom/server'); void loadFonts(); return server; };

function svgImage(key: string, el: () => React.ReactElement): Img {
  let img = svgCache.get(key);
  if (img) return img;
  img = new Image() as Img;
  svgCache.set(key, img);
  const me = img;
  void warmUp().then(({ renderToStaticMarkup }) => {
    let svg = renderToStaticMarkup(el());
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    me.onload = () => { me.ok = true; };
    me.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  return img;
}
const ready = (img: Img) => new Promise<void>((r) => { if (img.ok) return r(); const t = setInterval(() => { if (img.ok || (img.complete && img.naturalWidth)) { img.ok = true; clearInterval(t); r(); } }, 16); setTimeout(() => { clearInterval(t); r(); }, 4000); });

/** one set of sprites per pixel density, shared by every roll (built once, never rebuilt per roll — phones cap canvas memory) */
const shared = new Map<string, Assets>();
export const sharedAssets = (dpr: number, cpu = false) => { const k = `${dpr}:${cpu}`; let a = shared.get(k); if (!a) { a = new Assets(dpr, cpu); shared.set(k, a); } return a; };

export class Assets {
  /** `cpu`: for clips — every sprite lives in memory, like the canvas the frames are encoded from (no GPU round trips) */
  constructor(public dpr: number, public cpu = false) {}
  private sprites = new Map<string, HTMLCanvasElement>();
  has(key: string) { return this.sprites.has(key); }
  private canvas(w: number, h: number) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    c.getContext('2d', { willReadFrequently: this.cpu }); // (the first call decides where it lives)
    return c;
  }

  /** the plot's art (null until it's ready) */
  art(r: RarityId, shiny: boolean) { const i = svgImage(`art:${r}:${shiny ? 1 : 0}`, () => createElement(BasePlotArt, { rarity: r, shiny, size: 512 })); return i.ok ? i : null; }
  sigil(kind: string, seed: number) { const i = svgImage(`sig:${kind}:${seed}`, () => createElement(Sigil, { kind, seed, size: 512, still: true })); return i.ok ? i : null; }
  /** load every picture this roll needs */
  async prepare(tr: Trace) {
    await loadFonts();
    const f = tr.final, list: Img[] = [];
    const add = (r: RarityId, sh: boolean) => { this.art(r, sh); list.push(svgCache.get(`art:${r}:${sh ? 1 : 0}`)!); };
    add(f.rarity, f.shiny);
    f.choices?.forEach((r, i) => add(r, !!f.choiceShiny?.[i]));
    tr.steps.forEach((s) => add(s.rarity, s.shiny));
    if (f.enchant) { this.sigil(f.enchant.kind, f.enchant.sigil); list.push(svgCache.get(`sig:${f.enchant.kind}:${f.enchant.sigil}`)!); }
    await Promise.all(list.map(ready));
  }
  /** preload as soon as the result is known (live) */
  preload(r: { rarity: RarityId; shiny?: boolean; choices?: RarityId[] | null; choiceShiny?: boolean[] | null; enchant?: { kind: string; sigil: number } | null }) {
    this.art(r.rarity, !!r.shiny);
    r.choices?.forEach((c, i) => this.art(c, !!r.choiceShiny?.[i]));
    if (r.enchant) this.sigil(r.enchant.kind, r.enchant.sigil);
  }

  /** a plot type's pattern, filling a square */
  pattern(type: string, px: number) {
    const size = Math.round(px * this.dpr), key = `pat:${type}:${size}`;
    let c = this.sprites.get(key);
    if (!c) {
      c = this.canvas(size, size);
      if (PLOT_TYPES[type as PlotTypeId]) drawPlotDesign(c.getContext('2d')!, type as PlotTypeId, size, 7);
      this.sprites.set(key, c);
    }
    return c;
  }

  /** a minigame's tile on the reel: its pattern, its glyph and its name */
  tile(type: string, px: number) {
    const S = Math.round(px * this.dpr), key = `tile:${type}:${S}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const t = PLOT_TYPES[type as PlotTypeId];
    const pad = Math.round(S * 0.14);
    c = this.canvas(S + pad * 2, S + pad * 2);
    const g = c.getContext('2d')!;
    g.translate(pad, pad);
    const r = S * 0.22;
    g.save();
    g.shadowColor = t?.a ?? '#fff'; g.shadowBlur = S * 0.16;
    g.fillStyle = t?.base ?? '#222'; g.beginPath(); g.roundRect(0, 0, S, S, r); g.fill();
    g.restore();
    g.save(); g.beginPath(); g.roundRect(0, 0, S, S, r); g.clip();
    if (t) g.drawImage(this.pattern(type, px), 0, 0, S, S);
    const shadeG = g.createLinearGradient(0, S * 0.45, 0, S);
    shadeG.addColorStop(0, 'rgba(6,4,20,0)'); shadeG.addColorStop(1, 'rgba(6,4,20,0.86)');
    g.fillStyle = shadeG; g.fillRect(0, 0, S, S);
    const gl = g.createLinearGradient(0, 0, 0, S * 0.4);
    gl.addColorStop(0, 'rgba(255,255,255,0.32)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(0, 0, S, S * 0.4);
    g.restore();
    g.lineWidth = Math.max(1.5, S * 0.035); g.strokeStyle = t?.a ?? '#fff'; g.beginPath(); g.roundRect(0, 0, S, S, r); g.stroke();
    g.lineWidth = Math.max(1, S * 0.015); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.roundRect(S * 0.04, S * 0.04, S * 0.92, S * 0.92, r * 0.85); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(S * 0.4)}px ${EMOJI_FONT}`; g.fillText(GAME_EMOJI[type] ?? '🎮', S / 2, S * 0.4);
    const name = (t?.game ?? type).toUpperCase();
    let fs = S * 0.15; g.font = `900 ${fs}px ${DISPLAY}`;
    while (g.measureText(name).width > S * 0.88 && fs > 6) { fs -= 0.5; g.font = `900 ${fs}px ${DISPLAY}`; }
    g.lineWidth = fs * 0.28; g.strokeStyle = 'rgba(6,4,20,0.9)'; g.lineJoin = 'round'; g.strokeText(name, S / 2, S * 0.82);
    g.fillStyle = '#fff'; g.fillText(name, S / 2, S * 0.82);
    this.sprites.set(key, c);
    return c;
  }

  /** a rarity's name in its material (on the drum), with its glow baked in; and a plain white copy (for the shine) */
  label(r: RarityId, fontPx: number, mask = false) {
    const fp = Math.round(fontPx * this.dpr), key = `lab:${r}:${fp}:${mask ? 1 : 0}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const info = rarityInfo(r);
    c = this.text(info.emoji ?? null, info.name.toUpperCase(), fp, r, mask, 0.55);
    this.sprites.set(key, c);
    return c;
  }
  /** the big title at the reveal: the name, outlined like a sticker and glowing */
  title(text: string, emoji: string | null, r: RarityId | 'enchanted', fontPx: number) {
    const fp = Math.round(fontPx * this.dpr), key = `ttl:${r}:${text}:${fp}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = this.text(emoji, text, fp, r as RarityId, false, 1.4, true);
    this.sprites.set(key, c);
    return c;
  }

  private text(emoji: string | null, name: string, fp: number, r: RarityId, mask: boolean, glow: number, sticker = false) {
    const info = rarityInfo(r);
    const meas = this.canvas(4, 4).getContext('2d')!;
    meas.font = `900 ${fp}px ${DISPLAY}`;
    const nw = meas.measureText(name).width;
    meas.font = `${Math.round(fp * 0.92)}px ${EMOJI_FONT}`;
    const ew = emoji ? meas.measureText(emoji).width + fp * 0.3 : 0;
    const pad = Math.ceil(fp * (0.25 + glow * 0.5));
    const w = nw + ew + pad * 2, h = fp * 1.35 + pad * 2;
    const c = this.canvas(w, h), g = c.getContext('2d')!;
    const y = h / 2 + fp * 0.04;
    let x = pad;
    g.textBaseline = 'middle';
    if (emoji) { g.font = `${Math.round(fp * 0.92)}px ${EMOJI_FONT}`; if (!mask) g.fillText(emoji, x, y); x += ew; }
    g.font = `900 ${fp}px ${DISPLAY}`;
    if (mask) { g.fillStyle = '#fff'; g.fillText(name, x, y); return c; }
    const col = r === ('enchanted' as RarityId) ? '#B26BFF' : info.color;
    const m = material(r, col);
    const fill = m.h ? g.createLinearGradient(x, 0, x + nw, 0) : g.createLinearGradient(0, y - fp * 0.55, 0, y + fp * 0.5);
    m.stops.forEach(([o, s]) => fill.addColorStop(o, s));
    g.lineJoin = 'round';
    if (sticker) {
      // stacked outline + drop + glow (like the old CSS title: crisp, no text-stroke cutting into letters);
      // a very light rarity (Genesis is pure white) gets a deep outline so the white letters still read
      const line = luminance(col) > 0.72 ? shade(col === '#FFFFFF' || col.toUpperCase() === '#FFFFFF' ? '#A45CFF' : col, -0.5) : col;
      g.save(); g.shadowColor = col; g.shadowBlur = fp * 0.55; g.fillStyle = line; g.fillText(name, x, y); g.restore();
      g.fillStyle = shade(line, -0.45);
      g.fillText(name, x, y + fp * 0.12);
      g.lineWidth = fp * 0.16; g.strokeStyle = line; g.strokeText(name, x, y);
      g.fillStyle = '#fff'; g.fillText(name, x, y);
      g.save(); g.globalAlpha = 0.35; g.globalCompositeOperation = 'source-atop'; g.fillStyle = fill; g.fillRect(x, y - fp, nw, fp * 0.55); g.restore();
    } else {
      g.save(); g.shadowColor = col; g.shadowBlur = fp * glow * 0.9; g.fillStyle = col; g.globalAlpha = 0.85; g.fillText(name, x, y); g.restore();
      g.lineWidth = fp * 0.12; g.strokeStyle = shade(col, -0.6); g.strokeText(name, x, y);
      g.fillStyle = fill; g.fillText(name, x, y);
      // a glassy highlight across the top half
      g.save(); g.globalCompositeOperation = 'source-atop';
      const hl = g.createLinearGradient(0, y - fp * 0.55, 0, y);
      hl.addColorStop(0, 'rgba(255,255,255,0.5)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hl; g.fillRect(x, y - fp * 0.6, nw, fp * 0.6); g.restore();
    }
    return c;
  }

  /** the blank canvas: warm parchment with a faint grid */
  card(px: number) {
    const S = Math.round(px * this.dpr), key = `card:${S}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = this.canvas(S, S);
    const g = c.getContext('2d')!;
    const bg = g.createLinearGradient(0, 0, S * 0.35, S);
    bg.addColorStop(0, '#FFFCF5'); bg.addColorStop(1, '#F3EAD6');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    g.globalAlpha = 0.07; g.fillStyle = '#6B4A22';
    const step = (6 * S) / 310;
    for (let p = 0; p < S; p += step) { g.fillRect(0, p, S, Math.max(1, S / 310)); g.fillRect(p, 0, Math.max(1, S / 310), S); }
    this.sprites.set(key, c);
    return c;
  }

  /** the card's soft shadow (blurred once, not every frame) */
  shadow(px: number, r: number) {
    const S = Math.round(px * this.dpr), key = `shd:${S}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const big = Math.round(S * 1.5);
    c = this.canvas(big, big);
    const g = c.getContext('2d')!;
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = S * 0.13; g.shadowOffsetX = big * 2;
    g.fillStyle = '#000'; g.beginPath(); g.roundRect(S * 0.25 - big * 2, S * 0.25, S, S, r * this.dpr); g.fill();
    this.sprites.set(key, c);
    return c;
  }
  /** white words with a coloured glow baked in */
  glowText(text: string, fontPx: number, a: string, b: string) {
    const fp = Math.round(fontPx * this.dpr), key = `glw:${text}:${fp}:${a}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const m = this.canvas(4, 4).getContext('2d')!; m.font = `900 ${fp}px ${DISPLAY}`;
    const w = m.measureText(text).width, pad = fp * 1.3;
    c = this.canvas(w + pad * 2, fp * 1.4 + pad * 2);
    const g = c.getContext('2d')!;
    g.font = `900 ${fp}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const x = c.width / 2, y = c.height / 2;
    g.fillStyle = '#fff';
    g.shadowColor = b; g.shadowBlur = fp * 1.2; g.fillText(text, x, y);
    g.shadowColor = a; g.shadowBlur = fp * 0.6; g.fillText(text, x, y);
    g.shadowBlur = 0; g.fillText(text, x, y);
    this.sprites.set(key, c);
    return c;
  }

  /** a scratch layer (the ink, the shine) — reused every frame */
  layer(name: string, w: number, h = w) {
    const W = Math.round(w * this.dpr), H = Math.round(h * this.dpr), key = `lay:${name}`;
    let c = this.sprites.get(key);
    if (!c || c.width !== W || c.height !== H) { c = this.canvas(W, H); this.sprites.set(key, c); }
    return c;
  }
}

/** relative luminance (0 dark … 1 white) */
export function luminance(hex: string) {
  const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/** how a rarity's name is coloured: its own colour as a metal, gold for the golden ones, a rainbow for the cosmic */
export function material(r: RarityId, col: string): { stops: [number, string][]; h?: boolean } {
  const gold: [number, string][] = [[0, '#FFF8CC'], [0.38, '#FFD54A'], [0.62, '#E8960F'], [1, '#FFE27A']];
  const rainbow: [number, string][] = [[0, '#FF6FB5'], [0.2, '#FFB31F'], [0.4, '#FFE14D'], [0.6, '#3DDC97'], [0.8, '#22E3FF'], [1, '#A45CFF']];
  if (r === 'legendary' || r === 'crown' || r === 'solar') return { stops: gold };
  if (r === 'prismatic' || r === 'genesis' || r === 'chaos') return { stops: rainbow, h: true };
  if (r === 'mythic') return { stops: [[0, '#FFE1F1'], [0.4, '#FF5FAE'], [0.7, '#E0218A'], [1, '#B66BFF']] };
  if (r === 'singularity') return { stops: [[0, '#F7FFE0'], [0.45, '#B4FF39'], [0.75, '#6BD400'], [1, '#FDE047']] };
  if (r === 'crown_state') return { stops: [[0, '#FBE7FF'], [0.4, '#C084FC'], [0.7, '#9333EA'], [1, '#FFD23F']] };
  if (r === 'crown_country') return { stops: [[0, '#FFE4E6'], [0.4, '#F43F5E'], [0.7, '#BE123C'], [1, '#FFD23F']] };
  return { stops: [[0, shade(col, 0.62)], [0.45, shade(col, 0.12)], [0.7, col], [1, shade(col, -0.32)]] };
}
export const tierOf = (r: string) => rarityTier(r);
