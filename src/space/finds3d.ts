// What you can find out on a world, in 3D: storm shards, hidden aliens (they duck down until you're close,
// then peek out), and places to discover — craters, crashed probes, monoliths, geodes, ruins, geysers,
// fossils and ice caves. Plus the weather itself: dust, sparks, snow, acid rain or ash blowing past you.
// Models are built facing +z with y up, at the origin; planet3d stands them on the ground.
import * as THREE from 'three';

const geos = new Map<string, THREE.BufferGeometry>();
const mats = new Map<string, THREE.Material>();
const g = (k: string, f: () => THREE.BufferGeometry) => { let x = geos.get(k); if (!x) { x = f(); geos.set(k, x); } return x; };
const m = (k: string, f: () => THREE.Material) => { let x = mats.get(k); if (!x) { x = f(); mats.set(k, x); } return x; };
const std = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => m(`s${c}${JSON.stringify(o)}`, () => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...o }));
const lit = (c: string, k = 1.2) => m(`l${c}${k}`, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4, flatShading: true }));
const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); return o; };

/** Colours for each storm kind (particles, sky tint, shards). */
export const WEATHER: Record<string, { color: string; tint: string; size: number; fall: number; wind: number; streak?: boolean; spark?: boolean; flash?: boolean; up?: boolean }> = {
  dust: { color: '#D9A066', tint: '#B07A4E', size: 0.35, fall: 0.6, wind: 14 },
  solar: { color: '#FFE36B', tint: '#FFB13D', size: 0.28, fall: -1.4, wind: 3, spark: true, up: true },
  blizzard: { color: '#FFFFFF', tint: '#CFE8FF', size: 0.22, fall: 7, wind: 6 },
  ion: { color: '#7FE3FF', tint: '#4B6BFF', size: 0.22, fall: 1.2, wind: 4, spark: true, flash: true },
  acid: { color: '#B6FF5C', tint: '#7FA33A', size: 0.14, fall: 22, wind: 2, streak: true },
  ash: { color: '#5A5560', tint: '#6E5A55', size: 0.3, fall: 1.6, wind: 5 },
};

/** A storm shard: a little crystal that glows the storm's colour (gold if rare). */
export function shardModel(kind: string, rare: boolean) {
  const o = new THREE.Group();
  const c = rare ? '#FFD84D' : WEATHER[kind]?.color ?? '#7FE3FF';
  const s = mk(g('shard', () => new THREE.OctahedronGeometry(0.45, 0).scale(1, 1.8, 1)), lit(c, rare ? 1.6 : 1.1));
  s.name = 'spin'; o.add(s);
  return o;
}

