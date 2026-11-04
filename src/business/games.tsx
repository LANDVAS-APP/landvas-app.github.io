// The business minigames: quick (40-60 s), easy to pick up, all about making money.
//  2D: Stock Trader (buy low, sell high — the news tips you off before the price moves)
//      Haggle! (the price climbs; sell before the customer gets cross)
//      Lemon Pour (hold to pour, let go at the line)
//  3D: Delivery Dash (drive the van round town and drop parcels at the glowing doors)
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buzz } from '../native/native';
import { drawFloats, emoji, Hud, rng, three, useClock, type ArenaProps, type Float } from '../farm/games';

const dpr = () => Math.min(2, devicePixelRatio || 1);
const fit = (c: HTMLCanvasElement, g: CanvasRenderingContext2D) => {
  const b = c.getBoundingClientRect();
  if (c.width !== Math.round(b.width * dpr())) { c.width = Math.round(b.width * dpr()); c.height = Math.round(b.height * dpr()); }
  g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  return { W: b.width, H: b.height };
};

// ======================================================================================================
// Stock Trader (2D)
// ======================================================================================================
const NEWS_UP = ['🍋 Lemon harvest smashes records!', '📺 LMNADE goes viral on TV', '🏆 Best Drink of the Year award', '☀️ Heatwave forecast all week', '🤝 Big supermarket deal signed'];
const NEWS_DOWN = ['🌧️ Rainy week ahead', '🐛 Lemon bugs spotted in groves', '📉 Sugar prices spike', '🥤 Rival fizzy drink launches', '😬 CEO spills lemonade on live TV'];
export function StockTrader({ seed, seconds, onEnd, haptics }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const S = useRef({ cash: 1000, shares: 0, price: 50, trend: 0, nextTrend: 0, news: '' as string, newsUp: true, history: [] as number[], score: 0, trades: 0 });
  const [, setTick] = useState(0);
  const left = useClock(seconds, () => onEnd(score()));
  const worth = () => S.current.cash + S.current.shares * S.current.price;
  const score = () => Math.max(0, Math.min(300, Math.round((worth() - 1000) / 4)));
  useEffect(() => {
    const c = cv.current!; const g = c.getContext('2d')!; const r = rng(seed);
    const st = S.current; st.history = Array.from({ length: 60 }, () => 50);
    let raf = 0, last = performance.now(), acc = 0, tNews = 2;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
      // the news comes 1.5 s before the market moves
      tNews -= dt;
      if (tNews <= 0) {
        st.newsUp = r() < 0.55; st.news = (st.newsUp ? NEWS_UP : NEWS_DOWN)[Math.floor(r() * 5)];
        st.nextTrend = (st.newsUp ? 1 : -1) * (0.8 + r() * 1.4);
        setTimeout(() => { st.trend = st.nextTrend; }, 1500);
        tNews = 4 + r() * 3;
      }
      while (acc > 0.12) {
        acc -= 0.12;
        st.price = Math.max(5, st.price * (1 + st.trend * 0.012 + (r() - 0.5) * 0.02));
        st.history.push(st.price); if (st.history.length > 90) st.history.shift();
      }
      const { W, H } = fit(c, g);
      g.fillStyle = '#0F1424'; g.fillRect(0, 0, W, H);
      // the chart
      const top = H * 0.24, bot = H * 0.62, lo = Math.min(...st.history) * 0.95, hi = Math.max(...st.history) * 1.05;
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const y = top + ((bot - top) * i) / 4; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      const up = st.history[st.history.length - 1] >= st.history[st.history.length - 10];
      const grad = g.createLinearGradient(0, top, 0, bot); grad.addColorStop(0, up ? 'rgba(61,220,151,0.35)' : 'rgba(255,77,109,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.beginPath();
      st.history.forEach((p, i) => { const x = (i / (st.history.length - 1)) * W, y = bot - ((p - lo) / (hi - lo)) * (bot - top); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.strokeStyle = up ? '#3DDC97' : '#FF4D6D'; g.lineWidth = 3; g.stroke();
      g.lineTo(W, bot); g.lineTo(0, bot); g.closePath(); g.fillStyle = grad; g.fill();
      g.font = '900 30px ui-rounded, system-ui'; g.textAlign = 'right'; g.fillStyle = up ? '#3DDC97' : '#FF4D6D'; g.fillText(`$${st.price.toFixed(2)}`, W - 14, top - 14);
      g.font = '800 14px ui-rounded, system-ui'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('LMNADE', 14, top - 18);
    };
    raf = requestAnimationFrame(frame);
    const t = setInterval(() => setTick((x) => x + 1), 150);
    return () => { cancelAnimationFrame(raf); clearInterval(t); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = S.current;
  const buy = () => { const n = Math.floor(st.cash / st.price); if (n <= 0) return; st.shares += n; st.cash -= n * st.price; st.trades++; if (haptics) buzz('light'); setTick((x) => x + 1); };
  const sell = () => { if (!st.shares) return; st.cash += st.shares * st.price; st.shares = 0; st.trades++; if (haptics) buzz('success'); setTick((x) => x + 1); };
  const w = worth();
  return (
    <div className="fixed inset-0 select-none text-white" data-testid="biz-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <Hud score={score()} left={left} />
      <div className="pointer-events-none absolute inset-x-3 top-[calc(max(12px,env(safe-area-inset-top,0px))+56px)] rounded-2xl bg-white/10 px-3 py-2 text-center text-sm font-bold backdrop-blur" data-testid="st-news">{st.news ? <>📰 {st.news}</> : 'Watch the news — it tips you off before the price moves'}</div>
      <div className="absolute inset-x-0 bottom-0 grid gap-3 p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))]">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-white/10 p-2"><div className="text-white/60">Cash</div><b>${st.cash.toFixed(0)}</b></div>
          <div className="rounded-2xl bg-white/10 p-2"><div className="text-white/60">Shares</div><b>{st.shares}</b></div>
          <div className="rounded-2xl bg-white/10 p-2"><div className="text-white/60">Worth</div><b className={w >= 1000 ? 'text-[#3DDC97]' : 'text-[#FF4D6D]'}>${w.toFixed(0)}</b></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={buy} disabled={st.cash < st.price} data-testid="st-buy" className="rounded-2xl bg-[#2E9E4E] py-4 font-display text-xl font-black shadow-[0_5px_0_#1E6B34] active:translate-y-1 active:shadow-none disabled:opacity-40">BUY</button>
          <button onClick={sell} disabled={!st.shares} data-testid="st-sell" className="rounded-2xl bg-[#E8433A] py-4 font-display text-xl font-black shadow-[0_5px_0_#9A2620] active:translate-y-1 active:shadow-none disabled:opacity-40">SELL</button>
        </div>
      </div>
    </div>
  );
}

// ======================================================================================================
// Haggle! (2D)
// ======================================================================================================
const WARES = [{ e: '🧸', v: 20 }, { e: '🎸', v: 120 }, { e: '👟', v: 60 }, { e: '⌚', v: 150 }, { e: '🛹', v: 80 }, { e: '🎧', v: 90 }, { e: '🪴', v: 30 }, { e: '📷', v: 200 }, { e: '🧁', v: 8 }, { e: '🚲', v: 240 }];
const FACES = ['😃', '🙂', '😐', '😬', '😠'];
const BUYERS = ['🧑', '👩', '👨‍🦳', '👩‍🦰', '🧔', '👵', '🤠', '🧑‍💼'];
export function Haggle({ seed, seconds, onEnd, haptics }: ArenaProps) {
  const S = useRef({ score: 0, streak: 0 });
  const r = useRef(rng(seed));
  const left = useClock(seconds, () => onEnd(Math.min(300, S.current.score)));
  type Deal = { ware: (typeof WARES)[number]; buyer: string; max: number; price: number; speed: number; t0: number; done: null | 'sold' | 'walked'; got: number };
  const newDeal = (): Deal => { const ware = WARES[Math.floor(r.current() * WARES.length)]; return { ware, buyer: BUYERS[Math.floor(r.current() * BUYERS.length)], max: ware.v * (0.9 + r.current() * 0.9), price: ware.v * 0.5, speed: ware.v * (0.32 + r.current() * 0.2), t0: performance.now(), done: null, got: 0 }; };
  const [d, setD] = useState<Deal>(newDeal);
  const [score, setScore] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setD((x) => {
        if (x.done) return x;
        const price = x.ware.v * 0.5 + x.speed * ((performance.now() - x.t0) / 1000);
        if (price > x.max * 1.04) { S.current.streak = 0; setTimeout(() => setD(newDeal()), 900); return { ...x, price, done: 'walked' }; }
        return { ...x, price };
      });
      setTick((k) => k + 1);
    }, 50);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sell = () => {
    if (d.done) return;
    if (d.price > d.max) { S.current.streak = 0; setD({ ...d, done: 'walked' }); setTimeout(() => setD(newDeal()), 900); if (haptics) buzz('warning'); return; }
    S.current.streak++;
    const got = Math.round(1 + 16 * (d.price / d.max) ** 4 + Math.min(4, S.current.streak));
    S.current.score += got; setScore(S.current.score);
    setD({ ...d, done: 'sold', got }); if (haptics) buzz('success');
    setTimeout(() => setD(newDeal()), 800);
  };
  const mood = d.done === 'walked' ? '😤' : d.done === 'sold' ? '🤩' : FACES[Math.max(0, Math.min(4, Math.floor(((d.price / d.max) - 0.45) / 0.55 * 5)))];
  const frac = Math.min(1, d.price / (d.ware.v * 2));
  return (
    <div className="fixed inset-0 select-none overflow-hidden text-white" style={{ background: 'linear-gradient(#FFD9A0, #E8954A)' }} data-testid="biz-arena">
      <Hud score={score} left={left} extra={S.current.streak >= 2 ? <div className="rounded-full bg-[#FFC93D] px-3 py-1 text-sm font-black text-black">🔥 {S.current.streak} deals</div> : null} />
      <div className="absolute inset-x-0 top-[18%] grid justify-items-center gap-2">
        <div className="text-8xl" data-testid="hg-buyer">{d.buyer}</div>
        <div className="rounded-full bg-white px-4 py-1 text-4xl shadow-lg" data-testid="hg-mood">{mood}</div>
        <div className="rounded-2xl bg-black/30 px-3 py-1 text-sm font-bold">{d.done === 'walked' ? 'Too much! They walked off…' : d.done === 'sold' ? `Sold! +${d.got}` : 'Wants to buy:'}</div>
        <div className="text-7xl">{d.ware.e}</div>
      </div>
      <div className="absolute inset-x-6 bottom-[calc(max(16px,env(safe-area-inset-bottom,0px))+110px)]">
        <div className="mb-1 text-center font-display text-5xl font-black [text-shadow:0_3px_0_rgba(0,0,0,0.25)]" data-testid="hg-price">${Math.round(d.price)}</div>
        <div className="h-5 overflow-hidden rounded-full bg-black/25"><div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: 'linear-gradient(90deg,#3DDC97,#FFE14D,#FF4D6D)' }} /></div>
        <div className="mt-1 text-center text-xs font-bold text-black/60">The price climbs — watch their face, and sell before they get cross</div>
      </div>
      <div className="absolute inset-x-6 bottom-[max(16px,env(safe-area-inset-bottom,0px))]">
        <button onClick={sell} disabled={!!d.done} data-testid="hg-sell" className="w-full rounded-3xl bg-[#2E9E4E] py-5 font-display text-2xl font-black shadow-[0_6px_0_#1E6B34] active:translate-y-1 active:shadow-none disabled:opacity-50">🤝 DEAL!</button>
      </div>
    </div>
  );
}

// ======================================================================================================
// Lemon Pour (2D)
// ======================================================================================================
export function LemonPour({ seed, seconds, onEnd, haptics }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const S = useRef({ score: 0, combo: 0, pouring: false });
  const left = useClock(seconds, () => onEnd(Math.min(260, S.current.score)));
  useEffect(() => {
    const c = cv.current!; const g = c.getContext('2d')!; const r = rng(seed);
    type Cup = { x: number; h: number; w: number; line: number; fill: number; state: 'in' | 'pour' | 'out'; result: string };
    const floats: Float[] = [];
    let cup: Cup | null = null, raf = 0, last = performance.now(), t = 0, cups = 0;
    const newCup = (): Cup => ({ x: -0.3, h: 0.16 + r() * 0.12, w: 0.18 + r() * 0.08, line: 0.55 + r() * 0.35, fill: 0, state: 'in', result: '' });
    cup = newCup();
    const judge = () => {
      if (!cup || cup.state !== 'pour') return;
      const off = Math.abs(cup.fill - cup.line);
      let pts = 0, text = '', col = '#fff';
      if (cup.fill > 1) { text = 'Spilled!'; col = '#FF6B6B'; S.current.combo = 0; if (haptics) buzz('warning'); }
      else if (off < 0.04) { S.current.combo++; pts = 15 + Math.min(10, S.current.combo * 2); text = `Perfect! +${pts}`; col = '#FFE36B'; if (haptics) buzz('success'); }
      else if (off < 0.1) { S.current.combo++; pts = 8 + Math.min(6, S.current.combo); text = `Nice +${pts}`; if (haptics) buzz('light'); }
      else { S.current.combo = 0; pts = 2; text = cup.fill < cup.line ? 'A bit short +2' : 'Too full +2'; col = '#FFB3B3'; }
      S.current.score += pts; setScore(S.current.score); setCombo(S.current.combo);
      const b = c.getBoundingClientRect(); floats.push({ x: b.width / 2, y: b.height * 0.32, text, life: 1, color: col });
      cup.state = 'out'; cup.result = text;
    };
    const down = () => { S.current.pouring = true; };
    const up = () => { if (S.current.pouring) { S.current.pouring = false; judge(); } };
    c.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    const kd = (e: KeyboardEvent) => { if (e.key === ' ') down(); }, ku = (e: KeyboardEvent) => { if (e.key === ' ') up(); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const { W, H } = fit(c, g);
      const level = Math.min(1, t / seconds);
      // the stand: striped awning, the counter
      g.fillStyle = '#FFF4D6'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#FFE14D' : '#FFFFFF'; g.fillRect((i * W) / 12, 0, W / 12 + 1, H * 0.1); }
      g.fillStyle = '#E2B46B'; g.fillRect(0, H * 0.72, W, H * 0.28); g.fillStyle = '#C99A5B'; g.fillRect(0, H * 0.72, W, 8);
      // the jug
      const jx = W / 2, jy = H * 0.2;
      g.save(); g.translate(jx + 30, jy); g.rotate(S.current.pouring ? -0.9 : -0.2);
      g.fillStyle = 'rgba(255,245,157,0.9)'; g.strokeStyle = '#B9A14A'; g.lineWidth = 3; g.beginPath(); g.roundRect(-34, -40, 68, 90, 14); g.fill(); g.stroke(); g.restore();
      emoji(g, '🍋', jx + 30, jy - 52, 30);
      if (!cup) cup = newCup();
      const cw = cup.w * W, ch = cup.h * H * 1.6, cy = H * 0.72 - ch;
      const target = W / 2 - cw / 2 - 4;
      if (cup.state === 'in') { cup.x += dt * (1.6 + level); if (cup.x * W >= target) { cup.x = target / W; cup.state = 'pour'; } }
      if (cup.state === 'pour' && S.current.pouring) { cup.fill += dt * (0.55 + level * 0.6) / (cup.h * 4); if (cup.fill > 1.02) { S.current.pouring = false; judge(); } }
      if (cup.state === 'out') { cup.x += dt * 2.4; if (cup.x * W > W + 20) { cup = newCup(); cups++; } }
      const cx = cup.x * W;
      // the stream
      if (S.current.pouring && cup.state === 'pour') { g.fillStyle = '#FFEB6B'; g.fillRect(jx - 6, jy + 30, 10, cy + ch * (1 - Math.min(1, cup.fill)) - (jy + 30)); }
      // the cup
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.strokeStyle = '#8E97AD'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + cw, cy); g.lineTo(cx + cw * 0.88, cy + ch); g.lineTo(cx + cw * 0.12, cy + ch); g.closePath(); g.fill();
      const f = Math.min(1, cup.fill);
      g.save(); g.clip(); g.fillStyle = '#FFE14D'; g.fillRect(cx, cy + ch * (1 - f), cw, ch * f); g.restore(); g.stroke();
      if (cup.fill > 1) { g.fillStyle = '#FFE14D'; g.beginPath(); g.ellipse(cx + cw / 2, cy + ch + 6, cw * 0.8, 6, 0, 0, Math.PI * 2); g.fill(); }
      // the line to pour to
      if (cup.state !== 'out') { const ly = cy + ch * (1 - cup.line); g.setLineDash([6, 5]); g.strokeStyle = '#E8433A'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 10, ly); g.lineTo(cx + cw + 10, ly); g.stroke(); g.setLineDash([]); }
      drawFloats(g, floats, dt);
      void cups;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 select-none" data-testid="biz-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="lp-canvas" />
      <Hud score={score} left={left} extra={combo >= 3 ? <div className="rounded-full bg-[#FFC93D] px-3 py-1 text-sm font-black text-black">🔥 {combo} in a row</div> : null} />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm font-bold text-[#6B4A1E]">Hold to pour · let go at the red line</div>
    </div>
  );
}

// ======================================================================================================
// Delivery Dash (3D)
// ======================================================================================================
export function DeliveryDash({ seed, seconds, onEnd, haptics, reduce }: ArenaProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(0);
  const S = useRef({ score: 0, done: 0, joy: null as null | { x0: number; y0: number; x: number; y: number }, keys: { x: 0, z: 0 } });
  const left = useClock(seconds, () => onEnd(Math.min(300, S.current.score)));
  useEffect(() => {
    const c = cv.current!; const k = three(c); const r = rng(seed);
    const { scene, camera, mat, T } = k;
    scene.background = new THREE.Color('#9AD8FF'); scene.fog = new THREE.Fog('#9AD8FF', 40, 110);
    const BLOCK = 10, ROAD = 6, N = 5, SIZE = N * (BLOCK + ROAD);
    const ground = new THREE.Mesh(T(new THREE.PlaneGeometry(SIZE + 60, SIZE + 60)), mat('#3C4150')); ground.rotation.x = -Math.PI / 2; ground.position.set(SIZE / 2, 0, SIZE / 2); scene.add(ground);
    // city blocks with buildings and a door on each side
    type Block = { x0: number; z0: number; x1: number; z1: number };
    const blocks: Block[] = []; const doors: THREE.Vector3[] = [];
    const cols = ['#F2E6D0', '#E8C55A', '#FF8A3D', '#7BD957', '#4FA8FF', '#B76BFF', '#FF6FA8', '#ECE6DA'];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = i * (BLOCK + ROAD) + ROAD, z0 = j * (BLOCK + ROAD) + ROAD;
      blocks.push({ x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK });
      const walk = new THREE.Mesh(T(new THREE.BoxGeometry(BLOCK, 0.25, BLOCK)), mat('#D9D2C4')); walk.position.set(x0 + BLOCK / 2, 0.12, z0 + BLOCK / 2); scene.add(walk);
      for (let b = 0; b < 4; b++) {
        const h = 2 + r() * 4.5; const bx = x0 + 2.5 + (b % 2) * 5, bz = z0 + 2.5 + Math.floor(b / 2) * 5;
        const m = new THREE.Mesh(T(new THREE.BoxGeometry(4.2, h, 4.2)), mat(cols[Math.floor(r() * cols.length)])); m.position.set(bx, h / 2, bz); scene.add(m);
      }
      doors.push(new THREE.Vector3(x0 + BLOCK / 2, 0, z0 - 0.4), new THREE.Vector3(x0 + BLOCK / 2, 0, z0 + BLOCK + 0.4), new THREE.Vector3(x0 - 0.4, 0, z0 + BLOCK / 2), new THREE.Vector3(x0 + BLOCK + 0.4, 0, z0 + BLOCK / 2));
    }
    // the van
    const van = new THREE.Group();
    const part = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(T(new THREE.BoxGeometry(w, h, d)), m); o.position.set(x, y, z); van.add(o); };
    part(1.8, 1.6, 3.2, mat('#FFFFFF'), 0, 1.1, -0.2); part(1.7, 1.1, 1.0, mat('#FFE14D'), 0, 0.85, 1.8); part(1.6, 0.5, 0.1, mat('#9FE3FF', { roughness: 0.1 }), 0, 1.25, 2.32);
    const box = k.sprite('📦', 1.2); box.position.set(0, 2.4, -0.4); van.add(box);
    for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.1], [0.95, -1.1]]) { const w = new THREE.Mesh(T(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12)), mat('#2A2E38')); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); van.add(w); }
    van.position.set(2 * (BLOCK + ROAD) + ROAD / 2, 0, 2 * (BLOCK + ROAD) + ROAD / 2); scene.add(van);
    // the drop-off: a glowing ring and a beacon
    const ring = new THREE.Mesh(T(new THREE.TorusGeometry(1.6, 0.18, 8, 28)), mat('#FFE14D', { emissive: '#FFC93D', emissiveIntensity: 1 })); ring.rotation.x = Math.PI / 2; scene.add(ring);
    const beacon = new THREE.Mesh(T(new THREE.CylinderGeometry(0.4, 0.4, 14, 10, 1, true)), T(new THREE.MeshBasicMaterial({ color: '#FFE14D', transparent: true, opacity: 0.35 }))); scene.add(beacon);
    const house = k.sprite('🏠', 2); scene.add(house);
    const arrowG = T(new THREE.ConeGeometry(0.9, 2.4, 4)); arrowG.rotateX(Math.PI / 2); // points along +z, so lookAt aims it
    const arrow = new THREE.Mesh(arrowG, mat('#FF4D6D', { emissive: '#FF4D6D', emissiveIntensity: 0.6 })); scene.add(arrow);
    let target = new THREE.Vector3(); let tStart = 0;
    const pick = () => { let p: THREE.Vector3; do { p = doors[Math.floor(r() * doors.length)]; } while (p.distanceTo(van.position) < 14); target = p.clone(); ring.position.set(p.x, 0.3, p.z); beacon.position.set(p.x, 7, p.z); house.position.set(p.x, 3, p.z); tStart = t; };
    let t = 0; pick();
    // controls: drag like a joystick, or keys
    const pd = (e: PointerEvent) => { S.current.joy = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); };
    const pm = (e: PointerEvent) => { if (S.current.joy) { S.current.joy.x = e.clientX; S.current.joy.y = e.clientY; } };
    const pu = () => { S.current.joy = null; };
    const keys = (e: KeyboardEvent, on: boolean) => { const v = on ? 1 : 0; if (e.key === 'ArrowLeft' || e.key === 'a') S.current.keys.x = -v; if (e.key === 'ArrowRight' || e.key === 'd') S.current.keys.x = v; if (e.key === 'ArrowUp' || e.key === 'w') S.current.keys.z = -v; if (e.key === 'ArrowDown' || e.key === 's') S.current.keys.z = v; };
    const kd = (e: KeyboardEvent) => keys(e, true), ku = (e: KeyboardEvent) => keys(e, false);
    c.addEventListener('pointerdown', pd); c.addEventListener('pointermove', pm); c.addEventListener('pointerup', pu); c.addEventListener('pointercancel', pu); window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const pops: { s: THREE.Sprite; life: number }[] = [];
    let raf = 0, last = performance.now(), speed = 0;
    const want = new THREE.Vector3();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      want.set(0, 0, 0);
      const j = S.current.joy;
      if (j) { const dx = j.x - j.x0, dy = j.y - j.y0, l = Math.hypot(dx, dy); if (l > 10) want.set(dx / l, 0, dy / l).multiplyScalar(Math.min(1, l / 80)); }
      else if (S.current.keys.x || S.current.keys.z) want.set(S.current.keys.x, 0, S.current.keys.z).normalize();
      const sp = want.length() * 15;
      speed += (sp - speed) * Math.min(1, dt * 4);
      if (want.length() > 0.05) { const a = Math.atan2(want.x, want.z); let d = a - van.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; van.rotation.y += d * Math.min(1, dt * 7); }
      const nx = van.position.x + Math.sin(van.rotation.y) * speed * dt, nz = van.position.z + Math.cos(van.rotation.y) * speed * dt;
      // bump off the blocks (try each axis on its own so you slide along walls)
      const inside = (x: number, z: number) => blocks.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1);
      if (!inside(nx, van.position.z)) van.position.x = Math.max(0.5, Math.min(SIZE + ROAD - 0.5, nx)); else speed *= 0.7;
      if (!inside(van.position.x, nz)) van.position.z = Math.max(0.5, Math.min(SIZE + ROAD - 0.5, nz)); else speed *= 0.7;
      van.position.y = reduce ? 0 : Math.abs(Math.sin(t * 16)) * 0.04 * Math.min(1, speed / 5);
      // delivered?
      if (Math.hypot(van.position.x - target.x, van.position.z - target.z) < 2.6) {
        const quick = Math.max(0, 12 - (t - tStart));
        const pts = 15 + Math.round(quick * 1.5);
        S.current.score += pts; S.current.done++; setScore(S.current.score); setDone(S.current.done);
        const s = k.sprite(`+${pts}`, 2); s.position.set(target.x, 4, target.z); scene.add(s); pops.push({ s, life: 1.2 });
        if (haptics) buzz('success'); pick();
      }
      ring.rotation.z += dt * 2; ring.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
      // the arrow over the van points at the drop
      arrow.position.set(van.position.x + Math.sin(Math.atan2(target.x - van.position.x, target.z - van.position.z)) * 3, 3.6, van.position.z + Math.cos(Math.atan2(target.x - van.position.x, target.z - van.position.z)) * 3); arrow.lookAt(target.x, 3.6, target.z);
      for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= dt; p.s.position.y += dt * 2; if (p.life <= 0) { scene.remove(p.s); pops.splice(i, 1); } }
      const h = camera.aspect < 1 ? 46 : 34;
      camera.position.set(van.position.x, h, van.position.z + h * 0.28); camera.lookAt(van.position.x, 0, van.position.z);
      k.renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    if (import.meta.env.DEV || location.search.includes('e2e=1')) (window as any).__landvasVan = { get pos() { return [van.position.x, van.position.z]; }, get target() { return [target.x, target.z]; } };
    return () => { cancelAnimationFrame(raf); c.removeEventListener('pointerdown', pd); c.removeEventListener('pointermove', pm); c.removeEventListener('pointerup', pu); c.removeEventListener('pointercancel', pu); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); k.dispose(); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 select-none" data-testid="biz-arena">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" />
      <Hud score={score} left={left} extra={<div className="rounded-full bg-black/45 px-3 py-1 text-sm font-bold text-white backdrop-blur">📦 {done} delivered</div>} />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm font-bold text-white drop-shadow">Drag any way to drive · follow the red arrow to the glowing door</div>
    </div>
  );
}

export const BIZ_ARENAS: Record<string, (p: ArenaProps) => React.ReactElement> = { stock_trader: StockTrader, haggle: Haggle, lemon_pour: LemonPour, delivery_dash: DeliveryDash };
export const BIZ_HOW: Record<string, string> = {
  stock_trader: 'You start with $1,000. Watch the news ticker: good news means the price is about to rise, bad news means it’s about to fall. BUY before it goes up, SELL before it drops. Your score is the profit you make.',
  haggle: 'Customers want your things. The price climbs on its own — watch their face go from 😃 to 😠. Tap DEAL! as late as you dare: the closer to their limit, the more you make. Go too far and they walk off.',
  lemon_pour: 'Cups slide up to the stand. Hold anywhere to pour and let go when the lemonade reaches the red line. Perfect pours in a row build a combo. Don’t overflow!',
  delivery_dash: 'Drive the delivery van round town: drag in any direction to drive. Follow the red arrow to the glowing door to drop the parcel. Quicker deliveries score more.',
};
