// LANDVAS through your explorer's eyes: a first-person 3D view of the real place your explorer stands in.
//
// Two passes, so things a metre away and mountains 80 km off both draw cleanly on a phone's depth buffer:
//  * far  — the sky (the real sun, moon, stars, planets and the Milky Way for this place and moment, and clouds),
//           the land out to the horizon from real elevation (with the town's streets painted on it), and anything
//           big and distant: Primordial beacons, a far-off Leviathan, the Hot Zone;
//  * near — the street at your feet, the buildings at their real heights, trees, every plot around you (glowing
//           auras by rarity, art on the slabs, your own plots as floating cards), the plot grid, falling stars, sky
//           treasures, your party, and the Leviathan when it's close.
// Look by dragging (or by moving the phone), pinch to zoom, tap anything.
import * as THREE from 'three';
import { adaptiveDpr, framePacer, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';
import { CONSTELLATIONS, NAMED_STARS, daylight, equatorial, galactic, moonPosition, planets, skyDir, skyMatrix, sunPosition, type NamedStar } from './astro';
import { bearingDistance, cellToLocal, curveDrop, lngLatToLocal, localToCell, plotSize, type Frame } from './geo';
import { hex, type BuildingMesh, type StreetThings, type Terrain, type TreePt } from './world';
import { createNature } from './nature';
import { createStreet } from './street';
import { createLeviathan, glowTexture, type LevLook } from './leviathan3d';
import { createBody, type BodyLook, type BodyVehicle } from './body';
import { createEyesSound, type Surface } from './sound';

export type PlotPlace = { gx: number; gy: number; rarity: string; color: string; glow: string; tier: number; mine: boolean; group: string | null; shiny: boolean; emoji: string | null; name: string | null };
export type Beacon = { id: string; lng: number; lat: number; color: string; emoji: string };
export type LevPlace = { lng: number; lat: number; heading: number; walking: boolean; look: LevLook };
export type SkyDrop = { id: string; kind: 'balloon' | 'lantern' | 'meteor'; seed: number };
export type FallingStar = { id: number; gx: number; gy: number };
export type Buddy = { id: string; lng: number; lat: number; name: string; color: string };
export type HotDome = { lng: number; lat: number; radiusM: number };

export type Pick =
  | { kind: 'cell'; gx: number; gy: number; dist: number }
  | { kind: 'lev' }
  | { kind: 'beacon'; id: string }
  | { kind: 'star'; id: number }
  | { kind: 'drop'; id: string }
  | { kind: 'buddy'; id: string }
  | { kind: 'sky'; what: 'sun' | 'moon' | 'star' | 'planet'; name: string; ly?: number; group?: string };

export type EyesOpts = {
  canvas: HTMLCanvasElement;
  /** where the explorer is right now (called every frame) */ pose(): { lng: number; lat: number } | null;
  /** how high the eyes are (m): on foot, on a bike, in the car, on the jetpack */ eye(): number;
  onPick(p: Pick | null, at: { x: number; y: number }): void;
  /** the camera turned (compass bearing and pitch, radians), at most a few times a second */ onLook?(yaw: number, pitch: number): void;
  reduceMotion?: boolean;
  /** you've moved near the edge of the sharpest ground: paint a new patch round (x, z) */ onNeedClose?(x: number, z: number): void;
  /** what you're riding (the hands, the seat, the sounds) */ vehicle?(): BodyVehicle;
};

export type Eyes = {
  setFrame(f: Frame): void;
  frame(): Frame | null;
  setGround(near: { canvas: HTMLCanvasElement; region: { x0: number; z0: number; size: number }; glow: number } | null,
    far: { canvas: HTMLCanvasElement; region: { x0: number; z0: number; size: number }; glow: number } | null): void;
  setBuildings(b: BuildingMesh | null, night: boolean): void;
  /** trees of the right kinds, dressed for the real season at this latitude */ setTrees(t: TreePt[], lat: number): void;
  /** lamps, parked cars, the clutter on the roofs */ setStreet(s: StreetThings | null, roofs: BuildingMesh['roofBits'] | null): void;
  /** what the ground is, metre by metre (for the grass that grows round your feet) */ setOccupancy(fn: ((x: number, z: number) => number) | null): void;
  /** the sharpest ground, right round you (kerbs, road markings, zebra crossings) */ setClose(c: { canvas: HTMLCanvasElement; region: { x0: number; z0: number; size: number } } | null): void;
  setTerrain(t: Terrain | null, colors: { land: string; water: string; rock: string; snow: string; wood: string; neon: boolean }): void;
  setPlots(p: PlotPlace[]): void;
  setArt(gx: number, gy: number, img: ImageBitmap | HTMLCanvasElement | null): void;
  setMine(cards: { gx: number; gy: number; card: HTMLCanvasElement }[]): void;
  setLeviathan(l: LevPlace | null): void;
  setBeacons(b: Beacon[]): void;
  setFallingStars(s: FallingStar[]): void;
  setDrops(d: SkyDrop[]): void;
  setBuddies(b: Buddy[]): void;
  setHotZone(h: HotDome | null): void;
  /** freeze the sky at a moment (tests, or a time-travel toy); null = now */ setClock(ms: number | null): void;
  /** look somewhere: compass bearing and pitch (radians) */ lookAt(yaw: number, pitch: number): void;
  look(): { yaw: number; pitch: number; fov: number };
  setGyro(on: boolean): void;
  /** your explorer's skin, outfit and tool (the hands and body you see) */ setBodyLook(l: BodyLook): void;
  /** what's underfoot where you stand */ surface(): Surface;
  sound(): ReturnType<typeof createEyesSound>;
  /** throw an ink bomb at the Leviathan (lands in ~0.6 s) */ throwAtLev(onLand?: () => void): boolean;
  /** pop / catch effects */ burstAtDrop(id: string): void;
  burstAtStar(id: number): void;
  damage(text: string): void;
  /** a line of text floating up from a caught treasure or star */ floatAt(t: { drop: string } | { star: number }, text: string): void;
  sky(): { day: number; sunAlt: number; moonPhase: number; moonFrac: number; sunAz: number; moonAlt: number; moonAz: number };
  /** the sky's clock (ms): now, unless it's been frozen */ now(): number;
  snapshot(): Promise<Blob | null>;
  /** where something is on screen (CSS px), or null when it's behind you or not there (tests, hints) */
  screenOf(t: { lev: true } | { drop: string } | { star: number } | { cell: [number, number] } | { beacon: string }): { x: number; y: number } | null;
  debug(): Record<string, unknown>;
  /** (tests) the sharpest ground's own painting */ closeCanvas(): HTMLCanvasElement | null;
  /** (tests) hide or show one layer of the view */ debugShow(layer: string, on: boolean): void;
  dispose(): void;
};

const SKY_R = 110_000;
const NEAR_FAR = 4200;
const NEAR_LIMIT = 2400; // nearer than this, the Leviathan and beacons stand in the near pass
const FOG = 1.6e-5;
const LEV_H = 260; // the Leviathan is about this tall (m), and it never looks smaller than ~9° from afar
const RAD = Math.PI / 180;

const NOISE = /* glsl */ `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

export function createEyes(o: EyesOpts): Eyes {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance', alpha: false });
  let dpr = sceneDpr();
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };

  const far = new THREE.Scene();
  const near = new THREE.Scene();
  const farCam = new THREE.PerspectiveCamera(62, 1, 30, 240_000);
  const cam = new THREE.PerspectiveCamera(62, 1, 0.25, NEAR_FAR);
  const fog = new THREE.FogExp2('#9cc4e8', FOG);
  far.fog = fog;
  near.fog = fog;

  // ---- lights (one set per pass) ------------------------------------------------------------------------------------
  const mkLights = (s: THREE.Scene) => {
    const hemi = new THREE.HemisphereLight('#bcd8ff', '#3a3550', 0.8);
    const dir = new THREE.DirectionalLight('#fff2dc', 1.6);
    s.add(hemi, dir, dir.target);
    return { hemi, dir };
  };
  const lightsFar = mkLights(far), lightsNear = mkLights(near);
  // real shadows round you: the buildings, trees, lamps and cars cast them on the street and on each other. The shadow
  // map is only redrawn when it has to be (you walked off its middle, the sun moved, the street was rebuilt).
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const SH = phone ? 70 : 95;
  {
    const d = lightsNear.dir;
    d.castShadow = true;
    d.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
    Object.assign(d.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 1400 });
    d.shadow.camera.updateProjectionMatrix();
    d.shadow.bias = -0.0006;
    d.shadow.normalBias = 0.04;
  }
  let shadowDirty = true, lastShadow = 0;
  const shadowAt = new THREE.Vector2(1e9, 1e9), shadowSun = new THREE.Vector3(), sunLight = new THREE.Vector3(0, 1, 0);
  const sound = createEyesSound();
  let steps = 0;
  const body = createBody(near, (kind, strong) => { steps++; sound.step(kind, strong, surfaceAt(pos.x, pos.z)); });
  // what's underfoot: read from the street's own painting (green: grass, blue: water)
  let groundRead: { g: CanvasRenderingContext2D; x0: number; z0: number; size: number; px: number } | null = null;
  const surfaceAt = (x: number, z: number): Surface => {
    if (!groundRead) return 'hard';
    const u = Math.floor(((x - groundRead.x0) / groundRead.size) * groundRead.px), v = Math.floor(((z - groundRead.z0) / groundRead.size) * groundRead.px);
    if (u < 0 || v < 0 || u >= groundRead.px || v >= groundRead.px) return 'hard';
    try {
      const d = groundRead.g.getImageData(u, v, 1, 1).data;
      if (d[2] > d[0] + 25 && d[2] > d[1] - 10) return 'water';
      if (d[1] > d[0] + 12 && d[1] > d[2] + 4) return 'grass';
    } catch { /* tainted: assume pavement */ }
    return 'hard';
  };

  // ---- the sky dome -------------------------------------------------------------------------------------------------
  const skyU = {
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: 1 }, uDusk: { value: 0 }, uTime: { value: 0 }, uCloud: { value: 0.38 },
    uNeon: { value: 0 }, uMoonGlow: { value: 0 }, uMoon: { value: new THREE.Vector3(0, -1, 0) },
    // the Milky Way's glow: the galactic pole and centre in this sky
    uNGP: { value: new THREE.Vector3(0, 1, 0) }, uGC: { value: new THREE.Vector3(1, 0, 0) }, uStars: { value: 0 },
  };
  const skyMat = T(new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uMoon; uniform vec3 uNGP; uniform vec3 uGC; uniform float uDay, uDusk, uTime, uCloud, uNeon, uMoonGlow, uStars; varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 v = normalize(vDir); float h = v.y;
        vec3 zen = mix(mix(vec3(0.004, 0.006, 0.025), vec3(0.012, 0.006, 0.04), uNeon), vec3(0.08, 0.26, 0.66), uDay);
        vec3 hor = mix(mix(vec3(0.02, 0.022, 0.06), vec3(0.06, 0.025, 0.11), uNeon), vec3(0.55, 0.72, 0.92), uDay);
        float up = max(h, 0.0);
        vec3 col = mix(hor, zen, pow(up, 0.55));
        float sd = max(dot(v, uSun), 0.0);
        float low = pow(1.0 - up, 5.0);
        col += vec3(1.0, 0.42, 0.18) * uDusk * low * (0.3 + 0.9 * pow(sd, 4.0));
        col += vec3(0.9, 0.3, 0.45) * uDusk * low * 0.25;
        // the sun, its halo and the moon's glow
        float sunUp = smoothstep(-0.06, 0.02, uSun.y);
        col += vec3(1.0, 0.92, 0.78) * (smoothstep(0.99985, 0.99992, sd) * 30.0 + pow(sd, 900.0) * 3.0 + pow(sd, 16.0) * 0.22 * (0.3 + uDay)) * sunUp;
        // the Milky Way: a soft band along the galactic plane, brightest toward its centre, with dark lanes
        if (uStars > 0.01 && h > -0.02) {
          float sb = dot(v, uNGP), cl = dot(v, uGC);
          float band = exp(-sb * sb / 0.022) * (0.35 + 0.65 * pow(max(cl, 0.0), 1.6));
          vec2 q = vec2(atan(dot(v, cross(uNGP, uGC)), cl) * 3.0, sb * 9.0);
          band *= 0.55 + 0.75 * fbm(q * 1.3) - 0.35 * smoothstep(0.55, 0.8, fbm(q * 2.7 + 9.0)) * exp(-sb * sb / 0.004);
          col += vec3(0.62, 0.66, 0.95) * band * 0.12 * uStars * smoothstep(-0.02, 0.15, h);
        }
        float md = max(dot(v, uMoon), 0.0);
        col += vec3(0.6, 0.68, 0.9) * pow(md, 60.0) * uMoonGlow * 0.25;
        // clouds on a sheet high overhead, drifting
        if (h > 0.015) {
          vec2 p = v.xz / (h + 0.06) * 0.55 + uTime * vec2(0.0035, 0.0015);
          float n = fbm(p * 1.6);
          float c = smoothstep(1.0 - uCloud * 0.95, 1.25 - uCloud * 0.6, n) * smoothstep(0.015, 0.16, h);
          vec3 lit = mix(vec3(0.05, 0.055, 0.09), vec3(0.97, 0.98, 1.0), uDay);
          lit = mix(lit, vec3(1.0, 0.62, 0.45), uDusk * 0.7);
          lit += vec3(0.08, 0.09, 0.13) * uMoonGlow * (1.0 - uDay);
          vec3 shade = lit * mix(0.78, 1.0, smoothstep(0.4, 0.9, fbm(p * 3.1 + 4.0)));
          col = mix(col, shade, c * 0.92);
        }
        // below the horizon: the haze the land sinks into
        if (h < 0.0) col = mix(hor, hor * 0.7, min(-h * 6.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const skyDome = new THREE.Mesh(T(new THREE.SphereGeometry(SKY_R, 40, 20)), skyMat);
  skyDome.renderOrder = -10;
  skyDome.frustumCulled = false;
  far.add(skyDome);

  // ---- the stars, the planets and the Milky Way (in the equatorial frame; the sky matrix turns them) ------------------
  const starGroup = new THREE.Group();
  starGroup.matrixAutoUpdate = false;
  far.add(starGroup);
  const starU = { uNight: { value: 0 }, uTime: { value: 0 }, uPx: { value: dpr } };
  const starMat = T(new THREE.ShaderMaterial({
    uniforms: starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `attribute float aSize; attribute vec3 aColor; uniform float uNight, uTime, uPx; varying vec3 vColor; varying float vA;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vec3 d = normalize(wp.xyz - cameraPosition);
        float up = smoothstep(-0.005, 0.07, d.y); float tw = 0.82 + 0.18 * sin(uTime * 2.7 + position.x * 0.0013 + position.z * 0.0021);
        vA = up * uNight * tw; vColor = aColor; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99985; gl_PointSize = aSize * uPx; }`,
    fragmentShader: /* glsl */ `varying vec3 vColor; varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vColor * a * vA, 1.0);
      #include <colorspace_fragment>
    }`,
  }));
  const starPts: number[] = [], starSize: number[] = [], starCol: number[] = [];
  const addStar = (v: [number, number, number], size: number, c: [number, number, number], k = 1) => {
    starPts.push(v[0] * SKY_R * 0.92, v[1] * SKY_R * 0.92, v[2] * SKY_R * 0.92);
    starSize.push(size);
    starCol.push(c[0] * k, c[1] * k, c[2] * k);
  };
  const magSize = (m: number) => Math.max(1.2, Math.min(9, 6 - m * 1.0));
  const magK = (m: number) => Math.max(0.18, Math.min(1.8, 1.35 - m * 0.2));
  for (const s of NAMED_STARS) addStar(equatorial(s.ra, s.dec), magSize(s.mag), hex(s.color), magK(s.mag));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < (phone ? 1500 : 2800); i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    const mag = 3 + rnd() * rnd() * 3.2;
    const tint = rnd();
    addStar([r * Math.cos(a), r * Math.sin(a), z], magSize(mag), tint < 0.15 ? hex('#FFD9B0') : tint < 0.35 ? hex('#D6E4FF') : [1, 1, 1], magK(mag) * 0.9);
  }
  // the Milky Way: a haze of faint stars along the galactic plane, thickest toward the centre
  for (let i = 0; i < (phone ? 2400 : 4600); i++) {
    const l = rnd() * Math.PI * 2;
    const core = Math.cos(l / 2) ** 2;
    const b = ((rnd() + rnd() + rnd() - 1.5) * 0.17) * (0.6 + core * 0.8);
    addStar(galactic(l, b), 1.1 + rnd() * 1.3, hex(rnd() < 0.5 ? '#C9D6FF' : '#FFF0DD'), 0.16 + core * 0.22 + rnd() * 0.1);
  }
  const planetBase = starPts.length / 3;
  for (let i = 0; i < 5; i++) addStar([0, 0, -1], 1, [0, 0, 0]);
  const starGeo = T(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
  starGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(starSize, 1));
  starGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  starGroup.add(stars);
  // the famous shapes, faintly
  const byName = new Map(NAMED_STARS.map((s) => [s.name, s]));
  const linePts: number[] = [];
  for (const c of CONSTELLATIONS) for (const [a, b] of c.lines) {
    const A = byName.get(a), B = byName.get(b);
    if (!A || !B) continue;
    for (const s of [A, B]) { const v = equatorial(s.ra, s.dec); linePts.push(v[0] * SKY_R * 0.9, v[1] * SKY_R * 0.9, v[2] * SKY_R * 0.9); }
  }
  const lineMat = T(new THREE.LineBasicMaterial({ color: '#9FB4FF', transparent: true, opacity: 0, depthWrite: false, fog: false }));
  const lineGeo = T(new THREE.BufferGeometry());
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  starGroup.add(lines);
  let planetList: { name: string; ra: number; dec: number; mag: number; color: string }[] = [];

  // ---- the moon: a sphere lit by the real sun, so its phase and the tilt of its crescent are right ------------------
  const moonU = { uSun: { value: new THREE.Vector3() }, uNight: { value: 0 } };
  const moonMat = T(new THREE.ShaderMaterial({
    uniforms: moonU, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; void main() { vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uNight; varying vec3 vN; varying vec3 vP;
      ${NOISE}
      void main() { float l = dot(normalize(vN), normalize(uSun)); float lit = smoothstep(-0.04, 0.12, l);
        float n = fbm(vP.xy * 2.2 + vP.z * 1.3); vec3 surf = mix(vec3(0.62, 0.62, 0.66), vec3(0.95, 0.95, 0.92), smoothstep(0.3, 0.75, n));
        vec3 c = surf * (0.04 + 1.25 * lit); float a = max(lit, uNight * 0.92);
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  }));
  const moon = new THREE.Mesh(T(new THREE.SphereGeometry(1, 32, 16)), moonMat);
  moon.renderOrder = -5;
  far.add(moon);
  const sunGlow = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFE6B8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  sunGlow.renderOrder = -4;
  far.add(sunGlow);

  // ---- the land out to the horizon ----------------------------------------------------------------------------------
  const farRect = { value: new THREE.Vector4(0, 0, 1, 0) };
  const terrU = {
    uFar: { value: null as THREE.Texture | null }, uFarRect: farRect, uGlow: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.4, 0.4, 0.45) },
    fogColor: { value: fog.color }, fogDensity: { value: FOG },
  };
  const terrMat = T(new THREE.ShaderMaterial({
    uniforms: terrU, vertexColors: true,
    vertexShader: /* glsl */ `varying vec3 vPos; varying vec3 vN; varying vec3 vCol; varying float vDist;
      void main() { vPos = position; vN = normal; vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform sampler2D uFar; uniform vec4 uFarRect; uniform float uGlow; uniform vec3 uSunDir, uSunCol, uAmb, fogColor; uniform float fogDensity;
      varying vec3 vPos; varying vec3 vN; varying vec3 vCol; varying float vDist;
      void main() { vec3 c = vCol; vec3 glow = vec3(0.0);
        if (uFarRect.w > 0.5) { vec2 uv = (vPos.xz - uFarRect.xy) / uFarRect.z;
          if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) { vec3 t = texture2D(uFar, uv).rgb; vec2 e = min(uv, 1.0 - uv); float w = smoothstep(0.0, 0.08, min(e.x, e.y)); c = mix(c, t, w); glow = t * w * uGlow; } }
        vec3 n = normalize(vN); vec3 col = c * (uAmb + uSunCol * max(dot(n, uSunDir), 0.0)) + glow;
        float f = 1.0 - exp(-pow(fogDensity * vDist, 2.0)); col = mix(col, fogColor, f);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  let terrain: THREE.Mesh | null = null;

  // ---- the street at your feet ------------------------------------------------------------------------------------
  const fadeTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    r.addColorStop(0, '#fff'); r.addColorStop(0.75, '#fff'); r.addColorStop(1, '#000');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    return T(new THREE.CanvasTexture(c));
  })();
  const groundMat = T(new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, alphaMap: fadeTex, emissive: '#ffffff', emissiveIntensity: 0 }));
  // the sharpest ground (right round you), and water that moves and mirrors the sky
  const groundU = {
    uClose: { value: null as THREE.Texture | null }, uCloseRect: { value: new THREE.Vector4(0, 0, 1, 0) },
    uWater: { value: new THREE.Color('#33607a') }, uSkyCol: { value: new THREE.Color('#9cc4e8') }, uSunDirV: { value: new THREE.Vector3(0, 1, 0) },
    uTime: { value: 0 }, uDayG: { value: 1 },
  };
  groundMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGw = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vGw;
      uniform sampler2D uClose; uniform vec4 uCloseRect; uniform vec3 uWater, uSkyCol, uSunDirV; uniform float uTime, uDayG;
      ${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (uCloseRect.w > 0.5) {
          vec2 cuv = (vGw - uCloseRect.xy) / uCloseRect.z;
          if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) {
            vec2 e = min(cuv, 1.0 - cuv); float w = smoothstep(0.0, 0.12, min(e.x, e.y));
            diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uClose, cuv).rgb, w);
          }
        }
        float isWater = 1.0 - smoothstep(0.035, 0.09, distance(diffuseColor.rgb, uWater));
        diffuseColor.rgb *= 0.9 + 0.14 * vnoise(vGw * 1.7) + 0.06 * vnoise(vGw * 0.23) + 0.05 * (vnoise(vGw * 9.0) - 0.5) * (1.0 - isWater);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (isWater > 0.01) {
          // ripples: two drifting noise layers tilt the surface; the sky and the sun glint off it
          vec2 q = vGw * 0.35 + vec2(uTime * 0.06, uTime * 0.045);
          vec2 q2 = vGw * 0.9 - vec2(uTime * 0.11, -uTime * 0.07);
          float hx = vnoise(q + vec2(0.1, 0.0)) - vnoise(q - vec2(0.1, 0.0)) + 0.5 * (vnoise(q2 + vec2(0.1, 0.0)) - vnoise(q2 - vec2(0.1, 0.0)));
          float hz = vnoise(q + vec2(0.0, 0.1)) - vnoise(q - vec2(0.0, 0.1)) + 0.5 * (vnoise(q2 + vec2(0.0, 0.1)) - vnoise(q2 - vec2(0.0, 0.1)));
          vec3 wn = normalize(vec3(-hx * 0.9, 1.0, -hz * 0.9));
          vec3 wnV = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          vec3 vd = normalize(vViewPosition);
          float fres = 0.12 + 0.88 * pow(1.0 - max(dot(-vd, wnV), 0.0), 4.0);
          vec3 sunV = normalize((viewMatrix * vec4(uSunDirV, 0.0)).xyz);
          float glint = pow(max(dot(reflect(vd, wnV), sunV), 0.0), 180.0) * uDayG * 3.0;
          vec3 refl = uSkyCol * (0.55 + 0.45 * uDayG);
          totalEmissiveRadiance += (refl * fres * 0.9 + vec3(1.0, 0.95, 0.85) * glint) * isWater;
          diffuseColor.rgb *= 1.0 - 0.55 * fres * isWater;
        }`);
  };
  const ground = new THREE.Mesh(T(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), groundMat);
  ground.renderOrder = -2;
  ground.receiveShadow = true;
  ground.visible = false;
  near.add(ground);
  let nearTex: THREE.Texture | null = null, farTex: THREE.Texture | null = null;

  // ---- buildings: real facades --------------------------------------------------------------------------------------
  // Drawn on the graphics card from each wall's own measurements (metres along it, metres up it, the building's height
  // and its own random number): houses get framed windows with sills, mid-rises ribbon windows, towers glass curtain
  // walls with mullions and floor slabs; most buildings over two storeys have shops at street level (big windows, a
  // door here and there, a coloured awning or sign band). Glass mirrors the sky by day; at night windows and shops
  // light up. Pitched roofs show their rows of tiles. Detail fades to the average colour when it gets too small to see.
  const bldU = { uNight: { value: 0 }, uLit: { value: 0.38 }, uGlass: { value: new THREE.Color('#2a3946') }, uSkyCol: groundU.uSkyCol, uDayB: groundU.uDayG };
  const bldMat = T(new THREE.MeshLambertMaterial({ vertexColors: true }));
  bldMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, bldU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 wuv; varying vec4 vWuv; varying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWuv = wuv; vWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uNight; uniform float uLit; uniform vec3 uGlass; uniform vec3 uSkyCol; uniform float uDayB; varying vec4 vWuv; varying vec3 vWp;
      ${NOISE}
      float bayer4(vec2 p) { vec2 q = mod(floor(p), 4.0); int i = int(q.x) + int(q.y) * 4; float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i] + 0.5) / 16.0; }
      float rnd1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 awning(float r) { return r < 0.17 ? vec3(0.42, 0.05, 0.05) : r < 0.34 ? vec3(0.06, 0.22, 0.12) : r < 0.5 ? vec3(0.05, 0.08, 0.22) : r < 0.67 ? vec3(0.3, 0.03, 0.08) : r < 0.84 ? vec3(0.55, 0.22, 0.03) : vec3(0.03, 0.03, 0.035); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // walls right beside you dissolve, so you can see past the building you're standing against
        float dcam = length(vViewPosition);
        if (dcam < 13.0 && bayer4(gl_FragCoord.xy) > smoothstep(3.5, 13.0, dcam)) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float H = vWuv.z, seed = vWuv.w, wx = vWuv.x, wy = vWuv.y;
        vec3 wall = diffuseColor.rgb;
        vec3 vd = normalize(vViewPosition);
        float fres = 0.18 + 0.82 * pow(1.0 - abs(dot(vd, normal)), 3.0);
        if (wx >= 0.0) {
          // weathering, and a darker foot where the wall meets the ground
          wall *= 0.92 + 0.12 * vnoise(vec2(wx * 0.35, wy * 0.6) + seed * 40.0);
          float style = H > 40.0 ? (seed < 0.65 ? 2.0 : 1.0) : (H > 15.0 && seed > 0.7 ? 1.0 : 0.0);
          float shop = (H >= 9.0 && seed < 0.82) ? 4.3 : 0.0;
          float fh = style > 1.5 ? 3.8 : 3.0 + fract(seed * 7.0) * 0.45;
          float bay = style > 1.5 ? 1.5 : 2.5 + fract(seed * 13.0) * 1.3;
          vec2 cell = vec2(wx / bay, (wy - shop) / fh); vec2 fc = fract(cell); vec2 id = floor(cell);
          float px = max(fwidth(cell.x), fwidth(cell.y));
          float detail = 1.0 - smoothstep(0.18, 0.5, px);
          float win = 0.0, frame = 0.0;
          if (style < 0.5) {
            float ww = 0.4 + fract(seed * 3.1) * 0.2, wh = 0.48 + fract(seed * 5.7) * 0.16;
            vec2 lo = vec2(0.5 - ww * 0.5, 0.3), hi = vec2(0.5 + ww * 0.5, 0.3 + wh);
            win = step(lo.x, fc.x) * step(fc.x, hi.x) * step(lo.y, fc.y) * step(fc.y, hi.y);
            float outer = step(lo.x - 0.03, fc.x) * step(fc.x, hi.x + 0.03) * step(lo.y - 0.07, fc.y) * step(fc.y, hi.y + 0.03);
            frame = outer - win;
            float bar = win * (1.0 - step(0.012, abs(fc.x - 0.5))) * step(0.5, ww) + win * (1.0 - step(0.015, abs(fc.y - (lo.y + wh * 0.62))));
            frame = min(1.0, frame + bar); win *= 1.0 - bar;
          } else if (style < 1.5) {
            win = step(0.28, fc.y) * step(fc.y, 0.86);
            float mull = step(0.955, fract(wx / 1.6));
            frame = win * mull; win *= 1.0 - mull;
          } else {
            float slab = step(fc.y, 0.11); float mull = step(0.955, fract(wx / 1.5));
            win = (1.0 - slab) * (1.0 - mull); frame = (1.0 - slab) * mull;
          }
          float body = step(shop + 0.5, wy) * step(wy, H - 0.8);
          win *= body; frame *= body;
          // floor lines and a cornice
          float band = (1.0 - step(0.035, fc.y)) * body * step(style, 1.5);
          float cornice = step(H - 0.7, wy);
          // the shops at street level
          float sf = step(wy, shop) * step(0.5, shop);
          float sx = fract(wx / 3.4); float sid = floor(wx / 3.4);
          float rs = rnd1(vec2(sid, seed * 91.0));
          float door = step(0.78, rs);
          float sglass = sf * step(0.07, sx) * step(sx, 0.93) * step(0.35, wy) * step(wy, 3.05) * (1.0 - door);
          float sdoor = sf * door * step(0.3, sx) * step(sx, 0.7) * step(wy, 2.4);
          float awn = sf * step(3.2, wy) * step(wy, 3.85);
          float ledge = step(shop, wy) * step(wy, shop + 0.3) * step(0.5, shop);
          // glass: dark, mirroring the sky by day (some panes curtained, each catching the light a little differently)
          float pr = rnd1(id + seed * 17.0);
          vec3 glass = uGlass * (0.75 + 0.5 * pr);
          float curtain = step(0.82, pr) * step(style, 0.5);
          glass = mix(glass, vec3(0.62, 0.55, 0.45), curtain * 0.7);
          vec3 frameC = style > 1.5 ? vec3(0.07, 0.08, 0.09) : style > 0.5 ? wall * 0.6 : mix(wall * 1.25, vec3(0.85), 0.5);
          vec3 c = wall;
          c = mix(c, wall * 0.8, band * 0.6);
          c = mix(c, wall * (style > 1.5 ? 0.5 : 0.82), cornice);
          c = mix(c, wall * 1.18, ledge);
          c = mix(c, frameC, frame);
          c = mix(c, glass * 0.55, win);
          c = mix(c, uGlass * 0.6, sglass);
          c = mix(c, vec3(0.06, 0.05, 0.045), sdoor);
          c = mix(c, awning(fract(seed * 23.0 + sid * 0.0)), awn);
          // fade the pattern out where it's too fine to draw
          float avgWin = style > 1.5 ? 0.75 : style > 0.5 ? 0.5 : 0.25;
          vec3 avg = mix(wall, glass * 0.55, avgWin * body);
          c = mix(avg, c, detail);
          diffuseColor.rgb = c * (0.6 + 0.4 * smoothstep(0.0, 2.4, wy));
          // the sky in the glass (by day)
          float g = (win + sglass) * detail + avgWin * body * (1.0 - detail);
          totalEmissiveRadiance += uSkyCol * fres * g * uDayB * 0.42;
          // night: lit windows (warm, a few cool), most shops lit
          float lit = step(1.0 - uLit, pr) * (1.0 - curtain * 0.5);
          vec3 wc = mix(vec3(1.0, 0.72, 0.4), vec3(0.62, 0.82, 1.0), step(0.74, fract(pr * 7.13)));
          totalEmissiveRadiance += wc * (win * lit * detail + avgWin * body * uLit * (1.0 - detail) * 0.8) * uNight * 1.35;
          totalEmissiveRadiance += vec3(1.0, 0.8, 0.55) * sglass * step(0.3, rs) * uNight * 1.6;
          totalEmissiveRadiance += awning(fract(seed * 23.0)) * awn * uNight * 1.2;
        } else if (wx < -2.5) {
          // a gable end: plain wall
          diffuseColor.rgb = wall * (0.92 + 0.12 * vnoise(vWp.xz * 0.4 + wy));
        } else if (wx < -1.5) {
          // a pitched roof: rows of tiles (or slates), weathered
          float rows = wy / 0.34; float rp = max(fwidth(rows), 0.001);
          float edge = smoothstep(0.0, 0.22, fract(rows));
          float d2 = 1.0 - smoothstep(0.3, 0.6, rp);
          float tile = rnd1(vec2(floor(rows), floor(vWp.x * 3.0 + vWp.z * 3.0 + floor(rows) * 0.5)));
          diffuseColor.rgb = wall * mix(0.86, (0.72 + 0.28 * edge) * (0.9 + 0.2 * tile), d2) * (0.9 + 0.15 * vnoise(vWp.xz * 0.6));
        } else {
          // a flat roof: tar and gravel, patched
          diffuseColor.rgb = wall * (0.82 + 0.22 * vnoise(vWp.xz * 0.9) + 0.08 * vnoise(vWp.xz * 7.0));
        }
        totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.08;`);
  };
  let buildings: THREE.Mesh | null = null;

  // ---- trees, grass, and what stands on the street ----------------------------------------------------------------
  const nature = createNature(near, { phone });
  const street = createStreet(near);

  // ---- plots ------------------------------------------------------------------------------------------------------------
  const plotsGroup = new THREE.Group();
  near.add(plotsGroup);
  const slabGeo = T(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5));
  const slabMat = T(new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#000000' }));
  slabMat.onBeforeCompile = (sh) => {
    // the slab glows its own colour a little (more at night)
    sh.uniforms.uGlow = auraU.uGlow;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * (0.12 + uGlow * 0.55);');
  };
  const auraU = { uTime: { value: 0 }, uGlow: { value: 0.5 } };
  const auraMat = T(new THREE.ShaderMaterial({
    uniforms: auraU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vC; void main() { vUv = uv; vC = vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
      #endif
      mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
      #endif
      gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime, uGlow; varying vec2 vUv; varying vec3 vC;
      void main() { float a = pow(1.0 - vUv.y, 2.0) * (0.22 + uGlow * 0.4); a *= 0.8 + 0.2 * sin(vUv.y * 18.0 - uTime * 2.2 + vUv.x * 3.0);
        gl_FragColor = vec4(vC, min(a, 1.0));
        #include <colorspace_fragment>
      }`,
  }));
  const edgeGeo = T(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
  const beamGeo = T(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0));
  const beamMat = T(new THREE.ShaderMaterial({
    uniforms: auraU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vC; void main() { vUv = uv; vC = vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
      #endif
      mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
      #endif
      gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime, uGlow; varying vec2 vUv; varying vec3 vC;
      void main() { float a = pow(1.0 - vUv.y, 1.3) * (0.18 + uGlow * 0.32); a *= 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 4.0);
        float edge = 1.0 - abs(vUv.x * 2.0 - 1.0); gl_FragColor = vec4(vC, min(1.0, a * (0.5 + 0.5 * edge)));
        #include <colorspace_fragment>
      }`,
  }));
  let slabs: THREE.InstancedMesh | null = null, edges: THREE.InstancedMesh | null = null, beams: THREE.InstancedMesh | null = null;
  const artPlanes = new Map<string, THREE.Mesh>();
  const artGeo = T(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0.5));
  const emojiSprites = new THREE.Group();
  plotsGroup.add(emojiSprites);
  const cardSprites = new THREE.Group();
  plotsGroup.add(cardSprites);
  let plots: PlotPlace[] = [];
  const sparkles = new THREE.Group();
  plotsGroup.add(sparkles);

  // ---- the plot grid at your feet, and the plot you're looking at -----------------------------------------------------
  const gridU = { uPs: { value: 8 }, uAim: { value: new THREE.Vector2(1e6, 1e6) }, uHere: { value: new THREE.Vector2(1e6, 1e6) }, uDay: { value: 1 }, uCam: { value: new THREE.Vector2() } };
  const gridMat = T(new THREE.ShaderMaterial({
    uniforms: gridU, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec2 vL; void main() { vL = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uPs, uDay; uniform vec2 uAim, uHere, uCam; varying vec2 vL;
      void main() { vec2 u = vL / uPs; vec2 f = fract(u); vec2 id = floor(u);
        float w = 0.035; float line = max(step(f.x, w) + step(1.0 - w, f.x), step(f.y, w) + step(1.0 - w, f.y));
        float d = length(vL - uCam); float fade = 1.0 - smoothstep(14.0, 52.0, d);
        float aim = (id == uAim) ? 1.0 : 0.0; float here = (id == uHere) ? 1.0 : 0.0;
        vec3 c = mix(vec3(1.0), vec3(0.55, 0.45, 1.0), uDay * 0.6);
        float a = line * 0.32 * fade + aim * (0.22 + line * 0.6) + here * 0.12;
        vec3 col = mix(c, vec3(0.13, 0.89, 1.0), max(aim, here));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  }));
  const grid = new THREE.Mesh(T(new THREE.PlaneGeometry(130, 130).rotateX(-Math.PI / 2)), gridMat);
  grid.position.y = 0.03;
  grid.renderOrder = 1;
  near.add(grid);

  // ---- the Leviathan ------------------------------------------------------------------------------------------------
  const lev = createLeviathan();
  own.push(lev);
  lev.group.visible = false;
  let levPlace: LevPlace | null = null;
  let levDist = Infinity;

  // ---- beacons, the Hot Zone, falling stars, sky treasures, your party --------------------------------------------------
  const beaconsFar = new THREE.Group(), beaconsNear = new THREE.Group();
  far.add(beaconsFar);
  near.add(beaconsNear);
  const beaconMat = (color: string) => (new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) }, uTime: auraU.uTime, uDay: skyU.uDay }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uC; uniform float uTime, uDay; varying vec2 vUv;
      void main() { float a = pow(1.0 - vUv.y, 0.6) * (0.85 - uDay * 0.3); a *= 0.8 + 0.2 * sin(vUv.y * 30.0 - uTime * 3.0); float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
        gl_FragColor = vec4(uC, min(1.0, a * (0.35 + 0.65 * edge)));
        #include <colorspace_fragment>
      }`,
  }));
  let beacons: { b: Beacon; obj: THREE.Group; dist: number; bearing: number }[] = [];
  const hotGroup = new THREE.Group();
  const domeGeo = T(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2));
  far.add(hotGroup);
  let hot: HotDome | null = null;
  const fallingGroup = new THREE.Group();
  near.add(fallingGroup);
  let falling: { s: FallingStar; obj: THREE.Sprite; base: THREE.Vector3 }[] = [];
  const dropGroup = new THREE.Group();
  near.add(dropGroup);
  let drops: { d: SkyDrop; obj: THREE.Object3D; pos: THREE.Vector3; visible: boolean; anchor: THREE.Vector3; born: number }[] = [];
  const lastDrop = new Map<string, THREE.Vector3>(); // where caught ones were (for the reward floating up)
  const buddyGroup = new THREE.Group();
  const capsuleGeo = T(new THREE.CapsuleGeometry(0.32, 0.9, 4, 10)), headGeo = T(new THREE.SphereGeometry(0.28, 14, 10));
  near.add(buddyGroup);
  let buddies: { b: Buddy; obj: THREE.Group }[] = [];

  // ---- effects: bursts, thrown ink, damage numbers -----------------------------------------------------------------
  const MAXP = 700;
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP), pSize = new Float32Array(MAXP);
  const pGeo = T(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  const pMat = T(new THREE.ShaderMaterial({
    uniforms: { uPx: starU.uPx }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `attribute vec3 aColor; attribute float aSize; uniform float uPx; varying vec3 vC; void main() { vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPx * 300.0 / max(1.0, -mv.z); }`,
    fragmentShader: /* glsl */ `varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * smoothstep(0.5, 0.0, d), 1.0);
      #include <colorspace_fragment>
    }`,
  }));
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  near.add(particles);
  let pNext = 0, pAlive = 0;
  const burst = (at: THREE.Vector3, colors: string[], n: number, speed: number, size = 1) => {
    const cs = colors.map(hex);
    for (let i = 0; i < n; i++) {
      const k = pNext;
      pNext = (pNext + 1) % MAXP;
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      pPos.set([at.x, at.y, at.z], k * 3);
      pVel.set([v.x, v.y, v.z], k * 3);
      const c = cs[i % cs.length];
      pCol.set(c, k * 3);
      pLife[k] = 1;
      pSize[k] = size * (0.6 + Math.random() * 0.8);
    }
    pAlive = MAXP;
  };
  const inkBall = new THREE.Mesh(T(new THREE.SphereGeometry(1, 12, 8)), T(new THREE.MeshBasicMaterial({ color: '#B026FF' })));
  const throws: { mesh: THREE.Mesh; t: number; from: THREE.Vector3; to: THREE.Vector3; mid: THREE.Vector3; done?: () => void }[] = [];
  const floaters: { el: HTMLDivElement; t: number; at: THREE.Vector3 }[] = [];

  // ---- the camera: where you stand and where you look -----------------------------------------------------------------
  let frame: Frame | null = null;
  let yaw = 0, pitch = 0.05, fov = 70, vyaw = 0, vpitch = 0;
  // how you move (for the walk, the sounds and the feel of speed)
  let speed = 0, turn = 0, lastYaw = 0, fovKick = 0, shake = 0, nextRoar = 0, lastDrive = 0;
  const lastPos = new THREE.Vector3(NaN, 0, 0);
  const pos = new THREE.Vector3(0, 1.7, 0);
  let gyro = false, gyroQ: THREE.Quaternion | null = null, gyroYaw = 0;
  const qTmp = new THREE.Quaternion(), eTmp = new THREE.Euler(0, 0, 0, 'YXZ');
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const zee = new THREE.Vector3(0, 0, 1);
  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const orient = ((screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number) * RAD;
    eTmp.set(e.beta * RAD, e.alpha * RAD, -e.gamma * RAD, 'YXZ');
    const q = new THREE.Quaternion().setFromEuler(eTmp).multiply(q1).multiply(new THREE.Quaternion().setFromAxisAngle(zee, -orient));
    if (!gyroQ) {
      // keep looking the way you were: the phone's "forward" now is the camera's current bearing
      gyroQ = q;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      gyroYaw = yaw - Math.atan2(f.x, -f.z);
    }
    gyroQ.copy(q);
  };
  const applyCamera = () => {
    if (gyro && gyroQ) {
      qTmp.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -gyroYaw).multiply(gyroQ);
      cam.quaternion.copy(qTmp);
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(qTmp);
      yaw = Math.atan2(f.x, -f.z);
      pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    } else {
      eTmp.set(pitch, -yaw, 0, 'YXZ');
      cam.quaternion.setFromEuler(eTmp);
    }
    // the head: the walk's bob and sway, a little shake when something huge walks nearby
    const b = body.bob();
    const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    cam.position.y += b.y + (Math.random() - 0.5) * shake * 0.12;
    cam.position.addScaledVector(right, b.x + (Math.random() - 0.5) * shake * 0.08);
    // look down and your head leans out over your body, so you see your chest, your legs and your shoes below
    const vNow = o.vehicle?.() ?? 'walk';
    const lean = Math.max(0, Math.min(1, (-pitch - 0.45) / 0.8)) * (vNow === 'walk' ? 0.2 : vNow === 'bike' ? 0.12 : 0);
    if (lean) cam.position.add(new THREE.Vector3(Math.sin(yaw) * lean, -lean * 0.3, -Math.cos(yaw) * lean));
    cam.rotateZ(b.roll);
    cam.fov = fov + fovKick;
    farCam.fov = cam.fov;
    farCam.position.copy(cam.position);
    farCam.quaternion.copy(cam.quaternion);
  };

  // ---- the world ------------------------------------------------------------------------------------------------------
  const setFrame = (f: Frame) => {
    const moved = !!frame && (frame.lng0 !== f.lng0 || frame.lat0 !== f.lat0);
    frame = f;
    gridU.uPs.value = plotSize(f);
    // a new place: what was built around the old one would stand in the wrong spot until the new one arrives
    if (moved) {
      setGround(null, null); setClose(null); setBuildings(null, false); nature.setTrees([], 0); nature.setGround(null); street.set(null, null); setPlots([]);
      for (const [k, mesh] of artPlanes) { plotsGroup.remove(mesh); (mesh.material as THREE.MeshLambertMaterial).map?.dispose(); (mesh.material as THREE.Material).dispose(); artPlanes.delete(k); }
      setMine([]); setFallingStars([]);
    }
  };

  const setGround: Eyes['setGround'] = (n, fr) => {
    nearTex?.dispose(); nearTex = null;
    groundRead = n ? { g: n.canvas.getContext('2d', { willReadFrequently: true })!, x0: n.region.x0, z0: n.region.z0, size: n.region.size, px: n.canvas.width } : null;
    if (n) {
      nearTex = new THREE.CanvasTexture(n.canvas);
      nearTex.colorSpace = THREE.SRGBColorSpace;
      nearTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      groundMat.map = nearTex;
      groundMat.emissiveMap = nearTex;
      groundMat.emissiveIntensity = n.glow;
      groundMat.needsUpdate = true;
      ground.scale.set(n.region.size, 1, n.region.size);
      ground.position.set(n.region.x0 + n.region.size / 2, 0, n.region.z0 + n.region.size / 2);
      ground.visible = true;
    } else ground.visible = false;
    farTex?.dispose(); farTex = null;
    if (fr) {
      farTex = new THREE.CanvasTexture(fr.canvas);
      farTex.colorSpace = THREE.SRGBColorSpace;
      farTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      terrU.uFar.value = farTex;
      farRect.value.set(fr.region.x0, fr.region.z0, fr.region.size, 1);
      terrU.uGlow.value = fr.glow;
    } else farRect.value.w = 0;
  };

  let closeTex: THREE.Texture | null = null, closeCanvas: HTMLCanvasElement | null = null;
  let closeAt: THREE.Vector2 | null = null, closeAsked = 0;
  const setClose: Eyes['setClose'] = (c) => {
    closeTex?.dispose(); closeTex = null;
    if (!c) { groundU.uCloseRect.value.w = 0; closeAt = null; return; }
    closeCanvas = c.canvas;
    closeTex = new THREE.CanvasTexture(c.canvas);
    closeTex.colorSpace = THREE.SRGBColorSpace;
    closeTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    groundU.uClose.value = closeTex;
    groundU.uCloseRect.value.set(c.region.x0, c.region.z0, c.region.size, 1);
    closeAt = new THREE.Vector2(c.region.x0 + c.region.size / 2, c.region.z0 + c.region.size / 2);
  };

  const setBuildings = (b: BuildingMesh | null, night: boolean) => {
    if (buildings) { near.remove(buildings); buildings.geometry.dispose(); buildings = null; }
    bldU.uLit.value = night ? 0.42 : 0.3;
    if (!b || !b.index.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(b.color, 3));
    g.setAttribute('wuv', new THREE.BufferAttribute(b.wuv, 4));
    g.setIndex(new THREE.BufferAttribute(b.index, 1));
    g.computeBoundingSphere();
    buildings = new THREE.Mesh(g, bldMat);
    buildings.castShadow = buildings.receiveShadow = true;
    near.add(buildings);
    shadowDirty = true;
  };

  const setTrees = (list: TreePt[], lat: number) => { nature.setTrees(list, lat, new Date(clock ?? Date.now())); shadowDirty = true; };
  const setStreet: Eyes['setStreet'] = (st, roofs) => { street.set(st, roofs); shadowDirty = true; };
  const setOccupancy: Eyes['setOccupancy'] = (fn) => nature.setGround(fn);

  const setTerrain: Eyes['setTerrain'] = (t, cl) => {
    if (terrain) { far.remove(terrain); terrain.geometry.dispose(); terrain = null; }
    const n = t?.n ?? 64, E = t?.extent ?? 90_000;
    const g = new THREE.PlaneGeometry(E * 2, E * 2, n - 1, n - 1).rotateX(-Math.PI / 2);
    const P = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      P.setY(i, t ? t.y[i] : -curveDrop(Math.hypot(x, z)));
    }
    g.computeVertexNormals();
    const N = g.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(P.count * 3);
    const land = hex(cl.land), water = hex(cl.water), rock = hex(cl.rock), snow = hex(cl.snow), wood = hex(cl.wood);
    const lat = Math.abs(frame?.lat0 ?? 40);
    const snowLine = Math.max(600, 4900 - 58 * lat);
    for (let i = 0; i < P.count; i++) {
      const h = t ? t.abs[i] : 30;
      const ny = N.getY(i);
      let c: number[];
      if (h <= 0.3) c = water;
      else {
        const hi = Math.min(1, Math.max(0, (h - 300) / 2200));
        c = [wood[0] + (land[0] - wood[0]) * hi, wood[1] + (land[1] - wood[1]) * hi, wood[2] + (land[2] - wood[2]) * hi];
        const steep = 1 - Math.min(1, Math.max(0, (ny - 0.72) / 0.2));
        c = c.map((v, k) => v + (rock[k] - v) * steep * 0.85);
        const sn = Math.min(1, Math.max(0, (h - snowLine) / 350)) * (0.4 + 0.6 * Math.min(1, ny * 1.3));
        c = c.map((v, k) => v + (snow[k] - v) * sn);
      }
      if (cl.neon) c = c.map((v, k) => v * (k === 2 ? 1.15 : 0.9));
      col.set(c, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    terrain = new THREE.Mesh(g, terrMat);
    terrain.renderOrder = -3;
    far.add(terrain);
  };

  const key = (gx: number, gy: number) => `${gx}_${gy}`;
  const auraHeight = (tier: number) => [0, 2.4, 4, 6.5, 9.5, 14, 24][Math.max(0, Math.min(6, tier))];
  const emojiTex = new Map<string, THREE.Texture>();
  const emojiTexture = (e: string) => {
    let t = emojiTex.get(e);
    if (!t) {
      const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
      const g = c.getContext('2d')!;
      g.font = '100px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(e, 64, 72);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      emojiTex.set(e, t);
    }
    return t;
  };
  const setPlots = (list: PlotPlace[]) => {
    if (!frame) return;
    plots = list;
    for (const m of [slabs, edges, beams]) if (m) { plotsGroup.remove(m); m.dispose(); }
    slabs = edges = beams = null;
    for (const s of [...emojiSprites.children]) { emojiSprites.remove(s); (s as THREE.Sprite).material.dispose(); }
    for (const s of [...sparkles.children]) { sparkles.remove(s); (s as THREE.Sprite).material.dispose(); }
    if (!list.length) return;
    const ps = plotSize(frame);
    const at = new Map(list.map((p) => [key(p.gx, p.gy), p]));
    slabs = new THREE.InstancedMesh(slabGeo, slabMat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
    type E = { x: number; z: number; rot: number; h: number; color: string };
    const edgeList: E[] = [];
    const beamList: { x: number; z: number; h: number; r: number; color: string }[] = [];
    list.forEach((p, i) => {
      const [x, z] = cellToLocal(frame!, p.gx, p.gy);
      const inset = ps * 0.04;
      m.compose(v.set(x + inset, 0, z + inset), q.identity(), s.set(ps - inset * 2, 0.16 + p.tier * 0.02, ps - inset * 2));
      slabs!.setMatrixAt(i, m);
      slabs!.setColorAt(i, c.set(p.color));
      const h = Math.max(auraHeight(p.tier), p.mine ? 1.4 : 0);
      if (h > 0) {
        const color = p.mine && p.tier === 0 ? '#FFFFFF' : p.color;
        // only the outside edges of a merged canvas (no walls inside it)
        const same = (dx: number, dy: number) => { const o2 = at.get(key(p.gx + dx, p.gy + dy)); return !!o2 && !!p.group && o2.group === p.group; };
        if (!same(0, -1)) edgeList.push({ x: x + ps / 2, z, rot: 0, h, color });
        if (!same(0, 1)) edgeList.push({ x: x + ps / 2, z: z + ps, rot: 0, h, color });
        if (!same(-1, 0)) edgeList.push({ x, z: z + ps / 2, rot: Math.PI / 2, h, color });
        if (!same(1, 0)) edgeList.push({ x: x + ps, z: z + ps / 2, rot: Math.PI / 2, h, color });
      }
      if (p.tier >= 5) beamList.push({ x: x + ps / 2, z: z + ps / 2, h: p.tier >= 6 ? 900 : 160, r: p.tier >= 6 ? ps * 0.4 : ps * 0.16, color: p.color });
      if (p.tier >= 5 && p.emoji) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(p.emoji), transparent: true, depthWrite: false }));
        sp.scale.setScalar(ps * 0.8);
        sp.position.set(x + ps / 2, h + ps * 0.6, z + ps / 2);
        sp.userData.bob = (p.gx * 0.37 + p.gy * 0.11) % 6;
        emojiSprites.add(sp);
      }
      if (p.shiny && sparkles.children.length < (phone ? 20 : 48)) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFF6C2', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.position.set(x + ps / 2, 1.2, z + ps / 2);
        sp.userData.phase = (p.gx * 1.7 + p.gy * 2.3) % 6.28;
        sp.userData.ps = ps;
        sparkles.add(sp);
      }
    });
    slabs.instanceMatrix.needsUpdate = true;
    if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
    slabs.computeBoundingSphere();
    plotsGroup.add(slabs);
    if (edgeList.length) {
      edges = new THREE.InstancedMesh(edgeGeo, auraMat, edgeList.length);
      edgeList.forEach((e, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.rot);
        m.compose(v.set(e.x, 0.16, e.z), q, s.set(ps, e.h, 1));
        edges!.setMatrixAt(i, m);
        edges!.setColorAt(i, c.set(e.color));
      });
      edges.computeBoundingSphere();
      plotsGroup.add(edges);
    }
    if (beamList.length) {
      beams = new THREE.InstancedMesh(beamGeo, beamMat, beamList.length);
      beamList.forEach((b, i) => {
        m.compose(v.set(b.x, 0.2, b.z), q.identity(), s.set(b.r, b.h, b.r));
        beams!.setMatrixAt(i, m);
        beams!.setColorAt(i, c.set(b.color));
      });
      beams.computeBoundingSphere();
      plotsGroup.add(beams);
    }
    // art that's no longer in range goes
    const keep = new Set(list.map((p) => key(p.gx, p.gy)));
    for (const [k, mesh] of artPlanes) if (!keep.has(k)) { plotsGroup.remove(mesh); (mesh.material as THREE.MeshLambertMaterial).map?.dispose(); (mesh.material as THREE.Material).dispose(); artPlanes.delete(k); }
  };
  const setArt = (gx: number, gy: number, img: ImageBitmap | HTMLCanvasElement | null) => {
    if (!frame) return;
    const k = key(gx, gy);
    const old = artPlanes.get(k);
    if (old) { plotsGroup.remove(old); (old.material as THREE.MeshLambertMaterial).map?.dispose(); (old.material as THREE.Material).dispose(); artPlanes.delete(k); }
    if (!img) return;
    const p = plots.find((x) => x.gx === gx && x.gy === gy);
    const tex = new THREE.Texture(img as TexImageSource);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.3 });
    const mesh = new THREE.Mesh(artGeo, mat);
    const ps = plotSize(frame);
    const [x, z] = cellToLocal(frame, gx, gy);
    const inset = ps * 0.04;
    mesh.scale.set(ps - inset * 2, 1, ps - inset * 2);
    mesh.position.set(x + inset, 0.17 + (p?.tier ?? 0) * 0.02 + 0.005, z + inset);
    artPlanes.set(k, mesh);
    plotsGroup.add(mesh);
  };
  const setMine: Eyes['setMine'] = (cards) => {
    for (const s of [...cardSprites.children]) { cardSprites.remove(s); const mm = (s as THREE.Sprite).material; mm.map?.dispose(); mm.dispose(); }
    if (!frame) return;
    const ps = plotSize(frame);
    for (const c of cards) {
      const tex = new THREE.CanvasTexture(c.card);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const [x, z] = cellToLocal(frame, c.gx, c.gy);
      sp.scale.set(ps * 0.62, ps * 0.62 * (c.card.height / c.card.width), 1);
      sp.position.set(x + ps / 2, 3.4, z + ps / 2);
      sp.userData.cell = { gx: c.gx, gy: c.gy };
      sp.userData.bob = (c.gx * 0.71 + c.gy * 0.13) % 6;
      cardSprites.add(sp);
    }
  };

  // far things: where something on Earth stands in this view (true direction, the Earth's curve taken off)
  const placeFar = (lng: number, lat: number) => {
    if (!frame) return null;
    const here = localToLngLatCam();
    const bd = bearingDistance(here.lng, here.lat, lng, lat);
    if (bd.m < NEAR_LIMIT) {
      const [x, z] = lngLatToLocal(frame, lng, lat);
      return { near: true, x, z, y: 0, dist: bd.m, bearing: bd.bearing };
    }
    const x = pos.x + Math.sin(bd.bearing) * bd.m, z = pos.z - Math.cos(bd.bearing) * bd.m;
    return { near: false, x, z, y: -curveDrop(bd.m), dist: bd.m, bearing: bd.bearing };
  };
  const localToLngLatCam = () => {
    const p = o.pose();
    return p ?? { lng: frame!.lng0, lat: frame!.lat0 };
  };

  const setLeviathan = (l: LevPlace | null) => {
    levPlace = l;
    if (l) lev.setLook(l.look);
  };

  const setBeacons = (list: Beacon[]) => {
    for (const b of beacons) { b.obj.parent?.remove(b.obj); b.obj.traverse((x) => { if ((x as THREE.Mesh).material) ((x as THREE.Mesh).material as THREE.Material).dispose(); }); }
    beacons = [];
    for (const b of list) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(beamGeo, beaconMat(b.color));
      (beam.material as THREE.ShaderMaterial).blending = auraMat.blending;
      g.add(beam);
      const base = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: b.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      g.add(base);
      const em = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(b.emoji), transparent: true, depthWrite: false, fog: false }));
      g.add(em);
      g.userData = { beam, base, em };
      beacons.push({ b, obj: g, dist: Infinity, bearing: 0 });
    }
  };

  const setHotZone = (h: HotDome | null) => {
    hot = h;
    for (const c of [...hotGroup.children]) { hotGroup.remove(c); ((c as THREE.Mesh).material as THREE.Material).dispose(); }
    if (!h) return;
    const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: '#FF7A3D', transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    const ring = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: '#FFB020', wireframe: true, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    hotGroup.add(dome, ring);
  };

  const setFallingStars = (list: FallingStar[]) => {
    for (const f of falling) { fallingGroup.remove(f.obj); f.obj.material.dispose(); }
    falling = [];
    if (!frame) return;
    const ps = plotSize(frame);
    for (const s of list) {
      const [x, z] = cellToLocal(frame, s.gx, s.gy);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFE48A', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.scale.setScalar(5);
      const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('⭐'), transparent: true, depthWrite: false, fog: false }));
      star.scale.setScalar(0.5);
      sp.add(star);
      const base = new THREE.Vector3(x + ps / 2, 16 + ((s.id * 7) % 12), z + ps / 2);
      sp.position.copy(base);
      fallingGroup.add(sp);
      falling.push({ s, obj: sp, base });
    }
  };

  const balloonGeo = T(new THREE.SphereGeometry(1, 20, 14).scale(1, 1.18, 1));
  const stringGeo = T(new THREE.CylinderGeometry(0.02, 0.02, 3.2, 4).translate(0, -2.7, 0));
  const lanternGeo = T(new THREE.CylinderGeometry(0.75, 0.55, 1.5, 10));
  const setDrops = (list: SkyDrop[]) => {
    const keep = new Set(list.map((d) => d.id));
    for (const d of drops) if (!keep.has(d.d.id)) lastDrop.set(d.d.id, d.pos.clone());
    if (lastDrop.size > 12) lastDrop.delete(lastDrop.keys().next().value!);
    for (const d of drops) if (!keep.has(d.d.id)) { dropGroup.remove(d.obj); d.obj.traverse((x) => { if ((x as THREE.Mesh).material) ((x as THREE.Mesh).material as THREE.Material).dispose(); }); }
    drops = drops.filter((d) => keep.has(d.d.id));
    for (const d of list) {
      if (drops.some((x) => x.d.id === d.id)) continue;
      const r = (k: number) => { const s = Math.sin(d.seed * 91.7 + k * 17.3) * 43758.5453; return s - Math.floor(s); };
      const bearing = r(1) * Math.PI * 2;
      let obj: THREE.Object3D;
      let anchor: THREE.Vector3;
      if (d.kind === 'meteor') {
        const g = new THREE.Group();
        const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#E9F4FF', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        head.scale.setScalar(26);
        g.add(head);
        for (let k = 1; k <= 10; k++) {
          const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#9FC7FF', transparent: true, opacity: 1 - k / 11, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
          t.scale.setScalar(20 * (1 - k / 13));
          g.add(t);
        }
        obj = g;
        const alt = (28 + r(2) * 40) * RAD;
        anchor = new THREE.Vector3(Math.sin(bearing) * Math.cos(alt), Math.sin(alt), -Math.cos(bearing) * Math.cos(alt)).multiplyScalar(1500);
      } else if (d.kind === 'lantern') {
        const g = new THREE.Group();
        const body = new THREE.Mesh(lanternGeo, new THREE.MeshBasicMaterial({ color: '#FFB347', transparent: true, opacity: 0.92 }));
        g.add(body);
        const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FF9E3D', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        glowS.scale.setScalar(6);
        g.add(glowS);
        obj = g;
        const dist = 40 + r(3) * 50;
        anchor = new THREE.Vector3(Math.sin(bearing) * dist, 14 + r(4) * 20, -Math.cos(bearing) * dist);
      } else {
        const palette = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#8B6BFF'];
        const g = new THREE.Group();
        const ball = new THREE.Mesh(balloonGeo, new THREE.MeshStandardMaterial({ color: palette[Math.floor(r(5) * palette.length)], roughness: 0.25, metalness: 0.1, emissive: '#331a55', emissiveIntensity: 0.25 }));
        ball.scale.setScalar(2.2);
        g.add(ball);
        g.add(new THREE.Mesh(stringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' })));
        obj = g;
        const dist = 35 + r(3) * 45;
        anchor = new THREE.Vector3(Math.sin(bearing) * dist, 10 + r(4) * 18, -Math.cos(bearing) * dist);
      }
      dropGroup.add(obj);
      drops.push({ d, obj, pos: new THREE.Vector3(), visible: true, anchor, born: performance.now() / 1000 });
    }
  };

  const setBuddies = (list: Buddy[]) => {
    for (const b of buddies) { buddyGroup.remove(b.obj); b.obj.traverse((x) => { const mm = (x as THREE.Mesh).material as THREE.Material | undefined; if (mm) { (mm as THREE.SpriteMaterial).map?.dispose(); mm.dispose(); } }); }
    buddies = [];
    for (const b of list) {
      const g = new THREE.Group();
      const bodyM = new THREE.Mesh(capsuleGeo, new THREE.MeshLambertMaterial({ color: b.color, emissive: b.color, emissiveIntensity: 0.25 }));
      bodyM.position.y = 0.8;
      const headM = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: '#FFE0C2' }));
      headM.position.y = 1.65;
      const c = Object.assign(document.createElement('canvas'), { width: 256, height: 64 });
      const gg = c.getContext('2d')!;
      gg.fillStyle = 'rgba(10,12,40,0.75)'; gg.beginPath(); gg.roundRect(4, 8, 248, 48, 24); gg.fill();
      gg.fillStyle = '#fff'; gg.font = 'bold 28px system-ui, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(b.name.slice(0, 16), 128, 33);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      tag.scale.set(2.4, 0.6, 1);
      tag.position.y = 2.4;
      g.add(bodyM, headM, tag);
      g.userData.id = b.id;
      buddyGroup.add(g);
      buddies.push({ b, obj: g });
    }
  };

  // ---- the clock and the sky ------------------------------------------------------------------------------------------
  let clock: number | null = null;
  const sky = { day: 1, sunAlt: 0.5, sunAz: 0, moonAlt: -1, moonAz: 0, moonPhase: 0, moonFrac: 0 };
  let lastSky = -1e9;
  const sunV = new THREE.Vector3(), moonV = new THREE.Vector3();
  const updateSky = (now: number) => {
    if (!frame) return;
    const ms = clock ?? Date.now();
    const here = localToLngLatCam();
    const s = sunPosition(ms, here.lat, here.lng);
    const m = moonPosition(ms, here.lat, here.lng);
    sunV.fromArray(skyDir(s));
    moonV.fromArray(skyDir(m));
    const day = daylight(s.alt);
    Object.assign(sky, { day, sunAlt: s.alt, sunAz: s.az, moonAlt: m.alt, moonAz: m.az, moonPhase: m.phase, moonFrac: m.fraction });
    skyU.uSun.value.copy(sunV);
    skyU.uMoon.value.copy(moonV);
    skyU.uDay.value = day;
    const sunDeg = s.alt / RAD;
    skyU.uDusk.value = Math.max(0, 1 - Math.abs(sunDeg - 1) / 9);
    skyU.uMoonGlow.value = Math.max(0, m.fraction) * (m.alt > 0 ? 1 : 0);
    const night = 1 - day;
    starU.uNight.value = Math.max(0, Math.min(1, (night - 0.25) / 0.6));
    lineMat.opacity = starU.uNight.value * 0.13;
    moonU.uSun.value.copy(sunV);
    moonU.uNight.value = night;
    // fog = the colour of the horizon
    const hor = new THREE.Color().setRGB(0.02, 0.022, 0.06).lerp(new THREE.Color().setRGB(0.55, 0.72, 0.92), day);
    if (skyU.uNeon.value > 0.5) hor.lerp(new THREE.Color().setRGB(0.06, 0.025, 0.11), night);
    hor.lerp(new THREE.Color().setRGB(0.85, 0.45, 0.3), skyU.uDusk.value * 0.35);
    fog.color.copy(hor);
    // light: the sun by day, the moon (faintly blue) at night
    const lightDir = day > 0.05 || m.alt < 0 ? sunV : moonV;
    const sunCol = new THREE.Color('#FFF1DA').lerp(new THREE.Color('#FFB27A'), skyU.uDusk.value);
    const moonCol = new THREE.Color('#8FA6E8');
    sunLight.copy(lightDir);
    groundU.uSkyCol.value.copy(hor).lerp(new THREE.Color('#ffffff'), 0.15 * day);
    groundU.uSunDirV.value.copy(sunV);
    groundU.uDayG.value = day;
    for (const L of [lightsFar, lightsNear]) {
      L.dir.position.copy(lightDir).multiplyScalar(1000);
      L.dir.color.copy(day > 0.05 ? sunCol : moonCol);
      // (three.js lights are physical: a Lambert surface gives back 1/π of what falls on it)
      L.dir.intensity = day > 0.05 ? 0.5 + 2.2 * day : 0.6 * Math.max(0.2, m.fraction);
      L.hemi.intensity = 1.25 + 1.35 * day;
      L.hemi.color.set(day > 0.3 ? '#cfe3ff' : '#6a72b8');
      L.hemi.groundColor.set(day > 0.3 ? '#5b5448' : '#1c1838');
    }
    terrU.uSunDir.value.copy(lightDir);
    terrU.uSunCol.value.copy(lightsFar.dir.color).multiplyScalar(lightsFar.dir.intensity * 0.3);
    terrU.uAmb.value.copy(lightsFar.hemi.color).multiplyScalar(lightsFar.hemi.intensity * 0.24);
    bldU.uNight.value = Math.max(0, Math.min(1, (0.55 - day) / 0.4));
    auraU.uGlow.value = 0.4 + night * 0.6;
    const blend = day > 0.45 ? THREE.NormalBlending : THREE.AdditiveBlending;
    if (auraMat.blending !== blend) {
      auraMat.blending = beamMat.blending = blend;
      auraMat.needsUpdate = beamMat.needsUpdate = true;
      for (const b of beacons) { const m = (b.obj.userData.beam as THREE.Mesh).material as THREE.ShaderMaterial; m.blending = blend; m.needsUpdate = true; }
    }
    gridU.uDay.value = day;
    // the planets drift slowly: once a minute is plenty
    if (now - lastSky > 60_000 || !planetList.length) {
      planetList = planets(ms);
      const P = starGeo.attributes.position as THREE.BufferAttribute, Sz = starGeo.attributes.aSize as THREE.BufferAttribute, C = starGeo.attributes.aColor as THREE.BufferAttribute;
      planetList.forEach((p, i) => {
        const v = equatorial(p.ra, p.dec);
        P.setXYZ(planetBase + i, v[0] * SKY_R * 0.91, v[1] * SKY_R * 0.91, v[2] * SKY_R * 0.91);
        Sz.setX(planetBase + i, magSize(p.mag) + 0.8);
        const c = hex(p.color);
        C.setXYZ(planetBase + i, c[0] * magK(p.mag), c[1] * magK(p.mag), c[2] * magK(p.mag));
      });
      P.needsUpdate = Sz.needsUpdate = C.needsUpdate = true;
      lastSky = now;
    }
    starGroup.matrix.fromArray(skyMatrix(ms, here.lat, here.lng));
    skyU.uNGP.value.fromArray(galactic(0, Math.PI / 2)).applyMatrix4(new THREE.Matrix4().extractRotation(starGroup.matrix)).normalize();
    skyU.uGC.value.fromArray(galactic(0, 0)).applyMatrix4(new THREE.Matrix4().extractRotation(starGroup.matrix)).normalize();
    skyU.uStars.value = starU.uNight.value;
    starGroup.matrix.setPosition(pos);
    starGroup.matrixWorldNeedsUpdate = true;
  };

  // ---- input: look, pinch, tap ------------------------------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number }>();
  let pinch0 = 0, fov0 = fov;
  let lastLookSent = 0;
  const el = o.canvas;
  const down = (e: PointerEvent) => {
    try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    vyaw = vpitch = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = fov; }
  };
  const move = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) fov = Math.max(22, Math.min(80, fov0 * (pinch0 / Math.max(20, d))));
      return;
    }
    // swipe to look: the view follows your finger's direction, slower when zoomed in
    const k = ((fov * RAD) / Math.max(300, el.clientHeight)) * 1.15;
    if (gyro) gyroYaw += dx * k;
    else { yaw += dx * k; pitch = Math.max(-1.45, Math.min(1.52, pitch - dy * k)); }
    vyaw = dx * k; vpitch = -dy * k;
  };
  const up = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p) return;
    if (pointers.size === 0 && performance.now() - p.t0 < 320 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 10) {
      vyaw = vpitch = 0;
      o.onPick(pick(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
    }
    if (pointers.size < 2) pinch0 = 0;
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); fov = Math.max(22, Math.min(80, fov * (1 + e.deltaY * 0.0012))); };
  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const k = e.key.toLowerCase();
    if (k === 'q') yaw -= 0.08; else if (k === 'e') yaw += 0.08;
    else if (k === 'r') pitch = Math.min(1.52, pitch + 0.08); else if (k === 'f') pitch = Math.max(-1.45, pitch - 0.08);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', keys);

  // ---- picking ------------------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const angle = (dir: THREE.Vector3, to: THREE.Vector3) => dir.angleTo(to.clone().sub(cam.position).normalize());
  const pick = (cx: number, cy: number): Pick | null => {
    const r = el.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    cam.updateMatrixWorld();
    ray.setFromCamera(ndc, cam);
    const dir = ray.ray.direction;
    const tol = Math.max(2.6, fov * 0.06) * RAD;
    // things in the air first: sky treasures, falling stars
    let best: { a: number; p: Pick } | null = null;
    const consider = (a: number, lim: number, p: Pick) => { if (a < lim && (!best || a < best.a)) best = { a, p }; };
    for (const d of drops) if (d.visible) consider(angle(dir, d.pos), tol * 1.3, { kind: 'drop', id: d.d.id });
    for (const f of falling) consider(angle(dir, f.obj.position), tol * 1.2, { kind: 'star', id: f.s.id });
    for (const b of buddies) consider(angle(dir, b.obj.position.clone().setY(1.2)), tol, { kind: 'buddy', id: b.b.id });
    if (best) return (best as { p: Pick }).p;
    // the Leviathan
    if (lev.group.visible) {
      const hits = ray.intersectObjects(lev.core, false);
      const c = new THREE.Vector3();
      lev.core[0].getWorldPosition(c);
      const size = lev.group.scale.x;
      const toward = angle(dir, c) < Math.max(tol * 1.5, Math.atan2(size * 0.45, Math.max(1, c.distanceTo(cam.position))));
      if (hits.length || toward) return { kind: 'lev' };
    }
    for (const b of beacons) {
      const ud = b.obj.userData as { em: THREE.Sprite };
      const p = new THREE.Vector3(); ud.em.getWorldPosition(p);
      const base = b.obj.position.clone();
      if (angle(dir, p) < tol * 1.4 || angle(dir, base.setY(base.y + 30)) < tol) return { kind: 'beacon', id: b.b.id };
    }
    // your floating cards
    const cardHit = ray.intersectObjects(cardSprites.children, false)[0];
    if (cardHit) { const c = cardHit.object.userData.cell as { gx: number; gy: number }; return { kind: 'cell', gx: c.gx, gy: c.gy, dist: cardHit.distance }; }
    // a building or the ground: the plot there
    if (frame) {
      let hitP: THREE.Vector3 | null = null, dist = Infinity;
      if (buildings) { const h = ray.intersectObject(buildings, false)[0]; if (h && h.distance < 900) { hitP = h.point.clone(); dist = h.distance; } }
      if (dir.y < -1e-4) {
        const t = -cam.position.y / dir.y;
        if (t < dist && t < 900) { hitP = cam.position.clone().addScaledVector(dir, t); dist = t; }
      }
      if (hitP) {
        // (a wall: nudge into the building so its own plot is the one picked)
        if (Math.abs(hitP.y) > 0.5) hitP.addScaledVector(dir, 0.3);
        const c = localToCell(frame, hitP.x, hitP.z);
        return { kind: 'cell', gx: c.gx, gy: c.gy, dist };
      }
    }
    // the sky: the moon, the sun, planets, named stars
    if (dir.y > -0.02) {
      const ms = clock ?? Date.now();
      const here = localToLngLatCam();
      const M = new THREE.Matrix4().fromArray(skyMatrix(ms, here.lat, here.lng));
      const skyHits: { a: number; p: Pick }[] = [];
      if (sky.moonAlt > -0.02) skyHits.push({ a: dir.angleTo(moonV), p: { kind: 'sky', what: 'moon', name: 'The Moon' } });
      if (sky.sunAlt > -0.02) skyHits.push({ a: dir.angleTo(sunV), p: { kind: 'sky', what: 'sun', name: 'The Sun' } });
      for (const p of planetList) { const v = new THREE.Vector3(...equatorial(p.ra, p.dec)).applyMatrix4(M); if (v.y > 0) skyHits.push({ a: dir.angleTo(v) * 0.85, p: { kind: 'sky', what: 'planet', name: p.name } }); }
      if (starU.uNight.value > 0.2) for (const s of NAMED_STARS as NamedStar[]) { const v = new THREE.Vector3(...equatorial(s.ra, s.dec)).applyMatrix4(M); if (v.y > 0) skyHits.push({ a: dir.angleTo(v) + Math.max(0, s.mag) * 0.002, p: { kind: 'sky', what: 'star', name: s.name, ly: s.ly, group: s.group } }); }
      skyHits.sort((a, b) => a.a - b.a);
      if (skyHits[0] && skyHits[0].a < tol * 1.6) return skyHits[0].p;
    }
    return null;
  };

  // ---- the loop -----------------------------------------------------------------------------------------------------
  const pace = framePacer({ ambient: () => !throws.length && !levPlace });
  let frames = 0, frameMs = 16;
  const tune = adaptiveDpr((d) => { dpr = d; renderer.setPixelRatio(d); starU.uPx.value = d; resize(); }, dpr, pace);
  let raf = 0, last = performance.now(), t0 = performance.now(), disposed = false;
  let w = 0, h = 0;
  const resize = () => {
    const nw = el.clientWidth || 1, nh = el.clientHeight || 1;
    w = nw; h = nh;
    renderer.setSize(nw, nh, false);
    cam.aspect = farCam.aspect = nw / nh;
    body.resize(nw / nh);
    cam.updateProjectionMatrix();
    farCam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  const tmpV = new THREE.Vector3();
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (disposed || document.hidden) return;
    if (!pace.ready(now)) return;
    const rawDt = (now - last) / 1000;
    const dt = Math.min(0.1, rawDt);
    frames++; frameMs += (rawDt * 1000 - frameMs) * 0.1;
    last = now;
    tune(rawDt);
    const t = (now - t0) / 1000;
    if (!frame) return;
    // where you stand
    const p = o.pose();
    if (p) { const [x, z] = lngLatToLocal(frame, p.lng, p.lat); pos.set(x, o.eye(), z); }
    cam.position.copy(pos);
    farCam.position.copy(pos);
    // look: a little glide after a flick
    if (!pointers.size && !gyro && (Math.abs(vyaw) > 1e-5 || Math.abs(vpitch) > 1e-5)) {
      yaw += vyaw; pitch = Math.max(-1.45, Math.min(1.52, pitch + vpitch));
      vyaw *= 0.9; vpitch *= 0.9;
    }
    // how fast you're going and turning (smoothed), for the walk and the feel of speed
    if (Number.isFinite(lastPos.x) && dt > 0) {
      const v = Math.hypot(pos.x - lastPos.x, pos.z - lastPos.z) / dt;
      speed += ((v > 400 ? 0 : v) - speed) * Math.min(1, dt * 5);
      let dy = yaw - lastYaw; dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      turn += (dy / dt - turn) * Math.min(1, dt * 6);
    }
    lastPos.copy(pos); lastYaw = yaw;
    const veh = o.vehicle?.() ?? 'walk';
    fovKick += ((veh === 'car' || veh === 'jet' ? Math.min(9, speed * 0.35) : Math.min(3, speed * 0.4)) - fovKick) * Math.min(1, dt * 3);
    shake = Math.max(0, shake - dt * 1.5);
    if (lev.group.visible && levPlace?.walking && levDist < 1800) shake = Math.max(shake, (1 - levDist / 1800) * (0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 * (levPlace.look.rampage ? 2.6 : 1)))));
    if (lev.group.visible && levDist < 4000) {
      if (!nextRoar) nextRoar = t + 6 + Math.random() * 8;
      else if (t > nextRoar) { nextRoar = t + 25 + Math.random() * 35; sound.roar(1 - levDist / 4000); shake = Math.max(shake, 1 - levDist / 4000); }
    }
    if (now - lastDrive > 250) { lastDrive = now; sound.drive(veh, speed, false); }
    applyCamera();
    cam.updateProjectionMatrix();
    farCam.updateProjectionMatrix();
    body.update({
      dt, t, speed, turn, yaw, pitch, vehicle: veh, eye: pos, eyeHeight: o.eye(), day: sky.day, sun: sunV, camQ: cam.quaternion,
      light: { dir: lightsNear.dir.color, dirI: lightsNear.dir.intensity, sky: lightsNear.hemi.color, ground: lightsNear.hemi.groundColor, hemiI: lightsNear.hemi.intensity },
    });
    if (o.onLook && now - lastLookSent > 120) { lastLookSent = now; o.onLook(((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), pitch); }
    if (now - lastSky > 4000 || lastSky < 0) updateSky(now);
    else { starGroup.matrix.setPosition(pos); starGroup.matrixWorldNeedsUpdate = true; }
    // shadows: keep the sun's camera centred near you (snapped, so the map doesn't shimmer); redraw only when needed
    {
      const d = lightsNear.dir;
      // (castShadow stays on: switching it would rebuild every material; below the horizon the map just isn't redrawn)
      const lit = sunLight.y > 0.05;
      const grid = SH * 0.3;
      const cx = Math.round(pos.x / grid) * grid, cz = Math.round(pos.z / grid) * grid;
      const dirN = sunLight;
      const moved = cx !== shadowAt.x || cz !== shadowAt.y || dirN.dot(shadowSun) < 0.99996;
      if (lit && (shadowDirty || moved) && now - lastShadow > 200) {
        shadowAt.set(cx, cz); shadowSun.copy(dirN); shadowDirty = false; lastShadow = now;
        d.target.position.set(cx, 0, cz);
        d.target.updateMatrixWorld();
        // (the light keeps its direction; only where it stands moves)
        d.userData.at = new THREE.Vector3(cx, 0, cz).addScaledVector(dirN, 600);
        renderer.shadowMap.needsUpdate = true;
      }
      if (d.userData.at) d.position.copy(d.userData.at as THREE.Vector3);
    }
    nature.update(o.reduceMotion ? 0 : t, pos, o.eye());
    street.update(bldU.uNight.value);
    groundU.uTime.value = o.reduceMotion ? 0 : t;
    // the sharpest ground follows you: ask for a new patch near its edge
    if (o.onNeedClose && now - closeAsked > 1500) {
      const half = groundU.uCloseRect.value.z / 2;
      if (!closeAt || Math.max(Math.abs(pos.x - closeAt.x), Math.abs(pos.z - closeAt.y)) > half * 0.55) { closeAsked = now; o.onNeedClose(pos.x, pos.z); }
    }
    skyU.uTime.value = o.reduceMotion ? 0 : t;
    starU.uTime.value = t;
    auraU.uTime.value = o.reduceMotion ? 0 : t;
    skyDome.position.copy(pos);
    moon.position.copy(pos).addScaledVector(moonV, 90_000);
    moon.scale.setScalar(90_000 * Math.tan(0.26 * RAD * 2.4));
    moon.visible = sky.moonAlt > -0.03;
    sunGlow.position.copy(pos).addScaledVector(sunV, 95_000);
    sunGlow.scale.setScalar(95_000 * Math.tan(5 * RAD) * (0.6 + sky.day * 0.6));
    sunGlow.visible = sky.sunAlt > -0.04;
    // the grid follows you, snapped to the plots
    const ps = plotSize(frame);
    const [ox, oz] = cellToLocal(frame, 0, 0);
    const snapX = Math.round((pos.x - ox) / ps) * ps + ox, snapZ = Math.round((pos.z - oz) / ps) * ps + oz;
    grid.position.set(snapX, 0.03, snapZ);
    gridU.uCam.value.set(pos.x - snapX, pos.z - snapZ);
    const cellOf = (x: number, z: number) => new THREE.Vector2(Math.floor((x - snapX) / ps), Math.floor((z - snapZ) / ps));
    gridU.uHere.value.copy(cellOf(pos.x, pos.z));
    // the plot you're looking at (the middle of the screen, on the ground nearby)
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (fwd.y < -0.05) { const tt = -pos.y / fwd.y; if (tt < 60) gridU.uAim.value.copy(cellOf(pos.x + fwd.x * tt, pos.z + fwd.z * tt)); else gridU.uAim.value.set(1e6, 1e6); }
    else gridU.uAim.value.set(1e6, 1e6);
    // bobbing things
    for (const s of emojiSprites.children) s.position.y += Math.sin(t * 1.4 + (s.userData.bob as number)) * 0.004;
    for (const s of cardSprites.children) { s.position.y = 3.4 + Math.sin(t * 1.2 + (s.userData.bob as number)) * 0.18; }
    for (const s of sparkles.children) {
      const ph = s.userData.phase as number, k = (t * 0.6 + ph) % 1;
      s.position.y = 0.4 + k * 2.6;
      s.scale.setScalar((s.userData.ps as number) * 0.18 * Math.sin(k * Math.PI));
    }
    // the Leviathan
    lev.group.visible = false;
    levDist = Infinity;
    if (levPlace) {
      const pl = placeFar(levPlace.lng, levPlace.lat);
      if (pl && pl.dist < 120_000) {
        levDist = pl.dist;
        const big = Math.max(LEV_H, pl.dist * 0.26) * (levPlace.look.tiny ? 0.22 : 1);
        const parent = pl.near ? near : far;
        if (lev.group.parent !== parent) parent.add(lev.group);
        lev.group.position.set(pl.x, pl.y, pl.z);
        lev.group.scale.setScalar(big);
        lev.group.rotation.y = Math.PI / 2 - levPlace.heading;
        lev.group.visible = true;
        lev.update(t, dt, levPlace.walking);
      }
    }
    // beacons: tall pillars of light in their true direction, the Earth's curve taken off
    for (const b of beacons) {
      const pl = placeFar(b.b.lng, b.b.lat);
      if (!pl || pl.dist > 220_000 || pl.dist < 30) { b.obj.visible = false; continue; }
      b.dist = pl.dist; b.bearing = pl.bearing;
      const parent = pl.near ? beaconsNear : beaconsFar;
      if (b.obj.parent !== parent) parent.add(b.obj);
      b.obj.visible = true;
      b.obj.position.set(pl.x, pl.y, pl.z);
      const ud = b.obj.userData as { beam: THREE.Mesh; base: THREE.Sprite; em: THREE.Sprite };
      const wid = Math.max(6, pl.dist * 0.0035), tall = Math.max(600, pl.dist * 0.12);
      ud.beam.scale.set(wid, tall, wid);
      ud.base.scale.setScalar(wid * 8);
      ud.base.position.y = wid;
      const es = Math.max(10, pl.dist * 0.05);
      ud.em.scale.setScalar(es);
      ud.em.position.y = Math.min(tall * 0.55, Math.max(es * 1.2, pl.dist * 0.07)) + Math.sin(t + pl.dist) * es * 0.04;
    }
    // the Hot Zone
    hotGroup.visible = false;
    if (hot && frame) {
      const pl = placeFar(hot.lng, hot.lat);
      if (pl && pl.dist < 160_000) {
        const inside = pl.dist < hot.radiusM;
        hotGroup.visible = !inside;
        hotGroup.position.set(pl.x, pl.y, pl.z);
        hotGroup.scale.set(hot.radiusM, hot.radiusM * 0.45, hot.radiusM);
      }
    }
    // falling stars drift and twinkle
    for (const f of falling) {
      f.obj.position.set(f.base.x + Math.sin(t * 0.7 + f.s.id) * 1.2, f.base.y + Math.sin(t * 1.1 + f.s.id * 2) * 1.5, f.base.z + Math.cos(t * 0.6 + f.s.id) * 1.2);
      f.obj.scale.setScalar(5 + Math.sin(t * 6 + f.s.id) * 0.8);
    }
    // sky treasures
    for (const d of drops) {
      const age = now / 1000 - d.born;
      if (d.d.kind === 'meteor') {
        // a shooting star that crosses its patch of sky every 9 seconds
        const cyc = (age + d.d.seed * 9) % 9;
        const on = cyc < 2.6;
        d.visible = on;
        d.obj.visible = on;
        const k = cyc / 2.6;
        const side = new THREE.Vector3(-d.anchor.z, 0, d.anchor.x).normalize();
        const head = d.anchor.clone().addScaledVector(side, (k - 0.5) * 900).add(new THREE.Vector3(0, -k * 260, 0)).add(pos);
        d.pos.copy(head);
        d.obj.position.copy(head);
        const back = side.clone().multiplyScalar(-1).add(new THREE.Vector3(0, 0.29, 0)).normalize();
        d.obj.children.forEach((c, i) => { c.position.copy(back).multiplyScalar(i * 22); (c as THREE.Sprite).material.opacity = Math.sin(k * Math.PI) * (i ? 1 - i / 11 : 1); });
      } else {
        const rise = d.d.kind === 'lantern' ? (age * 0.9) % 60 : (age * 0.5) % 45;
        const sway = Math.sin(age * 0.8 + d.d.seed) * 2.2;
        d.pos.copy(d.anchor).add(pos).add(new THREE.Vector3(sway, rise - 1.7, Math.cos(age * 0.6 + d.d.seed) * 1.5));
        d.obj.position.copy(d.pos);
        d.obj.rotation.z = Math.sin(age * 0.8 + d.d.seed) * 0.12;
        d.visible = true;
        d.obj.visible = true;
      }
    }
    // your party
    for (const b of buddies) {
      const [x, z] = lngLatToLocal(frame, b.b.lng, b.b.lat);
      b.obj.position.set(x, 0, z);
      b.obj.lookAt(pos.x, 0, pos.z);
      b.obj.children[0].position.y = 0.8 + Math.abs(Math.sin(t * 3 + x)) * 0.05;
    }
    // thrown ink
    for (let i = throws.length - 1; i >= 0; i--) {
      const th = throws[i];
      th.t += dt / 0.62;
      const k = Math.min(1, th.t);
      const a = th.from.clone().lerp(th.mid, k), b = th.mid.clone().lerp(th.to, k);
      th.mesh.position.copy(a.lerp(b, k));
      th.mesh.scale.setScalar(Math.max(0.15, th.from.distanceTo(th.to) * 0.012));
      if (k >= 1) {
        th.mesh.parent?.remove(th.mesh);
        throws.splice(i, 1);
        lev.hit();
        if (th.to.distanceTo(pos) < NEAR_LIMIT) burst(th.to, ['#2A1260', '#B026FF', '#FF5CDB', '#22E3FF'], 60, th.to.distanceTo(pos) * 0.02 + 4, Math.max(1, th.to.distanceTo(pos) * 0.01));
        th.done?.();
      }
    }
    // particles
    if (pAlive) {
      let any = false;
      for (let i = 0; i < MAXP; i++) {
        if (pLife[i] <= 0) { pSize[i] = 0; continue; }
        any = true;
        pLife[i] -= dt * 0.9;
        pVel[i * 3 + 1] -= 9.8 * dt * 0.4;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        pSize[i] *= 0.985;
      }
      (pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (pGeo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      (pGeo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
      if (!any) pAlive = 0;
    }
    // floating damage numbers (HTML over the canvas)
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt;
      const v = f.at.clone().project(cam);
      f.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h - f.t * 60}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.4));
      if (f.t > 1.4 || v.z > 1) { f.el.remove(); floaters.splice(i, 1); }
    }
    renderer.info.reset();
    renderer.clear();
    renderer.render(far, farCam);
    renderer.clearDepth();
    renderer.render(near, cam);
    // your hands (and the bike's bars, the car's dashboard, the jetpack's grips) on top of everything
    renderer.clearDepth();
    renderer.render(body.overlay, body.ocam);
  };
  raf = requestAnimationFrame(tick);

  const setGyro = (on: boolean) => {
    if (on === gyro) return;
    gyro = on;
    gyroQ = null;
    if (on) window.addEventListener('deviceorientation', onOrient);
    else window.removeEventListener('deviceorientation', onOrient);
  };

  return {
    setFrame, frame: () => frame, setGround, setClose, setBuildings, setTrees, setStreet, setOccupancy, setTerrain, setPlots, setArt, setMine, setLeviathan, setBeacons,
    setFallingStars, setDrops, setBuddies, setHotZone,
    setClock: (ms) => { clock = ms; lastSky = -1e9; },
    lookAt: (y, p) => { yaw = y; pitch = Math.max(-1.45, Math.min(1.52, p)); vyaw = vpitch = 0; if (gyro) gyroQ = null; },
    look: () => ({ yaw: ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), pitch, fov }),
    setGyro,
    throwAtLev: (onLand) => {
      if (!lev.group.visible) return false;
      const to = new THREE.Vector3();
      lev.core[0].getWorldPosition(to);
      const from = cam.position.clone().add(new THREE.Vector3(0.25, -0.35, -0.6).applyQuaternion(cam.quaternion));
      // far away it flies in the near pass up to the edge, then it "lands" there (the creature is in the far pass)
      const dist = from.distanceTo(to);
      const target = dist > NEAR_FAR * 0.9 ? from.clone().add(to.clone().sub(from).normalize().multiplyScalar(NEAR_FAR * 0.8)) : to;
      const mid = from.clone().lerp(target, 0.5).add(new THREE.Vector3(0, from.distanceTo(target) * 0.18, 0));
      const mesh = inkBall.clone();
      near.add(mesh);
      body.throw();
      sound.whoosh();
      throws.push({ mesh, t: 0, from, to: target, mid, done: () => { sound.splat(); onLand?.(); } });
      return true;
    },
    burstAtDrop: (id) => {
      body.reach();
      sound.pop();
      sound.chime();
      const d = drops.find((x) => x.d.id === id);
      if (!d) return;
      const near2 = d.pos.distanceTo(pos) < NEAR_LIMIT;
      if (near2) burst(d.pos, d.d.kind === 'balloon' ? ['#FF4D6D', '#FFE14D', '#34C3FF', '#8B6BFF', '#3DDC97'] : ['#FFE6A3', '#FFB347', '#ffffff'], 140, 14, 4.5);
      d.obj.visible = false;
      d.visible = false;
    },
    burstAtStar: (id) => {
      body.reach();
      sound.chime(true);
      const f = falling.find((x) => x.s.id === id);
      if (!f) return;
      burst(f.obj.position, ['#FFE48A', '#ffffff', '#FFB020'], 120, 12, 3.5);
      f.obj.visible = false;
    },
    damage: (text) => {
      const at = new THREE.Vector3();
      if (lev.group.visible) lev.core[0].getWorldPosition(at); else at.copy(pos).add(new THREE.Vector3(0, 0, -10).applyQuaternion(cam.quaternion));
      if (levDist > NEAR_FAR * 0.9) at.copy(pos).add(at.clone().sub(pos).normalize().multiplyScalar(NEAR_FAR * 0.8));
      const div = document.createElement('div');
      div.className = 'pointer-events-none absolute left-0 top-0 font-display text-2xl font-black text-white [text-shadow:0_2px_10px_rgba(176,38,255,0.9)]';
      div.textContent = text;
      el.parentElement?.appendChild(div);
      floaters.push({ el: div, t: 0, at });
    },
    floatAt: (tg, text) => {
      const at = new THREE.Vector3();
      if ('drop' in tg) {
        const d = drops.find((x) => x.d.id === tg.drop || x.d.id.startsWith(`${tg.drop}:`));
        const was = [...lastDrop.entries()].find(([k]) => k === tg.drop || k.startsWith(`${tg.drop}:`))?.[1];
        if (d) at.copy(d.pos); else if (was) at.copy(was); else return;
      } else { const f = falling.find((x) => x.s.id === tg.star); if (!f) return; at.copy(f.obj.position); }
      if (at.distanceTo(pos) > NEAR_FAR * 0.9) at.copy(pos).add(at.clone().sub(pos).normalize().multiplyScalar(NEAR_FAR * 0.8));
      const div = document.createElement('div');
      div.className = 'pointer-events-none absolute left-0 top-0 whitespace-nowrap font-display text-xl font-black text-white [text-shadow:0_2px_10px_rgba(34,227,255,0.9)]';
      div.textContent = text;
      el.parentElement?.appendChild(div);
      floaters.push({ el: div, t: 0, at });
    },
    setBodyLook: (l) => body.setLook(l),
    surface: () => surfaceAt(pos.x, pos.z),
    sound: () => sound,
    sky: () => ({ ...sky }),
    now: () => clock ?? Date.now(),
    screenOf: (tg) => {
      const at = new THREE.Vector3();
      if ('lev' in tg) { if (!lev.group.visible) return null; lev.core[0].getWorldPosition(at); }
      else if ('drop' in tg) { const d = drops.find((x) => x.d.id === tg.drop || x.d.id.startsWith(`${tg.drop}:`)); if (!d || !d.visible) return null; at.copy(d.pos); }
      else if ('star' in tg) { const f = falling.find((x) => x.s.id === tg.star); if (!f) return null; at.copy(f.obj.position); }
      else if ('beacon' in tg) { const b = beacons.find((x) => x.b.id === tg.beacon); if (!b || !b.obj.visible) return null; (b.obj.userData.em as THREE.Sprite).getWorldPosition(at); }
      else { if (!frame) return null; const ps = plotSize(frame); const [x, z] = cellToLocal(frame, tg.cell[0], tg.cell[1]); at.set(x + ps / 2, 0.2, z + ps / 2); }
      let v = at.clone().project(cam);
      if (v.z > 1 || v.z < -1) v = at.clone().project(farCam);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    snapshot: () => new Promise((resolve) => {
      // draw a fresh frame and copy it straight away (the drawing buffer isn't kept between frames)
      renderer.clear(); renderer.render(far, farCam); renderer.clearDepth(); renderer.render(near, cam); renderer.clearDepth(); renderer.render(body.overlay, body.ocam);
      el.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    }),
    closeCanvas: () => closeCanvas,
    debugShow: (layer, on) => {
      const all: Record<string, THREE.Object3D | null> = { ground, grid, plots: plotsGroup, buildings, terrain, body: body.body, shadow: body.shadow, lev: lev.group };
      if (layer === 'shadows') { lightsNear.dir.castShadow = on; return; }
      const x = all[layer]; if (x) x.visible = on;
      if (layer === 'nature' || layer === 'street') near.children.forEach((c) => { if (c.userData.layer === layer) c.visible = on; });
    },
    debug: () => ({
      frame, pos: pos.toArray(), yaw, pitch, fov, plots: plots.length, art: artPlanes.size, cards: cardSprites.children.length,
      buildings: buildings ? (buildings.geometry.index?.count ?? 0) / 3 : 0, trees: nature.counts().trees, grass: nature.counts().grass, street: street.counts().objects, close: !!closeTex, shadows: renderer.shadowMap.enabled, terrain: !!terrain, ground: ground.visible,
      lev: lev.group.visible ? { dist: Math.round(levDist), near: lev.group.parent === near, scale: Math.round(lev.group.scale.x) } : null,
      beacons: beacons.filter((b) => b.obj.visible).length, drops: drops.length, falling: falling.length, buddies: buddies.length, sky: { ...sky },
      edges: edges?.count ?? 0, beams: beams?.count ?? 0, dpr, veh: o.vehicle?.() ?? 'walk', speed: Math.round(speed * 10) / 10,
      dropsAt: drops.map((d) => { const v = d.pos.clone().sub(cam.position); return { id: d.d.id, kind: d.d.kind, visible: d.visible, yaw: (Math.atan2(v.x, -v.z) + Math.PI * 2) % (Math.PI * 2), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)) }; }), steps, surface: surfaceAt(pos.x, pos.z), fovNow: Math.round(cam.fov), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, frames, frameMs: Math.round(frameMs),
    }),
    dispose: () => {
      disposed = true;
      body.dispose();
      sound.dispose();
      cancelAnimationFrame(raf);
      ro.disconnect();
      setGyro(false);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keys);
      for (const f of floaters) f.el.remove();
      setPlots([]); setBeacons([]); setFallingStars([]); setDrops([]); setBuddies([]); setHotZone(null); setMine([]);
      for (const [, mesh] of artPlanes) { (mesh.material as THREE.MeshLambertMaterial).map?.dispose(); (mesh.material as THREE.Material).dispose(); }
      if (buildings) buildings.geometry.dispose();
      if (terrain) terrain.geometry.dispose();
      nature.dispose(); street.dispose(); closeTex?.dispose();
      nearTex?.dispose(); farTex?.dispose();
      for (const t of emojiTex.values()) t.dispose();
      for (const d of own) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
