// POST — drains the publication render queue: validates submitted plot images,
// builds previews, writes immutable z16 map tiles and rebuilds the tile pyramid.
// Clients call it after submitting a publication; a cron can call it too. Safe to
// call any time: jobs are claimed with FOR UPDATE SKIP LOCKED.
import { decode, encode } from 'fast-png';
import { BUCKETS, drainQueue, type BlobStore, type ImageCodec, type PipelineDeps } from '../../src/server/pipeline';
import type { RGBA } from '../../src/shared/art';
import { adminClient, cors, json, serve } from './shared';

const admin = adminClient();

const store: BlobStore = {
  async get(bucket, path) {
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  },
  async put(bucket, path, bytes, contentType) {
    const { error } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType, upsert: true, cacheControl: bucket === BUCKETS.public ? '31536000' : '3600',
    });
    if (error) throw new Error(`storage upload failed for ${bucket}/${path}: ${error.message}`);
  },
};

const codec: ImageCodec = {
  async decode(bytes) {
    const img = decode(bytes);
    const n = img.width * img.height;
    const out = new Uint8ClampedArray(n * 4);
    const src = img.data as ArrayLike<number>;
    const ch = img.channels;
    const shift = img.depth === 16 ? 8 : 0;
    const pal = (img as any).palette as number[][] | undefined;
    for (let i = 0; i < n; i++) {
      if (pal) {
        const c = pal[src[i]] ?? [0, 0, 0, 0];
        out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = c.length > 3 ? c[3] : 255;
      } else if (ch >= 3) {
        out[i * 4] = src[i * ch] >> shift; out[i * 4 + 1] = src[i * ch + 1] >> shift; out[i * 4 + 2] = src[i * ch + 2] >> shift;
        out[i * 4 + 3] = ch === 4 ? src[i * ch + 3] >> shift : 255;
      } else {
        const g = src[i * ch] >> shift;
        out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = ch === 2 ? src[i * ch + 1] >> shift : 255;
      }
    }
    return { width: img.width, height: img.height, data: out } satisfies RGBA;
  },
  async encodePng(img) {
    return encode({ width: img.width, height: img.height, data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), channels: 4, depth: 8 });
  },
};

const deps: PipelineDeps = {
  // Edge Functions stop at ~2 s of CPU: do about 0.9 s of image work per run, then resume on the next run
  budgetMs: 900,
  db: {
    async call(fn, args) {
      const { data, error } = await admin.rpc(fn, args ?? {});
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data;
    },
  },
  store,
  codec,
  log: (msg, extra) => console.log(JSON.stringify({ msg, ...extra })),
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const n = await drainQueue(deps, `edge-${crypto.randomUUID().slice(0, 8)}`, 20);
    return json({ processed: n });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
