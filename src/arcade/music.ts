// Arcade music, made on the fly: a little step sequencer (drums, bass, chords and a lead) playing one of a
// handful of tracks. The jukebox picks the track; it keeps playing (a touch quieter) while you're on a cabinet.
// No audio files, nothing to download.
type Track = { id: string; name: string; emoji: string; bpm: number; swing?: number;
  // 16 steps a bar, 4 bars: notes are semitones from the root (null = rest)
  root: number; chords: number[][]; bass: (number | null)[]; lead: (number | null)[]; arp?: boolean;
  kick: string; snare: string; hat: string; wave: OscillatorType; leadWave: OscillatorType; home?: boolean;
  /** soundtracks for the 3D party games (not on the jukebox or the record player) */ game?: boolean; pad?: boolean };

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
  // records for the record player at home: softer, cosier
  { id: 'jazz', name: 'Sunday Jazz', emoji: '🎷', bpm: 92, swing: 0.22, root: 48, wave: 'triangle', leadWave: 'sine', home: true,
    chords: [[0, 4, 7, 11], [2, 5, 9, 12], [-1, 2, 5, 9], [0, 4, 7, 11]],
    bass: [0, X, 7, X, 12, X, 7, X, 0, X, 4, X, 7, X, 9, X],
    lead: [16, X, 14, 12, X, X, 11, X, 12, X, X, X, 7, X, X, X, 17, X, 16, 14, X, X, 12, X, 14, X, X, X, X, X, X, X, 14, X, 12, 11, X, X, 9, X, 11, X, 12, X, 14, X, X, X, 12, X, X, X, 11, X, 12, X, X, X, X, X, X, X, X, X],
    kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.xx.xx.x.xx.xx.' },
  { id: 'rain', name: 'Rainy Window', emoji: '🌧️', bpm: 70, swing: 0.15, root: 52, wave: 'sine', leadWave: 'triangle', home: true,
    chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -3, 0, 3], [-5, -2, 2, 5]],
    bass: [0, X, X, X, X, X, X, X, -5, X, X, X, X, X, X, X],
    lead: [15, X, X, X, 14, X, X, X, 12, X, X, X, X, X, 10, X, 12, X, X, X, X, X, X, X, X, X, X, X, X, X, X, X, 10, X, X, X, 12, X, X, X, 14, X, X, X, 15, X, X, X, 14, X, X, X, X, X, 12, X, X, X, X, X, X, X, X, X],
    kick: 'x.......x.......', snare: '........x.......', hat: '..x...x...x...x.' },
  { id: 'garden', name: 'Garden Party', emoji: '🌻', bpm: 118, root: 55, wave: 'triangle', leadWave: 'square', arp: true, home: true,
    chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]],
    bass: [0, X, 7, X, 0, X, 7, X, 0, X, 7, X, 0, 2, 4, 5],
    lead: [12, X, 16, X, 19, X, 16, X, 17, X, 21, X, 19, X, X, X, 16, X, 19, X, 24, X, 19, X, 21, X, 19, X, 17, X, X, X, 12, X, 16, X, 19, X, 21, X, 19, X, 17, X, 16, X, 14, X, 12, X, 14, X, 16, X, 17, X, 19, X, X, X, X, X, X, X],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
  { id: 'disco', name: 'Disco Dinner', emoji: '🪩', bpm: 120, root: 45, wave: 'sawtooth', leadWave: 'square', home: true,
    chords: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [-2, 2, 5, 8]],
    bass: [0, 12, 0, 12, 0, 12, 0, 12, 5, 17, 5, 17, 7, 19, 7, 19],
    lead: [X, X, 19, X, 22, X, 19, X, 24, X, X, X, 22, X, X, X, X, X, 17, X, 19, X, 22, X, 19, X, X, X, 17, X, 15, X, X, X, 19, X, 22, X, 24, X, 27, X, X, X, 24, X, X, X, 22, X, 19, X, 17, X, 15, X, 17, X, X, X, X, X, X, X],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
  { id: 'lullaby', name: 'Night Light', emoji: '🌙', bpm: 64, root: 60, wave: 'sine', leadWave: 'sine', arp: true, home: true,
    chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    bass: [0, X, X, X, X, X, X, X, 7, X, X, X, X, X, X, X],
    lead: [12, X, X, X, 16, X, X, X, 19, X, X, X, 16, X, X, X, 14, X, X, X, 12, X, X, X, 9, X, X, X, X, X, X, X, 11, X, X, X, 14, X, X, X, 17, X, X, X, 14, X, X, X, 12, X, X, X, X, X, X, X, X, X, X, X, X, X, X, X],
    kick: '................', snare: '................', hat: '........x.......' },
  // ---- the 3D party games' soundtracks ----
  { id: 'chase', name: 'Ink Chase', emoji: '🏃', bpm: 156, root: 45, wave: 'sawtooth', leadWave: 'square', arp: true, game: true,
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]],
    bass: [0, X, 0, 12, X, 0, 12, X, 0, X, 0, 12, X, 0, 10, 12],
    lead: [12, X, 15, X, 19, X, 15, 19, 22, X, 19, X, 15, X, 14, X, 8, X, 12, X, 15, X, 12, 15, 20, X, 19, X, 15, X, 12, X, 10, X, 14, X, 17, X, 14, 17, 22, X, 21, X, 17, X, 14, X, 7, X, 11, X, 14, X, 17, X, 19, X, 23, X, 24, X, X, X],
    kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx' },
  { id: 'sneak', name: 'Tiptoe', emoji: '🙈', bpm: 100, root: 50, wave: 'triangle', leadWave: 'triangle', game: true,
    chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-5, -2, 2]],
    bass: [0, X, X, X, 7, X, X, X, 0, X, X, X, 6, X, 7, X],
    lead: [12, X, X, 15, X, X, 14, X, X, 12, X, X, 11, X, X, X, 12, X, X, 15, X, X, 19, X, X, 18, X, X, 17, X, X, X, 8, X, X, 12, X, X, 11, X, X, 8, X, X, 7, X, X, X, 7, X, 8, X, 10, X, 11, X, X, X, 14, X, X, X, X, X],
    kick: 'x.......x.......', snare: '................', hat: '..x...x...x...x.' },
  { id: 'stalk', name: 'The Lantern', emoji: '🏮', bpm: 76, root: 38, wave: 'sawtooth', leadWave: 'sine', game: true, pad: true,
    chords: [[0, 3, 7], [1, 4, 8], [0, 3, 6], [-1, 3, 6]],
    bass: [0, X, X, 0, X, X, X, X, 0, X, X, 0, X, X, 1, X],
    lead: [X, X, X, X, 15, X, X, X, X, X, 14, X, X, X, X, X, X, X, X, X, 16, X, X, X, X, X, 15, X, X, X, X, X, X, X, X, X, 15, X, X, X, 18, X, X, X, 15, X, X, X, X, X, X, X, 14, X, X, X, 11, X, X, X, X, X, X, X],
    kick: 'x..x............', snare: '............x...', hat: '................' },
  { id: 'magma', name: 'Magma Run', emoji: '🌋', bpm: 140, root: 43, wave: 'square', leadWave: 'sawtooth', arp: true, game: true,
    chords: [[0, 3, 7], [3, 7, 10], [5, 8, 12], [-2, 2, 5]],
    bass: [0, 0, 12, 0, 0, 12, 0, 10, 0, 0, 12, 0, 0, 12, 13, 12],
    lead: [19, X, X, 17, X, X, 15, X, 14, X, 15, X, 17, X, X, X, 22, X, X, 20, X, X, 19, X, 17, X, 19, X, 20, X, X, X, 24, X, X, 22, X, X, 20, X, 19, X, 17, X, 15, X, X, X, 14, X, 15, X, 17, X, 19, X, 22, X, 19, X, 26, X, X, X],
    kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' },
  { id: 'swing', name: 'Ballroom Swing', emoji: '🎩', bpm: 132, swing: 0.2, root: 46, wave: 'triangle', leadWave: 'square', game: true,
    chords: [[0, 4, 7, 9], [5, 9, 12, 14], [7, 11, 14, 17], [0, 4, 7, 10]],
    bass: [0, X, 4, X, 7, X, 9, X, 12, X, 9, X, 7, X, 4, X],
    lead: [12, 14, 16, X, 19, X, 16, X, 21, X, 19, X, 16, X, X, X, 17, X, 21, X, 24, X, 21, X, 19, X, 17, X, 14, X, X, X, 19, X, 23, X, 26, X, 23, X, 21, X, 19, X, 17, X, 14, X, 16, X, 19, X, 22, X, 19, X, 16, X, 12, X, X, X, X, X],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.xx.xx.x.xx.xx.' },
  { id: 'frost', name: 'Thin Ice', emoji: '🧊', bpm: 128, root: 50, wave: 'square', leadWave: 'triangle', arp: true, game: true,
    chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]],
    bass: [0, X, 0, X, 12, X, 0, X, 0, X, 0, X, 12, X, 10, X],
    lead: [19, X, 17, X, 15, X, 14, X, 15, X, X, X, 12, X, X, X, 17, X, 15, X, 14, X, 12, X, 14, X, X, X, 10, X, X, X, 15, X, 14, X, 12, X, 10, X, 12, X, X, X, 8, X, 10, X, 11, X, 12, X, 14, X, 15, X, 17, X, 19, X, X, X, X, X],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...xx' },
  { id: 'splat', name: 'Splat Attack', emoji: '🎨', bpm: 124, swing: 0.1, root: 48, wave: 'square', leadWave: 'square', game: true,
    chords: [[0, 4, 7, 10], [5, 9, 12, 15], [0, 4, 7, 10], [7, 11, 14, 17]],
    bass: [0, X, 0, 12, X, 10, X, 7, 0, X, 0, 12, X, 10, 7, X],
    lead: [12, X, 15, 16, X, 19, X, 16, 15, X, 12, X, X, X, X, X, 17, X, 20, 21, X, 24, X, 21, 20, X, 17, X, X, X, X, X, 12, X, 15, 16, X, 19, X, 22, 24, X, 22, X, 19, X, 16, X, 19, X, X, 17, X, 15, X, 14, 12, X, X, X, X, X, X, X],
    kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx' },
  { id: 'jingle', name: 'Snow Day', emoji: '❄️', bpm: 144, root: 55, wave: 'triangle', leadWave: 'square', arp: true, game: true,
    chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
    bass: [0, X, 7, X, 0, X, 7, X, 5, X, 12, X, 7, X, 11, X],
    lead: [16, X, 16, X, 16, X, X, X, 16, X, 16, X, 16, X, X, X, 16, X, 19, X, 12, X, 14, X, 16, X, X, X, X, X, X, X, 17, X, 17, X, 17, X, 17, X, 17, X, 16, X, 16, X, 16, 16, 16, X, 14, X, 14, X, 16, X, 14, X, X, X, 19, X, X, X],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
  { id: 'doll', name: 'The Doll Sings', emoji: '🎎', bpm: 112, root: 60, wave: 'sine', leadWave: 'triangle', game: true,
    chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-5, -1, 2]],
    bass: [0, X, X, X, 7, X, X, X, 0, X, X, X, 7, X, X, X],
    lead: [7, X, 7, X, 10, X, 7, X, 5, X, 3, X, 5, X, X, X, 7, X, 7, X, 10, X, 7, X, 5, X, 3, X, 2, X, X, X, 3, X, 3, X, 7, X, 3, X, 2, X, 0, X, 2, X, X, X, 3, X, 2, X, 0, X, -2, X, 0, X, X, X, X, X, X, X],
    kick: '................', snare: '................', hat: 'x...x...x...x...' },
  { id: 'shanty', name: 'Yo-Ho Rush', emoji: '🏴‍☠️', bpm: 138, swing: 0.25, root: 50, wave: 'triangle', leadWave: 'square', game: true,
    chords: [[0, 3, 7], [-2, 2, 5], [0, 3, 7], [-5, -1, 2]],
    bass: [0, X, X, 7, X, X, 0, X, X, 7, X, X, 5, X, 7, X],
    lead: [7, X, 7, 7, X, 12, X, 10, 8, X, 7, X, 5, X, X, X, 3, X, 3, 3, X, 7, X, 5, 3, X, 2, X, 0, X, X, X, 7, X, 7, 7, X, 12, X, 14, 15, X, 14, X, 12, X, X, X, 10, X, 8, 7, X, 5, X, 3, 2, X, 0, X, X, X, X, X],
    kick: 'x..x..x...x..x..', snare: '......x.......x.', hat: 'x.xx.xx.x.xx.xx.' },
];

