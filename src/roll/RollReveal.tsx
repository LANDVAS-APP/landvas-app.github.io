// The plot roll, full screen, for both modes. A drop of ink falls onto a blank canvas and splashes; first the minigame
// strip races past and clunks onto the plot's game (the ink takes on that medium's colour and pattern), then the rarity
// drum spins — every name in its own material, a glint for Rare, lightning for Epic, gold for Legendary, a prism for
// Mythic, a hologram for the ultras — the rarity ink spreading wider as it slows, teasing the next one up, and
// flooding the canvas as it clicks into place: a flash, rays, a particle storm, and the rarity slams in.
//
// It's all one canvas, painted from a record of the roll (src/roll/stage): the director runs the roll and writes down
// every moment of it, and the stage draws whatever the record says for any time. So "Clip it" replays the very roll
// you saw, frame for frame — and every roll is kept on this phone to clip later (the Clips page). React renders only
// when the phase changes; the buttons, the pick and the details stay ordinary HTML.
import { rerollSpeed, useRerollSpeed } from './prefs';
import { ClipButton, clippable, clipping } from './clip';
import { useOnboardedMe } from '../lib/queries';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { uiSound } from '../native/uiSound';
import { BasePlotArt } from '../plot/BasePlotArt';
import { rarityInfo, rarityTier, type RarityId } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { PLOT_TYPES } from '../map/plotStyle';
import { celebrateDelay } from './celebrate';
import type { EnchantBrief } from './stage/trace';
import { kindInfo } from '../enchant/kinds';
import { useNavigate } from 'react-router-dom';
import { Director, bestIdx, type Phase } from './stage/director';
import { drawStage, prewarm } from './stage/draw';
import { sharedAssets, warmUp } from './stage/assets';
import { layoutFor, type Layout } from './stage/layout';
import { saveRoll } from '../clips/history';
import { config } from '../env';
import { framePacer, sceneDpr } from '../lib/gfx';

export type { EnchantBrief };
export type RollResult = { rarity: RarityId; usd: number; type: string; first: boolean; shiny?: boolean; hot?: boolean; lucky?: boolean; guaranteed?: string | null;
  /** Luck's rerolls: every roll (the first is the plot's own); the player keeps one */ choices?: RarityId[] | null;
  /** each roll's minigame type and shine */ choiceTypes?: string[] | null; choiceShiny?: boolean[] | null;
  /** the roll came out Enchanted: the enchantment born on it */ enchant?: EnchantBrief | null };

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

/** (tests: how long a frame of the roll takes to draw) */
const perf = config.e2e || import.meta.env.DEV ? ((window as unknown as { __landvasRollPerf?: { n: number; ms: number; max: number } }).__landvasRollPerf = { n: 0, ms: 0, max: 0 }) : null;

/** the phone's notch (env(safe-area-inset-top)), measured once */
let notch: number | null = null;
const safeTop = () => {
  if (notch != null) return notch;
  try {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
    document.body.appendChild(el); notch = parseFloat(getComputedStyle(el).paddingTop) || 0; el.remove();
  } catch { notch = 0; }
  return notch;
};

