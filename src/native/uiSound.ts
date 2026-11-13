// Little UI sounds for the app, synthesised on the fly (no audio files): a soft pop on taps, a two-note
// click on tabs, a bright chime when something good happens. Quiet by design, and they follow the phone's
// silent switch. Settings → Sound effects turns them off.
import { useUi } from '../lib/store';
import { audioNap } from '../lib/audioNap';

let ctx: AudioContext | null = null;
const nap = audioNap(() => ctx);
let last = 0, lastReward = 0, lastTick = 0;

const enabled = () => useUi.getState().settings.sfx !== false;

function ac() {
  if (!enabled()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    nap.poke(1);
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
  /** the plot roll: a click for every tile and name that passes, a clunk when the minigame locks, a hum as an Epic+
      charges, and a fanfare at the reveal that grows with the rarity (tier 0–5) */
  roll(kind: 'tickType' | 'tickRarity' | 'lockType' | 'land' | 'charge' | 'reveal' | 'enchant', n = 0) {
    const now = performance.now();
    if (kind === 'tickType' || kind === 'tickRarity') {
      if (now - lastTick < 34) return; lastTick = now;
      if (kind === 'tickType') tone(1500 + (n % 4) * 60, 0.025, 'square', 0.012);
      else tone(880 + (n % 7) * 40, 0.03, 'triangle', 0.022);
      return;
    }
    if (kind === 'lockType') { tone(196, 0.09, 'square', 0.025, 0, 120); tone(784, 0.07, 'triangle', 0.03, 0.03); tone(1175, 0.09, 'triangle', 0.025, 0.07); return; }
    if (kind === 'land') { tone(523 + n * 40, 0.08, 'triangle', 0.03); return; }
    if (kind === 'charge') { tone(180, 0.7, 'sawtooth', 0.012, 0, 520 + n * 80); return; }
    if (kind === 'enchant') { tone(110, 1.6, 'sine', 0.04, 0, 55); [0, 3, 7, 10, 14].forEach((k, i) => tone(392 * Math.pow(2, k / 12), 0.5, 'sine', 0.018, 0.4 + i * 0.14)); return; }
    // the reveal: a chord that climbs higher (and lasts longer) the rarer it is
    const notes = n >= 5 ? [0, 4, 7, 12, 16, 19, 24] : n >= 3 ? [0, 4, 7, 12, 16] : n >= 1 ? [0, 4, 7, 12] : [0, 7, 12];
    const base = 523.25 * Math.pow(2, Math.min(n, 4) / 12);
    notes.forEach((k, i) => tone(base * Math.pow(2, k / 12), 0.22 + n * 0.05, 'triangle', 0.03, i * 0.055));
    if (n >= 3) tone(base / 2, 0.6, 'sine', 0.04, 0, base / 4);
  },
};
