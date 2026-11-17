// On a phone or tablet there's no keyboard to mention: instructions written for both ("Drag (or hold A/D, ←/→) to
// steer") lose their keyboard half ("Drag to steer"). Computers keep the whole sentence.
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const KEYS = /\s*\(or [^)]*?(?:A\/D|WASD|arrow|←|→|↑|\bW\b|Space)[^)]*\)/g;
const INLINE = /,? or (?:A\/D, ←\/→|the arrow keys)/g;

/** the instruction as a touch screen should say it (unchanged with a mouse and keyboard) */
export function touchText(s: string, coarse = COARSE): string {
  if (!coarse) return s;
  return s.replace(KEYS, '').replace(INLINE, '').replace(/ {2,}/g, ' ');
}
