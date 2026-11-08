// Every spell's own look as it's cast: Fireburst hurls a roaring fireball, Deep Freeze drives ice shards into its
// target, Toxic Cloud rolls a poison fog across three lanes, Overcharge strikes lightning into your creature…
// (The big cataclysms have whole scenes of their own in fx3d.ts.)
import * as THREE from 'three';
import type { CharFx } from './chars';

const FIRE = ['#FFF2A0', '#FFB020', '#FF6A10', '#FF3A00'];
const R = (n: number) => (Math.random() - 0.5) * n;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function burst(fx: CharFx, p: THREE.Vector3, colors: string[], n: number, spd: number, o: { size?: number; gravity?: number; life?: number; soft?: boolean } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = spd * (0.4 + Math.random() * 0.7);
    (o.soft ? fx.soft : fx.add)({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * r * s, vy: Math.abs(u) * s + spd * 0.3, vz: Math.sin(a) * r * s, color: colors[i % colors.length], size: o.size ?? 0.16, gravity: o.gravity ?? 4, life: o.life ?? 0.9, drag: 0.6 });
  }
}
function spiral(fx: CharFx, p: THREE.Vector3, colors: string[], n: number, r = 0.7) {
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 6; fx.add({ x: p.x + Math.cos(a) * r, y: p.y - 0.4 + (i / n) * 0.3, z: p.z + Math.sin(a) * r, vy: 1.6 + Math.random(), color: colors[i % colors.length], size: 0.14, life: 1.2, attract: { x: p.x, y: p.y + 1.6, z: p.z, k: 0.6, swirl: 5 } }); }
}

