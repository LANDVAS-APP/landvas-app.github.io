// Social: the live feed of what everyone is doing, the global chat, and friends.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Ban, Brush, DoorOpen, Flag, Gift, Hand, Loader2, MessageCircle, MoreHorizontal, Radio, Send, ShieldAlert, Sparkles, Trash2, UserPlus, Users, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ChatMessage, FeedEvent } from '../backend/types';
import { useSession } from '../app/App';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt, timeAgo } from '../lib/utils';
import { ArtThumb } from '../gallery/GalleryScreen';
import { RarityBadge } from '../plot/RarityBadge';
import { PLOT_TYPES } from '../map/plotStyle';
import { Button, Dialog, Empty, PlayerAvatar, Spinner, Tabs, inputCls, useConfirm } from '../ui';
import { FriendButton } from './FriendButton';

const TABS = [
  { value: 'feed', label: 'Live feed' },
  { value: 'chat', label: 'Chat' },
  { value: 'friends', label: 'Friends' },
];

export default function SocialScreen() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'feed';
  const me = useOnboardedMe();
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, refetchInterval: 30_000 });
  const incoming = friends.data?.incoming.length ?? 0;
  return (
    <Page wide>
      <PageHeader eyebrow="Together" title="Social" actions={<>
        <Link to="/players" className="glass flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-muted hover:text-fg"><Users className="h-4 w-4" /> Players</Link>
        {me && <Link to="/invite" className="glass flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-gold hover:text-fg" data-testid="social-invite"><Gift className="h-4 w-4" /> Invite</Link>}
      </>}>
        See what everyone is claiming and painting right now, talk with the whole world, and keep your friends close.
      </PageHeader>
      <Tabs value={tab} onValueChange={(v) => setParams((p) => { p.set('tab', v); return p; }, { replace: true })} className="mb-4"
        items={TABS.map((t) => ({ value: t.value, label: t.value === 'friends' && incoming ? <span className="flex items-center gap-1.5">Friends <span className="rounded-full bg-hot px-1.5 text-[11px] font-bold text-white tnum">{incoming}</span></span> : t.label }))} />
      {tab === 'feed' && <FeedTab />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'friends' && <FriendsTab />}
    </Page>
  );
}

// ---- live feed ---------------------------------------------------------------------------

function FeedTab() {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [older, setOlder] = useState<'idle' | 'loading' | 'done'>('idle');
  const newest = useRef<number | null>(null);
  const poll = useCallback(async () => {
    try {
      const fresh = await api.feed(newest.current, null, 40);
      if (fresh.length) {
        newest.current = Math.max(newest.current ?? 0, fresh[0].id);
        setEvents((e) => dedupe([...fresh, ...(e ?? [])]).slice(0, 400));
      } else setEvents((e) => e ?? []);
    } catch {
      setEvents((e) => e ?? []);
    }
  }, []);
  useEffect(() => {
    void poll();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 8000);
    return () => clearInterval(t);
  }, [poll]);
  const loadOlder = async () => {
    if (!events?.length) return;
    setOlder('loading');
    try {
      const more = await api.feed(null, events[events.length - 1].id, 40);
      setEvents((e) => dedupe([...(e ?? []), ...more]));
      setOlder(more.length < 40 ? 'done' : 'idle');
    } catch { setOlder('idle'); }
  };
  if (!events) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!events.length) return <Empty icon={<Radio className="h-6 w-6" />} title="Quiet right now">Claims, new art and badges from everyone show up here live.</Empty>;
  return (
    <div className="mx-auto grid max-w-2xl gap-2" data-testid="feed">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted"><span className="lv-live"><i /> Live</span> Updates every few seconds · no locations, ever</div>
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.div key={e.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <FeedRow e={e} />
          </motion.div>
        ))}
      </AnimatePresence>
      {older !== 'done' && events.length >= 20 && (
        <Button variant="ghost" className="mt-2 justify-self-center" loading={older === 'loading'} onClick={loadOlder}>Show older</Button>
      )}
    </div>
  );
}

const dedupe = <T extends { id: number }>(list: T[]) => {
  const seen = new Set<number>();
  return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
};

