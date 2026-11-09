// The game stands in each Estate: every place has its own kind of stand for its extra games, so a stand reads as
// part of that world (an easel in the atelier, a carnival booth on the boardwalk, an anvil in the foundry…).
// Each is ~1.5 wide and faces +z; the engine places it, turns it towards the middle and floats the game's emoji above.
import * as THREE from 'three';
import type { KioskGame } from '../realm3d';
import { ball, box, cone, cyl, disc, glow, mesh, type Ctx } from './envKit';

type Kiosk = (ctx: Ctx, g: KioskGame, i: number) => THREE.Object3D;
const lit = (ctx: Ctx, c: string, k = 0.7) => ctx.std(c, { emissive: c, emissiveIntensity: k });
const PAL = ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97', '#B36BFF', '#FF8A2A'];

export const KIOSKS: Record<string, Kiosk> = {
  atelier(ctx, g, i) { // an easel with a canvas, paint pots at its feet
    const k = new THREE.Group();
    for (const s of [-1, 1]) box(ctx, k, 0.07, 1.8, 0.07, '#8B5A2B', s * 0.42, 0.9, 0).rotation.z = -s * 0.1;
    box(ctx, k, 0.07, 1.7, 0.07, '#8B5A2B', 0, 0.85, -0.35).rotation.x = 0.25;
    box(ctx, k, 1.1, 0.85, 0.05, '#FFFDF6', 0, 1.25, 0.05);
    box(ctx, k, 0.9, 0.65, 0.02, lit(ctx, PAL[i % 6], 0.35), 0, 1.25, 0.09);
    box(ctx, k, 1, 0.06, 0.16, '#8B5A2B', 0, 0.8, 0.08);
    PAL.slice(0, 4).forEach((c, j) => { cyl(ctx, k, 0.1, 0.1, 0.16, '#E8E4DC', -0.45 + j * 0.3, 0.08, 0.55); disc(ctx, k, 0.08, c, -0.45 + j * 0.3, 0.17, 0.55); });
    return k;
  },
  reserve(ctx, g, i) { // a ranger's signpost under a little shingle roof, with a log bench
    const k = new THREE.Group();
    for (const s of [-1, 1]) cyl(ctx, k, 0.07, 0.08, 1.9, '#6B4A2A', s * 0.6, 0.95, 0);
    box(ctx, k, 1.4, 0.75, 0.08, '#C9A06A', 0, 1.35, 0); box(ctx, k, 1.25, 0.6, 0.02, lit(ctx, ['#3E8A4A', '#3B8FD0', '#C9A06A', '#5E9A36'][i % 4], 0.25), 0, 1.35, 0.05);
    const roof = box(ctx, k, 1.6, 0.06, 0.6, '#5A3A20', 0, 1.95, 0.05); roof.rotation.x = -0.2;
    const log = cyl(ctx, k, 0.15, 0.15, 1.1, '#7A5A3A', 0, 0.16, 0.65); log.rotation.z = Math.PI / 2;
    for (let j = 0; j < 3; j++) ball(ctx, k, 0.09, '#3E7D3A', -0.75 + j * 0.05, 0.1, 0.3 - j * 0.2);
    return k;
  },
  ranch(ctx, g, i) { // a stack of hay bales with a wagon wheel and a painted board
    const k = new THREE.Group();
    box(ctx, k, 1.3, 0.45, 0.6, '#E0B84A', 0, 0.23, 0); box(ctx, k, 0.8, 0.45, 0.6, '#D9A84A', -0.2, 0.68, 0);
    const wheel = mesh(ctx, new THREE.TorusGeometry(0.42, 0.05, 6, 20), ctx.std('#6B4A2A'), 0.55, 0.62, 0.3, k); wheel.rotation.y = 0.3;
    for (let j = 0; j < 4; j++) box(ctx, wheel, 0.84, 0.04, 0.04, '#6B4A2A').rotation.z = (j * Math.PI) / 4;
    box(ctx, k, 0.06, 1.6, 0.06, '#6B4A2A', -0.6, 0.8, -0.2); box(ctx, k, 0.8, 0.45, 0.05, lit(ctx, ['#C8352C', '#2A4A9A', '#3E7D3A', '#D99A2B'][i % 4], 0.3), -0.25, 1.45, -0.18);
    return k;
  },
  exchange(ctx, g, i) { // a glass trading booth with a ticker screen
    const k = new THREE.Group();
    box(ctx, k, 1.3, 0.9, 0.7, '#2A3038', 0, 0.45, 0);
    box(ctx, k, 1.32, 0.05, 0.72, lit(ctx, '#3DDC97', 0.8), 0, 0.92, 0);
    box(ctx, k, 1.2, 0.7, 0.06, ctx.std('#0A1A1E', { emissive: ['#3DDC97', '#22B8FF', '#FFE14D', '#FF5A5F'][i % 4], emissiveIntensity: 0.35 }), 0, 1.5, -0.25);
    for (let j = 0; j < 5; j++) box(ctx, k, 0.12, 0.12 + j * 0.08, 0.02, lit(ctx, j % 2 ? '#3DDC97' : '#FF5A5F', 1.2), -0.4 + j * 0.2, 1.3 + (0.12 + j * 0.08) / 2, -0.21);
    box(ctx, k, 1.3, 1.6, 0.03, ctx.std('#BFE3FF', { transparent: true, opacity: 0.18 }), 0, 0.8, 0.36);
    return k;
  },
  boardwalk(ctx, g, i) { // a carnival booth with a striped awning and bulbs
    const k = new THREE.Group();
    const c = PAL[i % 6];
    box(ctx, k, 1.4, 0.9, 0.6, '#F5EEDC', 0, 0.45, 0); box(ctx, k, 1.42, 0.15, 0.62, c, 0, 0.9, 0);
    for (const s of [-1, 1]) cyl(ctx, k, 0.04, 0.04, 1.2, '#E8E4DC', s * 0.68, 1.5, 0.25);
    for (let j = 0; j < 7; j++) { const st = box(ctx, k, 0.2, 0.05, 0.75, j % 2 ? '#FFFFFF' : c, -0.6 + j * 0.2, 2.12, 0.05); st.rotation.x = -0.35; }
    for (let j = 0; j < 6; j++) glow(ctx, k, -0.6 + j * 0.24, 1.95, 0.42, '#FFE9A8', 0.05, 2.4);
    return k;
  },
  gemheart(ctx, g, i) { // a rock plinth with a glowing crystal cluster
    const k = new THREE.Group();
    const c = ['#B36BFF', '#00E5FF', '#FF4FD8', '#8AF0FF'][i % 4];
    cyl(ctx, k, 0.55, 0.7, 0.7, ctx.std('#3A2A44', { flatShading: true }), 0, 0.35, 0, 7);
    for (let j = 0; j < 5; j++) { const cr = cone(ctx, k, 0.12 + (j % 2) * 0.05, 0.6 + j * 0.12, ctx.std(c, { transparent: true, opacity: 0.85, emissive: c, emissiveIntensity: 0.9 }), Math.cos(j * 1.3) * 0.22, 0.95 + j * 0.04, Math.sin(j * 1.3) * 0.22, 6); cr.rotation.z = Math.cos(j * 1.3) * 0.35; cr.rotation.x = Math.sin(j * 1.3) * 0.35; }
    return k;
  },
  skyport(ctx, g, i) { // a wicker balloon basket with a small balloon tethered above
    const k = new THREE.Group();
    box(ctx, k, 0.9, 0.7, 0.9, '#B08A55', 0, 0.35, 0);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) cyl(ctx, k, 0.015, 0.015, 1.5, '#8B6A44', x, 1.4, z);
    const b = ball(ctx, k, 0.75, ctx.std(PAL[i % 6], { emissive: PAL[i % 6], emissiveIntensity: 0.15 }), 0, 2.6, 0); b.scale.y = 1.15;
    box(ctx, k, 1.4, 0.06, 0.25, '#A9865E', 0, 0.02, 0.7);
    return k;
  },
  foundry(ctx, g, i) { // an anvil on a stump with a glowing ingot and a tool rack
    const k = new THREE.Group();
    cyl(ctx, k, 0.35, 0.42, 0.55, '#6B4A2A', 0, 0.28, 0);
    box(ctx, k, 0.9, 0.22, 0.35, '#3A3A42', 0, 0.68, 0); box(ctx, k, 0.5, 0.18, 0.28, '#3A3A42', 0, 0.48, 0); cone(ctx, k, 0.12, 0.35, '#3A3A42', 0.6, 0.7, 0, 6).rotation.z = -Math.PI / 2;
    box(ctx, k, 0.35, 0.08, 0.14, lit(ctx, ['#FF8A2A', '#FFE14D', '#FF5A1F', '#FFB020'][i % 4], 2), -0.1, 0.83, 0);
    box(ctx, k, 0.06, 1.3, 0.06, '#555', -0.75, 0.65, -0.2); box(ctx, k, 0.6, 0.06, 0.06, '#555', -0.5, 1.3, -0.2);
    return k;
  },
  foodhall(ctx, g, i) { // a food cart with an umbrella
    const k = new THREE.Group();
    const c = ['#E85D75', '#22B8FF', '#3DDC97', '#FFB13D'][i % 4];
    box(ctx, k, 1.3, 0.75, 0.65, c, 0, 0.55, 0); box(ctx, k, 1.34, 0.05, 0.7, '#F5F0E6', 0, 0.94, 0);
    for (const s of [-1, 1]) { const w = cyl(ctx, k, 0.18, 0.18, 0.08, '#333', s * 0.45, 0.18, 0.34); w.rotation.x = Math.PI / 2; }
    cyl(ctx, k, 0.03, 0.03, 1.4, '#E8E4DC', 0.5, 1.5, -0.2); cone(ctx, k, 0.85, 0.4, ctx.std('#FFFFFF', {}), 0.5, 2.2, -0.2, 8);
    cone(ctx, k, 0.86, 0.38, c, 0.5, 2.19, -0.2, 8).scale.set(1, 1, 1);
    for (let j = 0; j < 3; j++) ball(ctx, k, 0.1, ['#FFE14D', '#FF5A5F', '#FFFFFF'][j], -0.35 + j * 0.25, 1.02, 0.05);
    return k;
  },
  citadel(ctx, g, i) { // a carved stone altar between two braziers
    const k = new THREE.Group();
    box(ctx, k, 1.1, 0.8, 0.6, ctx.std('#4A4050', { flatShading: true }), 0, 0.4, 0); box(ctx, k, 1.25, 0.12, 0.7, '#5A5060', 0, 0.86, 0);
    box(ctx, k, 0.5, 0.35, 0.02, lit(ctx, ['#A855F7', '#FF5A5F', '#3DDC97', '#FFB020'][i % 4], 1), 0, 0.45, 0.31);
    for (const s of [-1, 1]) { cyl(ctx, k, 0.08, 0.12, 1.2, '#2E2834', s * 0.85, 0.6, 0); cyl(ctx, k, 0.2, 0.12, 0.18, '#3A3240', s * 0.85, 1.25, 0); cone(ctx, k, 0.13, 0.4, lit(ctx, '#FF8A2A', 2), s * 0.85, 1.5, 0, 7); }
    return k;
  },
  colosseum(ctx, g, i) { // a banner on a spear rack, with a shield
    const k = new THREE.Group();
    const c = ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97'][i % 4];
    box(ctx, k, 1.3, 0.3, 0.5, '#D9C8A0', 0, 0.15, 0);
    for (const s of [-1, 1]) { const sp = cyl(ctx, k, 0.03, 0.03, 2.2, '#8B6A44', s * 0.5, 1.2, 0); sp.rotation.z = -s * 0.12; cone(ctx, k, 0.06, 0.25, '#C0C4CC', s * 0.5 - s * 0.13, 2.35, 0, 6); }
    box(ctx, k, 0.06, 1.6, 0.06, '#8B6A44', 0, 1.1, -0.1); box(ctx, k, 0.7, 0.9, 0.02, lit(ctx, c, 0.35), 0, 1.4, -0.08);
    const sh = cyl(ctx, k, 0.38, 0.38, 0.06, ctx.std('#C9A64A', { metalness: 0.7, roughness: 0.3 }), 0, 0.75, 0.3); sh.rotation.x = Math.PI / 2 - 0.2;
    return k;
  },
};
