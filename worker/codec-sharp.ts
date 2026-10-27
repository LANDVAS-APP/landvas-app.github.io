// Image codec for the Node worker (libvips via sharp).
import sharp from 'sharp';
import type { ImageCodec } from '../src/server/pipeline';
import type { RGBA } from '../src/shared/art';

export const sharpCodec: ImageCodec = {
  async decode(bytes) {
    const { data, info } = await sharp(bytes, { limitInputPixels: 4096 * 4096 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) } satisfies RGBA;
  },
  async encodePng(img) {
    const buf = await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
      raw: { width: img.width, height: img.height, channels: 4 },
    })
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
      .toBuffer();
    return new Uint8Array(buf);
  },
};
