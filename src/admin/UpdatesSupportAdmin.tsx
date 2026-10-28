// Admin hub: site-wide update announcements, and the support ticket queue.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Megaphone, Pencil, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Announcement } from '../backend/types';
import { cn, timeAgo } from '../lib/utils';
import { Thread, TicketRow } from '../support/SupportScreen';
import { Button, Empty, Field, Spinner, Tabs, inputCls, useConfirm } from '../ui';
import { AnnouncementCard, KIND } from '../updates/Notifications';

type Draft = { id?: string | null; title: string; body: string; kind: Announcement['kind']; link: string; popup: boolean; active: boolean };
const EMPTY: Draft = { id: null, title: '', body: '', kind: 'update', link: '', popup: true, active: true };

export function UpdatesAdmin() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ['admin', 'announcements'], queryFn: api.admin.announcements });
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'announcements'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); };
  const save = async (draft: Draft, ok: string) => {
    setBusy(true);
    try { await api.admin.saveAnnouncement({ ...draft, link: draft.link.trim() || null }); toast.success(ok); setD(EMPTY); refresh(); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const preview: Announcement = { id: 'preview', title: d.title || 'Your headline', body: d.body || 'What changed, in a sentence or two.', kind: d.kind, link: d.link || null, popup: d.popup, published_at: new Date().toISOString(), unread: true };
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <form className="glass grid content-start gap-3 rounded-[26px] p-5" onSubmit={(e) => {
        e.preventDefault();
        void save(d, d.id ? 'Update edited' : d.active ? 'Sent to every player' : 'Saved as hidden');
      }} data-testid="announcement-form">
        <div className="flex items-center gap-2 font-display text-lg font-semibold"><Megaphone className="h-5 w-5 text-accent-2" /> {d.id ? 'Edit update' : 'Send an update'}</div>
        <p className="text-xs text-muted">Shows on everyone’s bell. With “pop up” on, signed-in players also see it as a popup the next time they open LANDVAS.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="Headline" htmlFor="an-title"><input id="an-title" className={inputCls} required maxLength={120} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="New minigames are live!" /></Field>
          <Field label="Type" htmlFor="an-kind">
            <select id="an-kind" className={inputCls} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as Draft['kind'] })}>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Message" htmlFor="an-body"><textarea id="an-body" className={cn(inputCls, 'h-32 py-2.5')} required maxLength={4000} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></Field>
        <Field label="Button link (optional)" htmlFor="an-link" hint="An address inside LANDVAS, e.g. /play or /gallery">
          <input id="an-link" className={inputCls} value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} placeholder="/play" pattern="/[A-Za-z0-9/_?=&#.\-]*" />
        </Field>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.popup} onChange={(e) => setD({ ...d, popup: e.target.checked })} /> Pop up for players</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Visible</label>
        </div>
        <div className="eyebrow mt-1">Preview</div>
        <AnnouncementCard a={preview} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="rainbow" loading={busy} data-testid="announcement-send"><Send className="h-4 w-4" /> {d.id ? 'Save changes' : d.active ? 'Send to everyone' : 'Save hidden'}</Button>
          {d.id && <Button type="button" variant="ghost" onClick={() => setD(EMPTY)}>Cancel edit</Button>}
        </div>
      </form>
      <div className="grid content-start gap-2">
        <div className="eyebrow">Sent updates</div>
        {list.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : !list.data?.length ? (
          <Empty icon={<Megaphone className="h-6 w-6" />} title="No updates yet">Your first update will appear on every player’s bell.</Empty>
        ) : list.data.map((a) => (
          <div key={a.id} className={cn('glass rounded-2xl p-4', !a.active && 'opacity-60')}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: KIND[a.kind]?.color }}>{KIND[a.kind]?.label} · <span className="normal-case tracking-normal text-faint">{timeAgo(a.published_at)}{a.popup ? ' · popup' : ''}{a.active ? '' : ' · hidden'}</span></div>
                <div className="font-semibold">{a.title}</div>
                <p className="line-clamp-2 text-sm text-muted">{a.body}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Edit" onClick={() => setD({ id: a.id, title: a.title, body: a.body, kind: a.kind, link: a.link ?? '', popup: a.popup, active: a.active })}><Pencil className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label={a.active ? 'Hide' : 'Show'}
                  onClick={() => void save({ id: a.id, title: a.title, body: a.body, kind: a.kind, link: a.link ?? '', popup: a.popup, active: !a.active }, a.active ? 'Hidden from players' : 'Visible again')}>
                  {a.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button className="rounded-lg p-2 text-muted hover:bg-bad/15 hover:text-bad" aria-label="Delete" onClick={async () => {
                  if (!(await confirm({ title: 'Delete this update?', body: 'It disappears from every player’s bell.', confirm: 'Delete', danger: true }))) return;
                  try { await api.admin.deleteAnnouncement(a.id); toast.success('Deleted'); refresh(); } catch (e) { toast.error(toGameError(e).message); }
                }}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SupportAdmin() {
  const [status, setStatus] = useState<'open' | 'answered' | 'closed' | 'all'>('open');
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin', 'support', status], queryFn: () => api.admin.supportTickets(status === 'all' ? null : status), refetchInterval: 20_000 });
  if (open) return <Thread id={open} staff onBack={() => setOpen(null)} />;
  const c = q.data?.counts;
  return (
    <div className="grid gap-3" data-testid="support-admin">
      <Tabs value={status} onValueChange={(v) => setStatus(v as any)} items={[
        { value: 'open', label: `Waiting${c ? ` (${c.open})` : ''}` },
        { value: 'answered', label: `Answered${c ? ` (${c.answered})` : ''}` },
        { value: 'closed', label: `Closed${c ? ` (${c.closed})` : ''}` },
        { value: 'all', label: 'All' },
      ]} />
      <p className="text-xs text-muted">Players write in from Help → Support. Your replies are signed “LANDVAS Support” — your own account is never shown to them.</p>
      {q.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : !q.data?.tickets.length ? (
        <Empty title={status === 'open' ? 'Inbox zero' : 'Nothing here'}>{status === 'open' ? 'No tickets are waiting for a reply.' : 'No tickets in this list.'}</Empty>
      ) : q.data.tickets.map((t) => <TicketRow key={t.id} t={t} staff onOpen={() => setOpen(t.id)} />)}
    </div>
  );
}
