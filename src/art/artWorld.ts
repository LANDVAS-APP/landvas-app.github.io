// Art's places in 3D, built on the place engine.
//   The Studio (any Art canvas): a sunlit painter's room. Your easel (the editor), a window onto your mural on the map,
//   a mixing table, a guest book by the door, and at the back a pair of double doors.
//   The Gallery (an Art Estate): through those doors, a row of rooms (3 to start, up to 5) with four walls of art each:
//   your own published pieces in the frame and light you chose, a plaque under each, a show banner and the piece of the
//   week on its own easel. When a show is on, visitors (drawn like explorers) walk the rooms and stop to look.
// Layout (world units; the camera looks toward -z): the Studio is x -6..6, z 4..13 (the doors are at z = 4); room k of
// the Gallery runs from z = 4 - 10(k-1) down to 4 - 10k, the walls at x = ±6, the doorways in the middle.
import * as THREE from 'three';
import type { ArtPlace, GalleryHang } from '../backend/types';
import type { Npc, PlaceKit, PlaceSpot, PlaceWorld, Rect } from '../places/engine';
import { npcUrl } from '../places/npcs';

export const ROOM_D = 10, HALF_W = 6, WALL_H = 3.6, STUDIO = { z0: 4, z1: 13 };
export const roomStart = (k: number) => STUDIO.z0 - ROOM_D * (k - 1);
export const SLOTS_IN = ['l1', 'l2', 'r1', 'r2'] as const;
/** where a slot's piece hangs (centre of the picture). Every piece faces you (+z), the way the arcade's cabinets do:
    n = 1 is on the display wall in the middle of the room, n = 2 on the room's far wall, l/r either side of the walkway */
export const PANEL_AT = 4.6;
export function slotAt(slot: string) {
  const k = Number(slot[1]), side = slot[2] === 'l' ? -1 : 1, n = Number(slot[3]);
  const z0 = roomStart(k), z1 = z0 - ROOM_D;
  const z = n === 1 ? z0 - PANEL_AT + 0.18 : z1 + 0.17;
  const x = side * (n === 1 ? 2.95 : 3.65);
  return { k, side, x, y: 1.72, z, standX: x, standZ: z + 1.75 };
}
export const WALLS: Record<string, string> = { white: '#EEEAE2', charcoal: '#34343B', sage: '#94AC92', oxblood: '#6A1E29', midnight: '#1E2A4A' };
export const LIGHTS: Record<string, string> = { warm: '#FFD3A0', daylight: '#FFF4E6', cool: '#C9E2FF', rose: '#FFB0C6', violet: '#C8B0FF' };

export type ArtWorld = PlaceWorld & {
  /** the walls changed: hang, take down, re-light, re-frame (no rebuild) */ setHall(p: ArtPlace): void;
  /** a little glow on the piece you're standing at */ highlight(slot: string | null): void;
  /** where a slot's piece is, for bursts and the camera */ pieceAt(slot: string): THREE.Vector3;
  /** try a piece / frame / light on a wall before saving it (null: put the wall back as it is) */ preview(slot: string, h: GalleryHang | null): void;
};

type Loaded = { tex: THREE.Texture | null; url: string | null };

export type ArtHooks = {
  /** walls or furniture moved (the piece-of-the-week easel came or went) */ solids?(r: Rect[]): void;
  /** who's walking the show */ npcs?(list: Npc[]): void;
};

