// 3D party games, the worlds you're whisked away to. Everyone's explorer runs about in a proper 3D place:
// Candy Park (tag), a Moonlit Garden maze (hide & seek), a Volcano Lake (floor is lava) and a Grand Ballroom
// (musical chairs). Each one is built from the game's map (made fresh from its seed), then squashed into a
// handful of draw calls so phones keep up: still scenery is merged by material, lots-of-the-same things
// (flowers, grass, fence pickets, lava tiles) are instanced, and only the tall things that can hide you get
// their own meshes (so they can fade out when they're between the camera and you).
import * as THREE from 'three';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../../lib/gfx';
import { rng } from '../party/kit';
import { LAVA, SOFT_REVEAL, sees, softAt, type ChairW, type HSW, type LavaW, type Ob, type TagW, type W3 } from './sims';
import { bake, flat, grassTex, mesh, motes, padArt, perimeter, scatter, type Ctx, type Env, type Inst } from './kit3d';
import { ENVS2 } from './worlds2';
export type { Seat3 } from './kit3d';
import type { Seat3 } from './kit3d';

// ---- Candy Park (tag) ------------------------------------------------------------------------------------------------
const CANDY = ['#FF9FD6', '#9FE8FF', '#C9F28C', '#FFD59F', '#D5B3FF'];
function candyPark(ctx: Ctx): Env {
  const H = ctx.w.H ?? 14, r = ctx.r;
  const ground = mesh(ctx, new THREE.PlaneGeometry(2 * H + 50, 2 * H + 50), ctx.std('#ffffff', { map: grassTex(ctx, '#7ED957', '#6CC84A', '#94E86E', 3, (2 * H + 50) / 8), roughness: 1 })); flat(ground);
  // pastel paths crossing the park
  const pathM = ctx.std('#F7D9A8', { roughness: 0.95 });
  for (const along of [0, 1]) { const p = mesh(ctx, new THREE.PlaneGeometry(along ? 2.2 : 2 * H, along ? 2 * H : 2.2), pathM, 0, 0.012, 0); flat(p); }
  flat(mesh(ctx, new THREE.RingGeometry(4.4, 5.6, 48), pathM, 0, 0.014, 0));
  // a picket fence (instanced) with rails
  const pick: Inst[] = []; perimeter(ctx, H, 0.7, (x, z) => pick.push({ x, y: 0.45, z }));
  scatter(ctx, new THREE.BoxGeometry(0.12, 0.9, 0.12), ctx.std('#FFFFFF', { roughness: 0.6 }), pick, true);
  for (const s of [-1, 1]) { mesh(ctx, new THREE.BoxGeometry(2 * H, 0.08, 0.06), ctx.std('#FFFFFF'), 0, 0.65, s * H); mesh(ctx, new THREE.BoxGeometry(0.06, 0.08, 2 * H), ctx.std('#FFFFFF'), s * H, 0.65, 0); }
  const water: THREE.Mesh[] = [], swings: THREE.Object3D[] = [], padUps: NonNullable<ReturnType<typeof padArt>>[] = [];
  const stripes = (c: string) => ctx.tex(128, 128, (g) => { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 128); g.fillStyle = c; for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + 128, 128); g.lineTo(i + 128, 128); g.fill(); } }, 1);
  const stripeMs = ['#FF3D6E', '#22B8CF', '#3DDC97', '#8B5CFF'].map((c) => ctx.std('#ffffff', { map: stripes(c), roughness: 0.4 }));
  for (const o of ctx.obs) {
    if (o.m === 'tree' && o.k === 'c') {
      const g = ctx.prop(); mesh(ctx, new THREE.CylinderGeometry(0.16, 0.24, 1.8, 8), ctx.std('#7A4B2A'), o.x, 0.9, o.z, g);
      const leaf = ctx.std(CANDY[(o.v ?? 0) % CANDY.length], { roughness: 0.85 });
      for (const [dx, dy, dz, s] of [[0, 2.3, 0, 1.15], [0.5, 1.9, 0.25, 0.75], [-0.45, 2.0, -0.3, 0.8], [0, 2.95, 0.1, 0.7]]) mesh(ctx, new THREE.SphereGeometry(s, 14, 10), leaf, o.x + dx, dy, o.z + dz, g);
      // sprinkles
      for (let k = 0; k < 6; k++) mesh(ctx, new THREE.CapsuleGeometry(0.04, 0.14, 2, 4), ctx.std(CANDY[(k + 2) % 5], { roughness: 0.3 }), o.x + Math.sin(k * 2.1) * 1.05, 2.3 + Math.cos(k * 1.7) * 0.5, o.z + Math.cos(k * 2.1) * 1.05, g).rotation.z = k;
    }
    if (o.m === 'fountain' && o.k === 'c') {
      mesh(ctx, new THREE.CylinderGeometry(1.7, 1.8, 0.7, 32), ctx.std('#F2EFE8', { roughness: 0.8 }), o.x, 0.35, o.z);
      mesh(ctx, new THREE.CylinderGeometry(1.5, 1.5, 0.05, 32), ctx.std('#7FD3FF', { roughness: 0.1, emissive: '#3FA9E8', emissiveIntensity: 0.3 }), o.x, 0.68, o.z);
      mesh(ctx, new THREE.CylinderGeometry(0.18, 0.25, 1.6, 12), ctx.std('#F2EFE8'), o.x, 1.1, o.z);
      mesh(ctx, new THREE.CylinderGeometry(0.7, 0.4, 0.2, 24), ctx.std('#F2EFE8'), o.x, 1.9, o.z);
      for (let i = 0; i < 10; i++) { const d = mesh(ctx, new THREE.SphereGeometry(0.07, 6, 6), ctx.std('#BFEFFF', { transparent: true, opacity: 0.8 }), o.x, 2, o.z, ctx.dyn); d.userData.o = o; water.push(d); }
    }
    if (o.k === 'b' && (o.m === 'slide' || o.m === 'climber' || o.m === 'swings' || o.m === 'tower')) {
      const g = ctx.prop(), s = new THREE.Group(); s.position.set(o.x, 0, o.z); s.rotation.y = o.a ? Math.PI / 2 : 0; g.add(s);
      if (o.m === 'slide') {
        mesh(ctx, new THREE.BoxGeometry(1.2, 2.2, 1.2), ctx.std('#FF6B9E'), 0, 1.1, -1.2, s);
        mesh(ctx, new THREE.BoxGeometry(1.0, 0.1, 3.0), ctx.std('#FFD23F', { roughness: 0.3 }), 0, 1.1, 0.4, s).rotation.x = 0.62;
        for (const k of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(0.08, 0.25, 3.0), ctx.std('#FFB300'), k * 0.5, 1.25, 0.4, s).rotation.x = 0.62;
        mesh(ctx, new THREE.ConeGeometry(0.95, 0.8, 4), ctx.std('#7C5CFF'), 0, 2.6, -1.2, s).rotation.y = Math.PI / 4;
      } else if (o.m === 'climber') {
        const m = ctx.std('#22B8CF', { metalness: 0.3, roughness: 0.4 });
        for (let i = 0; i < 4; i++) for (const k of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), m, -1.5 + i, 0.8, k * 0.5, s);
        for (let j = 0; j < 4; j++) mesh(ctx, new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), m, 0, 0.3 + j * 0.42, j % 2 ? 0.5 : -0.5, s).rotation.z = Math.PI / 2;
      } else if (o.m === 'tower') {
        mesh(ctx, new THREE.CylinderGeometry(1.1, 1.2, 2.6, 16), ctx.std('#FFE3F1', { roughness: 0.8 }), 0, 1.3, 0, s);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mesh(ctx, new THREE.BoxGeometry(0.35, 0.4, 0.35), ctx.std('#FFE3F1'), Math.sin(a) * 1.05, 2.8, Math.cos(a) * 1.05, s); }
        mesh(ctx, new THREE.ConeGeometry(1.0, 1.4, 16), ctx.std('#FF6B9E'), 0, 3.6, 0, s);
        mesh(ctx, new THREE.BoxGeometry(0.5, 0.9, 0.08), ctx.std('#6B3F2A'), 0, 0.45, 1.16, s);
      } else {
        const m = ctx.std('#FF8A3D', { roughness: 0.5 });
        for (const k of [-1, 1]) for (const d of [-1, 1]) { const leg = mesh(ctx, new THREE.CylinderGeometry(0.07, 0.07, 2.5, 8), m, k * 1.8, 1.15, d * 0.35, s); leg.rotation.x = d * 0.28; }
        mesh(ctx, new THREE.CylinderGeometry(0.07, 0.07, 3.8, 8), m, 0, 2.3, 0, s).rotation.z = Math.PI / 2;
        for (const k of [-0.8, 0.8]) {
          const sw = new THREE.Group(); sw.position.set(o.x + (o.a ? 0 : k), 2.3, o.z + (o.a ? k : 0)); sw.rotation.y = o.a ? Math.PI / 2 : 0; ctx.dyn.add(sw);
          for (const d of [-0.25, 0.25]) mesh(ctx, new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), ctx.std('#888'), d, -0.8, 0, sw);
          mesh(ctx, new THREE.BoxGeometry(0.6, 0.06, 0.3), ctx.std('#3DDC97'), 0, -1.6, 0, sw); swings.push(sw);
        }
      }
    }
    if (o.m === 'candywall' && o.k === 'b') {
      const m = stripeMs[(o.v ?? 0) % stripeMs.length], along = o.w > o.d;
      const body = mesh(ctx, new THREE.CylinderGeometry(0.35, 0.35, along ? o.w : o.d, 16), m, o.x, 0.6, o.z); body.rotation.set(along ? 0 : Math.PI / 2, 0, along ? Math.PI / 2 : 0);
      for (const s of [-1, 1]) { const len = (along ? o.w : o.d) / 2; mesh(ctx, new THREE.SphereGeometry(0.42, 14, 10), m, o.x + (along ? s * len : 0), 0.6, o.z + (along ? 0 : s * len)); mesh(ctx, new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8), ctx.std('#FFFFFF'), o.x + (along ? s * len : 0), 0.3, o.z + (along ? 0 : s * len)); }
    }
    if (o.m === 'lolly' && o.k === 'c') {
      const g = ctx.prop(); mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), ctx.std('#FFFFFF'), o.x, 1.2, o.z, g);
      const swirl = ctx.tex(128, 128, (gg) => { gg.fillStyle = CANDY[(o.v ?? 0) % 5]; gg.fillRect(0, 0, 128, 128); gg.strokeStyle = '#FFFFFF'; gg.lineWidth = 10; gg.beginPath(); for (let a = 0; a < 18; a += 0.1) gg.lineTo(64 + Math.cos(a) * a * 3.4, 64 + Math.sin(a) * a * 3.4); gg.stroke(); });
      const d = mesh(ctx, new THREE.CylinderGeometry(0.75, 0.75, 0.18, 24), ctx.std('#ffffff', { map: swirl, roughness: 0.25 }), o.x, 2.75, o.z, g); d.rotation.x = Math.PI / 2; d.rotation.z = o.x;
    }
    if (o.m === 'cotton' && o.k === 'c') { const m = ctx.std(['#FFC2E2', '#C9E8FF', '#E8D2FF'][(o.v ?? 0) % 3], { roughness: 1 }); for (const [dx, dz, s, dy] of [[0, 0, 0.85, 0.75], [0.5, 0.3, 0.6, 0.55], [-0.5, 0.25, 0.65, 0.55], [0.1, -0.5, 0.6, 0.5], [0, 0.1, 0.55, 1.25]]) mesh(ctx, new THREE.SphereGeometry(s, 12, 10), m, o.x + dx, dy, o.z + dz); }
    if (o.m === 'bench' && o.k === 'b') { mesh(ctx, new THREE.BoxGeometry(o.w, 0.12, o.d), ctx.std('#B5733A'), o.x, 0.45, o.z); for (const s of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(o.w > o.d ? 0.1 : o.w, 0.45, o.w > o.d ? o.d : 0.1), ctx.std('#555'), o.x + (o.w > o.d ? s * (o.w / 2 - 0.2) : 0), 0.22, o.z + (o.w > o.d ? 0 : s * (o.d / 2 - 0.2))); }
    if (o.m === 'gumdrop' && o.k === 'c') { const g = mesh(ctx, new THREE.SphereGeometry(o.r + 0.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std(['#FF3D6E', '#FFD23F', '#3DDC97', '#8B5CFF', '#FF8A3D'][(o.v ?? 0) % 5], { roughness: 0.35, emissiveIntensity: 0.1 }), o.x, 0, o.z); g.scale.y = 1.3; }
    if (o.m === 'cart' && o.k === 'b') {
      const g = ctx.prop();
      mesh(ctx, new THREE.BoxGeometry(1.8, 0.9, 1), ctx.std('#FFFFFF'), o.x, 0.75, o.z, g);
      mesh(ctx, new THREE.BoxGeometry(1.82, 0.2, 1.02), ctx.std('#FF6B9E'), o.x, 1.1, o.z, g);
      for (const s of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.28, 0.28, 0.1, 16), ctx.std('#333'), o.x + s * 0.6, 0.28, o.z + 0.52, g).rotation.x = Math.PI / 2;
      mesh(ctx, new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), ctx.std('#ccc'), o.x, 1.9, o.z, g);
      mesh(ctx, new THREE.ConeGeometry(1.3, 0.5, 12), ctx.std('#3FD0FF'), o.x, 2.7, o.z, g);
      for (let k = 0; k < 3; k++) mesh(ctx, new THREE.SphereGeometry(0.16, 10, 8), ctx.std(CANDY[k]), o.x - 0.4 + k * 0.4, 1.28, o.z);
    }
    if (o.m === 'lamp' && o.k === 'c') {
      mesh(ctx, new THREE.CylinderGeometry(0.07, 0.09, 3, 8), stripeMs[0], o.x, 1.5, o.z);
      mesh(ctx, new THREE.SphereGeometry(0.24, 12, 10), ctx.std('#FFF6D0', { emissive: '#FFE38A', emissiveIntensity: 1.2 }), o.x, 3.1, o.z);
    }
    const pa = padArt(ctx, o); if (pa) padUps.push(pa);
  }
  // flowers and tufts all over the grass
  const fl: Inst[] = [], tufts: Inst[] = [];
  for (let i = 0; i < Math.round(H * H * 0.5); i++) { const x = (r() * 2 - 1) * H, z = (r() * 2 - 1) * H; if (ctx.obs.some((o) => Math.hypot(o.x - x, o.z - z) < 1.3) || Math.abs(x) < 1.3 || Math.abs(z) < 1.3) continue; (i % 3 ? tufts : fl).push({ x, y: i % 3 ? 0.12 : 0.18, z, s: 0.6 + r() * 0.6, ry: r() * 6, c: i % 3 ? undefined : CANDY[i % 5] }); }
  scatter(ctx, new THREE.IcosahedronGeometry(0.11, 0), ctx.std('#ffffff', { roughness: 0.5 }), fl);
  scatter(ctx, new THREE.ConeGeometry(0.08, 0.3, 4), ctx.std('#5DBB3F', { roughness: 1 }), tufts);
  // balloons on the fence, clouds, a hot-air balloon far off
  const balloons: THREE.Mesh[] = [];
  for (let i = 0; i < Math.round(H); i++) { const a = r() * Math.PI * 2, x = Math.max(-H, Math.min(H, Math.sin(a) * H * 1.5)), z = Math.max(-H, Math.min(H, Math.cos(a) * H * 1.5)); const b = mesh(ctx, new THREE.SphereGeometry(0.32, 14, 12), ctx.std(['#FF3D6E', '#FFD23F', '#22B8CF', '#8B5CFF', '#3DDC97'][i % 5], { roughness: 0.25 }), x, 3, z, ctx.dyn); b.scale.y = 1.2; balloons.push(b); }
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) { const g = new THREE.Group(); for (let k = 0; k < 4; k++) mesh(ctx, new THREE.SphereGeometry(1.4 + r(), 12, 10), ctx.std('#FFFFFF', { roughness: 1 }), k * 1.4 - 2, Math.sin(k) * 0.4, (r() - 0.5) * 1.2, g).castShadow = false; g.position.set((r() * 2 - 1) * (H + 20), 18 + r() * 6, -H - 10 - r() * 15); ctx.dyn.add(g); clouds.push(g); }
  const hab = new THREE.Group(); mesh(ctx, new THREE.SphereGeometry(2.4, 18, 14), ctx.std('#FF8A3D', { roughness: 0.6 }), 0, 0, 0, hab); mesh(ctx, new THREE.BoxGeometry(0.9, 0.7, 0.9), ctx.std('#8B5A2B'), 0, -3.2, 0, hab); hab.position.set(H + 12, 14, -H - 8); ctx.dyn.add(hab);
  return {
    sky: '#9FD8FF', fog: ['#BFE6FF', 28, 30 + H * 2.6], light: 'day',
    update(w, t, dt) {
      water.forEach((d, i) => { const o = d.userData.o as Ob, p = (t * 0.9 + i / 10) % 1, a = (i / 10) * Math.PI * 2; d.position.set(o.x + Math.sin(a) * p * 1.2, 2 + Math.sin(p * Math.PI) * 0.5 - p * 1.3, o.z + Math.cos(a) * p * 1.2); });
      balloons.forEach((b, i) => { b.position.y = 3 + Math.sin(t * 1.3 + i) * 0.2; });
      swings.forEach((s, i) => { s.rotation.x = Math.sin(t * 2 + i) * 0.35; });
      padUps.forEach((p) => p.update(w, t, dt));
      clouds.forEach((c) => { c.position.x += dt * 0.6; if (c.position.x > H + 30) c.position.x = -H - 30; });
      hab.position.y = 14 + Math.sin(t * 0.4) * 1.2;
      void (w as TagW);
    },
  };
}

