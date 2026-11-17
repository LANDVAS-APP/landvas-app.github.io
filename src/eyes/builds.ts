// What each plot has been turned into, standing on it in 3D, so you can see what's what as you walk down the street:
// a neon arcade, a farmyard with its barn and crop rows, a lemonade kiosk (a glass tower when it's grown into an
// Exchange), an Inkborn glade, a house, a station, a mine's timber mouth, a sky island floating over its plot, a
// workshop, a diner, a dungeon's torch-lit stairs, a paint arena… Merged plots (Estates 2×2, Domains 3×3) get the
// grand version: a carnival with a turning Ferris wheel, a castle, a crystal spire, a giant robot.
//
// All of it is two meshes (everything solid in one, everything glowing in another), plus a few small moving parts
// for the places close to you: a whole street of them costs a handful of draws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type BuildSite = {
  key: string;
  /** what the plot is (a PlotKind) and the family it belongs to (an Estate's base type) */
  kind: string; family: string;
  /** 0 a plot type, 1 an Estate (2×2), 2 a Domain (3×3) */
  tier: 0 | 1 | 2;
  /** middle and size (local metres), which way its front faces (radians, 0 = south) */
  x: number; z: number; w: number; d: number; rot: number;
  color: string;
  /** a cell in it (to look the place up), whose it is, what it's called */
  gx: number; gy: number; owner: string | null; name: string | null;
  /** what it's called on its sign ("Farm", "Arcade Carnival") and its emoji */
  label: string; emoji: string;
};

