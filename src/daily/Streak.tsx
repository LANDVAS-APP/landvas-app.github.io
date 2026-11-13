// The daily streak: check in every day for Ink (more each day of the week), a guaranteed Rare-or-better roll every
// 7th day and a Legendary-or-better one every 30th. Miss a day and it starts over — so it pops up once a day.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { config } from '../env';
import { toGameError } from '../backend/backend';
import type { DailyStatus, StreakReward } from '../backend/types';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt, safeStorage, saveStorage } from '../lib/utils';
import { buzz, isNative } from '../native/native';
import { offerReminders } from '../native/reminders';
import { rarityInfo } from '../shared/rarity';
import { Dialog, ResourceIcon } from '../ui';
import { confetti, confettiCannons } from '../ui/confetti';
import type { RollOpts } from '../simple/useQuickRoll';
import { UltraStrip, ultrasKey } from '../ultra/UltraTracker';

export function useDaily() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['daily'], queryFn: api.dailyStatus, enabled: !!me, staleTime: 60_000 });
}

/** the app: a flame that burns brighter with your streak, the count rolling up, and the way to the next milestone */
function StreakHero({ d, busy, onClaim }: { d: DailyStatus; busy: boolean; onClaim(): void }) {
  const next = d.streak < 7 ? 7 : d.streak < 30 ? 30 : Math.ceil((d.streak + 1) / 30) * 30;
  const prev = next === 7 ? 0 : next === 30 ? 7 : next - 30;
  const pct = Math.max(4, Math.min(100, ((d.streak - prev) / Math.max(1, next - prev)) * 100));
  return (
    <div className="lv-streakhero">
      <div className="flame" aria-hidden><span className="f1">🔥</span><span className="glow" /></div>
      <div className="min-w-0 flex-1">
        <motion.div key={d.streak} className="font-display text-[44px] font-black leading-none tnum" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>{d.streak}</motion.div>
        <div className="text-[12px] font-bold text-white/60">day streak · best {d.best}</div>
        <div className="lv-meter mt-2"><span style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#ff7a2f,#ffe14d)', boxShadow: '0 0 12px rgba(255,122,47,0.7)' }} /></div>
        <div className="mt-1 text-[11px] font-bold text-white/50">{next - d.streak} day{next - d.streak === 1 ? '' : 's'} to {next === 30 ? 'a Legendary+ roll 👑' : 'a guaranteed Rare+ roll 🎟️'}</div>
      </div>
      {d.claimed_today
        ? <span className="lv-claimed">✓ Claimed</span>
        : <motion.button whileTap={{ scale: 0.94 }} onClick={onClaim} disabled={busy} className="lv-btn lv-rainbow lv-sheen h-14 shrink-0 px-4 text-left" data-testid="streak-claim">
            <span className="grid leading-tight"><span className="font-display text-[15px] font-black">Claim day {d.streak + 1}</span><span className="text-[11px] font-bold tnum">+{fmt(d.next.ink)} Ink{d.next.ticket ? ' + 🎟️' : ''}</span></span>
          </motion.button>}
    </div>
  );
}

function DayCell({ d, state }: { d: StreakReward; state: 'done' | 'today' | 'next' | 'future' }) {
  const t = d.ticket ? rarityInfo(d.ticket) : null;
  return (
    <div className={cn('relative grid aspect-square place-items-center rounded-xl border text-center leading-none',
      state === 'done' ? 'border-[#3DDC97]/40 bg-[#3DDC97]/15' : state === 'today' ? 'border-[#FFB31F] bg-[#FFB31F]/20 shadow-[0_0_16px_-2px_#FFB31F]' : 'border-white/10 bg-white/[0.04]',
      t && state !== 'done' && 'border-2')} style={t && state !== 'done' ? { borderColor: t.color } : undefined} data-testid={`streak-day-${d.day}`}>
      <span className="absolute left-1 top-0.5 text-[8px] font-black text-white/45">{d.day}</span>
      {state === 'done' ? <span className="text-[15px]">✅</span>
        : t ? <span className="grid gap-0.5"><span className="text-[15px]">{d.day % 30 === 0 ? '👑' : '🎟️'}</span><span className="text-[7px] font-black uppercase" style={{ color: t.color }}>{t.name}+</span></span>
        : <span className="grid gap-0.5"><ResourceIcon r="ink" className="mx-auto h-3 w-3" /><span className="text-[9px] font-bold tnum">{d.ink}</span></span>}
    </div>
  );
}

