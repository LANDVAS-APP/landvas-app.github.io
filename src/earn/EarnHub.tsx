// "More ways to earn" on the Play page: the daily wheel, weekly challenges, room
// check-ins, inspiring art and the craft bonus, with what's left today.
import { useQuery } from '@tanstack/react-query';
import { Brush, DoorOpen, Flame, Gift, Lightbulb, PenLine, RotateCw, Sparkles, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { cn } from '../lib/utils';
import { DailyWheel } from './DailyWheel';

export function EarnHub() {
  const q = useQuery({ queryKey: ['earn'], queryFn: api.earnOverview, staleTime: 30_000 });
  const [wheel, setWheel] = useState(false);
  const streak = useQuery({ queryKey: ['streak'], queryFn: api.myStreak, staleTime: 60_000 });
  const sketch = useQuery({ queryKey: ['sketch'], queryFn: api.sketchToday, staleTime: 60_000 });
  const d = q.data;
  const st = streak.data, sk = sketch.data;
  if (!d) return null;
  const tiers = [...(d.craft.tiers ?? [])].sort((a, b) => a.min - b.min);
  const items = [
    st?.enabled && { key: 'streak', icon: Flame, tone: 'text-hot bg-hot/15', title: st.days > 0 ? `${st.days}-day painting streak` : 'Start a painting streak',
      text: `${st.bonus_pct > 0 ? `+${st.bonus_pct}% craft bonus now. ` : ''}${st.today ? 'Painted today ✓ — come back tomorrow.' : `Paint today to ${st.days > 0 ? 'keep it going' : 'start it'} — every day in a row adds +${st.step_pct}% (up to +${st.max_pct}%).`}`, hot: !st.today, to: '/canvases' },
    sk?.enabled && { key: 'sketch', icon: PenLine, tone: 'text-accent-2 bg-accent-2/15', title: `Sketch of the Day: “${sk.word}”`, text: sk.mine?.submitted ? `Sketched! Vote for the best (${sk.votes_left} votes left).` : `10 minutes, one word — top ${sk.prizes.filter((x) => x > 0).length} win up to ${sk.prizes[0] ?? 0} Ink.`, hot: !sk.mine, to: '/sketch' },
    { key: 'doodle', icon: Lightbulb, tone: 'text-gold bg-gold/15', title: 'Draw & Guess', text: 'Guess drawings fast for Ink — or draw words for others to guess.', to: '/doodle' },
    { key: 'duet', icon: Users, tone: 'text-hot bg-hot/15', title: 'Duets', text: 'Paint half a picture blind with a random partner — then the big reveal.', to: '/duet' },
    d.wheel.enabled && { key: 'wheel', icon: RotateCw, tone: 'text-gold bg-gold/15', title: 'Daily wheel', text: d.wheel.spins_left > 0 ? 'Your free spin is ready!' : 'Spun today — back tomorrow', hot: d.wheel.spins_left > 0, onClick: () => setWheel(true) },
    d.challenges > 0 && { key: 'challenge', icon: Trophy, tone: 'text-hot bg-hot/15', title: 'Weekly challenge', text: `${d.challenges} theme${d.challenges > 1 ? 's' : ''} open — paint it, vote, win Ink`, hot: true, to: '/challenges' },
    d.rooms.enabled && { key: 'rooms', icon: DoorOpen, tone: 'text-accent-2 bg-accent-2/15', title: 'Check into rooms', text: `+${d.rooms.visitor_ink} Ink per room · ${d.rooms.paid_today}/${d.rooms.visitor_daily} today. Hosts earn too.`, to: '/players' },
    d.inspire.enabled && { key: 'inspire', icon: Sparkles, tone: 'text-ok bg-ok/15', title: 'Inspire artists', text: `Each piece you inspire pays its artist ${d.inspire.artist_ink} Ink${d.inspire.giver_ink ? ` (and you ${d.inspire.giver_ink}, ${d.inspire.given_today}/${d.inspire.giver_daily} today)` : ''}.`, to: '/gallery' },
    d.craft.enabled && tiers.length > 0 && { key: 'craft', icon: Brush, tone: 'text-accent bg-accent/15', title: 'Craft bonus', text: `Rich, original, carefully painted art pays: craft ${tiers.map((t) => `${t.min}+ → ${t.ink}`).join(', ')} Ink${d.craft.best != null ? ` · your best ${d.craft.best}` : ''}. Bigger murals earn more.`, to: '/canvases' },
    { key: 'invite', icon: Gift, tone: 'text-gold bg-gold/15', title: 'Invite friends', text: 'Ink when they start playing — plus a share of what they earn.', hot: true, to: '/invite' },
  ].filter(Boolean) as { key: string; icon: any; tone: string; title: string; text: string; hot?: boolean; to?: string; onClick?(): void }[];
  if (!items.length) return null;
  return (
    <section className="mb-5" data-testid="earn-hub">
      <h2 className="mb-2 font-display text-lg font-semibold">More ways to earn Ink</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => {
          const body = (
            <>
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', it.tone)}><it.icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{it.title}</span><span className="block text-xs text-muted">{it.text}</span></span>
              {it.hot && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hot shadow-[0_0_10px_var(--hot)]" aria-label="ready" />}
            </>
          );
          const cls = 'glass flex items-center gap-3 rounded-[20px] p-3 text-left transition hover:ring-1 hover:ring-accent-2/50';
          return it.to
            ? <Link key={it.key} to={it.to} className={cls} data-testid={`earn-${it.key}`}>{body}</Link>
            : <button key={it.key} onClick={it.onClick} className={cls} data-testid={`earn-${it.key}`}>{body}</button>;
        })}
      </div>
      {!d.old_enough && <p className="mt-2 text-xs text-faint">Room check-ins, inspiring and challenge votes start paying after your account’s first day.</p>}
      <DailyWheel open={wheel} onOpenChange={setWheel} />
    </section>
  );
}
