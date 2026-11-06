// The Clan Keep's own games: the Quarry (crack boulders for stone; gems inside some, careful with the TNT) and the
// Training Grounds (an archery range: tap targets as they slide by — bullseyes and streaks score big).
import { useEffect, useRef, useState } from 'react';
import { buzz } from '../native/native';
import { Hud, drawFloats, emoji, rng, useClock, type ArenaProps, type Float } from '../farm/games';

const dpr = () => Math.min(2, devicePixelRatio || 1);

export function Quarry({ seed, seconds, onEnd, haptics, reduce }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const S = useRef({ score: 0, combo: 0 });
  const left = useClock(seconds, () => onEnd(S.current.score));
  useEffect(() => {
    const c = cv.current!; const g = c.getContext('2d')!; const r = rng(seed);
    type Rock = { x: number; y: number; s: number; hp: number; max: number; kind: 'rock' | 'gem' | 'tnt'; shake: number; born: number; gone: number };
    type Chip = { x: number; y: number; vx: number; vy: number; life: number; c: string; size: number };
    let rocks: Rock[] = []; const chips: Chip[] = []; const floats: Float[] = [];
    let raf = 0, last = performance.now(), t = 0, spawn = 0, flash = 0;
    const size = () => { const b = c.getBoundingClientRect(); return { W: b.width, H: b.height }; };
    const add = () => {
      const { W, H } = size(); const roll = r();
      const kind: Rock['kind'] = roll < 0.12 ? 'gem' : roll < 0.2 ? 'tnt' : 'rock';
      const sz = kind === 'tnt' ? 0.8 : 0.7 + r() * 0.7, max = kind === 'tnt' ? 1 : sz < 0.95 ? 1 : sz < 1.2 ? 2 : 3;
      for (let k = 0; k < 12; k++) {
        const x = 50 + r() * (W - 100), y = H * 0.3 + r() * (H * 0.58);
        if (rocks.every((o) => Math.hypot(o.x - x, o.y - y) > 70 * (o.s + sz) / 2)) { rocks.push({ x, y, s: sz, hp: kind === 'gem' ? 3 : max, max: kind === 'gem' ? 3 : max, kind, shake: 0, born: t, gone: 0 }); return; }
      }
    };
    const down = (e: PointerEvent) => {
      const b = c.getBoundingClientRect(); const px = e.clientX - b.left, py = e.clientY - b.top;
      const rk = [...rocks].reverse().find((o) => !o.gone && Math.hypot(o.x - px, o.y - py) < 42 * o.s + 8); if (!rk) return;
      rk.hp--; rk.shake = 0.18;
      for (let k = 0; k < 6; k++) chips.push({ x: px, y: py, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 240, life: 0.6, c: rk.kind === 'gem' ? '#8FE3FF' : '#9C9488', size: 3 + Math.random() * 4 });
      if (haptics) buzz('light');
      if (rk.kind === 'tnt') {
        rk.gone = 0.01; flash = 0.35; S.current.combo = 0; S.current.score = Math.max(0, S.current.score - 12);
        floats.push({ x: rk.x, y: rk.y, text: 'BOOM −12', life: 1.1, color: '#FF6B6B' }); if (haptics) buzz('warning');
      } else if (rk.hp <= 0) {
        rk.gone = 0.01; S.current.combo++;
        const pts = (rk.kind === 'gem' ? 9 : rk.max * 2) + Math.min(4, Math.floor(S.current.combo / 3));
        S.current.score += pts; floats.push({ x: rk.x, y: rk.y - 20, text: rk.kind === 'gem' ? `💎 +${pts}` : `+${pts}`, life: 1, color: rk.kind === 'gem' ? '#8FE3FF' : '#FFF4DA' });
        for (let k = 0; k < 14; k++) chips.push({ x: rk.x, y: rk.y, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380, life: 0.9, c: rk.kind === 'gem' ? (k % 2 ? '#8FE3FF' : '#FFFFFF') : k % 2 ? '#8C8579' : '#B5AEA2', size: 4 + Math.random() * 6 });
      }
      setScore(S.current.score);
    };
    c.addEventListener('pointerdown', down);
    for (let k = 0; k < 6; k++) add();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const { W, H } = size();
      if (c.width !== Math.round(W * dpr())) { c.width = Math.round(W * dpr()); c.height = Math.round(H * dpr()); }
      g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
      spawn -= dt; if (spawn <= 0 && rocks.filter((o) => !o.gone).length < 9) { add(); spawn = 0.55 - Math.min(0.25, t / seconds * 0.25); }
      // the quarry face
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#E9B98A'); gr.addColorStop(0.22, '#B58763'); gr.addColorStop(0.24, '#6E6458'); gr.addColorStop(1, '#4C453D'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < 14; k++) { g.beginPath(); g.moveTo(0, H * 0.25 + k * 50); g.lineTo(W, H * 0.25 + k * 50 + Math.sin(k) * 30); g.lineTo(W, H * 0.25 + k * 50 + 6); g.lineTo(0, H * 0.25 + k * 50 + 6); g.fill(); }
      emoji(g, '🏰', W * 0.82, H * 0.14, 64); emoji(g, '⛏️', W * 0.12, H * 0.16, 40);
      if (flash > 0) { flash -= dt; g.fillStyle = `rgba(255,140,60,${flash})`; g.fillRect(0, 0, W, H); }
      rocks = rocks.filter((o) => !(o.gone && (o.gone += dt) > 0.25) && !(o.kind === 'tnt' && !o.gone && t - o.born > 4.5));
      for (const o of rocks) {
        if (o.gone) continue;
        if (o.shake > 0) o.shake -= dt;
        const sx = o.shake > 0 && !reduce ? Math.sin(o.shake * 90) * 5 : 0, R = 40 * o.s;
        g.save(); g.translate(o.x + sx, o.y);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, R * 0.8, R, R * 0.28, 0, 0, Math.PI * 2); g.fill();
        if (o.kind === 'tnt') { emoji(g, '🧨', 0, 0, R * 1.5); g.restore(); continue; }
        g.fillStyle = o.kind === 'gem' ? '#6F7C86' : '#8C8579'; g.beginPath();
        for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, rr = R * (0.82 + ((k * 37 + Math.floor(o.x)) % 7) / 30); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.86); } g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-R * 0.3, -R * 0.35, R * 0.35, R * 0.18, -0.5, 0, Math.PI * 2); g.fill();
        if (o.kind === 'gem') { for (const [x, y] of [[-12, -4], [10, 8], [4, -16]]) emoji(g, '💎', x * o.s, y * o.s, 16 * o.s); }
        // cracks
        g.strokeStyle = '#2C2721'; g.lineWidth = 3; const cracks = o.max - o.hp;
        for (let k = 0; k < cracks; k++) { g.beginPath(); g.moveTo(-R * 0.1 + k * 6, -R * 0.6); g.lineTo(R * 0.15 - k * 4, -R * 0.1); g.lineTo(-R * 0.2 + k * 8, R * 0.3); g.lineTo(R * 0.1, R * 0.6); g.stroke(); }
        g.restore();
      }
      for (let i = chips.length - 1; i >= 0; i--) { const p = chips[i]; p.life -= dt; p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) { chips.splice(i, 1); continue; } g.fillStyle = p.c; g.globalAlpha = Math.min(1, p.life * 2); g.fillRect(p.x, p.y, p.size, p.size); g.globalAlpha = 1; }
      drawFloats(g, floats, dt);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.removeEventListener('pointerdown', down); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-50 select-none" data-testid="keep-game">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" />
      <Hud score={score} left={left} />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 px-4 text-center text-sm font-bold text-white drop-shadow">Tap boulders to crack them · big ones take 3 hits · 💎 gem rocks score big · don’t tap the 🧨!</div>
    </div>
  );
}

