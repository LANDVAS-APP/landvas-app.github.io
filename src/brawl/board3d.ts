// The Paintbrawl board in 3D: a painted tabletop on a stone dais in a little round arena, torches and banners, a crowd
// that cheers, and the board itself — four terrain lanes a side (grass and flowers, glowing lava cracks, ice
// crystals, mushrooms, candy, a neon grid), totem plinths behind them and each hero's crystal at the ends. Creatures
// stand in their lanes, alive (the same creature art as the cards), with attack and health badges and their status
// (frozen, poisoned, shielded, flourished). Every event plays out: summons splash down in paint, attacks lunge across,
// damage numbers fly, freezes encase, poison bubbles, spells streak across the table and the fallen burst into paint.
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';
import { CARD, LANES, TERRAIN_INFO, type Terrain } from '../shared/brawl/cards';
import { buildWonder, makeScenes, Particles, type Ctx, type WonderModel } from './fx3d';
import { otherSide, type Ev, type Side, type Unit, type View } from '../shared/brawl/engine';
import { buildCreature, type Creature3D, type Pose } from './creature3d';
import { buildLand, LAND_D, LAND_TOP, LAND_W, type Emitter, type Land } from './lands3d';
import { genomeOf } from './cardArt';

export type BoardPick = { side: Side; lane: number }; // lane -1 = the hero
export type Highlight = BoardPick & { kind: 'place' | 'target' | 'flourish' | 'attack' };
export type HeroInfo = { name: string; color: string; badge: string };
export type BoardOpts = { canvas: HTMLCanvasElement; me: Side; reduceMotion?: boolean; onPick?(p: BoardPick): void };

// the board's size: four wide lanes a side (bigger than they used to be), totems and wonders behind them, heroes at the ends
const LX = (lane: number) => (lane - 1.5) * 3.05;
const ROW = 2.45, TOTEM = 5.55, HERO = 7.55;
const TW = 13.6, TD = 20.6; // the table
const BASE = LAND_TOP;      // where creatures stand