function Roll({ result, name, testId, rarityTestId, onRevealed, onClose, actions, onPick, luck = 0 }: Parameters<typeof RollReveal>[0]) {
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const present = useIsPresent();
  const presentRef = useRef(present);
  presentRef.current = present;
  const me = useOnboardedMe();
  const nav = useNavigate();
  const [speed, setSpeed] = useRerollSpeed();
  const cvRef = useRef<HTMLCanvasElement>(null);
  // (phones draw at 1.5x like every scene in the game — sharp in motion, a third of the pixels of 3x)
  const assets = useMemo(() => sharedAssets(sceneDpr(2)), []);
  const [phase, setPhase] = useState<Phase>(reduce ? 'spin' : 'drop');
  const [stage, setStage] = useState<'type' | 'rarity'>('type');
  const [rolled, setRolled] = useState<RarityId[]>([]);
  const [rollIdx, setRollIdx] = useState(0);
  const [sel, setSel] = useState(0);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const choices = result?.choices && result.choices.length > 1 ? result.choices : null;
  const multi = !!choices;
  const [lay, setLay] = useState<Layout>(() => layoutFor(innerWidth, innerHeight, { safeTop: safeTop(), multi }));
  const layRef = useRef(lay);
  const dirRef = useRef<Director | null>(null);
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;
  if (!dirRef.current) {
    dirRef.current = new Director(lay, {
      reduce, quickRerolls: () => rerollSpeed() === 'quick', user: me ? { username: me.profile.username, accent: me.profile.accent_color ?? undefined } : undefined,
      hooks: {
        phase: (p) => setPhase(p),
        stage: (s) => setStage(s),
        step: (i) => setRollIdx(i),
        landed: (_i, r) => setRolled((x) => [...x, r]),
        pick: (b) => setSel(b),
        reveal: () => { if (presentRef.current) onRevealedRef.current?.(); },
        buzz: (k) => { if (useUi.getState().settings.haptics) buzz(k); },
        sound: (k, n) => uiSound.roll(k, n),
      },
    });
  }
  const d = dirRef.current;

  // the result (the server's answer can arrive mid-spin)
  useEffect(() => {
    if (!result) return;
    d.setResult({ ...result, name });
    assets.preload(result);
    const L = layoutFor(innerWidth, innerHeight, { safeTop: safeTop(), multi });
    layRef.current = L; setLay(L);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void warmUp(); }, []);

  // one loop, one canvas: the director moves the roll on, the stage paints it
  useLayoutEffect(() => {
    const cv = cvRef.current!, g = cv.getContext('2d')!;
    const dpr = assets.dpr;
    let raf = 0, shown = layRef.current, warm = false, pickDrawn = false, frameN = 0;
    const size = () => {
      cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
      const L = layoutFor(innerWidth, innerHeight, { safeTop: safeTop(), multi: !!(d.trace.final.choices && d.trace.final.choices.length > 1) });
      layRef.current = L; setLay(L);
    };
    size();
    addEventListener('resize', size);
    const t0 = performance.now();
    // (at most 60 frames a second, whatever the screen's refresh rate)
    const pace = framePacer();
    const frame = (now: number) => {
      if (!presentRef.current) return; // closing: the last frame fades out as it is (each roll is keyed: never reused)
      // (a clip being cut on top: rest, so it gets the whole phone)
      if (clipping.open > 0 || !pace.ready(now)) { raf = requestAnimationFrame(frame); return; }
      const t = now - t0;
      // (the card eases into place if Luck's meter needs room)
      const L = layRef.current;
      if (shown !== L) { const k = 0.2, ease = (a: number, b: number) => (Math.abs(b - a) < 0.5 ? b : a + (b - a) * k); shown = { ...L, cy: ease(shown.cy, L.cy), cardTop: ease(shown.cardTop, L.cardTop), ry: ease(shown.ry, L.ry), panelTop: L.panelTop }; if (shown.cy === L.cy) shown = L; }
      d.setLayout(shown);
      d.tick(t);
      // (rest while the pick covers the stage; once the reveal has settled, 30 fps — then 15 — is plenty for the rays and the sheen)
      const rest = (d.phase === 'pick' && pickDrawn) || (d.trace.reveal != null && t - d.trace.reveal > 2500 && (frameN++ % (t - d.trace.reveal > 8000 ? 4 : 2)) !== 0);
      pickDrawn = d.phase === 'pick';
      if (rest) { raf = requestAnimationFrame(frame); return; }
      const p0 = performance.now();
      drawStage(g, shown, d.trace, t, { dpr, assets });
      if (perf) { perf.n++; perf.ms += performance.now() - p0; perf.max = Math.max(perf.max, performance.now() - p0); }
      if (!warm) warm = prewarm(assets, shown, d.phase === 'drop' ? 4 : 2);
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

  // every roll is kept on this phone, to clip later
  useEffect(() => {
    if (phase !== 'reveal') return;
    const tm = setTimeout(() => saveRoll(d.trace), 400);
    return () => clearTimeout(tm);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const revealed = phase === 'reveal' && !!result;
  const ench = result?.enchant ?? null;
  const ek = ench ? kindInfo(ench.kind) : null;
  const final: RarityId = (choices && picked != null ? choices[picked] : result?.rarity) ?? 'common';
  const info = rarityInfo(final);
  const tier = result ? rarityTier(final) : 0;
  const finalType = (choices && picked != null ? result?.choiceTypes?.[picked] : null) ?? result?.type;
  const finalShiny = choices && picked != null && result?.choiceShiny ? !!result.choiceShiny[picked] : !!result?.shiny;
  const t = result ? PLOT_TYPES[finalType as keyof typeof PLOT_TYPES] : null;
  const title = ek ? `${ek.emoji} ${ek.name}!` : `${info.emoji ? `${info.emoji} ` : ''}${info.name}${tier >= 3 ? '!' : ''}`;
  const subtitle = !result ? '' : ek ? ek.tagline : tier >= 3 ? `Incredible — a ${info.name} plot!` : final === 'common' ? 'A solid start' : `Nice — a ${info.name} plot`;
  const rentRef = useRef<HTMLSpanElement>(null);

  // the rent counts up
  useEffect(() => {
    if (!revealed || !result) return;
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

  return (
    <motion.div className="lv-rr fixed inset-0 z-[200] touch-none select-none overflow-hidden bg-[#05040F]" data-testid={testId} data-phase={phase} data-stage={stage}
      style={{ pointerEvents: present ? undefined : 'none' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.22 } }} transition={{ duration: 0.22 }}
      onPointerDown={() => { if (phase === 'enchant') d.finishEnchant(); else if (phase !== 'reveal' && phase !== 'pick') d.skip(); }}>
      <canvas ref={cvRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      {/* what the canvas shows, for screen readers (and tests) */}
      <div className="sr-only" aria-live="polite">
        {phase === 'spin' && (stage === 'type' ? 'Rolling the minigame…' : 'Rolling the rarity…')}
        {revealed && <span data-testid={rarityTestId}>{title}</span>}
        {revealed && ench && <span data-testid="roll-enchanted">ENCHANTED · #{ench.serial}</span>}
        {revealed && !ench && tier >= 5 && <span>ULTRA RARE</span>}
        {revealed && finalShiny && <span data-testid="roll-shiny-fx">Shiny!</span>}
      </div>
      {phase === 'enchant' && ench && <div className="absolute inset-0 z-[5]" data-testid="roll-enchanting" onPointerDown={(e) => { e.stopPropagation(); d.finishEnchant(); }} />}

      {/* what you got */}
      <div className="absolute inset-x-0 flex justify-center px-6" style={{ top: lay.panelTop }}>
        <div className="w-full max-w-[340px]">
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
      </div>

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
      {/* the rolls Luck gave you, as they land */}
      {choices && rolled.length > 0 && phase !== 'pick' && phase !== 'reveal' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(18px,env(safe-area-inset-bottom,0px))] flex justify-center gap-2 px-4" data-testid="roll-tray">
          {rolled.map((r, i) => {
            const sh = !!result?.choiceShiny?.[i], ty = PLOT_TYPES[(result?.choiceTypes?.[i] ?? '') as keyof typeof PLOT_TYPES];
            return (
              <motion.div key={i} className="relative grid justify-items-center gap-0.5" initial={{ y: -260, scale: 1.8, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} data-testid="roll-tray-item" data-shiny={sh || undefined}>
                <span className={cn('relative block overflow-hidden rounded-[22%]', sh && 'lv-shiny-tile')}><BasePlotArt rarity={r} shiny={sh} size={44} /></span>
                {sh && <span className="absolute -right-1.5 -top-1.5 text-[14px] drop-shadow-[0_0_6px_#fff]">✨</span>}
                <span className="text-[9px] font-black uppercase" style={{ color: rarityInfo(r).color }}>{rarityInfo(r).name}</span>
                {ty && <span className="text-[8px] font-bold leading-none" style={{ color: ty.a }}>{ty.game}</span>}
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
                  const ri = rarityInfo(r), on = sel === i, sh = !!result?.choiceShiny?.[i], ty = PLOT_TYPES[(result?.choiceTypes?.[i] ?? '') as keyof typeof PLOT_TYPES];
                  return (
                    <motion.button key={i} onClick={() => { setSel(i); if (haptics) buzz('light'); }} data-testid={`roll-choice-${i}`}
                      className={cn('relative grid justify-items-center gap-1 rounded-2xl border-2 bg-white/[0.05] px-1 py-2.5', sh && 'lv-shiny-card')} data-shiny={sh || undefined} data-type={result?.choiceTypes?.[i]}
                      style={{ borderColor: on ? ri.color : 'rgba(255,255,255,0.1)', boxShadow: on ? `0 0 24px ${ri.color}88` : undefined }}
                      initial={{ y: 30, opacity: 0, rotateY: 90 }} animate={{ y: 0, opacity: 1, rotateY: 0, scale: on ? 1.06 : 1 }} transition={{ delay: i * 0.07, type: 'spring', stiffness: 360, damping: 22 }}>
                      <span className={cn('relative block overflow-hidden rounded-[22%]', sh && 'lv-shiny-tile')}><BasePlotArt rarity={r} shiny={sh} size={58} /></span>
                      <span className="max-w-full truncate px-1 text-[11px] font-black uppercase" style={{ color: ri.color }}>{ri.emoji ? `${ri.emoji} ` : ''}{ri.name}</span>
                      {sh && <span className="rounded-full bg-[linear-gradient(90deg,#FF7AE0,#FFE14D,#22E3FF)] px-1.5 text-[9px] font-black text-[#1a0b2e]" data-testid={`roll-choice-shiny-${i}`}>✨ SHINY ×5</span>}
                      {ty && <span className="max-w-full truncate rounded-full px-1.5 text-[9px] font-black" style={{ background: `${ty.a}26`, color: ty.a }} data-testid={`roll-choice-type-${i}`}>{ty.name} · {ty.game}</span>}
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
                Keep the {result?.choiceShiny?.[sel] ? 'shiny ' : ''}{rarityInfo(choices[sel]).name}{result?.choiceTypes?.[sel] ? ` · ${PLOT_TYPES[result.choiceTypes[sel] as keyof typeof PLOT_TYPES]?.name ?? ''}` : ''}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