function FeedRow({ e }: { e: FeedEvent }) {
  const p = e.player;
  const who = <Link to={`/u/${p.username}`} className="font-bold hover:underline">@{p.username}</Link>;
  let icon = <Sparkles className="h-4 w-4 text-accent-2" />;
  let body: React.ReactNode = null;
  let extra: React.ReactNode = null;
  switch (e.kind) {
    case 'join':
      icon = <Hand className="h-4 w-4 text-gold" />;
      body = <>{who} joined LANDVAS — say hi!</>;
      break;
    case 'claim': {
      const t = e.data.plot_type as keyof typeof PLOT_TYPES | undefined;
      icon = <Flag className="h-4 w-4 text-ok" />;
      body = <>{who} {e.data.starter ? 'claimed their first plot' : 'claimed a plot'}{t && PLOT_TYPES[t] ? <> · <span className="text-muted">{PLOT_TYPES[t].name}</span></> : null}</>;
      if (e.data.rarity) extra = <RarityBadge r={e.data.rarity} small />;
      break;
    }
    case 'publish':
      icon = <Brush className="h-4 w-4 text-hot" />;
      body = <>{who} published <Link to={`/art/${e.data.publication_id}`} className="font-semibold hover:underline">“{e.data.title}”</Link>{e.data.plot_count > 1 ? <span className="text-muted"> · {e.data.plot_count} plots</span> : null}</>;
      extra = e.data.thumb_path ? <Link to={`/art/${e.data.publication_id}`}><ArtThumb card={{ thumb_path: e.data.thumb_path, title: e.data.title }} className="h-14 w-14 rounded-xl" /></Link> : null;
      break;
    case 'achievement':
      icon = <Award className="h-4 w-4 text-gold" />;
      body = <>{who} earned the <b>{e.data.name}</b> badge</>;
      break;
    case 'referral':
      icon = <Gift className="h-4 w-4 text-gold" />;
      body = <>{who} invited a friend{Number(e.data.reward_ink) > 0 ? <> and earned <b className="tnum">{fmt(e.data.reward_ink)} Ink</b></> : null}</>;
      break;
    case 'level':
      icon = <Sparkles className="h-4 w-4 text-accent-2" />;
      body = <>{who} reached artist level <b>{e.data.level}</b></>;
      break;
  }
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3" data-testid="feed-row" data-kind={e.kind}>
      <Link to={`/u/${p.username}`} className="relative shrink-0">
        <PlayerAvatar p={p} size={38} />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-2 shadow">{icon}</span>
      </Link>
      <div className="min-w-0 flex-1 text-sm">
        <div className="break-words">{body}</div>
        <div className="text-[11.5px] text-faint">{timeAgo(e.created_at)}</div>
      </div>
      {extra && <div className="shrink-0">{extra}</div>}
    </div>
  );
}

// ---- global chat ---------------------------------------------------------------------------

const REPORT_REASONS = [
  { id: 'harassment', label: 'Rude, hateful or bullying' },
  { id: 'spam', label: 'Spam or a scam' },
  { id: 'personal_info', label: 'Shares someone’s personal info' },
  { id: 'inappropriate', label: 'Sexual or inappropriate' },
  { id: 'other', label: 'Something else' },
];

