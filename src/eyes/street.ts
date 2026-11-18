// The things on a real street, from the same map data: street lamps (lit at night, with pools of light on the
// pavement), cars parked at the kerb, and the clutter on flat roofs (air-con units, stair huts, water tanks).
// Each kind is one instanced mesh: hundreds of them cost a handful of draw calls. Only the ones near you are drawn
// (a parked car 300 m off is a couple of pixels): each mesh holds its things nearest first, and draws just as many as are
// in reach; that order is worked out again as you move along.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingMesh, StreetThings } from './world';

const noUv = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g; };
const paint = (g: THREE.BufferGeometry, c: string) => {
  const col = new THREE.Color(c);
  const n = (g.attributes.position as THREE.BufferAttribute).count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return noUv(g);
};

/** how far each kind is drawn (m) */
const REACH = { lamp: 380, car: 230, roof: 260 };

export function createStreet(near: THREE.Scene, opts: { phone?: boolean } = {}) {
  const reachK = opts.phone ? 0.8 : 1;
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };
  const group = new THREE.Group();
  near.add(group);
  group.userData.layer = 'street';
  const U = { uNight: { value: -1 } };

  // ---- a street lamp: a pole, an arm out over the road, a lamp head --------------------------------------------------
  const poleGeo = T(mergeGeometries([
    paint(new THREE.CylinderGeometry(0.07, 0.11, 7.5, 7).translate(0, 3.75, 0), '#3d4247'),
    paint(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 8).translate(0, 0.25, 0), '#33373b'),
    paint(new THREE.BoxGeometry(0.07, 0.07, 1.7).translate(0, 7.4, 0.8), '#3d4247'),
    paint(new THREE.BoxGeometry(0.34, 0.12, 0.62).translate(0, 7.32, 1.62), '#2b2f33'),
  ])!);
  const headGeo = T(new THREE.BoxGeometry(0.28, 0.03, 0.52).translate(0, 7.25, 1.62));
  const poleM = T(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const headM = T(new THREE.MeshBasicMaterial({ color: '#9aa0a6' }));
  const poolTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,214,150,0.85)'); r.addColorStop(0.35, 'rgba(255,200,130,0.4)'); r.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return T(new THREE.CanvasTexture(c));
  })();
  const poolGeo = T(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const poolM = T(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
  // the glow round a lit lamp
  const haloM = T(new THREE.PointsMaterial({ map: poolTex, color: '#ffd8a0', size: 3.2, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));

  // ---- a parked car: body, glass, roof, wheels (a hatchback, or a taller SUV) -----------------------------------------
  const car = (tall: boolean) => {
    const h = tall ? 0.18 : 0;
    return T(mergeGeometries([
      paint(new THREE.BoxGeometry(1.78, 0.6, 4.3).translate(0, 0.62, 0), '#ffffff'),
      paint(new THREE.BoxGeometry(1.74, 0.16, 1.0).translate(0, 0.98, 1.55).rotateX(0), '#ffffff'),
      paint(new THREE.BoxGeometry(1.6, 0.5 + h, 2.3).translate(0, 1.17 + h / 2, -0.25), '#20262e'),
      paint(new THREE.BoxGeometry(1.56, 0.07, 2.1).translate(0, 1.44 + h, -0.25), '#ffffff'),
      paint(new THREE.BoxGeometry(1.8, 0.14, 0.12).translate(0, 0.42, 2.17), '#2a2c30'),
      paint(new THREE.BoxGeometry(1.8, 0.14, 0.12).translate(0, 0.42, -2.17), '#2a2c30'),
      paint(new THREE.BoxGeometry(0.36, 0.12, 0.05).translate(0.62, 0.78, -2.16), '#7a1414'),
      paint(new THREE.BoxGeometry(0.36, 0.12, 0.05).translate(-0.62, 0.78, -2.16), '#7a1414'),
      paint(new THREE.BoxGeometry(0.34, 0.1, 0.05).translate(0.6, 0.76, 2.16), '#e8e4d8'),
      paint(new THREE.BoxGeometry(0.34, 0.1, 0.05).translate(-0.6, 0.76, 2.16), '#e8e4d8'),
      ...[[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.4], [0.82, -1.4]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 8).rotateZ(Math.PI / 2).translate(x, 0.33, z), '#16171a')),
    ])!);
  };
  const carGeos = [car(false), car(true)];
  const carM = T(new THREE.MeshLambertMaterial({ vertexColors: true }));
  // (glass and tyres are painted dark, the body white: the instance's colour tints the body, and barely the dark)

  // ---- the roofs' clutter ---------------------------------------------------------------------------------------------
  const roofGeos = [
    T(mergeGeometries([paint(new THREE.BoxGeometry(1.6, 1.0, 1.2).translate(0, 0.5, 0), '#a7aaad'), paint(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 14).translate(0.3, 1.03, 0), '#55595d')])!),
    T(mergeGeometries([
      paint(new THREE.CylinderGeometry(1.3, 1.3, 2.6, 14).translate(0, 2.6, 0), '#7a5c45'),
      paint(new THREE.ConeGeometry(1.4, 0.8, 14).translate(0, 4.3, 0), '#4b3a2e'),
      ...[[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 5).translate(x, 0.65, z), '#3a3a3a')),
    ])!),
    T(mergeGeometries([paint(new THREE.BoxGeometry(3, 2.6, 3.2).translate(0, 1.3, 0), '#b9b4aa'), paint(new THREE.BoxGeometry(0.9, 2.0, 0.05).translate(0.6, 1.0, 1.62), '#4a4d52')])!),
  ];
  const roofM = T(new THREE.MeshLambertMaterial({ vertexColors: true }));

  let meshes: THREE.Object3D[] = [];
  let heads: THREE.InstancedMesh | null = null, pools: THREE.InstancedMesh | null = null, halos: THREE.Points | null = null;
  /** each mesh's things (their own matrices and colours), to be drawn nearest first */
  type Item = { x: number; z: number; m: THREE.Matrix4; c?: THREE.Color };
  type Sorted = { mesh: THREE.InstancedMesh; items: Item[]; reach: number };
  let sorted: Sorted[] = [];
  let lampXZ: Float32Array | null = null, lampGlow: Float32Array | null = null;
  const sortedAt = new THREE.Vector2(1e9, 1e9);
  const clear = () => {
    for (const m of meshes) { group.remove(m); (m as THREE.InstancedMesh).dispose?.(); }
    halos?.geometry.dispose();
    meshes = []; heads = pools = halos = null; sorted = []; lampXZ = lampGlow = null;
    sortedAt.set(1e9, 1e9);
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const q0 = new THREE.Quaternion();
  const order: number[] = [];
  const dist: number[] = [];
  /** draw only what's in reach of (x, z) (in the street's own coordinates), nearest first */
  const placeNear = (x: number, z: number) => {
    sortedAt.set(x, z);
    for (const so of sorted) {
      const { mesh, items, reach } = so;
      const r = reach * reachK;
      order.length = 0;
      for (let i = 0; i < items.length; i++) { const d = Math.hypot(items[i].x - x, items[i].z - z); if (d < r) { dist[i] = d; order.push(i); } }
      order.sort((a, b) => dist[a] - dist[b]);
      for (let k = 0; k < order.length; k++) {
        const it = items[order[k]];
        mesh.setMatrixAt(k, it.m);
        if (it.c) mesh.setColorAt(k, it.c);
      }
      mesh.count = order.length;
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, order.length * 16); mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) { mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, order.length * 3); mesh.instanceColor.needsUpdate = true; }
      mesh.computeBoundingSphere();
    }
    // the lamps' glow: only the ones in reach
    if (halos && lampXZ && lampGlow) {
      const r = REACH.lamp * reachK;
      const pos = halos.geometry.attributes.position as THREE.BufferAttribute;
      let n = 0;
      for (let i = 0; i < lampXZ.length / 2; i++) if (Math.hypot(lampXZ[i * 2] - x, lampXZ[i * 2 + 1] - z) < r) { pos.setXYZ(n++, lampGlow[i * 3], lampGlow[i * 3 + 1], lampGlow[i * 3 + 2]); }
      halos.geometry.setDrawRange(0, n);
      pos.needsUpdate = true;
      halos.geometry.computeBoundingSphere();
    }
  };
  const sortedMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], reach: number, shadow: boolean) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    if (items.some((it) => it.c)) mesh.setColorAt(0, c.set('#ffffff'));
    mesh.count = 0;
    mesh.castShadow = shadow;
    group.add(mesh); meshes.push(mesh);
    sorted.push({ mesh, items, reach });
    return mesh;
  };

  const set = (things: StreetThings | null, roofs: BuildingMesh['roofBits'] | null, at?: { x: number; z: number }) => {
    clear();
    group.position.set(0, 0, 0);
    if (things?.lights.length) {
      const L = things.lights;
      const poleItems: Item[] = [], poolItems: Item[] = [];
      lampXZ = new Float32Array(L.length * 2);
      lampGlow = new Float32Array(L.length * 3);
      L.forEach((l, i) => {
        const k = l.tall / 7.5;
        q.setFromAxisAngle(Y, l.rot);
        poleItems.push({ x: l.x, z: l.z, m: new THREE.Matrix4().compose(p.set(l.x, 0, l.z), q, s.set(k, k, k)) });
        const hx = l.x + Math.sin(l.rot) * 1.62 * k, hz = l.z + Math.cos(l.rot) * 1.62 * k;
        poolItems.push({ x: l.x, z: l.z, m: new THREE.Matrix4().compose(p.set(hx, 0.05, hz), q0, s.set(14 * k, 1, 14 * k)) });
        lampXZ!.set([l.x, l.z], i * 2);
        lampGlow!.set([hx, 7.2 * k, hz], i * 3);
      });
      sortedMesh(poleGeo, poleM, poleItems, REACH.lamp, true);
      heads = sortedMesh(headGeo, headM, poleItems, REACH.lamp, false);
      pools = sortedMesh(poolGeo, poolM, poolItems, REACH.lamp, false);
      // the glow round each lit lamp (one draw for all of them)
      halos = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(L.length * 3), 3)), haloM);
      group.add(halos); meshes.push(halos);
    }
    if (things?.cars.length) {
      for (const kind of [0, 1]) {
        const list = things.cars.filter((x) => x.kind === kind);
        if (!list.length) continue;
        const items = list.map((x) => { q.setFromAxisAngle(Y, x.rot); return { x: x.x, z: x.z, m: new THREE.Matrix4().compose(p.set(x.x, 0, x.z), q, s.set(1, 1, 1)), c: new THREE.Color(x.color) }; });
        sortedMesh(carGeos[kind], carM, items, REACH.car, true);
      }
    }
    if (roofs?.length) {
      for (const kind of [0, 1, 2]) {
        const list = roofs.filter((x) => x.kind === kind);
        if (!list.length) continue;
        const items = list.map((x) => { q.setFromAxisAngle(Y, x.rot); return { x: x.x, z: x.z, m: new THREE.Matrix4().compose(p.set(x.x, x.y, x.z), q, s.set(1, 1, 1)) }; });
        sortedMesh(roofGeos[kind], roofM, items, REACH.roof, true);
      }
    }
    if (at) placeNear(at.x, at.z);
  };

  return {
    set,
    /** each frame: the lamps by night, and only what's in reach of you (re-sorted every few dozen metres) */
    update: (night: number, at?: { x: number; z: number }) => {
      if (at && sorted.length) {
        const lx = at.x - group.position.x, lz = at.z - group.position.z;
        if (Math.hypot(lx - sortedAt.x, lz - sortedAt.y) > 35) placeNear(lx, lz);
      }
      const on = night > 0.05;
      if (pools) pools.visible = on;
      if (halos) halos.visible = on;
      if (U.uNight.value === night) return;
      U.uNight.value = night;
      headM.color.set(night > 0.3 ? '#fff1d6' : '#9aa0a6');
      poolM.opacity = Math.min(1, night * 1.2) * 0.8;
      haloM.opacity = Math.min(1, night * 1.2) * 0.9;
    },
    counts: () => ({ objects: meshes.length }),
    /** the view's coordinates moved (dx, dz) metres: the lamps and cars keep their places until new ones arrive */
    shift: (dx: number, dz: number) => { group.position.x -= dx; group.position.z -= dz; },
    dispose: () => { clear(); near.remove(group); for (const d of own) d.dispose(); },
  };
}
export type Street = ReturnType<typeof createStreet>;
