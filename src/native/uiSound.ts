// Little UI sounds for the app, synthesised on the fly (no audio files): a soft pop on taps, a two-note
// click on tabs, a bright chime when something good happens. Quiet by design, and they follow the phone's
// silent switch. Settings → Sound effects turns them off.
import { useUi } from '../lib/store';

let ctx: AudioContext | null = null;
let last = 0, lastReward = 0;

const enabled = () => useUi.getState().settings.sfx !== false;

function ac() {
  if (!enabled()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.04, at = 0, slide?: number) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at;
  const os = c.createOscillator(), g = c.createGain();
  os.type = type; os.frequency.setValueAtTime(freq, t0);
  if (slide) os.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  os.connect(g).connect(c.destination); os.start(t0); os.stop(t0 + dur + 0.02);
}

export const uiSound = {
  /** a button press: a short, soft pop (never more than ~12 a second) */
  tap() {
    const now = performance.now(); if (now - last < 80) return; last = now;
    tone(520, 0.07, 'sine', 0.035, 0, 780);
  },
  /** switching tabs / opening a place */
  tab() { tone(660, 0.06, 'triangle', 0.03); tone(990, 0.08, 'triangle', 0.03, 0.05); },
  /** a reward, a claim, a level-up */
  reward() {
    const now = performance.now(); if (now - lastReward < 500) return; lastReward = now;
    [0, 4, 7, 12].forEach((n, i) => tone(784 * Math.pow(2, n / 12), 0.18, 'triangle', 0.035, i * 0.06));
  },
  /** something didn't work */
  nope() { tone(300, 0.12, 'triangle', 0.035, 0, 220); },
};
