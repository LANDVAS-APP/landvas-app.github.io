// Nature at street level, as it really is today where you stand:
//  * trees of the right kind for the place (broadleaves, conifers further from the equator, palms in the tropics),
//    dressed for the real season there: fresh green and blossom in spring, deep green in summer, oranges, reds and
//    golds in autumn (and more and more of them bare as it goes on), bare branches in winter — the south's seasons
//    the other way round;
//  * the leaves sway and flutter in the wind (on the graphics card: nothing extra for the phone's processor);
//  * grass growing up around your feet on lawns and in parks, swaying too.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TreePt } from './world';

const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** where the year is for the trees here: 0 bare … 1 full leaf; autumn 0 … 1 (how far they've turned); blossom */
export function leafState(lat: number, when: Date) {
  const start = Date.UTC(when.getUTCFullYear(), 0, 1);
  let doy = (when.getTime() - start) / 86_400_000;
  if (lat < 0) doy = (doy + 182.5) % 365;
  const a = Math.abs(lat);
  if (a < 23) return { leaf: 1, autumn: 0, blossom: 0, spring: 0 };
  // further from the equator spring comes later and autumn sooner
  const k = (a - 40) * 0.8;
  const greenUp = 95 + k, full = 135 + k, turn = 255 - k, fall = 300 - k, bare = 335 - k * 0.5;
  const sm = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const leafIn = sm(greenUp - 15, full, doy);
  const leafOut = 1 - sm(fall - 20, bare, doy);
  return {
    leaf: doy < 200 ? leafIn : leafOut,
    autumn: doy > 200 ? sm(turn - 10, fall, doy) : 0,
    blossom: doy < 200 ? sm(greenUp - 10, greenUp + 8, doy) * (1 - sm(greenUp + 18, greenUp + 35, doy)) : 0,
    spring: doy < 200 ? 1 - sm(full - 10, full + 30, doy) : 0,
  };
}

const GREENS = ['#4a7a33', '#5b8a3a', '#3f6d2e', '#6a9440', '#557f35'];
const SPRING = ['#86b04e', '#9cc25a', '#7aa845'];
const AUTUMN = ['#c9772a', '#d4a12c', '#b0452a', '#8f5a2a', '#e0b84a', '#a8582c', '#c4342a'];
const BLOSSOM = ['#f4c6d6', '#fbf1f4', '#f2b5c9'];
const CONIFER = ['#2e4f30', '#36593a', '#2a4a35', '#3b5e3c'];
const PALM = ['#5d8a3a', '#6b9443', '#577f36'];

/** colour each vertex by its height: shade under the crown, light on top (a cheap ambient occlusion) */
function shadeByHeight(g: THREE.BufferGeometry, lo: number, hi: number, dark = 0.55, light = 1.1, base?: THREE.Color) {
  const P = g.attributes.position as THREE.BufferAttribute;
  const c = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const t = Math.max(0, Math.min(1, (P.getY(i) - lo) / (hi - lo)));
    const v = dark + (light - dark) * t;
    c[i * 3] = (base?.r ?? 1) * v; c[i * 3 + 1] = (base?.g ?? 1) * v; c[i * 3 + 2] = (base?.b ?? 1) * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
/** a lumpy blob of leaves */
function blob(r: number, x: number, y: number, z: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const P = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const vx = P.getX(i), vy = P.getY(i), vz = P.getZ(i);
    const k = 1 + (hash(vx * 3.1 + vy * 7.7 + vz * 5.3 + seed) - 0.5) * 0.32;
    P.setXYZ(i, vx * k + x, vy * k * 0.9 + y, vz * k + z);
  }
  return g;
}
const cylinderBetween = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 5) => {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg, 1);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
};
const noUv = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g; };

