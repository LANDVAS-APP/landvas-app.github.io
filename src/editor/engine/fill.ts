// Flood fill across plot boundaries: the whole canvas is treated as one image
// (non-member cells of an irregular canvas act as walls).
import { R, type Doc, type Layer } from './doc';

export type FillResult = { mask: Uint8Array; width: number; height: number; cells: Set<string> };

export function floodFill(doc: Doc, layer: Layer, sx: number, sy: number, tolerance: number, sampleAll: boolean, maxPixels = 12_000_000): FillResult | null {
  const W = doc.width, H = doc.height;
  if (W * H > maxPixels) return null;
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (!doc.cellAt(sx, sy)) return null;
  // pixel source per cell (ImageData), built lazily
  const sources = new Map<string, Uint8ClampedArray | null>();
  const src = (key: string) => {
    if (sources.has(key)) return sources.get(key)!;
    let data: Uint8ClampedArray | null = null;
    if (sampleAll) data = doc.compositeOf(key).getContext('2d')!.getImageData(0, 0, R, R).data;
    else {
      const t = layer.tiles.get(key);
      data = t ? t.ctx.getImageData(0, 0, R, R).data : null; // null = fully transparent
    }
    sources.set(key, data);
    return data;
  };
  const px = (x: number, y: number): number => {
    const cell = doc.cellAt(x, y);
    if (!cell) return -1;
    const d = src(cell.key);
    if (!d) return 0;
    const i = ((y - cell.y) * R + (x - cell.x)) * 4;
    return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
  };
  const seed = px(sx, sy);
  const tol = Math.round((tolerance / 100) * 255);
  const sr = (seed >>> 24) & 255, sg = (seed >>> 16) & 255, sb = (seed >>> 8) & 255, sa = seed & 255;
  const match = (v: number) => {
    if (v === -1) return false;
    if (v === seed) return true;
    const a = v & 255;
    if (sa === 0 && a === 0) return true;
    return Math.abs(((v >>> 24) & 255) - sr) <= tol && Math.abs(((v >>> 16) & 255) - sg) <= tol && Math.abs(((v >>> 8) & 255) - sb) <= tol && Math.abs(a - sa) <= tol;
  };
  const mask = new Uint8Array(W * H);
  const cells = new Set<string>();
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    while (x >= 0 && !mask[y * W + x] && match(px(x, y))) x--;
    x++;
    let up = false, down = false;
    while (x < W && !mask[y * W + x] && match(px(x, y))) {
      mask[y * W + x] = 1;
      cells.add(doc.cellAt(x, y)!.key);
      if (y > 0) {
        const m = !mask[(y - 1) * W + x] && match(px(x, y - 1));
        if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false;
      }
      if (y < H - 1) {
        const m = !mask[(y + 1) * W + x] && match(px(x, y + 1));
        if (m && !down) { stack.push(x, y + 1); down = true; } else if (!m) down = false;
      }
      x++;
    }
  }
  return { mask, width: W, height: H, cells };
}

/** Grow a mask by one pixel so fills tuck under anti-aliased edges. */
export function dilate(res: FillResult) {
  const { mask, width: W, height: H } = res;
  const out = mask.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x]) continue;
      if ((x > 0 && mask[y * W + x - 1]) || (x < W - 1 && mask[y * W + x + 1]) || (y > 0 && mask[(y - 1) * W + x]) || (y < H - 1 && mask[(y + 1) * W + x])) out[y * W + x] = 1;
    }
  res.mask = out;
}
