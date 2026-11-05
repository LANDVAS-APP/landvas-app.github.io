// Home furniture: the catalogue (what each piece is called, what it costs, how much floor it takes) and a builder
// for each one. Everything is modelled from simple shapes (rounded boxes, cylinders, spheres) so it loads
// instantly, and most pieces move: the clock tells the real time, the fire flickers, the fish swim, the record
// spins. Built facing +z ("towards the camera"); r rotates in quarter turns.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Mount = 'floor' | 'wall' | 'ceil' | 'rug';
export type Tint = 'fabric' | 'wood' | 'paint' | null;
export type Cat = 'Seating' | 'Tables' | 'Bedroom' | 'Storage' | 'Lights' | 'Plants' | 'Rugs' | 'Kitchen' | 'Fun' | 'Wall' | 'Arcade';
export type CatItem = {
  id: string; name: string; cat: Cat; emoji: string; mount: Mount; w: number; d: number; tint: Tint;
  /** a surface small things can stand on (its height) */ top?: number;
  /** small enough to stand on a table */ small?: boolean;
  /** gives off light: colour, strength, height */ light?: [string, number, number];
  blurb?: string;
};

export const CATALOG: CatItem[] = [
  { id: 'sofa', name: 'Sofa', cat: 'Seating', emoji: '🛋️', mount: 'floor', w: 2.2, d: 0.95, tint: 'fabric', blurb: 'Deep cushions, room for three.' },
  { id: 'armchair', name: 'Armchair', cat: 'Seating', emoji: '💺', mount: 'floor', w: 1.0, d: 0.95, tint: 'fabric' },
  { id: 'beanbag', name: 'Bean bag', cat: 'Seating', emoji: '🫘', mount: 'floor', w: 0.95, d: 0.95, tint: 'fabric' },
  { id: 'dining_chair', name: 'Dining chair', cat: 'Seating', emoji: '🪑', mount: 'floor', w: 0.5, d: 0.5, tint: 'wood' },
  { id: 'bar_stool', name: 'Bar stool', cat: 'Seating', emoji: '🪑', mount: 'floor', w: 0.45, d: 0.45, tint: 'paint' },
  { id: 'coffee_table', name: 'Coffee table', cat: 'Tables', emoji: '🟫', mount: 'floor', w: 1.25, d: 0.7, tint: 'wood', top: 0.44 },
  { id: 'side_table', name: 'Side table', cat: 'Tables', emoji: '🔲', mount: 'floor', w: 0.55, d: 0.55, tint: 'wood', top: 0.58 },
  { id: 'dining_table', name: 'Dining table', cat: 'Tables', emoji: '🍽️', mount: 'floor', w: 1.8, d: 1.0, tint: 'wood', top: 0.76 },
  { id: 'desk', name: 'Desk', cat: 'Tables', emoji: '💻', mount: 'floor', w: 1.4, d: 0.7, tint: 'wood', top: 0.76 },
  { id: 'bed', name: 'Bed', cat: 'Bedroom', emoji: '🛏️', mount: 'floor', w: 1.7, d: 2.15, tint: 'fabric' },
  { id: 'pet_bed', name: 'Inkborn bed', cat: 'Bedroom', emoji: '🐾', mount: 'floor', w: 0.8, d: 0.8, tint: 'fabric', blurb: 'Your Inkborn curl up here for naps.' },
  { id: 'dresser', name: 'Dresser', cat: 'Storage', emoji: '🗄️', mount: 'floor', w: 1.2, d: 0.5, tint: 'wood', top: 0.86 },
  { id: 'bookshelf', name: 'Bookshelf', cat: 'Storage', emoji: '📚', mount: 'floor', w: 1.2, d: 0.4, tint: 'wood' },
  { id: 'toy_chest', name: 'Toy chest', cat: 'Storage', emoji: '🧸', mount: 'floor', w: 0.9, d: 0.55, tint: 'paint', top: 0.52 },
  { id: 'trophy_case', name: 'Trophy case', cat: 'Storage', emoji: '🏆', mount: 'floor', w: 1.2, d: 0.45, tint: 'wood', blurb: 'Shows off your achievements.' },
  { id: 'floor_lamp', name: 'Floor lamp', cat: 'Lights', emoji: '💡', mount: 'floor', w: 0.45, d: 0.45, tint: 'paint', light: ['#FFD9A0', 5, 1.55] },
  { id: 'table_lamp', name: 'Table lamp', cat: 'Lights', emoji: '🛋️', mount: 'floor', w: 0.3, d: 0.3, tint: 'paint', small: true, light: ['#FFD9A0', 3, 0.45] },
  { id: 'lava_lamp', name: 'Lava lamp', cat: 'Lights', emoji: '🌋', mount: 'floor', w: 0.25, d: 0.25, tint: 'paint', small: true, light: ['#FF5FA2', 2.5, 0.35] },
  { id: 'chandelier', name: 'Chandelier', cat: 'Lights', emoji: '✨', mount: 'ceil', w: 1.0, d: 1.0, tint: null, light: ['#FFE6B0', 9, 2.6] },
  { id: 'string_lights', name: 'Fairy lights', cat: 'Lights', emoji: '🎇', mount: 'wall', w: 2.4, d: 0.1, tint: null },
  { id: 'monstera', name: 'Monstera', cat: 'Plants', emoji: '🪴', mount: 'floor', w: 0.7, d: 0.7, tint: 'paint' },
  { id: 'cactus', name: 'Cactus', cat: 'Plants', emoji: '🌵', mount: 'floor', w: 0.3, d: 0.3, tint: 'paint', small: true },
  { id: 'bonsai', name: 'Bonsai', cat: 'Plants', emoji: '🌳', mount: 'floor', w: 0.4, d: 0.3, tint: 'paint', small: true },
  { id: 'flower_vase', name: 'Flower vase', cat: 'Plants', emoji: '💐', mount: 'floor', w: 0.25, d: 0.25, tint: 'paint', small: true },
  { id: 'hanging_plant', name: 'Hanging plant', cat: 'Plants', emoji: '🌿', mount: 'ceil', w: 0.5, d: 0.5, tint: 'paint' },
  { id: 'rug_rect', name: 'Rug', cat: 'Rugs', emoji: '🟥', mount: 'rug', w: 2.6, d: 1.8, tint: 'fabric' },
  { id: 'rug_round', name: 'Round rug', cat: 'Rugs', emoji: '⭕', mount: 'rug', w: 2.0, d: 2.0, tint: 'fabric' },
  { id: 'rug_rainbow', name: 'Rainbow rug', cat: 'Rugs', emoji: '🌈', mount: 'rug', w: 2.4, d: 1.4, tint: null },
  { id: 'kitchen', name: 'Kitchenette', cat: 'Kitchen', emoji: '🍳', mount: 'floor', w: 2.0, d: 0.65, tint: 'paint', top: 0.92, blurb: 'Hob, sink and a kettle that steams.' },
  { id: 'fridge', name: 'Fridge', cat: 'Kitchen', emoji: '🧊', mount: 'floor', w: 0.75, d: 0.7, tint: 'paint' },
  { id: 'fireplace', name: 'Fireplace', cat: 'Fun', emoji: '🔥', mount: 'floor', w: 1.6, d: 0.55, tint: 'paint', top: 1.12, light: ['#FF8A3D', 6, 0.5] },
  { id: 'piano', name: 'Piano', cat: 'Fun', emoji: '🎹', mount: 'floor', w: 1.5, d: 0.65, tint: 'paint' },
  { id: 'record_player', name: 'Record player', cat: 'Fun', emoji: '🎶', mount: 'floor', w: 0.45, d: 0.4, tint: 'wood', small: true },
  { id: 'tv_console', name: 'TV & console', cat: 'Fun', emoji: '📺', mount: 'floor', w: 1.7, d: 0.48, tint: 'wood' },
  { id: 'aquarium', name: 'Aquarium', cat: 'Fun', emoji: '🐠', mount: 'floor', w: 1.4, d: 0.5, tint: 'wood' },
  { id: 'easel', name: 'Easel', cat: 'Fun', emoji: '🎨', mount: 'floor', w: 0.8, d: 0.6, tint: 'wood', blurb: 'Shows your latest art.' },
  { id: 'telescope', name: 'Telescope', cat: 'Fun', emoji: '🔭', mount: 'floor', w: 0.7, d: 0.7, tint: 'paint' },
  { id: 'globe', name: 'Globe', cat: 'Fun', emoji: '🌍', mount: 'floor', w: 0.4, d: 0.4, tint: 'wood', small: true },
  { id: 'grandfather_clock', name: 'Grandfather clock', cat: 'Fun', emoji: '🕰️', mount: 'floor', w: 0.6, d: 0.42, tint: 'wood' },
  { id: 'fountain', name: 'Fountain', cat: 'Fun', emoji: '⛲', mount: 'floor', w: 1.2, d: 1.2, tint: 'paint' },
  { id: 'wall_clock', name: 'Wall clock', cat: 'Wall', emoji: '🕒', mount: 'wall', w: 0.6, d: 0.08, tint: 'paint', blurb: 'Tells the real time.' },
  { id: 'wall_shelf', name: 'Wall shelf', cat: 'Wall', emoji: '🪵', mount: 'wall', w: 1.2, d: 0.25, tint: 'wood' },
  { id: 'wall_mirror', name: 'Mirror', cat: 'Wall', emoji: '🪞', mount: 'wall', w: 0.8, d: 0.06, tint: 'paint' },
  { id: 'wall_tv', name: 'Wall TV', cat: 'Wall', emoji: '📺', mount: 'wall', w: 1.5, d: 0.08, tint: null },
  { id: 'poster', name: 'Poster', cat: 'Wall', emoji: '🖼️', mount: 'wall', w: 0.8, d: 0.04, tint: 'paint' },
  { id: 'mini_arcade', name: 'Mini arcade', cat: 'Arcade', emoji: '🕹️', mount: 'floor', w: 0.8, d: 0.75, tint: 'paint', light: ['#22E3FF', 2.5, 1.4] },
  { id: 'neon_heart', name: 'Neon heart', cat: 'Arcade', emoji: '💗', mount: 'wall', w: 0.9, d: 0.06, tint: 'paint' },
  { id: 'gumball', name: 'Gumball machine', cat: 'Arcade', emoji: '🍬', mount: 'floor', w: 0.45, d: 0.45, tint: 'paint' },
  { id: 'plushies', name: 'Plushie pile', cat: 'Arcade', emoji: '🧸', mount: 'floor', w: 1.0, d: 0.8, tint: null },
  { id: 'jukebox', name: 'Jukebox', cat: 'Arcade', emoji: '📻', mount: 'floor', w: 0.9, d: 0.6, tint: 'paint', light: ['#FF3D9A', 2.5, 1.2] },
];
export const ITEM: Record<string, CatItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));
export const CATS: Cat[] = ['Seating', 'Tables', 'Bedroom', 'Storage', 'Lights', 'Plants', 'Rugs', 'Kitchen', 'Fun', 'Wall', 'Arcade'];

