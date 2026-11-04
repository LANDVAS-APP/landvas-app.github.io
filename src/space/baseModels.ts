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

/** How a piece looks: its main colour, accent colour, material and style variant. */
export type Look = { c?: string; c2?: string; m?: string; v?: number };
/** A material, in a colour. */
export function matFor(kind: string | undefined, color: string): THREE.Material {
  switch (kind) {
    case 'metal': return mat(`mm${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.45 }));
    case 'chrome': return mat(`mc${color}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25), roughness: 0.12, metalness: 0.7, emissive: color, emissiveIntensity: 0.18 }));
    case 'glass': return glass(color);
    case 'glow': return mat(`mg${color}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.4 }));
    case 'neon': return mat(`mn${color}`, () => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 2.6, roughness: 0.3 }));
    case 'wood': return mat(`mw${color}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#8A5A34'), 0.55), roughness: 0.92, flatShading: true }));
    case 'stone': return mat(`ms${color}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#8E8A80'), 0.4), roughness: 1, flatShading: true }));
    default: return solid(color);
  }
}

/** A module, centred on its footprint, facing +z, at its normal size. */
export function moduleModel(kind: string, color = '#F2F5FB', look: Look = {}): THREE.Object3D {
  const o = new THREE.Group();
  const M = matFor(look.m, color);
  const A = matFor(look.m === 'glass' ? 'metal' : look.m, look.c2 ?? '#59647D');
  const v = look.v ?? 0;
  const add = (geo: THREE.BufferGeometry, mm: THREE.Material, x = 0, y = 0, z = 0) => { const x2 = mesh(geo, mm, x, y, z); o.add(x2); return x2; };
  switch (kind) {
    // ---- free-form shapes: 1 m, scaled per axis by whoever places them --------------------------------
    case 'box': add(g('pbox', () => new THREE.BoxGeometry(1, 1, 1)), M, 0, 0.5); if (v === 1) add(g('pboxedge', () => new THREE.BoxGeometry(1.02, 0.08, 1.02)), A, 0, 0.98); break;
    case 'cyl': add(g('pcyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 28)), M, 0, 0.5); if (v === 1) add(g('pcylcap', () => new THREE.CylinderGeometry(0.52, 0.52, 0.08, 28)), A, 0, 0.98); break;
    case 'ball': add(g('pball', () => new THREE.SphereGeometry(0.5, 28, 18)), M, 0, 0.5); break;
    case 'cone': add(g('pcone', () => new THREE.ConeGeometry(0.5, 1, 28)), M, 0, 0.5); break;
    case 'panel': add(g('ppanel', () => new THREE.BoxGeometry(1, 1, 0.1)), M, 0, 0.5); if (v === 1) add(g('ppanelframe', () => new THREE.BoxGeometry(1.04, 0.06, 0.12)), A, 0, 0.98); break;
    case 'wedge': add(g('pwedge', () => { const sh = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(-0.5, 1)]); const x = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); x.translate(0, 0, -0.5); return x; }), M); break;
    case 'pyramid': add(g('ppyr', () => new THREE.ConeGeometry(0.707, 1, 4).rotateY(Math.PI / 4)), M, 0, 0.5); break;
    case 'torus': add(g('ptorus', () => new THREE.TorusGeometry(0.4, 0.1, 12, 36).rotateX(Math.PI / 2)), M, 0, 0.15); break;
    case 'arch': add(g('parch', () => new THREE.TorusGeometry(0.85, 0.2, 10, 24, Math.PI).scale(1, 1.2, 1.2)), M, 0, 0.1); break;
    case 'capsule': add(g('pcap', () => new THREE.CapsuleGeometry(0.45, 0.7, 8, 16)), M, 0, 0.8); break;
    // ---- structures -------------------------------------------------------------------------------
    case 'dome':
      add(g('dome', () => new THREE.SphereGeometry(1.9, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), v === 1 ? M : glass(color));
      add(g('domering', () => new THREE.CylinderGeometry(2, 2, 0.25, 28)), A, 0, 0.12);
      if (v !== 1) add(g('domein', () => new THREE.IcosahedronGeometry(0.6, 0)), green, -0.5, 0.6, 0.3);
      if (v === 2) for (let i = 0; i < 6; i++) { const r = add(g('domerib', () => new THREE.TorusGeometry(1.92, 0.04, 6, 24, Math.PI / 2)), A, 0, 0, 0); r.rotation.y = (i / 6) * Math.PI * 2; }
      break;
    case 'hab':
      add(g('hab', () => new THREE.CapsuleGeometry(1.1, 2.6, 6, 16).rotateX(Math.PI / 2)), M, 0, 1.2);
      for (let i = -1; i <= 1; i++) add(g('habwin', () => new THREE.BoxGeometry(0.05, 0.4, 0.6)), glow('#7EC8F5'), 1.1, 1.4, i * 1.1);
      add(g('hableg', () => new THREE.BoxGeometry(2.4, 0.25, 4)), A, 0, 0.12);
      if (v >= 1) add(g('habstripe', () => new THREE.BoxGeometry(2.26, 0.18, 4.6)), A, 0, 1.2);
      break;
    case 'tower': {
      const floors = 4;
      for (let i = 0; i < floors; i++) { add(g('twseg', () => new THREE.BoxGeometry(1.8, 1.8, 1.8)), M, 0, 0.9 + i * 1.85); add(g('twband', () => new THREE.BoxGeometry(1.86, 0.12, 1.86)), A, 0, 1.82 + i * 1.85); }
      for (let i = 0; i < floors; i++) for (const s2 of [-1, 1]) add(g('twwin', () => new THREE.BoxGeometry(0.06, 0.7, 1)), glow('#9FE3FF'), s2 * 0.91, 1 + i * 1.85);
      if (v === 1) add(g('twspire', () => new THREE.ConeGeometry(0.9, 2, 4).rotateY(Math.PI / 4)), A, 0, 8.4);
      else { add(g('twmast', () => new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6)), metal, 0, 8.2); add(g('twtip', () => new THREE.SphereGeometry(0.12, 8, 6)), glow('#FF5C8A'), 0, 9); }
      break;
    }
    case 'wall': add(g('wall', () => new THREE.BoxGeometry(2, 2.5, 0.3)), M, 0, 1.25); add(g('walltop', () => new THREE.BoxGeometry(2.04, 0.12, 0.36)), A, 0, 2.5); if (v === 1) add(g('wallstripe', () => new THREE.BoxGeometry(2.02, 0.2, 0.32)), A, 0, 1.2); break;
    case 'window': add(g('winbase', () => new THREE.BoxGeometry(2, 0.6, 0.3)), M, 0, 0.3); add(g('winpane', () => new THREE.BoxGeometry(1.9, 1.7, 0.08)), glass('#BFE3FF'), 0, 1.45); add(g('wintop', () => new THREE.BoxGeometry(2, 0.2, 0.3)), M, 0, 2.4); for (const x of [-0.95, 0, 0.95]) add(g('winbar', () => new THREE.BoxGeometry(0.08, 1.8, 0.12)), A, x, 1.45); break;
    case 'door': add(g('doorfr', () => new THREE.BoxGeometry(1.4, 2.4, 0.4)), A, 0, 1.2); add(g('doorpane', () => new THREE.BoxGeometry(1.1, 2.1, 0.42)), M, 0, 1.08); add(g('doorlight', () => new THREE.BoxGeometry(0.6, 0.08, 0.44)), glow('#7FE3FF'), 0, 2.25); break;
    case 'floor': add(g('floor', () => new THREE.BoxGeometry(2, 0.2, 2)), M, 0, 0.1); if (v === 1) add(g('floorline', () => new THREE.BoxGeometry(2.01, 0.21, 0.06)), A, 0, 0.1); break;
    case 'stairs': for (let i = 0; i < 6; i++) add(g('step', () => new THREE.BoxGeometry(1.4, 0.42, 0.5)), i % 2 && v === 1 ? A : M, 0, 0.21 + i * 0.42, 1.25 - i * 0.5).scale.y = 1; for (let i = 0; i < 6; i++) add(g('stepfill', () => new THREE.BoxGeometry(1.4, 1, 0.5)), M, 0, (i * 0.42) / 2, 1.25 - i * 0.5).scale.y = Math.max(0.01, i * 0.42); break;
    case 'pillar': add(g('pillar', () => new THREE.CylinderGeometry(0.25, 0.3, 3, 16)), M, 0, 1.5); add(g('pillarcap', () => new THREE.BoxGeometry(0.6, 0.15, 0.6)), A, 0, 3); add(g('pillarcap', () => new THREE.BoxGeometry(0.6, 0.15, 0.6)), A, 0, 0.07); break;
    case 'roof': add(g('roof', () => new THREE.CylinderGeometry(0.01, 2.12, 1.4, 4, 1).rotateY(Math.PI / 4)), M, 0, 0.7); if (v === 1) add(g('roofcap', () => new THREE.SphereGeometry(0.15, 8, 6)), A, 0, 1.4); break;
    case 'bridge': add(g('bridge', () => new THREE.BoxGeometry(1.6, 0.18, 6)), M, 0, 0.6); for (const x of [-0.75, 0.75]) { add(g('brail', () => new THREE.BoxGeometry(0.06, 0.06, 6)), A, x, 1.3); for (let i = -2; i <= 2; i++) add(g('bpost', () => new THREE.BoxGeometry(0.06, 0.7, 0.06)), A, x, 0.95, i * 1.4); } for (const z of [-2.6, 2.6]) add(g('bleg', () => new THREE.BoxGeometry(1.4, 0.6, 0.3)), A, 0, 0.3, z); break;
    case 'pad':
      add(g('pad', () => new THREE.CylinderGeometry(2.9, 2.95, 0.15, 36)), A, 0, 0.08);
      add(g('padring', () => new THREE.TorusGeometry(2.2, 0.08, 6, 40).rotateX(Math.PI / 2)), glow(color), 0, 0.17);
      add(g('padh1', () => new THREE.BoxGeometry(0.25, 0.04, 1.6)), glow(color), -0.5, 0.17); add(g('padh1', () => new THREE.BoxGeometry(0.25, 0.04, 1.6)), glow(color), 0.5, 0.17); add(g('padh2', () => new THREE.BoxGeometry(1, 0.04, 0.25)), glow(color), 0, 0.17);
      break;
    // ---- power ------------------------------------------------------------------------------------
    case 'solar': {
      const panel = add(g('solar', () => new THREE.BoxGeometry(1.9, 0.06, 2.9)), dark, 0, 1.1); panel.rotation.x = -0.4;
      add(g('solarframe', () => new THREE.BoxGeometry(1.95, 0.04, 2.95)), M, 0, 1.07).rotation.x = -0.4;
      add(g('pole1', () => new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6)), A, 0, 0.55);
      break;
    }
    case 'wind': {
      add(g('windmast', () => new THREE.CylinderGeometry(0.12, 0.2, 6, 10)), M, 0, 3);
      add(g('windhub', () => new THREE.BoxGeometry(0.4, 0.4, 0.8)), A, 0, 6.1);
      const rotor = new THREE.Group(); rotor.position.set(0, 6.1, 0.45); rotor.name = 'spin';
      for (let i = 0; i < 3; i++) { const b = mesh(g('windblade', () => new THREE.BoxGeometry(0.18, 1.9, 0.04)), M, 0, 0.95, 0); const arm = new THREE.Group(); arm.rotation.z = (i / 3) * Math.PI * 2; arm.add(b); rotor.add(arm); }
      o.add(rotor);
      break;
    }
    case 'battery': add(g('batt', () => new THREE.BoxGeometry(1.9, 1.2, 0.9)), M, 0, 0.6); for (let i = 0; i < 4; i++) add(g('battcell', () => new THREE.BoxGeometry(0.3, 0.7, 0.04)), glow('#4FD18B'), -0.66 + i * 0.44, 0.65, 0.46); add(g('batttop', () => new THREE.BoxGeometry(1.95, 0.1, 0.95)), A, 0, 1.25); break;
    case 'generator':
      add(g('genbase', () => new THREE.CylinderGeometry(1.4, 1.5, 0.6, 24)), A, 0, 0.3);
      add(g('gencore', () => new THREE.SphereGeometry(0.9, 24, 16)), glow(color === '#F2F5FB' ? '#7FE3FF' : color), 0, 1.6).name = 'pulse';
      add(g('genring', () => new THREE.TorusGeometry(1.2, 0.1, 8, 36)), M, 0, 1.6).name = 'spin';
      add(g('genring2', () => new THREE.TorusGeometry(1.25, 0.08, 8, 36).rotateX(Math.PI / 2)), M, 0, 1.6);
      for (let i = 0; i < 4; i++) add(g('genpost', () => new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8)), A, Math.cos((i / 4) * Math.PI * 2) * 1.3, 1.5, Math.sin((i / 4) * Math.PI * 2) * 1.3);
      break;
    // ---- production -------------------------------------------------------------------------------
    case 'rig':
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const leg = mesh(g('rigleg', () => new THREE.CylinderGeometry(0.08, 0.1, 4.4, 6)), M, Math.cos(a) * 0.9, 2.1, Math.sin(a) * 0.9); leg.lookAt(0, 6, 0); leg.rotateX(Math.PI / 2); o.add(leg); }
      add(g('rigbit', () => new THREE.CylinderGeometry(0.25, 0.05, 1.6, 8)), metal, 0, 1.2).name = 'spin';
      add(g('rigtop', () => new THREE.BoxGeometry(0.7, 0.5, 0.7)), A, 0, 4.1);
      break;
    case 'condenser':
      add(g('condtank', () => new THREE.CylinderGeometry(0.8, 0.8, 2.4, 20)), M, 0, 1.2);
      add(g('condtop', () => new THREE.SphereGeometry(0.8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), A, 0, 2.4);
      add(g('condglass', () => new THREE.CylinderGeometry(0.82, 0.82, 0.8, 20, 1, true)), glass('#BFEFFF'), 0, 1.3);
      add(g('condice', () => new THREE.IcosahedronGeometry(0.4, 0)), mat('ice', () => new THREE.MeshStandardMaterial({ color: '#CFF4FF', emissive: '#7FE3FF', emissiveIntensity: 0.4, flatShading: true })), 0, 1.3).name = 'spin';
      break;
    case 'greenhouse':
      add(g('gh', () => new THREE.BoxGeometry(2.9, 2.2, 2.9)), glass('#B8F5C4'), 0, 1.1);
      add(g('ghroof', () => new THREE.ConeGeometry(2.1, 0.9, 4).rotateY(Math.PI / 4)), glass(color), 0, 2.65);
      add(g('ghframe', () => new THREE.BoxGeometry(2.96, 0.1, 2.96)), A, 0, 2.2);
      for (let i = 0; i < 4; i++) add(g('ghplant', () => new THREE.IcosahedronGeometry(0.35, 0)), green, -0.8 + (i % 2) * 1.6, 0.4, -0.8 + Math.floor(i / 2) * 1.6);
      break;
    case 'refinery':
      add(g('refbody', () => new THREE.BoxGeometry(2.6, 2.2, 2.2)), M, 0, 1.1);
      for (const x of [-0.7, 0.7]) add(g('refstack', () => new THREE.CylinderGeometry(0.22, 0.28, 2, 12)), A, x, 3.1, -0.5);
      add(g('refpipe', () => new THREE.TorusGeometry(0.6, 0.1, 8, 16, Math.PI)), A, 0, 2.2, 0.8);
      add(g('refglow', () => new THREE.BoxGeometry(1.6, 0.3, 0.05)), glow('#FFB13D'), 0, 0.9, 1.12);
      break;
    case 'smelter':
      add(g('smbody', () => new THREE.CylinderGeometry(1.1, 1.4, 2.6, 16)), M, 0, 1.3);
      add(g('smmouth', () => new THREE.CircleGeometry(0.5, 16)), glow('#FF6A2A'), 0, 0.9, 1.3).name = 'pulse';
      add(g('smchim', () => new THREE.CylinderGeometry(0.25, 0.3, 1.4, 12)), A, 0.5, 3.2);
      add(g('smband', () => new THREE.TorusGeometry(1.25, 0.08, 6, 24).rotateX(Math.PI / 2)), A, 0, 1.6);
      break;
    case 'lab':
      add(g('labbody', () => new THREE.BoxGeometry(2.6, 1.8, 2.6)), M, 0, 0.9);
      add(g('labdome', () => new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), glass('#C9B8FF'), 0, 1.8);
      add(g('labgem', () => new THREE.OctahedronGeometry(0.35, 0)), glow('#B49BFF'), 0, 2.2).name = 'spin';
      add(g('labstrip', () => new THREE.BoxGeometry(2.66, 0.12, 2.66)), A, 0, 1.75);
      break;
    case 'market':
      add(g('mkbody', () => new THREE.BoxGeometry(2.8, 1.8, 1.8)), M, 0, 0.9);
      for (let i = 0; i < 7; i++) { const st = add(g('mkawn', () => new THREE.BoxGeometry(0.4, 0.08, 1)), i % 2 ? A : solid('#FFFFFF'), -1.2 + i * 0.4, 2.1, 1.1); st.rotation.x = 0.4; }
      add(g('mkcounter', () => new THREE.BoxGeometry(2.6, 0.9, 0.4)), A, 0, 0.45, 1.05);
      add(g('mksign', () => new THREE.BoxGeometry(1.6, 0.4, 0.05)), glow('#FFE36B'), 0, 2.6, 0.9);
      break;
    case 'crystalfarm':
      add(g('cfbed', () => new THREE.BoxGeometry(2.8, 0.4, 2.8)), A, 0, 0.2);
      for (let i = 0; i < 9; i++) { const c2 = add(g('cfcrys', () => new THREE.OctahedronGeometry(0.3, 0).scale(1, 2.2, 1)), matFor('glow', color === '#F2F5FB' ? '#B57BFF' : color), -0.9 + (i % 3) * 0.9, 0.9, -0.9 + Math.floor(i / 3) * 0.9); c2.rotation.y = i; }
      add(g('cfframe', () => new THREE.BoxGeometry(2.9, 0.08, 2.9)), M, 0, 2.4);
      for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) add(g('cfpost', () => new THREE.BoxGeometry(0.1, 2.4, 0.1)), M, x, 1.2, z);
      break;
    case 'plasmatap':
      add(g('ptbase', () => new THREE.CylinderGeometry(1.4, 1.5, 0.8, 20)), A, 0, 0.4);
      add(g('pttube', () => new THREE.CylinderGeometry(0.5, 0.5, 3.6, 16, 1, true)), glass('#FFB3E6'), 0, 2.6);
      add(g('ptcore', () => new THREE.CylinderGeometry(0.25, 0.25, 3.4, 12)), glow('#FF4DD8'), 0, 2.6).name = 'pulse';
      add(g('pttop', () => new THREE.CylinderGeometry(0.7, 0.6, 0.5, 16)), M, 0, 4.6);
      break;
    case 'depot':
      add(g('dpbody', () => new THREE.BoxGeometry(2.8, 2, 2.8)), M, 0, 1);
      add(g('dpdoor', () => new THREE.BoxGeometry(1.6, 1.5, 0.05)), A, 0, 0.75, 1.42);
      for (let i = 0; i < 3; i++) add(g('dpcrate', () => new THREE.BoxGeometry(0.6, 0.6, 0.6)), solid('#B07A4E'), -1.6 + i * 0.1, 0.3 + i * 0.6, 1.2);
      add(g('dproof', () => new THREE.BoxGeometry(3, 0.15, 3)), A, 0, 2.05);
      break;
    case 'antenna':
      add(g('ant', () => new THREE.CylinderGeometry(0.05, 0.08, 3, 6)), metal, 0, 1.5);
      add(g('dish', () => new THREE.ConeGeometry(0.6, 0.35, 16, 1, true).rotateX(Math.PI)), M, 0, 3.1).rotation.z = 0.5;
      add(g('anttip', () => new THREE.SphereGeometry(0.08, 8, 6)), glow('#FF5C8A'), 0, 3.2);
      break;
    // ---- decor ------------------------------------------------------------------------------------
    case 'lamp': add(g('lamppole', () => new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6)), A, 0, 1.1); add(g('lampbulb', () => new THREE.SphereGeometry(0.22, 12, 8)), glow(color === '#F2F5FB' ? '#FFE9A8' : color), 0, 2.3); break;
    case 'fence': add(g('fence', () => new THREE.BoxGeometry(1.9, 0.08, 0.08)), M, 0, 0.8); add(g('fence', () => new THREE.BoxGeometry(1.9, 0.08, 0.08)), M, 0, 0.4); add(g('fencepost', () => new THREE.BoxGeometry(0.1, 1, 0.1)), A, -0.9, 0.5); add(g('fencepost', () => new THREE.BoxGeometry(0.1, 1, 0.1)), A, 0.9, 0.5); break;
    case 'crate': add(g('crate', () => new THREE.BoxGeometry(0.9, 0.9, 0.9)), color === '#F2F5FB' && !look.m ? solid('#B07A4E') : M, 0, 0.45); add(g('crateb', () => new THREE.BoxGeometry(0.95, 0.12, 0.95)), A, 0, 0.45); break;
    case 'beacon': add(g('beacon', () => new THREE.ConeGeometry(0.35, 3.2, 4)), A, 0, 1.6); add(g('beacontop', () => new THREE.OctahedronGeometry(0.35, 0)), glow(color === '#F2F5FB' ? '#7FE3FF' : color), 0, 3.5).name = 'spin'; break;
    case 'garden':
      add(g('gardenbed', () => new THREE.BoxGeometry(1.9, 0.3, 1.9)), A === solid('#59647D') ? solid('#6B4A2E') : A, 0, 0.15);
      for (let i = 0; i < 5; i++) add(g('moss', () => new THREE.IcosahedronGeometry(0.3, 0)), mat(`moss${color}`, () => new THREE.MeshStandardMaterial({ color: color === '#F2F5FB' ? '#4FD18B' : color, flatShading: true })), -0.6 + (i % 3) * 0.6, 0.4, -0.5 + Math.floor(i / 3) * 0.9);
      break;
    case 'statue': add(g('pedestal', () => new THREE.BoxGeometry(0.8, 0.6, 0.8)), A, 0, 0.3); add(g('statue', () => new THREE.OctahedronGeometry(0.45, 0)), look.m ? M : mat(`st${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.2, flatShading: true })), 0, 1.15).scale.set(1, 1.5, 1); break;
    case 'flag': add(g('flagpole', () => new THREE.CylinderGeometry(0.04, 0.04, 3, 6)), A, 0, 1.5); add(g('flagcloth', () => new THREE.PlaneGeometry(1.1, 0.7)), mat(`fc${color}${look.m ?? ''}`, () => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, emissive: look.m === 'glow' || look.m === 'neon' ? color : '#000000', emissiveIntensity: look.m === 'neon' ? 2 : 0.8 })), 0.55, 2.6); break;
    case 'tree': {
      add(g('treetrunk', () => new THREE.CylinderGeometry(0.15, 0.25, 2.6, 8)), A === solid('#59647D') ? solid('#7A5233') : A, 0, 1.3);
      const leaf = matFor(look.m ?? 'matte', color === '#F2F5FB' ? '#5FD39A' : color);
      if (v === 1) for (let i = 0; i < 5; i++) { const f = add(g('palm', () => new THREE.ConeGeometry(0.25, 1.6, 4).rotateZ(Math.PI / 2).translate(0.8, 0, 0)), leaf, 0, 2.7, 0); f.rotation.y = (i / 5) * Math.PI * 2; f.rotation.z = -0.3; }
      else if (v === 2) { add(g('treeorb', () => new THREE.SphereGeometry(1, 16, 12)), leaf, 0, 3.1); }
      else { add(g('treecone', () => new THREE.IcosahedronGeometry(1.1, 0)), leaf, 0, 3); add(g('treecone2', () => new THREE.IcosahedronGeometry(0.7, 0)), leaf, 0.3, 3.8, 0.2); }
      break;
    }
    case 'shroom': add(g('shstem', () => new THREE.CylinderGeometry(0.12, 0.18, 1, 10)), solid('#F2EDE1'), 0, 0.5); add(g('shcap', () => new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), matFor(look.m ?? 'glow', color === '#F2F5FB' ? '#7FE3FF' : color), 0, 0.95); break;
    case 'rock': add(g('rock', () => new THREE.DodecahedronGeometry(0.75, 0).scale(1, 0.7, 1)), look.m ? M : matFor('stone', color), 0, 0.5); break;
    case 'crystals': for (let i = 0; i < 5; i++) { const c3 = add(g('crys', () => new THREE.OctahedronGeometry(0.22, 0).scale(1, 3, 1)), matFor(look.m ?? 'glow', color === '#F2F5FB' ? '#B57BFF' : color), Math.cos(i * 1.3) * 0.25, 0.6 + (i % 2) * 0.1, Math.sin(i * 1.3) * 0.25); c3.rotation.z = (i - 2) * 0.25; } break;
    case 'fountain': add(g('fnbase', () => new THREE.CylinderGeometry(1, 1.05, 0.5, 24)), M, 0, 0.25); add(g('fnwater', () => new THREE.CylinderGeometry(0.9, 0.9, 0.06, 24)), glass('#7FD3FF'), 0, 0.48); add(g('fnmid', () => new THREE.CylinderGeometry(0.12, 0.18, 1, 10)), A, 0, 0.9); add(g('fnbowl', () => new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), A, 0, 1.45); break;
    case 'bench': add(g('bseat', () => new THREE.BoxGeometry(1.6, 0.1, 0.5)), M, 0, 0.45); add(g('bback', () => new THREE.BoxGeometry(1.6, 0.4, 0.08)), M, 0, 0.75, -0.22); for (const x of [-0.7, 0.7]) add(g('bleg2', () => new THREE.BoxGeometry(0.08, 0.45, 0.45)), A, x, 0.22); break;
    case 'dish': add(g('dishbase', () => new THREE.CylinderGeometry(0.3, 0.5, 1.2, 12)), A, 0, 0.6); { const d = add(g('dishbowl', () => new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3)), M, 0, 1.9); d.rotation.x = -0.8; d.name = 'spin'; } break;
    case 'telescope': add(g('tsleg', () => new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6)), A, 0, 0.7); { const t2 = add(g('tstube', () => new THREE.CylinderGeometry(0.15, 0.22, 1.6, 14)), M, 0, 1.6); t2.rotation.x = -0.9; } break;
    case 'rocket':
      add(g('rkbody', () => new THREE.CylinderGeometry(0.45, 0.45, 3.4, 18)), M, 0, 2.1);
      add(g('rknose', () => new THREE.ConeGeometry(0.45, 1.2, 18)), A, 0, 4.4);
      for (let i = 0; i < 3; i++) { const f = add(g('rkfin', () => new THREE.BoxGeometry(0.08, 0.8, 0.6)), A, Math.cos((i / 3) * Math.PI * 2) * 0.5, 0.7, Math.sin((i / 3) * Math.PI * 2) * 0.5); f.rotation.y = -(i / 3) * Math.PI * 2; }
      add(g('rkwin', () => new THREE.CircleGeometry(0.18, 16)), glow('#9FE3FF'), 0, 3, 0.46);
      break;
    case 'sign': add(g('signpole', () => new THREE.BoxGeometry(0.1, 1, 0.1)), A, -0.8, 0.5); add(g('signpole', () => new THREE.BoxGeometry(0.1, 1, 0.1)), A, 0.8, 0.5); add(g('signboard', () => new THREE.BoxGeometry(2, 0.6, 0.1)), matFor(look.m ?? 'glow', color), 0, 1.25); break;
    case 'teleporter':
      add(g('tpbase', () => new THREE.CylinderGeometry(1, 1.1, 0.25, 28)), A, 0, 0.12);
      for (let i = 0; i < 3; i++) add(g('tpring', () => new THREE.TorusGeometry(0.85, 0.05, 8, 32).rotateX(Math.PI / 2)), matFor('neon', color === '#F2F5FB' ? '#7FE3FF' : color), 0, 0.6 + i * 0.8).name = 'spin';
      add(g('tpbeam', () => new THREE.CylinderGeometry(0.7, 0.7, 2.8, 20, 1, true)), mat('tpbeam', () => new THREE.MeshBasicMaterial({ color: '#7FE3FF', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })), 0, 1.5);
      break;
    default:
      add(g('box', () => new THREE.BoxGeometry(1, 1, 1)), M, 0, 0.5);
  }
  return o;
}

/** A placed piece: turned to its angle (degrees, or old quarter turns), lifted to its height, at its size. */
export function placedModel(m: { k: string; c?: string; c2?: string; m?: string; v?: number; a?: number; r?: number; z?: number; sx?: number; sy?: number; sz?: number }): THREE.Object3D {
  const inner = moduleModel(m.k, m.c ?? '#F2F5FB', { c2: m.c2, m: m.m, v: m.v });
  inner.scale.set(m.sx ?? 1, m.sy ?? 1, m.sz ?? 1);
  inner.position.y = m.z ?? 0;
  const turn = new THREE.Group();
  turn.rotation.y = -(((m.a ?? (m.r ?? 0) * 90) * Math.PI) / 180);
  turn.add(inner);
  return turn;
}
/** Moving parts (rotors, drills, glowing cores) to animate: call every frame. */
export function animateModels(root: THREE.Object3D, t: number) {
  root.traverse((x) => { if (x.name === 'spin') x.rotation.y = t * 1.5; else if (x.name === 'pulse') x.scale.setScalar(1 + Math.sin(t * 3) * 0.06); });
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
