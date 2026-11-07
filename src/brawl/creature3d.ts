// 🐉 Paintbrawl creatures in real 3D: sculpted, glossy toy-like monsters built from each card's design (its body shape,
// colours, pattern, eyes, ears, horns, tail, wings and legs), dressed for their terrain — glowing cracks and a flame
// tail for Ember, ice crystals on the back for Frost, mushrooms for Bog, sprinkles for Sugar, neon stripes and an
// antenna for Neon, sprouting leaves for Meadow — and a halo for the legendaries. They breathe, blink, look around,
// walk their legs, flap, hover or bounce, lunge, flinch when hit and sink into the ground when they fall.
// The same models are rendered once into the card art, so the cards and the board match.
import * as THREE from 'three';
import { CARD, TERRAIN_INFO, type Card } from '../shared/brawl/cards';
import type { Genome } from '../inkborn/genome';

export type Pose = 'idle' | 'walk' | 'happy' | 'attack';
export type Creature3D = {
  root: THREE.Group;
  /** how tall it stands (for badges and effects) */
  height: number;
  update(dt: number, t: number, pose: Pose): void;
  /** 0..1: how red it flashes (hurt) */
  hurt(k: number): void;
  /** 0..1: how see-through it is (dying, spawning) */
  fade(k: number): void;
  dispose(): void;
};

const R = (a = 1) => (Math.random() - 0.5) * 2 * a;
const col = (c: string) => new THREE.Color(c);
const darker = (c: string, k: number) => '#' + col(c).multiplyScalar(k).getHexString();

/** The body's skin: its colour, darker underneath, and its pattern in the accent colour. */
function skin(g: Genome, glow: boolean) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d')!;
  const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, g.color); gr.addColorStop(0.7, g.color); gr.addColorStop(1, darker(g.color, 0.7));
  x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
  const em = document.createElement('canvas'); em.width = 256; em.height = 128; const ex = em.getContext('2d')!; ex.fillStyle = '#000'; ex.fillRect(0, 0, 256, 128);
  const paint = (c: CanvasRenderingContext2D, color: string) => {
    c.fillStyle = color; c.strokeStyle = color;
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    switch (g.pattern) {
      case 'spots': for (let i = 0; i < 26; i++) { c.beginPath(); c.ellipse(rnd() * 256, 10 + rnd() * 70, 5 + rnd() * 9, 4 + rnd() * 7, 0, 0, Math.PI * 2); c.fill(); } break;
      case 'stripes': c.lineWidth = 9; for (let i = 0; i < 9; i++) { c.beginPath(); const x0 = i * 29; c.moveTo(x0, 0); c.bezierCurveTo(x0 + 12, 30, x0 - 12, 55, x0 + 4, 82); c.stroke(); } break;
      case 'patches': for (let i = 0; i < 8; i++) { c.beginPath(); const cx = rnd() * 256, cy = 10 + rnd() * 60; for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, r = 12 + rnd() * 12; c.lineTo(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r); } c.fill(); } break;
      case 'stars': for (let i = 0; i < 16; i++) { const cx = rnd() * 256, cy = 8 + rnd() * 70, r = 4 + rnd() * 5; c.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.fill(); } break;
    }
  };
  paint(x, g.accent);
  if (glow) paint(ex, g.accent);
  // a few soft highlights so it reads as a glossy toy
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 90, 6, 3); }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping;
  const emissiveMap = glow ? new THREE.CanvasTexture(em) : null; if (emissiveMap) { emissiveMap.colorSpace = THREE.SRGBColorSpace; emissiveMap.wrapS = THREE.RepeatWrapping; }
  return { map, emissiveMap };
}

