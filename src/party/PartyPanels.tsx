// The Party: your party (who's in it, what they're up to, the chat), inviting people (online now, friends, a link),
// and the lobbies — every live public party, the busiest first. Shown on the Party page and in the Party sheet
// that opens from anywhere.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Crown, Globe2, Link2, Lock, LogOut, MapPin, MessageCircle, Pencil, Search, Send, Share2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { JoinablePlayer, LfgItem, PartyActivity, PartyLobby, PartyPreview, PartyState, PartyTarget, PartyVisibility, TravelGroupMember } from '../backend/types';
import { useExplorer } from '../explorer/explorer';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, timeAgo } from '../lib/utils';
import { buzz } from '../native/native';
import { canWarpTo, describeWhereabouts, useWarpTo } from '../social/activity';
import { Button, Dialog, Empty, PlayerAvatar, Spinner, Tabs, inputCls, useConfirm } from '../ui';
import { ChatLine } from './ChatDock';
import { usePartyChat } from './usePartyChat';
import {
  ACTIVITIES, ACTIVITY_IDS, LOBBIES_KEY, PARTY_KEY, activityOf, goTarget, goTo, memberAt, memberStatus, partyLink, savePendingParty,
  useParty, usePartyJoin, type PartyTab,
} from './party';
import { useAutoJoin } from './lfg';

type Group = NonNullable<PartyState['group']>;

/** the three tabs; the page and the sheet both use this */
export default function PartyPanels({ tab, setTab, onDone }: { tab: PartyTab; setTab(t: PartyTab): void; onDone?(): void }) {
  const q = useParty();
  const invites = q.data?.invites.length ?? 0;
  return (
    <div className="min-w-0" data-testid="party-panels">
      <Tabs value={tab} onValueChange={(v) => setTab(v as PartyTab)} className="mb-4"
        items={[
          { value: 'party', label: <span className="flex items-center gap-1.5">{q.data?.group ? 'My party' : 'Party'}{invites > 0 && <span className="rounded-full bg-hot px-1.5 text-[11px] font-bold text-white tnum">{invites}</span>}</span> },
          { value: 'lobbies', label: 'Lobbies' },
          { value: 'invite', label: 'Invite' },
        ]} />
      {tab === 'party' && <PartyHome onDone={onDone} setTab={setTab} />}
      {tab === 'lobbies' && <LobbyList setTab={setTab} onDone={onDone} />}
      {tab === 'invite' && <InvitePanel />}
    </div>
  );
}

// ---- your party ----------------------------------------------------------------------------------------------------
export function PartyHome({ onDone, setTab }: { onDone?(): void; setTab(t: PartyTab): void }) {
  const q = useParty();
  const d = q.data;
  if (!d) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {d.invites.length > 0 && <InvitesReceived invites={d.invites} />}
      {d.group ? <MyParty g={d.group} onDone={onDone} setTab={setTab} /> : <StartParty setTab={setTab} />}
    </div>
  );
}

