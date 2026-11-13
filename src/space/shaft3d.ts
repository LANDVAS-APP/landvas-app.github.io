// Inside your shaft: a 4 m square hole going straight down through the planet's layers, at real scale.
// Your explorer stands at the dig face with a pickaxe; walls are textured per layer, lamps every 10 m,
// depth signs on the wall, and a lift you can ride up and down to look at the whole thing.
// Only the stretch of shaft near the camera is built, so a 20 km shaft costs the same as a 20 m one.
import { framePacer, sceneDpr } from '../lib/gfx';
import * as THREE from 'three';

export type ShaftLayer = { id: string; name: string; to: number; color: string; finds: Record<string, number> };
export type ShaftOpts = {
  canvas: HTMLCanvasElement; layers: ShaftLayer[]; explorerUrl: string; accent: string;
  sky: [string, string]; ground: string; itemEmoji: Record<string, string>; reduceMotion?: boolean;
  /** where the camera is looking (metres down), as it moves */ onView?(depth: number): void;
};
export type ShaftScene = {
  setDepth(depth: number, cored: boolean): void;
  /** a swing of the pickaxe (and what turned up) */ swing(finds?: string[]): void;
  /** ride the lift to look at this depth (null: back down to the dig face) */ lookAt(depth: number | null): void;
  /** the ride down from the surface when you climb in */ descend(): void;
  /** and back up when you leave; resolves at the top */ ascend(): Promise<void>;
  dispose(): void;
};

const W = 4; // shaft width (m)
const EYE = 7;

function rockTexture(base: string, ores: string[], seed: number) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  let s = seed >>> 0 || 1; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const col = new THREE.Color(base);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  // strata and blotches
  for (let i = 0; i < 9; i++) { const y = r() * 256; g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; g.fillRect(0, y, 256, 4 + r() * 14); }
  for (let i = 0; i < 70; i++) {
    const v = col.clone().offsetHSL(0, (r() - 0.5) * 0.08, (r() - 0.5) * 0.18);
    g.fillStyle = `#${v.getHexString()}`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 6 + r() * 26, 4 + r() * 14, r() * 3, 0, Math.PI * 2); g.fill();
  }
  // cracks
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) { g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  // glints of what's in this layer
  for (const o of ores) for (let i = 0; i < 6; i++) {
    const x = r() * 256, y = r() * 256, n = 2 + r() * 4;
    g.fillStyle = o; g.beginPath(); g.moveTo(x, y - n); g.lineTo(x + n, y); g.lineTo(x, y + n); g.lineTo(x - n, y); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x - 0.5, y - n * 0.6, 1, 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const ORE_COLORS: Record<string, string> = { ice: '#CFEFFF', iron: '#9AA3B5', copper: '#E58A3A', crystal: '#B69CFF', titanium: '#DDE6F0', gem: '#4FE3D0', plasma: '#FF5CA8', core: '#FFB020', dust: '#D8D2C4', stone: '#8E877B' };

function textSprite(text: string, color: string, bg = 'rgba(10,12,30,0.7)') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '800 54px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(500, g.measureText(text).width + 50);
  g.fillStyle = bg; g.beginPath(); g.roundRect(256 - w / 2, 18, w, 92, 22); g.fill();
  g.fillStyle = color; g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(2.4, 0.6, 1);
  return s;
}
function emojiSprite(e: string, size = 0.7) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; g.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.setScalar(size);
  return s;
}

