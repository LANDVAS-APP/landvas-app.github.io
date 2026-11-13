// Every rarity above Rare gets its own celebration when a roll lands on it: Epic crackles with lightning, Legendary
// rains gold, Phoenix sets the screen alight from below, Vampire lets the bats out, a Singularity swallows the
// screen and spits it back out… All of it is particles on the roll's stage (src/roll/stage), recorded with the roll so
// a clip replays them exactly, plus, for a few, a screen effect (`overlay`) the roll shows behind them.
import type { BurstOpts } from './fx';
import type { RarityId } from '../shared/rarity';

type At = { x: number; y: number; w: number };
/** `w`, `h`: the stage's size; `later` runs a step that many ms after the reveal */
type Ctx = { fx: { burst(o: BurstOpts): void }; c: At; later(ms: number, f: () => void): void; w: number; h: number };
export type Overlay = 'dark' | 'night' | 'gold' | 'fire' | 'void' | null;

const rain = (x: Ctx, emojis: string[], n: number, speed = 3.2, life = 1.7) =>
  x.fx.burst({ x: x.w / 2, y: -30, area: [x.w, 20], angle: Math.PI / 2, spread: 0.5, speed, gravity: 0.12, drag: 0.996, colors: ['#fff'], kind: 'emoji', emojis, count: n, life });
const rise = (x: Ctx, colors: string[], n: number, kind: 'spark' | 'drop' | 'glitter' | 'emoji' = 'drop', emojis?: string[]) =>
  x.fx.burst({ x: x.w / 2, y: x.h + 20, area: [x.w, 10], angle: -Math.PI / 2, spread: 0.6, speed: 9, gravity: -0.04, drag: 0.99, colors, kind, emojis, count: n, life: 1.3 });
const pop = ({ fx, c }: Ctx, emojis: string[], n: number, speed = 12) =>
  fx.burst({ x: c.x, y: c.y, colors: ['#fff'], kind: 'emoji', emojis, count: n, speed, gravity: 0.22, life: 1.2 });
const ring = ({ fx, c }: Ctx, colors: string[], n: number, r = 260, speed = 9) =>
  fx.burst({ x: c.x, y: c.y, ring: r, colors, count: n, speed, gravity: 0, drag: 0.96, kind: 'glitter', life: 0.7 });
const sparks = ({ fx, c }: Ctx, colors: string[], n: number, speed = 14, at?: { x: number; y: number }) =>
  fx.burst({ x: at?.x ?? c.x, y: at?.y ?? c.y, colors, count: n, speed, kind: 'spark' });
const streaks = ({ fx }: Ctx, colors: string[], n: number, angle: number, from: { x: number; y: number }, area: [number, number], speed = 22) =>
  fx.burst({ x: from.x, y: from.y, area, angle, spread: 0.12, speed, gravity: 0, drag: 1, colors, count: n, kind: 'streak', life: 1.4 });
const RAINBOW = ['#FF3D9A', '#FFB31F', '#FFE14D', '#3DDC97', '#22E3FF', '#8FA8FF', '#A45CFF'];

