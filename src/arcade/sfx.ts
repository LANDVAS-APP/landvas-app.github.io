// Arcade sounds, made on the fly (no audio files): blips, chimes, jackpot fanfares, ticket clicks.
// Off when the player mutes the arcade (remembered on this device).
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('landvas.arcade.mute') === '1'; } catch { return false; } })();
export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; try { localStorage.setItem('landvas.arcade.mute', m ? '1' : '0'); } catch { /* private mode */ } }

function ac() {
  if (muted) return null;
  try { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; } catch { return null; }
}
function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, at = 0, slide?: number) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at;
  const os = c.createOscillator(), g = c.createGain();
  os.type = type; os.frequency.setValueAtTime(freq, t0);
  if (slide) os.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  os.connect(g).connect(c.destination); os.start(t0); os.stop(t0 + dur + 0.02);
}
function noise(dur: number, vol = 0.05, at = 0) {
  const c = ac(); if (!c) return;
  const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = vol; s.connect(g).connect(c.destination); s.start(c.currentTime + at);
}

export const sfx = {
  blip: (n = 0) => tone(440 * Math.pow(2, n / 12), 0.08, 'square', 0.05),
  tick: () => tone(1200, 0.03, 'square', 0.03),
  drop: () => tone(330, 0.12, 'triangle', 0.08, 0, 160),
  perfect: (combo = 0) => { const b = 523 * Math.pow(2, Math.min(combo, 12) / 12); tone(b, 0.09, 'square', 0.05); tone(b * 1.5, 0.12, 'square', 0.05, 0.07); },
  cut: () => { noise(0.12, 0.06); tone(200, 0.15, 'sawtooth', 0.04, 0, 90); },
  fail: () => { tone(392, 0.18, 'sawtooth', 0.06); tone(311, 0.18, 'sawtooth', 0.06, 0.16); tone(233, 0.4, 'sawtooth', 0.06, 0.32, 150); },
  swish: () => { noise(0.18, 0.04); tone(880, 0.12, 'sine', 0.05, 0.05, 1320); },
  bonk: () => { tone(180, 0.1, 'square', 0.08, 0, 90); noise(0.05, 0.05); },
  thud: () => tone(110, 0.14, 'triangle', 0.1, 0, 60),
  roll: () => { noise(0.4, 0.025); tone(90, 0.4, 'triangle', 0.03); },
  win: (n = 3) => { for (let i = 0; i < n; i++) tone(523 * Math.pow(2, [0, 4, 7, 12, 16][i % 5] / 12), 0.14, 'square', 0.05, i * 0.08); },
  jackpot: () => { for (let i = 0; i < 14; i++) tone(523 * Math.pow(2, [0, 4, 7, 12, 7, 12, 16, 19, 16, 19, 24, 19, 24, 28][i] / 12), 0.12, 'square', 0.055, i * 0.07); },
  tickets: (n: number) => { for (let i = 0; i < Math.min(18, n); i++) tone(1500 + (i % 3) * 120, 0.025, 'square', 0.025, i * 0.045); },
  coin: () => { tone(988, 0.07, 'square', 0.05); tone(1319, 0.25, 'square', 0.05, 0.07); },
};
