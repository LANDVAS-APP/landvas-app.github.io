// Riding your rocket to another world, in first person. Liftoff from where you stand: the ground drops away, the blue
// sky thins to black and the stars come out, the Earth's curve shows beneath you and falls behind; past the Moon; out
// across the solar system — the Sun, every planet on its orbit, the one you're headed for growing ahead — for as long
// as the real trip takes; then down onto it, through its sky, onto its ground.
//
// One scene, one camera, a handful of spheres with painted surfaces (the same paintings as mission control's map), a
// sky of points. Paced like every other 3D scene here (framePacer); nothing else on the page draws while it's up.
import * as THREE from 'three';
import { framePacer, sceneAntialias, sceneDpr } from '../lib/gfx';
import { planetTexture } from '../space/system3d';
import { WORLDS, worldOf, type World } from '../space/worlds';

export type FlightPhase = 'liftoff' | 'cruise' | 'approach' | 'landed';
export type Flight = {
  /** where this trip goes: from (a world's id, 'earth') to (id); `liftoff` plays the launch from the ground */
  leg(from: string, to: string, liftoff: boolean, home?: { seed: number | null; name: string | null }): void;
  /** the trip's real progress (0..1), and whether it has landed */
  progress(p: number, landed: boolean): void;
  phase(): FlightPhase;
  /** how strongly the rocket burns and shakes right now (0..1), for the cockpit drawing */
  burn(): number;
  debug(): Record<string, unknown>;
  dispose(): void;
};

/** where each world sits (scaled for the show, not to scale), its size, and the angle along its orbit */
const ORBIT: Record<string, number> = { mercury: 70, venus: 100, earth: 140, mars: 185, jupiter: 270, saturn: 345, uranus: 420, neptune: 480, pluto: 530 };
const ANGLE: Record<string, number> = { mercury: 0.6, venus: 2.4, earth: 0, mars: 0.9, jupiter: -0.7, saturn: 1.9, uranus: -1.6, neptune: 2.8, pluto: -2.4 };
const SIZE: Record<string, number> = { mercury: 2.2, venus: 4.2, earth: 4.6, moon: 1.25, mars: 3, jupiter: 13, saturn: 11, uranus: 7.5, neptune: 7.2, pluto: 1.5, exo: 5 };
const EARTH = new THREE.Vector3(ORBIT.earth, 0, 0);
const MOON = EARTH.clone().add(new THREE.Vector3(-9, 2.2, -12));
const EXO = new THREE.Vector3(-420, 170, -620);

