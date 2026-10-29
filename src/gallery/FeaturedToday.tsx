// Featured today: the paintings staff featured today, topped up with the community's
// most inspiring new art of the day. The first one is the Painting of the Day.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Crown, Sparkles, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { cn, fmt } from '../lib/utils';
import { ArtThumb } from './GalleryScreen';

export function FeaturedToday({ className, compact }: { className?: string; compact?: boolean }) {
  const q = useQuery({ queryKey: ['featured-today'], queryFn: () => api.featuredToday(12), staleTime: 60_000 });
  const cards = q.data ?? [];
  if (!cards.length) return null;
  const [top, ...rest] = cards;
  return (
    <section className={cn('mb-6', className)} data-testid="featured-today" aria-labelledby="featured-today-h">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-gold" /> Featured today</div>
          <h2 id="featured-today-h" className="font-display text-xl font-bold md:text-2xl">Today’s standout paintings</h2>
        </div>
        <Link to="/gallery" className="text-sm font-bold text-accent-2 hover:underline">Gallery →</Link>
      </div>
      <div className={cn('grid gap-3', !compact && 'md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]')}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Link to={`/art/${top.id}`} className="glass relative block overflow-hidden rounded-3xl p-3 ring-2 ring-gold/50" data-testid="painting-of-the-day">
            <span className="absolute left-5 top-5 z-10 flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[11px] font-extrabold text-bg shadow-lg"><Crown className="h-3.5 w-3.5" /> Painting of the day</span>
            <ArtThumb card={top} className="w-full" />
            <div className="px-1 pt-2">
              <div className="truncate font-display text-base font-semibold">{top.title}</div>
              <div className="truncate text-xs text-muted">by @{top.artist.username} · {fmt(top.plot_count)} plot{top.plot_count === 1 ? '' : 's'}{top.appreciation_count ? ` · ${fmt(top.appreciation_count)} inspired` : ''}</div>
              {top.note && <p className="mt-1 text-xs text-gold">“{top.note}”</p>}
            </div>
          </Link>
        </motion.div>
        {rest.length > 0 && (
          <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible">
            {rest.slice(0, 6).map((c, i) => (
              <motion.div key={c.id} className="w-40 shrink-0 snap-start md:w-auto" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * (i + 1) }}>
                <Link to={`/art/${c.id}`} className="glass block rounded-2xl p-2">
                  <ArtThumb card={c} />
                  <div className="mt-1.5 flex items-center gap-1 px-0.5">
                    {c.pick === 'staff' ? <Star className="h-3 w-3 shrink-0 text-gold" /> : <Sparkles className="h-3 w-3 shrink-0 text-accent-2" />}
                    <span className="truncate text-xs font-semibold">{c.title}</span>
                  </div>
                  <div className="truncate px-0.5 text-[11px] text-muted">@{c.artist.username}</div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
