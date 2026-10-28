// Visual identity of the four plot types: colours and generated "default
// designs" (used on the map for plots without published art, and in the UI).
import type { PlotTypeId } from '../shared/grid';

export const PLOT_TYPES: Record<PlotTypeId, { name: string; game: string; a: string; b: string; base: string; blurb: string }> = {
  graphite: { name: 'Graphite', game: 'TraceCraft', a: '#B9C3D8', b: '#5C6680', base: '#232838', blurb: 'Charcoal, silver and pencil grain' },
  pigment: { name: 'Pigment', game: 'ColorBurst', a: '#FF5470', b: '#FFB23F', base: '#3A1B2A', blurb: 'Saturated paint and watercolor blooms' },
  mosaic: { name: 'Mosaic', game: 'PatternShift', a: '#22C7B5', b: '#FFD43B', base: '#10343A', blurb: 'Geometric tiles and bright patterns' },
  lumina: { name: 'Lumina', game: 'LightLines', a: '#8B5CFF', b: '#22E3FF', base: '#170F3D', blurb: 'Neon light and glowing gradients' },
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint a plot type's default design into a square context. */
export function drawPlotDesign(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, type: PlotTypeId, size: number, seed = 7, alpha = 1) {
  const t = PLOT_TYPES[type];
  const r = rng(seed * 2654435761 + type.length);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = t.base;
  ctx.fillRect(0, 0, size, size);
  const s = size / 64;
  if (type === 'graphite') {
    ctx.lineCap = 'round';
    for (let i = -64; i < 128; i += 6) {
      ctx.strokeStyle = r() > 0.5 ? t.a : t.b;
      ctx.globalAlpha = alpha * (0.35 + r() * 0.4);
      ctx.lineWidth = (0.6 + r() * 0.9) * s;
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo((i + 64) * s, 64 * s);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha * 0.5;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = r() > 0.5 ? '#ffffff' : t.b;
      ctx.fillRect(r() * size, r() * size, s, s);
    }
  } else if (type === 'pigment') {
    for (let i = 0; i < 6; i++) {
      const x = r() * size, y = r() * size, rad = (14 + r() * 22) * s;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const c = i % 2 ? t.a : t.b;
      g.addColorStop(0, c);
      g.addColorStop(0.7, c + 'aa');
      g.addColorStop(1, c + '00');
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'mosaic') {
    const n = 4, c = size / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const k = (x + y + (r() > 0.75 ? 1 : 0)) % 3;
        ctx.fillStyle = k === 0 ? t.a : k === 1 ? t.b : '#F5F4EF';
        ctx.globalAlpha = alpha * 0.92;
        const pad = c * 0.08;
        if ((x * 3 + y) % 2) ctx.fillRect(x * c + pad, y * c + pad, c - pad * 2, c - pad * 2);
        else {
          ctx.beginPath();
          ctx.moveTo(x * c + pad, y * c + c - pad);
          ctx.lineTo(x * c + c / 2, y * c + pad);
          ctx.lineTo(x * c + c - pad, y * c + c - pad);
          ctx.closePath();
          ctx.fill();
        }
      }
  } else {
    ctx.lineWidth = 2.2 * s;
    for (let i = 0; i < 5; i++) {
      const c = i % 2 ? t.a : t.b;
      ctx.strokeStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 8 * s;
      ctx.globalAlpha = alpha * 0.9;
      ctx.beginPath();
      const y0 = r() * size;
      ctx.moveTo(0, y0);
      ctx.bezierCurveTo(size * 0.33, r() * size, size * 0.66, r() * size, size, r() * size);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/** RGBA images for MapLibre fill-pattern, one per type and variant. */
export function patternImages(): { id: string; width: number; height: number; data: Uint8Array }[] {
  const out: { id: string; width: number; height: number; data: Uint8Array }[] = [];
  for (const type of Object.keys(PLOT_TYPES) as PlotTypeId[]) {
    for (const [variant, alpha] of [['owned', 1], ['free', 0.38]] as const) {
      const size = 64;
      const c = Object.assign(document.createElement('canvas'), { width: size, height: size }); // plain canvas: OffscreenCanvas 2D needs Safari 16.4+
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      drawPlotDesign(ctx, type, size, 11, alpha);
      out.push({ id: `pat-${variant}-${type}`, width: size, height: size, data: new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer) });
    }
  }
  return out;
}

/** Small badge icons (one per plot type) shown on unclaimed plots, so players can see which minigame a plot hosts. */
export function typeIconImages(): { id: string; width: number; height: number; data: Uint8Array }[] {
  const size = 64;
  const out: { id: string; width: number; height: number; data: Uint8Array }[] = [];
  for (const type of Object.keys(PLOT_TYPES) as PlotTypeId[]) {
    const t = PLOT_TYPES[type];
    const c = Object.assign(document.createElement('canvas'), { width: size, height: size }); // plain canvas: OffscreenCanvas 2D needs Safari 16.4+
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    // backdrop disc
    const g = ctx.createRadialGradient(32, 28, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(30,22,64,0.92)');
    g.addColorStop(1, 'rgba(10,8,30,0.86)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = t.a;
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (type === 'graphite') {
      // pencil
      ctx.save();
      ctx.translate(32, 32);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#E8ECF7';
      ctx.fillRect(-5, -16, 10, 24);
      ctx.fillStyle = t.b;
      ctx.fillRect(-5, -19, 10, 4);
      ctx.fillStyle = '#F3D9B1';
      ctx.beginPath();
      ctx.moveTo(-5, 8);
      ctx.lineTo(5, 8);
      ctx.lineTo(0, 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2A2F45';
      ctx.beginPath();
      ctx.moveTo(-1.8, 14.3);
      ctx.lineTo(1.8, 14.3);
      ctx.lineTo(0, 18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (type === 'pigment') {
      // paint drop
      const dg = ctx.createLinearGradient(20, 14, 44, 50);
      dg.addColorStop(0, t.b);
      dg.addColorStop(1, t.a);
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.moveTo(32, 12);
      ctx.bezierCurveTo(40, 24, 46, 31, 46, 38);
      ctx.arc(32, 38, 14, 0, Math.PI, false);
      ctx.bezierCurveTo(18, 31, 24, 24, 32, 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(26.5, 37, 3, 5, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'mosaic') {
      // four tiles
      const cols = [t.a, t.b, '#F5F4EF', t.a];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = cols[i];
        const x = 18 + (i % 2) * 15, y = 18 + Math.floor(i / 2) * 15;
        ctx.beginPath();
        ctx.roundRect(x, y, 13, 13, 3);
        ctx.fill();
      }
    } else {
      // lightning
      ctx.shadowColor = t.b;
      ctx.shadowBlur = 8;
      const lg = ctx.createLinearGradient(24, 12, 40, 52);
      lg.addColorStop(0, t.b);
      lg.addColorStop(1, t.a);
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(36, 10);
      ctx.lineTo(20, 35);
      ctx.lineTo(31, 35);
      ctx.lineTo(27, 54);
      ctx.lineTo(44, 27);
      ctx.lineTo(33, 27);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    out.push({ id: `ico-${type}`, width: size, height: size, data: new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer) });
  }
  return out;
}