export const FABRICS = ['#E8DCC8', '#8C9BAE', '#3E5C76', '#2F4F4F', '#6B8E5A', '#C9A227', '#D9825B', '#B5485D', '#E7A1B0', '#7E6BB0', '#4A4A4A', '#F4F1EA'];
export const WOODS = ['#C69C6D', '#8B5A3C', '#5C3A21', '#E3C69A', '#3B2A20', '#A0522D', '#D8B98A', '#7B4B2A', '#F0E0C0', '#2B1D14', '#B07D4F', '#6E4B35'];
export const PAINTS = ['#FFFFFF', '#2B2B33', '#FF6B6B', '#FFB13D', '#FFE14D', '#3DDC97', '#22B8CF', '#4C6EF5', '#8B5CFF', '#FF5FA2', '#9AA5B1', '#1E7F5C'];
export const swatches = (t: Tint) => (t === 'fabric' ? FABRICS : t === 'wood' ? WOODS : t === 'paint' ? PAINTS : []);
/** the colour a piece starts in */
export const DEFAULT_C: Record<string, number> = { sofa: 1, armchair: 6, beanbag: 9, rug_rect: 7, rug_round: 3, bed: 2, pet_bed: 8, floor_lamp: 1, table_lamp: 4, lava_lamp: 9,
  monstera: 0, cactus: 6, bonsai: 1, flower_vase: 7, hanging_plant: 0, kitchen: 0, fridge: 0, fireplace: 0, piano: 1, telescope: 7, fountain: 0, wall_clock: 1, wall_mirror: 3,
  poster: 8, mini_arcade: 8, neon_heart: 9, gumball: 2, jukebox: 2, bar_stool: 1, toy_chest: 6 };
export const colorOf = (id: string, c: number | undefined) => { const sw = swatches(ITEM[id]?.tint ?? null); return sw.length ? sw[(c ?? DEFAULT_C[id] ?? 0) % sw.length] : '#ffffff'; };

