// The character kit: a small set of sculpting tools for Paintbrawl's 3D characters (smooth bodies, tapered tubes for
// necks, tails and horns, lathed shapes, leaves, wings) with film-style materials — soft fur sheen, glossy clear-coated
// shells and candy, jelly, bark, stone, metal and glowing parts — and expressive eyes that blink, look and squint.
import * as THREE from 'three';

export type V = [number, number, number];
export type MatKind = 'skin' | 'fur' | 'shell' | 'metal' | 'candy' | 'jelly' | 'stone' | 'leaf' | 'bark' | 'glow' | 'cloth' | 'dark' | 'eye';
export type Eyes = { L: THREE.Group; R: THREE.Group | null; all: THREE.Group[]; blink(k: number): void; look(x: number, y: number): void };
export type Limb = { pivot: THREE.Group; phase: number; amp?: number };

/** A tube along points that tapers from r0 to r1 (necks, tails, horns, tentacles, vines). */
export function taperGeo(pts: THREE.Vector3[], r0: number, r1: number, seg = 24, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(seg, false);
  const pos: number[] = [], nor: number[] = [], idx: number[] = [], uv: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, P = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i], r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2, n = new THREE.Vector3().addScaledVector(N, Math.cos(v)).addScaledVector(B, Math.sin(v));
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r); nor.push(n.x, n.y, n.z); uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

export type EMat = THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
let ramp: THREE.DataTexture | null = null;
/** the three-tone light ramp of the cartoon card art */
function toonRamp() {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true; return ramp;
}

export class Kit {
  readonly root = new THREE.Group();
  readonly mats: THREE.Material[] = [];
  readonly geos: THREE.BufferGeometry[] = [];
  readonly texs: THREE.Texture[] = [];
  /** the materials that flash red when the character is hit */
  readonly tint: EMat[] = [];
  constructor(readonly phone = false, readonly toon = false) {}

