// Arcade music, made on the fly: a little step sequencer (drums, bass, chords and a lead) playing one of a
// handful of tracks. The jukebox picks the track; it keeps playing (a touch quieter) while you're on a cabinet.
// No audio files, nothing to download.
type Track = { id: string; name: string; emoji: string; bpm: number; swing?: number;
  // 16 steps a bar, 4 bars: notes are semitones from the root (null = rest)
  root: number; chords: number[][]; bass: (number | null)[]; lead: (number | null)[]; arp?: boolean;
  kick: string; snare: string; hat: string; wave: OscillatorType; leadWave: OscillatorType };

const X = null;
export const TRACKS: Track[] = [
  { id: 'neon', name: 'Neon Nights', emoji: '🌆', bpm: 104, root: 45, wave: 'sawtooth', leadWave: 'square', arp: true,
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-7, -3, 0]],
    bass: [0, X, 0, X, 0, X, 0, 12, 0, X, 0, X, 0, X, 12, X],
    lead: [12, X, X, 15, X, X, 19, X, 17, X, 15, X, 12, X, X, X, 8, X, X, 12, X, X, 15, X, 14, X, 12, X, 10, X, X, X, 10, X, X, 14, X, X, 17, X, 15, X, 14, X, 10, X, X, X, 7, X, 8, X, 10, X, 12, X, 15, X, 14, X, 12, X, X, X],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
  { id: 'pixel', name: 'Pixel Party', emoji: '👾', bpm: 150, root: 57, wave: 'square', leadWave: 'square', arp: true,
    chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]],
    bass: [0, X, 12, X, 0, X, 12, X, 0, X, 12, X, 0, 12, 0, 12],
    lead: [12, 14, 16, X, 19, X, 16, X, 14, 12, X, X, 7, X, X, X, 17, X, 21, X, 19, 17, 16, X, 14, X, 12, X, 14, X, X, X, 19, X, 23, X, 21, 19, 17, X, 16, X, 14, X, 12, X, 11, X, 12, 14, 16, 17, 19, X, 17, X, 16, X, 14, X, 12, X, X, X],
    kick: 'x.......x.x.....', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.x.' },
  { id: 'funk', name: 'Cosmic Funk', emoji: '🪩', bpm: 112, swing: 0.12, root: 40, wave: 'square', leadWave: 'triangle',
    chords: [[0, 4, 10], [0, 4, 10], [5, 9, 15], [7, 11, 17]],
    bass: [0, X, X, 0, X, X, 12, X, 10, X, 7, X, 5, X, 3, X],
    lead: [X, X, 19, X, 22, X, 19, X, X, 17, X, 15, X, X, 12, X, X, X, 19, X, 22, X, 24, X, X, 22, X, 19, X, X, X, X, X, X, 24, X, 22, X, 19, X, 17, X, 15, X, 17, X, X, X, X, X, 12, X, 15, X, 17, X, 19, X, X, X, X, X, X, X],
    kick: 'x..x..x...x..x..', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' },
  { id: 'chill', name: 'Lo-fi Tickets', emoji: '🎟️', bpm: 78, swing: 0.18, root: 50, wave: 'triangle', leadWave: 'sine',
    chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]],
    bass: [0, X, X, X, X, X, 7, X, 0, X, X, X, 5, X, X, X],
    lead: [16, X, X, X, 14, X, 12, X, X, X, 11, X, 12, X, X, X, X, X, 12, X, 11, X, 9, X, X, X, 7, X, X, X, X, X, 14, X, X, X, 12, X, 14, X, 16, X, X, X, 19, X, X, X, 17, X, 16, X, 14, X, 12, X, 11, X, X, X, X, X, X, X],
    kick: 'x.......x.x.....', snare: '....x.......x...', hat: '..x...x...x...x.' },
  { id: 'boss', name: 'Boss Rush', emoji: '🔥', bpm: 168, root: 40, wave: 'sawtooth', leadWave: 'sawtooth', arp: true,
    chords: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]],
    bass: [0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12, 13, 12],
    lead: [12, X, 15, X, 19, X, 18, X, 19, X, 22, X, 24, X, X, X, 13, X, 17, X, 20, X, 19, X, 17, X, 15, X, 13, X, X, X, 12, X, 15, X, 19, X, 24, X, 22, X, 19, X, 15, X, X, X, 10, X, 14, X, 17, X, 22, X, 19, X, 17, X, 14, X, X, X],
    kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' },
];