/** A hidden alien: a round critter with big eyes, in its species' colour. It sits in a little burrow. */
export function alienModel(species: string, rarity: string) {
  const o = new THREE.Group();
  const hue = [...species].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
  const col = new THREE.Color().setHSL(hue / 360, 0.65, rarity === 'legendary' ? 0.7 : 0.55).getStyle();
  o.add(mk(g('burrow', () => new THREE.TorusGeometry(0.75, 0.22, 6, 18).rotateX(Math.PI / 2)), std('#5B4A3E'), 0, 0.05));
  o.add(mk(g('hole', () => new THREE.CircleGeometry(0.62, 18).rotateX(-Math.PI / 2)), m('hole', () => new THREE.MeshBasicMaterial({ color: '#120E14' })), 0, 0.06));
  const body = new THREE.Group(); body.name = 'peek';
  if (species === 'elder') {
    body.add(mk(g('ufo', () => new THREE.SphereGeometry(0.9, 20, 10).scale(1, 0.32, 1)), std('#C7CCD8', { metalness: 0.8, roughness: 0.25, flatShading: false }), 0, 0.9));
    body.add(mk(g('ufodome', () => new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m('ufog', () => new THREE.MeshStandardMaterial({ color: '#9FFFD0', transparent: true, opacity: 0.7, emissive: '#5CFFB0', emissiveIntensity: 0.6 })), 0, 1.1));
    for (let i = 0; i < 6; i++) body.add(mk(g('ufolight', () => new THREE.SphereGeometry(0.07, 6, 4)), lit(i % 2 ? '#FF5C8A' : '#FFE36B', 2), Math.cos((i / 6) * Math.PI * 2) * 0.82, 0.86, Math.sin((i / 6) * Math.PI * 2) * 0.82));
  } else {
    body.add(mk(g('ablob', () => new THREE.SphereGeometry(0.55, 18, 12).scale(1, 1.15, 1)), std(col, { flatShading: false, roughness: 0.5 }), 0, 0.6));
    for (const x of [-0.2, 0.2]) {
      body.add(mk(g('aeye', () => new THREE.SphereGeometry(0.16, 12, 8)), std('#FFFFFF', { flatShading: false }), x, 0.82, 0.42));
      body.add(mk(g('apupil', () => new THREE.SphereGeometry(0.08, 8, 6)), std('#111111', { flatShading: false }), x, 0.82, 0.55));
      const ant = mk(g('aant', () => new THREE.CylinderGeometry(0.025, 0.025, 0.45, 5)), std(col), x * 1.4, 1.35, 0); ant.rotation.z = -x * 1.6; body.add(ant);
      body.add(mk(g('aantb', () => new THREE.SphereGeometry(0.07, 8, 6)), lit(col, 1.4), x * 2.1, 1.55, 0));
    }
  }
  o.add(body);
  return o;
}

/** A place to discover. Found ones are drawn a little greyer (still there to look at). */
export function poiModel(kind: string, found: boolean) {
  const o = new THREE.Group();
  const dim = (c: string) => (found ? new THREE.Color(c).lerp(new THREE.Color('#77777f'), 0.45).getStyle() : c);
  switch (kind) {
    case 'crater': {
      o.add(mk(g('craterrim', () => new THREE.TorusGeometry(4, 0.9, 6, 28).rotateX(Math.PI / 2).scale(1, 0.5, 1)), std(dim('#8B7A6A')), 0, 0.1));
      o.add(mk(g('craterfloor', () => new THREE.CircleGeometry(3.4, 28).rotateX(-Math.PI / 2)), std(dim('#4A3F38')), 0, 0.04));
      for (let i = 0; i < 7; i++) { const r = mk(g('craterrock', () => new THREE.DodecahedronGeometry(0.4, 0)), std(dim('#6E625A')), Math.cos(i * 2.1) * 5.4, 0.2, Math.sin(i * 2.1) * 5.4); r.scale.setScalar(0.6 + (i % 3) * 0.4); o.add(r); }
      if (!found) o.add(mk(g('cratercore', () => new THREE.DodecahedronGeometry(0.55, 0)), lit('#FF7A3D', 0.8), 0, 0.4));
      break;
    }
    case 'probe': {
      const body = mk(g('probebody', () => new THREE.CylinderGeometry(0.7, 0.9, 1.4, 8)), std(dim('#C8CCD6'), { metalness: 0.7, roughness: 0.35 }), 0, 0.6); body.rotation.z = 0.5; o.add(body);
      for (const s of [-1, 1]) { const p = mk(g('probepanel', () => new THREE.BoxGeometry(2.2, 0.05, 0.9)), std(dim('#1E2A5A'), { metalness: 0.3, roughness: 0.3 }), s * 1.7, 0.5 + s * 0.6, 0); p.rotation.z = 0.5; o.add(p); }
      const dish = mk(g('probedish', () => new THREE.ConeGeometry(0.6, 0.3, 14, 1, true).rotateX(Math.PI)), std(dim('#E9ECF2'), { side: THREE.DoubleSide }), -0.5, 1.4, 0.2); dish.rotation.z = 1.1; o.add(dish);
      if (!found) { const l = mk(g('probelight', () => new THREE.SphereGeometry(0.1, 8, 6)), lit('#FF3D5C', 2.5), 0.3, 1.25, 0.5); l.name = 'blink'; o.add(l); }
      o.add(mk(g('probescar', () => new THREE.CircleGeometry(2.2, 18).rotateX(-Math.PI / 2)), std('#2E2622'), 0, 0.03));
      break;
    }
    case 'monolith':
      o.add(mk(g('mono', () => new THREE.BoxGeometry(1.2, 5, 0.35)), std(dim('#15151C'), { metalness: 0.4, roughness: 0.15, flatShading: false }), 0, 2.5));
      if (!found) for (let i = 0; i < 4; i++) { const r = mk(g('monorune', () => new THREE.BoxGeometry(0.5, 0.08, 0.02)), lit('#7FE3FF', 2), 0, 1.5 + i * 0.7, 0.19); r.name = 'blink'; o.add(r); }
      break;
    case 'geode': {
      o.add(mk(g('geodeshell', () => new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)), std(dim('#7A6E66'), { side: THREE.DoubleSide }), 0, 0.2));
      for (let i = 0; i < 9; i++) { const c = mk(g('geodecrys', () => new THREE.OctahedronGeometry(0.28, 0).scale(1, 2.4, 1)), found ? std('#9A8FB0') : lit(i % 3 ? '#B57BFF' : '#7FE3FF', 0.9), Math.cos(i * 1.7) * 0.7, 1 + (i % 3) * 0.2, Math.sin(i * 1.7) * 0.7); c.rotation.z = Math.cos(i) * 0.5; c.rotation.x = Math.sin(i) * 0.5; o.add(c); }
      break;
    }
    case 'ruins':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, h = [3.5, 2.2, 3.8, 1.2, 3, 2.6][i];
        o.add(mk(g(`ruinp${h}`, () => new THREE.CylinderGeometry(0.35, 0.42, h, 8)), std(dim('#C9B99A')), Math.cos(a) * 3.2, h / 2, Math.sin(a) * 3.2));
      }
      { const lin = mk(g('ruinlintel', () => new THREE.BoxGeometry(3.6, 0.4, 0.7)), std(dim('#B8A888')), 1.6, 3.7, 1.4); lin.rotation.y = -0.7; o.add(lin); }
      o.add(mk(g('ruinfloor', () => new THREE.CylinderGeometry(3.8, 3.9, 0.2, 6)), std(dim('#A89878')), 0, 0.1));
      if (!found) { const glyph = mk(g('ruinglyph', () => new THREE.TorusGeometry(0.6, 0.08, 6, 20)), lit('#FFB13D', 1.5), 0, 1.4, 0); glyph.name = 'spin'; o.add(glyph); }
      break;
    case 'geyser': {
      o.add(mk(g('geymound', () => new THREE.ConeGeometry(1.8, 0.9, 12, 1, true)), std(dim('#9AA3AE'), { side: THREE.DoubleSide }), 0, 0.45));
      o.add(mk(g('geypool', () => new THREE.CircleGeometry(0.6, 14).rotateX(-Math.PI / 2)), lit('#7FD3FF', 0.4), 0, 0.85));
      const plume = mk(g('geyplume', () => new THREE.CylinderGeometry(0.25, 0.6, 6, 10, 1, true)), m('geyplume', () => new THREE.MeshBasicMaterial({ color: '#E9F7FF', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })), 0, 3.9);
      plume.name = 'gush'; o.add(plume);
      break;
    }
    case 'fossil': {
      const spine = mk(g('fspine', () => new THREE.TorusGeometry(1.8, 0.14, 6, 22, Math.PI * 1.3)), std(dim('#EDE3CC')), 0, 0.2); spine.rotation.x = -Math.PI / 2; o.add(spine);
      for (let i = 0; i < 9; i++) { const a = i * 0.45; const r = mk(g('frib', () => new THREE.TorusGeometry(0.5, 0.06, 5, 12, Math.PI)), std(dim('#EDE3CC')), Math.cos(a) * 1.8, 0.25, -Math.sin(a) * 1.8); r.rotation.y = a; o.add(r); }
      o.add(mk(g('fskull', () => new THREE.DodecahedronGeometry(0.5, 0).scale(1.4, 0.8, 1)), std(dim('#EDE3CC')), 1.9, 0.35, 0.3));
      break;
    }
    case 'cave':
      o.add(mk(g('cavemound', () => new THREE.SphereGeometry(3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1)), std(dim('#D6F1FF'), { roughness: 0.3 }), 0, 0));
      o.add(mk(g('cavemouth', () => new THREE.CircleGeometry(1.1, 16)), m('cavedark', () => new THREE.MeshBasicMaterial({ color: '#0A1A2A' })), 0, 0.9, 2.62));
      for (let i = 0; i < 5; i++) { const ic = mk(g('cicicle', () => new THREE.ConeGeometry(0.12, 0.6, 5).rotateX(Math.PI)), std('#E9FBFF', { roughness: 0.2 }), -0.8 + i * 0.4, 1.7, 2.45); o.add(ic); }
      if (!found) o.add(mk(g('caveglow', () => new THREE.SphereGeometry(0.4, 10, 8)), lit('#7FE3FF', 1.4), 0, 0.7, 1.8));
      break;
    default:
      o.add(mk(g('poibox', () => new THREE.BoxGeometry(1, 1, 1)), std('#999999'), 0, 0.5));
  }
  return o;
}

