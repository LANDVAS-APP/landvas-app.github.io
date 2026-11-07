// The Paintbrawl board in 3D: a painted tabletop on a stone dais in a little round arena, torches and banners, a crowd
// that cheers, and the board itself — four terrain lanes a side (grass and flowers, glowing lava cracks, ice
// crystals, mushrooms, candy, a neon grid), totem plinths behind them and each hero's crystal at the ends. Creatures
// stand in their lanes, alive (the same creature art as the cards), with attack and health badges and their status
// (frozen, poisoned, shielded, flourished). Every event plays out: summons splash down in paint, attacks lunge across,
// damage numbers fly, freezes encase, poison bubbles, spells streak across the table and the fallen burst into paint.
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';
import { CARD, LANES, TERRAIN_INFO, type Terrain } from '../shared/brawl/cards';
import type { Ev, Side, Unit, View } from '../shared/brawl/engine';
import { drawCreature, type CreatureState } from '../inkborn/rig';
import { genomeOf } from './cardArt';

export type BoardPick = { side: Side; lane: number }; // lane -1 = the hero
export type Highlight = BoardPick & { kind: 'place' | 'target' | 'flourish' | 'attack' };
export type HeroInfo = { name: string; color: string; badge: string };
export type BoardOpts = { canvas: HTMLCanvasElement; me: Side; reduceMotion?: boolean; onPick?(p: BoardPick): void };

const LX = (lane: number) => (lane - 1.5) * 2.45;
const ROW = 1.75, TOTEM = 3.75, HERO = 5.6;

