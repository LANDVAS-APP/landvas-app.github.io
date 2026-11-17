// A chat box that sits on a screen (the map, an arcade, a house…): closed, the last few lines float up for a moment and
// a pill shows what's unread; open, one tab per room (Global first, then Party, then the place's own) and a box to type
// in. Enter opens it on a keyboard. Something new in the global chat pops up as a notification (players can mute that).
import { Bell, BellOff, MessageCircle, Send, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlanetChatMsg } from '../backend/types';
import { cn } from '../lib/utils';
import { PlayerAvatar } from '../ui';
import type { RoomChat } from './chat';

export type DockChannel = {
  id: string; label: string; chat: RoomChat; placeholder: string; empty: string; notHere: string;
  /** something new pops up as a notification while you're not reading this tab (the global chat) */ popup?: boolean;
  /** strangers talk here: a line can be reported, or its sender blocked */ report?: boolean;
  /** the longest message this room takes (200) */ maxLength?: number;
};

/** the global chat's tab (first in every chat box; none while staff have the chat switched off) */
export const globalChannel = (chat: RoomChat & { enabled?: boolean }): DockChannel[] => (chat.enabled === false ? [] : [{
  id: 'global', label: 'Global', chat, placeholder: 'Message everyone…', popup: true, report: true,
  empty: 'Everyone playing LANDVAS sees this 🌍 Say hi!', notHere: 'Sign in to chat with everyone.',
}]);
/** your party's tab (while you're in one) */
export const partyChannel = (chat: RoomChat, inParty: boolean): DockChannel[] => (inParty ? [{
  id: 'party', label: 'Party', chat, placeholder: 'Message your party…',
  empty: 'Only your party sees this — wherever they are.', notHere: 'You’re not in a party right now.',
}] : []);

/** how many chat panels outside a dock are showing the global chat right now (the Party sheet): no pop-ups meanwhile */
export const globalReaders = { n: 0 };

// global chat notifications: on unless a player turns them off (on this device)
const POPUPS = 'landvas.chatPopups';
export const chatPopupsOn = () => { try { return localStorage.getItem(POPUPS) !== 'off'; } catch { return true; } };
const setChatPopups = (on: boolean) => { try { localStorage.setItem(POPUPS, on ? 'on' : 'off'); } catch { /* private mode */ } };

/** a global chat line, as a notification at the top (one at a time: a newer one takes its place) */
function popUp(m: PlanetChatMsg, label: string, open: () => void) {
  toast.custom((id) => (
    <button type="button" className="pointer-events-auto flex w-[min(92vw,360px)] items-center gap-2.5 rounded-2xl border border-white/10 bg-[#0B0E24] px-3 py-2 text-left text-white shadow-xl"
      onClick={() => { toast.dismiss(id); open(); }} data-testid="chat-popup">
      <PlayerAvatar p={m.player} size={30} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5 text-[11.5px] font-black">
          <span className="rounded bg-[#7B5CFF]/35 px-1 text-[9px] uppercase tracking-wider text-[#D9CCFF]">{label}</span>
          <span className="truncate" style={{ color: m.player.accent_color ?? '#9FD3FF' }}>@{m.player.username}</span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-white/90" data-testid="chat-popup-body">{m.body}</span>
      </span>
      <MessageCircle className="h-4 w-4 shrink-0 text-white/50" />
    </button>
  ), {
    id: 'lv-chat-popup', duration: 6000,
    // (the card is its own solid panel: none of the usual toast glass around it)
    className: '!bg-transparent !border-0 !shadow-none !p-0 ![backdrop-filter:none] ![-webkit-backdrop-filter:none]',
  });
}
/** a game at a house table: the house's chats come along, and what people say pops up over them in the game */
export type GameTalk = { ref: { current: import('./chat').Talker | null }; channels: DockChannel[]; onInvite?(): void };

