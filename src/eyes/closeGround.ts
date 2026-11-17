// The sharpest ground, right round you (kerbs, road markings, zebra crossings), painted a square at a time.
//
// It used to be one big picture painted all at once and sent to the graphics chip whole every time you'd moved 50 m or
// so: a hitch you could feel every few seconds while driving. Now it's a grid of small squares in one texture that
// wraps round like a torus: each square of the world always lands in the same slot, so as you move only the row of
// squares coming into view is painted (by a worker, the nearest first) and only that square is sent to the chip. The
// shader samples the texture by world position, so nothing else has to move.
import * as THREE from 'three';

export type CloseRegion = { x0: number; z0: number; size: number };
type Img = TexImageSource & { width: number; height: number };
/** a square of the world's ground, `px` pixels across: painted there and then, or (from a worker) a moment later */
export type ClosePainter = (r: CloseRegion, px: number) => Img | null | Promise<Img | null>;

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
  // (each copy would make the mipmaps again: they're made once a batch of squares is in, and only then are they shown)
  tex.mipmapsAutoUpdate = false;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.unpackAlignment = 4;
  // (room on the chip, nothing to send yet)
  tex.source.dataReady = false;
  tex.needsUpdate = true;
  /** which square of the world each slot holds (null: nothing yet) */
  const slot: (string | null)[] = new Array(T * T).fill(null);
  const mod = (a: number) => ((a % T) + T) % T;
  const id = (i: number, j: number) => `${i},${j}`;
  const ok = (i: number, j: number) => slot[mod(j) * T + mod(i)] === id(i, j);
  /** slots painted since the mipmaps were last made (not shown till they are: from afar they'd show what was there) */
  const unmipped = new Set<number>();
  const shows = (i: number, j: number) => ok(i, j) && !unmipped.has(mod(j) * T + mod(i));
  let paint: ClosePainter | null = null;
  let gen = 0;
  /** what's shown: a rectangle of squares (all painted, in the mipmaps), as world metres x0, z0, x1, z1 */
  const shown = new THREE.Vector4(0, 0, 0, 0);
  let last: Img | null = null;
  let center = { i: 1e9, j: 1e9 };
  /** squares painted but not yet in the mipmaps (so not shown yet), and squares on their way from the worker */
  let fresh = false, lastMip = -1e9;
  const inflight = new Set<string>();
  const at = new THREE.Vector2();

  const gl = renderer.getContext();
  const mipmaps = () => {
    const p = renderer.properties.get(tex) as { __webglTexture?: WebGLTexture };
    if (!p.__webglTexture) return;
    renderer.state.bindTexture(gl.TEXTURE_2D, p.__webglTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
    renderer.state.unbindTexture();
    unmipped.clear();
  };
  /** a painted square into its slot */
  const put = (img: Img, i: number, j: number) => {
    const src = new THREE.Texture(img);
    src.flipY = false;
    renderer.copyTextureToTexture(src, tex, null, at.set(mod(i) * tp, mod(j) * tp));
    slot[mod(j) * T + mod(i)] = id(i, j);
    unmipped.add(mod(j) * T + mod(i));
    fresh = true;
    last = img;
  };
  const wanted = (i: number, j: number) => i >= center.i - T / 2 && i < center.i + T / 2 && j >= center.j - T / 2 && j < center.j + T / 2;
  /** the block of painted squares round you: grown out from your square, a side at a time, while each new edge is
   *  all painted (it never takes in a square that isn't) */
  const fit = () => {
    const i0 = center.i - T / 2, j0 = center.j - T / 2, i1 = i0 + T - 1, j1 = j0 + T - 1;
    if (!shows(center.i, center.j)) { shown.set(0, 0, 0, 0); return; }
    let a0 = center.i, a1 = center.i, b0 = center.j, b1 = center.j;
    const col = (i: number) => { for (let j = b0; j <= b1; j++) if (!shows(i, j)) return false; return true; };
    const row = (j: number) => { for (let i = a0; i <= a1; i++) if (!shows(i, j)) return false; return true; };
    for (let grew = true; grew;) {
      grew = false;
      if (a0 > i0 && col(a0 - 1)) { a0--; grew = true; }
      if (a1 < i1 && col(a1 + 1)) { a1++; grew = true; }
      if (b0 > j0 && row(b0 - 1)) { b0--; grew = true; }
      if (b1 < j1 && row(b1 + 1)) { b1++; grew = true; }
    }
    shown.set(a0 * tm, b0 * tm, (a1 + 1) * tm, (b1 + 1) * tm);
  };

  return {
    texture: tex,
    /** how far the texture spans before it wraps round (metres): moving the world by a whole number of these keeps it */
    span: S,
    shown,
    /** what paints the ground (null: nothing to show). `keep`: the same ground as before (just from a new painter) */
    setPainter(p: ClosePainter | null, keep = false) {
      paint = p; gen++;
      inflight.clear();
      if (keep && p) return;
      fresh = false;
      slot.fill(null);
      unmipped.clear();
      shown.set(0, 0, 0, 0);
      center = { i: 1e9, j: 1e9 };
    },
    /** the world's coordinates moved by (dx, dz) metres, whole spans: every square keeps its slot */
    shift(dx: number, dz: number) {
      const di = Math.round(dx / tm), dj = Math.round(dz / tm);
      for (let k = 0; k < slot.length; k++) {
        const v = slot[k];
        if (!v) continue;
        const [i, j] = v.split(',').map(Number);
        slot[k] = id(i - di, j - dj);
      }
      if (center.i < 1e8) center = { i: center.i - di, j: center.j - dj };
      if (shown.z > shown.x) shown.set(shown.x - di * tm, shown.y - dj * tm, shown.z - di * tm, shown.w - dj * tm);
      inflight.clear(); gen++;
    },
    /** each frame: paint what's coming into view (within `ms` milliseconds here, or a few squares at a time over there) */
    update(x: number, z: number, ms: number) {
      if (!paint) return;
      const ci = Math.floor(x / tm), cj = Math.floor(z / tm);
      // moved into another square: show only what's still right for the new window, before any slot is painted over
      if (ci !== center.i || cj !== center.j) { center = { i: ci, j: cj }; fit(); }
      const i0 = ci - T / 2, j0 = cj - T / 2;
      // the squares still to paint, nearest first
      const todo: [number, number, number][] = [];
      for (let j = j0; j < j0 + T; j++) for (let i = i0; i < i0 + T; i++) if (!ok(i, j) && !inflight.has(id(i, j))) todo.push([i, j, Math.max(Math.abs(i + 0.5 - x / tm), Math.abs(j + 0.5 - z / tm))]);
      todo.sort((a, b) => a[2] - b[2]);
      const t0 = performance.now();
      let n = 0;
      for (const [i, j] of todo) {
        if (inflight.size >= 6 || (n && performance.now() - t0 > ms)) break;
        n++;
        const out = paint({ x0: i * tm, z0: j * tm, size: tm }, tp);
        if (out && typeof (out as Promise<Img | null>).then === 'function') {
          const k = id(i, j), g0 = gen;
          inflight.add(k);
          void (out as Promise<Img | null>).then((img) => {
            if (g0 === gen) inflight.delete(k);
            if (img && g0 === gen && paint && wanted(i, j) && !ok(i, j)) put(img, i, j);
            if (img && typeof (img as ImageBitmap).close === 'function') (img as ImageBitmap).close();
          });
        } else if (out) put(out as Img, i, j);
      }
      const left = todo.length - n + inflight.size;
      if (fresh && (left === 0 || t0 - lastMip > 350)) { mipmaps(); fit(); fresh = false; lastMip = t0; }
    },
    /** (tests) the last square painted (while it's still a picture to read) */
    canvas: () => (last && typeof (last as ImageBitmap).close === 'function' ? null : last),
    /** how much is painted (squares) and how much is shown (metres) */
    state: () => ({ painted: slot.filter(Boolean).length, of: T * T, inflight: inflight.size, shown: [shown.x, shown.y, shown.z, shown.w].map((v) => Math.round(v)) }),
    dispose() { tex.dispose(); inflight.clear(); },
  };
}
export type CloseGround = ReturnType<typeof createCloseGround>;
