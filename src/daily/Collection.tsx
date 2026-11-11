// The collection: every plot type (own one of each for +25% rent on everything, +5% at half the set) and every
// rarity — the ultras you haven't found yet stay a mystery, with just their odds showing.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { BasePlotArt } from '../plot/BasePlotArt';
import { GAME_INFO } from '../shared/minigames';
import { isUltra, rarityInfo, rarityOdds } from '../shared/rarity';
import { Dialog } from '../ui';

export function useCollection() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['collection'], queryFn: api.myCollection, enabled: !!me, staleTime: 60_000 });
}

/** a compact progress card that opens the album */
export function CollectionCard({ onOpen }: { onOpen(): void }) {
  const q = useCollection();
  const c = q.data;
  if (!c) return null;
  const have = c.types.filter((t) => t.owned > 0).length, all = c.types.length;
  const next = c.tiers.find((t) => t.types > have);
  return (
    <button onClick={onOpen} className="grid gap-2 rounded-[22px] border border-white/10 bg-white/[0.04] p-3.5 text-left" data-testid="collection-card">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[14px] font-black">📖 Collection</span>
        <span className="text-[12px] font-bold text-white/60 tnum">{have}/{all} plot types{Number(c.pct) > 0 ? ` · +${c.pct}% rent` : ''}</span>
      </div>
      <div className="flex gap-1">
        {c.types.map((t) => { const p = PLOT_TYPES[t.id]; return <span key={t.id} className="h-3 flex-1 rounded-full" style={{ background: t.owned ? `linear-gradient(90deg, ${p?.a}, ${p?.b})` : 'rgba(255,255,255,0.1)' }} />; })}
      </div>
      {next && <span className="text-[11px] font-semibold text-white/50">{next.types - have} more type{next.types - have === 1 ? '' : 's'} → +{next.pct}% rent on all your plots</span>}
    </button>
  );
}

export function CollectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange(v: boolean): void }) {
  const q = useCollection();
  const c = q.data;
  const have = c ? c.types.filter((t) => t.owned > 0).length : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="📖 Collection" description="Collect every plot type for a rent bonus on all your land — and chase every rarity.">
      {c && (
        <div className="grid gap-5" data-testid="collection-dialog">
          <section className="grid gap-2">
            <div className="flex items-baseline justify-between"><h3 className="text-[12px] font-black uppercase tracking-wider text-white/60">Plot types</h3><span className="text-[12px] font-bold tnum">{have}/{c.types.length}</span></div>
            <div className="grid grid-cols-4 gap-2">
              {c.types.map((t, i) => {
                const p = PLOT_TYPES[t.id];
                const game = Object.values(GAME_INFO).find((g) => g.plotType === t.id);
                return (
                  <motion.div key={t.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
                    className={cn('grid aspect-[3/4] content-between rounded-2xl p-2', !t.owned && 'opacity-40 grayscale')} style={{ background: `linear-gradient(160deg, ${p?.a}, ${p?.base ?? '#222'})` }} data-testid={`collect-type-${t.id}`}>
                    <span className="text-[10px] font-black text-white drop-shadow">{t.owned ? `×${t.owned}` : '🔒'}</span>
                    <span className="grid leading-tight"><span className="truncate text-[12px] font-black text-white drop-shadow">{t.name}</span><span className="truncate text-[9px] font-semibold text-white/80">{game?.name}</span></span>
                  </motion.div>
                );
              })}
            </div>
            <div className="grid gap-1.5">
              {c.tiers.map((t) => (
                <div key={t.types} className={cn('flex items-center justify-between rounded-xl px-3 py-2 text-[12px] font-bold', have >= t.types ? 'bg-[#3DDC97]/15 text-[#3DDC97]' : 'bg-white/[0.04] text-white/60')}>
                  <span>{have >= t.types ? '✓' : '○'} {t.types} plot types</span><span>+{t.pct}% rent on everything</span>
                </div>
              ))}
            </div>
          </section>
          <section className="grid gap-2">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-white/60">Rarities found</h3>
            <div className="grid grid-cols-3 gap-2">
              {c.rarities.map((r) => {
                const info = rarityInfo(r.id);
                const found = r.owned > 0;
                const ultra = isUltra(r.id);
                return (
                  <div key={r.id} className={cn('grid justify-items-center gap-1 rounded-2xl border p-2 text-center', found ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] bg-white/[0.02]')} data-testid={`collect-rarity-${r.id}`}>
                    {found ? <BasePlotArt rarity={r.id} shiny={r.shiny > 0} size={44} /> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.06] text-xl text-white/30">{ultra ? '?' : '🔒'}</span>}
                    <span className="text-[11px] font-black leading-tight" style={{ color: found || !ultra ? info.color : 'rgba(255,255,255,0.45)' }}>{found || !ultra ? `${info.emoji ?? ''} ${info.name}` : '???'}</span>
                    <span className="text-[9px] font-semibold text-white/45 tnum">{found ? `×${r.owned}${r.shiny ? ` · ✨${r.shiny}` : ''}` : rarityOdds(r.id)}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-white/45">The six ultra rarities each earn in their own way — find one to see how.</p>
          </section>
        </div>
      )}
    </Dialog>
  );
}
