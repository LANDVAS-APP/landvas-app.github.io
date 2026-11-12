// Draws a Crown celebration card onto a canvas: the snapshot players download or share to Discord / Reddit.
// Everything is drawn here (no DOM screenshotting), so the picture on screen and the saved PNG are identical.
import type { Celebration } from './celebration';

export type SnapSize = 'square' | 'wide';
export const SNAP_DIMS: Record<SnapSize, [number, number]> = { square: [1080, 1080], wide: [1200, 675] };

const GOLD = '#E8B64A', GOLD_LIGHT = '#F6DE9A', GOLD_PALE = '#FFF1C2', GOLD_DEEP = '#9A6716', GOLD_EDGE = '#7A5010';
const CREAM = '#F5EEDC', LILAC = '#CFC4E6', BODY = '#D9D0EC';
const DISPLAY = '"Unbounded Variable", "Unbounded", ui-sans-serif, system-ui, sans-serif';
const SANS = '"Manrope Variable", "Manrope", ui-sans-serif, system-ui, sans-serif';

/** Wait (briefly) for the site's fonts so the snapshot uses them. */
export async function loadSnapFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`900 64px ${DISPLAY}`), document.fonts.load(`700 24px ${SANS}`), document.fonts.load(`500 24px ${SANS}`)]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fall back to system fonts */ }
}

type Ctx = CanvasRenderingContext2D;

function font(g: Ctx, weight: number, size: number, family: string, spacing = 0) {
  g.font = `${weight} ${size}px ${family}`;
  try { (g as any).letterSpacing = `${spacing}px`; } catch { /* older browsers: no tracking */ }
}
/** Set the largest font size ≤ size at which text fits in maxW; returns that size. */
function fit(g: Ctx, text: string, maxW: number, weight: number, size: number, family: string, track = 0, min = 12) {
  let s = size;
  for (; s > min; s -= 2) { font(g, weight, s, family, s * track); if (g.measureText(text).width <= maxW) break; }
  return s;
}

function sparkle(g: Ctx, x: number, y: number, r: number, a: number) {
  g.save(); g.globalAlpha = a; g.fillStyle = GOLD_LIGHT; g.beginPath();
  g.moveTo(x, y - r); g.lineTo(x + r * 0.28, y - r * 0.28); g.lineTo(x + r, y); g.lineTo(x + r * 0.28, y + r * 0.28);
  g.lineTo(x, y + r); g.lineTo(x - r * 0.28, y + r * 0.28); g.lineTo(x - r, y); g.lineTo(x - r * 0.28, y - r * 0.28);
  g.closePath(); g.fill(); g.restore();
}

function diamond(g: Ctx, x: number, y: number, r: number, fill: string) {
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fillStyle = fill; g.fill();
}

