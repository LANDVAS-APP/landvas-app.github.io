// The sharpest ground, right round you (kerbs, road markings, zebra crossings), painted a square at a time.
//
// It used to be one big picture painted all at once and sent to the graphics chip whole every time you'd moved 50 m or
// so: a hitch you could feel every few seconds while driving. Now it's a grid of small squares in one texture that
// wraps round like a torus: each square of the world always lands in the same slot, so as you move only the row of
// squares coming into view is painted (one small square per frame, the nearest first) and only that square is sent
// to the chip. The shader samples the texture by world position, so nothing else has to move.
import * as THREE from 'three';

export type CloseRegion = { x0: number; z0: number; size: number };
/** paint the ground of a square of the world into a canvas `px` pixels across */
export type ClosePainter = (g: CanvasRenderingContext2D, r: CloseRegion, px: number) => void;

export function createCloseGround(renderer: THREE.WebGLRenderer, o: { px: number; metres: number; tiles: number }) {
  const T = o.tiles;
  const tp = Math.floor(o.px / T), N = tp * T, tm = o.metres / T, S = tm * T;
  const tex = new THREE.DataTexture(null, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.unpackAlignment = 4;
  // (room on the chip, nothing to send yet)
  tex.source.dataReady = false;
  tex.needsUpdate = true;
  const canvas = Object.assign(document.createElement('canvas'), { width: tp, height: tp });
  const g = canvas.getContext('2d')!;
  const src = new THREE.Texture(canvas);
  src.flipY = false;
  /** which square of the world each slot holds (null: nothing yet) */
  const slot: (string | null)[] = new Array(T * T).fill(null);
  const mod = (a: number) => ((a % T) + T) % T;
  const id = (i: number, j: number) => `${i},${j}`;
  const ok = (i: number, j: number) => slot[mod(j) * T + mod(i)] === id(i, j);
  let paint: ClosePainter | null = null;
  let gen = 0;
  /** what's shown: a rectangle of squares (all painted), as world metres x0, z0, x1, z1 */
  const shown = new THREE.Vector4(0, 0, 0, 0);
  let lastPainted: HTMLCanvasElement | null = null;
  let center = { i: 1e9, j: 1e9 };
  /** squares painted but not yet in the mipmaps (so not shown yet) */
  let fresh = false, lastMip = -1e9;

  const draw = (i: number, j: number) => {
    if (!paint) return;
    paint(g, { x0: i * tm, z0: j * tm, size: tm }, tp);
    renderer.copyTextureToTexture(src, tex, null, new THREE.Vector2(mod(i) * tp, mod(j) * tp));
    slot[mod(j) * T + mod(i)] = id(i, j);
    lastPainted = canvas;
  };
  const gl = renderer.getContext();
  const mipmaps = () => {
    const p = renderer.properties.get(tex) as { __webglTexture?: WebGLTexture };
    if (!p.__webglTexture) return;
    renderer.state.bindTexture(gl.TEXTURE_2D, p.__webglTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
    renderer.state.unbindTexture();
  };
  /** the biggest block of painted squares round the middle of the window */
  const fit = (i0: number, j0: number) => {
    let a0 = i0, a1 = i0 + T - 1, b0 = j0, b1 = j0 + T - 1;
    const all = () => { for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) if (!ok(i, j)) return false; return true; };
    const ci = i0 + T / 2, cj = j0 + T / 2;
    while (a0 <= a1 && b0 <= b1 && !all()) {
      // trim the side with a gap that's furthest from the middle
      const gaps = [
        { s: 'a0', d: ci - a0, bad: (() => { for (let j = b0; j <= b1; j++) if (!ok(a0, j)) return true; return false; })() },
        { s: 'a1', d: a1 - ci, bad: (() => { for (let j = b0; j <= b1; j++) if (!ok(a1, j)) return true; return false; })() },
        { s: 'b0', d: cj - b0, bad: (() => { for (let i = a0; i <= a1; i++) if (!ok(i, b0)) return true; return false; })() },
        { s: 'b1', d: b1 - cj, bad: (() => { for (let i = a0; i <= a1; i++) if (!ok(i, b1)) return true; return false; })() },
      ].filter((x) => x.bad).sort((x, y) => y.d - x.d);
      const cut = gaps[0]?.s ?? 'a0';
      if (cut === 'a0') a0++; else if (cut === 'a1') a1--; else if (cut === 'b0') b0++; else b1--;
    }
    if (a0 > a1 || b0 > b1) shown.set(0, 0, 0, 0);
    else shown.set(a0 * tm, b0 * tm, (a1 + 1) * tm, (b1 + 1) * tm);
  };

  return {
    texture: tex,
    /** how far the texture spans before it wraps (metres) */
    span: S,
    shown,
    /** what paints the ground (null: nothing to show) */
    setPainter(p: ClosePainter | null) {
      paint = p; gen++; fresh = false;
      slot.fill(null);
      shown.set(0, 0, 0, 0);
      center = { i: 1e9, j: 1e9 };
    },
    /** each frame: paint what's coming into view, within `ms` milliseconds (at least one square) */
    update(x: number, z: number, ms: number) {
      if (!paint) return;
      const ci = Math.floor(x / tm), cj = Math.floor(z / tm);
      const i0 = ci - T / 2, j0 = cj - T / 2;
      // moved into another square: show only what's still right for the new window, before any slot is painted over
      if (ci !== center.i || cj !== center.j) { center = { i: ci, j: cj }; fit(i0, j0); }
      // the squares still to paint, nearest first
      const todo: [number, number, number][] = [];
      for (let j = j0; j < j0 + T; j++) for (let i = i0; i < i0 + T; i++) if (!ok(i, j)) todo.push([i, j, Math.max(Math.abs(i + 0.5 - x / tm), Math.abs(j + 0.5 - z / tm))]);
      if (!todo.length && !fresh) return;
      todo.sort((a, b) => a[2] - b[2]);
      const t0 = performance.now();
      // (each copy would make the mipmaps again; they're made once a batch is in, and only then is it shown)
      tex.mipmapsAutoUpdate = false;
      let n = 0;
      for (const [i, j] of todo) {
        if (n && performance.now() - t0 > ms) break;
        draw(i, j);
        n++;
      }
      if (n) fresh = true;
      if (fresh && (n === todo.length || t0 - lastMip > 350)) { mipmaps(); fit(i0, j0); fresh = false; lastMip = t0; }
    },
    /** (tests) the last square painted */
    canvas: () => lastPainted,
    gen: () => gen,
    /** how much is painted (squares) and how much is shown (metres) */
    state: () => ({ painted: slot.filter(Boolean).length, of: T * T, shown: [shown.x, shown.y, shown.z, shown.w].map((v) => Math.round(v)) }),
    dispose() { tex.dispose(); src.dispose(); },
  };
}
export type CloseGround = ReturnType<typeof createCloseGround>;
