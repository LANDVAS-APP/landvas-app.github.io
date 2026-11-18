// A star in 3D: its burning core (or a black hole's dark heart and the light it bends), and its shell of plots — the
// claimed ones solid panels wearing the star's skin (owners' colours and paintings), the rest an open lattice the
// light pours through. Used by the preview (seen from outside, turning) and the shell you walk on (seen from inside).
import * as THREE from 'three';
import { CLASS_BY_ID, type StarClassId } from './galaxy';
import { cellCenter, patch, type Cell, type V3 } from './goldberg';
import { shellCells } from './skin';

const NOISE = /* glsl */ `
  float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.07 + 11.3; a *= 0.5; } return s; }`;

export function glowSprite(color: string, size: number) {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(0.6, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  s.userData.dispose = () => { tex.dispose(); s.material.dispose(); };
  return s;
}

export type Core = { group: THREE.Group; update(t: number): void; dispose(): void; light: THREE.PointLight };
/** the star itself at the centre */
export function makeCore(cls: StarClassId, radius: number, opts: { binary?: boolean; /** the halo round it (× its radius) */ glow?: number; /** how bright its face is */ exposure?: number } = {}): Core {
  const C = CLASS_BY_ID[cls] ?? CLASS_BY_ID.yellow;
  const group = new THREE.Group();
  const U = { uT: { value: 0 }, uA: { value: new THREE.Color(C.color) }, uB: { value: new THREE.Color(C.glow) }, uHole: { value: cls === 'black_hole' ? 1 : 0 }, uK: { value: opts.exposure ?? 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main() { vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uT, uHole, uK; uniform vec3 uA, uB; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main() {
        vec3 d = normalize(vP);
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        if (uHole > 0.5) { gl_FragColor = vec4(uB * pow(rim, 6.0) * 1.6, 1.0); return; }
        float g = fbm3(d * 6.0 + vec3(uT * 0.05, uT * 0.03, 0.0));
        float cells = fbm3(d * 18.0 - uT * 0.08);
        vec3 col = mix(uA * 0.85, uB * 1.35, g) * (0.85 + 0.3 * cells);
        col += uB * pow(rim, 2.5) * 0.9;
        gl_FragColor = vec4(col * uK, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.SphereGeometry(radius, 64, 32);
  const core = new THREE.Mesh(geo, mat);
  group.add(core);
  const glow = glowSprite(C.glow, radius * (opts.glow ?? (cls === 'black_hole' ? 3.2 : 5.5)));
  group.add(glow);
  let disk: THREE.Mesh | null = null, beams: THREE.Mesh | null = null, twin: THREE.Mesh | null = null;
  if (cls === 'black_hole') {
    // the accretion disk, glowing hot, and the ring of bent light round the hole
    const dm = new THREE.ShaderMaterial({ uniforms: U, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uT; uniform vec3 uB; varying vec2 vU; ${NOISE}
        void main() { vec2 p = vU * 2.0 - 1.0; float r = length(p); if (r < 0.32 || r > 1.0) discard; float a = atan(p.y, p.x);
          float sw = fbm3(vec3(a * 3.0 + uT * 0.6 / r, r * 8.0, 0.0)); float k = smoothstep(1.0, 0.4, r) * smoothstep(0.32, 0.42, r);
          gl_FragColor = vec4(mix(uB, vec3(1.0, 0.95, 0.8), smoothstep(0.6, 0.35, r)) * k * (0.5 + sw), k); }` });
    disk = new THREE.Mesh(new THREE.PlaneGeometry(radius * 7, radius * 7), dm);
    disk.rotation.x = -Math.PI / 2 + 0.22;
    group.add(disk);
  }
  if (cls === 'neutron') {
    // the pulsar's beams, sweeping round
    const bm = new THREE.MeshBasicMaterial({ color: '#BFEFFF', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    beams = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.6, radius * 40, 24, 1, true).translate(0, radius * 20, 0), bm);
    const b2 = beams.clone(); b2.rotation.z = Math.PI; beams.add(b2);
    beams.rotation.z = 0.5;
    group.add(beams);
  }
  if (opts.binary) {
    twin = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 32, 16), mat);
    group.add(twin);
  }
  const light = new THREE.PointLight(C.glow, cls === 'black_hole' ? 0.6 : 2.4, 0, 0);
  group.add(light);
  return {
    group, light,
    update(t: number) {
      U.uT.value = t;
      if (beams) beams.rotation.y = t * 2.4;
      if (disk) disk.rotation.z = t * 0.05;
      if (twin) { const a = t * 0.35; twin.position.set(Math.cos(a) * radius * 2.2, Math.sin(a * 0.7) * radius * 0.3, Math.sin(a) * radius * 2.2); }
      glow.material.opacity = 0.85 + 0.15 * Math.sin(t * 1.7);
    },
    dispose() {
      geo.dispose(); mat.dispose(); (glow.userData.dispose as () => void)();
      if (disk) { disk.geometry.dispose(); (disk.material as THREE.Material).dispose(); }
      if (beams) { beams.geometry.dispose(); (beams.material as THREE.Material).dispose(); }
      if (twin) twin.geometry.dispose();
    },
  };
}

export type ShellOpts = { inside?: boolean; claimed: Map<number, { color: string; mine: boolean; keystone: boolean; kind: string }>; skin: THREE.Texture | null;
  /** only the plots near this direction (the biggest stars): null for all */ near?: { dir: V3; reach: number } | null };
export type Shell = { group: THREE.Group; cells: Cell[]; cellMesh: Map<number, number>; setSkin(t: THREE.Texture | null): void; dispose(): void; update(t: number): void;
  /** a sharper skin of just the part of the star round you (u0, v0, du, dv of the flat map), over the whole one */
  setNear(t: THREE.Texture | null, rect: [number, number, number, number] | null): void;
  /** light up a plot (the one you're looking at) */ highlight(id: number | null): void };

/**
 * The shell: every plot (or those near a direction) as a panel. A claimed plot is a solid panel (its face samples the
 * star's skin by direction); an open one is a thin frame of light. `inside`: seen from within (the faces point in).
 */
export function makeShell(m: number, radius: number, o: ShellOpts): Shell {
  const cells = (o.near ? patch(m, o.near.dir, o.near.reach) : shellCells(m) ?? patch(m, [0, 0, 1], Math.PI));
  const group = new THREE.Group();
  const U = { uSkin: { value: o.skin }, uHas: { value: o.skin ? 1 : 0 }, uT: { value: 0 }, uIn: { value: o.inside ? 1 : 0 }, uHi: { value: -1 },
    uNear: { value: null as THREE.Texture | null }, uHasNear: { value: 0 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) } };
  // claimed panels: one mesh (each panel a fan of triangles), per-vertex: its plot's colour and id, and whether it's yours
  const pos: number[] = [], col: number[] = [], ids: number[] = [], edge: number[] = [], mineA: number[] = [];
  const lp: number[] = [], lc: number[] = [];
  // the open plots: a faint glass you can see the stars through (lit up when it's the one you're looking at)
  const op: number[] = [], oi: number[] = [];
  const cellMesh = new Map<number, number>();
  const tmpC = new THREE.Color();
  const inset = 0.94;
  for (const c of cells) {
    const cl = o.claimed.get(c.id);
    const n = c.corners.length;
    const cc = c.c;
    if (cl) {
      tmpC.set(cl.color);
      cellMesh.set(c.id, pos.length / 9);
      for (let i = 0; i < n; i++) {
        const a = c.corners[i], b = c.corners[(i + 1) % n];
        const A: V3 = [cc[0] + (a[0] - cc[0]) * inset, cc[1] + (a[1] - cc[1]) * inset, cc[2] + (a[2] - cc[2]) * inset];
        const B: V3 = [cc[0] + (b[0] - cc[0]) * inset, cc[1] + (b[1] - cc[1]) * inset, cc[2] + (b[2] - cc[2]) * inset];
        const tri = o.inside ? [cc, B, A] : [cc, A, B];
        for (const [k, v] of tri.entries()) {
          pos.push(v[0] * radius, v[1] * radius, v[2] * radius);
          col.push(tmpC.r, tmpC.g, tmpC.b);
          ids.push(c.id);
          edge.push(k === 0 ? 0 : 1);
          mineA.push(cl.mine ? 1 : 0);
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const a = c.corners[i], b = c.corners[(i + 1) % n];
        for (const v of [cc, a, b]) { op.push(v[0] * radius, v[1] * radius, v[2] * radius); oi.push(c.id); }
      }
    }
    // the frame round every plot (bright cyan round your own, gold round Keystones)
    const fc = cl ? (cl.mine ? new THREE.Color('#5CF2FF') : new THREE.Color(cl.color).multiplyScalar(1.2)) : c.keystone ? new THREE.Color('#FFD23F') : new THREE.Color('#7FA8FF');
    const k = cl ? (cl.mine ? 1.25 : 0.9) : c.keystone ? 0.8 : 0.32;
    for (let i = 0; i < n; i++) {
      const a = c.corners[i], b = c.corners[(i + 1) % n];
      lp.push(a[0] * radius, a[1] * radius, a[2] * radius, b[0] * radius, b[1] * radius, b[2] * radius);
      lc.push(fc.r * k, fc.g * k, fc.b * k, fc.r * k, fc.g * k, fc.b * k);
    }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  pg.setAttribute('aId', new THREE.Float32BufferAttribute(ids, 1));
  pg.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  pg.setAttribute('aMine', new THREE.Float32BufferAttribute(mineA, 1));
  pg.computeVertexNormals();
  const pm = new THREE.ShaderMaterial({
    uniforms: U, vertexColors: true, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute float aId; attribute float aEdge; attribute float aMine; varying vec3 vP; varying vec3 vC; varying float vE; varying float vId; varying float vMine;
      void main() { vP = position; vC = color; vE = aEdge; vId = aId; vMine = aMine; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uSkin; uniform sampler2D uNear; uniform float uHas, uHasNear, uT, uIn, uHi; uniform vec4 uRect;
      varying vec3 vP; varying vec3 vC; varying float vE; varying float vId; varying float vMine;
      void main() { vec3 d = normalize(vP); vec2 uv = vec2(atan(d.x, d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        vec4 sk = uHas > 0.5 ? texture2D(uSkin, uv) : vec4(0.0);
        // (the sharper skin of the part round you, where it reaches)
        if (uHasNear > 0.5) { vec2 q = vec2(fract(uv.x - uRect.x) / uRect.z, (uv.y - uRect.y) / uRect.w);
          if (q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0) { vec4 sn = texture2D(uNear, q); sk = vec4(mix(sk.rgb * sk.a, sn.rgb, sn.a), max(sk.a, sn.a)); if (sk.a > 0.0) sk.rgb /= max(sk.a, 1e-3); } }
        vec3 c = mix(vC, sk.rgb, sk.a);
        float hi = abs(vId - uHi) < 0.5 ? 0.35 + 0.25 * sin(uT * 6.0) : 0.0;
        c = c * (0.78 + 0.22 * (1.0 - vE)) + hi;
        // (yours: a cyan glow round its rim, breathing)
        c += vec3(0.25, 0.9, 1.0) * vMine * smoothstep(0.55, 1.0, vE) * (0.22 + 0.12 * sin(uT * 2.4));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const panels = new THREE.Mesh(pg, pm);
  group.add(panels);
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.Float32BufferAttribute(op, 3));
  og.setAttribute('aId', new THREE.Float32BufferAttribute(oi, 1));
  const om = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `attribute float aId; varying float vId; void main() { vId = aId; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uT, uHi, uIn; varying float vId;
      void main() { float hi = abs(vId - uHi) < 0.5 ? 0.22 + 0.1 * sin(uT * 6.0) : 0.0; gl_FragColor = vec4(vec3(0.36, 0.52, 1.0) * ((uIn > 0.5 ? 0.012 : 0.008) + hi), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const glass = new THREE.Mesh(og, om);
  glass.renderOrder = 1;
  group.add(glass);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  const lm = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(lg, lm);
  group.add(lines);
  return {
    group, cells, cellMesh,
    setSkin(t) { U.uSkin.value = t; U.uHas.value = t ? 1 : 0; },
    setNear(t, rect) { U.uNear.value = t; U.uHasNear.value = t && rect ? 1 : 0; if (rect) U.uRect.value.set(rect[0], rect[1], rect[2], rect[3]); },
    update(t) { U.uT.value = t; },
    highlight(id) { U.uHi.value = id ?? -1; },
    dispose() { pg.dispose(); pm.dispose(); og.dispose(); om.dispose(); lg.dispose(); lm.dispose(); },
  };
}

/** where a plot's centre is on a shell of this radius */
export const cellPoint = (m: number, id: number, radius: number): THREE.Vector3 => { const c = cellCenter(m, id); return new THREE.Vector3(c[0] * radius, c[1] * radius, c[2] * radius); };

/**
 * Pins over plots (yours, on a shell you walk): a dot of light with a star in it, the same size on screen however far
 * (so you can spot your plots from across the shell). `lift`: how far toward the star's centre they float.
 */
export function makePins(dirs: V3[], radius: number, lift: number, color = '#5CF2FF', px = 30) {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.55)'); rg.addColorStop(0.62, 'rgba(255,255,255,0.18)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff'; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 11 : 26; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fillStyle = '#0B1230'; g.fill();
  const tex = new THREE.CanvasTexture(c);
  const p = new Float32Array(dirs.length * 3);
  dirs.forEach((d, i) => p.set([d[0] * (radius - lift), d[1] * (radius - lift), d[2] * (radius - lift)], i * 3));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ map: tex, color, size: px, sizeAttenuation: false, transparent: true, depthWrite: false, alphaTest: 0.02 });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  return {
    obj: pts,
    update(t: number, dpr: number) { mat.size = px * dpr * (1 + 0.12 * Math.sin(t * 2.6)); },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
