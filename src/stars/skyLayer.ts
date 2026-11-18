// The stars in Explorer's Eyes' sky, as Skywright sees them:
//  * the ~5,000 real stars at their real places (instead of the scattered filler the sky had before);
//  * as you zoom (pinch, the telescope), each zoom tier's generated stars fade in — only the tiles in view are made;
//  * a claimed star wears a halo in its colour (the paintings' colour once it's painted), its ring as full as the star;
//  * zoomed in far enough on a claimed star, it's a disc: the star itself, turning, its plots and paintings on it.
// Everything sits in the sky's equatorial frame (the group the sky matrix turns), so it rises and sets with the sky.
import * as THREE from 'three';
import { TIERS, loadCatalog, realStar, starById, tilesInCone, tileStars, tierFade, type RealCatalog, type Star } from './galaxy';

type V3 = [number, number, number];
export type SkyClaim = { id: number; claimed: number; cells: number; painted: boolean; color: string | null; art_rev: number; name: string | null; lit?: number; nova?: boolean };
/** how much bigger a claimed star's point is: lit (each time ×1.35) and a supernova (×4) */
const boostOf = (c: SkyClaim | undefined) => (c ? (1 + 0.35 * (c.lit ?? 0)) * (c.nova ? 4 : 1) : 1);
export type SkyStars = ReturnType<typeof createSkyStars>;

const R = 101_000; // (the sky's radius the other stars are drawn at is ~SKY_R·0.92)
const MAX_GEN = 7000;
const hexRgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const CLASS_RGB: Record<string, [number, number, number]> = {
  neutron: hexRgb('#CFEFFF'), white_dwarf: hexRgb('#EEF4FF'), red_dwarf: hexRgb('#FFB08A'), orange: hexRgb('#FFD2A1'), yellow: hexRgb('#FFF4D6'), white: hexRgb('#F4F7FF'),
  blue: hexRgb('#CFE0FF'), red_giant: hexRgb('#FFB08A'), supergiant: hexRgb('#FFF0D0'), hypergiant: hexRgb('#FFFFFF'), black_hole: hexRgb('#FFC98A'),
};

/** a disc's angular diameter (radians) for a star of a tier: you see it as a disc once you've zoomed a couple of tiers past it */
export const discAngle = (tier: number) => (0.3 * Math.PI / 180) * (tier === 0 ? 1 : TIERS[tier].fov / 180);

