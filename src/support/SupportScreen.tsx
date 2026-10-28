// /support — in-app help. Tickets replace every public email address: players write
// to the team here, replies come back here (and ring the bell).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, LifeBuoy, MessageSquarePlus, Send } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { SupportTicket } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { cn, timeAgo } from '../lib/utils';
import { Button, Empty, Field, PlayerAvatar, Spinner, inputCls } from '../ui';

export const CATEGORIES: { value: string; label: string }[] = [
  { value: 'bug', label: 'Something’s broken' },
  { value: 'account', label: 'My account' },
  { value: 'minigames', label: 'Minigames & Ink' },
  { value: 'payments', label: 'Rent, boosts & cash-out' },
  { value: 'art', label: 'Art & reviews' },
  { value: 'report', label: 'Report a player' },
  { value: 'copyright', label: 'Copyright' },
  { value: 'privacy', label: 'Privacy & data (incl. deleting my account)' },
  { value: 'other', label: 'Something else' },
];
const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const STATUS: Record<SupportTicket['status'], { label: string; cls: string }> = {
  open: { label: 'Waiting for support', cls: 'border-warn/40 bg-warn/10 text-warn' },
  answered: { label: 'Support replied', cls: 'border-ok/40 bg-ok/10 text-ok' },
  closed: { label: 'Closed', cls: 'border-line text-faint' },
};

export default function SupportScreen() {
  const me = useOnboardedMe();
  const [sp, setSp] = useSearchParams();
  const open = sp.get('t');
  const mine = useQuery({ queryKey: ['support', 'mine'], queryFn: api.supportMine, enabled: !!me, refetchInterval: 30_000 });
  const [composing, setComposing] = useState(sp.get('new') === '1');
  if (!me) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (open) return <Page><Thread id={open} onBack={() => setSp({})} staff={false} /></Page>;
  const tickets = mine.data ?? [];
  return (
    <Page>
      <PageHeader eyebrow="Help" title={<span className="flex items-center gap-2"><LifeBuoy className="h-7 w-7 text-accent-2" /> Support</span>}
        actions={!composing && <Button variant="primary" onClick={() => setComposing(true)} data-testid="support-new"><MessageSquarePlus className="h-4 w-4" /> New ticket</Button>}>
        Tell us what’s up and the LANDVAS team will reply right here. You’ll get a notification on the bell when we answer.
      </PageHeader>
      {composing && <NewTicket defaultCategory={sp.get('category') ?? 'bug'} onDone={(id) => { setComposing(false); setSp({ t: id }); }} onCancel={() => setComposing(false)} />}
      {mine.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : !tickets.length && !composing ? (
        <Empty icon={<LifeBuoy className="h-6 w-6" />} title="No tickets yet" action={<Button variant="primary" onClick={() => setComposing(true)}>Ask for help</Button>}>
          Questions, bugs, reports or requests about your data — it all starts here.
        </Empty>
      ) : (
        <div className="mt-4 grid gap-2" data-testid="support-list">
          {tickets.map((t) => <TicketRow key={t.id} t={t} onOpen={() => setSp({ t: t.id })} />)}
        </div>
      )}
    </Page>
  );
}

export function TicketRow({ t, onOpen, staff }: { t: SupportTicket; onOpen(): void; staff?: boolean }) {
  const st = STATUS[t.status];
  return (
    <button onClick={onOpen} className={cn('glass grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl p-4 text-left transition hover:ring-1 hover:ring-line-strong', t.unread && 'ring-1 ring-accent-2/60')} data-testid="support-ticket">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-hot" aria-label="New reply" />}
          <span className="truncate font-semibold">{t.subject}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {staff && t.player && <span className="flex items-center gap-1"><PlayerAvatar p={t.player} size={16} /> @{t.player.username}</span>}
          <span>{catLabel(t.category)}</span><span>· {t.messages} message{t.messages === 1 ? '' : 's'}</span><span>· {timeAgo(t.last_message_at)}</span>
        </div>
      </div>
      <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold', st.cls)}>{st.label}</span>
    </button>
  );
}