export function ChatDock({ channels, myId, className, onInvite, hotkey = true, testid = 'chat-dock', quiet = false }: {
  channels: DockChannel[]; myId?: string; className?: string; onInvite?(): void; hotkey?: boolean; testid?: string;
  /** closed, don't float the last few lines (what people say already pops up over them) */ quiet?: boolean;
}) {
  const [open, setOpenState] = useState(false);
  const [tab, setTab] = useState(channels[0]?.id ?? '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [popups, setPopups] = useState(chatPopupsOn);
  const [menu, setMenu] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ch = channels.find((c) => c.id === tab) ?? channels[0];
  // a channel that went away (you left the party): fall back to the first one
  useEffect(() => { if (channels.length && !channels.some((c) => c.id === tab)) setTab(channels[0].id); }, [channels, tab]);
  const setOpen = (o: boolean) => {
    setOpenState(o);
    for (const c of channels) c.chat.setOpen(o && c.id === (ch?.id ?? ''));
    if (o) setTimeout(() => input.current?.focus(), 50);
  };
  // switching tabs while open marks the new one read
  useEffect(() => { if (open) for (const c of channels) c.chat.setOpen(c.id === ch?.id); }, [open, ch?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 2000); return () => clearInterval(t); }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [ch?.chat.msgs.length, open, tab]);
  // something new in a pop-up channel (the global chat) while you're not reading it: a notification at the top. The
  // backlog when you arrive doesn't pop up (only what comes after the first look)
  const popSeen = useRef<Record<string, number>>({});
  const live = useRef({ open, tab }); live.current = { open, tab };
  const openRef = useRef<(id: string) => void>(() => {});
  openRef.current = (id) => { setTab(id); setOpen(true); };
  useEffect(() => {
    for (const c of channels) {
      if (!c.popup) continue;
      const top = c.chat.msgs.length ? c.chat.msgs[c.chat.msgs.length - 1].id : 0;
      const seen = popSeen.current[c.id];
      if (seen === undefined) { if (c.chat.ready) popSeen.current[c.id] = top; continue; }
      if (top <= seen) continue;
      popSeen.current[c.id] = top;
      if ((live.current.open && live.current.tab === c.id) || globalReaders.n > 0 || !chatPopupsOn()) continue;
      const m = [...c.chat.msgs].reverse().find((x) => x.id > seen && x.player.id !== myId && (x.kind ?? 'chat') === 'chat' && !hidden.has(x.player.id));
      if (m) popUp(m, c.label, () => openRef.current(c.id));
    }
  });
  useEffect(() => {
    if (open || !hotkey) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) return;
      if (document.querySelector('[role=dialog]')) return;
      e.preventDefault(); setOpen(true);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  if (!ch) return null;
  const submit = async () => {
    const b = text.trim(); if (!b || busy) return;
    setBusy(true);
    try { await ch.chat.send(b); setText(''); }
    catch (e) { const err = toGameError(e); toast.error(err.code === 'not_in_group' || err.code === 'not_in_arcade' ? ch.notHere : err.message); }
    finally { setBusy(false); input.current?.focus(); }
  };
  const unread = channels.reduce((n, c) => n + c.chat.unread, 0);
  // closed: the last few lines (from the rooms here; the global chat pops up at the top instead) float on screen a while
  const recent = quiet ? [] : channels.filter((c) => !c.popup).flatMap((c) => c.chat.msgs.filter((m) => (m.kind ?? 'chat') === 'chat' && now - new Date(m.at).getTime() < 15000).map((m) => ({ m, c })))
    .sort((a, b) => new Date(a.m.at).getTime() - new Date(b.m.at).getTime()).slice(-3);
  return (
    <div className={cn('pointer-events-none flex w-[min(72vw,310px)] flex-col items-start gap-1.5', className)} data-testid={testid}>
      {open ? (
        <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0B0E24]/90 text-white shadow-xl">
          <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
            <MessageCircle className="mx-1 h-3.5 w-3.5 shrink-0 text-white/60" />
            {channels.map((c) => (
              <button key={c.id} onClick={() => setTab(c.id)} data-testid={`${testid}-tab-${c.id}`}
                className={cn('relative rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider', c.id === ch.id ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white')}>
                {c.label}
                {c.id !== ch.id && c.chat.unread > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-hot" />}
              </button>
            ))}
            <span className="flex-1" />
            {ch.popup && (
              <button className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white" data-testid={`${testid}-popups`} aria-pressed={popups}
                aria-label={popups ? 'Turn off pop-ups for new messages' : 'Turn on pop-ups for new messages'}
                onClick={() => { const on = !popups; setPopups(on); setChatPopups(on); toast(on ? `🔔 New ${ch.label.toLowerCase()} messages pop up` : `🔕 No pop-ups for ${ch.label.toLowerCase()} messages`, { duration: 1800 }); }}>
                {popups ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </button>
            )}
            {onInvite && <button className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white" onClick={onInvite} aria-label="Invite to your party" data-testid={`${testid}-invite`}><UserPlus className="h-4 w-4" /></button>}
            <button className="rounded-lg p-1 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close chat" data-testid={`${testid}-close`}><X className="h-4 w-4" /></button>
          </div>
          <div ref={list} className="grid max-h-44 gap-1 overflow-y-auto px-3 py-2 text-[13px] scroll-thin" data-testid={`${testid}-log`}>
            {!ch.chat.msgs.length && <div className="py-2 text-center text-xs text-white/55">{ch.empty}</div>}
            {ch.chat.msgs.filter((m) => !hidden.has(m.player.id)).map((m) => {
              const mine = m.player.id === myId;
              if (!ch.report || mine || (m.kind ?? 'chat') !== 'chat') return <ChatLine key={m.id} m={m} mine={mine} />;
              // strangers: tap a line to see their profile, report it or block them
              return <StrangerLine key={m.id} m={m} open={menu === m.id} onTap={() => setMenu(menu === m.id ? null : m.id)} testid={testid}
                onDone={() => setMenu(null)} onLeave={() => setOpen(false)} onBlocked={(id) => setHidden((h) => new Set(h).add(id))} />;
            })}
          </div>
          <form className="flex items-center gap-1.5 border-t border-white/10 p-1.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value.slice(0, ch.maxLength ?? 200))} maxLength={ch.maxLength ?? 200} placeholder={ch.placeholder} enterKeyHint="send"
              className="h-9 min-w-0 flex-1 rounded-xl bg-white/10 px-3 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-[#7B5CFF]" data-testid={`${testid}-input`}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setOpen(false);
                // Enter on an empty box closes the chat (and hands the keys back)
                if (e.key === 'Enter' && !text.trim()) { e.preventDefault(); setOpen(false); input.current?.blur(); }
              }} onKeyUp={(e) => e.stopPropagation()} />
            <button type="submit" disabled={!text.trim() || busy} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7B5CFF] disabled:opacity-40" aria-label="Send" data-testid={`${testid}-send`}><Send className="h-4 w-4" /></button>
          </form>
        </div>
      ) : (
        <>
          {recent.map(({ m, c }) => (
            <div key={`${c.id}:${m.id}`} className="max-w-full rounded-2xl bg-[#0B0E24]/80 px-2.5 py-1 text-[12px] text-white animate-[lv-fade-in_.25s_ease-out]">
              {channels.length > 1 && <span className="mr-1 rounded bg-white/15 px-1 text-[9px] font-black uppercase">{c.label}</span>}<ChatLine m={m} mine={m.player.id === myId} />
            </div>
          ))}
          <button className="pointer-events-auto relative flex items-center gap-1.5 rounded-full bg-[#0B0E24]/85 px-3 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-[#0B0E24]" onClick={() => setOpen(true)} data-testid={`${testid}-open`}>
            <MessageCircle className="h-4 w-4" /> {channels.map((c) => c.label).join(' · ')}
            {hotkey && <span className="hidden rounded bg-white/15 px-1 text-[9px] font-semibold text-white/70 sm:inline">Enter</span>}
            {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-hot px-1 text-center text-[10px] leading-[18px] text-white tnum" data-testid={`${testid}-unread`}>{unread > 9 ? '9+' : unread}</span>}
          </button>
        </>
      )}
    </div>
  );
}

/** a line from someone else in a chat with strangers (the global chat): tap it for their profile, Report or Block */
export function StrangerLine({ m, open, onTap, onDone, onLeave, onBlocked, testid, dark = true }: {
  m: PlanetChatMsg; open: boolean; onTap(): void; onDone(): void; onLeave?(): void; onBlocked(id: string): void; testid: string; dark?: boolean;
}) {
  const nav = useNavigate();
  const chip = dark ? 'bg-white/10 hover:bg-white/20' : 'bg-surface-2 hover:bg-surface-3';
  return (
    <div>
      <button type="button" className={cn('w-full rounded-md text-left', dark ? 'hover:bg-white/5' : 'hover:bg-surface-2/60')} onClick={onTap} data-testid={`${testid}-line`}><ChatLine m={m} mine={false} dark={dark} /></button>
      {open && (
        <div className="mt-0.5 flex gap-1 pb-1 text-[11px] font-bold" data-testid={`${testid}-line-menu`}>
          <button className={cn('rounded-lg px-2 py-0.5', chip)} onClick={() => { onDone(); onLeave?.(); nav(`/u/${m.player.username}`); }}>Profile</button>
          <button className={cn('rounded-lg px-2 py-0.5', chip)} data-testid={`${testid}-report`} onClick={async () => {
            onDone();
            try { await api.reportChat(m.id, 'inappropriate'); toast.success('Thanks — a moderator will take a look'); } catch (e) { toast.error(toGameError(e).message); }
          }}>Report</button>
          <button className="rounded-lg bg-[#FF3D6E]/25 px-2 py-0.5 text-[#FF3D6E] hover:bg-[#FF3D6E]/40" data-testid={`${testid}-block`} onClick={async () => {
            onDone();
            try { await api.blockPlayer(m.player.id, true); onBlocked(m.player.id); toast.success(`@${m.player.username} is blocked — you won’t see them any more`); } catch (e) { toast.error(toGameError(e).message); }
          }}>Block</button>
        </div>
      )}
    </div>
  );
}

export function ChatLine({ m, mine, dark = true }: { m: PlanetChatMsg; mine: boolean; dark?: boolean }) {
  const who = mine ? 'You' : `@${m.player.username}`;
  if (m.kind === 'join' || m.kind === 'leave') {
    return <div className={cn('text-[12px] italic', dark ? 'text-white/55' : 'text-muted')} data-testid="chat-line-system">{m.kind === 'join' ? '👋' : '🚪'} {who} {m.body}</div>;
  }
  return (
    <div className="break-words" data-testid="chat-line">
      <b style={{ color: mine ? (dark ? '#FFE36B' : 'var(--gold)') : m.player.accent_color ?? '#9FD3FF' }}>{who}</b>{' '}
      <span className={dark ? 'text-white/90' : 'text-fg'}>{m.body}</span>
    </div>
  );
}
