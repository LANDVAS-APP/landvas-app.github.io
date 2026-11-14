// The Mirror Arcade's switch for the ordinary cabinets. While a mirrored round is running, MIR says how its screen
// is flipped (the cabinet's canvases are flipped with CSS: .lv-mir-x / -y / -xy), how much faster it runs, and that
// the game should play its own mirror twist. Input readers and pop-ups use mirX/mirY so a tap lands where you see it.
// Only one cabinet runs at a time, so one module-level switch is enough. Off everywhere else.

export type MirrorFlip = 'x' | 'y' | 'xy';
export const MIR = { on: false, x: false, y: false, speed: 1 };

export function mirrorOn(spec: { flip: MirrorFlip; speed: number } | null) {
  MIR.on = !!spec;
  MIR.x = !!spec && spec.flip !== 'y';
  MIR.y = !!spec && spec.flip !== 'x';
  MIR.speed = spec?.speed ?? 1;
}
export const mirrorOff = () => mirrorOn(null);

/** a coordinate inside a box of size w, as the (flipped) screen shows it */
export const mirX = (x: number, w: number) => (MIR.x ? w - x : x);
export const mirY = (y: number, h: number) => (MIR.y ? h - y : y);
/** a raw client coordinate, negated when flipped (for games that only use drag/flick deltas) */
export const mirDX = (x: number) => (MIR.x ? -x : x);
export const mirDY = (y: number) => (MIR.y ? -y : y);
/** arrow keys follow the flipped screen */
export function mirKey(k: string) {
  if (MIR.x) { const m: Record<string, string> = { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft', a: 'd', d: 'a', A: 'D', D: 'A' }; if (k in m) return m[k]; }
  if (MIR.y) { const m: Record<string, string> = { ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp', w: 's', s: 'w', W: 'S', S: 'W' }; if (k in m) return m[k]; }
  return k;
}
/** Text drawn on a 2D canvas stays readable on a flipped screen: each line is drawn flipped round its anchor, so the
 *  screen's flip turns it back the right way round. */
export function unflipText(g: CanvasRenderingContext2D) {
  const f = g.fillText.bind(g), s = g.strokeText.bind(g);
  const wrap = (fn: (t: string, x: number, y: number, m?: number) => void) => (t: string, x: number, y: number, m?: number) => {
    if (!MIR.x && !MIR.y) return m === undefined ? fn(t, x, y) : fn(t, x, y, m);
    g.save(); g.translate(x, y); g.scale(MIR.x ? -1 : 1, MIR.y ? -1 : 1);
    if (m === undefined) fn(t, 0, 0); else fn(t, 0, 0, m);
    g.restore();
  };
  g.fillText = wrap(f); g.strokeText = wrap(s);
}
