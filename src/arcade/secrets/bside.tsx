// THE B-SIDE — the jukebox's secret: every arcade song gets a rhythm chart played on the arcade itself. The 16 cabinets
// become a 4x4 grid of pads, laid out as they stand in the hall, in their own colours. The chart is written from the
// song: kicks walk along the front row, snares hit the middle, the melody plays across the top two rows by pitch and the
// hats fill in on Expert. A ring closes in on a pad: tap it as the ring lands. PERFECT / GREAT / GOOD / MISS, a combo
// that multiplies (up to x4), and a health bar: run it dry and the record skips. Notes are timed to the music itself.
// Easy, Hard and Expert for each song; clearing one opens the next song; Track 00 opens when they're all cleared on Hard.
import { useEffect, useRef } from 'react';
import { Hud, usePops, tap, type ArenaProps } from '../games';
import { Led, Screen, Tip, glowCircle, run2d, sparks, useHud, type Engine } from '../games2';
import { TRACKS, music } from '../music';
import { sfx } from '../sfx';
import { setMeta } from './meta';

export type BSideDiff = 'easy' | 'hard' | 'expert';
export type Pad = { emoji: string; color: string; name?: string };
type Note = { step: number; pad: number; judged: boolean; res?: 'perfect' | 'great' | 'good' | 'miss' };

const LEAD: Record<BSideDiff, number> = { easy: 1.35, hard: 1.0, expert: 0.78 };
const WIN = { perfect: 0.05, great: 0.1, good: 0.16 };

/** The chart for a song on a difficulty: which pad (row * 4 + col, row 0 at the back) on which 16th step. */
export function chartFor(trackId: string, diff: BSideDiff): Note[] {
  const tr = TRACKS.find((x) => x.id === trackId) ?? TRACKS[0];
  const bars = Math.max(12, Math.min(36, Math.round((52 * tr.bpm) / 240)));
  const out: Note[] = [];
  const lastOnPad = new Map<number, number>();
  const add = (step: number, pad: number) => {
    // never the same pad twice in a row too fast to hit
    if (step - (lastOnPad.get(pad) ?? -99) < (diff === 'expert' ? 2 : 4)) return;
    if (out.some((n) => n.step === step && n.pad === pad)) return;
    if (out.filter((n) => n.step === step).length >= (diff === 'expert' ? 2 : 1)) return;
    lastOnPad.set(pad, step); out.push({ step, pad, judged: false });
  };
  for (let b = 1; b <= bars; b++) {
    for (let i = 0; i < 16; i++) {
      const step = b * 16 + i;
      const kick = tr.kick[i] === 'x', snare = tr.snare[i] === 'x', hat = tr.hat[i] === 'x';
      const lead = tr.lead[((b % 4) * 16 + i) % tr.lead.length];
      const kickPad = 12 + ((b + Math.floor(i / 4)) % 4);
      const snarePad = 8 + (b % 2 ? 1 : 2);
      const leadPad = lead == null ? -1 : (lead >= 15 ? 0 : 4) + Math.floor((((lead % 12) + 12) % 12) / 3);
      const hatPad = (i + b) % 4;
      if (diff === 'easy') {
        if (kick && i % 8 === 0) add(step, kickPad);
        else if (snare && i === 12 && b % 2 === 1) add(step, snarePad);
      } else if (diff === 'hard') {
        if (snare) add(step, snarePad);
        else if (kick && i % 4 === 0) add(step, kickPad);
        else if (leadPad >= 0 && i % 4 === 2 && b % 2 === 0) add(step, leadPad);
      } else {
        if (snare) add(step, snarePad);
        if (kick && i % 2 === 0) add(step, kickPad);
        if (leadPad >= 0) add(step, leadPad);
        if (hat && b % 4 === 3 && i % 2 === 1) add(step, hatPad);
      }
    }
  }
  return out.sort((a, z) => a.step - z.step);
}

