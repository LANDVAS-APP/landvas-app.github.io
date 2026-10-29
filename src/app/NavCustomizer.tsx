// Pick and order the four tabs in the phone's bottom bar (Me is always last).
import { motion } from 'motion/react';
import { ArrowDown, ArrowUp, Check, Plus, RotateCcw } from 'lucide-react';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Button } from '../ui';
import { DEFAULT_TABS, MAX_TABS, TAB_CHOICES } from './Shell';

export function NavCustomizer() {
  const chosen = useUi((s) => s.settings.mobileTabs);
  const update = useUi((s) => s.updateSettings);
  const tabs = (chosen?.length ? chosen : DEFAULT_TABS).filter((t) => TAB_CHOICES.some((c) => c.to === t)).slice(0, MAX_TABS);
  const set = (next: string[]) => update({ mobileTabs: next });
  const move = (i: number, d: number) => { const n = tabs.slice(); const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; set(n); };
  const toggle = (to: string) => set(tabs.includes(to) ? tabs.filter((t) => t !== to) : tabs.length < MAX_TABS ? [...tabs, to] : tabs);
  return (
    <div className="grid gap-4" data-testid="nav-customizer">
      <div className="glass mx-auto flex w-full max-w-sm justify-around rounded-2xl p-1.5">
        {tabs.map((to) => {
          const c = TAB_CHOICES.find((x) => x.to === to)!;
          return (
            <motion.div layout key={to} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-bold text-fg">
              <c.icon className="h-5 w-5" />{c.to === '/play' ? 'Play' : c.label}
            </motion.div>
          );
        })}
        {Array.from({ length: MAX_TABS - tabs.length }, (_, i) => <div key={i} className="flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] text-faint"><Plus className="h-5 w-5" />empty</div>)}
        <div className="flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-bold text-muted"><span className="h-5 w-5 rounded-full bg-surface-2" />Me</div>
      </div>
      <div className="grid gap-1.5">
        {tabs.map((to, i) => {
          const c = TAB_CHOICES.find((x) => x.to === to)!;
          return (
            <motion.div layout key={to} className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2">
              <c.icon className="h-4 w-4 text-accent-2" /><span className="flex-1 text-sm font-semibold">{c.label}</span>
              <button className="rounded-lg p-1 text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c.label} left`}><ArrowUp className="h-4 w-4" /></button>
              <button className="rounded-lg p-1 text-muted hover:text-fg disabled:opacity-30" disabled={i === tabs.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${c.label} right`}><ArrowDown className="h-4 w-4" /></button>
              <button className="rounded-lg px-2 py-1 text-xs font-bold text-bad hover:bg-bad/10" onClick={() => toggle(to)}>Remove</button>
            </motion.div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TAB_CHOICES.filter((c) => !tabs.includes(c.to)).map((c) => (
          <button key={c.to} disabled={tabs.length >= MAX_TABS} onClick={() => toggle(c.to)}
            className={cn('flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold transition hover:border-line-strong disabled:opacity-40')}>
            <c.icon className="h-3.5 w-3.5" />{c.label}{tabs.length < MAX_TABS && <Plus className="h-3 w-3 text-ok" />}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{tabs.length === MAX_TABS ? <><Check className="mr-1 inline h-3.5 w-3.5 text-ok" />Your bar is full — remove one to swap.</> : `Pick up to ${MAX_TABS} tabs.`} Everything else stays in Me.</span>
        <Button size="sm" variant="ghost" onClick={() => set(DEFAULT_TABS)}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
      </div>
    </div>
  );
}
