// Pure RGBA image operations for the publication pipeline. They run unchanged in
// the Node worker (decoded by sharp) and in the browser's local pipeline
// (decoded by canvas), so map tiles are bit-identical across environments.
export type RGBA = { width: number; height: number; data: Uint8ClampedArray };

export const blank = (w: number, h: number): RGBA => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });

/** Box-filter 2x downsample with premultiplied alpha (no dark fringes). */
export function downsample2x(src: RGBA): RGBA {
  const w = src.width >> 1, h = src.height >> 1;
  const out = blank(w, h);
  const s = src.data, d = out.data, sw = src.width;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < 4; k++) {
        const i = (((y * 2 + (k >> 1)) * sw) + x * 2 + (k & 1)) * 4;
        const al = s[i + 3];
        r += s[i] * al; g += s[i + 1] * al; b += s[i + 2] * al; a += al;
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        d[o] = Math.round(r / a); d[o + 1] = Math.round(g / a); d[o + 2] = Math.round(b / a); d[o + 3] = Math.round(a / 4);
      }
    }
  return out;
}

/** Parent map tile from its four children (nw, ne, sw, se); missing children are transparent. */
export function composeParent(children: (RGBA | null)[], size = 256): RGBA {
  const big = blank(size * 2, size * 2);
  children.forEach((c, k) => {
    if (!c) return;
    const ox = (k & 1) * size, oy = (k >> 1) * size;
    for (let y = 0; y < size; y++) {
      const srcRow = y * c.width * 4;
      big.data.set(c.data.subarray(srcRow, srcRow + size * 4), ((oy + y) * size * 2 + ox) * 4);
    }
  });
  return downsample2x(big);
}

export function isTransparent(img: RGBA, threshold = 0): boolean {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > threshold) return false;
  return true;
}

/** Distinct colours among visible pixels, quantised to 5 bits per channel. */
export function countColors(img: RGBA, alphaMin = 32): number {
  const seen = new Set<number>();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < alphaMin) continue;
    seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    if (seen.size > 4096) break;
  }
  return seen.size;
}

export function resizeBilinear(src: RGBA, w: number, h: number): RGBA {
  const out = blank(w, h);
  const sx = src.width / w, sy = src.height / h;
  const s = src.data, d = out.data, sw = src.width, sh = src.height;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const o = (y * w + x) * 4;
      let a = 0, r = 0, g = 0, b = 0;
      const taps: [number, number][] = [[(y0 * sw + x0) * 4, (1 - tx) * (1 - ty)], [(y0 * sw + x1) * 4, tx * (1 - ty)], [(y1 * sw + x0) * 4, (1 - tx) * ty], [(y1 * sw + x1) * 4, tx * ty]];
      for (const [i, wgt] of taps) {
        const al = s[i + 3] * wgt;
        r += s[i] * al; g += s[i + 1] * al; b += s[i + 2] * al; a += al;
      }
      if (a > 0) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; d[o + 3] = a; }
    }
  }
  return out;
}

/** Fit an image inside maxDim using repeated 2x box filtering then bilinear. */
export function fitWithin(src: RGBA, maxDim: number): RGBA {
  let img = src;
  while (img.width >= maxDim * 2 && img.height >= 2 && img.width % 2 === 0 && img.height % 2 === 0) img = downsample2x(img);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 1) return img;
  return resizeBilinear(img, Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
}

/** Stitch per-plot images into one mural (cols × rows plots). */
export function stitch(cells: { col: number; row: number; img: RGBA | null }[], cols: number, rows: number, tile = 256): RGBA {
  const out = blank(cols * tile, rows * tile);
  for (const c of cells) {
    if (!c.img) continue;
    for (let y = 0; y < tile; y++) {
      const srcRow = y * tile * 4;
      out.data.set(c.img.data.subarray(srcRow, srcRow + tile * 4), (((c.row * tile + y) * cols * tile) + c.col * tile) * 4);
    }
  }
  return out;
}

/** Validate a PNG signature + IHDR and return its size, without decoding. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number; colorType: number } | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !sig.every((v, i) => bytes[i] === v)) return null;
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== 'IHDR') return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20), colorType: bytes[25] };
}
