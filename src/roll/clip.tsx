// Clip a roll: a short vertical video of the pull — the drum spinning through every reroll, the landing, the flash,
// the plot art and its name — made in the browser (canvas + MediaRecorder) and shared straight from the phone.
// Offered for anything better than Rare.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RARITY_ORDER, rarityInfo, rarityOdds, rarityTier, type RarityId } from '../shared/rarity';
import { buzz } from '../native/native';
import { config } from '../env';

const W = 720, H = 1280, FPS = 30;
const RAINBOW = ['#FF3D9A', '#FFB31F', '#FFE14D', '#3DDC97', '#22E3FF', '#8FA8FF', '#A45CFF'];
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type ClipInput = { rolls: RarityId[]; kept: number; shiny: boolean; username: string; accent: string; plotType?: string; rollShiny?: boolean[]; rollTypes?: string[] };

/** whether this pull is worth a clip (better than Rare) */
export const clippable = (r: RarityId) => rarityTier(r) >= 2;

async function artImage(rarity: RarityId, shiny: boolean): Promise<HTMLImageElement> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = renderToStaticMarkup(<BasePlotArt rarity={rarity} shiny={shiny} size={400} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode().catch(() => undefined);
  return img;
}

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number; star: boolean };

/** plan the clip's timeline: intro, every roll, the pick, the reveal */
function plan(n: number) {
  const intro = 0.7, first = 1.9, re = 1.0, pick = n > 1 ? 0.8 : 0, reveal = 3.6;
  const rolls = Array.from({ length: n }, (_, i) => ({ t0: intro + (i === 0 ? 0 : first + (i - 1) * re), d: i === 0 ? first : re }));
  const tPick = intro + first + (n - 1) * re;
  const tReveal = tPick + pick;
  return { intro, rolls, tPick, tReveal, total: tReveal + reveal };
}