export function Training({ seed, seconds, onEnd, haptics }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const S = useRef({ score: 0, streak: 0 });
  const left = useClock(seconds, () => onEnd(S.current.score));
  useEffect(() => {
    const c = cv.current!; const g = c.getContext('2d')!; const r = rng(seed);
    type Tg = { x: number; y: number; vx: number; R: number; kind: 'target' | 'gold' | 'friend'; hit: number; wob: number };
    type Arrow = { x: number; y: number; tx: number; ty: number; t: number };
    let tgs: Tg[] = []; const arrows: Arrow[] = []; const stuck: { x: number; y: number; tg: Tg }[] = []; const floats: Float[] = [];
    let raf = 0, last = performance.now(), t = 0, spawn = 0;
    const size = () => { const b = c.getBoundingClientRect(); return { W: b.width, H: b.height }; };
    const lanes = () => { const { H } = size(); return [H * 0.26, H * 0.44, H * 0.62]; };
    const add = () => {
      const { W } = size(); const lane = Math.floor(r() * 3), dir = r() < 0.5 ? 1 : -1, roll = r();
      const kind: Tg['kind'] = roll < 0.1 ? 'gold' : roll < 0.22 ? 'friend' : 'target';
      const speed = (70 + r() * 90 + t * 3) * dir, R = kind === 'gold' ? 26 : 38 + r() * 8;
      tgs.push({ x: dir > 0 ? -R : W + R, y: lanes()[lane], vx: speed * (kind === 'gold' ? 1.7 : 1), R, kind, hit: 0, wob: r() * 6 });
    };
    const down = (e: PointerEvent) => {
      const b = c.getBoundingClientRect(); const px = e.clientX - b.left, py = e.clientY - b.top; const { W, H } = size();
      arrows.push({ x: W / 2, y: H - 40, tx: px, ty: py, t: 0 });
      const tg = tgs.find((o) => !o.hit && Math.hypot(o.x - px, o.y - py) < o.R);
      if (!tg) { S.current.streak = 0; setStreak(0); floats.push({ x: px, y: py, text: 'miss', life: 0.6, color: '#ddd' }); return; }
      tg.hit = 0.01; stuck.push({ x: px - tg.x, y: py - tg.y, tg });
      if (tg.kind === 'friend') { S.current.streak = 0; S.current.score = Math.max(0, S.current.score - 20); floats.push({ x: px, y: py, text: 'Not the sheep! −20', life: 1.1, color: '#FF6B6B' }); if (haptics) buzz('warning'); setStreak(0); setScore(S.current.score); return; }
      const d = Math.hypot(tg.x - px, tg.y - py) / tg.R;
      const ring = tg.kind === 'gold' ? 25 : d < 0.22 ? 10 : d < 0.5 ? 6 : d < 0.78 ? 4 : 2;
      S.current.streak++; const mult = 1 + Math.min(4, Math.floor(S.current.streak / 4));
      const pts = ring * mult; S.current.score += pts; setScore(S.current.score); setStreak(S.current.streak);
      floats.push({ x: px, y: py - 10, text: ring >= 10 ? `🎯 BULLSEYE +${pts}` : `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, life: 1, color: ring >= 10 ? '#FFE36B' : '#fff' });
      if (haptics) buzz(ring >= 10 ? 'medium' : 'light');
    };
    c.addEventListener('pointerdown', down);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const { W, H } = size();
      if (c.width !== Math.round(W * dpr())) { c.width = Math.round(W * dpr()); c.height = Math.round(H * dpr()); }
      g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
      spawn -= dt; if (spawn <= 0) { add(); spawn = 0.8 - Math.min(0.4, t / seconds * 0.4); }
      // the range
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#FFB98A'); sky.addColorStop(0.5, '#FFE2B0'); sky.addColorStop(0.5, '#7AA64C'); sky.addColorStop(1, '#55803A'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = '#7C7468'; g.fillRect(0, H * 0.06, W, H * 0.08); for (let x = 0; x < W; x += 34) g.fillRect(x, H * 0.03, 20, H * 0.04);
      for (const y of lanes()) { g.fillStyle = 'rgba(80,50,25,0.55)'; g.fillRect(0, y + 44, W, 8); }
      tgs = tgs.filter((o) => (o.hit ? (o.hit += dt) < 0.6 : o.x > -80 && o.x < W + 80));
      for (const o of tgs) {
        if (!o.hit) o.x += o.vx * dt;
        const y = o.y + (o.hit ? o.hit * 120 : Math.sin(t * 3 + o.wob) * 3);
        g.globalAlpha = o.hit ? Math.max(0, 1 - o.hit / 0.6) : 1;
        if (o.kind === 'friend') emoji(g, '🐑', o.x, y, o.R * 2);
        else if (o.kind === 'gold') { emoji(g, '🪙', o.x, y, o.R * 2); }
        else {
          g.fillStyle = '#5B3D26'; g.fillRect(o.x - 4, y, 8, 50);
          for (const [k, col] of [[1, '#F4EEDF'], [0.78, '#D83A3A'], [0.5, '#F4EEDF'], [0.22, '#FFD23F']] as const) { g.fillStyle = col; g.beginPath(); g.arc(o.x, y, o.R * k, 0, Math.PI * 2); g.fill(); }
        }
        for (const s of stuck) if (s.tg === o) { g.strokeStyle = '#5B3D26'; g.lineWidth = 3; g.beginPath(); g.moveTo(o.x + s.x, y + s.y); g.lineTo(o.x + s.x + 10, y + s.y + 14); g.stroke(); }
        g.globalAlpha = 1;
      }
      for (let i = arrows.length - 1; i >= 0; i--) {
        const a = arrows[i]; a.t += dt * 6; if (a.t >= 1) { arrows.splice(i, 1); continue; }
        const x = a.x + (a.tx - a.x) * a.t, y = a.y + (a.ty - a.y) * a.t, ang = Math.atan2(a.ty - a.y, a.tx - a.x);
        g.save(); g.translate(x, y); g.rotate(ang); g.strokeStyle = '#5B3D26'; g.lineWidth = 3; g.beginPath(); g.moveTo(-22, 0); g.lineTo(0, 0); g.stroke(); g.fillStyle = '#ccc'; g.beginPath(); g.moveTo(4, 0); g.lineTo(-4, -4); g.lineTo(-4, 4); g.fill(); g.restore();
      }
      emoji(g, '🏹', W / 2, H - 40, 54);
      drawFloats(g, floats, dt);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.removeEventListener('pointerdown', down); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-50 select-none" data-testid="keep-game">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" />
      <Hud score={score} left={left} extra={streak >= 4 ? <div className="rounded-2xl bg-[#FFD23F] px-3 py-1 font-display text-lg font-black text-[#2A1A08]">🔥 ×{1 + Math.min(4, Math.floor(streak / 4))}</div> : null} />
      <div className="pointer-events-none absolute inset-x-0 bottom-24 px-4 text-center text-sm font-bold text-white drop-shadow">Tap the targets · hit the middle for a bullseye · 🪙 coins are worth 25 · streaks multiply · don’t shoot the 🐑!</div>
    </div>
  );
}
