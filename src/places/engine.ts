// The place engine: every new place (wave 1 on) is built on this, so they all feel the same to walk round while each
// one builds its own world. It's the arcade hall's feel, made general:
//   * the 2D–2.5D look: an angled camera up behind you, your explorer (the flat sprite you dressed) in a 3D room
//   * drag anywhere = a joystick; tap the floor or a thing = walk there (round whatever's in the way: A* on a grid)
//   * other players in your room glide to where they say they are, with name tags and speech bubbles
//   * characters who aren't players (visitors, customers, crew) are drawn in the same explorer style and wander about
//   * step up to a spot and the page offers what's there; the camera can glide in to frame it
//   * feedback for every action: ink bursts in the logo's colours and numbers that pop
// Phones: paced to 60 fps (30 while nobody touches it), adaptive resolution, the GPU context is handed back on dispose.
import * as THREE from 'three';
import { adaptiveDpr, framePacer, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';
import { speechBubbles } from '../lib/speech3d';
import { releaseOnDispose } from '../lib/threeRelease';

export type Rect = { x0: number; x1: number; z0: number; z1: number };
/** where the camera goes to frame something: its position and what it looks at */
export type Focus = { at: THREE.Vector3; look: THREE.Vector3; /** what's being framed: on a tall phone screen the camera backs away from it
  (keeping the same angles) so it still fits, and anything between the camera and it gets out of the way */ subject?: THREE.Vector3 };
export type PlaceSpot = { id: string; x: number; z: number; /** how close counts as "at it" */ r?: number; focus?: Focus; /** not offered right now */ off?: boolean };
export type CameraRig = { height: number; back: number; look: number; fov: number; /** how far the camera follows you sideways (0 still, 1 fully) */ side: number;
  /** on a tall (phone) screen: how much further up and back the camera sits, and how many degrees wider it sees, per unit of tallness */ tall?: number; fovTall?: number };
export type PlaceWorld = {
  /** the walkable area (walls are solids inside it) */ bounds: Rect;
  start: { x: number; z: number; face?: 1 | -1 };
  /** things a tap on which means "walk here" */ floors: THREE.Object3D[];
  solids: Rect[];
  spots: PlaceSpot[];
  /** tapping these walks you to their spot */ taps?: { obj: THREE.Object3D; spot: string }[];
  camera?: Partial<CameraRig>;
  /** per frame (only while the scene draws) */ update?(t: number, dt: number, me: { x: number; z: number }): void;
  dispose?(): void;
};
export type PlaceKit = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; phone: boolean; reduceMotion: boolean;
  /** remember it for dispose */ T<X extends { dispose(): void }>(x: X): X;
  rnd(): number;
  std(color: string, p?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  glow(color: string, k?: number): THREE.MeshStandardMaterial;
  basic(color: string, p?: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial;
  box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh;
  cyl(rt: number, rb: number, h: number, m: THREE.Material, seg?: number): THREE.Mesh;
  plane(w: number, h: number, m: THREE.Material): THREE.Mesh;
  canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture;
  label(text: string, color: string, opts?: { sub?: string; bg?: string; w?: number }): THREE.Sprite;
  emoji(e: string, size: number): THREE.Sprite;
  /** gets out of the way (fades) when it's between the camera and you. Its materials are copied so fading it leaves
      everything else alone, unless `own` (they're its alone already). A mesh's userData.minFade keeps it that visible
      (a wall's dark top stays as an outline); userData.vanish fades it out completely (a sign's lettering). Things
      taken out of the scene drop off the list by themselves. */
  fadeable(o: THREE.Object3D, own?: boolean, /** fade it as if it spanned x0..x1 (a picture fades with the wall it hangs on) */ span?: [number, number]): void;
};
export type PlaceOpts = {
  canvas: HTMLCanvasElement; explorerUrl: string; seed: number; reduceMotion?: boolean;
  build(k: PlaceKit): PlaceWorld;
  /** you're standing at a spot (or walked away: null) */ onNear?(id: string | null): void;
  /** the background and fog colour */ sky?: string; fog?: [number, number];
};
export type Other = { id: string; url: string; name: string; x: number; z: number; act?: string | null };
export type Npc = { id: string; url: string; route: { x: number; z: number; wait?: number }[]; speed?: number; scale?: number };

export const LOGO_INK = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF'];
const SPRITE_W = 46 / 68;
const rngOf = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

export function createPlace(o: PlaceOpts) {
  const phone = isPhone();
  const renderer = releaseOnDispose(new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' }));
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const fps = framePacer({ ambient: true });
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d), undefined, fps);
  const scene = new THREE.Scene();
  const sky = o.sky ?? '#0B0A12';
  scene.background = new THREE.Color(sky);
  if (o.fog) scene.fog = new THREE.Fog(sky, o.fog[0], o.fog[1]);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 160);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
    const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const fadeables: { o: THREE.Object3D; k: number; box: THREE.Box3; framing: boolean }[] = [];
  const kit: PlaceKit = {
    scene, camera, renderer, phone, reduceMotion: !!o.reduceMotion, T, rnd: rngOf(o.seed),
    std: (color, p = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...p })),
    glow: (color, k = 1.6) => T(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 })),
    basic: (color, p = {}) => T(new THREE.MeshBasicMaterial({ color, ...p })),
    box: (w, h, d, m) => new THREE.Mesh(T(new THREE.BoxGeometry(w, h, d)), m),
    cyl: (rt, rb, h, m, seg = 18) => new THREE.Mesh(T(new THREE.CylinderGeometry(rt, rb, h, seg)), m),
    plane: (w, h, m) => new THREE.Mesh(T(new THREE.PlaneGeometry(w, h)), m),
    canvasTex,
    label(text, color, opts = {}) {
      const W = opts.w ?? 512;
      const t = canvasTex(W, 128, (g) => {
        g.fillStyle = opts.bg ?? 'rgba(10,8,20,0.82)'; g.beginPath(); g.roundRect(6, 10, W - 12, 108, 54); g.fill();
        g.strokeStyle = color; g.lineWidth = 5; g.stroke();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 ${opts.sub ? 40 : 48}px "Unbounded Variable", ui-rounded, system-ui, sans-serif`; g.fillText(text, W / 2, opts.sub ? 50 : 64, W - 50);
        if (opts.sub) { g.font = '600 28px "Manrope Variable", system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(opts.sub, W / 2, 92, W - 50); }
      });
      const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })));
      s.scale.set((W / 128) * 0.5, 0.5, 1); return s;
    },
    emoji(e, size) {
      const t = canvasTex(128, 128, (g) => { g.font = '100px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72); });
      const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }))); s.scale.set(size, size, 1); return s;
    },
    fadeable(obj, own = false, span) {
      if (!own) obj.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh) return; const mat = (m.material as THREE.Material).clone(); T(mat); m.material = mat; });
      obj.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(obj); if (span) { box.min.x = span[0]; box.max.x = span[1]; }
      fadeables.push({ o: obj, k: 1, box, framing: false });
    },
  };

  const world = o.build(kit);
  const cam: CameraRig = { height: 6.6, back: 5.2, look: 2.4, fov: 50, side: 0.6, tall: 0.24, fovTall: 0, ...world.camera };
  /** how tall the screen is (0 on a wide one) */
  const tallness = () => (camera.aspect < 1 ? 1 / camera.aspect - 1 : 0);
  camera.fov = cam.fov; camera.updateProjectionMatrix();

  // ---- walking: the grid the routes are found on ------------------------------------------------------------------
  const B = world.bounds, R = 0.32, CELL = 0.25;
  let solids = world.solids.slice();
  const blockedAt = (x: number, z: number) =>
    x < B.x0 + R || x > B.x1 - R || z < B.z0 + R || z > B.z1 - R || solids.some((b) => x > b.x0 - R && x < b.x1 + R && z > b.z0 - R && z < b.z1 + R);
  const GW = Math.ceil((B.x1 - B.x0) / CELL), GH = Math.ceil((B.z1 - B.z0) / CELL);
  let grid = new Uint8Array(GW * GH);
  const buildGrid = () => { grid = new Uint8Array(GW * GH); for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) grid[j * GW + i] = blockedAt(B.x0 + (i + 0.5) * CELL, B.z0 + (j + 0.5) * CELL) ? 1 : 0; };
  buildGrid();
  const cellOf = (x: number, z: number) => [Math.max(0, Math.min(GW - 1, Math.floor((x - B.x0) / CELL))), Math.max(0, Math.min(GH - 1, Math.floor((z - B.z0) / CELL)))] as const;
  const centre = (i: number, j: number) => new THREE.Vector2(B.x0 + (i + 0.5) * CELL, B.z0 + (j + 0.5) * CELL);
  /** the nearest free cell (a tap on a wall walks you to the wall) */
  const nearestFree = (i: number, j: number): [number, number] | null => {
    if (!grid[j * GW + i]) return [i, j];
    for (let r = 1; r < 24; r++) {
      let best: [number, number] | null = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= GW || b >= GH || grid[b * GW + a]) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [a, b]; }
      }
      if (best) return best;
    }
    return null;
  };
  const clearLine = (a: THREE.Vector2, b: THREE.Vector2) => {
    const d = a.distanceTo(b), n = Math.ceil(d / (CELL * 0.5));
    for (let s = 1; s < n; s++) { const x = a.x + ((b.x - a.x) * s) / n, z = a.y + ((b.y - a.y) * s) / n; if (blockedAt(x, z)) return false; }
    return true;
  };
  /** A* over the grid, then pulled tight (straight lines wherever nothing's in the way) */
  const findPath = (sx: number, sz: number, tx: number, tz: number): THREE.Vector2[] => {
    const start = new THREE.Vector2(sx, sz);
    const [ti0, tj0] = cellOf(tx, tz); const tgt = nearestFree(ti0, tj0); if (!tgt) return [];
    const end = grid[tj0 * GW + ti0] ? centre(tgt[0], tgt[1]) : new THREE.Vector2(tx, tz);
    if (clearLine(start, end)) return [end];
    const [si0, sj0] = cellOf(sx, sz); const src = nearestFree(si0, sj0); if (!src) return [end];
    const N = GW * GH, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const s0 = src[1] * GW + src[0], goal = tgt[1] * GW + tgt[0];
    const h = (k: number) => { const dx = Math.abs((k % GW) - tgt[0]), dz = Math.abs(Math.floor(k / GW) - tgt[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    // a small binary heap of [f, k]
    const heap: [number, number][] = [];
    const push = (f: number, k: number) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g[s0] = 0; push(h(s0), s0);
    let found = false, steps = 0;
    while (heap.length && steps++ < 40000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
      if (k === goal) { found = true; break; }
      const ci = k % GW, cj = Math.floor(k / GW);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const nk = nj * GW + ni; if (grid[nk] || closed[nk]) continue;
        if (di && dj && (grid[cj * GW + ni] || grid[nj * GW + ci])) continue; // no cutting corners
        const ng = g[k] + (di && dj ? 1.414 : 1);
        if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(ng + h(nk), nk); }
      }
    }
    if (!found) return [end];
    const cells: THREE.Vector2[] = []; for (let k = goal; k !== -1 && k !== s0; k = from[k]) cells.push(centre(k % GW, Math.floor(k / GW)));
    cells.reverse(); cells.push(end);
    const out: THREE.Vector2[] = []; let at = start, i = 0;
    while (i < cells.length) { let j = cells.length - 1; while (j > i && !clearLine(at, cells[j])) j--; out.push(cells[j]); at = cells[j]; i = j + 1; }
    return out;
  };

  // ---- you -------------------------------------------------------------------------------------------------------
  const spriteOf = (url: string, scale = 1.3) => {
    const tex = new THREE.TextureLoader().load(url); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 })); s.center.set(0.5, 0); s.scale.set(scale * SPRITE_W, scale, 1);
    return { s, tex };
  };
  const shadowGeo = T(new THREE.CircleGeometry(0.32, 18)), shadowMat = T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.38, depthWrite: false }));
  const shadowOf = () => { const m = new THREE.Mesh(shadowGeo, shadowMat); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m; };
  const meS = spriteOf(o.explorerUrl); T(meS.tex); T(meS.s.material); const me = meS.s; scene.add(me);
  const meShadow = shadowOf(); scene.add(meShadow);
  const P = { x: world.start.x, z: world.start.z, face: world.start.face ?? 1, walk: 0, moving: false, path: [] as THREE.Vector2[], stick: null as THREE.Vector2 | null, keys: { x: 0, z: 0 } };
  const ring = new THREE.Mesh(T(new THREE.RingGeometry(0.24, 0.34, 28)), T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0.85, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);

  // ---- other players ---------------------------------------------------------------------------------------------
  type O = { s: THREE.Sprite; tex: THREE.Texture; tag: THREE.Sprite; sh: THREE.Mesh; x: number; z: number; tx: number; tz: number; face: number; walk: number; act: string | null; fresh: number };
  const others = new Map<string, O>();
  const nameTag = (name: string) => {
    const t = canvasTex(256, 56, (g) => {
      g.font = '800 26px ui-rounded, system-ui, sans-serif'; const w = Math.min(250, g.measureText(name).width + 24);
      g.fillStyle = 'rgba(10,6,30,0.75)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 42, 21); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 28);
    });
    bag.splice(bag.indexOf(t), 1); // owned by the tag (freed with it)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(1.3, 0.28, 1); sp.renderOrder = 5; return sp;
  };
  const dropOther = (id: string) => {
    const x = others.get(id); if (!x) return;
    scene.remove(x.s, x.tag, x.sh); x.tex.dispose(); x.s.material.dispose(); x.tag.material.map?.dispose(); x.tag.material.dispose(); others.delete(id);
  };
  const setOthers = (list: Other[]) => {
    const keep = new Set(list.map((x) => x.id));
    for (const id of [...others.keys()]) if (!keep.has(id)) dropOther(id);
    for (const it of list) {
      let x = others.get(it.id);
      if (!x) {
        const { s, tex } = spriteOf(it.url); const tag = nameTag(it.name), sh = shadowOf();
        scene.add(s, tag, sh);
        x = { s, tex, tag, sh, x: it.x, z: it.z, tx: it.x, tz: it.z, face: 1, walk: 0, act: it.act ?? null, fresh: 0 };
        others.set(it.id, x);
      }
      // the heartbeat's position is a few seconds old: only use it when the live stream has gone quiet
      if (performance.now() - x.fresh > 3000) { x.tx = it.x; x.tz = it.z; x.act = it.act ?? null; }
    }
  };
  const moveOther = (id: string, x: number, z: number, face?: number, act?: string | null) => {
    const ot = others.get(id); if (!ot) return;
    ot.tx = x; ot.tz = z; ot.fresh = performance.now(); if (face) ot.face = face; if (act !== undefined) ot.act = act;
  };
  const speech = speechBubbles(scene);

  // ---- characters who aren't players, in the explorer style ------------------------------------------------------
  type N = { s: THREE.Sprite; tex: THREE.Texture; sh: THREE.Mesh; route: Npc['route']; i: number; x: number; z: number; wait: number; speed: number; face: number; walk: number; base: number };
  const npcs = new Map<string, N>();
  const setNpcs = (list: Npc[]) => {
    const keep = new Set(list.map((n) => n.id));
    for (const [id, n] of npcs) if (!keep.has(id)) { scene.remove(n.s, n.sh); n.tex.dispose(); n.s.material.dispose(); npcs.delete(id); }
    for (const it of list) {
      if (npcs.has(it.id) || !it.route.length) continue;
      const scale = it.scale ?? 1.22; const { s, tex } = spriteOf(it.url, scale); const sh = shadowOf();
      const p0 = it.route[0]; s.position.set(p0.x, 0, p0.z); scene.add(s, sh);
      npcs.set(it.id, { s, tex, sh, route: it.route, i: 0, x: p0.x, z: p0.z, wait: (p0.wait ?? 1) * kit.rnd(), speed: it.speed ?? 1.4, face: 1, walk: kit.rnd() * 6, base: scale });
    }
  };

  // ---- feedback: ink bursts and numbers that pop ---------------------------------------------------------------
  type Bit = { m: THREE.Mesh; v: THREE.Vector3; life: number; spin: number };
  const bits: Bit[] = [];
  const bitGeo = T(new THREE.PlaneGeometry(0.11, 0.11));
  const bitMats = new Map<string, THREE.MeshBasicMaterial>();
  const bitMat = (c: string) => { let m = bitMats.get(c); if (!m) { m = T(new THREE.MeshBasicMaterial({ color: c, transparent: true, side: THREE.DoubleSide, depthWrite: false })); bitMats.set(c, m); } return m; };
  const burst = (x: number, y: number, z: number, colors: string[] = LOGO_INK, n = 26) => {
    if (o.reduceMotion) n = Math.min(n, 8);
    for (let i = 0; i < n && bits.length < 220; i++) {
      const m = new THREE.Mesh(bitGeo, bitMat(colors[i % colors.length]).clone()); m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, up = 1.6 + Math.random() * 2.6, out = 0.8 + Math.random() * 1.8;
      bits.push({ m, v: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out), life: 0.9 + Math.random() * 0.5, spin: (Math.random() - 0.5) * 14 }); scene.add(m);
    }
  };
  type Pop = { s: THREE.Sprite; life: number; vy: number };
  const pops: Pop[] = [];
  const pop = (text: string, x: number, y: number, z: number, color = '#FFE14D') => {
    const t = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d')!;
      g.font = '900 56px "Unbounded Variable", ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(10,6,20,0.85)'; g.strokeText(text, 128, 50); g.fillStyle = color; g.fillText(text, 128, 50); return c;
    })());
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.renderOrder = 9;
    s.position.set(x, y, z); s.scale.set(1.2, 0.45, 1); scene.add(s); pops.push({ s, life: 1.4, vy: 1.2 });
  };

  // ---- input -----------------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const go = (x: number, z: number) => { P.path = findPath(P.x, P.z, x, z); P.stick = null; ring.visible = P.path.length > 0; const e = P.path[P.path.length - 1]; if (e) ring.position.set(e.x, 0.03, e.y); };
  let down: { x: number; y: number; t: number; id: number } | null = null;
  const pd = (e: PointerEvent) => { if (zoom.on) return; down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; };
  const pm = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id || zoom.on) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, d = Math.hypot(dx, dy);
    if (d > 14) { P.stick = new THREE.Vector2(dx / Math.max(d, 60), dy / Math.max(d, 60)); P.path = []; ring.visible = false; }
  };
  const pu = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const wasStick = !!P.stick; P.stick = null;
    const tap = !wasStick && performance.now() - down.t < 500; down = null;
    if (!tap || zoom.on) return;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const t of world.taps ?? []) if (t.obj.visible && ray.intersectObject(t.obj, true).length) { walkTo(t.spot); return; }
    const h = ray.intersectObjects(world.floors, true)[0]; if (h) go(h.point.x, h.point.z);
  };
  const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  const kd = (e: KeyboardEvent) => { if (typing(e)) return; const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') P.keys.x = -1; if (k === 'd' || k === 'arrowright') P.keys.x = 1; if (k === 'w' || k === 'arrowup') P.keys.z = -1; if (k === 's' || k === 'arrowdown') P.keys.z = 1; };
  const ku = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) P.keys.x = 0; if (['w', 's', 'arrowup', 'arrowdown'].includes(k)) P.keys.z = 0; };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  const spotById = (id: string) => world.spots.find((s) => s.id === id);
  const walkTo = (id: string) => { const s = spotById(id); if (s && !zoom.on) go(s.x, s.z); };

  // ---- the camera ------------------------------------------------------------------------------------------------
  const camPos = new THREE.Vector3(P.x, cam.height, P.z + cam.back + 4), camLook = new THREE.Vector3(P.x, 1, P.z - cam.look);
  const zoom = { on: false, k: 0, f: null as Focus | null, resolve: null as null | (() => void) };
  const resize = () => {
    const r = o.canvas.getBoundingClientRect(); if (!r.width) return;
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.fov = cam.fov + tallness() * (cam.fovTall ?? 0); camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();

  const step = (dx: number, dz: number) => {
    const nx = P.x + dx, nz = P.z + dz;
    if (!blockedAt(nx, nz)) { P.x = nx; P.z = nz; return true; }
    if (Math.abs(dx) > 1e-4 && !blockedAt(nx, P.z)) { P.x = nx; return true; }
    if (Math.abs(dz) > 1e-4 && !blockedAt(P.x, nz)) { P.z = nz; return true; }
    return false;
  };
  let near: string | null = null;
  let raf = 0, last = performance.now(), t = 0, paused = false;
  const tmp = new THREE.Vector3(), look = new THREE.Vector3();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!fps.ready(performance.now())) return;
    if (paused) { last = now; return; }
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now; t += dt;
    tune(raw);
    const speed = 4.2;
    P.moving = false;
    if (!zoom.on) {
      const kx = P.keys.x || P.stick?.x || 0, kz = P.keys.z || P.stick?.y || 0;
      if (kx || kz) {
        const l = Math.hypot(kx, kz), s = Math.min(1, l) * speed * dt;
        P.moving = step((kx / l) * s, (kz / l) * s); if (Math.abs(kx) > 0.1) P.face = kx > 0 ? 1 : -1; P.path = []; ring.visible = false;
      } else if (P.path.length) {
        const tgt = P.path[0], dx = tgt.x - P.x, dz = tgt.y - P.z, d = Math.hypot(dx, dz);
        if (d < 0.05) P.path.shift();
        else { const s = Math.min(d, speed * dt); P.moving = step((dx / d) * s, (dz / d) * s); if (!P.moving) P.path = []; if (Math.abs(dx) > 0.05) P.face = dx > 0 ? 1 : -1; }
        if (!P.path.length) ring.visible = false;
      }
      if (P.moving) P.walk += dt * 10;
    }
    me.position.set(P.x, P.moving && !o.reduceMotion ? Math.abs(Math.sin(P.walk)) * 0.08 : 0, P.z);
    meS.tex.repeat.x = P.face; meS.tex.offset.x = P.face < 0 ? 1 : 0;
    meShadow.position.set(P.x, 0.012, P.z);
    ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    // where you're standing
    let at: string | null = null;
    if (!P.moving && !P.path.length) { let best = Infinity; for (const s of world.spots) { if (s.off) continue; const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < (s.r ?? 1.1) && d < best) { best = d; at = s.id; } } }
    if (at !== near && !zoom.on) { near = at; o.onNear?.(at); }
    // the camera: up behind you (further back on a tall phone screen), or framing what you're at
    const tall = 1 + tallness() * (cam.tall ?? 0.24);
    const follow = tmp.set(P.x * cam.side, cam.height * tall, P.z + cam.back * tall);
    const baseLook = look.set(P.x * (cam.side + (1 - cam.side) * 0.6), 0.9, P.z - cam.look);
    zoom.k += ((zoom.on ? 1 : 0) - zoom.k) * Math.min(1, dt * 3.2);
    if (zoom.on && zoom.k > 0.97 && zoom.resolve) { const r = zoom.resolve; zoom.resolve = null; r(); }
    if (zoom.f) {
      const k = zoom.k * zoom.k * (3 - 2 * zoom.k);
      camPos.lerpVectors(follow, zoom.f.at, k); camLook.lerpVectors(baseLook, zoom.f.look, k);
      if (!zoom.on && zoom.k < 0.02) zoom.f = null;
    } else { camPos.lerp(follow, Math.min(1, dt * 4.5)); camLook.lerp(baseLook, Math.min(1, dt * 5)); }
    camera.position.copy(camPos); camera.lookAt(camLook);
    // while the camera frames something, you step out of the shot
    me.visible = meShadow.visible = !(zoom.f && zoom.k > 0.3);
    // others glide to where they are
    for (const x of others.values()) {
      const dx = x.tx - x.x, dz = x.tz - x.z, d = Math.hypot(dx, dz), mv = d > 0.03;
      if (mv) { const s = Math.min(d, Math.max(speed, d * 3) * dt); x.x += (dx / d) * s; x.z += (dz / d) * s; x.walk += dt * 10; if (Math.abs(dx) > 0.03) x.face = dx > 0 ? 1 : -1; }
      x.s.position.set(x.x, mv && !o.reduceMotion ? Math.abs(Math.sin(x.walk)) * 0.08 : 0, x.z);
      x.tex.repeat.x = x.face; x.tex.offset.x = x.face < 0 ? 1 : 0;
      x.tag.position.set(x.x, 1.62, x.z); x.sh.position.set(x.x, 0.012, x.z);
    }
    // characters who aren't players walk their rounds, stopping to look
    for (const n of npcs.values()) {
      if (n.wait > 0) { n.wait -= dt; } else {
        const tg = n.route[n.i], dx = tg.x - n.x, dz = tg.z - n.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { n.wait = tg.wait ?? 0; n.i = (n.i + 1) % n.route.length; }
        else { const s = Math.min(d, n.speed * dt); n.x += (dx / d) * s; n.z += (dz / d) * s; n.walk += dt * 9; if (Math.abs(dx) > 0.03) n.face = dx > 0 ? 1 : -1; }
      }
      const mv = n.wait <= 0;
      n.s.position.set(n.x, mv && !o.reduceMotion ? Math.abs(Math.sin(n.walk)) * 0.07 : 0, n.z);
      n.tex.repeat.x = n.face; n.tex.offset.x = n.face < 0 ? 1 : 0; n.sh.position.set(n.x, 0.012, n.z);
    }
    speech.tick((id) => { if (id === 'me') return { x: P.x, y: 1.55, z: P.z }; const x = others.get(id); return x ? { x: x.x, y: 1.8, z: x.z } : null; });
    // anything between the camera and you (or what it's framing) fades out of the way
    const subj = zoom.f ? zoom.f.subject ?? null : null, rx = subj ? subj.x : P.x, rz = subj ? subj.z : P.z, reach = subj ? 2.2 : 3.0;
    for (let i = fadeables.length - 1; i >= 0; i--) {
      const f = fadeables[i];
      if (!f.o.parent) { fadeables.splice(i, 1); continue; }
      const b = f.box;
      const want = (!zoom.f || subj) && b.min.z > rz + 0.25 && b.min.z < camPos.z && b.max.x > rx - reach && b.min.x < rx + reach ? 0.1 : 1;
      // (framing something, even a wall's outline goes)
      if (Math.abs(f.k - want) > 0.01 || f.framing !== !!subj) {
        f.framing = !!subj;
        f.k += (want - f.k) * Math.min(1, dt * 8);
        if (Math.abs(f.k - want) <= 0.01) f.k = want;
        const k = f.k, keep = f.framing ? 0 : 1;
        f.o.traverse((c) => {
          const mesh = c as THREE.Mesh; if (!mesh.isMesh) return; const m = mesh.material as THREE.Material;
          // (lettering goes all the way: a ghost of a sign reads as writing on the floor)
          const a = mesh.userData.vanish ? Math.max(0, (k - 0.1) / 0.9) : Math.max(k, ((mesh.userData.minFade as number | undefined) ?? 0) * keep);
          const solid = (mesh.userData.alpha as number | undefined) ?? 1;
          if (mesh.userData.alpha === undefined) { mesh.userData.alpha = m.transparent ? m.opacity : 1; mesh.userData.wasT = m.transparent; mesh.userData.wasDW = m.depthWrite; }
          // (an opaque material's shader forces full alpha, so switching it to see-through needs a new shader)
          const tr = a < 0.99 || !!mesh.userData.wasT; if (tr !== m.transparent) { m.transparent = tr; m.needsUpdate = true; }
          m.opacity = a * solid; m.depthWrite = a > 0.5 && !!mesh.userData.wasDW; mesh.visible = a > 0.005;
        });
      }
    }
    // ink bits fly and fall; numbers rise and fade
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; b.life -= dt;
      if (b.life <= 0) { scene.remove(b.m); (b.m.material as THREE.Material).dispose(); bits.splice(i, 1); continue; }
      b.v.y -= 7.5 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.z += b.spin * dt; b.m.lookAt(camera.position);
      (b.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, b.life * 2.2);
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= dt;
      if (p.life <= 0) { scene.remove(p.s); p.s.material.map?.dispose(); p.s.material.dispose(); pops.splice(i, 1); continue; }
      p.s.position.y += p.vy * dt; p.vy *= 0.96; p.s.material.opacity = Math.min(1, p.life * 1.6);
      const k = 1 + Math.max(0, p.life - 1.2) * 2; p.s.scale.set(1.2 * k, 0.45 * k, 1);
    }
    world.update?.(t, dt, P);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    kit, world,
    setOthers, moveOther, setNpcs, burst, pop,
    say: (id: string, text: string) => { if (id === 'me' || others.has(id)) speech.say(id, text); },
    walkTo,
    /** the camera glides in to frame a spot (its `focus`, or a focus you give) */
    focus(f: string | Focus) {
      const f0 = typeof f === 'string' ? spotById(f)?.focus : f; if (!f0) return Promise.resolve();
      // on a tall screen, back away from what's framed (same angles) so all of it fits across
      const s = f0.subject ? 1 + tallness() * 0.6 : 1;
      const ff: Focus = f0.subject && s > 1
        ? { at: f0.at.clone().sub(f0.subject).multiplyScalar(s).add(f0.subject), look: f0.look.clone().sub(f0.subject).multiplyScalar(s).add(f0.subject), subject: f0.subject }
        : f0;
      zoom.f = ff; zoom.on = true; P.path = []; P.stick = null; ring.visible = false;
      return new Promise<void>((res) => { zoom.resolve = res; });
    },
    unfocus() { zoom.on = false; if (zoom.resolve) { const r = zoom.resolve; zoom.resolve = null; r(); } },
    /** hold still behind something that covers it */ setPaused(p: boolean) { paused = p; },
    /** walls moved (a door opened, a room was added) */ setSolids(r: Rect[]) { solids = r.slice(); buildGrid(); },
    /** where you are (for the live room) */ pose: () => ({ x: P.x, z: P.z, face: P.face, moving: P.moving || P.path.length > 0 || !!P.stick }),
    /** put you somewhere (arriving through a door) */ place(x: number, z: number, face?: 1 | -1) {
      P.x = x; P.z = z; P.path = []; if (face) P.face = face;
      const tl = 1 + tallness() * (cam.tall ?? 0.24); camPos.set(P.x * cam.side, cam.height * tl, P.z + cam.back * tl + 1.2); camLook.set(P.x * cam.side, 0.9, P.z - cam.look);
    },
    debug: () => ({ x: P.x, z: P.z, near, path: P.path.length, others: others.size, npcs: npcs.size, zoom: zoom.on,
      fades: fadeables.map((f) => ({ k: +f.k.toFixed(2), z0: +f.box.min.z.toFixed(2), z1: +f.box.max.z.toFixed(2), x0: +f.box.min.x.toFixed(2), x1: +f.box.max.x.toFixed(2) })), cam: camPos.toArray().map((v) => +v.toFixed(2)) }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      for (const id of [...others.keys()]) dropOther(id);
      setNpcs([]);
      for (const b of bits) { scene.remove(b.m); (b.m.material as THREE.Material).dispose(); }
      for (const p of pops) { p.s.material.map?.dispose(); p.s.material.dispose(); }
      speech.dispose();
      world.dispose?.();
      scene.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.geometry?.dispose(); const mat = m.material; (Array.isArray(mat) ? mat : [mat]).forEach((x) => x?.dispose()); } });
      for (const x of bag) x.dispose();
      renderer.dispose();
    },
  };
}
export type PlaceScene = ReturnType<typeof createPlace>;