/** draw one frame at time t (seconds) */
function draw(g: CanvasRenderingContext2D, t: number, inp: ClipInput, art: HTMLImageElement, parts: P[], state: { burst: boolean; last: number }) {
  const kept = inp.rolls[inp.kept];
  const info = rarityInfo(kept);
  const tier = rarityTier(kept);
  const ultra = tier >= 5;
  const pl = plan(inp.rolls.length);
  const revealing = t >= pl.tReveal;
  const rt = t - pl.tReveal;
  const dt = Math.min(0.05, Math.max(0, t - state.last)); state.last = t;

  // the room
  g.setTransform(1, 0, 0, 1, 0, 0);
  const shake = revealing && rt < 0.8 && tier >= 3 ? (1 - rt / 0.8) * (ultra ? 22 : 10) : 0;
  g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const bg = g.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.45, H * 0.75);
  const live = revealing ? info : rarityInfo(currentRow(t, inp, pl).r);
  bg.addColorStop(0, revealing ? info.color : '#2A1F5C');
  bg.addColorStop(revealing ? 0.45 : 0.6, revealing ? `${info.color}44` : '#0B0820');
  bg.addColorStop(1, '#05040F');
  g.fillStyle = bg; g.fillRect(-40, -40, W + 80, H + 80);

  // rays
  if (revealing && tier >= 2) {
    g.save(); g.translate(W / 2, H * 0.42); g.rotate(rt * (ultra ? 0.5 : 0.25));
    const n = ultra ? 28 : 18;
    for (let i = 0; i < n; i++) {
      g.rotate((Math.PI * 2) / n);
      g.fillStyle = ultra ? `${RAINBOW[i % RAINBOW.length]}40` : `${info.glow}${tier >= 3 ? '38' : '22'}`;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-40, -H); g.lineTo(40, -H); g.closePath(); g.fill();
    }
    g.restore();
  }

  // header
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#FFE14D'; g.font = '900 44px system-ui, sans-serif';
  g.fillText('LANDVAS', W / 2, 96);
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '700 30px system-ui, sans-serif';
  g.fillText(`@${inp.username}`, W / 2, 146);

  if (!revealing) {
    // intro line
    if (t < pl.intro + 0.3) { g.globalAlpha = clamp01(1 - (t - pl.intro) / 0.3); g.fillStyle = '#fff'; g.font = '900 52px system-ui, sans-serif'; g.fillText('Rolling a plot…', W / 2, H * 0.42 - 170); g.globalAlpha = 1; }
    // Luck banner
    if (inp.rolls.length > 1 && t >= pl.intro) {
      const i = Math.min(inp.rolls.length - 1, pl.rolls.findIndex((r) => t < r.t0 + r.d) < 0 ? inp.rolls.length - 1 : pl.rolls.findIndex((r) => t < r.t0 + r.d));
      pill(g, W / 2, 230, i === 0 ? `🍀 ${inp.rolls.length} rolls` : `🍀 Lucky reroll ${i} of ${inp.rolls.length - 1}`, '#3DDC97');
    }
    // the drum
    const row = currentRow(t, inp, pl);
    drum(g, row.pos, live.color, t >= pl.tPick && inp.rolls.length > 1);
    // the tray of landed rolls
    const landed = pl.rolls.filter((r) => t >= r.t0 + r.d).length;
    tray(g, inp.rolls.slice(0, landed), t >= pl.tPick ? inp.kept : -1, inp.rollShiny);
    if (t >= pl.tPick && inp.rolls.length > 1) {
      g.fillStyle = '#fff'; g.font = '900 46px system-ui, sans-serif';
      g.fillText(`Kept: ${info.emoji ? `${info.emoji} ` : ''}${info.name}`, W / 2, H * 0.42 + 160);
    }
  } else {
    if (!state.burst) {
      state.burst = true;
      const cols = ultra ? [...RAINBOW, '#fff'] : [info.color, info.glow, '#fff'];
      const n = [0, 0, 160, 220, 280, 380][tier];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 300 + Math.random() * (500 + tier * 120);
        parts.push({ x: W / 2, y: H * 0.42, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0, max: 1 + Math.random() * 1.2, c: cols[i % cols.length], s: 4 + Math.random() * 7, star: Math.random() < 0.35 });
      }
    }
    // glitter rain
    if (tier >= 3 || inp.shiny) for (let i = 0; i < (ultra ? 5 : 2); i++) parts.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 40, vy: 120 + Math.random() * 160, life: 0, max: 3, c: ultra || inp.shiny ? RAINBOW[Math.floor(Math.random() * RAINBOW.length)] : info.glow, s: 3 + Math.random() * 4, star: true });

    // the art
    const k = easeOutBack(clamp01(rt / 0.55));
    const size = 380 * k;
    g.save(); g.translate(W / 2, H * 0.42);
    g.shadowColor = info.color; g.shadowBlur = 80;
    g.rotate((1 - clamp01(rt / 0.55)) * -0.4 + Math.sin(rt * 2) * 0.02);
    g.drawImage(art, -size / 2, -size / 2, size, size);
    g.restore();
    if (inp.shiny) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
      const sx = ((rt * 0.7) % 1.6 - 0.3) * 520;
      const sh = g.createLinearGradient(W / 2 - 260 + sx, 0, W / 2 - 120 + sx, 0);
      sh.addColorStop(0, 'transparent'); sh.addColorStop(0.5, '#ffffff'); sh.addColorStop(1, 'transparent');
      g.fillStyle = sh; g.fillRect(W / 2 - 190, H * 0.42 - 190, 380, 380); g.restore();
    }
    // flash
    if (rt < 0.45) { g.fillStyle = `rgba(255,255,255,${(1 - rt / 0.45) * (tier >= 3 ? 0.95 : 0.6)})`; g.fillRect(0, 0, W, H); }

    // ribbon + name
    const ty = H * 0.42 + 290;
    const show = clamp01((rt - 0.25) / 0.35);
    g.globalAlpha = show;
    if (ultra) pill(g, W / 2, H * 0.42 - 270, 'ULTRA RARE', null, true);
    const title = `${info.emoji ? `${info.emoji} ` : ''}${info.name.toUpperCase()}${tier >= 3 ? '!' : ''}`;
    let fs = 110; g.font = `900 ${fs}px system-ui, sans-serif`;
    while (g.measureText(title).width > W - 60 && fs > 40) { fs -= 4; g.font = `900 ${fs}px system-ui, sans-serif`; }
    g.save(); g.translate(W / 2, ty); const s2 = 1 + (1 - easeOutCubic(show)) * 0.6; g.scale(s2, s2);
    g.shadowColor = info.color; g.shadowBlur = 40; g.lineWidth = 10; g.strokeStyle = info.color; g.lineJoin = 'round';
    g.strokeText(title, 0, 0); g.fillStyle = '#fff'; g.fillText(title, 0, 0); g.restore();
    g.font = '800 34px system-ui, sans-serif'; g.fillStyle = info.glow;
    g.fillText(`${rarityOdds(kept)} plots${inp.shiny ? ' · ✨ SHINY' : ''}`, W / 2, ty + 90);
    if (info.ability) {
      g.font = '600 26px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.8)';
      wrap(g, info.ability, W / 2, ty + 150, W - 140, 34, 3);
    }
    g.globalAlpha = 1;
  }

  // particles
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt; p.vy += 520 * dt * (p.star ? 0.3 : 1); p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life > p.max || p.y > H + 40) { parts.splice(i, 1); continue; }
    g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.c;
    if (p.star) starPath(g, p.x, p.y, p.s * 1.4); else { g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;

  // footer
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '700 28px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('landvas.app', W / 2, H - 70);
}