export function buildArt(k: PlaceKit, p: ArtPlace, urls: { get(path: string | null): Promise<string | null> }, hooks: ArtHooks): ArtWorld {
  const { scene, T } = k;
  const gallery = p.tier === 'gallery';
  const rooms = gallery ? p.hall!.rooms : 0;
  const zMin = gallery ? roomStart(rooms) - ROOM_D : STUDIO.z0;
  const shown = gallery ? Math.min(rooms + 1, (p.cfg.rooms_max ?? 5)) : 0; // the next (locked) room shows behind its rope

  // ---- light: soft sky, a warm sun through the Studio skylight, cooler in the Gallery ------------------------------
  scene.add(new THREE.HemisphereLight('#FFF3E0', '#3A2E2A', 1.05));
  scene.add(new THREE.AmbientLight('#ffffff', 0.22));
  const sun = new THREE.DirectionalLight('#FFE2B8', 1.5); sun.position.set(-6, 14, 16); scene.add(sun);
  const back = new THREE.DirectionalLight('#DDE6FF', 0.55); back.position.set(5, 10, -30); scene.add(back);

  // ---- floors ------------------------------------------------------------------------------------------------------
  const herring = k.canvasTex(256, 256, (g) => {
    g.fillStyle = '#B98A55'; g.fillRect(0, 0, 256, 256);
    for (let y = -32; y < 288; y += 32) for (let x = -64; x < 320; x += 64) {
      for (const d of [0, 1]) {
        g.save(); g.translate(x + d * 32, y); g.rotate(d ? -Math.PI / 4 : Math.PI / 4);
        const tone = ['#C89A62', '#B07D47', '#BE8E58', '#A9743F'][(Math.abs(x + y * 3 + d * 7) >> 5) % 4];
        g.fillStyle = tone; g.fillRect(0, 0, 44, 15); g.strokeStyle = 'rgba(60,35,15,0.35)'; g.lineWidth = 1.2; g.strokeRect(0, 0, 44, 15); g.restore();
      }
    }
  });
  herring.wrapS = herring.wrapT = THREE.RepeatWrapping; herring.repeat.set(4, 3);
  const studioFloor = k.plane(HALF_W * 2, STUDIO.z1 - STUDIO.z0 + 6, k.std('#ffffff', { map: herring, roughness: 0.62 }));
  studioFloor.rotation.x = -Math.PI / 2; studioFloor.position.set(0, 0, (STUDIO.z0 + STUDIO.z1 + 6) / 2); scene.add(studioFloor);
  const floors: THREE.Object3D[] = [studioFloor];
  if (gallery) {
    // polished concrete, dark enough that the light pools under each piece glow on it
    const concrete = k.canvasTex(512, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 512, 512); gr.addColorStop(0, '#5B5652'); gr.addColorStop(0.5, '#534E4B'); gr.addColorStop(1, '#5A5450'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2600; i++) { const v = 70 + Math.floor(k.rnd() * 60); g.fillStyle = `rgba(${v + 8},${v + 4},${v},${0.18 + k.rnd() * 0.25})`; const r = k.rnd() < 0.08 ? 3 : 1.5; g.fillRect(k.rnd() * 512, k.rnd() * 512, r, r); }
      for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(255,255,255,${0.02 + k.rnd() * 0.025})`; g.lineWidth = 18 + k.rnd() * 30; g.beginPath(); const y = k.rnd() * 512; g.moveTo(0, y); g.bezierCurveTo(170, y + 40 - k.rnd() * 80, 340, y - 40 + k.rnd() * 80, 512, y); g.stroke(); }
      g.strokeStyle = 'rgba(20,18,16,0.55)'; g.lineWidth = 3; g.strokeRect(0, 0, 512, 512);
    });
    concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping; concrete.repeat.set(3, (shown * ROOM_D) / 4);
    const gf = k.plane(HALF_W * 2, shown * ROOM_D, k.std('#ffffff', { map: concrete, roughness: 0.28, metalness: 0.08 }));
    gf.rotation.x = -Math.PI / 2; gf.position.set(0, 0.002, STUDIO.z0 - (shown * ROOM_D) / 2); scene.add(gf); floors.push(gf);
  }
  // a dark ground beyond the walls, so there's never a hole at the edge of the screen
  const ground = k.plane(80, 140, k.basic('#141018')); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -20); scene.add(ground);

  // ---- walls -------------------------------------------------------------------------------------------------------
  const solids: Rect[] = [];
  const wallMat = (c: string) => k.std(c, { roughness: 0.92 });
  const studioWall = wallMat('#F1E6D2'), trim = k.std('#7A5636', { roughness: 0.6 });
  const studioCap = k.std('#4A3121', { roughness: 0.55 }), galleryCap = k.std('#1E1D24', { roughness: 0.45, metalness: 0.3 });
  /** the meshes that take a room's wall colour */
  const painted: { r: number; m: THREE.Mesh }[] = [];
  /** a wall (and its dark top, which stays as an outline when the wall fades out of your way) */
  const wall = (x0: number, x1: number, z0: number, z1: number, m: THREE.Material, h = WALL_H, solid = true, o: { y0?: number; cap?: THREE.Material; room?: number; add?: THREE.Group } = {}) => {
    const g = o.add ?? new THREE.Group(), w = Math.max(0.3, x1 - x0), d = Math.max(0.3, z1 - z0), y0 = o.y0 ?? 0;
    const body = k.box(w, h, d, m); body.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2); g.add(body);
    const cap = k.box(w + 0.04, 0.06, d + 0.04, o.cap ?? (o.room ? galleryCap : studioCap)); cap.position.set(body.position.x, y0 + h + 0.03, body.position.z); cap.userData.minFade = 0.45; g.add(cap);
    if (o.room) painted.push({ r: o.room, m: body });
    if (!o.add) scene.add(g);
    if (solid) solids.push({ x0, x1, z0, z1 });
    return g;
  };
  /** a brass sign flat on a wall, facing you */
  const wallSign = (text: string, sub: string, x: number, y: number, z: number, w: number) => {
    const t = k.canvasTex(512, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#F3D682'); gr.addColorStop(1, '#B98F2E'); g.fillStyle = gr; g.beginPath(); g.roundRect(4, 4, 504, 120, 18); g.fill();
      g.strokeStyle = 'rgba(70,45,10,0.6)'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#2A1C08'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 ${sub ? 46 : 54}px "Unbounded Variable", ui-rounded, system-ui, sans-serif`; g.fillText(text, 256, sub ? 50 : 66, 470);
      if (sub) { g.font = '600 26px "Manrope Variable", system-ui, sans-serif'; g.fillStyle = 'rgba(42,28,8,0.75)'; g.fillText(sub, 256, 96, 470); }
    });
    const m = k.plane(w, w / 4, k.std('#ffffff', { map: t, metalness: 0.35, roughness: 0.4 })); m.position.set(x, y, z); m.userData.vanish = true; return m;
  };
  // the Studio: side walls and the back wall with the double doors
  wall(-HALF_W - 0.3, -HALF_W, STUDIO.z0, STUDIO.z1, studioWall, WALL_H, false);
  wall(HALF_W, HALF_W + 0.3, STUDIO.z0, STUDIO.z1, studioWall, WALL_H, false);
  const doorWall = new THREE.Group(); scene.add(doorWall);
  wall(-HALF_W, -1.5, STUDIO.z0 - 0.15, STUDIO.z0 + 0.15, studioWall, WALL_H, true, { add: doorWall });
  wall(1.5, HALF_W, STUDIO.z0 - 0.15, STUDIO.z0 + 0.15, studioWall, WALL_H, true, { add: doorWall });
  wall(-1.5, 1.5, STUDIO.z0 - 0.15, STUDIO.z0 + 0.15, studioWall, 0.9, false, { add: doorWall, y0: WALL_H - 0.9 });
  // skirting and a picture rail in walnut
  for (const s of [-1, 1]) { const b = k.box(0.06, 0.18, STUDIO.z1 - STUDIO.z0, trim); b.position.set(s * (HALF_W - 0.03), 0.09, (STUDIO.z0 + STUDIO.z1) / 2); scene.add(b); }
  // the double doors: open into the Gallery, or shut with a brass plaque saying how to open them
  const doors = new THREE.Group(); doors.position.set(0, 0, STUDIO.z0); scene.add(doors);
  const doorMat = k.std('#5B3A22', { roughness: 0.5 }), brass = k.std('#D9B24A', { metalness: 0.85, roughness: 0.28 });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.position.set(s * 1.48, 0, 0); doors.add(leaf);
    const d = k.box(1.42, 2.7, 0.08, doorMat); d.position.set(-s * 0.71, 1.35, 0); leaf.add(d);
    for (const yy of [0.75, 1.95]) { const pnl = k.box(1.0, 0.8, 0.1, k.std('#6B4529')); pnl.position.set(-s * 0.71, yy, 0); leaf.add(pnl); }
    const knob = k.cyl(0.05, 0.05, 0.12, brass); knob.rotation.x = Math.PI / 2; knob.position.set(-s * 1.25, 1.3, 0.08); leaf.add(knob);
    leaf.rotation.y = gallery ? -s * 1.75 : 0;
  }
  if (!gallery) {
    solids.push({ x0: -1.5, x1: 1.5, z0: STUDIO.z0 - 0.15, z1: STUDIO.z0 + 0.15 });
    doorWall.add(wallSign('🔒 Your Gallery', 'Merge 2×2 Art plots to open it', 0, 3.25, STUDIO.z0 + 0.17, 3.0));
  } else doorWall.add(wallSign('THE GALLERY', `@${p.owner.username}`, 0, 3.25, STUDIO.z0 + 0.17, 2.6));
  // (the doors swing out into the Gallery, so they get out of the way on their own)
  k.fadeable(doorWall); k.fadeable(doors);

  // ---- the Studio's furniture --------------------------------------------------------------------------------------
  const wood = k.std('#7A4E2D', { roughness: 0.55 }), dark = k.std('#3A2A1E', { roughness: 0.6 });
  // a rug under the easel
  const rugTex = k.canvasTex(256, 160, (g) => {
    g.fillStyle = '#8E2F3C'; g.fillRect(0, 0, 256, 160); g.strokeStyle = '#E8C27A'; g.lineWidth = 6; g.strokeRect(10, 10, 236, 140);
    g.strokeStyle = '#1F3D5A'; g.lineWidth = 3; g.strokeRect(22, 22, 212, 116);
    for (let i = 0; i < 6; i++) { g.fillStyle = ['#E8C27A', '#1F3D5A', '#E85D75'][i % 3]; g.beginPath(); g.arc(48 + i * 32, 80, 7, 0, Math.PI * 2); g.fill(); }
  });
  const rug = k.plane(3.6, 2.3, k.std('#ffffff', { map: rugTex, roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; rug.position.set(-2.6, 0.01, 8.6); scene.add(rug);
  // the easel, its canvas showing your mural
  const easel = new THREE.Group(); easel.position.set(-2.6, 0, 8.3); easel.rotation.y = 0.32; scene.add(easel);
  for (const s of [-1, 1]) { const leg = k.box(0.09, 2.7, 0.09, wood); leg.position.set(s * 0.62, 1.32, 0); leg.rotation.z = -s * 0.13; easel.add(leg); }
  const easelBack = k.box(0.08, 2.6, 0.08, wood); easelBack.position.set(0, 1.25, -0.55); easelBack.rotation.x = 0.28; easel.add(easelBack);
  const ledge = k.box(1.5, 0.07, 0.22, wood); ledge.position.set(0, 0.86, 0.06); easel.add(ledge);
  const easelArt = new THREE.Group(); easelArt.position.set(0, 1.62, 0.1); easel.add(easelArt);
  const blankMat = k.std('#F7F3EA', { roughness: 0.95 });
  const blank = k.box(1.3, 1.3, 0.05, blankMat); easelArt.add(blank);
  solids.push({ x0: -3.4, x1: -1.8, z0: 7.7, z1: 8.8 });
  // a stool and a little paint cart
  const stool = k.cyl(0.26, 0.22, 0.06, wood); stool.position.set(-1.7, 0.62, 9.3); scene.add(stool);
  for (let i = 0; i < 3; i++) { const l = k.cyl(0.025, 0.025, 0.62, wood); const a = (i / 3) * Math.PI * 2; l.position.set(-1.7 + Math.cos(a) * 0.18, 0.31, 9.3 + Math.sin(a) * 0.18); scene.add(l); }
  // the window onto your mural (the left wall): what's painted on your land, seen from up high
  const win = new THREE.Group(); win.position.set(-HALF_W + 0.02, 1.95, 6.6); win.rotation.y = Math.PI / 2; scene.add(win);
  const sill = k.box(2.5, 0.12, 0.3, k.std('#EDE3CF')); sill.position.set(0, -0.98, 0.1); win.add(sill);
  const frameW = k.std('#EDE3CF', { roughness: 0.5 });
  for (const [w, h, x, y] of [[2.5, 0.12, 0, 0.92], [2.5, 0.12, 0, -0.92], [0.12, 1.96, -1.19, 0], [0.12, 1.96, 1.19, 0], [0.07, 1.84, 0, 0], [2.36, 0.07, 0, 0]] as const) { const f = k.box(w, h, 0.12, frameW); f.position.set(x, y, 0.05); win.add(f); }
  const viewMat = new THREE.MeshBasicMaterial({ color: '#7FB6E8' }); T(viewMat);
  const view = k.plane(2.3, 1.76, viewMat); win.add(view);
  const sky = k.plane(2.3, 1.76, T(new THREE.MeshBasicMaterial({ color: '#BFE3FF', transparent: true, opacity: 0.18 }))); sky.position.z = 0.02; win.add(sky);
  // the mixing table with its pots (and Hue Hunter, in a Gallery)
  const mix = new THREE.Group(); mix.position.set(3.4, 0, 8.9); scene.add(mix);
  const top = k.box(2.0, 0.1, 1.0, wood); top.position.y = 0.92; mix.add(top);
  for (const [x, z] of [[-0.9, -0.42], [0.9, -0.42], [-0.9, 0.42], [0.9, 0.42]] as const) { const l = k.box(0.08, 0.9, 0.08, dark); l.position.set(x, 0.45, z); mix.add(l); }
  const pots: THREE.Mesh[] = [];
  ['#E85D75', '#3DA5D9', '#F2C14E', '#5FB49C', '#9B5DE5', '#FF8C42', '#F4F1EA'].forEach((c, i) => {
    const pot = k.cyl(0.11, 0.1, 0.2, k.std(c, { roughness: 0.35 })); pot.position.set(-0.75 + (i % 4) * 0.5, 1.07, i < 4 ? -0.2 : 0.22); mix.add(pot); pots.push(pot);
  });
  const palette = k.cyl(0.32, 0.32, 0.03, k.std('#D9B98A')); palette.position.set(0.55, 0.99, 0.25); mix.add(palette);
  solids.push({ x0: 2.35, x1: 4.45, z0: 8.35, z1: 9.45 });
  // shelves of jars on the right wall
  const shelves = new THREE.Group(); shelves.position.set(HALF_W - 0.25, 0, 11.2); scene.add(shelves);
  for (const y of [1.1, 1.75, 2.4]) {
    const sh = k.box(0.38, 0.06, 2.0, wood); sh.position.y = y; shelves.add(sh);
    for (let i = 0; i < 5; i++) { const j = k.cyl(0.08, 0.08, 0.26 + (i % 2) * 0.08, k.std(['#E85D75', '#3DA5D9', '#F2C14E', '#5FB49C', '#9B5DE5'][(i + y * 3) % 5 | 0], { roughness: 0.3 })); j.position.set(0, y + 0.16, -0.8 + i * 0.4); shelves.add(j); }
  }
  // plants in the corners
  const leaf = k.std('#3E8E4E', { roughness: 0.8 }), potMat = k.std('#C76B4A', { roughness: 0.8 });
  for (const [x, z] of [[-HALF_W + 0.7, 12.2], [HALF_W - 0.7, 5.0]] as const) {
    const pot = k.cyl(0.32, 0.24, 0.55, potMat); pot.position.set(x, 0.28, z); scene.add(pot);
    for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(T(new THREE.SphereGeometry(0.28, 10, 8)), leaf); l.scale.set(0.6, 1.4, 0.35); const a = (i / 7) * Math.PI * 2; l.position.set(x + Math.cos(a) * 0.18, 0.95 + (i % 3) * 0.16, z + Math.sin(a) * 0.18); l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5); scene.add(l); }
    solids.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 });
  }
  // the guest book on its lectern, by the door
  const lect = new THREE.Group(); lect.position.set(-4.3, 0, 4.9); lect.rotation.y = 0.5; scene.add(lect);
  const lpost = k.box(0.12, 1.0, 0.12, dark); lpost.position.y = 0.5; lect.add(lpost);
  const ltop = k.box(0.62, 0.05, 0.44, wood); ltop.position.y = 1.04; ltop.rotation.x = -0.35; lect.add(ltop);
  const book = k.box(0.5, 0.04, 0.34, k.std('#8E2F3C')); book.position.set(0, 1.08, 0.01); book.rotation.x = -0.35; lect.add(book);
  solids.push({ x0: -4.7, x1: -3.9, z0: 4.5, z1: 5.3 });
  // the show desk (Gallery) / the supplies cart (Studio)
  const desk = new THREE.Group(); desk.position.set(3.9, 0, 5.4); scene.add(desk);
  const dTop = k.box(1.7, 0.95, 0.75, gallery ? k.std('#EEE9E0', { roughness: 0.4 }) : wood); dTop.position.y = 0.48; desk.add(dTop);
  const dLip = k.box(1.76, 0.06, 0.8, gallery ? k.std('#C9A04A', { metalness: 0.6, roughness: 0.35 }) : dark); dLip.position.y = 0.98; desk.add(dLip);
  const deskSign = k.label(gallery ? 'Show desk' : 'Supplies', gallery ? '#D9B24A' : '#FF9F1C', { w: 420 }); deskSign.position.set(0, 1.6, 0); deskSign.scale.multiplyScalar(0.62); desk.add(deskSign);
  solids.push({ x0: 3.0, x1: 4.8, z0: 5.0, z1: 5.8 });
  // sunlight through the skylight, falling across the floor
  const beamMat = T(new THREE.MeshBasicMaterial({ color: '#FFE8B8', transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(T(new THREE.CylinderGeometry(0.7, 1.7, 7, 16, 1, true)), beamMat); b.position.set(-2 + i * 2.4, 3.3, 7.6 + (i % 2) * 1.6); b.rotation.z = 0.32; b.rotation.x = -0.12; scene.add(b); }
  // a few dried splashes of paint on the floor
  for (let i = 0; i < 9; i++) {
    const c = ['#E85D75', '#3DA5D9', '#F2C14E', '#5FB49C', '#9B5DE5'][i % 5];
    const sp = new THREE.Mesh(T(new THREE.CircleGeometry(0.08 + k.rnd() * 0.14, 10)), k.basic(c, { transparent: true, opacity: 0.85 }));
    sp.rotation.x = -Math.PI / 2; sp.position.set(-4 + k.rnd() * 7.5, 0.012, 6.2 + k.rnd() * 5.5); scene.add(sp);
  }

  // ---- the Gallery's rooms -----------------------------------------------------------------------------------------
  const roomMats = new Map<number, THREE.MeshStandardMaterial>();
  const solidsGallery: Rect[] = [];
  const roomWall = (r: number) => { let m = roomMats.get(r); if (!m) { m = wallMat(WALLS[p.hall?.room_walls?.[String(r)] ?? 'white'] ?? WALLS.white); roomMats.set(r, m); } return m; };
  const locks: { rope: THREE.Group; k: number }[] = [];
  if (gallery) {
    for (let r = 1; r <= shown; r++) {
      const z0 = roomStart(r), z1 = z0 - ROOM_D, open = r <= rooms;
      const m = open ? roomWall(r) : wallMat('#2A2630'), room = open ? r : undefined;
      wall(-HALF_W - 0.3, -HALF_W, z1, z0, m, WALL_H, false, { room, cap: galleryCap });
      wall(HALF_W, HALF_W + 0.3, z1, z0, m, WALL_H, false, { room, cap: galleryCap });
      if (r < shown) {
        // the wall into the next room, with its doorway (roped off if the room isn't yours yet): all of it gets out of
        // your way once you're through
        const pw = new THREE.Group(); scene.add(pw);
        wall(-HALF_W, -1.6, z1 - 0.15, z1 + 0.15, m, WALL_H, true, { add: pw, room, cap: galleryCap });
        wall(1.6, HALF_W, z1 - 0.15, z1 + 0.15, m, WALL_H, true, { add: pw, room, cap: galleryCap });
        wall(-1.6, 1.6, z1 - 0.15, z1 + 0.15, m, 0.8, false, { add: pw, room, cap: galleryCap, y0: WALL_H - 0.8 });
        pw.add(wallSign(`ROOM ${r + 1}`, r + 1 <= rooms ? '' : 'not open yet', 0, WALL_H - 0.4, z1 + 0.17, 1.5));
        k.fadeable(pw);
        if (r + 1 > rooms) {
          solidsGallery.push({ x0: -1.6, x1: 1.6, z0: z1 - 0.2, z1: z1 + 0.25 });
          const rope = new THREE.Group(); rope.position.set(0, 0, z1 + 0.35); scene.add(rope);
          const velvet = k.std('#8E1F33', { roughness: 0.7 });
          for (const s of [-1, 1]) { const post = k.cyl(0.06, 0.08, 1.0, brass); post.position.set(s * 1.3, 0.5, 0); rope.add(post); const ball = new THREE.Mesh(T(new THREE.SphereGeometry(0.08, 10, 8)), brass); ball.position.set(s * 1.3, 1.04, 0); rope.add(ball); }
          const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.3, 0.92, 0), new THREE.Vector3(0, 0.62, 0), new THREE.Vector3(1.3, 0.92, 0)]);
          rope.add(new THREE.Mesh(T(new THREE.TubeGeometry(curve, 20, 0.035, 8)), velvet));
          locks.push({ rope, k: r + 1 });
        }
      }
      if (open) {
        // the display wall across the middle of the room (a gap in the middle to walk through)
        const pz = z0 - PANEL_AT, dw = new THREE.Group(); scene.add(dw);
        for (const sd of [-1, 1]) {
          wall(sd > 0 ? 1.25 : -4.65, sd > 0 ? 4.65 : -1.25, pz - 0.13, pz + 0.13, m, 2.95, true, { add: dw, room, cap: galleryCap });
          // a plinth line along its foot
          const plinth = k.box(3.42, 0.08, 0.3, galleryCap); plinth.position.set(sd * 2.95, 0.04, pz); dw.add(plinth);
        }
        k.fadeable(dw);
        // benches against the side walls (a classic gallery bench), from the second room on
        if (r > 1) for (const sd of [-1, 1]) {
          const bench = new THREE.Group(); bench.position.set(sd * 5.15, 0, z0 - 7.4); scene.add(bench);
          const seat = k.box(0.62, 0.12, 2.2, k.std('#2B2B30', { roughness: 0.5 })); seat.position.y = 0.48; bench.add(seat);
          for (const e of [-1, 1]) { const leg = k.box(0.5, 0.46, 0.1, k.std('#9A9AA4', { metalness: 0.7, roughness: 0.3 })); leg.position.set(0, 0.23, e * 0.9); bench.add(leg); }
          solidsGallery.push({ x0: sd * 5.15 - 0.36, x1: sd * 5.15 + 0.36, z0: z0 - 8.55, z1: z0 - 6.25 });
        }
      }
    }
    // the end wall
    const endZ = roomStart(shown) - ROOM_D;
    wall(-HALF_W, HALF_W, endZ - 0.3, endZ, shown <= rooms ? roomWall(shown) : wallMat('#2A2630'), WALL_H, true, { room: shown <= rooms ? shown : undefined, cap: galleryCap });
  }
  solids.push(...solidsGallery);

  // ---- the piece of the week, on its own easel in the first room ---------------------------------------------------
  const potw = new THREE.Group(); potw.position.set(-4.3, 0, roomStart(1) - 1.7); potw.visible = false; if (gallery) scene.add(potw);
  for (const s of [-1, 1]) { const leg = k.box(0.08, 2.4, 0.08, brass); leg.position.set(s * 0.55, 1.16, 0); leg.rotation.z = -s * 0.12; potw.add(leg); }
  const potwBack = k.box(0.07, 2.3, 0.07, brass); potwBack.position.set(0, 1.12, -0.5); potwBack.rotation.x = 0.28; potw.add(potwBack);
  const potwArt = new THREE.Group(); potwArt.position.set(0, 1.62, 0.08); potw.add(potwArt);
  const ribbon = k.label('★ PIECE OF THE WEEK', '#FFE14D', { w: 640 }); ribbon.position.set(0, 2.75, 0.1); ribbon.scale.multiplyScalar(0.55); potw.add(ribbon);
  if (gallery) k.fadeable(potw);
  const potwSolid: Rect = { x0: -5.1, x1: -3.5, z0: roomStart(1) - 2.25, z1: roomStart(1) - 1.25 };
  // the show banner, hanging in the first room
  const banner = new THREE.Group(); banner.position.set(4.4, 0, roomStart(1) - 1.5); banner.visible = false; if (gallery) scene.add(banner);
  const bannerMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }); T(bannerMat);
  const bannerCloth = k.plane(1.2, 2.2, bannerMat); bannerCloth.position.y = 2.2; banner.add(bannerCloth);
  const bannerPole = k.cyl(0.03, 0.03, 1.4, k.std('#D9B24A', { metalness: 0.85, roughness: 0.28 })); bannerPole.rotation.z = Math.PI / 2; bannerPole.position.y = 3.32; banner.add(bannerPole);
  if (gallery) k.fadeable(banner, true);

  // ---- art on the walls --------------------------------------------------------------------------------------------
  const texCache = new Map<string, Promise<Loaded>>();
  const loadTex = (path: string | null): Promise<Loaded> => {
    const key = path ?? ''; let pr = texCache.get(key);
    if (!pr) {
      pr = (async () => {
        const url = await urls.get(path).catch(() => null); if (!url) return { tex: null, url: null };
        const tex = await new Promise<THREE.Texture | null>((res) => new THREE.TextureLoader().load(url, (t) => res(t), undefined, () => res(null)));
        if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.anisotropy = 4; tex.userData.shared = true; T(tex); }
        return { tex, url };
      })();
      texCache.set(key, pr);
    }
    return pr;
  };
  /** a soft round light (for the washes on the walls and the pools on the floor) */
  const softDot = k.canvasTex(128, 128, (c) => { const gr = c.createRadialGradient(64, 64, 2, 64, 64, 63); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); });
  softDot.userData.shared = true;
  /** how far each frame sticks out past the picture */
  const FRAME_EDGE: Record<string, number> = { oak: 0.14, gilt: 0.165, ebony: 0.13, neon: 0.085, float: 0.11, baroque: 0.27 };
  /** a picture, w×h, in its frame (the group's front faces +z) */
  const framed = (kind: string, w: number, h: number, art: THREE.Material) => {
    const g = new THREE.Group();
    const bar = (bw: number, bh: number, d: number, m: THREE.Material, x: number, y: number, z = 0) => { const b = k.box(bw, bh, d, m); b.position.set(x, y, z); g.add(b); return b; };
    const ring4 = (t: number, d: number, m: THREE.Material, z = 0.02) => { bar(w + t * 2, t, d, m, 0, h / 2 + t / 2, z); bar(w + t * 2, t, d, m, 0, -h / 2 - t / 2, z); bar(t, h, d, m, -w / 2 - t / 2, 0, z); bar(t, h, d, m, w / 2 + t / 2, 0, z); };
    const pic = k.plane(w, h, art); pic.position.z = 0.03;
    if (kind === 'float') {
      bar(w + 0.22, h + 0.22, 0.04, k.std('#1A1A1E', { roughness: 0.6 }), 0, 0, -0.02);
      pic.position.z = 0.1; g.add(pic);
      const glass = k.plane(w, h, k.basic('#ffffff', { transparent: true, opacity: 0.07, depthWrite: false })); glass.position.z = 0.115; g.add(glass);
      return g;
    }
    g.add(pic);
    if (kind === 'gilt') { ring4(0.13, 0.1, k.std('#D9B24A', { metalness: 0.9, roughness: 0.28 })); ring4(0.035, 0.12, k.std('#8E6E22', { metalness: 0.8, roughness: 0.35 }), 0.03); }
    else if (kind === 'ebony') { ring4(0.11, 0.09, k.std('#121015', { roughness: 0.22, metalness: 0.2 })); ring4(0.02, 0.1, k.std('#C9CCD6', { metalness: 0.9, roughness: 0.2 }), 0.03); }
    else if (kind === 'neon') { ring4(0.05, 0.06, k.std('#15121C')); ring4(0.035, 0.05, k.glow('#FF3D9A', 2.4), 0.06); }
    else if (kind === 'baroque') {
      const gold = k.std('#E3B94E', { metalness: 0.95, roughness: 0.25 });
      ring4(0.22, 0.14, gold); ring4(0.05, 0.08, k.std('#7A1428', { roughness: 0.85 }), 0.01);
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { const o = new THREE.Mesh(T(new THREE.SphereGeometry(0.14, 12, 10)), gold); o.position.set(x * (w / 2 + 0.11), y * (h / 2 + 0.11), 0.07); g.add(o); }
      for (const y of [-1, 1]) { const o = new THREE.Mesh(T(new THREE.SphereGeometry(0.1, 12, 10)), gold); o.scale.set(1.8, 1, 0.6); o.position.set(0, y * (h / 2 + 0.11), 0.08); g.add(o); }
    } else { ring4(0.11, 0.08, k.std('#9A6B3C', { roughness: 0.55 })); ring4(0.03, 0.09, k.std('#6F4A28', { roughness: 0.5 }), 0.025); }
    return g;
  };
  const plaqueTex = (title: string, artist: string) => k.canvasTex(512, 160, (g) => {
    g.fillStyle = '#F3EDE1'; g.fillRect(0, 0, 512, 160); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 4; g.strokeRect(2, 2, 508, 156);
    g.fillStyle = '#1C1A22'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '700 42px "Manrope Variable", system-ui, sans-serif'; g.fillText(title.slice(0, 26), 26, 70, 460);
    g.font = '500 30px "Manrope Variable", system-ui, sans-serif'; g.fillStyle = '#6A6470'; g.fillText(`@${artist}`, 26, 122, 460);
  });
  /** fit a picture into the slot's box, keeping its shape */
  const fit = (w: number, h: number, maxW = 2.35, maxH = 1.9) => { const s = Math.min(maxW / w, maxH / h); return [w * s, h * s] as const; };
  type Slot = { key: string; group: THREE.Group; glow: THREE.Mesh | null; t: number };
  const slots = new Map<string, Slot>();
  const empties = new Map<string, THREE.Group>();
  const emptyGroup = (slot: string) => {
    const at = slotAt(slot); const g = new THREE.Group(); g.position.set(at.x, at.y, at.z);
    const dash = k.canvasTex(256, 200, (c) => { c.setLineDash([16, 12]); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 6; c.strokeRect(8, 8, 240, 184); c.font = '900 90px system-ui'; c.fillStyle = 'rgba(255,255,255,0.55)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+', 128, 104); });
    const pl = k.plane(2.0, 1.56, k.basic('#ffffff', { map: dash, transparent: true, depthWrite: false })); pl.position.z = 0.02; g.add(pl);
    scene.add(g); k.fadeable(g, true, [-HALF_W, HALF_W]); return g;
  };
  const build = (h: GalleryHang) => {
    const at = slotAt(h.slot);
    const g = new THREE.Group(); g.position.set(at.x, at.y, at.z); scene.add(g);
    const [w, hh] = fit(h.piece.w, h.piece.h);
    const light = LIGHTS[h.light] ?? LIGHTS.warm, pw = h.power / 100;
    const art = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, emissive: light, emissiveIntensity: 0.1 + pw * 0.72 }); T(art);
    // hung on a wire, leaning out a touch at the top (so it reads from up behind you)
    const fr = framed(h.frame, w, hh, art); fr.rotation.x = 0.07; fr.position.z = 0.02 + (hh / 2) * 0.07; g.add(fr);
    void loadTex(h.piece.preview_path).then(({ tex }) => { if (tex) { art.map = tex; art.emissiveMap = tex; art.needsUpdate = true; } });
    const aim = h.aim / 30, edge = FRAME_EDGE[h.frame] ?? 0.12;
    // the wash of light on the wall, aimed left or right, and the pool it throws on the floor
    const wash = k.plane(w * 1.85, hh * 2.0, T(new THREE.MeshBasicMaterial({ map: softDot, color: light, transparent: true, opacity: 0.1 + pw * 0.38, blending: THREE.AdditiveBlending, depthWrite: false })));
    wash.position.set(aim * 0.45, 0.16, 0.006); g.add(wash);
    const floorPool = k.plane(w * 1.6, 1.7, T(new THREE.MeshBasicMaterial({ map: softDot, color: light, transparent: true, opacity: 0.05 + pw * 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));
    floorPool.rotation.x = -Math.PI / 2; floorPool.position.set(aim * 0.6, -at.y + 0.008, 0.95); g.add(floorPool);
    // the picture light: a slim bar on a stem just above the frame, lit underneath
    const barW = Math.min(1.25, Math.max(0.55, w * 0.5)), barY = hh / 2 + edge + 0.2, barX = aim * 0.18;
    const barMat = k.std(h.frame === 'gilt' || h.frame === 'baroque' ? '#C9A04A' : '#1E1D24', { metalness: 0.75, roughness: 0.3 });
    const stem = k.box(0.04, 0.04, 0.2, barMat); stem.position.set(barX, barY, 0.1); g.add(stem);
    const bar = k.cyl(0.035, 0.035, barW, barMat, 12); bar.rotation.z = Math.PI / 2; bar.rotation.y = aim * 0.25; bar.position.set(barX, barY - 0.02, 0.21); g.add(bar);
    const lit = k.box(barW * 0.92, 0.012, 0.03, k.glow(light, 1.4 + pw * 1.8)); lit.position.set(barX, barY - 0.058, 0.21); g.add(lit);
    // the plaque, to the right at eye height
    const pq = k.plane(0.66, 0.21, k.std('#ffffff', { map: plaqueTex(h.plaque_title || h.piece.title, h.piece.artist), roughness: 0.6 }));
    pq.position.set(w / 2 + edge + 0.42, -hh / 2 + 0.1, 0.02); g.add(pq);
    const glow = k.plane(w + 0.6, hh + 0.6, T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
    glow.position.z = -0.01; g.add(glow);
    k.fadeable(g, true, [-HALF_W, HALF_W]);
    return { group: g, glow };
  };
  const keyOf = (h: GalleryHang) => [h.piece.id, h.frame, h.light, h.power, h.aim, h.plaque_title ?? '', h.piece.preview_path].join('|');
  const freeGroup = (g: THREE.Group) => {
    scene.remove(g);
    g.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh) return; m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const x of mats) { const mm = x as THREE.MeshStandardMaterial; if (mm.map && !mm.map.userData.shared) mm.map.dispose(); x.dispose(); } });
  };

  let potwKey = '', last: ArtPlace | null = null, previewing = false;
  const setHall = (pl: ArtPlace, isPreview = false) => {
    if (pl.tier !== 'gallery' || !pl.hall) return;
    if (!isPreview) { last = pl; previewing = false; }
    const want = new Map(pl.hall.hangs.filter((h) => Number(h.slot[1]) <= rooms).map((h) => [h.slot, h]));
    for (const [slot, s] of slots) if (!want.has(slot) || want.get(slot) && keyOf(want.get(slot)!) !== s.key) { freeGroup(s.group); slots.delete(slot); }
    for (const [slot, h] of want) if (!slots.has(slot)) { const b = build(h); slots.set(slot, { key: keyOf(h), group: b.group, glow: b.glow, t: 0 }); }
    // the owner sees where a piece could go
    for (let r = 1; r <= rooms; r++) for (const s of SLOTS_IN) {
      const slot = `r${r}${s}`; const hasEmpty = empties.has(slot), need = pl.mine && !want.has(slot);
      if (need && !hasEmpty) empties.set(slot, emptyGroup(slot));
      if (!need && hasEmpty) { freeGroup(empties.get(slot)!); empties.delete(slot); }
    }
    // spots: a hung piece for everyone, an empty wall only for its owner
    for (const sp of spots) if (sp.id.startsWith('slot:')) sp.off = !want.has(sp.id.slice(5)) && !pl.mine;
    if (isPreview) return; // (a preview only changes the walls)
    // each room's wall colour
    for (const { r, m } of painted) (m.material as THREE.MeshStandardMaterial).color.set(WALLS[pl.hall.room_walls?.[String(r)] ?? 'white'] ?? WALLS.white);
    // piece of the week
    const pw = pl.hall.piece_of_week; const nk = pw ? `${pw.id}|${pw.preview_path}` : '';
    if (nk !== potwKey) {
      potwKey = nk; for (const c of [...potwArt.children]) { potwArt.remove(c); freeGroup(c as THREE.Group); }
      potw.visible = !!pw; const spot = spots.find((s) => s.id === 'potw'); if (spot) spot.off = !pw;
      const i = solids.indexOf(potwSolid); if (pw && i < 0) solids.push(potwSolid); if (!pw && i >= 0) solids.splice(i, 1);
      if (pw) {
        const [w, h] = fit(pw.w, pw.h, 1.4, 1.2);
        const art = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, emissive: '#FFF0D0', emissiveIntensity: 0.55 }); T(art);
        potwArt.add(framed('gilt', w, h, art));
        void loadTex(pw.preview_path).then(({ tex }) => { if (tex) { art.map = tex; art.emissiveMap = tex; art.needsUpdate = true; } });
      }
      hooks.solids?.(solids);
    }
    // the show banner
    const show = pl.hall.show; banner.visible = !!show;
    if (show) {
      const tex = k.canvasTex(240, 440, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, 440); gr.addColorStop(0, '#2B1B3F'); gr.addColorStop(1, '#5A2A4A'); g.fillStyle = gr; g.fillRect(0, 0, 240, 440);
        g.fillStyle = '#FFE14D'; g.fillRect(0, 0, 240, 10); g.fillRect(0, 430, 240, 10);
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 22px "Manrope Variable", system-ui'; g.fillText(`SHOW No. ${show.no}`, 120, 60);
        g.font = '800 36px "Unbounded Variable", system-ui'; const words = (show.title || 'New work').split(' '); let line = '', y = 150;
        for (const wd of words) { if (g.measureText(line + wd).width > 200) { g.fillText(line.trim(), 120, y); line = ''; y += 46; } line += wd + ' '; } g.fillText(line.trim(), 120, y);
        g.font = '600 22px "Manrope Variable", system-ui'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(`@${pl.owner.username}`, 120, 400);
      });
      bannerMat.map?.dispose(); bannerMat.map = tex; bannerMat.needsUpdate = true;
    }
    // the studio window and easel show the mural
    void loadTex(pl.mural?.preview_path ?? null).then(({ tex }) => {
      if (!tex) return;
      viewMat.map = tex; viewMat.color.set('#ffffff'); viewMat.needsUpdate = true;
      blankMat.map = tex; blankMat.needsUpdate = true;
    });
    // visitors walk the show (more for a better one); a quiet gallery has one regular sketching
    const hung = [...want.keys()];
    const n = pl.hall.show ? Math.min(7, 2 + Math.floor(pl.hall.score.total / 20)) : hung.length ? 1 : 0;
    const list: Npc[] = [];
    for (let i = 0; i < n; i++) {
      const order = hung.slice().sort((a, b) => ((a.charCodeAt(1) * 7 + a.charCodeAt(3) * 13 + i * 31) % 17) - ((b.charCodeAt(1) * 7 + b.charCodeAt(3) * 13 + i * 31) % 17));
      const route = order.map((s) => { const at = slotAt(s); return { x: at.standX * 0.86 + (i % 2 ? 0.35 : -0.35), z: at.standZ + ((i % 3) - 1) * 0.5, wait: 3 + ((i * 7 + s.charCodeAt(3)) % 5) }; });
      if (route.length) list.push({ id: `v${i}`, url: npcUrl(pl.hall.show ? 1000 + i + pl.hall.show.no * 17 : 77, pl.hall.show ? (i === 0 ? 'critic' : 'visitor') : 'artist'), route, speed: 1.1 + (i % 3) * 0.15 });
    }
    hooks.npcs?.(list);
  };

  // ---- spots ---------------------------------------------------------------------------------------------------------
  const spots: PlaceSpot[] = [
    { id: 'easel', x: -2.2, z: 9.6, r: 1.0, focus: { at: new THREE.Vector3(-1.4, 2.3, 11.2), look: new THREE.Vector3(-2.5, 1.55, 8.2) } },
    { id: 'window', x: -4.7, z: 6.8, r: 1.0, focus: { at: new THREE.Vector3(-2.0, 2.1, 7.4), look: new THREE.Vector3(-6, 1.9, 6.6) } },
    { id: 'mix', x: 3.4, z: 10.0, r: 1.0, focus: { at: new THREE.Vector3(3.4, 2.6, 11.6), look: new THREE.Vector3(3.4, 0.95, 8.9) } },
    { id: 'desk', x: 3.4, z: 6.4, r: 1.0 },
    { id: 'book', x: -3.6, z: 5.7, r: 0.9 },
  ];
  if (!gallery) spots.push({ id: 'doors', x: 0, z: 5.0, r: 1.1 });
  if (gallery) {
    spots.push({ id: 'potw', x: -4.3, z: roomStart(1) - 0.62, r: 0.9, off: true });
    for (let r = 1; r <= rooms; r++) for (const s of SLOTS_IN) {
      const slot = `r${r}${s}`, at = slotAt(slot);
      // framing a piece: square on, a little above, with it in the top part of the screen (a sheet covers the rest)
      const cx = at.x + 0.3;
      spots.push({ id: `slot:${slot}`, x: at.standX, z: at.standZ, r: 1.0,
        focus: { at: new THREE.Vector3(cx * 0.92, 2.9, at.z + 5.4), look: new THREE.Vector3(cx, 0.3, at.z), subject: new THREE.Vector3(cx, at.y, at.z) } });
    }
    if (rooms < (p.cfg.rooms_max ?? 5) && shown > rooms) spots.push({ id: `room:${rooms + 1}`, x: 0, z: roomStart(rooms + 1) + 1.2, r: 1.1 });
  }
  const taps: { obj: THREE.Object3D; spot: string }[] = [
    { obj: easel, spot: 'easel' }, { obj: win, spot: 'window' }, { obj: mix, spot: 'mix' }, { obj: desk, spot: 'desk' }, { obj: lect, spot: 'book' },
  ];
  if (!gallery) taps.push({ obj: doors, spot: 'doors' });
  if (gallery) { taps.push({ obj: potw, spot: 'potw' }); for (const l of locks) taps.push({ obj: l.rope, spot: `room:${l.k}` }); }

  let hi: string | null = null;
  const world: ArtWorld = {
    bounds: { x0: -HALF_W, x1: HALF_W, z0: zMin + 0.2, z1: STUDIO.z1 + 0.6 },
    start: { x: 0.4, z: 11.6, face: 1 },
    floors, solids, spots, taps,
    // up high and steep (walls between you and the camera cut away), wider and further back on a tall phone screen
    camera: { height: 7.2, back: 4.9, look: 2.2, fov: 46, side: 0.72, tall: 0.42, fovTall: 5 },
    setHall: (pl) => setHall(pl),
    preview(slot, h) {
      if (!last?.hall) return;
      if (!h) { if (previewing) { previewing = false; setHall(last); } return; }
      previewing = true;
      // the piece moves here from wherever else it hung (as saving it would)
      const hangs = last.hall.hangs.filter((x) => x.slot !== slot && x.piece.id !== h.piece.id).concat(h);
      setHall({ ...last, hall: { ...last.hall, hangs } }, true);
    },
    highlight(slot) { hi = slot; },
    pieceAt(slot) { const at = slotAt(slot); return new THREE.Vector3(at.x - at.side * 0.2, at.y, at.z); },
    update(t) {
      for (const [slot, s] of slots) {
        const want = slot === hi ? 0.22 + Math.sin(t * 3.2) * 0.06 : 0; s.t += (want - s.t) * 0.15;
        if (s.glow) (s.glow.material as THREE.MeshBasicMaterial).opacity = s.t;
      }
      if (!k.reduceMotion) {
        pots.forEach((pt, i) => { pt.position.y = 1.07 + Math.max(0, Math.sin(t * 1.6 + i)) * 0.012; });
        if (potw.visible) ribbon.position.y = 2.75 + Math.sin(t * 2) * 0.04;
        if (banner.visible) bannerCloth.rotation.y = Math.sin(t * 0.7) * 0.08;
      }
    },
  };
  return world;
}
