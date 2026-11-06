// More 3D party worlds: the Frosty Floe (iceberg sumo), Paint Plaza (paint splat), a Snowy Village (snowball fight),
// the Sunflower Fields (red light, green light) and Pirate Cove (treasure rush).
import * as THREE from 'three';
import { rng } from '../party/kit';
import { flat, grassTex, mesh, motes, padArt, perimeter, scatter, type Ctx, type Env, type Inst, type PadArt } from './kit3d';
import { SUMO, type GemW, type PaintW, type RLW, type SnowW, type SumoW, type W3 } from './sims';

type Up = NonNullable<PadArt>;
const snowfall = (ctx: Ctx, n: number, span: number) => {
  const s = motes(ctx, n, '#FFFFFF', 0.14); s.m.blending = THREE.NormalBlending;
  const f = Array.from({ length: n }, () => ({ x: (ctx.r() * 2 - 1) * span, z: (ctx.r() * 2 - 1) * span, y: ctx.r() * 14, s: 0.6 + ctx.r() * 0.8 }));
  return (t: number, dt: number, cx = 0, cz = 0) => { f.forEach((p, i) => { p.y -= dt * p.s; if (p.y < 0) p.y = 14; s.pos.set([cx + p.x + Math.sin(t + i) * 0.3, p.y, cz + p.z], i * 3); }); s.done(); };
};
function snowman(ctx: Ctx, x: number, z: number, a: number, parent?: THREE.Object3D) {
  const white = ctx.std('#F6FAFF', { roughness: 0.9 }), coal = ctx.std('#222');
  mesh(ctx, new THREE.SphereGeometry(0.55, 16, 12), white, x, 0.5, z, parent);
  mesh(ctx, new THREE.SphereGeometry(0.4, 16, 12), white, x, 1.15, z, parent);
  mesh(ctx, new THREE.SphereGeometry(0.28, 14, 10), white, x, 1.65, z, parent);
  const fx = Math.sin(a), fz = Math.cos(a);
  mesh(ctx, new THREE.ConeGeometry(0.06, 0.32, 8), ctx.std('#FF8A3D'), x + fx * 0.36, 1.65, z + fz * 0.36, parent).rotation.set(Math.PI / 2, 0, -a);
  for (const s of [-1, 1]) mesh(ctx, new THREE.SphereGeometry(0.04, 6, 4), coal, x + fx * 0.25 + fz * s * 0.1, 1.73, z + fz * 0.25 - fx * s * 0.1, parent);
  for (let k = 0; k < 3; k++) mesh(ctx, new THREE.SphereGeometry(0.045, 6, 4), coal, x + fx * 0.4, 1.0 + k * 0.15, z + fz * 0.4, parent);
  mesh(ctx, new THREE.CylinderGeometry(0.2, 0.22, 0.28, 12), coal, x, 1.95, z, parent);
  mesh(ctx, new THREE.TorusGeometry(0.3, 0.06, 6, 16), ctx.std('#E8323C'), x, 1.42, z, parent).rotation.x = Math.PI / 2;
}
function pine(ctx: Ctx, x: number, z: number, h: number, snowy: boolean, parent?: THREE.Object3D) {
  mesh(ctx, new THREE.CylinderGeometry(0.16, 0.24, h * 0.3, 8), ctx.std('#4A3020'), x, h * 0.15, z, parent);
  for (let k = 0; k < 3; k++) {
    mesh(ctx, new THREE.ConeGeometry(h * (0.3 - k * 0.07), h * 0.36, 10), ctx.std('#1F5A3A', { roughness: 0.9 }), x, h * (0.38 + k * 0.2), z, parent);
    if (snowy) mesh(ctx, new THREE.ConeGeometry(h * (0.3 - k * 0.07) * 0.62, h * 0.16, 10), ctx.std('#F6FAFF', { roughness: 0.9 }), x, h * (0.48 + k * 0.2), z, parent);
  }
}