/** where the drum is at time t */
function currentRow(t: number, inp: ClipInput, pl: ReturnType<typeof plan>) {
  const n = RARITY_ORDER.length;
  let i = pl.rolls.findIndex((r) => t < r.t0 + r.d);
  if (i < 0) i = pl.rolls.length - 1;
  const r = pl.rolls[i];
  const target = RARITY_ORDER.indexOf(i === pl.rolls.length - 1 && t >= pl.tPick ? inp.rolls[inp.kept] : inp.rolls[i]);
  const start = i * 7.3;
  const end = Math.ceil((start + n * (i === 0 ? 2 : 1) - target) / n) * n + target;
  const x = clamp01((t - r.t0) / r.d);
  const tierT = rarityTier(inp.rolls[i]);
  const ov = tierT >= 3 ? 0.15 : 0.55;
  const pos = x < 0.85 ? start + (end + ov - start) * easeOutCubic(x / 0.85) : end + ov * (1 - easeOutBack(clamp01((x - 0.85) / 0.15)));
  const k = t >= pl.tPick && inp.rolls.length > 1 ? target : Math.round(t < pl.intro ? start : pos);
  return { pos: t < pl.intro ? start + t * 8 : t >= pl.tPick && inp.rolls.length > 1 ? target : pos, r: RARITY_ORDER[((k % n) + n) % n] };
}

function drum(g: CanvasRenderingContext2D, pos: number, color: string, still: boolean) {
  const n = RARITY_ORDER.length, rowH = 96, cy = H * 0.42;
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(g, 50, cy - rowH / 2 - 6, W - 100, rowH + 12, 28); g.fill();
  g.strokeStyle = color; g.lineWidth = 4; g.shadowColor = color; g.shadowBlur = 30; roundRect(g, 50, cy - rowH / 2 - 6, W - 100, rowH + 12, 28); g.stroke();
  g.shadowBlur = 0;
  const base = Math.floor(pos);
  for (let k = base - 3; k <= base + 3; k++) {
    const d = k - pos, a = Math.abs(d);
    if (still && k !== Math.round(pos)) continue;
    const r = rarityInfo(RARITY_ORDER[((k % n) + n) % n]);
    const label = `${r.emoji ? `${r.emoji} ` : ''}${r.name.toUpperCase()}`;
    g.globalAlpha = Math.max(0, 1 - a * 0.34);
    let fs = 64 * (1 - Math.min(a, 3) * 0.1); g.font = `900 ${fs}px system-ui, sans-serif`;
    while (g.measureText(label).width > W - 140 && fs > 28) { fs -= 3; g.font = `900 ${fs}px system-ui, sans-serif`; }
    g.fillStyle = r.color; g.fillText(label, W / 2, cy + d * rowH);
  }
  g.restore();
}

