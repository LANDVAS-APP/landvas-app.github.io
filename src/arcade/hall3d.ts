// The arcade hall in 3D. Cabinets stand in rows across the room, facing you, with aisles between them; the
// prize counter, the jukebox and the ticket machine are along the back wall. Every game has its own machine:
// a tall LED tower for Ink Tower, a ring of bulbs for Prism Ring, a lane for Ring Roll, a caged hoop for Hoop
// Shot, a pop-up table for Bop-a-Bot, a glass box full of plushies for the Claw Crane (and a classic upright for
// anything else).
// Walking: drag anywhere to walk that way (like a joystick), or tap the floor or a machine to walk there (round
// the rows, through the gaps). Step up to a machine and the page offers "Play"; then the camera glides in until
// its play area fills the view.
import * as THREE from 'three';
import { adaptiveDpr, framePacer, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';
import { buildCarnival, CARNIVAL_BOUNDS, CARNIVAL_Z, type Carnival } from './carnival3d';

export type HallMachine = { id: string; name: string; color: string; emoji: string; level: number; locked: boolean; lockLabel?: string };
export type HallSpot = { kind: 'machine'; id: string } | { kind: 'prizes' } | { kind: 'bonus' } | { kind: 'jukebox' } | { kind: 'door' } | { kind: 'carnival'; id: string };
export type HallOpts = {
  canvas: HTMLCanvasElement; explorerUrl: string; seed: number; reduceMotion?: boolean;
  /** the shared Live Arena room: pods for the live games, no prize counter / ticket machine / jukebox */ arena?: boolean;
  /** you're standing at something you can use (or walked away: null) */ onNear?(s: HallSpot | null): void;
  /** an Arcade Estate: the front door opens onto a carnival */ carnival?: boolean;
};
export type Decor = { floor: string; neon: string; lights: string };

const NEON: Record<string, string[]> = {
  pink: ['#FF3D9A', '#FF7AC8'], cyan: ['#22E3FF', '#7FF3FF'], lime: ['#B6FF3D', '#E2FF8A'], violet: ['#8B5CFF', '#C3A8FF'],
  sunset: ['#FF7A3D', '#FF3D9A'], rainbow: ['#FF3D6E', '#22E3FF'],
};
const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const W = 16, D = 26; // x: -8..8, z: -13..13 (the door's at +z)
const ROWS = [-7, -2.4, 2.2, 6.8];
const COLS = [-5.25, -1.75, 1.75, 5.25];
const GAPS = [-7.1, -3.5, 0, 3.5, 7.1];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function floorTex(kind: string, neon: string[]) {
  return canvasTex(512, 512, (g) => {
    const S = 512;
    if (kind === 'checker') { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#1A1A26' : '#E9E6F2'; g.fillRect(x * 64, y * 64, 64, 64); } return; }
    if (kind === 'gold') { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const gr = g.createLinearGradient(x * 64, y * 64, x * 64 + 64, y * 64 + 64); gr.addColorStop(0, '#FFE58A'); gr.addColorStop(1, (x + y) % 2 ? '#B8860B' : '#E0A82E'); g.fillStyle = gr; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); } return; }
    if (kind === 'grid') { g.fillStyle = '#07071A'; g.fillRect(0, 0, S, S); g.strokeStyle = neon[0]; g.lineWidth = 3; g.shadowColor = neon[0]; g.shadowBlur = 10; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, S); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(S, i * 64); g.stroke(); } return; }
    if (kind === 'galaxy') {
      const gr = g.createRadialGradient(256, 256, 20, 256, 256, 360); gr.addColorStop(0, '#5B2BC9'); gr.addColorStop(0.5, '#1C0F4A'); gr.addColorStop(1, '#05051A'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
      g.strokeStyle = 'rgba(255,61,154,0.35)'; g.lineWidth = 18; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(256, 256, 80 + i * 70, i, i + 2.4); g.stroke(); }
      return;
    }
    g.fillStyle = '#0E0B26'; g.fillRect(0, 0, S, S);
    const cols = ['#FF3D9A', '#22E3FF', '#FFE14D', '#8B5CFF', '#3DDC97'];
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = cols[i % cols.length]; g.fillStyle = cols[(i + 2) % cols.length]; g.lineWidth = 4;
      const x = r() * S, y = r() * S, k = i % 4;
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
function attract(id: string, g: CanvasRenderingContext2D, t: number, color: string, locked: boolean, emoji: string) {
  const Wd = 256, H = 192;
  g.fillStyle = '#04040C'; g.fillRect(0, 0, Wd, H);
  if (locked) { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, Wd, 2); g.font = '900 30px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillStyle = '#666'; g.fillText('OUT OF ORDER', Wd / 2, H / 2); return; }
  if (id.startsWith('live:')) {
    // a live pod: the game's emoji, LIVE blinking, little players darting about
    const gr = g.createRadialGradient(Wd / 2, H / 2, 10, Wd / 2, H / 2, 160); gr.addColorStop(0, color + '55'); gr.addColorStop(1, '#04040C'); g.fillStyle = gr; g.fillRect(0, 0, Wd, H);
    const cols = ['#FF3D9A', '#22E3FF', '#B6FF3D', '#FFB13D'];
    for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.shadowColor = cols[i]; g.shadowBlur = 10; g.beginPath(); g.arc(Wd / 2 + Math.sin(t * (1.3 + i * 0.4) + i * 2) * 90, H / 2 + 20 + Math.cos(t * (1.1 + i * 0.3) + i) * 40, 9, 0, Math.PI * 2); g.fill(); } g.shadowBlur = 0;
    g.font = '58px system-ui, "Apple Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, Wd / 2, H / 2 + 6 + Math.sin(t * 3) * 6);
    g.font = '900 22px ui-rounded, system-ui'; g.fillStyle = Math.sin(t * 5) > 0 ? '#FF3D3D' : '#fff'; g.fillText('● LIVE', Wd / 2, H - 20); g.textBaseline = 'alphabetic';
    return;
  }
  if (id === 'stacker') {
    // the classic stacker: rows of lit squares climbing the screen
    const lv = Math.floor(t * 2) % 15;
    for (let r = 0; r < 15; r++) for (let c = 0; c < 7; c++) {
      const on = r < lv ? c >= 2 && c <= 4 - Math.floor(r / 6) + 0 : r === lv ? Math.abs(c - (3 + Math.round(Math.sin(t * 5) * 3))) <= 1 : false;
      g.fillStyle = on ? (r >= 10 ? '#FFE14D' : '#FF3D9A') : 'rgba(255,61,154,0.08)'; g.fillRect(70 + c * 17, H - 14 - r * 12, 14, 10);
    }
    g.fillStyle = '#C9D3E6'; g.font = '900 11px ui-monospace'; g.fillText('SILVER', 20, H - 14 - 10 * 12); g.fillStyle = '#FFE14D'; g.fillText('GOLD', 20, H - 14 - 14 * 12);
  } else if (id === 'maze') {
    // an ink blob chased round a paint-stroke maze by spiky smudges
    g.lineCap = 'round'; g.strokeStyle = '#7B5CFF'; g.lineWidth = 10; g.strokeRect(24, 30, Wd - 48, H - 60); g.strokeStyle = '#22C7B5'; g.strokeRect(70, 74, Wd - 140, H - 148);
    const k = (t * 0.25) % 1, px = 46 + k * (Wd - 92);
    for (let x = 46; x < Wd - 46; x += 16) if (x > px) { g.fillStyle = ['#FF4D6D', '#FFE14D', '#3DDC97', '#22E3FF'][(x / 16) % 4 | 0]; g.beginPath(); g.arc(x, 52, 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#7B5CFF'; g.beginPath(); for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.lineTo(px + Math.cos(a) * 12 * (1 + Math.sin(a * 3 + t * 9) * 0.08), 52 + Math.sin(a) * 12); } g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px + 4, 48, 3.5, 0, Math.PI * 2); g.arc(px + 4, 57, 3.5, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 3; i++) { const sx = px - 40 - i * 28; g.fillStyle = ['#3DDC97', '#FFB13D', '#B6FF3D'][i]; g.beginPath(); for (let j = 0; j <= 14; j++) { const a = (j / 14) * Math.PI * 2 + t * 2, r = j % 2 ? 7 : 11; g.lineTo(sx + Math.cos(a) * r, 52 + Math.sin(a) * r); } g.fill(); }
  } else if (id === 'blaster') {
    const cols = ['#FF3D9A', '#B6FF3D', '#22E3FF'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const x = 46 + c * 32 + Math.sin(t * 2) * 14, y = 34 + r * 24, sides = [4, 6, 3][r];
      g.strokeStyle = cols[r]; g.lineWidth = 2; g.beginPath();
      for (let k = 0; k <= sides; k++) { const a = t + (k / sides) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); }
      g.stroke(); g.fillStyle = '#fff'; g.fillRect(x - 2, y - 2, 4, 4);
    }
    const sx = Wd / 2 + Math.sin(t * 1.7) * 70; g.fillStyle = '#3DDC97'; g.beginPath(); g.moveTo(sx, H - 34); g.lineTo(sx + 14, H - 16); g.lineTo(sx - 14, H - 16); g.fill();
    g.fillStyle = '#FFE14D'; for (let i = 0; i < 4; i++) g.fillRect(sx - 1, H - 40 - ((t * 200 + i * 40) % 120), 3, 8);
  } else if (id === 'snake') {
    for (let i = 0; i < 14; i++) { const a = t * 2 - i * 0.25; g.fillStyle = `hsl(${(140 + i * 8) % 360} 90% 55%)`; g.fillRect(Wd / 2 + Math.cos(a) * 70 - 6, H / 2 + Math.sin(a * 1.5) * 45 - 6, 12, 12); }
    g.fillStyle = '#FF3D9A'; g.beginPath(); g.arc(Wd / 2 + 50, H / 2 - 20, 6, 0, Math.PI * 2); g.fill();
  } else if (id === 'rhythm') {
    const cols = ['#FF3D9A', '#22E3FF', '#B6FF3D', '#FFB13D'];
    for (let l = 0; l < 4; l++) { g.strokeStyle = cols[l]; g.globalAlpha = 0.4; g.strokeRect(48 + l * 42, 0, 38, H); g.globalAlpha = 1; for (let n = 0; n < 3; n++) { const y = ((t * 90 + n * 70 + l * 37) % (H + 20)) - 10; g.fillStyle = cols[l]; g.fillRect(52 + l * 42, y, 30, 10); } g.beginPath(); g.arc(67 + l * 42, H - 22, 12, 0, Math.PI * 2); g.stroke(); }
  } else if (id === 'fruit' || id === 'pusher' || id === 'plinko' || id === 'racer' || id === 'pinball' || id === 'airhockey') {
    const em = { fruit: ['🍉', '🍊', '🍎', '🍇'], pusher: ['🪙', '🪙', '💎', '🪙'], plinko: ['🔴', '🟡', '🔵', '🟢'], racer: ['🏎️', '🚗', '⚡', '🚙'], pinball: ['⚪', '✨', '🎯', '⚪'], airhockey: ['🏒', '⚪', '🥅', '🏒'] }[id]!;
    g.font = '40px system-ui, "Apple Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    em.forEach((e, i) => { const a = t * 1.3 + i * 1.57; g.fillText(e, Wd / 2 + Math.cos(a) * 70, H / 2 + Math.sin(a * (id === 'fruit' ? 2 : 1)) * 40); });
    g.strokeStyle = color; g.lineWidth = 4; g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4); g.strokeRect(8, 8, Wd - 16, H - 16); g.globalAlpha = 1;
  } else {
    // a generic attract screen: the game's emoji bouncing over a starfield, and its colour pulsing
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + (i % 3) * 0.2})`; g.fillRect((i * 53 + t * 40 * (1 + (i % 3))) % Wd, (i * 37) % H, 2, 2); }
    g.font = '64px system-ui, "Apple Color Emoji"'; g.textAlign = 'center'; g.fillText(emoji, Wd / 2, H / 2 + 10 + Math.sin(t * 3) * 12);
    g.strokeStyle = color; g.lineWidth = 4; g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4); g.strokeRect(8, 8, Wd - 16, H - 16); g.globalAlpha = 1;
  }
  g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, Wd, 1);
  if (Math.sin(t * 4) > 0) { g.font = '900 16px ui-monospace, monospace'; g.textAlign = 'center'; g.fillStyle = color; g.fillText('FREE PLAY', Wd / 2, 20); }
}

export function createHall(o: HallOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const fps = framePacer({ ambient: true });
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d), undefined, fps);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05040F'); scene.fog = new THREE.Fog('#05040F', 22, 52);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 120);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...p }));
  const glow = (color: string, k = 1.8) => T(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 }));
  const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(T(new THREE.BoxGeometry(w, h, d)), m);
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 16) => new THREE.Mesh(T(new THREE.CylinderGeometry(rt, rb, h, seg)), m);

  scene.add(new THREE.HemisphereLight('#8A7CFF', '#1A1030', 1.0));
  scene.add(new THREE.AmbientLight('#ffffff', 0.28));
  const pl: THREE.PointLight[] = [];
  for (const [x, z, c] of [[-4, -8, '#FF3D9A'], [4, -8, '#22E3FF'], [-4, 4, '#8B5CFF'], [4, 4, '#FFB13D']] as const) {
    const l = new THREE.PointLight(c, phone ? 22 : 26, 22, 1.5); l.position.set(x, 4.4, z); scene.add(l); pl.push(l);
  }

  // ---- the room ----------------------------------------------------------------------------------------------
  const floorMat = std('#ffffff', { roughness: 0.85 });
  // the floor runs out past the door too, so there's never a black gap at the bottom of the screen
  const FL = D + 14;
  const floor = new THREE.Mesh(T(new THREE.PlaneGeometry(W, FL)), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.z = 7; scene.add(floor);
  const door = new THREE.Mesh(T(new THREE.PlaneGeometry(W, 14)), T(new THREE.MeshBasicMaterial({ color: '#05040F', transparent: true, opacity: 0.55, depthWrite: false })));
  door.rotation.x = -Math.PI / 2; door.position.set(0, 0.01, D / 2 + 7); scene.add(door);
  const wallTex = T(canvasTex(512, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#120C2E'); gr.addColorStop(1, '#2B1F5C'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    const r = rng(11); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`; g.fillRect(r() * 512, r() * 150, 2, 2); }
    for (const [y, c] of [[190, '#FF3D9A'], [204, '#22E3FF'], [218, '#FFE14D']] as const) { g.fillStyle = c; g.globalAlpha = 0.55; g.fillRect(0, y, 512, 6); }
    g.globalAlpha = 1;
  }));
  wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set(3, 1);
  const wallMat = std('#ffffff', { roughness: 0.9, map: wallTex, emissive: '#ffffff', emissiveMap: wallTex, emissiveIntensity: 0.35 });
  const back = box(W, 5, 0.3, wallMat); back.position.set(0, 2.5, -D / 2); scene.add(back);
  for (const s of [-1, 1]) { const w = box(0.3, 5, D, wallMat); w.position.set(s * W / 2, 2.5, 0); scene.add(w); }
  const ceil = new THREE.Mesh(T(new THREE.PlaneGeometry(W, D)), std('#0A0818')); ceil.rotation.x = Math.PI / 2; ceil.position.y = 5; scene.add(ceil);
  let neon = NEON.pink;
  const trimA = glow(neon[0], 2.2), trimB = glow(neon[1], 2.2);
  for (const [w, d, x, z, m] of [[W, 0.06, 0, -D / 2 + 0.17, trimA], [0.06, D, -W / 2 + 0.17, 0, trimB], [0.06, D, W / 2 - 0.17, 0, trimB]] as const) {
    for (const y of [0.12, 4.6]) { const t = box(w, 0.06, d, m); t.position.set(x, y, z); scene.add(t); }
  }
  // neon stripes along the aisles
  for (const z of ROWS) { const s = box(W - 1, 0.02, 0.06, trimB); s.position.set(0, 0.012, z + 2.15); scene.add(s); }
  const signMat = T(new THREE.MeshBasicMaterial({ map: labelTex('Arcade', neon[0]), toneMapped: false }));
  const sign = new THREE.Mesh(T(new THREE.PlaneGeometry(6, 1.5)), signMat); sign.position.set(0, 4.05, -D / 2 + 0.2); scene.add(sign);

  // ---- light shows -------------------------------------------------------------------------------------------
  const bulbs: THREE.Mesh[] = [];
  const bulbGeo = T(new THREE.SphereGeometry(0.07, 8, 6));
  const bulbOn = glow('#FFE9A8', 2.5), bulbOff = std('#3A3020');
  for (let i = 0; i < 44; i++) { const b = new THREE.Mesh(bulbGeo, bulbOff); b.position.set(-W / 2 + 0.25 + (i / 44) * (W - 0.5), 4.85, -D / 2 + 0.3); scene.add(b); bulbs.push(b); }
  const disco = new THREE.Mesh(T(new THREE.IcosahedronGeometry(0.55, 2)), T(new THREE.MeshStandardMaterial({ color: '#E0E6F5', metalness: 1, roughness: 0.15, flatShading: true, emissive: '#5560A0', emissiveIntensity: 0.4 })));
  disco.position.set(0, 4.3, -8.5); scene.add(disco);
  const lasers = new THREE.Group(); scene.add(lasers);
  for (let i = 0; i < 6; i++) {
    const beam = new THREE.Mesh(T(new THREE.CylinderGeometry(0.02, 0.02, 26, 4, 1, true)), T(new THREE.MeshBasicMaterial({ color: i % 2 ? '#22E3FF' : '#FF3D9A', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
    beam.position.set(0, 4.6, -D / 2 + 0.5); beam.rotation.z = Math.PI / 2; beam.geometry.translate(0, 13, 0); lasers.add(beam);
  }
  const spots: THREE.SpotLight[] = [];
  let lights = 'steady';

  // ---- machines ---------------------------------------------------------------------------------------------
  type Cab = { m: HallMachine; g: THREE.Group; screen: HTMLCanvasElement | null; tex: THREE.CanvasTexture | null; spot: THREE.Vector3; focus: THREE.Vector3; focusN: THREE.Vector3; focusDist: number;
    marquee: THREE.Mesh | null; parts: THREE.Object3D[]; label: THREE.Sprite | null; hw: number; hd: number; fade: number };
  const setFade = (c: Cab, k: number) => {
    c.g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
        if (mm === bulbOn || mm === bulbOff) continue;
        if (mm.userData.o == null) mm.userData.o = { t: mm.transparent, op: mm.opacity, dw: mm.depthWrite };
        mm.transparent = k < 0.99 || mm.userData.o.t; mm.opacity = mm.userData.o.op * k; mm.depthWrite = k > 0.99 && mm.userData.o.dw;
      }
    });
  };
  const cabs = new Map<string, Cab>();
  const slots: { x: number; z: number }[] = [];
  // the middle rows fill first (closest to where you come in, without leaving the far end empty)
  for (const z of [ROWS[1], ROWS[2], ROWS[0], ROWS[3]]) for (const x of COLS) slots.push({ x, z });
  const marqueeOn = (g: THREE.Group, m: HallMachine, y: number, w = 1.3) => {
    const mq = new THREE.Mesh(T(new THREE.PlaneGeometry(w - 0.04, 0.36)), T(new THREE.MeshBasicMaterial({ map: T(labelTex(m.name, m.locked ? '#555' : m.color)), toneMapped: false })));
    mq.position.set(0, y, 0.33); g.add(mq);
    const hb = box(w, 0.42, 0.3, std('#1A1830')); hb.position.set(0, y, 0.16); g.add(hb);
    return mq;
  };
  const buildCab = (m: HallMachine, slot: { x: number; z: number }): Cab => {
    const g = new THREE.Group(); g.position.set(slot.x, 0, slot.z);
    const c0 = m.locked ? '#3A3A46' : m.color;
    const body = std(m.locked ? '#2A2A34' : '#22203E', { roughness: 0.45, metalness: 0.25, emissive: m.locked ? '#000' : m.color, emissiveIntensity: 0.05 });
    const side = std(c0, { roughness: 0.35, emissive: m.locked ? '#000' : m.color, emissiveIntensity: 0.3 });
    const parts: THREE.Object3D[] = [];
    let screen: HTMLCanvasElement | null = null, tex: THREE.CanvasTexture | null = null, marquee: THREE.Mesh | null = null;
    let focus = new THREE.Vector3(0, 1.6, 0.31), focusN = new THREE.Vector3(0, -0.12, 1), focusDist = 0.95, hw = 0.7, hd = 0.55;
    const upright = (h = 1.2, sy = 1.6) => {
      const base = box(1.3, 1.0, 1.0, body); base.position.set(0, 0.5, 0); g.add(base);
      const top = box(1.3, h, 0.8, body); top.position.set(0, 1.0 + h / 2, -0.1); g.add(top);
      for (const s of [-1, 1]) { const p = box(0.06, 1.1 + h + 0.3, 1.05, side); p.position.set(s * 0.68, (1.1 + h + 0.3) / 2, -0.02); g.add(p); }
      const panel = box(1.3, 0.12, 0.55, std('#0E0D1A')); panel.position.set(0, 1.02, 0.42); panel.rotation.x = 0.25; g.add(panel);
      if (!m.locked) {
        const knob = new THREE.Mesh(T(new THREE.SphereGeometry(0.055, 12, 8)), glow('#FF3D3D', 0.6)); knob.position.set(-0.3, 1.25, 0.45); g.add(knob);
        for (let i = 0; i < 3; i++) { const b = cyl(0.05, 0.05, 0.04, glow(['#22E3FF', '#FFE14D', '#3DDC97'][i], 0.9)); b.position.set(0.05 + i * 0.16, 1.12, 0.47 - i * 0.02); b.rotation.x = 0.25; g.add(b); }
      }
      screen = document.createElement('canvas'); screen.width = 256; screen.height = 192;
      tex = T(new THREE.CanvasTexture(screen)); tex.colorSpace = THREE.SRGBColorSpace;
      const sc = new THREE.Mesh(T(new THREE.PlaneGeometry(0.98, 0.74)), T(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
      sc.position.set(0, sy, 0.31); sc.rotation.x = -0.12; g.add(sc);
      marquee = marqueeOn(g, m, 1.0 + h + 0.22);
      focus = new THREE.Vector3(0, sy, 0.31);
    };
    switch (m.locked ? 'upright' : m.id) {
      case 'stacker': {
        // a tall tower: the LED playfield all the way up, the SILVER and GOLD lines marked on it
        const base = box(1.4, 1.0, 1.0, body); base.position.set(0, 0.5, 0); g.add(base);
        const tower = box(1.4, 2.6, 0.7, body); tower.position.set(0, 2.3, -0.15); g.add(tower);
        for (const s of [-1, 1]) { const p = box(0.08, 3.7, 1.05, side); p.position.set(s * 0.74, 1.85, -0.02); g.add(p); }
        screen = document.createElement('canvas'); screen.width = 256; screen.height = 192;
        tex = T(new THREE.CanvasTexture(screen)); tex.colorSpace = THREE.SRGBColorSpace;
        const sc = new THREE.Mesh(T(new THREE.PlaneGeometry(1.1, 2.2)), T(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))); sc.position.set(0, 2.3, 0.21); g.add(sc);
        const btn = cyl(0.22, 0.24, 0.12, glow('#FF3D9A', 1.4), 24); btn.position.set(0, 1.07, 0.3); g.add(btn); parts.push(btn);
        marquee = marqueeOn(g, m, 3.85, 1.4);
        focus = new THREE.Vector3(0, 2.2, 0.21); focusN = new THREE.Vector3(0, 0, 1); focusDist = 1.9;
        break;
      }
      case 'cyclone': {
        // a big round face with a ring of bulbs (the jackpot lamp at the top) and a giant STOP button
        const base = box(1.6, 1.0, 1.0, body); base.position.set(0, 0.5, 0); g.add(base);
        const face = cyl(0.95, 0.95, 0.3, body, 40); face.rotation.x = Math.PI / 2; face.position.set(0, 2.05, -0.1); g.add(face);
        const rim = new THREE.Mesh(T(new THREE.TorusGeometry(0.95, 0.06, 8, 40)), side); rim.position.set(0, 2.05, 0.05); g.add(rim);
        const ring = new THREE.Group(); ring.position.set(0, 2.05, 0.08); g.add(ring);
        for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2 + Math.PI / 2; const b = new THREE.Mesh(T(new THREE.SphereGeometry(i === 0 ? 0.08 : 0.05, 10, 8)), i === 0 ? glow('#FFD84D', 2) : std('#555')); b.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0); ring.add(b); }
        parts.push(ring);
        const btn = cyl(0.2, 0.22, 0.12, glow('#FF3D3D', 1.2), 24); btn.position.set(0, 1.07, 0.3); g.add(btn);
        const pole = box(0.12, 0.9, 0.12, body); pole.position.set(0, 0.95, -0.1); g.add(pole);
        marquee = marqueeOn(g, m, 3.25, 1.6);
        focus = new THREE.Vector3(0, 2.05, 0.08); focusN = new THREE.Vector3(0, 0, 1); focusDist = 1.6; hw = 0.8;
        break;
      }
      case 'skeeball': {
        // a lane running back from you, up a ramp to the rings, with a score screen over them
        const lane = box(1.1, 0.12, 2.4, std('#C98A4E', { roughness: 0.4 })); lane.position.set(0, 0.85, -0.6); lane.rotation.x = -0.18; g.add(lane);
        for (const s of [-1, 1]) { const r = box(0.08, 0.35, 2.6, side); r.position.set(s * 0.6, 0.95, -0.6); r.rotation.x = -0.18; g.add(r); }
        const legs = box(1.2, 0.8, 2.4, body); legs.position.set(0, 0.4, -0.6); g.add(legs);
        const tgt = new THREE.Mesh(T(new THREE.CircleGeometry(0.45, 32)), T(new THREE.MeshBasicMaterial({ map: T(canvasTex(128, 128, (c) => {
          for (let i = 5; i >= 1; i--) { c.fillStyle = ['#000', '#FF3D9A', '#B57BFF', '#22E3FF', '#3DDC97', '#2E1F55'][i]; c.beginPath(); c.arc(64, 64, i * 12, 0, Math.PI * 2); c.fill(); }
        })), toneMapped: false })));
        tgt.position.set(0, 1.55, -1.85); tgt.rotation.x = -0.55; g.add(tgt);
        const backb = box(1.2, 1.4, 0.2, body); backb.position.set(0, 1.6, -2.0); g.add(backb);
        for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(T(new THREE.SphereGeometry(0.09, 12, 10)), std('#F4E6D0')); b.position.set(-0.25 + i * 0.25, 0.98, 0.45); g.add(b); }
        marquee = marqueeOn(g, m, 2.55, 1.2); marquee.position.z = -1.82; (g.children[g.children.length - 1] as THREE.Mesh).position.z = -1.98;
        focus = new THREE.Vector3(0, 1.3, -0.9); focusN = new THREE.Vector3(0, 0.55, 1).normalize(); focusDist = 1.9; hd = 1.4;
        break;
      }
      case 'hoops': {
        // a cage of netting with the backboard and hoop at the back, and balls in the tray
        const tray = box(1.5, 0.9, 0.7, body); tray.position.set(0, 0.45, 0.1); g.add(tray);
        const floorC = box(1.5, 0.06, 2.2, std('#3A2412')); floorC.position.set(0, 0.92, -0.9); g.add(floorC);
        const net = T(new THREE.MeshBasicMaterial({ color: m.color, wireframe: true, transparent: true, opacity: 0.35 }));
        for (const s of [-1, 1]) { const n = new THREE.Mesh(T(new THREE.PlaneGeometry(2.2, 2.2, 8, 8)), net); n.rotation.y = Math.PI / 2; n.position.set(s * 0.75, 2.0, -0.9); g.add(n); }
        const top = new THREE.Mesh(T(new THREE.PlaneGeometry(1.5, 2.2, 6, 8)), net); top.rotation.x = Math.PI / 2; top.position.set(0, 3.1, -0.9); g.add(top);
        const bb = box(1.1, 0.75, 0.05, std('#E8F4FF', { emissive: '#ffffff', emissiveIntensity: 0.2 })); bb.position.set(0, 2.5, -1.95); g.add(bb);
        const hoop = new THREE.Mesh(T(new THREE.TorusGeometry(0.2, 0.02, 8, 24)), glow('#FF5A1F', 0.8)); hoop.rotation.x = Math.PI / 2; hoop.position.set(0, 2.2, -1.72); g.add(hoop); parts.push(hoop);
        for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(T(new THREE.SphereGeometry(0.11, 14, 10)), std('#FF7A1F')); b.position.set(-0.45 + i * 0.3, 0.98, 0.1); g.add(b); }
        for (const s of [-1, 1]) { const p = box(0.07, 3.2, 0.07, side); p.position.set(s * 0.75, 1.6, 0.05); g.add(p); }
        marquee = marqueeOn(g, m, 3.35, 1.5);
        focus = new THREE.Vector3(0, 2.0, -1.2); focusN = new THREE.Vector3(0, 0.15, 1).normalize(); focusDist = 2.3; hw = 0.8; hd = 1.3;
        break;
      }
      case 'bop': {
        // a waist-high table with nine holes and robots bobbing up out of them
        const tb = box(1.5, 0.95, 1.3, body); tb.position.set(0, 0.47, -0.2); g.add(tb);
        const top = box(1.55, 0.06, 1.35, std(c0, { emissive: m.color, emissiveIntensity: 0.25 })); top.position.set(0, 0.97, -0.2); g.add(top);
        const bots = new THREE.Group(); bots.position.set(0, 0.97, -0.2); g.add(bots);
        for (let i = 0; i < 9; i++) {
          const x = ((i % 3) - 1) * 0.42, z = (Math.floor(i / 3) - 1) * 0.36;
          const hole = new THREE.Mesh(T(new THREE.CircleGeometry(0.13, 18)), std('#05050A')); hole.rotation.x = -Math.PI / 2; hole.position.set(x, 0.035, z); bots.add(hole);
          const bot = new THREE.Mesh(T(new THREE.SphereGeometry(0.1, 12, 8)), std(i % 4 === 0 ? '#FFD84D' : '#9AA8BE', { metalness: 0.6, roughness: 0.3 })); bot.position.set(x, -0.05, z); bot.userData.i = i; bots.add(bot);
        }
        parts.push(bots);
        const mallet = cyl(0.03, 0.03, 0.5, std('#8A5A2E')); mallet.position.set(0.85, 1.15, 0.2); mallet.rotation.z = 0.5; g.add(mallet);
        const head = cyl(0.09, 0.09, 0.2, glow(m.color, 0.6)); head.rotation.z = Math.PI / 2; head.position.set(0.98, 1.38, 0.2); g.add(head);
        const pole = box(0.08, 2.0, 0.08, side); pole.position.set(0, 1.9, -0.9); g.add(pole);
        marquee = marqueeOn(g, m, 2.95, 1.5); marquee.position.z = -0.72; (g.children[g.children.length - 1] as THREE.Mesh).position.z = -0.88;
        focus = new THREE.Vector3(0, 1.0, -0.2); focusN = new THREE.Vector3(0, 1.4, 1).normalize(); focusDist = 1.6; hw = 0.8; hd = 0.9;
        break;
      }
      case 'claw': {
        // a glass box full of plushies, a claw hanging in it, lights round the edges
        const base = box(1.4, 1.0, 1.2, body); base.position.set(0, 0.5, -0.1); g.add(base);
        const glass = box(1.36, 1.4, 1.16, T(new THREE.MeshStandardMaterial({ color: '#BFE3FF', transparent: true, opacity: 0.12, roughness: 0.05 }))); glass.position.set(0, 1.72, -0.1); g.add(glass);
        const lid = box(1.42, 0.25, 1.22, body); lid.position.set(0, 2.55, -0.1); g.add(lid);
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = box(0.05, 1.4, 0.05, side); p.position.set(x * 0.69, 1.72, -0.1 + z * 0.59); g.add(p); }
        const plush = ['🧸', '🦄', '🐙', '👾', '🦖', '🦆', '🐸'];
        for (let i = 0; i < 9; i++) { const s = emojiSprite(plush[i % plush.length], 0.32); s.position.set(-0.45 + (i % 3) * 0.45 + ((i * 7) % 3) * 0.04, 1.15 + Math.floor(i / 3) * 0.05, -0.45 + Math.floor(i / 3) * 0.3); g.add(s); }
        const claw = new THREE.Group(); claw.position.set(0, 2.2, -0.1); g.add(claw); parts.push(claw);
        const cable = cyl(0.01, 0.01, 0.3, std('#ddd')); cable.position.y = 0.15; claw.add(cable);
        for (let i = 0; i < 3; i++) { const f = box(0.02, 0.18, 0.02, std('#D7DCE6', { metalness: 0.9 })); const a = (i / 3) * Math.PI * 2; f.position.set(Math.cos(a) * 0.06, -0.08, Math.sin(a) * 0.06); f.rotation.z = Math.cos(a) * 0.4; f.rotation.x = -Math.sin(a) * 0.4; claw.add(f); }
        const chute = box(0.36, 0.3, 0.05, glow(m.color, 0.6)); chute.position.set(-0.4, 0.65, 0.5); g.add(chute);
        marquee = marqueeOn(g, m, 2.85, 1.4);
        focus = new THREE.Vector3(0, 1.6, 0.1); focusN = new THREE.Vector3(0, 0.25, 1).normalize(); focusDist = 1.7; hd = 0.7;
        break;
      }
      case 'airhockey': {
        // a long glowing table with a puck sliding between two mallets
        const legs = box(1.3, 0.8, 2.2, body); legs.position.set(0, 0.4, -0.65); g.add(legs);
        const top = box(1.4, 0.08, 2.3, std('#0D1A3A', { emissive: '#22E3FF', emissiveIntensity: 0.12 })); top.position.set(0, 0.84, -0.65); g.add(top);
        for (const sx of [-1, 1]) { const rail = box(0.06, 0.1, 2.3, side); rail.position.set(sx * 0.7, 0.92, -0.65); g.add(rail); }
        for (const sz of [-1, 1]) { const rail = box(1.4, 0.1, 0.06, side); rail.position.set(0, 0.92, -0.65 + sz * 1.15); g.add(rail); }
        const line = box(1.3, 0.01, 0.02, glow('#FF3D9A', 1.5)); line.position.set(0, 0.885, -0.65); g.add(line);
        const puck = cyl(0.07, 0.07, 0.03, glow('#FFFFFF', 0.8), 20); puck.position.set(0, 0.9, -0.65); g.add(puck); parts.push(puck);
        for (const [z, c] of [[0.25, '#22E3FF'], [-1.55, '#FF3D6E']] as const) { const m = cyl(0.11, 0.12, 0.08, glow(c, 0.9), 20); m.position.set(0, 0.92, z); g.add(m); }
        const sign = box(0.08, 1.6, 0.08, side); sign.position.set(0, 1.6, -1.8); g.add(sign);
        marquee = marqueeOn(g, m, 2.5, 1.4); marquee.position.z = -1.72; (g.children[g.children.length - 1] as THREE.Mesh).position.z = -1.88;
        focus = new THREE.Vector3(0, 0.9, -0.65); focusN = new THREE.Vector3(0, 1.6, 0.9).normalize(); focusDist = 2.2; hd = 1.25;
        break;
      }
      case 'pinball': {
        // a tilted glass playfield on legs, the backbox standing up at the back
        const legs = box(0.9, 0.85, 1.6, body); legs.position.set(0, 0.42, -0.55); g.add(legs);
        const field = box(0.95, 0.12, 1.7, std('#1A0B30', { emissive: '#8B5CFF', emissiveIntensity: 0.25 })); field.position.set(0, 1.0, -0.55); field.rotation.x = 0.12; g.add(field);
        const glassP = box(0.92, 0.02, 1.66, T(new THREE.MeshStandardMaterial({ color: '#BFE3FF', transparent: true, opacity: 0.18, roughness: 0.05 }))); glassP.position.set(0, 1.08, -0.55); glassP.rotation.x = 0.12; g.add(glassP);
        for (const [x, z, c] of [[-0.2, -0.8, '#FF3D9A'], [0.2, -0.8, '#22E3FF'], [0, -0.55, '#FFE14D']] as const) { const b = cyl(0.07, 0.07, 0.08, glow(c, 1.6), 16); b.position.set(x, 1.12 + (-z - 0.55) * 0.12, z); g.add(b); }
        const ball = new THREE.Mesh(T(new THREE.SphereGeometry(0.035, 12, 10)), std('#E6ECF5', { metalness: 1, roughness: 0.15 })); ball.position.set(0, 1.12, -0.4); g.add(ball); parts.push(ball);
        const back = box(0.95, 0.9, 0.2, body); back.position.set(0, 1.7, -1.35); g.add(back);
        screen = document.createElement('canvas'); screen.width = 256; screen.height = 192;
        tex = T(new THREE.CanvasTexture(screen)); tex.colorSpace = THREE.SRGBColorSpace;
        const sc = new THREE.Mesh(T(new THREE.PlaneGeometry(0.82, 0.62)), T(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))); sc.position.set(0, 1.72, -1.24); g.add(sc);
        marquee = marqueeOn(g, m, 2.32, 0.95); marquee.position.z = -1.22; (g.children[g.children.length - 1] as THREE.Mesh).position.z = -1.38;
        focus = new THREE.Vector3(0, 1.05, -0.55); focusN = new THREE.Vector3(0, 1.5, 1).normalize(); focusDist = 1.8; hw = 0.6; hd = 1.0;
        break;
      }
      case 'pusher': {
        // a wide coin pusher: glass front, stacks of gold behind it, lights round the top
        const base = box(1.6, 1.0, 1.1, body); base.position.set(0, 0.5, -0.1); g.add(base);
        const glassC = box(1.5, 0.9, 0.9, T(new THREE.MeshStandardMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.15, roughness: 0.05 }))); glassC.position.set(0, 1.45, -0.1); g.add(glassC);
        const shelf = box(1.4, 0.05, 0.8, std('#5A4A8A')); shelf.position.set(0, 1.05, -0.1); g.add(shelf);
        const pushr = box(1.4, 0.18, 0.3, std('#C9BEFF', { metalness: 0.5 })); pushr.position.set(0, 1.15, -0.4); g.add(pushr); parts.push(pushr);
        const gold = std('#E0A800', { metalness: 0.9, roughness: 0.25, emissive: '#7A5A00', emissiveIntensity: 0.3 });
        for (let i = 0; i < 14; i++) { const c = cyl(0.07, 0.07, 0.02 + (i % 3) * 0.03, gold, 14); c.position.set(-0.55 + (i % 7) * 0.18, 1.09 + (i % 3) * 0.015, -0.05 + Math.floor(i / 7) * 0.2); g.add(c); }
        const roof = box(1.65, 0.3, 1.15, body); roof.position.set(0, 2.05, -0.1); g.add(roof);
        for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(T(new THREE.SphereGeometry(0.035, 8, 6)), glow(i % 2 ? '#FFE14D' : '#FF3D9A', 2)); b.position.set(-0.72 + i * 0.16, 1.92, 0.48); g.add(b); }
        marquee = marqueeOn(g, m, 2.42, 1.6);
        focus = new THREE.Vector3(0, 1.3, 0.2); focusN = new THREE.Vector3(0, 0.9, 1).normalize(); focusDist = 1.6; hw = 0.82; hd = 0.7;
        break;
      }
      case 'plinko': {
        // a tall pegboard with glowing slots along the bottom
        const base = box(1.4, 0.7, 0.8, body); base.position.set(0, 0.35, -0.1); g.add(base);
        const board = box(1.35, 2.3, 0.12, std('#140A33', { emissive: '#FF3D9A', emissiveIntensity: 0.06 })); board.position.set(0, 1.85, -0.3); g.add(board);
        const pegM = glow('#B57BFF', 1.4);
        for (let r2 = 0; r2 < 9; r2++) for (let c2 = 0; c2 < (r2 % 2 ? 6 : 7); c2++) { const p2 = new THREE.Mesh(T(new THREE.SphereGeometry(0.025, 6, 4)), pegM); p2.position.set((r2 % 2 ? -0.5 : -0.6) + c2 * 0.2, 2.75 - r2 * 0.2, -0.22); g.add(p2); }
        for (let i = 0; i < 7; i++) { const sl = box(0.16, 0.18, 0.04, glow(['#3DDC97', '#22E3FF', '#FFE14D', '#FF3D9A', '#FFE14D', '#22E3FF', '#3DDC97'][i], 1.2)); sl.position.set(-0.6 + i * 0.2, 0.86, -0.22); g.add(sl); }
        const chip = new THREE.Mesh(T(new THREE.SphereGeometry(0.06, 14, 10)), glow('#FF3D9A', 0.8)); chip.position.set(0, 2.8, -0.15); g.add(chip); parts.push(chip);
        for (const sx of [-1, 1]) { const p2 = box(0.06, 2.5, 0.2, side); p2.position.set(sx * 0.7, 1.8, -0.3); g.add(p2); }
        marquee = marqueeOn(g, m, 3.15, 1.4); marquee.position.z = -0.15; (g.children[g.children.length - 1] as THREE.Mesh).position.z = -0.31;
        focus = new THREE.Vector3(0, 1.85, -0.22); focusN = new THREE.Vector3(0, 0, 1); focusDist = 2.2;
        break;
      }
      case 'racer': {
        // a sit-down racer: a seat, a steering wheel and a big screen
        upright(1.4, 1.75);
        const seat = box(0.7, 0.45, 0.6, std('#1A1830')); seat.position.set(0, 0.42, 1.05); g.add(seat);
        const back = box(0.7, 0.7, 0.12, std(c0, { emissive: m.color, emissiveIntensity: 0.2 })); back.position.set(0, 0.95, 1.33); back.rotation.x = -0.2; g.add(back);
        const wheel = new THREE.Mesh(T(new THREE.TorusGeometry(0.17, 0.025, 8, 24)), std('#222', { roughness: 0.5 })); wheel.position.set(0, 1.25, 0.55); wheel.rotation.x = -0.9; g.add(wheel); parts.push(wheel);
        hd = 0.9;
        break;
      }
      case 'rhythm': {
        // four glowing pads on the floor in front of the screen
        upright(1.2, 1.6);
        const cols2 = ['#FF3D9A', '#22E3FF', '#B6FF3D', '#FFB13D'];
        const pads = new THREE.Group(); pads.position.set(0, 0.03, 0.95); g.add(pads); parts.push(pads);
        cols2.forEach((c, i) => { const p2 = box(0.28, 0.04, 0.4, glow(c, 0.6)); p2.position.set(-0.45 + i * 0.3, 0, 0); pads.add(p2); });
        break;
      }
      case 'live:paintwars': case 'live:bumper': case 'live:trails': case 'live:volley': case 'live:meteor': {
        // a live pod: a cabinet with four glowing player pads in front of it
        upright(1.25, 1.62);
        const pads = new THREE.Group(); pads.position.set(0, 0.03, 1.15); g.add(pads); parts.push(pads);
        ['#FF3D9A', '#22E3FF', '#B6FF3D', '#FFB13D'].forEach((c, i) => { const p2 = cyl(0.16, 0.16, 0.04, glow(c, 0.9), 16); p2.position.set(-0.54 + i * 0.36, 0, 0); pads.add(p2); });
        const top = emojiSprite(m.emoji, 0.55); top.position.set(0, 3.05, -0.1); g.add(top); parts.push(top);
        break;
      }
      case 'fruit': {
        // an extra-wide screen with fruit sitting on top
        upright(1.2, 1.6);
        ['🍉', '🍊', '🍎'].forEach((e, i) => { const sp = emojiSprite(e, 0.36); sp.position.set(-0.4 + i * 0.4, 2.85, 0.1); g.add(sp); });
        break;
      }
      case 'maze': case 'blaster': case 'snake': {
        upright();
        // a little character standing on top of the cabinet
        const top = emojiSprite(m.id === 'maze' ? '🖌️' : m.id === 'blaster' ? '🚀' : '🐍', 0.5); top.position.set(0, 2.95, -0.1); g.add(top); parts.push(top);
        break;
      }
      default: upright();
    }
    let label: THREE.Sprite | null = null;
    if (m.locked && m.lockLabel) { label = emojiSprite('🔒', 0.5); label.position.set(0, 3.0, 0.3); g.add(label); }
    if (!m.locked) { const pool = new THREE.Mesh(T(new THREE.CircleGeometry(0.85, 24)), T(new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.012, 1.15); g.add(pool); }
    scene.add(g); g.updateMatrixWorld(true);
    return { m, g, screen, tex, spot: new THREE.Vector3(slot.x, 0, slot.z + 1.3), focus: focus.applyMatrix4(g.matrixWorld), focusN: focusN.normalize(), focusDist, marquee, parts, label, hw, hd, fade: 1 };
  };
  const setMachines = (list: HallMachine[]) => {
    for (const c of cabs.values()) scene.remove(c.g);
    cabs.clear();
    list.slice(0, slots.length).forEach((m, i) => cabs.set(m.id, buildCab(m, slots[i])));
  };
  // a flame over this hour's hot cabinet
  const hotFx = emojiSprite('🔥', 0.7); hotFx.visible = false; scene.add(hotFx);
  let hotId: string | null = null;

  // ---- back wall: jukebox, prize counter, ticket machine --------------------------------------------------------
  const counter = new THREE.Group(); counter.position.set(0, 0, -D / 2 + 1.6); scene.add(counter);
  { const c1 = box(5.6, 1.05, 0.9, std('#1F1A3A', { metalness: 0.3, roughness: 0.4 })); c1.position.y = 0.52; counter.add(c1);
    const glassT = box(5.6, 0.06, 0.95, T(new THREE.MeshStandardMaterial({ color: '#BFE3FF', transparent: true, opacity: 0.35, roughness: 0.05 }))); glassT.position.y = 1.08; counter.add(glassT);
    const strip = box(5.62, 0.08, 0.92, trimA); strip.position.y = 0.06; counter.add(strip);
    for (let i = 0; i < 3; i++) { const sh = box(6, 0.08, 0.5, std('#2A2450')); sh.position.set(0, 1.9 + i * 0.75, -0.85); counter.add(sh); } }
  let shelf = new THREE.Group(); counter.add(shelf);
  const setShelf = (items: { emoji: string; n: number }[]) => {
    counter.remove(shelf); shelf.traverse((x) => { if (x instanceof THREE.Sprite) { x.material.map?.dispose(); x.material.dispose(); } });
    shelf = new THREE.Group(); counter.add(shelf);
    const flat: string[] = []; for (const it of items) for (let i = 0; i < Math.min(it.n, 3); i++) flat.push(it.emoji);
    flat.slice(0, 24).forEach((e, i) => { const s = emojiSprite(e, 0.6); s.position.set(-2.6 + (i % 8) * 0.74, 2.25 + Math.floor(i / 8) * 0.75, -0.85); shelf.add(s); });
    if (!flat.length) { const s = emojiSprite('🎁', 0.7); s.position.set(0, 2.3, -0.85); shelf.add(s); }
  };
  const prizeSpot = new THREE.Vector3(0, 0, -D / 2 + 2.9);
  const juke = new THREE.Group(); juke.position.set(-W / 2 + 1.6, 0, -D / 2 + 1.2); scene.add(juke);
  const jukeLights: THREE.MeshStandardMaterial[] = [];
  { const b = box(1.3, 1.5, 0.8, std('#5A2A12', { roughness: 0.3, metalness: 0.2 })); b.position.y = 0.75; juke.add(b);
    const arch = new THREE.Mesh(T(new THREE.CylinderGeometry(0.65, 0.65, 0.8, 24, 1, false, 0, Math.PI)), std('#7A3A1A', { roughness: 0.3 })); arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; arch.position.set(0, 1.5, 0); juke.add(arch);
    for (let i = 0; i < 4; i++) { const mat = glow(['#FF3D9A', '#FFE14D', '#22E3FF', '#3DDC97'][i], 1.6) as THREE.MeshStandardMaterial; jukeLights.push(mat); const tube = new THREE.Mesh(T(new THREE.TorusGeometry(0.5 - i * 0.08, 0.025, 6, 24, Math.PI)), mat); tube.position.set(0, 1.5, 0.41); juke.add(tube); }
    const grill = box(0.9, 0.5, 0.05, std('#C9A86B', { metalness: 0.8, roughness: 0.3 })); grill.position.set(0, 0.55, 0.41); juke.add(grill);
    const note = emojiSprite('🎵', 0.5); note.position.set(0, 2.45, 0); note.name = 'note'; juke.add(note); }
  const jukeSpot = new THREE.Vector3(juke.position.x, 0, juke.position.z + 1.3);
  const bonus = new THREE.Group(); bonus.position.set(W / 2 - 1.6, 0, -D / 2 + 1.2); scene.add(bonus);
  { const b1 = box(0.9, 1.7, 0.7, std('#FFB13D', { emissive: '#FF7A00', emissiveIntensity: 0.25, roughness: 0.3 })); b1.position.y = 0.85; bonus.add(b1);
    const slot = box(0.4, 0.05, 0.05, glow('#FF3D9A', 2)); slot.position.set(0, 0.9, 0.36); bonus.add(slot);
    const t = emojiSprite('🎟️', 0.7); t.position.set(0, 2.05, 0); bonus.add(t); }
  const bonusSpot = new THREE.Vector3(bonus.position.x, 0, bonus.position.z + 1.2);
  let bonusReady = false;
  const bonusTicket = emojiSprite('✨', 0.5); bonusTicket.position.set(0, 2.6, 0); bonus.add(bonusTicket);
  let musicOn = false;
  // the portal between the arcade and the shared Live Arena (on the right wall, by the front aisle)
  const portal = new THREE.Group(); portal.position.set(W / 2 - 0.4, 0, 4.4); portal.rotation.y = -Math.PI / 2; scene.add(portal);
  const portalCol = o.arena ? '#FFE14D' : '#22E3FF';
  const portalRing = new THREE.Mesh(T(new THREE.TorusGeometry(1.05, 0.09, 10, 40)), glow(portalCol, 2.4)); portalRing.position.y = 1.35; portal.add(portalRing);
  const portalFill = new THREE.Mesh(T(new THREE.CircleGeometry(1.0, 40)), T(new THREE.MeshBasicMaterial({ color: portalCol, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })));
  portalFill.position.y = 1.35; portal.add(portalFill);
  const portalSign = new THREE.Mesh(T(new THREE.PlaneGeometry(2.2, 0.55)), T(new THREE.MeshBasicMaterial({ map: T(labelTex(o.arena ? '← ARCADE' : 'LIVE ARENA', portalCol)), toneMapped: false })));
  portalSign.position.set(0, 2.75, 0); portal.add(portalSign);
  const portalSpot = new THREE.Vector3(portal.position.x - 1.3, 0, portal.position.z);
  if (o.arena) { counter.visible = false; juke.visible = false; bonus.visible = false; }
  // ---- the carnival out the front door (Arcade Estates) --------------------------------------------------------
  let carn: Carnival | null = null;
  if (o.carnival && !o.arena) {
    carn = buildCarnival({ scene, T, phone, std, glow, emojiSprite, labelTex });
    door.visible = false; floor.scale.y = D / FL; floor.position.z = 0;
  }
  const OUT = CARNIVAL_Z + 0.45; // past the front wall: outside

  // ---- you, and a few regulars ------------------------------------------------------------------------------
  const meTex = T(new THREE.TextureLoader().load(o.explorerUrl)); meTex.colorSpace = THREE.SRGBColorSpace; meTex.wrapS = THREE.RepeatWrapping;
  const me = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true, alphaTest: 0.05 }))); me.center.set(0.5, 0); me.scale.set(1.3 * (46 / 68), 1.3, 1); scene.add(me);
  const shadow = new THREE.Mesh(T(new THREE.CircleGeometry(0.32, 16)), T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.4, depthWrite: false }))); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const P = { x: 0, z: 6.4, face: 1, walk: 0, moving: false, path: [] as THREE.Vector2[], stick: null as THREE.Vector2 | null, keys: { x: 0, z: 0 } };
  const meRing = new THREE.Mesh(T(new THREE.RingGeometry(0.42, 0.56, 32)), T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0, depthWrite: false })));
  meRing.rotation.x = -Math.PI / 2; meRing.visible = false; scene.add(meRing);
  const ring = new THREE.Mesh(T(new THREE.RingGeometry(0.25, 0.34, 24)), T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0.8, depthWrite: false }))); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  const regulars: { s: THREE.Sprite; bob: number }[] = [];
  const setRegulars = (urls: string[]) => {
    for (const r of regulars) { scene.remove(r.s); r.s.material.map?.dispose(); r.s.material.dispose(); }
    regulars.length = 0;
    const ids = [...cabs.values()].filter((c) => !c.m.locked);
    urls.slice(0, ids.length).forEach((u, i) => {
      const tex = new THREE.TextureLoader().load(u); tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 })); s.center.set(0.5, 0); s.scale.set(1.2 * (46 / 68), 1.2, 1);
      const c = ids[(i * 2 + 1) % ids.length]; s.position.set(c.spot.x + (i % 2 ? 1.05 : -1.05), 0, c.spot.z - 0.25); scene.add(s);
      regulars.push({ s, bob: Math.random() * 6 });
    });
  };

  // ---- other visitors: live players in the same room, gliding to where they last said they were ---------------
  type Other = { s: THREE.Sprite; tex: THREE.Texture; tag: THREE.Sprite; badge: THREE.Sprite; x: number; z: number; tx: number; tz: number; face: number; walk: number; playing: string | null; fresh: number };
  const others = new Map<string, Other>();
  const nameTag = (name: string) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 56; const g = c.getContext('2d')!;
    g.font = '800 26px ui-rounded, system-ui, sans-serif'; const w = Math.min(250, g.measureText(name).width + 24);
    g.fillStyle = 'rgba(10,6,30,0.75)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 42, 21); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 28);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(1.3, 0.28, 1); sp.renderOrder = 5; return sp;
  };
  const setOthers = (list: { id: string; url: string; name: string; x: number; z: number; playing?: string | null }[]) => {
    const keep = new Set(list.map((o) => o.id));
    for (const [id, o] of others) if (!keep.has(id)) { scene.remove(o.s, o.tag, o.badge); o.tex.dispose(); o.s.material.dispose(); o.tag.material.map?.dispose(); o.tag.material.dispose(); others.delete(id); }
    for (const it of list) {
      let o = others.get(it.id);
      if (!o) {
        const tex = new THREE.TextureLoader().load(it.url); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 })); sp.center.set(0.5, 0); sp.scale.set(1.3 * (46 / 68), 1.3, 1);
        const tag = nameTag(it.name), badge = emojiSprite('🎮', 0.4); badge.visible = false;
        scene.add(sp, tag, badge);
        o = { s: sp, tex, tag, badge, x: it.x, z: it.z, tx: it.x, tz: it.z, face: 1, walk: 0, playing: null, fresh: 0 };
        others.set(it.id, o);
      }
      // the heartbeat's position is a few seconds old: only use it when the live stream has gone quiet
      if (performance.now() - o.fresh > 3000) { o.tx = it.x; o.tz = it.z; o.playing = it.playing ?? null; }
    }
  };
  const moveOther = (id: string, x: number, z: number, face?: number, playing?: string | null) => {
    const o = others.get(id); if (!o) return;
    o.tx = x; o.tz = z; o.fresh = performance.now(); if (face) o.face = face; if (playing !== undefined) o.playing = playing;
  };

  // ---- walking: a drag is a joystick, a tap walks you there (round the rows) -------------------------------------
  const solids = () => {
    const out: { x0: number; x1: number; z0: number; z1: number }[] = [];
    for (const c of cabs.values()) out.push({ x0: c.g.position.x - c.hw - 0.25, x1: c.g.position.x + c.hw + 0.25, z0: c.g.position.z - c.hd * (c.hd > 1 ? 1.7 : 1) - 0.25, z1: c.g.position.z + 0.55 + 0.2 });
    if (!o.arena) {
      out.push({ x0: -3.1, x1: 3.1, z0: -D / 2, z1: -D / 2 + 2.25 });
      out.push({ x0: -W / 2, x1: -W / 2 + 2.4, z0: -D / 2, z1: -D / 2 + 1.75 }, { x0: W / 2 - 2.2, x1: W / 2, z0: -D / 2, z1: -D / 2 + 1.75 });
    }
    out.push({ x0: W / 2 - 0.9, x1: W / 2, z0: 3.2, z1: 5.6 });
    if (carn) out.push(...carn.solids);
    return out;
  };
  let walls = solids();
  const blocked = (x: number, z: number) => walls.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  const clampX = (x: number, z = P.z) => (carn && z > OUT ? Math.max(-CARNIVAL_BOUNDS.x, Math.min(CARNIVAL_BOUNDS.x, x)) : Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.6, x)));
  const clampZ = (z: number) => Math.max(-D / 2 + 0.6, Math.min(carn ? CARNIVAL_BOUNDS.z : D / 2 - 0.6, z));
  /** a route: through the nearest gap of every row in the way, then to the spot */
  const route = (tx: number, tz: number): THREE.Vector2[] => {
    if (carn) {
      const outA = P.z > OUT, outB = tz > OUT;
      // outside: up the midway, then across to it (round the booths)
      const outside = (fx: number, fz: number) => { const pts: THREE.Vector2[] = []; if (Math.abs(fx) > 3.2 && Math.abs(fz - tz) > 1) pts.push(new THREE.Vector2(0, fz)); if (Math.abs(tx) > 3.2 && Math.abs(fz - tz) > 1) pts.push(new THREE.Vector2(0, tz)); pts.push(new THREE.Vector2(clampX(tx, tz), clampZ(tz))); return pts; };
      if (outA && outB) return outside(P.x, P.z);
      if (outA && !outB) { const pts = outside(P.x, P.z).slice(0, Math.abs(P.x) > 3.2 ? 1 : 0); pts.push(new THREE.Vector2(0, 14.4), new THREE.Vector2(0, 12.2)); return [...pts, ...inside(0, 12.2, tx, tz)]; }
      if (!outA && outB) { const pts = inside(P.x, P.z, 0, 12.2); pts.push(new THREE.Vector2(0, 14.4)); const rest = outside(0, 14.4); return [...pts, ...rest]; }
    }
    return inside(P.x, P.z, tx, tz);
  };
  const inside = (fx: number, fz: number, tx: number, tz: number) => {
    const pts: THREE.Vector2[] = [];
    let x = fx;
    const rowsBetween = ROWS.filter((r) => (r - 1.1 - fz) * (r - 1.1 - tz) < 0 || (r + 0.9 - fz) * (r + 0.9 - tz) < 0).sort((a, b) => (tz < fz ? b - a : a - b));
    for (const r of rowsBetween) {
      const gx = GAPS.reduce((best, gp) => (Math.abs(gp - (x + tx) / 2) < Math.abs(best - (x + tx) / 2) ? gp : best), GAPS[0]);
      pts.push(new THREE.Vector2(gx, tz < fz ? r + 1.6 : r - 1.6 - 0.6), new THREE.Vector2(gx, tz < fz ? r - 1.6 - 0.6 : r + 1.6));
      x = gx;
    }
    pts.push(new THREE.Vector2(Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.6, tx)), Math.max(-D / 2 + 0.6, Math.min(D / 2 - 0.6, tz))));
    return pts;
  };
  const go = (x: number, z: number) => { if (carn?.riding()) return; P.path = route(x, z); ring.visible = true; ring.position.set(clampX(x, z), 0.02, clampZ(z)); };
  const setRay = (e: PointerEvent) => { const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray; };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: { x: number; y: number; t: number; id: number } | null = null;
  const pd = (e: PointerEvent) => { if (zoom.on) { if (carn?.playing()) { carn.input('down', setRay(e)); held = e.pointerId; } return; } down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; };
  let held: number | null = null;
  const pm = (e: PointerEvent) => {
    if (held === e.pointerId && carn?.playing()) { carn.input('move', setRay(e)); return; }
    if (!down || e.pointerId !== down.id || zoom.on) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, d = Math.hypot(dx, dy);
    if (d > 14) { P.stick = new THREE.Vector2(dx / Math.max(d, 60), dy / Math.max(d, 60)); P.path = []; ring.visible = false; }
  };
  const pu = (e: PointerEvent) => {
    if (held === e.pointerId) { held = null; carn?.input('up', setRay(e)); return; }
    if (!down || e.pointerId !== down.id) return;
    const wasStick = !!P.stick; P.stick = null;
    const tap = !wasStick && performance.now() - down.t < 500; down = null;
    if (!tap || zoom.on) return;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const c of cabs.values()) if (ray.intersectObject(c.g, true).length) { go(c.spot.x, c.spot.z); return; }
    if (ray.intersectObject(portal, true).length) { go(portalSpot.x, portalSpot.z); return; }
    if (!o.arena) {
      if (ray.intersectObject(counter, true).length) { go(prizeSpot.x, prizeSpot.z); return; }
      if (ray.intersectObject(bonus, true).length) { go(bonusSpot.x, bonusSpot.z); return; }
      if (ray.intersectObject(juke, true).length) { go(jukeSpot.x, jukeSpot.z); return; }
    }
    const h = ray.intersectObjects(carn ? [floor, carn.ground] : [floor])[0]; if (h && !blocked(h.point.x, h.point.z)) go(h.point.x, h.point.z);
  };
  const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') P.keys.x = -1; if (k === 'd' || k === 'arrowright') P.keys.x = 1; if (k === 'w' || k === 'arrowup') P.keys.z = -1; if (k === 's' || k === 'arrowdown') P.keys.z = 1; };
  const ku = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) P.keys.x = 0; if (['w', 's', 'arrowup', 'arrowdown'].includes(k)) P.keys.z = 0; };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  // ---- the camera: up behind you, or right in at a machine's play area -------------------------------------------
  const camPos = new THREE.Vector3(0, 8, D / 2 + 6), camLook = new THREE.Vector3(0, 1, 0);
  type Focus = { spot: THREE.Vector3; focus: THREE.Vector3; focusN: THREE.Vector3; focusDist: number };
  const zoom = { on: false, k: 0, cab: null as Focus | null, resolve: null as null | (() => void) };
  let outK = 0; // 0 inside the hall, 1 out at the carnival: the camera turns round
  let near: string | null = null;
  const nearKey = (s: HallSpot | null) => (s ? (s.kind === 'machine' ? `m:${s.id}` : s.kind === 'carnival' ? `c:${s.id}` : s.kind) : null);
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, frame = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const step = (dx: number, dz: number) => {
    // slide along whatever you bump into
    const nz = clampZ(P.z + dz), nx = clampX(P.x + dx, nz), sx = clampX(P.x + dx, P.z), px = clampX(P.x, nz);
    const ok = (x: number) => Math.abs(x - P.x) <= Math.abs(dx) + 0.01; // never snap sideways through a wall
    if (ok(nx) && !blocked(nx, nz)) { P.x = nx; P.z = nz; return true; }
    if (ok(sx) && !blocked(sx, P.z)) { P.x = sx; return true; }
    if (ok(px) && !blocked(px, nz)) { P.x = px; P.z = nz; return true; }
    return false;
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!fps.ready(performance.now())) return;
    if (paused) { last = now; return; }
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now; t += dt; frame++;
    tune(raw);
    const speed = 4.4;
    P.moving = false;
    const riding = !!carn?.riding();
    if (!zoom.on && !riding) {
      const flip = outK > 0.5 ? -1 : 1;
      const kx = (P.keys.x || P.stick?.x || 0) * flip, kz = (P.keys.z || P.stick?.y || 0) * flip;
      if (kx || kz) {
        const l = Math.hypot(kx, kz), s = Math.min(1, l) * speed * dt;
        P.moving = step((kx / l) * s, (kz / l) * s); if (Math.abs(kx) > 0.1) P.face = kx > 0 ? 1 : -1; P.path = [];
      } else if (P.path.length) {
        const tgt = P.path[0], dx = tgt.x - P.x, dz = tgt.y - P.z, d = Math.hypot(dx, dz);
        if (d < 0.06) P.path.shift();
        else { const s = Math.min(d, speed * dt); P.moving = step((dx / d) * s, (dz / d) * s); if (!P.moving) P.path.shift(); if (Math.abs(dx) > 0.05) P.face = dx > 0 ? 1 : -1; }
        if (!P.path.length) ring.visible = false;
      }
      if (P.moving) P.walk += dt * 10;
    }
    me.position.set(P.x, P.moving && !o.reduceMotion ? Math.abs(Math.sin(P.walk)) * 0.08 : 0, P.z);
    meTex.repeat.x = P.face; meTex.offset.x = P.face < 0 ? 1 : 0;
    shadow.position.set(P.x, 0.015, P.z);
    ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    // what you're standing at
    let s: HallSpot | null = null;
    if (!P.moving) {
      let best = 1.0;
      for (const c of cabs.values()) { const d = Math.hypot(c.spot.x - P.x, c.spot.z - P.z); if (d < best) { best = d; s = { kind: 'machine', id: c.m.id }; } }
      if (!o.arena) {
        if (Math.hypot(prizeSpot.x - P.x, prizeSpot.z - P.z) < 1.5) s = { kind: 'prizes' };
        if (Math.hypot(bonusSpot.x - P.x, bonusSpot.z - P.z) < 1.2) s = { kind: 'bonus' };
        if (Math.hypot(jukeSpot.x - P.x, jukeSpot.z - P.z) < 1.2) s = { kind: 'jukebox' };
      }
      if (Math.hypot(portalSpot.x - P.x, portalSpot.z - P.z) < 1.2) s = { kind: 'door' };
      if (carn && P.z > OUT) { let bd = 1.4; for (const sp of carn.spots) { const d = Math.hypot(sp.x - P.x, sp.z - P.z); if (d < bd) { bd = d; s = { kind: 'carnival', id: sp.id }; } } }
    }
    if (riding) s = null;
    const nk = nearKey(s);
    if (nk !== near && !zoom.on) { near = nk; o.onNear?.(s); }
    // camera: behind and above you (further back on a tall phone screen)
    zoom.k += ((zoom.on ? 1 : 0) - zoom.k) * Math.min(1, dt * 3.2);
    if (zoom.on && zoom.k > 0.97 && zoom.resolve) { const r = zoom.resolve; zoom.resolve = null; r(); }
    // steep enough that the row of cabinets behind you doesn't hide you (and those fade out anyway)
    const wide = camera.aspect < 1 ? 1 + (1 / camera.aspect - 1) * 0.22 : 1;
    outK += ((carn && P.z > CARNIVAL_Z - 0.4 ? 1 : 0) - outK) * Math.min(1, dt * 2.6);
    const ok3 = outK * outK * (3 - 2 * outK);
    // inside: behind you from the door end; outside: behind you from the arcade, looking out at the carnival
    // (outside: close behind you and high above the string lights and balloons, looking down so you're easy to spot;
    //  it stays out of the hall once you're a few steps from the door, rising instead of backing in)
    const zOut = Math.max(P.z - 4.2 * wide, Math.min(CARNIVAL_Z + 1.2, P.z - 2.5)), yOut = 7 + Math.max(0, 4.2 * wide - (P.z - zOut)) * 0.6;
    const follow = tmp.set(P.x * (0.55 + 0.3 * ok3), 6.8 * wide + (yOut - 6.8 * wide) * ok3, P.z + 4.6 * wide + (zOut - P.z - 4.6 * wide) * ok3);
    const baseLook = new THREE.Vector3(P.x * (0.85 + 0.15 * ok3), 0.9 + 0.1 * ok3, P.z - 2.2 + 5.4 * ok3);
    if (carn) { const f = scene.fog as THREE.Fog; f.near = 22 + 14 * ok3; f.far = 52 + 34 * ok3; }
    if (zoom.cab) {
      const c = zoom.cab, k = zoom.k * zoom.k * (3 - 2 * zoom.k);
      const at = tmp2.copy(c.focus).addScaledVector(c.focusN, c.focusDist * (camera.aspect < 1 ? 1 + (1 / camera.aspect - 1) * 0.6 : 1));
      camPos.lerpVectors(follow, at, k);
      camLook.lerpVectors(baseLook, c.focus, k);
      if (!zoom.on && zoom.k < 0.02) zoom.cab = null;
    } else { const rc = carn?.rideCamera(t); if (rc) { camPos.lerp(rc.pos, Math.min(1, dt * 3)); camLook.lerp(rc.look, Math.min(1, dt * 3)); } else { camPos.lerp(follow, Math.min(1, dt * 4.5)); camLook.lerp(baseLook, Math.min(1, dt * 5)); } }
    me.visible = shadow.visible = !riding && !(carn && zoom.cab && zoom.k > 0.3);
    // out at the carnival you're a little bigger, with a glowing ring at your feet, so you stand out
    if (carn) {
      const k = 1 + 0.35 * ok3; me.scale.set(1.3 * (46 / 68) * k, 1.3 * k, 1);
      meRing.visible = ok3 > 0.05 && me.visible;
      meRing.position.set(P.x, 0.025, P.z); (meRing.material as THREE.MeshBasicMaterial).opacity = (0.55 + Math.sin(t * 4) * 0.2) * ok3;
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
    // machines come alive (and any between you and the camera fade out of the way)
    for (const c of cabs.values()) {
      const inWay = !zoom.cab && c.g.position.z > P.z + 0.3 && c.g.position.z < camPos.z && Math.abs(c.g.position.x - P.x) < 2.6;
      const want = inWay ? 0.18 : 1;
      if (Math.abs(c.fade - want) > 0.01) { c.fade += (want - c.fade) * Math.min(1, dt * 8); setFade(c, c.fade); }
      const close = Math.hypot(c.spot.x - P.x, c.spot.z - P.z) < 7;
      if (c.screen && c.tex && frame % (close ? 3 : 10) === 0) { attract(c.m.id, c.screen.getContext('2d')!, t, c.m.color, c.m.locked, c.m.emoji); c.tex.needsUpdate = true; }
      if (!o.reduceMotion && !c.m.locked) {
        if (c.marquee) (c.marquee.material as THREE.MeshBasicMaterial).color.setScalar(0.85 + 0.15 * Math.sin(t * 5 + c.g.position.x));
        if (c.m.id === 'cyclone') { const ring2 = c.parts[0]; const lit = Math.floor(t * 12) % 24; ring2.children.forEach((b, i) => { if (i) ((b as THREE.Mesh).material = i === lit ? bulbOn : bulbOff); }); }
        if (c.m.id === 'bop') c.parts[0].children.forEach((b) => { if (b.userData.i != null) b.position.y = -0.05 + Math.max(0, Math.sin(t * 2.6 + b.userData.i * 2.1)) * 0.16; });
        if (c.m.id === 'claw') { c.parts[0].position.x = Math.sin(t * 0.7) * 0.4; c.parts[0].position.y = 2.2 - Math.max(0, Math.sin(t * 0.5)) * 0.5; }
        if (c.m.id === 'hoops') c.parts[0].scale.setScalar(1 + Math.max(0, Math.sin(t * 2)) * 0.05);
        if (c.m.id === 'stacker') (c.parts[0] as THREE.Mesh).scale.y = 1 + Math.max(0, Math.sin(t * 6)) * 0.3;
        if (c.m.id === 'airhockey') { c.parts[0].position.z = -0.65 + Math.sin(t * 2.2) * 0.8; c.parts[0].position.x = Math.sin(t * 3.1) * 0.5; }
        if (c.m.id === 'pinball') { c.parts[0].position.x = Math.sin(t * 2.7) * 0.35; c.parts[0].position.z = -0.55 + Math.cos(t * 1.9) * 0.6; }
        if (c.m.id === 'pusher') c.parts[0].position.z = -0.4 + Math.sin(t * 1.6) * 0.12;
        if (c.m.id === 'plinko') { const k = (t * 0.5) % 1; c.parts[0].position.y = 2.8 - k * 1.85; c.parts[0].position.x = Math.sin(k * 20) * 0.1; }
        if (c.m.id === 'racer') c.parts[0].rotation.z = Math.sin(t * 1.5) * 0.4;
        if (c.m.id === 'rhythm') c.parts[0].children.forEach((p2, i) => { ((p2 as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = Math.floor(t * 4 + i * 1.7) % 4 === i ? 2.4 : 0.4; });
        if (c.m.id.startsWith('live:')) { c.parts[0].children.forEach((p2, i) => { ((p2 as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.max(0, Math.sin(t * 3 + i * 1.6)) * 1.6; }); c.parts[1].position.y = 3.05 + Math.abs(Math.sin(t * 2.4)) * 0.12; }
        if (c.m.id === 'maze' || c.m.id === 'blaster' || c.m.id === 'snake') c.parts[0].position.y = 2.95 + Math.abs(Math.sin(t * 3)) * 0.12;
      }
      if (c.label) c.label.position.y = 3.0 + Math.sin(t * 2) * 0.05;
    }
    const hc = hotId ? cabs.get(hotId) : null;
    hotFx.visible = !!hc; if (hc) hotFx.position.set(hc.g.position.x, 3.85 + Math.sin(t * 3) * 0.1, hc.g.position.z + 0.2);
    for (const r of regulars) r.s.position.y = o.reduceMotion ? 0 : Math.abs(Math.sin(t * 3 + r.bob)) * 0.04;
    for (const ot of others.values()) {
      const dx = ot.tx - ot.x, dz = ot.tz - ot.z, d = Math.hypot(dx, dz);
      // far jumps (they just arrived, or warped) snap; small ones glide at walking speed
      if (d > 6) { ot.x = ot.tx; ot.z = ot.tz; } else if (d > 0.02) { const s2 = Math.min(d, 5 * dt); ot.x += (dx / d) * s2; ot.z += (dz / d) * s2; ot.walk += dt * 10; if (Math.abs(dx) > 0.02) ot.face = dx > 0 ? 1 : -1; }
      const moving = d > 0.02;
      ot.s.position.set(ot.x, moving && !o.reduceMotion ? Math.abs(Math.sin(ot.walk)) * 0.08 : 0, ot.z);
      ot.tex.repeat.x = ot.face; ot.tex.offset.x = ot.face < 0 ? 1 : 0;
      ot.tag.position.set(ot.x, 1.55, ot.z);
      ot.badge.visible = !!ot.playing; ot.badge.position.set(ot.x + 0.35, 1.25 + Math.sin(t * 4) * 0.05, ot.z);
    }
    if (!o.reduceMotion) {
      pl.forEach((l, i) => { l.intensity = (phone ? 22 : 26) * (0.85 + 0.15 * Math.sin(t * 1.3 + i * 1.7)); });
      if (lights !== 'steady') { const on = Math.floor(t * 12); bulbs.forEach((b, i) => { b.material = (i + on) % 4 === 0 ? bulbOn : bulbOff; }); }
      if (lights === 'disco') { disco.rotation.y = t * 0.8; spots.forEach((sp, i) => sp.target.position.set(Math.sin(t * 0.9 + i * 2) * 6, 0, Math.cos(t * 0.7 + i * 2) * 9)); }
      if (lights === 'lasers') lasers.children.forEach((b, i) => b.rotation.set(0, Math.sin(t * 0.8 + i) * 0.9, Math.PI / 2 + Math.sin(t * 1.3 + i * 1.7) * 0.35));
      if (neon === NEON.rainbow) { const h = (t * 0.08) % 1; trimA.color.setHSL(h, 1, 0.55); trimA.emissive.setHSL(h, 1, 0.55); trimB.color.setHSL((h + 0.5) % 1, 1, 0.55); trimB.emissive.setHSL((h + 0.5) % 1, 1, 0.55); }
      bonusTicket.visible = bonusReady; bonusTicket.position.y = 2.6 + Math.sin(t * 3) * 0.08;
      jukeLights.forEach((m, i) => { m.emissiveIntensity = musicOn ? 1.2 + Math.sin(t * 6 + i) * 0.8 : 0.4; });
      const note = juke.getObjectByName('note'); if (note) { note.visible = musicOn; note.position.y = 2.45 + Math.sin(t * 4) * 0.1; }
    }
    if (!o.reduceMotion) { portalRing.rotation.z = t * 0.6; (portalFill.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 3) * 0.08; }
    carn?.update(t, dt, camPos.z, P.z);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  const setDecor = (d: Decor, name: string) => {
    neon = NEON[d.neon] ?? NEON.pink;
    trimA.color.set(neon[0]); trimA.emissive.set(neon[0]); trimB.color.set(neon[1]); trimB.emissive.set(neon[1]);
    floorMat.map?.dispose();
    const tex = floorTex(d.floor, neon); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(W / 6, FL / 6);
    floorMat.map = tex; floorMat.needsUpdate = true;
    signMat.map?.dispose(); signMat.map = labelTex(name.slice(0, 28) || 'Arcade', neon[0]); signMat.needsUpdate = true;
    lights = d.lights;
    disco.visible = lights === 'disco'; lasers.visible = lights === 'lasers' && !phone;
    for (const sp of spots) { scene.remove(sp); scene.remove(sp.target); } spots.length = 0;
    if (lights === 'disco') for (let i = 0; i < (phone ? 2 : 3); i++) { const sp = new THREE.SpotLight(['#FF3D9A', '#22E3FF', '#FFE14D'][i], 30, 18, 0.35, 0.6, 1.4); sp.position.set(0, 4.3, -8.5); scene.add(sp); scene.add(sp.target); spots.push(sp); }
    if (lights === 'steady') bulbs.forEach((b) => { b.material = bulbOn; });
  };

  return {
    setMachines: (list: HallMachine[]) => { setMachines(list); walls = solids(); },
    setShelf, setDecor, setRegulars,
    setHot(id: string | null) { hotId = id; },
    setMusic(on: boolean) { musicOn = on; },
    setBonus(ready: boolean) { bonusReady = ready; },
    /** glide the camera up to a machine's play area; resolves when it fills the view */
    zoomIn(id: string) { const c = cabs.get(id); if (!c) return Promise.resolve(); zoom.cab = c; zoom.on = true; P.path = []; P.stick = null; P.x = c.spot.x; P.z = c.spot.z; return new Promise<void>((res) => { zoom.resolve = res; }); },
    zoomOut() { zoom.on = false; zoom.resolve = null; near = null; },
    walkTo(s: HallSpot) { if (s.kind === 'carnival') { const sp = carn?.spots.find((x) => x.id === s.id); if (sp) go(sp.x, sp.z); } else if (s.kind === 'machine') { const c = cabs.get(s.id); if (c) go(c.spot.x, c.spot.z); } else if (s.kind === 'prizes') go(prizeSpot.x, prizeSpot.z); else if (s.kind === 'jukebox') go(jukeSpot.x, jukeSpot.z); else if (s.kind === 'door') go(portalSpot.x, portalSpot.z); else go(bonusSpot.x, bonusSpot.z); },
    setPaused(p: boolean) { paused = p; },
    carnival: carn ? {
      spots: carn.spots,
      /** glide up to a booth's counter (resolves when it fills the view) */
      zoomBooth(id: string) { const f = carn!.focusOf(id); if (!f) return Promise.resolve(); zoom.cab = f; zoom.on = true; P.path = []; P.stick = null; P.x = f.spot.x; P.z = f.spot.z; return new Promise<void>((res) => { zoom.resolve = res; }); },
      start: (id: string, seed: number, onScore: (s: number) => void, onEnd: (s: number) => void) => carn!.startGame(id, seed, onScore, onEnd),
      stop: () => carn!.stopGame(),
      state: () => carn!.gameState(),
      ride(id: 'wheel' | 'carousel', seconds: number) { near = null; carn!.ride(id, seconds, t); },
      endRide: () => carn!.endRide(),
      riding: () => carn!.riding(),
      fireworks: (s?: number) => carn!.fireworks(s),
      /** a snapshot of the view, for the photo booth */
      photo() { renderer.render(scene, camera); return o.canvas.toDataURL('image/jpeg', 0.9); },
      /** where the live targets are on screen (0..1), for tests */
      aim: () => carn!.targets().map((v) => { v.project(camera); return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }; }),
      /** a ray from a point on screen (0..1), for tests */
      tapAt(fx: number, fy: number, kind: 'down' | 'up' = 'down') { ndc.set(fx * 2 - 1, -(fy * 2 - 1)); ray.setFromCamera(ndc, camera); carn!.input(kind, ray); },
    } : null,
    setOthers, moveOther,
    /** where you are (for the live room) */ pose: () => ({ x: P.x, z: P.z, face: P.face, moving: P.moving || P.path.length > 0 || !!P.stick }),
    debug: () => ({ P: { x: P.x, z: P.z }, near, outK, paused, riding: carn?.riding() ?? '', stick: !!P.stick, keys: { ...P.keys }, zoomOn: zoom.on, next: P.path[0] ? { x: P.path[0].x, z: P.path[0].y } : null, blockedLeft: blocked(P.x - 0.2, P.z), blockedRight: blocked(P.x + 0.2, P.z), walls: walls.filter((b) => P.x - 0.3 > b.x0 - 0.5 && P.x - 0.3 < b.x1 + 0.5 && P.z > b.z0 - 0.5 && P.z < b.z1 + 0.5), cabs: [...cabs.keys()], zoom: zoom.k, path: P.path.length, others: [...others.entries()].map(([id, x]) => ({ id, x: x.x, z: x.z, playing: x.playing })) }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      setRegulars([]); setShelf([]); setOthers([]);
      floorMat.map?.dispose(); signMat.map?.dispose(); hotFx.material.map?.dispose(); hotFx.material.dispose();
      carn?.dispose(); for (const x of bag) x.dispose();
      renderer.dispose();
    },
  };
}
export type HallScene = ReturnType<typeof createHall>;
