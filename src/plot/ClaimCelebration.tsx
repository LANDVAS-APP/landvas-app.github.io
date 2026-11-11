// The claim moment, full screen: the same ink roll as simple mode (src/roll/RollReveal.tsx) — the drop, the drum
// of rarities, the near miss, the flood and the storm — then what to do with your new plot. The map keeps the plot
// neutral until the roll lands, so nothing gives the rarity away.
import { AnimatePresence } from 'motion/react';
import { Brush, TreePine, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import type { PlotTypeId } from '../shared/grid';
import type { RarityId } from '../shared/rarity';
import { RollReveal } from '../roll/RollReveal';
import { Button } from '../ui';

export type Celebration = {
  gx: number; gy: number; rarity: RarityId; type: PlotTypeId; name?: string | null; usd: number;
  groupId: string; first: boolean; onDone?: () => void;
  /** set when the plot was bought as an Inkborn Habitat */
  habitatId?: string | null;
  /** a Base plot (no extras): no painting buttons; `again` offers another buy (simple mode) */
  base?: boolean; again?: () => void;
  /** a shiny plot (1 in 1,000, ×5 rent) */
  shiny?: boolean;
};

/** `hidden`: the plot whose rarity is still rolling — the map keeps it neutral until the reveal. */
export const useCelebration = create<{ c: Celebration | null; hidden: { gx: number; gy: number } | null; show(c: Celebration): void; reveal(): void; close(): void }>((set, get) => ({
  c: null,
  hidden: null,
  show: (c) => set({ c, hidden: { gx: c.gx, gy: c.gy } }),
  reveal: () => set({ hidden: null }),
  close: () => {
    const done = get().c?.onDone;
    set({ c: null, hidden: null });
    done?.();
  },
}));

export function ClaimCelebration() {
  const c = useCelebration((s) => s.c);
  return <AnimatePresence>{c && <Show key={`${c.gx}_${c.gy}`} c={c} />}</AnimatePresence>;
}

function Show({ c }: { c: Celebration }) {
  const nav = useNavigate();
  const close = () => useCelebration.getState().close();
  const go = (start: 'draw' | 'upload') => { close(); nav(`/create/${c.groupId}?start=${start}`); };
  const actions = c.base ? (
    <div className="grid gap-2">
      {c.again && <Button variant="rainbow" onClick={() => { close(); c.again!(); }} data-testid="buy-again">🎲 Roll another</Button>}
      <p className="text-[11px] text-white/60">A Base plot: it earns rent from now on. You can give it a type (art, farm, arcade…) any time.</p>
    </div>
  ) : c.habitatId ? (
    <Button variant="rainbow" className="w-full" onClick={() => { const grow = !!c.onDone; close(); if (!grow) nav(`/habitat/${c.habitatId}`); }} data-testid="enter-habitat"><TreePine className="h-4 w-4" /> Enter your sanctuary</Button>
  ) : (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="rainbow" onClick={() => go('draw')} data-testid="choose-draw"><Brush className="h-4 w-4" /> Paint it</Button>
      <Button variant="secondary" onClick={() => go('upload')} data-testid="choose-upload"><Upload className="h-4 w-4" /> Upload art</Button>
    </div>
  );
  return (
    <RollReveal testId="claim-celebration" rarityTestId="claim-rarity" name={c.name} onClose={close}
      result={{ rarity: c.rarity, usd: c.usd, type: c.type, first: c.first, shiny: c.shiny }}
      onRevealed={() => useCelebration.getState().reveal()}
      actions={<>
        {actions}
        <button className="mt-3 text-xs font-bold text-white/60 hover:text-white" onClick={close} data-testid="celebration-close">{c.again ? 'Done' : 'Keep exploring'}</button>
      </>} />
  );
}
