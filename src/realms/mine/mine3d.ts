// The Crystal Mine in 3D: a cross-section of the earth you dig down through, tile by tile. Up top, the mining
// camp on the grass: the headframe over the shaft (its wheel turns while you dig), the trader's shack, the smelter
// (smoke from its chimney), the outfitter, the crew's tents, the geode bench, the museum and the games tent.
// Below: six layers of rock, each its own colour and texture (with ore specks, glowing crystals, lava, ruins);
// tunnels you've dug get timber supports, ladders and lanterns. Rock you can't see yet (beyond your lantern)
// stays dark. Your miner walks the tunnels and climbs the ladders to whatever you tap, swinging the pickaxe until
// it breaks. Drag up and down to look round.
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../../lib/gfx';
import { TILE_INFO, layerAt, mineHash, mineTile, type MineCfg } from './tiles';

export type MineBuilding = 'trader' | 'smelter' | 'outfitter' | 'crew' | 'bench' | 'museum' | 'games';
export type MineOpts = {
  canvas: HTMLCanvasElement; seed: number; cfg: MineCfg; explorerUrl: string; reduceMotion?: boolean;
  /** you tapped a tile (an index y*width+x) */ onTapTile?(idx: number): void;
  onTapBuilding?(b: MineBuilding): void;
  /** the miner broke a tile it was swinging at */ onBreak?(idx: number): void;
  /** where the camera's looking, in metres down */ onDepth?(y: number): void;
};
export const BUILDINGS: { id: MineBuilding; label: string; x: number; z: number }[] = [
  { id: 'trader', label: '⚖️ Trader', x: -3.4, z: -3 }, { id: 'smelter', label: '🔥 Smelter', x: 3.4, z: -3 },
  { id: 'crew', label: '👷 Crew camp', x: -6.2, z: -8.5 }, { id: 'outfitter', label: '⛏️ Outfitter', x: 0.4, z: -9.5 }, { id: 'bench', label: '🪨 Geode bench', x: 6.2, z: -8.5 },
  { id: 'museum', label: '🏛️ Museum', x: -4, z: -15 }, { id: 'games', label: '🎪 Games', x: 4.4, z: -15 },
];

