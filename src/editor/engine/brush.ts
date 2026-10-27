// Brush engine: dab-based brushes with pressure, plus brush tip caching.
import { makeCanvas } from './doc';

export type BrushId = 'pencil' | 'round' | 'ink' | 'marker' | 'airbrush' | 'spray' | 'calligraphy' | 'pixel' | 'eraser';

export type BrushDef = {
  name: string;
  hardness: number;
  spacing: number; // fraction of diameter between dabs
  flow: number; // per-dab alpha inside the stroke buffer
  pressureSize: boolean;
  pressureFlow: boolean;
  tip: 'round' | 'chisel' | 'nib' | 'square' | 'scatter';
  defaultSize: number;
  maxSize: number;
  unlock?: string;
};

export const BRUSHES: Record<BrushId, BrushDef> = {
  pencil: { name: 'Pencil', hardness: 0.9, spacing: 0.1, flow: 0.95, pressureSize: false, pressureFlow: true, tip: 'round', defaultSize: 3, maxSize: 24 },
  round: { name: 'Paintbrush', hardness: 0.55, spacing: 0.08, flow: 0.85, pressureSize: true, pressureFlow: false, tip: 'round', defaultSize: 18, maxSize: 220 },
  ink: { name: 'Ink pen', hardness: 1, spacing: 0.05, flow: 1, pressureSize: true, pressureFlow: false, tip: 'round', defaultSize: 7, maxSize: 80, unlock: 'brush.ink' },
  marker: { name: 'Marker', hardness: 0.95, spacing: 0.06, flow: 1, pressureSize: false, pressureFlow: false, tip: 'chisel', defaultSize: 22, maxSize: 120, unlock: 'brush.marker' },
  airbrush: { name: 'Airbrush', hardness: 0, spacing: 0.05, flow: 0.08, pressureSize: false, pressureFlow: true, tip: 'round', defaultSize: 60, maxSize: 300, unlock: 'brush.airbrush' },
  spray: { name: 'Spray can', hardness: 1, spacing: 0.2, flow: 1, pressureSize: false, pressureFlow: true, tip: 'scatter', defaultSize: 44, maxSize: 200, unlock: 'brush.spray' },
  calligraphy: { name: 'Calligraphy nib', hardness: 0.97, spacing: 0.04, flow: 1, pressureSize: true, pressureFlow: false, tip: 'nib', defaultSize: 16, maxSize: 120, unlock: 'brush.calligraphy' },
  pixel: { name: 'Pixel brush', hardness: 1, spacing: 1, flow: 1, pressureSize: false, pressureFlow: false, tip: 'square', defaultSize: 2, maxSize: 32, unlock: 'brush.pixel' },
  eraser: { name: 'Eraser', hardness: 0.8, spacing: 0.07, flow: 1, pressureSize: true, pressureFlow: false, tip: 'round', defaultSize: 28, maxSize: 300 },
};

/** Tools that are bought in the Studio (everything else is free for everyone). */
export const TOOL_UNLOCKS: Record<string, string> = { rect: 'tool.shapes', ellipse: 'tool.shapes', gradient: 'tool.gradient' };
/** Brush sizes above this need the Giant Brushes upgrade. */
export const STARTER_MAX_SIZE = 48;

const cache = new Map<string, HTMLCanvasElement>();

/** A coloured brush tip of diameter d (document pixels). */
export function brushTip(def: BrushDef, d: number, color: string, hardnessOverride?: number): HTMLCanvasElement {
  const dq = Math.max(1, Math.round(d * 2) / 2);
  const hardness = hardnessOverride ?? def.hardness;
  const key = `${def.tip}|${dq}|${color}|${hardness.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = Math.ceil(dq) + 2;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d')!;
  const r = dq / 2;
  const cx = s / 2;
  ctx.fillStyle = color;
  if (def.tip === 'chisel') {
    ctx.translate(cx, cx);
    ctx.rotate(-Math.PI / 6);
    ctx.beginPath();
    ctx.roundRect(-r, -dq * 0.225, dq, dq * 0.45, r * 0.15);
    ctx.fill();
  } else if (def.tip === 'nib') {
    ctx.translate(cx, cx);
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, Math.max(0.6, r * 0.24), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (hardness >= 0.98 || dq <= 2.5) {
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, r);
    const rgb = hexToRgba(color);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(Math.max(0.01, hardness * 0.98), `rgba(${rgb},1)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  cache.set(key, c);
  if (cache.size > 160) cache.delete(cache.keys().next().value!);
  return c;
}

function hexToRgba(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export type SymmetryMode = 'off' | 'vertical' | 'horizontal' | 'quad' | 'radial';

/** Mirror/rotate a document point for symmetry drawing (around the canvas centre). */
export function symmetryPoints(x: number, y: number, mode: SymmetryMode, w: number, h: number): [number, number, number][] {
  // returns [x, y, angleOffset]
  const out: [number, number, number][] = [[x, y, 0]];
  if (mode === 'vertical' || mode === 'quad') out.push([w - x, y, 0]);
  if (mode === 'horizontal' || mode === 'quad') out.push([x, h - y, 0]);
  if (mode === 'quad') out.push([w - x, h - y, 0]);
  if (mode === 'radial') {
    const cx = w / 2, cy = h / 2;
    for (let k = 1; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      const dx = x - cx, dy = y - cy;
      out.push([cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a), a]);
    }
  }
  return out;
}
