// The farmyard in 3D: tilled beds in rows, crops that visibly grow (a mound, sprouts, a plant, then the
// ripe crop with a sparkle), a red barn and silo, fences, trees, a pond, a scarecrow, clouds, and
// chickens and sheep pottering about. Drag to look around, pinch or scroll to zoom, tap a bed.
// The sky follows the time of day where you are.
import * as THREE from 'three';
import type { FarmBed, FarmCrop } from '../backend/types';

export type FarmSceneOpts = {
  canvas: HTMLCanvasElement; beds: number; explorerUrl: string; seed: number; reduceMotion?: boolean;
  onPick(idx: number | null): void;
};
export type FarmScene = {
  /** what's in every bed now (progress worked out from the times) */ setBeds(beds: FarmBed[], crops: Record<string, FarmCrop>, now: number): void;
  setBedCount(n: number): void;
  select(idx: number | null): void;
  /** a little burst over a bed: water drops or what you harvested */ burst(idx: number, kind: 'water' | 'harvest' | 'plant', emojis?: string[]): void;
  dispose(): void;
};

const BED = 2.4, GAP = 0.7, COLS = 6;
const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

function emojiSprite(e: string, size = 0.8) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; g.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.setScalar(size);
  return s;
}

export function createFarm(o: FarmSceneOpts): FarmScene {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: !/Mobi|Android/i.test(navigator.userAgent), powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !/Mobi|Android/i.test(navigator.userAgent);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
  const disposables: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { disposables.push(x); return x; };
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }));
  const R = rng(o.seed);

  // ---- sky and light: the time of day where you are -------------------------------------------------
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  const day = Math.max(0, Math.min(1, Math.sin(((hour - 6) / 12) * Math.PI) * 1.4));
  const dusk = Math.max(0, 1 - Math.abs(hour - 19) / 1.5) + Math.max(0, 1 - Math.abs(hour - 6.5) / 1.5);
  const skyCol = new THREE.Color('#0E1640').lerp(new THREE.Color('#8FD3FF'), day).lerp(new THREE.Color('#FF9E6B'), Math.min(0.5, dusk * 0.5));
  scene.background = skyCol;
  scene.fog = new THREE.Fog(skyCol, 60, 160);
  const hemi = new THREE.HemisphereLight('#ffffff', '#5A7A3A', 0.35 + 0.55 * day); scene.add(hemi);
  const sun = new THREE.DirectionalLight(day > 0.1 ? '#FFF2D6' : '#9DB3FF', 0.4 + 1.6 * day);
  sun.position.set(18, 30, 12); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
  scene.add(sun);
  if (day < 0.3) { // a moon and some stars at night
    const stars = new THREE.Points(T(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 900 }, () => (R() - 0.5) * 400).map((v, i) => (i % 3 === 1 ? Math.abs(v) * 0.4 + 40 : v)), 3))), T(new THREE.PointsMaterial({ color: '#ffffff', size: 0.6 })));
    scene.add(stars);
  }

  // ---- the ground, paths, pond, trees, fence, barn ----------------------------------------------------
  const grass = new THREE.Mesh(T(new THREE.CircleGeometry(140, 48)), mat('#6CB84A')); grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
  const field = new THREE.Group(); scene.add(field);
  const soilGeo = T(new THREE.BoxGeometry(BED, 0.35, BED));
  const soilMat = mat('#7A4B2A'), wetMat = mat('#4E2F1A'), selMat = mat('#9A6238', { emissive: '#FFE36B', emissiveIntensity: 0.35 });
  const furrowGeo = T(new THREE.BoxGeometry(BED * 0.9, 0.05, 0.12)), furrowMat = mat('#5E3820');
  const pathMat = mat('#CDB98A');
  let beds: { box: THREE.Mesh; plants: THREE.Group; key: string; pos: THREE.Vector3; sparkle: THREE.Sprite | null; bed: FarmBed | null }[] = [];
  let bedCount = 0, sel: number | null = null;
  const bedPos = (i: number, n: number) => {
    const cols = Math.min(COLS, n), rows = Math.ceil(n / COLS);
    const c = i % COLS, r = Math.floor(i / COLS);
    return new THREE.Vector3((c - (cols - 1) / 2) * (BED + GAP), 0.17, (r - (rows - 1) / 2) * (BED + GAP) + 2);
  };
  let fieldW = 10, fieldD = 10;
  const extras = new THREE.Group(); scene.add(extras);
  const buildField = (n: number) => {
    for (const b of beds) { field.remove(b.box, b.plants); if (b.sparkle) { field.remove(b.sparkle); b.sparkle.material.map?.dispose(); b.sparkle.material.dispose(); } }
    for (const c of [...extras.children]) { extras.remove(c); }
    beds = [];
    bedCount = n;
    for (let i = 0; i < n; i++) {
      const box = new THREE.Mesh(soilGeo, soilMat); box.position.copy(bedPos(i, n)); box.castShadow = box.receiveShadow = true; box.userData.idx = i;
      for (let k = -1; k <= 1; k++) { const f = new THREE.Mesh(furrowGeo, furrowMat); f.position.set(0, 0.18, k * 0.7); box.add(f); }
      const plants = new THREE.Group(); plants.position.copy(box.position).setY(0.35);
      field.add(box, plants);
      beds.push({ box, plants, key: '', pos: box.position.clone(), sparkle: null, bed: null });
    }
    const cols = Math.min(COLS, n), rows = Math.ceil(n / COLS);
    fieldW = cols * (BED + GAP) + 2; fieldD = rows * (BED + GAP) + 2;
    // a path round the field
    const path = new THREE.Mesh(T(new THREE.PlaneGeometry(fieldW + 2, fieldD + 2)), pathMat); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.01, 2); path.receiveShadow = true; extras.add(path);
    // fence
    const postGeo = T(new THREE.BoxGeometry(0.18, 1.1, 0.18)), railGeo = T(new THREE.BoxGeometry(1, 0.1, 0.08)), wood = mat('#B07A47');
    const fw = fieldW + 4, fd = fieldD + 4;
    const fencePts: [number, number, number][] = [];
    for (let x = -fw / 2; x <= fw / 2 + 0.01; x += 2) { fencePts.push([x, -fd / 2 + 2, 0], [x, fd / 2 + 2, 0]); }
    for (let z = -fd / 2; z <= fd / 2 + 0.01; z += 2) { fencePts.push([-fw / 2, z + 2, 1], [fw / 2, z + 2, 1]); }
    for (const [x, z, side] of fencePts) {
      if (side === 0 && Math.abs(x) < 1.2 && z > 2) continue; // the gate
      const p = new THREE.Mesh(postGeo, wood); p.position.set(x, 0.55, z); p.castShadow = true; extras.add(p);
      for (const y of [0.45, 0.85]) { const r = new THREE.Mesh(railGeo, wood); r.scale.x = 2; r.position.set(side ? x : x + 1, y, side ? z + 1 : z); if (side) r.rotation.y = Math.PI / 2; if ((side ? z + 1 : x + 1) <= (side ? fd / 2 + 2 : fw / 2)) extras.add(r); }
    }
    // the barn and silo behind the field
    const barn = new THREE.Group();
    const walls = new THREE.Mesh(T(new THREE.BoxGeometry(6, 4, 5)), mat('#C8352C')); walls.position.y = 2; walls.castShadow = true; barn.add(walls);
    const roof = new THREE.Mesh(T(new THREE.CylinderGeometry(0.01, 4.4, 2.4, 4, 1)), mat('#6B2A22')); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.82); roof.position.y = 5.2; roof.castShadow = true; barn.add(roof);
    const door = new THREE.Mesh(T(new THREE.PlaneGeometry(2.4, 2.8)), mat('#F5EEDC')); door.position.set(0, 1.4, 2.51); barn.add(door);
    const doorX = new THREE.Mesh(T(new THREE.PlaneGeometry(2.1, 2.5)), mat('#C8352C')); doorX.position.set(0, 1.4, 2.52); barn.add(doorX);
    const silo = new THREE.Mesh(T(new THREE.CylinderGeometry(1.3, 1.3, 7, 16)), mat('#D9DEE6', { metalness: 0.4, roughness: 0.4 })); silo.position.set(4.6, 3.5, 0); silo.castShadow = true; barn.add(silo);
    const dome = new THREE.Mesh(T(new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#8E97AD', { metalness: 0.5 })); dome.position.set(4.6, 7, 0); barn.add(dome);
    barn.position.set(-fw / 2 + 2, 0, -fd / 2 - 3); extras.add(barn);
    // a pond and trees round about
    const pond = new THREE.Mesh(T(new THREE.CircleGeometry(4, 24)), mat('#4FA8FF', { roughness: 0.15, metalness: 0.2 })); pond.rotation.x = -Math.PI / 2; pond.position.set(fw / 2 + 7, 0.03, 4); pond.scale.set(1.3, 1, 1); extras.add(pond);
    const trunk = T(new THREE.CylinderGeometry(0.25, 0.35, 2, 6)), crown = T(new THREE.IcosahedronGeometry(1.6, 0)), bark = mat('#7A5233'), leaf = mat('#3E9A44', { flatShading: true });
    const rt = rng(o.seed + 7);
    for (let i = 0; i < 26; i++) {
      const a = rt() * Math.PI * 2, d = Math.max(fw, fd) / 2 + 9 + rt() * 30;
      const t = new THREE.Group(); const tr = new THREE.Mesh(trunk, bark); tr.position.y = 1; const cr = new THREE.Mesh(crown, leaf); cr.position.y = 2.8; cr.scale.setScalar(0.8 + rt() * 0.8);
      tr.castShadow = cr.castShadow = true; t.add(tr, cr); t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d + 2); extras.add(t);
    }
    // a scarecrow keeping watch
    const sc = new THREE.Group();
    const pole = new THREE.Mesh(T(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6)), wood); pole.position.y = 1.3; sc.add(pole);
    const arms = new THREE.Mesh(T(new THREE.BoxGeometry(1.8, 0.1, 0.1)), wood); arms.position.y = 1.9; sc.add(arms);
    const shirt = new THREE.Mesh(T(new THREE.BoxGeometry(0.8, 0.8, 0.4)), mat('#4F7BD9')); shirt.position.y = 1.7; sc.add(shirt);
    const head = new THREE.Mesh(T(new THREE.SphereGeometry(0.3, 10, 8)), mat('#E8C98A')); head.position.y = 2.4; sc.add(head);
    const hat = new THREE.Mesh(T(new THREE.ConeGeometry(0.45, 0.4, 10)), mat('#C9A24A')); hat.position.y = 2.75; sc.add(hat);
    sc.position.set(fw / 2 - 1, 0, -fd / 2 + 3); extras.add(sc);
    fitCamera();
  };

  // ---- crops: shared shapes -----------------------------------------------------------------------
  const G = {
    mound: T(new THREE.SphereGeometry(0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
    sprout: T(new THREE.ConeGeometry(0.06, 0.35, 5)),
    leaf: T(new THREE.ConeGeometry(0.07, 0.6, 4)),
    ball: T(new THREE.SphereGeometry(0.5, 12, 10)),
    small: T(new THREE.SphereGeometry(0.11, 8, 6)),
    stem: T(new THREE.CylinderGeometry(0.05, 0.07, 1, 6)),
    disc: T(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16)),
    cob: T(new THREE.CapsuleGeometry(0.11, 0.35, 4, 8)),
    carrot: T(new THREE.ConeGeometry(0.12, 0.45, 8)),
    pumpkin: T(new THREE.SphereGeometry(0.6, 14, 10)),
  };
  const M = { dirt: mat('#5E3820'), green: mat('#4CAF50', { flatShading: true }), dark: mat('#2E7D32', { flatShading: true }), stem: mat('#7CB342'), brown: mat('#5D4037') };
  const cropMats = new Map<string, THREE.Material>();
  const cmat = (c: string) => { let m = cropMats.get(c); if (!m) { m = mat(c, { roughness: 0.55 }); cropMats.set(c, m); } return m; };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, s = 1) => { const o2 = new THREE.Mesh(g, m); o2.position.set(x, y, z); o2.scale.setScalar(s); o2.castShadow = true; return o2; };
  /** one plant of a crop at a growth stage (0..1) */
  const plant = (crop: string, color: string, p: number, ready: boolean) => {
    const g = new THREE.Group();
    if (p < 0.12) { g.add(mesh(G.mound, M.dirt)); return g; }
    if (p < 0.4) { const s = 0.5 + p * 1.5; for (let k = 0; k < 3; k++) { const l = mesh(G.sprout, M.green, Math.cos(k * 2.1) * 0.06, 0.12 * s, Math.sin(k * 2.1) * 0.06, s); l.rotation.z = (k - 1) * 0.35; g.add(l); } return g; }
    const k = Math.min(1, (p - 0.4) / 0.6), C = cmat(color);
    switch (crop) {
      case 'carrot':
        for (let i = 0; i < 5; i++) { const l = mesh(G.leaf, M.green, Math.cos(i * 1.3) * 0.08, 0.25 + 0.1 * k, Math.sin(i * 1.3) * 0.08, 0.7 + 0.5 * k); l.rotation.z = Math.cos(i) * 0.4; l.rotation.x = Math.sin(i) * 0.4; g.add(l); }
        if (ready || k > 0.7) { const c = mesh(G.carrot, C, 0, 0.02, 0, 1); c.rotation.x = Math.PI; g.add(c); }
        break;
      case 'lettuce':
        g.add(mesh(G.ball, cmat('#8BC34A'), 0, 0.18, 0, 0.35 + 0.3 * k)); for (let i = 0; i < 6; i++) g.add(mesh(G.small, C, Math.cos(i) * 0.22 * k, 0.12, Math.sin(i) * 0.22 * k, 1.4 + k));
        break;
      case 'strawberry':
        g.add(mesh(G.ball, M.dark, 0, 0.15, 0, 0.3 + 0.2 * k)); if (ready || k > 0.6) for (let i = 0; i < 4; i++) g.add(mesh(G.small, C, Math.cos(i * 1.6) * 0.25, 0.1, Math.sin(i * 1.6) * 0.25, 1));
        break;
      case 'sunflower': {
        const h = 0.5 + 1.6 * k; const st = mesh(G.stem, M.stem, 0, h / 2, 0); st.scale.set(1, h, 1); g.add(st);
        const head = mesh(G.disc, ready ? C : M.green, 0, h, 0.05, 0.4 + 0.6 * k); head.rotation.x = Math.PI / 2.4; g.add(head);
        if (ready) { const mid = mesh(G.disc, M.brown, 0, h + 0.02, 0.09, 0.5); mid.rotation.x = Math.PI / 2.4; g.add(mid); }
        break;
      }
      case 'tomato':
        g.add(mesh(G.ball, M.green, 0, 0.3, 0, 0.35 + 0.35 * k)); g.add(mesh(G.stem, M.brown, 0.25, 0.4, 0, 0.8));
        for (let i = 0; i < 5; i++) g.add(mesh(G.small, ready ? C : M.stem, Math.cos(i * 1.25) * 0.3 * (0.5 + k), 0.25 + (i % 2) * 0.2, Math.sin(i * 1.25) * 0.3 * (0.5 + k), 1.2));
        break;
      case 'corn': {
        const h = 0.6 + 1.8 * k;
        for (let i = 0; i < 2; i++) { const st = mesh(G.stem, M.stem, i * 0.25 - 0.12, h / 2, 0); st.scale.set(1.2, h, 1.2); g.add(st); const l = mesh(G.leaf, M.green, i * 0.25 - 0.12, h * 0.6, 0.12, 1.4); l.rotation.x = 1; g.add(l); }
        if (ready || k > 0.7) { const c = mesh(G.cob, C, 0.08, h * 0.55, 0.1); c.rotation.z = 0.4; g.add(c); }
        break;
      }
      case 'pumpkin': case 'melon': {
        for (let i = 0; i < 4; i++) { const l = mesh(G.ball, M.dark, Math.cos(i * 1.6) * 0.45, 0.08, Math.sin(i * 1.6) * 0.45, 0.25); l.scale.y = 0.08; g.add(l); }
        const f = mesh(G.pumpkin, ready ? C : cmat('#9CCC65'), 0, 0.28 + 0.2 * k, 0, 0.3 + 0.75 * k); f.scale.y *= crop === 'pumpkin' ? 0.75 : 0.9; g.add(f);
        if (crop === 'pumpkin') g.add(mesh(G.stem, M.brown, 0, 0.55 + 0.45 * k, 0, 0.18));
        break;
      }
      default:
        g.add(mesh(G.ball, M.green, 0, 0.25, 0, 0.3 + 0.3 * k)); if (ready) g.add(mesh(G.small, C, 0, 0.6, 0, 2));
    }
    return g;
  };
  const fillBed = (b: (typeof beds)[number], bed: FarmBed | null, crop: FarmCrop | undefined, p: number) => {
    for (const c of [...b.plants.children]) b.plants.remove(c);
    if (b.sparkle) { field.remove(b.sparkle); b.sparkle.material.map?.dispose(); b.sparkle.material.dispose(); b.sparkle = null; }
    b.box.material = sel === b.box.userData.idx ? selMat : bed?.watered && !bed.ready ? wetMat : soilMat;
    if (!bed || !crop) return;
    const big = bed.crop === 'pumpkin' || bed.crop === 'melon';
    const spots = big ? [[0, 0]] : [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]];
    for (const [x, z] of spots) { const pl = plant(bed.crop, crop.color, p, bed.ready); pl.position.set(x, 0, z); pl.rotation.y = (x + z) * 3; b.plants.add(pl); }
    if (bed.ready) { b.sparkle = emojiSprite('✨', 0.9); b.sparkle.position.copy(b.pos).setY(2.2); field.add(b.sparkle); }
  };

  // ---- you, and the animals ---------------------------------------------------------------------------
  const meTex = T(new THREE.TextureLoader().load(o.explorerUrl)); meTex.colorSpace = THREE.SRGBColorSpace;
  const me = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true }))); me.center.set(0.5, 0); me.scale.set(1.6, 1.6, 1); me.position.set(0, 0, 8); scene.add(me);
  const meTo = me.position.clone();
  type Critter = { g: THREE.Group; to: THREE.Vector3; wait: number; hop: number; sheep: boolean };
  const critters: Critter[] = [];
  const white = mat('#FAFAFA'), red = mat('#E53935'), wool = mat('#F3F0E8', { flatShading: true }), face = mat('#3B3B3B'), beak = mat('#FFB300');
  const spawnCritter = (sheep: boolean) => {
    const g = new THREE.Group();
    if (sheep) {
      g.add(mesh(T(new THREE.IcosahedronGeometry(0.55, 1)), wool, 0, 0.7, 0)); g.add(mesh(G.small, face, 0, 0.75, 0.55, 2.2));
      for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { const l = mesh(G.stem, face, x, 0.2, z); l.scale.set(0.8, 0.4, 0.8); g.add(l); }
    } else {
      g.add(mesh(G.small, white, 0, 0.35, 0, 2.6)); g.add(mesh(G.small, white, 0, 0.62, 0.18, 1.5)); g.add(mesh(G.small, red, 0, 0.8, 0.18, 0.6)); g.add(mesh(G.small, beak, 0, 0.6, 0.36, 0.45));
    }
    const a = R() * Math.PI * 2; g.position.set(Math.cos(a) * (fieldW / 2 + 4), 0, Math.sin(a) * (fieldD / 2 + 4) + 2);
    scene.add(g); critters.push({ g, to: g.position.clone(), wait: R() * 3, hop: 0, sheep });
  };

  // ---- clouds ---------------------------------------------------------------------------------------------
  const clouds = new THREE.Group(); scene.add(clouds);
  const cloudMat = T(new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: day > 0.2 ? 0.9 : 0.25, flatShading: true }));
  for (let i = 0; i < 9; i++) { const c = new THREE.Group(); for (let k = 0; k < 4; k++) c.add(mesh(G.ball, cloudMat, k * 1.4 - 2, (k % 2) * 0.4, R() * 0.6, 2 + R() * 1.4)); c.position.set((R() - 0.5) * 160, 28 + R() * 14, (R() - 0.5) * 120); clouds.add(c); }

  // ---- camera: orbit round the farm ---------------------------------------------------------------
  let yaw = 0.35, pitch = 0.9, dist = 26, distTo = 26;
  const target = new THREE.Vector3(0, 0, 2);
  function fitCamera() { const portrait = Math.max(1, 1 / Math.max(0.3, camera.aspect)); distTo = Math.max(16, Math.min(90, (Math.max(fieldW, fieldD) * 1.25 + 8) * Math.min(2, portrait * 0.85))); dist = distTo; }
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number; t: number } | null = null, pinch = 0;
  const pd = (e: PointerEvent) => { o.canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); downAt = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } };
  const pm = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    if (pointers.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) distTo = Math.max(10, Math.min(90, distTo * (pinch / d))); pinch = d; return; }
    yaw -= (e.clientX - p.x) * 0.006; pitch = Math.max(0.25, Math.min(1.35, pitch + (e.clientY - p.y) * 0.004)); p.x = e.clientX; p.y = e.clientY;
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pu = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8 && performance.now() - downAt.t < 450) {
      const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(beds.flatMap((b) => [b.box, b.plants]), true)[0];
      let obj: THREE.Object3D | null = hit?.object ?? null; let idx: number | null = null;
      while (obj) { if (obj.userData.idx !== undefined) { idx = obj.userData.idx; break; } const b = beds.find((x) => x.plants === obj); if (b) { idx = b.box.userData.idx; break; } obj = obj.parent; }
      o.onPick(idx);
    }
    downAt = null; pinch = 0;
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); distTo = Math.max(10, Math.min(90, distTo * (e.deltaY > 0 ? 1.1 : 0.9))); };
  o.canvas.addEventListener('pointerdown', pd); o.canvas.addEventListener('pointermove', pm); o.canvas.addEventListener('pointerup', pu); o.canvas.addEventListener('pointercancel', pu); o.canvas.addEventListener('wheel', wheel, { passive: false });

  const resize = () => { const r = o.canvas.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = Math.max(1, r.width) / Math.max(1, r.height); camera.updateProjectionMatrix(); if (fieldW > 10 || fieldD > 10) fitCamera(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();

  buildField(o.beds);
  for (let i = 0; i < 5; i++) spawnCritter(false);
  for (let i = 0; i < 3; i++) spawnCritter(true);

  // bursts
  type Pop = { s: THREE.Object3D; v: THREE.Vector3; life: number; sprite: boolean };
  const pops: Pop[] = [];
  const dropGeo = T(new THREE.SphereGeometry(0.07, 6, 4)), dropMat = T(new THREE.MeshStandardMaterial({ color: '#6EC6FF', transparent: true, opacity: 0.85 }));

  let raf = 0, last = performance.now(), t = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    dist += (distTo - dist) * Math.min(1, dt * 6);
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
    // you walk over to the bed you picked
    me.position.lerp(meTo, Math.min(1, dt * 2.2));
    if (!o.reduceMotion) {
      clouds.children.forEach((c, i) => { c.position.x += dt * (0.6 + (i % 3) * 0.2); if (c.position.x > 90) c.position.x = -90; });
      for (const b of beds) if (b.sparkle) { b.sparkle.position.y = 2.1 + Math.sin(t * 3 + b.pos.x) * 0.15; (b.sparkle.material as THREE.SpriteMaterial).rotation = t; }
      for (const c of critters) {
        c.wait -= dt;
        if (c.wait <= 0) { c.wait = 2 + R() * 5; const a = R() * Math.PI * 2, d = (Math.max(fieldW, fieldD) / 2) + 3 + R() * 9; c.to.set(Math.cos(a) * d, 0, Math.sin(a) * d + 2); }
        const dv = c.to.clone().sub(c.g.position); const len = dv.length();
        if (len > 0.1) { dv.normalize(); c.g.position.addScaledVector(dv, Math.min(len, dt * (c.sheep ? 0.9 : 1.6))); c.g.rotation.y = Math.atan2(dv.x, dv.z); c.hop += dt * (c.sheep ? 8 : 14); c.g.position.y = Math.abs(Math.sin(c.hop)) * (c.sheep ? 0.06 : 0.12); }
        else if (!c.sheep) { c.g.rotation.x = Math.sin(t * 6 + c.g.position.x) > 0.7 ? 0.5 : 0; } // pecking
      }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= dt; p.s.position.addScaledVector(p.v, dt); p.v.y -= (p.sprite ? 0.5 : 9) * dt;
      if (p.sprite) ((p.s as THREE.Sprite).material as THREE.SpriteMaterial).opacity = Math.min(1, p.life);
      if (p.life <= 0) { scene.remove(p.s); if (p.sprite) { const sm = (p.s as THREE.Sprite).material; sm.map?.dispose(); sm.dispose(); } pops.splice(i, 1); }
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setBeds(list, crops, now) {
      if (list.length && Math.max(...list.map((b) => b.idx)) >= bedCount) buildField(Math.max(...list.map((b) => b.idx)) + 1);
      const byIdx = new Map(list.map((b) => [b.idx, b]));
      for (let i = 0; i < beds.length; i++) {
        const b = beds[i], bed = byIdx.get(i) ?? null, crop = bed ? crops[bed.crop] : undefined;
        let p = 0;
        if (bed) { const a = new Date(bed.planted_at).getTime(), z = new Date(bed.ready_at).getTime(); p = bed.ready || now >= z ? 1 : Math.max(0, Math.min(1, (now - a) / Math.max(1, z - a))); }
        const key = bed ? `${bed.crop}:${Math.floor(p * 8)}:${bed.ready || now >= new Date(bed.ready_at).getTime()}:${bed.watered}:${sel === i}` : `empty:${sel === i}`;
        if (key !== b.key) { b.key = key; b.bed = bed; fillBed(b, bed ? { ...bed, ready: bed.ready || now >= new Date(bed.ready_at).getTime() } : null, crop, p); }
      }
    },
    setBedCount(n) { if (n !== bedCount) buildField(n); },
    select(idx) {
      sel = idx;
      for (const b of beds) { b.key = ''; }
      if (idx != null && beds[idx]) { meTo.copy(beds[idx].pos).add(new THREE.Vector3(0, -0.17, BED / 2 + 0.6)); }
    },
    burst(idx, kind, emojis = []) {
      const b = beds[idx]; if (!b) return;
      if (kind === 'water') for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(dropGeo, dropMat); m.position.copy(b.pos).add(new THREE.Vector3((R() - 0.5) * 1.6, 2.4 + R(), (R() - 0.5) * 1.6)); scene.add(m); pops.push({ s: m, v: new THREE.Vector3(0, -2 - R() * 2, 0), life: 0.9, sprite: false }); }
      const list = kind === 'plant' ? ['🌱'] : emojis;
      list.slice(0, 6).forEach((e, i) => { const s = emojiSprite(e, 1); s.position.copy(b.pos).add(new THREE.Vector3((i - list.length / 2) * 0.5, 1.2, 0)); scene.add(s); pops.push({ s, v: new THREE.Vector3((R() - 0.5) * 0.6, 2.4, 0), life: 1.6, sprite: true }); });
    },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); o.canvas.removeEventListener('pointermove', pm); o.canvas.removeEventListener('pointerup', pu); o.canvas.removeEventListener('pointercancel', pu); o.canvas.removeEventListener('wheel', wheel);
      for (const b of beds) if (b.sparkle) { b.sparkle.material.map?.dispose(); b.sparkle.material.dispose(); }
      for (const p of pops) if (p.sprite) { const sm = (p.s as THREE.Sprite).material; sm.map?.dispose(); sm.dispose(); }
      for (const d of disposables) d.dispose();
      for (const m of cropMats.values()) m.dispose();
      renderer.dispose();
    },
  };
}
