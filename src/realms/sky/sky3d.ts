// Sky Island in 3D: hexagonal chunks of grass and rock floating over a sea of clouds, rocks dangling underneath,
// waterfalls spilling off the edges. Buildings on the chunks come alive: nets full of caught cloud, nests with
// birds, spinning turbines, a rainbow prism throwing light, a sun mirror tracking the sun, a moon bell that swings
// and glows at night, flower gardens. Over each building, what it's made so far. The weather really happens:
// drifting grey clouds, flocks of birds, wind streaks, rainbow showers, clear sunshine, a starry night.
// Hot-air balloons with orders drift round the island. Drag to turn, pinch or scroll to zoom, tap to pick.
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../../lib/gfx';
import { hexXZ, parse, type SkyCore, type SkyOrder } from './skyCore';

export type SkyOpts = {
  canvas: HTMLCanvasElement; seed: number; explorerUrl: string; reduceMotion?: boolean;
  onTapTile?(k: string): void; onTapGhost?(k: string): void; onTapBalloon?(id: string): void; onTapNothing?(): void;
};
const SKIES: Record<string, { top: string; bot: string; sun: number; hemi: number; fog: string; light: string }> = {
  clear: { top: '#3E8EF0', bot: '#CDEBFF', sun: 2.8, hemi: 1.2, fog: '#CDEBFF', light: '#FFF2D6' },
  cloudy: { top: '#6F8FB8', bot: '#D7E2EE', sun: 1.5, hemi: 1.25, fog: '#D2DCE8', light: '#F0F2F6' },
  breezy: { top: '#5BA6E8', bot: '#E2F3FF', sun: 2.2, hemi: 1.2, fog: '#E2F3FF', light: '#FFF6E6' },
  migration: { top: '#6AA9E6', bot: '#FFE9CC', sun: 2.2, hemi: 1.15, fog: '#FFE9CC', light: '#FFE8C8' },
  rainbow: { top: '#5E86D6', bot: '#E9DCFF', sun: 2, hemi: 1.3, fog: '#D9D2FF', light: '#FFF6FF' },
  night: { top: '#0A0F2C', bot: '#2C2A5A', sun: 0.5, hemi: 0.6, fog: '#23224A', light: '#B9C6FF' },
};