export function BSide({ onEnd, haptics, reduce, song, diff, pads }: ArenaProps & { song: string; diff: BSideDiff; pads: Pad[] }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const HP0 = diff === 'easy' ? 80 : 60; // Easy forgives a slow start while you find the pads
  const [hud, setHud] = useHud({ score: 0, combo: 0, hp: HP0 });
  const pops = usePops();
  useEffect(() => {
    const fx = sparks();
    const tr = TRACKS.find((x) => x.id === song) ?? TRACKS[0];
    const notes = chartFor(song, diff);
    const lastStep = notes.length ? notes[notes.length - 1].step : 64;
    const wasPlaying = music.playing;
    const synced = music.restart(song);
    music.setDuck(false);
    const t0 = performance.now() + 250, spFallback = 60 / tr.bpm / 4;
    let score = 0, combo = 0, maxCombo = 0, hp = HP0, over = false, misses = 0;
    const tally = { perfect: 0, great: 0, good: 0, miss: 0 };
    const flashPad = new Float32Array(16), flashCol: string[] = Array(16).fill('#FFFFFF');
    let W = 0, H = 0;
    const clock = () => {
      const p = synced ? music.position() : null;
      if (p && p.id === song) return { step: p.step, sp: p.sp };
      return { step: (performance.now() - t0) / 1000 / spFallback, sp: spFallback };
    };
    const geo = () => {
      const size = Math.min(W - 24, H - 130), cell = size / 4, x0 = (W - size) / 2, y0 = 64 + (H - 110 - size) / 2;
      return { cell, x0, y0, rect: (i: number) => ({ x: x0 + (i % 4) * cell, y: y0 + Math.floor(i / 4) * cell }) };
    };
    const judge = (n: Note, res: Note['res']) => {
      n.judged = true; n.res = res;
      if (res === 'miss') {
        combo = 0; misses++; tally.miss++; hp = Math.max(0, hp - (diff === 'easy' ? 5 : diff === 'hard' ? 9 : 11)); sfx.thud();
        flashPad[n.pad] = 0.4; flashCol[n.pad] = '#FF3D6E';
      } else {
        combo++; maxCombo = Math.max(maxCombo, combo); tally[res!]++;
        hp = Math.min(100, hp + (res === 'perfect' ? 3 : res === 'great' ? 2 : 1));
        const mult = 1 + Math.min(3, Math.floor(combo / 25));
        score += (res === 'perfect' ? 3 : res === 'great' ? 2 : 1) * mult;
        flashPad[n.pad] = 1; flashCol[n.pad] = res === 'perfect' ? '#FFE14D' : res === 'great' ? '#3DDC97' : '#9DE4FF';
        const g = geo(), r = g.rect(n.pad);
        if (!reduce) fx.burst(r.x + g.cell / 2, r.y + g.cell / 2, [pads[n.pad]?.color ?? '#B57BFF', '#FFFFFF'], res === 'perfect' ? 12 : 6, 160);
        if (combo > 0 && combo % 50 === 0) { sfx.win(4); pops.add(`${combo} COMBO!`, '#FFE14D', 50, 18, true); }
        tap(haptics);
      }
      setHud({ score, combo, hp: Math.round(hp) });
      if (hp <= 0 && !over) end(false);
    };
    const end = (clear: boolean) => {
      over = true;
      const total = Math.max(1, notes.length), acc = (tally.perfect + tally.great * 0.7 + tally.good * 0.4) / total;
      const fc = clear && misses === 0;
      const rank = !clear ? '—' : acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : 'C';
      setMeta({ clear, fc, acc: Math.round(acc * 1000) / 10, combo: maxCombo, rank });
      if (clear) { sfx.jackpot(); pops.add(fc ? 'FULL COMBO!' : `CLEARED · RANK ${rank}`, fc ? '#FFE14D' : '#3DDC97', 50, 40, true); }
      else { sfx.fail(); pops.add('THE RECORD SKIPPED', '#FF3D6E', 50, 40, true); music.stop(false); }
      setTimeout(() => onEnd(score), 1800);
    };
    const eng: Engine = {
      frame(g, w, h, dt, t) {
        W = w; H = h;
        const { step, sp } = clock(), now = step * sp;
        if (!over) {
          for (const n of notes) if (!n.judged && now - n.step * sp > WIN.good) judge(n, 'miss');
          if (step > lastStep + 12 && !over) end(true);
        }
        // ---- draw: the hall from above, lights down
        g.fillStyle = '#05040F'; g.fillRect(0, 0, W, H);
        const G = geo(), beat = step / 4, pulse = Math.max(0, 1 - (beat - Math.floor(beat)) * 2.5);
        g.fillStyle = `rgba(139,107,255,${0.05 + pulse * 0.07})`; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 16; i++) {
          const r = G.rect(i), p = pads[i] ?? { emoji: '🕹️', color: '#B57BFF' }, m = G.cell * 0.08;
          flashPad[i] = Math.max(0, flashPad[i] - dt * 3.2);
          g.fillStyle = '#121030'; g.beginPath(); g.roundRect(r.x + m, r.y + m, G.cell - m * 2, G.cell - m * 2, 10); g.fill();
          g.strokeStyle = p.color; g.globalAlpha = 0.45 + flashPad[i] * 0.55; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
          if (flashPad[i] > 0) { g.fillStyle = flashCol[i]; g.globalAlpha = flashPad[i] * 0.45; g.fill(); g.globalAlpha = 1; }
          g.fillStyle = p.color; g.globalAlpha = 0.85; g.fillRect(r.x + m * 2, r.y + m * 1.6, G.cell - m * 4, G.cell * 0.1); g.globalAlpha = 1;
          g.font = `${Math.floor(G.cell * 0.36)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.globalAlpha = 0.9; g.fillText(p.emoji, r.x + G.cell / 2, r.y + G.cell * 0.58); g.globalAlpha = 1;
        }
        // the rings closing in
        const L = LEAD[diff];
        for (const n of notes) {
          if (n.judged) continue;
          const d = n.step * sp - now; if (d > L) break;
          const r = G.rect(n.pad), cx = r.x + G.cell / 2, cy = r.y + G.cell / 2, k = Math.max(0, d / L);
          const col = pads[n.pad]?.color ?? '#B57BFF';
          g.strokeStyle = col; g.lineWidth = 3 + (1 - k) * 3; g.globalAlpha = 0.35 + (1 - k) * 0.65;
          g.beginPath(); g.arc(cx, cy, G.cell * (0.42 + k * 0.6), 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
          if (k < 0.25) glowCircle(g, cx, cy, G.cell * 0.12, '#FFFFFF', 18);
        }
        // the count-in
        if (step < 16) { const n = 4 - Math.floor(step / 4); g.font = '900 54px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFE14D'; g.fillText(n > 0 ? String(n) : 'GO', W / 2, G.y0 - 22 > 70 ? G.y0 - 22 : 92); }
        // the needle across the bottom: how far through the record
        const k = Math.max(0, Math.min(1, step / (lastStep + 12)));
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(20, H - 20, W - 40, 4); g.fillStyle = '#B57BFF'; g.fillRect(20, H - 20, (W - 40) * k, 4);
        fx.draw(g, dt);
        void t;
      },
      down: (p) => {
        if (over) return;
        const G = geo(), c = Math.floor((p.x - G.x0) / G.cell), r = Math.floor((p.y - G.y0) / G.cell);
        if (c < 0 || r < 0 || c > 3 || r > 3) return;
        hit(r * 4 + c);
      },
      key: (k, d) => {
        if (!d || over) return;
        const map = '1234qwerasdfzxcv'; const i = map.indexOf(k.toLowerCase());
        if (i >= 0) hit(i);
      },
    };
    const hit = (pad: number) => {
      const { step, sp } = clock(), now = step * sp;
      let best: Note | null = null, bd = 1;
      for (const n of notes) { if (n.judged || n.pad !== pad) continue; const d = Math.abs(n.step * sp - now); if (d < bd) { bd = d; best = n; } if (n.step * sp - now > WIN.good) break; }
      if (best && bd <= WIN.good) judge(best, bd <= WIN.perfect ? 'perfect' : bd <= WIN.great ? 'great' : 'good');
      else { flashPad[pad] = 0.25; flashCol[pad] = '#555577'; }
    };
    const stop = run2d(cv.current!, eng);
    return () => { stop(); if (wasPlaying && music.current) music.play(music.current); else music.stop(false); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen id="bside" cv={cv}>
      <Hud score={hud.score} left={<Led label="COMBO" v={hud.combo} c={hud.combo >= 25 ? '#FFE14D' : '#B57BFF'} />} right={<Led label="HP" v={`${hud.hp}%`} c={hud.hp > 30 ? '#3DDC97' : '#FF3D6E'} />} />
      <Tip>TAP A CABINET AS ITS RING LANDS</Tip>
      {pops.el}
    </Screen>
  );
}
