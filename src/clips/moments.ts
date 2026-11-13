// Moments worth sharing beyond the roll: an enchantment shown off, a Splice fusing two enchantments into a hybrid, the
// Forbidden Wish, Hope rising out of Pandora's Box, a Parasite evolving, a treasure chest dug up, a Platinum egg, a
// shattered Mirror Shard, a PERFECT Size Ray zap, a Cuckoo chick with a lucky feather. Each is a short 9:16 cinematic
// drawn from the real thing (its sigil, serial, names and numbers) as a pure function of time — so it can be filmed,
// scrubbed and snipped like a roll, and kept to clip again later.
import { kindInfo } from '../enchant/kinds';
import type { ClipJob } from '../roll/clip';
import { Assets, BODY, DISPLAY, loadFonts, sharedAssets } from '../roll/stage/assets';
import { drawBrand, drawFooter } from '../roll/stage/chrome';
import { layoutFor, type Layout } from '../roll/stage/layout';
import { clamp01, easeOut, easeOutCubic, frames, hash, lerp, rgba, rng, spring } from '../roll/stage/math';
import { drawParticles, emojiImg } from '../roll/stage/particles';
import type { Burst } from '../roll/stage/trace';

export type EnchantRef = { kind: string; sigil: number; name: string; serial?: number | null; level?: number | null; born_place?: string | null; minted?: number | null };
export type Moment = { id: string; at: number; user?: string | null } & (
  | { type: 'showcase'; e: EnchantRef; titles?: string[] }
  | { type: 'splice'; a: EnchantRef; b: EnchantRef; hybrid: string; resonant: boolean; fresh?: boolean }
  | { type: 'forbidden'; e: EnchantRef; outcome: string }
  | { type: 'hope'; e: EnchantRef }
  | { type: 'evolve'; e: EnchantRef; stageName: string; color?: string; text?: string }
  | { type: 'chest'; e: EnchantRef; ink?: number | null; ticket?: string | null }
  | { type: 'egg'; e: EnchantRef; ink?: number | null; platinum?: boolean }
  | { type: 'shatter'; e: EnchantRef }
  | { type: 'zap'; e: EnchantRef; grade: string; target?: string | null }
  | { type: 'chick'; e: EnchantRef; feather?: boolean; ink?: number | null }
);
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** a moment before it's stamped */
export type MomentInput = DistOmit<Moment, 'id' | 'at'>;

