// The Clan Keep in 3D: a castle courtyard at golden hour, in the clan's colours. Crenellated walls and towers
// with the clan's flags, a gatehouse hung with its great banner, torches; in the courtyard the Clan Spirit on its
// rune shrine, the clan chest, the war table, the trophy shelf, a campfire with log benches, the quarry, the
// training grounds and a games pavilion — plus eight building plots where the clan's monuments rise (scaffolding
// until they're built). Members walk about together (tap to walk), with name tags and speech bubbles.
import * as THREE from 'three';
import { bake } from '../home/live3d/kit3d';
import { randomGenome } from '../inkborn/genome';
import { drawCreature } from '../inkborn/rig';
import { adaptiveDpr, framePacer, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';

export type KeepStation = 'spirit' | 'chest' | 'war' | 'trophies' | 'campfire' | 'quarry' | 'training' | 'games' | `build:${string}`;
export type KeepBuildState = { key: string; name: string; emoji: string; progress: number; cost: number; done: boolean; locked: boolean; level: number };
export type KeepState = {
  clan: { name: string; tag: string; emblem: string; color: string };
  spirit: { seed: number; stage: number }; chestOpen: boolean; chestClaimed: boolean; wins: number; builds: KeepBuildState[];
};
export type KeepOpts = { canvas: HTMLCanvasElement; explorerUrl: string; reduceMotion?: boolean; onNear?(s: KeepStation | null): void };

// the keep is 2x the size of a house room: presence positions are sent at half scale
const SCALE = 2;
const BX = 13, BZ0 = -9.6, BZ1 = 11;
export const BUILD_SLOTS: Record<string, [number, number]> = {
  well: [-6.6, -2.8], fountain: [6.6, -2.8], watchtower: [-11, -7.4], forge: [10.8, -7.2],
  garden: [-6.8, 6.4], statue: [4.6, 5.6], dragon: [-11.2, -1.2], beacon: [11.2, -1.2],
};
const STATIONS: { id: KeepStation; x: number; z: number; label: string; r: number }[] = [
  { id: 'spirit', x: 0, z: -6.4, label: '🐉 Clan Spirit', r: 2.5 },
  { id: 'chest', x: 4.4, z: -8.2, label: '🎁 Clan chest', r: 1.6 },
  { id: 'war', x: -4.4, z: -8.2, label: '🗺️ War table', r: 1.6 },
  { id: 'trophies', x: -8.2, z: -9.6, label: '🏆 Trophies', r: 1.6 },
  { id: 'campfire', x: 0, z: 1.2, label: '🔥 Campfire', r: 2.3 },
  { id: 'quarry', x: 11, z: 4.4, label: '⛏️ Quarry', r: 2.4 },
  { id: 'training', x: -11, z: 4.4, label: '🎯 Training grounds', r: 2.4 },
  { id: 'games', x: 8.4, z: 8.8, label: '🎲 Games pavilion', r: 2.3 },
];

export function createKeep(o: KeepOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const fps = framePacer({ ambient: true });
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d), undefined, fps);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#F2B98A', 38, 95);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...p }));
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void, rep = 1) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; d(c.getContext('2d')!);
    const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (rep !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); }
    return t;
  };
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stat = new THREE.Group(); scene.add(stat); // still scenery, merged into a few draw calls at the end
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = stat, shadow = true) => {
    const me = new THREE.Mesh(T(geo), m); me.position.set(x, y, z); me.castShadow = shadow; me.receiveShadow = true; parent.add(me); return me;
  };
  const emojiTex = (e: string, size = 128) => tex(size, size, (g) => { g.font = `${size * 0.78}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, size / 2, size * 0.56); });
  const sprite = (t: THREE.Texture, w: number, h: number, add = false) => {
    const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })));
    s.scale.set(w, h, 1); return s;
  };

  // ---- sky, light, land ------------------------------------------------------------------------------------------------
  const skyTex = tex(8, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#4E6FB8'); gr.addColorStop(0.45, '#C59BC0'); gr.addColorStop(0.75, '#FFC08A'); gr.addColorStop(1, '#FFE2B0'); g.fillStyle = gr; g.fillRect(0, 0, 8, 256); });
  const sky = new THREE.Mesh(T(new THREE.SphereGeometry(150, 24, 16)), T(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })));
  scene.add(sky);
  const sunDisc = sprite(tex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,214,140,0.9)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }), 34, 34, true);
  sunDisc.position.set(-55, 22, -110); (sunDisc.material as THREE.SpriteMaterial).fog = false; scene.add(sunDisc);
  const hemi = new THREE.HemisphereLight('#FFE6C8', '#5C6A4A', 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFD2A0', 2.6); sun.position.set(-14, 18, -10); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(phone ? 1024 : 1536, phone ? 1024 : 1536);
  // shadows only round you (the camera follows you), so a small sharp map does
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;

  const grass = tex(512, 512, (g) => { g.fillStyle = '#6E9A45'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? '#5E8A3A' : rnd() < 0.5 ? '#86B356' : '#7AA64C'; g.fillRect(rnd() * 512, rnd() * 512, 2, 5); } }, 14);
  const ground = mesh(new THREE.CircleGeometry(80, 48), std('#ffffff', { map: grass, roughness: 1 }), 0, 0, 0, scene, false); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  // the flagstone plaza and paths
  const flag = tex(512, 512, (g) => {
    g.fillStyle = '#8D8378'; g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) for (let x = (y / 64) % 2 ? -32 : 0; x < 512; x += 64) {
      const l = 52 + rnd() * 18; g.fillStyle = `hsl(${28 + rnd() * 14}, ${10 + rnd() * 10}%, ${l}%)`; g.beginPath(); g.roundRect(x + 3, y + 3, 58, 58, 8); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.06)'; for (let k = 0; k < 6; k++) g.fillRect(x + 6 + rnd() * 48, y + 6 + rnd() * 48, 3, 3);
    }
  }, 6);
  const plaza = mesh(new THREE.CircleGeometry(9.5, 48), std('#ffffff', { map: flag, roughness: 0.9 }), 0, 0.02, -1.5, scene, false); plaza.rotation.x = -Math.PI / 2;
  const path = std('#ffffff', { map: flag, roughness: 0.95 });
  for (const [x, z, w, d] of [[0, 9, 3.2, 6], [-10, 3, 6, 2.6], [10, 3, 6, 2.6], [0, -9.5, 4, 2.4]] as const) { const p = mesh(new THREE.PlaneGeometry(w, d), path, x, 0.015, z, scene, false); p.rotation.x = -Math.PI / 2; }

  // distant hills and mountains, and trees outside the walls
  const hillM = std('#58784A', { roughness: 1 }), mtnM = std('#7D7FA0', { roughness: 1 }), snowM = std('#F4EEF4', { roughness: 0.8 });
  for (let i = 0; i < 14; i++) { const a = -Math.PI * 0.95 + (i / 13) * Math.PI * 0.9, r = 70 + rnd() * 15, h = 14 + rnd() * 16; const m = mesh(new THREE.ConeGeometry(10 + rnd() * 8, h, 6), mtnM, Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r, stat, false); m.rotation.y = rnd() * 3; const sc = mesh(new THREE.ConeGeometry(3.4, 4.5, 6), snowM, 0, h / 2 - 2, 0, m, false); sc.scale.setScalar(1 + rnd() * 0.3); }
  for (let i = 0; i < 18; i++) { const a = rnd() * Math.PI * 2, r = 30 + rnd() * 25; mesh(new THREE.SphereGeometry(6 + rnd() * 6, 10, 6), hillM, Math.cos(a) * r, -3, Math.sin(a) * r, stat, false); }
  const trunk = std('#5B3D26'), leafA = std('#3F7A3A'), leafB = std('#4F8F3F');
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = 19 + rnd() * 14, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 12 && Math.abs(x) < 10) continue;
    mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6), trunk, x, 0.8, z);
    const s = 1 + rnd() * 0.8; mesh(new THREE.ConeGeometry(1.3 * s, 2.6 * s, 7), rnd() < 0.5 ? leafA : leafB, x, 1.6 + 1.2 * s, z); mesh(new THREE.ConeGeometry(1 * s, 2 * s, 7), leafB, x, 2.7 + 1.4 * s, z);
  }

  // ---- walls, towers, gatehouse --------------------------------------------------------------------------------------
  const stoneTex = tex(256, 256, (g) => {
    g.fillStyle = '#7C7468'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -24 : 0; x < 256; x += 48) { g.fillStyle = `hsl(${30 + rnd() * 10}, 8%, ${44 + rnd() * 14}%)`; g.fillRect(x + 2, y + 2, 44, 28); }
  }, 1);
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  const stoneM = std('#ffffff', { map: stoneTex, roughness: 0.95 });
  const stoneDark = std('#5E574E', { roughness: 0.95 });
  const woodM = std('#7A5232', { roughness: 0.8 }), woodDark = std('#4E3420', { roughness: 0.85 }), ironM = std('#3B3B42', { metalness: 0.6, roughness: 0.45 });
  const goldM = std('#E8B83E', { metalness: 0.85, roughness: 0.28 });
  const clanM = std('#7B5CFF', { roughness: 0.75 }), clanGlow = std('#7B5CFF', { emissive: '#7B5CFF', emissiveIntensity: 0.9 });
  const WALL_H = 3.6, WALL_T = 1.2;
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
    const g = new THREE.Group(); g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); g.rotation.y = -a; stat.add(g);
    const w = mesh(new THREE.BoxGeometry(len, WALL_H, WALL_T), stoneM, 0, WALL_H / 2, 0, g);
    (w.geometry as THREE.BoxGeometry).attributes.uv && scaleUv(w.geometry, len / 4, WALL_H / 4);
    for (let k = -len / 2 + 0.4; k < len / 2 - 0.2; k += 1.1) mesh(new THREE.BoxGeometry(0.6, 0.6, WALL_T + 0.1), stoneM, k, WALL_H + 0.3, 0, g);
    mesh(new THREE.BoxGeometry(len, 0.25, WALL_T + 0.3), stoneDark, 0, 0.12, 0, g);
  };
  const scaleUv = (geo: THREE.BufferGeometry, sx: number, sy: number) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); };
  const tower = (x: number, z: number, r = 1.7, h = 6.2) => {
    const t = mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 14), stoneM, x, h / 2, z); scaleUv(t.geometry, 3, h / 3);
    mesh(new THREE.CylinderGeometry(r + 0.25, r + 0.25, 0.4, 14), stoneDark, x, h + 0.2, z);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mesh(new THREE.BoxGeometry(0.55, 0.6, 0.55), stoneM, x + Math.cos(a) * (r + 0.05), h + 0.7, z + Math.sin(a) * (r + 0.05)); }
    mesh(new THREE.ConeGeometry(r + 0.5, 2.4, 14), clanM, x, h + 2.2, z);
    for (let k = 0; k < 3; k++) { const a = rnd() * Math.PI * 2; mesh(new THREE.BoxGeometry(0.22, 0.6, 0.12), woodDark, x + Math.cos(a) * r, h * (0.45 + k * 0.15), z + Math.sin(a) * r, stat, false).rotation.y = -a + Math.PI / 2; }
  };
  wall(-BX - 1, -11.5, -4.2, -11.5); wall(4.2, -11.5, BX + 1, -11.5);
  wall(-BX - 1, -11.5, -BX - 1, 7.5); wall(BX + 1, -11.5, BX + 1, 7.5);
  tower(-BX - 1, -11.5, 2, 7.2); tower(BX + 1, -11.5, 2, 7.2); tower(-BX - 1, 7.5); tower(BX + 1, 7.5);
  // low front parapets either side of the steps (it's a dollhouse view: the front stays open)
  for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(6, 0.8, 0.8), stoneM, s * 10.5, 0.4, 12); }
  // gatehouse: two towers, an arch, a portcullis, the great banner
  for (const s of [-1, 1]) tower(s * 3.4, -11.8, 1.6, 7.8);
  mesh(new THREE.BoxGeometry(5.4, 2.4, 1.6), stoneM, 0, 5.4, -11.8);
  for (let k = -2.2; k <= 2.2; k += 1.1) mesh(new THREE.BoxGeometry(0.6, 0.6, 1.7), stoneM, k, 6.9, -11.8);
  const arch = mesh(new THREE.TorusGeometry(1.7, 0.28, 8, 20, Math.PI), stoneDark, 0, 3.6, -11.1); void arch;
  mesh(new THREE.PlaneGeometry(3.4, 4.2), std('#1A1512', { roughness: 1 }), 0, 2.1, -11.9, stat, false);
  for (let k = -1.4; k <= 1.41; k += 0.35) mesh(new THREE.BoxGeometry(0.08, 3.6, 0.08), ironM, k, 2.4, -11.05, stat, false);
  for (let y = 1; y <= 4.2; y += 0.6) mesh(new THREE.BoxGeometry(3, 0.07, 0.07), ironM, 0, y, -11.05, stat, false);

  // the great banner and tower flags (cloth that waves)
  const bannerCanvas = document.createElement('canvas'); bannerCanvas.width = 256; bannerCanvas.height = 512;
  const bannerTex = T(new THREE.CanvasTexture(bannerCanvas)); bannerTex.colorSpace = THREE.SRGBColorSpace;
  const clothM = T(new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.9 }));
  const cloths: { m: THREE.Mesh; base: Float32Array; amp: number; ph: number; hang: boolean }[] = [];
  const cloth = (w: number, h: number, x: number, y: number, z: number, ry: number, hang: boolean, mat: THREE.Material) => {
    const geo = T(new THREE.PlaneGeometry(w, h, 10, 12)); if (!hang) geo.translate(w / 2, 0, 0);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; scene.add(m);
    cloths.push({ m, base: Float32Array.from(geo.attributes.position.array as Float32Array), amp: hang ? 0.06 : 0.16, ph: rnd() * 6, hang }); return m;
  };
  cloth(2.6, 4.4, 0, 4.2, -10.85, 0, true, clothM);
  for (const s of [-1, 1]) cloth(1.3, 2.6, s * 7.5, 2.4, -10.85, 0, true, clothM);
  const flagM = T(new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.9 }));
  for (const [x, z, h] of [[-BX - 1, -11.5, 7.2], [BX + 1, -11.5, 7.2], [-3.4, -11.8, 7.8], [3.4, -11.8, 7.8]] as const) {
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), ironM, x, h + 3.6, z);
    cloth(1.5, 0.9, x, h + 4.4, z, 0.4, false, flagM);
  }

  // torches on the walls (two real lights, flames everywhere)
  const flameTex = tex(64, 128, (g) => { const gr = g.createRadialGradient(32, 84, 2, 32, 74, 50); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,190,60,0.95)'); gr.addColorStop(0.7, 'rgba(255,90,20,0.5)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(32, 76, 26, 50, 0, 0, Math.PI * 2); g.fill(); });
  const flames: { s: THREE.Sprite; base: number; ph: number }[] = [];
  const flame = (x: number, y: number, z: number, size = 0.5) => { const s = sprite(flameTex, size * 0.6, size, true); s.position.set(x, y, z); scene.add(s); flames.push({ s, base: size, ph: rnd() * 9 }); return s; };
  for (const [x, z] of [[-6, -10.85], [6, -10.85], [-BX - 0.35, -4], [BX + 0.35, -4], [-BX - 0.35, 3], [BX + 0.35, 3]] as const) {
    mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 6), woodDark, x, 2.5, z); mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.16, 8), ironM, x, 2.85, z); flame(x, 3.15, z, 0.55);
  }
  const torchL = new THREE.PointLight('#FF9A4A', 6, 9, 1.6); torchL.position.set(-6, 3.2, -10.3); scene.add(torchL);
  const torchR = new THREE.PointLight('#FF9A4A', 6, 9, 1.6); torchR.position.set(6, 3.2, -10.3); scene.add(torchR);

  // ---- the spirit shrine ---------------------------------------------------------------------------------------------
  const runeTex = tex(256, 256, (g) => { g.clearRect(0, 0, 256, 256); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 92, 0, Math.PI * 2); g.stroke(); g.font = 'bold 22px serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; const r = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒ'; for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; g.save(); g.translate(128 + Math.cos(a) * 102, 128 + Math.sin(a) * 102); g.rotate(a + Math.PI / 2); g.fillText(r[i], 0, 0); g.restore(); } });
  mesh(new THREE.CylinderGeometry(2.4, 2.7, 0.4, 24), stoneM, 0, 0.2, -6.4);
  mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.3, 24), stoneDark, 0, 0.55, -6.4);
  const runes = new THREE.Mesh(T(new THREE.PlaneGeometry(4.2, 4.2)), T(new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, color: '#9C86FF', blending: THREE.AdditiveBlending, depthWrite: false })));
  runes.rotation.x = -Math.PI / 2; runes.position.set(0, 0.72, -6.4); scene.add(runes);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; const px = Math.cos(a) * 2.25, pz = -6.4 + Math.sin(a) * 2.25; mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), stoneM, px, 1.1, pz); mesh(new THREE.OctahedronGeometry(0.22), clanGlow, px, 2.45, pz).userData.keep = true; }
  const spiritCv = document.createElement('canvas'); spiritCv.width = spiritCv.height = 256;
  const spiritTex = T(new THREE.CanvasTexture(spiritCv)); spiritTex.colorSpace = THREE.SRGBColorSpace;
  const spiritS = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: spiritTex, transparent: true, alphaTest: 0.04 }))); spiritS.center.set(0.5, 0.06); spiritS.position.set(0, 0.7, -6.4); scene.add(spiritS);
  const auraTex = tex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const aura = sprite(auraTex, 4, 4, true); aura.position.set(0, 1.8, -6.4); scene.add(aura);

  // ---- clan chest, war table, trophy shelf ---------------------------------------------------------------------------
  const chest = new THREE.Group(); chest.position.set(4.4, 0, -8.2); chest.rotation.y = -0.3; scene.add(chest);
  const cbody = new THREE.Mesh(T(new THREE.BoxGeometry(1.5, 0.8, 0.95)), woodM); cbody.position.y = 0.42; cbody.castShadow = true; chest.add(cbody);
  for (const x of [-0.6, 0, 0.6]) { const b = new THREE.Mesh(T(new THREE.BoxGeometry(0.1, 0.84, 1)), goldM); b.position.set(x, 0.42, 0); chest.add(b); }
  const lid = new THREE.Group(); lid.position.set(0, 0.82, -0.475); chest.add(lid);
  const lidM = new THREE.Mesh(T(new THREE.CylinderGeometry(0.475, 0.475, 1.5, 12, 1, false, 0, Math.PI)), woodM); lidM.rotation.z = Math.PI / 2; lidM.rotation.y = Math.PI / 2; lidM.position.set(0, 0, 0.475); lidM.castShadow = true; lid.add(lidM);
  const lock = new THREE.Mesh(T(new THREE.BoxGeometry(0.22, 0.26, 0.08)), goldM); lock.position.set(0, 0.62, 0.5); chest.add(lock);
  const chestGlow = sprite(auraTex, 2.6, 2.6, true); chestGlow.position.set(0, 1.1, 0); (chestGlow.material as THREE.SpriteMaterial).color.set('#FFD23F'); chest.add(chestGlow);

  const mapTex = tex(512, 320, (g) => {
    g.fillStyle = '#E9D3A4'; g.fillRect(0, 0, 512, 320); g.strokeStyle = '#B08A52'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 310);
    g.fillStyle = '#8FB3C9'; g.fillRect(14, 14, 484, 292);
    const isl = (x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.75); } g.fill(); };
    isl(150, 160, 95, '#C9B27C'); isl(370, 120, 70, '#C2AC74'); isl(390, 245, 50, '#CDB683');
    g.strokeStyle = '#7A4E2A'; g.setLineDash([8, 8]); g.lineWidth = 4; g.beginPath(); g.moveTo(170, 170); g.quadraticCurveTo(280, 60, 370, 130); g.stroke();
    g.font = 'bold 34px serif'; g.fillStyle = '#B4221F'; g.fillText('✕', 355, 140);
  });
  mesh(new THREE.BoxGeometry(2.4, 0.14, 1.6), woodM, -4.4, 1.0, -8.2);
  for (const [dx, dz] of [[-1, -0.65], [1, -0.65], [-1, 0.65], [1, 0.65]]) mesh(new THREE.BoxGeometry(0.14, 1, 0.14), woodDark, -4.4 + dx, 0.5, -8.2 + dz);
  const map = mesh(new THREE.PlaneGeometry(2.2, 1.4), std('#ffffff', { map: mapTex, roughness: 0.95 }), -4.4, 1.08, -8.2, stat, false); map.rotation.x = -Math.PI / 2;
  const tokens: THREE.Mesh[] = [];
  for (let k = 0; k < 5; k++) { const tk = new THREE.Mesh(T(new THREE.ConeGeometry(0.07, 0.24, 6)), k < 3 ? clanM : std('#C83A3A')); tk.position.set(-5.2 + rnd() * 1.6, 1.2, -8.7 + rnd() * 1); tk.castShadow = true; scene.add(tk); tokens.push(tk); }
  // trophy shelf
  mesh(new THREE.BoxGeometry(4.4, 0.16, 0.7), woodM, -8.2, 1.2, -10.4); mesh(new THREE.BoxGeometry(4.4, 0.16, 0.7), woodM, -8.2, 2.2, -10.4);
  for (const x of [-10.3, -6.1]) mesh(new THREE.BoxGeometry(0.16, 2.4, 0.7), woodDark, x, 1.2, -10.4);
  const trophyGroup = new THREE.Group(); scene.add(trophyGroup);
  const cupGeo = T(new THREE.LatheGeometry([0, 0.12, 0.13, 0.05, 0.05, 0.16, 0.2, 0.2].map((x, i) => new THREE.Vector2(x, [0, 0, 0.04, 0.08, 0.2, 0.26, 0.4, 0.44][i])), 14));

  // ---- campfire --------------------------------------------------------------------------------------------------------
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; mesh(new THREE.DodecahedronGeometry(0.28), stoneDark, Math.cos(a) * 0.95, 0.15, 1.2 + Math.sin(a) * 0.95); }
  for (let k = 0; k < 4; k++) { const lg = mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.3, 7), woodDark, 0, 0.25, 1.2); lg.rotation.z = Math.PI / 2 - 0.35; lg.rotation.y = (k / 4) * Math.PI; }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; const b = mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.2, 10), woodM, Math.cos(a) * 2.5, 0.32, 1.2 + Math.sin(a) * 2.5); b.rotation.z = Math.PI / 2; b.rotation.y = -a + Math.PI / 2; }
  const fireL = new THREE.PointLight('#FF8A3A', 9, 10, 1.5); fireL.position.set(0, 1.1, 1.2); scene.add(fireL);
  const fireBig = flame(0, 0.95, 1.2, 1.5); const fireB = flame(0.15, 0.85, 1.05, 1.1); const fireC = flame(-0.15, 0.82, 1.3, 1);
  void fireBig; void fireB; void fireC;
  const sparkN = 40, sparkPos = new Float32Array(sparkN * 3), sparkV = new Float32Array(sparkN);
  for (let i = 0; i < sparkN; i++) { sparkPos[i * 3] = (rnd() - 0.5) * 0.6; sparkPos[i * 3 + 1] = 0.6 + rnd() * 3; sparkPos[i * 3 + 2] = 1.2 + (rnd() - 0.5) * 0.6; sparkV[i] = 0.6 + rnd(); }
  const sparkGeo = T(new THREE.BufferGeometry()); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, T(new THREE.PointsMaterial({ color: '#FFB050', size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); scene.add(sparks);

  // ---- quarry ---------------------------------------------------------------------------------------------------------
  const rockM = std('#8C8579', { roughness: 1, flatShading: true }), rockD = std('#6D675E', { roughness: 1, flatShading: true });
  for (let k = 0; k < 14; k++) { const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 2.1, s = 0.5 + rnd() * 1.1; const m = mesh(new THREE.DodecahedronGeometry(s, 0), k % 2 ? rockM : rockD, 12 + Math.cos(a) * r, s * 0.55, 5.6 + Math.sin(a) * r * 0.7); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); }
  const oreM = std('#9CE7FF', { emissive: '#4FC6FF', emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.2, flatShading: true });
  for (let k = 0; k < 7; k++) mesh(new THREE.OctahedronGeometry(0.14 + rnd() * 0.08), oreM, 10.6 + rnd() * 3, 0.5 + rnd() * 1.2, 4.6 + rnd() * 2.2).userData.keep = false;
  // minecart on a little track
  for (let k = 0; k < 7; k++) mesh(new THREE.BoxGeometry(0.16, 0.08, 1.2), woodDark, 8 + k * 0.5, 0.05, 6.8, stat, false);
  for (const dz of [-0.4, 0.4]) mesh(new THREE.BoxGeometry(3.6, 0.06, 0.06), ironM, 9.5, 0.12, 6.8 + dz, stat, false);
  mesh(new THREE.BoxGeometry(1.2, 0.7, 0.9), ironM, 9.2, 0.55, 6.8); for (const dx of [-0.4, 0.4]) for (const dz of [-0.45, 0.45]) { const wh = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), woodDark, 9.2 + dx, 0.18, 6.8 + dz); wh.rotation.x = Math.PI / 2; }
  for (let k = 0; k < 5; k++) mesh(new THREE.DodecahedronGeometry(0.16), rockM, 9 + rnd() * 0.5, 0.95, 6.6 + rnd() * 0.4);
  const pick = new THREE.Group(); pick.position.set(10.2, 0.9, 3.6); scene.add(pick);
  { const h = new THREE.Mesh(T(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6)), woodM); h.castShadow = true; pick.add(h); const hd = new THREE.Mesh(T(new THREE.TorusGeometry(0.32, 0.05, 6, 10, Math.PI)), ironM); hd.position.y = 0.52; hd.rotation.z = Math.PI / 2 + Math.PI / 2; pick.add(hd); pick.rotation.z = 0.5; }

  // ---- training grounds ------------------------------------------------------------------------------------------------
  const targetTex = tex(128, 128, (g) => { for (const [r, c] of [[62, '#F4EEDF'], [50, '#D83A3A'], [38, '#F4EEDF'], [26, '#D83A3A'], [12, '#FFD23F']] as const) { g.fillStyle = c; g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fill(); } });
  const targetM = std('#ffffff', { map: targetTex });
  const targets: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const x = -13 + k * 1.8, z = 2.8 + k * 0.4;
    for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), woodDark, x + s * 0.35, 0.75, z + 0.2); leg.rotation.x = -0.2; }
    const tg = new THREE.Mesh(T(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 24)), [std('#C9A36B'), targetM, std('#C9A36B')]); tg.rotation.x = Math.PI / 2; tg.position.set(x, 1.5, z); tg.castShadow = true; scene.add(tg); targets.push(tg);
  }
  const strawM = std('#D9B45A', { roughness: 1 });
  for (const [x, z] of [[-9.4, 5.8], [-11.6, 6.2]] as const) { mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), woodDark, x, 0.9, z); mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.95, 8), strawM, x, 1.35, z); mesh(new THREE.SphereGeometry(0.26, 8, 6), strawM, x, 2.05, z); const arm = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), woodDark, x, 1.55, z); arm.rotation.z = Math.PI / 2; }
  // weapon rack
  mesh(new THREE.BoxGeometry(2, 0.1, 0.1), woodDark, -12, 1.5, 7.6); mesh(new THREE.BoxGeometry(2, 0.1, 0.1), woodDark, -12, 0.4, 7.6);
  for (let k = 0; k < 5; k++) { const sp = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2, 5), woodM, -12.8 + k * 0.4, 1, 7.55); sp.rotation.z = 0.12; mesh(new THREE.ConeGeometry(0.07, 0.25, 5), ironM, -12.8 + k * 0.4 - 0.12, 2.05, 7.55); }

  // ---- games pavilion ---------------------------------------------------------------------------------------------------
  const stripeCanvas = document.createElement('canvas'); stripeCanvas.width = 256; stripeCanvas.height = 64;
  const stripeTex = T(new THREE.CanvasTexture(stripeCanvas)); stripeTex.colorSpace = THREE.SRGBColorSpace; stripeTex.wrapS = THREE.RepeatWrapping; stripeTex.repeat.set(3, 1);
  const tentM = T(new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.9, side: THREE.DoubleSide, transparent: true }));
  const PV = { x: 8.4, z: 8.8 };
  const roof = new THREE.Mesh(T(new THREE.ConeGeometry(3, 2, 16, 1, true)), tentM); roof.position.set(PV.x, 3.4, PV.z); roof.castShadow = true; scene.add(roof);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 6), woodM, PV.x + Math.cos(a) * 2.8, 1.25, PV.z + Math.sin(a) * 2.8); }
  mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.1, 18), woodM, PV.x, 0.8, PV.z); mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.8, 8), woodDark, PV.x, 0.4, PV.z);
  const dice: THREE.Mesh[] = [];
  for (let k = 0; k < 2; k++) { const d = new THREE.Mesh(T(new THREE.BoxGeometry(0.22, 0.22, 0.22)), std('#FFFFFF', { roughness: 0.4 })); d.position.set(PV.x - 0.25 + k * 0.5, 0.97, PV.z); d.castShadow = true; scene.add(d); dice.push(d); }
  const pennant = mesh(new THREE.ConeGeometry(0.06, 0.6, 4), clanM, PV.x, 4.7, PV.z); void pennant;

  // ---- decorations: barrels, crates, hay, lanterns, bushes, flowers ------------------------------------------------------
  const barrelM = std('#8A5A33');
  for (const [x, z] of [[7.5, -10.2], [8.3, -10.4], [-1.9, -10.4], [12.4, 0.8], [-12.6, -3.9]] as const) { mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.95, 12), barrelM, x, 0.48, z); for (const y of [0.2, 0.76]) mesh(new THREE.TorusGeometry(0.41, 0.025, 4, 16), ironM, x, y, z).rotation.x = Math.PI / 2; }
  for (const [x, z, s] of [[9.6, -10.2, 0.8], [10.4, -9.8, 0.6], [-12.4, -5.3, 0.7], [12.4, 2.2, 0.65]] as const) mesh(new THREE.BoxGeometry(s, s, s), woodM, x, s / 2, z).rotation.y = rnd();
  for (const [x, z] of [[-4.7, 10.6], [4.7, 10.6]] as const) { mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), woodDark, x, 1.1, z); const lt = sprite(auraTex, 1.1, 1.1, true); (lt.material as THREE.SpriteMaterial).color.set('#FFC46B'); lt.position.set(x, 2.25, z); scene.add(lt); mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), goldM, x, 2.25, z, stat, false); }
  const bushM = std('#4C8A3E');
  for (let k = 0; k < 22; k++) { const side = k % 2 ? 1 : -1, z = -9 + (k >> 1) * 1.6; if (z > 6) continue; mesh(new THREE.SphereGeometry(0.45 + rnd() * 0.25, 7, 5), bushM, side * (BX - 0.2), 0.35, z); }
  const petal = T(new THREE.SphereGeometry(0.08, 5, 4));
  const flowerCols = ['#FF6FA8', '#FFD23F', '#FFFFFF', '#B07BFF', '#FF8A3D'];
  for (let k = 0; k < 90; k++) { const a = rnd() * Math.PI * 2, r = 9.8 + rnd() * 0.6; const m = new THREE.Mesh(petal, std(flowerCols[k % 5])); m.position.set(Math.cos(a) * r, 0.1, -1.5 + Math.sin(a) * r * 0.95); if (m.position.z > 10 || Math.hypot(m.position.x, m.position.z) < 3) continue; stat.add(m); }
  // string lights from tower to tower over the courtyard
  const bulbs: THREE.Sprite[] = [];
  for (const [x0, z0, x1, z1] of [[-BX - 1, 7.5, -3, -1.5], [BX + 1, 7.5, 3, -1.5]] as const) {
    for (let k = 0; k <= 12; k++) { const t2 = k / 12, x = x0 + (x1 - x0) * t2, z = z0 + (z1 - z0) * t2, y = 6.5 - Math.sin(t2 * Math.PI) * 1.4 - t2 * 1.2; const b = sprite(auraTex, 0.5, 0.5, true); (b.material as THREE.SpriteMaterial).color.set(['#FFD07A', '#FF9ACB', '#9CE7FF'][k % 3]); b.position.set(x, y, z); scene.add(b); bulbs.push(b); }
  }
  // fireflies over the courtyard
  const flyN = phone ? 40 : 80, flyPos = new Float32Array(flyN * 3), flyPh = new Float32Array(flyN);
  for (let i = 0; i < flyN; i++) { flyPos[i * 3] = (rnd() - 0.5) * 26; flyPos[i * 3 + 1] = 0.5 + rnd() * 3; flyPos[i * 3 + 2] = -10 + rnd() * 20; flyPh[i] = rnd() * 9; }
  const flyGeo = T(new THREE.BufferGeometry()); flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flies = new THREE.Points(flyGeo, T(new THREE.PointsMaterial({ color: '#FFF3A8', size: 0.1, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }))); scene.add(flies);
  // birds circling high up
  const birdTex = emojiTex('🕊️', 64); const birds: THREE.Sprite[] = [];
  for (let k = 0; k < 3; k++) { const b = sprite(birdTex, 0.9, 0.9); scene.add(b); birds.push(b); }

  // ---- monuments: scaffolding until built ----------------------------------------------------------------------------
  type Slot = { key: string; g: THREE.Group; scaffold: THREE.Group; built: THREE.Group | null; sign: THREE.Sprite; signCv: HTMLCanvasElement; signTex: THREE.CanvasTexture; tick?: (t: number, dt: number) => void; last: string };
  const slots = new Map<string, Slot>();
  const water = std('#5EC8FF', { emissive: '#2E9BE0', emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 });
  const buildMonument = (key: string): { g: THREE.Group; tick?: (t: number, dt: number) => void } => {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const me = new THREE.Mesh(T(geo), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
    if (key === 'well') {
      add(new THREE.CylinderGeometry(1, 1.05, 0.9, 16, 1, true), stoneM, 0, 0.45, 0); add(new THREE.TorusGeometry(1, 0.14, 6, 18), stoneDark, 0, 0.92, 0).rotation.x = Math.PI / 2;
      add(new THREE.CircleGeometry(0.92, 16), water, 0, 0.6, 0).rotation.x = -Math.PI / 2;
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.14, 2, 0.14), woodM, s * 0.95, 1.4, 0);
      const rf = add(new THREE.ConeGeometry(1.5, 0.9, 4), std('#A2442F'), 0, 2.7, 0); rf.rotation.y = Math.PI / 4;
      add(new THREE.CylinderGeometry(0.08, 0.08, 1.9, 8), woodDark, 0, 2, 0).rotation.z = Math.PI / 2;
      const bucket = add(new THREE.CylinderGeometry(0.18, 0.14, 0.26, 10), woodM, 0, 1.3, 0);
      return { g, tick: (t) => { bucket.position.y = 1.3 + Math.sin(t * 0.8) * 0.12; } };
    }
    if (key === 'forge') {
      add(new THREE.BoxGeometry(2.2, 1, 1.5), stoneM, 0, 0.5, 0); add(new THREE.BoxGeometry(0.8, 3, 0.8), stoneM, 0.5, 2, -0.35);
      const coals = add(new THREE.BoxGeometry(1, 0.15, 0.9), std('#FF5A1F', { emissive: '#FF4A10', emissiveIntensity: 1.6 }), -0.4, 1.05, 0.1);
      add(new THREE.BoxGeometry(0.7, 0.3, 0.32), ironM, -0.3, 0.75, 1.2); add(new THREE.BoxGeometry(0.3, 0.5, 0.25), ironM, -0.3, 0.35, 1.2);
      const sm = sprite(auraTex, 1.4, 1.4); (sm.material as THREE.SpriteMaterial).color.set('#8A8A8A'); (sm.material as THREE.SpriteMaterial).opacity = 0.35; g.add(sm);
      return { g, tick: (t) => { (coals.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 7) * 0.3 + Math.sin(t * 13) * 0.2; const k = (t * 0.4) % 1; sm.position.set(0.5, 3.6 + k * 2.4, -0.35); sm.scale.setScalar(1 + k * 2); (sm.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - k); } };
    }
    if (key === 'watchtower') {
      for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) add(new THREE.BoxGeometry(0.22, 5, 0.22), woodM, dx, 2.5, dz);
      for (let y = 1; y < 5; y += 1.4) for (const s of [-1, 1]) { add(new THREE.BoxGeometry(1.8, 0.1, 0.1), woodDark, 0, y, s * 0.8).rotation.z = 0.5; add(new THREE.BoxGeometry(0.1, 0.1, 1.8), woodDark, s * 0.8, y + 0.4, 0).rotation.x = 0.5; }
      add(new THREE.BoxGeometry(2.4, 0.18, 2.4), woodM, 0, 5.1, 0);
      for (const s of [-1, 1]) { add(new THREE.BoxGeometry(2.4, 0.5, 0.1), woodM, 0, 5.45, s * 1.15); add(new THREE.BoxGeometry(0.1, 0.5, 2.4), woodM, s * 1.15, 5.45, 0); }
      add(new THREE.ConeGeometry(1.8, 1.4, 4), clanM, 0, 6.6, 0).rotation.y = Math.PI / 4;
      const lamp = sprite(auraTex, 1.6, 1.6, true); (lamp.material as THREE.SpriteMaterial).color.set('#FFC46B'); lamp.position.set(0, 5.8, 0); g.add(lamp);
      return { g, tick: (t) => { lamp.scale.setScalar(1.5 + Math.sin(t * 3) * 0.15); } };
    }
    if (key === 'fountain') {
      add(new THREE.CylinderGeometry(1.6, 1.7, 0.6, 20, 1, true), stoneM, 0, 0.3, 0); add(new THREE.TorusGeometry(1.6, 0.13, 6, 24), stoneDark, 0, 0.6, 0).rotation.x = Math.PI / 2;
      add(new THREE.CircleGeometry(1.55, 20), water, 0, 0.45, 0).rotation.x = -Math.PI / 2;
      add(new THREE.CylinderGeometry(0.25, 0.35, 1.4, 10), stoneM, 0, 1, 0); add(new THREE.CylinderGeometry(0.75, 0.4, 0.3, 14), stoneM, 0, 1.75, 0);
      add(new THREE.CircleGeometry(0.68, 14), water, 0, 1.91, 0).rotation.x = -Math.PI / 2;
      const drops: THREE.Sprite[] = []; const dropTex = auraTex;
      for (let k = 0; k < 16; k++) { const d = sprite(dropTex, 0.18, 0.18, true); (d.material as THREE.SpriteMaterial).color.set('#BDEBFF'); g.add(d); drops.push(d); }
      return { g, tick: (t) => { drops.forEach((d, k) => { const ph = (t * 0.9 + k / 16) % 1, a = (k / 16) * Math.PI * 2; d.position.set(Math.cos(a) * ph * 1.1, 2.1 + ph * 1.4 - ph * ph * 2.4, Math.sin(a) * ph * 1.1); }); } };
    }
    if (key === 'garden') {
      add(new THREE.BoxGeometry(3.2, 0.25, 2.2), std('#5B3D26'), 0, 0.12, 0);
      const cols = ['#FF5F9E', '#FFD23F', '#B07BFF', '#FF8A3D', '#FFFFFF', '#5FD3FF'];
      const stems: THREE.Mesh[] = [];
      for (let i = 0; i < 40; i++) { const x = -1.4 + (i % 8) * 0.4, z = -0.9 + Math.floor(i / 8) * 0.45; add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), std('#3F8A3A'), x, 0.5, z); const f = add(new THREE.SphereGeometry(0.12, 6, 5), std(cols[i % cols.length]), x, 0.78, z); stems.push(f); }
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), std('#F4EEDF'), s * 1.7, 1.1, 1.2);
      add(new THREE.TorusGeometry(1.7, 0.07, 6, 18, Math.PI), std('#F4EEDF'), 0, 2.2, 1.2);
      for (let k = 0; k < 10; k++) { const a = (k / 9) * Math.PI; add(new THREE.SphereGeometry(0.13, 6, 5), std(cols[k % cols.length]), Math.cos(a) * 1.7, 2.2 + Math.sin(a) * 1.7, 1.2); }
      const bee = sprite(emojiTex('🦋', 64), 0.5, 0.5); g.add(bee);
      return { g, tick: (t) => { stems.forEach((f, i) => { f.position.y = 0.78 + Math.sin(t * 2 + i) * 0.02; }); bee.position.set(Math.sin(t * 0.7) * 1.3, 1.2 + Math.sin(t * 2.3) * 0.3, Math.cos(t * 0.9) * 0.8); } };
    }
    if (key === 'statue') {
      add(new THREE.BoxGeometry(1.8, 1.1, 1.8), stoneDark, 0, 0.55, 0); add(new THREE.BoxGeometry(1.5, 0.2, 1.5), stoneM, 0, 1.2, 0);
      const marble = std('#E8E4DC', { roughness: 0.5 });
      add(new THREE.CylinderGeometry(0.32, 0.42, 1.5, 10), marble, 0, 2.05, 0); add(new THREE.SphereGeometry(0.3, 12, 10), marble, 0, 3.05, 0);
      const arm = add(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), marble, 0.4, 3.0, 0); arm.rotation.z = -0.6;
      add(new THREE.BoxGeometry(0.08, 1.4, 0.04), std('#D9D6CF', { metalness: 0.5, roughness: 0.3 }), 0.78, 3.9, 0);
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 6), marble, -0.45, 2.3, 0.25).rotation.x = Math.PI / 2;
      const plaque = add(new THREE.PlaneGeometry(1, 1), T(new THREE.MeshStandardMaterial({ map: emblemStone, transparent: true })), 0, 0.6, 0.91);
      void plaque;
      return { g };
    }
    if (key === 'beacon') {
      add(new THREE.CylinderGeometry(0.7, 0.95, 4, 10), stoneM, 0, 2, 0); add(new THREE.CylinderGeometry(1, 0.6, 0.6, 12), ironM, 0, 4.3, 0);
      const f1 = sprite(flameTex, 1.4, 2.2, true); f1.position.set(0, 5.1, 0); g.add(f1);
      const glow = sprite(auraTex, 4, 4, true); (glow.material as THREE.SpriteMaterial).color.set('#FF9A3A'); glow.position.set(0, 5, 0); g.add(glow);
      return { g, tick: (t) => { f1.scale.set(1.4 + Math.sin(t * 11) * 0.1, 2.2 + Math.sin(t * 7) * 0.25, 1); glow.scale.setScalar(3.6 + Math.sin(t * 5) * 0.4); } };
    }
    // dragon
    const bronze = std('#4E8A6E', { metalness: 0.7, roughness: 0.35 });
    add(new THREE.BoxGeometry(2.6, 0.8, 1.6), stoneDark, 0, 0.4, 0);
    const body = add(new THREE.CapsuleGeometry(0.55, 1.2, 6, 10), bronze, 0, 1.5, 0); body.rotation.z = Math.PI / 2;
    const neck = add(new THREE.CylinderGeometry(0.25, 0.4, 1.3, 8), bronze, 0.9, 2.2, 0); neck.rotation.z = -0.7;
    add(new THREE.BoxGeometry(0.7, 0.45, 0.5), bronze, 1.45, 2.8, 0); const snout = add(new THREE.ConeGeometry(0.22, 0.5, 6), bronze, 1.9, 2.75, 0); snout.rotation.z = -Math.PI / 2;
    for (const s of [-1, 1]) { add(new THREE.ConeGeometry(0.08, 0.4, 5), bronze, 1.3, 3.15, s * 0.18).rotation.z = 0.4; const eye = add(new THREE.SphereGeometry(0.06, 6, 5), std('#FFD23F', { emissive: '#FFB000', emissiveIntensity: 1.4 }), 1.65, 2.9, s * 0.2); void eye; }
    const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.lineTo(1.6, 1.4); wingShape.lineTo(1.1, 0.3); wingShape.lineTo(1.8, 0.1); wingShape.lineTo(1, -0.2); wingShape.lineTo(0, 0);
    const wings: THREE.Mesh[] = [];
    for (const s of [-1, 1]) { const w = new THREE.Mesh(T(new THREE.ShapeGeometry(wingShape)), T(new THREE.MeshStandardMaterial({ color: '#4E8A6E', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }))); w.position.set(-0.1, 1.9, s * 0.4); w.rotation.set(s * 1.1, Math.PI / 2 - 0.4, 0); w.scale.set(s, 1, 1); w.castShadow = true; g.add(w); wings.push(w); }
    for (let k = 0; k < 4; k++) { const tl = add(new THREE.ConeGeometry(0.3 - k * 0.06, 0.6, 7), bronze, -1 - k * 0.45, 1.3 - k * 0.12, Math.sin(k) * 0.2); tl.rotation.z = Math.PI / 2; }
    return { g, tick: (t) => { wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * (1.1 + Math.sin(t * 1.4) * 0.08); }); } };
  };
  // a stone carving of the emblem for the statue
  const emblemCanvas = document.createElement('canvas'); emblemCanvas.width = emblemCanvas.height = 128;
  const emblemStone = T(new THREE.CanvasTexture(emblemCanvas)); emblemStone.colorSpace = THREE.SRGBColorSpace;
  const scaffoldFor = () => {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const me = new THREE.Mesh(T(geo), m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), woodM, dx, 1.2, dz);
    for (const y of [0.9, 1.9]) { add(new THREE.BoxGeometry(2, 0.07, 0.3), woodM, 0, y, -0.9); add(new THREE.BoxGeometry(2, 0.07, 0.3), woodM, 0, y, 0.9); }
    add(new THREE.BoxGeometry(2.1, 0.06, 0.06), woodDark, 0, 1.4, 0.9).rotation.z = 0.6;
    for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.4, 0.25, 0.3), stoneM, -0.5 + (k % 3) * 0.42, 0.13 + Math.floor(k / 3) * 0.26, 0.2);
    const rope = add(new THREE.TorusGeometry(1.35, 0.03, 4, 24), std('#C8A86B'), 0, 0.5, 0); rope.rotation.x = Math.PI / 2;
    return g;
  };
  for (const [key, [x, z]] of Object.entries(BUILD_SLOTS)) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const scaffold = scaffoldFor(); g.add(scaffold);
    const signCv = document.createElement('canvas'); signCv.width = 256; signCv.height = 128;
    const signTex = T(new THREE.CanvasTexture(signCv)); signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false }))); sign.scale.set(1.9, 0.95, 1); sign.position.set(0, 3.1, 0); g.add(sign);
    slots.set(key, { key, g, scaffold, built: null, sign, signCv, signTex, last: '' });
    STATIONS.push({ id: `build:${key}`, x, z, label: '', r: 1.9 });
  }
  const drawSign = (s: Slot, b: KeepBuildState) => {
    const k = `${b.progress}|${b.locked}|${b.done}`; if (k === s.last) return; s.last = k;
    const g = s.signCv.getContext('2d')!; g.clearRect(0, 0, 256, 128);
    g.fillStyle = b.locked ? 'rgba(40,30,30,0.85)' : 'rgba(58,38,22,0.92)'; g.beginPath(); g.roundRect(4, 4, 248, 120, 18); g.fill();
    g.strokeStyle = '#E8B83E'; g.lineWidth = 4; g.stroke();
    g.font = '44px system-ui, "Apple Color Emoji"'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(b.locked ? '🔒' : b.emoji, 16, 46);
    g.fillStyle = '#FFF4DA'; g.font = '800 26px ui-rounded, system-ui'; g.fillText(b.name, 72, 36);
    g.font = '600 20px ui-rounded, system-ui'; g.fillStyle = '#FFD98A'; g.fillText(b.locked ? `Clan level ${b.level}` : `${b.progress}/${b.cost} stone`, 72, 66);
    if (!b.locked) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect(18, 90, 220, 18, 9); g.fill(); g.fillStyle = '#7DFFB2'; g.beginPath(); g.roundRect(18, 90, Math.max(18, 220 * Math.min(1, b.progress / b.cost)), 18, 9); g.fill(); }
    s.signTex.needsUpdate = true;
  };

  // ---- station labels -------------------------------------------------------------------------------------------------
  const labelTex = (text: string) => tex(512, 112, (g) => { g.font = '800 46px ui-rounded, system-ui, "Apple Color Emoji"'; const w = Math.min(500, g.measureText(text).width + 48); g.fillStyle = 'rgba(20,14,30,0.78)'; g.beginPath(); g.roundRect((512 - w) / 2, 8, w, 92, 46); g.fill(); g.strokeStyle = '#E8B83E'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#FFF4DA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 56); });
  const labels: { s: THREE.Sprite; id: KeepStation }[] = [];
  for (const st of STATIONS) {
    if (!st.label) continue;
    const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: labelTex(st.label), transparent: true, depthWrite: false, depthTest: false })));
    s.scale.set(2.6, 0.57, 1); s.renderOrder = 4; const h = st.id === 'games' ? 5.2 : st.id === 'spirit' ? 4.4 : st.id === 'trophies' ? 3.1 : 2.6;
    s.position.set(st.x, h, st.z); scene.add(s); labels.push({ s, id: st.id });
  }
  // a glowing ring under you when you're near something
  const ring = new THREE.Mesh(T(new THREE.RingGeometry(0.9, 1.1, 32)), T(new THREE.MeshBasicMaterial({ color: '#FFD23F', transparent: true, opacity: 0.6, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);

  // colliders (circles you walk round)
  const cols: { x: number; z: number; r: number }[] = [
    { x: 0, z: -6.4, r: 2.4 }, { x: 4.4, z: -8.2, r: 0.9 }, { x: -4.4, z: -8.2, r: 1.3 }, { x: 0, z: 1.2, r: 1.1 },
    { x: 11.8, z: 5.4, r: 2.1 }, { x: 9.3, z: 6.8, r: 0.9 }, { x: 8.4, z: 8.8, r: 1.2 }, { x: -12, z: 3.4, r: 1.2 }, { x: -10.4, z: 6, r: 1.1 },
    ...[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; return { x: Math.cos(a) * 2.5, z: 1.2 + Math.sin(a) * 2.5, r: 0.85 }; }),
    ...Object.values(BUILD_SLOTS).map(([x, z]) => ({ x, z, r: 1.35 })),
  ];

  // ---- you and the others ---------------------------------------------------------------------------------------------
  const blobTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const blob = (r: number) => { const m = new THREE.Mesh(T(new THREE.PlaneGeometry(r * 2, r * 2)), T(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }))); m.rotation.x = -Math.PI / 2; scene.add(m); return m; };
  const meTex = new THREE.TextureLoader().load(o.explorerUrl); meTex.colorSpace = THREE.SRGBColorSpace; T(meTex);
  const me = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true, alphaTest: 0.05 }))); me.center.set(0.5, 0); me.scale.set(1.5 * (46 / 68), 1.5, 1); scene.add(me);
  const meSh = blob(0.36);
  const P = { x: 0, z: 9.5, tx: 0, tz: 9.5, face: 1, walking: false, walk: 0 };
  const nameTag = (name: string) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 56; const g = c.getContext('2d')!;
    g.font = '700 26px ui-rounded, system-ui, sans-serif'; const w = Math.min(250, g.measureText(name).width + 24);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 40, 20); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 28);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(1.5, 0.33, 1); sp.renderOrder = 5; return sp;
  };
  type Other = { s: THREE.Sprite; tex: THREE.Texture; tag: THREE.Sprite; sh: THREE.Mesh; x: number; z: number; tx: number; tz: number; face: number; walk: number; fresh: number };
  const others = new Map<string, Other>();
  const setOthers = (list: { id: string; url: string; name: string; x: number; z: number }[]) => {
    const keep = new Set(list.map((x) => x.id));
    for (const [id, x] of others) if (!keep.has(id)) { scene.remove(x.s, x.tag, x.sh); x.tex.dispose(); x.s.material.dispose(); x.tag.material.map?.dispose(); x.tag.material.dispose(); others.delete(id); }
    for (const it of list) {
      let x = others.get(it.id);
      const wx = it.x * SCALE, wz = it.z * SCALE;
      if (!x) {
        const tx = new THREE.TextureLoader().load(it.url); tx.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, alphaTest: 0.05 })); sp.center.set(0.5, 0); sp.scale.set(1.5 * (46 / 68), 1.5, 1);
        const tag = nameTag(it.name); scene.add(sp, tag);
        x = { s: sp, tex: tx, tag, sh: blob(0.34), x: wx, z: wz, tx: wx, tz: wz, face: 1, walk: 0, fresh: 0 }; others.set(it.id, x);
      }
      if (performance.now() - x.fresh > 3000) { x.tx = wx; x.tz = wz; }
    }
  };
  const moveOther = (id: string, x: number, z: number, face?: number) => { const ot = others.get(id); if (!ot) return; ot.tx = x * SCALE; ot.tz = z * SCALE; ot.fresh = performance.now(); if (face) ot.face = face; };
  const bubbles = new Map<string, { s: THREE.Sprite; until: number }>();
  const say = (id: string, text: string) => {
    const old = bubbles.get(id); if (old) { scene.remove(old.s); old.s.material.map?.dispose(); old.s.material.dispose(); }
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d')!;
    g.font = '600 30px ui-rounded, system-ui, sans-serif';
    const words = text.split(/\s+/), lines: string[] = []; let cur = '';
    for (const w of words) { const t2 = cur ? `${cur} ${w}` : w; if (g.measureText(t2).width > 440 && cur) { lines.push(cur); cur = w; } else cur = t2; }
    if (cur) lines.push(cur);
    const ls = lines.slice(0, 3); if (lines.length > 3) ls[2] = ls[2].slice(0, -1) + '…';
    const w = Math.min(490, Math.max(...ls.map((l) => g.measureText(l).width)) + 40), h = ls.length * 36 + 26;
    g.fillStyle = '#FFF8EA'; g.strokeStyle = '#B88A3E'; g.lineWidth = 4;
    g.beginPath(); g.roundRect((512 - w) / 2, 4, w, h, 22); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(240, h + 3); g.lineTo(256, h + 22); g.lineTo(272, h + 3); g.fill();
    g.fillStyle = '#2A1A08'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ls.forEach((l, i) => g.fillText(l, 256, 4 + 13 + 18 + i * 36));
    const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t2, transparent: true, depthWrite: false, depthTest: false })); sp.center.set(0.5, 0); sp.scale.set(2.3, 2.3 * (160 / 512), 1); sp.renderOrder = 6;
    scene.add(sp); bubbles.set(id, { s: sp, until: performance.now() + 5500 + text.length * 40 });
  };

  // floating emoji bursts (feeding, chest, building…)
  const pops: { s: THREE.Sprite; t: number; vx: number; vy: number; vz: number }[] = [];
  const popTex = new Map<string, THREE.Texture>();
  const burst = (at: KeepStation, emojis: string[], n = 10) => {
    const st = STATIONS.find((s) => s.id === at); if (!st) return;
    for (let i = 0; i < n; i++) {
      const e = emojis[i % emojis.length]; let t2 = popTex.get(e); if (!t2) { t2 = emojiTex(e, 96); popTex.set(e, t2); }
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t2, transparent: true, depthWrite: false })); s.scale.setScalar(0.55); s.position.set(st.x, st.id === 'spirit' ? 2 : 1.3, st.z); scene.add(s);
      pops.push({ s, t: 0, vx: (Math.random() - 0.5) * 2.4, vy: 2.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 2.4 });
    }
  };

  // ---- state from the server -----------------------------------------------------------------------------------------
  let st: KeepState | null = null;
  let genome = randomGenome(1), spiritStage = -1, chestOpen = false, joyT = 0, wins = -1;
  const setKeep = (s: KeepState) => {
    const first = !st; st = s;
    if (first || s.clan.color !== clanM.color.getStyle()) {
      clanM.color.set(s.clan.color); clanGlow.color.set(s.clan.color); clanGlow.emissive.set(s.clan.color);
      (runes.material as THREE.MeshBasicMaterial).color.set(s.clan.color).lerp(new THREE.Color('#FFFFFF'), 0.35);
      const g = bannerCanvas.getContext('2d')!;
      const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, s.clan.color); gr.addColorStop(1, '#1B1430'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
      g.strokeStyle = '#E8B83E'; g.lineWidth = 14; g.strokeRect(10, 10, 236, 492);
      g.fillStyle = '#E8B83E'; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 512); g.lineTo(x + 16, 480); g.lineTo(x + 32, 512); g.fill(); }
      g.font = '150px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.clan.emblem, 128, 210);
      g.font = '900 50px ui-rounded, system-ui'; g.fillStyle = '#FFF4DA'; g.fillText(`[${s.clan.tag}]`, 128, 380);
      bannerTex.needsUpdate = true;
      const sg = stripeCanvas.getContext('2d')!; for (let k = 0; k < 8; k++) { sg.fillStyle = k % 2 ? '#FFF4DA' : s.clan.color; sg.fillRect(k * 32, 0, 32, 64); } stripeTex.needsUpdate = true;
      const eg = emblemCanvas.getContext('2d')!; eg.clearRect(0, 0, 128, 128); eg.filter = 'grayscale(1) brightness(1.3) contrast(0.8)'; eg.font = '96px system-ui, "Apple Color Emoji"'; eg.textAlign = 'center'; eg.textBaseline = 'middle'; eg.fillText(s.clan.emblem, 64, 70); eg.filter = 'none'; emblemStone.needsUpdate = true;
    }
    if (s.spirit.stage !== spiritStage) { if (spiritStage >= 0 && s.spirit.stage > spiritStage) joyT = 2.5; spiritStage = s.spirit.stage; }
    genome = randomGenome(s.spirit.seed);
    chestOpen = s.chestOpen && !s.chestClaimed;
    if (s.wins !== wins) {
      wins = s.wins; trophyGroup.clear();
      for (let k = 0; k < Math.min(12, wins); k++) { const cup = new THREE.Mesh(cupGeo, goldM); cup.position.set(-10 + (k % 6) * 0.72, k < 6 ? 1.28 : 2.28, -10.4); cup.scale.setScalar(1.4); cup.castShadow = true; trophyGroup.add(cup); }
    }
    for (const b of s.builds) {
      const sl = slots.get(b.key); if (!sl) continue;
      if (b.done && !sl.built) { const m = buildMonument(b.key); sl.built = m.g; sl.tick = m.tick; sl.g.add(m.g); sl.scaffold.visible = false; sl.sign.visible = false; }
      if (!b.done) { sl.scaffold.visible = !b.locked; drawSign(sl, b); sl.sign.visible = true; }
    }
  };

  // ---- input ----------------------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let down: { x: number; y: number; t: number } | null = null;
  const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const pu = (e: PointerEvent) => {
    if (!down) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null; if (d > 12) return;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // tapping a station's label walks you there
    const lab = ray.intersectObjects(labels.map((l) => l.s))[0];
    if (lab) { const l = labels.find((x) => x.s === lab.object); if (l) { walkTo(l.id); return; } }
    if (ray.ray.intersectPlane(plane, hit)) go(hit.x, hit.z);
  };
  const keys = new Set<string>();
  const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return; keys.add(e.key.toLowerCase()); };
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  o.canvas.addEventListener('pointerdown', pd); o.canvas.addEventListener('pointerup', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const clampPos = (x: number, z: number) => ({ x: Math.max(-BX + 0.6, Math.min(BX - 0.6, x)), z: Math.max(BZ0, Math.min(BZ1, z)) });
  // a walking grid (half-metre cells) for finding a way round things
  const CELL = 0.5, GX0 = -BX + 0.6, GZ0 = BZ0, GW = Math.floor((2 * (BX - 0.6)) / CELL) + 1, GH = Math.floor((BZ1 - BZ0) / CELL) + 1;
  const blocked = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const x = GX0 + i * CELL, z = GZ0 + j * CELL; if (cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.6)) blocked[j * GW + i] = 1; }
  const cellOf = (x: number, z: number) => [Math.max(0, Math.min(GW - 1, Math.round((x - GX0) / CELL))), Math.max(0, Math.min(GH - 1, Math.round((z - GZ0) / CELL)))] as const;
  const findPath = (fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] => {
    let [ti, tj] = cellOf(tx, tz);
    if (blocked[tj * GW + ti]) { // nearest open cell to where you tapped
      let bestD = 1e9, bi = ti, bj = tj;
      for (let j = Math.max(0, tj - 8); j <= Math.min(GH - 1, tj + 8); j++) for (let i = Math.max(0, ti - 8); i <= Math.min(GW - 1, ti + 8); i++) if (!blocked[j * GW + i]) { const d = (i - ti) ** 2 + (j - tj) ** 2 + ((GX0 + i * CELL - fx) ** 2 + (GZ0 + j * CELL - fz) ** 2) * 0.02; if (d < bestD) { bestD = d; bi = i; bj = j; } }
      ti = bi; tj = bj;
    }
    const [si, sj] = cellOf(fx, fz), start = sj * GW + si, goal = tj * GW + ti;
    const g = new Float32Array(GW * GH).fill(1e9), from = new Int32Array(GW * GH).fill(-1), open: number[] = [start], closed = new Uint8Array(GW * GH);
    g[start] = 0; const h = (n: number) => Math.hypot((n % GW) - ti, Math.floor(n / GW) - tj);
    let found = false, it = 0;
    while (open.length && it++ < 6000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
      const n = open.splice(bi, 1)[0]; if (n === goal) { found = true; break; } closed[n] = 1;
      const ni = n % GW, nj = Math.floor(n / GW);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ii = ni + di, jj = nj + dj; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
        const m = jj * GW + ii; if (closed[m] || (blocked[m] && m !== goal)) continue;
        if (di && dj && (blocked[nj * GW + ii] || blocked[jj * GW + ni])) continue;
        const ng = g[n] + (di && dj ? 1.414 : 1); if (ng < g[m]) { g[m] = ng; from[m] = n; if (!open.includes(m)) open.push(m); }
      }
    }
    if (!found) return [{ x: tx, z: tz }];
    const pts: { x: number; z: number }[] = []; for (let n = goal; n !== -1 && n !== start; n = from[n]) pts.unshift({ x: GX0 + (n % GW) * CELL, z: GZ0 + Math.floor(n / GW) * CELL });
    // smooth: drop points you can see past
    const clear = (a: { x: number; z: number }, b: { x: number; z: number }) => { const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / 0.2); for (let k = 1; k < steps; k++) { const x = a.x + ((b.x - a.x) * k) / steps, z = a.z + ((b.z - a.z) * k) / steps; if (cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.5)) return false; } return true; };
    const out: { x: number; z: number }[] = []; let cur = { x: fx, z: fz };
    for (let k = 0; k < pts.length; k++) { if (k === pts.length - 1 || !clear(cur, pts[k + 1])) { out.push(pts[k]); cur = pts[k]; } }
    return out.length ? out : [{ x: tx, z: tz }];
  };
  let route: { x: number; z: number }[] = [], stuckT = 0, replans = 0;
  const go = (x: number, z: number) => { const c = clampPos(x, z); route = findPath(P.x, P.z, c.x, c.z); replans = 0; const n = route.shift()!; P.tx = n.x; P.tz = n.z; P.walking = true; };
  const walkTo = (id: KeepStation) => {
    const s = STATIONS.find((x) => x.id === id); if (!s) return;
    // stand on the courtyard side of it
    const dx = 0 - s.x, dz = 3 - s.z, d = Math.hypot(dx, dz) || 1, off = s.r + 0.5;
    go(s.x + (dx / d) * off, s.z + (dz / d) * off);
  };

  // ---- loop -----------------------------------------------------------------------------------------------------------
  bake(stat, T);
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, frame = 0, near: KeepStation | null = null;
  const camPos = new THREE.Vector3(0, 10, 22), camLook = new THREE.Vector3(0, 0, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const sctx = spiritCv.getContext('2d')!;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!fps.ready(performance.now())) return;
    const now = performance.now(), raw = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || document.hidden) return;
    tune(raw); const dt = raw; t += dt; frame++;
    // you: keys or tap-to-walk, sliding round things
    let mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    let mz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    if (mx || mz) { P.walking = false; route = []; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
    else if (P.walking) { const dx = P.tx - P.x, dz = P.tz - P.z, d = Math.hypot(dx, dz); if (d < 0.12) { const n = route.shift(); if (n) { P.tx = n.x; P.tz = n.z; } else P.walking = false; } else { mx = dx / d; mz = dz / d; } }
    if (mx || mz) {
      const sp = 4.2 * dt; let nx = P.x + mx * sp, nz = P.z + mz * sp;
      for (const c of cols) { const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), rr = c.r + 0.35; if (d < rr && d > 0.0001) { nx = c.x + (dx / d) * rr; nz = c.z + (dz / d) * rr; } }
      const cl = clampPos(nx, nz);
      if (Math.hypot(cl.x - P.x, cl.z - P.z) < sp * 0.3 && P.walking) { stuckT += dt; if (stuckT > 0.35) { stuckT = 0; replans++; if (replans < 4) { const end = route.length ? route[route.length - 1] : { x: P.tx, z: P.tz }; route = findPath(P.x, P.z, end.x, end.z); const n = route.shift()!; P.tx = n.x; P.tz = n.z; } else { P.walking = false; route = []; } } } else stuckT = 0;
      if (Math.abs(mx) > 0.1) P.face = mx > 0 ? 1 : -1;
      P.x = cl.x; P.z = cl.z; P.walk += dt * 9;
    }
    const bob = (mx || mz) ? Math.abs(Math.sin(P.walk)) * 0.1 : 0;
    me.position.set(P.x, bob, P.z); me.scale.x = Math.abs(me.scale.x) * P.face; meSh.position.set(P.x, 0.03, P.z);
    for (const ot of others.values()) {
      const dx = ot.tx - ot.x, dz = ot.tz - ot.z, d = Math.hypot(dx, dz), moving = d > 0.05;
      if (moving) { const s2 = Math.min(d, Math.max(4.2, d * 3) * dt); ot.x += (dx / d) * s2; ot.z += (dz / d) * s2; ot.walk += dt * 9; if (Math.abs(dx) > 0.05) ot.face = dx > 0 ? 1 : -1; }
      ot.s.position.set(ot.x, moving ? Math.abs(Math.sin(ot.walk)) * 0.1 : 0, ot.z); ot.s.scale.x = Math.abs(ot.s.scale.x) * ot.face;
      ot.tag.position.set(ot.x, 1.8, ot.z); ot.sh.position.set(ot.x, 0.03, ot.z);
    }
    // nearest station
    let best: KeepStation | null = null, bd = 99;
    for (const s of STATIONS) { const d = Math.hypot(P.x - s.x, P.z - s.z) - s.r; if (d < 1.4 && d < bd) { bd = d; best = s.id; } }
    if (best !== near) { near = best; o.onNear?.(near); }
    if (near) { const s = STATIONS.find((x) => x.id === near)!; ring.visible = true; ring.position.set(s.x, 0.05, s.z); ring.scale.setScalar(s.r * 0.9 + Math.sin(t * 4) * 0.05); } else ring.visible = false;
    // the spirit
    if (frame % (phone ? 3 : 2) === 0) {
      sctx.clearRect(0, 0, 256, 256);
      if (spiritStage <= 0) {
        const wob = Math.sin(t * 3) * (joyT > 0 ? 0.25 : 0.06);
        sctx.save(); sctx.translate(128, 240); sctx.rotate(wob);
        const gr = sctx.createRadialGradient(-20, -120, 10, 0, -90, 90); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, st?.clan.color ?? '#7B5CFF');
        sctx.fillStyle = gr; sctx.beginPath(); sctx.ellipse(0, -80, 58, 76, 0, 0, Math.PI * 2); sctx.fill();
        sctx.fillStyle = 'rgba(255,255,255,0.75)'; for (const [x, y, r] of [[-20, -110, 10], [24, -70, 13], [-14, -48, 8], [18, -124, 7]]) { sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.fill(); }
        sctx.restore();
      } else {
        const px = 52 + spiritStage * 16;
        drawCreature(sctx, genome, 128, 250, px, { t, state: joyT > 0 ? 'happy' : Math.sin(t * 0.3) > 0.6 ? 'look' : 'idle', dir: Math.sin(t * 0.17) > 0 ? 1 : -1, look: Math.sin(t * 1.3), seed: 3 });
      }
      spiritTex.needsUpdate = true;
    }
    const sz = spiritStage <= 0 ? 1.7 : 1.9 + spiritStage * 0.45;
    spiritS.scale.set(sz, sz, 1); spiritS.position.y = 0.7 + (spiritStage > 0 ? 0.25 + Math.sin(t * 1.6) * 0.15 : 0);
    if (joyT > 0) joyT -= dt;
    aura.scale.setScalar((2 + spiritStage * 0.7) * (1 + Math.sin(t * 2) * 0.06)); (aura.material as THREE.SpriteMaterial).opacity = spiritStage >= 5 ? 0.85 : 0.25 + spiritStage * 0.08;
    (aura.material as THREE.SpriteMaterial).color.set(spiritStage >= 5 ? '#FFD23F' : st?.clan.color ?? '#7B5CFF');
    runes.rotation.z = t * 0.15; (runes.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 2) * 0.25;
    // chest
    lid.rotation.x = THREE.MathUtils.lerp(lid.rotation.x, chestOpen ? -1.9 : 0, Math.min(1, dt * 4));
    chestGlow.visible = chestOpen; chestGlow.scale.setScalar(2.4 + Math.sin(t * 4) * 0.3);
    // fire, torches, sparks, flames
    if (!o.reduceMotion) {
      for (const f of flames) f.s.scale.set(f.base * 0.6 * (1 + Math.sin(t * 13 + f.ph) * 0.08), f.base * (1 + Math.sin(t * 9 + f.ph) * 0.12 + Math.sin(t * 17 + f.ph) * 0.06), 1);
      fireL.intensity = 8 + Math.sin(t * 11) * 1.4 + Math.sin(t * 17) * 0.8; torchL.intensity = 5.5 + Math.sin(t * 9) * 0.8; torchR.intensity = 5.5 + Math.sin(t * 8 + 2) * 0.8;
      for (let i = 0; i < sparkN; i++) { sparkPos[i * 3 + 1] += sparkV[i] * dt; sparkPos[i * 3] += Math.sin(t * 2 + i) * dt * 0.3; if (sparkPos[i * 3 + 1] > 4) { sparkPos[i * 3 + 1] = 0.7; sparkPos[i * 3] = (Math.random() - 0.5) * 0.5; } }
      sparkGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < flyN; i++) { flyPos[i * 3] += Math.sin(t * 0.7 + flyPh[i]) * dt * 0.4; flyPos[i * 3 + 1] += Math.cos(t * 0.9 + flyPh[i] * 2) * dt * 0.25; flyPos[i * 3 + 2] += Math.cos(t * 0.5 + flyPh[i]) * dt * 0.4; }
      flyGeo.attributes.position.needsUpdate = true; (flies.material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(t * 3) * 0.3;
      // cloth waves
      for (const c of cloths) {
        const pos = c.m.geometry.attributes.position as THREE.BufferAttribute, b = c.base;
        for (let i = 0; i < pos.count; i++) { const x = b[i * 3], y = b[i * 3 + 1]; const k = c.hang ? (0.5 - y / 4.4) : x / 1.5; pos.setZ(i, Math.sin(t * 3 + c.ph + (c.hang ? y * 1.5 : x * 4)) * c.amp * Math.max(0, k) * (c.hang ? 1 : 1.6)); }
        pos.needsUpdate = true;
      }
      bulbs.forEach((b, i) => { (b.material as THREE.SpriteMaterial).opacity = 0.7 + Math.sin(t * 2 + i) * 0.3; });
      birds.forEach((b, i) => { const a = t * 0.2 + i * 2.1; b.position.set(Math.cos(a) * (16 + i * 3), 13 + i * 1.5 + Math.sin(t + i) * 0.5, -6 + Math.sin(a) * (10 + i * 2)); });
      targets.forEach((tg, i) => { tg.rotation.z = Math.sin(t * 0.8 + i) * 0.04; });
      tokens.forEach((tk, i) => { tk.position.y = 1.2 + Math.max(0, Math.sin(t * 1.2 + i * 1.3)) * 0.05; });
      dice.forEach((d, i) => { d.rotation.set(t * 0.3 + i, t * 0.5, 0); });
      pick.rotation.z = 0.5 + Math.max(0, Math.sin(t * 2.4)) * 0.6;
      for (const sl of slots.values()) sl.tick?.(t, dt);
    }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; p.vy -= 6 * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt; p.s.material.opacity = Math.max(0, 1 - p.t / 1.6); if (p.t > 1.6) { scene.remove(p.s); p.s.material.dispose(); pops.splice(i, 1); } }
    for (const [id, b] of bubbles) {
      const who = id === 'me' ? { x: P.x, z: P.z } : others.get(id); const left = b.until - performance.now();
      if (!who || left <= 0) { scene.remove(b.s); b.s.material.map?.dispose(); b.s.material.dispose(); bubbles.delete(id); continue; }
      b.s.position.set(who.x, 1.75 + (id === 'me' ? 0 : 0.2), who.z); b.s.material.opacity = Math.min(1, left / 400);
    }
    tentM.opacity = THREE.MathUtils.lerp(tentM.opacity, Math.hypot(P.x - PV.x, P.z - PV.z) < 3.6 || (P.z < PV.z - 1 && Math.abs(P.x - PV.x) < 3 && P.z > PV.z - 6) ? 0.25 : 1, Math.min(1, dt * 5));
    // the camera: behind and above you
    const tall = camera.aspect < 1, wide = tall ? 1 + (1 / camera.aspect - 1) * 0.5 : 1;
    camPos.lerp(tmp.set(P.x * (tall ? 0.75 : 0.5), 8.5 * wide, P.z + 10.5 * wide), Math.min(1, dt * 3));
    camLook.lerp(tmp2.set(P.x * (tall ? 0.9 : 0.7), 1, P.z - 3.5), Math.min(1, dt * 3.5));
    camera.position.copy(camPos); camera.lookAt(camLook);
    sun.position.set(P.x - 14, 18, P.z - 10); sun.target.position.set(P.x, 0, P.z);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    setKeep, setOthers, moveOther, say, burst, walkTo,
    joy() { joyT = 2.5; burst('spirit', ['💖', '✨', '🍖', '💫'], 14); },
    pose: () => ({ x: P.x / SCALE, z: P.z / SCALE, face: P.face }),
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ P: { x: P.x, z: P.z, tx: P.tx, tz: P.tz, walking: P.walking }, route, replans, near, others: [...others.keys()], stage: spiritStage, }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); o.canvas.removeEventListener('pointerup', pu);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      setOthers([]); for (const p of pops) p.s.material.dispose();
      for (const x of bag) x.dispose();
      renderer.dispose();
    },
  };
}
export type KeepScene = ReturnType<typeof createKeep>;