let ctx: AudioContext | null = null, master: GainNode | null = null, timer: number | null = null;
let track: Track | null = null, step = 0, nextAt = 0, volume = 0.5, duck = 1;
const saved = (() => { try { return JSON.parse(localStorage.getItem('landvas.arcade.music') ?? 'null') as { id: string | null; vol: number } | null; } catch { return null; } })();
let chosen: string | null = saved ? saved.id : 'neon';
volume = saved?.vol ?? 0.5;
const listeners = new Set<() => void>();
const emit = () => { for (const f of listeners) f(); };
const save = () => { try { localStorage.setItem('landvas.arcade.music', JSON.stringify({ id: chosen, vol: volume })); } catch { /* private mode */ } };
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function voice(t: number, freq: number, dur: number, type: OscillatorType, vol: number, slide?: number) {
  const os = ctx!.createOscillator(), g = ctx!.createGain();
  os.type = type; os.frequency.setValueAtTime(freq, t); if (slide) os.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  os.connect(g).connect(master!); os.start(t); os.stop(t + dur + 0.05);
}
let noiseBuf: AudioBuffer | null = null;
function noise(t: number, dur: number, vol: number, hp: number) {
  if (!noiseBuf) { noiseBuf = ctx!.createBuffer(1, ctx!.sampleRate * 0.5, ctx!.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master!); s.start(t); s.stop(t + dur + 0.02);
}
function schedule() {
  if (!ctx || !track) return;
  const sp = 60 / track.bpm / 4;
  while (nextAt < ctx.currentTime + 0.12) {
    const i = step % 16, bar = Math.floor(step / 16) % 4, t = nextAt + (i % 2 ? (track.swing ?? 0) * sp : 0);
    if (track.kick[i] === 'x') voice(t, 150, 0.18, 'sine', 0.55, 40);
    if (track.snare[i] === 'x') { noise(t, 0.16, 0.22, 1200); voice(t, 190, 0.08, 'triangle', 0.12); }
    if (track.hat[i] === 'x') noise(t, 0.04, 0.06, 7000);
    const b = track.bass[i]; if (b != null) voice(t, hz(track.root - 12 + b + track.chords[bar][0]), sp * 1.8, track.wave === 'sawtooth' ? 'sawtooth' : 'triangle', 0.13);
    const ch = track.chords[bar];
    if (track.arp) { const n = ch[i % ch.length]; voice(t, hz(track.root + 12 + n), sp * 0.9, track.wave, 0.035); }
    else if (i % 8 === 0) for (const n of ch) voice(t, hz(track.root + 12 + n), sp * 7, track.wave, 0.03);
    const l = track.lead[(bar * 16 + i) % track.lead.length]; if (l != null) voice(t, hz(track.root + 12 + l), sp * 1.7, track.leadWave, 0.05);
    step++; nextAt += sp;
  }
}
function apply() { if (master && ctx) master.gain.setTargetAtTime(volume * duck * 0.55, ctx.currentTime, 0.2); }

export const music = {
  tracks: TRACKS,
  get current() { return chosen; },
  get volume() { return volume; },
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
  /** Start (or switch to) a track; null = jukebox off. Needs a tap first on phones (browsers only allow sound after one). */
  play(id: string | null = chosen) {
    chosen = id; save(); emit();
    if (!id) { this.stop(false); return; }
    try {
      ctx ??= new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
      if (!master) { master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); }
      const tr = TRACKS.find((x) => x.id === id) ?? TRACKS[0];
      if (track?.id !== tr.id) { track = tr; step = 0; nextAt = ctx.currentTime + 0.1; }
      apply();
      timer ??= window.setInterval(schedule, 30);
    } catch { /* no audio */ }
  },
  stop(forget = false) {
    if (timer) { clearInterval(timer); timer = null; }
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    track = null;
    if (forget) { chosen = null; save(); emit(); }
  },
  setVolume(v: number) { volume = Math.max(0, Math.min(1, v)); save(); apply(); emit(); },
  /** a bit quieter while a game is running */ setDuck(on: boolean) { duck = on ? 0.45 : 1; apply(); },
  get playing() { return !!timer; },
};
