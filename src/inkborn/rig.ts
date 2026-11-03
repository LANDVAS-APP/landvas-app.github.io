// The Inkborn rig: draws any genome as a set of parts (body, belly, pattern, legs, tail,
// wings, ears, horns, face) and animates each part procedurally — breathing, walking,
// looking, sleeping, eating, happy hops — so every creature moves the same, cute way.
import { shade, type Genome } from './genome';

export type CreatureState = 'idle' | 'walk' | 'look' | 'sleep' | 'eat' | 'happy';
export type Pose = { t: number; state: CreatureState; dir: 1 | -1; look?: number; seed?: number };

type Shape = { rx: number; ry: number };
const SHAPES: Record<Genome['body'], Shape> = {
  round: { rx: 0.62, ry: 0.58 }, bean: { rx: 0.7, ry: 0.52 }, tall: { rx: 0.5, ry: 0.72 },
  long: { rx: 0.86, ry: 0.47 }, pear: { rx: 0.62, ry: 0.6 }, blob: { rx: 0.64, ry: 0.56 },
};

function bodyPath(g: CanvasRenderingContext2D, body: Genome['body'], rx: number, ry: number, t: number) {
  g.beginPath();
  if (body === 'pear') {
    g.moveTo(0, -ry);
    g.bezierCurveTo(rx * 0.7, -ry, rx * 0.65, -ry * 0.1, rx * 1.05, ry * 0.45);
    g.bezierCurveTo(rx * 1.2, ry * 1.02, -rx * 1.2, ry * 1.02, -rx * 1.05, ry * 0.45);
    g.bezierCurveTo(-rx * 0.65, -ry * 0.1, -rx * 0.7, -ry, 0, -ry);
  } else if (body === 'blob') {
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.06 * Math.sin(a * 3 + t * 2.2);
      const x = Math.cos(a) * rx * wob, y = Math.sin(a) * ry * wob;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  } else {
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  }
  g.closePath();
}