const posOf = (id: string) => {
  if (id === 'earth') return EARTH.clone();
  if (id === 'moon') return MOON.clone();
  if (id.startsWith('exo:') || id === 'home') return EXO.clone();
  const r = ORBIT[id] ?? 200, a = ANGLE[id] ?? 0;
  return new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 3) * 4, Math.sin(a) * r);
};
const sizeOf = (id: string) => SIZE[id.startsWith('exo:') || id === 'home' ? 'exo' : id] ?? 4;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function createFlight(canvas: HTMLCanvasElement, o: { reduce: boolean }): Flight {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: sceneAntialias(), alpha: false, powerPreference: "high-performance", logarithmicDepthBuffer: true });
  renderer.setPixelRatio(sceneDpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(66, 1, 0.005, 6000);
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };

  // ---- the sky: stars all round, the Milky Way's haze ----------------------------------------------------------------
  {
    const n = 4200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let s = 7; const r = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      // (a third of them crowd along a band: the galaxy edge-on)
      const band = i % 3 === 0;
      const u = r() * 2 - 1, th = r() * Math.PI * 2;
      const y = band ? (r() - 0.5) * 0.25 : u, rr = Math.sqrt(1 - y * y);
      const v = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr).applyAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), 1.05).multiplyScalar(3000);
      pos.set([v.x, v.y, v.z], i * 3);
      const w = 0.55 + r() * 0.45, tint = r();
      col.set(tint < 0.15 ? [w, w * 0.8, w * 0.6] : tint < 0.3 ? [w * 0.75, w * 0.85, w] : [w, w, w], i * 3);
    }
    const g = T(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = T(new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    scene.add(new THREE.Points(g, m));
  }
  const starsMat = (scene.children[0] as THREE.Points).material as THREE.PointsMaterial;

  // ---- the Sun ------------------------------------------------------------------------------------------------------
  const glowTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,240,200,0.8)'); grd.addColorStop(0.6, 'rgba(255,180,90,0.18)'); grd.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return T(new THREE.CanvasTexture(c));
  })();
  const sun = new THREE.Mesh(T(new THREE.SphereGeometry(22, 32, 16)), T(new THREE.MeshBasicMaterial({ color: '#FFF1C2' })));
  const sunGlow = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: glowTex, color: '#FFD27A', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  sunGlow.scale.setScalar(150);
  scene.add(sun, sunGlow);
  const sunLight = new THREE.PointLight('#FFF4DE', 2.2, 0, 0);
  scene.add(sunLight, new THREE.AmbientLight('#8090C0', 0.32));

  // ---- the worlds -----------------------------------------------------------------------------------------------------
  const bodies = new Map<string, THREE.Mesh>();
  const ballGeo = T(new THREE.SphereGeometry(1, 48, 24));
  const addBody = (id: string, w: World | 'earth', seed = 1) => {
    const tex = T(planetTexture(w, seed));
    const m = new THREE.Mesh(ballGeo, T(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 })));
    m.scale.setScalar(sizeOf(id));
    m.position.copy(posOf(id));
    m.rotation.z = 0.3;
    scene.add(m);
    bodies.set(id, m);
    if (w !== 'earth' && w.ring) {
      const ring = new THREE.Mesh(T(new THREE.RingGeometry(1.35, 2.25, 64)), T(new THREE.MeshBasicMaterial({ color: w.ring, transparent: true, opacity: 0.6, side: THREE.DoubleSide })));
      ring.rotation.x = Math.PI / 2 - 0.35;
      m.add(ring);
    }
    return m;
  };
  addBody('earth', 'earth', 3);
  for (const id of ['moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) addBody(id, WORLDS[id as keyof typeof WORLDS]);
  // the Earth's air: a blue rim round it (and its clouds)
  const airMat = T(new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color('#6FB7FF') } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(uC, f * 0.9); }`,
  }));
  const air = new THREE.Mesh(ballGeo, airMat);
  air.scale.setScalar(SIZE.earth * 1.06);
  air.position.copy(EARTH);
  scene.add(air);
  const clouds = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 256, height: 128 }), g = c.getContext('2d')!;
    let s = 11; const r = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`; g.beginPath(); g.ellipse(r() * 256, 10 + r() * 108, 6 + r() * 22, 2 + r() * 6, 0, 0, Math.PI * 2); g.fill(); }
    const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(ballGeo, T(new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1 })));
    m.scale.setScalar(SIZE.earth * 1.015); m.position.copy(EARTH);
    scene.add(m);
    return m;
  })();
  let exo: THREE.Mesh | null = null;

  // ---- the trip -----------------------------------------------------------------------------------------------------
  let from = 'earth', to = 'moon', lifting = false, t0 = performance.now();
  let prog = 0, landedAt = 0, landed = false;
  let up = new THREE.Vector3(0, 1, 0); // the "up" where you lift off
  let curve: THREE.CubicBezierCurve3 | null = null;
  let ph: FlightPhase = 'cruise';
  let burnK = 0;
  const LIFT_S = o.reduce ? 2 : 8;

  const leg: Flight['leg'] = (a, b, liftoff, home) => {
    from = a; to = b; lifting = liftoff; t0 = performance.now(); landed = false; landedAt = 0;
    if ((b.startsWith('exo:') || b === 'home' || a.startsWith('exo:')) && !exo) {
      const id = b.startsWith('exo:') || b === 'home' ? b : a;
      const w = worldOf(id === 'home' ? `exo:${home?.seed ?? 1}` : id, home?.seed, home?.name);
      if (w) { exo = addBody(id, w, Number(id.slice(4)) || 5); exo.position.copy(EXO); }
    }
    const A = bodyPos(a), B = bodyPos(b);
    // lift off from the side of the world that faces where you're going (and a little up out of the plane)
    up = B.clone().sub(A).normalize().add(new THREE.Vector3(0, 0.45, 0)).normalize();
    const ra = sizeOf(a), rb = sizeOf(b);
    const p0 = A.clone().addScaledVector(up, ra * 2.6);
    const dir = B.clone().sub(A).normalize();
    const p3 = B.clone().addScaledVector(dir, -rb * 4.2).add(new THREE.Vector3(0, rb * 1.2, 0));
    const lift = Math.max(20, A.distanceTo(B) * 0.22);
    curve = new THREE.CubicBezierCurve3(p0, p0.clone().addScaledVector(up, lift * 0.6).add(new THREE.Vector3(0, lift * 0.4, 0)),
      p3.clone().addScaledVector(dir, -lift).add(new THREE.Vector3(0, lift * 0.5, 0)), p3);
  };
  const bodyPos = (id: string) => (bodies.get(id === 'home' ? id : id)?.position.clone() ?? posOf(id));

  const look = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const place = (now: number) => {
    if (!curve) return;
    const A = bodyPos(from), B = bodyPos(to), ra = sizeOf(from), rb = sizeOf(to);
    const liftT = (now - t0) / 1000;
    // the path's share: the first moments of the trip are the liftoff, the rest runs with the real clock
    const u = Math.min(1, Math.max(0, prog));
    const uC = 0.02 + ease(u) * 0.98;
    if (lifting && liftT < LIFT_S) {
      // standing on the ground, then up: the ground falls away, the sky goes dark, the curve of the world shows
      ph = 'liftoff';
      const k = liftT / LIFT_S, e = k * k * (3 - 2 * k);
      const alt = ra * (0.004 + Math.pow(k, 2.4) * 1.6);
      // (along the surface toward `up`'s side, rising)
      const side = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize();
      const n = up.clone().applyAxisAngle(side, (1 - e) * 0.9).normalize();
      cam.position.copy(A).addScaledVector(n, ra + alt);
      // look out over the horizon, then up, then out toward the path
      const horizon = new THREE.Vector3().crossVectors(n, side).normalize();
      const start = curve.getPoint(0.02);
      look.copy(cam.position).add(horizon.multiplyScalar(10)).lerp(tmp.copy(cam.position).addScaledVector(n, 10), Math.min(1, e * 1.6));
      if (k > 0.55) look.lerp(start.clone().add(curve.getTangent(0.05).multiplyScalar(40)), (k - 0.55) / 0.45);
      burnK = 0.6 + 0.4 * Math.min(1, k * 3);
      const shake = (1 - k) * 0.004 * ra;
      cam.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
      cam.lookAt(look);
      // the sky: blue near the ground, black above
      const air2 = Math.max(0, 1 - alt / (ra * 0.08));
      skyTo(from === 'earth' ? '#7AB8FF' : (worldOf(from)?.sky[1] ?? '#05060F'), air2);
      return;
    }
    if (!landed || (now - landedAt) / 1000 < 0) {
      ph = 'cruise';
      cam.position.copy(curve.getPoint(uC));
      // look ahead along the way, and more and more at where you're going
      const ahead = curve.getPoint(Math.min(1, uC + 0.04));
      look.copy(ahead).lerp(B, Math.min(1, 0.35 + u * 0.65));
      cam.lookAt(look);
      burnK = 0.35 + (u < 0.06 ? 0.4 : 0) + (u > 0.94 ? 0.3 : 0);
      skyTo('#05060F', 0);
      return;
    }
    // down onto it: through its sky, onto the ground
    const k = Math.min(1, (now - landedAt) / 1000 / (o.reduce ? 1.5 : 6));
    ph = k >= 1 ? 'landed' : 'approach';
    const e = ease(k);
    const p3 = curve.getPoint(1);
    const n = p3.clone().sub(B).normalize();
    const ground = B.clone().addScaledVector(n, rb * (1 + 0.004));
    cam.position.copy(p3).lerp(ground, e);
    const side = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    const horizon = new THREE.Vector3().crossVectors(side, n).normalize();
    look.copy(B).lerp(tmp.copy(cam.position).addScaledVector(horizon, 10).addScaledVector(n, 1.5), Math.pow(e, 1.5));
    cam.lookAt(look);
    burnK = k < 1 ? 0.5 + 0.5 * Math.sin(k * Math.PI) : 0;
    const w = worldOf(to);
    skyTo(to === 'earth' ? '#7AB8FF' : (w?.sky[1] ?? '#05060F'), Math.max(0, (e - 0.6) / 0.4) * (w?.dark ? 0.15 : 1));
  };
  const black = new THREE.Color('#05060F');
  const sky = new THREE.Color('#05060F');
  const skyTo = (c: string, k: number) => {
    sky.copy(black).lerp(tmp2.set(c), Math.min(1, Math.max(0, k)));
    scene.background = sky;
    starsMat.opacity = 1 - Math.min(1, k * 1.4);
  };
  const tmp2 = new THREE.Color();
  scene.background = sky;

  // ---- frames -------------------------------------------------------------------------------------------------------
  const resize = () => {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / Math.max(1, h);
    cam.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const pace = framePacer();
  let raf = 0, frames = 0, gone = false;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (gone || document.hidden || !pace.ready(now)) return;
    frames++;
    const t = now / 1000;
    for (const [id, b] of bodies) b.rotation.y = t * (id === 'earth' ? 0.05 : 0.03);
    clouds.rotation.y = t * 0.07;
    place(now);
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(tick);

  return {
    leg,
    progress: (p, isLanded) => {
      prog = p;
      if (isLanded && !landed) { landed = true; landedAt = performance.now(); if (lifting && performance.now() - t0 < LIFT_S * 1000) landedAt = t0 + LIFT_S * 1000; }
    },
    phase: () => ph,
    burn: () => burnK,
    debug: () => ({ phase: ph, from, to, progress: prog, frames, cam: cam.position.toArray().map((v) => Math.round(v * 10) / 10) }),
    dispose: () => {
      gone = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const d of own) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