function InvitesReceived({ invites }: { invites: PartyState['invites'] }) {
  const qc = useQueryClient();
  const join = usePartyJoin();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="party-invites">
      {invites.map((i) => (
        <div key={i.group_id} className="flex items-center gap-3 rounded-2xl border border-ok/40 bg-ok/10 p-3" data-testid="party-invite">
          <PlayerAvatar p={i.by} size={38} />
          <div className="min-w-0 flex-1 text-sm">
            <b>@{i.by.username}</b> invited you to <b>“{i.name ?? 'their party'}”</b>
            <div className="text-[12px] text-muted">{activityOf(i.activity).emoji} {activityOf(i.activity).label} · {i.size} in the party{i.at ? ` · ${timeAgo(i.at)}` : ''}</div>
          </div>
          <Button size="sm" variant="primary" loading={busy === i.group_id} data-testid="party-invite-accept" onClick={async () => {
            setBusy(i.group_id);
            try { if (await join({ kind: 'invite', id: i.group_id }, i.name)) { buzz('success'); toast.success(`You’re in “${i.name ?? 'the party'}” 🎉`); } }
            catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
          }}>Join</Button>
          <button className="text-muted hover:text-fg" aria-label="Decline" data-testid="party-invite-decline"
            onClick={async () => { try { qc.setQueryData(PARTY_KEY, await api.travelGroupDecline(i.group_id)); } catch (e) { toast.error(toGameError(e).message); } }}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function StartParty({ setTab }: { setTab(t: PartyTab): void }) {
  const qc = useQueryClient();
  const join = usePartyJoin();
  const [name, setName] = useState('');
  const [vis, setVis] = useState<PartyVisibility>('public');
  const [act, setAct] = useState<PartyActivity>('hangout');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const create = async () => {
    setBusy('create');
    try {
      qc.setQueryData(PARTY_KEY, await api.partyCreate({ name: name.trim() || null, visibility: vis, activity: act }));
      void qc.invalidateQueries({ queryKey: LOBBIES_KEY });
      buzz('success'); toast.success(vis === 'public' ? 'Your party is live in the lobbies 🎉' : 'Your party is ready — invite people!');
      setTab('invite');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <>
      <OpenToJoin />
      <section className="rainbow-edge rounded-3xl bg-surface-2 p-4" data-testid="party-start">
        <div className="mb-1 font-display text-lg font-bold">🎉 Start a party</div>
        <p className="mb-3 text-[13px] text-muted">Up to 10 players. Take it anywhere — the map, trips (when the leader boards, everyone rides along), arcades, space — and chat the whole way.</p>
        <input className={cn(inputCls, 'mb-3')} placeholder="Party name (optional)" maxLength={28} value={name} onChange={(e) => setName(e.target.value)} data-testid="party-name-input" />
        <div className="mb-3 grid grid-cols-2 gap-2">
          <VisButton on={vis === 'public'} onClick={() => setVis('public')} icon={<Globe2 className="h-4 w-4" />} title="Public" sub="Listed in the lobbies — anyone can join" testid="party-vis-public" />
          <VisButton on={vis === 'private'} onClick={() => setVis('private')} icon={<Lock className="h-4 w-4" />} title="Private" sub="Invite or link only" testid="party-vis-private" />
        </div>
        <ActivityPicker value={act} onChange={setAct} />
        <Button variant="primary" className="mt-3 w-full" loading={busy === 'create'} onClick={() => void create()} data-testid="party-create">Start party</Button>
      </section>
      <div className="flex gap-2">
        <input className={cn(inputCls, 'flex-1 uppercase tracking-widest')} placeholder="Join with a code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} data-testid="party-code-input" />
        <Button variant="secondary" disabled={code.length < 6} loading={busy === 'join'} data-testid="party-code-join" onClick={async () => {
          setBusy('join');
          try { if (await join({ kind: 'code', code })) { buzz('success'); toast.success('You’re in the party 🎉'); setCode(''); } }
          catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
        }}>Join</Button>
      </div>
      <button className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2/50 p-3 text-sm font-bold hover:border-line-strong" onClick={() => setTab('lobbies')} data-testid="party-to-lobbies">
        <Users className="h-4 w-4 text-accent-2" /> Or jump into a lobby and meet new people
      </button>
    </>
  );
}

/** on your own: open to being joined (anyone online can team up with you — a party forms), or private */
function OpenToJoin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['privacy'], queryFn: api.myPrivacy, staleTime: 30_000 });
  const [busy, setBusy] = useState(false);
  if (!q.data) return null;
  const open = q.data.joinable !== false;
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border p-3', open ? 'border-ok/40 bg-ok/10' : 'border-line bg-surface-2/50')} data-testid="open-to-join">
      <span className="text-xl" aria-hidden>{open ? '🟢' : '🔒'}</span>
      <div className="min-w-0 flex-1 text-[12.5px]">
        <b>{open ? 'You’re open to team up' : 'You’re playing privately'}</b>
        <div className="text-muted">{open ? 'Anyone online can join you — a party forms the moment they do.' : 'Nobody can join you unless you invite them.'}</div>
      </div>
      <Button size="sm" variant="secondary" loading={busy} data-testid="open-to-join-toggle" onClick={async () => {
        setBusy(true);
        try { qc.setQueryData(['privacy'], await api.setPrivacy({ joinable: !open })); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
      }}>{open ? <><Lock className="h-4 w-4" /> Go private</> : <><Globe2 className="h-4 w-4" /> Open up</>}</Button>
    </div>
  );
}

function VisButton({ on, onClick, icon, title, sub, testid }: { on: boolean; onClick(): void; icon: React.ReactNode; title: string; sub: string; testid: string }) {
  return (
    <button onClick={onClick} data-testid={testid} aria-pressed={on}
      className={cn('rounded-2xl border p-3 text-left transition', on ? 'border-accent bg-accent/15' : 'border-line bg-surface/50 hover:border-line-strong')}>
      <span className="flex items-center gap-1.5 text-sm font-bold">{icon} {title}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted">{sub}</span>
    </button>
  );
}

function ActivityPicker({ value, onChange }: { value: PartyActivity; onChange(a: PartyActivity): void }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="party-activity">
      {ACTIVITY_IDS.map((a) => (
        <button key={a} onClick={() => onChange(a)} aria-pressed={value === a} data-testid={`party-activity-${a}`}
          className={cn('rounded-full border px-2.5 py-1 text-[12px] font-bold', value === a ? 'border-accent bg-accent/20 text-fg' : 'border-line text-muted hover:text-fg')}>
          {ACTIVITIES[a].emoji} {ACTIVITIES[a].label}
        </button>
      ))}
    </div>
  );
}

function MyParty({ g, onDone, setTab }: { g: Group; onDone?(): void; setTab(t: PartyTab): void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, f: () => Promise<PartyState>, ok?: string) => {
    setBusy(key);
    try { qc.setQueryData(PARTY_KEY, await f()); void qc.invalidateQueries({ queryKey: LOBBIES_KEY }); if (ok) toast.success(ok); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const act = activityOf(g.activity);
  const online = g.online ?? g.members.filter((m) => m.online).length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="my-party">
      <section className="relative overflow-hidden rounded-3xl bg-surface-2 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent/20 text-2xl" aria-hidden>{act.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-xl font-bold" data-testid="party-name">{g.name ?? 'Your party'}</h2>
              <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase', g.visibility === 'public' ? 'bg-ok/20 text-ok' : 'bg-surface text-muted')} data-testid="party-visibility">
                {g.visibility === 'public' ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{g.visibility === 'public' ? 'Public' : 'Private'}
              </span>
            </div>
            <div className="mt-0.5 text-[12px] text-muted">{act.label} · <span className="text-ok">🟢 {online} online</span> · {g.members.length}/{g.max}</div>
            {g.note && <div className="mt-1.5 text-[13px]">{g.note}</div>}
          </div>
          {g.leader && <button className="rounded-xl p-2 text-muted hover:bg-surface hover:text-fg" onClick={() => setEdit(true)} aria-label="Party settings" data-testid="party-edit"><Pencil className="h-4 w-4" /></button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => setTab('invite')} disabled={g.members.length >= g.max} data-testid="party-invite-btn"><UserPlus className="h-4 w-4" /> Invite</Button>
          <ShareLinkButtons g={g} />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="eyebrow">In the party</div>
          <div className="text-[11px] text-muted">{g.leader ? 'You lead — when you board a train or plane, everyone rides along.' : 'When the leader boards, you ride along.'}</div>
        </div>
        <div className="grid gap-1.5" data-testid="party-members">
          {g.members.map((m) => <MemberRow key={m.id} m={m} g={g} busy={busy} run={run} onDone={onDone} />)}
          {g.invited.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 opacity-70" data-testid="party-invited">
              <PlayerAvatar p={p} size={32} />
              <span className="min-w-0 flex-1 truncate text-[13px]">@{p.username} <span className="text-muted">· invited</span></span>
              <button className="text-muted hover:text-fg" aria-label={`Cancel invite for @${p.username}`} onClick={() => void run(`u${p.id}`, () => api.partyUninvite(p.id))}><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </section>

      <PartyChatInline />

      <button className="flex items-center gap-1.5 justify-self-start text-[12px] font-bold text-muted hover:text-bad" data-testid="party-leave"
        onClick={async () => { if (await confirm({ title: 'Leave the party?', body: g.leader && g.members.length > 1 ? 'The lead passes to whoever joined next.' : undefined, confirm: 'Leave', danger: true })) void run('leave', api.travelGroupLeave, 'You left the party'); }}>
        <LogOut className="h-3.5 w-3.5" /> Leave the party
      </button>
      {edit && <PartySettings g={g} onClose={() => setEdit(false)} />}
    </div>
  );
}

function MemberRow({ m, g, busy, run, onDone }: { m: TravelGroupMember; g: Group; busy: string | null; run(k: string, f: () => Promise<PartyState>, ok?: string): Promise<void>; onDone?(): void }) {
  const nav = useNavigate();
  const warpTo = useWarpTo();
  const requestFly = useUi((s) => s.requestFly);
  const [menu, setMenu] = useState(false);
  const status = memberStatus(m, m.me ? null : describeWhereabouts(m.now ?? undefined));
  // follow them: into their arcade, to their world, or to where they are on a trip
  const place = m.me ? null : goTarget(m.now);
  const at = memberAt(m, Date.now() + useExplorer.getState().offset);
  const follow = m.me ? null
    : place ? { label: place.label, go: () => { onDone?.(); void goTo(m.id, place.route, nav); } }
    : canWarpTo(m.now ?? undefined, true) ? { label: '⚡ Warp', go: () => { onDone?.(); void warpTo(m); } }
    : at ? { label: <><MapPin className="h-3.5 w-3.5" /> Show</>, go: () => { useExplorer.getState().setFollowing(false); requestFly({ lng: at[0], lat: at[1], zoom: 14 }); onDone?.(); nav('/world'); } }
    : null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2/40 px-2 py-1.5" data-testid="party-member" data-user={m.username}>
      <Link to={`/u/${m.username}`} className="relative shrink-0" onClick={() => onDone?.()}>
        <PlayerAvatar p={m} size={38} />
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg-2)]', m.online ? 'bg-ok' : 'bg-faint')} aria-label={m.online ? 'online' : 'offline'} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-sm font-semibold">@{m.username}{m.me && <span className="text-[11px] font-normal text-muted">(you)</span>}{m.leader && <Crown className="h-3.5 w-3.5 shrink-0 text-gold" aria-label="leader" />}</div>
        <div className="truncate text-[11px] text-muted" data-testid="party-member-status">{status}</div>
      </div>
      {follow && <Button size="sm" variant="secondary" onClick={follow.go} data-testid="party-follow">{follow.label}</Button>}
      {g.leader && !m.me && (
        <div className="relative">
          <button className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-fg" aria-label={`Options for @${m.username}`} onClick={() => setMenu((x) => !x)} data-testid="party-member-menu">⋯</button>
          {menu && (
            <div className="absolute right-0 top-full z-10 mt-1 grid w-40 gap-0.5 rounded-xl border border-line bg-[var(--bg-2)] p-1 text-[13px] shadow-xl">
              <button className="rounded-lg px-2 py-1.5 text-left hover:bg-surface-2" disabled={!!busy} onClick={() => { setMenu(false); void run(`p${m.id}`, () => api.partyPromote(m.id), `@${m.username} leads the party now`); }} data-testid="party-promote"><Crown className="mr-1 inline h-3.5 w-3.5 text-gold" /> Make leader</button>
              <button className="rounded-lg px-2 py-1.5 text-left text-bad hover:bg-surface-2" disabled={!!busy} onClick={() => { setMenu(false); void run(`k${m.id}`, () => api.travelGroupKick(m.id)); }} data-testid="party-kick"><X className="mr-1 inline h-3.5 w-3.5" /> Remove</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PartySettings({ g, onClose }: { g: Group; onClose(): void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(g.custom_name ?? '');
  const [note, setNote] = useState(g.note ?? '');
  const [vis, setVis] = useState<PartyVisibility>(g.visibility ?? 'private');
  const [act, setAct] = useState<PartyActivity>(g.activity ?? 'hangout');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      qc.setQueryData(PARTY_KEY, await api.partyUpdate({ name: name.trim(), note: note.trim(), visibility: vis, activity: act }));
      void qc.invalidateQueries({ queryKey: LOBBIES_KEY });
      toast.success('Party updated'); onClose();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Party settings" description="Only the leader can change these."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()} data-testid="party-save">Save</Button></>}>
      <div className="grid gap-3" data-testid="party-settings">
        <input className={inputCls} placeholder={`${g.members.find((m) => m.leader)?.username ?? 'Your'}'s party`} maxLength={28} value={name} onChange={(e) => setName(e.target.value)} data-testid="party-settings-name" />
        <input className={inputCls} placeholder="A note for the lobby (optional)" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} data-testid="party-settings-note" />
        <div className="grid grid-cols-2 gap-2">
          <VisButton on={vis === 'public'} onClick={() => setVis('public')} icon={<Globe2 className="h-4 w-4" />} title="Public" sub="Listed in the lobbies — anyone can join" testid="party-settings-public" />
          <VisButton on={vis === 'private'} onClick={() => setVis('private')} icon={<Lock className="h-4 w-4" />} title="Private" sub="Invite or link only" testid="party-settings-private" />
        </div>
        <ActivityPicker value={act} onChange={setAct} />
      </div>
    </Dialog>
  );
}

function ShareLinkButtons({ g }: { g: Group }) {
  const [copied, setCopied] = useState(false);
  const link = partyLink(g.code, g.ref);
  const text = `Come play LANDVAS with me — join my party “${g.name ?? 'party'}”:`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked */ }
    setCopied(true); toast('Party link copied'); setTimeout(() => setCopied(false), 1800);
  };
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => void copy()} data-testid="party-copy-link">{copied ? <Check className="h-4 w-4 text-ok" /> : <Link2 className="h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}</Button>
      <Button size="sm" variant="secondary" data-testid="party-share" onClick={async () => {
        try { if (navigator.share) await navigator.share({ title: 'Join my LANDVAS party', text, url: link }); else await copy(); }
        catch { /* cancelled */ }
      }}><Share2 className="h-4 w-4" /> Share</Button>
      <span className="flex h-8 items-center rounded-xl border border-dashed border-line-strong px-2.5 font-mono text-[12px] font-bold tracking-[0.2em] text-muted" title="Party code" data-testid="party-code">{g.code}</span>
    </>
  );
}

/** the party's chat, in full (on the Party page and sheet) */
function PartyChatInline() {
  const me = useOnboardedMe();
  const chat = usePartyChat();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { chat.setOpen(true); return () => chat.setOpen(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [chat.msgs.length]);
  const submit = async () => {
    const b = text.trim(); if (!b || busy) return;
    setBusy(true);
    try { await chat.send(b); setText(''); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface/40" data-testid="party-chat">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted"><MessageCircle className="h-3.5 w-3.5" /> Party chat <span className="font-semibold normal-case tracking-normal text-faint">· goes with you on the map and in arcades</span></div>
      <div ref={list} className="grid max-h-64 min-h-[96px] content-start gap-1 overflow-y-auto px-4 py-3 text-[13.5px] scroll-thin" data-testid="party-chat-log">
        {!chat.msgs.length && <div className="py-4 text-center text-xs text-muted">Say hi to your party 👋</div>}
        {chat.msgs.map((m) => <ChatLine key={m.id} m={m} mine={m.player.id === me?.user_id} dark={false} />)}
      </div>
      <form className="flex items-center gap-2 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} maxLength={200} placeholder="Message your party…" enterKeyHint="send" className={cn(inputCls, 'h-10 flex-1')} data-testid="party-chat-input" />
        <Button type="submit" variant="primary" size="icon" disabled={!text.trim()} loading={busy} aria-label="Send" data-testid="party-chat-send"><Send className="h-4 w-4" /></Button>
      </form>
    </section>
  );
}

// ---- inviting -----------------------------------------------------------------------------------------------------
export function InvitePanel() {
  const party = useParty();
  const qc = useQueryClient();
  const g = party.data?.group ?? null;
  const [query, setQuery] = useState('');
  const [deb, setDeb] = useState('');
  useEffect(() => { const t = setTimeout(() => setDeb(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  const targets = useQuery({ queryKey: ['party-targets', deb], queryFn: () => api.partyInviteTargets(deb), refetchInterval: 30_000, staleTime: 5_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const invite = async (p: PartyTarget) => {
    setBusy(p.id);
    try {
      qc.setQueryData(PARTY_KEY, await api.partyInvite(p.id));
      buzz('light'); toast.success(`Invited @${p.username} 🎉`);
      void targets.refetch();
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const t = targets.data;
  const searching = deb.length >= 2;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="party-invite-panel">
      {/* the link: for anyone — a friend who isn't on LANDVAS yet included */}
      <section className="rainbow-edge rounded-3xl bg-surface-2 p-4" data-testid="party-link">
        <div className="mb-1 flex items-center gap-2 font-bold"><Link2 className="h-4 w-4 text-accent-2" /> Invite with a link</div>
        <p className="mb-3 text-[12.5px] text-muted">Works for anyone — even someone who hasn’t joined LANDVAS yet. They sign up free, land right in your party, and count as your invite.</p>
        {g ? (
          <>
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg/40 px-3 py-2">
              <span className="min-w-0 flex-1 select-all truncate font-mono text-[12.5px] text-muted" data-testid="party-link-url">{partyLink(g.code, g.ref)}</span>
            </div>
            <div className="flex flex-wrap gap-2"><ShareLinkButtons g={g} /><ShareApps g={g} /></div>
          </>
        ) : (
          <Button variant="primary" loading={creating} data-testid="party-make-link" onClick={async () => {
            setCreating(true);
            try { qc.setQueryData(PARTY_KEY, await api.partyCreate({})); toast.success('Your party is ready — share the link!'); }
            catch (e) { toast.error(toGameError(e).message); } finally { setCreating(false); }
          }}><Link2 className="h-4 w-4" /> Make my party link</Button>
        )}
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input className={cn(inputCls, 'pl-9')} placeholder="Find a player by name" value={query} onChange={(e) => setQuery(e.target.value.replace(/^@/, ''))} data-testid="party-search" />
      </div>
      {!g && <p className="-mt-2 text-[12px] text-muted">Not in a party yet? Inviting someone starts one for you.</p>}
      {!t ? <div className="flex justify-center py-6"><Spinner /></div> : (
        <>
          {searching && <TargetList title="Players" items={t.search} empty={`Nobody called “${deb}”.`} busy={busy} onInvite={invite} testid="party-targets-search" />}
          <TargetList title="Friends" items={t.friends} empty={searching ? 'No friends by that name.' : 'Add friends from their profile or the Players page — they show up here.'} busy={busy} onInvite={invite} testid="party-targets-friends" />
          <TargetList title={<>Online now <span className="ml-1 font-semibold normal-case tracking-normal text-ok">· {t.online_count} playing</span></>} items={t.online}
            empty={searching ? 'Nobody online by that name.' : 'Nobody else is online right now — share your link!'} busy={busy} onInvite={invite} testid="party-targets-online" />
        </>
      )}
    </div>
  );
}

function ShareApps({ g }: { g: Group }) {
  const link = partyLink(g.code, g.ref);
  const text = `Come play LANDVAS with me — join my party “${g.name ?? 'party'}”: ${link}`;
  const enc = encodeURIComponent;
  const apps = [
    { label: 'Text', href: `sms:?&body=${enc(text)}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc(text)}` },
  ];
  return <>{apps.map((a) => <a key={a.label} href={a.href} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-xl border border-line px-3 text-[13px] font-semibold hover:border-line-strong">{a.label}</a>)}</>;
}

function TargetList({ title, items, empty, busy, onInvite, testid }: { title: React.ReactNode; items: PartyTarget[]; empty: string; busy: string | null; onInvite(p: PartyTarget): void; testid: string }) {
  return (
    <section data-testid={testid}>
      <div className="eyebrow mb-2">{title}</div>
      {!items.length ? <p className="rounded-2xl bg-surface-2/40 px-3 py-3 text-[12.5px] text-muted">{empty}</p> : (
        <div className="grid gap-1.5">
          {items.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-2/40 px-2 py-1.5" data-testid="party-target" data-user={p.username}>
              <Link to={`/u/${p.username}`} className="relative shrink-0">
                <PlayerAvatar p={p} size={36} />
                {p.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg-2)] bg-ok" />}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">@{p.username}{p.friend && <span className="ml-1 text-[10px] font-bold text-accent-2">FRIEND</span>}</div>
                <div className="truncate text-[11px] text-muted">{(p.friend && describeWhereabouts(p.now)) || (p.online ? '🟢 online' : 'offline')}{p.busy ? ' · in a party' : ''}</div>
              </div>
              {p.in_party ? <span className="text-[12px] font-bold text-ok">In your party</span>
                : p.invited ? <span className="flex items-center gap-1 text-[12px] font-bold text-muted"><Check className="h-3.5 w-3.5" /> Invited</span>
                : p.friends_only && !p.friend ? <span className="text-[11px] text-faint">Friends only</span>
                : <Button size="sm" variant="primary" loading={busy === p.id} onClick={() => onInvite(p)} data-testid="party-target-invite"><UserPlus className="h-4 w-4" /> Invite</Button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---- the lobbies --------------------------------------------------------------------------------------------------
export function LobbyList({ setTab, onDone }: { setTab(t: PartyTab): void; onDone?(): void }) {
  const nav = useNavigate();
  const [filter, setFilter] = useState<PartyActivity | null>(null);
  const q = useQuery({ queryKey: [...LOBBIES_KEY, filter], queryFn: () => api.partyLobbies(filter), refetchInterval: 15_000, staleTime: 5_000 });
  const party = useParty();
  const qc = useQueryClient();
  const join = usePartyJoin();
  const [busy, setBusy] = useState<string | null>(null);
  const d = q.data;
  const startPublic = async () => {
    setBusy('start');
    try {
      if (party.data?.group?.leader) qc.setQueryData(PARTY_KEY, await api.partyUpdate({ visibility: 'public', activity: filter ?? undefined }));
      else qc.setQueryData(PARTY_KEY, await api.partyCreate({ visibility: 'public', activity: filter ?? 'hangout' }));
      void q.refetch(); toast.success('Your party is live in the lobbies 🎉');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  // a game waiting for players: team up with its host (if you're not in a party), go there, and sit down at it
  const joinLfg = async (it: LfgItem) => {
    setBusy(`lfg:${it.id}`);
    try {
      if (!party.data?.group) await api.partyJoinPlayer(it.host.id).then((r) => qc.setQueryData(PARTY_KEY, r)).catch(() => null);
      useAutoJoin.getState().set(it.id);
      buzz('success');
      onDone?.();
      await goTo(it.host.id, it.route, nav);
    } finally { setBusy(null); }
  };
  // someone on their own: a party forms around them
  const joinPlayer = async (p: JoinablePlayer) => {
    setBusy(`p:${p.id}`);
    try { if (await join({ kind: 'player', id: p.id }, `@${p.username}`)) { buzz('success'); toast.success(`You teamed up with @${p.username} 🎉`); setTab('party'); } }
    catch (e) { toast.error(toGameError(e).message); void q.refetch(); } finally { setBusy(null); }
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3" data-testid="party-lobbies">
      {(d?.lfg?.length ?? 0) > 0 && (
        <section className="grid grid-cols-[minmax(0,1fr)] gap-1.5" data-testid="lfg">
          <div className="eyebrow flex items-center gap-1.5"><span className="lv-live"><i /></span> Looking for players · {d!.lfg!.length}</div>
          {d!.lfg!.map((it) => <LfgCard key={it.id} it={it} busy={busy === `lfg:${it.id}`} onJoin={() => void joinLfg(it)} />)}
        </section>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] text-muted"><span className="lv-live"><i /> Live</span> Public parties with people online, busiest first{d ? <> · <b className="text-ok">{d.online_count}</b> playing now</> : null}</div>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" data-testid="lobby-filters">
        <FilterChip on={filter === null} onClick={() => setFilter(null)}>All</FilterChip>
        {ACTIVITY_IDS.map((a) => <FilterChip key={a} on={filter === a} onClick={() => setFilter(a)}>{ACTIVITIES[a].emoji} {ACTIVITIES[a].label}</FilterChip>)}
      </div>
      {!d ? <div className="flex justify-center py-10"><Spinner /></div> : !d.lobbies.length ? (
        <Empty icon={<Users className="h-6 w-6" />} title="No live lobbies right now"
          action={!party.data?.group || party.data.group.leader ? <Button variant="primary" loading={busy === 'start'} onClick={() => void startPublic()} data-testid="lobby-start">{party.data?.group ? 'Make my party public' : 'Start a public party'}</Button> : undefined}>
          Start one and it shows up here for everyone who’s online.
        </Empty>
      ) : (
        <AnimatePresence initial={false}>
          {d.lobbies.map((l, i) => (
            <motion.div key={l.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
              <LobbyCard l={l} busy={busy === l.id} onJoin={async () => {
                if (l.mine) { setTab('party'); return; }
                setBusy(l.id);
                try { if (await join({ kind: 'public', id: l.id }, l.name)) { buzz('success'); toast.success(`You’re in “${l.name}” 🎉`); setTab('party'); } }
                catch (e) { toast.error(toGameError(e).message); void q.refetch(); } finally { setBusy(null); }
              }} />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
      {(d?.players?.length ?? 0) > 0 && (
        <section className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-1.5" data-testid="lobby-players">
          <div className="eyebrow">🟢 On their own — team up · {d!.players!.length}</div>
          {d!.players!.map((p) => {
            const place = goTarget(p.now);
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-2/40 px-2 py-1.5" data-testid="lobby-player" data-user={p.username}>
                <Link to={`/u/${p.username}`} className="relative shrink-0" onClick={() => onDone?.()}>
                  <PlayerAvatar p={p} size={36} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg-2)] bg-ok" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">@{p.username}{p.friend && <span className="ml-1 text-[10px] font-bold text-accent-2">FRIEND</span>}</div>
                  <div className="truncate text-[11px] text-muted">{describeWhereabouts(p.now ?? undefined) ?? '🟢 online'}</div>
                </div>
                {place && <Button size="sm" variant="secondary" onClick={() => { onDone?.(); void goTo(p.id, place.route, nav); }} data-testid="lobby-player-go">{place.label.replace('Join', 'Go')}</Button>}
                <Button size="sm" variant="primary" loading={busy === `p:${p.id}`} onClick={() => void joinPlayer(p)} data-testid="lobby-player-join"><Users className="h-4 w-4" /> Team up</Button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

const LFG_KIND: Record<LfgItem['kind'], string> = { home: '🏠', arcade: '🕹️', arena: '🏟️' };
function LfgCard({ it, busy, onJoin }: { it: LfgItem; busy: boolean; onJoin(): void }) {
  const open = Math.max(0, it.max - it.players);
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-ok/40 bg-ok/10 p-2.5" data-testid="lfg-item" data-kind={it.kind}>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface text-2xl" aria-hidden>{it.emoji ?? LFG_KIND[it.kind]}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold"><b>{it.title}</b> <span className="font-semibold text-muted">· @{it.host.username}</span></div>
        <div className="truncate text-[12px] text-muted">{LFG_KIND[it.kind]} {it.where} · {it.players}/{it.max} · <span className="font-bold text-ok">{open} seat{open === 1 ? '' : 's'} open</span> · {timeAgo(it.at)}</div>
      </div>
      <Button size="sm" variant="rainbow" loading={busy} onClick={onJoin} data-testid="lfg-join">Join</Button>
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick(): void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-pressed={on} className={cn('shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold', on ? 'border-accent bg-accent/20 text-fg' : 'border-line text-muted hover:text-fg')}>{children}</button>;
}

function LobbyCard({ l, busy, onJoin }: { l: PartyLobby; busy: boolean; onJoin(): void }) {
  const act = activityOf(l.activity);
  const shown = l.members.slice(0, 6);
  return (
    <div className={cn('flex items-center gap-3 rounded-3xl border bg-surface-2/60 p-3', l.mine ? 'border-accent/60' : 'border-line')} data-testid="lobby" data-name={l.name}>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface text-2xl" aria-hidden>{act.emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-bold" data-testid="lobby-name">{l.name}</span>
          {l.friends > 0 && <span className="shrink-0 rounded-full bg-accent/20 px-1.5 text-[10px] font-black text-accent-2">{l.friends} {l.friends === 1 ? 'friend' : 'friends'}</span>}
        </div>
        <div className="text-[12px] text-muted"><span className="font-bold text-ok" data-testid="lobby-online">🟢 {l.online} online</span> · {l.size}/{l.max} · {act.label}</div>
        {l.note && <div className="truncate text-[12px]">{l.note}</div>}
        <div className="mt-1.5 flex -space-x-2">
          {shown.map((m) => (
            <span key={m.id} className="relative" title={`@${m.username}${m.leader ? ' (leader)' : ''}`}>
              <PlayerAvatar p={m} size={24} className="ring-2 ring-[var(--bg-2)]" />
              {m.online && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-ok ring-1 ring-[var(--bg-2)]" />}
            </span>
          ))}
          {l.size > shown.length && <span className="grid h-6 w-6 place-items-center rounded-full bg-surface text-[10px] font-bold ring-2 ring-[var(--bg-2)]">+{l.size - shown.length}</span>}
        </div>
      </div>
      <Button size="sm" variant={l.mine ? 'secondary' : 'primary'} disabled={l.full && !l.mine} loading={busy} onClick={onJoin} data-testid="lobby-join">
        {l.mine ? 'Yours' : l.full ? 'Full' : 'Join'}
      </Button>
    </div>
  );
}

// ---- an invite link, opened -------------------------------------------------------------------------------------------
export function PartyLinkCard({ code }: { code: string }) {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const join = usePartyJoin();
  const q = useQuery({ queryKey: ['party-preview', code], queryFn: () => api.partyPreview(code), staleTime: 10_000, refetchInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const p: PartyPreview | null | undefined = q.data;
  const act = useMemo(() => activityOf(p?.activity), [p?.activity]);
  if (q.isLoading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!p) return <Empty icon={<Users className="h-6 w-6" />} title="That party isn’t around any more">Ask for a new link — or find a lobby below.</Empty>;
  const full = p.size >= p.max && !p.mine;
  return (
    <section className="rainbow-edge mb-6 overflow-hidden rounded-3xl bg-surface-2 p-5 text-center" data-testid="party-link-card">
      <div className="mx-auto mb-2 grid h-16 w-16 place-items-center rounded-3xl bg-accent/20 text-4xl">{act.emoji}</div>
      <div className="text-[12px] font-bold uppercase tracking-wider text-muted">@{p.leader.username} invited you to</div>
      <h2 className="mt-1 font-display text-2xl font-black" data-testid="party-link-name">{p.name}</h2>
      <div className="mt-1 text-[13px] text-muted">{act.label} · <span className="text-ok">🟢 {p.online} online</span> · {p.size}/{p.max}</div>
      {p.note && <p className="mx-auto mt-2 max-w-sm text-[13px]">{p.note}</p>}
      <div className="mt-3 flex justify-center -space-x-2">{p.members.slice(0, 8).map((m) => <PlayerAvatar key={m.id} p={m} size={34} className="ring-2 ring-[var(--bg-2)]" />)}</div>
      <div className="mt-4 flex justify-center">
        {p.mine ? <Button variant="secondary" onClick={() => nav('/party')}>You’re in — open the party</Button>
          : !me ? (
            <Button variant="rainbow" size="lg" data-testid="party-link-signup" onClick={() => { savePendingParty(p.code); nav(`/welcome?next=${encodeURIComponent(`/party/${p.code}`)}`); }}>Play free & join the party</Button>
          ) : (
            <Button variant="primary" size="lg" disabled={full} loading={busy} data-testid="party-link-join" onClick={async () => {
              setBusy(true);
              try { if (await join({ kind: 'code', code: p.code }, p.name)) { buzz('success'); toast.success(`You’re in “${p.name}” 🎉`); void q.refetch(); nav('/party'); } }
              catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
            }}>{full ? 'This party is full' : 'Join the party'}</Button>
          )}
      </div>
      {!me && <p className="mt-2 text-[12px] text-muted">New here? Make a free account — you’ll land right in the party.</p>}
    </section>
  );
}