export function buildCreature(card: Card, g: Genome, o: { phone?: boolean } = {}): Creature3D {
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig); // everything that bobs and leans
  const terrain = card.terrain, T = terrain === 'neutral' ? null : TERRAIN_INFO[terrain];
  const glowy = terrain === 'neon' || terrain === 'ember';
  const legendary = card.rarity === 'legendary', epic = card.rarity === 'epic';
  const size = Math.max(0.8, Math.min(1.3, g.size || 1)) * (legendary ? 1.18 : epic ? 1.06 : 1) * 0.95;
  const mats: THREE.Material[] = [], geos: THREE.BufferGeometry[] = [], texs: THREE.Texture[] = [];
  const tint: THREE.MeshStandardMaterial[] = []; // these flash red when it's hurt
  const M = (p: THREE.MeshStandardMaterialParameters, hurtable = true) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.04, ...p }); m.userData.e0 = m.emissive.clone(); m.userData.ei0 = m.emissiveIntensity; m.userData.op0 = m.opacity; m.userData.tr0 = m.transparent; mats.push(m); if (hurtable) tint.push(m); return m; };
  const RED = new THREE.Color('#FF2020');
  const G = <X extends THREE.BufferGeometry>(x: X) => { geos.push(x); return x; };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = !o.phone; m.receiveShadow = false; parent.add(m); return m; };

  const sk = skin(g, glowy); texs.push(sk.map); if (sk.emissiveMap) texs.push(sk.emissiveMap);
  const bodyM = M({ color: '#ffffff', map: sk.map, ...(sk.emissiveMap ? { emissiveMap: sk.emissiveMap, emissive: '#ffffff', emissiveIntensity: 1.1 } : {}), roughness: terrain === 'sugar' ? 0.25 : 0.42 });
  const bellyM = M({ color: g.belly, roughness: 0.5 });
  const accentM = M({ color: g.accent, roughness: 0.35, ...(glowy ? { emissive: g.accent, emissiveIntensity: 0.9 } : {}) });
  const darkM = M({ color: darker(g.color, 0.55), roughness: 0.6 });
  const whiteM = M({ color: '#FFFFFF', roughness: 0.15 }, false);
  const pupilM = M({ color: '#0E0A18', roughness: 0.1 }, false);
  const shineM = M({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 1 }, false);
  const irisM = M({ color: glowy ? g.accent : darker(g.accent, 0.8), roughness: 0.2, ...(glowy ? { emissive: g.accent, emissiveIntensity: 1.4 } : {}) }, false);
  const mouthM = M({ color: '#3A0E1E', roughness: 0.6 }, false);

  // ---- the body ----
  const hasLegs = g.gait === 'walk' && g.legs > 0;
  const legH = hasLegs ? 0.32 : g.gait === 'hover' ? 0.35 : 0.04;
  const body = new THREE.Group(); rig.add(body);
  let headR = 0.42, headAt = new THREE.Vector3(), bodyLen = 0.6, bodyTop = 1, belly: THREE.Mesh | null = null;
  const b = g.body;
  if (b === 'round' || b === 'blob' || b === 'pear') {
    // the face is on the body itself
    const r = b === 'blob' ? 0.62 : 0.58;
    const geo = b === 'pear'
      ? G(new THREE.LatheGeometry([0, 0.12, 0.3, 0.5, 0.7, 0.85, 1].map((k) => new THREE.Vector2(Math.sin(k * Math.PI) * (0.66 - k * 0.22) + 0.001, k * 1.25)), 32))
      : G(new THREE.SphereGeometry(r, 40, 28));
    const m = mesh(geo, bodyM, body, 0, b === 'pear' ? legH : legH + r * (b === 'blob' ? 0.72 : 0.95), 0);
    if (b === 'blob') m.scale.set(1.18, 0.78, 1.12);
    belly = mesh(G(new THREE.SphereGeometry(r * 0.72, 28, 20)), bellyM, body, 0, m.position.y - (b === 'pear' ? -0.42 : 0.08), b === 'pear' ? 0.28 : r * 0.42); belly.scale.set(1, 0.95, 0.55);
    headR = b === 'pear' ? 0.42 : r; headAt = new THREE.Vector3(0, b === 'pear' ? legH + 0.85 : m.position.y + 0.05, 0); bodyTop = b === 'pear' ? legH + 1.25 : m.position.y + r * (b === 'blob' ? 0.7 : 0.95); bodyLen = r * 2;
  } else {
    // a torso with its own head
    const tall = b === 'tall', long = b === 'long';
    const len = long ? 0.95 : tall ? 0.55 : 0.4, rad = long ? 0.36 : tall ? 0.36 : 0.44;
    const geo = G(new THREE.CapsuleGeometry(rad, len, 10, 24));
    const m = mesh(geo, bodyM, body, 0, 0, 0);
    if (long) { m.rotation.x = Math.PI / 2; m.position.set(0, legH + rad, -0.05); }
    else if (tall) { m.position.set(0, legH + rad + len / 2, 0); }
    else { m.rotation.x = 0.5; m.position.set(0, legH + rad + 0.1, -0.05); }
    belly = mesh(G(new THREE.SphereGeometry(rad * 0.85, 24, 16)), bellyM, body, 0, m.position.y - (long ? 0.08 : 0), (long ? 0 : rad * 0.5)); belly.scale.set(0.9, long ? 0.6 : 1.15, long ? 1.8 : 0.6);
    if (long) belly.position.y -= rad * 0.45;
    headR = tall ? 0.4 : 0.42;
    headAt = long ? new THREE.Vector3(0, legH + rad * 2 + 0.12, len / 2 + 0.25) : tall ? new THREE.Vector3(0, legH + rad * 2 + len + 0.25, 0.05) : new THREE.Vector3(0, legH + rad * 2 + 0.28, 0.3);
    const head = mesh(G(new THREE.SphereGeometry(headR, 36, 24)), bodyM, body, headAt.x, headAt.y, headAt.z);
    head.scale.set(1.05, 0.95, 1);
    bodyTop = headAt.y + headR; bodyLen = long ? len + rad * 2 : rad * 2;
    // a tall creature gets arms
    if (tall) for (const sx of [-1, 1]) { const arm = mesh(G(new THREE.CapsuleGeometry(0.09, 0.38, 6, 10)), bodyM, body, sx * (rad + 0.08), legH + rad + len * 0.65, 0.05); arm.rotation.z = sx * 0.5; arm.userData.arm = sx; }
  }
  const head = new THREE.Group(); head.position.copy(headAt); body.add(head); // the face, ears and horns follow the head

  // ---- the face ----
  const faceZ = headR * (b === 'blob' ? 1.02 : 0.9), eyeY = headR * 0.18;
  const eyes: THREE.Group[] = [];
  const n = Math.max(0, Math.min(6, g.eyecount ?? 2)), one = g.eyes === 'one' || n === 1;
  const eyeR = (g.eyes === 'big' ? 0.15 : one ? 0.21 : 0.12) * (headR / 0.42);
  const spots: [number, number][] = one ? [[0, 0]] : n === 2 ? [[-0.36, 0], [0.36, 0]] : n === 3 ? [[-0.42, -0.05], [0.42, -0.05], [0, 0.32]] : n === 4 ? [[-0.4, -0.08], [0.4, -0.08], [-0.2, 0.3], [0.2, 0.3]] : n >= 5 ? [[-0.45, -0.1], [0.45, -0.1], [0, 0.05], [-0.25, 0.35], [0.25, 0.35], [0, 0.55]].slice(0, n) as [number, number][] : [];
  for (const [ex, ey] of spots) {
    const a = ex * 1.15, el = ey * 0.9 + eyeY / headR;
    const e = new THREE.Group(); e.position.set(Math.sin(a) * faceZ, eyeY + el * headR * 0.6, Math.cos(a) * faceZ * Math.cos(el * 0.6)); e.lookAt(e.position.clone().multiplyScalar(3)); head.add(e);
    if (g.eyes === 'happy') { const arc = mesh(G(new THREE.TorusGeometry(eyeR * 0.8, eyeR * 0.22, 6, 14, Math.PI)), pupilM, e, 0, -eyeR * 0.3, eyeR * 0.3); arc.rotation.z = 0; }
    else {
      mesh(G(new THREE.SphereGeometry(eyeR, 20, 14)), whiteM, e).scale.z = 0.6;
      const iris = mesh(G(new THREE.SphereGeometry(eyeR * 0.62, 16, 12)), irisM, e, 0, 0, eyeR * 0.42); iris.scale.z = 0.4;
      if (g.eyes === 'star') { const st = mesh(G(new THREE.OctahedronGeometry(eyeR * 0.4, 0)), shineM, e, 0, 0, eyeR * 0.62); st.scale.z = 0.3; }
      else mesh(G(new THREE.SphereGeometry(eyeR * 0.34, 12, 10)), pupilM, e, 0, 0, eyeR * 0.6).scale.z = 0.4;
      mesh(G(new THREE.SphereGeometry(eyeR * 0.14, 8, 6)), shineM, e, eyeR * 0.25, eyeR * 0.28, eyeR * 0.72);
      if (g.eyes === 'sleepy') { const lid = mesh(G(new THREE.SphereGeometry(eyeR * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), bodyM, e, 0, 0, 0); lid.rotation.x = -0.35; }
      // a determined brow: these are fighters
      if (!one) { const brow = mesh(G(new THREE.CapsuleGeometry(eyeR * 0.14, eyeR * 1.3, 4, 8)), darkM, e, 0, eyeR * 1.18, eyeR * 0.25); brow.rotation.z = Math.PI / 2 + (ex < 0 ? -0.35 : ex > 0 ? 0.35 : 0); }
      else { const lidR = mesh(G(new THREE.TorusGeometry(eyeR * 1.02, eyeR * 0.12, 6, 20, Math.PI)), darkM, e, 0, 0, eyeR * 0.1); lidR.rotation.z = 0.15; }
    }
    eyes.push(e);
  }
  const mouth = new THREE.Group(); mouth.position.set(0, -headR * 0.3, headR * (b === 'blob' ? 1.02 : 0.94)); head.add(mouth);
  const lip = mesh(G(new THREE.TorusGeometry(headR * 0.22, headR * 0.05, 6, 16, Math.PI)), mouthM, mouth); lip.rotation.z = Math.PI;
  const maw = mesh(G(new THREE.SphereGeometry(headR * 0.2, 16, 10)), mouthM, mouth, 0, -headR * 0.06, -0.02); maw.scale.set(1, 0.05, 0.4);
  for (const sx of [-1, 1]) { const fang = mesh(G(new THREE.ConeGeometry(headR * 0.045, headR * 0.12, 6)), whiteM, mouth, sx * headR * 0.1, -headR * 0.05, 0.01); fang.rotation.x = Math.PI; }
  if (g.cheeks) for (const sx of [-1, 1]) { const ch = mesh(G(new THREE.SphereGeometry(headR * 0.14, 12, 8)), M({ color: '#FF8AB0', roughness: 0.7 }, false), head, sx * headR * 0.55, -headR * 0.18, faceZ * 0.82); ch.scale.z = 0.3; ch.lookAt(ch.position.clone().multiplyScalar(2)); }

  // ---- ears and horns ----
  const topAt = (sx: number, up = 0.75) => new THREE.Vector3(sx * headR * 0.55, headR * up, -headR * 0.05);
  const ears: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const p = topAt(sx);
    let e: THREE.Mesh | null = null;
    switch (g.ears) {
      case 'cat': e = mesh(G(new THREE.ConeGeometry(headR * 0.24, headR * 0.5, 4)), bodyM, head, p.x, p.y + headR * 0.12, p.z); e.rotation.z = -sx * 0.3; break;
      case 'bunny': e = mesh(G(new THREE.CapsuleGeometry(headR * 0.11, headR * 0.75, 6, 10)), bodyM, head, p.x * 0.7, p.y + headR * 0.45, p.z); e.rotation.z = -sx * 0.15; break;
      case 'round': e = mesh(G(new THREE.SphereGeometry(headR * 0.22, 14, 10)), bodyM, head, p.x * 1.1, p.y, p.z); e.scale.z = 0.5; break;
      case 'floppy': e = mesh(G(new THREE.CapsuleGeometry(headR * 0.12, headR * 0.5, 6, 10)), bodyM, head, sx * headR * 0.85, headR * 0.2, 0); e.rotation.z = sx * 0.6; break;
      case 'fins': e = mesh(G(new THREE.ConeGeometry(headR * 0.28, headR * 0.6, 3)), accentM, head, sx * headR * 0.9, headR * 0.15, -headR * 0.1); e.rotation.z = -sx * 1.2; e.scale.z = 0.25; break;
    }
    if (e) ears.push(e);
  }
  const hornM = terrain === 'ember' || terrain === 'neon' ? accentM : M({ color: terrain === 'frost' ? '#E8F8FF' : '#F2E6D0', roughness: 0.4 });
  switch (g.horns) {
    case 'nubs': for (const sx of [-1, 1]) mesh(G(new THREE.ConeGeometry(headR * 0.1, headR * 0.2, 8)), hornM, head, sx * headR * 0.3, headR * 0.92, 0.05); break;
    case 'curly': for (const sx of [-1, 1]) { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 16; i++) { const k = i / 16, a = k * Math.PI * 2.2; pts.push(new THREE.Vector3(sx * (headR * 0.45 + Math.sin(a) * headR * 0.22 * k + k * headR * 0.3), headR * 0.8 + Math.cos(a) * headR * 0.22 * k + k * headR * 0.2, -Math.cos(a) * 0.05)); } mesh(G(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, headR * 0.06, 6)), hornM, head); } break;
    case 'antlers': for (const sx of [-1, 1]) { const base = mesh(G(new THREE.CylinderGeometry(headR * 0.035, headR * 0.05, headR * 0.7, 6)), hornM, head, sx * headR * 0.38, headR * 1.15, 0); base.rotation.z = -sx * 0.4; for (let k = 0; k < 2; k++) { const br = mesh(G(new THREE.CylinderGeometry(headR * 0.025, headR * 0.035, headR * 0.35, 5)), hornM, head, sx * headR * (0.5 + k * 0.12), headR * (1.2 + k * 0.22), 0); br.rotation.z = -sx * (1.1 - k * 0.2); } } break;
    case 'unicorn': { const h = mesh(G(new THREE.ConeGeometry(headR * 0.11, headR * 0.75, 10)), M({ color: '#FFE9A8', emissive: '#FFD23F', emissiveIntensity: 0.5, roughness: 0.25 }), head, 0, headR * 1.15, headR * 0.3); h.rotation.x = 0.35; break; }
  }

  // ---- tail and wings ----
  const back = new THREE.Vector3(0, legH + (bodyTop - legH) * 0.35, -bodyLen * 0.5);
  const tail = new THREE.Group(); tail.position.copy(back); body.add(tail);
  let flame: THREE.Mesh | null = null;
  switch (g.tail) {
    case 'fluffy': for (let i = 0; i < 4; i++) mesh(G(new THREE.SphereGeometry(0.12 + i * 0.015, 10, 8)), i % 2 ? bellyM : bodyM, tail, R(0.06), 0.06 + i * 0.03, -0.08 - i * 0.05); break;
    case 'long': case 'curl': {
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(g.tail === 'curl' ? new THREE.Vector3(0, Math.sin(k * Math.PI * 1.6) * 0.25 + k * 0.2, -Math.cos(k * Math.PI * 1.6) * 0.2 - k * 0.35) : new THREE.Vector3(Math.sin(k * 3) * 0.08, k * 0.25 - k * k * 0.1, -k * 0.75)); }
      mesh(G(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 7)), bodyM, tail);
      mesh(G(new THREE.SphereGeometry(0.09, 10, 8)), accentM, tail, pts[12].x, pts[12].y, pts[12].z); break;
    }
    case 'fin': { const f = mesh(G(new THREE.ConeGeometry(0.22, 0.5, 3)), accentM, tail, 0, 0.18, -0.2); f.rotation.x = -1.1; f.scale.x = 0.25; break; }
    case 'flame': { mesh(G(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8)), bodyM, tail, 0, 0.08, -0.15).rotation.x = -1; flame = mesh(G(new THREE.ConeGeometry(0.14, 0.42, 10)), M({ color: '#FFB020', emissive: '#FF6A10', emissiveIntensity: 2.5, transparent: true, opacity: 0.92 }, false), tail, 0, 0.36, -0.36); flame.rotation.x = -0.5; break; }
  }
  const wings: THREE.Mesh[] = [];
  if (g.wings !== 'none') for (const sx of [-1, 1]) {
    const shape = new THREE.Shape(); if (g.wings === 'leaf') { shape.moveTo(0, 0); shape.quadraticCurveTo(0.35, 0.35, 0.65, 0.05); shape.quadraticCurveTo(0.35, -0.12, 0, 0); } else { shape.moveTo(0, 0); shape.quadraticCurveTo(0.2, 0.4, 0.42, 0.22); shape.quadraticCurveTo(0.3, 0.05, 0.38, -0.05); shape.quadraticCurveTo(0.18, 0, 0, 0); }
    const w = mesh(G(new THREE.ShapeGeometry(shape)), M({ color: g.wings === 'leaf' ? '#62D66E' : g.accent, side: THREE.DoubleSide, transparent: true, opacity: 0.88, roughness: 0.3, ...(glowy ? { emissive: g.accent, emissiveIntensity: 0.6 } : {}) }, false), body, sx * 0.25, bodyTop - (bodyTop - legH) * 0.35, -0.1);
    w.scale.set(sx * 1.4, 1.4, 1.4); w.rotation.y = sx * 0.4; w.userData.side = sx; wings.push(w);
  }

  // ---- legs ----
  const legs: { m: THREE.Group; phase: number }[] = [];
  if (hasLegs) {
    const count = Math.min(8, Math.max(2, g.legs)), pairs = Math.ceil(count / 2), span = Math.max(0.2, bodyLen * 0.55);
    const footM = darkM;
    for (let i = 0; i < pairs; i++) for (const sx of [-1, 1]) {
      if (legs.length >= count) break;
      const z = pairs === 1 ? 0.02 : span / 2 - (i / (pairs - 1)) * span;
      const lg = new THREE.Group(); lg.position.set(sx * Math.min(0.32, bodyLen * 0.3 + 0.08), legH + 0.06, z); body.add(lg);
      mesh(G(new THREE.CapsuleGeometry(0.075, legH * 0.75, 4, 8)), bodyM, lg, 0, -legH * 0.45, 0);
      const foot = mesh(G(new THREE.SphereGeometry(0.1, 10, 8)), footM, lg, 0, -legH - 0.01, 0.05); foot.scale.set(1, 0.55, 1.3);
      legs.push({ m: lg, phase: i * Math.PI + (sx > 0 ? Math.PI : 0) });
    }
  }

  // ---- terrain flair ----
  const flair = new THREE.Group(); body.add(flair);
  const flairY = bodyTop - 0.05;
  if (terrain === 'frost') for (let i = 0; i < 3; i++) { const c = mesh(G(new THREE.OctahedronGeometry(0.11, 0)), M({ color: '#CFF6FF', transparent: true, opacity: 0.85, roughness: 0.05, emissive: '#6FD3FF', emissiveIntensity: 0.5 }, false), flair, (i - 1) * 0.16, flairY - Math.abs(i - 1) * 0.1, -0.12 - Math.abs(i - 1) * 0.05); c.scale.y = 2; c.rotation.z = (i - 1) * 0.4; }
  if (terrain === 'bog') for (let i = 0; i < 2; i++) { const s = (i ? -1 : 1) * 0.18; mesh(G(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 6)), M({ color: '#F0E2C8' }, false), flair, s, flairY + 0.02, -0.15); mesh(G(new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), M({ color: i ? '#3DDC97' : '#FF6FB5', emissive: i ? '#3DDC97' : '#FF6FB5', emissiveIntensity: 0.5 }, false), flair, s, flairY + 0.08, -0.15); }
  if (terrain === 'meadow') for (const sx of [-1, 1]) { const l = mesh(G(new THREE.SphereGeometry(0.1, 10, 6)), M({ color: '#5FD26A', roughness: 0.5 }, false), flair, sx * 0.07, flairY + 0.1, 0); l.scale.set(0.5, 1.4, 0.25); l.rotation.z = sx * 0.6; }
  if (terrain === 'neon') { mesh(G(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5)), darkM, head, 0, headR + 0.12, -0.05); mesh(G(new THREE.SphereGeometry(0.055, 10, 8)), M({ color: '#ffffff', emissive: g.accent, emissiveIntensity: 3 }, false), head, 0, headR + 0.28, -0.05); }
  if (terrain === 'sugar') for (let i = 0; i < 10; i++) { const sp = mesh(G(new THREE.CapsuleGeometry(0.012, 0.05, 2, 4)), M({ color: ['#FF4D6D', '#3DDC97', '#FFE14D', '#22B8FF'][i % 4], roughness: 0.3 }, false), flair, R(0.25), flairY - Math.random() * 0.1, R(0.2)); sp.rotation.set(Math.random() * 3, Math.random() * 3, 0); }
  let embers: THREE.Mesh | null = null;
  if (terrain === 'ember' && !flame) { embers = mesh(G(new THREE.ConeGeometry(0.1, 0.3, 8)), M({ color: '#FFB020', emissive: '#FF5A10', emissiveIntensity: 2.4, transparent: true, opacity: 0.9 }, false), flair, 0, flairY + 0.12, -0.05); }
  // legendaries wear a halo
  let halo: THREE.Mesh | null = null;
  if (legendary) { halo = mesh(G(new THREE.TorusGeometry(0.26, 0.03, 8, 32)), M({ color: '#FFE48A', emissive: '#FFB13D', emissiveIntensity: 2, metalness: 0.6, roughness: 0.2 }, false), head, 0, headR + 0.32, 0); halo.rotation.x = Math.PI / 2; }

  rig.scale.setScalar(size);
  const height = (bodyTop + (g.ears === 'bunny' ? 0.35 : 0.15) + (legendary ? 0.35 : 0)) * size;

  // ---- life ----
  let blink = 1 + Math.random() * 3, blinkT = 0, hopT = Math.random() * 6, attackT = 0;
  const seed = Math.random() * 10;
  const base = { y: 0 };
  return {
    root, height,
    update(dt, t, pose) {
      const tt = t + seed;
      // breathing
      body.scale.set(1 + Math.sin(tt * 2.2) * 0.015, 1 + Math.sin(tt * 2.2 + 1) * 0.03, 1 + Math.sin(tt * 2.2) * 0.015);
      // how it gets about
      let y = 0;
      if (g.gait === 'hover') y = 0.12 + Math.sin(tt * 2) * 0.08;
      else if (g.gait === 'bounce') { hopT += dt * (pose === 'happy' ? 6 : 2.6); y = Math.abs(Math.sin(hopT)) * (pose === 'happy' ? 0.35 : 0.12); }
      else if (pose === 'happy') y = Math.abs(Math.sin(tt * 9)) * 0.22;
      if (g.gait === 'slither') { body.rotation.y = Math.sin(tt * 3) * 0.12; }
      if (g.gait === 'roll' && pose === 'walk') body.rotation.x += dt * 6; else if (g.gait === 'roll') body.rotation.x *= 0.9;
      rig.position.y = base.y + y;
      // walking legs
      const walking = pose === 'walk' || pose === 'attack';
      for (const l of legs) l.m.rotation.x = walking ? Math.sin(tt * 14 + l.phase) * 0.7 : Math.sin(tt * 1.5 + l.phase) * 0.04;
      body.children.forEach((ch) => { if (ch.userData.arm) ch.rotation.x = walking ? Math.sin(tt * 12 + ch.userData.arm) * 0.8 : Math.sin(tt * 1.6 + ch.userData.arm) * 0.1; });
      // a lunge leans in and opens wide
      attackT = pose === 'attack' ? Math.min(1, attackT + dt * 6) : Math.max(0, attackT - dt * 4);
      rig.rotation.x = attackT * 0.35;
      maw.scale.y = 0.05 + attackT * 0.9 + (pose === 'happy' ? 0.4 : 0);
      // look around, blink
      head.rotation.y = Math.sin(tt * 0.6) * 0.25; head.rotation.z = Math.sin(tt * 0.9) * 0.05;
      blink -= dt; if (blink < 0) { blinkT = 0.14; blink = 2 + Math.random() * 3.5; }
      if (blinkT > 0) blinkT -= dt;
      const lid = blinkT > 0 ? 0.1 : 1; for (const e of eyes) e.scale.y = lid;
      // tail, ears, wings
      tail.rotation.y = Math.sin(tt * 3) * 0.35; tail.rotation.x = Math.sin(tt * 2) * 0.1;
      ears.forEach((e, i) => { e.rotation.x = Math.sin(tt * 2 + i) * 0.08; });
      for (const w of wings) w.rotation.y = (w.userData.side as number) * (0.4 + Math.sin(tt * (g.gait === 'hover' ? 18 : 5)) * 0.5);
      if (flame) { flame.scale.set(1 + Math.sin(tt * 20) * 0.15, 1 + Math.sin(tt * 13) * 0.25, 1); }
      if (embers) embers.scale.set(1, 1 + Math.sin(tt * 17) * 0.3, 1);
      if (halo) halo.rotation.z = tt;
    },
    hurt(k) { for (const m of tint) { m.emissive.copy(m.userData.e0 as THREE.Color).lerp(RED, k); m.emissiveIntensity = k > 0 ? Math.max(m.userData.ei0 as number, 1.2) : (m.userData.ei0 as number); } },
    fade(k) { for (const m of mats) { const sm = m as THREE.MeshStandardMaterial; const was = sm.transparent; sm.transparent = k < 1 || (m.userData.tr0 as boolean); sm.opacity = (m.userData.op0 as number) * k; sm.depthWrite = k >= 1; if (was !== sm.transparent) sm.needsUpdate = true; } },
    dispose() { for (const x of geos) x.dispose(); for (const x of mats) x.dispose(); for (const x of texs) x.dispose(); },
  };
}