// ---- Frosty Floe (iceberg sumo) ----------------------------------------------------------------------------------------
function frostyFloe(ctx: Ctx): Env {
  const w0 = ctx.w as SumoW, R0 = w0.R0, r = ctx.r;
  const seaTex = ctx.tex(256, 256, (g) => { g.fillStyle = '#1C4E80'; g.fillRect(0, 0, 256, 256); const rr = rng(5); for (let i = 0; i < 160; i++) { g.strokeStyle = rr() < 0.5 ? '#2B6CB0' : '#5FA8E8'; g.globalAlpha = 0.6; g.lineWidth = 2; g.beginPath(); const x = rr() * 256, y = rr() * 256; g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 4, x + 16, y); g.stroke(); } g.globalAlpha = 1; }, 14);
  const sea = mesh(ctx, new THREE.PlaneGeometry(160, 160), ctx.std('#ffffff', { map: seaTex, roughness: 0.15, metalness: 0.3 }), 0, SUMO.SEA + 4.6, 0, ctx.dyn); flat(sea);
  // the iceberg: an icy top that melts smaller, and a big chunk going down into the water
  const iceTex = ctx.tex(512, 512, (g) => { g.fillStyle = '#DDF1FF'; g.fillRect(0, 0, 512, 512); const rr = rng(8); g.strokeStyle = '#A8D8F5'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { g.beginPath(); let x = rr() * 512, y = rr() * 512; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rr() - 0.5) * 80; y += (rr() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); } for (let i = 0; i < 400; i++) { g.fillStyle = '#FFFFFF'; g.globalAlpha = 0.5; g.fillRect(rr() * 512, rr() * 512, 3, 3); } g.globalAlpha = 1; }, 1);
  const top = mesh(ctx, new THREE.CylinderGeometry(1, 1, 0.5, 48), ctx.std('#ffffff', { map: iceTex, roughness: 0.12, metalness: 0.05 }), 0, -0.25, 0, ctx.dyn);
  const under = mesh(ctx, new THREE.CylinderGeometry(1, 0.55, 1, 12), ctx.std('#9FD3F0', { roughness: 0.3, flatShading: true, transparent: true, opacity: 0.9 }), 0, -3.2, 0, ctx.dyn);
  const rim = mesh(ctx, new THREE.TorusGeometry(1, 0.06, 6, 64), ctx.std('#FFFFFF', { emissive: '#BFE6FF', emissiveIntensity: 0.4 }), 0, 0.01, 0, ctx.dyn); rim.rotation.x = Math.PI / 2; rim.castShadow = false;
  for (const o of ctx.obs) {
    if (o.m === 'snowman' && o.k === 'c') snowman(ctx, o.x, o.z, o.a ?? 0);
    if (o.k === 'z' && o.m === 'goo') { const g = mesh(ctx, new THREE.SphereGeometry(o.r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), ctx.std('#FFFFFF', { roughness: 1 }), o.x, -0.02, o.z); g.scale.y = 0.12; g.castShadow = false; }
  }
  // icebergs far off, penguins on a floe, the northern lights
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + r(), d = 30 + r() * 30; const b = mesh(ctx, new THREE.ConeGeometry(3 + r() * 5, 6 + r() * 12, 6), ctx.std('#E8F6FF', { roughness: 0.4, flatShading: true }), Math.sin(a) * d, -0.5, Math.cos(a) * d); b.rotation.y = r() * 3; }
  const floe = mesh(ctx, new THREE.CylinderGeometry(3, 3.2, 0.5, 10), ctx.std('#E8F6FF', { flatShading: true }), R0 + 8, -0.3, -6); void floe;
  const pengs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) { const g = new THREE.Group(); mesh(ctx, new THREE.CapsuleGeometry(0.25, 0.35, 4, 10), ctx.std('#1E1E2A'), 0, 0.45, 0, g); mesh(ctx, new THREE.SphereGeometry(0.2, 10, 8), ctx.std('#FFFFFF'), 0, 0.42, 0.12, g).scale.set(1, 1.4, 0.6); mesh(ctx, new THREE.ConeGeometry(0.06, 0.15, 6), ctx.std('#FF9F1C'), 0, 0.72, 0.24, g).rotation.x = Math.PI / 2; g.position.set(R0 + 7 + (i % 2) * 1.2, 0, -7 + i * 0.8); g.rotation.y = -1.2 + i * 0.4; ctx.dyn.add(g); pengs.push(g); }
  const aur = Array.from({ length: 3 }, (_, i) => {
    const t = ctx.tex(256, 64, (g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(120,255,200,0)'); gr.addColorStop(0.6, ['rgba(120,255,200,0.8)', 'rgba(140,160,255,0.7)', 'rgba(255,140,220,0.6)'][i]); gr.addColorStop(1, 'rgba(120,255,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 64); });
    const m = mesh(ctx, new THREE.PlaneGeometry(120, 22, 24, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }), 0, 34 + i * 5, -70 - i * 6, ctx.dyn); m.castShadow = false;
    return { m, pos: (m.geometry.attributes.position as THREE.BufferAttribute), base: Float32Array.from((m.geometry.attributes.position as THREE.BufferAttribute).array) };
  });
  const flakes = snowfall(ctx, ctx.phone ? 120 : 260, R0 + 10);
  return {
    sky: '#16264A', fog: ['#22365E', 30, 110], light: 'snow',
    update(w, t, dt) {
      const R = (w as SumoW).ice ?? R0;
      top.scale.set(R, 1, R); under.scale.set(R * 0.95, 5.5, R * 0.95); rim.scale.set(R, R, 1);
      seaTex.offset.set(t * 0.01, t * 0.006); sea.position.y = SUMO.SEA + 4.6 + Math.sin(t * 0.8) * 0.06;
      pengs.forEach((p, i) => { p.rotation.z = Math.sin(t * 3 + i) * 0.12; });
      aur.forEach((a, k) => { for (let i = 0; i < a.pos.count; i++) a.pos.setY(i, a.base[i * 3 + 1] + Math.sin(t * 0.4 + a.base[i * 3] * 0.06 + k) * 3); a.pos.needsUpdate = true; });
      flakes(t, dt);
    },
  };
}