export function createSkyStars(group: THREE.Group, opts: { phone: boolean; px: () => number }) {
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };
  const U = { uVis: { value: 0 }, uPx: { value: opts.px() }, uTime: { value: 0 }, uFovK: { value: 1 } };
  const pointMat = T(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `attribute float aSize; attribute vec3 aColor; attribute float aFade; uniform float uVis, uPx, uTime, uFovK; varying vec3 vColor; varying float vA;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vec3 d = normalize(wp.xyz - cameraPosition);
        float up = smoothstep(-0.005, 0.05, d.y); float tw = 0.85 + 0.15 * sin(uTime * 2.3 + position.x * 0.0017 + position.y * 0.0023);
        vA = up * uVis * tw * aFade; vColor = aColor; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99984; gl_PointSize = aSize * uPx * uFovK; }`,
    fragmentShader: /* glsl */ `varying vec3 vColor; varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.04, d); if (vA * a < 0.003) discard; gl_FragColor = vec4(vColor * a * vA, 1.0);
      #include <colorspace_fragment>
    }`,
  }));
  const makePoints = (n: number) => {
    const g = T(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    g.setDrawRange(0, 0);
    const p = new THREE.Points(g, pointMat);
    p.frustumCulled = false;
    group.add(p);
    return p;
  };
  // ---- the real stars ------------------------------------------------------------------------------------------------
  let cat: RealCatalog | null = null;
  let real: Star[] = [];
  const realPts = makePoints(5100);
  const realIdx = new Map<number, number>();
  const realSize: number[] = [];
  const sizeOf = (mag: number) => Math.max(1.1, Math.min(9, 6.2 - mag * 0.95));
  const kOf = (mag: number) => Math.max(0.16, Math.min(1.8, 1.4 - mag * 0.21));
  void loadCatalog().then((c) => {
    cat = c;
    real = c.stars.map((r) => realStar(r, c));
    const P = realPts.geometry.attributes.position as THREE.BufferAttribute, S = realPts.geometry.attributes.aSize as THREE.BufferAttribute, C = realPts.geometry.attributes.aColor as THREE.BufferAttribute;
    real.forEach((s, i) => {
      P.setXYZ(i, s.dir[0] * R, s.dir[1] * R, s.dir[2] * R);
      realIdx.set(s.id, i); realSize[i] = sizeOf(s.mag);
      S.setX(i, sizeOf(s.mag) * boostOf(claims.get(s.id)));
      const c0 = CLASS_RGB[s.cls] ?? [1, 1, 1], k = kOf(s.mag);
      C.setXYZ(i, c0[0] * k, c0[1] * k, c0[2] * k);
    });
    P.needsUpdate = S.needsUpdate = C.needsUpdate = true;
    realPts.geometry.setDrawRange(0, real.length);
    byId.clear();
    for (const s of real) byId.set(s.id, s);
  });

  // ---- the generated stars of the tiers in view ------------------------------------------------------------------------
  const genPts = makePoints(MAX_GEN);
  let gen: Star[] = [];
  const byId = new Map<number, Star>();
  let lastKey = '';
  /** what's on show: the view (equatorial direction and width) the generated stars were made for */
  const rebuild = (c: V3, fovDeg: number, aspect: number, reach: number) => {
    const half = Math.min(Math.PI / 2, ((fovDeg * Math.max(1, aspect)) / 2) * Math.PI / 180 * 1.25);
    const list: Star[] = [];
    for (let t = 1; t <= reach; t++) {
      const f = tierFade(t, fovDeg);
      if (f <= 0) continue;
      // (a tier a good way finer than the view isn't drawn at all yet: too many tiles, and too faint to matter)
      const tiles = tilesInCone(t, c, half, 1800);
      for (const [face, i, j] of tiles) for (const s of tileStars(t, face, i, j)) { list.push(s); if (list.length >= MAX_GEN) break; }
      if (list.length >= MAX_GEN) break;
    }
    gen = list;
    const P = genPts.geometry.attributes.position as THREE.BufferAttribute, S = genPts.geometry.attributes.aSize as THREE.BufferAttribute;
    const C = genPts.geometry.attributes.aColor as THREE.BufferAttribute, F = genPts.geometry.attributes.aFade as THREE.BufferAttribute;
    for (const [id, s] of byId) if (s.tier > 0) byId.delete(id);
    list.forEach((s, i) => {
      P.setXYZ(i, s.dir[0] * R, s.dir[1] * R, s.dir[2] * R);
      const Tt = TIERS[s.tier];
      const rel = (Tt.magHi - s.mag) / (Tt.magHi - Tt.magLo);
      S.setX(i, (1.3 + rel * 3.4) * boostOf(claims.get(s.id)));
      const c0 = CLASS_RGB[s.cls] ?? [1, 1, 1], k = 0.45 + rel * 0.9;
      C.setXYZ(i, c0[0] * k, c0[1] * k, c0[2] * k);
      F.setX(i, tierFade(s.tier, fovDeg));
      byId.set(s.id, s);
    });
    P.needsUpdate = S.needsUpdate = C.needsUpdate = F.needsUpdate = true;
    genPts.geometry.setDrawRange(0, list.length);
  };

  // ---- claimed stars: a halo, and up close a disc -----------------------------------------------------------------------
  const claims = new Map<number, SkyClaim>();
  const ringTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 18, 64, 64, 62);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.55, 'rgba(255,255,255,0.0)'); r.addColorStop(0.7, 'rgba(255,255,255,0.95)'); r.addColorStop(0.82, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return T(new THREE.CanvasTexture(c));
  })();
  const halos = new THREE.Group();
  group.add(halos);
  const haloOf = new Map<number, THREE.Sprite>();
  type Disc = { id: number; mesh: THREE.Mesh; tex: THREE.Texture | null; rev: number };
  const discs = new Map<number, Disc>();
  const discGeo = T(new THREE.SphereGeometry(1, 48, 24));
  const discMat = (col: string, base: [number, number, number], tex: THREE.Texture | null) => new THREE.ShaderMaterial({
    uniforms: { uSkin: { value: tex }, uHas: { value: tex ? 1 : 0 }, uCol: { value: new THREE.Color(col) }, uBase: { value: new THREE.Color(base[0], base[1], base[2]) }, uSpin: { value: 0 } },
    fog: false, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vL; void main() { vL = position; vN = normalize(mat3(modelMatrix) * normal); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p; gl_Position.z = gl_Position.w * 0.99982; }`,
    fragmentShader: /* glsl */ `uniform sampler2D uSkin; uniform float uHas, uSpin; uniform vec3 uCol, uBase; varying vec3 vN; varying vec3 vL;
      void main() { vec3 d = normalize(vL); float c = cos(uSpin), s = sin(uSpin); vec3 q = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
        vec2 uv = vec2(atan(q.x, q.z) / 6.2831853 + 0.5, asin(clamp(q.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        vec4 sk = uHas > 0.5 ? texture2D(uSkin, uv) : vec4(0.0);
        // (a ball, not a coin: its own light at the middle, darker toward its edge, a rim in its claimers' colour)
        float mu = abs(dot(normalize(vN), normalize(cameraPosition)));
        vec3 col = mix(uBase * 1.15, sk.rgb, sk.a) * (0.5 + 0.5 * mu) + uCol * pow(1.0 - mu, 3.0) * 0.5;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const setClaims = (list: SkyClaim[]) => {
    for (const c of list) claims.set(c.id, c);
    // (lit stars and supernovae: their points grow)
    {
      const S = realPts.geometry.attributes.aSize as THREE.BufferAttribute, G = genPts.geometry.attributes.aSize as THREE.BufferAttribute;
      let touched = false, touchedG = false;
      for (const c of list) {
        if (!c.lit && !c.nova) continue;
        const ri = realIdx.get(c.id);
        if (ri != null) { S.setX(ri, realSize[ri] * boostOf(c)); touched = true; }
        const gi = gen.findIndex((x) => x.id === c.id);
        if (gi >= 0) { const st = gen[gi], Tt = TIERS[st.tier]; const rel = (Tt.magHi - st.mag) / (Tt.magHi - Tt.magLo); G.setX(gi, (1.3 + rel * 3.4) * boostOf(c)); touchedG = true; }
      }
      if (touched) S.needsUpdate = true;
      if (touchedG) G.needsUpdate = true;
    }
    for (const c of list) {
      const s = byId.get(c.id);
      let sp = haloOf.get(c.id);
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        sp.renderOrder = 2;
        halos.add(sp);
        haloOf.set(c.id, sp);
      }
      sp.material.color.set(c.nova ? '#FFF6E0' : c.color || '#22E3FF');
      if (s) sp.position.set(s.dir[0] * R * 0.999, s.dir[1] * R * 0.999, s.dir[2] * R * 0.999);
      sp.userData.k = Math.max(0.25, c.claimed / Math.max(1, c.cells)) * (1 + 0.25 * (c.lit ?? 0)) * (c.nova ? 3 : 1);
      sp.userData.id = c.id;
    }
  };
  /** a claimed star's look up close (its paintings, turning): the caller makes the skin (src/stars/skin.ts) */
  const setSkin = (id: number, canvas: HTMLCanvasElement | null, rev: number) => {
    const d = discs.get(id);
    if (d && d.rev === rev && d.tex) return;
    if (d) { d.tex?.dispose(); d.tex = null; }
    const tex = canvas ? new THREE.CanvasTexture(canvas) : null;
    if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; }
    if (d) { (d.mesh.material as THREE.ShaderMaterial).uniforms.uSkin.value = tex; (d.mesh.material as THREE.ShaderMaterial).uniforms.uHas.value = tex ? 1 : 0; d.tex = tex; d.rev = rev; return; }
    const c = claims.get(id);
    const st = byId.get(id) ?? starById(id, cat);
    const mesh = new THREE.Mesh(discGeo, discMat(c?.color || '#FFE7A0', CLASS_RGB[st?.cls ?? 'yellow'] ?? [1, 0.95, 0.85], tex));
    mesh.visible = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    discs.set(id, { id, mesh, tex, rev });
  };

  let vis = 0;
  let reachTier = 3;
  let lastC: V3 = [0, 0, 1];
  const tmp = new THREE.Vector3();
  return {
    /** each frame: the view (equatorial centre, width, aspect), how dark it is, and how deep this player's telescope reaches */
    update(c: V3, fovDeg: number, aspect: number, night: number, t: number, reach: number) {
      vis = night;
      lastC = c;
      U.uVis.value = night;
      U.uTime.value = t;
      U.uPx.value = opts.px();
      // (zoomed in, the stars you can see are bigger and brighter: the telescope gathers more light)
      U.uFovK.value = fovDeg < 20 ? Math.min(1.8, 1 + Math.log2(20 / fovDeg) * 0.08) : 1;
      reachTier = reach;
      const key = `${Math.round(c[0] * 60)}:${Math.round(c[1] * 60)}:${Math.round(c[2] * 60)}:${Math.round(Math.log(fovDeg) * 6)}:${reach}`;
      // (re-made when the view's moved a good part of its width, or zoomed a step)
      if (key !== lastKey && fovDeg < 30) {
        const moved = (() => { const p = lastKey.split(':').map(Number); if (p.length < 4) return true; const d = Math.hypot(p[0] / 60 - c[0], p[1] / 60 - c[1], p[2] / 60 - c[2]); return d > (fovDeg * Math.PI / 180) * 0.25 || Math.round(Math.log(fovDeg) * 6) !== p[3] || p[4] !== reach; })();
        if (moved) { lastKey = key; rebuild(c, fovDeg, aspect, reach); }
      } else if (fovDeg >= 30 && gen.length) { gen = []; genPts.geometry.setDrawRange(0, 0); lastKey = ''; for (const [id, s] of byId) if (s.tier > 0) byId.delete(id); }
      // halos: sized so they stand out at any zoom, brighter at night
      const fovR = fovDeg * Math.PI / 180;
      for (const [id, sp] of haloOf) {
        const s = byId.get(id);
        sp.visible = !!s && night > 0.05;
        if (!s) continue;
        sp.position.set(s.dir[0] * R * 0.999, s.dir[1] * R * 0.999, s.dir[2] * R * 0.999);
        const k = sp.userData.k as number;
        sp.scale.setScalar(R * Math.tan(fovR * 0.018) * (1 + k * 0.6));
        sp.material.opacity = Math.min(1, night * 1.2) * (0.45 + 0.55 * k);
        sp.material.rotation = t * 0.2;
      }
      // discs: a claimed star bigger than a few pixels on screen is drawn as itself
      for (const d of discs.values()) {
        const s = byId.get(d.id);
        const ang = s ? discAngle(s.tier) : 0;
        const show = !!s && ang / fovR > 0.012 && night > 0.02;
        d.mesh.visible = show;
        if (!show || !s) continue;
        const r = R * 0.998 * Math.tan(ang / 2);
        d.mesh.position.set(s.dir[0] * R * 0.998, s.dir[1] * R * 0.998, s.dir[2] * R * 0.998);
        d.mesh.scale.setScalar(r);
        // (it turns once in its own day)
        (d.mesh.material as THREE.ShaderMaterial).uniforms.uSpin.value = (Date.now() / 3600_000 / s.spinH) * Math.PI * 2;
      }
    },
    /** the star nearest a direction (equatorial), within a tolerance (radians): what was tapped */
    pick(d: V3, tol: number): Star | null {
      if (vis < 0.05) return null;
      let best: Star | null = null, bestA = tol;
      const consider = (s: Star, bias: number) => {
        const a = Math.acos(Math.max(-1, Math.min(1, s.dir[0] * d[0] + s.dir[1] * d[1] + s.dir[2] * d[2]))) - bias;
        if (a < bestA) { bestA = a; best = s; }
      };
      for (const s of real) consider(s, claims.has(s.id) ? tol * 0.4 : Math.max(0, 3 - s.mag) * tol * 0.05);
      for (const s of gen) consider(s, claims.has(s.id) ? tol * 0.4 : 0);
      return best;
    },
    /** the star with this id, if it's on show */
    star: (id: number) => byId.get(id) ?? null,
    catalog: () => cat,
    /** the ids on show (generated tiers), for asking which are claimed */
    shownIds: () => gen.map((s) => ({ id: s.id, d: s.dir[0] * lastC[0] + s.dir[1] * lastC[1] + s.dir[2] * lastC[2] })).sort((a, b) => b.d - a.d).map((x) => x.id),
    /** the claimed stars on show (nearest the view's centre first), for their skins up close */
    claimedShown: (): number[] => {
      const out: { id: number; a: number }[] = [];
      for (const id of claims.keys()) { const s = byId.get(id); if (s) out.push({ id, a: -(s.dir[0] * lastC[0] + s.dir[1] * lastC[1] + s.dir[2] * lastC[2]) }); }
      return out.sort((x, y) => x.a - y.a).map((x) => x.id);
    },
    setClaims,
    setSkin,
    claimOf: (id: number) => claims.get(id) ?? null,
    /** where a star is in the world (for tests: tapping it on screen), if it's on show */
    worldPos: (id: number, out: THREE.Vector3): THREE.Vector3 | null => {
      const s = byId.get(id) ?? starById(id, cat);
      if (!s) return null;
      group.updateMatrixWorld();
      return group.localToWorld(out.set(s.dir[0] * R, s.dir[1] * R, s.dir[2] * R));
    },
    /** where a star is in the group's frame (for the Starbeam Lens: its light comes from there) */
    dirOf: (id: number): V3 | null => byId.get(id)?.dir ?? null,
    counts: () => ({ real: real.length, gen: gen.length, claims: claims.size, discs: [...discs.values()].filter((x) => x.mesh.visible).length, reach: reachTier }),
    /** hide the old scattered stars once the real ones are in */
    realReady: () => real.length > 0,
    tmp,
    dispose() {
      for (const sp of haloOf.values()) sp.material.dispose();
      for (const d of discs.values()) { d.tex?.dispose(); (d.mesh.material as THREE.Material).dispose(); }
      group.remove(realPts, genPts, halos);
      for (const d of discs.values()) group.remove(d.mesh);
      for (const x of own) x.dispose();
    },
  };
}
