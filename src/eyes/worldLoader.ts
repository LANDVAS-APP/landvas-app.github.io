// Making the real place round you off the main thread: a worker builds each stretch of town (and paints the sharpest
// ground a square at a time) while the view carries on at full speed. Where a worker can't paint (an old Safari), the
// same steps run here a little at a time instead.
import type { Frame } from './geo';
import { canvasFor, paintGround, type AnyCanvas, type Tile } from './world';
import { buildWorld, type WorldOpts, type WorldStage } from './worldBuild';

type Region = { x0: number; z0: number; size: number };
export type WorldLoader = {
  /** start making the place round `frame`; its parts arrive through `on` as they're ready (the last is 'done') */
  build(frame: Frame, o: WorldOpts, on: (s: WorldStage) => void): number;
  /** paint one square of world `id`'s sharpest ground (`px` across): there and then, or (from the worker) soon */
  close(id: number, r: Region, px: number): ImageBitmap | AnyCanvas | null | Promise<ImageBitmap | null>;
  /** that world's no longer needed */
  drop(id: number): void;
  /** (tests) is the work being done in a worker */
  inWorker(): boolean;
  dispose(): void;
};

const canPaintOffscreen = () => {
  try { return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('2d'); } catch { return false; }
};

export function createWorldLoader(): WorldLoader {
  let seq = 0, reqSeq = 0;
  const on = new Map<number, (s: WorldStage) => void>();
  /** builds still under way (re-run here if the worker gives out) */
  const running = new Map<number, { frame: Frame; o: WorldOpts }>();
  const waiting = new Map<number, (b: ImageBitmap | null) => void>();
  const here = new Map<number, { frame: Frame; near: Tile[]; o: WorldOpts }>();
  let worker: Worker | null = null;
  let disposed = false;
  const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

  const runHere = (id: number, frame: Frame, o: WorldOpts) => {
    void buildWorld(frame, o, (s) => { if (!disposed) on.get(id)?.(s); if (s.t === 'done') { running.delete(id); on.delete(id); } }, (near) => {
      here.set(id, { frame, near, o });
      while (here.size > 2) here.delete(here.keys().next().value!);
    }, yieldNow).catch(() => { on.get(id)?.({ t: 'none' }); on.get(id)?.({ t: 'done' }); running.delete(id); on.delete(id); });
  };
  /** the worker gave out: everything it had in hand is done here instead */
  const fallBack = () => {
    if (!worker) return;
    worker.terminate(); worker = null;
    for (const w of waiting.values()) w(null);
    waiting.clear();
    for (const [id, b] of running) runHere(id, b.frame, b.o);
  };

  if (canPaintOffscreen()) {
    try {
      worker = new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data as { t: string; id: number; s?: WorldStage; req?: number; bmp?: ImageBitmap | null; canPaint?: boolean };
        if (m.t === 'stage' && m.s) {
          on.get(m.id)?.(m.s);
          if (m.s.t === 'done') { running.delete(m.id); on.delete(m.id); }
        } else if (m.t === 'close' && m.req != null) { waiting.get(m.req)?.(m.bmp ?? null); waiting.delete(m.req); }
        else if (m.t === 'ready' && !m.canPaint) fallBack();
      };
      worker.onerror = () => fallBack();
    } catch { worker = null; }
  }

  let scratch: AnyCanvas | null = null;
  return {
    build(frame, o, cb) {
      const id = ++seq;
      on.set(id, cb);
      running.set(id, { frame, o });
      if (worker) worker.postMessage({ t: 'world', id, frame, o });
      else runHere(id, frame, o);
      return id;
    },
    close(id, r, px) {
      if (worker) {
        const req = ++reqSeq;
        return new Promise((res) => { waiting.set(req, res); worker!.postMessage({ t: 'close', id, req, r, px }); });
      }
      const w = here.get(id);
      if (!w) return null;
      // (painted right here, into one canvas that's copied straight away)
      if (!scratch || scratch.width !== px) scratch = canvasFor(px, px);
      paintGround(scratch.getContext('2d') as CanvasRenderingContext2D, w.frame, w.near, r, px, w.o.pal, { detail: true, real: w.o.real, close: true, cull: 25 });
      return scratch;
    },
    drop(id) { on.delete(id); running.delete(id); here.delete(id); worker?.postMessage({ t: 'drop', id }); },
    inWorker: () => !!worker,
    dispose() { disposed = true; worker?.terminate(); worker = null; on.clear(); running.clear(); here.clear(); for (const w of waiting.values()) w(null); waiting.clear(); },
  };
}
