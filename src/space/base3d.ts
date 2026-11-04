// The base builder's 3D view: your plot (or merged plots) as a little diorama on the world's ground, every
// piece drawn exactly as it stands on the planet. Orbit with one finger, pinch to zoom, two fingers to pan.
// Tap the ground to place, press a piece to pick it up and drag it round (it stacks on whatever's under it).
// The page owns the layout; this just draws it and reports taps and drags.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BaseModule } from '../backend/types';
import { sceneAntialias, sceneDpr } from '../lib/gfx';
import { animateModels, placedModel } from './baseModels';

export type BaseSceneOpts = {
  canvas: HTMLCanvasElement; ground: [string, string]; sky: [string, string]; dark?: boolean; reduceMotion?: boolean;
  /** tapped the ground (metres on the base, and how high the tap landed when it hit a piece), or a piece */
  onTap?(at: { x: number; y: number; z: number; id: string | null }): void;
  /** a piece was pressed: return true to pick it up and drag it */
  onGrab?(id: string): boolean;
  /** where the dragged piece should go (metres on the base) */ onDrag?(id: string, x: number, y: number): void;
  onDragEnd?(id: string): void;
};

export function createBaseScene(o: BaseSceneOpts) {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr(2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.sky[0]);
  scene.fog = new THREE.Fog(o.sky[1], 70, 220);
  // soft reflections, so metal, chrome and glass look like what they are
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environment = envTex; scene.environmentIntensity = 0.45; pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  const controls = new OrbitControls(camera, o.canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.maxPolarAngle = Math.PI / 2 - 0.04; controls.minDistance = 3; controls.maxDistance = 140;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  scene.add(new THREE.HemisphereLight(o.sky[1], o.ground[1], o.dark ? 0.7 : 1));
  scene.add(new THREE.AmbientLight('#ffffff', o.dark ? 0.3 : 0.2));
  const sun = new THREE.DirectionalLight('#FFF6E4', 2.4); sun.position.set(30, 50, 20); scene.add(sun);

  // the ground round the base, the base itself, and its grid
  const world = new THREE.Mesh(new THREE.CircleGeometry(260, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: o.ground[1], roughness: 1 }));
  world.position.y = -0.02; scene.add(world);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(o.ground[0]).lerp(new THREE.Color('#3a3f52'), 0.35), roughness: 0.95 }));
  scene.add(floor);
  let grid: THREE.LineSegments | null = null;
  const pieces = new THREE.Group(); scene.add(pieces);
  const selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#FFE36B')); selBox.visible = false; scene.add(selBox);
  const ghost = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#FFE36B', transparent: true, opacity: 0.8, depthTest: false }));
  ghost.visible = false; ghost.renderOrder = 10; scene.add(ghost);

  let W = 8, H = 8;
  const toScene = (x: number, y: number) => new THREE.Vector3(x - W / 2, 0, H / 2 - y);
  const setSize = (w: number, h: number, plotM: number) => {
    W = w; H = h;
    floor.scale.set(W, 1, H);
    if (grid) { scene.remove(grid); grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); }
    const pts: number[] = [], cols: number[] = [];
    const major = (v: number) => Math.abs(v / plotM - Math.round(v / plotM)) < 1e-6;
    const push = (c: number) => cols.push(c, c, c, c, c, c);
    for (let x = 0; x <= W + 1e-6; x += 1) { pts.push(x - W / 2, 0.012, -H / 2, x - W / 2, 0.012, H / 2); push(major(x) ? 0.6 : 0.22); }
    for (let y = 0; y <= H + 1e-6; y += 1) { pts.push(-W / 2, 0.012, y - H / 2, W / 2, 0.012, y - H / 2); push(major(y) ? 0.6 : 0.22); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 })); scene.add(grid);
  };
  const view = (kind: 'home' | 'top' = 'home') => {
    const span = Math.max(W, H);
    controls.target.set(0, 0, 0);
    if (kind === 'top') camera.position.set(0, span * 1.5 + 6, 0.01);
    else camera.position.set(span * 0.75 + 4, span * 0.75 + 5, span * 0.95 + 6);
    controls.update();
  };

  // pieces: rebuilt only when what they look like changes
  const objs = new Map<string, { sig: string; obj: THREE.Object3D }>();
  let sel: string | null = null;
  const setLayout = (layout: BaseModule[], selected: string | null) => {
    const keep = new Set<string>();
    for (const m of layout) {
      keep.add(m.id);
      const sig = `${m.k}|${m.c}|${m.c2}|${m.m}|${m.v}|${m.sx}|${m.sy}|${m.sz}|${m.a ?? (m.r ?? 0) * 90}|${m.z}`;
      let have = objs.get(m.id);
      if (!have || have.sig !== sig) {
        if (have) pieces.remove(have.obj);
        const obj = placedModel(m); obj.userData.id = m.id;
        obj.traverse((x) => { x.userData.id = m.id; });
        pieces.add(obj); have = { sig, obj }; objs.set(m.id, have);
      }
      have.obj.position.copy(toScene(m.x, m.y));
    }
    for (const [id, x] of objs) if (!keep.has(id)) { pieces.remove(x.obj); objs.delete(id); }
    sel = selected;
    const s = sel ? objs.get(sel) : null;
    selBox.visible = !!s; if (s) { s.obj.updateMatrixWorld(true); selBox.box.setFromObject(s.obj).expandByScalar(0.08); }
  };

  // taps, picks and drags
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aim = (cx: number, cy: number) => { const r = o.canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
  const onPlane = (y: number) => { const p = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null; };
  const hitPiece = () => { const h = ray.intersectObject(pieces, true)[0]; return h ? { id: h.object.userData.id as string, point: h.point, normal: h.face?.normal } : null; };
  const pointers = new Set<number>();
  let down: { x: number; y: number; t: number } | null = null;
  let drag: { id: string; dx: number; dz: number; y: number } | null = null;
  const pd = (e: PointerEvent) => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) { if (drag) { o.onDragEnd?.(drag.id); drag = null; controls.enabled = true; } down = null; return; }
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    aim(e.clientX, e.clientY);
    const h = hitPiece();
    if (h && o.onGrab?.(h.id)) {
      const obj = objs.get(h.id)?.obj; if (!obj) return;
      const y = obj.children[0]?.position.y ?? 0;
      const p = onPlane(y) ?? h.point;
      drag = { id: h.id, dx: obj.position.x - p.x, dz: obj.position.z - p.z, y };
      controls.enabled = false;
    }
  };
  const pm = (e: PointerEvent) => {
    if (!drag) return;
    aim(e.clientX, e.clientY);
    const p = onPlane(drag.y); if (!p) return;
    o.onDrag?.(drag.id, p.x + drag.dx + W / 2, H / 2 - (p.z + drag.dz));
  };
  const pu = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    const wasDrag = drag;
    if (drag) { o.onDragEnd?.(drag.id); drag = null; controls.enabled = true; }
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 450) {
      aim(e.clientX, e.clientY);
      const h = hitPiece();
      if (wasDrag) { /* a press without moving: it was a tap on the piece */ o.onTap?.({ x: 0, y: 0, z: 0, id: wasDrag.id }); }
      else if (h) {
        // tapped on top of a piece: report where on it (so new pieces can stack)
        o.onTap?.({ x: h.point.x + W / 2, y: H / 2 - h.point.z, z: Math.max(0, h.point.y), id: h.id });
      } else {
        const p = onPlane(0); if (p) o.onTap?.({ x: p.x + W / 2, y: H / 2 - p.z, z: 0, id: null });
      }
    }
    down = null;
  };
  o.canvas.addEventListener('pointerdown', pd, { capture: true });
  o.canvas.addEventListener('pointermove', pm);
  o.canvas.addEventListener('pointerup', pu);
  o.canvas.addEventListener('pointercancel', pu);

  const resize = () => {
    const r = o.canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, t = 0, last = performance.now(), ghostAt: THREE.Vector3 | null = null;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    controls.update();
    if (!o.reduceMotion) animateModels(pieces, t);
    if (sel) { const s = objs.get(sel); if (s) { s.obj.updateMatrixWorld(true); selBox.box.setFromObject(s.obj).expandByScalar(0.08); } }
    ghost.visible = !!ghostAt; if (ghostAt) { ghost.position.copy(ghostAt).setY(ghostAt.y + 0.03); ghost.scale.setScalar(1 + 0.12 * Math.sin(t * 5)); }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  view();

  return {
    setSize, setLayout, view,
    /** a pulsing ring where the next piece would land (metres on the base), or none */
    ghost(at: { x: number; y: number; z?: number } | null) { ghostAt = at ? toScene(at.x, at.y).setY(at.z ?? 0) : null; },
    /** the height of the top of a piece (to stack on it) */
    topOf(id: string) { const s = objs.get(id); if (!s) return 0; s.obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(s.obj).max.y; },
    /** where a spot on the base is on screen (client pixels) */
    screenOf(x: number, y: number, z = 0) { const v = toScene(x, y).setY(z).project(camera); const r = o.canvas.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    snapshot() { renderer.render(scene, camera); return o.canvas.toDataURL('image/jpeg', 0.8); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      o.canvas.removeEventListener('pointerdown', pd, { capture: true } as EventListenerOptions);
      o.canvas.removeEventListener('pointermove', pm); o.canvas.removeEventListener('pointerup', pu); o.canvas.removeEventListener('pointercancel', pu);
      scene.traverse((x) => { if (x instanceof THREE.Mesh && (x === world || x === floor || x === ghost)) { x.geometry.dispose(); (x.material as THREE.Material).dispose(); } });
      if (grid) { grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); }
      envTex.dispose(); renderer.dispose();
    },
  };
}
export type BaseScene = ReturnType<typeof createBaseScene>;
