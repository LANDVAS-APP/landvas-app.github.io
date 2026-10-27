// Map art tiles: a MapLibre custom protocol (lvart://z/x/y) backed by a small
// index of which tiles exist and their immutable revision. Only tiles in view
// are requested, at the zoom-appropriate pyramid level, so a 100-plot mural
// costs a mobile client the same as a single plot.
import { addProtocol } from 'maplibre-gl';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { ART_MAX_ZOOM, ART_MIN_ZOOM, GRID_LEVEL, GRID_SIZE } from '../shared/grid';
import { config } from '../env';

/** e2e/dev-only trace of art tile requests, for diagnosing refresh races. */
function trace(entry: string) {
  if (!config.e2e) return;
  const w = window as any;
  (w.__lvartLog ??= []).push(`${Math.round(performance.now())} ${entry}`);
  if (w.__lvartLog.length > 400) w.__lvartLog.shift();
}

const BLOCK = 16;
// 1x1 transparent PNG
const EMPTY_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

class Lru<V> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string) {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: string, v: V) {
    this.m.set(k, v);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value!);
  }
}

export class ArtIndex {
  private blocks = new Map<string, Map<string, number>>();
  private inflight = new Map<string, Promise<void>>();
  private queue = new Map<number, Set<string>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private waiters = new Map<string, { resolve(): void; reject(e: unknown): void }[]>();
  bytes = new Lru<ArrayBuffer>(600);

  async rev(z: number, x: number, y: number): Promise<number | null> {
    const bk = `${z}/${x >> 4}/${y >> 4}`;
    if (!this.blocks.has(bk)) await this.load(z, x >> 4, y >> 4);
    return this.blocks.get(bk)?.get(`${x}/${y}`) ?? null;
  }

  private load(z: number, bx: number, by: number): Promise<void> {
    const bk = `${z}/${bx}/${by}`;
    const existing = this.inflight.get(bk);
    if (existing) return existing;
    const p = new Promise<void>((resolve, reject) => {
      if (!this.queue.has(z)) this.queue.set(z, new Set());
      this.queue.get(z)!.add(`${bx}_${by}`);
      const list = this.waiters.get(bk) ?? [];
      list.push({ resolve, reject });
      this.waiters.set(bk, list);
      if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flush(), 12);
    });
    this.inflight.set(bk, p);
    return p;
  }

  private async flush() {
    this.flushTimer = null;
    const batches = [...this.queue.entries()];
    this.queue.clear();
    for (const [z, set] of batches) {
      const all = [...set].map((s) => s.split('_').map(Number) as [number, number]);
      for (let i = 0; i < all.length; i += 64) {
        const chunk = all.slice(i, i + 64);
        try {
          const res = await api.artTileIndex(z, chunk);
          trace(`index z${z} ${chunk.map((c) => c.join('_')).join(' ')} -> ${chunk.map(([bx, by]) => (res[`${bx}_${by}`] ?? []).length).join(',')}`);
          for (const [bx, by] of chunk) {
            const bk = `${z}/${bx}/${by}`;
            const m = new Map<string, number>();
            for (const [x, y, rev] of res[`${bx}_${by}`] ?? []) m.set(`${x}/${y}`, Number(rev));
            this.blocks.set(bk, m);
            this.inflight.delete(bk);
            this.waiters.get(bk)?.forEach((w) => w.resolve());
            this.waiters.delete(bk);
          }
        } catch (e) {
          for (const [bx, by] of chunk) {
            const bk = `${z}/${bx}/${by}`;
            this.inflight.delete(bk);
            this.waiters.get(bk)?.forEach((w) => w.reject(e));
            this.waiters.delete(bk);
          }
        }
      }
    }
  }

  /** Forget everything (e.g. when a map mounts after updates may have happened unseen). */
  reset() {
    trace('reset');
    this.blocks.clear();
  }

  /** Forget cached index blocks covering a plot range (unwrapped gx allowed). */
  invalidate(minGx: number, minGy: number, maxGx: number, maxGy: number) {
    trace(`invalidate ${minGx},${minGy}..${maxGx},${maxGy}`);
    if (minGx < 0) {
      this.invalidate(minGx + GRID_SIZE, minGy, GRID_SIZE - 1, maxGy);
      if (maxGx >= 0) this.invalidate(0, minGy, maxGx, maxGy);
      return;
    }
    for (let z = ART_MIN_ZOOM; z <= ART_MAX_ZOOM; z++) {
      const s = GRID_LEVEL - z + 4; // plot -> block shift at zoom z
      for (let by = minGy >> s; by <= maxGy >> s; by++)
        for (let bx = minGx >> s; bx <= Math.min(maxGx, GRID_SIZE - 1) >> s; bx++) this.blocks.delete(`${z}/${bx}/${by}`);
    }
  }
}

let registered = false;
export function registerArtProtocol(index: ArtIndex) {
  if (registered) return;
  registered = true;
  addProtocol('lvart', async (params, abort) => {
    const m = /^lvart:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return { data: EMPTY_PNG.slice().buffer };
    const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    try {
      const rev = await index.rev(z, x, y);
      trace(`req ${params.url} rev=${rev}${abort.signal.aborted ? ' aborted' : ''}`);
      if (!rev) return { data: EMPTY_PNG.slice().buffer };
      const key = `${z}/${x}/${y}/${rev}`;
      let buf = index.bytes.get(key);
      if (!buf) {
        buf = (await getBackend().artTile(z, x, y, rev, abort.signal)) ?? undefined;
        if (buf) index.bytes.set(key, buf);
      }
      return { data: buf ? buf.slice(0) : EMPTY_PNG.slice().buffer };
    } catch (e) {
      trace(`err ${params.url} ${String(e)}`);
      return { data: EMPTY_PNG.slice().buffer };
    }
  });
}

export const BLOCK_SIZE = BLOCK;