export function createSky3D(o: SkyOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#CDEBFF', 70, 190);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...p }));
  let sd = (o.seed % 100000) + 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; d(cv.getContext('2d')!); const t = T(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const emojiTex = (e: string, s = 128) => tex(s, s, (g) => { g.font = `${s * 0.78}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, s / 2, s * 0.56); });
  const sprite = (t: THREE.Texture, w: number, h: number, add = false) => { const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }))); s.scale.set(w, h, 1); return s; };
  const glowTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const puffTex = tex(128, 128, (g) => { for (let i = 0; i < 9; i++) { const x = 30 + Math.random() * 68, y = 44 + Math.random() * 40, r = 18 + Math.random() * 22; const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } });

  // ---- sky dome, sun/moon, stars ---------------------------------------------------------------------------------------
  const skyCv = document.createElement('canvas'); skyCv.width = 4; skyCv.height = 256;
  const skyTex = T(new THREE.CanvasTexture(skyCv)); skyTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(T(new THREE.SphereGeometry(200, 24, 16)), T(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }))); scene.add(dome);
  const hemi = new THREE.HemisphereLight('#FFFFFF', '#9DB4D0', 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF2D6', 2.6); sun.position.set(14, 22, 8); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  const sunDisc = sprite(glowTex, 30, 30, true); sunDisc.position.set(70, 60, -110); (sunDisc.material as THREE.SpriteMaterial).fog = false; scene.add(sunDisc);
  const moon = sprite(emojiTex('🌕', 128), 12, 12); moon.position.set(-60, 55, -110); (moon.material as THREE.SpriteMaterial).fog = false; scene.add(moon);
  const starPos = new Float32Array(600 * 3); for (let i = 0; i < 600; i++) { const a = rnd() * Math.PI * 2, e = rnd() * 1.3 + 0.05, r = 180; starPos[i * 3] = Math.cos(a) * Math.cos(e) * r; starPos[i * 3 + 1] = Math.sin(e) * r; starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  const starGeo = T(new THREE.BufferGeometry()); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, T(new THREE.PointsMaterial({ color: '#FFFFFF', size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))); scene.add(stars);

  // ---- the cloud sea below, and far-off islets ---------------------------------------------------------------------------
  const sea: THREE.Sprite[] = [];
  for (let i = 0; i < (phone ? 40 : 70); i++) { const s = sprite(puffTex, 14 + rnd() * 18, 7 + rnd() * 7); s.position.set((rnd() - 0.5) * 140, -9 - rnd() * 8, (rnd() - 0.5) * 140); scene.add(s); sea.push(s); }
  const isletM = std('#7CB45A'), rockM = std('#8E8274', { flatShading: true }), rockD = std('#6E6458', { flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd(), r = 38 + rnd() * 25, g = new THREE.Group(); g.position.set(Math.cos(a) * r, -2 + rnd() * 10, Math.sin(a) * r); scene.add(g);
    const s = 1.5 + rnd() * 2.5; const top = new THREE.Mesh(T(new THREE.CylinderGeometry(s, s * 0.9, 0.5, 8)), isletM); g.add(top);
    const bot = new THREE.Mesh(T(new THREE.ConeGeometry(s * 0.95, s * 2.2, 8)), rockM); bot.rotation.x = Math.PI; bot.position.y = -s * 1.1 - 0.25; g.add(bot);
    const tr = new THREE.Mesh(T(new THREE.ConeGeometry(0.5, 1.4, 6)), std('#3F7A3A')); tr.position.set(s * 0.3, 0.9, 0); g.add(tr);
    g.userData.bob = rnd() * 6;
  }

  // ---- the island ------------------------------------------------------------------------------------------------------
  const island = new THREE.Group(); scene.add(island);
  const grassTex = tex(128, 128, (g) => { g.fillStyle = '#7CC45A'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 600; i++) { g.fillStyle = Math.random() < 0.5 ? '#6AB04A' : '#92D46C'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 4); } });
  const hexGeo = T(new THREE.CylinderGeometry(0.98, 0.98, 0.32, 6)), dirtGeo = T(new THREE.CylinderGeometry(0.99, 0.92, 0.5, 6));
  const topM = std('#ffffff', { map: grassTex }), dirtM = std('#8A6A48'), ghostM = T(new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.28, depthWrite: false }));
  const plusTex = tex(128, 128, (g) => { g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(64, 30); g.lineTo(64, 98); g.moveTo(30, 64); g.lineTo(98, 64); g.stroke(); });
  type TileObj = { g: THREE.Group; top: THREE.Mesh; b: string | null; lv: number; build: THREE.Group | null; tick?: (t: number, dt: number, st: number) => void; bubble: THREE.Sprite; bubbleCv: HTMLCanvasElement; bubbleTex: THREE.CanvasTexture; lastB: string };
  const tiles = new Map<string, TileObj>();
  const ghosts = new Map<string, THREE.Mesh>();
  const balloons = new Map<string, { g: THREE.Group; a: number; r: number; y: number; ready: boolean; bubble: THREE.Sprite }>();
  const falls: THREE.Mesh[] = [];
  const fallTex = tex(32, 128, (g) => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(180,230,255,0.95)'); gr.addColorStop(1, 'rgba(180,230,255,0)'); g.fillStyle = gr; for (let x = 0; x < 32; x += 4) g.fillRect(x + Math.random() * 2, 0, 2, 128); });
  fallTex.wrapT = THREE.RepeatWrapping;

  const buildMesh = (b: string, lv: number): { g: THREE.Group; tick?: (t: number, dt: number, st: number) => void } => {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(T(geo), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
    const wood = std('#8A5A33'), white = std('#FAFAFA'), gold = std('#E8B83E', { metalness: 0.8, roughness: 0.25 });
    const lvS = 0.85 + lv * 0.06;
    if (b === 'catcher') {
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 6), wood, s * 0.55, 0.65, 0);
      const netTex = tex(64, 64, (c) => { c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; for (let k = 0; k <= 64; k += 8) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, 64); c.stroke(); c.beginPath(); c.moveTo(0, k); c.lineTo(64, k); c.stroke(); } });
      const net = add(new THREE.PlaneGeometry(1.1, 0.9, 6, 4), T(new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, roughness: 1 })), 0, 0.85, 0);
      const puffs: THREE.Sprite[] = [];
      for (let k = 0; k < 5; k++) { const p = sprite(puffTex, 0.6, 0.45); p.position.set(-0.35 + k * 0.17, 0.75 + (k % 2) * 0.2, 0.08); g.add(p); puffs.push(p); }
      return { g, tick: (t, _dt, st) => { const pos = net.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(t * 2 + pos.getX(i) * 4) * 0.05); pos.needsUpdate = true; puffs.forEach((p, k) => { p.visible = st > k / 5; p.position.x = -0.35 + k * 0.17 + Math.sin(t + k) * 0.03; }); } };
    }
    if (b === 'nest') {
      add(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6), wood, 0, 0.45, 0);
      const nest = add(new THREE.TorusGeometry(0.32, 0.12, 6, 14), std('#9A7448'), 0, 0.95, 0); nest.rotation.x = Math.PI / 2;
      const eggs: THREE.Mesh[] = []; for (let k = 0; k < 3; k++) { const e = add(new THREE.SphereGeometry(0.1, 8, 6), std(['#BDE6FF', '#FFF4DA', '#FFD6E8'][k]), -0.1 + k * 0.1, 0.98, (k % 2) * 0.08); e.scale.y = 1.3; eggs.push(e); }
      const bird = sprite(emojiTex('🐦', 64), 0.45, 0.45); g.add(bird);
      return { g, tick: (t, _dt, st) => { bird.position.set(Math.sin(t * 0.8) * 0.4, 1.35 + Math.abs(Math.sin(t * 3)) * 0.15, Math.cos(t * 0.8) * 0.3); eggs.forEach((e, k) => { e.visible = st > k / 3; }); } };
    }
    if (b === 'turbine') {
      add(new THREE.CylinderGeometry(0.06, 0.12, 1.8 * lvS, 8), white, 0, 0.9 * lvS, 0);
      const hub = new THREE.Group(); hub.position.set(0, 1.8 * lvS, 0.1); g.add(hub);
      for (let k = 0; k < 3; k++) { const bl = new THREE.Mesh(T(new THREE.BoxGeometry(0.1, 0.8, 0.02)), white); bl.position.y = 0.4; const arm = new THREE.Group(); arm.rotation.z = (k / 3) * Math.PI * 2; arm.add(bl); bl.castShadow = true; hub.add(arm); }
      add(new THREE.SphereGeometry(0.08, 8, 6), std('#C83A3A'), 0, 1.8 * lvS, 0.12);
      return { g, tick: (_t, dt) => { hub.rotation.z -= dt * (windy ? 7 : 2.5); } };
    }
    if (b === 'prism') {
      add(new THREE.CylinderGeometry(0.28, 0.35, 0.4, 8), std('#E8E4DC'), 0, 0.2, 0);
      const cry = add(new THREE.OctahedronGeometry(0.38 * lvS), T(new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FF6FD8', emissiveIntensity: 0.6, transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.1 })), 0, 0.95, 0); cry.scale.y = 1.5;
      const beamTex = tex(8, 64, (c) => { const cols = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#7B5CFF']; cols.forEach((cc, i) => { c.fillStyle = cc; c.fillRect(0, i * 10.6, 8, 11); }); });
      const beam = add(new THREE.PlaneGeometry(0.25, 2.6), T(new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })), 0.9, 1.1, 0); beam.rotation.z = Math.PI / 2.4; beam.castShadow = false;
      return { g, tick: (t) => { cry.rotation.y = t * 0.8; (cry.material as THREE.MeshStandardMaterial).emissive.setHSL((t * 0.1) % 1, 0.9, 0.55); (beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 2) * 0.2; } };
    }
    if (b === 'mirror') {
      add(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 6), std('#8A8A96', { metalness: 0.6 }), 0, 0.45, 0);
      const dish = add(new THREE.SphereGeometry(0.55 * lvS, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), T(new THREE.MeshStandardMaterial({ color: '#FFE9A8', metalness: 1, roughness: 0.08, side: THREE.DoubleSide, emissive: '#FFB13D', emissiveIntensity: 0.25 })), 0, 1.05, 0);
      dish.rotation.x = -1.0;
      const spark = sprite(glowTex, 0.7, 0.7, true); (spark.material as THREE.SpriteMaterial).color.set('#FFD23F'); spark.position.set(0, 1.25, 0.25); g.add(spark);
      return { g, tick: (t) => { dish.rotation.z = Math.sin(t * 0.2) * 0.5; spark.scale.setScalar(0.5 + Math.abs(Math.sin(t * 3)) * 0.4); } };
    }
    if (b === 'bell') {
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 1.4, 0.08), std('#4A4A6A'), s * 0.45, 0.7, 0);
      add(new THREE.BoxGeometry(1.05, 0.1, 0.12), std('#4A4A6A'), 0, 1.42, 0);
      const pivot = new THREE.Group(); pivot.position.set(0, 1.38, 0); g.add(pivot);
      const bell = new THREE.Mesh(T(new THREE.LatheGeometry([0, 0.05, 0.12, 0.2, 0.28, 0.3].map((x, i) => new THREE.Vector2(x, -[0, 0.02, 0.12, 0.3, 0.48, 0.55][i])), 16)), T(new THREE.MeshStandardMaterial({ color: '#CFD8FF', metalness: 0.7, roughness: 0.25, emissive: '#8FA0FF', emissiveIntensity: 0.3, side: THREE.DoubleSide })));
      bell.castShadow = true; pivot.add(bell);
      const halo = sprite(glowTex, 1.4, 1.4, true); (halo.material as THREE.SpriteMaterial).color.set('#B9C6FF'); halo.position.set(0, 1.1, 0); g.add(halo);
      return { g, tick: (t) => { pivot.rotation.z = Math.sin(t * 1.6) * 0.3; (bell.material as THREE.MeshStandardMaterial).emissiveIntensity = night ? 1.2 : 0.3; (halo.material as THREE.SpriteMaterial).opacity = night ? 0.8 : 0.2; } };
    }
    // garden
    const cols = ['#FF5F9E', '#FFD23F', '#B07BFF', '#FF8A3D', '#FFFFFF', '#5FD3FF'];
    const heads: THREE.Mesh[] = [];
    for (let k = 0; k < 14; k++) { const a = rnd() * Math.PI * 2, r = rnd() * 0.65, x = Math.cos(a) * r, z = Math.sin(a) * r; add(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 4), std('#3F8A3A'), x, 0.17, z); heads.push(add(new THREE.SphereGeometry(0.08, 6, 5), std(cols[k % cols.length]), x, 0.36, z)); }
    const bf = sprite(emojiTex('🦋', 64), 0.3, 0.3); g.add(bf);
    return { g, tick: (t) => { heads.forEach((h, i) => { h.position.y = 0.36 + Math.sin(t * 2 + i) * 0.015; }); bf.position.set(Math.sin(t * 0.9) * 0.5, 0.7 + Math.sin(t * 2.7) * 0.15, Math.cos(t * 1.1) * 0.5); } };
  };

  const bubbleDraw = (to: TileObj, emoji: string, n: number, full: boolean, boost: boolean) => {
    const k = `${emoji}|${n}|${full}|${boost}`; if (k === to.lastB) return; to.lastB = k;
    const g = to.bubbleCv.getContext('2d')!; g.clearRect(0, 0, 192, 96);
    g.fillStyle = boost ? '#FFD23F' : full ? '#FF8A3D' : 'rgba(255,255,255,0.95)'; g.beginPath(); g.roundRect(6, 6, 180, 70, 34); g.fill();
    g.beginPath(); g.moveTo(84, 74); g.lineTo(96, 92); g.lineTo(108, 74); g.fill();
    g.font = '44px system-ui, "Apple Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, 50, 44);
    g.font = '900 34px ui-rounded, system-ui'; g.fillStyle = '#2A1A08'; g.fillText(n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n), 128, 44);
    to.bubbleTex.needsUpdate = true;
  };

  let core: SkyCore | null = null; let resEmoji: Record<string, string> = {};
  let weather = 'clear', windy = false, night = false;
  const setIsland = (c: SkyCore, emojis: Record<string, string>, expandMode: boolean, front: string[]) => {
    core = c; resEmoji = emojis;
    for (const [k, t] of Object.entries(c.tiles)) {
      let to = tiles.get(k);
      if (!to) {
        const [q, r] = parse(k), p = hexXZ(q, r, 1.02);
        const g = new THREE.Group(); g.position.set(p.x, 0, p.z); island.add(g);
        const top = new THREE.Mesh(hexGeo, topM); top.position.y = 0; top.receiveShadow = true; top.castShadow = true; top.userData.key = k; g.add(top);
        const dirt = new THREE.Mesh(dirtGeo, dirtM); dirt.position.y = -0.4; dirt.castShadow = true; g.add(dirt);
        const hang = new THREE.Mesh(T(new THREE.ConeGeometry(0.85, 1.2 + Math.abs(Math.sin(q * 3.1 + r * 1.7)) * 2.2, 6)), Math.abs(q + r) % 2 ? rockM : rockD);
        hang.rotation.x = Math.PI; hang.position.y = -0.65 - hang.geometry.parameters.height / 2; hang.rotation.y = q + r; g.add(hang);
        for (let n = 0; n < 2; n++) { const pb = new THREE.Mesh(T(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.1)), rockM); pb.position.set((Math.random() - 0.5) * 1.2, 0.2, (Math.random() - 0.5) * 1.2); if (Math.random() < 0.6) g.add(pb); }
        const bubbleCv = document.createElement('canvas'); bubbleCv.width = 192; bubbleCv.height = 96;
        const bubbleTex = T(new THREE.CanvasTexture(bubbleCv)); bubbleTex.colorSpace = THREE.SRGBColorSpace;
        const bubble = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, depthTest: false }))); bubble.scale.set(0.9, 0.45, 1); bubble.renderOrder = 6; bubble.visible = false; bubble.userData.key = k; g.add(bubble);
        to = { g, top, b: null, lv: 0, build: null, bubble, bubbleCv, bubbleTex, lastB: '' }; tiles.set(k, to);
        // a waterfall off some outer edges
        if (dist2(q, r) >= 2 && (q * 7 + r * 13) % 5 === 0) { const f = new THREE.Mesh(T(new THREE.PlaneGeometry(0.4, 5)), T(new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }))); f.position.set(p.x * 1.05, -2.6, p.z * 1.05); f.lookAt(0, -2.6, 0); island.add(f); falls.push(f); }
      }
      if ((t.b ?? null) !== to.b || (t.lv ?? 0) !== to.lv) {
        if (to.build) { to.g.remove(to.build); to.build = null; to.tick = undefined; }
        to.b = t.b ?? null; to.lv = t.lv ?? 0;
        if (t.b) { const m = buildMesh(t.b, t.lv ?? 1); m.g.position.y = 0.16; m.g.rotation.y = (parse(k)[0] * 1.3 + parse(k)[1]) % 6; to.g.add(m.g); to.build = m.g; to.tick = m.tick; m.g.traverse((x) => { x.userData.key = k; }); }
      }
    }
    for (const [k, gm] of ghosts) if (!expandMode || !front.includes(k) || c.tiles[k]) { island.remove(gm); ghosts.delete(k); }
    if (expandMode) for (const k of front) if (!ghosts.has(k)) {
      const [q, r] = parse(k), p = hexXZ(q, r, 1.02);
      const gm = new THREE.Mesh(hexGeo, ghostM); gm.position.set(p.x, 0, p.z); gm.userData.ghost = k; island.add(gm);
      const pl = sprite(plusTex, 0.6, 0.6); pl.position.y = 0.4; pl.userData.ghost = k; gm.add(pl); ghosts.set(k, gm);
    }
  };
  const dist2 = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

  // ---- balloons with orders ---------------------------------------------------------------------------------------------
  const balloonColors = ['#FF5F6D', '#FFB13D', '#7B5CFF', '#22C3FF', '#3DDC97'];
  const setOrders = (orders: SkyOrder[], now: number) => {
    const keep = new Set(orders.map((x) => x.id));
    for (const [id, b] of balloons) if (!keep.has(id)) { scene.remove(b.g); balloons.delete(id); }
    orders.forEach((od, i) => {
      let b = balloons.get(od.id);
      if (!b) {
        const g = new THREE.Group(); scene.add(g);
        const col = balloonColors[(od.id.charCodeAt(0) + i) % balloonColors.length];
        const env = new THREE.Mesh(T(new THREE.SphereGeometry(0.9, 16, 12)), std(col, { roughness: 0.6 })); env.scale.y = 1.15; env.position.y = 1.6; env.castShadow = true; g.add(env);
        const stripe = new THREE.Mesh(T(new THREE.TorusGeometry(0.88, 0.06, 6, 24)), std('#FFF4DA')); stripe.rotation.x = Math.PI / 2; stripe.position.y = 1.6; g.add(stripe);
        const basket = new THREE.Mesh(T(new THREE.BoxGeometry(0.5, 0.35, 0.5)), std('#8A5A33')); basket.position.y = 0.2; g.add(basket);
        for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) { const rp = new THREE.Mesh(T(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 3)), std('#5B3A20')); rp.position.set(x, 0.75, z); g.add(rp); }
        const bubble = sprite(emojiTex('📦', 96), 0.7, 0.7); bubble.position.y = 3.2; g.add(bubble);
        g.traverse((x) => { x.userData.balloon = od.id; });
        b = { g, a: (i / orders.length) * Math.PI * 2 + 0.6, r: 7.5 + i * 0.8, y: -0.5 + i * 0.9, ready: false, bubble }; balloons.set(od.id, b);
      }
      b.ready = Date.parse(od.ready_at) <= now;
      b.bubble.visible = b.ready;
    });
  };

  // ---- weather ---------------------------------------------------------------------------------------------------------
  const rainN = phone ? 300 : 600, rainPos = new Float32Array(rainN * 3);
  for (let i = 0; i < rainN; i++) { rainPos[i * 3] = (Math.random() - 0.5) * 30; rainPos[i * 3 + 1] = Math.random() * 16 - 4; rainPos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
  const rainGeo = T(new THREE.BufferGeometry()); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, T(new THREE.PointsMaterial({ color: '#CFE6FF', size: 0.07, transparent: true, opacity: 0.8, depthWrite: false }))); rain.visible = false; scene.add(rain);
  const arcTex = tex(256, 16, (g) => { const cols = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#7B5CFF']; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 2.7, 256, 2.8); }); });
  const arc = new THREE.Mesh(T(new THREE.TorusGeometry(26, 1.4, 4, 64, Math.PI)), T(new THREE.MeshBasicMaterial({ map: arcTex, transparent: true, opacity: 0, fog: false, depthWrite: false }))); arc.position.set(0, -6, -40); scene.add(arc);
  const streaks: THREE.Mesh[] = [];
  for (let i = 0; i < 26; i++) { const s = new THREE.Mesh(T(new THREE.PlaneGeometry(3 + Math.random() * 3, 0.05)), T(new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }))); s.position.set((Math.random() - 0.5) * 40, Math.random() * 10 - 2, (Math.random() - 0.5) * 30); s.visible = false; scene.add(s); streaks.push(s); }
  const flock: THREE.Sprite[] = []; const birdTex = emojiTex('🕊️', 64);
  for (let i = 0; i < 14; i++) { const b = sprite(birdTex, 0.8, 0.8); b.visible = false; scene.add(b); flock.push(b); }
  const greyClouds: THREE.Sprite[] = [];
  for (let i = 0; i < 16; i++) { const s = sprite(puffTex, 12 + Math.random() * 8, 5 + Math.random() * 3); (s.material as THREE.SpriteMaterial).color.set('#B9C2CC'); s.position.set((Math.random() - 0.5) * 70, 10 + Math.random() * 6, (Math.random() - 0.5) * 70); s.visible = false; scene.add(s); greyClouds.push(s); }
  const setWeather = (id: string) => {
    weather = id; windy = id === 'breezy'; night = id === 'night';
    const s = SKIES[id] ?? SKIES.clear;
    const g = skyCv.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, s.top); gr.addColorStop(0.5, s.bot); gr.addColorStop(0.62, s.top); gr.addColorStop(1, s.top); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
    (scene.fog as THREE.Fog).color.set(s.top); hemi.intensity = s.hemi; sun.intensity = s.sun; sun.color.set(s.light);
    sunDisc.visible = !night; moon.visible = night; (stars.material as THREE.PointsMaterial).opacity = night ? 0.9 : 0;
    rain.visible = id === 'rainbow' || id === 'cloudy'; (arc.material as THREE.MeshBasicMaterial).opacity = id === 'rainbow' ? 0.55 : 0;
    streaks.forEach((x) => { x.visible = windy; }); flock.forEach((x) => { x.visible = id === 'migration'; }); greyClouds.forEach((x) => { x.visible = id === 'cloudy' || id === 'rainbow'; });
    for (const sp of sea) (sp.material as THREE.SpriteMaterial).color.set(night ? '#5A5C8A' : id === 'cloudy' ? '#D7DEE6' : '#FFFFFF');
  };
  setWeather('clear');

  // ---- you, on the island -----------------------------------------------------------------------------------------------
  const meTex = new THREE.TextureLoader().load(o.explorerUrl); meTex.colorSpace = THREE.SRGBColorSpace; T(meTex);
  const me = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true, alphaTest: 0.05 }))); me.center.set(0.5, 0); me.scale.set(0.55, 0.8, 1); island.add(me);
  let meAt = { x: 0, z: 0.5 }, meTo = { x: 0, z: 0.5 }, meWait = 2;
  const sel = new THREE.Mesh(T(new THREE.RingGeometry(0.9, 1.02, 6)), T(new THREE.MeshBasicMaterial({ color: '#FFD23F', transparent: true, opacity: 0.9, depthWrite: false })));
  sel.rotation.x = -Math.PI / 2; sel.rotation.z = Math.PI / 6; sel.visible = false; island.add(sel);
  let selected: string | null = null;
  const pops: { s: THREE.Sprite; t: number; vx: number; vy: number; vz: number }[] = []; const popTex = new Map<string, THREE.Texture>();
  const burst = (k: string | null, emojis: string[]) => {
    const p = k ? hexXZ(...parse(k), 1.02) : { x: 0, z: 0 };
    emojis.slice(0, 14).forEach((e) => { let t = popTex.get(e); if (!t) { t = emojiTex(e, 96); popTex.set(e, t); } const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.scale.setScalar(0.5); s.renderOrder = 8; s.position.set(p.x, 1.2, p.z); island.add(s); pops.push({ s, t: 0, vx: (Math.random() - 0.5) * 2.5, vy: 3 + Math.random() * 2, vz: (Math.random() - 0.5) * 2.5 }); });
  };

  // ---- input: drag to turn, pinch/scroll to zoom, tap to pick ---------------------------------------------------------
  let az = 0.6, el = 0.62, zoom = 11, tAz = az, tZoom = zoom;
  const ptrs = new Map<number, { x: number; y: number }>(); let downAt: { x: number; y: number; t: number } | null = null, pinch0 = 0, moved = false;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pd = (e: PointerEvent) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; } else { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } };
  const pm = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) tZoom = Math.max(8, Math.min(30, tZoom * (pinch0 / d))); pinch0 = d; p.x = e.clientX; p.y = e.clientY; moved = true; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) moved = true;
    if (moved) { tAz -= dx * 0.008; el = Math.max(0.25, Math.min(1.2, el + dy * 0.004)); }
  };
  const pu = (e: PointerEvent) => {
    ptrs.delete(e.pointerId); if (ptrs.size) return;
    if (moved || !downAt) { downAt = null; return; } downAt = null;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([...island.children, ...[...balloons.values()].map((b) => b.g)], true);
    for (const h of hits) {
      if (h.object.userData.balloon) { o.onTapBalloon?.(h.object.userData.balloon); return; }
      if (h.object.userData.ghost) { o.onTapGhost?.(h.object.userData.ghost); return; }
      if (h.object.userData.key) { o.onTapTile?.(h.object.userData.key); return; }
    }
    o.onTapNothing?.();
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); tZoom = Math.max(8, Math.min(30, tZoom * (1 + Math.sign(e.deltaY) * 0.1))); };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu); o.canvas.addEventListener('wheel', wheel, { passive: false });

  // ---- loop -------------------------------------------------------------------------------------------------------------
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || document.hidden) return;
    tune(dt); t += dt;
    az += (tAz - az) * Math.min(1, dt * 6); zoom += (tZoom - zoom) * Math.min(1, dt * 6);
    const wide = camera.aspect < 1 ? 1 + (1 / camera.aspect - 1) * 0.55 : 1, R = zoom * wide;
    camera.position.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R + 1, Math.cos(az) * Math.cos(el) * R);
    camera.lookAt(0, -0.4, 0);
    if (!o.reduceMotion) {
      island.position.y = Math.sin(t * 0.5) * 0.12; island.rotation.z = Math.sin(t * 0.3) * 0.01;
      for (const s of sea) { s.position.x += dt * (windy ? 2.5 : 0.6); if (s.position.x > 70) s.position.x = -70; }
      for (const ob of scene.children) if (ob.userData.bob != null) ob.position.y += Math.sin(t * 0.6 + ob.userData.bob) * dt * 0.15;
      for (const f of falls) { const m = (f.material as THREE.MeshBasicMaterial).map!; m.offset.y = (m.offset.y + dt * 1.2) % 1; }
      const nowMs = Date.now();
      if (core) for (const [k, to] of tiles) {
        const st = storedFrac(k, nowMs);
        to.tick?.(t, dt, st);
        const b = to.b ? core.cfg.buildings[to.b] : null;
        if (b?.makes) {
          const n = Math.floor(storedAbs(k, nowMs));
          if (n >= 1) { to.bubble.visible = true; bubbleDraw(to, resEmoji[b.makes] ?? '✨', n, st >= 0.98, b.weather === weather); to.bubble.position.y = 2.1 + Math.sin(t * 2 + to.g.position.x) * 0.06; }
          else to.bubble.visible = false;
        } else to.bubble.visible = false;
      }
      for (const [, b] of balloons) { b.a += dt * 0.06; b.g.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(t + b.a * 3) * 0.3, Math.sin(b.a) * b.r); b.g.rotation.y = -b.a; }
      if (rain.visible) { for (let i = 0; i < rainN; i++) { rainPos[i * 3 + 1] -= dt * 14; if (rainPos[i * 3 + 1] < -6) rainPos[i * 3 + 1] = 12; } rainGeo.attributes.position.needsUpdate = true; }
      if (windy) streaks.forEach((s, i) => { s.position.x += dt * (18 + i); if (s.position.x > 25) { s.position.x = -25; s.position.y = Math.random() * 10 - 2; } (s.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 3 + i) * 0.2; });
      if (weather === 'migration') flock.forEach((b, i) => { const k = (t * 0.06 + i * 0.013) % 1; b.position.set(-35 + k * 70, 7 + Math.sin(i * 1.7) * 2 + Math.sin(t * 2 + i) * 0.3, -6 + (i % 5) * 1.4 - (i > 6 ? 3 : 0)); });
      greyClouds.forEach((s) => { if (s.visible) { s.position.x += dt * 1.2; if (s.position.x > 40) s.position.x = -40; } });
      (stars.material as THREE.PointsMaterial).size = 1.2 + Math.sin(t * 3) * 0.2;
      // you wander about the island
      meWait -= dt;
      if (meWait <= 0) { const ks = [...tiles.keys()]; const k = ks[Math.floor(Math.random() * ks.length)]; const p = hexXZ(...parse(k), 1.02); meTo = { x: p.x + 0.45, z: p.z + 0.45 }; meWait = 4 + Math.random() * 5; }
      const dx = meTo.x - meAt.x, dz = meTo.z - meAt.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const s = Math.min(d, dt * 1.4); meAt.x += (dx / d) * s; meAt.z += (dz / d) * s; me.scale.x = 0.55 * (dx > 0 ? 1 : -1); }
      me.position.set(meAt.x, 0.16 + (d > 0.05 ? Math.abs(Math.sin(t * 9)) * 0.05 : 0), meAt.z);
    }
    if (selected) { const tt = tiles.get(selected); if (tt) { sel.visible = true; sel.position.set(tt.g.position.x, 0.18, tt.g.position.z); sel.scale.setScalar(1 + Math.sin(t * 4) * 0.03); } } else sel.visible = false;
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; p.vy -= 6 * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt; p.s.material.opacity = Math.max(0, 1 - p.t / 1.4); if (p.t > 1.4) { island.remove(p.s); p.s.material.dispose(); pops.splice(i, 1); } }
    renderer.render(scene, camera);
  };
  // what a tile holds now, between server refreshes
  let storedFn: ((k: string, now: number) => number) | null = null;
  const storedAbs = (k: string, now: number) => (storedFn ? storedFn(k, now) : 0);
  const storedFrac = (k: string, now: number) => { if (!core || !storedFn) return 0; const t2 = core.tiles[k]; const b = t2?.b ? core.cfg.buildings[t2.b] : null; if (!b?.makes) return 0; const cap = b.per_hour * (1 + core.cfg.upgrade.rate_per_level * ((t2!.lv ?? 1) - 1)) * core.cfg.cap_hours; return Math.min(1, storedFn(k, now) / Math.max(1, cap)); };
  raf = requestAnimationFrame(loop);

  return {
    setIsland, setOrders, setWeather, burst,
    setStored(fn: (k: string, now: number) => number) { storedFn = fn; },
    select(k: string | null) { selected = k; },
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ tiles: tiles.size, ghosts: ghosts.size, balloons: balloons.size, weather }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); o.canvas.removeEventListener('wheel', wheel);
      for (const p of pops) p.s.material.dispose();
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
}
export type SkyScene = ReturnType<typeof createSky3D>;
