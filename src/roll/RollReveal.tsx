// The plot roll, full screen, for both modes. A drop of ink falls onto a blank canvas and splashes; a 3D drum of
// rarities spins, its ink tinting the canvas as each name passes, then slows, teases the next one up, and clicks into
// place — the ink floods the canvas, a flash, rays, a particle storm, and the rarity slams in. Rarer pulls build up
// longer (the canvas charges and trembles) and hit harder.
//
// Smooth as butter: React renders this only 3 times (drop → spin → reveal). The drum, the ink tint and the charge run
// in one requestAnimationFrame loop that writes transforms and a CSS variable straight to the DOM; particles live on
// one canvas; nothing animates a blur, a filter or a layout property; and the app underneath is hidden while the roll
// covers it, so the map isn't composited behind it.
import { AnimatePresence, motion, useAnimationControls, useIsPresent } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RARITY_ORDER, rarityInfo, rarityTier, type RarityId } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { PLOT_TYPES } from '../map/plotStyle';
import { Fx } from './fx';
import { celebrate, celebrateDelay, type Overlay } from './celebrate';

export type RollResult = { rarity: RarityId; usd: number; type: string; first: boolean; shiny?: boolean; hot?: boolean; lucky?: boolean; guaranteed?: string | null;
  /** Luck's rerolls: every roll (the first is the plot's own); the player keeps one */ choices?: RarityId[] | null };
type Phase = 'drop' | 'spin' | 'pick' | 'reveal';

const INK = '#1B1240';
const BLOB = 'M50 8 C63 8 70 18 78 22 C90 28 94 40 92 52 C90 64 96 74 86 84 C76 94 62 90 50 92 C38 94 26 96 17 86 C8 76 10 64 8 52 C6 40 10 28 22 21 C31 15 38 8 50 8Z';
const N = RARITY_ORDER.length;
const H = 58; // one drum row
const SLOTS = 7;
const RAINBOW = '#FF3D9A, #FFB31F, #FFE14D, #3DDC97, #22E3FF, #8FA8FF, #A45CFF, #FF3D9A';

/** which of Luck's rolls is best (to suggest it) */
const bestIdx = (c: RarityId[]) => c.reduce((b, r, i) => (rank(r) > rank(c[b]) ? i : b), 0);
const rank = (r: RarityId) => { const i = rarityInfo(r); return r.startsWith('crown') ? 1e9 : i.ppm ? 1000 + 1e6 / i.ppm : i.sort; };
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

export function RollReveal(props: {
  result: RollResult | null;
  name?: string | null;
  testId: string;
  rarityTestId: string;
  onRevealed?(): void;
  /** Luck's rerolls: keep this one (the server makes it so) */
  onPick?(idx: number): Promise<unknown>;
  /** the player's Luck before this roll (for the meter) */
  luck?: number;
  onClose(): void;
  actions: ReactNode;
}) {
  return createPortal(<Roll {...props} />, document.body);
}

