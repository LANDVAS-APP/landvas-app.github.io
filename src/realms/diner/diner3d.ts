// The Restaurant in 3D: a retro diner with a black-and-white checker floor, a long kitchen counter at the back with
// your stations (a chrome coffee machine with steam, a sizzling griddle, a brick pizza oven glowing orange, a
// whirring blender, a stove with a bubbling pot), a menu board, booths and tables out front, a door with an OPEN
// sign. Customers walk in, sit, show their order in a bubble (green → amber → red as they wait), eat and leave a
// tip — or storm off. The chef dashes between the counter and the tables. Decor levels add paint, plants, a neon
// sign, a jukebox and a chandelier.
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../../lib/gfx';

export type DinerOpts = { canvas: HTMLCanvasElement; reduceMotion?: boolean; onTapStation?(slot: number): void; onTapTable?(table: number): void };
export type StationView = { kind: string; cooking?: { emoji: string; p: number }; ready?: string; burnt?: boolean };
const TABLES: [number, number][] = [[-2.7, 1.1], [-0.9, 1.1], [0.9, 1.1], [2.7, 1.1], [-2.7, 3.2], [-0.9, 3.2], [0.9, 3.2], [2.7, 3.2]];
const DOOR = new THREE.Vector3(4.6, 0, 5.4);
const SKIN = ['#F5D0B0', '#E0AC86', '#C68863', '#8D5A3B', '#5A3825', '#FFE0C8'];
const SHIRT = ['#FF6B6B', '#4ECDC4', '#FFD23F', '#7B6CF6', '#3DDC97', '#FF9F1C', '#22B8FF', '#F06292', '#8D6E63'];
const HAIR = ['#2A1A10', '#6B3E1E', '#E8C170', '#B03A2E', '#1A1A1A', '#9E9E9E'];