export const newMoment = (m: MomentInput): Moment =>
  ({ id: `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, at: Date.now(), ...m }) as unknown as Moment;

const W = 720, H = 1280, TOTAL = 6600, PAYOFF = 2600;
const RAINBOW = ['#FF3D9A', '#FFB31F', '#FFE14D', '#3DDC97', '#22E3FF', '#A45CFF'];
const EVIL = [['🦠', '#7CFF6B'], ['🪙', '#FFD23F'], ['⚔️', '#FF4D6D'], ['🐍', '#3DDC97'], ['🌧️', '#7DA0FF'], ['⛓️', '#B08968'], ['🥀', '#C77DFF']];

/** what the moment is called (in the Clips list and the share text) */
export function momentTitle(m: Moment): { title: string; sub: string; emoji: string; color: string } {
  const k = kindInfo('e' in m ? m.e.kind : m.a.kind);
  switch (m.type) {
    case 'showcase': return { title: m.e.name, sub: `${k.name}${m.e.level ? ` · level ${m.e.level}` : ''}`, emoji: k.emoji, color: k.a };
    case 'splice': return { title: m.hybrid, sub: `Spliced ${m.a.name} + ${m.b.name}${m.resonant ? ' · resonant' : ''}`, emoji: '🧬', color: '#00F5D4' };
    case 'forbidden': return { title: m.outcome === 'granted' ? 'Seven wishes granted' : m.outcome === 'freed' ? 'The Genie is free' : 'A twisted fortune', sub: `The Forbidden Wish · ${m.e.name}`, emoji: '🧞', color: m.outcome === 'granted' ? '#FFD23F' : m.outcome === 'freed' ? '#22E3FF' : '#FF2E63' };
    case 'hope': return { title: 'Hope rises', sub: `All seven evils escaped · ${m.e.name}`, emoji: '🕊️', color: '#FFE8A3' };
    case 'evolve': return { title: `It evolved: ${m.stageName}`, sub: m.e.name, emoji: '🧬', color: m.color ?? '#7CFF6B' };
    case 'chest': return { title: 'Treasure dug up', sub: `${m.ink ? `+${m.ink} Ink · ` : ''}${m.e.name}`, emoji: '💰', color: '#FFD23F' };
    case 'egg': return { title: m.platinum ? 'A Platinum egg' : 'A golden egg', sub: `${m.ink ? `+${m.ink} Ink · ` : ''}${m.e.name}`, emoji: '🥚', color: m.platinum ? '#E5F0FF' : '#FFD23F' };
    case 'shatter': return { title: 'The glass shattered', sub: `+20 Luck · ${m.e.name}`, emoji: '💥', color: '#C0F5FF' };
    case 'zap': return { title: `${m.grade} zap`, sub: `${m.target ? `${m.target} · ` : ''}${m.e.name}`, emoji: '📡', color: '#39FF14' };
    case 'chick': return { title: m.feather ? 'A lucky feather' : 'A chick raised', sub: `${m.ink ? `+${m.ink} Ink · ` : ''}${m.e.name}`, emoji: '🐣', color: '#4CC9F0' };
  }
}

/** a moment as something to film */
export function momentJob(m: Moment, user?: string | null): ClipJob {
  const L = layoutFor(W, H, { mode: 'clip' });
  const A = sharedAssets(1, true);
  const head = momentTitle(m);
  const refs = 'e' in m ? [m.e] : [m.a, m.b];
  const bursts = burstsFor(m, L);
  return {
    w: W, h: H, total: TOTAL, poster: PAYOFF + 1100,
    async prepare() {
      refs.forEach((r) => A.sigil(r.kind, r.sigil));
      await loadFonts();
      await new Promise<void>((res) => { const t0 = performance.now(); const tick = () => (refs.every((r) => A.sigil(r.kind, r.sigil)) || performance.now() - t0 > 4000 ? res() : setTimeout(tick, 20)); tick(); });
    },
    draw(g, ms) { drawMoment(g, L, A, m, ms, bursts, user ?? m.user ?? null); },
    name: `landvas-${head.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    title: `${head.title} — LANDVAS`,
    text: `${head.emoji} ${head.title}! ${head.sub} — on LANDVAS. landvas.app`,
    color: head.color, glow: '#ffffff',
  };
}

// ---- particles for each moment (fixed in time, seeded by the moment) ---------------------------------------------------
function burstsFor(m: Moment, L: Layout): Burst[] {
  const seed = hash(parseInt(m.id.replace(/\D/g, '').slice(0, 8) || '7', 10), m.at % 1e6);
  const out: Burst[] = [];
  const k = kindInfo('e' in m ? m.e.kind : m.a.kind);
  const at = (t: number, o: Partial<Burst> & { colors: string[]; count: number }) => out.push({
    t, seed: hash(seed, out.length + 1), a: 0, x: 0, y: -0.1, speed: 10, gravity: 0.26, size: 1.4, spread: Math.PI * 2, up: 0.3, kind: 'mix', life: 1, drag: 0.982, ...o,
  } as Burst);
  const rain = (t: number, emojis: string[], n = 26) => at(t, { a: 1, x: 0.5, y: -0.02, area: [1, 0.01], angle: Math.PI / 2, spread: 0.5, speed: 3.4, gravity: 0.12, drag: 0.996, colors: ['#fff'], kind: 'emoji', emojis, count: n, life: 1.8 });
  const main = [k.a, k.b, '#FFE8A3', '#fff'];
  at(PAYOFF, { colors: main, count: 260, speed: 16, kind: 'spark' });
  at(PAYOFF + 120, { colors: ['#fff'], count: 24, speed: 11, kind: 'emoji', emojis: [momentTitle(m).emoji, '✨'], life: 1.4 });
  at(PAYOFF + 380, { colors: main, count: 140, speed: 8, kind: 'glitter', life: 1.6 });
  for (let i = 0; i < 6; i++) at(PAYOFF + 500 + i * 320, { a: 1, x: 0.5, y: -0.02, area: [1, 0.01], colors: [...RAINBOW, '#fff'], count: 30, speed: 3, gravity: 0.12, up: -0.4, spread: Math.PI * 0.9, kind: 'glitter', life: 1.5 });
  if (m.type === 'splice') { at(1600, { x: -0.55, colors: [kindInfo(m.a.kind).a, '#fff'], count: 70, speed: 7, kind: 'spark' }); at(1600, { x: 0.55, colors: [kindInfo(m.b.kind).a, '#fff'], count: 70, speed: 7, kind: 'spark' }); if (m.resonant) at(PAYOFF + 200, { colors: ['#00F5D4', '#9B5DE5', '#fff'], count: 200, speed: 20, kind: 'spark' }); }
  if (m.type === 'chest') { for (let i = 0; i < 5; i++) at(800 + i * 400, { y: 0.18, colors: ['#6B4423', '#8B5E34', '#3D2614'], count: 30, speed: 9, kind: 'drop', gravity: 0.4 }); rain(PAYOFF + 100, ['💰', '🪙', '💎', '🪙']); }
  if (m.type === 'egg') rain(PAYOFF + 100, m.platinum ? ['💎', '✨', '🥚'] : ['🪙', '✨', '🥚']);
  if (m.type === 'forbidden') rain(PAYOFF + 100, m.outcome === 'granted' ? ['⭐', '✨', '🪙'] : m.outcome === 'freed' ? ['🌀', '✨', '🎟️'] : ['🌑', '💀', '✨'], 22);
  if (m.type === 'hope') { EVIL.forEach(([e, c], i) => at(1150 + i * 170, { colors: [c, '#fff'], count: 26, speed: 8, kind: 'spark' })); rain(PAYOFF + 100, ['🕊️', '✨', '🤍'], 20); }
  if (m.type === 'shatter') { at(PAYOFF, { colors: ['#fff', '#BAE6FD', '#7DD3FC', '#E0F2FE'], count: 240, speed: 22, kind: 'glitter', gravity: 0.3, size: 3 }); rain(PAYOFF + 200, ['🍀', '✨', '🪞'], 18); }
  if (m.type === 'zap') at(2350, { x: 0.1, colors: ['#39FF14', '#B6FF3D', '#fff'], count: 120, speed: 14, kind: 'spark' });
  if (m.type === 'chick') rain(PAYOFF + 100, m.feather ? ['🪶', '🍀', '✨'] : ['🐣', '🪶', '✨'], 18);
  if (m.type === 'evolve') at(PAYOFF, { colors: [m.color ?? '#7CFF6B', '#B026FF', '#fff'], count: 220, speed: 18, kind: 'spark' });
  void L;
  return out;
}

// ---- drawing --------------------------------------------------------------------------------------------------------
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, fill: string, o: { glow?: string; blur?: number; stroke?: string; lw?: number } = {}) {
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.lw ?? 8; g.strokeStyle = o.stroke; g.strokeText(s, x, y); }
  if (o.glow) { g.save(); g.shadowColor = o.glow; g.shadowBlur = o.blur ?? 30; g.fillStyle = fill; g.fillText(s, x, y); g.restore(); }
  g.fillStyle = fill; g.fillText(s, x, y);
}
function fit(g: CanvasRenderingContext2D, s: string, weight: string, size: number, max: number, family = DISPLAY) {
  let fs = size; g.font = `${weight} ${fs}px ${family}`;
  while (g.measureText(s).width > max && fs > 14) { fs -= 2; g.font = `${weight} ${fs}px ${family}`; }
  return `${weight} ${fs}px ${family}`;
}
function emoji(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number, rot = 0, alpha = 1) {
  if (size <= 1 || alpha <= 0) return;
  g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot); g.drawImage(emojiImg(e, 160), -size / 2, -size / 2, size, size); g.restore();
}
function sigil(g: CanvasRenderingContext2D, A: Assets, r: EnchantRef, x: number, y: number, size: number, rot = 0, alpha = 1) {
  const img = A.sigil(r.kind, r.sigil);
  if (!img || alpha <= 0 || size <= 1) return;
  g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot); g.drawImage(img, -size / 2, -size / 2, size, size); g.restore();
}
function circle(g: CanvasRenderingContext2D, x: number, y: number, R: number, t: number, a: string, alpha: number, seed: number) {
  if (alpha <= 0) return;
  const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ', u = R / 100;
  g.save(); g.translate(x, y); g.globalAlpha *= alpha;
  g.save(); g.rotate((t / 7000) * Math.PI * 2);
  g.strokeStyle = 'rgba(255,232,163,0.8)'; g.lineWidth = 1.4 * u; g.beginPath(); g.arc(0, 0, 96 * u, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = rgba(a, 0.7); g.setLineDash([3 * u, 4 * u]); g.beginPath(); g.arc(0, 0, 88 * u, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.font = `${7 * u}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFE8A3';
  for (let i = 0; i < 24; i++) { const an = (i / 24) * Math.PI * 2; g.save(); g.globalAlpha *= 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(((t / 1000 - i * 0.06) / 1.6) * Math.PI * 2)); g.translate(Math.cos(an) * 92 * u, Math.sin(an) * 92 * u); g.rotate(an + Math.PI / 2); g.fillText(RUNES[(i * 7 + seed) % RUNES.length], 0, 0); g.restore(); }
  g.restore();
  g.rotate(-(t / 11000) * Math.PI * 2);
  for (const [off, col] of [[0, 'rgba(255,232,163,0.6)'], [Math.PI / 6, rgba(a, 0.6)]] as const) { g.strokeStyle = col; g.lineWidth = u; g.beginPath(); for (let i = 0; i <= 6; i++) { const an = (i / 6) * Math.PI * 2 + off; if (i) g.lineTo(Math.cos(an) * 74 * u, Math.sin(an) * 74 * u); else g.moveTo(Math.cos(an) * 74 * u, Math.sin(an) * 74 * u); } g.stroke(); }
  g.restore();
}

export function drawMoment(g: CanvasRenderingContext2D, L: Layout, A: Assets, m: Moment, t: number, bursts: Burst[], user: string | null) {
  const { s } = L, cx = W / 2, cy = H * 0.47;
  const k = kindInfo('e' in m ? m.e.kind : m.a.kind);
  const head = momentTitle(m);
  const col = head.color;
  const pay = t - PAYOFF, paid = pay >= 0;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // the room: the enchantment's own night
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, H * 0.75);
  bg.addColorStop(0, rgba(k.a, 0.28 + (paid ? 0.15 * Math.max(0, 1 - pay / 1500) : 0))); bg.addColorStop(0.45, '#170828'); bg.addColorStop(1, '#05020C');
  g.fillStyle = '#05020C'; g.fillRect(0, 0, W, H);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // drifting motes
  const R = rng(7);
  for (let i = 0; i < 46; i++) {
    const x0 = R() * W, sp = 12 + R() * 30, y = ((R() * H - (t / 1000) * sp) % H + H) % H, tw = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + i));
    g.globalAlpha = 0.5 * tw; g.fillStyle = i % 3 ? '#FFE8A3' : k.a; g.fillRect(x0 + Math.sin(t / 1300 + i) * 8, y, 3, 3);
  }
  g.globalAlpha = 1;
  // rays after the payoff
  if (paid) {
    g.save(); g.translate(cx, cy); g.rotate((pay / 20000) * Math.PI * 2); g.globalAlpha = clamp01(pay / 500);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, H * 0.7); gr.addColorStop(0, rgba(col, 0.35)); gr.addColorStop(0.65, rgba(col, 0));
    g.fillStyle = gr;
    for (let a = 0; a < 360; a += 20) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, H * 0.7, (a * Math.PI) / 180, ((a + 7) * Math.PI) / 180); g.closePath(); g.fill(); }
    g.restore();
  }
  // the kicker
  g.globalAlpha = clamp01(t / 500);
  text(g, momentKicker(m), cx, 226, `900 ${Math.round(15 * s)}px ${BODY}`, 'rgba(255,232,163,0.85)');
  g.globalAlpha = 1;

  // the hero
  const shake = (amt: number) => (amt ? [Math.sin(t / 23) * amt, Math.cos(t / 29) * amt * 0.6] : [0, 0]);
  switch (m.type) {
    case 'showcase': {
      const cp = spring((t - 300) / 1000, 120, 14);
      circle(g, cx, cy, 300 * cp, t, k.a, clamp01(cp), m.e.sigil);
      if (t > 1100 && t < PAYOFF + 300) beams(g, cx, cy, 300, t - 1100, PAYOFF - 1100);
      const a = spring((t - 1100) / 1000, 160, 12), b = spring(pay / 1000, 160, 12);
      sigil(g, A, m.e, cx, cy, 340 * (paid ? lerp(1.35, 1, b) : lerp(0, 0.6, a)), paid ? 0 : lerp(-Math.PI, 0, a), paid ? 1 : 0.55 * clamp01(a));
      break;
    }
    case 'splice': {
      const ka = kindInfo(m.a.kind), kb = kindInfo(m.b.kind);
      const inA = easeOutCubic(clamp01((t - 300) / 900)), merge = easeOutCubic(clamp01((t - 1500) / 1100));
      const dx = lerp(W * 0.62, 0, merge) * 0.5 + lerp(W * 0.25, 0, 1 - inA) * 0.5;
      if (!paid) {
        // the helix spinning up between them
        const spin = (t / 1000) * (2 + merge * 10);
        for (let i = 0; i < 16; i++) {
          const y = cy - 220 + i * 29, ph = spin + i * 0.55, w = Math.sin(ph) * 70 * (0.4 + merge * 0.6);
          g.globalAlpha = clamp01((t - 900) / 500) * 0.9;
          g.strokeStyle = 'rgba(155,246,229,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx + w, y); g.stroke();
          g.fillStyle = Math.cos(ph) > 0 ? ka.a : kb.a; g.beginPath(); g.arc(cx - w, y, 9, 0, Math.PI * 2); g.fill();
          g.fillStyle = Math.cos(ph) > 0 ? kb.a : ka.a; g.beginPath(); g.arc(cx + w, y, 9, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
        sigil(g, A, m.a, cx - dx, cy, 230 * lerp(1, 0.5, merge), merge * 3, clamp01(inA) * (1 - merge * 0.6));
        sigil(g, A, m.b, cx + dx, cy, 230 * lerp(1, 0.5, merge), -merge * 3, clamp01(inA) * (1 - merge * 0.6));
        if (t > 2200) { g.globalAlpha = clamp01((t - 2200) / 400); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 40 + merge * 120, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      } else {
        // the hybrid card turns over
        const f = spring(pay / 1000, 140, 12), w = 470, h = 520;
        g.save(); g.translate(cx, cy); g.scale(Math.max(0.02, Math.abs(Math.cos((1 - clamp01(f)) * Math.PI))), 1);
        g.shadowColor = '#00F5D4'; g.shadowBlur = 50; g.fillStyle = '#04211D'; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 34); g.fill(); g.shadowBlur = 0;
        g.strokeStyle = '#00F5D4'; g.lineWidth = 4; g.stroke();
        sigil(g, A, m.a, -92, -96, 170); sigil(g, A, m.b, 92, -96, 170);
        emoji(g, '🧬', 0, -96, 90, Math.sin(t / 300) * 0.2);
        text(g, m.hybrid.toUpperCase(), 0, 66, fit(g, m.hybrid.toUpperCase(), '900', 46, w - 50), '#00F5D4', { glow: '#00F5D4', blur: 24 });
        text(g, `${m.a.name} + ${m.b.name}`, 0, 120, fit(g, `${m.a.name} + ${m.b.name}`, '700', 22, w - 60, BODY), 'rgba(255,255,255,0.75)');
        if (m.resonant) { g.fillStyle = '#9B5DE5'; g.beginPath(); g.roundRect(-150, 160, 300, 44, 22); g.fill(); text(g, '✦ RESONANT · GENES ×2', 0, 183, `900 20px ${BODY}`, '#fff'); }
        if (m.fresh) { g.fillStyle = '#FFD23F'; g.beginPath(); g.roundRect(-140, -h / 2 + 18, 280, 38, 19); g.fill(); text(g, 'NEW IN THE CODEX', 0, -h / 2 + 38, `900 18px ${BODY}`, '#1a0b2e'); }
        g.restore();
      }
      break;
    }
    case 'forbidden': {
      const build = clamp01((t - 500) / 1900);
      const [sx, sy] = shake(build * 9);
      if (!paid || pay < 600) emoji(g, '🪔', cx + sx, cy + 120 + sy, 300 * (1 + build * 0.1), Math.sin(t / 70) * build * 0.08, paid ? 1 - pay / 600 : 1);
      for (let i = 0; i < 10; i++) { const p = ((t / 1000 - i * 0.22) % 2.2) / 2.2; if (t < 600 + i * 220) continue; g.globalAlpha = (1 - p) * 0.35 * build; g.fillStyle = '#C9B8FF'; g.beginPath(); g.arc(cx + Math.sin(i * 2 + t / 600) * 40 * p, cy + 40 - p * 360, 26 + p * 60, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      const rise = spring((t - 2000) / 1000, 140, 14);
      if (t > 2000) emoji(g, m.outcome === 'twisted' ? '😈' : '🧞', cx, cy + lerp(160, -60, rise), 320 * clamp01(rise), 0, clamp01(rise));
      break;
    }
    case 'hope': {
      const build = clamp01((t - 300) / 900), [sx, sy] = shake(t < 1150 ? build * 10 : 0);
      emoji(g, '🏺', cx + sx, cy + 150 + sy, 300);
      EVIL.forEach(([e, c], i) => {
        const t0 = 1150 + i * 170, p = clamp01((t - t0) / 900);
        if (p <= 0) return;
        const an = -Math.PI / 2 + (i - 3) * 0.42, d = easeOutCubic(p) * 340;
        emoji(g, e, cx + Math.cos(an) * d, cy + 60 + Math.sin(an) * d, 110, 0, p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2 * (paid ? 1 : 0));
        void c;
      });
      if (t > 2200) {
        const q = clamp01((t - 2200) / 900);
        const gr = g.createLinearGradient(0, cy + 100, 0, cy - 500); gr.addColorStop(0, rgba('#ffffff', 0.7 * q)); gr.addColorStop(1, rgba('#ffffff', 0));
        g.fillStyle = gr; g.fillRect(cx - 110 * q, cy - 500, 220 * q, 600);
        emoji(g, '🕊️', cx, cy + lerp(80, -120, easeOut(q)), 200 * q, 0, q);
      }
      break;
    }
    case 'evolve': {
      const build = clamp01((t - 300) / 2200), pulse = 1 + Math.sin(t / (140 - build * 90)) * 0.08 * build;
      circle(g, cx, cy, 260, t * (1 + build * 4), m.color ?? k.a, 0.8 * build, 5);
      if (!paid) emoji(g, '🦠', cx, cy, 260 * pulse * (1 + build * 0.2));
      else { const q = spring(pay / 1000, 220, 14); emoji(g, '🧬', cx, cy, 320 * lerp(0.4, 1, q), Math.sin(t / 500) * 0.1); sigil(g, A, m.e, cx, cy + 10, 200 * q, 0, 0.6); }
      if (t > 2300 && t < PAYOFF + 400) { g.globalAlpha = clamp01(1 - Math.abs(t - PAYOFF) / 400); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      break;
    }
    case 'chest': {
      // a map with the X
      g.save(); g.translate(cx, cy + 60); g.rotate(-0.04);
      const pm = g.createLinearGradient(-300, -260, 300, 260); pm.addColorStop(0, '#E9C46A'); pm.addColorStop(1, '#B98A4A');
      g.fillStyle = pm; g.beginPath(); g.roundRect(-300, -250, 600, 500, 26); g.fill();
      g.strokeStyle = 'rgba(80,45,15,0.5)'; g.setLineDash([14, 12]); g.lineWidth = 5; g.beginPath(); g.moveTo(-240, 180); g.bezierCurveTo(-120, 60, 40, 200, 0, 30); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#C81E1E'; g.lineWidth = 18; g.lineCap = 'round'; g.beginPath(); g.moveTo(-40, -10); g.lineTo(40, 70); g.moveTo(40, -10); g.lineTo(-40, 70); g.stroke();
      g.restore();
      const dig = Math.floor(clamp01((t - 700) / 2000) * 5);
      if (!paid) emoji(g, '⛏️', cx + 120, cy - 30 + (Math.sin(t / 90) > 0 ? -30 : 10), 170, Math.sin(t / 90) * 0.5);
      if (paid) { const q = spring(pay / 1000, 260, 14); emoji(g, '🧰', cx, cy + 80 - 60 * q, 300 * q); }
      void dig;
      break;
    }
    case 'egg': {
      const build = clamp01((t - 300) / 2200), wob = Math.sin(t / (160 - build * 100)) * 0.12 * build;
      const plat = !!m.platinum;
      g.save(); g.translate(cx, cy + 40); g.rotate(wob); const sc = (1 + build * 0.15) * (paid ? lerp(1.15, 1, spring(pay / 1000, 300, 14)) : 1); g.scale(sc, sc);
      g.shadowColor = plat ? '#BFE3FF' : '#FFD23F'; g.shadowBlur = 40 + build * 50;
      const eg = g.createRadialGradient(-50, -90, 10, 0, 0, 230); eg.addColorStop(0, '#fff'); eg.addColorStop(0.35, plat ? '#E5F0FF' : '#FFE27A'); eg.addColorStop(1, plat ? '#8FA8C8' : '#C98A10');
      g.fillStyle = eg; g.beginPath(); g.ellipse(0, 0, 150, 200, 0, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      if (t > 1800) { g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); const n = Math.min(5, Math.floor((t - 1800) / 160)); g.moveTo(-90, -20); for (let i = 1; i <= n; i++) g.lineTo(-90 + i * 36, -20 + (i % 2 ? -28 : 22)); g.stroke(); }
      g.restore();
      break;
    }
    case 'shatter': {
      const cracks = Math.min(7, Math.floor(clamp01((t - 500) / 1900) * 8));
      if (!paid || pay < 300) {
        g.save(); g.translate(cx, cy); g.globalAlpha = paid ? 1 - pay / 300 : 1;
        const gl = g.createLinearGradient(-200, -280, 200, 280); gl.addColorStop(0, '#E0F7FF'); gl.addColorStop(0.5, '#7DD3FC'); gl.addColorStop(1, '#C0F5FF');
        g.fillStyle = gl; g.beginPath(); g.roundRect(-200, -280, 400, 560, 40); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
        const Rc = rng(77); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.95)';
        for (let i = 0; i < cracks; i++) { let x = (Rc() - 0.5) * 120, y = (Rc() - 0.5) * 160; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (Rc() - 0.5) * 160; y += (Rc() - 0.5) * 200; g.lineTo(x, y); } g.stroke(); }
        sigil(g, A, m.e, 0, 0, 200, 0, 0.45);
        g.restore();
      } else emoji(g, '🍀', cx, cy, 260 * spring(pay / 1000, 260, 14));
      break;
    }
    case 'zap': {
      emoji(g, '📡', cx - 190, cy + 140, 230, -0.3);
      const sw = Math.sin(t / 260) * (t < 2300 ? 1 : 0), ang = -Math.PI / 2 + sw * 1.1;
      g.save(); g.translate(cx + 120, cy - 180);
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 120, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.strokeStyle = '#39FF14'; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 120, Math.PI * 1.46, Math.PI * 1.54); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang) * 110, Math.sin(ang) * 110); g.stroke();
      g.restore();
      if (t > 2350 && t < 3400) { const q = 1 - (t - 2350) / 1050; g.save(); g.globalAlpha = q; g.shadowColor = '#39FF14'; g.shadowBlur = 30; g.strokeStyle = '#B6FF3D'; g.lineWidth = 26 * q + 4; g.beginPath(); g.moveTo(cx - 120, cy + 90); g.lineTo(W + 40, cy - 120); g.stroke(); g.restore(); }
      break;
    }
    case 'chick': {
      emoji(g, '🪺', cx, cy + 130, 330);
      const wob = Math.sin(t / 110) * clamp01((t - 800) / 1500) * 0.25;
      if (!paid) emoji(g, '🥚', cx, cy + 50, 190, wob);
      else emoji(g, m.feather ? '🪶' : '🐣', cx, cy + lerp(60, -20, spring(pay / 1000, 240, 12)), 230 * spring(pay / 1000, 240, 12), m.feather ? -0.4 : 0);
      break;
    }
  }

  // the flash at the payoff
  if (pay >= 0 && pay < 600) { g.globalAlpha = frames(pay / 600, [0.95, 0.4, 0]); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  // the headline
  if (paid) {
    const q = spring(pay / 1000, 520, 20);
    const line = headline(m);
    g.save(); g.globalAlpha = clamp01(q * 1.6); g.translate(cx, H * 0.228); g.scale(lerp(2.2, 1, q), lerp(2.2, 1, q));
    text(g, line, 0, 0, fit(g, line, '900', 58, W - 70), '#fff', { glow: col, blur: 34, stroke: rgba(col, 0.9), lw: 10 });
    g.restore();
  } else if (t > 500) {
    g.globalAlpha = clamp01((t - 500) / 400) * (0.65 + 0.35 * Math.sin(t / 240));
    text(g, buildLine(m), cx, H * 0.228, `900 ${Math.round(24 * s)}px ${DISPLAY}`, '#FFE8A3');
    g.globalAlpha = 1;
  }
  // the caption
  const cq = easeOutCubic(clamp01((pay - 500) / 500));
  if (cq > 0) {
    g.save(); g.globalAlpha = cq; g.translate(0, 20 * (1 - cq));
    let y = H * 0.745;
    for (const ln of captionLines(m)) { text(g, ln.t, cx, y, fit(g, ln.t, ln.big ? '900' : '700', ln.big ? 30 : 21, W - 90, ln.big ? DISPLAY : BODY), ln.c ?? 'rgba(255,255,255,0.82)'); y += ln.big ? 50 : 36; }
    g.restore();
  }
  drawParticles(g, L, bursts, t, L.u);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  drawBrand(g, L, user ? { username: user } : null);
  drawFooter(g, L);
}

function beams(g: CanvasRenderingContext2D, cx: number, cy: number, len: number, et: number, until: number) {
  const sx = et < until ? lerp(1.6, 1, easeOut(clamp01(et / 600))) : lerp(1, 0, clamp01((et - until) / 250));
  const op = et < until ? clamp01(et / 600) : 1 - clamp01((et - until) / 250);
  for (let i = 0; i < 8; i++) {
    g.save(); g.translate(cx, cy); g.rotate((i * Math.PI) / 4); g.globalAlpha = op * (0.6 + 0.4 * Math.sin((et / 1200) * Math.PI * 2));
    const gr = g.createLinearGradient(0, 0, len * sx, 0); gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(0.5, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr; g.fillRect(0, -2.5, len * sx, 5); g.restore();
  }
}

function momentKicker(m: Moment) {
  return ({ showcase: 'FROM MY GRIMOIRE', splice: 'A SPLICE', forbidden: 'THE FORBIDDEN WISH', hope: 'PANDORA’S BOX', evolve: 'AN EVOLUTION', chest: 'X MARKS THE SPOT', egg: 'THE GOLDEN GOOSE', shatter: 'THE MIRROR SHARD', zap: 'THE SIZE RAY', chick: 'THE CUCKOO' } as const)[m.type];
}
function buildLine(m: Moment) {
  return ({ showcase: '…something stirs in the ink…', splice: 'Fusing…', forbidden: 'Rubbing the lamp…', hope: 'Lifting the lid…', evolve: 'It’s changing…', chest: 'Digging…', egg: 'Collecting the egg…', shatter: 'Crack… crack…', zap: 'Aiming…', chick: 'It’s hatching…' } as const)[m.type];
}
function headline(m: Moment) {
  switch (m.type) {
    case 'showcase': return '✨ ENCHANTED ✨';
    case 'splice': return m.resonant ? 'RESONANT HYBRID!' : 'HYBRID BORN!';
    case 'forbidden': return m.outcome === 'granted' ? 'SEVEN WISHES!' : m.outcome === 'freed' ? 'THE GENIE IS FREE!' : 'A TWISTED FORTUNE';
    case 'hope': return 'HOPE RISES!';
    case 'evolve': return `${m.stageName.toUpperCase()}!`;
    case 'chest': return m.ink ? `+${m.ink} INK!` : 'TREASURE!';
    case 'egg': return m.platinum ? 'PLATINUM EGG!' : 'GOLDEN EGG!';
    case 'shatter': return 'SHATTERED!';
    case 'zap': return `${m.grade.toUpperCase()}!`;
    case 'chick': return m.feather ? 'LUCKY FEATHER!' : 'IT HATCHED!';
  }
}
function captionLines(m: Moment): { t: string; big?: boolean; c?: string }[] {
  const e = 'e' in m ? m.e : null, k = kindInfo(e ? e.kind : m.type === 'splice' ? m.a.kind : 'goose');
  const id = e ? `${e.name}${e.serial ? ` · #${e.serial}` : ''}${e.level ? ` · LV ${e.level}` : ''}` : '';
  switch (m.type) {
    case 'showcase': return [{ t: `${k.emoji} ${m.e.name}`, big: true, c: k.a }, { t: `${k.name}${m.e.serial ? ` #${m.e.serial}` : ''}${m.e.minted ? ` of ${m.e.minted} ever minted` : ''}${m.e.level ? ` · level ${m.e.level}` : ''}` }, ...(m.e.born_place ? [{ t: `Born in ${m.e.born_place}` }] : []), ...(m.titles?.length ? [{ t: m.titles.slice(0, 3).map((x) => `“${x}”`).join(' · '), c: '#FFE8A3' }] : []), { t: k.tagline, c: 'rgba(255,255,255,0.6)' }];
    case 'splice': return [{ t: 'Each wears the other’s gene for 24 hours', c: '#9BF6E5' }];
    case 'forbidden': return [{ t: id, c: k.a }, { t: m.outcome === 'granted' ? 'Seven wishes, all at once.' : m.outcome === 'freed' ? 'It left a Mythic+ roll ticket behind.' : 'The lamp goes cold…' }];
    case 'hope': return [{ t: id, c: k.a }, { t: 'All seven evils escaped — Hope brings a Legendary+ roll ticket' }];
    case 'evolve': return [{ t: id, c: m.color ?? k.a }, ...(m.text ? [{ t: m.text }] : [])];
    case 'chest': return [{ t: id, c: k.a }, ...(m.ticket ? [{ t: `+ a ${m.ticket} roll ticket`, c: '#FFE8A3' }] : [])];
    case 'egg': return [{ t: id, c: k.a }, { t: m.platinum ? 'One in thirty-three eggs is Platinum — worth ×3' : 'Laid by the Golden Goose' }];
    case 'shatter': return [{ t: id, c: k.a }, { t: 'Seven cracks — +20 Luck and Enchanted Luck' }];
    case 'zap': return [{ t: id, c: k.a }, ...(m.target ? [{ t: m.target }] : [])];
    case 'chick': return [{ t: id, c: k.a }, ...(m.feather ? [{ t: '+20 Luck' }] : [])];
  }
}