export function createShaft(o: ShaftOpts): ShaftScene {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: !/Mobi|Android/i.test(navigator.userAgent), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  const skyTop = new THREE.Color(o.sky[0]), skyLow = new THREE.Color(o.sky[1]);
  const dark = new THREE.Color('#05060c');
  scene.background = skyLow.clone();
  const amb = new THREE.AmbientLight('#ffffff', 0.5); scene.add(amb);
  const sun = new THREE.DirectionalLight('#ffffff', 1.2); sun.position.set(2, 10, 3); scene.add(sun);
  // your headlamp
  const lamp = new THREE.SpotLight('#FFE9C2', 18, 30, 0.9, 0.5, 1.3); scene.add(lamp, lamp.target);
  // the lamps on the walls near the camera share a few lights
  const wallLights = Array.from({ length: 3 }, () => { const l = new THREE.PointLight('#FFC97A', 6, 14, 1.6); scene.add(l); return l; });

  // the surface round the hole, and the sky through it
  const groundMat = track(new THREE.MeshStandardMaterial({ color: o.ground, roughness: 1 }));
  for (const [x, z, w, d] of [[0, -(W / 2 + 15), 34, 30], [0, W / 2 + 15, 34, 30], [-(W / 2 + 15), 0, 30, W], [W / 2 + 15, 0, 30, W]] as const) {
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, d)), groundMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0, z); scene.add(m);
  }

  // layer textures (one per layer, made once)
  const tex = o.layers.map((l, i) => rockTexture(l.color, Object.keys(l.finds).map((k) => ORE_COLORS[k]).filter(Boolean), 1234 + i * 977));
  tex.forEach((t) => track(t));
  const wallMats = tex.map((t) => track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide })));
  const floorMats = tex.map((t) => track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, color: '#dddddd' })));
  const coreMat = track(new THREE.MeshStandardMaterial({ color: '#FFB020', emissive: '#FF7A1A', emissiveIntensity: 2.5 }));
  const layerAt = (m: number) => { const i = o.layers.findIndex((l) => m < l.to); return i < 0 ? o.layers.length - 1 : i; };

  let depth = 0, cored = false;
  let view = 0, viewTo = 0, following = true; // how far down the camera is
  const wallGroup = new THREE.Group(); scene.add(wallGroup);
  const signGroup = new THREE.Group(); scene.add(signGroup);
  let built = { a: 1, b: -1 }; let builtView = -1e9;
  const lampGeo = track(new THREE.BoxGeometry(0.25, 0.18, 0.12)), lampMat = track(new THREE.MeshStandardMaterial({ color: '#FFD27A', emissive: '#FFB347', emissiveIntensity: 2 }));
  const railGeo = track(new THREE.BoxGeometry(0.08, 1, 0.08)), railMat = track(new THREE.MeshStandardMaterial({ color: '#59647D', metalness: 0.6, roughness: 0.4 }));
  const lampSpots: THREE.Vector3[] = [];
  /** build the walls, lamps and signs from a to b metres down */
  const buildWalls = (a: number, b: number) => {
    for (const c of [...wallGroup.children]) { wallGroup.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    for (const c of [...signGroup.children]) { signGroup.remove(c); const s = c as THREE.Sprite; s.material?.map?.dispose(); s.material?.dispose(); }
    lampSpots.length = 0;
    // walls run a little past the dig face (the floor hides them), so digging doesn't need a rebuild
    a = Math.max(0, a);
    built = { a, b }; builtView = view;
    if (b <= a) return;
    // a stretch of wall per layer
    let from = 0;
    o.layers.forEach((l, i) => {
      const y0 = Math.max(a, from), y1 = Math.min(b, l.to); from = l.to;
      if (y1 <= y0) return;
      const h = y1 - y0, mid = -(y0 + y1) / 2;
      for (let k = 0; k < 4; k++) {
        const g = new THREE.PlaneGeometry(W, h);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) + k * 0.37, (uv.getY(j) * h - y0) / W);
        const m = new THREE.Mesh(g, wallMats[i]);
        const ang = (k * Math.PI) / 2;
        m.position.set(Math.sin(ang) * (W / 2), mid, Math.cos(ang) * (W / 2)); m.rotation.y = ang + Math.PI;
        wallGroup.add(m);
      }
    });
    // lamps every 10 m, depth signs every 10 m (every 100 m further down), and a sign where each layer starts
    for (let y = Math.ceil(a / 10) * 10; y <= b; y += 10) {
      if (y === 0) continue;
      const k = (y / 10) % 4, ang = (k * Math.PI) / 2;
      const p = new THREE.Vector3(Math.sin(ang) * (W / 2 - 0.08), -y + 1.6, Math.cos(ang) * (W / 2 - 0.08));
      const lm = new THREE.Mesh(lampGeo, lampMat); lm.position.copy(p); lm.rotation.y = ang; wallGroup.add(lm);
      lampSpots.push(p.clone().multiplyScalar(0.8).setY(p.y));
      if (y < 200 || y % 100 === 0) {
        const s = textSprite(`${y.toLocaleString()} m`, '#FFE36B'); s.position.set(Math.sin(ang + Math.PI) * (W / 2 - 0.3), -y + 0.9, Math.cos(ang + Math.PI) * (W / 2 - 0.3)); signGroup.add(s);
      }
    }
    from = 0;
    for (const l of o.layers) {
      if (from > 0 && from >= a && from <= b) { const s = textSprite(`▼ ${l.name}`, '#ffffff', 'rgba(120,40,160,0.75)'); s.scale.set(3, 0.75, 1); s.position.set(0, -from - 0.2, -W / 2 + 0.25); signGroup.add(s); }
      from = l.to;
    }
    // the lift rail down one corner
    const rail = new THREE.Mesh(railGeo, railMat); rail.scale.y = b - a; rail.position.set(W / 2 - 0.15, -(a + b) / 2, W / 2 - 0.15); wallGroup.add(rail);
  };

  // the dig face, you, your pickaxe
  const floor = new THREE.Mesh(track(new THREE.BoxGeometry(W, 0.6, W)), floorMats[0]); scene.add(floor);
  const crackTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!; g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 3; for (let i = 0; i < 14; i++) { g.beginPath(); let x = 128, y = 128; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += Math.cos(i * 0.45 + k * 0.3) * 22; y += Math.sin(i * 0.45 + k * 0.3) * 22; g.lineTo(x, y); } g.stroke(); } const t = new THREE.CanvasTexture(c); return track(t); })();
  const crackMat = track(new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false }));
  const cracks = new THREE.Mesh(track(new THREE.PlaneGeometry(W * 0.9, W * 0.9)), crackMat); cracks.rotation.x = -Math.PI / 2; scene.add(cracks);
  const meTex = new THREE.TextureLoader().load(o.explorerUrl); meTex.colorSpace = THREE.SRGBColorSpace; track(meTex);
  const me = new THREE.Sprite(new THREE.SpriteMaterial({ map: meTex, transparent: true })); me.center.set(0.5, 0); me.scale.set(1.5, 1.5, 1); scene.add(me);
  const pick = emojiSprite('⛏️', 0.6); scene.add(pick);
  const coreGlow = emojiSprite('✨', 3); coreGlow.visible = false; scene.add(coreGlow);

  // flying bits
  type Bit = { m: THREE.Mesh; v: THREE.Vector3; life: number };
  const bits: Bit[] = [];
  const bitGeo = track(new THREE.BoxGeometry(0.12, 0.12, 0.12));
  const bitMats = o.layers.map((l) => track(new THREE.MeshStandardMaterial({ color: l.color, roughness: 1 })));
  type Pop = { s: THREE.Sprite; v: number; life: number };
  const pops: Pop[] = [];
  let swingT = 0, shake = 0, crack = 0;

  const resize = () => {
    const r = o.canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(1, r.width) / Math.max(1, r.height); camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();

  const fps = framePacer({ ambient: true });

  let raf = 0, last = performance.now(), lastView = -1;
  let ride: { from: number; to: number; t: number; dur: number; done?: () => void } | null = null;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!fps.ready(performance.now())) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (ride) {
      ride.t += dt;
      const k = Math.min(1, ride.t / ride.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      view = ride.from + (ride.to - ride.from) * e;
      if (k >= 1) { const d = ride.done; ride = null; d?.(); }
    } else {
      if (following) viewTo = depth;
      view += (viewTo - view) * Math.min(1, dt * 5);
    }
    if (Math.abs(view - lastView) > 0.5) { lastView = view; o.onView?.(view); }
    // keep ~70 m of shaft built round the camera
    if (Math.abs(view - builtView) > 10 || depth + 2 > built.b) buildWalls(view - 50, Math.max(view, depth) + 25);
    // the dig face and you on it
    const li = layerAt(Math.max(0, depth - 0.01));
    floor.material = cored ? coreMat : floorMats[li];
    floor.position.y = -depth - 0.3;
    cracks.position.y = -depth + 0.01; crack = Math.max(0, crack - dt * 0.8); crackMat.opacity = Math.min(0.45, crack);
    me.position.set(-0.6, -depth, 0.3);
    swingT = Math.max(0, swingT - dt * 4);
    const sw = Math.sin((1 - swingT) * Math.PI) * (swingT > 0 ? 1 : 0);
    pick.position.set(0.15 + sw * 0.3, -depth + 1.1 - sw * 0.6, 0.35); (pick.material as THREE.SpriteMaterial).rotation = -0.4 - sw * 1.4;
    coreGlow.visible = cored; coreGlow.position.set(0, -depth + 1, 0); (coreGlow.material as THREE.SpriteMaterial).opacity = 0.6 + 0.4 * Math.sin(now / 300);
    // camera: just above where you're looking, peering down the shaft
    shake = Math.max(0, shake - dt * 5);
    const sx = o.reduceMotion ? 0 : (Math.random() - 0.5) * shake * 0.08;
    const top = -view + EYE + (view < 3 ? 3 - view : 0);
    camera.position.set(1.35 + sx, top, 1.45);
    camera.lookAt(-0.3, -view - 0.4, -0.2);
    // light: daylight at the top, your lamp and the wall lamps below
    const deepness = Math.min(1, view / 25);
    scene.background = (scene.background as THREE.Color).copy(skyLow).lerp(dark, deepness);
    amb.intensity = 0.55 - 0.42 * deepness; sun.intensity = 1.2 * (1 - deepness);
    lamp.position.set(0.6, -depth + 2.2, 0.6); lamp.target.position.set(-0.2, -depth, -0.2);
    lamp.intensity = 6 + 14 * deepness;
    const near = lampSpots.map((p) => ({ p, d: Math.abs(-p.y - view) })).sort((a, b) => a.d - b.d);
    wallLights.forEach((l, i) => { const x = near[i]; l.visible = !!x && x.d < 18; if (x) l.position.copy(x.p); });
    // bits and finds
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; b.life -= dt; b.v.y -= 9 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 6;
      if (b.m.position.y < -depth + 0.06) { b.m.position.y = -depth + 0.06; b.v.multiplyScalar(0.4); b.v.y = Math.abs(b.v.y) * 0.3; }
      if (b.life <= 0) { scene.remove(b.m); bits.splice(i, 1); }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= dt; p.s.position.y += p.v * dt; p.v *= 0.97; (p.s.material as THREE.SpriteMaterial).opacity = Math.min(1, p.life);
      if (p.life <= 0) { scene.remove(p.s); p.s.material.map?.dispose(); p.s.material.dispose(); pops.splice(i, 1); }
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setDepth(d, c) { depth = Math.max(0, d); cored = c; },
    swing(finds = []) {
      swingT = 1; shake = 1; crack = Math.min(1, crack + 0.35);
      const li = layerAt(Math.max(0, depth - 0.01));
      for (let i = 0; i < (o.reduceMotion ? 3 : 7); i++) {
        if (bits.length > 60) break;
        const m = new THREE.Mesh(bitGeo, bitMats[li]); m.position.set(0.1 + (Math.random() - 0.5) * 0.6, -depth + 0.1, 0.1 + (Math.random() - 0.5) * 0.6);
        scene.add(m); bits.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3), life: 1.2 });
      }
      finds.forEach((f, i) => {
        const s = emojiSprite(o.itemEmoji[f] ?? '✨', 0.75); s.position.set(-0.2 + i * 0.4, -depth + 0.7, 0); scene.add(s);
        pops.push({ s, v: 1.6, life: 1.6 });
      });
    },
    lookAt(d) {
      if (d === null) { following = true; return; }
      following = false; viewTo = Math.max(0, Math.min(depth, d));
    },
    descend() { following = true; ride = { from: 0, to: depth, t: 0, dur: Math.min(4, 1.2 + Math.log10(depth + 1) * 0.9) }; view = 0; },
    ascend() {
      return new Promise<void>((res) => { following = false; ride = { from: view, to: 0, t: 0, dur: Math.min(3, 0.8 + Math.log10(view + 1) * 0.7), done: res }; });
    },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      buildWalls(0, 0);
      for (const b of bits) scene.remove(b.m);
      for (const p of pops) { p.s.material.map?.dispose(); p.s.material.dispose(); }
      for (const s of [pick, coreGlow, me]) { s.material.map?.dispose(); s.material.dispose(); }
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