export function createDiner3D(o: DinerOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2B1E2A');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...p }));
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; d(cv.getContext('2d')!); const t = T(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const emojiCache = new Map<string, THREE.Texture>();
  const emojiTex = (e: string) => { let t = emojiCache.get(e); if (!t) { t = tex(96, 96, (g) => { g.font = '74px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 48, 54); }); emojiCache.set(e, t); } return t; };
  const sprite = (t: THREE.Texture, w: number, h = w, add = false) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })); s.scale.set(w, h, 1); return s; };
  const glowTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const puffTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(250,250,250,0.8)'); gr.addColorStop(1, 'rgba(250,250,250,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const box = (w: number, h: number, d: number) => T(new THREE.BoxGeometry(w, h, d));
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };

  // ---- light ----------------------------------------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight('#FFF1E0', '#5A3A48', 1.25));
  const key = new THREE.DirectionalLight('#FFE6C0', 2); key.position.set(4, 12, 9); scene.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048); Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;

  // ---- the room -------------------------------------------------------------------------------------------------------
  const checker = tex(128, 128, (g) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#1E1B22' : '#F2EEE6'; g.fillRect(x * 32, y * 32, 32, 32); } });
  checker.wrapS = checker.wrapT = THREE.RepeatWrapping; checker.repeat.set(6, 6); checker.magFilter = THREE.NearestFilter;
  mesh(T(new THREE.PlaneGeometry(14, 14)), std('#ffffff', { map: checker, roughness: 0.35 }), 0, 0, 1).rotation.x = -Math.PI / 2;
  const wallM = std('#7FD1C7'); const stripeM = std('#E8484C'); const trimM = std('#D9D9E0', { metalness: 0.9, roughness: 0.25 });
  mesh(box(14, 6, 0.3), wallM, 0, 3, -3.4);
  for (const s of [-1, 1]) mesh(box(0.3, 6, 12), wallM, s * 5.6, 3, 2);
  mesh(box(14, 0.4, 0.32), stripeM, 0, 1.3, -3.38);
  for (const s of [-1, 1]) mesh(box(0.32, 0.4, 12), stripeM, s * 5.58, 1.3, 2);
  // the menu board over the counter
  const boardTex = tex(512, 160, (g) => { g.fillStyle = '#1C1A1F'; g.fillRect(0, 0, 512, 160); g.strokeStyle = '#FFD23F'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 148); g.fillStyle = '#FFD23F'; g.font = 'bold 54px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText('★ DINER ★', 256, 72); g.font = '30px system-ui, "Apple Color Emoji"'; g.fillText('☕ 🥞 🍳 🍕 🌮 🥧 🍝', 256, 126); });
  mesh(T(new THREE.PlaneGeometry(4.2, 1.3)), std('#ffffff', { map: boardTex, emissive: '#ffffff', emissiveMap: boardTex, emissiveIntensity: 0.35 }), 0, 4.3, -3.24);
  // the door, with an OPEN sign
  const doorFrame = new THREE.Group(); doorFrame.position.set(5.45, 0, 4.6); doorFrame.rotation.y = -Math.PI / 2; scene.add(doorFrame);
  mesh(box(1.6, 2.8, 0.06), std('#A8E0FF', { transparent: true, opacity: 0.55, metalness: 0.3, roughness: 0.1 }), 0, 1.4, 0, doorFrame);
  for (const [x, y, w, h] of [[0, 2.85, 1.8, 0.12], [-0.85, 1.4, 0.12, 2.9], [0.85, 1.4, 0.12, 2.9]]) mesh(box(w, h, 0.14), trimM, x, y, 0, doorFrame);
  const openTex = tex(256, 96, (g) => { g.fillStyle = '#100810'; g.fillRect(0, 0, 256, 96); g.shadowColor = '#FF3B6B'; g.shadowBlur = 18; g.fillStyle = '#FF5C8A'; g.font = 'bold 64px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OPEN', 128, 52); });
  const openSign = mesh(T(new THREE.PlaneGeometry(1, 0.38)), std('#ffffff', { map: openTex, emissive: '#ffffff', emissiveMap: openTex, emissiveIntensity: 1 }), 0, 2.3, 0.05, doorFrame);

  // ---- the counter and stations ---------------------------------------------------------------------------------------
  const counterM = std('#E8484C', { roughness: 0.45 }), topM = std('#F4F1EA', { roughness: 0.25 });
  mesh(box(10, 1, 0.9), counterM, 0, 0.5, -2.5); mesh(box(10.2, 0.08, 1.05), topM, 0, 1.04, -2.5);
  mesh(box(10.2, 0.06, 0.08), trimM, 0, 0.98, -1.98);
  // a shelf of plates and jars on the wall
  mesh(box(7, 0.08, 0.35), std('#8A5A33'), 0, 2.6, -3.1);
  ['🫙', '🍯', '🥫', '🧂', '🫖', '🥛', '🍶'].forEach((e, i) => { const s = sprite(emojiTex(e), 0.42); s.position.set(-3 + i, 2.86, -3.05); scene.add(s); });
  const stations = new THREE.Group(); scene.add(stations);
  type SlotObj = { lastP?: number; kind: string; g: THREE.Group; ring: THREE.Mesh; ringM: THREE.MeshBasicMaterial; dish: THREE.Sprite; smoke: THREE.Sprite[]; glow?: THREE.PointLight; spin?: THREE.Object3D; view: StationView; x: number };
  let slotObjs: SlotObj[] = [];
  const steel = std('#C8CCD4', { metalness: 0.85, roughness: 0.3 }), dark = std('#2A2830', { metalness: 0.4, roughness: 0.5 });
  const makeStation = (kind: string, x: number): SlotObj => {
    const g = new THREE.Group(); g.position.set(x, 1.08, -2.5); stations.add(g);
    let glow: THREE.PointLight | undefined, spin: THREE.Object3D | undefined;
    if (kind === 'coffee') {
      mesh(box(0.6, 0.75, 0.5), steel, 0, 0.38, -0.05, g); mesh(box(0.5, 0.12, 0.4), dark, 0, 0.82, -0.05, g);
      mesh(T(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 8)), dark, 0, 0.42, 0.22, g);
      mesh(T(new THREE.CylinderGeometry(0.09, 0.07, 0.14, 12)), std('#FFFFFF'), 0, 0.08, 0.22, g);
      mesh(T(new THREE.SphereGeometry(0.05, 8, 6)), std('#3DDC97', { emissive: '#3DDC97', emissiveIntensity: 1 }), 0.2, 0.62, 0.21, g);
    } else if (kind === 'griddle') {
      mesh(box(0.85, 0.12, 0.6), dark, 0, 0.06, 0, g); mesh(box(0.8, 0.03, 0.55), std('#141216', { metalness: 0.6, roughness: 0.35 }), 0, 0.135, 0, g);
      for (const s of [-1, 1]) mesh(T(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10)), std('#FF9F1C'), s * 0.3, 0.06, 0.31, g).rotation.x = Math.PI / 2;
      glow = new THREE.PointLight('#FF7A2A', 0, 2, 2); glow.position.set(0, 0.3, 0); g.add(glow);
    } else if (kind === 'oven') {
      const brick = std('#B04A2C', { roughness: 0.9 });
      const dome = mesh(T(new THREE.SphereGeometry(0.45, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2)), brick, 0, 0.05, -0.05, g); dome.scale.y = 0.95;
      mesh(box(0.95, 0.08, 0.8), std('#6B3020'), 0, 0.03, -0.05, g);
      const mouth = mesh(T(new THREE.CircleGeometry(0.2, 16, 0, Math.PI)), std('#FF6A1A', { emissive: '#FF5A10', emissiveIntensity: 1.6 }), 0, 0.07, 0.39, g); mouth.castShadow = false;
      mesh(T(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 10)), std('#6B3020'), 0.15, 0.6, -0.2, g);
      glow = new THREE.PointLight('#FF6A1A', 1.2, 2.5, 2); glow.position.set(0, 0.25, 0.4); g.add(glow);
    } else if (kind === 'blender') {
      mesh(T(new THREE.CylinderGeometry(0.2, 0.24, 0.25, 14)), steel, 0, 0.12, 0, g);
      mesh(T(new THREE.CylinderGeometry(0.17, 0.13, 0.5, 14)), std('#CFEFFF', { transparent: true, opacity: 0.45, roughness: 0.05 }), 0, 0.5, 0, g);
      mesh(T(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 14)), dark, 0, 0.77, 0, g);
      const blade = new THREE.Group(); blade.position.y = 0.32; g.add(blade); spin = blade;
      mesh(box(0.22, 0.02, 0.04), steel, 0, 0, 0, blade); mesh(box(0.04, 0.02, 0.22), steel, 0, 0, 0, blade);
      const juice = mesh(T(new THREE.CylinderGeometry(0.14, 0.12, 0.2, 14)), std('#E8457A'), 0, 0.38, 0, g); juice.visible = false; juice.name = 'juice';
    } else {
      mesh(box(0.8, 0.12, 0.6), steel, 0, 0.06, 0, g);
      for (const s of [-1, 1]) mesh(T(new THREE.TorusGeometry(0.13, 0.02, 6, 16)), dark, s * 0.2, 0.13, 0, g).rotation.x = Math.PI / 2;
      mesh(T(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 16)), std('#8A8F99', { metalness: 0.8, roughness: 0.3 }), -0.2, 0.28, 0, g);
      glow = new THREE.PointLight('#3A7BFF', 0, 1.5, 2); glow.position.set(-0.2, 0.15, 0); g.add(glow);
    }
    // a progress ring, the finished dish, smoke
    const ringM = T(new THREE.MeshBasicMaterial({ color: '#3DDC97', transparent: true, depthTest: false }));
    const ring = new THREE.Mesh(T(new THREE.RingGeometry(0.2, 0.28, 32, 1, 0, Math.PI * 2)), ringM); ring.position.set(0, 1.45, 0.2); ring.renderOrder = 5; g.add(ring); ring.visible = false;
    const dish = sprite(emojiTex('🍽️'), 0.55); dish.position.set(0, 1.45, 0.2); dish.renderOrder = 6; g.add(dish); dish.visible = false;
    const smoke: THREE.Sprite[] = []; for (let i = 0; i < 3; i++) { const s = sprite(puffTex, 0.4); g.add(s); s.visible = false; smoke.push(s); }
    const tap = new THREE.Mesh(box(0.9, 1.8, 0.9), new THREE.MeshBasicMaterial({ visible: false })); tap.position.y = 0.8; g.add(tap);
    return { kind, g, ring, ringM, dish, smoke, glow, spin, view: { kind }, x };
  };

  // ---- tables ---------------------------------------------------------------------------------------------------------
  const tables = new THREE.Group(); scene.add(tables);
  const tableObjs: THREE.Group[] = [];
  const seatM = std('#E8484C', { roughness: 0.4 });
  TABLES.forEach(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); tables.add(g); g.userData.table = i;
    mesh(T(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 24)), topM, 0, 0.78, 0, g);
    mesh(T(new THREE.TorusGeometry(0.55, 0.03, 6, 28)), trimM, 0, 0.78, 0, g).rotation.x = Math.PI / 2;
    mesh(T(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 10)), trimM, 0, 0.4, 0, g);
    mesh(T(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16)), trimM, 0, 0.02, 0, g);
    for (const s of [-1, 1]) { mesh(T(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 16)), seatM, s * 0.78, 0.5, 0, g); mesh(T(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8)), trimM, s * 0.78, 0.23, 0, g); }
    const salt = sprite(emojiTex('🧂'), 0.22); salt.position.set(0.25, 0.92, -0.15); g.add(salt);
    const hit = new THREE.Mesh(box(2, 1.4, 1.4), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.7; hit.userData.table = i; g.add(hit);
    g.visible = false; tableObjs.push(g);
  });

  // ---- decor ----------------------------------------------------------------------------------------------------------
  const decor: THREE.Object3D[][] = [[], [], [], [], [], []];
  // 1: fresh paint (the walls get brighter); 2: plants; 3: neon sign; 4: jukebox; 5: chandelier
  for (const [x, z] of [[-5, -1.8], [5, -1.8], [-5, 5.6]]) { const pot = new THREE.Group(); pot.position.set(x, 0, z); scene.add(pot); mesh(T(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 12)), std('#C46A3A'), 0, 0.22, 0, pot); const leaf = sprite(emojiTex('🪴'), 1.1); leaf.position.y = 0.9; pot.add(leaf); decor[2].push(pot); }
  const neonTex = tex(512, 128, (g) => { g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 512, 128); g.shadowColor = '#3BE8FF'; g.shadowBlur = 24; g.strokeStyle = '#7FF3FF'; g.lineWidth = 6; g.font = 'italic bold 78px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText('Eat • Drink', 256, 66); });
  const neon = sprite(neonTex, 3.2, 0.8, true); neon.position.set(-5.4, 3.6, 2); scene.add(neon); decor[3].push(neon);
  const neonL = new THREE.PointLight('#3BE8FF', 3, 5, 2); neonL.position.set(-5, 3.5, 2); scene.add(neonL); decor[3].push(neonL);
  const juke = new THREE.Group(); juke.position.set(-4.9, 0, 5); juke.rotation.y = Math.PI / 2; scene.add(juke); decor[4].push(juke);
  { mesh(box(0.9, 1.3, 0.55), std('#8A2BE2', { roughness: 0.3 }), 0, 0.65, 0, juke); const arch = mesh(T(new THREE.CylinderGeometry(0.45, 0.45, 0.55, 18, 1, false, 0, Math.PI)), std('#FFB13D', { emissive: '#FF9F1C', emissiveIntensity: 0.8 }), 0, 1.3, 0, juke); arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; mesh(box(0.6, 0.4, 0.05), std('#22B8FF', { emissive: '#22B8FF', emissiveIntensity: 0.9 }), 0, 0.85, 0.28, juke); }
  const notes: THREE.Sprite[] = []; for (let i = 0; i < 3; i++) { const n = sprite(emojiTex(i % 2 ? '🎵' : '🎶'), 0.35); scene.add(n); notes.push(n); decor[4].push(n); }
  const chand = new THREE.Group(); chand.position.set(0, 5, 2); scene.add(chand); decor[5].push(chand);
  { mesh(T(new THREE.CylinderGeometry(0.02, 0.02, 1, 4)), trimM, 0, 0.5, 0, chand); mesh(T(new THREE.TorusGeometry(0.6, 0.04, 8, 24)), std('#FFD23F', { metalness: 0.9, roughness: 0.2 }), 0, 0, 0, chand).rotation.x = Math.PI / 2; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const c = sprite(glowTex, 0.35, 0.35, true); (c.material as THREE.SpriteMaterial).color.set('#FFE6A0'); c.position.set(Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6); chand.add(c); } const l = new THREE.PointLight('#FFE0A0', 6, 8, 1.6); l.position.y = -0.2; chand.add(l); }
  const wallColors = ['#7FD1C7', '#93E3D8', '#9AE8DD', '#A3EEE3', '#AEF2E8', '#B8F5EC'];

  // ---- people ---------------------------------------------------------------------------------------------------------
  type Person = { g: THREE.Group; body: THREE.Group; path: THREE.Vector3[]; speed: number; sit?: boolean; face?: number; bubble?: THREE.Sprite; mood: number; order: string[]; leaving?: boolean; bob: number };
  const geos = new Map<string, THREE.BufferGeometry>();
  const G = (k: string, f: () => THREE.BufferGeometry) => { let g = geos.get(k); if (!g) { g = T(f()); geos.set(k, g); } return g; };
  const mats = new Map<string, THREE.Material>();
  const M = (c: string) => { let m = mats.get(c); if (!m) { m = std(c); mats.set(c, m); } return m; };
  const makePerson = (look: number, chef = false): Person => {
    const g = new THREE.Group(); scene.add(g);
    const body = new THREE.Group(); g.add(body);
    const shirt = chef ? '#FFFFFF' : SHIRT[look % SHIRT.length], skin = SKIN[Math.floor(look / 7) % SKIN.length], hair = HAIR[Math.floor(look / 3) % HAIR.length];
    mesh(G('torso', () => new THREE.CapsuleGeometry(0.2, 0.35, 4, 10)), M(shirt), 0, 0.62, 0, body);
    for (const s of [-1, 1]) mesh(G('leg', () => new THREE.CapsuleGeometry(0.07, 0.3, 3, 6)), M(chef ? '#2A2830' : '#3A4A6A'), s * 0.09, 0.2, 0, body);
    mesh(G('head', () => new THREE.SphereGeometry(0.17, 14, 10)), M(skin), 0, 1.05, 0, body);
    if (chef) { mesh(G('hat1', () => new THREE.CylinderGeometry(0.15, 0.13, 0.24, 12)), M('#FFFFFF'), 0, 1.3, 0, body); mesh(G('hat2', () => new THREE.SphereGeometry(0.17, 12, 8)), M('#FFFFFF'), 0, 1.44, 0, body); }
    else if (look % 4 === 0) { const hc = SHIRT[(look + 3) % SHIRT.length]; mesh(G('brim', () => new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14)), M(hc), 0, 1.17, 0, body); mesh(G('crown', () => new THREE.CylinderGeometry(0.13, 0.15, 0.14, 14)), M(hc), 0, 1.24, 0, body); }
    else { const h = mesh(G('hair', () => new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M(hair), 0, 1.07, 0, body); h.rotation.x = -0.2; }
    for (const s of [-1, 1]) mesh(G('eye', () => new THREE.SphereGeometry(0.025, 6, 4)), M('#1A1A1A'), s * 0.06, 1.08, 0.155, body);
    return { g, body, path: [], speed: chef ? 4.2 : 1.9, mood: 1, order: [], bob: Math.random() * 6 };
  };
  const bubbleTex = (order: string[], mood: number) => tex(256, 140, (g) => {
    const col = mood > 0.5 ? '#FFFFFF' : mood > 0.25 ? '#FFE9A8' : '#FFB3B3';
    g.fillStyle = col; g.strokeStyle = '#1C1A1F'; g.lineWidth = 6; g.beginPath(); g.roundRect(8, 8, 240, 100, 30); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(110, 106); g.lineTo(128, 134); g.lineTo(146, 106); g.fill();
    g.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    order.forEach((e, i) => g.fillText(e, 128 + (i - (order.length - 1) / 2) * 84, 62));
  });
  const people = new Map<number, Person>();
  const chef = makePerson(0, true); chef.g.position.set(0, 0, -1.5);
  const waiter = makePerson(5, true); waiter.g.position.set(4.2, 0, 3.6); waiter.g.visible = false;
  const walk = (p: Person, to: THREE.Vector3[]) => { p.path = to.map((v) => v.clone()); };
  const aisle = (z: number) => new THREE.Vector3(4.2, 0, z);

  // ---- bursts ---------------------------------------------------------------------------------------------------------
  type Pop = { s: THREE.Sprite; v: THREE.Vector3; life: number };
  const pops: Pop[] = [];
  const burstAt = (at: THREE.Vector3, emojis: string[]) => { emojis.slice(0, 10).forEach((e, i) => { const s = sprite(emojiTex(e), 0.45); s.position.copy(at); scene.add(s); const a = (i / Math.max(1, emojis.length)) * Math.PI * 2; pops.push({ s, v: new THREE.Vector3(Math.cos(a) * 0.9, 2.2 + Math.random(), Math.sin(a) * 0.6), life: 1.3 }); }); };

  // ---- picking --------------------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const pu = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; } down = null;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects([stations, tables], true)) {
      let ob: THREE.Object3D | null = h.object;
      while (ob && ob.userData.slot === undefined && ob.userData.table === undefined) ob = ob.parent;
      if (!ob || !ob.visible) continue;
      if (ob.userData.slot !== undefined) { o.onTapStation?.(ob.userData.slot); return; }
      if (ob.userData.table !== undefined) { o.onTapTable?.(ob.userData.table); return; }
    }
  };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointerup', pu);

  // ---- loop -----------------------------------------------------------------------------------------------------------
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false;
  const tmp = new THREE.Vector3();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || document.hidden) return;
    tune(dt); t += dt;
    // camera: fit the room's width (tall screens step back)
    const fit = 4.5 / Math.min(1.1, camera.aspect) / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, fit * 0.86, fit * 0.52 + 2); camera.lookAt(0, 0.4, 0.9);
    // stations
    for (const s of slotObjs) {
      const v = s.view;
      s.ring.visible = !!v.cooking; s.dish.visible = !!(v.cooking || v.ready || v.burnt);
      if (v.cooking) {
        if (s.lastP === undefined || Math.abs(s.lastP - v.cooking.p) > 0.02) { s.lastP = v.cooking.p; s.ring.geometry.dispose(); s.ring.geometry = new THREE.RingGeometry(0.3, 0.37, 32, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.02, v.cooking.p)); }
        s.dish.material.map = emojiTex(v.cooking.emoji); s.dish.material.opacity = 0.55; s.dish.scale.setScalar(0.42);
      } else if (v.ready) { s.dish.material.map = emojiTex(v.ready); s.dish.material.opacity = 1; s.dish.scale.setScalar(0.62 + Math.sin(t * 8) * 0.05); s.dish.position.y = 1.45 + Math.sin(t * 5) * 0.06; }
      else if (v.burnt) { s.dish.material.map = emojiTex('💨'); s.dish.material.opacity = 1; s.dish.scale.setScalar(0.55); }
      const busy = !!v.cooking;
      if (s.glow) s.glow.intensity = s.kind === 'oven' ? 1 + (busy ? 1.5 + Math.sin(t * 9) * 0.4 : 0) : busy ? 1.5 + Math.sin(t * 12) * 0.5 : 0;
      if (s.spin) s.spin.rotation.y += dt * (busy ? 30 : 0);
      const juice = s.g.getObjectByName('juice'); if (juice) juice.visible = busy;
      s.smoke.forEach((p, i) => {
        const steamy = busy && (s.kind === 'coffee' || s.kind === 'griddle' || s.kind === 'stove') || v.burnt;
        p.visible = !!steamy && !o.reduceMotion;
        if (!p.visible) return;
        const k = (t * (v.burnt ? 0.9 : 0.6) + i / 3) % 1; p.position.set(Math.sin(i * 2 + t) * 0.12 + (s.kind === 'stove' ? -0.2 : 0), 0.5 + k * 1, 0); p.scale.setScalar(0.25 + k * 0.5);
        p.material.opacity = (1 - k) * (v.burnt ? 0.9 : 0.5); p.material.color.set(v.burnt ? '#444' : '#fff');
      });
    }
    // people walk their paths
    const step = (p: Person) => {
      if (!p.path.length) return false;
      const tgt = p.path[0]; tmp.subVectors(tgt, p.g.position); tmp.y = 0; const d = tmp.length();
      if (d < 0.06) { p.g.position.x = tgt.x; p.g.position.z = tgt.z; p.path.shift(); return true; }
      tmp.normalize(); p.g.position.addScaledVector(tmp, Math.min(d, p.speed * dt)); p.g.rotation.y = Math.atan2(tmp.x, tmp.z);
      p.body.position.y = Math.abs(Math.sin((t + p.bob) * 11)) * 0.06; return true;
    };
    for (const [id, p] of people) {
      const moving = step(p);
      if (!moving && p.leaving) { scene.remove(p.g); if (p.bubble) p.bubble.material.dispose(); people.delete(id); continue; }
      if (!moving && p.sit) { p.body.position.y = -0.18; p.g.rotation.y = p.face ?? 0; }
      if (p.bubble) { p.bubble.position.set(p.g.position.x, 2.15 + Math.sin(t * 2 + p.bob) * 0.04, p.g.position.z); p.bubble.visible = !moving && !!p.sit; }
    }
    step(chef); if (!chef.path.length) chef.body.position.y = 0;
    if (waiter.g.visible) { step(waiter); if (!waiter.path.length && Math.random() < dt * 0.25) walk(waiter, [new THREE.Vector3(-3.5 + Math.random() * 7, 0, 2.1 + Math.random() * 0.4), new THREE.Vector3(4.2, 0, 3.6)]); }
    // decor motion
    if (!o.reduceMotion) {
      notes.forEach((n, i) => { const k = (t * 0.4 + i / 3) % 1; n.position.set(-4.8 + Math.sin(k * 6 + i) * 0.3, 1.8 + k * 1.6, 5); n.material.opacity = 1 - k; });
      chand.rotation.y += dt * 0.15;
      (openSign.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + (Math.sin(t * 3) > 0.92 ? -0.6 : 0.3);
    }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= dt; p.v.y -= 4 * dt; p.s.position.addScaledVector(p.v, dt); p.s.material.opacity = Math.min(1, p.life * 2); if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); pops.splice(i, 1); } }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  const seatOf = (table: number, side: number) => { const [x, z] = TABLES[table]; return new THREE.Vector3(x + (side ? 0.78 : -0.78), 0, z); };
  return {
    /** the counter's stations (left to right), how many tables, decor and crew levels */
    setLayout(st: { kind: string }[], nTables: number, decorLv: number, crew: number) {
      for (const s of slotObjs) stations.remove(s.g);
      const w = 0.95, x0 = -((st.length - 1) * w) / 2;
      slotObjs = st.map((s, i) => { const so = makeStation(s.kind, x0 + i * w); so.g.userData.slot = i; return so; });
      tableObjs.forEach((g, i) => { g.visible = i < nTables; });
      decor.forEach((list, lv) => list.forEach((x) => { x.visible = decorLv >= lv; }));
      wallM.color.set(wallColors[Math.min(decorLv, wallColors.length - 1)]);
      waiter.g.visible = crew > 0;
    },
    setStation(i: number, v: StationView) { const so = slotObjs[i]; if (!so) return; if (!v.cooking) so.lastP = undefined; so.view = v; },
    /** a customer comes in and takes a seat */
    enter(id: number, look: number, table: number, side: number, order: string[]) {
      const p = makePerson(look); p.g.position.copy(DOOR); p.order = order; people.set(id, p);
      const seat = seatOf(table, side);
      walk(p, [aisle(4.6), aisle(seat.z + 0.7), new THREE.Vector3(seat.x, 0, seat.z + 0.7), seat]); p.sit = true; p.face = side ? -Math.PI / 2 : Math.PI / 2;
      p.bubble = sprite(bubbleTex(order, 1), 1.5, 0.82); p.bubble.renderOrder = 8; p.bubble.visible = false; scene.add(p.bubble);
    },
    /** what's still to come for this table, and how patient they are (1 → 0) */
    order(id: number, order: string[], mood: number) {
      const p = people.get(id); if (!p || !p.bubble) return;
      const band = mood > 0.5 ? 2 : mood > 0.25 ? 1 : 0, was = p.mood > 0.5 ? 2 : p.mood > 0.25 ? 1 : 0;
      if (band !== was || order.join() !== p.order.join()) { p.mood = mood; p.order = order; const old = p.bubble.material.map; p.bubble.material.map = bubbleTex(order.length ? order : ['😋'], mood); p.bubble.material.needsUpdate = true; if (old && old !== p.bubble.material.map) { old.dispose(); bag.splice(bag.indexOf(old), 1); } }
    },
    leave(id: number, happy: boolean, tip = 0) {
      const p = people.get(id); if (!p) return;
      burstAt(p.g.position.clone().add(new THREE.Vector3(0, 1.4, 0)), happy ? ['💵', '❤️', ...(tip > 40 ? ['💵', '⭐'] : [])] : ['😡', '💢']);
      if (p.bubble) { scene.remove(p.bubble); p.bubble.material.dispose(); p.bubble = undefined; }
      p.sit = false; p.leaving = true; p.body.position.y = 0;
      walk(p, [new THREE.Vector3(p.g.position.x, 0, p.g.position.z + 0.7), aisle(p.g.position.z + 0.7), aisle(4.6), DOOR.clone(), DOOR.clone().add(new THREE.Vector3(1.5, 0, 0))]);
    },
    /** send everyone home (the shift's over) */
    clear() { for (const id of [...people.keys()]) this.leave(id, true); },
    chefTo(target: { slot?: number; table?: number }) {
      const to = target.slot !== undefined && slotObjs[target.slot] ? new THREE.Vector3(slotObjs[target.slot].x, 0, -1.6) : target.table !== undefined ? new THREE.Vector3(TABLES[target.table][0], 0, TABLES[target.table][1] - 0.75) : new THREE.Vector3(0, 0, -1.5);
      walk(chef, [to]);
    },
    burst(at: { slot?: number; table?: number } | null, emojis: string[]) {
      const p = at?.slot !== undefined && slotObjs[at.slot] ? new THREE.Vector3(slotObjs[at.slot].x, 2.3, -2.4) : at?.table !== undefined ? new THREE.Vector3(TABLES[at.table][0], 1.6, TABLES[at.table][1]) : new THREE.Vector3(0, 2, 1.5);
      burstAt(p, emojis);
    },
    setOpen(open: boolean) { (openSign.material as THREE.MeshStandardMaterial).color.set(open ? '#ffffff' : '#555555'); },
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ people: people.size, stations: slotObjs.map((s) => s.kind), tables: tableObjs.filter((g) => g.visible).length }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointerup', pu);
      for (const p of pops) p.s.material.dispose();
      for (const p of people.values()) p.bubble?.material.dispose();
      scene.traverse((ob) => { if (ob instanceof THREE.Sprite) ob.material.dispose(); });
      for (const s of slotObjs) s.ring.geometry.dispose();
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
}
export type DinerScene = ReturnType<typeof createDiner3D>;
