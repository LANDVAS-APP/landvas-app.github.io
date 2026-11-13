// A whole world in 3D, from your boots to orbit in one continuous zoom. Down low you walk in third
// person (your Inkborn bobbing after you, the others in your live group walking with you); pinch or
// scroll out and you rise up until the whole planet hangs in front of you, with everyone's plots and
// flags on it. Drag the globe, tap a plot, walk (or fly) there.
//
// Built to scale: the globe itself is a modest low-poly mesh, and a detailed patch of ground (with its
// rocks, crystals and plot lines) is rebuilt around you as you move — so a planet can be huge without
// costing more. Labels are pooled, the render resolution adapts to the device, and a lost GL context
// is reported instead of crashing. Plain three.js; React drives it through the PlanetScene handle.
import * as THREE from 'three';
import type { PlanetPlot } from '../backend/types';
import type { Genome } from '../inkborn/genome';
import { drawCreature, type CreatureState } from '../inkborn/rig';
import { rng } from '../inkborn/world';
import { LAT_MAX, PLOT_M, cellAt, cellBounds, cellCenterDir, cellFloat, cellKey, colsFor, dirOf, radiusFor, type Cell, type Vec3 } from './planetGrid';
import type { World } from './worlds';
import { animateModels, moduleModel, roverModel } from './baseModels';
import { alienModel, animateFinds, poiModel, shardModel, WEATHER, weatherParticles } from './finds3d';
import { framePacer, isPhone } from '../lib/gfx';
import { config } from '../env';

export type Pilot = { id: string; username: string; explorerUrl: string; d?: number[] | null; face?: number[] | null; hop?: number; companion?: Genome | null };
export type ZoomInfo = { level: number; meters: number; mode: 'walk' | 'fly' | 'orbit' };
export type PlanetSceneOpts = {
  canvas: HTMLCanvasElement; world: World; rows: number; seed: number; accent: string; explorerUrl: string;
  isHome: boolean; samples: number; reduceMotion?: boolean;
  /** start high over the planet (the World tab) rather than on your feet */ startHigh?: boolean;
  /** swoop down from space first */ intro?: boolean;
  onCell(c: Cell | null): void; onSample(got: number): void; onPick(c: Cell | null): void; onZoom(z: ZoomInfo): void; onLost?(): void;
  /** you're standing by meteorite i (asked again every few seconds while you stay) */ onMeteor?(i: number): void;
  /** the grid cell the view is centred on moved a good way (fetch the plots round it) */ onArea?(c: { gx: number; gy: number }): void;
  /** you're right by a find (storm shard, hiding alien, place to discover); asked again every few seconds while you stay */ onFind?(kind: FindKind, i: number): void;
};
export type FindKind = 'shard' | 'alien' | 'poi';
export type FindMark = { id: string; kind: FindKind; i: number; d: number[]; found: boolean; storm?: string; rare?: boolean; species?: string; rarity?: string; poi?: string };
export type PlanetScene = {
  /** joystick: x right, y forward (-1..1) */ joy: { x: number; y: number }; jump(): void;
  /** rarity colours, and from which rank a plot shines a beam into the sky */ setPlots(plots: PlanetPlot[], rarity?: Record<string, { color: string; rank: number }>): void;
  /** from afar: claimed-plot counts per sector of `size` x `size` plots */ setSectors(list: [number, number, number, boolean][], size: number): void;
  /** the current meteor shower (`key` changes with each new shower, which falls from the sky) */ setMeteors(key: string, list: { i: number; d: number[]; golden: boolean; taken: boolean }[]): void;
  /** a little burst of light where something happened (a meteorite grabbed) */ burst(d: number[], color?: string): void;
  /** the weather here: a storm kind blowing (dust, solar, blizzard, ion, acid, ash), or null for calm */ setWeather(kind: string | null): void;
  /** things to find round here: storm shards, hiding aliens, places to discover (found ones: shards and aliens vanish, places dim) */ setFinds(list: FindMark[]): void;
  /** the live group: add/remove explorers; positions from the heartbeat */ setLive(p: Pilot[]): void;
  /** a streamed position for one explorer (v: the rover they're driving) */ remote(id: string, d: number[], face: number[], hop: number, v?: string | null): void;
  /** where you are, to send to the group (v: the rover you're driving) */ pose(): { d: number[]; face: number[]; hop: number; moving: boolean; v?: string };
  /** get in a rover (top speed in m/s) or out (null) */ setRover(kind: string | null, speed?: number): void;
  /** drop in next to a spot on the globe */ teleport(d: number[]): void;
  /** stand exactly here, facing this way */ place(d: number[], face?: number[]): void;
  setBuddy(g: Genome | null): void;
  /** a speech bubble over an explorer (id, or 'me') for a few seconds */ say(id: string, text: string): void;
  /** one plot's shaft got deeper (the hole in the ground follows) */ setShaft(gx: number, gy: number, depth: number, cored: boolean): void;
  /** look down into a plot's shaft from above (null: back to normal); `lift` shifts the picture up (0..0.5) for a sheet below */ peekShaft(c: Cell | null, lift?: number): void;
  /** stop drawing while another full-screen 3D view is up (the shaft) */ setPaused(p: boolean): void;
  /** 0 = on your feet … 1 = the whole planet */ setZoom(level: number): void; zoom(f: number): void;
  /** look back at yourself */ findMe(): void;
  walkTo(c: Cell): void;
  dispose(): void;
};

const V = (a: Vec3 | number[]) => new THREE.Vector3(a[0], a[1], a[2]);
const UP = new THREE.Vector3(0, 1, 0);
const D = Math.PI / 180;
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
/** A speech bubble: up to 3 wrapped lines, with a little tail. */
function bubbleSprite(text: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const g = c.getContext('2d')!;
  g.font = '600 34px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = text.split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > 440 && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/\s*\S*$/, '') + '…'; }
  const w = Math.min(490, Math.max(...lines.map((l) => g.measureText(l).width)) + 44), h = lines.length * 40 + 26, top = 170 - h;
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.roundRect(256 - w / 2, top, w, h, 26); g.fill();
  g.beginPath(); g.moveTo(240, 168); g.lineTo(256, 194); g.lineTo(272, 168); g.fill();
  g.fillStyle = '#141633'; lines.forEach((l, i) => g.fillText(l, 256, top + 13 + 20 + i * 40));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true }));
  s.scale.set(3.1, 1.21, 1); s.center.set(0.5, 0); s.renderOrder = 6;
  return s;
}
function imageSprite(url: string, h: number) {
  const tex = new THREE.TextureLoader().load(url); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
  s.scale.set(h * (46 / 68), h, 1); s.center.set(0.5, 0);
  return s;
}
const disposeSprite = (s: THREE.Sprite) => { s.material.map?.dispose(); s.material.dispose(); };
/** Put an object on the ground at `d` (unit vector), standing up, turned `spin` round its up axis. */
function stand(o: THREE.Object3D, d: THREE.Vector3, r: number, spin = 0) {
  o.position.copy(d).multiplyScalar(r);
  o.quaternion.setFromUnitVectors(UP, d);
  if (spin) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
}
const hash = (a: number, b: number, c: number) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0;
};
/** How strong the GPU looks — sets the starting render resolution. */
function deviceTier() {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
  return mem <= 2 || cores <= 2 ? 0 : phone || mem <= 4 ? 1 : 2;
}