// ---- Paint Plaza (paint splat) -----------------------------------------------------------------------------------------
function paintPlaza(ctx: Ctx): Env {
  const w0 = ctx.w as PaintW, H = w0.H ?? 12, G = w0.G, r = ctx.r;
  const conc = ctx.tex(256, 256, (g) => { g.fillStyle = '#8D8F99'; g.fillRect(0, 0, 256, 256); const rr = rng(3); for (let i = 0; i < 3000; i++) { g.fillStyle = rr() < 0.5 ? '#80828C' : '#9A9CA6'; g.fillRect(rr() * 256, rr() * 256, 2, 2); } g.strokeStyle = '#757780'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); }, H / 2);
  flat(mesh(ctx, new THREE.PlaneGeometry(2 * H, 2 * H), ctx.std('#ffffff', { map: conc, roughness: 0.95 })));
  // the paint: one pixel per square of roof, recoloured as it changes
  const data = new Uint8Array(G * G * 4), paintTex = ctx.T(new THREE.DataTexture(data, G, G)); paintTex.magFilter = THREE.LinearFilter; paintTex.minFilter = THREE.LinearFilter; paintTex.colorSpace = THREE.SRGBColorSpace; paintTex.needsUpdate = true;
  paintTex.repeat.set(1, -1); paintTex.offset.set(0, 1); paintTex.wrapT = THREE.RepeatWrapping;
  const coat = mesh(ctx, new THREE.PlaneGeometry(2 * H, 2 * H), new THREE.MeshStandardMaterial({ map: paintTex, transparent: true, roughness: 0.35, metalness: 0.05, alphaTest: 0.2 }), 0, 0.015, 0, ctx.dyn); flat(coat); coat.receiveShadow = true; ctx.T(coat.material as THREE.Material);
  const cols = ctx.colors.map((c) => new THREE.Color(c));
  // a low wall round the roof, the city all around, a sunset
  const wall = ctx.std('#B5654A', { roughness: 0.9 });
  for (const s of [-1, 1]) { mesh(ctx, new THREE.BoxGeometry(2 * H + 0.8, 0.8, 0.4), wall, 0, 0.4, s * (H + 0.2)); mesh(ctx, new THREE.BoxGeometry(0.4, 0.8, 2 * H + 0.8), wall, s * (H + 0.2), 0.4, 0); }
  mesh(ctx, new THREE.BoxGeometry(2 * H + 0.8, 40, 2 * H + 0.8), ctx.std('#8A4E3A', { roughness: 1 }), 0, -20.01, 0);
  const winTex = ctx.tex(128, 256, (g) => { g.fillStyle = '#2B2A3F'; g.fillRect(0, 0, 128, 256); const rr = rng(12); for (let y = 8; y < 256; y += 20) for (let x = 8; x < 128; x += 20) { g.fillStyle = rr() < 0.45 ? '#FFD98A' : '#3E3D5A'; g.fillRect(x, y, 12, 12); } }, 1);
  const towers: Inst[] = [];
  for (let i = 0; i < 70; i++) { const a = r() * Math.PI * 2, d = H + 8 + r() * 40, h = 8 + r() * 30; towers.push({ x: Math.sin(a) * d, y: h / 2 - 20, z: Math.cos(a) * d, s: 4 + r() * 4, sy: h + 20 }); }
  scatter(ctx, new THREE.BoxGeometry(1, 1, 1), ctx.std('#ffffff', { map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.5, roughness: 0.8 }), towers);
  const ups: Up[] = [], fans: THREE.Object3D[] = [];
  for (const o of ctx.obs) {
    const pa = padArt(ctx, o); if (pa) ups.push(pa);
    if (o.m === 'tower' && o.k === 'c') {
      const g = ctx.prop();
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.78; mesh(ctx, new THREE.CylinderGeometry(0.08, 0.08, 2, 6), ctx.std('#555'), o.x + Math.sin(a) * 1, 1, o.z + Math.cos(a) * 1, g); }
      mesh(ctx, new THREE.CylinderGeometry(1.3, 1.3, 1.8, 20), ctx.std('#8B5A3C', { roughness: 0.9 }), o.x, 2.9, o.z, g);
      mesh(ctx, new THREE.ConeGeometry(1.45, 0.8, 20), ctx.std('#5A3A26'), o.x, 4.2, o.z, g);
    }
    if (o.m === 'chimney' && o.k === 'b') { const g = ctx.prop(); mesh(ctx, new THREE.BoxGeometry(1.2, 2.2, 1.2), ctx.std('#B5482E', { roughness: 1 }), o.x, 1.1, o.z, g); mesh(ctx, new THREE.BoxGeometry(1.4, 0.2, 1.4), ctx.std('#6B6B6B'), o.x, 2.3, o.z, g); }
    if (o.m === 'vent' && o.k === 'c') { mesh(ctx, new THREE.CylinderGeometry(0.6, 0.6, 0.8, 16), ctx.std('#C0C4CC', { metalness: 0.6, roughness: 0.4 }), o.x, 0.4, o.z); const f = new THREE.Group(); f.position.set(o.x, 0.82, o.z); for (let k = 0; k < 4; k++) mesh(ctx, new THREE.BoxGeometry(1, 0.03, 0.15), ctx.std('#444'), 0, 0, 0, f).rotation.y = (k / 4) * Math.PI; ctx.dyn.add(f); fans.push(f); }
    if (o.m === 'skylight' && o.k === 'b') { mesh(ctx, new THREE.BoxGeometry(o.w, 0.5, o.d), ctx.std('#B8C0CC', { metalness: 0.5 }), o.x, 0.25, o.z); mesh(ctx, new THREE.BoxGeometry(o.w - 0.2, 0.05, o.d - 0.2), ctx.std('#8FD3FF', { roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.7, emissive: '#3FA9E8', emissiveIntensity: 0.2 }), o.x, 0.51, o.z); }
    if (o.m === 'ac' && o.k === 'b') { mesh(ctx, new THREE.BoxGeometry(o.w, 1.1, o.d), ctx.std('#D8DCE3', { roughness: 0.6 }), o.x, 0.55, o.z); const c = mesh(ctx, new THREE.CircleGeometry(0.35, 18), ctx.std('#333'), o.x, 0.6, o.z + o.d / 2 + 0.01); c.castShadow = false; }
  }
  // paint buckets round the edge
  const buckets: Inst[] = []; perimeter(ctx, H - 0.6, 3.5, (x, z) => { if (r() < 0.4) buckets.push({ x, y: 0.25, z, c: ctx.colors[Math.floor(r() * ctx.colors.length)] ?? '#FF4FA3' }); });
  scatter(ctx, new THREE.CylinderGeometry(0.25, 0.2, 0.5, 12), ctx.std('#ffffff', { roughness: 0.5 }), buckets, true);
  let lastCells = '';
  return {
    sky: '#FF9E7A', fog: ['#FFB38A', 40, 110], light: 'dusk',
    update(w, t, dt) {
      const pw = w as PaintW;
      if (pw.cells && pw.cells !== lastCells) {
        for (let i = 0; i < G * G; i++) { const k = pw.cells.charCodeAt(i) - 48, c = cols[k]; if (c && k >= 0) { data[i * 4] = c.r * 255; data[i * 4 + 1] = c.g * 255; data[i * 4 + 2] = c.b * 255; data[i * 4 + 3] = 255; } else data[i * 4 + 3] = 0; }
        paintTex.needsUpdate = true; lastCells = pw.cells;
      }
      fans.forEach((f) => { f.rotation.y += dt * 8; });
      ups.forEach((u) => u.update(w, t, dt));
    },
  };
}

