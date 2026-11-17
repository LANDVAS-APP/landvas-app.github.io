// The Leviathan in 3D, for the first-person view: the same beast as on the map (four great legs, a ridge of glowing
// spines, tentacles off its back, a long neck and a lantern-jawed head, bioluminescent spots, ink dripping off it),
// built from simple shapes so it costs a phone almost nothing. It faces +x; one unit is about its height.
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

export function createLeviathan(): LevModel {
  const group = new THREE.Group();
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };
  const body = T(new THREE.MeshStandardMaterial({ color: '#1C0C3E', roughness: 0.55, metalness: 0.1, emissive: '#2A0F5C', emissiveIntensity: 0.35 }));
  const dark = T(new THREE.MeshStandardMaterial({ color: '#0D0622', roughness: 0.8, emissive: '#12062E', emissiveIntensity: 0.3 }));
  const claw = T(new THREE.MeshStandardMaterial({ color: '#E5D9FF', roughness: 0.4, emissive: '#5A4A8A', emissiveIntensity: 0.3 }));
  const spineMat = T(new THREE.MeshStandardMaterial({ color: '#2A0F5C', emissive: '#B026FF', emissiveIntensity: 1.2, roughness: 0.4 }));
  const eyeMat = T(new THREE.MeshBasicMaterial({ color: '#22E3FF' }));
  const glowEye = T(new THREE.SpriteMaterial({ map: glowTexture(), color: '#22E3FF', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const spotA = T(new THREE.MeshBasicMaterial({ color: '#22E3FF' })), spotB = T(new THREE.MeshBasicMaterial({ color: '#FF5CDB' }));
  const jaw = T(new THREE.MeshBasicMaterial({ color: '#FFE8A3' }));
  const frost = T(new THREE.MeshBasicMaterial({ color: '#C9F2FF', transparent: true, opacity: 0.0, depthWrite: false }));
  const sph = T(new THREE.SphereGeometry(1, 20, 14));
  const lowSph = T(new THREE.SphereGeometry(1, 10, 8));
  const cone = T(new THREE.ConeGeometry(1, 1, 8));
  const cyl = T(new THREE.CylinderGeometry(1, 0.8, 1, 10));

  const torso = new THREE.Group();
  torso.position.y = 0.52;
  group.add(torso);
  // the body
  const trunk = new THREE.Mesh(sph, body);
  trunk.scale.set(0.55, 0.26, 0.3);
  torso.add(trunk);
  const ice = new THREE.Mesh(sph, frost);
  ice.scale.set(0.57, 0.28, 0.32);
  torso.add(ice);
  // spines along the back
  const spines: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(cone, spineMat);
    const x = -0.36 + i * 0.09;
    const h = 0.14 + Math.sin((i / 8) * Math.PI) * 0.12;
    s.scale.set(0.035, h, 0.035);
    s.position.set(x, 0.22 + Math.sin((i / 8) * Math.PI) * 0.04 + h / 2 - 0.02, 0);
    s.rotation.z = -0.2;
    torso.add(s);
    spines.push(s);
  }
  // bioluminescent spots on the flanks
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(lowSph, i % 2 ? spotA : spotB);
    const a = (i / 14) * Math.PI * 2;
    s.scale.setScalar(0.014 + (i % 3) * 0.006);
    s.position.set(Math.cos(a) * 0.42, -0.04 + Math.sin(a * 2) * 0.08, (i % 2 ? 1 : -1) * 0.25);
    torso.add(s);
  }
  // legs (hip pivots) with claws
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[0.3, 0.16], [0.3, -0.16], [-0.28, 0.17], [-0.28, -0.17]]) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.1, z);
    const upper = new THREE.Mesh(cyl, dark);
    upper.scale.set(0.07, 0.42, 0.07);
    upper.position.y = -0.21;
    hip.add(upper);
    const foot = new THREE.Mesh(sph, dark);
    foot.scale.set(0.1, 0.04, 0.09);
    foot.position.y = -0.43;
    hip.add(foot);
    for (let k = -1; k <= 1; k++) {
      const c = new THREE.Mesh(cone, claw);
      c.scale.set(0.016, 0.06, 0.016);
      c.rotation.z = -Math.PI / 2;
      c.position.set(0.1, -0.44, k * 0.04);
      hip.add(c);
    }
    torso.add(hip);
    legs.push(hip);
  }
  // the neck and head
  const neck = new THREE.Group();
  neck.position.set(0.45, 0.08, 0);
  torso.add(neck);
  const neckSegs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(sph, body);
    const r = 0.12 - i * 0.012;
    s.scale.set(r * 1.2, r, r);
    neck.add(s);
    neckSegs.push(s);
  }
  const head = new THREE.Group();
  neck.add(head);
  const skull = new THREE.Mesh(sph, body);
  skull.scale.set(0.16, 0.075, 0.085);
  head.add(skull);
  const snout = new THREE.Mesh(sph, dark);
  snout.scale.set(0.09, 0.04, 0.06);
  snout.position.set(0.13, -0.025, 0);
  head.add(snout);
  const mouth = new THREE.Mesh(T(new THREE.BoxGeometry(0.16, 0.006, 0.09)), jaw);
  mouth.position.set(0.1, -0.035, 0);
  head.add(mouth);
  const eyes: THREE.Object3D[] = [];
  for (const z of [0.06, -0.06]) {
    const e = new THREE.Mesh(lowSph, eyeMat);
    e.scale.setScalar(0.018);
    e.position.set(0.06, 0.03, z);
    head.add(e);
    const g = new THREE.Sprite(glowEye);
    g.scale.setScalar(0.12);
    g.position.copy(e.position);
    head.add(g);
    eyes.push(e, g);
  }
  // tentacles off its back and the tail: chains of shrinking beads
  const tentacles: THREE.Mesh[][] = [];
  for (let i = 0; i < 4; i++) {
    const chain: THREE.Mesh[] = [];
    for (let k = 0; k < 9; k++) {
      const b = new THREE.Mesh(lowSph, k % 3 === 2 ? spineMat : body);
      b.scale.setScalar(0.035 * (1 - k / 11));
      torso.add(b);
      chain.push(b);
    }
    tentacles.push(chain);
  }
  const tail: THREE.Mesh[] = [];
  for (let k = 0; k < 10; k++) {
    const b = new THREE.Mesh(sph, body);
    b.scale.setScalar(0.09 * (1 - k / 12));
    torso.add(b);
    tail.push(b);
  }

  let flash = 0, look: LevLook = { status: 'walking', paused: false, tiny: false, rampage: false };
  const tmp = new THREE.Vector3();
  const update = (t: number, dt: number, walking: boolean) => {
    const w = walking && !look.paused;
    const pace = look.rampage ? 2.6 : 1;
    const ph = t * 1.6 * pace;
    // legs swing in pairs, the body rolls with them
    legs.forEach((l, i) => { l.rotation.z = w ? Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35 : 0; });
    torso.position.y = 0.52 + (w ? Math.abs(Math.sin(ph)) * 0.02 : Math.sin(t * 0.8) * 0.006);
    torso.rotation.x = w ? Math.sin(ph) * 0.03 : 0;
    // the neck sways forward and up
    const sway = Math.sin(t * 0.7) * 0.15;
    for (let i = 0; i < neckSegs.length; i++) {
      const k = i / (neckSegs.length - 1);
      neckSegs[i].position.set(k * 0.22, k * k * 0.28 + Math.sin(t * 0.9 + k * 2) * 0.01, Math.sin(sway + k) * 0.03 * k);
    }
    const tip = neckSegs[neckSegs.length - 1].position;
    head.position.set(tip.x + 0.1, tip.y + 0.02, tip.z);
    head.rotation.z = -0.15 + Math.sin(t * 0.9) * 0.08;
    head.rotation.y = sway * 0.5;
    // tentacles writhe up off its back
    tentacles.forEach((chain, i) => {
      const bx = -0.2 + i * 0.12;
      chain.forEach((b, k) => {
        const s = k / chain.length;
        tmp.set(bx - s * 0.12 + Math.sin(t * 1.3 + i + s * 3) * 0.06 * s, 0.2 + s * 0.42, Math.cos(t * 1.1 + i * 2 + s * 4) * 0.08 * s + (i % 2 ? 0.05 : -0.05));
        b.position.copy(tmp);
      });
    });
    // the tail sweeps
    tail.forEach((b, k) => {
      const s = k / tail.length;
      b.position.set(-0.5 - s * 0.45, -0.02 - s * 0.12 + Math.sin(t * 1.2 + s * 3) * 0.03, Math.sin(t * (w ? 2 : 0.8) + s * 4) * 0.12 * s);
    });
    spines.forEach((s, i) => { s.scale.x = 0.035 * (1 + Math.sin(t * 3 + i) * 0.08); });
    spineMat.emissiveIntensity = 1 + Math.sin(t * 2) * 0.35 + flash * 3;
    body.emissiveIntensity = 0.35 + flash * 2.5;
    flash = Math.max(0, flash - dt * 4);
  };
  const setLook = (l: LevLook) => {
    look = l;
    const eye = l.status === 'enraged' ? '#FF2D55' : l.status === 'fleeing' ? '#C9F2FF' : l.status === 'warning' ? '#9BE7FF' : '#22E3FF';
    eyeMat.color.set(eye);
    glowEye.color.set(eye);
    spineMat.emissive.set(l.status === 'enraged' || l.rampage ? '#FF2D55' : '#B026FF');
    body.color.set(l.status === 'fleeing' ? '#4A3A78' : '#1C0C3E');
    frost.opacity = l.paused ? 0.35 : 0;
  };
  setLook(look);
  return {
    group, core: [trunk, skull, ...neckSegs],
    update, setLook, hit: () => { flash = 1; },
    dispose: () => { for (const d of own) d.dispose(); },
  };
}

let glow: THREE.Texture | null = null;
/** a soft round glow (shared) */
export function glowTexture() {
  if (glow) return glow;
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
}
