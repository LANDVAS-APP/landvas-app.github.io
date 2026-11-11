// Simple mode's plot roll: the shared full-screen roll (src/roll/RollReveal.tsx) with Collect / Roll again.
import { AnimatePresence } from 'motion/react';
import { RollReveal, type RollResult } from '../roll/RollReveal';

export type { RollResult };

export function InkRoll({ open, result, onClose, onAgain, onRevealed, onPick, luck, canAgain, againLabel }: {
  open: boolean; result: RollResult | null; onClose(): void; onAgain(): void; onRevealed?(): void; onPick?(idx: number): Promise<unknown>; luck?: number; canAgain: boolean; againLabel: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <RollReveal key="roll" result={result} testId="ink-roll" rarityTestId="roll-rarity" onClose={onClose} onRevealed={onRevealed} onPick={onPick} luck={luck}
          actions={
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={onClose} className="h-[52px] rounded-2xl border-[1.5px] border-white/20 bg-white/10 font-display text-[16px] font-black text-white active:scale-[0.97]" data-testid="roll-done">Collect</button>
              <button onClick={onAgain} disabled={!canAgain} className="lv-rr-again h-[52px] rounded-2xl bg-[linear-gradient(135deg,#9a7bff,#5b3df5_55%,#ff3d9a)] font-display text-[16px] font-black text-white shadow-[0_5px_0_#2c1a8a] active:translate-y-[3px] active:shadow-[0_2px_0_#2c1a8a] disabled:opacity-50" data-testid="roll-again">🎲 {againLabel}</button>
            </div>
          } />
      )}
    </AnimatePresence>
  );
}