/** Play a spell's effect. `from` is the caster's hero, `at` what it's aimed at (if anything), `area` everything it touches. */
export async function castSpell(id: string, fx: CharFx, from: THREE.Vector3, at: THREE.Vector3 | null, area: THREE.Vector3[]): Promise<boolean> {
  const tgt = at ?? area[0] ?? from;
  switch (id) {
    case 'fireburst': {
      burst(fx, from, FIRE, 20, 2.5);
      await fx.shot(from, tgt, { kind: 'fire', color: '#FF5A10', dur: 0.6, arc: 2.4, size: 0.6 });
      fx.ring(tgt, '#FF8A30', 2.4); fx.shake(0.35); burst(fx, tgt, FIRE, 50, 4.5, { size: 0.2 });
      for (let i = 0; i < 10; i++) fx.soft({ x: tgt.x + R(0.6), y: tgt.y, z: tgt.z + R(0.6), vy: 1 + Math.random(), color: '#3A3036', size: 0.6, grow: 1, life: 1.6, alpha: 0.5 });
      return true;
    }
    case 'deepfreeze': {
      // a ring of ice shards closes in on the target
      await Promise.all([0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2; const s = tgt.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, 1.6, Math.sin(a) * 2.2)); return wait(i * 45).then(() => fx.shot(s, tgt, { kind: 'ice', color: '#BFF4FF', dur: 0.35, arc: 0.2, size: 0.26 })); }));
      fx.ring(tgt, '#BFF4FF', 2.2, 0.8); burst(fx, tgt, ['#FFFFFF', '#BFF4FF', '#6FD3FF'], 40, 3.5, { size: 0.15, gravity: 6 }); fx.shake(0.15);
      return true;
    }
    case 'toxiccloud': {
      const pts = area.length ? area : [tgt];
      await fx.shot(from, tgt, { kind: 'spore', color: '#9BFF7A', dur: 0.55, arc: 1.8, size: 0.4 });
      for (const p of pts) { for (let i = 0; i < 16; i++) fx.soft({ x: p.x + R(1.4), y: p.y + Math.random() * 0.6, z: p.z + R(1.4), vx: R(0.6), vy: 0.3 + Math.random() * 0.4, vz: R(0.6), color: i % 2 ? '#7ADC4A' : '#9B6BFF', size: 0.7, grow: 1.2, life: 2, alpha: 0.4 }); burst(fx, p, ['#D8FF8A', '#9B6BFF'], 12, 1.4, { gravity: -0.5, life: 1.4 }); }
      return true;
    }
    case 'rejuvenate': {
      spiral(fx, tgt, ['#7BFF9A', '#D4FF7A', '#FFFFFF'], 40, 0.8); fx.ring(tgt, '#7BFF9A', 1.8, 0.9); fx.emoji(tgt.clone().setY(tgt.y + 1.4), '🌿', 0.6);
      await wait(500); return true;
    }
    case 'overcharge': {
      const top = tgt.clone().setY(tgt.y + 7);
      fx.beam(top, tgt, '#22E3FF', 0.5, 0.12); fx.beam(top.clone().setX(top.x + 0.3), tgt, '#FFFFFF', 0.35, 0.04); fx.shake(0.25);
      burst(fx, tgt, ['#22E3FF', '#FFFFFF', '#FF4FD8'], 40, 4); fx.ring(tgt, '#22E3FF', 1.8);
      spiral(fx, tgt, ['#22E3FF', '#FF4FD8'], 24, 0.6);
      await wait(350); return true;
    }
    case 'sweettooth': {
      // candy rains down on the caster: two cards… and a tummy ache
      for (let i = 0; i < 30; i++) fx.add({ x: from.x + R(2.4), y: from.y + 4 + Math.random() * 2, z: from.z + R(1.4), vy: -3 - Math.random() * 2, color: ['#FF4FD8', '#FFE14D', '#5AE0FF', '#7BFF9A'][i % 4], size: 0.16, gravity: 3, life: 1.4 });
      fx.emoji(from.clone().setY(from.y + 1.6), '🍭', 0.7); await wait(250); fx.emoji(from.clone().setY(from.y + 2), '🃏', 0.6); fx.emoji(from.clone().add(new THREE.Vector3(0.6, 2, 0)), '🃏', 0.6);
      await wait(350); return true;
    }
    case 'terraform': {
      fx.ring(tgt, '#C8A070', 2.6, 0.9); fx.shake(0.2); burst(fx, tgt, ['#8A6A44', '#5A4430', '#7BC85A'], 36, 3.4, { soft: true, size: 0.2, gravity: 8 });
      await wait(300); return true;
    }
    case 'secondwind': {
      // a pillar of light: something climbs back up out of the ground
      for (let i = 0; i < 40; i++) fx.add({ x: tgt.x + R(0.8), y: tgt.y - 0.3, z: tgt.z + R(0.8), vy: 2.5 + Math.random() * 2.5, color: i % 3 ? '#FFE9A8' : '#FFFFFF', size: 0.14, life: 1, drag: 0.3 });
      fx.beam(tgt.clone().setY(tgt.y - 0.5), tgt.clone().setY(tgt.y + 6), '#FFE9A8', 0.9, 0.35); fx.ring(tgt, '#FFE9A8', 2, 0.9); fx.emoji(tgt.clone().setY(tgt.y + 1.5), '👻', 0.6);
      await wait(450); return true;
    }
    case 'mindswirl': {
      // rings of hypnotic light spiral out and wrap around the target
      for (let i = 0; i < 6; i++) { await wait(70); void fx.shot(from, tgt.clone().setY(tgt.y + 0.3), { kind: 'spark', color: i % 2 ? '#C89BFF' : '#22E3FF', dur: 0.5, arc: 1.2 + i * 0.1, size: 0.3 }); }
      await wait(450); spiral(fx, tgt, ['#C89BFF', '#22E3FF', '#FFFFFF'], 50, 0.9); fx.ring(tgt, '#C89BFF', 2.2, 0.9); fx.emoji(tgt.clone().setY(tgt.y + 1.5), '🌀', 0.7);
      return true;
    }
    case 'crystalball': {
      const orb = from.clone().setY(from.y + 1.2);
      for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; fx.add({ x: orb.x + Math.cos(a) * 0.9, y: orb.y, z: orb.z + Math.sin(a) * 0.9, color: i % 2 ? '#C89BFF' : '#8AD8FF', size: 0.14, life: 1.1, attract: { x: orb.x, y: orb.y, z: orb.z, k: 2, swirl: 6 } }); }
      fx.emoji(orb, '🔮', 0.9); await wait(500); fx.emoji(orb.clone().setY(orb.y + 0.6), '👁️', 0.6);
      return true;
    }
    case 'bubbleprison': {
      await fx.shot(from, tgt, { kind: 'bubble', color: '#8AD8FF', dur: 0.6, arc: 1.6, size: 0.5 });
      for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, u = Math.random() * Math.PI; fx.add({ x: tgt.x + Math.cos(a) * Math.sin(u) * 1, y: tgt.y + 0.2 + Math.cos(u) * 1, z: tgt.z + Math.sin(a) * Math.sin(u) * 1, color: ['#FF8AD8', '#8AD8FF', '#C8A8FF', '#FFFFFF'][i % 4], size: 0.16, life: 1.4, drag: 2 }); }
      fx.ring(tgt, '#8AD8FF', 1.8, 0.8);
      return true;
    }
    case 'fusionflask': {
      await fx.shot(from, tgt, { kind: 'goo', color: '#FFD24A', dur: 0.5, arc: 1.8, size: 0.35 });
      burst(fx, tgt, ['#FFD24A', '#FF4FD8', '#22E3FF', '#FFFFFF'], 40, 3.6);
      return true;
    }
    case 'luckycoin': {
      burst(fx, from.clone().setY(from.y + 1.5), ['#FFC83A', '#FFF0A0', '#FFFFFF'], 30, 2.6, { gravity: 3 });
      return false; // the coin itself flips as its own event
    }
  }
  return false;
}

/** A totem landing behind its lane: each with its own burst. */
export function totemFx(id: string, fx: CharFx, at: THREE.Vector3) {
  const looks: Record<string, [string[], string]> = {
    bloomwell: [['#7BFF9A', '#FFB0D8', '#FFFFFF'], '🌸'], kindleshrine: [FIRE, '🔥'], hoarfrost: [['#FFFFFF', '#BFF4FF', '#6FD3FF'], '❄️'],
    mirecauldron: [['#9B6BFF', '#D8FF8A', '#7ADC4A'], '🫧'], sprinklefountain: [['#FF4FD8', '#FFE14D', '#5AE0FF'], '💧'], teslacoil: [['#22E3FF', '#FF4FD8', '#FFFFFF'], '⚡'],
  };
  const [cols, e] = looks[id] ?? [['#FFE14D', '#FFFFFF'], '✨'];
  fx.ring(at, cols[0], 2, 0.7); burst(fx, at.clone().setY(at.y + 0.6), cols, 34, 3.2, { gravity: 5 }); fx.emoji(at.clone().setY(at.y + 1.6), e, 0.5); fx.shake(0.12);
}