export function createPlanetScene(o: PlanetSceneOpts): PlanetScene {
  const { world: w, rows } = o;
  const R = radiusFor(rows);
  const seedR = rng(o.seed);
  const reduce = !!o.reduceMotion;
  const tier = deviceTier();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: tier === 2, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  const maxDpr = Math.min(window.devicePixelRatio || 1, tier === 2 ? 2 : tier === 1 ? 1.6 : 1);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, R * 20);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const lost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); o.onLost?.(); };
  o.canvas.addEventListener('webglcontextlost', lost);

  // ---- the shape and colour of the land ----------------------------------------------------------
  const unit = (r: () => number = seedR) => { const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); return v.lengthSq() < 1e-4 ? v.set(0, 1, 0) : v.normalize(); };
  // terrain in metres: big swells, hills, then small bumps underfoot (gas giants: gentle cloud swells)
  const rough = w.features.includes('mesas') || w.features.includes('volcano') ? 1.4 : w.features.includes('craters') ? 1.1 : 1;
  const OCT: [number, number][] = w.gas ? [[R * 0.5, 4], [900, 1.2], [120, 0.3]]
    : [[R * 0.9, 34 * rough], [R * 0.3, 15 * rough], [700, 6 * rough], [180, 1.6 * rough], [48, 0.45 * rough], [14, 0.1]];
  const bumps = OCT.map(([lambda, a]) => ({ v: unit(), k: (2 * Math.PI * R) / lambda, a, p: seedR() * 6, low: lambda >= 500 }));
  const amp = OCT.reduce((n, [, a]) => n + a, 0);
  const heightLow = (d: THREE.Vector3) => { let h = 0; for (const b of bumps) if (b.low) h += b.a * Math.sin(b.k * d.dot(b.v) + b.p); return h; };
  const heightFull = (d: THREE.Vector3) => { let h = 0; for (const b of bumps) h += b.a * Math.sin(b.k * d.dot(b.v) + b.p); return h; };
  // near you the ground has all its detail; it eases into the smooth far globe at the patch's rim
  const patchC = new THREE.Vector3(0, 0, 0); let PATCH = 0;
  const height = (d: THREE.Vector3) => {
    const lo = heightLow(d);
    if (!PATCH) return lo;
    const r = d.angleTo(patchC) * R / PATCH;
    if (r >= 1) return lo;
    const k = r < 0.6 ? 1 : 1 - (r - 0.6) / 0.4;
    return lo + (heightFull(d) - lo) * k * k * (3 - 2 * k);
  };
  const surf = (d: THREE.Vector3) => R + height(d);
  const g0 = css(w.ground[0]), g1 = css(w.ground[1]), det = css(w.detail), c1 = css(w.color), c2 = css(w.color2);
  const ice = new THREE.Color('#EEF6FF');
  const icy = w.features.includes('ice');
  const colorAt = (d: THREE.Vector3, hgt: number, out: THREE.Color, jitter: number) => {
    const lat = Math.asin(Math.max(-1, Math.min(1, d.y)));
    if (w.gas) {
      const band = Math.sin(lat * 14 + Math.sin(Math.atan2(d.x, d.z) * 3 + lat * 5) * 0.6);
      out.copy(c1).lerp(c2, ((band + 1) / 2) * 0.8);
      if (Math.abs(Math.sin(lat * 31)) > 0.93) out.lerp(det, 0.5);
    } else {
      out.copy(g1).lerp(g0, Math.min(1, Math.max(0, (hgt / (amp || 1) + 1) / 2 + jitter)));
      const pole = Math.abs(lat) / (Math.PI / 2);
      if (icy || pole > 0.85) out.lerp(ice, Math.max(0, Math.min(1, (pole - (icy ? 0.6 : 0.85)) * 3)));
    }
    return out;
  };
  const tmp = new THREE.Vector3(), col = new THREE.Color();

  // ---- the globe (low detail, seen from afar) — hides itself under the detailed patch -------------
  const patchU = { uPatch: { value: new THREE.Vector3(0, 1, 0) }, uCos: { value: 2 } };
  // shafts dug into plots are real holes: the ground (and the plot colours) skip these lat/lon squares
  const MAXPITS = 8;
  const pitU = { uPits: { value: Array.from({ length: MAXPITS }, () => new THREE.Vector4(9, 9, 9, 9)) }, uPitN: { value: 0 } };
  const pitCut = <T extends THREE.Material>(m: T): T => {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.uPits = pitU.uPits; sh.uniforms.uPitN = pitU.uPitN;
      if (!sh.vertexShader.includes('varying vec3 vDirW;')) {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirW;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirW = normalize(position);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirW;');
      }
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform vec4 uPits[${MAXPITS}];\nuniform int uPitN;`)
        .replace('void main() {', `void main() {\n  { vec3 dd = normalize(vDirW); float la = asin(clamp(dd.y, -1.0, 1.0)); float lo = atan(dd.x, dd.z);\n    for (int i = 0; i < ${MAXPITS}; i++) { if (i >= uPitN) break; vec4 q = uPits[i]; if (la > q.x && la < q.y && lo > q.z && lo < q.w) discard; } }`);
    };
    m.customProgramCacheKey = () => 'pitcut';
    return m;
  };
  const groundMat = (offset: number) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !w.gas, roughness: w.gas ? 0.7 : 0.95, metalness: 0, polygonOffset: offset !== 0, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
    return track(m);
  };
  const globeMat = groundMat(0);
  globeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uPatch = patchU.uPatch; sh.uniforms.uCos = patchU.uCos;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirW = normalize(position);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirW;\nuniform vec3 uPatch;\nuniform float uCos;')
      .replace('void main() {', 'void main() {\n  if (dot(normalize(vDirW), uPatch) > uCos) discard;');
  };
  {
    const seg = tier === 0 ? 128 : 176;
    const geo = track(new THREE.SphereGeometry(R, seg, Math.round(seg * 0.68)));
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i).normalize();
      const hgt = heightLow(tmp);
      colorAt(tmp, hgt, col, (seedR() - 0.5) * 0.1);
      tmp.multiplyScalar(R + hgt - 0.3); // a hair low, so the detailed patch always sits on top
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
      colors.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.deleteAttribute('normal');
    scene.add(new THREE.Mesh(geo, globeMat));
  }

  // ---- the detailed ground around you: a round patch rebuilt as you go ----------------------------
  PATCH = Math.min(R * 0.9, 260); // radius in metres
  const RINGS = tier === 0 ? 46 : 64, SEGS = tier === 0 ? 96 : 140;
  const patchGeo = track(new THREE.BufferGeometry());
  {
    const n = 1 + RINGS * SEGS;
    patchGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    patchGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx: number[] = [];
    const at = (ring: number, s: number) => (ring === 0 ? 0 : 1 + (ring - 1) * SEGS + (s % SEGS));
    for (let s = 0; s < SEGS; s++) idx.push(0, at(1, s), at(1, s + 1));
    for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEGS; s++) { const a = at(r, s), b = at(r, s + 1), c = at(r + 1, s), d = at(r + 1, s + 1); idx.push(a, c, b, b, c, d); }
    patchGeo.setIndex(idx);
  }
  const patch = new THREE.Mesh(patchGeo, pitCut(groundMat(-1)));
  patch.frustumCulled = false;
  scene.add(patch);

  // decorations that live on the patch, placed from a world-fixed hash so they never shuffle
  type Kind = { geo: THREE.BufferGeometry; mat: THREE.Material; p: number; scale(r: () => number): THREE.Vector3; sink: number; lift?: number };
  const kinds: Kind[] = [];
  if (!w.gas) {
    kinds.push({ geo: new THREE.DodecahedronGeometry(1, 0), mat: new THREE.MeshStandardMaterial({ color: g1, flatShading: true, roughness: 1 }), p: 0.2, scale: (r) => new THREE.Vector3(0.4 + r() * 1.5, 0.3 + r() * 0.9, 0.4 + r() * 1.5), sink: 0.25 });
    if (w.features.includes('crystals')) kinds.push({ geo: new THREE.OctahedronGeometry(1, 0), mat: new THREE.MeshStandardMaterial({ color: det, emissive: det, emissiveIntensity: 0.6, flatShading: true, roughness: 0.3 }), p: 0.08, scale: (r) => { const s = 0.4 + r() * 0.8; return new THREE.Vector3(s * 0.5, s * 2.2, s * 0.5); }, sink: 0 });
    if (icy) kinds.push({ geo: new THREE.ConeGeometry(0.6, 3, 5), mat: new THREE.MeshStandardMaterial({ color: '#DDF2FF', emissive: '#7FC8FF', emissiveIntensity: 0.25, flatShading: true, roughness: 0.2 }), p: 0.09, scale: (r) => new THREE.Vector3(1, 0.5 + r(), 1), sink: 0 });
    if (w.features.includes('mesas')) kinds.push({ geo: new THREE.CylinderGeometry(3, 4, 4, 7), mat: new THREE.MeshStandardMaterial({ color: g0, flatShading: true, roughness: 1 }), p: 0.012, scale: (r) => { const s = 0.7 + r() * 1.3; return new THREE.Vector3(s, s * (0.6 + r()), s); }, sink: 0.6 });
    if (w.features.includes('volcano')) kinds.push({ geo: new THREE.ConeGeometry(9, 9, 9, 1, true), mat: new THREE.MeshStandardMaterial({ color: g1, flatShading: true, roughness: 1, side: THREE.DoubleSide }), p: 0.003, scale: (r) => new THREE.Vector3(1, 0.8 + r() * 0.6, 1), sink: 0.5 });
    if (w.features.includes('craters')) kinds.push({ geo: new THREE.TorusGeometry(2.2, 0.35, 5, 14).rotateX(Math.PI / 2), mat: new THREE.MeshStandardMaterial({ color: g1, flatShading: true, roughness: 1 }), p: 0.05, scale: (r) => { const s = 0.6 + r() * 2.2; return new THREE.Vector3(s, 0.7, s); }, sink: 0.15 });
  } else {
    kinds.push({ geo: new THREE.IcosahedronGeometry(1.4, 1), mat: new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, roughness: 1, flatShading: true }), p: 0.06, scale: (r) => { const s = 1 + r() * 2; return new THREE.Vector3(s * 1.6, s * 0.6, s); }, sink: 0, lift: 2 });
  }
  const CAP = tier === 0 ? 450 : 1100;
  const decor = kinds.map((k) => { const m = new THREE.InstancedMesh(track(k.geo), track(k.mat), CAP); m.count = 0; m.frustumCulled = false; scene.add(m); return m; });
  const spawn = V(dirOf(4, 6));
  const nearSpawn = (d: THREE.Vector3) => d.angleTo(spawn) * R < 10;

  // plot lines near you (rebuilt with the patch) and over the whole globe (seen from afar)
  const hStep = (2 * LAT_MAX) / rows, cols = colsFor(rows), wStep = 360 / cols;
  const SECTOR = Math.max(1, Math.round(rows / 40));
  const NEAR_MAX = 90000; // line vertices; one fixed GPU buffer, refilled on each rebuild (no leaks)
  const nearLineGeo = track(new THREE.BufferGeometry());
  const nearLineAttr = new THREE.BufferAttribute(new Float32Array(NEAR_MAX * 3), 3); nearLineAttr.setUsage(THREE.DynamicDrawUsage);
  nearLineGeo.setAttribute('position', nearLineAttr); nearLineGeo.setDrawRange(0, 0);
  const lineMat = track(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: w.gas ? 0.24 : 0.2, depthWrite: false }));
  const nearLines = new THREE.LineSegments(nearLineGeo, lineMat); nearLines.frustumCulled = false; scene.add(nearLines);
  const farLines = (() => {
    const pts: number[] = [];
    const push = (lat: number, lon: number) => { const d = V(dirOf(lat, lon)); d.multiplyScalar(R + heightLow(d) + 2); pts.push(d.x, d.y, d.z); };
    // from afar, the grid is drawn in sectors (SECTOR x SECTOR plots)
    const st = 1.5;
    for (let gy = 0; gy <= rows; gy += SECTOR) { const lat = -LAT_MAX + gy * hStep; for (let lon = -180; lon < 180; lon += st) { push(lat, lon); push(lat, lon + st); } }
    for (let gx = 0; gx < cols; gx += SECTOR) { const lon = -180 + gx * wStep; for (let lat = -LAT_MAX; lat < LAT_MAX - 1e-6; lat += st) { push(lat, lon); push(Math.min(LAT_MAX, lat + st), lon); } }
    const g = track(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = track(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false }));
    const l = new THREE.LineSegments(g, m); scene.add(l); return l;
  })();

  let updatePitsRef: (() => void) | null = null;
  const buildPatch = (c: THREE.Vector3) => {
    patchC.copy(c);
    const e1 = new THREE.Vector3().crossVectors(Math.abs(c.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP, c).normalize();
    const e2 = new THREE.Vector3().crossVectors(c, e1).normalize();
    const pos = patchGeo.attributes.position as THREE.BufferAttribute, cl = patchGeo.attributes.color as THREE.BufferAttribute;
    const setV = (i: number, d: THREE.Vector3) => { const h = height(d); colorAt(d, h, col, ((hash(Math.round(d.x * 4000), Math.round(d.y * 4000), Math.round(d.z * 4000)) % 1000) / 1000 - 0.5) * 0.1); tmp.copy(d).multiplyScalar(R + h); pos.setXYZ(i, tmp.x, tmp.y, tmp.z); cl.setXYZ(i, col.r, col.g, col.b); };
    setV(0, c);
    const d = new THREE.Vector3();
    for (let r = 1; r <= RINGS; r++) {
      const rad = PATCH * Math.pow(r / RINGS, 1.35); // denser near the middle
      for (let s = 0; s < SEGS; s++) {
        const a = (s / SEGS) * Math.PI * 2;
        d.copy(c).addScaledVector(e1, (Math.cos(a) * rad) / R).addScaledVector(e2, (Math.sin(a) * rad) / R).normalize();
        setV(1 + (r - 1) * SEGS + s, d);
      }
    }
    pos.needsUpdate = true; cl.needsUpdate = true; patchGeo.computeBoundingSphere();
    patchU.uPatch.value.copy(c);
    patchU.uCos.value = Math.cos((PATCH * 0.985) / R);
    if (typeof updatePitsRef === 'function') updatePitsRef();
    // decorations: a world-fixed lattice of ~6-unit cells around the centre
    const step = 6 / R; // radians
    const latC = Math.asin(c.y), lonC = Math.atan2(c.x, c.z);
    const span = PATCH / R;
    const counts = kinds.map(() => 0);
    const o3 = new THREE.Object3D();
    const i0 = Math.floor((latC - span) / step), i1 = Math.ceil((latC + span) / step);
    for (let i = i0; i <= i1; i++) {
      const lat = i * step; if (Math.abs(lat) > Math.PI / 2 - 0.01) continue;
      const lstep = step / Math.max(0.05, Math.cos(lat));
      const lspan = Math.min(Math.PI, span / Math.max(0.05, Math.cos(lat)));
      const j0 = Math.floor((lonC - lspan) / lstep), j1 = Math.ceil((lonC + lspan) / lstep);
      for (let j = j0; j <= j1; j++) {
        const jj = ((j % Math.round((2 * Math.PI) / lstep)) + Math.round((2 * Math.PI) / lstep)) % Math.round((2 * Math.PI) / lstep);
        const r = rng(hash(i, jj, o.seed));
        const roll = r();
        let acc = 0, k = -1;
        for (let q = 0; q < kinds.length; q++) { acc += kinds[q].p; if (roll < acc) { k = q; break; } }
        if (k < 0 || counts[k] >= CAP) continue;
        const la = lat + (r() - 0.5) * step, lo = j * lstep + (r() - 0.5) * lstep;
        d.set(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
        if (d.angleTo(c) * R > PATCH * 0.97 || nearSpawn(d)) continue;
        stand(o3, d, surf(d) - kinds[k].sink + (kinds[k].lift ?? 0), r() * 6.28); o3.scale.copy(kinds[k].scale(r)); o3.updateMatrix();
        decor[k].setMatrixAt(counts[k]++, o3.matrix);
      }
    }
    decor.forEach((m, k) => { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; });
    if (lastPlots) setPlots(lastPlots.plots, lastPlots.rarity); // their tiles follow the ground's new detail
    // plot lines across the patch
    const pts: number[] = [];
    const push = (dd: THREE.Vector3) => { if (pts.length >= NEAR_MAX * 3) return; tmp.copy(dd).multiplyScalar(surf(dd) + 0.12); pts.push(tmp.x, tmp.y, tmp.z); };
    const inside = (dd: THREE.Vector3) => dd.angleTo(c) * R < PATCH * 0.98;
    const segLen = (4 / R) / D; // ~4 m, in degrees
    const a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
    const latDeg = latC / D, lonDeg = lonC / D, spanDeg = span / D;
    for (let gy = 0; gy <= rows; gy++) {
      const lat = -LAT_MAX + gy * hStep; if (Math.abs(lat - latDeg) > spanDeg) continue;
      const lspan = Math.min(180, spanDeg / Math.max(0.05, Math.cos(lat * D)));
      for (let lon = lonDeg - lspan; lon < lonDeg + lspan; lon += segLen) { a0.set(...dirOf(lat, lon)); a1.set(...dirOf(lat, lon + segLen)); if (inside(a0) && inside(a1)) { push(a0); push(a1); } }
    }
    for (let gx = 0; gx < cols; gx++) {
      const lon = -180 + gx * wStep;
      const dl = ((lon - lonDeg + 540) % 360) - 180; if (Math.abs(dl) * Math.cos(latC) > spanDeg * 1.2 && Math.abs(latDeg) < 80) continue;
      for (let lat = Math.max(-LAT_MAX, latDeg - spanDeg); lat < Math.min(LAT_MAX, latDeg + spanDeg); lat += segLen) { a0.set(...dirOf(lat, lon)); a1.set(...dirOf(Math.min(LAT_MAX, lat + segLen), lon)); if (inside(a0) && inside(a1)) { push(a0); push(a1); } }
    }
    let n = Math.min(NEAR_MAX, pts.length / 3); n -= n % 2;
    (nearLineAttr.array as Float32Array).set(n * 3 < pts.length ? pts.slice(0, n * 3) : pts);
    nearLineAttr.needsUpdate = true; nearLineGeo.setDrawRange(0, n);
  };

  // ---- light, sky, atmosphere ------------------------------------------------------------------
  const SKY = Math.max(2000, R * 12);
  camera.far = SKY * 1.2; camera.updateProjectionMatrix();
  const sunDir = new THREE.Vector3(0.6, 0.55, 0.35).normalize();
  const sun = new THREE.DirectionalLight('#FFF6E4', w.dark ? 2.6 : 2.2); sun.position.copy(sunDir).multiplyScalar(R * 4); scene.add(sun);
  scene.add(new THREE.HemisphereLight(css(w.sky[1]), css(w.ground[1]), w.dark ? 0.55 : 0.95));
  scene.add(new THREE.AmbientLight('#ffffff', w.dark ? 0.25 : 0.2));
  const skyU = { top: { value: css(w.sky[0]) }, horizon: { value: css(w.sky[1]) }, up: { value: new THREE.Vector3(0, 1, 0) }, space: { value: 0 } };
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(SKY, 32, 16)), track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyU,
    vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}',
    fragmentShader: `#include <logdepthbuf_pars_fragment>
      uniform vec3 top; uniform vec3 horizon; uniform vec3 up; uniform float space; varying vec3 vd;
      void main(){
#include <logdepthbuf_fragment>
      float k = clamp(dot(normalize(vd), up), -0.2, 1.0); vec3 c = mix(horizon, top, pow(max(k,0.0), 0.6));
        c = mix(c, vec3(0.012,0.015,0.04), space); gl_FragColor = vec4(c, 1.0); }`,
  })));
  sky.renderOrder = -2; scene.add(sky);
  const starGeo = track(new THREE.BufferGeometry());
  const starPts = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i++) { const v = unit().multiplyScalar(SKY * 0.85); starPts.set([v.x, v.y, v.z], i * 3); }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPts, 3));
  const starMat = track(new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: w.dark ? 0.95 : 0.12, depthWrite: false }));
  const stars = new THREE.Points(starGeo, starMat); stars.renderOrder = -1; scene.add(stars);
  const sunSize = (w.id === 'mercury' ? 180 : w.id === 'venus' ? 120 : ['jupiter', 'saturn'].includes(w.id) ? 40 : ['uranus', 'neptune', 'pluto'].includes(w.id) ? 18 : 80) * (SKY / 2000);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.8)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return track(new THREE.CanvasTexture(c)); })();
  const sunSprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false })));
  sunSprite.scale.setScalar(sunSize); sunSprite.position.copy(sunDir).multiplyScalar(SKY * 0.78); scene.add(sunSprite);
  if (w.id === 'moon') {
    const er = SKY * 0.035;
    const earth = new THREE.Mesh(track(new THREE.SphereGeometry(er, 48, 32)), track(new THREE.MeshStandardMaterial({ color: '#3EA0DA', roughness: 0.6, emissive: '#0b2a4a', emissiveIntensity: 0.4 })));
    earth.position.set(-0.28, 0.24, -0.5).normalize().multiplyScalar(SKY * 0.6); scene.add(earth);
    const land = new THREE.Mesh(track(new THREE.IcosahedronGeometry(er * 1.01, 2)), track(new THREE.MeshStandardMaterial({ color: '#4FA552', flatShading: true, transparent: true, opacity: 0.85 })));
    land.position.copy(earth.position); land.scale.set(1, 0.7, 0.6); scene.add(land);
  }
  if (w.ring || w.id === 'saturn') {
    const rg = track(new THREE.RingGeometry(R * 1.5, R * 2.7, 160, 6));
    const rc = css(w.ring ?? '#D9C58F');
    const ringCols = new Float32Array(rg.attributes.position.count * 4);
    for (let i = 0; i < rg.attributes.position.count; i++) {
      const x = rg.attributes.position.getX(i), y = rg.attributes.position.getY(i), dd = (Math.hypot(x, y) - R * 1.5) / (R * 1.2);
      ringCols.set([rc.r, rc.g, rc.b, 0.25 + 0.45 * Math.abs(Math.sin(dd * 23)) * (dd > 0.55 && dd < 0.6 ? 0.1 : 1)], i * 4);
    }
    rg.setAttribute('color', new THREE.BufferAttribute(ringCols, 4));
    const ring = new THREE.Mesh(rg, track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
    ring.rotation.x = Math.PI / 2 - 0.35; scene.add(ring);
  }
  if (w.id === 'jupiter') for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(track(new THREE.SphereGeometry(R * (0.05 + i * 0.015), 24, 16)), track(new THREE.MeshStandardMaterial({ color: ['#E9D27A', '#D8CFC0', '#9A8F80', '#7C7468'][i], roughness: 0.9 })));
    m.position.set(...dirOf(12 + i * 8, 30 + i * 75)).multiplyScalar(R * (3 + i)); scene.add(m);
  }
  const atmMat = w.dark ? null : track(new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { c: { value: css(w.sky[1]) }, k: { value: 1 } },
    vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); v = normalize(-mv.xyz); gl_Position = projectionMatrix*mv;\n#include <logdepthbuf_vertex>\n}',
    fragmentShader: '#include <logdepthbuf_pars_fragment>\nuniform vec3 c; uniform float k; varying vec3 n; varying vec3 v; void main(){\n#include <logdepthbuf_fragment>\n float f = pow(1.0 - abs(dot(n, v)), 2.5); gl_FragColor = vec4(c, f * 0.9 * k); }',
  }));
  if (atmMat) scene.add(new THREE.Mesh(track(new THREE.SphereGeometry(R * 1.12, 64, 32)), atmMat));
  const fog = w.dark ? null : new THREE.Fog(css(w.sky[1]), 80, 360);

  /** A curved tile over a cell (or part of one), lifted `lift` off the ground. */
  const tileGeo = (c: Cell, lift: number, inset = 0, N = 6) => {
    const b = cellBounds(c, rows);
    const dl = (b.lat1 - b.lat0) * inset, dn = (b.lon1 - b.lon0) * inset;
    const verts: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const d = V(dirOf(b.lat0 + dl + ((b.lat1 - b.lat0 - 2 * dl) * i) / N, b.lon0 + dn + ((b.lon1 - b.lon0 - 2 * dn) * j) / N));
      d.multiplyScalar(surf(d) + lift); verts.push(d.x, d.y, d.z);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j; idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1); }
    return { verts, idx, N };
  };

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
    stand(rk, spawn, surf(spawn) - 0.2, 0.4); scene.add(rk);
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6)), white); pole.position.y = 1.7; flag.add(pole);
    const cloth = new THREE.Mesh(track(new THREE.PlaneGeometry(1.6, 1)), track(new THREE.MeshStandardMaterial({ color: accent, side: THREE.DoubleSide }))); cloth.position.set(0.8, 2.9, 0); flag.add(cloth);
    const fd = spawn.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), 4 / R).normalize();
    stand(flag, fd, surf(fd)); scene.add(flag);
    if (o.isHome) {
      const hd = spawn.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -7 / R).normalize();
      const dome = new THREE.Group();
      dome.add(new THREE.Mesh(track(new THREE.SphereGeometry(4.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), track(new THREE.MeshStandardMaterial({ color: '#BFE3FF', transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide }))));
      dome.add(new THREE.Mesh(track(new THREE.CylinderGeometry(4.4, 4.4, 0.2, 32)), track(new THREE.MeshStandardMaterial({ color: '#4FA552' }))));
      for (let i = 0; i < 3; i++) { const tr = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.9 + i * 0.2, 0)), track(new THREE.MeshStandardMaterial({ color: '#2F7D3A', flatShading: true }))); tr.position.set(-1.8 + i * 1.8, 1.4, (i % 2) - 0.5); dome.add(tr); }
      stand(dome, hd, surf(hd) - 0.1); scene.add(dome);
    }
  }
  // a beacon over the landing site you can spot from orbit
  const beaconMat = track(new THREE.SpriteMaterial({ map: glowTex, color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const beacon = new THREE.Sprite(beaconMat); beacon.position.copy(spawn).multiplyScalar(R + 4); scene.add(beacon);

  // ---- samples -----------------------------------------------------------------------------------
  type Sample = { d: THREE.Vector3; m: THREE.Mesh; glow: THREE.Sprite; got: boolean };
  const samples: Sample[] = [];
  {
    const sg = track(new THREE.OctahedronGeometry(0.45, 0));
    const sm = track(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: det, emissiveIntensity: 1.2, flatShading: true }));
    const gm = track(new THREE.SpriteMaterial({ map: glowTex, color: det, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (let i = 0; i < o.samples; i++) {
      const a = (i / o.samples) * Math.PI * 2 + seedR(), dist = (10 + seedR() * 16) / R;
      const tangent = new THREE.Vector3().crossVectors(spawn, UP).normalize().applyAxisAngle(spawn, a);
      const d = spawn.clone().applyAxisAngle(new THREE.Vector3().crossVectors(spawn, tangent).normalize(), dist).normalize();
      const m = new THREE.Mesh(sg, sm); const glow = new THREE.Sprite(gm); glow.scale.setScalar(3);
      scene.add(m, glow); samples.push({ d, m, glow, got: false });
    }
  }

  // ---- plots (with a small pool of name labels for the ones near you) ------------------------------
  const plotGroup = new THREE.Group(); scene.add(plotGroup);
  const baseGroup = new THREE.Group(); scene.add(baseGroup); // bases: shared geometry, so just dropped on rebuild
  const plotMat = pitCut(track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
  const flagGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5)); const clothGeo = track(new THREE.PlaneGeometry(1.3, 0.8));
  const poleMat = track(new THREE.MeshStandardMaterial({ color: '#E6EBF5' }));
  const clothMat = track(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }));
  let plotGeo: THREE.BufferGeometry | null = null;
  let lastPlots: { plots: PlanetPlot[]; rarity: Record<string, { color: string; rank: number }> } | null = null;
  let plotList: { p: PlanetPlot; d: THREE.Vector3 }[] = [];
  const LABELS = 10;
  const labelPool: { s: THREE.Sprite | null; key: string }[] = Array.from({ length: LABELS }, () => ({ s: null, key: '' }));
  const clearPlots = () => {
    for (const c of [...plotGroup.children]) { plotGroup.remove(c); if (c instanceof THREE.InstancedMesh) c.dispose(); }
    plotGeo?.dispose(); plotGeo = null; plotList = []; beams = null;
    baseGroup.clear();
  };
  const beamGeo = track(new THREE.CylinderGeometry(0.35, 0.9, 70, 8, 1, true).translate(0, 35, 0));
  const beamMat = track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  let beams: THREE.InstancedMesh | null = null;
  // ---- shafts: a 4 m square hole in the middle of a plot, walls banded by layer, deeper as you dig ----
  const SHAFT_M = 4;
  const LAYER_BANDS: [number, string][] = [[12, '#B9B2A6'], [60, '#7D7569'], [240, '#8A5A44'], [1000, '#4E3B4F'], [5000, '#7A2E2E'], [12000, '#C2410C'], [20000, '#FFB020']];
  /** how deep it looks (metres): true to 10 m, then squeezed so the core still looks bottomless */
  const vis = (m: number) => (m <= 10 ? m : 10 + 7 * Math.log(m / 10));
  const unvis = (v: number) => (v <= 10 ? v : 10 * Math.exp((v - 10) / 7));
  const bandColor = (m: number) => LAYER_BANDS.find(([to]) => m < to)?.[1] ?? LAYER_BANDS[LAYER_BANDS.length - 1][1];
  const pitGroup = new THREE.Group(); scene.add(pitGroup);
  const pitWallMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, flatShading: true }));
  const pitRimMat = track(new THREE.MeshStandardMaterial({ color: '#3A3F4C', roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }));
  const coreMat = track(new THREE.MeshStandardMaterial({ color: '#FFB020', emissive: '#FF7A1A', emissiveIntensity: 2.2, side: THREE.DoubleSide }));
  const coreBeamMat = track(new THREE.MeshBasicMaterial({ color: '#FF8A2A', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  type Pit = { c: Cell; depth: number; cored: boolean; obj: THREE.Group | null; built: string };
  const pits = new Map<string, Pit>();
  const shaftBox = (c: Cell) => {
    const b = cellBounds(c, rows);
    const la = ((b.lat0 + b.lat1) / 2) * D, lo = ((b.lon0 + b.lon1) / 2) * D;
    const h = SHAFT_M / 2 / R, hl = h / Math.max(0.05, Math.cos(la));
    return { la, lo, h, hl };
  };
  const dirLL = (la: number, lo: number) => new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
  /** where a dug plot's flag goes (off the hole, near a corner) */
  const flagSpot = (c: Cell) => { const { la, lo, h, hl } = shaftBox(c); return dirLL(la + h * 1.6, lo + hl * 1.6); };
  const buildPit = (pt: Pit) => {
    const { la, lo, h, hl } = shaftBox(pt.c);
    const corners = [dirLL(la - h, lo - hl), dirLL(la - h, lo + hl), dirLL(la + h, lo + hl), dirLL(la + h, lo - hl)];
    const rim = corners.map((d) => surf(d));
    const V = vis(pt.depth);
    const pos: number[] = [], cs: number[] = [];
    const cc = new THREE.Color();
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color) => {
      for (const v of [a, b, c, a, c, d]) { pos.push(v.x, v.y, v.z); cs.push(color.r, color.g, color.b); }
    };
    // walls, a band per stretch of layer (darker the deeper)
    const cuts = [0, ...LAYER_BANDS.map(([to]) => vis(to)).filter((v) => v < V), V];
    for (let k = 0; k < 4; k++) {
      const d0 = corners[k], d1 = corners[(k + 1) % 4], r0 = rim[k], r1 = rim[(k + 1) % 4];
      for (let i = 0; i < cuts.length - 1; i++) {
        const v0 = cuts[i], v1 = cuts[i + 1]; if (v1 - v0 < 1e-3) continue;
        cc.set(bandColor(unvis((v0 + v1) / 2))).multiplyScalar(Math.max(0.55, 1.15 - v0 / 80) * (k % 2 ? 0.85 : 1.05));
        quad(d0.clone().multiplyScalar(r0 - v0), d1.clone().multiplyScalar(r1 - v0), d1.clone().multiplyScalar(r1 - v1), d0.clone().multiplyScalar(r0 - v1), cc);
      }
    }
    const g = new THREE.Group();
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3)); wg.computeVertexNormals();
    g.add(new THREE.Mesh(wg, pitWallMat));
    // the floor: what you're digging into now, glowing at the core
    const fl = corners.map((d, k) => d.clone().multiplyScalar(rim[k] - V));
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([fl[0], fl[1], fl[2], fl[0], fl[2], fl[3]].flatMap((v) => [v.x, v.y, v.z]), 3)); fg.computeVertexNormals();
    g.add(new THREE.Mesh(fg, pt.cored ? coreMat : new THREE.MeshStandardMaterial({ color: new THREE.Color(bandColor(pt.depth)).multiplyScalar(Math.max(0.3, 1 - V / 70)), side: THREE.DoubleSide, roughness: 1 })));
    // a lip round the top
    const lip: number[] = [];
    const out = [dirLL(la - h * 1.22, lo - hl * 1.22), dirLL(la - h * 1.22, lo + hl * 1.22), dirLL(la + h * 1.22, lo + hl * 1.22), dirLL(la + h * 1.22, lo - hl * 1.22)];
    for (let k = 0; k < 4; k++) {
      const a = corners[k].clone().multiplyScalar(rim[k] + 0.06), b = corners[(k + 1) % 4].clone().multiplyScalar(rim[(k + 1) % 4] + 0.06);
      const c = out[(k + 1) % 4].clone().multiplyScalar(surf(out[(k + 1) % 4]) + 0.06), d = out[k].clone().multiplyScalar(surf(out[k]) + 0.06);
      for (const v of [a, b, c, a, c, d]) lip.push(v.x, v.y, v.z);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lip, 3)); lg.computeVertexNormals();
    g.add(new THREE.Mesh(lg, pitRimMat));
    if (pt.cored) {
      // the core's light shines up out of the shaft, for everyone to see
      const beam = new THREE.Mesh(beamGeo, coreBeamMat);
      const mid = dirLL(la, lo); stand(beam, mid, surf(mid) - V); beam.scale.set(2.2, 1.6, 2.2);
      g.add(beam);
    }
    return g;
  };
  const dropPit = (pt: Pit) => {
    if (!pt.obj) return;
    pitGroup.remove(pt.obj);
    pt.obj.traverse((x) => { if (x instanceof THREE.Mesh && x.geometry !== beamGeo) { x.geometry.dispose(); if (x.material !== pitWallMat && x.material !== pitRimMat && x.material !== coreMat && x.material !== coreBeamMat) (x.material as THREE.Material).dispose(); } });
    pt.obj = null; pt.built = '';
  };
  /** the nearest few shafts are cut into the ground and drawn */
  const updatePits = () => {
    const centre = patchC.lengthSq() ? patchC : P.d;
    const list = [...pits.values()].map((pt) => ({ pt, a: V(cellCenterDir(pt.c, rows)).angleTo(centre) * R })).filter((x) => x.a < PATCH * 0.9).sort((a, b) => a.a - b.a).slice(0, MAXPITS);
    const keep = new Set(list.map((x) => x.pt));
    for (const pt of pits.values()) if (!keep.has(pt)) dropPit(pt);
    list.forEach(({ pt }, i) => {
      const { la, lo, h, hl } = shaftBox(pt.c);
      pitU.uPits.value[i].set(la - h, la + h, lo - hl, lo + hl);
      const sig = `${pt.depth.toFixed(2)}:${pt.cored}:${patchC.x.toFixed(4)}`;
      if (pt.built !== sig) { dropPit(pt); pt.obj = buildPit(pt); pt.built = sig; pitGroup.add(pt.obj); }
    });
    pitU.uPitN.value = list.length;
  };
  updatePitsRef = updatePits;
  const setShaft = (gx: number, gy: number, depth: number, cored: boolean) => {
    const k = `${gx}:${gy}`;
    const pt = pits.get(k);
    if (depth <= 0.05) { if (pt) { dropPit(pt); pits.delete(k); updatePits(); } return; }
    if (pt) { pt.depth = depth; pt.cored = cored; } else pits.set(k, { c: { gx, gy }, depth, cored, obj: null, built: '' });
    updatePits();
  };

  const setPlots = (plots: PlanetPlot[], rarity: Record<string, { color: string; rank: number }> = {}) => {
    lastPlots = { plots, rarity };
    clearPlots();
    // shafts in the plots you can see
    const seen = new Set<string>();
    for (const p of plots) if (p.shaft && p.shaft.depth > 0.05) {
      const k = `${p.gx}:${p.gy}`; seen.add(k);
      const pt = pits.get(k);
      if (pt) { pt.depth = Math.max(pt.depth, p.shaft.depth); pt.cored = pt.cored || p.shaft.cored; } else pits.set(k, { c: { gx: p.gx, gy: p.gy }, depth: p.shaft.depth, cored: p.shaft.cored, obj: null, built: '' });
    }
    updatePits();
    plotList = plots.map((p) => ({ p, d: V(cellCenterDir(p, rows)) }));
    for (const l of labelPool) l.key = '__stale';
    if (!plots.length) return;
    const N = plots.length > 3000 ? 3 : 6;
    const verts: number[] = [], cs: number[] = [], idx: number[] = [];
    const cloths = new THREE.InstancedMesh(clothGeo, clothMat, plots.length);
    const poles = new THREE.InstancedMesh(flagGeo, poleMat, plots.length);
    const o3 = new THREE.Object3D();
    plots.forEach((p, i) => {
      const c = css(p.owner.accent || '#8B5CFF');
      if (p.mine) c.lerp(new THREE.Color('#ffffff'), 0.15);
      const t = tileGeo(p, 0.18, 0.04, N);
      const base = verts.length / 3;
      verts.push(...t.verts); for (let k = 0; k < t.verts.length / 3; k++) cs.push(c.r, c.g, c.b); for (const x of t.idx) idx.push(x + base);
      const d = p.shaft ? flagSpot(p) : plotList[i].d;
      stand(o3, d, surf(d) + 1.2); o3.updateMatrix(); poles.setMatrixAt(i, o3.matrix);
      stand(o3, d, surf(d) + 2.1); o3.translateX(0.65); o3.updateMatrix(); cloths.setMatrixAt(i, o3.matrix); cloths.setColorAt(i, css(rarity[p.rarity]?.color ?? '#ffffff'));
    });
    // bases on the plots round you
    const east = new THREE.Vector3(), north = new THREE.Vector3(), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
    plots.forEach((p, i) => {
      const lay = p.base?.layout; if (!lay?.length) return;
      if (plotList[i].d.angleTo(patchC.lengthSq() ? patchC : P.d) * R > 700) return;
      const b = cellBounds(p, rows);
      // metres from the south-west corner: a merged base's modules just carry on into the plots beyond
      for (const m of lay) {
        const d = V(dirOf(b.lat0 + (m.y / PLOT_M) * (b.lat1 - b.lat0), b.lon0 + (m.x / PLOT_M) * (b.lon1 - b.lon0)));
        east.crossVectors(UP, d); if (east.lengthSq() < 1e-8) east.set(1, 0, 0); east.normalize();
        north.crossVectors(east, d).negate();
        const obj = moduleModel(m.k, m.c, { c2: m.c2, m: m.m, v: m.v });
        obj.scale.set(m.sx ?? 1, m.sy ?? 1, m.sz ?? 1);
        basis.makeBasis(east, d, north.clone().negate()); q.setFromRotationMatrix(basis);
        obj.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(UP, -((m.a ?? (m.r ?? 0) * 90) * Math.PI) / 180));
        obj.position.copy(d).multiplyScalar(surf(d) - 0.05 + (m.z ?? 0));
        baseGroup.add(obj);
      }
    });
    const shiny = plots.map((p, i) => ({ p, i })).filter((x) => (rarity[x.p.rarity]?.rank ?? 0) >= 3);
    if (shiny.length) {
      beams = new THREE.InstancedMesh(beamGeo, beamMat, shiny.length); beams.frustumCulled = false;
      shiny.forEach((x, k) => { stand(o3, plotList[x.i].d, surf(plotList[x.i].d)); o3.scale.set(1, 1 + (rarity[x.p.rarity].rank - 3) * 0.6, 1); o3.updateMatrix(); beams!.setMatrixAt(k, o3.matrix); beams!.setColorAt(k, css(rarity[x.p.rarity].color)); });
      plotGroup.add(beams);
    }
    plotGeo = new THREE.BufferGeometry();
    plotGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    plotGeo.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    plotGeo.setIndex(idx);
    plotGroup.add(new THREE.Mesh(plotGeo, plotMat), poles, cloths);
  };
  const refreshLabels = () => {
    const near = plotList.map((x) => ({ x, a: x.d.angleTo(P.d) * R })).filter((q) => q.a < 40).sort((a, b) => a.a - b.a).slice(0, LABELS);
    const want = new Map(near.map((q) => [cellKey(q.x.p) + (q.x.p.name ?? ''), q.x]));
    for (const l of labelPool) if (l.s && !want.has(l.key)) { scene.remove(l.s); disposeSprite(l.s); l.s = null; l.key = ''; }
    const have = new Set(labelPool.map((l) => l.key));
    for (const [k, x] of want) {
      if (have.has(k)) continue;
      const slot = labelPool.find((l) => !l.s); if (!slot) break;
      const s = textSprite(x.p.name ? x.p.name : x.p.mine ? 'My plot' : `@${x.p.owner.username}`, x.p.mine ? '#FFE36B' : '#ffffff', 0.5);
      s.position.copy(x.d).multiplyScalar(surf(x.d) + 2.9); scene.add(s); slot.s = s; slot.key = k;
    }
  };
  // the plot you're standing on (or picked from above)
  const hiMat = pitCut(track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })));
  const hiLine = track(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
  let hi: THREE.Group | null = null; let hiKey = '';
  const highlight = (c: Cell | null) => {
    const k = c ? cellKey(c) : '';
    if (k === hiKey) return; hiKey = k;
    if (hi) { scene.remove(hi); hi.traverse((x) => { if (x instanceof THREE.Mesh || x instanceof THREE.LineLoop) x.geometry.dispose(); }); hi = null; }
    if (!c) return;
    const t = tileGeo(c, 0.26, 0, 8);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(t.verts, 3)); gg.setIndex(t.idx);
    const N = t.N + 1, ring: number[] = [];
    const at = (i: number, j: number) => ring.push(t.verts[(i * N + j) * 3], t.verts[(i * N + j) * 3 + 1], t.verts[(i * N + j) * 3 + 2]);
    for (let j = 0; j < N; j++) at(0, j); for (let i = 0; i < N; i++) at(i, N - 1); for (let j = N - 1; j >= 0; j--) at(N - 1, j); for (let i = N - 1; i >= 0; i--) at(i, 0);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    hi = new THREE.Group(); hi.add(new THREE.Mesh(gg, hiMat), new THREE.LineLoop(lg, hiLine)); scene.add(hi);
  };

  // ---- from afar: where the plots are --------------------------------------------------------------
  const secGeo = track(new THREE.BufferGeometry());
  const secMat = track(new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, map: glowTex, blending: THREE.AdditiveBlending }));
  const secPts = new THREE.Points(secGeo, secMat); secPts.frustumCulled = false; secPts.renderOrder = 3; scene.add(secPts);
  const setSectors = (list: [number, number, number, boolean][], size: number) => {
    const pos: number[] = [], cs: number[] = [];
    const max = Math.max(1, ...list.map((x) => x[2]));
    for (const [sx, sy, n, mine] of list) {
      const lat = -LAT_MAX + (sy + 0.5) * size * hStep, lon = -180 + (sx + 0.5) * size * wStep;
      if (lat > LAT_MAX) continue;
      const d = V(dirOf(Math.min(LAT_MAX, lat), lon)); d.multiplyScalar(R + heightLow(d) + 4); pos.push(d.x, d.y, d.z);
      const c = mine ? new THREE.Color('#FFE36B') : new THREE.Color('#B69CFF').lerp(new THREE.Color('#ffffff'), Math.min(1, n / max));
      cs.push(c.r, c.g, c.b);
    }
    secGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    secGeo.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
  };

  // ---- meteor showers -----------------------------------------------------------------------------
  type Met = { i: number; d: THREE.Vector3; golden: boolean; rock: THREE.Mesh; glow: THREE.Sprite; trail: THREE.Sprite; fall: number; asked: number };
  const mets = new Map<number, Met>();
  let metKey = '';
  const metGeo = track(new THREE.DodecahedronGeometry(0.75, 0));
  const metMat = track(new THREE.MeshStandardMaterial({ color: '#5A4A44', emissive: '#FF7A3D', emissiveIntensity: 0.55, flatShading: true, roughness: 0.8 }));
  const goldMat = track(new THREE.MeshStandardMaterial({ color: '#FFD84D', emissive: '#FFB13D', emissiveIntensity: 0.9, flatShading: true, roughness: 0.3, metalness: 0.4 }));
  const dropMet = (m: Met) => { scene.remove(m.rock, m.glow, m.trail); m.glow.material.dispose(); m.trail.material.dispose(); mets.delete(m.i); };
  const setMeteors = (key: string, list: { i: number; d: number[]; golden: boolean; taken: boolean }[]) => {
    const fresh = key !== metKey; metKey = key;
    if (fresh) for (const m of [...mets.values()]) dropMet(m);
    for (const x of list) {
      const have = mets.get(x.i);
      if (x.taken) { if (have) dropMet(have); continue; }
      if (have) continue;
      const d = vec(x.d); if (!d) continue;
      const rock = new THREE.Mesh(metGeo, x.golden ? goldMat : metMat);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: x.golden ? '#FFE36B' : '#FF9A5C', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(x.golden ? 5 : 3.6);
      const trail = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFB13D', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      trail.scale.set(2.2, 14, 1);
      scene.add(rock, glow, trail);
      mets.set(x.i, { i: x.i, d, golden: x.golden, rock, glow, trail, fall: fresh && !reduce ? 1 + Math.random() * 1.5 : 0, asked: 0 });
    }
  };
  const bursts: { s: THREE.Sprite; t: number }[] = [];
  const burst = (d: number[], color = '#FFE36B') => {
    const v = vec(d); if (!v) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(v).multiplyScalar(surf(v) + 1); scene.add(s); bursts.push({ s, t: 0 });
  };

  // ---- weather, and things to find ---------------------------------------------------------------
  type Find = { mark: FindMark; d: THREE.Vector3; obj: THREE.Object3D; glow: THREE.Sprite | null; asked: number; peek: number };
  const finds = new Map<string, Find>();
  const findGroup = new THREE.Group(); scene.add(findGroup);
  const dropFind = (f: Find) => { findGroup.remove(f.obj); if (f.glow) { findGroup.remove(f.glow); f.glow.material.dispose(); } finds.delete(f.mark.id); };
  const setFinds = (list: FindMark[]) => {
    const want = new Map(list.filter((x) => !(x.found && x.kind !== 'poi')).map((x) => [x.id, x]));
    for (const f of [...finds.values()]) { const w2 = want.get(f.mark.id); if (!w2 || w2.found !== f.mark.found) dropFind(f); }
    for (const x of want.values()) {
      if (finds.has(x.id)) continue;
      const d = vec(x.d); if (!d) continue;
      const obj = x.kind === 'shard' ? shardModel(x.storm ?? 'dust', !!x.rare) : x.kind === 'alien' ? alienModel(x.species ?? 'blorp', x.rarity ?? 'common') : poiModel(x.poi ?? 'crater', x.found);
      stand(obj, d, surf(d) - 0.05, (x.i * 2.399) % (Math.PI * 2));
      let glow: THREE.Sprite | null = null;
      if (!x.found && x.kind !== 'alien') {
        const col = x.kind === 'shard' ? (x.rare ? '#FFD84D' : WEATHER[x.storm ?? 'dust']?.color ?? '#7FE3FF') : '#B69CFF';
        glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(x.kind === 'shard' ? 3 : 4); findGroup.add(glow);
      }
      findGroup.add(obj);
      finds.set(x.id, { mark: x, d, obj, glow, asked: 0, peek: 0 });
    }
  };
  let weather: ReturnType<typeof weatherParticles> | null = null, weatherKind: string | null = null;
  const stormFog = new THREE.Fog('#888888', 12, 160);
  const flash = new THREE.AmbientLight('#CFE4FF', 0); scene.add(flash);
  let flashT = 0;
  const lookTmp = new THREE.Vector3();
  const setWeather = (kind: string | null) => {
    if (kind === weatherKind) return;
    if (weather) { scene.remove(weather.group); weather.dispose(); weather = null; }
    weatherKind = kind;
    if (!kind) return;
    weather = weatherParticles(kind, reduce ? 160 : isPhone() ? 420 : 900);
    stormFog.color.copy(css(weather.style.tint)); stormFog.near = kind === 'blizzard' || kind === 'dust' ? 6 : 14; stormFog.far = kind === 'blizzard' || kind === 'dust' ? 110 : 170;
    scene.add(weather.group);
  };

  // ---- you, your Inkborn, the others in your live group -------------------------------------------
  const me = imageSprite(o.explorerUrl, 1.9); scene.add(me);
  const youMat = track(new THREE.SpriteMaterial({ map: glowTex, color: '#FFE36B', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  const youDot = new THREE.Sprite(youMat); youDot.renderOrder = 5; scene.add(youDot); // "you are here", from high up
  const shadowMat = track(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  const shadow = new THREE.Mesh(track(new THREE.CircleGeometry(0.55, 20)), shadowMat); scene.add(shadow);
  const P = { d: spawn.clone(), up: 0, vy: 0, face: new THREE.Vector3(), target: null as THREE.Vector3 | null, moving: false };
  { // land a few steps east of the rocket, looking north (the rocket off to your left)
    const east = new THREE.Vector3().crossVectors(UP, P.d).normalize();
    P.d.applyAxisAngle(new THREE.Vector3().crossVectors(P.d, east).normalize(), 9 / R).normalize();
  }
  const camF = new THREE.Vector3().crossVectors(UP, P.d).cross(P.d).negate().normalize();
  if (camF.lengthSq() < 0.5) camF.set(0, 0, 1);
  P.face.copy(camF);
  type Buddy = { s: THREE.Sprite; c: HTMLCanvasElement; tex: THREE.CanvasTexture; d: THREE.Vector3; st: CreatureState; hop: number; dir: 1 | -1; g: Genome };
  let buddy: Buddy | null = null;
  const setBuddy = (gen: Genome | null) => {
    if (buddy) { scene.remove(buddy.s); buddy.tex.dispose(); buddy.s.material.dispose(); buddy = null; }
    if (!gen) return;
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 })); s.scale.set(1.7, 1.7, 1); s.center.set(0.5, 0.06);
    scene.add(s); buddy = { s, c, tex, d: P.d.clone(), st: 'idle', hop: 0, dir: 1, g: gen };
  };
  type Other = { s: THREE.Sprite; lab: THREE.Sprite; dot: THREE.Sprite; d: THREE.Vector3; to: THREE.Vector3; face: THREE.Vector3; hop: number; hopTo: number; streamed: number; walk: number; pet: THREE.Sprite | null; petD: THREE.Vector3; v: string | null; rover: THREE.Object3D | null };
  const others = new Map<string, Other>();
  const otherDotMat = track(new THREE.SpriteMaterial({ map: glowTex, color: '#7FE3FF', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  /** turn a rover so it sits on the ground at d, nose along face */
  const basis = new THREE.Matrix4(), bx = new THREE.Vector3(), bz = new THREE.Vector3();
  const orient = (obj: THREE.Object3D, d: THREE.Vector3, face: THREE.Vector3, h: number) => {
    bz.copy(face).projectOnPlane(d); if (bz.lengthSq() < 1e-6) bz.set(0, 0, 1).projectOnPlane(d); bz.normalize();
    bx.crossVectors(d, bz).normalize();
    obj.quaternion.setFromRotationMatrix(basis.makeBasis(bx, d, bz));
    obj.position.copy(d).multiplyScalar(h);
  };
  const bubbles = new Map<string, { s: THREE.Sprite; until: number }>();
  const dropBubble = (id: string) => { const b = bubbles.get(id); if (b) { scene.remove(b.s); disposeSprite(b.s); bubbles.delete(id); } };
  const say = (id: string, text: string) => {
    dropBubble(id);
    const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 140); if (!t) return;
    const s = bubbleSprite(t); scene.add(s); bubbles.set(id, { s, until: performance.now() + Math.min(10000, 4500 + t.length * 60) });
  };
  let ride: { kind: string; speed: number; obj: THREE.Object3D } | null = null;
  const setRover = (kind: string | null, speed = 20) => {
    if (ride) { scene.remove(ride.obj); ride = null; }
    if (kind) { ride = { kind, speed, obj: roverModel(kind, o.accent) }; scene.add(ride.obj); }
  };
  const setOtherRover = (x: Other, v: string | null) => {
    if (x.v === v) return;
    if (x.rover) { scene.remove(x.rover); x.rover = null; }
    x.v = v; if (v) { x.rover = roverModel(v, '#9FD3FF'); scene.add(x.rover); }
  };
  const dropOther = (id: string) => { const x = others.get(id); if (!x) return; setOtherRover(x, null); scene.remove(x.s, x.lab, x.dot); disposeSprite(x.s); disposeSprite(x.lab); if (x.pet) { scene.remove(x.pet); disposeSprite(x.pet); } others.delete(id); };
  /** Someone else's companion: drawn once (they're small and there can be a few), bobbing after them. */
  const petSprite = (gen: Genome) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!; drawCreature(g, gen, 64, 120, 62, { t: 0, state: 'idle', dir: 1 });
    g.strokeStyle = 'rgba(200,230,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 86, 43, 0, Math.PI * 2); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 })); s.scale.set(1.5, 1.5, 1); s.center.set(0.5, 0.06);
    scene.add(s); return s;
  };
  const vec = (a: number[] | null | undefined) => (a && a.length === 3 && a.every(Number.isFinite) && Math.hypot(a[0], a[1], a[2]) > 1e-6 ? new THREE.Vector3(a[0], a[1], a[2]).normalize() : null);
  const setLive = (list: Pilot[]) => {
    const keep = new Set(list.map((p) => p.id));
    for (const id of [...others.keys()]) if (!keep.has(id)) dropOther(id);
    for (const p of list) {
      const d = vec(p.d);
      let x = others.get(p.id);
      if (!x) {
        const s = imageSprite(p.explorerUrl, 1.9); const lab = textSprite(`@${p.username}`, '#ffffff', 0.45);
        const dot = new THREE.Sprite(otherDotMat); dot.renderOrder = 4;
        const start = d ?? spawn.clone();
        x = { s, lab, dot, d: start.clone(), to: start.clone(), face: new THREE.Vector3(0, 1, 0), hop: 0, hopTo: 0, streamed: 0, walk: 0, pet: p.companion ? petSprite(p.companion) : null, petD: start.clone(), v: null, rover: null };
        scene.add(s, lab, dot); others.set(p.id, x);
      }
      if (d && performance.now() - x.streamed > 2500) { x.to.copy(d); const f = vec(p.face); if (f) x.face.copy(f); x.hopTo = p.hop ?? 0; }
    }
  };
  const remote = (id: string, d: number[], face: number[], hop: number, rv?: string | null) => {
    const x = others.get(id); const v = vec(d); if (!x || !v) return;
    setOtherRover(x, typeof rv === 'string' && /^[a-z]{2,12}$/.test(rv) ? rv : null);
    x.to.copy(v); const f = vec(face); if (f) x.face.copy(f); x.hopTo = Math.max(0, Math.min(50, Number(hop) || 0)); x.streamed = performance.now();
  };

  // ---- camera: one zoom from your boots to orbit ---------------------------------------------------
  const DMIN = 4, DMAX = R * 3.4;
  let dist = o.startHigh ? R * 2.7 : 8.5, distTo = dist, pitch = 0.26;
  let peek: { d: THREE.Vector3; lift: number; c: Cell } | null = null;
  const F = P.d.clone(); // what the camera centres on — you, unless you've dragged the globe round
  let freeLook = false;
  const level = (d: number) => Math.min(1, Math.max(0, Math.log(d / DMIN) / Math.log(DMAX / DMIN)));
  const highness = (d: number) => { const t = Math.min(1, Math.max(0, (Math.log(d) - Math.log(28)) / (Math.log(R * 1.4) - Math.log(28)))); return t * t * (3 - 2 * t); };
  const zoom = (f: number) => { distTo = Math.max(DMIN, Math.min(DMAX, distTo * f)); };
  const setZoom = (lv: number) => { distTo = DMIN * Math.pow(DMAX / DMIN, Math.max(0, Math.min(1, lv))); };

  // ---- controls ---------------------------------------------------------------------------------
  const joy = { x: 0, y: 0 };
  const keys = new Set<string>();
  let jumpQueued = false;
  const kd = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable]')) return;
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === ' ') { jumpQueued = true; e.preventDefault(); }
    if (k.startsWith('arrow')) e.preventDefault();
    if (k === '=' || k === '+') zoom(0.8); if (k === '-' || k === '_') zoom(1.25);
  };
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const blur = () => keys.clear(); window.addEventListener('blur', blur);
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const pick = (cx: number, cy: number) => {
    const rc = o.canvas.getBoundingClientRect();
    ndc.set(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // the true ground near you, else a sphere hit (cheap, and good enough from up high)
    const hit = dist < R * 0.9 ? ray.intersectObject(patch, false)[0] : undefined;
    if (hit) return hit.point.clone().normalize();
    const s = new THREE.Sphere(new THREE.Vector3(), R); const p = new THREE.Vector3();
    if (!ray.ray.intersectSphere(s, p)) return null;
    p.normalize(); s.radius = R + heightLow(p); return ray.ray.intersectSphere(s, p) ? p.normalize() : null;
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
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch && d) zoom(pinch / d); pinch = d; return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved < 6) return;
    const hgh = highness(dist);
    if (hgh > 0.45) {
      // spin the globe under you: move the look point across the surface
      freeLook = true;
      const k = (dist / Math.max(200, o.canvas.clientHeight)) / R * 1.1;
      const right = new THREE.Vector3().crossVectors(camF, F).normalize();
      F.applyAxisAngle(camF, -dx * k).applyAxisAngle(right, -dy * k).normalize();
      camF.applyAxisAngle(right, -dy * k);
    } else {
      camF.applyAxisAngle(P.d, -dx * 0.006).normalize();
      pitch = Math.max(0.06, Math.min(1.3, pitch + dy * 0.004));
    }
  };
  const pu = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (drag && drag.moved < 8 && pointers.size === 0) {
      const d = pick(e.clientX, e.clientY);
      if (highness(dist) > 0.3) { const c = d ? cellAt([d.x, d.y, d.z], rows) : null; highlight(c); picked = c; o.onPick(c); }
      else if (d && d.angleTo(P.d) * R < 80) P.target = d;
    }
    if (pointers.size === 0) { drag = null; pinch = 0; }
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(Math.exp(Math.max(-0.4, Math.min(0.4, e.deltaY * 0.0015)))); };
  o.canvas.addEventListener('pointerdown', pd); o.canvas.addEventListener('pointermove', pm);
  o.canvas.addEventListener('pointerup', pu); o.canvas.addEventListener('pointercancel', pu);
  o.canvas.addEventListener('wheel', wheel, { passive: false });
  let picked: Cell | null = null;

  // ---- the loop ----------------------------------------------------------------------------------
  const G = 22 * Math.max(0.15, Math.min(2.5, w.gravity));
  let lastCell = ''; let got = 0; let intro = o.intro && !reduce ? 0 : 1;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camUp = new THREE.Vector3();
  const introFrom = spawn.clone().multiplyScalar(R * 4).add(new THREE.Vector3(0, R * 0.8, 0));
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  const moveOn = (d: THREE.Vector3, dir: THREE.Vector3, dist2: number) => {
    const axis = tv2.crossVectors(d, dir); if (axis.lengthSq() < 1e-12) return;
    axis.normalize(); d.applyAxisAngle(axis, dist2 / R).normalize();
  };
  const resize = () => {
    const rc = o.canvas.getBoundingClientRect();
    renderer.setSize(rc.width, rc.height, false);
    camera.aspect = rc.width / Math.max(1, rc.height); camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(o.canvas);
  buildPatch(P.d);
  const fps = framePacer();
  let raf = 0, last = performance.now(), t = 0, labelT = 0, lastZoomReport = '';
  let lastArea: { gx: number; gy: number } | null = null;
  // adaptive resolution: if frames run slow, render fewer pixels (and more again when there's room)
  let perfT = 0, perfN = 0;
  let paused = false;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!fps.ready(performance.now())) return;
    if (paused) { last = now; return; }
    const raw = (now - last) / 1000; last = now;
    const dt = Math.min(0.05, raw); t += dt;
    perfT += raw; perfN++;
    if (perfT > 2) {
      const avg = perfT / perfN; perfT = 0; perfN = 0;
      const next = avg > 0.026 ? Math.max(0.6, dpr - 0.2) : avg < 0.015 ? Math.min(maxDpr, dpr + 0.1) : dpr;
      if (Math.abs(next - dpr) > 0.01) { dpr = next; renderer.setPixelRatio(dpr); resize(); }
    }
    const up = P.d;
    dist += (distTo - dist) * Math.min(1, dt * 6);
    const hgh = highness(dist);
    camF.projectOnPlane(F).normalize();
    const right = tv.crossVectors(camF, up).normalize();
    const mx = joy.x + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const my = joy.y + (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    if (keys.has('q')) camF.applyAxisAngle(F, dt * 1.8);
    if (keys.has('e')) camF.applyAxisAngle(F, -dt * 1.8);
    const move = new THREE.Vector3();
    const fwd = camF.clone().projectOnPlane(up).normalize();
    if (mx || my) { P.target = null; freeLook = false; move.addScaledVector(fwd, my).addScaledVector(right, mx); }
    else if (P.target) {
      if (P.target.angleTo(up) * R < 0.6) P.target = null;
      else move.copy(P.target).projectOnPlane(up);
    }
    P.moving = move.lengthSq() > 1e-4;
    if (P.moving) {
      // walk at ground level; up high you fly — faster the higher you are
      const walkSp = (7 + Math.min(dist, R * 1.2) * 0.55) * (P.target ? 1.15 : 1);
      // in a rover on the ground you go at the rover's speed; up high you fly as usual
      const sp = Math.min(1, move.length()) * (ride && hgh < 0.3 ? Math.max(ride.speed, walkSp) : walkSp);
      move.normalize(); P.face.lerp(move, Math.min(1, dt * 10)).normalize();
      if (P.target) { const left = P.target.angleTo(up) * R; moveOn(P.d, move, Math.min(left, sp * dt)); } else moveOn(P.d, move, sp * dt);
      P.face.projectOnPlane(P.d).normalize();
      if (hgh < 0.3 && Math.abs(mx) > 0.2 && my >= 0) camF.lerp(P.face, dt * 0.8).normalize();
      if (P.target && hgh < 0.3) camF.lerp(P.face, dt * 2.2).normalize();
    }
    if (jumpQueued && P.up <= 0.001 && hgh < 0.5) { P.vy = 9; jumpQueued = false; } else if (P.up > 0.001 || hgh >= 0.5) jumpQueued = false;
    P.vy -= G * dt; P.up = Math.max(0, P.up + P.vy * dt); if (P.up === 0) P.vy = 0;
    // the look point follows you unless you've spun the globe away (and always once you're low)
    if (!freeLook || hgh < 0.35 || P.moving) { freeLook = freeLook && hgh >= 0.35 && !P.moving; F.lerp(P.d, Math.min(1, dt * (hgh < 0.35 ? 30 : 4))).normalize(); }
    // rebuild the detailed ground when you've wandered off its middle
    if (dist < R * 0.9 && P.d.angleTo(patchC) * R > PATCH * 0.3) buildPatch(P.d);
    const near = dist < R * 0.9;
    patch.visible = near; nearLines.visible = near; for (const m of decor) m.visible = near && dist < 160;
    patchU.uCos.value = near ? Math.cos((PATCH * 0.985) / R) : 2;
    baseGroup.visible = hgh < 0.6;
    if (baseGroup.visible && !reduce) animateModels(baseGroup, t);
    secPts.visible = hgh > 0.3; secMat.opacity = Math.min(0.95, (hgh - 0.3) * 3);
    farLines.visible = hgh > 0.25; (farLines.material as THREE.LineBasicMaterial).opacity = 0.16 * Math.min(1, (hgh - 0.25) * 3);

    { // tell the page when the view has moved on, so it can fetch the plots round it
      const cf = cellFloat([F.x, F.y, F.z], rows);
      if (!lastArea || Math.abs(cf.gy - lastArea.gy) > 24 || Math.min(Math.abs(cf.gx - lastArea.gx), cols - Math.abs(cf.gx - lastArea.gx)) > 24) { lastArea = cf; o.onArea?.({ gx: Math.floor(cf.gx), gy: Math.floor(cf.gy) }); }
    }
    const ground = surf(P.d);
    const bob = P.moving && P.up === 0 && !reduce && hgh < 0.3 && !ride ? Math.abs(Math.sin(t * 11)) * 0.12 : 0;
    const seat = ride ? (ride.kind === 'crawler' ? 1.5 : 1.0) : 0;
    me.position.copy(P.d).multiplyScalar(ground + P.up + bob + seat);
    if (ride) { ride.obj.visible = hgh < 0.6; orient(ride.obj, P.d, P.face, ground + P.up + (ride.kind === 'hover' && !reduce ? Math.sin(t * 3) * 0.08 : 0)); }
    if (P.moving) { const sx = P.face.dot(right); if (Math.abs(sx) > 0.15) { const m = me.material.map!; m.repeat.x = sx < 0 ? -1 : 1; m.offset.x = sx < 0 ? 1 : 0; } }
    stand(shadow, P.d, ground + 0.08); shadowMat.opacity = 0.28 * Math.max(0.25, 1 - P.up / 8);
    // markers that stay readable from orbit
    const dotSize = dist * 0.035;
    youDot.visible = hgh > 0.2; youDot.scale.setScalar(dotSize * (1 + 0.15 * Math.sin(t * 5))); youDot.position.copy(P.d).multiplyScalar(ground + 1);
    beacon.scale.setScalar(Math.max(4, dist * 0.03)); beaconMat.opacity = 0.35 + 0.5 * hgh;

    if (buddy) {
      const want = P.d.clone(); moveOn(want, P.face.clone().negate(), 2.2);
      const gap = buddy.d.angleTo(want) * R;
      if (gap > 30) buddy.d.copy(want);
      else if (gap > 0.4) { const dir = want.clone().projectOnPlane(buddy.d).normalize(); moveOn(buddy.d, dir, Math.min(gap, Math.max(gap * dt * 4, 7.5 * dt))); buddy.st = 'walk'; buddy.dir = dir.dot(right) < 0 ? -1 : 1; }
      else if (buddy.st === 'walk') buddy.st = 'idle';
      buddy.hop = Math.max(0, buddy.hop - dt);
      const hopY = buddy.hop > 0 ? Math.sin((buddy.hop / 0.7) * Math.PI) * 1.4 : 0;
      buddy.s.position.copy(buddy.d).multiplyScalar(surf(buddy.d) + hopY);
      buddy.s.visible = hgh < 0.5;
      if (buddy.s.visible && ((t * 30) | 0) % 2 === 0) {
        const g = buddy.c.getContext('2d')!; g.clearRect(0, 0, 160, 160);
        drawCreature(g, buddy.g, 80, 150, 78, { t, state: buddy.hop > 0 ? 'happy' : buddy.st, dir: buddy.dir });
        g.strokeStyle = 'rgba(200,230,255,0.8)'; g.lineWidth = 3; g.fillStyle = 'rgba(180,220,255,0.12)'; g.beginPath(); g.arc(80, 108, 54, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(58, 80, 10, 5, -0.6, 0, Math.PI * 2); g.fill();
        buddy.tex.needsUpdate = true;
      }
    }
    for (const [id, b] of bubbles) {
      const at = id === 'me' ? me.position : others.get(id)?.s.position;
      if (!at || performance.now() > b.until) { dropBubble(id); continue; }
      const upv = id === 'me' ? P.d : others.get(id)!.d;
      b.s.position.copy(at).addScaledVector(upv, id === 'me' ? 1.95 : 2.55);
      b.s.visible = hgh < 0.5;
    }
    for (const x of others.values()) {
      const gap = x.d.angleTo(x.to) * R;
      if (gap > 60) x.d.copy(x.to);
      else if (gap > 0.01) moveOn(x.d, x.to.clone().projectOnPlane(x.d).normalize(), Math.min(gap, Math.max(gap * dt * 9, 7.5 * dt)));
      x.walk = gap > 0.15 ? x.walk + dt * 11 : 0;
      x.hop += (x.hopTo - x.hop) * Math.min(1, dt * 12);
      const gr = surf(x.d) + x.hop + (x.walk && x.hop < 0.05 ? Math.abs(Math.sin(x.walk)) * 0.12 : 0);
      const xs = x.v ? (x.v === 'crawler' ? 1.5 : 1.0) : 0;
      x.s.position.copy(x.d).multiplyScalar(gr + xs);
      x.lab.position.copy(x.d).multiplyScalar(gr + 2.1 + xs);
      if (x.rover) { x.rover.visible = hgh < 0.6; orient(x.rover, x.d, x.face, surf(x.d) + x.hop); }
      x.dot.visible = hgh > 0.2; x.dot.scale.setScalar(dotSize * 0.8); x.dot.position.copy(x.d).multiplyScalar(gr + 1);
      const sx = x.face.dot(right); if (Math.abs(sx) > 0.15) { const m = x.s.material.map!; m.repeat.x = sx < 0 ? -1 : 1; m.offset.x = sx < 0 ? 1 : 0; }
      if (x.pet) {
        const want = x.d.clone(); moveOn(want, x.face.clone().negate(), 2);
        const pg = x.petD.angleTo(want) * R;
        if (pg > 30) x.petD.copy(want); else if (pg > 0.4) moveOn(x.petD, want.clone().projectOnPlane(x.petD).normalize(), Math.min(pg, Math.max(pg * dt * 4, 7 * dt)));
        x.pet.position.copy(x.petD).multiplyScalar(surf(x.petD) + (pg > 0.4 && !reduce ? Math.abs(Math.sin(t * 9 + x.walk)) * 0.25 : 0));
        x.pet.visible = hgh < 0.5;
      }
    }
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
    for (const m of mets.values()) {
      const gr = surf(m.d);
      if (m.fall > 0) { m.fall = Math.max(0, m.fall - dt); }
      const hgt = m.fall > 0 ? Math.pow(m.fall, 2) * 90 : 0;
      m.rock.position.copy(m.d).multiplyScalar(gr + 0.5 + hgt); m.rock.rotation.x += dt * 0.6; m.rock.rotation.y += dt * 0.9;
      m.glow.position.copy(m.rock.position); m.glow.material.opacity = 0.6 + 0.3 * Math.sin(t * 5 + m.i);
      m.glow.scale.setScalar((m.golden ? 5 : 3.6) * (1 + hgh * dist * 0.004));
      m.trail.visible = hgt > 0; if (hgt > 0) { m.trail.position.copy(m.d).multiplyScalar(gr + 0.5 + hgt + 7); }
      if (!m.fall && o.onMeteor && m.d.angleTo(P.d) * R < 4 && t - m.asked > 3) { m.asked = t; o.onMeteor(m.i); }
    }
    findGroup.visible = hgh < 0.55;
    if (findGroup.visible) {
      animateFinds(findGroup, t);
      for (const f of finds.values()) {
        const far = f.d.angleTo(P.d) * R;
        f.obj.visible = far < 600;
        if (f.glow) { f.glow.visible = f.obj.visible; f.glow.position.copy(f.d).multiplyScalar(surf(f.d) + (f.mark.kind === 'shard' ? 1.2 : 4.5)); f.glow.material.opacity = 0.45 + 0.35 * Math.sin(t * 3 + f.mark.i); }
        if (f.mark.kind === 'shard') f.obj.position.copy(f.d).multiplyScalar(surf(f.d) + 0.6 + (reduce ? 0 : Math.sin(t * 2 + f.mark.i) * 0.25));
        if (f.mark.kind === 'alien' && f.obj.visible) {
          // tucked down its burrow until you come close, then it peeks out (and watches you)
          const want = far < 22 ? 1 : 0; f.peek += (want - f.peek) * Math.min(1, dt * (want ? 3 : 6));
          const body = f.obj.getObjectByName('peek'); if (body) { body.position.y = -1.6 + f.peek * 1.6 + (f.peek > 0.9 && !reduce ? Math.abs(Math.sin(t * 5)) * 0.15 : 0); body.visible = f.peek > 0.02; }
          if (far < 40) orient(f.obj, f.d, lookTmp.copy(P.d).sub(f.d), surf(f.d) - 0.05);
        }
        const reach = f.mark.kind === 'shard' ? 3 : f.mark.kind === 'alien' ? 3.5 : 6;
        if (!f.mark.found && o.onFind && far < reach && P.up < 3 && t - f.asked > 3) { f.asked = t; o.onFind(f.mark.kind, f.mark.i); }
      }
    }
    if (weather) {
      weather.group.visible = hgh < 0.3;
      if (weather.group.visible) { weather.step(dt, t); orient(weather.group, P.d, camF, surf(P.d) - 4); }
      if (weather.style.flash && !reduce) {
        flashT -= dt; if (flashT <= 0) { flashT = 3 + Math.random() * 6; flash.intensity = 3.5; }
        flash.intensity = Math.max(0, flash.intensity - dt * 9);
      }
    } else flash.intensity = 0;
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.t += dt; b.s.scale.setScalar(2 + b.t * 30); b.s.material.opacity = Math.max(0, 1 - b.t * 1.6); if (b.t > 0.7) { scene.remove(b.s); b.s.material.dispose(); bursts.splice(i, 1); } }
    labelT -= dt; if (labelT <= 0) { labelT = 0.5; refreshLabels(); }
    for (const l of labelPool) if (l.s) l.s.visible = hgh < 0.35;
    const c = cellAt([P.d.x, P.d.y, P.d.z], rows);
    const k = c ? cellKey(c) : '';
    if (k !== lastCell) { lastCell = k; if (hgh < 0.3) { highlight(c); o.onCell(c); } }
    if (hgh < 0.3 && picked) { picked = null; lastCell = '__'; }
    hiLine.opacity = 0.55 + 0.35 * Math.sin(t * 4);
    const zinfo = `${level(dist).toFixed(2)}`;
    if (zinfo !== lastZoomReport) { lastZoomReport = zinfo; o.onZoom({ level: level(dist), meters: Math.round(dist), mode: hgh < 0.3 ? 'walk' : hgh < 0.85 ? 'fly' : 'orbit' }); }

    // camera: behind you on the ground, rising to straight above (and north-up) for the whole globe
    const fUp = F;
    const groundF = surf(F);
    const pit = peek ? 1.18 : pitch + (Math.PI / 2 - 0.02 - pitch) * hgh;
    const head = tv2.copy(F).multiplyScalar(groundF + (1.3 + P.up * 0.6) * (1 - hgh));
    if (peek) { const pd = Math.min(9, vis(pits.get(cellKey(peek.c))?.depth ?? 0)); head.copy(peek.d).multiplyScalar(surf(peek.d) - pd * 0.5); }
    camPos.copy(head).addScaledVector(fUp, Math.sin(pit) * dist).addScaledVector(camF, -Math.cos(pit) * dist);
    const cd = camPos.clone().normalize(); const minR = surf(cd) + 0.8; if (camPos.length() < minR) camPos.copy(cd.multiplyScalar(minR));
    camLook.copy(head).addScaledVector(camF, peek ? 0 : 4 * (1 - hgh)).addScaledVector(fUp, peek ? 0 : 0.4 * (1 - hgh));
    camUp.copy(fUp).lerp(camF, hgh).normalize();
    skyU.space.value = Math.max(w.dark ? 1 : 0, hgh);
    skyU.up.value.copy(fUp);
    scene.fog = weather && hgh < 0.3 ? stormFog : fog && hgh < 0.15 ? fog : null;
    starMat.opacity = w.dark ? 0.95 : 0.12 + 0.83 * hgh;
    if (atmMat) atmMat.uniforms.k.value = 0.35 + 0.65 * hgh;
    camera.near = Math.max(0.08, dist * 0.01); camera.updateProjectionMatrix();
    if (intro < 1) {
      intro = Math.min(1, intro + dt / 2.8);
      const e = 1 - Math.pow(1 - intro, 3);
      camera.position.lerpVectors(introFrom, camPos, e);
      camera.up.copy(UP).lerp(camUp, e).normalize();
      camera.lookAt(new THREE.Vector3().lerp(camLook, e));
    } else {
      camera.position.copy(camPos); camera.up.copy(camUp); camera.lookAt(camLook);
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  const api: PlanetScene = {
    joy, jump: () => { jumpQueued = true; }, setPlots, setSectors, setMeteors, burst, setWeather, setFinds, setLive, remote, zoom, setZoom, setBuddy, setRover, say, setShaft, setPaused: (p) => { paused = p; },
    peekShaft: (c, lift = 0.25) => {
      if (!c) {
        peek = null; distTo = 8.5; camera.clearViewOffset(); return;
      }
      peek = { d: V(cellCenterDir(c, rows)), lift, c }; distTo = 19; freeLook = false;
      const el = o.canvas; camera.setViewOffset(el.clientWidth, el.clientHeight, 0, el.clientHeight * lift, el.clientWidth, el.clientHeight);
    },
    findMe: () => { freeLook = false; },
    pose: () => ({ d: P.d.toArray(), face: P.face.toArray(), hop: P.up, moving: P.moving || P.up > 0, v: ride?.kind }),
    place: (d, face) => { const v = vec(d); if (!v) return; P.d.copy(v); F.copy(v); P.target = null; if (buddy) buddy.d.copy(v); const f = vec(face); if (f) { P.face.copy(f).projectOnPlane(v).normalize(); camF.copy(P.face); } else camF.projectOnPlane(v).normalize(); buildPatch(v); },
    teleport: (d) => { const v = vec(d); if (!v) return; const side = new THREE.Vector3().crossVectors(v, UP).normalize(); if (side.lengthSq() < 0.5) side.set(1, 0, 0); P.d.copy(v); moveOn(P.d, side, 2.2); F.copy(P.d); P.target = null; if (buddy) buddy.d.copy(P.d); camF.copy(v).sub(P.d).projectOnPlane(P.d).normalize(); buildPatch(P.d); },
    walkTo: (c) => { P.target = V(cellCenterDir(c, rows)); freeLook = false; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
      o.canvas.removeEventListener('pointerdown', pd); o.canvas.removeEventListener('pointermove', pm); o.canvas.removeEventListener('pointerup', pu);
      o.canvas.removeEventListener('pointercancel', pu); o.canvas.removeEventListener('wheel', wheel); o.canvas.removeEventListener('webglcontextlost', lost);
      clearPlots(); highlight(null); setBuddy(null); setRover(null); for (const m of [...mets.values()]) dropMet(m); for (const b of bursts) { scene.remove(b.s); b.s.material.dispose(); }
      setWeather(null); for (const f of [...finds.values()]) dropFind(f);
      for (const id of [...others.keys()]) dropOther(id);
      for (const id of [...bubbles.keys()]) dropBubble(id);
      for (const pt of pits.values()) dropPit(pt);
      for (const l of labelPool) if (l.s) disposeSprite(l.s);
      disposeSprite(me);
      decor.forEach((m) => m.dispose());
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
  if (import.meta.env.DEV || config.e2e) (window as any).__landvasPlanet = { P, samples, bubbles, pits, pitU, ride: () => ride?.kind ?? null, others, clock: () => t, R, rows, mets, baseGroup, finds, setWeather, setFinds, setLive, remote, setZoom, walkTo: api.walkTo, cell: () => cellAt([P.d.x, P.d.y, P.d.z], rows), renderer };
  return api;
}
