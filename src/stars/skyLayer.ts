// The stars in Explorer's Eyes' sky, as Skywright sees them:
//  * the ~5,000 real stars at their real places (instead of the scattered filler the sky had before);
//  * as you zoom (pinch, the telescope), each zoom tier's generated stars fade in — only the tiles in view are made;
//  * every star has a size on the sky (galaxy.ts starDiam: nearer is bigger, giants bigger than dwarfs), so zooming in
//    magnifies them: a star that's a point at one zoom is a ball a few zooms on, and the stars beyond show round it.
//    The nearest stars are balls even to the naked eye;
//  * a claimed star wears a halo in its colour (the paintings' colour once it's painted), its ring as full as the star,
//    and once its shell (bigger than the bare star) is a few pixels across it's a disc: the star itself, turning, its
//    plots and paintings on it — near ones even to the naked eye;
//  * your own stars are always marked: a cyan ring and their name under them, at any zoom, wherever they are.
// Everything sits in the sky's equatorial frame (the group the sky matrix turns), so it rises and sets with the sky.
import * as THREE from 'three';
import { SKY_DEFAULTS, TIERS, loadCatalog, realStar, shellDiam, starById, starDiam, tilesInCone, tileStars, tierFade, type RealCatalog, type SkySizes, type Star } from './galaxy';

type V3 = [number, number, number];
export type SkyClaim = { id: number; claimed: number; cells: number; painted: boolean; color: string | null; art_rev: number; name: string | null; lit?: number; nova?: boolean; mine?: boolean };
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