let ctx: AudioContext | null = null, master: GainNode | null = null, timer: number | null = null;
let track: Track | null = null, step = 0, nextAt = 0, volume = 0.5, duck = 1, tempo = 1, heat = 0;
const saved = (() => { try { return JSON.parse(localStorage.getItem('landvas.arcade.music') ?? 'null') as { id: string | null; vol: number } | null; } catch { return null; } })();
let chosen: string | null = saved ? saved.id : 'neon';
let playing: string | null = null;
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
  const sp = 60 / (track.bpm * tempo) / 4;
  while (nextAt < ctx.currentTime + 0.12) {
    const i = step % 16, bar = Math.floor(step / 16) % 4, t = nextAt + (i % 2 ? (track.swing ?? 0) * sp : 0);
    if (track.kick[i] === 'x') voice(t, 150, 0.18, 'sine', 0.55, 40);
    if (track.snare[i] === 'x') { noise(t, 0.16, 0.22, 1200); voice(t, 190, 0.08, 'triangle', 0.12); }
    if (track.hat[i] === 'x' || (heat > 0.35 && i % 2 === 0)) noise(t, 0.04, track.hat[i] === 'x' ? 0.06 : 0.035, 7000);
    // the heartbeat when someone's close (lub-dub every half bar)
    if (heat > 0.7 && (i % 8 === 0 || i % 8 === 2)) voice(t, i % 8 ? 52 : 62, 0.22, 'sine', 0.7 * heat, 34);
    // a long dark pad under the creepy ones
    if (track.pad && i === 0) for (const n of track.chords[bar]) voice(t, hz(track.root + n), sp * 15, 'sine', 0.05);
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
  /** what's on right now (the arcade's pick, or a record at someone's home) */ get nowPlaying() { return timer ? playing : null; },
  get volume() { return volume; },
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
  /** Start (or switch to) a track; null = jukebox off. Needs a tap first on phones (browsers only allow sound after one). */
  play(id: string | null = chosen, remember = true) {
    if (remember) { chosen = id; save(); }
    playing = id; emit();
    if (!id) { this.stop(false); return; }
    if (remember) { tempo = 1; heat = 0; }
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
    track = null; playing = null; tempo = 1; heat = 0; emit();
    if (forget) { chosen = null; save(); emit(); }
  },
  setVolume(v: number) { volume = Math.max(0, Math.min(1, v)); save(); apply(); emit(); },
  /** speed the music up (1 = as written), for the tense last seconds */ setTempo(x: number) { tempo = Math.max(0.5, Math.min(1.6, x)); },
  /** 0..1: more hats from 0.35, a heartbeat from 0.7 (someone's close!) */ setHeat(x: number) { heat = Math.max(0, Math.min(1, x)); },
  /** a bit quieter while a game is running */ setDuck(on: boolean) { duck = on ? 0.45 : 1; apply(); },
  get playing() { return !!timer; },
};
