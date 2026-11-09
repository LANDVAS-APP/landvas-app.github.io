// The carnival outside an Arcade Estate. Walk out of the arcade's front door and you're on the midway at night:
// string lights, a sandy path between six game booths, a Ferris wheel and a carousel at the far end, a treat cart,
// a fortune teller's tent, a photo booth and a fireworks launcher. The booth games are played right there in 3D:
// the camera glides up to the counter and you tap the ducks, balloons, bottles, crabs, bell and clown targets in
// the booth itself.
//
// Layout (world units; the hall is x -8..8, z -13..13 with its door at z = 13): the carnival runs from z = 13 out
// to z = 56 and from x = -24 to 24. The camera turns round when you step outside, so you look out at the carnival.
import * as THREE from 'three';

export type CarnivalSpotKind = 'booth' | 'ride' | 'treats' | 'fortune' | 'photo' | 'fireworks';
export type CarnivalSpot = { id: string; kind: CarnivalSpotKind; x: number; z: number; label: string; emoji: string };
export type BoothFocus = { spot: THREE.Vector3; focus: THREE.Vector3; focusN: THREE.Vector3; focusDist: number };
export type BoothState = { id: string; score: number; time: number; extra: string; done: boolean };
type Kit = {
  scene: THREE.Scene; T: <X extends { dispose(): void }>(x: X) => X; phone: boolean;
  std(c: string, p?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial; glow(c: string, k?: number): THREE.MeshStandardMaterial;
  emojiSprite(e: string, size: number): THREE.Sprite; labelTex(text: string, color: string, sub?: string): THREE.CanvasTexture;
};

export const CARNIVAL_Z = 13; // where the arcade's door is
export const CARNIVAL_BOUNDS = { x: 22, z: 55 };
const BOOTHS: { id: string; x: number; z: number; color: string; name: string; emoji: string }[] = [
  { id: 'ducks', x: -6.6, z: 19, color: '#22B8FF', name: 'Duck Shoot', emoji: '🦆' },
  { id: 'darts', x: 6.6, z: 19, color: '#FF3D9A', name: 'Balloon Darts', emoji: '🎈' },
  { id: 'bottles', x: -6.6, z: 27, color: '#FFB13D', name: 'Milk Bottles', emoji: '🍼' },
  { id: 'crabs', x: 6.6, z: 27, color: '#FF5A5F', name: 'Whack-a-Crab', emoji: '🦀' },
  { id: 'striker', x: -6.6, z: 35, color: '#FFE14D', name: 'High Striker', emoji: '🔔' },
  { id: 'watergun', x: 6.6, z: 35, color: '#3DDC97', name: 'Water Gun Race', emoji: '🔫' },
];

export function buildCarnival(k: Kit) {
  const { scene, T, std, glow } = k;
  const root = new THREE.Group(); scene.add(root);
  const box = (w: number, h: number, d: number, m: THREE.Material, p: THREE.Object3D = root, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(T(new THREE.BoxGeometry(w, h, d)), m); o.position.set(x, y, z); p.add(o); return o; };
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, p: THREE.Object3D = root, x = 0, y = 0, z = 0, seg = 16) => { const o = new THREE.Mesh(T(new THREE.CylinderGeometry(rt, rb, h, seg)), m); o.position.set(x, y, z); p.add(o); return o; };
  const ball = (r: number, m: THREE.Material, p: THREE.Object3D = root, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(T(new THREE.SphereGeometry(r, 16, 12)), m); o.position.set(x, y, z); p.add(o); return o; };
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void, rep = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; d(c.getContext('2d')!); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t; };
  const spots: CarnivalSpot[] = [];
  const solids: { x0: number; x1: number; z0: number; z1: number }[] = [];
  const animated: ((t: number, dt: number) => void)[] = [];

  // ---- the ground: dark grass with a sandy midway down the middle and a crossing to the rides ----------------------
  const grass = tex(256, 256, (g) => { g.fillStyle = '#2C4E2A'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 900; i++) { g.fillStyle = ['#36603A', '#24421F', '#3E6A3C'][i % 3]; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 4); } }, 14);
  const ground = new THREE.Mesh(T(new THREE.PlaneGeometry(60, 50)), std('#ffffff', { map: grass, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.005, 37); ground.receiveShadow = true; root.add(ground);
  const sand = tex(128, 128, (g) => { g.fillStyle = '#B89A6A'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 400; i++) { g.fillStyle = ['#C9AA78', '#A88A5A', '#D0B488'][i % 3]; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } }, 4);
  const sandMat = std('#ffffff', { map: sand, roughness: 1 });
  const path1 = new THREE.Mesh(T(new THREE.PlaneGeometry(7, 42)), sandMat); path1.rotation.x = -Math.PI / 2; path1.position.set(0, 0.003, 34); root.add(path1);
  const path2 = new THREE.Mesh(T(new THREE.PlaneGeometry(38, 5)), sandMat); path2.rotation.x = -Math.PI / 2; path2.position.set(0, 0.004, 41.5); root.add(path2);
  // a low fence round the edge
  const fenceMat = std('#E8E4DC', { roughness: 0.6 });
  for (const [x0, z0, x1, z1] of [[-23.5, 14, -23.5, 56], [23.5, 14, 23.5, 56], [-23.5, 56, 23.5, 56]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 2);
    for (let i = 0; i <= n; i++) cyl(0.06, 0.06, 1, fenceMat, root, x0 + ((x1 - x0) * i) / n, 0.5, z0 + ((z1 - z0) * i) / n, 6);
    const rail = box(x0 === x1 ? 0.06 : len, 0.08, x0 === x1 ? len : 0.06, fenceMat, root, (x0 + x1) / 2, 0.85, (z0 + z1) / 2); void rail;
  }
  // trees and hills beyond the fence
  for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI, d = 32 + (i % 3) * 4; const x = Math.cos(a) * d, z = 30 + Math.sin(a) * d * 0.7; if (z < 20 || (Math.abs(x) < 26 && z < 58)) continue; cyl(0.2, 0.3, 2, std('#3A2A1A'), root, x, 1, z); const c = new THREE.Mesh(T(new THREE.ConeGeometry(1.6, 4, 8)), std('#14301A')); c.position.set(x, 3.6, z); root.add(c); }
  // the night sky: stars on a dome
  const starGeo = new THREE.BufferGeometry(); const sp: number[] = []; for (let i = 0; i < 500; i++) { const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.3, r = 90; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, 30 + Math.sin(a) * Math.cos(e) * r); } starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(T(starGeo), T(new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, sizeAttenuation: true, fog: false }))); root.add(stars);
  const moon = ball(5, T(new THREE.MeshBasicMaterial({ color: '#FFF6D8', fog: false })), root, -40, 45, 95); void moon;

  // ---- the arcade from outside: a front wall with the door, a neon sign and a roof -------------------------------
  const front = new THREE.Group(); root.add(front);
  const brick = tex(256, 128, (g) => { g.fillStyle = '#2A1F4A'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#1A1238'; g.lineWidth = 3; for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 16) % 2 ? 16 : 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); } } }, 1);
  brick.repeat.set(3, 1);
  const frontMat = std('#ffffff', { map: brick, roughness: 0.9, transparent: true });
  for (const s of [-1, 1]) box(5.8, 5.2, 0.3, frontMat, front, s * 5.1, 2.6, CARNIVAL_Z + 0.15);
  box(4.4, 1.6, 0.3, frontMat, front, 0, 4.4, CARNIVAL_Z + 0.15);
  const doorGlow = glow('#FF3D9A', 2.4);
  box(0.12, 3.6, 0.12, doorGlow, front, -2.2, 1.8, CARNIVAL_Z + 0.32); box(0.12, 3.6, 0.12, doorGlow, front, 2.2, 1.8, CARNIVAL_Z + 0.32); box(4.5, 0.12, 0.12, doorGlow, front, 0, 3.6, CARNIVAL_Z + 0.32);
  const signMat = T(new THREE.MeshBasicMaterial({ map: T(k.labelTex('Arcade', '#FF3D9A')), toneMapped: false, transparent: true }));
  const sign = new THREE.Mesh(T(new THREE.PlaneGeometry(5, 1.25)), signMat); sign.position.set(0, 5.9, CARNIVAL_Z + 0.35); front.add(sign);
  const roof = box(16.6, 0.3, 26.6, std('#1A1238'), root, 0, 5.2, 0); void roof;
  const roofGroup = new THREE.Group(); root.add(roofGroup); roofGroup.add(roof);
  solids.push({ x0: -40, x1: -2.15, z0: CARNIVAL_Z - 0.25, z1: CARNIVAL_Z + 0.45 }, { x0: 2.15, x1: 40, z0: CARNIVAL_Z - 0.25, z1: CARNIVAL_Z + 0.45 });
  // a welcome arch over the midway
  const arch = new THREE.Group(); arch.position.set(0, 0, 15.5); root.add(arch);
  for (const s of [-1, 1]) { cyl(0.18, 0.22, 4.6, std('#C8352C'), arch, s * 3.2, 2.3, 0); ball(0.3, glow('#FFE14D', 2), arch, s * 3.2, 4.75, 0); }
  const archSign = new THREE.Mesh(T(new THREE.PlaneGeometry(6, 1.1)), T(new THREE.MeshBasicMaterial({ map: T(k.labelTex('Carnival', '#FFE14D', 'tickets · rides · treats')), toneMapped: false, side: THREE.DoubleSide })));
  archSign.position.set(0, 4.5, 0); archSign.rotation.y = Math.PI; arch.add(archSign);
  solids.push({ x0: -3.5, x1: -2.9, z0: 15.2, z1: 15.8 }, { x0: 2.9, x1: 3.5, z0: 15.2, z1: 15.8 });

  // ---- string lights along the midway, on poles --------------------------------------------------------------------
  const lights: THREE.PointLight[] = [];
  const bulbOn = glow('#FFE9A8', 2.6), bulbs: THREE.Mesh[] = [];
  const bulbGeo = T(new THREE.SphereGeometry(0.07, 8, 6));
  const pz = [16, 24, 32.5, 39, 48, 53];
  for (const z of pz) for (const s of [-1, 1]) { cyl(0.07, 0.09, 4.8, std('#2A2A30', { metalness: 0.5 }), root, s * 3.8, 2.4, z, 8); solids.push({ x0: s * 3.8 - 0.25, x1: s * 3.8 + 0.25, z0: z - 0.25, z1: z + 0.25 }); }
  const cols = ['#FF5A5F', '#FFE14D', '#22B8FF', '#3DDC97', '#FF3D9A', '#FFB13D'];
  const bulbMats = cols.map((c) => glow(c, 2.2));
  for (let i = 0; i < pz.length; i++) {
    // a zig-zag strand from one side to the other, sagging in the middle
    const z0 = pz[i], z1 = pz[Math.min(pz.length - 1, i + 1)];
    for (let j = 0; j <= 14; j++) { const f = j / 14, x = -3.8 + 7.6 * f, y = 4.7 - Math.sin(f * Math.PI) * 0.7, z = z0 + (z1 - z0) * f * 0.5; const b = new THREE.Mesh(bulbGeo, bulbMats[(i + j) % cols.length]); b.position.set(x, y, z); root.add(b); bulbs.push(b); }
  }
  for (const [x, z, c] of [[0, 20, '#FFD9A8'], [0, 32, '#FFE6C8'], [0, 44, '#FFD9A8'], [0, 52, '#FFE6C8']] as const) {
    if (k.phone && lights.length >= 2) break;
    const l = new THREE.PointLight(c, 30, 20, 1.4); l.position.set(x, 5, z); root.add(l); lights.push(l);
  }
  void bulbOn;

  // ---- the game booths -----------------------------------------------------------------------------------------------
  type Booth = { id: string; g: THREE.Group; play: THREE.Group; focus: BoothFocus; bulbs: THREE.Mesh[] };
  const booths = new Map<string, Booth>();
  for (const b of BOOTHS) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = b.x < 0 ? Math.PI / 2 : -Math.PI / 2; root.add(g);
    // local: front (counter) toward +z, back wall at z = -1.4, width 4.2
    const wall = std('#4A3A5E'), trim = std(b.color, { emissive: b.color, emissiveIntensity: 0.25 });
    box(4.4, 3.4, 0.2, wall, g, 0, 1.7, -1.5); for (const s of [-1, 1]) box(0.2, 3.4, 3, wall, g, s * 2.2, 1.7, 0);
    box(4.4, 1.0, 0.5, std('#F5EEDC'), g, 0, 0.5, 1.25); box(4.5, 0.12, 0.6, trim, g, 0, 1.05, 1.25);
    // a striped awning and a sign with its name
    for (let i = 0; i < 9; i++) { const st = box(0.5, 0.06, 1.4, i % 2 ? std('#FFFFFF') : trim, g, -2 + i * 0.5, 3.6, 1.2); st.rotation.x = -0.35; }
    const nm = new THREE.Mesh(T(new THREE.PlaneGeometry(3.6, 0.9)), T(new THREE.MeshBasicMaterial({ map: T(k.labelTex(b.name, b.color)), toneMapped: false })));
    nm.position.set(0, 4.2, 1.9); nm.rotation.x = -0.15; g.add(nm);
    const bl: THREE.Mesh[] = []; for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(bulbGeo, bulbOn); m.position.set(-2 + i * 0.44, 3.35, 1.85); g.add(m); bl.push(m); }
    const emo = k.emojiSprite(b.emoji, 0.9); emo.position.set(0, 5.2, 1.2); g.add(emo);
    if (!k.phone || b.z < 30) { const bl2 = new THREE.PointLight(b.color, 9, 7, 1.6); bl2.position.set(0, 3, 2.2); g.add(bl2); }
    const play = new THREE.Group(); g.add(play);
    const toWorld = (v: THREE.Vector3) => v.applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    const focusLocal = b.id === 'striker' ? new THREE.Vector3(0, 1.9, -0.6) : b.id === 'crabs' ? new THREE.Vector3(0, 1.0, -0.3) : new THREE.Vector3(0, 1.75, -0.6);
    const nLocal = b.id === 'crabs' ? new THREE.Vector3(0, 1.1, 1).normalize() : new THREE.Vector3(0, 0.12, 1).normalize();
    const focus: BoothFocus = { spot: toWorld(new THREE.Vector3(0, 0, 2.5)), focus: toWorld(focusLocal.clone()), focusN: nLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y), focusDist: b.id === 'striker' ? 4.6 : b.id === 'crabs' ? 3.1 : 3.6 };
    booths.set(b.id, { id: b.id, g, play, focus, bulbs: bl });
    spots.push({ id: `booth:${b.id}`, kind: 'booth', x: focus.spot.x, z: focus.spot.z, label: b.name, emoji: b.emoji });
    solids.push({ x0: b.x - 1.8, x1: b.x + 1.8, z0: b.z - 2.4, z1: b.z + 2.4 });
  }
  // a booth's props while nobody's playing (the game builds its own when it starts)
  function idle(id: string, play: THREE.Group) {
    clear(play);
    if (id === 'ducks') { box(3.8, 0.25, 0.3, std('#2F7FA8'), play, 0, 1.2, -0.9); box(3.8, 0.25, 0.3, std('#2F7FA8'), play, 0, 1.85, -0.9); for (let i = 0; i < 5; i++) duck(play, -1.6 + i * 0.8, 1.42, -0.9, i === 2 ? 'gold' : 'duck'); }
    if (id === 'darts') { box(3.8, 2.2, 0.1, std('#B8865A'), play, 0, 1.9, -1.35); for (let i = 0; i < 12; i++) ball(0.16, std(cols[i % 6], { roughness: 0.3 }), play, -1.5 + (i % 6) * 0.6, 1.3 + Math.floor(i / 6) * 0.6, -1.15); }
    if (id === 'bottles') { box(1.6, 0.1, 0.5, std('#8B5A2B'), play, 0, 1.05, -0.9); bottlePyramid(play).forEach(() => 0); }
    if (id === 'crabs') { box(3.4, 0.9, 2.2, std('#D0B488'), play, 0, 0.45, -0.3); for (let i = 0; i < 9; i++) { const h = new THREE.Mesh(T(new THREE.CircleGeometry(0.22, 18)), std('#3A2A1A')); h.rotation.x = -Math.PI / 2; h.position.set(-1 + (i % 3), 0.905, -1 + Math.floor(i / 3) * 0.7); play.add(h); } }
    if (id === 'striker') strikerTower(play);
    if (id === 'watergun') { for (let l = 0; l < 3; l++) { clownTarget(play, -1.2 + l * 1.2, 1.4, -1.1); ball(0.1, std(['#7A7A9A', '#FF3D9A', '#7A7A9A'][l]), play, -1.2 + l * 1.2, 2.2, -1.1); } }
  }
  function clear(g: THREE.Group) { while (g.children.length) g.remove(g.children[0]); }

  // ---- little 3D props for the games ------------------------------------------------------------------------------
  const yellow = std('#FFD23F', { roughness: 0.4 }), gold = std('#FFB020', { metalness: 0.8, roughness: 0.25, emissive: '#806010', emissiveIntensity: 0.4 }), white = std('#F8F8F8', { roughness: 0.4 }), orange = std('#FF8A2A');
  function duck(p: THREE.Object3D, x: number, y: number, z: number, kind: 'duck' | 'gold' | 'swan') {
    const d = new THREE.Group(); d.position.set(x, y, z); p.add(d);
    const m = kind === 'gold' ? gold : kind === 'swan' ? white : yellow, s = kind === 'swan' ? 1.35 : 1;
    const body = ball(0.16 * s, m, d); body.scale.set(1.35, 0.85, 0.8);
    ball(0.1 * s, m, d, 0.14 * s, 0.16 * s, 0);
    const beak = new THREE.Mesh(T(new THREE.ConeGeometry(0.04 * s, 0.1 * s, 6)), orange); beak.rotation.z = -Math.PI / 2; beak.position.set(0.26 * s, 0.15 * s, 0); d.add(beak);
    ball(0.02, std('#111'), d, 0.18 * s, 0.2 * s, 0.07 * s);
    d.userData.kind = kind; return d;
  }
  function bottlePyramid(p: THREE.Object3D) {
    const out: THREE.Mesh[] = []; const m = std('#F8F8F8', { roughness: 0.3 }), band = std('#FF5A5F');
    let i = 0;
    for (const [row, n] of [[0, 3], [1, 2], [2, 1]] as const) for (let j = 0; j < n; j++) {
      const b = cyl(0.075, 0.085, 0.3, m, p, (j - (n - 1) / 2) * 0.18, 1.25 + row * 0.31, -0.9, 12); cyl(0.086, 0.086, 0.05, band, b, 0, 0.02, 0, 12); cyl(0.03, 0.05, 0.08, m, b, 0, 0.19, 0, 8);
      b.userData = { row, j, i: i++ }; out.push(b);
    }
    return out;
  }
  function strikerTower(p: THREE.Object3D) {
    box(0.5, 3.4, 0.3, std('#C8352C'), p, 0, 1.8, -1.2);
    for (let i = 0; i <= 10; i++) box(0.7, 0.04, 0.05, std('#FFE14D'), p, 0, 0.35 + i * 0.29, -1.02);
    const bell = new THREE.Mesh(T(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), gold); bell.position.set(0, 3.55, -1.15); bell.rotation.x = Math.PI; p.add(bell); bell.name = 'bell';
    const puck = box(0.3, 0.12, 0.12, white, p, 0, 0.4, -0.98); puck.name = 'puck';
    box(0.8, 0.12, 0.8, std('#555'), p, 0, 0.06, -0.6);
  }
  function clownTarget(p: THREE.Object3D, x: number, y: number, z: number) {
    const t = new THREE.Group(); t.position.set(x, y, z); p.add(t);
    const face = cyl(0.28, 0.28, 0.05, white, t, 0, 0, 0, 24); face.rotation.x = Math.PI / 2;
    const nose = ball(0.08, std('#FF3D3D', { emissive: '#FF3D3D', emissiveIntensity: 0.4 }), t, 0, 0, 0.05); nose.name = 'nose';
    for (const s of [-1, 1]) ball(0.035, std('#111'), t, s * 0.1, 0.08, 0.04);
    return t;
  }
  const crabMesh = (p: THREE.Object3D, kind: 'crab' | 'lobster' | 'star') => {
    const c = new THREE.Group(); p.add(c);
    if (kind === 'star') { const s = new THREE.Mesh(T(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 5)), std('#FFD23F')); c.add(s); }
    else { const m = std(kind === 'lobster' ? '#B8202A' : '#FF5A3A', { roughness: 0.5 }); const b = ball(0.17, m, c, 0, 0.05, 0); b.scale.set(1.3, 0.6, 1); for (const s of [-1, 1]) { ball(0.07, m, c, s * 0.26, 0.08, 0.12); ball(0.03, std('#111'), c, s * 0.06, 0.16, 0.1); } c.scale.setScalar(kind === 'lobster' ? 1.7 : 1.4); }
    c.userData.kind = kind; return c;
  };
  for (const b of booths.values()) idle(b.id, b.play);
  // pops: little spheres that fly out and fade
  const pops: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  const popGeo = T(new THREE.SphereGeometry(0.035, 6, 4));
  const popMats: { mat: THREE.Material; life: number }[] = [];
  const pop = (at: THREE.Vector3, color: string, n = 10) => { const mat = new THREE.MeshBasicMaterial({ color, transparent: true }); popMats.push({ mat, life: 0.7 }); for (let i = 0; i < n; i++) { const m = new THREE.Mesh(popGeo, mat); m.position.copy(at); scene.add(m); pops.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), life: 0.6 }); } };
  const floater = (at: THREE.Vector3, text: string, color: string) => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d')!; g.font = '900 64px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = 'rgba(10,6,30,0.85)'; g.strokeText(text, 256, 64); g.fillStyle = color; g.fillText(text, 256, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(1.2, 0.3, 1); s.position.copy(at); s.renderOrder = 6; scene.add(s); floats.push({ s, life: 0.9 }); };
  const floats: { s: THREE.Sprite; life: number }[] = [];

  // ================================================================================================================
  // the booth games, played in 3D
  // ================================================================================================================
  type Game = { targets?(): THREE.Object3D[]; id: string; score: number; time: number; extra(): string; update(dt: number, t: number): void; input(kind: 'down' | 'move' | 'up', ray: THREE.Raycaster): void; done: boolean };
  let active: { game: Game; booth: Booth; onScore(s: number): void; onEnd(s: number): void } | null = null;
  const rngOf = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const worldOf = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const rootOf = (o: THREE.Object3D, stop: THREE.Object3D) => { let x: THREE.Object3D | null = o; while (x && x.parent !== stop) x = x.parent; return x; };

  const games: Record<string, (b: Booth, r: () => number) => Game> = {
    ducks(b, r) {
      const p = b.play; clear(p);
      box(3.8, 0.25, 0.3, std('#2F7FA8'), p, 0, 1.2, -0.9); box(3.8, 0.25, 0.3, std('#2F7FA8'), p, 0, 1.85, -0.9);
      const rows = [{ y: 1.42, v: 0.9, list: [] as THREE.Group[] }, { y: 2.07, v: -1.2, list: [] as THREE.Group[] }];
      const kindFor = () => (r() < 0.1 ? 'gold' : r() < 0.18 ? 'swan' : 'duck') as 'duck' | 'gold' | 'swan';
      for (const row of rows) for (let i = 0; i < 5; i++) { const d = duck(p, -1.8 + i * 0.85, row.y, -0.9, kindFor()); if (row.v < 0) d.rotation.y = Math.PI; d.userData.down = 0; row.list.push(d); }
      let hits = 0, streak = 0;
      const gm: Game = {
        targets: () => rows.flatMap((x) => x.list).filter((d) => !d.userData.down && d.userData.kind !== 'swan' && Math.abs(d.position.x) < 1.6),
        id: 'ducks', score: 0, time: 40, done: false, extra: () => (streak > 2 ? `🔥 ${streak}` : `🦆 ${hits}`),
        update(dt) {
          gm.time -= dt; if (gm.time <= 0) gm.done = true;
          const sp = 1 + (40 - gm.time) / 30;
          for (const row of rows) for (let i = 0; i < row.list.length; i++) {
            const d = row.list[i];
            d.position.x += row.v * dt * sp;
            // round the back of the booth and out the other side, as a new duck (maybe a gold one, maybe the swan)
            const wrap = d.position.x > 2.125 ? -4.25 : d.position.x < -2.125 ? 4.25 : 0;
            if (wrap) { d.position.x += wrap; d.userData.down = 0; d.rotation.x = 0; const k2 = kindFor(); if (k2 !== d.userData.kind) { const nd = duck(p, d.position.x, d.position.y, -0.9, k2); nd.rotation.y = d.rotation.y; nd.userData.down = 0; row.list[i] = nd; p.remove(d); } continue; }
            if (d.userData.down) d.rotation.x = Math.min(Math.PI / 2, d.rotation.x + dt * 8); else d.position.y = row.y + Math.sin(gm.time * 6 + d.position.x * 3) * 0.02;
          }
        },
        input(kind, ray) {
          if (kind !== 'down' || gm.done) return;
          const all = rows.flatMap((x) => x.list).filter((d) => !d.userData.down);
          const hit = ray.intersectObjects(all, true)[0];
          if (!hit) { streak = 0; pop(ray.ray.at(3.5, new THREE.Vector3()), '#cccccc', 4); return; }
          const d = rootOf(hit.object, p) as THREE.Group; d.userData.down = 1;
          const kd = d.userData.kind as string;
          if (kd === 'swan') { streak = 0; gm.score = Math.max(0, gm.score - 20); floater(worldOf(d).add(new THREE.Vector3(0, 0.4, 0)), 'not the swan! -20', '#FF5A5F'); }
          else { hits++; streak++; const pts = (kd === 'gold' ? 30 : 10) + Math.min(10, streak); gm.score += pts; pop(worldOf(d), kd === 'gold' ? '#FFD23F' : '#FFFFFF', 12); floater(worldOf(d).add(new THREE.Vector3(0, 0.4, 0)), `+${pts}`, '#FFE14D'); }
        },
      };
      return gm;
    },

    darts(b, r) {
      const p = b.play; clear(p);
      const board = box(3.8, 2.2, 0.1, std('#B8865A'), p, 0, 1.9, -1.35);
      type Bal = { m: THREE.Mesh; base: THREE.Vector3; alive: boolean; respawn: number; gold: boolean };
      const bals: Bal[] = [];
      const make = (i: number): Bal => { const gold = r() < 0.12; const m = ball(0.16, gold ? gold_ : std(cols[Math.floor(r() * 6)], { roughness: 0.3 }), p, 0, 0, -1.15); m.scale.y = 1.15; const base = new THREE.Vector3(-1.5 + (i % 6) * 0.6, 1.3 + Math.floor(i / 6) * 0.6, -1.15); m.position.copy(base); return { m, base, alive: true, respawn: 0, gold }; };
      const gold_ = std('#FFD23F', { metalness: 0.6, roughness: 0.2, emissive: '#806010', emissiveIntensity: 0.4 });
      for (let i = 0; i < 12; i++) bals.push(make(i));
      const darts: { m: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number }[] = [];
      let popped = 0, thrown = 0;
      const gm: Game = {
        targets: () => bals.filter((x) => x.alive).map((x) => x.m),
        id: 'darts', score: 0, time: 40, done: false, extra: () => `🎈 ${popped}/${thrown}`,
        update(dt, t) {
          gm.time -= dt; if (gm.time <= 0) gm.done = true;
          bals.forEach((bl, i) => { if (bl.alive) { bl.m.position.x = bl.base.x + Math.sin(t * 1.3 + i) * 0.12 * (1 + (40 - gm.time) / 25); bl.m.position.y = bl.base.y + Math.sin(t * 1.7 + i * 2) * 0.08; } else { bl.respawn -= dt; if (bl.respawn <= 0) { p.remove(bl.m); bals[i] = make(i); } } });
          for (let i = darts.length - 1; i >= 0; i--) {
            const d = darts[i]; d.t += dt / 0.32; const k2 = Math.min(1, d.t); d.m.position.lerpVectors(d.from, d.to, k2); d.m.position.y += Math.sin(k2 * Math.PI) * 0.15;
            if (k2 >= 1) {
              darts.splice(i, 1); setTimeout(() => p.remove(d.m), 700);
              const local = p.worldToLocal(d.to.clone());
              const hit = bals.find((bl) => bl.alive && bl.m.position.distanceTo(new THREE.Vector3(local.x, local.y, bl.m.position.z)) < 0.2);
              if (hit) { hit.alive = false; hit.respawn = 1.5; hit.m.visible = false; popped++; const pts = hit.gold ? 30 : 10; gm.score += pts; pop(worldOf(hit.m), hit.gold ? '#FFD23F' : '#FF8AD8', 14); floater(worldOf(hit.m).add(new THREE.Vector3(0, 0.3, 0)), `+${pts}`, '#FFE14D'); }
            }
          }
        },
        input(kind, ray) {
          if (kind !== 'down' || gm.done) return;
          const h = ray.intersectObjects([board, ...bals.filter((x) => x.alive).map((x) => x.m)], false)[0]; if (!h) return;
          thrown++;
          const dart = new THREE.Group(); const shaft = cyl(0.012, 0.012, 0.3, std('#5A3A20'), dart); shaft.rotation.x = Math.PI / 2; const tip = new THREE.Mesh(T(new THREE.ConeGeometry(0.02, 0.06, 6)), std('#C0C4CC')); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.18; dart.add(tip); box(0.06, 0.06, 0.02, std('#FF3D9A'), dart, 0, 0, 0.14);
          scene.add(dart); const from = ray.ray.origin.clone().addScaledVector(ray.ray.direction, 0.8).add(new THREE.Vector3(0, -0.3, 0)); dart.lookAt(h.point); dart.position.copy(from);
          darts.push({ m: dart, from, to: h.point.clone(), t: 0 });
        },
      };
      return gm;
    },

    bottles(b) {
      const p = b.play; clear(p);
      box(1.6, 0.1, 0.5, std('#8B5A2B'), p, 0, 1.05, -0.9);
      const aim = new THREE.Mesh(T(new THREE.PlaneGeometry(4, 3)), T(new THREE.MeshBasicMaterial({ visible: false }))); aim.position.set(0, 1.6, -0.9); p.add(aim);
      let bottles = bottlePyramid(p), balls = 3, racks = 0, resetT = 0, knocked = 0;
      const fall: { m: THREE.Mesh; v: THREE.Vector3; spin: number }[] = [];
      const flying: { m: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }[] = [];
      const ballsLeft: THREE.Mesh[] = []; for (let i = 0; i < 3; i++) ballsLeft.push(ball(0.07, std('#FFFFFF'), p, -0.3 + i * 0.3, 1.13, 1.3));
      const knock = (bt: THREE.Mesh) => { if (bt.userData.down) return; bt.userData.down = 1; knocked++; gm.score += 10; fall.push({ m: bt, v: new THREE.Vector3((Math.random() - 0.5) * 2, 1.5, -1.5 - Math.random()), spin: (Math.random() - 0.5) * 12 });
        // anything sitting on it falls too
        for (const o of bottles) if (!o.userData.down && o.userData.row === bt.userData.row + 1 && Math.abs(o.position.x - bt.position.x) < 0.12) knock(o); };
      const rack = () => { bottles.forEach((x) => p.remove(x)); bottles = bottlePyramid(p); balls = 3; ballsLeft.forEach((m) => (m.visible = true)); };
      const gm: Game = {
        targets: () => bottles.filter((x) => !x.userData.down),
        id: 'bottles', score: 0, time: 45, done: false, extra: () => `🍼 rack ${racks + 1} · ⚾ ${balls}`,
        update(dt) {
          gm.time -= dt; if (gm.time <= 0) gm.done = true;
          for (let i = flying.length - 1; i >= 0; i--) {
            const f = flying[i]; f.t += dt / 0.38; const k2 = Math.min(1, f.t); f.m.position.lerpVectors(f.from, f.to, k2); f.m.position.y += Math.sin(k2 * Math.PI) * 0.35;
            if (k2 >= 1) { flying.splice(i, 1); p.remove(f.m); const hitAny = bottles.filter((bt) => !bt.userData.down && Math.hypot(bt.position.x - f.to.x, bt.position.y - f.to.y) < 0.2); if (hitAny.length) { hitAny.forEach(knock); pop(p.localToWorld(f.to.clone()), '#FFFFFF', 8); } else floater(p.localToWorld(f.to.clone()), 'miss', '#aaaaaa'); }
          }
          for (const f of fall) { f.v.y -= 9 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.z += f.spin * dt; if (f.m.position.y < 0.2) f.v.set(0, 0, 0); }
          if (resetT > 0) { resetT -= dt; if (resetT <= 0) { fall.length = 0; rack(); } }
          else if (bottles.every((x) => x.userData.down)) { racks++; const bonus = 20 + balls * 10; gm.score += bonus; floater(p.localToWorld(new THREE.Vector3(0, 2.2, -0.9)), `Cleared! +${bonus}`, '#3DDC97'); resetT = 1; }
          else if (balls <= 0 && !flying.length) resetT = 1;
        },
        input(kind, ray) {
          if (kind !== 'down' || gm.done || balls <= 0 || resetT > 0) return;
          const h = ray.intersectObject(aim)[0]; if (!h) return;
          balls--; ballsLeft[2 - balls].visible = false;
          const to = p.worldToLocal(h.point.clone()); const from = new THREE.Vector3(0, 1.3, 1.6);
          const m = ball(0.07, std('#FFFFFF'), p, from.x, from.y, from.z); flying.push({ m, from, to, t: 0 });
        },
      };
      void knocked;
      return gm;
    },

    crabs(b, r) {
      const p = b.play; clear(p);
      box(3.4, 0.9, 2.2, std('#D0B488'), p, 0, 0.45, -0.3);
      const holes = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(-1 + (i % 3), 0.905, -1 + Math.floor(i / 3) * 0.7));
      for (const h of holes) { const d = new THREE.Mesh(T(new THREE.CircleGeometry(0.24, 18)), std('#3A2A1A')); d.rotation.x = -Math.PI / 2; d.position.copy(h); p.add(d); }
      type Up = { g: THREE.Group; hole: number; up: number; life: number; kind: string };
      const ups: Up[] = [];
      let spawn = 0.5, combo = 0, bops = 0;
      const gm: Game = {
        targets: () => ups.filter((u) => u.kind !== 'star' && u.up > 0.5).map((u) => u.g),
        id: 'crabs', score: 0, time: 35, done: false, extra: () => (combo > 2 ? `🔥 ×${combo}` : `🦀 ${bops}`),
        update(dt) {
          gm.time -= dt; if (gm.time <= 0) gm.done = true;
          spawn -= dt;
          if (spawn <= 0) { const free = holes.map((_, i) => i).filter((i) => !ups.some((u) => u.hole === i)); if (free.length) { const hole = free[Math.floor(r() * free.length)], roll = r(); const kind = roll < 0.12 ? 'lobster' : roll < 0.3 ? 'star' : 'crab'; const g = crabMesh(p, kind as 'crab'); g.position.copy(holes[hole]).add(new THREE.Vector3(0, -0.25, 0)); ups.push({ g, hole, up: 0, life: Math.max(0.75, 1.6 - (35 - gm.time) / 40), kind }); } spawn = Math.max(0.28, 0.8 - (35 - gm.time) / 60); }
          for (let i = ups.length - 1; i >= 0; i--) { const u = ups[i]; u.up = Math.min(1, u.up + dt * 6); u.life -= dt; u.g.position.y = holes[u.hole].y - 0.25 + u.up * 0.3; if (u.kind !== 'star') u.g.rotation.y = Math.sin(gm.time * 10 + i) * 0.3; if (u.life <= 0) { if (u.kind !== 'star') combo = 0; p.remove(u.g); ups.splice(i, 1); } }
        },
        input(kind, ray) {
          if (kind !== 'down' || gm.done) return;
          const h = ray.intersectObjects(ups.map((u) => u.g), true)[0]; if (!h) return;
          const g = rootOf(h.object, p); const u = ups.find((x) => x.g === g); if (!u) return;
          ups.splice(ups.indexOf(u), 1); u.g.scale.y = 0.3; setTimeout(() => p.remove(u.g), 150);
          if (u.kind === 'star') { combo = 0; gm.score = Math.max(0, gm.score - 15); floater(worldOf(u.g).add(new THREE.Vector3(0, 0.4, 0)), 'ouch! -15', '#FF5A5F'); }
          else { combo++; bops++; const pts = (u.kind === 'lobster' ? 15 : 5) + Math.min(10, combo); gm.score += pts; pop(worldOf(u.g), '#FF8A5A', 10); floater(worldOf(u.g).add(new THREE.Vector3(0, 0.4, 0)), `+${pts}`, '#FFE14D'); }
        },
      };
      return gm;
    },

    striker(b) {
      const p = b.play; clear(p); strikerTower(p);
      const puck = p.getObjectByName('puck')!, bell = p.getObjectByName('bell')!;
      // the power gauge on the counter: a track and a sliding needle
      const segs = [['#3DDC97', 0.7], ['#FFE14D', 0.22], ['#FF3D9A', 0.08]] as const; let x0 = -1.2;
      for (const [c, w] of segs) { box(2.4 * w, 0.12, 0.04, std(c, { emissive: c, emissiveIntensity: 0.6 }), p, x0 + (2.4 * w) / 2, 1.25, 1.2); x0 += 2.4 * w; }
      const needle = box(0.05, 0.3, 0.06, std('#FFFFFF', { emissive: '#ffffff', emissiveIntensity: 1 }), p, -1.2, 1.25, 1.24);
      const hammer = new THREE.Group(); hammer.position.set(0.7, 0.2, -0.5); p.add(hammer); cyl(0.03, 0.03, 1.1, std('#8B5A2B'), hammer, 0, 0.55, 0); box(0.35, 0.2, 0.2, std('#555'), hammer, 0, 1.1, 0);
      let nv = 1.2, k2 = 0, phase: 'aim' | 'fly' = 'aim', h = 0, hv = 0, swing = 0, rings = 0, ring = 0;
      const gm: Game = {
        id: 'striker', score: 0, time: 40, done: false, extra: () => `🔔 ${rings}`,
        update(dt) {
          gm.time -= dt; if (gm.time <= 0 && phase === 'aim') gm.done = true;
          if (phase === 'aim') { k2 += nv * dt * (1 + rings * 0.08); if (k2 > 1) { k2 = 1; nv = -Math.abs(nv); } if (k2 < 0) { k2 = 0; nv = Math.abs(nv); } needle.position.x = -1.2 + 2.4 * k2; }
          else { h += hv * dt; hv -= 2.4 * dt; if (h >= 1) { h = 1; hv = Math.min(hv, 0); } if (hv <= 0 && h <= 0.001 + 0) { phase = 'aim'; } if (hv <= 0) { phase = 'aim'; const top = h >= 0.999; if (top) { rings++; ring = 1; const pts = 40 + rings * 5; gm.score += pts; pop(worldOf(bell), '#FFE14D', 20); floater(worldOf(bell).add(new THREE.Vector3(0, 0.5, 0)), `DING! +${pts}`, '#FFE14D'); } else { const pts = Math.round(h * 25); gm.score += pts; floater(worldOf(puck).add(new THREE.Vector3(0, 0.3, 0)), h > 0.8 ? `so close! +${pts}` : `+${pts}`, '#FFFFFF'); } h = 0; } }
          puck.position.y = 0.4 + h * 3.0;
          swing = Math.max(0, swing - dt * 4); hammer.rotation.z = -swing * 1.6;
          ring = Math.max(0, ring - dt * 2); bell.rotation.z = Math.sin(ring * 30) * 0.3 * ring;
        },
        input(kind) {
          if (kind !== 'down' || phase !== 'aim' || gm.done) return;
          const pow = k2 >= 0.92 ? 1.08 : k2 * 0.95; hv = Math.sqrt(2 * 2.4 * pow); phase = 'fly'; swing = 1;
        },
      };
      return gm;
    },

    watergun(b, r) {
      const p = b.play; clear(p);
      const lanes = [-1.2, 0, 1.2].map((x) => ({ t: clownTarget(p, x, 1.4, -1.1), bal: ball(0.1, std('#7A7A9A'), p, x, 2.2, -1.1), v: 0, x }));
      (lanes[1].bal.material as THREE.MeshStandardMaterial) = std('#FF3D9A');
      for (const l of lanes) box(1, 0.04, 0.04, std('#FFE14D'), p, l.x, 1.05, -1.1);
      const stream = cyl(0.025, 0.025, 1, std('#9AE6FF', { transparent: true, opacity: 0.8, emissive: '#9AE6FF', emissiveIntensity: 0.6 }), p); stream.visible = false;
      const gun = new THREE.Vector3(0, 1.0, 0.9);
      let held: THREE.Raycaster | null = null, wins = 0, race = 1, pause = 0, speed = 0.5;
      const reset = () => { for (const l of lanes) { l.v = 0; l.bal.scale.setScalar(1); l.bal.visible = true; } race++; speed = 0.5 + race * 0.08; pause = 0; };
      const gm: Game = {
        targets: () => [lanes[1].t],
        id: 'watergun', score: 0, time: 45, done: false, extra: () => `🏆 ${wins} · race ${race}`,
        update(dt, t) {
          gm.time -= dt; if (gm.time <= 0) gm.done = true;
          lanes.forEach((l, i) => { l.t.position.x = l.x + Math.sin(t * speed * (1.3 + i * 0.4) + i) * 0.38; l.bal.scale.setScalar(1 + l.v * 2.2); });
          if (pause > 0) { pause -= dt; if (pause <= 0) reset(); stream.visible = false; return; }
          let on = false;
          if (held) { const h = held.intersectObject(lanes[1].t, true)[0]; if (h) { on = true; lanes[1].v += dt * 0.17; gm.score += dt * 8; const to = p.worldToLocal(h.point.clone()); stream.visible = true; const mid = gun.clone().add(to).multiplyScalar(0.5); stream.position.copy(mid); stream.scale.y = gun.distanceTo(to); stream.lookAt(p.localToWorld(to.clone())); stream.rotateX(Math.PI / 2); } }
          if (!on) stream.visible = false;
          lanes[0].v += dt * (0.06 + race * 0.012) * (0.6 + r() * 0.8); lanes[2].v += dt * (0.065 + race * 0.012) * (0.6 + r() * 0.8);
          const winner = lanes.findIndex((l) => l.v >= 1);
          if (winner >= 0) { const l = lanes[winner]; l.bal.visible = false; pop(worldOf(l.bal), winner === 1 ? '#FF3D9A' : '#9A9AB0', 20); if (winner === 1) { wins++; const pts = 80 + race * 10; gm.score += pts; floater(worldOf(l.bal), `You win! +${pts}`, '#FFE14D'); } else floater(worldOf(l.bal), 'a rival popped first', '#FFFFFF'); pause = 1.4; }
        },
        input(kind, ray) { held = kind === 'up' ? null : cloneRay(ray); },
      };
      return gm;
    },
  };
  const cloneRay = (r: THREE.Raycaster) => { const c = new THREE.Raycaster(); c.ray.copy(r.ray); return c; };

  // ---- rides and stands -------------------------------------------------------------------------------------------
  // Ferris wheel (far left) and carousel (far right)
  const wheel = new THREE.Group(); wheel.position.set(-14, 0, 48); root.add(wheel);
  const R = 7, hub = new THREE.Vector3(0, R + 1.2, 0);
  for (const s of [-1, 1]) { const leg = cyl(0.18, 0.25, R + 1.6, std('#E8E4DC', { metalness: 0.4 }), wheel, s * 2.2, (R + 1.2) / 2, 0.8); leg.rotation.z = s * 0.28; const leg2 = cyl(0.18, 0.25, R + 1.6, std('#E8E4DC', { metalness: 0.4 }), wheel, s * 2.2, (R + 1.2) / 2, -0.8); leg2.rotation.z = s * 0.28; }
  const rim = new THREE.Group(); rim.position.copy(hub); wheel.add(rim);
  rim.add(new THREE.Mesh(T(new THREE.TorusGeometry(R, 0.12, 8, 64)), glow('#FF3D9A', 1.4)));
  rim.add(new THREE.Mesh(T(new THREE.TorusGeometry(R * 0.55, 0.08, 8, 48)), glow('#22E3FF', 1.4)));
  for (let i = 0; i < 12; i++) { const sp2 = box(0.06, R * 2, 0.06, std('#E8E4DC'), rim); sp2.rotation.z = (i / 12) * Math.PI; }
  const rimBulbs: THREE.Mesh[] = []; for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; const m = new THREE.Mesh(bulbGeo, bulbMats[i % 6]); m.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.15); rim.add(m); rimBulbs.push(m); }
  const gondolas: THREE.Group[] = [];
  for (let i = 0; i < 10; i++) { const gd = new THREE.Group(); wheel.add(gd); box(1.1, 0.7, 0.9, std(cols[i % 6]), gd, 0, -0.5, 0); const top = new THREE.Mesh(T(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 16)), std('#FFFFFF')); top.position.y = 0.05; gd.add(top); cyl(0.02, 0.02, 0.5, std('#999'), gd, 0, -0.2, 0, 6); gondolas.push(gd); }
  box(5, 0.3, 3, std('#3A3240'), wheel, 0, 0.15, 0);
  solids.push({ x0: -17.5, x1: -10.5, z0: 46.2, z1: 49.8 });
  spots.push({ id: 'ride:wheel', kind: 'ride', x: -14, z: 45, label: 'Ferris wheel', emoji: '🎡' });
  let wheelSpin = 0;
  const gondolaPos = (i: number, spin: number) => { const a = spin + (i / gondolas.length) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * R, hub.y + Math.sin(a) * R, 0.9); };

  const carousel = new THREE.Group(); carousel.position.set(14, 0, 48); root.add(carousel);
  cyl(4, 4.2, 0.4, std('#E8E4DC'), carousel, 0, 0.2, 0, 32);
  const spin = new THREE.Group(); carousel.add(spin);
  cyl(3.8, 3.8, 0.1, std('#C9A06A'), spin, 0, 0.45, 0, 32); cyl(0.3, 0.3, 4.2, std('#FFE14D', { metalness: 0.6 }), spin, 0, 2.5, 0);
  const canopy = new THREE.Mesh(T(new THREE.ConeGeometry(4.4, 1.8, 16)), std('#FF3D9A')); canopy.position.y = 5.3; spin.add(canopy);
  for (let i = 0; i < 16; i++) { const st = new THREE.Mesh(T(new THREE.ConeGeometry(4.42, 1.82, 16, 1, true, (i / 16) * Math.PI * 2, Math.PI / 16)), std('#FFFFFF', { side: THREE.DoubleSide })); st.position.y = 5.3; if (i % 2) spin.add(st); }
  const horses: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, hg = new THREE.Group(); hg.position.set(Math.cos(a) * 2.8, 1.4, Math.sin(a) * 2.8); hg.rotation.y = -a; spin.add(hg);
    cyl(0.04, 0.04, 3.8, std('#FFE14D', { metalness: 0.6 }), spin, Math.cos(a) * 2.8, 2.3, Math.sin(a) * 2.8, 8);
    const hm = std(['#FFFFFF', '#FFB8E0', '#9AE6FF', '#FFE14D'][i % 4], { roughness: 0.4 });
    const bodyH = ball(0.32, hm, hg); bodyH.scale.set(0.6, 0.6, 1.4); const neck = cyl(0.1, 0.13, 0.5, hm, hg, 0, 0.3, 0.38); neck.rotation.x = 0.5; ball(0.15, hm, hg, 0, 0.55, 0.55); for (const s of [-1, 1]) for (const z of [-0.3, 0.3]) cyl(0.04, 0.04, 0.5, hm, hg, s * 0.12, -0.3, z, 6);
    horses.push(hg);
  }
  const caroLights: THREE.Mesh[] = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const m = new THREE.Mesh(bulbGeo, bulbMats[i % 6]); m.position.set(Math.cos(a) * 4.1, 4.5, Math.sin(a) * 4.1); spin.add(m); caroLights.push(m); }
  solids.push({ x0: 9.8, x1: 18.2, z0: 43.8, z1: 52.2 });
  spots.push({ id: 'ride:carousel', kind: 'ride', x: 14, z: 42.6, label: 'Carousel', emoji: '🎠' });

  // the treat cart (left), the fortune teller (right), the photo booth (left), the fireworks launcher (far end)
  const cart = new THREE.Group(); cart.position.set(-14.5, 0, 21.6); cart.rotation.y = Math.PI / 2; root.add(cart);
  box(2.6, 1.2, 1.2, std('#FF8AD8'), cart, 0, 0.9, 0); box(2.7, 0.08, 1.3, std('#FFFFFF'), cart, 0, 1.52, 0);
  for (const s of [-1, 1]) { const w = cyl(0.35, 0.35, 0.12, std('#333'), cart, s * 0.9, 0.35, 0.62); w.rotation.x = Math.PI / 2; }
  cyl(0.05, 0.05, 2.2, std('#ddd'), cart, 0.9, 2.5, 0); const umb = new THREE.Mesh(T(new THREE.ConeGeometry(1.5, 0.6, 12)), std('#22B8FF')); umb.position.set(0.9, 3.7, 0); cart.add(umb);
  const candy = ball(0.35, std('#FFB8E0', { roughness: 0.9 }), cart, -0.6, 2.0, 0); cyl(0.02, 0.02, 0.5, std('#fff'), cart, -0.6, 1.6, 0, 6); void candy;
  const cartEmo = k.emojiSprite('🍭', 0.9); cartEmo.position.set(0, 3.2, 0); cart.add(cartEmo);
  solids.push({ x0: -15.4, x1: -13.6, z0: 20.1, z1: 23.1 });
  spots.push({ id: 'treats', kind: 'treats', x: -12.2, z: 21.6, label: 'Treat cart', emoji: '🍭' });

  const tent = new THREE.Group(); tent.position.set(14.8, 0, 21.6); root.add(tent);
  const tentMat = std('#6A2A8A'); const tc = new THREE.Mesh(T(new THREE.ConeGeometry(2.2, 3.4, 10)), tentMat); tc.position.y = 3.2; tent.add(tc); cyl(2.2, 2.2, 1.6, tentMat, tent, 0, 0.8, 0, 10);
  const crystal = ball(0.32, std('#C8A8FF', { transparent: true, opacity: 0.8, emissive: '#8B5CFF', emissiveIntensity: 1.2 }), tent, -1.6, 1.2, 0); cyl(0.2, 0.3, 0.8, std('#3A2A44'), tent, -1.6, 0.5, 0);
  const tentEmo = k.emojiSprite('🔮', 0.9); tentEmo.position.set(0, 5.4, 0); tent.add(tentEmo);
  solids.push({ x0: 12.6, x1: 17, z0: 19.4, z1: 23.8 });
  spots.push({ id: 'fortune', kind: 'fortune', x: 11.6, z: 21.6, label: 'Fortune teller', emoji: '🔮' });

  const photo = new THREE.Group(); photo.position.set(-14.5, 0, 31); photo.rotation.y = Math.PI / 2; root.add(photo);
  box(2, 2.6, 1.6, std('#22B8FF'), photo, 0, 1.3, 0); box(1.2, 2.0, 0.05, std('#C8352C'), photo, 0.2, 1.1, 0.82);
  const camEmo = k.emojiSprite('📸', 0.9); camEmo.position.set(0, 3.3, 0); photo.add(camEmo);
  solids.push({ x0: -15.4, x1: -13.6, z0: 29.8, z1: 32.2 });
  spots.push({ id: 'photo', kind: 'photo', x: -12.4, z: 31, label: 'Photo booth', emoji: '📸' });

  const launcher = new THREE.Group(); launcher.position.set(0, 0, 54); root.add(launcher);
  box(3, 0.4, 1.4, std('#3A3240'), launcher, 0, 0.2, 0); for (let i = 0; i < 5; i++) { const tb = cyl(0.12, 0.14, 0.9, std(cols[i]), launcher, -1 + i * 0.5, 0.75, 0, 10); tb.rotation.x = -0.15; }
  const fwEmo = k.emojiSprite('🎆', 0.9); fwEmo.position.set(0, 2, 0); launcher.add(fwEmo);
  solids.push({ x0: -1.7, x1: 1.7, z0: 53.2, z1: 54.8 });
  spots.push({ id: 'fireworks', kind: 'fireworks', x: 0, z: 51.8, label: 'Fireworks', emoji: '🎆' });

  // ---- carnival-goers, wandering the midway --------------------------------------------------------------------------
  const folk: { s: THREE.Sprite; x: number; z: number; tx: number; tz: number; v: number }[] = [];
  const rr = rngOf(77);
  for (let i = 0; i < (k.phone ? 6 : 10); i++) { const s = k.emojiSprite(['🧒', '👧', '🧑', '👩‍🦰', '🧔', '👵', '👦', '🧑‍🦱', '👨‍👩‍👧', '🤡'][i], 1.1); s.center.set(0.5, 0); root.add(s); const x = (rr() - 0.5) * 5, z = 18 + rr() * 34; folk.push({ s, x, z, tx: x, tz: z, v: 0.8 + rr() * 0.6 }); }
  const balloons: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) { const bg = new THREE.Group(); const b = BOOTHS[i]; bg.position.set(b.x + (b.x < 0 ? -1.2 : 1.2), 1.4, b.z - 2.4); root.add(bg); for (let j = 0; j < 3; j++) { ball(0.28, std(cols[(i + j) % 6], { roughness: 0.3 }), bg, (j - 1) * 0.35, 3.4 + j * 0.25, 0); } for (let j = 0; j < 3; j++) { const st = cyl(0.008, 0.008, 2.4, std('#ffffff'), bg, (j - 1) * 0.17, 2.1, 0, 4); st.rotation.z = (j - 1) * 0.15; } balloons.push(bg); }

  // ---- fireworks ---------------------------------------------------------------------------------------------------
  type Burst = { pts: THREE.Points; vel: Float32Array; life: number };
  // a soft round spark (points are squares otherwise)
  const spark = tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  spark.repeat.set(1, 1);
  const bursts: Burst[] = [];
  const rockets: { m: THREE.Mesh; v: THREE.Vector3; fuse: number; color: string }[] = [];
  let showT = 0;
  const burstAt = (at: THREE.Vector3, color: string) => {
    const n = k.phone ? 60 : 110, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z; const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1), s = 5 + Math.random() * 2; vel[i * 3] = Math.sin(e) * Math.cos(a) * s; vel[i * 3 + 1] = Math.cos(e) * s; vel[i * 3 + 2] = Math.sin(e) * Math.sin(a) * s; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, map: spark, size: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    scene.add(pts); bursts.push({ pts, vel, life: 1.8 });
  };

  // ---- each frame ----------------------------------------------------------------------------------------------------
  let rideCam: null | ((t: number) => { pos: THREE.Vector3; look: THREE.Vector3 }) = null;
  let rideEnd = 0, rideId = '';
  const update = (t: number, dt: number, camZ: number, meZ: number) => {
    // the front wall and roof get out of the way while you're inside (the camera looks in through the front)
    const inside = camZ < CARNIVAL_Z + 0.5 || meZ < CARNIVAL_Z;
    frontMat.opacity = inside ? 0.08 : 1; signMat.opacity = inside ? 0.1 : 1; void doorGlow;
    roofGroup.visible = !inside;
    const on = Math.floor(t * 6);
    bulbs.forEach((b, i) => { b.visible = (i + on) % 3 !== 0; });
    for (const bt of booths.values()) bt.bulbs.forEach((b, i) => { b.visible = (i + on) % 2 === 0; });
    wheelSpin += dt * 0.12; rim.rotation.z = wheelSpin; gondolas.forEach((g, i) => g.position.copy(gondolaPos(i, wheelSpin)));
    rimBulbs.forEach((b, i) => { b.visible = (i + on) % 4 !== 0; });
    spin.rotation.y += dt * 0.35; horses.forEach((h, i) => { h.position.y = 1.4 + Math.sin(t * 2.4 + i * 1.3) * 0.25; }); caroLights.forEach((b, i) => { b.visible = (i + on) % 2 === 0; });
    crystal.scale.setScalar(1 + Math.sin(t * 3) * 0.06); umb.rotation.y = t * 0.2;
    balloons.forEach((b, i) => { b.rotation.z = Math.sin(t * 1.2 + i) * 0.05; });
    for (const f of folk) { const d = Math.hypot(f.tx - f.x, f.tz - f.z); if (d < 0.2) { f.tx = (Math.random() - 0.5) * 5; f.tz = 18 + Math.random() * 34; } else { f.x += ((f.tx - f.x) / d) * f.v * dt; f.z += ((f.tz - f.z) / d) * f.v * dt; } f.s.position.set(f.x, Math.abs(Math.sin(t * 6 + f.v * 10)) * 0.05, f.z); }
    // booth game
    if (active) {
      active.game.update(dt, t); active.onScore(Math.round(active.game.score));
      if (active.game.done) { const a = active; active = null; a.onEnd(Math.round(a.game.score)); setTimeout(() => idle(a.booth.id, a.booth.play), 400); }
    }
    for (let i = pops.length - 1; i >= 0; i--) { const q = pops[i]; q.life -= dt; q.v.y -= 6 * dt; q.m.position.addScaledVector(q.v, dt); (q.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, q.life * 1.7); if (q.life <= 0) { scene.remove(q.m); pops.splice(i, 1); } }
    for (let i = popMats.length - 1; i >= 0; i--) { popMats[i].life -= dt; if (popMats[i].life <= 0) { popMats[i].mat.dispose(); popMats.splice(i, 1); } }
    for (let i = floats.length - 1; i >= 0; i--) { const q = floats[i]; q.life -= dt; q.s.position.y += dt * 0.6; q.s.material.opacity = Math.min(1, q.life * 2); if (q.life <= 0) { scene.remove(q.s); q.s.material.map?.dispose(); q.s.material.dispose(); floats.splice(i, 1); } }
    // fireworks: a few rockets a second while the show's on
    if (showT > 0) { showT -= dt; if (Math.random() < dt * 3.2) rockets.push({ m: ball(0.12, glow('#FFE9A8', 3), root, (Math.random() - 0.5) * 3, 1, 54), v: new THREE.Vector3((Math.random() - 0.5) * 6, 12 + Math.random() * 4, -2 - Math.random() * 3), fuse: 0.9 + Math.random() * 0.35, color: cols[Math.floor(Math.random() * 6)] }); }
    for (let i = rockets.length - 1; i >= 0; i--) { const q = rockets[i]; q.fuse -= dt; q.v.y -= 9 * dt; q.m.position.addScaledVector(q.v, dt); if (q.fuse <= 0) { burstAt(q.m.position.clone(), q.color); root.remove(q.m); rockets.splice(i, 1); } }
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.life -= dt; const pos = b.pts.geometry.attributes.position as THREE.BufferAttribute; for (let j = 0; j < b.vel.length / 3; j++) { b.vel[j * 3 + 1] -= 3 * dt; b.vel[j * 3] *= 1 - dt; b.vel[j * 3 + 1] *= 1 - dt; b.vel[j * 3 + 2] *= 1 - dt; pos.array[j * 3] += b.vel[j * 3] * dt; pos.array[j * 3 + 1] += b.vel[j * 3 + 1] * dt; pos.array[j * 3 + 2] += b.vel[j * 3 + 2] * dt; } pos.needsUpdate = true; (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / 1.8); if (b.life <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); (b.pts.material as THREE.Material).dispose(); bursts.splice(i, 1); } }
    if (rideCam && t > rideEnd) { rideCam = null; rideId = ''; }
  };

  return {
    spots, solids, update, ground,
    focusOf: (id: string) => booths.get(id)?.focus ?? null,
    /** start a booth game; onScore ticks, onEnd once with the final score */
    startGame(id: string, seed: number, onScore: (s: number) => void, onEnd: (s: number) => void) {
      const b = booths.get(id); if (!b || !games[id]) return false;
      active = { game: games[id](b, rngOf(seed)), booth: b, onScore, onEnd }; return true;
    },
    stopGame() { if (!active) return; const a = active; active = null; a.onEnd(Math.round(a.game.score)); idle(a.booth.id, a.booth.play); },
    targets: () => active?.game.targets?.().map((o) => o.getWorldPosition(new THREE.Vector3())) ?? [],
    gameState: (): BoothState | null => (active ? { id: active.game.id, score: Math.round(active.game.score), time: Math.max(0, active.game.time), extra: active.game.extra(), done: active.game.done } : null),
    input(kind: 'down' | 'move' | 'up', ray: THREE.Raycaster) { active?.game.input(kind, ray); },
    playing: () => !!active,
    /** take a ride: the camera rides along for a while */
    ride(id: 'wheel' | 'carousel', seconds: number, now: number) {
      rideId = id; rideEnd = now + seconds;
      rideCam = id === 'wheel'
        ? () => { const p = gondolaPos(0, wheelSpin).add(wheel.position); return { pos: p.add(new THREE.Vector3(0, 0.3, -2.4)), look: new THREE.Vector3(2, 1.5, 24) }; }
        : (t2) => { const a = spin.rotation.y + 0.4, c = carousel.position, out = new THREE.Vector3(Math.cos(-a), 0, Math.sin(-a));
          // riding a horse on the outside of the ring, looking across the turning carousel and out at the carnival beyond
          return { pos: new THREE.Vector3(c.x, 2.5 + Math.sin(t2 * 2.4) * 0.2, c.z).addScaledVector(out, 3.4), look: new THREE.Vector3(c.x, 1.6, c.z).addScaledVector(out, -9).add(new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(3)) }; };
    },
    riding: () => rideId,
    rideCamera: (t: number) => (rideCam ? rideCam(t) : null),
    endRide() { rideCam = null; rideId = ''; },
    fireworks(seconds = 12) { showT = seconds; },
    dispose() { for (const b of bursts) { b.pts.geometry.dispose(); (b.pts.material as THREE.Material).dispose(); } },
  };
}
export type Carnival = ReturnType<typeof buildCarnival>;