function Roll({ result, name, testId, rarityTestId, onRevealed, onClose, actions, onPick, luck = 0 }: Parameters<typeof RollReveal>[0]) {
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const present = useIsPresent();
  const presentRef = useRef(present);
  presentRef.current = present;
  const [phase, setPhase] = useState<Phase>(reduce ? 'spin' : 'drop');
  const rootRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const chargeRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<number | null>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rentRef = useRef<HTMLSpanElement>(null);
  const fx = useRef<Fx | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const skip = useRef(false);
  const shake = useAnimationControls();
  const choices = result?.choices && result.choices.length > 1 ? result.choices : null;
  const [rollIdx, setRollIdx] = useState(0);
  const [rolled, setRolled] = useState<RarityId[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [sel, setSel] = useState(0);
  const [picking, setPicking] = useState(false);
  const target = (i: number): RarityId => (resultRef.current?.choices && resultRef.current.choices.length > 1 ? resultRef.current.choices[i] : resultRef.current!.rarity);
  const final = (choices && picked != null ? choices[picked] : result?.rarity) ?? 'common';
  const info = rarityInfo(final);
  const tier = result ? rarityTier(final) : 0;
  const revealed = phase === 'reveal' && !!result;
  const t = result ? PLOT_TYPES[result.type as keyof typeof PLOT_TYPES] : null;
  const ultra = tier >= 5;

  // the particle canvas
  useEffect(() => {
    fx.current = new Fx(cvRef.current!);
    const r = () => fx.current?.resize();
    addEventListener('resize', r);
    return () => { removeEventListener('resize', r); fx.current?.destroy(); };
  }, []);

  // hide the app underneath while the roll covers it (no map compositing behind us) — and show it again the moment
  // the roll starts to leave, so it fades back in underneath
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    if (!present) { root.style.visibility = ''; return; }
    const tm = setTimeout(() => { root.style.visibility = 'hidden'; }, 260);
    return () => { clearTimeout(tm); root.style.visibility = ''; };
  }, [present]);

  // Escape closes
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  const center = () => {
    const r = cardRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } : { x: innerWidth / 2, y: innerHeight / 2, w: 300 };
  };

  // the drop: fall, then splash
  useEffect(() => {
    if (phase !== 'drop') return;
    const tm = setTimeout(() => {
      const c = center();
      fx.current?.burst({ x: c.x, y: c.y, colors: [INK, '#2A1F5C', '#3B2A7A'], count: 34, speed: 7.5, gravity: 0.34, up: 0.15, kind: 'drop', life: 0.8 });
      if (haptics) buzz('medium');
      setPhase('spin');
    }, 640);
    return () => clearTimeout(tm);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // the drum: one rAF loop, straight to the DOM
  useLayoutEffect(() => {
    if (phase !== 'spin') return;
    const root = rootRef.current!;
    const charge = chargeRef.current!;
    const t0 = performance.now();
    let pos = posRef.current ?? Math.random() * N, last = t0, raf = 0;
    let v = reduce ? 40 : 24; // rows per second, free spin
    let land: { p0: number; pT: number; ov: number; t0: number; D: number; settle: number } | null = null;
    let centerK = NaN, done = false, charged = false;
    const minSpin = reduce || rollIdx > 0 ? 0 : 900;
    if (rollIdx > 0) v = 30;
    // the ink: a splash that keeps spreading while the drum spins, and floods the whole canvas as it lands
    const ink = inkRef.current;
    let fill = 0.32, fill0 = 0.32;
    const setInk = (_sc: number, _t: number) => { void ink; };

    const begin = (now: number, quickIn: boolean) => {
      let quick = quickIn;
      const f = target(rollIdx);
      const tr = rarityTier(f);
      if (rollIdx > 0) quick = true; // (Luck's rerolls are quicker)
      const fi = RARITY_ORDER.indexOf(f);
      const dist = N + (quick ? 0 : tr * 3); // always through every rarity at least once
      let pT = Math.ceil((pos + dist - fi) / N) * N + fi;
      if (pT < pos + dist) pT += N;
      // a near miss: low rolls tease the next rarity up before clicking back; big ones crawl straight in
      const ov = reduce ? 0 : tr >= 3 ? 0.16 : 0.6;
      const D = reduce ? 0.45 : quick ? 0.9 : Math.min(3.6, Math.max(1.3, (3 * (pT + ov - pos)) / v) + tr * 0.18);
      land = { p0: pos, pT, ov, t0: now, D: D * 1000, settle: quick || reduce ? 120 : 420 };
      fill0 = fill;
    };

    const paint = () => {
      const base = Math.floor(pos);
      for (let i = 0; i < SLOTS; i++) {
        const el = slotRefs.current[i];
        if (!el) continue;
        const k = base - 3 + i, d = k - pos;
        if (el.dataset.k !== String(k)) {
          el.dataset.k = String(k);
          const r = rarityInfo(RARITY_ORDER[((k % N) + N) % N]);
          el.textContent = `${r.emoji ? r.emoji + ' ' : ''}${r.name}`;
          el.style.fontSize = `${Math.max(22, Math.min(34, Math.floor(420 / Math.max(6, el.textContent.length))))}px`;
          el.style.color = r.color;
        }
        const a = Math.abs(d);
        el.style.transform = `translate3d(-50%, ${d * H - H / 2}px, 0) rotateX(${-d * 26}deg) scale(${1 - Math.min(a, 3) * 0.1})`;
        el.style.opacity = String(Math.max(0, 1 - a * 0.34));
      }
      const ck = Math.round(pos);
      if (ck !== centerK) {
        centerK = ck;
        const r = rarityInfo(RARITY_ORDER[((ck % N) + N) % N]);
        root.style.setProperty('--c', r.color);
        root.style.setProperty('--g', r.glow);
        if (haptics && (land || ck % 3 === 0)) buzz('light');
      }
    };

    const frame = (now: number) => {
      if (!presentRef.current) return; // closed mid-spin: stop here
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!land) {
        pos += v * dt;
        fill = 0.32 + 0.5 * (1 - Math.exp(-(now - t0) / 1400));
        if (resultRef.current && (skip.current || now - t0 > minSpin)) begin(now, skip.current);
      } else {
        if (skip.current && land.D > 500) begin(now, true);
        const x = (now - land.t0) / land.D;
        fill = fill0 + (2.7 - fill0) * (x < 1 ? x * x * (3 - 2 * x) : 1);
        if (x < 1) pos = land.p0 + (land.pT + land.ov - land.p0) * easeOutCubic(x);
        else {
          const y = Math.min(1, (now - land.t0 - land.D) / land.settle);
          pos = land.pT + land.ov * (1 - easeOutBack(y));
          if (y >= 1 && !done) { done = true; pos = land.pT; }
        }
        // the build-up: Epic and up charge the canvas for the last stretch
        const tr = rarityTier(target(rollIdx));
        if (!charged && tr >= 2 && !reduce && x > 0.5) { charged = true; charge.classList.add('lv-rr-charge'); charge.style.setProperty('--amp', `${0.6 + tr * 0.45}px`); }
      }
      paint();
      posRef.current = pos;
      setInk(fill, now);
      if (done) {
        charge.classList.remove('lv-rr-charge');
        const fr = target(rollIdx), f = rarityInfo(fr);
        root.style.setProperty('--c', f.color); root.style.setProperty('--g', f.glow);
        const multi = resultRef.current?.choices && resultRef.current.choices.length > 1;
        if (multi) {
          // one of Luck's rolls lands: into the tray it goes, then the next — or, after the last, you choose
          const n = resultRef.current!.choices!.length;
          const c = center();
          if (!reduce) fx.current?.burst({ x: c.x, y: c.y, colors: [f.color, f.glow, '#fff'], count: 50 + rarityTier(fr) * 25, speed: 10, kind: 'spark' });
          if (haptics) buzz(rarityTier(fr) >= 3 ? 'heavy' : 'medium');
          setRolled((r) => [...r, fr]);
          setTimeout(() => { if (rollIdx < n - 1) setRollIdx(rollIdx + 1); else { setSel(bestIdx(resultRef.current!.choices!)); setPhase('pick'); } }, reduce ? 0 : 520);
          return;
        }
        setTimeout(() => setPhase('reveal'), reduce ? 0 : 110);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, rollIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // once it lands, the ink is the rarity's colour (set straight on the element, after every other write)
  useLayoutEffect(() => {
    if (!revealed || !rootRef.current) return;
    rootRef.current.style.setProperty('--c', info.color); rootRef.current.style.setProperty('--g', info.glow);
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  // the name always fits on one line (measured — fonts and emoji vary by phone)
  useLayoutEffect(() => {
    const el = titleRef.current, box = el?.parentElement?.parentElement;
    if (!el || !box) return;
    const max = Math.min(box.clientWidth, innerWidth - 24) - 8;
    if (el.offsetWidth > max) el.style.fontSize = `${Math.floor(titleSize * (max / el.offsetWidth))}px`;
  }, [phase === 'reveal']); // eslint-disable-line react-hooks/exhaustive-deps

  // the reveal: harder the rarer
  useEffect(() => {
    if (!revealed || !result || !presentRef.current) return;
    onRevealed?.();
    if (haptics) buzz(tier >= 3 ? 'heavy' : 'success');
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (!reduce) {
      const c = center();
      const colors = [info.color, info.glow, '#ffffff', t?.a ?? info.color, t?.b ?? info.glow];
      const counts = [80, 110, 150, 200, 260, 320];
      fx.current?.burst({ x: c.x, y: c.y, colors, count: counts[tier], speed: 11 + tier * 1.6, size: 1 + tier * 0.08 });
      if (tier >= 2) timers.push(setTimeout(() => fx.current?.burst({ x: c.x, y: c.y, colors, count: Math.round(counts[tier] * 0.45), speed: 7, kind: 'spark' }), 320));
      if (tier >= 3 || result.shiny) {
        // a glitter shower from the top
        const rain = (n: number) => fx.current?.burst({ x: Math.random() * innerWidth, y: -10, colors: ultra ? ['#FF3D9A', '#FFE14D', '#22E3FF', '#A45CFF', '#fff'] : [info.glow, '#fff', info.color], count: n, speed: 3, gravity: 0.12, up: -0.4, spread: Math.PI * 0.9, kind: 'glitter', life: 1.4 });
        for (let i = 0; i < (ultra ? 9 : 4); i++) timers.push(setTimeout(() => { rain(16); rain(16); }, 500 + i * 330));
      }
      if (ultra) timers.push(setTimeout(() => fx.current?.burst({ x: c.x, y: c.y, colors, count: 160, speed: 15, kind: 'spark' }), 900));
      if (tier >= 5) void shake.start({ x: [0, -20, 18, -14, 10, -6, 3, 0], y: [0, 9, -11, 7, -5, 2, 0], transition: { duration: 0.75 } });
      else if (tier >= 3) void shake.start({ x: [0, -12, 10, -7, 5, -2, 0], y: [0, 5, -6, 4, -2, 0], transition: { duration: 0.5 } });
      else if (tier >= 1) void shake.start({ x: [0, -5, 4, -2, 0], transition: { duration: 0.3 } });
      if (haptics && tier >= 4) timers.push(setTimeout(() => buzz('heavy'), 320));
      if (fx.current) setOverlay(celebrate(result.rarity, !!result.shiny, { fx: fx.current, c, later: (ms, f) => { timers.push(setTimeout(f, ms)); } }));
    }
    // the rent counts up
    let raf = 0;
    const t1 = performance.now() + (reduce ? 0 : 450);
    const tick = (now: number) => {
      const x = Math.max(0, Math.min(1, (now - t1) / 900));
      if (rentRef.current) rentRef.current.textContent = `+${formatRate((choices && picked != null ? rarityInfo(final).usd_per_second : result.usd) * easeOutCubic(x))}`;
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = `${info.emoji ? `${info.emoji} ` : ''}${info.name}${tier >= 3 ? '!' : ''}`;
  // (fit the name on one line: long ones like “Country Crown!” get a smaller size, never cut off)
  const titleSize = Math.max(22, Math.min(50, Math.floor(470 / Math.max(6, [...title].length))));
  const subtitle = !result ? '' : tier >= 3 ? `Incredible — a ${info.name} plot!` : final === 'common' ? 'A solid start' : `Nice — a ${info.name} plot`;
  const slots = useMemo(() => Array.from({ length: SLOTS }, (_, i) => i), []);

  return (
    <motion.div ref={rootRef} className="lv-rr fixed inset-0 z-[200] grid touch-none select-none place-items-center overflow-hidden" data-testid={testId} data-phase={phase}
      style={{ ['--c' as string]: revealed ? info.color : INK, ['--g' as string]: revealed ? info.glow : '#2A1F5C', pointerEvents: present ? undefined : 'none' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.22 } }} transition={{ duration: 0.22 }}
      onPointerDown={() => { if (phase !== 'reveal') skip.current = true; }}>
      {/* the room */}
      <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_42%,#2A1F5C_0%,#0B0820_62%,#05040F_100%)]" />
      <div className="lv-rr-room absolute inset-0" style={{ opacity: phase === 'drop' ? 0 : revealed ? 1 : 0.55 }} />
      {/* rays once it lands (rotating on the compositor) */}
      {revealed && !reduce && tier >= 1 && (
        <div className="lv-rr-rays pointer-events-none absolute left-1/2 top-[42%]"
          style={{ background: ultra ? `repeating-conic-gradient(from 0deg, ${RAINBOW.split(', ').map((c, i) => `${c}66 ${i * 45}deg ${i * 45 + 8}deg, transparent ${i * 45 + 8}deg ${i * 45 + 22.5}deg, ${c}44 ${i * 45 + 22.5}deg ${i * 45 + 30}deg, transparent ${i * 45 + 30}deg ${(i + 1) * 45}deg`).join(', ')})` : `repeating-conic-gradient(from 0deg, ${info.glow}${tier >= 3 ? '55' : '30'} 0deg 7deg, transparent 7deg 22deg)` }} />
      )}
      {/* the flash */}
      {revealed && !reduce && overlay && <div className={`lv-rr-ov lv-rr-ov-${overlay} pointer-events-none absolute inset-0`} />}
      {revealed && !reduce && <div className="lv-rr-flash pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, #fff ${tier >= 3 ? 30 : 10}%, ${info.glow}aa 45%, transparent 75%)` }} />}

      <motion.div animate={shake} className="relative flex w-full flex-col items-center px-6" style={{ willChange: 'transform' }}>
        {ultra && revealed && <motion.div className="mb-2 rounded-full px-4 py-1 font-display text-[13px] font-black tracking-[0.3em] text-[#1a0b2e]" style={{ background: `linear-gradient(90deg, ${RAINBOW})` }}
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 500, damping: 18 }}>ULTRA RARE</motion.div>}
        {/* the drum, then the rarity */}
        <div className="relative mb-5 h-[70px] w-full max-w-[360px]">
          {phase === 'drop' && <div className="absolute inset-0 grid place-items-center font-display text-[22px] font-black text-white/70">Rolling your plot…</div>}
          {phase === 'spin' && (
            <div className="lv-rr-drum absolute inset-x-0 -top-[70px] h-[210px]">
              <div className="lv-rr-window absolute inset-x-6 top-1/2 h-[58px] -translate-y-1/2 rounded-2xl" />
              {slots.map((i) => <div key={i} ref={(el) => { slotRefs.current[i] = el; }} className="lv-rr-slot absolute left-1/2 top-1/2 whitespace-nowrap font-display text-[34px] font-black uppercase leading-[58px]" />)}
            </div>
          )}
          {revealed && (
            <motion.div key="r" data-testid={rarityTestId} className="lv-rr-title absolute inset-0 grid place-items-center whitespace-nowrap font-display font-black uppercase leading-none"
              style={{ fontSize: titleSize, color: '#fff', ['--c' as string]: info.color, ['--g' as string]: info.glow }}
              initial={{ scale: 1.9, opacity: 0, y: -6 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
              <span ref={titleRef} className="inline-block px-1">{title}</span>
            </motion.div>
          )}
        </div>

        {/* the canvas */}
        <div ref={chargeRef} className="relative">
          {revealed && result?.shiny && !reduce && (
            <div className="pointer-events-none absolute -inset-8 z-10" data-testid="roll-shiny-fx">
              {Array.from({ length: 16 }, (_, i) => {
                const a = (i / 16) * Math.PI * 2, rr = 46 + (i % 3) * 6;
                return <span key={i} className="lv-twinkle absolute text-white" style={{ left: `${50 + Math.cos(a) * rr}%`, top: `${50 + Math.sin(a) * rr}%`, fontSize: 10 + (i % 4) * 5, animationDelay: `${0.9 + (i % 8) * 0.17}s` }}>✦</span>;
              })}
              <motion.div className="absolute -right-3 -top-4 grid place-items-center" initial={{ scale: 3, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 10 }} transition={{ delay: 0.75, type: 'spring', stiffness: 500, damping: 14 }}>
                <span className="lv-shiny-stamp rounded-xl px-3 py-1 font-display text-[22px] font-black text-[#1a0b2e]">✨ SHINY! ✨</span>
              </motion.div>
            </div>
          )}
          <motion.div ref={cardRef} className="relative aspect-square w-[min(72vw,310px)]" style={{ willChange: 'transform' }}
            initial={{ scale: 0.55, rotate: -6, opacity: 0 }} animate={{ scale: revealed ? [0.92, 1.06, 1] : 1, rotate: 0, opacity: 1 }}
            transition={revealed ? { duration: 0.5, times: [0, 0.45, 1] } : { type: 'spring', stiffness: 260, damping: 19 }}>
            <div className="lv-rr-glow absolute -inset-12 rounded-full" style={{ opacity: phase === 'drop' ? 0 : revealed ? 1 : 0.6 }} />
            <div className="lv-rr-card absolute inset-0 overflow-hidden rounded-[28px] border-[6px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]" style={{ borderColor: revealed ? info.color : '#E9DFC8' }}>
              <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg,#6B4A22 0 1px,transparent 1px 6px),repeating-linear-gradient(90deg,#6B4A22 0 1px,transparent 1px 6px)' }} />
              {/* the ink */}
              {phase !== 'drop' && <InkSplash key={rollIdx} still={reduce} />}
              {/* the plot rises out of the ink */}
              {revealed && result && (
                <motion.div className="absolute inset-[14%]" data-testid={testId === 'ink-roll' ? 'roll-plot' : 'claim-plot-art'}
                  initial={{ opacity: 0, scale: 0.3, rotate: -14, y: 24 }} animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 330, damping: 15 }}>
                  <BasePlotArt rarity={final} shiny={result.shiny} size="100%" />
                </motion.div>
              )}
              {revealed && (result?.shiny || tier >= 3) && !reduce && <div className="lv-rr-sheen pointer-events-none absolute inset-0" />}
              {revealed && result?.shiny && !reduce && <div className="lv-rr-foil pointer-events-none absolute inset-0" />}
            </div>
            {/* the falling drop */}
            {phase === 'drop' && (
              <div className="lv-rr-drop absolute left-1/2 top-1/2 h-[72px] w-[48px]">
                <svg viewBox="0 0 40 60" className="h-full w-full"><path d="M20 2 C26 16 36 28 36 40 A16 16 0 0 1 4 40 C4 28 14 16 20 2Z" fill={INK} /><ellipse cx="14" cy="38" rx="4" ry="7" fill="#fff" opacity="0.35" /></svg>
              </div>
            )}
            {/* shockwaves: the splash, then the reveal */}
            {phase !== 'drop' && !reduce && <span key={revealed ? 'r' : 's'} className={revealed ? 'lv-rr-wave lv-rr-wave-big' : 'lv-rr-wave'} />}
            {revealed && !reduce && tier >= 2 && <span className="lv-rr-wave lv-rr-wave-big" style={{ animationDelay: '0.18s' }} />}
          </motion.div>
        </div>

        {/* what you got */}
        <div className="mt-7 min-h-[170px] w-full max-w-[340px]">
          {revealed && result && (
            <motion.div className="grid gap-2.5 text-center" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : celebrateDelay(final) / 1000, duration: 0.3 }}>
              <div className="text-[15px] font-extrabold" style={{ color: info.glow }}>{subtitle}</div>
              {(result.shiny || result.hot || result.lucky) && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {result.shiny && <motion.span initial={{ scale: 0 }} animate={{ scale: [0, 1.25, 1] }} transition={{ delay: 0.55 }} className="rounded-full bg-[linear-gradient(90deg,#FF7AE0,#FFE14D,#22E3FF)] px-3 py-1 font-display text-[15px] font-black text-[#1a0b2e] shadow-[0_0_24px_#fff8]" data-testid={testId === 'ink-roll' ? 'roll-shiny' : 'claim-shiny'}>✨ SHINY · ×5 rent ✨</motion.span>}
                  {result.lucky && <span className="rounded-full bg-[#3DDC97]/20 px-3 py-1 text-[12px] font-extrabold text-[#8CF5C6]" data-testid="roll-lucky">🍀 Lucky roll</span>}
                  {result.hot && <span className="rounded-full bg-[#FF6A1F]/25 px-3 py-1 text-[12px] font-extrabold text-[#FFB27A]">🔥 Hot Zone roll</span>}
                </div>
              )}
              {info.ability && <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[13px] font-semibold leading-snug" style={{ color: info.glow }} data-testid="roll-ability">{info.ability}</div>}
              {name && <div className="truncate font-display text-lg font-semibold text-white">“{name}”</div>}
              <div className="text-sm font-bold text-white/80">
                {result.guaranteed ? `Guaranteed ${rarityInfo(result.guaranteed).name}+ · ` : result.first ? 'Your first plot · ' : ''}<span style={{ color: t?.a }}>{t?.name ?? 'A'} plot</span> · <span ref={rentRef} className="text-[#3DDC97] tnum">+{formatRate(0)}</span>
              </div>
              <div className="mt-1">{actions}</div>
            </motion.div>
          )}
        </div>
      </motion.div>
        {/* Luck's rerolls: the meter and the rolls so far */}
        {choices && phase !== 'reveal' && phase !== 'pick' && (
          <div className="pointer-events-none absolute inset-x-0 top-[max(18px,env(safe-area-inset-top,0px))] grid justify-items-center gap-1.5" data-testid="roll-luck">
            <div className="flex items-center gap-2 rounded-full bg-[#3DDC97]/15 px-3 py-1 text-[13px] font-black text-[#8CF5C6]">
              🍀 {rollIdx === 0 ? `Luck ${luck}: ${choices.length} rolls!` : `Lucky reroll ${rollIdx} of ${choices.length - 1}`}
              <span className="flex gap-0.5">{choices.slice(1).map((_, i) => <motion.span key={i} className="h-2 w-4 rounded-full" animate={{ backgroundColor: i < rollIdx ? 'rgba(255,255,255,0.15)' : '#3DDC97', scale: i === rollIdx - 1 ? [1, 1.5, 1] : 1 }} transition={{ duration: 0.4 }} />)}</span>
            </div>
          </div>
        )}
      {/* the rolls Luck gave you, as they land */}
      {choices && rolled.length > 0 && phase !== 'pick' && phase !== 'reveal' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(18px,env(safe-area-inset-bottom,0px))] flex justify-center gap-2 px-4" data-testid="roll-tray">
          {rolled.map((r, i) => (
            <motion.div key={i} className="grid justify-items-center gap-0.5" initial={{ y: -260, scale: 1.8, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <BasePlotArt rarity={r} size={44} />
              <span className="text-[9px] font-black uppercase" style={{ color: rarityInfo(r).color }}>{rarityInfo(r).name}</span>
            </motion.div>
          ))}
        </div>
      )}
      {/* choose the one you keep */}
      <AnimatePresence>
        {phase === 'pick' && choices && (
          <motion.div className="absolute inset-0 z-10 grid place-items-center bg-[#05040F]/95 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="roll-pick">
            <div className="grid w-full max-w-[380px] gap-4 text-center">
              <div>
                <div className="font-display text-[26px] font-black text-white">🍀 Pick your plot</div>
                <div className="text-[13px] font-semibold text-white/60">Luck rolled it {choices.length} times — keep the one you want.</div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {choices.map((r, i) => {
                  const ri = rarityInfo(r), on = sel === i;
                  return (
                    <motion.button key={i} onClick={() => { setSel(i); if (haptics) buzz('light'); }} data-testid={`roll-choice-${i}`}
                      className="relative grid justify-items-center gap-1 rounded-2xl border-2 bg-white/[0.05] px-1 py-2.5"
                      style={{ borderColor: on ? ri.color : 'rgba(255,255,255,0.1)', boxShadow: on ? `0 0 24px ${ri.color}88` : undefined }}
                      initial={{ y: 30, opacity: 0, rotateY: 90 }} animate={{ y: 0, opacity: 1, rotateY: 0, scale: on ? 1.06 : 1 }} transition={{ delay: i * 0.07, type: 'spring', stiffness: 360, damping: 22 }}>
                      <BasePlotArt rarity={r} size={58} />
                      <span className="max-w-full truncate px-1 text-[11px] font-black uppercase" style={{ color: ri.color }}>{ri.emoji ? `${ri.emoji} ` : ''}{ri.name}</span>
                      <span className="text-[9px] font-bold text-white/50 tnum">{formatRate(ri.usd_per_second)}</span>
                      {i === bestIdx(choices) && <span className="absolute -right-1 -top-2 rounded-full bg-[#FFE14D] px-1.5 text-[9px] font-black text-[#1a0b2e]">BEST</span>}
                    </motion.button>
                  );
                })}
              </div>
              <button disabled={picking} onClick={async () => {
                setPicking(true);
                try { await onPick?.(sel); } catch { /* the server keeps the best */ }
                setPicked(sel); setPicking(false); setPhase('reveal');
              }} className="h-[54px] rounded-2xl bg-[linear-gradient(135deg,#3DDC97,#1FA971)] font-display text-[17px] font-black text-white shadow-[0_5px_0_#147a52] disabled:opacity-60" data-testid="roll-keep">
                Keep the {rarityInfo(choices[sel]).name}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* particles on top of everything */}
      <canvas ref={cvRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
    </motion.div>
  );
}

/** a smooth closed blob through n random points round (cx, cy) */
function blobPath(rnd: () => number, cx: number, cy: number, r: number, n = 12, wob = 0.35) {
  const pts = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + rnd() * 0.3, rr = r * (1 - wob / 2 + rnd() * wob); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/** The ink hitting the canvas: a different splash every time — a pool that bursts out, splatters flung round it,
 *  tendrils running out to them, and blooms that soak across until the whole canvas is ink. All in well under a
 *  second, all transforms (no layout, no filters). */
function InkSplash({ still }: { still: boolean }) {
  const shapes = useMemo(() => {
    let seed = Math.floor(Math.random() * 1e9);
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const cx = 44 + rnd() * 12, cy = 44 + rnd() * 12;
    const splats = Array.from({ length: 8 + Math.floor(rnd() * 4) }, () => {
      const a = rnd() * Math.PI * 2, dist = 20 + rnd() * 26;
      return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: 3 + rnd() * 9, d: 0.08 + rnd() * 0.22 };
    });
    const blooms = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2 + rnd(), dist = 18 + rnd() * 18;
      return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: 10 + rnd() * 8, d: 0.16 + rnd() * 0.2 };
    });
    return {
      main: blobPath(rnd, cx, cy, 20, 14, 0.4), cx, cy,
      splats: splats.map((p) => ({ ...p, path: blobPath(rnd, p.x, p.y, p.r, 8, 0.5) })),
      tendrils: splats.slice(0, 6).map((p) => ({ d: `M${cx} ${cy} Q${(cx + p.x) / 2 + (rnd() - 0.5) * 10} ${(cy + p.y) / 2 + (rnd() - 0.5) * 10} ${p.x} ${p.y}`, w: 2 + rnd() * 3, dl: p.d * 0.6 })),
      blooms: blooms.map((p) => ({ ...p, path: blobPath(rnd, p.x, p.y, p.r, 10, 0.45) })),
    };
  }, []);
  const g = (s: number, d: number, dl: number) => ({ ['--s' as string]: s, ['--d' as string]: `${d}s`, ['--dl' as string]: `${dl}s` }) as React.CSSProperties;
  return (
    <svg viewBox="0 0 100 100" className={cn('absolute inset-0 h-full w-full overflow-visible', still && 'lv-ink-still')} aria-hidden>
      <defs><radialGradient id="rr-shine" cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.45" stopColor="#fff" stopOpacity="0" /></radialGradient></defs>
      {shapes.tendrils.map((t, i) => <path key={`t${i}`} d={t.d} className="lv-rr-ink-stroke lv-ink-draw" strokeWidth={t.w} style={{ ['--dl' as string]: `${t.dl}s` } as React.CSSProperties} pathLength={1} />)}
      {shapes.splats.map((p, i) => <path key={`s${i}`} d={p.path} className="lv-rr-ink lv-ink-grow" style={g(1.25, 0.32, p.d)} />)}
      {shapes.blooms.map((p, i) => <path key={`b${i}`} d={p.path} className="lv-rr-ink lv-ink-grow" style={g(2.6, 0.55, p.d)} />)}
      <path d={shapes.main} className="lv-rr-ink lv-ink-grow" style={g(3.6, 0.7, 0)} />
      <circle cx={shapes.cx} cy={shapes.cy} r="40" fill="url(#rr-shine)" className="lv-ink-grow" style={g(1.6, 0.7, 0.1)} />
    </svg>
  );
}