const APP = isNative();
export function StreakDialog({ open, onOpenChange, onRoll }: { open: boolean; onOpenChange(v: boolean): void; onRoll(o: RollOpts): void }) {
  const q = useDaily();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const claim = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.dailyClaim();
      qc.setQueryData(['daily'], r.status);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ultrasKey });
      if (useUi.getState().settings.haptics) buzz('success');
      if (r.reward.ticket) confettiCannons(); else confetti({ y: innerHeight * 0.4, count: 70 });
      toast.success(`Day ${r.reward.day}! +${fmt(r.reward.ink)} Ink`, { description: r.reward.ticket ? `And a guaranteed ${rarityInfo(r.reward.ticket).name}-or-better roll — use it below!` : 'Come back tomorrow to keep your streak.' });
      setTimeout(offerReminders, 2500); // the app: offer a daily reminder once (after the celebration)
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const done = d ? d.streak - (d.claimed_today ? 0 : 0) : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🔥 Daily streak" description="Check in every day. Every 7th day: a guaranteed Rare+ roll. Day 30: a guaranteed Legendary+ roll.">
      {!d ? null : (
        <div className={cn('grid gap-4', APP && 'lv-streak')} data-testid="streak-dialog">
          {APP && <StreakHero d={d} busy={busy} onClaim={claim} />}
          {APP && <UltraStrip />}
          <div className={cn('flex items-center justify-between rounded-2xl bg-[linear-gradient(135deg,#FF6A1F33,#FFB31F22)] p-3', APP && 'hidden')}>
            <div>
              <div className="font-display text-[34px] font-black leading-none tnum">🔥 {d.streak}</div>
              <div className="text-[11px] font-bold text-white/60">day streak · best {d.best}</div>
            </div>
            {d.claimed_today ? (
              <span className="rounded-full bg-[#3DDC97]/20 px-3 py-1.5 text-[12px] font-extrabold text-[#3DDC97]">✓ Claimed today</span>
            ) : (
              <motion.button whileTap={{ scale: 0.94 }} animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} onClick={claim} disabled={busy}
                className="rounded-2xl bg-[linear-gradient(135deg,#FFB31F,#FF6A1F)] px-4 py-2.5 text-left font-display font-black text-[#2a1200] shadow-[0_4px_0_#9a3d00]" data-testid="streak-claim">
                <span className="block text-[15px] leading-tight">Claim day {d.streak + 1}</span>
                <span className="block text-[11px] font-bold tnum">+{fmt(d.next.ink)} Ink{d.next.ticket ? ` + ${rarityInfo(d.next.ticket).name}+ roll` : ''}</span>
              </motion.button>
            )}
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {d.calendar.map((c) => <DayCell key={c.day} d={c} state={c.day <= done ? 'done' : !d.claimed_today && c.day === d.streak + 1 ? 'today' : 'future'} />)}
          </div>
          {d.tickets.length > 0 && (
            <div className="grid gap-2" data-testid="streak-tickets">
              <div className="text-[11px] font-black uppercase tracking-wider text-white/60">Your guaranteed rolls</div>
              {d.tickets.map((t) => {
                const r = rarityInfo(t.min_rarity);
                return (
                  <button key={t.id} onClick={() => { onOpenChange(false); setTimeout(() => onRoll({ ticket: t.id, ticketRarity: t.min_rarity }), 200); }}
                    className="flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left" style={{ borderColor: r.color, background: `${r.color}22` }} data-testid="use-ticket">
                    <span className="text-2xl">{t.min_rarity === 'legendary' ? '👑' : '🎟️'}</span>
                    <span className="grid flex-1 leading-tight"><span className="text-sm font-black">{r.name} or better</span><span className="text-[11px] text-white/60">A free plot, guaranteed — could even be an ultra</span></span>
                    <span className="rounded-full bg-white px-3 py-1 text-[12px] font-black text-[#14103a]">Roll!</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** a compact streak button: 🔥 N, pulsing while today's check-in is waiting */
export function StreakChip({ onOpen, className }: { onOpen(): void; className?: string }) {
  const q = useDaily();
  const d = q.data as DailyStatus | undefined;
  if (!d?.enabled) return null;
  const waiting = !d.claimed_today || d.tickets.length > 0;
  return (
    <button onClick={onOpen} className={cn('pointer-events-auto lv-gbtn round relative', waiting && 'hot', className)} data-testid="streak-chip" aria-label={`Daily streak: ${d.streak} days`}>
      <span className="text-[20px] leading-none">🔥</span><span className="lbl tnum">{d.streak}</span>
      {waiting && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-[#0b0e24] bg-[#FFE14D]" />}
    </button>
  );
}

/** opens the streak once a day, the first time the game is opened, while today's check-in is waiting */
export function useStreakPrompt(open: () => void, enabled = true) {
  const q = useDaily();
  useEffect(() => {
    const d = q.data;
    if (!enabled || !d?.enabled || d.claimed_today || config.e2e) return; // (the test build opens it itself)
    const today = new Date().toISOString().slice(0, 10);
    if (safeStorage('landvas.streakPrompt', '') === today) return;
    saveStorage('landvas.streakPrompt', today);
    const t = setTimeout(open, 900);
    return () => clearTimeout(t);
  }, [q.data?.claimed_today, q.data?.enabled, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
