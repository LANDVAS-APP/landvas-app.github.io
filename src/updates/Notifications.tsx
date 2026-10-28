// The bell (site-wide updates + support replies) and the "what's new" popup.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, LifeBuoy, Megaphone, Newspaper, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { Announcement } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { cn, timeAgo } from '../lib/utils';
import { Button, Dialog } from '../ui';

export const KIND: Record<Announcement['kind'], { label: string; icon: typeof Sparkles; color: string }> = {
  update: { label: 'Update', icon: Sparkles, color: '#22E3FF' },
  event: { label: 'Event', icon: CalendarDays, color: '#FFC93D' },
  maintenance: { label: 'Maintenance', icon: Wrench, color: '#FF8A5B' },
  news: { label: 'News', icon: Newspaper, color: '#B49BFF' },
};

export function useNotifications() {
  const signedIn = !!getBackend().session();
  return useQuery({ queryKey: ['notifications', signedIn], queryFn: api.notifications, refetchInterval: 60_000, staleTime: 20_000 });
}

/** A bell button with a count; opens the updates panel. */
export function NotificationBell({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const n = useNotifications();
  const [open, setOpen] = useState(false);
  const count = (n.data?.unread_announcements ?? 0) + (n.data?.support_replies ?? 0);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={count ? `Updates, ${count} new` : 'Updates'} data-testid="notification-bell"
        className={cn('glass relative flex items-center justify-center rounded-2xl text-fg', size === 'sm' ? 'h-10 w-10' : 'h-11 w-11', className)}>
        <Bell className={cn(size === 'sm' ? 'h-[18px] w-[18px]' : 'h-5 w-5', count > 0 && 'animate-[lv-ring_1.6s_ease-in-out_2]')} />
        {count > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-hot px-1 text-center text-[10px] font-bold leading-[18px] text-white tnum shadow">{count > 9 ? '9+' : count}</span>}
      </button>
      <UpdatesPanel open={open} onOpenChange={setOpen} />
    </>
  );
}

function UpdatesPanel({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const me = useOnboardedMe();
  const n = useNotifications();
  // opening the bell counts as reading every update
  useEffect(() => {
    if (!open || !me || !n.data?.unread_announcements) return;
    const t = setTimeout(() => { void api.markAnnouncementsSeen().then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {}); }, 1200);
    return () => clearTimeout(t);
  }, [open, me, n.data?.unread_announcements, qc]);
  const go = (to: string) => { onOpenChange(false); nav(to); };
  const items = n.data?.announcements ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={<span className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-accent-2" /> What’s new</span>}>
      <div className="grid gap-3" data-testid="updates-panel">
        {!!n.data?.support_replies && (
          <button onClick={() => go('/support')} className="flex items-center gap-3 rounded-2xl border border-ok/40 bg-ok/10 p-3 text-left text-sm">
            <LifeBuoy className="h-5 w-5 shrink-0 text-ok" />
            <span><b>Support replied</b> to {n.data.support_replies === 1 ? 'your ticket' : `${n.data.support_replies} of your tickets`}. Tap to read.</span>
          </button>
        )}
        {!!n.data?.open_tickets_staff && (
          <button onClick={() => go('/admin#support')} className="flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-left text-sm">
            <LifeBuoy className="h-5 w-5 shrink-0 text-warn" />
            <span><b>{n.data.open_tickets_staff} open support ticket{n.data.open_tickets_staff === 1 ? '' : 's'}</b> waiting for a reply.</span>
          </button>
        )}
        {!items.length && !n.isLoading && <p className="py-6 text-center text-sm text-muted">No updates yet — they’ll show up here.</p>}
        {items.map((a) => <AnnouncementCard key={a.id} a={a} onLink={go} />)}
        {me && (
          <button onClick={() => go('/support')} className="mt-1 flex items-center justify-center gap-2 text-xs font-semibold text-muted hover:text-fg">
            <LifeBuoy className="h-3.5 w-3.5" /> Need help? Open a support ticket
          </button>
        )}
      </div>
    </Dialog>
  );
}

export function AnnouncementCard({ a, onLink }: { a: Announcement; onLink?(to: string): void }) {
  const k = KIND[a.kind] ?? KIND.update;
  return (
    <article className={cn('rounded-2xl border p-4', a.unread ? 'border-accent-2/50 bg-accent-2/5' : 'border-line bg-surface/50')}>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: k.color }}>
        <k.icon className="h-3.5 w-3.5" /> {k.label}
        <span className="font-semibold normal-case tracking-normal text-faint">· {timeAgo(a.published_at)}</span>
        {a.unread && <span className="ml-auto rounded-full bg-hot px-1.5 py-0.5 text-[9px] tracking-wider text-white">NEW</span>}
      </div>
      <h3 className="font-display text-base font-semibold">{a.title}</h3>
      <p className="mt-1 whitespace-pre-line text-sm text-muted">{a.body}</p>
      {a.link && onLink && <Button size="sm" variant="secondary" className="mt-3" onClick={() => onLink(a.link!)}>Take a look</Button>}
    </article>
  );
}

/** The newest unseen update pops up once for signed-in players. */
export function AnnouncementPopup() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const n = useNotifications();
  const [closed, setClosed] = useState<string | null>(null);
  const a = me ? n.data?.announcements?.find((x) => x.unread && x.popup) : undefined;
  const open = !!a && closed !== a.id;
  const done = (to?: string) => {
    if (!a) return;
    setClosed(a.id);
    void api.markAnnouncementsSeen().then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {});
    if (to) nav(to);
  };
  if (!a) return null;
  const k = KIND[a.kind] ?? KIND.update;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && done()} title={<span className="flex items-center gap-2"><k.icon className="h-5 w-5" style={{ color: k.color }} /> {a.title}</span>}>
      <div className="grid gap-4" data-testid="announcement-popup">
        <p className="whitespace-pre-line text-sm text-muted">{a.body}</p>
        <div className="flex flex-wrap gap-2">
          {a.link && <Button variant="rainbow" onClick={() => done(a.link!)}>Take a look</Button>}
          <Button variant={a.link ? 'secondary' : 'primary'} onClick={() => done()} data-testid="announcement-dismiss">Got it</Button>
        </div>
      </div>
    </Dialog>
  );
}
