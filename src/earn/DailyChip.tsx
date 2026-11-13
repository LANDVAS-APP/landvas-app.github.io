// The map's daily-spin nudge: a little wheel that wobbles while you have a free spin waiting.
// Gone once today's spins are used, so the map stays clean.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';
import { DailyWheel } from './DailyWheel';
import { RailBtn } from '../ui';

export function DailyChip({ rail }: { rail?: boolean } = {}) {
  const me = useOnboardedMe();
  const [open, setOpen] = useState(false);
  const reduce = useUi((s) => s.settings.reduceMotion);
  const st = useQuery({ queryKey: ['wheel'], queryFn: api.wheelStatus, enabled: !!me, staleTime: 5 * 60_000 });
  const n = st.data?.enabled ? st.data.spins_left : 0;
  return (
    <>
      {n > 0 && rail && (
        <RailBtn icon={<motion.span className="text-[22px] leading-none" animate={reduce ? undefined : { rotate: [0, -16, 14, -8, 0] }} transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 2.4 }}>🎡</motion.span>}
          label="Spin" tone="pink" glow badge={n > 1 ? n : undefined} dot={n === 1} data-testid="hud-daily" aria-label={`Daily spin — ${n} left`}
          onClick={() => { if (useUi.getState().settings.haptics) buzz('light'); setOpen(true); }} />
      )}
      {n > 0 && !rail && (
        <motion.button className="pointer-events-auto lv-gbtn round hot" data-testid="hud-daily" aria-label={`Daily spin — ${n} left`}
          initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.9 }}
          onClick={() => { if (useUi.getState().settings.haptics) buzz('light'); setOpen(true); }}>
          <motion.span className="text-[22px] leading-none" animate={reduce ? undefined : { rotate: [0, -16, 14, -8, 0] }} transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 2.4 }}>🎡</motion.span>
          <span className="lbl">Spin!</span>
          {n > 1 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full border-2 border-[#0b0e24] bg-gold px-1 text-center text-[10px] font-black leading-[14px] text-[#2a1600] tnum">{n}</span>}
        </motion.button>
      )}
      <DailyWheel open={open} onOpenChange={setOpen} />
    </>
  );
}