// ---- building ------------------------------------------------------------------------------------------------------
export type Kit = {
  T<X extends { dispose(): void }>(x: X): X;
  std(color: string, p?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  glow(color: string, k?: number): THREE.MeshStandardMaterial;
  canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture;
};
export type Built = { g: THREE.Group; tick?(t: number, dt: number): void; screen?: (url: string | null) => void };
export type Ctx = { art: string[]; achievements: string[]; reduceMotion: boolean };

export function makeKit(): Kit & { dispose(): void } {
  const bag: { dispose(): void }[] = [];
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  return {
    T,
    std(color, p = {}) {
      const key = color + JSON.stringify(p, (k, v) => (v instanceof THREE.Texture ? v.uuid : v));
      let m = mats.get(key); if (!m) { m = T(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...p })); mats.set(key, m); } return m;
    },
    glow(color, k = 1.6) { return this.std(color, { emissive: color, emissiveIntensity: k, roughness: 0.35 }); },
    canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; },
    dispose() { for (const x of bag) x.dispose(); bag.length = 0; mats.clear(); },
  };
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const G = <X extends THREE.BufferGeometry>(key: string, make: () => X): X => { let g = geoCache.get(key) as X | undefined; if (!g) { g = make(); geoCache.set(key, g); } return g; };
const rbox = (w: number, h: number, d: number, r = 0.06) => G(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
const bx = (w: number, h: number, d: number) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cy = (rt: number, rb: number, h: number, s = 18, open = false) => G(`c${rt},${rb},${h},${s},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open));
const sp = (r: number, s = 16) => G(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(8, s * 0.75)));
const tor = (r: number, t: number) => G(`t${r},${t}`, () => new THREE.TorusGeometry(r, t, 10, 28));

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
const shade = (hex: string, k: number) => { const c = new THREE.Color(hex); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + k))); return '#' + c.getHexString(); };

/** a leaf: a flattened sphere, tilted */
function leaf(parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, s: number, ry: number, rx: number) {
  const l = put(parent, sp(1, 10), m, x, y, z); l.scale.set(s * 0.55, s * 0.08, s); l.rotation.set(rx, ry, 0); return l;
}

export function buildItem(id: string, c: number | undefined, k: Kit, ctx: Ctx): Built {
  const g = new THREE.Group();
  const col = colorOf(id, c);
  const fab = k.std(col, { roughness: 0.95 }), fabD = k.std(shade(col, -0.08), { roughness: 0.95 });
  const wood = k.std(col, { roughness: 0.55 }), woodD = k.std(shade(col, -0.12), { roughness: 0.55 });
  const paint = k.std(col, { roughness: 0.45 });
  const metal = k.std('#B8BCC6', { metalness: 0.85, roughness: 0.3 }), dark = k.std('#22222A', { roughness: 0.5 }), brass = k.std('#D4A84B', { metalness: 0.9, roughness: 0.3 });
  const white = k.std('#F6F4EE', { roughness: 0.6 }), glass = k.std('#BFE6FF', { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const pot = k.std(c == null ? '#E07A5F' : col, { roughness: 0.8 }), soil = k.std('#4A3426', { roughness: 1 }), leafM = k.std('#3E8E41', { roughness: 0.8 }), leafL = k.std('#5DB55F', { roughness: 0.8 });
  let tick: Built['tick'];
  let screen: Built['screen'];
  const legs = (w: number, d: number, h: number, r: number, m: THREE.Material, inset = 0.06, taper = 0.75) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, cy(r * taper, r, h, 10), m, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset));
  };
  switch (id) {
    case 'sofa': {
      put(g, rbox(2.2, 0.28, 0.9, 0.08), fabD, 0, 0.26, 0);
      for (const x of [-0.7, 0, 0.7]) put(g, rbox(0.7, 0.16, 0.72, 0.07), fab, x, 0.47, 0.06);
      put(g, rbox(2.2, 0.62, 0.22, 0.09), fabD, 0, 0.62, -0.36);
      for (const x of [-0.7, 0, 0.7]) { const b = put(g, rbox(0.68, 0.42, 0.16, 0.08), fab, x, 0.74, -0.2); b.rotation.x = -0.12; }
      for (const s of [-1, 1]) put(g, rbox(0.22, 0.52, 0.9, 0.08), fabD, s * 1.0, 0.44, 0);
      for (const s of [-1, 1]) { const p = put(g, rbox(0.34, 0.3, 0.12, 0.06), k.std(shade(col, 0.18), { roughness: 0.95 }), s * 0.62, 0.68, -0.08); p.rotation.set(-0.2, s * 0.2, s * 0.15); }
      legs(2.1, 0.8, 0.12, 0.035, k.std('#5C3A21'));
      break;
    }
    case 'armchair': {
      put(g, rbox(0.95, 0.28, 0.9, 0.08), fabD, 0, 0.26, 0);
      put(g, rbox(0.64, 0.16, 0.7, 0.07), fab, 0, 0.47, 0.06);
      const b = put(g, rbox(0.95, 0.72, 0.22, 0.09), fabD, 0, 0.66, -0.34); b.rotation.x = -0.08;
      for (const s of [-1, 1]) put(g, rbox(0.17, 0.55, 0.88, 0.07), fabD, s * 0.4, 0.46, 0);
      put(g, rbox(0.36, 0.3, 0.12, 0.06), k.std(shade(col, 0.15), { roughness: 0.95 }), 0, 0.68, -0.14).rotation.x = -0.2;
      legs(0.85, 0.8, 0.12, 0.035, k.std('#5C3A21'));
      break;
    }
    case 'beanbag': {
      const b = put(g, sp(0.48, 20), fab, 0, 0.3, 0); b.scale.set(1, 0.62, 1);
      const t = put(g, sp(0.36, 18), fabD, 0, 0.5, -0.18); t.scale.set(1.05, 0.7, 0.6);
      break;
    }
    case 'dining_chair': {
      put(g, rbox(0.46, 0.05, 0.44, 0.02), wood, 0, 0.46, 0);
      put(g, rbox(0.42, 0.04, 0.38, 0.02), k.std('#E8DCC8', { roughness: 0.95 }), 0, 0.5, 0.01);
      legs(0.42, 0.4, 0.45, 0.022, woodD, 0.03, 0.8);
      for (const s of [-1, 1]) put(g, bx(0.035, 0.5, 0.035), woodD, s * 0.19, 0.74, -0.19);
      for (const y of [0.62, 0.78, 0.94]) put(g, rbox(0.42, 0.06, 0.03, 0.012), wood, 0, y, -0.19);
      break;
    }
    case 'bar_stool': {
      put(g, cy(0.2, 0.2, 0.07, 22), paint, 0, 0.74, 0);
      put(g, cy(0.03, 0.03, 0.72, 10), metal, 0, 0.37, 0);
      put(g, cy(0.2, 0.22, 0.03, 22), metal, 0, 0.015, 0);
      put(g, tor(0.15, 0.012), metal, 0, 0.3, 0).rotation.x = Math.PI / 2;
      break;
    }
    case 'coffee_table': {
      put(g, rbox(1.25, 0.06, 0.7, 0.025), wood, 0, 0.42, 0);
      put(g, rbox(1.1, 0.03, 0.56, 0.01), woodD, 0, 0.14, 0);
      legs(1.2, 0.64, 0.4, 0.028, woodD, 0.07);
      // a book and a mug
      put(g, bx(0.26, 0.04, 0.18), k.std('#B5485D'), -0.32, 0.47, 0.08).rotation.y = 0.3;
      put(g, bx(0.22, 0.03, 0.16), k.std('#3E5C76'), -0.3, 0.505, 0.06).rotation.y = 0.15;
      put(g, cy(0.045, 0.04, 0.09, 14), white, 0.35, 0.495, -0.08);
      break;
    }
    case 'side_table': {
      put(g, cy(0.27, 0.27, 0.05, 24), wood, 0, 0.56, 0);
      put(g, cy(0.04, 0.05, 0.54, 10), woodD, 0, 0.28, 0);
      put(g, cy(0.18, 0.2, 0.03, 20), woodD, 0, 0.015, 0);
      break;
    }
    case 'dining_table': {
      put(g, rbox(1.8, 0.07, 1.0, 0.03), wood, 0, 0.74, 0);
      put(g, rbox(1.62, 0.1, 0.82, 0.02), woodD, 0, 0.66, 0);
      legs(1.66, 0.86, 0.7, 0.04, woodD, 0.06, 0.7);
      put(g, cy(0.22, 0.22, 0.012, 24), white, 0, 0.784, 0);
      put(g, cy(0.05, 0.07, 0.16, 12), k.std('#7FB3D5', { roughness: 0.2 }), 0, 0.86, 0);
      for (const [x, cc] of [[-0.02, '#FF6B6B'], [0.03, '#FFE14D'], [0, '#FF9FB2']] as const) put(g, sp(0.05, 10), k.std(cc), x, 0.98, x * 2);
      break;
    }
    case 'desk': {
      put(g, rbox(1.4, 0.05, 0.7, 0.02), wood, 0, 0.74, 0);
      put(g, rbox(0.45, 0.66, 0.62, 0.02), woodD, 0.44, 0.38, 0);
      for (const y of [0.22, 0.44, 0.62]) put(g, bx(0.03, 0.04, 0.02), brass, 0.44, y, 0.32);
      put(g, bx(0.04, 0.72, 0.6), woodD, -0.66, 0.36, 0);
      // a laptop, a lamp, a pencil pot
      put(g, rbox(0.38, 0.015, 0.26, 0.006), k.std('#9AA5B1', { metalness: 0.6, roughness: 0.3 }), -0.15, 0.775, 0.06);
      const lid = put(g, rbox(0.38, 0.24, 0.012, 0.006), k.std('#9AA5B1', { metalness: 0.6, roughness: 0.3 }), -0.15, 0.89, -0.07); lid.rotation.x = -0.15;
      put(g, bx(0.34, 0.2, 0.002), k.glow('#6FB6FF', 0.9), -0.15, 0.89, -0.062).rotation.x = -0.15;
      put(g, cy(0.04, 0.04, 0.12, 12), k.std('#3DDC97'), 0.52, 0.82, -0.2);
      for (const [x, cc] of [[0.5, '#FF6B6B'], [0.53, '#FFE14D'], [0.55, '#4C6EF5']] as const) put(g, cy(0.006, 0.006, 0.16, 6), k.std(cc), x, 0.88, -0.2 + (x - 0.52)).rotation.z = (x - 0.52) * 4;
      break;
    }
    case 'bed': {
      put(g, rbox(1.7, 0.3, 2.1, 0.05), woodD, 0, 0.2, 0);
      put(g, rbox(1.6, 0.22, 2.0, 0.08), white, 0, 0.44, 0.02);
      const duvet = put(g, rbox(1.66, 0.14, 1.4, 0.07), fab, 0, 0.53, 0.32); duvet.scale.y = 1;
      put(g, rbox(1.66, 0.05, 0.3, 0.02), k.std(shade(col, 0.2), { roughness: 0.95 }), 0, 0.6, -0.33);
      for (const s of [-1, 1]) { const p = put(g, rbox(0.62, 0.16, 0.36, 0.08), white, s * 0.4, 0.62, -0.72); p.rotation.x = -0.25; }
      put(g, rbox(1.76, 1.0, 0.1, 0.04), wood, 0, 0.55, -1.03);
      put(g, rbox(1.76, 0.5, 0.08, 0.03), wood, 0, 0.3, 1.04);
      break;
    }
    case 'pet_bed': {
      put(g, tor(0.3, 0.1), fab, 0, 0.1, 0).rotation.x = Math.PI / 2;
      put(g, cy(0.32, 0.32, 0.06, 24), k.std(shade(col, 0.2), { roughness: 1 }), 0, 0.05, 0);
      put(g, sp(0.07, 10), k.std('#FF6B6B'), 0.22, 0.1, 0.22);
      break;
    }
    case 'dresser': {
      put(g, rbox(1.2, 0.84, 0.5, 0.03), wood, 0, 0.44, 0);
      for (let r = 0; r < 3; r++) for (const s of [-1, 1]) {
        put(g, rbox(0.54, 0.22, 0.02, 0.01), woodD, s * 0.29, 0.2 + r * 0.25, 0.25);
        put(g, sp(0.022, 8), brass, s * 0.29, 0.2 + r * 0.25, 0.27);
      }
      legs(1.1, 0.42, 0.06, 0.03, woodD);
      break;
    }
    case 'bookshelf': {
      put(g, bx(1.2, 0.05, 0.4), wood, 0, 1.9, 0);
      for (const s of [-1, 1]) put(g, bx(0.05, 1.92, 0.4), wood, s * 0.575, 0.96, 0);
      put(g, bx(1.2, 1.92, 0.02), woodD, 0, 0.96, -0.19);
      const bookCols = ['#B5485D', '#3E5C76', '#E9C46A', '#2A9D8F', '#8B5CFF', '#E76F51', '#264653', '#F4A261', '#6D597A', '#FFFFFF'];
      let seed = 3;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let sh = 0; sh < 5; sh++) {
        const y = 0.04 + sh * 0.37;
        put(g, bx(1.12, 0.03, 0.36), woodD, 0, y, 0);
        let x = -0.53;
        while (x < 0.5) {
          const w = 0.035 + rnd() * 0.04, h = 0.22 + rnd() * 0.1;
          if (rnd() < 0.1 && sh % 2) { put(g, sp(0.07, 10), k.std('#7FB3D5', { roughness: 0.2 }), x + 0.08, y + 0.09, 0); x += 0.18; continue; }
          const b = put(g, bx(w, h, 0.26), k.std(bookCols[Math.floor(rnd() * bookCols.length)], { roughness: 0.8 }), x + w / 2, y + 0.015 + h / 2, 0.02, false);
          if (rnd() < 0.08) b.rotation.z = 0.25;
          x += w + 0.004;
        }
      }
      break;
    }
    case 'toy_chest': {
      put(g, rbox(0.9, 0.45, 0.55, 0.04), paint, 0, 0.23, 0);
      const lid = put(g, rbox(0.94, 0.08, 0.59, 0.04), k.std(shade(col, -0.1)), 0, 0.49, 0);
      void lid;
      for (const s of [-1, 1]) put(g, bx(0.06, 0.06, 0.04), brass, s * 0.3, 0.42, 0.29);
      put(g, sp(0.08, 12), k.std('#FFE14D'), 0.25, 0.6, 0.05);
      put(g, bx(0.12, 0.12, 0.12), k.std('#4C6EF5'), -0.2, 0.6, -0.05).rotation.y = 0.5;
      break;
    }
    case 'trophy_case': {
      put(g, rbox(1.2, 1.6, 0.45, 0.03), wood, 0, 0.8, 0);
      put(g, bx(1.06, 1.42, 0.02), k.std('#2B1D14'), 0, 0.82, -0.18);
      put(g, bx(1.08, 1.44, 0.01), glass, 0, 0.82, 0.22);
      for (const y of [0.32, 0.8, 1.26]) put(g, bx(1.06, 0.025, 0.36), glass, 0, y, 0);
      const lightBar = put(g, bx(1.0, 0.02, 0.04), k.glow('#FFF2C6', 2), 0, 1.5, 0.12); void lightBar;
      // a trophy for each achievement (as many as fit), little cups on the bottom shelves
      const icons = ctx.achievements.slice(0, 9);
      const cups = [k.std('#E9C46A', { metalness: 0.9, roughness: 0.25 }), k.std('#C0C0C8', { metalness: 0.9, roughness: 0.25 }), k.std('#CD7F32', { metalness: 0.9, roughness: 0.3 })];
      for (let i = 0; i < Math.max(3, Math.min(6, icons.length)); i++) {
        const x = -0.36 + (i % 3) * 0.36, y = i < 3 ? 0.06 : 0.34;
        const m = cups[i % 3];
        put(g, cy(0.05, 0.06, 0.04, 12), dark, x, y + 0.04, 0);
        put(g, cy(0.012, 0.012, 0.08, 6), m, x, y + 0.1, 0);
        put(g, cy(0.075, 0.035, 0.12, 14), m, x, y + 0.2, 0);
        for (const s of [-1, 1]) put(g, tor(0.03, 0.008), m, x + s * 0.075, y + 0.21, 0).rotation.y = Math.PI / 2;
      }
      if (icons.length) {
        const tex = k.canvasTex(256, 64, (gg) => {
          gg.fillStyle = '#2B1D14'; gg.fillRect(0, 0, 256, 64);
          gg.font = '40px system-ui, "Apple Color Emoji"'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
          icons.slice(0, 5).forEach((e, i) => gg.fillText(e, 28 + i * 50, 34));
        });
        put(g, bx(1.0, 0.25, 0.01), k.std('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.6 }), 0, 0.98, -0.16, false);
      }
      break;
    }
    case 'floor_lamp': {
      put(g, cy(0.18, 0.2, 0.04, 22), dark, 0, 0.02, 0);
      put(g, cy(0.018, 0.018, 1.4, 8), brass, 0, 0.72, 0);
      put(g, cy(0.17, 0.25, 0.32, 22, true), k.std(col === '#FFFFFF' ? '#F6EBD9' : col, { side: THREE.DoubleSide, emissive: '#FFE3B0', emissiveIntensity: 0.6, roughness: 0.9 }), 0, 1.5, 0);
      put(g, sp(0.06, 10), k.glow('#FFF4D6', 3), 0, 1.45, 0, false);
      break;
    }
    case 'table_lamp': {
      put(g, sp(0.1, 16), paint, 0, 0.1, 0).scale.set(1, 1.1, 1);
      put(g, cy(0.012, 0.012, 0.12, 6), brass, 0, 0.25, 0);
      put(g, cy(0.09, 0.14, 0.16, 18, true), k.std('#F6EBD9', { side: THREE.DoubleSide, emissive: '#FFE3B0', emissiveIntensity: 0.7, roughness: 0.9 }), 0, 0.37, 0);
      put(g, sp(0.035, 8), k.glow('#FFF4D6', 3), 0, 0.34, 0, false);
      break;
    }
    case 'lava_lamp': {
      put(g, cy(0.05, 0.09, 0.12, 16), metal, 0, 0.06, 0);
      put(g, cy(0.07, 0.05, 0.3, 16), k.std(col, { transparent: true, opacity: 0.55, emissive: col, emissiveIntensity: 0.5, roughness: 0.1 }), 0, 0.27, 0);
      put(g, cy(0.03, 0.05, 0.06, 16), metal, 0, 0.45, 0);
      const blobs = [0, 1, 2].map((i) => put(g, sp(0.032 - i * 0.006, 10), k.glow(shade(col, 0.2), 1.6), 0, 0.2, 0, false));
      tick = (t) => blobs.forEach((b, i) => { b.position.y = 0.17 + ((Math.sin(t * (0.4 + i * 0.17) + i * 2) + 1) / 2) * 0.2; b.scale.y = 1 + Math.sin(t * 1.3 + i) * 0.25; });
      break;
    }
    case 'chandelier': {
      // hung from the ceiling: the group's origin is the ceiling
      put(g, cy(0.12, 0.12, 0.05, 16), brass, 0, -0.03, 0);
      put(g, cy(0.01, 0.01, 0.5, 6), brass, 0, -0.3, 0);
      put(g, sp(0.08, 12), brass, 0, -0.58, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, x = Math.cos(a) * 0.36, z = Math.sin(a) * 0.36;
        const arm = put(g, cy(0.012, 0.012, 0.38, 6), brass, x / 2, -0.62, z / 2); arm.rotation.set(0, -a, Math.PI / 2); arm.lookAt(new THREE.Vector3(x, -0.62, z)); arm.rotateX(Math.PI / 2);
        put(g, cy(0.03, 0.04, 0.06, 10), brass, x, -0.6, z);
        put(g, cy(0.015, 0.015, 0.1, 8), white, x, -0.52, z);
        put(g, sp(0.035, 8), k.glow('#FFE9A8', 3), x, -0.44, z, false);
        for (let j = 0; j < 3; j++) put(g, G('oct', () => new THREE.OctahedronGeometry(0.025)), k.std('#E8F4FF', { metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.8 }), x * 0.8, -0.72 - j * 0.06, z * 0.8, false);
      }
      break;
    }
    case 'string_lights': {
      const bulbs: THREE.Mesh[] = [];
      const cols = ['#FFE9A8', '#FF9FB2', '#9FD8FF', '#B6FF9F'];
      for (let i = 0; i <= 18; i++) {
        const x = -1.2 + (i / 18) * 2.4, y = -Math.sin((i / 18) * Math.PI) * 0.25 + Math.sin(i * 1.7) * 0.02;
        put(g, cy(0.004, 0.004, 0.14, 4), dark, x, y + 0.03, 0.02, false).rotation.z = 1.2;
        bulbs.push(put(g, sp(0.03, 8), k.glow(cols[i % 4], 2.2), x, y - 0.02, 0.04, false));
      }
      tick = (t) => bulbs.forEach((b, i) => { b.scale.setScalar(0.85 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + i * 0.9))); });
      break;
    }
    case 'monstera': case 'hanging_plant': case 'cactus': case 'bonsai': case 'flower_vase': {
      if (id === 'monstera') {
        put(g, cy(0.24, 0.18, 0.42, 20), pot, 0, 0.21, 0); put(g, cy(0.22, 0.22, 0.02, 20), soil, 0, 0.42, 0);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2, r = 0.15 + (i % 3) * 0.06, h = 0.75 + (i % 4) * 0.18;
          const st = put(g, cy(0.01, 0.012, h - 0.4, 5), leafM, Math.cos(a) * r * 0.5, 0.42 + (h - 0.4) / 2, Math.sin(a) * r * 0.5); st.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
          leaf(g, i % 2 ? leafM : leafL, Math.cos(a) * r * 1.4, h, Math.sin(a) * r * 1.4, 0.26, -a + Math.PI / 2, 0.5);
        }
      } else if (id === 'hanging_plant') {
        for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const ch = put(g, cy(0.004, 0.004, 0.72, 4), metal, Math.cos(a) * 0.08, -0.36, Math.sin(a) * 0.08); ch.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15); }
        put(g, sp(0.18, 18), pot, 0, -0.82, 0).scale.set(1, 0.7, 1);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2, len = 0.3 + (i % 4) * 0.12;
          for (let j = 0; j < 4; j++) leaf(g, j % 2 ? leafM : leafL, Math.cos(a) * (0.17 + j * 0.02), -0.78 - (j / 4) * len, Math.sin(a) * (0.17 + j * 0.02), 0.06, a, 0.8);
        }
      } else if (id === 'cactus') {
        put(g, cy(0.1, 0.08, 0.14, 16), pot, 0, 0.07, 0);
        const cm = k.std('#4F9A4F', { roughness: 0.85 });
        put(g, cy(0.055, 0.06, 0.32, 12), cm, 0, 0.3, 0); put(g, sp(0.055, 12), cm, 0, 0.46, 0);
        put(g, cy(0.03, 0.03, 0.12, 10), cm, 0.08, 0.3, 0).rotation.z = -1.2; put(g, cy(0.028, 0.03, 0.12, 10), cm, 0.12, 0.38, 0); put(g, sp(0.028, 8), cm, 0.12, 0.44, 0);
        put(g, sp(0.025, 8), k.std('#FF7AB6'), 0, 0.51, 0);
      } else if (id === 'bonsai') {
        put(g, rbox(0.36, 0.08, 0.24, 0.02), pot, 0, 0.04, 0);
        const tr = k.std('#5C3A21', { roughness: 0.9 });
        const t1 = put(g, cy(0.025, 0.035, 0.22, 8), tr, 0.02, 0.18, 0); t1.rotation.z = 0.4;
        const t2 = put(g, cy(0.02, 0.025, 0.16, 8), tr, -0.04, 0.3, 0); t2.rotation.z = -0.6;
        for (const [x, y, s] of [[-0.1, 0.38, 0.1], [0.06, 0.34, 0.09], [-0.02, 0.43, 0.08], [0.11, 0.27, 0.07]] as const) put(g, sp(s, 10), leafM, x, y, 0).scale.set(1.2, 0.7, 1);
      } else {
        put(g, cy(0.07, 0.1, 0.26, 16), k.std(col, { roughness: 0.2, metalness: 0.1 }), 0, 0.13, 0);
        const fc = ['#FF6B6B', '#FFE14D', '#FF9FB2', '#B98CFF', '#FFFFFF'];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2, r = 0.05 + (i % 2) * 0.04;
          const st = put(g, cy(0.004, 0.004, 0.24, 4), leafM, Math.cos(a) * r * 0.5, 0.36, Math.sin(a) * r * 0.5); st.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
          put(g, sp(0.035, 8), k.std(fc[i % fc.length], { roughness: 0.8 }), Math.cos(a) * r, 0.47 + (i % 3) * 0.02, Math.sin(a) * r);
        }
      }
      if (id === 'monstera' || id === 'hanging_plant') { const sway = g.children.slice(); tick = (t) => { g.rotation.z = Math.sin(t * 0.8) * 0.012; void sway; }; }
      break;
    }
    case 'rug_rect': case 'rug_round': case 'rug_rainbow': {
      const round = id === 'rug_round';
      const tex = k.canvasTex(512, round ? 512 : 360, (gg) => {
        const W = 512, H = round ? 512 : 360;
        if (id === 'rug_rainbow') {
          const cols = ['#FF6B6B', '#FFB13D', '#FFE14D', '#3DDC97', '#22B8CF', '#8B5CFF'];
          cols.forEach((cc, i) => { gg.fillStyle = cc; gg.fillRect(0, (i * H) / 6, W, H / 6 + 1); });
          gg.fillStyle = 'rgba(255,255,255,0.15)'; for (let x = 0; x < W; x += 6) gg.fillRect(x, 0, 2, H);
          return;
        }
        gg.fillStyle = col; gg.fillRect(0, 0, W, H);
        gg.strokeStyle = shade(col, 0.25); gg.lineWidth = 14;
        if (round) { for (const r of [230, 170, 110]) { gg.beginPath(); gg.arc(256, 256, r, 0, Math.PI * 2); gg.stroke(); } gg.fillStyle = shade(col, -0.1); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; gg.beginPath(); gg.arc(256 + Math.cos(a) * 140, 256 + Math.sin(a) * 140, 12, 0, Math.PI * 2); gg.fill(); } }
        else {
          gg.strokeRect(24, 24, W - 48, H - 48); gg.lineWidth = 5; gg.strokeRect(46, 46, W - 92, H - 92);
          gg.fillStyle = shade(col, -0.12);
          for (let y = 80; y < H - 70; y += 50) for (let x = 90; x < W - 80; x += 60) { gg.save(); gg.translate(x, y); gg.rotate(Math.PI / 4); gg.fillRect(-12, -12, 24, 24); gg.restore(); }
        }
        for (let i = 0; i < 4000; i++) { gg.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; gg.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
      });
      const m = k.std('#ffffff', { map: tex, roughness: 1 });
      const geo = round ? G('rugR', () => new THREE.CircleGeometry(1.0, 48)) : G(`rug${id}`, () => new THREE.PlaneGeometry(id === 'rug_rect' ? 2.6 : 2.4, id === 'rug_rect' ? 1.8 : 1.4));
      const r = put(g, geo, m, 0, 0.012, 0, false); r.rotation.x = -Math.PI / 2;
      if (!round) for (const s of [-1, 1]) for (let i = 0; i < 14; i++) put(g, bx(0.012, 0.004, 0.08), k.std('#F4F1EA'), -1.0 + (i / 13) * 2.0, 0.012, s * ((id === 'rug_rect' ? 0.9 : 0.7) + 0.04), false);
      break;
    }
    case 'kitchen': {
      put(g, rbox(2.0, 0.86, 0.62, 0.02), paint, 0, 0.43, 0);
      put(g, rbox(2.04, 0.05, 0.66, 0.015), k.std('#E8E6E0', { roughness: 0.25 }), 0, 0.885, 0);
      for (let i = 0; i < 4; i++) { put(g, bx(0.46, 0.7, 0.01), k.std(shade(col, -0.06)), -0.74 + i * 0.49, 0.42, 0.315); put(g, bx(0.12, 0.02, 0.02), metal, -0.74 + i * 0.49, 0.7, 0.33); }
      // hob, sink, kettle
      put(g, bx(0.56, 0.01, 0.46), dark, -0.55, 0.915, 0);
      for (const [x, z] of [[-0.68, -0.1], [-0.42, -0.1], [-0.68, 0.12], [-0.42, 0.12]] as const) put(g, tor(0.07, 0.01), k.std('#555'), x, 0.925, z).rotation.x = Math.PI / 2;
      put(g, bx(0.5, 0.02, 0.38), metal, 0.45, 0.905, 0);
      put(g, bx(0.44, 0.04, 0.32), k.std('#8A8F99', { metalness: 0.7, roughness: 0.3 }), 0.45, 0.9, 0);
      const tap = put(g, tor(0.07, 0.012), metal, 0.45, 1.0, -0.2); tap.rotation.y = Math.PI / 2;
      put(g, sp(0.09, 14), k.std('#FF6B6B', { roughness: 0.3 }), -0.68, 1.0, -0.1).scale.set(1, 0.85, 1);
      put(g, cy(0.012, 0.02, 0.08, 6), k.std('#FF6B6B'), -0.6, 1.03, -0.1).rotation.z = -1;
      const steam = [0, 1, 2].map((i) => put(g, sp(0.03, 8), k.std('#ffffff', { transparent: true, opacity: 0.4, depthWrite: false }), -0.56, 1.1, -0.1, false));
      tick = (t) => steam.forEach((s, i) => { const p = (t * 0.4 + i / 3) % 1; s.position.set(-0.55 + Math.sin(p * 6 + i) * 0.02, 1.08 + p * 0.3, -0.1); s.scale.setScalar(0.6 + p * 1.6); (s.material as THREE.MeshStandardMaterial).opacity = 0.45 * (1 - p); });
      break;
    }
    case 'fridge': {
      put(g, rbox(0.74, 1.8, 0.68, 0.06), paint, 0, 0.9, 0);
      put(g, bx(0.7, 0.01, 0.01), k.std(shade(col, -0.15)), 0, 1.22, 0.345);
      for (const [y, h] of [[1.5, 0.4], [0.75, 0.6]] as const) put(g, rbox(0.04, h, 0.04, 0.015), metal, 0.28, y, 0.36);
      for (const [x, y, cc] of [[-0.18, 1.5, '#FF6B6B'], [-0.05, 1.42, '#FFE14D'], [-0.14, 1.32, '#4C6EF5']] as const) put(g, cy(0.03, 0.03, 0.015, 10), k.std(cc), x, y, 0.345).rotation.x = Math.PI / 2;
      put(g, bx(0.14, 0.18, 0.004), white, -0.02, 1.0, 0.346);
      break;
    }
    case 'fireplace': {
      const stone = k.std(c == null ? '#C9C2B8' : col, { roughness: 0.9 });
      put(g, rbox(1.6, 1.06, 0.52, 0.03), stone, 0, 0.53, 0);
      put(g, rbox(1.76, 0.07, 0.6, 0.02), k.std('#5C3A21', { roughness: 0.6 }), 0, 1.09, 0.02);
      put(g, bx(0.9, 0.62, 0.3), k.std('#1A1310', { roughness: 1 }), 0, 0.38, 0.12);
      put(g, bx(1.0, 0.04, 0.2), stone, 0, 0.05, 0.36);
      const logM = k.std('#6B4226', { roughness: 1 });
      for (const [x, ry] of [[-0.12, 0.3], [0.12, -0.3]] as const) { const l = put(g, cy(0.05, 0.05, 0.5, 10), logM, x, 0.14, 0.15); l.rotation.set(0, ry, Math.PI / 2); }
      const flames = [0, 1, 2, 3, 4].map((i) => {
        const f = put(g, G('flame', () => new THREE.ConeGeometry(0.08, 0.3, 10)), k.std(i % 2 ? '#FFB13D' : '#FF6B2D', { emissive: i % 2 ? '#FFB13D' : '#FF4D1D', emissiveIntensity: 2.5, transparent: true, opacity: 0.9, depthWrite: false }), -0.2 + i * 0.1, 0.32, 0.17, false);
        return f;
      });
      tick = (t) => flames.forEach((f, i) => { const s = 0.8 + 0.35 * Math.abs(Math.sin(t * (6 + i) + i * 1.3)); f.scale.set(1 - (s - 1) * 0.4, s, 1); f.position.y = 0.28 + s * 0.08; f.rotation.z = Math.sin(t * 5 + i) * 0.12; });
      // things on the mantel
      put(g, cy(0.035, 0.035, 0.18, 10), white, -0.6, 1.22, 0.02); put(g, sp(0.02, 6), k.glow('#FFC46B', 3), -0.6, 1.33, 0.02, false);
      put(g, cy(0.035, 0.035, 0.24, 10), white, -0.5, 1.25, 0.02); put(g, sp(0.02, 6), k.glow('#FFC46B', 3), -0.5, 1.39, 0.02, false);
      break;
    }
    case 'piano': {
      put(g, rbox(1.5, 1.12, 0.42, 0.03), paint, 0, 0.62, -0.1);
      put(g, rbox(1.5, 0.06, 0.32, 0.02), paint, 0, 0.72, 0.2);
      put(g, bx(1.36, 0.03, 0.18), white, 0, 0.765, 0.22);
      for (let i = 0; i < 36; i++) { if ([1, 4, 8, 11, 15, 18, 22, 25, 29, 32].includes(i % 36)) put(g, bx(0.022, 0.03, 0.1), dark, -0.66 + i * 0.038, 0.79, 0.18); }
      for (const s of [-1, 1]) put(g, bx(0.06, 0.66, 0.06), paint, s * 0.66, 0.33, 0.28);
      put(g, bx(0.4, 0.26, 0.02), white, 0, 1.0, 0.115).rotation.x = -0.2;
      put(g, rbox(0.8, 0.08, 0.36, 0.03), paint, 0, 0.48, 0.75); legs(0.74, 0.3, 0.44, 0.02, paint);
      g.children.slice(-4).forEach((l) => { l.position.z += 0.75; });
      const notes = [0, 1, 2].map(() => { const tx = k.canvasTex(64, 64, (gg) => { gg.font = '48px system-ui'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillStyle = '#8B5CFF'; gg.fillText('♪', 32, 34); }); const s = new THREE.Sprite(k.T(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }))); s.scale.setScalar(0.18); g.add(s); return s; });
      tick = (t) => notes.forEach((n, i) => { const p = (t * 0.3 + i / 3) % 1; n.position.set(-0.3 + i * 0.3 + Math.sin(p * 8) * 0.06, 1.25 + p * 0.6, 0); n.material.opacity = 1 - p; });
      break;
    }
    case 'record_player': {
      put(g, rbox(0.44, 0.1, 0.38, 0.02), wood, 0, 0.05, 0);
      const disc = put(g, cy(0.15, 0.15, 0.01, 28), k.std('#111', { roughness: 0.3 }), -0.04, 0.105, 0);
      put(disc, cy(0.05, 0.05, 0.012, 16), k.std('#FF6B6B'), 0, 0.002, 0, false);
      const arm = put(g, bx(0.012, 0.012, 0.22), metal, 0.15, 0.13, 0.0); arm.rotation.y = 0.35;
      tick = (t) => { disc.rotation.y = -t * 3.5; };
      break;
    }
    case 'tv_console': {
      put(g, rbox(1.7, 0.45, 0.46, 0.02), wood, 0, 0.27, 0);
      for (const s of [-1, 1]) put(g, bx(0.78, 0.36, 0.01), woodD, s * 0.41, 0.27, 0.235);
      legs(1.6, 0.36, 0.05, 0.025, woodD);
      put(g, bx(0.1, 0.02, 0.22), dark, 0, 0.51, -0.02);
      put(g, bx(0.04, 0.22, 0.04), dark, 0, 0.62, -0.06);
      put(g, rbox(1.36, 0.8, 0.05, 0.015), dark, 0, 1.12, -0.06);
      const scr = k.canvasTex(256, 144, () => {});
      const scrM = k.std('#000000', { emissive: '#ffffff', emissiveMap: scr, emissiveIntensity: 1, roughness: 0.2 });
      put(g, bx(1.3, 0.74, 0.005), scrM, 0, 1.12, -0.032, false);
      const cv = scr.image as HTMLCanvasElement, sg = cv.getContext('2d')!;
      let img: HTMLImageElement | null = null;
      screen = (url) => { if (!url) { img = null; return; } const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { img = im; }; im.src = url; };
      tick = (t) => {
        const f = Math.floor(t * 8); if (f === (scr.userData.f ?? -1)) return; scr.userData.f = f;
        if (img) { sg.drawImage(img, 0, 0, 256, 144); sg.fillStyle = `rgba(0,0,0,${0.15 + 0.05 * Math.sin(t)})`; sg.fillRect(0, 0, 256, 144); }
        else {
          const gr = sg.createLinearGradient(0, 0, 256, 144); gr.addColorStop(0, `hsl(${(t * 20) % 360},70%,45%)`); gr.addColorStop(1, `hsl(${(t * 20 + 120) % 360},70%,30%)`); sg.fillStyle = gr; sg.fillRect(0, 0, 256, 144);
          sg.fillStyle = 'rgba(255,255,255,0.9)'; sg.font = '900 28px ui-rounded, system-ui'; sg.textAlign = 'center'; sg.fillText('LANDVAS TV', 128, 70 + Math.sin(t * 2) * 6);
        }
        for (let y = 0; y < 144; y += 3) { sg.fillStyle = 'rgba(0,0,0,0.12)'; sg.fillRect(0, y, 256, 1); }
        scr.needsUpdate = true;
      };
      break;
    }
    case 'aquarium': {
      put(g, rbox(1.4, 0.7, 0.5, 0.02), wood, 0, 0.35, 0);
      put(g, bx(1.36, 0.62, 0.46), k.std('#3FA9D6', { transparent: true, opacity: 0.35, roughness: 0.05, emissive: '#1E7FB0', emissiveIntensity: 0.35, depthWrite: false }), 0, 1.02, 0, false);
      put(g, bx(1.38, 0.64, 0.48), glass, 0, 1.02, 0, false);
      put(g, bx(1.36, 0.08, 0.46), k.std('#E8D5A6', { roughness: 1 }), 0, 0.75, 0);
      put(g, rbox(1.42, 0.06, 0.52, 0.02), dark, 0, 1.36, 0);
      for (const [x, h] of [[-0.5, 0.35], [-0.44, 0.25], [0.45, 0.4], [0.52, 0.28]] as const) { const w = put(g, cy(0.012, 0.02, h, 5), k.std('#2E8B57'), x, 0.79 + h / 2, -0.1); w.rotation.z = 0.15; }
      put(g, sp(0.08, 10), k.std('#B0A79A', { roughness: 1 }), 0.1, 0.8, 0.05).scale.set(1.4, 0.7, 1);
      const fcols = ['#FF7A3D', '#FFE14D', '#22B8CF', '#FF5FA2', '#B6FF3D'];
      const fish = fcols.map((cc, i) => {
        const f = new THREE.Group(); g.add(f);
        put(f, sp(0.045, 10), k.std(cc, { roughness: 0.4 }), 0, 0, 0).scale.set(1.5, 1, 0.6);
        const tail = put(f, G('fin', () => new THREE.ConeGeometry(0.03, 0.06, 6)), k.std(cc), -0.075, 0, 0); tail.rotation.z = Math.PI / 2;
        f.userData = { i, sp: 0.4 + i * 0.13, y: 0.9 + (i % 3) * 0.13 };
        return f;
      });
      const bubbles = [0, 1, 2, 3].map(() => put(g, sp(0.012, 6), k.std('#ffffff', { transparent: true, opacity: 0.6 }), 0.5, 0.8, 0.1, false));
      tick = (t) => {
        fish.forEach((f) => { const { i, sp: s, y } = f.userData; const a = t * s + i * 1.7; f.position.set(Math.sin(a) * 0.55, y + Math.sin(a * 2.3) * 0.04, Math.cos(a * 1.3) * 0.12); f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI; });
        bubbles.forEach((b, i) => { const p = (t * 0.35 + i / 4) % 1; b.position.set(0.48 + Math.sin(p * 9 + i) * 0.02, 0.8 + p * 0.5, 0.1); });
      };
      break;
    }
    case 'easel': {
      const legM = wood;
      for (const s of [-1, 1]) { const l = put(g, bx(0.04, 1.6, 0.04), legM, s * 0.28, 0.78, 0.05); l.rotation.z = s * -0.12; }
      const back = put(g, bx(0.04, 1.5, 0.04), legM, 0, 0.72, -0.28); back.rotation.x = -0.3;
      put(g, bx(0.7, 0.04, 0.08), legM, 0, 0.62, 0.08);
      const art = new THREE.MeshStandardMaterial({ color: '#F6F4EE', roughness: 0.9 }); k.T(art);
      const canvas = put(g, bx(0.66, 0.56, 0.03), art, 0, 0.94, 0.06); canvas.rotation.x = -0.12;
      const url = ctx.art[0];
      if (url) new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; k.T(tx); art.map = tx; art.needsUpdate = true; });
      // a palette and brush
      put(g, cy(0.1, 0.1, 0.012, 16), wood, 0.28, 0.66, 0.12).scale.set(1.3, 1, 1);
      for (const [x, cc] of [[0.22, '#FF6B6B'], [0.28, '#FFE14D'], [0.34, '#4C6EF5']] as const) put(g, sp(0.018, 6), k.std(cc), x, 0.675, 0.14);
      break;
    }
    case 'telescope': {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = put(g, cy(0.015, 0.02, 1.0, 6), k.std('#5C3A21'), Math.cos(a) * 0.14, 0.47, Math.sin(a) * 0.14); l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
      const tube = new THREE.Group(); tube.position.set(0, 0.98, 0); g.add(tube);
      put(tube, cy(0.07, 0.09, 0.9, 18), paint, 0, 0, 0).rotation.x = Math.PI / 2;
      put(tube, cy(0.1, 0.1, 0.06, 18), brass, 0, 0, -0.45).rotation.x = Math.PI / 2;
      put(tube, cy(0.03, 0.03, 0.12, 10), dark, 0, 0, 0.5).rotation.x = Math.PI / 2;
      tube.rotation.x = 0.55;
      tick = (t) => { tube.rotation.y = Math.sin(t * 0.2) * 0.4; };
      break;
    }
    case 'globe': {
      put(g, cy(0.1, 0.12, 0.04, 16), wood, 0, 0.02, 0);
      put(g, cy(0.012, 0.012, 0.12, 6), brass, 0, 0.1, 0);
      const ring = put(g, tor(0.16, 0.008), brass, 0, 0.3, 0); ring.rotation.set(0, Math.PI / 2, 0.4);
      const tx = k.canvasTex(256, 128, (gg) => {
        gg.fillStyle = '#2E7FB8'; gg.fillRect(0, 0, 256, 128); gg.fillStyle = '#7CC36E';
        for (const [x, y, w, h] of [[30, 30, 50, 40], [60, 70, 30, 40], [120, 25, 40, 30], [130, 55, 30, 45], [170, 30, 60, 35], [200, 80, 30, 20]]) { gg.beginPath(); gg.ellipse(x, y, w / 2, h / 2, 0.3, 0, Math.PI * 2); gg.fill(); }
      });
      const ball = put(g, sp(0.14, 24), k.std('#ffffff', { map: tx, roughness: 0.5 }), 0, 0.3, 0); ball.rotation.z = 0.4;
      tick = (t) => { ball.rotation.y = t * 0.4; };
      break;
    }
    case 'grandfather_clock': {
      put(g, rbox(0.6, 0.5, 0.42, 0.02), wood, 0, 0.25, 0);
      put(g, rbox(0.5, 1.0, 0.36, 0.02), wood, 0, 1.0, 0);
      put(g, rbox(0.62, 0.55, 0.44, 0.03), wood, 0, 1.75, 0);
      put(g, bx(0.66, 0.08, 0.46), woodD, 0, 2.06, 0);
      put(g, bx(0.32, 0.8, 0.01), glass, 0, 1.0, 0.185);
      const face = k.canvasTex(128, 128, (gg) => { gg.fillStyle = '#F6EBD9'; gg.beginPath(); gg.arc(64, 64, 60, 0, Math.PI * 2); gg.fill(); gg.fillStyle = '#3B2A20'; gg.font = '700 14px serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; gg.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i - 1], 64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); } });
      put(g, cy(0.2, 0.2, 0.02, 28), k.std('#ffffff', { map: face }), 0, 1.75, 0.22, false).rotation.x = Math.PI / 2;
      put(g, tor(0.2, 0.015), brass, 0, 1.75, 0.225, false);
      const hh = new THREE.Group(), mh = new THREE.Group(); hh.position.set(0, 1.75, 0.235); mh.position.set(0, 1.75, 0.24); g.add(hh, mh);
      put(hh, bx(0.016, 0.1, 0.005), dark, 0, 0.05, 0, false); put(mh, bx(0.01, 0.15, 0.005), dark, 0, 0.075, 0, false);
      const pend = new THREE.Group(); pend.position.set(0, 1.42, 0.08); g.add(pend);
      put(pend, cy(0.006, 0.006, 0.6, 4), brass, 0, -0.3, 0, false); put(pend, cy(0.07, 0.07, 0.015, 20), brass, 0, -0.62, 0, false).rotation.x = Math.PI / 2;
      tick = (t) => { const d = new Date(); hh.rotation.z = -((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2; mh.rotation.z = -(d.getMinutes() + d.getSeconds() / 60) / 60 * Math.PI * 2; pend.rotation.z = Math.sin(t * Math.PI) * 0.18; };
      break;
    }
    case 'fountain': {
      const stone = k.std(c == null ? '#D8D2C6' : col, { roughness: 0.85 });
      put(g, cy(0.6, 0.62, 0.3, 32), stone, 0, 0.15, 0);
      const water = k.std('#5FB8E8', { transparent: true, opacity: 0.75, roughness: 0.05, emissive: '#2A7FB0', emissiveIntensity: 0.25 });
      put(g, cy(0.52, 0.52, 0.02, 32), water, 0, 0.29, 0);
      put(g, cy(0.07, 0.1, 0.55, 14), stone, 0, 0.55, 0);
      put(g, cy(0.28, 0.2, 0.08, 24), stone, 0, 0.85, 0);
      put(g, cy(0.24, 0.24, 0.02, 24), water, 0, 0.89, 0);
      put(g, sp(0.05, 10), stone, 0, 0.95, 0);
      const drops = Array.from({ length: 10 }, (_, i) => put(g, sp(0.02, 6), water, 0, 1, 0, false));
      const rip = put(g, G('rip', () => new THREE.RingGeometry(0.2, 0.23, 32)), k.std('#ffffff', { transparent: true, opacity: 0.4, depthWrite: false }), 0, 0.305, 0, false); rip.rotation.x = -Math.PI / 2;
      tick = (t) => {
        drops.forEach((d, i) => { const a = (i / 10) * Math.PI * 2, p = (t * 0.8 + i * 0.1) % 1; d.position.set(Math.cos(a) * (0.05 + p * 0.3), 0.97 + Math.sin(p * Math.PI) * 0.15 - p * 0.62, Math.sin(a) * (0.05 + p * 0.3)); });
        const p = (t * 0.5) % 1; rip.scale.setScalar(0.5 + p * 1.8); (rip.material as THREE.MeshStandardMaterial).opacity = 0.4 * (1 - p);
      };
      break;
    }
    case 'wall_clock': {
      put(g, cy(0.3, 0.3, 0.05, 32), paint, 0, 0, 0.025).rotation.x = Math.PI / 2;
      const face = k.canvasTex(128, 128, (gg) => { gg.fillStyle = '#FBF8F2'; gg.beginPath(); gg.arc(64, 64, 62, 0, Math.PI * 2); gg.fill(); gg.fillStyle = '#333'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; gg.fillRect(64 + Math.cos(a) * 50 - 3, 64 + Math.sin(a) * 50 - 3, i % 3 ? 4 : 7, i % 3 ? 4 : 7); } });
      put(g, cy(0.26, 0.26, 0.01, 32), k.std('#ffffff', { map: face }), 0, 0, 0.055, false).rotation.x = Math.PI / 2;
      const hh = new THREE.Group(), mh = new THREE.Group(), sh = new THREE.Group(); for (const [h2, z] of [[hh, 0.065], [mh, 0.07], [sh, 0.075]] as const) { h2.position.z = z; g.add(h2); }
      put(hh, bx(0.025, 0.14, 0.006), dark, 0, 0.06, 0, false); put(mh, bx(0.016, 0.21, 0.006), dark, 0, 0.09, 0, false); put(sh, bx(0.006, 0.22, 0.004), k.std('#E63946'), 0, 0.08, 0, false);
      tick = () => { const d = new Date(); hh.rotation.z = -((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2; mh.rotation.z = -(d.getMinutes() + d.getSeconds() / 60) / 60 * Math.PI * 2; sh.rotation.z = -(d.getSeconds() + d.getMilliseconds() / 1000) / 60 * Math.PI * 2; };
      break;
    }
    case 'wall_shelf': {
      put(g, rbox(1.2, 0.05, 0.25, 0.015), wood, 0, 0, 0.125);
      for (const s of [-1, 1]) put(g, bx(0.03, 0.12, 0.2), dark, s * 0.45, -0.07, 0.1);
      const bc = ['#B5485D', '#3E5C76', '#E9C46A', '#2A9D8F'];
      bc.forEach((cc, i) => put(g, bx(0.04, 0.22 - (i % 2) * 0.04, 0.17), k.std(cc), -0.48 + i * 0.045, 0.12 - (i % 2) * 0.02, 0.12));
      put(g, sp(0.06, 12), k.std('#FFE14D', { roughness: 0.3 }), 0.05, 0.085, 0.12);
      put(g, cy(0.05, 0.04, 0.1, 12), k.std('#E07A5F'), 0.35, 0.075, 0.12); leaf(g, leafL, 0.33, 0.16, 0.12, 0.06, 0.4, 0.4); leaf(g, leafM, 0.38, 0.17, 0.12, 0.06, -0.6, 0.4);
      break;
    }
    case 'wall_mirror': {
      put(g, sp(1, 32), k.std(col, { roughness: 0.4, metalness: 0.3 }), 0, 0, 0.02).scale.set(0.42, 0.62, 0.03);
      put(g, sp(1, 32), k.std('#DCE8F2', { metalness: 1, roughness: 0.05 }), 0, 0, 0.035, false).scale.set(0.36, 0.56, 0.02);
      break;
    }
    case 'wall_tv': {
      put(g, rbox(1.5, 0.86, 0.05, 0.015), dark, 0, 0, 0.03);
      const scr = k.canvasTex(256, 144, () => {});
      put(g, bx(1.42, 0.78, 0.005), k.std('#000000', { emissive: '#ffffff', emissiveMap: scr, emissiveIntensity: 1 }), 0, 0, 0.058, false);
      const sg = (scr.image as HTMLCanvasElement).getContext('2d')!;
      tick = (t) => {
        const f = Math.floor(t * 6); if (f === (scr.userData.f ?? -1)) return; scr.userData.f = f;
        // a little nature channel: hills, a sun, clouds drifting
        const gr = sg.createLinearGradient(0, 0, 0, 144); gr.addColorStop(0, '#7EC8F2'); gr.addColorStop(1, '#D6F0FF'); sg.fillStyle = gr; sg.fillRect(0, 0, 256, 144);
        sg.fillStyle = '#FFE680'; sg.beginPath(); sg.arc(200, 34, 16, 0, Math.PI * 2); sg.fill();
        sg.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 3; i++) { const x = ((t * 8 + i * 100) % 330) - 40; sg.beginPath(); sg.ellipse(x, 30 + i * 12, 26, 9, 0, 0, Math.PI * 2); sg.fill(); }
        sg.fillStyle = '#5DB55F'; sg.beginPath(); sg.moveTo(0, 144); for (let x = 0; x <= 256; x += 8) sg.lineTo(x, 104 + Math.sin(x * 0.03 + 1) * 14); sg.lineTo(256, 144); sg.fill();
        sg.fillStyle = '#3E8E41'; sg.beginPath(); sg.moveTo(0, 144); for (let x = 0; x <= 256; x += 8) sg.lineTo(x, 122 + Math.sin(x * 0.05 + t * 0.1) * 8); sg.lineTo(256, 144); sg.fill();
        scr.needsUpdate = true;
      };
      break;
    }
    case 'poster': {
      const tx = k.canvasTex(256, 352, (gg) => {
        const gr = gg.createLinearGradient(0, 0, 0, 352); gr.addColorStop(0, col); gr.addColorStop(1, shade(col, -0.25)); gg.fillStyle = gr; gg.fillRect(0, 0, 256, 352);
        gg.fillStyle = 'rgba(255,255,255,0.85)'; gg.beginPath(); gg.arc(128, 150, 70, 0, Math.PI * 2); gg.fill();
        gg.fillStyle = shade(col, -0.3); gg.beginPath(); gg.moveTo(30, 260); gg.lineTo(110, 170); gg.lineTo(170, 230); gg.lineTo(200, 200); gg.lineTo(240, 260); gg.fill();
        gg.fillStyle = '#fff'; gg.font = '900 30px ui-rounded, system-ui'; gg.textAlign = 'center'; gg.fillText('LANDVAS', 128, 310);
      });
      put(g, bx(0.8, 1.1, 0.02), k.std('#ffffff', { map: tx, roughness: 0.8 }), 0, 0, 0.012, false);
      for (const [x, y] of [[-0.36, 0.5], [0.36, 0.5]] as const) put(g, sp(0.018, 6), k.std('#E63946'), x, y, 0.03, false);
      break;
    }
    case 'mini_arcade': {
      put(g, rbox(0.76, 1.6, 0.66, 0.03), paint, 0, 0.8, -0.03);
      put(g, bx(0.66, 0.5, 0.02), dark, 0, 1.25, 0.31);
      const scr = k.canvasTex(128, 96, () => {});
      const s = put(g, bx(0.6, 0.44, 0.005), k.std('#000000', { emissive: '#ffffff', emissiveMap: scr, emissiveIntensity: 1.2 }), 0, 1.25, 0.322, false); void s;
      put(g, rbox(0.76, 0.12, 0.3, 0.02), k.std(shade(col, -0.15)), 0, 0.92, 0.35).rotation.x = 0.35;
      put(g, cy(0.012, 0.012, 0.08, 6), dark, -0.15, 1.0, 0.37); put(g, sp(0.03, 10), k.std('#FF3D3D', { roughness: 0.3 }), -0.15, 1.05, 0.37);
      for (const [x, cc] of [[0.08, '#FFE14D'], [0.18, '#22E3FF']] as const) put(g, cy(0.028, 0.028, 0.02, 12), k.glow(cc, 1.2), x, 0.99, 0.37);
      put(g, bx(0.7, 0.16, 0.02), k.glow(col, 1.4), 0, 1.68, 0.29);
      const sg = (scr.image as HTMLCanvasElement).getContext('2d')!;
      tick = (t) => {
        const f = Math.floor(t * 10); if (f === (scr.userData.f ?? -1)) return; scr.userData.f = f;
        sg.fillStyle = '#05050F'; sg.fillRect(0, 0, 128, 96);
        for (let i = 0; i < 5; i++) { sg.fillStyle = ['#FF3D9A', '#22E3FF', '#FFE14D', '#B6FF3D', '#8B5CFF'][i]; sg.fillRect(((t * 40 + i * 30) % 150) - 20, 14 + i * 14, 14, 8); }
        sg.fillStyle = '#fff'; sg.beginPath(); sg.moveTo(64, 80); sg.lineTo(56, 92); sg.lineTo(72, 92); sg.fill();
        if (Math.floor(t * 2) % 2) { sg.font = '900 11px ui-rounded, system-ui'; sg.textAlign = 'center'; sg.fillText('PRESS START', 64, 8 + 4); }
        scr.needsUpdate = true;
      };
      break;
    }
    case 'neon_heart': {
      const shape = new THREE.Shape(); shape.moveTo(0, -0.3); shape.bezierCurveTo(-0.45, 0, -0.35, 0.35, 0, 0.18); shape.bezierCurveTo(0.35, 0.35, 0.45, 0, 0, -0.3);
      const pts = shape.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0.05));
      const tube = put(g, G('heartTube', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.022, 8, true)), k.glow(col, 2.6), 0, 0, 0, false);
      put(g, rbox(0.9, 0.75, 0.02, 0.02), k.std('#ffffff', { transparent: true, opacity: 0.12 }), 0, 0, 0.012, false);
      tick = (t) => { (tube.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 + (Math.sin(t * 3) > 0.92 ? -1.6 : 0.4 * Math.sin(t * 2)); };
      break;
    }
    case 'gumball': {
      put(g, cy(0.12, 0.16, 0.5, 18), paint, 0, 0.25, 0);
      put(g, rbox(0.24, 0.12, 0.24, 0.03), paint, 0, 0.56, 0);
      put(g, sp(0.2, 24), glass, 0, 0.8, 0, false);
      const gcols = ['#FF6B6B', '#FFE14D', '#3DDC97', '#22B8CF', '#FF5FA2', '#8B5CFF', '#FFFFFF'];
      for (let i = 0; i < 40; i++) { const a = i * 2.4, r = 0.14 * Math.sqrt((i % 10) / 10), y = 0.65 + Math.floor(i / 10) * 0.045; put(g, sp(0.028, 8), k.std(gcols[i % gcols.length], { roughness: 0.3 }), Math.cos(a) * r, y, Math.sin(a) * r, false); }
      put(g, cy(0.04, 0.04, 0.04, 10), metal, 0, 0.58, 0.13).rotation.x = Math.PI / 2;
      put(g, sp(0.035, 10), paint, 0, 1.0, 0);
      break;
    }
    case 'plushies': {
      const pc = ['#FF9FB2', '#9FD8FF', '#FFE14D', '#B6FF9F', '#C3A8FF', '#FFB13D'];
      const spots = [[-0.3, 0.12, 0.1], [0.05, 0.13, 0.15], [0.32, 0.12, 0.05], [-0.12, 0.13, -0.18], [0.2, 0.13, -0.2], [0.0, 0.33, -0.03]];
      spots.forEach(([x, y, z], i) => {
        const m = k.std(pc[i], { roughness: 1 });
        put(g, sp(0.14, 14), m, x, y, z).scale.set(1, 0.9, 0.9);
        put(g, sp(0.1, 12), m, x, y + 0.17, z + 0.02);
        for (const s of [-1, 1]) put(g, sp(0.035, 8), m, x + s * 0.07, y + 0.26, z);
        for (const s of [-1, 1]) put(g, sp(0.014, 6), dark, x + s * 0.035, y + 0.19, z + 0.11, false);
      });
      break;
    }
    case 'jukebox': {
      put(g, rbox(0.86, 1.2, 0.56, 0.05), paint, 0, 0.6, 0);
      const arch = put(g, cy(0.43, 0.43, 0.56, 28, false), paint, 0, 1.2, 0); arch.rotation.x = Math.PI / 2; arch.scale.set(1, 1, 1);
      const tubes = put(g, tor(0.36, 0.035), k.glow('#FFB13D', 2.2), 0, 1.15, 0.27, false); tubes.scale.set(1, 1.1, 1);
      put(g, bx(0.6, 0.3, 0.02), glass, 0, 1.0, 0.285, false);
      for (let i = 0; i < 6; i++) put(g, bx(0.07, 0.2, 0.01), k.std(['#FF6B6B', '#FFE14D', '#3DDC97', '#22B8CF', '#8B5CFF', '#FF5FA2'][i]), -0.2 + i * 0.08, 1.0, 0.28, false);
      put(g, bx(0.6, 0.32, 0.02), k.std('#2B2B33'), 0, 0.42, 0.285);
      for (let i = 0; i < 8; i++) put(g, bx(0.56, 0.012, 0.01), metal, 0, 0.3 + i * 0.03, 0.3, false);
      tick = (t) => { (tubes.material as THREE.MeshStandardMaterial).emissive.setHSL((t * 0.08) % 1, 0.9, 0.55); };
      break;
    }
    default: put(g, rbox(0.5, 0.5, 0.5, 0.05), paint, 0, 0.25, 0);
  }
  return { g, tick, screen };
}
