// Peg Drop physics, kept apart from the drawing so it can be simulated (tests check that no aim point is a
// sure thing). Board units: x 0..1 across, y 0..1.3 down.
//  * You can only aim inside the middle of the board (DROP_MIN..DROP_MAX), never right down an edge.
//  * Every row of pegs reaches the walls (half-pegs on the edges), so there's no peg-free lane to fall through.
//  * Each bounce adds a little random spin, so where a chip lands is spread over several slots wherever you aim.
//  * Slot values are set so that every aim point averages about the same: aiming tilts the odds, nothing more.
export const PEG_SLOTS = [40, 15, 30, 10, 100, 10, 30, 15, 40];
export const DROP_MIN = 0.3, DROP_MAX = 0.7;
export const PEG_R = 0.012, CHIP_R = 0.03;
export const PEG_ROWS = 11;

export type Peg = { x: number; y: number; flash: number };
export type Chip = { x: number; y: number; vx: number; vy: number; gold: boolean; done: boolean; slot?: number };

export function pegLayout(): Peg[] {
  const pegs: Peg[] = [];
  for (let row = 0; row < PEG_ROWS; row++) {
    const odd = row % 2 === 1;
    // even rows: 0.1 .. 0.9; odd rows: 0.05 (a half-peg on the wall), 0.15 .. 0.85, 0.95
    const xs = odd ? [0.035, ...Array.from({ length: 8 }, (_, i) => 0.15 + i * 0.1), 0.965] : Array.from({ length: 9 }, (_, i) => 0.1 + i * 0.1);
    for (const x of xs) pegs.push({ x, y: 0.22 + row * 0.08, flash: 0 });
  }
  return pegs;
}

export const clampAim = (x: number) => Math.max(DROP_MIN, Math.min(DROP_MAX, x));
export const newChip = (aim: number, rnd: () => number): Chip => ({ x: clampAim(aim) + (rnd() - 0.5) * 0.01, y: 0.1, vx: (rnd() - 0.5) * 0.04, vy: 0, gold: false, done: false });

/** Move a chip on by `sd` seconds. Calls onPeg(i) for every peg it bounces off; sets chip.slot when it lands. */
export function stepChip(c: Chip, pegs: Peg[], sd: number, rnd: () => number, onPeg?: (i: number) => void) {
  if (c.done) return;
  c.vy += 1.6 * sd; c.x += c.vx * sd; c.y += c.vy * sd; c.vx *= 0.999;
  if (c.x < CHIP_R) { c.x = CHIP_R; c.vx = Math.abs(c.vx) * 0.5 + 0.05; }
  if (c.x > 1 - CHIP_R) { c.x = 1 - CHIP_R; c.vx = -Math.abs(c.vx) * 0.5 - 0.05; }
  for (let i = 0; i < pegs.length; i++) {
    const p = pegs[i], dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy);
    if (d >= PEG_R + CHIP_R || d === 0) continue;
    const nx = dx / d, ny = dy / d;
    c.x = p.x + nx * (PEG_R + CHIP_R); c.y = p.y + ny * (PEG_R + CHIP_R);
    const rv = c.vx * nx + c.vy * ny;
    if (rv < 0) { c.vx -= 1.45 * rv * nx; c.vy -= 1.45 * rv * ny; }
    // a little random spin on every bounce (and never balanced dead on top of a peg)
    c.vx += (rnd() - 0.5) * 0.14;
    if (Math.abs(c.vx) < 0.04) c.vx += (rnd() < 0.5 ? -1 : 1) * 0.06;
    onPeg?.(i);
  }
  // slot dividers
  if (c.y > 1.12) {
    const k = Math.round(c.x * 9), wx = k / 9;
    if (Math.abs(c.x - wx) < CHIP_R && k > 0 && k < 9) { c.x = wx + Math.sign(c.x - wx || 1) * CHIP_R; c.vx = -c.vx * 0.4; }
  }
  if (c.y > 1.25) { c.done = true; c.slot = Math.max(0, Math.min(8, Math.floor(c.x * 9))); }
}

/** Drop one chip from `aim` and play it out: where does it land? */
export function simulateDrop(aim: number, rnd: () => number, pegs = pegLayout()) {
  const c = newChip(aim, rnd);
  for (let i = 0; i < 20000 && !c.done; i++) stepChip(c, pegs, 1 / 240, rnd);
  return c.slot ?? 4;
}
