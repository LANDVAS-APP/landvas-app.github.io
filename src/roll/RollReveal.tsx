// The plot roll, full screen, for both modes. A drop of ink falls onto a blank canvas and splashes; a 3D drum of
// rarities spins, its ink tinting the canvas as each name passes, then slows, teases the next one up, and clicks into
// place — the roll's minigame drops onto the foot of the card, the ink floods it, a flash, rays, a particle storm,
// and the rarity slams in. Rarer pulls build up longer (the canvas charges and trembles) and hit harder. With Luck,
// every reroll lands with its own minigame, and you keep the one you want.
//
// Smooth as butter: React renders only when the phase changes. The drum, the ink tint and the charge run in one
// requestAnimationFrame loop that writes transforms and a CSS variable straight to the DOM; particles live on one
// canvas; nothing animates a blur, a filter or a layout property; and the app underneath is hidden while the roll
// covers it, so the map isn't composited behind it.
//
// The roll is run by its director (src/roll/stage), which writes down every moment of it — the drum's spin and
// landings, each splash, every particle burst — so "Clip it" replays the very roll you saw, and every roll is kept on
// this phone to clip later (the Clips page).
import { rerollSpeed, useRerollSpeed } from './prefs';
import { ClipButton, clippable, clipping } from './clip';
import { useOnboardedMe } from '../lib/queries';
import { AnimatePresence, motion, useAnimationControls, useIsPresent } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { uiSound } from '../native/uiSound';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RARITY_ORDER, rarityInfo, rarityTier, type RarityId } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { PLOT_TYPES } from '../map/plotStyle';
import { celebrateDelay, type Overlay } from './celebrate';
import { EnchantTransform } from '../enchant/EnchantTransform';
import { Sigil } from '../enchant/Sigil';
import { kindInfo } from '../enchant/kinds';
import { useNavigate } from 'react-router-dom';
import { Director, bestIdx, type Phase } from './stage/director';
import { reelPos, type EnchantBrief } from './stage/trace';
import { layoutFor, type Layout } from './stage/layout';
import { drawParticles } from './stage/particles';
import { inkSplash } from './stage/splash';
import { GAME_EMOJI } from './stage/assets';
import { shade } from './stage/math';
import { saveRoll } from '../clips/history';
import { framePacer } from '../lib/gfx';

export type { EnchantBrief };
export type RollResult = { rarity: RarityId; usd: number; type: string; first: boolean; shiny?: boolean; hot?: boolean; lucky?: boolean; guaranteed?: string | null;
  /** Luck's rerolls: every roll (the first is the plot's own); the player keeps one */ choices?: RarityId[] | null;
  /** each roll's minigame type and shine */ choiceTypes?: string[] | null; choiceShiny?: boolean[] | null;
  /** the roll came out Enchanted: the enchantment born on it */ enchant?: EnchantBrief | null };