/** The jewelled crown, w wide (designed on a 400×280 grid), top-left at x,y. */
export function drawCrown(g: Ctx, x: number, y: number, w: number) {
  const s = w / 400;
  g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round';
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(200, 262, 170, 12, 0, 0, Math.PI * 2); g.fill();
  const body = g.createLinearGradient(0, 30, 0, 210);
  body.addColorStop(0, GOLD_PALE); body.addColorStop(0.45, GOLD); body.addColorStop(1, GOLD_DEEP);
  g.beginPath(); g.moveTo(44, 206); g.lineTo(22, 74); g.lineTo(112, 148); g.lineTo(200, 34); g.lineTo(288, 148); g.lineTo(378, 74); g.lineTo(356, 206); g.closePath();
  g.fillStyle = body; g.fill(); g.strokeStyle = GOLD_EDGE; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.moveTo(60, 196); g.lineTo(46, 112); g.lineTo(114, 168); g.lineTo(200, 62); g.lineTo(286, 168); g.lineTo(354, 112); g.lineTo(340, 196); g.closePath();
  g.strokeStyle = 'rgba(255,241,194,0.5)'; g.lineWidth = 2; g.stroke();
  const band = g.createLinearGradient(0, 200, 0, 254); band.addColorStop(0, GOLD_LIGHT); band.addColorStop(1, '#A8741C');
  g.beginPath(); g.roundRect(36, 200, 328, 54, 8); g.fillStyle = band; g.fill(); g.strokeStyle = GOLD_EDGE; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.moveTo(44, 212); g.lineTo(356, 212); g.strokeStyle = 'rgba(255,241,194,0.6)'; g.lineWidth = 2; g.stroke();
  const pearl = (cx: number, cy: number, r: number) => { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = CREAM; g.fill(); g.strokeStyle = GOLD_EDGE; g.lineWidth = 3; g.stroke(); };
  pearl(22, 72, 15); pearl(378, 72, 15); pearl(200, 30, 19);
  g.beginPath(); g.arc(194, 24, 5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  for (const cx of [112, 288]) { g.beginPath(); g.arc(cx, 148, 9, 0, Math.PI * 2); g.fillStyle = '#3D6BE0'; g.fill(); g.strokeStyle = GOLD_EDGE; g.lineWidth = 2; g.stroke(); }
  g.beginPath(); g.moveTo(200, 208); g.lineTo(222, 227); g.lineTo(200, 246); g.lineTo(178, 227); g.closePath(); g.fillStyle = '#C2304A'; g.fill(); g.strokeStyle = GOLD_EDGE; g.lineWidth = 3; g.stroke();
  for (const cx of [118, 282]) { g.beginPath(); g.ellipse(cx, 227, 15, 11, 0, 0, Math.PI * 2); g.fillStyle = '#2E9E73'; g.fill(); g.strokeStyle = GOLD_EDGE; g.lineWidth = 3; g.stroke(); }
  for (const [cx, r] of [[66, 6], [334, 6], [160, 5], [240, 5]] as const) { g.beginPath(); g.arc(cx, 227, r, 0, Math.PI * 2); g.fillStyle = CREAM; g.fill(); }
  g.restore();
}

function background(g: Ctx, W: number, H: number, cx: number, cy: number) {
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
  bg.addColorStop(0, '#2A1F5C'); bg.addColorStop(0.4, '#160F33'); bg.addColorStop(1, '#0B0819');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.save(); g.strokeStyle = 'rgba(232,182,74,0.13)'; g.lineWidth = 2;
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 2000, cy + Math.sin(a) * 2000); g.stroke(); }
  g.restore();
  // a fixed sprinkle of sparkles (same every time, so re-renders don't jump)
  const pts = [[0.17, 0.24, 18, 0.8], [0.82, 0.19, 15, 0.7], [0.8, 0.45, 11, 0.6], [0.21, 0.47, 12, 0.6], [0.3, 0.14, 9, 0.5], [0.7, 0.11, 9, 0.5], [0.12, 0.66, 7, 0.45], [0.9, 0.64, 7, 0.45]] as const;
  for (const [x, y, r, a] of pts) sparkle(g, x * W, y * H, r * (W / 1080), a);
}

function frame(g: Ctx, W: number, H: number) {
  const o = W >= 1100 && H < 800 ? 24 : 28;
  g.save();
  g.globalAlpha = 0.85; g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.roundRect(o, o, W - o * 2, H - o * 2, 6); g.stroke();
  g.globalAlpha = 0.4; g.lineWidth = 1; g.beginPath(); g.roundRect(o + 12, o + 12, W - (o + 12) * 2, H - (o + 12) * 2, 3); g.stroke();
  g.globalAlpha = 1;
  for (const [x, y] of [[o, o], [W - o, o], [o, H - o], [W - o, H - o]]) diamond(g, x, y, 11, GOLD);
  g.restore();
}

function pill(g: Ctx, text: string, x: number, y: number, size: number, color: string, align: 'center' | 'left') {
  font(g, 800, size, SANS, size * 0.28);
  const w = g.measureText(text).width + size * 2.6, h = size * 2.2;
  const left = align === 'center' ? x - w / 2 : x;
  g.save(); g.beginPath(); g.roundRect(left, y, w, h, h / 2);
  g.fillStyle = 'rgba(232,182,74,0.08)'; g.fill(); g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(text, left + size * 1.3 + size * 0.14, y + h / 2 + 1);
  g.restore();
  return h;
}

function goldText(g: Ctx, text: string, x: number, y: number, size: number) {
  const gr = g.createLinearGradient(0, y - size * 0.85, 0, y + size * 0.15);
  gr.addColorStop(0, '#FFF4CF'); gr.addColorStop(0.55, GOLD); gr.addColorStop(1, '#B07A1E');
  g.save(); g.shadowColor = 'rgba(232,182,74,0.35)'; g.shadowBlur = size * 0.4; g.fillStyle = gr; g.fillText(text, x, y); g.restore();
}

function row(g: Ctx, parts: string[], x: number, y: number, size: number, align: 'center' | 'left', maxW: number) {
  let s = size;
  const gap = () => s * 1.1;
  const width = () => { font(g, 600, s, SANS, s * 0.18); return parts.reduce((a, p) => a + g.measureText(p).width, 0) + gap() * 2 * (parts.length - 1); };
  while (width() > maxW && s > 10) s -= 1;
  let cx = align === 'center' ? x - width() / 2 : x;
  g.save(); g.fillStyle = LILAC; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  parts.forEach((p, i) => {
    g.fillText(p, cx, y); cx += g.measureText(p).width;
    if (i < parts.length - 1) { cx += gap(); diamond(g, cx, y - s * 0.35, s * 0.28, GOLD); cx += gap(); }
  });
  g.restore();
}

