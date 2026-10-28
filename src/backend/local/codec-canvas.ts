// Browser image codec for the in-page pipeline (local mode).
import type { ImageCodec } from '../../server/pipeline';
import type { RGBA } from '../../shared/art';

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  // OffscreenCanvas without a 2D context exists on Safari before 16.4
  if (typeof OffscreenCanvas !== 'undefined') {
    const o = new OffscreenCanvas(w, h);
    try { if (o.getContext('2d')) return new OffscreenCanvas(w, h); } catch { /* fall back */ }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export async function canvasToPng(c: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => (c as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'));
}

export const canvasCodec: ImageCodec = {
  async decode(bytes) {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = makeCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { width: d.width, height: d.height, data: d.data } satisfies RGBA;
  },
  async encodePng(img) {
    const c = makeCanvas(img.width, img.height);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return new Uint8Array(await (await canvasToPng(c)).arrayBuffer());
  },
};
