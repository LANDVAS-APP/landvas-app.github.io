// Invite cards: the eight themes, the words a link preview shows, and the 1200x630 picture the app draws for it.
// One drawing serves the editor's live preview and the picture chats show (uploaded on save), so what a player sees
// is what their friends get. The landing page (InviteLanding) uses the same themes in HTML.
import type { InviteCard } from '../backend/types';

export type InviteTheme = {
  id: string; name: string;
  /** gradient stops, top-left → bottom-right */
  bg: [string, string, string];
  ink: string; sub: string; accent: string; onAccent: string; tile: string;
  pattern: 'plots' | 'rays' | 'waves' | 'leaves' | 'crown' | 'stars' | 'confetti' | 'paper';
  light?: boolean;
};

export const INVITE_THEMES: InviteTheme[] = [
  { id: 'aurora', name: 'Aurora', bg: ['#170f3d', '#3b1d6e', '#0c4a6e'], ink: '#ffffff', sub: 'rgba(235,232,255,0.8)', accent: '#FF4FD8', onAccent: '#1a0526', tile: 'rgba(255,255,255,0.09)', pattern: 'plots' },
  { id: 'sunset', name: 'Sunset', bg: ['#2a0f2e', '#b4380f', '#f59e0b'], ink: '#ffffff', sub: 'rgba(255,240,225,0.85)', accent: '#FFE14D', onAccent: '#2a1400', tile: 'rgba(255,255,255,0.12)', pattern: 'rays' },
  { id: 'ocean', name: 'Ocean', bg: ['#031a33', '#075985', '#0ea5e9'], ink: '#ffffff', sub: 'rgba(220,245,255,0.85)', accent: '#7DF9FF', onAccent: '#012230', tile: 'rgba(255,255,255,0.1)', pattern: 'waves' },
  { id: 'forest', name: 'Forest', bg: ['#04261a', '#14532d', '#4d7c0f'], ink: '#ffffff', sub: 'rgba(225,255,235,0.82)', accent: '#B9F18C', onAccent: '#0b2410', tile: 'rgba(255,255,255,0.1)', pattern: 'leaves' },
  { id: 'crown', name: 'Crown', bg: ['#161003', '#5c3d07', '#c8960f'], ink: '#fff8e1', sub: 'rgba(255,240,200,0.82)', accent: '#FFD54A', onAccent: '#2a1c00', tile: 'rgba(255,220,120,0.12)', pattern: 'crown' },
  { id: 'midnight', name: 'Midnight', bg: ['#04050d', '#0f1430', '#1e1b4b'], ink: '#ffffff', sub: 'rgba(210,215,255,0.78)', accent: '#9A7BFF', onAccent: '#0b0720', tile: 'rgba(255,255,255,0.07)', pattern: 'stars' },
  { id: 'candy', name: 'Candy', bg: ['#ff6fae', '#ff9ec7', '#a78bfa'], ink: '#2b0a3d', sub: 'rgba(43,10,61,0.78)', accent: '#2b0a3d', onAccent: '#ffffff', tile: 'rgba(255,255,255,0.4)', pattern: 'confetti', light: true },
  { id: 'paper', name: 'Paper', bg: ['#fbf7ef', '#f3ead8', '#e6dac0'], ink: '#1d1a14', sub: 'rgba(29,26,20,0.7)', accent: '#7B5CFF', onAccent: '#ffffff', tile: 'rgba(29,26,20,0.06)', pattern: 'paper', light: true },
];
export const themeOf = (id: string | null | undefined) => INVITE_THEMES.find((t) => t.id === id) ?? INVITE_THEMES[0];
export const LOGO_CELLS: [number, number, string][] = [[0, 0, '#FF4D6D'], [0, 1, '#FF9F1C'], [0, 2, '#FFE14D'], [1, 2, '#3DDC97'], [2, 2, '#34C3FF']];