  mat(color: string, kind: MatKind = 'skin', extra: THREE.MeshPhysicalMaterialParameters = {}) {
    const base: THREE.MeshPhysicalMaterialParameters = { color, roughness: 0.55, metalness: 0 };
    const c = new THREE.Color(color), light = '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.5).getHexString();
    switch (kind) {
      case 'fur': Object.assign(base, { roughness: 0.85, sheen: 1, sheenRoughness: 0.45, sheenColor: light }); break;
      case 'skin': Object.assign(base, { roughness: 0.5, sheen: 0.35, sheenColor: light, clearcoat: 0.15 }); break;
      case 'shell': Object.assign(base, { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }); break;
      case 'metal': Object.assign(base, { roughness: 0.28, metalness: 0.75, clearcoat: 0.4 }); break;
      case 'candy': Object.assign(base, { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }); break;
      case 'jelly': Object.assign(base, { roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.72, emissive: color, emissiveIntensity: 0.15 }); break;
      case 'stone': Object.assign(base, { roughness: 0.95, flatShading: true }); break;
      case 'leaf': Object.assign(base, { roughness: 0.6, side: THREE.DoubleSide, sheen: 0.4, sheenColor: light }); break;
      case 'bark': Object.assign(base, { roughness: 1, flatShading: true }); break;
      case 'glow': Object.assign(base, { emissive: color, emissiveIntensity: 2.2, roughness: 0.3 }); break;
      case 'cloth': Object.assign(base, { roughness: 0.9, sheen: 0.8, sheenColor: light, side: THREE.DoubleSide }); break;
      case 'dark': Object.assign(base, { roughness: 0.4 }); break;
      case 'eye': Object.assign(base, { roughness: 0.05, clearcoat: 1 }); break;
    }
    Object.assign(base, extra);
    const m: EMat = this.toon
      ? new THREE.MeshToonMaterial({ color: base.color, gradientMap: toonRamp(), side: base.side, transparent: base.transparent, opacity: base.opacity, emissive: kind === 'glow' ? (base.emissive ?? '#000000') : kind === 'jelly' ? base.color : '#000000', emissiveIntensity: kind === 'glow' ? 1.2 : kind === 'jelly' ? 0.25 : 1, map: base.map ?? null, emissiveMap: base.emissiveMap ?? null })
      : this.phone
      ? new THREE.MeshStandardMaterial({ color: base.color, roughness: base.roughness, metalness: base.metalness, flatShading: base.flatShading, side: base.side, transparent: base.transparent, opacity: base.opacity, emissive: base.emissive ?? '#000000', emissiveIntensity: base.emissiveIntensity ?? 1, map: base.map ?? null, emissiveMap: base.emissiveMap ?? null })
      : new THREE.MeshPhysicalMaterial(base);
    m.userData = { e0: m.emissive.clone(), ei0: m.emissiveIntensity, op0: m.opacity, tr0: m.transparent };
    this.mats.push(m); if (kind !== 'eye' && kind !== 'glow' && kind !== 'dark') this.tint.push(m);
    return m;
  }
  /** a texture painted on a canvas (stripes, spots, bark, circuits…) */
  paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    this.texs.push(t); return t;
  }
  private G<X extends THREE.BufferGeometry>(g: X) { this.geos.push(g); return g; }
  mesh(geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, p: V = [0, 0, 0], rot?: V, s?: V) {
    const me = new THREE.Mesh(this.G(geo), m); me.position.set(...p); if (rot) me.rotation.set(...rot); if (s) me.scale.set(...s);
    me.castShadow = !this.phone; parent.add(me); return me;
  }
  g(parent: THREE.Object3D, p: V = [0, 0, 0], rot?: V) { const g = new THREE.Group(); g.position.set(...p); if (rot) g.rotation.set(...rot); parent.add(g); return g; }
  sphere(parent: THREE.Object3D, r: number, m: THREE.Material, p: V = [0, 0, 0], s?: V, seg = this.phone ? 18 : 28) { return this.mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), m, parent, p, undefined, s); }
  cap(parent: THREE.Object3D, r: number, len: number, m: THREE.Material, p: V = [0, 0, 0], rot?: V) { return this.mesh(new THREE.CapsuleGeometry(r, len, 6, this.phone ? 10 : 16), m, parent, p, rot); }
  cone(parent: THREE.Object3D, r: number, h: number, m: THREE.Material, p: V = [0, 0, 0], rot?: V, seg = 14) { return this.mesh(new THREE.ConeGeometry(r, h, seg), m, parent, p, rot); }
  cyl(parent: THREE.Object3D, r0: number, r1: number, h: number, m: THREE.Material, p: V = [0, 0, 0], rot?: V, seg = 16) { return this.mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m, parent, p, rot); }
  torus(parent: THREE.Object3D, R: number, r: number, m: THREE.Material, p: V = [0, 0, 0], rot?: V, arc = Math.PI * 2) { return this.mesh(new THREE.TorusGeometry(R, r, 8, 28, arc), m, parent, p, rot); }
  box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, p: V = [0, 0, 0], rot?: V) { return this.mesh(new THREE.BoxGeometry(w, h, d), m, parent, p, rot); }
  ico(parent: THREE.Object3D, r: number, m: THREE.Material, p: V = [0, 0, 0], detail = 0, s?: V) { return this.mesh(new THREE.IcosahedronGeometry(r, detail), m, parent, p, undefined, s); }
  tube(parent: THREE.Object3D, pts: V[], r0: number, r1: number, m: THREE.Material, p: V = [0, 0, 0]) { return this.mesh(taperGeo(pts.map((q) => new THREE.Vector3(...q)), r0, r1, this.phone ? 14 : 24, this.phone ? 7 : 10), m, parent, p); }
  lathe(parent: THREE.Object3D, prof: [number, number][], m: THREE.Material, p: V = [0, 0, 0], seg = this.phone ? 18 : 30) { return this.mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg), m, parent, p); }
  /** a flat leaf / petal / feather shape */
  leaf(parent: THREE.Object3D, len: number, wid: number, m: THREE.Material, p: V = [0, 0, 0], rot?: V) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(wid, len * 0.4, 0, len); s.quadraticCurveTo(-wid, len * 0.4, 0, 0);
    return this.mesh(new THREE.ShapeGeometry(s, 8), m, parent, p, rot);
  }
  /** a wing: bat (webbed), feather (rounded fan), bug (clear oval), moth (big patterned) */
  wing(parent: THREE.Object3D, kind: 'bat' | 'feather' | 'bug' | 'moth', size: number, m: THREE.Material, p: V, side: 1 | -1) {
    const piv = this.g(parent, p);
    const s = new THREE.Shape();
    if (kind === 'bat') { s.moveTo(0, 0); s.lineTo(0.15, 0.55); s.lineTo(0.95, 0.75); s.quadraticCurveTo(0.8, 0.45, 0.9, 0.3); s.quadraticCurveTo(0.65, 0.25, 0.65, 0.05); s.quadraticCurveTo(0.4, 0.1, 0.35, -0.08); s.quadraticCurveTo(0.2, 0, 0, 0); }
    else if (kind === 'feather') { s.moveTo(0, 0); s.quadraticCurveTo(0.2, 0.55, 0.85, 0.5); s.quadraticCurveTo(0.95, 0.3, 0.8, 0.2); s.quadraticCurveTo(0.9, 0.05, 0.6, 0.0); s.quadraticCurveTo(0.3, -0.1, 0, 0); }
    else if (kind === 'bug') { s.absellipse(0.42, 0.12, 0.45, 0.16, 0, Math.PI * 2, false, 0.2); }
    else { s.moveTo(0, 0); s.bezierCurveTo(0.3, 0.9, 1.0, 0.95, 0.95, 0.35); s.bezierCurveTo(1.0, 0.0, 0.6, -0.5, 0.35, -0.45); s.quadraticCurveTo(0.1, -0.2, 0, 0); }
    m.side = THREE.DoubleSide;
    const w = this.mesh(new THREE.ShapeGeometry(s, 12), m, piv, [0, 0, 0], undefined, [side * size, size, size]);
    w.castShadow = false; piv.userData.side = side;
    return piv;
  }
  /** a leg from a hip pivot (swing it by rotating the pivot), with a rounded foot */
  leg(parent: THREE.Object3D, hip: V, len: number, r: number, m: THREE.Material, foot?: THREE.Material, phase = 0): Limb {
    const pivot = this.g(parent, hip);
    this.cap(pivot, r, Math.max(0.01, len - r * 2), m, [0, -len / 2, 0]);
    this.sphere(pivot, r * 1.35, foot ?? m, [0, -len + r * 0.4, r * 0.5], [1, 0.6, 1.4], 12);
    return { pivot, phase };
  }
  /** big expressive eyes with lids that blink and squint, irises that look around */
  eyes(head: THREE.Object3D, o: { y: number; z: number; spread: number; r: number; iris: string; lid: THREE.Material; one?: boolean; tilt?: number; glow?: boolean; sclera?: string }): Eyes {
    const sclera = this.mat(o.sclera ?? '#FFFFFF', 'eye'), irisM = this.mat(o.iris, o.glow ? 'glow' : 'eye'), pupilM = this.mat('#0A0812', 'eye'), shine = this.mat('#FFFFFF', 'glow');
    const make = (x: number, side: number) => {
      const eg = this.g(head, [x, o.y, o.z]); eg.rotation.y = x * 0.9; eg.rotation.z = (o.tilt ?? 0) * side;
      this.sphere(eg, o.r, sclera, [0, 0, 0], [1, 1, 0.75], 20);
      const look = this.g(eg, [0, 0, 0]);
      this.sphere(look, o.r * 0.6, irisM, [0, 0, o.r * 0.55], [1, 1, 0.35], 16);
      this.sphere(look, o.r * 0.3, pupilM, [0, 0, o.r * 0.7], [1, 1, 0.3], 12);
      this.sphere(look, o.r * 0.13, shine, [o.r * 0.22, o.r * 0.24, o.r * 0.78], undefined, 8);
      this.sphere(look, o.r * 0.07, shine, [-o.r * 0.16, -o.r * 0.18, o.r * 0.78], undefined, 6);
      const lid = this.g(eg, [0, 0, 0]);
      this.mesh(new THREE.SphereGeometry(o.r * 1.08, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), o.lid, lid);
      lid.rotation.x = -1.0; eg.userData.lid = lid; eg.userData.look = look;
      return eg;
    };
    const L = o.one ? make(0, 1) : make(-o.spread, -1), R = o.one ? null : make(o.spread, 1);
    const all = [L, R].filter(Boolean) as THREE.Group[];
    return {
      L, R, all,
      blink(k) { for (const e of all) (e.userData.lid as THREE.Group).rotation.x = -1.0 + k * 2.4; },
      look(x, y) { for (const e of all) (e.userData.look as THREE.Group).rotation.set(-y * 0.35, x * 0.45, 0); },
    };
  }
  /** a mouth that opens (scale the returned jaw's y), with optional fangs and tongue */
  mouth(head: THREE.Object3D, p: V, w: number, o: { fangs?: number; tongue?: boolean; color?: string; teeth?: boolean } = {}) {
    const jaw = this.g(head, p);
    const inner = this.mat(o.color ?? '#3A0E1E', 'dark');
    this.sphere(jaw, w, inner, [0, 0, 0], [1, 0.5, 0.45], 16);
    if (o.tongue) this.sphere(jaw, w * 0.55, this.mat('#FF6A8A', 'skin'), [0, -w * 0.12, w * 0.12], [1, 0.35, 0.8], 10);
    const white = this.mat('#FFFDF4', 'eye');
    for (let i = 0; i < (o.fangs ?? 0); i++) { const x = (i - (o.fangs! - 1) / 2) * w * 0.55; this.cone(jaw, w * 0.12, w * 0.32, white, [x, w * 0.18, w * 0.22], [Math.PI, 0, 0], 6); }
    if (o.teeth) for (let i = 0; i < 5; i++) this.cone(jaw, w * 0.09, w * 0.2, white, [(i - 2) * w * 0.32, w * 0.2, w * 0.3], [Math.PI, 0, 0], 5);
    jaw.scale.y = 0.25;
    return jaw;
  }
  dispose() { for (const x of this.geos) x.dispose(); for (const x of this.mats) x.dispose(); for (const x of this.texs) x.dispose(); }
}
