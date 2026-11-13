// A realm in 3D: you walk your explorer round the place (drag like a joystick, tap the ground to walk there, or
// WASD / arrow keys). Each place has six stations — the minigame, the stash where your producers' haul piles up,
// the build board, the maker (smelter, loom, bench, kitchen, forge), the market and the collection — and six zones
// round the edge that open up one by one as the place levels up. The producers you've built show up in their zones.
import * as THREE from 'three';
import { adaptiveDpr, framePacer, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';
import { rng } from '../home/party/kit';
import { bake, type Ctx } from '../home/live3d/kit3d';
import type { RealmKind } from '../backend/types';
import type { W3 } from '../home/live3d/sims';
import { REALM_ENVS } from './realmEnvs';

export type Station = 'play' | 'collect' | 'build' | 'make' | 'market' | 'book';
export const STATIONS: Station[] = ['play', 'collect', 'build', 'make', 'market', 'book'];
export type Spot = { x: number; z: number; label: string };
export type RealmEnv = {
  sky: string; fog: [string, number, number]; light: [string, string, number, string, number];
  /** where you can walk (x, z half-sizes) */ bounds: [number, number];
  stations: Record<Station, Spot>;
  /** the six zones, in order: each has its scenery (shown once open) and a "locked" cover */
  zones: { open: THREE.Group; locked: THREE.Group; at: [number, number] }[];
  /** build one copy of a producer (k-th copy) in its zone */ producer(id: string, k: number): THREE.Object3D | null;
  /** a themed stand for one of the place's extra games (the i-th), facing the middle; it's given the game's emoji */
  kiosk?(game: KioskGame, i: number): THREE.Object3D;
  /** where the extra games' stands go (defaults to GAME_SPOTS) */ gameSpots?: [number, number][];
  update(t: number, dt: number): void;
};
export type KioskGame = { id: string; emoji: string; name: string; color: string };
/** a place's extra game stands: the four corridors between the stations */
export const GAME_SPOTS: [number, number][] = [[-3.4, -2.3], [3.4, -2.3], [-3.4, 2.5], [3.4, 2.5]];
/** something you can be standing at: one of the six stations, or a game stand (game:<id>) */
export type NearKey = Station | `game:${string}`;
export type RealmSceneOpts = {
  canvas: HTMLCanvasElement; kind: RealmKind; explorerUrl: string; seed: number; reduceMotion?: boolean;
  zoneLevels: number[]; producerIds: string[];
  /** the place's other games (beyond the signature one at "play"), each on its own stand */
  games?: (KioskGame & { level: number })[];
  onNear?(s: NearKey | null): void;
};

export function createRealm3D(o: RealmSceneOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const fps = framePacer({ ambient: true });
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d), undefined, fps);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const std = (c: string, p: THREE.MeshStandardMaterialParameters = {}) => { const k = c + JSON.stringify(p, (kk, v) => (v instanceof THREE.Texture ? v.uuid : v)); let m = mats.get(k); if (!m) { m = T(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...p })); mats.set(k, m); } return m; };
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void, rep = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; d(c.getContext('2d')!); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; return t; };
  const root = new THREE.Group(), dyn = new THREE.Group(), props: THREE.Group[] = [];
  scene.add(root, dyn);
  const ctx: Ctx = { scene, root, dyn, props, T, std, tex, w: { t: 0, ps: [], seed: o.seed } as W3, obs: [], phone, r: rng(o.seed * 13 + 5), colors: [], prop: () => { const g = new THREE.Group(); scene.add(g); props.push(g); return g; } };
  const env = REALM_ENVS[o.kind](ctx);
  bake(root, T);
  scene.background = new THREE.Color(env.sky); scene.fog = new THREE.Fog(env.fog[0], env.fog[1], env.fog[2]);
  const [skyC, groundC, hemi, sunC, sunI] = env.light;
  scene.add(new THREE.HemisphereLight(skyC, groundC, hemi));
  const sun = new THREE.DirectionalLight(sunC, sunI); sun.castShadow = true; sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 }); sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // ---- floating labels over the stations ----
  const label = (text: string, sub: string, color = '#ffffff') => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d')!;
    g.font = '800 44px ui-rounded, system-ui, sans-serif'; const w = Math.min(500, Math.max(g.measureText(text).width, 200) + 48);
    g.fillStyle = 'rgba(15,10,25,0.72)'; g.beginPath(); g.roundRect((512 - w) / 2, 8, w, 84, 30); g.fill();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 46);
    if (sub) { g.font = '700 22px ui-rounded, system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(sub, 256, 78); }
    const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }))); s.renderOrder = 3; s.scale.set(2.6, 0.65, 1); return s;
  };
  const tags = new Map<Station, THREE.Sprite>();
  for (const st of Object.keys(env.stations) as Station[]) { const sp = env.stations[st]; const l = label(sp.label, ''); l.position.set(sp.x, 3.6, sp.z); scene.add(l); tags.set(st, l); }
  // the stash glows when there's something to collect
  const glow = new THREE.Mesh(T(new THREE.RingGeometry(0.9, 1.25, 40)), T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0, depthWrite: false })));
  glow.rotation.x = -Math.PI / 2; glow.position.set(env.stations.collect.x, 0.04, env.stations.collect.z); scene.add(glow);
  let glowOn = false;

  // ---- zones: open or locked (with the level it opens at) ----
  const zoneTags: THREE.Sprite[] = [];
  env.zones.forEach((z, i) => {
    scene.add(z.open, z.locked); bake(z.open, T); bake(z.locked, T);
    const l = label(`🔒 Level ${o.zoneLevels[i] ?? '?'}`, ''); l.position.set(z.at[0], 2.8, z.at[1]); l.scale.multiplyScalar(0.8); scene.add(l); zoneTags.push(l);
  });
  // ---- extra game stands: a themed kiosk each, a name tag, and a lock until the place is high enough ----
  const spots = new Map<string, { x: number; z: number; lock: THREE.Sprite; tag: THREE.Sprite; level: number; kiosk: THREE.Object3D }>();
  (o.games ?? []).forEach((gm, i) => {
    const at = (env.gameSpots ?? GAME_SPOTS)[i]; if (!at) return;
    const k = env.kiosk ? env.kiosk(gm, i) : defaultKiosk(gm);
    k.position.set(at[0], 0, at[1]); k.rotation.y = Math.atan2(-at[0], -at[1]) * 0.35; k.traverse((m) => { m.castShadow = true; }); scene.add(k);
    const tag = label(`${gm.emoji} ${gm.name}`, '', gm.color); tag.position.set(at[0], 3.1, at[1]); tag.scale.multiplyScalar(0.85); scene.add(tag);
    const lock = label(`🔒 Level ${gm.level}`, ''); lock.position.set(at[0], 2.35, at[1]); lock.scale.multiplyScalar(0.7); scene.add(lock);
    spots.set(gm.id, { x: at[0], z: at[1], lock, tag, level: gm.level, kiosk: k });
  });
  function defaultKiosk(gm: KioskGame) {
    const g = new THREE.Group();
    const m = (geo: THREE.BufferGeometry, c: string, y: number, p: THREE.MeshStandardMaterialParameters = {}) => { const x = new THREE.Mesh(T(geo), std(c, p)); x.position.y = y; g.add(x); return x; };
    m(new THREE.CylinderGeometry(0.7, 0.85, 0.5, 20), '#2A2440', 0.25); m(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 20), gm.color, 0.55, { emissive: gm.color, emissiveIntensity: 0.6 });
    return g;
  }
  // a big emoji over every stand, so you can tell them apart from across the place
  const emojiSprite = (e: string, size: number) => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; g.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true }))); sp.scale.setScalar(size); return sp; };
  const floaters: THREE.Sprite[] = [];
  (o.games ?? []).forEach((gm) => { const sp = spots.get(gm.id); if (!sp) return; const f = emojiSprite(gm.emoji, 0.9); f.position.set(sp.x, 1.9, sp.z); scene.add(f); floaters.push(f); });

  // ---- producers ----
  const built = new Map<string, THREE.Object3D[]>();
  const setProducers = (lv: Record<string, number>) => {
    for (const id of o.producerIds) {
      const want = lv[id] ? Math.min(4, 1 + Math.floor(lv[id] / 10)) : 0, have = built.get(id) ?? [];
      while (have.length < want) { const m = env.producer(id, have.length); if (!m) break; scene.add(m); have.push(m); }
      while (have.length > want) have.pop()!.removeFromParent();
      built.set(id, have);
    }
  };
  const setLevel = (level: number) => {
    env.zones.forEach((z, i) => { const open = level >= (o.zoneLevels[i] ?? 99); z.open.visible = open; z.locked.visible = !open; zoneTags[i].visible = !open; });
    spots.forEach((sp) => { sp.lock.visible = level < sp.level; sp.kiosk.traverse((m) => { const mm = (m as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mm && 'emissiveIntensity' in mm && mm.userData.base === undefined) mm.userData.base = mm.emissiveIntensity; if (mm && mm.userData.base !== undefined) mm.emissiveIntensity = level < sp.level ? 0 : mm.userData.base; }); });
  };

  // ---- you ----
  const meTex = T(new THREE.TextureLoader().load(o.explorerUrl)); meTex.colorSpace = THREE.SRGBColorSpace; meTex.wrapS = THREE.RepeatWrapping;
  const me = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true, alphaTest: 0.05 }))); me.center.set(0.5, 0); me.scale.set(1.5 * (46 / 68), 1.5, 1); scene.add(me);
  const ghost = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false, color: '#B8C8FF' }))); ghost.center.set(0.5, 0); ghost.scale.copy(me.scale); ghost.renderOrder = 4; scene.add(ghost);
  const shadow = new THREE.Mesh(T(new THREE.CircleGeometry(0.36, 18)), T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }))); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const pos = new THREE.Vector2(0, 1.2), vel = new THREE.Vector2();
  let target: THREE.Vector2 | null = null, stick: { x: number; y: number } | null = null, walk = 0, face = 1;
  const keys = new Set<string>();
  const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k) && !(e.target instanceof HTMLInputElement)) { keys.add(k); target = null; } };
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  // drag = joystick; a quick tap = walk there
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let down: { x: number; y: number; t: number; id: number } | null = null;
  const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; o.canvas.setPointerCapture(e.pointerId); };
  const pm = (e: PointerEvent) => { if (!down || e.pointerId !== down.id) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.hypot(dx, dy) > 12) { stick = { x: Math.max(-1, Math.min(1, dx / 60)), y: Math.max(-1, Math.min(1, dy / 60)) }; target = null; } };
  const pu = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    if (!stick && performance.now() - down.t < 400) {
      const r = o.canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      if (ray.ray.intersectPlane(ground, hit)) target = new THREE.Vector2(hit.x, hit.z);
    }
    stick = null; down = null;
  };
  o.canvas.addEventListener('pointerdown', pd); o.canvas.addEventListener('pointermove', pm); o.canvas.addEventListener('pointerup', pu); o.canvas.addEventListener('pointercancel', pu);

  // little bursts of emojis (what you collected, made, sold)
  const bursts: { s: THREE.Sprite; v: THREE.Vector3; life: number }[] = [];
  const emojiTex = new Map<string, THREE.CanvasTexture>();
  const burst = (at: NearKey, emojis: string[]) => {
    const sp = at.startsWith('game:') ? spots.get(at.slice(5)) ?? env.stations.play : env.stations[at as Station];
    emojis.slice(0, 14).forEach((e, i) => {
      let t = emojiTex.get(e);
      if (!t) { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d')!; g.font = '72px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 48, 54); t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; emojiTex.set(e, t); }
      const s = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }))); s.scale.setScalar(0.6); s.position.set(sp.x, 1.4, sp.z); scene.add(s);
      const a = (i / Math.max(1, emojis.length)) * Math.PI * 2; bursts.push({ s, v: new THREE.Vector3(Math.cos(a) * 1.6, 4 + Math.random() * 2, Math.sin(a) * 1.6), life: 1.3 });
    });
  };

  // ---- camera ----
  const camPos = new THREE.Vector3(0, 20, 24), look = new THREE.Vector3();
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let near: NearKey | null = null, last = performance.now(), raf = 0, stop = false;
  const tick = () => {
    if (stop) return;
    raf = requestAnimationFrame(tick);
    if (!fps.ready(performance.now())) return;
    const now = performance.now(), raw = (now - last) / 1000, dt = Math.min(0.05, raw), t = now / 1000; last = now; tune(raw);
    // move
    let ix = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0), iz = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
    if (stick) { ix = stick.x; iz = stick.y; }
    if (!ix && !iz && target) { const d = target.clone().sub(pos); if (d.length() < 0.2) target = null; else { d.normalize(); ix = d.x; iz = d.y; } }
    const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
    vel.lerp(new THREE.Vector2(ix * 6, iz * 6), Math.min(1, dt * 10));
    pos.addScaledVector(vel, dt);
    pos.x = Math.max(-env.bounds[0], Math.min(env.bounds[0], pos.x)); pos.y = Math.max(-env.bounds[1], Math.min(env.bounds[1], pos.y));
    const moving = vel.length() > 0.3; if (moving) walk += dt * 10; if (Math.abs(vel.x) > 0.2) face = vel.x > 0 ? 1 : -1;
    meTex.repeat.x = face; meTex.offset.x = face < 0 ? 1 : 0;
    const bob = moving && !o.reduceMotion ? Math.abs(Math.sin(walk)) * 0.1 : 0;
    me.position.set(pos.x, bob, pos.y); ghost.position.copy(me.position); shadow.position.set(pos.x, 0.03, pos.y);
    // near a station?
    let nk: NearKey | null = null, best = 2.1;
    for (const st of Object.keys(env.stations) as Station[]) { const sp = env.stations[st], d = Math.hypot(sp.x - pos.x, sp.z - pos.y); if (d < best) { best = d; nk = st; } }
    spots.forEach((sp, id) => { const d = Math.hypot(sp.x - pos.x, sp.z - pos.y); if (d < Math.min(best, 1.7)) { best = d; nk = `game:${id}`; } });
    floaters.forEach((f, i) => { f.position.y = 1.9 + Math.sin(t * 2 + i) * 0.12; });
    spots.forEach((sp, id) => { const on = near === `game:${id}`; sp.tag.material.opacity = on ? 1 : 0.8; sp.tag.position.y = 3.1 + (on ? Math.sin(t * 4) * 0.08 : 0); });
    if (nk !== near) { near = nk; o.onNear?.(nk); }
    tags.forEach((s, st) => { s.material.opacity = st === near ? 1 : 0.8; s.position.y = 3.6 + (st === near ? Math.sin(t * 4) * 0.08 : 0); });
    (glow.material as THREE.MeshBasicMaterial).opacity = glowOn ? 0.45 + Math.sin(t * 3) * 0.25 : 0;
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.life -= dt; b.v.y -= 9 * dt; b.s.position.addScaledVector(b.v, dt); b.s.material.opacity = Math.min(1, b.life * 2); if (b.life <= 0) { b.s.removeFromParent(); bursts.splice(i, 1); } }
    env.update(t, dt);
    // camera behind and above you
    const tall = camera.aspect < 1, back = tall ? 1.3 : 1;
    // high enough to take in the whole place (and the zones round it), leaning towards wherever you are
    camPos.lerp(new THREE.Vector3(pos.x * 0.55, 15 * back, pos.y * 0.6 + 13.5 * back), Math.min(1, dt * 4));
    look.lerp(new THREE.Vector3(pos.x * 0.6, 0, pos.y * 0.6 - 2.5), Math.min(1, dt * 5));
    camera.position.copy(camPos); camera.lookAt(look);
    sun.position.set(look.x + 10, 22, look.z + 12); sun.target.position.copy(look);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);
  return {
    setState(level: number, producers: Record<string, number>, pending: boolean) { setLevel(level); setProducers(producers); glowOn = pending; },
    walkTo(st: NearKey) { const sp = st.startsWith('game:') ? spots.get(st.slice(5)) : env.stations[st as Station]; if (sp) target = new THREE.Vector2(sp.x, sp.z + (st.startsWith('game:') ? 1.1 : 1.3)); },
    burst,
    dispose() {
      stop = true; cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      o.canvas.removeEventListener('pointerdown', pd); o.canvas.removeEventListener('pointermove', pm); o.canvas.removeEventListener('pointerup', pu); o.canvas.removeEventListener('pointercancel', pu);
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
}
export type RealmScene = ReturnType<typeof createRealm3D>;