export function createMine3D(o: MineOpts) {
  const c = o.cfg, W = c.width, phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = !phone; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...p }));
  let seedN = o.seed % 1000 + 1; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void, rep = 1) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; d(cv.getContext('2d')!);
    const t = T(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.magFilter = THREE.NearestFilter;
    if (rep !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); }
    return t;
  };
  const emojiTex = (e: string, s = 128) => { const t = tex(s, s, (g) => { g.font = `${s * 0.78}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, s / 2, s * 0.56); }); t.magFilter = THREE.LinearFilter; return t; };
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => { const me = new THREE.Mesh(T(geo), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
  const shade = (hex: string, k: number) => { const col = new THREE.Color(hex); col.multiplyScalar(k); return `#${col.getHexString()}`; };

  // ---- sky and light ---------------------------------------------------------------------------------------------------
  const skyTex = tex(4, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#5AA8F0'); gr.addColorStop(0.6, '#BEE3FF'); gr.addColorStop(1, '#FFF0D2'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); });
  skyTex.magFilter = THREE.LinearFilter;
  const sky = new THREE.Mesh(T(new THREE.PlaneGeometry(400, 120)), T(new THREE.MeshBasicMaterial({ map: skyTex, fog: false, depthWrite: false })));
  sky.position.set(0, 55, -70); scene.add(sky);
  const hemi = new THREE.HemisphereLight('#FFF2DC', '#4A3A2A', 1.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFE6BE', 2.2); sun.position.set(-8, 16, 10); sun.target.position.set(0, 0, -6); scene.add(sun, sun.target);
  sun.castShadow = !phone; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  const headlamp = new THREE.PointLight('#FFD9A0', 22, 9, 1.2); scene.add(headlamp);
  const fill = new THREE.PointLight('#FFE8C8', 0, 40, 0.7); scene.add(fill);
  scene.fog = new THREE.Fog('#000000', 30, 80);

  // ---- the surface: grass, the camp ------------------------------------------------------------------------------------
  const grassTex = tex(128, 128, (g) => { g.fillStyle = '#6FA54A'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 700; i++) { g.fillStyle = rnd() < 0.5 ? '#5E9440' : '#82B85A'; g.fillRect(rnd() * 128, rnd() * 128, 1, 3); } }, 20);
  const grass = mesh(new THREE.PlaneGeometry(120, 60), std('#ffffff', { map: grassTex }), 0, 0, -29.5); grass.rotation.x = -Math.PI / 2; grass.castShadow = false;
  // the cut edge of the grass along the front, either side of the shaft
  const turf = std('#5B8C3A');
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(60, 0.25, 1), turf, s * (W / 2 + 30), -0.12, 0);
  for (let x = 0; x < W; x++) mesh(new THREE.BoxGeometry(1, 0.12, 1), turf, x - W / 2 + 0.5, 0.06, -1.1);
  const woodM = std('#8A5A33'), woodD = std('#5B3A20'), ironM = std('#4A4A52', { metalness: 0.6, roughness: 0.4 }), roofR = std('#A2442F'), roofB = std('#3F5E8A'), stoneM = std('#8C857B'), canvasM = std('#E8DCC2', { side: THREE.DoubleSide });
  // hills and trees behind
  for (let i = 0; i < 12; i++) mesh(new THREE.SphereGeometry(8 + rnd() * 8, 12, 8), std(rnd() < 0.5 ? '#5E9440' : '#6CA24C'), -60 + i * 11 + rnd() * 4, -4, -38 - rnd() * 12).castShadow = false;
  const leaf = std('#3F7A3A'), leaf2 = std('#4F8F3F');
  for (let i = 0; i < 26; i++) { const x = (rnd() - 0.5) * 50, z = -12 - rnd() * 18; if (Math.abs(x) < 9 && z > -18) continue; mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6), woodD, x, 0.7, z); mesh(new THREE.ConeGeometry(1.1, 2.4, 7), rnd() < 0.5 ? leaf : leaf2, x, 2.4, z); }
  // headframe over the shaft: two A-frames, a beam, the big wheel
  const head = new THREE.Group(); head.position.set(0, 0, -0.6); scene.add(head);
  for (const s of [-1, 1]) for (const d of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.22, 6.2, 0.22), woodM, s * 2.2, 3, d * 0.6, head); leg.rotation.z = -s * 0.22; }
  mesh(new THREE.BoxGeometry(3.6, 0.3, 1.5), woodD, 0, 5.8, 0, head);
  const wheel = new THREE.Group(); wheel.position.set(0, 6.4, 0); head.add(wheel);
  { const rim = new THREE.Mesh(T(new THREE.TorusGeometry(0.9, 0.08, 6, 24)), ironM); wheel.add(rim); for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(T(new THREE.BoxGeometry(1.8, 0.06, 0.06)), ironM); sp.rotation.z = (k / 6) * Math.PI; wheel.add(sp); } }
  const rope = mesh(new THREE.CylinderGeometry(0.025, 0.025, 6, 4), std('#C8A86B'), 0.9, 3.4, 0, head);
  void rope;
  // little buildings
  const labels: { s: THREE.Sprite; id: MineBuilding }[] = [];
  const tappables: THREE.Object3D[] = [];
  const labelTex = (text: string) => { const t = tex(512, 112, (g) => { g.font = '800 46px ui-rounded, system-ui, "Apple Color Emoji"'; const w = Math.min(500, g.measureText(text).width + 48); g.fillStyle = 'rgba(30,20,12,0.82)'; g.beginPath(); g.roundRect((512 - w) / 2, 8, w, 92, 46); g.fill(); g.strokeStyle = '#FFD98A'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#FFF4DA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 56); }); t.magFilter = THREE.LinearFilter; return t; };
  const smokes: THREE.Sprite[] = [];
  const smokeTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(230,230,230,0.8)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  smokeTex.magFilter = THREE.LinearFilter;
  const glowTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,200,110,0.55)'); gr.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  glowTex.magFilter = THREE.LinearFilter;
  const sprite = (t: THREE.Texture, w: number, h: number, add = false) => { const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }))); s.scale.set(w, h, 1); return s; };
  let furnace: THREE.Mesh | null = null;
  for (const b of BUILDINGS) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.userData.building = b.id; scene.add(g); tappables.push(g);
    if (b.id === 'trader') {
      mesh(new THREE.BoxGeometry(2.4, 1.7, 1.8), woodM, 0, 0.85, 0, g); const rf = mesh(new THREE.ConeGeometry(1.9, 1.1, 4), roofR, 0, 2.25, 0, g); rf.rotation.y = Math.PI / 4;
      mesh(new THREE.BoxGeometry(2.6, 0.12, 0.9), woodD, 0, 0.9, 1.25, g); mesh(new THREE.BoxGeometry(0.9, 0.9, 0.05), std('#F4D58A', { emissive: '#F4B94A', emissiveIntensity: 0.4 }), 0, 1.1, 0.92, g);
      for (const [x, e] of [[-0.8, '🟠'], [0, '⚪'], [0.8, '🔮']] as const) { const s = sprite(emojiTex(e, 64), 0.4, 0.4); s.position.set(x, 1.15, 1.3); g.add(s); }
    } else if (b.id === 'smelter') {
      mesh(new THREE.CylinderGeometry(1, 1.2, 1.8, 10), stoneM, 0, 0.9, 0, g); mesh(new THREE.CylinderGeometry(0.35, 0.4, 2.6, 8), stoneM, 0.5, 2.6, -0.3, g);
      furnace = mesh(new THREE.BoxGeometry(0.8, 0.6, 0.1), std('#FF6A1F', { emissive: '#FF5A10', emissiveIntensity: 1.6 }), 0, 0.7, 1.12, g);
      for (let k = 0; k < 4; k++) { const s = sprite(smokeTex, 0.9, 0.9); s.position.set(b.x + 0.5, 4, b.z - 0.3); scene.add(s); smokes.push(s); }
      mesh(new THREE.BoxGeometry(0.6, 0.4, 0.3), std('#C47A3A', { metalness: 0.5, roughness: 0.4 }), -1.3, 0.2, 0.6, g);
    } else if (b.id === 'crew') {
      for (const [x, z] of [[-0.9, 0], [0.9, 0.3]] as const) { const tent = mesh(new THREE.ConeGeometry(1, 1.5, 4), canvasM, x, 0.75, z, g); tent.rotation.y = Math.PI / 4; }
      const fire = sprite(glowTex, 1, 1, true); fire.position.set(0, 0.35, 1.2); g.add(fire);
      mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), ironM, 0.4, 0.25, -1.1, g);
    } else if (b.id === 'outfitter') {
      mesh(new THREE.BoxGeometry(2.4, 1.9, 1.8), std('#7A6A5A'), 0, 0.95, 0, g); const rf = mesh(new THREE.BoxGeometry(2.7, 0.2, 2.1), roofB, 0, 2, 0, g); rf.rotation.x = 0.1;
      for (let k = 0; k < 3; k++) { const p = sprite(emojiTex(['⛏️', '🔦', '🧨'][k], 64), 0.55, 0.55); p.position.set(-0.7 + k * 0.7, 1.2, 0.95); g.add(p); }
    } else if (b.id === 'bench') {
      mesh(new THREE.BoxGeometry(2, 0.12, 0.9), woodM, 0, 0.9, 0, g); for (const dx of [-0.85, 0.85]) mesh(new THREE.BoxGeometry(0.12, 0.9, 0.8), woodD, dx, 0.45, 0, g);
      const geode = mesh(new THREE.SphereGeometry(0.32, 10, 8), std('#8C7A9A', { flatShading: true }), -0.3, 1.2, 0, g); void geode;
      mesh(new THREE.OctahedronGeometry(0.2), std('#C59BFF', { emissive: '#9B6BFF', emissiveIntensity: 0.8 }), 0.4, 1.15, 0, g);
    } else if (b.id === 'museum') {
      mesh(new THREE.BoxGeometry(3.4, 0.3, 2.2), stoneM, 0, 0.15, 0, g); for (let k = 0; k < 4; k++) mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 10), std('#E8E4DC'), -1.2 + k * 0.8, 1.2, 0.8, g);
      mesh(new THREE.BoxGeometry(3.4, 1.8, 1.4), std('#D9D2C3'), 0, 1.2, -0.3, g); const rf = mesh(new THREE.ConeGeometry(2.2, 0.8, 3), std('#D9D2C3'), 0, 2.5, 0, g); rf.rotation.z = Math.PI / 2; rf.rotation.y = Math.PI / 2; rf.scale.set(1, 1, 0.5);
    } else if (b.id === 'games') {
      const tent = mesh(new THREE.ConeGeometry(1.6, 2, 12, 1, true), std('#E2584A', { side: THREE.DoubleSide }), 0, 2, 0, g); void tent;
      mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.1, 12, 1, true), std('#F4EEDF', { side: THREE.DoubleSide }), 0, 0.55, 0, g);
      const flag = sprite(emojiTex('🎪', 64), 0.6, 0.6); flag.position.set(0, 3.3, 0); g.add(flag);
    }
    const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: labelTex(b.label), transparent: true, depthWrite: false, depthTest: false })));
    s.scale.set(2.3, 0.5, 1); s.renderOrder = 4; s.position.set(b.x, b.id === 'museum' || b.id === 'games' ? 3.6 : 3, b.z); s.userData.building = b.id; scene.add(s); labels.push({ s, id: b.id }); tappables.push(s);
  }
  // a minecart track from the shaft to the trader
  for (let k = 0; k < 9; k++) mesh(new THREE.BoxGeometry(0.12, 0.06, 0.9), woodD, -0.8 - k * 0.32, 0.03, -1.6 - k * 0.12).rotation.y = -0.35;

  // ---- the strata either side of the shaft ------------------------------------------------------------------------------
  const rockTex = (base: string, speck: string, seed: number) => tex(64, 64, (g) => {
    let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 120; i++) { const k = 0.82 + r() * 0.3; g.fillStyle = shade(base, k); g.fillRect(Math.floor(r() * 16) * 4, Math.floor(r() * 16) * 4, 4, 4); }
    g.fillStyle = shade(base, 0.6); g.fillRect(0, 0, 64, 2); g.fillRect(0, 0, 2, 64);
    if (speck) for (let i = 0; i < 6; i++) { g.fillStyle = speck; g.fillRect(4 + Math.floor(r() * 13) * 4, 4 + Math.floor(r() * 13) * 4, 4, 4); }
  });
  const maxY = c.max_depth;
  c.layers.forEach((l, i) => {
    const top = l.from, bot = c.layers[i + 1]?.from ?? maxY, h = bot - top, info = TILE_INFO[l.base] ?? TILE_INFO.stone;
    const t = rockTex(info.color, '', 77 + i); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, h);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(30, h, 3), std('#ffffff', { map: t }), s * (W / 2 + 15), -top - h / 2, -1).castShadow = false;
    const back = rockTex(shade(info.color, 0.62), '', 91 + i); back.wrapS = back.wrapT = THREE.RepeatWrapping; back.repeat.set(W, h);
    mesh(new THREE.PlaneGeometry(W, h), std('#ffffff', { map: back }), 0, -top - h / 2, -0.5).castShadow = false;
  });
  mesh(new THREE.BoxGeometry(W + 60, 4, 3), std('#1A1416'), 0, -maxY - 2, -1);

  // ---- tiles (instanced, per kind, only round where you're looking) ------------------------------------------------------
  const box = T(new THREE.BoxGeometry(1, 1, 1));
  const CAP = W * 44;
  const kinds = Object.keys(TILE_INFO).filter((k) => k !== 'cave');
  const tileMeshes = new Map<string, THREE.InstancedMesh>();
  kinds.forEach((k, i) => {
    const info = TILE_INFO[k];
    let map: THREE.Texture;
    if (k === 'crystal' || k === 'gem') map = tex(64, 64, (g) => { const b = rockTex(info.color, '', 13 + i).image as HTMLCanvasElement; g.drawImage(b, 0, 0); for (let n = 0; n < 4; n++) { const x = 10 + n * 13, y = 18 + (n % 2) * 18; g.fillStyle = info.speck!; g.beginPath(); g.moveTo(x, y + 20); g.lineTo(x + 5, y); g.lineTo(x + 10, y + 20); g.fill(); g.fillStyle = '#ffffffaa'; g.fillRect(x + 4, y + 6, 2, 8); } });
    else if (k === 'lava') map = tex(64, 64, (g) => { g.fillStyle = '#C2410C'; g.fillRect(0, 0, 64, 64); for (let n = 0; n < 14; n++) { g.fillStyle = n % 2 ? '#FFB13D' : '#FF6A1F'; g.beginPath(); g.ellipse(rnd() * 64, rnd() * 64, 4 + rnd() * 8, 3 + rnd() * 4, rnd() * 3, 0, Math.PI * 2); g.fill(); } });
    else if (info.emoji && ['chest', 'fossil', 'relic', 'geode'].includes(k)) map = tex(64, 64, (g) => { const b = rockTex(info.color, info.speck ?? '', 31 + i).image as HTMLCanvasElement; g.drawImage(b, 0, 0); g.font = '38px system-ui, "Apple Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(info.emoji!, 32, 36); });
    else map = rockTex(info.color, info.speck ?? '', 17 + i * 7);
    const glow = info.glow;
    const m = new THREE.InstancedMesh(box, T(new THREE.MeshStandardMaterial({ map, roughness: k === 'gem' || k === 'crystal' ? 0.3 : 0.92, metalness: k === 'silver' || k === 'iron' ? 0.25 : 0, emissive: glow ?? '#000000', emissiveMap: glow ? map : null, emissiveIntensity: glow ? (k === 'lava' ? 1.2 : 0.5) : 0 })), CAP);
    m.count = 0; m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color('#ffffff')); scene.add(m); tileMeshes.set(k, m);
  });
  // dug-tunnel dressing: timber supports, ladders, lanterns
  const postGeo = T(new THREE.BoxGeometry(0.1, 1, 0.1)), beamGeo = T(new THREE.BoxGeometry(1, 0.1, 0.12)), rungGeo = T(new THREE.BoxGeometry(0.5, 0.05, 0.05)), railGeo = T(new THREE.BoxGeometry(0.05, 1, 0.05));
  const posts = new THREE.InstancedMesh(postGeo, woodM, CAP * 2), beams = new THREE.InstancedMesh(beamGeo, woodD, CAP), rungs = new THREE.InstancedMesh(rungGeo, woodM, CAP * 4), rails = new THREE.InstancedMesh(railGeo, woodD, CAP * 2);
  for (const im of [posts, beams, rungs, rails]) { im.count = 0; im.frustumCulled = false; im.castShadow = false; scene.add(im); }
  const lanternTex = emojiTex('🏮', 64);
  const lanterns: THREE.Sprite[] = []; const lanternGlows: THREE.Sprite[] = [];
  for (let i = 0; i < 40; i++) { const s = sprite(lanternTex, 0.38, 0.38); s.visible = false; scene.add(s); lanterns.push(s); const gl = sprite(glowTex, 1.6, 1.6, true); gl.visible = false; scene.add(gl); lanternGlows.push(gl); }
  // background glows in the deep layers: crystals on the back wall, magma light, ruin columns
  const deco = new THREE.Group(); scene.add(deco);
  for (let y = 62; y < maxY; y += 7 + Math.floor(rnd() * 6)) {
    const l = layerAt(y, c); const side = rnd() < 0.5 ? -1 : 1, x = side * (W / 2 + 0.6 + rnd() * 3);
    if (l.id === 'caverns') { const cr = mesh(new THREE.OctahedronGeometry(0.35 + rnd() * 0.3), std('#B57BFF', { emissive: '#8B5CFF', emissiveIntensity: 1.2 }), x, -y, 0.6, deco); cr.scale.y = 2; cr.rotation.z = (rnd() - 0.5); }
    else if (l.id === 'magma') { const s = sprite(glowTex, 3, 3, true); (s.material as THREE.SpriteMaterial).color.set('#FF5A1F'); s.position.set(x, -y, 0.6); deco.add(s); }
    else if (l.id === 'ruins') { mesh(new THREE.CylinderGeometry(0.3, 0.35, 3, 8), std('#B8A878'), x, -y, 0.8, deco); }
  }

  let dug = new Set<number>(); let lamp = 0; let deepest = 0;
  const known = (idx: number) => {
    // revealed: within your lantern's reach of a tunnel (or the top rows)
    const x = idx % W, y = Math.floor(idx / W), R = 1 + lamp;
    if (y <= R - 1) return true;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (Math.abs(dx) + Math.abs(dy) > R) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < 0) continue; if (dug.has(yy * W + xx)) return true; }
    return false;
  };
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  let window0 = -999;
  const dark = new THREE.Color('#9A92A6'), lit = new THREE.Color('#ffffff');
  const rebuild = (force = false) => {
    const cy = Math.floor(-camY);
    const y0 = Math.max(0, cy - 22), y1 = Math.min(maxY - 1, cy + 22);
    if (!force && Math.abs(y0 - window0) < 4) return;
    window0 = y0;
    const counts = new Map<string, number>(); kinds.forEach((k) => counts.set(k, 0));
    let np = 0, nb = 0, nr = 0, nl = 0, li = 0;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x, wx = x - W / 2 + 0.5, wy = -y - 0.5;
      if (dug.has(idx)) {
        const h = mineHash(o.seed, x, y);
        // supports every few tiles, a ladder where you can climb up, the odd lantern
        if (h % 4 === 0) { m4.makeTranslation(wx - 0.44, wy, -0.35); posts.setMatrixAt(np++, m4); m4.makeTranslation(wx + 0.44, wy, -0.35); posts.setMatrixAt(np++, m4); m4.makeTranslation(wx, wy + 0.45, -0.35); beams.setMatrixAt(nb++, m4); }
        if (dug.has(idx - W) || y === 0) { for (const s of [-1, 1]) { m4.makeTranslation(wx + s * 0.22, wy, -0.3); rails.setMatrixAt(nr++, m4); } for (let k = 0; k < 4; k++) { m4.makeTranslation(wx, wy - 0.4 + k * 0.25, -0.3); rungs.setMatrixAt(nl++, m4); } }
        if (h % 7 === 0 && li < lanterns.length) { lanterns[li].position.set(wx + 0.3, wy + 0.25, -0.2); lanterns[li].visible = true; lanternGlows[li].position.set(wx + 0.3, wy + 0.25, -0.15); lanternGlows[li].visible = true; li++; }
        continue;
      }
      const k = mineTile(o.seed, x, y, c);
      if (k === 'cave' && known(idx)) continue; // an open cave pocket once you can see it
      const see = known(idx);
      const kk = see ? (k === 'cave' ? layerAt(y, c).base : k) : layerAt(y, c).base;
      const m = tileMeshes.get(kk); if (!m) continue;
      const n = counts.get(kk)!; if (n >= CAP) continue;
      m4.makeTranslation(wx, wy, 0); m.setMatrixAt(n, m4);
      col.copy(see ? lit : dark); m.setColorAt(n, col);
      counts.set(kk, n + 1);
    }
    for (const [k, m] of tileMeshes) { m.count = counts.get(k) ?? 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    posts.count = np; beams.count = nb; rails.count = nr; rungs.count = nl;
    for (const im of [posts, beams, rails, rungs]) im.instanceMatrix.needsUpdate = true;
    for (let i = li; i < lanterns.length; i++) { lanterns[i].visible = false; lanternGlows[i].visible = false; }
  };

  // ---- the miner -------------------------------------------------------------------------------------------------------
  const meTex = new THREE.TextureLoader().load(o.explorerUrl); meTex.colorSpace = THREE.SRGBColorSpace; T(meTex);
  const me = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true, alphaTest: 0.05 }))); me.center.set(0.5, 0); me.scale.set(0.62, 0.9, 1); scene.add(me);
  const hat = sprite(emojiTex('⛑️', 64), 0.42, 0.42); scene.add(hat);
  const pick = sprite(emojiTex('⛏️', 64), 0.5, 0.5); scene.add(pick);
  // where the miner stands: a dug tile, or a spot on the surface above column x (node -1 - x)
  type Node = number;
  const posOf = (n: Node) => (n < 0 ? { x: -n - 1 - W / 2 + 0.5, y: 0 } : { x: (n % W) - W / 2 + 0.5, y: -Math.floor(n / W) - 1 });
  const neighbors = (n: Node): Node[] => {
    if (n < 0) { const x = -n - 1, out: Node[] = []; if (x > 0) out.push(-x); if (x < W - 1) out.push(-x - 2); if (dug.has(x)) out.push(x); return out; }
    const x = n % W, y = Math.floor(n / W), out: Node[] = [];
    if (y === 0) out.push(-x - 1);
    for (const m of [n - W, n + W, x > 0 ? n - 1 : -1e9, x < W - 1 ? n + 1 : -1e9]) if (m >= 0 && dug.has(m)) out.push(m);
    return out;
  };
  const bfs = (from: Node, goals: Set<Node>): Node[] | null => {
    if (goals.has(from)) return [];
    const prev = new Map<Node, Node>(); const q: Node[] = [from]; prev.set(from, from);
    while (q.length) { const n = q.shift()!; for (const m of neighbors(n)) { if (prev.has(m)) continue; prev.set(m, n); if (goals.has(m)) { const path = [m]; let k = n; while (k !== from) { path.unshift(k); k = prev.get(k)!; } return path; } q.push(m); } }
    return null;
  };
  let at: Node = -5, path: Node[] = [], walkT = 0, face = 1;
  const P = { x: posOf(at).x, y: 0 };
  let swing: { idx: number; hits: number; need: number; t: number } | null = null;
  const queue: { idx: number; need: number }[] = [];
  const standFor = (idx: number) => {
    const x = idx % W, y = Math.floor(idx / W), g = new Set<Node>();
    if (y === 0) g.add(-x - 1);
    for (const m of [idx - W, idx + W, x > 0 ? idx - 1 : -1, x < W - 1 ? idx + 1 : -1]) if (m >= 0 && dug.has(m)) g.add(m);
    return g;
  };
  const tryNext = () => {
    while (queue.length && !swing) {
      const j = queue[0]; if (dug.has(j.idx)) { queue.shift(); continue; }
      const goals = standFor(j.idx); if (!goals.size) { queue.shift(); continue; }
      const p = bfs(at, goals); if (!p) { queue.shift(); continue; }
      path = p; if (!p.length) { queue.shift(); swing = { idx: j.idx, hits: 0, need: j.need, t: 0 }; }
      return;
    }
  };

  /** walk to a tunnel tile or a surface spot (drops whatever was queued to dig) */
  const walkNode = (n: Node) => {
    if (swing) return false;
    queue.length = 0;
    const p = bfs(at, new Set([n])); if (!p) return false;
    path = p; return true;
  };
  /** one step left/right/up/down: walk if it's open, or say which rock is in the way */
  const step = (dx: number, dy: number): { dig?: number; moved: boolean } => {
    if (swing || path.length) return { moved: false };
    follow = true;
    if (at < 0) { // on the surface
      const x = -at - 1;
      if (dy > 0) { if (dug.has(x)) { path = [x]; return { moved: true }; } return { dig: x, moved: false }; }
      if (dx) { const nx = x + dx; if (nx >= 0 && nx < W) { path = [-nx - 1]; return { moved: true }; } }
      return { moved: false };
    }
    const x = at % W, y = Math.floor(at / W);
    if (dy < 0 && y === 0) { path = [-x - 1]; return { moved: true }; }
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= maxY) return { moved: false };
    const n = ny * W + nx;
    if (dug.has(n)) { path = [n]; return { moved: true }; }
    return { dig: n, moved: false };
  };

  // crack overlay and flying chips
  const crackTex = [1, 2, 3].map((n) => tex(64, 64, (g) => { g.strokeStyle = 'rgba(10,8,8,0.85)'; g.lineWidth = 3; for (let k = 0; k < n * 2; k++) { g.beginPath(); let x = 32, y = 32; g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (rnd() - 0.5) * 26; y += (rnd() - 0.5) * 26; g.lineTo(x, y); } g.stroke(); } }));
  const crack = new THREE.Mesh(T(new THREE.PlaneGeometry(1.01, 1.01)), T(new THREE.MeshBasicMaterial({ map: crackTex[0], transparent: true, depthWrite: false })));
  crack.visible = false; scene.add(crack);
  const chipGeo = T(new THREE.BoxGeometry(0.12, 0.12, 0.12));
  const chips = new THREE.InstancedMesh(chipGeo, T(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })), 80); chips.count = 0; chips.frustumCulled = false; scene.add(chips);
  const chipState: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; c: THREE.Color }[] = [];
  const spray = (idx: number, n: number, color: string) => { const p = posOf(idx); for (let i = 0; i < n; i++) chipState.push({ x: p.x, y: p.y + 0.5, z: 0.5, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4, vz: Math.random() * 2, life: 0.8 + Math.random() * 0.4, c: new THREE.Color(color) }); if (chipState.length > 80) chipState.splice(0, chipState.length - 80); };
  const pops: { s: THREE.Sprite; t: number; vx: number; vy: number }[] = [];
  const popTex = new Map<string, THREE.Texture>();
  const burst = (idx: number, emojis: string[]) => {
    const p = idx >= 0 ? posOf(idx) : { x: 0, y: 1 };
    emojis.slice(0, 12).forEach((e) => { let t = popTex.get(e); if (!t) { t = emojiTex(e, 96); popTex.set(e, t); } const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.scale.setScalar(0.55); s.renderOrder = 8; s.position.set(p.x, p.y + 0.5, 0.8); scene.add(s); pops.push({ s, t: 0, vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 2 }); });
  };
  const blasts: { s: THREE.Sprite; t: number }[] = [];

  // ---- input: drag to look, tap a tile or a building ------------------------------------------------------------------
  let camY = 0, camTarget = 0, follow = true, dragging: { y: number; cy: number; moved: boolean; x: number } | null = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), facePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5), hit = new THREE.Vector3();
  const worldPerPx = () => (2 * camDist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, o.canvas.clientHeight);
  const pd = (e: PointerEvent) => { dragging = { y: e.clientY, x: e.clientX, cy: camTarget, moved: false }; };
  const pm = (e: PointerEvent) => { if (!dragging) return; const dy = e.clientY - dragging.y; if (Math.abs(dy) > 6 || Math.abs(e.clientX - dragging.x) > 6) dragging.moved = true; if (dragging.moved) { follow = false; camTarget = Math.min(3, Math.max(-maxY, dragging.cy + dy * worldPerPx())); } };
  const pu = (e: PointerEvent) => {
    const d = dragging; dragging = null; if (!d || d.moved) return;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hb = ray.intersectObjects(tappables, true)[0];
    if (hb) { let ob: THREE.Object3D | null = hb.object; while (ob && !ob.userData.building) ob = ob.parent; if (ob?.userData.building) { o.onTapBuilding?.(ob.userData.building as MineBuilding); return; } }
    if (ray.ray.intersectPlane(facePlane, hit)) {
      const x = Math.floor(hit.x + W / 2), y = Math.floor(-hit.y);
      if (x < 0 || x >= W || y >= maxY) return;
      follow = true;
      if (hit.y > -0.05 || y < 0) { walkNode(-x - 1); return; } // the grass above the shaft
      const idx = y * W + x;
      if (dug.has(idx)) { walkNode(idx); return; }
      o.onTapTile?.(idx);
    }
  };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);

  // ---- loop -------------------------------------------------------------------------------------------------------------
  let camDist = 18;
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); camDist = Math.max(9, Math.min(26, (W + 1.6) / camera.aspect / 2 / Math.tan((camera.fov * Math.PI) / 360))); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, lastDepth = -1;
  const tmp = new THREE.Vector3(), look = new THREE.Vector3();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || document.hidden) return;
    tune(dt); t += dt;
    // the miner walks the path, then swings
    if (path.length) {
      const nx = posOf(path[0]); const dx = nx.x - P.x, dy = nx.y - P.y, d = Math.hypot(dx, dy), sp = 4.5 * dt;
      if (d <= sp) { P.x = nx.x; P.y = nx.y; at = path.shift()!; if (!path.length && queue.length) { const j = queue.shift()!; if (!dug.has(j.idx)) swing = { idx: j.idx, hits: 0, need: j.need, t: 0 }; } }
      else { P.x += (dx / d) * sp; P.y += (dy / d) * sp; if (Math.abs(dx) > 0.01) face = dx > 0 ? 1 : -1; }
      walkT += dt * 10;
    }
    if (swing) {
      const tp = posOf(swing.idx); face = tp.x > P.x + 0.1 ? 1 : tp.x < P.x - 0.1 ? -1 : face;
      swing.t += dt;
      const rate = 0.26;
      if (swing.t >= rate) {
        swing.t = 0; swing.hits++;
        const k = mineTile(o.seed, swing.idx % W, Math.floor(swing.idx / W), c); spray(swing.idx, 5, TILE_INFO[k]?.speck ?? TILE_INFO[k]?.color ?? '#888');
        crack.visible = true; crack.position.set(tp.x, tp.y + 0.5, 0.51);
        (crack.material as THREE.MeshBasicMaterial).map = crackTex[Math.min(2, Math.floor((swing.hits / swing.need) * 3))];
        if (swing.hits >= swing.need) { const idx = swing.idx; swing = null; crack.visible = false; spray(idx, 14, TILE_INFO[k]?.color ?? '#888'); o.onBreak?.(idx); tryNext(); }
      }
    }
    if (!path.length && !swing && queue.length) tryNext();
    const bob = path.length ? Math.abs(Math.sin(walkT)) * 0.06 : 0;
    me.position.set(P.x, P.y + bob, 0.15); me.scale.x = 0.62 * face; hat.position.set(P.x + face * 0.02, P.y + 0.86 + bob, 0.2);
    const sw = swing ? Math.sin(Math.min(1, swing.t / 0.26) * Math.PI) : 0;
    pick.position.set(P.x + face * 0.32, P.y + 0.45 + sw * 0.2, 0.25); (pick.material as THREE.SpriteMaterial).rotation = face * (swing ? 0.9 - sw * 1.8 : 0.4);
    headlamp.position.set(P.x + face * 0.3, P.y + 0.8, 1.2);
    // camera: follows the miner unless you've dragged away
    if (follow) camTarget = Math.min(0, P.y + 1);
    camY += (camTarget - camY) * Math.min(1, dt * 4);
    const surf = Math.max(0, Math.min(1, (camY + 3) / 3)); // 1 at the surface
    camera.position.set(0, camY + 1 + surf * 4.5, camDist * (1 - surf * 0.25) + surf * 2);
    look.set(0, camY - 0.5 + surf * 0.5, -surf * 6);
    camera.lookAt(look);
    const depth = Math.max(0, -camY);
    hemi.intensity = 0.75 + 0.55 * surf; sun.intensity = 2.2 * surf;
    (scene.fog as THREE.Fog).near = surf > 0.5 ? 40 : 22; (scene.fog as THREE.Fog).far = surf > 0.5 ? 120 : 48;
    fill.position.set(0, camY - 0.5, 7); fill.intensity = (1 - surf) * 22;
    rebuild();
    for (const l of labels) l.s.visible = surf > 0.35;
    const dRow = Math.floor(depth); if (dRow !== lastDepth) { lastDepth = dRow; o.onDepth?.(dRow); }
    // the camp, alive
    if (!o.reduceMotion) {
      wheel.rotation.z += dt * (swing || path.length ? 2.4 : 0.3);
      smokes.forEach((s, i) => { const k = ((t * 0.25 + i / smokes.length) % 1); s.position.y = 4 + k * 3.5; s.position.x = 3.9 + Math.sin(t + i) * 0.3 * k; s.scale.setScalar(0.6 + k * 1.6); (s.material as THREE.SpriteMaterial).opacity = 0.6 * (1 - k); });
      if (furnace) (furnace.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.3 + Math.sin(t * 8) * 0.3;
      lanternGlows.forEach((g, i) => { if (g.visible) g.scale.setScalar(1.5 + Math.sin(t * 6 + i) * 0.12); });
      for (const [k, m] of tileMeshes) if (k === 'lava') (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 3) * 0.35;
      else if (k === 'crystal' || k === 'gem') (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45 + Math.sin(t * 2 + (k === 'gem' ? 1 : 0)) * 0.2;
    }
    // chips, pops, blasts
    let ci = 0;
    for (let i = chipState.length - 1; i >= 0; i--) { const p = chipState[i]; p.life -= dt; if (p.life <= 0) { chipState.splice(i, 1); continue; } p.vy -= 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; m4.makeTranslation(p.x, p.y, p.z); chips.setMatrixAt(ci, m4); chips.setColorAt(ci, p.c); ci++; }
    chips.count = ci; chips.instanceMatrix.needsUpdate = true; if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; p.vy -= 5 * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.material.opacity = Math.max(0, 1 - p.t / 1.4); if (p.t > 1.4) { scene.remove(p.s); p.s.material.dispose(); pops.splice(i, 1); } }
    for (let i = blasts.length - 1; i >= 0; i--) { const b = blasts[i]; b.t += dt; b.s.scale.setScalar(1 + b.t * 9); (b.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - b.t / 0.6); if (b.t > 0.6) { scene.remove(b.s); b.s.material.dispose(); blasts.splice(i, 1); } }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    /** what's dug (and how far you can see) */
    setState(s: { dug: number[]; lamp: number; deepest: number }) { dug = new Set(s.dug); lamp = s.lamp; deepest = s.deepest; rebuild(true); },
    /** mark tiles dug right away (before the server answers) */
    markDug(idx: number[]) { for (const i of idx) dug.add(i); rebuild(true); },
    unmark(idx: number[]) { for (const i of idx) dug.delete(i); rebuild(true); },
    /** walk to a tile and swing at it (need = how many swings) */
    dig(idx: number, need: number) { if (queue.some((q) => q.idx === idx) || swing?.idx === idx) return; queue.push({ idx, need }); follow = true; if (!swing && !path.length) tryNext(); },
    cancel() { queue.length = 0; },
    step, walkTo: (idx: number) => walkNode(idx),
    busy: () => !!swing || !!path.length || queue.length > 0,
    /** can the miner get next to this tile (counting tiles already queued to dig as open) */
    canReach: (idx: number, planned: Set<number> = new Set()) => {
      if (standFor(idx).size > 0 && !!bfs(at, standFor(idx))) return true;
      const x = idx % W; return [idx - W, idx + W, x > 0 ? idx - 1 : -1, x < W - 1 ? idx + 1 : -1].some((m) => m >= 0 && planned.has(m));
    },
    blast(idx: number) { const p = posOf(idx); const s = sprite(glowTex, 1, 1, true); (s.material as THREE.SpriteMaterial).color.set('#FFB13D'); s.position.set(p.x, p.y + 0.5, 0.8); scene.add(s); blasts.push({ s, t: 0 }); for (let k = 0; k < 9; k++) spray(idx, 4, '#8C857B'); burst(idx, ['💥']); },
    burst,
    goSurface() { follow = false; camTarget = 0; },
    goDeepest() { follow = false; camTarget = -Math.max(0, deepest - 3); },
    followMiner() { follow = true; },
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ at, P: { ...P }, queue: queue.length, swing: !!swing, camY, dug: dug.size }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu);
      for (const p of pops) p.s.material.dispose();
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
}
export type MineScene = ReturnType<typeof createMine3D>;
