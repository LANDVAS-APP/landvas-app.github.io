// A Landlord estate in 3D: a little street of rental houses (one per Landlord plot, up to 12 shown), tenants
// strolling the pavements, today's broken things floating over the houses that need fixing, the mailbox where
// tenants leave requests, and the community garden. Drag to look along the street, pinch or scroll to zoom, tap a
// broken thing, the mailbox or the garden.
import * as THREE from 'three';
import { adaptiveDpr, framePacer, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';

export type EstateSpot = { idx: number; house: number; what: string; fixed: boolean };
export type EstateAction = { kind: 'repair'; idx: number } | { kind: 'mailbox' } | { kind: 'garden' };
export type EstateView = { houses: number; spots: EstateSpot[]; watered: boolean; requests: number; rentDay: boolean; eligible: boolean };

const WHAT_EMOJI: Record<string, string> = { roof: '🏚️', window: '🪟', door: '🚪', pipe: '🚰', light: '💡', fence: '🪵' };
const WALLS = ['#F4D9B5', '#C9E4F5', '#F5C9D2', '#D5F0C8', '#E9D9F7', '#FFF1B8', '#F7D2B0', '#CDE7E0'];
const ROOFS = ['#B8483A', '#4A5D8C', '#6B4F3A', '#3E7D5A', '#8A4FA0', '#C2762E'];

export function createEstate3D(canvas: HTMLCanvasElement, view: EstateView, onAction: (a: EstateAction) => void, reduceMotion = false) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const fps = framePacer({ ambient: true });
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d), undefined, fps);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const std = (c: string, p: THREE.MeshStandardMaterialParameters = {}) => { const k = c + JSON.stringify(p); let m = mats.get(k); if (!m) { m = T(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...p })); mats.set(k, m); } return m; };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => { const m = new THREE.Mesh(T(geo), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  const sky = view.rentDay ? '#FFE9B8' : '#BFE3FF';
  scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 28, 70);
  scene.add(new THREE.HemisphereLight('#ffffff', '#6E8F5A', 1.1));
  const sun = new THREE.DirectionalLight('#FFF2D6', 2.2); sun.position.set(10, 18, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 16, bottom: -16, near: 1, far: 60 }); sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ---- the street ----
  const shown = Math.max(1, Math.min(12, view.houses));
  const perSide = Math.ceil(shown / 2), gap = 3.6, len = Math.max(16, perSide * gap + 10);
  mesh(new THREE.PlaneGeometry(len + 40, 60), std('#7DBB5E'), 0, 0, 0).rotation.x = -Math.PI / 2;
  const road = mesh(new THREE.PlaneGeometry(len + 40, 3.2), std('#4B4F5C', { roughness: 0.95 }), 0, 0.01, 0); road.rotation.x = -Math.PI / 2;
  for (let x = -len / 2 - 18; x < len / 2 + 18; x += 2.4) { const d = mesh(new THREE.PlaneGeometry(1.1, 0.14), std('#F5F1E4'), x, 0.02, 0); d.rotation.x = -Math.PI / 2; d.castShadow = false; }
  for (const z of [-2.1, 2.1]) { const s = mesh(new THREE.BoxGeometry(len + 40, 0.12, 1), std('#D9D4C7'), 0, 0.06, z); s.castShadow = false; }

  // ---- the houses ----
  const houses: THREE.Group[] = [];
  const houseAt = (i: number) => { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2); return { x: (k - (perSide - 1) / 2) * gap, z: side * 5, side }; };
  for (let i = 0; i < shown; i++) {
    const { x, z, side } = houseAt(i);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = side > 0 ? Math.PI : 0; scene.add(g);
    const wall = std(WALLS[i % WALLS.length]), roof = std(ROOFS[(i * 7) % ROOFS.length]);
    const floors = 1 + (i % 3 === 0 ? 1 : 0);
    const h = 1.5 * floors;
    mesh(new THREE.BoxGeometry(2.4, h, 2.2), wall, 0, h / 2, 0, g);
    const r = mesh(new THREE.ConeGeometry(2.05, 1.2, 4), roof, 0, h + 0.6, 0, g); r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 0.9);
    mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), std('#8C5A44'), 0.7, h + 0.9, 0.3, g);
    mesh(new THREE.BoxGeometry(0.55, 0.95, 0.06), std('#6B3E2E'), 0, 0.48, 1.12, g);
    for (let f = 0; f < floors; f++) for (const wx of [-0.75, 0.75]) {
      if (f === 0 && Math.abs(wx) < 0.5) continue;
      mesh(new THREE.BoxGeometry(0.45, 0.45, 0.05), std('#BEE7FF', { emissive: '#FFE8A3', emissiveIntensity: view.rentDay ? 0.6 : 0.15 }), wx, 0.85 + f * 1.5, 1.12, g);
    }
    // a little front fence
    for (let fx = -1.3; fx <= 1.31; fx += 0.32) mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), std('#FFFFFF'), fx, 0.2, 1.75, g);
    mesh(new THREE.BoxGeometry(2.7, 0.05, 0.05), std('#FFFFFF'), 0, 0.33, 1.75, g);
    houses.push(g);
  }

  // ---- the mailbox and the garden ----
  const ends = (perSide / 2) * gap + 3;
  const mailbox = new THREE.Group(); mailbox.position.set(-ends, 0, 2.9); scene.add(mailbox);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), std('#5A5A5A'), 0, 0.5, 0, mailbox);
  mesh(new THREE.BoxGeometry(0.5, 0.36, 0.7), std('#2F6FDB'), 0, 1.15, 0, mailbox);
  const flag = mesh(new THREE.BoxGeometry(0.05, 0.3, 0.12), std('#FF3D3D'), 0.28, 1.3, 0.1, mailbox);
  const garden = new THREE.Group(); garden.position.set(ends, 0, -3.6); scene.add(garden);
  mesh(new THREE.BoxGeometry(3.2, 0.25, 2.2), std('#7A5233'), 0, 0.12, 0, garden);
  const flowers: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const fx = -1.3 + (i % 7) * 0.43, fz = -0.55 + Math.floor(i / 7) * 1.1;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), std('#3E8E3A'), fx, 0.5, fz, garden);
    flowers.push(mesh(new THREE.SphereGeometry(0.14, 10, 8), std(['#FF5C8A', '#FFD23F', '#B07CFF', '#FF8A3D'][i % 4]), fx, 0.78, fz, garden));
  }
  // a few trees down the street
  for (let i = 0; i < 6; i++) {
    const tx = (i - 2.5) * (len / 6), tz = i % 2 ? -9 : 9;
    mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), std('#6B4A2E'), tx, 0.6, tz);
    mesh(new THREE.SphereGeometry(0.9, 12, 10), std('#4FA350'), tx, 1.7, tz);
  }

  // ---- floating emoji (what broke, the mailbox, the garden) ----
  const emojiTex = (e: string) => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; g.font = '92px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const bubble = () => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(64, 60, 54, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(52, 108); g.lineTo(64, 126); g.lineTo(76, 108); g.fill(); g.strokeStyle = '#FF6A1F'; g.lineWidth = 8; g.beginPath(); g.arc(64, 60, 50, 0, Math.PI * 2); g.stroke(); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const bubbleTex = bubble();
  type Pin = { s: THREE.Group; action: EstateAction; base: number; phase: number; alive: boolean };
  const pins: Pin[] = [];
  const pin = (emoji: string, at: THREE.Vector3, action: EstateAction, size = 1) => {
    const g = new THREE.Group(); g.position.copy(at);
    const b = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: bubbleTex, depthWrite: false }))); b.scale.setScalar(1.1 * size); g.add(b);
    const e = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: emojiTex(emoji), depthWrite: false }))); e.scale.setScalar(0.72 * size); e.position.z = 0.01; e.renderOrder = 2; g.add(e);
    g.userData.action = action; scene.add(g);
    const p = { s: g, action, base: at.y, phase: Math.random() * 6, alive: true }; pins.push(p); return p;
  };
  const clearPins = () => { for (const p of pins) p.s.removeFromParent(); pins.length = 0; };

  // ---- tenants strolling ----
  const tenants: { g: THREE.Group; x: number; z: number; v: number; leg: THREE.Mesh[] }[] = [];
  const nT = Math.min(10, 3 + shown);
  for (let i = 0; i < nT; i++) {
    const g = new THREE.Group(); scene.add(g);
    const body = mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 8), std(['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#FF9F43', '#26de81'][i % 6]), 0, 0.75, 0, g);
    body.scale.set(1, 1, 0.8);
    mesh(new THREE.SphereGeometry(0.19, 12, 10), std(['#F2C9A0', '#C68B59', '#8D5524', '#FFDBAC'][i % 4]), 0, 1.25, 0, g);
    const legs = [mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), std('#2D3047'), -0.08, 0.2, 0, g), mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), std('#2D3047'), 0.08, 0.2, 0, g)];
    tenants.push({ g, x: (Math.random() - 0.5) * len, z: i % 2 ? 2.1 : -2.1, v: (0.7 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1), leg: legs });
  }

  // ---- what's showing: today's broken things, the mailbox (if there's mail), the garden (if it's dry) ----
  let flowersUp = view.watered;
  const apply = (v: EstateView) => {
    clearPins();
    for (const s of v.spots) {
      if (s.fixed) continue;
      const h = houses[s.house % houses.length]; if (!h) continue;
      pin(WHAT_EMOJI[s.what] ?? '🔧', new THREE.Vector3(h.position.x + (s.idx - 1) * 0.5, 3.9 + (s.idx % 2) * 0.5, h.position.z), { kind: 'repair', idx: s.idx });
    }
    if (v.requests > 0) pin('📬', new THREE.Vector3(mailbox.position.x, 2.4, mailbox.position.z), { kind: 'mailbox' });
    flag.rotation.z = v.requests > 0 ? 0 : -Math.PI / 2;
    if (!v.watered) pin('💧', new THREE.Vector3(garden.position.x, 2.2, garden.position.z), { kind: 'garden' });
    flowersUp = v.watered;
  };
  apply(view);

  // ---- little bursts ----
  const bursts: { s: THREE.Sprite; v: THREE.Vector3; life: number }[] = [];
  const burst = (at: THREE.Vector3, emojis: string[]) => {
    emojis.forEach((e, i) => {
      const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: emojiTex(e), transparent: true, depthWrite: false }))); s.scale.setScalar(0.6); s.position.copy(at); scene.add(s);
      const a = (i / emojis.length) * Math.PI * 2; bursts.push({ s, v: new THREE.Vector3(Math.cos(a) * 1.8, 3.5 + Math.random() * 2, Math.sin(a) * 1.8), life: 1.2 });
    });
  };

  // ---- camera: look along the street; drag to pan, pinch / wheel to zoom; tap a pin ----
  let panX = 0, dist = phone ? 17 : 15;
  const camTarget = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const pointers = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; t: number; panX: number } | null = null, pinch0 = 0, dist0 = dist;
  const pd = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), panX };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = dist; down = null; }
  };
  const pm = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) dist = Math.max(8, Math.min(28, dist0 * (pinch0 / d))); return; }
    if (down) { const dx = e.clientX - down.x; panX = Math.max(-len / 2, Math.min(len / 2, down.panX - dx * 0.03 * (dist / 15))); }
  };
  const pu = (e: PointerEvent) => {
    const wasTap = down && pointers.size === 1 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 450;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (wasTap) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hits = ray.intersectObjects(pins.map((p) => p.s), true);
      let o: THREE.Object3D | null = hits[0]?.object ?? null;
      while (o && !o.userData.action) o = o.parent;
      if (o?.userData.action) onAction(o.userData.action as EstateAction);
      else {
        // tapping the mailbox or the garden themselves works too
        const h2 = ray.intersectObjects([mailbox, garden], true)[0];
        if (h2) { let q: THREE.Object3D | null = h2.object; while (q && q !== mailbox && q !== garden) q = q.parent; if (q === mailbox) onAction({ kind: 'mailbox' }); if (q === garden) onAction({ kind: 'garden' }); }
      }
    }
    if (!pointers.size) down = null;
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); dist = Math.max(8, Math.min(28, dist + e.deltaY * 0.01)); };
  canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointermove', pm); canvas.addEventListener('pointerup', pu); canvas.addEventListener('pointercancel', pu);
  canvas.addEventListener('wheel', wheel, { passive: false });

  const resize = () => { const r = canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  let last = performance.now(), raf = 0, stop = false;
  const tick = () => {
    if (stop) return;
    raf = requestAnimationFrame(tick);
    if (!fps.ready(performance.now())) return;
    const now = performance.now(), raw = (now - last) / 1000, dt = Math.min(0.05, raw), t = now / 1000; last = now; tune(raw);
    for (const p of pins) { p.s.position.y = p.base + (reduceMotion ? 0 : Math.sin(t * 2.4 + p.phase) * 0.15); }
    for (const tn of tenants) {
      tn.x += tn.v * dt; if (Math.abs(tn.x) > len / 2 + 4) tn.v *= -1;
      tn.g.position.set(tn.x, 0, tn.z); tn.g.rotation.y = tn.v > 0 ? Math.PI / 2 : -Math.PI / 2;
      const sw = reduceMotion ? 0 : Math.sin(t * 8 + tn.x) * 0.5; tn.leg[0].rotation.x = sw; tn.leg[1].rotation.x = -sw;
    }
    flowers.forEach((f, i) => { const want = flowersUp ? 1 : 0.6; f.scale.setScalar(THREE.MathUtils.lerp(f.scale.x, want + (flowersUp && !reduceMotion ? Math.sin(t * 2 + i) * 0.06 : 0), Math.min(1, dt * 4))); f.position.y = THREE.MathUtils.lerp(f.position.y, flowersUp ? 0.78 : 0.55, Math.min(1, dt * 3)); });
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.life -= dt; b.v.y -= 9 * dt; b.s.position.addScaledVector(b.v, dt); b.s.material.opacity = Math.min(1, b.life * 2); if (b.life <= 0) { b.s.removeFromParent(); bursts.splice(i, 1); } }
    const tall = camera.aspect < 1;
    camTarget.lerp(new THREE.Vector3(panX, 0.8, 0), Math.min(1, dt * 6));
    const d = dist * (tall ? 1.35 : 1);
    camera.position.set(camTarget.x + d * 0.18, d * 0.62, d * 0.85);
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    update(v: EstateView) { apply(v); },
    /** a burst where something just got done */
    celebrate(a: EstateAction, emojis: string[]) {
      const at = a.kind === 'repair' ? (() => { const p = pins.find((x) => x.action.kind === 'repair' && x.action.idx === a.idx); return p ? p.s.position.clone() : new THREE.Vector3(panX, 3, 0); })()
        : a.kind === 'mailbox' ? new THREE.Vector3(mailbox.position.x, 2, mailbox.position.z) : new THREE.Vector3(garden.position.x, 1.5, garden.position.z);
      burst(at, emojis);
    },
    dispose() {
      stop = true; cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('pointerdown', pd); canvas.removeEventListener('pointermove', pm); canvas.removeEventListener('pointerup', pu); canvas.removeEventListener('pointercancel', pu);
      canvas.removeEventListener('wheel', wheel);
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
}
export type Estate3D = ReturnType<typeof createEstate3D>;
