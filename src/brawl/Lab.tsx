// 🧪 The Card Lab: a test match against a gentle bot where you can put any card in your hand (and top your paint
// up), to see every creature, spell, totem, cataclysm and wonder in action. Nothing is won or lost there.
import { FlaskConical, Droplets } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { Dialog } from '../ui';
import { CARDS, RARITY_INFO, TERRAIN_INFO, kindName, type Card } from '../shared/brawl/cards';
import { CardView } from './CardView';

type Filter = 'all' | 'creature' | 'spell' | 'totem' | 'fx' | 'wonder';
const FILTERS: [Filter, string][] = [['all', 'All'], ['creature', '🐾 Creatures'], ['spell', '✨ Spells'], ['totem', '🗿 Totems'], ['fx', '🌋 Cataclysms'], ['wonder', '🏰 Wonders']];
const matches = (c: Card, f: Filter, t: string) =>
  (f === 'all' || (f === 'fx' ? !!c.fx : f === 'wonder' ? !!c.wonder : c.kind === f && !c.fx && !c.wonder)) && (t === 'all' || c.terrain === t);

/** The lab's toolbar over your hand: pick any card, fill up your paint. */
export function LabBar({ disabled, handFull, onCard, onPaint }: { disabled: boolean; handFull: boolean; onCard(id: string): void; onPaint(): void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Filter>('all');
  const [t, setT] = useState('all');
  const list = useMemo(() => CARDS.filter((c) => matches(c, f, t)), [f, t]);
  return (
    <>
      <div className="flex items-center justify-center gap-2" data-testid="brawl-lab">
        <span className="rounded-full bg-[#22E3FF]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#9FF3FF]">🧪 Card Lab</span>
        <button onClick={() => setOpen(true)} disabled={disabled || handFull} className="flex items-center gap-1 rounded-xl bg-[#22E3FF] px-3 py-1.5 text-xs font-black text-black shadow-lg transition disabled:opacity-40" data-testid="brawl-lab-pick">
          <FlaskConical className="h-3.5 w-3.5" />{handFull ? 'Hand full' : 'Any card'}
        </button>
        <button onClick={onPaint} disabled={disabled} className="flex items-center gap-1 rounded-xl bg-black/65 px-3 py-1.5 text-xs font-black text-[#9FD0FF] backdrop-blur transition disabled:opacity-40" data-testid="brawl-lab-paint">
          <Droplets className="h-3.5 w-3.5" />Refill paint
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen} wide title="🧪 Pick any card" description="It goes straight into your hand. Your paint tops up every turn here, and nothing is won or lost.">
        <div className="grid gap-2" data-testid="brawl-lab-picker">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(([k, n]) => <button key={k} onClick={() => setF(k)} className={cn('rounded-full px-2.5 py-1 text-xs font-bold', f === k ? 'bg-[#7B5CFF] text-white' : 'bg-surface-2')}>{n}</button>)}
          </div>
          <div className="flex flex-wrap gap-1">
            {['all', ...Object.keys(TERRAIN_INFO)].map((k) => (
              <button key={k} onClick={() => setT(k)} className={cn('rounded-full px-2.5 py-1 text-xs font-bold', t === k ? 'bg-[#7B5CFF] text-white' : 'bg-surface-2')}>
                {k === 'all' ? 'Every land' : `${TERRAIN_INFO[k as keyof typeof TERRAIN_INFO].emoji} ${TERRAIN_INFO[k as keyof typeof TERRAIN_INFO].name}`}
              </button>
            ))}
          </div>
          <div className="grid max-h-[60vh] grid-cols-[repeat(auto-fill,minmax(92px,1fr))] justify-items-center gap-2 overflow-y-auto p-1">
            {list.map((c) => (
              <button key={c.id} onClick={() => { onCard(c.id); setOpen(false); }} className="grid justify-items-center gap-0.5 rounded-xl p-1 transition hover:bg-white/5" data-testid={`brawl-lab-card-${c.id}`}>
                <CardView id={c.id} width={88} animate={false} tilt={false} glow={RARITY_INFO[c.rarity].color} />
                <span className="text-[10px] text-muted">{kindName(c)} · {c.cost}💧</span>
              </button>
            ))}
            {!list.length && <p className="col-span-full text-sm text-muted">No cards like that.</p>}
          </div>
        </div>
      </Dialog>
    </>
  );
}
