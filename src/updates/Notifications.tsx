// The bell (site-wide updates + support replies) and the "what's new" popup.
import { ultraOfRarity } from '../explorer/ultra';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, DoorOpen, Heart, LifeBuoy, MapPin, MessageSquareHeart, Newspaper, PawPrint, Rocket, Sparkles, Stamp, Star, Tent, UserCheck, UserPlus, Users, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { buzz } from '../native/native';
import { worldOf } from '../space/worlds';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { Alert, Announcement } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { Features, Hero, richOf } from './Rich';
import { cn, timeAgo } from '../lib/utils';
import { Button, Dialog, PlayerAvatar } from '../ui';
import { poll } from '../lib/poll';
import { NATIVE_APP } from '../app/buildFlags';

export const KIND: Record<Announcement['kind'], { label: string; icon: typeof Sparkles; color: string }> = {
  update: { label: 'Update', icon: Sparkles, color: '#22E3FF' },
  event: { label: 'Event', icon: CalendarDays, color: '#FFC93D' },
  maintenance: { label: 'Maintenance', icon: Wrench, color: '#FF8A5B' },
  news: { label: 'News', icon: Newspaper, color: '#B49BFF' },
};

export function useNotifications() {
  const signedIn = !!getBackend().session();
  return useQuery({ queryKey: ['notifications', signedIn], queryFn: api.notifications, refetchInterval: poll(getBackend().onPush ? 900_000 : 300_000), staleTime: 120_000 }); // announcements are pushed; this is a safety net
}

/** A bell button with a count; opens the updates panel. */
export function useAlerts() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['alerts'], queryFn: () => api.myAlerts(60), enabled: !!me, refetchInterval: poll(getBackend().onPush ? 180_000 : 60_000), refetchIntervalInBackground: false, staleTime: 10_000 }); // pushed when they change
}

/** How many things are new in the bell. */
export function useUpdatesCount() {
  const n = useNotifications();
  const alerts = useAlerts();
  return (n.data?.unread_announcements ?? 0) + (n.data?.support_replies ?? 0) + (alerts.data?.unread ?? 0);
}

