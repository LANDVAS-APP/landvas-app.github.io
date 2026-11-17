// The pieces the app's own feature hubs are made of (Magic, Ultras, Together, What's new): a hero banner with live
// numbers and the main action, the hub's other screens as medallions, feature cards, rows, sideways rails and the
// Handbook chapters to read. The app only — the website keeps its own pages.
import { ChevronRight, GraduationCap } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { buzz } from '../../native/native';
import { Emblem, type DiscTone } from '../../ui';
import { Page } from '../Shell';
import './hubs.css';

export type HubTone = 'magic' | 'ultras' | 'together' | 'new' | 'eyes';
/** each hub's metallic rim (the shared game-piece tones) */
export const HUB_RIM: Record<HubTone, DiscTone> = { magic: 'violet', ultras: 'gold', together: 'emerald', new: 'rose', eyes: 'teal' };

export const rise = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(i, 12) * 0.035, type: 'spring' as const, stiffness: 420, damping: 32 } });

/** a hub's screen: its colours, the page wrapper and a test id */
export function HubPage({ tone, id, children }: { tone: HubTone; id: string; children: ReactNode }) {
  return (
    <Page>
      <div className={cn('lvh mx-auto max-w-lg', `lvh-${tone}`, `t-${HUB_RIM[tone]}`)} data-testid={id}>{children}</div>
    </Page>
  );
}

export type HubStat = { label: string; value: ReactNode; hot?: boolean; testid?: string };

/** the banner at the top of a hub */
export function HubHero({ kicker, title, sub, art, stats, actions, icon }: {
  kicker: string; title: ReactNode; sub?: ReactNode; art: string; stats?: HubStat[]; actions?: ReactNode; icon?: ReactNode;
}) {
  return (
    <motion.section {...rise(0)} className="lvh-hero" data-testid="hub-hero">
      <span className="halo" aria-hidden />
      <span className="art" aria-hidden><i>{art}</i></span>
      <span className="spark s1" aria-hidden /><span className="spark s2" aria-hidden /><span className="spark s3" aria-hidden />
      <div className="lvh-kicker">{icon}{kicker}</div>
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
      {!!stats?.length && (
        <div className="lvh-chips" data-testid="hub-stats">
          {stats.map((s) => (
            <span key={s.label} className={cn('lvh-chip', s.hot && 'hot')} data-testid={s.testid}><b>{s.value}</b><i>{s.label}</i></span>
          ))}
        </div>
      )}
      {actions && <div className="lvh-ctas">{actions}</div>}
    </motion.section>
  );
}

/** the gold button in a hero (a link or an action) */
export function HeroButton({ to, onClick, children, ghost, testid }: { to?: string; onClick?(): void; children: ReactNode; ghost?: boolean; testid?: string }) {
  const cls = cn('lvh-cta', ghost && 'ghost');
  if (to) return <Link to={to} className={cls} data-sound="tab" onClick={() => { buzz('light'); onClick?.(); }} data-testid={testid}>{children}</Link>;
  return <button type="button" className={cls} onClick={() => { buzz('light'); onClick?.(); }} data-testid={testid}>{children}</button>;
}

/** the hub's other screens, as medallion buttons */
export function HubJump({ items, tone }: { items: { to: string; label: string; icon: typeof GraduationCap }[]; tone: DiscTone }) {
  return (
    <motion.div {...rise(1)} className="lvh-jump" data-testid="hub-jump">
      {items.map((p) => (
        <Link key={p.to} to={p.to} data-sound="tab" className="lv-shortcut" data-testid={`jump-${p.to}`}>
          <Emblem tone={tone} size={34}><p.icon className="h-4 w-4" /></Emblem><span>{p.label}</span>
        </Link>
      ))}
    </motion.div>
  );
}

export function HubH2({ children, note, i = 2 }: { children: ReactNode; note?: ReactNode; i?: number }) {
  return <motion.h2 {...rise(i)} className="lvh-h2">{children}{note && <small>{note}</small>}</motion.h2>;
}

export const NewTag = () => <span className="lvh-newtag">NEW</span>;

/** a feature card: a link, or an action that opens something */
export function HubCard({ to, onClick, emoji, title, sub, value, hot, isNew, tone, wide, testid, i = 3 }: {
  to?: string; onClick?(): void; emoji: string; title: ReactNode; sub: ReactNode; value?: ReactNode; hot?: boolean; isNew?: boolean;
  tone: DiscTone; wide?: boolean; testid?: string; i?: number;
}) {
  const inner = (
    <>
      <span className="lvh-emo" aria-hidden>{emoji}</span>
      <span className={cn('block min-w-0', wide ? 'body' : 'mt-auto')}>
        <span className="t">{title}{isNew && <NewTag />}</span>
        <span className="s">{sub}</span>
      </span>
      {value != null && value !== '' && <span className={cn('val', hot && 'hot')}>{value}</span>}
      {wide && <ChevronRight className="h-5 w-5 shrink-0 opacity-50" />}
    </>
  );
  const cls = cn('lvh-card', `t-${tone}`, wide && 'wide');
  return (
    <motion.div {...rise(i)} className={wide ? 'col-span-2' : undefined}>
      {to ? <Link to={to} className={cls} data-sound="tab" onClick={() => buzz('light')} data-testid={testid}>{inner}</Link>
        : <button type="button" className={cn(cls, 'w-full')} onClick={() => { buzz('light'); onClick?.(); }} data-testid={testid}>{inner}</button>}
    </motion.div>
  );
}

/** a row in a list (lobbies, people, highlights) */
export function HubRow({ lead, title, sub, wrap, action, onClick, to, tone = 'steel', testid }: {
  lead: ReactNode; title: ReactNode; sub?: ReactNode; wrap?: boolean; action?: ReactNode; onClick?(): void; to?: string; tone?: DiscTone; testid?: string;
}) {
  const inner = (
    <>
      <span className="shrink-0">{lead}</span>
      <span className="min-w-0 flex-1"><span className="t">{title}</span>{sub && <span className={cn('s', wrap && 'wrap')}>{sub}</span>}</span>
      {action ?? <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
    </>
  );
  const cls = cn('lvh-row', `t-${tone}`);
  if (to) return <Link to={to} className={cls} onClick={() => { buzz('light'); onClick?.(); }} data-testid={testid}>{inner}</Link>;
  return <button type="button" className={cn(cls, 'w-full')} onClick={() => { buzz('light'); onClick?.(); }} data-testid={testid}>{inner}</button>;
}

/** the Handbook chapters that explain a hub */
export function HubLearn({ links, i = 20 }: { links: { to: string; label: string }[]; i?: number }) {
  return (
    <motion.div {...rise(i)} className="mt-6">
      <div className="lvh-h2 !mt-0"><span className="inline-flex items-center gap-2"><GraduationCap className="h-5 w-5" /> Learn it all</span><small>The Handbook, with live numbers</small></div>
      <div className="lvh-learn" data-testid="hub-learn">
        {links.map((l) => <Link key={l.to} to={l.to} data-sound="tab">{l.label}<ChevronRight className="h-3.5 w-3.5 opacity-60" /></Link>)}
      </div>
    </motion.div>
  );
}
