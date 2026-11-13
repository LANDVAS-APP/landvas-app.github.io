// The Inventor's Workshop in 3D: a brick workshop with big windows, workbenches, shelves of gadgets, a wall of
// turning gears, steam pipes and a Tesla coil that crackles. On the floor, your factory: belts that really run,
// magnets humming, presses stamping, coilers spinning, spools winding, printers blinking, a reactor glowing, and
// crates that fill up. Parts ride the belts from machine to machine as the layout makes them. Tap the floor to
// build. Status lights: green working, red waiting for parts, orange spilling off the end.
import * as THREE from 'three';
import { adaptiveDpr, framePacer, isPhone, sceneAntialias, sceneDpr } from '../../lib/gfx';
import { DX, DY, next, parse, type FactoryCfg, type Grid, type Solve } from './factoryCore';

export type FactoryOpts = { canvas: HTMLCanvasElement; cfg: FactoryCfg; emojis: Record<string, string>; reduceMotion?: boolean; onTapCell?(k: string): void };
const VIS = 3; // parts shown riding the belts: this many times the real rate (so you can see them move)

export function createFactory3D(o: FactoryOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const fps = framePacer({ ambient: true });
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d), undefined, fps);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2A2230');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...p }));
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; d(cv.getContext('2d')!); const t = T(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const emojiTex = (e: string, s = 96) => tex(s, s, (g) => { g.font = `${s * 0.78}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, s / 2, s * 0.56); });
  const sprite = (t: THREE.Texture, w: number, h: number, add = false) => { const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }))); s.scale.set(w, h, 1); return s; };
  const glowTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

  // ---- light ----------------------------------------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight('#FFF3E0', '#4A3A40', 1.3));
  const sun = new THREE.DirectionalLight('#FFE0B0', 2.2); sun.position.set(-6, 14, 8); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  const lamps: THREE.PointLight[] = [];

  // ---- the room (built for the biggest floor, the floor grid shows only your size) -------------------------------------
  const room = new THREE.Group(); scene.add(room);
  const concrete = tex(256, 256, (g) => { g.fillStyle = '#8D8A86'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2500; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } });
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping; concrete.repeat.set(5, 5);
  const brick = tex(256, 256, (g) => { g.fillStyle = '#7A3E2C'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 24) for (let x = (y / 24) % 2 ? -24 : 0; x < 256; x += 48) { g.fillStyle = `hsl(${10 + Math.random() * 10}, ${40 + Math.random() * 15}%, ${32 + Math.random() * 10}%)`; g.fillRect(x + 2, y + 2, 44, 20); } });
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping; brick.repeat.set(4, 2);
  const floor = new THREE.Mesh(T(new THREE.PlaneGeometry(30, 30)), std('#ffffff', { map: concrete, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; room.add(floor);
  const wallM = std('#ffffff', { map: brick, roughness: 0.95 });
  const back = new THREE.Mesh(T(new THREE.BoxGeometry(30, 7, 0.4)), wallM); back.position.set(0, 3.5, -8); back.receiveShadow = true; room.add(back);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(T(new THREE.BoxGeometry(0.4, 7, 30)), wallM); w.position.set(s * 8.5, 3.5, 0); w.receiveShadow = true; room.add(w); }
  // windows with daylight
  const winM = std('#BFE6FF', { emissive: '#9FD6FF', emissiveIntensity: 0.8 }), frameM = std('#3A3440');
  for (const x of [-4.5, 0, 4.5]) { const w = new THREE.Mesh(T(new THREE.PlaneGeometry(2.6, 2.4)), winM); w.position.set(x, 4, -7.79); room.add(w); for (const [dx, dy, ww, hh] of [[0, 1.25, 2.8, 0.15], [0, -1.25, 2.8, 0.15], [-1.35, 0, 0.15, 2.6], [1.35, 0, 0.15, 2.6], [0, 0, 0.1, 2.5], [0, 0, 2.6, 0.1]]) { const f = new THREE.Mesh(T(new THREE.BoxGeometry(ww, hh, 0.12)), frameM); f.position.set(x + dx, 4 + dy, -7.75); room.add(f); } }
  // wall of turning gears
  const gearM = std('#C9A04A', { metalness: 0.8, roughness: 0.35 }), ironM = std('#5A5A66', { metalness: 0.7, roughness: 0.4 });
  const gears: { m: THREE.Mesh; s: number }[] = [];
  const gearGeo = (r: number) => { const sh = new THREE.Shape(); const teeth = Math.round(r * 10); for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 0.82; if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.25, 0, Math.PI * 2, true); sh.holes.push(hole); return T(new THREE.ExtrudeGeometry(sh, { depth: 0.15, bevelEnabled: false })); };
  for (const [x, y, r, s] of [[-7, 5.5, 0.9, 1], [-5.5, 4.6, 0.6, -1.5], [-6.4, 3.3, 0.5, 1.8], [6.6, 5.4, 1, -0.9], [5.2, 4.3, 0.55, 1.6]] as const) { const m = new THREE.Mesh(gearGeo(r), x < 0 ? gearM : ironM); m.position.set(x, y, -7.75); m.castShadow = true; room.add(m); gears.push({ m, s }); }
  // pipes
  const pipeM = std('#B87333', { metalness: 0.8, roughness: 0.3 });
  for (const y of [6.3, 6.6]) { const p = new THREE.Mesh(T(new THREE.CylinderGeometry(0.12, 0.12, 30, 10)), pipeM); p.rotation.z = Math.PI / 2; p.position.set(0, y, -7.6); room.add(p); }
  const steam: THREE.Sprite[] = []; const steamTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(240,240,240,0.7)'); gr.addColorStop(1, 'rgba(240,240,240,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  for (let i = 0; i < 4; i++) { const s = sprite(steamTex, 0.6, 0.6); scene.add(s); steam.push(s); }
  // workbenches and shelves along the walls
  const wood = std('#8A5A33'), woodD = std('#5B3A20');
  for (const s of [-1, 1]) {
    const bench = new THREE.Group(); bench.position.set(s * 7.7, 0, -2); room.add(bench);
    const top = new THREE.Mesh(T(new THREE.BoxGeometry(1.2, 0.12, 4)), wood); top.position.y = 1; top.castShadow = true; bench.add(top);
    for (const z of [-1.8, 1.8]) for (const x of [-0.5, 0.5]) { const l = new THREE.Mesh(T(new THREE.BoxGeometry(0.1, 1, 0.1)), woodD); l.position.set(x, 0.5, z); bench.add(l); }
    ['🔧', '🔩', '🪛', '💡', '🧰'].forEach((e, i) => { const sp = sprite(emojiTex(e, 64), 0.5, 0.5); sp.position.set(0, 1.3, -1.6 + i * 0.8); bench.add(sp); });
    const shelf = new THREE.Mesh(T(new THREE.BoxGeometry(0.5, 0.08, 3)), wood); shelf.position.set(s * 8.1, 3, 3); room.add(shelf);
    ['🤖', '🚀', '🐭', '⏰'].forEach((e, i) => { const sp = sprite(emojiTex(e, 64), 0.55, 0.55); sp.position.set(s * 8.05, 3.35, 1.8 + i * 0.8); room.add(sp); });
  }
  // the Tesla coil
  const tesla = new THREE.Group(); tesla.position.set(-6.8, 0, -6.8); room.add(tesla);
  { const b = new THREE.Mesh(T(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 12)), ironM); b.position.y = 0.2; tesla.add(b); const col = new THREE.Mesh(T(new THREE.CylinderGeometry(0.18, 0.22, 2.6, 12)), pipeM); col.position.y = 1.7; tesla.add(col); const tor = new THREE.Mesh(T(new THREE.TorusGeometry(0.5, 0.18, 10, 24)), std('#D9D6CF', { metalness: 0.9, roughness: 0.2 })); tor.rotation.x = Math.PI / 2; tor.position.y = 3.1; tesla.add(tor); }
  const bolt = sprite(emojiTex('⚡', 96), 1.2, 1.2, true); bolt.position.set(-6.8, 3.6, -6.8); scene.add(bolt);
  const boltLight = new THREE.PointLight('#9FD6FF', 0, 8, 1.5); boltLight.position.set(-6.8, 3.4, -6.8); scene.add(boltLight);
  // hanging lamps
  for (const x of [-3, 3]) { const cord = new THREE.Mesh(T(new THREE.CylinderGeometry(0.02, 0.02, 2, 4)), ironM); cord.position.set(x, 6, 0); room.add(cord); const shade = new THREE.Mesh(T(new THREE.ConeGeometry(0.5, 0.4, 12, 1, true)), std('#2E5E4E', { side: THREE.DoubleSide })); shade.position.set(x, 4.95, 0); room.add(shade); const bulb = sprite(glowTex, 0.9, 0.9, true); (bulb.material as THREE.SpriteMaterial).color.set('#FFE2A0'); bulb.position.set(x, 4.75, 0); scene.add(bulb); const l = new THREE.PointLight('#FFD9A0', 5, 10, 1.4); l.position.set(x, 4.6, 0); scene.add(l); lamps.push(l); }

  // ---- the floor grid -------------------------------------------------------------------------------------------------
  let size = 6; const grid = new THREE.Group(); scene.add(grid);
  const tileM = std('#6E6A72', { roughness: 0.9 }), tileM2 = std('#76727A', { roughness: 0.9 });
  const cellPos = (k: string) => { const [x, y] = parse(k); return new THREE.Vector3(x - size / 2 + 0.5, 0, y - size / 2 + 0.5); };
  const buildGrid = () => {
    grid.clear();
    const plate = new THREE.Mesh(T(new THREE.BoxGeometry(size + 0.4, 0.1, size + 0.4)), std('#3A3640')); plate.position.y = 0.02; plate.receiveShadow = true; grid.add(plate);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const t = new THREE.Mesh(T(new THREE.BoxGeometry(0.96, 0.04, 0.96)), (x + y) % 2 ? tileM : tileM2); t.position.set(x - size / 2 + 0.5, 0.09, y - size / 2 + 0.5); t.receiveShadow = true; t.userData.cell = `${x},${y}`; grid.add(t); }
    const yel = std('#FFD23F'); for (const s of [-1, 1]) { const st = new THREE.Mesh(T(new THREE.BoxGeometry(size + 0.4, 0.03, 0.12)), yel); st.position.set(0, 0.08, s * (size / 2 + 0.2)); grid.add(st); const st2 = new THREE.Mesh(T(new THREE.BoxGeometry(0.12, 0.03, size + 0.4)), yel); st2.position.set(s * (size / 2 + 0.2), 0.08, 0); grid.add(st2); }
  };
  buildGrid();

  // ---- pieces ---------------------------------------------------------------------------------------------------------
  const beltTex = tex(64, 64, (g) => { g.fillStyle = '#2A2A30'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3E3E48'; for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 6); g.fillStyle = '#FFD23F'; g.beginPath(); g.moveTo(22, 40); g.lineTo(32, 24); g.lineTo(42, 40); g.fill(); });
  beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
  type Placed = { k: string; t: string; d: number; g: THREE.Group; light: THREE.Mesh | null; anim?: (t: number, dt: number, on: boolean) => void; beltMat?: THREE.MeshStandardMaterial };
  const placed = new Map<string, Placed>();
  const statusM = { ok: std('#3DDC97', { emissive: '#3DDC97', emissiveIntensity: 1.2 }), starved: std('#FF4D6D', { emissive: '#FF4D6D', emissiveIntensity: 1.2 }), spilling: std('#FF9F1C', { emissive: '#FF9F1C', emissiveIntensity: 1.2 }) };
  const make = (t: string): { g: THREE.Group; light: THREE.Mesh | null; anim?: Placed['anim']; beltMat?: THREE.MeshStandardMaterial } => {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(T(geo), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
    const lightAt = (x: number, y: number, z: number) => { const l = new THREE.Mesh(T(new THREE.SphereGeometry(0.06, 8, 6)), statusM.ok); l.position.set(x, y, z); g.add(l); return l; };
    const arrowOut = () => { const a = add(new THREE.ConeGeometry(0.08, 0.18, 4), std('#FFD23F'), 0, 0.2, -0.45); a.rotation.x = -Math.PI / 2; };
    if (t === 'belt') {
      const mat = T(new THREE.MeshStandardMaterial({ map: beltTex.clone(), roughness: 0.6 })); T(mat.map!); mat.map!.wrapS = mat.map!.wrapT = THREE.RepeatWrapping;
      add(new THREE.BoxGeometry(0.9, 0.12, 1), mat, 0, 0.16, 0);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.14, 1), std('#FFD23F'), s * 0.47, 0.2, 0);
      return { g, light: null, beltMat: mat };
    }
    if (t === 'magnet') {
      add(new THREE.BoxGeometry(0.8, 0.2, 0.8), ironM, 0, 0.18, 0);
      const mag = new THREE.Group(); mag.position.y = 0.6; g.add(mag);
      const hs = new THREE.Mesh(T(new THREE.TorusGeometry(0.25, 0.09, 8, 16, Math.PI)), std('#D83A3A')); hs.rotation.z = Math.PI; hs.castShadow = true; mag.add(hs);
      for (const s of [-1, 1]) { const tip = new THREE.Mesh(T(new THREE.BoxGeometry(0.18, 0.14, 0.18)), std('#D9D6CF', { metalness: 0.8 })); tip.position.set(s * 0.25, -0.05, 0); mag.add(tip); }
      arrowOut();
      return { g, light: lightAt(0.3, 0.32, 0.3), anim: (tt, _dt, on) => { mag.rotation.y = tt * (on ? 1.5 : 0.3); mag.position.y = 0.6 + Math.sin(tt * 3) * 0.04; } };
    }
    if (t === 'dock') {
      const crate = std('#B07A42');
      add(new THREE.BoxGeometry(0.8, 0.08, 0.8), crate, 0, 0.16, 0);
      for (const [x, z, w, d] of [[0, -0.36, 0.8, 0.08], [0, 0.36, 0.8, 0.08], [-0.36, 0, 0.08, 0.8], [0.36, 0, 0.08, 0.8]]) add(new THREE.BoxGeometry(w, 0.5, d), crate, x, 0.42, z);
      const pile: THREE.Mesh[] = []; for (let i = 0; i < 6; i++) { const p = add(new THREE.DodecahedronGeometry(0.1), std(['#C9A04A', '#8A8A96', '#B87333'][i % 3], { metalness: 0.6 }), -0.2 + (i % 3) * 0.2, 0.3 + Math.floor(i / 3) * 0.12, -0.1 + (i % 2) * 0.2); p.visible = false; pile.push(p); }
      return { g, light: null, anim: (_tt, _dt, on) => { pile.forEach((p, i) => { p.visible = on && i < 6; }); } };
    }
    // machines: a coloured body, something moving, a status light
    const body = (col: string) => add(new THREE.BoxGeometry(0.82, 0.55, 0.82), std(col, { metalness: 0.3, roughness: 0.5 }), 0, 0.42, 0);
    if (t === 'press') {
      body('#4E6A8A'); add(new THREE.BoxGeometry(0.1, 0.6, 0.1), ironM, -0.3, 0.95, 0); add(new THREE.BoxGeometry(0.1, 0.6, 0.1), ironM, 0.3, 0.95, 0); add(new THREE.BoxGeometry(0.72, 0.1, 0.3), ironM, 0, 1.25, 0);
      const ram = add(new THREE.BoxGeometry(0.4, 0.2, 0.25), std('#C9A04A', { metalness: 0.8 }), 0, 0.95, 0);
      arrowOut();
      return { g, light: lightAt(0.33, 0.6, 0.42), anim: (tt, _dt, on) => { ram.position.y = on ? 0.82 + Math.abs(Math.sin(tt * 4)) * 0.3 : 1.1; } };
    }
    if (t === 'coiler') {
      body('#3E7A5E'); const coil = add(new THREE.TorusKnotGeometry(0.16, 0.04, 48, 6, 2, 7), std('#D9D6CF', { metalness: 0.9, roughness: 0.2 }), 0, 0.95, 0);
      arrowOut();
      return { g, light: lightAt(0.33, 0.6, 0.42), anim: (_tt, dt, on) => { coil.rotation.y += dt * (on ? 6 : 0.5); } };
    }
    if (t === 'spool') {
      body('#8A4E3A'); const sp = add(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 16), std('#B87333', { metalness: 0.7, roughness: 0.3 }), 0, 0.95, 0); sp.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) { const f = add(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), wood, s * 0.22, 0.95, 0); f.rotation.z = Math.PI / 2; }
      arrowOut();
      return { g, light: lightAt(0.33, 0.6, 0.42), anim: (_tt, dt, on) => { sp.rotation.x += dt * (on ? 4 : 0.3); } };
    }
    if (t === 'printer') {
      body('#3A3A4E'); const head = add(new THREE.BoxGeometry(0.15, 0.1, 0.15), std('#22E3FF', { emissive: '#22E3FF', emissiveIntensity: 0.8 }), 0, 0.76, 0);
      const leds: THREE.Mesh[] = []; for (let i = 0; i < 4; i++) leds.push(add(new THREE.SphereGeometry(0.035, 6, 5), std('#3DDC97', { emissive: '#3DDC97', emissiveIntensity: 1 }), -0.25 + i * 0.12, 0.6, 0.42));
      arrowOut();
      return { g, light: lightAt(0.33, 0.6, 0.42), anim: (tt, _dt, on) => { head.position.x = on ? Math.sin(tt * 5) * 0.28 : 0; leds.forEach((l, i) => { (l.material as THREE.MeshStandardMaterial).emissiveIntensity = on && Math.sin(tt * 8 + i) > 0 ? 1.4 : 0.2; }); } };
    }
    // reactor
    body('#2E2A44'); const core = add(new THREE.SphereGeometry(0.2, 16, 12), std('#7DF9FF', { emissive: '#22E3FF', emissiveIntensity: 2 }), 0, 1, 0);
    const rings = [0, 1].map((i) => { const r = add(new THREE.TorusGeometry(0.32, 0.025, 6, 32), std('#B57BFF', { emissive: '#8B5CFF', emissiveIntensity: 1.2 }), 0, 1, 0); r.rotation.x = i ? 1.2 : 0.3; return r; });
    const halo = sprite(glowTex, 1, 1, true); (halo.material as THREE.SpriteMaterial).color.set('#22E3FF'); halo.position.y = 1; g.add(halo);
    arrowOut();
    return { g, light: lightAt(0.33, 0.6, 0.42), anim: (tt, dt, on) => { rings.forEach((r, i) => { r.rotation.y += dt * (on ? 2.5 + i : 0.2); }); core.scale.setScalar(on ? 1 + Math.sin(tt * 6) * 0.08 : 0.8); halo.visible = on; } };
  };

  let cur: Grid = {}; let sol: Solve = { income: {}, cells: {} };
  const setFactory = (g: Grid, s: Solve, sz: number) => {
    if (sz !== size) { size = sz; buildGrid(); for (const p of placed.values()) grid.remove(p.g); placed.clear(); }
    cur = g; sol = s;
    for (const [k, p] of placed) if (!g[k] || g[k].t !== p.t) { grid.remove(p.g); placed.delete(k); }
    for (const [k, c] of Object.entries(g)) {
      let p = placed.get(k);
      if (!p) { const m = make(c.t); const pos = cellPos(k); m.g.position.set(pos.x, 0, pos.z); m.g.traverse((x) => { x.userData.cell = k; }); grid.add(m.g); p = { k, t: c.t, d: c.d, ...m }; placed.set(k, p); }
      p.d = c.d; p.g.rotation.y = -c.d * Math.PI / 2 + (c.t === 'belt' ? 0 : 0);
      // a piece faces "up" (-z) at d=0: rotate round y
      p.g.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][c.d];
      if (p.light) p.light.material = statusM[s.cells[k]?.status ?? 'ok'];
    }
  };

  // ---- parts riding the belts ------------------------------------------------------------------------------------------
  type Item = { s: THREE.Sprite; from: THREE.Vector3; to: THREE.Vector3; at: string; t: number; res: string; falling: number };
  const items: Item[] = []; const itemTex = new Map<string, THREE.Texture>();
  const timers = new Map<string, number>();
  const spawn = (k: string, res: string) => {
    if (items.length > (phone ? 90 : 160)) return;
    let tx = itemTex.get(res); if (!tx) { tx = emojiTex(o.emojis[res] ?? '✨', 64); itemTex.set(res, tx); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false })); s.scale.setScalar(0.32); grid.add(s);
    const from = cellPos(k), to = cellPos(next(k, cur[k].d)); from.y = to.y = 0.42;
    items.push({ s, from, to, at: next(k, cur[k].d), t: 0, res, falling: 0 });
  };

  // ---- input -----------------------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const pu = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { down = null; return; } down = null;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(grid.children, true)) if (h.object.userData.cell) { o.onTapCell?.(h.object.userData.cell); return; }
  };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointerup', pu);

  // ---- loop -------------------------------------------------------------------------------------------------------------
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, zapT = 2;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!fps.ready(performance.now())) return;
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || document.hidden) return;
    tune(dt); t += dt;
    // camera: fit the floor (tall screens go higher)
    const fit = (size + 1.2) / Math.min(1, camera.aspect) / 2 / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, fit * 0.86 + 1, fit * 0.62 + 1.2); camera.lookAt(0, 0, 0.3);
    if (!o.reduceMotion) {
      gears.forEach((g) => { g.m.rotation.z += dt * g.s * 0.6; });
      steam.forEach((s, i) => { const k = (t * 0.3 + i / steam.length) % 1; s.position.set(-2 + i * 1.4, 6.6 + k * 1.5, -7.4); s.scale.setScalar(0.4 + k); (s.material as THREE.SpriteMaterial).opacity = 0.6 * (1 - k); });
      zapT -= dt; if (zapT < 0) { zapT = 1.5 + Math.random() * 3; }
      const zap = zapT < 0.2; bolt.visible = zap; boltLight.intensity = zap ? 8 : 0; bolt.material.rotation = Math.random() * 6;
    }
    for (const p of placed.values()) {
      const on = Object.keys(sol.cells[p.k]?.out ?? {}).length > 0 || (p.t === 'dock' && Object.keys(sol.income).length > 0);
      p.anim?.(t, dt, on);
      if (p.beltMat?.map) { const m = p.beltMat.map; m.offset.y = (m.offset.y - dt * (on ? 1.2 : 0.4)) % 1; }
      // sources and machines send parts out at their rate
      const out = sol.cells[p.k]?.out;
      if (out && p.t !== 'belt' && p.t !== 'dock') for (const [res, rate] of Object.entries(out)) {
        const id = `${p.k}|${res}`; const left = (timers.get(id) ?? Math.random()) - dt * (rate * VIS) / 60;
        if (left <= 0) { spawn(p.k, res); timers.set(id, 1); } else timers.set(id, left);
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.falling > 0) { it.falling += dt; it.s.position.y -= dt * 2; it.s.material.opacity = Math.max(0, 1 - it.falling * 2); if (it.falling > 0.6) { grid.remove(it.s); it.s.material.dispose(); items.splice(i, 1); } continue; }
      it.t += dt * 1.6;
      it.s.position.lerpVectors(it.from, it.to, Math.min(1, it.t)); it.s.position.y += Math.abs(Math.sin(it.t * Math.PI)) * 0.04;
      if (it.t >= 1) {
        const c = cur[it.at];
        if (c && o.cfg.pieces[c.t]?.kind === 'belt') { it.from.copy(it.to); const n = next(it.at, c.d); it.to = cellPos(n); it.to.y = 0.42; it.at = n; it.t = 0; }
        else if (c) { grid.remove(it.s); it.s.material.dispose(); items.splice(i, 1); }
        else it.falling = 0.01;
      }
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  void DX; void DY;

  return {
    setFactory,
    burst(k: string | null, emojis: string[]) { const p = k ? cellPos(k) : new THREE.Vector3(0, 0, 0); emojis.slice(0, 10).forEach((e, i) => { let tx = itemTex.get(`e:${e}`); if (!tx) { tx = emojiTex(e, 64); itemTex.set(`e:${e}`, tx); } const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false })); s.scale.setScalar(0.45); s.position.set(p.x + (i % 3 - 1) * 0.3, 0.6, p.z); grid.add(s); items.push({ s, from: s.position.clone(), to: s.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.4, 0)), at: '__pop', t: 0, res: e, falling: 0 }); }); },
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ pieces: placed.size, items: items.length, size }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointerup', pu);
      for (const it of items) it.s.material.dispose();
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
}
export type FactoryScene = ReturnType<typeof createFactory3D>;
