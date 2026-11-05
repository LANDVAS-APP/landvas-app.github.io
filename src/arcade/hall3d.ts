// The arcade hall in 3D: a dark room full of neon. Cabinets line the walls with their screens running attract
// mode and marquees glowing; the prize counter at the back shows off your prizes; a ticket machine by the door
// pays the daily bonus. You walk your explorer round (tap the floor, or a cabinet, to walk there; WASD/arrows on a
// keyboard). Step up to a cabinet and the page offers "Play"; then the camera glides in until the cabinet's
// screen fills the view, as if you were standing at it.
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';

export type HallMachine = { id: string; name: string; color: string; emoji: string; level: number; locked: boolean; lockLabel?: string };
export type HallSpot = { kind: 'machine'; id: string } | { kind: 'prizes' } | { kind: 'bonus' };
export type HallOpts = {
  canvas: HTMLCanvasElement; explorerUrl: string; seed: number; reduceMotion?: boolean;
  /** you're standing at something you can use (or walked away: null) */ onNear?(s: HallSpot | null): void;
};
export type Decor = { floor: string; neon: string; lights: string };

const NEON: Record<string, string[]> = {
  pink: ['#FF3D9A', '#FF7AC8'], cyan: ['#22E3FF', '#7FF3FF'], lime: ['#B6FF3D', '#E2FF8A'], violet: ['#8B5CFF', '#C3A8FF'],
  sunset: ['#FF7A3D', '#FF3D9A'], rainbow: ['#FF3D6E', '#22E3FF'],
};
const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function floorTex(kind: string, neon: string[]) {
  return canvasTex(512, 512, (g) => {
    const W = 512;
    if (kind === 'checker') { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#1A1A26' : '#E9E6F2'; g.fillRect(x * 64, y * 64, 64, 64); } return; }
    if (kind === 'gold') { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const gr = g.createLinearGradient(x * 64, y * 64, x * 64 + 64, y * 64 + 64); gr.addColorStop(0, '#FFE58A'); gr.addColorStop(1, (x + y) % 2 ? '#B8860B' : '#E0A82E'); g.fillStyle = gr; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); } return; }
    if (kind === 'grid') { g.fillStyle = '#07071A'; g.fillRect(0, 0, W, W); g.strokeStyle = neon[0]; g.lineWidth = 3; g.shadowColor = neon[0]; g.shadowBlur = 10; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, W); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(W, i * 64); g.stroke(); } return; }
    if (kind === 'galaxy') {
      const gr = g.createRadialGradient(256, 256, 20, 256, 256, 360); gr.addColorStop(0, '#5B2BC9'); gr.addColorStop(0.5, '#1C0F4A'); gr.addColorStop(1, '#05051A'); g.fillStyle = gr; g.fillRect(0, 0, W, W);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * W, Math.random() * W, 2, 2); }
      g.strokeStyle = 'rgba(255,61,154,0.35)'; g.lineWidth = 18; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(256, 256, 80 + i * 70, i, i + 2.4); g.stroke(); }
      return;
    }
    // cosmic carpet: the classic bowling-alley/arcade carpet
    g.fillStyle = '#0E0B26'; g.fillRect(0, 0, W, W);
    const cols = ['#FF3D9A', '#22E3FF', '#FFE14D', '#8B5CFF', '#3DDC97'];
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = cols[i % cols.length]; g.fillStyle = cols[(i + 2) % cols.length]; g.lineWidth = 4;
      const x = r() * W, y = r() * W, k = i % 4;
      if (k === 0) { g.beginPath(); g.arc(x, y, 10 + r() * 14, 0, Math.PI * 2); g.stroke(); }
      else if (k === 1) { g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 30, y - 30, x + 40, y + 30, x + 70, y); g.stroke(); }
      else if (k === 2) { g.save(); g.translate(x, y); g.rotate(r() * 6); g.beginPath(); g.moveTo(0, -10); g.lineTo(9, 7); g.lineTo(-9, 7); g.closePath(); g.fill(); g.restore(); }
      else { g.beginPath(); for (let j = 0; j < 5; j++) { const a = (j / 5) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); g.lineTo(x + Math.cos(a + 0.6) * 3.5, y + Math.sin(a + 0.6) * 3.5); } g.closePath(); g.fill(); }
    }
  });
}
function labelTex(text: string, color: string, sub?: string) {
  return canvasTex(512, 128, (g) => {
    g.fillStyle = '#05050F'; g.fillRect(0, 0, 512, 128);
    let size = 64; g.font = `900 ${size}px ui-rounded, system-ui, sans-serif`;
    while (size > 22 && g.measureText(text.toUpperCase()).width > 470) { size -= 4; g.font = `900 ${size}px ui-rounded, system-ui, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = '#fff'; g.fillText(text.toUpperCase(), 256, sub ? 52 : 64);
    g.shadowBlur = 12; g.fillStyle = color; g.fillText(text.toUpperCase(), 256, sub ? 52 : 64);
    if (sub) { g.shadowBlur = 0; g.font = '800 26px ui-rounded, system-ui'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(sub, 256, 104); }
  });
}
function emojiSprite(e: string, size: number) {
  const t = canvasTex(128, 128, (g) => { g.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.setScalar(size); return s;
}

/** A cabinet's attract-mode picture, redrawn a few times a second. */
function attract(id: string, g: CanvasRenderingContext2D, t: number, color: string, locked: boolean) {
  const W = 256, H = 192;
  g.fillStyle = '#04040C'; g.fillRect(0, 0, W, H);
  if (locked) { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2); g.font = '900 30px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillStyle = '#666'; g.fillText('OUT OF ORDER', W / 2, H / 2); return; }
  g.save();
  if (id === 'stacker') {
    const lv = Math.floor(t * 1.5) % 12;
    for (let i = 0; i <= lv; i++) { const w = Math.max(30, 140 - i * 9), x = W / 2 - w / 2 + (i === lv ? Math.sin(t * 4) * 50 : 0); g.fillStyle = `hsl(${(i * 26 + 300) % 360} 90% 60%)`; g.fillRect(x, H - 16 - i * 14, w, 12); }
  } else if (id === 'cyclone') {
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, on = i === Math.floor(t * 14) % 24; g.fillStyle = on ? '#fff' : i === 0 ? '#FFE14D' : `hsl(${i * 15} 90% ${on ? 80 : 45}%)`; g.beginPath(); g.arc(W / 2 + Math.cos(a) * 70, H / 2 + Math.sin(a) * 70, on ? 9 : 6, 0, Math.PI * 2); g.fill(); }
    g.font = '900 22px ui-rounded'; g.textAlign = 'center'; g.fillStyle = '#FFE14D'; g.fillText('JACKPOT', W / 2, H / 2 + 8);
  } else if (id === 'skeeball') {
    for (let i = 4; i >= 0; i--) { g.strokeStyle = `hsl(${30 + i * 20} 100% 60%)`; g.lineWidth = 6; g.beginPath(); g.arc(W / 2, 70, 14 + i * 14, 0, Math.PI * 2); g.stroke(); }
    const p = (t * 0.7) % 1; g.fillStyle = '#fff'; g.beginPath(); g.arc(W / 2 + Math.sin(t) * 20, H - p * 120, 8 - p * 4, 0, Math.PI * 2); g.fill();
  } else if (id === 'hoops') {
    g.strokeStyle = '#FF7A3D'; g.lineWidth = 5; g.beginPath(); g.ellipse(W / 2, 60, 34, 8, 0, 0, Math.PI * 2); g.stroke();
    const p = (t * 0.8) % 1, x = W / 2 + (1 - p) * 60 * Math.sin(t), y = H - 20 - Math.sin(p * Math.PI) * 150; g.fillStyle = '#FF7A3D'; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
  } else if (id === 'bop') {
    for (let i = 0; i < 9; i++) { const x = 50 + (i % 3) * 78, y = 50 + Math.floor(i / 3) * 52; g.fillStyle = '#1D2A1A'; g.beginPath(); g.ellipse(x, y + 12, 26, 9, 0, 0, Math.PI * 2); g.fill(); if (Math.sin(t * 3 + i * 2.3) > 0.6) { g.font = '30px system-ui'; g.textAlign = 'center'; g.fillText('🤖', x, y + 4); } }
  } else if (id === 'claw') {
    g.fillStyle = '#B57BFF33'; g.fillRect(10, 10, W - 20, H - 20); const x = W / 2 + Math.sin(t * 0.9) * 80; g.strokeStyle = '#ddd'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 10); g.lineTo(x, 60 + Math.max(0, Math.sin(t * 1.3)) * 40); g.stroke();
    g.font = '30px system-ui'; g.textAlign = 'center'; ['🧸', '🦄', '🐙', '👾', '🦖'].forEach((e, i) => g.fillText(e, 40 + i * 44, H - 30));
  }
  g.restore();
  // scanlines and a pulsing "insert coin"
  g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  if (Math.sin(t * 4) > 0) { g.font = '900 16px ui-monospace, monospace'; g.textAlign = 'center'; g.fillStyle = color; g.fillText('FREE PLAY', W / 2, 18); }
}

export function createHall(o: HallOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05040F'); scene.fog = new THREE.Fog('#05040F', 18, 46);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 120);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...p }));
  const glow = (color: string, k = 1.8) => T(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 }));
  const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(T(new THREE.BoxGeometry(w, h, d)), m);

  const W = 18, D = 24; // the room, metres (x: -9..9, z: -12..12; door at +z)
  scene.add(new THREE.HemisphereLight('#8A7CFF', '#1A1030', 0.95));
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  const pl: THREE.PointLight[] = [];
  for (const [x, z, c] of [[-5, -5, '#FF3D9A'], [5, -5, '#22E3FF'], [-5, 6, '#8B5CFF'], [5, 6, '#FFB13D']] as const) {
    const l = new THREE.PointLight(c, phone ? 20 : 24, 20, 1.5); l.position.set(x, 4.2, z); scene.add(l); pl.push(l);
  }

  // floor, walls, ceiling
  const floorMat = std('#ffffff', { roughness: 0.85 });
  const floor = new THREE.Mesh(T(new THREE.PlaneGeometry(W, D)), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wallTex = canvasTex(512, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#120C2E'); gr.addColorStop(1, '#2B1F5C'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    const r = rng(11); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`; g.fillRect(r() * 512, r() * 150, 2, 2); }
    for (const [y, c] of [[190, '#FF3D9A'], [204, '#22E3FF'], [218, '#FFE14D']] as const) { g.fillStyle = c; g.globalAlpha = 0.55; g.fillRect(0, y, 512, 6); }
    g.globalAlpha = 1;
  });
  wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set(3, 1); T(wallTex);
  const wallMat = std('#ffffff', { roughness: 0.9, map: wallTex, emissive: '#ffffff', emissiveMap: wallTex, emissiveIntensity: 0.35 });
  const back = box(W, 5, 0.3, wallMat); back.position.set(0, 2.5, -D / 2); scene.add(back);
  for (const s of [-1, 1]) { const w = box(0.3, 5, D, wallMat); w.position.set(s * W / 2, 2.5, 0); scene.add(w); }
  for (const s of [-1, 1]) { const w = box(W / 2 - 2, 5, 0.3, wallMat); w.position.set(s * (W / 4 + 1), 2.5, D / 2); scene.add(w); }
  const ceil = new THREE.Mesh(T(new THREE.PlaneGeometry(W, D)), std('#0A0818')); ceil.rotation.x = Math.PI / 2; ceil.position.y = 5; scene.add(ceil);
  // neon trim round the room (recoloured with the decor)
  let neon = NEON.pink;
  const trimA = glow(neon[0], 2.2), trimB = glow(neon[1], 2.2);
  const trims: THREE.Mesh[] = [];
  for (const [w, d, x, z, m] of [[W, 0.06, 0, -D / 2 + 0.17, trimA], [0.06, D, -W / 2 + 0.17, 0, trimB], [0.06, D, W / 2 - 0.17, 0, trimB]] as const) {
    for (const y of [0.12, 4.6]) { const t = box(w, 0.06, d, m); t.position.set(x, y, z); scene.add(t); trims.push(t); }
  }
  // the arcade's sign over the prize counter
  const signMat = T(new THREE.MeshBasicMaterial({ map: labelTex('Arcade', neon[0]), toneMapped: false }));
  const sign = new THREE.Mesh(T(new THREE.PlaneGeometry(6, 1.5)), signMat); sign.position.set(0, 3.9, -D / 2 + 0.2); scene.add(sign);

  // ---- light shows: chase bulbs, a disco ball, lasers ----------------------------------------------------
  const bulbs: THREE.Mesh[] = [];
  const bulbGeo = T(new THREE.SphereGeometry(0.07, 8, 6));
  const bulbOn = glow('#FFE9A8', 2.5), bulbOff = std('#3A3020');
  for (let i = 0; i < 44; i++) { const b = new THREE.Mesh(bulbGeo, bulbOff); const k = i / 44; b.position.set(-W / 2 + 0.25 + k * (W - 0.5), 4.85, -D / 2 + 0.3); scene.add(b); bulbs.push(b); }
  const disco = new THREE.Mesh(T(new THREE.IcosahedronGeometry(0.55, 2)), T(new THREE.MeshStandardMaterial({ color: '#E0E6F5', metalness: 1, roughness: 0.15, flatShading: true, emissive: '#5560A0', emissiveIntensity: 0.4 })));
  disco.position.set(0, 4.3, 0); scene.add(disco);
  const lasers = new THREE.Group(); scene.add(lasers);
  for (let i = 0; i < 6; i++) {
    const beam = new THREE.Mesh(T(new THREE.CylinderGeometry(0.02, 0.02, 22, 4, 1, true)), T(new THREE.MeshBasicMaterial({ color: i % 2 ? '#22E3FF' : '#FF3D9A', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
    beam.position.set(0, 4.6, -D / 2 + 0.5); beam.rotation.z = Math.PI / 2; beam.geometry.translate(0, 11, 0); lasers.add(beam);
  }
  const spots: THREE.SpotLight[] = [];
  let lights = 'steady';

  // ---- cabinets --------------------------------------------------------------------------------------------
  type Cab = { m: HallMachine; g: THREE.Group; screen: HTMLCanvasElement; tex: THREE.CanvasTexture; spot: THREE.Vector3; screenPos: THREE.Vector3; screenN: THREE.Vector3; marquee: THREE.Mesh; label: THREE.Sprite | null };
  const cabs = new Map<string, Cab>();
  const slots: { x: number; z: number; ry: number }[] = [
    { x: -W / 2 + 1, z: -6, ry: Math.PI / 2 }, { x: -W / 2 + 1, z: -2, ry: Math.PI / 2 }, { x: -W / 2 + 1, z: 2, ry: Math.PI / 2 }, { x: -W / 2 + 1, z: 6, ry: Math.PI / 2 },
    { x: W / 2 - 1, z: -6, ry: -Math.PI / 2 }, { x: W / 2 - 1, z: -2, ry: -Math.PI / 2 }, { x: W / 2 - 1, z: 2, ry: -Math.PI / 2 }, { x: W / 2 - 1, z: 6, ry: -Math.PI / 2 },
  ];
  const buildCab = (m: HallMachine, slot: { x: number; z: number; ry: number }): Cab => {
    const g = new THREE.Group(); g.position.set(slot.x, 0, slot.z); g.rotation.y = slot.ry;
    const body = std(m.locked ? '#2A2A34' : '#2A2650', { roughness: 0.45, metalness: 0.2, emissive: m.locked ? '#000000' : m.color, emissiveIntensity: 0.06 });
    const side = std(m.locked ? '#2C2C36' : m.color, { roughness: 0.35, emissive: m.locked ? '#000000' : m.color, emissiveIntensity: 0.3 });
    // body: base, sloped screen face, top box; side panels in the cabinet's colour
    const base = box(1.3, 1.0, 1.0, body); base.position.set(0, 0.5, 0); g.add(base);
    const top = box(1.3, 1.2, 0.8, body); top.position.set(0, 1.6, -0.1); g.add(top);
    for (const s of [-1, 1]) { const p = box(0.06, 2.6, 1.05, side); p.position.set(s * 0.68, 1.3, -0.02); g.add(p); }
    const panel = box(1.3, 0.12, 0.55, std('#0E0D1A')); panel.position.set(0, 1.02, 0.42); panel.rotation.x = 0.25; g.add(panel);
    if (!m.locked) {
      const stick = new THREE.Mesh(T(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6)), std('#888')); stick.position.set(-0.3, 1.17, 0.45); g.add(stick);
      const knob = new THREE.Mesh(T(new THREE.SphereGeometry(0.055, 12, 8)), glow('#FF3D3D', 0.6)); knob.position.set(-0.3, 1.27, 0.45); g.add(knob);
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(T(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14)), glow(['#22E3FF', '#FFE14D', '#3DDC97'][i], 0.9)); b.position.set(0.05 + i * 0.16, 1.12, 0.47 - i * 0.02); b.rotation.x = 0.25; g.add(b); }
    }
    const c = document.createElement('canvas'); c.width = 256; c.height = 192;
    const tex = T(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(T(new THREE.PlaneGeometry(0.98, 0.74)), T(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    screen.position.set(0, 1.6, 0.31); screen.rotation.x = -0.12; g.add(screen);
    const bezel = box(1.1, 0.86, 0.05, std('#000')); bezel.position.set(0, 1.6, 0.285); bezel.rotation.x = -0.12; g.add(bezel);
    const marquee = new THREE.Mesh(T(new THREE.PlaneGeometry(1.26, 0.36)), T(new THREE.MeshBasicMaterial({ map: T(labelTex(m.name, m.locked ? '#555' : m.color)), toneMapped: false })));
    marquee.position.set(0, 2.42, 0.32); g.add(marquee);
    const mq = box(1.3, 0.42, 0.3, body); mq.position.set(0, 2.42, 0.15); g.add(mq);
    // a glow on the floor in front
    if (!m.locked) { const pool = new THREE.Mesh(T(new THREE.CircleGeometry(0.9, 24)), T(new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.012, 0.9); g.add(pool); }
    let label: THREE.Sprite | null = null;
    if (m.locked && m.lockLabel) { label = emojiSprite('🔒', 0.5); label.position.set(0, 2.95, 0.3); g.add(label); }
    scene.add(g);
    g.updateMatrixWorld(true);
    const spot = new THREE.Vector3(0, 0, 1.25).applyMatrix4(g.matrixWorld);
    const screenPos = new THREE.Vector3(0, 1.6, 0.31).applyMatrix4(g.matrixWorld);
    const screenN = new THREE.Vector3(0, -0.12, 1).normalize().applyQuaternion(g.quaternion);
    return { m, g, screen: c, tex, spot, screenPos, screenN, marquee, label };
  };
  const setMachines = (list: HallMachine[]) => {
    for (const c of cabs.values()) scene.remove(c.g);
    cabs.clear();
    list.slice(0, slots.length).forEach((m, i) => cabs.set(m.id, buildCab(m, slots[i])));
  };

  // ---- prize counter and the ticket machine ------------------------------------------------------------------
  const counter = new THREE.Group(); counter.position.set(0, 0, -D / 2 + 1.6); scene.add(counter);
  { const c1 = box(7, 1.05, 0.9, std('#1F1A3A', { metalness: 0.3, roughness: 0.4 })); c1.position.y = 0.52; counter.add(c1);
    const glass = box(7, 0.06, 0.95, T(new THREE.MeshStandardMaterial({ color: '#BFE3FF', transparent: true, opacity: 0.35, roughness: 0.05 }))); glass.position.y = 1.08; counter.add(glass);
    const strip = box(7.02, 0.08, 0.92, trimA); strip.position.y = 0.06; counter.add(strip);
    for (let i = 0; i < 3; i++) { const sh = box(7.6, 0.08, 0.5, std('#2A2450')); sh.position.set(0, 1.9 + i * 0.75, -0.85); counter.add(sh); } }
  let shelf = new THREE.Group(); counter.add(shelf);
  const setShelf = (items: { emoji: string; n: number }[]) => {
    counter.remove(shelf); shelf.traverse((x) => { if (x instanceof THREE.Sprite) { x.material.map?.dispose(); x.material.dispose(); } });
    shelf = new THREE.Group(); counter.add(shelf);
    const flat: string[] = []; for (const it of items) for (let i = 0; i < Math.min(it.n, 3); i++) flat.push(it.emoji);
    flat.slice(0, 27).forEach((e, i) => { const s = emojiSprite(e, 0.62); s.position.set(-3.3 + (i % 9) * 0.82, 2.25 + Math.floor(i / 9) * 0.75, -0.85); shelf.add(s); });
    if (!flat.length) { const s = emojiSprite('🎁', 0.7); s.position.set(0, 2.3, -0.85); shelf.add(s); }
  };
  const prizeSpot = new THREE.Vector3(0, 0, -D / 2 + 2.9);
  const bonus = new THREE.Group(); bonus.position.set(W / 2 - 2.2, 0, D / 2 - 2.2); bonus.rotation.y = -Math.PI * 0.75; scene.add(bonus);
  { const b1 = box(0.9, 1.7, 0.7, std('#FFB13D', { emissive: '#FF7A00', emissiveIntensity: 0.25, roughness: 0.3 })); b1.position.y = 0.85; bonus.add(b1);
    const slot = box(0.4, 0.05, 0.05, glow('#FF3D9A', 2)); slot.position.set(0, 0.9, 0.36); bonus.add(slot);
    const t = emojiSprite('🎟️', 0.7); t.position.set(0, 2.05, 0); bonus.add(t); }
  const bonusSpot = new THREE.Vector3(0, 0, 1.1).applyMatrix4(bonus.matrixWorld.compose(bonus.position, bonus.quaternion, bonus.scale));
  let bonusReady = false;
  const bonusTicket = emojiSprite('✨', 0.5); bonusTicket.position.set(0, 2.6, 0); bonus.add(bonusTicket);

  // ---- you, and a few regulars ------------------------------------------------------------------------------
  const meTex = T(new THREE.TextureLoader().load(o.explorerUrl)); meTex.colorSpace = THREE.SRGBColorSpace; meTex.wrapS = THREE.RepeatWrapping;
  const me = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true, alphaTest: 0.05 }))); me.center.set(0.5, 0); me.scale.set(1.25 * (46 / 68), 1.25, 1); scene.add(me);
  const shadow = new THREE.Mesh(T(new THREE.CircleGeometry(0.32, 16)), T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.4, depthWrite: false }))); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const P = { x: 0, z: D / 2 - 2, tx: 0, tz: D / 2 - 2, face: -1, walk: 0, moving: false, keys: { x: 0, z: 0 } };
  const ring = new THREE.Mesh(T(new THREE.RingGeometry(0.25, 0.34, 24)), T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0.8, depthWrite: false }))); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  const regulars: { s: THREE.Sprite; at: string | null; bob: number }[] = [];
  const setRegulars = (urls: string[]) => {
    for (const r of regulars) { scene.remove(r.s); r.s.material.map?.dispose(); r.s.material.dispose(); }
    regulars.length = 0;
    const ids = [...cabs.values()].filter((c) => !c.m.locked);
    urls.slice(0, ids.length).forEach((u, i) => {
      const tex = new THREE.TextureLoader().load(u); tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 })); s.center.set(0.5, 0); s.scale.set(1.2 * (46 / 68), 1.2, 1);
      const c = ids[(i * 2 + 1) % ids.length]; const side = new THREE.Vector3(1, 0, 0).applyQuaternion(c.g.quaternion).multiplyScalar(i % 2 ? 1.1 : -1.1); s.position.copy(c.spot).add(side).add(c.screenN.clone().setY(0).normalize().multiplyScalar(-0.35)); scene.add(s);
      regulars.push({ s, at: c.m.id, bob: Math.random() * 6 });
    });
  };

  // ---- walking ----------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const clampX = (x: number) => Math.max(-W / 2 + 1.9, Math.min(W / 2 - 1.9, x));
  const clampZ = (z: number) => Math.max(-D / 2 + 2.4, Math.min(D / 2 - 0.8, z));
  let down: { x: number; y: number; t: number } | null = null;
  const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const pu = (e: PointerEvent) => {
    if (!down || zoom.on || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { down = null; return; }
    down = null;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // a cabinet, the counter or the ticket machine: walk up to it
    for (const c of cabs.values()) if (ray.intersectObject(c.g, true).length) { go(c.spot.x, c.spot.z); return; }
    if (ray.intersectObject(counter, true).length) { go(prizeSpot.x, prizeSpot.z); return; }
    if (ray.intersectObject(bonus, true).length) { go(bonusSpot.x, bonusSpot.z); return; }
    const h = ray.intersectObject(floor)[0]; if (h) go(h.point.x, h.point.z);
  };
  const go = (x: number, z: number) => { P.tx = clampX(x); P.tz = clampZ(z); ring.visible = true; ring.position.set(P.tx, 0.02, P.tz); };
  const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') P.keys.x = -1; if (k === 'd' || k === 'arrowright') P.keys.x = 1; if (k === 'w' || k === 'arrowup') P.keys.z = -1; if (k === 's' || k === 'arrowdown') P.keys.z = 1; };
  const ku = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) P.keys.x = 0; if (['w', 's', 'arrowup', 'arrowdown'].includes(k)) P.keys.z = 0; };
  o.canvas.addEventListener('pointerdown', pd); o.canvas.addEventListener('pointerup', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  // ---- the camera: following you, or zoomed into a cabinet's screen ---------------------------------------------
  const camPos = new THREE.Vector3(0, 6, D / 2 + 4), camLook = new THREE.Vector3(0, 1, 0);
  const zoom = { on: false, k: 0, cab: null as Cab | null, resolve: null as null | (() => void) };
  let near: string | null = null;
  const nearKey = (s: HallSpot | null) => (s ? (s.kind === 'machine' ? `m:${s.id}` : s.kind) : null);

  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, frame = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), lookDir = new THREE.Vector3(0, 0, -1);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (paused) { last = now; return; }
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now; t += dt; frame++;
    tune(raw);
    // walk
    if (!zoom.on) {
      if (P.keys.x || P.keys.z) { P.tx = clampX(P.x + P.keys.x * 1.2); P.tz = clampZ(P.z + P.keys.z * 1.2); ring.visible = false; }
      const dx = P.tx - P.x, dz = P.tz - P.z, dist = Math.hypot(dx, dz);
      P.moving = dist > 0.05;
      if (P.moving) { const sp = Math.min(dist, 4.2 * dt); P.x += (dx / dist) * sp; P.z += (dz / dist) * sp; if (Math.abs(dx) > 0.02) P.face = dx > 0 ? 1 : -1; P.walk += dt * 10; }
      else ring.visible = false;
    }
    me.position.set(P.x, P.moving && !o.reduceMotion ? Math.abs(Math.sin(P.walk)) * 0.08 : 0, P.z);
    me.material.rotation = 0; meTex.repeat.x = P.face; meTex.offset.x = P.face < 0 ? 1 : 0;
    shadow.position.set(P.x, 0.015, P.z);
    ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    // what you're standing at
    let s: HallSpot | null = null;
    if (!P.moving || Math.hypot(P.tx - P.x, P.tz - P.z) < 0.3) {
      let best = 1.25;
      for (const c of cabs.values()) { const d = Math.hypot(c.spot.x - P.x, c.spot.z - P.z); if (d < best) { best = d; s = { kind: 'machine', id: c.m.id }; } }
      if (Math.hypot(prizeSpot.x - P.x, prizeSpot.z - P.z) < 1.6) s = { kind: 'prizes' };
      if (Math.hypot(bonusSpot.x - P.x, bonusSpot.z - P.z) < 1.3) s = { kind: 'bonus' };
    }
    const nk = nearKey(s);
    if (nk !== near && !zoom.on) { near = nk; o.onNear?.(s); }
    // camera
    zoom.k += ((zoom.on ? 1 : 0) - zoom.k) * Math.min(1, dt * 3.2);
    if (zoom.on && zoom.k > 0.97 && zoom.resolve) { const r = zoom.resolve; zoom.resolve = null; r(); }
    // look the way you'd face: at the side wall's cabinets when you're over by one, else up the room
    const wide = camera.aspect < 1 ? 1 + (1 / camera.aspect - 1) * 0.45 : 1;
    const side = Math.abs(P.x) > 2.6 ? Math.sign(P.x) : 0;
    lookDir.lerp(tmp2.set(side * 0.95, 0, side ? -0.3 : -1).normalize(), Math.min(1, dt * 2.2)).normalize();
    const follow = tmp.copy(lookDir).multiplyScalar(-6.2 * wide).add(tmp3.set(P.x, 5.2 * wide, P.z));
    follow.x = Math.max(-W / 2 + 1.2, Math.min(W / 2 - 1.2, follow.x)); follow.z = Math.min(D / 2 + 6, follow.z);
    if (zoom.cab) {
      const c = zoom.cab;
      const at = c.screenPos.clone().addScaledVector(c.screenN, 0.95);
      const k = zoom.k * zoom.k * (3 - 2 * zoom.k);
      camPos.lerpVectors(follow, at, k);
      camLook.lerpVectors(tmp3.set(P.x, 1, P.z).addScaledVector(lookDir, 2.5), c.screenPos, k);
      if (!zoom.on && zoom.k < 0.02) zoom.cab = null;
    } else {
      camPos.lerp(follow, Math.min(1, dt * 4)); camLook.lerp(tmp3.set(P.x, 1, P.z).addScaledVector(lookDir, 2.5), Math.min(1, dt * 5));
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
    // cabinet screens (nearby ones redraw more often)
    for (const c of cabs.values()) {
      const close = Math.hypot(c.spot.x - P.x, c.spot.z - P.z) < 6;
      if (frame % (close ? 3 : 10) === 0) { attract(c.m.id, c.screen.getContext('2d')!, t, c.m.color, c.m.locked); c.tex.needsUpdate = true; }
      if (!o.reduceMotion && !c.m.locked) (c.marquee.material as THREE.MeshBasicMaterial).color.setScalar(0.85 + 0.15 * Math.sin(t * 5 + c.g.position.z));
      if (c.label) c.label.position.y = 2.95 + Math.sin(t * 2) * 0.05;
    }
    for (const r of regulars) r.s.position.y = o.reduceMotion ? 0 : Math.abs(Math.sin(t * 3 + r.bob)) * 0.04;
    // lights
    if (!o.reduceMotion) {
      pl.forEach((l, i) => { l.intensity = (phone ? 20 : 24) * (0.85 + 0.15 * Math.sin(t * 1.3 + i * 1.7)); });
      if (lights === 'chase' || lights === 'disco' || lights === 'lasers') { const on = Math.floor(t * 12); bulbs.forEach((b, i) => { b.material = (i + on) % 4 === 0 ? bulbOn : bulbOff; }); }
      if (lights === 'disco') { disco.rotation.y = t * 0.8; spots.forEach((sp, i) => { sp.target.position.set(Math.sin(t * 0.9 + i * 2) * 6, 0, Math.cos(t * 0.7 + i * 2) * 8); }); }
      if (lights === 'lasers') lasers.children.forEach((b, i) => { b.rotation.set(0, Math.sin(t * 0.8 + i) * 0.9, Math.PI / 2 + Math.sin(t * 1.3 + i * 1.7) * 0.35); });
      if (neon === NEON.rainbow) { const h = (t * 0.08) % 1; trimA.color.setHSL(h, 1, 0.55); trimA.emissive.setHSL(h, 1, 0.55); trimB.color.setHSL((h + 0.5) % 1, 1, 0.55); trimB.emissive.setHSL((h + 0.5) % 1, 1, 0.55); }
      bonusTicket.visible = bonusReady; bonusTicket.position.y = 2.6 + Math.sin(t * 3) * 0.08;
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  const setDecor = (d: Decor, name: string) => {
    neon = NEON[d.neon] ?? NEON.pink;
    trimA.color.set(neon[0]); trimA.emissive.set(neon[0]); trimB.color.set(neon[1]); trimB.emissive.set(neon[1]);
    floorMat.map?.dispose();
    const tex = floorTex(d.floor, neon); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(W / 6, D / 6);
    floorMat.map = tex; floorMat.needsUpdate = true;
    signMat.map?.dispose(); signMat.map = labelTex(name.slice(0, 28) || 'Arcade', neon[0]); signMat.needsUpdate = true;
    lights = d.lights;
    disco.visible = lights === 'disco'; lasers.visible = lights === 'lasers' && !phone;
    for (const sp of spots) { scene.remove(sp); scene.remove(sp.target); } spots.length = 0;
    if (lights === 'disco') for (let i = 0; i < (phone ? 2 : 3); i++) { const sp = new THREE.SpotLight(['#FF3D9A', '#22E3FF', '#FFE14D'][i], 30, 18, 0.35, 0.6, 1.4); sp.position.set(0, 4.3, 0); scene.add(sp); scene.add(sp.target); spots.push(sp); }
    if (lights === 'steady') bulbs.forEach((b) => { b.material = bulbOn; });
  };

  return {
    setMachines, setShelf, setDecor, setRegulars,
    setBonus(ready: boolean) { bonusReady = ready; },
    /** glide the camera up to a cabinet's screen; resolves when it fills the view */
    zoomIn(id: string) { const c = cabs.get(id); if (!c) return Promise.resolve(); zoom.cab = c; zoom.on = true; P.tx = P.x = c.spot.x; P.tz = P.z = c.spot.z; return new Promise<void>((res) => { zoom.resolve = res; }); },
    zoomOut() { zoom.on = false; zoom.resolve = null; near = null; },
    /** where a cabinet's screen is on the page right now (to line the game up with it) */
    screenRect(id: string) {
      const c = cabs.get(id); if (!c) return null;
      const r = o.canvas.getBoundingClientRect();
      const q = c.g.quaternion;
      const pts = [[-0.49, -0.37], [0.49, -0.37], [-0.49, 0.37], [0.49, 0.37]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.12).applyQuaternion(q).add(c.screenPos).project(camera));
      const xs = pts.map((p) => r.left + ((p.x + 1) / 2) * r.width), ys = pts.map((p) => r.top + ((1 - p.y) / 2) * r.height);
      return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    },
    walkTo(s: HallSpot) { if (s.kind === 'machine') { const c = cabs.get(s.id); if (c) go(c.spot.x, c.spot.z); } else if (s.kind === 'prizes') go(prizeSpot.x, prizeSpot.z); else go(bonusSpot.x, bonusSpot.z); },
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ P, near, cabs: [...cabs.keys()], spots: Object.fromEntries([...cabs.values()].map((c) => [c.m.id, [c.spot.x, c.spot.z]])), prize: [prizeSpot.x, prizeSpot.z], bonus: [bonusSpot.x, bonusSpot.z], zoom: zoom.k }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); o.canvas.removeEventListener('pointerup', pu);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      setRegulars([]); setShelf([]);
      floorMat.map?.dispose(); signMat.map?.dispose();
      for (const x of bag) x.dispose();
      renderer.dispose();
    },
  };
}
export type HallScene = ReturnType<typeof createHall>;
