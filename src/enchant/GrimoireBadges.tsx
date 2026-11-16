// The Grimoire's Badges tab: every enchantment badge (124), grouped by what earns it — each enchantment's own, the
// Traits at work, and the Grimoire as a whole — with how close you are. Secret ones stay "???" until they're yours.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { api } from '../backend/api';
import type { Achievement } from '../backend/types';
import { BadgeIcon, tierOf } from '../screens/BadgeIcon';
import { Spinner } from '../ui';
import { KIND_ORDER, kindInfo } from './kinds';

/** which group a badge belongs to, from its metric (ench.<kind>.<stat>, ench.all.<stat>, ench.<other>) */
export function badgeGroup(a: { metric?: string; key: string }): string {
  const m = (a.metric ?? '').split('.');
  if (m[0] === 'ench' && KIND_ORDER.includes(m[1] as any)) return m[1];
  if (m[1] === 'all' && ['gold_eggs', 'spores', 'boxes', 'echoes_done', 'arcs', 'div_hits', 'giant_days'].includes(m[2])) return 'traits';
  return 'grimoire';
}

export function GrimoireBadges({ kind }: { kind?: string }) {
  const q = useQuery({ queryKey: ['achievements'], queryFn: api.achievements, staleTime: 30_000 });
  const [open, setOpen] = useState<Achievement | null>(null);
  if (q.isLoading) return <div className="flex justify-center py-10"><Spinner /></div>;
  const list = (q.data ?? []).filter((a) => a.category === 'enchant');
  const groups = kind ? [kind] : ['grimoire', 'traits', ...KIND_ORDER];
  const got = list.filter((a) => a.unlocked_at).length;
  return (
    <div className="grid gap-4" data-testid="grimoire-badges">
      {!kind && <div className="rounded-2xl bg-white/[0.04] px-4 py-3 text-center"><div className="font-display text-[26px] font-black">{got} <span className="text-white/50">/ {list.length}</span></div><div className="text-[12px] font-bold text-white/60">enchantment badges · the metal shows how hard</div></div>}
      {groups.map((g) => {
        const items = list.filter((a) => (a.metric ? badgeGroup(a) : 'grimoire') === g);
        if (!items.length) return null;
        const label = g === 'grimoire' ? '📖 The Grimoire' : g === 'traits' ? '🧬 Traits at work' : `${kindInfo(g).emoji} ${kindInfo(g).name}`;
        return (
          <section key={g} className="grid gap-2">
            {!kind && <h3 className="lvx-label">{label} · {items.filter((a) => a.unlocked_at).length}/{items.length}</h3>}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {items.map((a) => {
                const pct = Math.min(100, Math.round(((a.progress ?? 0) / Math.max(1, a.threshold)) * 100));
                return (
                  <motion.button key={a.key} whileTap={{ scale: 0.94 }} onClick={() => setOpen(a)} className="grid justify-items-center gap-1 rounded-2xl bg-white/[0.04] px-1 py-2" data-testid="grimoire-badge" data-key={a.key} data-got={!!a.unlocked_at || undefined}>
                    <BadgeIcon icon={a.icon} category="enchant" tier={tierOf(a)} locked={!a.unlocked_at} size={46} />
                    <span className="line-clamp-2 text-center text-[10px] font-black leading-tight">{a.name}</span>
                    {!a.unlocked_at && <span className="h-1 w-full overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-[#B79CFF]" style={{ width: `${pct}%` }} /></span>}
                  </motion.button>
                );
              })}
            </div>
          </section>
        );
      })}
      {open && (
        <div className="fixed inset-0 z-[160] grid place-items-center bg-black/60 p-6" onClick={() => setOpen(null)} data-testid="grimoire-badge-open">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid w-full max-w-xs justify-items-center gap-2 rounded-3xl bg-[#14103A] p-5 text-center">
            <BadgeIcon icon={open.icon} category="enchant" tier={tierOf(open)} locked={!open.unlocked_at} size={104} />
            <div className="font-display text-[20px] font-black">{open.name}</div>
            <div className="text-[13px] text-white/75">{open.description}</div>
            {!open.unlocked_at && <div className="text-[12px] font-bold text-white/60">{Math.min(open.progress ?? 0, open.threshold)} / {open.threshold}</div>}
            {open.reward && Object.keys(open.reward).length > 0 && <div className="text-[12px] font-black text-[#FFE89A]">{Object.entries(open.reward).map(([k, v]) => `+${v} ${k.replace('_', ' ')}`).join(' · ')}</div>}
            {open.unlocked_at && <div className="text-[11px] font-bold text-[#9BF6C8]">Unlocked {new Date(open.unlocked_at).toLocaleDateString()}</div>}
          </motion.div>
        </div>
      )}
    </div>
  );
}