const SHOWS: Partial<Record<RarityId, { overlay?: Overlay; run(x: Ctx): void }>> = {
  enchanted: { overlay: 'night', run: (x) => { ring(x, ['#B26BFF', '#FFE8A3', '#F0DBFF'], 120, 300, 10); x.later(250, () => rain(x, ['✨', '🔮', '📖', '✨'], 34, 2.8, 2)); x.later(600, () => sparks(x, ['#B26BFF', '#FFD23F', '#fff'], 120, 16)); } },
  epic: { run: (x) => { pop(x, ['⚡', '💜'], 14, 14); x.later(250, () => sparks(x, ['#DABDFF', '#A45CFF', '#fff'], 90, 18)); } },
  legendary: { overlay: 'gold', run: (x) => { rain(x, ['🪙', '🪙', '⭐'], 30); pop(x, ['🏆', '⭐'], 10); x.later(400, () => rain(x, ['🪙', '💰'], 24)); } },
  mythic: { run: (x) => { pop(x, ['💎', '🌈', '✨'], 18, 15); x.later(200, () => sparks(x, RAINBOW, 140, 18)); x.later(500, () => x.fx.burst({ x: x.w / 2, y: -20, area: [x.w, 10], angle: Math.PI / 2, spread: 0.5, speed: 4, gravity: 0.1, colors: RAINBOW, count: 120, kind: 'glitter', life: 1.6 })); } },
  solar: { overlay: 'gold', run: (x) => { pop(x, ['☀️', '🔆'], 12, 13); streaks(x, ['#FFE14D', '#FF9F1C'], 26, 0, { x: x.c.x, y: x.c.y }, [10, 10], 18); streaks(x, ['#FFE14D', '#FF9F1C'], 26, Math.PI, { x: x.c.x, y: x.c.y }, [10, 10], 18); rise(x, ['#FFE14D', '#FFF6C9'], 80, 'glitter'); } },
  lunar: { overlay: 'night', run: (x) => { rain(x, ['⭐', '🌙', '✨'], 34, 2, 2.2); x.later(300, () => ring(x, ['#E1E8FF', '#8FA8FF'], 120)); } },
  comet: { run: (x) => { for (let i = 0; i < 3; i++) x.later(i * 260, () => streaks(x, ['#22E3FF', '#C9F8FF', '#fff'], 14, Math.PI * 0.78, { x: x.w * 1.05, y: -40 }, [x.w * 0.6, 60], 26)); pop(x, ['☄️'], 8, 14); } },
  chaos: { run: (x) => { rain(x, ['🎲', '🎲', '❓'], 28, 4); for (let i = 0; i < 4; i++) x.later(i * 180, () => sparks(x, RAINBOW, 60, 14, { x: Math.random() * x.w, y: x.h * (0.2 + Math.random() * 0.5) })); } },
  phoenix: { overlay: 'fire', run: (x) => { rise(x, ['#FF5A1F', '#FFD166', '#FF2E2E'], 160, 'drop'); x.later(200, () => rise(x, ['#fff'], 26, 'emoji', ['🔥', '🔥', '🪶'])); x.later(500, () => pop(x, ['🔥', '✨'], 14, 15)); } },
  gemini: { run: (x) => { const L = { x: x.c.x - 90, y: x.c.y }, R2 = { x: x.c.x + 90, y: x.c.y }; sparks(x, ['#F472B6', '#FBCFE8', '#fff'], 80, 15, L); sparks(x, ['#F472B6', '#FBCFE8', '#fff'], 80, 15, R2); x.later(350, () => { pop(x, ['♊', '💞', '✨'], 16, 14); ring(x, ['#F472B6', '#fff'], 120, 220); }); } },
  kraken: { overlay: 'night', run: (x) => { x.fx.burst({ x: x.w / 2, y: x.h + 20, area: [x.w, 10], angle: -Math.PI / 2, spread: 0.5, speed: 13, gravity: 0.12, drag: 0.99, colors: ['#fff'], kind: 'emoji', emojis: ['🐙', '🦑', '🫧', '🫧'], count: 30, life: 1.4 }); x.later(250, () => ring(x, ['#0EA5A4', '#99F6E4', '#fff'], 160, 320, 12)); x.later(650, () => sparks(x, ['#14B8A6', '#99F6E4', '#fff'], 140, 18)); } },
  ancient: { overlay: 'gold', run: (x) => { rise(x, ['#F1E2BF', '#C9A66B', '#fff'], 120, 'glitter'); pop(x, ['🏛️', '📜', '🏺'], 12, 12); } },
  mirror: { run: (x) => { x.fx.burst({ x: x.c.x, y: x.c.y, colors: ['#fff', '#BAE6FD', '#7DD3FC', '#E0F2FE'], count: 160, speed: 20, kind: 'glitter', gravity: 0.3, size: 2.4 }); pop(x, ['🪞', '💠'], 10, 12); x.later(600, () => ring(x, ['#fff', '#BAE6FD'], 120)); } },
  prismatic: { run: (x) => { for (let i = 0; i < 7; i++) streaks(x, [RAINBOW[i]], 8, (i / 7) * Math.PI * 2, { x: x.c.x, y: x.c.y }, [10, 10], 16); pop(x, ['🌈', '💎'], 12, 14); x.later(400, () => sparks(x, RAINBOW, 120, 16)); } },
  genesis: { overlay: 'void', run: (x) => { ring(x, ['#fff', '#FFD6FF', '#A45CFF'], 200, 340, 12); x.later(550, () => { pop(x, ['🌌', '🪐', '⭐', '✨'], 22, 18); sparks(x, ['#fff', '#FF7AE0', '#A45CFF'], 200, 22); }); } },
  crown: { overlay: 'gold', run: (x) => { rain(x, ['👑', '🪙', '🪙'], 26); pop(x, ['👑'], 6, 12); } },
  crown_state: { overlay: 'gold', run: (x) => { rain(x, ['👑', '🪙', '💰', '💎'], 40); pop(x, ['👑', '🏰'], 10, 14); x.later(400, () => sparks(x, ['#C084FC', '#FFD23F', '#fff'], 140, 18)); } },
  crown_country: { overlay: 'gold', run: (x) => { rain(x, ['👑', '💰', '💎', '🪙'], 56, 3.6); pop(x, ['👑', '🌍', '🏰'], 14, 16); for (let i = 0; i < 3; i++) x.later(300 + i * 300, () => sparks(x, ['#F43F5E', '#FFD23F', '#fff'], 120, 20)); } },
  singularity: { overlay: 'void', run: (x) => {
    ring(x, ['#B4FF39', '#fff', '#FDE047'], 260, Math.max(x.w, x.h) * 0.7, 18);
    x.later(700, () => { pop(x, ['🕳️', '🌀', '💫', '⭐'], 30, 22); sparks(x, ['#B4FF39', '#F2FFD6', '#fff', '#FDE047'], 260, 26); });
    x.later(1100, () => x.fx.burst({ x: x.w / 2, y: -20, area: [x.w, 10], angle: Math.PI / 2, spread: 0.5, speed: 4, gravity: 0.1, colors: ['#B4FF39', '#fff'], count: 160, kind: 'glitter', life: 1.8 }));
  } },
};

/** run a rarity's celebration (if it has one); returns the screen effect to show behind it */
export function celebrate(r: RarityId, shiny: boolean, ctx: Ctx): Overlay {
  const s = SHOWS[r];
  s?.run(ctx);
  if (shiny) ctx.later(300, () => rain(ctx, ['✨', '💖', '✨'], 26, 3));
  return s?.overlay ?? null;
}
/** how long a rarity's celebration holds the stage before the buttons fade in (ms) */
export const celebrateDelay = (r: RarityId) => (r === 'singularity' ? 900 : r === 'kraken' || r === 'genesis' ? 550 : SHOWS[r] ? 380 : 380);