// ---- the card portraits: each creature rendered once, in 3D, for the card art --------------------------------------------
let shot: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
const portraits = new Map<string, HTMLCanvasElement | null>();
/** A picture of a card's creature in 3D (made once, then cached). Null if 3D isn't available. */
export function portrait(id: string, genome: (c: Card) => Genome): HTMLCanvasElement | null {
  if (portraits.has(id)) return portraits.get(id)!;
  const card = CARD[id]; if (!card || card.kind !== 'creature') return null;
  try {
    if (!shot) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 320;
      const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(320, 320, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.2;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#FFFFFF', '#6A5A7A', 1.9));
      const key = new THREE.DirectionalLight('#FFF0DD', 2.6); key.position.set(2, 4, 4); scene.add(key);
      const rim = new THREE.DirectionalLight('#B8D8FF', 1.6); rim.position.set(-3, 2, -3); scene.add(rim);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      shot = { r, scene, cam };
    }
    const c = buildCreature(card, genome(card));
    c.root.rotation.y = 0.45; c.update(0, 1.3, 'idle');
    shot.scene.add(c.root);
    const h = c.height, d = Math.max(3.4, h * 2.75);
    shot.cam.position.set(0.4, h * 0.6 + 0.3, d); shot.cam.lookAt(0, h * 0.5, 0);
    shot.r.render(shot.scene, shot.cam);
    const out = document.createElement('canvas'); out.width = out.height = 320; out.getContext('2d')!.drawImage(shot.r.domElement, 0, 0);
    shot.scene.remove(c.root); c.dispose();
    portraits.set(id, out);
    return out;
  } catch { portraits.set(id, null); return null; }
}
