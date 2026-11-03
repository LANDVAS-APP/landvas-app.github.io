// 3D models for base modules, built from simple shapes (metres; y up, on the ground at y = 0).
import * as THREE from 'three';

const geoCache = new Map<string, THREE.BufferGeometry>();
const g = (key: string, make: () => THREE.BufferGeometry) => { let x = geoCache.get(key); if (!x) { x = make(); geoCache.set(key, x); } return x; };
const matCache = new Map<string, THREE.Material>();
const mat = (key: string, make: () => THREE.Material) => { let x = matCache.get(key); if (!x) { x = make(); matCache.set(key, x); } return x; };
const solid = (c: string) => mat(`s${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.15 }));
const glass = (c: string) => mat(`g${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
const glow = (c: string) => mat(`e${c}`, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4 }));
const metal = mat('metal', () => new THREE.MeshStandardMaterial({ color: '#8E97AD', roughness: 0.4, metalness: 0.6 }));
const dark = mat('dark', () => new THREE.MeshStandardMaterial({ color: '#1B2A5E', roughness: 0.3, metalness: 0.5 }));
const green = mat('green', () => new THREE.MeshStandardMaterial({ color: '#4FA552', roughness: 0.9, flatShading: true }));
const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };

/** A module, centred on its footprint, facing +z. */
export function moduleModel(kind: string, color = '#F2F5FB'): THREE.Object3D {
  const o = new THREE.Group();
  switch (kind) {
    case 'dome':
      o.add(mesh(g('dome', () => new THREE.SphereGeometry(1.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), glass(color)));
      o.add(mesh(g('domering', () => new THREE.CylinderGeometry(2, 2, 0.25, 24)), solid(color), 0, 0.12));
      o.add(mesh(g('domein', () => new THREE.IcosahedronGeometry(0.6, 0)), green, -0.5, 0.6, 0.3));
      break;
    case 'hab':
      o.add(mesh(g('hab', () => new THREE.CapsuleGeometry(1.1, 2.6, 6, 14).rotateX(Math.PI / 2)), solid(color), 0, 1.2));
      for (let i = -1; i <= 1; i++) o.add(mesh(g('habwin', () => new THREE.BoxGeometry(0.05, 0.4, 0.6)), glow('#7EC8F5'), 1.1, 1.4, i * 1.1));
      o.add(mesh(g('hableg', () => new THREE.BoxGeometry(2.4, 0.25, 4)), metal, 0, 0.12));
      break;
    case 'solar': {
      const panel = mesh(g('solar', () => new THREE.BoxGeometry(1.9, 0.06, 2.9)), dark, 0, 1.1);
      panel.rotation.x = -0.4; o.add(panel);
      o.add(mesh(g('solarframe', () => new THREE.BoxGeometry(1.95, 0.04, 2.95)), solid(color), 0, 1.07)).rotation.x = -0.4;
      o.add(mesh(g('pole1', () => new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6)), metal, 0, 0.55));
      break;
    }
    case 'greenhouse':
      o.add(mesh(g('gh', () => new THREE.BoxGeometry(2.9, 2.2, 2.9)), glass('#B8F5C4'), 0, 1.1));
      o.add(mesh(g('ghroof', () => new THREE.ConeGeometry(2.1, 0.9, 4).rotateY(Math.PI / 4)), glass(color), 0, 2.65));
      for (let i = 0; i < 4; i++) o.add(mesh(g('ghplant', () => new THREE.IcosahedronGeometry(0.35, 0)), green, -0.8 + (i % 2) * 1.6, 0.4, -0.8 + Math.floor(i / 2) * 1.6));
      break;
    case 'antenna':
      o.add(mesh(g('ant', () => new THREE.CylinderGeometry(0.05, 0.08, 3, 6)), metal, 0, 1.5));
      o.add(mesh(g('dish', () => new THREE.ConeGeometry(0.6, 0.35, 16, 1, true).rotateX(Math.PI)), solid(color), 0, 3.1)).rotation.z = 0.5;
      o.add(mesh(g('anttip', () => new THREE.SphereGeometry(0.08, 8, 6)), glow('#FF5C8A'), 0, 3.2));
      break;
    case 'pad':
      o.add(mesh(g('pad', () => new THREE.CylinderGeometry(2.9, 2.95, 0.15, 32)), solid('#59647D'), 0, 0.08));
      o.add(mesh(g('padring', () => new THREE.TorusGeometry(2.2, 0.08, 6, 40).rotateX(Math.PI / 2)), glow(color), 0, 0.17));
      o.add(mesh(g('padh1', () => new THREE.BoxGeometry(0.25, 0.04, 1.6)), glow(color), -0.5, 0.17));
      o.add(mesh(g('padh1', () => new THREE.BoxGeometry(0.25, 0.04, 1.6)), glow(color), 0.5, 0.17));
      o.add(mesh(g('padh2', () => new THREE.BoxGeometry(1, 0.04, 0.25)), glow(color), 0, 0.17));
      break;
    case 'lamp':
      o.add(mesh(g('lamppole', () => new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6)), metal, 0, 1.1));
      o.add(mesh(g('lampbulb', () => new THREE.SphereGeometry(0.22, 12, 8)), glow(color === '#F2F5FB' ? '#FFE9A8' : color), 0, 2.3));
      break;
    case 'fence':
      o.add(mesh(g('fence', () => new THREE.BoxGeometry(1.9, 0.08, 0.08)), solid(color), 0, 0.8));
      o.add(mesh(g('fence', () => new THREE.BoxGeometry(1.9, 0.08, 0.08)), solid(color), 0, 0.4));
      o.add(mesh(g('fencepost', () => new THREE.BoxGeometry(0.1, 1, 0.1)), metal, -0.9, 0.5));
      o.add(mesh(g('fencepost', () => new THREE.BoxGeometry(0.1, 1, 0.1)), metal, 0.9, 0.5));
      break;
    case 'crate':
      o.add(mesh(g('crate', () => new THREE.BoxGeometry(0.9, 0.9, 0.9)), solid(color === '#F2F5FB' ? '#B07A4E' : color), 0, 0.45));
      o.add(mesh(g('crateb', () => new THREE.BoxGeometry(0.95, 0.12, 0.95)), metal, 0, 0.45));
      break;
    case 'rig':
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const leg = mesh(g('rigleg', () => new THREE.CylinderGeometry(0.08, 0.1, 4.4, 6)), solid(color), Math.cos(a) * 0.9, 2.1, Math.sin(a) * 0.9); leg.lookAt(0, 6, 0); leg.rotateX(Math.PI / 2); o.add(leg); }
      o.add(mesh(g('rigbit', () => new THREE.CylinderGeometry(0.25, 0.05, 1.6, 8)), metal, 0, 1.2));
      o.add(mesh(g('rigtop', () => new THREE.BoxGeometry(0.7, 0.5, 0.7)), solid('#FFB13D'), 0, 4.1));
      break;
    case 'beacon':
      o.add(mesh(g('beacon', () => new THREE.ConeGeometry(0.35, 3.2, 4)), solid('#59647D'), 0, 1.6));
      o.add(mesh(g('beacontop', () => new THREE.OctahedronGeometry(0.35, 0)), glow(color === '#F2F5FB' ? '#7FE3FF' : color), 0, 3.5));
      break;
    case 'garden':
      o.add(mesh(g('gardenbed', () => new THREE.BoxGeometry(1.9, 0.3, 1.9)), solid('#6B4A2E'), 0, 0.15));
      for (let i = 0; i < 5; i++) o.add(mesh(g('moss', () => new THREE.IcosahedronGeometry(0.3, 0)), mat(`moss${color}`, () => new THREE.MeshStandardMaterial({ color: color === '#F2F5FB' ? '#4FD18B' : color, flatShading: true })), -0.6 + (i % 3) * 0.6, 0.4, -0.5 + Math.floor(i / 3) * 0.9));
      break;
    case 'statue':
      o.add(mesh(g('pedestal', () => new THREE.BoxGeometry(0.8, 0.6, 0.8)), solid('#C9CCD6'), 0, 0.3));
      o.add(mesh(g('statue', () => new THREE.OctahedronGeometry(0.45, 0)), mat(`st${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.2, flatShading: true })), 0, 1.15)).scale.set(1, 1.5, 1);
      break;
    case 'flag':
      o.add(mesh(g('flagpole', () => new THREE.CylinderGeometry(0.04, 0.04, 3, 6)), metal, 0, 1.5));
      o.add(mesh(g('flagcloth', () => new THREE.PlaneGeometry(1.1, 0.7)), mat(`fc${color}`, () => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })), 0.55, 2.6));
      break;
    default:
      o.add(mesh(g('box', () => new THREE.BoxGeometry(1, 1, 1)), solid(color), 0, 0.5));
  }
  return o;
}

/** A rover, facing +z, wheels on the ground at y = 0. The driver sits at about y = 1. */
export function roverModel(kind: string, color = '#FFC93D'): THREE.Object3D {
  const o = new THREE.Group();
  const wheel = g('rwheel', () => new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14).rotateZ(Math.PI / 2));
  const tyre = mat('tyre', () => new THREE.MeshStandardMaterial({ color: '#2A2E38', roughness: 0.9 }));
  if (kind === 'hover') {
    o.add(mesh(g('hdisc', () => new THREE.CylinderGeometry(1.5, 1.8, 0.35, 24)), solid(color), 0, 0.75));
    o.add(mesh(g('hring', () => new THREE.TorusGeometry(1.6, 0.09, 8, 32).rotateX(Math.PI / 2)), glow('#7EF0FF'), 0, 0.5));
    o.add(mesh(g('hglow', () => new THREE.CylinderGeometry(1.1, 0.4, 0.4, 20)), glow('#B49BFF'), 0, 0.3));
    o.add(mesh(g('hcan', () => new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), glass('#BFE3FF'), 0, 0.92));
  } else if (kind === 'crawler') {
    o.add(mesh(g('cbody', () => new THREE.BoxGeometry(2.3, 0.8, 3.4)), solid(color), 0, 0.95));
    o.add(mesh(g('ccab', () => new THREE.BoxGeometry(1.8, 0.8, 1.4)), glass('#BFE3FF'), 0, 1.7, 0.6));
    for (const s of [-1, 1]) {
      o.add(mesh(g('ctrack', () => new THREE.BoxGeometry(0.55, 0.7, 3.8)), tyre, s * 1.35, 0.35));
      for (const z of [-1.3, 0, 1.3]) o.add(mesh(wheel, metal, s * 1.35, 0.42, z));
    }
    o.add(mesh(g('cant', () => new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5)), metal, -0.8, 2.3, -1.2));
    o.add(mesh(g('clight', () => new THREE.BoxGeometry(1.4, 0.18, 0.08)), glow('#FFF3B0'), 0, 1.15, 1.72));
  } else {
    o.add(mesh(g('bbase', () => new THREE.BoxGeometry(1.7, 0.3, 2.8)), metal, 0, 0.55));
    o.add(mesh(g('bbody', () => new THREE.BoxGeometry(1.5, 0.45, 1.6)), solid(color), 0, 0.85, -0.4));
    o.add(mesh(g('bbar', () => new THREE.TorusGeometry(0.75, 0.06, 6, 16, Math.PI)), metal, 0, 1.0, 0.3));
    o.add(mesh(g('bdish', () => new THREE.ConeGeometry(0.35, 0.2, 12, 1, true).rotateX(Math.PI)), solid('#F2F5FB'), 0.6, 1.5, -1.0));
    o.add(mesh(g('blight', () => new THREE.BoxGeometry(1.1, 0.14, 0.08)), glow('#FFF3B0'), 0, 0.6, 1.42));
    for (const s of [-1, 1]) for (const z of [-1, 1]) o.add(mesh(wheel, tyre, s * 0.98, 0.42, z * 1.05));
  }
  return o;
}
