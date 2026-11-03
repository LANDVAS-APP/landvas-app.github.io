// Admin hub: site-wide update announcements, and the support ticket queue.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, GitCommitHorizontal, Megaphone, MonitorSmartphone, Pencil, Send, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { AdminAnnouncement, Announcement } from '../backend/types';
import { cn, timeAgo } from '../lib/utils';
import { Thread, TicketRow } from '../support/SupportScreen';
import { Button, Empty, Field, Spinner, Tabs, inputCls, useConfirm } from '../ui';
import { AnnouncementCard, AnnouncementPopupView, KIND } from '../updates/Notifications';

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
  const drafts = (list.data ?? []).filter((a) => a.status === 'draft');
  const sent = (list.data ?? []).filter((a) => a.status !== 'draft');
  return (
    <div className="grid gap-4">
    {drafts.length > 0 && (
      <section className="grid gap-3" data-testid="drafts">
        <div className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles className="h-5 w-5 text-accent-2" /> Waiting for your approval</div>
        <p className="-mt-2 text-xs text-muted">Written automatically from each new build (or saved by you). Players can’t see a draft until you approve it — edit anything first. Later builds keep adding to the waiting build draft until you do.</p>
        {drafts.map((a) => <DraftCard key={a.id} a={a} onDone={refresh} />)}
      </section>
    )}
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
          {!d.id && <Button type="button" variant="secondary" disabled={busy || !d.title.trim() || !d.body.trim()} data-testid="announcement-draft" onClick={async () => {
            setBusy(true);
            try { await api.admin.draftAnnouncement({ ...d, link: d.link.trim() || null }); toast.success('Saved as a draft — preview it above'); setD(EMPTY); refresh(); }
            catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
          }}>Save as draft to preview</Button>}
          {d.id && <Button type="button" variant="ghost" onClick={() => setD(EMPTY)}>Cancel edit</Button>}
        </div>
      </form>
      <div className="grid content-start gap-2">
        <div className="eyebrow">Sent updates</div>
        {list.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : !sent.length ? (
          <Empty icon={<Megaphone className="h-6 w-6" />} title="No updates yet">Your first update will appear on every player’s bell.</Empty>
        ) : sent.map((a) => (
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
    </div>
  );
}

/** One auto-written draft: edit it, see exactly what players will see (bell card and popup), then approve or discard. */
function DraftCard({ a, onDone }: { a: AdminAnnouncement; onDone(): void }) {
  const confirm = useConfirm();
  const [d, setD] = useState({ title: a.title, body: a.body, kind: a.kind, link: a.link ?? '', popup: a.popup });
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [popup, setPopup] = useState(false);
  const [notes, setNotes] = useState(false);
  const changed = d.title !== a.title || d.body !== a.body || d.kind !== a.kind || d.link !== (a.link ?? '') || d.popup !== a.popup;
  const shown: Announcement = { id: a.id, title: d.title || 'Headline', body: d.body || '…', kind: d.kind, link: d.link.trim() || null, popup: d.popup, published_at: new Date().toISOString(), unread: true };
  const builds = a.builds ?? [];
  const valid = d.title.trim().length > 0 && d.body.trim().length > 0;
  const save = async () => {
    setBusy('save');
    try { await api.admin.saveAnnouncement({ id: a.id, title: d.title, body: d.body, kind: d.kind, link: d.link.trim() || null, popup: d.popup, active: true }); toast.success('Draft saved'); onDone(); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const publish = async () => {
    if (!(await confirm({ title: 'Publish this update?', body: d.popup ? 'It goes on every player’s bell and pops up the next time they open LANDVAS.' : 'It goes on every player’s bell.', confirm: 'Publish' }))) return;
    setBusy('publish');
    try { await api.admin.publishAnnouncement({ id: a.id, title: d.title, body: d.body, kind: d.kind, link: d.link.trim() || null, popup: d.popup }); toast.success('Published to every player'); onDone(); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const discard = async () => {
    if (!(await confirm({ title: 'Discard this draft?', body: 'Players never see it. The next build starts a fresh draft.', confirm: 'Discard', danger: true }))) return;
    try { await api.admin.deleteAnnouncement(a.id); toast.success('Draft discarded'); onDone(); } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <div className="glass grid gap-4 rounded-[26px] border border-accent-2/40 p-5 xl:grid-cols-[1fr_1fr]" data-testid="draft-card">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-accent-2">
          <span className="rounded-full bg-accent-2/15 px-2 py-0.5">Draft</span>
          <span className="normal-case tracking-normal text-faint">{a.source === 'auto' ? `auto-written from ${builds.length} build${builds.length === 1 ? '' : 's'}` : 'saved by staff'} · {timeAgo((a as any).created_at ?? a.published_at)}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
          <Field label="Headline" htmlFor={`dr-t-${a.id}`}><input id={`dr-t-${a.id}`} className={inputCls} maxLength={120} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} data-testid="draft-title" /></Field>
          <Field label="Type" htmlFor={`dr-k-${a.id}`}>
            <select id={`dr-k-${a.id}`} className={inputCls} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as Announcement['kind'] })}>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Message" htmlFor={`dr-b-${a.id}`}><textarea id={`dr-b-${a.id}`} className={cn(inputCls, 'h-48 py-2.5 text-sm')} maxLength={4000} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} data-testid="draft-body" /></Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Button link (optional)" htmlFor={`dr-l-${a.id}`}><input id={`dr-l-${a.id}`} className={inputCls} value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} placeholder="/space" pattern="/[A-Za-z0-9/_?=&#.\-]*" /></Field>
          <label className="flex h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.popup} onChange={(e) => setD({ ...d, popup: e.target.checked })} /> Pop up for players</label>
        </div>
        {builds.length > 0 && (
          <div className="rounded-2xl bg-surface-2/60 p-3 text-xs">
            <button className="flex items-center gap-1.5 font-bold text-muted hover:text-fg" onClick={() => setNotes(!notes)}><GitCommitHorizontal className="h-4 w-4" /> {notes ? 'Hide' : 'Show'} the build notes it was written from</button>
            {notes && builds.map((b) => (
              <div key={b.sha} className="mt-2">
                <div className="font-mono text-[10px] text-faint">{b.sha.slice(0, 7)} · {timeAgo(b.at)}</div>
                <ul className="ml-4 list-disc text-muted">{b.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid content-start gap-3">
        <div className="eyebrow">Preview — what players will see</div>
        <AnnouncementCard a={shown} onLink={() => {}} />
        <Button variant="secondary" onClick={() => setPopup(true)} disabled={!d.popup} data-testid="draft-preview-popup"><MonitorSmartphone className="h-4 w-4" /> {d.popup ? 'Preview the pop-up' : 'Pop-up is off'}</Button>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button variant="rainbow" onClick={publish} loading={busy === 'publish'} disabled={!valid || !!busy} data-testid="draft-publish"><CheckCircle2 className="h-4 w-4" /> Approve & publish</Button>
          {changed && <Button variant="secondary" onClick={save} loading={busy === 'save'} disabled={!valid || !!busy} data-testid="draft-save">Save draft</Button>}
          <Button variant="ghost" onClick={discard} disabled={!!busy} data-testid="draft-discard"><Trash2 className="h-4 w-4" /> Discard</Button>
        </div>
      </div>
      <AnnouncementPopupView a={shown} open={popup} onClose={() => setPopup(false)} onLink={() => setPopup(false)} preview />
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
