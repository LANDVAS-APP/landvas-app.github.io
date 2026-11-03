// Mission control's solar system in 3D: the Sun, every world on its orbit (rings, the Moon going round
// the Earth), your rocket parked or on its way between two worlds. Drag to swing round, pinch or
// scroll to zoom, tap a world to plan a trip — the camera glides over to it.
import * as THREE from 'three';
import { rng } from '../inkborn/world';
import { WORLDS, type World, type WorldId } from './worlds';

export const RINGS: (WorldId | 'earth')[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const BASE: Record<string, number> = { mercury: 0.4, venus: 2.1, earth: 3.9, mars: 1.2, jupiter: 5.1, saturn: 2.8, uranus: 4.4, neptune: 0.9, pluto: 3.3 };
const SPEED: Record<string, number> = { mercury: 4.1, venus: 1.6, earth: 1, mars: 0.53, jupiter: 0.084, saturn: 0.034, uranus: 0.012, neptune: 0.006, pluto: 0.004 };

export type SystemLive = { location: string; dest: string | null; flying: boolean; progress: number; picked: string | null; locked: (id: string) => boolean };
export type SystemScene = { dispose(): void; positions: Map<string, { x: number; y: number; r: number }> };

/** A planet's surface painted onto a little canvas (bands on the giants, blotches on rocky worlds). */
export function planetTexture(w: World | 'earth', seed = 1) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(seed);
  if (w === 'earth') {
    g.fillStyle = '#2F86C9'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#4FA552';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(r() * 256, 20 + r() * 88, 10 + r() * 26, 6 + r() * 16, r() * 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#F4F8FF'; g.fillRect(0, 0, 256, 8); g.fillRect(0, 120, 256, 8);
  } else if (w.gas) {
    for (let y = 0; y < 128; y += 2) {
      const k = 0.5 + 0.5 * Math.sin(y * 0.33 + Math.sin(y * 0.11) * 2 + r() * 0.4);
      g.fillStyle = k > 0.5 ? w.color : w.color2; g.globalAlpha = 0.55 + k * 0.45; g.fillRect(0, y, 256, 2);
    }
    g.globalAlpha = 1;
    if (w.id === 'jupiter') { g.fillStyle = '#C8553A'; g.beginPath(); g.ellipse(170, 80, 18, 9, 0, 0, Math.PI * 2); g.fill(); }
    if (w.id === 'neptune') { g.fillStyle = '#1E2F7A'; g.beginPath(); g.ellipse(90, 56, 14, 7, 0, 0, Math.PI * 2); g.fill(); }
  } else {
    const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, w.color); grd.addColorStop(0.5, w.color2); grd.addColorStop(1, w.color);
    g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.12 + r() * 0.25; g.fillStyle = r() < 0.5 ? w.color2 : w.color; g.beginPath(); g.arc(r() * 256, r() * 128, 2 + r() * 12, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    if (w.id === 'pluto') { g.fillStyle = '#FFF6EA'; g.beginPath(); g.ellipse(150, 70, 22, 18, 0, 0, Math.PI * 2); g.fill(); }
    if (w.id === 'mars') { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 6); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function label(text: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 30px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(5,6,15,0.8)'; g.strokeText(text, 128, 32); g.fillStyle = '#fff'; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  s.center.set(0.5, 1.2); s.scale.set(0.2, 0.05, 1); return s;
}

export function createSystemScene(canvas: HTMLCanvasElement, live: { current: SystemLive }, accent: string, reduce: boolean, onPick: (id: string) => void): SystemScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060F');
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { owned.push(x); return x; };

  // stars and a faint galaxy band
  {
    const n = 3000, pts = new Float32Array(n * 3), cols = new Float32Array(n * 3);
    const r = rng(7);
    for (let i = 0; i < n; i++) {
      const band = i < 1400;
      const th = r() * Math.PI * 2, ph = band ? (r() - 0.5) * 0.35 : Math.acos(r() * 2 - 1) - Math.PI / 2;
      const v = new THREE.Vector3(Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.9).multiplyScalar(1200);
      pts.set([v.x, v.y, v.z], i * 3);
      const c = new THREE.Color().setHSL(0.6 + r() * 0.15, band ? 0.5 : 0.2, 0.6 + r() * 0.4); cols.set([c.r, c.g, c.b], i * 3);
    }
    const g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    scene.add(new THREE.Points(g, own(new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }))));
  }
  // the Sun
  const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,246,176,1)'); gr.addColorStop(0.3, 'rgba(255,201,61,0.7)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return own(new THREE.CanvasTexture(c)); })();
  const sun = new THREE.Mesh(own(new THREE.SphereGeometry(4.2, 32, 24)), own(new THREE.MeshBasicMaterial({ color: '#FFD84D' })));
  scene.add(sun);
  const sunGlow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
  sunGlow.scale.setScalar(26); scene.add(sunGlow);
  scene.add(new THREE.PointLight('#FFF3D6', 2.4, 0, 0));
  scene.add(new THREE.AmbientLight('#8090C0', 0.35));

  type Body = { id: string; mesh: THREE.Mesh; orbitR: number; size: number; lab: THREE.Sprite; halo: THREE.Mesh };
  const bodies = new Map<string, Body>();
  const haloMat = own(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  RINGS.forEach((id, i) => {
    const orbitR = 9 + i * 5.4;
    const w = id === 'earth' ? null : WORLDS[id];
    const size = id === 'earth' ? 1.25 : Math.max(0.8, Math.min(3.3, w!.r * 0.17));
    const mat = own(new THREE.MeshStandardMaterial({ map: own(planetTexture(w ?? 'earth', i + 3)), roughness: 0.85, transparent: true }));
    const mesh = new THREE.Mesh(own(new THREE.SphereGeometry(size, 32, 20)), mat);
    if (w?.ring) {
      const rg = own(new THREE.RingGeometry(size * 1.35, size * 2.2, 48));
      const ring = new THREE.Mesh(rg, own(new THREE.MeshBasicMaterial({ color: w.ring, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })));
      ring.rotation.x = Math.PI / 2 - (id === 'uranus' ? 1.4 : 0.45); mesh.add(ring);
    }
    if (id === 'uranus') mesh.rotation.z = 1.4;
    scene.add(mesh);
    const pts: THREE.Vector3[] = []; for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * orbitR, 0, Math.sin(a) * orbitR)); }
    scene.add(new THREE.Line(own(new THREE.BufferGeometry().setFromPoints(pts)), own(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12 }))));
    const lab = label(id === 'earth' ? 'Earth' : w!.name.replace('The ', '')); scene.add(lab);
    const halo = new THREE.Mesh(own(new THREE.RingGeometry(size * 1.5, size * 1.5 + 0.18, 40)), haloMat); halo.visible = false; scene.add(halo);
    bodies.set(id, { id, mesh, orbitR, size, lab, halo });
  });
  // the Moon goes round the Earth
  const moon = new THREE.Mesh(own(new THREE.SphereGeometry(0.42, 20, 14)), own(new THREE.MeshStandardMaterial({ map: own(planetTexture(WORLDS.moon, 2)), roughness: 1, transparent: true })));
  scene.add(moon);
  const moonLab = label('Moon'); moonLab.scale.set(0.15, 0.037, 1); scene.add(moonLab);
  const moonHalo = new THREE.Mesh(own(new THREE.RingGeometry(0.55, 0.7, 32)), haloMat); moonHalo.visible = false; scene.add(moonHalo);
  // deep space: a distant twinkle off to one side
  const deep = new THREE.Vector3(70, 12, -40);
  const deepSp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glow, color: '#B69CFF', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
  deepSp.position.copy(deep); deepSp.scale.setScalar(8); scene.add(deepSp);
  // your rocket
  const rocket = new THREE.Group();
  const body = new THREE.Mesh(own(new THREE.CylinderGeometry(0.22, 0.25, 1, 12)), own(new THREE.MeshStandardMaterial({ color: '#F2F5FB', emissive: '#555b70', emissiveIntensity: 0.4 })));
  const nose = new THREE.Mesh(own(new THREE.ConeGeometry(0.22, 0.45, 12)), own(new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.3 }))); nose.position.y = 0.72;
  const flame = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glow, color: '#FFB13D', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))); flame.position.y = -0.75; flame.scale.setScalar(0.9);
  rocket.add(body, nose, flame); rocket.scale.setScalar(1.1); scene.add(rocket);
  const trailGeo = own(new THREE.BufferGeometry()); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const trail = new THREE.Line(trailGeo, own(new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.45 }))); scene.add(trail);

  // camera rig: orbit round a focus point
  const portrait = () => canvas.clientHeight > canvas.clientWidth * 0.9;
  const home = () => (portrait() ? 74 : 78);
  let yaw = -0.6, pitch = 0.62, dist = home(); const focus = new THREE.Vector3(); const focusTo = new THREE.Vector3();
  let distTo = dist;
  if (portrait()) pitch = 0.95;
  const positions = new Map<string, { x: number; y: number; r: number }>();
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; moved: number } | null = null; let pinch = 0;
  const pd = (e: PointerEvent) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { canvas.setPointerCapture(e.pointerId); } catch { /* gone */ } drag = pointers.size === 1 ? { x: e.clientX, y: e.clientY, moved: 0 } : null; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } };
  const pm = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) distTo = Math.max(12, Math.min(150, distTo * (pinch / d))); pinch = d; return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.006; pitch = Math.max(0.08, Math.min(1.45, pitch + dy * 0.005));
  };
  const pu = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (drag && drag.moved < 8 && pointers.size === 0) {
      const rc = canvas.getBoundingClientRect(); const x = e.clientX - rc.left, y = e.clientY - rc.top;
      let best: string | null = null, bd = 28;
      for (const [id, p] of positions) { if (id === 'earth') continue; const d = Math.hypot(p.x - x, p.y - y) - p.r; if (d < bd) { bd = d; best = id; } }
      if (best) onPick(best);
    }
    if (pointers.size === 0) { drag = null; pinch = 0; }
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); distTo = Math.max(12, Math.min(150, distTo * (e.deltaY > 0 ? 1.1 : 0.9))); };
  canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointermove', pm); canvas.addEventListener('pointerup', pu); canvas.addEventListener('pointercancel', pu);
  canvas.addEventListener('wheel', wheel, { passive: false });

  const resize = () => { const rc = canvas.getBoundingClientRect(); renderer.setSize(rc.width, rc.height, false); camera.aspect = rc.width / Math.max(1, rc.height); camera.updateProjectionMatrix(); };
  resize(); const ro = new ResizeObserver(resize); ro.observe(canvas);
  const posOf = (id: string | null) => (id?.startsWith('exo:') || id === 'exo' || id === 'home' ? deep : id === 'moon' ? moon.position : bodies.get(id ?? 'earth')?.mesh.position ?? bodies.get('earth')!.mesh.position);
  const tmp = new THREE.Vector3();
  let raf = 0; const t0 = performance.now(); let lastPicked: string | null = null; let last = t0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const L = live.current;
    const t = reduce ? 0 : (now - t0) / 1000; const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const b of bodies.values()) {
      const a = BASE[b.id] + t * 0.06 * Math.pow(SPEED[b.id], 0.45);
      b.mesh.position.set(Math.cos(a) * b.orbitR, 0, Math.sin(a) * b.orbitR);
      b.mesh.rotation.y = t * 0.4;
      const locked = b.id !== 'earth' && L.locked(b.id);
      (b.mesh.material as THREE.MeshStandardMaterial).opacity = locked ? 0.4 : 1;
      b.lab.position.copy(b.mesh.position); b.lab.position.y -= b.size;
      (b.lab.material as THREE.SpriteMaterial).opacity = locked ? 0.45 : 0.85;
      b.halo.visible = L.picked === b.id; b.halo.position.copy(b.mesh.position); b.halo.lookAt(camera.position); b.halo.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    }
    const ep = bodies.get('earth')!.mesh.position;
    moon.position.set(ep.x + Math.cos(t * 0.9) * 2.4, 0.3, ep.z + Math.sin(t * 0.9) * 2.4);
    moonLab.position.copy(moon.position); moonLab.position.y -= 0.35;
    moonHalo.visible = L.picked === 'moon'; moonHalo.position.copy(moon.position); moonHalo.lookAt(camera.position);
    // rocket
    const from = posOf(L.location), to = posOf(L.dest);
    if (L.flying && L.dest) {
      rocket.position.lerpVectors(from, to, L.progress);
      tmp.subVectors(to, from).normalize(); rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp);
      flame.visible = true; flame.scale.setScalar(0.8 + Math.sin(t * 30) * 0.15);
      const arr = trailGeo.attributes.position as THREE.BufferAttribute; arr.setXYZ(0, from.x, from.y, from.z); arr.setXYZ(1, to.x, to.y, to.z); arr.needsUpdate = true; trail.computeLineDistances(); trail.visible = true;
    } else {
      rocket.position.copy(from).add(tmp.set(0.9, 1.4, 0)); rocket.quaternion.identity(); flame.visible = false; trail.visible = false;
    }
    // camera: glide to whatever you picked
    if (L.picked !== lastPicked) {
      lastPicked = L.picked;
      if (L.picked) { const b = bodies.get(L.picked); distTo = L.picked === 'moon' ? 16 : L.picked === 'exo' || L.picked === 'home' ? 60 : Math.max(18, (b?.size ?? 1) * 10); }
      else distTo = home();
    }
    focusTo.copy(L.picked ? posOf(L.picked) : new THREE.Vector3());
    focus.lerp(focusTo, Math.min(1, dt * 3)); dist += (distTo - dist) * Math.min(1, dt * 3);
    camera.position.set(focus.x + Math.cos(pitch) * Math.cos(yaw) * dist, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * Math.sin(yaw) * dist);
    camera.lookAt(focus);
    if (!reduce && !drag && !L.picked) yaw += dt * 0.02;
    renderer.render(scene, camera);
    // screen positions (for taps and tests)
    const rc = canvas.getBoundingClientRect(); positions.clear();
    const project = (id: string, p: THREE.Vector3, size: number) => {
      tmp.copy(p).project(camera); if (tmp.z > 1) return;
      const edge = tmp.clone().copy(p).add(new THREE.Vector3(size, 0, 0).applyQuaternion(camera.quaternion)).project(camera);
      positions.set(id, { x: (tmp.x + 1) / 2 * rc.width, y: (1 - tmp.y) / 2 * rc.height, r: Math.max(6, Math.abs(edge.x - tmp.x) / 2 * rc.width) });
    };
    for (const b of bodies.values()) project(b.id, b.mesh.position, b.size);
    project('moon', moon.position, 0.32);
  };
  raf = requestAnimationFrame(frame);
  return {
    positions,
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('pointerdown', pd); canvas.removeEventListener('pointermove', pm); canvas.removeEventListener('pointerup', pu); canvas.removeEventListener('pointercancel', pu); canvas.removeEventListener('wheel', wheel);
      scene.traverse((x) => { if (x instanceof THREE.Sprite) { x.material.map?.dispose(); x.material.dispose(); } });
      for (const o of owned) o.dispose();
      renderer.dispose();
    },
  };
}
