// The first-person view's sounds, synthesised (no audio files): footsteps that sound like what you're walking on
// (pavement, grass, splashing water), pedalling, the car's engine, the jetpack's roar, wind at speed, an ink bomb's
// whoosh, a catch's chime, and the Leviathan's roar when it's near. The context sleeps when it falls quiet
// (audioNap) and follows the sound setting.
import { audioNap } from '../lib/audioNap';
import { useUi } from '../lib/store';

export type Surface = 'hard' | 'grass' | 'water';

export function createEyesSound() {
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  const nap = audioNap(() => ctx);
  const on = () => useUi.getState().settings.sfx !== false;
  const get = () => {
    if (!on()) return null;
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  };
  const burst = (c: AudioContext, o: { dur: number; gain: number; type: BiquadFilterType; freq: number; q?: number; at?: number; rate?: number }) => {
    const src = c.createBufferSource(); src.buffer = noise; src.playbackRate.value = o.rate ?? 1;
    const f = c.createBiquadFilter(); f.type = o.type; f.frequency.value = o.freq; f.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    const t = c.currentTime + (o.at ?? 0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t, Math.random() * 0.5, o.dur + 0.05);
  };
  const tone = (c: AudioContext, o: { f0: number; f1?: number; dur: number; gain: number; type?: OscillatorType; at?: number }) => {
    const osc = c.createOscillator(); osc.type = o.type ?? 'sine';
    const g = c.createGain();
    const t = c.currentTime + (o.at ?? 0);
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + o.dur + 0.05);
  };

  // a running loop (engine, thrust, wind): one source, its gain and pitch follow the speed
  type Loop = { src: AudioScheduledSourceNode; g: GainNode; f?: BiquadFilterNode; osc?: OscillatorNode };
  let engine: Loop | null = null, wind: Loop | null = null;
  let loopKind: string | null = null;
  const stopLoop = (l: Loop | null) => { if (!l || !ctx) return; l.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); const s = l.src; setTimeout(() => { try { s.stop(); } catch { /* done */ } }, 600); };
  const noiseLoop = (c: AudioContext, type: BiquadFilterType, freq: number): Loop => {
    const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(c.destination); src.start();
    return { src, g, f };
  };
  const engineLoop = (c: AudioContext): Loop => {
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 45;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0;
    osc.connect(f).connect(g).connect(c.destination); osc.start();
    return { src: osc, g, f, osc };
  };

  return {
    step(kind: 'step' | 'pedal', strong: number, surface: Surface) {
      const c = get(); if (!c) return;
      if (kind === 'pedal') burst(c, { dur: 0.05, gain: 0.05, type: 'highpass', freq: 3000 });
      else if (surface === 'water') { burst(c, { dur: 0.22, gain: 0.16 * (0.6 + strong), type: 'bandpass', freq: 1400, q: 0.6 }); burst(c, { dur: 0.12, gain: 0.08, type: 'highpass', freq: 4000, at: 0.04 }); }
      else if (surface === 'grass') burst(c, { dur: 0.13, gain: 0.1 * (0.6 + strong), type: 'bandpass', freq: 2600 + Math.random() * 900, q: 0.5, rate: 0.8 });
      else { burst(c, { dur: 0.07, gain: 0.16 * (0.6 + strong), type: 'bandpass', freq: 750 + Math.random() * 250, q: 1.2 }); burst(c, { dur: 0.04, gain: 0.05, type: 'highpass', freq: 5000, at: 0.01 }); }
      nap.poke(0.3);
    },
    /** the vehicle's own sound and the wind, by how fast you're going (call a few times a second) */
    drive(vehicle: string, speed: number, flying: boolean) {
      const want = on() && (vehicle === 'car' || vehicle === 'jet') ? vehicle : null;
      if (want !== loopKind) { stopLoop(engine); engine = null; loopKind = want; }
      const c = want || speed > 8 || flying ? get() : ctx;
      if (want && c && !engine) engine = want === 'car' ? engineLoop(c) : noiseLoop(c, 'bandpass', 500);
      if (engine && c) {
        const k = Math.min(1, speed / 25);
        if (engine.osc) { engine.osc.frequency.setTargetAtTime(42 + k * 70, c.currentTime, 0.2); engine.g.gain.setTargetAtTime(0.05 + k * 0.05, c.currentTime, 0.2); }
        else { engine.f!.frequency.setTargetAtTime(380 + k * 900, c.currentTime, 0.2); engine.g.gain.setTargetAtTime(0.09 + k * 0.08, c.currentTime, 0.2); }
      }
      const w = on() ? Math.max(0, Math.min(1, (speed - 6) / 40)) + (flying ? 0.25 : 0) : 0;
      if (w > 0.02 && c) {
        wind ??= noiseLoop(c, 'lowpass', 600);
        wind.f!.frequency.setTargetAtTime(400 + w * 1600, c.currentTime, 0.3);
        wind.g.gain.setTargetAtTime(w * 0.12, c.currentTime, 0.3);
      } else if (wind) { stopLoop(wind); wind = null; }
      if (engine || wind) nap.hold(); else nap.poke(0.5);
    },
    whoosh() { const c = get(); if (!c) return; burst(c, { dur: 0.45, gain: 0.14, type: 'bandpass', freq: 900, q: 0.7, rate: 1.4 }); tone(c, { f0: 520, f1: 180, dur: 0.4, gain: 0.03, type: 'triangle' }); nap.poke(0.6); },
    splat() { const c = get(); if (!c) return; burst(c, { dur: 0.35, gain: 0.2, type: 'lowpass', freq: 700 }); tone(c, { f0: 140, f1: 60, dur: 0.3, gain: 0.08 }); nap.poke(0.5); },
    chime(big = false) {
      const c = get(); if (!c) return;
      const notes = big ? [784, 988, 1175, 1568] : [880, 1319];
      notes.forEach((f, i) => tone(c, { f0: f, dur: 0.5, gain: 0.07, type: 'sine', at: i * 0.07 }));
      nap.poke(1);
    },
    /** knock knock knock on a wooden door (a door creak to follow is `creak`) */
    knock() {
      const c = get(); if (!c) return;
      for (let i = 0; i < 3; i++) { burst(c, { dur: 0.09, gain: 0.38, type: 'bandpass', freq: 420 + i * 25, q: 2.2, at: i * 0.28 }); tone(c, { f0: 150, f1: 90, dur: 0.1, gain: 0.16, at: i * 0.28 }); }
      nap.poke(1.2);
    },
    creak() { const c = get(); if (!c) return; tone(c, { f0: 230, f1: 330, dur: 0.6, gain: 0.035, type: 'sawtooth' }); burst(c, { dur: 0.6, gain: 0.05, type: 'bandpass', freq: 1300, q: 5 }); nap.poke(0.9); },
    pop() { const c = get(); if (!c) return; tone(c, { f0: 900, f1: 1800, dur: 0.08, gain: 0.12, type: 'square' }); burst(c, { dur: 0.15, gain: 0.12, type: 'highpass', freq: 2500 }); nap.poke(0.4); },
    /** the Leviathan, louder the nearer it is (0…1) */
    roar(near: number) {
      const c = get(); if (!c || near <= 0.02) return;
      const g = 0.25 * near;
      tone(c, { f0: 90, f1: 45, dur: 2.2, gain: g, type: 'sawtooth' });
      tone(c, { f0: 140, f1: 70, dur: 1.8, gain: g * 0.6, type: 'square', at: 0.1 });
      burst(c, { dur: 2, gain: g * 0.8, type: 'lowpass', freq: 400 });
      nap.poke(2.5);
    },
    dispose() { stopLoop(engine); stopLoop(wind); engine = wind = null; setTimeout(() => { void ctx?.close().catch(() => {}); ctx = null; }, 700); },
  };
}
export type EyesSound = ReturnType<typeof createEyesSound>;