/** Spin, blink and gush the moving parts of finds. */
export function animateFinds(root: THREE.Object3D, t: number) {
  root.traverse((x) => {
    if (x.name === 'spin') x.rotation.y = t * 1.8;
    else if (x.name === 'blink') x.visible = Math.sin(t * 4 + x.position.y) > -0.3;
    else if (x.name === 'gush') { const k = 0.5 + 0.5 * Math.max(0, Math.sin(t * 0.9)); x.scale.set(1, 0.1 + k, 1); x.position.y = 0.9 + 3 * (0.1 + k); }
  });
}

/** Weather particles: a box of flakes/dust/drops round the camera, blown along. */
export function weatherParticles(kind: string, n: number) {
  const s = WEATHER[kind] ?? WEATHER.dust;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 70; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d')!; const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const mat = new THREE.PointsMaterial({ map: dot, alphaTest: 0.01, color: s.color, size: s.streak ? 0.18 : s.size, transparent: true, opacity: s.spark ? 0.95 : 0.75, depthWrite: false, blending: s.spark ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  // rain: draw each drop as a short streak as well
  let lines: THREE.LineSegments | null = null;
  if (s.streak) {
    const lp = new Float32Array(n * 6); const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.55, depthWrite: false })); lines.frustumCulled = false;
  }
  const step = (dt: number, t: number) => {
    const a = geo.getAttribute('position') as THREE.BufferAttribute; const p = a.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      p[k] += (s.wind + Math.sin(t * 0.7 + i) * 1.5) * dt;
      p[k + 1] -= s.fall * dt * (0.7 + ((i * 7) % 10) / 16);
      p[k + 2] += Math.cos(t * 0.5 + i * 0.3) * 1.2 * dt;
      if (p[k] > 35) p[k] -= 70; else if (p[k] < -35) p[k] += 70;
      if (p[k + 2] > 35) p[k + 2] -= 70; else if (p[k + 2] < -35) p[k + 2] += 70;
      if (p[k + 1] < 0) p[k + 1] += 30; else if (p[k + 1] > 30) p[k + 1] -= 30;
    }
    a.needsUpdate = true;
    if (lines) {
      const la = lines.geometry.getAttribute('position') as THREE.BufferAttribute; const l = la.array as Float32Array;
      for (let i = 0; i < n; i++) { const k = i * 3, j = i * 6; l[j] = p[k]; l[j + 1] = p[k + 1]; l[j + 2] = p[k + 2]; l[j + 3] = p[k] - s.wind * 0.03; l[j + 4] = p[k + 1] + 0.9; l[j + 5] = p[k + 2]; }
      la.needsUpdate = true;
    }
  };
  const group = new THREE.Group(); group.add(pts); if (lines) group.add(lines);
  const dispose = () => { geo.dispose(); mat.dispose(); dot.dispose(); if (lines) { lines.geometry.dispose(); (lines.material as THREE.Material).dispose(); } };
  return { group, step, dispose, style: s };
}