function tray(g: CanvasRenderingContext2D, rolls: RarityId[], kept: number, shiny?: boolean[]) {
  if (rolls.length < 1) return;
  const w = 104, gap = 10, x0 = W / 2 - (rolls.length * w + (rolls.length - 1) * gap) / 2, y = H - 290;
  rolls.forEach((r, i) => {
    const info = rarityInfo(r);
    g.save();
    g.globalAlpha = kept >= 0 && i !== kept ? 0.35 : 1;
    g.fillStyle = `${info.color}33`; roundRect(g, x0 + i * (w + gap), y, w, 120, 20); g.fill();
    g.strokeStyle = i === kept ? '#FFE14D' : info.color; g.lineWidth = i === kept ? 6 : 3; roundRect(g, x0 + i * (w + gap), y, w, 120, 20); g.stroke();
    g.font = '44px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(info.emoji ?? '◆', x0 + i * (w + gap) + w / 2, y + 48);
    g.font = '900 17px system-ui, sans-serif'; g.fillStyle = info.color; g.fillText(info.name.toUpperCase().slice(0, 10), x0 + i * (w + gap) + w / 2, y + 96);
    if (shiny?.[i]) { g.font = '34px system-ui, sans-serif'; g.fillText('✨', x0 + i * (w + gap) + w - 8, y + 6); }
    g.restore();
  });
}

function pill(g: CanvasRenderingContext2D, x: number, y: number, text: string, color: string | null, rainbow = false) {
  g.save(); g.font = '900 32px system-ui, sans-serif';
  const w = g.measureText(text).width + 60;
  if (rainbow) { const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0); RAINBOW.forEach((c, i) => gr.addColorStop(i / (RAINBOW.length - 1), c)); g.fillStyle = gr; }
  else g.fillStyle = `${color}33`;
  roundRect(g, x - w / 2, y - 30, w, 60, 30); g.fill();
  g.fillStyle = rainbow ? '#1a0b2e' : color!; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 1);
  g.restore();
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, lines: number) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > max && line) { g.fillText(n === lines - 1 ? `${line}…` : line, x, y + n * lh); n++; line = w; if (n >= lines) return; }
    else line = test;
  }
  if (line && n < lines) g.fillText(line, x, y + n * lh);
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function starPath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? s * 0.35 : s; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}


/** formats to try, best first (MP4 shares everywhere); ones that recorded nothing on this device are skipped */
const BROKEN = 'landvas.clipBroken';
function formats(): string[] {
  if (typeof MediaRecorder === 'undefined') return [];
  let broken: string[] = [];
  try { broken = JSON.parse(localStorage.getItem(BROKEN) || '[]'); } catch { /* */ }
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .filter((m) => MediaRecorder.isTypeSupported(m) && !broken.includes(m));
}
function markBroken(m: string) {
  try { const b = JSON.parse(localStorage.getItem(BROKEN) || '[]'); localStorage.setItem(BROKEN, JSON.stringify([...new Set([...b, m])])); } catch { /* */ }
}

/** render the clip frame by frame with exact timestamps (WebCodecs → MP4): full length and smooth on any phone,
    however busy it is. Null where the browser can't encode H.264 this way. */
