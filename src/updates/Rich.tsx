// What an update looks like to players: a themed banner with a big emoji, the headline and a subtitle, then a
// card for each new feature. Old text-only updates are shown the same way (their lines become the cards).
import { motion } from 'motion/react';
import type { Announcement } from '../backend/types';
import { cn } from '../lib/utils';

export type RichContent = { theme?: string; emoji?: string; subtitle?: string; features?: { emoji?: string; title?: string; text: string }[]; cta?: string | null };
export const THEMES: Record<string, { label: string; from: string; to: string; ink: string }> = {
  update:   { label: 'Update',      from: '#7B5CFF', to: '#34C3FF', ink: '#FFFFFF' },
  farm:     { label: 'Farms',       from: '#4FAE4A', to: '#F5C842', ink: '#FFFFFF' },
  business: { label: 'Business',    from: '#F5B400', to: '#FF8A3D', ink: '#FFFFFF' },
  inkborn:  { label: 'Inkborn',     from: '#8B6CFF', to: '#FF7AB8', ink: '#FFFFFF' },
  space:    { label: 'Space',       from: '#1E2A78', to: '#7B5CFF', ink: '#FFFFFF' },
  art:      { label: 'Art',         from: '#FF4D6D', to: '#FFB347', ink: '#FFFFFF' },
  social:   { label: 'Social',      from: '#2E8BFF', to: '#3DDC97', ink: '#FFFFFF' },
  world:    { label: 'World',       from: '#0FA3A3', to: '#3A8FD0', ink: '#FFFFFF' },
  event:    { label: 'Event',       from: '#FF4DD8', to: '#7B5CFF', ink: '#FFFFFF' },
};
const EMOJI_START = /^(\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*)\s*/u;

/** The rich content for an update (built from its text when it has none). */
export function richOf(a: Pick<Announcement, 'body' | 'kind'> & { content?: RichContent | null }): Required<Pick<RichContent, 'theme' | 'emoji' | 'features'>> & RichContent {
  const c = a.content ?? {};
  let features = c.features ?? [];
  let intro = '';
  if (!features.length) {
    const lines = a.body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const listy = lines.filter((l) => /^[•\-*]\s+/.test(l) || EMOJI_START.test(l));
    if (listy.length >= 2) {
      intro = lines.filter((l) => !listy.includes(l)).join(' ');
      features = listy.map((l) => {
        const t = l.replace(/^[•\-*]\s+/, '');
        const m = EMOJI_START.exec(t);
        return m ? { emoji: m[1], text: t.slice(m[0].length) } : { emoji: '✨', text: t };
      });
    }
  }
  return { ...c, theme: c.theme ?? (a.kind === 'event' ? 'event' : 'update'), emoji: c.emoji ?? (a.kind === 'event' ? '🎉' : a.kind === 'maintenance' ? '🛠️' : '✨'), features, subtitle: c.subtitle ?? (intro || undefined) };
}

/** The banner at the top of an update. */
export function Hero({ title, rich, compact, when }: { title: string; rich: ReturnType<typeof richOf>; compact?: boolean; when?: string }) {
  const th = THEMES[rich.theme] ?? THEMES.update;
  return (
    <div className={cn('relative overflow-hidden', compact ? 'rounded-2xl p-3.5' : 'rounded-[26px] p-5 pt-6')} style={{ background: `linear-gradient(135deg, ${th.from}, ${th.to})`, color: th.ink }}>
      {/* soft shapes */}
      <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15" />
      <div className="pointer-events-none absolute -bottom-12 left-10 h-28 w-28 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-3">
        <motion.div initial={compact ? false : { scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          className={cn('grid shrink-0 place-items-center rounded-2xl bg-white/25 shadow-lg backdrop-blur', compact ? 'h-12 w-12 text-3xl' : 'h-20 w-20 text-5xl')}>{rich.emoji}</motion.div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-85">{th.label}{when ? ` · ${when}` : ''}</div>
          <h2 className={cn('font-display font-black leading-tight [text-wrap:balance]', compact ? 'text-base' : 'text-2xl')}>{title}</h2>
          {rich.subtitle && <p className={cn('mt-0.5 opacity-90', compact ? 'line-clamp-1 text-xs' : 'text-sm')}>{rich.subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

/** The feature cards. */
export function Features({ rich, limit, body }: { rich: ReturnType<typeof richOf>; limit?: number; body?: string }) {
  const th = THEMES[rich.theme] ?? THEMES.update;
  if (!rich.features.length) return body ? <p className="whitespace-pre-line text-sm text-muted">{body}</p> : null;
  const list = limit ? rich.features.slice(0, limit) : rich.features;
  return (
    <div className="grid gap-2">
      {list.map((f, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}
          className="flex items-start gap-3 rounded-2xl bg-surface-2/70 p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xl" style={{ background: `${th.from}22` }}>{f.emoji ?? '✨'}</span>
          <div className="min-w-0 text-sm leading-snug">{f.title && <b className="block">{f.title}</b>}<span className={f.title ? 'text-muted' : ''}>{f.text}</span></div>
        </motion.div>
      ))}
      {limit && rich.features.length > limit && <div className="text-center text-xs font-bold text-muted">+{rich.features.length - limit} more</div>}
    </div>
  );
}