/** Draw a creature with its feet at (x, y); `px` is its body height in pixels. */
export function drawCreature(g: CanvasRenderingContext2D, gen: Genome, x: number, y: number, px: number, pose: Pose) {
  const S = px * gen.size;
  const { t, state } = pose;
  const sh = SHAPES[gen.body] ?? SHAPES.round;
  const rx = sh.rx * S * 0.5, ry = sh.ry * S * 0.5;
  const seed = pose.seed ?? 0;
  const out = shade(gen.color, -28), dark = shade(gen.color, -14);
  // whole-body motion
  let bob = 0, sx = 1, sy = 1, tilt = 0;
  if (state === 'idle' || state === 'look') { const b = Math.sin(t * 2.4 + seed) * 0.03; sx = 1 - b; sy = 1 + b; }
  const gait = gen.legs > 0 ? 'walk' : gen.gait ?? 'roll';
  let roll = 0, lift = 0;
  if (state === 'walk') {
    if (gait === 'roll') { roll = t * 7; bob = -Math.abs(Math.sin(t * 7)) * S * 0.02; }
    else if (gait === 'bounce') { const h = Math.abs(Math.sin(t * 7)); bob = -h * S * 0.3; sy = 1 + (1 - h) * -0.12 + h * 0.06; sx = 2 - sy; }
    else if (gait === 'slither') { const b = Math.sin(t * 10) * 0.12; sx = 1 + b; sy = 1 - b * 0.6; tilt = Math.sin(t * 5) * 0.08; }
    else { bob = -Math.abs(Math.sin(t * 9)) * S * 0.07; const b = Math.sin(t * 18) * 0.035; sx = 1 + b; sy = 1 - b; tilt = Math.sin(t * 9) * 0.05; }
  }
  // hovering creatures float above the ground (except when asleep)
  if (gait === 'hover' && state !== 'sleep') lift = S * (0.22 + Math.sin(t * 2.6 + seed) * 0.05);
  if (state === 'happy') { const h = Math.abs(Math.sin(t * 6.5)); bob = -h * S * 0.32; sy = 1 + (1 - h) * -0.08 + h * 0.06; sx = 2 - sy; }
  if (state === 'sleep') { const b = Math.sin(t * 1.4) * 0.035; sy = 0.82 + b; sx = 1.1 - b; }
  if (state === 'eat') tilt = 0.18 + Math.sin(t * 10) * 0.08;
  const legSwing = state === 'walk' ? Math.sin(t * 9) * 0.55 : state === 'happy' ? 0.3 : 0;
  const tailWag = Math.sin(t * (state === 'walk' || state === 'happy' ? 10 : 2.6) + seed) * (state === 'sleep' ? 0.08 : 0.35);
  const flap = gen.wings === 'none' ? 0 : Math.sin(t * (state === 'happy' ? 18 : 4)) * (state === 'happy' ? 0.6 : 0.18);

  g.save();
  g.translate(x, y);
  // ground shadow (doesn't jump)
  g.fillStyle = 'rgba(20,24,40,0.28)';
  g.beginPath();
  g.ellipse(0, 0, rx * (state === 'happy' ? 0.8 + 0.2 * (1 + bob / (S * 0.32)) : 1.05) * (lift ? 0.7 : 1), ry * 0.22 * (lift ? 0.7 : 1), 0, 0, Math.PI * 2);
  g.fill();
  g.scale(pose.dir, 1);
  const legH = state === 'sleep' || gen.legs === 0 ? 0 : S * 0.16;
  g.translate(0, bob - lift - legH - ry * sy);
  g.rotate(tilt + roll);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const lw = Math.max(1.2, S * 0.035);

  // legs (back pair first, a little darker)
  const leg = (lx: number, phase: number, back: boolean) => {
    if (state === 'sleep') return;
    g.save();
    g.translate(lx, ry * sy * 0.82);
    g.rotate(legSwing * phase);
    g.fillStyle = back ? dark : gen.color;
    g.strokeStyle = out;
    g.lineWidth = lw;
    g.beginPath();
    g.roundRect(-S * 0.065, -S * 0.04, S * 0.13, legH + S * 0.06, S * 0.06);
    g.fill();
    g.stroke();
    g.restore();
  };
  // any number of legs, spread along the belly; with 3 or more, every other one stands behind
  const legXs = (() => {
    const n = gen.legs;
    if (n <= 0) return [] as { x: number; back: boolean; ph: number }[];
    if (n === 1) return [{ x: 0, back: false, ph: 1 }];
    if (n === 2) return [{ x: -rx * 0.35, back: false, ph: 1 }, { x: rx * 0.35, back: false, ph: -1 }];
    if (n === 4) return [{ x: -rx * 0.62, back: true, ph: -1 }, { x: rx * 0.38, back: true, ph: 1 }, { x: -rx * 0.38, back: false, ph: 1 }, { x: rx * 0.62, back: false, ph: -1 }];
    return Array.from({ length: n }, (_, i) => ({ x: -rx * 0.72 + (rx * 1.44 * i) / (n - 1), back: i % 2 === 1, ph: i % 2 ? -1 : 1 }));
  })();
  for (const l of legXs) if (l.back) leg(l.x, l.ph, true);

  // tail, from the back of the body
  if (gen.tail !== 'none') {
    g.save();
    g.translate(-rx * 0.92, ry * 0.25);
    g.rotate(-0.5 + tailWag);
    g.fillStyle = gen.tail === 'flame' ? gen.accent : gen.color;
    g.strokeStyle = out;
    g.lineWidth = lw;
    g.beginPath();
    const L = S * 0.42;
    if (gen.tail === 'fluffy') { g.ellipse(-L * 0.45, -L * 0.15, L * 0.42, L * 0.3, -0.5, 0, Math.PI * 2); }
    else if (gen.tail === 'long') { g.moveTo(0, -S * 0.04); g.quadraticCurveTo(-L * 0.7, -L * 0.1, -L, -L * 0.7); g.lineTo(-L * 0.95, -L * 0.55); g.quadraticCurveTo(-L * 0.6, 0, 0, S * 0.05); }
    else if (gen.tail === 'fin') { g.moveTo(0, 0); g.lineTo(-L * 0.8, -L * 0.5); g.lineTo(-L * 0.65, 0); g.lineTo(-L * 0.8, L * 0.4); g.closePath(); }
    else if (gen.tail === 'curl') { g.arc(-L * 0.4, -L * 0.25, L * 0.3, Math.PI * 0.2, Math.PI * 1.9); g.arc(-L * 0.4, -L * 0.25, L * 0.14, Math.PI * 1.9, Math.PI * 0.2, true); }
    else { g.moveTo(0, 0); g.quadraticCurveTo(-L * 0.5, -L * 0.2, -L * 0.75, -L * 0.75); g.quadraticCurveTo(-L * 0.55, -L * 0.35, -L * 0.85, -L * 0.25); g.quadraticCurveTo(-L * 0.4, L * 0.1, 0, S * 0.06); }
    g.fill();
    g.stroke();
    g.restore();
  }

  // wings behind the shoulders
  if (gen.wings !== 'none') {
    g.save();
    g.translate(-rx * 0.15, -ry * 0.45);
    g.rotate(-0.6 - flap);
    g.fillStyle = gen.wings === 'leaf' ? shade(gen.accent, 10) : '#FFFFFF';
    g.globalAlpha = 0.92;
    g.strokeStyle = out;
    g.lineWidth = lw;
    g.beginPath();
    const W = S * (gen.wings === 'leaf' ? 0.42 : 0.26);
    g.ellipse(-W * 0.55, -W * 0.2, W * 0.6, W * 0.32, -0.4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
  }

  // body
  g.save();
  g.scale(sx, sy);
  bodyPath(g, gen.body, rx, ry, t);
  g.fillStyle = gen.color;
  g.fill();
  g.save();
  g.clip();
  // soft light from the top
  const lg = g.createRadialGradient(-rx * 0.3, -ry * 0.6, 0, 0, 0, Math.max(rx, ry) * 1.3);
  lg.addColorStop(0, 'rgba(255,255,255,0.35)');
  lg.addColorStop(0.5, 'rgba(255,255,255,0)');
  lg.addColorStop(1, 'rgba(0,0,0,0.18)');
  // pattern
  g.fillStyle = gen.accent;
  g.globalAlpha = 0.85;
  if (gen.pattern === 'spots') for (let i = 0; i < 7; i++) { const a = i * 2.39 + 0.7; g.beginPath(); g.arc(Math.cos(a) * rx * 0.62, Math.sin(a) * ry * 0.55 - ry * 0.1, S * (0.045 + (i % 3) * 0.015), 0, Math.PI * 2); g.fill(); }
  if (gen.pattern === 'stripes') for (let i = -3; i <= 3; i++) { g.save(); g.translate(i * rx * 0.3, -ry * 0.2); g.rotate(0.25); g.fillRect(-S * 0.03, -ry, S * 0.06, ry * 0.9); g.restore(); }
  if (gen.pattern === 'patches') { g.beginPath(); g.ellipse(-rx * 0.45, -ry * 0.25, rx * 0.38, ry * 0.32, 0.4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(rx * 0.5, ry * 0.3, rx * 0.25, ry * 0.22, -0.3, 0, Math.PI * 2); g.fill(); }
  if (gen.pattern === 'stars') for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; star(g, Math.cos(a) * rx * 0.6, Math.sin(a) * ry * 0.5 - ry * 0.15, S * 0.07); }
  g.globalAlpha = 1;
  // belly
  g.fillStyle = gen.belly;
  g.beginPath();
  g.ellipse(rx * 0.12, ry * 0.42, rx * 0.62, ry * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = lg;
  g.fillRect(-rx * 1.3, -ry * 1.3, rx * 2.6, ry * 2.6);
  g.restore();
  bodyPath(g, gen.body, rx, ry, t);
  g.strokeStyle = out;
  g.lineWidth = lw;
  g.stroke();
  g.restore();

  for (const l of legXs) if (!l.back) leg(l.x, l.ph, false);

  // ears and horns on top
  const topY = -ry * sy;
  const earWig = state === 'happy' ? Math.sin(t * 12) * 0.2 : Math.sin(t * 1.7 + seed) * 0.05;
  const ear = (side: number) => {
    if (gen.ears === 'none') return;
    g.save();
    g.translate(side * rx * 0.48 + rx * 0.08, topY + ry * 0.18);
    g.rotate(side * (0.3 + earWig) + (gen.ears === 'floppy' ? side * 1.6 : 0));
    g.fillStyle = gen.color;
    g.strokeStyle = out;
    g.lineWidth = lw;
    g.beginPath();
    const E = S * 0.2;
    if (gen.ears === 'cat') { g.moveTo(-E * 0.5, 0); g.lineTo(0, -E * 1.1); g.lineTo(E * 0.5, 0); g.closePath(); }
    else if (gen.ears === 'bunny') g.ellipse(0, -E * 1.1, E * 0.3, E * 1.05, 0, 0, Math.PI * 2);
    else if (gen.ears === 'round') g.arc(0, -E * 0.35, E * 0.48, 0, Math.PI * 2);
    else if (gen.ears === 'floppy') g.ellipse(0, -E * 0.7, E * 0.32, E * 0.8, 0, 0, Math.PI * 2);
    else { g.moveTo(0, 0); g.lineTo(-E * 0.2, -E * 0.9); g.lineTo(E * 0.4, -E * 0.6); g.closePath(); }
    g.fill();
    g.stroke();
    if (gen.ears !== 'fins') {
      g.fillStyle = shade(gen.belly, -4);
      g.beginPath();
      if (gen.ears === 'cat') { g.moveTo(-E * 0.25, -E * 0.08); g.lineTo(0, -E * 0.75); g.lineTo(E * 0.25, -E * 0.08); }
      else if (gen.ears === 'bunny') g.ellipse(0, -E * 1.05, E * 0.14, E * 0.75, 0, 0, Math.PI * 2);
      else if (gen.ears === 'round') g.arc(0, -E * 0.35, E * 0.25, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  ear(-1);
  ear(1);
  if (gen.horns !== 'none') {
    g.fillStyle = gen.horns === 'antlers' ? '#B58A5B' : '#FFF4D6';
    g.strokeStyle = shade(g.fillStyle as string, -35);
    g.lineWidth = lw;
    const H = S * 0.22;
    const horn = (hx: number, ang: number) => {
      g.save();
      g.translate(hx, topY + ry * 0.12);
      g.rotate(ang);
      g.beginPath();
      if (gen.horns === 'nubs') g.arc(0, -H * 0.2, H * 0.28, Math.PI, 0);
      else if (gen.horns === 'curly') { g.moveTo(-H * 0.2, 0); g.quadraticCurveTo(-H * 0.4, -H * 1.1, H * 0.35, -H * 0.9); g.quadraticCurveTo(-H * 0.05, -H * 0.7, H * 0.2, 0); }
      else if (gen.horns === 'antlers') { g.moveTo(0, 0); g.lineTo(0, -H * 1.2); g.moveTo(0, -H * 0.6); g.lineTo(H * 0.45, -H * 0.95); g.moveTo(0, -H * 0.85); g.lineTo(-H * 0.4, -H * 1.15); }
      else { g.moveTo(-H * 0.18, 0); g.lineTo(0, -H * 1.5); g.lineTo(H * 0.18, 0); g.closePath(); }
      if (gen.horns === 'antlers') { g.lineWidth = S * 0.06; g.strokeStyle = '#8A6239'; g.stroke(); } else { g.fill(); g.stroke(); }
      g.restore();
    };
    if (gen.horns === 'unicorn') horn(rx * 0.2, 0.15);
    else { horn(-rx * 0.25, -0.35); horn(rx * 0.45, 0.35); }
  }

  // face (towards the front)
  const fx = rx * 0.2 + (pose.look ?? 0) * rx * 0.12;
  const fy = -ry * sy * 0.25;
  const eyeGap = Math.min(rx * 0.32, S * 0.15);
  const blink = state !== 'sleep' && (Math.sin(t * 0.9 + seed * 3) > 0.985);
  const nEyes = gen.eyecount ?? (gen.eyes === 'one' ? 1 : 2);
  const er = S * (gen.eyes === 'big' ? 0.085 : gen.eyes === 'one' || nEyes === 1 ? 0.11 : 0.062) * (nEyes >= 5 ? 0.68 : nEyes >= 3 ? 0.82 : 1);
  const eye = (ex: number, ey = fy) => {
    g.save();
    g.translate(ex, ey);
    if (state === 'sleep' || blink || gen.eyes === 'sleepy') {
      g.strokeStyle = '#1B1F3D';
      g.lineWidth = Math.max(1.2, S * 0.03);
      g.beginPath();
      if (state === 'sleep' || blink) g.arc(0, -er * 0.2, er * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
      else { g.arc(0, 0, er * 0.85, 0, Math.PI); g.moveTo(-er, 0); g.lineTo(er, 0); }
      g.stroke();
    } else if (state === 'happy' || gen.eyes === 'happy') {
      g.strokeStyle = '#1B1F3D';
      g.lineWidth = Math.max(1.4, S * 0.035);
      g.beginPath();
      g.arc(0, er * 0.4, er * 0.8, 1.15 * Math.PI, 1.85 * Math.PI);
      g.stroke();
    } else if (gen.eyes === 'star') {
      g.fillStyle = '#1B1F3D';
      star(g, 0, 0, er * 1.25);
      g.fillStyle = '#FFE14D';
      star(g, 0, 0, er * 0.6);
    } else {
      g.fillStyle = '#FFFFFF';
      g.beginPath(); g.ellipse(0, 0, er * 1.05, er * 1.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1B1F3D';
      const lk = (pose.look ?? 0) * er * 0.3;
      g.beginPath(); g.arc(lk + er * 0.15, er * 0.1, er * 0.72, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FFFFFF';
      g.beginPath(); g.arc(lk + er * 0.42, -er * 0.25, er * 0.24, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  };
  // eye layouts: one in the middle, a pair, a third on the forehead, then rows
  const up = er * 2.4;
  const layout: [number, number][] =
    nEyes <= 0 ? [] : nEyes === 1 ? [[fx, fy]] : nEyes === 2 ? [[fx - eyeGap, fy], [fx + eyeGap, fy]]
      : nEyes === 3 ? [[fx - eyeGap, fy], [fx + eyeGap, fy], [fx, fy - up]]
      : nEyes === 4 ? [[fx - eyeGap, fy], [fx + eyeGap, fy], [fx - eyeGap * 0.9, fy - up], [fx + eyeGap * 0.9, fy - up]]
      : nEyes === 5 ? [[fx - eyeGap, fy], [fx + eyeGap, fy], [fx - eyeGap * 1.3, fy - up], [fx, fy - up * 1.15], [fx + eyeGap * 1.3, fy - up]]
      : [[fx - eyeGap * 1.4, fy], [fx, fy + er * 0.3], [fx + eyeGap * 1.4, fy], [fx - eyeGap * 1.3, fy - up], [fx, fy - up * 1.15], [fx + eyeGap * 1.3, fy - up]];
  for (const [ex, ey] of layout) eye(ex, ey);
  if (gen.cheeks) {
    g.fillStyle = 'rgba(255,110,150,0.45)';
    for (const cxp of [fx - eyeGap * 1.55, fx + eyeGap * 1.55]) { g.beginPath(); g.ellipse(cxp, fy + er * 1.6, er * 0.75, er * 0.45, 0, 0, Math.PI * 2); g.fill(); }
  }
  // mouth
  g.strokeStyle = '#1B1F3D';
  g.lineWidth = Math.max(1.1, S * 0.028);
  g.beginPath();
  const my = fy + er * 2.1;
  if (state === 'eat' && Math.sin(t * 10) > 0) { g.fillStyle = '#7A2335'; g.ellipse(fx, my, er * 0.45, er * 0.55, 0, 0, Math.PI * 2); g.fill(); }
  else if (state === 'happy') { g.fillStyle = '#7A2335'; g.arc(fx, my - er * 0.2, er * 0.6, 0, Math.PI); g.fill(); }
  else if (state === 'sleep') { g.arc(fx, my, er * 0.25, 0, Math.PI * 2); g.stroke(); }
  else { g.arc(fx - er * 0.3, my - er * 0.2, er * 0.32, 0.1 * Math.PI, 0.9 * Math.PI); g.arc(fx + er * 0.3, my - er * 0.2, er * 0.32, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
  g.restore();

  // little effects above the head
  if (state === 'sleep') {
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = `bold ${Math.round(S * 0.22)}px system-ui, sans-serif`;
    for (let i = 0; i < 2; i++) {
      const k = ((t * 0.5 + i * 0.5) % 1);
      g.globalAlpha = 1 - k;
      g.fillText('z', x + pose.dir * (rx * 0.6 + k * S * 0.3), y - legH - ry * 2 - k * S * 0.5);
    }
    g.restore();
  }
  if (state === 'happy') {
    g.save();
    for (let i = 0; i < 2; i++) {
      const k = ((t * 0.8 + i * 0.5) % 1);
      g.globalAlpha = 1 - k;
      heart(g, x + (i ? 1 : -1) * rx * 0.8, y - ry * 2.3 - k * S * 0.6, S * 0.09);
    }
    g.restore();
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
  g.fill();
}
export function heart(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#FF4D6D';
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
  g.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  g.fill();
}
