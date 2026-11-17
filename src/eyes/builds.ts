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
import { buildMonument } from './monuments';

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
  /** how many cells across and down it is ("2x2") */
  cells?: string;
  /** (an ultra's monument) its light; tier 0 an ultra, 1 a fusion, 2 a Primordial */
  glow?: string;
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
export class Kit {
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

/** a moving part: built round its own pivot; it turns (about an axis) or bobs up and down */
export type PartKind = 'spin' | 'bob';
export type PartFn = (at: THREE.Vector3, kind: PartKind, speed: number, fill: (k: Kit) => void, axis?: THREE.Vector3) => void;

/**
 * The moving parts are drawn by the graphics chip: every vertex knows its part's pivot, axis, speed and phase, and the
 * shader turns (or bobs) it. Nothing moves on the main thread, so a whole town's Ferris wheels, windmills, gears,
 * portals and floating islands cost nothing per frame, near or far.
 */
const ROT = `
  attribute vec3 aPivot; attribute vec3 aAxis; attribute vec4 aAnim;
  uniform float uTime;
  mat3 lvRot(vec3 k, float a) {
    float c = cos(a), s = sin(a), t = 1.0 - c;
    return mat3(t * k.x * k.x + c, t * k.x * k.y + s * k.z, t * k.x * k.z - s * k.y,
                t * k.x * k.y - s * k.z, t * k.y * k.y + c, t * k.y * k.z + s * k.x,
                t * k.x * k.z + s * k.y, t * k.y * k.z - s * k.x, t * k.z * k.z + c);
  }`;
function moving<M extends THREE.Material>(m: M, uTime: { value: number }): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${ROT}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (aAnim.x > 0.5 && aAnim.x < 1.5) objectNormal = lvRot(aAxis, uTime * aAnim.y + aAnim.z) * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float lvA = uTime * aAnim.y + aAnim.z;
          if (aAnim.x > 1.5) transformed.y += sin(lvA) * aAnim.w;
          else if (aAnim.x > 0.5) transformed = aPivot + lvRot(aAxis, lvA) * (transformed - aPivot);
        }`);
  };
  m.customProgramCacheKey = () => 'lv-builds-moving';
  return m;
}

/** one place, built (cached until what it is changes) */
type Place = {
  key: string; sig: string; signSig: string; site: BuildSite; chunk: string;
  solid: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null;
  mSolid: THREE.BufferGeometry | null; mGlow: THREE.BufferGeometry | null;
  entry: Entry | null; parts: number;
  /** near you: its door and its sign */
  close: boolean; sign: THREE.Mesh | null;
};
/** what a place looks like (its sign aside): by its cells, not where it is in the view's coordinates (those move) */
const sigOf = (s: BuildSite) => `${s.kind}|${s.family}|${s.tier}|${s.gx}|${s.gy}|${s.cells ?? `${s.w.toFixed(0)}x${s.d.toFixed(0)}`}|${s.rot.toFixed(3)}|${s.color}`;
const signSigOf = (s: BuildSite) => `${s.owner}|${s.name}|${s.label}|${s.emoji}|${s.color}`;
/** places are drawn a square of ground at a time (16 × 16 plots: changing one only draws its square again) */
const chunkOf = (s: BuildSite) => `${Math.floor(s.gx / 16)}_${Math.floor(s.gy / 16)}`;

const merge = (list: THREE.BufferGeometry[]) => {
  if (!list.length) return null;
  const g = list.length === 1 ? list[0] : mergeGeometries(list)!;
  if (list.length > 1) for (const x of list) x.dispose();
  return g;
};
/** the extra numbers a moving part's vertices carry (see ROT) */
function markPart(g: THREE.BufferGeometry, pivot: THREE.Vector3, axis: THREE.Vector3, kind: PartKind, speed: number, phase: number) {
  const n = (g.attributes.position as THREE.BufferAttribute).count;
  const P = new Float32Array(n * 3), X = new Float32Array(n * 3), A = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    P[i * 3] = pivot.x; P[i * 3 + 1] = pivot.y; P[i * 3 + 2] = pivot.z;
    X[i * 3] = axis.x; X[i * 3 + 1] = axis.y; X[i * 3 + 2] = axis.z;
    A[i * 4] = kind === 'spin' ? 1 : 2; A[i * 4 + 1] = speed; A[i * 4 + 2] = phase; A[i * 4 + 3] = 0.45;
  }
  g.setAttribute('aPivot', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aAxis', new THREE.BufferAttribute(X, 3));
  g.setAttribute('aAnim', new THREE.BufferAttribute(A, 4));
  return g;
}

export function createBuilds(near: THREE.Scene, opts: { phone: boolean; onChange?: () => void }) {
  const group = new THREE.Group();
  group.userData.layer = 'builds';
  near.add(group);
  const uTime = { value: 0 };
  const solidM = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowM = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mSolidM = moving(new THREE.MeshLambertMaterial({ vertexColors: true }), uTime);
  const mGlowM = moving(new THREE.MeshBasicMaterial({ vertexColors: true }), uTime);
  const doorM = new THREE.MeshLambertMaterial({ vertexColors: true });
  let sites: BuildSite[] = [];
  const places = new Map<string, Place>();
  /** a square's places are built round its own origin (ox, oz), so moving the view's coordinates only moves that */
  type Chunk = { key: string; keys: Set<string>; meshes: THREE.Mesh[]; dirty: boolean; ox: number; oz: number };
  const chunks = new Map<string, Chunk>();
  type Door = { site: BuildSite; entry: Entry; obj: THREE.Group; openAt: number; knockAt: number };
  const doors = new Map<string, Door>();
  /** places still to build (nearest first), and how many each square is waiting for */
  let queue: BuildSite[] = [];
  const waiting = new Map<string, number>();
  let at = { x: 0, z: 0 };

  /** a moving part's geometry, in world space, marked with its pivot and how it moves */
  const partsOf = (M: THREE.Matrix4, s: BuildSite) => {
    const solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
    let n = 0;
    const rot = new THREE.Matrix4().extractRotation(M);
    const fn: PartFn = (p, kind, speed, fill, axis) => {
      const pivot = p.clone().applyMatrix4(M);
      const k = new Kit(M.clone().multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
      fill(k);
      const ax = (axis ?? new THREE.Vector3(0, 1, 0)).clone().applyMatrix4(rot).normalize();
      const phase = hash(pivot.x * 0.1 + pivot.z + s.gx * 0.01) * 6;
      const sg = merge(k.solid), gg = merge(k.glow);
      if (sg) solid.push(markPart(sg, pivot, ax, kind, speed, phase));
      if (gg) glow.push(markPart(gg, pivot, ax, kind, speed, phase));
      n++;
    };
    return { fn, solid, glow, count: () => n };
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
    return m;
  };

  // ---- the places ------------------------------------------------------------------------------------------------------
  const build = (s: BuildSite, k: Kit, M: THREE.Matrix4, part: PartFn): Entry | null => {
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
          part(new THREE.Vector3(0, y0 + R + 1, 0), 'spin', 0.25, (w) => {
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
          part(new THREE.Vector3(0, y0 + 15.5, -D * 0.05), 'spin', 0.6, (w) => { w.cyl(0.05, 0.05, 2.2, 0, 0, 0, '#ddd').box(1.6, 0.9, 0.04, 0.85, 1.2, 0, A); }, new THREE.Vector3(0, 1, 0));
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
        if (T) {
          // a ranch's windmill
          const mx = W * 0.32, mz = -D * 0.3;
          k.cyl(0.5, 0.18, 7, mx, y0, mz, '#d8d2c4', { seg: 6 });
          part(new THREE.Vector3(mx, y0 + 7, mz + 0.3), 'spin', 1.2, (w) => { for (let i = 0; i < 4; i++) w.box(0.35, 2.4, 0.05, 0, 0, 0, '#f4efe4', { rz: (i / 4) * Math.PI * 2 }); w.ball(0.2, 0, 0, 0, '#555'); }, new THREE.Vector3(0, 0, 1));
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
        if (T >= 2) part(new THREE.Vector3(0, y0 + R * 1.5, -R * 0.25), 'spin', 0.3, (w) => { w.cone(1.6, 9, 0, 0, 0, '#7c5cff', { glow: true, seg: 6 }).cone(1.6, 4, 0, 0, 0, '#c4b5ff', { glow: true, seg: 6, rx: Math.PI }); }, new THREE.Vector3(0, 1, 0));
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
        part(new THREE.Vector3(0, y0 + 7 + T * 3, 0), 'bob', 0.6, fill);
        if (T >= 1) for (let i = 0; i < 3; i++) {
          const a = (i / 3) * 6.28 + 0.5;
          part(new THREE.Vector3(Math.cos(a) * R * 1.4, y0 + 12 + i * 2.5, Math.sin(a) * R * 1.4), 'bob', 0.4 + i * 0.1, (w) => {
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
        part(new THREE.Vector3(0, y0 + 3.6, -D * 0.12 + sd / 2 + 0.15), 'spin', 0.8, (w) => {
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
        if (T >= 2) part(new THREE.Vector3(0, y0 + 5, -D * 0.2), 'spin', 1.4, (w) => { w.ring(3, 0.35, 0, 0, 0, '#b23cff', { glow: true, seg: 32 }).ring(2.2, 0.2, 0, 0, 0, '#ff4fd8', { glow: true, seg: 28 }).ring(1.3, 0.15, 0, 0, 0, '#22e3ff', { glow: true, seg: 24 }); }, new THREE.Vector3(0, 0, 1));
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
      case 'monument':
        buildMonument(s, k, part, s.glow ?? '#ffffff', s.tier === 2);
        break;
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
    for (const g of k.solid) g.dispose();
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
  const siteM = (s: BuildSite) => new THREE.Matrix4().makeRotationY(s.rot).setPosition(s.x, 0, s.z);

  // ---- near you: doors and signs (only the places close by have them) ---------------------------------------------------
  const closeR = opts.phone ? 110 : 170, maxClose = opts.phone ? 14 : 30;
  const dropClose = (p: Place) => {
    p.close = false;
    if (p.sign) { group.remove(p.sign); (p.sign.material as THREE.MeshBasicMaterial).map?.dispose(); (p.sign.material as THREE.Material).dispose(); p.sign.geometry.dispose(); p.sign = null; }
    const d = doors.get(p.key);
    if (d) { group.remove(d.obj); d.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); doors.delete(p.key); }
  };
  const makeClose = (p: Place) => {
    p.close = true;
    const s = p.site, e = p.entry;
    if (!e) return;
    const M = siteM(s);
    if (e.door !== 'none') makeDoor(s, e, M);
    p.sign = sign(M, s.owner ? `@${s.owner}’s ${s.label}` : s.name || s.label, s.emoji, s.color, new THREE.Vector3(e.x, e.signY, e.z + 0.12), e.signW);
  };
  /** which places are near enough to have their doors and signs (a few more each time: no burst of work) */
  const refreshClose = (burst = 4) => {
    const list = [...places.values()].map((p) => ({ p, d: Math.hypot(p.site.x - at.x, p.site.z - at.z) })).sort((a, b) => a.d - b.d);
    let n = 0, made = 0;
    for (const { p, d } of list) {
      // (a little further to leave than to arrive, so walking along the edge doesn't flicker)
      const want = n < maxClose && d < (p.close ? closeR * 1.2 : closeR);
      if (want) n++;
      if (want && !p.close) { if (made < burst) { makeClose(p); made++; } }
      else if (!want && p.close) dropClose(p);
    }
  };

  // ---- building: a place at a time, a square at a time --------------------------------------------------------------
  const buildPlace = (s: BuildSite) => {
    const ck = chunkOf(s);
    let c = chunks.get(ck);
    if (!c) { c = { key: ck, keys: new Set(), meshes: [], dirty: true, ox: Math.round(s.x), oz: Math.round(s.z) }; chunks.set(ck, c); }
    // (built round the square's origin)
    const M = new THREE.Matrix4().makeTranslation(-c.ox, 0, -c.oz).multiply(siteM(s));
    const k = new Kit(M);
    const parts = partsOf(M, s);
    const entry = build(s, k, M, parts.fn);
    made++;
    const p: Place = {
      key: s.key, sig: sigOf(s), signSig: signSigOf(s), site: s, chunk: ck,
      solid: merge(k.solid), glow: merge(k.glow), mSolid: merge(parts.solid), mGlow: merge(parts.glow),
      entry, parts: parts.count(), close: false, sign: null,
    };
    places.set(s.key, p);
    c.keys.add(s.key); c.dirty = true;
  };
  const dropPlace = (p: Place) => {
    dropClose(p);
    for (const g of [p.solid, p.glow, p.mSolid, p.mGlow]) g?.dispose();
    places.delete(p.key);
    const c = chunks.get(p.chunk);
    if (c) { c.keys.delete(p.key); c.dirty = true; }
  };
  /** a square's meshes, made again from its places (each already built: this only joins them up) */
  const drawChunk = (c: Chunk) => {
    for (const m of c.meshes) { group.remove(m); m.geometry.dispose(); }
    c.meshes = []; c.dirty = false;
    if (!c.keys.size) { chunks.delete(c.key); return; }
    const ps = [...c.keys].map((k) => places.get(k)!).filter(Boolean);
    const join = (list: (THREE.BufferGeometry | null)[]) => { const l = list.filter((g): g is THREE.BufferGeometry => !!g); return l.length ? (l.length === 1 ? l[0].clone() : mergeGeometries(l)!) : null; };
    const add = (g: THREE.BufferGeometry | null, m: THREE.Material, cast: boolean, receive: boolean, pad = 0) => {
      if (!g) return;
      g.computeBoundingSphere();
      if (pad && g.boundingSphere) g.boundingSphere.radius += pad;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      mesh.position.set(c.ox, 0, c.oz);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh); c.meshes.push(mesh);
    };
    add(join(ps.map((p) => p.solid)), solidM, true, true);
    add(join(ps.map((p) => p.glow)), glowM, false, false);
    add(join(ps.map((p) => p.mSolid)), mSolidM, true, false, 1.5);
    add(join(ps.map((p) => p.mGlow)), mGlowM, false, false, 1.5);
  };
  /** build what's waiting, for at most `ms` milliseconds; draw the squares that are ready */
  const work = (ms: number) => {
    const t0 = performance.now();
    let changed = false;
    while (queue.length && performance.now() - t0 < ms) {
      const s = queue.shift()!;
      const ck = chunkOf(s);
      waiting.set(ck, (waiting.get(ck) ?? 1) - 1);
      if (!places.has(s.key)) buildPlace(s);
    }
    for (const c of [...chunks.values()]) {
      if (!c.dirty || (waiting.get(c.key) ?? 0) > 0) continue;
      drawChunk(c); changed = true;
      if (performance.now() - t0 > ms) break;
    }
    if (changed) { refreshClose(); opts.onChange?.(); }
    return queue.length > 0 || [...chunks.values()].some((c) => c.dirty);
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const kick = () => {
    if (timer) return;
    const step = () => { timer = null; if (work(opts.phone ? 5 : 7)) timer = setTimeout(step, 12); };
    timer = setTimeout(step, 0);
  };

  /** (tests) how many places have been built, and how many built again because they'd changed */
  let made = 0, remade = 0;
  const set = (list: BuildSite[], here: { x: number; z: number }) => {
    sites = list;
    at = { x: here.x, z: here.z };
    const want = new Map(list.map((s) => [s.key, s]));
    // gone, or changed into something else: taken down
    for (const p of [...places.values()]) {
      const s = want.get(p.key);
      if (s && sigOf(s) !== p.sig) remade++;
      if (!s || sigOf(s) !== p.sig) dropPlace(p);
      else {
        p.site = s;
        // (renamed, or someone new owns it: just its sign)
        if (signSigOf(s) !== p.signSig) { p.signSig = signSigOf(s); if (p.close) { dropClose(p); makeClose(p); } }
      }
    }
    // new: built nearest first, a few at a time
    queue = list.filter((s) => !places.has(s.key)).sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
    waiting.clear();
    for (const s of queue) waiting.set(chunkOf(s), (waiting.get(chunkOf(s)) ?? 0) + 1);
    // (one or two new places, like a plot just bought: there and then)
    if (queue.length <= 3) work(Infinity);
    else if (work(opts.phone ? 6 : 10)) kick();
    if (!queue.length && ![...chunks.values()].some((c) => c.dirty)) refreshClose();
  };

  let lastClose = 0;
  return {
    set,
    update: (t: number, here?: { x: number; z: number }) => {
      uTime.value = t;
      const now = performance.now();
      if (here && now - lastClose > 400) { lastClose = now; at = { x: here.x, z: here.z }; refreshClose(2); }
      for (const d of doors.values()) {
        let open = d.openAt < 0 ? 0 : Math.min(1, (now - d.openAt) / 750);
        open = open * open * (3 - 2 * open);
        const shake = d.knockAt >= 0 && now - d.knockAt < 900 ? Math.max(0, Math.sin(((now - d.knockAt) / 280) * Math.PI * 2)) * 0.012 : 0;
        const mesh = d.obj.children[0];
        if (d.entry.door === 'lift') { mesh.position.y = open * d.entry.h * 0.92; mesh.position.z = 0; }
        else { mesh.rotation.y = open * 1.75 * (d.entry.door === 'gate' ? 1.1 : 1); mesh.position.z = -shake; }
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
      let d = doors.get(key);
      // (walked straight up to it before its door was hung: hang it now)
      const p = places.get(key);
      if (!d && p && !p.close && p.entry && p.entry.door !== 'none') { makeClose(p); d = doors.get(key); }
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
      if (!s) return null;
      const M = siteM(s);
      const e = places.get(key)?.entry ?? null;
      const at2 = new THREE.Vector3(e?.x ?? 0, 0, e ? e.z : s.d / 2).applyMatrix4(M);
      const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(M));
      return { at: at2, dir };
    },
    list: () => sites,
    /** the view's coordinates moved (dx, dz) metres: everything here keeps its place in the world */
    shift: (dx: number, dz: number) => {
      for (const c of chunks.values()) { c.ox -= dx; c.oz -= dz; for (const m of c.meshes) { m.position.set(c.ox, 0, c.oz); m.updateMatrix(); } }
      const seen = new Set<BuildSite>();
      for (const s of [...sites, ...queue, ...[...places.values()].map((p) => p.site)]) { if (seen.has(s)) continue; seen.add(s); s.x -= dx; s.z -= dz; }
      for (const d of doors.values()) { d.obj.position.x -= dx; d.obj.position.z -= dz; }
      for (const p of places.values()) if (p.sign) { p.sign.position.x -= dx; p.sign.position.z -= dz; }
      at = { x: at.x - dx, z: at.z - dz };
    },
    has: (key: string) => places.has(key) || queue.some((s) => s.key === key),
    /** still building some (or drawing their squares) */
    busy: () => queue.length > 0 || [...chunks.values()].some((c) => c.dirty),
    entryKind: (key: string): Entry['door'] | null => doors.get(key)?.entry.door ?? null,
    counts: () => {
      let meshes = 0, moving = 0, signs = 0;
      for (const c of chunks.values()) meshes += c.meshes.length;
      for (const p of places.values()) { if (p.parts) moving++; if (p.sign) signs++; }
      return { sites: sites.length, built: places.size, chunks: chunks.size, meshes, moving, signs, doors: doors.size, waiting: queue.length, made, remade };
    },
    dispose: () => {
      if (timer) clearTimeout(timer);
      for (const p of [...places.values()]) dropPlace(p);
      for (const c of chunks.values()) for (const m of c.meshes) { group.remove(m); m.geometry.dispose(); }
      chunks.clear();
      near.remove(group); solidM.dispose(); glowM.dispose(); mSolidM.dispose(); mGlowM.dispose(); doorM.dispose();
    },
  };
}
export type Builds = ReturnType<typeof createBuilds>;
