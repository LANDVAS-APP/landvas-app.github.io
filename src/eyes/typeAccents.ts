// Each plot type, standing in first person: the plots near you carry a little 3D piece of their type in a corner —
// graphite's giant pencils, pigment's tipped paint pot and its splash, mosaic's raised tiles, lumina's neon ring
// turning, fresco's broken plaster wall with its painting, stencil's cut-out star and spray can, prism's floating
// prism throwing a rainbow, glass's standing panes. One instanced mesh per type (so a whole street of them is a
// handful of draws); what turns and bobs is turned by the graphics chip.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from './builds';

export const ACCENT_TYPES = ['graphite', 'pigment', 'mosaic', 'lumina', 'fresco', 'stencil', 'prism', 'glass'] as const;
type Spin = { at: [number, number, number]; speed: number; bob: number };

/** a type's piece, in the plot's own units (its square is 0…1 across, its top at y = 0); `spin` marks what turns */
function piece(type: string, k: Kit, spin: (s: Spin, fill: (w: Kit) => void) => void) {
  // (in the far corner of the plot, out of the way of its painting and of you walking across it)
  const cx = 0.8, cz = 0.8;
  switch (type) {
    case 'graphite': {
      // two giant pencils leaning on each other
      for (const [dx, a, body] of [[-0.04, 0.45, '#5C6680'], [0.05, -0.38, '#B9C3D8']] as const) {
        k.cyl(0.032, 0.032, 0.42, cx + dx, 0, cz, body, { seg: 6, rz: a }).cone(0.032, 0.07, cx + dx - Math.sin(a) * 0.42, Math.cos(a) * 0.42, cz, '#E8C99A', { seg: 6, rz: a })
          .cone(0.011, 0.026, cx + dx - Math.sin(a) * 0.49, Math.cos(a) * 0.49, cz, '#232838', { seg: 6, rz: a })
          .cyl(0.034, 0.034, 0.04, cx + dx, 0, cz, '#ff9fb2', { seg: 6, rz: a });
      }
      for (let i = 0; i < 5; i++) k.box(0.05, 0.004, 0.012, cx - 0.12 + i * 0.05, 0.002, cz - 0.1 - (i % 2) * 0.03, '#232838', { ry: i * 0.6 });
      break;
    }
    case 'pigment': {
      // a paint pot tipped over, its paint splashed out; a brush
      k.cyl(0.06, 0.07, 0.11, cx + 0.06, 0.06, cz + 0.02, '#E8ECFF', { seg: 12, rz: 1.35 }).cyl(0.055, 0.055, 0.005, cx - 0.0, 0.06, cz + 0.02, '#FF5470', { seg: 12, rz: 1.35 });
      k.ball(0.13, cx - 0.1, 0, cz, '#FF5470', { seg: 12, sy: 0.08 }).ball(0.06, cx - 0.22, 0, cz + 0.08, '#FFB23F', { seg: 10, sy: 0.1 }).ball(0.035, cx - 0.17, 0, cz - 0.1, '#FF5470', { seg: 8, sy: 0.12 });
      k.cyl(0.01, 0.012, 0.22, cx + 0.02, 0.01, cz - 0.12, '#8a5a2e', { seg: 5, rz: 1.5, ry: 0.4 }).box(0.03, 0.02, 0.05, cx - 0.09, 0.01, cz - 0.16, '#FFB23F', { ry: 0.4 });
      break;
    }
    case 'mosaic': {
      // tiles rising out of the plot
      const cols = ['#22C7B5', '#FFD43B', '#F5F4EF'];
      for (let i = 0; i < 7; i++) {
        const x = cx - 0.12 + (i % 3) * 0.085, z = cz - 0.1 + Math.floor(i / 3) * 0.085, h = 0.03 + ((i * 37) % 7) * 0.025;
        k.box(0.075, h, 0.075, x, 0, z, cols[i % 3]);
      }
      break;
    }
    case 'lumina': {
      // a neon ring standing on its edge, turning
      k.cyl(0.05, 0.06, 0.03, cx, 0, cz, '#170F3D', { seg: 10 });
      spin({ at: [cx, 0.17, cz], speed: 0.9, bob: 0 }, (w) => {
        w.ring(0.13, 0.012, 0, 0, 0, '#8B5CFF', { glow: true, seg: 28 }).ring(0.09, 0.009, 0, 0, 0, '#22E3FF', { glow: true, seg: 24, ry: Math.PI / 2 });
      });
      break;
    }
    case 'fresco': {
      // a piece of plaster wall with its painting, broken along the top
      k.box(0.32, 0.22, 0.045, cx - 0.05, 0, cz + 0.05, '#EADCC8', { ry: -0.5 });
      k.box(0.24, 0.13, 0.01, cx - 0.05 + Math.sin(-0.5) * 0.03, 0.05, cz + 0.05 + Math.cos(-0.5) * 0.03, '#FF8A5B', { ry: -0.5 });
      k.box(0.1, 0.06, 0.012, cx - 0.09 + Math.sin(-0.5) * 0.035, 0.07, cz + 0.07 + Math.cos(-0.5) * 0.035, '#FFD6A5', { ry: -0.5 });
      for (let i = 0; i < 4; i++) k.box(0.05, 0.03 + (i % 2) * 0.03, 0.045, cx - 0.17 + i * 0.07, 0.22, cz + 0.12 - i * 0.04, '#EADCC8', { ry: -0.5 });
      for (let i = 0; i < 4; i++) k.box(0.03, 0.02, 0.03, cx - 0.2 + i * 0.09, 0, cz - 0.08, '#d9cbb0', { ry: i });
      break;
    }
    case 'stencil': {
      // a cut-out star on a stand, and the spray can that painted it
      k.box(0.012, 0.16, 0.012, cx, 0, cz, '#3a3f4a');
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; k.cone(0.03, 0.08, cx + Math.cos(a) * 0.02, 0.24 + Math.sin(a) * 0.02, cz, '#FF4FD8', { seg: 3, rz: a - Math.PI / 2, sz: 0.25 }); }
      k.ball(0.03, cx, 0.24, cz, '#FF4FD8', { seg: 8, sz: 0.3 });
      k.cyl(0.025, 0.025, 0.1, cx - 0.12, 0, cz + 0.05, '#7CF56B', { seg: 10 }).dome(0.025, cx - 0.12, 0.1, cz + 0.05, '#e8ecf5').box(0.012, 0.012, 0.012, cx - 0.12, 0.125, cz + 0.05, '#1E0B2E');
      break;
    }
    case 'prism': {
      // a prism floating and turning, a rainbow on the ground beside it
      spin({ at: [cx, 0.22, cz], speed: 0.6, bob: 0.03 }, (w) => {
        w.cone(0.07, 0.16, 0, -0.08, 0, '#5EE6C7', { glow: true, seg: 3 }).cone(0.07, 0.08, 0, -0.08, 0, '#B49BFF', { glow: true, seg: 3, rx: Math.PI });
      });
      const rb = ['#ff4d6d', '#ff9f1c', '#ffe14d', '#3ddc97', '#22c7ff', '#5b6cff', '#b46bff'];
      rb.forEach((c, i) => k.box(0.3, 0.003, 0.016, cx - 0.2, 0.001, cz - 0.06 + i * 0.017, c, { glow: true, ry: 0.25 }));
      break;
    }
    case 'glass': {
      // standing panes of glass in a slim frame
      for (const [dx, a] of [[-0.06, 0.4], [0.07, -0.3]] as const) {
        k.box(0.16, 0.24, 0.008, cx + dx, 0.01, cz, '#8FD8FF', { ry: a, glow: true }).box(0.17, 0.012, 0.015, cx + dx, 0, cz, '#E3F6FF', { ry: a }).box(0.17, 0.012, 0.015, cx + dx, 0.25, cz, '#E3F6FF', { ry: a });
      }
      break;
    }
  }
}

