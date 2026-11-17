// The Leviathan in 3D, for the first-person view: the same beast as on the map, in detail — a scaled hide with glowing
// veins and a rim of light, a heavy chest and haunches, armour plates and a ridge of glowing spines with a membrane
// between them, four great legs that bend at the knee and lift their clawed feet, a long arched neck, a horned head
// with a frill, a jaw that opens on rows of teeth (and roars), slit-pupilled eyes, tentacles off its back with glowing
// tips, a spiked tail, and ink dripping off it.
//
// It's built from a few shapes drawn many times (instanced): a dozen draw calls for the whole beast, so a phone hardly
// notices it. It faces +x; one unit is about its height.
import * as THREE from 'three';

export type LevLook = { status: string; paused: boolean; tiny: boolean; rampage: boolean };
export type LevModel = {
  group: THREE.Group;
  /** the bits to aim at and to test taps against */ core: THREE.Object3D[];
  update(t: number, dt: number, walking: boolean): void;
  setLook(l: LevLook): void;
  hit(): void;
  dispose(): void;
};

/** the hide: scales (a cell pattern in its own space), glowing veins that pulse, and a rim of light */
function hide(base: string, emissive: string, vein: string, uniforms: { uTime: { value: number }; uFlash: { value: number } }) {
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.5, metalness: 0.12, emissive, emissiveIntensity: 0.35 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uFlash = uniforms.uFlash;
    sh.uniforms.uVein = { value: new THREE.Color(vein) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vLp = position;\n#ifdef USE_INSTANCING\n vLp = (instanceMatrix * vec4(position, 1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uFlash; uniform vec3 uVein; varying vec3 vLp;
        float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // scales: a cell per scale, each a little lighter or darker, a dark groove round it
        vec3 q = vLp * 34.0; vec3 c = floor(q); vec3 f = fract(q) - 0.5;
        float cell = h31(c);
        float groove = smoothstep(0.36, 0.5, max(abs(f.x), max(abs(f.y), abs(f.z))));
        diffuseColor.rgb *= (0.82 + cell * 0.36) * (1.0 - groove * 0.35);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // veins of light that pulse along the hide, and the rim
        float v = abs(sin(vLp.x * 26.0 + sin(vLp.y * 31.0 + vLp.z * 17.0) * 1.7));
        float vein = smoothstep(0.08, 0.0, v) * (0.55 + 0.45 * sin(uTime * 2.2 - vLp.x * 9.0));
        totalEmissiveRadiance += uVein * vein * (0.9 + uFlash * 3.0);
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += uVein * rim * 0.45 + vec3(uFlash) * 0.6;`);
  };
  return m;
}

export function createLeviathan(): LevModel {
  const group = new THREE.Group();
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };
  const U = { uTime: { value: 0 }, uFlash: { value: 0 } };
  const skin = T(hide('#1C0C3E', '#2A0F5C', '#B026FF', U));
  const belly = T(hide('#3A2466', '#2A0F5C', '#22E3FF', U));
  const plate = T(hide('#120729', '#1A0840', '#FF5CDB', U));
  const legMat = T(hide('#140830', '#12062E', '#7A3CFF', U));
  const bone = T(new THREE.MeshStandardMaterial({ color: '#EDE4FF', roughness: 0.35, emissive: '#5A4A8A', emissiveIntensity: 0.25 }));
  const spineMat = T(new THREE.MeshStandardMaterial({ color: '#2A0F5C', emissive: '#B026FF', emissiveIntensity: 1.2, roughness: 0.4 }));
  const eyeMat = T(new THREE.MeshBasicMaterial({ color: '#22E3FF' }));
  const pupil = T(new THREE.MeshBasicMaterial({ color: '#05020D' }));
  const glowEye = T(new THREE.SpriteMaterial({ map: glowTexture(), color: '#22E3FF', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const spotMat = T(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const mouthMat = T(new THREE.MeshBasicMaterial({ color: '#3A0A2A' }));
  const throat = T(new THREE.MeshBasicMaterial({ color: '#FF5CDB', transparent: true, opacity: 0.9 }));
  const finMat = T(new THREE.MeshBasicMaterial({ color: '#B026FF', transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const frost = T(new THREE.MeshBasicMaterial({ color: '#C9F2FF', transparent: true, opacity: 0, depthWrite: false }));
  const inkMat = T(new THREE.MeshBasicMaterial({ color: '#2B0B5E', transparent: true, opacity: 0.9 }));
  const sph = T(new THREE.SphereGeometry(1, 20, 14));
  const lowSph = T(new THREE.SphereGeometry(1, 10, 8));
  const cone = T(new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)); // (base at the origin, tip up)
  const cyl = T(new THREE.CylinderGeometry(1, 0.78, 1, 12).translate(0, -0.5, 0)); // (top at the origin, hanging down)

  const torso = new THREE.Group();
  torso.position.y = 0.55;
  group.add(torso);

  // ---- the body: a few big shapes, each its own mesh (they're what you tap) ------------------------------------------
  const big = (mat: THREE.Material, s: [number, number, number], p: [number, number, number], r?: [number, number, number]) => {
    const m = new THREE.Mesh(sph, mat); m.scale.set(...s); m.position.set(...p); if (r) m.rotation.set(...r); torso.add(m); return m;
  };
  const trunk = big(skin, [0.52, 0.26, 0.3], [0, 0, 0]);
  const chest = big(skin, [0.3, 0.27, 0.3], [0.22, 0.02, 0], [0, 0, -0.15]);
  big(skin, [0.28, 0.245, 0.285], [-0.23, 0.01, 0]); // haunches
  big(belly, [0.46, 0.15, 0.24], [0.04, -0.12, 0]);
  const ice = big(frost, [0.62, 0.34, 0.36], [0.02, 0.02, 0]);

  // ---- instanced parts: one draw call each ----------------------------------------------------------------------------
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    torso.add(m);
    own.push({ dispose: () => m.dispose() });
    return m;
  };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
  const put = (m: THREE.InstancedMesh, i: number, p: THREE.Vector3 | [number, number, number], s: THREE.Vector3 | [number, number, number], r: [number, number, number] = [0, 0, 0]) => {
    Array.isArray(p) ? P.set(...p) : P.copy(p);
    Array.isArray(s) ? S.set(...s) : S.copy(s);
    Q.setFromEuler(E.set(r[0], r[1], r[2]));
    m.setMatrixAt(i, M.compose(P, Q, S));
  };

  // the back: overlapping armour plates, a ridge of spines with a glowing membrane between them
  const PLATES = 12, SPINES = 13;
  const plates = inst(sph, plate, PLATES);
  for (let i = 0; i < PLATES; i++) {
    const k = i / (PLATES - 1), x = -0.42 + k * 0.78;
    const h = 0.2 + Math.sin(k * Math.PI) * 0.05;
    put(plates, i, [x, h, 0], [0.09, 0.035, 0.17 * (0.7 + Math.sin(k * Math.PI) * 0.3)], [0, 0, -0.25]);
  }
  const spines = inst(cone, spineMat, SPINES + 8 + 6); // back spines, the frill's spikes, the tail's spikes
  const spineAt: { x: number; y: number; h: number }[] = [];
  for (let i = 0; i < SPINES; i++) {
    const k = i / (SPINES - 1);
    spineAt.push({ x: -0.44 + k * 0.82, y: 0.22 + Math.sin(k * Math.PI) * 0.05, h: 0.1 + Math.sin(k * Math.PI) * 0.17 });
  }
  // the membrane: a ribbon through the spines' tips
  const fin = (() => {
    const pts: number[] = [], idx: number[] = [];
    spineAt.forEach((s, i) => { pts.push(s.x, s.y - 0.02, 0, s.x - 0.02, s.y + s.h * 0.85, 0); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const g = T(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, finMat);
    torso.add(m);
    return m;
  })();
  void fin;
  // spots of light down its flanks
  const SPOTS = 22;
  const spots = inst(lowSph, spotMat, SPOTS);
  for (let i = 0; i < SPOTS; i++) {
    const a = (i / SPOTS) * Math.PI * 2, side = i % 2 ? 1 : -1;
    put(spots, i, [Math.cos(a) * 0.4, -0.03 + Math.sin(a * 2) * 0.07, side * 0.27], [0.012 + (i % 3) * 0.005, 0.012 + (i % 3) * 0.005, 0.012 + (i % 3) * 0.005]);
    spots.setColorAt(i, new THREE.Color(i % 3 === 0 ? '#FF5CDB' : '#22E3FF'));
  }

  // legs: thigh and shin (bending at the knee), a foot with three claws
  const HIPS: [number, number][] = [[0.3, 0.19], [0.3, -0.19], [-0.3, 0.2], [-0.3, -0.2]];
  const thighs = inst(cyl, legMat, 4), shins = inst(cyl, legMat, 4), feet = inst(sph, legMat, 4 + 4); // (+ the knees)
  const bones = inst(cone, bone, 12 + 18 + 6); // claws, teeth, horns

  // the neck, the tail and the tentacles: chains of shrinking segments
  const NECK = 10, TAIL = 15, TENT = 6, BEADS = 16;
  const chain = inst(sph, skin, NECK + TAIL + TENT * BEADS);
  const tips = inst(lowSph, spotMat, TENT);
  for (let i = 0; i < TENT; i++) tips.setColorAt(i, new THREE.Color(i % 2 ? '#22E3FF' : '#FF5CDB'));

  // the head: skull, brow, snout, a lower jaw that opens, eyes with slit pupils
  const head = new THREE.Group();
  torso.add(head);
  const hb = (mat: THREE.Material, s: [number, number, number], p: [number, number, number], r?: [number, number, number], parent: THREE.Object3D = head) => {
    const m = new THREE.Mesh(sph, mat); m.scale.set(...s); m.position.set(...p); if (r) m.rotation.set(...r); parent.add(m); return m;
  };
  const skull = hb(skin, [0.15, 0.08, 0.095], [0, 0, 0]);
  for (const z of [0.05, -0.05]) hb(plate, [0.07, 0.022, 0.035], [0.03, 0.055, z], [0, z * 4, -0.2]); // brow ridges
  hb(skin, [0.11, 0.05, 0.07], [0.13, -0.005, 0]); // snout
  hb(mouthMat, [0.1, 0.02, 0.06], [0.11, -0.04, 0]);
  const jaw = new THREE.Group();
  jaw.position.set(0.02, -0.035, 0);
  head.add(jaw);
  hb(belly, [0.13, 0.03, 0.065], [0.1, -0.02, 0], undefined, jaw);
  const glow = hb(throat, [0.06, 0.012, 0.04], [0.08, -0.002, 0], undefined, jaw);
  const eyes: THREE.Object3D[] = [];
  for (const z of [0.07, -0.07]) {
    const e = new THREE.Mesh(lowSph, eyeMat); e.scale.set(0.022, 0.016, 0.012); e.position.set(0.07, 0.03, z); head.add(e);
    const p = new THREE.Mesh(lowSph, pupil); p.scale.set(0.004, 0.014, 0.004); p.position.set(0.085, 0.03, z * 1.08); head.add(p);
    const g = new THREE.Sprite(glowEye); g.scale.setScalar(0.13); g.position.copy(e.position); head.add(g);
    eyes.push(e, g);
  }

  // ink dripping off it
  const DRIPS = 16;
  const drips = inst(lowSph, inkMat, DRIPS);
  const dripState = Array.from({ length: DRIPS }, (_, i) => ({ x: -0.4 + ((i * 0.37) % 0.8), z: ((i * 0.53) % 0.5) - 0.25, t: (i * 0.29) % 1.6 }));

  let flash = 0, look: LevLook = { status: 'walking', paused: false, tiny: false, rampage: false };
  let roarUntil = 0, nextRoar = 6;
  const tmp = new THREE.Vector3();
  const update = (t: number, dt: number, walking: boolean) => {
    U.uTime.value = t;
    const w = walking && !look.paused;
    const pace = look.rampage ? 2.6 : 1;
    const ph = t * 1.6 * pace;
    torso.position.y = 0.55 + (w ? Math.abs(Math.sin(ph)) * 0.025 : Math.sin(t * 0.8) * 0.007);
    torso.rotation.x = w ? Math.sin(ph) * 0.03 : 0;
    torso.rotation.z = w ? Math.sin(ph * 2) * 0.012 : 0;

    // legs: the diagonal pairs step together; a lifted foot bends its knee
    HIPS.forEach(([hx, hz], i) => {
      const off = i === 0 || i === 3 ? 0 : Math.PI;
      const s = w ? Math.sin(ph + off) : 0, lift = w ? Math.max(0, Math.cos(ph + off)) : 0;
      const swing = s * 0.38, knee = 0.15 + lift * 0.75;
      const hip = new THREE.Vector3(hx, -0.08, hz);
      // the thigh hangs from the hip, swinging; the shin from the knee, bent back
      const L1 = 0.27, L2 = 0.3;
      const kneeP = hip.clone().add(new THREE.Vector3(Math.sin(swing) * L1, -Math.cos(swing) * L1, 0));
      put(thighs, i, hip, [0.09, L1, 0.09], [0, 0, swing]);
      const sa = swing - knee * (hx > 0 ? 1 : -1) * 0.5;
      put(shins, i, kneeP, [0.062, L2, 0.062], [0, 0, sa]);
      put(feet, 4 + i, kneeP, [0.075, 0.075, 0.075]);
      const foot = kneeP.clone().add(new THREE.Vector3(Math.sin(sa) * L2, -Math.cos(sa) * L2, 0));
      put(feet, i, foot.clone().add(new THREE.Vector3(0.03, -0.005, 0)), [0.11, 0.04, 0.09]);
      for (let k = -1; k <= 1; k++) put(bones, i * 3 + k + 1, foot.clone().add(new THREE.Vector3(0.12, -0.02, k * 0.045)), [0.017, 0.07, 0.017], [0, 0, -Math.PI / 2 - 0.25]);
    });

    // spines (breathing a little) and the frill's spikes
    spineAt.forEach((s2, i) => put(spines, i, [s2.x, s2.y, 0], [0.03 * (1 + Math.sin(t * 3 + i) * 0.08), s2.h, 0.03], [0, 0, 0.35]));

    // the neck arches forward and up, swaying; the head at its end
    const sway = Math.sin(t * 0.7) * 0.16;
    let ni = 0;
    const neckEnd = new THREE.Vector3();
    for (let i = 0; i < NECK; i++) {
      const k = i / (NECK - 1);
      tmp.set(0.48 + k * 0.24, 0.06 + k * k * 0.32 + Math.sin(t * 0.9 + k * 2) * 0.012, Math.sin(sway + k) * 0.035 * k);
      const r = 0.15 - k * 0.07;
      put(chain, ni++, tmp, [r * 1.15, r, r * 0.95]);
      neckEnd.copy(tmp);
    }
    head.position.set(neckEnd.x + 0.1, neckEnd.y + 0.025, neckEnd.z);
    head.rotation.z = -0.12 + Math.sin(t * 0.9) * 0.08;
    head.rotation.y = sway * 0.5;
    // the frill: a fan of spikes behind the skull, and the horns
    const frillBase = head.position.clone();
    for (let i = 0; i < 8; i++) {
      const a = -0.9 + (i / 7) * 1.8;
      put(spines, SPINES + i, frillBase.clone().add(new THREE.Vector3(-0.07, 0.03, Math.sin(a) * 0.08)), [0.012, 0.13 + Math.cos(a) * 0.05, 0.012], [Math.sin(a) * 0.9, 0, 0.95]);
    }
    for (let i = 0; i < 3; i++) for (const sd of [1, -1]) {
      const k = i / 2;
      put(bones, 12 + 18 + i + (sd > 0 ? 0 : 3), frillBase.clone().add(new THREE.Vector3(-0.02 - k * 0.06, 0.06 + k * 0.05, sd * (0.05 + k * 0.02))),
        [0.02 - k * 0.005, 0.08, 0.02 - k * 0.005], [sd * 0.3, 0, 1.1 + k * 0.5]);
    }

    // the jaw: a roar now and then (more often in a rage), the throat glowing
    if (t > nextRoar) { roarUntil = t + (look.rampage || look.status === 'enraged' ? 2.4 : 1.8); nextRoar = t + (look.rampage || look.status === 'enraged' ? 5 : 11) + Math.random() * 4; }
    const roar = t < roarUntil ? Math.sin(Math.min(1, (roarUntil - t) / 1.8) * Math.PI) : 0;
    jaw.rotation.z = -0.05 - roar * 0.55;
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.3 + roar * 0.7;
    // teeth along both jaws
    for (let i = 0; i < 9; i++) {
      const k = i / 8, x = 0.04 + k * 0.17, z = Math.cos(k * Math.PI * 0.5) * 0.045 * (i % 2 ? 1 : -1);
      put(bones, 12 + i, head.position.clone().add(new THREE.Vector3(x, -0.04, z).applyEuler(head.rotation)), [0.008, 0.028, 0.008], [Math.PI, 0, 0]);
      const jp = new THREE.Vector3(x - 0.02, 0.005, z).applyAxisAngle(new THREE.Vector3(0, 0, 1), jaw.rotation.z).add(jaw.position).applyEuler(head.rotation).add(head.position);
      put(bones, 12 + 9 + i, jp, [0.007, 0.022, 0.007], [0, 0, jaw.rotation.z + head.rotation.z]);
    }

    // the tail sweeps, spikes along its end
    for (let i = 0; i < TAIL; i++) {
      const k = i / (TAIL - 1);
      tmp.set(-0.5 - k * 0.6, -0.02 - k * 0.16 + Math.sin(t * 1.2 + k * 3) * 0.035, Math.sin(t * (w ? 2 : 0.8) + k * 4) * 0.14 * k);
      const r = 0.12 * (1 - k * 0.82);
      put(chain, ni++, tmp, [r * 1.2, r, r]);
      if (i >= TAIL - 6) put(spines, SPINES + 8 + (i - (TAIL - 6)), tmp.clone().add(new THREE.Vector3(0, r * 0.8, 0)), [0.014, 0.06 + (i - TAIL + 6) * 0.012, 0.014], [0, 0, 0.6]);
    }
    // tentacles writhe up off its back, glowing at the tips
    for (let i = 0; i < TENT; i++) {
      const bx = -0.26 + (i % 3) * 0.14, side = i < 3 ? 1 : -1;
      for (let k = 0; k < BEADS; k++) {
        const s = k / (BEADS - 1);
        // (up off the back, curling out and back, drooping at the end)
        tmp.set(bx - s * 0.24 + Math.sin(t * 1.3 + i + s * 3) * 0.07 * s, 0.21 + s * 0.42 - s * s * s * 0.14, side * (0.06 + s * 0.2) + Math.cos(t * 1.1 + i * 2 + s * 4) * 0.07 * s);
        const r = 0.046 * (1 - s * 0.78);
        put(chain, ni++, tmp, [r, r, r]);
      }
      put(tips, i, tmp, [0.017, 0.017, 0.017]);
    }

    // ink drips: off the belly, falling to the ground
    dripState.forEach((d, i) => {
      d.t += dt;
      if (d.t > 1.6) { d.t = 0; d.x = -0.4 + Math.random() * 0.8; d.z = (Math.random() - 0.5) * 0.4; }
      const fall = d.t < 0.5 ? 0 : (d.t - 0.5) ** 2 * 0.9;
      const s = d.t < 0.5 ? d.t * 0.03 : 0.015 * (1 - (d.t - 0.5) / 1.1);
      put(drips, i, [d.x, -0.24 - fall, d.z], [s, s * 1.6, s]);
    });

    for (const m of [plates, spines, spots, thighs, shins, feet, bones, chain, tips, drips]) { m.instanceMatrix.needsUpdate = true; }
    spineMat.emissiveIntensity = 1 + Math.sin(t * 2) * 0.35 + flash * 3;
    U.uFlash.value = flash;
    flash = Math.max(0, flash - dt * 4);
  };
  const setLook = (l: LevLook) => {
    look = l;
    const eye = l.status === 'enraged' ? '#FF2D55' : l.status === 'fleeing' ? '#C9F2FF' : l.status === 'warning' ? '#9BE7FF' : '#22E3FF';
    eyeMat.color.set(eye);
    glowEye.color.set(eye);
    spineMat.emissive.set(l.status === 'enraged' || l.rampage ? '#FF2D55' : '#B026FF');
    finMat.color.set(l.status === 'enraged' || l.rampage ? '#FF2D55' : '#B026FF');
    skin.color.set(l.status === 'fleeing' ? '#4A3A78' : '#1C0C3E');
    frost.opacity = l.paused ? 0.35 : 0;
  };
  setLook(look);
  update(0, 0, false);
  return {
    group, core: [trunk, chest, skull, ice],
    update, setLook, hit: () => { flash = 1; },
    dispose: () => { for (const d of own) d.dispose(); },
  };
}

let glowTex: THREE.Texture | null = null;
/** a soft round glow (shared) */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