export function treeGeometries() {
  const bark = new THREE.Color('#ffffff');
  // a broadleaf: a trunk with a few limbs, and a crown of lumpy blobs
  const trunk = shadeByHeight(noUv(mergeGeometries([
    new THREE.CylinderGeometry(0.15, 0.26, 3.4, 7).translate(0, 1.7, 0),
    cylinderBetween(new THREE.Vector3(0, 2.6, 0), new THREE.Vector3(0.9, 4.2, 0.3), 0.12, 0.06),
    cylinderBetween(new THREE.Vector3(0, 2.9, 0), new THREE.Vector3(-0.8, 4.4, -0.4), 0.11, 0.05),
  ].map(noUv))!), 0, 4, 0.6, 1, bark);
  const crown = shadeByHeight(mergeGeometries([
    blob(2.0, 0, 4.7, 0, 1), blob(1.55, 1.0, 4.1, 0.45, 2), blob(1.6, -0.9, 4.3, -0.5, 3), blob(1.45, 0.15, 5.6, -0.2, 4), blob(1.3, -0.2, 4.0, 1.0, 5),
  ].map(noUv))!, 2.5, 7, 0.5, 1.12);
  // bare branches for winter (and the trees that have already dropped their leaves)
  const limbs: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.15, 0.26, 3.4, 7).translate(0, 1.7, 0)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4, up = 2.4 + (i % 3) * 0.5;
    const end = new THREE.Vector3(Math.cos(a) * (1.6 + (i % 2) * 0.6), up + 2.4 + (i % 3) * 0.4, Math.sin(a) * (1.6 + (i % 2) * 0.6));
    limbs.push(cylinderBetween(new THREE.Vector3(0, up, 0), end, 0.1, 0.035, 4));
    for (let j = 0; j < 2; j++) {
      const b = a + (j ? 0.6 : -0.6);
      const mid = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, up, 0), end, 0.6);
      limbs.push(cylinderBetween(mid, mid.clone().add(new THREE.Vector3(Math.cos(b) * 0.9, 1.1, Math.sin(b) * 0.9)), 0.04, 0.015, 3));
    }
  }
  const bare = shadeByHeight(mergeGeometries(limbs.map(noUv))!, 0, 6, 0.55, 1, bark);
  // a conifer: stacked cones
  const conTrunk = shadeByHeight(noUv(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6).translate(0, 1.1, 0)), 0, 2, 0.6, 1, bark);
  const cones: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const r = 2.1 - i * 0.45, h = 2.6 - i * 0.3, y = 1.4 + i * 1.35;
    const c = new THREE.ConeGeometry(r, h, 9, 1, true).translate(0, y + h / 2, 0);
    const P = c.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < P.count; k++) if (P.getY(k) < y + 0.05) P.setY(k, P.getY(k) - 0.25 * hash(k * 1.7 + i)); // ragged hems
    cones.push(noUv(c));
  }
  const conifer = shadeByHeight(mergeGeometries(cones)!, 1.2, 7.5, 0.5, 1.1);
  // a palm: a leaning, ringed trunk and drooping fronds
  const segs: THREE.BufferGeometry[] = [];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 1.4) * 0.9, t * 7, 0)); }
  for (let i = 0; i < 6; i++) segs.push(cylinderBetween(pts[i], pts[i + 1], 0.22 - i * 0.015, 0.2 - i * 0.015, 7));
  const palmTrunk = shadeByHeight(mergeGeometries(segs.map(noUv))!, 0, 7, 0.65, 1, new THREE.Color('#d9c3a0'));
  const fronds: THREE.BufferGeometry[] = [];
  const top = pts[6];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.PlaneGeometry(0.75, 3.4, 1, 6).rotateX(-Math.PI / 2).translate(0, 0, -1.7);
    const P = f.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < P.count; k++) { const z = -P.getZ(k); P.setY(k, P.getY(k) + z * 0.35 - z * z * 0.16); P.setX(k, P.getX(k) * (1 - z / 4.2)); }
    f.rotateY((i / 9) * Math.PI * 2 + 0.3).translate(top.x, top.y, top.z);
    fronds.push(noUv(f));
  }
  const palmLeaves = shadeByHeight(mergeGeometries(fronds)!, top.y - 1.5, top.y + 0.5, 0.6, 1.1);
  // further away the same trees in far fewer triangles
  const lowBlob = (r: number, x: number, y: number, z: number) => noUv(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z));
  const farCrown = shadeByHeight(mergeGeometries([lowBlob(2.1, 0, 4.7, 0), lowBlob(1.5, 0.7, 4.1, 0.6), lowBlob(1.4, -0.6, 5.2, -0.4)])!, 2.5, 7, 0.5, 1.12);
  const farTrunk = shadeByHeight(noUv(new THREE.CylinderGeometry(0.15, 0.26, 3.4, 5).translate(0, 1.7, 0)), 0, 4, 0.6, 1, bark);
  const farBare = shadeByHeight(mergeGeometries([noUv(new THREE.CylinderGeometry(0.15, 0.26, 3.4, 5).translate(0, 1.7, 0)), ...[0, 2.1, 4.2].map((a) => noUv(cylinderBetween(new THREE.Vector3(0, 2.6, 0), new THREE.Vector3(Math.cos(a) * 1.8, 5.4, Math.sin(a) * 1.8), 0.1, 0.03, 3)))])!, 0, 6, 0.55, 1, bark);
  const farConifer = shadeByHeight(mergeGeometries([0, 1, 2].map((i) => noUv(new THREE.ConeGeometry(2.1 - i * 0.6, 2.8 - i * 0.3, 6, 1, true).translate(0, 1.4 + i * 1.7 + (2.8 - i * 0.3) / 2, 0))))!, 1.2, 7.5, 0.5, 1.1);
  const farPalm = shadeByHeight(mergeGeometries([0, 1, 2, 3, 4, 5].map((i) => { const c = fronds[i].clone(); c.deleteAttribute('color'); return c; }))!, top.y - 1.5, top.y + 0.5, 0.6, 1.1);
  const farPalmTrunk = shadeByHeight(noUv(cylinderBetween(pts[0], pts[6], 0.22, 0.17, 5)), 0, 7, 0.65, 1, new THREE.Color('#d9c3a0'));
  return { trunk, crown, bare, conTrunk, conifer, palmTrunk, palmLeaves, farCrown, farTrunk, farBare, farConifer, farPalm, farPalmTrunk };
}

