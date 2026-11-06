// The Dungeon in 3D. At camp: a campfire under the stars at the dungeon gate, tents, your heroes warming their
// hands. Inside: stone rooms joined by corridors, lit by flickering torches; you only see rooms next to where you've
// been (the rest is darkness). Chests with gold trim (they open), spike traps, a glowing shrine crystal, stairs
// spiralling down, monsters that bob and glare, and a boss on its dais every fifth floor. Your party walks room to
// room together, carrying a lantern. In a fight they line up facing the monsters and every blow plays out: lunges,
// flashes, damage numbers, heals, stuns, and monsters crumbling to dust.
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../../lib/gfx';
import { nb, parse, type Enemy, type LogEntry, type PartyHero, type Run } from './dungeonCore';

export type DungeonOpts = { canvas: HTMLCanvasElement; heroes: Record<string, { color: string; emoji: string }>; reduceMotion?: boolean; onTapRoom?(k: string): void };
const S = 5; // room spacing
const ICON: Record<string, string> = { monster: '👹', boss: '☠️', chest: '🧰', trap: '⚠️', shrine: '💎', stairs: '🪜' };

export function createDungeon3D(o: DungeonOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !phone; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0B0910');
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...p }));
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; d(cv.getContext('2d')!); const t = T(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const cache = new Map<string, THREE.Texture>();
  const emojiTex = (e: string) => { let t = cache.get(e); if (!t) { t = tex(128, 128, (g) => { g.font = '100px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72); }); cache.set(e, t); } return t; };
  const textTex = (s: string, col: string) => { const k = `t:${s}:${col}`; let t = cache.get(k); if (!t) { t = tex(256, 96, (g) => { g.font = '900 64px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#120A10'; g.strokeText(s, 128, 50); g.fillStyle = col; g.fillText(s, 128, 50); }); cache.set(k, t); } return t; };
  const sprite = (t: THREE.Texture, w: number, h = w, add = false) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })); s.scale.set(w, h, 1); return s; };
  const glowTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const flameTex = tex(64, 96, (g) => { const gr = g.createRadialGradient(32, 64, 2, 32, 56, 30); gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(0.4, 'rgba(255,170,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(58, 60, 32, 92); g.quadraticCurveTo(6, 60, 32, 4); g.fill(); });
  const stoneTex = tex(256, 256, (g) => { g.fillStyle = '#3B3542'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const l = 22 + Math.random() * 10; g.fillStyle = `hsl(265, 8%, ${l}%)`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(x * 64 + Math.random() * 60, y * 64 + Math.random() * 60, 3, 3); } } });
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  const brickTex = tex(128, 128, (g) => { g.fillStyle = '#211C26'; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 21) for (let x = (y / 21) % 2 ? -21 : 0; x < 128; x += 42) { g.fillStyle = `hsl(260, 10%, ${18 + Math.random() * 10}%)`; g.fillRect(x + 2, y + 2, 38, 17); } });
  brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
  const floorM = std('#ffffff', { map: stoneTex }), wallM = std('#E8E0F8', { map: brickTex }), dimM = std('#8A80A0', { map: stoneTex, roughness: 1 });
  const woodM = std('#7A4A26'), goldM = std('#E8B83A', { metalness: 0.8, roughness: 0.3 }), ironM = std('#55505E', { metalness: 0.7, roughness: 0.45 });
  const geo = new Map<string, THREE.BufferGeometry>();
  const G = (k: string, f: () => THREE.BufferGeometry) => { let x = geo.get(k); if (!x) { x = T(f()); geo.set(k, x); } return x; };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };

  // ---- light ----------------------------------------------------------------------------------------------------------
  const amb = new THREE.HemisphereLight('#8A7AB0', '#1A1220', 0.55); scene.add(amb);
  const moon = new THREE.DirectionalLight('#9AA8FF', 0.6); moon.position.set(-6, 14, 6); scene.add(moon, moon.target);
  const lantern = new THREE.PointLight('#FFC27A', 30, 16, 1.4); lantern.castShadow = !phone; scene.add(lantern);

  // ---- the camp -------------------------------------------------------------------------------------------------------
  const camp = new THREE.Group(); scene.add(camp);
  {
    const grass = tex(128, 128, (g) => { g.fillStyle = '#1E3A2A'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 500; i++) { g.fillStyle = `hsl(${120 + Math.random() * 30}, 30%, ${14 + Math.random() * 14}%)`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 4); } }); grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(8, 8);
    mesh(G('campfloor', () => new THREE.CircleGeometry(14, 40)), std('#ffffff', { map: grass }), 0, 0, 0, camp).rotation.x = -Math.PI / 2;
    // the dungeon gate in a cliff
    const rock = std('#3A3440', { roughness: 1 });
    for (const [x, h, s] of [[-5, 5, 3], [-2.5, 6.5, 2.6], [2.5, 6.2, 2.8], [5, 4.6, 3.2], [0, 7, 2]] as const) { const m = mesh(G(`rock${x}`, () => new THREE.DodecahedronGeometry(s, 0)), rock, x, h / 2, -6.5, camp); m.scale.y = h / s / 1.4; }
    const gate = new THREE.Group(); gate.position.set(0, 0, -4.6); camp.add(gate);
    mesh(G('gateArch', () => new THREE.TorusGeometry(1.3, 0.35, 8, 20, Math.PI)), std('#5A5266'), 0, 1.6, 0, gate);
    for (const s of [-1, 1]) mesh(G('gatePost', () => new THREE.BoxGeometry(0.7, 1.6, 0.7)), std('#5A5266'), s * 1.3, 0.8, 0, gate);
    mesh(G('gateDark', () => new THREE.CircleGeometry(1.0, 20, 0, Math.PI)), new THREE.MeshBasicMaterial({ color: '#000' }), 0, 1.6, -0.05, gate);
    mesh(G('gateDark2', () => new THREE.PlaneGeometry(2, 1.6)), new THREE.MeshBasicMaterial({ color: '#000' }), 0, 0.8, -0.05, gate);
    const skull = sprite(emojiTex('💀'), 0.6); skull.position.set(0, 3.2, -4.3); camp.add(skull);
    // the campfire
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mesh(G('fireStone', () => new THREE.DodecahedronGeometry(0.22, 0)), std('#6A6270'), Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7 + 1, camp); }
    for (let i = 0; i < 3; i++) { const l = mesh(G('log', () => new THREE.CylinderGeometry(0.09, 0.09, 1, 8)), woodM, 0, 0.15, 1, camp); l.rotation.z = Math.PI / 2; l.rotation.y = (i / 3) * Math.PI; }
    // tents
    for (const [x, z, c] of [[-3.6, 0, '#B04A4A'], [3.8, 0.4, '#4A7AB0']] as const) { const t = mesh(G('tent', () => new THREE.ConeGeometry(1.2, 1.7, 4)), std(c), x, 0.85, z, camp); t.rotation.y = Math.PI / 4; }
    // trees
    for (const [x, z] of [[-7, 3], [7, 4], [-6, -2], [6.5, -1.5], [-8, 6], [8.5, 7]]) { mesh(G('trunk', () => new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8)), woodM, x, 0.6, z, camp); mesh(G('pine', () => new THREE.ConeGeometry(0.9, 2.4, 8)), std('#1F4A32'), x, 2.1, z, camp); }
  }
  const campFire = sprite(flameTex, 1.1, 1.6, true); campFire.position.set(0, 0.8, 1); camp.add(campFire);
  const campLight = new THREE.PointLight('#FF9A40', 18, 12, 1.5); campLight.position.set(0, 1.4, 1); camp.add(campLight);
  const stars = new THREE.Group(); camp.add(stars);
  for (let i = 0; i < 60; i++) { const s = sprite(glowTex, 0.12 + Math.random() * 0.12, undefined, true); s.position.set((Math.random() - 0.5) * 40, 10 + Math.random() * 8, -12 - Math.random() * 10); stars.add(s); }
  const embers: THREE.Sprite[] = []; for (let i = 0; i < 10; i++) { const e = sprite(glowTex, 0.1, 0.1, true); e.material.color.set('#FFB040'); camp.add(e); embers.push(e); }

  // ---- the dungeon floor ----------------------------------------------------------------------------------------------
  const level = new THREE.Group(); scene.add(level);
  { const rockTex = stoneTex.clone(); T(rockTex); rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping; rockTex.repeat.set(14, 14); rockTex.needsUpdate = true;
    const bed = new THREE.Mesh(T(new THREE.PlaneGeometry(70, 70)), std('#2A2432', { map: rockTex, roughness: 1 })); bed.rotation.x = -Math.PI / 2; bed.position.y = -0.22; bed.receiveShadow = true; level.add(bed); }
  type RoomObj = { k: string; g: THREE.Group; content: THREE.Group; t: string; done: boolean; seen: boolean; icon?: THREE.Sprite; anim?: (t: number, dt: number) => void; flames: THREE.Sprite[] };
  const rooms = new Map<string, RoomObj>();
  let gridN = 5;
  const posOf = (k: string) => { const [x, y] = parse(k); return new THREE.Vector3((x - (gridN - 1) / 2) * S, 0, (y - (gridN - 1) / 2) * S); };
  const torchFlames: THREE.Sprite[] = [];
  const buildContent = (ro: RoomObj, t: string, done: boolean) => {
    ro.content.clear(); ro.anim = undefined;
    const c = ro.content;
    if (t === 'chest') {
      const chest = new THREE.Group(); chest.position.set(0, 0, 0); c.add(chest);
      mesh(G('chestBox', () => new THREE.BoxGeometry(0.9, 0.5, 0.6)), woodM, 0, 0.25, 0, chest);
      for (const x of [-0.3, 0.3]) mesh(G('chestBand', () => new THREE.BoxGeometry(0.08, 0.52, 0.62)), goldM, x, 0.26, 0, chest);
      const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.3); chest.add(lid);
      const top = mesh(G('chestLid', () => new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI)), woodM, 0, 0, 0.3, lid); top.rotation.z = Math.PI / 2; top.rotation.y = Math.PI / 2;
      if (done) { lid.rotation.x = -1.9; const coins = sprite(emojiTex('✨'), 0.5); coins.position.set(0, 0.7, 0); c.add(coins); }
      else { const gl = sprite(glowTex, 1.6, 1.6, true); gl.material.color.set('#FFD23F'); gl.material.opacity = 0.35; gl.position.set(0, 0.4, 0); c.add(gl); ro.anim = (tt) => { gl.material.opacity = 0.25 + Math.sin(tt * 3) * 0.12; }; }
    } else if (t === 'stairs' || (t === 'boss' && done)) {
      const hole = mesh(G('hole', () => new THREE.CircleGeometry(0.95, 24)), new THREE.MeshBasicMaterial({ color: '#000' }), 0, 0.03, 0, c); hole.rotation.x = -Math.PI / 2; hole.receiveShadow = false;
      for (let i = 0; i < 6; i++) { const st = mesh(G('step', () => new THREE.BoxGeometry(0.7, 0.12, 0.3)), std('#4A4352'), 0, 0.02 - i * 0.12, 0, c); const a = i * 0.7; st.position.x = Math.cos(a) * 0.45; st.position.z = Math.sin(a) * 0.45; st.rotation.y = -a; }
      const ring = mesh(G('stairRing', () => new THREE.TorusGeometry(1, 0.12, 6, 24)), std('#5A5266'), 0, 0.06, 0, c); ring.rotation.x = Math.PI / 2;
      const gl = sprite(glowTex, 2.2, 2.2, true); gl.material.color.set('#7B6CF6'); gl.material.opacity = 0.4; gl.position.y = 0.3; c.add(gl);
      ro.anim = (tt) => { gl.material.opacity = 0.3 + Math.sin(tt * 2) * 0.12; };
    } else if (t === 'shrine') {
      mesh(G('pedestal', () => new THREE.CylinderGeometry(0.4, 0.55, 0.6, 8)), std('#6A6278'), 0, 0.3, 0, c);
      const crystal = mesh(G('crystal', () => new THREE.OctahedronGeometry(0.35, 0)), std('#7FF3FF', { emissive: done ? '#1A4A55' : '#3BC8E8', emissiveIntensity: done ? 0.4 : 1.6, roughness: 0.15, metalness: 0.2 }), 0, 1.1, 0, c);
      crystal.scale.y = 1.6;
      const gl = sprite(glowTex, 2, 2, true); gl.material.color.set('#3BE8FF'); gl.material.opacity = done ? 0.1 : 0.5; gl.position.y = 1.1; c.add(gl);
      ro.anim = (tt, dt) => { crystal.rotation.y += dt; crystal.position.y = 1.1 + Math.sin(tt * 2) * 0.08; };
    } else if (t === 'trap') {
      const plate = mesh(G('trapPlate', () => new THREE.BoxGeometry(1.6, 0.06, 1.6)), ironM, 0, 0.03, 0, c);
      plate.receiveShadow = true;
      for (let i = 0; i < 9; i++) mesh(G('spike', () => new THREE.ConeGeometry(0.08, 0.35, 6)), std('#B8B4C2', { metalness: 0.8, roughness: 0.3 }), -0.5 + (i % 3) * 0.5, done ? 0.2 : 0.02, -0.5 + Math.floor(i / 3) * 0.5, c);
    } else if ((t === 'monster' || t === 'boss') && !done) {
      const m = sprite(emojiTex(t === 'boss' ? '☠️' : '👹'), t === 'boss' ? 1.8 : 1.1); m.position.y = t === 'boss' ? 1.2 : 0.8; c.add(m);
      const gl = sprite(glowTex, 2.4, 2.4, true); gl.material.color.set('#FF3B3B'); gl.material.opacity = 0.35; gl.position.y = 0.2; c.add(gl);
      if (t === 'boss') { mesh(G('dais', () => new THREE.CylinderGeometry(1.3, 1.5, 0.3, 8)), std('#4A2A3A'), 0, 0.15, 0, c); for (const s of [-1, 1]) { mesh(G('bossPillar', () => new THREE.CylinderGeometry(0.2, 0.25, 2, 8)), std('#5A3A4A'), s * 1.4, 1, -0.9, c); const f = sprite(flameTex, 0.4, 0.6, true); f.material.color.set('#FF5A9A'); f.position.set(s * 1.4, 2.2, -0.9); c.add(f); ro.flames.push(f); } }
      ro.anim = (tt) => { m.position.y = (t === 'boss' ? 1.4 : 0.8) + Math.sin(tt * 3) * 0.1; gl.material.opacity = 0.25 + Math.sin(tt * 4) * 0.1; };
    }
  };
  const buildRoom = (k: string, r: Run['rooms'][string], all: Run['rooms']) => {
    const g = new THREE.Group(); g.position.copy(posOf(k)); level.add(g);
    const content = new THREE.Group(); g.add(content);
    const ro: RoomObj = { k, g, content, t: r.t, done: r.done, seen: r.seen, flames: [] };
    const floor = mesh(G('roomFloor', () => new THREE.BoxGeometry(3.6, 0.2, 3.6)), floorM, 0, -0.1, 0, g); floor.userData.room = k;
    const [x, y] = parse(k);
    const sides: [string, number, number, number][] = [[`${x},${y - 1}`, 0, -1.9, 0], [`${x + 1},${y}`, 1.9, 0, Math.PI / 2], [`${x},${y + 1}`, 0, 1.9, 0], [`${x - 1},${y}`, -1.9, 0, Math.PI / 2]];
    sides.forEach(([n, wx, wz, ry], si) => {
      const open = !!all[n];
      if (open) {
        // a corridor to the next room (drawn from the lower-numbered side only)
        if (si === 1 || si === 2) { const cor = mesh(G('corridor', () => new THREE.BoxGeometry(1.4, 0.18, 1.4)), floorM, wx * 1.33, -0.1, wz * 1.33, g); cor.rotation.y = ry; cor.userData.room = n;
          for (const s of [-1, 1]) { const w = mesh(G('corWall', () => new THREE.BoxGeometry(0.25, 1.1, 1.4)), wallM, 0, 0.55, 0, g); w.rotation.y = ry; w.position.set(wx * 1.33 + (ry ? 0 : s * 0.82), 0.55, wz * 1.33 + (ry ? s * 0.82 : 0)); } }
        // the doorway: wall pieces either side
        for (const s of [-1, 1]) { const w = mesh(G('wallStub', () => new THREE.BoxGeometry(1.15, 1.6, 0.3)), wallM, 0, 0, 0, g); w.rotation.y = ry; w.position.set(wx + (ry ? 0 : s * 1.25), 0.8, wz + (ry ? s * 1.25 : 0)); }
      } else {
        const w = mesh(G('wall', () => new THREE.BoxGeometry(3.9, 1.6, 0.3)), wallM, wx, 0.8, wz, g); w.rotation.y = ry;
        // a torch on the back walls
        if (si === 0) { mesh(G('sconce', () => new THREE.BoxGeometry(0.12, 0.3, 0.12)), ironM, 0, 1.3, wz + 0.2, g); const f = sprite(flameTex, 0.35, 0.55, true); f.position.set(0, 1.65, wz + 0.25); g.add(f); torchFlames.push(f); ro.flames.push(f); }
      }
    });
    for (const [cx, cz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) mesh(G('pillar', () => new THREE.BoxGeometry(0.45, 1.9, 0.45)), wallM, cx, 0.95, cz, g);
    // some bones and rubble
    if ((x * 7 + y * 3) % 4 === 0) { const b = sprite(emojiTex('🦴'), 0.4); b.position.set(-1.2, 0.15, 1.1); g.add(b); }
    if ((x * 5 + y) % 5 === 1) { const b = sprite(emojiTex('🕸️'), 0.9); b.position.set(1.45, 1.4, -1.45); g.add(b); }
    rooms.set(k, ro);
    return ro;
  };
  const setLook = (ro: RoomObj, r: Run['rooms'][string]) => {
    // rooms you've only glimpsed are dim and show an icon of what's there
    ro.seen = r.seen; ro.g.visible = r.seen;
    ro.g.traverse((ob) => { if (ob instanceof THREE.Mesh && ob.material === floorM && !r.done && r.t !== 'start') ob.material = dimM; else if (ob instanceof THREE.Mesh && ob.material === dimM && (r.done || r.t === 'start')) ob.material = floorM; });
    if (ro.t !== r.t || ro.done !== r.done || !ro.content.children.length) { ro.t = r.t; ro.done = r.done; buildContent(ro, r.t, r.done); }
    if (ro.icon) { ro.g.remove(ro.icon); ro.icon.material.dispose(); ro.icon = undefined; }
    if (!r.done && ICON[r.t]) { ro.icon = sprite(emojiTex(ICON[r.t]), 0.7); ro.icon.position.set(0, 2.6, 0); ro.g.add(ro.icon); }
  };

  // ---- the party ------------------------------------------------------------------------------------------------------
  type HeroObj = { h: string; g: THREE.Group; body: THREE.Group; home: THREE.Vector3; target: THREE.Vector3; flash: number; lunge: number; dead: boolean; tag: THREE.Sprite };
  const heroes: HeroObj[] = [];
  const makeHero = (h: string) => {
    const g = new THREE.Group(); scene.add(g); const body = new THREE.Group(); g.add(body);
    const col = o.heroes[h]?.color ?? '#888';
    mesh(G('heroBody', () => new THREE.CapsuleGeometry(0.22, 0.35, 4, 10)), std(col), 0, 0.6, 0, body);
    mesh(G('heroCape', () => new THREE.BoxGeometry(0.42, 0.55, 0.06)), std(col, { roughness: 0.95 }), 0, 0.65, -0.2, body);
    mesh(G('heroHead', () => new THREE.SphereGeometry(0.18, 14, 10)), std('#F0C8A0'), 0, 1.07, 0, body);
    mesh(G('heroHelm', () => new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), std(h === 'mage' ? '#5A3A9A' : h === 'cleric' ? '#F4F1EA' : h === 'rogue' ? '#2A2A30' : h === 'archer' ? '#2E6A3E' : '#9AA0B0', { metalness: h === 'knight' ? 0.7 : 0 }), 0, 1.1, 0, body);
    if (h === 'mage') mesh(G('wizHat', () => new THREE.ConeGeometry(0.2, 0.45, 10)), std('#5A3A9A'), 0, 1.42, 0, body);
    for (const s of [-1, 1]) mesh(G('heroEye', () => new THREE.SphereGeometry(0.025, 6, 4)), std('#1A1A1A'), s * 0.06, 1.08, 0.16, body);
    const tag = sprite(emojiTex(o.heroes[h]?.emoji ?? '⚔️'), 0.42); tag.position.set(0.32, 0.9, 0.1); body.add(tag);
    const ho: HeroObj = { h, g, body, home: new THREE.Vector3(), target: new THREE.Vector3(), flash: 0, lunge: 0, dead: false, tag };
    heroes.push(ho); return ho;
  };
  let partyAt = new THREE.Vector3(), inCamp = true;
  const formation = (i: number, n: number, fight: boolean) => fight ? new THREE.Vector3((i - (n - 1) / 2) * 0.95, 0, 1.15) : new THREE.Vector3((i - (n - 1) / 2) * 0.7, 0, 0.4 + (i % 2) * 0.35);

  // ---- fights ---------------------------------------------------------------------------------------------------------
  type Foe = { s: THREE.Sprite; shadow: THREE.Mesh; home: THREE.Vector3; flash: number; lunge: number; dead: number; boss: boolean; base: number; hpBar: THREE.Mesh; hpBack: THREE.Mesh; frac: number; stun: THREE.Sprite };
  let foes: Foe[] = [];
  const foeGroup = new THREE.Group(); scene.add(foeGroup);
  const barGeo = G('bar', () => new THREE.PlaneGeometry(1, 0.1));
  const shadowGeo = G('shadow', () => new THREE.CircleGeometry(0.45, 16));
  const shadowM = T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.4, depthWrite: false }));
  type Pop = { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number };
  const pops: Pop[] = [];
  const pop = (at: THREE.Vector3, t: THREE.Texture, w = 1, h = 0.38, life = 1) => { const s = sprite(t, w, h); s.renderOrder = 10; s.position.copy(at); scene.add(s); pops.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.4, 0), life, max: life }); };
  const tmp = new THREE.Vector3();

  // ---- picking --------------------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const pu = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; } down = null;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(level.children, true)) { if (h.object.userData.room && h.object.visible) { o.onTapRoom?.(h.object.userData.room); return; } }
  };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointerup', pu);

  // ---- loop -----------------------------------------------------------------------------------------------------------
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, fighting = false;
  const camAt = new THREE.Vector3(0, 0, 1), camGoal = new THREE.Vector3();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || document.hidden) return;
    tune(dt); t += dt;
    // camera follows the party (closer in a fight)
    // fit a width of the world to the screen (portrait phones see as much across as landscape ones)
    const want = inCamp ? 9 : fighting ? 6 : 9.5;
    const half = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const dist = Math.max(inCamp ? 9 : 8, want / 2 / Math.tan(half));
    camGoal.copy(inCamp ? new THREE.Vector3(0, 0, 0.2) : partyAt);
    camAt.lerp(camGoal, Math.min(1, dt * 3));
    if (inCamp) { camera.position.set(camAt.x, camAt.y + dist * 0.62, camAt.z + dist * 0.8); camera.lookAt(camAt.x, 0.8, camAt.z - 1.2); }
    else { camera.position.set(camAt.x, camAt.y + dist * (fighting ? 0.8 : 0.9), camAt.z + dist * (fighting ? 0.6 : 0.42)); camera.lookAt(camAt.x, 0.4, camAt.z - (fighting ? 0.3 : 1.2)); }
    // heroes walk to their spots
    heroes.forEach((h) => {
      tmp.subVectors(h.target, h.g.position); tmp.y = 0; const d = tmp.length();
      if (d > 0.04) { tmp.normalize(); h.g.position.addScaledVector(tmp, Math.min(d, dt * 4.5)); h.g.rotation.y = Math.atan2(tmp.x, tmp.z); h.body.position.y = Math.abs(Math.sin(t * 12 + h.home.x)) * 0.07; }
      else { h.body.position.y = inCamp ? 0 : Math.sin(t * 2 + h.home.x) * 0.02; h.g.rotation.y = inCamp ? Math.atan2(-h.g.position.x, 1 - h.g.position.z) : Math.PI; }
      if (h.lunge > 0) { h.lunge -= dt; const k = Math.sin((1 - h.lunge / 0.35) * Math.PI); h.body.position.z = -k * 0.55; } else h.body.position.z = 0;
      if (h.flash > 0) { h.flash -= dt; h.body.position.x = Math.sin(t * 60) * 0.06; } else h.body.position.x = 0;
      h.body.rotation.z = h.dead ? Math.PI / 2 : 0; if (h.dead) h.body.position.y = 0.2;
    });
    lantern.position.set(partyAt.x, 3.2, partyAt.z + 0.4); lantern.intensity = inCamp ? 0 : 30 + Math.sin(t * 9) * 2;
    // foes
    foes.forEach((f) => {
      const bob = Math.sin(t * 3 + f.home.x) * 0.08;
      f.s.position.set(f.home.x, f.base + bob, f.home.z + (f.lunge > 0 ? Math.sin((1 - f.lunge / 0.35) * Math.PI) * 0.6 : 0));
      if (f.lunge > 0) f.lunge -= dt;
      if (f.flash > 0) { f.flash -= dt; f.s.material.color.set(Math.floor(f.flash * 20) % 2 ? '#FF6060' : '#FFFFFF'); } else f.s.material.color.set('#FFFFFF');
      if (f.dead > 0) { f.dead += dt; f.s.material.opacity = Math.max(0, 1 - f.dead * 1.5); f.s.scale.setScalar((f.boss ? 2.2 : 1.3) * (1 + f.dead * 0.5)); f.shadow.visible = false; }
      f.hpBar.scale.x = Math.max(0.001, f.frac); f.hpBar.position.x = f.home.x - (1 - f.frac) * 0.5 * (f.boss ? 1.6 : 1); f.hpBar.visible = f.hpBack.visible = f.dead === 0;
      f.stun.position.set(f.home.x, f.base + (f.boss ? 1.3 : 0.85), f.home.z); f.stun.material.rotation = t * 3;
    });
    // flames flicker
    if (!o.reduceMotion) {
      for (const f of torchFlames) { f.scale.set(0.35 + Math.sin(t * 13 + f.position.x) * 0.04, 0.55 + Math.sin(t * 9 + f.position.z) * 0.08, 1); }
      campFire.scale.set(1.1 + Math.sin(t * 11) * 0.12, 1.6 + Math.sin(t * 7) * 0.2, 1); campLight.intensity = 16 + Math.sin(t * 13) * 3;
      embers.forEach((e, i) => { const k = (t * 0.5 + i / embers.length) % 1; e.position.set(Math.sin(i * 3 + t) * 0.4, 0.6 + k * 3, 1 + Math.cos(i * 2) * 0.3); e.material.opacity = 1 - k; });
    }
    for (const r of rooms.values()) if (r.g.visible) r.anim?.(t, dt);
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= dt; p.v.y -= 2.5 * dt; p.s.position.addScaledVector(p.v, dt); p.s.material.opacity = Math.min(1, (p.life / p.max) * 2.5); if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); pops.splice(i, 1); } }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  let floorKey = '';
  const wait = (ms: number) => new Promise((res) => setTimeout(res, o.reduceMotion ? ms * 0.4 : ms));
  const api = {
    /** at camp (no run): the campfire, the party around it */
    setCamp(party: string[]) {
      inCamp = true; fighting = false; camp.visible = true; level.visible = false; foeGroup.clear(); foes = []; scene.fog = null; amb.intensity = 0.7;
      for (const h of heroes) scene.remove(h.g); heroes.length = 0;
      party.forEach((h, i) => { const ho = makeHero(h); const a = Math.PI * 0.15 + (i / Math.max(1, party.length)) * Math.PI * 0.9 + Math.PI * 0.05; const p = new THREE.Vector3(Math.cos(a) * 1.6, 0, 1 + Math.sin(a) * 1.6); ho.g.position.copy(p); ho.target.copy(p); ho.home.copy(p); });
    },
    /** the floor as far as you've seen it, and where the party is */
    setRun(run: Run) {
      if (inCamp) { inCamp = false; camp.visible = false; level.visible = true; scene.fog = new THREE.Fog('#0B0910', 30, 70); amb.intensity = 1.7; }
      const key = `${run.id}:${run.floor}`;
      if (key !== floorKey) {
        floorKey = key; for (const r of rooms.values()) level.remove(r.g); rooms.clear(); torchFlames.length = 0;
        gridN = 5; for (const [k, r] of Object.entries(run.rooms)) buildRoom(k, r, run.rooms);
        partyAt = posOf(run.pos); camAt.copy(partyAt);
        for (const h of heroes) scene.remove(h.g); heroes.length = 0;
        run.party.forEach((p, i) => { const ho = makeHero(p.h); const f = formation(i, run.party.length, false); ho.g.position.copy(partyAt).add(f); ho.target.copy(ho.g.position); });
      }
      for (const [k, r] of Object.entries(run.rooms)) { const ro = rooms.get(k); if (ro) setLook(ro, r); }
      partyAt = posOf(run.pos);
      heroes.forEach((h, i) => { h.dead = (run.party[i]?.hp ?? 1) <= 0; h.home.copy(formation(i, heroes.length, !!run.fight)); h.target.copy(partyAt).add(h.home); });
      const here = rooms.get(run.pos); if (here) { here.content.visible = !run.fight; }
      for (const r of rooms.values()) { if (r.k !== run.pos) r.content.visible = true; if (r.icon) r.icon.visible = r.k !== run.pos; }
      if (!run.fight) { fighting = false; foeGroup.clear(); foes = []; }
    },
    /** the monsters line up across the room */
    startFight(enemies: Enemy[]) {
      fighting = true; foeGroup.clear(); foes = [];
      const n = enemies.length;
      enemies.forEach((e, i) => {
        const boss = !!e.boss, w = boss ? 1.6 : 1;
        const home = partyAt.clone().add(new THREE.Vector3((i - (n - 1) / 2) * (boss ? 1.4 : 1.2), 0, -0.9 - (boss ? 0.3 : 0)));
        const s = sprite(emojiTex(e.e), boss ? 2.2 : 1.3); s.renderOrder = 4; foeGroup.add(s);
        const shadow = new THREE.Mesh(shadowGeo, shadowM); shadow.rotation.x = -Math.PI / 2; shadow.position.set(home.x, 0.02, home.z); shadow.scale.setScalar(boss ? 1.8 : 1); foeGroup.add(shadow);
        const hpBack = new THREE.Mesh(barGeo, T(new THREE.MeshBasicMaterial({ color: '#2A0A10', depthTest: false }))); hpBack.scale.x = w; hpBack.position.set(home.x, (boss ? 2.6 : 1.65), home.z); hpBack.renderOrder = 8; foeGroup.add(hpBack);
        const hpBar = new THREE.Mesh(barGeo, T(new THREE.MeshBasicMaterial({ color: boss ? '#FF3B6B' : '#FF5A5A', depthTest: false }))); hpBar.position.set(home.x, (boss ? 2.6 : 1.65), home.z + 0.01); hpBar.renderOrder = 9; foeGroup.add(hpBar);
        hpBar.scale.set(w, 1, 1);
        const stun = sprite(emojiTex('💫'), 0.5); stun.visible = e.stun > 0; foeGroup.add(stun);
        foes.push({ s, shadow, home, flash: 0, lunge: 0, dead: e.hp <= 0 ? 1 : 0, boss, base: boss ? 1.2 : 0.75, hpBar, hpBack, frac: e.hp / e.max, stun });
      });
      heroes.forEach((h, i) => { h.home.copy(formation(i, heroes.length, true)); h.target.copy(partyAt).add(h.home); });
    },
    /** play one round's blows, one after another; resolves when it's done */
    async play(log: LogEntry[], enemies: Enemy[] | undefined, party: PartyHero[]) {
      const hp = enemies?.map((e) => e.hp) ?? [];
      for (const l of log) {
        if (l.a === 'h' && l.j !== undefined && foes[l.j]) {
          const h = heroes[l.i ?? 0], f = foes[l.j]; if (h) h.lunge = 0.35;
          await wait(170);
          f.flash = 0.3;
          pop(f.home.clone().add(new THREE.Vector3(0, f.base + 0.9, 0.2)), textTex(`${l.crit ? '💥' : ''}-${l.dmg}`, l.crit ? '#FFD23F' : l.k === 'skill' ? '#FF9AF0' : '#FFFFFF'), l.crit ? 1.3 : 1, 0.4);
          if (l.k === 'skill') pop(f.home.clone().add(new THREE.Vector3(0, f.base + 0.3, 0.3)), emojiTex(l.stun ? '💫' : h ? o.heroes[h.h]?.emoji ?? '✨' : '✨'), 0.7, 0.7, 0.7);
          if (l.stun) f.stun.visible = true;
          await wait(l.k === 'skill' ? 260 : 180);
        } else if (l.a === 'h' && l.k === 'heal' && l.h !== undefined) {
          const h = heroes[l.h]; if (h) { h.dead = false; pop(h.g.position.clone().add(new THREE.Vector3(0, 1.6, 0)), textTex(`+${l.heal}`, '#5BFFA8'), 0.9, 0.34); pop(h.g.position.clone().add(new THREE.Vector3(0, 1.2, 0)), emojiTex('✨'), 0.6, 0.6, 0.8); }
          await wait(120);
        } else if (l.a === 'item' && l.k === 'potion' && l.h !== undefined) {
          const h = heroes[l.h]; if (h) { pop(h.g.position.clone().add(new THREE.Vector3(0, 1.6, 0)), textTex(`+${l.heal}`, '#5BFFA8'), 0.9, 0.34); pop(h.g.position.clone().add(new THREE.Vector3(0, 1.1, 0)), emojiTex('🧪'), 0.6, 0.6, 0.8); }
          await wait(300);
        } else if (l.a === 'item' && l.k === 'bomb' && l.j !== undefined && foes[l.j]) {
          const f = foes[l.j]; f.flash = 0.4; pop(f.home.clone().add(new THREE.Vector3(0, f.base, 0.3)), emojiTex('💥'), 1.4, 1.4, 0.6); pop(f.home.clone().add(new THREE.Vector3(0, f.base + 0.9, 0.2)), textTex(`-${l.dmg}`, '#FFB13D'), 1, 0.4);
          await wait(160);
        } else if (l.a === 'e' && l.k === 'stunned' && l.j !== undefined && foes[l.j]) {
          pop(foes[l.j].home.clone().add(new THREE.Vector3(0, foes[l.j].base + 0.9, 0.2)), textTex('Stunned', '#9AD8FF'), 1.1, 0.34); foes[l.j].stun.visible = false; await wait(260);
        } else if (l.a === 'e' && l.j !== undefined && foes[l.j] && l.h !== undefined && (l.k === 'hit' || l.k === 'miss')) {
          const f = foes[l.j], h = heroes[l.h]; f.lunge = 0.35;
          await wait(170);
          if (h) { if (l.k === 'hit') h.flash = 0.3; pop(h.g.position.clone().add(new THREE.Vector3(0, 1.6, 0)), l.k === 'miss' ? textTex('Miss', '#B8B4C2') : textTex(`-${l.dmg}`, '#FF6B6B'), 0.9, 0.34); }
          await wait(200);
        } else if (l.k === 'fell' && l.h !== undefined) { const h = heroes[l.h]; if (h) { h.dead = true; pop(h.g.position.clone().add(new THREE.Vector3(0, 1.4, 0)), emojiTex('💀'), 0.6, 0.6, 1); } await wait(250); }
        // the hp bars as they stand after this blow (we know only the final values, so ease to them)
        if (l.j !== undefined && foes[l.j] && enemies && l.dmg) { const f = foes[l.j]; const e = enemies[l.j]; f.frac = Math.max(e.hp / e.max, f.frac - l.dmg / e.max); if (f.frac <= e.hp / e.max + 1e-6 && e.hp <= 0 && !f.dead) { f.dead = 0.0001; pop(f.home.clone().add(new THREE.Vector3(0, f.base, 0.3)), emojiTex('💨'), 1.2, 1.2, 0.8); } }
      }
      foes.forEach((f, i) => { if (hp[i] !== undefined && enemies) { f.frac = hp[i] / enemies[i].max; if (hp[i] <= 0 && !f.dead) f.dead = 0.0001; f.stun.visible = enemies[i].stun > 0; } });
      heroes.forEach((h, i) => { h.dead = (party[i]?.hp ?? 1) <= 0; });
      await wait(150);
    },
    burst(emojis: string[]) { emojis.slice(0, 8).forEach((e, i) => { const s = sprite(emojiTex(e), 0.55); s.position.copy(partyAt).add(new THREE.Vector3(0, 1.5, 0)); scene.add(s); const a = (i / Math.max(1, emojis.length)) * Math.PI * 2; pops.push({ s, v: new THREE.Vector3(Math.cos(a) * 1.2, 2.2, Math.sin(a) * 0.6), life: 1.2, max: 1.2 }); }); },
    neighbours: (k: string) => nb(k),
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ rooms: rooms.size, heroes: heroes.length, foes: foes.length, camp: inCamp }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointerup', pu);
      scene.traverse((ob) => { if (ob instanceof THREE.Sprite) ob.material.dispose(); });
      for (const x of bag) x.dispose(); renderer.dispose();
    },
  };
  return api;
}
export type DungeonScene = ReturnType<typeof createDungeon3D>;
