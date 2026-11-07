// 🎁 Opening a Paintbrawl pack. The sealed foil pack floats and shimmers; tap it and its top tears off with light
// pouring out, and the cards rise up out of it into a pile. Then they're revealed one at a time, the rarest last.
// Rare cards glow before they flip; when they turn over they burst with light. Epics flash, and legendaries flash,
// shake the screen and throw confetti. Each card then flies down into the tray, and at the end you see the whole pull.
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { sfx } from '../arcade/sfx';
import { CARD, RARITY_INFO, type Rarity } from '../shared/brawl/cards';
import { CardView } from './CardView';
import type { PackCard } from './types';

const ORDER: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
type Stage = 'sealed' | 'tear' | 'deal' | 'reveal' | 'summary';
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; g: number };

/** The pack's foil wrapper, painted on a canvas (it shimmers as it moves). */
function drawPack(g: CanvasRenderingContext2D, w: number, h: number, t: number, glow: string) {
  g.clearRect(0, 0, w, h);
  const crimp = h * 0.05;
  // the foil body, with crimped top and bottom edges
  g.save();
  g.beginPath();
  const teeth = 14;
  g.moveTo(0, crimp);
  for (let i = 0; i <= teeth; i++) g.lineTo((i / teeth) * w, i % 2 ? 0 : crimp);
  g.lineTo(w, h - crimp);
  for (let i = teeth; i >= 0; i--) g.lineTo((i / teeth) * w, i % 2 ? h : h - crimp);
  g.closePath(); g.clip();
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#3A1A6A'); gr.addColorStop(0.45, '#7B2A9A'); gr.addColorStop(0.75, '#D8327A'); gr.addColorStop(1, '#FF8A3A');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // paint splats
  const splat = (x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, rr = r * (i % 2 ? 0.75 : 1.05 + Math.sin(i * 7.3) * 0.15); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); };
  splat(w * 0.18, h * 0.25, w * 0.13, 'rgba(34,227,255,0.55)'); splat(w * 0.85, h * 0.62, w * 0.16, 'rgba(255,225,77,0.5)');
  splat(w * 0.25, h * 0.82, w * 0.1, 'rgba(61,220,151,0.5)'); splat(w * 0.78, h * 0.2, w * 0.07, 'rgba(255,79,216,0.6)');
  // the emblem and the name
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${Math.round(w * 0.34)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.fillText('🎨', w / 2, h * 0.42 + Math.sin(t * 2) * 3);
  g.font = `900 ${Math.round(w * 0.15)}px ui-rounded, system-ui, sans-serif`; g.lineWidth = w * 0.03; g.strokeStyle = '#1A0A2A'; g.strokeText('PAINT', w / 2, h * 0.64); g.fillStyle = '#FFFFFF'; g.fillText('PAINT', w / 2, h * 0.64);
  g.strokeText('BRAWL', w / 2, h * 0.76); g.fillStyle = '#FFE14D'; g.fillText('BRAWL', w / 2, h * 0.76);
  g.font = `800 ${Math.round(w * 0.06)}px ui-rounded, system-ui, sans-serif`; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText('★ 5 CARDS ★', w / 2, h * 0.88);
  // the tear line near the top
  g.setLineDash([w * 0.03, w * 0.025]); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w * 0.04, h * 0.17); g.lineTo(w * 0.96, h * 0.17); g.stroke(); g.setLineDash([]);
  // a light sweep across the foil
  const sx = ((t * 0.45) % 1.6 - 0.3) * w * 1.6;
  const sh = g.createLinearGradient(sx - w * 0.3, 0, sx + w * 0.3, h * 0.4);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.45)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
  // a soft glow from inside (the colour of the best card in it)
  const ig = g.createRadialGradient(w / 2, h * 0.17, 0, w / 2, h * 0.17, w * 0.7); ig.addColorStop(0, glow + '55'); ig.addColorStop(1, glow + '00'); g.fillStyle = ig; g.fillRect(0, 0, w, h);
  g.restore();
  // the crimped seams
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(w * 0.02, crimp * 1.2, w * 0.96, h - crimp * 2.4);
}