// ---- Snowy Village (snowball fight) ------------------------------------------------------------------------------------
function snowVillage(ctx: Ctx): Env {
  const H = ctx.w.H ?? 13, r = ctx.r;
  const snowTex = ctx.tex(512, 512, (g) => { g.fillStyle = '#EEF5FF'; g.fillRect(0, 0, 512, 512); const rr = rng(4); for (let i = 0; i < 3000; i++) { g.fillStyle = rr() < 0.5 ? '#DCE8F7' : '#FFFFFF'; g.beginPath(); g.arc(rr() * 512, rr() * 512, 1 + rr() * 3, 0, Math.PI * 2); g.fill(); } }, (2 * H + 50) / 10);
  flat(mesh(ctx, new THREE.PlaneGeometry(2 * H + 50, 2 * H + 50), ctx.std('#ffffff', { map: snowTex, roughness: 1 })));
  // a cobbled square in the middle, footprints
  const cob = ctx.tex(256, 256, (g) => { g.fillStyle = '#D8D2C8'; g.fillRect(0, 0, 256, 256); const rr = rng(14); for (let i = 0; i < 160; i++) { g.fillStyle = ['#C8C0B4', '#E2DCD2', '#BDB5A8'][i % 3]; g.beginPath(); g.ellipse(rr() * 256, rr() * 256, 9 + rr() * 6, 7 + rr() * 5, rr() * 3, 0, Math.PI * 2); g.fill(); } for (let i = 0; i < 600; i++) { g.fillStyle = '#FFFFFF'; g.globalAlpha = 0.6; g.fillRect(rr() * 256, rr() * 256, 3, 3); } g.globalAlpha = 1; }, 2);
  flat(mesh(ctx, new THREE.CircleGeometry(3.4, 32), ctx.std('#ffffff', { map: cob, roughness: 1 }), 0, 0.012, 0));
  const fence: Inst[] = []; perimeter(ctx, H, 0.9, (x, z) => fence.push({ x, y: 0.5, z }));
  scatter(ctx, new THREE.BoxGeometry(0.14, 1, 0.14), ctx.std('#6B4A33'), fence, true);
  for (const s of [-1, 1]) { mesh(ctx, new THREE.BoxGeometry(2 * H, 0.1, 0.08), ctx.std('#6B4A33'), 0, 0.75, s * H); mesh(ctx, new THREE.BoxGeometry(0.08, 0.1, 2 * H), ctx.std('#6B4A33'), s * H, 0.75, 0); }
  const brick = ctx.tex(128, 64, (g) => { g.fillStyle = '#F4F8FF'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#C8D6EA'; g.lineWidth = 3; for (let y = 0; y < 64; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); for (let x = (y / 21) % 2 ? 0 : 21; x < 128; x += 42) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 21); g.stroke(); } } }, 1);
  const fortM = ctx.std('#ffffff', { map: brick, roughness: 0.9 });
  const logTex = ctx.tex(128, 128, (g) => { g.fillStyle = '#7A4E2D'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#5A3820'; g.lineWidth = 4; for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); } }, 1);
  const smoke: { x: number; z: number }[] = [];
  for (const o of ctx.obs) {
    if (o.m === 'fort' && o.k === 'b') { mesh(ctx, new THREE.BoxGeometry(o.w, o.h, o.d), fortM, o.x, o.h / 2, o.z); mesh(ctx, new THREE.BoxGeometry(o.w + 0.1, 0.12, o.d + 0.1), ctx.std('#FFFFFF', { roughness: 1 }), o.x, o.h + 0.04, o.z); }
    if (o.m === 'pine' && o.k === 'c') { const g = ctx.prop(); pine(ctx, o.x, o.z, 4.4, true, g); }
    if (o.m === 'snowman' && o.k === 'c') snowman(ctx, o.x, o.z, o.a ?? 0);
    if (o.m === 'cabin' && o.k === 'b') {
      const g = ctx.prop();
      mesh(ctx, new THREE.BoxGeometry(o.w, 2.2, o.d), ctx.std('#ffffff', { map: logTex, roughness: 0.9 }), o.x, 1.1, o.z, g);
      const roof = mesh(ctx, new THREE.ConeGeometry(Math.max(o.w, o.d) * 0.82, 1.6, 4), ctx.std('#F6FAFF', { roughness: 1 }), o.x, 3.0, o.z, g); roof.rotation.y = Math.PI / 4;
      mesh(ctx, new THREE.BoxGeometry(0.5, 1.2, 0.5), ctx.std('#8A5A44'), o.x + o.w * 0.25, 3.3, o.z, g);
      smoke.push({ x: o.x + o.w * 0.25, z: o.z });
      for (const s of [-1, 1]) { const win = mesh(ctx, new THREE.PlaneGeometry(0.6, 0.6), ctx.std('#FFD98A', { emissive: '#FFB84D', emissiveIntensity: 1.2 }), o.x + s * o.w * 0.25, 1.3, o.z + o.d / 2 + 0.01, g); win.castShadow = false; }
      mesh(ctx, new THREE.PlaneGeometry(0.7, 1.3), ctx.std('#4A2E1C'), o.x, 0.65, o.z - o.d / 2 - 0.01, g).rotation.y = Math.PI;
    }
    if (o.k === 'z' && o.m === 'ice') { flat(mesh(ctx, new THREE.CircleGeometry(o.r, 28), ctx.std('#BFE3FF', { roughness: 0.03, metalness: 0.4, transparent: true, opacity: 0.8 }), o.x, 0.015, o.z)); }
    if (o.m === 'lamp' && o.k === 'c') { mesh(ctx, new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), ctx.std('#2A2A33'), o.x, 1.3, o.z); mesh(ctx, new THREE.SphereGeometry(0.22, 12, 10), ctx.std('#FFF3C8', { emissive: '#FFD27A', emissiveIntensity: 1.5 }), o.x, 2.7, o.z); }
  }
  // a forest round the village, a sled, the chimney smoke
  const ring: Inst[] = []; for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, d = H + 3 + r() * 8; ring.push({ x: Math.sin(a) * d * 1.1, y: 0, z: Math.cos(a) * d * 1.1, s: 0.8 + r() * 0.8 }); }
  const g = new THREE.Group(); pine(ctx, 0, 0, 5, true, g); g.updateMatrixWorld(true);
  g.children.forEach((c) => { const m = c as THREE.Mesh; scatter(ctx, m.geometry.clone().applyMatrix4(m.matrix), m.material as THREE.Material, ring, true); });
  const puff = motes(ctx, smoke.length * 10 || 1, '#D8DCE6', 0.9); puff.m.blending = THREE.NormalBlending; puff.m.opacity = 0.55;
  // snowballs and the puffs when they hit
  const ballIM = new THREE.InstancedMesh(ctx.T(new THREE.SphereGeometry(0.17, 12, 10)), ctx.std('#FFFFFF', { roughness: 0.7, emissive: '#DDEBFF', emissiveIntensity: 0.2 }), 64); ballIM.castShadow = true; ctx.scene.add(ballIM); ballIM.count = 0;
  const shown = new Map<number, { x: number; z: number }>();
  const pops = motes(ctx, 120, '#FFFFFF', 0.16); pops.m.blending = THREE.NormalBlending; const popP = Array.from({ length: 120 }, () => ({ x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0, life: 0 })); let popK = 0; const seenPop = new Set<string>();
  const flakes = snowfall(ctx, ctx.phone ? 120 : 240, 16);
  const m4 = new THREE.Matrix4();
  return {
    sky: '#AFC8E8', fog: ['#C8D8EE', 26, 30 + H * 2.5], light: 'snow',
    update(w, t, dt) {
      const sw = w as SnowW, live = new Set<number>(); let n = 0;
      for (const b of sw.balls ?? []) {
        live.add(b.id); let d = shown.get(b.id); if (!d) shown.set(b.id, (d = { x: b.x, z: b.z }));
        d.x += b.vx * dt; d.z += b.vz * dt; d.x += (b.x - d.x) * 0.15; d.z += (b.z - d.z) * 0.15;
        if (n < 64) { m4.makeTranslation(d.x, 0.9, d.z); ballIM.setMatrixAt(n++, m4); }
      }
      for (const id of shown.keys()) if (!live.has(id)) shown.delete(id);
      ballIM.count = n; ballIM.instanceMatrix.needsUpdate = true;
      for (const q of sw.pops ?? []) { const k = `${q.x},${q.z}`; if (seenPop.has(k)) continue; seenPop.add(k); for (let j = 0; j < 8; j++) { const p = popP[popK++ % 120]; Object.assign(p, { x: q.x, y: 0.9, z: q.z, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.6 }); } }
      if (seenPop.size > 200) seenPop.clear();
      popP.forEach((p, i) => { if (p.life > 0) { p.life -= dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.life <= 0) p.y = -9; } pops.pos.set([p.x, p.y, p.z], i * 3); }); pops.done();
      smoke.forEach((s, i) => { for (let k = 0; k < 10; k++) { const f = (t * 0.25 + k / 10) % 1; puff.pos.set([s.x + Math.sin(t + k) * f * 0.6, 3.9 + f * 4, s.z + f * 1.2], (i * 10 + k) * 3); } }); if (smoke.length) puff.done();
      const me = w.ps[0]; flakes(t, dt, me ? me.x * 0 : 0, 0);
    },
  };
}

// ---- Sunflower Fields (red light, green light) -------------------------------------------------------------------------
function sunflowerField(ctx: Ctx): Env {
  const w0 = ctx.w as RLW, HX = w0.HX ?? 9, HZ = w0.HZ ?? 30, r = ctx.r;
  flat(mesh(ctx, new THREE.PlaneGeometry(2 * HX + 80, 2 * HZ + 80), ctx.std('#ffffff', { map: grassTex(ctx, '#86C95A', '#78BC4E', '#97D86A', 13, 14), roughness: 1 })));
  const dirt = ctx.tex(256, 256, (g) => { g.fillStyle = '#C9A26B'; g.fillRect(0, 0, 256, 256); const rr = rng(6); for (let i = 0; i < 2000; i++) { g.fillStyle = rr() < 0.5 ? '#B8915C' : '#D6B37E'; g.fillRect(rr() * 256, rr() * 256, 3, 3); } }, 1);
  dirt.repeat.set(HX / 4, HZ / 4);
  flat(mesh(ctx, new THREE.PlaneGeometry(2 * HX, 2 * HZ), ctx.std('#ffffff', { map: dirt, roughness: 1 }), 0, 0.01, 0));
  // start and finish lines
  flat(mesh(ctx, new THREE.PlaneGeometry(2 * HX, 0.4), ctx.std('#FFFFFF', { roughness: 0.6 }), 0, 0.02, HZ - 3.5));
  const check = ctx.tex(128, 32, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#FFF'; g.fillRect(x * 8, y * 8, 8, 8); } }, 1); check.repeat.set(HX / 2, 1);
  flat(mesh(ctx, new THREE.PlaneGeometry(2 * HX, 1), ctx.std('#ffffff', { map: check, roughness: 0.6 }), 0, 0.02, -HZ + 3));
  // a banner arch over the finish
  for (const s of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.15, 0.15, 4.5, 10), ctx.std('#E8323C'), s * (HX + 0.4), 2.25, -HZ + 3);
  const ban = ctx.tex(512, 64, (g) => { g.fillStyle = '#FFD23F'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#E8323C'; g.font = '900 40px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🏁 FINISH 🏁', 256, 34); });
  mesh(ctx, new THREE.PlaneGeometry(2 * HX + 0.8, 1), ctx.std('#ffffff', { map: ban }), 0, 4.1, -HZ + 3);
  // sunflowers everywhere along the sides, and in clumps on the field
  const stems: Inst[] = [], heads: Inst[] = [], hearts: Inst[] = [];
  const flower = (x: number, z: number, h: number) => { stems.push({ x, y: h / 2, z, sy: h }); heads.push({ x, y: h, z: z + 0.05, s: 0.9 + r() * 0.3, rx: -0.3 }); hearts.push({ x, y: h + 0.02, z: z + 0.12, s: 0.9, rx: -0.3 }); };
  for (let z = -HZ - 6; z < HZ + 6; z += 0.9) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) flower(s * (HX + 1 + k * 1.1 + r() * 0.5), z + r() * 0.5, 1.6 + r() * 0.8);
  scatter(ctx, new THREE.CylinderGeometry(0.04, 0.05, 1, 5), ctx.std('#3E8E41'), stems);
  scatter(ctx, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12).rotateX(Math.PI / 2), ctx.std('#FFC21A', { roughness: 0.7 }), heads);
  scatter(ctx, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10).rotateX(Math.PI / 2), ctx.std('#5A3A1A'), hearts);
  for (const o of ctx.obs) {
    if (o.m === 'fence' && o.k === 'b') {
      mesh(ctx, new THREE.BoxGeometry(o.w, 0.12, 0.08), ctx.std('#8B5A2B'), o.x, 0.8, o.z); mesh(ctx, new THREE.BoxGeometry(o.w, 0.12, 0.08), ctx.std('#8B5A2B'), o.x, 0.4, o.z);
      for (let x = o.x - o.w / 2 + 0.1; x <= o.x + o.w / 2; x += 1.2) mesh(ctx, new THREE.BoxGeometry(0.14, 1.1, 0.14), ctx.std('#7A4E2D'), x, 0.55, o.z);
    }
    if (o.m === 'hay' && o.k === 'c') { const h = mesh(ctx, new THREE.CylinderGeometry(o.r, o.r, 1.2, 18), ctx.std('#D9B54A', { roughness: 1 }), o.x, o.r, o.z); h.rotation.z = Math.PI / 2; h.rotation.y = o.x; }
    if (o.m === 'scarecrow' && o.k === 'c') {
      const g = ctx.prop();
      mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), ctx.std('#7A4E2D'), o.x, 1.2, o.z, g);
      mesh(ctx, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), ctx.std('#7A4E2D'), o.x, 1.7, o.z, g).rotation.z = Math.PI / 2;
      mesh(ctx, new THREE.BoxGeometry(0.6, 0.7, 0.3), ctx.std('#3A6EA5'), o.x, 1.5, o.z, g);
      mesh(ctx, new THREE.SphereGeometry(0.25, 12, 10), ctx.std('#E8D9A8'), o.x, 2.15, o.z, g);
      mesh(ctx, new THREE.ConeGeometry(0.4, 0.4, 12), ctx.std('#B5733A'), o.x, 2.45, o.z, g);
    }
    if (o.k === 'z' && o.m === 'goo') { const m = mesh(ctx, new THREE.CircleGeometry(o.r, 24), ctx.std('#6B4A2B', { roughness: 0.2, metalness: 0.1 }), o.x, 0.02, o.z); flat(m); }
  }
  // the giant doll at the finish, and a traffic light beside her
  const doll = new THREE.Group(); doll.position.set(0, 0, -HZ - 1.5); ctx.dyn.add(doll);
  const dress = ctx.std('#FF8A3D', { roughness: 0.7 }), skin = ctx.std('#FFE0C2', { roughness: 0.7 });
  mesh(ctx, new THREE.ConeGeometry(1.8, 4, 20), dress, 0, 2, 0, doll);
  mesh(ctx, new THREE.BoxGeometry(1.6, 1.2, 1), ctx.std('#FFD23F'), 0, 4.4, 0, doll);
  for (const s of [-1, 1]) mesh(ctx, new THREE.CylinderGeometry(0.18, 0.15, 2, 8), skin, s * 1, 3.9, 0, doll).rotation.z = s * 0.25;
  const head = new THREE.Group(); head.position.set(0, 5.6, 0); doll.add(head);
  mesh(ctx, new THREE.SphereGeometry(0.95, 20, 16), skin, 0, 0, 0, head);
  mesh(ctx, new THREE.SphereGeometry(1.0, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), ctx.std('#2A1A12'), 0, 0.1, -0.05, head);
  for (const s of [-1, 1]) mesh(ctx, new THREE.SphereGeometry(0.35, 12, 10), ctx.std('#2A1A12'), s * 0.85, 0.2, -0.2, head);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#222' }); ctx.T(eyeM);
  for (const s of [-1, 1]) mesh(ctx, new THREE.SphereGeometry(0.13, 10, 8), eyeM, s * 0.3, 0.05, 0.85, head);
  mesh(ctx, new THREE.TorusGeometry(0.18, 0.04, 6, 12, Math.PI), ctx.std('#C2185B'), 0, -0.35, 0.85, head).rotation.z = Math.PI;
  const lamp = (c: string) => new THREE.MeshBasicMaterial({ color: c });
  mesh(ctx, new THREE.CylinderGeometry(0.1, 0.1, 4, 8), ctx.std('#333'), HX - 1, 2, -HZ - 0.5);
  mesh(ctx, new THREE.BoxGeometry(0.8, 2.2, 0.6), ctx.std('#222'), HX - 1, 4.8, -HZ - 0.5);
  const lights = ['#E8323C', '#FFD23F', '#3DDC97'].map((c, k) => { const m = lamp(c); ctx.T(m); mesh(ctx, new THREE.SphereGeometry(0.26, 12, 10), m, HX - 1, 5.5 - k * 0.7, -HZ - 0.15, ctx.dyn); return { m, c: new THREE.Color(c) }; });
  // a windmill far off, clouds
  const mill = new THREE.Group(); mill.position.set(-HX - 18, 0, -HZ + 10); ctx.dyn.add(mill);
  mesh(ctx, new THREE.CylinderGeometry(1.4, 2.2, 10, 10), ctx.std('#F2E8D5'), 0, 5, 0, mill); mesh(ctx, new THREE.ConeGeometry(2, 2, 10), ctx.std('#B5482E'), 0, 11, 0, mill);
  const blades = new THREE.Group(); blades.position.set(0, 9.5, 2.3); mill.add(blades);
  for (let k = 0; k < 4; k++) { const b = mesh(ctx, new THREE.BoxGeometry(0.6, 5, 0.1), ctx.std('#FFFFFF'), 0, 2.5, 0, blades); b.geometry.translate(0, 0, 0); const holder = new THREE.Group(); holder.rotation.z = (k / 4) * Math.PI * 2; blades.add(holder); holder.add(b); }
  let face = Math.PI;
  return {
    sky: '#8FD0FF', fog: ['#BDE4FF', 40, 120], light: 'day',
    update(w, t, dt) {
      const rw = w as RLW, red = rw.light === 'red';
      // she turns round to look on red
      face += ((red ? 0 : Math.PI) - face) * Math.min(1, dt * (red ? 9 : 4));
      doll.rotation.y = face; head.rotation.y = Math.sin(t * (red ? 0 : 2)) * 0.15;
      eyeM.color.set(red ? '#FF1A1A' : '#222');
      lights.forEach((l, k) => l.m.color.copy(l.c).multiplyScalar((k === 0 && red) || (k === 1 && rw.light === 'yellow') || (k === 2 && rw.light === 'green') ? 1.2 : 0.18));
      blades.rotation.z += dt * 0.8;
    },
  };
}