const INK = '#1B1240';
const N = RARITY_ORDER.length;
const H = 58; // one drum row
const SLOTS = 7;
const RAINBOW = '#FF3D9A, #FFB31F, #FFE14D, #3DDC97, #22E3FF, #8FA8FF, #A45CFF, #FF3D9A';
const mod = (n: number, m: number) => ((n % m) + m) % m;

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
  const me = useOnboardedMe();
  const nav = useNavigate();
  const [speed, setSpeed] = useRerollSpeed();
  const rootRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const rentRef = useRef<HTMLSpanElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shake = useAnimationControls();
  const [phase, setPhase] = useState<Phase>(reduce ? 'spin' : 'drop');
  const [rollIdx, setRollIdx] = useState(0);
  // the roll whose minigame tag is showing (it lands, then the tag drops on)
  const [tagged, setTagged] = useState(-1);
  const [rolled, setRolled] = useState<RarityId[]>([]);
  const [sel, setSel] = useState(0);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const choices = result?.choices && result.choices.length > 1 ? result.choices : null;
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;
  const layRef = useRef<Layout>(layoutFor(innerWidth, innerHeight));
  const dirRef = useRef<Director | null>(null);
  if (!dirRef.current) {
    dirRef.current = new Director(layRef.current, {
      reduce, quickRerolls: () => rerollSpeed() === 'quick', user: me ? { username: me.profile.username, accent: me.profile.accent_color ?? undefined } : undefined,
      hooks: {
        phase: (p) => setPhase(p),
        step: (i) => setRollIdx(i),
        lock: (i) => setTagged(i),
        landed: (_i, r) => setRolled((x) => [...x, r]),
        pick: (b) => setSel(b),
        reveal: () => { if (presentRef.current) onRevealedRef.current?.(); },
        // (the Enchanted transformation buzzes for itself)
        buzz: (k) => { if (useUi.getState().settings.haptics && dirRef.current?.phase !== 'enchant') buzz(k); },
        sound: (k, n) => uiSound.roll(k, n),
      },
    });
  }
  const d = dirRef.current;

  // the result (the server's answer can arrive mid-spin)
  useEffect(() => { if (result) d.setResult({ ...result, name }); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  /** the ink's colour (and its glow): on the room, and straight on the card and its halo — not only inherited through
   *  the card, whose animations can leave it holding an old colour (Chromium keeps an animating element's style) */
  const tint = (c: string, g: string) => {
    for (const el of [rootRef.current, inkRef.current, glowRef.current]) { el?.style.setProperty('--c', c); el?.style.setProperty('--g', g); }
  };
  /** where the card is on screen (particles burst from it, in the roll and in its clip) */
  const measure = (): Layout => {
    const base = layoutFor(innerWidth, innerHeight), r = boxRef.current?.getBoundingClientRect();
    if (!r || !r.width) return base;
    const u = r.width;
    return { ...base, u, s: u / 310, cx: r.left + u / 2, cy: r.top + r.height / 2, cardTop: r.top, ry: r.top - 55, panelTop: r.bottom + 28 };
  };
  const center = () => { const L = layRef.current; return { x: L.cx, y: L.cy, w: L.u }; };
  // (the details coming in under the card move it up: keep up with it)
  useLayoutEffect(() => { layRef.current = measure(); d.setLayout(layRef.current); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // one loop: the director moves the roll on; the drum, the ink's colour and the charge go straight to the DOM; the
  // particles onto their canvas
  useLayoutEffect(() => {
    const box = boxRef.current!, cv = cvRef.current!, g = cv.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = () => {
      cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
      layRef.current = measure(); d.setLayout(layRef.current);
    };
    size();
    addEventListener('resize', size);
    const t0 = performance.now();
    // (at most 60 frames a second, whatever the screen's refresh rate)
    const pace = framePacer();
    let raf = 0, centerK = NaN, charged = false, drawn = false;
    const paint = (pos: number) => {
      const base = Math.floor(pos);
      for (let i = 0; i < SLOTS; i++) {
        const el = slotRefs.current[i];
        if (!el) continue;
        const k = base - 3 + i, dd = k - pos;
        if (el.dataset.k !== String(k)) {
          el.dataset.k = String(k);
          const r = rarityInfo(RARITY_ORDER[mod(k, N)]);
          el.textContent = `${r.emoji ? r.emoji + ' ' : ''}${r.name}`;
          el.style.fontSize = `${Math.max(22, Math.min(34, Math.floor(420 / Math.max(6, el.textContent.length))))}px`;
          el.style.color = r.color;
        }
        const a = Math.abs(dd);
        el.style.transform = `translate3d(-50%, ${dd * H - H / 2}px, 0) rotateX(${-dd * 26}deg) scale(${1 - Math.min(a, 3) * 0.1})`;
        el.style.opacity = String(Math.max(0, 1 - a * 0.34));
      }
      const ck = Math.round(pos);
      if (ck !== centerK) {
        centerK = ck;
        const r = rarityInfo(RARITY_ORDER[mod(ck, N)]);
        tint(r.color, r.glow);
      }
    };
    const frame = (now: number) => {
      if (!presentRef.current) return; // closing: the last frame fades out as it is
      // (a clip being cut on top: rest, so it gets the whole phone)
      if (clipping.open > 0 || !pace.ready(now)) { raf = requestAnimationFrame(frame); return; }
      const t = now - t0;
      d.tick(t);
      const tr = d.trace, s = tr.steps[tr.steps.length - 1];
      if (d.phase === 'spin' && s?.rReel) {
        paint(reelPos(s.rReel, t));
        // the build-up: Epic and up tremble the canvas for the last stretch (the clip trembles the same way)
        const ch = s.charge != null && s.rLock == null && !reduce;
        if (ch) { const amp = 0.6 + rarityTier(s.rarity) * 0.45, k = Math.floor(t / 17.5) % 4; box.style.transform = `translate3d(${k === 0 ? amp : k === 2 ? -amp : 0}px, ${k === 1 ? amp : k === 3 ? -amp : 0}px, 0)`; }
        else if (charged) box.style.transform = '';
        charged = ch;
      } else if (charged) { box.style.transform = ''; charged = false; }
      // the particles
      let live = false, ahead = false;
      for (const b of tr.bursts) { const end = b.t + 1720 * b.life + 60; if (end > t) { ahead = true; if (t >= b.t) { live = true; break; } } }
      if (live || drawn) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
        if (live) drawParticles(g, layRef.current, tr.bursts, t, tr.u0);
        drawn = live;
      }
      // (all over: rest until the roll closes)
      if (!d.busy && !ahead) return;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const revealed = phase === 'reveal' && !!result;
  const ench = result?.enchant ?? null;
  const ek = ench ? kindInfo(ench.kind) : null;
  const final: RarityId = (choices && picked != null ? choices[picked] : result?.rarity) ?? 'common';
  const info = rarityInfo(final);
  const tier = result ? rarityTier(final) : 0;
  const keptIdx = choices && picked != null ? picked : null;
  const finalType = (keptIdx != null ? result?.choiceTypes?.[keptIdx] : null) ?? result?.type;
  const finalShiny = keptIdx != null && result?.choiceShiny ? !!result.choiceShiny[keptIdx] : !!result?.shiny;
  const t = result ? PLOT_TYPES[finalType as keyof typeof PLOT_TYPES] : null;
  const ultra = tier >= 5 || !!ench;
  const title = ek ? `${ek.emoji} ${ek.name}!` : `${info.emoji ? `${info.emoji} ` : ''}${info.name}${tier >= 3 ? '!' : ''}`;
  // (fit the name on one line: long ones like “Country Crown!” get a smaller size, never cut off)
  const titleSize = Math.max(22, Math.min(50, Math.floor(470 / Math.max(6, [...title].length))));
  const subtitle = !result ? '' : ek ? ek.tagline : tier >= 3 ? `Incredible — a ${info.name} plot!` : final === 'common' ? 'A solid start' : `Nice — a ${info.name} plot`;
  const slots = useMemo(() => Array.from({ length: SLOTS }, (_, i) => i), []);
  // the minigame's tag: each roll's own, as it lands (a single roll keeps its tag into the reveal; after Luck's
  // pick, or an Enchanted roll, the kept plot's comes in again)
  const tagType = revealed ? finalType : phase === 'spin' && tagged === rollIdx ? ((choices ? result?.choiceTypes?.[rollIdx] : null) ?? result?.type) : null;
  const tagKey = revealed && (choices || ench || tagged < 0) ? 'final' : `r${rollIdx}`;
  const tagTy = tagType ? PLOT_TYPES[tagType as keyof typeof PLOT_TYPES] : null;

  // once it lands, the ink is the rarity's colour (set straight on the element, after every other write)
  useLayoutEffect(() => {
    if (revealed) tint(ench ? '#B26BFF' : info.color, ench ? '#F0DBFF' : info.glow);
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  // the name always fits on one line (measured — fonts and emoji vary by phone)
  useLayoutEffect(() => {
    const el = titleRef.current, box = el?.parentElement?.parentElement;
    if (!el || !box) return;
    const max = Math.min(box.clientWidth, innerWidth - 24) - 8;
    if (el.offsetWidth > max) el.style.fontSize = `${Math.floor(titleSize * (max / el.offsetWidth))}px`;
  }, [phase === 'reveal']); // eslint-disable-line react-hooks/exhaustive-deps

  // the reveal: harder the rarer (the director has set off the particles; the screen shakes as it wrote down)
  useEffect(() => {
    if (!revealed || !result || !presentRef.current) return;
    if (!reduce) {
      const k = d.trace.shakes[d.trace.shakes.length - 1]?.k;
      if (k === 3) void shake.start({ x: [0, -20, 18, -14, 10, -6, 3, 0], y: [0, 9, -11, 7, -5, 2, 0], transition: { duration: 0.75 } });
      else if (k === 2) void shake.start({ x: [0, -12, 10, -7, 5, -2, 0], y: [0, 5, -6, 4, -2, 0], transition: { duration: 0.5 } });
      else if (k === 1) void shake.start({ x: [0, -5, 4, -2, 0], transition: { duration: 0.3 } });
      setOverlay(d.trace.overlay?.kind ?? null);
    }
    // the rent counts up
    let raf = 0;
    const t1 = performance.now() + (reduce ? 0 : 450);
    const tick = (now: number) => {
      const x = Math.max(0, Math.min(1, (now - t1) / 900));
      if (rentRef.current) rentRef.current.textContent = `+${formatRate((choices && picked != null ? rarityInfo(final).usd_per_second : result.usd) * (1 - (1 - x) ** 3))}`;
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  // every roll is kept on this phone, to clip later
  useEffect(() => {
    if (phase !== 'reveal') return;
    const tm = setTimeout(() => saveRoll(d.trace), 400);
    return () => clearTimeout(tm);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div ref={rootRef} className="lv-rr fixed inset-0 z-[200] grid touch-none select-none place-items-center overflow-hidden" data-testid={testId} data-phase={phase}
      style={{ ['--c' as string]: INK, ['--g' as string]: '#2A1F5C', pointerEvents: present ? undefined : 'none' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.22 } }} transition={{ duration: 0.22 }}
      onPointerDown={() => { if (phase !== 'reveal' && phase !== 'pick' && phase !== 'enchant') d.skip(); }}>
      {/* the room */}
      <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_42%,#2A1F5C_0%,#0B0820_62%,#05040F_100%)]" />
      <div className="lv-rr-room absolute inset-0" style={{ opacity: phase === 'drop' ? 0 : revealed ? 1 : 0.55 }} />
      {/* rays once it lands (rotating on the compositor) */}
      {revealed && !reduce && (tier >= 1 || ench) && (
        <div className="lv-rr-rays pointer-events-none absolute left-1/2 top-[42%]"
          style={{ background: ultra ? `repeating-conic-gradient(from 0deg, ${RAINBOW.split(', ').map((c, i) => `${c}66 ${i * 45}deg ${i * 45 + 8}deg, transparent ${i * 45 + 8}deg ${i * 45 + 22.5}deg, ${c}44 ${i * 45 + 22.5}deg ${i * 45 + 30}deg, transparent ${i * 45 + 30}deg ${(i + 1) * 45}deg`).join(', ')})` : `repeating-conic-gradient(from 0deg, ${info.glow}${tier >= 3 ? '55' : '30'} 0deg 7deg, transparent 7deg 22deg)` }} />
      )}
      {/* the flash */}
      {revealed && !reduce && overlay && <div className={`lv-rr-ov lv-rr-ov-${overlay} pointer-events-none absolute inset-0`} />}
      {revealed && !reduce && <div className="lv-rr-flash pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, #fff ${tier >= 3 ? 30 : 10}%, ${ench ? '#F0DBFF' : info.glow}aa 45%, transparent 75%)` }} />}

      <motion.div animate={shake} className="relative flex w-full flex-col items-center px-6" style={{ willChange: 'transform' }}>
        {ultra && revealed && <motion.div className="mb-2 rounded-full px-4 py-1 font-display text-[13px] font-black tracking-[0.3em] text-[#1a0b2e]" style={{ background: ench ? 'linear-gradient(90deg,#B26BFF,#FFE8A3,#B26BFF)' : `linear-gradient(90deg, ${RAINBOW})` }}
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 500, damping: 18 }} data-testid={ench ? 'roll-enchanted' : undefined}>{ench ? `ENCHANTED · #${ench.serial}` : 'ULTRA RARE'}</motion.div>}
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
              style={{ fontSize: titleSize, color: '#fff', ['--c' as string]: ench ? '#B26BFF' : info.color, ['--g' as string]: ench ? '#F0DBFF' : info.glow }}
              initial={reduce ? false : { scale: 1.9, opacity: 0, y: -6 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
              <span ref={titleRef} className="inline-block px-1">{title}</span>
            </motion.div>
          )}
        </div>

        {/* the canvas */}
        <div ref={boxRef} className="relative">
          {revealed && finalShiny && !reduce && (
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
          <motion.div className="relative aspect-square w-[min(72vw,310px)]" style={{ willChange: 'transform' }}
            initial={reduce ? false : { scale: 0.55, rotate: -6, opacity: 0 }} animate={{ scale: revealed && !reduce ? [0.92, 1.06, 1] : 1, rotate: 0, opacity: 1 }}
            transition={revealed ? { duration: 0.5, times: [0, 0.45, 1] } : { type: 'spring', stiffness: 260, damping: 19 }}>
            <div ref={glowRef} className="lv-rr-glow absolute -inset-12 rounded-full" style={{ opacity: phase === 'drop' ? 0 : revealed ? 1 : 0.6, ['--c' as string]: INK, ['--g' as string]: '#2A1F5C' }} />
            <div ref={inkRef} className="lv-rr-card absolute inset-0 overflow-hidden rounded-[28px] border-[6px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]" style={{ borderColor: revealed ? (ench ? '#B26BFF' : info.color) : '#E9DFC8', ['--c' as string]: INK, ['--g' as string]: '#2A1F5C' }}>
              <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg,#6B4A22 0 1px,transparent 1px 6px),repeating-linear-gradient(90deg,#6B4A22 0 1px,transparent 1px 6px)' }} />
              {/* the ink: each roll splashes afresh */}
              {phase !== 'drop' && <InkSplash key={rollIdx} seed={d.trace.steps[rollIdx]?.seed ?? d.trace.seed} still={reduce} />}
              {/* an Enchanted card: the ink turns to the enchantment's own night sky */}
              {revealed && ench && (
                <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
                  style={{ background: `radial-gradient(circle at 50% 45%, ${kindInfo(ench.kind).a}66, transparent 62%), radial-gradient(circle at 20% 85%, ${kindInfo(ench.kind).b}44, transparent 55%), linear-gradient(160deg, #1B0733, #07020F)` }}>
                  {!reduce && Array.from({ length: 14 }, (_, i) => <span key={i} className="lv-twinkle absolute text-[10px] text-white/80" style={{ left: `${(i * 37) % 92 + 4}%`, top: `${(i * 53) % 88 + 6}%`, animationDelay: `${(i % 7) * 0.3}s` }}>✦</span>)}
                </motion.div>
              )}
              {/* the plot rises out of the ink */}
              {revealed && result && (
                <motion.div className="absolute inset-[14%]" data-testid={testId === 'ink-roll' ? 'roll-plot' : 'claim-plot-art'}
                  initial={reduce ? false : { opacity: 0, scale: 0.3, rotate: -14, y: 24 }} animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 330, damping: 15 }}>
                  {ench ? <div className="grid h-full w-full place-items-center"><Sigil kind={ench.kind} seed={ench.sigil} size="100%" /></div> : <BasePlotArt rarity={final} shiny={finalShiny} size="100%" />}
                </motion.div>
              )}
              {revealed && (finalShiny || tier >= 3) && !reduce && <div className="lv-rr-sheen pointer-events-none absolute inset-0" />}
              {revealed && finalShiny && !reduce && <div className="lv-rr-foil pointer-events-none absolute inset-0" />}
            </div>
            {/* the falling drop */}
            {phase === 'drop' && (
              <div className="lv-rr-drop absolute left-1/2 top-1/2 h-[72px] w-[48px]">
                <svg viewBox="0 0 40 60" className="h-full w-full"><path d="M20 2 C26 16 36 28 36 40 A16 16 0 0 1 4 40 C4 28 14 16 20 2Z" fill={INK} /><ellipse cx="14" cy="38" rx="4" ry="7" fill="#fff" opacity="0.35" /></svg>
              </div>
            )}
            {/* shockwaves: the splash, then the reveal */}
            {phase !== 'drop' && !reduce && <span key={revealed ? 'r' : 's'} className={revealed ? 'lv-rr-wave lv-rr-wave-big' : 'lv-rr-wave'} style={revealed ? { ['--g' as string]: ench ? '#F0DBFF' : info.glow } : undefined} />}
            {revealed && !reduce && tier >= 2 && <span className="lv-rr-wave lv-rr-wave-big" style={{ animationDelay: '0.18s', ['--g' as string]: ench ? '#F0DBFF' : info.glow }} />}
          </motion.div>
          {/* the minigame this roll landed with, dropped onto the foot of the card */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-0 items-center justify-center">
            <AnimatePresence>
              {tagTy && tagType && (
                <motion.span key={tagKey} className="lv-rr-tag" data-testid="roll-game" data-type={tagType}
                  style={{ background: `linear-gradient(90deg, ${tagTy.a}, ${tagTy.b})`, borderColor: shade(tagTy.base, -0.2), ['--o' as string]: shade(tagTy.base, -0.1) } as CSSProperties}
                  initial={reduce ? false : { scale: 0.4, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
                  <span>{GAME_EMOJI[tagType] ?? '🎮'} {tagTy.game.toUpperCase()}</span>
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* what you got */}
        <div className="mt-7 min-h-[170px] w-full max-w-[340px]">
          {revealed && result && (
            <motion.div className="grid gap-2.5 text-center" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : celebrateDelay(final) / 1000, duration: 0.3 }}>
              <div className="text-[15px] font-extrabold" style={{ color: ench ? '#F0DBFF' : info.glow }}>{subtitle}</div>
              {(finalShiny || result.hot || result.lucky) && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {finalShiny && <motion.span initial={{ scale: 0 }} animate={{ scale: [0, 1.25, 1] }} transition={{ delay: 0.55 }} className="rounded-full bg-[linear-gradient(90deg,#FF7AE0,#FFE14D,#22E3FF)] px-3 py-1 font-display text-[15px] font-black text-[#1a0b2e] shadow-[0_0_24px_#fff8]" data-testid={testId === 'ink-roll' ? 'roll-shiny' : 'claim-shiny'}>✨ SHINY · ×5 rent ✨</motion.span>}
                  {result.lucky && <span className="rounded-full bg-[#3DDC97]/20 px-3 py-1 text-[12px] font-extrabold text-[#8CF5C6]" data-testid="roll-lucky">🍀 Lucky roll</span>}
                  {result.hot && <span className="rounded-full bg-[#FF6A1F]/25 px-3 py-1 text-[12px] font-extrabold text-[#FFB27A]">🔥 Hot Zone roll</span>}
                </div>
              )}
              {ench ? (
                <div className="grid gap-1.5 rounded-2xl border border-[#B26BFF]/40 bg-[#B26BFF]/10 px-3 py-2 text-[12px] font-semibold text-[#F0DBFF]" data-testid="roll-enchant">
                  <span>An enchantment lives on this plot instead of a rarity — {ench.minted ? `#${ench.serial} of ${ench.minted} ever minted` : `#${ench.serial}`}{ench.born_place ? `, born in ${ench.born_place}` : ''}.</span>
                  <button className="mx-auto rounded-xl bg-[linear-gradient(135deg,#B26BFF,#6B2BD9)] px-4 py-2 font-display text-[15px] font-black text-white shadow-[0_4px_0_#3E1580]" onClick={() => { onClose(); nav(`/grimoire/${ench.id}`); }} data-testid="roll-open-grimoire">📖 Open it in the Grimoire</button>
                </div>
              ) : info.ability && <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[13px] font-semibold leading-snug" style={{ color: info.glow }} data-testid="roll-ability">{info.ability}</div>}
              {name && <div className="truncate font-display text-lg font-semibold text-white">“{name}”</div>}
              <div className="text-sm font-bold text-white/80">
                {result.guaranteed ? `Guaranteed ${rarityInfo(result.guaranteed).name}+ · ` : result.first ? 'Your first plot · ' : ''}{t ? <span style={{ color: t.a }}>{t.game} · {t.name} plot</span> : <span>A plot</span>} · <span ref={rentRef} className="text-[#3DDC97] tnum">+{formatRate(0)}</span>
              </div>
              {clippable(final, finalShiny, !!ench) && <div className="mt-1 flex justify-center"><ClipButton trace={() => structuredClone(d.trace)} luck={luck} /></div>}
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
          <button className="pointer-events-auto rounded-full bg-[#1B1640] px-3 py-1 text-[11px] font-black text-white/80 active:scale-95" data-testid="roll-speed"
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setSpeed(speed === 'quick' ? 'normal' : 'quick'); }}>
            {speed === 'quick' ? '⏩ Quick rerolls' : '▶ Normal speed'} · tap to switch
          </button>
        </div>
      )}
      {/* the rolls Luck gave you, as they land — each with its own minigame */}
      {choices && rolled.length > 0 && phase !== 'pick' && phase !== 'reveal' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(18px,env(safe-area-inset-bottom,0px))] flex justify-center gap-2 px-4" data-testid="roll-tray">
          {rolled.map((r, i) => {
            const sh = !!result?.choiceShiny?.[i], tyId = result?.choiceTypes?.[i] ?? '', ty = PLOT_TYPES[tyId as keyof typeof PLOT_TYPES];
            return (
              <motion.div key={i} className="relative grid justify-items-center gap-0.5" initial={{ y: -260, scale: 1.8, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} data-testid="roll-tray-item" data-shiny={sh || undefined} data-type={tyId || undefined}>
                <span className={cn('relative block overflow-hidden rounded-[22%]', sh && 'lv-shiny-tile')}><BasePlotArt rarity={r} shiny={sh} size={44} /></span>
                {sh && <span className="absolute -right-1.5 -top-1.5 text-[14px] drop-shadow-[0_0_6px_#fff]">✨</span>}
                <span className="text-[9px] font-black uppercase" style={{ color: rarityInfo(r).color }}>{rarityInfo(r).name}</span>
                {ty && <span className="text-[8px] font-bold leading-none" style={{ color: ty.a }}>{GAME_EMOJI[tyId] ?? ''} {ty.game}</span>}
              </motion.div>
            );
          })}
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
                  const ri = rarityInfo(r), on = sel === i, sh = !!result?.choiceShiny?.[i], tyId = result?.choiceTypes?.[i] ?? '', ty = PLOT_TYPES[tyId as keyof typeof PLOT_TYPES];
                  return (
                    <motion.button key={i} onClick={() => { setSel(i); if (haptics) buzz('light'); }} data-testid={`roll-choice-${i}`}
                      className={cn('relative grid justify-items-center gap-1 rounded-2xl border-2 bg-white/[0.05] px-1 py-2.5', sh && 'lv-shiny-card')} data-shiny={sh || undefined} data-type={tyId || undefined}
                      style={{ borderColor: on ? ri.color : 'rgba(255,255,255,0.1)', boxShadow: on ? `0 0 24px ${ri.color}88` : undefined }}
                      initial={{ y: 30, opacity: 0, rotateY: 90 }} animate={{ y: 0, opacity: 1, rotateY: 0, scale: on ? 1.06 : 1 }} transition={{ delay: i * 0.07, type: 'spring', stiffness: 360, damping: 22 }}>
                      <span className={cn('relative block overflow-hidden rounded-[22%]', sh && 'lv-shiny-tile')}><BasePlotArt rarity={r} shiny={sh} size={58} /></span>
                      <span className="max-w-full truncate px-1 text-[11px] font-black uppercase" style={{ color: ri.color }}>{ri.emoji ? `${ri.emoji} ` : ''}{ri.name}</span>
                      {sh && <span className="rounded-full bg-[linear-gradient(90deg,#FF7AE0,#FFE14D,#22E3FF)] px-1.5 text-[9px] font-black text-[#1a0b2e]" data-testid={`roll-choice-shiny-${i}`}>✨ SHINY ×5</span>}
                      {ty && <span className="max-w-full truncate rounded-full px-1.5 text-[9px] font-black" style={{ background: `${ty.a}26`, color: ty.a }} data-testid={`roll-choice-type-${i}`}>{GAME_EMOJI[tyId] ?? ''} {ty.game} · {ty.name}</span>}
                      <span className="text-[9px] font-bold text-white/50 tnum">{formatRate(ri.usd_per_second * (sh ? 5 : 1))}</span>
                      {i === bestIdx(choices, result?.choiceShiny) && <span className="absolute -right-1 -top-2 rounded-full bg-[#FFE14D] px-1.5 text-[9px] font-black text-[#1a0b2e]">BEST</span>}
                    </motion.button>
                  );
                })}
              </div>
              <button disabled={picking} onClick={async () => {
                setPicking(true);
                try { await onPick?.(sel); } catch { /* the server keeps the best */ }
                setPicked(sel); setPicking(false); d.pick(sel);
              }} className="h-[54px] rounded-2xl bg-[linear-gradient(135deg,#3DDC97,#1FA971)] font-display text-[17px] font-black text-white shadow-[0_5px_0_#147a52] disabled:opacity-60" data-testid="roll-keep">
                Keep the {result?.choiceShiny?.[sel] ? 'shiny ' : ''}{rarityInfo(choices[sel]).name}{result?.choiceTypes?.[sel] ? ` · ${PLOT_TYPES[result.choiceTypes[sel] as keyof typeof PLOT_TYPES]?.game ?? ''}` : ''}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* the roll turns Enchanted (its particles are the director's, on the canvas below) */}
      {phase === 'enchant' && ench && <EnchantTransform ench={ench} fx={null} center={center} onDone={() => d.finishEnchant()} />}
      {/* particles on top of everything */}
      <canvas ref={cvRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
    </motion.div>
  );
}

/** The ink hitting the canvas: a different splash every roll (from the roll's seed, so its clip splashes the same) —
 *  a pool that bursts out, splatters flung round it, tendrils running out to them, and blooms that soak across until
 *  the whole canvas is ink. All in well under a second, all transforms (no layout, no filters). */
function InkSplash({ seed, still }: { seed: number; still: boolean }) {
  const sp = useMemo(() => inkSplash(seed), [seed]);
  const g = (d: number, dl: number) => ({ ['--d' as string]: `${d}s`, ['--dl' as string]: `${dl}s` }) as CSSProperties;
  // (each piece pops up to full size round its own middle — the same middle the clip scales it round — and the group
  // holds it at its final size: no var() in the keyframes)
  const at = (cx: number, cy: number) => ({ transformBox: 'view-box', transformOrigin: `${cx}px ${cy}px` }) as CSSProperties;
  return (
    <svg viewBox="0 0 100 100" className={cn('absolute inset-0 h-full w-full overflow-visible', still && 'lv-ink-still')} aria-hidden>
      <defs><radialGradient id="rr-shine" cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.45" stopColor="#fff" stopOpacity="0" /></radialGradient></defs>
      {/* the flood: soaks out to every corner, under the splash, so nothing is ever left showing */}
      <circle cx="50" cy="50" r="76" className="lv-rr-ink lv-ink-grow" style={g(0.5, 0.3)} />
      {sp.tendrils.map((td, i) => <path key={`t${i}`} d={td.d} className="lv-rr-ink-stroke lv-ink-draw" strokeWidth={td.w} style={{ ['--dl' as string]: `${td.dl}s` } as CSSProperties} pathLength={1} />)}
      {sp.shapes.map((x, i) => (
        <g key={`s${i}`} style={{ ...at(x.cx, x.cy), transform: `scale(${x.s})` }}>
          <path d={x.d} className="lv-rr-ink lv-ink-grow" style={{ ...g(x.dur, x.dl), ...at(x.cx, x.cy) }} />
        </g>
      ))}
      <g style={{ ...at(sp.cx, sp.cy), transform: 'scale(1.6)' }}>
        <circle cx={sp.cx} cy={sp.cy} r="40" fill="url(#rr-shine)" className="lv-ink-grow" style={{ ...g(0.7, 0.1), ...at(sp.cx, sp.cy) }} />
      </g>
    </svg>
  );
}