function NewTicket({ defaultCategory, onDone, onCancel }: { defaultCategory: string; onDone(id: string): void; onCancel(): void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ subject: '', category: CATEGORIES.some((c) => c.value === defaultCategory) ? defaultCategory : 'bug', body: '' });
  const [busy, setBusy] = useState(false);
  return (
    <form className="glass mb-4 grid gap-3 rounded-[26px] p-5" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        const t = await api.supportCreate(f.subject.trim(), f.category, f.body.trim());
        toast.success('Ticket sent — we’ll reply here');
        void qc.invalidateQueries({ queryKey: ['support'] });
        onDone(t.id);
      } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
    }} data-testid="support-form">
      <Field label="What’s it about?" htmlFor="st-cat">
        <select id="st-cat" className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Subject" htmlFor="st-subject">
        <input id="st-subject" className={inputCls} required minLength={3} maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="A short summary" />
      </Field>
      <Field label="Details" htmlFor="st-body" hint="Never share your password. Include what you did and what happened.">
        <textarea id="st-body" className={cn(inputCls, 'h-36 py-2.5')} required minLength={5} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={busy} data-testid="support-send"><Send className="h-4 w-4" /> Send to support</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** One ticket's conversation. Used by players (/support) and staff (admin hub). */
export function Thread({ id, onBack, staff }: { id: string; onBack(): void; staff: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['support', 'ticket', id], queryFn: () => api.supportTicket(id), refetchInterval: 20_000 });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['support'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); void qc.invalidateQueries({ queryKey: ['admin', 'support'] }); };
  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!q.data) return <Empty title="Ticket not found" action={<Button onClick={onBack}>Back</Button>} />;
  const t = q.data;
  const st = STATUS[t.status];
  return (
    <div className="grid gap-4" data-testid="support-thread">
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold">{t.subject}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className={cn('rounded-full border px-2 py-0.5 font-bold', st.cls)}>{st.label}</span>
            <span>{catLabel(t.category)}</span><span>· opened {timeAgo(t.created_at)}</span>
            {staff && t.player && <button className="font-semibold text-accent-2 hover:underline" onClick={() => nav(`/u/${t.player!.username}`)}>@{t.player.username}</button>}
          </div>
        </div>
      </div>
      <ol className="grid gap-2">
        {t.thread.map((m) => (
          <li key={m.id} className={cn('max-w-[min(560px,92%)] rounded-2xl p-3 text-sm', m.is_staff ? 'justify-self-start border border-accent-2/30 bg-accent-2/10' : 'justify-self-end bg-surface-2')}>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted">
              {m.is_staff ? <><LifeBuoy className="h-3.5 w-3.5 text-accent-2" /> LANDVAS Support</> : <>{m.author?.username ? `@${m.author.username}` : 'Player'}</>}
              <span className="font-normal text-faint">· {timeAgo(m.created_at)}</span>
            </div>
            <p className="whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ol>
      <form className="glass grid gap-2 rounded-2xl p-3" onSubmit={async (e) => {
        e.preventDefault();
        if (!reply.trim()) return;
        setBusy(true);
        try { await api.supportReply(id, reply.trim()); setReply(''); refresh(); void q.refetch(); }
        catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
      }}>
        <textarea className={cn(inputCls, 'h-24 py-2.5')} maxLength={4000} placeholder={staff ? 'Reply as LANDVAS Support…' : t.status === 'closed' ? 'Write to reopen this ticket…' : 'Add a message…'}
          value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" data-testid="support-reply-input" />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={busy} disabled={!reply.trim()} data-testid="support-reply"><Send className="h-4 w-4" /> {staff ? 'Send reply' : 'Send'}</Button>
          {t.status !== 'closed' ? (
            <Button type="button" variant="ghost" onClick={async () => { try { await api.supportSetStatus(id, 'closed'); refresh(); void q.refetch(); } catch (err) { toast.error(toGameError(err).message); } }}>
              <CheckCircle2 className="h-4 w-4" /> {staff ? 'Close ticket' : 'My issue is solved'}
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={async () => { try { await api.supportSetStatus(id, 'open'); refresh(); void q.refetch(); } catch (err) { toast.error(toGameError(err).message); } }}>Reopen</Button>
          )}
        </div>
      </form>
    </div>
  );
}