async function encodeMp4(inp: ClipInput, art: HTMLImageElement, onProgress?: (x: number) => void): Promise<Blob | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  let codec: string | null = null;
  for (const c of ['avc1.640028', 'avc1.4d0028', 'avc1.42001f']) {
    try { if ((await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: 6_000_000, framerate: FPS })).supported) { codec = c; break; } } catch { /* next */ }
  }
  if (!codec) return null;
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
  let failed = false;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: () => { failed = true; } });
  enc.configure({ codec, width: W, height: H, bitrate: 6_000_000, framerate: FPS });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const parts: P[] = [];
  const state = { burst: false, last: 0 };
  const pl = plan(inp.rolls.length);
  const n = Math.ceil((pl.total + 0.2) * FPS);
  for (let i = 0; i < n && !failed; i++) {
    draw(g, Math.min(i / FPS, pl.total), inp, art, parts, state);
    const f = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(f, { keyFrame: i % (FPS * 2) === 0 });
    f.close();
    if (i % 4 === 0 || enc.encodeQueueSize > 6) { onProgress?.(i / n); await new Promise((r) => setTimeout(r, 0)); }
  }
  if (failed) return null;
  await enc.flush(); enc.close();
  muxer.finalize();
  return failed ? null : new Blob([target.buffer], { type: 'video/mp4' });
}

/** make the clip: frame by frame where possible, else recorded in real time; returns a video (or a still image where video can't be recorded) */
export async function recordClip(inp: ClipInput, onProgress?: (x: number) => void): Promise<{ blob: Blob; kind: 'video' | 'image'; ext: string }> {
  const art = await artImage(inp.rolls[inp.kept], inp.shiny);
  try {
    const mp4 = await encodeMp4(inp, art, onProgress);
    if (mp4 && mp4.size > 0) { lastDebug = { via: 'webcodecs' }; return { blob: mp4, kind: 'video', ext: 'mp4' }; }
  } catch { /* fall back to recording */ }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const parts: P[] = [];
  const state = { burst: false, last: 0 };
  const pl = plan(inp.rolls.length);
  const fmts = formats();
  const mime = fmts[0] ?? null;
  if (!mime || !cv.captureStream) {
    draw(g, pl.tReveal + 1.6, inp, art, parts, { burst: true, last: pl.tReveal + 1.6 });
    return { blob: await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), 'image/png')), kind: 'image', ext: 'png' };
  }
  // some browsers claim a format and then record nothing: try each in turn until one gives data
  lastDebug = { mime, tainted: (() => { try { cv.toDataURL(); return false; } catch { return true; } })() };
  const mimes = fmts;
  let used = mime, chunks: Blob[] = [];
  for (const m of mimes) {
    used = m; chunks = []; parts.length = 0; state.burst = false; state.last = 0;
    // frames are pushed one by one as they're drawn (so a busy phone never drops the ending)
    const stream = cv.captureStream(0);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    const push = () => track.requestFrame?.();
    const rec = new MediaRecorder(stream, { mimeType: m, videoBitsPerSecond: 6_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    rec.start(250);
    draw(g, 0, inp, art, parts, state); push();
    const t0 = performance.now();
    const ok = await new Promise<boolean>((resolve) => {
      // next frame: on the animation frame, or a timer if animation frames are being held back
      const next = () => { let fired = false; const go = () => { if (!fired) { fired = true; tick(); } }; requestAnimationFrame(go); setTimeout(go, 1000 / FPS + 8); };
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        draw(g, Math.min(t, pl.total), inp, art, parts, state); push();
        onProgress?.(clamp01(t / pl.total));
        if (t >= pl.total + 0.15) { resolve(true); return; }
        next();
      };
      next();
    });
    rec.stop(); stream.getTracks().forEach((tr) => tr.stop());
    await done;
    lastDebug[m] = { tainted: (() => { try { cv.toDataURL(); return false; } catch { return true; } })(), ok, chunks: chunks.length, bytes: chunks.reduce((n, c) => n + c.size, 0), state: rec.state };
    if (ok && chunks.reduce((n, c) => n + c.size, 0) > 0) break;
    markBroken(m); onProgress?.(0);
  }
  if (!chunks.length) {
    draw(g, pl.tReveal + 1.6, inp, art, [], { burst: true, last: pl.tReveal + 1.6 });
    return { blob: await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), 'image/png')), kind: 'image', ext: 'png' };
  }
  const mimeUsed = used;
  const type = mimeUsed.split(';')[0];
  return { blob: new Blob(chunks, { type }), kind: 'video', ext: type === 'video/mp4' ? 'mp4' : 'webm' };
}