// ---- Moonlit Garden (hide & seek) ------------------------------------------------------------------------------------
function moonGarden(ctx: Ctx): Env {
  const H = ctx.w.H ?? 16, r = ctx.r;
  flat(mesh(ctx, new THREE.PlaneGeometry(2 * H + 40, 2 * H + 40), ctx.std('#ffffff', { map: grassTex(ctx, '#25483A', '#1E3D31', '#2E5646', 7, (2 * H + 40) / 8), roughness: 1 })));
  // the plaza in the middle, stepping stones out from it
  const stoneTex = ctx.tex(256, 256, (g) => { g.fillStyle = '#5C6170'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#3E424D'; g.lineWidth = 4; for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } } }, 3);
  flat(mesh(ctx, new THREE.CircleGeometry(5.2, 40), ctx.std('#ffffff', { map: stoneTex, roughness: 0.95 }), 0, 0.012, 0));
  const steps: Inst[] = []; for (let i = 0; i < Math.round(H * 3); i++) { const a = r() * Math.PI * 2, d = 6 + r() * (H - 7), x = Math.sin(a) * d, z = Math.cos(a) * d; if (ctx.obs.some((o) => Math.hypot(o.x - x, o.z - z) < 1.2)) continue; steps.push({ x, y: 0.03, z, s: 0.5 + r() * 0.4, sy: 0.3, ry: r() * 3 }); }
  scatter(ctx, new THREE.CylinderGeometry(0.5, 0.55, 0.12, 7), ctx.std('#6E7384', { roughness: 1 }), steps);
  // an old stone wall round the garden, with lamps on pillars
  const wallTex = ctx.tex(256, 128, (g) => { g.fillStyle = '#4A4E5C'; g.fillRect(0, 0, 256, 128); const rr = rng(2); for (let y = 0; y < 128; y += 21) for (let x = (y / 21) % 2 ? -20 : 0; x < 256; x += 40) { g.fillStyle = ['#565A69', '#41454F', '#5E6272'][Math.floor(rr() * 3)]; g.fillRect(x + 2, y + 2, 37, 18); } }, 1);
  const wallM = ctx.std('#ffffff', { map: wallTex, roughness: 1 });
  for (const s of [-1, 1]) { mesh(ctx, new THREE.BoxGeometry(2 * H + 1.2, 2.2, 0.6), wallM, 0, 1.1, s * (H + 0.3)); mesh(ctx, new THREE.BoxGeometry(0.6, 2.2, 2 * H + 1.2), wallM, s * (H + 0.3), 1.1, 0); }
  const glowM = ctx.std('#FFE6A0', { emissive: '#FFC857', emissiveIntensity: 2.2 });
  const lampsAt: [number, number][] = []; perimeter(ctx, H, Math.max(5, H / 2.5), (x, z) => { if (r() < 0.6) lampsAt.push([x, z]); });
  for (const [x, z] of lampsAt) { mesh(ctx, new THREE.BoxGeometry(0.8, 2.6, 0.8), wallM, x * 1.02, 1.3, z * 1.02); mesh(ctx, new THREE.SphereGeometry(0.22, 12, 10), glowM, x * 1.02, 2.85, z * 1.02); }
  const lamps: THREE.PointLight[] = [];
  if (!ctx.phone) for (const [x, z] of lampsAt.slice(0, 4)) { const l = new THREE.PointLight('#FFC857', 6, 10, 1.8); l.position.set(x, 2.8, z); ctx.scene.add(l); lamps.push(l); }
  // the hedges (each its own mesh, so it can fade when it's between you and the camera)
  const hedgeTex = ctx.tex(256, 256, (g) => { g.fillStyle = '#2F6B3A'; g.fillRect(0, 0, 256, 256); const rr = rng(9); for (let i = 0; i < 1400; i++) { g.fillStyle = ['#255C31', '#3E8E41', '#2A6236'][i % 3]; g.beginPath(); g.arc(rr() * 256, rr() * 256, 3 + rr() * 5, 0, Math.PI * 2); g.fill(); } }, 1);
  const hedgeM = ctx.std('#ffffff', { map: hedgeTex, roughness: 1 });
  const plank = ctx.tex(128, 128, (g) => { g.fillStyle = '#6B4A33'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#4A3222'; g.lineWidth = 3; for (let x = 0; x < 128; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); } }, 1);
  const plankM = ctx.std('#ffffff', { map: plank, roughness: 0.9 });
  const stone = ctx.std('#9AA0B0', { roughness: 0.9 });
  const grassBlades: Inst[] = [], flowers: Inst[] = [], bushes: Inst[] = [], lilies: Inst[] = [], rim: Inst[] = [];
  for (const o of ctx.obs) {
    if (o.m === 'hedge' && o.k === 'b') { const g = ctx.prop(); mesh(ctx, new THREE.BoxGeometry(o.w, o.h, o.d), hedgeM, o.x, o.h / 2, o.z, g); }
    if (o.m === 'shedwall' && o.k === 'b') { const g = ctx.prop(); mesh(ctx, new THREE.BoxGeometry(o.w, o.h, o.d), plankM, o.x, o.h / 2, o.z, g); }
    if (o.m === 'shed' && o.k === 'd') {
      const g = ctx.prop(), S = (o.s ?? 2.6) + 0.5;
      const roof = mesh(ctx, new THREE.ConeGeometry(S * 0.75, 1.3, 4), ctx.std('#7A3B2E', { roughness: 0.9 }), o.x, 3.05, o.z, g); roof.rotation.y = Math.PI / 4;
      flat(mesh(ctx, new THREE.PlaneGeometry(S - 0.6, S - 0.6), plankM, o.x, 0.015, o.z));
      mesh(ctx, new THREE.SphereGeometry(0.12, 8, 6), glowM, o.x, 2.1, o.z);
    }
    if (o.m === 'gazebo' && o.k === 'd') {
      const g = ctx.prop();
      mesh(ctx, new THREE.CylinderGeometry(3.1, 3.2, 0.2, 6), ctx.std('#E8E2D4', { roughness: 0.8 }), 0, 0.1, 0);
      mesh(ctx, new THREE.ConeGeometry(3.5, 1.6, 6), ctx.std('#F2EDE1', { roughness: 0.7 }), 0, 3.6, 0, g);
      mesh(ctx, new THREE.SphereGeometry(0.2, 10, 8), glowM, 0, 2.6, 0);
    }
    if (o.m === 'post' && o.k === 'c') mesh(ctx, new THREE.CylinderGeometry(0.13, 0.15, 2.8, 8), ctx.std('#F2EDE1'), o.x, 1.4, o.z);
    if (o.m === 'tree' && o.k === 'c') {
      const g = ctx.prop(); mesh(ctx, new THREE.CylinderGeometry(0.18, 0.28, 2.2, 8), ctx.std('#4A3020'), o.x, 1.1, o.z, g);
      for (let k = 0; k < 3; k++) mesh(ctx, new THREE.ConeGeometry(1.5 - k * 0.35, 1.9, 10), ctx.std('#1F4D3A', { roughness: 0.9 }), o.x, 2.2 + k * 1.0, o.z, g);
    }
    if (o.m === 'bush' && o.k === 'c') for (const [dx, dz, s] of [[0, 0, 0.75], [0.4, 0.3, 0.5], [-0.4, 0.25, 0.55], [0.1, -0.4, 0.5]]) bushes.push({ x: o.x + dx, y: s * 0.75, z: o.z + dz, s, c: ['#2E7D4A', '#2A7343', '#348A52'][Math.floor(r() * 3)] });
    if (o.m === 'grass' && o.k === 'c') for (let k = 0; k < 70; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * o.r; grassBlades.push({ x: o.x + Math.sin(a) * d, y: 0.55, z: o.z + Math.cos(a) * d, s: 0.7 + r() * 0.6, sy: 0.9 + r() * 0.6, ry: r() * 6, rx: (r() - 0.5) * 0.4, c: ['#4E8A3C', '#5E9C48', '#6FAE52'][k % 3] }); }
    if (o.m === 'hay' && o.k === 'c') { mesh(ctx, new THREE.CylinderGeometry(o.r, o.r + 0.1, 0.9, 16), ctx.std('#D9B54A', { roughness: 1 }), o.x, 0.45, o.z); mesh(ctx, new THREE.ConeGeometry(o.r + 0.05, 0.8, 16), ctx.std('#E3C25E', { roughness: 1 }), o.x, 1.3, o.z); }
    if (o.m === 'log' && o.k === 'b') {
      const along = o.w > o.d, l = mesh(ctx, new THREE.CylinderGeometry(0.48, 0.48, along ? o.w : o.d, 14, 1, true), ctx.std('#6B4A33', { roughness: 1, side: THREE.DoubleSide }), o.x, 0.48, o.z); l.rotation.set(along ? 0 : Math.PI / 2, 0, along ? Math.PI / 2 : 0);
      for (const s of [-1, 1]) { const ring = mesh(ctx, new THREE.RingGeometry(0.36, 0.48, 14), ctx.std('#C9A57A', { side: THREE.DoubleSide }), o.x + (along ? s * o.w / 2 : 0), 0.48, o.z + (along ? 0 : s * o.d / 2)); ring.rotation.y = along ? Math.PI / 2 : 0; }
    }
    if (o.m === 'statue' && o.k === 'c') {
      const g = ctx.prop(); mesh(ctx, new THREE.BoxGeometry(1, 0.8, 1), stone, o.x, 0.4, o.z, g);
      if (o.v === 0) { mesh(ctx, new THREE.CylinderGeometry(0.25, 0.4, 1.2, 10), stone, o.x, 1.4, o.z, g); mesh(ctx, new THREE.SphereGeometry(0.24, 12, 10), stone, o.x, 2.2, o.z, g); for (const s of [-1, 1]) { const wg = mesh(ctx, new THREE.BoxGeometry(0.06, 0.8, 0.45), stone, o.x + s * 0.3, 1.7, o.z - 0.15, g); wg.rotation.z = s * 0.5; } }
      else if (o.v === 1) mesh(ctx, new THREE.SphereGeometry(0.6, 16, 12), stone, o.x, 1.4, o.z, g);
      else { mesh(ctx, new THREE.ConeGeometry(0.45, 1.8, 4), stone, o.x, 1.7, o.z, g); }
    }
    if (o.m === 'pond' && o.k === 'c') {
      flat(mesh(ctx, new THREE.CircleGeometry(o.r, 28), ctx.std('#1B3A5C', { roughness: 0.05, metalness: 0.3, emissive: '#0E2A4A', emissiveIntensity: 0.4 }), o.x, 0.03, o.z));
      for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; rim.push({ x: o.x + Math.sin(a) * (o.r + 0.1), y: 0.12, z: o.z + Math.cos(a) * (o.r + 0.1), s: 0.25 + r() * 0.12, ry: r() * 3 }); }
      for (let k = 0; k < 4; k++) { const a = r() * 6, d = r() * (o.r - 0.4); lilies.push({ x: o.x + Math.sin(a) * d, y: 0.05, z: o.z + Math.cos(a) * d, s: 0.8 + r() * 0.5, ry: r() * 6 }); }
    }
    if (o.m === 'barrel' && o.k === 'c') { mesh(ctx, new THREE.CylinderGeometry(0.42, 0.42, 1, 14), ctx.std('#7A4E2D', { roughness: 0.9 }), o.x, 0.5, o.z); for (const y of [0.2, 0.8]) mesh(ctx, new THREE.TorusGeometry(0.43, 0.03, 4, 18), ctx.std('#333'), o.x, y, o.z).rotation.x = Math.PI / 2; }
    if (o.m === 'well' && o.k === 'c') { mesh(ctx, new THREE.CylinderGeometry(1.1, 1.1, 0.9, 20, 1, true), ctx.std('#8C8C99', { side: THREE.DoubleSide }), o.x, 0.45, o.z); for (const s of [-1, 1]) mesh(ctx, new THREE.BoxGeometry(0.12, 2, 0.12), ctx.std('#6B4226'), o.x + s * 1, 1, o.z); mesh(ctx, new THREE.ConeGeometry(1.5, 0.7, 4), ctx.std('#7A3B2E'), o.x, 2.3, o.z).rotation.y = Math.PI / 4; }
    if (o.m === 'flowers' && o.k === 'd') for (let k = 0; k < 24; k++) flowers.push({ x: o.x + (r() - 0.5) * 2, y: 0.25, z: o.z + (r() - 0.5) * 1.4, s: 0.8 + r() * 0.5, c: ['#E8A0FF', '#FFB3C8', '#A0D2FF', '#FFF2A0'][((o.v ?? 0) + k) % 4] });
    if (o.m === 'lamp' && o.k === 'c') { mesh(ctx, new THREE.CylinderGeometry(0.06, 0.08, 2.3, 8), ctx.std('#222'), o.x, 1.15, o.z); mesh(ctx, new THREE.SphereGeometry(0.2, 12, 10), glowM, o.x, 2.4, o.z); }
  }
  scatter(ctx, new THREE.SphereGeometry(1, 10, 8), ctx.std('#ffffff', { roughness: 1 }), bushes, true);
  scatter(ctx, new THREE.ConeGeometry(0.06, 1.1, 3), ctx.std('#ffffff', { roughness: 1 }), grassBlades);
  scatter(ctx, new THREE.IcosahedronGeometry(0.1, 0), ctx.std('#ffffff', { roughness: 0.6, emissive: '#332244', emissiveIntensity: 0.3 }), flowers);
  scatter(ctx, new THREE.CircleGeometry(0.28, 10).rotateX(-Math.PI / 2), ctx.std('#3E8E41', { roughness: 0.7 }), lilies);
  scatter(ctx, new THREE.DodecahedronGeometry(1, 0), stone, rim);
  // a big moon, stars, fireflies
  const moon = mesh(ctx, new THREE.SphereGeometry(4, 24, 18), new THREE.MeshBasicMaterial({ color: '#F4F1DE', fog: false }), -H - 10, 26, -H - 40, ctx.dyn); moon.castShadow = false;
  const stars = motes(ctx, 300, '#FFFFFF', 0.35); for (let i = 0; i < 300; i++) { const a = r() * Math.PI * 2, e = 0.25 + r() * 1.1; stars.pos.set([Math.cos(a) * Math.cos(e) * 90, Math.sin(e) * 90, Math.sin(a) * Math.cos(e) * 90], i * 3); } stars.done(); stars.m.fog = false;
  const flies = motes(ctx, 50, '#E8FF8A', 0.18);
  const fly = Array.from({ length: 50 }, () => ({ x: (r() * 2 - 1) * H, z: (r() * 2 - 1) * H, a: r() * 6 }));
  return {
    sky: '#0B1430', fog: ['#0B1430', 12, 40], light: 'night',
    update(_w, t) {
      fly.forEach((f, i) => flies.pos.set([f.x + Math.sin(t * 0.3 + f.a) * 2, 0.6 + Math.sin(t * 2 + i) * 0.4, f.z + Math.cos(t * 0.27 + f.a) * 2], i * 3)); flies.done();
      flies.m.opacity = 0.6 + 0.3 * Math.sin(t * 3);
      lamps.forEach((l, i) => { l.intensity = 5 + Math.sin(t * 4 + i) * 0.6; });
    },
    // the seeker only sees what their lantern lights, and never what's tucked in a bush (unless right next to it)
    hidden(w, viewer, other) {
      const hs = w as HSW;
      if (!viewer || viewer.id !== hs.seeker || other.id === viewer.id || hs.phase === 'between' || hs.phase === 'done') return 1;
      if (hs.found[other.id] != null) return 1;
      const d = Math.hypot(other.x - viewer.x, other.z - viewer.z);
      const soft = softAt(ctx.obs, other.x, other.z);
      if (soft) return d < (SOFT_REVEAL[soft.m] ?? 1.5) ? 1 : 0;
      if (d < 1.6) return 1;
      if (d > 10 || !sees(ctx.obs, viewer.x, viewer.z, other.x, other.z)) return 0;
      // in front of you (a wide lantern beam)
      const ang = Math.atan2(other.x - viewer.x, other.z - viewer.z); let da = ang - viewer.face; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      return Math.abs(da) < 1.1 || d < 3 ? 1 : 0;
    },
  };
}

// ---- Volcano Lake (floor is lava) ---------------------------------------------------------------------------------------
const LAYER_COLS = [['#FF7AC8', '#3FD0FF'], ['#FFD23F', '#B6E33D'], ['#C9A0FF', '#FF9F5A']];
function volcano(ctx: Ctx): Env {
  const r = ctx.r, lw0 = ctx.w as LavaW, N = lw0.N ?? 10, S = LAVA.S, half = (N * S) / 2;
  const lavaTex = ctx.tex(256, 256, (g) => { const rr = rng(4); g.fillStyle = '#FF4D00'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 90; i++) { g.fillStyle = ['#FF8A00', '#FFD23F', '#C21D00'][i % 3]; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(rr() * 256, rr() * 256, 8 + rr() * 26, 5 + rr() * 14, rr() * 3, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; }, 8);
  const lake = mesh(ctx, new THREE.PlaneGeometry(120, 120), ctx.std('#ffffff', { map: lavaTex, emissive: '#ffffff', emissiveMap: lavaTex, emissiveIntensity: 1.1, roughness: 0.6 }), 0, LAVA.LAVA, 0, ctx.dyn); flat(lake);
  const glow = new THREE.PointLight('#FF6A00', 70, 50, 1.3); glow.position.set(0, LAVA.LAVA + 3, 0); ctx.scene.add(glow);
  // the crater walls, rock spires, and a volcano smoking in the distance
  const rock = ctx.std('#3B2A26', { roughness: 1, flatShading: true });
  for (let i = 0; i < 34; i++) { const a = (i / 34) * Math.PI * 2, d = half + 8 + r() * 6; const m = mesh(ctx, new THREE.ConeGeometry(3 + r() * 3, 18 + r() * 18, 6), rock, Math.sin(a) * d, LAVA.LAVA + 6, Math.cos(a) * d); m.rotation.y = r() * 3; }
  for (let i = 0; i < 8; i++) { const a = r() * Math.PI * 2, d = half + 2 + r() * 4; mesh(ctx, new THREE.ConeGeometry(0.8 + r(), 10 + r() * 8, 5), rock, Math.sin(a) * d, LAVA.LAVA + 4, Math.cos(a) * d).rotation.y = r() * 3; }
  mesh(ctx, new THREE.CylinderGeometry(6, 26, 30, 10, 1, true), rock, -18, 0, -70);
  const crater = mesh(ctx, new THREE.CircleGeometry(6, 16), new THREE.MeshBasicMaterial({ color: '#FF6A00' }), -18, 14.9, -70); flat(crater);
  // stone pillars holding the floors up
  const pil = ctx.std('#5A4038', { roughness: 1, flatShading: true });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(ctx, new THREE.CylinderGeometry(0.6, 0.9, -LAVA.LAVA + 1, 7), pil, sx * (half + 0.6), LAVA.LAVA / 2, sz * (half + 0.6));
  // the floors: one instanced mesh each, each tile with its own colour and fall
  const geo = ctx.T(new THREE.BoxGeometry(S - 0.08, 0.45, S - 0.08));
  const layers = LAVA.Y.map((y, L) => {
    const im = new THREE.InstancedMesh(ctx.T(geo.clone()), ctx.std('#ffffff', { roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.06 }), N * N);
    im.castShadow = true; im.receiveShadow = true; ctx.scene.add(im); im.userData.keep = true;
    const tiles = Array.from({ length: N * N }, (_, i) => ({ x: (i % N - (N - 1) / 2) * S, z: (Math.floor(i / N) - (N - 1) / 2) * S, base: new THREE.Color(LAYER_COLS[L][((i % N) + Math.floor(i / N)) % 2]), fall: 0, st: '' }));
    return { im, tiles, y };
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0.0001, 0.0001, 0.0001), hot = new THREE.Color('#FF5A3D'), col = new THREE.Color();
  // mushrooms (never crumble, bounce you up)
  const shrooms: Inst[] = [], stems: Inst[] = [], dots: Inst[] = [];
  lw0.tiles.forEach((row, L) => [...row].forEach((c, i) => { if (c !== 'b') return; const x = (i % N - (N - 1) / 2) * S, z = (Math.floor(i / N) - (N - 1) / 2) * S, y = LAVA.Y[L]; stems.push({ x, y: y + 0.2, z }); shrooms.push({ x, y: y + 0.45, z }); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; dots.push({ x: x + Math.sin(a) * 0.45, y: y + 0.62, z: z + Math.cos(a) * 0.45 }); } }));
  scatter(ctx, new THREE.CylinderGeometry(0.22, 0.28, 0.4, 10), ctx.std('#F4E7D2'), stems, true);
  scatter(ctx, new THREE.SphereGeometry(0.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#E8323C', { roughness: 0.4, emissive: '#8A0A10', emissiveIntensity: 0.3 }), shrooms, true);
  scatter(ctx, new THREE.SphereGeometry(0.1, 8, 6), ctx.std('#FFFFFF'), dots);
  const embers = motes(ctx, ctx.phone ? 60 : 140, '#FFB13D', 0.22);
  const eb = Array.from({ length: ctx.phone ? 60 : 140 }, () => ({ x: (r() * 2 - 1) * (half + 6), z: (r() * 2 - 1) * (half + 6), s: 0.3 + r() * 0.6, a: r() }));
  const smoke = motes(ctx, 60, '#5A4A48', 2.4); smoke.m.blending = THREE.NormalBlending; smoke.m.opacity = 0.35;
  return {
    sky: '#2A0A06', fog: ['#4A1408', 22, 70], light: 'lava',
    update(w, t, dt) {
      const lw = w as LavaW, lv = lw.lava ?? LAVA.LAVA;
      lake.position.y = lv; glow.position.y = lv + 3;
      lavaTex.offset.set(t * 0.02, t * 0.013);
      glow.intensity = 60 + Math.sin(t * 2) * 10 + (lv > LAVA.LAVA ? 25 : 0);
      layers.forEach((Ly, li) => {
        const row = lw.tiles?.[li] ?? ''; let dirtyC = false;
        Ly.tiles.forEach((tile, i) => {
          const st = row[i] ?? '0';
          if (st === '0') {
            if (tile.st !== '0' && tile.st !== '') tile.fall = 0.0001;
            if (tile.fall > 0 && tile.fall < 1.3) { tile.fall += dt; e.set(tile.fall * 2, 0, tile.fall); q.setFromEuler(e); m4.compose(v.set(tile.x, Ly.y - 0.225 - tile.fall * tile.fall * 12, tile.z), q, one); }
            else m4.compose(v.set(tile.x, -999, tile.z), q.identity(), zero);
          } else {
            tile.fall = 0;
            m4.compose(v.set(tile.x, Ly.y - 0.225 + (st === '2' ? Math.sin(t * 60 + i) * 0.03 : 0), tile.z), q.identity(), one);
            if (st !== tile.st) { Ly.im.setColorAt(i, col.copy(st === '2' ? hot : tile.base)); dirtyC = true; }
          }
          tile.st = st; Ly.im.setMatrixAt(i, m4);
        });
        Ly.im.instanceMatrix.needsUpdate = true; if (dirtyC && Ly.im.instanceColor) Ly.im.instanceColor.needsUpdate = true;
      });
      eb.forEach((p, i) => { const k = (t * p.s * 0.15 + p.a) % 1; embers.pos.set([p.x + Math.sin(t + i) * 0.4, lv + k * 22, p.z], i * 3); }); embers.done();
      for (let i = 0; i < 60; i++) { const k = (t * 0.05 + i / 60) % 1; smoke.pos.set([-18 + Math.sin(i * 7) * k * 10, 15 + k * 30, -70 + Math.cos(i * 3) * k * 6], i * 3); } smoke.done();
      (crater.material as THREE.MeshBasicMaterial).color.setHSL(0.06, 1, 0.45 + Math.sin(t * 3) * 0.08);
    },
  };
}

// ---- Grand Ballroom (musical chairs) ------------------------------------------------------------------------------------
function ballroom(ctx: Ctx): Env {
  const R = ctx.w.R ?? 10, r = ctx.r, style = Math.floor(r() * 3);
  const floorTex = ctx.tex(1024, 1024, (g) => {
    if (style === 0) { g.fillStyle = '#8B5A3C'; g.fillRect(0, 0, 1024, 1024); for (let k = 0; k < 9; k++) { g.strokeStyle = k % 2 ? '#A0693F' : '#6E4429'; g.lineWidth = 56; g.beginPath(); g.arc(512, 512, 60 + k * 56, 0, Math.PI * 2); g.stroke(); } }
    else if (style === 1) { for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { g.fillStyle = (i + j) % 2 ? '#F4F1EA' : '#2A2433'; g.fillRect(i * 64, j * 64, 64, 64); } }
    else { g.fillStyle = '#3B1F4A'; g.fillRect(0, 0, 1024, 1024); g.strokeStyle = '#E9C46A'; g.lineWidth = 6; for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.moveTo(512, 512); g.lineTo(512 + Math.cos(a) * 520, 512 + Math.sin(a) * 520); g.stroke(); } for (let k = 1; k < 8; k++) { g.beginPath(); g.arc(512, 512, k * 66, 0, Math.PI * 2); g.stroke(); } }
    g.fillStyle = '#E9C46A'; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(512, 512); g.arc(512, 512, 120, a, a + 0.1); g.fill(); }
  }, 1);
  flat(mesh(ctx, new THREE.CircleGeometry(R + 0.6, 64), ctx.std('#ffffff', { map: floorTex, roughness: 0.3, metalness: 0.05 })));
  flat(mesh(ctx, new THREE.PlaneGeometry(90, 90), ctx.std('#2A1A2E', { roughness: 1 }), 0, -0.01, 0));
  flat(mesh(ctx, new THREE.RingGeometry(R + 0.6, R + 1.0, 64), ctx.std('#E9C46A', { metalness: 0.6, roughness: 0.3 }), 0, 0.01, 0));
  // pillars and curtains round the edge, tall arched windows with the moon outside, a grand staircase
  const nP = Math.round(R * 1.7);
  const curtain = ctx.std(['#8B1E3F', '#1E3F8B', '#2E6B3A'][style], { roughness: 1, side: THREE.DoubleSide });
  for (let i = 0; i < nP; i++) {
    const a = (i / nP) * Math.PI * 2, x = Math.sin(a) * (R + 1.2), z = Math.cos(a) * (R + 1.2);
    mesh(ctx, new THREE.CylinderGeometry(0.35, 0.4, 6, 14), ctx.std('#F2E8D5', { roughness: 0.5 }), x, 3, z);
    mesh(ctx, new THREE.BoxGeometry(0.9, 0.3, 0.9), ctx.std('#E9C46A', { metalness: 0.6, roughness: 0.3 }), x, 6, z);
    mesh(ctx, new THREE.BoxGeometry(0.9, 0.3, 0.9), ctx.std('#E9C46A', { metalness: 0.6, roughness: 0.3 }), x, 0.15, z);
    const c = mesh(ctx, new THREE.PlaneGeometry(2.4, 5.4), i % 3 === 0 ? ctx.std('#1B2A55', { emissive: '#22336B', emissiveIntensity: 0.5, side: THREE.DoubleSide }) : curtain, Math.sin(a + Math.PI / nP) * (R + 1.8), 2.9, Math.cos(a + Math.PI / nP) * (R + 1.8)); c.lookAt(0, 2.9, 0);
  }
  for (let k = 0; k < 6; k++) mesh(ctx, new THREE.BoxGeometry(5 - k * 0.3, 0.3, 0.8), ctx.std('#8B1E3F', { roughness: 0.9 }), 0, 0.15 + k * 0.3, -(R + 2.4 + k * 0.8));
  // the gramophone in the middle
  mesh(ctx, new THREE.CylinderGeometry(1.3, 1.4, 1.1, 32), ctx.std('#5A3A26', { roughness: 0.4 }), 0, 0.55, 0);
  const record = mesh(ctx, new THREE.CylinderGeometry(0.6, 0.6, 0.04, 32), ctx.std('#111', { roughness: 0.2 }), 0, 1.13, 0, ctx.dyn);
  const horn = mesh(ctx, new THREE.ConeGeometry(0.7, 1.4, 24, 1, true), ctx.std('#E9C46A', { metalness: 0.8, roughness: 0.25, side: THREE.DoubleSide }), 0.3, 2.1, 0.3); horn.rotation.set(-0.9, 0, -0.5);
  // tables with candles, potted palms, polished (slippery) patches
  const flames: THREE.Mesh[] = [];
  const cloth = [ctx.std('#FFFFFF', { roughness: 0.9 }), ctx.std('#F7D6E0', { roughness: 0.9 }), ctx.std('#D6E8F7', { roughness: 0.9 })];
  const sparkle: [number, number, number][] = [];
  for (const o of ctx.obs) {
    if (o.m === 'table' && o.k === 'c') {
      mesh(ctx, new THREE.CylinderGeometry(0.8, 0.95, 0.85, 20), cloth[(o.v ?? 0) % 3], o.x, 0.42, o.z);
      mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), ctx.std('#FFF6E0'), o.x + 0.2, 1.0, o.z);
      flames.push(mesh(ctx, new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFC857' }), o.x + 0.2, 1.2, o.z, ctx.dyn));
      mesh(ctx, new THREE.CylinderGeometry(0.1, 0.07, 0.25, 10), ctx.std('#9FD8FF', { transparent: true, opacity: 0.7, roughness: 0.1 }), o.x - 0.25, 0.97, o.z + 0.1);
      for (let k = 0; k < 3; k++) mesh(ctx, new THREE.SphereGeometry(0.07, 8, 6), ctx.std(['#FF3D6E', '#FFD23F', '#FF9FD6'][k]), o.x - 0.25 + (k - 1) * 0.06, 1.15, o.z + 0.1);
    }
    if (o.m === 'palm' && o.k === 'c') {
      const g = ctx.prop(); mesh(ctx, new THREE.CylinderGeometry(0.42, 0.32, 0.6, 14), ctx.std('#B5485D'), o.x, 0.3, o.z, g);
      mesh(ctx, new THREE.CylinderGeometry(0.07, 0.1, 1.4, 8), ctx.std('#6B4226'), o.x, 1.2, o.z, g);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, leaf = mesh(ctx, new THREE.ConeGeometry(0.16, 1.3, 4), ctx.std('#2E8B57', { roughness: 0.8 }), o.x + Math.sin(a) * 0.45, 1.9, o.z + Math.cos(a) * 0.45, g); leaf.rotation.set(Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1); }
    }
    if (o.k === 'z' && o.m === 'ice') { flat(mesh(ctx, new THREE.CircleGeometry(o.r, 32), ctx.std('#DDEBFF', { roughness: 0.02, metalness: 0.5, transparent: true, opacity: 0.45 }), o.x, 0.015, o.z)); for (let k = 0; k < 6; k++) sparkle.push([o.x + (r() - 0.5) * o.r * 1.4, 0.1, o.z + (r() - 0.5) * o.r * 1.4]); }
  }
  const sp = motes(ctx, Math.max(1, sparkle.length), '#FFFFFF', 0.25);
  // a disco ball and chandeliers up high, spotlights
  const disco = mesh(ctx, new THREE.IcosahedronGeometry(1.1, 2), ctx.std('#E0E6F5', { metalness: 0.35, roughness: 0.2, flatShading: true, emissive: '#8890B0', emissiveIntensity: 0.35 }), 0, 9, 0, ctx.dyn); disco.castShadow = false;
  const chand: THREE.Object3D[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5, g = ctx.prop(), x = Math.sin(a) * R * 0.55, z = Math.cos(a) * R * 0.55;
    mesh(ctx, new THREE.TorusGeometry(0.9, 0.06, 6, 24), ctx.std('#E9C46A', { metalness: 0.7, roughness: 0.3 }), x, 8.2, z, g).rotation.x = Math.PI / 2;
    for (let j = 0; j < 8; j++) { const b = (j / 8) * Math.PI * 2; mesh(ctx, new THREE.SphereGeometry(0.1, 8, 6), ctx.std('#FFF6D0', { emissive: '#FFE38A', emissiveIntensity: 1.6 }), x + Math.sin(b) * 0.9, 8.35, z + Math.cos(b) * 0.9, g); }
    g.traverse((x) => { x.castShadow = false; }); chand.push(g);
  }
  const spots: THREE.SpotLight[] = [];
  if (!ctx.phone) for (let i = 0; i < 3; i++) { const s = new THREE.SpotLight(['#FF3D9A', '#22E3FF', '#FFE14D'][i], 45, 35, 0.35, 0.6); s.position.set(0, 9, 0); ctx.scene.add(s, s.target); spots.push(s); }
  // chairs: a pool of them, shown as the music stops
  const chairM = ctx.std('#E9C46A', { metalness: 0.5, roughness: 0.3 }), seatM = ctx.std('#B5485D', { roughness: 0.8 });
  const chairsG = Array.from({ length: 7 }, () => {
    const g = new THREE.Group(); g.visible = false; ctx.dyn.add(g);
    mesh(ctx, new THREE.BoxGeometry(0.7, 0.12, 0.7), seatM, 0, 0.5, 0, g);
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) mesh(ctx, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), chairM, x, 0.25, z, g);
    mesh(ctx, new THREE.BoxGeometry(0.7, 0.8, 0.08), chairM, 0, 0.95, -0.32, g);
    const halo = mesh(ctx, new THREE.RingGeometry(0.6, 0.78, 32), new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0, 0.02, 0, g); flat(halo);
    return { g, halo, k: 0 };
  });
  return {
    sky: '#1A0E24', fog: ['#1A0E24', 20, 55], light: 'ball', occluders: [disco, ...chand],
    update(w, t, dt) {
      const cw = w as ChairW, playing = cw.phase === 'music';
      disco.rotation.y += dt * (playing ? 1.2 : 0.1); record.rotation.y += dt * (playing ? 3.5 : 0);
      flames.forEach((f, i) => f.scale.setScalar(1 + Math.sin(t * 13 + i) * 0.2));
      spots.forEach((s, i) => { s.target.position.set(Math.sin(t * (playing ? 1.1 : 0.2) + i * 2.1) * R * 0.6, 0, Math.cos(t * (playing ? 0.9 : 0.2) + i * 2.1) * R * 0.6); s.intensity = playing ? 45 : (Math.floor(t * 6) % 2 ? 70 : 10); });
      sparkle.forEach((p, i) => sp.pos.set([p[0], p[1] + Math.abs(Math.sin(t * 2 + i)) * 0.1, p[2]], i * 3)); sp.m.opacity = 0.4 + 0.5 * Math.abs(Math.sin(t * 3)); sp.done();
      chairsG.forEach((c, i) => {
        const ch = cw.chairs?.[i];
        if (!ch) { c.g.visible = false; c.k = 0; return; }
        c.g.visible = true; c.k = Math.min(1, c.k + dt * 4);
        c.g.position.set(ch.x, 0, ch.z); c.g.scale.setScalar(c.k < 1 ? c.k * (1.2 - 0.2 * c.k) : 1); c.g.lookAt(0, 0, 0);
        (c.halo.material as THREE.MeshBasicMaterial).opacity = ch.by ? 0 : 0.5 + 0.4 * Math.sin(t * 8);
      });
    },
  };
}

const ENVS: Record<string, (ctx: Ctx) => Env> = { tag: candyPark, hide: moonGarden, lava: volcano, chairs: ballroom, ...ENVS2 };

export function createWorld3D(o: { canvas: HTMLCanvasElement; game: string; seats: Seat3[]; me: string; world: W3; reduceMotion?: boolean }) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 260);
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const std = (c: string, p: THREE.MeshStandardMaterialParameters = {}) => { const k = c + JSON.stringify(p, (kk, v) => (v instanceof THREE.Texture ? v.uuid : v)); let m = mats.get(k); if (!m) { m = T(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...p })); mats.set(k, m); } return m; };
  const tex = (w: number, h: number, d: (g: CanvasRenderingContext2D) => void, rep = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; d(c.getContext('2d')!); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; return t; };
  const root = new THREE.Group(), dyn = new THREE.Group(), props: THREE.Group[] = [];
  scene.add(root, dyn);
  const ctx: Ctx = { scene, root, dyn, props, T, std, tex, w: o.world, obs: o.world.obs ?? [], phone, r: rng(o.world.seed * 31 + 7), colors: o.seats.map((s) => s.color), prop: () => { const g = new THREE.Group(); scene.add(g); props.push(g); return g; } };
  const env = ENVS[o.game](ctx);
  // squash the still scenery into a few draw calls
  bake(root, T); for (const g of props) bake(g, T);
  scene.background = new THREE.Color(env.sky); scene.fog = new THREE.Fog(env.fog[0], env.fog[1], env.fog[2]);
  // light by mood
  const L = env.light;
  const LIGHT = { day: ['#FFFFFF', '#3A2A20', 1.1, '#FFF4E0', 2.2], night: ['#4A5FA8', '#0B1430', 0.65, '#9FB4FF', 0.8], lava: ['#FF9A6B', '#3A2A20', 1.1, '#FFB27A', 2.2], ball: ['#C9A0FF', '#3A2A20', 1.15, '#FFF4E0', 0.9], snow: ['#DCEBFF', '#5A6B8A', 1.15, '#F2F6FF', 1.7], dusk: ['#FFC9A8', '#3A2A4A', 1.05, '#FFB37A', 2.0] } as const;
  const [skyC, groundC, hemi, sunC, sunI] = LIGHT[L];
  scene.add(new THREE.HemisphereLight(skyC, groundC, hemi));
  const sun = new THREE.DirectionalLight(sunC, sunI);
  sun.castShadow = true; sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  // the seeker's lantern
  const lantern = new THREE.SpotLight('#FFE6A0', o.game === 'hide' ? 55 : 0, 15, 0.75, 0.5, 1.4); scene.add(lantern, lantern.target);

  // tall things that stand between the camera and you fade out while they do
  const occ: THREE.Mesh[] = [];
  for (const g of [...props, ...(env.occluders ?? [])]) g.traverse((x) => { if (x instanceof THREE.Mesh && !Array.isArray(x.material)) occ.push(x); });
  const ray = new THREE.Raycaster(), faded = new Set<THREE.Mesh>();
  const fadeMat = (m: THREE.Mesh) => (m.userData.fade ??= (() => { const f = T((m.material as THREE.Material).clone()); f.transparent = true; f.opacity = 0.25; f.depthWrite = false; return f; })()) as THREE.Material;

  // ---- everyone's explorer ----
  const tagTex = (text: string, bg = 'rgba(20,12,30,0.75)') => { const c = document.createElement('canvas'); c.width = 256; c.height = 56; const g = c.getContext('2d')!; g.font = '800 26px ui-rounded, system-ui, sans-serif'; const w = Math.min(250, g.measureText(text).width + 24); g.fillStyle = bg; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 42, 21); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 28); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return T(t); };
  const ringG = T(new THREE.RingGeometry(0.34, 0.46, 28)), shadowG = T(new THREE.CircleGeometry(0.34, 18)), itG = T(new THREE.SphereGeometry(0.75, 18, 14));
  const shadowM = T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
  const avs = new Map(o.seats.map((s) => {
    const tx = T(new THREE.TextureLoader().load(s.url)); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = THREE.RepeatWrapping;
    const sp = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: tx, transparent: true, alphaTest: 0.05 }))); sp.center.set(0.5, 0); sp.scale.set(1.35 * (46 / 68), 1.35, 1); scene.add(sp);
    // you, seen through walls (a faint ghost of yourself so you never lose track of where you are)
    const xr = s.id === o.me ? new THREE.Sprite(T(new THREE.SpriteMaterial({ map: tx, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, color: '#B8C8FF' }))) : null;
    if (xr) { xr.center.set(0.5, 0); xr.scale.copy(sp.scale); xr.renderOrder = 4; scene.add(xr); }
    const ringM = T(new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.85, depthWrite: false }));
    const ring = new THREE.Mesh(ringG, ringM); ring.rotation.x = -Math.PI / 2; scene.add(ring);
    const shadow = new THREE.Mesh(shadowG, shadowM); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    const nameTex = tagTex(s.id === o.me ? 'You' : s.name);
    const tag = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: nameTex, transparent: true, depthWrite: false, depthTest: false }))); tag.scale.set(1.4, 0.31, 1); tag.renderOrder = 5; scene.add(tag);
    const it = new THREE.Mesh(itG, T(new THREE.MeshBasicMaterial({ color: '#FF2D55', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }))); it.visible = false; scene.add(it);
    return [s.id, { sp, xr, tx, ring, ringM, shadow, tag, nameTex, it, walk: 0, lastX: NaN, lastZ: 0, color: s.color }];
  }));
  const itTag = tagTex('IT!', '#FF2D55');
  // tag: an arrow at your feet pointing at whoever's it (or, if you're it, the nearest person)
  const pointer = new THREE.Mesh(T(new THREE.ConeGeometry(0.22, 0.6, 3).rotateX(Math.PI / 2)), T(new THREE.MeshBasicMaterial({ color: '#FF2D55', transparent: true, opacity: 0.9, depthTest: false })));
  pointer.renderOrder = 6; pointer.visible = false; scene.add(pointer);
  // leaves rustling when someone moves inside a bush (or the grass, or a haystack)
  const leafN = 60, leafPos = new Float32Array(leafN * 3), leafG = T(new THREE.BufferGeometry()); leafG.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
  const leafM = T(new THREE.PointsMaterial({ color: '#7BC86B', size: 0.16, transparent: true, opacity: 0.9, depthWrite: false })); const leaves = new THREE.Points(leafG, leafM); leaves.frustumCulled = false; scene.add(leaves);
  const leaf = Array.from({ length: leafN }, () => ({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0 })); let leafK = 0, rustleAt = 0;

  // ---- camera ----
  const camPos = new THREE.Vector3(0, 30, 30), camLook = new THREE.Vector3(0, 0, 0);
  const resize = () => { const rc = o.canvas.getBoundingClientRect(); if (!rc.width) return; renderer.setSize(rc.width, rc.height, false); camera.aspect = rc.width / rc.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let last = performance.now();
  const span = o.world.H ?? o.world.R ?? o.world.HX ?? (o.world as { R0?: number }).R0 ?? ((o.world as LavaW).N ?? 10) * LAVA.S / 2;

  return {
    /** draw one frame: w is what to show right now (already smoothed), t the time */
    frame(w: W3, t: number, intro: number) {
      const now = performance.now(), raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now; tune(raw);
      env.update(w, t, dt);
      const meP = w.ps.find((p) => p.id === o.me);
      const hs = o.game === 'hide' ? (w as HSW) : null;
      for (const p of w.ps) {
        const av = avs.get(p.id); if (!av) continue;
        const vis = env.hidden ? env.hidden(w, meP, p) : 1;
        const ghost = (hs && hs.found[p.id] != null) || (!p.alive && o.game !== 'lava');
        const seen = vis > 0 && !(o.game === 'lava' && !p.alive && p.y < ((w as LavaW).lava ?? LAVA.LAVA) - 1);
        const moved = Number.isNaN(av.lastX) ? 0 : Math.hypot(p.x - av.lastX, p.z - av.lastZ); av.lastX = p.x; av.lastZ = p.z;
        if (moved > 0.005) av.walk += moved * 3;
        const bob = p.on && moved > 0.01 && !o.reduceMotion ? Math.abs(Math.sin(av.walk)) * 0.1 : 0;
        av.sp.visible = av.tag.visible = seen; av.ring.visible = av.shadow.visible = seen && p.alive;
        const soft = (o.game === 'hide' || o.game === 'tag') && softAt(ctx.obs, p.x, p.z);
        av.sp.position.set(p.x, p.y + bob, p.z); av.sp.material.opacity = ghost ? 0.35 : soft && meP?.id !== hs?.seeker ? 0.55 : 1;
        if (av.xr) { av.xr.visible = seen && p.alive; av.xr.position.copy(av.sp.position); }
        // rustle!
        if (soft && moved > 0.02 && now - rustleAt > 60) { rustleAt = now; for (let k = 0; k < 3; k++) { const l = leaf[leafK++ % leafN]; Object.assign(l, { x: p.x, y: 0.8 + Math.random() * 0.5, z: p.z, vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, life: 1 }); } }
        // face the way you're going
        const fx = Math.sin(p.face) >= 0 ? 1 : -1; av.tx.repeat.x = fx; av.tx.offset.x = fx < 0 ? 1 : 0;
        av.ring.position.set(p.x, Math.max(p.y, -30) + 0.03, p.z); av.shadow.position.set(p.x, (o.game === 'lava' ? groundBelow(w as LavaW, p.x, p.z, p.y) : 0) + 0.02, p.z);
        av.tag.position.set(p.x, p.y + 1.7, p.z);
        const isIt = o.game === 'tag' && (w as TagW).it === p.id;
        av.it.visible = isIt && seen; if (isIt) { av.it.position.set(p.x, p.y + 0.7, p.z); av.it.scale.setScalar(1 + Math.sin(t * 8) * 0.1); }
        av.tag.material.map = isIt ? itTag : av.nameTex;
        av.ringM.color.set(isIt ? '#FF2D55' : av.color);
      }
      // falling leaves
      for (let i = 0; i < leafN; i++) { const l = leaf[i]; if (l.life > 0) { l.life -= dt * 1.2; l.vy -= 6 * dt; l.x += l.vx * dt; l.y += l.vy * dt; l.z += l.vz * dt; if (l.life <= 0 || l.y < 0) l.y = -99; } leafPos[i * 3] = l.x; leafPos[i * 3 + 1] = l.y; leafPos[i * 3 + 2] = l.z; }
      leafG.attributes.position.needsUpdate = true;
      // tag's pointer
      if (o.game === 'tag' && meP) {
        const tw = w as TagW, target = tw.it === o.me ? w.ps.filter((p) => p.id !== o.me).sort((a, b) => Math.hypot(a.x - meP.x, a.z - meP.z) - Math.hypot(b.x - meP.x, b.z - meP.z))[0] : w.ps.find((p) => p.id === tw.it);
        const d = target ? Math.hypot(target.x - meP.x, target.z - meP.z) : 0;
        pointer.visible = !!target && d > 6;
        if (target && pointer.visible) { const a = Math.atan2(target.x - meP.x, target.z - meP.z); pointer.position.set(meP.x + Math.sin(a) * 1.1, meP.y + 0.08, meP.z + Math.cos(a) * 1.1); pointer.rotation.set(0, a, 0); (pointer.material as THREE.MeshBasicMaterial).color.set(tw.it === o.me ? '#FFD23F' : '#FF2D55'); }
      }
      // the lantern follows the seeker
      if (hs) {
        const s = w.ps.find((p) => p.id === hs.seeker);
        if (s) { lantern.position.set(s.x, 2.2, s.z); lantern.target.position.set(s.x + Math.sin(s.face) * 6, 0, s.z + Math.cos(s.face) * 6); lantern.intensity = hs.phase === 'seek' ? 55 : 0; }
      }
      // the camera: a big swoop in at the start, then behind and above you (or over everything once you're out)
      const tall = camera.aspect < 1, back = tall ? 1.35 : 1;
      const follow = meP && (meP.alive || o.game === 'hide') ? meP : null;
      const tx = follow ? follow.x * 0.9 : 0, tz = follow ? follow.z * 0.9 : 0, ty = follow ? Math.max(follow.y, o.game === 'lava' ? LAVA.Y[2] : 0) : 0;
      const over = Math.max(22, span * 1.6);
      const want = follow ? new THREE.Vector3(tx, ty + 10.5 * back, tz + 6 * back) : new THREE.Vector3(0, over * back, over * 0.6 * back);
      if (intro > 0) want.lerp(new THREE.Vector3(0, 34 + span, 30 + span), Math.min(1, intro));
      camPos.lerp(want, Math.min(1, dt * (intro > 0 ? 2 : 5)));
      camLook.lerp(new THREE.Vector3(tx, ty, tz - (follow ? 1.5 : 0)), Math.min(1, dt * 6));
      camera.position.copy(camPos); camera.lookAt(camLook);
      // the sun (and its shadows) follow the action
      sun.position.set(camLook.x + 8, camLook.y + 18, camLook.z + 10); sun.target.position.copy(camLook);
      if (occ.length && meP) {
        const to = new THREE.Vector3(meP.x, meP.y + 0.7, meP.z), d = to.clone().sub(camPos), len = d.length();
        ray.set(camPos, d.normalize()); ray.far = Math.max(0, len - 0.3);
        const hit = new Set(ray.intersectObjects(occ, false).map((h) => h.object as THREE.Mesh));
        // and anything you're standing right inside (a shed's roof, the gazebo)
        for (const m of faded) if (!hit.has(m)) { m.material = m.userData.orig; faded.delete(m); }
        for (const m of hit) if (!faded.has(m)) { m.userData.orig = m.material; m.material = fadeMat(m); faded.add(m); }
      }
      renderer.render(scene, camera);
    },
    dispose() { ro.disconnect(); for (const x of bag) x.dispose(); renderer.dispose(); },
  };
}
export type World3D = ReturnType<typeof createWorld3D>;
function groundBelow(w: LavaW, x: number, z: number, y: number) {
  const N = w.N ?? 10, S = LAVA.S, i = Math.round(x / S + (N - 1) / 2), j = Math.round(z / S + (N - 1) / 2);
  if (i < 0 || j < 0 || i >= N || j >= N) return (w.lava ?? LAVA.LAVA) + 0.02;
  for (let L = 0; L < LAVA.Y.length; L++) if (w.tiles?.[L]?.[j * N + i] !== '0' && y >= LAVA.Y[L] - 0.05) return LAVA.Y[L];
  return (w.lava ?? LAVA.LAVA) + 0.02;
}
