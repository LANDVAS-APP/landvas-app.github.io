// Shared bits for building the 3D party worlds: little helpers for meshes, merging still scenery into a few draw
// calls, instancing lots of the same thing, drifting points, and the pads on the floor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../party/kit';
import type { Ob, P3, W3 } from './sims';

export type Seat3 = { id: string; name: string; color: string; url: string };
export type Ctx = {
  scene: THREE.Scene; root: THREE.Group; dyn: THREE.Group; props: THREE.Group[]; w: W3; obs: Ob[]; phone: boolean; r: () => number;
  T: <X extends { dispose(): void }>(x: X) => X;
  std: (c: string, p?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;
  tex: (w: number, h: number, d: (g: CanvasRenderingContext2D) => void, rep?: number) => THREE.CanvasTexture;
  prop: () => THREE.Group;
  /** each player's colour, in the same order as the world's players */ colors: string[];
};
export type Env = { update(w: W3, t: number, dt: number): void; sky: string; fog: [string, number, number]; light: 'day' | 'night' | 'lava' | 'ball' | 'snow' | 'dusk'; hidden?(w: W3, viewer: P3 | undefined, other: P3): number; occluders?: THREE.Object3D[] };
export const mesh = (ctx: Ctx, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = ctx.root) => { const o = new THREE.Mesh(ctx.T(g), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
export const flat = (o: THREE.Object3D) => { o.rotation.x = -Math.PI / 2; o.castShadow = false; return o; };

/** merge every plain mesh under a group into one mesh per material (and shadow setting) */
export function bake(group: THREE.Group, T: Ctx['T']) {
  group.updateMatrixWorld(true);
  const by = new Map<string, { m: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const gone: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || o.userData.keep || Array.isArray(o.material)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv || !g.attributes.normal) { g.dispose(); return; }
    g.clearGroups(); g.applyMatrix4(o.matrixWorld);
    const key = o.material.uuid + (o.castShadow ? '1' : '0');
    let b = by.get(key); if (!b) by.set(key, (b = { m: o.material, cast: o.castShadow, geos: [] }));
    b.geos.push(g); gone.push(o);
  });
  for (const o of gone) o.removeFromParent();
  for (const c of [...group.children]) if (!c.userData.keep) c.removeFromParent();
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1); group.updateMatrixWorld(true);
  for (const b of by.values()) {
    const merged = mergeGeometries(b.geos); b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(T(merged), b.m); m.castShadow = b.cast; m.receiveShadow = true; group.add(m);
  }
}
/** lots of the same little thing in one draw call */
export type Inst = { x: number; y: number; z: number; s?: number; sy?: number; ry?: number; rx?: number; c?: string };
export function scatter(ctx: Ctx, geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], shadow = false) {
  const im = new THREE.InstancedMesh(ctx.T(geo), mat, Math.max(1, items.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  items.forEach((it, i) => { q.setFromEuler(e.set(it.rx ?? 0, it.ry ?? 0, 0)); m4.compose(v.set(it.x, it.y, it.z), q, sc.set(it.s ?? 1, it.sy ?? it.s ?? 1, it.s ?? 1)); im.setMatrixAt(i, m4); if (it.c) im.setColorAt(i, col.set(it.c)); });
  im.count = items.length; im.castShadow = shadow; im.receiveShadow = true; im.userData.keep = true; ctx.scene.add(im); return im;
}
/** a fence or wall of posts round a square map */
export function perimeter(ctx: Ctx, H: number, every: number, f: (x: number, z: number, along: 'x' | 'z') => void) {
  for (let k = -H; k <= H + 0.01; k += every) { f(k, -H, 'x'); f(k, H, 'x'); f(-H, k, 'z'); f(H, k, 'z'); }
}
/** points that drift (fireflies, embers, sparkles) */
export function motes(ctx: Ctx, n: number, color: string, size: number) {
  const pos = new Float32Array(n * 3), g = ctx.T(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = ctx.T(new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; ctx.scene.add(pts);
  return { pts, pos, m, done: () => { g.attributes.position.needsUpdate = true; } };
}
export function grassTex(ctx: Ctx, base: string, a: string, b: string, seed: number, rep: number) {
  return ctx.tex(512, 512, (g) => { g.fillStyle = base; g.fillRect(0, 0, 512, 512); const r = rng(seed); for (let i = 0; i < 6000; i++) { g.fillStyle = r() < 0.5 ? a : b; g.fillRect(r() * 512, r() * 512, 2, 4); } }, rep);
}


/** the pads on the floor: boost arrows (animated), trampolines (that squash), goo puddles */
export function padArt(ctx: Ctx, o: Ob, goo = '#FF7AC8') {
  if (o.k !== 'z') return null;
  if (o.m === 'boost') {
    const t = ctx.tex(64, 128, (g) => { g.fillStyle = '#FF3D9A'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#FFE14D'; for (let y = 0; y < 128; y += 32) { g.beginPath(); g.moveTo(8, y + 26); g.lineTo(32, y + 6); g.lineTo(56, y + 26); g.lineTo(46, y + 26); g.lineTo(32, y + 14); g.lineTo(18, y + 26); g.fill(); } }, 1);
    t.repeat.set(1, 1.5);
    const p = mesh(ctx, new THREE.PlaneGeometry(1.5, 2.6), ctx.std('#ffffff', { map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.4 }), o.x, 0.02, o.z, ctx.dyn); flat(p); p.rotation.z = (o.a ?? 0) + Math.PI;
    return { update: (_w: W3, t2: number) => { t.offset.y = -t2 * 1.6; } };
  }
  if (o.m === 'bounce') {
    mesh(ctx, new THREE.TorusGeometry(0.9, 0.12, 8, 28), ctx.std('#22B8CF', { roughness: 0.4 }), o.x, 0.35, o.z).rotation.x = Math.PI / 2;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; mesh(ctx, new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6), ctx.std('#555'), o.x + Math.sin(a) * 0.85, 0.17, o.z + Math.cos(a) * 0.85); }
    const mat = mesh(ctx, new THREE.CircleGeometry(0.85, 28), ctx.std('#1B1B2E', { roughness: 0.6 }), o.x, 0.34, o.z, ctx.dyn); flat(mat);
    let k = 0;
    return { update: (w: W3, _t: number, dt: number) => { if (w.ps.some((p) => Math.hypot(p.x - o.x, p.z - o.z) < 0.9 && p.y < 0.6 && p.vy > 3)) k = 1; k = Math.max(0, k - dt * 4); mat.position.y = 0.34 - k * 0.25; } };
  }
  if (o.m === 'goo') { const g = mesh(ctx, new THREE.CircleGeometry(o.r, 28), ctx.std(goo, { roughness: 0.08, metalness: 0.1, emissive: goo, emissiveIntensity: 0.12 }), o.x, 0.02, o.z); flat(g); g.scale.set(1, 0.8 + (o.r % 0.2), 1); }
  return null;
}
export type PadArt = ReturnType<typeof padArt>;
void (null as unknown as P3);
