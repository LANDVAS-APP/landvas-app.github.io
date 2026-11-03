// The planet-plot minigames: every world's plots have two of their own. They share five engine
// families (dodge, hop, catch, echo and the Moon's lander), each dressed in its world's colours and
// hazards. Same contract as the other games: the server sets the seed, checks the round ran its full
// time and caps the score.
import type { Engine, GameInput } from '../inkborn/games/engines';
import { rng } from '../inkborn/world';
import { moonLander } from './games';
import { WORLDS, exoWorld, type World } from './worlds';

type Family = 'dodge' | 'hop' | 'catch' | 'echo' | 'lander' | 'mine' | 'sling' | 'stack';
export type PlanetGameInfo = { name: string; emoji: string; family: Family; world: string; blurb: string; how: string; wind?: number; good: string; bad: string; bonus?: boolean };

const HOW: Record<Family, string> = {
  dodge: 'Drag (or hold A/D, ←/→) to steer. Gems are 1, stars 5. Getting hit costs 3 and stuns you for a moment. It speeds up as you go.',
  hop: 'You bounce by yourself — steer with drag or A/D, ←/→ and climb as high as you can. Height and gems score; falling costs 5.',
  catch: 'Tap each glow before it fades. Every catch is 2, and every 3 in a row adds a bonus. Tapping empty space breaks your streak.',
  echo: 'Watch the pads light up, then play the tune back. Every right note scores, a whole tune scores its length again. Tunes get longer.',
  lander: 'Hold (or ↑ / W / Space) to fire the thruster; touch left or right (or ←/→) to drift. Land slow and level on the glowing pad.',
  mine: 'Tap a cluster of two or more touching ores of the same colour to mine it. Bigger clusters score far more (2 → 2, 3 → 6, 4 → 12…). Golden ores are worth double.',
  sling: 'Drag back from your probe and let go to launch it. Planets bend its path — curve round them into the glowing rings. Every ring hit is 10; a ring hit after a slingshot round a planet is 20.',
  stack: 'Modules swing above your station — tap (or Space) to drop one. Land it on the stack; anything hanging over the edge is sliced off. A perfect drop is 5 and keeps the width.',
};
const g = (name: string, emoji: string, family: Family, world: string, blurb: string, good: string, bad: string, wind?: number): PlanetGameInfo =>
  ({ name, emoji, family, world, blurb, how: HOW[family], good, bad, wind });

const b = (name: string, emoji: string, family: Family, world: string, blurb: string): PlanetGameInfo => ({ ...g(name, emoji, family, world, blurb, '', ''), bonus: true });

export const PLANET_GAMES: Record<string, PlanetGameInfo> = {
  moonlander: g('Moon Lander', '🌙', 'lander', 'moon', 'Set your lander down gently on the glowing pad. Again. And again.', '✨', '🪨'),
  rockrun: g('Rock Run', '🪨', 'dodge', 'moon', 'Moonrocks tumble off the crater rim — weave through and grab the glinting gems.', '💎', '🪨'),
  sunflare: g('Sun Flare', '☀️', 'dodge', 'mercury', 'The Sun is right there. Dodge the flares, catch the cooled sparks.', '💎', '🔥'),
  craterleap: g('Crater Leap', '🕳️', 'hop', 'mercury', 'Bounce from crater rim to crater rim, up out of the scorched valley.', '💎', '🕳️'),
  cloudhop: g('Cloud Hop', '☁️', 'hop', 'venus', 'Hop up Venus’s golden clouds — just don’t look down.', '💎', '☁️'),
  acidrain: g('Acid Rain', '🌧️', 'dodge', 'venus', 'It rains acid on Venus. Stay dry, grab the golden drops.', '💛', '💧'),
  duststorm: g('Dust Storm', '🌪️', 'dodge', 'mars', 'A Martian dust storm blows in sideways. Hold your line.', '💎', '🪨', 60),
  olympus: g('Olympus Climb', '🏔️', 'hop', 'mars', 'Climb the tallest volcano in the solar system, one bounce at a time.', '💎', '🔥'),
  stormcatch: g('Storm Catch', '⚡', 'catch', 'jupiter', 'Jupiter’s storms crackle with lightning — catch every bolt.', '⚡', ''),
  moonsong: g('Moon Song', '🎶', 'echo', 'jupiter', 'Jupiter’s four big moons hum a tune. Sing it back to them.', '', ''),
  ringrun: g('Ring Run', '💫', 'dodge', 'saturn', 'Skim Saturn’s rings: dodge the ice boulders, scoop the sparkles.', '✨', '🧊'),
  ringecho: g('Ring Echo', '🪐', 'echo', 'saturn', 'Each ring rings its own note. Echo the chime.', '', ''),
  icefloe: g('Ice Floe', '🧊', 'hop', 'uranus', 'Bounce up drifting ice floes through the blue-green haze.', '💎', '🧊'),
  aurora: g('Aurora', '🌌', 'catch', 'uranus', 'Catch the aurora’s flickers before they fade away.', '🌈', ''),
  windrider: g('Wind Rider', '💨', 'dodge', 'neptune', 'The fastest winds anywhere. Ride them and dodge the ice.', '💎', '🧊', -80),
  deepdive: g('Deep Dive', '🐟', 'catch', 'neptune', 'Something glows down in Neptune’s deep blue. Catch the lights.', '🔵', ''),
  hearthop: g('Heart Hop', '🤍', 'hop', 'pluto', 'Hop across Pluto’s great frozen heart.', '💎', '🧊'),
  cometcatch: g('Comet Catch', '☄️', 'catch', 'pluto', 'Out here comets pass close. Grab their tails!', '☄️', ''),
  aliengarden: g('Alien Garden', '🌸', 'catch', 'exo', 'Strange flowers bloom and close in a blink. Catch them open.', '🌸', ''),
  starecho: g('Star Echo', '⭐', 'echo', 'exo', 'Your home stars twinkle in a pattern. Twinkle it back.', '', ''),
  // bonus games: unlocked by Nebula-or-rarer plots
  regolith: b('Moon Miner', '⛏️', 'mine', 'moon', 'Dig the Moon’s regolith for clusters of glowing ore.'),
  solarstack: b('Sun Shield Stack', '🛡️', 'stack', 'mercury', 'Build a sun-shield tower right under the blazing Sun.'),
  cloudcity: b('Cloud City', '🏙️', 'stack', 'venus', 'Stack a floating city high above Venus’s acid clouds.'),
  redminer: b('Red Ore Rush', '🔴', 'mine', 'mars', 'Iron, copper and rare Martian crystals — mine the richest seams.'),
  slingshot: b('Jovian Slingshot', '🌀', 'sling', 'jupiter', 'Whip probes round Jupiter’s moons and through the target rings.'),
  ringsling: b('Ring Sling', '🪐', 'sling', 'saturn', 'Thread probes through Saturn’s gaps using its moons’ gravity.'),
  iceminer: b('Ice Core Dig', '🧊', 'mine', 'uranus', 'Drill Uranus’s icy mantle for frozen gems.'),
  trenchsling: b('Trench Sling', '🌊', 'sling', 'neptune', 'Fling probes through Triton’s geysers and into the rings.'),
  heartstack: b('Heart Station', '🤍', 'stack', 'pluto', 'Raise a research station on Pluto’s frozen heart.'),
  alienore: b('Alien Ore Rush', '👾', 'mine', 'exo', 'Ores no one has ever named — on your very own world.'),
};

