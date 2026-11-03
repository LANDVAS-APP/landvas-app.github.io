// A whole world in 3D: a round, low-poly globe you can walk all the way around (third person, with
// your Inkborn bobbing after you), its plot grid laid over the ground, everyone's claimed plots with
// their flags, other explorers who are on the world right now, your rocket at the landing site and
// the day's glowing samples. Pull out to orbit to see the whole planet and tap anywhere to walk there.
// Plain three.js, driven by the React screen through the small PlanetScene handle.
import * as THREE from 'three';
import type { PlanetPlot } from '../backend/types';
import type { Genome } from '../inkborn/genome';
import { drawCreature, type CreatureState } from '../inkborn/rig';
import { rng } from '../inkborn/world';
import { LAT_MAX, cellAt, cellBounds, cellCenterDir, cellKey, dirOf, radiusFor, type Cell, type Vec3 } from './planetGrid';
import type { World } from './worlds';

export type Pilot = { id: string; username: string; explorerUrl: string; d?: number[] | null; face?: number[] | null; hop?: number };
export type PlanetSceneOpts = {
  canvas: HTMLCanvasElement; world: World; rows: number; seed: number; accent: string; explorerUrl: string;
  buddy: Genome | null; isHome: boolean; samples: number; reduceMotion?: boolean;
  onCell(c: Cell | null): void; onSample(got: number): void; onPick(c: Cell | null): void; onMode(orbit: boolean): void;
};
export type PlanetScene = {
  /** joystick: x right, y forward (-1..1) */ joy: { x: number; y: number }; jump(): void;
  setPlots(plots: PlanetPlot[]): void;
  /** the live group: add/remove explorers; positions from the heartbeat */ setLive(p: Pilot[]): void;
  /** a streamed position for one explorer */ remote(id: string, d: number[], face: number[], hop: number): void;
  /** where you are, to send to the group */ pose(): { d: number[]; face: number[]; hop: number; moving: boolean };
  /** drop in next to a spot on the globe */ teleport(d: number[]): void;
  setOrbit(on: boolean): void; walkTo(c: Cell): void; zoom(f: number): void;
  dispose(): void;
};

const V = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const UP = new THREE.Vector3(0, 1, 0);
const css = (() => {
  let g: CanvasRenderingContext2D | null = null;
  return (c: string) => { g ??= document.createElement('canvas').getContext('2d'); if (!g) return new THREE.Color(c); g.fillStyle = '#000'; g.fillStyle = c; return new THREE.Color(g.fillStyle as string); };
})();
function textSprite(text: string, color = '#fff', scale = 1) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '700 44px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(500, g.measureText(text).width + 40);
  g.fillStyle = 'rgba(10,12,30,0.62)'; g.beginPath(); g.roundRect(256 - w / 2, 14, w, 68, 34); g.fill();
  g.fillStyle = color; g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(5.3 * scale, 1 * scale, 1); s.center.set(0.5, 0);
  return s;
}
function imageSprite(url: string, h: number) {
  const tex = new THREE.TextureLoader().load(url); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
  s.scale.set(h * (46 / 68), h, 1); s.center.set(0.5, 0);
  return s;
}
/** Put an object on the ground at `d` (unit vector), standing up, turned `spin` round its up axis. */
function stand(o: THREE.Object3D, d: THREE.Vector3, r: number, spin = 0) {
  o.position.copy(d).multiplyScalar(r);
  o.quaternion.setFromUnitVectors(UP, d);
  if (spin) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
}