/** a type's piece as one geometry (solid and glowing parts together; the glow marked per vertex) */
function pieceGeometry(type: string) {
  const parts: THREE.BufferGeometry[] = [];
  const add = (list: THREE.BufferGeometry[], glow: number, sp: Spin | null) => {
    for (const g of list) {
      const n = (g.attributes.position as THREE.BufferAttribute).count;
      const G = new Float32Array(n).fill(glow), P = new Float32Array(n * 3), A = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { P[i * 3] = sp?.at[0] ?? 0; P[i * 3 + 1] = sp?.at[1] ?? 0; P[i * 3 + 2] = sp?.at[2] ?? 0; A[i * 2] = sp?.speed ?? 0; A[i * 2 + 1] = sp?.bob ?? 0; }
      g.setAttribute('aGlow', new THREE.BufferAttribute(G, 1));
      g.setAttribute('aPivot', new THREE.BufferAttribute(P, 3));
      g.setAttribute('aSpin', new THREE.BufferAttribute(A, 2));
      parts.push(g);
    }
  };
  const k = new Kit(new THREE.Matrix4());
  piece(type, k, (sp, fill) => {
    const w = new Kit(new THREE.Matrix4().makeTranslation(sp.at[0], sp.at[1], sp.at[2]));
    fill(w);
    add(w.solid, 0, sp); add(w.glow, 1, sp);
  });
  add(k.solid, 0, null); add(k.glow, 1, null);
  if (!parts.length) return null;
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

export function createTypeAccents(near: THREE.Scene, opts: { phone: boolean }) {
  const group = new THREE.Group();
  group.userData.layer = 'plots';
  near.add(group);
  const uTime = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow; attribute vec3 aPivot; attribute vec2 aSpin; uniform float uTime; varying float vGlow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlow = aGlow;
        if (aSpin.x != 0.0 || aSpin.y != 0.0) {
          float ph = 0.0;
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71;
          #endif
          float a = uTime * aSpin.x + ph;
          vec3 d = transformed - aPivot;
          transformed = aPivot + vec3(d.x * cos(a) + d.z * sin(a), d.y, -d.x * sin(a) + d.z * cos(a));
          transformed.y += sin(uTime * 1.3 + ph) * aSpin.y;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vGlow * 0.9;');
  };
  mat.customProgramCacheKey = () => 'lv-type-accents';
  const geos = new Map<string, THREE.BufferGeometry>();
  const meshes = new Map<string, THREE.InstancedMesh>();
  const R = opts.phone ? 90 : 130, MAX = opts.phone ? 160 : 360;
  let at: { x: number; z: number } | null = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();

  /** the plots near you (nearest first, a few hundred at most) carry their pieces */
  const set = (plots: { x: number; z: number; ps: number; y: number; type: string | null | undefined }[], here: { x: number; z: number }) => {
    at = { x: here.x, z: here.z };
    const near2 = plots.filter((pl) => pl.type && Math.abs(pl.x - here.x) < R && Math.abs(pl.z - here.z) < R)
      .map((pl) => ({ pl, d: Math.hypot(pl.x - here.x, pl.z - here.z) })).filter((x) => x.d < R).sort((a, b) => a.d - b.d).slice(0, MAX);
    const by = new Map<string, typeof near2>();
    for (const x of near2) (by.get(x.pl.type!) ?? by.set(x.pl.type!, []).get(x.pl.type!)!).push(x);
    for (const t of ACCENT_TYPES) {
      const list = by.get(t) ?? [];
      let m = meshes.get(t);
      if (!list.length) { if (m) m.count = 0; continue; }
      if (!m || m.instanceMatrix.count < list.length) {
        if (m) { group.remove(m); m.dispose(); }
        let g = geos.get(t);
        if (!g) { g = pieceGeometry(t) ?? new THREE.BufferGeometry(); geos.set(t, g); }
        m = new THREE.InstancedMesh(g, mat, Math.max(16, Math.ceil(list.length * 1.4)));
        m.receiveShadow = true;
        meshes.set(t, m);
        group.add(m);
      }
      m.count = list.length;
      list.forEach(({ pl }, i) => { m!.setMatrixAt(i, m4.compose(p.set(pl.x - pl.ps / 2, pl.y, pl.z - pl.ps / 2), q.identity(), s.setScalar(pl.ps))); });
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, list.length * 16); m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  };
  return {
    set,
    /** where the pieces were last chosen round (to choose again once you've moved on a way) */
    at: () => at,
    update: (t: number) => { uTime.value = t; },
    counts: () => { let n = 0; for (const m of meshes.values()) n += m.count; return n; },
    dispose: () => { for (const m of meshes.values()) m.dispose(); for (const g of geos.values()) g.dispose(); mat.dispose(); near.remove(group); },
  };
}