export type CardPlayer = { username: string; display_name?: string | null; accent_color?: string };
/** what a chat shows for the link (scripts/prerender-share.mjs writes the same words into the page's head) */
export function previewText(c: Pick<InviteCard, 'emoji' | 'headline' | 'message'>, p: CardPlayer) {
  const who = p.display_name ? `${p.display_name} (@${p.username})` : `@${p.username}`;
  return {
    title: c.headline ? `${c.emoji ? `${c.emoji} ` : ''}${c.headline}` : `${who} invited you to LANDVAS`,
    description: `${c.message ?? 'Claim a free plot on the live world map and play with me.'} — ${who} on LANDVAS`,
  };
}
export const DEFAULT_HEADLINE = 'Paint the real world with me';
export const DEFAULT_MESSAGE = 'Claim a free plot next to mine on the live world map.';

// ---- the picture ---------------------------------------------------------------------------------------------------
export const CARD_W = 1200, CARD_H = 630;
export type CardArt = { image: HTMLImageElement | null; title: string } | null;
export type CardDraw = { card: Pick<InviteCard, 'theme' | 'emoji' | 'headline' | 'message' | 'showcase' | 'stats'>; player: CardPlayer; code: string;
  avatar?: HTMLImageElement | null; art?: CardArt };

const fontOf = (v: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback; } catch { return fallback; }
};
/** a little random that's the same every time (patterns don't flicker between redraws) */
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else { lines.push(line); line = w; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

/** the theme's backdrop: gradient + its pattern (also used behind the landing page) */
export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: InviteTheme) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, t.bg[0]); g.addColorStop(0.55, t.bg[1]); g.addColorStop(1, t.bg[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const r = rng(t.id.length * 7919 + w);
  ctx.save();
  const s = Math.max(w, h) / 1200;
  switch (t.pattern) {
    case 'plots': {   // a scatter of little plots in the logo's colours
      for (let i = 0; i < 46; i++) {
        const c = LOGO_CELLS[i % 5][2]; const z = (10 + r() * 26) * s;
        ctx.globalAlpha = 0.1 + r() * 0.22; ctx.fillStyle = c; rr(ctx, r() * w, r() * h, z, z, z * 0.25); ctx.fill();
      }
      break;
    }
    case 'rays': {
      ctx.save(); ctx.translate(w * 0.88, h * 1.05);
      for (let i = 0; i < 14; i++) { ctx.rotate(Math.PI / 14); ctx.globalAlpha = 0.07; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w * 1.4, -40 * s); ctx.lineTo(-w * 1.4, 40 * s); ctx.fill(); }
      ctx.restore(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#FFE14D';
      ctx.beginPath(); ctx.arc(w * 0.88, h * 1.05, 150 * s, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'waves': {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * s;
      for (let k = 0; k < 9; k++) {
        ctx.globalAlpha = 0.05 + k * 0.012; ctx.beginPath();
        const y0 = h * 0.35 + k * 34 * s;
        for (let x = 0; x <= w; x += 20) ctx.lineTo(x, y0 + Math.sin(x / (90 * s) + k) * 16 * s);
        ctx.stroke();
      }
      break;
    }
    case 'leaves': {
      for (let i = 0; i < 30; i++) {
        ctx.save(); ctx.translate(r() * w, r() * h); ctx.rotate(r() * Math.PI); ctx.globalAlpha = 0.08 + r() * 0.12;
        ctx.fillStyle = i % 3 ? '#B9F18C' : '#ffffff'; const z = (16 + r() * 30) * s;
        ctx.beginPath(); ctx.ellipse(0, 0, z, z * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      break;
    }
    case 'crown': {
      ctx.globalAlpha = 0.09; ctx.strokeStyle = '#FFD54A'; ctx.lineWidth = 2 * s;
      for (let x = -h; x < w; x += 46 * s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke(); }
      for (let i = 0; i < 26; i++) { ctx.globalAlpha = 0.3 + r() * 0.5; ctx.fillStyle = '#FFE9A8'; ctx.beginPath(); ctx.arc(r() * w, r() * h, (1 + r() * 2.5) * s, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'stars': {
      for (let i = 0; i < 140; i++) { ctx.globalAlpha = 0.2 + r() * 0.7; ctx.fillStyle = i % 9 ? '#ffffff' : '#9A7BFF'; ctx.beginPath(); ctx.arc(r() * w, r() * h, (0.6 + r() * 1.8) * s, 0, Math.PI * 2); ctx.fill(); }
      const m = ctx.createRadialGradient(w * 0.85, h * 0.2, 0, w * 0.85, h * 0.2, 260 * s); m.addColorStop(0, 'rgba(154,123,255,0.35)'); m.addColorStop(1, 'rgba(154,123,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = m; ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'confetti': {
      const cs = ['#ffffff', '#FFE14D', '#7DF9FF', '#3DDC97', '#2b0a3d'];
      for (let i = 0; i < 60; i++) {
        ctx.save(); ctx.translate(r() * w, r() * h); ctx.rotate(r() * Math.PI); ctx.globalAlpha = 0.25 + r() * 0.4; ctx.fillStyle = cs[i % cs.length];
        ctx.fillRect(-7 * s, -3 * s, 14 * s, 6 * s); ctx.restore();
      }
      break;
    }
    case 'paper': {
      ctx.strokeStyle = '#1d1a14'; ctx.globalAlpha = 0.06; ctx.lineWidth = 1 * s;
      for (let y = 40 * s; y < h; y += 40 * s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let i = 0; i < 18; i++) { ctx.globalAlpha = 0.12 + r() * 0.15; ctx.fillStyle = LOGO_CELLS[i % 5][2]; ctx.beginPath(); ctx.arc(r() * w, r() * h, (10 + r() * 30) * s, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
  }
  ctx.restore();
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, dark: boolean) {
  const u = size / 30;
  ctx.fillStyle = dark ? '#0B1230' : 'rgba(255,255,255,0.0)';
  if (dark) { rr(ctx, x, y, size, size, 8 * u); ctx.fill(); }
  for (let gx = 0; gx < 3; gx++) for (let gy = 0; gy < 3; gy++) {
    const c = LOGO_CELLS.find(([a, b]) => a === gx && b === gy);
    ctx.fillStyle = c ? c[2] : dark ? '#1D2A63' : 'rgba(127,127,160,0.25)';
    rr(ctx, x + (4 + gx * 7.6) * u, y + (4 + gy * 7.6) * u, 6.4 * u, 6.4 * u, 1.6 * u); ctx.fill();
  }
}

/** draw the card at 1200x630 (scale the context for other sizes) */
export function drawInviteCard(ctx: CanvasRenderingContext2D, d: CardDraw) {
  const t = themeOf(d.card.theme);
  const display = fontOf('--font-display', 'system-ui');
  const body = fontOf('--font-body', 'system-ui');
  const W = CARD_W, H = CARD_H, P = 64;
  drawBackdrop(ctx, W, H, t);
  const show = d.card.showcase;
  const right = show !== 'none';
  const colW = right ? 640 : W - P * 2;
  // who
  const av = 76;
  ctx.save(); ctx.beginPath(); ctx.arc(P + av / 2, P + av / 2, av / 2, 0, Math.PI * 2); ctx.closePath();
  if (d.avatar) { ctx.clip(); ctx.drawImage(d.avatar, P, P, av, av); }
  else {
    ctx.fillStyle = d.player.accent_color || t.accent; ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = `800 36px ${display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((d.player.display_name || d.player.username || '?').trim().charAt(0).toUpperCase(), P + av / 2, P + av / 2 + 2);
  }
  ctx.restore();
  ctx.lineWidth = 4; ctx.strokeStyle = t.light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(P + av / 2, P + av / 2, av / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.ink; ctx.font = `800 30px ${body}`;
  const name = d.player.display_name || `@${d.player.username}`;
  ctx.fillText(wrap(ctx, name, colW - av - 24, 1)[0] ?? '', P + av + 22, P + 34);
  ctx.fillStyle = t.sub; ctx.font = `600 24px ${body}`;
  ctx.fillText(d.player.display_name ? `@${d.player.username} invited you` : 'invited you to LANDVAS', P + av + 22, P + 66);
  // the words
  let y = P + av + 70;
  const head = d.card.headline || DEFAULT_HEADLINE;
  ctx.fillStyle = t.ink; ctx.font = `800 ${right ? 56 : 66}px ${display}`;
  const lines = wrap(ctx, `${d.card.emoji ? `${d.card.emoji} ` : ''}${head}`, colW, 3);
  for (const l of lines) { ctx.fillText(l, P, y); y += right ? 66 : 76; }
  ctx.fillStyle = t.sub; ctx.font = `500 28px ${body}`;
  for (const l of wrap(ctx, d.card.message || DEFAULT_MESSAGE, colW, lines.length > 2 ? 1 : 2)) { y += 4; ctx.fillText(l, P, y); y += 36; }
  // the code
  ctx.font = `800 28px ${body}`;
  const label = `Join with code ${d.code}`;
  const pw = ctx.measureText(label).width + 48;
  rr(ctx, P, H - P - 64, pw, 64, 32); ctx.fillStyle = t.accent; ctx.fill();
  ctx.fillStyle = t.onAccent; ctx.fillText(label, P + 24, H - P - 22);
  // the showcase
  const sx = 760, sy = P, sw = W - sx - P, sh = H - P * 2 - 70;
  if (show === 'art' && d.art?.image) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    rr(ctx, sx, sy, sw, sh, 26); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, sx + 10, sy + 10, sw - 20, sh - 20, 18); ctx.clip();
    const im = d.art.image; const k = Math.max((sw - 20) / im.width, (sh - 20) / im.height);
    ctx.imageSmoothingEnabled = k < 1; // pixel art stays crisp when it's scaled up
    ctx.drawImage(im, sx + 10 + (sw - 20 - im.width * k) / 2, sy + 10 + (sh - 20 - im.height * k) / 2, im.width * k, im.height * k);
    ctx.restore(); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = t.ink; ctx.font = `700 22px ${body}`; ctx.textAlign = 'center';
    ctx.fillText(wrap(ctx, `“${d.art.title}”`, sw, 1)[0] ?? '', sx + sw / 2, sy + sh + 38); ctx.textAlign = 'left';
  } else if (show === 'plots' || show === 'art') {
    const st = d.card.stats;
    const tiles: [string, string, string?][] = [
      [String(st?.plots ?? 0), st?.plots === 1 ? 'plot' : 'plots'],
      [st?.best?.name ?? '—', 'rarest plot', st?.best?.color],
      [String(st?.art ?? 0), st?.art === 1 ? 'artwork' : 'artworks'],
      [String(st?.crew ?? 0), 'in their crew'],
    ];
    const gw = (sw - 18) / 2, gh = (sh - 18) / 2;
    tiles.forEach(([v, l, c], i) => {
      const x = sx + (i % 2) * (gw + 18), yy = sy + Math.floor(i / 2) * (gh + 18);
      rr(ctx, x, yy, gw, gh, 24); ctx.fillStyle = t.tile; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = t.light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)'; ctx.stroke();
      ctx.fillStyle = c ?? t.ink; ctx.font = `800 ${v.length > 6 ? 34 : 54}px ${display}`; ctx.textAlign = 'center';
      ctx.fillText(wrap(ctx, v, gw - 24, 1)[0] ?? '', x + gw / 2, yy + gh / 2 + 10);
      ctx.fillStyle = t.sub; ctx.font = `700 21px ${body}`; ctx.fillText(l, x + gw / 2, yy + gh / 2 + 48); ctx.textAlign = 'left';
    });
  }
  // the brand
  ctx.textAlign = 'right'; ctx.fillStyle = t.ink; ctx.font = `800 30px ${display}`;
  ctx.fillText('LANDVAS', W - P, H - P - 18);
  const tw = ctx.measureText('LANDVAS').width;
  drawLogo(ctx, W - P - tw - 52, H - P - 52, 40, !t.light);
  ctx.textAlign = 'left';
}

export function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const im = new Image();
    if (!url.startsWith('blob:') && !url.startsWith('data:')) im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = url;
  });
}

/** the picture as a JPEG (small enough for every chat), and its content hash for the file name */
export async function renderInviteCard(d: CardDraw): Promise<{ blob: Blob; name: string }> {
  try { await document.fonts?.ready; } catch { /* fonts are optional */ }
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d')!;
  drawInviteCard(ctx, d);
  let blob: Blob | null = null;
  try { blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.88)); } catch { blob = null; }
  if (!blob) {   // (a picture from another site the browser won't let us export: draw it without)
    drawInviteCard(ctx, { ...d, art: null, avatar: null });
    blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.88));
  }
  if (!blob) throw new Error('could not draw the card');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { blob, name: `${hash}.jpg` };
}