export function createPlanetScene(o: PlanetSceneOpts): PlanetScene {
  const { world: w, rows } = o;
  const cols = rows * 2;
  const R = radiusFor(rows);
  const r = rng(o.seed);
  const reduce = !!o.reduceMotion;
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.innerWidth < 700 ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // ---- the ground ------------------------------------------------------------------------------
  const unit = () => { const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); return v.lengthSq() < 1e-4 ? v.set(0, 1, 0) : v.normalize(); };
  const bumps = Array.from({ length: 7 }, (_, i) => ({ v: unit(), f: 2 + r() * (i < 3 ? 4 : 11), a: i < 3 ? 1 : 0.35, p: r() * 6 }));
  const sumA = bumps.reduce((n, b) => n + b.a, 0);
  const amp = w.gas ? 0.25 : R * (w.features.includes('mesas') || w.features.includes('volcano') ? 0.024 : 0.017);
  const height = (d: THREE.Vector3) => amp * bumps.reduce((n, b) => n + b.a * Math.sin(b.f * d.dot(b.v) * 3 + b.p), 0) / sumA;
  const surf = (d: THREE.Vector3) => R + height(d);

  const seg = Math.min(360, Math.max(200, rows * 6));
  const geo = track(new THREE.SphereGeometry(R, seg, Math.round(seg * 0.7)));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const g0 = css(w.ground[0]), g1 = css(w.ground[1]), det = css(w.detail), c1 = css(w.color), c2 = css(w.color2);
  const ice = new THREE.Color('#EEF6FF');
  const icy = w.features.includes('ice');
  const tmp = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).normalize();
    const hgt = height(tmp);
    tmp.multiplyScalar(R + hgt);
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    const lat = Math.asin(tmp.y / (R + hgt));
    if (w.gas) {
      const band = Math.sin(lat * 14 + Math.sin(Math.atan2(tmp.x, tmp.z) * 3 + lat * 5) * 0.6);
      col.copy(c1).lerp(c2, (band + 1) / 2 * 0.8);
      if (Math.abs(Math.sin(lat * 31)) > 0.93) col.lerp(det, 0.5);
    } else {
      col.copy(g1).lerp(g0, Math.min(1, Math.max(0, (hgt / (amp || 1) + 1) / 2 + (r() - 0.5) * 0.12)));
      const pole = Math.abs(lat) / (Math.PI / 2);
      if (icy || pole > 0.85) col.lerp(ice, Math.max(0, (pole - (icy ? 0.6 : 0.85)) * 3));
    }
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const planet = new THREE.Mesh(geo, track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !w.gas, roughness: w.gas ? 0.7 : 0.95, metalness: 0 })));
  scene.add(planet);

  // ---- light, sky, atmosphere ------------------------------------------------------------------
  const sunDir = new THREE.Vector3(0.6, 0.55, 0.35).normalize();
  const sun = new THREE.DirectionalLight('#FFF6E4', w.dark ? 2.6 : 2.2); sun.position.copy(sunDir).multiplyScalar(300); scene.add(sun);
  scene.add(new THREE.HemisphereLight(css(w.sky[1]), css(w.ground[1]), w.dark ? 0.55 : 0.95));
  scene.add(new THREE.AmbientLight('#ffffff', w.dark ? 0.25 : 0.2));
  const skyU = { top: { value: css(w.sky[0]) }, horizon: { value: css(w.sky[1]) }, up: { value: new THREE.Vector3(0, 1, 0) }, space: { value: 0 } };
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(1800, 32, 16)), track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyU,
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 up; uniform float space; varying vec3 vd;
      void main(){ float k = clamp(dot(normalize(vd), up), -0.2, 1.0); vec3 c = mix(horizon, top, pow(max(k,0.0), 0.6));
        c = mix(c, vec3(0.012,0.015,0.04), space); gl_FragColor = vec4(c, 1.0); }`,
  })));
  sky.renderOrder = -2; scene.add(sky);
  const starGeo = track(new THREE.BufferGeometry());
  const starPts = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i++) { const v = unit().multiplyScalar(1500); starPts.set([v.x, v.y, v.z], i * 3); }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPts, 3));
  const starMat = track(new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: w.dark ? 0.95 : 0.12, depthWrite: false }));
  const stars = new THREE.Points(starGeo, starMat); stars.renderOrder = -1; scene.add(stars);
  // the Sun (smaller and paler the further out you are)
  const sunSize = w.id === 'mercury' ? 180 : w.id === 'venus' ? 120 : ['jupiter', 'saturn'].includes(w.id) ? 40 : ['uranus', 'neptune', 'pluto'].includes(w.id) ? 18 : 80;
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.8)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return track(t); })();
  const sunSprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false })));
  sunSprite.scale.setScalar(sunSize); sunSprite.position.copy(sunDir).multiplyScalar(1400); scene.add(sunSprite);
  // something big in the sky
  if (w.id === 'moon') {
    const earth = new THREE.Mesh(track(new THREE.SphereGeometry(70, 48, 32)), track(new THREE.MeshStandardMaterial({ color: '#3EA0DA', roughness: 0.6, emissive: '#0b2a4a', emissiveIntensity: 0.4 })));
    earth.position.set(-500, 420, -900); scene.add(earth);
    const land = new THREE.Mesh(track(new THREE.IcosahedronGeometry(71, 2)), track(new THREE.MeshStandardMaterial({ color: '#4FA552', flatShading: true, transparent: true, opacity: 0.85 })));
    land.position.copy(earth.position); land.scale.set(1, 0.7, 0.6); scene.add(land);
  }
  if (w.ring || w.id === 'saturn') {
    const rg = track(new THREE.RingGeometry(R * 1.5, R * 2.7, 128, 6));
    const rc = css(w.ring ?? '#D9C58F');
    const ringCols = new Float32Array(rg.attributes.position.count * 4);
    for (let i = 0; i < rg.attributes.position.count; i++) {
      const x = rg.attributes.position.getX(i), y = rg.attributes.position.getY(i), d = (Math.hypot(x, y) - R * 1.5) / (R * 1.2);
      ringCols.set([rc.r, rc.g, rc.b, 0.25 + 0.45 * Math.abs(Math.sin(d * 23)) * (d > 0.55 && d < 0.6 ? 0.1 : 1)], i * 4);
    }
    rg.setAttribute('color', new THREE.BufferAttribute(ringCols, 4));
    const ring = new THREE.Mesh(rg, track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
    ring.rotation.x = Math.PI / 2 - 0.35; scene.add(ring);
  }
  if (w.id === 'jupiter') for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(track(new THREE.SphereGeometry(8 + i * 3, 24, 16)), track(new THREE.MeshStandardMaterial({ color: ['#E9D27A', '#D8CFC0', '#9A8F80', '#7C7468'][i], roughness: 0.9 })));
    m.position.set(...dirOf(12 + i * 8, 30 + i * 75)).multiplyScalar(R * (3 + i)); scene.add(m);
  }
  if (!w.dark) {
    const atm = new THREE.Mesh(track(new THREE.SphereGeometry(R * 1.12, 64, 32)), track(new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { c: { value: css(w.sky[1]) } },
      vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); v = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 n; varying vec3 v; void main(){ float f = pow(1.0 - abs(dot(n, v)), 2.5); gl_FragColor = vec4(c, f * 0.9); }',
    })));
    scene.add(atm);
  }
  const fogCol = css(w.sky[1]);
  const fog = w.dark ? null : new THREE.Fog(fogCol, R * 0.6, R * 1.9);

  // ---- grid lines --------------------------------------------------------------------------------
  {
    const pts: number[] = [];
    const push = (lat: number, lon: number) => { const d = V(dirOf(lat, lon)); d.multiplyScalar(surf(d) + 0.12); pts.push(d.x, d.y, d.z); };
    const hStep = (2 * LAT_MAX) / rows;
    for (let gy = 0; gy <= rows; gy++) { const lat = -LAT_MAX + gy * hStep; for (let lon = -180; lon < 180; lon += 1.5) { push(lat, lon); push(lat, lon + 1.5); } }
    for (let gx = 0; gx < cols; gx++) { const lon = -180 + gx * (360 / cols); for (let lat = -LAT_MAX; lat < LAT_MAX; lat += 1.5) { push(lat, lon); push(Math.min(LAT_MAX, lat + 1.5), lon); } }
    const lg = track(new THREE.BufferGeometry()); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(lg, track(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: w.gas ? 0.22 : 0.16, depthWrite: false }))));
  }
  /** A curved tile over a cell (or part of one), lifted `lift` off the ground. */
  const tileGeo = (c: Cell, lift: number, inset = 0) => {
    const b = cellBounds(c, rows), N = 6;
    const dl = (b.lat1 - b.lat0) * inset, dn = (b.lon1 - b.lon0) * inset;
    const verts: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const d = V(dirOf(b.lat0 + dl + ((b.lat1 - b.lat0 - 2 * dl) * i) / N, b.lon0 + dn + ((b.lon1 - b.lon0 - 2 * dn) * j) / N));
      d.multiplyScalar(surf(d) + lift); verts.push(d.x, d.y, d.z);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j; idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1); }
    return { verts, idx };
  };

  // ---- decor -------------------------------------------------------------------------------------
  const spawn = V(dirOf(4, 6));
  const nearSpawn = (d: THREE.Vector3) => d.angleTo(spawn) * R < 9;
  const dens = Math.max(1, (R / 40) ** 2);
  const decor = (geom: THREE.BufferGeometry, mat: THREE.Material, n0: number, scale: (i: number) => THREE.Vector3, sink = 0.2) => {
    const n = Math.round(n0 * (n0 < 20 ? Math.sqrt(dens) : dens));
    const m = new THREE.InstancedMesh(track(geom), track(mat), n);
    const o3 = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const d = unit();
      if (nearSpawn(d)) continue;
      stand(o3, d, surf(d) - sink, r() * 6.28); o3.scale.copy(scale(k)); o3.updateMatrix(); m.setMatrixAt(k++, o3.matrix);
    }
    m.count = k; scene.add(m); return m;
  };
  if (!w.gas) {
    decor(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: g1, flatShading: true, roughness: 1 }), 260, () => new THREE.Vector3(0.4 + r() * 1.4, 0.3 + r() * 0.9, 0.4 + r() * 1.4));
    if (w.features.includes('crystals')) decor(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: det, emissive: det, emissiveIntensity: 0.6, flatShading: true, roughness: 0.3 }), 120, () => { const s = 0.4 + r() * 0.8; return new THREE.Vector3(s * 0.5, s * 2.2, s * 0.5); }, 0);
    if (icy) decor(new THREE.ConeGeometry(0.6, 3, 5), new THREE.MeshStandardMaterial({ color: '#DDF2FF', emissive: '#7FC8FF', emissiveIntensity: 0.25, flatShading: true, roughness: 0.2 }), 140, () => new THREE.Vector3(1, 0.5 + r(), 1), 0);
    if (w.features.includes('mesas')) decor(new THREE.CylinderGeometry(3, 4, 4, 7), new THREE.MeshStandardMaterial({ color: g0, flatShading: true, roughness: 1 }), 40, () => { const s = 0.7 + r() * 1.3; return new THREE.Vector3(s, s * (0.6 + r()), s); }, 0.6);
    if (w.features.includes('volcano')) {
      decor(new THREE.ConeGeometry(9, 9, 9, 1, true), new THREE.MeshStandardMaterial({ color: g1, flatShading: true, roughness: 1, side: THREE.DoubleSide }), 7, () => new THREE.Vector3(1, 0.8 + r() * 0.6, 1), 0.5);
    }
    if (w.features.includes('craters')) decor(new THREE.TorusGeometry(2.2, 0.35, 5, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: g1, flatShading: true, roughness: 1 }), 80, () => { const s = 0.6 + r() * 1.8; return new THREE.Vector3(s, 0.7, s); }, 0.15);
  } else {
    // cloud puffs drifting over the cloud deck
    decor(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, roughness: 1, flatShading: true }), 160, () => { const s = 1 + r() * 2; return new THREE.Vector3(s * 1.6, s * 0.6, s); }, -1.5 - r() * 3);
  }

  // ---- landing site: rocket, flag, home dome ------------------------------------------------------
  const accent = css(o.accent);
  {
    const rk = new THREE.Group();
    const white = track(new THREE.MeshStandardMaterial({ color: '#F2F5FB', roughness: 0.4, metalness: 0.2 }));
    const acc = track(new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }));
    const body = new THREE.Mesh(track(new THREE.CylinderGeometry(1, 1.1, 6, 20)), white); body.position.y = 3.8; rk.add(body);
    const nose = new THREE.Mesh(track(new THREE.ConeGeometry(1, 2.4, 20)), acc); nose.position.y = 8; rk.add(nose);
    const win = new THREE.Mesh(track(new THREE.SphereGeometry(0.42, 16, 12)), track(new THREE.MeshStandardMaterial({ color: '#7EC8F5', emissive: '#1B4A7A', emissiveIntensity: 0.6 }))); win.position.set(0, 5.2, 0.95); rk.add(win);
    for (let i = 0; i < 4; i++) { const fin = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 2, 1.4)), acc); const a = (i / 4) * Math.PI * 2; fin.position.set(Math.cos(a) * 1.2, 1.6, Math.sin(a) * 1.2); fin.rotation.y = -a; rk.add(fin); }
    const legs = new THREE.Mesh(track(new THREE.CylinderGeometry(1.3, 1.7, 0.8, 8)), track(new THREE.MeshStandardMaterial({ color: '#59647D' }))); legs.position.y = 0.4; rk.add(legs);
    const d = spawn.clone().applyAxisAngle(UP, 0.05).normalize();
    stand(rk, d, surf(d) - 0.2, 0.4); scene.add(rk);
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6)), white); pole.position.y = 1.7; flag.add(pole);
    const cloth = new THREE.Mesh(track(new THREE.PlaneGeometry(1.6, 1)), track(new THREE.MeshStandardMaterial({ color: accent, side: THREE.DoubleSide }))); cloth.position.set(0.8, 2.9, 0); flag.add(cloth);
    const fd = spawn.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), 4 / R).normalize();
    stand(flag, fd, surf(fd)); scene.add(flag);
    if (o.isHome) {
      const hd = spawn.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -7 / R).normalize();
      const dome = new THREE.Group();
      dome.add(new THREE.Mesh(track(new THREE.SphereGeometry(4.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), track(new THREE.MeshStandardMaterial({ color: '#BFE3FF', transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide }))));
      const lawn = new THREE.Mesh(track(new THREE.CylinderGeometry(4.4, 4.4, 0.2, 32)), track(new THREE.MeshStandardMaterial({ color: '#4FA552' }))); dome.add(lawn);
      for (let i = 0; i < 3; i++) { const tr = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.9 + i * 0.2, 0)), track(new THREE.MeshStandardMaterial({ color: '#2F7D3A', flatShading: true }))); tr.position.set(-1.8 + i * 1.8, 1.4, (i % 2) - 0.5); dome.add(tr); }
      stand(dome, hd, surf(hd) - 0.1); scene.add(dome);
    }
  }

  // ---- samples -----------------------------------------------------------------------------------
  type Sample = { d: THREE.Vector3; m: THREE.Mesh; glow: THREE.Sprite; got: boolean };
  const samples: Sample[] = [];
  {
    const sg = track(new THREE.OctahedronGeometry(0.45, 0));
    const sm = track(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: det, emissiveIntensity: 1.2, flatShading: true }));
    const gm = track(new THREE.SpriteMaterial({ map: glowTex, color: det, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (let i = 0; i < o.samples; i++) {
      const a = (i / o.samples) * Math.PI * 2 + r(), dist = (10 + r() * 16) / R;
      const tangent = new THREE.Vector3().crossVectors(spawn, UP).normalize().applyAxisAngle(spawn, a);
      const d = spawn.clone().applyAxisAngle(new THREE.Vector3().crossVectors(spawn, tangent).normalize(), dist).normalize();
      const m = new THREE.Mesh(sg, sm); const glow = new THREE.Sprite(gm); glow.scale.setScalar(3);
      scene.add(m, glow); samples.push({ d, m, glow, got: false });
    }
  }

  // ---- plots -------------------------------------------------------------------------------------
  const plotGroup = new THREE.Group(); scene.add(plotGroup);
  const plotMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  const labels: { s: THREE.Sprite; d: THREE.Vector3 }[] = [];
  const flagGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5)); const clothGeo = track(new THREE.PlaneGeometry(1.2, 0.75));
  const poleMat = track(new THREE.MeshStandardMaterial({ color: '#E6EBF5' }));
  let plotGeo: THREE.BufferGeometry | null = null;
  const clearPlots = () => {
    for (const c of [...plotGroup.children]) { plotGroup.remove(c); if (c instanceof THREE.Sprite) { c.material.map?.dispose(); c.material.dispose(); } else if (c instanceof THREE.InstancedMesh) c.dispose(); }
    plotGeo?.dispose(); plotGeo = null; labels.length = 0;
  };
  const setPlots = (plots: PlanetPlot[]) => {
    clearPlots();
    if (!plots.length) return;
    const verts: number[] = [], cs: number[] = [], idx: number[] = [];
    const cloths = new THREE.InstancedMesh(clothGeo, track(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 })), plots.length);
    const poles = new THREE.InstancedMesh(flagGeo, poleMat, plots.length);
    const o3 = new THREE.Object3D();
    plots.forEach((p, i) => {
      const c = css(p.owner.accent || '#8B5CFF');
      const t = tileGeo(p, 0.16, 0.04);
      const base = verts.length / 3;
      verts.push(...t.verts); for (let k = 0; k < t.verts.length / 3; k++) cs.push(c.r, c.g, c.b); idx.push(...t.idx.map((x) => x + base));
      const d = V(cellCenterDir(p, rows));
      stand(o3, d, surf(d) + 1.2); o3.updateMatrix(); poles.setMatrixAt(i, o3.matrix);
      stand(o3, d, surf(d) + 2.1); o3.translateX(0.6); o3.updateMatrix(); cloths.setMatrixAt(i, o3.matrix); cloths.setColorAt(i, c);
      const lab = textSprite(p.name ? `${p.name}` : p.mine ? 'My plot' : `@${p.owner.username}`, p.mine ? '#FFE36B' : '#ffffff', 0.5);
      stand(lab, d, surf(d) + 2.9); lab.quaternion.identity(); plotGroup.add(lab); labels.push({ s: lab, d });
    });
    plotGeo = new THREE.BufferGeometry();
    plotGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    plotGeo.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    plotGeo.setIndex(idx);
    plotGroup.add(new THREE.Mesh(plotGeo, plotMat), poles, cloths);
  };
  // the plot you're standing on (or looking at in orbit)
  const hiMat = track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
  const hiLine = track(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
  let hi: THREE.Group | null = null; let hiKey = '';
  const highlight = (c: Cell | null) => {
    const k = c ? cellKey(c) : '';
    if (k === hiKey) return; hiKey = k;
    if (hi) { scene.remove(hi); hi.traverse((x) => { if (x instanceof THREE.Mesh || x instanceof THREE.LineLoop) x.geometry.dispose(); }); hi = null; }
    if (!c) return;
    const t = tileGeo(c, 0.22);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(t.verts, 3)); gg.setIndex(t.idx);
    const N = 7, ring: number[] = [];
    const at = (i: number, j: number) => ring.push(t.verts[(i * N + j) * 3], t.verts[(i * N + j) * 3 + 1], t.verts[(i * N + j) * 3 + 2]);
    for (let j = 0; j < N; j++) at(0, j); for (let i = 0; i < N; i++) at(i, N - 1); for (let j = N - 1; j >= 0; j--) at(N - 1, j); for (let i = N - 1; i >= 0; i--) at(i, 0);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    hi = new THREE.Group(); hi.add(new THREE.Mesh(gg, hiMat), new THREE.LineLoop(lg, hiLine)); scene.add(hi);
  };

  // ---- you, your Inkborn, other explorers ---------------------------------------------------------
  const me = imageSprite(o.explorerUrl, 1.9); scene.add(me);
  const shadowMat = track(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
  const shadow = new THREE.Mesh(track(new THREE.CircleGeometry(0.55, 20)), shadowMat); scene.add(shadow);
  const P = { d: spawn.clone(), up: 0, vy: 0, face: new THREE.Vector3(), target: null as THREE.Vector3 | null, moving: false };
  { // land a few steps east of the rocket, looking north (the rocket off to your left)
    const east = new THREE.Vector3().crossVectors(UP, P.d).normalize();
    P.d.applyAxisAngle(new THREE.Vector3().crossVectors(P.d, east).normalize(), 9 / R).normalize();
  }
  const camF = new THREE.Vector3().crossVectors(UP, P.d).cross(P.d).negate().normalize(); // north along the ground
  if (camF.lengthSq() < 0.5) camF.set(0, 0, 1);
  P.face.copy(camF);
  let buddy: { s: THREE.Sprite; c: HTMLCanvasElement; tex: THREE.CanvasTexture; d: THREE.Vector3; st: CreatureState; hop: number; dir: 1 | -1 } | null = null;
  if (o.buddy) {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 })); s.scale.set(1.7, 1.7, 1); s.center.set(0.5, 0.06);
    scene.add(s); buddy = { s, c, tex, d: P.d.clone(), st: 'idle', hop: 0, dir: 1 };
  }
  type Other = { s: THREE.Sprite; lab: THREE.Sprite; d: THREE.Vector3; to: THREE.Vector3; face: THREE.Vector3; hop: number; hopTo: number; streamed: number; walk: number };
  const others = new Map<string, Other>();
  const dropOther = (id: string) => { const x = others.get(id); if (!x) return; scene.remove(x.s, x.lab); x.s.material.map?.dispose(); x.s.material.dispose(); x.lab.material.map?.dispose(); x.lab.material.dispose(); others.delete(id); };
  const vec = (a: number[] | null | undefined) => (a && a.length === 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]).normalize() : null);
  const setLive = (list: Pilot[]) => {
    const keep = new Set(list.map((p) => p.id));
    for (const id of [...others.keys()]) if (!keep.has(id)) dropOther(id);
    for (const p of list) {
      const d = vec(p.d);
      let x = others.get(p.id);
      if (!x) {
        const s = imageSprite(p.explorerUrl, 1.9); const lab = textSprite(`@${p.username}`, '#ffffff', 0.45);
        const start = d ?? spawn.clone();
        x = { s, lab, d: start.clone(), to: start.clone(), face: new THREE.Vector3(0, 1, 0), hop: 0, hopTo: 0, streamed: 0, walk: 0 };
        scene.add(s, lab); others.set(p.id, x);
      }
      // heartbeat positions only fill in when nothing has streamed in lately
      if (d && performance.now() - x.streamed > 2500) { x.to.copy(d); const f = vec(p.face); if (f) x.face.copy(f); x.hopTo = p.hop ?? 0; }
    }
  };
  const remote = (id: string, d: number[], face: number[], hop: number) => {
    const x = others.get(id); const v = vec(d); if (!x || !v) return;
    x.to.copy(v); const f = vec(face); if (f) x.face.copy(f); x.hopTo = Math.max(0, Math.min(50, Number(hop) || 0)); x.streamed = performance.now();
  };

  // ---- controls ---------------------------------------------------------------------------------
  const joy = { x: 0, y: 0 };
  const keys = new Set<string>();
  let jumpQueued = false;
  const kd = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable]')) return;
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === ' ') { jumpQueued = true; e.preventDefault(); }
    if (k.startsWith('arrow')) e.preventDefault();
  };
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const blur = () => keys.clear(); window.addEventListener('blur', blur);
  let orbit = false; let pitch = 0.26; let dist = 8.5;
  const oDir = new THREE.Vector3(); let oDist = R * 2.9; const oUp = new THREE.Vector3();
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const pick = (cx: number, cy: number) => {
    const rc = o.canvas.getBoundingClientRect();
    ndc.set(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(planet, false)[0];
    return hit ? hit.point.clone().normalize() : null;
  };
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; moved: number } | null = null; let pinch = 0;
  const pd = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { o.canvas.setPointerCapture(e.pointerId); } catch { /* gone */ }
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0 };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag = null; }
  };
  const pm = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoom(pinch / d); pinch = d; return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (orbit) {
      const right = new THREE.Vector3().crossVectors(oDir, oUp).normalize();
      oDir.applyAxisAngle(oUp, -dx * 0.005).applyAxisAngle(right, -dy * 0.005).normalize();
      oUp.copy(new THREE.Vector3().crossVectors(right, oDir)).normalize();
    } else {
      camF.applyAxisAngle(P.d, -dx * 0.006).normalize();
      pitch = Math.max(0.08, Math.min(1.25, pitch + dy * 0.004));
    }
  };
  const pu = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (drag && drag.moved < 8 && pointers.size === 0) {
      const d = pick(e.clientX, e.clientY);
      if (orbit) { const c = d ? cellAt([d.x, d.y, d.z], rows) : null; highlight(c); o.onPick(c); if (d) P.target = d; }
      else if (d && d.angleTo(P.d) * R < 60) P.target = d;
    }
    if (pointers.size === 0) { drag = null; pinch = 0; }
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 0.9); };
  o.canvas.addEventListener('pointerdown', pd); o.canvas.addEventListener('pointermove', pm);
  o.canvas.addEventListener('pointerup', pu); o.canvas.addEventListener('pointercancel', pu);
  o.canvas.addEventListener('wheel', wheel, { passive: false });
  const zoom = (f: number) => {
    if (orbit) oDist = Math.max(R * 1.35, Math.min(R * 5, oDist * f));
    else dist = Math.max(4, Math.min(22, dist * f));
  };
  const setOrbit = (on: boolean) => {
    if (on === orbit) return;
    orbit = on; o.onMode(on);
    if (on) { oDir.copy(P.d).add(camF.clone().multiplyScalar(-0.35)).normalize(); oUp.copy(camF).projectOnPlane(oDir).normalize(); oDist = R * 2.9; }
    else { lastCell = '__'; }
  };

  // ---- the loop ----------------------------------------------------------------------------------
  const G = 22 * Math.max(0.15, Math.min(2.5, w.gravity));
  const SPEED = 7;
  let lastCell = ''; let got = 0; let intro = reduce ? 1 : 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camUp = new THREE.Vector3();
  const introFrom = spawn.clone().multiplyScalar(R * 4).add(new THREE.Vector3(0, R * 0.8, 0));
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  const moveOn = (d: THREE.Vector3, dir: THREE.Vector3, dist2: number) => {
    const axis = tv2.crossVectors(d, dir); if (axis.lengthSq() < 1e-9) return;
    axis.normalize(); d.applyAxisAngle(axis, dist2 / R).normalize();
  };
  const resize = () => {
    const rc = o.canvas.getBoundingClientRect();
    renderer.setSize(rc.width, rc.height, false);
    camera.aspect = rc.width / Math.max(1, rc.height); camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(o.canvas);
  let raf = 0, last = performance.now(), t = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const up = P.d;
    // keep the camera's forward lying flat on the ground under you
    camF.projectOnPlane(up).normalize();
    const right = tv.crossVectors(camF, up).normalize();
    let mx = joy.x + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    let my = joy.y + (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    if (keys.has('q')) camF.applyAxisAngle(up, dt * 1.8);
    if (keys.has('e')) camF.applyAxisAngle(up, -dt * 1.8);
    const move = new THREE.Vector3();
    if (orbit) { mx = 0; my = 0; }
    if (mx || my) { P.target = null; move.addScaledVector(camF, my).addScaledVector(right, mx); }
    else if (P.target && !orbit) {
      if (P.target.angleTo(up) * R < 0.6) P.target = null;
      else move.copy(P.target).projectOnPlane(up);
    }
    P.moving = move.lengthSq() > 1e-4;
    if (P.moving) {
      const sp = Math.min(1, move.length()) * SPEED * (P.target ? 1.15 : 1);
      move.normalize(); P.face.lerp(move, Math.min(1, dt * 10)).normalize();
      moveOn(P.d, move, sp * dt);
      // the camera swings round behind you when you walk sideways (gently)
      if (!orbit && Math.abs(mx) > 0.2 && my >= 0) camF.lerp(P.face, dt * 0.8).normalize();
      if (P.target && !orbit) camF.lerp(P.face, dt * 2.2).normalize();
    }
    if (jumpQueued && P.up <= 0.001 && !orbit) { P.vy = 9; jumpQueued = false; } else if (P.up > 0.001) jumpQueued = false;
    P.vy -= G * dt; P.up = Math.max(0, P.up + P.vy * dt); if (P.up === 0) P.vy = 0;
    const ground = surf(P.d);
    const bob = P.moving && P.up === 0 && !reduce ? Math.abs(Math.sin(t * 11)) * 0.12 : 0;
    me.position.copy(P.d).multiplyScalar(ground + P.up + bob);
    // mirror the explorer to face the way you walk on screen
    if (P.moving) { const sx = P.face.dot(right); if (Math.abs(sx) > 0.15) { const m = me.material.map!; m.repeat.x = sx < 0 ? -1 : 1; m.offset.x = sx < 0 ? 1 : 0; } }
    stand(shadow, P.d, ground + 0.08); shadowMat.opacity = 0.28 * Math.max(0.25, 1 - P.up / 8);

    // your Inkborn follows, a couple of steps behind
    if (buddy) {
      const want = P.d.clone(); moveOn(want, P.face.clone().negate(), 2.2);
      const gap = buddy.d.angleTo(want) * R;
      if (gap > 0.4) { const dir = want.clone().projectOnPlane(buddy.d).normalize(); moveOn(buddy.d, dir, Math.min(gap, (gap > 6 ? 11 : 7.5) * dt)); buddy.st = 'walk'; buddy.dir = dir.dot(right) < 0 ? -1 : 1; }
      else if (buddy.st === 'walk') buddy.st = 'idle';
      buddy.hop = Math.max(0, buddy.hop - dt);
      const hopY = buddy.hop > 0 ? Math.sin((buddy.hop / 0.7) * Math.PI) * 1.4 : 0;
      buddy.s.position.copy(buddy.d).multiplyScalar(surf(buddy.d) + hopY);
      if (((t * 30) | 0) % 2 === 0) {
        const g = buddy.c.getContext('2d')!; g.clearRect(0, 0, 160, 160);
        drawCreature(g, o.buddy!, 80, 150, 78, { t, state: buddy.hop > 0 ? 'happy' : buddy.st, dir: buddy.dir });
        g.strokeStyle = 'rgba(200,230,255,0.8)'; g.lineWidth = 3; g.fillStyle = 'rgba(180,220,255,0.12)'; g.beginPath(); g.arc(80, 108, 54, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(58, 80, 10, 5, -0.6, 0, Math.PI * 2); g.fill();
        buddy.tex.needsUpdate = true;
      }
    }
    // the others in your live group glide to where they are
    for (const x of others.values()) {
      const gap = x.d.angleTo(x.to) * R;
      if (gap > 40) x.d.copy(x.to);
      else if (gap > 0.01) moveOn(x.d, x.to.clone().projectOnPlane(x.d).normalize(), Math.min(gap, Math.max(gap * dt * 9, 7.5 * dt)));
      x.walk = gap > 0.15 ? x.walk + dt * 11 : 0;
      x.hop += (x.hopTo - x.hop) * Math.min(1, dt * 12);
      const gr = surf(x.d) + x.hop + (x.walk && x.hop < 0.05 ? Math.abs(Math.sin(x.walk)) * 0.12 : 0);
      x.s.position.copy(x.d).multiplyScalar(gr);
      x.lab.position.copy(x.d).multiplyScalar(gr + 2.1);
      const sx = x.face.dot(right); if (Math.abs(sx) > 0.15) { const m = x.s.material.map!; m.repeat.x = sx < 0 ? -1 : 1; m.offset.x = sx < 0 ? 1 : 0; }
    }
    // samples spin and glow; walk into them
    for (const s of samples) {
      if (s.got) continue;
      const y = surf(s.d) + 1.1 + (reduce ? 0 : Math.sin(t * 2.4 + s.d.x * 9) * 0.25);
      s.m.position.copy(s.d).multiplyScalar(y); s.m.rotation.y = t * 1.6; s.m.rotation.x = t * 0.7;
      s.glow.position.copy(s.m.position); s.glow.material.opacity = 0.55 + 0.3 * Math.sin(t * 4);
      if (s.d.angleTo(P.d) * R < 1.4 && P.up < 2.2) {
        s.got = true; scene.remove(s.m, s.glow); got++; o.onSample(got);
        if (buddy) { buddy.hop = 0.7; buddy.st = 'happy'; }
      }
    }
    // plot labels only show nearby (and in orbit, none)
    for (const l of labels) l.s.visible = !orbit && l.d.angleTo(P.d) * R < 24;
    // which plot am I on?
    const c = cellAt([P.d.x, P.d.y, P.d.z], rows);
    const k = c ? cellKey(c) : '';
    if (k !== lastCell) { lastCell = k; if (!orbit) { highlight(c); o.onCell(c); } }
    hiLine.opacity = 0.55 + 0.35 * Math.sin(t * 4);

    // camera
    if (orbit) {
      camPos.copy(oDir).multiplyScalar(oDist); camLook.set(0, 0, 0); camUp.copy(oUp);
      skyU.space.value += (1 - skyU.space.value) * Math.min(1, dt * 3);
      scene.fog = null; starMat.opacity += (0.95 - starMat.opacity) * Math.min(1, dt * 3);
    } else {
      const head = P.d.clone().multiplyScalar(ground + P.up * 0.6 + 1.3);
      camPos.copy(head).addScaledVector(up, Math.sin(pitch) * dist).addScaledVector(camF, -Math.cos(pitch) * dist);
      // never dip under the ground
      const cd = camPos.clone().normalize(); const minR = surf(cd) + 0.8; if (camPos.length() < minR) camPos.copy(cd.multiplyScalar(minR));
      camLook.copy(head).addScaledVector(camF, 4).addScaledVector(up, 0.4); camUp.copy(up);
      skyU.space.value += (0 - skyU.space.value) * Math.min(1, dt * 3);
      scene.fog = fog; starMat.opacity += ((w.dark ? 0.95 : 0.12) - starMat.opacity) * Math.min(1, dt * 3);
    }
    skyU.up.value.copy(up);
    if (intro < 1) {
      intro = Math.min(1, intro + dt / 2.8);
      const e = 1 - Math.pow(1 - intro, 3);
      camera.position.lerpVectors(introFrom, camPos, e);
      camera.up.copy(UP).lerp(camUp, e).normalize();
      camera.lookAt(tv2.set(0, 0, 0).lerp(camLook, e));
      scene.fog = e > 0.7 ? scene.fog : null;
    } else {
      const k2 = orbit ? Math.min(1, dt * 4) : Math.min(1, dt * 9);
      camera.position.lerp(camPos, k2);
      camera.up.lerp(camUp, k2).normalize();
      camera.lookAt(camLook);
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  if (import.meta.env.DEV || location.search.includes('e2e=1')) (window as any).__landvasPlanet = { P, samples, R, rows, setOrbit, setLive: (l: Pilot[]) => setLive(l), remote: (...a: [string, number[], number[], number]) => remote(...a), walkTo: (c: Cell) => api.walkTo(c), cell: () => cellAt([P.d.x, P.d.y, P.d.z], rows) };

  const api: PlanetScene = {
    joy, jump: () => { jumpQueued = true; }, setPlots, setLive, remote, setOrbit, zoom,
    pose: () => ({ d: P.d.toArray(), face: P.face.toArray(), hop: P.up, moving: P.moving || P.up > 0 }),
    teleport: (d) => { const v = vec(d); if (!v) return; const side = new THREE.Vector3().crossVectors(v, UP).normalize(); if (side.lengthSq() < 0.5) side.set(1, 0, 0); P.d.copy(v); moveOn(P.d, side, 2.2); P.target = null; if (buddy) buddy.d.copy(P.d); camF.copy(v).sub(P.d).projectOnPlane(P.d).normalize(); },
    walkTo: (c) => { P.target = V(cellCenterDir(c, rows)); setOrbit(false); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
      o.canvas.removeEventListener('pointerdown', pd); o.canvas.removeEventListener('pointermove', pm); o.canvas.removeEventListener('pointerup', pu);
      o.canvas.removeEventListener('pointercancel', pu); o.canvas.removeEventListener('wheel', wheel);
      clearPlots(); highlight(null);
      scene.traverse((x) => { if (x instanceof THREE.Sprite) { x.material.map?.dispose(); x.material.dispose(); } });
      buddy?.tex.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
  return api;
}
