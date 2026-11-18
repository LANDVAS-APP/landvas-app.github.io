// 🎵 Starsong: stars ring like bells (asteroseismology) — big stars low, small ones high. A loop is up to 32 steps, each a
// note of the star's own scale (0–7) or a rest ('.'). Played with a soft bell (a sine and its overtone, fading), on one
// shared audio context that sleeps when it falls quiet (src/lib/audioNap.ts).
import { audioNap } from '../lib/audioNap';

let ctx: AudioContext | null = null;
const nap = audioNap(() => ctx);
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // a major pentatonic, two octaves: always sounds right together
/** a star's root note (Hz): a neutron star (m 1) rings high, a hypergiant (m 1000) low */
export const rootHz = (m: number) => 660 / Math.pow(2, Math.log10(Math.max(1, m)) * 1.25);
export const noteHz = (m: number, n: number) => rootHz(m) * Math.pow(2, SCALE[Math.max(0, Math.min(7, n))] / 12);

function bell(c: AudioContext, hz: number, at: number, len: number, vol = 0.18) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  g.connect(c.destination);
  for (const [mul, v] of [[1, 1], [2.76, 0.28], [5.4, 0.08]] as const) {
    const o = c.createOscillator();
    const og = c.createGain();
    og.gain.value = v;
    o.type = 'sine';
    o.frequency.value = hz * mul;
    o.connect(og).connect(g);
    o.start(at); o.stop(at + len + 0.05);
  }
}

/** play one note now (tapping the sequencer) */
export function pluck(m: number, n: number) {
  const c = audio();
  if (!c) return;
  bell(c, noteHz(m, n), c.currentTime + 0.01, 0.9);
  nap.poke(1);
}

/** play a loop (several at once: a star's chord); returns stop(). Plays `times` round, then stops by itself. */
export function playLoops(m: number, loops: { loop: string; tempo: number }[], times = 2, onStep?: (i: number) => void): () => void {
  const c = audio();
  if (!c || !loops.length) return () => {};
  nap.hold();
  const t0 = c.currentTime + 0.08;
  let end = t0;
  for (const L of loops) {
    const step = 60 / Math.max(60, Math.min(180, L.tempo)) / 2; // (eighth notes)
    const steps = L.loop.split('');
    for (let r = 0; r < times; r++) steps.forEach((ch, i) => {
      if (ch === '.') return;
      const at = t0 + (r * steps.length + i) * step;
      bell(c, noteHz(m, Number(ch)), at, step * 3.2, 0.16 / Math.sqrt(loops.length));
      end = Math.max(end, at + step * 3.2);
    });
  }
  // the playhead for the first loop (for the sequencer's lights)
  let raf = 0;
  const first = loops[0];
  const step0 = 60 / Math.max(60, Math.min(180, first.tempo)) / 2;
  const tick = () => {
    const i = Math.floor((c.currentTime - t0) / step0);
    if (i >= 0 && onStep) onStep(i % first.loop.length);
    if (c.currentTime < end) raf = requestAnimationFrame(tick); else { onStep?.(-1); nap.poke(0); }
  };
  if (onStep) raf = requestAnimationFrame(tick);
  const timer = setTimeout(() => nap.poke(0), (end - c.currentTime) * 1000 + 100);
  return () => { cancelAnimationFrame(raf); clearTimeout(timer); onStep?.(-1); void c.suspend().catch(() => {}); nap.poke(0); };
}

/** a pulsar's tick (the beat game) */
export function tick(hz = 1400) {
  const c = audio();
  if (!c) return;
  const at = c.currentTime + 0.005;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle'; o.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  o.connect(g).connect(c.destination); o.start(at); o.stop(at + 0.09);
  nap.poke(0.2);
}
