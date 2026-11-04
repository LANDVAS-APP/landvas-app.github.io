// Main Street in 3D: your lemonade stand at the front, and a building for every venture you own along the
// street behind it (cookie cart, food truck, coffee shop … bank, a rocket on its pad). Buildings grow as you own
// more, customers stroll the pavement (more of them as you earn more), and cash pops out of every business.
// Drag to look along the street.
import * as THREE from 'three';

export type StreetOpts = { canvas: HTMLCanvasElement; seed: number; reduceMotion?: boolean };
export type StreetScene = {
  setVentures(v: Record<string, number>, income: number): void;
  /** a quick bounce of the stand and a coin burst (each tap) */ tap(): void;
  setFrenzy(on: boolean): void;
  dispose(): void;
};

const ORDER = ['lemonade', 'cookies', 'food_truck', 'coffee', 'bookstore', 'arcade', 'hotel', 'tech', 'bank', 'space'];
const SPACING = 9;
const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

function emojiSprite(e: string, size = 1, font = 96) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; g.font = `${font}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.setScalar(size);
  return s;
}
function textSprite(text: string, color = '#fff', bg = 'rgba(0,0,0,0.55)', w = 1.8) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d')!; g.fillStyle = bg; g.beginPath(); g.roundRect(4, 14, 248, 68, 34); g.fill();
  g.font = '900 52px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(w, w * 0.375, 1);
  return s;
}
const disposeSprite = (s: THREE.Sprite) => { s.material.map?.dispose(); s.material.dispose(); };

export function createStreet(o: StreetOpts): StreetScene {
  const mobile = /Mobi|Android/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: !mobile, alpha: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !mobile;
  const scene = new THREE.Scene();
  const R = rng(o.seed);
  const disposables: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { disposables.push(x); return x; };
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
  const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(T(new THREE.BoxGeometry(w, h, d)), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; return b; };
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12) => { const b = new THREE.Mesh(T(new THREE.CylinderGeometry(rt, rb, h, seg)), m); b.position.set(x, y, z); b.castShadow = true; return b; };

  // ---- sky by the time of day --------------------------------------------------------------------------
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  const day = Math.max(0, Math.min(1, Math.sin(((hour - 6) / 12) * Math.PI) * 1.4));
  const sky = new THREE.Color('#1A1F4A').lerp(new THREE.Color('#9AD8FF'), day);
  scene.background = sky; scene.fog = new THREE.Fog(sky, 45, 140);
  scene.add(new THREE.HemisphereLight('#ffffff', '#6B6B5A', 0.45 + 0.5 * day));
  const sun = new THREE.DirectionalLight(day > 0.15 ? '#FFF1D6' : '#AFC1FF', 0.5 + 1.4 * day);
  sun.position.set(-20, 30, 18); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 30, bottom: -30, far: 120 }); scene.add(sun);
  const night = day < 0.35;

  // ---- the street ----------------------------------------------------------------------------------------
  const LEN = ORDER.length * SPACING + 40;
  const ground = new THREE.Mesh(T(new THREE.PlaneGeometry(LEN + 60, 120)), mat('#7CC95A')); ground.rotation.x = -Math.PI / 2; ground.position.set(LEN / 2 - 20, 0, -20); ground.receiveShadow = true; scene.add(ground);
  const road = new THREE.Mesh(T(new THREE.PlaneGeometry(LEN + 60, 7)), mat('#3C4150')); road.rotation.x = -Math.PI / 2; road.position.set(LEN / 2 - 20, 0.02, 9); road.receiveShadow = true; scene.add(road);
  const walk = new THREE.Mesh(T(new THREE.BoxGeometry(LEN + 60, 0.2, 4)), mat('#D9D2C4')); walk.position.set(LEN / 2 - 20, 0.1, 4); walk.receiveShadow = true; scene.add(walk);
  const dashM = mat('#F5E9A8'); const dashG = T(new THREE.PlaneGeometry(1.6, 0.18));
  for (let x = -20; x < LEN + 30; x += 3.2) { const d = new THREE.Mesh(dashG, dashM); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.03, 9); scene.add(d); }
  // lamp posts and trees along the pavement
  const poleM = mat('#2E3340'), lampM = mat('#FFE9A8', { emissive: '#FFD36B', emissiveIntensity: night ? 1.2 : 0.1 });
  const leaf = mat('#3E9A44', { flatShading: true }), trunkM = mat('#7A5233');
  for (let i = -1; i < ORDER.length + 2; i++) {
    const x = i * SPACING + SPACING / 2;
    scene.add(cyl(0.08, 0.1, 4, poleM, x, 2, 5.6, 6)); scene.add(box(0.5, 0.25, 0.5, lampM, x, 4.05, 5.6));
    if (night) { const l = new THREE.PointLight('#FFD36B', 6, 9); l.position.set(x, 3.8, 5.6); scene.add(l); }
    const t = new THREE.Group(); t.add(cyl(0.18, 0.25, 1.8, trunkM, 0, 0.9, 0, 6)); const c = new THREE.Mesh(T(new THREE.IcosahedronGeometry(1.3, 0)), leaf); c.position.y = 2.6; c.castShadow = true; t.add(c);
    t.position.set(x + 2.6, 0, -9 - R() * 4); scene.add(t);
  }
  // a skyline far behind
  const skyM = mat('#8FA3C8', { flatShading: true }), winM = mat('#FFE7A0', { emissive: '#FFD36B', emissiveIntensity: night ? 0.9 : 0 });
  for (let i = 0; i < 26; i++) { const h = 8 + R() * 22; const b = box(4 + R() * 4, h, 4, skyM, -20 + i * ((LEN + 40) / 26), h / 2, -42 - R() * 8); b.castShadow = false; scene.add(b); if (night) for (let k = 0; k < 6; k++) if (R() < 0.6) scene.add(box(0.7, 0.7, 0.1, winM, b.position.x - 1.2 + (k % 3) * 1.2, h * (0.25 + Math.floor(k / 3) * 0.35), b.position.z + 2.05)); }

  // ---- buildings ---------------------------------------------------------------------------------------------
  const lots = new Map<string, { g: THREE.Group; level: number; label: THREE.Sprite | null; owned: number; pop: number }>();
  const anim: ((t: number) => void)[] = [];
  const awning = (w: number, d: number, a: string, b: string, y: number, z: number) => {
    const g = new THREE.Group(); const n = 7; const ma = mat(a), mb = mat(b);
    for (let i = 0; i < n; i++) { const s = box(w / n, 0.12, d, i % 2 ? ma : mb, -w / 2 + (i + 0.5) * (w / n), y, z); s.rotation.x = 0.35; g.add(s); }
    return g;
  };
  const windows = (g: THREE.Group, w: number, h: number, z: number, floors: number, y0 = 1.2, color = '#BEE3FF') => {
    const wm = mat(color, { emissive: night ? '#FFD36B' : '#000000', emissiveIntensity: night ? 0.7 : 0, roughness: 0.2 });
    const cols = Math.max(2, Math.floor(w / 1.3));
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) g.add(box(0.7, 0.8, 0.06, wm, -w / 2 + (c + 0.5) * (w / cols), y0 + f * (h / floors), z));
  };
  const make = (key: string, level: number) => {
    const g = new THREE.Group();
    const L = 1 + level * 0.12;
    switch (key) {
      case 'lemonade': {
        const wood = mat('#E2B46B'), yellow = mat('#FFE14D');
        g.add(box(3.2, 1.1, 1.4, wood, 0, 0.55, 0)); g.add(box(3.3, 0.12, 1.5, yellow, 0, 1.16, 0));
        for (const x of [-1.5, 1.5]) g.add(box(0.14, 2.6, 0.14, wood, x, 1.3, -0.6));
        g.add(awning(3.6, 1.6, '#FFE14D', '#FFFFFF', 2.75, 0));
        const jug = cyl(0.32, 0.36, 0.8, mat('#FFF59D', { transparent: true, opacity: 0.85, roughness: 0.1 }), -0.7, 1.62, 0.2); g.add(jug);
        for (let i = 0; i < 3; i++) g.add(cyl(0.12, 0.1, 0.32, mat('#FFFFFF'), 0.3 + i * 0.35, 1.38, 0.3, 8));
        const sign = emojiSprite('🍋', 1.3); sign.position.set(0, 3.7, 0.4); g.add(sign);
        const kid = emojiSprite('🧒', 1.5); kid.position.set(0.1, 1.85, -0.9); g.add(kid);
        break;
      }
      case 'cookies': {
        g.add(box(2.6, 1.1, 1.5, mat('#C27C4E'), 0, 0.9, 0));
        for (const x of [-0.9, 0.9]) { const w = cyl(0.42, 0.42, 0.2, mat('#2A2E38'), x, 0.42, 0.8, 14); w.rotation.x = Math.PI / 2; g.add(w); }
        g.add(cyl(0.05, 0.05, 2.6, mat('#ddd'), 0, 2.4, 0, 6));
        const um = new THREE.Mesh(T(new THREE.ConeGeometry(2, 0.8, 10)), mat('#FF6FA8')); um.position.y = 3.8; g.add(um);
        const s = emojiSprite('🍪', 1.2); s.position.set(0, 1.9, 0.9); g.add(s);
        break;
      }
      case 'food_truck': {
        const body = mat('#FF8A3D');
        g.add(box(4.6, 2.4, 2.2, body, 0, 1.6, 0)); g.add(box(1.4, 1.6, 2.1, body, 2.9, 1.2, 0));
        g.add(box(1.2, 0.8, 2.15, mat('#9FE3FF', { roughness: 0.1 }), 3.0, 1.6, 0));
        g.add(box(2.6, 1.0, 0.1, mat('#2A2E38'), -0.3, 1.9, 1.11));
        for (const x of [-1.5, 1.5, 3]) for (const z of [-1.05, 1.05]) { const w = cyl(0.45, 0.45, 0.3, mat('#2A2E38'), x, 0.45, z, 14); w.rotation.x = Math.PI / 2; g.add(w); }
        const s = emojiSprite('🌮', 1.2); s.position.set(-0.3, 3.4, 0.5); g.add(s);
        break;
      }
      case 'coffee': {
        g.add(box(5, 3.6 * L, 4, mat('#F2E6D0'), 0, 1.8 * L, -0.5)); g.add(box(5.2, 0.4, 4.2, mat('#5B3A29'), 0, 3.6 * L + 0.2, -0.5));
        g.add(awning(5, 1.4, '#6B3F27', '#F2E6D0', 2.5, 1.9));
        windows(g, 4, 2.4, 1.52, 1, 1.4);
        const s = emojiSprite('☕', 1.4); s.position.set(0, 3.6 * L + 1.2, 1); g.add(s);
        break;
      }
      case 'bookstore': {
        const f = 2 + Math.min(2, Math.floor(level / 2));
        g.add(box(5.4, f * 2.2, 4.4, mat('#2E7D5B'), 0, f * 1.1, -0.6)); g.add(box(5.6, 0.4, 4.6, mat('#1E5A40'), 0, f * 2.2 + 0.2, -0.6));
        windows(g, 4.4, f * 2.2, 1.62, f, 1.2, '#FFF3C4');
        g.add(awning(5.4, 1.2, '#1E5A40', '#F5EEDC', 2.4, 2.1));
        const s = emojiSprite('📚', 1.4); s.position.set(0, f * 2.2 + 1.2, 1); g.add(s);
        break;
      }
      case 'arcade': {
        const neonA = mat('#FF4DD8', { emissive: '#FF4DD8', emissiveIntensity: 1.4 }), neonB = mat('#34C3FF', { emissive: '#34C3FF', emissiveIntensity: 1.4 });
        g.add(box(6, 4.2 * L, 4.6, mat('#2A1F4A'), 0, 2.1 * L, -0.6));
        g.add(box(6.1, 0.18, 0.2, neonA, 0, 4.2 * L - 0.3, 1.7)); g.add(box(6.1, 0.18, 0.2, neonB, 0, 0.5, 1.7));
        g.add(box(0.18, 4.2 * L, 0.2, neonA, -3, 2.1 * L, 1.7)); g.add(box(0.18, 4.2 * L, 0.2, neonB, 3, 2.1 * L, 1.7));
        const sign = emojiSprite('🕹️', 1.6); sign.position.set(0, 4.2 * L + 1.2, 1); g.add(sign);
        anim.push((t) => { neonA.emissiveIntensity = 1 + Math.sin(t * 6) * 0.6; neonB.emissiveIntensity = 1 + Math.cos(t * 5) * 0.6; });
        break;
      }
      case 'hotel': {
        const f = 5 + Math.min(5, level);
        g.add(box(6, f * 2, 5, mat('#E8DCC6'), 0, f, -1)); windows(g, 5, f * 2, 1.52, f, 1.2);
        g.add(box(6.4, 0.5, 5.4, mat('#B08B57'), 0, f * 2 + 0.25, -1));
        g.add(box(2.2, 2.6, 0.3, mat('#B08B57'), 0, 1.3, 1.6));
        const s = emojiSprite('🏨', 1.6); s.position.set(0, f * 2 + 1.4, 0); g.add(s);
        break;
      }
      case 'tech': {
        const f = 7 + Math.min(8, level * 2);
        const glass = mat('#5FB8FF', { roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.88, emissive: '#1D5FA8', emissiveIntensity: night ? 0.6 : 0.15 });
        g.add(box(5.4, f * 2, 5, glass, 0, f, -1));
        for (let i = 1; i < f; i++) g.add(box(5.5, 0.08, 5.1, mat('#DDEBFF'), 0, i * 2, -1));
        g.add(cyl(0.05, 0.05, 3, mat('#ddd'), 1.5, f * 2 + 1.5, -1, 6));
        const s = emojiSprite('💻', 1.7); s.position.set(0, f * 2 + 1.3, 0); g.add(s);
        break;
      }
      case 'bank': {
        const stone = mat('#ECE6DA');
        g.add(box(7, 0.6, 5.4, stone, 0, 0.3, -0.6)); g.add(box(6.2, 4.8 * L, 4.2, stone, 0, 0.6 + 2.4 * L, -1.2));
        for (let i = 0; i < 6; i++) g.add(cyl(0.28, 0.32, 4.2 * L, stone, -2.75 + i * 1.1, 0.6 + 2.1 * L, 1.4, 12));
        const ped = new THREE.Mesh(T(new THREE.CylinderGeometry(0.01, 4.1, 1.6, 3, 1)), stone); ped.rotation.z = Math.PI / 2; ped.rotation.y = Math.PI / 2; ped.scale.set(1, 1, 0.5); ped.position.set(0, 0.6 + 4.8 * L + 0.4, 1.2); g.add(ped);
        g.add(box(6.8, 0.4, 0.8, stone, 0, 0.6 + 4.2 * L + 0.2, 1.4));
        const s = emojiSprite('🏦', 1.6); s.position.set(0, 0.6 + 4.8 * L + 1.9, 1); g.add(s);
        break;
      }
      case 'space': {
        g.add(cyl(3.2, 3.6, 0.6, mat('#7C8496'), 0, 0.3, -1, 20));
        g.add(box(0.6, 12, 0.6, mat('#C8352C'), -2.2, 6, -1));
        for (let i = 1; i < 6; i++) g.add(box(1.8, 0.15, 0.2, mat('#C8352C'), -1.3, i * 2, -1));
        const rocket = new THREE.Group();
        rocket.add(cyl(0.9, 0.9, 7, mat('#F5F5F5', { metalness: 0.3 }), 0, 4.1, 0, 18));
        const nose = new THREE.Mesh(T(new THREE.ConeGeometry(0.9, 2, 18)), mat('#E8433A')); nose.position.y = 8.6; rocket.add(nose);
        for (let i = 0; i < 3; i++) { const fin = box(0.15, 1.6, 1.2, mat('#E8433A'), Math.cos((i / 3) * Math.PI * 2) * 0.9, 1.4, Math.sin((i / 3) * Math.PI * 2) * 0.9); fin.rotation.y = -(i / 3) * Math.PI * 2; rocket.add(fin); }
        rocket.add(box(0.7, 0.7, 0.1, mat('#9FE3FF', { roughness: 0.1 }), 0, 6.2, 0.9));
        rocket.position.set(0.6, 0.6, -1); g.add(rocket);
        const flame = emojiSprite('🔥', 1.6); flame.position.set(0.6, 0.6, -1); g.add(flame);
        anim.push((t) => { flame.scale.setScalar(1.2 + Math.sin(t * 20) * 0.3); rocket.position.y = 0.6 + Math.max(0, Math.sin(t * 0.25)) ** 8 * 2; });
        break;
      }
    }
    g.traverse((m) => { if ((m as THREE.Mesh).isMesh) { (m as THREE.Mesh).castShadow = true; } });
    return g;
  };
  const levelOf = (n: number) => (n >= 200 ? 5 : n >= 100 ? 4 : n >= 50 ? 3 : n >= 25 ? 2 : n >= 10 ? 1 : 0);
  const xOf = (key: string) => ORDER.indexOf(key) * SPACING;

  // ---- customers on the pavement ----------------------------------------------------------------------------
  const PEOPLE = ['🧑', '👩', '👨', '🧒', '👵', '🧔', '👩‍🦰', '🧑‍🦱', '👨‍🦳', '👩‍💼', '🧑‍🎤', '🕺', '💃', '🧑‍🍳', '🐕'];
  type Walker = { s: THREE.Sprite; v: number; stop: number };
  const walkers: Walker[] = [];
  const setCrowd = (n: number) => {
    while (walkers.length < n) { const s = emojiSprite(PEOPLE[Math.floor(R() * PEOPLE.length)], 1.4); s.center.set(0.5, 0.05); s.position.set(-10 + R() * (ORDER.length * SPACING + 10), 0.2, 3 + R() * 2.4); scene.add(s); walkers.push({ s, v: (R() < 0.5 ? -1 : 1) * (1 + R() * 1.2), stop: 0 }); }
    while (walkers.length > n) { const w = walkers.pop()!; scene.remove(w.s); disposeSprite(w.s); }
  };
  // coins popping out of businesses
  type Pop = { s: THREE.Sprite; life: number; v: THREE.Vector3 };
  const pops: Pop[] = [];
  const pop = (x: number, y: number, z: number, e = '💵', size = 0.9) => { const s = emojiSprite(e, size); s.position.set(x, y, z); scene.add(s); pops.push({ s, life: 1.2, v: new THREE.Vector3((R() - 0.5) * 1.5, 3 + R() * 2, (R() - 0.5) * 0.6) }); };

  // ---- camera: look along the street (drag), it follows your newest business -----------------------------
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  let camX = 0, camXTo = 0, maxX = 0, follow = true;
  let drag: { x: number; cx: number } | null = null;
  const pd = (e: PointerEvent) => { drag = { x: e.clientX, cx: camXTo }; follow = false; o.canvas.setPointerCapture(e.pointerId); };
  const pm = (e: PointerEvent) => { if (!drag) return; const w = o.canvas.clientWidth || 1; camXTo = Math.max(-4, Math.min(maxX + 4, drag.cx - ((e.clientX - drag.x) / w) * 30)); };
  const pu = () => { drag = null; };
  o.canvas.addEventListener('pointerdown', pd); o.canvas.addEventListener('pointermove', pm); o.canvas.addEventListener('pointerup', pu); o.canvas.addEventListener('pointercancel', pu);
  const resize = () => { const r = o.canvas.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = Math.max(1, r.width) / Math.max(1, r.height); camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();

  // the stand is always there (it's where you tap)
  let ventures: Record<string, number> = {}; let income = 0;
  const place = (key: string, owned: number) => {
    const cur = lots.get(key);
    const level = key === 'lemonade' ? Math.min(5, levelOf(owned)) : levelOf(owned);
    if (cur && cur.level === level && cur.owned === owned) return;
    if (cur && cur.level !== level) { scene.remove(cur.g); lots.delete(key); }
    let lot = lots.get(key);
    if (!lot) {
      const g = make(key, level); g.position.set(xOf(key), 0, -1); scene.add(g);
      lot = { g, level, label: null, owned: -1, pop: R() * 2 }; lots.set(key, lot);
      if (cur || owned > 0) { for (let i = 0; i < 8; i++) pop(xOf(key) + (R() - 0.5) * 3, 2, 1, '✨', 1); }
    }
    if (lot.owned !== owned) {
      if (lot.label) { lot.g.remove(lot.label); disposeSprite(lot.label); }
      lot.label = owned > 0 ? textSprite(`×${owned}`, '#FFE14D') : null;
      if (lot.label) { lot.label.position.set(2.6, 0.9, 2.2); lot.g.add(lot.label); }
      lot.owned = owned;
    }
  };
  place('lemonade', 0);
  let standBounce = 0, frenzy = false;

  let raf = 0, last = performance.now(), t = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (follow) camXTo = Math.min(maxX, Math.max(0, maxX - SPACING * 0.5));
    camX += (camXTo - camX) * Math.min(1, dt * 3);
    const portrait = camera.aspect < 1;
    camera.position.set(camX + (portrait ? 0 : 4), portrait ? 9 : 7, portrait ? 25 : 20); camera.lookAt(camX + (portrait ? 0 : 4), 3, 0);
    for (const f of anim) f(t);
    // the stand bounces when you tap
    const stand = lots.get('lemonade');
    if (stand) { standBounce = Math.max(0, standBounce - dt * 6); const k = o.reduceMotion ? 0 : Math.sin(standBounce * Math.PI) * 0.08; stand.g.scale.set(1 + k, 1 - k, 1 + k); }
    // businesses pay out now and then (faster when they're bigger)
    for (const [key, lot] of lots) {
      if (lot.owned <= 0 || o.reduceMotion) continue;
      lot.pop -= dt * (frenzy ? 3 : 1);
      if (lot.pop <= 0) { lot.pop = Math.max(0.5, 3 - Math.log10(lot.owned + 1)); pop(xOf(key) + (R() - 0.5) * 2, 3 + R() * 2, 1, frenzy ? '🤑' : R() < 0.15 ? '🪙' : '💵'); }
    }
    for (const w of walkers) {
      if (w.stop > 0) { w.stop -= dt; continue; }
      w.s.position.x += w.v * dt;
      if (!o.reduceMotion) w.s.position.y = 0.2 + Math.abs(Math.sin(t * 8 + w.s.position.z * 3)) * 0.12;
      if (w.s.position.x > maxX + 14) w.s.position.x = -12; if (w.s.position.x < -12) w.s.position.x = maxX + 14;
      // pop into a shop sometimes
      if (R() < dt * 0.06) { w.stop = 1 + R() * 2.5; }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= dt; p.s.position.addScaledVector(p.v, dt); p.v.y -= 6 * dt; p.s.material.opacity = Math.min(1, p.life * 2);
      if (p.life <= 0) { scene.remove(p.s); disposeSprite(p.s); pops.splice(i, 1); }
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setVentures(v, inc) {
      ventures = v; income = inc;
      for (const key of ORDER) { const n = ventures[key] ?? 0; if (key === 'lemonade' || n > 0) place(key, n); else if (lots.has(key)) { scene.remove(lots.get(key)!.g); lots.delete(key); } }
      maxX = Math.max(0, ...ORDER.filter((k) => (ventures[k] ?? 0) > 0).map(xOf));
      setCrowd(Math.min(mobile ? 12 : 20, 3 + Math.floor(Math.log10(income + 1) * 2)));
    },
    tap() { standBounce = 1; if (!o.reduceMotion && R() < 0.6) pop((R() - 0.5) * 2, 2.2, 0.5, R() < 0.5 ? '🍋' : '💵', 0.8); },
    setFrenzy(on) { frenzy = on; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); o.canvas.removeEventListener('pointermove', pm); o.canvas.removeEventListener('pointerup', pu); o.canvas.removeEventListener('pointercancel', pu);
      scene.traverse((m) => { if ((m as THREE.Sprite).isSprite) disposeSprite(m as THREE.Sprite); });
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