export function createBoard3D(o: BoardOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !phone; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#120A22'); scene.fog = new THREE.Fog('#120A22', 26, 60);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 150);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...p }));
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; d(cv.getContext('2d')!); const t = T(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const cache = new Map<string, THREE.Texture>();
  const emojiTex = (e: string) => { let t = cache.get(e); if (!t) { t = tex(128, 128, (g) => { g.font = '100px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72); }); cache.set(e, t); } return t; };
  const textTex = (s: string, col: string, size = 64) => { const k = `t:${s}:${col}:${size}`; let t = cache.get(k); if (!t) { t = tex(256, 96, (g) => { g.font = `900 ${size}px ui-rounded, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#140A1E'; g.strokeText(s, 128, 50); g.fillStyle = col; g.fillText(s, 128, 50); }); cache.set(k, t); } return t; };
  const sprite = (t: THREE.Texture, w: number, h = w, add = false) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })); s.scale.set(w, h, 1); return s; };
  const glowTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const flameTex = tex(64, 96, (g) => { const gr = g.createRadialGradient(32, 64, 2, 32, 56, 30); gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(0.4, 'rgba(255,170,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(58, 60, 32, 92); g.quadraticCurveTo(6, 60, 32, 4); g.fill(); });
  const geos = new Map<string, THREE.BufferGeometry>();
  const G = (k: string, f: () => THREE.BufferGeometry) => { let x = geos.get(k); if (!x) { x = T(f()); geos.set(k, x); } return x; };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = !phone; me.receiveShadow = true; parent.add(me); return me; };
  const rowZ = (side: Side) => (side === o.me ? ROW : -ROW);
  const totemZ = (side: Side) => (side === o.me ? TOTEM : -TOTEM);
  const heroZ = (side: Side) => (side === o.me ? HERO : -HERO);

  // ---- light ----------------------------------------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight('#F0E6FF', '#3A2A40', 1.5));
  const key = new THREE.DirectionalLight('#FFE6C8', 2.7); key.position.set(-6, 16, 9); scene.add(key, key.target);
  key.castShadow = !phone; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
  const rim = new THREE.PointLight('#FF4FD8', 30, 30, 1.6); rim.position.set(0, 8, -10); scene.add(rim);

  // ---- the arena ------------------------------------------------------------------------------------------------------
  const stone = tex(256, 256, (g) => { g.fillStyle = '#4A4058'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = `hsl(270, 10%, ${24 + Math.random() * 10}%)`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } });
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping; stone.repeat.set(10, 10);
  mesh(G('floor', () => new THREE.CircleGeometry(30, 48)), std('#ffffff', { map: stone, roughness: 0.95 }), 0, -1.2, 0).rotation.x = -Math.PI / 2;
  // the dais and the table
  mesh(G('dais', () => new THREE.CylinderGeometry(10.5, 11.2, 0.9, 40)), std('#5A4E6A', { roughness: 0.9 }), 0, -0.75, 0);
  const wood = tex(256, 256, (g) => { g.fillStyle = '#6A4228'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${40 + Math.random() * 40},${20 + Math.random() * 20},10,0.35)`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y + 3); g.stroke(); } });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(3, 3);
  mesh(G('table', () => new THREE.BoxGeometry(11.6, 0.5, 13.6)), std('#ffffff', { map: wood, roughness: 0.6 }), 0, -0.25, 0);
  const gold = std('#E8B83A', { metalness: 0.85, roughness: 0.3 });
  for (const [x, z, w, d] of [[0, 6.85, 11.8, 0.2], [0, -6.85, 11.8, 0.2], [5.85, 0, 0.2, 13.8], [-5.85, 0, 0.2, 13.8]]) mesh(G(`trim${w}${d}`, () => new THREE.BoxGeometry(w, 0.18, d)), gold, x, 0.04, z);
  // the middle line
  mesh(G('midline', () => new THREE.BoxGeometry(10.6, 0.02, 0.08)), std('#FFE14D', { emissive: '#FFB13D', emissiveIntensity: 0.6 }), 0, 0.02, 0);
  // the stands and the crowd
  const crowd = new THREE.InstancedMesh(G('fan', () => new THREE.CapsuleGeometry(0.28, 0.5, 3, 6)), T(new THREE.MeshStandardMaterial({ roughness: 0.8 })), phone ? 90 : 180);
  const crowdBase: { x: number; y: number; z: number; p: number }[] = [];
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < crowd.count; i++) {
    const tier = i % 3, a = (i / crowd.count) * Math.PI * 2 * 3 + tier * 0.1, r = 15 + tier * 1.6;
    if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) { crowdBase.push({ x: 999, y: 0, z: 0, p: 0 }); continue; } // leave the camera's gap
    crowdBase.push({ x: Math.sin(a) * r, y: 0.6 + tier * 1.1, z: Math.cos(a) * r, p: Math.random() * 6 });
    col.setHSL(Math.random(), 0.6, 0.55); crowd.setColorAt(i, col);
  }
  scene.add(crowd);
  for (let tier = 0; tier < 3; tier++) { const ring = mesh(G(`stand${tier}`, () => new THREE.TorusGeometry(15 + tier * 1.6, 0.55, 6, 48)), std('#3A3048'), 0, 0.1 + tier * 1.1, 0); ring.rotation.x = Math.PI / 2; }
  // banners and torches
  const torches: { f: THREE.Sprite; l?: THREE.PointLight }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, x = Math.sin(a) * 12.5, z = Math.cos(a) * 12.5;
    mesh(G('post', () => new THREE.CylinderGeometry(0.12, 0.16, 3.4, 8)), std('#3A2A20'), x, 0.5, z);
    const f = sprite(flameTex, 0.9, 1.3, true); f.position.set(x, 2.6, z); scene.add(f);
    const tl = i % 2 === 0 && !phone ? new THREE.PointLight('#FFA040', 6, 9, 1.8) : undefined; if (tl) { tl.position.set(x, 2.8, z); scene.add(tl); }
    torches.push({ f, l: tl });
    const ban = mesh(G('banner', () => new THREE.PlaneGeometry(1.4, 2.4)), std(['#FF4FD8', '#22E3FF', '#FFE14D', '#7B5CFF'][i % 4], { side: THREE.DoubleSide, roughness: 0.9 }), x * 1.18, 3.2, z * 1.18);
    ban.lookAt(0, 3.2, 0);
  }
  // a starry sky dome
  const skyTex = tex(32, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#05030E'); gr.addColorStop(0.6, '#2A1240'); gr.addColorStop(1, '#5A2A6A'); g.fillStyle = gr; g.fillRect(0, 0, 32, 256); });
  const sky = new THREE.Mesh(G('sky', () => new THREE.SphereGeometry(70, 24, 16)), T(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }))); scene.add(sky);
  const stars: THREE.Sprite[] = []; for (let i = 0; i < (phone ? 40 : 90); i++) { const s = sprite(glowTex, 0.25 + Math.random() * 0.3, undefined, true); const a = Math.random() * Math.PI * 2, e = 0.3 + Math.random() * 1.1; s.position.set(Math.cos(a) * 50 * Math.cos(e), 50 * Math.sin(e), Math.sin(a) * 50 * Math.cos(e)); (s.material as THREE.SpriteMaterial).fog = false; scene.add(s); stars.push(s); }
  // drifting paint flecks
  const flecks: THREE.Sprite[] = []; for (let i = 0; i < (phone ? 14 : 30); i++) { const s = sprite(glowTex, 0.18, 0.18, true); s.material.color.setHSL(Math.random(), 0.9, 0.65); s.position.set((Math.random() - 0.5) * 20, Math.random() * 6, (Math.random() - 0.5) * 20); scene.add(s); flecks.push(s); }

  // ---- terrain lanes --------------------------------------------------------------------------------------------------
  const terrainTex: Partial<Record<Terrain, { map: THREE.Texture; glow?: THREE.Texture }>> = {};
  const tTex = (t: Terrain) => {
    if (terrainTex[t]) return terrainTex[t]!;
    const I = TERRAIN_INFO[t];
    const R = (k: number) => Math.random() * k;
    const map = tex(256, 256, (g) => {
      const base: Record<Terrain, string> = { meadow: '#4FA552', ember: '#2A1210', frost: '#CFEFFF', bog: '#3A2A40', sugar: '#FFB3D9', neon: '#120A2A' };
      g.fillStyle = base[t]; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${t === 'frost' || t === 'sugar' ? '255,255,255' : '0,0,0'},${Math.random() * 0.12})`; g.fillRect(R(256), R(256), 3, 3); }
      if (t === 'meadow') for (let i = 0; i < 300; i++) { g.strokeStyle = `hsl(${105 + R(30)}, 55%, ${30 + R(25)}%)`; g.lineWidth = 2; const x = R(256), y = R(256); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(4) - 2, y - 6 - R(6)); g.stroke(); }
      if (t === 'frost') { g.strokeStyle = 'rgba(120,190,240,0.6)'; for (let i = 0; i < 18; i++) { g.lineWidth = 1 + R(2); g.beginPath(); let x = R(256), y = R(256); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += R(50) - 25; y += R(50) - 25; g.lineTo(x, y); } g.stroke(); } }
      if (t === 'bog') for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(120,90,160,0.5)'; g.beginPath(); g.ellipse(R(256), R(256), 20 + R(30), 10 + R(16), R(3), 0, Math.PI * 2); g.fill(); }
      if (t === 'sugar') for (let i = 0; i < 160; i++) { g.fillStyle = ['#FF4D6D', '#3DDC97', '#FFE14D', '#22B8FF', '#FFFFFF'][i % 5]; g.save(); g.translate(R(256), R(256)); g.rotate(R(6)); g.fillRect(-5, -1.5, 10, 3); g.restore(); }
      if (t === 'neon') { g.strokeStyle = '#22E3FF'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.globalAlpha = 0.5; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } g.globalAlpha = 1; }
      if (t === 'ember') { g.strokeStyle = '#FF7A3D'; for (let i = 0; i < 14; i++) { g.lineWidth = 2 + R(3); g.beginPath(); let x = R(256), y = R(256); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += R(40) - 20; y += R(40) - 20; g.lineTo(x, y); } g.stroke(); } }
      // the terrain's colour on the rim
      g.strokeStyle = I.color; g.lineWidth = 10; g.strokeRect(5, 5, 246, 246);
    });
    // what glows: lava cracks, neon lines
    const glow = t === 'ember' || t === 'neon' ? tex(256, 256, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); g.strokeStyle = t === 'ember' ? '#FF7A3D' : '#22E3FF'; g.lineWidth = 3; if (t === 'neon') { for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } } else { for (let i = 0; i < 14; i++) { g.beginPath(); let x = R(256), y = R(256); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += R(40) - 20; y += R(40) - 20; g.lineTo(x, y); } g.stroke(); } } }) : undefined;
    return (terrainTex[t] = { map, glow });
  };
  type LaneObj = { side: Side; lane: number; tile: THREE.Mesh; mat: THREE.MeshStandardMaterial; props: THREE.Group; ring: THREE.Mesh; ringM: THREE.MeshBasicMaterial; terrain?: Terrain; totemSlot: THREE.Mesh; totem: THREE.Group };
  const lanes: LaneObj[] = [];
  const boardGroup = new THREE.Group(); scene.add(boardGroup);
  const ringGeo = G('ring', () => new THREE.RingGeometry(1.05, 1.3, 40));
  for (const side of [0, 1] as Side[]) for (let lane = 0; lane < LANES; lane++) {
    const mat = T(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }));
    const tile = mesh(G('tile', () => new THREE.BoxGeometry(2.2, 0.22, 2.7)), [std('#3A2A30'), std('#3A2A30'), mat, std('#3A2A30'), std('#3A2A30'), std('#3A2A30')] as unknown as THREE.Material, LX(lane), 0.11, rowZ(side), boardGroup);
    tile.userData.pick = { side, lane };
    const props = new THREE.Group(); props.position.set(LX(lane), 0.22, rowZ(side)); boardGroup.add(props);
    const ringM = T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeo, ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(LX(lane), 0.25, rowZ(side)); boardGroup.add(ring);
    const totemSlot = mesh(G('plinth', () => new THREE.CylinderGeometry(0.55, 0.7, 0.35, 16)), std('#5A4E6A'), LX(lane), 0.18, totemZ(side), boardGroup);
    totemSlot.userData.pick = { side, lane };
    const totem = new THREE.Group(); totem.position.set(LX(lane), 0.36, totemZ(side)); boardGroup.add(totem);
    lanes.push({ side, lane, tile, mat, props, ring, ringM, totemSlot, totem });
  }
  const laneOf = (side: Side, lane: number) => lanes.find((l) => l.side === side && l.lane === lane)!;
  const setTerrain = (L: LaneObj, t: Terrain) => {
    if (L.terrain === t) return; L.terrain = t;
    const tt = tTex(t); L.mat.map = tt.map; L.mat.emissiveMap = tt.glow ?? null; L.mat.emissive.set(tt.glow ? '#ffffff' : '#000000'); L.mat.emissiveIntensity = tt.glow ? 0.8 : 0; L.mat.needsUpdate = true;
    L.props.clear();
    const R = (k: number) => (Math.random() - 0.5) * k;
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => mesh(g, m, x, y, z, L.props);
    const corner = () => { const sx = Math.random() < 0.5 ? -1 : 1, sz = Math.random() < 0.5 ? -1 : 1; return [sx * (0.75 + Math.random() * 0.2), sz * (1 + Math.random() * 0.2)]; };
    if (t === 'meadow') for (let i = 0; i < 6; i++) { const [x, z] = corner(); add(G('tuft', () => new THREE.ConeGeometry(0.08, 0.35, 5)), std('#3E9A44'), x, 0.17, z); if (i % 2) add(G('flower', () => new THREE.SphereGeometry(0.07, 8, 6)), std(['#FFE14D', '#FF8AC2', '#FFFFFF'][i % 3]), x + 0.08, 0.3, z); }
    if (t === 'ember') for (let i = 0; i < 3; i++) { const [x, z] = corner(); add(G('rock', () => new THREE.DodecahedronGeometry(0.18, 0)), std('#3A1A10', { emissive: '#FF4A10', emissiveIntensity: 0.35 }), x, 0.12, z); }
    if (t === 'frost') for (let i = 0; i < 3; i++) { const [x, z] = corner(); const c = add(G('crystal', () => new THREE.OctahedronGeometry(0.16, 0)), std('#BFF4FF', { transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.2, emissive: '#6FD3FF', emissiveIntensity: 0.3 }), x, 0.26, z); c.scale.y = 2.2; }
    if (t === 'bog') for (let i = 0; i < 3; i++) { const [x, z] = corner(); add(G('stalk', () => new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6)), std('#E8D8C8'), x, 0.15, z); add(G('cap', () => new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), std(['#FF6FB5', '#9B6BFF', '#3DDC97'][i], { emissive: ['#FF6FB5', '#9B6BFF', '#3DDC97'][i], emissiveIntensity: 0.25 }), x, 0.29, z); }
    if (t === 'sugar') { const [x, z] = corner(); add(G('stick', () => new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6)), std('#FFFFFF'), x, 0.3, z); add(G('pop', () => new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20)), std('#FF4D6D'), x, 0.62, z).rotation.x = Math.PI / 2; const [x2, z2] = corner(); add(G('gum', () => new THREE.SphereGeometry(0.13, 10, 8)), std('#8AE0FF'), x2, 0.13, z2); }
    if (t === 'neon') for (let i = 0; i < 2; i++) { const [x, z] = corner(); add(G('pylon', () => new THREE.CylinderGeometry(0.03, 0.05, 0.7, 6)), std('#1A1A30', { emissive: i ? '#FF4FD8' : '#22E3FF', emissiveIntensity: 1.6 }), x, 0.35, z); }
    void R;
  };

  // ---- heroes ---------------------------------------------------------------------------------------------------------
  type HeroObj = { g: THREE.Group; portrait: THREE.Sprite; hp: THREE.Sprite; hpVal: number; shake: number; crystal: THREE.Mesh; ringM: THREE.MeshBasicMaterial };
  const portraitTex = (h: HeroInfo) => tex(256, 256, (g) => {
    g.fillStyle = h.color; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fill();
    g.lineWidth = 10; g.strokeStyle = '#FFFFFF'; g.stroke();
    g.font = '120px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(h.badge, 128, 140);
  });
  const heroes: HeroObj[] = ([0, 1] as Side[]).map((side) => {
    const g = new THREE.Group(); g.position.set(0, 0, heroZ(side)); scene.add(g);
    mesh(G('heroBase', () => new THREE.CylinderGeometry(1.1, 1.3, 0.4, 24)), std('#3A3048'), 0, 0.2, 0, g);
    const crystal = mesh(G('heroCrystal', () => new THREE.OctahedronGeometry(0.55, 0)), std(side === o.me ? '#22E3FF' : '#FF4FD8', { emissive: side === o.me ? '#22E3FF' : '#FF4FD8', emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3 }), 0, 1.2, 0, g);
    const portrait = sprite(portraitTex({ name: '', color: '#7B5CFF', badge: '🎨' }), 1.5); portrait.position.set(side === o.me ? -2 : 2, 1.3, 0); g.add(portrait);
    const hp = sprite(textTex('25', '#FFFFFF', 72), 1.6, 0.6); hp.position.set(0, 2.3, 0); g.add(hp);
    const ringM = T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0, depthWrite: false }));
    const ring = new THREE.Mesh(G('heroRing', () => new THREE.RingGeometry(1.35, 1.6, 40)), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.42; g.add(ring);
    const hit = new THREE.Mesh(G('heroHit', () => new THREE.CylinderGeometry(1.4, 1.4, 3, 12)), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.4; hit.userData.pick = { side, lane: -1 }; g.add(hit);
    return { g, portrait, hp, hpVal: 25, shake: 0, crystal, ringM };
  });

  // ---- creatures --------------------------------------------------------------------------------------------------------
  type UnitObj = { uid: number; id: string; side: Side; lane: number; g: THREE.Group; fig: THREE.Sprite; cv: HTMLCanvasElement; cg: CanvasRenderingContext2D; tex: THREE.CanvasTexture;
    atk: THREE.Sprite; hp: THREE.Sprite; atkVal: number; hpVal: number; maxVal: number; icons: THREE.Sprite; iconKey: string; base: THREE.Mesh;
    state: CreatureState; flash: number; lunge: number; lungeTo: THREE.Vector3; dying: number; ice: THREE.Mesh; drop: number; seed: number };
  const units = new Map<number, UnitObj>();
  const badgeTex = (n: number, kind: 'atk' | 'hp', mod: number) => {
    const k = `b:${kind}:${n}:${mod}`; let t = cache.get(k); if (t) return t;
    t = tex(96, 96, (g) => {
      g.fillStyle = kind === 'atk' ? '#E8323C' : '#2BB35A';
      if (kind === 'atk') { g.beginPath(); g.moveTo(48, 6); g.lineTo(90, 48); g.lineTo(48, 90); g.lineTo(6, 48); g.closePath(); g.fill(); }
      else { g.beginPath(); g.moveTo(48, 88); g.bezierCurveTo(-10, 50, 14, 4, 48, 28); g.bezierCurveTo(82, 4, 106, 50, 48, 88); g.fill(); }
      g.lineWidth = 5; g.strokeStyle = '#FFFFFF'; g.stroke();
      g.font = '900 46px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.fillStyle = mod > 0 ? '#B8FFC8' : mod < 0 ? '#FFC0C0' : '#FFFFFF'; g.strokeText(String(n), 48, kind === 'hp' ? 46 : 50); g.fillText(String(n), 48, kind === 'hp' ? 46 : 50);
    });
    cache.set(k, t); return t;
  };
  const iconTex = (list: string[]) => { const k = `i:${list.join('')}`; let t = cache.get(k); if (t) return t; t = tex(256, 64, (g) => { g.font = '48px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; list.forEach((e, i) => g.fillText(e, 128 + (i - (list.length - 1) / 2) * 56, 36)); }); cache.set(k, t); return t; };
  const makeUnit = (u: Unit, side: Side, lane: number): UnitObj => {
    const c = CARD[u.id], g = new THREE.Group(); g.position.set(LX(lane), 0.22, rowZ(side)); boardGroup.add(g);
    const color = c.terrain === 'neutral' ? '#B9B4D6' : TERRAIN_INFO[c.terrain].color;
    // a glowing ring in the creature's terrain colour, and a soft shadow under it
    const base = mesh(G('ubase', () => new THREE.TorusGeometry(0.82, 0.07, 8, 36)), std(color, { emissive: color, emissiveIntensity: 1.1 }), 0, 0.06, 0, g); base.rotation.x = Math.PI / 2; base.castShadow = false;
    const shadow = new THREE.Mesh(G('ushadow', () => new THREE.CircleGeometry(0.75, 24)), T(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }))); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
    const cv = document.createElement('canvas'); cv.width = cv.height = phone ? 160 : 224; const cg = cv.getContext('2d')!;
    const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace;
    const fig = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); fig.scale.set(2.9, 2.9, 1); fig.position.y = 0.12; fig.center.set(0.5, 0.04); g.add(fig);
    fig.userData.pick = { side, lane };
    const atk = sprite(badgeTex(0, 'atk', 0), 0.82); atk.position.set(-0.85, 0.5, 0.75); g.add(atk);
    const hp = sprite(badgeTex(0, 'hp', 0), 0.86); hp.position.set(0.85, 0.5, 0.75); g.add(hp);
    const icons = sprite(iconTex([]), 1.6, 0.4); icons.position.set(0, 3.0, 0); g.add(icons);
    const ice = mesh(G('ice', () => new THREE.BoxGeometry(1.5, 2.2, 1.2)), std('#BFF4FF', { transparent: true, opacity: 0.45, roughness: 0.05, emissive: '#6FD3FF', emissiveIntensity: 0.3 }), 0, 1.15, 0, g); ice.visible = false; ice.castShadow = false;
    const hit = new THREE.Mesh(G('uhit', () => new THREE.BoxGeometry(1.8, 2.6, 1.6)), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.3; hit.userData.pick = { side, lane }; g.add(hit);
    const ob: UnitObj = { uid: u.uid, id: u.id, side, lane, g, fig, cv, cg, tex: texture, atk, hp, atkVal: -1, hpVal: -1, maxVal: -1, icons, iconKey: '', base, state: 'idle', flash: 0, lunge: 0, lungeTo: new THREE.Vector3(), dying: 0, ice, drop: 0, seed: Math.random() * 6 };
    units.set(u.uid, ob);
    return ob;
  };
  const drawUnit = (u: UnitObj, t: number) => {
    const c = CARD[u.id], s = u.cv.width; u.cg.clearRect(0, 0, s, s);
    drawCreature(u.cg, genomeOf(c), s / 2, s * 0.96, s * 0.6, { t: t + u.seed, state: u.state, dir: u.side === o.me ? 1 : -1, seed: u.seed });
    u.tex.needsUpdate = true;
  };
  const updateBadges = (u: UnitObj, v: View, side: Side, lane: number) => {
    const L = v.p[side].lanes[lane], d = L.unit!; const c = CARD[d.id];
    // the attack shown is the creature's real attack right now (terrain, totems, auras, the event)
    let a = d.atk + d.temp; const home = c.terrain !== 'neutral' && c.terrain === L.terrain; if (home) a++; if (L.totem?.id === 'kindleshrine') a += 2; if (v.ev === 'bloodmoon') a++;
    for (let i = 0; i < LANES; i++) if (i !== lane && v.p[side].lanes[i].unit?.id === 'gridoverlord') a++;
    if (a !== u.atkVal) { u.atkVal = a; u.atk.material.map = badgeTex(a, 'atk', a - (c.atk ?? 0)); u.atk.material.needsUpdate = true; }
    if (d.hp !== u.hpVal || d.max !== u.maxVal) { u.hpVal = d.hp; u.maxVal = d.max; u.hp.material.map = badgeTex(d.hp, 'hp', d.hp < d.max ? -1 : d.max > (c.hp ?? 0) ? 1 : 0); u.hp.material.needsUpdate = true; }
    const icons = [d.shield ? '🛡️' : '', d.frozen ? '❄️' : '', d.poison ? '☠️' : '', d.acted ? '✋' : '', home ? TERRAIN_INFO[c.terrain as Terrain].emoji : ''].filter(Boolean);
    const k = icons.join(''); if (k !== u.iconKey) { u.iconKey = k; u.icons.material.map = iconTex(icons); u.icons.material.needsUpdate = true; }
    u.ice.visible = !!d.frozen;
  };
  const removeUnit = (u: UnitObj) => { boardGroup.remove(u.g); u.fig.material.dispose(); u.tex.dispose(); for (const s of [u.atk, u.hp, u.icons]) s.material.dispose(); units.delete(u.uid); };

  // ---- totems --------------------------------------------------------------------------------------------------------
  const setTotem = (L: LaneObj, id: string | null) => {
    if ((L.totem.userData.id ?? null) === id) return;
    L.totem.clear(); L.totem.userData.id = id;
    if (!id) return;
    const c = CARD[id], col = c.terrain === 'neutral' ? '#B9B4D6' : TERRAIN_INFO[c.terrain].color;
    const s = sprite(emojiTex(c.art), 1.1); s.position.y = 0.75; L.totem.add(s);
    const gl = sprite(glowTex, 2, 2, true); gl.material.color.set(col); gl.material.opacity = 0.6; gl.position.y = 0.6; L.totem.add(gl);
    L.totem.userData.bob = s;
  };

  // ---- effects --------------------------------------------------------------------------------------------------------
  type Fx = { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; g: number; grow?: number };
  const fx: Fx[] = [];
  const pop = (at: THREE.Vector3, t: THREE.Texture, w = 1, h = 0.4, life = 1, v = new THREE.Vector3(0, 1.6, 0)) => { const s = sprite(t, w, h); s.renderOrder = 10; s.position.copy(at); scene.add(s); fx.push({ s, v, life, max: life, g: 0 }); };
  const splash = (at: THREE.Vector3, color: string, n = 16, speed = 3) => {
    for (let i = 0; i < (phone ? Math.ceil(n / 2) : n); i++) {
      const s = sprite(glowTex, 0.35, 0.35, true); s.material.color.set(color); s.position.copy(at); scene.add(s);
      const a = Math.random() * Math.PI * 2, up = 1 + Math.random() * 2;
      fx.push({ s, v: new THREE.Vector3(Math.cos(a) * speed * Math.random(), up * speed * 0.6, Math.sin(a) * speed * Math.random()), life: 0.7 + Math.random() * 0.4, max: 1.1, g: 7 });
    }
  };
  let shake = 0;
  type Proj = { s: THREE.Sprite; a: THREE.Vector3; b: THREE.Vector3; t: number; dur: number; color: string; done(): void };
  const projs: Proj[] = [];
  const throwAt = (a: THREE.Vector3, b: THREE.Vector3, e: string, color: string, dur = 0.45) => new Promise<void>((res) => { const s = sprite(emojiTex(e), 0.8); s.position.copy(a); scene.add(s); projs.push({ s, a: a.clone(), b: b.clone(), t: 0, dur: o.reduceMotion ? 0.1 : dur, color, done: res }); });
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, o.reduceMotion ? ms * 0.35 : ms));
  const unitAt = (side: Side, lane: number) => [...units.values()].find((u) => u.side === side && u.lane === lane && !u.dying);
  const posOf = (side: Side, lane: number, y = 1.3) => (lane < 0 ? new THREE.Vector3(0, y + 0.4, heroZ(side)) : new THREE.Vector3(LX(lane), y, rowZ(side)));

  // ---- picking ---------------------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const pu = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 14) { down = null; return; } down = null;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(scene.children, true)) { let ob: THREE.Object3D | null = h.object; while (ob && !ob.userData.pick) ob = ob.parent; if (ob?.userData.pick) { o.onPick?.(ob.userData.pick as BoardPick); return; } }
  };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointerup', pu);

  // ---- loop ------------------------------------------------------------------------------------------------------------
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, showcase = 0, lastDraw = 0, cheer = 0;
  const tmp = new THREE.Vector3();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || document.hidden) return;
    tune(dt); t += dt;
    // camera: behind your hero, fitted to the board's width (tall screens step back); the lobby slowly circles
    const half = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const dist = Math.max(12, 6.5 / Math.tan(half));
    const ang = showcase ? Math.sin(t * 0.12) * 0.5 : 0;
    camera.position.set(Math.sin(ang) * dist * 0.62 + (Math.random() - 0.5) * shake, dist * 0.78 + (Math.random() - 0.5) * shake, Math.cos(ang) * dist * 0.62);
    camera.lookAt(0, 0, camera.aspect < 0.8 ? 0.4 : 0.8);
    shake = Math.max(0, shake - dt * 2.5);
    // creatures
    const draw = now - lastDraw > (phone ? 70 : 45); if (draw) lastDraw = now;
    for (const u of units.values()) {
      if (draw) drawUnit(u, t);
      if (u.drop > 0) { u.drop = Math.max(0, u.drop - dt * 2.4); u.g.position.y = 0.22 + u.drop * u.drop * 6; if (u.drop === 0) splash(u.g.position.clone().setY(0.4), CARD[u.id].terrain === 'neutral' ? '#B9B4D6' : TERRAIN_INFO[CARD[u.id].terrain as Terrain].color, 14, 2.5); }
      if (u.lunge > 0) { u.lunge = Math.max(0, u.lunge - dt * 2.8); const k = Math.sin((1 - u.lunge) * Math.PI); const home = new THREE.Vector3(LX(u.lane), 0.22, rowZ(u.side)); u.g.position.lerpVectors(home, u.lungeTo, k * 0.8); }
      if (u.flash > 0) { u.flash -= dt; u.fig.material.color.set(Math.floor(u.flash * 18) % 2 ? '#FF7070' : '#FFFFFF'); } else u.fig.material.color.set('#FFFFFF');
      if (u.dying > 0) { u.dying += dt; u.fig.material.opacity = Math.max(0, 1 - u.dying * 1.6); u.g.scale.setScalar(Math.max(0.01, 1 - u.dying * 0.8)); if (u.dying > 0.75) removeUnit(u); }
    }
    // heroes
    heroes.forEach((h) => { h.crystal.rotation.y += dt * 0.8; h.crystal.position.y = 1.2 + Math.sin(t * 2) * 0.08; if (h.shake > 0) { h.shake -= dt; h.g.position.x = Math.sin(t * 60) * 0.12 * h.shake; } else h.g.position.x = 0; });
    // totems bob, lava and neon pulse, rings breathe
    for (const L of lanes) {
      const b = L.totem.userData.bob as THREE.Sprite | undefined; if (b) b.position.y = 0.75 + Math.sin(t * 2 + L.lane) * 0.08;
      if (L.mat.emissiveMap) L.mat.emissiveIntensity = 0.6 + Math.sin(t * 2 + L.lane) * 0.3;
      if (L.ringM.userData.on) L.ringM.opacity = 0.55 + Math.sin(t * 6) * 0.3;
    }
    for (const h of heroes) if (h.ringM.userData.on) h.ringM.opacity = 0.55 + Math.sin(t * 6) * 0.3;
    // the crowd bobs (and jumps when something big happens)
    cheer = Math.max(0, cheer - dt);
    for (let i = 0; i < crowd.count; i++) { const c = crowdBase[i]; const j = Math.abs(Math.sin(t * (cheer > 0 ? 9 : 2) + c.p)) * (cheer > 0 ? 0.5 : 0.08); m4.makeTranslation(c.x, c.y + j, c.z); crowd.setMatrixAt(i, m4); }
    crowd.instanceMatrix.needsUpdate = true;
    if (!o.reduceMotion) {
      torches.forEach((x, i) => { x.f.scale.set(0.9 + Math.sin(t * 11 + i) * 0.08, 1.3 + Math.sin(t * 7 + i) * 0.15, 1); if (x.l) x.l.intensity = 5 + Math.sin(t * 13 + i) * 1.2; });
      flecks.forEach((s, i) => { s.position.y += dt * 0.25; s.position.x += Math.sin(t + i) * dt * 0.2; if (s.position.y > 7) s.position.y = 0; });
    }
    // projectiles and particles
    for (let i = projs.length - 1; i >= 0; i--) { const p = projs[i]; p.t += dt / p.dur; const k = Math.min(1, p.t); p.s.position.lerpVectors(p.a, p.b, k); p.s.position.y += Math.sin(k * Math.PI) * 2.2; if (Math.random() < 0.6) splash(p.s.position, p.color, 1, 0.6); if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); projs.splice(i, 1); p.done(); } }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt; f.v.y -= f.g * dt; f.s.position.addScaledVector(f.v, dt); f.s.material.opacity = Math.max(0, Math.min(1, (f.life / f.max) * 2)); if (f.life <= 0) { scene.remove(f.s); f.s.material.dispose(); fx.splice(i, 1); } }
    void tmp;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  let current: View | null = null;
  const setHeroHp = (side: Side, n: number) => { const h = heroes[side]; if (h.hpVal === n) return; h.hpVal = n; h.hp.material.map = textTex(String(Math.max(0, n)), n <= 8 ? '#FF8A8A' : '#FFFFFF', 72); h.hp.material.needsUpdate = true; };

  const api = {
    /** Make the board match a view (no animation). */
    setView(v: View) {
      current = v;
      const seen = new Set<number>();
      for (const side of [0, 1] as Side[]) {
        setHeroHp(side, v.p[side].hero);
        v.p[side].lanes.forEach((L, lane) => {
          const lo = laneOf(side, lane); setTerrain(lo, L.terrain); setTotem(lo, L.totem?.id ?? null);
          if (!L.unit) return;
          let u = units.get(L.unit.uid);
          if (u && (u.side !== side || u.lane !== lane)) { u.side = side; u.lane = lane; u.g.position.set(LX(lane), 0.22, rowZ(side)); }
          if (!u) u = makeUnit(L.unit, side, lane);
          if (u.dying) { u.dying = 0; u.fig.material.opacity = 1; u.g.scale.setScalar(1); }
          seen.add(L.unit.uid); updateBadges(u, v, side, lane);
        });
      }
      for (const u of [...units.values()]) if (!seen.has(u.uid) && !u.dying) removeUnit(u);
    },
    setHeroes(list: [HeroInfo, HeroInfo]) { list.forEach((h, i) => { heroes[i].portrait.material.map = portraitTex(h); heroes[i].portrait.material.needsUpdate = true; }); },
    highlight(list: Highlight[]) {
      for (const L of lanes) { L.ringM.userData.on = false; L.ringM.opacity = 0; }
      for (const h of heroes) { h.ringM.userData.on = false; h.ringM.opacity = 0; }
      for (const x of list) {
        const m = x.lane < 0 ? heroes[x.side].ringM : laneOf(x.side, x.lane).ringM;
        m.color.set(x.kind === 'place' ? '#3DDC97' : x.kind === 'target' ? '#FF4D6D' : x.kind === 'flourish' ? '#FFE14D' : '#FF9F1C'); m.userData.on = true;
      }
    },
    /** Play out a move's events, then settle on the view after it. */
    async play(evs: Ev[], after: View) {
      for (const e of evs) {
        switch (e.e) {
          case 'play': {
            const L = after.p[e.side].lanes[e.lane].unit;
            if (L && !units.has(L.uid) && L.uid === e.uid) { const u = makeUnit(L, e.side, e.lane); u.drop = 1; u.state = 'happy'; setTimeout(() => { u.state = 'idle'; }, 900); if (current) updateBadges(u, after, e.side, e.lane); }
            await wait(420); break;
          }
          case 'totem': { const lo = laneOf(e.side, e.lane); setTotem(lo, e.card); splash(new THREE.Vector3(LX(e.lane), 0.8, totemZ(e.side)), '#FFE14D', 12, 2); await wait(300); break; }
          case 'spell': {
            const c = CARD[e.card], col = c.terrain === 'neutral' ? '#FFE14D' : TERRAIN_INFO[c.terrain].color;
            const from = new THREE.Vector3(0, 2, heroZ(e.side));
            if (e.target) await throwAt(from, posOf(e.target.side, e.target.lane), c.art, col);
            else { pop(from.clone().setY(2.6), emojiTex(c.art), 1.4, 1.4, 1); await wait(350); }
            break;
          }
          case 'flourish': {
            const u = unitAt(e.side, e.lane); if (u) { u.state = 'happy'; setTimeout(() => { u.state = 'idle'; }, 700); splash(posOf(e.side, e.lane, 2), '#FFE14D', 18, 2.2); pop(posOf(e.side, e.lane, 2.6), textTex('Flourish!', '#FFE14D', 52), 1.6, 0.6, 0.9); }
            if (e.target) { const c = CARD[e.card], col = c.terrain === 'neutral' ? '#FFE14D' : TERRAIN_INFO[c.terrain].color; await throwAt(posOf(e.side, e.lane, 2), posOf(e.target.side, e.target.lane), '✨', col, 0.35); }
            await wait(300); break;
          }
          case 'attack': {
            const u = unitAt(e.side, e.lane); const to = e.to === 'hero' ? new THREE.Vector3(0, 0.22, heroZ(e.side === 0 ? 1 : 0)) : new THREE.Vector3(LX(e.lane), 0.22, rowZ(e.side === 0 ? 1 : 0));
            if (u) { u.lungeTo.copy(to); u.lunge = 1; u.state = 'walk'; setTimeout(() => { u.state = 'idle'; }, 400); }
            await wait(230); break;
          }
          case 'dmg': {
            const at = posOf(e.side, e.lane, e.lane < 0 ? 2.4 : 2.1);
            if (e.blocked) { pop(at, textTex('Blocked!', '#9AD8FF', 54), 1.6, 0.6, 0.9); splash(at, '#9AD8FF', 10, 2); }
            else {
              pop(at, textTex(`-${e.n}`, e.kind === 'poison' ? '#C89BFF' : e.kind === 'burn' ? '#FFB13D' : '#FF5A5A', 76), 1.2, 0.45, 1);
              splash(at, e.kind === 'poison' ? '#9B6BFF' : e.kind === 'burn' ? '#FF7A3D' : '#FF4D6D', 12, 2.6);
              if (e.lane < 0) { heroes[e.side].shake = 0.5; shake = Math.max(shake, e.n >= 4 ? 0.45 : 0.22); setHeroHp(e.side, Math.max(0, heroes[e.side].hpVal - e.n)); if (e.n >= 4) cheer = 1.2; }
              else { const u = unitAt(e.side, e.lane); if (u) { u.flash = 0.35; u.hpVal -= e.n; u.hp.material.map = badgeTex(u.hpVal, 'hp', -1); u.hp.material.needsUpdate = true; } }
            }
            await wait(190); break;
          }
          case 'heal': { const at = posOf(e.side, e.lane, 2.1); pop(at, textTex(`+${e.n}`, '#7BFFAE', 72), 1.1, 0.42, 1); splash(at, '#7BFFAE', 10, 1.6); if (e.lane < 0) setHeroHp(e.side, heroes[e.side].hpVal + e.n); await wait(160); break; }
          case 'die': { const u = unitAt(e.side, e.lane); if (u) { u.dying = 0.0001; const c = CARD[u.id]; splash(posOf(e.side, e.lane, 1.4), c.terrain === 'neutral' ? '#B9B4D6' : TERRAIN_INFO[c.terrain].color, 26, 4); cheer = 0.8; } await wait(320); break; }
          case 'freeze': { const u = unitAt(e.side, e.lane); if (u) u.ice.visible = true; splash(posOf(e.side, e.lane, 1.6), '#BFF4FF', 16, 2); await wait(220); break; }
          case 'thaw': { const u = unitAt(e.side, e.lane); if (u) u.ice.visible = false; pop(posOf(e.side, e.lane, 2.4), textTex('Thawed', '#BFF4FF', 48), 1.4, 0.5, 0.8); await wait(160); break; }
          case 'poison': { splash(posOf(e.side, e.lane, 1.6), '#9B6BFF', 14, 1.6); pop(posOf(e.side, e.lane, 2.5), emojiTex('☠️'), 0.6, 0.6, 0.9); await wait(180); break; }
          case 'buff': { splash(posOf(e.side, e.lane, 1.2), '#FFE14D', 14, 1.4); pop(posOf(e.side, e.lane, 2.4), textTex(`${e.atk ? `+${e.atk}⚔` : ''}${e.hp ? ` +${e.hp}♥` : ''}`.trim(), '#FFE14D', 50), 1.6, 0.6, 1); await wait(200); break; }
          case 'bounce': { const u = unitAt(e.side, e.lane); if (u) { u.drop = 0; u.lungeTo.set(LX(e.lane), 6, rowZ(e.side)); u.lunge = 1; setTimeout(() => removeUnit(u), 380); } splash(posOf(e.side, e.lane, 1.5), '#FF8AC2', 18, 2.6); await wait(380); break; }
          case 'move': { const u = unitAt(e.side, e.from), v2 = unitAt(e.side, e.to); if (u) { u.lane = e.to; u.g.position.x = LX(e.to); } if (v2) { v2.lane = e.from; v2.g.position.x = LX(e.from); } splash(posOf(e.side, e.to, 1.2), '#8AE0FF', 12, 2); await wait(260); break; }
          case 'terrain': { const lo = laneOf(e.side, e.lane); setTerrain(lo, e.terrain); splash(new THREE.Vector3(LX(e.lane), 0.6, rowZ(e.side)), TERRAIN_INFO[e.terrain].color, 22, 2.6); await wait(320); break; }
          case 'coin': { pop(new THREE.Vector3(0, 3, heroZ(e.side)), emojiTex('🪙'), 1, 1, 1.1); await wait(350); pop(new THREE.Vector3(0, 3.4, heroZ(e.side)), textTex(e.heads ? 'Heads!' : 'Tails', '#FFE14D', 56), 1.6, 0.6, 1); break; }
          case 'fatigue': { pop(new THREE.Vector3(0, 3, heroZ(e.side)), textTex('Out of cards!', '#FF8A8A', 44), 2.2, 0.6, 1.2); await wait(300); break; }
          case 'over': { cheer = 3; for (let i = 0; i < 4; i++) splash(new THREE.Vector3((Math.random() - 0.5) * 8, 2, (Math.random() - 0.5) * 6), ['#FF4FD8', '#FFE14D', '#22E3FF', '#3DDC97'][i], 30, 5); break; }
        }
      }
      api.setView(after);
    },
    /** The lobby: just the scenery and your lanes, the camera drifting. */
    setShowcase(on: boolean) { showcase = on ? 1 : 0; },
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ units: units.size, lanes: lanes.map((l) => l.terrain), fx: fx.length }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointerup', pu);
      for (const u of [...units.values()]) removeUnit(u);
      scene.traverse((ob) => { if (ob instanceof THREE.Sprite) ob.material.dispose(); });
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
  return api;
}
export type Board3D = ReturnType<typeof createBoard3D>;