// (tests: make a clip directly)
if (config.e2e || import.meta.env.DEV) (window as unknown as Record<string, unknown>).__landvasClip = async (inp: ClipInput) => {
  const r = await recordClip(inp); return { kind: r.kind, type: r.blob.type, size: r.blob.size, debug: lastDebug };
};
export let lastDebug: Record<string, unknown> = {};
if (config.e2e || import.meta.env.DEV) (window as unknown as Record<string, unknown>).__landvasClipDebug = () => lastDebug;

/** the "Clip it" button and its sheet: record, preview, share or save */
export function ClipButton({ input }: { input: ClipInput }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); buzz('light'); }} onPointerDown={(e) => e.stopPropagation()} data-testid="roll-clip"
        className="lv-clip-btn relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-2xl px-4 font-display text-[15px] font-black text-white">
        🎬 Clip it
      </button>
      {open && createPortal(<ClipSheet input={input} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ClipSheet({ input, onClose }: { input: ClipInput; onClose(): void }) {
  const [prog, setProg] = useState(0);
  const [out, setOut] = useState<{ url: string; file: File; kind: 'video' | 'image' } | null>(null);
  const started = useRef(false);
  const info = rarityInfo(input.rolls[input.kept]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void recordClip(input, setProg).then(({ blob, kind, ext }) => {
      const name = `landvas-${info.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${input.shiny ? '-shiny' : ''}.${ext}`;
      setOut({ url: URL.createObjectURL(blob), file: new File([blob], name, { type: blob.type }), kind });
      buzz('success');
    }).catch(() => { toast.error('Couldn’t make the clip on this device'); onClose(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  const text = `I just pulled a ${input.shiny ? 'SHINY ' : ''}${info.name} plot on LANDVAS! ${info.emoji ?? '🎉'} landvas.app`;
  const share = async () => {
    if (!out) return;
    try {
      if (navigator.canShare?.({ files: [out.file] })) { await navigator.share({ files: [out.file], text, title: `${info.name} on LANDVAS` }); return; }
    } catch { return; /* cancelled */ }
    save();
  };
  const save = () => {
    if (!out) return;
    const a = document.createElement('a'); a.href = out.url; a.download = out.file.name; a.click();
    toast.success('Clip saved');
  };
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[260] grid place-items-center bg-black/85 p-4 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && out) onClose(); }} data-testid="clip-sheet">
        <motion.div className="grid w-full max-w-[340px] justify-items-center gap-3" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}>
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl bg-[#05040F] shadow-[0_0_60px_var(--c)]" style={{ ['--c' as string]: `${info.color}88` }}>
            {out ? (out.kind === 'video'
              ? <video src={out.url} className="h-full w-full object-cover" autoPlay loop muted playsInline data-testid="clip-video" />
              : <img src={out.url} className="h-full w-full object-cover" alt="" data-testid="clip-image" />)
              : (
                <div className="grid h-full place-items-center p-6 text-center">
                  <div className="grid gap-3">
                    <div className="text-5xl">🎬</div>
                    <div className="font-display text-lg font-black text-white">Cutting your clip…</div>
                    <div className="h-2 w-48 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(prog * 100)}%`, background: `linear-gradient(90deg, ${info.color}, ${info.glow})` }} /></div>
                  </div>
                </div>
              )}
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <button disabled={!out} onClick={() => void share()} className="h-12 rounded-2xl font-display font-black text-white disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${info.color}, ${info.glow})` }} data-testid="clip-share">Share</button>
            <button disabled={!out} onClick={save} className="h-12 rounded-2xl bg-white/10 font-bold text-white disabled:opacity-40" data-testid="clip-save">Save</button>
          </div>
          <button onClick={onClose} className="text-sm font-bold text-white/60">Close</button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