// ---- Pirate Cove (treasure rush) ----------------------------------------------------------------------------------------
const GEM_COLS = ['#2EC4B6', '#8B5CFF', '#3DDC97', '#FFD23F'];
function pirateCove(ctx: Ctx): Env {
  const H = ctx.w.H ?? 13, r = ctx.r;
  const sand = ctx.tex(512, 512, (g) => { g.fillStyle = '#F2D9A0'; g.fillRect(0, 0, 512, 512); const rr = rng(9); for (let i = 0; i < 5000; i++) { g.fillStyle = rr() < 0.5 ? '#E8CB8A' : '#FAE6B8'; g.fillRect(rr() * 512, rr() * 512, 2, 2); } }, H / 3);
  flat(mesh(ctx, new THREE.CircleGeometry(H * 1.5, 48), ctx.std('#ffffff', { map: sand, roughness: 1 })));
  const seaTex = ctx.tex(256, 256, (g) => { g.fillStyle = '#1FA2C8'; g.fillRect(0, 0, 256, 256); const rr = rng(2); for (let i = 0; i < 140; i++) { g.strokeStyle = rr() < 0.5 ? '#5FD3EA' : '#178CB0'; g.lineWidth = 2; g.beginPath(); const x = rr() * 256, y = rr() * 256; g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 4, x + 16, y); g.stroke(); } }, 16);
  const sea = mesh(ctx, new THREE.PlaneGeometry(200, 200), ctx.std('#ffffff', { map: seaTex, roughness: 0.15, metalness: 0.2 }), 0, -0.15, 0, ctx.dyn); flat(sea);
  const foam = mesh(ctx, new THREE.RingGeometry(H * 1.48, H * 1.62, 64), ctx.std('#FFFFFF', { transparent: true, opacity: 0.7 }), 0, -0.1, 0, ctx.dyn); flat(foam);
  // a rope fence of posts marking the edge
  const posts: Inst[] = []; perimeter(ctx, H, 2, (x, z) => posts.push({ x, y: 0.4, z }));
  scatter(ctx, new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8), ctx.std('#7A4E2D'), posts, true);
  for (const s of [-1, 1]) { mesh(ctx, new THREE.CylinderGeometry(0.025, 0.025, 2 * H, 4), ctx.std('#D9C29A'), 0, 0.65, s * H).rotation.z = Math.PI / 2; mesh(ctx, new THREE.CylinderGeometry(0.025, 0.025, 2 * H, 4), ctx.std('#D9C29A'), s * H, 0.65, 0).rotation.x = Math.PI / 2; }
  const ups: Up[] = [];
  let lid: THREE.Mesh | null = null;
  for (const o of ctx.obs) {
    const pa = padArt(ctx, o, '#4FC3E8'); if (pa) ups.push(pa);
    if (o.m === 'palm' && o.k === 'c') {
      const g = ctx.prop(), lean = 0.25, a = o.a ?? 0;
      for (let k = 0; k < 6; k++) { const seg = mesh(ctx, new THREE.CylinderGeometry(0.17 - k * 0.012, 0.2 - k * 0.012, 0.65, 8), ctx.std(k % 2 ? '#8B6B4A' : '#7A5C3E'), o.x + Math.sin(a) * k * lean * 0.65 * k * 0.18, 0.33 + k * 0.62, o.z + Math.cos(a) * k * lean * 0.65 * k * 0.18, g); seg.rotation.set(Math.cos(a) * lean * 0.5, 0, -Math.sin(a) * lean * 0.5); }
      const tx = o.x + Math.sin(a) * 1.0, tz = o.z + Math.cos(a) * 1.0;
      for (let k = 0; k < 7; k++) { const b = (k / 7) * Math.PI * 2, leaf = mesh(ctx, new THREE.ConeGeometry(0.22, 1.9, 4), ctx.std('#2E9E4F', { roughness: 0.8 }), tx + Math.sin(b) * 0.8, 3.8, tz + Math.cos(b) * 0.8, g); leaf.rotation.set(Math.cos(b) * 1.25, 0, -Math.sin(b) * 1.25); leaf.scale.z = 0.3; }
      for (let k = 0; k < 3; k++) mesh(ctx, new THREE.SphereGeometry(0.14, 8, 6), ctx.std('#5A3A1A'), tx + Math.sin(k * 2) * 0.2, 3.6, tz + Math.cos(k * 2) * 0.2, g);
    }
    if (o.m === 'rock' && o.k === 'c') { const m = mesh(ctx, new THREE.DodecahedronGeometry(o.r + 0.1, 0), ctx.std('#8C8C99', { roughness: 1, flatShading: true }), o.x, o.r * 0.6, o.z); m.rotation.set(r(), r(), r()); m.scale.y = 0.8; }
    if (o.m === 'barrel' && o.k === 'c') { mesh(ctx, new THREE.CylinderGeometry(0.42, 0.42, 1, 14), ctx.std('#7A4E2D', { roughness: 0.9 }), o.x, 0.5, o.z); for (const y of [0.2, 0.8]) mesh(ctx, new THREE.TorusGeometry(0.43, 0.03, 4, 18), ctx.std('#333'), o.x, y, o.z).rotation.x = Math.PI / 2; }
    if (o.m === 'crate' && o.k === 'b') { mesh(ctx, new THREE.BoxGeometry(o.w, o.h, o.d), ctx.std('#B5844A', { roughness: 0.9 }), o.x, o.h / 2, o.z).rotation.y = 0; mesh(ctx, new THREE.BoxGeometry(o.w + 0.02, 0.1, 0.12), ctx.std('#7A5230'), o.x, o.h / 2, o.z); }
    if (o.m === 'wreck' && o.k === 'b') {
      const g = ctx.prop(), s = new THREE.Group(); s.position.set(o.x, 0, o.z); s.rotation.y = o.a ? Math.PI / 2 : 0; g.add(s);
      const hull = mesh(ctx, new THREE.BoxGeometry(5, 1.6, 2), ctx.std('#6B4226', { roughness: 0.9 }), 0, 0.6, 0, s); hull.rotation.z = 0.12;
      mesh(ctx, new THREE.ConeGeometry(1.05, 1.6, 4), ctx.std('#6B4226'), 2.9, 0.7, 0, s).rotation.set(0, Math.PI / 4, -Math.PI / 2);
      mesh(ctx, new THREE.CylinderGeometry(0.1, 0.12, 4, 8), ctx.std('#5A3820'), -0.3, 2.6, 0, s).rotation.z = 0.25;
      const sail = mesh(ctx, new THREE.PlaneGeometry(1.8, 1.6), ctx.std('#EDE3CC', { side: THREE.DoubleSide }), 0.1, 3, 0.05, s); sail.rotation.set(0.1, 0.4, 0.25);
      mesh(ctx, new THREE.PlaneGeometry(0.8, 0.5), ctx.std('#111', { side: THREE.DoubleSide }), -0.7, 4.3, 0, s).rotation.z = 0.25;
    }
    if (o.m === 'chest' && o.k === 'c') {
      mesh(ctx, new THREE.BoxGeometry(1.5, 0.8, 1), ctx.std('#8B5A2B', { roughness: 0.8 }), 0, 0.4, 0);
      for (const x of [-0.6, 0.6]) mesh(ctx, new THREE.BoxGeometry(0.12, 0.82, 1.02), ctx.std('#E9C46A', { metalness: 0.7, roughness: 0.3 }), x, 0.4, 0);
      mesh(ctx, new THREE.BoxGeometry(1.35, 0.15, 0.85), ctx.std('#FFD23F', { emissive: '#FFB300', emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 }), 0, 0.82, 0);
      lid = mesh(ctx, new THREE.BoxGeometry(1.5, 0.35, 1), ctx.std('#8B5A2B'), 0, 0.98, -0.45, ctx.dyn); lid.geometry.translate(0, 0, 0.5);
    }
  }
  // starfish and shells on the sand, a pirate ship out at sea, a parrot or two
  const bits: Inst[] = []; for (let i = 0; i < H * 1.5; i++) { const x = (r() * 2 - 1) * H, z = (r() * 2 - 1) * H; if (ctx.obs.some((o) => Math.hypot(o.x - x, o.z - z) < 1.2)) continue; bits.push({ x, y: 0.015, z, s: 0.5 + r() * 0.3, ry: r() * 6, c: ['#E8B89A', '#F2E2CC', '#D9A68A'][i % 3] }); }
  scatter(ctx, new THREE.CylinderGeometry(0.16, 0.16, 0.02, 5), ctx.std('#ffffff', { roughness: 0.8 }), bits);
  const ship = new THREE.Group(); ship.position.set(H + 18, 0, -H - 10); ship.rotation.y = 0.6; ctx.dyn.add(ship);
  mesh(ctx, new THREE.BoxGeometry(9, 2.2, 3), ctx.std('#4A2E1C'), 0, 0.6, 0, ship); mesh(ctx, new THREE.CylinderGeometry(0.18, 0.2, 9, 8), ctx.std('#3A2414'), 0, 5.5, 0, ship);
  for (const y of [4.5, 7.2]) mesh(ctx, new THREE.PlaneGeometry(4.5, 2.4), ctx.std('#F2EAD8', { side: THREE.DoubleSide }), 0, y, 0.2, ship).rotation.y = Math.PI / 2;
  mesh(ctx, new THREE.PlaneGeometry(1.4, 0.9), ctx.std('#111', { side: THREE.DoubleSide }), 0, 10.3, 0, ship).rotation.y = Math.PI / 2;
  // gems: one instanced mesh, spinning and bobbing
  const gemIM = new THREE.InstancedMesh(ctx.T(new THREE.OctahedronGeometry(0.4, 0)), ctx.std('#ffffff', { roughness: 0.2, metalness: 0.1, flatShading: true }), 80);
  gemIM.castShadow = true; ctx.scene.add(gemIM); gemIM.count = 0;
  const glint = motes(ctx, 80, '#FFFFFF', 0.2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  let lastBurst = -1;
  return {
    sky: '#7FD8FF', fog: ['#A8E6FF', 40, 130], light: 'day',
    update(w, t, dt) {
      const gw = w as GemW; let n = 0;
      for (const g of gw.gems ?? []) {
        if (n >= 80) break;
        const big = g.v > 1; q.setFromEuler(e.set(0, t * 2 + g.id, 0)); m4.compose(v.set(g.x, 0.6 + Math.sin(t * 3 + g.id) * 0.12, g.z), q, sc.set(big ? 1.4 : 1, big ? 1.8 : 1.35, big ? 1.4 : 1)); gemIM.setMatrixAt(n, m4);
        gemIM.setColorAt(n, col.set(big ? '#FF2D55' : GEM_COLS[g.id % GEM_COLS.length]));
        glint.pos.set([g.x + Math.sin(t * 5 + g.id) * 0.25, 1.0 + Math.abs(Math.sin(t * 4 + g.id)) * 0.2, g.z], n * 3); n++;
      }
      for (let i = n; i < 80; i++) glint.pos.set([0, -9, 0], i * 3);
      gemIM.count = n; gemIM.instanceMatrix.needsUpdate = true; if (gemIM.instanceColor) gemIM.instanceColor.needsUpdate = true; glint.done();
      // the chest flips open when it bursts
      const burst = Math.floor(w.t / 15); if (burst !== lastBurst) { lastBurst = burst; }
      if (lid) { const since = w.t - burst * 15; lid.rotation.x = -Math.max(0, 1.4 - since * 0.8); }
      seaTex.offset.set(t * 0.01, t * 0.008); (foam.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(t * 1.5) * 0.2;
      ship.position.y = Math.sin(t * 0.7) * 0.25; ship.rotation.z = Math.sin(t * 0.5) * 0.04;
      ups.forEach((u) => u.update(w, t, dt));
    },
  };
}

export const ENVS2: Record<string, (ctx: Ctx) => Env> = { sumo: frostyFloe, paint: paintPlaza, snow: snowVillage, redlight: sunflowerField, gems: pirateCove };
void (null as unknown as W3);
