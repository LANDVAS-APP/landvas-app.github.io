// The worker that makes the real place round you (see worldBuild.ts) and paints the sharpest ground a square at a time,
// so none of that work ever lands on the main thread while you walk or drive.
import type { Frame } from './geo';
import { paintGround, type Tile } from './world';
import { buildWorld, type WorldOpts, type WorldStage } from './worldBuild';

type In =
  | { t: 'world'; id: number; frame: Frame; o: WorldOpts }
  | { t: 'close'; id: number; req: number; r: { x0: number; z0: number; size: number }; px: number }
  | { t: 'drop'; id: number };
/** each world's streets (kept for its sharpest ground) */
const worlds = new Map<number, { frame: Frame; near: Tile[]; o: WorldOpts }>();

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
const bitmap = (c: OffscreenCanvas | HTMLCanvasElement) => (c as OffscreenCanvas).transferToImageBitmap();

/** what can be handed over rather than copied */
function moving(s: WorldStage): Transferable[] {
  const out: Transferable[] = [];
  const add = (x: unknown) => { if (x instanceof ImageBitmap) out.push(x); else if (ArrayBuffer.isView(x)) out.push(x.buffer as ArrayBuffer); };
  if (s.t === 'near') { add(s.ground); add(s.occ.grid); for (const k of ['position', 'normal', 'color', 'wuv', 'index'] as const) add(s.bld[k]); }
  if (s.t === 'far') { add(s.ground); if (s.bld) for (const k of ['position', 'normal', 'color', 'wuv', 'index'] as const) add(s.bld[k]); }
  if (s.t === 'terrain' && s.terrain) { add(s.terrain.y); add(s.terrain.abs); if (s.terrain.mesh) for (const k of ['position', 'normal', 'color', 'index'] as const) add(s.terrain.mesh[k]); }
  return [...new Set(out)];
}

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.t === 'drop') { worlds.delete(m.id); return; }
  if (m.t === 'close') {
    const w = worlds.get(m.id);
    if (!w) { post({ t: 'close', id: m.id, req: m.req, bmp: null }); return; }
    const c = new OffscreenCanvas(m.px, m.px);
    paintGround(c.getContext('2d')!, w.frame, w.near, m.r, m.px, w.o.pal, { detail: true, real: w.o.real, close: true, cull: 25 });
    const bmp = c.transferToImageBitmap();
    post({ t: 'close', id: m.id, req: m.req, bmp }, [bmp]);
    return;
  }
  if (m.t === 'world') {
    try {
      await buildWorld(m.frame, m.o, (s) => post({ t: 'stage', id: m.id, s }, moving(s)), (near) => {
        worlds.set(m.id, { frame: m.frame, near, o: m.o });
        // (only the latest two are kept: the one you're in and the one being made)
        while (worlds.size > 2) worlds.delete(worlds.keys().next().value!);
      }, async () => {}, bitmap);
    } catch (err) {
      post({ t: 'stage', id: m.id, s: { t: 'none' } });
      post({ t: 'stage', id: m.id, s: { t: 'done' } });
      post({ t: 'error', id: m.id, message: String((err as Error)?.message ?? err) });
    }
  }
};
post({ t: 'ready', canPaint: typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('2d') });
