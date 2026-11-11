// The collection: an album of every plot type and every rarity — the ultras you haven't found yet stay a mystery,
// with just their odds showing — and the Crowns of the world.
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
  return (
    <button onClick={onOpen} className="grid gap-2 rounded-[22px] border border-white/10 bg-white/[0.04] p-3.5 text-left" data-testid="collection-card">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[14px] font-black">📖 Collection</span>
        <span className="text-[12px] font-bold text-white/60 tnum">{have}/{all} plot types · {c.rarities.filter((r) => r.owned > 0).length}/{c.rarities.length} rarities</span>
      </div>
      <div className="flex gap-1">
        {c.types.map((t) => { const p = PLOT_TYPES[t.id]; return <span key={t.id} className="h-3 flex-1 rounded-full" style={{ background: t.owned ? `linear-gradient(90deg, ${p?.a}, ${p?.b})` : 'rgba(255,255,255,0.1)' }} />; })}
      </div>
    </button>
  );
}

/** the Crowns of the world: City, State and Country — who holds them, and how strong each one is */
const TIER_LABEL: Record<string, string> = { crown_country: 'Country', crown_state: 'State', crown: 'City' };
function Crowns() {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['crowns'], queryFn: api.crowns, enabled: !!me, staleTime: 5 * 60_000 });
  if (!q.data) return null;
  const { total, states, countries, held } = q.data;
  return (
    <section className="grid gap-2" data-testid="crowns">
      <div className="flex items-baseline justify-between"><h3 className="text-[12px] font-black uppercase tracking-wider text-white/60">👑 Crowns of the world</h3><span className="text-[12px] font-bold tnum">{held.length} claimed</span></div>
      <p className="-mt-1 text-[11px] text-white/45">{total.toLocaleString()} City Crowns (×1.5), {states.toLocaleString()} State Crowns (×5) and {countries} Country Crowns (×10). A Crown only reaches full strength when enough other players own land in its kingdom.</p>
      {held.length ? (
        <div className="grid gap-1.5">
          {held.slice(0, 60).map((c) => {
            const info = rarityInfo(c.tier);
            return (
              <div key={`${c.tier}-${c.city}-${c.since}`} className={cn('flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px]', c.mine ? 'bg-[#FFD23F]/15' : 'bg-white/[0.04]')} data-testid={`crown-${c.tier}`}>
                <BasePlotArt rarity={c.tier} size={26} />
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-bold">{c.city} <span className="text-white/40">{c.tier === 'crown_country' ? '' : c.country}</span></span>
                  <span className="truncate text-[10px] font-bold" style={{ color: info.color }}>{TIER_LABEL[c.tier]} Crown · @{c.holder}</span>
                </span>
                <span className="grid justify-items-end leading-tight">
                  <span className="text-[11px] font-black tnum" style={{ color: c.strength >= 1 ? '#3DDC97' : '#FFD166' }}>{Math.round(c.strength * 100)}%</span>
                  <span className="text-[9px] text-white/40 tnum">{Math.min(c.rivals, c.need)}/{c.need} rivals</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] text-white/50">No Crowns claimed yet — every one is up for grabs.</div>}
    </section>
  );
}

export function CollectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange(v: boolean): void }) {
  const q = useCollection();
  const c = q.data;
  const have = c ? c.types.filter((t) => t.owned > 0).length : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="📖 Collection" description="Every plot type, every rarity you’ve found, and the Crowns of the world.">
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
            <p className="text-[11px] text-white/45">The ultra rarities each earn in their own way — find one to see how.</p>
          </section>
          <Crowns />
        </div>
      )}
    </Dialog>
  );
}