export function createBoard3D(o: BoardOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !phone; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#120A22'); scene.fog = new THREE.Fog('#120A22', 34, 90);
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
  const disposeTree = (x: THREE.Object3D) => x.traverse((y) => { const m = y as THREE.Mesh; if (m.geometry && ![...geos.values()].includes(m.geometry)) m.geometry.dispose(); const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []; for (const mm of mats) if (!bag.includes(mm)) mm.dispose(); });
  const rowZ = (side: Side) => (side === o.me ? ROW : -ROW);
  const totemZ = (side: Side) => (side === o.me ? TOTEM : -TOTEM);
  const heroZ = (side: Side) => (side === o.me ? HERO : -HERO);

  // ---- light ----------------------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight('#F0E6FF', '#3A2A40', 1.5); scene.add(hemi);
  const key = new THREE.DirectionalLight('#FFE6C8', 2.7); key.position.set(-6, 16, 9); scene.add(key, key.target);
  key.castShadow = !phone; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -13, right: 13, top: 14, bottom: -14, near: 1, far: 60 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
  const rim = new THREE.PointLight('#FF4FD8', 30, 30, 1.6); rim.position.set(0, 8, -10); scene.add(rim);

  // ---- the arena ------------------------------------------------------------------------------------------------------
  const stone = tex(256, 256, (g) => { g.fillStyle = '#4A4058'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = `hsl(270, 10%, ${24 + Math.random() * 10}%)`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } });
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping; stone.repeat.set(10, 10);
  mesh(G('floor', () => new THREE.CircleGeometry(36, 48)), std('#ffffff', { map: stone, roughness: 0.95 }), 0, -1.2, 0).rotation.x = -Math.PI / 2;
  // the dais and the table
  mesh(G('dais', () => new THREE.CylinderGeometry(13.2, 14, 0.9, 48)), std('#5A4E6A', { roughness: 0.9 }), 0, -0.75, 0);
  const wood = tex(256, 256, (g) => { g.fillStyle = '#6A4228'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${40 + Math.random() * 40},${20 + Math.random() * 20},10,0.35)`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y + 3); g.stroke(); } });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(3, 3);
  mesh(G('table', () => new THREE.BoxGeometry(TW, 0.5, TD)), std('#ffffff', { map: wood, roughness: 0.6 }), 0, -0.25, 0);
  const gold = std('#E8B83A', { metalness: 0.85, roughness: 0.3 });
  for (const [x, z, w, d] of [[0, TD / 2 + 0.05, TW + 0.2, 0.2], [0, -TD / 2 - 0.05, TW + 0.2, 0.2], [TW / 2 + 0.05, 0, 0.2, TD + 0.2], [-TW / 2 - 0.05, 0, 0.2, TD + 0.2]]) mesh(G(`trim${w}${d}`, () => new THREE.BoxGeometry(w, 0.18, d)), gold, x, 0.04, z);
  // the middle line
  mesh(G('midline', () => new THREE.BoxGeometry(TW - 0.8, 0.02, 0.08)), std('#FFE14D', { emissive: '#FFB13D', emissiveIntensity: 0.6 }), 0, 0.02, 0);
  // the stands and the crowd
  const crowd = new THREE.InstancedMesh(G('fan', () => new THREE.CapsuleGeometry(0.28, 0.5, 3, 6)), T(new THREE.MeshStandardMaterial({ roughness: 0.8 })), phone ? 90 : 180);
  const crowdBase: { x: number; y: number; z: number; p: number }[] = [];
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < crowd.count; i++) {
    const tier = i % 3, a = (i / crowd.count) * Math.PI * 2 * 3 + tier * 0.1, r = 19 + tier * 1.6;
    if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) { crowdBase.push({ x: 999, y: 0, z: 0, p: 0 }); continue; } // leave the camera's gap
    crowdBase.push({ x: Math.sin(a) * r, y: 0.6 + tier * 1.1, z: Math.cos(a) * r, p: Math.random() * 6 });
    col.setHSL(Math.random(), 0.6, 0.55); crowd.setColorAt(i, col);
  }
  scene.add(crowd);
  for (let tier = 0; tier < 3; tier++) { const ring = mesh(G(`stand${tier}`, () => new THREE.TorusGeometry(19 + tier * 1.6, 0.55, 6, 48)), std('#3A3048'), 0, 0.1 + tier * 1.1, 0); ring.rotation.x = Math.PI / 2; }
  // banners and torches
  const torches: { f: THREE.Sprite; l?: THREE.PointLight }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, x = Math.sin(a) * 15.6, z = Math.cos(a) * 15.6;
    mesh(G('post', () => new THREE.CylinderGeometry(0.12, 0.16, 3.4, 8)), std('#3A2A20'), x, 0.5, z);
    const f = sprite(flameTex, 0.9, 1.3, true); f.position.set(x, 2.6, z); scene.add(f);
    const tl = i % 2 === 0 && !phone ? new THREE.PointLight('#FFA040', 6, 9, 1.8) : undefined; if (tl) { tl.position.set(x, 2.8, z); scene.add(tl); }
    torches.push({ f, l: tl });
    const ban = mesh(G('banner', () => new THREE.PlaneGeometry(1.4, 2.4)), std(['#FF4FD8', '#22E3FF', '#FFE14D', '#7B5CFF'][i % 4], { side: THREE.DoubleSide, roughness: 0.9 }), x * 1.18, 3.2, z * 1.18);
    ban.lookAt(0, 3.2, 0);
  }
  // a starry sky dome
  const skyTex = tex(32, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#05030E'); gr.addColorStop(0.6, '#2A1240'); gr.addColorStop(1, '#5A2A6A'); g.fillStyle = gr; g.fillRect(0, 0, 32, 256); });
  const skyMat = T(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  const sky = new THREE.Mesh(G('sky', () => new THREE.SphereGeometry(70, 24, 16)), skyMat); scene.add(sky);
  const stars: THREE.Sprite[] = []; for (let i = 0; i < (phone ? 40 : 90); i++) { const s = sprite(glowTex, 0.25 + Math.random() * 0.3, undefined, true); const a = Math.random() * Math.PI * 2, e = 0.3 + Math.random() * 1.1; s.position.set(Math.cos(a) * 50 * Math.cos(e), 50 * Math.sin(e), Math.sin(a) * 50 * Math.cos(e)); (s.material as THREE.SpriteMaterial).fog = false; scene.add(s); stars.push(s); }
  // drifting paint flecks
  const flecks: THREE.Sprite[] = []; for (let i = 0; i < (phone ? 14 : 30); i++) { const s = sprite(glowTex, 0.18, 0.18, true); s.material.color.setHSL(Math.random(), 0.9, 0.65); s.position.set((Math.random() - 0.5) * 20, Math.random() * 6, (Math.random() - 0.5) * 20); scene.add(s); flecks.push(s); }

  // ---- the lanes: a land diorama each (rising out of the table when its land card is placed), a ring that glows
  // when it can be picked, an invisible box to tap or drop on, and a plinth behind it for totems and wonders ----------
  type LaneObj = { side: Side; lane: number; holder: THREE.Group; land: Land | null; terrain?: Terrain | null; ring: THREE.Mesh; ringM: THREE.MeshBasicMaterial; pick: THREE.Mesh; totemSlot: THREE.Mesh; totem: THREE.Group & { userData: { id?: string | null; bob?: THREE.Sprite; model?: WonderModel | null; n?: number } }; hover: number };
  const lanes: LaneObj[] = [];
  const boardGroup = new THREE.Group(); scene.add(boardGroup);
  const pickables: THREE.Object3D[] = [];
  const ringGeo = G('ring', () => new THREE.RingGeometry(1.34, 1.62, 48));
  const pickGeo = G('lanePick', () => new THREE.BoxGeometry(LAND_W, 3, LAND_D));
  const invisible = T(new THREE.MeshBasicMaterial({ visible: false }));
  for (const side of [0, 1] as Side[]) for (let lane = 0; lane < LANES; lane++) {
    const holder = new THREE.Group(); holder.position.set(LX(lane), 0, rowZ(side)); boardGroup.add(holder);
    const ringM = T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeo, ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(LX(lane), BASE + 0.06, rowZ(side)); ring.renderOrder = 4; boardGroup.add(ring);
    const pick = new THREE.Mesh(pickGeo, invisible); pick.position.set(LX(lane), 1.3, rowZ(side)); pick.userData.pick = { side, lane }; boardGroup.add(pick); pickables.push(pick);
    const totemSlot = mesh(G('plinth', () => new THREE.CylinderGeometry(0.62, 0.78, 0.35, 18)), std('#5A4E6A'), LX(lane), 0.18, totemZ(side), boardGroup);
    totemSlot.userData.pick = { side, lane }; pickables.push(totemSlot);
    const totem = new THREE.Group() as LaneObj['totem']; totem.position.set(LX(lane), 0.36, totemZ(side)); boardGroup.add(totem);
    lanes.push({ side, lane, holder, land: null, ring, ringM, pick, totemSlot, totem, hover: 0 });
  }
  const laneOf = (side: Side, lane: number) => lanes.find((l) => l.side === side && l.lane === lane)!;
  /** Put a land in a lane (null = the bare stone slab). With `grow`, it rises out of the table. */
  const setTerrain = (L: LaneObj, t: Terrain | null, grow = false) => {
    if (L.land && L.terrain === t) return;
    const old = L.land;
    if (old) {
      if (grow) { const g = old.group; void tween(0.45, (k) => { g.position.y = -k * 0.8; g.scale.y = Math.max(0.01, 1 - k); }).then(() => { L.holder.remove(g); old.dispose(); }); }
      else { L.holder.remove(old.group); old.dispose(); }
    }
    const land = buildLand(t, { phone }); L.land = land; L.terrain = t; L.holder.add(land.group);
    if (grow && t) {
      land.grow(0);
      const col = TERRAIN_INFO[t].color;
      void tween(1.3, (k) => land.grow(k));
      for (let i = 0; i < (phone ? 18 : 40); i++) addP.emit({ x: LX(L.lane) + (Math.random() - 0.5) * LAND_W, y: 0.3, z: rowZ(L.side) + (Math.random() - 0.5) * LAND_D, vy: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, color: Math.random() < 0.5 ? col : '#FFFFFF', size: 0.3, gravity: 6, life: 1 });
      softP.emit({ x: LX(L.lane), y: 0.3, z: rowZ(L.side), vy: 0.6, color: '#8A7A64', size: 3, grow: 2, life: 1.2, alpha: 0.4 });
      shake = Math.max(shake, 0.18);
    } else land.grow(1);
  };
  // what the lands give off (smoke from vents, embers, snow, bubbles, sparks, fireflies)
  const emitLand: Emitter = (kind, x, y, z) => {
    if (phone && Math.random() < 0.4) return;
    const r = (a: number) => (Math.random() - 0.5) * a;
    switch (kind) {
      case 'smoke': softP.emit({ x, y, z, vx: 0.15 + r(0.2), vy: 0.6 + Math.random() * 0.5, vz: r(0.2), color: '#3A3038', size: 0.55, grow: 0.7, life: 2.2, alpha: 0.45, drag: 0.3 }); break;
      case 'ember': addP.emit({ x, y, z, vx: r(0.4), vy: 0.7 + Math.random() * 0.8, vz: r(0.4), color: Math.random() < 0.5 ? '#FFB040' : '#FF6A10', size: 0.11, life: 1.6, drag: 0.3 }); break;
      case 'snow': softP.emit({ x, y, z, vx: r(0.3), vy: -0.45, vz: r(0.3), color: '#FFFFFF', size: 0.11, life: 4.5, alpha: 0.95 }); break;
      case 'bubble': addP.emit({ x, y, z, vy: 0.35, color: '#D8B8FF', size: 0.1, life: 0.7 }); break;
      case 'spark': addP.emit({ x, y, z, vy: 1.2 + Math.random(), color: Math.random() < 0.5 ? '#22E3FF' : '#FF4FD8', size: 0.09, life: 0.8 }); break;
      case 'firefly': addP.emit({ x, y, z, vx: r(0.4), vy: r(0.2), vz: r(0.4), color: '#FFF2A0', size: 0.13, life: 2.6, drag: 0.6 }); break;
    }
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
    const hit = new THREE.Mesh(G('heroHit', () => new THREE.CylinderGeometry(1.4, 1.4, 3, 12)), invisible); hit.position.y = 1.4; hit.userData.pick = { side, lane: -1 }; g.add(hit); pickables.push(hit);
    return { g, portrait, hp, hpVal: 25, shake: 0, crystal, ringM };
  });

  // ---- creatures --------------------------------------------------------------------------------------------------------
  type UnitObj = { uid: number; id: string; side: Side; lane: number; g: THREE.Group; cr: Creature3D; hit: THREE.Mesh;
    atk: THREE.Sprite; hp: THREE.Sprite; atkVal: number; hpVal: number; maxVal: number; icons: THREE.Sprite; iconKey: string; base: THREE.Mesh;
    state: 'idle' | 'walk' | 'happy'; flash: number; hurtOn: boolean; lunge: number; lungeTo: THREE.Vector3; dying: number; ice: THREE.Mesh; rise: number; seed: number };
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
    const c = CARD[u.id], g = new THREE.Group(); g.position.set(LX(lane), BASE, rowZ(side)); boardGroup.add(g);
    const color = c.terrain === 'neutral' ? '#B9B4D6' : TERRAIN_INFO[c.terrain].color;
    // a glowing ring in the creature's terrain colour, and a soft shadow under it
    const base = mesh(G('ubase', () => new THREE.TorusGeometry(1.0, 0.06, 8, 40)), std(color, { emissive: color, emissiveIntensity: 1.2 }), 0, 0.05, 0, g); base.rotation.x = Math.PI / 2; base.castShadow = false;
    const shadow = new THREE.Mesh(G('ushadow', () => new THREE.CircleGeometry(0.85, 24)), T(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }))); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.025; g.add(shadow);
    // the creature itself, in 3D, facing the other side
    const cr = buildCreature(c, genomeOf(c), { phone }); cr.root.scale.setScalar(1.45); cr.root.rotation.y = facing(side, lane); g.add(cr.root);
    const top = Math.max(1.7, cr.height * 1.45);
    const atk = sprite(badgeTex(0, 'atk', 0), 0.95); atk.position.set(-1.05, 0.5, 0.95); atk.renderOrder = 8; g.add(atk);
    const hp = sprite(badgeTex(0, 'hp', 0), 1.0); hp.position.set(1.05, 0.5, 0.95); hp.renderOrder = 8; g.add(hp);
    const icons = sprite(iconTex([]), 1.8, 0.45); icons.position.set(0, top + 0.45, 0); g.add(icons);
    const ice = mesh(G('ice', () => new THREE.BoxGeometry(1.7, 1, 1.6)), std('#BFF4FF', { transparent: true, opacity: 0.45, roughness: 0.05, emissive: '#6FD3FF', emissiveIntensity: 0.3 }), 0, (top + 0.3) / 2, 0, g); ice.scale.y = top + 0.3; ice.visible = false; ice.castShadow = false;
    const hit = new THREE.Mesh(G('uhit', () => new THREE.BoxGeometry(2.4, 1, 2.6)), invisible); hit.scale.y = top + 0.5; hit.position.set(LX(lane), BASE + (top + 0.5) / 2, rowZ(side)); hit.userData.pick = { side, lane }; boardGroup.add(hit); pickables.push(hit);
    const ob: UnitObj = { uid: u.uid, id: u.id, side, lane, g, cr, hit, atk, hp, atkVal: -1, hpVal: -1, maxVal: -1, icons, iconKey: '', base, state: 'idle', flash: 0, hurtOn: false, lunge: 0, lungeTo: new THREE.Vector3(), dying: 0, ice, rise: 0, seed: Math.random() * 6 };
    units.set(u.uid, ob);
    return ob;
  };
  /** Which way a creature faces: towards the other side, turned three-quarters in towards the middle, so you see
   *  its face from behind your own lines too. */
  function facing(side: Side, lane: number) { const inward = lane < 2 ? 1 : -1; return side === o.me ? Math.PI - 0.85 * inward : 0.5 * inward; }
  /** A creature coming up out of its lane: the ground cracks open with a ring of light, dirt flies, and up it climbs. */
  const riseUp = (u: UnitObj) => {
    u.rise = 1; u.state = 'happy'; setTimeout(() => { u.state = 'idle'; }, 1300);
    const c = CARD[u.id], col = c.terrain === 'neutral' ? '#E8E0FF' : TERRAIN_INFO[c.terrain].color;
    const at = u.g.position;
    scenes.shockwave(at.x, BASE + 0.06, at.z, col, 2.6, 0.7);
    for (let i = 0; i < (phone ? 14 : 34); i++) { const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6; softP.emit({ x: at.x + Math.cos(a) * r, y: BASE + 0.1, z: at.z + Math.sin(a) * r, vx: Math.cos(a) * 1.5, vy: 2 + Math.random() * 2.5, vz: Math.sin(a) * 1.5, color: '#5A4430', size: 0.22, gravity: 9, life: 0.9, alpha: 0.95 }); }
    for (let i = 0; i < (phone ? 12 : 26); i++) { const a = Math.random() * Math.PI * 2; addP.emit({ x: at.x + Math.cos(a) * 0.9, y: BASE + 0.1, z: at.z + Math.sin(a) * 0.9, vy: 2.5 + Math.random() * 2, color: Math.random() < 0.6 ? col : '#FFFFFF', size: 0.22, gravity: 2, life: 1.1 }); }
    softP.emit({ x: at.x, y: BASE + 0.2, z: at.z, vy: 0.5, color: '#8A7A64', size: 2.4, grow: 1.5, life: 1.1, alpha: 0.45 });
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
  const removeUnit = (u: UnitObj) => { boardGroup.remove(u.g); boardGroup.remove(u.hit); const i = pickables.indexOf(u.hit); if (i >= 0) pickables.splice(i, 1); u.cr.dispose(); for (const s of [u.atk, u.hp, u.icons]) s.material.dispose(); units.delete(u.uid); };

  // ---- totems --------------------------------------------------------------------------------------------------------
  const labelTex = (s: string) => textTex(s, '#FFB13D', 76);
  const setTotem = (L: LaneObj, id: string | null, n?: number) => {
    if ((L.totem.userData.id ?? null) === id) { if (n !== undefined && L.totem.userData.n !== n && L.totem.userData.model?.userData.label) { L.totem.userData.n = n; L.totem.userData.model.userData.label.material.map = labelTex(n > 0 ? `${n}` : '!'); } return; }
    for (const ch of [...L.totem.children]) { L.totem.remove(ch); if (ch !== L.totem.userData.bob) disposeTree(ch); }
    L.totem.userData = { id }; L.totem.rotation.set(0, 0, 0); L.totem.scale.setScalar(1); L.totem.position.y = 0.36;
    if (!id) return;
    const c = CARD[id], col = c.terrain === 'neutral' ? '#B9B4D6' : TERRAIN_INFO[c.terrain].color;
    if (c.wonder) {
      const m = buildWonder(id, labelTex, glowTex);
      if (m) { m.scale.setScalar(1.35); m.traverse((x) => { (x as THREE.Mesh).castShadow = !phone; }); L.totem.add(m); L.totem.userData.model = m; if (n !== undefined && m.userData.label) { L.totem.userData.n = n; m.userData.label.material.map = labelTex(`${n}`); } return; }
    }
    const s = sprite(emojiTex(c.art), 1.1); s.position.y = 0.75; L.totem.add(s);
    const gl = sprite(glowTex, 2, 2, true); gl.material.color.set(col); gl.material.opacity = 0.6; gl.position.y = 0.6; L.totem.add(gl);
    L.totem.userData.bob = s;
  };

  // ---- effects --------------------------------------------------------------------------------------------------------
  type Fx = { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; g: number; grow?: number };
  const fx: Fx[] = [];
  const pop = (at: THREE.Vector3, t: THREE.Texture, w = 1, h = 0.4, life = 1, v = new THREE.Vector3(0, 1.6, 0)) => { const s = sprite(t, w, h); s.renderOrder = 10; s.position.copy(at); scene.add(s); fx.push({ s, v, life, max: life, g: 0 }); };
  // GPU particles: glowing (sparks, fire, magic) and soft (smoke, dust, snow, steam)
  const addP = new Particles(phone ? 1400 : 3200, glowTex, true), softP = new Particles(phone ? 700 : 1600, glowTex, false);
  scene.add(addP.points, softP.points); bag.push(addP, softP);
  const splash = (at: THREE.Vector3, color: string, n = 16, speed = 3) => {
    for (let i = 0; i < (phone ? Math.ceil(n * 0.6) : n); i++) {
      const a = Math.random() * Math.PI * 2, up = 1 + Math.random() * 2;
      addP.emit({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * speed * Math.random(), vy: up * speed * 0.6, vz: Math.sin(a) * speed * Math.random(), color, size: 0.32 + Math.random() * 0.2, gravity: 7, life: 0.7 + Math.random() * 0.4, drag: 0.4 });
    }
  };
  let shake = 0;
  // little tweens and per-frame jobs for the big scenes
  type Tw = { t: number; dur: number; fn: (k: number, dt: number) => void; res: () => void };
  const tweens: Tw[] = [];
  const tween = (dur: number, fn: (k: number, dt: number) => void) => new Promise<void>((res) => { const d = o.reduceMotion ? dur * 0.35 : dur; if (d <= 0) { fn(1, 0); res(); return; } tweens.push({ t: 0, dur: d, fn, res }); });
  const jobs: ((dt: number, t: number) => boolean | void)[] = [];
  // the mood of the arena: how bright, what colour the sky is, lightning flashes
  const skyBase = new THREE.Color('#120A22'), skyNow = skyBase.clone(), skyGoal = skyBase.clone(), white = new THREE.Color('#FFFFFF');
  let dim = 1, dimGoal = 1, flash = 0, tinted = 0, tintGoal = 0;
  const mood = (m: { dim?: number; sky?: string; flash?: number }) => { if (m.flash) { flash = Math.max(flash, m.flash); if (m.dim === undefined && m.sky === undefined) return; } dimGoal = m.dim ?? 1; skyGoal.set(m.sky ?? '#120A22'); tintGoal = m.sky ? 1 : 0; };
  // the big title of a cataclysm, floating in front of the camera
  const titleTex = (text: string, color: string, sub?: string) => tex(1024, 320, (g) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 150px ui-rounded, system-ui'; g.lineWidth = 22; g.strokeStyle = '#140A1E'; g.strokeText(text, 512, 130, 1000);
    const gr = g.createLinearGradient(0, 60, 0, 200); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, color); g.fillStyle = gr; g.fillText(text, 512, 130, 1000);
    if (sub) { g.font = 'italic 700 54px ui-rounded, system-ui'; g.lineWidth = 10; g.strokeText(sub, 512, 262, 980); g.fillStyle = '#FFFFFF'; g.fillText(sub, 512, 262, 980); }
  });
  scene.add(camera);
  const bigText = (text: string, color: string, sub?: string) => {
    const t = titleTex(text, color, sub);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false })); sp.renderOrder = 40;
    // as wide as the screen allows (12 units in front of the camera)
    const w = Math.min(8, 2 * Math.tan((camera.fov * Math.PI) / 360) * 12 * camera.aspect * 0.94);
    sp.position.set(0, 1.6, -12); camera.add(sp);
    void tween(2.2, (k) => { const pop = k < 0.12 ? k / 0.12 : 1; const s = (0.6 + 0.4 * pop + Math.sin(Math.min(1, k * 8) * Math.PI) * 0.12) * w; sp.scale.set(s, s * 0.3125, 1); sp.material.opacity = k > 0.75 ? 1 - (k - 0.75) * 4 : 1; sp.position.y = 1.6 + k * 0.4; })
      .then(() => { camera.remove(sp); sp.material.dispose(); t.dispose(); });
  };
  type Proj = { s: THREE.Sprite; a: THREE.Vector3; b: THREE.Vector3; t: number; dur: number; color: string; done(): void };
  const projs: Proj[] = [];
  const throwAt = (a: THREE.Vector3, b: THREE.Vector3, e: string, color: string, dur = 0.45) => new Promise<void>((res) => { const s = sprite(emojiTex(e), 0.8); s.position.copy(a); scene.add(s); projs.push({ s, a: a.clone(), b: b.clone(), t: 0, dur: o.reduceMotion ? 0.1 : dur, color, done: res }); });
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, o.reduceMotion ? ms * 0.35 : ms));
  const unitAt = (side: Side, lane: number) => [...units.values()].find((u) => u.side === side && u.lane === lane && !u.dying);
  const posOf = (side: Side, lane: number, y = 1.3) => (lane < 0 ? new THREE.Vector3(0, y + 0.4, heroZ(side)) : new THREE.Vector3(LX(lane), y, rowZ(side)));

  // ---- the big scenes (cataclysms, wonders going off) -------------------------------------------------------------------
  const ctx: Ctx = {
    scene, camera, phone, reduce: !!o.reduceMotion, me: o.me, add: addP, soft: softP, tween, wait, every: (fn) => { jobs.push(fn); },
    LX, rowZ, totemZ, heroZ, tableW: TW, tableD: TD,
    shake: (n) => { shake = Math.max(shake, n); }, cheer: (n) => { cheer = Math.max(cheer, n); }, mood,
    unitGroups: (side, lane) => [...units.values()].filter((u) => u.side === side && !u.dying && (lane === undefined || u.lane === lane)).map((u) => u.g),
    totemGroup: (side, lane) => laneOf(side, lane).totem,
    laneTiles: (side) => lanes.filter((l) => l.side === side).map((l) => l.holder),
    bigText, glowTex,
  };
  const scenes = makeScenes(ctx);
  const modelAt = (side: Side, lane: number) => laneOf(side, lane).totem.userData.model ?? null;
  /** A totem knocked over: it tips, drops and fades, then it's gone. */
  const topple = (L: LaneObj, fast: boolean) => {
    if (!L.totem.children.length) return Promise.resolve();
    const g = new THREE.Group(); g.position.copy(L.totem.position); boardGroup.add(g);
    for (const ch of [...L.totem.children]) g.add(ch);
    L.totem.userData = { id: null };
    const dir = Math.random() < 0.5 ? -1 : 1;
    splash(g.position.clone().setY(0.8), '#B9A88A', 16, 2.4);
    return tween(fast ? 0.35 : 0.7, (k) => { g.rotation.z = dir * k * 1.5; g.position.y = 0.36 - k * k * 1.2; g.traverse((x) => { const m = (x as THREE.Mesh).material as THREE.Material | undefined; if (m && 'opacity' in m) { m.transparent = true; m.opacity = 1 - k; } }); })
      .then(() => { boardGroup.remove(g); disposeTree(g); });
  };

  // ---- picking and the camera ------------------------------------------------------------------------------------------
  // A tap picks a lane, a creature or a hero. Dragging on the board turns the camera round it, two fingers (or the
  // mouse wheel) zoom; the view stays where you leave it until you reset it.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickAt = (cx: number, cy: number): BoardPick | null => {
    const r = o.canvas.getBoundingClientRect(); if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pickables, false)[0];
    return h ? (h.object.userData.pick as BoardPick) : null;
  };
  const view = { yaw: 0, pitch: 0, zoom: 1, gy: 0, gp: 0, gz: 1 };
  const ptrs = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; moved: boolean } | null = null, pinch: { d: number; z: number } | null = null;
  const pd = (e: PointerEvent) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, moved: false };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.gz }; if (down) down.moved = true; }
    try { o.canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const pm = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2 && pinch) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); view.gz = Math.max(0.42, Math.min(1.6, pinch.z * (pinch.d / Math.max(20, d)))); return; }
    if (!down) return;
    if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.moved = true;
    if (down.moved) { view.gy = Math.max(-1.35, Math.min(1.35, view.gy - dx * 0.006)); view.gp = Math.max(-0.75, Math.min(0.45, view.gp + dy * 0.005)); }
  };
  const pu = (e: PointerEvent) => {
    const had = ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (!had || !down || ptrs.size) { if (!ptrs.size) down = null; return; }
    const tap = !down.moved; down = null;
    if (tap) { const p = pickAt(e.clientX, e.clientY); if (p) o.onPick?.(p); }
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); view.gz = Math.max(0.42, Math.min(1.6, view.gz * (1 + e.deltaY * 0.0012))); };
  o.canvas.addEventListener('pointerdown', pd); o.canvas.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
  o.canvas.addEventListener('wheel', wheel, { passive: false });
  o.canvas.style.touchAction = 'none';

  // ---- loop ------------------------------------------------------------------------------------------------------------
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, showcase = 0, lastDraw = 0, cheer = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector2();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || document.hidden) return;
    tune(dt); t += dt;
    // camera: behind your hero, fitted so the lanes fill the width; tall phone screens look down more steeply so the
    // board fills the screen top to bottom; the lobby slowly circles
    const half = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const tall = camera.aspect < 0.8;
    const dist = Math.max(tall ? 12 : 15, (tall ? 6.25 : 7.6) / Math.tan(half));
    view.yaw += (view.gy - view.yaw) * Math.min(1, dt * 8); view.pitch += (view.gp - view.pitch) * Math.min(1, dt * 8); view.zoom += (view.gz - view.zoom) * Math.min(1, dt * 8);
    const pitch = Math.max(0.28, Math.min(1.45, (tall ? 0.96 : 0.8) + view.pitch)), tz = (tall ? 2.3 : 1.3) * (1 - Math.abs(view.yaw) / 2);
    const ang = (showcase ? Math.sin(t * 0.12) * 0.5 : 0) + view.yaw, d = dist * view.zoom;
    const jig = () => (Math.random() - 0.5) * shake;
    camera.position.set(Math.sin(ang) * d * Math.cos(pitch) + jig(), d * Math.sin(pitch) + jig(), tz + Math.cos(ang) * d * Math.cos(pitch));
    camera.lookAt(0, 0.4, tz);
    shake = Math.max(0, shake - dt * 2.5);
    // tweens and per-frame jobs of the big scenes
    for (let i = tweens.length - 1; i >= 0; i--) { const w = tweens[i]; w.t += dt; const k = Math.min(1, w.t / w.dur); try { w.fn(k, dt); } catch { /* keep going */ } if (k >= 1) { tweens.splice(i, 1); w.res(); } }
    for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i](dt, t) === false) jobs.splice(i, 1);
    // the arena's mood: brightness, sky colour, lightning flashes
    dim += (dimGoal - dim) * Math.min(1, dt * 3); tinted += (tintGoal - tinted) * Math.min(1, dt * 2); skyNow.lerp(tintGoal ? skyGoal : skyBase, Math.min(1, dt * 2));
    flash = Math.max(0, flash - dt * 5);
    hemi.intensity = 1.5 * dim + flash * 5; key.intensity = 2.7 * dim + flash * 4; rim.intensity = 30 * dim;
    (scene.background as THREE.Color).copy(skyNow); (scene.fog as THREE.Fog).color.copy(skyNow);
    skyMat.color.copy(white).lerp(skyGoal, tinted * 0.7).multiplyScalar(0.25 + 0.75 * dim + flash);
    // creatures
    for (const u of units.values()) {
      u.hit.position.set(LX(u.lane), BASE + u.hit.scale.y / 2, rowZ(u.side));
      const pose: Pose = u.lunge > 0 ? 'attack' : u.state === 'happy' ? 'happy' : u.state === 'walk' ? 'walk' : 'idle';
      u.cr.update(dt, t, pose);
      // climbing up out of the lane
      if (u.rise > 0) {
        u.rise = Math.max(0, u.rise - dt * 1.5); const k = 1 - u.rise, e2 = 1 - Math.pow(1 - k, 3);
        u.g.position.y = BASE - (1 - e2) * (u.cr.height + 0.5); u.cr.root.rotation.y = facing(u.side, u.lane) + (1 - e2) * 2.5;
        if (Math.random() < 0.5) softP.emit({ x: u.g.position.x + (Math.random() - 0.5) * 1.2, y: BASE + 0.1, z: u.g.position.z + (Math.random() - 0.5) * 1.2, vy: 1.2, color: '#6A5440', size: 0.4, grow: 0.6, life: 0.7, alpha: 0.6 });
        if (u.rise === 0) { u.g.position.y = BASE; splash(u.g.position.clone().setY(BASE + 0.2), '#FFFFFF', 10, 2); }
      }
      if (u.lunge > 0) { u.lunge = Math.max(0, u.lunge - dt * 2.8); const k = Math.sin((1 - u.lunge) * Math.PI); const home = new THREE.Vector3(LX(u.lane), BASE, rowZ(u.side)); u.g.position.lerpVectors(home, u.lungeTo, k * 0.8); }
      if (u.flash > 0) { u.flash -= dt; u.cr.hurt(Math.floor(u.flash * 18) % 2 ? 1 : 0.35); u.hurtOn = true; } else if (u.hurtOn) { u.cr.hurt(0); u.hurtOn = false; }
      // falling: it sinks back into the ground and fades
      if (u.dying > 0) { u.dying += dt; u.g.position.y = BASE - u.dying * u.dying * 2.2; u.cr.fade(Math.max(0, 1 - u.dying * 1.4)); u.cr.root.rotation.z = Math.min(1.2, u.dying * 2) * (u.side === o.me ? 1 : -1); if (u.dying > 0.8) removeUnit(u); }
    }
    // heroes
    heroes.forEach((h) => { h.crystal.rotation.y += dt * 0.8; h.crystal.position.y = 1.2 + Math.sin(t * 2) * 0.08; if (h.shake > 0) { h.shake -= dt; h.g.position.x = Math.sin(t * 60) * 0.12 * h.shake; } else h.g.position.x = 0; });
    // totems bob, lava and neon pulse, rings breathe
    for (const L of lanes) {
      const b = L.totem.userData.bob as THREE.Sprite | undefined; if (b) b.position.y = 0.75 + Math.sin(t * 2 + L.lane) * 0.08;
      L.land?.tick(dt, t, emitLand);
      if (L.ringM.userData.on) L.ringM.opacity = 0.55 + Math.sin(t * 6) * 0.3;
      // the lane under a dragged card lifts a little and glows
      const hv = hovered === L ? 1 : 0; L.hover += (hv - L.hover) * Math.min(1, dt * 12);
      L.holder.position.y = L.hover * 0.12; L.ring.scale.setScalar(1 + L.hover * 0.12);
      if (L.hover > 0.02) L.ringM.opacity = Math.max(L.ringM.opacity, 0.4 + L.hover * 0.6);
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
    // the wonders breathe: smoke from the peak, sparks on the spire, a turning portal
    for (const L of lanes) { const m = L.totem.userData.model; if (!m) continue; m.userData.tick?.(dt, t); if (L.totem.userData.id === 'smolderpeak' && Math.random() < dt * 4) softP.emit({ x: L.totem.position.x + (Math.random() - 0.5) * 0.3, y: 2.1, z: L.totem.position.z, vy: 0.8 + Math.random() * 0.6, vx: 0.2, color: '#3A3238', size: 0.7, grow: 0.8, life: 2, alpha: 0.5, drag: 0.3 }); }
    const bh = renderer.getDrawingBufferSize(tmp2).y / (2 * Math.tan((camera.fov * Math.PI) / 360));
    addP.update(dt, bh); softP.update(dt, bh);
    // projectiles and particles
    for (let i = projs.length - 1; i >= 0; i--) { const p = projs[i]; p.t += dt / p.dur; const k = Math.min(1, p.t); p.s.position.lerpVectors(p.a, p.b, k); p.s.position.y += Math.sin(k * Math.PI) * 2.2; if (Math.random() < 0.6) splash(p.s.position, p.color, 1, 0.6); if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); projs.splice(i, 1); p.done(); } }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt; f.v.y -= f.g * dt; f.s.position.addScaledVector(f.v, dt); f.s.material.opacity = Math.max(0, Math.min(1, (f.life / f.max) * 2)); if (f.life <= 0) { scene.remove(f.s); f.s.material.dispose(); fx.splice(i, 1); } }
    void tmp;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  let current: View | null = null, previewing = false, hovered: LaneObj | null = null;
  const localLands: (Terrain | null)[] = [null, null, null, null];
  const setHeroHp = (side: Side, n: number) => { const h = heroes[side]; if (h.hpVal === n) return; h.hpVal = n; h.hp.material.map = textTex(String(Math.max(0, n)), n <= 8 ? '#FF8A8A' : '#FFFFFF', 72); h.hp.material.needsUpdate = true; };

  const api = {
    /** Make the board match a view (no animation). */
    setView(v: View) {
      current = v;
      const seen = new Set<number>(), landing = v.phase === 'lands';
      for (const side of [0, 1] as Side[]) {
        setHeroHp(side, v.p[side].hero);
        v.p[side].lanes.forEach((L, lane) => {
          // while the land cards are being placed: your own placements so far, and bare slabs for theirs
          const lo = laneOf(side, lane); setTerrain(lo, landing ? (side === o.me ? localLands[lane] : null) : L.terrain); setTotem(lo, L.totem?.id ?? null, L.totem?.n);
          lo.holder.position.y = lo.hover * 0.12; lo.holder.rotation.z = 0; lo.totem.position.set(LX(lane), 0.36, totemZ(side)); lo.totem.scale.setScalar(1); lo.totem.rotation.set(0, 0, 0);
          if (!L.unit) return;
          let u = units.get(L.unit.uid);
          if (u) { u.side = side; u.lane = lane; if (!u.rise && !u.lunge) u.g.position.set(LX(lane), BASE, rowZ(side)); u.g.rotation.set(0, 0, 0); u.g.scale.setScalar(1); if (!u.rise && !u.dying) u.cr.root.rotation.y = facing(side, lane); }
          if (!u) u = makeUnit(L.unit, side, lane);
          if (u.dying) { u.dying = 0; u.cr.fade(1); u.cr.root.rotation.z = 0; u.g.scale.setScalar(1); }
          seen.add(L.unit.uid); updateBadges(u, v, side, lane);
        });
      }
      for (const u of [...units.values()]) if (!seen.has(u.uid) && !u.dying) removeUnit(u);
      for (const u of [...units.values()]) if (u.uid < 0 && !previewing) removeUnit(u); // a preview's ghost
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
      // after a cataclysm's big scene, the aftermath (deaths, terrain changes…) plays out quicker
      let fast = false, storm = false;
      const W = (ms: number) => wait(fast ? ms * 0.3 : ms);
      for (const e of evs) {
        switch (e.e) {
          case 'play': {
            const L = after.p[e.side].lanes[e.lane].unit;
            if (L && !units.has(L.uid) && L.uid === e.uid) { const u = makeUnit(L, e.side, e.lane); riseUp(u); if (current) updateBadges(u, after, e.side, e.lane); }
            await W(fast ? 300 : 700); break;
          }
          case 'totem': {
            const lo = laneOf(e.side, e.lane), n = after.p[e.side].lanes[e.lane].totem?.n;
            setTotem(lo, e.card, n);
            const c = CARD[e.card], col = c.terrain === 'neutral' ? '#FFE14D' : TERRAIN_INFO[c.terrain].color;
            if (c.wonder) {
              // a wonder rises out of the table
              lo.totem.position.y = -2.2; scenes.smoke(LX(e.lane), 0.4, totemZ(e.side), 14, { color: '#8A7A64', size: 1.3, rise: 1.4 }); shake = Math.max(shake, 0.25);
              await tween(0.8, (k) => { lo.totem.position.y = -2.2 + (1 - Math.pow(1 - k, 3)) * 2.56; if (Math.random() < 0.5) splash(new THREE.Vector3(LX(e.lane) + (Math.random() - 0.5) * 1.5, 0.4, totemZ(e.side)), col, 1, 2); });
              lo.totem.position.y = 0.36; splash(new THREE.Vector3(LX(e.lane), 1.2, totemZ(e.side)), col, 30, 3.5); cheer = 0.8;
              pop(new THREE.Vector3(LX(e.lane), 3.2, totemZ(e.side)), textTex(c.name, col, 44), 2.4, 0.9, 1.4);
            } else { splash(new THREE.Vector3(LX(e.lane), 0.8, totemZ(e.side)), '#FFE14D', 12, 2); await W(300); }
            break;
          }
          case 'spell': {
            const c = CARD[e.card], col = c.terrain === 'neutral' ? '#FFE14D' : TERRAIN_INFO[c.terrain].color;
            const from = new THREE.Vector3(0, 2, heroZ(e.side));
            if (c.fx) { splash(from.clone().setY(2.4), col, 30, 3); pop(from.clone().setY(3), emojiTex(c.art), 1.8, 1.8, 1.2); await W(450); }
            else if (e.target) await throwAt(from, posOf(e.target.side, e.target.lane), c.art, col);
            else { pop(from.clone().setY(2.6), emojiTex(c.art), 1.4, 1.4, 1); await W(350); }
            break;
          }
          case 'fx': {
            if (e.fx === 'thunderstorm') storm = true;
            await scenes.play(e.fx, e.side, e.lane, e.lane !== undefined ? modelAt(e.side, e.lane) : null);
            if (e.fx !== 'rift') fast = true;
            break;
          }
          case 'strike': {
            const to = e.lane < 0 ? new THREE.Vector3(0, 1.2, heroZ(e.side)) : new THREE.Vector3(LX(e.lane), 0.8, rowZ(e.side));
            let from: THREE.Vector3 | undefined;
            if (e.kind === 'bolt' && !storm) { const spire = [0, 1, 2, 3].find((l) => laneOf(otherSide(e.side), l).totem.userData.id === 'stormspire'); if (spire !== undefined) { const L = laneOf(otherSide(e.side), spire); from = L.totem.position.clone().add(new THREE.Vector3(0, 2.45, 0)); } }
            await scenes.strike(e.kind, to, from);
            break;
          }
          case 'crumble': { await topple(laneOf(e.side, e.lane), fast); break; }
          case 'countdown': {
            const lo = laneOf(e.side, e.lane); setTotem(lo, 'smolderpeak', e.n);
            const at = lo.totem.position.clone().setY(2);
            scenes.smoke(at.x, at.y, at.z, 10, { color: '#2A2028', size: 1.2, rise: 2.4 }); scenes.burst(at.x, at.y, at.z, ['#FFB020', '#FF5A10'], 16, 3);
            shake = Math.max(shake, 0.2);
            if (e.n > 0) pop(at.clone().setY(3.3), textTex(e.n === 1 ? 'Erupts next turn!' : `${e.n} turns…`, '#FFB13D', 44), 2.6, 0.9, 1.3);
            await W(500); break;
          }
          case 'swap': {
            const u = unitAt(e.side, e.lane);
            if (u) { void tween(0.5, (k) => { u.g.rotation.y = k * Math.PI * 2; }); pop(posOf(e.side, e.lane, 2.8), textTex(`${e.atk}⚔ ⇄ ${e.hp}♥`, '#FFE9A8', 50), 1.9, 0.7, 1.1); }
            await W(160); break;
          }
          case 'swirl': {
            // the cyclone drops everything back down, into new lanes
            const olds = [0, 1, 2, 3].map((l) => unitAt(e.side, l));
            const moves = e.from.map((f, l) => ({ u: olds[f], l })).filter((m): m is { u: UnitObj; l: number } => !!m.u);
            for (const m of moves) m.u.lane = m.l;
            await Promise.all(moves.map(({ u, l }, i) => wait(i * 120).then(() => { const a = u.g.position.clone(), b = new THREE.Vector3(LX(l), BASE, rowZ(e.side)); return tween(0.55, (k) => { u.g.position.lerpVectors(a, b, k); u.g.position.y = a.y * (1 - k) + BASE + Math.sin(k * Math.PI) * 1.2; u.g.rotation.y = (1 - k) * 8; }).then(() => { u.g.rotation.y = 0; splash(b.clone().setY(0.5), '#FF8AC2', 18, 2.6); shake = Math.max(shake, 0.2); }); })));
            break;
          }
          case 'sketch': { const at = new THREE.Vector3(0, 2.8, heroZ(e.side)); pop(at, textTex('✏️ +1 card', '#9FE6FF', 54), 2, 0.75, 1.1); splash(at, '#9FE6FF', 14, 2); await W(300); break; }
          case 'flourish': {
            const u = unitAt(e.side, e.lane); if (u) { u.state = 'happy'; setTimeout(() => { u.state = 'idle'; }, 700); splash(posOf(e.side, e.lane, 2), '#FFE14D', 18, 2.2); pop(posOf(e.side, e.lane, 2.6), textTex('Flourish!', '#FFE14D', 52), 1.6, 0.6, 0.9); }
            if (e.target) { const c = CARD[e.card], col = c.terrain === 'neutral' ? '#FFE14D' : TERRAIN_INFO[c.terrain].color; await throwAt(posOf(e.side, e.lane, 2), posOf(e.target.side, e.target.lane), '✨', col, 0.35); }
            await W(300); break;
          }
          case 'attack': {
            const u = unitAt(e.side, e.lane); const to = e.to === 'hero' ? new THREE.Vector3(0, BASE, heroZ(e.side === 0 ? 1 : 0)) : new THREE.Vector3(LX(e.lane), BASE, rowZ(e.side === 0 ? 1 : 0));
            if (u) { u.lungeTo.copy(to); u.lunge = 1; u.state = 'walk'; setTimeout(() => { u.state = 'idle'; }, 400); }
            await W(230); break;
          }
          case 'dmg': {
            const at = posOf(e.side, e.lane, e.lane < 0 ? 2.4 : 2.4);
            if (e.blocked) { pop(at, textTex('Blocked!', '#9AD8FF', 54), 1.6, 0.6, 0.9); splash(at, '#9AD8FF', 10, 2); }
            else {
              pop(at, textTex(`-${e.n}`, e.kind === 'poison' ? '#C89BFF' : e.kind === 'burn' ? '#FFB13D' : '#FF5A5A', 76), 1.3, 0.5, 1);
              splash(at, e.kind === 'poison' ? '#9B6BFF' : e.kind === 'burn' ? '#FF7A3D' : '#FF4D6D', 12, 2.6);
              if (e.lane < 0) { heroes[e.side].shake = 0.5; shake = Math.max(shake, e.n >= 4 ? 0.45 : 0.22); setHeroHp(e.side, Math.max(0, heroes[e.side].hpVal - e.n)); if (e.n >= 4) cheer = 1.2; }
              else { const u = unitAt(e.side, e.lane); if (u) { u.flash = 0.35; u.hpVal -= e.n; u.hp.material.map = badgeTex(u.hpVal, 'hp', -1); u.hp.material.needsUpdate = true; } }
            }
            await W(190); break;
          }
          case 'heal': { const at = posOf(e.side, e.lane, 2.1); pop(at, textTex(`+${e.n}`, '#7BFFAE', 72), 1.1, 0.42, 1); splash(at, '#7BFFAE', 10, 1.6); if (e.lane < 0) setHeroHp(e.side, heroes[e.side].hpVal + e.n); await W(160); break; }
          case 'die': { const u = unitAt(e.side, e.lane); if (u) { u.dying = 0.0001; const c = CARD[u.id]; splash(posOf(e.side, e.lane, 1.4), c.terrain === 'neutral' ? '#B9B4D6' : TERRAIN_INFO[c.terrain].color, 26, 4); cheer = 0.8; } await W(320); break; }
          case 'freeze': { const u = unitAt(e.side, e.lane); if (u) u.ice.visible = true; splash(posOf(e.side, e.lane, 1.6), '#BFF4FF', 16, 2); await W(220); break; }
          case 'thaw': { const u = unitAt(e.side, e.lane); if (u) u.ice.visible = false; pop(posOf(e.side, e.lane, 2.4), textTex('Thawed', '#BFF4FF', 48), 1.4, 0.5, 0.8); await W(160); break; }
          case 'poison': { splash(posOf(e.side, e.lane, 1.6), '#9B6BFF', 14, 1.6); pop(posOf(e.side, e.lane, 2.5), emojiTex('☠️'), 0.6, 0.6, 0.9); await W(180); break; }
          case 'buff': { splash(posOf(e.side, e.lane, 1.2), '#FFE14D', 14, 1.4); pop(posOf(e.side, e.lane, 2.4), textTex(`${e.atk ? `+${e.atk}⚔` : ''}${e.hp ? ` +${e.hp}♥` : ''}`.trim(), '#FFE14D', 50), 1.6, 0.6, 1); await W(200); break; }
          case 'bounce': { const u = unitAt(e.side, e.lane); if (u) { u.rise = 0; u.lungeTo.set(u.g.position.x, 7, u.g.position.z); u.lunge = 1; setTimeout(() => removeUnit(u), 380); } splash(posOf(e.side, e.lane, 1.5), '#8AE0FF', 18, 2.6); await W(380); break; }
          case 'move': { const u = unitAt(e.side, e.from), v2 = unitAt(e.side, e.to); if (u) { u.lane = e.to; u.g.position.x = LX(e.to); } if (v2) { v2.lane = e.from; v2.g.position.x = LX(e.from); } splash(posOf(e.side, e.to, 1.2), '#8AE0FF', 12, 2); await W(260); break; }
          case 'land': { setTerrain(laneOf(e.side, e.lane), e.terrain, true); await W(e.side === o.me ? 120 : 260); break; }
          case 'ready': { if (e.side !== o.me) pop(new THREE.Vector3(0, 3.2, heroZ(e.side)), textTex('Lands ready!', '#FFE14D', 48), 2.4, 0.8, 1.4); await W(200); break; }
          case 'terrain': { const lo = laneOf(e.side, e.lane); setTerrain(lo, e.terrain, true); splash(new THREE.Vector3(LX(e.lane), 0.6, rowZ(e.side)), TERRAIN_INFO[e.terrain].color, 22, 2.6); await W(320); break; }
          case 'coin': { pop(new THREE.Vector3(0, 3, heroZ(e.side)), emojiTex('🪙'), 1, 1, 1.1); await W(350); pop(new THREE.Vector3(0, 3.4, heroZ(e.side)), textTex(e.heads ? 'Heads!' : 'Tails', '#FFE14D', 56), 1.6, 0.6, 1); break; }
          case 'fatigue': { pop(new THREE.Vector3(0, 3, heroZ(e.side)), textTex('Out of cards!', '#FF8A8A', 44), 2.2, 0.6, 1.2); await W(300); break; }
          case 'over': { cheer = 3; for (let i = 0; i < 4; i++) splash(new THREE.Vector3((Math.random() - 0.5) * 8, 2, (Math.random() - 0.5) * 6), ['#FF4FD8', '#FFE14D', '#22E3FF', '#3DDC97'][i], 30, 5); break; }
        }
      }
      await scenes.settle();
      api.setView(after);
    },
    /** Show what a card does, on the board, without changing anything: a cataclysm plays its whole scene, a wonder rises
     *  (and goes off), a creature hops into a lane and shows its attack, a spell flies at the other side. */
    async preview(id: string) {
      if (previewing) return; previewing = true;
      const c = CARD[id], me = o.me, them = otherSide(me);
      try {
        if (c.fx) {
          const lane = 1;
          await scenes.play(c.fx, me, lane, null);
          if (c.fx === 'thunderstorm' || c.fx === 'meteors') for (const l of [0, 2, -1]) await scenes.strike(c.fx === 'meteors' ? 'meteor' : 'bolt', l < 0 ? new THREE.Vector3(0, 1.2, heroZ(them)) : new THREE.Vector3(LX(l), 0.8, rowZ(them)));
          await scenes.settle();
        } else if (c.kind === 'totem') {
          const lane = [1, 2, 0, 3].find((l) => !current?.p[me].lanes[l].totem) ?? 1, lo = laneOf(me, lane), had = lo.totem.userData.id ?? null;
          setTotem(lo, id, id === 'smolderpeak' ? 3 : undefined);
          lo.totem.position.y = -2.2; await tween(0.8, (k) => { lo.totem.position.y = -2.2 + (1 - Math.pow(1 - k, 3)) * 2.56; });
          splash(lo.totem.position.clone().setY(1.2), '#FFE14D', 30, 3.5);
          await wait(700);
          if (id === 'smolderpeak') await scenes.play('peakblast', me, lane, modelAt(me, lane));
          if (id === 'riftgate') await scenes.play('rift', me, lane, null);
          if (id === 'stormspire') await scenes.strike('bolt', new THREE.Vector3(LX(lane), 0.8, rowZ(them)), lo.totem.position.clone().setY(2.8));
          await wait(600);
          setTotem(lo, null); if (had) setTotem(lo, had, current?.p[me].lanes[lane].totem?.n);
        } else if (c.kind === 'creature') {
          const lane = [1, 2, 0, 3].find((l) => !current?.p[me].lanes[l].unit) ?? 1;
          const u = makeUnit({ uid: -1, id, atk: c.atk ?? 0, hp: c.hp ?? 1, max: c.hp ?? 1, shield: false, frozen: 0, poison: 0, temp: 0, acted: false }, me, lane);
          if (current?.p[me].lanes[lane].unit) u.g.position.x += 0.01;
          riseUp(u); u.atk.material.map = badgeTex(c.atk ?? 0, 'atk', 0); u.hp.material.map = badgeTex(c.hp ?? 1, 'hp', 0);
          await wait(1100); u.state = 'idle';
          await wait(500);
          u.lungeTo.set(LX(lane), BASE, current?.p[them].lanes[lane].unit ? rowZ(them) : heroZ(them)); u.lunge = 1; u.state = 'walk';
          await wait(500); splash(new THREE.Vector3(LX(lane), 1.6, current?.p[them].lanes[lane].unit ? rowZ(them) : heroZ(them)), '#FF4D6D', 16, 2.6);
          await wait(700);
          u.dying = 0.0001; await wait(800);
        } else {
          const col = c.terrain === 'neutral' ? '#FFE14D' : TERRAIN_INFO[c.terrain].color;
          const to = c.target === 'my_unit' || c.target === 'my_lane' || c.target === 'my_empty_lane' ? posOf(me, 1) : c.target && c.target !== 'none' ? posOf(them, 1) : new THREE.Vector3(0, 2.8, heroZ(me));
          await throwAt(new THREE.Vector3(0, 2, heroZ(me)), to, c.art, col, 0.6);
          splash(to, col, 30, 3.2); await wait(500);
        }
      } finally {
        previewing = false;
        if (current) api.setView(current);
      }
    },
    /** What's under a point on the screen (a lane, a creature's lane, a hero), for dropping dragged cards. */
    pickAt,
    /** Where a lane's middle is on the screen (for tests and pointers). */
    screenOf(side: Side, lane: number) { const r = o.canvas.getBoundingClientRect(); const p = (lane < 0 ? new THREE.Vector3(0, 1, heroZ(side)) : new THREE.Vector3(LX(lane), BASE, rowZ(side))).project(camera); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; },
    /** Lift and glow the lane under a dragged card (null = none). */
    hover(p: BoardPick | null) { hovered = p && p.lane >= 0 ? laneOf(p.side, p.lane) : null; },
    /** While placing land cards: put one of yours in a lane (it rises up), or take it back (null). */
    setLocalLand(lane: number, t: Terrain | null) { localLands[lane] = t; setTerrain(laneOf(o.me, lane), t, !!t); },
    clearLocalLands() { localLands.fill(null); },
    /** Back to the standard camera. */
    resetView() { view.gy = 0; view.gp = 0; view.gz = 1; },
    get viewMoved() { return Math.abs(view.gy) > 0.05 || Math.abs(view.gp) > 0.05 || Math.abs(view.gz - 1) > 0.05; },
    /** The lobby: just the scenery and your lanes, the camera drifting. */
    setShowcase(on: boolean) { showcase = on ? 1 : 0; },
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ units: units.size, lanes: lanes.map((l) => l.terrain), view: { yaw: +view.gy.toFixed(2), pitch: +view.gp.toFixed(2), zoom: +view.gz.toFixed(2) }, fx: fx.length, particles: addP.count + softP.count, scenes: scenes.busy, previewing }),
    get previewing() { return previewing; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); scenes.clear();
      o.canvas.removeEventListener('pointerdown', pd); o.canvas.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu); o.canvas.removeEventListener('wheel', wheel);
      for (const L of lanes) L.land?.dispose();
      for (const u of [...units.values()]) removeUnit(u);
      scene.traverse((ob) => { if (ob instanceof THREE.Sprite) ob.material.dispose(); });
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
  return api;
}
export type Board3D = ReturnType<typeof createBoard3D>;