// the jagged line it tears along (as clip-paths for the strip that flies off and the body that stays)
const JAG = Array.from({ length: 13 }, (_, i) => [(i / 12) * 100, 17 + (i % 2 ? 2.2 : -1.6) + Math.sin(i * 3.7) * 0.8]);
const TOP_CLIP = `polygon(0% 0%, 100% 0%, ${[...JAG].reverse().map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
const BODY_CLIP = `polygon(${JAG.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 100% 100%, 0% 100%)`;

function PackCanvas({ w, h, glow, clip, style, className }: { w: number; h: number; glow: string; clip: string; style?: React.CSSProperties; className?: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current!; const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d')!; g.scale(dpr, dpr);
    let raf = 0; const t0 = performance.now();
    const loop = () => { drawPack(g, w, h, (performance.now() - t0) / 1000, glow); raf = requestAnimationFrame(loop); };
    loop(); return () => cancelAnimationFrame(raf);
  }, [w, h, glow]);
  return <canvas ref={cv} className={cn('absolute inset-0', className)} style={{ width: w, height: h, clipPath: clip, ...style }} />;
}

export function PackOpening({ cards, onDone }: { cards: PackCard[]; onDone(): void }) {
  // the rarest are revealed last
  const order = useRef([...cards].map((c, i) => ({ ...c, i })).sort((a, b) => ORDER[a.rarity] - ORDER[b.rarity] || Number(a.foil) - Number(b.foil))).current;
  const best = order[order.length - 1];
  const bestColor = RARITY_INFO[best.rarity].color;
  const [stage, setStage] = useState<Stage>('sealed');
  const [cur, setCur] = useState(0);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [flash, setFlash] = useState(0);
  const [shake, setShake] = useState(false);
  const fxCv = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<Spark[]>([]);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400, vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const PW = Math.min(220, vw * 0.52), PH = PW * 1.55;
  const CW = Math.round(Math.min(250, vw * 0.6, (vh - 260) / 1.4));

  // the spark layer over everything
  useEffect(() => {
    const c = fxCv.current!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr; };
    size(); window.addEventListener('resize', size);
    const g = c.getContext('2d')!; let raf = 0, last = performance.now();
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'lighter';
      const list = sparks.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.life -= dt; if (p.life <= 0) { list.splice(i, 1); continue; }
        p.vy += p.g * dt; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt;
        const k = p.life / p.max; g.globalAlpha = Math.min(1, k * 1.6); g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1; raf = requestAnimationFrame(loop);
    };
    loop(); return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, []);
  const burst = (x: number, y: number, colors: string[], n: number, speed: number, o: { g?: number; size?: number; life?: number } = {}) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.8);
      sparks.current.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.2, life: (o.life ?? 1) * (0.6 + Math.random() * 0.6), max: o.life ?? 1, size: (o.size ?? 4) * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], g: o.g ?? 400 });
    }
  };
  const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight * 0.42 });

  const tear = () => {
    if (stage !== 'sealed') return;
    setStage('tear'); sfx.swish();
    const c = center(), top = c.y - PH / 2 + PH * 0.17;
    burst(c.x, top, ['#FFFFFF', '#FFE14D', bestColor], 60, 420, { g: 260, size: 4 });
    setTimeout(() => { setStage('deal'); sfx.tick(); }, 850);
    setTimeout(() => setStage('reveal'), 1650);
  };

  const reveal = () => {
    if (stage !== 'reveal' || leaving) return;
    if (!shown) {
      // turn it over: the rarer, the bigger the moment
      setShown(true);
      const c = order[cur], col = RARITY_INFO[c.rarity].color, p = center();
      setTimeout(() => {
        if (c.rarity === 'legendary' || c.foil) { sfx.jackpot(); confettiCannons(); setFlash(1); setShake(true); setTimeout(() => setShake(false), 500); burst(p.x, p.y, [col, '#FFFFFF', '#FFE14D', '#FF4FD8'], 140, 700, { size: 5, life: 1.6 }); }
        else if (c.rarity === 'epic') { sfx.win(4); setFlash(0.6); burst(p.x, p.y, [col, '#FFFFFF'], 90, 560, { size: 4.5, life: 1.3 }); }
        else if (c.rarity === 'rare') { sfx.perfect(4); burst(p.x, p.y, [col, '#FFFFFF'], 50, 420, { size: 4 }); }
        else { sfx.tick(); burst(p.x, p.y, ['#FFFFFF', '#CFC8E8'], 18, 260, { size: 3 }); }
      }, 260);
      return;
    }
    // then it flies down into the tray, and the next one comes up
    setLeaving(true); sfx.swish();
    setTimeout(() => {
      setLeaving(false); setShown(false);
      if (cur + 1 >= order.length) setStage('summary'); else setCur(cur + 1);
    }, 380);
  };
  const revealAll = () => { setShown(false); setLeaving(false); setStage('summary'); if (order.some((c) => c.rarity === 'legendary' || c.foil)) { sfx.jackpot(); confettiCannons(); } else sfx.win(3); };
  useEffect(() => { if (flash > 0) { const t = setTimeout(() => setFlash(0), 60); return () => clearTimeout(t); } }, [flash]);

  const c = order[cur], col = RARITY_INFO[c?.rarity ?? 'common'].color;
  const tray = order.slice(0, stage === 'summary' ? order.length : cur);
  return (
    <div className={cn('fixed inset-0 z-[80] overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#3A1A5A,#0A0612_70%)] text-white', shake && 'animate-[pk-shake_0.5s_ease-in-out]')} data-testid="brawl-pack-open" data-stage={stage}>
      <style>{`
        @keyframes pk-float { 0%,100% { transform: translateY(0) rotate(-2deg) } 50% { transform: translateY(-10px) rotate(2deg) } }
        @keyframes pk-wiggle { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-4deg) } 75% { transform: rotate(4deg) } }
        @keyframes pk-spin { to { transform: rotate(360deg) } }
        @keyframes pk-in { from { transform: translateY(60vh) scale(0.5) rotate(-12deg); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes pk-pulse { 0%,100% { opacity: .55; transform: scale(1) } 50% { opacity: 1; transform: scale(1.06) } }
        @keyframes pk-shake { 0%,100% { transform: none } 20% { transform: translate(-8px,4px) } 40% { transform: translate(7px,-5px) } 60% { transform: translate(-5px,-3px) } 80% { transform: translate(4px,5px) } }
        @keyframes pk-rise { from { transform: translateY(40px) scale(0.6); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
      {/* rays behind everything, in the colour of what's coming */}
      <div className="pointer-events-none absolute left-1/2 top-[42%] h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500"
        style={{ opacity: stage === 'sealed' ? 0.18 : stage === 'reveal' && shown && c.rarity !== 'common' ? 0.8 : 0.3, background: `repeating-conic-gradient(from 0deg, ${stage === 'reveal' && shown ? col : '#FFFFFF'}33 0deg 6deg, transparent 6deg 18deg)`, animation: 'pk-spin 24s linear infinite', maskImage: 'radial-gradient(circle, black 10%, transparent 55%)', WebkitMaskImage: 'radial-gradient(circle, black 10%, transparent 55%)' }} />

      <div className="absolute inset-x-0 top-[max(16px,env(safe-area-inset-top,0px))] text-center font-display text-2xl font-black drop-shadow" data-testid="brawl-pack-title">
        {stage === 'sealed' ? 'Tap the pack to tear it open!' : stage === 'reveal' ? `${cur + 1} / ${order.length}` : stage === 'summary' ? (order.some((x) => x.rarity === 'legendary') ? 'LEGENDARY PULL!' : 'Nice pull!') : ''}
      </div>

      {/* the pack */}
      {(stage === 'sealed' || stage === 'tear' || stage === 'deal') && (
        <button onClick={tear} className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2" style={{ width: PW, height: PH }} data-testid="brawl-pack-tear" aria-label="Tear the pack open">
          <div className="relative h-full w-full" style={{ animation: stage === 'sealed' ? 'pk-float 3s ease-in-out infinite' : undefined, transition: 'transform 0.7s cubic-bezier(.5,0,.8,.4), opacity 0.7s', transform: stage === 'deal' ? 'translateY(70vh) rotate(8deg)' : undefined, opacity: stage === 'deal' ? 0 : 1 }}>
            {stage === 'sealed' && best.rarity !== 'common' && <div className="absolute -inset-6 rounded-3xl blur-2xl" style={{ background: bestColor, animation: 'pk-pulse 1.6s ease-in-out infinite', opacity: 0.6 }} />}
            {/* the light pouring out of the opened top */}
            {stage !== 'sealed' && <div className="absolute left-1/2 top-[12%] h-[60vh] w-[140%] -translate-x-1/2 -translate-y-full" style={{ background: `linear-gradient(to top, ${bestColor}CC, #FFFFFF55 30%, transparent)`, clipPath: 'polygon(20% 100%, 80% 100%, 100% 0%, 0% 0%)', filter: 'blur(6px)' }} />}
            <PackCanvas w={PW} h={PH} glow={bestColor} clip={BODY_CLIP} />
            <PackCanvas w={PW} h={PH} glow={bestColor} clip={TOP_CLIP} style={{ transition: 'transform 0.8s cubic-bezier(.2,.8,.3,1), opacity 0.8s', transform: stage === 'sealed' ? 'none' : `translate(${PW * 0.7}px, -${PH * 0.9}px) rotate(38deg)`, opacity: stage === 'sealed' ? 1 : 0, transformOrigin: '90% 10%' }} />
            {stage === 'sealed' && <div className="pointer-events-none absolute inset-x-0 top-[17%] h-0.5 animate-pulse bg-white/70" />}
          </div>
          {/* the cards rising out */}
          {stage === 'deal' && order.map((x, i) => (
            <div key={i} className="absolute left-1/2 top-1/2" style={{ width: CW * 0.6, height: CW * 0.84, marginLeft: -CW * 0.3, marginTop: -CW * 0.42, animation: `pk-rise 0.5s ${i * 0.08}s both`, transform: `rotate(${(i - 2) * 3}deg)` }}>
              <CardView back width={Math.round(CW * 0.6)} animate={false} tilt={false} />
            </div>
          ))}
        </button>
      )}

      {/* revealing, one at a time */}
      {stage === 'reveal' && c && (
        <button onClick={reveal} className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2" style={{ width: CW, height: CW * 1.4, perspective: 1200 }} data-testid="brawl-pack-next" aria-label={shown ? 'Next card' : 'Turn the card over'}>
          {/* the rest of the pile underneath */}
          {order.slice(cur + 1).map((_, i) => <div key={i} className="absolute inset-0" style={{ transform: `translate(${(i + 1) * 4}px, ${(i + 1) * 5}px) rotate(${(i + 1) * 1.5}deg)`, zIndex: -1 - i }}><CardView back width={CW} animate={false} tilt={false} /></div>)}
          <div key={cur} className="relative h-full w-full" style={{ animation: 'pk-in 0.45s cubic-bezier(.2,.9,.3,1.2) both' }}>
            <div className="relative h-full w-full transition-transform [transform-style:preserve-3d]"
              style={{ transitionDuration: leaving ? '0.38s' : '0.6s', transform: leaving ? `translate(${(cur - 2) * 40}px, 55vh) scale(0.25) rotateY(180deg)` : shown ? 'rotateY(180deg)' : 'none', animation: !shown && c.rarity === 'legendary' ? 'pk-wiggle 0.35s ease-in-out infinite' : undefined }}>
              {/* face down: rare ones glow (a hint!) */}
              <div className="absolute inset-0 [backface-visibility:hidden]">
                {c.rarity !== 'common' && <div className="absolute -inset-3 rounded-2xl blur-xl" style={{ background: col, animation: 'pk-pulse 1s ease-in-out infinite' }} />}
                <CardView back width={CW} tilt={false} />
              </div>
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <div className="absolute -inset-4 rounded-3xl blur-2xl" style={{ background: col, opacity: c.rarity === 'common' ? 0.25 : 0.75 }} />
                {shown && <CardView id={c.id} width={CW} foil={c.foil} glow={col} tilt={false} testid="brawl-pack-face" />}
              </div>
            </div>
          </div>
          {shown && !leaving && (
            <div className="pointer-events-none absolute -bottom-14 left-1/2 grid -translate-x-1/2 justify-items-center gap-1 whitespace-nowrap" style={{ animation: 'pk-rise 0.3s 0.35s both' }}>
              <div className="flex gap-1.5">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-black uppercase" style={{ background: col, color: '#140A1E' }}>{RARITY_INFO[c.rarity].name}</span>
                {c.new && <span className="rounded-full bg-[#FFE14D] px-2.5 py-0.5 text-xs font-black text-black">NEW!</span>}
                {c.foil && <span className="rounded-full bg-gradient-to-r from-[#FF4FD8] to-[#22E3FF] px-2.5 py-0.5 text-xs font-black">GOLD FOIL</span>}
              </div>
              <span className="text-xs text-white/70">{CARD[c.id]?.name} · tap for the next card</span>
            </div>
          )}
          {!shown && <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-bold text-white/80">{c.rarity === 'legendary' ? '✨ Something legendary… tap!' : c.rarity === 'epic' ? 'Ooh, it’s glowing… tap!' : 'Tap to turn it over'}</div>}
        </button>
      )}

      {/* the whole pull */}
      {stage === 'summary' && (
        <div className="absolute inset-x-0 top-[12%] flex flex-wrap justify-center gap-2 px-3 sm:gap-3" data-testid="brawl-pack-summary">
          {order.map((x, i) => (
            <div key={i} className="relative" style={{ animation: `pk-in 0.5s ${i * 0.09}s both` }} data-testid={`brawl-pack-card-${i}`}>
              <div className="absolute -inset-2 rounded-2xl blur-lg" style={{ background: RARITY_INFO[x.rarity].color, opacity: x.rarity === 'common' ? 0.15 : 0.6 }} />
              <CardView id={x.id} width={Math.min(120, Math.floor((vw - 40) / 3))} foil={x.foil} glow={RARITY_INFO[x.rarity].color} />
              {x.new && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[#FFE14D] px-2 text-[10px] font-black text-black">NEW!</span>}
              {x.foil && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#FF4FD8] to-[#22E3FF] px-2 text-[10px] font-black text-white">GOLD FOIL</span>}
            </div>
          ))}
        </div>
      )}

      {/* the tray: what you've revealed so far */}
      {stage === 'reveal' && tray.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] flex justify-center gap-1.5">
          {tray.map((x, i) => <div key={i} style={{ animation: 'pk-rise 0.3s both' }}><CardView id={x.id} width={50} animate={false} tilt={false} glow={RARITY_INFO[x.rarity].color} /></div>)}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom,0px))] flex justify-center gap-2">
        {stage === 'reveal' && <Button variant="secondary" onClick={revealAll} data-testid="brawl-pack-all">Reveal all</Button>}
        {stage === 'summary' && <Button variant="primary" size="lg" onClick={onDone} data-testid="brawl-pack-done">Collect</Button>}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-white transition-opacity" style={{ opacity: flash, transitionDuration: flash ? '0ms' : '600ms' }} />
      <canvas ref={fxCv} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