export function createSkyStars(group: THREE.Group, opts: { phone: boolean; px: () => number; /** the view's height in device pixels */ viewH: () => number; /** the biggest point the GPU draws */ maxPoint?: number }) {
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };
  let sizes: Required<SkySizes> = { ...SKY_DEFAULTS };
  const U = { uVis: { value: 0 }, uPx: { value: opts.px() }, uTime: { value: 0 }, uFovK: { value: 1 }, uPxPerRad: { value: 1000 }, uMaxPx: { value: Math.min(opts.maxPoint ?? 256, 400) }, uPointK: { value: sizes.point_k } };
  const pointMat = T(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `attribute float aSize; attribute vec3 aColor; attribute float aFade; attribute float aAng;
      uniform float uVis, uPx, uTime, uFovK, uPxPerRad, uMaxPx, uPointK; varying vec3 vColor; varying float vA; varying float vBall;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vec3 d = normalize(wp.xyz - cameraPosition);
        float up = smoothstep(-0.005, 0.05, d.y); float tw = 0.85 + 0.15 * sin(uTime * 2.3 + position.x * 0.0017 + position.y * 0.0023);
        // a point of light at its brightness, or (zoomed in past it) a ball its own size on the sky — the ball fills 72% of the sprite
        float base = aSize * uPx * uFovK, ball = aAng * uPxPerRad * uPointK / 0.72;
        vBall = smoothstep(base * 1.1, base * 2.4, ball);
        vA = up * uVis * mix(tw, 1.0, vBall) * aFade; vColor = aColor;
        gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99984; gl_PointSize = min(uMaxPx, max(base, ball)); }`,
    fragmentShader: /* glsl */ `varying vec3 vColor; varying float vA; varying float vBall;
      void main() { float d = length(gl_PointCoord - 0.5);
        float pt = smoothstep(0.5, 0.04, d);
        // (a ball: brightest at its middle, darker to its limb, a soft glow round it)
        float rb = 0.36, body = 1.0 - smoothstep(rb - 0.02, rb, d), limb = sqrt(max(0.0, 1.0 - (d * d) / (rb * rb)));
        float glow = (1.0 - smoothstep(rb, 0.5, d)) * 0.35;
        // (as bright as the star is: a near dim dwarf is a dim ball)
        float lum = max(vColor.r, max(vColor.g, vColor.b));
        vec3 hue = vColor / max(0.05, lum) * (0.3 + 0.7 * clamp(lum, 0.0, 1.0));
        vec3 col = mix(vColor * pt, hue * (body * (0.32 + 0.78 * pow(limb, 0.7)) + glow), vBall);
        float a = mix(pt, max(body, glow), vBall);
        if (vA * a < 0.003) discard; gl_FragColor = vec4(col * vA, 1.0);
      #include <colorspace_fragment>
    }`,
  }));
  const makePoints = (n: number) => {
    const g = T(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    g.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(n), 1));
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
  const setRealSizes = () => {
    const A = realPts.geometry.attributes.aAng as THREE.BufferAttribute;
    real.forEach((s, i) => A.setX(i, starDiam(s, sizes)));
    A.needsUpdate = true;
  };
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
    setRealSizes();
    P.needsUpdate = S.needsUpdate = C.needsUpdate = true;
    realPts.geometry.setDrawRange(0, real.length);
    byId.clear();
    for (const s of real) byId.set(s.id, s);
    // (your stars that are real ones, now that we know where they are)
    for (const id of mineIds) if (!pinned.has(id)) { const s = starById(id, cat); if (s) pinned.set(id, s); }
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
    const C = genPts.geometry.attributes.aColor as THREE.BufferAttribute, F = genPts.geometry.attributes.aFade as THREE.BufferAttribute, A = genPts.geometry.attributes.aAng as THREE.BufferAttribute;
    for (const [id, s] of byId) if (s.tier > 0) byId.delete(id);
    list.forEach((s, i) => {
      P.setXYZ(i, s.dir[0] * R, s.dir[1] * R, s.dir[2] * R);
      const Tt = TIERS[s.tier];
      const rel = (Tt.magHi - s.mag) / (Tt.magHi - Tt.magLo);
      S.setX(i, (1.3 + rel * 3.4) * boostOf(claims.get(s.id)));
      const c0 = CLASS_RGB[s.cls] ?? [1, 1, 1], k = 0.45 + rel * 0.9;
      C.setXYZ(i, c0[0] * k, c0[1] * k, c0[2] * k);
      F.setX(i, tierFade(s.tier, fovDeg));
      A.setX(i, starDiam(s, sizes));
      byId.set(s.id, s);
    });
    P.needsUpdate = S.needsUpdate = C.needsUpdate = F.needsUpdate = A.needsUpdate = true;
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
  // (yours: a dashed ring, turning the other way)
  const mineTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7; g.lineCap = 'round';
    for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(64, 64, 55, (i / 8) * Math.PI * 2 + 0.12, ((i + 1) / 8) * Math.PI * 2 - 0.12); g.stroke(); }
    return T(new THREE.CanvasTexture(c));
  })();
  const halos = new THREE.Group();
  group.add(halos);
  const haloOf = new Map<number, THREE.Sprite>();
  type Disc = { id: number; mesh: THREE.Mesh; tex: THREE.Texture | null; rev: number };
  const discs = new Map<number, Disc>();
  const discGeo = T(new THREE.SphereGeometry(1, 48, 24));
  const discMat = (col: string, base: [number, number, number], tex: THREE.Texture | null) => new THREE.ShaderMaterial({
    uniforms: { uSkin: { value: tex }, uHas: { value: tex ? 1 : 0 }, uCol: { value: new THREE.Color(col) }, uBase: { value: new THREE.Color(base[0], base[1], base[2]) }, uSpin: { value: 0 }, uFade: { value: 1 } },
    fog: false, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vL; void main() { vL = position; vN = normalize(mat3(modelMatrix) * normal); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p; gl_Position.z = gl_Position.w * 0.99982; }`,
    fragmentShader: /* glsl */ `uniform sampler2D uSkin; uniform float uHas, uSpin, uFade; uniform vec3 uCol, uBase; varying vec3 vN; varying vec3 vL;
      void main() { vec3 d = normalize(vL); float c = cos(uSpin), s = sin(uSpin); vec3 q = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
        vec2 uv = vec2(atan(q.x, q.z) / 6.2831853 + 0.5, asin(clamp(q.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        vec4 sk = uHas > 0.5 ? texture2D(uSkin, uv) : vec4(0.0);
        // (a ball, not a coin: its own light at the middle, darker toward its edge, a rim in its claimers' colour)
        float mu = abs(dot(normalize(vN), normalize(cameraPosition)));
        vec3 col = mix(uBase * 1.15, sk.rgb, sk.a) * (0.55 + 0.45 * mu) + uCol * pow(1.0 - mu, 3.0) * 0.5;
        gl_FragColor = vec4(col, uFade);
        #include <colorspace_fragment>
      }`,
  });
  // your stars: always placed (wherever they are, whatever the zoom), with their names
  const mineIds = new Set<number>();
  const pinned = new Map<number, Star>();
  const labels = new Map<number, { sp: THREE.Sprite; tex: THREE.CanvasTexture; aspect: number }>();
  const ensureDisc = (id: number) => {
    if (discs.has(id)) return;
    const c = claims.get(id);
    const st = find(id);
    const mesh = new THREE.Mesh(discGeo, discMat(c?.color || '#FFE7A0', CLASS_RGB[st?.cls ?? 'yellow'] ?? [1, 0.95, 0.85], null));
    mesh.visible = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    discs.set(id, { id, mesh, tex: null, rev: -1 });
  };
  const find = (id: number): Star | null => byId.get(id) ?? pinned.get(id) ?? null;
  const setClaims = (list: SkyClaim[]) => {
    for (const c of list) claims.set(c.id, { ...claims.get(c.id), ...c, mine: c.mine ?? claims.get(c.id)?.mine });
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
    for (const c0 of list) {
      const c = claims.get(c0.id)!;
      let sp = haloOf.get(c.id);
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        sp.renderOrder = 2;
        halos.add(sp);
        haloOf.set(c.id, sp);
      }
      sp.material.color.set(c.nova ? '#FFF6E0' : c.color || '#22E3FF');
      sp.userData.k = Math.max(0.25, c.claimed / Math.max(1, c.cells)) * (1 + 0.25 * (c.lit ?? 0)) * (c.nova ? 3 : 1);
      sp.userData.id = c.id;
      if (c.claimed > 0) ensureDisc(c.id);
    }
  };
  /** your stars (their names under them, a cyan ring), from my_stars */
  const setMine = (list: { id: number; name: string }[]) => {
    const keep = new Set(list.map((x) => x.id));
    for (const [id, l] of labels) if (!keep.has(id)) { group.remove(l.sp); l.sp.material.dispose(); l.tex.dispose(); labels.delete(id); }
    mineIds.clear();
    for (const x of list) {
      mineIds.add(x.id);
      const s = byId.get(x.id) ?? starById(x.id, cat);
      if (s) pinned.set(x.id, s);
      const c = claims.get(x.id); if (c) c.mine = true;
      const had = labels.get(x.id);
      if (had && had.sp.userData.name === x.name) continue;
      if (had) { group.remove(had.sp); had.sp.material.dispose(); had.tex.dispose(); }
      const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 96 });
      const g = cv.getContext('2d')!;
      const text = `★ ${x.name}`;
      g.font = '800 44px Manrope, system-ui, sans-serif';
      const w = Math.min(500, g.measureText(text).width + 36);
      cv.width = Math.ceil(w);
      const g2 = cv.getContext('2d')!;
      g2.font = '800 44px Manrope, system-ui, sans-serif'; g2.textBaseline = 'middle'; g2.textAlign = 'center';
      g2.fillStyle = 'rgba(5,8,22,0.72)';
      const rr = 30; g2.beginPath(); g2.moveTo(rr, 6); g2.arcTo(cv.width - 2, 6, cv.width - 2, 90, rr); g2.arcTo(cv.width - 2, 90, 2, 90, rr); g2.arcTo(2, 90, 2, 6, rr); g2.arcTo(2, 6, cv.width - 2, 6, rr); g2.fill();
      g2.strokeStyle = 'rgba(92,242,255,0.85)'; g2.lineWidth = 4; g2.stroke();
      g2.fillStyle = '#5CF2FF'; g2.fillText(text, cv.width / 2, 50, cv.width - 30);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      sp.renderOrder = 5; sp.userData.name = x.name; sp.userData.id = x.id;
      group.add(sp);
      labels.set(x.id, { sp, tex, aspect: cv.width / 96 });
    }
  };
  /** a claimed star's look up close (its paintings, turning): the caller makes the skin (src/stars/skin.ts) */
  const setSkin = (id: number, canvas: HTMLCanvasElement | null, rev: number) => {
    ensureDisc(id);
    const d = discs.get(id)!;
    if (d.rev === rev && d.tex) return;
    d.tex?.dispose(); d.tex = null;
    const tex = canvas ? new THREE.CanvasTexture(canvas) : null;
    if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; }
    const m = d.mesh.material as THREE.ShaderMaterial;
    m.uniforms.uSkin.value = tex; m.uniforms.uHas.value = tex ? 1 : 0;
    const c = claims.get(id); if (c?.color) m.uniforms.uCol.value.set(c.color);
    d.tex = tex; d.rev = rev;
  };

  let vis = 0;
  let reachTier = 3;
  let lastC: V3 = [0, 0, 1];
  let pxPerRad = 1000, fovR = 1;
  const tmp = new THREE.Vector3();
  const wp = new THREE.Vector3();
  /** a claimed star's disc diameter on screen (device px) */
  const discPx = (s: Star) => shellDiam(s, sizes) * pxPerRad;
  return {
    /** each frame: the view (equatorial centre, width, aspect), how dark it is, and how deep this player's telescope reaches */
    update(c: V3, fovDeg: number, aspect: number, night: number, t: number, reach: number) {
      vis = night;
      lastC = c;
      fovR = fovDeg * Math.PI / 180;
      pxPerRad = Math.max(1, opts.viewH()) / Math.max(1e-7, fovR);
      U.uVis.value = night;
      U.uTime.value = t;
      U.uPx.value = opts.px();
      U.uPxPerRad.value = pxPerRad;
      // (zoomed in, the stars you can see are a little brighter too: the telescope gathers more light)
      U.uFovK.value = fovDeg < 20 ? Math.min(1.8, 1 + Math.log2(20 / fovDeg) * 0.08) : 1;
      reachTier = reach;
      const key = `${Math.round(c[0] * 60)}:${Math.round(c[1] * 60)}:${Math.round(c[2] * 60)}:${Math.round(Math.log(fovDeg) * 6)}:${reach}`;
      // (re-made when the view's moved a good part of its width, or zoomed a step)
      if (key !== lastKey && fovDeg < 30) {
        const moved = (() => { const p = lastKey.split(':').map(Number); if (p.length < 4) return true; const d = Math.hypot(p[0] / 60 - c[0], p[1] / 60 - c[1], p[2] / 60 - c[2]); return d > (fovDeg * Math.PI / 180) * 0.25 || Math.round(Math.log(fovDeg) * 6) !== p[3] || p[4] !== reach; })();
        if (moved) { lastKey = key; rebuild(c, fovDeg, aspect, reach); }
      } else if (fovDeg >= 30 && gen.length) { gen = []; genPts.geometry.setDrawRange(0, 0); lastKey = ''; for (const [id, s] of byId) if (s.tier > 0) byId.delete(id); }
      const dpr = opts.px();
      const discMin = sizes.disc_px * dpr;
      // discs: a claimed star whose shell is a few pixels across is drawn as itself (its plots and paintings on it)
      const shown = new Set<number>();
      for (const d of discs.values()) {
        const s = find(d.id);
        const px = s ? discPx(s) : 0;
        const show = !!s && px >= discMin && night > 0.02;
        d.mesh.visible = show;
        if (!show || !s) continue;
        shown.add(d.id);
        const ang = shellDiam(s, sizes);
        const r = R * 0.998 * Math.tan(ang / 2);
        d.mesh.position.set(s.dir[0] * R * 0.998, s.dir[1] * R * 0.998, s.dir[2] * R * 0.998);
        d.mesh.scale.setScalar(r);
        const m = d.mesh.material as THREE.ShaderMaterial;
        m.uniforms.uFade.value = Math.min(1, (px - discMin) / Math.max(1, discMin * 1.5)) * Math.min(1, night * 1.5);
        // (it turns once in its own day)
        m.uniforms.uSpin.value = (Date.now() / 3600_000 / s.spinH) * Math.PI * 2;
      }
      // halos: round the star (round its disc once it's one), standing out at any zoom, brighter at night
      for (const [id, sp] of haloOf) {
        const s = find(id);
        sp.visible = !!s && night > 0.05;
        if (!s) continue;
        sp.position.set(s.dir[0] * R * 0.999, s.dir[1] * R * 0.999, s.dir[2] * R * 0.999);
        const k = sp.userData.k as number;
        const mark = R * Math.tan(fovR * 0.018) * (1 + k * 0.6);
        const disc = shown.has(id) ? R * Math.tan(shellDiam(s, sizes) / 2) * 2 * 1.45 : 0;
        sp.scale.setScalar(Math.max(mark, disc));
        sp.material.opacity = Math.min(1, night * 1.2) * (0.45 + 0.55 * k);
        sp.material.rotation = t * 0.2;
      }
      // your stars: their names under them (and a cyan ring) wherever they are, whatever the zoom
      for (const [id, l] of labels) {
        const s = find(id);
        l.sp.visible = !!s && night > 0.05;
        if (!s) continue;
        l.sp.position.set(s.dir[0] * R * 0.997, s.dir[1] * R * 0.997, s.dir[2] * R * 0.997);
        // (below the horizon: hidden, like the star)
        l.sp.getWorldPosition(wp);
        const camY = group.matrixWorld.elements[13];
        if (wp.y - camY < 0) { l.sp.visible = false; continue; }
        const hPx = 22 * dpr;
        const world = 2 * R * Math.tan(fovR / 2) * (hPx / Math.max(1, opts.viewH()));
        l.sp.scale.set(world * l.aspect, world, 1);
        l.sp.center.set(0.5, 1.0 + Math.max(0.55, (shown.has(id) ? discPx(s) / 2 + 8 * dpr : 14 * dpr) / hPx));
        l.sp.material.opacity = Math.min(1, night * 1.4);
        // (and its ring)
        let ring = l.sp.userData.ring as THREE.Sprite | undefined;
        if (!ring) {
          ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: mineTex, color: '#5CF2FF', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
          ring.renderOrder = 4; l.sp.userData.ring = ring; group.add(ring);
        }
        ring.visible = l.sp.visible;
        ring.position.copy(l.sp.position);
        const markR = R * Math.tan(fovR * 0.03);
        ring.scale.setScalar(Math.max(markR, shown.has(id) ? R * Math.tan(shellDiam(s, sizes) / 2) * 2 * 1.75 : 0));
        ring.material.rotation = -t * 0.35;
        ring.material.opacity = Math.min(1, night * 1.4) * 0.9;
      }
    },
    /** the star nearest a direction (equatorial), within a tolerance (radians): what was tapped — a disc anywhere on it */
    pick(d: V3, tol: number): Star | null {
      if (vis < 0.05) return null;
      let best: Star | null = null, bestA = tol;
      const consider = (s: Star, bias: number) => {
        const a = Math.acos(Math.max(-1, Math.min(1, s.dir[0] * d[0] + s.dir[1] * d[1] + s.dir[2] * d[2]))) - bias;
        if (a < bestA) { bestA = a; best = s; }
      };
      const discR = (s: Star) => (discs.get(s.id)?.mesh.visible ? shellDiam(s, sizes) / 2 : 0);
      const ballR = (s: Star) => (starDiam(s, sizes) * sizes.point_k) / 2;
      for (const s of real) consider(s, claims.has(s.id) ? Math.max(tol * 0.4, discR(s)) : Math.max(Math.max(0, 3 - s.mag) * tol * 0.05, ballR(s)));
      for (const s of gen) consider(s, claims.has(s.id) ? Math.max(tol * 0.4, discR(s)) : ballR(s));
      for (const s of pinned.values()) if (!byId.has(s.id)) consider(s, Math.max(tol * 0.4, discR(s)));
      return best;
    },
    /** the star with this id, if it's on show (or one of yours) */
    star: (id: number) => find(id),
    /** any star by its id (on show or not) */
    lookup: (id: number) => find(id) ?? starById(id, cat),
    catalog: () => cat,
    /** the sky's sizes (game_config stars.sky) */
    setSizes(k: SkySizes | null | undefined) { sizes = { ...SKY_DEFAULTS, ...(k ?? {}) }; U.uPointK.value = sizes.point_k; setRealSizes(); lastKey = ''; },
    sizes: () => sizes,
    /** the ids on show (generated tiers), for asking which are claimed */
    shownIds: () => gen.map((s) => ({ id: s.id, d: s.dir[0] * lastC[0] + s.dir[1] * lastC[1] + s.dir[2] * lastC[2] })).sort((a, b) => b.d - a.d).map((x) => x.id),
    /** the claimed stars on show (nearest the view's centre first), for their skins up close */
    claimedShown: (): number[] => {
      const out: { id: number; a: number }[] = [];
      for (const id of claims.keys()) { const s = find(id); if (s) out.push({ id, a: -(s.dir[0] * lastC[0] + s.dir[1] * lastC[1] + s.dir[2] * lastC[2]) }); }
      return out.sort((x, y) => x.a - y.a).map((x) => x.id);
    },
    /** the claimed stars in view whose disc is at least `minPx` (CSS px) across, nearest the middle first: whose skins to load */
    claimedVisible: (minPx: number): number[] => {
      const out: { id: number; a: number }[] = [];
      const cosV = Math.cos(Math.min(Math.PI / 2, fovR * 0.9));
      for (const [id, c] of claims) {
        if (!c.claimed) continue;
        const s = find(id); if (!s) continue;
        const dd = s.dir[0] * lastC[0] + s.dir[1] * lastC[1] + s.dir[2] * lastC[2];
        if (dd < cosV || discPx(s) < minPx * opts.px()) continue;
        out.push({ id, a: -dd });
      }
      return out.sort((x, y) => x.a - y.a).map((x) => x.id);
    },
    setClaims,
    setMine,
    setSkin,
    claimOf: (id: number) => claims.get(id) ?? null,
    /** where a star is in the world (for tests: tapping it on screen), if it's on show */
    worldPos: (id: number, out: THREE.Vector3): THREE.Vector3 | null => {
      const s = find(id) ?? starById(id, cat);
      if (!s) return null;
      group.updateMatrixWorld();
      return group.localToWorld(out.set(s.dir[0] * R, s.dir[1] * R, s.dir[2] * R));
    },
    /** where a star is in the group's frame (for the Starbeam Lens: its light comes from there) */
    dirOf: (id: number): V3 | null => find(id)?.dir ?? null,
    counts: () => ({ real: real.length, gen: gen.length, claims: claims.size, discs: [...discs.values()].filter((x) => x.mesh.visible).length, reach: reachTier, mine: labels.size,
      labels: [...labels.values()].filter((l) => l.sp.visible).length }),
    /** (tests) a star's size on screen now: its ball (device px) and its disc's (claimed) */
    sizeOf: (id: number) => { const s = find(id) ?? starById(id, cat); return s ? { ball: starDiam(s, sizes) * sizes.point_k * pxPerRad, disc: discPx(s), discShown: !!discs.get(id)?.mesh.visible } : null; },
    /** hide the old scattered stars once the real ones are in */
    realReady: () => real.length > 0,
    tmp,
    dispose() {
      for (const sp of haloOf.values()) sp.material.dispose();
      for (const d of discs.values()) { d.tex?.dispose(); (d.mesh.material as THREE.Material).dispose(); }
      for (const l of labels.values()) { l.sp.material.dispose(); l.tex.dispose(); const ring = l.sp.userData.ring as THREE.Sprite | undefined; if (ring) { ring.material.dispose(); group.remove(ring); } group.remove(l.sp); }
      group.remove(realPts, genPts, halos);
      for (const d of discs.values()) group.remove(d.mesh);
      for (const x of own) x.dispose();
    },
  };
}