type Pop = { x: number; y: number; text: string; color: string; life: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const steer = (input: GameInput) => (input.keys.has('arrowleft') || input.keys.has('a') ? -1 : 0) + (input.keys.has('arrowright') || input.keys.has('d') ? 1 : 0);
function pops(g2: CanvasRenderingContext2D, list: Pop[], dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]; p.life += dt;
    if (p.life > 1) { list.splice(i, 1); continue; }
    g2.globalAlpha = 1 - p.life; g2.font = '800 18px ui-rounded, system-ui, sans-serif'; g2.textAlign = 'center';
    g2.lineWidth = 4; g2.strokeStyle = 'rgba(0,0,0,0.5)'; g2.strokeText(p.text, p.x, p.y - p.life * 30);
    g2.fillStyle = p.color; g2.fillText(p.text, p.x, p.y - p.life * 30);
  }
  g2.globalAlpha = 1;
}
function sky(g2: CanvasRenderingContext2D, w: World, W: number, H: number, t: number, seed: number) {
  const bg = g2.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, w.sky[0]); bg.addColorStop(1, w.sky[1]);
  g2.fillStyle = bg; g2.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let i = 0; i < 50; i++) {
    g2.globalAlpha = (w.dark ? 0.5 : 0.18) + 0.2 * Math.sin(t * 1.5 + i);
    g2.fillStyle = '#fff'; g2.fillRect(r() * W, r() * H, 1.6, 1.6);
  }
  g2.globalAlpha = 1;
}
const emoji = (g2: CanvasRenderingContext2D, e: string, x: number, y: number, s: number) => { g2.font = `${Math.round(s)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(e, x, y); g2.textBaseline = 'alphabetic'; };
function pilot(g2: CanvasRenderingContext2D, x: number, y: number, s: number, accent: string, hurt: number, t: number) {
  g2.save(); g2.translate(x, y);
  if (hurt > 0) g2.rotate(Math.sin(t * 40) * 0.25);
  g2.fillStyle = 'rgba(0,0,0,0.25)'; g2.beginPath(); g2.ellipse(0, s * 0.5, s * 0.35, s * 0.08, 0, 0, Math.PI * 2); g2.fill();
  g2.fillStyle = '#F2F5FB'; g2.beginPath(); g2.roundRect(-s * 0.26, -s * 0.1, s * 0.52, s * 0.58, s * 0.16); g2.fill();
  g2.fillStyle = accent; g2.fillRect(-s * 0.26, s * 0.12, s * 0.52, s * 0.1);
  g2.fillStyle = 'rgba(200,230,255,0.9)'; g2.beginPath(); g2.arc(0, -s * 0.24, s * 0.26, 0, Math.PI * 2); g2.fill();
  g2.fillStyle = '#1B2A5E'; g2.beginPath(); g2.ellipse(0, -s * 0.22, s * 0.17, s * 0.12, 0, 0, Math.PI * 2); g2.fill();
  g2.fillStyle = 'rgba(255,255,255,0.7)'; g2.beginPath(); g2.ellipse(-s * 0.08, -s * 0.28, s * 0.05, s * 0.03, -0.5, 0, Math.PI * 2); g2.fill();
  g2.restore();
}

type Opts = { world: World; info: PlanetGameInfo; accent: string };

// ---- dodge ----------------------------------------------------------------------------------
function dodge(seed: number, W: number, H: number, input: GameInput, o: Opts): Engine {
  const r = rng(seed);
  const size = clamp(Math.min(W, H) * 0.12, 40, 70);
  const me = { x: W / 2, y: H - size * 1.2, hurt: 0 };
  type Thing = { x: number; y: number; v: number; vx: number; kind: 'bad' | 'gem' | 'star'; s: number };
  const things: Thing[] = []; const list: Pop[] = [];
  let score = 0, spawn = 0, elapsed = 0, lastT = 0;
  return {
    pops: list,
    score: () => score,
    step(dt) {
      elapsed += dt;
      const speed = 1 + elapsed / 30;
      const k = steer(input);
      if (input.target) me.x += clamp(input.target.x - me.x, -900 * dt, 900 * dt);
      else me.x += k * 520 * dt;
      if (o.info.wind && me.hurt <= 0) me.x += o.info.wind * dt * (0.6 + 0.4 * Math.sin(elapsed * 0.9));
      me.x = clamp(me.x, size / 2, W - size / 2);
      me.hurt = Math.max(0, me.hurt - dt);
      spawn -= dt;
      if (spawn <= 0) {
        spawn = (0.42 + r() * 0.3) / speed;
        const roll = r();
        things.push({ x: 20 + r() * (W - 40), y: -30, v: (150 + r() * 110) * speed, vx: (o.info.wind ?? 0) * 0.7, kind: roll < 0.46 ? 'bad' : roll < 0.93 ? 'gem' : 'star', s: size * (0.55 + r() * 0.35) });
      }
      for (let i = things.length - 1; i >= 0; i--) {
        const t = things[i]; t.y += t.v * dt; t.x += t.vx * dt;
        if (t.y > H + 40) { things.splice(i, 1); continue; }
        if (Math.hypot(t.x - me.x, t.y - me.y) < (t.s + size) * 0.38) {
          things.splice(i, 1);
          if (t.kind === 'bad') { if (me.hurt <= 0) { score = Math.max(0, score - 3); me.hurt = 0.8; list.push({ x: me.x, y: me.y - size, text: '-3', color: '#FF6B6B', life: 0 }); } }
          else { const p = t.kind === 'star' ? 5 : 1; score += p; list.push({ x: t.x, y: t.y, text: `+${p}`, color: '#FFE36B', life: 0 }); }
        }
      }
    },
    draw(g2, W2, H2, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      sky(g2, o.world, W2, H2, t, seed);
      g2.fillStyle = o.world.ground[1]; g2.fillRect(0, H2 - size * 0.55, W2, size);
      if (o.info.wind) { g2.strokeStyle = 'rgba(255,255,255,0.25)'; g2.lineWidth = 2; for (let i = 0; i < 12; i++) { const y = (i * 97) % H2, x = ((i * 173 + t * o.info.wind * 4) % (W2 + 200) + W2 + 200) % (W2 + 200) - 100; g2.beginPath(); g2.moveTo(x, y); g2.lineTo(x + 60, y); g2.stroke(); } }
      for (const th of things) emoji(g2, th.kind === 'bad' ? o.info.bad : th.kind === 'star' ? '⭐' : o.info.good, th.x, th.y, th.s);
      pilot(g2, me.x, me.y, size, o.accent, me.hurt, t);
      pops(g2, list, dt);
    },
  };
}

// ---- hop ------------------------------------------------------------------------------------
function hop(seed: number, W: number, H: number, input: GameInput, o: Opts): Engine {
  const r = rng(seed);
  const size = clamp(Math.min(W, H) * 0.1, 36, 60);
  const grav = 1300 * clamp(o.world.gravity, 0.5, 1.4), jump = Math.sqrt(2 * grav * H * 0.32);
  type Plat = { x: number; y: number; w: number; vx: number; gem: boolean };
  const plats: Plat[] = [];
  let top = H - 40;
  const add = () => { top -= H * (0.11 + r() * 0.08); const w = W * (0.18 + r() * 0.12); plats.push({ x: r() * (W - w), y: top, w, vx: r() < 0.25 ? (r() - 0.5) * 160 : 0, gem: r() < 0.35 }); };
  plats.push({ x: 0, y: H - 40, w: W, vx: 0, gem: false });
  while (top > -H) add();
  const me = { x: W / 2, y: H - 40, vy: -jump };
  let cam = 0, best = 0, gems = 0, falls = 0, lastT = 0;
  const list: Pop[] = [];
  const score = () => Math.max(0, Math.floor(best / (H * 0.12)) + gems * 3 - falls * 5);
  return {
    pops: list, score,
    step(dt) {
      const k = steer(input);
      if (input.target) me.x += clamp(input.target.x - me.x, -700 * dt, 700 * dt); else me.x += k * 420 * dt;
      me.x = (me.x + W) % W;
      const prevY = me.y;
      me.vy += grav * dt; me.y += me.vy * dt;
      for (const p of plats) {
        p.x += p.vx * dt; if (p.x < 0 || p.x + p.w > W) p.vx *= -1;
        if (me.vy > 0 && prevY <= p.y && me.y >= p.y && me.x > p.x - 6 && me.x < p.x + p.w + 6) {
          me.y = p.y; me.vy = -jump;
          if (p.gem) { p.gem = false; gems++; list.push({ x: me.x, y: me.y - cam - size, text: '+3', color: '#FFE36B', life: 0 }); }
        }
      }
      const target = Math.min(cam, me.y - H * 0.45);
      cam += (target - cam) * Math.min(1, dt * 6);
      best = Math.max(best, H - 40 - me.y);
      while (top > cam - H) add();
      for (let i = plats.length - 1; i >= 0; i--) if (plats[i].y > cam + H + 60 && plats.length > 8) plats.splice(i, 1);
      if (me.y > cam + H + 40) { // fell: back onto the lowest platform in view
        falls++; list.push({ x: W / 2, y: H * 0.6, text: '-5', color: '#FF6B6B', life: 0 });
        const p = plats.filter((q) => q.y < cam + H - 20).sort((a, b) => b.y - a.y)[0] ?? plats[0];
        me.x = p.x + p.w / 2; me.y = p.y; me.vy = -jump;
      }
    },
    draw(g2, W2, H2, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      sky(g2, o.world, W2, H2, t, seed);
      for (const p of plats) {
        const y = p.y - cam; if (y < -30 || y > H2 + 30) continue;
        g2.fillStyle = o.world.ground[0]; g2.beginPath(); g2.roundRect(p.x, y, p.w, 14, 7); g2.fill();
        g2.fillStyle = o.world.ground[1]; g2.fillRect(p.x + 6, y + 10, p.w - 12, 6);
        if (p.gem) emoji(g2, o.info.good, p.x + p.w / 2, y - 22 + Math.sin(t * 3 + p.x) * 4, 26);
      }
      pilot(g2, me.x, me.y - cam - size * 0.48, size, o.accent, 0, t);
      g2.fillStyle = 'rgba(0,0,0,0.4)'; g2.beginPath(); g2.roundRect(W2 / 2 - 60, H2 - 34, 120, 24, 12); g2.fill();
      g2.fillStyle = '#fff'; g2.font = '700 13px system-ui'; g2.textAlign = 'center'; g2.fillText(`${Math.floor(best / 10)} m`, W2 / 2, H2 - 17);
      pops(g2, list, dt);
    },
  };
}

// ---- catch ----------------------------------------------------------------------------------
function catchGame(seed: number, W: number, H: number, input: GameInput, o: Opts): Engine {
  const r = rng(seed);
  type Glow = { x: number; y: number; age: number; life: number; s: number };
  const glows: Glow[] = []; const list: Pop[] = [];
  let score = 0, streak = 0, spawn = 0.4, elapsed = 0, lastT = 0;
  return {
    pops: list, score: () => score,
    step(dt) {
      elapsed += dt;
      spawn -= dt;
      if (spawn <= 0 && glows.length < 5) { spawn = Math.max(0.35, 0.9 - elapsed / 80); glows.push({ x: 40 + r() * (W - 80), y: 90 + r() * (H - 160), age: 0, life: Math.max(1.0, 2.2 - elapsed / 50), s: 30 + r() * 18 }); }
      for (let i = glows.length - 1; i >= 0; i--) { glows[i].age += dt; if (glows[i].age > glows[i].life) { glows.splice(i, 1); streak = 0; } }
      const tap = input.tap; input.tap = null;
      if (tap) {
        const hit = glows.findIndex((q) => Math.hypot(q.x - tap.x, q.y - tap.y) < q.s + 18);
        if (hit >= 0) {
          const q = glows.splice(hit, 1)[0]; streak++;
          const p = 2 + (streak % 3 === 0 ? 3 : 0); score += p;
          list.push({ x: q.x, y: q.y, text: streak % 3 === 0 ? `+${p} combo!` : `+${p}`, color: '#FFE36B', life: 0 });
        } else { if (streak) list.push({ x: tap.x, y: tap.y, text: 'miss', color: '#FF9A9A', life: 0 }); streak = 0; }
      }
    },
    draw(g2, W2, H2, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      sky(g2, o.world, W2, H2, t, seed);
      for (const q of glows) {
        const k = q.age / q.life, a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
        const gl = g2.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.s * 1.8);
        gl.addColorStop(0, 'rgba(255,255,255,0.8)'); gl.addColorStop(0.4, o.world.detail); gl.addColorStop(1, 'rgba(255,255,255,0)');
        g2.globalAlpha = a * 0.7; g2.fillStyle = gl; g2.beginPath(); g2.arc(q.x, q.y, q.s * 1.8, 0, Math.PI * 2); g2.fill();
        g2.globalAlpha = a; emoji(g2, o.info.good, q.x, q.y, q.s * 1.1);
        g2.strokeStyle = 'rgba(255,255,255,0.6)'; g2.lineWidth = 3; g2.beginPath(); g2.arc(q.x, q.y, q.s + 6, -Math.PI / 2, -Math.PI / 2 + (1 - k) * Math.PI * 2); g2.stroke();
      }
      g2.globalAlpha = 1;
      if (streak >= 2) { g2.fillStyle = '#FFE36B'; g2.font = '800 16px system-ui'; g2.textAlign = 'center'; g2.fillText(`streak ${streak}`, W2 / 2, H2 - 24); }
      pops(g2, list, dt);
    },
  };
}

// ---- echo -----------------------------------------------------------------------------------
function echo(seed: number, W: number, H: number, input: GameInput, o: Opts): Engine {
  const r = rng(seed);
  const cols = ['#FF5C8A', '#FFC93D', '#4FD18B', '#4FA8FF'];
  const pad = Math.min(W, H) * 0.2;
  const pads = [0, 1, 2, 3].map((i) => ({ x: W / 2 + (i % 2 ? 1 : -1) * pad * 0.62, y: H / 2 + (i < 2 ? -1 : 1) * pad * 0.62 + 20, lit: 0 }));
  let tune: number[] = [r() * 4 | 0, r() * 4 | 0, r() * 4 | 0];
  let mode: 'show' | 'play' = 'show', idx = 0, timer = 0.8, score = 0, lastT = 0;
  const list: Pop[] = [];
  let ctx: AudioContext | null = null;
  const beep = (i: number) => { try { ctx ??= new AudioContext(); const os = ctx.createOscillator(), gn = ctx.createGain(); os.frequency.value = [392, 494, 587, 698][i]; gn.gain.setValueAtTime(0.12, ctx.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35); os.connect(gn).connect(ctx.destination); os.start(); os.stop(ctx.currentTime + 0.36); } catch { /* no audio */ } };
  return {
    pops: list, score: () => score,
    dispose() { void ctx?.close(); },
    step(dt) {
      for (const p of pads) p.lit = Math.max(0, p.lit - dt);
      const keyPad = ['1', '2', '3', '4'].findIndex((k) => input.keys.has(k));
      if (mode === 'show') {
        timer -= dt;
        if (timer <= 0) {
          if (idx < tune.length) { pads[tune[idx]].lit = 0.4; beep(tune[idx]); idx++; timer = Math.max(0.3, 0.6 - tune.length * 0.02); }
          else { mode = 'play'; idx = 0; }
        }
        input.tap = null;
        return;
      }
      let hit = -1;
      if (input.tap) { const tp = input.tap; hit = pads.findIndex((p) => Math.hypot(p.x - tp.x, p.y - tp.y) < pad * 0.5); input.tap = null; }
      if (hit < 0 && keyPad >= 0) { hit = keyPad; input.keys.delete(String(keyPad + 1)); }
      if (hit < 0) return;
      pads[hit].lit = 0.25; beep(hit);
      if (hit === tune[idx]) {
        score += 1; idx++;
        if (idx === tune.length) { score += tune.length; list.push({ x: W / 2, y: H / 2 - pad * 1.3, text: `tune! +${tune.length}`, color: '#FFE36B', life: 0 }); tune = [...tune, r() * 4 | 0]; mode = 'show'; idx = 0; timer = 0.9; }
      } else {
        list.push({ x: W / 2, y: H / 2 - pad * 1.3, text: 'oops — again', color: '#FF9A9A', life: 0 });
        tune = tune.slice(0, Math.max(3, tune.length - 1)); mode = 'show'; idx = 0; timer = 0.9;
      }
    },
    draw(g2, W2, H2, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      sky(g2, o.world, W2, H2, t, seed);
      pads.forEach((p, i) => {
        g2.fillStyle = cols[i]; g2.globalAlpha = p.lit > 0 ? 1 : 0.35;
        g2.beginPath(); g2.arc(p.x, p.y, pad * 0.48, 0, Math.PI * 2); g2.fill();
        if (p.lit > 0) { g2.globalAlpha = 0.4; g2.beginPath(); g2.arc(p.x, p.y, pad * 0.48 + 14 * (p.lit / 0.4), 0, Math.PI * 2); g2.fill(); }
        g2.globalAlpha = 1;
      });
      g2.fillStyle = '#fff'; g2.font = '800 18px system-ui'; g2.textAlign = 'center';
      g2.fillText(mode === 'show' ? 'Listen…' : `Your turn · ${idx}/${tune.length}`, W2 / 2, Math.max(70, H2 / 2 - pad * 1.6));
      pops(g2, list, dt);
    },
  };
}

// ---- mine ---------------------------------------------------------------------------------------
function mine(seed: number, W: number, H: number, input: GameInput, o: Opts): Engine {
  const r = rng(seed);
  const C = 7, Rw = 9;
  const size = Math.min((W - 24) / C, (H - 150) / Rw);
  const ox = (W - size * C) / 2, oy = H - 20 - size * Rw;
  const ores = ['#FF5C8A', '#FFC93D', '#4FD18B', '#4FA8FF', o.world.detail];
  type Cellv = { c: number; gold: boolean; y: number } | null;
  const grid: Cellv[][] = Array.from({ length: C }, () => Array.from({ length: Rw }, (_, j) => ({ c: (r() * 5) | 0, gold: r() < 0.04, y: j })));
  const list: Pop[] = [];
  let score = 0, lastT = 0, shake = 0;
  const flood = (x: number, y: number) => {
    const c0 = grid[x][y]!.c; const seen = new Set<string>(); const out: [number, number][] = []; const st = [[x, y]];
    while (st.length) { const [a, bb] = st.pop()!; const k = `${a},${bb}`; if (seen.has(k) || a < 0 || bb < 0 || a >= C || bb >= Rw) continue; const v = grid[a][bb]; if (!v || v.c !== c0) continue; seen.add(k); out.push([a, bb]); st.push([a + 1, bb], [a - 1, bb], [a, bb + 1], [a, bb - 1]); }
    return out;
  };
  return {
    pops: list, score: () => score,
    step(dt) {
      for (let x = 0; x < C; x++) for (let y = 0; y < Rw; y++) { const v = grid[x][y]; if (v) v.y += (y - v.y) * Math.min(1, dt * 12); }
      shake = Math.max(0, shake - dt);
      const tap = input.tap; input.tap = null;
      if (!tap) return;
      const x = Math.floor((tap.x - ox) / size), y = Math.floor((tap.y - oy) / size);
      if (x < 0 || y < 0 || x >= C || y >= Rw || !grid[x][y]) return;
      const group = flood(x, y);
      if (group.length < 2) { shake = 0.25; return; }
      const gold = group.some(([a, bb]) => grid[a][bb]!.gold);
      const pts = group.length * (group.length - 1) * (gold ? 2 : 1);
      score += pts; list.push({ x: tap.x, y: tap.y, text: `+${pts}${gold ? ' ✨' : ''}`, color: '#FFE36B', life: 0 });
      for (const [a, bb] of group) grid[a][bb] = null;
      // ores fall, and new ones tumble in from above
      for (let a = 0; a < C; a++) {
        const col = grid[a].filter((v) => v) as NonNullable<Cellv>[];
        const fresh = Array.from({ length: Rw - col.length }, (_, i) => ({ c: (r() * 5) | 0, gold: r() < 0.04, y: -1 - i }));
        grid[a] = [...fresh.reverse(), ...col];
      }
    },
    draw(g2, W2, H2, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      sky(g2, o.world, W2, H2, t, seed);
      g2.fillStyle = 'rgba(0,0,0,0.35)'; g2.beginPath(); g2.roundRect(ox - 8, oy - 8, size * C + 16, size * Rw + 16, 16); g2.fill();
      const sx = shake ? Math.sin(t * 80) * 4 : 0;
      for (let x = 0; x < C; x++) for (let y = 0; y < Rw; y++) {
        const v = grid[x][y]; if (!v) continue;
        const cx = ox + x * size + size / 2 + sx, cy = oy + v.y * size + size / 2;
        g2.fillStyle = o.world.ground[1]; g2.beginPath(); g2.roundRect(cx - size * 0.46, cy - size * 0.46, size * 0.92, size * 0.92, size * 0.18); g2.fill();
        g2.fillStyle = ores[v.c]; g2.beginPath();
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; const rr = size * (k % 2 ? 0.26 : 0.34); g2[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        g2.closePath(); g2.fill();
        if (v.gold) { g2.strokeStyle = '#FFE36B'; g2.lineWidth = 3; g2.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6); g2.stroke(); g2.globalAlpha = 1; }
        g2.fillStyle = 'rgba(255,255,255,0.45)'; g2.beginPath(); g2.arc(cx - size * 0.1, cy - size * 0.12, size * 0.07, 0, Math.PI * 2); g2.fill();
      }
      pops(g2, list, dt);
    },
  };
}

// ---- sling ----------------------------------------------------------------------------------------
function sling(seed: number, W: number, H: number, input: GameInput, o: Opts): Engine {
  const r = rng(seed);
  const list: Pop[] = [];
  const home = { x: W * 0.5, y: H - 90 };
  type Body = { x: number; y: number; m: number; rad: number; c: string };
  type Ring = { x: number; y: number; rad: number; hit: number };
  let bodies: Body[] = [], rings: Ring[] = [];
  const level = () => {
    bodies = Array.from({ length: 2 + ((r() * 2) | 0) }, () => ({ x: W * (0.15 + r() * 0.7), y: H * (0.2 + r() * 0.45), m: 9000 + r() * 16000, rad: 14 + r() * 16, c: r() < 0.5 ? o.world.color : o.world.detail }));
    rings = Array.from({ length: 3 }, () => ({ x: W * (0.1 + r() * 0.8), y: H * (0.08 + r() * 0.55), rad: 26, hit: 0 }));
  };
  level();
  let probe: { x: number; y: number; vx: number; vy: number; life: number; bent: boolean; trail: [number, number][] } | null = null;
  let aim: { x: number; y: number } | null = null, held = false;
  let score = 0, lastT = 0;
  return {
    pops: list, score: () => score,
    step(dt) {
      if (input.target && !probe) { aim = input.target; held = true; }
      else if (held && !input.target && aim && !probe) {
        held = false;
        const dx = home.x - aim.x, dy = home.y - aim.y; const l = Math.min(160, Math.hypot(dx, dy));
        if (l > 12) { const k = (l / Math.hypot(dx, dy)) * 3.2; probe = { x: home.x, y: home.y, vx: dx * k, vy: dy * k, life: 0, bent: false, trail: [] }; }
        aim = null;
      }
      if (!probe) { input.tap = null; return; }
      const p = probe;
      for (let i = 0; i < 3; i++) {
        const h = dt / 3;
        for (const bd of bodies) {
          const dx = bd.x - p.x, dy = bd.y - p.y, d2 = Math.max(dx * dx + dy * dy, bd.rad * bd.rad), d = Math.sqrt(d2);
          const a = (bd.m * 40) / d2; p.vx += (dx / d) * a * h; p.vy += (dy / d) * a * h;
          if (d < bd.rad * 3.2) p.bent = true;
          if (Math.hypot(dx, dy) < bd.rad) { p.life = 99; list.push({ x: p.x, y: p.y, text: 'crash!', color: '#FF9A9A', life: 0 }); }
        }
        p.x += p.vx * h; p.y += p.vy * h;
      }
      p.life += dt; p.trail.push([p.x, p.y]); if (p.trail.length > 60) p.trail.shift();
      for (const rg of rings) if (!rg.hit && Math.hypot(rg.x - p.x, rg.y - p.y) < rg.rad) {
        rg.hit = 1; const pts = p.bent ? 20 : 10; score += pts; list.push({ x: rg.x, y: rg.y, text: p.bent ? `slingshot +${pts}!` : `+${pts}`, color: '#FFE36B', life: 0 });
      }
      if (p.life > 6 || p.x < -80 || p.x > W + 80 || p.y < -200 || p.y > H + 80) {
        probe = null;
        if (rings.every((rg) => rg.hit)) { score += 15; list.push({ x: W / 2, y: H / 2, text: 'all rings! +15', color: '#7FE3FF', life: 0 }); level(); }
      }
    },
    draw(g2, W2, H2, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      sky(g2, o.world, W2, H2, t, seed);
      for (const bd of bodies) {
        const gl = g2.createRadialGradient(bd.x, bd.y, bd.rad, bd.x, bd.y, bd.rad * 3.2); gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        g2.fillStyle = gl; g2.beginPath(); g2.arc(bd.x, bd.y, bd.rad * 3.2, 0, Math.PI * 2); g2.fill();
        const pg = g2.createRadialGradient(bd.x - bd.rad * 0.4, bd.y - bd.rad * 0.4, 0, bd.x, bd.y, bd.rad); pg.addColorStop(0, '#fff'); pg.addColorStop(0.3, bd.c); pg.addColorStop(1, o.world.color2);
        g2.fillStyle = pg; g2.beginPath(); g2.arc(bd.x, bd.y, bd.rad, 0, Math.PI * 2); g2.fill();
      }
      for (const rg of rings) { g2.strokeStyle = rg.hit ? 'rgba(255,255,255,0.15)' : '#FFE36B'; g2.lineWidth = 5; g2.beginPath(); g2.ellipse(rg.x, rg.y, rg.rad, rg.rad * 0.45, 0, 0, Math.PI * 2); g2.stroke(); }
      if (probe) {
        g2.strokeStyle = 'rgba(127,227,255,0.6)'; g2.lineWidth = 2; g2.beginPath(); probe.trail.forEach(([x, y], i) => g2[i ? 'lineTo' : 'moveTo'](x, y)); g2.stroke();
        g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(probe.x, probe.y, 6, 0, Math.PI * 2); g2.fill();
      }
      // the launcher
      g2.fillStyle = o.world.ground[1]; g2.beginPath(); g2.arc(home.x, H2 + 30, 120, Math.PI, 0); g2.fill();
      g2.fillStyle = '#F2F5FB'; g2.beginPath(); g2.arc(home.x, home.y, 10, 0, Math.PI * 2); g2.fill();
      if (aim) {
        const dx = home.x - aim.x, dy = home.y - aim.y;
        g2.setLineDash([5, 6]); g2.strokeStyle = 'rgba(255,255,255,0.7)'; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(home.x, home.y); g2.lineTo(home.x + dx * 0.8, home.y + dy * 0.8); g2.stroke(); g2.setLineDash([]);
      }
      pops(g2, list, dt);
    },
  };
}

// ---- stack ----------------------------------------------------------------------------------------
function stack(seed: number, W: number, H: number, input: GameInput, o: Opts): Engine {
  const r = rng(seed);
  const list: Pop[] = [];
  const BH = 26;
  type Blk = { x: number; w: number; c: string };
  const cols = [o.world.detail, '#F2F5FB', o.world.color, '#7FE3FF'];
  let tower: Blk[] = [{ x: W / 2 - W * 0.2, w: W * 0.4, c: o.world.ground[1] }];
  let mv = { x: 0, w: W * 0.4, dir: 1, speed: 160 };
  let score = 0, lastT = 0, cam = 0, fall: { x: number; y: number; w: number; vy: number; c: string }[] = [];
  const next = () => { mv = { x: r() < 0.5 ? -mv.w : W, w: tower[tower.length - 1].w, dir: 1, speed: Math.min(420, 160 + tower.length * 9) }; mv.dir = mv.x < 0 ? 1 : -1; };
  next();
  return {
    pops: list, score: () => score,
    step(dt) {
      mv.x += mv.dir * mv.speed * dt;
      if (mv.x > W - mv.w * 0.2) mv.dir = -1; if (mv.x < -mv.w * 0.8) mv.dir = 1;
      for (const f of fall) { f.vy += 900 * dt; f.y += f.vy * dt; }
      fall = fall.filter((f) => f.y < H + cam + 200);
      const drop = input.tap || input.keys.has(' ');
      input.tap = null; input.keys.delete(' ');
      const target = Math.max(0, (tower.length - 6) * BH); cam += (target - cam) * Math.min(1, dt * 5);
      if (!drop) return;
      const top = tower[tower.length - 1];
      const a = Math.max(mv.x, top.x), bb = Math.min(mv.x + mv.w, top.x + top.w);
      const y = H - 40 - tower.length * BH;
      if (bb - a <= 4) { // missed: lose the top module
        fall.push({ x: mv.x, y, w: mv.w, vy: 0, c: cols[tower.length % 4] });
        if (tower.length > 1) tower.pop();
        score = Math.max(0, score - 3); list.push({ x: W / 2, y: y - cam, text: '-3', color: '#FF9A9A', life: 0 });
        next(); return;
      }
      const perfect = Math.abs(mv.x - top.x) < 6;
      const nb = perfect ? { x: top.x, w: top.w, c: cols[tower.length % 4] } : { x: a, w: bb - a, c: cols[tower.length % 4] };
      if (!perfect) { const cutX = mv.x < top.x ? mv.x : bb; fall.push({ x: cutX, y, w: mv.w - (bb - a), vy: 0, c: nb.c }); }
      tower.push(nb);
      const pts = perfect ? 5 : 2; score += pts;
      list.push({ x: nb.x + nb.w / 2, y: y - 10 - (H - 40 - tower.length * BH < 0 ? 0 : 0), text: perfect ? 'perfect +5' : `+${pts}`, color: '#FFE36B', life: 0 });
      if (nb.w < 18) { tower = [tower[0], { ...nb, w: W * 0.3, x: W * 0.35 }]; list.push({ x: W / 2, y: H / 2, text: 'new station!', color: '#7FE3FF', life: 0 }); }
      next();
    },
    draw(g2, W2, H2, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      sky(g2, o.world, W2, H2, t, seed);
      g2.save(); g2.translate(0, cam);
      g2.fillStyle = o.world.ground[1]; g2.fillRect(0, H2 - 40 + BH, W2, 400);
      tower.forEach((bk, i) => {
        const y = H2 - 40 - i * BH;
        g2.fillStyle = bk.c; g2.beginPath(); g2.roundRect(bk.x, y, bk.w, BH - 2, 5); g2.fill();
        g2.fillStyle = 'rgba(0,0,0,0.18)'; g2.fillRect(bk.x, y + BH - 8, bk.w, 6);
        g2.fillStyle = 'rgba(127,200,245,0.8)'; for (let wx = bk.x + 10; wx < bk.x + bk.w - 10; wx += 22) g2.fillRect(wx, y + 7, 9, 7);
      });
      const y = H2 - 40 - tower.length * BH;
      g2.fillStyle = cols[tower.length % 4]; g2.globalAlpha = 0.9; g2.beginPath(); g2.roundRect(mv.x, y, mv.w, BH - 2, 5); g2.fill(); g2.globalAlpha = 1;
      g2.strokeStyle = 'rgba(255,255,255,0.4)'; g2.beginPath(); g2.moveTo(mv.x + mv.w / 2, y); g2.lineTo(mv.x + mv.w / 2, y - 400); g2.stroke();
      for (const f of fall) { g2.fillStyle = f.c; g2.globalAlpha = 0.8; g2.fillRect(f.x, f.y, f.w, BH - 2); g2.globalAlpha = 1; }
      g2.restore();
      g2.fillStyle = '#fff'; g2.font = '800 15px system-ui'; g2.textAlign = 'center'; g2.fillText(`${tower.length - 1} modules`, W2 / 2, 80);
      pops(g2, list, dt);
    },
  };
}

export function worldForGame(id: string, homeSeed?: number | null): World {
  const w = PLANET_GAMES[id]?.world ?? 'moon';
  return w === 'exo' ? exoWorld(homeSeed ?? 1) : (WORLDS as Record<string, World>)[w];
}
export function makePlanetEngine(id: string, accent: string, homeSeed?: number | null) {
  const info = PLANET_GAMES[id] ?? PLANET_GAMES.rockrun;
  const world = worldForGame(id, homeSeed);
  return (seed: number, W: number, H: number, input: GameInput): Engine => {
    const o = { world, info, accent };
    switch (info.family) {
      case 'lander': return moonLander(seed, W, H, input);
      case 'hop': return hop(seed, W, H, input, o);
      case 'catch': return catchGame(seed, W, H, input, o);
      case 'echo': return echo(seed, W, H, input, o);
      case 'mine': return mine(seed, W, H, input, o);
      case 'sling': return sling(seed, W, H, input, o);
      case 'stack': return stack(seed, W, H, input, o);
      default: return dodge(seed, W, H, input, o);
    }
  };
}