function ChatTab() {
  const session = useSession();
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [info, setInfo] = useState<{ enabled: boolean; muted_until: string | null }>({ enabled: true, muted_until: null });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<ChatMessage | null>(null);
  const lastId = useRef<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const mod = !!me?.roles?.some((r) => ['owner', 'admin', 'moderator'].includes(r));

  const load = useCallback(async (reset: boolean) => {
    try {
      const r = await api.chatRecent(reset ? null : lastId.current);
      setInfo({ enabled: r.enabled, muted_until: r.muted_until });
      const newest = r.messages[r.messages.length - 1]?.id;
      if (newest) lastId.current = Math.max(reset ? 0 : lastId.current ?? 0, newest);
      setMsgs((m) => (reset ? r.messages : dedupe([...(m ?? []), ...r.messages]).slice(-200)));
    } catch {
      setMsgs((m) => m ?? []);
    }
  }, []);
  useEffect(() => {
    if (!me) return;
    void load(true);
    let n = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      // a full refresh now and then also drops messages moderators removed
      void load(++n % 24 === 0);
    }, 2500);
    return () => clearInterval(t);
  }, [me, load]);
  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  if (!session || !me) {
    return <Empty icon={<MessageCircle className="h-6 w-6" />} title="Join the conversation" action={<Link to="/welcome?next=/social?tab=chat" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">Sign in to chat</Link>}>Talk with players all over the world.</Empty>;
  }
  const muted = info.muted_until && new Date(info.muted_until) > new Date();
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await api.sendChat(body);
      setText('');
      stick.current = true;
      lastId.current = Math.max(lastId.current ?? 0, m.id);
      setMsgs((x) => dedupe([...(x ?? []), m]).slice(-200));
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setSending(false);
    }
  };
  const block = async (m: ChatMessage) => {
    if (!(await confirm({ title: `Block @${m.player.username}?`, body: 'You won’t see their messages or art any more. You can unblock them from their profile or Settings.', confirm: 'Block' }))) return;
    try { await api.blockPlayer(m.player.id, true); toast.success(`@${m.player.username} is blocked`); void load(true); void qc.invalidateQueries({ queryKey: ['profile'] }); } catch (e) { toast.error(toGameError(e).message); }
  };
  const remove = async (m: ChatMessage) => {
    try { await api.admin.deleteChat(m.id, 'Removed by a moderator'); setMsgs((x) => (x ?? []).filter((y) => y.id !== m.id)); toast.success('Message removed'); } catch (e) { toast.error(toGameError(e).message); }
  };
  const mute = async (m: ChatMessage) => {
    try { await api.admin.mutePlayer(m.player.id, 60, 'Muted from the chat'); toast.success(`@${m.player.username} is muted for an hour`); } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <div className="mx-auto grid max-w-3xl gap-3">
      <div className="glass flex h-[min(64dvh,640px)] flex-col overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-bold"><MessageCircle className="h-4 w-4 text-accent-2" /> Global chat</span>
          <span className="lv-live"><i /> Live</span>
        </div>
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scroll-thin" data-testid="chat-list"
          onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
          {!msgs ? <div className="flex justify-center py-10"><Spinner /></div> : !msgs.length ? (
            <p className="px-3 py-10 text-center text-sm text-muted">No messages yet — say hello to the world 👋</p>
          ) : msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const grouped = prev && prev.player.id === m.player.id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60_000;
            const mine = m.player.id === me.profile.id;
            return (
              <div key={m.id} className={cn('group flex gap-2.5 rounded-xl px-2 hover:bg-surface-2/50', grouped ? 'py-0.5' : 'mt-1.5 py-1', m.deleted && 'opacity-50')} data-testid="chat-message">
                <div className="w-8 shrink-0">{!grouped && <Link to={`/u/${m.player.username}`}><PlayerAvatar p={m.player} size={32} /></Link>}</div>
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2">
                      <Link to={`/u/${m.player.username}`} className="truncate text-[13px] font-bold hover:underline" style={{ color: m.player.accent_color }}>{m.player.display_name || m.player.username}</Link>
                      <span className="truncate text-[11px] text-faint">@{m.player.username} · {timeAgo(m.created_at)}</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">{m.body}{m.deleted ? <span className="ml-1 text-[11px] text-bad">(removed)</span> : null}</p>
                </div>
                {!mine && (
                  <MessageMenu mod={mod} onReport={() => setReport(m)} onBlock={() => block(m)} onDelete={() => remove(m)} onMute={() => mute(m)} />
                )}
              </div>
            );
          })}
        </div>
        <form className="flex items-center gap-2 border-t border-line p-2.5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          {!info.enabled ? <p className="flex-1 px-2 text-sm text-muted">The chat is switched off right now.</p> : muted ? (
            <p className="flex flex-1 items-center gap-2 px-2 text-sm text-warn"><VolumeX className="h-4 w-4" /> You’re muted until {new Date(info.muted_until!).toLocaleString()}.</p>
          ) : (
            <>
              <input className={cn(inputCls, 'h-11 flex-1')} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Message everyone…" aria-label="Chat message" data-testid="chat-input" enterKeyHint="send" />
              <Button type="submit" variant="primary" size="icon" className="h-11 w-11" disabled={!text.trim() || sending} aria-label="Send" data-testid="chat-send">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </>
          )}
        </form>
      </div>
      <p className="flex items-start gap-2 px-1 text-xs text-muted"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Be kind. Links aren’t allowed, rude words are masked, and moderators review every report. Never share where you live, your phone number or other personal details.</p>
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)} title="Report this message" description={report ? `“${report.body.slice(0, 120)}” — @${report.player.username}` : undefined}>
        <div className="grid gap-1.5">
          {REPORT_REASONS.map((r) => (
            <Button key={r.id} variant="ghost" className="justify-start" onClick={async () => {
              const m = report!;
              setReport(null);
              try { await api.reportChat(m.id, r.id); toast.success('Thanks — a moderator will take a look'); } catch (e) { toast.error(toGameError(e).message); }
            }}>{r.label}</Button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

function MessageMenu({ mod, onReport, onBlock, onDelete, onMute }: { mod: boolean; onReport(): void; onBlock(): void; onDelete(): void; onMute(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0 self-start">
      <button className="rounded-lg p-1 text-faint opacity-60 hover:bg-surface-2 hover:text-fg group-hover:opacity-100" onClick={() => setOpen((o) => !o)} aria-label="Message options" aria-expanded={open}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="glass absolute right-0 top-7 z-20 grid w-44 gap-0.5 rounded-2xl p-1.5 text-sm shadow-xl">
            <MenuItem icon={<Flag className="h-4 w-4" />} label="Report" onClick={() => { setOpen(false); onReport(); }} />
            <MenuItem icon={<Ban className="h-4 w-4" />} label="Block player" onClick={() => { setOpen(false); onBlock(); }} />
            {mod && <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Delete message" danger onClick={() => { setOpen(false); onDelete(); }} />}
            {mod && <MenuItem icon={<VolumeX className="h-4 w-4" />} label="Mute for 1 hour" danger onClick={() => { setOpen(false); onMute(); }} />}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick(): void; danger?: boolean }) {
  return <button className={cn('flex items-center gap-2 rounded-xl px-2.5 py-2 text-left font-semibold hover:bg-surface-2', danger && 'text-bad')} onClick={onClick}>{icon}{label}</button>;
}

// ---- friends ------------------------------------------------------------------------------

function FriendsTab() {
  const me = useOnboardedMe();
  const session = useSession();
  const q = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, refetchInterval: 30_000 });
  if (!session || !me) return <Empty icon={<UserPlus className="h-6 w-6" />} title="Make friends" action={<Link to="/welcome?next=/social?tab=friends" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">Sign in</Link>}>Add players as friends to keep up with their art.</Empty>;
  if (!q.data) return <div className="flex justify-center py-16"><Spinner /></div>;
  const { friends, incoming, outgoing } = q.data;
  return (
    <div className="mx-auto grid max-w-3xl gap-5" data-testid="friends">
      {incoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold">Friend requests</h2>
          <div className="grid gap-2">
            {incoming.map((r) => (
              <div key={r.player.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3" data-testid="friend-request">
                <Link to={`/u/${r.player.username}`}><PlayerAvatar p={r.player} size={40} /></Link>
                <div className="min-w-0 flex-1"><div className="truncate font-bold">{r.player.display_name || r.player.username}</div><div className="text-xs text-muted">@{r.player.username} · {timeAgo(r.at)}</div></div>
                <FriendButton playerId={r.player.id} username={r.player.username} />
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="mb-2 flex items-end justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Friends{friends.length ? ` (${friends.length})` : ''}</h2>
          <Link to="/players" className="text-xs font-bold text-accent-2 hover:underline">Find players</Link>
        </div>
        {!friends.length ? (
          <Empty icon={<Users className="h-6 w-6" />} title="No friends yet" action={<Link to="/invite" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">Invite a friend</Link>}>Add players from their profile or the Players page — or invite someone you know.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {friends.map((f) => (
              <div key={f.player.id} className="glass flex items-center gap-3 rounded-2xl p-3" data-testid="friend-row">
                <Link to={`/u/${f.player.username}`}><PlayerAvatar p={f.player} size={44} /></Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${f.player.username}`} className="block truncate font-bold hover:underline">{f.player.display_name || f.player.username}</Link>
                  <div className="text-xs text-muted">@{f.player.username} · {fmt(f.plots)} plot{f.plots === 1 ? '' : 's'}</div>
                </div>
                <Link to={`/u/${f.player.username}/room`} className="flex h-8 items-center gap-1 rounded-xl border border-line px-2.5 text-xs font-bold hover:border-line-strong" aria-label={`Visit @${f.player.username}'s room`}><DoorOpen className="h-3.5 w-3.5" /> Room</Link>
              </div>
            ))}
          </div>
        )}
      </section>
      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold">Sent requests</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {outgoing.map((r) => (
              <div key={r.player.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                <PlayerAvatar p={r.player} size={36} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">@{r.player.username}</div><div className="text-xs text-muted">sent {timeAgo(r.at)}</div></div>
                <FriendButton playerId={r.player.id} username={r.player.username} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
