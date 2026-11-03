// Picnic Party — the playdate game. Your Inkborn and your friend's share a meadow full of snacks:
// you steer yours, theirs plays alongside (it heads for whatever you're not going for). Snacks score
// for the team; when you both munch within a moment of each other it's a team combo (double points
// for a while), and meeting up for a high-five is worth a bonus. Bees make you dizzy.
import type { Genome } from '../genome';
import { drawCreature, type CreatureState } from '../rig';
import { rng } from '../world';
import type { Engine, GameInput } from './engines';

type Pop = { x: number; y: number; text: string; color: string; life: number };
type Pal = { x: number; y: number; dir: 1 | -1; st: CreatureState; dizzy: number; ate: number; g: Genome };
type Snack = { x: number; y: number; kind: 'berry' | 'cake' | 'star'; age: number; bob: number };
type Bee = { x: number; y: number; vx: number; vy: number; t: number };
const SNACK = { berry: { pts: 1, emoji: '🫐', life: 9 }, cake: { pts: 3, emoji: '🧁', life: 7 }, star: { pts: 5, emoji: '⭐', life: 5 } } as const;

export function picnicParty(seed: number, W: number, H: number, input: GameInput, mine: Genome, theirs: Genome): Engine {
  const r = rng(seed);
  const px = Math.max(46, Math.min(W, H) * 0.12);
  const top = 90, bottom = H - 30;
  const me: Pal = { x: W * 0.35, y: H * 0.6, dir: 1, st: 'idle', dizzy: 0, ate: -9, g: mine };
  const pal: Pal = { x: W * 0.65, y: H * 0.6, dir: -1, st: 'idle', dizzy: 0, ate: -9, g: theirs };
  const snacks: Snack[] = [], bees: Bee[] = [];
  const pops: Pop[] = [];
  let score = 0, spawn = 0, beeT = 6, combo = 0, five = 0, t = 0, lastT = 0;
  const flowers = Array.from({ length: 40 }, () => ({ x: r() * W, y: top + r() * (bottom - top), c: ['#FF8FB1', '#FFE36B', '#FFFFFF', '#B69CFF'][(r() * 4) | 0] }));
  const clampXY = (p: Pal) => { p.x = Math.max(px * 0.5, Math.min(W - px * 0.5, p.x)); p.y = Math.max(top + px * 0.6, Math.min(bottom, p.y)); };
  const walk = (p: Pal, tx: number, ty: number, speed: number, dt: number) => {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 4) { if (p.st === 'walk') p.st = 'idle'; return; }
    const s = Math.min(d, speed * dt); p.x += (dx / d) * s; p.y += (dy / d) * s; p.dir = dx >= 0 ? 1 : -1; p.st = 'walk';
  };
  const eat = (p: Pal, s: Snack) => {
    const other = p === me ? pal : me;
    const team = t - other.ate < 1.5;
    p.ate = t;
    if (team) { combo = 6; pops.push({ x: (me.x + pal.x) / 2, y: Math.min(me.y, pal.y) - px * 1.3, text: 'team combo! ×2', color: '#7FE3FF', life: 0 }); }
    const pts = SNACK[s.kind].pts * (combo > 0 ? 2 : 1);
    score += pts; p.st = 'eat';
    pops.push({ x: s.x, y: s.y - 10, text: `+${pts}`, color: p === me ? '#FFE36B' : '#FFB1D0', life: 0 });
  };
  return {
    pops,
    score: () => score,
    step(dt, now) {
      t = now;
      combo = Math.max(0, combo - dt); five = Math.max(0, five - dt);
      // you
      if (me.dizzy > 0) { me.dizzy -= dt; me.st = 'look'; }
      else {
        const kx = (input.keys.has('arrowright') || input.keys.has('d') ? 1 : 0) - (input.keys.has('arrowleft') || input.keys.has('a') ? 1 : 0);
        const ky = (input.keys.has('arrowdown') || input.keys.has('s') ? 1 : 0) - (input.keys.has('arrowup') || input.keys.has('w') ? 1 : 0);
        if (kx || ky) walk(me, me.x + kx * 60, me.y + ky * 60, 300, dt);
        else if (input.target) walk(me, input.target.x, input.target.y + px * 0.3, 320, dt);
        else if (me.st === 'walk') me.st = 'idle';
      }
      // your friend's Inkborn: goes for the snack you're not heading for (stars first)
      if (pal.dizzy > 0) { pal.dizzy -= dt; pal.st = 'look'; }
      else {
        const mine2 = snacks.reduce<Snack | null>((b, s) => (!b || Math.hypot(s.x - me.x, s.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y) ? s : b), null);
        const want = snacks.filter((s) => s !== mine2).sort((a, b) => (SNACK[b.kind].pts - SNACK[a.kind].pts) * 40 + Math.hypot(a.x - pal.x, a.y - pal.y) - Math.hypot(b.x - pal.x, b.y - pal.y))[0];
        if (want) walk(pal, want.x, want.y, 230, dt);
        else if (Math.hypot(me.x - pal.x, me.y - pal.y) > px * 1.6) walk(pal, me.x - me.dir * px, me.y, 200, dt);
        else if (pal.st === 'walk') pal.st = 'idle';
      }
      clampXY(me); clampXY(pal);
      if (me.st === 'eat' && t - me.ate > 0.4) me.st = 'idle';
      if (pal.st === 'eat' && t - pal.ate > 0.4) pal.st = 'idle';
      // high-five when you meet up
      if (!five && Math.hypot(me.x - pal.x, me.y - pal.y) < px * 0.9) {
        five = 5; score += 5; me.st = 'happy'; pal.st = 'happy';
        pops.push({ x: (me.x + pal.x) / 2, y: Math.min(me.y, pal.y) - px * 1.2, text: 'high-five! +5', color: '#FFB1D0', life: 0 });
      }
      // snacks
      spawn -= dt;
      if (spawn <= 0 && snacks.length < 7) {
        spawn = 0.55 + r() * 0.5;
        const roll = r();
        snacks.push({ x: 30 + r() * (W - 60), y: top + 30 + r() * (bottom - top - 40), kind: roll < 0.64 ? 'berry' : roll < 0.9 ? 'cake' : 'star', age: 0, bob: r() * 6 });
      }
      for (let i = snacks.length - 1; i >= 0; i--) {
        const s = snacks[i]; s.age += dt;
        if (s.age > SNACK[s.kind].life) { snacks.splice(i, 1); continue; }
        for (const p of [me, pal]) if (Math.hypot(p.x - s.x, p.y - px * 0.3 - s.y) < px * 0.55) { eat(p, s); snacks.splice(i, 1); break; }
      }
      // bees
      beeT -= dt;
      if (beeT <= 0 && bees.length < 3) { beeT = 5 + r() * 4; const left = r() < 0.5; bees.push({ x: left ? -20 : W + 20, y: top + r() * (bottom - top), vx: (left ? 1 : -1) * (90 + r() * 60), vy: 0, t: r() * 6 }); }
      for (let i = bees.length - 1; i >= 0; i--) {
        const b = bees[i]; b.t += dt; b.x += b.vx * dt; b.y += Math.sin(b.t * 3) * 40 * dt;
        if (b.x < -40 || b.x > W + 40) { bees.splice(i, 1); continue; }
        for (const p of [me, pal]) if (p.dizzy <= 0 && Math.hypot(p.x - b.x, p.y - px * 0.4 - b.y) < px * 0.5) {
          p.dizzy = 1.2; score = Math.max(0, score - 2); pops.push({ x: p.x, y: p.y - px, text: 'bzzt -2', color: '#FF9A9A', life: 0 });
        }
      }
    },
    draw(g, W2, H2, now) {
      const dt = Math.max(0, now - lastT); lastT = now;
      const sky = g.createLinearGradient(0, 0, 0, H2); sky.addColorStop(0, '#9FE3FF'); sky.addColorStop(0.35, '#D9F7FF'); sky.addColorStop(0.36, '#8BD46B'); sky.addColorStop(1, '#4FA552');
      g.fillStyle = sky; g.fillRect(0, 0, W2, H2);
      g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 3; i++) { const x = ((i * 260 + now * 12) % (W2 + 200)) - 100; g.beginPath(); g.ellipse(x, 40 + i * 14, 50, 14, 0, 0, Math.PI * 2); g.fill(); }
      // a picnic blanket
      g.fillStyle = '#FF8FB1'; g.globalAlpha = 0.5; g.beginPath(); g.roundRect(W2 * 0.3, H2 * 0.75, W2 * 0.4, H2 * 0.12, 10); g.fill(); g.globalAlpha = 1;
      for (const f of flowers) { g.fillStyle = f.c; g.beginPath(); g.arc(f.x, f.y, 3, 0, Math.PI * 2); g.fill(); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const s of snacks) {
        const fade = Math.min(1, (SNACK[s.kind].life - s.age) / 1.2);
        g.globalAlpha = fade; g.font = `${s.kind === 'star' ? 30 : 26}px system-ui, "Apple Color Emoji", sans-serif`;
        g.fillText(SNACK[s.kind].emoji, s.x, s.y + Math.sin(now * 3 + s.bob) * 3); g.globalAlpha = 1;
      }
      g.font = '22px system-ui, "Apple Color Emoji", sans-serif';
      for (const b of bees) g.fillText('🐝', b.x, b.y);
      g.textBaseline = 'alphabetic';
      // draw back to front
      for (const p of [me, pal].sort((a, b) => a.y - b.y)) {
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(p.x, p.y + 2, px * 0.4, px * 0.1, 0, 0, Math.PI * 2); g.fill();
        drawCreature(g, p.g, p.x, p.y, px, { t: now, state: p.st, dir: p.dir });
        if (p.dizzy > 0) { g.font = '18px system-ui'; g.textAlign = 'center'; g.fillText('💫', p.x, p.y - px * 1.25); }
        g.font = '700 11px system-ui'; g.textAlign = 'center'; g.fillStyle = p === me ? '#1B2A5E' : '#7A2E52';
        g.fillText(p === me ? 'you' : 'friend', p.x, p.y + 16);
      }
      if (combo > 0) { g.fillStyle = 'rgba(127,227,255,0.9)'; g.beginPath(); g.roundRect(W2 / 2 - 70, 66, 140, 24, 12); g.fill(); g.fillStyle = '#0B2A3A'; g.font = '800 13px system-ui'; g.textAlign = 'center'; g.fillText(`TEAM COMBO ×2 · ${combo.toFixed(1)}s`, W2 / 2, 83); }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]; p.life += dt; if (p.life > 1) { pops.splice(i, 1); continue; }
        g.globalAlpha = 1 - p.life; g.font = '800 18px ui-rounded, system-ui'; g.textAlign = 'center';
        g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.strokeText(p.text, p.x, p.y - p.life * 30); g.fillStyle = p.color; g.fillText(p.text, p.x, p.y - p.life * 30);
      }
      g.globalAlpha = 1;
    },
  };
}