/** Draw the card for c at the given size; returns the canvas. */
export function drawCelebration(c: Celebration, size: SnapSize, canvas = document.createElement('canvas')): HTMLCanvasElement {
  const [W, H] = SNAP_DIMS[size];
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.textBaseline = 'alphabetic';
  const tierColor = c.crown.tier === 'crown_country' ? GOLD_LIGHT : c.crown.tier === 'crown_state' ? '#C9B6FF' : '#9BE9FF';
  const leftLine = c.left !== null ? `${c.left.toLocaleString('en-US')} ${c.crown.tier === 'crown' ? 'City' : c.crown.tier === 'crown_state' ? 'State' : 'Country'} Crowns still unclaimed. Claim yours at landvas.app` : 'Claim yours at landvas.app';

  if (size === 'square') {
    background(g, W, H, W / 2, 360); frame(g, W, H);
    font(g, 800, 22, DISPLAY, 7); g.fillStyle = GOLD_LIGHT; g.textAlign = 'left'; g.fillText('LANDVAS', 88, 104);
    font(g, 700, 17, SANS, 4); g.fillStyle = LILAC; g.textAlign = 'right'; g.fillText('ROYAL DECREE', W - 88, 103);
    drawCrown(g, W / 2 - 190, 140, 380);
    const ph = pill(g, c.headline, W / 2, 432, 19, tierColor, 'center');
    g.textAlign = 'center';
    font(g, 700, 26, SANS, 10); g.fillStyle = LILAC; g.fillText('ALL HAIL', W / 2, 432 + ph + 52);
    const hs = fit(g, c.handle, W - 200, 900, 92, DISPLAY, 0, 40);
    goldText(g, c.handle, W / 2, 432 + ph + 60 + hs, hs);
    let y = 432 + ph + 60 + hs + 58;
    const ts = fit(g, c.title, W - 260, 800, 40, DISPLAY, 0.02, 22);
    g.fillStyle = CREAM; g.fillText(c.title, W / 2, y);
    const tw = g.measureText(c.title).width;
    g.fillStyle = GOLD; g.globalAlpha = 0.7; g.fillRect(W / 2 - tw / 2 - 86, y - ts * 0.38, 62, 2); g.fillRect(W / 2 + tw / 2 + 24, y - ts * 0.38, 62, 2); g.globalAlpha = 1;
    if (c.where) { y += 40; fit(g, c.where, W - 240, 600, 18, SANS, 0.28, 12); g.fillStyle = LILAC; g.fillText(c.where, W / 2, y); }
    fit(g, leftLine, W - 220, 500, 23, SANS, 0, 14); g.fillStyle = BODY; g.fillText(leftLine, W / 2, H - 150);
    row(g, [c.claimed, c.boost, 'LANDVAS.APP'], W / 2, H - 102, 17, 'center', W - 220);
  } else {
    background(g, W, H, 300, H / 2); frame(g, W, H);
    drawCrown(g, 80, H / 2 - 150, 400);
    const x = 540, maxW = W - x - 84;
    g.textAlign = 'left';
    font(g, 800, 17, DISPLAY, 5); g.fillStyle = GOLD_LIGHT; g.fillText('LANDVAS · ROYAL DECREE', x, 108);
    const ph = pill(g, c.headline, x, 134, 15, tierColor, 'left');
    let y = 134 + ph + 46;
    font(g, 700, 21, SANS, 8); g.fillStyle = LILAC; g.fillText('ALL HAIL', x, y);
    const hs = fit(g, c.handle, maxW, 900, 64, DISPLAY, 0, 30);
    y += 8 + hs; goldText(g, c.handle, x, y, hs);
    y += 48; fit(g, c.title, maxW, 800, 30, DISPLAY, 0.02, 16); g.fillStyle = CREAM; g.fillText(c.title, x, y);
    if (c.where) { y += 32; fit(g, c.where, maxW, 600, 15, SANS, 0.28, 11); g.fillStyle = LILAC; g.fillText(c.where, x, y); }
    y += 46;
    // the call to action may need two lines here
    font(g, 500, 18, SANS, 0); g.fillStyle = BODY;
    const words = leftLine.split(' '); let line = ''; const lines: string[] = [];
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    lines.slice(0, 2).forEach((l, i) => g.fillText(l, x, y + i * 27));
    row(g, [c.claimed, c.boost], x, H - 84, 14, 'left', maxW);
  }
  return canvas;
}

export const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
