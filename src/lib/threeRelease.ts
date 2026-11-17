// A three.js renderer's dispose() frees its buffers and textures but leaves the WebGL context itself alive until the
// garbage collector gets round to it. Phones cap how many contexts can be alive (and WebKit how much memory a page may
// hold): walking through a few 3D places in a row stacked them up, so old contexts were lost noisily, memory climbed
// and the phone warmed. Every 3D scene passes its renderer through releaseOnDispose(), so a disposed renderer hands its
// context back as soon as its canvas has left the page.
//
// Only then: a scene rebuilt on the same <canvas> (an effect re-running, a place switching mode) gets the very same
// context back from the canvas, so losing it while the canvas is still on the page would leave the new scene black.
// (three.js defines render/dispose on each renderer, not on the prototype, so this wraps the instance.)
import type { WebGLRenderer } from 'three';

type Canvas = HTMLCanvasElement | OffscreenCanvas;
/** the renderer currently drawing on each canvas */
const live = new WeakMap<Canvas, WebGLRenderer>();

export function releaseOnDispose<R extends WebGLRenderer>(r: R): R {
  const canvas = r.domElement as Canvas;
  live.set(canvas, r);
  const render = r.render.bind(r);
  r.render = (...a: Parameters<WebGLRenderer['render']>) => {
    if (live.get(canvas) !== r) live.set(canvas, r);
    return render(...a);
  };
  const dispose = r.dispose.bind(r);
  r.dispose = () => {
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try { gl = r.getContext(); } catch { /* none */ }
    dispose();
    if (live.get(canvas) === r) live.delete(canvas);
    // (a useEffect cleanup runs after React has taken the canvas off the page; a scene rebuilt in place keeps it on)
    setTimeout(() => {
      // a new renderer has taken the canvas meanwhile, or it's still on the page: leave the context alone
      if (!gl || live.has(canvas) || ('isConnected' in canvas && canvas.isConnected)) return;
      try { if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ }
    }, 1500);
  };
  return r;
}
