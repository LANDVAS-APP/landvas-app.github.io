// Every Paintbrawl creature as its own character, and the 2D cartoon pictures of them for the cards: the same model
// rendered with flat cartoon shading and a thick ink outline, so the cards stay 2D while the board is 3D.
import * as THREE from 'three';
import { CARD, type Card } from '../../shared/brawl/cards';
import { makeChar, type Builder, type Char } from './core';
import { ATTACKS } from './attacks';
import * as meadow from './meadow';
import * as ember from './ember';
import * as frost from './frost';
import * as bog from './bog';
import * as sugar from './sugar';
import * as neon from './neon';
import * as neutral from './neutral';
import * as tricksters from './tricksters';

export type { Char, CharFx, ActKind, Pose } from './core';

const BUILDERS: Record<string, Builder> = { ...meadow, ...ember, ...frost, ...bog, ...sugar, ...neon, ...neutral, ...tricksters } as Record<string, Builder>;
export const hasChar = (id: string) => !!BUILDERS[id];

export function buildChar(card: Card, o: { phone?: boolean; toon?: boolean } = {}): Char {
  return makeChar(BUILDERS[card.id] ?? BUILDERS.pebblegolem, card, { ...o, attack: ATTACKS[card.id] });
}

// ---- the card pictures --------------------------------------------------------------------------------------------------
let shot: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
const SIZE = 320;
const cache = new Map<string, HTMLCanvasElement | null>();
/** A picture of a creature for its card: flat cartoon shading with an ink outline (or, with `toon: false`, the
 *  board's 3D look). Made once, then cached. Null if WebGL isn't available. */
export function portrait(id: string, o: { toon?: boolean } = {}): HTMLCanvasElement | null {
  const toon = o.toon ?? true, key = `${id}:${toon}`;
  if (cache.has(key)) return cache.get(key)!;
  const card = CARD[id]; if (!card || card.kind !== 'creature') return null;
  try {
    if (!shot) {
      const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
      const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(SIZE, SIZE, false); r.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#FFFFFF', '#8A7A9A', 1.6));
      const key = new THREE.DirectionalLight('#FFF4E4', 2.6); key.position.set(2, 4, 4); scene.add(key);
      const rim = new THREE.DirectionalLight('#C8E0FF', 1.4); rim.position.set(-3, 2, -3); scene.add(rim);
      shot = { r, scene, cam: new THREE.PerspectiveCamera(28, 1, 0.1, 50) };
    }
    shot.r.toneMapping = toon ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; shot.r.toneMappingExposure = 1.15;
    const c = buildChar(card, { toon });
    c.root.rotation.y = 0.5; c.update(0, 1.3, 'idle');
    shot.scene.add(c.root);
    // frame it by its real size
    c.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(c.root), ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const span = Math.max(sz.y, sz.x * 0.95, 0.6), d = (span * 0.62) / Math.tan(THREE.MathUtils.degToRad(14));
    shot.cam.position.set(ctr.x + d * 0.08, ctr.y + span * 0.18, ctr.z + d); shot.cam.lookAt(ctr.x, ctr.y - span * 0.02, ctr.z);
    shot.r.setClearColor(0x000000, 0); shot.r.clear(); shot.r.render(shot.scene, shot.cam);
    shot.scene.remove(c.root); c.dispose();
    const out = document.createElement('canvas'); out.width = out.height = SIZE; const g = out.getContext('2d')!;
    if (toon) {
      // the ink outline: the silhouette, grown a few pixels in every direction, filled dark, under the picture
      const ink = document.createElement('canvas'); ink.width = ink.height = SIZE; const ig = ink.getContext('2d')!;
      for (let i = 0; i < 16; i++) { const q = (i / 16) * Math.PI * 2; ig.drawImage(shot.r.domElement, Math.cos(q) * 5, Math.sin(q) * 5); }
      ig.globalCompositeOperation = 'source-in'; ig.fillStyle = '#1E1430'; ig.fillRect(0, 0, SIZE, SIZE);
      g.drawImage(ink, 0, 0);
    }
    g.drawImage(shot.r.domElement, 0, 0);
    cache.set(key, out);
    return out;
  } catch { cache.set(key, null); return null; }
}