export function NotificationBell({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const count = useUpdatesCount();
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={<span className="flex items-center gap-2"><Bell className="h-5 w-5 text-accent-2" /> Notifications</span>}>
      <UpdatesBody open={open} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}

/** The app: the bell opens as a card (like the Hot Zone), not a dialog. */
export function BellCard({ onClose }: { onClose(): void }) {
  return (
    <motion.div className="lv-mcard t-azure pointer-events-auto mt-1 w-[min(380px,100%)]" data-testid="bell-card"
      initial={{ opacity: 0, scale: 0.7, y: -14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: -10, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }} style={{ transformOrigin: 'calc(100% - 22px) 0' }}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div><div className="kicker">🔔 Notifications</div><div className="font-display text-[20px] font-black leading-tight">What’s new</div></div>
        <button className="lv-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="lv-mcard-scroll lv-bellbody"><UpdatesBody open onClose={onClose} /></div>
    </motion.div>
  );
}

function UpdatesBody({ open, onClose }: { open: boolean; onClose(): void }) {
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
  const go = (to: string) => { onClose(); nav(to); };
  const items = n.data?.announcements ?? [];
  const alerts = useAlerts();
  const [tab, setTab] = useState<'activity' | 'updates'>('activity');
  // opening Activity marks your activity as read
  useEffect(() => {
    if (!open || tab !== 'activity' || !alerts.data?.unread) return;
    const t = setTimeout(() => { void api.markAlertsRead().then(() => qc.invalidateQueries({ queryKey: ['alerts'] })).catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [open, tab, alerts.data?.unread, qc]);
  return (
    <>
      {me && (
        <div className="mb-3 inline-flex gap-1 rounded-2xl bg-surface-2 p-1" role="tablist">
          {(['activity', 'updates'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`bell-tab-${t}`}
              className={cn('rounded-xl px-3 py-1.5 text-sm font-bold capitalize', tab === t ? 'bg-bg text-fg shadow' : 'text-muted')}>
              {t}{t === 'activity' && alerts.data?.unread ? <span className="ml-1 rounded-full bg-hot px-1.5 text-[10px] text-white">{alerts.data.unread}</span> : null}
              {t === 'updates' && n.data?.unread_announcements ? <span className="ml-1 rounded-full bg-hot px-1.5 text-[10px] text-white">{n.data.unread_announcements}</span> : null}
            </button>
          ))}
        </div>
      )}
      {me && tab === 'activity' ? <ActivityList onLink={go} /> : (
      <div className="grid gap-3" data-testid="updates-panel">
        {!!n.data?.support_replies && (
          <button onClick={() => go('/support')} className="flex items-center gap-3 rounded-2xl border border-ok/40 bg-ok/10 p-3 text-left text-sm">
            <LifeBuoy className="h-5 w-5 shrink-0 text-ok" />
            <span><b>Support replied</b> to {n.data.support_replies === 1 ? 'your ticket' : `${n.data.support_replies} of your tickets`}. Tap to read.</span>
          </button>
        )}
        {!NATIVE_APP && !!n.data?.drafts_staff && (
          <button onClick={() => go('/admin#updates')} className="flex items-center gap-3 rounded-2xl border border-accent-2/40 bg-accent-2/10 p-3 text-left text-sm" data-testid="drafts-waiting">
            <Sparkles className="h-5 w-5 shrink-0 text-accent-2" />
            <span><b>{n.data.drafts_staff} update draft{n.data.drafts_staff === 1 ? '' : 's'}</b> from the latest build waiting for your approval.</span>
          </button>
        )}
        {!NATIVE_APP && !!n.data?.open_tickets_staff && (
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
      )}
    </>
  );
}

const ALERT: Record<Alert['kind'], { icon: typeof Sparkles; color: string; text(a: Alert): React.ReactNode; to(a: Alert): string | null }> = {
  stamp: { icon: Stamp, color: '#FFB23F', text: (a) => <>collected stamp <b>#{a.data.serial}</b> of “{a.data.title}”{a.data.ink ? <span className="text-ok"> · +{a.data.ink} Ink</span> : null}</>, to: (a) => `/art/${a.data.publication_id}` },
  visit: { icon: DoorOpen, color: '#7B5CFF',
    text: (a) => (a.data.arcade ? <>walked into your arcade 🕹️</> : a.data.business ? (a.data.tip ? <>bought a lemonade at your business 🍋</> : <>is looking round your business</>) : a.data.farm ? <>is looking round your farm 🌾</> : <>visited your room</>),
    to: (a) => (a.data.arcade ? `/arcade/${a.data.arcade}` : a.data.business ? `/business/${a.data.business}` : a.data.farm ? `/farm/${a.data.farm}` : a.actor ? `/u/${a.actor.username}/home` : null) },
  checkin: { icon: DoorOpen, color: '#3DDC97', text: (a) => <>checked into your room{a.data.ink ? <span className="text-ok"> · +{a.data.ink} Ink</span> : null}</>, to: (a) => (a.actor ? `/u/${a.actor.username}/home` : null) },
  inspire: { icon: Sparkles, color: '#3DDC97', text: (a) => <>was inspired by “{a.data.title}”</>, to: (a) => `/art/${a.data.publication_id}` },
  sketch_vote: { icon: Heart, color: '#FF4D6D', text: (a) => <>Someone voted for your sketch of “{a.data.word}”</>, to: () => '/sketch' },
  note: { icon: MessageSquareHeart, color: '#FF4FD8', text: (a) => <>signed your guestbook: “{a.data.body}”</>, to: () => null },
  potd: { icon: Star, color: '#FFE14D', text: (a) => <>Your “{a.data.title}” is the <b>Painting of the Day</b>!</>, to: (a) => `/art/${a.data.publication_id}` },
  duet: { icon: Users, color: '#FF4D6D', text: (a) => <>finished your duet: {a.data.prompt}</>, to: (a) => `/duet/${a.data.duet_id}` },
  doodle: { icon: Sparkles, color: '#FFE14D', text: () => <>guessed your drawing</>, to: () => '/doodle' },
  friend_request: { icon: UserPlus, color: '#22E3FF', text: () => <>sent you a friend request</>, to: () => '/social' },
  friend_accept: { icon: UserCheck, color: '#3DDC97', text: () => <>accepted your friend request</>, to: (a) => (a.actor ? `/u/${a.actor.username}` : '/social') },
  sanctuary_visit: { icon: PawPrint, color: '#B49BFF', text: (a) => <>is visiting your sanctuary{a.data.name ? <> “{a.data.name}”</> : null}</>, to: (a) => (a.data.habitat ? `/habitat/${a.data.habitat}` : '/habitat') },
  playdate: {
    icon: Heart, color: '#FF7EB6', to: () => '/inkborn',
    text: (a) => <>had a playdate with your <b>{a.data.mine}</b>{a.data.tip ? <span className="text-ok"> · +{a.data.tip} Ink</span> : null}{a.data.egg ? <> · 🥚 you got an egg!</> : null}</>,
  },
  warp: { icon: Rocket, color: '#FFC93D', text: (a) => <>warped to you on {worldName(a.data.world)}</>, to: () => '/world' },
  base_visit: { icon: Tent, color: '#FF8A5B', text: (a) => <>is looking round your base on {worldName(a.data.world)}</>, to: () => '/world' },
  core: { icon: Sparkles, color: '#FF7A1A', text: (a) => <>💖 You reached <b>the core</b> of {worldName(a.data.world)}! A Core heart is yours{a.data.ink ? <span className="text-ok"> · +{Number(a.data.ink).toLocaleString()} Ink</span> : null}</>, to: () => '/world' },
  enchant: { icon: Sparkles, color: '#B26BFF', text: (a) => {
    const d = a.data as Record<string, any>;
    switch (d.sub) {
      case 'parasite_attached': return <>let a 🦠 <b>Parasite</b> loose — it’s wrapped itself around your plot! Peel it off (you get paid for it)</>;
      case 'symbiote_attached': return <>’s 💚 <b>Symbiote</b> settled on your plot — it shares its meals with you</>;
      case 'symbiote_gift': return <>’s Symbiote shared its meal with you <span className="text-ok">· +{d.ink} Ink</span></>;
      case 'parasite_shaken': return <>shook your 🦠 Parasite off their plot</>;
      case 'parasite_shrunk': return <>zapped your 🦠 Parasite with a Size Ray — it shrank right off</>;
      case 'cuckoo_egg': return <>A strange 🥚 egg appeared in your nest… throw it out in your Grimoire before it hatches</>;
      case 'cuckoo_ejected': return <>found your 🪺 Cuckoo’s egg and threw it out</>;
      case 'treasure_piece': return <>found a 🗺️ treasure map piece on your plot <span className="text-ok">· +{d.ink} Ink finder’s tip</span></>;
      case 'mirror_seen': return <>saw your ✨ enchantment in their 🪞 Mirror Shard and stepped through <span className="text-ok">· +{d.ink} Ink</span></>;
      case 'spore': return <>A spore of Ink drifted onto you {d.kind === 'wormhole' ? 'out of a 🌀 wormhole' : 'from a Spreading splice'} <span className="text-ok">· +{d.ink} Ink</span></>;
      case 'giant_tip': return <>visited your 📡 giant plot and tipped it <span className="text-ok">· +{d.ink} Ink</span></>;
      case 'size_prank': return <>🤡 <b>pranked you</b> with a 📡 Size Ray — your plot is {d.mode === 'grow' ? <b>100× GIANT</b> : <b>100× tiny</b>} on everyone’s map for {d.hours} h. Only for show — tap to see it (you can undo it there)</>;
      case 'splice_invite': return <>wants to 🧬 splice with you: <b>{d.hybrid}</b> — say yes in your Grimoire</>;
      case 'splice_accepted': return <>said yes — you’re spliced: <b>{d.hybrid}</b> 🧬</>;
      case 'splice_declined': return <>said no to your splice (you got the charge back)</>;
      case 'prophecy_sealed': return <>sealed a 🔏 prophecy about your next plot roll… roll to see if the Eye was right</>;
      case 'prophecy_true': return <>’s next roll came out just as your 👁️ Oracle foretold <span className="text-ok">· +{d.ink} Ink</span></>;
      case 'prophecy_true_you': return <>’s sealed 👁️ prophecy came true on your roll <span className="text-ok">· +{d.ink} Ink</span></>;
      default: return <>did something with an enchantment</>;
    }
  }, to: (a) => (a.data?.sub === 'size_prank' ? `/world?fly=${a.data.gx},${a.data.gy}&z=${a.data.mode === 'grow' ? 15 : 21.5}` : '/grimoire?tab=visitors') },
  leviathan: { icon: Sparkles, color: '#FF5CDB', text: (a) => {
    const d = a.data as Record<string, any>;
    switch (d.sub) {
      case 'warning': return <>🐉 <b>Something is rising {d.where}.</b> The Leviathan is coming — every player can fight it.</>;
      case 'trampled': return <>🐉 The Leviathan <b>trampled your plots</b> {d.place} — scrub the ink off to get their minigames paying in full</>;
      case 'blocked': return <>📡 Your giant plot <b>stood in the Leviathan’s way</b> and stopped it <span className="text-ok">· {Number(d.dmg).toLocaleString()} damage</span></>;
      case 'scrubbed': return <>scrubbed the Leviathan’s ink off your plot 🧽</>;
      case 'fallen': return <>🦴 <b>The Leviathan has fallen!</b> Your share: #{d.rank} <span className="text-ok">· +{d.ink} Ink</span>{d.ticket ? <> · a {d.ticket} ticket</> : null}</>;
      case 'escaped': return <>🌊 The Leviathan escaped to the sea… it will be back stronger <span className="text-ok">· +{d.ink} Ink</span></>;
      default: return <>🐉 The Leviathan stirs</>;
    }
  }, to: () => '/world' },
  ultra_set: { icon: Sparkles, color: '#FFD23F', text: (a) => <>{ultraOfRarity(a.data.rarity)?.emoji} Your <b>{ultraOfRarity(a.data.rarity)?.name ?? 'ultra'} set</b> is unlocked — a hat, outfit, relic, aura and trail for your explorer, and wear for your Inkborn</>, to: () => '/explorer' },
  neighbor: { icon: MapPin, color: '#22E3FF', text: (a) => <>claimed the plot next to yours on {worldName(a.data.world)}</>, to: () => '/world' },
};

function worldName(w?: string) {
  if (!w) return 'a planet';
  return worldOf(w)?.name ?? 'a planet';
}

const shown: { user: string | null; ids: Set<number> | null } = { user: null, ids: null };

/** New activity pops up as it happens (anywhere in the app), not just in the bell. */
export function AlertPopups() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const alerts = useAlerts();
  useEffect(() => {
    const items = alerts.data?.items;
    if (!me || !items) return;
    // kept outside the component so a remount (or a route change) never pops the same thing twice
    if (shown.user !== me.profile.id) { shown.user = me.profile.id; shown.ids = null; }
    const seen = { get current() { return shown.ids; }, set current(v) { shown.ids = v; } };
    const fresh = (a: Alert) => !a.read && Date.now() - new Date(a.created_at).getTime() < (seen.current ? 30 * 60_000 : 5 * 60_000);
    // first load: only what just happened pops up; the rest waits in the bell
    const isFirst = !seen.current;
    if (!seen.current) seen.current = new Set();
    const pop = items.filter((a) => !seen.current!.has(a.id) && ALERT[a.kind] && fresh(a)).slice(0, isFirst ? 2 : 4).reverse();
    for (const a of items) seen.current.add(a.id);
    if (!pop.length) return;
    buzz('light');
    for (const a of pop) {
      const k = ALERT[a.kind];
      const to = a.kind === 'note' ? `/u/${me.profile.username}/home` : k.to(a);
      toast.custom((id) => (
        <button data-testid="alert-popup" data-kind={a.kind} onClick={() => { toast.dismiss(id); if (to) nav(to); }}
          className="glass flex w-[min(92vw,380px)] items-center gap-3 rounded-2xl border border-line p-3 text-left text-sm text-fg shadow-xl">
          <span className="relative shrink-0">
            {a.actor ? <PlayerAvatar p={a.actor} size={36} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2"><k.icon className="h-4 w-4" style={{ color: k.color }} /></span>}
            {a.actor && <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-2"><k.icon className="h-3 w-3" style={{ color: k.color }} /></span>}
          </span>
          <span className="min-w-0 flex-1 break-words">{a.actor ? <b>@{a.actor.username} </b> : null}{k.text(a)}</span>
        </button>
      ), { id: `alert-${a.id}`, duration: 6000 });
    }
  }, [alerts.data, me, nav]);
  return null;
}

function ActivityList({ onLink }: { onLink(to: string): void }) {
  const me = useOnboardedMe();
  const alerts = useAlerts();
  const items = alerts.data?.items ?? [];
  if (alerts.isLoading) return <p className="py-6 text-center text-sm text-muted">Loading…</p>;
  if (!items.length) return <p className="py-6 text-center text-sm text-muted" data-testid="activity-empty">When someone visits you, plays with your Inkborn, warps to you, adds you as a friend or collects your art, it shows up here.</p>;
  return (
    <div className="grid max-h-[60vh] gap-1.5 overflow-y-auto pr-1 scroll-thin" data-testid="activity-list">
      {items.map((a) => {
        const k = ALERT[a.kind];
        if (!k) return null;
        const to = a.kind === 'note' && me ? `/u/${me.profile.username}/home` : k.to(a);
        return (
          <button key={a.id} onClick={() => to && onLink(to)} className={cn('flex items-center gap-3 rounded-2xl p-2.5 text-left text-sm transition hover:bg-surface-2', !a.read && 'bg-accent/10')}>
            <span className="relative shrink-0">
              {a.actor ? <PlayerAvatar p={a.actor} size={36} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2"><k.icon className="h-4 w-4" style={{ color: k.color }} /></span>}
              {a.actor && <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-2"><k.icon className="h-3 w-3" style={{ color: k.color }} /></span>}
            </span>
            <span className="min-w-0 flex-1"><span className="break-words">{a.actor ? <b>@{a.actor.username} </b> : null}{k.text(a)}</span><span className="block text-[11px] text-faint">{timeAgo(a.created_at)}</span></span>
            {!a.read && <span className="h-2 w-2 shrink-0 rounded-full bg-hot" />}
          </button>
        );
      })}
    </div>
  );
}

export function AnnouncementCard({ a, onLink }: { a: Announcement; onLink?(to: string): void }) {
  const [open, setOpen] = useState(false);
  const rich = richOf(a);
  return (
    <article className={cn('grid gap-2 rounded-[22px] border p-2', a.unread ? 'border-accent-2/50 bg-accent-2/5' : 'border-line bg-surface/50')} data-testid="announcement-card">
      <div className="relative">
        <Hero title={a.title} rich={rich} compact when={timeAgo(a.published_at)} />
        {a.unread && <span className="absolute right-2.5 top-2.5 rounded-full bg-hot px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white">NEW</span>}
      </div>
      <div className="px-1"><Features rich={rich} limit={open ? undefined : 3} body={a.body} /></div>
      <div className="flex flex-wrap gap-2 px-1 pb-1">
        {rich.features.length > 3 && <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read it all'}</Button>}
        {a.link && onLink && <Button size="sm" variant="secondary" onClick={() => onLink(a.link!)}>{rich.cta || 'Take a look'}</Button>}
      </div>
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
  return <AnnouncementPopupView a={a} open={open} onClose={() => done()} onLink={(to) => done(to)} />;
}

/** The popup players see (also used by the admin preview). */
export function AnnouncementPopupView({ a, open, onClose, onLink, preview }: { a: Announcement; open: boolean; onClose(): void; onLink(to: string): void; preview?: boolean }) {
  const rich = richOf(a);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={<span className="sr-only">{a.title}</span>}>
      <div className="-mt-2 grid gap-3" data-testid={preview ? 'announcement-popup-preview' : 'announcement-popup'}>
        {preview && <div className="rounded-xl bg-warn/15 px-3 py-1.5 text-[11px] font-bold text-warn">PREVIEW — only you can see this</div>}
        <AnnouncementPage a={a} />
        <div className="sticky bottom-0 -mx-1 flex flex-wrap gap-2 bg-gradient-to-t from-bg-2 via-bg-2/95 to-transparent px-1 pt-3">
          {a.link && <Button variant="rainbow" className="flex-1" onClick={() => onLink(a.link!)}>{rich.cta || 'Take a look'}</Button>}
          <Button variant={a.link ? 'secondary' : 'rainbow'} className="flex-1" onClick={onClose} data-testid="announcement-dismiss">Got it</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** The whole announcement (banner + every feature) — the popup, and the admin's phone preview. */
export function AnnouncementPage({ a }: { a: Announcement }) {
  const rich = richOf(a);
  return (
    <div className="grid gap-3">
      <Hero title={a.title} rich={rich} />
      <Features rich={rich} body={a.body} />
    </div>
  );
}
