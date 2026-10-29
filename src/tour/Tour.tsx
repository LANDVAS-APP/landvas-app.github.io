// The new-player tutorial: a short, skippable walk through what you can do. "Show me" jumps
// to the screen and shrinks the tour to a pill so the player can look around, then carry on.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Brush, CircleDollarSign, Gamepad2, Gift, Map, MapPinned, Sparkles, Trophy, Wand2, X } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { config } from '../env';
import { useOnboardedMe } from '../lib/queries';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { Button } from '../ui';
import { confettiCannons } from '../ui/confetti';

type Step = { icon: typeof Map; color: string; title: string; body: string; to?: string; cta?: string };

const STEPS: Step[] = [
  { icon: Sparkles, color: '#7B5CFF', title: 'Welcome to LANDVAS!', body: 'Here’s a one-minute tour of everything you can do. Skip it any time — you can replay it from Settings.' },
  { icon: MapPinned, color: '#34C3FF', title: 'Claim 4 free plots', body: 'Your explorer stands on the real map. Tap plots inside the dashed square around it — your first 4 are free. Each one’s rarity is a surprise!', to: '/world', cta: 'Show me the map' },
  { icon: Gamepad2, color: '#3DDC97', title: 'Win Ink with minigames', body: 'Every plot hides one of eight minigames. Clear its rounds to earn Ink — the currency that buys the plots next door. Rarer plots pay more.', to: '/play', cta: 'Show me the games' },
  { icon: Brush, color: '#FF4D6D', title: 'Paint it your way', body: 'Open a canvas and use the Create tab: idea prompts, ready-made palettes, shade ramps, trace guides and a free mirror. Careful, original work earns a craft bonus.', to: '/canvases', cta: 'Show me my canvases' },
  { icon: Wand2, color: '#FF9F1C', title: 'Grow a mural', body: 'Buy neighbouring plots and merge them into one canvas you can paint across. Bigger murals earn bigger craft bonuses — merging costs a little Ink per plot.' },
  { icon: CircleDollarSign, color: '#22C7B5', title: 'Rent every second', body: 'Your land earns USD rent around the clock. Hit the 20× boost once a day — daily limits reset every evening.' },
  { icon: Trophy, color: '#FFE14D', title: 'More ways to earn', body: 'Spin the daily wheel, check in at other players’ rooms, enter weekly challenges and battle in free PvP minigames.', to: '/pvp', cta: 'Show me PvP' },
  { icon: Gift, color: '#FF4FD8', title: 'Bring your friends', body: 'Invite friends with your code: you earn Ink when they start playing, plus a share of what they earn.', to: '/invite', cta: 'Show me my invite link' },
];

export const useTour = create<{ open: boolean; step: number; min: boolean; start(): void; set(p: Partial<{ open: boolean; step: number; min: boolean }>): void }>((set) => ({
  open: false, step: 0, min: false,
  start: () => set({ open: true, step: 0, min: false }),
  set: (p) => set(p),
}));

/** Replay from Settings. */
export function replayTour() {
  saveStorage('landvas.tour', 'pending');
  useTour.getState().start();
}

export function Tour() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const { open, step, min, set } = useTour();
  useEffect(() => {
    if (me && !config.e2e && safeStorage<string | null>('landvas.tour', null) === 'pending' && !useTour.getState().open) {
      const t = setTimeout(() => useTour.getState().start(), 900);
      return () => clearTimeout(t);
    }
  }, [me]);
  const finish = (celebrate: boolean) => {
    saveStorage('landvas.tour', 'done');
    set({ open: false, min: false });
    if (celebrate) { confettiCannons(); nav('/world'); }
  };
  if (!open || !me) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  if (min) {
    return (
      <motion.div className="fixed inset-x-0 bottom-[calc(92px+env(safe-area-inset-bottom,0px))] z-[60] flex justify-center px-4 md:bottom-6" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} data-testid="tour-pill">
        <div className="glass flex items-center gap-2 rounded-full border-accent/40 py-1.5 pl-4 pr-1.5 text-sm shadow-2xl">
          <b>Tour {step + 1}/{STEPS.length}</b><span className="hidden text-muted sm:inline">· {s.title}</span>
          <Button size="sm" variant="primary" onClick={() => set({ min: false, step: Math.min(step + 1, STEPS.length - 1) })}>Next <ArrowRight className="h-4 w-4" /></Button>
          <button className="rounded-full p-1.5 text-muted hover:text-fg" onClick={() => finish(false)} aria-label="End the tour"><X className="h-4 w-4" /></button>
        </div>
      </motion.div>
    );
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="tour">
      <motion.div className="glass relative w-full max-w-md overflow-hidden rounded-[28px] p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] sm:pb-6" initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: `${s.color}40` }} />
        <button className="absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold text-muted hover:bg-surface-2 hover:text-fg" onClick={() => finish(false)} data-testid="tour-skip">Skip tour</button>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.22 }} className="relative">
            <motion.div initial={{ scale: 0.5, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl" style={{ background: `${s.color}26`, color: s.color, boxShadow: `0 0 50px -10px ${s.color}` }}>
              <s.icon className="h-8 w-8" />
            </motion.div>
            <h2 id="tour-title" className="font-display text-2xl font-bold">{step === 0 ? `Welcome, @${me.profile.username}!` : s.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
            {s.to && <Button size="sm" variant="secondary" className="mt-4" onClick={() => { nav(s.to!); set({ min: true }); }}>{s.cta}</Button>}
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => <button key={i} onClick={() => set({ step: i })} aria-label={`Step ${i + 1}`} className={cn('h-2 rounded-full transition-all', i === step ? 'w-6 bg-accent' : i < step ? 'w-2 bg-accent/60' : 'w-2 bg-surface-2')} />)}
          </div>
          {step > 0 && <Button size="sm" variant="ghost" onClick={() => set({ step: step - 1 })} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>}
          <Button variant={last ? 'rainbow' : 'primary'} onClick={() => (last ? finish(true) : set({ step: step + 1 }))} data-testid="tour-next">
            {last ? 'Let’s paint!' : step === 0 ? 'Show me around' : 'Next'} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