/** the wind: crowns sway, leaves flutter (on the graphics card) */
function windy(m: THREE.Material, U: { uTime: { value: number }; uWind: { value: number } }, stiff = 1) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #endif
        float hgt = max(0.0, position.y - 1.6);
        float ph = uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17;
        float sway = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.0) * 0.25) * uWind * hgt * ${(0.022 / stiff).toFixed(4)};
        transformed.x += sway; transformed.z += sway * 0.55;
        transformed += objectNormal * sin(uTime * 7.0 + position.y * 3.1 + position.x * 2.3 + ip.x) * 0.035 * uWind * step(2.6, position.y) / ${stiff.toFixed(1)};`);
  };
  return m;
}

export function createNature(near: THREE.Scene, opts: { phone: boolean }) {
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };
  const U = { uTime: { value: 0 }, uWind: { value: 1 } };
  const G = treeGeometries();
  Object.values(G).forEach((g) => T(g));
  const barkM = T(windy(new THREE.MeshLambertMaterial({ color: '#6b4e38', vertexColors: true }), U, 3));
  const palmBarkM = T(windy(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), U, 3));
  const leafM = T(windy(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), U));
  const needleM = T(windy(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide }), U, 2));
  const frondM = T(windy(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide }), U, 0.7));
  const group = new THREE.Group();
  near.add(group);
  group.userData.layer = 'nature';
  let meshes: THREE.InstancedMesh[] = [];

  // the trees near you are drawn in full; further off, in a few triangles. Re-sorted as you walk.
  const LOD_R = opts.phone ? 110 : 160;
  let all: TreePt[] = [];
  let state = leafState(0, new Date());
  let lodAt: THREE.Vector2 | null = null;
  const setTrees = (list: TreePt[], lat: number, when = new Date()) => {
    all = list;
    state = leafState(lat, when);
    lodAt = null;
    build(null);
  };
  const build = (at: THREE.Vector2 | null) => {
    for (const m of meshes) { group.remove(m); m.dispose(); }
    meshes = [];
    if (!all.length) return;
    const st = state;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, set: TreePt[], colour?: (t: TreePt, r: number) => string) => {
      if (!set.length) return;
      const m = new THREE.InstancedMesh(geo, mat, set.length);
      set.forEach((t, i) => {
        const r = hash(t.x * 1.31 + t.z * 0.73);
        q.setFromAxisAngle(Y, r * Math.PI * 2);
        s.set(t.s * (0.9 + r * 0.2), t.s * (0.85 + hash(r * 9) * 0.35), t.s * (0.9 + r * 0.2));
        m4.compose(p.set(t.x, 0, t.z), q, s);
        m.setMatrixAt(i, m4);
        if (colour) m.setColorAt(i, c.set(colour(t, r)).multiplyScalar(0.88 + hash(r * 5) * 0.24));
      });
      m.castShadow = true;
      m.frustumCulled = false;
      group.add(m);
      meshes.push(m);
    };
    const pickC = (list2: string[], r: number) => list2[Math.floor(r * list2.length) % list2.length];
    const crownColour = (_t: TreePt, r: number) => {
      const r2 = hash(r * 31.7);
      if (st.blossom > 0 && r2 < st.blossom * 0.45) return pickC(BLOSSOM, hash(r * 3));
      if (st.autumn > 0 && r2 < st.autumn) return pickC(AUTUMN, hash(r * 7));
      if (st.spring > 0.3) return pickC(SPRING, hash(r * 11));
      return pickC(GREENS, hash(r * 13));
    };
    for (const near2 of [true, false]) {
      const set = at ? all.filter((t) => (Math.hypot(t.x - at.x, t.z - at.y) < LOD_R) === near2) : near2 ? [] : all;
      // the broadleaves in leaf, and those already bare (late autumn: more and more of them)
      const broad = set.filter((t) => t.kind === 0), con = set.filter((t) => t.kind === 1), palm = set.filter((t) => t.kind === 2);
      const leafy: TreePt[] = [], bare: TreePt[] = [];
      for (const t of broad) (hash(t.x * 0.37 + t.z * 0.91) < st.leaf ? leafy : bare).push(t);
      make(near2 ? G.trunk : G.farTrunk, barkM, leafy);
      make(near2 ? G.crown : G.farCrown, leafM, leafy, crownColour);
      make(near2 ? G.bare : G.farBare, barkM, bare);
      make(G.conTrunk, barkM, con);
      make(near2 ? G.conifer : G.farConifer, needleM, con, (_t, r) => pickC(CONIFER, r));
      make(near2 ? G.palmTrunk : G.farPalmTrunk, palmBarkM, palm);
      make(near2 ? G.palmLeaves : G.farPalm, frondM, palm, (_t, r) => pickC(PALM, r));
    }
  };

  // ---- grass round your feet ---------------------------------------------------------------------------------------
  const bladeTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    const g = c.getContext('2d')!;
    for (let i = 0; i < 46; i++) {
      const x = 2 + hash(i * 3.3) * 60, h = 22 + hash(i * 7.1) * 40, lean = (hash(i * 5.7) - 0.5) * 16;
      const grad = g.createLinearGradient(0, 64, 0, 64 - h);
      grad.addColorStop(0, '#5a8536'); grad.addColorStop(0.6, '#79a347'); grad.addColorStop(1, hash(i) > 0.85 ? '#c2bf78' : '#a3c96a');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(x - 1.3, 64); g.quadraticCurveTo(x + lean * 0.3, 64 - h * 0.6, x + lean, 64 - h); g.quadraticCurveTo(x + lean * 0.3 + 0.6, 64 - h * 0.6, x + 1.3, 64); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return T(t);
  })();
  const tuft = (() => {
    const parts = [0, 1, 2].map((i) => new THREE.PlaneGeometry(0.5, 0.2).translate(0, 0.1, 0).rotateY((i / 3) * Math.PI));
    const g = mergeGeometries(parts)!;
    // normals pointing up, so the grass is lit like the lawn it grows from
    const N = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 1, 0);
    return T(g);
  })();
  const grassM = T(new THREE.MeshLambertMaterial({ map: bladeTex, alphaTest: 0.5, side: THREE.DoubleSide }));
  grassM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        // (the tufts right at your feet shrink away: up close they'd fill the view)
        transformed *= smoothstep(0.9, 2.4, length(ip.xz - cameraPosition.xz));
        float bend = uv.y * uv.y * uWind;
        transformed.x += sin(uTime * 2.1 + ip.x * 0.5 + ip.z * 0.3) * 0.04 * bend;
        transformed.z += cos(uTime * 1.7 + ip.x * 0.3 + ip.z * 0.6) * 0.03 * bend;`);
  };
  const GRASS_R = opts.phone ? 22 : 32, CELL = opts.phone ? 0.75 : 0.62, MAX = opts.phone ? 2200 : 4800;
  const grass = new THREE.InstancedMesh(tuft, grassM, MAX);
  grass.count = 0;
  grass.frustumCulled = false;
  group.add(grass);
  let grassAt: THREE.Vector2 | null = null;
  let ground: ((x: number, z: number) => number) | null = null;
  const setGround = (fn: ((x: number, z: number) => number) | null) => { ground = fn; grassAt = null; };
  const scatterGrass = (x0: number, z0: number) => {
    grassAt = new THREE.Vector2(x0, z0);
    if (!ground) { grass.count = 0; return; }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let n = 0;
    const i0 = Math.floor((x0 - GRASS_R) / CELL), i1 = Math.ceil((x0 + GRASS_R) / CELL);
    const j0 = Math.floor((z0 - GRASS_R) / CELL), j1 = Math.ceil((z0 + GRASS_R) / CELL);
    for (let i = i0; i <= i1 && n < MAX; i++) for (let j = j0; j <= j1 && n < MAX; j++) {
      const r = hash(i * 12.9898 + j * 78.233);
      const x = (i + hash(r * 3.7)) * CELL, z = (j + hash(r * 5.3)) * CELL;
      const d = Math.hypot(x - x0, z - z0);
      if (d > GRASS_R) continue;
      if (ground(x, z) !== 1) continue;
      const edge = Math.min(1, (GRASS_R - d) / 6);
      q.setFromAxisAngle(Y, r * 6.283);
      const k = (0.7 + hash(r * 9.1) * 0.7) * edge;
      m4.compose(p.set(x, 0, z), q, s.set(k, k * (0.8 + hash(r * 2.2) * 0.5), k));
      grass.setMatrixAt(n, m4);
      grass.setColorAt(n, c.setRGB(0.85 + hash(r * 4.4) * 0.3, 0.85 + hash(r * 6.6) * 0.25, 0.75 + hash(r * 8.8) * 0.2));
      n++;
    }
    grass.count = n;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  };

  return {
    setTrees,
    setGround,
    /** each frame: the wind, and the grass follows you round */
    update: (t: number, at: THREE.Vector3, eyeHeight: number) => {
      U.uTime.value = t;
      U.uWind.value = 0.75 + 0.35 * Math.sin(t * 0.13) + 0.2 * Math.sin(t * 0.41);
      if (all.length && (!lodAt || lodAt.distanceTo(new THREE.Vector2(at.x, at.z)) > LOD_R * 0.35)) { lodAt = new THREE.Vector2(at.x, at.z); build(lodAt); }
      grass.visible = eyeHeight < 12;
      if (grass.visible && (!grassAt || grassAt.distanceTo(new THREE.Vector2(at.x, at.z)) > 7)) scatterGrass(at.x, at.z);
    },
    counts: () => ({ trees: all.length, grass: grass.count, meshes: meshes.length }),
    dispose: () => { for (const m of meshes) m.dispose(); grass.dispose(); near.remove(group); for (const d of own) d.dispose(); },
  };
}
export type Nature = ReturnType<typeof createNature>;