const noUv = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g; };
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** a roof: a triangular prism w wide (x), d deep (z), rising h above y = 0 */
function prism(w: number, d: number, h: number) {
  const P: number[] = [], N: number[] = [], I: number[] = [];
  const face = (pts: number[][], n: number[]) => {
    const b = P.length / 3;
    for (const p of pts) { P.push(...p); N.push(...n); }
    for (let i = 1; i + 1 < pts.length; i++) I.push(b, b + i, b + i + 1);
  };
  const a = Math.atan2(h, w / 2), sn = Math.sin(a), cs = Math.cos(a);
  face([[-w / 2, 0, d / 2], [w / 2, 0, d / 2], [0, h, d / 2]], [0, 0, 1]);
  face([[w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [0, h, -d / 2]], [0, 0, -1]);
  face([[-w / 2, 0, -d / 2], [-w / 2, 0, d / 2], [0, h, d / 2], [0, h, -d / 2]], [-sn, cs, 0]);
  face([[w / 2, 0, d / 2], [w / 2, 0, -d / 2], [0, h, -d / 2], [0, h, d / 2]], [sn, cs, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

/** the way in: where its door (or gate) is on the front, how big, how it opens; the sign above it */
export type Entry = { x: number; y: number; z: number; w: number; h: number; door: 'swing' | 'lift' | 'gate' | 'none'; color: string; signY: number; signW: number };
/** what a place is called on its sign: "@ana's Farm" */
export const PLACE_WORD: Record<string, [string, string]> = {
  arcade: ['🕹️', 'Arcade'], farm: ['🌾', 'Farm'], business: ['🍋', 'Lemonade'], habitat: ['🌳', 'Glade'], home: ['🏠', 'Home'], landlord: ['🏘️', 'Rentals'],
  train: ['🚆', 'Station'], plane: ['✈️', 'Airfield'], mine: ['⛏️', 'Mine'], sky: ['☁️', 'Sky Island'], workshop: ['🛠️', 'Workshop'], diner: ['🍳', 'Diner'],
  dungeon: ['⚔️', 'Dungeon'], brawl: ['🎨', 'Arena'],
};
type O = { rx?: number; ry?: number; rz?: number; glow?: boolean; sx?: number; sy?: number; sz?: number };
/** collects coloured shapes for one place, already moved to where it stands */
class Kit {
  solid: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];
  constructor(public m: THREE.Matrix4) {}
  add(g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, o: O = {}) {
    if (g.attributes.uv) noUv(g);
    const c = new THREE.Color(color);
    const n = (g.attributes.position as THREE.BufferAttribute).count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (o.sx || o.sy || o.sz) g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    if (o.rx) g.rotateX(o.rx);
    if (o.rz) g.rotateZ(o.rz);
    if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    g.applyMatrix4(this.m);
    (o.glow ? this.glow : this.solid).push(g);
    return this;
  }
  /** a box standing on y (its bottom at y) */
  box(w: number, h: number, d: number, x: number, y: number, z: number, c: string, o: O = {}) { return this.add(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, x, y, z, o); }
  cyl(r0: number, r1: number, h: number, x: number, y: number, z: number, c: string, o: O & { seg?: number; open?: boolean } = {}) { return this.add(new THREE.CylinderGeometry(r1, r0, h, o.seg ?? 12, 1, !!o.open).translate(0, h / 2, 0), c, x, y, z, o); }
  cone(r: number, h: number, x: number, y: number, z: number, c: string, o: O & { seg?: number } = {}) { return this.add(new THREE.ConeGeometry(r, h, o.seg ?? 12).translate(0, h / 2, 0), c, x, y, z, o); }
  ball(r: number, x: number, y: number, z: number, c: string, o: O & { seg?: number } = {}) { return this.add(new THREE.SphereGeometry(r, o.seg ?? 12, Math.max(6, Math.round((o.seg ?? 12) * 0.6))), c, x, y, z, o); }
  dome(r: number, x: number, y: number, z: number, c: string, o: O = {}) { return this.add(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), c, x, y, z, o); }
  ring(r: number, tube: number, x: number, y: number, z: number, c: string, o: O & { seg?: number } = {}) { return this.add(new THREE.TorusGeometry(r, tube, 6, o.seg ?? 24), c, x, y, z, o); }
  roof(w: number, d: number, h: number, x: number, y: number, z: number, c: string, o: O = {}) { return this.add(prism(w, d, h), c, x, y, z, o); }
  rock(r: number, x: number, y: number, z: number, c: string, seed: number) {
    const g = new THREE.DodecahedronGeometry(r, 0);
    const P = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) { const k = 0.8 + hash(seed + i * 0.37) * 0.4; P.setXYZ(i, P.getX(i) * k, P.getY(i) * k * 0.8, P.getZ(i) * k); }
    g.computeVertexNormals();
    // (everything else here is indexed: give this one an index too, so they all merge)
    g.setIndex([...Array(P.count).keys()]);
    return this.add(g, c, x, y, z);
  }
  /** a little house: walls, a gable roof, a door and windows on the front (+z) */
  house(w: number, d: number, h: number, x: number, z: number, wall: string, roofC: string, y = 0, ry = 0, door = true) {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    const sub = new Kit(this.m.clone().multiply(m));
    sub.box(w, h, d, 0, 0, 0, wall);
    sub.roof(w + 0.5, d + 0.4, Math.min(w, d) * 0.45, 0, h, 0, roofC);
    if (door) sub.box(w * 0.2, h * 0.62, 0.08, 0, 0, d / 2, '#5a3a26');
    else sub.box(w * 0.22, h * 0.66, 0.03, 0, 0, d / 2 + 0.005, '#1e140d');
    for (const sx of [-1, 1]) sub.box(w * 0.2, h * 0.28, 0.06, sx * w * 0.3, h * 0.38, d / 2, '#9fc3dd', { glow: false });
    sub.box(0.5, Math.min(w, d) * 0.45, 0.5, w * 0.25, h, -d * 0.15, '#7d4a36');
    this.solid.push(...sub.solid); this.glow.push(...sub.glow);
    return this;
  }
}

/** a moving part (only for places near you): its own mesh, turned or bobbed each frame */
type Anim = { obj: THREE.Object3D; kind: 'spin' | 'bob' | 'flicker'; axis?: THREE.Vector3; speed: number; phase: number; base?: THREE.Vector3 };

export function createBuilds(near: THREE.Scene, opts: { phone: boolean }) {
  const group = new THREE.Group();
  group.userData.layer = 'builds';
  near.add(group);
  const solidM = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowM = new THREE.MeshBasicMaterial({ vertexColors: true });
  let meshes: THREE.Mesh[] = [];
  let anims: Anim[] = [];
  let sites: BuildSite[] = [];
  let signs: THREE.Mesh[] = [];
  type Door = { site: BuildSite; entry: Entry; obj: THREE.Group; openAt: number; knockAt: number };
  let doors = new Map<string, Door>();
  const doorM = new THREE.MeshLambertMaterial({ vertexColors: true });

  const clear = () => {
    for (const m of meshes) { group.remove(m); m.geometry.dispose(); }
    for (const s of signs) { group.remove(s); (s.material as THREE.MeshBasicMaterial).map?.dispose(); (s.material as THREE.Material).dispose(); s.geometry.dispose(); }
    for (const a of anims) { group.remove(a.obj); (a.obj as THREE.Mesh).geometry?.dispose(); }
    for (const d of doors.values()) { group.remove(d.obj); d.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    meshes = []; anims = []; signs = []; doors = new Map();
  };

  /** a moving part: built by `fill` around its own pivot, then placed */
  const animPart = (site: THREE.Matrix4, at: THREE.Vector3, kind: Anim['kind'], speed: number, fill: (k: Kit) => void, axis?: THREE.Vector3) => {
    const k = new Kit(new THREE.Matrix4());
    fill(k);
    const objs: THREE.Mesh[] = [];
    if (k.solid.length) objs.push(new THREE.Mesh(mergeGeometries(k.solid)!, solidM));
    if (k.glow.length) objs.push(new THREE.Mesh(mergeGeometries(k.glow)!, glowM));
    const holder = new THREE.Group();
    objs.forEach((o) => holder.add(o));
    const p = at.clone().applyMatrix4(site);
    holder.position.copy(p);
    holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(site));
    holder.scale.setFromMatrixScale(site);
    for (const o of objs) o.castShadow = true;
    group.add(holder);
    anims.push({ obj: holder, kind, speed, phase: hash(p.x * 0.1 + p.z), axis, base: holder.position.clone() });
  };

  /** a sign on the front: a name (and emoji) on a board */
  const sign = (site: THREE.Matrix4, text: string, emoji: string, color: string, at: THREE.Vector3, w: number) => {
    const c = Object.assign(document.createElement('canvas'), { width: 512, height: 128 });
    const g = c.getContext('2d')!;
    g.fillStyle = '#14122a'; g.beginPath(); g.roundRect(4, 4, 504, 120, 26); g.fill();
    g.strokeStyle = color; g.lineWidth = 8; g.stroke();
    g.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; g.textBaseline = 'middle';
    g.fillText(emoji, 22, 68);
    g.fillStyle = '#ffffff'; g.font = 'bold 48px system-ui, sans-serif';
    let t = text;
    while (g.measureText(t).width > 380 && t.length > 4) t = t.slice(0, -2);
    g.fillText(t === text ? t : `${t}…`, 108, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    m.position.copy(at.clone().applyMatrix4(site));
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(site));
    group.add(m);
    signs.push(m);
  };

  // ---- the places ------------------------------------------------------------------------------------------------------
  const build = (s: BuildSite, k: Kit, M: THREE.Matrix4, close: boolean): Entry | null => {
    const W = s.w * 0.84, D = s.d * 0.84, A = s.color;
    let entry: Entry | null = null;
    const way = (x: number, z: number, w: number, h: number, door: Entry['door'], color: string, signY = h + 0.7, signW = Math.min(4.4, Math.max(2.6, w * 2.2)), y = y0) => { entry = { x, y, z, w, h, door, color, signY: y + signY, signW }; };
    const r = (n: number) => hash(s.gx * 0.13 + s.gy * 0.71 + n);
    const T = s.tier;
    const y0 = 0.2;
    switch (s.family) {
      case 'arcade': {
        if (T >= 1) {
          // a carnival: striped tents round a turning Ferris wheel (a theme park with a rocket tower for a Domain)
          const R = Math.min(W, D) * 0.34;
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.6, tx = Math.cos(a) * W * 0.32, tz = Math.sin(a) * D * 0.32;
            k.cyl(1.6, 1.6, 1.8, tx, y0, tz, i % 2 ? '#ffffff' : A, { seg: 10 }).cone(2.0, 1.8, tx, y0 + 1.8, tz, i % 2 ? A : '#ff4d6d', { seg: 10 });
            k.ball(0.18, tx, y0 + 3.7, tz, '#ffe14d', { glow: true });
          }
          k.box(0.5, R + 1, 0.5, -0.9, y0, 0, '#3a3f5c', { rz: -0.12 }).box(0.5, R + 1, 0.5, 0.9, y0, 0, '#3a3f5c', { rz: 0.12 });
          if (close) animPart(M, new THREE.Vector3(0, y0 + R + 1, 0), 'spin', 0.25, (w) => {
            w.ring(R, 0.12, 0, 0, 0, '#ffffff').ring(R * 0.97, 0.07, 0, 0, 0, A, { glow: true });
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              w.box(0.08, R, 0.08, 0, 0, 0, '#dfe6ff', { rz: a });
              w.box(1.1, 0.9, 0.9, Math.cos(a) * R, Math.sin(a) * R - 0.45, 0, ['#ff4d6d', '#ffe14d', '#3ddc97', '#34c3ff', '#b46bff'][i % 5]);
            }
          }, new THREE.Vector3(0, 0, 1));
          for (const sx of [-1, 1]) k.box(0.4, 4.2, 0.4, sx * 1.6, y0, D / 2, A).ball(0.3, sx * 1.6, y0 + 4.4, D / 2, '#ffe14d', { glow: true });
          k.box(3.6, 0.5, 0.4, 0, y0 + 3.7, D / 2, '#ffffff');
          way(0, D / 2, 2.8, 2.4, 'gate', '#ffffff', 4.7, 4.6);
          if (T >= 2) { k.cyl(0.6, 0.9, 16, -W * 0.36, y0, -D * 0.36, '#e8ecff').cone(1.1, 3, -W * 0.36, y0 + 16, -D * 0.36, A).ring(R * 0.7, 0.25, W * 0.25, y0 + R * 0.75, -D * 0.2, '#ff4fd8', { ry: 0.8 }); }
          break;
        }
        // a neon arcade: dark walls, glowing edges, a big lit doorway, a joystick on the roof
        const h = 4.2;
        k.box(W, h, D, 0, y0, 0, '#1b1838');
        for (const [x, z, w, d] of [[0, D / 2, W, 0.12], [0, -D / 2, W, 0.12], [W / 2, 0, 0.12, D], [-W / 2, 0, 0.12, D]] as const) {
          k.box(w + 0.05, 0.14, d + 0.05, x, y0 + h - 0.1, z, A, { glow: true }).box(w + 0.05, 0.1, d + 0.05, x, y0 + 0.05, z, '#22e3ff', { glow: true });
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.12, h, 0.12, sx * W / 2, y0, sz * D / 2, '#22e3ff', { glow: true });
        // a neon frame round the doorway (the dark hall behind the door)
        k.box(0.12, 2.6, 0.06, -W * 0.16, y0, D / 2 + 0.03, '#ff9be0', { glow: true }).box(0.12, 2.6, 0.06, W * 0.16, y0, D / 2 + 0.03, '#ff9be0', { glow: true }).box(W * 0.34, 0.12, 0.06, 0, y0 + 2.5, D / 2 + 0.03, '#ff9be0', { glow: true });
        k.box(W * 0.3, 2.45, 0.04, 0, y0, D / 2 + 0.01, '#120720');
        way(0, D / 2 + 0.06, W * 0.3, 2.45, 'swing', '#2a0f3d', h + 0.75 - y0 + y0, Math.min(W * 0.9, 5.2));
        k.cyl(0.12, 0.12, 1.2, W * 0.25, y0 + h, -D * 0.1, '#30304a').ball(0.38, W * 0.25, y0 + h + 1.3, -D * 0.1, '#ff3d3d', { glow: true });
        k.box(1.8, 0.4, 1.2, W * 0.25, y0 + h, -D * 0.1, '#232045');
        break;
      }
      case 'farm': {
        // a red barn with white trim, a silo, rows of crops, a fence round it (a castle for a Domain)
        if (T >= 2) {
          const wallC = '#c9c1ae';
          k.box(W * 0.7, 5, D * 0.7, 0, y0, 0, wallC);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(1.8, 1.8, 9, sx * W * 0.35, y0, sz * D * 0.35, wallC, { seg: 10 }).cone(2.3, 3.4, sx * W * 0.35, y0 + 9, sz * D * 0.35, A, { seg: 10 });
          k.box(W * 0.3, 10, D * 0.3, 0, y0, -D * 0.05, '#b8af9b').roof(W * 0.34, D * 0.34, 3.5, 0, y0 + 10, -D * 0.05, A);
          k.box(2.8, 3.6, 0.1, 0, y0, D * 0.35 + 0.01, '#14100c');
          way(0, D * 0.35 + 0.08, 2.6, 3.4, 'lift', '#3b2617', 5.4, 5);
          if (close) animPart(M, new THREE.Vector3(0, y0 + 15.5, -D * 0.05), 'spin', 0.6, (w) => { w.cyl(0.05, 0.05, 2.2, 0, 0, 0, '#ddd').box(1.6, 0.9, 0.04, 0.85, 1.2, 0, A); }, new THREE.Vector3(0, 1, 0));
          break;
        }
        const bw = W * (T ? 0.36 : 0.46), bd = D * (T ? 0.3 : 0.4), bh = T ? 4.2 : 3.2;
        const bx = -W * 0.22, bz = -D * 0.24;
        k.box(bw, bh, bd, bx, y0, bz, '#a63a2c').roof(bw + 0.4, bd + 0.3, bw * 0.42, bx, y0 + bh, bz, '#4b3b33', { ry: Math.PI / 2 });
        k.box(bw * 0.4, bh * 0.7, 0.06, bx, y0, bz + bd / 2 + 0.01, '#f2ede4').box(bw * 0.32, bh * 0.62, 0.08, bx, y0, bz + bd / 2 + 0.03, '#7d2a21');
        k.cyl(0.9, 0.9, bh * 1.7, bx + bw / 2 + 1.1, y0, bz, '#c8ccd2', { seg: 12 }).dome(0.9, bx + bw / 2 + 1.1, y0 + bh * 1.7, bz, '#9aa1aa');
        const rows = T ? 9 : 5;
        for (let i = 0; i < rows; i++) {
          const z = -D * 0.02 + (i / rows) * D * 0.5;
          const crop = ['#4f8f2f', '#6aa03a', '#d9b443', '#3d7a2a'][Math.floor(r(i) * 4)];
          k.box(W * 0.86, 0.12, 0.5, 0, y0, z, '#5a4128').box(W * 0.82, 0.35 + r(i + 5) * 0.4, 0.34, 0, y0 + 0.12, z, crop);
        }
        for (const sx of [-1, 1]) k.box(0.18, 2.6, 0.18, sx * 1.05, y0, D / 2, '#7a5432');
        k.box(2.4, 0.22, 0.2, 0, y0 + 2.45, D / 2, '#7a5432');
        way(0, D / 2, 1.9, 1.1, 'gate', '#d9cbb0', 2.0, Math.min(4.2, W * 0.8));
        for (let i = 0; i <= 8; i++) { const t = i / 8 - 0.5; if (Math.abs(t) < 0.13) continue; k.box(0.1, 0.9, 0.1, t * W, y0, D / 2, '#e9e1cf').box(0.1, 0.9, 0.1, W / 2, y0, t * D, '#e9e1cf').box(0.1, 0.9, 0.1, -W / 2, y0, t * D, '#e9e1cf'); }
        for (const sx of [-1, 1]) k.box(W / 2 - 1.05, 0.08, 0.06, sx * (W / 4 + 0.53), y0 + 0.7, D / 2, '#e9e1cf');
        k.box(0.06, 0.08, D, W / 2, y0 + 0.7, 0, '#e9e1cf').box(0.06, 0.08, D, -W / 2, y0 + 0.7, 0, '#e9e1cf');
        if (T && close) {
          // a ranch's windmill
          const mx = W * 0.32, mz = -D * 0.3;
          k.cyl(0.5, 0.18, 7, mx, y0, mz, '#d8d2c4', { seg: 6 });
          animPart(M, new THREE.Vector3(mx, y0 + 7, mz + 0.3), 'spin', 1.2, (w) => { for (let i = 0; i < 4; i++) w.box(0.35, 2.4, 0.05, 0, 0, 0, '#f4efe4', { rz: (i / 4) * Math.PI * 2 }); w.ball(0.2, 0, 0, 0, '#555'); }, new THREE.Vector3(0, 0, 1));
        }
        break;
      }
      case 'business': {
        if (T >= 1) {
          // a glass tower (an Exchange); a Domain's megacorp is twice as tall, with a crown and a beacon
          const h = T >= 2 ? 72 : 38, tw = W * 0.62, td = D * 0.62;
          k.box(tw, h, td, 0, y0, 0, '#3f5a73');
          for (let f = 3; f < h; f += 3.6) k.box(tw + 0.06, 0.18, td + 0.06, 0, y0 + f, 0, '#c9d3dc');
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.2, h, 0.2, sx * tw / 2, y0, sz * td / 2, '#d8e0e8');
          k.box(tw * 0.9, 3.6, td * 0.9, 0, y0, 0, '#ffe6a8', { glow: true });
          way(0, td * 0.45 + 0.06, 2.2, 2.7, 'swing', '#2b3d4f', 4.2, Math.min(tw, 6));
          k.box(tw * 0.7, 2.4, td * 0.7, 0, y0 + h, 0, '#2b3d4f').box(tw * 0.08, 0.2, tw * 0.08, 0, y0 + h + 2.4, 0, '#ffd34d', { glow: true });
          if (T >= 2) k.cone(tw * 0.35, 9, 0, y0 + h + 2.4, 0, '#d4a500', { seg: 4 }).ball(0.6, 0, y0 + h + 11.6, 0, '#ff3d3d', { glow: true });
          break;
        }
        // a lemonade kiosk: a wooden counter, a striped awning, a pile of lemons, a sign
        const kw = Math.min(W * 0.7, 4.2), kd = Math.min(D * 0.5, 2.4);
        k.box(kw, 1.1, kd, 0, y0, 0, '#c58b4f').box(kw + 0.15, 0.08, kd + 0.15, 0, y0 + 1.1, 0, '#8a5a2e');
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.1, 2.4, 0.1, sx * (kw / 2 - 0.05), y0 + 1.1, sz * (kd / 2 - 0.05), '#8a5a2e');
        const stripes = 7;
        for (let i = 0; i < stripes; i++) k.box(kw / stripes + 0.01, 0.06, kd + 0.8, -kw / 2 + (i + 0.5) * (kw / stripes), y0 + 3.45, 0.25, i % 2 ? '#ffffff' : '#ffd84d', { rx: -0.18 });
        for (let i = 0; i < 9; i++) k.ball(0.11, -kw * 0.3 + (i % 3) * 0.24 + (i > 5 ? 0.12 : 0), y0 + 1.25 + Math.floor(i / 3) * 0.16, kd * 0.1 + (i % 2) * 0.1, '#ffe14d');
        k.cyl(0.25, 0.22, 0.6, kw * 0.25, y0 + 1.18, 0, '#f6f2c2', { glow: false });
        way(0, kd / 2 + 0.3, kw * 0.6, 1.1, 'none', '#c58b4f', 1.65, Math.min(kw * 0.95, 3.8));
        break;
      }
      case 'habitat': {
        // an Inkborn glade: a hedge ring, a hill burrow with a round door, a glowing pond, trees and flowers
        const R = Math.min(W, D) * 0.46;
        if (T >= 2) {
          // the Domain: a great world tree
          k.cyl(2.6, 1.4, 14, 0, y0, 0, '#6b4a33', { seg: 10 });
          for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.cyl(0.9, 0.3, 5, Math.cos(a) * 2, y0, Math.sin(a) * 2, '#5a3d2a', { rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9, seg: 6 }); }
          for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; k.ball(5 + r(i) * 2, Math.cos(a) * 5, y0 + 15 + r(i + 9) * 4, Math.sin(a) * 5, ['#3d8a4a', '#4fa356', '#2f7a43'][i % 3], { seg: 10 }); }
          k.ball(6.5, 0, y0 + 20, 0, '#4fa356', { seg: 12 });
          for (let i = 0; i < 14; i++) { const a = r(i + 30) * Math.PI * 2, d2 = 6 + r(i + 40) * 6; k.ball(0.22, Math.cos(a) * d2, y0 + 8 + r(i + 50) * 12, Math.sin(a) * d2, '#c8ffd8', { glow: true, seg: 6 }); }
          break;
        }
        for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.4) continue; k.ball(0.75, Math.cos(a) * R, y0 + 0.4, Math.sin(a) * R, i % 2 ? '#3f7a35' : '#4a8a3c', { seg: 8, sy: 0.8 }); }
        for (const sx of [-1, 1]) k.cyl(0.1, 0.1, 2.2, sx * 0.85, y0, R, '#6b4a33', { seg: 6 });
        k.ring(0.85, 0.08, 0, y0 + 2.2, R, '#6b4a33', { seg: 12 });
        for (let i = 0; i < 7; i++) k.ball(0.12, Math.cos((i / 6) * Math.PI) * 0.85, y0 + 2.2 + Math.sin((i / 6) * Math.PI) * 0.85, R, ['#ff7ab8', '#ffe14d', '#ffffff'][i % 3], { seg: 5 });
        way(0, R, 1.5, 1.0, 'gate', '#8a5a2e', 3.3, 3.6);
        k.dome(R * 0.42, -R * 0.25, y0, -R * 0.2, '#5f9a45');
        k.cyl(0.55, 0.55, 0.06, -R * 0.25, y0 + 0.55, -R * 0.2 + R * 0.4, '#8a5a2e', { rx: Math.PI / 2, seg: 16 });
        k.ball(0.07, -R * 0.25 + 0.3, y0 + 0.6, -R * 0.2 + R * 0.43, '#ffd34d', { glow: true, seg: 6 });
        k.cyl(R * 0.3, R * 0.3, 0.05, R * 0.35, y0, R * 0.25, '#3ddc97', { glow: true, seg: 20 });
        for (let i = 0; i < 3; i++) { const a = r(i + 3) * 6.28, tx = Math.cos(a) * R * 0.55, tz = Math.sin(a) * R * 0.55; k.cyl(0.14, 0.2, 2, tx, y0, tz, '#6b4a33', { seg: 6 }).ball(1.1, tx, y0 + 2.6, tz, ['#4f9a43', '#5fae4f', '#3e8a3a'][i], { seg: 8 }); }
        for (let i = 0; i < 16; i++) { const a = r(i + 60) * 6.28, d2 = r(i + 70) * R * 0.8; k.ball(0.09, Math.cos(a) * d2, y0 + 0.12, Math.sin(a) * d2, ['#ff7ab8', '#ffe14d', '#ffffff', '#b46bff'][i % 4], { seg: 5 }); }
        if (T >= 1) for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.4; k.cyl(0.18, 0.12, 3.4, Math.cos(a) * R * 0.8, y0, Math.sin(a) * R * 0.8, '#d9c3a0', { seg: 6 }).ball(0.3, Math.cos(a) * R * 0.8, y0 + 3.5, Math.sin(a) * R * 0.8, '#fff2b0', { glow: true, seg: 8 }); }
        break;
      }
      case 'home':
      case 'landlord': {
        if (s.kind === 'landlord') {
          // a row of little rental houses
          const n = Math.max(2, Math.min(4, Math.round(W / 3.4)));
          for (let i = 0; i < n; i++) {
            const hw = W / n - 0.4;
            const hx = -W / 2 + (i + 0.5) * (W / n);
            k.house(hw, D * 0.55, 2.8, hx, -D * 0.05, ['#e8dcc8', '#cfe0e8', '#f0d9d2', '#dfe8d0'][i % 4], ['#7d3b2c', '#3e4a5a', '#5a4a3e'][i % 3], y0, 0, i !== 0);
            if (i === 0) way(hx, -D * 0.05 + D * 0.275 + 0.06, hw * 0.2, 2.8 * 0.62, 'swing', '#5a3a26', 3.4, Math.min(4.4, W * 0.6));
          }
          break;
        }
        // your house: walls, a pitched roof, a door with a lit lamp, a path, a little fence and a mailbox
        const hw = W * 0.62, hd = D * 0.5;
        k.house(hw, hd, 3, 0, -D * 0.12, '#efe3cf', '#a64a35', y0, 0, false);
        way(0, -D * 0.12 + hd / 2 + 0.06, hw * 0.2, 3 * 0.62, 'swing', '#5a3a26', 3.6, Math.min(4, W * 0.8));
        k.box(0.18, 0.18, 0.18, hw * 0.16, y0 + 2.2, -D * 0.12 + hd / 2 + 0.1, '#ffe2a0', { glow: true });
        k.box(0.9, 0.04, D * 0.32, 0, y0, -D * 0.12 + hd / 2 + D * 0.16, '#c8bfae');
        for (let i = 0; i <= 10; i++) { const t = i / 10 - 0.5; if (Math.abs(t) < 0.08) continue; k.box(0.08, 0.7, 0.08, t * W, y0, D / 2, '#ffffff'); }
        k.box(W, 0.06, 0.05, 0, y0 + 0.55, D / 2, '#ffffff');
        k.box(0.08, 1, 0.08, W * 0.3, y0, D * 0.42, '#4a4a4a').box(0.3, 0.25, 0.45, W * 0.3, y0 + 1, D * 0.42, A);
        break;
      }
      case 'train':
      case 'plane': {
        if (s.kind === 'plane') {
          // a little airfield: a curved hangar, a windsock, a small plane
          const hw = W * 0.6;
          k.add(new THREE.CylinderGeometry(hw / 2, hw / 2, D * 0.55, 16, 1, false, -Math.PI / 2, Math.PI), '#b9c1cb', 0, y0, -D * 0.12, { rx: Math.PI / 2 });
          k.box(hw * 0.74, hw * 0.42, 0.04, 0, y0, -D * 0.12 + D * 0.275, '#101216');
          way(0, -D * 0.12 + D * 0.275 + 0.06, hw * 0.7, hw * 0.4, 'lift', '#3a3f4a', hw * 0.5 + 0.4, Math.min(4.6, W * 0.8));
          k.cyl(0.05, 0.05, 3.2, W * 0.4, y0, D * 0.35, '#ddd').cone(0.25, 1.2, W * 0.4 + 0.6, y0 + 3.0, D * 0.35, '#ff7a2a', { rz: Math.PI / 2, seg: 8 });
          const px = -W * 0.1, pz = D * 0.3;
          k.cyl(0.35, 0.35, 3.2, px, y0 + 0.7, pz, '#ffffff', { rz: Math.PI / 2 }).box(0.1, 0.06, 4.2, px + 0.2, y0 + 0.9, pz, A).box(0.06, 0.8, 0.9, px - 1.5, y0 + 0.9, pz, A).cone(0.35, 0.5, px + 1.85, y0 + 0.7, pz, '#3a3f4a', { rz: -Math.PI / 2 });
          break;
        }
        // a station: a platform, a canopy on posts, a sign, a stretch of track with a carriage
        k.box(W, 0.9, D * 0.36, 0, y0, -D * 0.12, '#b9b4aa').box(W, 0.06, 0.25, 0, y0 + 0.9, -D * 0.12 + D * 0.18 - 0.12, '#ffd34d');
        for (const sx of [-0.35, 0, 0.35]) k.box(0.15, 2.8, 0.15, sx * W, y0 + 0.9, -D * 0.16, '#3a4458');
        k.box(W * 0.95, 0.15, D * 0.32, 0, y0 + 3.7, -D * 0.12, A, { rx: 0.08 });
        k.box(W, 0.12, 2.2, 0, y0, D * 0.25, '#6b6258');
        for (const sz of [-0.72, 0.72]) k.box(W, 0.12, 0.08, 0, y0 + 0.12, D * 0.25 + sz, '#b9bcc2');
        way(0, -D * 0.12 + D * 0.18, 2, 2.4, 'none', A, 3.0 + 0.9, Math.min(W * 0.6, 4));
        k.box(Math.min(W * 0.8, 9), 2.4, 2.4, 0, y0 + 0.4, D * 0.25, '#2fa4d9').box(Math.min(W * 0.8, 9) - 0.4, 0.6, 2.42, 0, y0 + 1.6, D * 0.25, '#cfe8f5');
        break;
      }
      case 'mine': {
        // a rocky hill with a timber-framed tunnel mouth, rails and an ore cart, lanterns; crystals for an Estate,
        // a great glowing crystal spire for a Domain
        const R = Math.min(W, D) * 0.45;
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 1, d2 = R * (0.35 + r(i) * 0.3); k.rock(R * (0.38 + r(i + 7) * 0.2), Math.cos(a) * d2, y0 + 0.4, Math.sin(a) * d2 - R * 0.2, ['#7d756b', '#8d857b', '#6a645c'][i % 3], s.gx + i); }
        k.rock(R * 0.6, 0, y0 + 1.2, -R * 0.25, '#857d72', s.gy);
        k.box(2.2, 2.4, 0.4, 0, y0, R * 0.25, '#151210');
        way(0, R * 0.32, 2.1, 2.4, 'none', '#151210', 3.25, 3.4);
        k.box(0.25, 2.6, 0.3, -1.15, y0, R * 0.3, '#7a5432').box(0.25, 2.6, 0.3, 1.15, y0, R * 0.3, '#7a5432').box(2.7, 0.3, 0.35, 0, y0 + 2.5, R * 0.3, '#7a5432');
        for (const sx of [-0.5, 0.5]) k.box(0.08, 0.08, D * 0.5, sx, y0, R * 0.3 + D * 0.25, '#9aa0a8');
        k.box(1.2, 0.7, 0.9, 0.1, y0 + 0.2, R * 0.3 + 1.8, '#5a5f66').ball(0.32, -0.15, y0 + 0.95, R * 0.3 + 1.8, '#ffd34d', { seg: 6 }).ball(0.26, 0.3, y0 + 0.92, R * 0.3 + 1.7, '#7c5cff', { glow: true, seg: 6 });
        for (const sx of [-1.5, 1.5]) k.box(0.18, 0.28, 0.18, sx, y0 + 2.1, R * 0.32, '#ffb347', { glow: true });
        if (T >= 1) for (let i = 0; i < 6; i++) { const a = r(i + 20) * 6.28, d2 = R * 0.7; k.cone(0.4 + r(i) * 0.3, 1.6 + r(i + 1) * 1.6, Math.cos(a) * d2, y0, Math.sin(a) * d2, '#19d3c5', { glow: true, seg: 5, rz: (r(i + 2) - 0.5) * 0.6 }); }
        if (T >= 2 && close) animPart(M, new THREE.Vector3(0, y0 + R * 1.5, -R * 0.25), 'spin', 0.3, (w) => { w.cone(1.6, 9, 0, 0, 0, '#7c5cff', { glow: true, seg: 6 }).cone(1.6, 4, 0, 0, 0, '#c4b5ff', { glow: true, seg: 6, rx: Math.PI }); }, new THREE.Vector3(0, 1, 0));
        break;
      }
      case 'sky': {
        // an island floating over its plot (bobbing): a rock underneath, grass on top, a tree, a waterfall;
        // balloons for a Skyport, an observatory dome for a Domain
        const R = Math.min(W, D) * 0.42;
        const fill = (w: Kit) => {
          w.cone(R, R * 1.4, 0, -R * 1.4, 0, '#7d6a58', { rx: Math.PI, seg: 9 });
          w.cyl(R * 1.02, R, 0.5, 0, -0.5, 0, '#6aa84f', { seg: 18 });
          w.cyl(0.14, 0.2, 1.8, -R * 0.3, 0, -R * 0.2, '#6b4a33', { seg: 6 }).ball(0.95, -R * 0.3, 2.3, -R * 0.2, '#4f9a43', { seg: 8 });
          w.box(0.6, R * 1.4, 0.08, R * 0.6, -R * 1.4, R * 0.55, '#a8e4ff', { glow: true });
          w.box(0.5, 1.2, 0.5, R * 0.25, 0, R * 0.2, '#f4efe4').roof(0.7, 0.7, 0.5, R * 0.25, 1.2, R * 0.2, '#38bdf8');
          if (T >= 2) w.cyl(1.6, 1.6, 1.6, 0, 0, R * 0.1, '#e8ecff').dome(1.6, 0, 1.6, R * 0.1, '#c9d3ff').cyl(0.25, 0.25, 2.2, 0.5, 2.1, R * 0.1, '#3a3f5c', { rz: -0.8 });
        };
        if (close) animPart(M, new THREE.Vector3(0, y0 + 7 + T * 3, 0), 'bob', 0.6, fill);
        else { const sub = new Kit(M.clone().multiply(new THREE.Matrix4().makeTranslation(0, y0 + 7 + T * 3, 0))); fill(sub); k.solid.push(...sub.solid); k.glow.push(...sub.glow); }
        if (T >= 1 && close) for (let i = 0; i < 3; i++) {
          const a = (i / 3) * 6.28 + 0.5;
          animPart(M, new THREE.Vector3(Math.cos(a) * R * 1.4, y0 + 12 + i * 2.5, Math.sin(a) * R * 1.4), 'bob', 0.4 + i * 0.1, (w) => {
            w.ball(1.4, 0, 1.6, 0, ['#ff4d6d', '#ffe14d', '#8a7cff'][i], { seg: 12, sy: 1.15 }).box(0.6, 0.5, 0.6, 0, 0, 0, '#8a5a2e');
          });
        }
        way(0, Math.min(W, D) * 0.45, 2, 1.6, 'none', A, 1.6, 3.6);
        k.box(0.12, 1.6, 0.12, 0, y0, Math.min(W, D) * 0.45, '#6b4a33');
        // a beam of light down to the plot it belongs to
        k.cyl(0.08, 0.08, 6 + T * 3, 0, y0, 0, '#bfefff', { glow: true, seg: 6 });
        break;
      }
      case 'workshop': {
        // a shed with a big gear on the front, a chimney, a workbench (furnace towers for a Foundry, a giant robot
        // for a Domain)
        if (T >= 2) {
          const c1 = '#9aa3ad', c2 = A;
          k.box(2.2, 6, 1.6, -1.6, y0, 0, c1).box(2.2, 6, 1.6, 1.6, y0, 0, c1);
          k.box(5.6, 6.5, 3.2, 0, y0 + 6, 0, c2).box(4.2, 3.6, 3.4, 0, y0 + 12.5, 0, c1);
          k.box(0.8, 0.5, 0.1, -0.9, y0 + 14.2, 1.71, '#22e3ff', { glow: true }).box(0.8, 0.5, 0.1, 0.9, y0 + 14.2, 1.71, '#22e3ff', { glow: true });
          k.box(1.4, 6, 1.4, -3.6, y0 + 6.2, 0, c1, { rz: 0.15 }).box(1.4, 6, 1.4, 3.6, y0 + 6.2, 0, c1, { rz: -0.15 });
          k.cyl(0.08, 0.08, 1.6, 0, y0 + 16.1, 0, '#555').ball(0.3, 0, y0 + 17.8, 0, '#ff3d3d', { glow: true });
          k.cyl(1.4, 1.4, 0.2, 0, y0 + 9, 1.62, '#ffb347', { glow: true, rx: Math.PI / 2, seg: 16 });
          k.box(1.3, 2.3, 0.03, -1.6, y0, 0.81, '#0c0d10');
          way(-1.6, 0.86, 1.2, 2.2, 'swing', '#5a5f66', 2.9, 3.6);
          break;
        }
        const sw = W * 0.6, sd = D * 0.5;
        k.box(sw, 3, sd, 0, y0, -D * 0.12, '#8a6a4a').roof(sw + 0.4, sd + 0.3, 1.4, 0, y0 + 3, -D * 0.12, '#4a4f58');
        k.box(sw * 0.47, 2.35, 0.03, 0, y0, -D * 0.12 + sd / 2 + 0.005, '#14161a');
        way(0, -D * 0.12 + sd / 2 + 0.06, sw * 0.45, 2.3, 'lift', '#3a3f4a', 4.6, Math.min(4.2, W * 0.8));
        k.cyl(0.35, 0.3, 2.4, sw * 0.32, y0 + 3, -D * 0.2, '#5a5f66', { seg: 8 });
        k.box(1.8, 0.9, 0.7, -sw * 0.25, y0, D * 0.3, '#7a5432').box(0.3, 0.3, 0.3, -sw * 0.25, y0 + 0.9, D * 0.3, '#ffb347', { glow: true });
        if (close) animPart(M, new THREE.Vector3(0, y0 + 3.6, -D * 0.12 + sd / 2 + 0.15), 'spin', 0.8, (w) => {
          w.ring(0.7, 0.18, 0, 0, 0, '#f59e0b', { seg: 16 });
          for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; w.box(0.3, 0.3, 0.25, Math.cos(a) * 0.9, Math.sin(a) * 0.9 - 0.15, 0, '#f59e0b', { rz: a }); }
        }, new THREE.Vector3(0, 0, 1));
        if (T >= 1) for (const sx of [-1, 1]) k.cyl(1.1, 0.8, 8, sx * W * 0.36, y0, -D * 0.32, '#5a5f66', { seg: 10 }).cyl(0.7, 0.7, 0.3, sx * W * 0.36, y0 + 8, -D * 0.32, '#ff7a2a', { glow: true, seg: 10 });
        break;
      }
      case 'diner': {
        // a little diner: a long counter window glowing warm, a red awning, a neon sign on the roof (bigger halls
        // for the Estate and the Domain)
        const dw = W * (T ? 0.8 : 0.66), dd = D * (T ? 0.6 : 0.46), dh = T >= 2 ? 6 : 3.2;
        k.box(dw, dh, dd, 0, y0, -D * 0.1, '#e8e4dc').box(dw + 0.1, 0.5, dd + 0.1, 0, y0, -D * 0.1, '#c0392b');
        k.box(dw * 0.62, dh * 0.4, 0.06, -dw * 0.12, y0 + dh * 0.3, -D * 0.1 + dd / 2 + 0.01, '#ffd9a0', { glow: true });
        k.box(1.05, 2.15, 0.03, dw * 0.36, y0, -D * 0.1 + dd / 2 + 0.005, '#2a1a12');
        way(dw * 0.36, -D * 0.1 + dd / 2 + 0.06, 1, 2.1, 'swing', '#c0392b', dh + 0.55, Math.min(dw * 0.8, 4.4));
        for (let i = 0; i < 6; i++) k.box(dw / 6 + 0.01, 0.05, 1.1, -dw / 2 + (i + 0.5) * (dw / 6), y0 + dh * 0.78, -D * 0.1 + dd / 2 + 0.45, i % 2 ? '#ffffff' : '#ef4444', { rx: -0.25 });
        if (T >= 2) k.dome(dw * 0.3, 0, y0 + dh, -D * 0.1, '#d4a500');
        k.box(dw * 0.4, 0.06, 0.06, 0, y0 + dh + 0.9, -D * 0.1 + dd / 2 - 0.2, '#ff4d6d', { glow: true });
        break;
      }
      case 'dungeon': {
        // a stone archway over stairs going down into the dark, torches either side, skull pillars (castle walls for
        // a Citadel, a swirling portal for a Domain)
        const st = '#6f6a75';
        k.box(W * 0.5, 0.4, D * 0.5, 0, y0, 0, '#4a4650');
        k.box(2.6, 0.15, 3, 0, y0 + 0.25, 0, '#0b0a10');
        for (const sx of [-1, 1]) k.box(0.7, 3.4, 0.7, sx * 1.6, y0, -0.2, st).box(0.2, 0.3, 0.2, sx * 1.6, y0 + 3.5, 0.2, '#ff8a2a', { glow: true }).ball(0.25, sx * 1.6, y0 + 3.9, 0.2, '#ffd34d', { glow: true, seg: 6 });
        k.box(4, 0.8, 0.8, 0, y0 + 3.4, -0.2, st).ball(0.35, 0, y0 + 4.3, 0.1, '#e8e2d6', { seg: 8 });
        way(0, 0.25, 2.5, 3.3, 'lift', '#3a3540', 4.9, 3.8);
        for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.78; k.cyl(0.35, 0.3, 2.2, Math.cos(a) * W * 0.36, y0, Math.sin(a) * D * 0.36, st, { seg: 6 }).ball(0.3, Math.cos(a) * W * 0.36, y0 + 2.4, Math.sin(a) * D * 0.36, '#e8e2d6', { seg: 8 }); }
        if (T >= 1) {
          for (const [x, z, w, d] of [[0, -D / 2, W, 0.8], [0, D / 2, W, 0.8], [-W / 2, 0, 0.8, D], [W / 2, 0, 0.8, D]] as const) k.box(w, 4, d, x, y0, z, '#57525e');
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(1.4, 1.4, 7, sx * W / 2, y0, sz * D / 2, '#5f5a66', { seg: 8 }).cone(1.7, 2.6, sx * W / 2, y0 + 7, sz * D / 2, '#b23cff', { seg: 8 });
        }
        if (T >= 2 && close) animPart(M, new THREE.Vector3(0, y0 + 5, -D * 0.2), 'spin', 1.4, (w) => { w.ring(3, 0.35, 0, 0, 0, '#b23cff', { glow: true, seg: 32 }).ring(2.2, 0.2, 0, 0, 0, '#ff4fd8', { glow: true, seg: 28 }).ring(1.3, 0.15, 0, 0, 0, '#22e3ff', { glow: true, seg: 24 }); }, new THREE.Vector3(0, 0, 1));
        break;
      }
      case 'brawl': {
        // an arena: a ring of stands with banners round a painted floor (a colosseum of arches for the Estate, two
        // giant champions for the Domain)
        const R = Math.min(W, D) * 0.45;
        k.cyl(R * 0.7, R * 0.7, 0.12, 0, y0, 0, '#f2ede4', { seg: 24 });
        for (let i = 0; i < 9; i++) { const a = r(i + 80) * 6.28, d2 = r(i + 90) * R * 0.55; k.cyl(0.4 + r(i) * 0.5, 0.4 + r(i) * 0.5, 0.02, Math.cos(a) * d2, y0 + 0.13, Math.sin(a) * d2, ['#ff4fd8', '#22e3ff', '#ffe14d', '#3ddc97'][i % 4], { seg: 10 }); }
        k.cyl(R, R * 0.92, T ? 4 : 1.6, 0, y0, 0, '#8a8494', { open: true, seg: 28 });
        for (const sx of [-1, 1]) k.box(0.35, T ? 5 : 3, 0.35, sx * 1.2, y0, R, '#5a5560');
        k.box(2.8, 0.4, 0.4, 0, y0 + (T ? 5 : 3), R, A);
        way(0, R + 0.1, 2.0, T ? 3.4 : 2.2, 'gate', '#4a4550', (T ? 5 : 3) + 0.9, 4);
        const banners = 8;
        for (let i = 0; i < banners; i++) { const a = (i / banners) * Math.PI * 2; k.box(0.08, 3.2, 0.08, Math.cos(a) * R, y0 + (T ? 4 : 1.6), Math.sin(a) * R, '#3a3f4a').box(0.05, 1, 0.7, Math.cos(a) * R, y0 + (T ? 6.2 : 3.8), Math.sin(a) * R + 0.35, i % 2 ? A : '#ffe14d', { ry: -a }); }
        if (T >= 1) for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.box(0.5, 2.6, 0.5, Math.cos(a) * R * 1.02, y0 + 4, Math.sin(a) * R * 1.02, '#b9b2a6'); }
        if (T >= 2) for (const sx of [-1, 1]) {
          const x = sx * R * 0.55;
          k.box(1.4, 3, 1, x, y0, -R * 0.2, '#c9c1ae').box(1.8, 3, 1.2, x, y0 + 3, -R * 0.2, sx > 0 ? '#ff4fd8' : '#22e3ff').ball(0.75, x, y0 + 6.8, -R * 0.2, '#c9c1ae').box(0.4, 4, 0.4, x + sx * 1.3, y0 + 4, -R * 0.2, '#ffe14d', { glow: true, rz: sx * 0.4 });
        }
        break;
      }
      default:
        break;
    }
    return entry;
  };

  /** a door (or a gate, or a portcullis) that can be knocked on and opens */
  const makeDoor = (s: BuildSite, e: Entry, M: THREE.Matrix4) => {
    const k = new Kit(new THREE.Matrix4());
    if (e.door === 'gate') {
      // a garden gate: two rails and slats
      for (let i = 0; i < 6; i++) k.box(e.w / 7, e.h, 0.05, (i + 0.5) * (e.w / 6), 0, 0, e.color);
      k.box(e.w, 0.1, 0.07, e.w / 2, e.h * 0.25, 0, e.color).box(e.w, 0.1, 0.07, e.w / 2, e.h * 0.8, 0, e.color);
    } else if (e.door === 'lift') {
      // a portcullis / roller door: bars and slats
      for (let i = 0; i <= 6; i++) k.box(0.08, e.h, 0.08, -e.w / 2 + (i / 6) * e.w, 0, 0, e.color);
      for (let j = 1; j < 5; j++) k.box(e.w, 0.08, 0.08, 0, (j / 5) * e.h, 0, e.color);
    } else {
      // a front door: panels, a knocker and a handle
      k.box(e.w, e.h, 0.07, e.w / 2, 0, 0, e.color);
      k.box(e.w * 0.36, e.h * 0.32, 0.02, e.w * 0.3, e.h * 0.55, 0.04, '#ffffff', { sx: 1 }).box(e.w * 0.36, e.h * 0.32, 0.02, e.w * 0.3, e.h * 0.12, 0.04, '#ffffff');
      k.ring(0.07, 0.015, e.w / 2, e.h * 0.66, 0.06, '#d4a500', { seg: 10 });
      k.ball(0.04, e.w * 0.86, e.h * 0.47, 0.07, '#d4a500', { seg: 6 });
    }
    // (the panels are a lighter shade of the door)
    const geo = mergeGeometries(k.solid)!;
    const C = geo.attributes.color as THREE.BufferAttribute;
    const base = new THREE.Color(e.color);
    for (let i = 0; i < C.count; i++) if (C.getX(i) === 1 && C.getY(i) === 1 && C.getZ(i) === 1) C.setXYZ(i, Math.min(1, base.r * 1.25), Math.min(1, base.g * 1.25), Math.min(1, base.b * 1.25));
    const mesh = new THREE.Mesh(geo, doorM);
    mesh.castShadow = true;
    const obj = new THREE.Group();
    obj.add(mesh);
    // the hinge is the door's left edge (a portcullis lifts from where it stands)
    const hinge = new THREE.Vector3(e.door === 'lift' ? e.x : e.x - e.w / 2, e.y, e.z).applyMatrix4(M);
    obj.position.copy(hinge);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(M));
    group.add(obj);
    doors.set(s.key, { site: s, entry: e, obj, openAt: -1, knockAt: -1 });
  };

  const set = (list: BuildSite[], at: { x: number; z: number }) => {
    clear();
    sites = list;
    if (!list.length) return;
    const solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
    const closeR = opts.phone ? 110 : 170;
    // the places nearest you get their moving parts, their doors and their signs
    const order = [...list].sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
    let near2 = 0;
    for (const s of order) {
      const M = new THREE.Matrix4().makeRotationY(s.rot).setPosition(s.x, 0, s.z);
      const k = new Kit(M);
      const close = Math.hypot(s.x - at.x, s.z - at.z) < closeR && near2 < (opts.phone ? 14 : 30);
      if (close) near2++;
      const e = build(s, k, M, close && anims.length < (opts.phone ? 24 : 60));
      if (close && e) {
        if (e.door !== 'none') makeDoor(s, e, M);
        sign(M, s.owner ? `@${s.owner}’s ${s.label}` : s.name || s.label, s.emoji, s.color, new THREE.Vector3(e.x, e.signY, e.z + 0.12), e.signW);
      }
      solid.push(...k.solid); glow.push(...k.glow);
    }
    if (solid.length) { const m = new THREE.Mesh(mergeGeometries(solid)!, solidM); m.castShadow = m.receiveShadow = true; group.add(m); meshes.push(m); }
    if (glow.length) { const m = new THREE.Mesh(mergeGeometries(glow)!, glowM); group.add(m); meshes.push(m); }
    for (const g of [...solid, ...glow]) g.dispose();
  };

  return {
    set,
    update: (t: number) => {
      const now = performance.now();
      for (const d of doors.values()) {
        let open = d.openAt < 0 ? 0 : Math.min(1, (now - d.openAt) / 750);
        open = open * open * (3 - 2 * open);
        const shake = d.knockAt >= 0 && now - d.knockAt < 900 ? Math.max(0, Math.sin(((now - d.knockAt) / 280) * Math.PI * 2)) * 0.012 : 0;
        const mesh = d.obj.children[0];
        if (d.entry.door === 'lift') { mesh.position.y = open * d.entry.h * 0.92; mesh.position.z = 0; }
        else { mesh.rotation.y = open * 1.75 * (d.entry.door === 'gate' ? 1.1 : 1); mesh.position.z = -shake; }
      }
      for (const a of anims) {
        if (a.kind === 'spin' && a.axis) a.obj.children.forEach((c) => c.setRotationFromAxisAngle(a.axis!, t * a.speed + a.phase * 6));
        else if (a.kind === 'bob' && a.base) a.obj.position.y = a.base.y + Math.sin(t * a.speed + a.phase * 6) * 0.45;
      }
    },
    /** the place you're at: close enough to walk in, and more or less in front of you */
    at: (x: number, z: number, yaw: number): BuildSite | null => {
      let best: { s: BuildSite; d: number } | null = null;
      for (const s of sites) {
        // distance to its footprint (in its own turned frame)
        const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
        const lx = (x - s.x) * c - (z - s.z) * sn, lz = (x - s.x) * sn + (z - s.z) * c;
        const dx = Math.max(0, Math.abs(lx) - s.w / 2), dz = Math.max(0, Math.abs(lz) - s.d / 2);
        const d = Math.hypot(dx, dz);
        if (d > 7) continue;
        const toward = Math.atan2(s.x - x, -(s.z - z));
        let da = Math.abs(((toward - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d === 0) da = 0;
        if (da > 1.1) continue;
        if (!best || d < best.d) best = { s, d };
      }
      return best?.s ?? null;
    },
    /** knock (on a door) or just open up (a gate, a portcullis): how long until it's open (ms), or -1 */
    knock: (key: string, onKnock?: () => void, onOpen?: () => void): number => {
      const d = doors.get(key);
      if (!d) return 0;
      const now = performance.now();
      if (d.entry.door === 'swing') {
        d.knockAt = now; onKnock?.();
        d.openAt = now + 1000;
        setTimeout(() => onOpen?.(), 1000);
        return 1700;
      }
      d.openAt = now; onOpen?.();
      return 800;
    },
    /** where its way in is (world), and which way you go through it */
    entryOf: (key: string): { at: THREE.Vector3; dir: THREE.Vector3 } | null => {
      const s = sites.find((x) => x.key === key);
      const d = doors.get(key);
      if (!s) return null;
      const M = new THREE.Matrix4().makeRotationY(s.rot).setPosition(s.x, 0, s.z);
      const e = d?.entry;
      const at = new THREE.Vector3(e?.x ?? 0, 0, e ? e.z : s.d / 2).applyMatrix4(M);
      const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(M));
      return { at, dir };
    },
    list: () => sites,
    entryKind: (key: string): Entry['door'] | null => doors.get(key)?.entry.door ?? null,
    counts: () => ({ sites: sites.length, meshes: meshes.length, moving: anims.length, signs: signs.length, doors: doors.size }),
    dispose: () => { clear(); near.remove(group); solidM.dispose(); glowM.dispose(); doorM.dispose(); },
  };
}
export type Builds = ReturnType<typeof createBuilds>;
