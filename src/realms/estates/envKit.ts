// Shared building blocks for the Estate worlds. Every Estate keeps the realm layout players already know (the
// minigame at the back, stash and build board either side, maker and market forward, collection at the front, six
// zones round the edge) — but each one dresses it in a completely different world.
import * as THREE from 'three';
import { mesh, scatter, type Ctx, type Inst } from '../../home/live3d/kit3d';
import type { Spot, Station } from '../realm3d';

export { THREE, mesh, scatter };
export type { Ctx, Inst };
export const BOUNDS: [number, number] = [9.5, 7];
export const spots = (labels: Record<Station, string>): Record<Station, Spot> => ({
  play: { x: 0, z: -5.4, label: labels.play }, collect: { x: -6.8, z: -2.6, label: labels.collect }, build: { x: 6.8, z: -2.6, label: labels.build },
  make: { x: -6.8, z: 3.4, label: labels.make }, market: { x: 6.8, z: 3.4, label: labels.market }, book: { x: 0, z: 6, label: labels.book },
});
export const ZONE_AT: [number, number][] = [[-13.5, -6], [-13.5, 4], [-5.5, -13], [5.5, -13], [13.5, -6], [13.5, 4]];
export type Zone = { open: THREE.Group; locked: THREE.Group; at: [number, number] };
/** build the six zones: f gets a group already placed at the zone and turned to face the middle */
export function zones(f: (i: number, open: THREE.Group, locked: THREE.Group) => void): Zone[] {
  return ZONE_AT.map(([x, z], i) => {
    const open = new THREE.Group(), locked = new THREE.Group();
    const o = new THREE.Group(), l = new THREE.Group();
    o.position.set(x, 0, z); l.position.set(x, 0, z); o.rotation.y = l.rotation.y = Math.atan2(-x, -z);
    open.add(o); locked.add(l); f(i, o, l);
    return { open, locked, at: [x, z] };
  });
}
/** where the k-th copy of the i-th producer stands in its zone */
export const pspot = (i: number, k: number): [number, number] => { const [x, z] = ZONE_AT[i]; const side = x < -1 ? 1 : x > 1 ? -1 : 0; return [x + side * 2.6 + (side ? 0 : (k - 1.5) * 1.6), z + (side ? (k - 1.5) * 1.5 : 2.6)]; };
/** mark a subtree as animated (so it isn't merged into the still scenery) */
export const keep = <T extends THREE.Object3D>(o: T): T => { o.traverse((c) => { c.userData.keep = true; }); return o; };
export const glow = (ctx: Ctx, parent: THREE.Object3D, x: number, y: number, z: number, c: string, s = 0.18, k = 1.8) =>
  mesh(ctx, new THREE.SphereGeometry(s, 12, 10), ctx.std(c, { emissive: c, emissiveIntensity: k }), x, y, z, parent);
export const box = (ctx: Ctx, p: THREE.Object3D, w: number, h: number, d: number, c: string | THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(ctx, new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? ctx.std(c) : c, x, y, z, p);
export const cyl = (ctx: Ctx, p: THREE.Object3D, rt: number, rb: number, h: number, c: string | THREE.Material, x = 0, y = 0, z = 0, seg = 14) =>
  mesh(ctx, new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'string' ? ctx.std(c) : c, x, y, z, p);
export const ball = (ctx: Ctx, p: THREE.Object3D, r: number, c: string | THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(ctx, new THREE.SphereGeometry(r, 14, 10), typeof c === 'string' ? ctx.std(c) : c, x, y, z, p);
export const cone = (ctx: Ctx, p: THREE.Object3D, r: number, h: number, c: string | THREE.Material, x = 0, y = 0, z = 0, seg = 10) =>
  mesh(ctx, new THREE.ConeGeometry(r, h, seg), typeof c === 'string' ? ctx.std(c) : c, x, y, z, p);
export const disc = (ctx: Ctx, p: THREE.Object3D, r: number, c: string | THREE.Material, x = 0, y = 0.02, z = 0) => {
  const m = mesh(ctx, new THREE.CircleGeometry(r, 32), typeof c === 'string' ? ctx.std(c) : c, x, y, z, p); m.rotation.x = -Math.PI / 2; m.castShadow = false; return m;
};
export const person = (ctx: Ctx, p: THREE.Object3D, x: number, z: number, shirt: string, hat?: string, skin = '#F2C9A0') => {
  mesh(ctx, new THREE.CapsuleGeometry(0.22, 0.45, 4, 10), ctx.std(shirt), x, 0.55, z, p);
  mesh(ctx, new THREE.SphereGeometry(0.2, 12, 10), ctx.std(skin), x, 1.15, z, p);
  if (hat) mesh(ctx, new THREE.CylinderGeometry(0.22, 0.24, 0.14, 12), ctx.std(hat), x, 1.32, z, p);
};
/** a flat textured floor */
export function floor(ctx: Ctx, draw: (g: CanvasRenderingContext2D) => void, rep = 10, size = 70, rough = 0.9) {
  const t = ctx.tex(256, 256, draw, rep);
  const m = mesh(ctx, new THREE.PlaneGeometry(size, size), ctx.std('#ffffff', { map: t, roughness: rough }));
  m.rotation.x = -Math.PI / 2; m.castShadow = false; return m;
}
/** things in a ring round the outside of the place */
export function around(ctx: Ctx, n: number, r0: number, r1: number, f: (x: number, z: number, a: number, i: number) => void) {
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + ctx.r() * 0.1, d = r0 + ctx.r() * (r1 - r0); f(Math.cos(a) * d, Math.sin(a) * d * 0.9, a, i); }
}
/** a point light, skipped on phones past the first few */
export function lamp(ctx: Ctx, list: THREE.PointLight[], c: string, i: number, d: number, x: number, y: number, z: number, max = 4) {
  if (ctx.phone ? list.length >= 2 : list.length >= max) return null;
  const l = new THREE.PointLight(c, i, d, 1.4); l.position.set(x, y, z); ctx.scene.add(l); list.push(l); return l;
}
/** a group for one producer copy, placed in its zone */
export function prodGroup(i: number, k: number, ups: THREE.Object3D[]) {
  const g = new THREE.Group(); const [x, z] = pspot(i, k); g.position.set(x, 0, z); ups.push(g); return g;
}
export const shadows = (g: THREE.Object3D) => { g.traverse((m) => { m.castShadow = true; }); return g; };
